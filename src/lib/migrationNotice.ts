/**
 * An upgrade can move saved settings about: out of the old `sonos4ma.*` keys, and into the bundle
 * of the server that owns them. Nothing the user chose was lost, so the app says so once — a
 * quietly preserved login with a different theme otherwise looks like something went wrong.
 */
const PENDING_KEY = "somas.migrationPending";
const SHOWN_KEY = "somas.migrationNotice";

/** Called by whichever migration actually moves something. */
export function noteSettingsMigrated() {
  try {
    if (localStorage.getItem(SHOWN_KEY) === "1") return;
    localStorage.setItem(PENDING_KEY, "1");
  } catch {
    // Storage disabled: nothing was persisted, so there is nothing to announce.
  }
}

/** The message to show once per browser, or null when no upgrade has moved anything. */
export function takeMigrationNotice(): string | null {
  try {
    if (localStorage.getItem(PENDING_KEY) !== "1") return null;
    localStorage.removeItem(PENDING_KEY);
    localStorage.setItem(SHOWN_KEY, "1");
  } catch {
    return null;
  }
  return "Your saved settings moved across to SoMaS";
}
