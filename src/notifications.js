import { logError } from "./logger.js";
import { getLunchChoicesByScheduleCode } from "./lunchChoice.js";
import { loadStorage, saveStorage } from "./storage.js";
import { supabase, VAPID_PUBLIC_KEY } from "./supabase.js";

const NOTIF_STORAGE_KEY = "vram-notifs";

export const INSTALLATION_STORAGE_KEY = "vram-installation-id";

export const DEFAULT_NOTIF_SETTINGS = {
  enabled: false,
  periodEnd: true,
  lunchEnd: true,
  upcoming: true,
};

export let notifSettings = loadNotifSettings();

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

function getInstallationToken() {
  try {
    let token = loadStorage(INSTALLATION_STORAGE_KEY);

    if (!token) {
      token = crypto.randomUUID();
      saveStorage(INSTALLATION_STORAGE_KEY, token);
    }

    return token;
  } catch {
    return crypto.randomUUID();
  }
}

export function saveNotifSettings() {
  saveStorage(NOTIF_STORAGE_KEY, JSON.stringify(notifSettings));

  return syncNotificationPreferences().catch((error) => {
    logError("Failed to sync notification preferences.", error);
  });
}

export async function syncNotificationPreferences() {
  if (!supabase) return;

  const { error } = await supabase.rpc("save_notification_settings", {
    p_token: getInstallationToken(),
    p_enabled: notifSettings.enabled,
    p_period_end: notifSettings.periodEnd,
    p_lunch_end: notifSettings.lunchEnd,
    p_upcoming: notifSettings.upcoming,
    p_lunch_choices: getLunchChoicesByScheduleCode(),
  });

  if (error) throw error;
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

async function registerPushSubscription(subscription = null) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const pushSubscription = subscription || (await getPushSubscription());
  if (!pushSubscription) throw new Error("Push notifications are not supported here.");

  const { endpoint, keys } = pushSubscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error("Invalid push subscription.");

  const { error } = await supabase.rpc("register_push_installation", {
    p_token: getInstallationToken(),
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  });

  if (error) {
    logError("Failed to save push subscription.", error);
    throw error;
  }
}

export async function restorePushSubscription() {
  if (!supabase || notificationPermission() !== "granted") return;

  const registration = await getServiceWorkerRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  if (subscription) await registerPushSubscription(subscription);
}

export async function enableNotifications() {
  if (notificationPermission() !== "granted") {
    if ((await requestNotificationPermission()) !== "granted") return false;
  }

  await registerPushSubscription();
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
