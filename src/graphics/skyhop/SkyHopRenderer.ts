import type {
  AtlasManifest,
  BiomeId,
  IOfflineSpriteRigSynthesizer,
  IRenderBackend,
  ISkyHopRenderer,
  OfflineRigDescriptor,
  SkyHopEntity,
  SkyHopState,
} from '../../contracts';
import {
  getBiomeVisualProfile,
  getSpeciesEntry,
  SKYHOP_LOGICAL_H,
  SKYHOP_LOGICAL_W,
  SKYHOP_PALETTES,
  SpriteAssetLoader,
  TYPE_PALETTES,
} from '../../core';
import { drawPixelArchetypeSprite } from '../../ui/iconHelper';
import {
  SILHOUETTE_CONTOUR_PAD,
  getSpriteSilhouetteContour,
} from '../battle/SpriteSilhouette';

interface SlipstreamSample {
  x: number;
  y: number;
  age: number;
  dash: boolean;
  frame: HTMLCanvasElement | null;
  active: boolean;
}

const MAX_TRAIL_SAMPLES = 20;

// 4x4 Bayer ordered dithering matrix
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// Precomputed deterministic starfield positions (zero per-frame Math.sin hashing)
const SKY_STARS: ReadonlyArray<{ bx: number; by: number; speed: number; phase: number; big: boolean }> = Array.from(
  { length: 44 },
  (_, i) => ({
    bx: Math.sin(i * 127.1 + 0.7) * 0.5 + 0.5,
    by: (Math.sin(i * 311.7 + 2.3) * 0.5 + 0.5) * 0.72 + 0.03,
    speed: 0.055 + (i % 3) * 0.032,
    phase: i * 1.9,
    big: i % 7 === 0,
  }),
);

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function hashEntityId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function hexToRgb255(hex: string): [number, number, number] {
  const c = hex.replace('#', '').trim();
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return [124, 232, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(hexA: string, hexB: string, t: number): string {
  const k = clamp(t, 0, 1);
  const [ar, ag, ab] = hexToRgb255(hexA);
  const [br, bg, bb] = hexToRgb255(hexB);
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const b = Math.round(ab + (bb - ab) * k);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function createCachedCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.fillRect !== 'function') return null;
    (canvas as HTMLCanvasElement & { __starlightImmutable?: boolean }).__starlightImmutable = true;
    return { canvas, ctx };
  } catch {
    return null;
  }
}

function lruSet<K, V>(cache: Map<K, V>, key: K, value: V, maxEntries: number): void {
  if (cache.size >= maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

// =============================================================================
// Offscreen Caches (Static Sky, Parallax Cloud/Island Strips, Glows, Entities)
// =============================================================================
const SKY_CACHE = new Map<string, HTMLCanvasElement>();
const ISLAND_STRIP_CACHE = new Map<string, HTMLCanvasElement>();
const CLOUD_STRIP_CACHE = new Map<string, HTMLCanvasElement>();
const GLOW_SPRITE_CACHE = new Map<string, HTMLCanvasElement>();
const ENTITY_STAMP_CACHE = new Map<string, HTMLCanvasElement>();

function getCachedGlowSprite(rgbaInner: string, rgbaMid: string): HTMLCanvasElement | null {
  const key = `${rgbaInner}|${rgbaMid}`;
  const cached = GLOW_SPRITE_CACHE.get(key);
  if (cached) return cached;
  const created = createCachedCanvas(64, 64);
  if (!created) return null;
  const { canvas, ctx } = created;
  const grad = ctx.createRadialGradient(32, 32, 3, 32, 32, 32);
  grad.addColorStop(0, rgbaInner);
  grad.addColorStop(0.5, rgbaMid);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  lruSet(GLOW_SPRITE_CACHE, key, canvas, 32);
  return canvas;
}

/**
 * Paints a 14-band 4x4 Bayer ordered-dithered twilight-to-starlight sky + blended skyhop.png panorama
 * onto a cached offscreen canvas so every Sky-Hop frame blits in 1 drawImage (zero gradients!).
 */
function getCachedSkyPanorama(
  skyIndex: number,
  palette: { top: string; mid: string; bottom: string; accent: string },
  cw: number,
  ch: number,
  skyArena: HTMLImageElement | null,
): HTMLCanvasElement | null {
  const qw = Math.max(320, Math.round(cw / 8) * 8);
  const qh = Math.max(200, Math.round(ch / 8) * 8);
  const hasArena = Boolean(skyArena && skyArena.naturalWidth > 0 && skyArena.naturalHeight > 0);
  const key = `${skyIndex}|${qw}x${qh}|${hasArena ? 1 : 0}`;
  const cached = SKY_CACHE.get(key);
  if (cached) return cached;

  const created = createCachedCanvas(qw, qh);
  if (!created) return null;
  const { canvas, ctx } = created;
  ctx.imageSmoothingEnabled = false;

  const px = Math.max(2, Math.round(Math.min(qw, qh) / 220));
  const bands = 14;
  const bandH = Math.ceil(qh / bands);
  const sampleSky = (f: number): string =>
    f < 0.54
      ? mixHex(palette.top, palette.mid, f / 0.54)
      : mixHex(palette.mid, palette.bottom, (f - 0.54) / 0.46);

  for (let b = 0; b < bands; b++) {
    const colA = sampleSky(b / (bands - 1));
    ctx.fillStyle = colA;
    ctx.fillRect(0, b * bandH, qw, bandH + 1);
    if (b < bands - 1) {
      const colB = sampleSky((b + 1) / (bands - 1));
      ctx.fillStyle = colB;
      for (let r = 0; r < 2; r++) {
        const thresh = ((r + 1) / 3) * 16;
        const brow = BAYER_4X4[r & 3];
        const py = (b + 1) * bandH - (2 - r) * px;
        for (let x = 0; x < qw; x += px) {
          if (brow[(x / px) & 3] < thresh) {
            ctx.fillRect(x, py, px, px);
          }
        }
      }
    }
  }

  // Blend the bespoke 480x270 Sky-Hop twilight panorama cleanly over the dithered sky
  if (hasArena && skyArena) {
    const bgScale = Math.max(qw / skyArena.naturalWidth, qh / skyArena.naturalHeight);
    const dw = Math.ceil(skyArena.naturalWidth * bgScale);
    const dh = Math.ceil(skyArena.naturalHeight * bgScale);
    ctx.save();
    ctx.globalAlpha = skyIndex === 0 ? 0.88 : 0.54;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(skyArena, Math.round((qw - dw) * 0.5), Math.round((qh - dh) * 0.5), dw, dh);
    ctx.restore();
  }

  lruSet(SKY_CACHE, key, canvas, 12);
  return canvas;
}

/**
 * Helper to draw an organic pixel-stepped rounded dome/circle (used for sculpted cloud puffs & islands).
 */
function paintPixelCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  px: number,
  fill: string,
): void {
  const scx = Math.round(cx / px) * px;
  const scy = Math.round(cy / px) * px;
  const rows = Math.max(2, Math.round(ry / px));
  ctx.fillStyle = fill;
  for (let r = -rows; r <= rows; r++) {
    const ny = r / (rows + 0.35);
    const hw = Math.round((Math.sqrt(Math.max(0, 1 - ny * ny)) * rx) / px) * px;
    if (hw <= 0) continue;
    ctx.fillRect(scx - hw, scy + r * px, hw * 2, px);
  }
}

/**
 * Pre-renders a seamless horizontally-tiling strip of organic HD-2D floating sky-islets
 * (sculpted stepped rock crags, rounded lush turf mounds, miniature pixel pine trees, glowing shrine
 * beacons, and softly mist-dithered fading starlight cascades — never hard-clipped at strip edges!).
 */
function getCachedFloatingIslandsStrip(
  skyIndex: number,
  accentHex: string,
  cw: number,
  ch: number,
): HTMLCanvasElement | null {
  const stripW = Math.max(480, Math.round(cw / 8) * 8);
  const stripH = Math.max(120, Math.round((ch * 0.28) / 4) * 4);
  const key = `${skyIndex}|${stripW}x${stripH}`;
  const cached = ISLAND_STRIP_CACHE.get(key);
  if (cached) return cached;

  const created = createCachedCanvas(stripW, stripH);
  if (!created) return null;
  const { canvas, ctx } = created;
  ctx.imageSmoothingEnabled = false;

  const px = Math.max(2, Math.round(Math.min(cw, ch) / 260));
  const snap = (v: number): number => Math.round(v / px) * px;
  const islands = [
    { fx: 0.16, fy: 0.42, rx: 22, ry: 12, hasTower: true, hasFall: false },
    { fx: 0.50, fy: 0.48, rx: 30, ry: 15, hasTower: false, hasFall: true },
    { fx: 0.84, fy: 0.36, rx: 18, ry: 10, hasTower: true, hasFall: false },
  ];

  const rockInk = '#0e132d';
  const rockDark = '#212b57';
  const rockMid = '#3b4a87';
  const rockLit = '#6b80bd';
  const turfDark = '#1c4d54';
  const turfMid = '#338575';
  const turfLit = mixHex('#8bf2cc', accentHex, 0.30);

  for (const isl of islands) {
    const cx = snap(stripW * isl.fx);
    const cy = snap(stripH * isl.fy);
    const rx = isl.rx * px;
    const ry = isl.ry * px;

    // Sculpted organic rocky underside (overlapping stepped boulder lobes, NOT flat triangles!)
    const lobes = [
      { ox: -rx * 0.45, oy: px * 2, lrx: rx * 0.52, lry: ry * 0.65 },
      { ox: rx * 0.40, oy: px * 2, lrx: rx * 0.48, lry: ry * 0.60 },
      { ox: 0, oy: px * 4, lrx: rx * 0.68, lry: ry * 0.95 },
      { ox: -rx * 0.12, oy: ry * 0.72, lrx: rx * 0.28, lry: ry * 0.52 },
    ];
    for (const l of lobes) {
      paintPixelCircle(ctx, cx + l.ox, cy + l.oy, l.lrx + px, l.lry + px, px, rockInk);
    }
    for (const l of lobes) {
      paintPixelCircle(ctx, cx + l.ox, cy + l.oy, l.lrx, l.lry, px, rockDark);
    }
    for (const l of lobes) {
      paintPixelCircle(ctx, cx + l.ox - px * 2, cy + l.oy - px, l.lrx * 0.72, l.lry * 0.72, px, rockMid);
    }
    paintPixelCircle(ctx, cx - rx * 0.32, cy + px, rx * 0.35, ry * 0.32, px, rockLit);

    // Floating tiny orbiting satellite pebbles beneath island
    ctx.fillStyle = rockInk;
    ctx.fillRect(cx - rx * 0.55, cy + ry * 1.15, px * 4, px * 3);
    ctx.fillStyle = rockMid;
    ctx.fillRect(cx - rx * 0.55 + px, cy + ry * 1.15 + px, px * 2, px);
    ctx.fillStyle = rockInk;
    ctx.fillRect(cx + rx * 0.38, cy + ry * 1.05, px * 3, px * 3);
    ctx.fillStyle = rockLit;
    ctx.fillRect(cx + rx * 0.38 + px, cy + ry * 1.05 + px, px, px);

    // Rounded terraced emerald/starlight turf dome capping the island
    paintPixelCircle(ctx, cx, cy - px, rx * 0.98 + px, px * 4, px, rockInk);
    paintPixelCircle(ctx, cx, cy - px, rx * 0.96, px * 3, px, turfDark);
    paintPixelCircle(ctx, cx - px, cy - px * 2, rx * 0.88, px * 2.5, px, turfMid);
    paintPixelCircle(ctx, cx - px * 2, cy - px * 3, rx * 0.66, px * 1.5, px, turfLit);

    // Miniature pixel pine silhouettes flanking top of island
    for (const side of [-0.52, 0.46]) {
      const tx = snap(cx + rx * side);
      const ty = cy - px * 3;
      ctx.fillStyle = rockInk;
      ctx.fillRect(tx - px * 2, ty - px * 5, px * 5, px * 5);
      ctx.fillStyle = turfDark;
      ctx.fillRect(tx - px * 2, ty - px * 2, px * 5, px * 2);
      ctx.fillStyle = turfMid;
      ctx.fillRect(tx - px, ty - px * 4, px * 3, px * 2);
      ctx.fillStyle = turfLit;
      ctx.fillRect(tx, ty - px * 6, px, px * 2);
    }

    // Tiny glowing shrine spire / lantern beacon
    if (isl.hasTower) {
      const tx = cx - px * 2;
      const ty = cy - px * 11;
      ctx.fillStyle = rockInk;
      ctx.fillRect(tx - px, ty, px * 6, px * 9);
      ctx.fillStyle = rockMid;
      ctx.fillRect(tx, ty + px, px * 4, px * 8);
      ctx.fillStyle = rockLit;
      ctx.fillRect(tx, ty + px, px * 2, px * 8);
      ctx.fillStyle = rockInk;
      ctx.fillRect(tx - px * 2, ty - px, px * 8, px * 2);
      ctx.fillStyle = accentHex;
      ctx.fillRect(tx - px, ty - px, px * 6, px);
      ctx.fillStyle = '#ffe58f';
      ctx.fillRect(tx + px, ty + px * 3, px * 2, px * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(tx + px, ty + px * 3, px, px);
    }

    // Mist-fading cascading starlight waterfall (dissipates cleanly into pixel mist!)
    if (isl.hasFall) {
      const fx = cx + px * 4;
      const fallLen = Math.min(ry * 1.35, stripH - cy - px * 6);
      for (let y = 0; y < fallLen; y += px) {
        const fade = clamp(1 - y / Math.max(px, fallLen), 0, 1);
        ctx.fillStyle = `rgba(124, 232, 255, ${(0.58 * fade).toFixed(3)})`;
        ctx.fillRect(fx, cy + y, px * 3, px);
        if (fade > 0.25) {
          ctx.fillStyle = `rgba(240, 252, 255, ${(0.86 * fade).toFixed(3)})`;
          ctx.fillRect(fx + px, cy + y, px, px);
        }
      }
      // Soft mist cloudlet at waterfall dissipation
      paintPixelCircle(ctx, fx + px, cy + fallLen, px * 4, px * 2, px, 'rgba(180, 240, 255, 0.34)');
    }
  }

  lruSet(ISLAND_STRIP_CACHE, key, canvas, 12);
  return canvas;
}

/**
 * Pre-renders a seamless horizontally-tiling strip of sculpted 4-tone billowing 16-bit pixel clouds
 * (replaces flat blocky staircase bars with genuine rounded, moonlit pixel-art cloud banks!).
 */
function getCachedCloudSeaStrip(
  layerId: 'mid' | 'near',
  skyIndex: number,
  accentHex: string,
  cw: number,
  ch: number,
): HTMLCanvasElement | null {
  const stripW = Math.max(480, Math.round(cw / 8) * 8);
  const stripH = Math.max(72, Math.round((ch * (layerId === 'near' ? 0.16 : 0.21)) / 4) * 4);
  const key = `${layerId}|${skyIndex}|${stripW}x${stripH}`;
  const cached = CLOUD_STRIP_CACHE.get(key);
  if (cached) return cached;

  const created = createCachedCanvas(stripW, stripH);
  if (!created) return null;
  const { canvas, ctx } = created;
  ctx.imageSmoothingEnabled = false;

  const px = Math.max(2, Math.round(Math.min(cw, ch) / 240));
  const deepCol = layerId === 'near' ? '#0d1536' : '#19295c';
  const shadowCol = layerId === 'near' ? '#1c2b5e' : '#2d4487';
  const bodyCol = layerId === 'near' ? '#3d589c' : '#5878bf';
  const rimCol = layerId === 'near' ? mixHex('#b8dcff', accentHex, 0.22) : mixHex('#d8ecff', accentHex, 0.30);

  // Seamless wrapping puff layout (duplicate edge puffs at x - stripW and x + stripW!)
  const puffCount = layerId === 'near' ? 9 : 11;
  const puffs: Array<{ x: number; y: number; rx: number; ry: number }> = [];
  for (let i = 0; i < puffCount; i++) {
    const cx = (i / puffCount) * stripW;
    const rx = (stripW / puffCount) * (0.68 + ((i * 37) % 10) * 0.032);
    const ry = stripH * (0.34 + Math.abs(Math.sin(i * 2.1 + (layerId === 'near' ? 1.4 : 0))) * 0.24);
    const cy = stripH - ry * 0.62;
    puffs.push({ x: cx, y: cy, rx, ry });
  }

  const drawWrappedPuffs = (ox: number, oy: number, scaleX: number, scaleY: number, fill: string): void => {
    for (const p of puffs) {
      for (const wrap of [-stripW, 0, stripW]) {
        const x = p.x + wrap + ox;
        if (x + p.rx * scaleX < -px * 2 || x - p.rx * scaleX > stripW + px * 2) continue;
        paintPixelCircle(ctx, x, p.y + oy, p.rx * scaleX, p.ry * scaleY, px, fill);
      }
    }
  };

  // Layer 1: Moonlit top rim crown
  drawWrappedPuffs(-px, -px * 2, 1.0, 1.0, rimCol);
  // Layer 2: Soft cloud mid-body
  drawWrappedPuffs(0, 0, 1.0, 0.96, bodyCol);
  // Layer 3: Sculpted lower shadow billows
  drawWrappedPuffs(px, px * 3, 1.02, 0.88, shadowCol);
  // Layer 4: Deep twilight cloud base
  drawWrappedPuffs(px * 2, px * 6, 1.04, 0.78, deepCol);

  // Solid base fill so bottom seam never exposes gaps
  ctx.fillStyle = deepCol;
  ctx.fillRect(0, stripH - px * 6, stripW, px * 6);

  // Subtle ordered dither highlight stipple along cloud crests
  ctx.fillStyle = 'rgba(255, 252, 240, 0.42)';
  for (const p of puffs) {
    const hx = Math.round((p.x - p.rx * 0.28) / px) * px;
    const hy = Math.round((p.y - p.ry * 0.84) / px) * px;
    ctx.fillRect(hx, hy, Math.max(px * 2, Math.round((p.rx * 0.44) / px) * px), px);
  }

  lruSet(CLOUD_STRIP_CACHE, key, canvas, 16);
  return canvas;
}

// =============================================================================
// Handcrafted 16x16 / 20x16 Pixel-Art Entity Sprite Grids (Pre-cached Stamps!)
// =============================================================================
const ENTITY_GRIDS: Record<string, readonly string[]> = {
  star: [
    '.......OO.......',
    '......OWYO......',
    '......OYYO......',
    '.....OWYYAO.....',
    '....OOWYYAOO....',
    '.OOOWWYYYYAAOOO.',
    'OWWWYYYYYYYYAAAO',
    '.OOWYYYYYYAAAAO.',
    '..OOYYYYYYAAOO..',
    '....OYYYYAAO....',
    '....OYYYAAAO....',
    '...OYYAO.OAAO...',
    '...OYAO...OAO...',
    '..OOAO.....OAO..',
    '..OOO.......OO..',
    '................',
  ],
  bigstar: [
    '.........OO.........',
    '........OWYO........',
    '.......OWYYAO.......',
    '.......OYYYAO.......',
    '......OWYYYAAO......',
    '..OO..OYYYYAAO..OO..',
    '.OCOOOWYYYYAAAOOCOO.',
    'OCCCWWYYYYYYAAAACCCO',
    '.OOWWWYYYYYYAAAAWOO.',
    '...OOYYYYYYYYAAOO...',
    '....OYYYYYYYYAAO....',
    '....OYYYYYYYAAAO....',
    '...OYYYYAOOAYAAAO...',
    '...OYYYAO..OAYAAO...',
    '..OYYAAO....OAAAO...',
    '..OYAAO......OAAO...',
    '.OOAAO........OAAO..',
    '..OOO..........OO...',
    '....................',
    '....................',
  ],
  heart: [
    '................',
    '..OOOO....OOOO..',
    '.ORRRRO..ORRRRO.',
    'ORWWRRROORRRRRO.',
    'ORWRRRRRRRRRRRDO',
    'ORRRRRRRRRRRRRDO',
    'ORRRRRRRRRRRRDO.',
    '.ORRRRRRRRRRDDO.',
    '..ORRRRRRRRDDO..',
    '...ORRRRRRDDO...',
    '....ORRRRDDO....',
    '.....ORRDDO.....',
    '......ORDO......',
    '.......OO.......',
    '................',
    '................',
  ],
  cloud0: [
    '.......OOOOOO.......',
    '.....OOCLLLLCOO.....',
    '....OCLLMMMMMMDO....',
    '..OOOLMMMMMMMMMDOO..',
    '.OCLLMMMMMYYMMMMDDO.',
    'OCLMMMMMMYYYYMMMMDDO',
    'OLMMMMMMMYYYYMMMMDDO',
    'ODMMMMMMMMYYMMMMDDDO',
    '.ODDDDDDDDDDDDDDDDO.',
    '..OOOOOOOYBOOOOOOO..',
    '........OYBO........',
    '.......OYBBO........',
    '........OYYBO.......',
    '.........OYBO.......',
    '........OYO.........',
    '........OO..........',
  ],
  cloud1: [
    '.......OOOOOO.......',
    '.....OOCLLLLCOO.....',
    '....OCLLMMMMMMDO....',
    '..OOOLMMMMMMMMMDOO..',
    '.OCLLMMMMMYYMMMMDDO.',
    'OCLMMMMMMYYYYMMMMDDO',
    'OLMMMMMMMYYYYMMMMDDO',
    'ODMMMMMMMMYYMMMMDDDO',
    '.ODDDDDDDDDDDDDDDDO.',
    '..OOOOOOOBYOOOOOOO..',
    '.........OBYO.......',
    '........OBBYO.......',
    '.......OBYYO........',
    '........OBYO........',
    '.........OYO........',
    '..........OO........',
  ],
  storm_orb0: [
    '......OOOOOO......',
    '....OOVVVVVVOO....',
    '...OVVMMMMMMVVO...',
    '..OVMMCCCCCCMMVO..',
    '.OVMMCCWWWWCCMMVO.',
    '.OVMCWWBBBBWWCMVO.',
    'OVVMCWBBBBBBWCMVVO',
    'OVVMCWBBWWBBWCMVVO',
    'OVVMCWBBBBBBWCMVVO',
    '.OVMCWWBBBBWWCMVO.',
    '.OVMMCCWWWWCCMMVO.',
    '..OVMMCCCCCCMMVO..',
    '...OVVMMMMMMVVO...',
    '....OOVVVVVVOO....',
    '......OOOOOO......',
    '..................',
  ],
  storm_orb1: [
    '....OO......OO....',
    '....OOVVVVVVOO....',
    '...OVVMMMMMMVVO...',
    '..OVMMCCCCCCMMVO..',
    '.OVMMCCWWWWCCMMVO.',
    '.OVMCWWBBBBWWCMVO.',
    'OVVMCWBBBBBBWCMVVO',
    'OVVMCWBBWWBBWCMVVO',
    'OVVMCWBBBBBBWCMVVO',
    '.OVMCWWBBBBWWCMVO.',
    '.OVMMCCWWWWCCMMVO.',
    '..OVMMCCCCCCMMVO..',
    '...OVVMMMMMMVVO...',
    '....OOVVVVVVOO....',
    '....OO......OO....',
    '..................',
  ],
  comet: [
    '......................',
    '....OOOO..............',
    '..OOCWWCOO............',
    '.OCWWWWWCCORRR........',
    'OCWWWWWWCCYYYYYY......',
    'OCWWWWWWWCCGGGGGGG....',
    'OCWWWWWWCCBBBBBBBBB...',
    '.OCWWWWWCCVVVVVVV.....',
    '..OOCWWCOO............',
    '....OOOO..............',
    '......................',
    '......................',
  ],
  void_meteor0: [
    '......................',
    '....OOOOOO............',
    '..OODMMMMDOO..........',
    '.ODMMLLMMMMDOOFFFF....',
    'ODMMLFFMMMMMDOYYYYFF..',
    'ODMMMFFMMFFMDOOYYYYYFF',
    'ODMMMMMMFFMMDOOOYYYYFF',
    'ODDDMMMMMMMDDOOFFFFF..',
    '.OODDDDDDDDDOO........',
    '...OOOOOOOOOO.........',
    '......................',
    '......................',
  ],
  void_meteor1: [
    '......................',
    '....OOOOOO............',
    '..OODMMMMDOO..........',
    '.ODMMLLMMMMDOOYYFFF...',
    'ODMMLFFMMMMMDOYYYYYFF.',
    'ODMMMFFMMFFMDOOYYYYFFF',
    'ODMMMMMMFFMMDOOOYYYFF.',
    'ODDDMMMMMMMDDOOFFFF...',
    '.OODDDDDDDDDOO........',
    '...OOOOOOOOOO.........',
    '......................',
    '......................',
  ],
};

function resolveEntityPixelColor(kind: string, code: string): string | null {
  if (code === '.') return null;
  if (code === 'O') return '#0e1026';
  if (code === 'W') return '#ffffff';

  if (kind === 'star' || kind === 'bigstar') {
    switch (code) {
      case 'Y': return '#ffe066';
      case 'A': return '#f59e0b';
      case 'C': return '#7ce8ff';
      default: return '#ffd566';
    }
  }
  if (kind === 'heart') {
    switch (code) {
      case 'R': return '#fb7185';
      case 'D': return '#be123c';
      default: return '#fda4af';
    }
  }
  if (kind.startsWith('cloud')) {
    switch (code) {
      case 'C': return '#93c5fd';
      case 'L': return '#64748b';
      case 'M': return '#334155';
      case 'D': return '#1e293b';
      case 'Y': return '#fde047';
      case 'B': return '#38bdf8';
      default: return '#475569';
    }
  }
  if (kind.startsWith('storm_orb')) {
    switch (code) {
      case 'V': return '#581c87';
      case 'M': return '#a855f7';
      case 'C': return '#f0abfc';
      case 'B': return '#38bdf8';
      default: return '#c084fc';
    }
  }
  if (kind === 'comet') {
    switch (code) {
      case 'C': return '#7ce8ff';
      case 'R': return '#ff70a6';
      case 'Y': return '#ffd566';
      case 'G': return '#56e39f';
      case 'B': return '#38bdf8';
      case 'V': return '#c084fc';
      default: return '#ffffff';
    }
  }
  if (kind.startsWith('void_meteor')) {
    switch (code) {
      case 'D': return '#291529';
      case 'M': return '#4a2538';
      case 'L': return '#78485a';
      case 'F': return '#ff6b35';
      case 'Y': return '#ffd166';
      default: return '#ff9f43';
    }
  }
  return '#ffffff';
}

function paintEntityGridDirect(
  ctx: CanvasRenderingContext2D,
  gridKey: string,
  px: number,
  ox: number,
  oy: number,
): void {
  const grid = ENTITY_GRIDS[gridKey];
  if (!grid) return;
  for (let r = 0; r < grid.length; r++) {
    const line = grid[r];
    let c = 0;
    while (c < line.length) {
      const ch = line[c];
      const color = resolveEntityPixelColor(gridKey, ch);
      if (!color) {
        c += 1;
        continue;
      }
      let end = c + 1;
      while (end < line.length && line[end] === ch) end += 1;
      ctx.fillStyle = color;
      ctx.fillRect(ox + c * px, oy + r * px, (end - c) * px, px);
      c = end;
    }
  }
}

function getCachedEntityStamp(gridKey: string, px: number): HTMLCanvasElement | null {
  const step = Math.max(2, px);
  const cacheKey = `${gridKey}|${step}`;
  const cached = ENTITY_STAMP_CACHE.get(cacheKey);
  if (cached) return cached;

  const grid = ENTITY_GRIDS[gridKey];
  if (!grid) return null;
  const cols = grid[0]?.length ?? 16;
  const rows = grid.length;
  const created = createCachedCanvas(cols * step, rows * step);
  if (!created) return null;
  const { canvas, ctx } = created;
  ctx.imageSmoothingEnabled = false;
  paintEntityGridDirect(ctx, gridKey, step, 0, 0);
  lruSet(ENTITY_STAMP_CACHE, cacheKey, canvas, 64);
  return canvas;
}

export class SkyHopRenderer implements ISkyHopRenderer {
  private rigSynthesizer: IOfflineSpriteRigSynthesizer | null = null;
  private manifest: AtlasManifest | null = null;
  private getArenaImage: ((id: BiomeId | 'skyhop') => HTMLImageElement | null) | null = null;
  private getSheetImage: ((sheetId: string) => HTMLImageElement | null) | null = null;

  // Fixed-size preallocated slipstream pool (zero GC churn during flight!)
  private readonly trail: SlipstreamSample[] = Array.from({ length: MAX_TRAIL_SAMPLES }, () => ({
    x: 0,
    y: 0,
    age: 0,
    dash: false,
    frame: null,
    active: false,
  }));
  private trailWriteIdx = 0;
  private localTime = 0;
  private trailAccum = 0;
  private cloudScroll = 0;
  private viewportW = 960;
  private viewportH = 540;

  constructor(options?: { rigSynthesizer?: IOfflineSpriteRigSynthesizer | null }) {
    this.rigSynthesizer = options?.rigSynthesizer ?? null;
  }

  setRigSynthesizer(synth: IOfflineSpriteRigSynthesizer | null): void {
    this.rigSynthesizer = synth;
  }

  attachAssets(
    manifest: AtlasManifest | null,
    getArenaImage?: ((id: BiomeId | 'skyhop') => HTMLImageElement | null) | null,
    getSheetImage?: ((sheetId: string) => HTMLImageElement | null) | null,
  ): void {
    this.manifest = manifest;
    this.getArenaImage = getArenaImage ?? null;
    this.getSheetImage = getSheetImage ?? null;
  }

  update(state: SkyHopState, dtSeconds: number): void {
    const dt = Number.isFinite(dtSeconds) ? clamp(dtSeconds, 0, 0.05) : 0;
    this.localTime += dt;
    const isDashing = state.dashTimer > 0;
    this.cloudScroll += dt * (isDashing ? 2.6 : 1.0);

    const drift = dt * (isDashing ? 380 : 190);
    for (let i = 0; i < MAX_TRAIL_SAMPLES; i++) {
      const s = this.trail[i];
      if (!s.active) continue;
      s.age += dt;
      s.x -= drift;
      if (s.age > 0.38 || s.x < -40) {
        s.active = false;
      }
    }

    this.trailAccum += dt;
    if (this.trailAccum >= 0.024) {
      this.trailAccum = 0;
      const frame = SpriteAssetLoader.selectFrame(state.partnerFrames, state.elapsedSeconds);
      const slot = this.trail[this.trailWriteIdx];
      slot.x = state.playerX;
      slot.y = state.playerY;
      slot.age = 0;
      slot.dash = isDashing;
      slot.frame = frame;
      slot.active = true;
      this.trailWriteIdx = (this.trailWriteIdx + 1) % MAX_TRAIL_SAMPLES;
    }
  }

  render(backend: IRenderBackend, state: SkyHopState): void {
    const reducedMotion = Boolean(state.reducedMotion || backend.capabilities.reducedMotion);
    const motion = reducedMotion ? 0.22 : 1.0;
    const t = state.elapsedSeconds || this.localTime;
    const isDashing = state.dashTimer > 0;
    const skyIdx = Math.abs(state.skyIndex) % SKYHOP_PALETTES.length;
    const palette = SKYHOP_PALETTES[skyIdx] ?? SKYHOP_PALETTES[0];

    const vp = typeof backend.getViewportSize === 'function' ? backend.getViewportSize() : null;
    if (vp && vp.width > 0 && vp.height > 0) {
      this.viewportW = vp.width;
      this.viewportH = vp.height;
    } else {
      const ctx2d = backend.getCanvas2DContext();
      if (ctx2d?.canvas) {
        const dpr = Math.max(1, backend.capabilities.dpr || 1);
        const cw = ctx2d.canvas.clientWidth || ctx2d.canvas.width / dpr;
        const ch = ctx2d.canvas.clientHeight || ctx2d.canvas.height / dpr;
        if (cw > 0 && ch > 0) {
          this.viewportW = cw;
          this.viewportH = ch;
        }
      } else if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) {
        this.viewportW = window.innerWidth;
        this.viewportH = window.innerHeight;
      }
    }

    const w = this.viewportW;
    const h = this.viewportH;
    const scaleX = w / SKYHOP_LOGICAL_W;
    const scaleY = h / SKYHOP_LOGICAL_H;

    const baseGrade = getBiomeVisualProfile('peak').colorGrade;
    backend.setColorGrade({
      ...baseGrade,
      ambientStrength: isDashing ? 0.94 : 0.86,
      bloomIntensity: isDashing ? 0.46 : 0.30,
      vignetteStrength: isDashing ? 0.26 : 0.18,
    });
    backend.setCanopyConfig({
      enabled: false,
      sunbeamIntensity: 0,
      sunbeamAngle: -0.4,
      sunbeamColor: [1, 0.95, 0.8],
      cloudSpeedX: 0,
      cloudSpeedY: 0,
      cloudOpacity: 0,
    });
    backend.setWaterConfig({
      enabled: false,
      time: t,
      skyTopColor: [0.08, 0.16, 0.4],
      skyBottomColor: [0.3, 0.56, 0.84],
      starlightIntensity: 0.5,
      waveAmplitude: 0.4,
      foamColor: [0.9, 0.96, 1],
    });

    const shakeAmp = state.shakeTimer > 0 ? 5.5 : isDashing ? 2.0 : 0;
    backend.setCamera({
      x: 0,
      y: 0,
      zoom: isDashing && !reducedMotion ? 1.02 : 1,
      rotation: reducedMotion ? 0 : state.bankAngle * 0.04,
      shakeX: shakeAmp > 0 && !reducedMotion ? Math.sin(this.localTime * 46) * shakeAmp : 0,
      shakeY: shakeAmp > 0 && !reducedMotion ? Math.cos(this.localTime * 39) * shakeAmp * 0.8 : 0,
    });

    const skyArena = this.getArenaImage?.('skyhop') ?? null;
    const fallbackSheet = this.getSheetImage?.('fallbacks') ?? null;

    backend.drawCustom2D((ctx, cw, ch) => {
      this.viewportW = cw;
      this.viewportH = ch;
      const sx = cw / SKYHOP_LOGICAL_W;
      const sy = ch / SKYHOP_LOGICAL_H;
      ctx.imageSmoothingEnabled = false;

      // 1. Pre-cached Dithered Twilight-to-Starlight Sky Panorama (1 drawImage, zero per-frame gradients!)
      const cachedSky = getCachedSkyPanorama(skyIdx, palette, cw, ch, skyArena);
      if (cachedSky) {
        ctx.drawImage(cachedSky, 0, 0, cw, ch);
      } else {
        ctx.fillStyle = palette.top;
        ctx.fillRect(0, 0, cw, ch);
      }

      // 2. Delicate Vertical Starlight Aurora Shimmer Rays (no flat horizontal stripes blocking the moon!)
      this.drawVerticalAuroraShimmer(ctx, cw, ch, palette.accent, t, motion, isDashing);

      // 3. Twinkling Pixel Starfield (stretches into luminous speed-streaks during Star Dash)
      for (let i = 0; i < SKY_STARS.length; i++) {
        const st = SKY_STARS[i];
        const starX = ((((st.bx - this.cloudScroll * st.speed) % 1) + 1) % 1) * cw;
        const starY = st.by * ch;
        const twinkle = reducedMotion ? 0.75 : 0.35 + 0.65 * Math.sin(t * 2.6 + st.phase);
        const rx = Math.round(starX);
        const ry = Math.round(starY);
        ctx.fillStyle = `rgba(244, 249, 255, ${(0.28 + twinkle * 0.68).toFixed(3)})`;
        if (isDashing) {
          ctx.fillRect(rx - 20, ry, 28, 2);
        } else if (st.big) {
          ctx.fillRect(rx - 2, ry, 5, 1);
          ctx.fillRect(rx, ry - 2, 1, 5);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rx, ry, 1, 1);
        } else {
          ctx.fillRect(rx, ry, 2, 2);
        }
      }

      // 4. Cached Seamless Parallax Floating Sky Islands (2 drawImage blits!)
      const islandStrip = getCachedFloatingIslandsStrip(skyIdx, palette.accent, cw, ch);
      if (islandStrip) {
        const iw = islandStrip.width;
        const offset = Math.round(((this.cloudScroll * cw * 0.08) % iw + iw) % iw);
        const iy = Math.round(ch * 0.56);
        ctx.drawImage(islandStrip, -offset, iy);
        ctx.drawImage(islandStrip, iw - offset, iy);
      }

      // 5. Cached Seamless Mid-Distance Sculpted Pixel Cloud Sea (2 drawImage blits!)
      const midClouds = getCachedCloudSeaStrip('mid', skyIdx, palette.accent, cw, ch);
      if (midClouds) {
        const mw = midClouds.width;
        const offset = Math.round(((this.cloudScroll * cw * 0.16) % mw + mw) % mw);
        const my = ch - midClouds.height - Math.round(ch * 0.04);
        ctx.save();
        ctx.globalAlpha = 0.78;
        ctx.drawImage(midClouds, -offset, my);
        ctx.drawImage(midClouds, mw - offset, my);
        ctx.restore();
      }

      // 6. Star Dash Prismatic Speed Tunnel
      if (isDashing) {
        this.drawStarDashTunnel(ctx, cw, ch, state.playerX * sx, state.playerY * sy, state.bankAngle, reducedMotion);
      }

      // 7. Entities (High-Craft Cached Pixel-Art Stamps for Stars, Comets, Thunderclouds, Orbs, Meteors, Hearts)
      for (let i = 0; i < state.entities.length; i++) {
        this.drawEntity(ctx, cw, ch, sx, sy, state.entities[i], t, reducedMotion);
      }

      // 8. World Particles (all 4 V1 shapes: 'ring', 'star', rotated 'spark', and 'dot'!)
      for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        const progress = clamp(p.life / Math.max(0.05, p.maxLife), 0, 1);
        const alpha = clamp(1 - progress, 0, 1);
        const pxX = Math.round(p.x * sx);
        const pyY = Math.round(p.y * sy);
        const rad = Math.max(2, Math.round((p.maxSize ? p.size + (p.maxSize - p.size) * progress : p.size) * sx));
        ctx.save();
        ctx.globalAlpha = alpha;
        if (p.shape === 'ring') {
          ctx.fillStyle = p.color;
          const pts = 20;
          for (let k = 0; k < pts; k++) {
            const a = (k / pts) * Math.PI * 2;
            ctx.fillRect(Math.round(pxX + Math.cos(a) * rad), Math.round(pyY + Math.sin(a) * rad), 3, 3);
          }
        } else if (p.shape === 'star') {
          // Crisp pixel 4-point cross-star + diagonal core with white glint (V1 star burst parity!)
          const arm = Math.max(3, Math.round(rad * (1 - progress * 0.35)));
          const core = Math.max(2, Math.round(arm * 0.42));
          ctx.fillStyle = p.color;
          ctx.fillRect(pxX - arm, pyY - 1, arm * 2 + 1, 2);
          ctx.fillRect(pxX - 1, pyY - arm, 2, arm * 2 + 1);
          ctx.fillRect(pxX - core, pyY - core, core * 2, core * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(pxX - 1, pyY - 1, 2, 2);
        } else if (p.shape === 'spark') {
          // Velocity-aligned rotated pixel spark streak (V1 spark trail/shatter parity!)
          const len = Math.max(4, Math.round(rad * 2.2 * (1 - progress * 0.45)));
          ctx.translate(pxX, pyY);
          ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(-len * 0.5), -1, len, 3);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.round(-len * 0.25), 0, Math.max(2, Math.round(len * 0.5)), 1);
        } else {
          const d = Math.max(2, Math.round(rad * (1 - progress * 0.5)));
          ctx.fillStyle = p.color;
          ctx.fillRect(pxX - Math.floor(d * 0.5), pyY - Math.floor(d * 0.5), d, d);
        }
        ctx.restore();
      }

      // 8b. V1 Wave 5+ gentle crosswind drift streaks across flight lane
      if (state.wave >= 5 && !reducedMotion) {
        ctx.fillStyle = 'rgba(200, 238, 255, 0.22)';
        for (let i = 0; i < 6; i++) {
          const wy = Math.round(((i + 0.5) / 6) * ch * 0.78 + ch * 0.08);
          const wx = Math.round((cw - ((t * 360 + i * 210) % (cw + 80))) % (cw + 80));
          ctx.fillRect(wx, wy, 44, 2);
        }
      }

      // 9. Crisp Starlight Pixel Slipstream Afterimages & Speed Sparks
      this.drawSlipstreamAfterimages(ctx, sx, sy, state);

      // 10. Animated Lead Pokémon Sprite + V1 Protective Type/Dash Ring & Translucent Invuln Blink
      const px = Math.round(state.playerX * sx);
      const py = Math.round(state.playerY * sy);
      const spriteSize = Math.round(Math.max(48, Math.min(cw, ch) * 0.132));

      // Pixel-stepped Magnet aura ring (rotating cyan pixel beads)
      if (state.magnetTimer > 0) {
        const ringR = spriteSize * 0.76;
        ctx.fillStyle = 'rgba(124, 232, 255, 0.85)';
        for (let k = 0; k < 12; k++) {
          const a = t * 3.2 * motion + (k / 12) * Math.PI * 2;
          const mx = Math.round(px + Math.cos(a) * ringR);
          const my = Math.round(py + Math.sin(a) * ringR);
          ctx.fillRect(mx - 2, my - 2, 4, 4);
        }
      }

      // V1 Parity: translucent 0.45 alpha blink on hitInvulnTimer (keeps partner visible while dodging!)
      const invulnBlink = state.hitInvulnTimer > 0 && Math.floor(state.hitInvulnTimer * 14) % 2 === 0;
      ctx.save();
      if (invulnBlink) {
        ctx.globalAlpha = 0.45;
      }
      this.drawPartnerSprite(ctx, px, py, spriteSize, state, fallbackSheet, reducedMotion);
      ctx.restore();

      // 11. Cached Seamless Near Foreground Cloud Billows (2 drawImage blits!)
      const nearClouds = getCachedCloudSeaStrip('near', skyIdx, palette.accent, cw, ch);
      if (nearClouds) {
        const nw = nearClouds.width;
        const offset = Math.round(((this.cloudScroll * cw * 0.30) % nw + nw) % nw);
        const ny = ch - nearClouds.height + Math.round(ch * 0.03);
        ctx.save();
        ctx.globalAlpha = 0.86;
        ctx.drawImage(nearClouds, -offset, ny);
        ctx.drawImage(nearClouds, nw - offset, ny);
        ctx.restore();
      }

      // 12. V1 Parity On-Canvas Sky Biome Pill + Wave 5+ Crosswind Indicator + Paused Overlay (Zero Emojis!)
      this.drawSkyBiomeBadge(ctx, ch, palette.name, palette.accent, state.wave >= 5);
      if (state.paused && !state.gameOver) {
        this.drawPausedOverlay(ctx, cw, ch);
      }
    }, 'world');

    // Deferred PointLights & Additive Particles (budgeted for 60+ FPS!)
    const partnerRgb = TYPE_PALETTES[state.partnerType]?.rgb ?? [0.48, 0.91, 1.0];
    backend.addPointLight({
      id: 'skyhop-player-light',
      x: state.playerX * scaleX,
      y: state.playerY * scaleY,
      radius: isDashing ? 225 : 150,
      color: isDashing ? [0.55, 0.94, 1.0] : partnerRgb,
      intensity: isDashing ? 1.5 : 1.05,
      screenSpace: true,
    });

    const trailParticles = isDashing ? 5 : 2;
    for (let i = 0; i < trailParticles; i++) {
      backend.drawParticle({
        x: state.playerX * scaleX - 20 - i * 12,
        y: state.playerY * scaleY + Math.sin(this.localTime * 12 + i) * 6,
        radius: isDashing ? 10 - i : 6,
        color: isDashing ? [0.52, 0.95, 1.0, 0.72] : [1.0, 0.86, 0.45, 0.56],
        additive: true,
        stretchX: isDashing ? 2.4 : 1.5,
        stretchY: 0.65,
        rotation: state.bankAngle,
      });
    }

    let lightBudget = 1;
    for (let i = 0; i < state.entities.length; i++) {
      const ent = state.entities[i];
      const ex = clamp(ent.x, 0, SKYHOP_LOGICAL_W) * scaleX;
      const ey = ent.y * scaleY;

      if (lightBudget < 16) {
        lightBudget += 1;
        if (ent.kind === 'star' || ent.kind === 'bigstar' || ent.kind === 'comet') {
          backend.addPointLight({
            id: `sh-light-${ent.id}`,
            x: ex,
            y: ey,
            radius: ent.kind === 'bigstar' ? 120 : 88,
            color: ent.kind === 'comet' ? [0.65, 0.92, 1.0] : [1.0, 0.88, 0.42],
            intensity: 0.98,
            flickerSpeed: 5.5,
            flickerAmount: 0.14,
            screenSpace: true,
          });
        } else if (ent.kind === 'storm_orb' || ent.kind === 'cloud') {
          backend.addPointLight({
            id: `sh-light-${ent.id}`,
            x: ex,
            y: ey,
            radius: 122,
            color: [0.76, 0.42, 1.0],
            intensity: 1.08,
            screenSpace: true,
          });
        } else if (ent.kind === 'void_meteor') {
          backend.addPointLight({
            id: `sh-light-${ent.id}`,
            x: ex,
            y: ey,
            radius: 130,
            color: [1.0, 0.42, 0.18],
            intensity: 1.25,
            flickerSpeed: 8.5,
            flickerAmount: 0.2,
            screenSpace: true,
          });
        } else if (ent.kind === 'heart') {
          backend.addPointLight({
            id: `sh-light-${ent.id}`,
            x: ex,
            y: ey,
            radius: 105,
            color: [1.0, 0.45, 0.72],
            intensity: 1.05,
            screenSpace: true,
          });
        }
      }

      if (ent.kind === 'comet' || ent.kind === 'void_meteor') {
        backend.drawParticle({
          x: ex + 18,
          y: ey,
          radius: 7,
          color: ent.kind === 'comet' ? [0.55, 0.92, 1.0, 0.76] : [1.0, 0.48, 0.18, 0.78],
          additive: true,
          stretchX: 2.0,
          stretchY: 0.7,
        });
      }
    }
  }

  private drawPartnerSprite(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    state: SkyHopState,
    fallbackSheet: HTMLImageElement | null,
    reducedMotion: boolean,
  ): void {
    const sp = getSpeciesEntry(state.partnerSpeciesId);
    const frameCanvas = SpriteAssetLoader.selectFrame(state.partnerFrames, state.elapsedSeconds);
    const pal = TYPE_PALETTES[sp.type] ?? TYPE_PALETTES.normal;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(reducedMotion ? 0 : state.bankAngle);
    ctx.imageSmoothingEnabled = false;

    // Cached glowing backing aura (zero per-frame createRadialGradient!)
    const [gr, gg, gb] = hexToRgb255(state.dashTimer > 0 ? '#fde047' : pal.glow);
    const auraSprite = getCachedGlowSprite(
      state.dashTimer > 0 ? 'rgba(253, 224, 71, 0.56)' : `rgba(${gr}, ${gg}, ${gb}, 0.34)`,
      state.dashTimer > 0 ? 'rgba(124, 232, 255, 0.24)' : `rgba(${gr}, ${gg}, ${gb}, 0.12)`,
    );
    if (auraSprite) {
      const auraR = Math.round(size * (state.dashTimer > 0 ? 0.86 : 0.76));
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(auraSprite, -auraR, -auraR, auraR * 2, auraR * 2);
      ctx.restore();
    }

    // V1 Parity: Crisp pixel-stepped type-colored Shield / Golden Star Dash Halo ring around flying partner
    const ringR = Math.round(size * (state.dashTimer > 0 ? 0.64 : 0.54));
    const ringColor = state.dashTimer > 0 ? '#fde047' : pal.glow;
    const ringPts = 24;
    ctx.fillStyle = ringColor;
    for (let k = 0; k < ringPts; k++) {
      const a = (k / ringPts) * Math.PI * 2;
      const rx = Math.round(Math.cos(a) * ringR);
      const ry = Math.round(Math.sin(a) * ringR);
      ctx.fillRect(rx - 1, ry - 1, state.dashTimer > 0 ? 3 : 2, state.dashTimer > 0 ? 3 : 2);
    }

    if (frameCanvas && frameCanvas.width > 0 && frameCanvas.height > 0) {
      const scale = Math.min(size / frameCanvas.width, size / frameCanvas.height);
      const dw = Math.round(frameCanvas.width * scale);
      const dh = Math.round(frameCanvas.height * scale);
      ctx.scale(-1, 1);
      const contour = getSpriteSilhouetteContour(frameCanvas);
      if (contour) {
        const padX = Math.max(1, Math.round((SILHOUETTE_CONTOUR_PAD * dw) / frameCanvas.width));
        const padY = Math.max(1, Math.round((SILHOUETTE_CONTOUR_PAD * dh) / frameCanvas.height));
        ctx.drawImage(
          contour,
          Math.round(-dw * 0.5) - padX,
          Math.round(-dh * 0.5) - padY,
          dw + padX * 2,
          dh + padY * 2,
        );
      }
      ctx.drawImage(frameCanvas, Math.round(-dw * 0.5), Math.round(-dh * 0.5), dw, dh);
      ctx.restore();
      return;
    }

    if (this.rigSynthesizer) {
      const rig: OfflineRigDescriptor = {
        speciesId: sp.id,
        name: sp.name,
        primaryType: sp.type,
        archetype: sp.archetype,
        colorHex: sp.color,
        shiny: state.partnerShiny,
      };
      this.rigSynthesizer.renderRig(ctx, rig, {
        cx: 0,
        cy: 0,
        size,
        time: this.localTime,
        facing: 'right',
        rimColor: state.dashTimer > 0 ? '#7ce8ff' : pal.glow,
        reducedMotion,
      });
      ctx.restore();
      return;
    }

    const fbRegion = this.manifest?.sheets?.fallbacks?.regions?.[sp.archetype];
    if (fallbackSheet && fbRegion) {
      ctx.drawImage(
        fallbackSheet,
        fbRegion.x,
        fbRegion.y,
        fbRegion.w,
        fbRegion.h,
        Math.round(-size * 0.5),
        Math.round(-size * 0.5),
        size,
        size,
      );
    } else {
      drawPixelArchetypeSprite(
        ctx,
        sp.id,
        Math.round(-size * 0.5),
        Math.round(-size * 0.5),
        size,
        state.partnerShiny,
      );
    }

    ctx.restore();
  }

  /**
   * Fine shimmering pixel stardust filaments drifting gently along the upper aurora
   * (zero blocky rectangular curtains — lets skyhop.png's painted aurora & crescent moon shine!).
   */
  private drawVerticalAuroraShimmer(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    accentHex: string,
    t: number,
    motion: number,
    isDashing: boolean,
  ): void {
    const [r, g, b] = hexToRgb255(accentHex);
    const count = isDashing ? 18 : 12;
    const baseAlpha = isDashing ? 0.55 : 0.34;
    for (let i = 0; i < count; i++) {
      const frac = ((i / count + 0.36 + Math.sin(t * 0.25 * motion + i) * 0.02) % 1);
      const sx = Math.round(frac * cw);
      const sy = Math.round(ch * (0.06 + ((i * 29) % 100) * 0.0028 + Math.sin(t * 1.4 * motion + i * 2.1) * 0.015));
      const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(t * 2.2 * motion + i * 1.7));
      const alpha = baseAlpha * twinkle;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
      ctx.fillRect(sx - 2, sy, 5, 1);
      ctx.fillRect(sx, sy - 4, 1, 9);
      ctx.fillStyle = `rgba(235, 252, 255, ${(alpha * 1.35).toFixed(3)})`;
      ctx.fillRect(sx, sy, 1, 1);
    }
  }

  private drawStarDashTunnel(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cx: number,
    cy: number,
    bankAngle: number,
    reducedMotion: boolean,
  ): void {
    ctx.save();
    const colors = ['rgba(124, 232, 255, 0.52)', 'rgba(255, 213, 102, 0.45)', 'rgba(232, 121, 249, 0.42)'];
    const lineCount = reducedMotion ? 8 : 14;
    for (let i = 0; i < lineCount; i++) {
      const sy = Math.round(((i + 0.5) / lineCount) * h);
      const len = 56 + ((i * 37) % 88);
      const lx = Math.round((w - ((this.localTime * 960 + i * 140) % (w + len))) % (w + len));
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(lx, sy, len, 3);
    }

    // Cached radial cone glow (zero per-frame createRadialGradient!)
    const coneSprite = getCachedGlowSprite('rgba(255, 255, 255, 0.52)', 'rgba(124, 232, 255, 0.28)');
    if (coneSprite) {
      ctx.translate(cx - 12, cy);
      ctx.rotate(bankAngle);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(coneSprite, -110, -44, 220, 88);
    }
    ctx.restore();
  }

  private drawSlipstreamAfterimages(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    state: SkyHopState,
  ): void {
    const isDashing = state.dashTimer > 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < MAX_TRAIL_SAMPLES; i++) {
      const sample = this.trail[i];
      if (!sample.active) continue;
      const lifeFrac = clamp(1 - sample.age / 0.38, 0, 1);
      const dashMode = sample.dash || isDashing;
      const alpha = lifeFrac * (dashMode ? 0.52 : 0.30);
      const ax = Math.round(sample.x * sx);
      const ay = Math.round(sample.y * sy);
      ctx.globalAlpha = alpha;
      if (sample.frame && i % 3 === 0) {
        const s = 34;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.scale(-1, 1);
        ctx.drawImage(sample.frame, -s * 0.5, -s * 0.5, s, s);
        ctx.restore();
      } else {
        // Crisp pixel cross-star & tapered ribbon spark (never square smudges!)
        const px = dashMode ? 3 : 2;
        ctx.fillStyle = dashMode ? '#7ce8ff' : '#ffe066';
        ctx.fillRect(ax - px * 2, ay, px * 5, px);
        ctx.fillRect(ax, ay - px, px, px * 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ax, ay, px, px);
      }
    }
    ctx.restore();
  }

  private drawEntity(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    sx: number,
    sy: number,
    ent: SkyHopEntity,
    t: number,
    reducedMotion: boolean,
  ): void {
    // Crisp pixel-framed warning chevron badge when Void Meteor approaches off-screen
    if (ent.kind === 'void_meteor' && ent.x > SKYHOP_LOGICAL_W - 14) {
      const wy = clamp(Math.round(ent.y * sy), 24, ch - 24);
      const wx = cw - 26;
      const blink = Math.floor(t * 10) % 2 === 0;
      ctx.save();
      ctx.fillStyle = '#0e1026';
      ctx.fillRect(wx - 13, wy - 13, 26, 26);
      ctx.fillStyle = blink ? '#ff4d6d' : '#ffd566';
      ctx.fillRect(wx - 11, wy - 11, 22, 22);
      ctx.fillStyle = '#1c0a24';
      ctx.fillRect(wx - 9, wy - 9, 18, 18);
      ctx.fillStyle = blink ? '#ffe066' : '#ff6b6b';
      ctx.fillRect(wx - 2, wy - 6, 4, 7);
      ctx.fillRect(wx - 2, wy + 3, 4, 4);
      ctx.restore();
      return;
    }

    const ex = Math.round(ent.x * sx);
    const ey = Math.round(ent.y * sy);
    const r = Math.max(12, Math.round(ent.radius * Math.min(sx, sy)));
    const idSeed = hashEntityId(ent.id);
    const animBit = reducedMotion ? 0 : Math.floor(t * 6 + idSeed) & 1;

    // Pick cached pixel-art stamp key and crisp pixel unit size
    let gridKey: string = ent.kind;
    let targetPx = Math.max(2, Math.round((r * 2.15) / 16));
    let glowHex = '#ffd566';

    if (ent.kind === 'bigstar') {
      gridKey = 'bigstar';
      targetPx = Math.max(2, Math.round((r * 2.35) / 20));
      glowHex = '#ffe066';
    } else if (ent.kind === 'star') {
      gridKey = 'star';
      targetPx = Math.max(2, Math.round((r * 2.15) / 16));
      glowHex = '#ffd566';
    } else if (ent.kind === 'comet') {
      gridKey = 'comet';
      targetPx = Math.max(2, Math.round((r * 2.4) / 14));
      glowHex = '#7ce8ff';
    } else if (ent.kind === 'cloud') {
      gridKey = animBit === 0 ? 'cloud0' : 'cloud1';
      targetPx = Math.max(2, Math.round((r * 2.35) / 16));
      glowHex = '#a855f7';
    } else if (ent.kind === 'storm_orb') {
      gridKey = animBit === 0 ? 'storm_orb0' : 'storm_orb1';
      targetPx = Math.max(2, Math.round((r * 2.2) / 16));
      glowHex = '#c084fc';
    } else if (ent.kind === 'void_meteor') {
      gridKey = animBit === 0 ? 'void_meteor0' : 'void_meteor1';
      targetPx = Math.max(2, Math.round((r * 2.4) / 13));
      glowHex = '#ff6b35';
    } else if (ent.kind === 'heart') {
      gridKey = 'heart';
      targetPx = Math.max(2, Math.round((r * 2.1) / 14));
      glowHex = '#fb7185';
    }

    // Subtle cached halo behind collectible/hazard so it pops sharply against clouds & aurora
    const [gr, gg, gb] = hexToRgb255(glowHex);
    const glowSprite = getCachedGlowSprite(
      `rgba(${gr}, ${gg}, ${gb}, 0.36)`,
      `rgba(${gr}, ${gg}, ${gb}, 0.12)`,
    );
    if (glowSprite) {
      const grRad = Math.round(r * 1.45);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(glowSprite, ex - grRad, ey - grRad, grRad * 2, grRad * 2);
      ctx.restore();
    }

    // Blit pre-rendered high-craft pixel-art entity stamp (1 drawImage!)
    const stamp = getCachedEntityStamp(gridKey, targetPx);
    if (stamp) {
      const bob = reducedMotion ? 0 : Math.round(Math.sin(t * 4.2 + idSeed) * 2);
      ctx.drawImage(
        stamp,
        Math.round(ex - stamp.width * 0.5),
        Math.round(ey - stamp.height * 0.5 + bob),
      );
    } else {
      const grid = ENTITY_GRIDS[gridKey];
      if (grid) {
        const w = (grid[0]?.length ?? 16) * targetPx;
        const h = grid.length * targetPx;
        paintEntityGridDirect(ctx, gridKey, targetPx, Math.round(ex - w * 0.5), Math.round(ey - h * 0.5));
      }
    }

    // Extra twinkling orbital cross-sparkle on bigstar / comet
    if (!reducedMotion && (ent.kind === 'bigstar' || ent.kind === 'comet')) {
      const a = t * 4.5 + idSeed;
      const sxp = Math.round(ex + Math.cos(a) * r * 1.05);
      const syp = Math.round(ey + Math.sin(a) * r * 0.85);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sxp - 2, syp, 5, 1);
      ctx.fillRect(sxp, syp - 2, 1, 5);
    }
  }

  /**
   * V1 Parity On-Canvas Sky Biome Pill + Wave 5+ Crosswind Indicator (100% crisp pixel art, zero emojis!).
   * Anchored bottom-left so it never overlaps the centered top HUD bar or bottom flight controls.
   */
  private drawSkyBiomeBadge(
    ctx: CanvasRenderingContext2D,
    ch: number,
    skyName: string,
    accentHex: string,
    hasCrosswind: boolean,
  ): void {
    const label = hasCrosswind ? `${skyName}  |  WIND` : skyName;
    const h = 28;
    const x = 18;
    const y = Math.max(88, ch - h - 18);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.font = 'bold 11px monospace';
    const measuredW = typeof ctx.measureText === 'function' ? ctx.measureText(label).width : 0;
    const textW = measuredW > 0 ? Math.ceil(measuredW) : label.length * 7;
    const rightPad = hasCrosswind ? 30 : 14;
    const w = Math.max(156, Math.min(310, 26 + textW + rightPad));

    // Outer midnight ink frame + slate-indigo body + beveled accent border
    ctx.fillStyle = '#070b1c';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = 'rgba(13, 20, 48, 0.90)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(x + 2, y + 2, w - 4, 4);
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // Pixel star emblem inside pill
    const sx = x + 13;
    const sy = y + 14;
    ctx.fillStyle = accentHex;
    ctx.fillRect(sx - 4, sy - 1, 9, 2);
    ctx.fillRect(sx - 1, sy - 4, 2, 9);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx - 1, sy - 1, 2, 2);

    // Optional pixel crosswind chevron on Wave 5+
    if (hasCrosswind) {
      const cx = x + w - 16;
      const cy = y + 14;
      ctx.fillStyle = '#7ce8ff';
      ctx.fillRect(cx - 5, cy - 3, 7, 2);
      ctx.fillRect(cx - 2, cy + 1, 8, 2);
    }

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 24, y + 14);
    ctx.restore();
  }

  /**
   * V1 Parity Translucent Paused Canvas Overlay (`C:\dojo\js\minigame.js:2090-2121`, zero emojis!).
   */
  private drawPausedOverlay(ctx: CanvasRenderingContext2D, cw: number, ch: number): void {
    const cardW = 304;
    const cardH = 92;
    const cardX = Math.round((cw - cardW) * 0.5);
    const cardY = Math.round((ch - cardH) * 0.5);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = 'rgba(7, 11, 24, 0.56)';
    ctx.fillRect(0, 0, cw, ch);

    // Beveled celestial brass & slate pause frame
    ctx.fillStyle = '#070a1a';
    ctx.fillRect(cardX - 3, cardY - 3, cardW + 6, cardH + 6);
    ctx.fillStyle = 'rgba(15, 23, 52, 0.94)';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.fillStyle = 'rgba(253, 224, 71, 0.14)';
    ctx.fillRect(cardX + 2, cardY + 2, cardW - 4, 6);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.strokeRect(cardX + 1, cardY + 1, cardW - 2, cardH - 2);

    // Crisp pixel pause bars icon left of PAUSED title
    const ix = Math.round(cw * 0.5 - 52);
    const iy = cardY + 26;
    ctx.fillStyle = '#fde047';
    ctx.fillRect(ix, iy, 4, 14);
    ctx.fillRect(ix + 7, iy, 4, 14);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('PAUSED', cw * 0.5 + 10, cardY + 34);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('Press P or tap Resume to fly', cw * 0.5, cardY + 64);
    ctx.restore();
  }
}
