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

const BAYER_4X4 = [
  [-0.46875, 0.03125, -0.34375, 0.15625],
  [0.28125, -0.21875, 0.40625, -0.09375],
  [-0.28125, 0.21875, -0.40625, 0.09375],
  [0.46875, -0.03125, 0.34375, -0.15625],
];

function bayerAt(x, y) {
  return BAYER_4X4[y & 3][x & 3];
}

function luma255(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function pixelDist(a, b) {
  const alphaDiff = Math.abs(a[3] - b[3]);
  if (alphaDiff > 96) return 1000;
  return (
    Math.abs(a[0] - b[0]) * 0.30 +
    Math.abs(a[1] - b[1]) * 0.59 +
    Math.abs(a[2] - b[2]) * 0.11 +
    alphaDiff * 0.8
  );
}

function getWrappedPixel(img, x, y) {
  const wx = ((x % img.width) + img.width) % img.width;
  const wy = ((y % img.height) + img.height) % img.height;
  const idx = (wy * img.width + wx) * 4;
  return [img.data[idx], img.data[idx + 1], img.data[idx + 2], img.data[idx + 3]];
}

function getClampedOrEmptyPixel(img, x, y) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) {
    return [0, 0, 0, 0];
  }
  const idx = (y * img.width + x) * 4;
  return [img.data[idx], img.data[idx + 1], img.data[idx + 2], img.data[idx + 3]];
}

function mixRgba(c1, c2, t) {
  const k = clamp(t, 0, 1);
  return [
    Math.round(lerp(c1[0], c2[0], k)),
    Math.round(lerp(c1[1], c2[1], k)),
    Math.round(lerp(c1[2], c2[2], k)),
    Math.round(lerp(c1[3], c2[3], k)),
  ];
}

/**
 * Hue-shifts highlights gently warmer and shadows gently cooler (classic 16/32-bit pixel art craft)
 * while adding subtle luminance crisping and optional 4x4 Bayer micro-dither.
 */
function enhancePixelCraft(src, { sharpen = 0.24, dither = 4.0, wrap = true, warmCool = 0.65 } = {}) {
  const w = src.width;
  const h = src.height;
  const out = new PixelImage(w, h);
  const sample = wrap
    ? (x, y) => getWrappedPixel(src, x, y)
    : (x, y) => getClampedOrEmptyPixel(src, x, y);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = sample(x, y);
      if (p[3] < 20) continue;

      const u = sample(x, y - 1);
      const d = sample(x, y + 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);

      let nr = p[0];
      let ng = p[1];
      let nb = p[2];

      // Interior unsharp luminance crisping (skip edges bordering transparency to keep silhouettes clean)
      const allOpaque = u[3] > 200 && d[3] > 200 && l[3] > 200 && r[3] > 200;
      if (allOpaque && sharpen > 0.001) {
        const avgR = (u[0] + d[0] + l[0] + r[0]) * 0.25;
        const avgG = (u[1] + d[1] + l[1] + r[1]) * 0.25;
        const avgB = (u[2] + d[2] + l[2] + r[2]) * 0.25;
        const lum = luma255(p[0], p[1], p[2]);
        // Protect dark outlines from ringing
        const k = lum < 44 ? sharpen * 0.35 : sharpen;
        nr += (p[0] - avgR) * k;
        ng += (p[1] - avgG) * k;
        nb += (p[2] - avgB) * k;
      }

      // Hue-shifted shadow/highlight curve (warm sunlight peaks, cool twilight crevices)
      if (warmCool > 0.001) {
        const lum01 = luma255(nr, ng, nb) / 255;
        if (lum01 > 0.62) {
          const hi = (lum01 - 0.62) * warmCool;
          nr += hi * 10;
          ng += hi * 6;
          nb -= hi * 4;
        } else if (lum01 < 0.36 && lum01 > 0.08) {
          const lo = (0.36 - lum01) * warmCool;
          nr -= lo * 8;
          ng -= lo * 3;
          nb += lo * 11;
        }
      }

      // Subtle ordered 4x4 Bayer grain to keep pixel surfaces tactile and rich
      if (dither > 0 && allOpaque) {
        const b = bayerAt(x, y) * dither;
        nr += b;
        ng += b;
        nb += b * 0.9;
      }

      out.setPixel(x, y, nr, ng, nb, p[3]);
    }
  }
  return out;
}

/**
 * Edge-directed 2x pixel-art upscaler for seamless opaque tiles (32x32 -> 64x64).
 * Uses EPX/Scale2x diagonal beveling with wrap-around sampling so edges stay crisp
 * and diagonal shapes smooth organically without bilinear blur.
 */
function upscaleTile2x(src, edgeThresh = 24) {
  const sw = src.width;
  const sh = src.height;
  const out = new PixelImage(sw * 2, sh * 2);

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const P = getWrappedPixel(src, x, y);
      const A = getWrappedPixel(src, x, y - 1);
      const B = getWrappedPixel(src, x + 1, y);
      const C = getWrappedPixel(src, x - 1, y);
      const D = getWrappedPixel(src, x, y + 1);

      let p0 = P;
      let p1 = P;
      let p2 = P;
      let p3 = P;

      const diffAB = pixelDist(A, B);
      const diffAC = pixelDist(A, C);
      const diffDB = pixelDist(D, B);
      const diffDC = pixelDist(D, C);
      const diffCB = pixelDist(C, B);
      const diffAD = pixelDist(A, D);

      if (diffCB > edgeThresh && diffAD > edgeThresh) {
        if (diffAC < edgeThresh) p0 = mixRgba(P, mixRgba(C, A, 0.5), 0.72);
        if (diffAB < edgeThresh) p1 = mixRgba(P, mixRgba(A, B, 0.5), 0.72);
        if (diffDC < edgeThresh) p2 = mixRgba(P, mixRgba(C, D, 0.5), 0.72);
        if (diffDB < edgeThresh) p3 = mixRgba(P, mixRgba(D, B, 0.5), 0.72);
      } else {
        // Gentle directional sub-pixel contour modulation preserving crisp tone steps
        if (diffAC < edgeThresh * 0.7 && pixelDist(P, A) < edgeThresh * 1.4) p0 = mixRgba(P, A, 0.25);
        if (diffAB < edgeThresh * 0.7 && pixelDist(P, B) < edgeThresh * 1.4) p1 = mixRgba(P, B, 0.25);
        if (diffDC < edgeThresh * 0.7 && pixelDist(P, C) < edgeThresh * 1.4) p2 = mixRgba(P, C, 0.25);
        if (diffDB < edgeThresh * 0.7 && pixelDist(P, D) < edgeThresh * 1.4) p3 = mixRgba(P, D, 0.25);
      }

      const ox = x * 2;
      const oy = y * 2;
      out.setPixel(ox, oy, p0[0], p0[1], p0[2], 255);
      out.setPixel(ox + 1, oy, p1[0], p1[1], p1[2], 255);
      out.setPixel(ox, oy + 1, p2[0], p2[1], p2[2], 255);
      out.setPixel(ox + 1, oy + 1, p3[0], p3[1], p3[2], 255);
    }
  }
  return enhancePixelCraft(out, { sharpen: 0.28, dither: 3.2, wrap: true, warmCool: 0.65 });
}

/**
 * Edge-directed 2x pixel-art upscaler for transparent sprites (props & overworld characters).
 * Smooths 45-degree pixel staircases into crisp high-craft 32-bit curves while keeping
 * binary transparent silhouettes and subtle top-left directional bevel relief.
 */
function upscaleSprite2x(src, { edgeThresh = 28, sharpen = 0.28, bevel = 0.10 } = {}) {
  const sw = src.width;
  const sh = src.height;
  const out = new PixelImage(sw * 2, sh * 2);

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const P = getClampedOrEmptyPixel(src, x, y);
      const A = getClampedOrEmptyPixel(src, x, y - 1);
      const B = getClampedOrEmptyPixel(src, x + 1, y);
      const C = getClampedOrEmptyPixel(src, x - 1, y);
      const D = getClampedOrEmptyPixel(src, x, y + 1);

      let p0 = P;
      let p1 = P;
      let p2 = P;
      let p3 = P;

      const diffCB = pixelDist(C, B);
      const diffAD = pixelDist(A, D);

      if (diffCB > edgeThresh && diffAD > edgeThresh) {
        if (pixelDist(C, A) < edgeThresh) p0 = mixRgba(C, A, 0.5);
        if (pixelDist(A, B) < edgeThresh) p1 = mixRgba(A, B, 0.5);
        if (pixelDist(C, D) < edgeThresh) p2 = mixRgba(C, D, 0.5);
        if (pixelDist(D, B) < edgeThresh) p3 = mixRgba(D, B, 0.5);
      }

      const ox = x * 2;
      const oy = y * 2;
      const setClean = (dx, dy, c) => {
        if (c[3] < 128) {
          out.setPixel(dx, dy, 0, 0, 0, 0);
        } else {
          out.setPixel(dx, dy, c[0], c[1], c[2], 255);
        }
      };
      setClean(ox, oy, p0);
      setClean(ox + 1, oy, p1);
      setClean(ox, oy + 1, p2);
      setClean(ox + 1, oy + 1, p3);
    }
  }

  // Refine interior micro-contrast + directional top-left HD-2D pixel highlight bevel
  const crafted = enhancePixelCraft(out, { sharpen, dither: 1.8, wrap: false, warmCool: 0.72 });
  if (bevel <= 0.001) return crafted;

  const final = crafted.clone();
  for (let y = 1; y < crafted.height - 1; y++) {
    for (let x = 1; x < crafted.width - 1; x++) {
      const p = crafted.getPixel(x, y);
      if (p[3] < 200) continue;
      const lum = luma255(p[0], p[1], p[2]);
      if (lum < 48) continue; // Keep dark outlines crisp and deep

      const up = crafted.getPixel(x, y - 1);
      const lt = crafted.getPixel(x - 1, y);
      const dn = crafted.getPixel(x, y + 1);
      const rt = crafted.getPixel(x + 1, y);

      const upDark = up[3] < 128 || luma255(up[0], up[1], up[2]) < lum - 28;
      const ltDark = lt[3] < 128 || luma255(lt[0], lt[1], lt[2]) < lum - 28;
      const dnDark = dn[3] < 128 || luma255(dn[0], dn[1], dn[2]) < lum - 30;
      const rtDark = rt[3] < 128 || luma255(rt[0], rt[1], rt[2]) < lum - 30;

      if ((upDark || ltDark) && dn[3] > 200 && rt[3] > 200) {
        const boost = 1 + bevel;
        final.setPixel(x, y, p[0] * boost + 5, p[1] * boost + 4, p[2] * boost + 1, 255);
      } else if ((dnDark || rtDark) && up[3] > 200 && lt[3] > 200) {
        const dim = 1 - bevel * 0.72;
        final.setPixel(x, y, p[0] * dim - 2, p[1] * dim - 1, p[2] * dim + 3, 255);
      }
    }
  }
  return final;
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

function setWrapped(img, x, y, r, g, b, a = 255) {
  const wx = ((Math.round(x) % img.width) + img.width) % img.width;
  const wy = ((Math.round(y) % img.height) + img.height) % img.height;
  if (a >= 254) {
    img.setPixel(wx, wy, r, g, b, 255);
  } else {
    img.blendPixel(wx, wy, r, g, b, a);
  }
}

/**
 * Adds hand-crafted 64x64 meadow grass blade clusters, tiny clovers, dappled shading,
 * and optional fallen petals/spores/pebbles with wrap-around seamlessness.
 */
function detailGrass64(base64, seedLabel, pal) {
  const out = base64.clone();
  const rng = mulberry32(hashSeed(SEED, seedLabel));
  const w = out.width;
  const h = out.height;

  // Soft sunlit vs cool dappled turf patches with ordered Bayer transition
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wave =
        Math.sin((x / w) * Math.PI * 2 + 0.6) * Math.cos((y / h) * Math.PI * 2 - 0.4) * 0.5 +
        Math.sin(((x + y) / w) * Math.PI * 2) * 0.25;
      const dithered = wave + bayerAt(x, y) * 0.30;
      const [r, g, b, a] = out.getPixel(x, y);
      if (dithered > 0.30) {
        out.setPixel(x, y, r + 7, g + 9, b + 2, a);
      } else if (dithered < -0.34) {
        out.setPixel(x, y, r - 6, g - 4, b + 4, a);
      }
    }
  }

  // Softly blend extreme tile border 2px seam band so repeated meadow tiles never show square edges
  const seamSnap = out.clone();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edgeDist = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (edgeDist >= 2) continue;
      const opposite = getWrappedPixel(seamSnap, x + (x < 2 ? -2 : x > w - 3 ? 2 : 0), y + (y < 2 ? -2 : y > h - 3 ? 2 : 0));
      const cur = seamSnap.getPixel(x, y);
      const t = edgeDist === 0 ? 0.38 : 0.18;
      out.setPixel(x, y, lerp(cur[0], opposite[0], t), lerp(cur[1], opposite[1], t), lerp(cur[2], opposite[2], t), 255);
    }
  }

  // Hand-crafted 3-blade pixel grass tufts (cool shadow root + mid stem + sunlit tip)
  const tuftCount = pal.tuftCount ?? 11;
  for (let i = 0; i < tuftCount; i++) {
    const gx = Math.floor(rng() * w);
    const gy = Math.floor(rng() * h);
    const dir = rng() > 0.5 ? 1 : -1;
    // Shadow root anchor
    setWrapped(out, gx, gy + 1, pal.shadow[0], pal.shadow[1], pal.shadow[2], 195);
    setWrapped(out, gx + 1, gy + 1, pal.shadow[0], pal.shadow[1], pal.shadow[2], 160);
    setWrapped(out, gx - 1, gy + 1, pal.shadow[0], pal.shadow[1], pal.shadow[2], 145);
    // Center tall blade
    setWrapped(out, gx, gy, pal.mid[0], pal.mid[1], pal.mid[2], 235);
    setWrapped(out, gx, gy - 1, pal.mid[0], pal.mid[1], pal.mid[2], 235);
    setWrapped(out, gx + dir, gy - 2, pal.tip[0], pal.tip[1], pal.tip[2], 240);
    // Side angled blades
    setWrapped(out, gx - dir, gy, pal.mid[0], pal.mid[1], pal.mid[2], 220);
    setWrapped(out, gx - dir * 2, gy - 1, pal.tip[0], pal.tip[1], pal.tip[2], 225);
    setWrapped(out, gx + dir * 2, gy, pal.mid[0], pal.mid[1], pal.mid[2], 205);
  }

  // Subtle clover / wild pebble micro-accents
  const accentCount = pal.accentCount ?? 4;
  if (pal.accents && pal.accents.length > 0) {
    for (let i = 0; i < accentCount; i++) {
      const ax = Math.floor(rng() * w);
      const ay = Math.floor(rng() * h);
      const col = pal.accents[i % pal.accents.length];
      setWrapped(out, ax, ay + 1, pal.shadow[0], pal.shadow[1], pal.shadow[2], 150);
      setWrapped(out, ax, ay, col[0], col[1], col[2], 225);
      if (i % 2 === 0) {
        setWrapped(out, ax + 1, ay, Math.min(255, col[0] + 18), Math.min(255, col[1] + 18), Math.min(255, col[2] + 12), 205);
      }
    }
  }

  return out;
}

/**
 * Hand-crafted lush 64x64 tall grass tile with 3 depth-layered overlapping blade rows.
 */
function detailTallGrass64(base64, seedLabel) {
  const out = base64.clone();
  const rng = mulberry32(hashSeed(SEED, seedLabel));
  // Deepen recessed soil/shadow floor slightly so crisp layered blades pop in 3D
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const [r, g, b, a] = out.getPixel(x, y);
      const lum = luma255(r, g, b);
      if (lum < 78) {
        out.setPixel(x, y, r * 0.82, g * 0.88, b * 0.94 + 4, a);
      }
    }
  }

  const rows = [14, 30, 46, 60];
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const baseY = rows[rIdx];
    for (let bx = 3; bx < 62; bx += 6) {
      const jitterX = Math.floor((rng() - 0.5) * 3);
      const x0 = bx + jitterX + (rIdx % 2 === 0 ? 0 : 2);
      const bladeH = 10 + Math.floor(rng() * 5);
      const lean = rng() > 0.5 ? 1 : -1;

      for (let step = 0; step < bladeH; step++) {
        const frac = step / Math.max(1, bladeH - 1);
        const cx = x0 + Math.round(lean * frac * frac * 3.0);
        const cy = baseY - step;

        let col;
        if (frac < 0.28) col = [14, 54, 44];
        else if (frac < 0.58) col = [28, 108, 62];
        else if (frac < 0.84) col = [62, 166, 78];
        else col = [148, 232, 106];

        // 1px dark undercut on left/shadow side of blade
        setWrapped(out, cx - lean, cy, 12, 42, 38, 170);
        setWrapped(out, cx, cy, col[0], col[1], col[2], 245);
        if (frac < 0.68) {
          setWrapped(out, cx + 1, cy, col[0] + 10, col[1] + 14, col[2] + 4, 225);
        }
      }
      // Occasional morning dew highlight
      if (rng() > 0.72) {
        setWrapped(out, x0 + lean * 2, baseY - bladeH + 2, 220, 255, 198, 225);
      }
    }
  }
  return out;
}

/**
 * Enriches 64x64 cobblestone / biome flagstone paths with crisp upper-left bevel highlights,
 * cool recessed mortar depth, stone surface grain, and biome-specific mortar inlays.
 */
function buildPathVariant64(floorTile, pathTile, tintRgb, edgeStrength = 0.78, opts = {}) {
  const tintedPath = tintTile(pathTile, tintRgb, opts.tintStrength ?? 0.56, opts.gain ?? 0.95);
  const blended = mapPixels(floorTile, (fr, fg, fb, fa, x, y) => {
    const idx = (y * tintedPath.width + x) * 4;
    const pr = tintedPath.data[idx];
    const pg = tintedPath.data[idx + 1];
    const pb = tintedPath.data[idx + 2];
    const pLum = luma255(pr, pg, pb) / 255;
    const mortarPeek = pLum < 0.34 ? 0.58 : 1.0;
    const weight = clamp(edgeStrength * mortarPeek, 0.34, 0.94);
    return [lerp(fr, pr, weight), lerp(fg, pg, weight), lerp(fb, pb, weight), fa];
  });

  const w = blended.width;
  const h = blended.height;
  const out = blended.clone();
  const rng = mulberry32(hashSeed(SEED, opts.seedLabel || `path_${tintRgb.join('_')}`));

  // Chiseled 1px HD-2D stone bevel pass: brighten stone faces directly below/right of mortar seams
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = blended.getPixel(x, y);
      const lum = luma255(p[0], p[1], p[2]) / 255;
      const up = getWrappedPixel(blended, x, y - 1);
      const lt = getWrappedPixel(blended, x - 1, y);
      const dn = getWrappedPixel(blended, x, y + 1);
      const rt = getWrappedPixel(blended, x + 1, y);
      const upLum = luma255(up[0], up[1], up[2]) / 255;
      const ltLum = luma255(lt[0], lt[1], lt[2]) / 255;
      const dnLum = luma255(dn[0], dn[1], dn[2]) / 255;
      const rtLum = luma255(rt[0], rt[1], rt[2]) / 255;

      if (lum > 0.44 && (upLum < lum - 0.12 || ltLum < lum - 0.12)) {
        // Warm sunlit upper-left cobble bevel
        out.setPixel(x, y, p[0] * 1.12 + 12, p[1] * 1.11 + 10, p[2] * 1.06 + 4, 255);
      } else if (lum > 0.40 && (dnLum < lum - 0.12 || rtLum < lum - 0.12)) {
        // Cool undercut stone lower edge
        out.setPixel(x, y, p[0] * 0.84, p[1] * 0.85, p[2] * 0.90 + 4, 255);
      } else if (lum < 0.33) {
        // Deepen mortar crevices slightly
        out.setPixel(x, y, p[0] * 0.86, p[1] * 0.87, p[2] * 0.92, 255);
      } else {
        // Subtle tactile stone surface micro-grain
        const d = bayerAt(x, y) * 5.0;
        out.setPixel(x, y, p[0] + d, p[1] + d, p[2] + d * 0.9, 255);
      }
    }
  }

  // Optional tiny biome flecks/moss/sparks nestled in mortar joints
  if (opts.mortarAccent) {
    const count = opts.mortarAccentCount ?? 10;
    const acc = opts.mortarAccent;
    for (let i = 0; i < count; i++) {
      const mx = Math.floor(rng() * w);
      const my = Math.floor(rng() * h);
      const p = blended.getPixel(mx, my);
      if (luma255(p[0], p[1], p[2]) < 118) {
        setWrapped(out, mx, my, acc[0], acc[1], acc[2], 210);
        setWrapped(out, mx + 1, my, Math.min(255, acc[0] + 18), Math.min(255, acc[1] + 18), Math.min(255, acc[2] + 14), 175);
      }
    }
  }

  // Seamlessly bridge alternating cobble courses across the 64x64 tile edges so contiguous
  // village plazas & roads read as continuous hand-laid stonework with zero vertical/horizontal grid lines.
  for (let y = 0; y < h; y++) {
    const bridgeRow = ((y >> 4) & 1) === 0;
    for (const bx of [0, 1, w - 2, w - 1]) {
      const p = out.getPixel(bx, y);
      const innerX = bx < 4 ? 4 : w - 5;
      const inner = out.getPixel(innerX, y);
      const blend = bridgeRow ? 0.82 : 0.42;
      if (luma255(p[0], p[1], p[2]) < luma255(inner[0], inner[1], inner[2]) - 12 || bridgeRow) {
        out.setPixel(
          bx,
          y,
          lerp(p[0], inner[0], blend),
          lerp(p[1], inner[1], blend),
          lerp(p[2], inner[2], blend),
          255,
        );
      }
    }
  }
  for (let x = 0; x < w; x++) {
    const bridgeCol = ((x >> 4) & 1) === 1;
    for (const by of [0, 1, h - 2, h - 1]) {
      const p = out.getPixel(x, by);
      const innerY = by < 4 ? 4 : h - 5;
      const inner = out.getPixel(x, innerY);
      const blend = bridgeCol ? 0.72 : 0.38;
      if (luma255(p[0], p[1], p[2]) < luma255(inner[0], inner[1], inner[2]) - 14) {
        out.setPixel(
          x,
          by,
          lerp(p[0], inner[0], blend),
          lerp(p[1], inner[1], blend),
          lerp(p[2], inner[2], blend),
          255,
        );
      }
    }
  }

  return out;
}

/**
 * Hand-crafted 64x64 cliff / biome wall tile with stratified rock fissures, chiseled bevels,
 * ordered dithering, and crisp faceted mineral crystal clusters.
 */
function buildWallVariant64(baseWall64, tintRgb, fleckRgb, fleckSeedLabel) {
  const rng = mulberry32(hashSeed(SEED, fleckSeedLabel));
  const out = tintTile(baseWall64, tintRgb, 0.64, 0.95);
  const w = out.width;
  const h = out.height;

  // Crisp stratified mineral relief + chiseled upper-left edge highlights
  const ref = out.clone();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = ref.getPixel(x, y);
      const lum = luma255(p[0], p[1], p[2]) / 255;
      const up = getWrappedPixel(ref, x, y - 1);
      const upLum = luma255(up[0], up[1], up[2]) / 255;

      if (lum < 0.28) {
        out.setPixel(x, y, p[0] * 0.80, p[1] * 0.82, p[2] * 0.90 + 4, 255);
      } else if (lum - upLum > 0.10) {
        // Sunlit stratified rock lip
        out.setPixel(x, y, p[0] * 1.15 + 12, p[1] * 1.14 + 10, p[2] * 1.10 + 8, 255);
      } else if (lum > 0.64) {
        const b = bayerAt(x, y) * 8;
        out.setPixel(x, y, p[0] * 1.06 + b, p[1] * 1.06 + b, p[2] * 1.08 + b, 255);
      }
    }
  }

  // Soft organic stone strata veins (blended cleanly into cliff face rather than harsh black lines)
  for (let c = 0; c < 3; c++) {
    let cx = 6 + Math.floor(rng() * (w - 16));
    let cy = 28 + Math.floor(rng() * (h - 34));
    const len = 8 + Math.floor(rng() * 7);
    for (let step = 0; step < len; step++) {
      const cur = out.getPixel(cx, cy);
      setWrapped(out, cx, cy, cur[0] * 0.74, cur[1] * 0.76, cur[2] * 0.84, 210);
      setWrapped(out, cx, cy + 1, cur[0] * 1.12 + 8, cur[1] * 1.12 + 8, cur[2] * 1.10 + 6, 175);
      cx += 1;
      if (rng() > 0.62) cy += rng() > 0.45 ? 1 : -1;
    }
  }

  // Organic mineral crystal glints embedded ONLY inside the vertical cliff rock face (y >= 26)
  if (fleckRgb) {
    for (let i = 0; i < 5; i++) {
      const fx = 6 + Math.floor(rng() * (w - 12));
      const fy = 28 + Math.floor(rng() * (h - 34));
      const under = out.getPixel(fx, Math.min(h - 1, fy + 2));
      out.blendPixel(fx, Math.min(h - 1, fy + 2), under[0] * 0.52, under[1] * 0.52, under[2] * 0.64, 210);
      out.blendPixel(fx + 1, Math.min(h - 1, fy + 1), fleckRgb[0] * 0.75, fleckRgb[1] * 0.75, fleckRgb[2] * 0.85, 220);
      out.setPixel(fx, fy + 1, fleckRgb[0], fleckRgb[1], fleckRgb[2], 255);
      out.setPixel(
        fx,
        fy,
        Math.min(255, fleckRgb[0] + 44),
        Math.min(255, fleckRgb[1] + 44),
        Math.min(255, fleckRgb[2] + 38),
        255,
      );
      if (i % 2 === 0) {
        out.blendPixel(fx - 1, fy + 1, fleckRgb[0] * 0.9, fleckRgb[1] * 0.9, fleckRgb[2], 195);
      }
    }
  }
  return out;
}

/**
 * Hand-crafted 64x64 wind-rippled sand tile with Bayer-dithered crests, shells & silica glints.
 */
function detailSand64(base64, seedLabel, opts = {}) {
  const out = base64.clone();
  const rng = mulberry32(hashSeed(SEED, seedLabel));
  const w = out.width;
  const h = out.height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ripple = Math.sin((y / h) * Math.PI * 6 + Math.sin((x / w) * Math.PI * 2) * 1.4);
      const d = ripple + bayerAt(x, y) * 0.45;
      const [r, g, b, a] = out.getPixel(x, y);
      if (d > 0.62) {
        out.setPixel(x, y, r + 13, g + 11, b + 5, a);
      } else if (d < -0.58) {
        out.setPixel(x, y, r - 11, g - 12, b - 7, a);
      }
    }
  }

  // Tiny scattered sea shells, warm pebbles, and golden silica sparkles
  const pebbleCount = opts.pebbleCount ?? 9;
  for (let i = 0; i < pebbleCount; i++) {
    const px = Math.floor(rng() * w);
    const py = Math.floor(rng() * h);
    if (i % 3 === 0) {
      // Spiral tiny pixel shell
      setWrapped(out, px, py + 1, 162, 124, 82, 170);
      setWrapped(out, px, py, 255, 240, 214, 235);
      setWrapped(out, px + 1, py, 244, 206, 174, 225);
      setWrapped(out, px, py - 1, 255, 248, 232, 220);
    } else if (i % 3 === 1) {
      // Sunlit quartz grain
      setWrapped(out, px, py, 255, 250, 226, 205);
    } else {
      // Warm sandstone pebble
      setWrapped(out, px, py + 1, 146, 108, 68, 165);
      setWrapped(out, px, py, 198, 156, 104, 215);
    }
  }
  return out;
}

/**
 * Hand-crafted 64x64 wooden boardwalk planks with wood grain, bevels, and iron nail heads.
 */
function detailBridge64(base64) {
  const out = base64.clone();
  const rng = mulberry32(hashSeed(SEED, 'tile_7_bridge_64'));
  const plankH = 8;
  for (let y = 0; y < 64; y++) {
    const py = y % plankH;
    const plankIdx = Math.floor(y / plankH);
    const plankShift = (plankIdx % 3 - 1) * 5;
    for (let x = 0; x < 64; x++) {
      const [r, g, b] = out.getPixel(x, y);
      if (py === 0) {
        // Dark beveled gap between planks
        out.setPixel(x, y, r * 0.42, g * 0.40, b * 0.46, 255);
      } else if (py === 1) {
        // Crisp warm top wood highlight
        out.setPixel(x, y, r * 1.18 + 14 + plankShift, g * 1.15 + 10 + plankShift, b * 1.08 + 4, 255);
      } else if (py === plankH - 1) {
        // Lower wood shadow lip
        out.setPixel(x, y, r * 0.78 + plankShift, g * 0.76 + plankShift, b * 0.80, 255);
      } else {
        // Fine horizontal wood grain streaks
        const grain = Math.sin((x + plankIdx * 17) * 0.28 + py * 0.9) * 6 + bayerAt(x, y) * 3;
        out.setPixel(x, y, r + plankShift + grain, g + plankShift + grain * 0.85, b + grain * 0.5, 255);
      }
    }
    // Iron bolt rivets near left and right plank rails
    if (py === 3 || py === 4) {
      const isTop = py === 3;
      const nailCol = isTop ? [148, 156, 178] : [54, 48, 66];
      out.setPixel(5, y, nailCol[0], nailCol[1], nailCol[2], 255);
      out.setPixel(6, y, nailCol[0] - 18, nailCol[1] - 18, nailCol[2] - 12, 255);
      out.setPixel(57, y, nailCol[0], nailCol[1], nailCol[2], 255);
      out.setPixel(58, y, nailCol[0] - 18, nailCol[1] - 18, nailCol[2] - 12, 255);
    }
    // Subtle vertical plank split on alternating boards
    if (py >= 1 && py < plankH && rng() > 0.72) {
      const sx = 18 + ((plankIdx * 13) % 28);
      out.blendPixel(sx, y, 42, 24, 16, 130);
    }
  }
  return out;
}

/**
 * Hand-crafted 64x64 water / caustic / reef tile detailing.
 */
function detailWater64(base64, kind, seedLabel) {
  const out = base64.clone();
  const rng = mulberry32(hashSeed(SEED, seedLabel));

  if (kind === 'deep') {
    for (let i = 0; i < 14; i++) {
      const wx = Math.floor(rng() * 64);
      const wy = Math.floor(rng() * 64);
      const len = 5 + Math.floor(rng() * 6);
      for (let k = 0; k < len; k++) {
        const arch = k === 0 || k === len - 1 ? 1 : 0;
        setWrapped(out, wx + k, wy + arch + 1, 8, 26, 72, 175);
        setWrapped(out, wx + k, wy + arch, 54, 128, 212, 165);
        if (k === Math.floor(len * 0.5)) {
          setWrapped(out, wx + k, wy, 158, 224, 255, 210);
        }
      }
    }
  } else if (kind === 'shallow' || kind === 'reef') {
    // Crisp crystalline pixel caustics
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const c1 = Math.sin((x / 64) * Math.PI * 6 + Math.cos((y / 64) * Math.PI * 4) * 1.4);
        const c2 = Math.cos((y / 64) * Math.PI * 6 - Math.sin((x / 64) * Math.PI * 4) * 1.2);
        const val = c1 * c2;
        if (val > 0.72) {
          const [r, g, b] = out.getPixel(x, y);
          out.setPixel(x, y, r + 26, g + 34, b + 32, 255);
        } else if (val < -0.68) {
          const [r, g, b] = out.getPixel(x, y);
          out.setPixel(x, y, r * 0.90, g * 0.93, b * 0.98, 255);
        }
      }
    }
    if (kind === 'reef') {
      // Tiny crisp sea-sparkle bubbles & coral highlights
      for (let i = 0; i < 8; i++) {
        const bx = Math.floor(rng() * 64);
        const by = Math.floor(rng() * 64);
        setWrapped(out, bx, by, 215, 252, 255, 215);
        setWrapped(out, bx + 1, by, 140, 232, 248, 175);
      }
    }
  }
  return out;
}

/**
 * Hand-crafted 64x64 molten lava tile with beveled basalt plates & bright fissures.
 */
function detailLava64(base64) {
  const out = base64.clone();
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const [r, g, b] = base64.getPixel(x, y);
      const up = getWrappedPixel(base64, x, y - 1);
      const isHot = r > 175 && g > 70;
      const upHot = up[0] > 175 && up[1] > 70;
      if (isHot) {
        const heat = clamp((r + g * 0.8 - 220) / 180, 0, 1);
        out.setPixel(
          x,
          y,
          Math.min(255, r + 18),
          Math.min(255, g + heat * 36),
          Math.min(255, b + heat * 48),
          255,
        );
      } else if (upHot) {
        // Heated glowing rim along cooled basalt edge
        out.setPixel(x, y, r + 34, g + 10, b, 255);
      } else {
        // Deepen cooled obsidian basalt crust with Bayer grain
        const d = bayerAt(x, y) * 6;
        out.setPixel(x, y, r * 0.84 + d, g * 0.80 + d, b * 0.92 + 6 + d, 255);
      }
    }
  }
  return out;
}

/**
 * Hand-crafted 64x64 Iron Crown beveled steel fortress flagstones (replaces blurry 4-block master).
 */
function detailCrownSteel64(base64) {
  const out = base64.clone();
  const cell = 32;
  for (let y = 0; y < 64; y++) {
    const ly = y % cell;
    const rowIdx = Math.floor(y / cell);
    for (let x = 0; x < 64; x++) {
      const lx = (x + rowIdx * 16) % cell;
      const [br, bg, bb] = out.getPixel(x, y);
      const diagSheen = Math.sin((lx - ly) * 0.24) * 9 + bayerAt(x, y) * 4;
      let r = lerp(br, 92, 0.42) + diagSheen;
      let g = lerp(bg, 108, 0.42) + diagSheen;
      let b = lerp(bb, 134, 0.42) + diagSheen * 1.1;

      if (lx === 0 || ly === 0) {
        r = 34; g = 42; b = 64;
      } else if (lx === 1 || ly === 1) {
        r = 166; g = 186; b = 216;
      } else if (lx === cell - 1 || ly === cell - 1) {
        r = 52; g = 64; b = 90;
      } else if (
        (lx === 4 || lx === cell - 5) &&
        (ly === 4 || ly === cell - 5)
      ) {
        // Steel corner rivets
        r = 188; g = 212; b = 238;
      } else if (
        (lx === 4 || lx === cell - 5) &&
        (ly === 5 || ly === cell - 4)
      ) {
        r = 38; g = 48; b = 72;
      } else if (lx >= 13 && lx <= 18 && (ly === 15 || ly === 16)) {
        // Recessed runic plate notch
        r = 112; g = 168; b = 214;
      }
      out.setPixel(x, y, r, g, b, 255);
    }
  }
  return out;
}

/**
 * Hand-crafted 64x64 Terastal prismatic diamond facet floor with crisp specular edges.
 */
function detailTerastal64(base64) {
  const out = base64.clone();
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const [r, g, b] = base64.getPixel(x, y);
      const d1 = (x + y) % 16;
      const d2 = ((x - y) % 16 + 16) % 16;
      if (d1 === 0 || d2 === 0) {
        // Razor-crisp bright prismatic facet ridge
        out.setPixel(x, y, Math.min(255, r + 52), Math.min(255, g + 58), Math.min(255, b + 64), 255);
      } else if (d1 === 1 || d2 === 1) {
        // Cool internal refraction bevel
        out.setPixel(x, y, r * 0.84, g * 0.88, Math.min(255, b * 1.02 + 8), 255);
      } else {
        const spark = (d1 === 8 && d2 === 8) ? 38 : bayerAt(x, y) * 5;
        out.setPixel(x, y, r + spark, g + spark, b + spark, 255);
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
// 1. Terrain Atlas Baker (TILE 0..60 -> 8x8 @ 64x64 HD-2D = 512x512)
// -----------------------------------------------------------------------------
function bakeTerrainAtlases() {
  const load64 = (name, edgeThresh = 24) =>
    upscaleTile2x(new PixelImage(32, 32, loadMasterPng(`tiles/${name}.png`).data), edgeThresh);

  const M = {
    bridge: load64('bridge', 20),
    canyonGrass: load64('canyon_grass', 24),
    caveFloor: load64('cave_floor', 24),
    cliffWall: load64('cliff_wall', 22),
    crownFloor: load64('crown_floor', 20),
    deepWater: load64('deep_water', 22),
    faeGrass: load64('fae_grass', 24),
    flowerGrass: load64('flower_grass', 22),
    grass: load64('grass', 24),
    iceWall: load64('ice_wall', 22),
    lava: load64('lava', 22),
    marshGrass: load64('marsh_grass', 24),
    path: load64('path', 20),
    reefWater: load64('reef_water', 22),
    riftFloor: load64('rift_floor', 22),
    runeFlagstone: load64('rune_flagstone', 20),
    sanctumFloor: load64('sanctum_floor', 20),
    sand: load64('sand', 22),
    sandstoneWall: load64('sandstone_wall', 20),
    shallowWater: load64('shallow_water', 22),
    snowIce: load64('snow_ice', 22),
    tallGrass: load64('tall_grass', 22),
    terastalFloor: load64('terastal_floor', 18),
    volcanoFloor: load64('volcano_floor', 22),
  };

  const tiles = new Array(61);

  // Core Village & Overworld (0..17)
  tiles[0] = detailGrass64(M.grass, 'tile_0_grass', {
    shadow: [26, 86, 46],
    mid: [58, 152, 74],
    tip: [132, 212, 102],
    tuftCount: 12,
    accentCount: 4,
    accents: [[116, 198, 92], [186, 224, 134], [244, 232, 156]],
  });

  // 1: PATH (crisp chiseled warm village cobblestone with mossy joints)
  tiles[1] = (() => {
    const balanced = mapPixels(M.path, (r, g, b, a) => {
      const lum = luma255(r, g, b) / 255;
      const mul = lum > 0.62 ? 0.89 : lum < 0.36 ? 0.90 : 0.94;
      return [r * mul, g * mul * 0.99, b * mul * 0.96, a];
    });
    return buildPathVariant64(tiles[0], balanced, [204, 184, 146], 0.90, {
      tintStrength: 0.22,
      gain: 1.0,
      seedLabel: 'tile_1_village_cobble',
      mortarAccent: [68, 142, 74],
      mortarAccentCount: 9,
    });
  })();

  // 2: TALL_GRASS (lush 3-depth overlapping curved pixel grass blades)
  tiles[2] = detailTallGrass64(M.tallGrass, 'tile_2_tall_grass');

  // 3: TREE ground bed (seamless grass with Bayer-dithered woodland moss & exposed root bed)
  tiles[3] = (() => {
    const t = tiles[0].clone();
    const rng = mulberry32(hashSeed(SEED, 'tile_3_tree_bed_64'));
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const dx = (x - 31.5) / 27.0;
        const dy = (y - 35.0) / 23.0;
        const d = Math.hypot(dx, dy);
        const [r, g, b, a] = t.getPixel(x, y);
        if (d < 1.05) {
          const shade = lerp(0.64, 0.96, clamp(d * d + bayerAt(x, y) * 0.08, 0, 1));
          const mossy = rng() > 0.82 ? -9 : rng() < 0.14 ? 7 : 0;
          t.setPixel(x, y, r * shade + mossy, g * (shade + 0.04) + mossy, b * shade + 5, a);
        }
      }
    }
    return t;
  })();

  tiles[4] = detailWater64(M.deepWater, 'deep', 'tile_4_deep_water');
  tiles[5] = detailWater64(M.shallowWater, 'shallow', 'tile_5_shallow_water');
  tiles[6] = detailSand64(M.sand, 'tile_6_sand', { pebbleCount: 10 });
  tiles[7] = detailBridge64(M.bridge);
  tiles[8] = buildWallVariant64(M.cliffWall, [68, 82, 126], [132, 228, 255], 'tile_8_cave_wall');

  // 9: CAVE_FLOOR (crisp subterranean slate with mineral flecks & crevices)
  tiles[9] = (() => {
    const c = M.caveFloor.clone();
    const rng = mulberry32(hashSeed(SEED, 'tile_9_cave_floor'));
    for (let i = 0; i < 10; i++) {
      const cx = Math.floor(rng() * 64);
      const cy = Math.floor(rng() * 64);
      setWrapped(c, cx, cy + 1, 24, 30, 56, 185);
      setWrapped(c, cx, cy, 118, 174, 224, 195);
      if (i % 3 === 0) setWrapped(c, cx + 1, cy - 1, 172, 232, 255, 225);
    }
    return c;
  })();

  tiles[10] = buildPathVariant64(tiles[9], M.path, [94, 126, 178], 0.78, {
    seedLabel: 'tile_10_cave_path',
    mortarAccent: [114, 212, 252],
    mortarAccentCount: 7,
  });

  // 11: WALL (cottage warm plaster, half-timber grain, stone plinth base)
  tiles[11] = (() => {
    const w = tintTile(M.sandstoneWall, [228, 210, 178], 0.66, 1.04);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const isTimber = x < 6 || x > 57 || (y >= 30 && y <= 33);
        if (isTimber) {
          const edge = x === 0 || x === 5 || x === 58 || x === 63 || y === 30 || y === 33;
          const hi = x === 1 || x === 59 || y === 31;
          const grain = ((x + y * 3) & 3) === 0 ? -7 : 4;
          if (edge) w.setPixel(x, y, 74, 46, 28, 255);
          else if (hi) w.setPixel(x, y, 148, 102, 64, 255);
          else w.setPixel(x, y, 116 + grain, 76 + grain, 48 + grain * 0.5, 255);
        } else if (y >= 52) {
          // Chiseled stone masonry foundation
          const seamY = y === 52 || y === 58;
          const seamX = (x + (y >= 58 ? 8 : 0)) % 16 === 0;
          if (seamY || seamX) w.setPixel(x, y, 54, 52, 70, 255);
          else if (y === 53 || y === 59) w.setPixel(x, y, 146, 144, 162, 255);
          else w.setPixel(x, y, 102 + bayerAt(x, y) * 10, 98 + bayerAt(x, y) * 10, 116 + bayerAt(x, y) * 10, 255);
        }
      }
    }
    return w;
  })();

  // 12: ROOF (crisp scalloped indigo-slate shingles with gilded brass eave trim)
  tiles[12] = (() => {
    const r = tintTile(M.cliffWall, [64, 84, 152], 0.78, 1.04);
    for (let y = 0; y < 64; y++) {
      const rowIdx = Math.floor(y / 8);
      const ly = y % 8;
      const xOff = (rowIdx & 1) * 8;
      for (let x = 0; x < 64; x++) {
        const lx = (x + xOff) % 16;
        if (y >= 59 && y <= 61) {
          // Gilded brass eave ridge
          const col = y === 59 ? [255, 224, 134] : y === 60 ? [226, 182, 86] : [132, 92, 34];
          r.setPixel(x, y, col[0], col[1], col[2], 255);
        } else if (ly === 0 || (ly === 7 && (lx === 0 || lx === 15))) {
          r.setPixel(x, y, 28, 36, 76, 255);
        } else if (lx === 0) {
          r.setPixel(x, y, 38, 50, 98, 255);
        } else if (ly === 1 && lx > 1 && lx < 14) {
          r.setPixel(x, y, 112, 136, 206, 255);
        } else if (ly === 6) {
          r.setPixel(x, y, 48, 62, 118, 255);
        } else {
          const [br, bg, bb] = r.getPixel(x, y);
          const shade = bayerAt(x, y) * 8 + (lx < 8 ? 5 : -4);
          r.setPixel(x, y, br + shade, bg + shade, bb + shade * 1.1, 255);
        }
      }
    }
    return r;
  })();

  // 13: FLOWER (harmonized grass + crisp hand-pixelled 5-petal wildflowers)
  tiles[13] = (() => {
    const f = mapPixels(M.flowerGrass, (r, g, b, a, x, y) => {
      const isBlossom = r > g + 16 || b > g + 14 || (r > 186 && g > 170);
      if (isBlossom) return [r, g, b, a];
      const [gr, gg, gb] = tiles[0].getPixel(x, y);
      return [lerp(r, gr, 0.58), lerp(g, gg, 0.58), lerp(b, gb, 0.58), a];
    });
    const rng = mulberry32(hashSeed(SEED, 'tile_13_blossoms_64'));
    const petals = [
      [255, 136, 192],
      [255, 224, 92],
      [136, 214, 255],
      [255, 244, 232],
    ];
    for (let i = 0; i < 7; i++) {
      const bx = 6 + Math.floor(rng() * 52);
      const by = 6 + Math.floor(rng() * 52);
      const col = petals[i % petals.length];
      // Dark green calyx leaves under blossom
      setWrapped(f, bx - 1, by + 2, 24, 88, 46, 235);
      setWrapped(f, bx + 1, by + 2, 32, 108, 54, 235);
      // 4 crisp petals + bright golden center
      setWrapped(f, bx, by - 1, col[0], col[1], col[2], 255);
      setWrapped(f, bx, by + 1, col[0] * 0.86, col[1] * 0.86, col[2] * 0.90, 255);
      setWrapped(f, bx - 1, by, col[0], col[1], col[2], 255);
      setWrapped(f, bx + 1, by, col[0] * 0.92, col[1] * 0.92, col[2] * 0.95, 255);
      setWrapped(f, bx, by, 255, 248, 178, 255);
    }
    return f;
  })();

  // 14: SIGN ground bed (seamless grass with worn earthen pebble footing pad)
  tiles[14] = (() => {
    const s = tiles[0].clone();
    const rng = mulberry32(hashSeed(SEED, 'tile_14_sign_bed_64'));
    for (let y = 34; y <= 58; y++) {
      for (let x = 16; x <= 46; x++) {
        const d = Math.hypot((x - 31.5) / 14.0, (y - 46) / 11.0);
        if (d < 1.0) {
          const [r, g, b] = s.getPixel(x, y);
          const mixT = clamp((1 - d) * 0.68 + bayerAt(x, y) * 0.12, 0, 0.78);
          const pebble = rng() > 0.84 ? 18 : rng() < 0.16 ? -14 : 0;
          s.setPixel(
            x,
            y,
            lerp(r, 152 + pebble, mixT),
            lerp(g, 136 + pebble, mixT),
            lerp(b, 104 + pebble, mixT),
            255,
          );
        }
      }
    }
    return s;
  })();

  // 15: HEAL (ornate 64x64 carved celestial fountain plaza compass mosaic)
  tiles[15] = (() => {
    const h = blendTiles(M.sanctumFloor, M.runeFlagstone, () => 0.44);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const dx = Math.abs(x - 31.5);
        const dy = Math.abs(y - 31.5);
        const dist = Math.hypot(dx, dy);
        if (Math.abs(dist - 24.0) < 1.4) {
          h.blendPixel(x, y, 128, 224, 246, 175);
        } else if (Math.abs(dist - 25.8) < 0.9) {
          h.blendPixel(x, y, 36, 48, 86, 145);
        } else if (Math.max(dx, dy) > 27.5 && Math.max(dx, dy) < 29.5) {
          h.blendPixel(x, y, 228, 194, 108, 170);
        } else if (Math.abs(dx + dy - 16.0) < 1.2) {
          h.blendPixel(x, y, 156, 236, 224, 150);
        }
      }
    }
    return h;
  })();

  // 16: SHRINE (ornate 64x64 celestial carved dais with gilded double-bevel inlay)
  tiles[16] = (() => {
    const s = M.runeFlagstone.clone();
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const dx = Math.abs(x - 31.5);
        const dy = Math.abs(y - 31.5);
        const box = Math.max(dx, dy);
        if (box > 25.0 && box < 28.0) {
          const isInnerHi = box < 26.2;
          s.blendPixel(x, y, isInnerHi ? 248 : 212, isInnerHi ? 214 : 172, isInnerHi ? 126 : 82, 215);
        } else if (box >= 28.0 && box < 29.5) {
          s.blendPixel(x, y, 32, 38, 68, 185);
        } else if (Math.abs(dx + dy - 15.0) < 1.4) {
          s.blendPixel(x, y, 124, 232, 255, 195);
        } else if (dx + dy < 4.5) {
          s.blendPixel(x, y, 255, 232, 154, 185);
        }
      }
    }
    return s;
  })();

  // 17: CHEST ground bed (feathered warm sandy-cobble clearing pad)
  tiles[17] = (() => {
    const c = tiles[6].clone();
    const rng = mulberry32(hashSeed(SEED, 'tile_17_chest_pad_64'));
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const [pr, pg, pb] = tiles[1].getPixel(x, y);
        const [sr, sg, sb] = tiles[6].getPixel(x, y);
        const d = Math.hypot((x - 31.5) / 26.0, (y - 35.0) / 23.0);
        const stoneWeight = d < 1.0 ? clamp((1 - d * d) * 0.68 + bayerAt(x, y) * 0.08, 0, 0.72) : 0;
        const grain = d < 0.92 ? (rng() > 0.85 ? 10 : rng() < 0.15 ? -10 : 0) : 0;
        c.setPixel(
          x,
          y,
          lerp(sr, pr, stoneWeight) + grain,
          lerp(sg, pg, stoneWeight) + grain,
          lerp(sb, pb, stoneWeight) + grain,
          255,
        );
      }
    }
    return c;
  })();

  // Volcano & Peak & Village Lanterns (18..25)
  tiles[18] = detailLava64(M.lava);
  tiles[19] = (() => {
    const v = M.volcanoFloor.clone();
    const rng = mulberry32(hashSeed(SEED, 'tile_19_volcano_floor'));
    // Subtle fractured basalt seams + tiny glowing ember specks
    for (let i = 0; i < 8; i++) {
      const ex = Math.floor(rng() * 64);
      const ey = Math.floor(rng() * 64);
      setWrapped(v, ex, ey, 232, 118, 48, 210);
      setWrapped(v, ex + 1, ey, 255, 192, 92, 180);
    }
    return v;
  })();
  tiles[20] = buildPathVariant64(tiles[19], M.path, [126, 76, 62], 0.74, {
    seedLabel: 'tile_20_volcano_path',
    mortarAccent: [238, 126, 52],
    mortarAccentCount: 8,
  });
  tiles[21] = (() => {
    const ice = M.iceWall.clone();
    // Crisp glacial crystal specular ridges
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        if ((x + y * 2) % 23 === 0 && y < 44) {
          const [r, g, b] = ice.getPixel(x, y);
          ice.setPixel(x, y, Math.min(255, r + 42), Math.min(255, g + 44), Math.min(255, b + 48), 255);
        }
      }
    }
    return ice;
  })();
  tiles[22] = (() => {
    const sn = M.snowIce.clone();
    const rng = mulberry32(hashSeed(SEED, 'tile_22_snow_64'));
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const drift = Math.sin((x / 64) * Math.PI * 2 + (y / 64) * Math.PI * 2) + bayerAt(x, y) * 0.45;
        const [r, g, b] = sn.getPixel(x, y);
        if (drift > 0.65) sn.setPixel(x, y, r + 10, g + 10, b + 8, 255);
        else if (drift < -0.65) sn.setPixel(x, y, r - 12, g - 6, b + 4, 255);
      }
    }
    for (let i = 0; i < 10; i++) {
      const sx = Math.floor(rng() * 64);
      const sy = Math.floor(rng() * 64);
      setWrapped(sn, sx, sy, 255, 255, 255, 235);
      setWrapped(sn, sx + 1, sy, 186, 238, 255, 190);
    }
    return sn;
  })();
  tiles[23] = buildPathVariant64(tiles[22], M.path, [148, 202, 232], 0.72, {
    seedLabel: 'tile_23_snow_path',
    mortarAccent: [224, 248, 255],
    mortarAccentCount: 9,
  });

  // 24: RUNE_TRAIL (crisp carved twilight flagstone with celestial diamond inlay)
  tiles[24] = (() => {
    const r = M.runeFlagstone.clone();
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const dx = Math.abs(x - 31.5);
        const dy = Math.abs(y - 31.5);
        if (Math.abs(dx + dy - 15.0) < 1.5) {
          r.blendPixel(x, y, 134, 224, 252, 205);
        } else if (Math.abs(dx + dy - 17.0) < 0.9) {
          r.blendPixel(x, y, 28, 38, 72, 160);
        } else if (dx + dy < 4.5) {
          r.blendPixel(x, y, 248, 214, 132, 225);
        }
      }
    }
    return r;
  })();

  // 25: LANTERN ground tile (warm village cobble + carved octagonal slate & brass plinth)
  tiles[25] = (() => {
    const l = tiles[1].clone();
    for (let y = 40; y <= 57; y++) {
      for (let x = 23; x <= 40; x++) {
        const dx = Math.abs(x - 31.5);
        const dy = Math.abs(y - 48.5);
        if (dx + dy > 12.5) continue; // Octagonal chamfered stone plinth
        const isOuter = dx > 7.5 || dy > 7.5 || dx + dy > 11.2;
        const isHi = y <= 43 || x <= 25;
        if (isOuter) {
          l.blendPixel(x, y, 28, 34, 56, 220);
        } else if (isHi) {
          l.blendPixel(x, y, 128, 138, 166, 205);
        } else {
          l.blendPixel(x, y, 74, 82, 108, 195);
        }
      }
    }
    // 4 subtle brass corner bolts on plinth
    for (const [bx, by] of [[26, 43], [37, 43], [26, 54], [37, 54]]) {
      l.setPixel(bx, by, 232, 194, 104, 255);
    }
    return l;
  })();

  // Grove (26..27)
  tiles[26] = detailGrass64(tintTile(M.grass, [42, 142, 88], 0.52, 0.98), 'tile_26_grove_grass', {
    shadow: [20, 74, 52],
    mid: [46, 142, 86],
    tip: [112, 208, 132],
    tuftCount: 11,
    accentCount: 6,
    accents: [[255, 178, 214], [255, 216, 236], [148, 228, 166]],
  });
  tiles[27] = buildPathVariant64(tiles[26], M.path, [160, 154, 114], 0.76, {
    seedLabel: 'tile_27_grove_path',
    mortarAccent: [252, 178, 214],
    mortarAccentCount: 8,
  });

  // Desert (28..30)
  tiles[28] = detailSand64(tintTile(M.sand, [244, 194, 110], 0.48, 0.98), 'tile_28_desert_sand', {
    pebbleCount: 8,
  });
  tiles[29] = buildPathVariant64(tiles[28], M.sandstoneWall, [218, 170, 98], 0.70, {
    seedLabel: 'tile_29_desert_path',
    mortarAccent: [248, 216, 142],
    mortarAccentCount: 6,
  });
  tiles[30] = buildWallVariant64(M.sandstoneWall, [214, 152, 82], [255, 222, 138], 'tile_30_sandstone_wall');

  // Marsh (31..33)
  tiles[31] = detailGrass64(M.marshGrass, 'tile_31_marsh_grass', {
    shadow: [18, 48, 56],
    mid: [42, 108, 96],
    tip: [88, 174, 146],
    tuftCount: 10,
    accentCount: 6,
    accents: [[124, 238, 218], [186, 132, 255]],
  });
  tiles[32] = buildPathVariant64(tiles[31], detailBridge64(M.bridge), [98, 94, 134], 0.74, {
    seedLabel: 'tile_32_marsh_path',
    mortarAccent: [92, 222, 198],
    mortarAccentCount: 6,
  });
  tiles[33] = buildWallVariant64(M.cliffWall, [54, 48, 86], [192, 134, 255], 'tile_33_marsh_wall');

  // Sanctum (34..36)
  tiles[34] = M.sanctumFloor.clone();
  tiles[35] = (() => {
    const sp = buildPathVariant64(M.sanctumFloor, M.runeFlagstone, [228, 216, 190], 0.58, {
      seedLabel: 'tile_35_sanctum_path',
    });
    for (let y = 0; y < 64; y++) {
      // Double-beveled gilded brass marble inlay rails
      sp.setPixel(9, y, 138, 104, 42, 255);
      sp.setPixel(10, y, 242, 206, 114, 255);
      sp.setPixel(11, y, 255, 232, 154, 255);
      sp.setPixel(52, y, 255, 232, 154, 255);
      sp.setPixel(53, y, 242, 206, 114, 255);
      sp.setPixel(54, y, 138, 104, 42, 255);
    }
    return sp;
  })();
  tiles[36] = buildWallVariant64(M.sandstoneWall, [220, 210, 196], [255, 230, 146], 'tile_36_sanctum_wall');

  // Canyon (37..39)
  tiles[37] = detailGrass64(M.canyonGrass, 'tile_37_canyon_grass', {
    shadow: [98, 50, 32],
    mid: [176, 98, 56],
    tip: [238, 178, 92],
    tuftCount: 9,
    accentCount: 5,
    accents: [[246, 204, 112], [202, 120, 74]],
  });
  tiles[38] = buildPathVariant64(tiles[37], M.path, [202, 126, 84], 0.76, {
    seedLabel: 'tile_38_canyon_path',
    mortarAccent: [248, 208, 116],
    mortarAccentCount: 6,
  });
  tiles[39] = buildWallVariant64(M.sandstoneWall, [172, 78, 52], [255, 202, 128], 'tile_39_canyon_wall');

  // Reef (40..42)
  tiles[40] = detailWater64(M.reefWater, 'reef', 'tile_40_reef_water');
  tiles[41] = buildPathVariant64(tiles[40], tiles[6], [240, 224, 180], 0.78, {
    seedLabel: 'tile_41_reef_path',
    mortarAccent: [128, 236, 248],
    mortarAccentCount: 8,
  });
  tiles[42] = buildWallVariant64(M.cliffWall, [72, 142, 178], [255, 152, 202], 'tile_42_reef_wall');

  // Ruins (43..45)
  tiles[43] = M.runeFlagstone.clone();
  tiles[44] = buildPathVariant64(M.runeFlagstone, M.path, [154, 168, 140], 0.74, {
    seedLabel: 'tile_44_ruins_path',
    mortarAccent: [126, 218, 192],
    mortarAccentCount: 8,
  });
  tiles[45] = buildWallVariant64(M.cliffWall, [104, 116, 110], [142, 234, 208], 'tile_45_ruins_wall');

  // Rift (46..48)
  tiles[46] = (() => {
    const rf = M.riftFloor.clone();
    const rng = mulberry32(hashSeed(SEED, 'tile_46_rift_stars'));
    for (let i = 0; i < 14; i++) {
      const sx = Math.floor(rng() * 64);
      const sy = Math.floor(rng() * 64);
      const cyan = i % 2 === 0;
      setWrapped(rf, sx, sy, cyan ? 176 : 244, cyan ? 242 : 168, 255, 235);
      if (i % 3 === 0) {
        setWrapped(rf, sx - 1, sy, cyan ? 112 : 186, cyan ? 196 : 112, 255, 150);
        setWrapped(rf, sx + 1, sy, cyan ? 112 : 186, cyan ? 196 : 112, 255, 150);
      }
    }
    return rf;
  })();
  tiles[47] = (() => {
    const rp = buildPathVariant64(tiles[46], detailTerastal64(M.terastalFloor), [98, 74, 184], 0.66, {
      seedLabel: 'tile_47_rift_path',
    });
    for (let y = 0; y < 64; y++) {
      if ((y & 7) === 2 || (y & 7) === 3) {
        rp.setPixel(11, y, 196, 152, 255, 255);
        rp.setPixel(12, y, 236, 210, 255, 255);
        rp.setPixel(51, y, 134, 238, 255, 255);
        rp.setPixel(52, y, 212, 252, 255, 255);
      }
    }
    return rp;
  })();
  tiles[48] = buildWallVariant64(M.cliffWall, [44, 24, 80], [224, 132, 255], 'tile_48_rift_wall');

  // Faeveldt (49..51)
  tiles[49] = detailGrass64(M.faeGrass, 'tile_49_fae_grass', {
    shadow: [78, 54, 118],
    mid: [142, 108, 192],
    tip: [224, 184, 246],
    tuftCount: 10,
    accentCount: 7,
    accents: [[255, 188, 236], [164, 238, 255], [255, 242, 178]],
  });
  tiles[50] = buildPathVariant64(tiles[49], M.path, [222, 186, 236], 0.74, {
    seedLabel: 'tile_50_fae_path',
    mortarAccent: [255, 182, 232],
    mortarAccentCount: 8,
  });
  tiles[51] = buildWallVariant64(M.cliffWall, [134, 100, 172], [255, 186, 240], 'tile_51_fae_wall');

  // Atoll (52..54)
  tiles[52] = detailSand64(tintTile(M.sand, [254, 238, 190], 0.55, 1.04), 'tile_52_atoll_sand', {
    pebbleCount: 10,
  });
  tiles[53] = buildPathVariant64(tiles[52], detailBridge64(M.bridge), [218, 200, 166], 0.68, {
    seedLabel: 'tile_53_atoll_path',
  });
  tiles[54] = buildWallVariant64(M.sandstoneWall, [168, 164, 150], [118, 238, 246], 'tile_54_atoll_wall');

  // Highlands / Crown (55..57)
  tiles[55] = detailCrownSteel64(M.crownFloor);
  tiles[56] = buildPathVariant64(tiles[55], M.path, [128, 142, 168], 0.74, {
    seedLabel: 'tile_56_crown_path',
    mortarAccent: [168, 212, 248],
    mortarAccentCount: 7,
  });
  tiles[57] = buildWallVariant64(M.cliffWall, [76, 90, 122], [178, 218, 250], 'tile_57_crown_wall');

  // Crater / Terastal (58..60)
  tiles[58] = detailTerastal64(M.terastalFloor);
  tiles[59] = buildPathVariant64(tiles[58], M.sanctumFloor, [190, 216, 255], 0.70, {
    seedLabel: 'tile_59_tera_path',
    mortarAccent: [220, 246, 255],
    mortarAccentCount: 9,
  });
  tiles[60] = buildWallVariant64(tiles[21], [138, 170, 246], [242, 252, 255], 'tile_60_tera_wall');

  // Pack into 8x8 @ 64x64 HD-2D = 512x512
  const tileSize = 64;
  const cols = 8;
  const rows = 8;
  const width = cols * tileSize; // 512
  const height = rows * tileSize; // 512

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

    // Sobel tangent-space normal map per 64x64 tile (no bleed across neighbors)
    const isWater = id === 4 || id === 5 || id === 40;
    writeSobelNormalRegion(normal, albedo, ox, oy, tileSize, tileSize, isWater ? 1.9 : 3.1, false);

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
            ea = 200;
          }
        } else if (id === 19 || id === 20) {
          // Volcano floor: ONLY tiny glowing ember cracks, never the basalt body
          if (r > 195 && g > 105 && r - b >= 95) {
            er = r;
            eg = Math.round(g * 0.85);
            eb = Math.round(b * 0.6);
            ea = 148;
          }
        } else if (id === 15 || id === 16 || id === 24) {
          // Heal pad, Shrine, Rune trail subtle carved glow
          if ((b > 210 && g > 205 && b > r + 28) || (r > 225 && g > 192 && b < 140)) {
            er = r;
            eg = g;
            eb = b;
            ea = 122;
          }
        } else if (id === 46 || id === 47 || id === 48) {
          // Rift floor/path/wall: ONLY bright starlight specks & crystal edges, NEVER the dark stone body
          if (lum >= 152 || (b >= 214 && r >= 155)) {
            er = r;
            eg = g;
            eb = b;
            ea = 148;
          }
        } else if (id === 58 || id === 59 || id === 60) {
          // Terastal crystal specular facets only
          if (lum > 230 || (b > 240 && g > 218 && r > 185)) {
            er = r;
            eg = g;
            eb = b;
            ea = 138;
          }
        } else if (id === 8 || id === 9 || id === 10 || id === 21 || id === 33 || id === 49 || id === 50) {
          // Crystal & biolume flecks
          if ((b > 215 && g > 195 && b > r + 35) || (r > 195 && b > 225 && b > g + 45)) {
            er = r;
            eg = g;
            eb = b;
            ea = 148;
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

  // Upgrade every prop to crisp 2x HD-2D pixel art (cottages 192x192, trees/shrines/fountains 128x128, small props 96x96/96x128)
  const loaded = PROP_IDS.map((id) => {
    const raw = loadMasterPng(`props/${id}.png`);
    const base = new PixelImage(raw.width, raw.height, raw.data);
    const hd = upscaleSprite2x(base, { edgeThresh: 28, sharpen: 0.30, bevel: 0.11 });
    return { id, image: hd };
  });

  const packed = packShelf(loaded, 1024, 4);
  const albedo = new PixelImage(packed.width, packed.height);
  const normal = new PixelImage(packed.width, packed.height);
  const emissive = new PixelImage(packed.width, packed.height);
  const regions = {};

  for (const p of packed.placements) {
    albedo.blit(p.image, p.x, p.y);
    writeSobelNormalRegion(normal, albedo, p.x, p.y, p.image.width, p.image.height, 2.8, true);

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
            emit = r >= 224 && g >= 174 && b <= 134;
            ea = 158;
            break;
          case 'cottage_lab':
            // Cyan skylight/window glass only (avoid blowing out cream plaster/roof)
            emit = b >= 208 && g >= 208 && b - r >= 30;
            ea = 158;
            break;
          case 'lantern':
            // Warm lantern glass flame only
            emit = r >= 218 && g >= 184 && lum >= 188 && y < p.image.height * 0.56;
            ea = 186;
            break;
          case 'shrine_open':
            // Cyan/mint glowing shrine crystals
            emit = g >= 188 && b >= 188 && g + b - 2 * r > 30;
            ea = 172;
            break;
          case 'shrine_cleared':
            // Soft amber residual crystal glow
            emit = r >= 228 && g >= 188 && b <= 156;
            ea = 120;
            break;
          case 'fountain':
            // Specular water crest highlights only (never stone basin rim)
            emit = b >= 218 && g >= 210 && b > r + 30;
            ea = 132;
            break;
          case 'prop_mushroom':
            // Bioluminescent cap spots only (never cream mushroom stem)
            emit = y < p.image.height * 0.62 && ((b >= 198 && g >= 168 && b > r + 26) || (b >= 220 && r >= 148 && b > g + 40));
            ea = 160;
            break;
          case 'prop_crystal':
            // Faceted glowing crystal cluster
            emit = b >= 192 && g >= 162 && b > r + 24;
            ea = 180;
            break;
          case 'landmark_obelisk':
            // Carved glowing runes
            emit = b >= 178 && g >= 168 && b > r + 34;
            ea = 190;
            break;
          case 'landmark_observatory':
            // Starlight telescope lens glint & brass lamp
            emit = (r >= 222 && g >= 182 && b <= 136) || (b >= 222 && g >= 212 && b > r + 20);
            ea = 170;
            break;
          case 'chest_open':
            // Treasure gleam inside open chest
            emit = r >= 222 && g >= 178 && b <= 136;
            ea = 204;
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

  return { albedo, normal, emissive, regions, width: packed.width, height: packed.height, tileSize: 128 };
}

/**
 * Derives a bespoke 64x80 HD-2D villager sprite by palette-recoloring a clean trainer silhouette
 * (preserving skin, eyes, and dark pixel contours while transforming hair, outfit, and trim so
 * village NPCs have distinct personalities instead of cloning Professor Willow's lab coat).
 */
function deriveVillagerSprite64(base64, palette) {
  const { hair, outfit, trim, boots } = palette;
  return mapPixels(base64, (r, g, b, a, x, y) => {
    if (a < 128) return [0, 0, 0, 0];
    const lum = luma255(r, g, b) / 255;
    // Keep crisp dark ink contours & pupils intact
    if (lum < 0.24) return [r, g, b, 255];

    // Preserve entire face, warm peach skin, rosy blush, shaded chin, and sclera whites cleanly!
    const inFaceZone = y >= 21 && y <= 41 && x >= 19 && x <= 45;
    const isWarmSkin =
      inFaceZone &&
      r > 130 &&
      g > 82 &&
      b > 62 &&
      r >= g + 4 &&
      r >= b + 12 &&
      r - g <= 78;
    const isEyePixel = inFaceZone && y >= 26 && y <= 36 && x >= 22 && x <= 42 && (lum > 0.82 || lum < 0.36);
    if (isWarmSkin || isEyePixel) {
      return [r, g, b, 255];
    }

    // Preserve golden clasps/buckles (bright warm yellow)
    const isGold = r > 205 && g > 165 && b < 115;
    if (isGold) {
      const shade = 0.72 + lum * 0.45;
      return [trim[0] * shade, trim[1] * shade, trim[2] * shade, 255];
    }

    // Head/cap/hair region (y < 39)
    if (y < 39) {
      const shade = 0.56 + lum * 0.76;
      const target = y < 18 ? outfit : hair;
      return [target[0] * shade, target[1] * shade, target[2] * shade, 255];
    }

    // Boots / shoes region (y >= 64)
    if (y >= 64) {
      const shade = 0.55 + lum * 0.75;
      return [boots[0] * shade, boots[1] * shade, boots[2] * shade, 255];
    }

    // Torso / tunic / skirt / trousers (y: 39..63)
    const shade = 0.52 + lum * 0.84;
    const isAccentStripe = y >= 41 && y <= 49 && Math.abs(x - 32) <= 5 && lum > 0.54;
    const target = isAccentStripe ? trim : outfit;
    return [target[0] * shade, target[1] * shade, target[2] * shade, 255];
  });
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

  // Keep UI portraits at ultra-crisp enhanced 64x64 (matches 46-76px HUD/Title canvases without downscale alias);
  // upgrade all 12 overworld character sprites to 2x HD-2D pixel art (64x80) to shine at zoomed desktop scale!
  const loaded = CHAR_IDS.map((id) => {
    const raw = loadMasterPng(`characters/${id}.png`);
    const base = new PixelImage(raw.width, raw.height, raw.data);
    const isPortrait = id.endsWith('_portrait');
    const image = isPortrait
      ? enhancePixelCraft(base, { sharpen: 0.24, dither: 1.2, wrap: false, warmCool: 0.55 })
      : upscaleSprite2x(base, { edgeThresh: 26, sharpen: 0.26, bevel: 0.09 });
    return { id, image };
  });

  // Add 4 bespoke HD-2D villager archetypes so townsfolk never clone Professor Willow's lab coat!
  const ozias64 = loaded.find((item) => item.id === 'ozias_idle').image;
  const violet64 = loaded.find((item) => item.id === 'violet_idle').image;
  const villagerSpecs = [
    {
      id: 'villager_scout',
      base: ozias64,
      palette: {
        hair: [118, 72, 46],
        outfit: [46, 138, 86],
        trim: [242, 204, 102],
        boots: [98, 66, 44],
      },
    },
    {
      id: 'villager_scholar',
      base: violet64,
      palette: {
        hair: [152, 76, 62],
        outfit: [58, 96, 178],
        trim: [244, 212, 128],
        boots: [64, 58, 94],
      },
    },
    {
      id: 'villager_artisan',
      base: violet64,
      palette: {
        hair: [198, 146, 78],
        outfit: [196, 94, 62],
        trim: [252, 224, 146],
        boots: [94, 60, 44],
      },
    },
    {
      id: 'villager_sailor',
      base: ozias64,
      palette: {
        hair: [52, 62, 92],
        outfit: [38, 118, 152],
        trim: [246, 240, 216],
        boots: [54, 64, 88],
      },
    },
  ];
  for (const spec of villagerSpecs) {
    loaded.push({
      id: spec.id,
      image: enhancePixelCraft(deriveVillagerSprite64(spec.base, spec.palette), {
        sharpen: 0.20,
        dither: 1.2,
        wrap: false,
        warmCool: 0.65,
      }),
    });
  }

  const packed = packShelf(loaded, 1024, 4);
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

  return { albedo, regions, width: packed.width, height: packed.height, tileSize: 64 };
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

function stripDetachedSlivers(img, minPixels = 36) {
  // Deterministic flood-fill cleanup removing tiny detached stray artifact islands (e.g. serpentine left-edge sliver)
  const w = img.width;
  const h = img.height;
  const visited = new Uint8Array(w * h);
  const out = img.clone();
  const queue = new Int32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (visited[start] || out.data[start * 4 + 3] < 20) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;
      const members = [];

      while (head < tail) {
        const cur = queue[head++];
        members.push(cur);
        const cx = cur % w;
        const cy = (cur - cx) / w;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const nIdx = ny * w + nx;
            if (!visited[nIdx] && out.data[nIdx * 4 + 3] >= 20) {
              visited[nIdx] = 1;
              queue[tail++] = nIdx;
            }
          }
        }
      }

      if (members.length < minPixels) {
        for (const m of members) {
          out.data[m * 4] = 0;
          out.data[m * 4 + 1] = 0;
          out.data[m * 4 + 2] = 0;
          out.data[m * 4 + 3] = 0;
        }
      }
    }
  }
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
    const baseImg = new PixelImage(raw.width, raw.height, raw.data);
    return {
      id,
      image: id === 'serpentine' ? stripDetachedSlivers(baseImg, 40) : baseImg,
    };
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
