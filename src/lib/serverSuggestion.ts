/**
 * Where the app should suggest connecting, so the address does not have to be typed on every
 * device. `?server=host:port` wins, then `config.json` next to the app (set at deploy time).
 */

const CONFIG_FILE = "config.json";

export function serverFromUrl(): string | undefined {
  try {
    const value = new URLSearchParams(window.location.search).get("server")?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

export async function loadSuggestedServer(): Promise<string | undefined> {
  const fromUrl = serverFromUrl();
  if (fromUrl) return fromUrl;
  try {
    const response = await fetch(new URL(CONFIG_FILE, document.baseURI), { cache: "no-store" });
    if (!response.ok) return undefined;
    const data: unknown = await response.json();
    const server = (data as { server?: unknown } | null)?.server;
    return typeof server === "string" && server.trim() ? server.trim() : undefined;
  } catch {
    // No config file (or it is not valid JSON): the field just stays empty.
    return undefined;
  }
}
