/**
 * Nobody should have to type an address. A browser cannot see the local network, so this probes
 * the few places a Music Assistant server is most likely to be — the machine serving this app,
 * which is usually the same NAS or Pi, plus the usual local names — and reports whatever answers.
 *
 * A websocket is used rather than a fetch because cross-origin rules do not block it, and it is
 * the exact connection the app would make anyway, so a server that answers can also be used.
 */
const DEFAULT_PORT = 8095;
const TIMEOUT_MS = 1500;

function probe(host: string): Promise<string | null> {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const address = `${host}:${DEFAULT_PORT}`;
  return new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        // Already closed: nothing to clean up.
      }
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), TIMEOUT_MS);
    try {
      socket = new WebSocket(`${scheme}://${address}/ws`);
    } catch {
      resolve(null);
      return;
    }
    socket.onopen = () => finish(address);
    socket.onerror = () => finish(null);
    socket.onclose = () => finish(null);
  });
}

/** Addresses that answered, nearest guess first. Empty when nothing on the network replies. */
export async function discoverServers(): Promise<string[]> {
  const here = window.location.hostname;
  const candidates = [...new Set([here, "music-assistant.local", "musicassistant.local", "ma.local", "homeassistant.local"])]
    .filter(Boolean);
  const answers = await Promise.all(candidates.map((candidate) => probe(candidate)));
  return answers.filter((answer): answer is string => Boolean(answer));
}
