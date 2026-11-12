import { useEffect, useState } from "react";
import type { MusicProvider } from "../api/types";
import { useApp } from "../store";
import { Artwork } from "./Artwork";

// Provider icons rarely change; cache them per server for the session.
const iconCache = new Map<string, string | null>();

/** Real service logo from Music Assistant (`providers/icon`), falling back to generated art. */
export function ServiceLogo({ provider, size = 34 }: { provider: MusicProvider; size?: number }) {
  const app = useApp();
  const cacheKey = `${app.baseUrl}|${provider.instance_id}`;
  const [src, setSrc] = useState<string | null>(() => iconCache.get(cacheKey) ?? null);

  useEffect(() => {
    if (iconCache.has(cacheKey)) {
      setSrc(iconCache.get(cacheKey) ?? null);
      return;
    }
    let cancelled = false;
    app
      .send<string | null>("providers/icon", { provider: provider.domain || provider.instance_id })
      .then((value) => {
        const icon = typeof value === "string" && value ? value : null;
        iconCache.set(cacheKey, icon);
        if (!cancelled) setSrc(icon);
      })
      .catch(() => {
        iconCache.set(cacheKey, null);
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [app.send, cacheKey, provider.domain, provider.instance_id]);

  const inner = Math.max(12, Math.round(size * 0.74));

  return (
    <span
      className="service-tile"
      style={{ width: size, height: size, padding: Math.round(size * 0.13) }}
    >
      {src ? (
        <img className="service-tile__img" src={src} alt="" draggable={false} />
      ) : (
        <Artwork
          seed={provider.name}
          baseUrl={app.baseUrl}
          radius={Math.round(inner * 0.22)}
          width={inner}
          height={inner}
          alt={provider.name}
        />
      )}
    </span>
  );
}
