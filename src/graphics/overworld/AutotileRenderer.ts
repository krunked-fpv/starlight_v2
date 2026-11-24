import type {
  AtlasManifest,
  IRenderBackend,
  OverworldBiomeDescriptor,
  OverworldProp,
  OverworldSceneState,
  OverworldTileKind,
  GrassDisplacement,
  PointLight,
} from '../../contracts';

/** Canonical 47-tile blob bitmasks matching compute47BlobIndex in src/core/data/biomes.ts */
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
  fillEllipse(ctx, cx, cy + 1.5, rx * 1.08, ry * 1.12, `rgba(10, 14, 30, ${(alpha * 0.45).toFixed(3)})`);
  fillEllipse(ctx, cx, cy, rx, ry, `rgba(10, 14, 30, ${alpha.toFixed(3)})`);
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

const TERRAIN_COL_INDEX: Record<string, number> = {
  ground: 0,
  'tall-grass': 1,
  sand: 2,
  cobble: 3,
  cliff: 4,
  'shallow-water': 5,
  'deep-water': 6,
  bridge: 7,
  plaza: 8,
  flowerbed: 9,
  'shore-edge': 10,
  'cliff-top': 11,
};

function isWaterTile(kind: OverworldTileKind | undefined): boolean {
  return kind === 'shallow-water' || kind === 'deep-water';
}

function isLandTile(kind: OverworldTileKind | undefined): boolean {
  return (
    kind !== undefined &&
    kind !== 'shallow-water' &&
    kind !== 'deep-water' &&
    kind !== 'bridge'
  );
}

const EMISSIVE_PROP_KINDS = new Set<OverworldProp['kind']>([
  'lantern-post',
  'ember-vent',
  'spore-lantern',
  'crystal',
  'ruin-pillar',
  'gear-spire',
]);

export class AutotileRenderer {
  private manifest: AtlasManifest | null = null;
  private grassDisplacements = new Map<number, GrassDisplacement>();

  setManifest(manifest: AtlasManifest | null): void {
    this.manifest = manifest;
  }

  getManifest(): AtlasManifest | null {
    return this.manifest;
  }

  getDisplacementCount(): number {
    return this.grassDisplacements.size;
  }

  resetEffects(): void {
    this.grassDisplacements.clear();
  }

  /**
   * Updates spring-physics tall grass displacement around player, follower, and moving NPCs.
   */
  update(state: OverworldSceneState, dtSeconds: number): void {
    const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
    const { map, player, follower, npcs } = state;
    const { width, height, tiles } = map;

    const pushers: Array<{ x: number; y: number; weight: number }> = [
      { x: player.x, y: player.y, weight: player.moving ? 1.0 : 0.72 },
      { x: follower.x, y: follower.y, weight: follower.moving ? 0.85 : 0.6 },
    ];
    for (const npc of npcs) {
      if (npc.moving) {
        pushers.push({ x: npc.x, y: npc.y, weight: 0.7 });
      }
    }

    const activeSet = new Set<number>();
    const influenceRadius = 1.15;

    for (const pusher of pushers) {
      const minTx = Math.max(0, Math.floor(pusher.x - influenceRadius));
      const maxTx = Math.min(width - 1, Math.ceil(pusher.x + influenceRadius));
      const minTy = Math.max(0, Math.floor(pusher.y - influenceRadius));
      const maxTy = Math.min(height - 1, Math.ceil(pusher.y + influenceRadius));

      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          const idx = ty * width + tx;
          if (tiles[idx] !== 'tall-grass') continue;

          const cx = tx + 0.5;
          const cy = ty + 0.5;
          const dx = cx - pusher.x;
          const dy = cy - pusher.y;
          const dist = Math.hypot(dx, dy);
          if (dist >= influenceRadius) continue;

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
            existing.intensity = Math.max(existing.intensity, lerp(existing.intensity, targetIntensity, blend));
          } else {
            this.grassDisplacements.set(idx, {
              tileX: tx,
              tileY: ty,
              bendX: nx,
              bendY: ny,
              intensity: Math.max(0.25, targetIntensity),
            });
          }
        }
      }
    }

    // Smooth spring decay for non-occupied grass tiles
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
   * Emits base procedural terrain fallback, baked 'terrain' atlas sprites via drawSprite,
   * and translucent water quads via drawWaterQuad.
   */
  renderTerrainBaseAndWater(
    backend: IRenderBackend,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    camera: { camX: number; camY: number; camZoom: number },
  ): void {
    const { map, biome } = state;
    const { width, height, tileSize, tiles, autotileMasks } = map;

    // 1. Procedural fallback base so rendering stays rich even if atlases haven't loaded/registered
    backend.drawCustom2D((ctx, viewW, viewH) => {
      this.drawBaseTilesWithCamera(
        ctx,
        state,
        bounds,
        camera.camX,
        camera.camY,
        camera.camZoom,
        viewW,
        viewH,
      );
    }, 'world');

    // 2. Baked 'terrain' atlas sprite pass using biomeTileRowMap[biomeId] + tile column
    const terrainSheet = this.manifest?.sheets?.terrain;
    const biomeRow = this.manifest?.biomeTileRowMap?.[biome.id];
    if (terrainSheet && biomeRow !== undefined) {
      const sheetTile = terrainSheet.tileSize || 32;
      for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
        for (let tx = bounds.minTx; tx <= bounds.maxTx; tx++) {
          const idx = ty * width + tx;
          const kind = tiles[idx];
          if (isWaterTile(kind) || kind === 'bridge') {
            continue;
          }

          let colKey: string = kind;
          const blobMask = CANONICAL_47_MASKS[autotileMasks[idx] ?? 46] ?? 255;
          if (kind === 'cliff') {
            const hasS = (blobMask & 64) !== 0;
            colKey = hasS ? 'cliff-top' : 'cliff';
          } else if (kind === 'sand') {
            const southTile = ty + 1 < height ? tiles[(ty + 1) * width + tx] : undefined;
            if (isWaterTile(southTile)) {
              colKey = 'shore-edge';
            }
          }

          const regionId = `${biome.id}:${colKey}`;
          const region = terrainSheet.regions?.[regionId];
          const col = TERRAIN_COL_INDEX[colKey] ?? 0;
          const sx = region ? region.x : col * sheetTile;
          const sy = region ? region.y : biomeRow * sheetTile;
          const sw = region ? region.w : sheetTile;
          const sh = region ? region.h : sheetTile;

          backend.drawSprite({
            sheetId: 'terrain',
            regionId,
            sx,
            sy,
            sw,
            sh,
            dx: tx * tileSize,
            dy: ty * tileSize,
            dw: tileSize,
            dh: tileSize,
            depth: 0,
          });
        }
      }
    }

    // 3. Translucent multi-depth water pass (includes water underneath boardwalk bridges)
    for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
      for (let tx = bounds.minTx; tx <= bounds.maxTx; tx++) {
        const idx = ty * width + tx;
        const kind = tiles[idx];
        if (!isWaterTile(kind) && kind !== 'bridge') {
          continue;
        }

        const isDeep = kind === 'deep-water';
        let depthFactor = isDeep ? 0.86 : 0.24;
        if (kind === 'bridge') {
          const left = tx > 0 ? tiles[ty * width + (tx - 1)] : undefined;
          depthFactor = left === 'deep-water' ? 0.72 : 0.3;
        }

        // Compute cardinal land adjacency mask: N=1, E=2, S=4, W=8
        let cardinalMask = 0;
        if (ty > 0 && isLandTile(tiles[(ty - 1) * width + tx])) cardinalMask |= 1;
        if (tx + 1 < width && isLandTile(tiles[ty * width + (tx + 1)])) cardinalMask |= 2;
        if (ty + 1 < height && isLandTile(tiles[(ty + 1) * width + tx])) cardinalMask |= 4;
        if (tx > 0 && isLandTile(tiles[ty * width + (tx - 1)])) cardinalMask |= 8;

        // Both Canvas2DBackend & WATER_SHADER trigger 4-bit cardinal mask when foamMask > 1.01
        // and scalar foam intensity when 0 < foamMask <= 1.01 (which handles N-only shores cleanly)
        const foamMask =
          cardinalMask === 0
            ? isDeep
              ? 0
              : 0.14
            : cardinalMask === 1
              ? 0.94
              : cardinalMask;

        backend.drawWaterQuad(
          tx * tileSize,
          ty * tileSize,
          tileSize,
          tileSize,
          depthFactor,
          foamMask,
        );
      }
    }
  }

  drawBaseTilesWithCamera(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    camX: number,
    camY: number,
    camZoom: number,
    viewW: number,
    viewH: number,
  ): void {
    const { map, biome } = state;
    const { width, tileSize, tiles } = map;
    const groundRgb = hexToRgb255(biome.groundHex);
    const grassRgb = hexToRgb255(biome.grassHex);
    const cliffRgb = hexToRgb255(biome.cliffHex);
    const accentRgb = hexToRgb255(biome.accentHex);

    ctx.save();
    ctx.translate(viewW * 0.5, viewH * 0.5);
    if (camZoom !== 1) ctx.scale(camZoom, camZoom);
    ctx.translate(-viewW * 0.5 - camX, -viewH * 0.5 - camY);

    const sandBase = mixRgb(groundRgb, [224, 198, 144], biome.id === 'frost-glacier' ? 0.25 : 0.65);
    const cobbleBase = mixRgb(cliffRgb, [156, 162, 176], 0.48);
    const plazaBase = mixRgb(cliffRgb, [196, 204, 224], 0.62);

    for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
      for (let tx = bounds.minTx; tx <= bounds.maxTx; tx++) {
        const kind = tiles[ty * width + tx];
        if (isWaterTile(kind) || kind === 'bridge') continue;

        const px = tx * tileSize;
        const py = ty * tileSize;
        const jitter = hash2D(tx, ty, 3) * 0.14 - 0.07;

        let fillRgb = groundRgb;
        if (kind === 'tall-grass') {
          fillRgb = mixRgb(shadeRgb(groundRgb, 0.78), grassRgb, 0.55);
        } else if (kind === 'sand') {
          fillRgb = shadeRgb(sandBase, 1 + jitter * 0.7);
        } else if (kind === 'cobble') {
          fillRgb = shadeRgb(cobbleBase, 0.94 + jitter * 0.5);
        } else if (kind === 'cliff') {
          fillRgb = shadeRgb(cliffRgb, 0.92 + jitter * 0.4);
        } else if (kind === 'plaza') {
          fillRgb = shadeRgb(plazaBase, 0.96 + jitter * 0.3);
        } else if (kind === 'flowerbed') {
          fillRgb = mixRgb(groundRgb, grassRgb, 0.48);
        } else {
          fillRgb = shadeRgb(groundRgb, 0.96 + jitter);
        }

        ctx.fillStyle = rgb255ToStr(fillRgb);
        ctx.fillRect(px, py, tileSize + 0.5, tileSize + 0.5);

        // Subtle organic soil/tuft pebble speckle for ground tiles
        if (kind === 'ground' && hash2D(tx, ty, 19) > 0.45) {
          const speck = mixRgb(fillRgb, accentRgb, 0.18);
          ctx.fillStyle = rgb255ToStr(speck, 0.45);
          ctx.fillRect(px + 8 + hash2D(tx, ty, 21) * 20, py + 10 + hash2D(tx, ty, 22) * 20, 4, 3);
        }
      }
    }

    ctx.restore();
  }

  /**
   * Draws multi-layered 47-tile autotile detail overlays:
   * - Shoreline bevels & animated surf lace
   * - Grounded cliff faces & south drop-shadows
   * - Cobblestone beveled stones & mortar seams
   * - Wooden bridge planks, pilings & handrails over water
   * - Star-inlaid plaza masonry & celestial shimmer
   * - Flowerbed petals
   */
  renderTerrainDetailOverlays(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
  ): void {
    const { map, biome, elapsedSeconds, reducedMotion } = state;
    const { width, height, tileSize, tiles, autotileMasks } = map;
    const t = reducedMotion ? elapsedSeconds * 0.25 : elapsedSeconds;

    const groundRgb = hexToRgb255(biome.groundHex);
    const grassRgb = hexToRgb255(biome.grassHex);
    const cliffRgb = hexToRgb255(biome.cliffHex);
    const accentRgb = hexToRgb255(biome.accentHex);
    const shallowRgb = hexToRgb255(biome.waterShallowHex);

    for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
      for (let tx = bounds.minTx; tx <= bounds.maxTx; tx++) {
        const idx = ty * width + tx;
        const kind = tiles[idx];
        const px = tx * tileSize;
        const py = ty * tileSize;
        const blobIdx = autotileMasks[idx] ?? 46;
        const mask = CANONICAL_47_MASKS[blobIdx] ?? 255;

        const hasNW = (mask & 1) !== 0;
        const hasN = (mask & 2) !== 0;
        const hasNE = (mask & 4) !== 0;
        const hasW = (mask & 8) !== 0;
        const hasE = (mask & 16) !== 0;
        const hasSW = (mask & 32) !== 0;
        const hasS = (mask & 64) !== 0;
        const hasSE = (mask & 128) !== 0;

        const southKind = ty + 1 < height ? tiles[(ty + 1) * width + tx] : undefined;
        const northKind = ty > 0 ? tiles[(ty - 1) * width + tx] : undefined;
        const westKind = tx > 0 ? tiles[ty * width + (tx - 1)] : undefined;
        const eastKind = tx + 1 < width ? tiles[ty * width + (tx + 1)] : undefined;

        if (kind === 'cliff') {
          this.drawCliffTileDetail(ctx, px, py, tileSize, hasN, hasS, hasW, hasE, hasSW, hasSE, cliffRgb, grassRgb, southKind);
        } else if (kind === 'cobble') {
          this.drawCobbleTileDetail(ctx, px, py, tileSize, tx, ty, hasN, hasS, hasW, hasE, cliffRgb);
        } else if (kind === 'plaza') {
          this.drawPlazaTileDetail(ctx, px, py, tileSize, tx, ty, hasN, hasS, hasW, hasE, hasNW, hasNE, hasSW, hasSE, cliffRgb, accentRgb, t);
        } else if (kind === 'bridge') {
          this.drawBridgeTileDetail(ctx, px, py, tileSize, tx, ty, northKind, southKind, westKind, eastKind);
        } else if (kind === 'sand') {
          this.drawSandShoreDetail(ctx, px, py, tileSize, tx, ty, hasN, hasW, hasE, northKind, southKind, westKind, eastKind, groundRgb, shallowRgb, t);
        } else if (kind === 'flowerbed') {
          this.drawFlowerbedDetail(ctx, px, py, tileSize, tx, ty, grassRgb, accentRgb, t);
        } else if (kind === 'ground') {
          // Subtle transition shadow from north cliff or adjacent raised road
          if (northKind === 'cliff') {
            const grad = ctx.createLinearGradient(px, py, px, py + 15);
            grad.addColorStop(0, 'rgba(8, 12, 26, 0.42)');
            grad.addColorStop(1, 'rgba(8, 12, 26, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(px, py, tileSize, 15);
          }
          if (isWaterTile(southKind)) {
            this.drawShoreRim(ctx, px, py + tileSize - 7, tileSize, 7, groundRgb, shallowRgb, t, tx);
          }
        } else if (isWaterTile(kind)) {
          // Extra surf lace along water edges touching sand/ground
          if (isLandTile(northKind)) {
            const wave = Math.sin(t * 2.8 + tx * 0.9) * 2.2;
            ctx.fillStyle = 'rgba(235, 250, 255, 0.44)';
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.quadraticCurveTo(px + tileSize * 0.25, py + 5 + wave, px + tileSize * 0.5, py + 3 - wave * 0.5);
            ctx.quadraticCurveTo(px + tileSize * 0.75, py + 1 + wave, px + tileSize, py + 4);
            ctx.lineTo(px + tileSize, py);
            ctx.closePath();
            ctx.fill();
          }
          if (isLandTile(westKind)) {
            ctx.fillStyle = 'rgba(235, 250, 255, 0.30)';
            ctx.fillRect(px, py, 4, tileSize);
          }
          if (isLandTile(eastKind)) {
            ctx.fillStyle = 'rgba(235, 250, 255, 0.30)';
            ctx.fillRect(px + tileSize - 4, py, 4, tileSize);
          }
        }
      }
    }
  }

  private drawCliffTileDetail(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    hasN: boolean,
    hasS: boolean,
    hasW: boolean,
    hasE: boolean,
    hasSW: boolean,
    hasSE: boolean,
    cliffRgb: Rgb255,
    grassRgb: Rgb255,
    southKind: OverworldTileKind | undefined,
  ): void {
    const faceDark = rgb255ToStr(shadeRgb(cliffRgb, 0.56), 0.72);
    const faceMid = rgb255ToStr(shadeRgb(cliffRgb, 0.78), 0.55);
    const rimLight = rgb255ToStr(mixRgb(cliffRgb, grassRgb, 0.52), 0.78);

    if (!hasS) {
      // Sculpted rocky cliff front face + south drop shadow onto tile below
      ctx.fillStyle = faceDark;
      ctx.fillRect(px, py + tileSize * 0.48, tileSize, tileSize * 0.52);

      // Vertical strata cracks
      ctx.strokeStyle = 'rgba(14, 16, 28, 0.38)';
      ctx.lineWidth = 1.5;
      for (let i = 1; i <= 3; i++) {
        const cx = px + i * (tileSize * 0.25);
        ctx.beginPath();
        ctx.moveTo(cx, py + tileSize * 0.5);
        ctx.lineTo(cx + (i % 2 === 0 ? 2 : -2), py + tileSize - 1);
        ctx.stroke();
      }

      // Overhanging mossy/grass crest along cliff lip
      ctx.fillStyle = rimLight;
      ctx.fillRect(px, py + tileSize * 0.38, tileSize, 5);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(px, py + tileSize * 0.36, tileSize, 2);

      // Grounded drop shadow cast onto south tile
      if (southKind && southKind !== 'cliff') {
        const grad = ctx.createLinearGradient(px, py + tileSize, px, py + tileSize + 14);
        grad.addColorStop(0, 'rgba(8, 10, 24, 0.48)');
        grad.addColorStop(1, 'rgba(8, 10, 24, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(px, py + tileSize, tileSize, 14);
      }
    } else if (!hasN) {
      // Northern cliff crest rim
      ctx.fillStyle = rimLight;
      ctx.fillRect(px, py, tileSize, 5);
    }

    if (!hasW) {
      ctx.fillStyle = faceMid;
      ctx.fillRect(px, py, 4, tileSize);
    }
    if (!hasE) {
      ctx.fillStyle = faceDark;
      ctx.fillRect(px + tileSize - 4, py, 4, tileSize);
    }
    if (hasS && hasW && !hasSW) {
      ctx.fillStyle = faceDark;
      ctx.fillRect(px, py + tileSize - 6, 6, 6);
    }
    if (hasS && hasE && !hasSE) {
      ctx.fillStyle = faceDark;
      ctx.fillRect(px + tileSize - 6, py + tileSize - 6, 6, 6);
    }
  }

  private drawCobbleTileDetail(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    tx: number,
    ty: number,
    hasN: boolean,
    hasS: boolean,
    hasW: boolean,
    hasE: boolean,
    cliffRgb: Rgb255,
  ): void {
    // Crisp staggered cobblestone seams & bevels
    const seamCol = rgb255ToStr(shadeRgb(cliffRgb, 0.42), 0.46);
    const hiCol = 'rgba(245, 248, 255, 0.16)';
    const step = tileSize / 3;

    ctx.strokeStyle = seamCol;
    ctx.lineWidth = 1.2;
    for (let r = 0; r < 3; r++) {
      const sy = py + r * step;
      ctx.beginPath();
      ctx.moveTo(px + 1, sy);
      ctx.lineTo(px + tileSize - 1, sy);
      ctx.stroke();

      const offset = r % 2 === 1 ? step * 0.5 : 0;
      for (let c = 0; c < 3; c++) {
        const sx = px + ((c * step + offset) % tileSize);
        ctx.beginPath();
        ctx.moveTo(sx, sy + 1);
        ctx.lineTo(sx, sy + step - 1);
        ctx.stroke();

        // Highlight pebble corner
        if (hash2D(tx * 3 + c, ty * 3 + r, 41) > 0.35) {
          ctx.fillStyle = hiCol;
          ctx.fillRect(sx + 2, sy + 2, step * 0.45, 2);
        }
      }
    }

    // 47-tile curb bevels along road edges
    const curb = 'rgba(26, 30, 48, 0.36)';
    const curbHi = 'rgba(255, 248, 232, 0.22)';
    if (!hasN) {
      ctx.fillStyle = curb;
      ctx.fillRect(px, py, tileSize, 3);
      ctx.fillStyle = curbHi;
      ctx.fillRect(px, py + 3, tileSize, 1.5);
    }
    if (!hasS) {
      ctx.fillStyle = curb;
      ctx.fillRect(px, py + tileSize - 3, tileSize, 3);
    }
    if (!hasW) {
      ctx.fillStyle = curb;
      ctx.fillRect(px, py, 3, tileSize);
    }
    if (!hasE) {
      ctx.fillStyle = curb;
      ctx.fillRect(px + tileSize - 3, py, 3, tileSize);
    }
  }

  private drawPlazaTileDetail(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    tx: number,
    ty: number,
    hasN: boolean,
    hasS: boolean,
    hasW: boolean,
    hasE: boolean,
    hasNW: boolean,
    hasNE: boolean,
    hasSW: boolean,
    hasSE: boolean,
    cliffRgb: Rgb255,
    accentRgb: Rgb255,
    t: number,
  ): void {
    // Dressed starstone border + star inlay
    ctx.strokeStyle = rgb255ToStr(shadeRgb(cliffRgb, 0.5), 0.38);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);

    const cx = px + tileSize * 0.5;
    const cy = py + tileSize * 0.5;
    const shimmer = 0.32 + 0.18 * Math.sin(t * 2.1 + tx * 0.7 + ty * 0.5);

    // Subtle geometric ring + 4-point celestial star inlay
    ctx.strokeStyle = rgb255ToStr(accentRgb, shimmer * 0.65);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, tileSize * 0.31, 0, Math.PI * 2);
    ctx.stroke();

    if ((tx + ty) % 2 === 0) {
      ctx.fillStyle = rgb255ToStr(accentRgb, shimmer);
      drawFourPointStar(ctx, cx, cy, tileSize * 0.19, tileSize * 0.06, 0);
      ctx.fill();
    }

    // Raised beveled curb on outer plaza perimeter
    ctx.fillStyle = 'rgba(245, 240, 255, 0.25)';
    if (!hasN) ctx.fillRect(px, py, tileSize, 3);
    if (!hasW) ctx.fillRect(px, py, 3, tileSize);
    ctx.fillStyle = 'rgba(18, 22, 42, 0.34)';
    if (!hasS) ctx.fillRect(px, py + tileSize - 3, tileSize, 3);
    if (!hasE) ctx.fillRect(px + tileSize - 3, py, 3, tileSize);

    // Inner corner bevel notches
    if (hasN && hasW && !hasNW) ctx.fillRect(px, py, 4, 4);
    if (hasN && hasE && !hasNE) ctx.fillRect(px + tileSize - 4, py, 4, 4);
    if (hasS && hasW && !hasSW) ctx.fillRect(px, py + tileSize - 4, 4, 4);
    if (hasS && hasE && !hasSE) ctx.fillRect(px + tileSize - 4, py + tileSize - 4, 4, 4);
  }

  private drawBridgeTileDetail(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    tx: number,
    ty: number,
    northKind: OverworldTileKind | undefined,
    southKind: OverworldTileKind | undefined,
    westKind: OverworldTileKind | undefined,
    eastKind: OverworldTileKind | undefined,
  ): void {
    const isLeftRail = westKind !== 'bridge';
    const isRightRail = eastKind !== 'bridge';
    const isTopEdge = northKind !== 'bridge';
    const isBottomEdge = southKind !== 'bridge';
    void tx;

    const insetL = isLeftRail ? 4 : 0;
    const insetR = isRightRail ? 4 : 0;
    const deckX = px + insetL;
    const deckW = tileSize - insetL - insetR;

    // Water shadow underneath bridge
    ctx.fillStyle = 'rgba(6, 14, 34, 0.36)';
    ctx.fillRect(deckX + 2, py + 4, deckW, tileSize + 2);

    // Timber pilings visible on side edges
    if (isLeftRail) {
      ctx.fillStyle = '#573923';
      ctx.fillRect(px + 2, py + 4, 5, tileSize - 4);
      ctx.fillStyle = 'rgba(235, 250, 255, 0.45)';
      ctx.fillRect(px + 1, py + tileSize - 4, 7, 2);
    }
    if (isRightRail) {
      ctx.fillStyle = '#573923';
      ctx.fillRect(px + tileSize - 7, py + 4, 5, tileSize - 4);
      ctx.fillStyle = 'rgba(235, 250, 255, 0.45)';
      ctx.fillRect(px + tileSize - 8, py + tileSize - 4, 7, 2);
    }

    // Wooden boardwalk planks
    const plankCount = 5;
    const plankH = tileSize / plankCount;
    for (let i = 0; i < plankCount; i++) {
      const sy = py + i * plankH;
      const shade = i % 2 === 0 ? '#9e6c43' : '#8c5d37';
      ctx.fillStyle = shade;
      ctx.fillRect(deckX, sy, deckW, plankH - 1.4);
      ctx.fillStyle = 'rgba(255, 224, 178, 0.16)';
      ctx.fillRect(deckX, sy, deckW, 1.5);
      ctx.fillStyle = '#3b2414';
      ctx.fillRect(deckX, sy + plankH - 1.4, deckW, 1.4);

      // Brass rivet nails
      ctx.fillStyle = '#f2cc7e';
      if (isLeftRail) ctx.fillRect(deckX + 3, sy + plankH * 0.35, 2, 2);
      if (isRightRail) ctx.fillRect(deckX + deckW - 5, sy + plankH * 0.35, 2, 2);
    }

    // Side handrails & corner posts
    if (isLeftRail) {
      ctx.fillStyle = '#6e472a';
      ctx.fillRect(px + 2, py, 4, tileSize);
      ctx.fillStyle = '#c48f5a';
      ctx.fillRect(px + 2, py, 2, tileSize);
      if (isTopEdge || isBottomEdge || ty % 2 === 0) {
        ctx.fillStyle = '#4a2e1a';
        ctx.fillRect(px + 1, py + 2, 6, 7);
        ctx.fillStyle = '#ffd985';
        ctx.fillRect(px + 2, py + 3, 4, 2);
      }
    }
    if (isRightRail) {
      ctx.fillStyle = '#6e472a';
      ctx.fillRect(px + tileSize - 6, py, 4, tileSize);
      ctx.fillStyle = '#c48f5a';
      ctx.fillRect(px + tileSize - 6, py, 2, tileSize);
      if (isTopEdge || isBottomEdge || ty % 2 === 0) {
        ctx.fillStyle = '#4a2e1a';
        ctx.fillRect(px + tileSize - 7, py + 2, 6, 7);
        ctx.fillStyle = '#ffd985';
        ctx.fillRect(px + tileSize - 6, py + 3, 4, 2);
      }
    }
  }

  private drawSandShoreDetail(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    tx: number,
    ty: number,
    hasN: boolean,
    hasW: boolean,
    hasE: boolean,
    northKind: OverworldTileKind | undefined,
    southKind: OverworldTileKind | undefined,
    westKind: OverworldTileKind | undefined,
    eastKind: OverworldTileKind | undefined,
    groundRgb: Rgb255,
    shallowRgb: Rgb255,
    t: number,
  ): void {
    // Organic dune ripple line
    ctx.strokeStyle = 'rgba(255, 246, 214, 0.24)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px + 4, py + tileSize * 0.38);
    ctx.quadraticCurveTo(px + tileSize * 0.5, py + tileSize * 0.28, px + tileSize - 4, py + tileSize * 0.42);
    ctx.stroke();

    // Soft blend from northern ground onto sand
    if (!hasN && northKind === 'ground') {
      const grad = ctx.createLinearGradient(px, py, px, py + 10);
      grad.addColorStop(0, rgb255ToStr(groundRgb, 0.72));
      grad.addColorStop(1, rgb255ToStr(groundRgb, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(px, py, tileSize, 10);
    }
    if (!hasW && westKind === 'ground') {
      ctx.fillStyle = rgb255ToStr(groundRgb, 0.38);
      ctx.fillRect(px, py, 5, tileSize);
    }
    if (!hasE && eastKind === 'ground') {
      ctx.fillStyle = rgb255ToStr(groundRgb, 0.38);
      ctx.fillRect(px + tileSize - 5, py, 5, tileSize);
    }

    if (isWaterTile(southKind)) {
      this.drawShoreRim(ctx, px, py + tileSize - 8, tileSize, 8, groundRgb, shallowRgb, t, tx + ty);
    }
  }

  private drawShoreRim(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    w: number,
    h: number,
    sandRgb: Rgb255,
    shallowRgb: Rgb255,
    t: number,
    seed: number,
  ): void {
    const wave = Math.sin(t * 2.5 + seed * 0.85) * 1.6;
    ctx.fillStyle = rgb255ToStr(shadeRgb(sandRgb, 0.74), 0.55);
    ctx.fillRect(px, py, w, h * 0.55);

    ctx.fillStyle = rgb255ToStr(mixRgb(shallowRgb, [242, 252, 255], 0.78), 0.74);
    ctx.beginPath();
    ctx.moveTo(px, py + h * 0.5 + wave * 0.5);
    ctx.quadraticCurveTo(px + w * 0.3, py + h * 0.25 - wave, px + w * 0.65, py + h * 0.55 + wave);
    ctx.lineTo(px + w, py + h * 0.45);
    ctx.lineTo(px + w, py + h);
    ctx.lineTo(px, py + h);
    ctx.closePath();
    ctx.fill();
  }

  private drawFlowerbedDetail(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileSize: number,
    tx: number,
    ty: number,
    grassRgb: Rgb255,
    accentRgb: Rgb255,
    t: number,
  ): void {
    // Bordered lush planter bed with swaying multi-petal flowers
    ctx.strokeStyle = rgb255ToStr(shadeRgb(grassRgb, 0.68), 0.65);
    ctx.lineWidth = 1.5;
    roundedRectPath(ctx, px + 3, py + 3, tileSize - 6, tileSize - 6, 5);
    ctx.stroke();

    const petalAlt = mixRgb(accentRgb, [255, 255, 255], 0.48);
    for (let i = 0; i < 6; i++) {
      const fx = px + 8 + hash2D(tx, ty, 70 + i) * (tileSize - 16);
      const fy = py + 8 + hash2D(tx, ty, 90 + i) * (tileSize - 16);
      const sway = Math.sin(t * 2.4 + tx + ty + i * 1.3) * 1.4;
      const col = i % 2 === 0 ? accentRgb : petalAlt;

      ctx.fillStyle = rgb255ToStr(col, 0.95);
      for (let p = 0; p < 4; p++) {
        const ang = (p * Math.PI) / 2 + i * 0.4;
        ctx.beginPath();
        ctx.arc(fx + sway + Math.cos(ang) * 2.3, fy + Math.sin(ang) * 2.3, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#fff3a8';
      ctx.beginPath();
      ctx.arc(fx + sway, fy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Renders a layered row of tall grass blades for either the 'back' layer (behind boots)
   * or 'front' layer (in front of boots) with spring displacement parting.
   */
  renderTallGrassLayer(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    tx: number,
    ty: number,
    layer: 'back' | 'front',
  ): void {
    const { map, biome, elapsedSeconds, reducedMotion } = state;
    const { tileSize, width } = map;
    const idx = ty * width + tx;
    const disp = this.grassDisplacements.get(idx);

    const px = tx * tileSize;
    const py = ty * tileSize;
    const t = reducedMotion ? elapsedSeconds * 0.2 : elapsedSeconds;

    const grassRgb = hexToRgb255(biome.grassHex);
    const accentRgb = hexToRgb255(biome.accentHex);
    const baseDark = rgb255ToStr(shadeRgb(grassRgb, 0.62));
    const midCol = rgb255ToStr(shadeRgb(grassRgb, 1.12));
    const tipCol = rgb255ToStr(mixRgb(grassRgb, accentRgb, 0.44));

    const bladeCount = layer === 'back' ? 5 : 6;
    const baseY = layer === 'back' ? py + tileSize * 0.48 : py + tileSize * 0.88;
    const maxH = tileSize * (layer === 'back' ? 0.42 : 0.46);

    const bendX = disp ? disp.bendX * disp.intensity * 13 : 0;
    const bendY = disp ? disp.bendY * disp.intensity * 4.5 : 0;

    for (let i = 0; i < bladeCount; i++) {
      const seed = (layer === 'back' ? 10 : 50) + i;
      const frac = (i + 0.5) / bladeCount;
      const bx = px + 4 + frac * (tileSize - 8) + (hash2D(tx, ty, seed) - 0.5) * 4;
      const by = baseY + (hash2D(tx, ty, seed + 1) - 0.5) * 5;
      const bh = maxH * (0.78 + hash2D(tx, ty, seed + 2) * 0.34);

      const wind = Math.sin(t * 2.3 + tx * 0.8 + ty * 0.5 + i * 0.9) * (reducedMotion ? 0.6 : 2.6);
      const naturalLean = (i % 2 === 0 ? 1 : -1) * 2.4;

      // Local parting away from player/follower inside this tile
      let localPartX = bendX;
      const dxPlayer = bx / tileSize - state.player.x;
      const dyPlayer = by / tileSize - state.player.y;
      const distPlayer = Math.hypot(dxPlayer, dyPlayer);
      if (distPlayer < 0.95) {
        const push = (1 - distPlayer / 0.95) * 10;
        localPartX += (dxPlayer >= 0 ? 1 : -1) * push;
      }

      const tipX = bx + naturalLean + wind + localPartX;
      const tipY = by - bh + Math.abs(localPartX) * 0.25 + bendY;
      const ctrlX = bx + (tipX - bx) * 0.45;
      const ctrlY = by - bh * 0.58;

      // Blade shadow stroke
      ctx.fillStyle = baseDark;
      ctx.beginPath();
      ctx.moveTo(bx - 2.8, by);
      ctx.quadraticCurveTo(ctrlX - 1.2, ctrlY, tipX, tipY);
      ctx.quadraticCurveTo(ctrlX + 1.8, ctrlY, bx + 2.8, by);
      ctx.closePath();
      ctx.fill();

      // Sunlit upper blade layer
      ctx.fillStyle = i % 3 === 0 ? tipCol : midCol;
      ctx.beginPath();
      ctx.moveTo(bx - 1.8, by - 1);
      ctx.quadraticCurveTo(ctrlX - 0.6, ctrlY, tipX, tipY);
      ctx.quadraticCurveTo(ctrlX + 1.0, ctrlY, bx + 1.6, by - 1);
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * Collects optional soft point lights from emissive biome signature micro-props.
   */
  collectPropLights(
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    out: PointLight[],
    maxRemaining: number,
  ): void {
    if (maxRemaining <= 0) return;
    const { map, biome } = state;
    const { tileSize, props } = map;

    for (const prop of props) {
      if (out.length >= maxRemaining) break;
      if (!EMISSIVE_PROP_KINDS.has(prop.kind)) continue;
      if (
        prop.tileX < bounds.minTx - 1 ||
        prop.tileX > bounds.maxTx + 1 ||
        prop.tileY < bounds.minTy - 1 ||
        prop.tileY > bounds.maxTy + 1
      ) {
        continue;
      }

      const wx = (prop.tileX + 0.5) * tileSize;
      const wy = (prop.tileY + 0.35) * tileSize;
      let color = hexToRgb01(prop.glowHex ?? biome.accentHex);
      let radius = 95 * prop.scale;
      let intensity = 0.72;
      let flickerSpeed = 2.8;
      let flickerAmount = 0.08;

      if (prop.kind === 'lantern-post') {
        color = [1.0, 0.82, 0.44];
        radius = 128 * prop.scale;
        intensity = 0.95;
        flickerSpeed = 3.6;
        flickerAmount = 0.1;
      } else if (prop.kind === 'ember-vent') {
        color = [1.0, 0.48, 0.18];
        radius = 115 * prop.scale;
        intensity = 0.92;
        flickerSpeed = 4.4;
        flickerAmount = 0.15;
      } else if (prop.kind === 'spore-lantern') {
        color = [0.82, 0.48, 1.0];
        radius = 105 * prop.scale;
        intensity = 0.85;
      }

      out.push({
        id: `prop-light-${prop.id}`,
        x: wx,
        y: wy,
        radius,
        color,
        intensity,
        flickerSpeed,
        flickerAmount,
      });
    }
  }

  /**
   * Renders any of the 12 biome signature micro-props with grounded contact shadows and wind sway.
   */
  renderProp(
    ctx: CanvasRenderingContext2D,
    prop: OverworldProp,
    biome: OverworldBiomeDescriptor,
    tileSize: number,
    elapsedSeconds: number,
    reducedMotion: boolean,
  ): void {
    const cx = (prop.tileX + 0.5) * tileSize;
    const baseY = (prop.tileY + 0.82) * tileSize;
    const s = clamp(prop.scale, 0.6, 1.6);
    const t = reducedMotion ? elapsedSeconds * 0.2 : elapsedSeconds;
    const sway = Math.sin(t * 1.9 + prop.swayPhase) * (reducedMotion ? 0.5 : 2.5) * s;
    const accent = prop.glowHex ?? biome.accentHex;
    const accentRgb = hexToRgb255(accent);

    drawContactShadow(ctx, cx, baseY, 15 * s, 5.5 * s, 0.34);

    ctx.save();
    ctx.translate(cx, baseY);
    ctx.scale(s, s);

    switch (prop.kind) {
      case 'crystal': {
        const cMain = mixRgb(accentRgb, [130, 232, 255], 0.45);
        const cLight = shadeRgb(cMain, 1.25, 24);
        const cDark = shadeRgb(cMain, 0.65);

        const shards: Array<[number, number, number, number]> = [
          [-9, -22, 7, 0.25],
          [8, -19, 6, -0.22],
          [0, -32, 9, 0],
        ];
        for (const [ox, h, w, lean] of shards) {
          ctx.save();
          ctx.translate(ox, 0);
          ctx.rotate(lean + sway * 0.01);
          ctx.fillStyle = rgb255ToStr(cDark);
          ctx.beginPath();
          ctx.moveTo(-w * 0.5, 0);
          ctx.lineTo(-w * 0.36, h * 0.68);
          ctx.lineTo(0, h);
          ctx.lineTo(w * 0.42, h * 0.65);
          ctx.lineTo(w * 0.5, 0);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = rgb255ToStr(cMain);
          ctx.beginPath();
          ctx.moveTo(-w * 0.42, 0);
          ctx.lineTo(-w * 0.3, h * 0.66);
          ctx.lineTo(0, h);
          ctx.lineTo(0, 0);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = rgb255ToStr(cLight, 0.85);
          ctx.beginPath();
          ctx.moveTo(-w * 0.14, h * 0.16);
          ctx.lineTo(0, h * 0.92);
          ctx.lineTo(w * 0.12, h * 0.6);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        break;
      }

      case 'ember-vent': {
        fillEllipse(ctx, 0, -2, 17, 9, '#3b2422');
        fillEllipse(ctx, 0, -7, 13, 6.5, '#54332d');
        const pulse = 0.82 + 0.18 * Math.sin(t * 4.2 + prop.swayPhase);
        fillEllipse(ctx, 0, -8, 8 * pulse, 3.6 * pulse, '#ff6d2e');
        fillEllipse(ctx, 0, -8, 4.4 * pulse, 2 * pulse, '#ffe078');
        // Rising ember sparks
        for (let i = 0; i < 3; i++) {
          const ey = -14 - ((t * 14 + i * 7 + prop.swayPhase * 4) % 18);
          const ex = Math.sin(t * 2.5 + i * 2.1) * 5;
          ctx.fillStyle = 'rgba(255, 206, 98, 0.85)';
          ctx.beginPath();
          ctx.arc(ex, ey, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'spore-lantern': {
        ctx.strokeStyle = '#d4c2f0';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(sway * 0.8, -14, sway, -24);
        ctx.stroke();

        // Bioluminescent mushroom cap
        fillEllipse(ctx, sway, -24, 15, 7, '#6d30ad');
        fillEllipse(ctx, sway, -21, 12, 3.5, rgb255ToStr(accentRgb, 0.92));
        ctx.fillStyle = 'rgba(248, 224, 255, 0.88)';
        ctx.beginPath();
        ctx.arc(sway - 6, -26, 2.2, 0, Math.PI * 2);
        ctx.arc(sway + 5, -25, 1.8, 0, Math.PI * 2);
        ctx.arc(sway, -28, 1.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'coral': {
        const branches: Array<[number, number, number, number, string]> = [
          [0, 0, -11 + sway * 0.5, -24, '#ff78a8'],
          [0, -4, 11 + sway * 0.6, -26, '#5cd8eb'],
          [0, -2, sway * 0.4, -31, '#ffa0c4'],
        ];
        for (const [x0, y0, x1, y1, col] of branches) {
          ctx.strokeStyle = col;
          ctx.lineWidth = 4.2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(x1 * 0.3, y1 * 0.6, x1, y1);
          ctx.stroke();

          ctx.fillStyle = '#fff0f7';
          ctx.beginPath();
          ctx.arc(x1, y1, 3.3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'ruin-pillar': {
        const stone = mixRgb(hexToRgb255(biome.cliffHex), [132, 126, 168], 0.55);
        ctx.fillStyle = rgb255ToStr(shadeRgb(stone, 0.72));
        ctx.fillRect(-11, -5, 22, 6);
        ctx.fillStyle = rgb255ToStr(stone);
        ctx.fillRect(-8, -34, 16, 29);
        ctx.fillStyle = rgb255ToStr(shadeRgb(stone, 1.2));
        ctx.fillRect(-10, -37, 20, 5);
        // Glowing carved rune
        const pulse = 0.65 + 0.35 * Math.sin(t * 2.5 + prop.swayPhase);
        ctx.fillStyle = rgb255ToStr(accentRgb, pulse);
        ctx.fillRect(-4, -26, 8, 2.2);
        ctx.fillRect(-1.2, -26, 2.4, 9);
        ctx.fillRect(-4, -14, 8, 2.2);
        break;
      }

      case 'bamboo': {
        const stalks: Array<[number, number, number]> = [
          [-7, 32, 0.6],
          [0, 38, 0.85],
          [7, 29, 0.5],
        ];
        for (const [sx, h, factor] of stalks) {
          const tipX = sx + sway * factor;
          ctx.strokeStyle = '#4e9e4c';
          ctx.lineWidth = 3.8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.quadraticCurveTo(sx + sway * 0.2, -h * 0.5, tipX, -h);
          ctx.stroke();

          ctx.fillStyle = '#2b5e2e';
          for (let ny = 8; ny < h - 4; ny += 9) {
            ctx.fillRect(sx - 2 + (sway * factor * ny) / h, -ny, 4, 1.5);
          }

          // Swaying bamboo leaf blades
          ctx.fillStyle = '#7cd468';
          fillEllipse(ctx, tipX + 5, -h + 4, 5.5, 2, '#7cd468');
          fillEllipse(ctx, tipX - 5, -h + 8, 4.8, 1.8, '#5eb852');
        }
        break;
      }

      case 'pine': {
        // Trunk
        ctx.fillStyle = '#5c3c28';
        ctx.fillRect(-4, -12, 8, 12);

        const isSnow = biome.id === 'frost-glacier';
        const c1 = isSnow ? '#4a8ea6' : '#1f593f';
        const c2 = isSnow ? '#6cb2c9' : '#2d7552';
        const c3 = isSnow ? '#b8e8f8' : '#409468';
        const tiers: Array<[number, number, number, string]> = [
          [-10, 17, 15, c1],
          [-20, 13.5, 14, c2],
          [-29, 9.5, 13, c3],
        ];
        for (const [by, hw, th, col] of tiers) {
          const off = sway * ((-by) / 30);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(-hw + off * 0.4, by);
          ctx.lineTo(off, by - th);
          ctx.lineTo(hw + off * 0.4, by);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }

      case 'blossom-tree': {
        ctx.fillStyle = '#6e4736';
        ctx.fillRect(-4.5, -18, 9, 18);
        const pink1 = biome.id === 'amber-thicket' ? '#b8d959' : '#e87ab8';
        const pink2 = biome.id === 'amber-thicket' ? '#d9f27e' : '#ffa6da';
        const pinkHi = biome.id === 'amber-thicket' ? '#f2ffba' : '#ffd9ef';
        ctx.fillStyle = pink1;
        ctx.beginPath();
        ctx.arc(-9 + sway * 0.5, -23, 10, 0, Math.PI * 2);
        ctx.arc(9 + sway * 0.5, -23, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pink2;
        ctx.beginPath();
        ctx.arc(sway * 0.65, -30, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pinkHi;
        ctx.beginPath();
        ctx.arc(-3 + sway * 0.65, -33, 5.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'lantern-post': {
        // Stone plinth & wrought-iron curve
        ctx.fillStyle = '#38405a';
        ctx.fillRect(-6, -4, 12, 5);
        ctx.fillRect(-2, -34, 4, 31);
        ctx.fillRect(-2, -35, 13, 3);
        ctx.fillStyle = '#505c80';
        ctx.fillRect(6, -33, 6, 2.5);
        // Hanging glowing amber lantern
        const lSway = sway * 0.45;
        ctx.fillStyle = '#ffd97a';
        ctx.fillRect(5 + lSway, -30, 8, 10);
        ctx.fillStyle = '#fff9d6';
        ctx.fillRect(7 + lSway, -28, 4, 6);
        break;
      }

      case 'boulder': {
        const rock = hexToRgb255(biome.cliffHex);
        const rDark = rgb255ToStr(shadeRgb(rock, 0.72));
        const rMid = rgb255ToStr(rock);
        const rTop = rgb255ToStr(shadeRgb(rock, 1.22, 16));

        ctx.fillStyle = rDark;
        ctx.beginPath();
        ctx.moveTo(-15, 0);
        ctx.lineTo(-13, -14);
        ctx.lineTo(-3, -22);
        ctx.lineTo(11, -18);
        ctx.lineTo(15, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = rMid;
        ctx.beginPath();
        ctx.moveTo(-13, -2);
        ctx.lineTo(-11, -13);
        ctx.lineTo(-2, -20);
        ctx.lineTo(8, -14);
        ctx.lineTo(6, -2);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = rTop;
        ctx.beginPath();
        ctx.moveTo(-10, -12);
        ctx.lineTo(-2, -19);
        ctx.lineTo(6, -15);
        ctx.lineTo(-1, -11);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'cloud-stone': {
        const floatY = Math.sin(t * 2.1 + prop.swayPhase) * (reducedMotion ? 0.5 : 2.5);
        // Soft cloud collar at base
        fillEllipse(ctx, -7, -4, 8, 4.5, 'rgba(232, 246, 255, 0.75)');
        fillEllipse(ctx, 7, -4, 8, 4.5, 'rgba(232, 246, 255, 0.75)');
        fillEllipse(ctx, 0, -2, 11, 5, 'rgba(255, 255, 255, 0.85)');

        ctx.save();
        ctx.translate(0, floatY);
        ctx.fillStyle = '#7e8ca6';
        ctx.beginPath();
        ctx.moveTo(-10, -8);
        ctx.lineTo(-7, -30);
        ctx.lineTo(7, -30);
        ctx.lineTo(10, -8);
        ctx.closePath();
        ctx.fill();
        // Carved wind spiral
        ctx.strokeStyle = '#bce6ff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, -19, 5, 0, Math.PI * 1.6);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'gear-spire': {
        ctx.fillStyle = '#536275';
        ctx.fillRect(-7, -34, 14, 34);
        ctx.fillStyle = '#7589a1';
        ctx.fillRect(-5, -34, 5, 34);

        const rot = t * (reducedMotion ? 0.2 : 1.1) + prop.swayPhase;
        ctx.save();
        ctx.translate(0, -21);
        ctx.rotate(rot);
        ctx.fillStyle = '#d4a34c';
        for (let a = 0; a < 8; a++) {
          const ang = (a * Math.PI) / 4;
          ctx.fillRect(Math.cos(ang) * 10 - 2, Math.sin(ang) * 10 - 2, 4, 4);
        }
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3d4a5c';
        ctx.beginPath();
        ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7ee8ff';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
    }

    ctx.restore();
  }
}
