import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push";

const supabaseUrl = requiredEnv("SUPABASE_URL");
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  (() => {
    const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!keys) throw new Error("Missing Supabase secret key");
    const parsed = JSON.parse(keys);
    return parsed.default;
  })();
const vapidSubject = requiredEnv("VAPID_SUBJECT");
const vapidPublicKey = requiredEnv("VAPID_PUBLIC_KEY");
const vapidPrivateKey = requiredEnv("VAPID_PRIVATE_KEY");
const cronSecret = requiredEnv("CRON_SECRET");

const supabase = createClient(supabaseUrl, serviceRoleKey);

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const SEND_CONCURRENCY = 25;
const MAX_CLAIMS_PER_RUN = 250;

type PushEvent = {
  event_id: number;
  event_type: "period_end" | "lunch_end" | "upcoming";
  block_name: string;
};

type Claim = {
  installation_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  events: PushEvent[];
};

type DeliveryResult = {
  event_id: number;
  installation_id: string;
  status: "sent" | "failed";
  error: string | null;
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function isExpiredSubscriptionError(error: unknown) {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  return status === 404 || status === 410;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function describe(events: PushEvent[]) {
  const body = events
    .map((event) =>
      event.event_type === "upcoming"
        ? `${event.block_name} ends in 2 minutes`
        : `${event.block_name} ended`
    )
    .join(" · ");

  return {
    title: events.length === 1 ? events[0].block_name : "VRAM schedule",
    body,
  };
}

async function sendPush(
  target: { endpoint: string; p256dh: string; auth: string },
  payload: Record<string, unknown>
) {
  await webpush.sendNotification(
    {
      endpoint: target.endpoint,
      keys: { p256dh: target.p256dh, auth: target.auth },
    },
    JSON.stringify(payload),
    { TTL: 300, urgency: "high" }
  );
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
) {
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });

  await Promise.all(runners);
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sendTestPush(token: string | undefined) {
  if (!token) {
    return json({ error: "A test push needs the installation token from the browser" }, 400);
  }

  const { data, error } = await supabase
    .from("push_installations")
    .select("id, endpoint, p256dh, auth")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.endpoint || !data.p256dh || !data.auth) {
    return json({ error: "That installation has no push subscription" }, 404);
  }

  await sendPush(data as { endpoint: string; p256dh: string; auth: string }, {
    title: "VRAM test notification",
    body: "Push notifications are working!",
    tag: "vram-test-notification",
    url: "/",
  });

  return json({ test: true, sent: 1, installation: data.id });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (request.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    let body: { test?: boolean; token?: string } = {};

    try {
      body = await request.json();
    } catch {
      // The scheduled request may have an empty or malformed body; treat it as a normal run.
    }

    if (body.test === true) {
      return await sendTestPush(body.token);
    }

    const { data: claims, error: claimError } = await supabase.rpc("claim_due_pushes", {
      p_limit: MAX_CLAIMS_PER_RUN,
    });

    if (claimError) {
      throw claimError;
    }

    const rows = (claims ?? []) as Claim[];

    if (rows.length === 0) {
      return json({ claimed: 0, sent: 0, failed: 0 });
    }

    const results: DeliveryResult[] = [];
    const disabled: string[] = [];
    let sent = 0;
    let failed = 0;
    let events = 0;

    await mapWithConcurrency(rows, SEND_CONCURRENCY, async (claim) => {
      const pushEvents = claim.events ?? [];
      events += pushEvents.length;

      try {
        await sendPush(claim, {
          ...describe(pushEvents),
          tag: "vram-schedule",
          url: "/",
        });

        sent += 1;
        for (const event of pushEvents) {
          results.push({
            event_id: event.event_id,
            installation_id: claim.installation_id,
            status: "sent",
            error: null,
          });
        }
      } catch (error) {
        failed += 1;

        for (const event of pushEvents) {
          results.push({
            event_id: event.event_id,
            installation_id: claim.installation_id,
            status: "failed",
            error: errorMessage(error),
          });
        }

        if (isExpiredSubscriptionError(error)) {
          disabled.push(claim.installation_id);
        }
      }
    });

    if (results.length > 0) {
      const { error: finishError } = await supabase.rpc("finish_push_batch", {
        p_results: results,
        p_disabled: disabled,
      });

      if (finishError) {
        throw finishError;
      }
    }

    return json({
      claimed: rows.length,
      events,
      sent,
      failed,
      disabled: disabled.length,
    });
  } catch (error) {
    console.error(error);

    return json({ error: errorMessage(error) }, 500);
  }
});
