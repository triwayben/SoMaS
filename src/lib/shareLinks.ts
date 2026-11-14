/**
 * Links that hand a phone something SoMaS needs at launch, so a QR code can replace a paragraph of
 * instructions. Two kinds:
 *
 * - `#guest=…` connects straight to a guest proxy with its key: scan it, and the phone is
 *   controlling the music. Nothing is typed and the Connect screen never appears.
 * - `#import=…` carries every server's saved layout, for a new address or a new device.
 *
 * The payload lives after the `#`, so the browser never sends it to the server, it never appears in
 * a `Referer`, and it cannot land in a log. A layout is a few hundred bytes of JSON — small enough
 * for a QR code on its own — and gzip takes it down to a size that scans comfortably from one phone
 * screen to another, using the browser's own CompressionStream rather than a dependency.
 */
import { exportAllPrefs } from "./prefs";

const GUEST_MARK = "#guest=";
const IMPORT_MARK = "#import=";
const LAST_GUEST_KEY = "somas.lastGuest";

export interface GuestLaunch {
  kind: "guest";
  server: string;
  key: string;
}

export interface ImportLaunch {
  kind: "import";
  bundle: string;
  servers: number;
  preferences: number;
}

export type Launch = GuestLaunch | ImportLaunch;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  try {
    const normalised = text.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

/** Base64url of the text, gzipped first when that is smaller and the browser can do it. */
async function pack(text: string): Promise<string> {
  const raw = new TextEncoder().encode(text);
  if (typeof CompressionStream === "undefined") return toBase64Url(raw);
  try {
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"));
    const gzipped = new Uint8Array(await new Response(stream).arrayBuffer());
    return toBase64Url(gzipped.length < raw.length ? gzipped : raw);
  } catch {
    return toBase64Url(raw);
  }
}

/** Reads whatever `pack` wrote: gzip announces itself with two magic bytes. */
async function unpack(payload: string): Promise<string | null> {
  const bytes = fromBase64Url(payload);
  if (!bytes || !bytes.length) return null;
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzipped) return new TextDecoder().decode(bytes);
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  } catch {
    return null;
  }
}

function addressOfApp(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/** A code that signs a visitor in through the proxy, key included. */
export function buildGuestLink(server: string, key: string): string {
  const compact = JSON.stringify({ s: server.trim(), k: key.trim() });
  return `${addressOfApp()}${GUEST_MARK}${toBase64Url(new TextEncoder().encode(compact))}`;
}

/** A code that carries every server's layout to another phone or address. */
export async function buildSettingsLink(bundle = exportAllPrefs()): Promise<string> {
  return `${addressOfApp()}${IMPORT_MARK}${await pack(bundle)}`;
}

export function settingsSummary(bundle: string): { servers: number; preferences: number } {
  try {
    const parsed = JSON.parse(bundle) as { servers?: unknown };
    if (!parsed.servers || typeof parsed.servers !== "object") return { servers: 0, preferences: 0 };
    let preferences = 0;
    for (const values of Object.values(parsed.servers as Record<string, unknown>)) {
      if (values && typeof values === "object") preferences += Object.keys(values).length;
    }
    return { servers: Object.keys(parsed.servers as Record<string, unknown>).length, preferences };
  } catch {
    return { servers: 0, preferences: 0 };
  }
}

export async function readLaunch(): Promise<Launch | null> {
  const hash = window.location.hash;
  if (hash.startsWith(GUEST_MARK)) {
    const text = await unpack(hash.slice(GUEST_MARK.length));
    if (!text) return null;
    try {
      const parsed = JSON.parse(text) as { s?: unknown; k?: unknown };
      const server = typeof parsed.s === "string" ? parsed.s.trim() : "";
      const key = typeof parsed.k === "string" ? parsed.k.trim() : "";
      return server && key ? { kind: "guest", server, key } : null;
    } catch {
      return null;
    }
  }
  if (hash.startsWith(IMPORT_MARK)) {
    const bundle = await unpack(hash.slice(IMPORT_MARK.length));
    if (!bundle) return null;
    return { kind: "import", bundle, ...settingsSummary(bundle) };
  }
  return null;
}

/** Drops the code from the address bar, so a reload or a bookmark does not repeat it. */
export function clearLaunchHash() {
  try {
    const { origin, pathname, search } = window.location;
    window.history.replaceState(null, "", `${origin}${pathname}${search}`);
  } catch {
    // No history API: an untouched hash is harmless on the next load.
  }
}

/** Remembers the last guest code opened here, so the admin side can offer it back rather than ask. */
export function rememberGuest(server: string, key: string) {
  try {
    localStorage.setItem(LAST_GUEST_KEY, JSON.stringify({ s: server, k: key }));
  } catch {
    // Storage disabled: the fields are simply empty next time.
  }
}

export function lastGuestHere(): { server: string; key: string } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_GUEST_KEY) ?? "null") as
      | { s?: unknown; k?: unknown }
      | null;
    if (parsed && typeof parsed.s === "string" && typeof parsed.k === "string") {
      return { server: parsed.s, key: parsed.k };
    }
  } catch {
    // Unreadable: treat as none.
  }
  return null;
}
