import {
  BIOME_IDS,
  type BattleSceneState,
  type BiomeId,
  type ElementalType,
  type IRenderBackend,
} from '../../contracts';
import {
  getBiomeVisualProfile,
  TYPE_PALETTES,
} from '../../core';

export type ArenaPedestalKind =
  | 'cobble-rune'
  | 'moss-stone'
  | 'crystal-dias'
  | 'water-mirror'
  | 'basalt-forge'
  | 'frost-mirror'
  | 'astral-marble'
  | 'sandstone-dais';

export type ArenaWeatherKind =
  | 'fireflies'
  | 'petals'
  | 'embers'
  | 'snowflakes'
  | 'starlight'
  | 'spores'
  | 'sparks'
  | 'bubbles'
  | 'dust';

export interface BattleArenaDescriptor {
  biomeId: BiomeId;
  elementalType: ElementalType;
  name: string;
  subtitle: string;
  arenaPath: string;
  skyTopHex: string;
  skyHorizonHex: string;
  groundPrimaryHex: string;
  groundSecondaryHex: string;
  accentHex: string;
  ambientGlowHex: string;
  pedestalKind: ArenaPedestalKind;
  weatherKind: ArenaWeatherKind;
  reflectionAlpha: number;
  hasWaterMirror: boolean;
}

export interface BattleCameraTransform {
  x: number;
  y: number;
  zoom: number;
  shakeX: number;
  shakeY: number;
  rotation: number;
}

export interface BattlePadAnchor {
  x: number;
  y: number;
  rx: number;
  ry: number;
  spriteCy: number;
  size: number;
}

export interface BattleStageLayout {
  width: number;
  height: number;
  horizonY: number;
  stageTopY: number;
  centerX: number;
  centerY: number;
  playerPad: BattlePadAnchor;
  enemyPad: BattlePadAnchor;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function hexToRgb255(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(num)) return [128, 160, 220];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function hexToRgb01(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb255(hex);
  return [r / 255, g / 255, b / 255];
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb255(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(3)})`;
}

export function mixHex(hexA: string, hexB: string, t: number): string {
  const k = clamp(t, 0, 1);
  const [ar, ag, ab] = hexToRgb255(hexA);
  const [br, bg, bb] = hexToRgb255(hexB);
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const b = Math.round(ab + (bb - ab) * k);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Computes diagonal 2.5D stage coordinates tuned to the 480x270 pixel-art battle
 * arenas and Celestial Glass top/bottom HUD clear zones.
 */
export function computeBattleStageLayout(width: number, height: number): BattleStageLayout {
  const w = Math.max(320, width);
  const h = Math.max(200, height);
  const minDim = Math.min(w, h);
  const isPortrait = h > w * 1.05;

  if (isPortrait) {
    const playerSize = minDim * 0.315;
    const enemySize = minDim * 0.27;
    const enemyPadY = h * 0.315;
    const playerPadY = h * 0.475;

    return {
      width: w,
      height: h,
      horizonY: h * 0.25,
      stageTopY: h * 0.28,
      centerX: w * 0.5,
      centerY: h * 0.40,
      playerPad: {
        x: w * 0.26,
        y: playerPadY,
        rx: Math.round(w * 0.17),
        ry: Math.round(h * 0.024),
        spriteCy: playerPadY - playerSize * 0.45,
        size: playerSize,
      },
      enemyPad: {
        x: w * 0.74,
        y: enemyPadY,
        rx: Math.round(w * 0.145),
        ry: Math.round(h * 0.020),
        spriteCy: enemyPadY - enemySize * 0.45,
        size: enemySize,
      },
    };
  }

  const playerSize = minDim * 0.31;
  const enemySize = minDim * 0.268;
  const playerPadY = h * 0.705;
  const enemyPadY = h * 0.575;

  return {
    width: w,
    height: h,
    horizonY: h * 0.52,
    stageTopY: h * 0.56,
    centerX: w * 0.5,
    centerY: h * 0.63,
    playerPad: {
      x: w * 0.27,
      y: playerPadY,
      rx: Math.round(w * 0.132),
      ry: Math.round(h * 0.046),
      spriteCy: playerPadY - playerSize * 0.45,
      size: playerSize,
    },
    enemyPad: {
      x: w * 0.725,
      y: enemyPadY,
      rx: Math.round(w * 0.114),
      ry: Math.round(h * 0.039),
      spriteCy: enemyPadY - enemySize * 0.45,
      size: enemySize,
    },
  };
}

export function applyCameraToContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: BattleCameraTransform,
): void {
  const cx = width * 0.5;
  const cy = height * 0.5;
  ctx.translate(cx + camera.shakeX, cy + camera.shakeY);
  if (camera.rotation !== 0) {
    ctx.rotate(camera.rotation);
  }
  if (camera.zoom !== 1) {
    ctx.scale(camera.zoom, camera.zoom);
  }
  ctx.translate(-cx - camera.x, -cy - camera.y);
}

export function applyParallaxToContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: BattleCameraTransform,
  parallaxFactor: number,
): void {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const zoomScale = 1 + (camera.zoom - 1) * clamp(0.18 + parallaxFactor * 0.68, 0.15, 1.15);
  const rotScale = camera.rotation * clamp(parallaxFactor * 0.55, 0.1, 1);
  ctx.translate(cx + camera.shakeX * parallaxFactor, cy + camera.shakeY * parallaxFactor);
  if (rotScale !== 0) {
    ctx.rotate(rotScale);
  }
  if (zoomScale !== 1) {
    ctx.scale(zoomScale, zoomScale);
  }
  ctx.translate(-cx - camera.x * parallaxFactor, -cy - camera.y * parallaxFactor);
}

export function drawPixelCrossStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  arm: number,
  pxSize: number,
  color: string,
  coreColor = '#ffffff',
): void {
  const step = Math.max(1, Math.round(pxSize));
  const sx = Math.round(cx / step) * step;
  const sy = Math.round(cy / step) * step;
  const steps = Math.max(1, Math.round(arm / step));
  ctx.fillStyle = color;
  ctx.fillRect(sx - steps * step, sy, (steps * 2 + 1) * step, step);
  ctx.fillRect(sx, sy - steps * step, step, (steps * 2 + 1) * step);
  ctx.fillStyle = coreColor;
  ctx.fillRect(sx, sy, step, step);
}

export function drawPixelSteppedDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  pxSize: number,
  fill: string,
  border?: string,
): void {
  const step = Math.max(2, Math.round(pxSize));
  const snappedCx = Math.round(cx / step) * step;
  const snappedCy = Math.round(cy / step) * step;
  const rows = Math.max(2, Math.round(ry / step));

  if (fill !== 'rgba(0, 0, 0, 0)') {
    ctx.fillStyle = fill;
    for (let r = -rows; r <= rows; r++) {
      const ny = r / Math.max(1, rows + 0.35);
      const halfW = Math.round((Math.sqrt(Math.max(0, 1 - ny * ny)) * rx) / step) * step;
      if (halfW <= 0) continue;
      ctx.fillRect(snappedCx - halfW, snappedCy + r * step, halfW * 2, step);
    }
  }

  if (border) {
    ctx.fillStyle = border;
    for (let r = -rows; r <= rows; r++) {
      const ny = r / Math.max(1, rows + 0.35);
      const halfW = Math.round((Math.sqrt(Math.max(0, 1 - ny * ny)) * rx) / step) * step;
      if (halfW <= 0) continue;
      if (Math.abs(r) === rows) {
        ctx.fillRect(snappedCx - halfW, snappedCy + r * step, halfW * 2, step);
      } else {
        ctx.fillRect(snappedCx - halfW, snappedCy + r * step, step, step);
        ctx.fillRect(snappedCx + halfW - step, snappedCy + r * step, step, step);
      }
    }
  }
}

interface BiomeArenaFlavor {
  groundPrimaryHex: string;
  groundSecondaryHex: string;
  pedestalKind: ArenaPedestalKind;
  weatherKind: ArenaWeatherKind;
  reflectionAlpha: number;
  hasWaterMirror: boolean;
}

const BIOME_ARENA_FLAVORS: Record<BiomeId, BiomeArenaFlavor> = {
  village: {
    groundPrimaryHex: '#4f7d58',
    groundSecondaryHex: '#6c758f',
    pedestalKind: 'cobble-rune',
    weatherKind: 'fireflies',
    reflectionAlpha: 0.24,
    hasWaterMirror: false,
  },
  forest: {
    groundPrimaryHex: '#38784b',
    groundSecondaryHex: '#594b3d',
    pedestalKind: 'moss-stone',
    weatherKind: 'fireflies',
    reflectionAlpha: 0.14,
    hasWaterMirror: false,
  },
  cave: {
    groundPrimaryHex: '#3f3d6e',
    groundSecondaryHex: '#2a264d',
    pedestalKind: 'crystal-dias',
    weatherKind: 'starlight',
    reflectionAlpha: 0.34,
    hasWaterMirror: false,
  },
  water: {
    groundPrimaryHex: '#1c78b8',
    groundSecondaryHex: '#d4be8d',
    pedestalKind: 'water-mirror',
    weatherKind: 'bubbles',
    reflectionAlpha: 0.44,
    hasWaterMirror: true,
  },
  volcano: {
    groundPrimaryHex: '#452422',
    groundSecondaryHex: '#7a2b18',
    pedestalKind: 'basalt-forge',
    weatherKind: 'embers',
    reflectionAlpha: 0.22,
    hasWaterMirror: false,
  },
  peak: {
    groundPrimaryHex: '#74b7d6',
    groundSecondaryHex: '#d9f2ff',
    pedestalKind: 'frost-mirror',
    weatherKind: 'snowflakes',
    reflectionAlpha: 0.40,
    hasWaterMirror: false,
  },
  grove: {
    groundPrimaryHex: '#56396b',
    groundSecondaryHex: '#82548c',
    pedestalKind: 'moss-stone',
    weatherKind: 'petals',
    reflectionAlpha: 0.24,
    hasWaterMirror: false,
  },
  desert: {
    groundPrimaryHex: '#c78c4c',
    groundSecondaryHex: '#8f5a27',
    pedestalKind: 'sandstone-dais',
    weatherKind: 'dust',
    reflectionAlpha: 0.12,
    hasWaterMirror: false,
  },
  marsh: {
    groundPrimaryHex: '#284a4f',
    groundSecondaryHex: '#1b2b42',
    pedestalKind: 'water-mirror',
    weatherKind: 'spores',
    reflectionAlpha: 0.38,
    hasWaterMirror: true,
  },
  sanctum: {
    groundPrimaryHex: '#59508a',
    groundSecondaryHex: '#cfd8f5',
    pedestalKind: 'astral-marble',
    weatherKind: 'starlight',
    reflectionAlpha: 0.36,
    hasWaterMirror: false,
  },
  canyon: {
    groundPrimaryHex: '#9c5b34',
    groundSecondaryHex: '#4d3b4f',
    pedestalKind: 'sandstone-dais',
    weatherKind: 'sparks',
    reflectionAlpha: 0.16,
    hasWaterMirror: false,
  },
  reef: {
    groundPrimaryHex: '#155c82',
    groundSecondaryHex: '#289ab8',
    pedestalKind: 'water-mirror',
    weatherKind: 'bubbles',
    reflectionAlpha: 0.42,
    hasWaterMirror: true,
  },
  ruins: {
    groundPrimaryHex: '#594b45',
    groundSecondaryHex: '#8a6b3e',
    pedestalKind: 'cobble-rune',
    weatherKind: 'starlight',
    reflectionAlpha: 0.22,
    hasWaterMirror: false,
  },
  rift: {
    groundPrimaryHex: '#291752',
    groundSecondaryHex: '#57228a',
    pedestalKind: 'astral-marble',
    weatherKind: 'starlight',
    reflectionAlpha: 0.34,
    hasWaterMirror: false,
  },
  faeveldt: {
    groundPrimaryHex: '#4f7a68',
    groundSecondaryHex: '#945288',
    pedestalKind: 'moss-stone',
    weatherKind: 'petals',
    reflectionAlpha: 0.26,
    hasWaterMirror: false,
  },
  atoll: {
    groundPrimaryHex: '#d4b47f',
    groundSecondaryHex: '#2ca8cc',
    pedestalKind: 'water-mirror',
    weatherKind: 'bubbles',
    reflectionAlpha: 0.40,
    hasWaterMirror: true,
  },
  highlands: {
    groundPrimaryHex: '#4b5a6e',
    groundSecondaryHex: '#6c8299',
    pedestalKind: 'cobble-rune',
    weatherKind: 'sparks',
    reflectionAlpha: 0.26,
    hasWaterMirror: false,
  },
  crater: {
    groundPrimaryHex: '#2d3f6e',
    groundSecondaryHex: '#5787c2',
    pedestalKind: 'crystal-dias',
    weatherKind: 'starlight',
    reflectionAlpha: 0.40,
    hasWaterMirror: false,
  },
};

function buildArenaDescriptors(): Record<BiomeId, BattleArenaDescriptor> {
  const out = {} as Record<BiomeId, BattleArenaDescriptor>;
  for (const biomeId of BIOME_IDS) {
    const profile = getBiomeVisualProfile(biomeId);
    const flavor = BIOME_ARENA_FLAVORS[biomeId];
    out[biomeId] = {
      biomeId,
      elementalType: profile.elementalType,
      name: `${profile.displayName} Arena`,
      subtitle: profile.subtitle,
      arenaPath: profile.arenaPath,
      skyTopHex: profile.colorGrade.skyTopHex,
      skyHorizonHex: profile.colorGrade.skyHorizonHex,
      groundPrimaryHex: flavor.groundPrimaryHex,
      groundSecondaryHex: flavor.groundSecondaryHex,
      accentHex: profile.accentHex,
      ambientGlowHex: profile.accentHex,
      pedestalKind: flavor.pedestalKind,
      weatherKind: flavor.weatherKind,
      reflectionAlpha: flavor.reflectionAlpha,
      hasWaterMirror: flavor.hasWaterMirror,
    };
  }
  return out;
}

/** All 18 canonical C:\dojo battle arena descriptors (`village`..`crater`). */
export const BATTLE_ARENAS: Record<BiomeId, BattleArenaDescriptor> = buildArenaDescriptors();

function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Precomputed deterministic weather mote seeds (zero per-frame Math.sin hashing)
const MOTE_SEEDS: ReadonlyArray<{ a: number; b: number; speedMod: number; phase: number }> = Array.from(
  { length: 28 },
  (_, i) => ({
    a: seededUnit(i * 13.7 + 3.1),
    b: seededUnit(i * 29.1 + 5.7),
    speedMod: 0.68 + (i % 4) * 0.21,
    phase: i * 1.73,
  }),
);

// 4x4 Bayer ordered dithering threshold matrix (0..15 / 16)
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function isDrawableArenaImage(img: HTMLImageElement | null | undefined): img is HTMLImageElement {
  if (!img) return false;
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  if (w <= 0 || h <= 0) return false;
  if (typeof img.complete === 'boolean' && !img.complete) return false;
  return true;
}

function createCachedCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    // Never pass willReadFrequently on blitted caches so browsers keep them GPU-accelerated
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
// Offscreen Static Layer Caches (keyed by biome + dimensions for 60+ FPS!)
// =============================================================================
interface CachedPedestalSprite {
  canvas: HTMLCanvasElement;
  offsetX: number;
  offsetY: number;
}

const STATIC_BACKDROP_CACHE = new Map<string, HTMLCanvasElement>();
const STATIC_PEDESTAL_CACHE = new Map<string, CachedPedestalSprite>();
const STATIC_FOREGROUND_CACHE = new Map<string, HTMLCanvasElement>();
const FOCAL_SPRITE_CACHE = new Map<string, HTMLCanvasElement>();

/**
 * Draws an ordered-dithered horizontal transition strip between two hex colors
 * for authentic 16-bit SNES/GBA HD-2D pixel-art gradients.
 */
function drawDitheredSeam(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  width: number,
  rows: number,
  px: number,
  colorNext: string,
): void {
  ctx.fillStyle = colorNext;
  for (let r = 0; r < rows; r++) {
    const threshold = ((r + 1) / (rows + 1)) * 16;
    const bayerRow = BAYER_4X4[r & 3];
    const py = y0 + r * px;
    for (let cx = 0; cx < width; cx += px) {
      if (bayerRow[(cx / px) & 3] < threshold) {
        ctx.fillRect(x0 + cx, py, px, px);
      }
    }
  }
}

/**
 * Paints rich biome-specific HD-2D pixel-art horizon silhouettes (ruins, cottages,
 * volcanoes, pine forests, coral arches, crystal spires, marble arches, mesas).
 */
function drawBiomeHorizonLandmarks(
  ctx: CanvasRenderingContext2D,
  w: number,
  horizonY: number,
  arena: BattleArenaDescriptor,
  px: number,
): void {
  const farSil = mixHex(arena.skyTopHex, arena.groundPrimaryHex, 0.34);
  const midSil = mixHex(arena.skyTopHex, arena.groundSecondaryHex, 0.56);
  const darkSil = mixHex(midSil, '#0a0d22', 0.45);
  const litRim = mixHex(arena.accentHex, '#fff6df', 0.32);
  const snap = (v: number): number => Math.round(v / px) * px;

  // 1. Far misty mountain/ridge silhouette range (crisp stepped pixel contour)
  ctx.fillStyle = farSil;
  const colW = px * 2;
  for (let x = 0; x < w; x += colW) {
    const nx = x / w;
    const wave =
      Math.abs(Math.sin(nx * 5.2 + arena.biomeId.length * 1.1)) * 34 +
      Math.abs(Math.cos(nx * 11.4 + 2.3)) * 16;
    const rh = snap(18 + wave);
    ctx.fillRect(x, horizonY - rh, colW, rh + px * 2);
  }

  // 2. Mid-ground biome-authentic pixel silhouettes
  switch (arena.biomeId) {
    case 'village': {
      // Cozy gabled pixel village cottages & harbor lantern posts flanking the horizon
      const houses = [0.10, 0.24, 0.76, 0.88];
      for (let i = 0; i < houses.length; i++) {
        const hx = snap(w * houses[i]);
        const hw = snap(px * (10 + (i % 2) * 3));
        const hh = snap(px * (8 + (i % 2) * 2));
        // Wall
        ctx.fillStyle = darkSil;
        ctx.fillRect(hx - hw * 0.5, horizonY - hh, hw, hh);
        // Stepped gabled roof
        ctx.fillStyle = mixHex(darkSil, '#2a2244', 0.4);
        for (let r = 0; r < 5; r++) {
          const rw = hw + px * 2 - r * px * 2;
          if (rw <= 0) break;
          ctx.fillRect(hx - rw * 0.5, horizonY - hh - (r + 1) * px, rw, px);
        }
        // Warm glowing pixel cottage windows
        ctx.fillStyle = '#ffd97a';
        ctx.fillRect(hx - px * 2, horizonY - hh + px * 2, px * 2, px * 2);
        ctx.fillRect(hx + px, horizonY - hh + px * 2, px * 2, px * 2);
      }
      break;
    }

    case 'volcano': {
      // Twin jagged caldera cones + glowing magma falls streaming into the lava floor
      for (const frac of [0.18, 0.80]) {
        const vx = snap(w * frac);
        const vh = snap(px * 22);
        ctx.fillStyle = darkSil;
        for (let r = 0; r < 18; r++) {
          const rw = snap(px * (8 + r * 2.2));
          ctx.fillRect(vx - rw * 0.5, horizonY - vh + r * px, rw, px * 2);
        }
        // Glowing molten lava fall ribbon
        ctx.fillStyle = '#ff6b2b';
        ctx.fillRect(vx - px * 2, horizonY - vh + px * 3, px * 4, vh - px * 3);
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(vx - px, horizonY - vh + px * 4, px * 2, vh - px * 4);
      }
      break;
    }

    case 'forest':
    case 'grove':
    case 'faeveldt': {
      // Layered pixel pine & ancient oak canopy silhouettes with glowing firefly/blossom accents
      const count = 11;
      for (let i = 0; i < count; i++) {
        const tx = snap((i / (count - 1)) * w);
        const th = snap(px * (12 + ((i * 7) % 10)));
        ctx.fillStyle = darkSil;
        ctx.fillRect(tx - px, horizonY - th * 0.5, px * 2, th * 0.5);
        for (let tier = 0; tier < 5; tier++) {
          const tw = snap(px * (3 + tier * 3));
          ctx.fillStyle = tier < 2 ? midSil : darkSil;
          ctx.fillRect(tx - tw * 0.5, horizonY - th + tier * px * 2, tw, px * 2);
        }
        if (arena.biomeId !== 'forest') {
          ctx.fillStyle = hexToRgba(litRim, 0.65);
          ctx.fillRect(tx - px * 2, horizonY - th + px * 2, px * 2, px);
        }
      }
      break;
    }

    case 'peak': {
      // Craggy snow-capped alpine spires + pixel aurora curtain ribbons
      for (let i = 0; i < 6; i++) {
        const mx = snap(w * (0.08 + i * 0.17));
        const mh = snap(px * (16 + (i % 3) * 6));
        for (let r = 0; r < mh / px; r++) {
          const rw = snap((r + 2) * px * 2);
          ctx.fillStyle = r < 5 ? '#dff8ff' : darkSil;
          ctx.fillRect(mx - rw * 0.5, horizonY - mh + r * px, rw, px);
        }
      }
      // Subtle pixel aurora veil in sky
      for (let x = 0; x < w; x += px * 2) {
        const ay = snap(horizonY * 0.42 + Math.sin(x * 0.015) * px * 6);
        ctx.fillStyle = hexToRgba('#5ef2d6', 0.18);
        ctx.fillRect(x, ay, px * 2, px * 6);
        ctx.fillStyle = hexToRgba('#a78bfa', 0.14);
        ctx.fillRect(x, ay - px * 4, px * 2, px * 4);
      }
      break;
    }

    case 'water':
    case 'reef':
    case 'atoll': {
      // Sculpted coral sea-arch on right & tropical island palms on left
      const archX = snap(w * 0.80);
      ctx.fillStyle = darkSil;
      ctx.fillRect(archX - px * 10, horizonY - px * 9, px * 4, px * 9);
      ctx.fillRect(archX + px * 6, horizonY - px * 9, px * 4, px * 9);
      ctx.fillRect(archX - px * 11, horizonY - px * 12, px * 22, px * 4);
      ctx.fillStyle = litRim;
      ctx.fillRect(archX - px * 9, horizonY - px * 12, px * 18, px);
      // Horizon moonbeam glint column over water
      for (let r = 0; r < 8; r++) {
        const gw = snap(px * (18 - r * 1.5));
        ctx.fillStyle = hexToRgba('#dffaff', 0.35 - r * 0.03);
        ctx.fillRect(snap(w * 0.5) - gw * 0.5, horizonY + r * px * 2, gw, px);
      }
      break;
    }

    case 'cave':
    case 'crater': {
      // Faceted glowing pixel crystal spires flanking the cavern / crater rim
      const spires = [0.09, 0.18, 0.82, 0.91];
      for (let i = 0; i < spires.length; i++) {
        const sx = snap(w * spires[i]);
        const sh = snap(px * (16 + (i % 2) * 8));
        ctx.fillStyle = mixHex(arena.accentHex, '#201848', 0.45);
        ctx.fillRect(sx - px * 3, horizonY - sh, px * 6, sh);
        ctx.fillStyle = arena.accentHex;
        ctx.fillRect(sx - px * 2, horizonY - sh + px, px * 3, sh - px);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - px, horizonY - sh + px * 2, px, Math.max(px * 2, sh - px * 6));
      }
      break;
    }

    case 'sanctum':
    case 'ruins':
    case 'rift': {
      // Fluted ancient/celestial temple pillars & floating astral ring
      const cols = [0.14, 0.28, 0.72, 0.86];
      for (let i = 0; i < cols.length; i++) {
        const cx = snap(w * cols[i]);
        const ch = snap(px * (18 + (i % 2) * 5));
        ctx.fillStyle = darkSil;
        ctx.fillRect(cx - px * 3, horizonY - ch, px * 6, ch);
        ctx.fillStyle = midSil;
        ctx.fillRect(cx - px * 2, horizonY - ch, px * 3, ch);
        ctx.fillStyle = litRim;
        ctx.fillRect(cx - px * 4, horizonY - ch - px * 2, px * 8, px * 2);
        ctx.fillRect(cx - px, horizonY - ch + px * 3, px, px * 3);
      }
      break;
    }

    case 'desert':
    case 'canyon': {
      // Stepped red-rock mesas / weathered sandstone monoliths
      for (const [frac, mw, mh] of [
        [0.16, 18, 12],
        [0.52, 12, 9],
        [0.84, 20, 14],
      ] as const) {
        const bx = snap(w * frac);
        ctx.fillStyle = darkSil;
        ctx.fillRect(bx - px * mw * 0.5, horizonY - px * mh, px * mw, px * mh);
        ctx.fillStyle = midSil;
        ctx.fillRect(bx - px * (mw - 4) * 0.5, horizonY - px * (mh + 3), px * (mw - 4), px * 3);
        ctx.fillStyle = litRim;
        ctx.fillRect(bx - px * (mw - 4) * 0.5, horizonY - px * (mh + 3), px * (mw - 4), px);
      }
      break;
    }

    case 'marsh':
    case 'highlands':
    default: {
      // Weathered standing stones & gnarled marsh/highland silhouettes
      for (let i = 0; i < 6; i++) {
        const sx = snap(w * (0.12 + i * 0.15));
        const sh = snap(px * (10 + (i % 3) * 4));
        ctx.fillStyle = darkSil;
        ctx.fillRect(sx - px * 2, horizonY - sh, px * 4, sh);
        ctx.fillStyle = hexToRgba(litRim, 0.72);
        ctx.fillRect(sx - px, horizonY - sh + px * 2, px * 2, px);
      }
      break;
    }
  }
}

/**
 * Builds (or retrieves from LRU cache) a complete static HD-2D pixel-art fallback diorama
 * keyed by `(biomeId, width, height)` so procedural battle arenas blit in microseconds!
 */
function getCachedStaticBackdrop(
  arena: BattleArenaDescriptor,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  const qw = Math.max(320, Math.round(w / 8) * 8);
  const qh = Math.max(200, Math.round(h / 8) * 8);
  const key = `${arena.biomeId}|${qw}x${qh}`;
  const cached = STATIC_BACKDROP_CACHE.get(key);
  if (cached) return cached;

  const created = createCachedCanvas(qw, qh);
  if (!created) return null;
  const { canvas, ctx } = created;
  paintStaticFallbackBackdrop(ctx, qw, qh, arena);
  lruSet(STATIC_BACKDROP_CACHE, key, canvas, 18);
  return canvas;
}

function paintStaticFallbackBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  arena: BattleArenaDescriptor,
): void {
  const px = Math.max(2, Math.round(Math.min(w, h) / 180));
  const horizonY = Math.round((h * 0.50) / px) * px;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // 1. 12-band pixel sky with 4x4 Bayer ordered dithering transitions
  const skyBands = 12;
  const bandH = Math.ceil(horizonY / skyBands);
  for (let b = 0; b < skyBands; b++) {
    const cCur = mixHex(arena.skyTopHex, arena.skyHorizonHex, b / (skyBands - 1));
    ctx.fillStyle = cCur;
    ctx.fillRect(0, b * bandH, w, bandH + 1);
    if (b < skyBands - 1) {
      const cNext = mixHex(arena.skyTopHex, arena.skyHorizonHex, (b + 1) / (skyBands - 1));
      drawDitheredSeam(ctx, 0, (b + 1) * bandH - px * 2, w, 2, px, cNext);
    }
  }

  // 2. Crisp pixel starfield + stepped crescent moon / celestial disc
  for (let i = 0; i < 42; i++) {
    const sx = Math.round((seededUnit(i * 5.3 + arena.biomeId.length) * w) / px) * px;
    const sy = Math.round((seededUnit(i * 9.7 + 13) * horizonY * 0.78) / px) * px;
    if (i % 9 === 0) {
      drawPixelCrossStar(ctx, sx, sy, px * 2, px, hexToRgba(arena.accentHex, 0.82), '#fffdf2');
    } else {
      ctx.fillStyle = i % 3 === 0 ? '#fff7d6' : 'rgba(218, 236, 255, 0.72)';
      ctx.fillRect(sx, sy, px, px);
    }
  }

  const moonX = Math.round((w * 0.78) / px) * px;
  const moonY = Math.round((h * 0.16) / px) * px;
  drawPixelSteppedDisc(ctx, moonX, moonY, px * 9, px * 9, px, hexToRgba(arena.accentHex, 0.18));
  drawPixelSteppedDisc(ctx, moonX, moonY, px * 6, px * 6, px, '#fff4cf');
  // Subtle crescent carve using sky top color on night biomes
  if (arena.biomeId !== 'desert' && arena.biomeId !== 'volcano') {
    drawPixelSteppedDisc(ctx, moonX + px * 2, moonY - px, px * 4.6, px * 4.6, px, arena.skyTopHex);
  }

  // 3. Biome-specific pixel mountain & landmark diorama silhouettes
  drawBiomeHorizonLandmarks(ctx, w, horizonY, arena, px);

  // 4. Perspective-banded ground plane with ordered pixel dithering & surface texture
  const groundBands = 10;
  const gBandH = Math.ceil((h - horizonY + px * 4) / groundBands);
  for (let b = 0; b < groundBands; b++) {
    const cCur = mixHex(arena.groundSecondaryHex, arena.groundPrimaryHex, b / (groundBands - 1));
    ctx.fillStyle = cCur;
    ctx.fillRect(0, horizonY + b * gBandH, w, gBandH + 1);
    if (b < groundBands - 1) {
      const cNext = mixHex(arena.groundSecondaryHex, arena.groundPrimaryHex, (b + 1) / (groundBands - 1));
      drawDitheredSeam(ctx, 0, horizonY + (b + 1) * gBandH - px * 2, w, 2, px, cNext);
    }
  }

  // Luminous horizon mist seam
  ctx.fillStyle = hexToRgba(arena.accentHex, 0.34);
  ctx.fillRect(0, horizonY - px, w, px * 2);

  // Pixel ground details (flagstones / grass tufts / pebbles / ripples)
  for (let i = 0; i < 40; i++) {
    const gx = Math.round((seededUnit(i * 11.3 + 4 + arena.biomeId.length) * w) / px) * px;
    const gy = Math.round((horizonY + px * 4 + seededUnit(i * 7.1 + 9) * (h - horizonY - px * 8)) / px) * px;
    ctx.fillStyle =
      i % 3 === 0
        ? hexToRgba(arena.accentHex, 0.32)
        : hexToRgba(mixHex(arena.groundPrimaryHex, '#0b0f22', 0.45), 0.42);
    ctx.fillRect(gx, gy, px * (2 + (i % 2)), px);
  }

  ctx.restore();
}

function renderPixelFallbackBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  arena: BattleArenaDescriptor,
  time: number,
  reducedMotion: boolean,
  activeTintHex: string | null,
  pulse: number,
  camera: BattleCameraTransform,
): void {
  const cached = getCachedStaticBackdrop(arena, w, h);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  applyParallaxToContext(ctx, w, h, camera, 0.25);

  if (cached) {
    const padX = Math.max(48, Math.round(w * 0.06));
    const padY = Math.max(32, Math.round(h * 0.06));
    ctx.drawImage(cached, -padX, -padY, w + padX * 2, h + padY * 2);
  } else {
    // Headless Node fallback without document.createElement
    paintStaticFallbackBackdrop(ctx, w, h, arena);
  }

  // Live twinkling starlight accents over cached sky
  const px = Math.max(2, Math.round(Math.min(w, h) / 180));
  const motion = reducedMotion ? 0.15 : 1.0;
  const t = time * motion;
  const horizonY = Math.round((h * 0.50) / px) * px;
  for (let i = 0; i < 10; i++) {
    const twinkle = 0.35 + 0.65 * Math.sin(t * (1.8 + (i % 4) * 0.5) + i * 2.1);
    if (twinkle < 0.55) continue;
    const sx = Math.round((seededUnit(i * 19.3 + arena.biomeId.length) * w) / px) * px;
    const sy = Math.round((seededUnit(i * 11.7 + 7) * horizonY * 0.72) / px) * px;
    drawPixelCrossStar(ctx, sx, sy, px, px, hexToRgba(arena.accentHex, twinkle * 0.7), '#ffffff');
  }

  if (activeTintHex && pulse > 0.03) {
    ctx.fillStyle = hexToRgba(activeTintHex, pulse * 0.18);
    ctx.fillRect(-60, -60, w + 120, h + 120);
  }

  ctx.restore();
}

interface FocalSeparationTuning {
  veilHex: string;
  veilAlpha: number;
  backlightHex: string;
  backlightAlpha: number;
}

function getFocalSeparationTuning(arena: BattleArenaDescriptor): FocalSeparationTuning {
  switch (arena.biomeId) {
    case 'volcano':
      return { veilHex: '#120810', veilAlpha: 0.42, backlightHex: '#ffe8cc', backlightAlpha: 0.14 };
    case 'peak':
      return { veilHex: '#0b1836', veilAlpha: 0.36, backlightHex: '#dff8ff', backlightAlpha: 0.12 };
    case 'desert':
    case 'atoll':
      return { veilHex: '#1a1224', veilAlpha: 0.34, backlightHex: '#fff3d6', backlightAlpha: 0.14 };
    case 'water':
    case 'reef':
      return { veilHex: '#081b34', veilAlpha: 0.30, backlightHex: '#d4f6ff', backlightAlpha: 0.16 };
    case 'crater':
    case 'sanctum':
      return { veilHex: '#0e1030', veilAlpha: 0.36, backlightHex: '#e8f0ff', backlightAlpha: 0.16 };
    case 'canyon':
      return { veilHex: '#180e1c', veilAlpha: 0.32, backlightHex: '#ffefc8', backlightAlpha: 0.16 };
    case 'forest':
    case 'grove':
    case 'faeveldt':
      return { veilHex: '#09161d', veilAlpha: 0.28, backlightHex: '#eefbe8', backlightAlpha: 0.18 };
    case 'cave':
    case 'rift':
    case 'marsh':
    case 'highlands':
    case 'ruins':
    case 'village':
    default:
      return { veilHex: '#090d22', veilAlpha: 0.24, backlightHex: '#dceeff', backlightAlpha: 0.22 };
  }
}

function getCachedRadialDiscSprite(
  hex: string,
  stops: ReadonlyArray<readonly [number, number]>,
): HTMLCanvasElement | null {
  const key = `${hex}|${stops.map(([o, a]) => `${o.toFixed(2)}:${a.toFixed(2)}`).join(',')}`;
  const cached = FOCAL_SPRITE_CACHE.get(key);
  if (cached) return cached;

  const created = createCachedCanvas(64, 64);
  if (!created) return null;
  const { canvas, ctx: cctx } = created;
  const half = 32;
  const grad = cctx.createRadialGradient(half, half, half * 0.08, half, half, half);
  for (const [offset, alpha] of stops) {
    grad.addColorStop(offset, hexToRgba(hex, alpha));
  }
  cctx.fillStyle = grad;
  cctx.fillRect(0, 0, 64, 64);
  lruSet(FOCAL_SPRITE_CACHE, key, canvas, 64);
  return canvas;
}

function drawCombatZoneFocalSeparation(
  ctx: CanvasRenderingContext2D,
  pad: BattlePadAnchor,
  tuning: FocalSeparationTuning,
  pulse: number,
): void {
  const cx = pad.x;
  const cy = pad.spriteCy - pad.size * 0.04;

  const veilRx = pad.size * 0.92;
  const veilRy = pad.size * 0.70;
  const veilSprite = getCachedRadialDiscSprite(tuning.veilHex, [
    [0, tuning.veilAlpha],
    [0.54, tuning.veilAlpha * 0.52],
    [0.82, tuning.veilAlpha * 0.15],
    [1, 0],
  ]);
  if (veilSprite) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(veilSprite, cx - veilRx, cy - veilRy, veilRx * 2, veilRy * 2);
    ctx.restore();
  }

  const haloRx = pad.size * 0.50;
  const haloRy = pad.size * 0.42;
  const haloCy = pad.spriteCy - pad.size * 0.08;
  const haloAlpha = clamp(tuning.backlightAlpha + pulse * 0.08, 0.08, 0.30);
  const qHaloAlpha = Math.round(haloAlpha * 50) / 50;
  const haloSprite = getCachedRadialDiscSprite(tuning.backlightHex, [
    [0, qHaloAlpha],
    [0.5, qHaloAlpha * 0.38],
    [1, 0],
  ]);
  if (haloSprite) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(haloSprite, cx - haloRx, haloCy - haloRy, haloRx * 2, haloRy * 2);
    ctx.restore();
  }
}

/**
 * Paints a richly textured, grounded HD-2D pixel-art battle pedestal/dais onto a canvas
 * (replaces flat pancake ovals with sculpted 3D stone/moss/basalt/frost/marble/water ledges
 * featuring bevel thickness, pixel dithering, masonry cracks, overlapping grass tufts, and runes).
 */
function paintTexturedBattlePedestal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  arena: BattleArenaDescriptor,
  px: number,
): void {
  const step = Math.max(2, px);
  const snap = (v: number): number => Math.round(v / step) * step;
  const scx = snap(cx);
  const scy = snap(cy);
  const rows = Math.max(4, Math.round(ry / step));

  // Palette derived per pedestal kind so every biome feels organically anchored to its terrain
  let rimDark = mixHex(arena.groundSecondaryHex, '#0a0d20', 0.62);
  let rimMid = mixHex(arena.groundSecondaryHex, '#181e38', 0.38);
  let deckDark = mixHex(arena.groundPrimaryHex, '#0e1428', 0.40);
  let deckMid = mixHex(arena.groundPrimaryHex, '#1c243a', 0.16);
  let deckLight = mixHex(arena.groundPrimaryHex, '#f2f7e8', 0.24);
  let lipAccent = mixHex(arena.accentHex, '#fff8e6', 0.28);

  if (arena.pedestalKind === 'moss-stone') {
    rimDark = '#232b29';
    rimMid = '#46544e';
    deckDark = mixHex(arena.groundPrimaryHex, '#1e3c27', 0.34);
    deckMid = mixHex(arena.groundPrimaryHex, '#3f7344', 0.24);
    deckLight = mixHex(arena.groundPrimaryHex, '#98cf6d', 0.28);
    lipAccent = arena.biomeId === 'forest' ? '#9ae868' : mixHex(arena.accentHex, '#ffd6f0', 0.35);
  } else if (arena.pedestalKind === 'basalt-forge') {
    rimDark = '#181016';
    rimMid = '#38242b';
    deckDark = '#2e1d24';
    deckMid = '#452e34';
    deckLight = '#63454a';
    lipAccent = '#ff9838';
  } else if (arena.pedestalKind === 'frost-mirror') {
    rimDark = '#284a6e';
    rimMid = '#5894bd';
    deckDark = '#68abd1';
    deckMid = '#98d7f0';
    deckLight = '#e4f9ff';
    lipAccent = '#ffffff';
  } else if (arena.pedestalKind === 'astral-marble') {
    rimDark = '#27264a';
    rimMid = '#5c5b8c';
    deckDark = '#525282';
    deckMid = '#7d82b0';
    deckLight = '#d6e0ff';
    lipAccent = '#ffe382';
  } else if (arena.pedestalKind === 'sandstone-dais') {
    rimDark = '#4a2b1c';
    rimMid = '#8a5230';
    deckDark = '#9e6638';
    deckMid = '#c78c4e';
    deckLight = '#ecc887';
    lipAccent = '#ffe8ad';
  } else if (arena.pedestalKind === 'water-mirror') {
    rimDark = '#0b3252';
    rimMid = '#1b648f';
    deckDark = '#19668f';
    deckMid = '#288eb5';
    deckLight = '#7be0f5';
    lipAccent = '#d9fcff';
  } else if (arena.pedestalKind === 'crystal-dias') {
    rimDark = '#1b1640';
    rimMid = '#42367a';
    deckDark = '#38306e';
    deckMid = '#5a4fa3';
    deckLight = '#9e9ce8';
    lipAccent = arena.accentHex;
  }

  const ink = 'rgba(7, 10, 22, 0.84)';
  const cliffThickness = Math.max(step * 2, Math.round((ry * 0.30) / step) * step);

  // 1. Soft grounded ambient occlusion & terrain-blending shadow beneath the dais
  drawPixelSteppedDisc(ctx, scx, scy + cliffThickness + step * 2, rx * 1.14, ry * 1.12, step, 'rgba(5, 7, 18, 0.22)');
  drawPixelSteppedDisc(ctx, scx, scy + cliffThickness + step, rx * 1.06, ry * 1.02, step, 'rgba(5, 7, 18, 0.42)');
  drawPixelSteppedDisc(ctx, scx, scy + cliffThickness, rx * 1.01, ry * 0.96, step, 'rgba(5, 7, 18, 0.56)');

  // 2. Sculpted 3D front cliff / stone ledge wall (tapered stone masonry edge)
  for (let d = cliffThickness; d >= step; d -= step) {
    const shadeFrac = d / cliffThickness;
    const isBottomLip = d === cliffThickness;
    const wallColor = isBottomLip ? ink : shadeFrac > 0.52 ? rimDark : rimMid;
    for (let r = 0; r <= rows; r++) {
      const ny = r / Math.max(1, rows + 0.3);
      const hw = Math.round((Math.sqrt(Math.max(0, 1 - ny * ny)) * rx * (1 - shadeFrac * 0.02)) / step) * step;
      if (hw <= 0) continue;
      ctx.fillStyle = wallColor;
      ctx.fillRect(scx - hw, scy + r * step + d, hw * 2, step);
      ctx.fillStyle = ink;
      ctx.fillRect(scx - hw - step, scy + r * step + d, step, step);
      ctx.fillRect(scx + hw, scy + r * step + d, step, step);
    }
  }

  // Carved vertical rock/stone facet seams along the front pedestal ledge
  const facetPositions = [-0.72, -0.44, -0.16, 0.16, 0.46, 0.72];
  for (let i = 0; i < facetPositions.length; i++) {
    const fx = snap(scx + facetPositions[i] * rx);
    const fy = snap(scy + Math.sqrt(Math.max(0.05, 1 - facetPositions[i] * facetPositions[i])) * ry);
    ctx.fillStyle = i % 2 === 0 ? ink : rimDark;
    ctx.fillRect(fx, fy, step, cliffThickness);
    ctx.fillStyle = hexToRgba(deckLight, 0.32);
    ctx.fillRect(fx + step, fy + step, step, Math.max(step, cliffThickness - step * 2));
  }

  // 3. Textured top battle surface with refined radial+directional pixel shading (subtle dither only along band seams!)
  for (let r = -rows; r <= rows; r++) {
    const ny = r / Math.max(1, rows + 0.3);
    const hw = Math.round((Math.sqrt(Math.max(0, 1 - ny * ny)) * rx) / step) * step;
    if (hw <= 0) continue;
    const py = scy + r * step;
    const bayerRow = BAYER_4X4[(r + rows) & 3];
    const rowNorm = (r + rows) / Math.max(1, rows * 2);

    ctx.fillStyle = ink;
    ctx.fillRect(scx - hw - step, py, hw * 2 + step * 2, step);

    for (let x = -hw; x < hw; x += step) {
      const nx = x / Math.max(1, rx);
      const radialDist = Math.hypot(nx * 0.9, ny * 0.9);
      const lightVal = clamp(0.76 - rowNorm * 0.34 - radialDist * 0.30 - nx * 0.08, 0, 1);
      const bayer = (bayerRow[((x + hw) / step) & 3] / 16 - 0.5) * 0.12;
      const isEdgeRim = Math.abs(r) === rows || x === -hw || x >= hw - step;

      if (isEdgeRim && r < 0) {
        ctx.fillStyle = hexToRgba(deckLight, 0.88);
      } else if (isEdgeRim && r > 0) {
        ctx.fillStyle = rimMid;
      } else if (lightVal + bayer > 0.52) {
        ctx.fillStyle = deckLight;
      } else if (lightVal + bayer > 0.28) {
        ctx.fillStyle = deckMid;
      } else {
        ctx.fillStyle = deckDark;
      }
      ctx.fillRect(scx + x, py, step, step);
    }
  }

  // 4. Inner subtle carved arena ring + biome-crafted pixel detailing!
  const innerRx = rx * 0.72;
  const innerRy = ry * 0.62;
  drawPixelSteppedDisc(
    ctx,
    scx,
    scy,
    innerRx,
    innerRy,
    step,
    'rgba(0, 0, 0, 0)',
    hexToRgba(lipAccent, arena.pedestalKind === 'moss-stone' ? 0.28 : 0.44),
  );

  switch (arena.pedestalKind) {
    case 'moss-stone': {
      // Natural mossy cobble crevices + lush 2-tone pixel grass blades & wildflowers overhanging the front rim!
      ctx.fillStyle = hexToRgba(rimDark, 0.45);
      ctx.fillRect(scx - snap(rx * 0.38), scy - step, snap(rx * 0.24), step);
      ctx.fillRect(scx + snap(rx * 0.14), scy + step, snap(rx * 0.22), step);
      ctx.fillRect(scx - step, scy - step * 2, step, step * 3);

      const tufts = [-0.84, -0.62, -0.36, -0.10, 0.18, 0.46, 0.70, 0.86];
      for (let i = 0; i < tufts.length; i++) {
        const tx = snap(scx + tufts[i] * rx);
        const edgeY = snap(scy + Math.sqrt(Math.max(0.05, 1 - tufts[i] * tufts[i])) * ry);
        // Dark foliage base overlapping ledge
        ctx.fillStyle = '#183d23';
        ctx.fillRect(tx - step * 2, edgeY - step, step * 5, step * 2);
        ctx.fillRect(tx - step, edgeY + step, step * 3, step * 2);
        // Mid emerald tuft
        ctx.fillStyle = '#3c8546';
        ctx.fillRect(tx - step * 2, edgeY - step * 2, step * 4, step * 2);
        // Sunlit pixel blade tips
        ctx.fillStyle = lipAccent;
        ctx.fillRect(tx - step * 2, edgeY - step * 3, step, step * 2);
        ctx.fillRect(tx, edgeY - step * 2, step, step);
        ctx.fillRect(tx + step * 2, edgeY - step * 2, step, step);
        // Wildflower / clover sparkle on alternate tufts
        if (i % 3 === 1) {
          ctx.fillStyle = arena.biomeId === 'forest' ? '#ffed85' : '#ffc2f0';
          ctx.fillRect(tx, edgeY - step * 3, step, step);
        }
      }
      break;
    }

    case 'basalt-forge': {
      // Glowing molten magma veins cracking across dark basalt slabs
      ctx.fillStyle = '#ff5722';
      ctx.fillRect(scx - snap(rx * 0.52), scy, snap(rx * 0.32), step);
      ctx.fillRect(scx + snap(rx * 0.16), scy - step, snap(rx * 0.38), step);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(scx - snap(rx * 0.44), scy, snap(rx * 0.14), step);
      ctx.fillRect(scx + snap(rx * 0.24), scy - step, snap(rx * 0.18), step);
      for (const sx of [-0.66, -0.24, 0.26, 0.64]) {
        const ex = snap(scx + sx * rx);
        const ey = snap(scy + Math.sqrt(Math.max(0.08, 1 - sx * sx)) * ry);
        ctx.fillStyle = '#ff7b29';
        ctx.fillRect(ex, ey + step, step * 2, step * 2);
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(ex, ey + step, step, step);
      }
      break;
    }

    case 'frost-mirror':
    case 'crystal-dias': {
      // Diagonal crystalline specular streaks + faceted crystal prongs at sides
      ctx.fillStyle = hexToRgba('#ffffff', 0.65);
      ctx.fillRect(scx - snap(rx * 0.46), scy - step * 2, snap(rx * 0.24), step);
      ctx.fillRect(scx - snap(rx * 0.36), scy - step, snap(rx * 0.16), step);
      ctx.fillRect(scx + snap(rx * 0.18), scy + step, snap(rx * 0.22), step);
      // Small pixel crystal nubs flanking left/right rim
      for (const side of [-1, 1] as const) {
        const kx = snap(scx + side * rx * 0.88);
        ctx.fillStyle = ink;
        ctx.fillRect(kx - step * 2, scy - step * 3, step * 4, step * 4);
        ctx.fillStyle = lipAccent;
        ctx.fillRect(kx - step, scy - step * 2, step * 2, step * 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(kx - step, scy - step * 2, step, step);
      }
      break;
    }

    case 'water-mirror': {
      // Concentric caustic foam pixels & stepping pebbles along water rim
      ctx.fillStyle = hexToRgba('#e6fdff', 0.72);
      ctx.fillRect(scx - snap(rx * 0.42), scy - step, snap(rx * 0.20), step);
      ctx.fillRect(scx + snap(rx * 0.18), scy + step, snap(rx * 0.24), step);
      for (const sx of [-0.74, 0.72]) {
        const pxX = snap(scx + sx * rx);
        ctx.fillStyle = '#d4be8d';
        ctx.fillRect(pxX - step, scy + step, step * 3, step * 2);
        ctx.fillStyle = '#fff5d6';
        ctx.fillRect(pxX - step, scy + step, step * 2, step);
      }
      break;
    }

    case 'astral-marble':
    case 'cobble-rune':
    case 'sandstone-dais':
    default: {
      // Carved masonry tile seams + inlaid glowing cardinal starlight rune nodes
      ctx.fillStyle = hexToRgba(rimDark, 0.48);
      ctx.fillRect(scx - snap(rx * 0.45), scy, snap(rx * 0.90), step);
      ctx.fillRect(scx - step, scy - snap(ry * 0.52), step * 2, snap(ry * 1.04));
      for (const sx of [-0.76, 0.76]) {
        const nodeX = snap(scx + sx * rx);
        ctx.fillStyle = ink;
        ctx.fillRect(nodeX - step * 2, scy - step, step * 4, step * 3);
        ctx.fillStyle = lipAccent;
        ctx.fillRect(nodeX - step, scy, step * 2, step);
      }
      break;
    }
  }
}

function getCachedPedestalSprite(
  arena: BattleArenaDescriptor,
  rx: number,
  ry: number,
  px: number,
): CachedPedestalSprite | null {
  const step = Math.max(2, px);
  const qRx = Math.max(24, Math.round(rx / 4) * 4);
  const qRy = Math.max(10, Math.round(ry / 2) * 2);
  const key = `${arena.biomeId}|${qRx}x${qRy}|${step}`;
  const cached = STATIC_PEDESTAL_CACHE.get(key);
  if (cached) return cached;

  const padX = Math.round(qRx * 0.22) + step * 4;
  const padTop = step * 6;
  const padBot = Math.round(qRy * 0.85) + step * 8;
  const cw = qRx * 2 + padX * 2;
  const ch = qRy * 2 + padTop + padBot;
  const created = createCachedCanvas(cw, ch);
  if (!created) return null;

  const { canvas, ctx } = created;
  ctx.imageSmoothingEnabled = false;
  const centerX = Math.round(cw * 0.5);
  const centerY = padTop + qRy;
  paintTexturedBattlePedestal(ctx, centerX, centerY, qRx, qRy, arena, step);

  const entry: CachedPedestalSprite = {
    canvas,
    offsetX: centerX,
    offsetY: centerY,
  };
  lruSet(STATIC_PEDESTAL_CACHE, key, entry, 48);
  return entry;
}

function drawCraftedBattlePlatform(
  ctx: CanvasRenderingContext2D,
  pad: BattlePadAnchor,
  arena: BattleArenaDescriptor,
  glowColor: string,
  px: number,
  pulse: number,
  t: number,
): void {
  const step = Math.max(2, px);

  // 1. Subtle animated reflective aura beneath pedestal during elemental surges / reflective arenas
  if (arena.reflectionAlpha > 0.08 && (pulse > 0.06 || arena.hasWaterMirror)) {
    drawPixelSteppedDisc(
      ctx,
      pad.x,
      pad.y + step * 3,
      pad.rx * 1.10,
      pad.ry * 1.18,
      step,
      hexToRgba(glowColor, arena.reflectionAlpha * (0.16 + pulse * 0.24)),
    );
  }

  // 2. Blit pre-rendered high-craft textured pixel pedestal (1 drawImage call!)
  const cached = getCachedPedestalSprite(arena, pad.rx, pad.ry, step);
  if (cached) {
    ctx.drawImage(
      cached.canvas,
      Math.round(pad.x - cached.offsetX),
      Math.round(pad.y - cached.offsetY),
    );
  } else {
    paintTexturedBattlePedestal(ctx, pad.x, pad.y, pad.rx, pad.ry, arena, step);
  }

  // 3. Lightweight live animated shimmer accents (water ripple / ember glow / move surge rim)
  if (arena.pedestalKind === 'water-mirror') {
    const ripple = 1 + Math.sin(t * 2.2) * 0.04;
    drawPixelSteppedDisc(
      ctx,
      pad.x,
      pad.y,
      pad.rx * 0.68 * ripple,
      pad.ry * 0.50 * ripple,
      step,
      'rgba(0, 0, 0, 0)',
      hexToRgba('#c4f8ff', 0.36 + pulse * 0.26),
    );
  } else if (pulse > 0.08) {
    drawPixelSteppedDisc(
      ctx,
      pad.x,
      pad.y,
      pad.rx * 0.86,
      pad.ry * 0.72,
      step,
      'rgba(0, 0, 0, 0)',
      hexToRgba(glowColor, pulse * 0.55),
    );
  }
}

export function renderArenaPedestalsAndAtmosphere(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  arena: BattleArenaDescriptor,
  time: number,
  reducedMotion: boolean,
  activeTintHex: string | null,
  pulse: number,
  camera: BattleCameraTransform,
): void {
  const layout = computeBattleStageLayout(w, h);
  const px = Math.max(2, Math.round(Math.min(w, h) / 240));
  const motion = reducedMotion ? 0.16 : 1.0;
  const t = time * motion;
  const glowColor = activeTintHex ? mixHex(arena.ambientGlowHex, activeTintHex, pulse * 0.65) : arena.ambientGlowHex;
  const focalTuning = getFocalSeparationTuning(arena);

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Elemental arena pulse lighting wash over stage during move impact
  if (activeTintHex && pulse > 0.02) {
    ctx.fillStyle = hexToRgba(activeTintHex, pulse * 0.13);
    ctx.fillRect(0, 0, w, h);
  }

  applyCameraToContext(ctx, w, h, camera);

  // 1. Subtle atmospheric focal depth separation behind combat zones
  drawCombatZoneFocalSeparation(ctx, layout.enemyPad, focalTuning, pulse);
  drawCombatZoneFocalSeparation(ctx, layout.playerPad, focalTuning, pulse);

  // 2. Cached textured HD-2D battle pedestals beneath both combatants
  drawCraftedBattlePlatform(ctx, layout.enemyPad, arena, glowColor, px, pulse, t);
  drawCraftedBattlePlatform(ctx, layout.playerPad, arena, glowColor, px, pulse, t);

  // 3. Crisp biome-matched atmospheric pixel motes (precomputed seeds, zero per-frame allocations)
  const moteCount = reducedMotion ? 8 : 20;
  const baseSpeed =
    arena.weatherKind === 'embers' || arena.weatherKind === 'sparks' || arena.weatherKind === 'bubbles'
      ? -0.085
      : arena.weatherKind === 'snowflakes' || arena.weatherKind === 'petals'
        ? 0.075
        : 0.028;

  for (let i = 0; i < moteCount; i++) {
    const seed = MOTE_SEEDS[i];
    const u =
      (((seed.a + Math.sin(t * 0.55 + seed.phase) * 0.035 + (arena.weatherKind === 'dust' ? t * 0.055 : 0)) % 1) + 1) % 1;
    const v = (((seed.b + t * baseSpeed * seed.speedMod) % 1) + 1) % 1;
    const mx = Math.round((u * w) / px) * px;
    const my = Math.round((v * h * 0.84) / px) * px;
    const flicker = 0.42 + 0.58 * Math.sin(t * 3.0 + seed.phase);

    switch (arena.weatherKind) {
      case 'embers': {
        ctx.fillStyle = hexToRgba(i % 2 === 0 ? '#ff6b2b' : '#ffb84d', flicker * 0.85);
        ctx.fillRect(mx, my, px * 2, px * 2);
        ctx.fillStyle = hexToRgba('#fff3b0', flicker * 0.9);
        ctx.fillRect(mx, my, px, px);
        break;
      }
      case 'snowflakes': {
        ctx.fillStyle = hexToRgba('#eafaff', 0.76 * flicker);
        if (i % 3 === 0) {
          drawPixelCrossStar(ctx, mx, my, px, px, hexToRgba('#b8eeff', 0.65 * flicker), '#ffffff');
        } else {
          ctx.fillRect(mx, my, px, px);
        }
        break;
      }
      case 'petals': {
        ctx.fillStyle = hexToRgba(i % 2 === 0 ? '#ffa8df' : '#ffe2f5', 0.82 * flicker);
        ctx.fillRect(mx, my, px * 2, px);
        ctx.fillRect(mx + px, my + px, px, px);
        break;
      }
      case 'bubbles': {
        ctx.fillStyle = hexToRgba('#9be8ff', 0.58 * flicker);
        ctx.fillRect(mx, my, px * 2, px * 2);
        ctx.fillStyle = hexToRgba('#ffffff', 0.88 * flicker);
        ctx.fillRect(mx, my, px, px);
        break;
      }
      case 'spores': {
        ctx.fillStyle = hexToRgba(i % 2 === 0 ? '#5eead4' : '#d8b4fe', 0.72 * flicker);
        ctx.fillRect(mx, my, px * 2, px * 2);
        ctx.fillStyle = hexToRgba('#ffffff', 0.7 * flicker);
        ctx.fillRect(mx, my, px, px);
        break;
      }
      case 'sparks': {
        ctx.fillStyle = hexToRgba('#ffe666', 0.85 * flicker);
        ctx.fillRect(mx, my, px * 2, px);
        ctx.fillRect(mx + px, my - px, px, px);
        break;
      }
      case 'dust': {
        ctx.fillStyle = hexToRgba('#ffe4ad', 0.44 * flicker);
        ctx.fillRect(mx, my, px * 3, px);
        break;
      }
      case 'starlight':
      case 'fireflies':
      default: {
        if (i % 4 === 0) {
          drawPixelCrossStar(ctx, mx, my, px, px, hexToRgba(glowColor, flicker * 0.78), '#fffdf0');
        } else {
          ctx.fillStyle = hexToRgba(glowColor, flicker * 0.76);
          ctx.fillRect(mx, my, px, px);
        }
        break;
      }
    }
  }

  ctx.restore();
}

export function emitArenaPointLights(
  backend: IRenderBackend,
  arena: BattleArenaDescriptor,
  state: BattleSceneState,
  layout: BattleStageLayout,
): void {
  const baseRgb = hexToRgb01(arena.ambientGlowHex);
  const pulse = clamp(state.arenaLightingPulse, 0, 1);
  const activeType: ElementalType | null = state.arenaLightingType;
  const activeRgb = activeType ? TYPE_PALETTES[activeType].rgb : baseRgb;
  const minDim = Math.min(layout.width, layout.height);

  const neutralPadRgb: [number, number, number] = [
    baseRgb[0] * 0.35 + 0.65,
    baseRgb[1] * 0.35 + 0.65,
    baseRgb[2] * 0.35 + 0.65,
  ];
  const padRgb = activeType && pulse > 0.15 ? activeRgb : neutralPadRgb;

  backend.addPointLight({
    id: `arena-horizon-${arena.biomeId}`,
    x: layout.centerX,
    y: layout.horizonY,
    radius: minDim * 0.58,
    color: baseRgb,
    intensity: 0.38 + pulse * 0.24,
    flickerSpeed: 2.2,
    flickerAmount: state.reducedMotion ? 0 : 0.06,
  });

  backend.addPointLight({
    id: `arena-player-pad-${arena.biomeId}`,
    x: layout.playerPad.x,
    y: layout.playerPad.spriteCy,
    radius: minDim * 0.38,
    color: padRgb,
    intensity: 0.46 + pulse * 0.40,
    flickerSpeed: 3.1,
    flickerAmount: state.reducedMotion ? 0 : 0.04,
  });

  backend.addPointLight({
    id: `arena-enemy-pad-${arena.biomeId}`,
    x: layout.enemyPad.x,
    y: layout.enemyPad.spriteCy,
    radius: minDim * 0.36,
    color: padRgb,
    intensity: 0.48 + pulse * 0.42,
    flickerSpeed: 3.4,
    flickerAmount: state.reducedMotion ? 0 : 0.04,
  });

  if (activeType && pulse > 0.05) {
    backend.addPointLight({
      id: `arena-move-surge-${activeType}`,
      x: layout.centerX,
      y: layout.centerY,
      radius: minDim * (0.62 + pulse * 0.25),
      color: activeRgb,
      intensity: 0.92 * pulse,
      flickerSpeed: 6.5,
      flickerAmount: state.reducedMotion ? 0 : 0.12,
    });
  }
}

export function renderArenaBackdrop(
  backend: IRenderBackend,
  arena: BattleArenaDescriptor,
  state: BattleSceneState,
  camera: BattleCameraTransform,
  time: number,
  viewportWidth = 960,
  viewportHeight = 540,
  arenaImage: HTMLImageElement | null = null,
): void {
  const pulse = clamp(state.arenaLightingPulse, 0, 1);
  const activeTintHex = state.arenaLightingType
    ? TYPE_PALETTES[state.arenaLightingType]?.primary ?? null
    : null;

  if (isDrawableArenaImage(arenaImage)) {
    const imgW = arenaImage.naturalWidth || arenaImage.width || 480;
    const imgH = arenaImage.naturalHeight || arenaImage.height || 270;
    const overscanX = Math.max(56, viewportWidth * 0.08);
    const overscanY = Math.max(36, viewportHeight * 0.08);
    const scale = Math.max(
      (viewportWidth + overscanX * 2) / imgW,
      (viewportHeight + overscanY * 2) / imgH,
    );
    const dw = imgW * scale;
    const dh = imgH * scale;
    const parallaxCompX = camera.x * 0.72;
    const parallaxCompY = camera.y * 0.72;
    const dx = (viewportWidth - dw) * 0.5 + parallaxCompX;
    const dy = (viewportHeight - dh) * 0.5 + parallaxCompY;

    backend.drawSprite({
      source: arenaImage,
      sx: 0,
      sy: 0,
      sw: imgW,
      sh: imgH,
      dx,
      dy,
      dw,
      dh,
      pixelCrisp: true,
      depth: -100,
    });

    backend.drawCustom2D((ctx, width, height) => {
      renderArenaPedestalsAndAtmosphere(
        ctx,
        width,
        height,
        arena,
        time,
        state.reducedMotion,
        activeTintHex,
        pulse,
        camera,
      );
    }, 'world');
  } else {
    // Combine fallback backdrop + pedestals inside ONE world callback when no arena PNG is attached
    backend.drawCustom2D((ctx, width, height) => {
      renderPixelFallbackBackdrop(
        ctx,
        width,
        height,
        arena,
        time,
        state.reducedMotion,
        activeTintHex,
        pulse,
        camera,
      );
      renderArenaPedestalsAndAtmosphere(
        ctx,
        width,
        height,
        arena,
        time,
        state.reducedMotion,
        activeTintHex,
        pulse,
        camera,
      );
    }, 'world');
  }
}

/**
 * Builds a cached static foreground vignette & subtle corner pixel silhouette frame
 * keyed by `(biomeId, width, height)` so foreground framing costs 1 `ctx.drawImage`.
 */
function getCachedStaticForeground(
  arena: BattleArenaDescriptor,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  const qw = Math.max(320, Math.round(w / 8) * 8);
  const qh = Math.max(200, Math.round(h / 8) * 8);
  const key = `${arena.biomeId}|${qw}x${qh}`;
  const cached = STATIC_FOREGROUND_CACHE.get(key);
  if (cached) return cached;

  const created = createCachedCanvas(qw, qh);
  if (!created) return null;
  const { canvas, ctx } = created;
  paintStaticForeground(ctx, qw, qh, arena);
  lruSet(STATIC_FOREGROUND_CACHE, key, canvas, 18);
  return canvas;
}

function paintStaticForeground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  arena: BattleArenaDescriptor,
): void {
  const px = Math.max(2, Math.round(Math.min(w, h) / 220));
  const snap = (v: number): number => Math.round(v / px) * px;
  const silDark = mixHex(arena.groundPrimaryHex, '#060916', 0.78);
  const silHighlight = mixHex(arena.accentHex, '#fff6df', 0.25);

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Soft pixel-stepped bottom HUD transition shade (zero gradients)
  const shadeTop = snap(h * 0.84);
  const shadeH = Math.max(8, Math.ceil((h - shadeTop) / 4));
  const shadeAlphas = [0.07, 0.16, 0.28, 0.42];
  for (let b = 0; b < 4; b++) {
    ctx.fillStyle = `rgba(6, 9, 24, ${shadeAlphas[b]})`;
    ctx.fillRect(0, shadeTop + b * shadeH, w, shadeH + 1);
  }

  // Subtle corner foreground depth framing (strictly outer 6% bottom corners, never obscuring sprites/HUD)
  for (const side of [0, 1] as const) {
    const isRight = side === 1;
    const baseX = isRight ? w - px * 3 : px * 2;
    const dir = isRight ? -1 : 1;
    for (let i = 0; i < 4; i++) {
      const bx = snap(baseX + dir * i * px * 5);
      const bh = snap(px * (10 - i * 2));
      const by = snap(h * 0.86) - bh;
      ctx.fillStyle = hexToRgba(silDark, 0.68);
      ctx.fillRect(bx, by, px * 3, bh + px * 8);
      ctx.fillStyle = hexToRgba(silHighlight, 0.28);
      ctx.fillRect(bx + (isRight ? 0 : px * 2), by, px, Math.max(px * 2, bh - px * 2));
    }
  }

  ctx.restore();
}

export function renderArenaForeground(
  backend: IRenderBackend,
  arena: BattleArenaDescriptor,
  state: BattleSceneState,
  camera: BattleCameraTransform,
  time: number,
  layer: 'world' | 'post-light' = 'post-light',
): void {
  const pulse = clamp(state.arenaLightingPulse, 0, 1);
  const activeTintHex = state.arenaLightingType
    ? TYPE_PALETTES[state.arenaLightingType]?.primary ?? null
    : null;
  const glowHex = activeTintHex ? mixHex(arena.ambientGlowHex, activeTintHex, pulse * 0.6) : arena.ambientGlowHex;

  backend.drawCustom2D((ctx, width, height) => {
    const px = Math.max(2, Math.round(Math.min(width, height) / 220));
    const motion = state.reducedMotion ? 0.12 : 1.0;
    const sway = Math.round((Math.sin(time * 1.4 * motion) * 3) / px) * px;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    applyParallaxToContext(ctx, width, height, camera, 1.12);

    const cached = getCachedStaticForeground(arena, width, height);
    if (cached) {
      ctx.drawImage(cached, sway, 0, width, height);
    } else {
      paintStaticForeground(ctx, width, height, arena);
    }

    // Subtle animated foreground bokeh sparkles at outer frame edges
    ctx.fillStyle = hexToRgba(glowHex, 0.28 + pulse * 0.24);
    for (let i = 0; i < 4; i++) {
      const fx = Math.round((width * (0.03 + (i % 2) * 0.035) + sway) / px) * px;
      const fy = Math.round((height * (0.76 + Math.floor(i / 2) * 0.06)) / px) * px;
      ctx.fillRect(fx, fy, px, px);
      ctx.fillRect(width - fx - px, fy, px, px);
    }

    ctx.restore();
  }, layer);
}

export function renderArena(
  backend: IRenderBackend,
  arena: BattleArenaDescriptor,
  state: BattleSceneState,
  camera: BattleCameraTransform = { x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0, rotation: 0 },
  time = state.elapsedSeconds,
  arenaImage: HTMLImageElement | null = null,
): void {
  renderArenaBackdrop(backend, arena, state, camera, time, 960, 540, arenaImage);
  renderArenaForeground(backend, arena, state, camera, time);
}
