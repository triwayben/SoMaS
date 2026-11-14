/**
 * Changing the guest key, so a code that has already been shared stops working.
 *
 * The key belongs to the proxy, not to Music Assistant, so this asks the proxy to replace it and
 * proves the request with the signed-in admin's Music Assistant token: the proxy signs in upstream
 * with that token and reads the role, which means no extra password or shell command. A rotated key
 * also closes the guest sessions the old one opened, so a rotation ends access rather than merely
 * gating new scans.
 */

export interface KeyChange {
  ok: boolean;
  /** False when the proxy could not save the key, so it reverts to the old one when it restarts. */
  persisted: boolean;
  error?: string;
}

/** A key short enough to type when a camera cannot be used, long enough not to be guessed. */
export function makeGuestKey(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function proxyOrigin(address: string): string {
  const trimmed = address.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export async function replaceGuestKey(
  address: string,
  token: string,
  key: string,
): Promise<KeyChange> {
  try {
    const response = await fetch(`${proxyOrigin(address)}/owner/guest-key`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ key }),
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
