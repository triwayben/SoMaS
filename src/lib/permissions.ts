/**
 * What the signed-in Music Assistant user is allowed to do.
 *
 * The server enforces this itself — every command is checked against the user's role — but a
 * control that can only answer "not allowed" is worse than no control, so the app asks who it is
 * talking to and hides the few things that would fail.
 *
 * `auth/me` answers `{ user_id, username, role }`; `auth/scopes` answers a map of role id to the
 * scopes it grants. ADMIN holds every scope, USER can change the library but not the server's
 * configuration, GUEST can only read the library while controlling players and queues, and admins
 * can define custom roles, so the scopes are read rather than the role name guessed at. Servers
 * old enough not to answer either command leave everything visible, as before.
 */
export interface Permissions {
  /** Whoever the server says is signed in; empty when the server does not say. */
  username: string;
  /** `admin`, `user`, `guest`, `service`, or a custom role id. */
  role: string;
  /** Favourites and anything else that changes the library. */
  libraryWrite: boolean;
}

export const UNRESTRICTED: Permissions = { username: "", role: "", libraryWrite: true };

const LIBRARY_SCOPES = ["library.write", "library.manage"];

function scopesFor(scopes: unknown, role: string): string[] | null {
  if (!role || !scopes || typeof scopes !== "object") return null;
  const granted = (scopes as Record<string, unknown>)[role];
  if (!Array.isArray(granted)) return null;
  return granted.filter((scope): scope is string => typeof scope === "string").map((s) => s.toLowerCase());
}

export function permissionsFrom(user: unknown, roleScopes: unknown): Permissions {
  const record = (user ?? {}) as { username?: unknown; role?: unknown };
  const role = typeof record.role === "string" ? record.role.toLowerCase() : "";
  const username = typeof record.username === "string" ? record.username : "";
  if (!role) return { ...UNRESTRICTED, username };

  const scopes = scopesFor(roleScopes, role);
  if (scopes?.length) {
    const everything = scopes.includes("all") || scopes.includes("*");
    const libraryWrite = everything || LIBRARY_SCOPES.some((scope) => scopes.includes(scope));
    return { username, role, libraryWrite };
  }

  // No scope list came back: guests are the one role whose limits are fixed and documented.
  return { username, role, libraryWrite: role !== "guest" };
}
