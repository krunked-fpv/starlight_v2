#!/usr/bin/env node
/**
 * Starlight v2 — Deterministic Procedural Atlas & Vector Icon Baker
 *
 * Pure Node ESM using ONLY built-in modules (`node:fs`, `node:path`, `node:zlib`, `node:crypto`).
 * Produces 100% byte-identical outputs across runs:
 *  - public/atlases/terrain-atlas.png    (384x608, 12x19 tiles @ 32x32)
 *  - public/atlases/terrain-normal.png   (384x608, Sobel tangent-space normal map)
 *  - public/atlases/terrain-emissive.png (384x608, emissive glow mask)
 *  - public/atlases/props-atlas.png      (384x192, 6x3 props @ 64x64)
 *  - public/atlases/characters-atlas.png (256x256, 8x8 frames @ 32x32)
 *  - public/atlases/manifest.json        (AtlasManifest)
 *  - public/icons/starlight-icons.svg    (72 multi-stop <symbol> icons, zero emojis)
 *  - public/icons/starlight-emblem.svg   (Standalone celestial favicon emblem)
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ATLAS_DIR = path.join(ROOT_DIR, 'public', 'atlases');
const ICON_DIR = path.join(ROOT_DIR, 'public', 'icons');

const SEED = 20261124;

// -----------------------------------------------------------------------------
// Deterministic PRNG & Hashing
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

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(c1, c2, t) {
  const k = clamp(t, 0, 1);
  return [
    Math.round(lerp(c1[0], c2[0], k)),
    Math.round(lerp(c1[1], c2[1], k)),
    Math.round(lerp(c1[2], c2[2], k)),
  ];
}

function shadeRgb(c, factor, add = 0) {
  return [
    clamp(Math.round(c[0] * factor + add), 0, 255),
    clamp(Math.round(c[1] * factor + add), 0, 255),
    clamp(Math.round(c[2] * factor + add), 0, 255),
  ];
}

function valueNoise2D(seed, x, y, period = 32) {
  const hash2 = (ix, iy) => {
    const wx = ((ix % period) + period) % period;
    const wy = ((iy % period) + period) % period;
    let h = (seed ^ Math.imul(wx, 374761393) ^ Math.imul(wy, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(x - x0);
  const fy = smoothstep(y - y0);
  const n00 = hash2(x0, y0);
  const n10 = hash2(x0 + 1, y0);
  const n01 = hash2(x0, y0 + 1);
  const n11 = hash2(x0 + 1, y0 + 1);
  return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy);
}

function fbm2D(seed, x, y, period = 32) {
  return (
    valueNoise2D(seed, x, y, period) * 0.55 +
    valueNoise2D(seed + 101, x * 2, y * 2, period * 2) * 0.3 +
    valueNoise2D(seed + 211, x * 4, y * 4, period * 4) * 0.15
  );
}

// -----------------------------------------------------------------------------
// Pure-JS Deterministic RGBA PNG Encoder (node:zlib, zero timestamps)
// -----------------------------------------------------------------------------
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
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const rowOut = y * (1 + stride);
    const rowIn = y * stride;
    raw[rowOut] = 1; // Sub filter improves deflate ratio deterministically
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? rgba[rowIn + x - 4] : 0;
      raw[rowOut + 1 + x] = (rgba[rowIn + x] - left) & 0xff;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// -----------------------------------------------------------------------------
// Pixel Buffer Helpers
// -----------------------------------------------------------------------------
class PixelCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  setPixel(x, y, r, g, b, a = 255) {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return;
    const idx = (yi * this.width + xi) * 4;
    if (a >= 255) {
      this.data[idx] = clamp(r, 0, 255);
      this.data[idx + 1] = clamp(g, 0, 255);
      this.data[idx + 2] = clamp(b, 0, 255);
      this.data[idx + 3] = 255;
    } else if (a > 0) {
      const sa = a / 255;
      const da = this.data[idx + 3] / 255;
      const outA = sa + da * (1 - sa);
      if (outA > 0) {
        this.data[idx] = Math.round((r * sa + this.data[idx] * da * (1 - sa)) / outA);
        this.data[idx + 1] = Math.round((g * sa + this.data[idx + 1] * da * (1 - sa)) / outA);
        this.data[idx + 2] = Math.round((b * sa + this.data[idx + 2] * da * (1 - sa)) / outA);
        this.data[idx + 3] = Math.round(outA * 255);
      }
    }
  }

  addGlow(x, y, r, g, b, a = 255) {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return;
    const idx = (yi * this.width + xi) * 4;
    this.data[idx] = clamp(this.data[idx] + r, 0, 255);
    this.data[idx + 1] = clamp(this.data[idx + 1] + g, 0, 255);
    this.data[idx + 2] = clamp(this.data[idx + 2] + b, 0, 255);
    this.data[idx + 3] = clamp(Math.max(this.data[idx + 3], a), 0, 255);
  }

  fillRect(x, y, w, h, rgb, a = 255) {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        this.setPixel(px, py, rgb[0], rgb[1], rgb[2], a);
      }
    }
  }

  fillCircle(cx, cy, radius, rgb, a = 255) {
    const r2 = radius * radius;
    const x0 = Math.floor(cx - radius);
    const x1 = Math.ceil(cx + radius);
    const y0 = Math.floor(cy - radius);
    const y1 = Math.ceil(cy + radius);
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= r2) {
          this.setPixel(px, py, rgb[0], rgb[1], rgb[2], a);
        }
      }
    }
  }

  fillEllipse(cx, cy, rx, ry, rgb, a = 255) {
    const x0 = Math.floor(cx - rx);
    const x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry);
    const y1 = Math.ceil(cy + ry);
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const nx = (px - cx) / rx;
        const ny = (py - cy) / ry;
        if (nx * nx + ny * ny <= 1) {
          this.setPixel(px, py, rgb[0], rgb[1], rgb[2], a);
        }
      }
    }
  }

  drawLine(x0, y0, x1, y1, rgb, a = 255) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.setPixel(Math.round(lerp(x0, x1, t)), Math.round(lerp(y0, y1, t)), rgb[0], rgb[1], rgb[2], a);
    }
  }

  blitFrom(src, sx, sy, sw, sh, dx, dy) {
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

// -----------------------------------------------------------------------------
// Canonical Data (synced strictly with src/contracts & src/core/data)
// -----------------------------------------------------------------------------
const BIOMES = [
  { id: 'starlight-village', type: 'normal', ground: '#4f7d58', grass: '#3f6e49', shallow: '#3aa6d6', deep: '#184e82', cliff: '#6c5a4e', accent: '#ffd479', glow: 0.75 },
  { id: 'meadow', type: 'normal', ground: '#69a653', grass: '#4f8f3d', shallow: '#4bc2e3', deep: '#206ea3', cliff: '#8a7357', accent: '#fff3a8', glow: 0.35 },
  { id: 'verdant-canopy', type: 'grass', ground: '#38784b', grass: '#255c37', shallow: '#35a397', deep: '#165257', cliff: '#594b3d', accent: '#7ef29d', glow: 0.55 },
  { id: 'ember-caldera', type: 'fire', ground: '#613c35', grass: '#8c4329', shallow: '#ff7b33', deep: '#b32814', cliff: '#3d2522', accent: '#ff9f43', glow: 1.0, volcanic: true },
  { id: 'sapphire-lagoon', type: 'water', ground: '#d4be8d', grass: '#4ea885', shallow: '#38c7f0', deep: '#12549c', cliff: '#756859', accent: '#7ef2ff', glow: 0.65 },
  { id: 'volt-highlands', type: 'electric', ground: '#57685e', grass: '#4a7554', shallow: '#4db8e8', deep: '#1c4f8a', cliff: '#4f5569', accent: '#ffe052', glow: 0.85 },
  { id: 'frost-glacier', type: 'ice', ground: '#b8dff0', grass: '#8bc4de', shallow: '#63d2f2', deep: '#1f6b99', cliff: '#6e8ea8', accent: '#a3f7ff', glow: 0.8 },
  { id: 'valor-dojo', type: 'fighting', ground: '#7a8a56', grass: '#4f7339', shallow: '#4cb5ba', deep: '#1e5c6e', cliff: '#6b5748', accent: '#ff7d6b', glow: 0.45 },
  { id: 'mire-bayou', type: 'poison', ground: '#453e59', grass: '#4e3569', shallow: '#7848ad', deep: '#351b5c', cliff: '#372e45', accent: '#d07aff', glow: 0.95 },
  { id: 'ochre-canyon', type: 'ground', ground: '#c4864b', grass: '#9e6c38', shallow: '#4fb0c6', deep: '#1f6482', cliff: '#8c4c2b', accent: '#ffd185', glow: 0.4 },
  { id: 'zephyr-peaks', type: 'flying', ground: '#7d9e89', grass: '#5c8c71', shallow: '#7ec8f2', deep: '#3d79bd', cliff: '#798599', accent: '#b8e2ff', glow: 0.65 },
  { id: 'astral-ruins', type: 'psychic', ground: '#574c7d', grass: '#6c4b8f', shallow: '#8d72e1', deep: '#3a247a', cliff: '#40385e', accent: '#ff7ec3', glow: 0.95 },
  { id: 'amber-thicket', type: 'bug', ground: '#658038', grass: '#4b6b23', shallow: '#54b098', deep: '#20635d', cliff: '#5e4b30', accent: '#d4ff66', glow: 0.7 },
  { id: 'basalt-quarry', type: 'rock', ground: '#8a7c66', grass: '#6e6552', shallow: '#4f9bb5', deep: '#235270', cliff: '#594e3f', accent: '#f5dc9b', glow: 0.5 },
  { id: 'mist-hollow', type: 'ghost', ground: '#3c3b5c', grass: '#302f52', shallow: '#6063b5', deep: '#23245e', cliff: '#2b2942', accent: '#a394ff', glow: 0.9 },
  { id: 'drake-summit', type: 'dragon', ground: '#4b5582', grass: '#3b4a78', shallow: '#5c8cff', deep: '#233a8a', cliff: '#353a5c', accent: '#8ca8ff', glow: 0.85 },
  { id: 'eclipse-crag', type: 'dark', ground: '#353042', grass: '#2a2438', shallow: '#564d78', deep: '#1f1a33', cliff: '#221d2e', accent: '#c8b8ff', glow: 0.85 },
  { id: 'aegis-foundry', type: 'steel', ground: '#697887', grass: '#516273', shallow: '#5aa7c7', deep: '#234c6b', cliff: '#43505e', accent: '#a8e4ff', glow: 0.65 },
  { id: 'starbloom-glade', type: 'fairy', ground: '#5f8a74', grass: '#4a7a69', shallow: '#70c4e8', deep: '#335d99', cliff: '#6e5c73', accent: '#ffa8e2', glow: 0.9 },
];

const TERRAIN_COLUMNS = [
  'ground',
  'tall-grass',
  'sand',
  'cobble',
  'cliff',
  'shallow-water',
  'deep-water',
  'bridge',
  'plaza',
  'flowerbed',
  'shore-edge',
  'cliff-top',
];

const PROP_NAMES = [
  'cottage',
  'shrine',
  'chest',
  'fountain',
  'signpost',
  'starfall',
  'studio',
  'observatory',
  'crystal',
  'ember-vent',
  'spore-lantern',
  'coral',
  'ruin-pillar',
  'bamboo',
  'pine',
  'blossom-tree',
  'lantern-post',
  'gear-spire',
];

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
  { index: 1, name: 'Clover Crest', category: 'elemental', type: 'normal', material: 'silver', primaryColor: '#e8e0cc', accentColor: '#fff8de' },
  { index: 2, name: 'Canopy Leaf', category: 'elemental', type: 'grass', material: 'prism', primaryColor: '#4bd478', accentColor: '#c7ffd8' },
  { index: 3, name: 'Caldera Ember', category: 'elemental', type: 'fire', material: 'gold', primaryColor: '#ff6b35', accentColor: '#ffd166' },
  { index: 4, name: 'Lagoon Pearl', category: 'elemental', type: 'water', material: 'prism', primaryColor: '#38b6ff', accentColor: '#b8f2ff' },
  { index: 5, name: 'Skythunder Bolt', category: 'elemental', type: 'electric', material: 'gold', primaryColor: '#ffd93d', accentColor: '#fff7ad' },
  { index: 6, name: 'Borealis Prism', category: 'elemental', type: 'ice', material: 'prism', primaryColor: '#7be8ff', accentColor: '#eafcff' },
  { index: 7, name: 'Ironcrest Seal', category: 'elemental', type: 'fighting', material: 'obsidian', primaryColor: '#e05246', accentColor: '#ffb3ab' },
  { index: 8, name: 'Spore Chalice', category: 'elemental', type: 'poison', material: 'astral', primaryColor: '#b55cff', accentColor: '#ebcaff' },
  { index: 9, name: 'Mesa Monolith', category: 'elemental', type: 'ground', material: 'gold', primaryColor: '#d9a05b', accentColor: '#ffe7ba' },
  { index: 10, name: 'Zephyr Pinion', category: 'elemental', type: 'flying', material: 'silver', primaryColor: '#7fb5ff', accentColor: '#e0eeff' },
  { index: 11, name: 'Astral Eye', category: 'elemental', type: 'psychic', material: 'astral', primaryColor: '#ff5ca8', accentColor: '#ffc9e4' },
  { index: 12, name: 'Lantern Wing', category: 'elemental', type: 'bug', material: 'prism', primaryColor: '#9be038', accentColor: '#e8ffb0' },
  { index: 13, name: 'Starstone Core', category: 'elemental', type: 'rock', material: 'obsidian', primaryColor: '#c7b07b', accentColor: '#f7eccb' },
  { index: 14, name: 'Wispveil Lantern', category: 'elemental', type: 'ghost', material: 'astral', primaryColor: '#816bff', accentColor: '#d6ccff' },
  { index: 15, name: 'Wyrm Sovereign', category: 'elemental', type: 'dragon', material: 'astral', primaryColor: '#5e7bff', accentColor: '#c2d0ff' },
  { index: 16, name: 'Eclipse Halo', category: 'elemental', type: 'dark', material: 'obsidian', primaryColor: '#7a6f91', accentColor: '#d1c4eb' },
  { index: 17, name: 'Aegis Gear', category: 'elemental', type: 'steel', material: 'silver', primaryColor: '#9cb5c9', accentColor: '#ebf6ff' },
  { index: 18, name: 'Starbloom Crown', category: 'elemental', type: 'fairy', material: 'prism', primaryColor: '#ff96d5', accentColor: '#ffe8f7' },
  { index: 19, name: 'Starlight Pioneer', category: 'mastery', type: 'normal', material: 'gold', primaryColor: '#ffd479', accentColor: '#fff5d6' },
  { index: 20, name: 'Sky-Hop Ace', category: 'mastery', type: 'flying', material: 'prism', primaryColor: '#66d9ff', accentColor: '#d9f8ff' },
  { index: 21, name: 'Bond Ascendant', category: 'mastery', type: 'fairy', material: 'astral', primaryColor: '#ff8cd9', accentColor: '#ffe3f6' },
  { index: 22, name: 'Composure Tactician', category: 'mastery', type: 'fighting', material: 'silver', primaryColor: '#78e2d8', accentColor: '#d9fffb' },
  { index: 23, name: 'Dex Archivist', category: 'mastery', type: 'psychic', material: 'gold', primaryColor: '#ff9e66', accentColor: '#ffe4cf' },
  { index: 24, name: 'Starfall Seeker', category: 'mastery', type: 'electric', material: 'astral', primaryColor: '#ffe066', accentColor: '#fff9cc' },
  { index: 25, name: 'Rival Vanquisher', category: 'mastery', type: 'dragon', material: 'obsidian', primaryColor: '#a27bff', accentColor: '#e2d4ff' },
  { index: 26, name: 'Prism Collector', category: 'mastery', type: 'ice', material: 'prism', primaryColor: '#8cf2ff', accentColor: '#ffffff' },
  { index: 27, name: 'Celestial Couturier', category: 'mastery', type: 'fairy', material: 'gold', primaryColor: '#f5b8ff', accentColor: '#fff2ff' },
  { index: 28, name: 'Starlight Sovereign', category: 'mastery', type: 'dragon', material: 'astral', primaryColor: '#ffd966', accentColor: '#96e8ff' },
];

const CORE_ICON_IDS = [
  'icon-pokeball',
  'icon-starball',
  'icon-potion',
  'icon-super-potion',
  'icon-star-shard',
  'icon-composure',
  'icon-briefing',
  'icon-waypoint',
  'icon-shrine',
  'icon-chest',
  'icon-fountain',
  'icon-signpost',
  'icon-starfall',
  'icon-pokedex',
  'icon-badges',
  'icon-style',
  'icon-skyhop',
  'icon-settings',
  'icon-audio-on',
  'icon-audio-off',
  'icon-crt',
  'icon-motion',
  'icon-save',
  'icon-bond',
  'icon-star-rank',
  'icon-crown',
];

// -----------------------------------------------------------------------------
// 1. Terrain Albedo, Normal (Sobel), and Emissive Atlas Baker (384x608)
// -----------------------------------------------------------------------------
function bakeTerrainAtlases() {
  const tileSize = 32;
  const cols = TERRAIN_COLUMNS.length; // 12
  const rows = BIOMES.length; // 19
  const width = cols * tileSize; // 384
  const height = rows * tileSize; // 608

  const albedo = new PixelCanvas(width, height);
  const normal = new PixelCanvas(width, height);
  const emissive = new PixelCanvas(width, height);
  const regions = {};

  for (let row = 0; row < rows; row++) {
    const biome = BIOMES[row];
    const groundC = hexToRgb(biome.ground);
    const grassC = hexToRgb(biome.grass);
    const shallowC = hexToRgb(biome.shallow);
    const deepC = hexToRgb(biome.deep);
    const cliffC = hexToRgb(biome.cliff);
    const accentC = hexToRgb(biome.accent);

    for (let col = 0; col < cols; col++) {
      const kind = TERRAIN_COLUMNS[col];
      const ox = col * tileSize;
      const oy = row * tileSize;
      const tileSeed = hashSeed(SEED, `${biome.id}:${kind}`);
      const rng = mulberry32(tileSeed);

      const hf = new Float32Array(tileSize * tileSize);
      const wrap = kind !== 'cliff' && kind !== 'cliff-top' && kind !== 'bridge' && kind !== 'shore-edge';

      for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
          const n = fbm2D(tileSeed, x * 0.25, y * 0.25, 8);
          const fine = valueNoise2D(tileSeed + 77, x * 0.9, y * 0.9, 32);
          let rgb = groundC;
          let h = 0.5;
          let emit = null;

          if (kind === 'ground') {
            rgb = mixRgb(shadeRgb(groundC, 0.84), shadeRgb(groundC, 1.14), n * 0.78 + fine * 0.22);
            h = 0.42 + n * 0.35 + fine * 0.1;
            if (fine > 0.82 && n > 0.52) {
              rgb = mixRgb(rgb, grassC, 0.65);
              h += 0.12;
            } else if (fine < 0.12) {
              rgb = shadeRgb(rgb, 0.78);
              h -= 0.08;
            }
          } else if (kind === 'tall-grass') {
            rgb = mixRgb(shadeRgb(groundC, 0.72), shadeRgb(grassC, 0.95), n);
            h = 0.25 + n * 0.15;
          } else if (kind === 'sand') {
            const sandBase = mixRgb(groundC, [224, 198, 144], biome.id === 'frost-glacier' ? 0.25 : 0.65);
            const ripple = Math.sin((x * 0.38 + y * 0.55) + n * 2.4) * 0.5 + 0.5;
            rgb = mixRgb(shadeRgb(sandBase, 0.86), shadeRgb(sandBase, 1.12), ripple * 0.65 + fine * 0.35);
            h = 0.35 + ripple * 0.38 + fine * 0.08;
            if (fine > 0.91) {
              rgb = mixRgb(rgb, accentC, 0.38);
              h += 0.12;
            }
          } else if (kind === 'cobble') {
            const stoneBase = mixRgb(cliffC, [158, 162, 174], 0.48);
            const cellX = x % 8;
            const cellY = y % 8;
            const rowShift = ((y >> 3) & 1) * 4;
            const sx = (x + rowShift) % 8;
            const edgeDist = Math.min(sx, 7 - sx, cellY, 7 - cellY);
            if (edgeDist === 0) {
              rgb = shadeRgb(stoneBase, 0.48);
              h = 0.12;
            } else {
              const stoneJitter = valueNoise2D(tileSeed + 31, ((x + rowShift) >> 3), y >> 3, 8);
              let stone = mixRgb(shadeRgb(stoneBase, 0.85), shadeRgb(stoneBase, 1.14), stoneJitter * 0.6 + fine * 0.4);
              if (sx === 1 || cellY === 1) stone = shadeRgb(stone, 1.18, 10);
              if (sx === 6 || cellY === 6) stone = shadeRgb(stone, 0.82);
              rgb = stone;
              h = 0.65 + (edgeDist >= 2 ? 0.2 : 0.08) + fine * 0.08;
            }
          } else if (kind === 'cliff') {
            const strata = Math.sin(y * 0.48 + n * 3.1) * 0.5 + 0.5;
            const fissure = Math.abs(Math.sin(x * 0.35 + n * 2.2));
            rgb = mixRgb(shadeRgb(cliffC, 0.68), shadeRgb(cliffC, 1.16), strata * 0.7 + fine * 0.3);
            h = 0.4 + strata * 0.42;
            if (fissure < 0.12) {
              rgb = shadeRgb(cliffC, 0.45);
              h = 0.14;
            }
            if (y < 4) {
              rgb = mixRgb(rgb, grassC, (4 - y) * 0.18);
              h += 0.15;
            } else if (y > 27) {
              rgb = shadeRgb(rgb, 0.72);
            }
          } else if (kind === 'shallow-water') {
            const c1 = Math.sin(x * 0.39 + y * 0.2 + n * 3.0);
            const c2 = Math.cos(x * 0.2 - y * 0.39 + fine * 2.5);
            const caustic = Math.pow(Math.max(0, 1 - Math.abs(c1 + c2)), 2.2);
            rgb = mixRgb(shallowC, shadeRgb(shallowC, 1.24, 18), caustic * 0.75 + n * 0.25);
            h = 0.35 + caustic * 0.4 + n * 0.12;
            if (biome.volcanic && caustic > 0.62) {
              rgb = mixRgb(shallowC, [255, 224, 110], caustic);
              emit = mixRgb(shallowC, [255, 190, 75], caustic);
            } else if (caustic > 0.78 && fine > 0.62) {
              emit = shadeRgb(accentC, biome.glow * 0.65);
            }
          } else if (kind === 'deep-water') {
            const wave = Math.sin(x * 0.196 + y * 0.39 + n * 2.0) * 0.5 + 0.5;
            const glint = Math.pow(wave, 3.2);
            rgb = mixRgb(shadeRgb(deepC, 0.8), shallowC, glint * 0.35 + n * 0.2);
            h = 0.28 + wave * 0.35;
            if (biome.volcanic && glint > 0.55) {
              rgb = mixRgb(deepC, [255, 120, 42], glint);
              emit = mixRgb([180, 40, 15], [255, 160, 60], glint);
            } else if (glint > 0.78 && fine > 0.66) {
              emit = shadeRgb(accentC, biome.glow * 0.55);
            }
          } else if (kind === 'bridge') {
            const plank = y % 6 === 0;
            const grain = valueNoise2D(tileSeed + 19, x * 0.15, y * 0.95, 32);
            const wood = mixRgb([124, 84, 52], [166, 116, 74], grain);
            if (x <= 1 || x >= 30) {
              rgb = shadeRgb(wood, 0.68);
              h = 0.85;
            } else if (plank) {
              rgb = [72, 46, 28];
              h = 0.2;
            } else {
              rgb = wood;
              h = 0.62 + grain * 0.15;
              if ((x === 4 || x === 27) && (y % 6 === 3)) {
                rgb = [212, 186, 118];
                h = 0.88;
              }
            }
          } else if (kind === 'plaza') {
            const stone = mixRgb(cliffC, [196, 202, 222], 0.62);
            const dx = Math.abs(x - 15.5);
            const dy = Math.abs(y - 15.5);
            const border = x === 0 || y === 0 || x === 31 || y === 31;
            const inlayRing = Math.abs(Math.max(dx, dy) - 11.5) < 1.1;
            const starCross = (dx < 2.2 && dy < 8.5) || (dy < 2.2 && dx < 8.5) || (dx + dy < 5.5);
            if (border) {
              rgb = shadeRgb(stone, 0.62);
              h = 0.28;
            } else if (starCross) {
              rgb = mixRgb(stone, accentC, 0.82);
              h = 0.82;
              emit = shadeRgb(accentC, 0.42 + biome.glow * 0.32);
            } else if (inlayRing) {
              rgb = mixRgb(stone, accentC, 0.45);
              h = 0.72;
              emit = shadeRgb(accentC, 0.25);
            } else {
              rgb = mixRgb(shadeRgb(stone, 0.9), shadeRgb(stone, 1.08), fine * 0.6 + n * 0.4);
              h = 0.56 + fine * 0.08;
            }
          } else if (kind === 'flowerbed') {
            rgb = mixRgb(shadeRgb(groundC, 0.85), grassC, n * 0.7 + fine * 0.3);
            h = 0.45 + n * 0.25;
          } else if (kind === 'shore-edge') {
            const foamCurve = 16 + Math.sin(x * 0.39) * 2.4 + (n - 0.5) * 3.0;
            if (y < foamCurve - 2) {
              const sandBase = mixRgb(groundC, [218, 192, 138], biome.id === 'frost-glacier' ? 0.25 : 0.62);
              rgb = shadeRgb(sandBase, y > foamCurve - 5 ? 0.84 : 1.02);
              h = 0.58 - (y / 32) * 0.15;
            } else if (y < foamCurve + 1.4) {
              rgb = mixRgb(shallowC, [238, 250, 255], 0.82);
              h = 0.68;
              emit = shadeRgb([200, 240, 255], 0.32);
            } else {
              rgb = mixRgb(shallowC, shadeRgb(shallowC, 1.15), fine * 0.4);
              h = 0.32 + fine * 0.1;
            }
          } else if (kind === 'cliff-top') {
            const rim = y >= 27;
            if (rim) {
              rgb = mixRgb(cliffC, shadeRgb(groundC, 1.15), 0.38);
              h = 0.84 - (y - 27) * 0.14;
            } else {
              rgb = mixRgb(grassC, shadeRgb(groundC, 1.14), n * 0.75 + fine * 0.25);
              h = 0.7 + n * 0.16;
            }
          }

          albedo.setPixel(ox + x, oy + y, rgb[0], rgb[1], rgb[2], 255);
          hf[y * tileSize + x] = h;
          if (emit) {
            emissive.setPixel(ox + x, oy + y, emit[0], emit[1], emit[2], 220);
          }
        }
      }

      // Layer crisp tall-grass blades or flowerbed blossoms after base fill
      if (kind === 'tall-grass') {
        const bladeCount = 26;
        for (let b = 0; b < bladeCount; b++) {
          const bx = Math.floor(rng() * 28) + 2;
          const by = Math.floor(rng() * 22) + 8;
          const bh = Math.floor(rng() * 6) + 5;
          const lean = rng() > 0.5 ? 1 : -1;
          for (let s = 0; s < bh; s++) {
            const px = clamp(bx + Math.round((s / bh) * lean * 2), 0, 31);
            const py = clamp(by - s, 0, 31);
            const t = s / bh;
            const c = t > 0.75
              ? mixRgb(grassC, accentC, 0.45)
              : t > 0.35
                ? shadeRgb(grassC, 1.18)
                : shadeRgb(grassC, 0.75);
            albedo.setPixel(ox + px, oy + py, c[0], c[1], c[2], 255);
            hf[py * tileSize + px] = clamp(0.55 + t * 0.4, 0, 1);
            if (t > 0.82 && biome.glow > 0.75 && b % 4 === 0) {
              const gCol = shadeRgb(accentC, 0.7);
              emissive.setPixel(ox + px, oy + py, gCol[0], gCol[1], gCol[2], 200);
            }
          }
        }
      } else if (kind === 'flowerbed') {
        const clusters = 7;
        for (let f = 0; f < clusters; f++) {
          const fx = Math.floor(rng() * 24) + 4;
          const fy = Math.floor(rng() * 24) + 4;
          const petal = f % 2 === 0 ? accentC : mixRgb(accentC, [255, 255, 255], 0.5);
          const center = [255, 232, 128];
          const offsets = [[0, -2], [0, 2], [-2, 0], [2, 0], [-1, -1], [1, 1]];
          for (const [dx, dy] of offsets) {
            const px = clamp(fx + dx, 0, 31);
            const py = clamp(fy + dy, 0, 31);
            albedo.setPixel(ox + px, oy + py, petal[0], petal[1], petal[2], 255);
            hf[py * tileSize + px] = 0.82;
          }
          albedo.setPixel(ox + fx, oy + fy, center[0], center[1], center[2], 255);
          hf[fy * tileSize + fx] = 0.92;
          if (biome.glow > 0.6) {
            const e = shadeRgb(accentC, biome.glow * 0.72);
            emissive.setPixel(ox + fx, oy + fy, e[0], e[1], e[2], 210);
          }
        }
      } else if (kind === 'ground' || kind === 'cliff' || kind === 'cliff-top') {
        // Subtle bioluminescent crystal/spore specks in high-glow biomes
        if (biome.glow >= 0.75) {
          for (let s = 0; s < 4; s++) {
            const sx = Math.floor(rng() * 28) + 2;
            const sy = Math.floor(rng() * 28) + 2;
            const e = shadeRgb(accentC, 0.78);
            albedo.setPixel(ox + sx, oy + sy, accentC[0], accentC[1], accentC[2], 255);
            emissive.setPixel(ox + sx, oy + sy, e[0], e[1], e[2], 220);
            hf[sy * tileSize + sx] = 0.9;
          }
        }
      }

      // Compute Sobel tangent-space normal map for this tile
      const strength = kind === 'shallow-water' || kind === 'deep-water' ? 1.8 : 3.2;
      const sampleH = (px, py) => {
        const sx = wrap ? ((px % tileSize) + tileSize) % tileSize : clamp(px, 0, tileSize - 1);
        const sy = wrap ? ((py % tileSize) + tileSize) % tileSize : clamp(py, 0, tileSize - 1);
        return hf[sy * tileSize + sx];
      };
      for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
          const tl = sampleH(x - 1, y - 1);
          const tc = sampleH(x, y - 1);
          const tr = sampleH(x + 1, y - 1);
          const ml = sampleH(x - 1, y);
          const mr = sampleH(x + 1, y);
          const bl = sampleH(x - 1, y + 1);
          const bc = sampleH(x, y + 1);
          const br = sampleH(x + 1, y + 1);
          const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
          const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
          const nx = -gx * strength;
          const ny = -gy * strength;
          const nz = 1.0;
          const invLen = 1 / Math.hypot(nx, ny, nz);
          const nr = Math.round(((nx * invLen) * 0.5 + 0.5) * 255);
          const ng = Math.round(((ny * invLen) * 0.5 + 0.5) * 255);
          const nb = Math.round(((nz * invLen) * 0.5 + 0.5) * 255);
          normal.setPixel(ox + x, oy + y, nr, ng, nb, 255);
        }
      }

      const id = `${biome.id}:${kind}`;
      regions[id] = { id, x: ox, y: oy, w: tileSize, h: tileSize };
    }
  }

  return { albedo, normal, emissive, regions, width, height, tileSize };
}

// -----------------------------------------------------------------------------
// 2. Props Atlas Baker (384x192, 6x3 @ 64x64)
// -----------------------------------------------------------------------------
function drawPropSprite(canvas, ox, oy, kind) {
  const s = 64;
  const cx = ox + 32;
  const rng = mulberry32(hashSeed(SEED, `prop:${kind}`));

  // Subtle grounded ambient shadow on all props
  canvas.fillEllipse(cx, oy + 56, 20, 5, [12, 16, 32], 95);

  switch (kind) {
    case 'cottage': {
      // Timber/cream walls
      canvas.fillRect(ox + 12, oy + 28, 40, 26, [218, 204, 182]);
      canvas.fillRect(ox + 12, oy + 28, 4, 26, [122, 84, 54]);
      canvas.fillRect(ox + 48, oy + 28, 4, 26, [122, 84, 54]);
      canvas.fillRect(ox + 12, oy + 50, 40, 4, [110, 96, 84]);
      // Chimney
      canvas.fillRect(ox + 42, oy + 8, 7, 16, [138, 90, 74]);
      // Pitched navy-slate roof with warm trim
      for (let r = 0; r < 18; r++) {
        const w = 12 + r * 2.4;
        const c = r % 3 === 0 ? [58, 72, 122] : [74, 92, 152];
        canvas.fillRect(Math.round(cx - w / 2), oy + 12 + r, Math.round(w), 1, c);
      }
      canvas.fillRect(ox + 9, oy + 29, 46, 2, [235, 198, 120]);
      // Door + warm lantern windows
      canvas.fillRect(ox + 27, oy + 38, 10, 16, [112, 68, 42]);
      canvas.fillRect(ox + 34, oy + 45, 2, 2, [255, 212, 110]);
      canvas.fillRect(ox + 17, oy + 35, 7, 8, [255, 224, 128]);
      canvas.fillRect(ox + 40, oy + 35, 7, 8, [255, 224, 128]);
      break;
    }
    case 'shrine': {
      // Pedestal
      canvas.fillRect(ox + 14, oy + 46, 36, 9, [108, 114, 140]);
      canvas.fillRect(ox + 18, oy + 40, 28, 7, [142, 150, 180]);
      // Torii / astral pillars
      canvas.fillRect(ox + 17, oy + 16, 6, 25, [126, 134, 166]);
      canvas.fillRect(ox + 41, oy + 16, 6, 25, [126, 134, 166]);
      canvas.fillRect(ox + 12, oy + 12, 40, 5, [168, 178, 212]);
      canvas.fillRect(ox + 15, oy + 19, 34, 3, [94, 102, 134]);
      // Floating crystal core
      for (let dy = -8; dy <= 8; dy++) {
        const hw = Math.max(1, 6 - Math.abs(dy) * 0.7);
        const col = dy < 0 ? [150, 240, 255] : [92, 178, 255];
        canvas.fillRect(Math.round(cx - hw), oy + 31 + dy, Math.round(hw * 2), 1, col);
      }
      canvas.fillCircle(cx, oy + 31, 2, [255, 255, 255]);
      break;
    }
    case 'chest': {
      canvas.fillRect(ox + 16, oy + 32, 32, 20, [138, 82, 42]);
      canvas.fillRect(ox + 15, oy + 24, 34, 10, [168, 104, 52]);
      // Gold trim & clasp
      canvas.fillRect(ox + 15, oy + 32, 34, 3, [238, 194, 88]);
      canvas.fillRect(ox + 19, oy + 24, 3, 28, [238, 194, 88]);
      canvas.fillRect(ox + 42, oy + 24, 3, 28, [238, 194, 88]);
      canvas.fillRect(ox + 29, oy + 30, 6, 8, [255, 232, 136]);
      canvas.fillRect(ox + 31, oy + 33, 2, 3, [80, 48, 24]);
      break;
    }
    case 'fountain': {
      canvas.fillEllipse(cx, oy + 46, 22, 9, [168, 178, 202]);
      canvas.fillEllipse(cx, oy + 44, 18, 6, [64, 188, 242]);
      canvas.fillRect(ox + 28, oy + 24, 8, 20, [190, 200, 224]);
      canvas.fillEllipse(cx, oy + 26, 11, 4, [182, 194, 218]);
      canvas.fillEllipse(cx, oy + 25, 8, 2.5, [118, 228, 255]);
      // Starlight water plume
      canvas.fillRect(ox + 30, oy + 14, 4, 12, [196, 246, 255]);
      canvas.fillCircle(cx - 6, oy + 20, 2, [196, 246, 255], 190);
      canvas.fillCircle(cx + 6, oy + 20, 2, [196, 246, 255], 190);
      break;
    }
    case 'signpost': {
      canvas.fillRect(ox + 29, oy + 26, 6, 29, [118, 76, 44]);
      canvas.fillRect(ox + 14, oy + 18, 34, 14, [176, 124, 72]);
      canvas.fillRect(ox + 16, oy + 20, 30, 10, [202, 152, 92]);
      canvas.fillRect(ox + 20, oy + 22, 22, 2, [96, 64, 36]);
      canvas.fillRect(ox + 20, oy + 26, 16, 2, [96, 64, 36]);
      // Little lantern hook
      canvas.fillRect(ox + 44, oy + 22, 4, 5, [255, 222, 116]);
      break;
    }
    case 'starfall': {
      // Crater rim
      canvas.fillEllipse(cx, oy + 44, 20, 8, [84, 78, 112]);
      canvas.fillEllipse(cx, oy + 43, 14, 5, [48, 42, 74]);
      // Radiant star shard
      canvas.drawLine(cx, oy + 12, cx, oy + 46, [255, 240, 138]);
      canvas.drawLine(cx - 12, oy + 30, cx + 12, oy + 30, [255, 240, 138]);
      for (let d = -10; d <= 10; d++) {
        const hw = Math.max(1, 7 - Math.abs(d) * 0.65);
        canvas.fillRect(Math.round(cx - hw), oy + 30 + d, Math.round(hw * 2), 1, [255, 218, 92]);
      }
      canvas.fillCircle(cx, oy + 30, 3, [255, 255, 232]);
      break;
    }
    case 'studio': {
      canvas.fillRect(ox + 11, oy + 26, 42, 28, [238, 228, 246]);
      // Striped rose-indigo awning
      for (let x = 10; x < 54; x++) {
        const stripe = ((x >> 2) & 1) === 0 ? [226, 98, 168] : [248, 238, 255];
        canvas.fillRect(ox + x, oy + 20, 1, 9, stripe);
      }
      canvas.fillRect(ox + 15, oy + 12, 34, 8, [74, 58, 126]);
      canvas.fillRect(ox + 16, oy + 34, 14, 12, [148, 220, 255]);
      canvas.fillRect(ox + 35, oy + 35, 11, 19, [132, 82, 166]);
      canvas.fillCircle(cx, oy + 16, 3, [255, 196, 232]);
      break;
    }
    case 'observatory': {
      canvas.fillRect(ox + 14, oy + 32, 36, 22, [186, 198, 224]);
      // Celestial dome
      canvas.fillCircle(cx, oy + 28, 18, [68, 92, 168]);
      canvas.fillRect(ox + 14, oy + 28, 36, 6, [54, 72, 138]);
      canvas.fillRect(ox + 12, oy + 32, 40, 3, [234, 198, 108]);
      // Telescope barrel
      canvas.drawLine(cx + 2, oy + 20, ox + 52, oy + 10, [218, 178, 88]);
      canvas.drawLine(cx + 2, oy + 21, ox + 52, oy + 11, [248, 218, 128]);
      // Arch door
      canvas.fillRect(ox + 26, oy + 40, 12, 14, [42, 48, 86]);
      canvas.fillCircle(cx, oy + 40, 6, [42, 48, 86]);
      break;
    }
    case 'crystal': {
      const shards = [
        [cx - 8, oy + 48, 6, 22, [82, 198, 255]],
        [cx + 6, oy + 48, 6, 20, [118, 232, 255]],
        [cx, oy + 50, 8, 30, [168, 246, 255]],
      ];
      for (const [sx, sy, w, h, col] of shards) {
        for (let r = 0; r < h; r++) {
          const curW = r < 8 ? Math.max(1, (r / 8) * w) : w;
          const c = r % 4 === 0 ? shadeRgb(col, 1.15, 20) : col;
          canvas.fillRect(Math.round(sx - curW / 2), sy - h + r, Math.round(curW), 1, c);
        }
      }
      break;
    }
    case 'ember-vent': {
      canvas.fillEllipse(cx, oy + 46, 19, 10, [58, 36, 34]);
      canvas.fillEllipse(cx, oy + 40, 13, 7, [78, 46, 40]);
      canvas.fillEllipse(cx, oy + 38, 7, 3, [255, 118, 42]);
      canvas.fillEllipse(cx, oy + 38, 4, 1.5, [255, 224, 112]);
      for (let i = 0; i < 6; i++) {
        canvas.fillCircle(cx - 6 + Math.round(rng() * 12), oy + 18 + i * 3, 1.4, [255, 180, 72]);
      }
      break;
    }
    case 'spore-lantern': {
      canvas.fillRect(ox + 28, oy + 32, 8, 22, [212, 198, 236]);
      canvas.fillEllipse(cx, oy + 26, 18, 10, [142, 68, 212]);
      canvas.fillEllipse(cx, oy + 29, 14, 4, [214, 142, 255]);
      canvas.fillCircle(ox + 23, oy + 23, 3, [238, 188, 255]);
      canvas.fillCircle(ox + 38, oy + 22, 2.5, [238, 188, 255]);
      canvas.fillCircle(ox + 31, oy + 19, 2, [255, 232, 255]);
      break;
    }
    case 'coral': {
      const branches = [
        [cx, oy + 52, cx - 14, oy + 24, [255, 118, 168]],
        [cx, oy + 52, cx + 14, oy + 22, [96, 224, 240]],
        [cx, oy + 52, cx, oy + 16, [255, 152, 194]],
      ];
      for (const [x0, y0, x1, y1, col] of branches) {
        for (let k = -2; k <= 2; k++) {
          canvas.drawLine(x0 + k, y0, x1 + k, y1, col);
        }
        canvas.fillCircle(x1, y1, 4, shadeRgb(col, 1.15, 15));
      }
      break;
    }
    case 'ruin-pillar': {
      canvas.fillRect(ox + 22, oy + 14, 20, 40, [118, 112, 148]);
      canvas.fillRect(ox + 20, oy + 12, 24, 5, [148, 142, 182]);
      canvas.fillRect(ox + 19, oy + 49, 26, 6, [92, 86, 118]);
      // Glowing rune sigils
      canvas.fillRect(ox + 29, oy + 22, 6, 2, [255, 138, 212]);
      canvas.fillRect(ox + 31, oy + 24, 2, 8, [255, 138, 212]);
      canvas.fillRect(ox + 28, oy + 36, 8, 2, [138, 224, 255]);
      break;
    }
    case 'bamboo': {
      const stalks = [ox + 22, ox + 31, ox + 40];
      for (let i = 0; i < stalks.length; i++) {
        const sx = stalks[i];
        for (let y = 14 + i * 3; y < 54; y++) {
          const seg = y % 8 === 0;
          const col = seg ? [42, 84, 46] : [86, 162, 82];
          canvas.fillRect(sx, oy + y, 4, 1, col);
        }
        canvas.fillEllipse(sx + 6, oy + 18 + i * 4, 6, 2, [108, 194, 96]);
        canvas.fillEllipse(sx - 4, oy + 24 + i * 3, 5, 2, [96, 178, 86]);
      }
      break;
    }
    case 'pine': {
      canvas.fillRect(ox + 28, oy + 42, 8, 13, [104, 68, 44]);
      const tiers = [
        [oy + 42, 20, [34, 88, 62]],
        [oy + 32, 16, [44, 114, 78]],
        [oy + 22, 11, [62, 142, 98]],
      ];
      for (const [baseY, halfW, col] of tiers) {
        for (let r = 0; r < 14; r++) {
          const w = Math.max(2, halfW * (1 - r / 14) * 2);
          canvas.fillRect(Math.round(cx - w / 2), baseY - r, Math.round(w), 1, col);
        }
      }
      break;
    }
    case 'blossom-tree': {
      canvas.fillRect(ox + 27, oy + 34, 10, 21, [114, 74, 58]);
      canvas.fillCircle(cx - 10, oy + 26, 11, [242, 142, 198]);
      canvas.fillCircle(cx + 10, oy + 26, 11, [242, 142, 198]);
      canvas.fillCircle(cx, oy + 18, 13, [255, 178, 222]);
      canvas.fillCircle(cx - 4, oy + 15, 5, [255, 224, 242]);
      break;
    }
    case 'lantern-post': {
      canvas.fillRect(ox + 30, oy + 18, 4, 37, [64, 72, 96]);
      canvas.fillRect(ox + 25, oy + 51, 14, 4, [52, 58, 80]);
      canvas.fillRect(ox + 22, oy + 14, 14, 3, [78, 88, 116]);
      canvas.fillRect(ox + 21, oy + 17, 8, 10, [255, 224, 124]);
      canvas.fillRect(ox + 23, oy + 19, 4, 6, [255, 250, 210]);
      break;
    }
    case 'gear-spire': {
      canvas.fillRect(ox + 26, oy + 16, 12, 38, [122, 142, 168]);
      canvas.fillCircle(cx, oy + 28, 11, [188, 152, 84]);
      canvas.fillCircle(cx, oy + 28, 6, [72, 86, 108]);
      canvas.fillCircle(cx, oy + 28, 3, [126, 232, 255]);
      // Gear teeth
      for (let a = 0; a < 8; a++) {
        const rad = (a * Math.PI) / 4;
        canvas.fillRect(Math.round(cx + Math.cos(rad) * 11 - 1.5), Math.round(oy + 28 + Math.sin(rad) * 11 - 1.5), 3, 3, [224, 186, 106]);
      }
      break;
    }
    default:
      break;
  }
  void s;
}

function bakePropsAtlas() {
  const tileSize = 64;
  const cols = 6;
  const rows = 3;
  const width = cols * tileSize; // 384
  const height = rows * tileSize; // 192
  const canvas = new PixelCanvas(width, height);
  const regions = {};

  PROP_NAMES.forEach((name, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const ox = col * tileSize;
    const oy = row * tileSize;
    drawPropSprite(canvas, ox, oy, name);
    regions[name] = { id: name, x: ox, y: oy, w: tileSize, h: tileSize };
  });

  return { canvas, regions, width, height, tileSize };
}

// -----------------------------------------------------------------------------
// 3. Characters Atlas Baker (256x256, 8x8 @ 32x32)
// -----------------------------------------------------------------------------
const CHARACTER_ROLES = [
  {
    id: 'trainer',
    hair: [54, 42, 88],
    hat: [232, 192, 92],
    coat: [46, 88, 164],
    trim: [255, 216, 118],
    skin: [246, 212, 184],
    boots: [62, 46, 42],
  },
  {
    id: 'follower',
    isCreature: true,
    fur: [242, 206, 138],
    mane: [255, 242, 204],
    earTip: [88, 64, 46],
    accent: [122, 224, 255],
  },
  {
    id: 'npc',
    hair: [132, 74, 52],
    hat: [74, 152, 128],
    coat: [68, 136, 118],
    trim: [218, 242, 192],
    skin: [238, 198, 168],
    boots: [74, 58, 48],
  },
  {
    id: 'rival',
    hair: [208, 218, 240],
    hat: [108, 42, 118],
    coat: [134, 48, 128],
    trim: [255, 132, 208],
    skin: [242, 208, 188],
    boots: [42, 34, 58],
  },
];

const CHAR_DIRS = ['down', 'up', 'left', 'right'];
const CHAR_POSES = [
  ['0', '1'],
  ['idle', '2'],
];

function drawHumanoidFrame(canvas, ox, oy, spec, dir, pose) {
  const step = pose === '0' ? -1 : pose === '1' ? 1 : pose === '2' ? 0 : 0;
  const bob = pose === '0' || pose === '1' ? -1 : 0;

  // Shadow
  canvas.fillEllipse(ox + 16, oy + 28, 7, 2.5, [12, 16, 30], 95);

  // Legs/boots
  const leftLegY = oy + 22 + (step < 0 ? -1 : 0);
  const rightLegY = oy + 22 + (step > 0 ? -1 : 0);
  if (dir === 'left' || dir === 'right') {
    canvas.fillRect(ox + 13 + step, leftLegY, 4, 6, spec.boots);
    canvas.fillRect(ox + 15 - step, rightLegY, 4, 6, shadeRgb(spec.boots, 0.8));
  } else {
    canvas.fillRect(ox + 11, leftLegY, 4, 6, spec.boots);
    canvas.fillRect(ox + 17, rightLegY, 4, 6, spec.boots);
  }

  // Coat / torso
  canvas.fillRect(ox + 10, oy + 14 + bob, 12, 9, spec.coat);
  canvas.fillRect(ox + 11, oy + 14 + bob, 10, 2, spec.trim);
  // Arms
  canvas.fillRect(ox + 8, oy + 15 + bob + (step > 0 ? 1 : 0), 2, 6, shadeRgb(spec.coat, 0.88));
  canvas.fillRect(ox + 22, oy + 15 + bob + (step < 0 ? 1 : 0), 2, 6, shadeRgb(spec.coat, 0.88));

  // Head
  canvas.fillCircle(ox + 16, oy + 10 + bob, 5.5, spec.skin);
  // Hair & Beret/Cap
  if (dir === 'up') {
    canvas.fillCircle(ox + 16, oy + 9 + bob, 5.8, spec.hair);
  } else {
    canvas.fillRect(ox + 11, oy + 5 + bob, 10, 3, spec.hair);
  }
  canvas.fillEllipse(ox + 16, oy + 5 + bob, 6.2, 2.5, spec.hat);
  canvas.fillRect(ox + 15, oy + 3 + bob, 2, 2, spec.trim);

  // Eyes
  if (dir === 'down') {
    canvas.setPixel(ox + 14, oy + 10 + bob, 28, 32, 56);
    canvas.setPixel(ox + 18, oy + 10 + bob, 28, 32, 56);
  } else if (dir === 'left') {
    canvas.setPixel(ox + 13, oy + 10 + bob, 28, 32, 56);
  } else if (dir === 'right') {
    canvas.setPixel(ox + 19, oy + 10 + bob, 28, 32, 56);
  }
}

function drawFollowerFrame(canvas, ox, oy, spec, dir, pose) {
  const step = pose === '0' ? -1 : pose === '1' ? 1 : 0;
  const bob = pose === '0' || pose === '1' ? -1 : 0;

  canvas.fillEllipse(ox + 16, oy + 27, 7, 2.5, [12, 16, 30], 95);
  // Tail
  const tailX = dir === 'left' ? ox + 22 : dir === 'right' ? ox + 8 : ox + 16;
  canvas.fillCircle(tailX, oy + 18 + bob, 4, spec.mane);
  // Body
  canvas.fillEllipse(ox + 16, oy + 20 + bob, 6, 4.5, spec.fur);
  canvas.fillEllipse(ox + 16, oy + 18 + bob, 4.5, 3, spec.mane);
  // Paws
  canvas.fillRect(ox + 11, oy + 23 + (step < 0 ? -1 : 0), 3, 4, spec.earTip);
  canvas.fillRect(ox + 18, oy + 23 + (step > 0 ? -1 : 0), 3, 4, spec.earTip);
  // Head & ears
  canvas.fillCircle(ox + 16, oy + 13 + bob, 5, spec.fur);
  canvas.fillRect(ox + 11, oy + 6 + bob, 3, 5, spec.earTip);
  canvas.fillRect(ox + 18, oy + 6 + bob, 3, 5, spec.earTip);
  canvas.setPixel(ox + 12, oy + 6 + bob, spec.accent[0], spec.accent[1], spec.accent[2]);
  canvas.setPixel(ox + 19, oy + 6 + bob, spec.accent[0], spec.accent[1], spec.accent[2]);
  if (dir !== 'up') {
    canvas.setPixel(ox + 14, oy + 13 + bob, 28, 32, 56);
    canvas.setPixel(ox + 18, oy + 13 + bob, 28, 32, 56);
  }
}

function bakeCharactersAtlas() {
  const tileSize = 32;
  const cols = 8;
  const rows = 8;
  const width = cols * tileSize; // 256
  const height = rows * tileSize; // 256
  const canvas = new PixelCanvas(width, height);
  const regions = {};

  CHARACTER_ROLES.forEach((role, roleIdx) => {
    for (let pRow = 0; pRow < 2; pRow++) {
      const row = roleIdx * 2 + pRow;
      for (let dIdx = 0; dIdx < CHAR_DIRS.length; dIdx++) {
        const dir = CHAR_DIRS[dIdx];
        for (let fIdx = 0; fIdx < 2; fIdx++) {
          const col = dIdx * 2 + fIdx;
          const pose = CHAR_POSES[pRow][fIdx];
          const ox = col * tileSize;
          const oy = row * tileSize;
          if (role.isCreature) {
            drawFollowerFrame(canvas, ox, oy, role, dir, pose);
          } else {
            drawHumanoidFrame(canvas, ox, oy, role, dir, pose);
          }
          const id = `${role.id}-${dir}-${pose}`;
          regions[id] = { id, x: ox, y: oy, w: tileSize, h: tileSize };
        }
      }
    }
  });

  return { canvas, regions, width, height, tileSize };
}

// -----------------------------------------------------------------------------
// 4. SVG Sprite Pack (72 multi-stop <symbol> icons, ZERO raw Unicode emojis)
// -----------------------------------------------------------------------------
function buildCoreSymbols() {
  return [
    `<symbol id="icon-pokeball" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="url(#g-ball-bot)" stroke="#1b2447" stroke-width="2"/><path d="M3 16a13 13 0 0 1 26 0z" fill="url(#g-ball-red)"/><line x1="3" y1="16" x2="29" y2="16" stroke="#1b2447" stroke-width="2.4"/><circle cx="16" cy="16" r="4.2" fill="#f8fbff" stroke="#1b2447" stroke-width="2"/><circle cx="16" cy="16" r="1.8" fill="#ffe082"/></symbol>`,
    `<symbol id="icon-starball" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="url(#g-star-bot)" stroke="#16214d" stroke-width="2"/><path d="M3 16a13 13 0 0 1 26 0z" fill="url(#g-star-top)"/><line x1="3" y1="16" x2="29" y2="16" stroke="#ffd54f" stroke-width="2.2"/><polygon points="16,5.5 17.8,9.8 22.4,10.2 18.8,13.2 19.9,17.7 16,15.3 12.1,17.7 13.2,13.2 9.6,10.2 14.2,9.8" fill="#fff59d" opacity="0.9"/><circle cx="16" cy="16" r="4.2" fill="#fffde7" stroke="#16214d" stroke-width="2"/><circle cx="16" cy="16" r="2" fill="#7ce8ff"/></symbol>`,
    `<symbol id="icon-potion" viewBox="0 0 32 32"><rect x="13" y="4" width="6" height="5" rx="1.2" fill="#5e6b9c" stroke="#182042" stroke-width="1.5"/><path d="M12 9h8l5 7.5A9 9 0 0 1 23 28H9a9 9 0 0 1-2-11.5z" fill="url(#g-potion)" stroke="#182042" stroke-width="1.8"/><path d="M10 18.5c3-1.5 9 1.5 12 0v6.5a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z" fill="#b9f6ca" opacity="0.75"/></symbol>`,
    `<symbol id="icon-super-potion" viewBox="0 0 32 32"><rect x="12.5" y="3.5" width="7" height="5" rx="1.2" fill="#ffd54f" stroke="#182042" stroke-width="1.5"/><path d="M11.5 8.5h9l5.5 8A9.5 9.5 0 0 1 23.5 28.5h-15A9.5 9.5 0 0 1 6 16.5z" fill="url(#g-super-potion)" stroke="#182042" stroke-width="1.8"/><polygon points="16,13 17.6,17 21.8,17.3 18.5,20 19.6,24.2 16,21.9 12.4,24.2 13.5,20 10.2,17.3 14.4,17" fill="#fff9c4"/></symbol>`,
    `<symbol id="icon-star-shard" viewBox="0 0 32 32"><polygon points="16,2 22,12 30,16 22,20 16,30 10,20 2,16 10,12" fill="url(#g-gold)" stroke="#4a3100" stroke-width="1.5"/><polygon points="16,7 19.5,13.5 25,16 19.5,18.5 16,25 12.5,18.5 7,16 12.5,13.5" fill="#fffde7" opacity="0.85"/></symbol>`,
    `<symbol id="icon-composure" viewBox="0 0 32 32"><polygon points="16,3 27,9.5 27,22.5 16,29 5,22.5 5,9.5" fill="url(#g-prism)" stroke="#e0f7fa" stroke-width="1.8"/><polygon points="16,7.5 23,11.6 23,20.4 16,24.5 9,20.4 9,11.6" fill="none" stroke="#ffffff" stroke-width="1.3" opacity="0.85"/><circle cx="16" cy="16" r="3" fill="#ffffff"/></symbol>`,
    `<symbol id="icon-briefing" viewBox="0 0 32 32"><rect x="6" y="4" width="20" height="24" rx="3" fill="url(#g-astral)" stroke="#a8c7ff" stroke-width="1.6"/><rect x="11" y="2.5" width="10" height="4" rx="1.5" fill="#ffd54f"/><line x1="10" y1="12" x2="22" y2="12" stroke="#9be8ff" stroke-width="2" stroke-linecap="round"/><line x1="10" y1="17" x2="22" y2="17" stroke="#d4e8ff" stroke-width="2" stroke-linecap="round"/><line x1="10" y1="22" x2="17" y2="22" stroke="#ffd54f" stroke-width="2" stroke-linecap="round"/></symbol>`,
    `<symbol id="icon-waypoint" viewBox="0 0 32 32"><path d="M16 3a9.5 9.5 0 0 1 9.5 9.5C25.5 19.5 16 29 16 29S6.5 19.5 6.5 12.5A9.5 9.5 0 0 1 16 3z" fill="url(#g-gold)" stroke="#231942" stroke-width="1.8"/><circle cx="16" cy="12.5" r="3.8" fill="#182042"/><circle cx="16" cy="12.5" r="1.8" fill="#80f0ff"/></symbol>`,
    `<symbol id="icon-shrine" viewBox="0 0 32 32"><path d="M5 10h22v3H5zM8 13h3v15H8zM21 13h3v15h-3zM6 26h20v3H6z" fill="url(#g-silver)"/><polygon points="16,5 20,10 12,10" fill="#ffd54f"/><circle cx="16" cy="19.5" r="3.4" fill="url(#g-prism)"/></symbol>`,
    `<symbol id="icon-chest" viewBox="0 0 32 32"><rect x="4" y="10" width="24" height="17" rx="2.5" fill="url(#g-wood)" stroke="#3d240c" stroke-width="1.6"/><line x1="4" y1="16" x2="28" y2="16" stroke="#ffd54f" stroke-width="2.4"/><rect x="13.5" y="14" width="5" height="6" rx="1" fill="#ffe082" stroke="#3d240c" stroke-width="1.2"/></symbol>`,
    `<symbol id="icon-fountain" viewBox="0 0 32 32"><ellipse cx="16" cy="24" rx="11" ry="4" fill="url(#g-silver)"/><ellipse cx="16" cy="23" rx="8.5" ry="2.5" fill="#4fc3f7"/><rect x="13.5" y="12" width="5" height="11" fill="#cfd8dc"/><path d="M16 12c0-5-5-6-6-2M16 12c0-5 5-6 6-2" fill="none" stroke="#80f0ff" stroke-width="2" stroke-linecap="round"/></symbol>`,
    `<symbol id="icon-signpost" viewBox="0 0 32 32"><rect x="14.5" y="7" width="3" height="22" fill="#8d5a32"/><path d="M6 9h16l4 4-4 4H6z" fill="url(#g-gold)" stroke="#3d240c" stroke-width="1.4"/><line x1="9" y1="13" x2="18" y2="13" stroke="#3d240c" stroke-width="1.6"/></symbol>`,
    `<symbol id="icon-starfall" viewBox="0 0 32 32"><path d="M6 6l12 12" stroke="#9be8ff" stroke-width="2.5" stroke-linecap="round"/><path d="M10 4l8 8" stroke="#ffe082" stroke-width="1.8" stroke-linecap="round"/><polygon points="20,10 22.3,15.5 28,16 23.6,19.8 25,25.5 20,22.4 15,25.5 16.4,19.8 12,16 17.7,15.5" fill="url(#g-gold)"/></symbol>`,
    `<symbol id="icon-pokedex" viewBox="0 0 32 32"><rect x="5" y="4" width="22" height="24" rx="3.5" fill="url(#g-ball-red)" stroke="#1b2447" stroke-width="1.8"/><circle cx="11" cy="10" r="3" fill="#80f0ff" stroke="#ffffff" stroke-width="1.2"/><rect x="10" y="16" width="12" height="8" rx="1.5" fill="#102042" stroke="#ffd54f" stroke-width="1.2"/></symbol>`,
    `<symbol id="icon-badges" viewBox="0 0 32 32"><polygon points="16,3 25,8 27,18 16,29 5,18 7,8" fill="url(#g-gold)" stroke="#4a3100" stroke-width="1.5"/><polygon points="16,8 21,15 16,24 11,15" fill="url(#g-prism)"/></symbol>`,
    `<symbol id="icon-style" viewBox="0 0 32 32"><path d="M16 4l4 5 6-2-2 19H8L6 7l6 2z" fill="url(#g-astral)" stroke="#ffd4f0" stroke-width="1.6"/><circle cx="16" cy="16" r="3" fill="#ffe082"/></symbol>`,
    `<symbol id="icon-skyhop" viewBox="0 0 32 32"><path d="M4 20c5-10 14-14 24-12-5 4-8 8-10 14l-5-3-5 4z" fill="url(#g-prism)" stroke="#102854" stroke-width="1.5"/><circle cx="21" cy="11" r="2" fill="#fff9c4"/></symbol>`,
    `<symbol id="icon-settings" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="none" stroke="url(#g-silver)" stroke-width="4" stroke-dasharray="4 3"/><circle cx="16" cy="16" r="5" fill="url(#g-astral)" stroke="#e0f7fa" stroke-width="1.6"/></symbol>`,
    `<symbol id="icon-audio-on" viewBox="0 0 32 32"><polygon points="5,12 11,12 18,6 18,26 11,20 5,20" fill="url(#g-silver)"/><path d="M21.5 11.5a6.5 6.5 0 0 1 0 9M24.5 8.5a10.5 10.5 0 0 1 0 15" fill="none" stroke="#80f0ff" stroke-width="2" stroke-linecap="round"/></symbol>`,
    `<symbol id="icon-audio-off" viewBox="0 0 32 32"><polygon points="5,12 11,12 18,6 18,26 11,20 5,20" fill="#8a94b0"/><line x1="21" y1="11" x2="28" y2="21" stroke="#ff7675" stroke-width="2.4" stroke-linecap="round"/><line x1="28" y1="11" x2="21" y2="21" stroke="#ff7675" stroke-width="2.4" stroke-linecap="round"/></symbol>`,
    `<symbol id="icon-crt" viewBox="0 0 32 32"><rect x="4" y="6" width="24" height="18" rx="3" fill="#182042" stroke="url(#g-silver)" stroke-width="2"/><line x1="7" y1="11" x2="25" y2="11" stroke="#7ce8ff" stroke-width="1.5" opacity="0.8"/><line x1="7" y1="15" x2="25" y2="15" stroke="#ff8cd9" stroke-width="1.5" opacity="0.8"/><line x1="7" y1="19" x2="25" y2="19" stroke="#7ce8ff" stroke-width="1.5" opacity="0.8"/><line x1="11" y1="27" x2="21" y2="27" stroke="#cfd8dc" stroke-width="2.4" stroke-linecap="round"/></symbol>`,
    `<symbol id="icon-motion" viewBox="0 0 32 32"><path d="M5 18c4-8 10-8 14 0s8 4 8-4" fill="none" stroke="url(#g-prism)" stroke-width="2.6" stroke-linecap="round"/><circle cx="24" cy="11" r="3" fill="#ffe082"/></symbol>`,
    `<symbol id="icon-save" viewBox="0 0 32 32"><path d="M6 5h16l5 5v17H6z" fill="url(#g-astral)" stroke="#b8d0ff" stroke-width="1.6"/><rect x="10" y="5" width="10" height="7" fill="#eef4ff"/><rect x="9" y="16" width="14" height="8" rx="1.5" fill="#ffd54f"/></symbol>`,
    `<symbol id="icon-bond" viewBox="0 0 32 32"><path d="M16 27S5 19.5 5 11.5A6 6 0 0 1 16 8a6 6 0 0 1 11 3.5C27 19.5 16 27 16 27z" fill="url(#g-fairy)" stroke="#ffe8f7" stroke-width="1.6"/></symbol>`,
    `<symbol id="icon-star-rank" viewBox="0 0 32 32"><polygon points="16,3 19.8,11.2 28.8,12.2 22.1,18.4 24,27.3 16,22.8 8,27.3 9.9,18.4 3.2,12.2 12.2,11.2" fill="url(#g-gold)" stroke="#5c3d00" stroke-width="1.4"/></symbol>`,
    `<symbol id="icon-crown" viewBox="0 0 32 32"><path d="M4 23L6 10l6.5 6L16 8l3.5 8L26 10l2 13z" fill="url(#g-gold)" stroke="#5c3d00" stroke-width="1.5"/><rect x="5" y="24" width="22" height="3" rx="1" fill="#ffe082"/><circle cx="16" cy="18" r="2" fill="#80f0ff"/></symbol>`,
  ];
}

function buildTypeSymbols() {
  const glyphs = {
    normal: '<circle cx="16" cy="16" r="6" fill="none" stroke="#ffffff" stroke-width="2.4"/><circle cx="16" cy="16" r="2.2" fill="#ffffff"/>',
    grass: '<path d="M16 7c5 3 7 8 4 14-5 0-9-4-9-9 0-2 2-4 5-5z" fill="#ffffff"/><line x1="12" y1="21" x2="18" y2="13" stroke="#1f8a4c" stroke-width="1.8"/>',
    fire: '<path d="M16 6c2 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3-1-2 0-5 1-7z" fill="#ffffff"/>',
    water: '<path d="M16 6c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z" fill="#ffffff"/>',
    electric: '<polygon points="18,6 10,17 15.5,17 13.5,26 22,14.5 16.5,14.5" fill="#ffffff"/>',
    ice: '<polygon points="16,6 22,12 22,20 16,26 10,20 10,12" fill="none" stroke="#ffffff" stroke-width="2.2"/><circle cx="16" cy="16" r="2.5" fill="#ffffff"/>',
    fighting: '<rect x="10" y="11" width="12" height="10" rx="3" fill="#ffffff"/><line x1="13" y1="11" x2="13" y2="15" stroke="#96221b" stroke-width="1.6"/><line x1="19" y1="11" x2="19" y2="15" stroke="#96221b" stroke-width="1.6"/>',
    poison: '<circle cx="13" cy="14" r="3.5" fill="#ffffff"/><circle cx="19" cy="15" r="3" fill="#ffffff"/><circle cx="16" cy="20" r="3" fill="#ffffff"/>',
    ground: '<polygon points="6,23 13,10 18,17 21,13 26,23" fill="#ffffff"/>',
    flying: '<path d="M7 19c4-7 11-10 18-8-3 3-6 6-7 10l-4-2-4 3z" fill="#ffffff"/>',
    psychic: '<ellipse cx="16" cy="16" rx="8" ry="5" fill="none" stroke="#ffffff" stroke-width="2.2"/><circle cx="16" cy="16" r="2.6" fill="#ffffff"/>',
    bug: '<ellipse cx="16" cy="17" rx="5" ry="6" fill="#ffffff"/><circle cx="16" cy="10" r="2.5" fill="#ffffff"/><path d="M11 13l-3-3M21 13l3-3" stroke="#ffffff" stroke-width="1.8"/>',
    rock: '<polygon points="10,22 8,14 15,8 23,12 22,22" fill="#ffffff"/>',
    ghost: '<path d="M10 23V14a6 6 0 0 1 12 0v9l-3-2-3 2-3-2z" fill="#ffffff"/><circle cx="14" cy="14" r="1.3" fill="#432ea3"/><circle cx="18" cy="14" r="1.3" fill="#432ea3"/>',
    dragon: '<path d="M9 21c1-7 6-12 13-11-2 3-1 6 2 8-4 1-6 4-8 6z" fill="#ffffff"/>',
    dark: '<path d="M19 8a8 8 0 1 0 4 14 6.5 6.5 0 0 1-4-14z" fill="#ffffff"/>',
    steel: '<polygon points="16,7 24,11.5 24,20.5 16,25 8,20.5 8,11.5" fill="none" stroke="#ffffff" stroke-width="2.4"/><circle cx="16" cy="16" r="2.5" fill="#ffffff"/>',
    fairy: '<polygon points="16,6 18.5,13 26,16 18.5,19 16,26 13.5,19 6,16 13.5,13" fill="#ffffff"/>',
  };

  return Object.entries(TYPE_PALETTES).map(([type, pal]) => {
    const gradId = `gt-${type}`;
    return `<symbol id="icon-type-${type}" viewBox="0 0 32 32"><defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${pal.glow}"/><stop offset="48%" stop-color="${pal.primary}"/><stop offset="100%" stop-color="${pal.secondary}"/></linearGradient></defs><circle cx="16" cy="16" r="13.5" fill="url(#${gradId})" stroke="${pal.dark}" stroke-width="1.8"/>${glyphs[type]}</symbol>`;
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
      ? '<polygon points="16,2 21,8 28,9 26,16 28,23 21,24 16,30 11,24 4,23 6,16 4,9 11,8" '
      : '<polygon points="16,2.5 27,8.5 27,23.5 16,29.5 5,23.5 5,8.5" ';
    const inner = b.index % 3 === 0
      ? '<polygon points="16,7 22,16 16,25 10,16" '
      : b.index % 3 === 1
        ? '<circle cx="16" cy="16" r="7.5" '
        : '<polygon points="16,7.5 18.8,13.5 25,14.2 20.4,18.6 21.6,24.8 16,21.8 10.4,24.8 11.6,18.6 7,14.2 13.2,13.5" ';
    return `<symbol id="icon-badge-${b.index}" viewBox="0 0 32 32"><defs><linearGradient id="${fid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${mf.hi}"/><stop offset="50%" stop-color="${mf.mid}"/><stop offset="100%" stop-color="${mf.lo}"/></linearGradient><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${b.accentColor}"/><stop offset="100%" stop-color="${b.primaryColor}"/></linearGradient></defs>${outer}fill="url(#${fid})" stroke="#121833" stroke-width="1.5"/>${inner}fill="url(#${gid})" stroke="${mf.hi}" stroke-width="1.1"/><circle cx="16" cy="16" r="2.2" fill="#ffffff" opacity="0.9"/></symbol>`;
  });
}

function bakeIconsSvg() {
  const defs = `<defs>
  <linearGradient id="g-ball-red" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff8a80"/><stop offset="50%" stop-color="#e53935"/><stop offset="100%" stop-color="#8e0000"/></linearGradient>
  <linearGradient id="g-ball-bot" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#cfd8dc"/></linearGradient>
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
    ...buildCoreSymbols(),
    ...buildTypeSymbols(),
    ...buildBadgeSymbols(),
  ];

  const iconIds = [
    ...CORE_ICON_IDS,
    ...Object.keys(TYPE_PALETTES).map((t) => `icon-type-${t}`),
    ...BADGE_DEFINITIONS.map((b) => `icon-badge-${b.index}`),
  ];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${defs}\n${symbols.join('\n')}\n</svg>\n`;
  return { svg, iconIds };
}

function bakeEmblemSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
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
}

// -----------------------------------------------------------------------------
// Main Execution
// -----------------------------------------------------------------------------
function main() {
  fs.mkdirSync(ATLAS_DIR, { recursive: true });
  fs.mkdirSync(ICON_DIR, { recursive: true });

  const terrain = bakeTerrainAtlases();
  const props = bakePropsAtlas();
  const chars = bakeCharactersAtlas();
  const icons = bakeIconsSvg();
  const emblemSvg = bakeEmblemSvg();

  const filesToWrite = [
    {
      path: path.join(ATLAS_DIR, 'terrain-atlas.png'),
      buf: encodePngRgba(terrain.width, terrain.height, terrain.albedo.data),
    },
    {
      path: path.join(ATLAS_DIR, 'terrain-normal.png'),
      buf: encodePngRgba(terrain.width, terrain.height, terrain.normal.data),
    },
    {
      path: path.join(ATLAS_DIR, 'terrain-emissive.png'),
      buf: encodePngRgba(terrain.width, terrain.height, terrain.emissive.data),
    },
    {
      path: path.join(ATLAS_DIR, 'props-atlas.png'),
      buf: encodePngRgba(props.width, props.height, props.canvas.data),
    },
    {
      path: path.join(ATLAS_DIR, 'characters-atlas.png'),
      buf: encodePngRgba(chars.width, chars.height, chars.canvas.data),
    },
    {
      path: path.join(ICON_DIR, 'starlight-icons.svg'),
      buf: Buffer.from(icons.svg, 'utf8'),
    },
    {
      path: path.join(ICON_DIR, 'starlight-emblem.svg'),
      buf: Buffer.from(emblemSvg, 'utf8'),
    },
  ];

  let totalBytes = 0;
  for (const f of filesToWrite) {
    fs.writeFileSync(f.path, f.buf);
    totalBytes += f.buf.length;
  }

  const biomeTileRowMap = {};
  BIOMES.forEach((b, idx) => {
    biomeTileRowMap[b.id] = idx;
  });

  const manifest = {
    version: '2.0.0',
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
        regions: terrain.regions,
      },
      props: {
        id: 'props',
        albedoPath: './atlases/props-atlas.png',
        width: props.width,
        height: props.height,
        tileSize: props.tileSize,
        regions: props.regions,
      },
      characters: {
        id: 'characters',
        albedoPath: './atlases/characters-atlas.png',
        width: chars.width,
        height: chars.height,
        tileSize: chars.tileSize,
        regions: chars.regions,
      },
    },
    biomeTileRowMap,
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
        seed: SEED,
        biomes: BIOMES.length,
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
