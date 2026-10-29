import { loadStorage, saveStorage } from "./storage.js";

const SECRETS_STORAGE_KEY = "vram-secrets";

function loadSecrets() {
  try {
    const parsed = JSON.parse(loadStorage(SECRETS_STORAGE_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let secrets = loadSecrets();

export function isSecretUnlocked(key) {
  return secrets[key] === true;
}

export function unlockSecret(key) {
  if (secrets[key] === true) return false;

  secrets = { ...secrets, [key]: true };
  saveStorage(SECRETS_STORAGE_KEY, JSON.stringify(secrets));

  return true;
}
