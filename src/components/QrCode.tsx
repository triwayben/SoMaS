import { useMemo } from "react";
import { encodeQr } from "../lib/qr";

/**
 * The settings text as a QR code, so another device can read it with a camera instead of having
 * the blob typed or emailed across. Rendered as SVG so it stays sharp at any size, always on white
 * with dark modules — a code inverted by a dark theme does not scan.
 */
export function QrCode({ text, caption }: { text: string; caption?: string }) {
  const code = useMemo(() => {
    try {
      return encodeQr(text);
    } catch {
      return null;
    }
  }, [text]);

  if (!code) {
    return (
      <p className="sheet__hint settings-move__hint">
        These settings are too long for a QR code — use Copy to clipboard instead.
      </p>
    );
  }

  const quiet = 4;
  const side = code.size + quiet * 2;
  let path = "";
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      if (code.modules[y][x]) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }

  return (
    <div className="qr">
      <svg
        className="qr__svg"
        viewBox={`0 0 ${side} ${side}`}
        role="img"
        aria-label="Settings QR code"
      >
        <rect x={0} y={0} width={side} height={side} fill="#ffffff" />
        <path d={path} fill="#000000" shapeRendering="crispEdges" />
      </svg>
      {caption ? <p className="sheet__hint qr__hint">{caption}</p> : null}
    </div>
  );
}
