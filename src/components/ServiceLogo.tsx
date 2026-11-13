import { useEffect, useState, type CSSProperties } from "react";
import type { MusicProvider } from "../api/types";
import { useApp } from "../store";
import { useTheme } from "../theme";
import { Artwork } from "./Artwork";

// Provider icons rarely change; cache them per server for the session.
const iconCache = new Map<string, string | null>();
// Theme-adjusted version of each logo, keyed by source and theme.
const renderCache = new Map<string, { src: string; invert: boolean } | null>();

const OUTPUT = 128;
// Below this contrast a pixel is effectively invisible against the page.
const NEAR_BACKGROUND = 1.8;

/** WCAG relative luminance of one sRGB channel, 0 = black, 1 = white. */
function channelLuminance(value: number): number {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

/** Contrast ratio between two relative luminances, 1 = identical, 21 = black on white. */
function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

type LogoRender = { src: string; invert: boolean };

/**
 * Some providers ship an icon with a wide transparent margin (a small mark floating in a large
 * canvas) or a non-square aspect, which leaves it looking smaller than the logos beside it.
 * Crop to the visible artwork and scale it back up, keeping its proportions.
 */
function drawFitted(context: CanvasRenderingContext2D, image: HTMLImageElement): boolean {
  const scratch = document.createElement("canvas");
  scratch.width = OUTPUT;
  scratch.height = OUTPUT;
  const source = scratch.getContext("2d", { willReadFrequently: true });
  if (!source) {
    context.drawImage(image, 0, 0, OUTPUT, OUTPUT);
    return false;
  }
  source.drawImage(image, 0, 0, OUTPUT, OUTPUT);
  const { data } = source.getImageData(0, 0, OUTPUT, OUTPUT);
  let left = OUTPUT;
  let top = OUTPUT;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < OUTPUT; y += 1) {
    for (let x = 0; x < OUTPUT; x += 1) {
      if (data[(y * OUTPUT + x) * 4 + 3] < 26) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  const width = right - left + 1;
  const height = bottom - top + 1;
  // Nothing visible: draw it as served.
  if (right < 0) {
    context.drawImage(image, 0, 0, OUTPUT, OUTPUT);
    return false;
  }
  // Scale so the longer visible side fills the tile (less a hair of breathing room), keeping
  // proportions. This is a no-op for logos that already fill their canvas.
  const scale = Math.min(OUTPUT / width, OUTPUT / height) * 0.96;
  context.clearRect(0, 0, OUTPUT, OUTPUT);
  context.drawImage(
    scratch,
    left,
    top,
    width,
    height,
    (OUTPUT - width * scale) / 2,
    (OUTPUT - height * scale) / 2,
    width * scale,
    height * scale,
  );
  return true;
}

/**
 * Make a logo readable on the page background. A logo with nothing contrasting at all is
 * inverted wholesale; a logo that merely contains near-invisible dark detail (black music
 * notes on the dark theme) keeps its colours and has just those pixels lightened.
 */
export function prepareLogo(
  image: HTMLImageElement,
  source: string,
  theme: "light" | "dark",
): LogoRender | null {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const fitted = drawFitted(context, image);
  // A logo that only needed re-scaling is served from the canvas, not the original file.
  const fromCanvas = (invert: boolean): LogoRender =>
    fitted ? { src: canvas.toDataURL("image/png"), invert } : { src: source, invert };
  const picture = context.getImageData(0, 0, OUTPUT, OUTPUT);
  const { data } = picture;
  const pageLuminance = theme === "light" ? 1 : 0;
  const luminances = new Float32Array(data.length / 4);
  let total = 0;
  let visible = 0;
  let nearBackground = 0;

  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    const alpha = data[index + 3] / 255;
    if (alpha < 0.2) {
      luminances[pixel] = -1;
      continue;
    }
    const luminance =
      0.2126 * channelLuminance(data[index]) +
      0.7152 * channelLuminance(data[index + 1]) +
      0.0722 * channelLuminance(data[index + 2]);
    luminances[pixel] = luminance;
    total += alpha;
    if (contrastRatio(luminance, pageLuminance) >= NEAR_BACKGROUND) visible += alpha;
    else nearBackground += alpha;
  }
  if (total === 0) return null;
  visible /= total;
  nearBackground /= total;

  // Nothing readable at all: flip the whole logo.
  if (visible < 0.05) return fromCanvas(true);
  // Either already fine, or the dark area is the artwork itself (a tile behind bright art);
  // recolouring that would erase the logo.
  if (nearBackground < 0.02 || nearBackground > 0.35) return fromCanvas(false);

  const target = theme === "light" ? 0 : 255;
  const alphaAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= OUTPUT || y >= OUTPUT) return 0;
    return data[(y * OUTPUT + x) * 4 + 3] / 255;
  };
  // Ink sitting on the page rather than inside a filled shape: those pixels border the
  // transparent surround, whereas dark strokes drawn on a bright tile do not.
  const floatsOnPage = (x: number, y: number) =>
    alphaAt(x - 2, y) < 0.1 ||
    alphaAt(x + 2, y) < 0.1 ||
    alphaAt(x, y - 2) < 0.1 ||
    alphaAt(x, y + 2) < 0.1 ||
    alphaAt(x - 2, y - 2) < 0.1 ||
    alphaAt(x + 2, y + 2) < 0.1 ||
    alphaAt(x - 2, y + 2) < 0.1 ||
    alphaAt(x + 2, y - 2) < 0.1;

  // Neutral, all-but-invisible ink: black marks on the dark theme, white on the light one.
  const isInvisibleInk = (pixel: number) => {
    const luminance = luminances[pixel];
    if (luminance < 0) return false;
    if (contrastRatio(luminance, pageLuminance) >= NEAR_BACKGROUND) return false;
    const offset = pixel * 4;
    const spread =
      Math.max(data[offset], data[offset + 1], data[offset + 2]) -
      Math.min(data[offset], data[offset + 1], data[offset + 2]);
    return spread <= 38;
  };

  // Grow out from ink that touches the transparent surround, so a whole mark is treated at
  // once while dark strokes painted onto a bright tile stay untouched.
  const pending: number[] = [];
  const seen = new Uint8Array(OUTPUT * OUTPUT);
  for (let pixel = 0; pixel < OUTPUT * OUTPUT; pixel += 1) {
    if (!isInvisibleInk(pixel)) continue;
    if (!floatsOnPage(pixel % OUTPUT, Math.floor(pixel / OUTPUT))) continue;
    seen[pixel] = 1;
    pending.push(pixel);
  }

  let changed = false;
  while (pending.length) {
    const pixel = pending.pop() as number;
    const offset = pixel * 4;
    data[offset] = target;
    data[offset + 1] = target;
    data[offset + 2] = target;
    changed = true;
    const x = pixel % OUTPUT;
    const y = (pixel - x) / OUTPUT;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= OUTPUT || ny >= OUTPUT) continue;
      const next = ny * OUTPUT + nx;
      if (seen[next] || !isInvisibleInk(next)) continue;
      seen[next] = 1;
      pending.push(next);
    }
  }
  if (!changed) return fromCanvas(false);

  context.putImageData(picture, 0, 0);
  return { src: canvas.toDataURL("image/png"), invert: false };
}

/** The logo, adjusted so nothing in it disappears into the page background. */
function useLogoRender(src: string | null, theme: "light" | "dark"): LogoRender | null {
  const [render, setRender] = useState<LogoRender | null>(null);

  useEffect(() => {
    if (!src) {
      setRender(null);
      return;
    }
    const key = `${theme}|${src}`;

    if (renderCache.has(key)) {
      setRender(renderCache.get(key) ?? null);
      return;
    }
    let cancelled = false;

    const load = (anonymous: boolean) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        // Ask for a CORS-clean copy first so the pixels can be measured and re-fitted. A server
        // without CORS headers answers with an error, and we fall back to a plain load below.
        if (anonymous) image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
      });

    void (async () => {
      const image = (await load(true)) ?? (await load(false));
      if (cancelled) return;
      if (!image) {
        renderCache.set(key, null);
        setRender(null);
        return;
      }
      try {
        const value = prepareLogo(image, src, theme);
        renderCache.set(key, value);
        setRender(value);
      } catch {
        // A cross-origin logo cannot be read back; show it exactly as served.
        renderCache.set(key, null);
        setRender(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src, theme]);

  return render ?? (src ? { src, invert: false } : null);
}

/** Real service logo from Music Assistant (`providers/icon`), falling back to generated art. */
export function ServiceLogo({ provider, size = 34 }: { provider: MusicProvider; size?: number }) {
  const app = useApp();
  const theme = useTheme();
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

  const inner = Math.max(12, Math.round(size * 0.88));
  const render = useLogoRender(src, theme.family);

  return (
    <span
      className={`service-tile ${render?.invert ? "service-tile--inverted" : ""}`}
      style={
        {
          width: size,
          height: size,
          padding: Math.round(size * 0.06),
        } as CSSProperties
      }
    >
      {render ? (
        <img className="service-tile__img" src={render.src} alt="" draggable={false} />
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
