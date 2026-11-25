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
  const playerSize = minDim * 0.285;
  const enemySize = minDim * 0.24;
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
      rx: Math.round(w * 0.125),
      ry: Math.round(h * 0.044),
      spriteCy: playerPadY - playerSize * 0.45,
      size: playerSize,
    },
    enemyPad: {
      x: w * 0.725,
      y: enemyPadY,
      rx: Math.round(w * 0.105),
      ry: Math.round(h * 0.036),
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

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Elemental arena pulse lighting wash over stage during move impact
  if (activeTintHex && pulse > 0.02) {
    ctx.fillStyle = hexToRgba(activeTintHex, pulse * 0.16);
    ctx.fillRect(0, 0, w, h);
  }

  applyCameraToContext(ctx, w, h, camera);

  // Subtle reflective ground sheen + grounded pixel-art pedestals beneath both combatants
  for (const pad of [layout.enemyPad, layout.playerPad]) {
    const padFill = mixHex(arena.groundPrimaryHex, '#12162e', 0.38);
    const padRim = mixHex(glowColor, '#ffffff', 0.22);

    // Subtle reflective sheen beneath pedestal
    if (arena.reflectionAlpha > 0.05) {
      drawPixelSteppedDisc(
        ctx,
        pad.x,
        pad.y + px * 2,
        pad.rx * 1.12,
        pad.ry * 1.25,
        px,
        hexToRgba(glowColor, arena.reflectionAlpha * (0.28 + pulse * 0.25)),
      );
    }

    // Grounded outer shadow ring + pedestal base
    drawPixelSteppedDisc(
      ctx,
      pad.x,
      pad.y + px,
      pad.rx * 1.04,
      pad.ry * 1.06,
      px,
      'rgba(8, 10, 26, 0.48)',
    );
    drawPixelSteppedDisc(
      ctx,
      pad.x,
      pad.y,
      pad.rx * 0.94,
      pad.ry * 0.88,
      px,
      hexToRgba(padFill, 0.56),
      hexToRgba(padRim, 0.42 + pulse * 0.34),
    );

    // Runic corner pixel pips on pedestal edge
    for (const sx of [-1, 1] as const) {
      const rx = Math.round((pad.x + sx * pad.rx * 0.72) / px) * px;
      const ry = Math.round(pad.y / px) * px;
      ctx.fillStyle = hexToRgba(glowColor, 0.55 + pulse * 0.35);
      ctx.fillRect(rx, ry, px, px);
    }
  }

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

  backend.addPointLight({
    id: `arena-horizon-${arena.biomeId}`,
    x: layout.centerX,
    y: layout.horizonY,
    radius: minDim * 0.65,
    color: baseRgb,
    intensity: 0.52 + pulse * 0.28,
    flickerSpeed: 2.2,
    flickerAmount: state.reducedMotion ? 0 : 0.08,
  });

  backend.addPointLight({
    id: `arena-player-pad-${arena.biomeId}`,
    x: layout.playerPad.x,
    y: layout.playerPad.spriteCy,
    radius: minDim * 0.42,
    color: activeType ? activeRgb : baseRgb,
    intensity: 0.42 + pulse * 0.46,
    flickerSpeed: 3.1,
    flickerAmount: state.reducedMotion ? 0 : 0.06,
  });

  backend.addPointLight({
    id: `arena-enemy-pad-${arena.biomeId}`,
    x: layout.enemyPad.x,
    y: layout.enemyPad.spriteCy,
    radius: minDim * 0.40,
    color: activeType ? activeRgb : baseRgb,
    intensity: 0.44 + pulse * 0.50,
    flickerSpeed: 3.4,
    flickerAmount: state.reducedMotion ? 0 : 0.07,
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

    // Soft pixel-stepped bottom frame shade
    const shadeGrad = ctx.createLinearGradient(0, height * 0.86, 0, height + 20);
    shadeGrad.addColorStop(0, 'rgba(8, 11, 28, 0)');
    shadeGrad.addColorStop(1, 'rgba(8, 11, 28, 0.34)');
    ctx.fillStyle = shadeGrad;
    ctx.fillRect(-40, height * 0.86, width + 80, height * 0.2);

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
