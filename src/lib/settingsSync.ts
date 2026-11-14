/**
 * Keeping the layout on the account rather than on one browser.
 *
 * The copy lives on the guest proxy — the only writable thing a home setup already runs — keyed by
 * the Music Assistant account that saved it. A phone that has never seen this server signs in, asks
 * for that copy, and arrives furnished: no code to scan, no text to paste.
 *
 * Which copy wins is decided by time. Every write stamps the local layout; whoever wrote last wins,
 * so two phones in the same house converge instead of fighting. Only layouts move — the access
 * token never leaves the browser it was entered on.
 */
import { exportAllPrefs, importPrefs, PREFS_WRITTEN, readPref } from "./prefs";

const STAMP_KEY = "somas.settings.stamp";
/** Removed before the layout is replaced, or the replacement would be sent straight back. */
let skipWritesUntil = 0;

export function syncEnabled(): boolean {
  return readPref("settingsSyncOff") !== "1";
}

/** The proxy's address: the one set for guests, or the same machine on its usual port. */
export function syncAddress(): string {
  const configured = readPref("guestServer")?.trim();
  if (configured) return configured;
  return `${window.location.hostname}:8090`;
}

function origin(address: string): string {
  const trimmed = address.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function localStamp(): number {
  try {
    return Number(localStorage.getItem(STAMP_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function setStamp(value: number) {
  try {
    localStorage.setItem(STAMP_KEY, String(value));
  } catch {
    // Storage disabled: syncing simply never settles, which is no worse than not having it.
  }
}

async function pull(address: string, token: string) {
  try {
    const response = await fetch(`${origin(address)}/settings`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (response.status !== 200) return null;
    const body = (await response.json()) as { bundle?: unknown; updatedAt?: unknown } | null;
    if (typeof body?.bundle !== "string") return null;
    return { bundle: body.bundle, updatedAt: Number(body.updatedAt) || 0 };
  } catch {
    return null;
  }
}

async function push(address: string, token: string, bundle: string, updatedAt: number) {
  try {
    const response = await fetch(`${origin(address)}/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ bundle, updatedAt }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Runs once per connection: adopts the account's copy when it is newer than this device's, and
 * seeds the account's copy when there is none yet.
 */
export async function syncOnConnect(token: string): Promise<"adopted" | "sent" | "none"> {
  if (!syncEnabled() || !token) return "none";
  const address = syncAddress();
  const remote = await pull(address, token);
  const local = localStamp();

  if (!remote) {
    const now = Date.now();
    if (await push(address, token, exportAllPrefs(), now)) {
      setStamp(now);
      return "sent";
    }
    return "none";
  }

  if (remote.updatedAt > local + 1500) {
    skipWritesUntil = Date.now() + 5000;
    importPrefs(remote.bundle);
    setStamp(remote.updatedAt);
    return "adopted";
  }
  return "none";
}

/** Sends this device's layout a moment after it changes, so the account's copy stays current. */
export function watchSettings(token: string): () => void {
  let timer: number | undefined;
  const onChange = () => {
    if (Date.now() < skipWritesUntil) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const now = Date.now();
      void push(syncAddress(), token, exportAllPrefs(), now).then((ok) => {
        if (ok) setStamp(now);
      });
    }, 1500);
  };
  window.addEventListener(PREFS_WRITTEN, onChange);
  return () => {
    window.removeEventListener(PREFS_WRITTEN, onChange);
    window.clearTimeout(timer);
  };
}

/** Whether the last layout exchange actually happened, for the Settings row to report. */
export function syncStampLabel(): string | null {
  const stamp = localStamp();
  if (!stamp) return null;
  return new Date(stamp).toLocaleString();
}
