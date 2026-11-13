import type { ReactNode, SVGProps } from "react";

const paths: Record<string, ReactNode> = {
  home: <path d="M3.6 10.7 12 3.9l8.4 6.8V20a1 1 0 0 1-1 1h-4.9v-6.1H9.5V21H4.6a1 1 0 0 1-1-1z" />,
  speaker: (
    <>
      <rect x="5" y="2.6" width="14" height="18.8" rx="3.6" />
      <circle cx="12" cy="7.8" r="2.2" />
      <circle cx="12" cy="15.4" r="3.4" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.6" />
      <path d="m15.6 15.6 4.6 4.6" />
    </>
  ),
  play: <path d="M7.2 4.8v14.4L19.4 12z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6.9" y="4.8" width="3.6" height="14.4" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="13.5" y="4.8" width="3.6" height="14.4" rx="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  prev: (
    <>
      <path d="M18.6 5.2v13.6L8.4 12z" fill="currentColor" stroke="none" />
      <rect x="4.3" y="5.2" width="2.3" height="13.6" rx="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  next: (
    <>
      <path d="M5.4 5.2v13.6L15.6 12z" fill="currentColor" stroke="none" />
      <rect x="17.4" y="5.2" width="2.3" height="13.6" rx="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  shuffle: (
    <>
      <path d="M3.2 6.2h3.1c1.2 0 2.4.6 3.1 1.6l5.3 8.4c.7 1 1.9 1.6 3.1 1.6h3" />
      <path d="m17.6 3.6 3.3 2.6-3.3 2.6" />
      <path d="m17.6 15.2 3.3 2.6-3.3 2.6" />
      <path d="M3.2 17.8h3.1c1.2 0 2.4-.6 3.1-1.6l1.1-1.7" />
      <path d="M13.6 9.5l1.1-1.7c.7-1 1.9-1.6 3.1-1.6h3" />
    </>
  ),
  repeat: (
    <>
      <path d="M4.4 9.4V8.2a3 3 0 0 1 3-3h11" />
      <path d="m15.6 2.4 3.1 2.8-3.1 2.8" />
      <path d="M19.6 14.6v1.2a3 3 0 0 1-3 3h-11" />
      <path d="m8.4 21.6-3.1-2.8 3.1-2.8" />
    </>
  ),
  repeatOne: (
    <>
      <path d="M4.4 9.4V8.2a3 3 0 0 1 3-3h11" />
      <path d="m15.6 2.4 3.1 2.8-3.1 2.8" />
      <path d="M19.6 14.6v1.2a3 3 0 0 1-3 3h-11" />
      <path d="m8.4 21.6-3.1-2.8 3.1-2.8" />
      <path d="M11.4 11.2 12.8 10v4.4" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.4h3.1L11.6 6v12L7.1 14.6H4z" />
      <path d="M15 9.2a4 4 0 0 1 0 5.6" />
      <path d="M17.8 6.6a7.6 7.6 0 0 1 0 10.8" />
    </>
  ),
  volumeLow: (
    <>
      <path d="M4 9.4h3.1L11.6 6v12L7.1 14.6H4z" />
      <path d="M15 9.2a4 4 0 0 1 0 5.6" />
    </>
  ),
  volumeMute: (
    <>
      <path d="M4 9.4h3.1L11.6 6v12L7.1 14.6H4z" />
      <path d="m15.4 9.6 5 4.8" />
      <path d="m20.4 9.6-5 4.8" />
    </>
  ),
  queue: (
    <>
      <path d="M4 6.6h16" />
      <path d="M4 12h16" />
      <path d="M4 17.4h9.4" />
      <circle cx="17.8" cy="17.4" r="2.1" />
      <path d="M19.9 17.4v-4.2" />
    </>
  ),
  group: (
    <>
      <path d="M9 12h6" />
      <circle cx="5.6" cy="12" r="2.4" />
      <circle cx="18.4" cy="12" r="2.4" />
    </>
  ),
  chevronDown: <path d="m5.5 9 6.5 6 6.5-6" />,
  chevronUp: <path d="m5.5 15 6.5-6 6.5 6" />,
  chevronRight: <path d="m9 5.5 6 6.5-6 6.5" />,
  chevronLeft: <path d="m15 5.5-6 6.5 6 6.5" />,
  more: (
    <>
      <circle cx="5.4" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="18.6" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
  heart: <path d="M12 20.2S4.3 15.5 4.3 10.6A4.2 4.2 0 0 1 12 8.1a4.2 4.2 0 0 1 7.7 2.5c0 4.9-7.7 9.6-7.7 9.6z" />,
  heartFilled: (
    <path
      d="M12 20.2S4.3 15.5 4.3 10.6A4.2 4.2 0 0 1 12 8.1a4.2 4.2 0 0 1 7.7 2.5c0 4.9-7.7 9.6-7.7 9.6z"
      fill="currentColor"
    />
  ),
  plus: (
    <>
      <path d="M12 5.2v13.6" />
      <path d="M5.2 12h13.6" />
    </>
  ),
  check: <path d="m4.8 12.4 4.8 4.8L19.4 6.9" />,
  x: (
    <>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7.4h8" />
      <path d="M16.6 7.4H20" />
      <path d="M4 16.6h3.4" />
      <path d="M12 16.6h8" />
      <circle cx="14.2" cy="7.4" r="2.3" />
      <circle cx="9.6" cy="16.6" r="2.3" />
    </>
  ),
  moon: <path d="M20 14.4A8.4 8.4 0 0 1 9.6 4 8.5 8.5 0 1 0 20 14.4z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
    </>
  ),
  tv: (
    <>
      <rect x="2.6" y="4.6" width="18.8" height="12.4" rx="2" />
      <path d="M8 20.4h8" />
    </>
  ),
  radio: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M6.2 6.2a8.2 8.2 0 0 0 0 11.6" />
    </>
  ),
  signal: (
    <>
      <path d="M4.6 19.6v-3.2" />
      <path d="M9.5 19.6v-6.4" />
      <path d="M14.4 19.6v-9.6" />
      <path d="M19.3 19.6V6.4" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7.4h16" />
      <path d="M4 12h16" />
      <path d="M4 16.6h11" />
    </>
  ),
  pin: (
    <>
      <path d="M9.4 4.4h5.2" />
      <path d="M10.4 4.4v5.1L7.7 13.2h8.6l-2.7-3.7V4.4" />
      <path d="M12 13.2v6.4" />
    </>
  ),
  gear: (
    <>
      <path d="M10.4 3.3h3.2l.5 2.2 1.7 1 2.1-.8 1.6 2.8-1.6 1.6v1.9l1.6 1.6-1.6 2.8-2.1-.8-1.7 1-.5 2.2h-3.2l-.5-2.2-1.7-1-2.1.8-1.6-2.8 1.6-1.6v-1.9L5.5 8.5l1.6-2.8 2.1.8 1.7-1z" />
      <circle cx="12" cy="12" r="2.7" />
    </>
  ),
  album: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="2.4" />
    </>
  ),
  artist: (
    <>
      <circle cx="12" cy="8" r="3.7" />
      <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  playlist: (
    <>
      <path d="M3.6 6.4h11" />
      <path d="M3.6 11.4h11" />
      <path d="M3.6 16.4h6.6" />
      <circle cx="17.4" cy="16.4" r="2.4" />
      <path d="M19.8 16.4V7.6l-2.6 1" />
    </>
  ),
  folder: (
    <path d="M3.2 7.6a2 2 0 0 1 2-2h3.6l2 2.6h8a2 2 0 0 1 2 2v8.2a2 2 0 0 1-2 2H5.2a2 2 0 0 1-2-2z" />
  ),
  trash: (
    <>
      <path d="M4.8 7.4h14.4" />
      <path d="M9.4 7.4V5.6a1.2 1.2 0 0 1 1.2-1.2h2.8a1.2 1.2 0 0 1 1.2 1.2v1.8" />
      <path d="M6.6 7.4 7.5 20a1.2 1.2 0 0 0 1.2 1.1h6.6a1.2 1.2 0 0 0 1.2-1.1l.9-12.6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.2 12a8.2 8.2 0 1 1-2.6-6" />
      <path d="M20.4 4.2v5h-5" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="7.6" />
      <path d="M12 9.2V13l2.6 1.8" />
      <path d="M9.4 2.8h5.2" />
    </>
  ),
  power: (
    <>
      <path d="M12 3.4v8.4" />
      <path d="M6.9 6.4a7.6 7.6 0 1 0 10.2 0" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5.2" />
      <path d="M12 8.2h.01" />
    </>
  ),
  library: (
    <>
      <path d="M4 4.6v14.8" />
      <rect x="7" y="4.6" width="3.4" height="14.8" rx=".8" />
      <rect x="13.2" y="4.6" width="3.4" height="14.8" rx=".8" />
      <path d="m19.4 5.6 1.4 13.2" />
    </>
  ),
  sparkles: (
    <>
      <path d="M11 3.6 12.6 8l4.4 1.6-4.4 1.6L11 15.6 9.4 11.2 5 9.6 9.4 8z" />
      <path d="m17.6 14.6.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>
  ),
  offline: (
    <>
      <path d="M3.4 3.4 20.6 20.6" />
      <path d="M8.6 15.4a5 5 0 0 1 6.8 0" />
      <path d="M5 11.8a10.6 10.6 0 0 1 4-2.4" />
      <path d="M19 11.8a10.6 10.6 0 0 0-6.4-2.7" />
      <path d="M12 19.4h.01" />
    </>
  ),
  playNext: (
    <>
      <path d="M3.6 7h9" />
      <path d="M3.6 12h9" />
      <path d="M3.6 17h6" />
      <path d="M15.4 8.4v9.2l6-4.6z" fill="currentColor" stroke="none" />
    </>
  ),
  addQueue: (
    <>
      <path d="M3.6 7h10" />
      <path d="M3.6 12h10" />
      <path d="M3.6 17h6.4" />
      <path d="M18.4 9.4v8" />
      <path d="M14.4 13.4h8" />
    </>
  ),
  bluetooth: (
    <>
      <path d="m7.4 7.4 9 9.2L12 21V3l4.4 4.4-9 9.2" />
    </>
  ),
  external: (
    <>
      <path d="M13.6 4.4h6v6" />
      <path d="m19.6 4.4-8.4 8.4" />
      <path d="M18 14.4v4.2a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8V7.8A1.8 1.8 0 0 1 5.4 6H9.6" />
    </>
  ),
  music: (
    <>
      <circle cx="7" cy="17.4" r="2.8" />
      <circle cx="18" cy="15.4" r="2.8" />
      <path d="M9.8 17.4V6.6l11-2v10.8" />
    </>
  ),
  drag: (
    <>
      <path d="M8.4 8h.01M8.4 12h.01M8.4 16h.01M15.6 8h.01M15.6 12h.01M15.6 16h.01" />
    </>
  ),
  // Three tiles with one empty slot and an arrow moving a tile into it.
  arrange: (
    <>
      <rect x="3.2" y="3.2" width="7.2" height="7.2" rx="2" />
      <rect x="13.6" y="3.2" width="7.2" height="7.2" rx="2" />
      <rect x="3.2" y="13.6" width="7.2" height="7.2" rx="2" />
      <path d="M10.9 17.9c2.7.3 4.9-.9 6.1-3" />
      <path d="M19.4 12.9l-1 4.4-4.4-1.1z" fill="currentColor" stroke="none" />
    </>
  ),
};

export type IconName = keyof typeof paths;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, strokeWidth = 1.6, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
