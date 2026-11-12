import { useId, type ReactNode } from "react";
import type { Player } from "../api/types";
import { Artwork } from "./Artwork";

/**
 * Sonos rooms are drawn as an illustration of the actual device type (soundbar,
 * bookshelf speaker, portable, floor speaker, amp, sub) so a room is
 * recognisable in grouping and room lists. Non-Sonos players keep their artwork.
 */
export type DeviceKind =
  | "soundbar"
  | "bookshelf"
  | "portable"
  | "tall"
  | "amp"
  | "sub"
  | "generic";

const MODEL_MATCHERS: Array<[DeviceKind, RegExp]> = [
  ["sub", /\bsub(words)?\b/],
  ["soundbar", /\b(arc|beam|ray|playbar|playbase)\b/],
  ["amp", /\b(amp|port|connect)\b/],
  ["tall", /\b(five|play:?5|era 300)\b/],
  ["portable", /\b(roam|move)\b/],
  ["bookshelf", /\b(one|play:?1|era 100|symfonisk|sound)\b/],
];

export function deviceKindOf(player: Player): DeviceKind | null {
  const info = player.device_info;
  const haystack = `${info?.manufacturer ?? ""} ${info?.model ?? ""} ${player.name}`.toLowerCase();
  const isSonos = /sonos/.test(haystack) || /sonos/i.test(player.provider ?? "");
  if (!isSonos) return null;
  for (const [kind, pattern] of MODEL_MATCHERS) {
    if (pattern.test(haystack)) return kind;
  }
  return "generic";
}

const EDGE = "rgba(0,0,0,0.34)";
const DETAIL = "rgba(0,0,0,0.18)";
const HIGHLIGHT = "rgba(255,255,255,0.45)";
const SHADOW = "rgba(0,0,0,0.4)";

function shapes(body: string): Record<DeviceKind, ReactNode> {
  return {
    soundbar: (
      <>
        <ellipse cx="24" cy="37.4" rx="18" ry="2.2" fill={SHADOW} />
        <rect x="3.6" y="20.4" width="40.8" height="12.2" rx="6" fill={body} stroke={EDGE} strokeWidth="0.8" />
        <path d="M8.6 23.6h30.8" stroke={HIGHLIGHT} strokeWidth="1.4" />
        <path
          d="M11.4 27.6v3.4M15.6 27.6v3.4M19.8 27.6v3.4M24 27.6v3.4M28.2 27.6v3.4M32.4 27.6v3.4M36.6 27.6v3.4"
          stroke={DETAIL}
          strokeWidth="1"
        />
      </>
    ),
    bookshelf: (
      <>
        <ellipse cx="24" cy="42.4" rx="9.4" ry="1.9" fill={SHADOW} />
        <rect x="14.4" y="7.4" width="19.2" height="33.8" rx="7.4" fill={body} stroke={EDGE} strokeWidth="0.8" />
        <path d="M17.6 10.6v27.6" stroke={HIGHLIGHT} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16.8 24.2h14.4" stroke={DETAIL} strokeWidth="0.9" />
        <circle cx="24" cy="33.4" r="1.5" fill="rgba(0,0,0,0.3)" />
      </>
    ),
    portable: (
      <>
        <ellipse cx="24" cy="41.6" rx="10.4" ry="1.9" fill={SHADOW} />
        <rect x="13.6" y="11" width="20.8" height="28.4" rx="10.4" fill={body} stroke={EDGE} strokeWidth="0.8" />
        <path d="M17.4 14.2v21.6" stroke={HIGHLIGHT} strokeWidth="2" strokeLinecap="round" />
        <path d="M15.4 24.4h17.2" stroke={DETAIL} strokeWidth="0.9" />
        <circle cx="24" cy="17.6" r="1.4" fill="rgba(0,0,0,0.32)" />
      </>
    ),
    tall: (
      <>
        <ellipse cx="24" cy="43" rx="11.6" ry="2" fill={SHADOW} />
        <path
          d="M13.6 8.2c0 5.6 2.7 7.6 2.7 11.4s-2.7 5.8-2.7 11.4v5.6h20.8V31c0-5.6-2.7-7.6-2.7-11.4s2.7-5.8 2.7-11.4V5.4H13.6z"
          fill={body}
          stroke={EDGE}
          strokeWidth="0.8"
        />
        <path d="M17 8.4v25" stroke={HIGHLIGHT} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="24" cy="12.8" r="2.8" fill={DETAIL} />
        <circle cx="24" cy="29.6" r="4.6" fill="rgba(0,0,0,0.14)" />
      </>
    ),
    amp: (
      <>
        <ellipse cx="24" cy="35.8" rx="18" ry="2.2" fill={SHADOW} />
        <rect x="3.8" y="17" width="40.4" height="15.4" rx="4" fill={body} stroke={EDGE} strokeWidth="0.8" />
        <path d="M6 20.4h36" stroke={HIGHLIGHT} strokeWidth="1.3" />
        <rect x="7.8" y="22.6" width="11.4" height="6.4" rx="1.6" fill={DETAIL} />
        <circle cx="35.2" cy="25.8" r="2.8" fill="rgba(0,0,0,0.26)" />
        <path d="M4.4 30.6h39.2" stroke="rgba(0,0,0,0.12)" strokeWidth="0.9" />
      </>
    ),
    sub: (
      <>
        <ellipse cx="24" cy="40.4" rx="13" ry="2" fill={SHADOW} />
        <rect x="10.4" y="9.6" width="27.2" height="28.8" rx="5.6" fill={body} stroke={EDGE} strokeWidth="0.8" />
        <circle cx="24" cy="24" r="9.6" fill="rgba(0,0,0,0.1)" />
        <circle cx="24" cy="24" r="6.2" fill="rgba(0,0,0,0.16)" />
        <circle cx="24" cy="24" r="2.4" fill="rgba(0,0,0,0.28)" />
      </>
    ),
    generic: (
      <>
        <ellipse cx="24" cy="41" rx="10" ry="2" fill={SHADOW} />
        <rect x="13" y="9" width="22" height="30" rx="6.4" fill={body} stroke={EDGE} strokeWidth="0.8" />
        <path d="M16.4 12.2v23.6" stroke={HIGHLIGHT} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="24" cy="17.6" r="3.2" fill={DETAIL} />
        <circle cx="24" cy="29" r="5" fill={DETAIL} />
      </>
    ),
  };
}

export function DeviceArt({
  player,
  size = 52,
  baseUrl,
}: {
  player: Player;
  size?: number;
  baseUrl?: string;
}) {
  const rawId = useId();
  const gradientId = `dev-${rawId.replace(/[^a-zA-Z0-9-]/g, "")}`;
  const kind = deviceKindOf(player);

  if (!kind) {
    return (
      <Artwork
        seed={player.name}
        baseUrl={baseUrl}
        radius={6}
        width={size}
        height={size}
        alt={player.name}
      />
    );
  }

  return (
    <span className="device-art">
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#e4e5ea" />
            <stop offset="0.5" stopColor="#c6c7ce" />
            <stop offset="1" stopColor="#9899a1" />
          </linearGradient>
        </defs>
        {shapes(`url(#${gradientId})`)[kind]}
      </svg>
    </span>
  );
}
