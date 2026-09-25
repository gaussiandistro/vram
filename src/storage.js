export function loadStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // no error handling here
  }
}

export function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // no error handling here
  }
}
