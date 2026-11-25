import type {
  AtlasManifest,
  AtlasRegion,
  BiomeId,
  GrassDisplacement,
  IRenderBackend,
  OverworldSceneState,
  PointLight,
  SpriteDrawCmd,
} from '../../contracts';
import { TILE, getBiomeAt, getBiomeVisualProfile } from '../../core/dojo';

/** Canonical 47-tile blob bitmasks (NW=1, N=2, NE=4, W=8, E=16, SW=32, S=64, SE=128) */
export const CANONICAL_47_MASKS: readonly number[] = [
  0, 2, 8, 10, 11, 16, 18, 22, 24, 26, 27, 30, 31, 64, 66, 72, 74, 75, 80, 82, 86, 88, 90, 91,
  94, 95, 104, 106, 107, 120, 122, 123, 126, 127, 208, 210, 214, 216, 218, 219, 222, 223, 248,
  250, 251, 254, 255,
];

export type Rgb255 = [number, number, number];
export type Rgb01 = [number, number, number];

export interface ViewTileBounds {
  minTx: number;
  maxTx: number;
  minTy: number;
  maxTy: number;
  minPxX: number;
  minPxY: number;
  maxPxX: number;
  maxPxY: number;
}

export interface BuildingCluster {
  id: 'cottage_violet' | 'cottage_lab';
  tx: number;
  ty: number;
  widthTiles: number;
  heightTiles: number;
}

export interface LightCandidate {
  light: PointLight;
  distSq: number;
}

/**
 * Tags a cached offscreen canvas as immutable so WebGL2Backend uploads it to VRAM once
 * rather than calling gl.texImage2D every frame.
 */
export function markImmutableCanvas<T extends HTMLCanvasElement>(canvas: T): T {
  (canvas as T & { __starlightImmutable?: boolean }).__starlightImmutable = true;
  return canvas;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function hash2D(x: number, y: number, seed = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function hexToRgb255(hex: string): Rgb255 {
  const clean = hex.trim().replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return [r, g, b];
  }
  const n = parseInt(clean.slice(0, 6), 16);
  if (!Number.isFinite(n)) {
    return [255, 255, 255];
  }
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToRgb01(hex: string): Rgb01 {
  const [r, g, b] = hexToRgb255(hex);
  return [r / 255, g / 255, b / 255];
}

export function rgb255ToStr(rgb: Rgb255, alpha = 1): string {
  const r = clamp(Math.round(rgb[0]), 0, 255);
  const g = clamp(Math.round(rgb[1]), 0, 255);
  const b = clamp(Math.round(rgb[2]), 0, 255);
  if (alpha >= 0.999) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(3)})`;
}

export function hexRgba(hex: string, alpha = 1): string {
  return rgb255ToStr(hexToRgb255(hex), alpha);
}

export function shadeRgb(rgb: Rgb255, factor: number, add = 0): Rgb255 {
  return [
    clamp(Math.round(rgb[0] * factor + add), 0, 255),
    clamp(Math.round(rgb[1] * factor + add), 0, 255),
    clamp(Math.round(rgb[2] * factor + add), 0, 255),
  ];
}

export function mixRgb(a: Rgb255, b: Rgb255, t: number): Rgb255 {
  const k = clamp(t, 0, 1);
  return [
    Math.round(lerp(a[0], b[0], k)),
    Math.round(lerp(a[1], b[1], k)),
    Math.round(lerp(a[2], b[2], k)),
  ];
}

export function drawEllipsePath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  if (rx <= 0.1 || ry <= 0.1) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.restore();
}

export function fillEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fillStyle: string,
): void {
  ctx.fillStyle = fillStyle;
  drawEllipsePath(ctx, cx, cy, rx, ry);
  ctx.fill();
}

export function strokeEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  strokeStyle: string,
  lineWidth = 1.5,
): void {
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  drawEllipsePath(ctx, cx, cy, rx, ry);
  ctx.stroke();
}

export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, w * 0.5, h * 0.5));
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

// Precomputed cool twilight shadow color tiers (zero per-frame rgba string allocations)
const SHADOW_OUTER = 'rgba(10, 15, 34, 0.14)';
const SHADOW_MID = 'rgba(10, 15, 34, 0.24)';
const SHADOW_CORE = 'rgba(8, 12, 28, 0.34)';

/**
 * Draws a crisp, pixel-stepped 3-tier elliptical contact shadow (zero boxy rectangles,
 * zero per-frame string allocations).
 */
export function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  alpha = 0.34,
): void {
  const ox = Math.round(cx);
  const oy = Math.round(cy);
  const wr = Math.max(3, Math.round(rx));
  const hr = Math.max(2, Math.round(ry));
  const prevAlpha = ctx.globalAlpha;
  const scaleA = clamp(alpha / 0.34, 0.2, 1.35);
  if (Math.abs(scaleA - 1) > 0.04) {
    ctx.globalAlpha = prevAlpha * scaleA;
  }

  // Outer soft stepped oval skirt
  const w1 = wr;
  const h1 = Math.max(1, Math.round(hr * 0.65));
  const w2 = Math.max(2, Math.round(wr * 0.84));
  const h2 = Math.max(2, Math.round(hr * 1.12));
  const w3 = Math.max(2, Math.round(wr * 0.56));
  const h3 = Math.max(2, Math.round(hr * 1.44));

  ctx.fillStyle = SHADOW_OUTER;
  ctx.fillRect(ox - w1, oy - (h1 >> 1), w1 * 2, h1);
  ctx.fillRect(ox - w2, oy - (h2 >> 1), w2 * 2, h2);
  ctx.fillRect(ox - w3, oy - (h3 >> 1), w3 * 2, h3);

  // Mid grounded oval body
  const m1 = Math.max(2, Math.round(wr * 0.78));
  const mh1 = Math.max(1, Math.round(hr * 0.72));
  const m2 = Math.max(2, Math.round(wr * 0.58));
  const mh2 = Math.max(2, Math.round(hr * 1.15));
  ctx.fillStyle = SHADOW_MID;
  ctx.fillRect(ox - m1, oy - (mh1 >> 1), m1 * 2, mh1);
  ctx.fillRect(ox - m2, oy - (mh2 >> 1), m2 * 2, mh2);

  // Inner dark contact core directly beneath feet/trunk
  const cw = Math.max(2, Math.round(wr * 0.44));
  const ch = Math.max(1, Math.round(hr * 0.78));
  ctx.fillStyle = SHADOW_CORE;
  ctx.fillRect(ox - cw, oy - (ch >> 1), cw * 2, ch);

  if (Math.abs(scaleA - 1) > 0.04) {
    ctx.globalAlpha = prevAlpha;
  }
}

export function drawFourPointStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  rotation = 0,
): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = rotation + (i * Math.PI) / 4;
    const r = i % 2 === 0 ? outerR : innerR;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function resolveAtlasRegion(
  manifest: AtlasManifest | null,
  sheetId: string,
  regionId: string,
): AtlasRegion | null {
  const sheet = manifest?.sheets?.[sheetId];
  return sheet?.regions?.[regionId] ?? null;
}

export function buildSpriteCmd(
  manifest: AtlasManifest | null,
  sheetId: string,
  regionId: string,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  extras?: Partial<SpriteDrawCmd>,
): SpriteDrawCmd {
  const region = resolveAtlasRegion(manifest, sheetId, regionId);
  return {
    sheetId,
    regionId,
    ...(region ? { sx: region.x, sy: region.y, sw: region.w, sh: region.h } : {}),
    dx,
    dy,
    dw,
    dh,
    pixelCrisp: true,
    useNormalMap: true,
    ...extras,
  };
}

export const TALL_GRASS_TILES = new Set<number>([
  TILE.TALL_GRASS,
  TILE.SNOW_GRASS,
  TILE.GROVE_GRASS,
  TILE.MARSH_GRASS,
  TILE.CANYON_GRASS,
  TILE.FAE_GRASS,
  TILE.CROWN_GRASS,
]);

export const WATER_TILES = new Set<number>([
  TILE.WATER,
  TILE.SHALLOW_WATER,
  TILE.REEF_WATER,
]);

export const LIQUID_TILES = new Set<number>([
  TILE.WATER,
  TILE.SHALLOW_WATER,
  TILE.REEF_WATER,
  TILE.LAVA,
]);

export const WALL_TILES = new Set<number>([
  TILE.CAVE_WALL,
  TILE.ICE_WALL,
  TILE.SANDSTONE_WALL,
  TILE.MARSH_WALL,
  TILE.SANCTUM_WALL,
  TILE.CANYON_WALL,
  TILE.REEF_WALL,
  TILE.RUINS_WALL,
  TILE.RIFT_WALL,
  TILE.FAE_WALL,
  TILE.ATOLL_WALL,
  TILE.CROWN_WALL,
  TILE.TERA_WALL,
]);

export const PATH_TILES = new Set<number>([
  TILE.PATH,
  TILE.CAVE_PATH,
  TILE.VOLCANO_PATH,
  TILE.SNOW_PATH,
  TILE.RUNE_TRAIL,
  TILE.GROVE_PATH,
  TILE.DUNE_PATH,
  TILE.MARSH_PATH,
  TILE.SANCTUM_PATH,
  TILE.CANYON_PATH,
  TILE.REEF_PATH,
  TILE.RUINS_PATH,
  TILE.RIFT_PATH,
  TILE.FAE_PATH,
  TILE.ATOLL_PATH,
  TILE.CROWN_PATH,
  TILE.TERA_PATH,
]);

export const SAND_TILES = new Set<number>([
  TILE.SAND,
  TILE.DUNE_SAND,
  TILE.ATOLL_SAND,
]);

const LUSH_TURF_TILES = new Set<number>([
  TILE.GRASS,
  TILE.FLOWER,
  TILE.TALL_GRASS,
  TILE.TREE,
  TILE.GROVE_GRASS,
  TILE.SIGN,
]);

const TREE_PROP_REGIONS = [
  'tree_oak',
  'tree_sakura',
  'tree_pine',
  'tree_palm',
  'prop_mushroom',
  'prop_crystal',
] as const;

export function resolveTreePropRegion(biomeId: BiomeId | string): string {
  switch (biomeId) {
    case 'grove':
    case 'faeveldt':
      return 'tree_sakura';
    case 'peak':
    case 'highlands':
      return 'tree_pine';
    case 'water':
    case 'atoll':
    case 'reef':
    case 'desert':
      return 'tree_palm';
    case 'marsh':
      return 'prop_mushroom';
    case 'cave':
    case 'crater':
    case 'rift':
      return 'prop_crystal';
    default:
      return 'tree_oak';
  }
}

export function computeTile47Mask(
  worldMap: number[][],
  cols: number,
  rows: number,
  tx: number,
  ty: number,
  predicate: (tileId: number) => boolean,
): number {
  const match = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return true;
    const t = worldMap[y]?.[x];
    return t !== undefined && predicate(t);
  };
  const n = match(tx, ty - 1);
  const s = match(tx, ty + 1);
  const w = match(tx - 1, ty);
  const e = match(tx + 1, ty);
  let mask = 0;
  if (n) mask |= 2;
  if (w) mask |= 8;
  if (e) mask |= 16;
  if (s) mask |= 64;
  if (n && w && match(tx - 1, ty - 1)) mask |= 1;
  if (n && e && match(tx + 1, ty - 1)) mask |= 4;
  if (s && w && match(tx - 1, ty + 1)) mask |= 32;
  if (s && e && match(tx + 1, ty + 1)) mask |= 128;
  return mask;
}

export function computeLiquidFoamMask(
  worldMap: number[][],
  cols: number,
  rows: number,
  tx: number,
  ty: number,
  tileId: number,
): number {
  const isShoreNeighbor = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    const t = worldMap[y]?.[x];
    return t !== undefined && !LIQUID_TILES.has(t) && t !== TILE.BRIDGE;
  };
  let cardinal = 0;
  if (isShoreNeighbor(tx, ty - 1)) cardinal |= 1;
  if (isShoreNeighbor(tx + 1, ty)) cardinal |= 2;
  if (isShoreNeighbor(tx, ty + 1)) cardinal |= 4;
  if (isShoreNeighbor(tx - 1, ty)) cardinal |= 8;

  if (cardinal === 0) {
    return tileId === TILE.WATER ? 0 : 0.14;
  }
  // WATER_SHADER & Canvas2DBackend treat foamMask > 1.01 as 4-bit cardinal mask; N-only (1) uses 0.94
  return cardinal === 1 ? 0.94 : cardinal;
}

interface BuildingClusterCache {
  clusters: BuildingCluster[];
  tileKeys: Set<number>;
}

const BUILDING_CACHE = new WeakMap<number[][], BuildingClusterCache>();

export function detectBuildingClusters(
  worldMap: number[][],
  cols: number,
  rows: number,
): BuildingClusterCache {
  const cached = BUILDING_CACHE.get(worldMap);
  if (cached) return cached;

  const clusters: BuildingCluster[] = [];
  const tileKeys = new Set<number>();
  const visited = new Set<number>();

  for (let y = 0; y < rows - 1; y++) {
    const row = worldMap[y];
    const nextRow = worldMap[y + 1];
    if (!row || !nextRow) continue;

    let x = 0;
    while (x < cols) {
      const idx = y * cols + x;
      if (row[x] === TILE.ROOF && nextRow[x] === TILE.WALL && !visited.has(idx)) {
        let span = 0;
        while (x + span < cols && row[x + span] === TILE.ROOF && nextRow[x + span] === TILE.WALL) {
          span += 1;
        }
        if (span >= 2) {
          for (let dx = 0; dx < span; dx++) {
            const topKey = y * cols + (x + dx);
            const botKey = (y + 1) * cols + (x + dx);
            visited.add(topKey);
            visited.add(botKey);
            tileKeys.add(topKey);
            tileKeys.add(botKey);
          }
          const isLab = clusters.length > 0 || x >= 8;
          clusters.push({
            id: isLab ? 'cottage_lab' : 'cottage_violet',
            tx: x,
            ty: y,
            widthTiles: span,
            heightTiles: 2,
          });
        }
        x += Math.max(1, span);
      } else {
        x += 1;
      }
    }
  }

  const entry: BuildingClusterCache = { clusters, tileKeys };
  BUILDING_CACHE.set(worldMap, entry);
  return entry;
}

interface StaticPropEntry {
  tx: number;
  ty: number;
  tileIdx: number;
  kind: 'tree' | 'heal' | 'lantern' | 'sign';
  regionId: string;
  flipX: boolean;
  scale: number;
  yJitter: number;
  swayPhase: number;
  tint: [number, number, number, number] | undefined;
}

interface StaticTileLightSpec {
  id: string;
  tx: number;
  ty: number;
  radiusTiles: number;
  color: [number, number, number];
  baseIntensity: number;
  flickerSpeed: number;
  flickerAmount: number;
}

interface StaticMapMeta {
  cols: number;
  rows: number;
  wallMasks: Uint8Array;
  pathMasks: Uint8Array;
  foamMasks: Float32Array;
  buildingCache: BuildingClusterCache;
  chunkCols: number;
  chunkRows: number;
  chunkProps: StaticPropEntry[][];
  chunkLights: StaticTileLightSpec[][];
  chunkHasWaterOrLava: Uint8Array;
  chunkHasDynamicFloor: Uint8Array;
  chunkHasTallGrass: Uint8Array;
}

const TERRAIN_CHUNK_TILES = 16;
const CHUNK_PIXEL_SCALE = 2; // 64px per 32px world tile -> full 2x HD-2D fidelity!
const STATIC_META_CACHE = new WeakMap<number[][], StaticMapMeta>();

interface ShoreBankChunkEntry {
  canvas: HTMLCanvasElement;
  startTx: number;
  startTy: number;
  endTx: number;
  endTy: number;
  widthWorld: number;
  heightWorld: number;
}

function getOrBuildStaticMapMeta(
  worldMap: number[][],
  cols: number,
  rows: number,
  fallbackBiomeId: BiomeId,
): StaticMapMeta {
  const existing = STATIC_META_CACHE.get(worldMap);
  if (existing && existing.cols === cols && existing.rows === rows) {
    return existing;
  }

  const total = Math.max(1, cols * rows);
  const wallMasks = new Uint8Array(total);
  const pathMasks = new Uint8Array(total);
  const foamMasks = new Float32Array(total);
  const buildingCache = detectBuildingClusters(worldMap, cols, rows);

  const chunkCols = Math.max(1, Math.ceil(cols / TERRAIN_CHUNK_TILES));
  const chunkRows = Math.max(1, Math.ceil(rows / TERRAIN_CHUNK_TILES));
  const totalChunks = chunkCols * chunkRows;
  const chunkProps: StaticPropEntry[][] = Array.from({ length: totalChunks }, () => []);
  const chunkLights: StaticTileLightSpec[][] = Array.from({ length: totalChunks }, () => []);
  const chunkHasWaterOrLava = new Uint8Array(totalChunks);
  const chunkHasDynamicFloor = new Uint8Array(totalChunks);
  const chunkHasTallGrass = new Uint8Array(totalChunks);

  for (let ty = 0; ty < rows; ty++) {
    const row = worldMap[ty];
    if (!row) continue;
    const cy = Math.floor(ty / TERRAIN_CHUNK_TILES);
    for (let tx = 0; tx < cols; tx++) {
      const tileId = row[tx] ?? TILE.GRASS;
      const idx = ty * cols + tx;
      const cx = Math.floor(tx / TERRAIN_CHUNK_TILES);
      const cIdx = cy * chunkCols + cx;

      if (WALL_TILES.has(tileId)) {
        wallMasks[idx] = computeTile47Mask(worldMap, cols, rows, tx, ty, (id) => WALL_TILES.has(id));
      } else if (PATH_TILES.has(tileId)) {
        pathMasks[idx] = computeTile47Mask(worldMap, cols, rows, tx, ty, (id) => PATH_TILES.has(id));
      }

      if (LIQUID_TILES.has(tileId)) {
        foamMasks[idx] = computeLiquidFoamMask(worldMap, cols, rows, tx, ty, tileId);
        chunkHasWaterOrLava[cIdx] = 1;
        chunkHasDynamicFloor[cIdx] = 1;
      } else if (tileId === TILE.FLOWER || tileId === TILE.RUNE_TRAIL) {
        chunkHasDynamicFloor[cIdx] = 1;
      }

      if (TALL_GRASS_TILES.has(tileId)) {
        chunkHasTallGrass[cIdx] = 1;
      }

      if (tileId === TILE.TREE) {
        const tileBiome = getBiomeAt(tx, ty)?.id || fallbackBiomeId;
        const regionId = resolveTreePropRegion(tileBiome);
        const h1 = hash2D(tx, ty, 31);
        const h2 = hash2D(tx, ty, 37);
        const h3 = hash2D(tx, ty, 41);
        const h4 = hash2D(tx, ty, 47);
        const isOrganicFlora = regionId !== 'prop_crystal';
        const tintVar = isOrganicFlora
          ? ([
              0.94 + h4 * 0.11,
              0.95 + hash2D(tx, ty, 53) * 0.10,
              0.93 + hash2D(tx, ty, 59) * 0.11,
              1,
            ] as [number, number, number, number])
          : undefined;
        chunkProps[cIdx].push({
          tx,
          ty,
          tileIdx: idx,
          kind: 'tree',
          regionId,
          flipX: h1 > 0.5,
          scale: 0.92 + h2 * 0.15,
          yJitter: Math.round((h3 - 0.5) * 3),
          swayPhase: hash2D(tx, ty, 13) * Math.PI * 2,
          tint: tintVar,
        });
      } else if (tileId === TILE.HEAL) {
        chunkProps[cIdx].push({
          tx,
          ty,
          tileIdx: idx,
          kind: 'heal',
          regionId: 'fountain',
          flipX: false,
          scale: 1,
          yJitter: 0,
          swayPhase: 0,
          tint: undefined,
        });
        chunkLights[cIdx].push({
          id: `fountain-${tx}-${ty}`,
          tx,
          ty,
          radiusTiles: 3.6,
          color: [0.32, 0.88, 1.0],
          baseIntensity: 0.9,
          flickerSpeed: 2.3,
          flickerAmount: 0.08,
        });
      } else if (tileId === TILE.LANTERN) {
        chunkProps[cIdx].push({
          tx,
          ty,
          tileIdx: idx,
          kind: 'lantern',
          regionId: 'lantern',
          flipX: false,
          scale: 1,
          yJitter: 0,
          swayPhase: 0,
          tint: undefined,
        });
        chunkLights[cIdx].push({
          id: `lantern-${tx}-${ty}`,
          tx,
          ty,
          radiusTiles: 3.35,
          color: [1.0, 0.78, 0.36],
          baseIntensity: 0.86,
          flickerSpeed: 3.5,
          flickerAmount: 0.1,
        });
      } else if (tileId === TILE.SIGN) {
        chunkProps[cIdx].push({
          tx,
          ty,
          tileIdx: idx,
          kind: 'sign',
          regionId: 'signpost',
          flipX: false,
          scale: 1,
          yJitter: 0,
          swayPhase: 0,
          tint: undefined,
        });
      } else if (tileId === TILE.LAVA && (tx + ty) % 3 === 0) {
        chunkLights[cIdx].push({
          id: `lava-${tx}-${ty}`,
          tx,
          ty,
          radiusTiles: 2.8,
          color: [1.0, 0.42, 0.14],
          baseIntensity: 0.88,
          flickerSpeed: 4.1,
          flickerAmount: 0.14,
        });
      }
    }
  }

  const meta: StaticMapMeta = {
    cols,
    rows,
    wallMasks,
    pathMasks,
    foamMasks,
    buildingCache,
    chunkCols,
    chunkRows,
    chunkProps,
    chunkLights,
    chunkHasWaterOrLava,
    chunkHasDynamicFloor,
    chunkHasTallGrass,
  };
  STATIC_META_CACHE.set(worldMap, meta);
  return meta;
}

function getGrassBladePalette(tileId: number): { dark: string; mid: string; tip: string } {
  switch (tileId) {
    case TILE.SNOW_GRASS:
      return { dark: '#356b88', mid: '#63b4cf', tip: '#c4f4ff' };
    case TILE.GROVE_GRASS:
      return { dark: '#27644b', mid: '#48a878', tip: '#ffaee0' };
    case TILE.MARSH_GRASS:
      return { dark: '#284a54', mid: '#3b8c7c', tip: '#9b74f5' };
    case TILE.CANYON_GRASS:
      return { dark: '#735424', mid: '#b88c3b', tip: '#fce27c' };
    case TILE.FAE_GRASS:
      return { dark: '#6a3c7c', mid: '#a864b8', tip: '#ffc4eb' };
    case TILE.CROWN_GRASS:
      return { dark: '#2d4c5c', mid: '#4c7c8c', tip: '#9de0f8' };
    default:
      return { dark: '#1e5c35', mid: '#3aa658', tip: '#98f590' };
  }
}

interface ShoreBankPalette {
  rim: string;
  body: string;
  hi: string;
  wet: string;
}

function getShoreBankPalette(neighborTileId: number | undefined): ShoreBankPalette {
  if (neighborTileId === undefined) {
    return { rim: '#c49b5a', body: '#e8cc8f', hi: '#fff1c9', wet: 'rgba(32, 68, 96, 0.34)' };
  }
  if (SAND_TILES.has(neighborTileId) || neighborTileId === TILE.CHEST) {
    return { rim: '#b88e52', body: '#edd297', hi: '#fff2cc', wet: 'rgba(38, 72, 96, 0.32)' };
  }
  if (neighborTileId === TILE.SNOW_GRASS || neighborTileId === TILE.SNOW_PATH || neighborTileId === TILE.ICE_WALL) {
    return { rim: '#5b92b5', body: '#c7ecfa', hi: '#f2fcff', wet: 'rgba(26, 66, 112, 0.32)' };
  }
  if (neighborTileId === TILE.VOLCANO_FLOOR || neighborTileId === TILE.VOLCANO_PATH) {
    return { rim: '#261b2e', body: '#493647', hi: '#6d5260', wet: 'rgba(18, 10, 24, 0.44)' };
  }
  if (neighborTileId === TILE.CAVE_FLOOR || neighborTileId === TILE.CAVE_PATH || neighborTileId === TILE.CAVE_WALL) {
    return { rim: '#293459', body: '#4f6294', hi: '#7c94cc', wet: 'rgba(14, 22, 52, 0.40)' };
  }
  if (neighborTileId === TILE.MARSH_GRASS || neighborTileId === TILE.MARSH_PATH) {
    return { rim: '#1d444a', body: '#37736e', hi: '#68b59e', wet: 'rgba(14, 38, 46, 0.42)' };
  }
  if (neighborTileId === TILE.FAE_GRASS || neighborTileId === TILE.FAE_PATH) {
    return { rim: '#5b3975', body: '#9a6bb8', hi: '#dfb2f2', wet: 'rgba(42, 26, 72, 0.36)' };
  }
  if (PATH_TILES.has(neighborTileId) || neighborTileId === TILE.LANTERN) {
    return { rim: '#786855', body: '#b8a68a', hi: '#dfd2b8', wet: 'rgba(30, 48, 72, 0.34)' };
  }
  // Lush meadow turf shoreline
  return { rim: '#235e36', body: '#49a359', hi: '#8be07b', wet: 'rgba(20, 62, 68, 0.34)' };
}

function getFallbackTileColor(tileId: number, biomeAccent: string): Rgb255 {
  switch (tileId) {
    case TILE.PATH:
      return [184, 152, 114];
    case TILE.TALL_GRASS:
      return [48, 128, 64];
    case TILE.SAND:
    case TILE.DUNE_SAND:
    case TILE.ATOLL_SAND:
      return [222, 194, 134];
    case TILE.BRIDGE:
      return [146, 98, 56];
    case TILE.CAVE_WALL:
      return [54, 48, 84];
    case TILE.CAVE_FLOOR:
      return [76, 72, 114];
    case TILE.CAVE_PATH:
      return [112, 108, 154];
    case TILE.VOLCANO_FLOOR:
      return [84, 48, 44];
    case TILE.VOLCANO_PATH:
      return [122, 74, 58];
    case TILE.ICE_WALL:
      return [96, 138, 178];
    case TILE.SNOW_GRASS:
      return [138, 206, 232];
    case TILE.SNOW_PATH:
      return [196, 228, 244];
    case TILE.RUNE_TRAIL:
      return [112, 142, 198];
    case TILE.GROVE_GRASS:
      return [56, 134, 96];
    case TILE.GROVE_PATH:
      return [168, 156, 176];
    case TILE.DUNE_PATH:
      return [204, 162, 102];
    case TILE.SANDSTONE_WALL:
      return [142, 86, 48];
    case TILE.MARSH_GRASS:
      return [54, 104, 96];
    case TILE.MARSH_PATH:
      return [102, 122, 112];
    case TILE.MARSH_WALL:
      return [46, 54, 72];
    case TILE.SANCTUM_FLOOR:
      return [94, 84, 148];
    case TILE.SANCTUM_PATH:
      return [154, 146, 212];
    case TILE.SANCTUM_WALL:
      return [58, 50, 98];
    case TILE.CANYON_GRASS:
      return [164, 116, 62];
    case TILE.CANYON_PATH:
      return [192, 138, 84];
    case TILE.CANYON_WALL:
      return [122, 62, 42];
    case TILE.REEF_PATH:
      return [132, 188, 202];
    case TILE.REEF_WALL:
      return [42, 88, 118];
    case TILE.RUINS_FLOOR:
      return [108, 92, 84];
    case TILE.RUINS_PATH:
      return [152, 132, 108];
    case TILE.RUINS_WALL:
      return [68, 56, 64];
    case TILE.RIFT_FLOOR:
      return [62, 42, 108];
    case TILE.RIFT_PATH:
      return [118, 76, 168];
    case TILE.RIFT_WALL:
      return [38, 24, 72];
    case TILE.FAE_GRASS:
      return [148, 94, 164];
    case TILE.FAE_PATH:
      return [206, 172, 218];
    case TILE.FAE_WALL:
      return [88, 52, 114];
    case TILE.ATOLL_PATH:
      return [218, 182, 128];
    case TILE.ATOLL_WALL:
      return [72, 118, 92];
    case TILE.CROWN_GRASS:
      return [86, 122, 134];
    case TILE.CROWN_PATH:
      return [148, 164, 178];
    case TILE.CROWN_WALL:
      return [62, 74, 92];
    case TILE.TERA_FLOOR:
      return [58, 96, 144];
    case TILE.TERA_PATH:
      return [108, 168, 208];
    case TILE.TERA_WALL:
      return [42, 62, 108];
    case TILE.FLOWER:
      return [78, 142, 82];
    case TILE.HEAL:
      return [132, 152, 178];
    default:
      return mixRgb([76, 132, 84], hexToRgb255(biomeAccent), 0.12);
  }
}

function isLandmarkAt(
  landmarkTileKeys: ReadonlySet<string> | ReadonlySet<number>,
  tx: number,
  ty: number,
  tileIdx: number,
): boolean {
  if (landmarkTileKeys.size === 0) return false;
  if ((landmarkTileKeys as ReadonlySet<number>).has(tileIdx)) return true;
  if ((landmarkTileKeys as ReadonlySet<string>).has(`${tx},${ty}`)) return true;
  return false;
}

export class AutotileRenderer {
  private manifest: AtlasManifest | null = null;
  private getSheetImage: ((sheetId: string) => HTMLImageElement | null) | null = null;
  private grassDisplacements = new Map<number, GrassDisplacement>();
  private terrainChunks = new Map<string, HTMLCanvasElement>();
  private detailOverlayChunks = new Map<string, HTMLCanvasElement | null>();
  private shoreBankChunks = new Map<string, ShoreBankChunkEntry | null>();
  private chunkCacheSignature = '';
  private usedStaticChunkCacheThisFrame = false;
  private usedStaticDetailChunksThisFrame = false;
  private readonly activeGrassPushers: Array<{ x: number; y: number; weight: number }> = [
    { x: 0, y: 0, weight: 1 },
    { x: 0, y: 0, weight: 1 },
  ];
  private readonly activeGrassKeys = new Set<number>();

  setManifest(
    manifest: AtlasManifest | null,
    getSheetImage?: ((sheetId: string) => HTMLImageElement | null) | null,
  ): void {
    this.manifest = manifest;
    if (getSheetImage !== undefined) {
      this.getSheetImage = getSheetImage;
    }
    this.clearChunkCaches();
  }

  getManifest(): AtlasManifest | null {
    return this.manifest;
  }

  hasSheet(sheetId: string): boolean {
    return Boolean(this.manifest?.sheets?.[sheetId]);
  }

  getDisplacementCount(): number {
    return this.grassDisplacements.size;
  }

  resetEffects(): void {
    this.grassDisplacements.clear();
    this.clearChunkCaches();
  }

  private clearChunkCaches(): void {
    this.terrainChunks.clear();
    this.detailOverlayChunks.clear();
    this.shoreBankChunks.clear();
    this.chunkCacheSignature = '';
  }

  private syncChunkSignature(
    cols: number,
    rows: number,
    tileSize: number,
    sourceTag: string,
  ): void {
    const sig = `${cols}x${rows}x${tileSize}|${sourceTag}`;
    if (this.chunkCacheSignature !== sig) {
      this.terrainChunks.clear();
      this.detailOverlayChunks.clear();
      this.shoreBankChunks.clear();
      this.chunkCacheSignature = sig;
    }
  }

  /**
   * Bakes a 16x16 tile terrain chunk at `chunkScale` resolution (2x = 64px/tile HD-2D on Canvas2D,
   * 1x = 32px/tile L2-cache-friendly on WebGL2 software rasterizer) with full tile albedo,
   * organic per-tile micro-variation, static 47-tile transitions, and baked prop shadows.
   */
  private getOrBakeTerrainChunk(
    chunkX: number,
    chunkY: number,
    state: OverworldSceneState,
    meta: StaticMapMeta,
    terrainAlbedo: HTMLImageElement,
    landmarkTileKeys: ReadonlySet<string> | ReadonlySet<number>,
    chunkScale = CHUNK_PIXEL_SCALE,
  ): HTMLCanvasElement | null {
    const { cols, rows, tileSize, worldMap } = state;
    const sheet = this.manifest?.sheets?.terrain;
    if (!sheet || typeof document === 'undefined') return null;

    this.syncChunkSignature(
      cols,
      rows,
      tileSize,
      `${terrainAlbedo.src || String(terrainAlbedo.naturalWidth)}|s${chunkScale}`,
    );

    const key = `${chunkX},${chunkY}`;
    const existing = this.terrainChunks.get(key);
    if (existing) return existing;

    const startTx = chunkX * TERRAIN_CHUNK_TILES;
    const startTy = chunkY * TERRAIN_CHUNK_TILES;
    const endTx = Math.min(cols - 1, startTx + TERRAIN_CHUNK_TILES - 1);
    const endTy = Math.min(rows - 1, startTy + TERRAIN_CHUNK_TILES - 1);
    const spanCols = endTx - startTx + 1;
    const spanRows = endTy - startTy + 1;
    if (spanCols <= 0 || spanRows <= 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = spanCols * tileSize * chunkScale;
    canvas.height = spanRows * tileSize * chunkScale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;

    const regions = sheet.regions;
    const scaledTile = tileSize * chunkScale;
    for (let ty = startTy; ty <= endTy; ty++) {
      const row = worldMap[ty];
      if (!row) continue;
      const ly = (ty - startTy) * scaledTile;
      for (let tx = startTx; tx <= endTx; tx++) {
        const rawTileId = row[tx] ?? TILE.GRASS;
        const idx = ty * cols + tx;
        const effectiveTileId = meta.buildingCache.tileKeys.has(idx) ? TILE.GRASS : rawTileId;
        const lx = (tx - startTx) * scaledTile;
        const region = regions[`tile_${effectiveTileId}`];
        if (region) {
          ctx.drawImage(
            terrainAlbedo,
            region.x,
            region.y,
            region.w,
            region.h,
            lx,
            ly,
            scaledTile,
            scaledTile,
          );
        }
      }
    }

    // Bake static 47-tile transitions, per-tile micro-variation, and static prop shadows
    ctx.save();
    ctx.scale(chunkScale, chunkScale);
    this.paintStaticChunkTransitions(ctx, state, meta, startTx, startTy, endTx, endTy);
    this.paintStaticChunkPropShadows(ctx, state, meta, startTx, startTy, endTx, endTy, landmarkTileKeys);
    ctx.restore();

    markImmutableCanvas(canvas);
    this.terrainChunks.set(key, canvas);
    return canvas;
  }

  /**
   * Bakes a transparent 8x8 static detail chunk (for WebGL2 path) containing all organic
   * per-tile variation, grass-over-path tufts, sand fringes, cliff bevels, bridge rails,
   * and static prop contact shadows. Uploaded ONCE to VRAM via __starlightImmutable.
   */
  private getOrBakeDetailOverlayChunk(
    chunkX: number,
    chunkY: number,
    state: OverworldSceneState,
    meta: StaticMapMeta,
    landmarkTileKeys: ReadonlySet<string> | ReadonlySet<number>,
  ): HTMLCanvasElement | null {
    const { cols, rows, tileSize } = state;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;

    this.syncChunkSignature(cols, rows, tileSize, 'webgl2-detail-v2');

    const key = `${chunkX},${chunkY}`;
    if (this.detailOverlayChunks.has(key)) {
      return this.detailOverlayChunks.get(key) ?? null;
    }

    const startTx = chunkX * TERRAIN_CHUNK_TILES;
    const startTy = chunkY * TERRAIN_CHUNK_TILES;
    const endTx = Math.min(cols - 1, startTx + TERRAIN_CHUNK_TILES - 1);
    const endTy = Math.min(rows - 1, startTy + TERRAIN_CHUNK_TILES - 1);
    const spanCols = endTx - startTx + 1;
    const spanRows = endTy - startTy + 1;
    if (spanCols <= 0 || spanRows <= 0) {
      this.detailOverlayChunks.set(key, null);
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = spanCols * tileSize * CHUNK_PIXEL_SCALE;
    canvas.height = spanRows * tileSize * CHUNK_PIXEL_SCALE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.detailOverlayChunks.set(key, null);
      return null;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.scale(CHUNK_PIXEL_SCALE, CHUNK_PIXEL_SCALE);
    this.paintStaticChunkTransitions(ctx, state, meta, startTx, startTy, endTx, endTy);
    this.paintStaticChunkPropShadows(ctx, state, meta, startTx, startTy, endTx, endTy, landmarkTileKeys);
    ctx.restore();

    markImmutableCanvas(canvas);
    this.detailOverlayChunks.set(key, canvas);
    return canvas;
  }

  /**
   * Bakes a tightly cropped transparent organic shoreline bank chunk rendered AFTER drawWaterQuad
   * so curved sand/grass coves & rounded corner banks eliminate boxy water rectangles with minimal
   * fragment overdraw on WebGL2 & Canvas2D!
   */
  private getOrBakeShoreBankChunk(
    chunkX: number,
    chunkY: number,
    state: OverworldSceneState,
    meta: StaticMapMeta,
    chunkScale = CHUNK_PIXEL_SCALE,
  ): ShoreBankChunkEntry | null {
    const { cols, rows, tileSize, worldMap } = state;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    const cIdx = chunkY * meta.chunkCols + chunkX;
    if (!meta.chunkHasWaterOrLava[cIdx]) return null;

    const key = `${chunkX},${chunkY}`;
    if (this.shoreBankChunks.has(key)) {
      return this.shoreBankChunks.get(key) ?? null;
    }

    const startTx = chunkX * TERRAIN_CHUNK_TILES;
    const startTy = chunkY * TERRAIN_CHUNK_TILES;
    const endTx = Math.min(cols - 1, startTx + TERRAIN_CHUNK_TILES - 1);
    const endTy = Math.min(rows - 1, startTy + TERRAIN_CHUNK_TILES - 1);
    if (endTx < startTx || endTy < startTy) {
      this.shoreBankChunks.set(key, null);
      return null;
    }

    // Pass 1: Compute tight bounding box of water tiles that actually border land or shallow/deep transitions
    const isLand = (id: number | undefined): boolean =>
      id !== undefined && !LIQUID_TILES.has(id) && id !== TILE.BRIDGE;
    let minSTx = cols;
    let maxSTx = -1;
    let minSTy = rows;
    let maxSTy = -1;

    for (let ty = startTy; ty <= endTy; ty++) {
      const row = worldMap[ty];
      if (!row) continue;
      for (let tx = startTx; tx <= endTx; tx++) {
        const tileId = row[tx] ?? TILE.GRASS;
        if (!WATER_TILES.has(tileId)) continue;
        const nTile = ty > 0 ? worldMap[ty - 1]?.[tx] : undefined;
        const sTile = ty + 1 < rows ? worldMap[ty + 1]?.[tx] : undefined;
        const wTile = tx > 0 ? row[tx - 1] : undefined;
        const eTile = tx + 1 < cols ? row[tx + 1] : undefined;
        const nwTile = ty > 0 && tx > 0 ? worldMap[ty - 1]?.[tx - 1] : undefined;
        const neTile = ty > 0 && tx + 1 < cols ? worldMap[ty - 1]?.[tx + 1] : undefined;
        const swTile = ty + 1 < rows && tx > 0 ? worldMap[ty + 1]?.[tx - 1] : undefined;
        const seTile = ty + 1 < rows && tx + 1 < cols ? worldMap[ty + 1]?.[tx + 1] : undefined;

        const hasShore =
          isLand(nTile) ||
          isLand(sTile) ||
          isLand(wTile) ||
          isLand(eTile) ||
          isLand(nwTile) ||
          isLand(neTile) ||
          isLand(swTile) ||
          isLand(seTile) ||
          ((tileId === TILE.SHALLOW_WATER || tileId === TILE.REEF_WATER) &&
            (nTile === TILE.WATER || sTile === TILE.WATER || wTile === TILE.WATER || eTile === TILE.WATER));
        if (!hasShore) continue;

        if (tx < minSTx) minSTx = tx;
        if (tx > maxSTx) maxSTx = tx;
        if (ty < minSTy) minSTy = ty;
        if (ty > maxSTy) maxSTy = ty;
      }
    }

    if (maxSTx < minSTx || maxSTy < minSTy) {
      this.shoreBankChunks.set(key, null);
      return null;
    }

    const spanCols = maxSTx - minSTx + 1;
    const spanRows = maxSTy - minSTy + 1;
    const canvas = document.createElement('canvas');
    canvas.width = spanCols * tileSize * chunkScale;
    canvas.height = spanRows * tileSize * chunkScale;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.shoreBankChunks.set(key, null);
      return null;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.scale(chunkScale, chunkScale);

    let drewAny = false;
    for (let ty = minSTy; ty <= maxSTy; ty++) {
      const row = worldMap[ty];
      if (!row) continue;
      const ly = (ty - minSTy) * tileSize;
      for (let tx = minSTx; tx <= maxSTx; tx++) {
        const tileId = row[tx] ?? TILE.GRASS;
        if (!WATER_TILES.has(tileId)) continue;
        const lx = (tx - minSTx) * tileSize;
        const nTile = ty > 0 ? worldMap[ty - 1]?.[tx] : undefined;
        const sTile = ty + 1 < rows ? worldMap[ty + 1]?.[tx] : undefined;
        const wTile = tx > 0 ? row[tx - 1] : undefined;
        const eTile = tx + 1 < cols ? row[tx + 1] : undefined;
        const nwTile = ty > 0 && tx > 0 ? worldMap[ty - 1]?.[tx - 1] : undefined;
        const neTile = ty > 0 && tx + 1 < cols ? worldMap[ty - 1]?.[tx + 1] : undefined;
        const swTile = ty + 1 < rows && tx > 0 ? worldMap[ty + 1]?.[tx - 1] : undefined;
        const seTile = ty + 1 < rows && tx + 1 < cols ? worldMap[ty + 1]?.[tx + 1] : undefined;

        if (
          this.drawOrganicWaterShoreBank(
            ctx,
            lx,
            ly,
            tileSize,
            tx,
            ty,
            tileId,
            nTile,
            sTile,
            wTile,
            eTile,
            nwTile,
            neTile,
            swTile,
            seTile,
          )
        ) {
          drewAny = true;
        }
      }
    }
    ctx.restore();

    if (!drewAny) {
      this.shoreBankChunks.set(key, null);
      return null;
    }

    markImmutableCanvas(canvas);
    const entry: ShoreBankChunkEntry = {
      canvas,
      startTx: minSTx,
      startTy: minSTy,
      endTx: maxSTx,
      endTy: maxSTy,
      widthWorld: spanCols * tileSize,
      heightWorld: spanRows * tileSize,
    };
    this.shoreBankChunks.set(key, entry);
    return entry;
  }

  private paintStaticChunkTransitions(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    meta: StaticMapMeta,
    startTx: number,
    startTy: number,
    endTx: number,
    endTy: number,
  ): void {
    const { cols, rows, tileSize, worldMap } = state;

    for (let ty = startTy; ty <= endTy; ty++) {
      const row = worldMap[ty];
      if (!row) continue;
      const ly = (ty - startTy) * tileSize;
      for (let tx = startTx; tx <= endTx; tx++) {
        const idx = ty * cols + tx;
        const rawTileId = row[tx] ?? TILE.GRASS;
        const tileId = meta.buildingCache.tileKeys.has(idx) ? TILE.GRASS : rawTileId;
        const lx = (tx - startTx) * tileSize;

        const nTile = ty > 0 ? worldMap[ty - 1]?.[tx] : undefined;
        const sTile = ty + 1 < rows ? worldMap[ty + 1]?.[tx] : undefined;
        const wTile = tx > 0 ? row[tx - 1] : undefined;
        const eTile = tx + 1 < cols ? row[tx + 1] : undefined;

        // 1. Per-tile organic micro-variation breaking repeating tile grids
        this.drawTileMicroVariation(ctx, lx, ly, tileSize, tx, ty, tileId);

        // 2. Static 47-tile autotile seams, tufted curbs, bridges, and organic sand fringes
        if (WALL_TILES.has(tileId)) {
          this.drawWallAutotileOverlay(ctx, lx, ly, tileSize, meta.wallMasks[idx], sTile);
        } else if (PATH_TILES.has(tileId)) {
          this.drawPathBorderOverlay(
            ctx,
            lx,
            ly,
            tileSize,
            tx,
            ty,
            tileId,
            meta.pathMasks[idx],
            0,
            false,
            nTile,
            sTile,
            wTile,
            eTile,
          );
        } else if (tileId === TILE.BRIDGE) {
          this.drawBridgePixelOverlay(ctx, lx, ly, tileSize, ty, nTile, sTile, wTile, eTile);
        } else if (SAND_TILES.has(tileId)) {
          const nwTile = ty > 0 && tx > 0 ? worldMap[ty - 1]?.[tx - 1] : undefined;
          const neTile = ty > 0 && tx + 1 < cols ? worldMap[ty - 1]?.[tx + 1] : undefined;
          const swTile = ty + 1 < rows && tx > 0 ? worldMap[ty + 1]?.[tx - 1] : undefined;
          const seTile = ty + 1 < rows && tx + 1 < cols ? worldMap[ty + 1]?.[tx + 1] : undefined;
          this.drawSandOrganicTransitions(
            ctx,
            lx,
            ly,
            tileSize,
            tx,
            ty,
            nTile,
            sTile,
            wTile,
            eTile,
            nwTile,
            neTile,
            swTile,
            seTile,
          );
        }
      }
    }
  }

  private paintStaticChunkPropShadows(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    meta: StaticMapMeta,
    startTx: number,
    startTy: number,
    endTx: number,
    endTy: number,
    landmarkTileKeys: ReadonlySet<string> | ReadonlySet<number>,
  ): void {
    const { tileSize } = state;

    for (const cluster of meta.buildingCache.clusters) {
      if (
        cluster.tx + cluster.widthTiles < startTx ||
        cluster.tx > endTx + 1 ||
        cluster.ty + cluster.heightTiles < startTy ||
        cluster.ty > endTy + 1
      ) {
        continue;
      }
      const cx = (cluster.tx - startTx + cluster.widthTiles * 0.5) * tileSize;
      const baseY = (cluster.ty - startTy + cluster.heightTiles) * tileSize - 2;
      drawContactShadow(ctx, cx, baseY, cluster.widthTiles * tileSize * 0.52, 7.5, 0.34);
    }

    const chunkX = Math.floor(startTx / TERRAIN_CHUNK_TILES);
    const chunkY = Math.floor(startTy / TERRAIN_CHUNK_TILES);
    const cIdx = chunkY * meta.chunkCols + chunkX;
    const props = meta.chunkProps[cIdx];
    if (!props) return;

    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      const cx = (p.tx - startTx + 0.5) * tileSize;
      const baseY = (p.ty - startTy + 0.91) * tileSize;
      if (p.kind === 'tree') {
        if (isLandmarkAt(landmarkTileKeys, p.tx, p.ty, p.tileIdx)) continue;
        drawContactShadow(ctx, cx, baseY + p.yJitter, tileSize * 0.44 * p.scale, 4.8, 0.30);
      } else if (p.kind === 'heal') {
        drawContactShadow(ctx, cx, baseY, tileSize * 0.46, 5.2, 0.32);
      } else if (p.kind === 'lantern') {
        drawContactShadow(ctx, cx, baseY, tileSize * 0.25, 3.2, 0.28);
      } else if (p.kind === 'sign') {
        drawContactShadow(ctx, cx, baseY, tileSize * 0.28, 3.2, 0.28);
      }
    }
  }

  /**
   * Subtle tile-coordinate-seeded micro-details baked once per chunk to break repeating
   * square grass/cobble/sand grids into an organic, hand-crafted HD-2D world.
   */
  private drawTileMicroVariation(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    tx: number,
    ty: number,
    tileId: number,
  ): void {
    const h = hash2D(tx, ty, 101);
    const h2 = hash2D(tx, ty, 107);

    if (tileId === TILE.GRASS || tileId === TILE.GROVE_GRASS || tileId === TILE.FAE_GRASS) {
      // Gentle sunlit meadow patch or cool dapple to prevent uniform grid tiling
      if (h > 0.62) {
        ctx.fillStyle = tileId === TILE.FAE_GRASS ? 'rgba(255, 224, 255, 0.08)' : 'rgba(204, 248, 146, 0.09)';
        const rx = 4 + Math.floor(h2 * 12);
        const ry = 4 + Math.floor(hash2D(tx, ty, 113) * 12);
        ctx.fillRect(px + rx, py + ry, 10, 6);
        ctx.fillRect(px + rx + 2, py + ry - 2, 6, 10);
      } else if (h < 0.28) {
        ctx.fillStyle = 'rgba(14, 52, 42, 0.08)';
        const rx = 6 + Math.floor(h2 * 10);
        const ry = 6 + Math.floor(hash2D(tx, ty, 115) * 10);
        ctx.fillRect(px + rx, py + ry, 10, 6);
      }

      // Scattered organic pixel clovers & tiny wildflower buds (2-3 per select tiles)
      if (h2 > 0.34) {
        const cx = px + 4 + Math.floor(hash2D(tx, ty, 121) * (tileSize - 10));
        const cy = py + 5 + Math.floor(hash2D(tx, ty, 127) * (tileSize - 10));
        ctx.fillStyle = tileId === TILE.FAE_GRASS ? '#6e459c' : '#1f6338';
        ctx.fillRect(cx, cy + 2, 3, 1);
        ctx.fillStyle = tileId === TILE.FAE_GRASS ? '#c892eb' : '#4ec268';
        ctx.fillRect(cx - 1, cy + 1, 2, 1);
        ctx.fillRect(cx + 1, cy + 1, 2, 1);
        ctx.fillStyle = tileId === TILE.FAE_GRASS ? '#ffe3fa' : '#a8f084';
        ctx.fillRect(cx, cy, 2, 1);
      }
      if (h > 0.78) {
        const bx = px + 6 + Math.floor(hash2D(tx, ty, 131) * (tileSize - 12));
        const by = py + 6 + Math.floor(hash2D(tx, ty, 137) * (tileSize - 12));
        ctx.fillStyle = tileId === TILE.GROVE_GRASS ? '#ffb3d9' : h2 > 0.5 ? '#fff3a8' : '#f8fafc';
        ctx.fillRect(bx, by, 2, 2);
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(bx, by, 1, 1);
      }
    } else if (tileId === TILE.PATH) {
      // Subtle weathered warm/cool flagstone variance + tiny mossy tufts in joints
      if (h > 0.68) {
        ctx.fillStyle = 'rgba(255, 244, 214, 0.08)';
        ctx.fillRect(px + 4 + Math.floor(h2 * 14), py + 4 + Math.floor(hash2D(tx, ty, 149) * 14), 8, 6);
      } else if (h < 0.25) {
        ctx.fillStyle = 'rgba(42, 48, 72, 0.09)';
        ctx.fillRect(px + 4 + Math.floor(h2 * 14), py + 6 + Math.floor(hash2D(tx, ty, 151) * 12), 7, 5);
      }
      if (h2 > 0.62) {
        const mx = px + 4 + Math.floor(hash2D(tx, ty, 157) * 22);
        const my = py + 4 + Math.floor(hash2D(tx, ty, 163) * 22);
        ctx.fillStyle = 'rgba(58, 136, 68, 0.45)';
        ctx.fillRect(mx, my, 2, 1);
        ctx.fillRect(mx + 1, my - 1, 1, 1);
      }
    } else if (SAND_TILES.has(tileId)) {
      if (h > 0.66) {
        // Tiny pink/cream seashell or sunlit pebble breaking up open beach sand
        const sx = px + 5 + Math.floor(h2 * 20);
        const sy = py + 5 + Math.floor(hash2D(tx, ty, 173) * 20);
        ctx.fillStyle = 'rgba(138, 98, 56, 0.32)';
        ctx.fillRect(sx, sy + 2, 3, 1);
        ctx.fillStyle = h2 > 0.5 ? '#ffe8d6' : '#ffd2c4';
        ctx.fillRect(sx, sy, 3, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx, sy, 1, 1);
      }
    }
  }

  /**
   * Advances spring-physics tall grass displacement across all 7 tall-grass tile types
   * around the player and Lead Pokémon follower (zero per-frame array/set allocations).
   */
  update(state: OverworldSceneState, dtSeconds: number): void {
    const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
    const { cols, rows, worldMap, player, follower } = state;

    const pushers = this.activeGrassPushers;
    pushers[0].x = player.x + 0.5;
    pushers[0].y = player.y + 0.5;
    pushers[0].weight = player.moving ? 1.0 : 0.72;
    const pusherCount = follower ? 2 : 1;
    if (follower) {
      pushers[1].x = follower.x + 0.5;
      pushers[1].y = follower.y + 0.5;
      pushers[1].weight = follower.moving ? 0.85 : 0.6;
    }

    const activeSet = this.activeGrassKeys;
    activeSet.clear();
    const influenceRadius = 1.15;

    for (let pIdx = 0; pIdx < pusherCount; pIdx++) {
      const pusher = pushers[pIdx];
      const minTx = Math.max(0, Math.floor(pusher.x - influenceRadius));
      const maxTx = Math.min(cols - 1, Math.ceil(pusher.x + influenceRadius));
      const minTy = Math.max(0, Math.floor(pusher.y - influenceRadius));
      const maxTy = Math.min(rows - 1, Math.ceil(pusher.y + influenceRadius));

      for (let ty = minTy; ty <= maxTy; ty++) {
        const row = worldMap[ty];
        if (!row) continue;
        for (let tx = minTx; tx <= maxTx; tx++) {
          const tileId = row[tx];
          if (tileId === undefined || !TALL_GRASS_TILES.has(tileId)) continue;

          const cx = tx + 0.5;
          const cy = ty + 0.5;
          const dx = cx - pusher.x;
          const dy = cy - pusher.y;
          const dist = Math.hypot(dx, dy);
          if (dist >= influenceRadius) continue;

          const idx = ty * cols + tx;
          const falloff = clamp(1 - dist / influenceRadius, 0, 1);
          const targetIntensity = clamp(falloff * 1.25 * pusher.weight, 0, 1);
          const nx = dist > 0.001 ? dx / dist : 0;
          const ny = dist > 0.001 ? dy / dist : -1;

          activeSet.add(idx);
          const existing = this.grassDisplacements.get(idx);
          if (existing) {
            const blend = clamp(1 - Math.exp(-16 * dt), 0.25, 1);
            existing.bendX = lerp(existing.bendX, nx, blend);
            existing.bendY = lerp(existing.bendY, ny, blend);
            existing.intensity = Math.max(
              existing.intensity,
              lerp(existing.intensity, targetIntensity, blend),
            );
          } else {
            this.grassDisplacements.set(idx, {
              tileX: tx,
              tileY: ty,
              bendX: nx,
              bendY: ny,
              intensity: Math.max(0.28, targetIntensity),
            });
          }
        }
      }
    }

    if (this.grassDisplacements.size === 0) return;

    const decayFactor = Math.exp(-3.4 * dt);
    const springOsc = Math.cos(state.elapsedSeconds * 11) * 0.08 * dt;
    for (const [idx, disp] of this.grassDisplacements) {
      if (activeSet.has(idx)) continue;
      disp.intensity = disp.intensity * decayFactor - 0.12 * dt;
      disp.bendX += disp.bendX * springOsc;
      if (disp.intensity <= 0.015) {
        this.grassDisplacements.delete(idx);
      }
    }
  }

  /**
   * Pass 1: Emits frustum-culled 'terrain' atlas sprites (or 2x HD-2D cached terrain chunks),
   * translucent water/lava quads (`drawWaterQuad`) with precomputed foam masks, and static
   * organic shoreline/detail chunks rendered AFTER water to eliminate rectangular pond corners.
   */
  renderTerrainAndWater(
    backend: IRenderBackend,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    camera: { camX: number; camY: number; camZoom: number },
    landmarkTileKeys: ReadonlySet<string> | ReadonlySet<number> = EMPTY_KEY_SET,
  ): void {
    const { cols, rows, tileSize, worldMap } = state;
    const meta = getOrBuildStaticMapMeta(worldMap, cols, rows, state.currentBiomeId);
    this.usedStaticChunkCacheThisFrame = false;
    this.usedStaticDetailChunksThisFrame = false;

    // Procedural fallback base when 'terrain' sheet is not yet attached
    if (!this.hasSheet('terrain')) {
      backend.drawCustom2D((ctx, viewW, viewH) => {
        this.drawBaseTilesFallback(ctx, state, bounds, camera.camX, camera.camY, camera.camZoom, viewW, viewH);
      }, 'world');
    }

    // Use unified single-pass pre-baked 16x16 HD-2D terrain+detail chunks on Canvas2D AND
    // WebGL2 software rasterizers (eliminates full-screen double overdraw and cuts draw calls by ~3-4x!).
    const isSoftwareWebGL =
      backend.kind === 'webgl2' && backend.capabilities.isSoftwareRasterizer;
    const useUnifiedTerrainChunks = backend.kind === 'canvas2d' || isSoftwareWebGL;
    const activeChunkScale = isSoftwareWebGL ? 1 : CHUNK_PIXEL_SCALE;
    const terrainAlbedo =
      useUnifiedTerrainChunks && this.hasSheet('terrain') && this.getSheetImage
        ? this.getSheetImage('terrain')
        : null;

    // Tighten 16x16 chunk bounds inward by 1 tile from the +2-tile padded frustum (still >=1 tile margin)
    // so off-screen 16x16 chunks aren't unnecessarily drawn.
    const chunkMinTx = Math.min(bounds.maxTx, bounds.minTx + 1);
    const chunkMaxTx = Math.max(bounds.minTx, bounds.maxTx - 1);
    const chunkMinTy = Math.min(bounds.maxTy, bounds.minTy + 1);
    const chunkMaxTy = Math.max(bounds.minTy, bounds.maxTy - 1);
    const minCx = Math.floor(chunkMinTx / TERRAIN_CHUNK_TILES);
    const maxCx = Math.floor(chunkMaxTx / TERRAIN_CHUNK_TILES);
    const minCy = Math.floor(chunkMinTy / TERRAIN_CHUNK_TILES);
    const maxCy = Math.floor(chunkMaxTy / TERRAIN_CHUNK_TILES);

    if (
      terrainAlbedo &&
      terrainAlbedo.naturalWidth > 0 &&
      typeof document !== 'undefined'
    ) {
      // Unified single-pass fast path: blit pre-baked 16x16 static terrain+detail chunks
      this.usedStaticChunkCacheThisFrame = true;
      this.usedStaticDetailChunksThisFrame = true;

      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          const chunk = this.getOrBakeTerrainChunk(
            cx,
            cy,
            state,
            meta,
            terrainAlbedo,
            landmarkTileKeys,
            activeChunkScale,
          );
          if (!chunk) continue;
          const worldW = chunk.width / activeChunkScale;
          const worldH = chunk.height / activeChunkScale;
          backend.drawSprite({
            source: chunk,
            sx: 0,
            sy: 0,
            sw: chunk.width,
            sh: chunk.height,
            dx: cx * TERRAIN_CHUNK_TILES * tileSize,
            dy: cy * TERRAIN_CHUNK_TILES * tileSize,
            dw: worldW,
            dh: worldH,
            pixelCrisp: true,
            useNormalMap: false,
            staticSource: true,
            depth: 0,
          });
        }
      }
    } else {
      // Hardware WebGL2 instanced / headless test path: emit visible tiles (0..60) with full 512x512 normal & emissive maps
      const regions = this.manifest?.sheets?.terrain?.regions;
      for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
        const row = worldMap[ty];
        if (!row) continue;
        const dy = ty * tileSize;
        for (let tx = bounds.minTx; tx <= bounds.maxTx; tx++) {
          const rawTileId = row[tx] ?? TILE.GRASS;
          const idx = ty * cols + tx;
          const effectiveTileId = meta.buildingCache.tileKeys.has(idx) ? TILE.GRASS : rawTileId;
          const regionId = `tile_${effectiveTileId}`;
          const region = regions?.[regionId];

          backend.drawSprite({
            sheetId: 'terrain',
            regionId,
            ...(region ? { sx: region.x, sy: region.y, sw: region.w, sh: region.h } : {}),
            dx: tx * tileSize,
            dy,
            dw: tileSize,
            dh: tileSize,
            pixelCrisp: true,
            useNormalMap: true,
            depth: 0,
          });
        }
      }

      // On hardware WebGL2 in real browsers, blit cached 2x immutable 16x16 detail chunks (2-4 draws)
      if (backend.kind === 'webgl2' && typeof document !== 'undefined') {
        this.usedStaticDetailChunksThisFrame = true;
        for (let cy = minCy; cy <= maxCy; cy++) {
          for (let cx = minCx; cx <= maxCx; cx++) {
            const detailChunk = this.getOrBakeDetailOverlayChunk(cx, cy, state, meta, landmarkTileKeys);
            if (!detailChunk) continue;
            backend.drawSprite({
              source: detailChunk,
              sx: 0,
              sy: 0,
              sw: detailChunk.width,
              sh: detailChunk.height,
              dx: cx * TERRAIN_CHUNK_TILES * tileSize,
              dy: cy * TERRAIN_CHUNK_TILES * tileSize,
              dw: detailChunk.width / CHUNK_PIXEL_SCALE,
              dh: detailChunk.height / CHUNK_PIXEL_SCALE,
              pixelCrisp: true,
              useNormalMap: false,
              staticSource: true,
              depth: 0.1,
            });
          }
        }
      }
    }

    // Water & Lava shimmering quads (2D rectangle coalesced on Canvas2D & SwiftShader WebGL2 when organic shore chunks handle banks!)
    const softenCanvas2DShoreFoam =
      (backend.kind === 'canvas2d' || isSoftwareWebGL) && this.usedStaticChunkCacheThisFrame;
    const spanW = Math.max(1, bounds.maxTx - bounds.minTx + 1);
    const spanH = Math.max(1, bounds.maxTy - bounds.minTy + 1);
    const waterVisited =
      softenCanvas2DShoreFoam && this.usedStaticDetailChunksThisFrame
        ? new Uint8Array(spanW * spanH)
        : null;

    for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
      const row = worldMap[ty];
      if (!row) continue;
      let tx = bounds.minTx;
      while (tx <= bounds.maxTx) {
        if (waterVisited && waterVisited[(ty - bounds.minTy) * spanW + (tx - bounds.minTx)]) {
          tx += 1;
          continue;
        }
        const tileId = row[tx] ?? TILE.GRASS;
        if (!LIQUID_TILES.has(tileId)) {
          tx += 1;
          continue;
        }

        const depthFactor =
          tileId === TILE.WATER
            ? 0.86
            : tileId === TILE.LAVA
              ? 0.78
              : tileId === TILE.REEF_WATER
                ? 0.38
                : 0.24;

        const rawFoamMask = meta.foamMasks[ty * cols + tx];
        // On Canvas2D with organic shore bank chunks active, suppress Canvas2DBackend's boxy dashed edge bars
        // (foamMask = 0) and merge contiguous 2D water rectangles so sky reflections flow smoothly across
        // whole ponds & lagoons without horizontal row striping!
        const foamMask = softenCanvas2DShoreFoam ? 0 : rawFoamMask;

        let runEnd = tx;
        let runRows = 1;
        if (waterVisited && foamMask === 0) {
          while (
            runEnd + 1 <= bounds.maxTx &&
            !waterVisited[(ty - bounds.minTy) * spanW + (runEnd + 1 - bounds.minTx)] &&
            row[runEnd + 1] === tileId
          ) {
            runEnd += 1;
          }
          // Expand vertically as far as the full horizontal span stays identical tileId
          while (ty + runRows <= bounds.maxTy) {
            const nextRow = worldMap[ty + runRows];
            if (!nextRow) break;
            let rowMatches = true;
            for (let cx = tx; cx <= runEnd; cx++) {
              if (
                nextRow[cx] !== tileId ||
                waterVisited[(ty + runRows - bounds.minTy) * spanW + (cx - bounds.minTx)]
              ) {
                rowMatches = false;
                break;
              }
            }
            if (!rowMatches) break;
            runRows += 1;
          }
          for (let ry = ty; ry < ty + runRows; ry++) {
            const rowOff = (ry - bounds.minTy) * spanW;
            for (let cx = tx; cx <= runEnd; cx++) {
              waterVisited[rowOff + (cx - bounds.minTx)] = 1;
            }
          }
        } else if (this.usedStaticDetailChunksThisFrame && foamMask === 0) {
          while (runEnd + 1 <= bounds.maxTx && row[runEnd + 1] === tileId) {
            const nextRaw = meta.foamMasks[ty * cols + (runEnd + 1)];
            if (nextRaw !== 0) break;
            runEnd += 1;
          }
        }
        const runCols = runEnd - tx + 1;
        backend.drawWaterQuad(
          tx * tileSize,
          ty * tileSize,
          runCols * tileSize,
          runRows * tileSize,
          depthFactor,
          foamMask,
        );
        tx = runEnd + 1;
      }
    }

    // Blit tightly cropped organic curved shoreline bank chunks AFTER water quads (masks boxy pond/beach corners!)
    if (this.usedStaticDetailChunksThisFrame) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          const shoreChunk = this.getOrBakeShoreBankChunk(cx, cy, state, meta, activeChunkScale);
          if (!shoreChunk) continue;
          if (
            shoreChunk.endTx < bounds.minTx ||
            shoreChunk.startTx > bounds.maxTx ||
            shoreChunk.endTy < bounds.minTy ||
            shoreChunk.startTy > bounds.maxTy
          ) {
            continue;
          }
          backend.drawSprite({
            source: shoreChunk.canvas,
            sx: 0,
            sy: 0,
            sw: shoreChunk.canvas.width,
            sh: shoreChunk.canvas.height,
            dx: shoreChunk.startTx * tileSize,
            dy: shoreChunk.startTy * tileSize,
            dw: shoreChunk.widthWorld,
            dh: shoreChunk.heightWorld,
            pixelCrisp: true,
            useNormalMap: false,
            staticSource: true,
            depth: 0.2,
          });
        }
      }
    }
  }

  private drawBaseTilesFallback(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    camX: number,
    camY: number,
    camZoom: number,
    viewW: number,
    viewH: number,
  ): void {
    const { cols, rows, tileSize, worldMap, currentBiomeId } = state;
    const profile = getBiomeVisualProfile(currentBiomeId);
    const buildingCache = detectBuildingClusters(worldMap, cols, rows);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(viewW * 0.5, viewH * 0.5);
    if (camZoom !== 1) ctx.scale(camZoom, camZoom);
    ctx.translate(-viewW * 0.5 - camX, -viewH * 0.5 - camY);

    for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
      const row = worldMap[ty];
      if (!row) continue;
      for (let tx = bounds.minTx; tx <= bounds.maxTx; tx++) {
        const rawTileId = row[tx] ?? TILE.GRASS;
        if (LIQUID_TILES.has(rawTileId)) continue;

        const idx = ty * cols + tx;
        const tileId = buildingCache.tileKeys.has(idx) ? TILE.GRASS : rawTileId;
        const px = tx * tileSize;
        const py = ty * tileSize;
        const jitter = hash2D(tx, ty, 3) * 0.1 - 0.05;
        const base = shadeRgb(getFallbackTileColor(tileId, profile.accentHex), 1 + jitter);

        ctx.fillStyle = rgb255ToStr(base);
        ctx.fillRect(px, py, tileSize + 0.5, tileSize + 0.5);

        if (hash2D(tx, ty, 19) > 0.35) {
          ctx.fillStyle = rgb255ToStr(shadeRgb(base, 1.14, 6), 0.5);
          ctx.fillRect(
            px + Math.floor(hash2D(tx, ty, 21) * 12) * 2 + 2,
            py + Math.floor(hash2D(tx, ty, 23) * 12) * 2 + 2,
            4,
            2,
          );
        }
      }
    }

    ctx.restore();
  }

  /**
   * Renders dynamic animated ground details (animated water shore ripples/lace, lava pulse,
   * swaying wildflower blossoms, rune trail glow) and static 47-tile transitions when chunks
   * aren't cached (e.g. headless Node unit tests).
   */
  renderTerrainDetailOverlays(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
  ): void {
    const { cols, rows, tileSize, worldMap, elapsedSeconds, reducedMotion } = state;
    const meta = getOrBuildStaticMapMeta(worldMap, cols, rows, state.currentBiomeId);
    const t = reducedMotion ? elapsedSeconds * 0.25 : elapsedSeconds;
    ctx.imageSmoothingEnabled = false;

    if (this.usedStaticDetailChunksThisFrame) {
      // Fast chunk-culled dynamic pass: skip any 8x8 chunk with zero water/lava/flowers/runes!
      const minCx = Math.floor(bounds.minTx / TERRAIN_CHUNK_TILES);
      const maxCx = Math.floor(bounds.maxTx / TERRAIN_CHUNK_TILES);
      const minCy = Math.floor(bounds.minTy / TERRAIN_CHUNK_TILES);
      const maxCy = Math.floor(bounds.maxTy / TERRAIN_CHUNK_TILES);

      for (let cy = minCy; cy <= maxCy; cy++) {
        const tyStart = Math.max(bounds.minTy, cy * TERRAIN_CHUNK_TILES);
        const tyEnd = Math.min(bounds.maxTy, (cy + 1) * TERRAIN_CHUNK_TILES - 1);
        for (let cx = minCx; cx <= maxCx; cx++) {
          if (!meta.chunkHasDynamicFloor[cy * meta.chunkCols + cx]) continue;
          const txStart = Math.max(bounds.minTx, cx * TERRAIN_CHUNK_TILES);
          const txEnd = Math.min(bounds.maxTx, (cx + 1) * TERRAIN_CHUNK_TILES - 1);

          for (let ty = tyStart; ty <= tyEnd; ty++) {
            const row = worldMap[ty];
            if (!row) continue;
            const py = ty * tileSize;
            for (let tx = txStart; tx <= txEnd; tx++) {
              const tileId = row[tx] ?? TILE.GRASS;
              const px = tx * tileSize;

              if (tileId === TILE.RUNE_TRAIL) {
                const shimmer = 0.45 + 0.35 * Math.sin(t * 2.6 + tx * 0.7 + ty * 0.5);
                ctx.fillStyle = `rgba(124, 232, 255, ${shimmer.toFixed(2)})`;
                ctx.fillRect(px + 13, py + 13, 6, 6);
                ctx.fillStyle = `rgba(255, 244, 178, ${(shimmer * 0.9).toFixed(2)})`;
                ctx.fillRect(px + 15, py + 15, 2, 2);
              } else if (tileId === TILE.FLOWER) {
                this.drawFlowerPixelDetail(ctx, px, py, tileSize, tx, ty, t);
              } else if (WATER_TILES.has(tileId)) {
                const nTile = ty > 0 ? worldMap[ty - 1]?.[tx] : undefined;
                const sTile = ty + 1 < rows ? worldMap[ty + 1]?.[tx] : undefined;
                const wTile = tx > 0 ? row[tx - 1] : undefined;
                const eTile = tx + 1 < cols ? row[tx + 1] : undefined;
                this.drawWaterShorePixelEdge(ctx, px, py, tileSize, tx, ty, tileId, nTile, sTile, wTile, eTile, t);
              } else if (tileId === TILE.LAVA) {
                const nTile = ty > 0 ? worldMap[ty - 1]?.[tx] : undefined;
                const sTile = ty + 1 < rows ? worldMap[ty + 1]?.[tx] : undefined;
                const wTile = tx > 0 ? row[tx - 1] : undefined;
                const eTile = tx + 1 < cols ? row[tx + 1] : undefined;
                this.drawLavaEdgeDetail(ctx, px, py, tileSize, tx, ty, nTile, sTile, wTile, eTile, t);
              }
            }
          }
        }
      }
      return;
    }

    // Fallback uncached path (Node Vitest / headless)
    for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
      const row = worldMap[ty];
      if (!row) continue;
      for (let tx = bounds.minTx; tx <= bounds.maxTx; tx++) {
        const tileId = row[tx] ?? TILE.GRASS;
        const px = tx * tileSize;
        const py = ty * tileSize;
        const idx = ty * cols + tx;

        const nTile = ty > 0 ? worldMap[ty - 1]?.[tx] : undefined;
        const sTile = ty + 1 < rows ? worldMap[ty + 1]?.[tx] : undefined;
        const wTile = tx > 0 ? row[tx - 1] : undefined;
        const eTile = tx + 1 < cols ? row[tx + 1] : undefined;

        if (WALL_TILES.has(tileId)) {
          this.drawWallAutotileOverlay(ctx, px, py, tileSize, meta.wallMasks[idx], sTile);
        } else if (PATH_TILES.has(tileId)) {
          this.drawPathBorderOverlay(ctx, px, py, tileSize, tx, ty, tileId, meta.pathMasks[idx], t, true, nTile, sTile, wTile, eTile);
        } else if (tileId === TILE.BRIDGE) {
          this.drawBridgePixelOverlay(ctx, px, py, tileSize, ty, nTile, sTile, wTile, eTile);
        } else if (tileId === TILE.FLOWER) {
          this.drawFlowerPixelDetail(ctx, px, py, tileSize, tx, ty, t);
        } else if (WATER_TILES.has(tileId)) {
          this.drawWaterShorePixelEdge(ctx, px, py, tileSize, tx, ty, tileId, nTile, sTile, wTile, eTile, t);
        } else if (tileId === TILE.LAVA) {
          this.drawLavaEdgeDetail(ctx, px, py, tileSize, tx, ty, nTile, sTile, wTile, eTile, t);
        } else if (SAND_TILES.has(tileId)) {
          this.drawSandOrganicTransitions(ctx, px, py, tileSize, tx, ty, nTile, sTile, wTile, eTile);
        }
      }
    }
  }

  private drawWallAutotileOverlay(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    mask: number,
    southTile: number | undefined,
  ): void {
    const hasNW = (mask & 1) !== 0;
    const hasN = (mask & 2) !== 0;
    const hasNE = (mask & 4) !== 0;
    const hasW = (mask & 8) !== 0;
    const hasE = (mask & 16) !== 0;
    const hasSW = (mask & 32) !== 0;
    const hasS = (mask & 64) !== 0;
    const hasSE = (mask & 128) !== 0;

    // Crisp sunlit top-left bevel along exposed north/west edges
    ctx.fillStyle = 'rgba(238, 248, 255, 0.24)';
    if (!hasN) ctx.fillRect(px, py, tileSize, 2);
    if (!hasW) ctx.fillRect(px, py, 2, tileSize);

    // Cool shaded bevel along exposed east edge
    if (!hasE) {
      ctx.fillStyle = 'rgba(8, 12, 30, 0.36)';
      ctx.fillRect(px + tileSize - 3, py, 3, tileSize);
    }

    // Stepped cliff face undercut + soft multi-tier cast shadow onto south walkable ground
    if (!hasS) {
      ctx.fillStyle = 'rgba(10, 12, 28, 0.44)';
      ctx.fillRect(px, py + tileSize - 5, tileSize, 5);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(px, py + tileSize - 7, tileSize, 2);

      if (southTile !== undefined && !WALL_TILES.has(southTile)) {
        ctx.fillStyle = 'rgba(8, 10, 26, 0.40)';
        ctx.fillRect(px, py + tileSize, tileSize, 3);
        ctx.fillStyle = 'rgba(8, 10, 26, 0.24)';
        ctx.fillRect(px, py + tileSize + 3, tileSize, 3);
        ctx.fillStyle = 'rgba(8, 10, 26, 0.11)';
        ctx.fillRect(px, py + tileSize + 6, tileSize, 3);
      }
    }

    // Inner corner bevel notches
    ctx.fillStyle = 'rgba(8, 10, 24, 0.38)';
    if (hasN && hasW && !hasNW) ctx.fillRect(px, py, 4, 4);
    if (hasN && hasE && !hasNE) ctx.fillRect(px + tileSize - 4, py, 4, 4);
    if (hasS && hasW && !hasSW) ctx.fillRect(px, py + tileSize - 4, 4, 4);
    if (hasS && hasE && !hasSE) ctx.fillRect(px + tileSize - 4, py + tileSize - 4, 4, 4);
  }

  /**
   * Draws organic scalloped grass/sand overhangs and broken stone curbs where roads meet
   * meadows or beaches — completely eliminating harsh 90-degree rectangular road borders!
   */
  private drawPathBorderOverlay(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    tx: number,
    ty: number,
    tileId: number,
    mask: number,
    t: number,
    includeAnimatedRune = true,
    nTile?: number,
    sTile?: number,
    wTile?: number,
    eTile?: number,
  ): void {
    const hasN = (mask & 2) !== 0;
    const hasW = (mask & 8) !== 0;
    const hasE = (mask & 16) !== 0;
    const hasS = (mask & 64) !== 0;

    // Organic curb shadow + scalloped grass/sand turf tufts creeping onto stone path edges
    const drawEdgeTurf = (side: 'n' | 's' | 'w' | 'e', neighbor: number | undefined) => {
      const isGrass = neighbor !== undefined && LUSH_TURF_TILES.has(neighbor);
      const isSand = neighbor !== undefined && SAND_TILES.has(neighbor);
      const isSnow = neighbor === TILE.SNOW_GRASS;
      const isFae = neighbor === TILE.FAE_GRASS;

      const body = isGrass
        ? '#459e54'
        : isSand
          ? '#e8cb8e'
          : isSnow
            ? '#c4ebfa'
            : isFae
              ? '#9a68b8'
              : null;
      const tip = isGrass
        ? '#86db76'
        : isSand
          ? '#fff0c4'
          : isSnow
            ? '#f0fcff'
            : isFae
              ? '#e5b8f7'
              : null;
      const shade = isGrass
        ? 'rgba(20, 56, 36, 0.36)'
        : 'rgba(18, 22, 42, 0.24)';

      if (side === 'n') {
        ctx.fillStyle = shade;
        ctx.fillRect(px, py, tileSize, 2);
        if (body && tip) {
          for (let i = 0; i < tileSize; i += 4) {
            const reach = 1 + Math.floor(hash2D(tx * 7 + i, ty, 91) * 3.5);
            ctx.fillStyle = shade;
            ctx.fillRect(px + i, py + reach, 4, 1);
            ctx.fillStyle = body;
            ctx.fillRect(px + i, py, 4, reach);
            if (reach >= 3) {
              ctx.fillStyle = tip;
              ctx.fillRect(px + i + 1, py + 1, 2, 1);
            }
          }
        }
      } else if (side === 's') {
        ctx.fillStyle = shade;
        ctx.fillRect(px, py + tileSize - 2, tileSize, 2);
        if (body && tip) {
          for (let i = 0; i < tileSize; i += 4) {
            const reach = 1 + Math.floor(hash2D(tx * 7 + i, ty, 92) * 3.2);
            ctx.fillStyle = body;
            ctx.fillRect(px + i, py + tileSize - reach, 4, reach);
            ctx.fillStyle = tip;
            ctx.fillRect(px + i + 1, py + tileSize - reach, 2, 1);
          }
        }
      } else if (side === 'w') {
        ctx.fillStyle = shade;
        ctx.fillRect(px, py, 2, tileSize);
        if (body && tip) {
          for (let i = 0; i < tileSize; i += 4) {
            const reach = 1 + Math.floor(hash2D(tx, ty * 7 + i, 93) * 3.5);
            ctx.fillStyle = shade;
            ctx.fillRect(px + reach, py + i, 1, 4);
            ctx.fillStyle = body;
            ctx.fillRect(px, py + i, reach, 4);
            if (reach >= 3) {
              ctx.fillStyle = tip;
              ctx.fillRect(px + 1, py + i + 1, 1, 2);
            }
          }
        }
      } else {
        ctx.fillStyle = shade;
        ctx.fillRect(px + tileSize - 2, py, 2, tileSize);
        if (body && tip) {
          for (let i = 0; i < tileSize; i += 4) {
            const reach = 1 + Math.floor(hash2D(tx, ty * 7 + i, 94) * 3.2);
            ctx.fillStyle = body;
            ctx.fillRect(px + tileSize - reach, py + i, reach, 4);
            ctx.fillStyle = tip;
            ctx.fillRect(px + tileSize - reach, py + i + 1, 1, 2);
          }
        }
      }
    };

    if (!hasN) drawEdgeTurf('n', nTile);
    if (!hasS) drawEdgeTurf('s', sTile);
    if (!hasW) drawEdgeTurf('w', wTile);
    if (!hasE) drawEdgeTurf('e', eTile);

    // Rounded organic outer corners where two exposed path sides meet lush turf or sand
    const roundPathCorner = (cx: number, cy: number, neighborA: number | undefined, neighborB: number | undefined) => {
      const isLush =
        (neighborA !== undefined && LUSH_TURF_TILES.has(neighborA)) ||
        (neighborB !== undefined && LUSH_TURF_TILES.has(neighborB));
      const isSand =
        !isLush &&
        ((neighborA !== undefined && SAND_TILES.has(neighborA)) ||
          (neighborB !== undefined && SAND_TILES.has(neighborB)));
      if (!isLush && !isSand) return;
      ctx.fillStyle = isLush ? '#459e54' : '#e8cb8e';
      ctx.fillRect(cx, cy, 4, 4);
      ctx.fillStyle = isLush ? '#86db76' : '#fff0c4';
      ctx.fillRect(cx + 1, cy + 1, 2, 1);
    };
    if (!hasN && !hasW) roundPathCorner(px, py, nTile, wTile);
    if (!hasN && !hasE) roundPathCorner(px + tileSize - 4, py, nTile, eTile);
    if (!hasS && !hasW) roundPathCorner(px, py + tileSize - 4, sTile, wTile);
    if (!hasS && !hasE) roundPathCorner(px + tileSize - 4, py + tileSize - 4, sTile, eTile);

    // Subtle sunlit lip on north stone curb
    if (!hasN) {
      ctx.fillStyle = 'rgba(255, 248, 224, 0.14)';
      ctx.fillRect(px + 3, py + 3, tileSize - 6, 1);
    }

    if (includeAnimatedRune && tileId === TILE.RUNE_TRAIL) {
      const shimmer = 0.45 + 0.35 * Math.sin(t * 2.6 + tx * 0.7 + ty * 0.5);
      ctx.fillStyle = `rgba(124, 232, 255, ${shimmer.toFixed(2)})`;
      ctx.fillRect(px + 13, py + 13, 6, 6);
      ctx.fillStyle = `rgba(255, 244, 178, ${(shimmer * 0.9).toFixed(2)})`;
      ctx.fillRect(px + 15, py + 15, 2, 2);
    }
  }

  private drawSandOrganicTransitions(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    tx: number,
    ty: number,
    nTile: number | undefined,
    sTile: number | undefined,
    wTile: number | undefined,
    eTile: number | undefined,
    nwTile?: number,
    neTile?: number,
    swTile?: number,
    seTile?: number,
  ): void {
    const isLush = (id: number | undefined): boolean => id !== undefined && LUSH_TURF_TILES.has(id);

    // 1. Soft damp shoreline wet-sand bands on all edges bordering water
    const drawWetBand = (side: 'n' | 's' | 'w' | 'e') => {
      ctx.fillStyle = 'rgba(26, 62, 102, 0.26)';
      if (side === 'n') ctx.fillRect(px, py, tileSize, 3);
      else if (side === 's') ctx.fillRect(px, py + tileSize - 3, tileSize, 3);
      else if (side === 'w') ctx.fillRect(px, py, 3, tileSize);
      else ctx.fillRect(px + tileSize - 3, py, 3, tileSize);

      ctx.fillStyle = 'rgba(32, 74, 114, 0.13)';
      if (side === 'n') ctx.fillRect(px, py + 3, tileSize, 2);
      else if (side === 's') ctx.fillRect(px, py + tileSize - 5, tileSize, 2);
      else if (side === 'w') ctx.fillRect(px + 3, py, 2, tileSize);
      else ctx.fillRect(px + tileSize - 5, py, 2, tileSize);
    };

    if (nTile !== undefined && WATER_TILES.has(nTile)) drawWetBand('n');
    if (sTile !== undefined && WATER_TILES.has(sTile)) drawWetBand('s');
    if (wTile !== undefined && WATER_TILES.has(wTile)) drawWetBand('w');
    if (eTile !== undefined && WATER_TILES.has(eTile)) drawWetBand('e');

    // 2. Scalloped pixel-art meadow overhang fringes onto sand + rounded diagonal corners!
    const turfShade = 'rgba(24, 68, 40, 0.42)';
    const turfBody = '#479e57';
    const turfTip = '#80d470';

    if (isLush(nTile)) {
      for (let i = 0; i < tileSize; i += 4) {
        const drop = 2 + Math.floor(hash2D(tx * 11 + i, ty, 61) * 4.5);
        ctx.fillStyle = turfShade;
        ctx.fillRect(px + i, py + drop, 4, 2);
        ctx.fillStyle = turfBody;
        ctx.fillRect(px + i, py, 4, drop);
        if (drop >= 4) {
          ctx.fillStyle = turfTip;
          ctx.fillRect(px + i + 1, py + 1, 2, 1);
        }
      }
    }
    if (isLush(sTile)) {
      for (let i = 0; i < tileSize; i += 4) {
        const rise = 2 + Math.floor(hash2D(tx * 11 + i, ty, 62) * 3.5);
        ctx.fillStyle = turfBody;
        ctx.fillRect(px + i, py + tileSize - rise, 4, rise);
        ctx.fillStyle = turfTip;
        ctx.fillRect(px + i + 1, py + tileSize - rise, 2, 1);
      }
    }
    if (isLush(wTile)) {
      for (let i = 0; i < tileSize; i += 4) {
        const reach = 2 + Math.floor(hash2D(tx, ty * 11 + i, 63) * 4.5);
        ctx.fillStyle = turfShade;
        ctx.fillRect(px + reach, py + i, 2, 4);
        ctx.fillStyle = turfBody;
        ctx.fillRect(px, py + i, reach, 4);
        if (reach >= 4) {
          ctx.fillStyle = turfTip;
          ctx.fillRect(px + 1, py + i + 1, 1, 2);
        }
      }
    }
    if (isLush(eTile)) {
      for (let i = 0; i < tileSize; i += 4) {
        const reach = 2 + Math.floor(hash2D(tx, ty * 11 + i, 64) * 4.0);
        ctx.fillStyle = turfBody;
        ctx.fillRect(px + tileSize - reach, py + i, reach, 4);
        ctx.fillStyle = turfTip;
        ctx.fillRect(px + tileSize - reach, py + i + 1, 1, 2);
      }
    }

    // Smooth curved grass tufts at diagonal corners touching meadows
    const drawCornerTurf = (cx: number, cy: number, dx: number, dy: number) => {
      ctx.fillStyle = turfShade;
      ctx.fillRect(cx + dx, cy + dy + 1, 5, 4);
      ctx.fillStyle = turfBody;
      ctx.fillRect(cx, cy, 5, 4);
      ctx.fillRect(cx, cy, 4, 5);
      ctx.fillStyle = turfTip;
      ctx.fillRect(cx + 1, cy + 1, 2, 2);
    };
    if (isLush(nwTile) && !isLush(nTile) && !isLush(wTile)) drawCornerTurf(px, py, 1, 1);
    if (isLush(neTile) && !isLush(nTile) && !isLush(eTile)) drawCornerTurf(px + tileSize - 5, py, -1, 1);
    if (isLush(swTile) && !isLush(sTile) && !isLush(wTile)) drawCornerTurf(px, py + tileSize - 5, 1, -1);
    if (isLush(seTile) && !isLush(sTile) && !isLush(eTile)) drawCornerTurf(px + tileSize - 5, py + tileSize - 5, -1, -1);
  }

  /**
   * Draws organic scalloped sandy/grassy shoreline banks & rounded inner/outer coves
   * overhanging water edges so ponds & beaches look like lush 16-bit HD-2D coastlines
   * rather than rigid square rectangles!
   */
  private drawOrganicWaterShoreBank(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    tx: number,
    ty: number,
    tileId: number,
    nTile: number | undefined,
    sTile: number | undefined,
    wTile: number | undefined,
    eTile: number | undefined,
    nwTile: number | undefined,
    neTile: number | undefined,
    swTile: number | undefined,
    seTile: number | undefined,
  ): boolean {
    const isLand = (id: number | undefined): boolean =>
      id !== undefined && !LIQUID_TILES.has(id) && id !== TILE.BRIDGE;

    const landN = isLand(nTile);
    const landS = isLand(sTile);
    const landW = isLand(wTile);
    const landE = isLand(eTile);
    const landNW = isLand(nwTile);
    const landNE = isLand(neTile);
    const landSW = isLand(swTile);
    const landSE = isLand(seTile);

    const hasDeepEdge =
      (tileId === TILE.SHALLOW_WATER || tileId === TILE.REEF_WATER) &&
      (nTile === TILE.WATER || sTile === TILE.WATER || wTile === TILE.WATER || eTile === TILE.WATER);

    if (!landN && !landS && !landW && !landE && !landNW && !landNE && !landSW && !landSE && !hasDeepEdge) {
      return false;
    }

    // 1. Multi-tier pixel-dithered depth transition where shallow water meets deep ocean water
    if (hasDeepEdge) {
      if (nTile === TILE.WATER) {
        for (let i = 0; i < tileSize; i += 2) {
          const wave = 3 + Math.floor(Math.sin((tx * 16 + i) * 0.26) * 1.4 + hash2D(tx * 11 + i, ty, 241) * 2.2);
          ctx.fillStyle = 'rgba(10, 38, 96, 0.44)';
          ctx.fillRect(px + i, py, 2, Math.max(2, wave - 2));
          ctx.fillStyle = 'rgba(18, 62, 132, 0.26)';
          ctx.fillRect(px + i, py + Math.max(2, wave - 2), 2, 3);
          if (((i >> 1) & 1) === 0) {
            ctx.fillStyle = 'rgba(130, 232, 248, 0.22)';
            ctx.fillRect(px + i, py + wave + 2, 2, 1);
          }
        }
      }
      if (sTile === TILE.WATER) {
        for (let i = 0; i < tileSize; i += 2) {
          const wave = 3 + Math.floor(Math.sin((tx * 16 + i) * 0.26 + 1.1) * 1.4 + hash2D(tx * 11 + i, ty, 242) * 2.2);
          ctx.fillStyle = 'rgba(10, 38, 96, 0.44)';
          ctx.fillRect(px + i, py + tileSize - Math.max(2, wave - 2), 2, Math.max(2, wave - 2));
          ctx.fillStyle = 'rgba(18, 62, 132, 0.26)';
          ctx.fillRect(px + i, py + tileSize - Math.max(2, wave - 2) - 3, 2, 3);
          if (((i >> 1) & 1) === 1) {
            ctx.fillStyle = 'rgba(130, 232, 248, 0.22)';
            ctx.fillRect(px + i, py + tileSize - wave - 3, 2, 1);
          }
        }
      }
      if (wTile === TILE.WATER) {
        for (let i = 0; i < tileSize; i += 2) {
          const wave = 3 + Math.floor(Math.sin((ty * 16 + i) * 0.26 + 0.5) * 1.4 + hash2D(tx, ty * 11 + i, 243) * 2.2);
          ctx.fillStyle = 'rgba(10, 38, 96, 0.44)';
          ctx.fillRect(px, py + i, Math.max(2, wave - 2), 2);
          ctx.fillStyle = 'rgba(18, 62, 132, 0.26)';
          ctx.fillRect(px + Math.max(2, wave - 2), py + i, 3, 2);
        }
      }
      if (eTile === TILE.WATER) {
        for (let i = 0; i < tileSize; i += 2) {
          const wave = 3 + Math.floor(Math.sin((ty * 16 + i) * 0.26 + 2.0) * 1.4 + hash2D(tx, ty * 11 + i, 244) * 2.2);
          ctx.fillStyle = 'rgba(10, 38, 96, 0.44)';
          ctx.fillRect(px + tileSize - Math.max(2, wave - 2), py + i, Math.max(2, wave - 2), 2);
          ctx.fillStyle = 'rgba(18, 62, 132, 0.26)';
          ctx.fillRect(px + tileSize - Math.max(2, wave - 2) - 3, py + i, 3, 2);
        }
      }
    }

    // 2. Soft shallow turquoise shelf hugging land banks
    const shelfTint = 'rgba(92, 224, 242, 0.24)';
    ctx.fillStyle = shelfTint;
    if (landN) ctx.fillRect(px, py + 3, tileSize, 5);
    if (landS) ctx.fillRect(px, py + tileSize - 8, tileSize, 5);
    if (landW) ctx.fillRect(px + 3, py, 5, tileSize);
    if (landE) ctx.fillRect(px + tileSize - 8, py, 5, tileSize);

    // 3. Scalloped overhanging shoreline bank lip along cardinal land edges
    if (landN) {
      const pal = getShoreBankPalette(nTile);
      for (let i = 0; i < tileSize; i += 2) {
        const drop = 3 + Math.floor(Math.sin((tx * 16 + i) * 0.22) * 1.4 + hash2D(tx * 13 + i, ty, 201) * 2.2);
        ctx.fillStyle = pal.wet;
        ctx.fillRect(px + i, py + drop + 1, 2, 3);
        ctx.fillStyle = pal.rim;
        ctx.fillRect(px + i, py + drop - 1, 2, 2);
        ctx.fillStyle = pal.body;
        ctx.fillRect(px + i, py, 2, Math.max(1, drop - 1));
        if (drop >= 4) {
          ctx.fillStyle = pal.hi;
          ctx.fillRect(px + i, py, 2, 1);
        }
      }
    }
    if (landS) {
      const pal = getShoreBankPalette(sTile);
      for (let i = 0; i < tileSize; i += 2) {
        const rise = 2 + Math.floor(Math.sin((tx * 16 + i) * 0.24 + 1.2) * 1.2 + hash2D(tx * 13 + i, ty, 202) * 2.0);
        ctx.fillStyle = pal.wet;
        ctx.fillRect(px + i, py + tileSize - rise - 2, 2, 2);
        ctx.fillStyle = pal.rim;
        ctx.fillRect(px + i, py + tileSize - rise, 2, 1);
        ctx.fillStyle = pal.body;
        ctx.fillRect(px + i, py + tileSize - rise + 1, 2, Math.max(1, rise - 1));
      }
    }
    if (landW) {
      const pal = getShoreBankPalette(wTile);
      for (let i = 0; i < tileSize; i += 2) {
        const reach = 2 + Math.floor(Math.sin((ty * 16 + i) * 0.22 + 0.5) * 1.3 + hash2D(tx, ty * 13 + i, 203) * 2.1);
        ctx.fillStyle = pal.wet;
        ctx.fillRect(px + reach + 1, py + i, 2, 2);
        ctx.fillStyle = pal.rim;
        ctx.fillRect(px + reach - 1, py + i, 2, 2);
        ctx.fillStyle = pal.body;
        ctx.fillRect(px, py + i, Math.max(1, reach - 1), 2);
      }
    }
    if (landE) {
      const pal = getShoreBankPalette(eTile);
      for (let i = 0; i < tileSize; i += 2) {
        const reach = 2 + Math.floor(Math.sin((ty * 16 + i) * 0.22 + 2.1) * 1.3 + hash2D(tx, ty * 13 + i, 204) * 2.1);
        ctx.fillStyle = pal.wet;
        ctx.fillRect(px + tileSize - reach - 2, py + i, 2, 2);
        ctx.fillStyle = pal.rim;
        ctx.fillRect(px + tileSize - reach, py + i, 2, 2);
        ctx.fillStyle = pal.body;
        ctx.fillRect(px + tileSize - reach + 1, py + i, Math.max(1, reach - 1), 2);
      }
    }

    // 4. Curved pixel-stepped concave corner coves (turns every rectangular pond corner into a rounded cove!)
    const drawCurvedCoveCorner = (
      corner: 'nw' | 'ne' | 'sw' | 'se',
      refTile: number | undefined,
    ) => {
      const pal = getShoreBankPalette(refTile);
      const steps = [9, 7, 6, 4, 3, 2]; // smooth quarter-circle pixel arc
      for (let r = 0; r < steps.length; r++) {
        const span = steps[r];
        const yOff = corner === 'nw' || corner === 'ne' ? py + r * 1.5 : py + tileSize - (r + 1) * 1.5;
        const xOff = corner === 'nw' || corner === 'sw' ? px : px + tileSize - span;
        ctx.fillStyle = pal.wet;
        ctx.fillRect(
          corner === 'nw' || corner === 'sw' ? xOff : xOff - 2,
          yOff + (corner === 'nw' || corner === 'ne' ? 1.5 : -1.5),
          span + 2,
          2,
        );
        ctx.fillStyle = pal.rim;
        ctx.fillRect(xOff, yOff, span, 2);
        ctx.fillStyle = pal.body;
        ctx.fillRect(
          corner === 'nw' || corner === 'sw' ? xOff : xOff + 1.5,
          yOff,
          Math.max(1, span - 1.5),
          1.5,
        );
      }
    };

    if (landN && landW) drawCurvedCoveCorner('nw', nTile ?? wTile);
    if (landN && landE) drawCurvedCoveCorner('ne', nTile ?? eTile);
    if (landS && landW) drawCurvedCoveCorner('sw', sTile ?? wTile);
    if (landS && landE) drawCurvedCoveCorner('se', sTile ?? eTile);

    // 5. Subtle rounded convex peninsula tips where diagonal land corners touch water
    const drawDiagonalCornerCap = (cx: number, cy: number, refTile: number | undefined) => {
      const pal = getShoreBankPalette(refTile);
      ctx.fillStyle = pal.wet;
      ctx.fillRect(cx, cy, 5, 5);
      ctx.fillStyle = pal.rim;
      ctx.fillRect(cx + 0.5, cy + 0.5, 4, 4);
      ctx.fillStyle = pal.body;
      ctx.fillRect(cx + 1, cy + 1, 3, 3);
    };
    if (landNW && !landN && !landW) drawDiagonalCornerCap(px - 1, py - 1, nwTile);
    if (landNE && !landN && !landE) drawDiagonalCornerCap(px + tileSize - 4, py - 1, neTile);
    if (landSW && !landS && !landW) drawDiagonalCornerCap(px - 1, py + tileSize - 4, swTile);
    if (landSE && !landS && !landE) drawDiagonalCornerCap(px + tileSize - 4, py + tileSize - 4, seTile);

    return true;
  }

  private drawBridgePixelOverlay(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    ty: number,
    nTile: number | undefined,
    sTile: number | undefined,
    wTile: number | undefined,
    eTile: number | undefined,
  ): void {
    const isLeftRail = wTile !== TILE.BRIDGE;
    const isRightRail = eTile !== TILE.BRIDGE;
    const isEndCap = nTile !== TILE.BRIDGE || sTile !== TILE.BRIDGE;

    if (isLeftRail) {
      ctx.fillStyle = '#3a2212';
      ctx.fillRect(px + 1, py, 5, tileSize);
      ctx.fillStyle = '#a8703f';
      ctx.fillRect(px + 2, py, 3, tileSize);
      ctx.fillStyle = '#d9a468';
      ctx.fillRect(px + 2, py, 1, tileSize);
      if (isEndCap || ty % 2 === 0) {
        ctx.fillStyle = '#2d190d';
        ctx.fillRect(px, py + 2, 6, 7);
        ctx.fillStyle = '#b87d48';
        ctx.fillRect(px + 1, py + 3, 4, 5);
        ctx.fillStyle = '#ffd978';
        ctx.fillRect(px + 2, py + 3, 2, 2);
      }
    }
    if (isRightRail) {
      ctx.fillStyle = '#3a2212';
      ctx.fillRect(px + tileSize - 6, py, 5, tileSize);
      ctx.fillStyle = '#a8703f';
      ctx.fillRect(px + tileSize - 5, py, 3, tileSize);
      ctx.fillStyle = '#d9a468';
      ctx.fillRect(px + tileSize - 4, py, 1, tileSize);
      if (isEndCap || ty % 2 === 0) {
        ctx.fillStyle = '#2d190d';
        ctx.fillRect(px + tileSize - 6, py + 2, 6, 7);
        ctx.fillStyle = '#b87d48';
        ctx.fillRect(px + tileSize - 5, py + 3, 4, 5);
        ctx.fillStyle = '#ffd978';
        ctx.fillRect(px + tileSize - 4, py + 3, 2, 2);
      }
    }
  }

  private drawFlowerPixelDetail(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    tx: number,
    ty: number,
    t: number,
  ): void {
    const colors = ['#ff85c0', '#fde047', '#7dd3fc'];
    for (let i = 0; i < 3; i++) {
      const fx = Math.round(px + 5 + hash2D(tx, ty, 30 + i) * (tileSize - 12));
      const fy = Math.round(py + 5 + hash2D(tx, ty, 50 + i) * (tileSize - 12));
      const sway = Math.round(Math.sin(t * 2.2 + tx + ty + i) * 1.1);
      ctx.fillStyle = '#1f663a';
      ctx.fillRect(fx + sway, fy + 2, 3, 1);
      ctx.fillStyle = colors[(tx + ty + i) % colors.length];
      ctx.fillRect(fx + sway, fy, 3, 3);
      ctx.fillStyle = '#fff9d6';
      ctx.fillRect(fx + sway + 1, fy + 1, 1, 1);
    }
  }

  /**
   * Draws gentle animated pixel-art shoreline ripples & delicate broken seafoam lace
   * tucked organically inside curved shoreline banks (NO rigid white dashed boxes!).
   */
  private drawWaterShorePixelEdge(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    tx: number,
    ty: number,
    _tileId: number,
    nTile: number | undefined,
    sTile: number | undefined,
    wTile: number | undefined,
    eTile: number | undefined,
    t: number,
  ): void {
    const isLand = (id: number | undefined) => id !== undefined && !LIQUID_TILES.has(id) && id !== TILE.BRIDGE;
    const landN = isLand(nTile);
    const landS = isLand(sTile);
    const landW = isLand(wTile);
    const landE = isLand(eTile);

    const waveBob = Math.sin(t * 2.2 + tx * 0.9 + ty * 0.7);
    const shift = Math.round(waveBob * 1.2);
    const insetN = landN ? 5 : 2;
    const insetS = landS ? 5 : 2;
    const insetW = landW ? 5 : 2;
    const insetE = landE ? 5 : 2;

    if (landN) {
      ctx.fillStyle = 'rgba(220, 250, 255, 0.56)';
      const xStart = px + (landW ? 9 : 3);
      const xEnd = px + tileSize - (landE ? 9 : 3);
      for (let x = xStart; x < xEnd; x += 7) {
        const w = hash2D(tx * 5 + x, ty, 81) > 0.45 ? 4 : 2;
        const dy = Math.round(Math.sin(t * 2.4 + x * 0.18 + ty) * 0.9);
        ctx.fillRect(x, py + insetN + Math.max(0, shift) + dy, Math.min(w, xEnd - x), 1);
      }
    }
    if (landS) {
      ctx.fillStyle = 'rgba(216, 248, 255, 0.46)';
      const xStart = px + (landW ? 9 : 3);
      const xEnd = px + tileSize - (landE ? 9 : 3);
      for (let x = xStart; x < xEnd; x += 8) {
        const w = hash2D(tx * 5 + x, ty, 83) > 0.45 ? 4 : 2;
        ctx.fillRect(x, py + tileSize - insetS - Math.max(0, shift), Math.min(w, xEnd - x), 1);
      }
    }
    if (landW) {
      ctx.fillStyle = 'rgba(216, 248, 255, 0.48)';
      const yStart = py + (landN ? 9 : 3);
      const yEnd = py + tileSize - (landS ? 9 : 3);
      for (let y = yStart; y < yEnd; y += 8) {
        const h = hash2D(tx, ty * 5 + y, 82) > 0.45 ? 4 : 2;
        ctx.fillRect(px + insetW + Math.max(0, shift), y, 1, Math.min(h, yEnd - y));
      }
    }
    if (landE) {
      ctx.fillStyle = 'rgba(216, 248, 255, 0.44)';
      const yStart = py + (landN ? 9 : 3);
      const yEnd = py + tileSize - (landS ? 9 : 3);
      for (let y = yStart; y < yEnd; y += 8) {
        const h = hash2D(tx, ty * 5 + y, 84) > 0.45 ? 4 : 2;
        ctx.fillRect(px + tileSize - insetE - Math.max(0, shift), y, 1, Math.min(h, yEnd - y));
      }
    }

    // Subtle interior pixel wavelet glint on select open water tiles
    if (hash2D(tx, ty, 241) > 0.56) {
      const gx = px + 8 + Math.round(hash2D(tx, ty, 243) * 14 + Math.sin(t * 1.6 + tx) * 1.5);
      const gy = py + 9 + Math.round(hash2D(tx, ty, 247) * 14);
      const twinkle = 0.25 + 0.35 * Math.max(0, Math.sin(t * 2.8 + tx * 1.3 + ty * 0.9));
      ctx.fillStyle = `rgba(224, 252, 255, ${twinkle.toFixed(2)})`;
      ctx.fillRect(gx, gy, 4, 1);
      if (twinkle > 0.48) {
        ctx.fillRect(gx + 1, gy - 1, 2, 1);
      }
    }
  }

  private drawLavaEdgeDetail(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    tx: number,
    ty: number,
    nTile: number | undefined,
    sTile: number | undefined,
    wTile: number | undefined,
    eTile: number | undefined,
    t: number,
  ): void {
    const isCrust = (id: number | undefined) => id !== undefined && id !== TILE.LAVA && id !== TILE.BRIDGE;
    const pulse = 0.55 + 0.35 * Math.sin(t * 3.4 + tx * 0.9 + ty * 0.7);
    ctx.fillStyle = `rgba(255, 168, 56, ${pulse.toFixed(2)})`;
    if (isCrust(nTile)) ctx.fillRect(px, py, tileSize, 3);
    if (isCrust(sTile)) ctx.fillRect(px, py + tileSize - 3, tileSize, 3);
    if (isCrust(wTile)) ctx.fillRect(px, py, 3, tileSize);
    if (isCrust(eTile)) ctx.fillRect(px + tileSize - 3, py, 3, tileSize);

    if (hash2D(tx, ty, 77) > 0.45) {
      ctx.fillStyle = `rgba(255, 224, 102, ${(pulse * 0.85).toFixed(2)})`;
      ctx.fillRect(px + 10 + Math.round(Math.sin(t * 2 + tx) * 2), py + 12, 6, 3);
    }
  }

  /**
   * Collects Y-sorted prop & building SpriteDrawCmds from sheet 'props' using precomputed
   * spatial chunk lists (zero per-frame full-grid scans, zero getBiomeAt or string allocs!).
   */
  collectPropSprites(
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    outSprites: SpriteDrawCmd[],
    landmarkTileKeys: ReadonlySet<string> | ReadonlySet<number>,
  ): void {
    const { cols, rows, tileSize, worldMap, elapsedSeconds, reducedMotion } = state;
    const t = reducedMotion ? 0 : elapsedSeconds;
    const meta = getOrBuildStaticMapMeta(worldMap, cols, rows, state.currentBiomeId);
    const propRegions = this.manifest?.sheets?.props?.regions;

    // 1. Starlight Village hero cottages
    for (let i = 0; i < meta.buildingCache.clusters.length; i++) {
      const cluster = meta.buildingCache.clusters[i];
      if (
        cluster.tx + cluster.widthTiles < bounds.minTx - 1 ||
        cluster.tx > bounds.maxTx + 1 ||
        cluster.ty + cluster.heightTiles < bounds.minTy - 1 ||
        cluster.ty > bounds.maxTy + 2
      ) {
        continue;
      }
      const spanW = cluster.widthTiles * tileSize;
      const dw = Math.min(spanW, Math.round(tileSize * 3.375));
      const dh = Math.round(dw * 0.96);
      const dx = Math.round(cluster.tx * tileSize + (spanW - dw) * 0.5);
      const dy = Math.round((cluster.ty + cluster.heightTiles) * tileSize - dh + 4);
      const region = propRegions?.[cluster.id];
      outSprites.push({
        sheetId: 'props',
        regionId: cluster.id,
        ...(region ? { sx: region.x, sy: region.y, sw: region.w, sh: region.h } : {}),
        dx,
        dy,
        dw,
        dh,
        pixelCrisp: true,
        useNormalMap: true,
        depth: (cluster.ty + cluster.heightTiles - 0.05) * tileSize,
      });
    }

    // 2. Visible tile props from pre-indexed spatial chunks (with organic tree mirror/scale/tint variety!)
    const minCx = Math.floor(bounds.minTx / TERRAIN_CHUNK_TILES);
    const maxCx = Math.floor(bounds.maxTx / TERRAIN_CHUNK_TILES);
    const minCy = Math.floor(bounds.minTy / TERRAIN_CHUNK_TILES);
    const maxCy = Math.floor(bounds.maxTy / TERRAIN_CHUNK_TILES);

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const list = meta.chunkProps[cy * meta.chunkCols + cx];
        if (!list || list.length === 0) continue;

        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          if (
            p.tx < bounds.minTx ||
            p.tx > bounds.maxTx ||
            p.ty < bounds.minTy ||
            p.ty > bounds.maxTy
          ) {
            continue;
          }

          if (p.kind === 'tree') {
            if (isLandmarkAt(landmarkTileKeys, p.tx, p.ty, p.tileIdx)) continue;
            const swayDx = reducedMotion ? 0 : Math.round(Math.sin(t * 1.85 + p.swayPhase) * 1.1);
            const dw = Math.round(tileSize * 1.625 * p.scale);
            const dh = dw;
            const dx = Math.round((p.tx + 0.5) * tileSize - dw * 0.5) + swayDx;
            const dy = Math.round((p.ty + 0.94) * tileSize - dh + p.yJitter);
            const region = propRegions?.[p.regionId];
            outSprites.push({
              sheetId: 'props',
              regionId: p.regionId,
              ...(region ? { sx: region.x, sy: region.y, sw: region.w, sh: region.h } : {}),
              dx,
              dy,
              dw,
              dh,
              flipX: p.flipX,
              tint: p.tint,
              pixelCrisp: true,
              useNormalMap: true,
              emissive: p.regionId === 'prop_crystal' || p.regionId === 'prop_mushroom' ? 0.25 : 0,
              depth: (p.ty + 0.92) * tileSize + p.yJitter * 0.25,
            });
          } else if (p.kind === 'heal') {
            const dw = Math.round(tileSize * 1.44);
            const dh = dw;
            const dx = Math.round((p.tx + 0.5) * tileSize - dw * 0.5);
            const dy = Math.round((p.ty + 0.94) * tileSize - dh);
            const region = propRegions?.fountain;
            outSprites.push({
              sheetId: 'props',
              regionId: 'fountain',
              ...(region ? { sx: region.x, sy: region.y, sw: region.w, sh: region.h } : {}),
              dx,
              dy,
              dw,
              dh,
              pixelCrisp: true,
              useNormalMap: true,
              emissive: 0.28,
              depth: (p.ty + 0.88) * tileSize,
            });
          } else if (p.kind === 'lantern') {
            const dw = Math.round(tileSize * 1.12);
            const dh = Math.round(tileSize * 1.5);
            const dx = Math.round((p.tx + 0.5) * tileSize - dw * 0.5);
            const dy = Math.round((p.ty + 0.94) * tileSize - dh);
            const region = propRegions?.lantern;
            outSprites.push({
              sheetId: 'props',
              regionId: 'lantern',
              ...(region ? { sx: region.x, sy: region.y, sw: region.w, sh: region.h } : {}),
              dx,
              dy,
              dw,
              dh,
              pixelCrisp: true,
              useNormalMap: true,
              emissive: 0.45,
              depth: (p.ty + 0.9) * tileSize,
            });
          } else if (p.kind === 'sign') {
            const dw = Math.round(tileSize * 1.18);
            const dh = dw;
            const dx = Math.round((p.tx + 0.5) * tileSize - dw * 0.5);
            const dy = Math.round((p.ty + 0.92) * tileSize - dh);
            const region = propRegions?.signpost;
            outSprites.push({
              sheetId: 'props',
              regionId: 'signpost',
              ...(region ? { sx: region.x, sy: region.y, sw: region.w, sh: region.h } : {}),
              dx,
              dy,
              dw,
              dh,
              pixelCrisp: true,
              useNormalMap: true,
              depth: (p.ty + 0.86) * tileSize,
            });
          }
        }
      }
    }
  }

  /**
   * Renders grounded contact shadows beneath tile props & buildings (skipped when already baked
   * into static chunks!), chimney smoke, Secret Arcade star wall glimmer at (11, 12), and crisp
   * procedural prop fallbacks when the 'props' atlas is not attached.
   */
  renderPropShadowsAndEffects(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    landmarkTileKeys: ReadonlySet<string> | ReadonlySet<number>,
    phase: 'ground' | 'post',
  ): void {
    const { cols, rows, tileSize, worldMap, elapsedSeconds, reducedMotion, secretArcadeSpot } = state;
    const t = reducedMotion ? 0 : elapsedSeconds;
    const meta = getOrBuildStaticMapMeta(worldMap, cols, rows, state.currentBiomeId);
    const hasPropsAtlas = this.hasSheet('props');
    ctx.imageSmoothingEnabled = false;

    if (phase === 'ground') {
      // Static prop shadows are already baked into 2x static chunks when atlas + chunks are active!
      if (this.usedStaticDetailChunksThisFrame && hasPropsAtlas) {
        return;
      }

      for (const cluster of meta.buildingCache.clusters) {
        if (
          cluster.tx + cluster.widthTiles < bounds.minTx - 1 ||
          cluster.tx > bounds.maxTx + 1 ||
          cluster.ty + cluster.heightTiles < bounds.minTy - 1 ||
          cluster.ty > bounds.maxTy + 2
        ) {
          continue;
        }
        const cx = (cluster.tx + cluster.widthTiles * 0.5) * tileSize;
        const baseY = (cluster.ty + cluster.heightTiles) * tileSize - 2;
        drawContactShadow(ctx, cx, baseY, cluster.widthTiles * tileSize * 0.52, 7.5, 0.34);

        if (!hasPropsAtlas) {
          this.drawFallbackCottage(ctx, cluster, tileSize);
        }
      }

      const minCx = Math.floor(bounds.minTx / TERRAIN_CHUNK_TILES);
      const maxCx = Math.floor(bounds.maxTx / TERRAIN_CHUNK_TILES);
      const minCy = Math.floor(bounds.minTy / TERRAIN_CHUNK_TILES);
      const maxCy = Math.floor(bounds.maxTy / TERRAIN_CHUNK_TILES);

      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          const list = meta.chunkProps[cy * meta.chunkCols + cx];
          if (!list) continue;
          for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (p.tx < bounds.minTx || p.tx > bounds.maxTx || p.ty < bounds.minTy || p.ty > bounds.maxTy) continue;
            const px = (p.tx + 0.5) * tileSize;
            const baseY = (p.ty + 0.9) * tileSize;

            if (p.kind === 'tree' && !isLandmarkAt(landmarkTileKeys, p.tx, p.ty, p.tileIdx)) {
              drawContactShadow(ctx, px, baseY + p.yJitter, tileSize * 0.44 * p.scale, 4.8, 0.30);
              if (!hasPropsAtlas) {
                this.drawFallbackTree(ctx, px, baseY, tileSize, p.regionId);
              }
            } else if (p.kind === 'heal') {
              drawContactShadow(ctx, px, baseY, tileSize * 0.46, 5.2, 0.32);
              if (!hasPropsAtlas) {
                this.drawFallbackFountain(ctx, px, baseY, tileSize, t);
              }
            } else if (p.kind === 'lantern') {
              drawContactShadow(ctx, px, baseY, tileSize * 0.25, 3.2, 0.28);
              if (!hasPropsAtlas) {
                this.drawFallbackLantern(ctx, px, baseY, tileSize, t);
              }
            } else if (p.kind === 'sign') {
              drawContactShadow(ctx, px, baseY, tileSize * 0.28, 3.2, 0.28);
              if (!hasPropsAtlas) {
                this.drawFallbackSignpost(ctx, px, baseY, tileSize);
              }
            }
          }
        }
      }
      return;
    }

    // Post-sprite effects: cottage chimney smoke & Secret Arcade star glimmer
    for (let c = 0; c < meta.buildingCache.clusters.length; c++) {
      const cluster = meta.buildingCache.clusters[c];
      if (
        cluster.tx + cluster.widthTiles < bounds.minTx - 1 ||
        cluster.tx > bounds.maxTx + 1 ||
        cluster.ty + cluster.heightTiles < bounds.minTy - 2 ||
        cluster.ty > bounds.maxTy + 2
      ) {
        continue;
      }
      const chimX = (cluster.tx + cluster.widthTiles * 0.72) * tileSize;
      const chimY = (cluster.ty - 0.55) * tileSize;
      const puffCount = reducedMotion ? 1 : 3;
      for (let i = 0; i < puffCount; i++) {
        const cycle = (elapsedSeconds * 0.45 + i * 0.33) % 1;
        const sx = Math.round(chimX + Math.sin(cycle * Math.PI * 2 + i) * 4);
        const sy = Math.round(chimY - cycle * 18);
        const size = 4 + Math.round(cycle * 3);
        ctx.fillStyle = `rgba(225, 234, 250, ${((1 - cycle) * 0.32).toFixed(2)})`;
        ctx.fillRect(sx - (size >> 1), sy - (size >> 1), size, Math.max(3, size - 1));
      }
    }

    // Secret Starlight Sky-Hop Arcade Cabinet on Willow's Lab wall (11, 12) — full V1 visual parity!
    if (
      secretArcadeSpot.x >= bounds.minTx - 1 &&
      secretArcadeSpot.x <= bounds.maxTx + 1 &&
      secretArcadeSpot.y >= bounds.minTy - 1 &&
      secretArcadeSpot.y <= bounds.maxTy + 1
    ) {
      const ax = Math.round(secretArcadeSpot.x * tileSize);
      const ay = Math.round(secretArcadeSpot.y * tileSize);
      const pulse = 0.58 + 0.42 * Math.sin(elapsedSeconds * 3.4);

      if (!secretArcadeSpot.unlocked) {
        // 2 pre-unlock V1 states: faint unattuned etched star mark vs attuned humming cyan/gold star + rising spark!
        const attuned = secretArcadeSpot.knocks > 0;
        const sx = ax + 21;
        const sy = ay + 14;
        if (attuned) {
          fillEllipse(ctx, sx, sy, 8, 8, `rgba(56, 189, 248, ${(0.20 + pulse * 0.18).toFixed(2)})`);
          const sparkY = Math.round(sy - 8 - Math.abs(Math.sin(elapsedSeconds * 3.8)) * 3);
          ctx.fillStyle = `rgba(253, 224, 71, ${(0.55 + pulse * 0.42).toFixed(2)})`;
          ctx.fillRect(sx - 1, sparkY, 3, 1);
          ctx.fillRect(sx, sparkY - 1, 1, 3);
        }
        ctx.fillStyle = attuned
          ? `rgba(124, 240, 255, ${(0.90 * pulse).toFixed(2)})`
          : `rgba(255, 224, 112, ${(0.64 * pulse).toFixed(2)})`;
        drawFourPointStar(ctx, sx, sy, attuned ? 5.2 + pulse * 1.2 : 3.8 + pulse * 0.8, 1.5, t * 0.6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
      } else {
        // Unlocked Starlight Sky-Hop Arcade Cabinet tucked in cozy timber alcove
        ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
        ctx.fillRect(ax + 5, ay + 28, 22, 4);
        // Timber alcove frame
        ctx.fillStyle = '#6c2f0c';
        ctx.fillRect(ax + 4, ay + 2, 24, 28);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(ax + 5, ay + 3, 22, 26);
        // Indigo cabinet chassis
        ctx.fillStyle = '#181542';
        ctx.fillRect(ax + 6, ay + 4, 20, 25);
        ctx.fillStyle = '#2d2a78';
        ctx.fillRect(ax + 7, ay + 5, 18, 23);
        // Illuminated brass & cyan marquee header
        ctx.fillStyle = '#eab308';
        ctx.fillRect(ax + 6, ay + 4, 20, 6);
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(ax + 8, ay + 5, 16, 4);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(ax + 9, ay + 6, 14, 2);
        ctx.fillStyle = '#fef9c3';
        ctx.fillRect(ax + 10, ay + 6, 2, 2);
        ctx.fillRect(ax + 14, ay + 6, 3, 2);
        ctx.fillRect(ax + 19, ay + 6, 3, 1);
        // Recessed CRT screen with live animated Sky-Hop attract glints
        ctx.fillStyle = '#0d142b';
        ctx.fillRect(ax + 8, ay + 11, 16, 9);
        ctx.fillStyle = '#0e7490';
        ctx.fillRect(ax + 9, ay + 12, 14, 7);
        ctx.fillStyle = '#0891b2';
        ctx.fillRect(ax + 10, ay + 13, 12, 5);
        const hopY = reducedMotion ? 0 : Math.round(Math.sin(t * 6.5) * 1.4);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(ax + 12, ay + 15 + hopY, 3, 2);
        ctx.fillStyle = '#f472b6';
        ctx.fillRect(ax + 18, ay + 14 - hopY, 2, 2);
        // Control deck + joystick + glowing RGB arcade buttons
        ctx.fillStyle = '#4338ca';
        ctx.fillRect(ax + 7, ay + 20, 18, 4);
        ctx.fillStyle = '#6366f1';
        ctx.fillRect(ax + 8, ay + 20, 16, 1);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(ax + 10, ay + 20, 1, 2);
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(ax + 9, ay + 19, 3, 2);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(ax + 16, ay + 21, 2, 2);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(ax + 19, ay + 21, 2, 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(ax + 22, ay + 21, 2, 2);
        // Coin slot & golden starlight unlock badge
        ctx.fillStyle = '#181542';
        ctx.fillRect(ax + 8, ay + 24, 16, 5);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(ax + 12, ay + 25, 8, 3);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(ax + 15, ay + 26, 2, 1);
        // Top-right golden star badge
        ctx.fillStyle = '#b45309';
        ctx.fillRect(ax + 22, ay + 1, 7, 7);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(ax + 23, ay + 2, 5, 5);
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.65 + pulse * 0.35).toFixed(2)})`;
        ctx.fillRect(ax + 24, ay + 4, 3, 1);
        ctx.fillRect(ax + 25, ay + 3, 1, 3);
      }
    }
  }

  /**
   * Renders crisp pixel-art parting tall grass blades across all 7 tall-grass tile types
   * (chunk-culled so open meadows/village tiles skip the scan instantly!).
   */
  renderPartingTallGrass(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
  ): void {
    const { cols, rows, tileSize, worldMap, elapsedSeconds, reducedMotion, player, follower } = state;
    const meta = getOrBuildStaticMapMeta(worldMap, cols, rows, state.currentBiomeId);
    const t = reducedMotion ? elapsedSeconds * 0.2 : elapsedSeconds;
    ctx.imageSmoothingEnabled = false;

    const minCx = Math.floor(bounds.minTx / TERRAIN_CHUNK_TILES);
    const maxCx = Math.floor(bounds.maxTx / TERRAIN_CHUNK_TILES);
    const minCy = Math.floor(bounds.minTy / TERRAIN_CHUNK_TILES);
    const maxCy = Math.floor(bounds.maxTy / TERRAIN_CHUNK_TILES);

    for (let cy = minCy; cy <= maxCy; cy++) {
      const tyStart = Math.max(bounds.minTy, cy * TERRAIN_CHUNK_TILES);
      const tyEnd = Math.min(bounds.maxTy, (cy + 1) * TERRAIN_CHUNK_TILES - 1);
      for (let cx = minCx; cx <= maxCx; cx++) {
        if (!meta.chunkHasTallGrass[cy * meta.chunkCols + cx]) continue;
        const txStart = Math.max(bounds.minTx, cx * TERRAIN_CHUNK_TILES);
        const txEnd = Math.min(bounds.maxTx, (cx + 1) * TERRAIN_CHUNK_TILES - 1);

        for (let ty = tyStart; ty <= tyEnd; ty++) {
          const row = worldMap[ty];
          if (!row) continue;
          for (let tx = txStart; tx <= txEnd; tx++) {
            const tileId = row[tx];
            if (tileId === undefined || !TALL_GRASS_TILES.has(tileId)) continue;

            const idx = ty * cols + tx;
            const disp = this.grassDisplacements.get(idx);
            const nearPlayer = Math.abs(tx - player.x) <= 2.2 && Math.abs(ty - player.y) <= 2.2;
            const nearFollower =
              follower !== null &&
              Math.abs(tx - follower.x) <= 2.0 &&
              Math.abs(ty - follower.y) <= 2.0;

            const pal = getGrassBladePalette(tileId);
            const px = tx * tileSize;
            const py = ty * tileSize;

            if (!disp && !nearPlayer && !nearFollower) {
              if (reducedMotion) continue;
              const wind = Math.round(Math.sin(t * 2.4 + tx * 0.8 + ty * 0.5) * 1.4);
              ctx.fillStyle = pal.tip;
              ctx.fillRect(px + 9 + wind, py + 11, 2, 3);
              ctx.fillRect(px + 21 - wind, py + 19, 2, 3);
              continue;
            }

            const bendX = disp ? disp.bendX * disp.intensity * 10 : 0;
            const bendY = disp ? disp.bendY * disp.intensity * 3 : 0;

            for (let i = 0; i < 6; i++) {
              const bx = Math.round(px + 4 + (i * (tileSize - 8)) / 5 + (hash2D(tx, ty, 10 + i) - 0.5) * 3);
              const by = Math.round(py + 12 + (i % 2) * 11 + hash2D(tx, ty, 20 + i) * 4);
              const h = 9 + Math.round(hash2D(tx, ty, 30 + i) * 5);
              const wind = reducedMotion
                ? 0
                : Math.round(Math.sin(t * 2.4 + tx * 0.8 + ty * 0.5 + i * 0.9) * 1.6);

              let partX = bendX;
              const dxP = bx / tileSize - (player.x + 0.5);
              const dyP = by / tileSize - (player.y + 0.5);
              const dP = Math.hypot(dxP, dyP);
              if (dP < 0.9) {
                partX += (dxP >= 0 ? 1 : -1) * (1 - dP / 0.9) * 8;
              }
              if (follower) {
                const dxF = bx / tileSize - (follower.x + 0.5);
                const dyF = by / tileSize - (follower.y + 0.5);
                const dF = Math.hypot(dxF, dyF);
                if (dF < 0.8) {
                  partX += (dxF >= 0 ? 1 : -1) * (1 - dF / 0.8) * 6;
                }
              }

              const lean = Math.round(partX + wind + (i % 2 === 0 ? 1 : -1));
              const topY = Math.round(by - h + Math.abs(partX) * 0.2 + bendY);

              ctx.fillStyle = pal.dark;
              ctx.fillRect(bx - 1, by - 4, 3, 4);
              ctx.fillStyle = pal.mid;
              ctx.fillRect(bx + Math.round(lean * 0.4) - 1, by - Math.round(h * 0.7), 2, Math.round(h * 0.45));
              ctx.fillStyle = pal.tip;
              ctx.fillRect(bx + lean, topY, 2, 3);
            }
          }
        }
      }
    }
  }

  /**
   * Collects candidate PointLights from pre-indexed spatial chunks (lanterns, healing fountains,
   * cottage windows, Secret Arcade star wall, and volcanic lava pockets).
   */
  collectPropLights(
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    camCenterX: number,
    camCenterY: number,
    out: LightCandidate[],
  ): void {
    const { cols, rows, tileSize, worldMap, timeOfDay, secretArcadeSpot } = state;
    const meta = getOrBuildStaticMapMeta(worldMap, cols, rows, state.currentBiomeId);
    const twilightBoost = 0.85 + 0.35 * clamp(Math.abs(timeOfDay - 0.5) * 2, 0, 1);

    const pushLight = (light: PointLight) => {
      const dx = light.x - camCenterX;
      const dy = light.y - camCenterY;
      out.push({ light, distSq: dx * dx + dy * dy });
    };

    // Cottage windows
    for (let i = 0; i < meta.buildingCache.clusters.length; i++) {
      const cluster = meta.buildingCache.clusters[i];
      if (
        cluster.tx + cluster.widthTiles < bounds.minTx - 2 ||
        cluster.tx > bounds.maxTx + 2 ||
        cluster.ty + cluster.heightTiles < bounds.minTy - 2 ||
        cluster.ty > bounds.maxTy + 2
      ) {
        continue;
      }
      const w = cluster.widthTiles * tileSize;
      const winY = (cluster.ty + 1.35) * tileSize;
      pushLight({
        id: `${cluster.id}-win-l-${cluster.tx}`,
        x: cluster.tx * tileSize + w * 0.25,
        y: winY,
        radius: tileSize * 2.9,
        color: [1.0, 0.8, 0.42],
        intensity: 0.76 * twilightBoost,
        flickerSpeed: 3.0,
        flickerAmount: 0.08,
      });
      pushLight({
        id: `${cluster.id}-win-r-${cluster.tx}`,
        x: cluster.tx * tileSize + w * 0.75,
        y: winY,
        radius: tileSize * 2.9,
        color: [1.0, 0.8, 0.42],
        intensity: 0.76 * twilightBoost,
        flickerSpeed: 3.3,
        flickerAmount: 0.08,
      });
    }

    // Secret Arcade Star Wall light at (11, 12)
    if (
      secretArcadeSpot.x >= bounds.minTx - 3 &&
      secretArcadeSpot.x <= bounds.maxTx + 3 &&
      secretArcadeSpot.y >= bounds.minTy - 3 &&
      secretArcadeSpot.y <= bounds.maxTy + 3
    ) {
      pushLight({
        id: 'secret-arcade-star',
        x: (secretArcadeSpot.x + 0.5) * tileSize,
        y: (secretArcadeSpot.y + 0.5) * tileSize,
        radius: tileSize * (secretArcadeSpot.unlocked ? 3.2 : 2.3),
        color: secretArcadeSpot.unlocked ? [0.42, 0.92, 1.0] : [1.0, 0.88, 0.46],
        intensity: (secretArcadeSpot.unlocked ? 1.15 : 0.78) * twilightBoost,
        flickerSpeed: 3.6,
        flickerAmount: 0.14,
      });
    }

    // Lanterns, Healing Fountains, & Lava vents from pre-indexed chunks
    const minTx = Math.max(0, bounds.minTx - 2);
    const maxTx = Math.min(cols - 1, bounds.maxTx + 2);
    const minTy = Math.max(0, bounds.minTy - 2);
    const maxTy = Math.min(rows - 1, bounds.maxTy + 2);
    const minCx = Math.floor(minTx / TERRAIN_CHUNK_TILES);
    const maxCx = Math.floor(maxTx / TERRAIN_CHUNK_TILES);
    const minCy = Math.floor(minTy / TERRAIN_CHUNK_TILES);
    const maxCy = Math.floor(maxTy / TERRAIN_CHUNK_TILES);

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const list = meta.chunkLights[cy * meta.chunkCols + cx];
        if (!list || list.length === 0) continue;
        for (let i = 0; i < list.length; i++) {
          const spec = list[i];
          if (spec.tx < minTx || spec.tx > maxTx || spec.ty < minTy || spec.ty > maxTy) continue;
          pushLight({
            id: spec.id,
            x: (spec.tx + 0.5) * tileSize,
            y: (spec.ty + 0.45) * tileSize,
            radius: tileSize * spec.radiusTiles,
            color: spec.color,
            intensity: spec.baseIntensity * twilightBoost,
            flickerSpeed: spec.flickerSpeed,
            flickerAmount: spec.flickerAmount,
          });
        }
      }
    }
  }

  private drawFallbackCottage(ctx: CanvasRenderingContext2D, c: BuildingCluster, tileSize: number): void {
    const x = c.tx * tileSize;
    const y = c.ty * tileSize;
    const w = c.widthTiles * tileSize;
    const h = c.heightTiles * tileSize;
    ctx.fillStyle = c.id === 'cottage_lab' ? '#dce4f4' : '#ede0cf';
    ctx.fillRect(x + 4, y + 8, w - 8, h - 10);
    ctx.fillStyle = c.id === 'cottage_lab' ? '#3a62a8' : '#7e3a9c';
    ctx.fillRect(x + 2, y - 10, w - 4, 22);
    ctx.fillStyle = '#ffd978';
    ctx.fillRect(x + 14, y + 18, 12, 12);
    ctx.fillRect(x + w - 26, y + 18, 12, 12);
    ctx.fillStyle = '#5c3c24';
    ctx.fillRect(x + w * 0.5 - 8, y + h - 24, 16, 22);
  }

  private drawFallbackTree(
    ctx: CanvasRenderingContext2D,
    cx: number,
    baseY: number,
    tileSize: number,
    region: string,
  ): void {
    if (region === 'prop_crystal') {
      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(Math.round(cx - 5), Math.round(baseY - 28), 10, 26);
      ctx.fillStyle = '#c4b5fd';
      ctx.fillRect(Math.round(cx - 10), Math.round(baseY - 18), 6, 16);
      return;
    }
    if (region === 'prop_mushroom') {
      ctx.fillStyle = '#e2d4f0';
      ctx.fillRect(Math.round(cx - 4), Math.round(baseY - 14), 8, 14);
      ctx.fillStyle = '#9333ea';
      ctx.fillRect(Math.round(cx - 13), Math.round(baseY - 24), 26, 12);
      return;
    }
    ctx.fillStyle = '#613c24';
    ctx.fillRect(Math.round(cx - 4), Math.round(baseY - 14), 8, 14);
    ctx.fillStyle =
      region === 'tree_sakura'
        ? '#f472b6'
        : region === 'tree_pine'
          ? '#22664a'
          : region === 'tree_palm'
            ? '#4ade80'
            : '#2e8a4c';
    ctx.fillRect(Math.round(cx - tileSize * 0.42), Math.round(baseY - 34), Math.round(tileSize * 0.84), 22);
  }

  private drawFallbackFountain(
    ctx: CanvasRenderingContext2D,
    cx: number,
    baseY: number,
    tileSize: number,
    t: number,
  ): void {
    fillEllipse(ctx, cx, baseY - 8, tileSize * 0.42, tileSize * 0.2, '#b8c4de');
    fillEllipse(ctx, cx, baseY - 9, tileSize * 0.34, tileSize * 0.14, '#38bdf8');
    ctx.fillStyle = '#e0f7ff';
    ctx.fillRect(Math.round(cx - 2), Math.round(baseY - 22 - Math.abs(Math.sin(t * 4)) * 3), 4, 14);
  }

  private drawFallbackLantern(
    ctx: CanvasRenderingContext2D,
    cx: number,
    baseY: number,
    _tileSize: number,
    t: number,
  ): void {
    ctx.fillStyle = '#334155';
    ctx.fillRect(Math.round(cx - 2), Math.round(baseY - 26), 4, 26);
    const pulse = 0.8 + 0.2 * Math.sin(t * 4.5);
    ctx.fillStyle = `rgba(255, 218, 108, ${pulse.toFixed(2)})`;
    ctx.fillRect(Math.round(cx - 4), Math.round(baseY - 30), 8, 8);
  }

  private drawFallbackSignpost(
    ctx: CanvasRenderingContext2D,
    cx: number,
    baseY: number,
    _tileSize: number,
  ): void {
    ctx.fillStyle = '#6b4425';
    ctx.fillRect(Math.round(cx - 2), Math.round(baseY - 16), 4, 16);
    ctx.fillStyle = '#b8824c';
    ctx.fillRect(Math.round(cx - 10), Math.round(baseY - 24), 20, 12);
  }
}

const EMPTY_KEY_SET: ReadonlySet<number> = new Set<number>();
void TREE_PROP_REGIONS;
