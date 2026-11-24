import type {
  BattleCombatantVisual,
  BattleSceneState,
  BattleVfxEvent,
  IRenderBackend,
  StatusCondition,
} from '../../contracts';
import { TYPE_PALETTES } from '../../core';
import {
  applyCameraToContext,
  clamp,
  computeBattleStageLayout,
  drawPolygonPath,
  drawStarPath,
  hexToRgba,
  safeEllipse,
  type BattleCameraTransform,
  type BattleStageLayout,
} from './BattleArenas';

export interface CombatantRenderAnchor {
  x: number;
  y: number;
  padY: number;
  size: number;
}

function getSideAnchor(
  side: 'player' | 'enemy',
  layout: BattleStageLayout,
  state?: BattleSceneState,
): CombatantRenderAnchor {
  const pad = side === 'player' ? layout.playerPad : layout.enemyPad;
  const visual = state ? (side === 'player' ? state.player : state.enemy) : undefined;
  const dir = side === 'player' ? 1 : -1;
  const lunge = (visual?.lungeOffset ?? 0) * layout.width * 0.045;
  const recoil = (visual?.recoilOffset ?? 0) * layout.width * 0.032;
  const dx = dir * (lunge - recoil);
  const dy = -dir * (lunge - recoil) * 0.36;
  return {
    x: pad.x + dx,
    y: pad.spriteCy + dy,
    padY: pad.y,
    size: pad.size,
  };
}

function drawJaggedLightning(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  seed: number,
  segments: number,
  spread: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const jitter = Math.sin(seed * 17.3 + i * 9.7) * spread * (1 - Math.abs(t - 0.5) * 0.6);
    ctx.lineTo(x0 + dx * t + nx * jitter, y0 + dy * t + ny * jitter);
  }
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function drawStarBallVector(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rotation: number,
  openAmount = 0,
  coreGlow = 0.6,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  const splitOffset = openAmount * radius * 0.35;

  // Inner luminous containment core when opening
  if (openAmount > 0.05) {
    const core = ctx.createRadialGradient(0, 0, 1, 0, 0, radius * 1.3);
    core.addColorStop(0, 'rgba(255, 252, 224, 0.95)');
    core.addColorStop(0.5, 'rgba(130, 238, 255, 0.72)');
    core.addColorStop(1, 'rgba(130, 238, 255, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lower pearl-white hemisphere
  ctx.save();
  ctx.translate(0, splitOffset);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI);
  ctx.closePath();
  const botGrad = ctx.createLinearGradient(0, 0, 0, radius);
  botGrad.addColorStop(0, '#f5f8ff');
  botGrad.addColorStop(1, '#b8c8e6');
  ctx.fillStyle = botGrad;
  ctx.fill();
  ctx.strokeStyle = '#1d2142';
  ctx.lineWidth = Math.max(1.6, radius * 0.12);
  ctx.stroke();
  ctx.restore();

  // Upper celestial indigo hemisphere with gold star emblem
  ctx.save();
  ctx.translate(0, -splitOffset);
  ctx.beginPath();
  ctx.arc(0, 0, radius, Math.PI, Math.PI * 2);
  ctx.closePath();
  const topGrad = ctx.createRadialGradient(-radius * 0.28, -radius * 0.42, radius * 0.1, 0, 0, radius);
  topGrad.addColorStop(0, '#6a7fff');
  topGrad.addColorStop(0.55, '#2b3a8c');
  topGrad.addColorStop(1, '#141a4a');
  ctx.fillStyle = topGrad;
  ctx.fill();
  ctx.strokeStyle = '#1d2142';
  ctx.lineWidth = Math.max(1.6, radius * 0.12);
  ctx.stroke();

  // Golden star crest
  drawStarPath(ctx, 0, -radius * 0.46, radius * 0.34, radius * 0.14, 4, 0);
  ctx.fillStyle = '#ffe066';
  ctx.fill();
  ctx.restore();

  // Central silver clasp & glowing cyan lock button
  if (openAmount < 0.4) {
    ctx.fillStyle = '#20264a';
    ctx.fillRect(-radius * 0.96, -radius * 0.1, radius * 1.92, radius * 0.2);

    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.30, 0, Math.PI * 2);
    ctx.fillStyle = '#e8f1ff';
    ctx.fill();
    ctx.strokeStyle = '#1d2142';
    ctx.lineWidth = Math.max(1.4, radius * 0.1);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(126, 242, 255, ${clamp(0.55 + coreGlow * 0.45, 0, 1).toFixed(3)})`;
    ctx.fill();
  }

  ctx.restore();
}

export class BattleVfxDirector {
  emitParticlesAndLights(
    backend: IRenderBackend,
    state: BattleSceneState,
    events: BattleVfxEvent[],
    width: number,
    height: number,
  ): void {
    const layout = computeBattleStageLayout(width, height);
    const motionScale = state.reducedMotion ? 0.35 : 1.0;

    for (const evt of events) {
      const p = clamp(evt.elapsed / Math.max(0.08, evt.duration), 0, 1);
      const from = getSideAnchor(evt.fromSide, layout, state);
      const target = getSideAnchor(evt.targetSide, layout, state);
      const pal = TYPE_PALETTES[evt.type] ?? TYPE_PALETTES.normal;
      const effScale = evt.effectiveness >= 2 ? 1.35 : evt.effectiveness <= 0.5 ? 0.72 : 1.0;
      const powerScale = clamp(evt.power / 80, 0.75, 1.45) * effScale;

      const travelP = clamp(p / 0.42, 0, 1);
      const impactP = clamp((p - 0.32) / 0.68, 0, 1);
      const beamX = from.x + (target.x - from.x) * travelP;
      const beamY = from.y + (target.y - from.y) * travelP;

      // Dynamic elemental light tracking projectile & impact
      const lightPos = p < 0.38 ? { x: beamX, y: beamY } : { x: target.x, y: target.y };
      const lightFade = p < 0.38 ? 1 : 1 - impactP * 0.85;
      backend.addPointLight({
        id: `vfx-light-${evt.id}`,
        x: lightPos.x,
        y: lightPos.y,
        radius: 175 * powerScale,
        color: pal.rgb,
        intensity: clamp(1.45 * lightFade * powerScale, 0, 2),
        flickerSpeed: 8,
        flickerAmount: state.reducedMotion ? 0 : 0.12,
      });

      // Emit type-tailored particle choreography
      this.emitElementalParticles(backend, evt, from, target, p, impactP, powerScale, motionScale);

      // Composure shatter burst particles
      if (evt.composureBroken && p >= 0.32) {
        const shatterT = clamp((p - 0.32) / 0.55, 0, 1);
        const shardCount = state.reducedMotion ? 6 : 12;
        for (let i = 0; i < shardCount; i++) {
          const ang = (i / shardCount) * Math.PI * 2 + 0.25;
          const dist = (18 + shatterT * 92) * (0.85 + (i % 3) * 0.18);
          backend.drawParticle({
            x: target.x + Math.cos(ang) * dist,
            y: target.y + Math.sin(ang) * dist * 0.82,
            radius: (10 - shatterT * 6) * (i % 2 === 0 ? 1.2 : 0.85),
            color: [0.58, 0.94, 1.0, (1 - shatterT) * 0.92],
            stretchX: 2.1,
            stretchY: 0.45,
            rotation: ang,
            additive: true,
          });
        }
      }
    }

    // Status particles on combatants
    this.emitStatusParticles(backend, state, layout.playerPad.x, layout.playerPad.spriteCy, state.player, motionScale);
    this.emitStatusParticles(backend, state, layout.enemyPad.x, layout.enemyPad.spriteCy, state.enemy, motionScale);

    // Capturing Star Ball particles
    if (state.phase === 'capturing') {
      const cp = clamp(state.enemy.captureProgress ?? 0, 0, 1);
      const from = getSideAnchor('player', layout, state);
      const to = getSideAnchor('enemy', layout, state);
      const arcP = clamp(cp / 0.3, 0, 1);
      const bx = cp < 0.3 ? from.x + (to.x - from.x) * arcP : to.x;
      const by =
        cp < 0.3
          ? from.y + (to.y - from.y) * arcP - Math.sin(arcP * Math.PI) * layout.height * 0.24
          : cp < 0.48
            ? to.y - layout.height * 0.08
            : to.padY - 12;

      backend.addPointLight({
        id: 'starball-capture-light',
        x: bx,
        y: by,
        radius: 150,
        color: [0.55, 0.88, 1.0],
        intensity: cp > 0.28 && cp < 0.5 ? 1.6 : 0.9,
      });

      const sparkCount = state.reducedMotion ? 3 : 6;
      for (let i = 0; i < sparkCount; i++) {
        const a = state.elapsedSeconds * 4 * motionScale + (i / sparkCount) * Math.PI * 2;
        const r = 18 + (cp > 0.85 ? (cp - 0.85) * 320 : 12);
        backend.drawParticle({
          x: bx + Math.cos(a) * r,
          y: by + Math.sin(a) * r * 0.72,
          radius: 7,
          color: i % 2 === 0 ? [1.0, 0.92, 0.48, 0.88] : [0.55, 0.92, 1.0, 0.88],
          additive: true,
        });
      }
    }

    // Evolution phase starlight particles
    if (state.phase === 'evolving') {
      const anchor = getSideAnchor('player', layout, state);
      backend.addPointLight({
        id: 'evolution-radiance',
        x: anchor.x,
        y: anchor.y,
        radius: 220,
        color: [0.95, 0.88, 1.0],
        intensity: 1.5,
      });
      const count = state.reducedMotion ? 4 : 10;
      for (let i = 0; i < count; i++) {
        const rise = ((state.elapsedSeconds * 0.75 * motionScale + i / count) % 1);
        const angle = state.elapsedSeconds * 3.2 * motionScale + i * 1.1;
        backend.drawParticle({
          x: anchor.x + Math.cos(angle) * (46 * (1 - rise * 0.45)),
          y: anchor.padY - rise * anchor.size * 1.35,
          radius: 8 * (1 - rise * 0.5),
          color: i % 2 === 0 ? [1.0, 0.92, 0.55, (1 - rise) * 0.9] : [0.62, 0.94, 1.0, (1 - rise) * 0.9],
          additive: true,
        });
      }
    }
  }

  private emitElementalParticles(
    backend: IRenderBackend,
    evt: BattleVfxEvent,
    from: CombatantRenderAnchor,
    target: CombatantRenderAnchor,
    p: number,
    impactP: number,
    powerScale: number,
    motionScale: number,
  ): void {
    const pal = TYPE_PALETTES[evt.type] ?? TYPE_PALETTES.normal;
    const [r, g, b] = pal.rgb;
    const count = Math.round((evt.type === 'bug' ? 12 : 9) * (motionScale < 0.5 ? 0.6 : 1));
    const angle = Math.atan2(target.y - from.y, target.x - from.x);

    // Projectile trail particles
    if (p < 0.48) {
      const t = clamp(p / 0.42, 0, 1);
      for (let i = 0; i < Math.max(4, Math.floor(count * 0.65)); i++) {
        const trail = clamp(t - i * 0.06, 0, 1);
        const spread = Math.sin(i * 2.4 + p * 12) * 14 * motionScale;
        const px = from.x + (target.x - from.x) * trail - Math.sin(angle) * spread;
        const py = from.y + (target.y - from.y) * trail + Math.cos(angle) * spread;
        backend.drawParticle({
          x: px,
          y: py,
          radius: (11 - i * 1.1) * powerScale,
          color: [r, g, b, (1 - i * 0.12) * 0.85],
          stretchX: evt.type === 'electric' || evt.type === 'steel' ? 2.2 : 1.35,
          stretchY: 0.75,
          rotation: angle,
          additive: evt.type !== 'dark' && evt.type !== 'ground',
        });
      }
    }

    // Impact burst particles
    if (impactP > 0.01) {
      const fade = clamp(1 - impactP, 0, 1);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + p * 2.4 * motionScale;
        const dist = (12 + impactP * 84 * powerScale) * (0.75 + (i % 3) * 0.2);
        const liftY = evt.type === 'fire' || evt.type === 'ghost' ? -impactP * 38 : 0;
        backend.drawParticle({
          x: target.x + Math.cos(a) * dist,
          y: target.y + Math.sin(a) * dist * 0.75 + liftY,
          radius: (13 * fade + 3) * powerScale,
          color: [Math.min(1, r + 0.18), Math.min(1, g + 0.18), Math.min(1, b + 0.18), fade * 0.9],
          stretchX: evt.type === 'fighting' || evt.type === 'flying' ? 2.0 : 1.1,
          stretchY: 0.85,
          rotation: a,
          additive: evt.type !== 'dark',
        });
      }
    }
  }

  private emitStatusParticles(
    backend: IRenderBackend,
    state: BattleSceneState,
    cx: number,
    cy: number,
    combatant: BattleCombatantVisual,
    motionScale: number,
  ): void {
    if (combatant.status === 'none') return;
    const t = state.elapsedSeconds * motionScale;
    const count = state.reducedMotion ? 2 : 4;

    for (let i = 0; i < count; i++) {
      const phase = (t * 0.8 + i / count) % 1;
      const ox = Math.sin(t * 2.2 + i * 2.1) * 26;
      if (combatant.status === 'burn') {
        backend.drawParticle({
          x: cx + ox,
          y: cy + 28 - phase * 76,
          radius: 8 * (1 - phase * 0.55),
          color: [1.0, 0.45 + phase * 0.35, 0.16, (1 - phase) * 0.8],
          additive: true,
        });
      } else if (combatant.status === 'static') {
        backend.drawParticle({
          x: cx + Math.cos(t * 7 + i * 1.9) * 34,
          y: cy + Math.sin(t * 6 + i * 2.3) * 24,
          radius: 6,
          color: [1.0, 0.92, 0.32, 0.75],
          stretchX: 1.8,
          stretchY: 0.45,
          rotation: t * 3 + i,
          additive: true,
        });
      } else if (combatant.status === 'frost') {
        backend.drawParticle({
          x: cx + ox,
          y: cy - 22 + phase * 55,
          radius: 7 * (1 - phase * 0.35),
          color: [0.62, 0.95, 1.0, (1 - phase) * 0.65],
          additive: true,
        });
      } else if (combatant.status === 'sleep') {
        backend.drawParticle({
          x: cx + 18 + Math.sin(phase * 4 + i) * 14,
          y: cy - 12 - phase * 62,
          radius: 7,
          color: [0.78, 0.68, 1.0, (1 - phase) * 0.62],
          additive: true,
        });
      }
    }
  }

  renderPostLightVfx(
    backend: IRenderBackend,
    state: BattleSceneState,
    events: BattleVfxEvent[],
    camera: BattleCameraTransform,
  ): void {
    backend.drawCustom2D((ctx, width, height) => {
      const layout = computeBattleStageLayout(width, height);
      ctx.save();
      applyCameraToContext(ctx, width, height, camera);

      // 1. Hexagonal Composure Shield Rings around both combatants
      this.drawComposureShield(
        ctx,
        getSideAnchor('player', layout, state),
        state.player.composureRatio,
        state.elapsedSeconds,
        state.reducedMotion,
      );
      this.drawComposureShield(
        ctx,
        getSideAnchor('enemy', layout, state),
        state.enemy.composureRatio,
        state.elapsedSeconds,
        state.reducedMotion,
      );

      // 2. Status Condition Overlays directly on combatants
      this.drawStatusOverlay(
        ctx,
        getSideAnchor('player', layout, state),
        state.player.status,
        state.elapsedSeconds,
        state.reducedMotion,
      );
      this.drawStatusOverlay(
        ctx,
        getSideAnchor('enemy', layout, state),
        state.enemy.status,
        state.elapsedSeconds,
        state.reducedMotion,
      );

      // 3. All Active Elemental VFX Vector Choreographies
      for (const evt of events) {
        this.drawElementalChoreography(ctx, state, evt, layout);
      }

      // 4. Star Ball Capture Animation ('capturing' phase)
      if (state.phase === 'capturing') {
        this.drawCaptureSequence(ctx, state, layout);
      }

      // 5. Evolution Metamorphosis Ribbons ('evolving' phase)
      if (state.phase === 'evolving') {
        this.drawEvolutionSequence(ctx, state, layout);
      }

      ctx.restore();
    }, 'post-light');
  }

  private drawComposureShield(
    ctx: CanvasRenderingContext2D,
    anchor: CombatantRenderAnchor,
    composureRatio: number,
    time: number,
    reducedMotion: boolean,
  ): void {
    const ratio = clamp(composureRatio, 0, 1);
    const radius = anchor.size * 0.56;
    const cx = anchor.x;
    const cy = anchor.y;
    const motion = reducedMotion ? 0 : Math.sin(time * 2.4) * 0.04;

    ctx.save();
    if (ratio <= 0.01) {
      // Fractured broken composure segments
      ctx.strokeStyle = 'rgba(255, 130, 110, 0.36)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2 + 0.14;
        const a1 = a0 + Math.PI / 5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a0) * radius * 1.04, cy + Math.sin(a0) * radius * 0.78);
        ctx.lineTo(cx + Math.cos(a1) * radius * 1.12, cy + Math.sin(a1) * radius * 0.84);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    const color =
      ratio > 0.55 ? '#7ef2ff' : ratio > 0.28 ? '#ffd166' : '#ff7b47';

    // Subtle hexagonal barrier track
    ctx.strokeStyle = hexToRgba(color, 0.22);
    ctx.lineWidth = 1.6;
    drawPolygonPath(ctx, cx, cy, radius * (1 + motion), 6, -Math.PI * 0.5);
    ctx.stroke();

    // Active Composure shield edges scaled proportionally by composureRatio
    const activeEdges = ratio * 6;
    ctx.strokeStyle = hexToRgba(color, 0.78);
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';

    for (let i = 0; i < 6; i++) {
      const edgeProgress = clamp(activeEdges - i, 0, 1);
      if (edgeProgress <= 0.01) break;
      const a0 = -Math.PI * 0.5 + (i / 6) * Math.PI * 2;
      const a1 = -Math.PI * 0.5 + ((i + 1) / 6) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * radius;
      const y0 = cy + Math.sin(a0) * radius * 0.82;
      const x1 = cx + Math.cos(a1) * radius;
      const y1 = cy + Math.sin(a1) * radius * 0.82;

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + (x1 - x0) * edgeProgress, y0 + (y1 - y0) * edgeProgress);
      ctx.stroke();

      // Vertex star node
      ctx.fillStyle = hexToRgba('#ffffff', 0.85 * edgeProgress);
      ctx.beginPath();
      ctx.arc(x0, y0, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawStatusOverlay(
    ctx: CanvasRenderingContext2D,
    anchor: CombatantRenderAnchor,
    status: StatusCondition,
    time: number,
    reducedMotion: boolean,
  ): void {
    if (status === 'none') return;
    const motionScale = reducedMotion ? 0.15 : 1.0;
    const t = time * motionScale;
    const r = anchor.size * 0.44;

    ctx.save();
    switch (status) {
      case 'frost': {
        // Faceted translucent ice crystals & cold mist
        for (let i = -1; i <= 1; i++) {
          const sx = anchor.x + i * r * 0.48;
          const sy = anchor.padY - 4;
          const sh = r * (i === 0 ? 0.65 : 0.48);
          ctx.beginPath();
          ctx.moveTo(sx, sy - sh);
          ctx.lineTo(sx + r * 0.16, sy - sh * 0.35);
          ctx.lineTo(sx + r * 0.11, sy);
          ctx.lineTo(sx - r * 0.11, sy);
          ctx.lineTo(sx - r * 0.16, sy - sh * 0.35);
          ctx.closePath();
          ctx.fillStyle = 'rgba(163, 247, 255, 0.45)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(232, 252, 255, 0.85)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(184, 245, 255, 0.22)';
        ctx.beginPath();
        safeEllipse(ctx, anchor.x, anchor.padY, r * 0.92, r * 0.24, 0);
        ctx.fill();
        break;
      }
      case 'static': {
        // Crackling golden-blue electric arcs
        ctx.strokeStyle = '#ffe666';
        ctx.lineWidth = 2.1;
        for (let i = 0; i < 3; i++) {
          const a = t * 5 + i * 2.1;
          const x0 = anchor.x + Math.cos(a) * r * 0.78;
          const y0 = anchor.y + Math.sin(a) * r * 0.56;
          const x1 = anchor.x + Math.cos(a + 1.4) * r * 0.84;
          const y1 = anchor.y + Math.sin(a + 1.4) * r * 0.58;
          drawJaggedLightning(ctx, x0, y0, x1, y1, t * 8 + i * 4, 4, 9);
        }
        ctx.strokeStyle = 'rgba(110, 224, 255, 0.72)';
        ctx.lineWidth = 1.2;
        drawJaggedLightning(
          ctx,
          anchor.x - r * 0.72,
          anchor.y + r * 0.22,
          anchor.x + r * 0.72,
          anchor.y - r * 0.26,
          t * 11,
          5,
          10,
        );
        break;
      }
      case 'burn': {
        // Rising ember tongues & heat shimmer
        for (let i = 0; i < 4; i++) {
          const phase = (t * 1.1 + i * 0.25) % 1;
          const fx = anchor.x + Math.sin(i * 1.8 + t * 2.5) * r * 0.52;
          const fy = anchor.padY - phase * r * 1.2;
          const fw = r * 0.14 * (1 - phase * 0.45);
          ctx.beginPath();
          ctx.moveTo(fx, fy - fw * 2.2);
          ctx.quadraticCurveTo(fx + fw, fy - fw * 0.5, fx, fy + fw * 0.6);
          ctx.quadraticCurveTo(fx - fw, fy - fw * 0.5, fx, fy - fw * 2.2);
          ctx.closePath();
          ctx.fillStyle = `rgba(255, 118, 46, ${(1 - phase) * 0.78})`;
          ctx.fill();
        }
        break;
      }
      case 'sleep': {
        // Floating iridescent bubbles drifting upward
        for (let i = 0; i < 4; i++) {
          const phase = (t * 0.55 + i * 0.25) % 1;
          const bx = anchor.x + r * 0.34 + Math.sin(phase * Math.PI * 2 + i) * 11;
          const by = anchor.y - r * 0.18 - phase * r * 1.15;
          const br = 5 + (i % 3) * 2.4;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(198, 178, 255, ${(1 - phase) * 0.36})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(232, 224, 255, ${(1 - phase) * 0.88})`;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.fillStyle = `rgba(255, 255, 255, ${(1 - phase) * 0.9})`;
          ctx.beginPath();
          ctx.arc(bx - br * 0.3, by - br * 0.3, br * 0.24, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
    }
    ctx.restore();
  }

  private drawElementalChoreography(
    ctx: CanvasRenderingContext2D,
    state: BattleSceneState,
    evt: BattleVfxEvent,
    layout: BattleStageLayout,
  ): void {
    const p = clamp(evt.elapsed / Math.max(0.08, evt.duration), 0, 1);
    const from = getSideAnchor(evt.fromSide, layout, state);
    const target = getSideAnchor(evt.targetSide, layout, state);
    const pal = TYPE_PALETTES[evt.type] ?? TYPE_PALETTES.normal;
    const scale = evt.effectiveness >= 2 ? 1.24 : evt.effectiveness <= 0.5 ? 0.78 : 1.0;
    const travelP = clamp(p / 0.42, 0, 1);
    const impactP = clamp((p - 0.32) / 0.68, 0, 1);
    const alpha = p < 0.85 ? 1 : clamp((1 - p) / 0.15, 0, 1);

    const beamX = from.x + (target.x - from.x) * travelP;
    const beamY = from.y + (target.y - from.y) * travelP;
    const angle = Math.atan2(target.y - from.y, target.x - from.x);

    ctx.save();
    ctx.globalAlpha = alpha;

    switch (evt.type) {
      case 'normal': {
        // Expanding Starlight shockwaves & 4-point star burst
        const r = (18 + p * 88) * scale;
        ctx.strokeStyle = hexToRgba(pal.glow, 0.88);
        ctx.lineWidth = 3;
        ctx.beginPath();
        safeEllipse(ctx, target.x, target.y, r, r * 0.62, 0);
        ctx.stroke();
        drawStarPath(ctx, beamX, beamY, 22 * scale, 7 * scale, 4, p * 4);
        ctx.fillStyle = pal.glow;
        ctx.fill();
        break;
      }

      case 'grass': {
        // Swirling leaf blades & blooming emerald ring
        for (let i = 0; i < 6; i++) {
          const leafP = clamp(p * 1.4 - i * 0.08, 0, 1);
          const lx = from.x + (target.x - from.x) * leafP;
          const ly = from.y + (target.y - from.y) * leafP + Math.sin(leafP * 10 + i) * 24;
          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(angle + leafP * 6 + i);
          ctx.beginPath();
          ctx.moveTo(-12 * scale, 0);
          ctx.quadraticCurveTo(0, -8 * scale, 14 * scale, 0);
          ctx.quadraticCurveTo(0, 8 * scale, -12 * scale, 0);
          ctx.fillStyle = i % 2 === 0 ? pal.primary : pal.glow;
          ctx.fill();
          ctx.restore();
        }
        break;
      }

      case 'fire': {
        // Spiraling flame stream & blazing cinder ring
        ctx.strokeStyle = hexToRgba(pal.primary, 0.88);
        ctx.lineWidth = 6 * scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        for (let i = 1; i <= 10; i++) {
          const t = (i / 10) * travelP;
          const sx = from.x + (target.x - from.x) * t + Math.sin(t * 14 + p * 12) * 16;
          const sy = from.y + (target.y - from.y) * t - Math.cos(t * 14 + p * 12) * 12;
          ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        if (impactP > 0) {
          for (let f = 0; f < 5; f++) {
            const fa = (f / 5) * Math.PI * 2 + p * 4;
            const fr = 16 + impactP * 54 * scale;
            ctx.fillStyle = hexToRgba(f % 2 === 0 ? pal.glow : pal.primary, (1 - impactP) * 0.9);
            ctx.beginPath();
            ctx.arc(target.x + Math.cos(fa) * fr, target.y + Math.sin(fa) * fr * 0.68, 12 * scale, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }

      case 'water': {
        // Surging tidal crest arc & foam ring
        ctx.strokeStyle = pal.glow;
        ctx.lineWidth = 8 * scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y + 10);
        ctx.quadraticCurveTo((from.x + beamX) * 0.5, Math.min(from.y, beamY) - 52, beamX, beamY);
        ctx.stroke();

        if (impactP > 0) {
          ctx.strokeStyle = hexToRgba(pal.primary, (1 - impactP) * 0.92);
          ctx.lineWidth = 4.5;
          ctx.beginPath();
          safeEllipse(ctx, target.x, target.padY - 6, 28 + impactP * 76 * scale, 12 + impactP * 28, 0);
          ctx.stroke();
        }
        break;
      }

      case 'electric': {
        // Multi-branch crackling Sky Thunder lightning forks
        const seed = Math.floor(p * (state.reducedMotion ? 3 : 12)) + evt.id.length;
        ctx.strokeStyle = pal.primary;
        ctx.lineWidth = 4.2 * scale;
        drawJaggedLightning(ctx, target.x - 18, 18, target.x, target.y, seed, 8, 26);
        drawJaggedLightning(ctx, from.x, from.y, beamX, beamY, seed + 3, 7, 18);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8 * scale;
        drawJaggedLightning(ctx, target.x - 18, 18, target.x, target.y, seed, 8, 22);
        break;
      }

      case 'ice': {
        // Borealis crystal lance + radial 6-point frost prism shards
        ctx.save();
        ctx.translate(beamX, beamY);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(32 * scale, 0);
        ctx.lineTo(-18 * scale, -10 * scale);
        ctx.lineTo(-26 * scale, 0);
        ctx.lineTo(-18 * scale, 10 * scale);
        ctx.closePath();
        ctx.fillStyle = pal.glow;
        ctx.fill();
        ctx.strokeStyle = pal.secondary;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        if (impactP > 0) {
          for (let c = 0; c < 6; c++) {
            const a = (c / 6) * Math.PI * 2;
            const d = 14 + impactP * 62 * scale;
            drawPolygonPath(ctx, target.x + Math.cos(a) * d, target.y + Math.sin(a) * d * 0.8, 11 * scale, 6, a);
            ctx.fillStyle = hexToRgba(pal.glow, (1 - impactP) * 0.78);
            ctx.fill();
          }
        }
        break;
      }

      case 'fighting': {
        // High-impact shock-cones & radial strike lines
        if (impactP > 0) {
          ctx.strokeStyle = hexToRgba(pal.glow, (1 - impactP) * 0.95);
          ctx.lineWidth = 3.6;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(target.x + Math.cos(a) * 16, target.y + Math.sin(a) * 16);
            ctx.lineTo(target.x + Math.cos(a) * (32 + impactP * 74 * scale), target.y + Math.sin(a) * (32 + impactP * 74 * scale));
            ctx.stroke();
          }
        }
        drawStarPath(ctx, beamX, beamY, 24 * scale, 9 * scale, 6, p * 3);
        ctx.fillStyle = pal.primary;
        ctx.fill();
        break;
      }

      case 'poison': {
        // Lumina Venom toxic orbs & curling bioluminescent wave
        for (let i = 0; i < 5; i++) {
          const t = clamp(travelP - i * 0.08, 0, 1);
          const px = from.x + (target.x - from.x) * t;
          const py = from.y + (target.y - from.y) * t - Math.sin(t * Math.PI) * 36 + (i % 2) * 12;
          ctx.beginPath();
          ctx.arc(px, py, (12 - i) * scale, 0, Math.PI * 2);
          ctx.fillStyle = hexToRgba(i % 2 === 0 ? pal.primary : pal.glow, 0.84);
          ctx.fill();
        }
        break;
      }

      case 'ground': {
        // Seismic tectonic stone spikes erupting under target
        const spikeCount = 5;
        for (let i = 0; i < spikeCount; i++) {
          const sx = target.x + (i - 2) * 22 * scale;
          const sh = Math.sin(clamp(impactP * 1.4, 0, 1) * Math.PI) * (58 - Math.abs(i - 2) * 10) * scale;
          if (sh <= 1) continue;
          ctx.beginPath();
          ctx.moveTo(sx - 12, target.padY + 6);
          ctx.lineTo(sx, target.padY - sh);
          ctx.lineTo(sx + 12, target.padY + 6);
          ctx.closePath();
          ctx.fillStyle = i % 2 === 0 ? pal.primary : pal.secondary;
          ctx.fill();
          ctx.strokeStyle = pal.glow;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        break;
      }

      case 'flying': {
        // Sweeping aerodynamic slipstream ribbons & wind crescents
        ctx.strokeStyle = hexToRgba(pal.glow, 0.88);
        ctx.lineWidth = 4 * scale;
        ctx.lineCap = 'round';
        for (let w = -1; w <= 1; w += 2) {
          ctx.beginPath();
          ctx.moveTo(from.x, from.y + w * 14);
          ctx.bezierCurveTo(
            from.x + (target.x - from.x) * 0.4,
            from.y - 60 + w * 32,
            from.x + (target.x - from.x) * 0.7,
            target.y + 40 + w * 24,
            beamX,
            beamY + w * 8,
          );
          ctx.stroke();
        }
        break;
      }

      case 'psychic': {
        // Rotating hypnotic prism rings & astral refraction rays
        for (let ring = 0; ring < 3; ring++) {
          const r = (22 + ring * 18 + impactP * 44) * scale;
          ctx.strokeStyle = hexToRgba(ring % 2 === 0 ? pal.primary : pal.glow, 0.82);
          ctx.lineWidth = 2.6;
          drawPolygonPath(ctx, target.x, target.y, r, 4, p * 3 * (ring % 2 === 0 ? 1 : -1));
          ctx.stroke();
        }
        ctx.strokeStyle = hexToRgba(pal.glow, 0.75);
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(beamX, beamY);
        ctx.stroke();
        break;
      }

      case 'bug': {
        // Synchronized lantern swarm darts converging on target
        for (let i = 0; i < 8; i++) {
          const t = clamp(p * 1.35 - i * 0.04, 0, 1);
          const arcY = Math.sin(t * Math.PI * 3 + i * 1.4) * 28;
          const bx = from.x + (target.x - from.x) * t;
          const by = from.y + (target.y - from.y) * t + arcY;
          ctx.fillStyle = i % 2 === 0 ? pal.glow : pal.primary;
          ctx.beginPath();
          safeEllipse(ctx, bx, by, 9 * scale, 4.5 * scale, angle);
          ctx.fill();
        }
        break;
      }

      case 'rock': {
        // Tumbling faceted meteor stones crashing onto target
        for (let i = 0; i < 4; i++) {
          const rp = clamp((p - i * 0.08) / 0.55, 0, 1);
          if (rp <= 0) continue;
          const rx = target.x + (i - 1.5) * 22;
          const ry = target.y - 160 * (1 - rp) + (i % 2) * 14;
          drawPolygonPath(ctx, rx, ry, (15 - i) * scale, 5, rp * 6 + i);
          ctx.fillStyle = pal.primary;
          ctx.fill();
          ctx.strokeStyle = pal.glow;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        break;
      }

      case 'ghost': {
        // Orbiting spectral wisps & phase rings
        for (let i = 0; i < 4; i++) {
          const a = p * 8 + (i / 4) * Math.PI * 2;
          const rad = 24 + Math.sin(p * Math.PI) * 38 * scale;
          const wx = target.x + Math.cos(a) * rad;
          const wy = target.y + Math.sin(a) * rad * 0.72;
          ctx.beginPath();
          ctx.arc(wx, wy, 10 * scale, 0, Math.PI * 2);
          ctx.fillStyle = pal.primary;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(wx, wy, 5 * scale, 0, Math.PI * 2);
          ctx.fillStyle = pal.glow;
          ctx.fill();
        }
        break;
      }

      case 'dragon': {
        // Twin intertwined Celestial Wyrm star-streams
        for (const sign of [-1, 1] as const) {
          ctx.strokeStyle = sign > 0 ? pal.primary : '#ffd479';
          ctx.lineWidth = 5.5 * scale;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          for (let i = 1; i <= 12; i++) {
            const t = (i / 12) * travelP;
            const wave = Math.sin(t * Math.PI * 3.5 + p * 8) * 24 * sign;
            const sx = from.x + (target.x - from.x) * t - Math.sin(angle) * wave;
            const sy = from.y + (target.y - from.y) * t + Math.cos(angle) * wave;
            ctx.lineTo(sx, sy);
          }
          ctx.stroke();
        }
        if (impactP > 0) {
          drawStarPath(ctx, target.x, target.y, (38 + impactP * 32) * scale, 12 * scale, 6, p * 4);
          ctx.fillStyle = hexToRgba(pal.glow, (1 - impactP) * 0.88);
          ctx.fill();
        }
        break;
      }

      case 'dark': {
        // Intersecting Umbral Cleave shadow crescents
        for (const slashAng of [-0.65, 0.65]) {
          ctx.save();
          ctx.translate(target.x, target.y);
          ctx.rotate(slashAng);
          const span = Math.sin(clamp(p * 1.4, 0, 1) * Math.PI) * 72 * scale;
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(8, span), -0.85, 0.85);
          ctx.quadraticCurveTo(span * 0.35, 0, Math.cos(-0.85) * span, Math.sin(-0.85) * span);
          ctx.closePath();
          ctx.fillStyle = hexToRgba(pal.glow, 0.82);
          ctx.fill();
          ctx.strokeStyle = pal.dark;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();
        }
        break;
      }

      case 'steel': {
        // Fan of gleaming forged Aegis lances
        for (let i = -1; i <= 1; i++) {
          const lp = clamp(p * 1.35 - Math.abs(i) * 0.08, 0, 1);
          const lx = from.x + (target.x - from.x) * lp;
          const ly = from.y + (target.y - from.y) * lp + i * 24 * (1 - lp);
          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(30 * scale, 0);
          ctx.lineTo(-22 * scale, -6 * scale);
          ctx.lineTo(-14 * scale, 0);
          ctx.lineTo(-22 * scale, 6 * scale);
          ctx.closePath();
          ctx.fillStyle = '#e8f4ff';
          ctx.fill();
          ctx.strokeStyle = pal.secondary;
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.restore();
        }
        break;
      }

      case 'fairy': {
        // Moonbloom petal halo & crescent sigil
        const petalCount = 7;
        for (let i = 0; i < petalCount; i++) {
          const a = p * 5 + (i / petalCount) * Math.PI * 2;
          const rad = (24 + Math.sin(p * Math.PI) * 44) * scale;
          const px = target.x + Math.cos(a) * rad;
          const py = target.y + Math.sin(a) * rad * 0.72;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(a + 0.8);
          ctx.beginPath();
          safeEllipse(ctx, 0, 0, 10 * scale, 5.5 * scale, 0);
          ctx.fillStyle = i % 2 === 0 ? pal.primary : pal.glow;
          ctx.fill();
          ctx.restore();
        }
        ctx.strokeStyle = hexToRgba(pal.glow, 0.85);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(target.x, target.y, 40 * scale, 0.3, Math.PI * 1.7);
        ctx.stroke();
        break;
      }
    }

    // Composure Shatter Crystalline Burst Overlay
    if (evt.composureBroken && impactP > 0) {
      const fade = clamp(1 - impactP, 0, 1);
      ctx.strokeStyle = `rgba(126, 242, 255, ${fade.toFixed(3)})`;
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.15;
        const d = 18 + impactP * 84;
        drawPolygonPath(ctx, target.x + Math.cos(a) * d, target.y + Math.sin(a) * d * 0.8, 12 * fade + 3, 4, a);
        ctx.fillStyle = `rgba(255, 245, 178, ${(fade * 0.85).toFixed(3)})`;
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawCaptureSequence(
    ctx: CanvasRenderingContext2D,
    state: BattleSceneState,
    layout: BattleStageLayout,
  ): void {
    const cp = clamp(state.enemy.captureProgress ?? 0, 0, 1);
    const from = getSideAnchor('player', layout, state);
    const to = getSideAnchor('enemy', layout, state);
    const radius = Math.max(12, layout.enemyPad.size * 0.14);

    if (cp < 0.30) {
      // Throw parabola
      const t = cp / 0.30;
      const bx = from.x + (to.x - from.x) * t;
      const by = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * layout.height * 0.26;
      drawStarBallVector(ctx, bx, by, radius, state.reducedMotion ? 0 : t * Math.PI * 4, 0, 0.7);
    } else if (cp < 0.48) {
      // Impact flash & containment beam
      const t = (cp - 0.30) / 0.18;
      const bx = to.x;
      const by = to.y - layout.height * 0.08;
      const beamGrad = ctx.createLinearGradient(bx, by, to.x, to.padY);
      beamGrad.addColorStop(0, 'rgba(130, 238, 255, 0.85)');
      beamGrad.addColorStop(1, 'rgba(255, 214, 102, 0.25)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(to.x - to.size * 0.44 * (1 - t * 0.5), to.padY);
      ctx.lineTo(to.x + to.size * 0.44 * (1 - t * 0.5), to.padY);
      ctx.closePath();
      ctx.fill();
      drawStarBallVector(ctx, bx, by, radius, 0, Math.sin(t * Math.PI) * 0.85, 1.0);
    } else {
      // Rhythmic shakes & final capture seal
      const bx = to.x;
      const by = to.padY - radius * 0.9;
      let shakeAngle = 0;
      if (cp < 0.88 && !state.reducedMotion) {
        const shakePhase = ((cp - 0.48) / 0.40) * 3;
        const local = shakePhase % 1;
        shakeAngle = local < 0.65 ? Math.sin(local * Math.PI * 3.1) * 0.34 : 0;
      }
      drawStarBallVector(ctx, bx, by, radius, shakeAngle, 0, cp >= 0.88 ? 1.0 : 0.45);
      if (cp >= 0.88) {
        const burst = (cp - 0.88) / 0.12;
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI * 0.5 + (i - 1) * 0.55;
          const dist = radius * (1.4 + burst * 1.4);
          drawStarPath(ctx, bx + Math.cos(a) * dist, by + Math.sin(a) * dist, 7, 2.8, 4, 0);
          ctx.fillStyle = `rgba(255, 232, 118, ${(1 - burst * 0.4).toFixed(3)})`;
          ctx.fill();
        }
      }
    }
  }

  private drawEvolutionSequence(
    ctx: CanvasRenderingContext2D,
    state: BattleSceneState,
    layout: BattleStageLayout,
  ): void {
    const anchor = getSideAnchor('player', layout, state);
    const t = state.reducedMotion ? 0.5 : state.elapsedSeconds;

    ctx.save();
    // Radiant geometric metamorphosis ribbons & mandala rings
    for (let strand = 0; strand < 2; strand++) {
      ctx.strokeStyle = strand === 0 ? 'rgba(255, 232, 130, 0.85)' : 'rgba(130, 238, 255, 0.85)';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const f = i / 20;
        const ang = f * Math.PI * 4 + t * 4 + strand * Math.PI;
        const rx = anchor.size * 0.48 * (1 - f * 0.35);
        const px = anchor.x + Math.cos(ang) * rx;
        const py = anchor.padY - f * anchor.size * 1.35;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Glowing metamorphosis hex/star mandala at base
    ctx.strokeStyle = 'rgba(255, 240, 175, 0.78)';
    ctx.lineWidth = 2.4;
    drawPolygonPath(ctx, anchor.x, anchor.padY - 4, anchor.size * 0.58, 6, t * 0.8);
    ctx.stroke();
    ctx.restore();
  }
}
