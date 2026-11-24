import type {
  BattleArenaDescriptor,
  BattleCameraCue,
  BattleCombatantVisual,
  BattleSceneState,
  BattleShutterState,
  BattleVfxEvent,
  EncounterTier,
  IBattleTheaterRenderer,
  IOfflineSpriteRigSynthesizer,
  IRenderBackend,
  OfflineRigDescriptor,
} from '../../contracts';
import {
  BIOME_COLOR_GRADES,
  TYPE_PALETTES,
} from '../../core';
import {
  BATTLE_ARENAS,
  applyCameraToContext,
  clamp,
  computeBattleStageLayout,
  drawPolygonPath,
  drawStarPath,
  emitArenaPointLights,
  hexToRgb01,
  hexToRgba,
  renderArenaBackdrop,
  renderArenaForeground,
  safeEllipse,
  type BattleCameraTransform,
  type BattleStageLayout,
} from './BattleArenas';
import { BattleVfxDirector } from './BattleVfxDirector';
import { OfflineSpriteRigSynthesizer } from './OfflineSpriteRigSynthesizer';

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

function getCueTargetPose(
  cue: BattleCameraCue,
  elapsed: number,
  time: number,
  reducedMotion: boolean,
): { x: number; y: number; zoom: number; rotation: number } {
  const motion = reducedMotion ? 0.22 : 1.0;
  switch (cue) {
    case 'hit': {
      const decay = Math.exp(-elapsed * 5.2);
      return {
        x: 22 * decay * motion,
        y: -10 * decay * motion,
        zoom: 1 + 0.048 * decay * (reducedMotion ? 0.45 : 1),
        rotation: reducedMotion ? 0 : 0.008 * decay,
      };
    }
    case 'heavyHit': {
      const decay = Math.exp(-elapsed * 3.8);
      return {
        x: 34 * decay * motion,
        y: -16 * decay * motion,
        zoom: 1 + 0.105 * decay * (reducedMotion ? 0.4 : 1),
        rotation: reducedMotion ? 0 : -0.02 * decay,
      };
    }
    case 'starBall': {
      const settle = clamp(elapsed * 2.6, 0, 1);
      return {
        x: 56 * settle * motion,
        y: -26 * settle * motion,
        zoom: 1 + 0.075 * settle * (reducedMotion ? 0.45 : 1),
        rotation: 0,
      };
    }
    case 'rivalIntro': {
      const pan = Math.sin(clamp(elapsed, 0, 1.4) * Math.PI * 0.72);
      return {
        x: (34 * pan - 10) * motion,
        y: -14 * pan * motion,
        zoom: 1 + 0.055 * pan * (reducedMotion ? 0.45 : 1),
        rotation: reducedMotion ? 0 : -0.012 * pan,
      };
    }
    case 'shrineGuardian': {
      const swell = Math.sin(clamp(elapsed, 0, 1.5) * Math.PI * 0.68);
      return {
        x: 24 * swell * motion,
        y: -30 * swell * motion,
        zoom: 1 + (elapsed < 0.4 ? -0.035 : 0.045 * swell) * (reducedMotion ? 0.4 : 1),
        rotation: 0,
      };
    }
    case 'evolution': {
      const focus = clamp(elapsed * 1.8, 0, 1);
      return {
        x: -54 * focus * motion,
        y: 24 * focus * motion,
        zoom: 1 + 0.095 * focus * (reducedMotion ? 0.45 : 1),
        rotation: 0,
      };
    }
    case 'idle':
    default: {
      const idleScale = reducedMotion ? 0.08 : 1.0;
      return {
        x: Math.sin(time * 0.45) * 6.5 * idleScale,
        y: Math.cos(time * 0.37) * 3.8 * idleScale,
        zoom: 1 + Math.sin(time * 0.3) * 0.008 * idleScale,
        rotation: 0,
      };
    }
  }
}

export class BattleTheaterRenderer implements IBattleTheaterRenderer {
  private readonly rigSynth = new OfflineSpriteRigSynthesizer();
  private readonly vfxDirector = new BattleVfxDirector();

  private vfxSeq = 0;
  private pendingShutter: BattleShutterState | null = null;
  private pendingVfx: BattleVfxEvent[] = [];
  private pendingCameraCue: BattleCameraCue | null = null;
  private lastObservedCue: BattleCameraCue = 'idle';

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
  private imageCache = new Map<string, HTMLImageElement>();
  private lastMemberSnapshots = new WeakMap<
    BattleCombatantVisual,
    { composure: number; status: BattleCombatantVisual['status'] }
  >();

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
    const duration = reducedMotion ? 0.42 : tier === 'shrine' ? 1.05 : tier === 'rare' ? 0.92 : 0.78;
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
      this.spring.shakeAmp = Math.max(this.spring.shakeAmp, 9.5);
      this.spring.vZoom += 0.35;
    } else if (cue === 'heavyHit') {
      this.spring.shakeAmp = Math.max(this.spring.shakeAmp, 19);
      this.spring.vZoom += 0.68;
      this.spring.vRot -= 0.14;
    } else if (cue === 'shrineGuardian') {
      this.spring.shakeAmp = Math.max(this.spring.shakeAmp, 5.5);
    } else if (cue === 'rivalIntro') {
      this.spring.vx += 70;
    }
  }

  update(state: BattleSceneState, dtSeconds: number): void {
    const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
    state.elapsedSeconds += dt;

    // Flush pending shutter trigger
    if (this.pendingShutter) {
      state.shutter = { ...this.pendingShutter };
      state.phase = 'shutter';
      this.pendingShutter = null;
    }

    // Flush pending VFX triggers
    if (this.pendingVfx.length > 0) {
      for (const evt of this.pendingVfx) {
        state.activeVfx.push(evt);
        state.arenaLightingType = evt.type;
        state.arenaLightingPulse = 1;
      }
      this.pendingVfx.length = 0;
    }

    // Flush pending camera cue or detect external cue transitions
    if (this.pendingCameraCue) {
      state.cameraCue = this.pendingCameraCue;
      state.cameraCueElapsed = 0;
      if (state.cameraCue === 'hit' && !state.reducedMotion) {
        state.hitStopRemaining = Math.max(state.hitStopRemaining, 0.045);
      } else if (state.cameraCue === 'heavyHit' && !state.reducedMotion) {
        state.hitStopRemaining = Math.max(state.hitStopRemaining, 0.085);
      }
      this.applyCueImpulse(state.cameraCue, state.reducedMotion);
      this.lastObservedCue = state.cameraCue;
      this.pendingCameraCue = null;
    } else if (state.cameraCue !== this.lastObservedCue) {
      state.cameraCueElapsed = 0;
      if (state.cameraCue === 'hit' && !state.reducedMotion) {
        state.hitStopRemaining = Math.max(state.hitStopRemaining, 0.045);
      } else if (state.cameraCue === 'heavyHit' && !state.reducedMotion) {
        state.hitStopRemaining = Math.max(state.hitStopRemaining, 0.085);
      }
      this.applyCueImpulse(state.cameraCue, state.reducedMotion);
      this.lastObservedCue = state.cameraCue;
    }

    // Reduced motion disables hit-stop freeze and strobe/shake
    if (state.reducedMotion) {
      state.hitStopRemaining = 0;
      this.spring.shakeAmp = 0;
      this.spring.rotation = 0;
    }

    const inHitStop = state.hitStopRemaining > 0;
    if (inHitStop) {
      state.hitStopRemaining = Math.max(0, state.hitStopRemaining - dt);
    }

    // Advance encounter shutter
    if (state.shutter.active) {
      const dur = Math.max(0.1, state.shutter.duration);
      state.shutter.progress = clamp(state.shutter.progress + dt / dur, 0, 1);
      if (state.shutter.progress >= 1) {
        state.shutter.active = false;
        if (state.phase === 'shutter') {
          state.phase = 'command';
        }
      }
    }

    // Advance & prune active VFX
    for (let i = state.activeVfx.length - 1; i >= 0; i--) {
      const vfx = state.activeVfx[i];
      vfx.elapsed += dt;
      if (vfx.elapsed >= vfx.duration) {
        state.activeVfx.splice(i, 1);
      }
    }

    // Decay dynamic arena elemental lighting pulse
    if (state.activeVfx.length === 0) {
      state.arenaLightingPulse = Math.max(0, state.arenaLightingPulse - dt * 1.1);
      if (state.arenaLightingPulse <= 0.01) {
        state.arenaLightingPulse = 0;
      }
    } else {
      state.arenaLightingPulse = Math.max(state.arenaLightingPulse, 0.72);
    }

    // Smoothly recover combatant hitFlash / lunge / recoil outside hit-stop freeze frames
    if (!inHitStop) {
      for (const fighter of [state.player, state.enemy]) {
        fighter.hitFlash = Math.max(0, fighter.hitFlash - dt * (state.reducedMotion ? 3.5 : 4.8));
        fighter.lungeOffset *= Math.max(0, 1 - dt * 7.5);
        fighter.recoilOffset *= Math.max(0, 1 - dt * 7.5);
        if (Math.abs(fighter.lungeOffset) < 0.002) fighter.lungeOffset = 0;
        if (fighter.recoilOffset < 0.002) fighter.recoilOffset = 0;

        const prevSnap = this.lastMemberSnapshots.get(fighter);
        if (!prevSnap) {
          this.lastMemberSnapshots.set(fighter, {
            composure: fighter.member.composure,
            status: fighter.member.status,
          });
        } else {
          if (fighter.member.composure !== prevSnap.composure) {
            prevSnap.composure = fighter.member.composure;
            fighter.composureRatio = clamp(
              fighter.member.composure / Math.max(1, fighter.member.maxComposure),
              0,
              1,
            );
          }
          if (fighter.member.status !== prevSnap.status) {
            prevSnap.status = fighter.member.status;
            fighter.status = fighter.member.status;
          }
        }
      }
    }

    // Step spring-damped camera framing controller
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
    const ctx2d = backend.getCanvas2DContext() as (CanvasRenderingContext2D & { canvas?: { width: number; height: number } }) | null;
    if (ctx2d?.canvas && ctx2d.canvas.width > 0 && ctx2d.canvas.height > 0) {
      const dpr = Math.max(1, backend.capabilities.dpr || 1);
      this.cachedViewportWidth = Math.max(320, Math.round(ctx2d.canvas.width / dpr));
      this.cachedViewportHeight = Math.max(200, Math.round(ctx2d.canvas.height / dpr));
    }

    const arena: BattleArenaDescriptor =
      BATTLE_ARENAS[state.biomeId] ?? BATTLE_ARENAS['starlight-village'];
    const grade = BIOME_COLOR_GRADES[arena.biomeId];
    const camera = this.getCameraTransform(state.reducedMotion);

    // Sync backend color grade, canopy, water, and spring-damped camera
    backend.setColorGrade(grade);
    backend.setCanopyConfig({
      enabled: arena.biomeId === 'verdant-canopy' || arena.biomeId === 'amber-thicket',
      sunbeamIntensity: 0.28,
      sunbeamAngle: -0.45,
      sunbeamColor: [1.0, 0.94, 0.72],
      cloudSpeedX: 0.22,
      cloudSpeedY: 0.08,
      cloudOpacity: 0.18,
    });
    backend.setWaterConfig({
      enabled: arena.platformKind === 'water-mirror',
      time: state.elapsedSeconds,
      skyTopColor: hexToRgb01(arena.planes[0].primaryHex),
      skyBottomColor: hexToRgb01(arena.planes[0].secondaryHex),
      starlightIntensity: grade.starlightGlow,
      waveAmplitude: state.reducedMotion ? 0.25 : 0.95,
      foamColor: hexToRgb01(arena.planes[3].accentHex),
    });
    backend.setCamera({
      x: camera.x,
      y: camera.y,
      zoom: camera.zoom,
      shakeX: camera.shakeX,
      shakeY: camera.shakeY,
      rotation: camera.rotation,
    });

    // Combine persisted activeVfx and any un-flushed pendingVfx
    const activeEvents =
      this.pendingVfx.length > 0 ? [...state.activeVfx, ...this.pendingVfx] : state.activeVfx;
    const activeShutter = this.pendingShutter ?? state.shutter;

    // 1. Arena Planes 0..3 (Sky, Far Horizon, Mid Landmarks, Water Mirror, Combat Ground)
    renderArenaBackdrop(
      backend,
      arena,
      state,
      camera,
      state.elapsedSeconds,
      this.cachedViewportWidth,
      this.cachedViewportHeight,
    );

    // 2. Combatants (Contact Shadow, Planar Reflection, Stylized Rig, Lunge/Recoil/HitFlash)
    backend.drawCustom2D((ctx, width, height) => {
      this.cachedViewportWidth = width;
      this.cachedViewportHeight = height;
      const layout = computeBattleStageLayout(width, height);
      ctx.save();
      applyCameraToContext(ctx, width, height, camera);
      this.renderCombatants(ctx, state, arena, layout);
      ctx.restore();
    }, 'world');

    // 3. Arena Plane 4 (Foreground Parallax Frame)
    renderArenaForeground(backend, arena, state, camera, state.elapsedSeconds);

    // 4. Lighting & Particles (Pass 2 & Pass 3)
    const lightLayout = computeBattleStageLayout(
      this.cachedViewportWidth,
      this.cachedViewportHeight,
    );
    emitArenaPointLights(backend, arena, state, lightLayout);
    this.vfxDirector.emitParticlesAndLights(
      backend,
      state,
      activeEvents,
      this.cachedViewportWidth,
      this.cachedViewportHeight,
    );

    // 5. Post-Light VFX, Composure Shield, Status Overlays, Star Ball, Evolution
    this.vfxDirector.renderPostLightVfx(backend, state, activeEvents, camera);

    // 6. 4-Tier Encounter Transition Shutter ('screen' layer)
    if (activeShutter.active || (activeShutter.progress > 0 && activeShutter.progress < 1)) {
      backend.drawCustom2D((ctx, width, height) => {
        this.renderShutterOverlay(ctx, width, height, activeShutter, state.reducedMotion);
      }, 'screen');
    }
  }

  private resolveSpriteImage(url?: string): HTMLImageElement | null {
    if (!url || typeof Image === 'undefined') return null;
    let img = this.imageCache.get(url);
    if (!img) {
      img = new Image();
      img.src = url;
      this.imageCache.set(url, img);
    }
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      return img;
    }
    return null;
  }

  private renderCombatants(
    ctx: CanvasRenderingContext2D,
    state: BattleSceneState,
    arena: BattleArenaDescriptor,
    layout: BattleStageLayout,
  ): void {
    const combatants: Array<{ visual: BattleCombatantVisual; pad: BattleStageLayout['playerPad'] }> = [
      { visual: state.enemy, pad: layout.enemyPad },
      { visual: state.player, pad: layout.playerPad },
    ];

    for (const { visual, pad } of combatants) {
      const dir = visual.side === 'player' ? 1 : -1;
      const lungePx = visual.lungeOffset * layout.width * 0.045;
      const recoilPx = visual.recoilOffset * layout.width * 0.032;
      const shiftX = dir * (lungePx - recoilPx);
      const shiftY = -dir * (lungePx - recoilPx) * 0.36;

      let captureScale = 1;
      let captureAlpha = 1;
      if (visual.side === 'enemy' && state.phase === 'capturing') {
        const cp = clamp(visual.captureProgress ?? 0, 0, 1);
        if (cp >= 0.32) {
          const absorb = clamp((cp - 0.32) / 0.16, 0, 1);
          captureScale = Math.max(0.05, 1 - absorb);
          captureAlpha = Math.max(0, 1 - absorb);
        }
      }

      if (captureAlpha <= 0.01) continue;

      const cx = pad.x + shiftX;
      const cy = pad.spriteCy + shiftY;
      const groundY = pad.y;
      const facing: 'left' | 'right' = visual.side === 'player' ? 'right' : 'left';
      const species = visual.species;
      const rig: OfflineRigDescriptor = {
        speciesId: species.id,
        name: species.name,
        primaryType: species.primaryType,
        secondaryType: species.secondaryType,
        archetype: species.archetype,
        palette: species.palette,
        shiny: visual.member.shiny,
      };

      const rimType = state.arenaLightingType && state.arenaLightingPulse > 0.25
        ? state.arenaLightingType
        : species.primaryType;
      const rimColor = TYPE_PALETTES[rimType].glow;

      // Grounded elliptical contact shadow
      ctx.save();
      ctx.fillStyle = `rgba(8, 10, 26, ${(0.44 * captureAlpha).toFixed(3)})`;
      ctx.beginPath();
      safeEllipse(
        ctx,
        cx,
        groundY + 2,
        pad.size * 0.38 * captureScale,
        pad.size * 0.11 * captureScale,
        0,
      );
      ctx.fill();
      ctx.restore();

      // Planar surface reflection on reflective arenas
      if (arena.reflectionAlpha > 0.05 && captureScale > 0.2) {
        ctx.save();
        ctx.globalAlpha = arena.reflectionAlpha * 0.55 * captureAlpha;
        ctx.translate(cx, groundY + pad.size * 0.30);
        ctx.scale(1, -0.45);
        this.rigSynth.renderRig(ctx, rig, {
          cx: 0,
          cy: 0,
          size: pad.size * captureScale,
          time: state.elapsedSeconds,
          facing,
          reducedMotion: state.reducedMotion,
        });
        ctx.restore();
      }

      // Main high-DPI stylized rig (or verified loaded image if explicitly provided & enabled)
      ctx.save();
      ctx.globalAlpha = captureAlpha;
      const tilt = clamp(visual.lungeOffset * 0.12 - visual.recoilOffset * 0.14, -0.22, 0.22) * dir;
      if (tilt !== 0 || captureScale !== 1) {
        ctx.translate(cx, cy);
        ctx.rotate(tilt);
        ctx.scale(captureScale, captureScale);
        ctx.translate(-cx, -cy);
      }

      const loadedImg =
        !state.forceOfflineRig && !visual.useOfflineRig && visual.spriteLoaded
          ? this.resolveSpriteImage(visual.spriteUrl)
          : null;

      if (loadedImg) {
        ctx.save();
        ctx.translate(cx, cy);
        if (facing === 'left') ctx.scale(-1, 1);
        ctx.drawImage(loadedImg, -pad.size * 0.5, -pad.size * 0.5, pad.size, pad.size);
        ctx.restore();
      } else {
        this.rigSynth.renderRig(ctx, rig, {
          cx,
          cy,
          size: pad.size,
          time: state.elapsedSeconds,
          facing,
          hitFlash: visual.hitFlash,
          rimColor,
          reducedMotion: state.reducedMotion,
        });
      }

      ctx.restore();
    }
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

    ctx.save();
    if (reducedMotion) {
      // Gentle crossfade curtain without slicing bars or rapid flashes
      const paletteHex =
        shutter.tier === 'shrine'
          ? '#ffd479'
          : shutter.tier === 'rival'
            ? '#ff5c7c'
            : shutter.tier === 'rare'
              ? '#7ef2ff'
              : '#1b2654';
      ctx.fillStyle = hexToRgba(paletteHex, cover * 0.65);
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      return;
    }

    switch (shutter.tier) {
      case 'wild': {
        // Slicing twilight horizontal bars from alternating sides
        const barCount = 8;
        const barH = h / barCount + 1;
        for (let i = 0; i < barCount; i++) {
          const fromLeft = i % 2 === 0;
          const barW = w * cover;
          const x = fromLeft ? 0 : w - barW;
          const grad = ctx.createLinearGradient(x, 0, x + barW, 0);
          grad.addColorStop(0, '#0f1636');
          grad.addColorStop(1, '#2d4587');
          ctx.fillStyle = grad;
          ctx.fillRect(x, i * barH, barW, barH);
          ctx.fillStyle = 'rgba(255, 224, 138, 0.55)';
          ctx.fillRect(fromLeft ? barW - 4 : x, i * barH, 4, barH);
        }
        break;
      }

      case 'rare': {
        // Prismatic starlight iris burst
        ctx.fillStyle = `rgba(12, 16, 42, ${(cover * 0.85).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        const radius = Math.hypot(w, h) * 0.6 * (1 - cover * 0.82);
        drawStarPath(ctx, w * 0.5, h * 0.5, radius, radius * 0.45, 8, p * Math.PI);
        ctx.strokeStyle = '#7ef2ff';
        ctx.lineWidth = 6;
        ctx.stroke();
        drawStarPath(ctx, w * 0.5, h * 0.5, radius * 0.84, radius * 0.36, 8, -p * Math.PI * 0.5);
        ctx.strokeStyle = '#ffd479';
        ctx.lineWidth = 3.5;
        ctx.stroke();
        break;
      }

      case 'rival': {
        // Diagonal duelist slash bars colliding across center
        ctx.save();
        ctx.translate(w * 0.5, h * 0.5);
        ctx.rotate(-0.42);
        const span = Math.hypot(w, h);
        const halfH = span * 0.5 * cover;
        ctx.fillStyle = '#1b1636';
        ctx.fillRect(-span, -span * 0.5, span * 2, halfH);
        ctx.fillStyle = '#381838';
        ctx.fillRect(-span, span * 0.5 - halfH, span * 2, halfH);

        // Duelist slash flash seam
        ctx.fillStyle = `rgba(255, 110, 148, ${(cover * 0.9).toFixed(3)})`;
        ctx.fillRect(-span, -3, span * 2, 6);
        ctx.restore();
        break;
      }

      case 'shrine': {
        // Monumental golden celestial crest temple gates
        const gateW = w * 0.5 * cover;
        for (const side of [-1, 1] as const) {
          const gx = side < 0 ? 0 : w - gateW;
          const grad = ctx.createLinearGradient(gx, 0, gx + gateW, h);
          grad.addColorStop(0, '#1e244d');
          grad.addColorStop(0.5, '#303b73');
          grad.addColorStop(1, '#141838');
          ctx.fillStyle = grad;
          ctx.fillRect(gx, 0, gateW, h);

          ctx.strokeStyle = '#ffd479';
          ctx.lineWidth = 4;
          ctx.strokeRect(gx + 2, 2, Math.max(0, gateW - 4), h - 4);
        }

        // Golden celestial crest seal at meeting seam
        if (cover > 0.35) {
          const sealR = Math.min(w, h) * 0.18 * cover;
          ctx.strokeStyle = '#ffe58f';
          ctx.lineWidth = 4;
          drawPolygonPath(ctx, w * 0.5, h * 0.5, sealR, 6, p * 1.4);
          ctx.stroke();
          drawStarPath(ctx, w * 0.5, h * 0.5, sealR * 0.72, sealR * 0.26, 4, -p * 1.4);
          ctx.fillStyle = 'rgba(255, 224, 120, 0.85)';
          ctx.fill();
        }
        break;
      }
    }
    ctx.restore();
  }
}
