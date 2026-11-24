import type {
  BattleArenaDescriptor,
  BattleParallaxPlane,
  BattleSceneState,
  BiomeId,
  ElementalType,
  IRenderBackend,
} from '../../contracts';
import {
  BIOME_COLOR_GRADES,
  BIOME_DESCRIPTORS,
  TYPE_PALETTES,
} from '../../core';

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

export function computeBattleStageLayout(width: number, height: number): BattleStageLayout {
  const w = Math.max(320, width);
  const h = Math.max(200, height);
  const minDim = Math.min(w, h);
  return {
    width: w,
    height: h,
    horizonY: h * 0.43,
    stageTopY: h * 0.48,
    centerX: w * 0.5,
    centerY: h * 0.59,
    playerPad: {
      x: w * 0.27,
      y: h * 0.65,
      rx: w * 0.145,
      ry: h * 0.052,
      spriteCy: h * 0.565,
      size: minDim * 0.285,
    },
    enemyPad: {
      x: w * 0.725,
      y: h * 0.465,
      rx: w * 0.125,
      ry: h * 0.044,
      spriteCy: h * 0.395,
      size: minDim * 0.245,
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

export function safeEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation = 0,
  startAngle = 0,
  endAngle = Math.PI * 2,
): void {
  const safeRx = Math.max(0.5, rx);
  const safeRy = Math.max(0.5, ry);
  if (typeof ctx.ellipse === 'function') {
    ctx.ellipse(cx, cy, safeRx, safeRy, rotation, startAngle, endAngle);
    return;
  }
  ctx.save();
  ctx.translate(cx, cy);
  if (rotation !== 0) ctx.rotate(rotation);
  ctx.scale(safeRx, safeRy);
  ctx.arc(0, 0, 1, startAngle, endAngle);
  ctx.restore();
}

export function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function drawPolygonPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation = 0,
): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    const px = cx + Math.cos(a) * radius;
    const py = cy + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function drawStarPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points = 4,
  rotation = 0,
): void {
  ctx.beginPath();
  const total = points * 2;
  for (let i = 0; i < total; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = rotation + (i / total) * Math.PI * 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function makePlanes(
  sky: [string, string, string],
  far: [string, string, string],
  mid: [string, string, string],
  ground: [string, string, string],
  fg: [string, string, string],
): BattleArenaDescriptor['planes'] {
  const plane = (
    name: BattleParallaxPlane['name'],
    parallaxFactor: number,
    [primaryHex, secondaryHex, accentHex]: [string, string, string],
  ): BattleParallaxPlane => ({
    name,
    parallaxFactor,
    primaryHex,
    secondaryHex,
    accentHex,
  });

  return [
    plane('sky', 0.05, sky),
    plane('far-horizon', 0.18, far),
    plane('mid-landmarks', 0.42, mid),
    plane('combat-ground', 1.0, ground),
    plane('foreground-frame', 1.32, fg),
  ];
}

type SkyPhenomenon = 'moon-stars' | 'aurora' | 'sunbeams' | 'nebula' | 'storm-clouds' | 'eclipse';
type HorizonKind = 'harbor-domes' | 'rolling-hills' | 'canopy-ridges' | 'volcano-cones' | 'sea-stacks' | 'quartz-spires' | 'glacier-peaks' | 'bamboo-mountains' | 'bayou-cypress' | 'desert-mesas' | 'sky-islands' | 'floating-monoliths' | 'amber-canopy' | 'basalt-cliffs' | 'misty-pines' | 'cloud-sea-peaks' | 'obsidian-needles' | 'foundry-skyline' | 'sakura-ridges';
type LandmarkKind = 'observatory-lanterns' | 'windmill-shrine' | 'sunbeam-trees' | 'caldera-arches' | 'coral-arch' | 'thunder-pylons' | 'ice-cathedral' | 'dojo-torii' | 'glow-mushrooms' | 'mesa-arches' | 'wind-rings' | 'astral-astrolabe' | 'honey-hollow' | 'starstone-cranes' | 'wisp-shrine' | 'wyrm-gate' | 'eclipse-monolith' | 'clockwork-gears' | 'sakura-torii';
type ForegroundKind = 'lantern-boughs' | 'clover-fronds' | 'hanging-vines' | 'obsidian-horns' | 'coral-kelp' | 'quartz-clusters' | 'icicle-frame' | 'bamboo-stalks' | 'willow-spores' | 'canyon-agave' | 'wind-clouds' | 'rune-pillars' | 'moss-branches' | 'basalt-columns' | 'gnarled-pines' | 'cloud-pillars' | 'shadow-spires' | 'iron-girders' | 'sakura-boughs';

interface ArenaMotif {
  sky: SkyPhenomenon;
  horizon: HorizonKind;
  landmark: LandmarkKind;
  foreground: ForegroundKind;
  starDensity: number;
  hasWaterMirror: boolean;
}

const ARENA_MOTIFS: Record<BiomeId, ArenaMotif> = {
  'starlight-village': { sky: 'moon-stars', horizon: 'harbor-domes', landmark: 'observatory-lanterns', foreground: 'lantern-boughs', starDensity: 34, hasWaterMirror: true },
  meadow: { sky: 'sunbeams', horizon: 'rolling-hills', landmark: 'windmill-shrine', foreground: 'clover-fronds', starDensity: 12, hasWaterMirror: false },
  'verdant-canopy': { sky: 'sunbeams', horizon: 'canopy-ridges', landmark: 'sunbeam-trees', foreground: 'hanging-vines', starDensity: 16, hasWaterMirror: false },
  'ember-caldera': { sky: 'storm-clouds', horizon: 'volcano-cones', landmark: 'caldera-arches', foreground: 'obsidian-horns', starDensity: 18, hasWaterMirror: false },
  'sapphire-lagoon': { sky: 'moon-stars', horizon: 'sea-stacks', landmark: 'coral-arch', foreground: 'coral-kelp', starDensity: 28, hasWaterMirror: true },
  'volt-highlands': { sky: 'storm-clouds', horizon: 'quartz-spires', landmark: 'thunder-pylons', foreground: 'quartz-clusters', starDensity: 24, hasWaterMirror: false },
  'frost-glacier': { sky: 'aurora', horizon: 'glacier-peaks', landmark: 'ice-cathedral', foreground: 'icicle-frame', starDensity: 32, hasWaterMirror: false },
  'valor-dojo': { sky: 'sunbeams', horizon: 'bamboo-mountains', landmark: 'dojo-torii', foreground: 'bamboo-stalks', starDensity: 16, hasWaterMirror: false },
  'mire-bayou': { sky: 'nebula', horizon: 'bayou-cypress', landmark: 'glow-mushrooms', foreground: 'willow-spores', starDensity: 26, hasWaterMirror: true },
  'ochre-canyon': { sky: 'sunbeams', horizon: 'desert-mesas', landmark: 'mesa-arches', foreground: 'canyon-agave', starDensity: 18, hasWaterMirror: false },
  'zephyr-peaks': { sky: 'aurora', horizon: 'sky-islands', landmark: 'wind-rings', foreground: 'wind-clouds', starDensity: 28, hasWaterMirror: false },
  'astral-ruins': { sky: 'nebula', horizon: 'floating-monoliths', landmark: 'astral-astrolabe', foreground: 'rune-pillars', starDensity: 40, hasWaterMirror: false },
  'amber-thicket': { sky: 'sunbeams', horizon: 'amber-canopy', landmark: 'honey-hollow', foreground: 'moss-branches', starDensity: 20, hasWaterMirror: false },
  'basalt-quarry': { sky: 'moon-stars', horizon: 'basalt-cliffs', landmark: 'starstone-cranes', foreground: 'basalt-columns', starDensity: 22, hasWaterMirror: false },
  'mist-hollow': { sky: 'moon-stars', horizon: 'misty-pines', landmark: 'wisp-shrine', foreground: 'gnarled-pines', starDensity: 30, hasWaterMirror: false },
  'drake-summit': { sky: 'aurora', horizon: 'cloud-sea-peaks', landmark: 'wyrm-gate', foreground: 'cloud-pillars', starDensity: 38, hasWaterMirror: false },
  'eclipse-crag': { sky: 'eclipse', horizon: 'obsidian-needles', landmark: 'eclipse-monolith', foreground: 'shadow-spires', starDensity: 36, hasWaterMirror: false },
  'aegis-foundry': { sky: 'storm-clouds', horizon: 'foundry-skyline', landmark: 'clockwork-gears', foreground: 'iron-girders', starDensity: 20, hasWaterMirror: false },
  'starbloom-glade': { sky: 'moon-stars', horizon: 'sakura-ridges', landmark: 'sakura-torii', foreground: 'sakura-boughs', starDensity: 34, hasWaterMirror: true },
};

export const BATTLE_ARENAS: Record<BiomeId, BattleArenaDescriptor> = {
  'starlight-village': {
    biomeId: 'starlight-village',
    elementalType: BIOME_DESCRIPTORS['starlight-village'].elementalType,
    name: `${BIOME_DESCRIPTORS['starlight-village'].name} Harbor Theater`,
    planes: makePlanes(
      ['#0e1638', '#2a3d7a', '#ffd479'],
      ['#1a2552', '#2f4578', '#8eb8ff'],
      ['#26345e', '#4f7d58', '#ffcf70'],
      ['#28528a', '#3f6e49', '#ffd479'],
      ['#121b38', '#1e2c52', '#ffe08a'],
    ),
    platformKind: 'water-mirror',
    ambientGlowHex: '#ffd479',
    reflectionAlpha: 0.42,
  },
  meadow: {
    biomeId: 'meadow',
    elementalType: BIOME_DESCRIPTORS.meadow.elementalType,
    name: `${BIOME_DESCRIPTORS.meadow.name} Arena`,
    planes: makePlanes(
      ['#2b6cb0', '#63b3ed', '#fff3a8'],
      ['#46829e', '#5fa678', '#d4f2b8'],
      ['#518c54', '#7b654c', '#fff3a8'],
      ['#69a653', '#4f8f3d', '#e6e0c8'],
      ['#285729', '#3a7538', '#fff5b8'],
    ),
    platformKind: 'meadow-stone',
    ambientGlowHex: '#fff3a8',
    reflectionAlpha: 0.14,
  },
  'verdant-canopy': {
    biomeId: 'verdant-canopy',
    elementalType: BIOME_DESCRIPTORS['verdant-canopy'].elementalType,
    name: `${BIOME_DESCRIPTORS['verdant-canopy'].name} Clearing`,
    planes: makePlanes(
      ['#153b3b', '#2c6e58', '#9cf7b5'],
      ['#1b4a3e', '#2e6b4d', '#7ef29d'],
      ['#1c4230', '#38784b', '#b8ffd0'],
      ['#38784b', '#255c37', '#7ef29d'],
      ['#10261b', '#1c3d2a', '#9affbd'],
    ),
    platformKind: 'meadow-stone',
    ambientGlowHex: '#7ef29d',
    reflectionAlpha: 0.18,
  },
  'ember-caldera': {
    biomeId: 'ember-caldera',
    elementalType: BIOME_DESCRIPTORS['ember-caldera'].elementalType,
    name: `${BIOME_DESCRIPTORS['ember-caldera'].name} Crucible`,
    planes: makePlanes(
      ['#240e1a', '#7a251d', '#ff9f43'],
      ['#3b1820', '#5e241d', '#ff7b33'],
      ['#3d2522', '#613c35', '#ffd166'],
      ['#36211e', '#6b2a19', '#ff7b33'],
      ['#1a0d0e', '#2e1817', '#ff9f43'],
    ),
    platformKind: 'volcanic-basalt',
    ambientGlowHex: '#ff7b33',
    reflectionAlpha: 0.24,
  },
  'sapphire-lagoon': {
    biomeId: 'sapphire-lagoon',
    elementalType: BIOME_DESCRIPTORS['sapphire-lagoon'].elementalType,
    name: `${BIOME_DESCRIPTORS['sapphire-lagoon'].name} Atoll`,
    planes: makePlanes(
      ['#123e73', '#3899d6', '#9be8ff'],
      ['#1b538a', '#2e7ba8', '#7ef2ff'],
      ['#2a6894', '#d4be8d', '#ff8fb8'],
      ['#155b9e', '#38c7f0', '#d4be8d'],
      ['#0d2f5c', '#184b7a', '#7ef2ff'],
    ),
    platformKind: 'water-mirror',
    ambientGlowHex: '#7ef2ff',
    reflectionAlpha: 0.48,
  },
  'volt-highlands': {
    biomeId: 'volt-highlands',
    elementalType: BIOME_DESCRIPTORS['volt-highlands'].elementalType,
    name: `${BIOME_DESCRIPTORS['volt-highlands'].name} Spire`,
    planes: makePlanes(
      ['#151942', '#3a4980', '#ffe052'],
      ['#232b57', '#3f4b78', '#9bd4ff'],
      ['#323c5c', '#4f5569', '#ffe052'],
      ['#465266', '#57685e', '#fff185'],
      ['#1a2033', '#2d354d', '#ffe052'],
    ),
    platformKind: 'crystal-dias',
    ambientGlowHex: '#ffe052',
    reflectionAlpha: 0.30,
  },
  'frost-glacier': {
    biomeId: 'frost-glacier',
    elementalType: BIOME_DESCRIPTORS['frost-glacier'].elementalType,
    name: `${BIOME_DESCRIPTORS['frost-glacier'].name} Mirror`,
    planes: makePlanes(
      ['#0d2240', '#3176a8', '#a3f7ff'],
      ['#1e4b73', '#4e8eb8', '#b8f5ff'],
      ['#357499', '#6e8ea8', '#dffaff'],
      ['#8bc4de', '#b8dff0', '#ffffff'],
      ['#173a59', '#386d94', '#a3f7ff'],
    ),
    platformKind: 'crystal-dias',
    ambientGlowHex: '#a3f7ff',
    reflectionAlpha: 0.44,
  },
  'valor-dojo': {
    biomeId: 'valor-dojo',
    elementalType: BIOME_DESCRIPTORS['valor-dojo'].elementalType,
    name: `${BIOME_DESCRIPTORS['valor-dojo'].name} Courtyard`,
    planes: makePlanes(
      ['#2b243b', '#875754', '#ff9b8f'],
      ['#3d334a', '#635361', '#ffc9b5'],
      ['#524349', '#7a8a56', '#ff7d6b'],
      ['#7a8a56', '#6b5748', '#ff7d6b'],
      ['#233321', '#3d5932', '#ffb09e'],
    ),
    platformKind: 'meadow-stone',
    ambientGlowHex: '#ff7d6b',
    reflectionAlpha: 0.16,
  },
  'mire-bayou': {
    biomeId: 'mire-bayou',
    elementalType: BIOME_DESCRIPTORS['mire-bayou'].elementalType,
    name: `${BIOME_DESCRIPTORS['mire-bayou'].name} Basin`,
    planes: makePlanes(
      ['#140c29', '#45266b', '#d07aff'],
      ['#21143d', '#3b245e', '#9c66e3'],
      ['#2d2247', '#4e3569', '#e4b8ff'],
      ['#351b5c', '#453e59', '#d07aff'],
      ['#150e24', '#261a3d', '#e19cff'],
    ),
    platformKind: 'water-mirror',
    ambientGlowHex: '#d07aff',
    reflectionAlpha: 0.44,
  },
  'ochre-canyon': {
    biomeId: 'ochre-canyon',
    elementalType: BIOME_DESCRIPTORS['ochre-canyon'].elementalType,
    name: `${BIOME_DESCRIPTORS['ochre-canyon'].name} Overlook`,
    planes: makePlanes(
      ['#361e36', '#c46c43', '#ffd185'],
      ['#592c38', '#8c4c2b', '#ffba73'],
      ['#783e27', '#a86739', '#ffe0a8'],
      ['#9e6c38', '#c4864b', '#ffd185'],
      ['#422117', '#6b3722', '#ffc67d'],
    ),
    platformKind: 'volcanic-basalt',
    ambientGlowHex: '#ffd185',
    reflectionAlpha: 0.14,
  },
  'zephyr-peaks': {
    biomeId: 'zephyr-peaks',
    elementalType: BIOME_DESCRIPTORS['zephyr-peaks'].elementalType,
    name: `${BIOME_DESCRIPTORS['zephyr-peaks'].name} Aerie`,
    planes: makePlanes(
      ['#1a3875', '#6eb4eb', '#e0f4ff'],
      ['#3b69a3', '#7ba8cc', '#ffffff'],
      ['#5b809e', '#7d9e89', '#b8e2ff'],
      ['#798599', '#d9ecff', '#b8e2ff'],
      ['#334e75', '#8fbbe0', '#ffffff'],
    ),
    platformKind: 'cloud-ledge',
    ambientGlowHex: '#b8e2ff',
    reflectionAlpha: 0.22,
  },
  'astral-ruins': {
    biomeId: 'astral-ruins',
    elementalType: BIOME_DESCRIPTORS['astral-ruins'].elementalType,
    name: `${BIOME_DESCRIPTORS['astral-ruins'].name} Dais`,
    planes: makePlanes(
      ['#120c33', '#562f7d', '#ff7ec3'],
      ['#241952', '#473078', '#c79eff'],
      ['#362b63', '#574c7d', '#ff9cd5'],
      ['#40385e', '#6c4b8f', '#ff7ec3'],
      ['#1c1638', '#302657', '#ffb8df'],
    ),
    platformKind: 'astral-marble',
    ambientGlowHex: '#ff7ec3',
    reflectionAlpha: 0.36,
  },
  'amber-thicket': {
    biomeId: 'amber-thicket',
    elementalType: BIOME_DESCRIPTORS['amber-thicket'].elementalType,
    name: `${BIOME_DESCRIPTORS['amber-thicket'].name} Grove`,
    planes: makePlanes(
      ['#1c2b24', '#637a3b', '#d4ff66'],
      ['#293b27', '#4a612c', '#b7eb63'],
      ['#3b4724', '#658038', '#e6ff8a'],
      ['#4b6b23', '#658038', '#d4ff66'],
      ['#1a2414', '#2e3d1d', '#e4ff8f'],
    ),
    platformKind: 'meadow-stone',
    ambientGlowHex: '#d4ff66',
    reflectionAlpha: 0.18,
  },
  'basalt-quarry': {
    biomeId: 'basalt-quarry',
    elementalType: BIOME_DESCRIPTORS['basalt-quarry'].elementalType,
    name: `${BIOME_DESCRIPTORS['basalt-quarry'].name} Terrace`,
    planes: makePlanes(
      ['#1e1f30', '#695c4f', '#f5dc9b'],
      ['#2e2c3b', '#52483e', '#d6bd85'],
      ['#423a31', '#6e6552', '#f5dc9b'],
      ['#594e3f', '#8a7c66', '#ffe8a8'],
      ['#24201c', '#3d352d', '#f5dc9b'],
    ),
    platformKind: 'volcanic-basalt',
    ambientGlowHex: '#f5dc9b',
    reflectionAlpha: 0.20,
  },
  'mist-hollow': {
    biomeId: 'mist-hollow',
    elementalType: BIOME_DESCRIPTORS['mist-hollow'].elementalType,
    name: `${BIOME_DESCRIPTORS['mist-hollow'].name} Shrine`,
    planes: makePlanes(
      ['#0d0e26', '#333466', '#a394ff'],
      ['#191a3d', '#2d2e5c', '#8577e6'],
      ['#252445', '#3c3b5c', '#c8bdff'],
      ['#2b2942', '#3c3b5c', '#a394ff'],
      ['#100f21', '#1e1d38', '#c8bdff'],
    ),
    platformKind: 'astral-marble',
    ambientGlowHex: '#a394ff',
    reflectionAlpha: 0.34,
  },
  'drake-summit': {
    biomeId: 'drake-summit',
    elementalType: BIOME_DESCRIPTORS['drake-summit'].elementalType,
    name: `${BIOME_DESCRIPTORS['drake-summit'].name} Peak`,
    planes: makePlanes(
      ['#0a0f2e', '#32448c', '#8ca8ff'],
      ['#172154', '#2e4180', '#a8baff'],
      ['#273263', '#4b5582', '#d4deff'],
      ['#353a5c', '#6070ad', '#9cb5ff'],
      ['#121733', '#232b52', '#b8c9ff'],
    ),
    platformKind: 'cloud-ledge',
    ambientGlowHex: '#8ca8ff',
    reflectionAlpha: 0.28,
  },
  'eclipse-crag': {
    biomeId: 'eclipse-crag',
    elementalType: BIOME_DESCRIPTORS['eclipse-crag'].elementalType,
    name: `${BIOME_DESCRIPTORS['eclipse-crag'].name} Spire`,
    planes: makePlanes(
      ['#080614', '#2b2147', '#c8b8ff'],
      ['#130f26', '#261e3d', '#9e8fd9'],
      ['#1c172e', '#353042', '#d9ccff'],
      ['#221d2e', '#353042', '#c8b8ff'],
      ['#0c0917', '#1a1529', '#b6a8d4'],
    ),
    platformKind: 'volcanic-basalt',
    ambientGlowHex: '#c8b8ff',
    reflectionAlpha: 0.26,
  },
  'aegis-foundry': {
    biomeId: 'aegis-foundry',
    elementalType: BIOME_DESCRIPTORS['aegis-foundry'].elementalType,
    name: `${BIOME_DESCRIPTORS['aegis-foundry'].name} Arena`,
    planes: makePlanes(
      ['#141d29', '#41586e', '#a8e4ff'],
      ['#1f2c3d', '#3b4e61', '#8ccae8'],
      ['#303e4d', '#516273', '#ffd479'],
      ['#43505e', '#697887', '#a8e4ff'],
      ['#182029', '#2b3642', '#e0f0fc'],
    ),
    platformKind: 'astral-marble',
    ambientGlowHex: '#a8e4ff',
    reflectionAlpha: 0.32,
  },
  'starbloom-glade': {
    biomeId: 'starbloom-glade',
    elementalType: BIOME_DESCRIPTORS['starbloom-glade'].elementalType,
    name: `${BIOME_DESCRIPTORS['starbloom-glade'].name} Sanctum`,
    planes: makePlanes(
      ['#1c1338', '#754487', '#ffa8e2'],
      ['#2d1e4d', '#57376e', '#ffc9eb'],
      ['#3c2b59', '#5f8a74', '#ffa8e2'],
      ['#335d99', '#5f8a74', '#ffd9f2'],
      ['#211433', '#3b244d', '#ffb8e8'],
    ),
    platformKind: 'water-mirror',
    ambientGlowHex: '#ffa8e2',
    reflectionAlpha: 0.44,
  },
};

function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function renderSkyPlane(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  arena: BattleArenaDescriptor,
  motif: ArenaMotif,
  time: number,
  reducedMotion: boolean,
  activeTintHex: string | null,
  pulse: number,
  camera: BattleCameraTransform,
): void {
  const plane = arena.planes[0];
  const grade = BIOME_COLOR_GRADES[arena.biomeId];
  const horizonY = h * 0.49;

  ctx.save();
  // Overscan backdrop so shake/parallax never reveals gaps
  const topHex = activeTintHex ? mixHex(plane.primaryHex, activeTintHex, pulse * 0.28) : plane.primaryHex;
  const midHex = activeTintHex ? mixHex(plane.secondaryHex, activeTintHex, pulse * 0.36) : plane.secondaryHex;
  const accHex = activeTintHex ? mixHex(plane.accentHex, activeTintHex, pulse * 0.45) : plane.accentHex;

  const skyGrad = ctx.createLinearGradient(0, -30, 0, horizonY + 80);
  skyGrad.addColorStop(0, topHex);
  skyGrad.addColorStop(0.62, midHex);
  skyGrad.addColorStop(1, accHex);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-60, -60, w + 120, h + 120);

  applyParallaxToContext(ctx, w, h, camera, plane.parallaxFactor);

  const motionScale = reducedMotion ? 0.15 : 1.0;
  const t = time * motionScale;

  // Starfield & constellation lines
  const starCount = motif.starDensity;
  const starPoints: Array<[number, number]> = [];
  for (let i = 0; i < starCount; i++) {
    const sx = (seededUnit(i * 3.1 + arena.biomeId.length * 7) * 1.1 - 0.05) * w;
    const sy = seededUnit(i * 7.7 + 19) * horizonY * 0.88;
    const twinkle = 0.45 + 0.55 * Math.sin(t * (1.8 + (i % 5) * 0.45) + i * 2.1);
    const alpha = clamp(grade.starlightGlow * twinkle * 0.9, 0.12, 0.95);
    const radius = 0.9 + (i % 3) * 0.7;
    if (i < 7) starPoints.push([sx, sy]);

    ctx.fillStyle = hexToRgba('#fff7d6', alpha);
    if (i % 6 === 0) {
      drawStarPath(ctx, sx, sy, radius * 2.6, radius * 0.7, 4, t * 0.2 + i);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Subtle constellation thread connecting bright stars
  if (starPoints.length >= 4 && grade.starlightGlow > 0.45) {
    ctx.strokeStyle = hexToRgba(accHex, 0.22 * grade.starlightGlow);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(starPoints[0][0], starPoints[0][1]);
    for (let i = 1; i < starPoints.length; i++) {
      ctx.lineTo(starPoints[i][0], starPoints[i][1]);
    }
    ctx.stroke();
  }

  // Sky phenomenon specialization
  if (motif.sky === 'moon-stars' || motif.sky === 'eclipse') {
    const moonX = w * 0.78;
    const moonY = h * 0.15;
    const moonR = Math.min(w, h) * 0.062;
    const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.4, moonX, moonY, moonR * 3.1);
    halo.addColorStop(0, hexToRgba(accHex, 0.45));
    halo.addColorStop(1, hexToRgba(accHex, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 3.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = motif.sky === 'eclipse' ? '#171126' : '#fff5d4';
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    if (motif.sky === 'eclipse') {
      ctx.strokeStyle = hexToRgba('#e6dcff', 0.92);
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  } else if (motif.sky === 'aurora') {
    for (let band = 0; band < 3; band++) {
      ctx.beginPath();
      const baseY = h * (0.12 + band * 0.06);
      for (let x = -40; x <= w + 40; x += 28) {
        const wave = Math.sin(x * 0.011 + t * 0.9 + band * 1.4) * 18;
        const py = baseY + wave;
        if (x === -40) ctx.moveTo(x, py);
        else ctx.lineTo(x, py);
      }
      ctx.strokeStyle = hexToRgba(band % 2 === 0 ? accHex : '#85ffd4', 0.24 - band * 0.04);
      ctx.lineWidth = 18 - band * 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  } else if (motif.sky === 'nebula') {
    const nebX = w * 0.52;
    const nebY = h * 0.18;
    const neb = ctx.createRadialGradient(nebX, nebY, 8, nebX, nebY, w * 0.34);
    neb.addColorStop(0, hexToRgba(accHex, 0.36));
    neb.addColorStop(0.55, hexToRgba(midHex, 0.20));
    neb.addColorStop(1, hexToRgba(topHex, 0));
    ctx.fillStyle = neb;
    ctx.beginPath();
    safeEllipse(ctx, nebX, nebY, w * 0.36, h * 0.14, -0.18);
    ctx.fill();
  } else if (motif.sky === 'sunbeams') {
    const sunX = w * 0.24;
    const sunY = h * 0.12;
    for (let i = 0; i < 4; i++) {
      const spread = 0.28 + i * 0.19 + Math.sin(t * 0.4 + i) * 0.03;
      ctx.fillStyle = hexToRgba(accHex, 0.11);
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      ctx.lineTo(sunX + Math.cos(spread) * w * 0.9, sunY + Math.sin(spread) * h * 0.85);
      ctx.lineTo(sunX + Math.cos(spread + 0.11) * w * 0.9, sunY + Math.sin(spread + 0.11) * h * 0.85);
      ctx.closePath();
      ctx.fill();
    }
  } else if (motif.sky === 'storm-clouds') {
    for (let i = 0; i < 6; i++) {
      const cx = ((i * w * 0.22 + t * 12) % (w + 180)) - 90;
      const cy = h * (0.1 + (i % 3) * 0.065);
      ctx.fillStyle = hexToRgba(topHex, 0.45);
      ctx.beginPath();
      safeEllipse(ctx, cx, cy, 95 + (i % 2) * 35, 24, 0);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(accHex, 0.24);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  // Soft drifting clouds across sky
  for (let c = 0; c < 4; c++) {
    const cx = ((c * w * 0.31 + t * (6 + c * 1.5)) % (w + 220)) - 110;
    const cy = h * (0.18 + (c % 2) * 0.09);
    ctx.fillStyle = hexToRgba(accHex, 0.12);
    ctx.beginPath();
    safeEllipse(ctx, cx, cy, 78, 16, 0);
    ctx.fill();
  }

  ctx.restore();
}

function renderFarHorizonPlane(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  arena: BattleArenaDescriptor,
  motif: ArenaMotif,
  time: number,
  reducedMotion: boolean,
  activeTintHex: string | null,
  pulse: number,
  camera: BattleCameraTransform,
): void {
  const plane = arena.planes[1];
  const horizonY = h * 0.46;
  const motionScale = reducedMotion ? 0.15 : 1.0;
  const t = time * motionScale;

  ctx.save();
  applyParallaxToContext(ctx, w, h, camera, plane.parallaxFactor);

  const farFill = activeTintHex ? mixHex(plane.primaryHex, activeTintHex, pulse * 0.24) : plane.primaryHex;
  const midFill = activeTintHex ? mixHex(plane.secondaryHex, activeTintHex, pulse * 0.26) : plane.secondaryHex;
  const rimHex = activeTintHex ? mixHex(plane.accentHex, activeTintHex, pulse * 0.4) : plane.accentHex;

  // Back ridge range
  ctx.beginPath();
  ctx.moveTo(-80, horizonY + 90);
  for (let x = -80; x <= w + 80; x += 36) {
    let peak = Math.sin(x * 0.0085 + 0.7) * 34 + Math.cos(x * 0.021) * 16;
    if (motif.horizon === 'volcano-cones' || motif.horizon === 'obsidian-needles' || motif.horizon === 'glacier-peaks') {
      peak = Math.abs(Math.sin(x * 0.011)) * -64 + 14;
    } else if (motif.horizon === 'desert-mesas' || motif.horizon === 'basalt-cliffs') {
      peak = Math.round(Math.sin(x * 0.01) * 2) * -22;
    } else if (motif.horizon === 'foundry-skyline') {
      peak = (Math.floor(x / 54) % 3) * -22 - 14;
    } else if (motif.horizon === 'rolling-hills' || motif.horizon === 'sakura-ridges') {
      peak = Math.sin(x * 0.007) * -26 - 8;
    }
    ctx.lineTo(x, horizonY + peak - 18);
  }
  ctx.lineTo(w + 80, horizonY + 90);
  ctx.closePath();

  const ridgeGrad = ctx.createLinearGradient(0, horizonY - 85, 0, horizonY + 55);
  ridgeGrad.addColorStop(0, farFill);
  ridgeGrad.addColorStop(1, midFill);
  ctx.fillStyle = ridgeGrad;
  ctx.fill();

  // Signature horizon silhouettes (floating sky islands / monoliths / observatory dome)
  if (motif.horizon === 'sky-islands' || motif.horizon === 'floating-monoliths' || motif.horizon === 'cloud-sea-peaks') {
    for (let i = 0; i < 4; i++) {
      const ix = w * (0.14 + i * 0.24);
      const iy = horizonY - 46 - (i % 2) * 22 + Math.sin(t * 0.9 + i) * 4;
      ctx.fillStyle = midFill;
      ctx.beginPath();
      ctx.moveTo(ix - 38, iy);
      ctx.lineTo(ix + 38, iy);
      ctx.lineTo(ix + 10, iy + 32);
      ctx.lineTo(ix - 12, iy + 28);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = hexToRgba(rimHex, 0.55);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  } else if (motif.horizon === 'harbor-domes') {
    const domeX = w * 0.22;
    const domeY = horizonY - 22;
    ctx.fillStyle = midFill;
    ctx.beginPath();
    ctx.arc(domeX, domeY, 26, Math.PI, 0);
    ctx.lineTo(domeX + 32, domeY + 28);
    ctx.lineTo(domeX - 32, domeY + 28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hexToRgba(rimHex, 0.72);
    ctx.beginPath();
    ctx.arc(domeX, domeY - 26, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Horizon atmospheric rim mist
  const hazeGrad = ctx.createLinearGradient(0, horizonY - 26, 0, horizonY + 34);
  hazeGrad.addColorStop(0, hexToRgba(rimHex, 0));
  hazeGrad.addColorStop(0.5, hexToRgba(rimHex, 0.22 + pulse * 0.14));
  hazeGrad.addColorStop(1, hexToRgba(midFill, 0));
  ctx.fillStyle = hazeGrad;
  ctx.fillRect(-60, horizonY - 26, w + 120, 60);

  ctx.restore();
}

function renderMidLandmarksPlane(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  arena: BattleArenaDescriptor,
  motif: ArenaMotif,
  time: number,
  reducedMotion: boolean,
  activeTintHex: string | null,
  pulse: number,
  camera: BattleCameraTransform,
): void {
  const plane = arena.planes[2];
  const baseLineY = h * 0.49;
  const motionScale = reducedMotion ? 0.15 : 1.0;
  const t = time * motionScale;

  ctx.save();
  applyParallaxToContext(ctx, w, h, camera, plane.parallaxFactor);

  const bodyHex = plane.primaryHex;
  const secHex = plane.secondaryHex;
  const glowHex = activeTintHex ? mixHex(plane.accentHex, activeTintHex, pulse * 0.5) : plane.accentHex;

  // Draw distinct mid-ground biome landmarks flanking center & enemy stage
  switch (motif.landmark) {
    case 'observatory-lanterns': {
      // Harbor stone balustrade + warm glowing harbor lanterns
      ctx.fillStyle = bodyHex;
      ctx.fillRect(-40, baseLineY - 10, w + 80, 18);
      for (const lx of [w * 0.12, w * 0.36, w * 0.56, w * 0.88]) {
        ctx.fillStyle = bodyHex;
        ctx.fillRect(lx - 4, baseLineY - 58, 8, 52);
        ctx.fillStyle = glowHex;
        ctx.beginPath();
        ctx.arc(lx, baseLineY - 62, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hexToRgba(glowHex, 0.25);
        ctx.beginPath();
        ctx.arc(lx, baseLineY - 62, 22, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'windmill-shrine': {
      const mx = w * 0.18;
      const my = baseLineY - 4;
      ctx.fillStyle = secHex;
      ctx.beginPath();
      ctx.moveTo(mx - 18, my);
      ctx.lineTo(mx - 11, my - 58);
      ctx.lineTo(mx + 11, my - 58);
      ctx.lineTo(mx + 18, my);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(mx, my - 46);
      ctx.rotate(t * 0.6);
      for (let b = 0; b < 4; b++) {
        ctx.rotate(Math.PI * 0.5);
        ctx.fillStyle = glowHex;
        ctx.fillRect(-3, 0, 6, 32);
      }
      ctx.restore();
      break;
    }
    case 'sunbeam-trees':
    case 'honey-hollow':
    case 'wisp-shrine': {
      for (const [tx, th] of [[w * 0.13, 98], [w * 0.31, 82], [w * 0.88, 96]]) {
        ctx.fillStyle = bodyHex;
        ctx.fillRect(tx - 10, baseLineY - th, 20, th + 12);
        ctx.fillStyle = secHex;
        ctx.beginPath();
        safeEllipse(ctx, tx, baseLineY - th, 44, 28, 0);
        ctx.fill();
        ctx.fillStyle = hexToRgba(glowHex, 0.65);
        ctx.beginPath();
        ctx.arc(tx + 10, baseLineY - th + 18, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'caldera-arches': {
      ctx.strokeStyle = bodyHex;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(w * 0.25, baseLineY + 6, 62, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = hexToRgba(glowHex, 0.72);
      ctx.beginPath();
      safeEllipse(ctx, w * 0.84, baseLineY - 6, 36, 9, 0);
      ctx.fill();
      break;
    }
    case 'coral-arch': {
      for (const [cx, r, col] of [[w * 0.16, 48, secHex], [w * 0.86, 54, glowHex]] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, baseLineY + 8);
        ctx.quadraticCurveTo(cx - 18, baseLineY - r, cx - 26, baseLineY - r - 18);
        ctx.moveTo(cx, baseLineY - r * 0.45);
        ctx.quadraticCurveTo(cx + 18, baseLineY - r * 0.85, cx + 22, baseLineY - r - 8);
        ctx.stroke();
      }
      break;
    }
    case 'thunder-pylons':
    case 'ice-cathedral':
    case 'eclipse-monolith': {
      for (const [px, ph] of [[w * 0.14, 92], [w * 0.41, 68], [w * 0.89, 86]]) {
        const hover = motif.landmark === 'thunder-pylons' ? Math.sin(t * 2 + px) * 5 : 0;
        ctx.fillStyle = bodyHex;
        ctx.beginPath();
        ctx.moveTo(px, baseLineY - ph + hover);
        ctx.lineTo(px + 17, baseLineY - ph * 0.35 + hover);
        ctx.lineTo(px + 10, baseLineY + 8);
        ctx.lineTo(px - 10, baseLineY + 8);
        ctx.lineTo(px - 17, baseLineY - ph * 0.35 + hover);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = hexToRgba(glowHex, 0.72);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      break;
    }
    case 'dojo-torii':
    case 'sakura-torii':
    case 'wyrm-gate': {
      const gx = w * 0.22;
      const gy = baseLineY + 6;
      ctx.fillStyle = secHex;
      ctx.fillRect(gx - 34, gy - 76, 10, 76);
      ctx.fillRect(gx + 24, gy - 76, 10, 76);
      ctx.fillStyle = glowHex;
      ctx.beginPath();
      ctx.moveTo(gx - 50, gy - 76);
      ctx.quadraticCurveTo(gx, gy - 90, gx + 50, gy - 76);
      ctx.lineTo(gx + 44, gy - 66);
      ctx.quadraticCurveTo(gx, gy - 78, gx - 44, gy - 66);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(gx - 38, gy - 54, 76, 7);
      break;
    }
    case 'glow-mushrooms': {
      for (const [mx, mh, mr] of [[w * 0.14, 58, 30], [w * 0.26, 42, 22], [w * 0.88, 62, 34]]) {
        ctx.fillStyle = secHex;
        ctx.fillRect(mx - 6, baseLineY - mh, 12, mh + 8);
        ctx.fillStyle = glowHex;
        ctx.beginPath();
        ctx.arc(mx, baseLineY - mh, mr, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'mesa-arches':
    case 'starstone-cranes': {
      ctx.strokeStyle = secHex;
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.arc(w * 0.22, baseLineY + 10, 56, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = hexToRgba(glowHex, 0.72);
      drawPolygonPath(ctx, w * 0.86, baseLineY - 26, 16, 6, 0.2);
      ctx.fill();
      break;
    }
    case 'wind-rings':
    case 'astral-astrolabe': {
      const rx = w * 0.23;
      const ry = baseLineY - 46 + Math.sin(t * 1.1) * 4;
      ctx.strokeStyle = glowHex;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(rx, ry, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = hexToRgba(secHex, 0.85);
      ctx.beginPath();
      safeEllipse(ctx, rx, ry, 46, 16, t * 0.35);
      ctx.stroke();
      break;
    }
    case 'clockwork-gears': {
      for (const [gx, gy, gr, dir] of [[w * 0.18, baseLineY - 42, 34, 1], [w * 0.27, baseLineY - 22, 22, -1]]) {
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(t * 0.45 * dir);
        ctx.strokeStyle = secHex;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, gr, 0, Math.PI * 2);
        ctx.stroke();
        for (let tooth = 0; tooth < 8; tooth++) {
          ctx.rotate((Math.PI * 2) / 8);
          ctx.fillStyle = glowHex;
          ctx.fillRect(-3.5, gr - 2, 7, 9);
        }
        ctx.restore();
      }
      break;
    }
  }

  ctx.restore();
}

function renderCombatGroundPlane(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  arena: BattleArenaDescriptor,
  motif: ArenaMotif,
  time: number,
  reducedMotion: boolean,
  activeTintHex: string | null,
  pulse: number,
  camera: BattleCameraTransform,
): void {
  const plane = arena.planes[3];
  const layout = computeBattleStageLayout(w, h);
  const motionScale = reducedMotion ? 0.15 : 1.0;
  const t = time * motionScale;

  ctx.save();
  applyCameraToContext(ctx, w, h, camera);

  const stageTop = layout.stageTopY;
  const primary = activeTintHex ? mixHex(plane.primaryHex, activeTintHex, pulse * 0.16) : plane.primaryHex;
  const secondary = activeTintHex ? mixHex(plane.secondaryHex, activeTintHex, pulse * 0.18) : plane.secondaryHex;
  const accent = activeTintHex ? mixHex(plane.accentHex, activeTintHex, pulse * 0.55) : plane.accentHex;

  // Base combat ground sweep (skip opaque fill on water-mirror since WebGL2/Canvas2D water quads draw behind)
  if (!motif.hasWaterMirror) {
    const floorGrad = ctx.createLinearGradient(0, stageTop - 20, 0, h + 40);
    floorGrad.addColorStop(0, primary);
    floorGrad.addColorStop(0.5, secondary);
    floorGrad.addColorStop(1, mixHex(secondary, '#0c1024', 0.42));
    ctx.fillStyle = floorGrad;
    ctx.fillRect(-80, stageTop - 16, w + 160, h - stageTop + 96);
  } else {
    // Subtle translucent twilight water shimmer overlay matching sky reflection
    const waterOverlay = ctx.createLinearGradient(0, stageTop - 12, 0, h + 20);
    waterOverlay.addColorStop(0, hexToRgba(primary, 0.25));
    waterOverlay.addColorStop(1, hexToRgba(secondary, 0.12));
    ctx.fillStyle = waterOverlay;
    ctx.fillRect(-80, stageTop - 12, w + 160, h - stageTop + 72);
  }

  // Sculpted platform texture accents
  if (arena.platformKind === 'volcanic-basalt') {
    ctx.strokeStyle = hexToRgba(accent, 0.45 + pulse * 0.35);
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const x0 = w * (0.08 + i * 0.16);
      const y0 = stageTop + 26 + (i % 2) * 32;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + 38, y0 + 18);
      ctx.lineTo(x0 + 18, y0 + 44);
      ctx.stroke();
    }
  } else if (arena.platformKind === 'astral-marble') {
    ctx.strokeStyle = hexToRgba(accent, 0.35 + pulse * 0.3);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    safeEllipse(ctx, layout.centerX, layout.centerY + 28, w * 0.30, h * 0.11, 0);
    ctx.stroke();
    ctx.beginPath();
    safeEllipse(ctx, layout.centerX, layout.centerY + 28, w * 0.22, h * 0.08, 0);
    ctx.stroke();
  } else if (arena.platformKind === 'cloud-ledge') {
    for (let i = 0; i < 7; i++) {
      const cx = w * (0.08 + i * 0.14);
      const cy = stageTop + 42 + (i % 3) * 44 + Math.sin(t + i) * 2.5;
      ctx.fillStyle = hexToRgba('#ffffff', 0.22);
      ctx.beginPath();
      safeEllipse(ctx, cx, cy, 85, 24, 0);
      ctx.fill();
    }
  } else if (arena.platformKind === 'crystal-dias') {
    ctx.strokeStyle = hexToRgba(accent, 0.36);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      drawPolygonPath(ctx, w * (0.15 + i * 0.18), stageTop + 65 + (i % 2) * 42, 26, 6, 0.25);
      ctx.stroke();
    }
  }

  // Draw sculpted Player & Enemy battle dais pads
  const pads: BattlePadAnchor[] = [layout.enemyPad, layout.playerPad];
  for (const pad of pads) {
    // Grounded pad drop shadow
    ctx.fillStyle = 'rgba(8, 10, 24, 0.34)';
    ctx.beginPath();
    safeEllipse(ctx, pad.x, pad.y + pad.ry * 0.36, pad.rx * 1.07, pad.ry * 1.12, 0);
    ctx.fill();

    // Pad body bevel
    const padGrad = ctx.createRadialGradient(
      pad.x - pad.rx * 0.25,
      pad.y - pad.ry * 0.3,
      pad.rx * 0.12,
      pad.x,
      pad.y,
      pad.rx,
    );
    padGrad.addColorStop(0, mixHex(primary, '#ffffff', 0.25));
    padGrad.addColorStop(0.68, primary);
    padGrad.addColorStop(1, secondary);
    ctx.fillStyle = padGrad;
    ctx.beginPath();
    safeEllipse(ctx, pad.x, pad.y, pad.rx, pad.ry, 0);
    ctx.fill();

    // Glowing arena dais rim
    ctx.strokeStyle = hexToRgba(accent, 0.65 + pulse * 0.32);
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Water ripple rings on water-mirror platforms
    if (arena.platformKind === 'water-mirror') {
      const ripplePhase = (t * 0.65) % 1;
      ctx.strokeStyle = hexToRgba(accent, (1 - ripplePhase) * 0.42);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      safeEllipse(
        ctx,
        pad.x,
        pad.y,
        pad.rx * (1.06 + ripplePhase * 0.24),
        pad.ry * (1.06 + ripplePhase * 0.24),
        0,
      );
      ctx.stroke();
    }
  }

  ctx.restore();
}

function renderForegroundFramePlane(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  arena: BattleArenaDescriptor,
  motif: ArenaMotif,
  time: number,
  reducedMotion: boolean,
  activeTintHex: string | null,
  pulse: number,
  camera: BattleCameraTransform,
): void {
  const plane = arena.planes[4];
  const motionScale = reducedMotion ? 0.12 : 1.0;
  const sway = Math.sin(time * 1.4 * motionScale) * 5;

  ctx.save();
  applyParallaxToContext(ctx, w, h, camera, plane.parallaxFactor);

  const fgDark = plane.primaryHex;
  const fgMid = plane.secondaryHex;
  const fgRim = activeTintHex ? mixHex(plane.accentHex, activeTintHex, pulse * 0.5) : plane.accentHex;

  // Left & Right edge framing silhouettes (clear of center combatant lanes)
  if (
    motif.foreground === 'lantern-boughs' ||
    motif.foreground === 'hanging-vines' ||
    motif.foreground === 'moss-branches' ||
    motif.foreground === 'sakura-boughs'
  ) {
    // Upper-left overhanging bough
    ctx.fillStyle = fgDark;
    ctx.beginPath();
    ctx.moveTo(-40, -20);
    ctx.quadraticCurveTo(w * 0.11 + sway, h * 0.08, w * 0.19 + sway, h * 0.15);
    ctx.quadraticCurveTo(w * 0.09, h * 0.14, -40, h * 0.22);
    ctx.closePath();
    ctx.fill();

    // Subtle glowing blossom / lantern accent
    ctx.fillStyle = hexToRgba(fgRim, 0.78);
    ctx.beginPath();
    ctx.arc(w * 0.14 + sway, h * 0.14, 6.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (
    motif.foreground === 'quartz-clusters' ||
    motif.foreground === 'icicle-frame' ||
    motif.foreground === 'basalt-columns' ||
    motif.foreground === 'rune-pillars' ||
    motif.foreground === 'shadow-spires' ||
    motif.foreground === 'obsidian-horns'
  ) {
    // Angled foreground shards/columns on bottom-left and bottom-right corners
    for (const side of [-1, 1] as const) {
      const bx = side < 0 ? -15 : w + 15;
      ctx.fillStyle = fgDark;
      ctx.beginPath();
      ctx.moveTo(bx, h + 30);
      ctx.lineTo(bx - side * 58, h * 0.72);
      ctx.lineTo(bx - side * 12, h * 0.85);
      ctx.lineTo(bx - side * 84, h + 30);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = hexToRgba(fgRim, 0.45);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  } else {
    // Bamboo stalks / iron girders / coral kelp / wind clouds
    for (const side of [-1, 1] as const) {
      const bx = side < 0 ? 18 : w - 18;
      ctx.fillStyle = fgMid;
      ctx.beginPath();
      safeEllipse(ctx, bx + sway * 0.4, h * 0.88, 42, 74, side * 0.16);
      ctx.fill();
    }
  }

  // Soft corner mist vignette framing
  const mistGrad = ctx.createLinearGradient(0, h * 0.84, 0, h + 30);
  mistGrad.addColorStop(0, hexToRgba(fgDark, 0));
  mistGrad.addColorStop(1, hexToRgba(fgDark, 0.35));
  ctx.fillStyle = mistGrad;
  ctx.fillRect(-60, h * 0.84, w + 120, h * 0.24);

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

  // Ambient biome horizon & pad lights
  backend.addPointLight({
    id: `arena-horizon-${arena.biomeId}`,
    x: layout.centerX,
    y: layout.horizonY,
    radius: minDim * 0.62,
    color: baseRgb,
    intensity: 0.55 + pulse * 0.25,
    flickerSpeed: 2.2,
    flickerAmount: state.reducedMotion ? 0 : 0.08,
  });

  backend.addPointLight({
    id: `arena-player-pad-${arena.biomeId}`,
    x: layout.playerPad.x,
    y: layout.playerPad.spriteCy,
    radius: minDim * 0.42,
    color: activeType ? activeRgb : baseRgb,
    intensity: 0.42 + pulse * 0.48,
    flickerSpeed: 3.1,
    flickerAmount: state.reducedMotion ? 0 : 0.06,
  });

  backend.addPointLight({
    id: `arena-enemy-pad-${arena.biomeId}`,
    x: layout.enemyPad.x,
    y: layout.enemyPad.spriteCy,
    radius: minDim * 0.40,
    color: activeType ? activeRgb : baseRgb,
    intensity: 0.45 + pulse * 0.52,
    flickerSpeed: 3.4,
    flickerAmount: state.reducedMotion ? 0 : 0.07,
  });

  if (activeType && pulse > 0.05) {
    backend.addPointLight({
      id: `arena-move-surge-${activeType}`,
      x: layout.centerX,
      y: layout.centerY,
      radius: minDim * (0.58 + pulse * 0.25),
      color: activeRgb,
      intensity: 0.85 * pulse,
      flickerSpeed: 6.5,
      flickerAmount: state.reducedMotion ? 0 : 0.14,
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
): void {
  const motif = ARENA_MOTIFS[arena.biomeId];
  const pulse = clamp(state.arenaLightingPulse, 0, 1);
  const activeTintHex = state.arenaLightingType ? TYPE_PALETTES[state.arenaLightingType].primary : null;

  // Planes 0, 1, 2: sky, far-horizon, mid-landmarks
  backend.drawCustom2D((ctx, width, height) => {
    renderSkyPlane(ctx, width, height, arena, motif, time, state.reducedMotion, activeTintHex, pulse, camera);
    renderFarHorizonPlane(ctx, width, height, arena, motif, time, state.reducedMotion, activeTintHex, pulse, camera);
    renderMidLandmarksPlane(ctx, width, height, arena, motif, time, state.reducedMotion, activeTintHex, pulse, camera);
  }, 'world');

  // If water-mirror arena, enqueue real water shader quads behind the sculpted battle pads
  if (motif.hasWaterMirror) {
    const layout = computeBattleStageLayout(viewportWidth, viewportHeight);
    const wy = layout.stageTopY - 24;
    const wh = layout.height - wy + 110;
    const halfW = layout.width * 0.5 + 120;
    backend.drawWaterQuad(-120, wy, halfW, wh, 0.44, 0.26);
    backend.drawWaterQuad(-120 + halfW, wy, halfW, wh, 0.58, 0.32);
  }

  // Plane 3: sculpted combat ground + dais pads
  backend.drawCustom2D((ctx, width, height) => {
    renderCombatGroundPlane(ctx, width, height, arena, motif, time, state.reducedMotion, activeTintHex, pulse, camera);
  }, 'world');
}

export function renderArenaForeground(
  backend: IRenderBackend,
  arena: BattleArenaDescriptor,
  state: BattleSceneState,
  camera: BattleCameraTransform,
  time: number,
): void {
  const motif = ARENA_MOTIFS[arena.biomeId];
  const pulse = clamp(state.arenaLightingPulse, 0, 1);
  const activeTintHex = state.arenaLightingType ? TYPE_PALETTES[state.arenaLightingType].primary : null;

  backend.drawCustom2D((ctx, width, height) => {
    renderForegroundFramePlane(ctx, width, height, arena, motif, time, state.reducedMotion, activeTintHex, pulse, camera);
  }, 'world');
}

export function renderArena(
  backend: IRenderBackend,
  arena: BattleArenaDescriptor,
  state: BattleSceneState,
  camera: BattleCameraTransform = { x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0, rotation: 0 },
  time = state.elapsedSeconds,
): void {
  renderArenaBackdrop(backend, arena, state, camera, time);
  renderArenaForeground(backend, arena, state, camera, time);
}
