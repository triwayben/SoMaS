import type { ImageInfo } from "../api/types";

export function imageUrl(
  image: ImageInfo | undefined | null,
  baseUrl: string,
  size?: number,
): string | undefined {
  if (!image?.path) return undefined;
  const path = image.path;
  if (path.startsWith("data:") || path.startsWith("blob:")) return path;
  const base = baseUrl || "";
  if (image.proxy_id) {
    return `${base}/imageproxy/${image.proxy_id}${size ? `?size=${size}` : ""}`;
  }
  if (/^https?:\/\//i.test(path)) return path;
  const encoded = encodeURIComponent(encodeURIComponent(path));
  const provider = image.provider ?? "builtin";
  return `${base}/imageproxy?path=${encoded}&provider=${provider}${size ? `&size=${size}` : ""}`;
}
