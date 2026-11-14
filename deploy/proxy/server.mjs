/**
 * SoMaS guest proxy.
 *
 * A guest phone should not hold an admin token. This small service sits between a browser running
 * SoMaS and Music Assistant: the browser connects here instead of to Music Assistant, authenticates
 * with a guest key, and every command is checked against a short list before being relayed with the
 * real token, which never leaves the server.
 *
 * What a guest gets: players, queues, library reads and artwork. What is refused: anything that
 * changes the library or the server (favourites, library scan, provider and core config, users).
 * `auth/me` is answered locally as a guest, so SoMaS hides the controls that would fail anyway.
 *
 * Configuration:
 *   MA_URL     Music Assistant base URL, e.g. http://192.168.1.20:8095
 *   MA_TOKEN   a long-lived token for Music Assistant — the real credential, never sent to guests
 *   GUEST_KEY  the starting guest key, used until one is set from SoMaS
 *   PORT       port to listen on (default 8090)
 *   GUEST_KEY_FILE  where a replaced key is kept (default /data/guest-key)
 *   GUEST_LIMITS_FILE  which optional powers guests may use (default /data/guest-limits.json)
 *
 * The key can be replaced at runtime from SoMaS (Settings -> Guests), without touching this
 * container's environment: POST /owner/guest-key with an admin Music Assistant token in the
 * Authorization header. Existing guest sessions are dropped, because a rotation is meant to end
 * access for everyone holding the old code.
 *
 * No dependencies: the websocket framing is implemented here, so the image is just Node.
 */
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const AUTH_ID = "upstream-auth";
const AUTH_TIMEOUT_MS = 10_000;

/**
 * What a guest may do, in one place: the app imports this same file to word its explanation, so
 * the list a guest is shown and the list the proxy enforces cannot drift apart. `optional` entries
 * can be switched off by the owner; their commands are the only thing a switch removes.
 */
const FEATURES = JSON.parse(
  fs.readFileSync(new URL("./guest-features.json", import.meta.url), "utf8"),
);

/** Commands a guest may run; everything else is refused. */
const ALLOWED_PREFIXES = ["players/", "player_queues/", "music/", "providers", "config/providers"];

/** Writes hidden inside those prefixes. */
const BLOCKED = new Set([
  "music/favorites/add_item",
  "music/favorites/remove_item",
  "music/sync",
  "players/add_currently_playing_to_favorites",
]);

/** The scopes Music Assistant grants a guest, so SoMaS can decide what to show. */
const GUEST_SCOPES = [
  "library.read",
  "players.read",
  "players.control",
  "queues.read",
  "queues.control",
  "providers.read",
  "config.players.read",
];

function allowedCommand(command) {
  if (BLOCKED.has(command)) return false;
  return ALLOWED_PREFIXES.some((prefix) => command === prefix || command.startsWith(prefix));
}

// ---- websocket framing ------------------------------------------------------
/** Server-to-client frame: never masked. */
function encodeFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x81, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

/** Client-to-server frame: always masked, as the protocol requires. */
function encodeClientFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const length = payload.length;
  const mask = randomBytes(4);
  let header;
  if (length < 126) {
    header = Buffer.from([0x81, 0x80 | length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  const masked = Buffer.from(payload);
  for (let index = 0; index < masked.length; index += 1) masked[index] ^= mask[index % 4];
  return Buffer.concat([header, mask, masked]);
}

function framePong(payload) {
  return Buffer.concat([Buffer.from([0x8a, payload.length]), payload]);
}

function closeFrame() {
  return Buffer.from([0x88, 0x00]);
}

/** Incremental parser for one websocket byte stream. */
class FrameReader {
  constructor({ onText, onPing, onClose }) {
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.onText = onText;
    this.onPing = onPing;
    this.onClose = onClose;
  }

  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    for (;;) {
      if (this.buffer.length < 2) return;
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        length = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }
      let mask = null;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        mask = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }
      if (this.buffer.length < offset + length) return;
      let payload = this.buffer.subarray(offset, offset + length);
      if (mask) {
        const unmasked = Buffer.from(payload);
        for (let index = 0; index < unmasked.length; index += 1) unmasked[index] ^= mask[index % 4];
        payload = unmasked;
      }
      this.buffer = this.buffer.subarray(offset + length);

      if (opcode === 0x8) {
        this.onClose?.();
        return;
      }
      if (opcode === 0x9) {
        this.onPing?.(payload);
        continue;
      }
      if (opcode === 0xa) continue; // pong
      if (opcode === 0x1 || opcode === 0x0) {
        this.fragments.push(payload);
        if (!fin) continue;
        const text = Buffer.concat(this.fragments).toString("utf8");
        this.fragments = [];
        this.onText?.(text);
        continue;
      }
      // Binary or reserved frames are not part of this protocol.
      this.onClose?.();
      return;
    }
  }
}

// ---- proxy ------------------------------------------------------------------
function parseMusicAssistant(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:") {
    throw new Error("MA_URL must start with http:// — a TLS upstream needs extra wiring here");
  }
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 80),
    path: `${parsed.pathname.replace(/\/+$/, "")}/ws`,
  };
}

/** Where a key replaced from SoMaS is kept, so a restart does not bring the old one back. */
const KEY_FILE = process.env.GUEST_KEY_FILE ?? "/data/guest-key";
/** Which optional powers are switched off for guests; empty means all of them are allowed. */
const LIMITS_FILE = process.env.GUEST_LIMITS_FILE ?? "/data/guest-limits.json";

function readLimits() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LIMITS_FILE, "utf8"));
    const off = Array.isArray(parsed?.off) ? parsed.off.filter((id) => typeof id === "string") : [];
    return { off };
  } catch {
    return { off: [] };
  }
}

function writeLimits(limits) {
  try {
    fs.mkdirSync(path.dirname(LIMITS_FILE), { recursive: true });
    fs.writeFileSync(LIMITS_FILE, JSON.stringify(limits), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

function readSavedKey() {
  try {
    const saved = fs.readFileSync(KEY_FILE, "utf8").trim();
    return saved || null;
  } catch {
    return null;
  }
}

function writeSavedKey(key) {
  try {
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

export function createProxyServer({ maUrl, maToken, guestKey }) {
  const target = parseMusicAssistant(maUrl);
  if (!maToken) throw new Error("MA_TOKEN is required");
  if (!guestKey) throw new Error("GUEST_KEY is required");
  const base = maUrl.replace(/\/+$/, "");
  // A key replaced earlier outlives a restart; the environment is only the starting point.
  let currentGuestKey = readSavedKey() ?? guestKey;
  let limits = readLimits();

  /** The optional power a command belongs to, if it belongs to one. */
  function optionalFeature(command) {
    return FEATURES.optional.find((feature) => feature.commands.includes(command)) ?? null;
  }
  /** Live guest connections, so a rotation can end the access it just revoked. */
  const guestSessions = new Set();

  /** Opens one Music Assistant websocket, authenticated with the real token by the caller. */
  function connectUpstream(onMessage, onClosed) {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: target.host, port: target.port });
      const key = randomBytes(16).toString("base64");
      let buffer = Buffer.alloc(0);
      let reader = null;
      let settled = false;

      const fail = (error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(error);
      };

      socket.on("connect", () => {
        socket.write(
          `GET ${target.path} HTTP/1.1\r\n` +
            `Host: ${target.host}:${target.port}\r\n` +
            "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
            `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
        );
      });

      socket.on("data", (chunk) => {
        if (reader) {
          reader.push(chunk);
          return;
        }
        buffer = Buffer.concat([buffer, chunk]);
        const end = buffer.indexOf("\r\n\r\n");
        if (end === -1) return;
        const head = buffer.subarray(0, end).toString("latin1");
        if (!/^HTTP\/1\.1 101/i.test(head)) {
          fail(new Error("Music Assistant refused the websocket upgrade"));
          return;
        }
        const rest = buffer.subarray(end + 4);
        buffer = Buffer.alloc(0);
        reader = new FrameReader({
          onText: onMessage,
          onClose: () => {
            onClosed();
            socket.destroy();
          },
          onPing: (payload) => socket.write(framePong(payload)),
        });
        settled = true;
        resolve({
          send: (text) => socket.write(encodeClientFrame(text)),
          close: () => socket.destroy(),
        });
        if (rest.length) reader.push(rest);
      });

      socket.on("error", (error) => {
        fail(error);
        onClosed();
      });
      socket.on("close", () => {
        if (!settled) fail(new Error("Music Assistant closed the connection"));
        onClosed();
      });
    });
  }

  /** Asks Music Assistant whether a token belongs to an admin, by using it to sign in. */
  async function tokenIsAdmin(token) {
    const waiting = new Map();
    let counter = 0;
    let connection = null;
    const call = (command, args) =>
      new Promise((resolve) => {
        const id = `owner-${(counter += 1)}`;
        const timer = setTimeout(() => {
          waiting.delete(id);
          resolve({ error: "Music Assistant did not answer in time" });
        }, AUTH_TIMEOUT_MS);
        waiting.set(id, (message) => {
          clearTimeout(timer);
          resolve(message);
        });
        connection.send(JSON.stringify({ message_id: id, command, args }));
      });
    try {
      connection = await connectUpstream((text) => {
        let message = null;
        try {
          message = JSON.parse(text);
        } catch {
          return;
        }
        const entry = waiting.get(message.message_id);
        if (entry) {
          waiting.delete(message.message_id);
          entry(message);
        }
      }, () => {});
      const auth = await call("auth", { token });
      if (auth.error_code || auth.error) return false;
      const me = await call("auth/me", {});
      return String(me?.result?.role ?? "").toLowerCase() === "admin";
    } catch {
      return false;
    } finally {
      try {
        connection?.close();
      } catch {
        // Already gone.
      }
    }
  }

  /** Replaces the guest key: the old codes stop working, and so do the sessions using them. */
  const rotateKey = (request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", async () => {
      const reply = (status, body) => {
        response
          .writeHead(status, {
            "content-type": "application/json",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
          })
          .end(JSON.stringify(body));
      };
      let body = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        body = {};
      }
      const nextKey = typeof body?.key === "string" ? body.key.trim() : "";
      if (nextKey.length < 8) {
        reply(400, { error: "The new guest key needs at least 8 characters" });
        return;
      }
      const token = String(request.headers.authorization ?? "")
        .replace(/^Bearer\s+/i, "")
        .trim();
      if (!token) {
        reply(401, { error: "An admin Music Assistant token is required" });
        return;
      }
      if (!(await tokenIsAdmin(token))) {
        reply(403, { error: "Only an admin Music Assistant login can replace the guest key" });
        return;
      }
      currentGuestKey = nextKey;
      const persisted = writeSavedKey(nextKey);
      // Cut the sessions the old key opened, so a rotation is not merely cosmetic.
      for (const close of [...guestSessions]) close();
      reply(200, { ok: true, persisted });
    });
  };

  /** Switches optional guest powers on or off, for a caller who proves they are an admin. */
  const changeLimits = (request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", async () => {
      const reply = (status, body) => {
        response
          .writeHead(status, {
            "content-type": "application/json",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
          })
          .end(JSON.stringify(body));
      };
      let body = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        body = {};
      }
      const known = new Set(FEATURES.optional.map((feature) => feature.id));
      const off = Array.isArray(body?.off) ? body.off.filter((id) => typeof id === "string") : null;
      if (!off || off.some((id) => !known.has(id))) {
        reply(400, { error: "Unknown guest limit" });
        return;
      }
      const token = String(request.headers.authorization ?? "")
        .replace(/^Bearer\s+/i, "")
        .trim();
      if (!token) {
        reply(401, { error: "An admin Music Assistant token is required" });
        return;
      }
      if (!(await tokenIsAdmin(token))) {
        reply(403, { error: "Only an admin Music Assistant login can change guest limits" });
        return;
      }
      limits = { off };
      const persisted = writeLimits(limits);
      reply(200, { ok: true, persisted, off: limits.off });
    });
  };

  const server = http.createServer((request, response) => {
    if (request.method === "OPTIONS") {
      response
        .writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "POST, GET, OPTIONS",
        })
        .end();
      return;
    }
    if (request.url === "/owner/guest-key" && request.method === "POST") {
      rotateKey(request, response);
      return;
    }
    // Public on purpose: a guest phone reads this to explain its own limits, and it holds no secret.
    if (request.url === "/guest-limits") {
      response
        .writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        })
        .end(JSON.stringify({ off: limits.off }));
      return;
    }
    if (request.url === "/owner/guest-limits" && request.method === "POST") {
      changeLimits(request, response);
      return;
    }
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "text/plain" }).end("ok\n");
      return;
    }
    // The server banner and artwork have to work too, or a guest sees no covers.
    const passthrough = request.url === "/info" || (request.url ?? "").startsWith("/imageproxy");
    if (!passthrough) {
      response.writeHead(404, { "content-type": "text/plain" }).end("Not found\n");
      return;
    }
    const upstream = http.request(
      `${base}${request.url}`,
      {
        method: request.method,
        headers: {
          accept: String(request.headers.accept ?? "*/*"),
          authorization: `Bearer ${maToken}`,
        },
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, {
          "content-type": String(upstreamResponse.headers["content-type"] ?? "application/octet-stream"),
          "cache-control": "no-store",
          // The app is served from the SoMaS container on its own port, so the banner, version and
          // artwork are cross-origin calls: without this the browser refuses to read them.
          "access-control-allow-origin": "*",
        });
        upstreamResponse.pipe(response);
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    upstream.end();
  });

  server.on("upgrade", (request, socket) => {
    const key = String(request.headers["sec-websocket-key"] ?? "");
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = createHash("sha1").update(key + GUID).digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );

    let upstream = null;
    let authenticated = false;
    let closed = false;
    let pendingAuth = null;

    const sendToGuest = (text) => {
      if (!closed) socket.write(encodeFrame(text));
    };
    const closeGuest = () => {
      if (closed) return;
      closed = true;
      guestSessions.delete(closeGuest);
      if (pendingAuth) {
        clearTimeout(pendingAuth.timer);
        pendingAuth.resolve({ error: "Connection closed" });
        pendingAuth = null;
      }
      try {
        socket.write(closeFrame());
      } catch {
        // Already gone.
      }
      socket.destroy();
      upstream?.close();
    };
    const refuse = (messageId, details, code = 403) =>
      sendToGuest(JSON.stringify({ message_id: messageId, error_code: code, details }));
    // Registered once the connection can be closed, so replacing the key can end this session.
    guestSessions.add(closeGuest);

    /** Results and Music Assistant's push events both pass straight through: they are reads. */
    const upstreamMessage = (text) => {
      if (pendingAuth) {
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
        if (parsed && parsed.message_id === AUTH_ID) {
          clearTimeout(pendingAuth.timer);
          pendingAuth.resolve(
            parsed.error_code || parsed.error
              ? { error: parsed.details ?? parsed.error ?? "Music Assistant refused the token" }
              : { ok: true },
          );
          pendingAuth = null;
          return;
        }
      }
      sendToGuest(text);
    };

    const openUpstream = async () => {
      upstream = await connectUpstream(upstreamMessage, () => closeGuest());
      const reply = await new Promise((resolve) => {
        const timer = setTimeout(
          () => resolve({ error: "Music Assistant did not answer the auth request" }),
          AUTH_TIMEOUT_MS,
        );
        pendingAuth = { resolve, timer };
        upstream.send(JSON.stringify({ message_id: AUTH_ID, command: "auth", args: { token: maToken } }));
      });
      if (reply.error) throw new Error(String(reply.error));
    };

    const handleGuestAuth = async (messageId, token) => {
      if (String(token ?? "") !== currentGuestKey) {
        refuse(messageId, "That guest key is not right", 401);
        closeGuest();
        return;
      }
      try {
        await openUpstream();
      } catch (error) {
        refuse(messageId, `Could not reach Music Assistant: ${error.message}`, 502);
        closeGuest();
        return;
      }
      authenticated = true;
      sendToGuest(
        JSON.stringify({ message_id: messageId, result: { authenticated: true, user: "guest" } }),
      );
    };

    const reader = new FrameReader({
      onText: (text) => {
        let message = null;
        try {
          message = JSON.parse(text);
        } catch {
          return;
        }
        const messageId = message?.message_id;
        const command = typeof message?.command === "string" ? message.command : "";
        if (!command) return;

        if (command === "auth") {
          void handleGuestAuth(messageId, message.args?.token ?? message.args?.access_token);
          return;
        }
        if (!authenticated) {
          refuse(messageId, "Authenticate first", 401);
          return;
        }
        // The guest's role is the proxy's own, not the admin token's.
        if (command === "auth/me") {
          sendToGuest(
            JSON.stringify({
              message_id: messageId,
              result: { user_id: "guest", username: "Guest", role: "guest" },
            }),
          );
          return;
        }
        if (command === "auth/scopes") {
          sendToGuest(JSON.stringify({ message_id: messageId, result: { guest: GUEST_SCOPES } }));
          return;
        }
        if (command.startsWith("auth/")) {
          refuse(messageId, `${command} is not available through the guest proxy`);
          return;
        }
        if (!allowedCommand(command)) {
          refuse(messageId, `${command} is not available to guests`);
          return;
        }
        // Allowed in principle, but switched off for guests by the owner.
        const optional = optionalFeature(command);
        if (optional && limits.off.includes(optional.id)) {
          refuse(messageId, `${optional.label} is turned off for guests`);
          return;
        }
        upstream?.send(JSON.stringify({ message_id: messageId, command, args: message.args ?? {} }));
      },
      onPing: (payload) => socket.write(framePong(payload)),
      onClose: () => closeGuest(),
    });

    socket.on("data", (chunk) => reader.push(chunk));
    socket.on("error", () => closeGuest());
    socket.on("close", () => closeGuest());
  });

  return server;
}

export { FrameReader, encodeFrame, encodeClientFrame, allowedCommand };

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT ?? 8090);
  const server = createProxyServer({
    maUrl: process.env.MA_URL ?? "",
    maToken: process.env.MA_TOKEN ?? "",
    guestKey: process.env.GUEST_KEY ?? "",
  });
  server.listen(port, () => console.log(`SoMaS guest proxy listening on :${port}`));
}
