import { supabase, VAPID_PUBLIC_KEY } from "./supabase.js";
import { loadStorage, saveStorage } from "./storage.js";
import { logError } from "./logger.js";

const NOTIF_STORAGE_KEY = "vram-notifs";

export const INSTALLATION_STORAGE_KEY = "vram-installation-id";

export const DEFAULT_NOTIF_SETTINGS = {
  enabled: false,
  periodEnd: true,
  lunchEnd: true,
  upcoming: true,
};

export let notifSettings = loadNotifSettings();
let notificationSubscriptionId = null;

function loadNotifSettings() {
  try {
    return {
      ...DEFAULT_NOTIF_SETTINGS,
      ...(JSON.parse(loadStorage(NOTIF_STORAGE_KEY)) || {}),
    };
  } catch {
    return { ...DEFAULT_NOTIF_SETTINGS };
  }
}

export function saveNotifSettings() {
  saveStorage(NOTIF_STORAGE_KEY, JSON.stringify(notifSettings));

  return syncNotificationPreferences().catch((error) => {
    logError("Failed to sync notification preferences.", error);
  });
}

export function notificationsSupported() {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : "denied";
}

export async function requestNotificationPermission() {
  try {
    return await Notification.requestPermission();
  } catch (error) {
    logError("Failed to request notification permission.", error);
    return "denied";
  }
}

async function getServiceWorkerRegistration() {
  try {
    return await navigator.serviceWorker.getRegistration();
  } catch {
    return null;
  }
}

function getInstallationId() {
  try {
    let id = loadStorage(INSTALLATION_STORAGE_KEY);

    if (!id) {
      id = crypto.randomUUID();
      saveStorage(INSTALLATION_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);

  return Uint8Array.from(
    atob((value + padding).replace(/-/g, "+").replace(/_/g, "/")),
    (character) => character.charCodeAt(0)
  );
}

async function getPushSubscription() {
  const registration = await getServiceWorkerRegistration();
  if (!registration || !VAPID_PUBLIC_KEY) return null;
  const existing = await registration.pushManager.getSubscription();

  return (
    existing ||
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  );
}

async function syncNotificationPreferences() {
  if (!supabase || !notificationSubscriptionId) return;

  const { error } = await supabase.rpc("update_notification_preferences", {
    p_subscription_id: notificationSubscriptionId,
    p_enabled: notifSettings.enabled,
    p_period_end: notifSettings.periodEnd,
    p_lunch_end: notifSettings.lunchEnd,
    p_upcoming: notifSettings.upcoming,
  });

  if (error) throw error;
}

async function savePushSubscription(subscription = null) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const pushSubscription = subscription || (await getPushSubscription());
  if (!pushSubscription) throw new Error("Push notifications are not supported here.");

  const { endpoint, keys } = pushSubscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error("Invalid push subscription.");

  const { data, error } = await supabase.rpc("upsert_push_subscription", {
    p_installation_id: getInstallationId(),
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  });

  if (error) {
    logError("Failed to save push subscription.", error);
    throw error;
  }

  notificationSubscriptionId = data;
  await syncNotificationPreferences();
}

export async function restorePushSubscription() {
  if (!supabase || notificationPermission() !== "granted") return;
  const registration = await getServiceWorkerRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) await savePushSubscription(subscription);
}

export async function enableNotifications() {
  if (notificationPermission() !== "granted") {
    if ((await requestNotificationPermission()) !== "granted") return false;
  }

  await savePushSubscription();
  notifSettings.enabled = true;
  saveNotifSettings();
  return true;
}

export function disableNotifications() {
  notifSettings.enabled = false;
  saveNotifSettings();
}

export async function resetNotificationSettings() {
  notifSettings = { ...DEFAULT_NOTIF_SETTINGS };

  try {
    await saveNotifSettings();
  } catch {
    // no error handling here
  }
}
