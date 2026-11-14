/**
 * What a guest is allowed to do, and which optional powers the owner has turned off.
 *
 * The list itself lives in `deploy/proxy/guest-features.json`, one file for both sides: the proxy
 * enforces exactly those commands, and the app reads the same file to word its explanation, so the
 * two cannot drift. The proxy is the authority on what is currently switched off — a guest phone
 * asks it, rather than trusting a copy kept in its own browser.
 */
import features from "../../deploy/proxy/guest-features.json";

export interface GuestFeature {
  id: string;
  label: string;
  commands: string[];
}

export const GUEST_ALWAYS: string[] = features.always;
export const GUEST_FORBIDDEN: string[] = features.forbidden;
export const GUEST_OPTIONAL: GuestFeature[] = features.optional;

/** Off-by-default would be safer, but a proxy that predates this feature allows everything. */
export const EVERYTHING_ALLOWED = { off: [] as string[] };

export interface GuestLimits {
  off: string[];
}

export function isAllowed(limits: GuestLimits | null, id: string): boolean {
  return !limits?.off.includes(id);
}

function proxyOrigin(address: string): string {
  const trimmed = address.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

/** Reads the limits the proxy is enforcing; null when it cannot be reached or is an older build. */
export async function loadGuestLimits(address: string): Promise<GuestLimits | null> {
  if (!address.trim()) return null;
  try {
    const response = await fetch(`${proxyOrigin(address)}/guest-limits`, { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { off?: unknown } | null;
    const off = Array.isArray(body?.off) ? body.off.filter((id): id is string => typeof id === "string") : [];
    return { off };
  } catch {
    return null;
  }
}

export interface LimitsChange {
  ok: boolean;
  /** False when the proxy could not save them, so a restart reverts to its earlier answer. */
  persisted: boolean;
  error?: string;
}

/** Sends the switched-off features to the proxy, proving the caller with an admin token. */
export async function sendGuestLimits(
  address: string,
  token: string,
  off: string[],
): Promise<LimitsChange> {
  try {
    const response = await fetch(`${proxyOrigin(address)}/owner/guest-limits`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ off }),
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string; persisted?: boolean }
      | null;
    if (!response.ok) {
      return {
        ok: false,
        persisted: false,
        error: body?.error ?? `The guest proxy answered ${response.status}`,
      };
    }
    return { ok: true, persisted: Boolean(body?.persisted) };
  } catch {
    return { ok: false, persisted: false, error: "Could not reach the guest proxy" };
  }
}
