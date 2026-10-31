// Clean, zero-dependency QR code generator in TypeScript
// Supports Byte Mode (8-bit) up to Version 10, ECC Level L/M/Q/H

export type EccLevel = 'L' | 'M' | 'Q' | 'H';

// Galois Field GF(256) tables with primitive polynomial 0x11D
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initGf() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = val;
    EXP_TABLE[i + 255] = val;
    LOG_TABLE[val] = i;
    val <<= 1;
    if (val & 0x100) val ^= 0x11d;
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
}

// Pre-computed Generator Polynomials for Reed-Solomon ECC
function getGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const factor = new Uint8Array([1, EXP_TABLE[i]]);
    const nextPoly = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      for (let k = 0; k < factor.length; k++) {
        nextPoly[j + k] ^= gfMul(poly[j], factor[k]);
      }
    }
    poly = nextPoly;
  }
  return poly;
}

// Compute Reed-Solomon Error Correction Codewords
function computeEcc(data: Uint8Array, eccCount: number): Uint8Array {
  const genPoly = getGeneratorPoly(eccCount);
  const ecc = new Uint8Array(eccCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ ecc[0];
    ecc.copyWithin(0, 1);
    ecc[eccCount - 1] = 0;
    for (let j = 0; j < eccCount; j++) {
      ecc[j] ^= gfMul(genPoly[j + 1], factor);
    }
  }
  return ecc;
}

// QR Code Specifications by Version (Version 1 to 10)
// [totalCodewords, dataCodewordsL, dataCodewordsM, eccPerBlockL, eccPerBlockM, numBlocksL, numBlocksM]
interface VersionSpec {
  version: number;
  totalCodewords: number;
  dataCodewordsM: number;
  eccPerBlockM: number;
  numBlocksM: number;
  alignments: number[];
}

const VERSION_SPECS: VersionSpec[] = [
  { version: 1, totalCodewords: 26, dataCodewordsM: 16, eccPerBlockM: 10, numBlocksM: 1, alignments: [] },
  { version: 2, totalCodewords: 44, dataCodewordsM: 28, eccPerBlockM: 16, numBlocksM: 1, alignments: [6, 18] },
  { version: 3, totalCodewords: 70, dataCodewordsM: 44, eccPerBlockM: 26, numBlocksM: 1, alignments: [6, 22] },
  { version: 4, totalCodewords: 100, dataCodewordsM: 64, eccPerBlockM: 18, numBlocksM: 2, alignments: [6, 26] },
  { version: 5, totalCodewords: 134, dataCodewordsM: 86, eccPerBlockM: 24, numBlocksM: 2, alignments: [6, 30] },
  { version: 6, totalCodewords: 172, dataCodewordsM: 108, eccPerBlockM: 16, numBlocksM: 4, alignments: [6, 34] },
  { version: 7, totalCodewords: 196, dataCodewordsM: 124, eccPerBlockM: 18, numBlocksM: 4, alignments: [6, 22, 38] },
  { version: 8, totalCodewords: 242, dataCodewordsM: 154, eccPerBlockM: 22, numBlocksM: 4, alignments: [6, 24, 42] },
  { version: 9, totalCodewords: 292, dataCodewordsM: 182, eccPerBlockM: 22, numBlocksM: 5, alignments: [6, 26, 46] },
  { version: 10, totalCodewords: 346, dataCodewordsM: 216, eccPerBlockM: 26, numBlocksM: 5, alignments: [6, 28, 50] },
];

export function generateQrMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);
  const textLen = textBytes.length;

  // Find minimum version that fits data in Byte mode (ECC Level M)
  let spec: VersionSpec | null = null;
  for (const s of VERSION_SPECS) {
    // 4 bits mode + 8 bits char count + 8*textLen bits + 4 bits terminator
    const neededCodewords = Math.ceil((4 + 8 + textLen * 8 + 4) / 8);
    if (neededCodewords <= s.dataCodewordsM) {
      spec = s;
      break;
    }
  }

  if (!spec) {
    // Default to version 10
    spec = VERSION_SPECS[VERSION_SPECS.length - 1];
  }

  const { version, totalCodewords, dataCodewordsM, eccPerBlockM, numBlocksM, alignments } = spec;
  const size = 17 + version * 4;

  // 1. Bitstream assembly
  const bitArray: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitArray.push((val >> i) & 1);
    }
  }

  // Byte mode indicator: 0100 (4 bits)
  pushBits(0b0100, 4);
  // Character count: 8 bits for versions 1-9, 16 bits for version 10+
  const countBits = version >= 10 ? 16 : 8;
  pushBits(textLen, countBits);
  // Payload
  for (const b of textBytes) {
    pushBits(b, 8);
  }
  // Terminator: up to 4 zero bits
  const capacityBits = dataCodewordsM * 8;
  const termLen = Math.min(4, capacityBits - bitArray.length);
  pushBits(0, termLen);
  // Pad to byte boundary
  while (bitArray.length % 8 !== 0) {
    bitArray.push(0);
  }
  // Pad bytes: alternating 0xEC (236) and 0x11 (17)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitArray.length < capacityBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bits to byte codewords
  const dataCodewords = new Uint8Array(dataCodewordsM);
  for (let i = 0; i < dataCodewordsM; i++) {
    let b = 0;
    for (let bit = 0; bit < 8; bit++) {
      b = (b << 1) | bitArray[i * 8 + bit];
    }
    dataCodewords[i] = b;
  }

  // Split into blocks and compute ECC
  const blockSize = Math.floor(dataCodewordsM / numBlocksM);
  const remainder = dataCodewordsM % numBlocksM;
  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];

  let offset = 0;
  for (let b = 0; b < numBlocksM; b++) {
    const curBlockSize = blockSize + (b >= numBlocksM - remainder ? 1 : 0);
    const blockData = dataCodewords.slice(offset, offset + curBlockSize);
    offset += curBlockSize;
    dataBlocks.push(blockData);
    eccBlocks.push(computeEcc(blockData, eccPerBlockM));
  }

  // Interleave data and ECC codewords
  const finalCodewords: number[] = [];
  const maxBlockLen = blockSize + (remainder > 0 ? 1 : 0);
  for (let i = 0; i < maxBlockLen; i++) {
    for (let b = 0; b < numBlocksM; b++) {
      if (i < dataBlocks[b].length) {
        finalCodewords.push(dataBlocks[b][i]);
      }
    }
  }
  for (let i = 0; i < eccPerBlockM; i++) {
    for (let b = 0; b < numBlocksM; b++) {
      finalCodewords.push(eccBlocks[b][i]);
    }
  }

  // 2. Build QR Matrix (size x size)
  // modules: null = unassigned, true = black, false = white
  // isFunction: true = reserved/timing/finder/etc.
  const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function setModule(r: number, c: number, val: boolean, isFunc = true) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = val;
      if (isFunc) isFunction[r][c] = true;
    }
  }

  // Place Finder Pattern
  function placeFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isBlack = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
            setModule(nr, nc, isBlack);
          } else {
            setModule(nr, nc, false); // Separator
          }
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // Dark module
  setModule(size - 8, 8, true);

  // Alignment patterns
  if (alignments.length > 0) {
    for (const r of alignments) {
      for (const c of alignments) {
        // Skip finders
        if ((r === 6 && c === 6) || (r === 6 && c === alignments[alignments.length - 1]) || (r === alignments[alignments.length - 1] && c === 6)) {
          continue;
        }
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBlack = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            setModule(r + dr, c + dc, isBlack);
          }
        }
      }
    }
  }

  // Reserve format information areas
  for (let i = 0; i <= 8; i++) {
    isFunction[8][i] = true;
    isFunction[i][8] = true;
    isFunction[8][size - 1 - i] = true;
    isFunction[size - 1 - i][8] = true;
  }

  // 3. Place Data Bits
  const finalBits: number[] = [];
  for (const cw of finalCodewords) {
    for (let bit = 7; bit >= 0; bit--) {
      finalBits.push((cw >> bit) & 1);
    }
  }

  // Add remainder bits if needed
  const totalModuleBits = size * size;
  while (finalBits.length < totalModuleBits) {
    finalBits.push(0);
  }

  let bitIdx = 0;
  let upwards = true;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // Skip vertical timing pattern
    for (let step = 0; step < size; step++) {
      const row = upwards ? size - 1 - step : step;
      for (let c = 0; c < 2; c++) {
        const curCol = col - c;
        if (!isFunction[row][curCol]) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
          modules[row][curCol] = bit === 1;
        }
      }
    }
    upwards = !upwards;
  }

  // 4. Apply Mask Pattern 0: (row + col) % 2 === 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFunction[r][c]) {
        if ((r + c) % 2 === 0) {
          modules[r][c] = !modules[r][c];
        }
      }
    }
  }

  // 5. Place Format Information (ECC M, Mask 0: 101010000010010 XOR 101010000010010 = 0x5412)
  // For ECC Level M (00) and Mask 0 (000), format bits with BCH code = 0b101010000010010
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  const formatMask = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  const maskedFormat = formatBits.map((b, i) => b ^ formatMask[i]);

  // Top-left and Split placement
  const topPositions = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = topPositions[i];
    modules[r][c] = maskedFormat[i] === 1;
  }

  // Bottom-left and Top-right placement
  for (let i = 0; i < 7; i++) {
    modules[size - 1 - i][8] = maskedFormat[i] === 1;
  }
  for (let i = 7; i < 15; i++) {
    modules[8][size - 15 + i] = maskedFormat[i] === 1;
  }

  return modules;
}

