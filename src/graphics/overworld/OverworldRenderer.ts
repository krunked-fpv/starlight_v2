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
 *   so 32x32 world tiles (backed by 64x64 HD-2D atlas textures!) render cleanly at
 *   64–144 CSS px with exact integer spans.
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
  nx: number;
  ny: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  life: number;
  maxLife: number;
  variant: number;
}

interface CelebrationBurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  life: number;
  maxLife: number;
  shape: 'star' | 'diamond' | 'spark' | 'ring';
  color: string;
  startRadius: number;
  endRadius: number;
}

type CelebrationPreset = 'gold' | 'starlight' | 'quest' | 'heal';

const CELEBRATION_PALETTES: Record<CelebrationPreset, readonly string[]> = {
  gold: ['#fde047', '#facc15', '#fef08a', '#fb923c', '#ffffff'],
  starlight: ['#67e8f9', '#c084fc', '#fde047', '#f472b6', '#ffffff'],
  quest: ['#4ade80', '#fde047', '#38bdf8', '#a7f3d0', '#ffffff'],
  heal: ['#f472b6', '#fbcfe8', '#67e8f9', '#fde047', '#ffffff'],
};

interface BiomeWeatherSpec {
  colors: readonly [[number, number, number], [number, number, number], [number, number, number]];
  vxBase: number;
  vxSpread: number;
  vyBase: number;
  vySpread: number;
  radiusMin: number;
  radiusSpread: number;
  additive: boolean;
  stretchX: number;
  stretchY: number;
  isPetal?: boolean;
}

// V1-parity distinct weather motes for ALL 18 canonical biomes (zero per-frame allocations)
const BIOME_WEATHER_SPECS: Record<BiomeId, BiomeWeatherSpec> = {
  village: { colors: [[0.99, 0.94, 0.54], [0.75, 0.95, 0.39], [0.98, 0.72, 0.85]], vxBase: 0.008, vxSpread: 0.024, vyBase: 0.006, vySpread: 0.018, radiusMin: 1.7, radiusSpread: 1.4, additive: true, stretchX: 1.2, stretchY: 0.9 },
  forest: { colors: [[0.99, 0.94, 0.54], [0.75, 0.95, 0.39], [0.98, 0.76, 0.88]], vxBase: 0.006, vxSpread: 0.022, vyBase: 0.008, vySpread: 0.02, radiusMin: 1.7, radiusSpread: 1.5, additive: true, stretchX: 1.2, stretchY: 0.9 },
  cave: { colors: [[0.13, 0.83, 0.93], [0.91, 0.47, 0.98], [1.0, 1.0, 1.0]], vxBase: 0, vxSpread: 0.012, vyBase: 0, vySpread: 0.012, radiusMin: 1.5, radiusSpread: 1.4, additive: true, stretchX: 1, stretchY: 1 },
  water: { colors: [[0.49, 0.83, 0.99], [0.78, 0.95, 1.0], [1.0, 1.0, 1.0]], vxBase: 0, vxSpread: 0.018, vyBase: -0.024, vySpread: 0.016, radiusMin: 1.8, radiusSpread: 1.4, additive: true, stretchX: 1, stretchY: 1 },
  volcano: { colors: [[0.98, 0.57, 0.24], [0.99, 0.88, 0.28], [1.0, 0.42, 0.18]], vxBase: 0.005, vxSpread: 0.032, vyBase: -0.052, vySpread: 0.035, radiusMin: 1.6, radiusSpread: 1.6, additive: true, stretchX: 0.9, stretchY: 1.45 },
  peak: { colors: [[0.65, 0.95, 0.99], [1.0, 1.0, 1.0], [0.88, 0.95, 1.0]], vxBase: 0.008, vxSpread: 0.032, vyBase: 0.038, vySpread: 0.028, radiusMin: 1.7, radiusSpread: 1.7, additive: false, stretchX: 1, stretchY: 1 },
  grove: { colors: [[0.98, 0.44, 0.52], [0.98, 0.66, 0.83], [0.18, 0.83, 0.75]], vxBase: 0.026, vxSpread: 0.024, vyBase: 0.02, vySpread: 0.018, radiusMin: 1.8, radiusSpread: 1.4, additive: false, stretchX: 1.55, stretchY: 0.65, isPetal: true },
  desert: { colors: [[0.99, 0.94, 0.54], [0.98, 0.75, 0.14], [0.99, 0.73, 0.45]], vxBase: 0.048, vxSpread: 0.028, vyBase: 0.008, vySpread: 0.012, radiusMin: 1.5, radiusSpread: 1.2, additive: true, stretchX: 1.75, stretchY: 0.65 },
  marsh: { colors: [[0.91, 0.47, 0.98], [0.37, 0.92, 0.83], [0.75, 0.95, 0.39]], vxBase: 0, vxSpread: 0.022, vyBase: -0.02, vySpread: 0.015, radiusMin: 2.0, radiusSpread: 1.6, additive: true, stretchX: 1, stretchY: 1 },
  sanctum: { colors: [[0.99, 0.90, 0.54], [0.40, 0.91, 0.98], [0.77, 0.71, 0.99]], vxBase: 0, vxSpread: 0.016, vyBase: -0.014, vySpread: 0.012, radiusMin: 1.6, radiusSpread: 1.6, additive: true, stretchX: 1, stretchY: 1 },
  canyon: { colors: [[0.98, 0.62, 0.14], [0.22, 0.74, 0.97], [0.99, 0.88, 0.28]], vxBase: 0.042, vxSpread: 0.03, vyBase: 0.004, vySpread: 0.02, radiusMin: 1.5, radiusSpread: 1.4, additive: true, stretchX: 1.6, stretchY: 0.7 },
  reef: { colors: [[0.96, 0.45, 0.71], [0.40, 0.91, 0.98], [0.65, 0.95, 0.99]], vxBase: 0, vxSpread: 0.018, vyBase: -0.026, vySpread: 0.016, radiusMin: 1.8, radiusSpread: 1.5, additive: true, stretchX: 1, stretchY: 1 },
  ruins: { colors: [[0.99, 0.94, 0.54], [0.98, 0.75, 0.14], [0.40, 0.91, 0.98]], vxBase: 0.006, vxSpread: 0.018, vyBase: -0.015, vySpread: 0.014, radiusMin: 1.7, radiusSpread: 1.5, additive: true, stretchX: 1, stretchY: 1 },
  rift: { colors: [[0.91, 0.47, 0.98], [0.22, 0.74, 0.97], [0.99, 0.88, 0.28]], vxBase: 0, vxSpread: 0.024, vyBase: -0.018, vySpread: 0.018, radiusMin: 1.7, radiusSpread: 1.6, additive: true, stretchX: 1.15, stretchY: 1.15 },
  faeveldt: { colors: [[0.98, 0.66, 0.83], [0.75, 0.52, 0.99], [0.65, 0.95, 0.82]], vxBase: 0.022, vxSpread: 0.022, vyBase: 0.012, vySpread: 0.016, radiusMin: 1.8, radiusSpread: 1.4, additive: false, stretchX: 1.5, stretchY: 0.7, isPetal: true },
  atoll: { colors: [[0.98, 0.57, 0.24], [0.99, 0.94, 0.54], [0.22, 0.74, 0.97]], vxBase: 0.01, vxSpread: 0.022, vyBase: -0.02, vySpread: 0.015, radiusMin: 1.7, radiusSpread: 1.4, additive: true, stretchX: 1.25, stretchY: 0.85 },
  highlands: { colors: [[0.80, 0.84, 0.88], [0.40, 0.91, 0.98], [0.99, 0.88, 0.28]], vxBase: 0.044, vxSpread: 0.026, vyBase: 0.008, vySpread: 0.014, radiusMin: 1.5, radiusSpread: 1.4, additive: true, stretchX: 1.7, stretchY: 0.65 },
  crater: { colors: [[0.22, 0.74, 0.97], [0.96, 0.45, 0.71], [0.99, 0.94, 0.54]], vxBase: 0, vxSpread: 0.02, vyBase: -0.018, vySpread: 0.016, radiusMin: 1.8, radiusSpread: 1.6, additive: true, stretchX: 1.1, stretchY: 1.1 },
};

const AURORA_BIOME_BANDS: Partial<Record<BiomeId, readonly [string, string, string]>> = {
  peak: ['rgba(56, 189, 248, 0.085)', 'rgba(52, 211, 153, 0.09)', 'rgba(192, 132, 252, 0.075)'],
  crater: ['rgba(56, 189, 248, 0.095)', 'rgba(244, 114, 182, 0.085)', 'rgba(250, 204, 21, 0.07)'],
  faeveldt: ['rgba(249, 168, 212, 0.085)', 'rgba(192, 132, 252, 0.08)', 'rgba(167, 243, 208, 0.07)'],
  rift: ['rgba(232, 121, 249, 0.09)', 'rgba(56, 189, 248, 0.08)', 'rgba(250, 204, 21, 0.065)'],
  sanctum: ['rgba(167, 139, 250, 0.09)', 'rgba(103, 232, 249, 0.08)', 'rgba(250, 204, 21, 0.06)'],
};

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

  // V1-parity Starlight Warp arrival beam & celebration particle burst state
  private warpBeamTimer = 0;
  private readonly warpBeamDuration = 0.55;
  private warpBeamWorldX = 0;
  private warpBeamWorldY = 0;
  private warpBeamIsSafe = false;
  private celebrationParticles: CelebrationBurstParticle[] = [];
  private burstSeed = 17;
  private prevOpenedChestIds = new Set<string>();
  private prevClearedShrineIds = new Set<string>();
  private prevDefeatedRivalIds = new Set<string>();
  private prevCompletedQuestNpcIds = new Set<string>();
  private prevDiscoveryCount = -1;
  private prevStateTracked = false;

  // Pre-allocated scratch buffers eliminating per-frame GC churn
  private readonly boundsScratch: ViewTileBounds = {
    minTx: 0,
    maxTx: 0,
    minTy: 0,
    maxTy: 0,
    minPxX: 0,
    minPxY: 0,
    maxPxX: 0,
    maxPxY: 0,
  };
  private readonly cameraParamScratch = {
    x: 0,
    y: 0,
    zoom: 1,
    shakeX: 0,
    shakeY: 0,
    rotation: 0,
    viewportWidth: 960,
    viewportHeight: 540,
  };
  private readonly terrainCamScratch = { camX: 0, camY: 0, camZoom: 1 };
  private readonly colorGradeScratch: BiomeColorGrade = {
    biomeId: 'village',
    ambientRgb: [0.76, 0.8, 0.94],
    ambientStrength: 0.78,
    tintRgb: [1.03, 0.99, 0.95],
    contrast: 1.05,
    saturation: 1.12,
    bloomIntensity: 0.44,
    bloomThreshold: 0.68,
    vignetteStrength: 0.24,
    skyTopHex: '#10183d',
    skyHorizonHex: '#3b4f8c',
    starlightGlow: 0.88,
  };
  private readonly waterConfigScratch: WaterConfig = {
    enabled: true,
    time: 0,
    skyTopColor: [0.09, 0.16, 0.42],
    skyBottomColor: [0.22, 0.62, 0.88],
    starlightIntensity: 0.85,
    waveAmplitude: 0.9,
    foamColor: [0.85, 0.96, 1.0],
  };
  private readonly canopyConfigScratch: CanopyShadowConfig = {
    enabled: true,
    sunbeamIntensity: 0.22,
    sunbeamAngle: 0.42,
    sunbeamColor: [1.0, 0.92, 0.74],
    cloudSpeedX: 0.015,
    cloudSpeedY: 0.008,
    cloudOpacity: 0.14,
  };

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
    this.celebrationParticles.length = 0;
    this.cameraInitialized = false;
    this.hasRenderedFrame = false;
    this.lastBiomeId = null;
    this.warpBeamTimer = 0;
    this.prevOpenedChestIds.clear();
    this.prevClearedShrineIds.clear();
    this.prevDefeatedRivalIds.clear();
    this.prevCompletedQuestNpcIds.clear();
    this.prevDiscoveryCount = -1;
    this.prevStateTracked = false;
  }

  /**
   * Triggers a V1-parity multi-shape celebration particle burst (expanding rings, 4-point stars,
   * diamonds, and sparks) at a world tile coordinate.
   */
  triggerCelebrationBurst(
    tileX: number,
    tileY: number,
    preset: CelebrationPreset = 'gold',
    tileSize = this.lastTileSize,
  ): void {
    const palette = CELEBRATION_PALETTES[preset] ?? CELEBRATION_PALETTES.gold;
    const cx = (tileX + 0.5) * tileSize;
    const cy = (tileY + 0.5) * tileSize;

    // 2 expanding elliptical celebration shock rings
    for (let r = 0; r < 2; r++) {
      this.celebrationParticles.push({
        x: cx,
        y: cy + 6,
        vx: 0,
        vy: 0,
        gravity: 0,
        size: 1.8 - r * 0.4,
        life: 0,
        maxLife: 0.44 + r * 0.14,
        shape: 'ring',
        color: palette[r % palette.length],
        startRadius: 5 + r * 4,
        endRadius: 28 + r * 14,
      });
    }

    // 36 crisp star / diamond / spark celebration particles (capped to prevent runaway pools)
    const maxTotal = 110;
    const shapes: ReadonlyArray<'star' | 'diamond' | 'spark'> = ['star', 'diamond', 'spark'];
    for (let i = 0; i < 36 && this.celebrationParticles.length < maxTotal; i++) {
      const s = this.burstSeed++;
      const r1 = hash2D(s, 7, 19);
      const r2 = hash2D(s, 13, 29);
      const r3 = hash2D(s, 23, 41);
      const ang = (i / 36) * Math.PI * 2 + (r1 - 0.5) * 0.35;
      const spd = 28 + r2 * 64;
      this.celebrationParticles.push({
        x: cx + (r1 - 0.5) * 6,
        y: cy + (r3 - 0.5) * 6,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 24 - r3 * 22,
        gravity: 68,
        size: 2.0 + r2 * 2.0,
        life: 0,
        maxLife: 0.52 + r3 * 0.36,
        shape: shapes[i % shapes.length],
        color: palette[i % palette.length],
        startRadius: 0,
        endRadius: 0,
      });
    }
  }

  /**
   * Advances spring-physics tall grass displacement, terrain-aware footsteps,
   * damped overhead camera tracking, warp arrival beam, celebration bursts, and biome weather motes.
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

    if (this.warpBeamTimer > 0) {
      this.warpBeamTimer = Math.max(0, this.warpBeamTimer - dt);
    }

    this.autotile.update(state, dt);
    this.characters.update(state, dt);

    // Detect V1-parity celebratory world events (chest open, shrine clear, quest complete, rival defeat, discovery)
    this.detectCelebrationTriggers(state, reducedMotion);
    this.updateCelebrationParticles(dt);

    const targetX = (player.x + 0.5) * tileSize;
    const targetY = (player.y + 0.5) * tileSize;
    const jumpDist = Math.hypot(targetX - this.camCenterX, targetY - this.camCenterY);
    if (!this.cameraInitialized || jumpDist > tileSize * CAMERA_SNAP_DISTANCE_TILES) {
      if (this.hasRenderedFrame && jumpDist > tileSize * CAMERA_SNAP_DISTANCE_TILES && !reducedMotion) {
        this.warpBeamTimer = this.warpBeamDuration;
        this.warpBeamWorldX = targetX;
        this.warpBeamWorldY = targetY;
        this.warpBeamIsSafe = currentBiomeId === 'village';
        this.triggerCelebrationBurst(
          player.x,
          player.y,
          currentBiomeId === 'village' ? 'quest' : 'starlight',
          tileSize,
        );
      }
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
   * using cached 2x-resolution terrain/shore chunks, softened mini follower rendering,
   * and strict zero-allocation hot paths for sustained 60+ FPS across WebGL2 & Canvas2D.
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

    const camParam = this.cameraParamScratch;
    camParam.x = camX;
    camParam.y = camY;
    camParam.zoom = zoom;
    camParam.shakeX = 0;
    camParam.shakeY = 0;
    camParam.rotation = 0;
    camParam.viewportWidth = vw;
    camParam.viewportHeight = vh;
    backend.setCamera(camParam);

    // Apply per-biome ColorGrade, WaterConfig, and CanopyShadowConfig using pre-allocated scratch buffers
    const profile = getBiomeVisualProfile(currentBiomeId);
    backend.setColorGrade(this.fillColorGrade(profile.colorGrade, state));
    backend.setWaterConfig(this.fillWaterConfig(profile.waterConfig, state));
    backend.setCanopyConfig(this.fillCanopyConfig(profile.canopyConfig, state));

    // Frustum culling: visible zoomed viewport + 2 tile margin on each edge
    const halfViewW = (vw / zoom) * 0.5;
    const halfViewH = (vh / zoom) * 0.5;
    const marginPx = tileSize * 2;
    const minPxX = renderCenterX - halfViewW - marginPx;
    const maxPxX = renderCenterX + halfViewW + marginPx;
    const minPxY = renderCenterY - halfViewH - marginPx;
    const maxPxY = renderCenterY + halfViewH + marginPx;

    const bounds = this.boundsScratch;
    bounds.minTx = clamp(Math.floor(minPxX / tileSize), 0, Math.max(0, cols - 1));
    bounds.maxTx = clamp(Math.ceil(maxPxX / tileSize), 0, Math.max(0, cols - 1));
    bounds.minTy = clamp(Math.floor(minPxY / tileSize), 0, Math.max(0, rows - 1));
    bounds.maxTy = clamp(Math.ceil(maxPxY / tileSize), 0, Math.max(0, rows - 1));
    bounds.minPxX = minPxX;
    bounds.minPxY = minPxY;
    bounds.maxPxX = maxPxX;
    bounds.maxPxY = maxPxY;

    // Collect candidate lights, sort nearest-first, and enforce <= 24 point-light budget cap
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

    const landmarkTileIndices = this.landmarks.getLandmarkTileIndices(state);

    // Pass 1: Frustum-culled 2x HD-2D terrain chunks/tiles + water quads + organic curved shoreline chunks
    this.terrainCamScratch.camX = camX;
    this.terrainCamScratch.camY = camY;
    this.terrainCamScratch.camZoom = zoom;
    this.autotile.renderTerrainAndWater(backend, state, bounds, this.terrainCamScratch, landmarkTileIndices);

    const hasPropsAtlas = this.autotile.hasSheet('props');

    // Prepare Y-sorted entity sprites BEFORE Pass 2
    const sprites = this.spriteQueue;
    sprites.length = 0;
    this.autotile.collectPropSprites(state, bounds, sprites, landmarkTileIndices);
    this.landmarks.collectSprites(state, bounds, this.manifest, sprites);
    const usedCanvasCosmetics = this.characters.collectSprites(
      state,
      bounds,
      this.manifest,
      sprites,
    );

    // Pass 2: Lightweight dynamic ground overlays (animated water ripples/flowers/runes, BFS path, readiness rings, dynamic actor shadows, footsteps)
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
      this.autotile.renderPropShadowsAndEffects(ctx, state, bounds, landmarkTileIndices, 'ground');
      this.characters.renderGroundUnderlays(
        ctx,
        state,
        bounds,
        this.manifest,
        usedCanvasCosmetics,
      );

      ctx.restore();
    }, 'world');

    // Pass 3: Single batched Y-sorted sprite segment (props, varied trees, cottages, shrines, chests, NPCs, rivals, softened follower, player)
    for (let i = 0; i < sprites.length; i++) {
      backend.drawSprite(sprites[i]);
    }

    // Pass 4: Post-sprite pixel overlays (parting tall grass, chimney smoke, Secret Arcade star, villager hats, golden diamond quest crests, interaction crest)
    backend.drawCustom2D((ctx, viewW, viewH) => {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(viewW * 0.5, viewH * 0.5);
      if (zoom !== 1) ctx.scale(zoom, zoom);
      ctx.translate(-renderCenterX, -renderCenterY);

      this.autotile.renderPartingTallGrass(ctx, state, bounds);
      this.autotile.renderPropShadowsAndEffects(ctx, state, bounds, landmarkTileIndices, 'post');
      this.landmarks.renderPostSpriteOverlays(ctx, state, bounds);
      this.characters.renderPostSpriteOverlays(ctx, state, bounds, usedCanvasCosmetics);
      if (this.warpBeamTimer > 0) {
        this.renderWarpArrivalBeam(ctx, state.elapsedSeconds);
      }
      if (this.celebrationParticles.length > 0) {
        this.renderCelebrationParticles(ctx);
      }

      ctx.restore();
    }, 'world');

    // Pass 5: Atmospheric biome motes, player aura particles, shiny sparkles, chest/discovery glints
    this.emitAtmosphericParticles(backend, state, bounds, profile.accentHex);
    this.characters.emitCharacterParticles(backend, state);
    this.landmarks.emitNodeParticles(backend, state, bounds);

    // Pass 6: Screen-space V1-parity biome aurora ribbons & off-screen compass chevron
    // (skip the screen hybrid layer completely when neither is visible to save a full-screen WebGL2 upload!)
    const auroraBands = AURORA_BIOME_BANDS[currentBiomeId];
    const showCompass =
      Boolean(state.compassTarget) &&
      this.landmarks.isCompassOffscreen(state, camX, camY, zoom, vw, vh);
    if (auroraBands || showCompass) {
      backend.drawCustom2D((ctx, viewW, viewH) => {
        if (auroraBands) {
          this.renderBiomeAuroraBands(ctx, auroraBands, viewW, state.elapsedSeconds, state.reducedMotion);
        }
        if (showCompass) {
          this.landmarks.renderCompassOverlay(ctx, state, camX, camY, zoom, viewW, viewH);
        }
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
    // and 8x8 terrain chunk aligns cleanly to screen pixels with zero hairline seams.
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

  private fillColorGrade(base: BiomeColorGrade, state: OverworldSceneState): BiomeColorGrade {
    const twilight = clamp(Math.abs(state.timeOfDay - 0.5) * 2, 0, 1);
    const ambientShift = (0.5 - twilight) * 0.08;
    const g = this.colorGradeScratch;
    g.biomeId = base.biomeId;
    g.ambientRgb[0] = base.ambientRgb[0];
    g.ambientRgb[1] = base.ambientRgb[1];
    g.ambientRgb[2] = base.ambientRgb[2];
    g.ambientStrength = clamp(base.ambientStrength + ambientShift, 0.58, 0.96);
    g.tintRgb[0] = base.tintRgb[0];
    g.tintRgb[1] = base.tintRgb[1];
    g.tintRgb[2] = base.tintRgb[2];
    g.contrast = base.contrast;
    g.saturation = base.saturation;
    g.bloomIntensity = base.bloomIntensity;
    g.bloomThreshold = base.bloomThreshold;
    g.vignetteStrength = base.vignetteStrength;
    g.skyTopHex = base.skyTopHex;
    g.skyHorizonHex = base.skyHorizonHex;
    g.starlightGlow = clamp(base.starlightGlow * (0.75 + 0.35 * twilight), 0.25, 1.0);
    return g;
  }

  private fillWaterConfig(
    base: Omit<WaterConfig, 'time'>,
    state: OverworldSceneState,
  ): WaterConfig {
    const w = this.waterConfigScratch;
    w.enabled = base.enabled;
    w.time = state.elapsedSeconds;
    w.skyTopColor[0] = base.skyTopColor[0];
    w.skyTopColor[1] = base.skyTopColor[1];
    w.skyTopColor[2] = base.skyTopColor[2];
    w.skyBottomColor[0] = base.skyBottomColor[0];
    w.skyBottomColor[1] = base.skyBottomColor[1];
    w.skyBottomColor[2] = base.skyBottomColor[2];
    w.starlightIntensity = base.starlightIntensity;
    w.waveAmplitude = state.reducedMotion ? base.waveAmplitude * 0.25 : base.waveAmplitude;
    w.foamColor[0] = base.foamColor[0];
    w.foamColor[1] = base.foamColor[1];
    w.foamColor[2] = base.foamColor[2];
    return w;
  }

  private fillCanopyConfig(
    base: CanopyShadowConfig,
    state: OverworldSceneState,
  ): CanopyShadowConfig {
    const motionScale = state.reducedMotion ? 0.2 : 1.0;
    const c = this.canopyConfigScratch;
    c.enabled = base.enabled;
    c.sunbeamIntensity = base.sunbeamIntensity;
    c.sunbeamAngle = base.sunbeamAngle;
    c.sunbeamColor[0] = base.sunbeamColor[0];
    c.sunbeamColor[1] = base.sunbeamColor[1];
    c.sunbeamColor[2] = base.sunbeamColor[2];
    c.cloudSpeedX = base.cloudSpeedX * motionScale;
    c.cloudSpeedY = base.cloudSpeedY * motionScale;
    c.cloudOpacity = base.cloudOpacity;
    return c;
  }

  private updateAmbientMotes(state: OverworldSceneState, dt: number): void {
    const { currentBiomeId, reducedMotion, elapsedSeconds } = state;
    const spec = BIOME_WEATHER_SPECS[currentBiomeId] ?? BIOME_WEATHER_SPECS.village;
    const targetCount = reducedMotion ? 6 : 18;

    while (this.ambientMotes.length < targetCount) {
      const s = this.moteSeedCounter++;
      const r1 = hash2D(s, 11, 3);
      const r2 = hash2D(s, 23, 7);
      const r3 = hash2D(s, 37, 13);

      this.ambientMotes.push({
        nx: r1,
        ny: r2,
        vx: spec.vxBase + (r3 - 0.5) * spec.vxSpread,
        vy: spec.vyBase + (r1 - 0.5) * spec.vySpread,
        radius: spec.radiusMin + r2 * spec.radiusSpread,
        phase: r3 * Math.PI * 2,
        life: r1 * 4,
        maxLife: 4.5 + r2 * 4.5,
        variant: s % 3,
      });
    }

    if (this.ambientMotes.length > targetCount) {
      this.ambientMotes.length = targetCount;
    }

    const motionMul = reducedMotion ? 0.25 : 1.0;
    for (let i = 0; i < this.ambientMotes.length; i++) {
      const m = this.ambientMotes[i];
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
    _accentHex: string,
  ): void {
    const spec = BIOME_WEATHER_SPECS[state.currentBiomeId] ?? BIOME_WEATHER_SPECS.village;
    const baseAlpha = state.reducedMotion ? 0.32 : 0.62;
    const spanW = Math.max(1, bounds.maxPxX - bounds.minPxX);
    const spanH = Math.max(1, bounds.maxPxY - bounds.minPxY);

    for (let i = 0; i < this.ambientMotes.length; i++) {
      const m = this.ambientMotes[i];
      const lifeFrac = m.life / m.maxLife;
      const pulse = Math.sin(lifeFrac * Math.PI);
      const twinkle = 0.52 + 0.48 * Math.sin(state.elapsedSeconds * 2.9 + m.phase);
      const alpha = clamp(pulse * twinkle * baseAlpha, 0, 0.85);
      if (alpha <= 0.02) continue;

      const rgb = spec.colors[m.variant % 3];
      backend.drawParticle({
        x: bounds.minPxX + m.nx * spanW,
        y: bounds.minPxY + m.ny * spanH,
        radius: m.radius,
        color: [rgb[0], rgb[1], rgb[2], alpha],
        softness: spec.isPetal ? 0.4 : 0.78,
        additive: spec.additive,
        stretchX: spec.stretchX,
        stretchY: spec.stretchY,
        rotation: spec.isPetal ? m.phase + state.elapsedSeconds * 0.9 : 0,
      });
    }
  }

  private detectCelebrationTriggers(state: OverworldSceneState, reducedMotion: boolean): void {
    if (!this.prevStateTracked) {
      for (let i = 0; i < state.chests.length; i++) {
        if (state.chests[i].opened) this.prevOpenedChestIds.add(state.chests[i].id);
      }
      for (let i = 0; i < state.shrines.length; i++) {
        if (state.shrines[i].cleared) this.prevClearedShrineIds.add(state.shrines[i].id);
      }
      for (let i = 0; i < state.rivals.length; i++) {
        if (state.rivals[i].defeated) this.prevDefeatedRivalIds.add(state.rivals[i].id);
      }
      for (let i = 0; i < state.npcs.length; i++) {
        if (state.npcs[i].questCompleted) this.prevCompletedQuestNpcIds.add(state.npcs[i].id);
      }
      this.prevDiscoveryCount = state.discoveryNodes.length;
      this.prevStateTracked = true;
      return;
    }

    for (let i = 0; i < state.chests.length; i++) {
      const ch = state.chests[i];
      if (ch.opened && !this.prevOpenedChestIds.has(ch.id)) {
        this.prevOpenedChestIds.add(ch.id);
        if (!reducedMotion) this.triggerCelebrationBurst(ch.x, ch.y, 'gold', state.tileSize);
      }
    }
    for (let i = 0; i < state.shrines.length; i++) {
      const sh = state.shrines[i];
      if (sh.cleared && !this.prevClearedShrineIds.has(sh.id)) {
        this.prevClearedShrineIds.add(sh.id);
        if (!reducedMotion) this.triggerCelebrationBurst(sh.x, sh.y, 'starlight', state.tileSize);
      }
    }
    for (let i = 0; i < state.rivals.length; i++) {
      const rv = state.rivals[i];
      if (rv.defeated && !this.prevDefeatedRivalIds.has(rv.id)) {
        this.prevDefeatedRivalIds.add(rv.id);
        if (!reducedMotion) this.triggerCelebrationBurst(rv.x, rv.y, 'gold', state.tileSize);
      }
    }
    for (let i = 0; i < state.npcs.length; i++) {
      const npc = state.npcs[i];
      if (npc.questCompleted && !this.prevCompletedQuestNpcIds.has(npc.id)) {
        this.prevCompletedQuestNpcIds.add(npc.id);
        if (!reducedMotion) this.triggerCelebrationBurst(npc.x, npc.y, 'quest', state.tileSize);
      }
    }
    if (this.prevDiscoveryCount > 0 && state.discoveryNodes.length < this.prevDiscoveryCount) {
      if (!reducedMotion) {
        this.triggerCelebrationBurst(state.player.x, state.player.y, 'starlight', state.tileSize);
      }
    }
    this.prevDiscoveryCount = state.discoveryNodes.length;
  }

  private updateCelebrationParticles(dt: number): void {
    const arr = this.celebrationParticles;
    if (arr.length === 0) return;
    let write = 0;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      if (p.shape !== 'ring') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.gravity * dt;
        p.vx *= 0.98;
      }
      arr[write++] = p;
    }
    arr.length = write;
  }

  private renderCelebrationParticles(ctx: CanvasRenderingContext2D): void {
    const arr = this.celebrationParticles;
    ctx.save();
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      const prog = clamp(p.life / Math.max(0.01, p.maxLife), 0, 1);
      const alpha = 1 - prog;
      if (alpha <= 0.02) continue;
      const px = Math.round(p.x);
      const py = Math.round(p.y);

      if (p.shape === 'ring') {
        const eased = 1 - (1 - prog) * (1 - prog);
        const r = Math.max(2, p.startRadius + (p.endRadius - p.startRadius) * eased);
        ctx.globalAlpha = alpha * 0.85;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        if (typeof ctx.ellipse === 'function') {
          ctx.ellipse(px, py, r, r * 0.48, 0, 0, Math.PI * 2);
        } else {
          ctx.arc(px, py, r, 0, Math.PI * 2);
        }
        ctx.stroke();
      } else if (p.shape === 'star') {
        const arm = Math.max(2, Math.round(p.size * 1.4));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(px - arm, py, arm * 2 + 1, 1);
        ctx.fillRect(px, py - arm, 1, arm * 2 + 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px, py, 1, 1);
      } else if (p.shape === 'diamond') {
        const r = Math.max(2, Math.round(p.size));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(px - r + 1, py - 1, r * 2 - 2, 3);
        ctx.fillRect(px - 1, py - r + 1, 3, r * 2 - 2);
      } else {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(px - 1, py - 1, 2, Math.max(2, Math.round(p.size * 1.2)));
      }
    }
    ctx.restore();
  }

  /**
   * V1-parity Starlight Warp arrival pillar + dual counter-rotating rune rings & sparks
   * (zero gradient allocations, purely crisp pixel geometry).
   */
  private renderWarpArrivalBeam(ctx: CanvasRenderingContext2D, elapsedSeconds: number): void {
    const progress = clamp(1 - this.warpBeamTimer / this.warpBeamDuration, 0, 1);
    const alpha = Math.max(0, 1 - progress * progress);
    if (alpha <= 0.02) return;

    const cx = Math.round(this.warpBeamWorldX);
    const cy = Math.round(this.warpBeamWorldY);
    const isSafe = this.warpBeamIsSafe;
    const pillarW = Math.max(6, Math.round(26 * (1 - progress * 0.65)));
    const coreW = Math.max(2, Math.round(pillarW * 0.42));
    const pillarH = 140;
    const ringR = 7 + progress * 24;

    ctx.save();
    ctx.globalAlpha = alpha * 0.34;
    ctx.fillStyle = isSafe ? '#4ade80' : '#38bdf8';
    ctx.fillRect(cx - (pillarW >> 1), cy - pillarH, pillarW, pillarH + 12);
    ctx.globalAlpha = alpha * 0.46;
    ctx.fillStyle = isSafe ? '#fbbf24' : '#c084fc';
    ctx.fillRect(cx - Math.round(pillarW * 0.34), cy - pillarH, Math.round(pillarW * 0.68), pillarH + 12);
    ctx.globalAlpha = alpha * 0.82;
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(cx - (coreW >> 1), cy - pillarH, coreW, pillarH + 12);

    // Ascending light sparks inside the beam
    for (let m = 0; m < 6; m++) {
      const mp = (progress * 1.5 + m * 0.16) % 1;
      const my = Math.round(cy + 10 - mp * pillarH);
      const mx = Math.round(cx + Math.sin(m * 2.1 + progress * 9) * (pillarW * 0.4));
      ctx.globalAlpha = alpha * Math.sin(mp * Math.PI) * 0.9;
      ctx.fillStyle = m % 2 === 0 ? '#ffffff' : isSafe ? '#86efac' : '#67e8f9';
      ctx.fillRect(mx - 1, my - 2, 2, 5);
    }

    // Dual counter-rotating pixel rune sparks around base ring
    const spinCw = progress * Math.PI * 2 + elapsedSeconds * 5;
    const spinCcw = -progress * Math.PI * 2.6 - elapsedSeconds * 6;
    for (let i = 0; i < 8; i++) {
      const a = spinCw + (Math.PI / 4) * i;
      const sx = Math.round(cx + Math.cos(a) * ringR);
      const sy = Math.round(cy + 10 + Math.sin(a) * ringR * 0.42);
      ctx.globalAlpha = alpha * 0.92;
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : isSafe ? '#86efac' : '#fde047';
      ctx.fillRect(sx - 1, sy - 1, 3, 3);
    }
    for (let i = 0; i < 6; i++) {
      const a = spinCcw + (Math.PI / 3) * i;
      const sx = Math.round(cx + Math.cos(a) * ringR * 0.65);
      const sy = Math.round(cy + 10 + Math.sin(a) * ringR * 0.28);
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = i % 2 === 0 ? (isSafe ? '#fde047' : '#e879f9') : '#67e8f9';
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
    }
    ctx.restore();
  }

  /**
   * V1-parity dancing aurora shimmer ribbons at top of viewport for celestial/polar biomes
   * (peak, crater, faeveldt, rift, sanctum) with zero gradient allocations.
   */
  private renderBiomeAuroraBands(
    ctx: CanvasRenderingContext2D,
    bands: readonly [string, string, string],
    viewW: number,
    elapsedSeconds: number,
    reducedMotion: boolean,
  ): void {
    const t = reducedMotion ? 0 : elapsedSeconds;
    ctx.save();
    for (let b = 0; b < bands.length; b++) {
      const waveY = 18 + b * 18 + Math.sin(t * 1.4 + b * 1.7) * 9;
      const shiftX = Math.sin(t * 0.9 + b * 2.1) * 36;
      ctx.fillStyle = bands[b];
      ctx.beginPath();
      ctx.moveTo(0, waveY + 10);
      ctx.quadraticCurveTo(viewW * 0.35 + shiftX, waveY - 14, viewW * 0.7, waveY + 14);
      ctx.quadraticCurveTo(viewW * 0.88 - shiftX * 0.5, waveY + 24, viewW, waveY + 6);
      ctx.lineTo(viewW, waveY + 34);
      ctx.lineTo(0, waveY + 34);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
