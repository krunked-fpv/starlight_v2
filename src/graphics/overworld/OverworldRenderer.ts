import type {
  AtlasManifest,
  BiomeColorGrade,
  BiomeId,
  CanopyShadowConfig,
  IOverworldRenderer,
  IRenderBackend,
  OverworldSceneState,
  PointLight,
  WaterConfig,
} from '../../contracts';
import { BIOME_COLOR_GRADES } from '../../core/data/biomes';
import {
  AutotileRenderer,
  clamp,
  hash2D,
  hexToRgb01,
  lerp,
  type ViewTileBounds,
} from './AutotileRenderer';
import { CharacterRigRenderer } from './CharacterRigRenderer';
import { LandmarkRenderer } from './LandmarkRenderer';

const MAX_RENDER_LIGHTS = 24;

interface AmbientMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  life: number;
  maxLife: number;
  useAccent: boolean;
}

interface DioramaDrawItem {
  sortY: number;
  order: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

const SUNBEAM_BIOMES = new Set<BiomeId>([
  'verdant-canopy',
  'amber-thicket',
  'starbloom-glade',
  'meadow',
  'valor-dojo',
  'mist-hollow',
]);

const CLOUD_BIOMES = new Set<BiomeId>([
  'starlight-village',
  'meadow',
  'verdant-canopy',
  'sapphire-lagoon',
  'volt-highlands',
  'frost-glacier',
  'valor-dojo',
  'ochre-canyon',
  'zephyr-peaks',
  'amber-thicket',
  'basalt-quarry',
  'mist-hollow',
  'drake-summit',
  'starbloom-glade',
]);

export class OverworldRenderer implements IOverworldRenderer {
  private readonly autotile = new AutotileRenderer();
  private readonly landmarks = new LandmarkRenderer();
  private readonly characters = new CharacterRigRenderer();

  private cameraInitialized = false;
  private camCenterX = 0;
  private camCenterY = 0;
  private cameraZoom = 1;
  private lastViewportWidth = 960;
  private lastViewportHeight = 540;
  private lastBiomeId: BiomeId | null = null;

  private ambientMotes: AmbientMote[] = [];
  private moteSeedCounter = 1;
  private dioramaQueue: DioramaDrawItem[] = [];

  attachAtlas(manifest: AtlasManifest | null): void {
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
   * Advances spring-physics grass displacement, footstep decals, damped camera tracking,
   * and biome atmospheric particle simulation.
   */
  update(state: OverworldSceneState, dtSeconds: number): void {
    const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
    const { map, biome, player, reducedMotion } = state;
    const { tileSize } = map;

    const biomeChanged = this.lastBiomeId !== biome.id;
    if (biomeChanged) {
      this.ambientMotes.length = 0;
      this.lastBiomeId = biome.id;
    }

    // Update subsystems
    this.autotile.update(state, dt);
    this.characters.update(state, dt);

    // Smooth damped camera tracking clamped to map bounds
    const targetX = player.x * tileSize;
    const targetY = player.y * tileSize;
    if (!this.cameraInitialized || biomeChanged) {
      this.camCenterX = targetX;
      this.camCenterY = targetY;
      this.cameraInitialized = true;
    } else {
      const followRate = reducedMotion ? 1.0 : 1 - Math.exp(-8.5 * dt);
      this.camCenterX = lerp(this.camCenterX, targetX, followRate);
      this.camCenterY = lerp(this.camCenterY, targetY, followRate);
    }

    this.updateAmbientMotes(state, dt);
  }

  /**
   * Renders the complete 2.5D Starlight diorama frame onto the active IRenderBackend.
   */
  render(backend: IRenderBackend, state: OverworldSceneState): void {
    const { map, biome } = state;
    const { width, height, tileSize, tiles } = map;

    const viewport = this.resolveViewportSize(backend);
    const vw = viewport.width;
    const vh = viewport.height;
    const zoom = this.cameraZoom;

    const mapPxW = width * tileSize;
    const mapPxH = height * tileSize;

    // Initialize camera center cleanly even if render() is called before update()
    if (!this.cameraInitialized || this.lastBiomeId !== biome.id) {
      this.camCenterX = state.player.x * tileSize;
      this.camCenterY = state.player.y * tileSize;
      this.cameraInitialized = true;
      this.lastBiomeId = biome.id;
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

    // Configure per-biome ColorGrade, WaterConfig, and CanopyShadowConfig
    const grade = this.buildBiomeColorGrade(state);
    backend.setColorGrade(grade);
    backend.setWaterConfig(this.buildWaterConfig(state, grade));
    backend.setCanopyConfig(this.buildCanopyConfig(state));

    // Compute visible world tile bounds with generous padding
    const halfViewW = (vw / zoom) * 0.5;
    const halfViewH = (vh / zoom) * 0.5;
    const minPxX = clampedCenterX - halfViewW - tileSize * 2;
    const maxPxX = clampedCenterX + halfViewW + tileSize * 2;
    const minPxY = clampedCenterY - halfViewH - tileSize * 2;
    const maxPxY = clampedCenterY + halfViewH + tileSize * 2;

    const bounds: ViewTileBounds = {
      minTx: clamp(Math.floor(minPxX / tileSize), 0, width - 1),
      maxTx: clamp(Math.ceil(maxPxX / tileSize), 0, width - 1),
      minTy: clamp(Math.floor(minPxY / tileSize), 0, height - 1),
      maxTy: clamp(Math.ceil(maxPxY / tileSize), 0, height - 1),
      minPxX,
      minPxY,
      maxPxX,
      maxPxY,
    };

    // Emit prioritized real-time 2D PointLights (capped cleanly at MAX_RENDER_LIGHTS = 24)
    const lights: PointLight[] = [];
    this.characters.collectPlayerAuraLight(state, lights);
    this.landmarks.collectLights(state, lights, MAX_RENDER_LIGHTS);
    this.autotile.collectPropLights(state, bounds, lights, MAX_RENDER_LIGHTS);

    for (let i = 0; i < lights.length && i < MAX_RENDER_LIGHTS; i++) {
      backend.addPointLight(lights[i]);
    }

    // Pass 1: Terrain base, baked 'terrain' atlas sprites, and translucent multi-depth water
    this.autotile.renderTerrainBaseAndWater(backend, state, bounds, {
      camX,
      camY,
      camZoom: zoom,
    });

    // Pass 2: Handcrafted 47-tile overlays + Y-sorted 2.5D diorama entities (single hybrid 2D pass)
    backend.drawCustom2D((ctx, viewW, viewH) => {
      this.lastViewportWidth = viewW;
      this.lastViewportHeight = viewH;

      ctx.save();
      ctx.translate(viewW * 0.5, viewH * 0.5);
      if (zoom !== 1) ctx.scale(zoom, zoom);
      ctx.translate(-viewW * 0.5 - camX, -viewH * 0.5 - camY);

      // Handcrafted shoreline bevels, cliff drop-shadows, cobble seams, bridge planks, plaza inlays
      this.autotile.renderTerrainDetailOverlays(ctx, state, bounds);

      // Grounded footsteps & world wayfinding/interaction floor rings
      this.characters.renderFootsteps(ctx);
      this.landmarks.renderWayfindingWorldRing(ctx, state);
      this.landmarks.renderNearbyInteractionHalo(ctx, state);

      // Build Y-sorted diorama queue across tall grass, props, landmarks, and actors
      const queue = this.dioramaQueue;
      queue.length = 0;
      let order = 0;

      for (let ty = bounds.minTy; ty <= bounds.maxTy; ty++) {
        for (let tx = bounds.minTx; tx <= bounds.maxTx; tx++) {
          if (tiles[ty * width + tx] === 'tall-grass') {
            const tileX = tx;
            const tileY = ty;
            queue.push({
              sortY: (tileY + 0.44) * tileSize,
              order: order++,
              draw: (c) => this.autotile.renderTallGrassLayer(c, state, tileX, tileY, 'back'),
            });
            queue.push({
              sortY: (tileY + 0.88) * tileSize,
              order: order++,
              draw: (c) => this.autotile.renderTallGrassLayer(c, state, tileX, tileY, 'front'),
            });
          }
        }
      }

      for (const prop of map.props) {
        if (
          prop.tileX < bounds.minTx - 1 ||
          prop.tileX > bounds.maxTx + 1 ||
          prop.tileY < bounds.minTy - 1 ||
          prop.tileY > bounds.maxTy + 1
        ) {
          continue;
        }
        queue.push({
          sortY: (prop.tileY + 0.82) * tileSize,
          order: order++,
          draw: (c) =>
            this.autotile.renderProp(
              c,
              prop,
              biome,
              tileSize,
              state.elapsedSeconds,
              state.reducedMotion,
            ),
        });
      }

      for (const lm of map.landmarks) {
        const sortY =
          lm.kind === 'dock'
            ? lm.tileY * tileSize - 1
            : (lm.tileY + lm.heightTiles - 0.08) * tileSize;
        queue.push({
          sortY,
          order: order++,
          draw: (c) => this.landmarks.renderLandmark(c, lm, state),
        });
      }

      const actors = [state.player, state.follower, ...state.npcs];
      for (const actor of actors) {
        queue.push({
          sortY: actor.y * tileSize,
          order: order++,
          draw: (c) => this.characters.renderActor(c, actor, state),
        });
      }

      queue.sort((a, b) => (a.sortY !== b.sortY ? a.sortY - b.sortY : a.order - b.order));
      for (let i = 0; i < queue.length; i++) {
        queue[i].draw(ctx);
      }

      ctx.restore();
    }, 'world');

    // Pass 3: Atmospheric biome particles & equipped player aura particles
    this.emitAtmosphericParticles(backend, state, bounds);
    this.characters.emitAuraParticles(backend, state);

    // Pass 4: Screen-space vector wayfinding compass arrow for off-screen targets
    if (state.activeWayfindingTarget) {
      backend.drawCustom2D((ctx, viewW, viewH) => {
        this.landmarks.renderWayfindingScreenCompass(ctx, state, camX, camY, zoom, viewW, viewH);
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
        return { width: cw, height: ch };
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

  private buildBiomeColorGrade(state: OverworldSceneState): BiomeColorGrade {
    const base = BIOME_COLOR_GRADES[state.biome.id] ?? BIOME_COLOR_GRADES['starlight-village'];
    const twilight = clamp(Math.abs(state.timeOfDay - 0.5) * 2, 0, 1);
    const ambientShift = (0.5 - twilight) * 0.1;

    return {
      ...base,
      ambientRgb: [...base.ambientRgb],
      tintRgb: [...base.tintRgb],
      ambientStrength: clamp(base.ambientStrength + ambientShift, 0.58, 0.96),
      starlightGlow: clamp(base.starlightGlow * (0.7 + 0.45 * twilight), 0.2, 1.0),
    };
  }

  private buildWaterConfig(state: OverworldSceneState, grade: BiomeColorGrade): WaterConfig {
    const twilight = clamp(Math.abs(state.timeOfDay - 0.5) * 2, 0, 1);
    const isVolcanic = state.biome.id === 'ember-caldera';
    const isBayou = state.biome.id === 'mire-bayou';

    return {
      enabled: true,
      time: state.elapsedSeconds,
      skyTopColor: hexToRgb01(grade.skyTopHex),
      skyBottomColor: hexToRgb01(grade.skyHorizonHex),
      starlightIntensity: clamp(grade.starlightGlow * (0.65 + 0.5 * twilight), 0.15, 1.3),
      waveAmplitude: state.reducedMotion ? 0.25 : isVolcanic ? 0.65 : 1.0,
      foamColor: isVolcanic
        ? [1.0, 0.84, 0.48]
        : isBayou
          ? [0.9, 0.82, 1.0]
          : [0.9, 0.97, 1.0],
    };
  }

  private buildCanopyConfig(state: OverworldSceneState): CanopyShadowConfig {
    const biomeId = state.biome.id;
    const hasSunbeams = SUNBEAM_BIOMES.has(biomeId);
    const hasClouds = CLOUD_BIOMES.has(biomeId);
    const enabled = hasSunbeams || hasClouds;
    const motionScale = state.reducedMotion ? 0.15 : 1.0;

    let sunbeamColor: [number, number, number] = [1.0, 0.94, 0.74];
    let sunbeamIntensity = 0;

    if (biomeId === 'verdant-canopy') {
      sunbeamColor = [0.88, 1.0, 0.76];
      sunbeamIntensity = 0.48;
    } else if (biomeId === 'amber-thicket') {
      sunbeamColor = [1.0, 0.92, 0.58];
      sunbeamIntensity = 0.42;
    } else if (biomeId === 'starbloom-glade') {
      sunbeamColor = [1.0, 0.82, 0.95];
      sunbeamIntensity = 0.36;
    } else if (biomeId === 'meadow') {
      sunbeamColor = [1.0, 0.96, 0.78];
      sunbeamIntensity = 0.32;
    } else if (biomeId === 'valor-dojo') {
      sunbeamColor = [1.0, 0.88, 0.76];
      sunbeamIntensity = 0.28;
    } else if (biomeId === 'mist-hollow') {
      sunbeamColor = [0.76, 0.82, 1.0];
      sunbeamIntensity = 0.16;
    }

    return {
      enabled,
      sunbeamIntensity,
      sunbeamAngle: -0.45,
      sunbeamColor,
      cloudSpeedX: 0.35 * motionScale,
      cloudSpeedY: 0.14 * motionScale,
      cloudOpacity: hasClouds ? (biomeId === 'mist-hollow' ? 0.38 : 0.26) : 0,
    };
  }

  private updateAmbientMotes(state: OverworldSceneState, dt: number): void {
    const { map, biome, reducedMotion } = state;
    const targetCount = reducedMotion ? 8 : 26;
    const mapPxW = map.width * map.tileSize;
    const mapPxH = map.height * map.tileSize;

    while (this.ambientMotes.length < targetCount) {
      const s = this.moteSeedCounter++;
      const r1 = hash2D(s, 11, 3);
      const r2 = hash2D(s, 23, 7);
      const r3 = hash2D(s, 37, 13);
      const tag = biome.ambientTag;

      let vx = (r3 - 0.5) * 14;
      let vy = (r1 - 0.5) * 10;
      let radius = 3.2 + r2 * 3.8;

      if (tag === 'volcanic-embers' || tag === 'foundry-sparks') {
        vx = (r3 - 0.4) * 16;
        vy = -14 - r1 * 18;
        radius = 2.6 + r2 * 2.5;
      } else if (tag === 'aurora-frost') {
        vx = -8 + r3 * 16;
        vy = 10 + r1 * 14;
        radius = 2.5 + r2 * 3.2;
      } else if (tag === 'petal-glow' || tag === 'sunlit-breeze') {
        vx = 12 + r3 * 14;
        vy = 6 + r1 * 8;
        radius = 3.0 + r2 * 2.6;
      }

      this.ambientMotes.push({
        x: r1 * mapPxW,
        y: r2 * mapPxH,
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
      m.x += m.vx * dt * motionMul + Math.sin(state.elapsedSeconds * 1.4 + m.phase) * 5 * dt * motionMul;
      m.y += m.vy * dt * motionMul;

      if (m.x < 0) m.x += mapPxW;
      if (m.x >= mapPxW) m.x -= mapPxW;
      if (m.y < 0) m.y += mapPxH;
      if (m.y >= mapPxH) m.y -= mapPxH;
      if (m.life >= m.maxLife) m.life %= m.maxLife;
    }
  }

  private emitAtmosphericParticles(
    backend: IRenderBackend,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
  ): void {
    const [ar, ag, ab] = hexToRgb01(state.biome.accentHex);
    const isPetal =
      state.biome.ambientTag === 'petal-glow' || state.biome.ambientTag === 'sunlit-breeze';
    const baseAlpha = state.reducedMotion ? 0.32 : 0.62;

    for (const m of this.ambientMotes) {
      if (
        m.x < bounds.minPxX ||
        m.x > bounds.maxPxX ||
        m.y < bounds.minPxY ||
        m.y > bounds.maxPxY
      ) {
        continue;
      }

      const lifeFrac = m.life / m.maxLife;
      const pulse = Math.sin(lifeFrac * Math.PI);
      const twinkle = 0.55 + 0.45 * Math.sin(state.elapsedSeconds * 2.8 + m.phase);
      const alpha = clamp(pulse * twinkle * baseAlpha, 0, 0.85);
      if (alpha <= 0.02) continue;

      backend.drawParticle({
        x: m.x,
        y: m.y,
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
