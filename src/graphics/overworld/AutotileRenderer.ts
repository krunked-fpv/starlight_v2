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
  const wr = Math.max(2, Math.round(rx));
  const hr = Math.max(1, Math.round(ry));
  ctx.fillStyle = `rgba(10, 14, 30, ${(alpha * 0.5).toFixed(3)})`;
  ctx.fillRect(ox - wr, oy - Math.floor(hr * 0.5), wr * 2, hr);
  ctx.fillStyle = `rgba(10, 14, 30, ${alpha.toFixed(3)})`;
  const innerW = Math.max(2, Math.round(wr * 0.72));
  const innerH = Math.max(2, Math.round(hr * 1.45));
  ctx.fillRect(ox - innerW, oy - Math.floor(innerH * 0.5), innerW * 2, innerH);
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

const TERRAIN_CHUNK_TILES = 16;

export class AutotileRenderer {
  private manifest: AtlasManifest | null = null;
  private getSheetImage: ((sheetId: string) => HTMLImageElement | null) | null = null;
  private grassDisplacements = new Map<number, GrassDisplacement>();
  private terrainChunks = new Map<string, HTMLCanvasElement>();
  private chunkCacheSignature = '';
  private usedStaticChunkCacheThisFrame = false;

  setManifest(
    manifest: AtlasManifest | null,
    getSheetImage?: ((sheetId: string) => HTMLImageElement | null) | null,
  ): void {
    this.manifest = manifest;
    if (getSheetImage !== undefined) {
      this.getSheetImage = getSheetImage;
    }
    this.terrainChunks.clear();
    this.chunkCacheSignature = '';
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
    this.terrainChunks.clear();
    this.chunkCacheSignature = '';
  }

  private getOrBakeTerrainChunk(
    chunkX: number,
    chunkY: number,
    state: OverworldSceneState,
    buildingCache: { clusters: BuildingCluster[]; tileKeys: Set<number> },
    terrainAlbedo: HTMLImageElement,
  ): HTMLCanvasElement | null {
    const { cols, rows, tileSize, worldMap } = state;
    const sheet = this.manifest?.sheets?.terrain;
    if (!sheet || typeof document === 'undefined') return null;

    const sig = `${cols}x${rows}x${tileSize}|${terrainAlbedo.src || terrainAlbedo.naturalWidth}`;
    if (this.chunkCacheSignature !== sig) {
      this.terrainChunks.clear();
      this.chunkCacheSignature = sig;
    }

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
    canvas.width = spanCols * tileSize;
    canvas.height = spanRows * tileSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) ?? canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;

    const regions = sheet.regions;
    for (let ty = startTy; ty <= endTy; ty++) {
      const row = worldMap[ty];
      if (!row) continue;
      const ly = (ty - startTy) * tileSize;
      for (let tx = startTx; tx <= endTx; tx++) {
        const rawTileId = row[tx] ?? TILE.GRASS;
        const idx = ty * cols + tx;
        const effectiveTileId = buildingCache.tileKeys.has(idx) ? TILE.GRASS : rawTileId;
        const lx = (tx - startTx) * tileSize;
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
            tileSize,
            tileSize,
          );
        }
      }
    }

    // Bake static 47-tile autotile seams (walls, path curbs, bridges, wet sand) once per chunk
    for (let ty = startTy; ty <= endTy; ty++) {
      const row = worldMap[ty];
      if (!row) continue;
      const ly = (ty - startTy) * tileSize;
      for (let tx = startTx; tx <= endTx; tx++) {
        const tileId = row[tx] ?? TILE.GRASS;
        const lx = (tx - startTx) * tileSize;
        const nTile = ty > 0 ? worldMap[ty - 1]?.[tx] : undefined;
        const sTile = ty + 1 < rows ? worldMap[ty + 1]?.[tx] : undefined;
        const wTile = tx > 0 ? row[tx - 1] : undefined;
        const eTile = tx + 1 < cols ? row[tx + 1] : undefined;

        if (WALL_TILES.has(tileId)) {
          const mask = computeTile47Mask(worldMap, cols, rows, tx, ty, (id) => WALL_TILES.has(id));
          this.drawWallAutotileOverlay(ctx, lx, ly, tileSize, mask, sTile);
        } else if (PATH_TILES.has(tileId)) {
          const mask = computeTile47Mask(worldMap, cols, rows, tx, ty, (id) => PATH_TILES.has(id));
          this.drawPathBorderOverlay(ctx, lx, ly, tileSize, tx, ty, tileId, mask, 0, false);
        } else if (tileId === TILE.BRIDGE) {
          this.drawBridgePixelOverlay(ctx, lx, ly, tileSize, ty, nTile, sTile, wTile, eTile);
        } else if (SAND_TILES.has(tileId)) {
          if (sTile !== undefined && WATER_TILES.has(sTile)) {
            ctx.fillStyle = 'rgba(20, 48, 86, 0.24)';
            ctx.fillRect(lx, ly + tileSize - 3, tileSize, 3);
          }
        }
      }
    }

    this.terrainChunks.set(key, canvas);
    return canvas;
  }

  /**
   * Advances spring-physics tall grass displacement across all 7 tall-grass tile types
   * around the player and Lead Pokémon follower.
   */
  update(state: OverworldSceneState, dtSeconds: number): void {
    const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
    const { cols, rows, worldMap, player, follower } = state;

    const pushers: Array<{ x: number; y: number; weight: number }> = [
      { x: player.x + 0.5, y: player.y + 0.5, weight: player.moving ? 1.0 : 0.72 },
    ];
    if (follower) {
      pushers.push({
        x: follower.x + 0.5,
        y: follower.y + 0.5,
        weight: follower.moving ? 0.85 : 0.6,
      });
    }

    const activeSet = new Set<number>();
    const influenceRadius = 1.15;

    for (const pusher of pushers) {
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
   * Pass 1: Emits frustum-culled 'terrain' atlas sprites (`tile_0`..`tile_60`)
   * with `pixelCrisp: true, useNormalMap: true`, procedural fallback when atlas unattached,
   * and translucent water/lava quads (`drawWaterQuad`) with 4-neighbor foam masks.
   */
  renderTerrainAndWater(
    backend: IRenderBackend,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    camera: { camX: number; camY: number; camZoom: number },
  ): void {
    const { cols, rows, tileSize, worldMap } = state;
    const buildingCache = detectBuildingClusters(worldMap, cols, rows);
    this.usedStaticChunkCacheThisFrame = false;

    // Procedural fallback base when 'terrain' sheet is not yet attached
    if (!this.hasSheet('terrain')) {
      backend.drawCustom2D((ctx, viewW, viewH) => {
        this.drawBaseTilesFallback(ctx, state, bounds, camera.camX, camera.camY, camera.camZoom, viewW, viewH);
      }, 'world');
    }

    const terrainAlbedo =
      backend.kind === 'canvas2d' && this.hasSheet('terrain') && this.getSheetImage
        ? this.getSheetImage('terrain')
        : null;

    if (
      terrainAlbedo &&
      terrainAlbedo.naturalWidth > 0 &&
      typeof document !== 'undefined'
    ) {
      // Canvas2D fast path: blit pre-baked 16x16 static terrain chunks (6–9 blits vs 1,300+ tiles!)
      this.usedStaticChunkCacheThisFrame = true;
      const minCx = Math.floor(bounds.minTx / TERRAIN_CHUNK_TILES);
      const maxCx = Math.floor(bounds.maxTx / TERRAIN_CHUNK_TILES);
      const minCy = Math.floor(bounds.minTy / TERRAIN_CHUNK_TILES);
      const maxCy = Math.floor(bounds.maxTy / TERRAIN_CHUNK_TILES);

      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          const chunk = this.getOrBakeTerrainChunk(cx, cy, state, buildingCache, terrainAlbedo);
          if (!chunk) continue;
          backend.drawSprite({
            source: chunk,
            sx: 0,
            sy: 0,
            sw: chunk.width,
            sh: chunk.height,
            dx: cx * TERRAIN_CHUNK_TILES * tileSize,
            dy: cy * TERRAIN_CHUNK_TILES * tileSize,
            dw: chunk.width,
            dh: chunk.height,
            pixelCrisp: true,
            depth: 0,
          });
        }
      }
    } else {
      // WebGL2 instanced / fallback path: emit every visible tile (0..60) crisply from baked 'terrain' atlas
      for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
        const row = worldMap[ty];
        if (!row) continue;
        for (let tx = bounds.minTx; tx <= bounds.maxTx; tx++) {
          const rawTileId = row[tx] ?? TILE.GRASS;
          const idx = ty * cols + tx;
          const effectiveTileId = buildingCache.tileKeys.has(idx) ? TILE.GRASS : rawTileId;

          backend.drawSprite(
            buildSpriteCmd(
              this.manifest,
              'terrain',
              `tile_${effectiveTileId}`,
              tx * tileSize,
              ty * tileSize,
              tileSize,
              tileSize,
              { depth: 0 },
            ),
          );
        }
      }
    }

    // Water & Lava shimmering quads with 4-neighbor shoreline foam mask (run-length merged per row)
    for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
      const row = worldMap[ty];
      if (!row) continue;
      let tx = bounds.minTx;
      while (tx <= bounds.maxTx) {
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

        const foamMask = computeLiquidFoamMask(worldMap, cols, rows, tx, ty, tileId);
        let runEnd = tx;
        if (this.usedStaticChunkCacheThisFrame && foamMask === 0) {
          while (
            runEnd + 1 <= bounds.maxTx &&
            row[runEnd + 1] === tileId &&
            computeLiquidFoamMask(worldMap, cols, rows, runEnd + 1, ty, tileId) === 0
          ) {
            runEnd += 1;
          }
        }
        const runCols = runEnd - tx + 1;
        backend.drawWaterQuad(
          tx * tileSize,
          ty * tileSize,
          runCols * tileSize,
          tileSize,
          depthFactor,
          foamMask,
        );
        tx = runEnd + 1;
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

        // Crisp 2px pixel texture dither
        if (hash2D(tx, ty, 19) > 0.35) {
          ctx.fillStyle = rgb255ToStr(shadeRgb(base, 1.14, 6), 0.5);
          ctx.fillRect(px + Math.floor(hash2D(tx, ty, 21) * 12) * 2 + 2, py + Math.floor(hash2D(tx, ty, 23) * 12) * 2 + 2, 4, 2);
        }
      }
    }

    ctx.restore();
  }

  /**
   * Draws crisp 47-tile autotile pixel details:
   * - Shoreline wet sand edges & surf foam
   * - Cliff/wall top bevels & south drop-shadows
   * - Biome path curb borders & glowing rune trails
   * - Boardwalk bridge pilings & wooden rails
   * - Molten lava ember crust highlights & swaying flowers
   */
  renderTerrainDetailOverlays(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
  ): void {
    const { cols, rows, tileSize, worldMap, elapsedSeconds, reducedMotion } = state;
    const t = reducedMotion ? elapsedSeconds * 0.25 : elapsedSeconds;
    ctx.imageSmoothingEnabled = false;

    for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
      const row = worldMap[ty];
      if (!row) continue;
      for (let tx = bounds.minTx; tx <= bounds.maxTx; tx++) {
        const tileId = row[tx] ?? TILE.GRASS;
        const px = tx * tileSize;
        const py = ty * tileSize;

        const nTile = ty > 0 ? worldMap[ty - 1]?.[tx] : undefined;
        const sTile = ty + 1 < rows ? worldMap[ty + 1]?.[tx] : undefined;
        const wTile = tx > 0 ? row[tx - 1] : undefined;
        const eTile = tx + 1 < cols ? row[tx + 1] : undefined;

        if (this.usedStaticChunkCacheThisFrame) {
          // Static wall/path/bridge/sand seams are already baked into 16x16 terrain chunks;
          // render only dynamic/animated tile details here.
          if (tileId === TILE.RUNE_TRAIL) {
            const shimmer = 0.45 + 0.35 * Math.sin(t * 2.6 + tx * 0.7 + ty * 0.5);
            ctx.fillStyle = `rgba(124, 232, 255, ${shimmer.toFixed(3)})`;
            ctx.fillRect(px + 13, py + 13, 6, 6);
            ctx.fillStyle = `rgba(255, 244, 178, ${(shimmer * 0.9).toFixed(3)})`;
            ctx.fillRect(px + 15, py + 15, 2, 2);
          } else if (tileId === TILE.FLOWER) {
            this.drawFlowerPixelDetail(ctx, px, py, tileSize, tx, ty, t);
          } else if (WATER_TILES.has(tileId)) {
            this.drawWaterShorePixelEdge(ctx, px, py, tileSize, tx, ty, nTile, sTile, wTile, eTile, t);
          } else if (tileId === TILE.LAVA) {
            this.drawLavaEdgeDetail(ctx, px, py, tileSize, tx, ty, nTile, sTile, wTile, eTile, t);
          }
          continue;
        }

        if (WALL_TILES.has(tileId)) {
          const mask = computeTile47Mask(worldMap, cols, rows, tx, ty, (id) => WALL_TILES.has(id));
          this.drawWallAutotileOverlay(ctx, px, py, tileSize, mask, sTile);
        } else if (PATH_TILES.has(tileId)) {
          const mask = computeTile47Mask(worldMap, cols, rows, tx, ty, (id) => PATH_TILES.has(id));
          this.drawPathBorderOverlay(ctx, px, py, tileSize, tx, ty, tileId, mask, t);
        } else if (tileId === TILE.BRIDGE) {
          this.drawBridgePixelOverlay(ctx, px, py, tileSize, ty, nTile, sTile, wTile, eTile);
        } else if (tileId === TILE.FLOWER) {
          this.drawFlowerPixelDetail(ctx, px, py, tileSize, tx, ty, t);
        } else if (WATER_TILES.has(tileId)) {
          this.drawWaterShorePixelEdge(ctx, px, py, tileSize, tx, ty, nTile, sTile, wTile, eTile, t);
        } else if (tileId === TILE.LAVA) {
          this.drawLavaEdgeDetail(ctx, px, py, tileSize, tx, ty, nTile, sTile, wTile, eTile, t);
        } else if (SAND_TILES.has(tileId)) {
          if (sTile !== undefined && WATER_TILES.has(sTile)) {
            ctx.fillStyle = 'rgba(20, 48, 86, 0.24)';
            ctx.fillRect(px, py + tileSize - 3, tileSize, 3);
          }
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

    // Crisp 2px pixel highlight along exposed north/west edges
    ctx.fillStyle = 'rgba(232, 244, 255, 0.22)';
    if (!hasN) ctx.fillRect(px, py, tileSize, 2);
    if (!hasW) ctx.fillRect(px, py, 2, tileSize);

    // Shaded bevel along exposed east edge
    if (!hasE) {
      ctx.fillStyle = 'rgba(8, 12, 28, 0.34)';
      ctx.fillRect(px + tileSize - 3, py, 3, tileSize);
    }

    // Stepped pixel cliff face + cast drop-shadow onto south walkable tile
    if (!hasS) {
      ctx.fillStyle = 'rgba(10, 12, 28, 0.42)';
      ctx.fillRect(px, py + tileSize - 5, tileSize, 5);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(px, py + tileSize - 7, tileSize, 2);

      if (southTile !== undefined && !WALL_TILES.has(southTile)) {
        ctx.fillStyle = 'rgba(8, 10, 24, 0.42)';
        ctx.fillRect(px, py + tileSize, tileSize, 4);
        ctx.fillStyle = 'rgba(8, 10, 24, 0.22)';
        ctx.fillRect(px, py + tileSize + 4, tileSize, 4);
      }
    }

    // Inner corner bevel notches
    ctx.fillStyle = 'rgba(8, 10, 24, 0.38)';
    if (hasN && hasW && !hasNW) ctx.fillRect(px, py, 4, 4);
    if (hasN && hasE && !hasNE) ctx.fillRect(px + tileSize - 4, py, 4, 4);
    if (hasS && hasW && !hasSW) ctx.fillRect(px, py + tileSize - 4, 4, 4);
    if (hasS && hasE && !hasSE) ctx.fillRect(px + tileSize - 4, py + tileSize - 4, 4, 4);
  }

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
  ): void {
    const hasN = (mask & 2) !== 0;
    const hasW = (mask & 8) !== 0;
    const hasE = (mask & 16) !== 0;
    const hasS = (mask & 64) !== 0;

    ctx.fillStyle = 'rgba(14, 18, 36, 0.24)';
    if (!hasN) ctx.fillRect(px, py, tileSize, 2);
    if (!hasS) ctx.fillRect(px, py + tileSize - 2, tileSize, 2);
    if (!hasW) ctx.fillRect(px, py, 2, tileSize);
    if (!hasE) ctx.fillRect(px + tileSize - 2, py, 2, tileSize);

    ctx.fillStyle = 'rgba(255, 248, 224, 0.14)';
    if (!hasN) ctx.fillRect(px + 2, py + 2, tileSize - 4, 2);

    if (includeAnimatedRune && tileId === TILE.RUNE_TRAIL) {
      const shimmer = 0.45 + 0.35 * Math.sin(t * 2.6 + tx * 0.7 + ty * 0.5);
      ctx.fillStyle = `rgba(124, 232, 255, ${shimmer.toFixed(3)})`;
      ctx.fillRect(px + 13, py + 13, 6, 6);
      ctx.fillStyle = `rgba(255, 244, 178, ${(shimmer * 0.9).toFixed(3)})`;
      ctx.fillRect(px + 15, py + 15, 2, 2);
    }
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
      ctx.fillStyle = '#4e311d';
      ctx.fillRect(px + 1, py, 4, tileSize);
      ctx.fillStyle = '#c48d56';
      ctx.fillRect(px + 2, py, 2, tileSize);
      if (isEndCap || ty % 2 === 0) {
        ctx.fillStyle = '#3b2212';
        ctx.fillRect(px + 1, py + 2, 5, 6);
        ctx.fillStyle = '#ffd978';
        ctx.fillRect(px + 2, py + 3, 3, 2);
      }
    }
    if (isRightRail) {
      ctx.fillStyle = '#4e311d';
      ctx.fillRect(px + tileSize - 5, py, 4, tileSize);
      ctx.fillStyle = '#c48d56';
      ctx.fillRect(px + tileSize - 4, py, 2, tileSize);
      if (isEndCap || ty % 2 === 0) {
        ctx.fillStyle = '#3b2212';
        ctx.fillRect(px + tileSize - 6, py + 2, 5, 6);
        ctx.fillStyle = '#ffd978';
        ctx.fillRect(px + tileSize - 5, py + 3, 3, 2);
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
    for (let i = 0; i < 4; i++) {
      const fx = Math.round(px + 5 + hash2D(tx, ty, 30 + i) * (tileSize - 12));
      const fy = Math.round(py + 5 + hash2D(tx, ty, 50 + i) * (tileSize - 12));
      const sway = Math.round(Math.sin(t * 2.2 + tx + ty + i) * 1.1);
      ctx.fillStyle = colors[(tx + ty + i) % colors.length];
      ctx.fillRect(fx + sway, fy, 4, 4);
      ctx.fillStyle = '#fff9d6';
      ctx.fillRect(fx + sway + 1, fy + 1, 2, 2);
    }
  }

  private drawWaterShorePixelEdge(
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
    const isLand = (id: number | undefined) => id !== undefined && !LIQUID_TILES.has(id) && id !== TILE.BRIDGE;
    const waveShift = Math.round(Math.sin(t * 2.6 + tx * 0.8 + ty * 0.6));

    ctx.fillStyle = 'rgba(232, 250, 255, 0.72)';
    if (isLand(nTile)) {
      ctx.fillRect(px, py + Math.max(0, waveShift), tileSize, 2);
      ctx.fillStyle = 'rgba(130, 218, 255, 0.45)';
      ctx.fillRect(px + 2, py + 2 + Math.max(0, waveShift), tileSize - 4, 2);
    }
    ctx.fillStyle = 'rgba(232, 250, 255, 0.62)';
    if (isLand(sTile)) {
      ctx.fillRect(px, py + tileSize - 2 - Math.max(0, waveShift), tileSize, 2);
    }
    if (isLand(wTile)) {
      ctx.fillRect(px + Math.max(0, waveShift), py, 2, tileSize);
    }
    if (isLand(eTile)) {
      ctx.fillRect(px + tileSize - 2 - Math.max(0, waveShift), py, 2, tileSize);
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
    ctx.fillStyle = `rgba(255, 168, 56, ${pulse.toFixed(3)})`;
    if (isCrust(nTile)) ctx.fillRect(px, py, tileSize, 3);
    if (isCrust(sTile)) ctx.fillRect(px, py + tileSize - 3, tileSize, 3);
    if (isCrust(wTile)) ctx.fillRect(px, py, 3, tileSize);
    if (isCrust(eTile)) ctx.fillRect(px + tileSize - 3, py, 3, tileSize);

    // Bright molten pixel core
    if (hash2D(tx, ty, 77) > 0.45) {
      ctx.fillStyle = `rgba(255, 224, 102, ${(pulse * 0.85).toFixed(3)})`;
      ctx.fillRect(px + 10 + Math.round(Math.sin(t * 2 + tx) * 2), py + 12, 6, 3);
    }
  }

  /**
   * Collects Y-sorted prop & building SpriteDrawCmds from sheet 'props' for visible tiles.
   */
  collectPropSprites(
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    outSprites: SpriteDrawCmd[],
    landmarkTileKeys: Set<string>,
  ): void {
    const { cols, rows, tileSize, worldMap, elapsedSeconds, reducedMotion } = state;
    const t = reducedMotion ? 0 : elapsedSeconds;
    const buildingCache = detectBuildingClusters(worldMap, cols, rows);

    // 1. Starlight Village hero cottages (replacing raw flat WALL/ROOF blocks)
    for (const cluster of buildingCache.clusters) {
      if (
        cluster.tx + cluster.widthTiles < bounds.minTx - 1 ||
        cluster.tx > bounds.maxTx + 1 ||
        cluster.ty + cluster.heightTiles < bounds.minTy - 1 ||
        cluster.ty > bounds.maxTy + 2
      ) {
        continue;
      }
      const spanW = cluster.widthTiles * tileSize;
      const dw = Math.min(spanW, Math.round(tileSize * 3.375)); // 108px preserves 96x96 cottage 1:1 pixel ratio
      const dh = Math.round(dw * 0.96);
      const dx = Math.round(cluster.tx * tileSize + (spanW - dw) * 0.5);
      const dy = Math.round((cluster.ty + cluster.heightTiles) * tileSize - dh + 4);
      outSprites.push(
        buildSpriteCmd(this.manifest, 'props', cluster.id, dx, dy, dw, dh, {
          depth: (cluster.ty + cluster.heightTiles - 0.05) * tileSize,
        }),
      );
    }

    // 2. Visible tile props (trees, healing fountains, lanterns, signposts)
    for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
      const row = worldMap[ty];
      if (!row) continue;
      for (let tx = bounds.minTx; tx <= bounds.maxTx; tx++) {
        const tileId = row[tx];
        const key = `${tx},${ty}`;

        if (tileId === TILE.TREE) {
          if (landmarkTileKeys.has(key)) continue; // Avoid double-draw with hero landmark (e.g. Great Tree)
          const tileBiome = getBiomeAt(tx, ty)?.id || state.currentBiomeId;
          const regionId = resolveTreePropRegion(tileBiome);
          const swayPhase = hash2D(tx, ty, 13) * Math.PI * 2;
          const swayDx = reducedMotion ? 0 : Math.round(Math.sin(t * 1.9 + swayPhase) * 1.1);
          const dw = Math.round(tileSize * 1.625); // 52x52 preserves 64x64 prop aspect ratio cleanly
          const dh = dw;
          const dx = Math.round((tx + 0.5) * tileSize - dw * 0.5) + swayDx;
          const dy = Math.round((ty + 0.94) * tileSize - dh);

          outSprites.push(
            buildSpriteCmd(this.manifest, 'props', regionId, dx, dy, dw, dh, {
              emissive: regionId === 'prop_crystal' || regionId === 'prop_mushroom' ? 0.25 : 0,
              depth: (ty + 0.92) * tileSize,
            }),
          );
        } else if (tileId === TILE.HEAL) {
          const dw = Math.round(tileSize * 1.44);
          const dh = Math.round(tileSize * 1.44);
          const dx = Math.round((tx + 0.5) * tileSize - dw * 0.5);
          const dy = Math.round((ty + 0.94) * tileSize - dh);
          outSprites.push(
            buildSpriteCmd(this.manifest, 'props', 'fountain', dx, dy, dw, dh, {
              emissive: 0.28,
              depth: (ty + 0.88) * tileSize,
            }),
          );
        } else if (tileId === TILE.LANTERN) {
          const dw = Math.round(tileSize * 1.12);
          const dh = Math.round(tileSize * 1.5);
          const dx = Math.round((tx + 0.5) * tileSize - dw * 0.5);
          const dy = Math.round((ty + 0.94) * tileSize - dh);
          outSprites.push(
            buildSpriteCmd(this.manifest, 'props', 'lantern', dx, dy, dw, dh, {
              emissive: 0.45,
              depth: (ty + 0.9) * tileSize,
            }),
          );
        } else if (tileId === TILE.SIGN) {
          const dw = Math.round(tileSize * 1.18);
          const dh = Math.round(tileSize * 1.18);
          const dx = Math.round((tx + 0.5) * tileSize - dw * 0.5);
          const dy = Math.round((ty + 0.92) * tileSize - dh);
          outSprites.push(
            buildSpriteCmd(this.manifest, 'props', 'signpost', dx, dy, dw, dh, {
              depth: (ty + 0.86) * tileSize,
            }),
          );
        }
      }
    }
  }

  /**
   * Renders grounded contact shadows beneath tile props & buildings, chimney smoke,
   * Secret Arcade star wall glimmer at (11, 12), and crisp procedural prop fallbacks
   * when the 'props' atlas is not attached.
   */
  renderPropShadowsAndEffects(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    landmarkTileKeys: Set<string>,
    phase: 'ground' | 'post',
  ): void {
    const { cols, rows, tileSize, worldMap, elapsedSeconds, reducedMotion, secretArcadeSpot } = state;
    const t = reducedMotion ? 0 : elapsedSeconds;
    const buildingCache = detectBuildingClusters(worldMap, cols, rows);
    const hasPropsAtlas = this.hasSheet('props');
    ctx.imageSmoothingEnabled = false;

    if (phase === 'ground') {
      for (const cluster of buildingCache.clusters) {
        const cx = (cluster.tx + cluster.widthTiles * 0.5) * tileSize;
        const baseY = (cluster.ty + cluster.heightTiles) * tileSize - 2;
        drawContactShadow(ctx, cx, baseY, cluster.widthTiles * tileSize * 0.52, 8, 0.36);

        if (!hasPropsAtlas) {
          this.drawFallbackCottage(ctx, cluster, tileSize);
        }
      }

      for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
        const row = worldMap[ty];
        if (!row) continue;
        for (let tx = bounds.minTx; tx <= bounds.maxTx; tx++) {
          const tileId = row[tx];
          const cx = (tx + 0.5) * tileSize;
          const baseY = (ty + 0.9) * tileSize;

          if (tileId === TILE.TREE && !landmarkTileKeys.has(`${tx},${ty}`)) {
            drawContactShadow(ctx, cx, baseY, tileSize * 0.44, 5, 0.32);
            if (!hasPropsAtlas) {
              const bId = getBiomeAt(tx, ty)?.id || state.currentBiomeId;
              this.drawFallbackTree(ctx, cx, baseY, tileSize, resolveTreePropRegion(bId));
            }
          } else if (tileId === TILE.HEAL) {
            drawContactShadow(ctx, cx, baseY, tileSize * 0.46, 5.5, 0.32);
            if (!hasPropsAtlas) {
              this.drawFallbackFountain(ctx, cx, baseY, tileSize, t);
            }
          } else if (tileId === TILE.LANTERN) {
            drawContactShadow(ctx, cx, baseY, tileSize * 0.28, 3.5, 0.28);
            if (!hasPropsAtlas) {
              this.drawFallbackLantern(ctx, cx, baseY, tileSize, t);
            }
          } else if (tileId === TILE.SIGN) {
            drawContactShadow(ctx, cx, baseY, tileSize * 0.3, 3.5, 0.28);
            if (!hasPropsAtlas) {
              this.drawFallbackSignpost(ctx, cx, baseY, tileSize);
            }
          }
        }
      }
      return;
    }

    // Post-sprite effects: cottage chimney smoke, fountain water shimmer, & Secret Arcade star glimmer
    for (const cluster of buildingCache.clusters) {
      const chimX = (cluster.tx + cluster.widthTiles * 0.72) * tileSize;
      const chimY = (cluster.ty - 0.55) * tileSize;
      const puffCount = reducedMotion ? 1 : 3;
      for (let i = 0; i < puffCount; i++) {
        const cycle = ((elapsedSeconds * 0.45 + i * 0.33) % 1);
        const sx = Math.round(chimX + Math.sin(cycle * Math.PI * 2 + i) * 4);
        const sy = Math.round(chimY - cycle * 18);
        ctx.fillStyle = `rgba(225, 234, 250, ${((1 - cycle) * 0.34).toFixed(3)})`;
        ctx.fillRect(sx - 3, sy - 3, 6, 5);
      }
    }

    // Secret Arcade Star Glimmer on Willow's Lab front wall (11, 12)
    if (
      secretArcadeSpot.x >= bounds.minTx - 1 &&
      secretArcadeSpot.x <= bounds.maxTx + 1 &&
      secretArcadeSpot.y >= bounds.minTy - 1 &&
      secretArcadeSpot.y <= bounds.maxTy + 1
    ) {
      const sx = (secretArcadeSpot.x + 0.5) * tileSize;
      const sy = (secretArcadeSpot.y + 0.42) * tileSize;
      const pulse = 0.65 + 0.35 * Math.sin(elapsedSeconds * 3.4);
      ctx.save();
      ctx.fillStyle = secretArcadeSpot.unlocked
        ? `rgba(124, 240, 255, ${(0.88 * pulse).toFixed(3)})`
        : `rgba(255, 224, 112, ${(0.8 * pulse).toFixed(3)})`;
      drawFourPointStar(ctx, sx, sy, 6 + pulse * 1.5, 2.2, t * 0.6);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 2);
      ctx.restore();
    }
  }

  /**
   * Renders crisp pixel-art parting tall grass blades across all 7 tall-grass tile types
   * using active spring displacements and proximity parting around player & follower.
   */
  renderPartingTallGrass(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
  ): void {
    const { cols, tileSize, worldMap, elapsedSeconds, reducedMotion, player, follower } = state;
    const t = reducedMotion ? elapsedSeconds * 0.2 : elapsedSeconds;
    ctx.imageSmoothingEnabled = false;

    for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
      const row = worldMap[ty];
      if (!row) continue;
      for (let tx = bounds.minTx; tx <= bounds.maxTx; tx++) {
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

          // Crisp stepped 3-segment pixel blade
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

  /**
   * Collects candidate PointLights from lanterns, healing fountains, cottage windows,
   * Secret Arcade star wall, crystals, and volcanic lava pockets.
   */
  collectPropLights(
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    camCenterX: number,
    camCenterY: number,
    out: LightCandidate[],
  ): void {
    const { cols, rows, tileSize, worldMap, timeOfDay, secretArcadeSpot } = state;
    const buildingCache = detectBuildingClusters(worldMap, cols, rows);
    const twilightBoost = 0.85 + 0.35 * clamp(Math.abs(timeOfDay - 0.5) * 2, 0, 1);

    const pushLight = (light: PointLight) => {
      const dx = light.x - camCenterX;
      const dy = light.y - camCenterY;
      out.push({ light, distSq: dx * dx + dy * dy });
    };

    // Cottage windows
    for (const cluster of buildingCache.clusters) {
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
        radius: tileSize * 3.4,
        color: [1.0, 0.82, 0.44],
        intensity: 1.05 * twilightBoost,
        flickerSpeed: 3.0,
        flickerAmount: 0.08,
      });
      pushLight({
        id: `${cluster.id}-win-r-${cluster.tx}`,
        x: cluster.tx * tileSize + w * 0.75,
        y: winY,
        radius: tileSize * 3.4,
        color: [1.0, 0.82, 0.44],
        intensity: 1.05 * twilightBoost,
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

    // Lanterns, Healing Fountains, Crystals, & Lava vents
    const minTx = Math.max(0, bounds.minTx - 2);
    const maxTx = Math.min(cols - 1, bounds.maxTx + 2);
    const minTy = Math.max(0, bounds.minTy - 2);
    const maxTy = Math.min(rows - 1, bounds.maxTy + 2);

    for (let ty = minTy; ty <= maxTy; ty++) {
      const row = worldMap[ty];
      if (!row) continue;
      for (let tx = minTx; tx <= maxTx; tx++) {
        const tileId = row[tx];
        const wx = (tx + 0.5) * tileSize;
        const wy = (ty + 0.45) * tileSize;

        if (tileId === TILE.LANTERN) {
          pushLight({
            id: `lantern-${tx}-${ty}`,
            x: wx,
            y: wy,
            radius: tileSize * 3.8,
            color: [1.0, 0.79, 0.38],
            intensity: 1.15 * twilightBoost,
            flickerSpeed: 3.5,
            flickerAmount: 0.11,
          });
        } else if (tileId === TILE.HEAL) {
          pushLight({
            id: `fountain-${tx}-${ty}`,
            x: wx,
            y: wy,
            radius: tileSize * 4.2,
            color: [0.32, 0.9, 1.0],
            intensity: 1.24 * twilightBoost,
            flickerSpeed: 2.3,
            flickerAmount: 0.08,
          });
        } else if (tileId === TILE.LAVA && (tx + ty) % 3 === 0) {
          pushLight({
            id: `lava-${tx}-${ty}`,
            x: wx,
            y: wy,
            radius: tileSize * 2.8,
            color: [1.0, 0.42, 0.14],
            intensity: 0.88 * twilightBoost,
            flickerSpeed: 4.1,
            flickerAmount: 0.14,
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
    ctx.fillStyle = `rgba(255, 218, 108, ${pulse.toFixed(3)})`;
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
