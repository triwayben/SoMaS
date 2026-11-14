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
import { noteSettingsMigrated } from "./migrationNotice";

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
 * A short, stable fingerprint of whoever is signed in. Two accounts on one server therefore keep
 * their own layout, and the token itself is never written anywhere it is not already stored.
 */
export function accountHash(identity: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < identity.length; i += 1) {
    hash ^= identity.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

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
      let carried = 0;
      // Settings saved for the server alone become this account's settings the first time an
      // account-aware scope is used, so signing in does not look like a fresh install.
      const separator = next.indexOf("|");
      if (separator > 0) {
        const serverOnly = next.slice(0, separator);
        for (const key of CARRIED_KEYS) {
          const from = `${key}${SCOPE_MARK}${serverOnly}`;
          const value = localStorage.getItem(from);
          if (value === null) continue;
          const target = `${key}${SCOPE_MARK}${next}`;
          if (localStorage.getItem(target) === null) localStorage.setItem(target, value);
          localStorage.removeItem(from);
          carried += 1;
        }
      }
      for (const key of CARRIED_KEYS) {
        const value = localStorage.getItem(key);
        if (value === null) continue;
        const target = `${key}${SCOPE_MARK}${next}`;
        if (localStorage.getItem(target) === null) localStorage.setItem(target, value);
        localStorage.removeItem(key);
        carried += 1;
      }
      if (carried) noteSettingsMigrated();
    }
  } catch {
    // Storage disabled: the app still works, it just forgets on reload.
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
}

/** Reads one stored bundle, keeping only the string values this file can use. */
function parseBundle(raw: string | null): Values {
  try {
    const parsed = JSON.parse(raw ?? "null") as { version?: number; values?: unknown } | null;
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

function load(): Values {
  return parseBundle(localStorage.getItem(scopedKey(KEY)));
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

/**
 * Settings that are really credentials. They stay on the device that owns them: a copied layout is
 * meant to be shown as a QR code, and a guest key has its own code with its own warning.
 */
const NOT_EXPORTED = new Set(["guestKey"]);

function withoutSecrets(values: Values): Values {
  const kept: Values = {};
  for (const [name, value] of Object.entries(values)) {
    if (!NOT_EXPORTED.has(name)) kept[name] = value;
  }
  return kept;
}

/** A portable copy of the layout for the server in use, for moving it to another app instance. */
export function exportPrefs(): string {
  return JSON.stringify({ version: VERSION, values: withoutSecrets(load()) }, null, 2);
}

/**
 * Every server's layout at once. Each server keeps its own entry, so a paste puts each one back
 * where it belongs instead of piling them all onto whatever is connected at the time.
 */
export function exportAllPrefs(): string {
  const servers: Record<string, Values> = {};
  try {
    const prefix = `${KEY}${SCOPE_MARK}`;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const instance = key.slice(prefix.length);
      const values = withoutSecrets(parseBundle(localStorage.getItem(key)));
      if (Object.keys(values).length) servers[instance] = values;
    }
  } catch {
    // Storage disabled: there is nothing to copy.
  }
  return JSON.stringify({ version: VERSION, servers }, null, 2);
}

/** Merges a copied bundle back in; returns how many preferences were applied. */
export function importPrefs(text: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 0;
  }
  // A copy of every server: each entry goes back to the server it came from.
  const servers = (parsed as { servers?: unknown } | null)?.servers;
  if (servers && typeof servers === "object") {
    let restored = 0;
    for (const [instance, entry] of Object.entries(servers as Record<string, unknown>)) {
      const source = ((entry as { values?: unknown } | null)?.values ?? entry) as unknown;
      if (!source || typeof source !== "object" || !instance) continue;
      const values: Values = {};
      for (const [name, value] of Object.entries(source as Record<string, unknown>)) {
        if (typeof value === "string") values[name] = value;
      }
      if (!Object.keys(values).length) continue;
      try {
        localStorage.setItem(`${KEY}${SCOPE_MARK}${instance}`, JSON.stringify({ version: VERSION, values }));
        restored += Object.keys(values).length;
      } catch {
        // Full or disabled storage: skip this server rather than failing the whole paste.
      }
    }
    if (restored) window.dispatchEvent(new Event(PREFS_EVENT));
    return restored;
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
