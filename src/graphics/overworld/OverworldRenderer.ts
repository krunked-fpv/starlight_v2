import type {
  AtlasManifest,
  BiomeColorGrade,
  BiomeId,
  CanopyShadowConfig,
  IOverworldRenderer,
  IRenderBackend,
  OverworldCameraSnapshot,
  OverworldSceneState,
  OverworldScreenProjection,
  OverworldTileProjection,
  SpriteDrawCmd,
  WaterConfig,
} from '../../contracts';
import { getBiomeVisualProfile } from '../../core/dojo';
import {
  AutotileRenderer,
  clamp,
  hash2D,
  hexToRgb01,
  lerp,
  type LightCandidate,
  type ViewTileBounds,
} from './AutotileRenderer';
import { CharacterRigRenderer } from './CharacterRigRenderer';
import { LandmarkRenderer } from './LandmarkRenderer';

export const MAX_RENDER_LIGHTS = 24;
export const MIN_CAMERA_ZOOM = 1;
export const MAX_CAMERA_ZOOM = 4.5;

const CAMERA_SNAP_DISTANCE_TILES = 5;

/**
 * Computes a responsive, pixel-crisp overhead camera zoom multiplier for the given
 * canvas viewport dimensions.
 *
 * - Desktop / landscape (1280–2560px): targets ~14–18 visible tiles horizontally and
 *   >= 9 tiles vertically, snapped to crisp 0.5x steps (2.0, 2.5, 3.0, 3.5, 4.0, 4.5)
 *   so 32x32 pixel-art tiles render cleanly at 64–144 CSS px with exact integer spans.
 * - Portrait mobile (360–430px): targets ~9–12 visible tiles horizontally, snapped to
 *   crisp 0.25x steps (1.25 -> 40 CSS px/tile) so sprites stay large and legible.
 */
export function computeOverworldZoom(
  viewportWidth: number,
  viewportHeight: number,
  tileSize = 32,
): number {
  const safeW = Math.max(1, Number.isFinite(viewportWidth) ? viewportWidth : 960);
  const safeH = Math.max(1, Number.isFinite(viewportHeight) ? viewportHeight : 540);
  const safeTile = Math.max(1, Number.isFinite(tileSize) ? tileSize : 32);

  const isPortrait = safeH > safeW;
  const targetCols = isPortrait ? (safeW <= 500 ? 10.0 : 12.0) : 16.5;
  const minVisibleRows = isPortrait ? 11.0 : 9.2;

  const zoomByWidth = safeW / (targetCols * safeTile);
  const zoomByHeight = safeH / (minVisibleRows * safeTile);
  const rawZoom = Math.min(zoomByWidth, zoomByHeight);

  const snapped =
    rawZoom < 2.0 ? Math.round(rawZoom * 4) / 4 : Math.round(rawZoom * 2) / 2;

  return clamp(snapped, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
}

/**
 * Returns a gentle vertical focus bias (in CSS px) on narrow portrait mobile screens so
 * the player sits slightly above screen center, clear of bottom touch controls.
 */
export function computeViewportFocusOffsetY(
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (viewportHeight > viewportWidth && viewportWidth <= 640) {
    return Math.round(viewportHeight * 0.06);
  }
  return 0;
}

interface AmbientMote {
  nx: number; // normalized 0..1 inside visible frustum
  ny: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  life: number;
  maxLife: number;
  useAccent: boolean;
}

const PETAL_BIOMES = new Set<BiomeId>(['grove', 'faeveldt']);
const EMBER_BIOMES = new Set<BiomeId>(['volcano', 'canyon']);
const FROST_BIOMES = new Set<BiomeId>(['peak', 'highlands']);

type CameraProjectionState = Pick<OverworldSceneState, 'cols' | 'rows' | 'tileSize' | 'player'>;

export class OverworldRenderer implements IOverworldRenderer {
  private readonly autotile = new AutotileRenderer();
  private readonly landmarks = new LandmarkRenderer();
  private readonly characters = new CharacterRigRenderer();

  private manifest: AtlasManifest | null = null;
  private cameraInitialized = false;
  private hasRenderedFrame = false;
  private camCenterX = 0;
  private camCenterY = 0;
  private lastViewportWidth = 960;
  private lastViewportHeight = 540;
  private lastCols = 100;
  private lastRows = 84;
  private lastTileSize = 32;
  private viewportKnownFromBackend = false;
  private lastBiomeId: BiomeId | null = null;
  private lastCameraSnapshot: OverworldCameraSnapshot = {
    centerX: 272,
    centerY: 496,
    camX: 0,
    camY: 0,
    zoom: 1.75,
    tileScreenPx: 56,
    viewportWidth: 960,
    viewportHeight: 540,
    visibleTilesX: 960 / 56,
    visibleTilesY: 540 / 56,
    minVisibleTileX: 0,
    maxVisibleTileX: 17,
    minVisibleTileY: 10,
    maxVisibleTileY: 20,
  };

  private ambientMotes: AmbientMote[] = [];
  private moteSeedCounter = 1;
  private spriteQueue: SpriteDrawCmd[] = [];
  private lightCandidates: LightCandidate[] = [];

  attachAtlas(
    manifest: AtlasManifest | null,
    getSheetImage?: ((sheetId: string) => HTMLImageElement | null) | null,
  ): void {
    this.manifest = manifest;
    this.autotile.setManifest(manifest, getSheetImage);
  }

  getDisplacementCount(): number {
    return this.autotile.getDisplacementCount();
  }

  getCameraState(): OverworldCameraSnapshot {
    return { ...this.lastCameraSnapshot };
  }

  /**
   * Projects a canvas-relative CSS pixel point into exact world & tile coordinates
   * matching the active zoomed HD-2D overhead camera transform.
   */
  screenToTile(
    canvasX: number,
    canvasY: number,
    canvasW?: number,
    canvasH?: number,
    state?: CameraProjectionState,
  ): OverworldTileProjection {
    const resolved = this.resolveProjectionCamera(canvasW, canvasH, state);
    const { snapshot, cols, rows, tileSize } = resolved;
    const safeX = Number.isFinite(canvasX) ? canvasX : snapshot.viewportWidth * 0.5;
    const safeY = Number.isFinite(canvasY) ? canvasY : snapshot.viewportHeight * 0.5;
    const safeZoom = Math.max(0.05, snapshot.zoom);

    const worldX = snapshot.centerX + (safeX - snapshot.viewportWidth * 0.5) / safeZoom;
    const worldY = snapshot.centerY + (safeY - snapshot.viewportHeight * 0.5) / safeZoom;
    const tileX = clamp(Math.floor(worldX / tileSize), 0, Math.max(0, cols - 1));
    const tileY = clamp(Math.floor(worldY / tileSize), 0, Math.max(0, rows - 1));

    return { tileX, tileY, worldX, worldY };
  }

  /**
   * Projects the center of tile `(tx, ty)` (`(tx + 0.5) * tileSize, (ty + 0.5) * tileSize`)
   * into canvas-relative CSS pixel coordinates matching the active zoomed overhead camera.
   */
  tileToScreen(
    tx: number,
    ty: number,
    canvasW?: number,
    canvasH?: number,
    state?: CameraProjectionState,
  ): OverworldScreenProjection {
    const resolved = this.resolveProjectionCamera(canvasW, canvasH, state);
    const { snapshot, tileSize } = resolved;
    const worldX = (tx + 0.5) * tileSize;
    const worldY = (ty + 0.5) * tileSize;

    return {
      x: snapshot.viewportWidth * 0.5 + (worldX - snapshot.centerX) * snapshot.zoom,
      y: snapshot.viewportHeight * 0.5 + (worldY - snapshot.centerY) * snapshot.zoom,
    };
  }

  resetEffects(): void {
    this.autotile.resetEffects();
    this.characters.resetEffects();
    this.ambientMotes.length = 0;
    this.cameraInitialized = false;
    this.hasRenderedFrame = false;
    this.lastBiomeId = null;
  }

  /**
   * Advances spring-physics tall grass displacement, terrain-aware footsteps,
   * damped overhead camera tracking, and biome atmospheric motes.
   */
  update(state: OverworldSceneState, dtSeconds: number): void {
    const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
    const { cols, rows, tileSize, currentBiomeId, player, reducedMotion } = state;

    this.lastCols = cols;
    this.lastRows = rows;
    this.lastTileSize = tileSize;

    const biomeChanged = this.lastBiomeId !== currentBiomeId;
    if (biomeChanged) {
      this.ambientMotes.length = 0;
      this.lastBiomeId = currentBiomeId;
    }

    this.autotile.update(state, dt);
    this.characters.update(state, dt);

    const targetX = (player.x + 0.5) * tileSize;
    const targetY = (player.y + 0.5) * tileSize;
    const jumpDist = Math.hypot(targetX - this.camCenterX, targetY - this.camCenterY);
    if (!this.cameraInitialized || jumpDist > tileSize * CAMERA_SNAP_DISTANCE_TILES) {
      this.camCenterX = targetX;
      this.camCenterY = targetY;
      this.cameraInitialized = true;
    } else {
      const followRate = reducedMotion ? 1.0 : 1 - Math.exp(-10.5 * dt);
      this.camCenterX = lerp(this.camCenterX, targetX, followRate);
      this.camCenterY = lerp(this.camCenterY, targetY, followRate);
    }

    this.updateAmbientMotes(state, dt);
  }

  /**
   * Renders the complete 100x84 frustum-culled HD-2D pixel overworld frame onto IRenderBackend
   * using a zoomed-in overhead RPG camera with pixel-snapped alignment across WebGL2 & Canvas2D.
   */
  render(backend: IRenderBackend, state: OverworldSceneState): void {
    const { cols, rows, tileSize, currentBiomeId } = state;

    this.lastCols = cols;
    this.lastRows = rows;
    this.lastTileSize = tileSize;

    const viewport = this.resolveViewportSize(backend);
    const vw = viewport.width;
    const vh = viewport.height;

    const playerCenterX = (state.player.x + 0.5) * tileSize;
    const playerCenterY = (state.player.y + 0.5) * tileSize;
    const jumpDist = Math.hypot(playerCenterX - this.camCenterX, playerCenterY - this.camCenterY);
    if (!this.cameraInitialized || jumpDist > tileSize * CAMERA_SNAP_DISTANCE_TILES) {
      this.camCenterX = playerCenterX;
      this.camCenterY = playerCenterY;
      this.cameraInitialized = true;
    }
    if (this.lastBiomeId !== currentBiomeId) {
      this.lastBiomeId = currentBiomeId;
    }

    const frame = this.computeCameraFrame(
      vw,
      vh,
      cols,
      rows,
      tileSize,
      this.camCenterX,
      this.camCenterY,
    );
    const {
      clampedCenterX,
      clampedCenterY,
      renderCenterX,
      renderCenterY,
      camX,
      camY,
      zoom,
      snapshot,
    } = frame;

    this.lastCameraSnapshot = snapshot;
    this.hasRenderedFrame = true;

    backend.setCamera({
      x: camX,
      y: camY,
      zoom,
      shakeX: 0,
      shakeY: 0,
      rotation: 0,
      viewportWidth: vw,
      viewportHeight: vh,
    });

    // Apply per-biome ColorGrade, WaterConfig, and CanopyShadowConfig from biomeVisuals.ts
    const profile = getBiomeVisualProfile(currentBiomeId);
    backend.setColorGrade(this.buildColorGrade(profile.colorGrade, state));
    backend.setWaterConfig(this.buildWaterConfig(profile.waterConfig, state));
    backend.setCanopyConfig(this.buildCanopyConfig(profile.canopyConfig, state));

    // Frustum culling: visible zoomed viewport + 2 tile margin on each edge
    const halfViewW = (vw / zoom) * 0.5;
    const halfViewH = (vh / zoom) * 0.5;
    const marginPx = tileSize * 2;
    const minPxX = renderCenterX - halfViewW - marginPx;
    const maxPxX = renderCenterX + halfViewW + marginPx;
    const minPxY = renderCenterY - halfViewH - marginPx;
    const maxPxY = renderCenterY + halfViewH + marginPx;

    const bounds: ViewTileBounds = {
      minTx: clamp(Math.floor(minPxX / tileSize), 0, Math.max(0, cols - 1)),
      maxTx: clamp(Math.ceil(maxPxX / tileSize), 0, Math.max(0, cols - 1)),
      minTy: clamp(Math.floor(minPxY / tileSize), 0, Math.max(0, rows - 1)),
      maxTy: clamp(Math.ceil(maxPxY / tileSize), 0, Math.max(0, rows - 1)),
      minPxX,
      minPxY,
      maxPxX,
      maxPxY,
    };

    // Collect candidate lights, sort by squared distance to camera center, and cap at 24
    const candidates = this.lightCandidates;
    candidates.length = 0;
    this.characters.collectPlayerAuraLight(state, clampedCenterX, clampedCenterY, candidates);
    this.landmarks.collectLights(state, bounds, clampedCenterX, clampedCenterY, candidates);
    this.autotile.collectPropLights(state, bounds, clampedCenterX, clampedCenterY, candidates);

    if (candidates.length > 1) {
      candidates.sort((a, b) => a.distSq - b.distSq);
    }
    const lightLimit = Math.min(candidates.length, MAX_RENDER_LIGHTS);
    for (let i = 0; i < lightLimit; i++) {
      backend.addPointLight(candidates[i].light);
    }

    // Pass 1: Frustum-culled 'terrain' atlas tiles (0..60) + water/lava shimmering quads
    this.autotile.renderTerrainAndWater(backend, state, bounds, {
      camX,
      camY,
      camZoom: zoom,
    });

    const landmarkTileKeys = this.landmarks.getLandmarkTileKeys(state);
    const hasPropsAtlas = this.autotile.hasSheet('props');

    // Prepare Y-sorted entity sprites BEFORE Pass 2 so we know whether offscreen cosmetic canvases are active
    const sprites = this.spriteQueue;
    sprites.length = 0;
    this.autotile.collectPropSprites(state, bounds, sprites, landmarkTileKeys);
    this.landmarks.collectSprites(state, bounds, this.manifest, sprites);
    const usedCanvasCosmetics = this.characters.collectSprites(
      state,
      bounds,
      this.manifest,
      sprites,
    );

    // Pass 2: Pre-sprite world ground overlays (47-tile autotile seams, shadows, BFS path, readiness auras, footsteps)
    backend.drawCustom2D((ctx, viewW, viewH) => {
      this.lastViewportWidth = viewW;
      this.lastViewportHeight = viewH;
      this.viewportKnownFromBackend = true;

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(viewW * 0.5, viewH * 0.5);
      if (zoom !== 1) ctx.scale(zoom, zoom);
      ctx.translate(-renderCenterX, -renderCenterY);

      this.autotile.renderTerrainDetailOverlays(ctx, state, bounds);
      this.landmarks.renderGroundOverlays(ctx, state, bounds, hasPropsAtlas);
      this.autotile.renderPropShadowsAndEffects(ctx, state, bounds, landmarkTileKeys, 'ground');
      this.characters.renderGroundUnderlays(
        ctx,
        state,
        bounds,
        this.manifest,
        usedCanvasCosmetics,
      );

      ctx.restore();
    }, 'world');

    // Pass 3: Single batched Y-sorted sprite segment (props, trees, cottages, shrines, chests, NPCs, rivals, follower, player)
    for (let i = 0; i < sprites.length; i++) {
      backend.drawSprite(sprites[i]);
    }

    // Pass 4: Post-sprite pixel overlays (parting tall grass, chimney smoke, Secret Arcade star, cosmetics, quest badges, interaction prompt)
    backend.drawCustom2D((ctx, viewW, viewH) => {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(viewW * 0.5, viewH * 0.5);
      if (zoom !== 1) ctx.scale(zoom, zoom);
      ctx.translate(-renderCenterX, -renderCenterY);

      this.autotile.renderPartingTallGrass(ctx, state, bounds);
      this.autotile.renderPropShadowsAndEffects(ctx, state, bounds, landmarkTileKeys, 'post');
      this.landmarks.renderPostSpriteOverlays(ctx, state, bounds);
      this.characters.renderPostSpriteOverlays(ctx, state, bounds, usedCanvasCosmetics);

      ctx.restore();
    }, 'world');

    // Pass 5: Atmospheric biome motes, player aura particles, shiny sparkles, chest/discovery glints
    this.emitAtmosphericParticles(backend, state, bounds, profile.accentHex);
    this.characters.emitCharacterParticles(backend, state);
    this.landmarks.emitNodeParticles(backend, state, bounds);

    // Pass 6: Screen-space wayfinding compass chevron for off-screen targets
    if (state.compassTarget) {
      backend.drawCustom2D((ctx, viewW, viewH) => {
        this.landmarks.renderCompassOverlay(ctx, state, camX, camY, zoom, viewW, viewH);
      }, 'screen');
    }
  }

  private resolveProjectionCamera(
    canvasW?: number,
    canvasH?: number,
    state?: CameraProjectionState,
  ): {
    snapshot: OverworldCameraSnapshot;
    cols: number;
    rows: number;
    tileSize: number;
  } {
    const cols = state?.cols ?? this.lastCols;
    const rows = state?.rows ?? this.lastRows;
    const tileSize = state?.tileSize ?? this.lastTileSize;
    const vw =
      canvasW !== undefined && Number.isFinite(canvasW) && canvasW > 0
        ? canvasW
        : this.lastCameraSnapshot.viewportWidth || this.lastViewportWidth;
    const vh =
      canvasH !== undefined && Number.isFinite(canvasH) && canvasH > 0
        ? canvasH
        : this.lastCameraSnapshot.viewportHeight || this.lastViewportHeight;

    const dimsMatchLast =
      this.hasRenderedFrame &&
      Math.abs(vw - this.lastCameraSnapshot.viewportWidth) <= 0.5 &&
      Math.abs(vh - this.lastCameraSnapshot.viewportHeight) <= 0.5 &&
      cols === this.lastCols &&
      rows === this.lastRows &&
      tileSize === this.lastTileSize;

    if (dimsMatchLast) {
      if (!state) {
        return { snapshot: this.lastCameraSnapshot, cols, rows, tileSize };
      }
      const playerCenterX = (state.player.x + 0.5) * tileSize;
      const playerCenterY = (state.player.y + 0.5) * tileSize;
      const dist = Math.hypot(playerCenterX - this.camCenterX, playerCenterY - this.camCenterY);
      if (dist <= tileSize * CAMERA_SNAP_DISTANCE_TILES) {
        return { snapshot: this.lastCameraSnapshot, cols, rows, tileSize };
      }
    }

    const baseX = state
      ? (state.player.x + 0.5) * tileSize
      : this.cameraInitialized
        ? this.camCenterX
        : this.lastCameraSnapshot.centerX;
    const baseY = state
      ? (state.player.y + 0.5) * tileSize
      : this.cameraInitialized
        ? this.camCenterY
        : this.lastCameraSnapshot.centerY;

    const frame = this.computeCameraFrame(vw, vh, cols, rows, tileSize, baseX, baseY);
    return { snapshot: frame.snapshot, cols, rows, tileSize };
  }

  private computeCameraFrame(
    vw: number,
    vh: number,
    cols: number,
    rows: number,
    tileSize: number,
    rawCenterX: number,
    rawCenterY: number,
  ): {
    clampedCenterX: number;
    clampedCenterY: number;
    renderCenterX: number;
    renderCenterY: number;
    camX: number;
    camY: number;
    zoom: number;
    snapshot: OverworldCameraSnapshot;
  } {
    const safeW = Math.max(1, vw);
    const safeH = Math.max(1, vh);
    const safeTile = Math.max(1, tileSize);
    const zoom = computeOverworldZoom(safeW, safeH, safeTile);

    const mapPxW = Math.max(safeTile, cols * safeTile);
    const mapPxH = Math.max(safeTile, rows * safeTile);
    const viewWorldW = safeW / zoom;
    const viewWorldH = safeH / zoom;

    const focusOffsetCssY = computeViewportFocusOffsetY(safeW, safeH);
    const biasedCenterY = rawCenterY + focusOffsetCssY / zoom;

    const clampedCenterX = this.clampCenterCoord(rawCenterX, mapPxW, viewWorldW);
    const clampedCenterY = this.clampCenterCoord(biasedCenterY, mapPxH, viewWorldH);

    // Snap world origin (0,0) in CSS pixels to an exact integer so every tile boundary
    // and 16x16 terrain chunk aligns cleanly to screen pixels with zero hairline seams.
    const mapScreenW = mapPxW * zoom;
    const mapScreenH = mapPxH * zoom;
    const rawOriginX = safeW * 0.5 - clampedCenterX * zoom;
    const rawOriginY = safeH * 0.5 - clampedCenterY * zoom;

    const snappedOriginX =
      mapScreenW >= safeW
        ? clamp(Math.round(rawOriginX), Math.floor(safeW - mapScreenW), 0)
        : Math.round(rawOriginX);
    const snappedOriginY =
      mapScreenH >= safeH
        ? clamp(Math.round(rawOriginY), Math.floor(safeH - mapScreenH), 0)
        : Math.round(rawOriginY);

    const renderCenterX = (safeW * 0.5 - snappedOriginX) / zoom;
    const renderCenterY = (safeH * 0.5 - snappedOriginY) / zoom;
    const camX = renderCenterX - safeW * 0.5;
    const camY = renderCenterY - safeH * 0.5;

    const tileScreenPx = safeTile * zoom;
    const visibleTilesX = safeW / tileScreenPx;
    const visibleTilesY = safeH / tileScreenPx;

    const visMinPxX = renderCenterX - viewWorldW * 0.5;
    const visMaxPxX = renderCenterX + viewWorldW * 0.5;
    const visMinPxY = renderCenterY - viewWorldH * 0.5;
    const visMaxPxY = renderCenterY + viewWorldH * 0.5;

    const snapshot: OverworldCameraSnapshot = {
      centerX: renderCenterX,
      centerY: renderCenterY,
      camX,
      camY,
      zoom,
      tileScreenPx,
      viewportWidth: safeW,
      viewportHeight: safeH,
      visibleTilesX,
      visibleTilesY,
      minVisibleTileX: clamp(Math.floor(visMinPxX / safeTile), 0, Math.max(0, cols - 1)),
      maxVisibleTileX: clamp(Math.ceil(visMaxPxX / safeTile) - 1, 0, Math.max(0, cols - 1)),
      minVisibleTileY: clamp(Math.floor(visMinPxY / safeTile), 0, Math.max(0, rows - 1)),
      maxVisibleTileY: clamp(Math.ceil(visMaxPxY / safeTile) - 1, 0, Math.max(0, rows - 1)),
    };

    return {
      clampedCenterX,
      clampedCenterY,
      renderCenterX,
      renderCenterY,
      camX,
      camY,
      zoom,
      snapshot,
    };
  }

  private resolveViewportSize(backend: IRenderBackend): { width: number; height: number } {
    if (typeof backend.getViewportSize === 'function') {
      const vp = backend.getViewportSize();
      if (vp && vp.width > 0 && vp.height > 0) {
        this.lastViewportWidth = vp.width;
        this.lastViewportHeight = vp.height;
        this.viewportKnownFromBackend = true;
        return { width: vp.width, height: vp.height };
      }
    }
    const ctx = backend.getCanvas2DContext();
    if (ctx && ctx.canvas) {
      const dpr = Math.max(1, backend.capabilities.dpr || 1);
      const cw = ctx.canvas.clientWidth || Math.round(ctx.canvas.width / dpr);
      const ch = ctx.canvas.clientHeight || Math.round(ctx.canvas.height / dpr);
      if (cw > 0 && ch > 0) {
        this.lastViewportWidth = cw;
        this.lastViewportHeight = ch;
        this.viewportKnownFromBackend = true;
        return { width: cw, height: ch };
      }
    }
    if (!this.viewportKnownFromBackend && typeof document !== 'undefined') {
      const el = document.getElementById('starlight-canvas') as HTMLCanvasElement | null;
      const cw = el?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 0);
      const ch = el?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 0);
      if (cw > 0 && ch > 0) {
        this.lastViewportWidth = cw;
        this.lastViewportHeight = ch;
      }
    }
    return {
      width: Math.max(1, this.lastViewportWidth),
      height: Math.max(1, this.lastViewportHeight),
    };
  }

  private clampCenterCoord(center: number, mapSpan: number, viewSpan: number): number {
    if (mapSpan <= viewSpan) {
      return mapSpan * 0.5;
    }
    const halfView = viewSpan * 0.5;
    return clamp(center, halfView, mapSpan - halfView);
  }

  private buildColorGrade(base: BiomeColorGrade, state: OverworldSceneState): BiomeColorGrade {
    const twilight = clamp(Math.abs(state.timeOfDay - 0.5) * 2, 0, 1);
    const ambientShift = (0.5 - twilight) * 0.08;
    return {
      ...base,
      ambientRgb: [...base.ambientRgb],
      tintRgb: [...base.tintRgb],
      ambientStrength: clamp(base.ambientStrength + ambientShift, 0.58, 0.96),
      starlightGlow: clamp(base.starlightGlow * (0.75 + 0.35 * twilight), 0.25, 1.0),
    };
  }

  private buildWaterConfig(
    base: Omit<WaterConfig, 'time'>,
    state: OverworldSceneState,
  ): WaterConfig {
    return {
      ...base,
      time: state.elapsedSeconds,
      skyTopColor: [...base.skyTopColor],
      skyBottomColor: [...base.skyBottomColor],
      foamColor: [...base.foamColor],
      waveAmplitude: state.reducedMotion ? base.waveAmplitude * 0.25 : base.waveAmplitude,
    };
  }

  private buildCanopyConfig(
    base: CanopyShadowConfig,
    state: OverworldSceneState,
  ): CanopyShadowConfig {
    const motionScale = state.reducedMotion ? 0.2 : 1.0;
    return {
      ...base,
      sunbeamColor: [...base.sunbeamColor],
      cloudSpeedX: base.cloudSpeedX * motionScale,
      cloudSpeedY: base.cloudSpeedY * motionScale,
    };
  }

  private updateAmbientMotes(state: OverworldSceneState, dt: number): void {
    const { currentBiomeId, reducedMotion, elapsedSeconds } = state;
    const targetCount = reducedMotion ? 8 : 22;

    while (this.ambientMotes.length < targetCount) {
      const s = this.moteSeedCounter++;
      const r1 = hash2D(s, 11, 3);
      const r2 = hash2D(s, 23, 7);
      const r3 = hash2D(s, 37, 13);

      let vx = (r3 - 0.5) * 0.035;
      let vy = (r1 - 0.5) * 0.025;
      let radius = 2.0 + r2 * 2.2;

      if (EMBER_BIOMES.has(currentBiomeId)) {
        vx = (r3 - 0.4) * 0.04;
        vy = -0.035 - r1 * 0.04;
        radius = 1.8 + r2 * 1.8;
      } else if (FROST_BIOMES.has(currentBiomeId)) {
        vx = -0.02 + r3 * 0.04;
        vy = 0.025 + r1 * 0.035;
        radius = 1.8 + r2 * 2.0;
      } else if (PETAL_BIOMES.has(currentBiomeId)) {
        vx = 0.028 + r3 * 0.035;
        vy = 0.015 + r1 * 0.02;
        radius = 2.0 + r2 * 1.8;
      }

      this.ambientMotes.push({
        nx: r1,
        ny: r2,
        vx,
        vy,
        radius,
        phase: r3 * Math.PI * 2,
        life: r1 * 4,
        maxLife: 4.5 + r2 * 4.5,
        useAccent: s % 3 !== 0,
      });
    }

    if (this.ambientMotes.length > targetCount) {
      this.ambientMotes.length = targetCount;
    }

    const motionMul = reducedMotion ? 0.25 : 1.0;
    for (const m of this.ambientMotes) {
      m.life += dt * motionMul;
      m.nx += (m.vx + Math.sin(elapsedSeconds * 1.4 + m.phase) * 0.01) * dt * motionMul;
      m.ny += m.vy * dt * motionMul;

      if (m.nx < 0) m.nx += 1;
      if (m.nx >= 1) m.nx -= 1;
      if (m.ny < 0) m.ny += 1;
      if (m.ny >= 1) m.ny -= 1;
      if (m.life >= m.maxLife) m.life %= m.maxLife;
    }
  }

  private emitAtmosphericParticles(
    backend: IRenderBackend,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    accentHex: string,
  ): void {
    const [ar, ag, ab] = hexToRgb01(accentHex);
    const isPetal = PETAL_BIOMES.has(state.currentBiomeId);
    const baseAlpha = state.reducedMotion ? 0.32 : 0.6;
    const spanW = Math.max(1, bounds.maxPxX - bounds.minPxX);
    const spanH = Math.max(1, bounds.maxPxY - bounds.minPxY);

    for (const m of this.ambientMotes) {
      const lifeFrac = m.life / m.maxLife;
      const pulse = Math.sin(lifeFrac * Math.PI);
      const twinkle = 0.55 + 0.45 * Math.sin(state.elapsedSeconds * 2.8 + m.phase);
      const alpha = clamp(pulse * twinkle * baseAlpha, 0, 0.85);
      if (alpha <= 0.02) continue;

      backend.drawParticle({
        x: bounds.minPxX + m.nx * spanW,
        y: bounds.minPxY + m.ny * spanH,
        radius: m.radius,
        color: m.useAccent ? [ar, ag, ab, alpha] : [0.96, 0.94, 0.84, alpha],
        softness: isPetal ? 0.42 : 0.8,
        additive: !isPetal,
        stretchX: isPetal ? 1.55 : 1,
        stretchY: isPetal ? 0.65 : 1,
        rotation: isPetal ? m.phase + state.elapsedSeconds * 0.9 : 0,
      });
    }
  }
}
