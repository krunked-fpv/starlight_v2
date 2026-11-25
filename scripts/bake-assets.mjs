#!/usr/bin/env node
/**
 * Starlight v2 (v3.0.0 HD-2D Overhaul) — Deterministic Procedural Atlas & Vector Icon Baker
 *
 * Pure Node ESM using ONLY built-in modules (`node:fs`, `node:path`, `node:zlib`, `node:crypto`).
 * Zero network calls. 100% deterministic (Mulberry32 seed 20261124, zero timestamps).
 *
 * Outputs:
 *  - public/atlases/terrain-atlas.png       (256x256, 8x8 @ 32x32, regions tile_0..tile_60)
 *  - public/atlases/terrain-normal.png      (256x256, Sobel tangent-space normal map)
 *  - public/atlases/terrain-emissive.png    (256x256, emissive glow mask)
 *  - public/atlases/props-atlas.png         (512x256, 17 curated props w/ 2px gutter)
 *  - public/atlases/props-normal.png        (512x256, Sobel tangent-space normal map)
 *  - public/atlases/props-emissive.png      (512x256, emissive glow mask)
 *  - public/atlases/characters-atlas.png    (512x128, 16 character sprites/portraits w/ 2px gutter)
 *  - public/atlases/fallbacks-atlas.png     (512x128, 11 BodyArchetype fallbacks w/ 2px gutter)
 *  - public/atlases/arenas/*.png            (19 deterministic arena backgrounds)
 *  - public/atlases/manifest.json           (AtlasManifest v3.0.0)
 *  - public/icons/icon-192.png              (copied deterministically from assets-src/icons)
 *  - public/icons/icon-512.png              (copied deterministically from assets-src/icons)
 *  - public/icons/apple-touch-icon.png      (copied deterministically from assets-src/icons)
 *  - public/icons/starlight-icons.svg       (all IconId symbols in 24x24 viewBox, zero emojis)
 *  - public/icons/starlight-emblem.svg      (standalone celestial emblem)
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'assets-src');
const ATLAS_DIR = path.join(ROOT_DIR, 'public', 'atlases');
const ARENA_OUT_DIR = path.join(ATLAS_DIR, 'arenas');
const ICON_DIR = path.join(ROOT_DIR, 'public', 'icons');

const SEED = 20261124;
const MANIFEST_VERSION = '3.0.0';
const MAX_ATLAS_DIM = 2048;

// -----------------------------------------------------------------------------
// Deterministic PRNG & Math Helpers
// -----------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(baseSeed, label) {
  let h = (2166136261 ^ (baseSeed >>> 0)) >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixRgb(c1, c2, t) {
  const k = clamp(t, 0, 1);
  return [
    Math.round(lerp(c1[0], c2[0], k)),
    Math.round(lerp(c1[1], c2[1], k)),
    Math.round(lerp(c1[2], c2[2], k)),
  ];
}

// -----------------------------------------------------------------------------
// Pure-Node Deterministic RGBA PNG Decoder & Encoder (8-bit RGB/RGBA, filters 0..4)
// -----------------------------------------------------------------------------
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngRgba(buf, label = 'unknown.png') {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`Invalid PNG signature in ${label}`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks = [];
  let sawIhdr = false;
  let sawIend = false;

  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buf.length) {
      throw new Error(`Truncated PNG chunk ${type} in ${label}`);
    }
    const chunkData = buf.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      if (length !== 13) throw new Error(`Invalid IHDR length in ${label}`);
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
      const compression = chunkData[10];
      const filter = chunkData[11];
      interlace = chunkData[12];
      if (bitDepth !== 8) {
        throw new Error(`Unsupported PNG bitDepth=${bitDepth} in ${label} (expected 8)`);
      }
      if (colorType !== 2 && colorType !== 6) {
        throw new Error(`Unsupported PNG colorType=${colorType} in ${label} (expected 2 or 6)`);
      }
      if (compression !== 0 || filter !== 0 || interlace !== 0) {
        throw new Error(`Unsupported PNG compression/filter/interlace in ${label}`);
      }
      sawIhdr = true;
    } else if (type === 'IDAT') {
      idatChunks.push(chunkData);
    } else if (type === 'IEND') {
      sawIend = true;
      break;
    }

    offset = dataEnd + 4;
  }

  if (!sawIhdr || !sawIend || idatChunks.length === 0) {
    throw new Error(`Malformed PNG structure in ${label}`);
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const expectedLen = height * (1 + stride);
  if (inflated.length < expectedLen) {
    throw new Error(`Inflated PNG buffer too short in ${label}`);
  }

  const unfiltered = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const rowIn = y * (1 + stride);
    const filterType = inflated[rowIn];
    const rowOut = y * stride;

    for (let i = 0; i < stride; i++) {
      const xByte = inflated[rowIn + 1 + i];
      const a = i >= bpp ? unfiltered[rowOut + i - bpp] : 0;
      const b = y > 0 ? unfiltered[rowOut - stride + i] : 0;
      const c = y > 0 && i >= bpp ? unfiltered[rowOut - stride + i - bpp] : 0;

      let recon = xByte;
      switch (filterType) {
        case 0:
          recon = xByte;
          break;
        case 1:
          recon = (xByte + a) & 0xff;
          break;
        case 2:
          recon = (xByte + b) & 0xff;
          break;
        case 3:
          recon = (xByte + ((a + b) >> 1)) & 0xff;
          break;
        case 4:
          recon = (xByte + paethPredictor(a, b, c)) & 0xff;
          break;
        default:
          throw new Error(`Unsupported PNG scanline filter=${filterType} in ${label}`);
      }
      unfiltered[rowOut + i] = recon;
    }
  }

  if (colorType === 6) {
    return { width, height, data: unfiltered };
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    rgba[p * 4] = unfiltered[p * 3];
    rgba[p * 4 + 1] = unfiltered[p * 3 + 1];
    rgba[p * 4 + 2] = unfiltered[p * 3 + 2];
    rgba[p * 4 + 3] = 255;
  }
  return { width, height, data: rgba };
}

function makePngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crcBuf]);
}

function encodePngRgba(width, height, rgba) {
  if (width > MAX_ATLAS_DIM || height > MAX_ATLAS_DIM) {
    throw new Error(`PNG dimension ${width}x${height} exceeds ${MAX_ATLAS_DIM}x${MAX_ATLAS_DIM}`);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const rowOut = y * (1 + stride);
    const rowIn = y * stride;
    raw[rowOut] = 1; // deterministic Sub filter
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? rgba[rowIn + x - 4] : 0;
      raw[rowOut + 1 + x] = (rgba[rowIn + x] - left) & 0xff;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    PNG_SIGNATURE,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function loadMasterPng(relPath) {
  const fullPath = path.join(SRC_DIR, relPath);
  const buf = fs.readFileSync(fullPath);
  return decodePngRgba(buf, relPath);
}

// -----------------------------------------------------------------------------
// Pixel Image Buffer Helpers
// -----------------------------------------------------------------------------
class PixelImage {
  constructor(width, height, data) {
    this.width = width;
    this.height = height;
    this.data = data ? new Uint8Array(data) : new Uint8Array(width * height * 4);
  }

  clone() {
    return new PixelImage(this.width, this.height, this.data);
  }

  getPixel(x, y) {
    const xi = clamp(Math.floor(x), 0, this.width - 1);
    const yi = clamp(Math.floor(y), 0, this.height - 1);
    const idx = (yi * this.width + xi) * 4;
    return [this.data[idx], this.data[idx + 1], this.data[idx + 2], this.data[idx + 3]];
  }

  setPixel(x, y, r, g, b, a = 255) {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return;
    const idx = (yi * this.width + xi) * 4;
    this.data[idx] = clamp(Math.round(r), 0, 255);
    this.data[idx + 1] = clamp(Math.round(g), 0, 255);
    this.data[idx + 2] = clamp(Math.round(b), 0, 255);
    this.data[idx + 3] = clamp(Math.round(a), 0, 255);
  }

  blendPixel(x, y, r, g, b, a = 255) {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height || a <= 0) return;
    const idx = (yi * this.width + xi) * 4;
    const sa = clamp(a / 255, 0, 1);
    const da = this.data[idx + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) return;
    this.data[idx] = clamp(Math.round((r * sa + this.data[idx] * da * (1 - sa)) / outA), 0, 255);
    this.data[idx + 1] = clamp(Math.round((g * sa + this.data[idx + 1] * da * (1 - sa)) / outA), 0, 255);
    this.data[idx + 2] = clamp(Math.round((b * sa + this.data[idx + 2] * da * (1 - sa)) / outA), 0, 255);
    this.data[idx + 3] = clamp(Math.round(outA * 255), 0, 255);
  }

  blit(src, dx, dy, sx = 0, sy = 0, sw = src.width, sh = src.height) {
    for (let py = 0; py < sh; py++) {
      for (let px = 0; px < sw; px++) {
        const si = ((sy + py) * src.width + (sx + px)) * 4;
        const di = ((dy + py) * this.width + (dx + px)) * 4;
        this.data[di] = src.data[si];
        this.data[di + 1] = src.data[si + 1];
        this.data[di + 2] = src.data[si + 2];
        this.data[di + 3] = src.data[si + 3];
      }
    }
  }
}

function mapPixels(src, fn) {
  const out = src.clone();
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const idx = (y * out.width + x) * 4;
      const [r, g, b, a] = fn(out.data[idx], out.data[idx + 1], out.data[idx + 2], out.data[idx + 3], x, y);
      out.data[idx] = clamp(Math.round(r), 0, 255);
      out.data[idx + 1] = clamp(Math.round(g), 0, 255);
      out.data[idx + 2] = clamp(Math.round(b), 0, 255);
      out.data[idx + 3] = clamp(Math.round(a), 0, 255);
    }
  }
  return out;
}

function tintTile(src, targetRgb, strength, gain = 1.0) {
  return mapPixels(src, (r, g, b, a) => {
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const shaded = [
      targetRgb[0] * (0.45 + lum * 0.85) * gain,
      targetRgb[1] * (0.45 + lum * 0.85) * gain,
      targetRgb[2] * (0.45 + lum * 0.85) * gain,
    ];
    return [
      lerp(r, shaded[0], strength),
      lerp(g, shaded[1], strength),
      lerp(b, shaded[2], strength),
      a,
    ];
  });
}

function blendTiles(base, overlay, alphaFn) {
  return mapPixels(base, (r, g, b, a, x, y) => {
    const idx = (y * overlay.width + x) * 4;
    const t = clamp(alphaFn(x, y, r, g, b, overlay.data[idx], overlay.data[idx + 1], overlay.data[idx + 2]), 0, 1);
    return [
      lerp(r, overlay.data[idx], t),
      lerp(g, overlay.data[idx + 1], t),
      lerp(b, overlay.data[idx + 2], t),
      a,
    ];
  });
}

function buildPathVariant(floorTile, pathTile, tintRgb, edgeStrength = 0.72) {
  const tintedPath = tintTile(pathTile, tintRgb, 0.52, 0.96);
  return mapPixels(floorTile, (fr, fg, fb, fa, x, y) => {
    const idx = (y * tintedPath.width + x) * 4;
    const pr = tintedPath.data[idx];
    const pg = tintedPath.data[idx + 1];
    const pb = tintedPath.data[idx + 2];
    const dx = Math.abs(x - 15.5) / 15.5;
    const dy = Math.abs(y - 15.5) / 15.5;
    const radial = Math.max(dx, dy);
    const weight = radial < 0.72 ? edgeStrength : radial < 0.88 ? edgeStrength * 0.55 : edgeStrength * 0.2;
    return [lerp(fr, pr, weight), lerp(fg, pg, weight), lerp(fb, pb, weight), fa];
  });
}

function buildWallVariant(baseWall, tintRgb, fleckRgb, fleckSeedLabel) {
  const rng = mulberry32(hashSeed(SEED, fleckSeedLabel));
  const out = tintTile(baseWall, tintRgb, 0.65, 0.95);
  // Crisp horizontal strata + beveled top lip
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const idx = (y * 32 + x) * 4;
      if (y <= 1) {
        out.data[idx] = clamp(Math.round(out.data[idx] * 1.24 + 14), 0, 255);
        out.data[idx + 1] = clamp(Math.round(out.data[idx + 1] * 1.24 + 14), 0, 255);
        out.data[idx + 2] = clamp(Math.round(out.data[idx + 2] * 1.24 + 14), 0, 255);
      } else if (y >= 30 || y === 15) {
        out.data[idx] = clamp(Math.round(out.data[idx] * 0.72), 0, 255);
        out.data[idx + 1] = clamp(Math.round(out.data[idx + 1] * 0.72), 0, 255);
        out.data[idx + 2] = clamp(Math.round(out.data[idx + 2] * 0.72), 0, 255);
      }
    }
  }
  if (fleckRgb) {
    for (let i = 0; i < 6; i++) {
      const fx = 3 + Math.floor(rng() * 26);
      const fy = 4 + Math.floor(rng() * 23);
      out.setPixel(fx, fy, fleckRgb[0], fleckRgb[1], fleckRgb[2], 255);
      if (i % 2 === 0) {
        out.setPixel(fx + 1, fy, Math.min(255, fleckRgb[0] + 24), Math.min(255, fleckRgb[1] + 24), Math.min(255, fleckRgb[2] + 24), 255);
      }
    }
  }
  return out;
}

function writeSobelNormalRegion(normalImg, srcImg, ox, oy, tw, th, strength = 2.6, transparentEmpty = false) {
  const lumAt = (lx, ly) => {
    const cx = clamp(lx, 0, tw - 1);
    const cy = clamp(ly, 0, th - 1);
    const idx = ((oy + cy) * srcImg.width + (ox + cx)) * 4;
    const a = srcImg.data[idx + 3] / 255;
    if (a <= 0.02) return 0;
    const l = (0.299 * srcImg.data[idx] + 0.587 * srcImg.data[idx + 1] + 0.114 * srcImg.data[idx + 2]) / 255;
    return l * a;
  };

  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const srcIdx = ((oy + y) * srcImg.width + (ox + x)) * 4;
      const srcAlpha = srcImg.data[srcIdx + 3];
      if (transparentEmpty && srcAlpha === 0) {
        normalImg.setPixel(ox + x, oy + y, 128, 128, 255, 0);
        continue;
      }
      const tl = lumAt(x - 1, y - 1);
      const tc = lumAt(x, y - 1);
      const tr = lumAt(x + 1, y - 1);
      const ml = lumAt(x - 1, y);
      const mr = lumAt(x + 1, y);
      const bl = lumAt(x - 1, y + 1);
      const bc = lumAt(x, y + 1);
      const br = lumAt(x + 1, y + 1);

      const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
      const nx = -gx * strength;
      const ny = -gy * strength;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);

      const nr = Math.round(((nx * invLen) * 0.5 + 0.5) * 255);
      const ng = Math.round(((ny * invLen) * 0.5 + 0.5) * 255);
      const nb = Math.round(((nz * invLen) * 0.5 + 0.5) * 255);
      normalImg.setPixel(ox + x, oy + y, nr, ng, nb, transparentEmpty ? srcAlpha : 255);
    }
  }
}

// -----------------------------------------------------------------------------
// 1. Terrain Atlas Baker (TILE 0..60 -> 8x8 @ 32x32 = 256x256)
// -----------------------------------------------------------------------------
function bakeTerrainAtlases() {
  const M = {
    bridge: new PixelImage(32, 32, loadMasterPng('tiles/bridge.png').data),
    canyonGrass: new PixelImage(32, 32, loadMasterPng('tiles/canyon_grass.png').data),
    caveFloor: new PixelImage(32, 32, loadMasterPng('tiles/cave_floor.png').data),
    cliffWall: new PixelImage(32, 32, loadMasterPng('tiles/cliff_wall.png').data),
    crownFloor: new PixelImage(32, 32, loadMasterPng('tiles/crown_floor.png').data),
    deepWater: new PixelImage(32, 32, loadMasterPng('tiles/deep_water.png').data),
    faeGrass: new PixelImage(32, 32, loadMasterPng('tiles/fae_grass.png').data),
    flowerGrass: new PixelImage(32, 32, loadMasterPng('tiles/flower_grass.png').data),
    grass: new PixelImage(32, 32, loadMasterPng('tiles/grass.png').data),
    iceWall: new PixelImage(32, 32, loadMasterPng('tiles/ice_wall.png').data),
    lava: new PixelImage(32, 32, loadMasterPng('tiles/lava.png').data),
    marshGrass: new PixelImage(32, 32, loadMasterPng('tiles/marsh_grass.png').data),
    path: new PixelImage(32, 32, loadMasterPng('tiles/path.png').data),
    reefWater: new PixelImage(32, 32, loadMasterPng('tiles/reef_water.png').data),
    riftFloor: new PixelImage(32, 32, loadMasterPng('tiles/rift_floor.png').data),
    runeFlagstone: new PixelImage(32, 32, loadMasterPng('tiles/rune_flagstone.png').data),
    sanctumFloor: new PixelImage(32, 32, loadMasterPng('tiles/sanctum_floor.png').data),
    sand: new PixelImage(32, 32, loadMasterPng('tiles/sand.png').data),
    sandstoneWall: new PixelImage(32, 32, loadMasterPng('tiles/sandstone_wall.png').data),
    shallowWater: new PixelImage(32, 32, loadMasterPng('tiles/shallow_water.png').data),
    snowIce: new PixelImage(32, 32, loadMasterPng('tiles/snow_ice.png').data),
    tallGrass: new PixelImage(32, 32, loadMasterPng('tiles/tall_grass.png').data),
    terastalFloor: new PixelImage(32, 32, loadMasterPng('tiles/terastal_floor.png').data),
    volcanoFloor: new PixelImage(32, 32, loadMasterPng('tiles/volcano_floor.png').data),
  };

  const tiles = new Array(61);

  // Core Village & Overworld (0..17)
  tiles[0] = M.grass.clone();
  tiles[1] = M.path.clone();
  tiles[2] = M.tallGrass.clone();
  // 3: TREE (lush canopy tile over grass for fallback/tilemap usage)
  tiles[3] = (() => {
    const t = M.grass.clone();
    const rng = mulberry32(hashSeed(SEED, 'tile_3_tree'));
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const dx = x - 15.5;
        const dy = y - 14.5;
        const d = Math.hypot(dx, dy);
        if (d < 13.5) {
          const shade = d < 7 ? [62, 176, 86] : d < 11 ? [34, 128, 64] : [18, 82, 46];
          const jitter = rng() > 0.72 ? 18 : rng() < 0.2 ? -14 : 0;
          t.setPixel(x, y, shade[0] + jitter, shade[1] + jitter, shade[2] + jitter, 255);
        } else if (y >= 24 && Math.abs(dx) < 3.5) {
          t.setPixel(x, y, 108, 72, 44, 255);
        }
      }
    }
    return t;
  })();
  tiles[4] = M.deepWater.clone();
  tiles[5] = M.shallowWater.clone();
  tiles[6] = M.sand.clone();
  tiles[7] = M.bridge.clone();
  tiles[8] = buildWallVariant(M.cliffWall, [68, 82, 122], [132, 224, 255], 'tile_8_cave_wall');
  tiles[9] = M.caveFloor.clone();
  tiles[10] = buildPathVariant(M.caveFloor, M.path, [94, 122, 168], 0.75);
  // 11: WALL (cottage warm cream & timber masonry)
  tiles[11] = (() => {
    const w = tintTile(M.sandstoneWall, [224, 206, 176], 0.65, 1.04);
    for (let x = 0; x < 32; x++) {
      for (let y = 0; y < 32; y++) {
        if (x < 3 || x > 28 || y === 15 || y === 16) {
          w.setPixel(x, y, 114, 76, 48, 255);
        } else if (y >= 27) {
          w.setPixel(x, y, 98, 92, 104, 255);
        }
      }
    }
    return w;
  })();
  // 12: ROOF (indigo-slate shingle roof with warm gold ridge trim)
  tiles[12] = (() => {
    const r = tintTile(M.cliffWall, [64, 82, 146], 0.78, 1.05);
    for (let y = 0; y < 32; y++) {
      const rowPhase = (y >> 2) & 1;
      for (let x = 0; x < 32; x++) {
        if (y % 4 === 0) {
          r.setPixel(x, y, 36, 46, 92, 255);
        } else if ((x + rowPhase * 4) % 8 === 0) {
          r.setPixel(x, y, 44, 58, 112, 255);
        } else if (y === 30) {
          r.setPixel(x, y, 232, 192, 104, 255);
        }
      }
    }
    return r;
  })();
  tiles[13] = M.flowerGrass.clone();
  // 14: SIGN (grass with crisp wooden signpost tile)
  tiles[14] = (() => {
    const s = M.grass.clone();
    for (let y = 18; y <= 28; y++) {
      for (let x = 14; x <= 17; x++) s.setPixel(x, y, 112, 72, 40, 255);
    }
    for (let y = 8; y <= 18; y++) {
      for (let x = 6; x <= 25; x++) {
        const border = y === 8 || y === 18 || x === 6 || x === 25;
        s.setPixel(x, y, border ? 94 : 204, border ? 58 : 154, border ? 32 : 94, 255);
      }
    }
    for (let x = 9; x <= 22; x++) s.setPixel(x, 11, 88, 56, 32, 255);
    for (let x = 9; x <= 19; x++) s.setPixel(x, 14, 88, 56, 32, 255);
    return s;
  })();
  // 15: HEAL (starlight healing pad on sanctum/rune flagstone — refined carved stone seal)
  tiles[15] = (() => {
    const h = blendTiles(M.sanctumFloor, M.runeFlagstone, () => 0.45);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const dx = Math.abs(x - 15.5);
        const dy = Math.abs(y - 15.5);
        const dist = Math.hypot(dx, dy);
        if (Math.abs(dist - 11.5) < 1.1) {
          h.blendPixel(x, y, 108, 226, 248, 200);
        } else if (Math.abs(dx + dy - 7.5) < 1.0) {
          h.blendPixel(x, y, 134, 244, 214, 210);
        } else if (dist < 2.6) {
          h.blendPixel(x, y, 196, 250, 255, 220);
        }
      }
    }
    return h;
  })();
  // 16: SHRINE (celestial shrine dais tile)
  tiles[16] = (() => {
    const s = M.runeFlagstone.clone();
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const dx = Math.abs(x - 15.5);
        const dy = Math.abs(y - 15.5);
        if (Math.max(dx, dy) > 12.5 && Math.max(dx, dy) < 14.2) {
          s.setPixel(x, y, 240, 202, 108, 255);
        } else if (dx + dy < 6.5) {
          s.setPixel(x, y, 114, 232, 255, 255);
        }
      }
    }
    return s;
  })();
  // 17: CHEST (cobble plinth with golden-wood treasure chest accent)
  tiles[17] = (() => {
    const c = buildPathVariant(M.grass, M.path, [186, 166, 128], 0.85);
    for (let y = 9; y <= 23; y++) {
      for (let x = 7; x <= 24; x++) {
        const rim = y === 9 || y === 23 || x === 7 || x === 24 || y === 15;
        if (rim) c.setPixel(x, y, 238, 194, 86, 255);
        else c.setPixel(x, y, 142, 84, 42, 255);
      }
    }
    c.setPixel(15, 15, 255, 240, 156, 255);
    c.setPixel(16, 15, 255, 240, 156, 255);
    c.setPixel(15, 16, 255, 240, 156, 255);
    c.setPixel(16, 16, 255, 240, 156, 255);
    return c;
  })();

  // Volcano & Peak & Village Lanterns (18..25)
  tiles[18] = M.lava.clone();
  tiles[19] = M.volcanoFloor.clone();
  tiles[20] = buildPathVariant(M.volcanoFloor, M.path, [122, 74, 62], 0.72);
  tiles[21] = M.iceWall.clone();
  tiles[22] = M.snowIce.clone();
  tiles[23] = buildPathVariant(M.snowIce, M.path, [146, 198, 224], 0.7);
  // 24: RUNE_TRAIL (carved twilight flagstone with subtle recessed starlight diamond inlay)
  tiles[24] = (() => {
    const r = M.runeFlagstone.clone();
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const dx = Math.abs(x - 15.5);
        const dy = Math.abs(y - 15.5);
        if (Math.abs(dx + dy - 7.5) < 0.9) {
          r.blendPixel(x, y, 134, 218, 246, 175);
        } else if (dx + dy < 2.2) {
          r.blendPixel(x, y, 238, 206, 128, 200);
        }
      }
    }
    return r;
  })();
  // 25: LANTERN
  tiles[25] = (() => {
    const l = M.path.clone();
    for (let y = 8; y <= 23; y++) {
      for (let x = 8; x <= 23; x++) {
        const d = Math.hypot(x - 15.5, y - 15.5);
        if (d < 4.5) l.setPixel(x, y, 255, 232, 136, 255);
        else if (d < 7.5) l.blendPixel(x, y, 255, 188, 86, 150);
      }
    }
    return l;
  })();

  // Grove (26..27)
  tiles[26] = tintTile(M.grass, [42, 138, 86], 0.52, 0.98);
  tiles[27] = buildPathVariant(tiles[26], M.path, [154, 150, 106], 0.75);

  // Desert (28..30)
  tiles[28] = tintTile(M.sand, [242, 192, 112], 0.48, 0.98);
  tiles[29] = buildPathVariant(tiles[28], M.sandstoneWall, [212, 166, 98], 0.68);
  tiles[30] = M.sandstoneWall.clone();

  // Marsh (31..33)
  tiles[31] = M.marshGrass.clone();
  tiles[32] = buildPathVariant(M.marshGrass, M.bridge, [98, 92, 128], 0.72);
  tiles[33] = buildWallVariant(M.cliffWall, [54, 48, 84], [186, 128, 255], 'tile_33_marsh_wall');

  // Sanctum (34..36)
  tiles[34] = M.sanctumFloor.clone();
  tiles[35] = (() => {
    const sp = buildPathVariant(M.sanctumFloor, M.runeFlagstone, [224, 212, 186], 0.55);
    for (let y = 0; y < 32; y++) {
      sp.setPixel(5, y, 224, 186, 92, 255);
      sp.setPixel(26, y, 224, 186, 92, 255);
    }
    return sp;
  })();
  tiles[36] = buildWallVariant(M.sandstoneWall, [216, 206, 192], [255, 226, 138], 'tile_36_sanctum_wall');

  // Canyon (37..39)
  tiles[37] = M.canyonGrass.clone();
  tiles[38] = buildPathVariant(M.canyonGrass, M.path, [196, 122, 82], 0.75);
  tiles[39] = buildWallVariant(M.sandstoneWall, [168, 76, 52], [255, 196, 128], 'tile_39_canyon_wall');

  // Reef (40..42)
  tiles[40] = M.reefWater.clone();
  tiles[41] = buildPathVariant(M.reefWater, M.sand, [238, 222, 178], 0.76);
  tiles[42] = buildWallVariant(M.cliffWall, [72, 138, 174], [255, 146, 196], 'tile_42_reef_wall');

  // Ruins (43..45)
  tiles[43] = M.runeFlagstone.clone();
  tiles[44] = buildPathVariant(M.runeFlagstone, M.path, [152, 166, 138], 0.72);
  tiles[45] = buildWallVariant(M.cliffWall, [104, 114, 108], [136, 228, 204], 'tile_45_ruins_wall');

  // Rift (46..48)
  tiles[46] = M.riftFloor.clone();
  tiles[47] = (() => {
    const rp = buildPathVariant(M.riftFloor, M.terastalFloor, [96, 72, 178], 0.64);
    for (let y = 0; y < 32; y++) {
      if ((y & 3) === 1) {
        rp.setPixel(6, y, 186, 142, 255, 255);
        rp.setPixel(25, y, 126, 232, 255, 255);
      }
    }
    return rp;
  })();
  tiles[48] = buildWallVariant(M.cliffWall, [44, 24, 78], [218, 126, 255], 'tile_48_rift_wall');

  // Faeveldt (49..51)
  tiles[49] = M.faeGrass.clone();
  tiles[50] = buildPathVariant(M.faeGrass, M.path, [218, 182, 232], 0.72);
  tiles[51] = buildWallVariant(M.cliffWall, [132, 98, 168], [255, 182, 236], 'tile_51_fae_wall');

  // Atoll (52..54)
  tiles[52] = tintTile(M.sand, [252, 236, 188], 0.55, 1.04);
  tiles[53] = buildPathVariant(tiles[52], M.bridge, [214, 198, 164], 0.65);
  tiles[54] = buildWallVariant(M.sandstoneWall, [166, 162, 148], [114, 234, 242], 'tile_54_atoll_wall');

  // Highlands / Crown (55..57)
  tiles[55] = M.crownFloor.clone();
  tiles[56] = buildPathVariant(M.crownFloor, M.path, [126, 138, 162], 0.72);
  tiles[57] = buildWallVariant(M.cliffWall, [74, 88, 118], [174, 214, 246], 'tile_57_crown_wall');

  // Crater / Terastal (58..60)
  tiles[58] = M.terastalFloor.clone();
  tiles[59] = buildPathVariant(M.terastalFloor, M.sanctumFloor, [186, 212, 255], 0.68);
  tiles[60] = buildWallVariant(M.iceWall, [136, 168, 242], [238, 250, 255], 'tile_60_tera_wall');

  // Pack into 8x8 @ 32x32 = 256x256
  const tileSize = 32;
  const cols = 8;
  const rows = 8;
  const width = cols * tileSize; // 256
  const height = rows * tileSize; // 256

  const albedo = new PixelImage(width, height);
  const normal = new PixelImage(width, height);
  const emissive = new PixelImage(width, height);
  const regions = {};
  const tileRegions = {};

  for (let id = 0; id <= 60; id++) {
    const col = id % cols;
    const row = Math.floor(id / cols);
    const ox = col * tileSize;
    const oy = row * tileSize;
    const tile = tiles[id];

    albedo.blit(tile, ox, oy);

    // Sobel tangent-space normal map per 32x32 tile (no bleed across neighbors)
    const isWater = id === 4 || id === 5 || id === 40;
    writeSobelNormalRegion(normal, albedo, ox, oy, tileSize, tileSize, isWater ? 1.8 : 2.9, false);

    // Emissive mask isolation for luminous tiles
    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        const [r, g, b] = tile.getPixel(x, y);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        let er = 0;
        let eg = 0;
        let eb = 0;
        let ea = 0;

        if (id === 18) {
          // Lava molten fissures & bright orange-yellow hot veins only
          if (r > 185 && g > 70 && r > b * 2.0) {
            er = r;
            eg = Math.round(g * 0.88);
            eb = Math.round(b * 0.55);
            ea = 195;
          }
        } else if (id === 19 || id === 20) {
          // Volcano floor: ONLY tiny glowing ember cracks, never the basalt body
          if (r > 195 && g > 105 && r - b >= 95) {
            er = r;
            eg = Math.round(g * 0.85);
            eb = Math.round(b * 0.6);
            ea = 140;
          }
        } else if (id === 15 || id === 16 || id === 24) {
          // Heal pad, Shrine, Rune trail subtle carved glow
          if ((b > 205 && g > 200 && b > r + 25) || (r > 225 && g > 192 && b < 140)) {
            er = r;
            eg = g;
            eb = b;
            ea = 145;
          }
        } else if (id === 25) {
          // Lantern ground warm glow core
          if (r > 235 && g > 195 && lum > 195) {
            er = r;
            eg = g;
            eb = b;
            ea = 165;
          }
        } else if (id === 46 || id === 47 || id === 48) {
          // Rift floor/path/wall: ONLY bright starlight specks & crystal edges, NEVER the dark stone body
          if (lum >= 145 || (b >= 210 && r >= 150)) {
            er = r;
            eg = g;
            eb = b;
            ea = 145;
          }
        } else if (id === 58 || id === 59 || id === 60) {
          // Terastal crystal specular facets only
          if (lum > 228 || (b > 238 && g > 215 && r > 180)) {
            er = r;
            eg = g;
            eb = b;
            ea = 135;
          }
        } else if (id === 8 || id === 9 || id === 10 || id === 21 || id === 33 || id === 49 || id === 50) {
          // Crystal & biolume flecks
          if ((b > 215 && g > 195 && b > r + 35) || (r > 195 && b > 225 && b > g + 45)) {
            er = r;
            eg = g;
            eb = b;
            ea = 145;
          }
        }

        if (ea > 0) {
          emissive.setPixel(ox + x, oy + y, er, eg, eb, ea);
        }
      }
    }

    const regionId = `tile_${id}`;
    regions[regionId] = { id: regionId, x: ox, y: oy, w: tileSize, h: tileSize };
    tileRegions[String(id)] = regionId;
  }

  return { albedo, normal, emissive, regions, tileRegions, width, height, tileSize };
}

// -----------------------------------------------------------------------------
// 2. Shelf Packer & Props / Characters / Fallbacks Atlases (with 2px gutter)
// -----------------------------------------------------------------------------
function packShelf(items, maxWidth, gutter = 2) {
  let cursorX = gutter;
  let cursorY = gutter;
  let shelfH = 0;

  const placements = [];
  for (const item of items) {
    if (cursorX + item.image.width + gutter > maxWidth) {
      cursorX = gutter;
      cursorY += shelfH + gutter;
      shelfH = 0;
    }
    placements.push({ id: item.id, image: item.image, x: cursorX, y: cursorY });
    cursorX += item.image.width + gutter;
    shelfH = Math.max(shelfH, item.image.height);
  }

  const rawHeight = cursorY + shelfH + gutter;
  // Round height up to clean power-of-two (at least 64)
  let height = 64;
  while (height < rawHeight) height *= 2;
  return { width: maxWidth, height, placements };
}

function bakePropsAtlases() {
  const PROP_IDS = [
    'cottage_violet',
    'cottage_lab',
    'fountain',
    'shrine_open',
    'shrine_cleared',
    'landmark_observatory',
    'landmark_obelisk',
    'tree_oak',
    'tree_sakura',
    'tree_pine',
    'tree_palm',
    'prop_mushroom',
    'prop_crystal',
    'lantern',
    'chest_closed',
    'chest_open',
    'signpost',
  ];

  const loaded = PROP_IDS.map((id) => {
    const raw = loadMasterPng(`props/${id}.png`);
    return { id, image: new PixelImage(raw.width, raw.height, raw.data) };
  });

  const packed = packShelf(loaded, 512, 2);
  const albedo = new PixelImage(packed.width, packed.height);
  const normal = new PixelImage(packed.width, packed.height);
  const emissive = new PixelImage(packed.width, packed.height);
  const regions = {};

  for (const p of packed.placements) {
    albedo.blit(p.image, p.x, p.y);
    writeSobelNormalRegion(normal, albedo, p.x, p.y, p.image.width, p.image.height, 2.5, true);

    // Extract luminous pixels per prop kind
    for (let y = 0; y < p.image.height; y++) {
      for (let x = 0; x < p.image.width; x++) {
        const [r, g, b, a] = p.image.getPixel(x, y);
        if (a < 25) continue;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        let emit = false;
        let ea = 225;

        switch (p.id) {
          case 'cottage_violet':
            // Warm glowing windows only
            emit = r >= 225 && g >= 175 && b <= 135;
            ea = 175;
            break;
          case 'cottage_lab':
            // Cyan skylight/window glass only (avoid blowing out cream plaster/roof)
            emit = b >= 205 && g >= 205 && b - r >= 28;
            ea = 175;
            break;
          case 'lantern':
            // Warm lantern glass flame
            emit = r >= 210 && g >= 180 && lum >= 185;
            ea = 195;
            break;
          case 'shrine_open':
            // Cyan/mint glowing shrine crystals
            emit = g >= 185 && b >= 185 && g + b - 2 * r > 28;
            ea = 185;
            break;
          case 'shrine_cleared':
            // Soft amber residual crystal glow
            emit = r >= 230 && g >= 190 && b <= 155;
            ea = 125;
            break;
          case 'fountain':
            // Luminous cyan water highlights
            emit = b >= 200 && g >= 185 && b > r + 25;
            ea = 155;
            break;
          case 'prop_mushroom':
            // Bioluminescent cyan & lavender spots
            emit = (b >= 195 && g >= 165 && b > r + 25) || (b >= 220 && r >= 145 && b > g + 40);
            ea = 175;
            break;
          case 'prop_crystal':
            // Faceted glowing crystal cluster
            emit = b >= 195 && g >= 165 && b > r + 25;
            ea = 175;
            break;
          case 'landmark_obelisk':
            // Carved glowing runes
            emit = b >= 180 && g >= 170 && b > r + 35;
            ea = 185;
            break;
          case 'landmark_observatory':
            // Starlight telescope lens glint & brass lamp
            emit = (r >= 225 && g >= 185 && b <= 135) || (b >= 225 && g >= 215 && b > r + 20);
            ea = 165;
            break;
          case 'chest_open':
            // Treasure gleam inside open chest
            emit = r >= 225 && g >= 180 && b <= 135;
            ea = 200;
            break;
          default:
            emit = false;
        }

        if (emit) {
          emissive.setPixel(p.x + x, p.y + y, r, g, b, Math.min(a, ea));
        }
      }
    }

    regions[p.id] = {
      id: p.id,
      x: p.x,
      y: p.y,
      w: p.image.width,
      h: p.image.height,
    };
  }

  return { albedo, normal, emissive, regions, width: packed.width, height: packed.height, tileSize: 64 };
}

function bakeCharactersAtlas() {
  const CHAR_IDS = [
    'violet_portrait',
    'ozias_portrait',
    'willow_portrait',
    'rival_portrait',
    'violet_down',
    'violet_up',
    'violet_left',
    'violet_right',
    'violet_idle',
    'ozias_down',
    'ozias_up',
    'ozias_left',
    'ozias_right',
    'ozias_idle',
    'willow_idle',
    'rival_idle',
  ];

  const loaded = CHAR_IDS.map((id) => {
    const raw = loadMasterPng(`characters/${id}.png`);
    return { id, image: new PixelImage(raw.width, raw.height, raw.data) };
  });

  const packed = packShelf(loaded, 512, 2);
  const albedo = new PixelImage(packed.width, packed.height);
  const regions = {};

  for (const p of packed.placements) {
    albedo.blit(p.image, p.x, p.y);
    regions[p.id] = {
      id: p.id,
      x: p.x,
      y: p.y,
      w: p.image.width,
      h: p.image.height,
    };
  }

  return { albedo, regions, width: packed.width, height: packed.height, tileSize: 32 };
}

function deriveAquaticFallback(serpentineImg) {
  // Derive a distinct cyan/aqua oceanic serpent archetype from serpentine.png
  const out = mapPixels(serpentineImg, (r, g, b, a, x, y) => {
    if (a === 0) return [0, 0, 0, 0];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    // Shift palette to deep sapphire-aqua with bright seafoam highlights
    const nr = r * 0.25 + 24 * lum;
    const ng = g * 0.55 + 115 * lum;
    const nb = Math.min(255, b * 0.75 + 155 * lum + 28);
    // Subtle bioluminescent aqua fin dots along center spine
    if (lum > 0.72 && (x + y) % 5 === 0) {
      return [142, 248, 255, a];
    }
    return [nr, ng, nb, a];
  });
  return out;
}

function bakeFallbacksAtlas() {
  const BASE_ARCHETYPES = [
    'quadruped',
    'biped',
    'winged',
    'serpentine',
    'crystalline',
    'amorphous',
    'insectoid',
    'draconic',
    'construct',
    'flora',
  ];

  const loaded = BASE_ARCHETYPES.map((id) => {
    const raw = loadMasterPng(`fallbacks/${id}.png`);
    return { id, image: new PixelImage(raw.width, raw.height, raw.data) };
  });

  const serp = loaded.find((item) => item.id === 'serpentine').image;
  loaded.push({ id: 'aquatic', image: deriveAquaticFallback(serp) });

  const packed = packShelf(loaded, 512, 2);
  const albedo = new PixelImage(packed.width, packed.height);
  const regions = {};

  for (const p of packed.placements) {
    albedo.blit(p.image, p.x, p.y);
    regions[p.id] = {
      id: p.id,
      x: p.x,
      y: p.y,
      w: p.image.width,
      h: p.image.height,
    };
  }

  return { albedo, regions, width: packed.width, height: packed.height, tileSize: 48 };
}

// -----------------------------------------------------------------------------
// 3. Zero-Emoji Vector Icon Sprite Sheet (viewBox="0 0 24 24", ALL IconId keys)
// -----------------------------------------------------------------------------
const TYPE_PALETTES = {
  normal: { primary: '#d9d2be', secondary: '#a79f8b', glow: '#fff8e1', dark: '#544e42' },
  grass: { primary: '#4bd478', secondary: '#1f8a4c', glow: '#a9ffbf', dark: '#103b24' },
  fire: { primary: '#ff6b35', secondary: '#c72c1c', glow: '#ffd166', dark: '#4f120b' },
  water: { primary: '#38b6ff', secondary: '#1462b8', glow: '#9be8ff', dark: '#0a254d' },
  electric: { primary: '#ffd93d', secondary: '#e09f00', glow: '#fff6a6', dark: '#4d3600' },
  ice: { primary: '#7be8ff', secondary: '#349ec9', glow: '#dffaff', dark: '#113a4d' },
  fighting: { primary: '#e05246', secondary: '#96221b', glow: '#ff9b8f', dark: '#420d0a' },
  poison: { primary: '#b55cff', secondary: '#6b21a8', glow: '#e4b8ff', dark: '#2c0b4a' },
  ground: { primary: '#d9a05b', secondary: '#8f5a23', glow: '#ffe0a8', dark: '#3d240c' },
  flying: { primary: '#7fb5ff', secondary: '#4575cc', glow: '#d4e8ff', dark: '#1a2f5c' },
  psychic: { primary: '#ff5ca8', secondary: '#b01c6e', glow: '#ffb8df', dark: '#4a092e' },
  bug: { primary: '#9be038', secondary: '#558b16', glow: '#d9ff8f', dark: '#243d07' },
  rock: { primary: '#c7b07b', secondary: '#7d6941', glow: '#f2e2b8', dark: '#382e1b' },
  ghost: { primary: '#816bff', secondary: '#432ea3', glow: '#c8bdff', dark: '#1b1147' },
  dragon: { primary: '#5e7bff', secondary: '#2c3ab8', glow: '#a8baff', dark: '#111857' },
  dark: { primary: '#6e6580', secondary: '#342c42', glow: '#b6a8d4', dark: '#15101f' },
  steel: { primary: '#9cb5c9', secondary: '#5a7287', glow: '#e0f0fc', dark: '#23303d' },
  fairy: { primary: '#ff96d5', secondary: '#c74c9b', glow: '#ffe0f4', dark: '#4d1439' },
};

const BADGE_DEFINITIONS = [
  { index: 1, category: 'elemental', material: 'silver', primaryColor: '#e8e0cc', accentColor: '#fff8de' },
  { index: 2, category: 'elemental', material: 'prism', primaryColor: '#4bd478', accentColor: '#c7ffd8' },
  { index: 3, category: 'elemental', material: 'gold', primaryColor: '#ff6b35', accentColor: '#ffd166' },
  { index: 4, category: 'elemental', material: 'prism', primaryColor: '#38b6ff', accentColor: '#b8f2ff' },
  { index: 5, category: 'elemental', material: 'gold', primaryColor: '#ffd93d', accentColor: '#fff7ad' },
  { index: 6, category: 'elemental', material: 'prism', primaryColor: '#7be8ff', accentColor: '#eafcff' },
  { index: 7, category: 'elemental', material: 'obsidian', primaryColor: '#e05246', accentColor: '#ffb3ab' },
  { index: 8, category: 'elemental', material: 'astral', primaryColor: '#b55cff', accentColor: '#ebcaff' },
  { index: 9, category: 'elemental', material: 'gold', primaryColor: '#d9a05b', accentColor: '#ffe7ba' },
  { index: 10, category: 'elemental', material: 'silver', primaryColor: '#7fb5ff', accentColor: '#e0eeff' },
  { index: 11, category: 'elemental', material: 'astral', primaryColor: '#ff5ca8', accentColor: '#ffc9e4' },
  { index: 12, category: 'elemental', material: 'prism', primaryColor: '#9be038', accentColor: '#e8ffb0' },
  { index: 13, category: 'elemental', material: 'obsidian', primaryColor: '#c7b07b', accentColor: '#f7eccb' },
  { index: 14, category: 'elemental', material: 'astral', primaryColor: '#816bff', accentColor: '#d6ccff' },
  { index: 15, category: 'elemental', material: 'astral', primaryColor: '#5e7bff', accentColor: '#c2d0ff' },
  { index: 16, category: 'elemental', material: 'obsidian', primaryColor: '#7a6f91', accentColor: '#d1c4eb' },
  { index: 17, category: 'elemental', material: 'silver', primaryColor: '#9cb5c9', accentColor: '#ebf6ff' },
  { index: 18, category: 'elemental', material: 'prism', primaryColor: '#ff96d5', accentColor: '#ffe8f7' },
  { index: 19, category: 'mastery', material: 'gold', primaryColor: '#ffd479', accentColor: '#fff5d6' },
  { index: 20, category: 'mastery', material: 'prism', primaryColor: '#66d9ff', accentColor: '#d9f8ff' },
  { index: 21, category: 'mastery', material: 'astral', primaryColor: '#ff8cd9', accentColor: '#ffe3f6' },
  { index: 22, category: 'mastery', material: 'silver', primaryColor: '#78e2d8', accentColor: '#d9fffb' },
  { index: 23, category: 'mastery', material: 'gold', primaryColor: '#ff9e66', accentColor: '#ffe4cf' },
  { index: 24, category: 'mastery', material: 'astral', primaryColor: '#ffe066', accentColor: '#fff9cc' },
  { index: 25, category: 'mastery', material: 'obsidian', primaryColor: '#a27bff', accentColor: '#e2d4ff' },
  { index: 26, category: 'mastery', material: 'prism', primaryColor: '#8cf2ff', accentColor: '#ffffff' },
  { index: 27, category: 'mastery', material: 'gold', primaryColor: '#f5b8ff', accentColor: '#fff2ff' },
  { index: 28, category: 'mastery', material: 'astral', primaryColor: '#ffd966', accentColor: '#96e8ff' },
];

function buildUiSymbols() {
  // All 53 UI IconIds from src/contracts/ui.ts (viewBox="0 0 24 24")
  const defs = [
    ['icon-pokeball', '<circle cx="12" cy="12" r="9.5" fill="url(#g-ball-bot)" stroke="#1b2447" stroke-width="1.6"/><path d="M2.5 12a9.5 9.5 0 0 1 19 0z" fill="url(#g-ball-red)"/><line x1="2.5" y1="12" x2="21.5" y2="12" stroke="#1b2447" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="#f8fbff" stroke="#1b2447" stroke-width="1.5"/><circle cx="12" cy="12" r="1.2" fill="#ffe082"/>'],
    ['icon-greatball', '<circle cx="12" cy="12" r="9.5" fill="url(#g-ball-bot)" stroke="#16214d" stroke-width="1.6"/><path d="M2.5 12a9.5 9.5 0 0 1 19 0z" fill="url(#g-great)"/><path d="M4.5 7.5l3.5 2.5M19.5 7.5L16 10" stroke="#ff5252" stroke-width="2" stroke-linecap="round"/><line x1="2.5" y1="12" x2="21.5" y2="12" stroke="#16214d" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="#ffffff" stroke="#16214d" stroke-width="1.5"/>'],
    ['icon-starball', '<circle cx="12" cy="12" r="9.5" fill="url(#g-star-bot)" stroke="#16214d" stroke-width="1.6"/><path d="M2.5 12a9.5 9.5 0 0 1 19 0z" fill="url(#g-star-top)"/><line x1="2.5" y1="12" x2="21.5" y2="12" stroke="#ffd54f" stroke-width="1.6"/><polygon points="12,4.2 13.4,7.4 16.8,7.7 14.2,9.9 15,13.2 12,11.4 9,13.2 9.8,9.9 7.2,7.7 10.6,7.4" fill="#fff59d"/><circle cx="12" cy="12" r="3" fill="#fffde7" stroke="#16214d" stroke-width="1.4"/><circle cx="12" cy="12" r="1.3" fill="#7ce8ff"/>'],
    ['icon-potion', '<rect x="9.5" y="2.5" width="5" height="3.8" rx="1" fill="#5e6b9c" stroke="#182042" stroke-width="1.2"/><path d="M9 6.5h6l4 5.8A6.8 6.8 0 0 1 17.5 21H6.5A6.8 6.8 0 0 1 5 12.3z" fill="url(#g-potion)" stroke="#182042" stroke-width="1.4"/><path d="M7.5 14c2.5-1.2 6.5 1.2 9 0v4.8a1.5 1.5 0 0 1-1.5 1.5H9a1.5 1.5 0 0 1-1.5-1.5z" fill="#b9f6ca" opacity="0.78"/>'],
    ['icon-star-shard', '<polygon points="12,1.5 16.2,9 22.5,12 16.2,15 12,22.5 7.8,15 1.5,12 7.8,9" fill="url(#g-gold)" stroke="#4a3100" stroke-width="1.2"/><polygon points="12,5.5 14.5,10 18.8,12 14.5,14 12,18.5 9.5,14 5.2,12 9.5,10" fill="#fffde7" opacity="0.88"/>'],
    ['icon-cheer-heart', '<path d="M12 20.5S3.5 14.8 3.5 8.8A4.6 4.6 0 0 1 12 6.2a4.6 4.6 0 0 1 8.5 2.6c0 6-8.5 11.7-8.5 11.7z" fill="url(#g-fairy)" stroke="#ffe8f7" stroke-width="1.3"/><polygon points="12,8 13,10.5 15.5,11.5 13,12.5 12,15 11,12.5 8.5,11.5 11,10.5" fill="#fffde7"/>'],
    ['icon-composure', '<polygon points="12,2.2 20.2,7 20.2,17 12,21.8 3.8,17 3.8,7" fill="url(#g-prism)" stroke="#e0f7fa" stroke-width="1.4"/><polygon points="12,5.8 17.2,8.8 17.2,15.2 12,18.2 6.8,15.2 6.8,8.8" fill="none" stroke="#ffffff" stroke-width="1.1" opacity="0.85"/><circle cx="12" cy="12" r="2.2" fill="#ffffff"/>'],
    ['icon-briefing', '<rect x="4.5" y="3" width="15" height="18" rx="2.2" fill="url(#g-astral)" stroke="#a8c7ff" stroke-width="1.3"/><rect x="8.2" y="1.8" width="7.6" height="3" rx="1.2" fill="#ffd54f"/><line x1="7.5" y1="9" x2="16.5" y2="9" stroke="#9be8ff" stroke-width="1.6" stroke-linecap="round"/><line x1="7.5" y1="12.8" x2="16.5" y2="12.8" stroke="#d4e8ff" stroke-width="1.6" stroke-linecap="round"/><line x1="7.5" y1="16.6" x2="13" y2="16.6" stroke="#ffd54f" stroke-width="1.6" stroke-linecap="round"/>'],
    ['icon-waypoint', '<path d="M12 2.2A7.2 7.2 0 0 1 19.2 9.4C19.2 14.8 12 21.8 12 21.8S4.8 14.8 4.8 9.4A7.2 7.2 0 0 1 12 2.2z" fill="url(#g-gold)" stroke="#231942" stroke-width="1.4"/><circle cx="12" cy="9.4" r="2.8" fill="#182042"/><circle cx="12" cy="9.4" r="1.3" fill="#80f0ff"/>'],
    ['icon-compass', '<circle cx="12" cy="12" r="9.5" fill="url(#g-astral)" stroke="#ffd54f" stroke-width="1.5"/><polygon points="12,5 14.5,12 12,19 9.5,12" fill="url(#g-silver)"/><polygon points="12,5 14.5,12 9.5,12" fill="#ff7675"/><circle cx="12" cy="12" r="1.4" fill="#fffde7"/>'],
    ['icon-warp-safe', '<path d="M3.5 11.5L12 4l8.5 7.5v8.5h-5.5v-5.5h-6V20H3.5z" fill="url(#g-potion)" stroke="#e0f7fa" stroke-width="1.3"/><circle cx="12" cy="10" r="1.6" fill="#fff59d"/>'],
    ['icon-warp-farm', '<path d="M5 17c3-7 8-11 14-11-1 6-5 11-11 12l-3 2z" fill="url(#g-prism)" stroke="#103b24" stroke-width="1.3"/><polygon points="16,4 17,6.5 19.5,7.5 17,8.5 16,11 15,8.5 12.5,7.5 15,6.5" fill="#ffe082"/>'],
    ['icon-shrine', '<path d="M3.5 7.5h17v2.4h-17zM6 9.9h2.4V21H6zM15.6 9.9H18V21h-2.4zM4.5 19.5h15V22h-15z" fill="url(#g-silver)"/><polygon points="12,3.5 15.2,7.5 8.8,7.5" fill="#ffd54f"/><circle cx="12" cy="14.5" r="2.6" fill="url(#g-prism)"/>'],
    ['icon-chest', '<rect x="3" y="7.5" width="18" height="13" rx="2" fill="url(#g-wood)" stroke="#3d240c" stroke-width="1.3"/><line x1="3" y1="12" x2="21" y2="12" stroke="#ffd54f" stroke-width="1.8"/><rect x="10" y="10.5" width="4" height="4.5" rx="0.8" fill="#ffe082" stroke="#3d240c" stroke-width="1"/>'],
    ['icon-fountain', '<ellipse cx="12" cy="18" rx="8.5" ry="3" fill="url(#g-silver)"/><ellipse cx="12" cy="17.2" rx="6.5" ry="2" fill="#4fc3f7"/><rect x="10" y="9" width="4" height="8.5" fill="#cfd8dc"/><path d="M12 9c0-3.8-3.8-4.5-4.5-1.5M12 9c0-3.8 3.8-4.5 4.5-1.5" fill="none" stroke="#80f0ff" stroke-width="1.6" stroke-linecap="round"/>'],
    ['icon-signpost', '<rect x="10.8" y="5.2" width="2.4" height="16.5" fill="#8d5a32"/><path d="M4.5 6.8h12l3 3-3 3h-12z" fill="url(#g-gold)" stroke="#3d240c" stroke-width="1.1"/><line x1="7" y1="9.8" x2="14" y2="9.8" stroke="#3d240c" stroke-width="1.3"/>'],
    ['icon-starfall', '<path d="M4.5 4.5l9 9" stroke="#9be8ff" stroke-width="2" stroke-linecap="round"/><path d="M7.5 3l6 6" stroke="#ffe082" stroke-width="1.4" stroke-linecap="round"/><polygon points="15,7.5 16.8,11.6 21,12 17.7,14.8 18.8,19.1 15,16.8 11.2,19.1 12.3,14.8 9,12 13.2,11.6" fill="url(#g-gold)"/>'],
    ['icon-pokedex', '<rect x="4" y="3" width="16" height="18" rx="2.8" fill="url(#g-ball-red)" stroke="#1b2447" stroke-width="1.4"/><circle cx="8.5" cy="7.5" r="2.2" fill="#80f0ff" stroke="#ffffff" stroke-width="1"/><rect x="7.5" y="12" width="9" height="6" rx="1.2" fill="#102042" stroke="#ffd54f" stroke-width="1"/>'],
    ['icon-team', '<circle cx="8.5" cy="9" r="3" fill="url(#g-prism)"/><circle cx="15.5" cy="9" r="3" fill="url(#g-gold)"/><path d="M3.5 19a5 5 0 0 1 10 0z" fill="url(#g-potion)"/><path d="M10.5 19a5 5 0 0 1 10 0z" fill="url(#g-astral)" stroke="#ffe082" stroke-width="0.9"/>'],
    ['icon-badges', '<polygon points="12,2.2 18.8,6 20.2,13.5 12,21.8 3.8,13.5 5.2,6" fill="url(#g-gold)" stroke="#4a3100" stroke-width="1.2"/><polygon points="12,6 15.8,11.2 12,18 8.2,11.2" fill="url(#g-prism)"/>'],
    ['icon-guide', '<path d="M4 5.5a3 3 0 0 1 3-2h4.5v16H7a3 3 0 0 0-3 2zM20 5.5a3 3 0 0 0-3-2h-4.5v16H17a3 3 0 0 1 3 2z" fill="url(#g-astral)" stroke="#b8d0ff" stroke-width="1.2"/><line x1="6.5" y1="8" x2="9.5" y2="8" stroke="#ffd54f" stroke-width="1.3"/><line x1="14.5" y1="8" x2="17.5" y2="8" stroke="#9be8ff" stroke-width="1.3"/>'],
    ['icon-style', '<path d="M12 3l3 3.8 4.5-1.5L18 19.5H6L4.5 5.3 9 6.8z" fill="url(#g-astral)" stroke="#ffd4f0" stroke-width="1.3"/><circle cx="12" cy="12" r="2.2" fill="#ffe082"/>'],
    ['icon-skyhop', '<path d="M3 15c3.8-7.5 10.5-10.5 18-9-3.8 3-6 6-7.5 10.5l-3.8-2.2-3.7 3z" fill="url(#g-prism)" stroke="#102854" stroke-width="1.2"/><circle cx="15.8" cy="8.2" r="1.5" fill="#fff9c4"/>'],
    ['icon-settings', '<circle cx="12" cy="12" r="7.4" fill="none" stroke="url(#g-silver)" stroke-width="3" stroke-dasharray="3 2.2"/><circle cx="12" cy="12" r="3.6" fill="url(#g-astral)" stroke="#e0f7fa" stroke-width="1.2"/>'],
    ['icon-audio-on', '<polygon points="3.8,9 8.2,9 13.5,4.5 13.5,19.5 8.2,15 3.8,15" fill="url(#g-silver)"/><path d="M16.2 8.6a4.8 4.8 0 0 1 0 6.8M18.4 6.4a7.8 7.8 0 0 1 0 11.2" fill="none" stroke="#80f0ff" stroke-width="1.6" stroke-linecap="round"/>'],
    ['icon-audio-off', '<polygon points="3.8,9 8.2,9 13.5,4.5 13.5,19.5 8.2,15 3.8,15" fill="#8a94b0"/><line x1="15.8" y1="8.2" x2="21" y2="15.8" stroke="#ff7675" stroke-width="1.9" stroke-linecap="round"/><line x1="21" y1="8.2" x2="15.8" y2="15.8" stroke="#ff7675" stroke-width="1.9" stroke-linecap="round"/>'],
    ['icon-crt', '<rect x="3" y="4.5" width="18" height="13.5" rx="2.2" fill="#182042" stroke="url(#g-silver)" stroke-width="1.5"/><line x1="5.2" y1="8.2" x2="18.8" y2="8.2" stroke="#7ce8ff" stroke-width="1.2" opacity="0.8"/><line x1="5.2" y1="11.2" x2="18.8" y2="11.2" stroke="#ff8cd9" stroke-width="1.2" opacity="0.8"/><line x1="5.2" y1="14.2" x2="18.8" y2="14.2" stroke="#7ce8ff" stroke-width="1.2" opacity="0.8"/><line x1="8.2" y1="20.2" x2="15.8" y2="20.2" stroke="#cfd8dc" stroke-width="1.8" stroke-linecap="round"/>'],
    ['icon-motion', '<path d="M3.8 13.5c3-6 7.5-6 10.5 0s6 3 6-3" fill="none" stroke="url(#g-prism)" stroke-width="2" stroke-linecap="round"/><circle cx="18" cy="8.2" r="2.2" fill="#ffe082"/>'],
    ['icon-save', '<path d="M4.5 3.8h12l3.8 3.8v12.6H4.5z" fill="url(#g-astral)" stroke="#b8d0ff" stroke-width="1.3"/><rect x="7.5" y="3.8" width="7.5" height="5.2" fill="#eef4ff"/><rect x="6.8" y="12" width="10.5" height="6" rx="1.1" fill="#ffd54f"/>'],
    ['icon-bond', '<path d="M12 20.2S3.8 14.6 3.8 8.6A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8.2 2.6c0 6-8.2 11.6-8.2 11.6z" fill="url(#g-fairy)" stroke="#ffe8f7" stroke-width="1.3"/>'],
    ['icon-star-rank', '<polygon points="12,2.2 14.8,8.4 21.6,9.2 16.6,13.8 18,20.5 12,17.1 6,20.5 7.4,13.8 2.4,9.2 9.2,8.4" fill="url(#g-gold)" stroke="#5c3d00" stroke-width="1.1"/>'],
    ['icon-crown', '<path d="M3 17.2L4.5 7.5l4.9 4.5L12 6l2.6 6 4.9-4.5 1.5 9.7z" fill="url(#g-gold)" stroke="#5c3d00" stroke-width="1.2"/><rect x="3.8" y="18" width="16.4" height="2.2" rx="0.8" fill="#ffe082"/><circle cx="12" cy="13.5" r="1.5" fill="#80f0ff"/>'],
    ['icon-trophy', '<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="url(#g-gold)" stroke="#5c3d00" stroke-width="1.2"/><path d="M7 5.5H4.5a2.5 2.5 0 0 0 2.5 4.2M17 5.5h2.5A2.5 2.5 0 0 1 17 9.7" fill="none" stroke="#ffd54f" stroke-width="1.4"/><rect x="10.8" y="14" width="2.4" height="3.5" fill="#ffd54f"/><rect x="7.5" y="17.5" width="9" height="2.5" rx="0.8" fill="url(#g-gold)"/>'],
    ['icon-shield', '<path d="M12 2.5l7.5 3v6c0 4.8-3.2 8.4-7.5 10-4.3-1.6-7.5-5.2-7.5-10v-6z" fill="url(#g-prism)" stroke="#e0f7fa" stroke-width="1.3"/><path d="M12 5.8v12.4" stroke="#ffffff" stroke-width="1.3" opacity="0.8"/>'],
    ['icon-sword', '<path d="M18.5 3.5l2 2-9.5 9.5-2-2z" fill="url(#g-silver)" stroke="#1b2447" stroke-width="1.1"/><path d="M6.5 12.5l5 5-2 2-5-5z" fill="url(#g-gold)"/><line x1="3.5" y1="20.5" x2="7.5" y2="16.5" stroke="#8d5a32" stroke-width="2.2" stroke-linecap="round"/>'],
    ['icon-sparkle', '<polygon points="12,2 14.2,9.8 22,12 14.2,14.2 12,22 9.8,14.2 2,12 9.8,9.8" fill="url(#g-gold)"/><circle cx="18.5" cy="5.5" r="1.4" fill="#80f0ff"/><circle cx="5.5" cy="18.5" r="1.2" fill="#ff96d5"/>'],
    ['icon-gem', '<polygon points="7.5,4 16.5,4 21,9.5 12,20.5 3,9.5" fill="url(#g-prism)" stroke="#ffffff" stroke-width="1.2"/><polyline points="3,9.5 21,9.5" fill="none" stroke="#ffffff" stroke-width="1"/><polyline points="7.5,4 12,20.5 16.5,4" fill="none" stroke="#e0f7fa" stroke-width="0.9"/>'],
    ['icon-evolve', '<path d="M12 3a9 9 0 0 1 8.5 6M12 21a9 9 0 0 1-8.5-6" fill="none" stroke="url(#g-prism)" stroke-width="2" stroke-linecap="round"/><polygon points="20.5,4.5 21,9.5 16.5,8" fill="#80f0ff"/><polygon points="3.5,19.5 3,14.5 7.5,16" fill="#ffd54f"/><circle cx="12" cy="12" r="2.8" fill="url(#g-gold)"/>'],
    ['icon-quest', '<path d="M5 3.5h11l3 3v14H5z" fill="url(#g-wood)" stroke="#ffd54f" stroke-width="1.2"/><line x1="8" y1="9" x2="16" y2="9" stroke="#fff8d6" stroke-width="1.5" stroke-linecap="round"/><line x1="8" y1="13" x2="16" y2="13" stroke="#fff8d6" stroke-width="1.5" stroke-linecap="round"/><circle cx="15.5" cy="16.5" r="2" fill="#80f0ff"/>'],
    ['icon-rival', '<polygon points="12,2.5 16,8 21.5,8.5 17.5,13 18.5,19 12,16 5.5,19 6.5,13 2.5,8.5 8,8" fill="url(#g-super-potion)" stroke="#ffd4f0" stroke-width="1.2"/><circle cx="12" cy="11.5" r="2.2" fill="#fff59d"/>'],
    ['icon-lab', '<path d="M9.5 3.5h5v4.5l5.2 9.2A2.5 2.5 0 0 1 17.5 21h-11a2.5 2.5 0 0 1-2.2-3.8L9.5 8z" fill="url(#g-potion)" stroke="#e0f7fa" stroke-width="1.3"/><line x1="8" y1="3.5" x2="16" y2="3.5" stroke="#ffd54f" stroke-width="1.8" stroke-linecap="round"/><circle cx="10.5" cy="16.5" r="1.3" fill="#ffffff"/><circle cx="14" cy="14.5" r="1" fill="#fff59d"/>'],
    ['icon-lock', '<path d="M7.5 10.5V7.8a4.5 4.5 0 0 1 9 0v2.7" fill="none" stroke="url(#g-silver)" stroke-width="2" stroke-linecap="round"/><rect x="5.5" y="10.5" width="13" height="10" rx="2" fill="url(#g-gold)" stroke="#4a3100" stroke-width="1.2"/><circle cx="12" cy="15.2" r="1.5" fill="#182042"/>'],
    ['icon-check', '<circle cx="12" cy="12" r="9.5" fill="url(#g-potion)" stroke="#b9f6ca" stroke-width="1.4"/><polyline points="7.5,12.2 10.6,15.4 16.8,9" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'],
    ['icon-warn', '<polygon points="12,3 21.5,19.5 2.5,19.5" fill="url(#g-gold)" stroke="#4a3100" stroke-width="1.4" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="14" stroke="#182042" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.8" r="1.1" fill="#182042"/>'],
    ['icon-danger', '<polygon points="8,2.5 16,2.5 21.5,8 21.5,16 16,21.5 8,21.5 2.5,16 2.5,8" fill="url(#g-ball-red)" stroke="#ffd6d6" stroke-width="1.3"/><line x1="8.8" y1="8.8" x2="15.2" y2="15.2" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><line x1="15.2" y1="8.8" x2="8.8" y2="15.2" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>'],
    ['icon-balance', '<line x1="12" y1="4" x2="12" y2="19.5" stroke="#ffd54f" stroke-width="1.8"/><line x1="5" y1="7.5" x2="19" y2="7.5" stroke="url(#g-silver)" stroke-width="1.8" stroke-linecap="round"/><path d="M5 7.5L3 13h4zM19 7.5L17 13h4z" fill="url(#g-prism)"/><line x1="8" y1="20" x2="16" y2="20" stroke="#ffd54f" stroke-width="2" stroke-linecap="round"/>'],
    ['icon-close', '<circle cx="12" cy="12" r="9" fill="#1b2447" stroke="url(#g-silver)" stroke-width="1.3"/><line x1="8.2" y1="8.2" x2="15.8" y2="15.8" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><line x1="15.8" y1="8.2" x2="8.2" y2="15.8" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>'],
    ['icon-cape', '<path d="M7.5 4.5h9L19.5 19l-7.5-2.5L4.5 19z" fill="url(#g-fairy)" stroke="#ffe0f4" stroke-width="1.3"/><path d="M8.5 4.5h7l-.8 3h-5.4z" fill="#ffd54f"/>'],
    ['icon-hat', '<path d="M6.5 14c0-4.2 2.4-7.5 5.5-7.5s5.5 3.3 5.5 7.5z" fill="url(#g-astral)" stroke="#a8c7ff" stroke-width="1.2"/><ellipse cx="12" cy="14.5" rx="9" ry="2.6" fill="url(#g-gold)" stroke="#4a3100" stroke-width="1.1"/>'],
    ['icon-aura', '<circle cx="12" cy="12" r="7.5" fill="none" stroke="url(#g-prism)" stroke-width="1.6" stroke-dasharray="3 2"/><polygon points="12,5 13.8,10.2 19,12 13.8,13.8 12,19 10.2,13.8 5,12 10.2,10.2" fill="url(#g-gold)"/>'],
    ['icon-pause', '<circle cx="12" cy="12" r="9.5" fill="url(#g-astral)" stroke="#b8d0ff" stroke-width="1.3"/><rect x="8.5" y="7.5" width="2.4" height="9" rx="0.8" fill="#ffffff"/><rect x="13.1" y="7.5" width="2.4" height="9" rx="0.8" fill="#ffffff"/>'],
    ['icon-play', '<circle cx="12" cy="12" r="9.5" fill="url(#g-potion)" stroke="#e0f7fa" stroke-width="1.3"/><polygon points="9.5,7.5 17.2,12 9.5,16.5" fill="#ffffff"/>'],
    ['icon-dash', '<path d="M4 8.5h8M2.5 12h10.5M4.5 15.5h7" stroke="#80f0ff" stroke-width="1.8" stroke-linecap="round"/><polygon points="13,6.5 21,12 13,17.5 15.2,12" fill="url(#g-gold)"/>'],
  ];

  return defs.map(([id, body]) => `<symbol id="${id}" viewBox="0 0 24 24">${body}</symbol>`);
}

function buildTypeSymbols() {
  const glyphs = {
    normal: '<circle cx="12" cy="12" r="4.5" fill="none" stroke="#ffffff" stroke-width="1.8"/><circle cx="12" cy="12" r="1.7" fill="#ffffff"/>',
    grass: '<path d="M12 5.2c3.8 2.2 5.2 6 3 10.5-3.8 0-6.8-3-6.8-6.8 0-1.5 1.5-3 3.8-3.7z" fill="#ffffff"/><line x1="9" y1="15.8" x2="13.5" y2="9.8" stroke="#1f8a4c" stroke-width="1.4"/>',
    fire: '<path d="M12 4.5c1.5 3 4.5 4.5 4.5 8.2a4.5 4.5 0 0 1-9 0c0-2.2 1.5-3.8 2.2-5.2 0 1.5.8 2.2 1.5 2.2-.8-1.5 0-3.7.8-5.2z" fill="#ffffff"/>',
    water: '<path d="M12 4.5c3 4.5 4.5 6.8 4.5 9a4.5 4.5 0 0 1-9 0c0-2.2 1.5-4.5 4.5-9z" fill="#ffffff"/>',
    electric: '<polygon points="13.5,4.5 7.5,12.8 11.6,12.8 10.1,19.5 16.5,10.9 12.4,10.9" fill="#ffffff"/>',
    ice: '<polygon points="12,4.5 16.5,9 16.5,15 12,19.5 7.5,15 7.5,9" fill="none" stroke="#ffffff" stroke-width="1.7"/><circle cx="12" cy="12" r="1.9" fill="#ffffff"/>',
    fighting: '<rect x="7.5" y="8.2" width="9" height="7.5" rx="2.2" fill="#ffffff"/><line x1="9.8" y1="8.2" x2="9.8" y2="11.2" stroke="#96221b" stroke-width="1.2"/><line x1="14.2" y1="8.2" x2="14.2" y2="11.2" stroke="#96221b" stroke-width="1.2"/>',
    poison: '<circle cx="9.8" cy="10.5" r="2.6" fill="#ffffff"/><circle cx="14.2" cy="11.2" r="2.2" fill="#ffffff"/><circle cx="12" cy="15" r="2.2" fill="#ffffff"/>',
    ground: '<polygon points="4.5,17.2 9.8,7.5 13.5,12.8 15.8,9.8 19.5,17.2" fill="#ffffff"/>',
    flying: '<path d="M5.2 14.2c3-5.2 8.2-7.5 13.5-6-2.2 2.2-4.5 4.5-5.2 7.5l-3-1.5-3 2.2z" fill="#ffffff"/>',
    psychic: '<ellipse cx="12" cy="12" rx="6" ry="3.8" fill="none" stroke="#ffffff" stroke-width="1.7"/><circle cx="12" cy="12" r="2" fill="#ffffff"/>',
    bug: '<ellipse cx="12" cy="12.8" rx="3.8" ry="4.5" fill="#ffffff"/><circle cx="12" cy="7.5" r="1.9" fill="#ffffff"/><path d="M8.2 9.8L6 7.5M15.8 9.8L18 7.5" stroke="#ffffff" stroke-width="1.4"/>',
    rock: '<polygon points="7.5,16.5 6,10.5 11.2,6 17.2,9 16.5,16.5" fill="#ffffff"/>',
    ghost: '<path d="M7.5 17.2V10.5a4.5 4.5 0 0 1 9 0v6.7l-2.2-1.5-2.3 1.5-2.2-1.5z" fill="#ffffff"/><circle cx="10.5" cy="10.5" r="1" fill="#432ea3"/><circle cx="13.5" cy="10.5" r="1" fill="#432ea3"/>',
    dragon: '<path d="M6.8 15.8c.8-5.2 4.5-9 9.8-8.2-1.5 2.2-.8 4.5 1.5 6-3 .8-4.5 3-6 4.5z" fill="#ffffff"/>',
    dark: '<path d="M14.2 6a6 6 0 1 0 3 10.5A4.9 4.9 0 0 1 14.2 6z" fill="#ffffff"/>',
    steel: '<polygon points="12,5.2 18,8.6 18,15.4 12,18.8 6,15.4 6,8.6" fill="none" stroke="#ffffff" stroke-width="1.8"/><circle cx="12" cy="12" r="1.9" fill="#ffffff"/>',
    fairy: '<polygon points="12,4.5 13.9,9.8 19.5,12 13.9,14.2 12,19.5 10.1,14.2 4.5,12 10.1,9.8" fill="#ffffff"/>',
  };

  return Object.entries(TYPE_PALETTES).map(([type, pal]) => {
    const gradId = `gt-${type}`;
    return `<symbol id="icon-type-${type}" viewBox="0 0 24 24"><defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${pal.glow}"/><stop offset="48%" stop-color="${pal.primary}"/><stop offset="100%" stop-color="${pal.secondary}"/></linearGradient></defs><circle cx="12" cy="12" r="10.2" fill="url(#${gradId})" stroke="${pal.dark}" stroke-width="1.4"/>${glyphs[type]}</symbol>`;
  });
}

function buildBadgeSymbols() {
  const matFrames = {
    gold: { hi: '#fff3b0', mid: '#f5b841', lo: '#8c5a00' },
    silver: { hi: '#ffffff', mid: '#b8cbe0', lo: '#4e6078' },
    prism: { hi: '#ffffff', mid: '#7ce8ff', lo: '#5e7bff' },
    obsidian: { hi: '#b6a8d4', mid: '#4b4066', lo: '#171226' },
    astral: { hi: '#ffe3f6', mid: '#a27bff', lo: '#2b1961' },
  };

  return BADGE_DEFINITIONS.map((b) => {
    const mf = matFrames[b.material];
    const gid = `gb-${b.index}`;
    const fid = `gbf-${b.index}`;
    const outer = b.category === 'mastery'
      ? '<polygon points="12,1.5 15.8,6 21,6.8 19.5,12 21,17.2 15.8,18 12,22.5 8.2,18 3,17.2 4.5,12 3,6.8 8.2,6" '
      : '<polygon points="12,1.9 20.2,6.4 20.2,17.6 12,22.1 3.8,17.6 3.8,6.4" ';
    const inner = b.index % 3 === 0
      ? '<polygon points="12,5.2 16.5,12 12,18.8 7.5,12" '
      : b.index % 3 === 1
        ? '<circle cx="12" cy="12" r="5.6" '
        : '<polygon points="12,5.6 14.1,10.1 18.8,10.6 15.3,14 16.2,18.6 12,16.4 7.8,18.6 8.7,14 5.2,10.6 9.9,10.1" ';
    return `<symbol id="icon-badge-${b.index}" viewBox="0 0 24 24"><defs><linearGradient id="${fid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${mf.hi}"/><stop offset="50%" stop-color="${mf.mid}"/><stop offset="100%" stop-color="${mf.lo}"/></linearGradient><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${b.accentColor}"/><stop offset="100%" stop-color="${b.primaryColor}"/></linearGradient></defs>${outer}fill="url(#${fid})" stroke="#121833" stroke-width="1.2"/>${inner}fill="url(#${gid})" stroke="${mf.hi}" stroke-width="0.9"/><circle cx="12" cy="12" r="1.6" fill="#ffffff" opacity="0.9"/></symbol>`;
  });
}

function assertZeroEmoji(text, label) {
  const EMOJI_REGEX = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u2600-\u27BF\u2B00-\u2BFF\uFE0E\uFE0F\u20E3\u200D]/gu;
  const match = text.match(EMOJI_REGEX);
  if (match) {
    throw new Error(`Found forbidden Unicode emoji in ${label}: ${JSON.stringify(match)}`);
  }
}

function bakeIconsSvg() {
  const defs = `<defs>
  <linearGradient id="g-ball-red" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff8a80"/><stop offset="50%" stop-color="#e53935"/><stop offset="100%" stop-color="#8e0000"/></linearGradient>
  <linearGradient id="g-ball-bot" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#cfd8dc"/></linearGradient>
  <linearGradient id="g-great" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#64b5f6"/><stop offset="50%" stop-color="#1e88e5"/><stop offset="100%" stop-color="#0d47a1"/></linearGradient>
  <linearGradient id="g-star-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7ce8ff"/><stop offset="50%" stop-color="#3b6ef5"/><stop offset="100%" stop-color="#1a237e"/></linearGradient>
  <linearGradient id="g-star-bot" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f5f9ff"/><stop offset="100%" stop-color="#b0c4de"/></linearGradient>
  <linearGradient id="g-potion" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a5f3fc"/><stop offset="50%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#0284c7"/></linearGradient>
  <linearGradient id="g-super-potion" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f0abfc"/><stop offset="50%" stop-color="#c026d3"/><stop offset="100%" stop-color="#6b21a8"/></linearGradient>
  <linearGradient id="g-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff8d6"/><stop offset="48%" stop-color="#ffd54f"/><stop offset="100%" stop-color="#c67c00"/></linearGradient>
  <linearGradient id="g-silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="50%" stop-color="#cfd8dc"/><stop offset="100%" stop-color="#607d8b"/></linearGradient>
  <linearGradient id="g-prism" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e0f7fa"/><stop offset="50%" stop-color="#64d8ff"/><stop offset="100%" stop-color="#7c4dff"/></linearGradient>
  <linearGradient id="g-astral" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#b388ff"/><stop offset="50%" stop-color="#536dfe"/><stop offset="100%" stop-color="#1a237e"/></linearGradient>
  <linearGradient id="g-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#d7995b"/><stop offset="100%" stop-color="#7c471b"/></linearGradient>
  <linearGradient id="g-fairy" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffe0f4"/><stop offset="50%" stop-color="#ff80ab"/><stop offset="100%" stop-color="#c51162"/></linearGradient>
</defs>`;

  const symbols = [
    ...buildUiSymbols(),
    ...buildTypeSymbols(),
    ...buildBadgeSymbols(),
  ];

  const iconIds = [];
  for (const sym of symbols) {
    const m = /<symbol\s+id="([^"]+)"/.exec(sym);
    if (m) iconIds.push(m[1]);
  }
  iconIds.sort();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden">\n${defs}\n${symbols.join('\n')}\n</svg>\n`;
  assertZeroEmoji(svg, 'public/icons/starlight-icons.svg');
  return { svg, iconIds };
}

function bakeEmblemSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="emblem-bg" cx="50%" cy="42%" r="58%">
      <stop offset="0%" stop-color="#273a82"/>
      <stop offset="65%" stop-color="#0f173b"/>
      <stop offset="100%" stop-color="#080c1d"/>
    </radialGradient>
    <linearGradient id="emblem-ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff5b8"/>
      <stop offset="50%" stop-color="#ffd166"/>
      <stop offset="100%" stop-color="#7ce8ff"/>
    </linearGradient>
    <linearGradient id="emblem-star" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="45%" stop-color="#ffe082"/>
      <stop offset="100%" stop-color="#ff96d5"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#emblem-bg)"/>
  <circle cx="32" cy="32" r="24" fill="none" stroke="url(#emblem-ring)" stroke-width="2.5" opacity="0.9"/>
  <circle cx="32" cy="32" r="18" fill="none" stroke="#80d8ff" stroke-width="1" stroke-dasharray="3 3" opacity="0.65"/>
  <polygon points="32,10 37.5,24.5 52,32 37.5,39.5 32,54 26.5,39.5 12,32 26.5,24.5" fill="url(#emblem-star)"/>
  <circle cx="32" cy="32" r="4.5" fill="#0b1026" stroke="#fff8e1" stroke-width="1.5"/>
  <circle cx="17" cy="17" r="1.6" fill="#fff59d"/>
  <circle cx="48" cy="18" r="1.4" fill="#80f0ff"/>
  <circle cx="47" cy="47" r="1.6" fill="#ff96d5"/>
</svg>\n`;
  assertZeroEmoji(svg, 'public/icons/starlight-emblem.svg');
  return svg;
}

// -----------------------------------------------------------------------------
// 4. Main Deterministic Pipeline
// -----------------------------------------------------------------------------
const ARENA_IDS = [
  'village',
  'forest',
  'cave',
  'water',
  'volcano',
  'peak',
  'grove',
  'desert',
  'marsh',
  'sanctum',
  'canyon',
  'reef',
  'ruins',
  'rift',
  'faeveldt',
  'atoll',
  'highlands',
  'crater',
  'skyhop',
];

const APP_ICON_PNGS = ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

function main() {
  fs.mkdirSync(ATLAS_DIR, { recursive: true });
  fs.mkdirSync(ARENA_OUT_DIR, { recursive: true });
  fs.mkdirSync(ICON_DIR, { recursive: true });

  const terrain = bakeTerrainAtlases();
  const props = bakePropsAtlases();
  const chars = bakeCharactersAtlas();
  const fallbacks = bakeFallbacksAtlas();
  const icons = bakeIconsSvg();
  const emblemSvg = bakeEmblemSvg();

  const filesToWrite = [
    { path: path.join(ATLAS_DIR, 'terrain-atlas.png'), buf: encodePngRgba(terrain.width, terrain.height, terrain.albedo.data) },
    { path: path.join(ATLAS_DIR, 'terrain-normal.png'), buf: encodePngRgba(terrain.width, terrain.height, terrain.normal.data) },
    { path: path.join(ATLAS_DIR, 'terrain-emissive.png'), buf: encodePngRgba(terrain.width, terrain.height, terrain.emissive.data) },
    { path: path.join(ATLAS_DIR, 'props-atlas.png'), buf: encodePngRgba(props.width, props.height, props.albedo.data) },
    { path: path.join(ATLAS_DIR, 'props-normal.png'), buf: encodePngRgba(props.width, props.height, props.normal.data) },
    { path: path.join(ATLAS_DIR, 'props-emissive.png'), buf: encodePngRgba(props.width, props.height, props.emissive.data) },
    { path: path.join(ATLAS_DIR, 'characters-atlas.png'), buf: encodePngRgba(chars.width, chars.height, chars.albedo.data) },
    { path: path.join(ATLAS_DIR, 'fallbacks-atlas.png'), buf: encodePngRgba(fallbacks.width, fallbacks.height, fallbacks.albedo.data) },
    { path: path.join(ICON_DIR, 'starlight-icons.svg'), buf: Buffer.from(icons.svg, 'utf8') },
    { path: path.join(ICON_DIR, 'starlight-emblem.svg'), buf: Buffer.from(emblemSvg, 'utf8') },
  ];

  const arenas = {};
  for (const id of ARENA_IDS) {
    const srcBuf = fs.readFileSync(path.join(SRC_DIR, 'arenas', `${id}.png`));
    const decoded = decodePngRgba(srcBuf, `arenas/${id}.png`);
    if (decoded.width > MAX_ATLAS_DIM || decoded.height > MAX_ATLAS_DIM) {
      throw new Error(`Arena ${id}.png exceeds ${MAX_ATLAS_DIM}x${MAX_ATLAS_DIM}`);
    }
    filesToWrite.push({
      path: path.join(ARENA_OUT_DIR, `${id}.png`),
      buf: srcBuf,
    });
    arenas[id] = `./atlases/arenas/${id}.png`;
  }

  for (const iconFile of APP_ICON_PNGS) {
    const srcBuf = fs.readFileSync(path.join(SRC_DIR, 'icons', iconFile));
    filesToWrite.push({
      path: path.join(ICON_DIR, iconFile),
      buf: srcBuf,
    });
  }

  let totalBytes = 0;
  for (const f of filesToWrite) {
    fs.writeFileSync(f.path, f.buf);
    totalBytes += f.buf.length;
  }

  const manifest = {
    version: MANIFEST_VERSION,
    seed: SEED,
    generatedBy: 'scripts/bake-assets.mjs',
    sheets: {
      terrain: {
        id: 'terrain',
        albedoPath: './atlases/terrain-atlas.png',
        normalPath: './atlases/terrain-normal.png',
        emissivePath: './atlases/terrain-emissive.png',
        width: terrain.width,
        height: terrain.height,
        tileSize: terrain.tileSize,
        pixelCrisp: true,
        regions: terrain.regions,
      },
      props: {
        id: 'props',
        albedoPath: './atlases/props-atlas.png',
        normalPath: './atlases/props-normal.png',
        emissivePath: './atlases/props-emissive.png',
        width: props.width,
        height: props.height,
        tileSize: props.tileSize,
        pixelCrisp: true,
        regions: props.regions,
      },
      characters: {
        id: 'characters',
        albedoPath: './atlases/characters-atlas.png',
        width: chars.width,
        height: chars.height,
        tileSize: chars.tileSize,
        pixelCrisp: true,
        regions: chars.regions,
      },
      fallbacks: {
        id: 'fallbacks',
        albedoPath: './atlases/fallbacks-atlas.png',
        width: fallbacks.width,
        height: fallbacks.height,
        tileSize: fallbacks.tileSize,
        pixelCrisp: true,
        regions: fallbacks.regions,
      },
    },
    arenas,
    tileRegions: terrain.tileRegions,
    iconIds: icons.iconIds,
    totalBytes,
  };

  const manifestPath = path.join(ATLAS_DIR, 'manifest.json');
  const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.writeFileSync(manifestPath, manifestBuf);

  const summary = [...filesToWrite, { path: manifestPath, buf: manifestBuf }].map((f) => ({
    file: path.relative(ROOT_DIR, f.path).replace(/\\/g, '/'),
    bytes: f.buf.length,
    sha256: crypto.createHash('sha256').update(f.buf).digest('hex').slice(0, 12),
  }));

  console.log(
    JSON.stringify(
      {
        version: MANIFEST_VERSION,
        seed: SEED,
        tiles: Object.keys(terrain.tileRegions).length,
        props: Object.keys(props.regions).length,
        characters: Object.keys(chars.regions).length,
        fallbacks: Object.keys(fallbacks.regions).length,
        arenas: Object.keys(arenas).length,
        iconIds: icons.iconIds.length,
        totalAssetBytes: totalBytes + manifestBuf.length,
        files: summary,
      },
      null,
      2,
    ),
  );
}

main();
