// Generates the app PNGs (and the favicon) from the master artwork in
// assets/app-icon.png. The master is transparent, so everything is flattened
// onto the dark tile colour the artwork was drawn against.
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";

const SRC = "assets/app-icon.png";
/** Tile colour behind the transparent master. */
const TILE = [0x23, 0x23, 0x26];

// ---- decode ---------------------------------------------------------------
const buf = readFileSync(SRC);
let off = 8;
let ihdr = null;
const idat = [];
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString("ascii", off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === "IHDR") {
    ihdr = {
      width: data.readUInt32BE(0),
      height: data.readUInt32BE(4),
      bitDepth: data[8],
      colorType: data[9],
      interlace: data[12],
    };
  } else if (type === "IDAT") {
    idat.push(data);
  } else if (type === "IEND") break;
  off += 12 + len;
}
if (!ihdr || ihdr.bitDepth !== 8 || ihdr.colorType !== 6 || ihdr.interlace !== 0) {
  throw new Error(`${SRC}: expected an 8-bit non-interlaced RGBA PNG, got ${JSON.stringify(ihdr)}`);
}

const { width: W, height: H } = ihdr;
const raw = inflateSync(Buffer.concat(idat));
const bpp = 4;
const stride = W * bpp;
const rgba = Buffer.alloc(stride * H);

for (let y = 0; y < H; y++) {
  const filter = raw[y * (stride + 1)];
  const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
  const out = rgba.subarray(y * stride, (y + 1) * stride);
  const prev = y > 0 ? rgba.subarray((y - 1) * stride, y * stride) : null;
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? out[x - bpp] : 0;
    const b = prev ? prev[x] : 0;
    const c = prev && x >= bpp ? prev[x - bpp] : 0;
    let v = line[x];
    switch (filter) {
      case 0:
        break;
      case 1:
        v += a;
        break;
      case 2:
        v += b;
        break;
      case 3:
        v += (a + b) >> 1;
        break;
      case 4: {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        break;
      }
      default:
        throw new Error(`bad filter ${filter} at row ${y}`);
    }
    out[x] = v & 0xff;
  }
}

// ---- resize: box filter, averaged in premultiplied alpha -------------------
function sample(size) {
  const out = Buffer.alloc(size * size * 4);
  const scale = W / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * scale);
    const y1 = Math.max(y0 + 1, Math.min(H, Math.floor((y + 1) * scale)));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.max(x0 + 1, Math.min(W, Math.floor((x + 1) * scale)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        let p = sy * stride + x0 * bpp;
        for (let sx = x0; sx < x1; sx++, p += bpp) {
          const al = rgba[p + 3] / 255;
          r += rgba[p] * al;
          g += rgba[p + 1] * al;
          b += rgba[p + 2] * al;
          a += al;
          n++;
        }
      }
      const o = (y * size + x) * 4;
      const alpha = a / n;
      out[o] = alpha > 0 ? Math.round(r / a) : 0;
      out[o + 1] = alpha > 0 ? Math.round(g / a) : 0;
      out[o + 2] = alpha > 0 ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

/** Flatten a square RGBA block onto a tile colour. */
function flatten(size, pixels, inset = 0, tile = TILE) {
  const inner = Math.round(size * (1 - inset * 2));
  const start = Math.round((size - inner) / 2);
  const art = inset === 0 ? pixels : sample(inner);
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    out[i * 4] = tile[0];
    out[i * 4 + 1] = tile[1];
    out[i * 4 + 2] = tile[2];
    out[i * 4 + 3] = 255;
  }
  const step = inset === 0 ? 1 : inner / size;
  for (let y = 0; y < (inset === 0 ? size : inner); y++) {
    for (let x = 0; x < (inset === 0 ? size : inner); x++) {
      const s = (y * inner + x) * 4;
      const d = ((y + start) * size + x + start) * 4;
      const a = art[s + 3] / 255;
      out[d] = Math.round(art[s] * a + tile[0] * (1 - a));
      out[d + 1] = Math.round(art[s + 1] * a + tile[1] * (1 - a));
      out[d + 2] = Math.round(art[s + 2] * a + tile[2] * (1 - a));
      out[d + 3] = 255;
    }
  }
  void step;
  return out;
}

// ---- encode ---------------------------------------------------------------
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(bytes) {
  let c = -1;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encode(size, pixels) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head[8] = 8;
  head[9] = 6;
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0;
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", head),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function icon(size, inset = 0) {
  return encode(size, flatten(size, sample(size), inset));
}

/**
 * Artwork on its own, with no tile behind it, for anywhere the background should show through.
 * The mark carries its own soft shadow, which is invisible on a dark background and faintly grey
 * on a pale one, and its outline is black, so `iconLight` is the version for dark surfaces.
 */
function iconTransparent(size) {
  return encode(size, sample(size));
}

/** The transparent mark with its near-black ink turned white, so it survives a dark page. */
function iconLight(size) {
  const art = sample(size);
  const out = Buffer.from(art);
  for (let i = 0; i < size * size; i += 1) {
    const p = i * 4;
    if (out[p + 3] === 0) continue;
    const luma = 0.2126 * out[p] + 0.7152 * out[p + 1] + 0.0722 * out[p + 2];
    if (luma >= 70) continue;
    out[p] = 245;
    out[p + 1] = 246;
    out[p + 2] = 248;
  }
  return encode(size, out);
}

/** Antialiased circular mask: transparent outside the circle, the tile kept inside it. */
function circleMask(size, pixels) {
  const radius = size / 2 - 0.5;
  const out = Buffer.from(pixels);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - size / 2;
      const dy = y + 0.5 - size / 2;
      const coverage = Math.min(1, Math.max(0, radius - Math.hypot(dx, dy) + 0.5));
      const offset = (y * size + x) * 4 + 3;
      out[offset] = Math.round(out[offset] * coverage);
    }
  }
  return out;
}

function circleIcon(size) {
  return encode(size, circleMask(size, flatten(size, sample(size))));
}

/**
 * The mark on a solid tile that fills the square, for a dashboard that draws its own background.
 *
 * A transparent version loses the black house outline entirely, and a light plate disappears into
 * Unraid's pale tile so that only a thin outline is left — which is what made the icon look small
 * beside other containers' edge-to-edge artwork. A filled tile the colour of the app's own reads at
 * full size in both of Unraid's themes, and the artwork is scaled slightly past the master's own
 * margins so the mark sits as wide as it can without clipping the roof.
 */
function iconTile(size, fill = 0.86, tint = [0x3c, 0x4b, 0x60]) {
  // The master is drawn with its own generous margin — the mark covers only half the canvas width —
  // so scale it to the box instead of trusting the file's framing. Measured at this size, so the
  // fit is the same for every output resolution.
  const probe = sample(size);
  let minX = size, minY = size, maxX = -1, maxY = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (probe[(y * size + x) * 4 + 3] < 24) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const inkW = maxX - minX + 1;
  const inkH = maxY - minY + 1;
  const zoom = (fill * size) / Math.max(inkW, inkH);
  const artSize = Math.round(size * zoom);
  const art = sample(artSize);
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    out[i * 4] = tint[0];
    out[i * 4 + 1] = tint[1];
    out[i * 4 + 2] = tint[2];
    out[i * 4 + 3] = 255;
  }
  const start = Math.round((size - artSize) / 2);
  for (let y = 0; y < size; y++) {
    const sy = y - start;
    if (sy < 0 || sy >= artSize) continue;
    for (let x = 0; x < size; x++) {
      const sx = x - start;
      if (sx < 0 || sx >= artSize) continue;
      const s = (sy * artSize + sx) * 4;
      const d = (y * size + x) * 4;
      const a = art[s + 3] / 255;
      // The house outline is near-black, which would vanish on any tile dark enough to show on a pale
      // dashboard, so it is lifted to white; the blue S is bright enough to leave alone.
      const luma = 0.2126 * art[s] + 0.7152 * art[s + 1] + 0.0722 * art[s + 2];
      const ink = luma < 70 ? 245 : 0;
      const r = ink || art[s];
      const g = ink || art[s + 1];
      const b = ink || art[s + 2];
      out[d] = Math.round(r * a + tint[0] * (1 - a));
      out[d + 1] = Math.round(g * a + tint[1] * (1 - a));
      out[d + 2] = Math.round(b * a + tint[2] * (1 - a));
    }
  }
  // Square and edge to edge: transparent corners make an icon look inset beside full-bleed ones.
  return encode(size, out);
}

writeFileSync("public/icons/icon-180.png", icon(180));
writeFileSync("public/icons/icon-192.png", icon(192));
writeFileSync("public/icons/icon-512.png", icon(512));
// maskable: keep the artwork inside the safe circle Android may crop to
writeFileSync("public/icons/icon-maskable-512.png", icon(512, 0.1));
writeFileSync("public/icons/icon-128.png", icon(128));

// A round one reads as an app icon in a browser tab and on a home screen.
writeFileSync("public/icons/favicon-64.png", circleIcon(64));
writeFileSync("public/icons/icon-circle-512.png", circleIcon(512));

// Unraid draws a container's tile from a small icon, so ship a 128px one rather than
// making it downscale the 512px artwork. The transparent pair let a tile, or any third-party
// dashboard, supply its own background; the 512 is the usual size for those.
writeFileSync("public/icons/icon-transparent-128.png", iconTransparent(128));
writeFileSync("public/icons/icon-transparent-512.png", iconTransparent(512));

// The same mark with its dark ink lifted to white, for the app's own dark themes: the house outline
// is drawn black, so on a dark page the transparent version loses it and keeps only the blue S.
writeFileSync("public/icons/icon-light-128.png", iconLight(128));
writeFileSync("public/icons/icon-light-512.png", iconLight(512));

// The one to point a dashboard at: a filled tile, so it reads at full size on a pale background
// and keeps the black outline visible on a dark one.
writeFileSync("public/icons/icon-tile-128.png", iconTile(128));
writeFileSync("public/icons/icon-tile-512.png", iconTile(512));


console.log(`built icons from ${SRC} (${W}x${H})`);
