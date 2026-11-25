import {
  SpriteAssetLoader,
  getBiomeVisualProfile,
  TYPE_PALETTES,
} from '../../core';
import type {
  AtlasManifest,
  BattleCameraCue,
  BattleCombatantVisual,
  BattleSceneState,
  BattleShutterState,
  BattleVfxEvent,
  BiomeColorGrade,
  BiomeId,
  CanopyShadowConfig,
  EncounterTier,
  IBattleTheaterRenderer,
  IOfflineSpriteRigSynthesizer,
  IRenderBackend,
  OfflineRigDescriptor,
} from '../../contracts';
import {
  BATTLE_ARENAS,
  applyCameraToContext,
  clamp,
  computeBattleStageLayout,
  drawPixelCrossStar,
  drawPixelSteppedDisc,
  emitArenaPointLights,
  hexToRgba,
  renderArenaBackdrop,
  renderArenaForeground,
  type BattleArenaDescriptor,
  type BattleCameraTransform,
  type BattleStageLayout,
} from './BattleArenas';
import { BattleVfxDirector } from './BattleVfxDirector';
import { OfflineSpriteRigSynthesizer } from './OfflineSpriteRigSynthesizer';
import {
  SILHOUETTE_CONTOUR_PAD,
  getSpriteSilhouetteContour,
  measureSpriteOpaqueBounds,
} from './SpriteSilhouette';

function buildBattleColorGrade(base: BiomeColorGrade): BiomeColorGrade {
  // Preserve rich biome atmosphere while protecting Pokémon sprite hues from extreme ambient tinting or bloom washout
  const liftAmbient = (c: number): number => clamp(c + (1 - c) * 0.48, 0.82, 1.04);
  const tameTint = (c: number): number => 1 + (c - 1) * 0.44;
  return {
    ...base,
    ambientRgb: [
      liftAmbient(base.ambientRgb[0]),
      liftAmbient(base.ambientRgb[1]),
      liftAmbient(base.ambientRgb[2]),
    ],
    ambientStrength: Math.max(base.ambientStrength, 0.88),
    tintRgb: [
      tameTint(base.tintRgb[0]),
      tameTint(base.tintRgb[1]),
      tameTint(base.tintRgb[2]),
    ],
    saturation: clamp(base.saturation, 1.0, 1.12),
    contrast: clamp(base.contrast, 0.99, 1.07),
    bloomIntensity: Math.min(base.bloomIntensity, 0.30),
    bloomThreshold: Math.max(base.bloomThreshold, 0.78),
    vignetteStrength: clamp(base.vignetteStrength * 0.84, 0.14, 0.28),
  };
}

function buildBattleCanopyConfig(base: CanopyShadowConfig): CanopyShadowConfig {
  return {
    ...base,
    sunbeamIntensity: base.sunbeamIntensity * 0.42,
    cloudOpacity: Math.min(base.cloudOpacity, 0.13),
  };
}

interface CameraSpringState {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  vx: number;
  vy: number;
  vZoom: number;
  vRot: number;
  shakeAmp: number;
  shakePhase: number;
}

const MAX_REDUCED_MOTION_SHUTTER_SEC = 0.22;

function getCueTargetPose(
  cue: BattleCameraCue,
  elapsed: number,
  time: number,
  reducedMotion: boolean,
): { x: number; y: number; zoom: number; rotation: number } {
  const motion = reducedMotion ? 0.2 : 1.0;
  switch (cue) {
    case 'hit': {
      const decay = Math.exp(-elapsed * 5.2);
      return {
        x: 20 * decay * motion,
        y: -9 * decay * motion,
        zoom: 1 + 0.045 * decay * (reducedMotion ? 0.45 : 1),
        rotation: reducedMotion ? 0 : 0.008 * decay,
      };
    }
    case 'heavyHit': {
      const decay = Math.exp(-elapsed * 3.8);
      return {
        x: 32 * decay * motion,
        y: -15 * decay * motion,
        zoom: 1 + 0.095 * decay * (reducedMotion ? 0.4 : 1),
        rotation: reducedMotion ? 0 : -0.018 * decay,
      };
    }
    case 'starBall': {
      const settle = clamp(elapsed * 2.6, 0, 1);
      return {
        x: 52 * settle * motion,
        y: -24 * settle * motion,
        zoom: 1 + 0.07 * settle * (reducedMotion ? 0.45 : 1),
        rotation: 0,
      };
    }
    case 'rivalIntro': {
      const pan = Math.sin(clamp(elapsed, 0, 1.4) * Math.PI * 0.72);
      return {
        x: (32 * pan - 10) * motion,
        y: -14 * pan * motion,
        zoom: 1 + 0.052 * pan * (reducedMotion ? 0.45 : 1),
        rotation: reducedMotion ? 0 : -0.01 * pan,
      };
    }
    case 'shrineGuardian': {
      const swell = Math.sin(clamp(elapsed, 0, 1.5) * Math.PI * 0.68);
      return {
        x: 22 * swell * motion,
        y: -26 * swell * motion,
        zoom: 1 + (elapsed < 0.4 ? -0.032 : 0.045 * swell) * (reducedMotion ? 0.4 : 1),
        rotation: 0,
      };
    }
    case 'evolution': {
      const focus = clamp(elapsed * 1.8, 0, 1);
      return {
        x: -50 * focus * motion,
        y: 22 * focus * motion,
        zoom: 1 + 0.09 * focus * (reducedMotion ? 0.45 : 1),
        rotation: 0,
      };
    }
    case 'idle':
    default: {
      const idleScale = reducedMotion ? 0.08 : 1.0;
      return {
        x: Math.sin(time * 0.45) * 5.5 * idleScale,
        y: Math.cos(time * 0.37) * 3.2 * idleScale,
        zoom: 1 + Math.sin(time * 0.3) * 0.006 * idleScale,
        rotation: 0,
      };
    }
  }
}

function getShinyTint(time: number, alpha: number, reducedMotion: boolean): [number, number, number, number] {
  if (reducedMotion) {
    return [1.0, 0.96, 0.84, alpha];
  }
  const phase = time * 2.6;
  const r = 0.9 + 0.1 * Math.sin(phase);
  const g = 0.9 + 0.1 * Math.sin(phase + 2.09);
  const b = 0.9 + 0.1 * Math.sin(phase + 4.18);
  return [r, g, b, alpha];
}

export class BattleTheaterRenderer implements IBattleTheaterRenderer {
  private readonly rigSynth = new OfflineSpriteRigSynthesizer();
  private readonly vfxDirector = new BattleVfxDirector();

  private manifest: AtlasManifest | null = null;
  private getArenaImageFn: ((biomeId: BiomeId) => HTMLImageElement | null) | null = null;
  private getSheetImageFn: ((sheetId: string) => HTMLImageElement | null) | null = null;
  private fallbackAttached = false;

  private vfxSeq = 0;
  private pendingShutter: BattleShutterState | null = null;
  private pendingVfx: BattleVfxEvent[] = [];
  private pendingCameraCue: BattleCameraCue | null = null;
  private lastObservedCue: BattleCameraCue = 'idle';
  private lastObservedCueSeq = -1;

  private spring: CameraSpringState = {
    x: 0,
    y: 0,
    zoom: 1,
    rotation: 0,
    vx: 0,
    vy: 0,
    vZoom: 0,
    vRot: 0,
    shakeAmp: 0,
    shakePhase: 0,
  };

  private cachedViewportWidth = 960;
  private cachedViewportHeight = 540;

  attachAssets(
    manifest: AtlasManifest | null,
    getArenaImage: (biomeId: BiomeId) => HTMLImageElement | null,
    getSheetImage: (sheetId: string) => HTMLImageElement | null,
  ): void {
    this.manifest = manifest;
    this.getArenaImageFn = getArenaImage;
    this.getSheetImageFn = getSheetImage;
    const fallbacks = getSheetImage('fallbacks');
    this.rigSynth.attachFallbackSheet(fallbacks, manifest);
    this.fallbackAttached = Boolean(fallbacks);
  }

  getOfflineRigSynthesizer(): IOfflineSpriteRigSynthesizer {
    return this.rigSynth;
  }

  getCameraTransform(reducedMotion = false): BattleCameraTransform {
    const shakeScale = reducedMotion ? 0 : this.spring.shakeAmp;
    return {
      x: this.spring.x,
      y: this.spring.y,
      zoom: this.spring.zoom,
      shakeX: shakeScale === 0 ? 0 : Math.sin(this.spring.shakePhase * 39.7) * shakeScale,
      shakeY: shakeScale === 0 ? 0 : Math.cos(this.spring.shakePhase * 47.3) * shakeScale * 0.72,
      rotation: reducedMotion ? 0 : this.spring.rotation,
    };
  }

  triggerShutter(tier: EncounterTier, reducedMotion: boolean): void {
    // Clear any stale VFX, camera cues, or spring recoil left over from a fled or previous battle
    this.pendingVfx.length = 0;
    this.pendingCameraCue = null;
    this.lastObservedCue = 'idle';
    this.lastObservedCueSeq = -1;
    this.spring = {
      x: 0,
      y: 0,
      zoom: 1,
      rotation: 0,
      vx: 0,
      vy: 0,
      vZoom: 0,
      vRot: 0,
      shakeAmp: 0,
      shakePhase: 0,
    };

    const duration = reducedMotion
      ? 0.2
      : tier === 'shrine' || tier === 'shrine-trial'
        ? 0.95
        : tier === 'rare'
          ? 0.88
          : tier === 'rival'
            ? 0.82
            : 0.72;
    this.pendingShutter = {
      active: true,
      tier,
      progress: 0,
      duration,
    };
  }

  triggerVfx(event: Omit<BattleVfxEvent, 'id' | 'elapsed'>): void {
    this.vfxSeq += 1;
    this.pendingVfx.push({
      ...event,
      id: `vfx-${this.vfxSeq}-${event.type}`,
      elapsed: 0,
      duration: Math.max(0.12, event.duration),
    });
  }

  triggerCameraCue(cue: BattleCameraCue): void {
    this.pendingCameraCue = cue;
    this.applyCueImpulse(cue, false);
  }

  private applyCueImpulse(cue: BattleCameraCue, reducedMotion: boolean): void {
    if (reducedMotion) {
      this.spring.shakeAmp = 0;
      return;
    }
    if (cue === 'hit') {
      this.spring.shakeAmp = Math.max(this.spring.shakeAmp, 9);
      this.spring.vZoom += 0.32;
    } else if (cue === 'heavyHit') {
      this.spring.shakeAmp = Math.max(this.spring.shakeAmp, 18);
      this.spring.vZoom += 0.64;
      this.spring.vRot -= 0.13;
    } else if (cue === 'shrineGuardian') {
      this.spring.shakeAmp = Math.max(this.spring.shakeAmp, 5.5);
    } else if (cue === 'rivalIntro') {
      this.spring.vx += 66;
    }
  }

  update(state: BattleSceneState, dtSeconds: number): void {
    const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
    state.elapsedSeconds += dt;

    if (this.pendingShutter) {
      state.shutter = { ...this.pendingShutter };
      state.phase = 'shutter';
      this.pendingShutter = null;
    }

    if (state.reducedMotion && state.shutter.active) {
      state.shutter.duration = Math.min(state.shutter.duration, MAX_REDUCED_MOTION_SHUTTER_SEC);
    }

    if (this.pendingVfx.length > 0) {
      for (const evt of this.pendingVfx) {
        state.activeVfx.push(evt);
        state.arenaLightingType = evt.type;
        state.arenaLightingPulse = 1;
      }
      this.pendingVfx.length = 0;
    }

    if (this.pendingCameraCue) {
      state.cameraCue = this.pendingCameraCue;
      state.cameraCueSeq = (state.cameraCueSeq ?? 0) + 1;
      state.cameraCueElapsed = 0;
      if (state.cameraCue === 'hit' && !state.reducedMotion) {
        state.hitStopRemaining = Math.max(state.hitStopRemaining, 0.045);
      } else if (state.cameraCue === 'heavyHit' && !state.reducedMotion) {
        state.hitStopRemaining = Math.max(state.hitStopRemaining, 0.085);
      }
      this.applyCueImpulse(state.cameraCue, state.reducedMotion);
      this.lastObservedCue = state.cameraCue;
      this.lastObservedCueSeq = state.cameraCueSeq;
      this.pendingCameraCue = null;
    } else if (
      state.cameraCue !== this.lastObservedCue
      || (typeof state.cameraCueSeq === 'number' && state.cameraCueSeq !== this.lastObservedCueSeq)
    ) {
      state.cameraCueElapsed = 0;
      if (state.cameraCue === 'hit' && !state.reducedMotion) {
        state.hitStopRemaining = Math.max(state.hitStopRemaining, 0.045);
      } else if (state.cameraCue === 'heavyHit' && !state.reducedMotion) {
        state.hitStopRemaining = Math.max(state.hitStopRemaining, 0.085);
      }
      this.applyCueImpulse(state.cameraCue, state.reducedMotion);
      this.lastObservedCue = state.cameraCue;
      this.lastObservedCueSeq = state.cameraCueSeq ?? 0;
    }

    if (state.reducedMotion) {
      state.hitStopRemaining = 0;
      this.spring.shakeAmp = 0;
      this.spring.rotation = 0;
    }

    const inHitStop = state.hitStopRemaining > 0;
    if (inHitStop) {
      state.hitStopRemaining = Math.max(0, state.hitStopRemaining - dt);
    }

    if (state.shutter.active) {
      const dur = Math.max(0.08, state.shutter.duration);
      state.shutter.progress = clamp(state.shutter.progress + dt / dur, 0, 1);
      if (state.shutter.progress >= 1) {
        state.shutter.active = false;
      }
    }

    for (let i = state.activeVfx.length - 1; i >= 0; i--) {
      const vfx = state.activeVfx[i];
      vfx.elapsed += dt;
      if (vfx.elapsed >= vfx.duration) {
        state.activeVfx.splice(i, 1);
      }
    }

    if (state.activeVfx.length === 0) {
      state.arenaLightingPulse = Math.max(0, state.arenaLightingPulse - dt * 1.15);
      if (state.arenaLightingPulse <= 0.01) {
        state.arenaLightingPulse = 0;
      }
    } else {
      state.arenaLightingPulse = Math.max(state.arenaLightingPulse, 0.72);
    }

    if (!inHitStop) {
      for (const fighter of [state.player, state.enemy]) {
        fighter.hitFlash = Math.max(0, fighter.hitFlash - dt * (state.reducedMotion ? 3.5 : 4.5));
        fighter.bracedFlash = Math.max(0, fighter.bracedFlash - dt * 1.6);
        fighter.buffFlash = Math.max(0, fighter.buffFlash - dt * 1.8);
        fighter.healFlash = Math.max(0, fighter.healFlash - dt * 1.8);
        fighter.lungeOffset *= Math.max(0, 1 - dt * 7.5);
        fighter.recoilOffset *= Math.max(0, 1 - dt * 7.5);
        if (Math.abs(fighter.lungeOffset) < 0.002) fighter.lungeOffset = 0;
        if (Math.abs(fighter.recoilOffset) < 0.002) fighter.recoilOffset = 0;
        if (fighter.abilityBanner) {
          fighter.abilityBanner.elapsed += dt;
          if (fighter.abilityBanner.elapsed >= 2.4) {
            fighter.abilityBanner = null;
          }
        }
      }
    }

    state.cameraCueElapsed += dt;
    const target = getCueTargetPose(
      state.cameraCue,
      state.cameraCueElapsed,
      state.elapsedSeconds,
      state.reducedMotion,
    );

    const stiffness = state.reducedMotion ? 28 : 68;
    const damping = state.reducedMotion ? 11 : 13.5;

    const stepAxis = (pos: number, vel: number, tgt: number): [number, number] => {
      const acc = (tgt - pos) * stiffness - vel * damping;
      const nextVel = vel + acc * dt;
      const nextPos = pos + nextVel * dt;
      return [nextPos, nextVel];
    };

    [this.spring.x, this.spring.vx] = stepAxis(this.spring.x, this.spring.vx, target.x);
    [this.spring.y, this.spring.vy] = stepAxis(this.spring.y, this.spring.vy, target.y);
    [this.spring.zoom, this.spring.vZoom] = stepAxis(this.spring.zoom, this.spring.vZoom, target.zoom);
    [this.spring.rotation, this.spring.vRot] = stepAxis(
      this.spring.rotation,
      this.spring.vRot,
      target.rotation,
    );

    if (!state.reducedMotion) {
      this.spring.shakePhase += dt;
      this.spring.shakeAmp *= Math.exp(-dt * 11.5);
      if (this.spring.shakeAmp < 0.1) this.spring.shakeAmp = 0;
    }
  }

  render(backend: IRenderBackend, state: BattleSceneState): void {
    const vp = typeof backend.getViewportSize === 'function' ? backend.getViewportSize() : null;
    if (vp && vp.width > 0 && vp.height > 0) {
      this.cachedViewportWidth = Math.max(320, Math.round(vp.width));
      this.cachedViewportHeight = Math.max(200, Math.round(vp.height));
    } else {
      const ctx2d = backend.getCanvas2DContext() as
        | (CanvasRenderingContext2D & { canvas?: { width: number; height: number } })
        | null;
      if (ctx2d?.canvas && ctx2d.canvas.width > 0 && ctx2d.canvas.height > 0) {
        const dpr = Math.max(1, backend.capabilities.dpr || 1);
        this.cachedViewportWidth = Math.max(320, Math.round(ctx2d.canvas.width / dpr));
        this.cachedViewportHeight = Math.max(200, Math.round(ctx2d.canvas.height / dpr));
      }
    }

    if (!this.fallbackAttached && this.getSheetImageFn) {
      const fallbacks = this.getSheetImageFn('fallbacks');
      if (fallbacks) {
        this.rigSynth.attachFallbackSheet(fallbacks, this.manifest);
        this.fallbackAttached = true;
      }
    }

    const arena: BattleArenaDescriptor =
      BATTLE_ARENAS[state.biomeId] ?? BATTLE_ARENAS.village;
    const visualProfile = getBiomeVisualProfile(arena.biomeId);
    const camera = this.getCameraTransform(state.reducedMotion);

    backend.setColorGrade(buildBattleColorGrade(visualProfile.colorGrade));
    backend.setCanopyConfig(buildBattleCanopyConfig(visualProfile.canopyConfig));
    backend.setWaterConfig({
      ...visualProfile.waterConfig,
      time: state.elapsedSeconds,
      waveAmplitude: state.reducedMotion ? 0.25 : visualProfile.waterConfig.waveAmplitude,
    });
    backend.setCamera({
      x: camera.x,
      y: camera.y,
      zoom: camera.zoom,
      shakeX: camera.shakeX,
      shakeY: camera.shakeY,
      rotation: camera.rotation,
    });

    const activeEvents =
      this.pendingVfx.length > 0 ? [...state.activeVfx, ...this.pendingVfx] : state.activeVfx;
    const activeShutter = this.pendingShutter ?? state.shutter;
    const arenaImg = this.getArenaImageFn ? this.getArenaImageFn(arena.biomeId) : null;

    // 1. Bespoke 480x270 Pixel Arena Backdrop + Grounded Pedestals + Atmospheric Motes
    renderArenaBackdrop(
      backend,
      arena,
      state,
      camera,
      state.elapsedSeconds,
      this.cachedViewportWidth,
      this.cachedViewportHeight,
      arenaImg,
    );

    // 2. Combatants (Enemy in back, Player in front — crisp animated sprites or offline pixel rigs)
    const stageLayout = computeBattleStageLayout(
      this.cachedViewportWidth,
      this.cachedViewportHeight,
    );
    this.renderCombatant(backend, state, arena, state.enemy, stageLayout.enemyPad, stageLayout, camera, 10);
    this.renderCombatant(backend, state, arena, state.player, stageLayout.playerPad, stageLayout, camera, 20);

    // 3. Arena Foreground Pixel Frame
    renderArenaForeground(backend, arena, state, camera, state.elapsedSeconds);

    // 4. Deferred PointLights & Elemental Sparks
    emitArenaPointLights(backend, arena, state, stageLayout);
    this.vfxDirector.emitParticlesAndLights(
      backend,
      state,
      activeEvents,
      this.cachedViewportWidth,
      this.cachedViewportHeight,
    );

    // 5. Post-Light Pixel VFX, Shield/Braced/Stat/Ability Overlays, Capture Ball & Evolution Spiral
    this.vfxDirector.renderPostLightVfx(backend, state, activeEvents, camera);

    // 6. 4-Mode Encounter Transition Shutter ('screen' layer)
    if (activeShutter.active || (activeShutter.progress > 0 && activeShutter.progress < 1)) {
      backend.drawCustom2D((ctx, width, height) => {
        this.renderShutterOverlay(ctx, width, height, activeShutter, state.reducedMotion);
      }, 'screen');
    }
  }

  private renderCombatant(
    backend: IRenderBackend,
    state: BattleSceneState,
    arena: BattleArenaDescriptor,
    visual: BattleCombatantVisual,
    pad: BattleStageLayout['playerPad'],
    layout: BattleStageLayout,
    camera: BattleCameraTransform,
    depth: number,
  ): void {
    const dir = visual.side === 'player' ? 1 : -1;
    const lungePx = visual.lungeOffset * layout.width * 0.045;
    const recoilPx = visual.recoilOffset * layout.width * 0.032;
    const shiftX = dir * (lungePx - recoilPx);
    const shiftY = -dir * (lungePx - recoilPx) * 0.36;

    let captureScale = 1;
    let captureAlpha = 1;
    const isEnemyCaptured =
      visual.side === 'enemy' &&
      (Boolean(state.rewardSummary?.caught) || (visual.captureProgress ?? 0) >= 0.99);
    if (visual.side === 'enemy' && (state.phase === 'capturing' || isEnemyCaptured)) {
      const cp = isEnemyCaptured ? 1 : clamp(visual.captureProgress ?? 0, 0, 1);
      if (cp >= 0.32) {
        const absorb = clamp((cp - 0.32) / 0.16, 0, 1);
        captureScale = Math.max(0.05, 1 - absorb);
        captureAlpha = Math.max(0, 1 - absorb);
      }
    }
    const faintDrop = clamp(visual.faintDrop ?? 0, 0, 1);
    const sendOut = clamp(visual.sendOutProgress ?? 1, 0, 1);
    const sendOutScale = sendOut >= 0.99
      ? 1
      : 0.25 + 0.75 * (1 - Math.pow(1 - sendOut, 3));
    const sendOutAlpha = sendOut >= 0.99 ? 1 : clamp(sendOut * 1.9, 0, 1);

    captureScale *= sendOutScale;
    captureAlpha *= sendOutAlpha * (1 - faintDrop);
    if (captureAlpha <= 0.01) return;

    const bobPx = state.reducedMotion || faintDrop > 0.05
      ? 0
      : Math.round(
          Math.sin(state.elapsedSeconds * 3.1 + (visual.side === 'player' ? 0 : 1.7)) * 2,
        );
    const evoScale =
      visual.side === 'player' && state.phase === 'evolving' && !state.reducedMotion
        ? 1 + Math.sin(state.elapsedSeconds * 9) * 0.08
        : 1;

    const faintDropPx = faintDrop * pad.size * 0.44;
    const cx = pad.x + shiftX;
    const cy = pad.spriteCy + shiftY - bobPx + faintDropPx;
    const groundY = pad.y + faintDropPx;
    const drawSize = pad.size * captureScale * evoScale;
    const facing: 'left' | 'right' = visual.side === 'player' ? 'right' : 'left';
    const mon = visual.mon;
    const monPal = TYPE_PALETTES[mon.type] ?? TYPE_PALETTES.normal;
    const rimType =
      state.arenaLightingType && state.arenaLightingPulse > 0.25
        ? state.arenaLightingType
        : mon.type;
    const rimColor = TYPE_PALETTES[rimType]?.glow ?? monPal.glow;
    const tilt = clamp(visual.lungeOffset * 0.11 - visual.recoilOffset * 0.13, -0.2, 0.2) * dir;

    const liveFrame =
      !state.forceOfflineRig && !visual.useOfflineRig
        ? SpriteAssetLoader.selectFrame(visual.frames, state.elapsedSeconds)
        : null;

    const opaqueBounds = liveFrame
      ? measureSpriteOpaqueBounds(visual.frames, liveFrame)
      : null;

    // Precompute live sprite draw geometry so grounded shadow width aligns with the real silhouette
    let liveDrawW = drawSize;
    let liveDrawH = drawSize;
    let liveDrawX = Math.round(cx - drawSize * 0.5);
    let liveDrawY = Math.round(groundY - drawSize + 4 + shiftY - bobPx);
    let liveFrameW = 48;
    let liveFrameH = 48;
    let liveVisibleW = pad.size * 0.72 * captureScale;
    const flipX = Boolean(visual.frames?.mirrorX);

    if (liveFrame) {
      liveFrameW = Math.max(1, liveFrame.width || visual.frames?.width || 48);
      liveFrameH = Math.max(1, liveFrame.height || visual.frames?.height || 48);

      let scale = Math.min(drawSize / liveFrameW, drawSize / liveFrameH);
      if (opaqueBounds && opaqueBounds.contentW > 0 && opaqueBounds.contentH > 0) {
        // Scale from visible opaque silhouette so sprites with generous transparent GIF padding or wide wings (e.g. Moltres) read heroically
        const effectiveDim = Math.max(opaqueBounds.contentW * 0.82, opaqueBounds.contentH, 34);
        const desiredScale = (drawSize * 0.96) / effectiveDim;
        const maxScaleW = (pad.size * 1.30 * captureScale * evoScale) / opaqueBounds.contentW;
        const maxScaleH = (pad.size * 1.12 * captureScale * evoScale) / opaqueBounds.contentH;
        scale = clamp(Math.min(desiredScale, maxScaleW, maxScaleH), 0.75, 4.4);
      }

      liveDrawW = Math.max(1, Math.round(liveFrameW * scale));
      liveDrawH = Math.max(1, Math.round(liveFrameH * scale));

      if (opaqueBounds) {
        const rawCenterX = (opaqueBounds.minX + opaqueBounds.maxX + 1) * 0.5;
        const alignedCenterX = flipX ? liveFrameW - rawCenterX : rawCenterX;
        liveDrawX = Math.round(cx - alignedCenterX * scale);
        const feetOffsetY = (opaqueBounds.maxY + 1) * scale;
        const standingDy = groundY - feetOffsetY + 2 + shiftY - bobPx;
        const contentCenterY = (opaqueBounds.minY + opaqueBounds.maxY + 1) * 0.5 * scale;
        const pullDy = cy - contentCenterY;
        liveDrawY = Math.round(standingDy * captureScale + pullDy * (1 - captureScale));
        liveVisibleW = clamp(opaqueBounds.contentW * scale, pad.size * 0.44 * captureScale, pad.size * 1.06 * captureScale);
      } else {
        liveDrawX = Math.round(cx - liveDrawW * 0.5);
        const standingDy = groundY - liveDrawH + 4 + shiftY - bobPx;
        const pullDy = cy - liveDrawH * 0.5;
        liveDrawY = Math.round(standingDy * captureScale + pullDy * (1 - captureScale));
      }
    }

    // Grounded 2-tier pixel-stepped contact shadow (plus offline planar reflection when using offline rig)
    backend.drawCustom2D((ctx, width, height) => {
      this.cachedViewportWidth = width;
      this.cachedViewportHeight = height;
      const px = Math.max(2, Math.round(Math.min(width, height) / 180));
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      applyCameraToContext(ctx, width, height, camera);

      const shadowRx = Math.max(pad.size * 0.28 * captureScale, liveVisibleW * 0.46);
      const shadowRy = Math.max(px * 2.5, pad.size * 0.095 * captureScale);
      drawPixelSteppedDisc(
        ctx,
        cx,
        groundY + px,
        shadowRx * 1.12,
        shadowRy * 1.18,
        px,
        `rgba(6, 9, 24, ${(0.28 * captureAlpha).toFixed(3)})`,
      );
      drawPixelSteppedDisc(
        ctx,
        cx,
        groundY + px,
        shadowRx * 0.86,
        shadowRy * 0.84,
        px,
        `rgba(5, 7, 20, ${(0.58 * captureAlpha).toFixed(3)})`,
      );

      if (arena.reflectionAlpha > 0.05 && captureScale > 0.25) {
        if (liveFrame && typeof HTMLCanvasElement !== 'undefined' && liveFrame instanceof HTMLCanvasElement) {
          // True vertically-flipped soft planar reflection beneath feet (fixes un-flipped upright smear!)
          const feetSrcY = opaqueBounds ? opaqueBounds.maxY + 1 : liveFrameH;
          const reflScaleX = liveDrawW / liveFrameW;
          const reflScaleY = liveDrawH / liveFrameH;
          ctx.save();
          ctx.globalAlpha = arena.reflectionAlpha * 0.24 * captureAlpha;
          ctx.translate(liveDrawX + liveDrawW * 0.5, groundY + px);
          ctx.scale(flipX ? -1 : 1, -0.34);
          ctx.drawImage(
            liveFrame,
            0,
            0,
            liveFrameW,
            feetSrcY,
            -liveDrawW * 0.5,
            -Math.round(feetSrcY * reflScaleY),
            Math.round(liveFrameW * reflScaleX),
            Math.round(feetSrcY * reflScaleY),
          );
          ctx.restore();
        } else if (!liveFrame) {
          const rig: OfflineRigDescriptor = {
            speciesId: mon.speciesId,
            name: mon.name,
            primaryType: mon.type,
            archetype: mon.archetype,
            colorHex: mon.colorHex,
            shiny: mon.isShiny,
          };
          ctx.save();
          ctx.globalAlpha = arena.reflectionAlpha * 0.36 * captureAlpha;
          ctx.translate(cx, groundY + drawSize * 0.22);
          ctx.scale(1, -0.34);
          this.rigSynth.renderRig(ctx, rig, {
            cx: 0,
            cy: 0,
            size: drawSize,
            time: state.elapsedSeconds,
            facing,
            reducedMotion: state.reducedMotion,
          });
          ctx.restore();
        }
      }
      ctx.restore();
    }, 'world');

    if (liveFrame) {
      const fw = liveFrameW;
      const fh = liveFrameH;
      const dw = liveDrawW;
      const dh = liveDrawH;
      const dx = liveDrawX;
      const dy = liveDrawY;

      // Dual-contrast pixel-art silhouette contour backing (dark ink outline + subtle starlight rim-halo)
      const contourCanvas = getSpriteSilhouetteContour(liveFrame);
      if (contourCanvas) {
        const padX = Math.max(1, Math.round((SILHOUETTE_CONTOUR_PAD * dw) / fw));
        const padY = Math.max(1, Math.round((SILHOUETTE_CONTOUR_PAD * dh) / fh));
        backend.drawSprite({
          source: contourCanvas,
          sx: 0,
          sy: 0,
          sw: contourCanvas.width,
          sh: contourCanvas.height,
          dx: dx - padX,
          dy: dy - padY,
          dw: dw + padX * 2,
          dh: dh + padY * 2,
          flipX,
          rotation: tilt,
          alpha: captureAlpha,
          tint: [1, 1, 1, captureAlpha],
          pixelCrisp: true,
          depth: depth - 0.12,
        });
      }

      const tint: [number, number, number, number] =
        visual.hitFlash > 0.05
          ? [1.0, 0.96, 0.78, captureAlpha]
          : mon.isShiny
            ? getShinyTint(state.elapsedSeconds, captureAlpha, state.reducedMotion)
            : [1, 1, 1, captureAlpha];

      // Reserve shader rim tinting strictly for active combat states so native pixel ink outlines stay crisp
      const rimRgba: [number, number, number, number] | undefined =
        visual.healFlash > 0.05
          ? [0.35, 1.0, 0.62, visual.healFlash]
          : visual.buffFlash > 0.05
            ? [1.0, 0.88, 0.38, visual.buffFlash]
            : mon.isElite || mon.encounterTrait === 'apex'
              ? [1.0, 0.42, 0.45, 0.65]
              : undefined;

      backend.drawSprite({
        source: liveFrame,
        sx: 0,
        sy: 0,
        sw: fw,
        sh: fh,
        dx,
        dy,
        dw,
        dh,
        flipX,
        rotation: tilt,
        alpha: captureAlpha,
        tint,
        rimColor: rimRgba,
        emissive: visual.hitFlash > 0.05 ? visual.hitFlash * 0.85 : mon.isShiny ? 0.22 : 0,
        pixelCrisp: true,
        depth,
      });

      if (visual.hitFlash > 0.05) {
        backend.drawSprite({
          source: liveFrame,
          sx: 0,
          sy: 0,
          sw: fw,
          sh: fh,
          dx,
          dy,
          dw,
          dh,
          flipX,
          rotation: tilt,
          alpha: visual.hitFlash * 0.82 * captureAlpha,
          additive: true,
          pixelCrisp: true,
          depth: depth + 0.1,
        });
      }
      return;
    }

    // Offline Pixel Fallback Rig (fallbacks-atlas.png or 16x16 pixel-grid emblem)
    backend.drawCustom2D((ctx, width, height) => {
      const rig: OfflineRigDescriptor = {
        speciesId: mon.speciesId,
        name: mon.name,
        primaryType: mon.type,
        archetype: mon.archetype,
        colorHex: mon.colorHex,
        shiny: mon.isShiny,
      };
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = captureAlpha;
      applyCameraToContext(ctx, width, height, camera);
      if (tilt !== 0) {
        ctx.translate(cx, cy);
        ctx.rotate(tilt);
        ctx.translate(-cx, -cy);
      }
      this.rigSynth.renderRig(ctx, rig, {
        cx,
        cy,
        size: drawSize,
        time: state.elapsedSeconds,
        facing,
        hitFlash: visual.hitFlash,
        rimColor,
        reducedMotion: state.reducedMotion,
      });
      ctx.restore();
    }, 'world');
  }

  private renderShutterOverlay(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    shutter: BattleShutterState,
    reducedMotion: boolean,
  ): void {
    const p = clamp(shutter.progress, 0, 1);
    const closePhase = p < 0.45 ? p / 0.45 : 1 - (p - 0.45) / 0.55;
    const cover = clamp(Math.sin(clamp(closePhase, 0, 1) * Math.PI * 0.5), 0, 1);
    const px = Math.max(3, Math.round(Math.min(w, h) / 140));

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (reducedMotion) {
      const paletteHex =
        shutter.tier === 'shrine' || shutter.tier === 'shrine-trial'
          ? '#ffd479'
          : shutter.tier === 'rival'
            ? '#ff5c7c'
            : shutter.tier === 'rare'
              ? '#7ef2ff'
              : '#1b2654';
      ctx.fillStyle = hexToRgba(paletteHex, cover * 0.62);
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      return;
    }

    switch (shutter.tier) {
      case 'wild': {
        const barCount = 8;
        const barH = Math.ceil(h / barCount);
        for (let i = 0; i < barCount; i++) {
          const fromLeft = i % 2 === 0;
          const barW = Math.round((w * cover) / px) * px;
          const x = fromLeft ? 0 : w - barW;
          ctx.fillStyle = i % 2 === 0 ? '#111a3d' : '#1f326b';
          ctx.fillRect(x, i * barH, barW, barH);
          ctx.fillStyle = '#ffe08a';
          ctx.fillRect(fromLeft ? barW - px * 2 : x, i * barH, px * 2, barH);
        }
        break;
      }

      case 'rare': {
        ctx.fillStyle = `rgba(12, 16, 42, ${(cover * 0.85).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        const radius = Math.hypot(w, h) * 0.52 * (1 - cover * 0.78);
        drawPixelCrossStar(ctx, w * 0.5, h * 0.5, radius, px * 2, '#7ef2ff', '#ffe566');
        break;
      }

      case 'rival': {
        ctx.save();
        ctx.translate(w * 0.5, h * 0.5);
        ctx.rotate(-0.42);
        const span = Math.hypot(w, h);
        const halfH = Math.round((span * 0.5 * cover) / px) * px;
        ctx.fillStyle = '#1b1636';
        ctx.fillRect(-span, -span * 0.5, span * 2, halfH);
        ctx.fillStyle = '#381838';
        ctx.fillRect(-span, span * 0.5 - halfH, span * 2, halfH);
        ctx.fillStyle = `rgba(255, 110, 148, ${(cover * 0.92).toFixed(3)})`;
        ctx.fillRect(-span, -px, span * 2, px * 2);
        ctx.restore();
        break;
      }

      case 'shrine-trial':
      case 'shrine': {
        const isTrial = shutter.tier === 'shrine-trial';
        const gateW = Math.round((w * 0.5 * cover) / px) * px;
        for (const side of [-1, 1] as const) {
          const gx = side < 0 ? 0 : w - gateW;
          ctx.fillStyle = isTrial ? '#20184a' : '#1b224a';
          ctx.fillRect(gx, 0, gateW, h);
          ctx.strokeStyle = isTrial ? '#c084fc' : '#ffd479';
          ctx.lineWidth = px;
          ctx.strokeRect(gx + px, px, Math.max(0, gateW - px * 2), h - px * 2);
        }
        if (cover > 0.35) {
          const sealR = Math.min(w, h) * 0.16 * cover;
          drawPixelCrossStar(
            ctx,
            w * 0.5,
            h * 0.5,
            sealR,
            px * 2,
            isTrial ? '#e879f9' : '#ffe58f',
            '#ffffff',
          );
        }
        break;
      }
    }

    ctx.restore();
  }
}
