/**
 * A small QR code encoder, so settings can be moved to a phone by pointing a camera at the screen
 * instead of typing or emailing a blob of JSON.
 *
 * Byte mode, error correction level L, versions 1–40 chosen by what the text needs. Everything here
 * is the standard: the module placement, the Reed–Solomon blocks, the eight masks and the penalty
 * rules that pick between them, and the BCH-protected format and version information.
 */
export interface QrCode {
  /** Modules per side, excluding the quiet zone. */
  size: number;
  /** `true` where the module is dark; indexed `[y][x]`. */
  modules: boolean[][];
  version: number;
}

/** ECC codewords per block, indexed by version (level L). */
const ECC_PER_BLOCK = [
  -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30,
  26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
];

/** Error correction blocks, indexed by version (level L). */
const NUM_BLOCKS = [
  -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15,
  16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
];

const MAX_VERSION = 40;

// ---- Reed–Solomon over GF(256), polynomial 0x11D --------------------------
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMultiply(divisor[i], factor);
  }
  return result;
}

// ---- geometry --------------------------------------------------------------
/** Data modules available once the function patterns and their separators are taken out. */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[version] * NUM_BLOCKS[version];
}

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const result = [6];
  for (let position = version * 4 + 10; result.length < count; position -= step) {
    result.splice(1, 0, position);
  }
  return result;
}

// ---- bits ------------------------------------------------------------------
class BitBuffer {
  readonly bits: boolean[] = [];

  append(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push(((value >>> i) & 1) !== 0);
  }
}

// ---- the encoder -----------------------------------------------------------
export function encodeQr(text: string): QrCode {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 0;
  for (let candidate = 1; candidate <= MAX_VERSION; candidate++) {
    const countBits = candidate <= 9 ? 8 : 16;
    const capacity = dataCodewords(candidate) * 8;
    if (4 + countBits + bytes.length * 8 <= capacity) {
      version = candidate;
      break;
    }
  }
  if (!version) throw new Error("Too much text for a QR code");

  // Data segment: byte mode, then a terminator and the alternating pad bytes.
  const bits = new BitBuffer();
  bits.append(0x4, 4);
  bits.append(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) bits.append(byte, 8);
  const capacityBits = dataCodewords(version) * 8;
  bits.append(0, Math.min(4, capacityBits - bits.bits.length));
  bits.append(0, (8 - (bits.bits.length % 8)) % 8);
  for (let pad = 0xec; bits.bits.length < capacityBits; pad ^= 0xec ^ 0x11) bits.append(pad, 8);

  const codewords: number[] = [];
  for (let i = 0; i < bits.bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j++) value = (value << 1) | (bits.bits[i + j] ? 1 : 0);
    codewords.push(value);
  }

  // Split into blocks, add the Reed–Solomon codewords, then interleave both.
  const blockCount = NUM_BLOCKS[version];
  const eccLength = ECC_PER_BLOCK[version];
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const shortBlockCount = blockCount - (rawCodewords % blockCount);
  const shortBlockLength = Math.floor(rawCodewords / blockCount);
  const divisor = rsDivisor(eccLength);

  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  for (let i = 0, offset = 0; i < blockCount; i++) {
    const length = shortBlockLength - eccLength + (i < shortBlockCount ? 0 : 1);
    const block = codewords.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    eccBlocks.push(rsRemainder(block, divisor));
  }
  const interleaved: number[] = [];
  for (let i = 0; i <= shortBlockLength; i++) {
    for (let j = 0; j < blockCount; j++) {
      if (i < dataBlocks[j].length) interleaved.push(dataBlocks[j][i]);
    }
  }
  for (let i = 0; i < eccLength; i++) {
    for (let j = 0; j < blockCount; j++) interleaved.push(eccBlocks[j][i]);
  }

  // Draw the function patterns, then the data, then pick the mask that reads best.
  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );

  const setFunction = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    reserved[y][x] = true;
  };

  for (let i = 0; i < size; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(x, y, distance !== 2 && distance !== 4);
      }
    }
  }
  const positions = alignmentPositions(version);
  for (let i = 0; i < positions.length; i++) {
    for (let j = 0; j < positions.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === positions.length - 1) || (i === positions.length - 1 && j === 0)) {
        continue;
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunction(positions[j] + dx, positions[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }
  drawFormat(modules, 0, reserved);
  if (version >= 7) drawVersion(modules, version, reserved);

  // Zigzag placement: two columns at a time from the bottom right, skipping the timing column.
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (reserved[y][x]) continue;
        if (bitIndex < interleaved.length * 8) {
          modules[y][x] =
            ((interleaved[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex++;
        }
      }
    }
  }

  let bestMask = 0;
  let bestPenalty = Infinity;
  let best: boolean[][] | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = modules.map((row) => row.slice());
    applyMask(candidate, reserved, mask);
    drawFormat(candidate, mask);
    const penalty = penaltyScore(candidate);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
      best = candidate;
    }
  }
  void bestMask;

  return { size, modules: best as boolean[][], version };
}

function drawFormat(modules: boolean[][], mask: number, reserved?: boolean[][]) {
  const size = modules.length;
  // Every cell written here is a function pattern, so the data placement has to skip it.
  const set = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    if (reserved) reserved[y][x] = true;
  };
  // Level L is 01 in the two data bits; the rest is the BCH remainder and the fixed pattern.
  const data = (0b01 << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  const bits = ((data << 10) | remainder) ^ 0x5412;

  const bit = (index: number) => ((bits >>> index) & 1) !== 0;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));

  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true); // the always-dark module
}

function drawVersion(modules: boolean[][], version: number, reserved?: boolean[][]) {
  const size = modules.length;
  let remainder = version;
  for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  const bits = (version << 12) | remainder;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    modules[b][a] = dark;
    modules[a][b] = dark;
    if (reserved) {
      reserved[b][a] = true;
      reserved[a][b] = true;
    }
  }
}

function applyMask(modules: boolean[][], reserved: boolean[][], mask: number) {
  const size = modules.length;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (reserved[y][x]) continue;
      let invert = false;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      }
      if (invert) modules[y][x] = !modules[y][x];
    }
  }
}

/** The four penalty rules from the specification, used only to choose a mask. */
function penaltyScore(modules: boolean[][]): number {
  const size = modules.length;
  let score = 0;

  const runScore = (line: boolean[]) => {
    let total = 0;
    let run = 1;
    for (let i = 1; i <= line.length; i++) {
      if (i < line.length && line[i] === line[i - 1]) {
        run++;
      } else {
        if (run >= 5) total += 3 + (run - 5);
        run = 1;
      }
    }
    // Rule 3 looks for the finder-like pattern inside a run of modules.
    for (let i = 0; i + 10 < line.length + 1; i++) {
      const slice = line.slice(i, i + 11);
      const asBits = slice.map((dark) => (dark ? "1" : "0")).join("");
      if (asBits === "10111010000" || asBits === "00001011101") total += 40;
    }
    return total;
  };

  for (let y = 0; y < size; y++) score += runScore(modules[y]);
  for (let x = 0; x < size; x++) score += runScore(modules.map((row) => row[x]));

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const colour = modules[y][x];
      if (
        modules[y][x + 1] === colour &&
        modules[y + 1][x] === colour &&
        modules[y + 1][x + 1] === colour
      ) {
        score += 3;
      }
    }
  }

  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark++;
  const total = size * size;
  const percent = (dark * 100) / total;
  score += Math.max(0, Math.ceil(Math.abs(percent - 50) / 5) - 1) * 10;
  return score;
}
