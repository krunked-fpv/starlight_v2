import type {
  AtlasManifest,
  BiomeColorGrade,
  BiomeId,
  CanopyShadowConfig,
  IOverworldRenderer,
  IRenderBackend,
  OverworldSceneState,
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

export class OverworldRenderer implements IOverworldRenderer {
  private readonly autotile = new AutotileRenderer();
  private readonly landmarks = new LandmarkRenderer();
  private readonly characters = new CharacterRigRenderer();

  private manifest: AtlasManifest | null = null;
  private cameraInitialized = false;
  private camCenterX = 0;
  private camCenterY = 0;
  private cameraZoom = 1;
  private lastViewportWidth = 960;
  private lastViewportHeight = 540;
  private viewportKnownFromBackend = false;
  private lastBiomeId: BiomeId | null = null;

  private ambientMotes: AmbientMote[] = [];
  private moteSeedCounter = 1;
  private spriteQueue: SpriteDrawCmd[] = [];
  private lightCandidates: LightCandidate[] = [];

  attachAtlas(manifest: AtlasManifest | null): void {
    this.manifest = manifest;
    this.autotile.setManifest(manifest);
  }

  getDisplacementCount(): number {
    return this.autotile.getDisplacementCount();
  }

  resetEffects(): void {
    this.autotile.resetEffects();
    this.characters.resetEffects();
    this.ambientMotes.length = 0;
    this.cameraInitialized = false;
    this.lastBiomeId = null;
  }

  /**
   * Advances spring-physics tall grass displacement, terrain-aware footsteps,
   * damped camera tracking, and biome atmospheric motes.
   */
  update(state: OverworldSceneState, dtSeconds: number): void {
    const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
    const { tileSize, currentBiomeId, player, reducedMotion } = state;

    const biomeChanged = this.lastBiomeId !== currentBiomeId;
    if (biomeChanged) {
      this.ambientMotes.length = 0;
      this.lastBiomeId = currentBiomeId;
    }

    this.autotile.update(state, dt);
    this.characters.update(state, dt);

    const targetX = (player.x + 0.5) * tileSize;
    const targetY = (player.y + 0.5) * tileSize;
    if (!this.cameraInitialized || biomeChanged) {
      this.camCenterX = targetX;
      this.camCenterY = targetY;
      this.cameraInitialized = true;
    } else {
      const followRate = reducedMotion ? 1.0 : 1 - Math.exp(-9.0 * dt);
      this.camCenterX = lerp(this.camCenterX, targetX, followRate);
      this.camCenterY = lerp(this.camCenterY, targetY, followRate);
    }

    this.updateAmbientMotes(state, dt);
  }

  /**
   * Renders the complete 100x84 frustum-culled HD-2D pixel overworld frame onto IRenderBackend.
   */
  render(backend: IRenderBackend, state: OverworldSceneState): void {
    const { cols, rows, tileSize, currentBiomeId } = state;

    const viewport = this.resolveViewportSize(backend);
    const vw = viewport.width;
    const vh = viewport.height;
    const zoom = this.cameraZoom;

    const mapPxW = cols * tileSize;
    const mapPxH = rows * tileSize;

    if (!this.cameraInitialized || this.lastBiomeId !== currentBiomeId) {
      this.camCenterX = (state.player.x + 0.5) * tileSize;
      this.camCenterY = (state.player.y + 0.5) * tileSize;
      this.cameraInitialized = true;
      this.lastBiomeId = currentBiomeId;
    }

    const clampedCenterX = this.clampCenterCoord(this.camCenterX, mapPxW, vw / zoom);
    const clampedCenterY = this.clampCenterCoord(this.camCenterY, mapPxH, vh / zoom);
    this.camCenterX = clampedCenterX;
    this.camCenterY = clampedCenterY;

    const camX = clampedCenterX - vw * 0.5;
    const camY = clampedCenterY - vh * 0.5;

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

    // Frustum culling: visible viewport + 2 tile margin on each edge
    const halfViewW = (vw / zoom) * 0.5;
    const halfViewH = (vh / zoom) * 0.5;
    const marginPx = tileSize * 2;
    const minPxX = clampedCenterX - halfViewW - marginPx;
    const maxPxX = clampedCenterX + halfViewW + marginPx;
    const minPxY = clampedCenterY - halfViewH - marginPx;
    const maxPxY = clampedCenterY + halfViewH + marginPx;

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
      ctx.translate(-viewW * 0.5 - camX, -viewH * 0.5 - camY);

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
      ctx.translate(-viewW * 0.5 - camX, -viewH * 0.5 - camY);

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

  private resolveViewportSize(backend: IRenderBackend): { width: number; height: number } {
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
      let radius = 2.8 + r2 * 3.2;

      if (EMBER_BIOMES.has(currentBiomeId)) {
        vx = (r3 - 0.4) * 0.04;
        vy = -0.035 - r1 * 0.04;
        radius = 2.4 + r2 * 2.2;
      } else if (FROST_BIOMES.has(currentBiomeId)) {
        vx = -0.02 + r3 * 0.04;
        vy = 0.025 + r1 * 0.035;
        radius = 2.4 + r2 * 2.8;
      } else if (PETAL_BIOMES.has(currentBiomeId)) {
        vx = 0.028 + r3 * 0.035;
        vy = 0.015 + r1 * 0.02;
        radius = 2.8 + r2 * 2.4;
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
