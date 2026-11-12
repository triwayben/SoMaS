/** Deterministic, dependency-free artwork so the app looks right with no network. */

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function hueFromString(value: string): number {
  return hashString(value) % 360;
}

function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${Math.round((h + 360) % 360)}, ${s}%, ${l}%, ${a})`;
}

export interface Palette {
  /** dark anchor used behind blurred artwork */
  base: string;
  from: string;
  to: string;
  accent: string;
}

export function paletteFromSeed(seed: string): Palette {
  const h = hueFromString(seed || "sonos");
  return {
    base: hsl(h, 38, 12),
    from: hsl(h, 46, 34),
    to: hsl(h + 48, 52, 22),
    accent: hsl(h + 24, 60, 58),
  };
}

export function coverUrl(seed: string, size = 600): string {
  const { from, to, accent } = paletteFromSeed(seed);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="r" cx="28%" cy="22%" r="80%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.85"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="470" cy="450" r="250" fill="url(#r)"/>
  <circle cx="150" cy="470" r="150" fill="#000" opacity="0.16"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function initialsOf(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
