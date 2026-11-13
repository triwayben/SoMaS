import type { ImageInfo } from "../api/types";

export function imageUrl(
  image: ImageInfo | undefined | null,
  baseUrl: string,
  size?: number,
): string | undefined {
  if (!image) return undefined;
  const base = baseUrl || "";
  // Newer servers identify cached art by proxy id alone, without a path.
  if (image.proxy_id) {
    return `${base}/imageproxy/${image.proxy_id}${size ? `?size=${size}` : ""}`;
  }
  const path = image.path;
  if (!path) return undefined;
  if (path.startsWith("data:") || path.startsWith("blob:")) return path;
  // Everything else goes through the server's image proxy rather than straight to the
  // provider CDN, so artwork still loads on devices that cannot reach the internet. The
  // path is double-encoded because that is what the proxy route expects; it accepts media
  // paths and full remote URLs alike.
  const encoded = encodeURIComponent(encodeURIComponent(path));
  const provider = image.provider ?? "builtin";
  return `${base}/imageproxy?path=${encoded}&provider=${provider}${size ? `&size=${size}` : ""}`;
}

/**
 * The original remote URL behind a proxied image, if there was one. Some servers cannot fetch
 * remote artwork themselves, so callers keep this as a last-resort fallback.
 */
export function directImageUrl(proxied: string | undefined): string | undefined {
  if (!proxied || !proxied.includes("/imageproxy?")) return undefined;
  try {
    const raw = new URL(proxied).searchParams.get("path");
    if (!raw) return undefined;
    const decoded = decodeURIComponent(raw);
    return /^https?:\/\//i.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}
