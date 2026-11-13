/**
 * Things the user arranged: pinned rooms, service order, sort mode, volume step, theme.
 *
 * They live in localStorage, which belongs to one app instance — Safari and an installed
 * home-screen app keep separate stores, and so does every address the app is served from.
 * Keeping them in one versioned bundle means the shape can be migrated instead of dropped, and
 * it can be copied out and back in when the app moves to a new address.
 *
 * The bundle is also scoped to the Music Assistant server it was arranged for. Two servers, or
 * the demo system, never share a layout: pointing SoMaS at another server and back again brings
 * that server's own order, theme and pins with it.
 */
const KEY = "somas.prefs";
const VERSION = 1;
/** Records the instance whose settings are current, so the app opens with the right theme. */
const INSTANCE_KEY = "somas.instance";
/** Separates an instance's copy of a stored value from everyone else's. */
const SCOPE_MARK = "@";

export const PREFS_EVENT = "somas:prefs";

type Values = Record<string, string>;

/** Which Music Assistant server the preferences on screen belong to. */
let scope: string | null = null;

try {
  scope = localStorage.getItem(INSTANCE_KEY);
} catch {
  scope = null;
}

/** Suffixes a stored value with the instance it belongs to, so two servers never share one. */
export function scopedKey(key: string): string {
  return scope ? `${key}${SCOPE_MARK}${scope}` : key;
}

export function prefScope(): string | null {
  return scope;
}

/**
 * Values written before settings were separated by instance. The first instance opened takes
 * them over, so upgrading does not lose an existing layout; after that they are gone and a
 * second server starts clean.
 */
const CARRIED_KEYS = [
  "somas.prefs",
  "somas.groupPresets",
  "somas.searches",
  "somas.sleepCustom",
  "somas.player",
  "somas.usage",
  "somas.theme",
  "somas.services",
  "somas.services.iconOnly",
  "somas.sort",
  "somas.pinned",
  "somas.volumeStep",
];

/**
 * Points preferences at one instance: the normalised server origin, or "demo". Everything read
 * afterwards comes from that instance's own bundle.
 */
export function setPrefScope(instance: string | null) {
  const next = instance || null;
  if (next === scope) return;
  scope = next;
  try {
    if (next) {
      localStorage.setItem(INSTANCE_KEY, next);
      for (const key of CARRIED_KEYS) {
        const value = localStorage.getItem(key);
        if (value === null) continue;
        const target = `${key}${SCOPE_MARK}${next}`;
        if (localStorage.getItem(target) === null) localStorage.setItem(target, value);
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage disabled: the app still works, it just forgets on reload.
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
}

function load(): Values {
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedKey(KEY)) ?? "null") as
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
    localStorage.setItem(scopedKey(KEY), JSON.stringify({ version: VERSION, values }));
  } catch {
    // Storage disabled or full: preferences simply do not persist this session.
  }
}

/** Reads a raw string, moving it out of the older per-key storage on first use. */
export function readPref(name: string, legacyKey?: string): string | null {
  const values = load();
  if (name in values) return values[name];
  if (legacyKey) {
    const legacy = localStorage.getItem(scopedKey(legacyKey));
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
