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
    // Frame both combatants cleanly inside the unobstructed upper-middle portrait window
    // (below top enemy nameplate ~0..12% and above bottom player card + move deck ~54..100%)
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
  for (let i = -steps; i <= steps; i++) {
    ctx.fillRect(sx + i * step, sy, step, step);
    ctx.fillRect(sx, sy + i * step, step, step);
  }
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

  ctx.fillStyle = fill;
  for (let r = -rows; r <= rows; r++) {
    const ny = r / Math.max(1, rows + 0.35);
    const halfW = Math.round((Math.sqrt(Math.max(0, 1 - ny * ny)) * rx) / step) * step;
    if (halfW <= 0) continue;
    ctx.fillRect(snappedCx - halfW, snappedCy + r * step, halfW * 2, step);
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
    reflectionAlpha: 0.28,
    hasWaterMirror: false,
  },
  forest: {
    groundPrimaryHex: '#38784b',
    groundSecondaryHex: '#594b3d',
    pedestalKind: 'moss-stone',
    weatherKind: 'fireflies',
    reflectionAlpha: 0.16,
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
    reflectionAlpha: 0.46,
    hasWaterMirror: true,
  },
  volcano: {
    groundPrimaryHex: '#452422',
    groundSecondaryHex: '#7a2b18',
    pedestalKind: 'basalt-forge',
    weatherKind: 'embers',
    reflectionAlpha: 0.24,
    hasWaterMirror: false,
  },
  peak: {
    groundPrimaryHex: '#74b7d6',
    groundSecondaryHex: '#d9f2ff',
    pedestalKind: 'frost-mirror',
    weatherKind: 'snowflakes',
    reflectionAlpha: 0.42,
    hasWaterMirror: false,
  },
  grove: {
    groundPrimaryHex: '#56396b',
    groundSecondaryHex: '#82548c',
    pedestalKind: 'moss-stone',
    weatherKind: 'petals',
    reflectionAlpha: 0.28,
    hasWaterMirror: false,
  },
  desert: {
    groundPrimaryHex: '#c78c4c',
    groundSecondaryHex: '#8f5a27',
    pedestalKind: 'sandstone-dais',
    weatherKind: 'dust',
    reflectionAlpha: 0.14,
    hasWaterMirror: false,
  },
  marsh: {
    groundPrimaryHex: '#284a4f',
    groundSecondaryHex: '#1b2b42',
    pedestalKind: 'water-mirror',
    weatherKind: 'spores',
    reflectionAlpha: 0.40,
    hasWaterMirror: true,
  },
  sanctum: {
    groundPrimaryHex: '#59508a',
    groundSecondaryHex: '#cfd8f5',
    pedestalKind: 'astral-marble',
    weatherKind: 'starlight',
    reflectionAlpha: 0.38,
    hasWaterMirror: false,
  },
  canyon: {
    groundPrimaryHex: '#9c5b34',
    groundSecondaryHex: '#4d3b4f',
    pedestalKind: 'sandstone-dais',
    weatherKind: 'sparks',
    reflectionAlpha: 0.18,
    hasWaterMirror: false,
  },
  reef: {
    groundPrimaryHex: '#155c82',
    groundSecondaryHex: '#289ab8',
    pedestalKind: 'water-mirror',
    weatherKind: 'bubbles',
    reflectionAlpha: 0.45,
    hasWaterMirror: true,
  },
  ruins: {
    groundPrimaryHex: '#594b45',
    groundSecondaryHex: '#8a6b3e',
    pedestalKind: 'cobble-rune',
    weatherKind: 'starlight',
    reflectionAlpha: 0.24,
    hasWaterMirror: false,
  },
  rift: {
    groundPrimaryHex: '#291752',
    groundSecondaryHex: '#57228a',
    pedestalKind: 'astral-marble',
    weatherKind: 'starlight',
    reflectionAlpha: 0.36,
    hasWaterMirror: false,
  },
  faeveldt: {
    groundPrimaryHex: '#4f7a68',
    groundSecondaryHex: '#945288',
    pedestalKind: 'moss-stone',
    weatherKind: 'petals',
    reflectionAlpha: 0.30,
    hasWaterMirror: false,
  },
  atoll: {
    groundPrimaryHex: '#d4b47f',
    groundSecondaryHex: '#2ca8cc',
    pedestalKind: 'water-mirror',
    weatherKind: 'bubbles',
    reflectionAlpha: 0.42,
    hasWaterMirror: true,
  },
  highlands: {
    groundPrimaryHex: '#4b5a6e',
    groundSecondaryHex: '#6c8299',
    pedestalKind: 'cobble-rune',
    weatherKind: 'sparks',
    reflectionAlpha: 0.28,
    hasWaterMirror: false,
  },
  crater: {
    groundPrimaryHex: '#2d3f6e',
    groundSecondaryHex: '#5787c2',
    pedestalKind: 'crystal-dias',
    weatherKind: 'starlight',
    reflectionAlpha: 0.44,
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

function isDrawableArenaImage(img: HTMLImageElement | null | undefined): img is HTMLImageElement {
  if (!img) return false;
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  if (w <= 0 || h <= 0) return false;
  if (typeof img.complete === 'boolean' && !img.complete) return false;
  return true;
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
  const px = Math.max(3, Math.round(Math.min(w, h) / 135));
  const horizonY = Math.round((h * 0.50) / px) * px;
  const motion = reducedMotion ? 0.15 : 1.0;
  const t = time * motion;

  const skyTop = activeTintHex ? mixHex(arena.skyTopHex, activeTintHex, pulse * 0.25) : arena.skyTopHex;
  const skyHor = activeTintHex ? mixHex(arena.skyHorizonHex, activeTintHex, pulse * 0.35) : arena.skyHorizonHex;
  const groundA = activeTintHex ? mixHex(arena.groundPrimaryHex, activeTintHex, pulse * 0.22) : arena.groundPrimaryHex;
  const groundB = arena.groundSecondaryHex;
  const accent = activeTintHex ? mixHex(arena.accentHex, activeTintHex, pulse * 0.45) : arena.accentHex;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Quantized pixel sky bands (no smooth muddy gradients)
  const skyBands = 10;
  const bandH = Math.ceil((horizonY + 40) / skyBands);
  for (let b = 0; b < skyBands; b++) {
    ctx.fillStyle = mixHex(skyTop, skyHor, b / (skyBands - 1));
    ctx.fillRect(-40, -40 + b * bandH, w + 80, bandH + 1);
  }

  // Parallax pixel starfield & moon/sun disc
  ctx.save();
  applyParallaxToContext(ctx, w, h, camera, 0.14);
  for (let i = 0; i < 28; i++) {
    const sx = Math.round((seededUnit(i * 5.3 + arena.biomeId.length) * w) / px) * px;
    const sy = Math.round((seededUnit(i * 9.7 + 13) * horizonY * 0.82) / px) * px;
    const twinkle = 0.45 + 0.55 * Math.sin(t * (1.5 + (i % 4) * 0.4) + i);
    if (i % 7 === 0) {
      drawPixelCrossStar(ctx, sx, sy, px * 2, px, hexToRgba(accent, twinkle * 0.85));
    } else {
      ctx.fillStyle = hexToRgba('#fff7d6', twinkle * 0.8);
      ctx.fillRect(sx, sy, px, px);
    }
  }

  // Pixel-stepped celestial moon/orb
  drawPixelSteppedDisc(ctx, w * 0.78, h * 0.16, px * 7, px * 7, px, hexToRgba(accent, 0.22));
  drawPixelSteppedDisc(ctx, w * 0.78, h * 0.16, px * 4, px * 4, px, '#fff4cf');
  ctx.restore();

  // Far pixel ridge silhouettes
  ctx.save();
  applyParallaxToContext(ctx, w, h, camera, 0.28);
  const colW = px * 4;
  ctx.fillStyle = mixHex(skyTop, groundA, 0.42);
  for (let x = -48; x < w + 48; x += colW) {
    const ridgeH =
      Math.round(
        (24 + Math.abs(Math.sin(x * 0.012 + arena.biomeId.length)) * 44) / px,
      ) * px;
    ctx.fillRect(x, horizonY - ridgeH, colW + 1, ridgeH + 12);
  }
  ctx.restore();

  // Ground stage floor in quantized pixel bands + checkerboard/stone accents
  ctx.save();
  applyParallaxToContext(ctx, w, h, camera, 0.85);
  const groundBands = 8;
  const gBandH = Math.ceil((h - horizonY + 80) / groundBands);
  for (let b = 0; b < groundBands; b++) {
    ctx.fillStyle = mixHex(groundB, groundA, b / (groundBands - 1));
    ctx.fillRect(-60, horizonY + b * gBandH, w + 120, gBandH + 1);
  }

  // Subtle horizon rim pixel highlight
  ctx.fillStyle = hexToRgba(accent, 0.36);
  ctx.fillRect(-60, horizonY, w + 120, px);

  // Crisp pixel ground tufts / pebbles
  for (let i = 0; i < 24; i++) {
    const gx = Math.round((seededUnit(i * 11.3 + 4) * w) / px) * px;
    const gy = Math.round((horizonY + 14 + seededUnit(i * 7.1 + 9) * (h - horizonY - 24)) / px) * px;
    ctx.fillStyle = hexToRgba(i % 2 === 0 ? accent : groundB, 0.45);
    ctx.fillRect(gx, gy, px * 2, px);
  }
  ctx.restore();

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
    // High-glare / bright snowy, sandy, molten, prismatic arenas: stronger dark focal cushion
    // so bright lava/snow/sand behind the fighter softens gently without removing the vista.
    case 'volcano':
      return { veilHex: '#120810', veilAlpha: 0.48, backlightHex: '#ffe8cc', backlightAlpha: 0.16 };
    case 'peak':
      return { veilHex: '#0b1836', veilAlpha: 0.42, backlightHex: '#dff8ff', backlightAlpha: 0.14 };
    case 'desert':
    case 'atoll':
      return { veilHex: '#1a1224', veilAlpha: 0.40, backlightHex: '#fff3d6', backlightAlpha: 0.15 };
    case 'water':
    case 'reef':
      return { veilHex: '#081b34', veilAlpha: 0.36, backlightHex: '#d4f6ff', backlightAlpha: 0.18 };
    case 'crater':
    case 'sanctum':
      return { veilHex: '#0e1030', veilAlpha: 0.42, backlightHex: '#e8f0ff', backlightAlpha: 0.18 };
    case 'canyon':
      return { veilHex: '#180e1c', veilAlpha: 0.38, backlightHex: '#ffefc8', backlightAlpha: 0.18 };
    // Lush / busy foliage arenas: balanced contrast cushion + crisp atmospheric mist glow
    case 'forest':
    case 'grove':
    case 'faeveldt':
      return { veilHex: '#09161d', veilAlpha: 0.34, backlightHex: '#eefbe8', backlightAlpha: 0.22 };
    // Deep twilight / dark cavern arenas: subtle noise-softening cushion + clear moonlit backlight
    // so dark silhouettes (Umbreon, Gengar, Onix, Darkrai) pop immediately off dark backgrounds.
    case 'cave':
    case 'rift':
    case 'marsh':
    case 'highlands':
    case 'ruins':
    case 'village':
    default:
      return { veilHex: '#090d22', veilAlpha: 0.30, backlightHex: '#dceeff', backlightAlpha: 0.26 };
  }
}

const FOCAL_SPRITE_CACHE = new Map<string, HTMLCanvasElement>();

function getCachedRadialDiscSprite(
  hex: string,
  stops: ReadonlyArray<readonly [number, number]>,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  const key = `${hex}|${stops.map(([o, a]) => `${o.toFixed(2)}:${a.toFixed(2)}`).join(',')}`;
  const cached = FOCAL_SPRITE_CACHE.get(key);
  if (cached) return cached;

  try {
    const size = 64;
    const half = size * 0.5;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const cctx = canvas.getContext('2d', { willReadFrequently: true }) ?? canvas.getContext('2d');
    if (!cctx) return null;
    const grad = cctx.createRadialGradient(half, half, half * 0.08, half, half, half);
    for (const [offset, alpha] of stops) {
      grad.addColorStop(offset, hexToRgba(hex, alpha));
    }
    cctx.fillStyle = grad;
    cctx.fillRect(0, 0, size, size);
    if (FOCAL_SPRITE_CACHE.size > 64) {
      FOCAL_SPRITE_CACHE.clear();
    }
    FOCAL_SPRITE_CACHE.set(key, canvas);
    return canvas;
  } catch {
    return null;
  }
}

function drawCombatZoneFocalSeparation(
  ctx: CanvasRenderingContext2D,
  pad: BattlePadAnchor,
  tuning: FocalSeparationTuning,
  pulse: number,
): void {
  const cx = pad.x;
  const cy = pad.spriteCy - pad.size * 0.04;

  // 1. Soft radial depth-of-field contrast-softening mist behind the combatant
  // Gently quiets high-frequency arena clutter (lava falls, snow ridges, foliage, crystals)
  // directly behind the Pokémon silhouette while keeping the full scenic arena intact.
  const veilRx = pad.size * 0.96;
  const veilRy = pad.size * 0.74;
  const veilSprite = getCachedRadialDiscSprite(tuning.veilHex, [
    [0, tuning.veilAlpha],
    [0.54, tuning.veilAlpha * 0.56],
    [0.82, tuning.veilAlpha * 0.18],
    [1, 0],
  ]);
  if (veilSprite) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(veilSprite, cx - veilRx, cy - veilRy, veilRx * 2, veilRy * 2);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, veilRy / Math.max(1, veilRx));
    const veilGrad = ctx.createRadialGradient(0, 0, veilRx * 0.12, 0, 0, veilRx);
    veilGrad.addColorStop(0, hexToRgba(tuning.veilHex, tuning.veilAlpha));
    veilGrad.addColorStop(0.54, hexToRgba(tuning.veilHex, tuning.veilAlpha * 0.56));
    veilGrad.addColorStop(0.82, hexToRgba(tuning.veilHex, tuning.veilAlpha * 0.18));
    veilGrad.addColorStop(1, hexToRgba(tuning.veilHex, 0));
    ctx.fillStyle = veilGrad;
    ctx.beginPath();
    ctx.arc(0, 0, veilRx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 2. Subtle studio-grade luminous rim-backlight directly behind upper torso/head
  // Gives dark-colored Pokémon crisp separation even in caves, forests, and rifts.
  const haloRx = pad.size * 0.54;
  const haloRy = pad.size * 0.46;
  const haloCy = pad.spriteCy - pad.size * 0.08;
  const haloAlpha = clamp(tuning.backlightAlpha + pulse * 0.10, 0.10, 0.36);
  // Quantize pulse-driven alpha to 0.02 steps so sprite cache stays bounded & hot
  const qHaloAlpha = Math.round(haloAlpha * 50) / 50;
  const haloSprite = getCachedRadialDiscSprite(tuning.backlightHex, [
    [0, qHaloAlpha],
    [0.5, qHaloAlpha * 0.42],
    [1, 0],
  ]);
  if (haloSprite) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(haloSprite, cx - haloRx, haloCy - haloRy, haloRx * 2, haloRy * 2);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(cx, haloCy);
    ctx.scale(1, haloRy / Math.max(1, haloRx));
    const haloGrad = ctx.createRadialGradient(0, 0, haloRx * 0.08, 0, 0, haloRx);
    haloGrad.addColorStop(0, hexToRgba(tuning.backlightHex, haloAlpha));
    haloGrad.addColorStop(0.5, hexToRgba(tuning.backlightHex, haloAlpha * 0.42));
    haloGrad.addColorStop(1, hexToRgba(tuning.backlightHex, 0));
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(0, 0, haloRx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
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
  const deckBase = mixHex(arena.groundPrimaryHex, '#181e38', 0.28);
  const deckLight = mixHex(arena.groundPrimaryHex, '#eef4ff', 0.22);
  const skirtColor = mixHex(arena.groundSecondaryHex, '#0c1026', 0.55);
  const rimHighlight = mixHex(glowColor, '#fff8e8', 0.38);
  const inkBorder = 'rgba(7, 10, 24, 0.88)';

  // 1. Subtle reflective pool / aura glow beneath platform on reflective arenas
  if (arena.reflectionAlpha > 0.05) {
    drawPixelSteppedDisc(
      ctx,
      pad.x,
      pad.y + px * 2.5,
      pad.rx * 1.12,
      pad.ry * 1.24,
      px,
      hexToRgba(glowColor, arena.reflectionAlpha * (0.24 + pulse * 0.22)),
    );
  }

  // 2. Deep grounded drop-shadow beneath platform skirt
  drawPixelSteppedDisc(
    ctx,
    pad.x,
    pad.y + px * 2.5,
    pad.rx * 1.04,
    pad.ry * 1.06,
    px,
    'rgba(5, 7, 20, 0.62)',
  );

  // 3. 3D-beveled lower platform rim/skirt (gives real pixel-art thickness & weight!)
  drawPixelSteppedDisc(
    ctx,
    pad.x,
    pad.y + px * 1.5,
    pad.rx * 0.98,
    pad.ry * 0.94,
    px,
    hexToRgba(skirtColor, 0.90),
    inkBorder,
  );

  // 4. Main top battle deck surface
  drawPixelSteppedDisc(
    ctx,
    pad.x,
    pad.y,
    pad.rx * 0.96,
    pad.ry * 0.86,
    px,
    hexToRgba(deckBase, 0.84),
    inkBorder,
  );

  // 5. Crisp inner lit plateau & subtle biome surface bevel
  drawPixelSteppedDisc(
    ctx,
    pad.x,
    pad.y - px * 0.4,
    pad.rx * 0.84,
    pad.ry * 0.68,
    px,
    hexToRgba(deckLight, 0.30),
    hexToRgba(rimHighlight, 0.42 + pulse * 0.32),
  );

  // 6. Biome-crafted platform detail accents (all pixel-snapped!)
  const snappedY = Math.round(pad.y / px) * px;
  switch (arena.pedestalKind) {
    case 'water-mirror': {
      const ripple = 1 + Math.sin(t * 2.2) * 0.04;
      drawPixelSteppedDisc(
        ctx,
        pad.x,
        pad.y,
        pad.rx * 0.68 * ripple,
        pad.ry * 0.50 * ripple,
        px,
        'rgba(0, 0, 0, 0)',
        hexToRgba('#b8f4ff', 0.44 + pulse * 0.25),
      );
      break;
    }
    case 'basalt-forge': {
      // Glowing ember fissure notches on basalt rim
      ctx.fillStyle = hexToRgba('#ff9f43', 0.68 + pulse * 0.28);
      for (const sx of [-0.62, -0.22, 0.28, 0.66]) {
        const ex = Math.round((pad.x + sx * pad.rx) / px) * px;
        ctx.fillRect(ex, snappedY + px, px * 2, px);
      }
      break;
    }
    case 'crystal-dias':
    case 'frost-mirror': {
      // Specular crystalline glint dashes across upper deck
      ctx.fillStyle = hexToRgba('#e8faff', 0.62 + pulse * 0.24);
      const gx1 = Math.round((pad.x - pad.rx * 0.48) / px) * px;
      const gx2 = Math.round((pad.x + pad.rx * 0.34) / px) * px;
      ctx.fillRect(gx1, snappedY - px, px * 4, px);
      ctx.fillRect(gx2, snappedY, px * 3, px);
      break;
    }
    case 'moss-stone': {
      // Tiny pixel grass/petal accents tucked around stone edge
      ctx.fillStyle = hexToRgba(arena.accentHex, 0.65);
      for (const sx of [-0.72, -0.35, 0.42, 0.72]) {
        const mx = Math.round((pad.x + sx * pad.rx) / px) * px;
        ctx.fillRect(mx, snappedY + (sx < 0 ? 0 : px), px * 2, px);
      }
      break;
    }
    case 'cobble-rune':
    case 'astral-marble':
    case 'sandstone-dais':
    default: {
      // Carved runic / masonry corner pips along horizontal axis
      for (const sx of [-1, 1] as const) {
        const rx = Math.round((pad.x + sx * pad.rx * 0.74) / px) * px;
        ctx.fillStyle = hexToRgba(rimHighlight, 0.70 + pulse * 0.25);
        ctx.fillRect(rx, snappedY, px * 2, px);
      }
      break;
    }
  }
}

function renderArenaPedestalsAndAtmosphere(
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
  const px = Math.max(2, Math.round(Math.min(w, h) / 180));
  const motion = reducedMotion ? 0.16 : 1.0;
  const t = time * motion;
  const glowColor = activeTintHex ? mixHex(arena.ambientGlowHex, activeTintHex, pulse * 0.65) : arena.ambientGlowHex;
  const focalTuning = getFocalSeparationTuning(arena);

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Elemental arena pulse lighting wash over stage during move impact
  if (activeTintHex && pulse > 0.02) {
    ctx.fillStyle = hexToRgba(activeTintHex, pulse * 0.14);
    ctx.fillRect(0, 0, w, h);
  }

  applyCameraToContext(ctx, w, h, camera);

  // 1. Atmospheric focal separation behind BOTH combat zones (preserves rich background while
  // giving unmistakable figure-ground depth separation behind both Pokémon silhouettes!)
  drawCombatZoneFocalSeparation(ctx, layout.enemyPad, focalTuning, pulse);
  drawCombatZoneFocalSeparation(ctx, layout.playerPad, focalTuning, pulse);

  // 2. Upgraded layered pixel-art battleground platforms beneath both combatants
  drawCraftedBattlePlatform(ctx, layout.enemyPad, arena, glowColor, px, pulse, t);
  drawCraftedBattlePlatform(ctx, layout.playerPad, arena, glowColor, px, pulse, t);

  // Dynamic biome-matched atmospheric pixel motes
  const moteCount = reducedMotion ? 8 : 18;
  for (let i = 0; i < moteCount; i++) {
    const seedA = seededUnit(i * 13.7 + arena.biomeId.length);
    const seedB = seededUnit(i * 29.1 + 5);
    const baseSpeed =
      arena.weatherKind === 'embers' || arena.weatherKind === 'sparks' || arena.weatherKind === 'bubbles'
        ? -0.09
        : arena.weatherKind === 'snowflakes' || arena.weatherKind === 'petals'
          ? 0.08
          : 0.03;

    const u = ((seedA + Math.sin(t * 0.6 + i) * 0.04 + (arena.weatherKind === 'dust' ? t * 0.06 : 0)) % 1 + 1) % 1;
    const v = ((seedB + t * baseSpeed * (0.7 + (i % 3) * 0.25)) % 1 + 1) % 1;
    const mx = Math.round((u * w) / px) * px;
    const my = Math.round((v * h * 0.88) / px) * px;
    const flicker = 0.4 + 0.6 * Math.sin(t * 3.1 + i * 1.7);

    switch (arena.weatherKind) {
      case 'embers': {
        ctx.fillStyle = hexToRgba(i % 2 === 0 ? '#ff9f43' : '#ffe066', flicker * 0.85);
        ctx.fillRect(mx, my, px, px * 2);
        break;
      }
      case 'snowflakes': {
        ctx.fillStyle = hexToRgba('#eafaff', 0.72 * flicker);
        ctx.fillRect(mx, my, px, px);
        if (i % 3 === 0) ctx.fillRect(mx + px, my, px, px);
        break;
      }
      case 'petals': {
        ctx.fillStyle = hexToRgba(i % 2 === 0 ? '#ffb8e6' : '#ffe6f7', 0.8 * flicker);
        ctx.fillRect(mx, my, px * 2, px);
        break;
      }
      case 'bubbles': {
        ctx.fillStyle = hexToRgba('#9be8ff', 0.68 * flicker);
        ctx.fillRect(mx, my, px * 2, px * 2);
        ctx.fillStyle = hexToRgba('#ffffff', 0.85);
        ctx.fillRect(mx, my, px, px);
        break;
      }
      case 'spores': {
        ctx.fillStyle = hexToRgba(i % 2 === 0 ? '#5eead4' : '#d8b4fe', 0.78 * flicker);
        ctx.fillRect(mx, my, px * 2, px * 2);
        break;
      }
      case 'sparks': {
        ctx.fillStyle = hexToRgba('#ffe666', 0.82 * flicker);
        ctx.fillRect(mx, my, px * 2, px);
        ctx.fillRect(mx + px, my - px, px, px);
        break;
      }
      case 'dust': {
        ctx.fillStyle = hexToRgba('#ffe4ad', 0.45 * flicker);
        ctx.fillRect(mx, my, px * 2, px);
        break;
      }
      case 'starlight':
      case 'fireflies':
      default: {
        if (i % 4 === 0) {
          drawPixelCrossStar(ctx, mx, my, px, px, hexToRgba(glowColor, flicker * 0.82));
        } else {
          ctx.fillStyle = hexToRgba(glowColor, flicker * 0.78);
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

  // Subtle neutral-warm key lights centered on combatant silhouettes so fighters read vividly
  // in dark/tinted biomes without washing out sprite colors or native pixel shading.
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
    // Compensate partial camera offset so 480x270 arena pans with subtle parallax depth
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
  } else {
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
    }, 'world');
  }

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
}

export function renderArenaForeground(
  backend: IRenderBackend,
  arena: BattleArenaDescriptor,
  state: BattleSceneState,
  camera: BattleCameraTransform,
  time: number,
): void {
  const pulse = clamp(state.arenaLightingPulse, 0, 1);
  const activeTintHex = state.arenaLightingType
    ? TYPE_PALETTES[state.arenaLightingType]?.primary ?? null
    : null;
  const glowHex = activeTintHex ? mixHex(arena.ambientGlowHex, activeTintHex, pulse * 0.6) : arena.ambientGlowHex;

  backend.drawCustom2D((ctx, width, height) => {
    const px = Math.max(2, Math.round(Math.min(width, height) / 180));
    const motion = state.reducedMotion ? 0.12 : 1.0;
    const sway = Math.round((Math.sin(time * 1.4 * motion) * 4) / px) * px;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    applyParallaxToContext(ctx, width, height, camera, 1.18);

    // Subtle edge pixel accents that frame the arena without obscuring sprites
    ctx.fillStyle = hexToRgba(glowHex, 0.24 + pulse * 0.22);
    for (let i = 0; i < 6; i++) {
      const fx = Math.round((width * (0.04 + (i % 3) * 0.03) + sway) / px) * px;
      const fy = Math.round((height * (0.76 + Math.floor(i / 3) * 0.07)) / px) * px;
      ctx.fillRect(fx, fy, px, px);
      ctx.fillRect(width - fx - px, fy, px, px);
    }

    // Soft pixel-stepped bottom frame shade (zero per-frame CanvasGradient allocations)
    const shadeTop = Math.round(height * 0.86);
    const shadeH = Math.max(8, Math.ceil((height + 20 - shadeTop) / 4));
    const shadeAlphas = [0.06, 0.14, 0.24, 0.34];
    for (let b = 0; b < 4; b++) {
      ctx.fillStyle = `rgba(8, 11, 28, ${shadeAlphas[b]})`;
      ctx.fillRect(-40, shadeTop + b * shadeH, width + 80, shadeH + 1);
    }

    ctx.restore();
  }, 'world');
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
