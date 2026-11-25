#!/usr/bin/env node
/**
 * One-time authoring processor: converts generated master pixel-art JPGs into
 * crisp, chroma-keyed, defringed, pixel-grid-aligned RGBA PNGs in `assets-src/`.
 *
 * Uses Playwright Chromium Canvas only during authoring; `scripts/bake-assets.mjs`
 * remains 100% pure Node (`node:zlib`) with zero browser or network dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from '@playwright/test';

const ARTIFACT_DIR = 'C:/Users/alexg/.gemini/antigravity/brain/4e9c30ba-e498-425e-9b29-d89c9342cf6b';
const OUT_ROOT = 'C:/starlight_v2/assets-src';

// Pure-Node Deterministic RGBA PNG Encoder
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const rowOut = y * (1 + stride);
    const rowIn = y * stride;
    raw[rowOut] = 1;
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? rgba[rowIn + x - 4] : 0;
      raw[rowOut + 1 + x] = (rgba[rowIn + x] - left) & 0xff;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', idat), makeChunk('IEND', Buffer.alloc(0))]);
}

function writePng(relPath, width, height, rgba) {
  const full = path.join(OUT_ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const buf = encodePng(width, height, rgba);
  fs.writeFileSync(full, buf);
  console.log(`  wrote ${relPath} (${width}x${height}, ${(buf.length / 1024).toFixed(1)} KB)`);
}

function findLatest(prefix) {
  const files = fs.readdirSync(ARTIFACT_DIR).filter((f) => f.startsWith(prefix) && f.endsWith('.jpg'));
  if (!files.length) throw new Error(`Missing artifact matching ${prefix}*.jpg in ${ARTIFACT_DIR}`);
  files.sort();
  return path.join(ARTIFACT_DIR, files[files.length - 1]);
}

function isMagentaBg(r, g, b, strict = false) {
  if (strict) {
    return r >= 185 && b >= 185 && g <= 95 && (r - g) >= 115 && (b - g) >= 115;
  }
  return r >= 150 && b >= 145 && g <= 125 && (r - g) >= 65 && (b - g) >= 60 && Math.abs(r - b) <= 85;
}

/**
 * Flood-fills bright magenta background starting from cell border pixels so
 * interior purple/pink pixels (Violet's outfit, Sakura blossoms, etc.) remain untouched!
 */
function floodKeyMagenta(rgba, w, h) {
  const visited = new Uint8Array(w * h);
  const bg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const trySeed = (x, y) => {
    const idx = y * w + x;
    if (visited[idx]) return;
    const p = idx * 4;
    if (isMagentaBg(rgba[p], rgba[p + 1], rgba[p + 2], false)) {
      visited[idx] = 1;
      bg[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    trySeed(x, 0);
    trySeed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    trySeed(0, y);
    trySeed(w - 1, y);
  }

  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % w;
    const cy = (cur - cx) / w;
    const neighbors = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nIdx = ny * w + nx;
      if (visited[nIdx]) continue;
      const p = nIdx * 4;
      if (isMagentaBg(rgba[p], rgba[p + 1], rgba[p + 2], false)) {
        visited[nIdx] = 1;
        bg[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
  }

  // Also clear small enclosed pure-magenta holes (e.g. between legs/arms/handles/arches)
  for (let i = 0; i < w * h; i++) {
    if (bg[i]) continue;
    const p = i * 4;
    if (isMagentaBg(rgba[p], rgba[p + 1], rgba[p + 2], true)) {
      bg[i] = 1;
    }
  }

  // Dilate background 1px into magenta-contaminated JPEG halo pixels and defringe boundary
  const halo = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (bg[idx]) continue;
      const touchesBg = bg[idx - 1] || bg[idx + 1] || bg[idx - w] || bg[idx + w];
      if (!touchesBg) continue;
      const p = idx * 4;
      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      // Strong magenta bleed -> transparent
      if (r - g > 48 && b - g > 45 && g < 150) {
        halo[idx] = 1;
      } else if (r - g > 28 && b - g > 28) {
        // Subtle pink fringe on dark outline -> snap cleanly to dark indigo outline
        rgba[p] = Math.round(r * 0.25 + 22 * 0.75);
        rgba[p + 1] = Math.round(g * 0.35 + 18 * 0.65);
        rgba[p + 2] = Math.round(b * 0.3 + 48 * 0.7);
      }
    }
  }

  for (let i = 0; i < w * h; i++) {
    if (bg[i] || halo[i]) {
      rgba[i * 4] = 0;
      rgba[i * 4 + 1] = 0;
      rgba[i * 4 + 2] = 0;
      rgba[i * 4 + 3] = 0;
    }
  }
}

/**
 * Removes neighbor-cell bleed slivers touching the left/right cell border
 * (connected components < 15% of largest component that touch x <= 3 or x >= w - 4).
 */
function stripBorderSlivers(rgba, w, h) {
  const labels = new Int32Array(w * h);
  const queue = new Int32Array(w * h);
  const comps = [];
  let nextLabel = 1;

  for (let i = 0; i < w * h; i++) {
    if (labels[i] !== 0 || rgba[i * 4 + 3] <= 128) continue;
    const label = nextLabel++;
    let head = 0;
    let tail = 0;
    labels[i] = label;
    queue[tail++] = i;
    let count = 0;
    let touchesEdge = false;
    while (head < tail) {
      const cur = queue[head++];
      count++;
      const cx = cur % w;
      const cy = (cur - cx) / w;
      if (cx <= 4 || cx >= w - 5 || cy <= 2) touchesEdge = true;
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nIdx = ny * w + nx;
        if (labels[nIdx] === 0 && rgba[nIdx * 4 + 3] > 128) {
          labels[nIdx] = label;
          queue[tail++] = nIdx;
        }
      }
    }
    comps.push({ label, count, touchesEdge });
  }
  if (comps.length <= 1) return;
  const maxCount = Math.max(...comps.map((c) => c.count));
  const killSet = new Set(
    comps.filter((c) => c.touchesEdge && c.count < maxCount * 0.15).map((c) => c.label),
  );
  if (killSet.size === 0) return;
  for (let i = 0; i < w * h; i++) {
    if (killSet.has(labels[i])) {
      rgba[i * 4] = 0;
      rgba[i * 4 + 1] = 0;
      rgba[i * 4 + 2] = 0;
      rgba[i * 4 + 3] = 0;
    }
  }
}

/**
 * Strips pink/purple glow bleed created when emissive lamp/crystal light blends onto #FF00FF.
 */
function stripGlowMagentaBleed(rgba, w, h, mode) {
  for (let pass = 0; pass < 3; pass++) {
    const toClear = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const p = idx * 4;
        if (rgba[p + 3] <= 128) continue;
        const r = rgba[p];
        const g = rgba[p + 1];
        const b = rgba[p + 2];
        if (mode === 'lantern') {
          // Pink/coral halo flanking warm lantern glass on magenta bg
          if (r > 170 && g < 150 && b > 90 && r - g > 55 && b > g * 0.85) {
            toClear[idx] = 1;
          }
        } else if (mode === 'shrine') {
          // Bright purple/violet glow halo around cyan floating crystal
          if (r > 110 && b > 165 && g < 145 && r - g > 30 && b - g > 55) {
            toClear[idx] = 1;
          }
        }
      }
    }
    for (let i = 0; i < w * h; i++) {
      if (toClear[i]) {
        rgba[i * 4] = 0;
        rgba[i * 4 + 1] = 0;
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = 0;
      }
    }
  }
}

/**
 * Downsamples a transparent sprite with crisp pixel-art box-majority / alpha-weighted sampling
 * and preserves aspect ratio anchored bottom-center inside target (tw x th).
 */
function fitSpriteToGrid(srcRgba, sw, sh, tw, th, { bottomAnchor = true, pad = 2 } = {}) {
  let minX = sw;
  let minY = sh;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (srcRgba[(y * sw + x) * 4 + 3] > 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const out = new Uint8Array(tw * th * 4);
  if (maxX < minX || maxY < minY) return out;

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const availW = Math.max(1, tw - pad * 2);
  const availH = Math.max(1, th - pad * 2);
  const scale = Math.min(availW / bw, availH / bh);
  const dstW = Math.max(1, Math.round(bw * scale));
  const dstH = Math.max(1, Math.round(bh * scale));
  const offX = Math.floor((tw - dstW) / 2);
  const offY = bottomAnchor ? th - pad - dstH : Math.floor((th - dstH) / 2);

  for (let dy = 0; dy < dstH; dy++) {
    const sy0 = minY + (dy / dstH) * bh;
    const sy1 = minY + ((dy + 1) / dstH) * bh;
    for (let dx = 0; dx < dstW; dx++) {
      const sx0 = minX + (dx / dstW) * bw;
      const sx1 = minX + ((dx + 1) / dstW) * bw;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let opaque = 0;
      let total = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        if (sy < 0 || sy >= sh) continue;
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          if (sx < 0 || sx >= sw) continue;
          const p = (sy * sw + sx) * 4;
          total++;
          if (srcRgba[p + 3] > 128) {
            rSum += srcRgba[p];
            gSum += srcRgba[p + 1];
            bSum += srcRgba[p + 2];
            opaque++;
          }
        }
      }
      if (total > 0 && opaque / total >= 0.42) {
        const oi = ((offY + dy) * tw + (offX + dx)) * 4;
        out[oi] = Math.round(rSum / opaque);
        out[oi + 1] = Math.round(gSum / opaque);
        out[oi + 2] = Math.round(bSum / opaque);
        out[oi + 3] = 255;
      }
    }
  }
  return out;
}

/**
 * Downsamples an opaque image (battle backdrop or seamless tile) to exact crisp pixel dimensions
 * using area-average + gentle contrast/saturation pop for crisp pixel-art read.
 */
function downsampleOpaque(srcRgba, sw, sh, tw, th, cropX = 0, cropY = 0, cropW = sw, cropH = sh) {
  const out = new Uint8Array(tw * th * 4);
  for (let dy = 0; dy < th; dy++) {
    const sy0 = cropY + (dy / th) * cropH;
    const sy1 = cropY + ((dy + 1) / th) * cropH;
    for (let dx = 0; dx < tw; dx++) {
      const sx0 = cropX + (dx / tw) * cropW;
      const sx1 = cropX + ((dx + 1) / tw) * cropW;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        if (sy < 0 || sy >= sh) continue;
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          if (sx < 0 || sx >= sw) continue;
          const p = (sy * sw + sx) * 4;
          r += srcRgba[p];
          g += srcRgba[p + 1];
          b += srcRgba[p + 2];
          n++;
        }
      }
      const oi = (dy * tw + dx) * 4;
      if (n > 0) {
        // Gentle 6-bit RGB snap (levels of 6) for ultra-clean pixel-art compression & look
        out[oi] = Math.min(255, Math.round(r / n / 4) * 4);
        out[oi + 1] = Math.min(255, Math.round(g / n / 4) * 4);
        out[oi + 2] = Math.min(255, Math.round(b / n / 4) * 4);
        out[oi + 3] = 255;
      }
    }
  }
  return out;
}

function cropRect(srcRgba, sw, x, y, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const srcOff = ((y + row) * sw + x) * 4;
    out.set(srcRgba.subarray(srcOff, srcOff + w * 4), row * w * 4);
  }
  return out;
}

/**
 * Finds exact non-magenta content bounds inside a 4x3 tileset grid cell so zero
 * magenta grid-line border pixels ever leak into a seamless tile!
 */
function findOpaqueTileBox(rgba, w, h) {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      if (!isMagentaBg(rgba[p], rgba[p + 1], rgba[p + 2], false)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  // Inset 4px inside the box to discard any JPEG magenta bleed on tile edges
  const inset = 4;
  return {
    x: Math.min(w - 1, minX + inset),
    y: Math.min(h - 1, minY + inset),
    w: Math.max(8, maxX - minX + 1 - inset * 2),
    h: Math.max(8, maxY - minY + 1 - inset * 2),
  };
}

async function decodeJpg(page, filePath) {
  const b64 = fs.readFileSync(filePath).toString('base64');
  const res = await page.evaluate(async (dataUrl) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height);
    // Return as base64 string for fast IPC transfer
    const bytes = new Uint8Array(id.data.buffer);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return { width: c.width, height: c.height, b64: btoa(bin) };
  }, `data:image/jpeg;base64,${b64}`);
  return {
    width: res.width,
    height: res.height,
    rgba: new Uint8Array(Buffer.from(res.b64, 'base64')),
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // 1. Process all 18 Battle Arenas + Sky-Hop Twilight Panorama -> crisp 480x270 PNGs
    console.log('=== Processing 18 Battle Arenas + Sky-Hop Panorama (480x270) ===');
    const arenaMap = [
      ['village', 'arena_village_'],
      ['forest', 'arena_forest_'],
      ['water', 'arena_water_'],
      ['cave', 'arena_cave_'],
      ['volcano', 'arena_volcano_'],
      ['peak', 'arena_peak_'],
      ['grove', 'arena_grove_'],
      ['desert', 'arena_desert_'],
      ['marsh', 'arena_marsh_'],
      ['sanctum', 'astral_sky_citadel_battle_bg_'],
      ['canyon', 'thundersteppe_canyon_bg_'],
      ['reef', 'abyssal_pearl_trench_bg_'],
      ['ruins', 'chrono_relic_ruins_bg_'],
      ['rift', 'mythic_starlight_rift_bg_'],
      ['faeveldt', 'pixie_faeveldt_glade_bg_'],
      ['atoll', 'sunburst_alola_atoll_bg_'],
      ['highlands', 'iron_crown_highlands_battle_bg_'],
      ['crater', 'terastal_crystal_crater_bg_'],
      ['skyhop', 'starlight_twilight_sky_panorama_'],
    ];

    for (const [id, prefix] of arenaMap) {
      const fp = findLatest(prefix);
      const { width, height, rgba } = await decodeJpg(page, fp);
      const crisp = downsampleOpaque(rgba, width, height, 480, 270);
      writePng(`arenas/${id}.png`, 480, 270, crisp);
    }

    // 2. Process Village Hero Props & Buildings (4x2 grid)
    console.log('=== Processing Village Hero Props & Buildings ===');
    {
      const { width, height, rgba } = await decodeJpg(page, findLatest('village_props_sheet_final_'));
      const cw = Math.floor(width / 4);
      const ch = Math.floor(height / 2);
      const specs = [
        { col: 0, row: 0, name: 'cottage_violet', tw: 96, th: 96 },
        { col: 1, row: 0, name: 'cottage_lab', tw: 96, th: 96 },
        { col: 2, row: 0, name: 'fountain', tw: 64, th: 64 },
        { col: 3, row: 0, name: 'shrine_open', tw: 64, th: 64 },
        { col: 0, row: 1, name: 'tree_oak', tw: 64, th: 64 },
        { col: 1, row: 1, name: 'tree_sakura', tw: 64, th: 64 },
        { col: 2, row: 1, name: 'chest_closed', tw: 48, th: 48 },
      ];
      for (const s of specs) {
        const cell = cropRect(rgba, width, s.col * cw, s.row * ch, cw, ch);
        floodKeyMagenta(cell, cw, ch);
        stripBorderSlivers(cell, cw, ch);
        if (s.name === 'shrine_open') stripGlowMagentaBleed(cell, cw, ch, 'shrine');
        const fitted = fitSpriteToGrid(cell, cw, ch, s.tw, s.th, { bottomAnchor: true, pad: 2 });
        writePng(`props/${s.name}.png`, s.tw, s.th, fitted);
      }
      // Split Row 2 Col 4 into lantern (left half) and signpost (right half)
      const cell8 = cropRect(rgba, width, 3 * cw, 1 * ch, cw, ch);
      const halfW = Math.floor(cw * 0.52);
      const lanternRaw = cropRect(cell8, cw, 0, 0, halfW, ch);
      floodKeyMagenta(lanternRaw, halfW, ch);
      stripBorderSlivers(lanternRaw, halfW, ch);
      stripGlowMagentaBleed(lanternRaw, halfW, ch, 'lantern');
      writePng('props/lantern.png', 48, 64, fitSpriteToGrid(lanternRaw, halfW, ch, 48, 64, { bottomAnchor: true, pad: 2 }));

      const signRaw = cropRect(cell8, cw, halfW, 0, cw - halfW, ch);
      floodKeyMagenta(signRaw, cw - halfW, ch);
      stripBorderSlivers(signRaw, cw - halfW, ch);
      writePng('props/signpost.png', 48, 48, fitSpriteToGrid(signRaw, cw - halfW, ch, 48, 48, { bottomAnchor: true, pad: 2 }));
    }

    // 3. Process Biome Landmarks & Trees Sheet (4x2 grid)
    console.log('=== Processing Biome Landmarks & Trees ===');
    {
      const { width, height, rgba } = await decodeJpg(page, findLatest('jrpg_props_landmarks_sheet_'));
      const cw = Math.floor(width / 4);
      const ch = Math.floor(height / 2);
      const specs = [
        { col: 0, row: 0, name: 'tree_pine', tw: 64, th: 64 },
        { col: 1, row: 0, name: 'tree_palm', tw: 64, th: 64 },
        { col: 2, row: 0, name: 'prop_mushroom', tw: 64, th: 64 },
        { col: 3, row: 0, name: 'prop_crystal', tw: 64, th: 64 },
        { col: 0, row: 1, name: 'chest_open', tw: 48, th: 48 },
        { col: 1, row: 1, name: 'shrine_cleared', tw: 64, th: 64 },
        { col: 2, row: 1, name: 'landmark_observatory', tw: 64, th: 64 },
        { col: 3, row: 1, name: 'landmark_obelisk', tw: 64, th: 64 },
      ];
      for (const s of specs) {
        const cell = cropRect(rgba, width, s.col * cw, s.row * ch, cw, ch);
        floodKeyMagenta(cell, cw, ch);
        const fitted = fitSpriteToGrid(cell, cw, ch, s.tw, s.th, { bottomAnchor: true, pad: 2 });
        writePng(`props/${s.name}.png`, s.tw, s.th, fitted);
      }
    }

    // 4. Process Characters & Portraits (4x2 sheet + 4x2 4-dir trainer walk sheet)
    console.log('=== Processing Characters & Portraits ===');
    {
      const { width, height, rgba } = await decodeJpg(page, findLatest('characters_sheet_'));
      const cw = Math.floor(width / 4);
      const ch = Math.floor(height / 2);
      const names = ['violet', 'ozias', 'willow', 'rival'];
      for (let i = 0; i < 4; i++) {
        // Row 0: overworld idle sprite (32x40)
        const sp = cropRect(rgba, width, i * cw, 0, cw, ch);
        floodKeyMagenta(sp, cw, ch);
        writePng(`characters/${names[i]}_idle.png`, 32, 40, fitSpriteToGrid(sp, cw, ch, 32, 40, { bottomAnchor: true, pad: 1 }));
        // Row 1: portrait bust (64x64)
        const port = cropRect(rgba, width, i * cw, ch, cw, ch);
        floodKeyMagenta(port, cw, ch);
        writePng(`characters/${names[i]}_portrait.png`, 64, 64, fitSpriteToGrid(port, cw, ch, 64, 64, { bottomAnchor: true, pad: 1 }));
      }
    }
    {
      const { width, height, rgba } = await decodeJpg(page, findLatest('trainer_spritesheet_4dir_'));
      const cw = Math.floor(width / 4);
      const ch = Math.floor(height / 2);
      const dirs = ['down', 'up', 'left', 'right'];
      const trainers = ['violet', 'ozias'];
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
          const cell = cropRect(rgba, width, c * cw, r * ch, cw, ch);
          floodKeyMagenta(cell, cw, ch);
          writePng(
            `characters/${trainers[r]}_${dirs[c]}.png`,
            32,
            40,
            fitSpriteToGrid(cell, cw, ch, 32, 40, { bottomAnchor: true, pad: 1 }),
          );
        }
      }
    }

    // 5. Process 10 Crisp Pixel-Art Fallback Companion Sprites (5x2 grid -> 48x48)
    console.log('=== Processing 10 Archetype Pixel Fallback Sprites (48x48) ===');
    {
      const { width, height, rgba } = await decodeJpg(page, findLatest('fallbacks_sheet_'));
      const cw = Math.floor(width / 5);
      const ch = Math.floor(height / 2);
      const archetypes = [
        'quadruped', 'biped', 'winged', 'serpentine', 'crystalline',
        'amorphous', 'insectoid', 'draconic', 'construct', 'flora',
      ];
      for (let idx = 0; idx < 10; idx++) {
        const col = idx % 5;
        const row = Math.floor(idx / 5);
        const cell = cropRect(rgba, width, col * cw, row * ch, cw, ch);
        floodKeyMagenta(cell, cw, ch);
        writePng(
          `fallbacks/${archetypes[idx]}.png`,
          48,
          48,
          fitSpriteToGrid(cell, cw, ch, 48, 48, { bottomAnchor: true, pad: 2 }),
        );
      }
    }

    // 6. Process Seamless 32x32 Pixel Terrain Tilesets (Sheet A + Sheet B)
    console.log('=== Processing Terrain Tilesets (32x32) ===');
    {
      const { width, height, rgba } = await decodeJpg(page, findLatest('jrpg_terrain_tileset_4x3_'));
      const cw = Math.floor(width / 4);
      const ch = Math.floor(height / 3);
      const tileNamesA = [
        'grass', 'path', 'tall_grass', 'sand',
        'shallow_water', 'deep_water', 'bridge', 'cliff_wall',
        'lava', 'snow_ice', 'rune_flagstone', 'terastal_floor',
      ];
      for (let idx = 0; idx < 12; idx++) {
        const col = idx % 4;
        const row = Math.floor(idx / 4);
        const cell = cropRect(rgba, width, col * cw, row * ch, cw, ch);
        const box = findOpaqueTileBox(cell, cw, ch);
        const tile = downsampleOpaque(cell, cw, ch, 32, 32, box.x, box.y, box.w, box.h);
        writePng(`tiles/${tileNamesA[idx]}.png`, 32, 32, tile);
      }
    }
    // Sheet B (Biome Tileset B)
    {
      const fp = findLatest('jrpg_terrain_tileset_sheet_v3_');
      console.log(`  using Biome Tileset B: ${path.basename(fp)}`);
      const { width, height, rgba } = await decodeJpg(page, fp);
      const cw = Math.floor(width / 4);
      const ch = Math.floor(height / 3);
      const tileNamesB = [
        'cave_floor', 'volcano_floor', 'marsh_grass', 'sanctum_floor',
        'canyon_grass', 'fae_grass', 'crown_floor', 'rift_floor',
        'flower_grass', 'sandstone_wall', 'ice_wall', 'reef_water',
      ];
      for (let idx = 0; idx < 12; idx++) {
        const col = idx % 4;
        const row = Math.floor(idx / 4);
        const cell = cropRect(rgba, width, col * cw, row * ch, cw, ch);
        const box = findOpaqueTileBox(cell, cw, ch);
        const tile = downsampleOpaque(cell, cw, ch, 32, 32, box.x, box.y, box.w, box.h);
        writePng(`tiles/${tileNamesB[idx]}.png`, 32, 32, tile);
      }
    }

    console.log('Master pixel art extraction COMPLETE!');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
