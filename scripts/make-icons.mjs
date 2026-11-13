// Generates the home-screen PNGs from the same shapes as public/icon.svg.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function roundedRectDistance(px, py, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(px - cx) - halfW + radius;
  const dy = Math.abs(py - cy) - halfH + radius;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
}

const STROKE = 0.7; // half of the 1.4 stroke in the 24-unit viewBox

/** Is this viewBox point painted white? Mirrors the paths in public/icon.svg. */
function isGlyph(x, y) {
  const body = Math.abs(roundedRectDistance(x, y, 12, 12, 5.4, 8.4, 3.2)) <= STROKE;
  const tweeter = Math.abs(Math.hypot(x - 12, y - 8.4) - 1.5) <= STROKE;
  const woofer = Math.abs(Math.hypot(x - 12, y - 15.1) - 2.5) <= STROKE;
  return body || tweeter || woofer;
}

/** Full-bleed square for maskable icons, rounded squircle otherwise. */
function isBackground(x, y, maskable) {
  if (maskable) return true;
  return roundedRectDistance(x, y, 12, 12, 12, 12, 5.6) <= 0;
}

function render(size, { maskable = false, inset = 0 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 4;
  const scale = (size * (1 - inset * 2)) / 24;
  const offset = size * inset;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let glyphHits = 0;
      let backgroundHits = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const cx = px + (sx + 0.5) / samples;
          const cy = py + (sy + 0.5) / samples;
          const x = (cx - offset) / scale;
          const y = (cy - offset) / scale;
          if (maskable) {
            if (roundedRectDistance(x, y, 12, 12, 12, 12, 6) > 0) backgroundHits += 1;
            else backgroundHits += 1;
          } else if (isBackground(x, y, false)) {
            backgroundHits += 1;
          }
          if (isGlyph(x, y)) glyphHits += 1;
        }
      }
      const total = samples * samples;
      const glyph = glyphHits / total;
      const background = maskable ? 1 : backgroundHits / total;
      const alpha = Math.max(glyph, background);
      const i = (py * size + px) * 4;
      const white = glyph / Math.max(alpha, 1e-6);
      rgba[i] = Math.round(255 * white);
      rgba[i + 1] = Math.round(255 * white);
      rgba[i + 2] = Math.round(255 * white);
      rgba[i + 3] = Math.round(255 * alpha);
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", render(192));
writeFileSync("public/icons/icon-512.png", render(512));
writeFileSync("public/icons/icon-maskable-512.png", render(512, { maskable: true, inset: 0.1 }));
writeFileSync("public/icons/icon-180.png", render(180));
console.log("icons written");
