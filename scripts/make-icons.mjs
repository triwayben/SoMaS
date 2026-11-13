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

/** Flatten a square RGBA block onto the tile colour. */
function flatten(size, pixels, inset = 0) {
  const inner = Math.round(size * (1 - inset * 2));
  const start = Math.round((size - inner) / 2);
  const art = inset === 0 ? pixels : sample(inner);
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    out[i * 4] = TILE[0];
    out[i * 4 + 1] = TILE[1];
    out[i * 4 + 2] = TILE[2];
    out[i * 4 + 3] = 255;
  }
  const step = inset === 0 ? 1 : inner / size;
  for (let y = 0; y < (inset === 0 ? size : inner); y++) {
    for (let x = 0; x < (inset === 0 ? size : inner); x++) {
      const s = (y * inner + x) * 4;
      const d = ((y + start) * size + x + start) * 4;
      const a = art[s + 3] / 255;
      out[d] = Math.round(art[s] * a + TILE[0] * (1 - a));
      out[d + 1] = Math.round(art[s + 1] * a + TILE[1] * (1 - a));
      out[d + 2] = Math.round(art[s + 2] * a + TILE[2] * (1 - a));
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

writeFileSync("public/icons/icon-180.png", icon(180));
writeFileSync("public/icons/icon-192.png", icon(192));
writeFileSync("public/icons/icon-512.png", icon(512));
// maskable: keep the artwork inside the safe circle Android may crop to
writeFileSync("public/icons/icon-maskable-512.png", icon(512, 0.1));
writeFileSync("public/icons/favicon-64.png", icon(64));

console.log(`built icons from ${SRC} (${W}x${H})`);
