/**
 * Installed phone apps keep the page they first loaded, so a rebuilt server goes unnoticed
 * until the app is reinstalled. Compare the entry script the server currently serves with
 * the one this page is running, and reload when they differ.
 */

function entryScript(doc: Document): string | undefined {
  const script = doc.querySelector('script[type="module"][src]');
  const src = script?.getAttribute("src");
  return src ? new URL(src, window.location.href).href : undefined;
}

/** True when the server is now serving a different build than the running page. */
export async function updateAvailable(): Promise<boolean> {
  const current = entryScript(document);
  if (!current) return false;
  try {
    const res = await fetch(window.location.href, { cache: "no-store" });
    if (!res.ok) return false;
    const html = await res.text();
    const next = entryScript(new DOMParser().parseFromString(html, "text/html"));
    return Boolean(next && next !== current);
  } catch {
    // Offline or the server is restarting; the next wake-up will try again.
    return false;
  }
}

// Registered once from the entry point.
export function watchForUpdates() {
  // The dev server pushes changes over its own socket, so this is for built app only.
  if (import.meta.env.DEV) return;

  let busy = false;
  const check = async (force = false) => {
    if (busy) return;
    // The periodic check skips hidden pages; returning to the app always checks.
    if (!force && document.visibilityState !== "visible") return;
    busy = true;
    try {
      if (await updateAvailable()) window.location.reload();
    } finally {
      busy = false;
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
  window.addEventListener("focus", () => void check(true));
  window.addEventListener("pageshow", () => void check(true));
  window.setTimeout(() => void check(true), 1500);
  window.setInterval(() => void check(), 5 * 60 * 1000);
}
