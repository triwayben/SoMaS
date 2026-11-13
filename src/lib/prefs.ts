/**
 * Things the user arranged: pinned rooms, service order, sort mode, volume step, theme.
 *
 * They live in localStorage, which belongs to one app instance — Safari and an installed
 * home-screen app keep separate stores, and so does every address the app is served from.
 * Keeping them in one versioned bundle means the shape can be migrated instead of dropped, and
 * it can be copied out and back in when the app moves to a new address.
 */
const KEY = "somas.prefs";
const VERSION = 1;

export const PREFS_EVENT = "somas:prefs";

type Values = Record<string, string>;

function load(): Values {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as
      | { version?: number; values?: unknown }
      | null;
    if (parsed && parsed.version === VERSION && parsed.values && typeof parsed.values === "object") {
      const values: Values = {};
      for (const [name, value] of Object.entries(parsed.values as Record<string, unknown>)) {
        if (typeof value === "string") values[name] = value;
      }
      return values;
    }
  } catch {
    // Unreadable bundle: fall back to the legacy keys below rather than losing everything.
  }
  return {};
}

function save(values: Values) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, values }));
  } catch {
    // Storage disabled or full: preferences simply do not persist this session.
  }
}

/** Reads a raw string, moving it out of the older per-key storage on first use. */
export function readPref(name: string, legacyKey?: string): string | null {
  const values = load();
  if (name in values) return values[name];
  if (legacyKey) {
    const legacy = localStorage.getItem(legacyKey);
    if (legacy != null) {
      values[name] = legacy;
      save(values);
      return legacy;
    }
  }
  return null;
}

export function writePref(name: string, value: string) {
  const values = load();
  values[name] = value;
  save(values);
}

export function readPrefJson<T>(name: string, fallback: T, legacyKey?: string): T {
  const raw = readPref(name, legacyKey);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writePrefJson(name: string, value: unknown) {
  writePref(name, JSON.stringify(value));
}

/** A portable copy of every preference, for moving the layout to another app instance. */
export function exportPrefs(): string {
  return JSON.stringify({ version: VERSION, values: load() }, null, 2);
}

/** Merges a copied bundle back in; returns how many preferences were applied. */
export function importPrefs(text: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 0;
  }
  const incoming = (parsed as { values?: unknown } | null)?.values ?? parsed;
  if (!incoming || typeof incoming !== "object") return 0;

  const values = load();
  let applied = 0;
  for (const [name, value] of Object.entries(incoming as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    values[name] = value;
    applied += 1;
  }
  if (!applied) return 0;
  save(values);
  window.dispatchEvent(new Event(PREFS_EVENT));
  return applied;
}
