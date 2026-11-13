import type {
  Backend,
  ConnState,
  MasEvent,
  ServerInfo,
} from "./types";

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
}

export class MasError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "MasError";
    this.code = code;
  }
}

/** Accepts "192.168.1.10:8095", "http://mas.local:8095/", "ws://host:8095/ws" … */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!url) throw new Error("Enter your Music Assistant address");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/+$/, "");
  // Tolerate a pasted API or websocket URL.
  url = url.replace(/\/(ws|api|info|api-docs)$/i, "");
  return url;
}

/**
 * `crypto.randomUUID` only exists in secure contexts, and this app is commonly served over plain
 * HTTP on a LAN, so fall back to `getRandomValues` (available everywhere) and finally Math.random.
 */
function newMessageId(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") {
    return webCrypto.randomUUID().replace(/-/g, "");
  }
  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function websocketUrl(baseUrl: string): string {
  return `${baseUrl.replace(/^http/i, "ws")}/ws`;
}

const REQUEST_TIMEOUT = 25_000;

/**
 * Thin Music Assistant websocket client.
 *
 * MAS speaks a command/response protocol over ws://host:8095/ws:
 *   -> { message_id, command, args }
 *   <- { message_id, result } | { message_id, error_code, details }
 * and pushes unsolicited `{ event, object_id, data }` messages for state changes.
 */
export class MasBackend implements Backend {
  readonly kind = "mas" as const;

  private socket: WebSocket | null = null;
  private pending = new Map<string, PendingCall>();
  private stateListeners = new Set<(state: ConnState, detail?: string) => void>();
  private eventListeners = new Set<(event: MasEvent) => void>();
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private intentionalClose = false;
  private authed = false;

  state: ConnState = "idle";
  lastError: string | undefined;
  serverInfo: ServerInfo | null = null;

  constructor(
    readonly baseUrl: string,
    private readonly token: string,
  ) {}

  onState(cb: (state: ConnState, detail?: string) => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  onEvent(cb: (event: MasEvent) => void): () => void {
    this.eventListeners.add(cb);
    return () => this.eventListeners.delete(cb);
  }

  private setState(state: ConnState, detail?: string) {
    this.state = state;
    if (state === "error") this.lastError = detail;
    for (const cb of this.stateListeners) cb(state, detail);
  }

  async connect(): Promise<ServerInfo> {
    this.intentionalClose = false;
    this.setState("connecting");
    // Fetch the server banner alongside the socket so a slow /info never delays connecting.
    const infoPromise = this.fetchServerInfo().catch(() => null);
    await this.open();
    this.reconnectAttempt = 0;
    this.serverInfo = await infoPromise;
    return this.serverInfo ?? {};
  }

  private async fetchServerInfo(): Promise<ServerInfo> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(`${this.baseUrl}/info`, { signal: controller.signal });
      if (!res.ok) throw new MasError(`Server returned HTTP ${res.status}`);
      return (await res.json()) as ServerInfo;
    } finally {
      window.clearTimeout(timer);
    }
  }

  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let socket: WebSocket;
      try {
        socket = new WebSocket(websocketUrl(this.baseUrl));
      } catch (err) {
        reject(new MasError((err as Error).message));
        return;
      }
      this.socket = socket;

      const fail = (message: string) => {
        if (!settled) {
          settled = true;
          reject(new MasError(message));
        }
      };

      socket.onopen = () => {
        void (async () => {
          try {
            await this.authenticate();
            this.authed = true;
            // A cheap round trip proves the session really works.
            await this.send("players/all");
            this.setState("connected");
            if (!settled) {
              settled = true;
              resolve();
            }
          } catch (err) {
            const message = (err as Error).message || "Connection failed";
            fail(message);
            this.setState("error", message);
            // An auth failure will never fix itself; do not loop.
            this.intentionalClose = true;
            socket.close();
          }
        })();
      };

      socket.onmessage = (message) => this.handleMessage(message.data as string);

      socket.onerror = () => {
        // onclose carries the useful state; just make sure we do not hang.
        fail("Could not reach the Music Assistant server");
      };

      socket.onclose = (evt) => {
        this.socket = null;
        this.rejectAll(new MasError("Connection closed"));
        if (settled && !this.intentionalClose) {
          this.scheduleReconnect(evt.reason || "Connection lost");
        } else if (!settled) {
          fail(
            evt.reason ||
              "Connection closed. Check the address, and make sure the Music Assistant webserver is reachable from this device.",
          );
        }
      };
    });
  }

  private authenticate(): Promise<unknown> {
    if (!this.token) {
      // Tokenless servers (schema < 28) accept commands straight away.
      return Promise.resolve();
    }
    // MAS expects the access token as the first command on the socket.
    return this.send("auth", { token: this.token }).catch(async (err) => {
      // Some builds also accept the token as an `access_token` argument.
      try {
        return await this.send("auth", { access_token: this.token });
      } catch {
        throw err;
      }
    });
  }

  private scheduleReconnect(reason: string) {
    if (this.reconnectTimer !== null) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(1000 * 2 ** (this.reconnectAttempt - 1), 15_000);
    this.setState("reconnecting", reason);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.open().catch((err: Error) => {
        this.setState("reconnecting", err.message);
        this.scheduleReconnect(err.message);
      });
    }, delay);
  }

  private handleMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    if (msg.message_id && this.pending.has(msg.message_id)) {
      const call = this.pending.get(msg.message_id)!;
      this.pending.delete(msg.message_id);
      window.clearTimeout(call.timer);
      if (msg.error_code || msg.error) {
        const details =
          msg.details ||
          msg.error_message ||
          msg.error ||
          "The server rejected this command";
        call.reject(new MasError(String(details), msg.error_code));
      } else {
        call.resolve(msg.result ?? msg.partial ?? null);
      }
      return;
    }

    if (typeof msg.event === "string") {
      const event: MasEvent = {
        event: msg.event,
        object_id: msg.object_id ?? null,
        data: msg.data,
      };
      for (const cb of this.eventListeners) cb(event);
    }
  }

  private rejectAll(error: Error) {
    for (const [, call] of this.pending) {
      window.clearTimeout(call.timer);
      call.reject(error);
    }
    this.pending.clear();
  }

  send<T = unknown>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new MasError("Not connected to Music Assistant"));
    }
    const messageId = newMessageId();
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(messageId);
        reject(new MasError(`Timed out running ${command}`));
      }, REQUEST_TIMEOUT);
      this.pending.set(messageId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      socket.send(JSON.stringify({ message_id: messageId, command, args }));
    });
  }

  get isAuthed() {
    return this.authed;
  }

  close() {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.rejectAll(new MasError("Disconnected"));
    this.socket?.close();
    this.socket = null;
    this.setState("idle");
  }
}

/** Resolve username/password into an access token (MAS 2.x user auth). */
export async function loginWithPassword(
  baseUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider_id: "builtin",
      credentials: { username, password },
    }),
  });
  if (!res.ok) {
    throw new MasError(
      res.status === 401
        ? "Wrong username or password"
        : `Sign in failed (HTTP ${res.status})`,
      res.status,
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  const token =
    (data.access_token as string) ||
    (data.token as string) ||
    ((data.user as Record<string, unknown>)?.access_token as string);
  if (!token) throw new MasError("The server did not return an access token");
  return token;
}
