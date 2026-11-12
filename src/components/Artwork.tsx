import { useEffect, useRef, useState } from "react";
import { coverUrl, paletteFromSeed } from "../lib/art";
import { imageUrl } from "../lib/images";
import type { ImageInfo } from "../api/types";
import { STORAGE } from "../store";

const blobCache = new Map<string, string>();

interface ArtworkProps {
  image?: ImageInfo | null;
  seed?: string;
  baseUrl?: string;
  size?: number;
  width?: number | string;
  height?: number | string;
  radius?: number;
  className?: string;
  alt?: string;
  requestSize?: number;
}

/**
 * Album art with a deterministic generated fallback. If the server rejects an
 * unauthenticated image request, retry once with the access token and use a blob URL.
 */
export function Artwork({
  image,
  seed,
  baseUrl = "",
  width = "100%",
  height = "100%",
  radius = 6,
  className = "",
  alt = "",
  requestSize,
}: ArtworkProps) {
  const primary = imageUrl(image, baseUrl, requestSize) ?? (seed ? coverUrl(seed) : undefined);
  const [src, setSrc] = useState<string | undefined>(
    primary ? blobCache.get(primary) ?? primary : undefined,
  );
  const triedAuth = useRef(false);
  const failed = useRef(false);

  useEffect(() => {
    triedAuth.current = false;
    failed.current = false;
    const next = imageUrl(image, baseUrl, requestSize) ?? (seed ? coverUrl(seed) : undefined);
    setSrc(next ? blobCache.get(next) ?? next : undefined);
  }, [image, baseUrl, seed, requestSize]);

  const handleError = async () => {
    if (!primary || failed.current) return;
    if (triedAuth.current) {
      failed.current = true;
      setSrc(seed ? coverUrl(seed) : undefined);
      return;
    }
    triedAuth.current = true;
    const token = localStorage.getItem(STORAGE.token);
    if (!token || primary.startsWith("data:")) {
      failed.current = true;
      setSrc(seed ? coverUrl(seed) : undefined);
      return;
    }
    try {
      const res = await fetch(primary, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      blobCache.set(primary, objectUrl);
      setSrc(objectUrl);
    } catch {
      failed.current = true;
      setSrc(seed ? coverUrl(seed) : undefined);
    }
  };

  const palette = paletteFromSeed(seed || alt || "sonos");

  return (
    <div
      className={`artwork ${className}`}
      style={{
        width,
        height,
        borderRadius: radius,
        background: `linear-gradient(145deg, ${palette.from}, ${palette.to})`,
      }}
    >
      {src ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" onError={handleError} />
      ) : null}
    </div>
  );
}
