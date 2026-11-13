import { useEffect, useRef, useState } from "react";
import { coverUrl, paletteFromSeed } from "../lib/art";
import { directImageUrl, imageUrl } from "../lib/images";
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
 * Album art served by Music Assistant with a deterministic generated fallback. If the
 * server cannot serve a remote cover itself, the provider's own URL is tried once, then an
 * authenticated request, then the generated cover.
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
  const triedDirect = useRef(false);
  const triedAuth = useRef(false);
  const failed = useRef(false);

  useEffect(() => {
    triedDirect.current = false;
    triedAuth.current = false;
    failed.current = false;
    const next = imageUrl(image, baseUrl, requestSize) ?? (seed ? coverUrl(seed) : undefined);
    setSrc(next ? blobCache.get(next) ?? next : undefined);
  }, [image, baseUrl, seed, requestSize]);

  const handleError = async () => {
    if (!primary || failed.current) return;
    // The server proxies remote covers, but a server that cannot fetch one itself answers
    // with an error, so fall back to the provider's own URL once before giving up.
    const direct = directImageUrl(primary);
    if (direct && !triedDirect.current) {
      triedDirect.current = true;
      setSrc(direct);
      return;
    }
    if (triedDirect.current || triedAuth.current) {
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
        <img
          src={src}
          alt={alt}
          /* Eager: lazy images can fail to load inside fixed/transformed phone layouts. */
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={handleError}
        />
      ) : null}
    </div>
  );
}
