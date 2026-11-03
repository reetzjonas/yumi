// Storage is a browser boundary: blocked storage must not prevent app startup.
export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The preference still applies to the current session.
  }
}
