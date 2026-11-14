import { MasBackend, MasError, normalizeBaseUrl, websocketUrl } from "../api/mas";
import { accountHash } from "./prefs";

/**
 * "Sign in with Home Assistant", through Music Assistant's own OAuth provider.
 *
 * Music Assistant does the hard part: `GET /auth/authorize?provider_id=homeassistant` returns
 * Home Assistant's login page, and after signing in there Music Assistant sends the browser back
 * to `return_url` with a fresh Music Assistant token in `?code=`. The Music Assistant user it
 * belongs to is the one linked to that Home Assistant user, so everyone lands in their own account.
 *
 * Home Assistant refuses to be shown inside a frame, so when SoMaS is itself embedded (a Home
 * Assistant dashboard card) the login runs in a popup. The popup comes back to this same app, sees
 * it has an opener, hands the token over with postMessage and closes. A browser keeps an embedded
 * page's storage apart from the same address opened on its own, so the token has to travel this
 * way rather than through localStorage.
 */

const RETURN_MARK = "somas_auth";
const MESSAGE_TYPE = "somas-ha-login";

/**
 * One command on a short-lived, signed-out websocket. Music Assistant answers `auth/providers`
 * and `auth/authorization_url` there without a token, and unlike its matching HTTP routes a
 * websocket is not held back by the browser's cross-origin rules.
 */
function signedOutCommand<T>(base: string, command: string, args: object = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(websocketUrl(base));
    } catch (err) {
      reject(new MasError((err as Error).message));
      return;
    }
    const messageId = `somas-ha-${Date.now()}`;
    const timer = window.setTimeout(() => finish(new MasError("Music Assistant did not answer")), 8000);
    const finish = (error: Error | null, result?: T) => {
      window.clearTimeout(timer);
      socket.onmessage = socket.onerror = socket.onclose = null;
      socket.close();
      if (error) reject(error);
      else resolve(result as T);
    };
    socket.onopen = () => socket.send(JSON.stringify({ message_id: messageId, command, args }));
    socket.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      if (msg.message_id !== messageId) return;
      if (msg.error_code || msg.error) {
        finish(new MasError(String(msg.details ?? msg.error ?? "Music Assistant refused")));
      } else {
        finish(null, msg.result as T);
      }
    };
    socket.onerror = () => finish(new MasError("Could not reach Music Assistant"));
    socket.onclose = () => finish(new MasError("Could not reach Music Assistant"));
  });
}

export interface HaLoginResult {
  server: string;
  token: string;
  /** True only when this sign-in began as the popup of an embedded SoMaS. */
  viaPopup?: boolean;
}

/** Whether this Music Assistant offers Home Assistant sign-in. Quietly false when unreachable. */
export async function haLoginAvailable(server: string, signal?: AbortSignal): Promise<boolean> {
  let base: string;
  try {
    base = normalizeBaseUrl(server);
  } catch {
    return false;
  }
  if (signal?.aborted) return false;
  try {
    const providers = await signedOutCommand<Array<{ provider_type?: string; provider_id?: string }>>(
      base,
      "auth/providers",
    );
    return (
      Array.isArray(providers) &&
      providers.some(
        (provider) =>
          provider?.provider_type === "homeassistant" || provider?.provider_id === "homeassistant",
      )
    );
  } catch {
    return false;
  }
}

function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Start the sign-in. Call straight from the click handler: an embedded page may only open the
 * popup while the tap is still being handled, so it is opened before anything is awaited.
 */
export async function startHaLogin(server: string): Promise<void> {
  const base = normalizeBaseUrl(server);
  // A fresh name every time: reusing a sign-in window left open from an earlier try would keep
  // that window's old opener, which is gone once the dashboard reloaded, and the token would
  // have nowhere to go.
  const popup = isEmbedded()
    ? window.open("about:blank", `somas-ha-login-${Date.now()}`, "popup,width=480,height=720")
    : null;
  if (isEmbedded() && !popup) {
    throw new MasError("The sign-in window was blocked. Allow pop-ups for this page and try again.");
  }

  const back = new URL(window.location.href);
  back.search = "";
  back.hash = "";
  // Say how the sign-in started. Only a popup should hand its token to an opener: a tab opened
  // from a bookmark manager or a dashboard link can have an opener too, and must sign in itself.
  back.searchParams.set(RETURN_MARK, popup ? "ha-popup" : "ha");
  back.searchParams.set("server", base);

  try {
    const answer = await signedOutCommand<{ authorization_url?: string | null; error?: string }>(
      base,
      "auth/authorization_url",
      { provider_id: "homeassistant", return_url: back.toString() },
    );
    const url = answer?.authorization_url;
    if (!url && answer?.error) {
      throw new MasError(
        /does not support|does not exist/i.test(answer.error)
          ? "Music Assistant does not have Home Assistant sign-in set up"
          : answer.error,
      );
    }
    if (!url) throw new MasError("Music Assistant did not return a Home Assistant sign-in page");
    if (popup) popup.location.href = url;
    else window.location.assign(url);
  } catch (err) {
    popup?.close();
    if (err instanceof MasError) throw err;
    throw new MasError("Could not reach Music Assistant to start the sign-in");
  }
}

/**
 * The token Music Assistant sent back, if this page load is the end of a sign-in. Reading it also
 * takes it out of the address bar, so it is not left in history or shared by accident.
 */
export function takeHaLoginReturn(): HaLoginResult | null {
  const url = new URL(window.location.href);
  const mark = url.searchParams.get(RETURN_MARK);
  if (mark !== "ha" && mark !== "ha-popup") return null;
  const token = url.searchParams.get("code") ?? "";
  const server = url.searchParams.get("server") ?? "";
  url.searchParams.delete(RETURN_MARK);
  url.searchParams.delete("code");
  url.searchParams.delete("server");
  window.history.replaceState(window.history.state, "", url.toString());
  return token && server ? { server, token, viaPopup: mark === "ha-popup" } : null;
}

/**
 * When this page is the sign-in popup, give the result to the SoMaS that opened it and close.
 * Returns false when there is nobody to hand it to, and the sign-in finishes here instead.
 */
export function handHaLoginToOpener(result: HaLoginResult): boolean {
  if (!result.viaPopup) return false;
  const opener = window.opener as Window | null;
  if (!opener || opener === window) return false;
  try {
    // The SoMaS that opened this popup is on this same origin; anything else (a dashboard or a
    // page that merely opened this tab) throws here, and the sign-in finishes in this window.
    if (opener.location.origin !== window.location.origin) return false;
    opener.postMessage(
      { type: MESSAGE_TYPE, server: result.server, token: result.token },
      window.location.origin,
    );
  } catch {
    return false;
  }
  window.setTimeout(() => window.close(), 50);
  return true;
}

/** Listen for a sign-in finished in a popup. Returns the unsubscribe. */
export function onHaLoginMessage(handler: (result: HaLoginResult) => void): () => void {
  const listener = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as Partial<HaLoginResult> & { type?: string };
    if (data?.type !== MESSAGE_TYPE || !data.token || !data.server) return;
    handler({ server: data.server, token: data.token });
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

/**
 * The account this token belongs to, as the same fingerprint a username & password login uses.
 * Every Home Assistant sign-in mints a new token, so keying settings on the token would start the
 * layout over each time.
 */
export async function haLoginIdentity(result: HaLoginResult): Promise<string | undefined> {
  const backend = new MasBackend(normalizeBaseUrl(result.server), result.token);
  try {
    await backend.connect();
    const user = (await backend.send("auth/me")) as Record<string, unknown> | null;
    const name = (user?.username as string) || (user?.user_id as string) || (user?.id as string);
    return name ? accountHash(String(name)) : undefined;
  } catch {
    return undefined;
  } finally {
    backend.close();
  }
}
