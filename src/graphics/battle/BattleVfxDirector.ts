import type {
  BallKind,
  BattleCombatantVisual,
  BattleSceneState,
  BattleVfxEvent,
  IRenderBackend,
} from '../../contracts';
import { TYPE_PALETTES } from '../../core';
import {
  applyCameraToContext,
  clamp,
  computeBattleStageLayout,
  drawPixelCrossStar,
  drawPixelSteppedDisc,
  hexToRgba,
  type BattleCameraTransform,
  type BattleStageLayout,
} from './BattleArenas';

export interface CombatantRenderAnchor {
  x: number;
  y: number;
  padY: number;
  size: number;
}

export function getSideAnchor(
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

function snap(v: number, px: number): number {
  return Math.round(v / px) * px;
}

function drawPixelRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  px = 1,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(snap(x, px), snap(y, px), Math.max(px, snap(w, px)), Math.max(px, snap(h, px)));
}

function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  px: number,
): void {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / Math.max(1, px)));
  ctx.fillStyle = color;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = snap(x0 + (x1 - x0) * t, px);
    const y = snap(y0 + (y1 - y0) * t, px);
    ctx.fillRect(x, y, px, px);
  }
}

function drawPixelShockwave(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  px: number,
  points = 28,
): void {
  ctx.fillStyle = color;
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const x = snap(cx + Math.cos(a) * rx, px);
    const y = snap(cy + Math.sin(a) * ry, px);
    ctx.fillRect(x, y, px, px);
  }
}

function drawPixelHexagon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation: number,
  color: string,
  px: number,
  edgeProgress = 6,
): void {
  const verts: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const a = rotation + (i / 6) * Math.PI * 2;
    verts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  for (let i = 0; i < 6; i++) {
    const k = clamp(edgeProgress - i, 0, 1);
    if (k <= 0.01) break;
    const [x0, y0] = verts[i];
    const [x1, y1] = verts[(i + 1) % 6];
    drawPixelLine(ctx, x0, y0, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, color, px);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(snap(x0, px), snap(y0, px), px, px);
  }
}

function drawPixelDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  fill: string,
  rim: string,
  px: number,
): void {
  const steps = Math.max(2, Math.round(radius / px));
  const sx = snap(cx, px);
  const sy = snap(cy, px);
  for (let r = -steps; r <= steps; r++) {
    const w = Math.max(0, steps - Math.abs(r));
    ctx.fillStyle = fill;
    ctx.fillRect(sx - w * px, sy + r * px, (w * 2 + 1) * px, px);
    ctx.fillStyle = rim;
    ctx.fillRect(sx - w * px, sy + r * px, px, px);
    ctx.fillRect(sx + w * px, sy + r * px, px, px);
  }
}

function drawPixelStarburst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  arms: number,
  rotation: number,
  outerColor: string,
  coreColor: string,
  px: number,
): void {
  for (let i = 0; i < arms; i++) {
    const a = rotation + (i / arms) * Math.PI * 2;
    const tx = cx + Math.cos(a) * radius;
    const ty = cy + Math.sin(a) * radius;
    drawPixelLine(ctx, cx, cy, tx, ty, outerColor, px);
    const mx = cx + Math.cos(a) * radius * 0.48;
    const my = cy + Math.sin(a) * radius * 0.48;
    drawPixelLine(ctx, cx, cy, mx, my, coreColor, px);
  }
  drawPixelRect(ctx, cx - px, cy - px, px * 2, px * 2, '#ffffff', px);
}

function drawPixelLightning(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  seed: number,
  segments: number,
  spread: number,
  outerColor: string,
  coreColor: string,
  px: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const pts: Array<[number, number]> = [[x0, y0]];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const jitter = Math.sin(seed * 17.3 + i * 9.7) * spread * (1 - Math.abs(t - 0.5) * 0.55);
    pts.push([x0 + dx * t + nx * jitter, y0 + dy * t + ny * jitter]);
  }
  pts.push([x1, y1]);

  for (let i = 0; i < pts.length - 1; i++) {
    drawPixelLine(ctx, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], outerColor, px * 2);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    drawPixelLine(ctx, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], coreColor, px);
  }
}

function drawPixelBallSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  kind: BallKind,
  rotation: number,
  openAmount: number,
): void {
  const px = Math.max(2, Math.round(size / 10));
  const topColor =
    kind === 'star' ? '#2c3d9e' : kind === 'great' ? '#2570d9' : '#e03e3e';
  const topHighlight =
    kind === 'star' ? '#7be8ff' : kind === 'great' ? '#66b8ff' : '#ff8c8c';
  const trimColor =
    kind === 'star' ? '#ffd954' : kind === 'great' ? '#e84855' : '#1b1d36';

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(snap(cx, px), snap(cy, px));
  if (rotation !== 0) ctx.rotate(rotation);

  const split = Math.round(openAmount * px * 2.5);
  const rows = [3, 5, 5, 5, 5, 3];

  // Upper cap
  for (let r = 0; r < 3; r++) {
    const hw = rows[r];
    ctx.fillStyle = '#171330';
    ctx.fillRect(-(hw + 1) * px, (-3 + r) * px - split, (hw * 2 + 2) * px, px);
    ctx.fillStyle = topColor;
    ctx.fillRect(-hw * px, (-3 + r) * px - split, hw * 2 * px, px);
  }
  ctx.fillStyle = topHighlight;
  ctx.fillRect(-3 * px, -2 * px - split, px * 2, px);
  if (kind === 'star') {
    ctx.fillStyle = '#ffe566';
    ctx.fillRect(-px, -2 * px - split, px * 2, px);
  } else if (kind === 'great') {
    ctx.fillStyle = trimColor;
    ctx.fillRect(-4 * px, -2 * px - split, px, px);
    ctx.fillRect(3 * px, -2 * px - split, px, px);
  }

  // Lower cap
  for (let r = 3; r < 6; r++) {
    const hw = rows[r];
    ctx.fillStyle = '#171330';
    ctx.fillRect(-(hw + 1) * px, (-3 + r) * px + split, (hw * 2 + 2) * px, px);
    ctx.fillStyle = r === 5 ? '#c8d6ed' : '#f4f8ff';
    ctx.fillRect(-hw * px, (-3 + r) * px + split, hw * 2 * px, px);
  }

  // Equatorial band & lock clasp
  if (openAmount < 0.35) {
    ctx.fillStyle = '#171330';
    ctx.fillRect(-5 * px, -px * 0.5, 10 * px, px);
    ctx.fillStyle = trimColor;
    ctx.fillRect(-px, -px, px * 2, px * 2);
    ctx.fillStyle = kind === 'star' ? '#7be8ff' : '#ffffff';
    ctx.fillRect(-px * 0.5, -px * 0.5, px, px);
  } else {
    drawPixelCrossStar(ctx, 0, 0, px * 2, px, '#7be8ff', '#ffffff');
  }

  ctx.restore();
}

function drawPixelChevronGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  up: boolean,
  color: string,
  px: number,
): void {
  const s = Math.max(2, px);
  ctx.fillStyle = '#141329';
  ctx.fillRect(snap(x - s * 2, s), snap(y - s, s), s * 5, s * 4);
  ctx.fillStyle = color;
  if (up) {
    ctx.fillRect(snap(x, s), snap(y - s, s), s, s);
    ctx.fillRect(snap(x - s, s), snap(y, s), s, s);
    ctx.fillRect(snap(x + s, s), snap(y, s), s, s);
    ctx.fillRect(snap(x - s * 2, s), snap(y + s, s), s, s);
    ctx.fillRect(snap(x + s * 2, s), snap(y + s, s), s, s);
  } else {
    ctx.fillRect(snap(x - s * 2, s), snap(y - s, s), s, s);
    ctx.fillRect(snap(x + s * 2, s), snap(y - s, s), s, s);
    ctx.fillRect(snap(x - s, s), snap(y, s), s, s);
    ctx.fillRect(snap(x + s, s), snap(y, s), s, s);
    ctx.fillRect(snap(x, s), snap(y + s, s), s, s);
  }
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
      const effScale = evt.effectiveness >= 1.5 ? 1.35 : evt.effectiveness <= 0.5 ? 0.75 : 1.0;
      const critScale = evt.isCrit ? 1.2 : 1.0;
      const powerScale = clamp(Math.max(45, evt.power) / 80, 0.78, 1.45) * effScale * critScale;

      if (evt.category === 'heal' || evt.category === 'buff' || evt.category === 'shield') {
        const lightColor: [number, number, number] =
          evt.category === 'heal'
            ? [0.35, 1.0, 0.62]
            : evt.category === 'shield'
              ? [0.45, 0.92, 1.0]
              : pal.rgb;
        backend.addPointLight({
          id: `vfx-support-${evt.id}`,
          x: target.x,
          y: target.y,
          radius: 175 * powerScale,
          color: lightColor,
          intensity: clamp(1.4 * Math.sin(p * Math.PI), 0.2, 1.8),
          flickerSpeed: 5,
          flickerAmount: state.reducedMotion ? 0 : 0.08,
        });
        const count = state.reducedMotion ? 4 : 8;
        for (let i = 0; i < count; i++) {
          const rise = (p * 1.2 + i / count) % 1;
          const a = p * 5 * motionScale + i * 0.9;
          backend.drawParticle({
            x: target.x + Math.cos(a) * 34,
            y: target.padY - rise * target.size * 1.15,
            radius: 7,
            color: [lightColor[0], lightColor[1], lightColor[2], (1 - rise) * 0.9],
            additive: true,
          });
        }
        continue;
      }

      const travelP = clamp(p / 0.42, 0, 1);
      const impactP = clamp((p - 0.30) / 0.70, 0, 1);
      const beamX = from.x + (target.x - from.x) * travelP;
      const beamY = from.y + (target.y - from.y) * travelP;

      const lightPos = p < 0.36 ? { x: beamX, y: beamY } : { x: target.x, y: target.y };
      const lightFade = p < 0.36 ? 1 : 1 - impactP * 0.82;
      backend.addPointLight({
        id: `vfx-light-${evt.id}`,
        x: lightPos.x,
        y: lightPos.y,
        radius: 195 * powerScale,
        color: pal.rgb,
        intensity: clamp(1.55 * lightFade * powerScale, 0, 2),
        flickerSpeed: 9,
        flickerAmount: state.reducedMotion ? 0 : 0.14,
      });

      this.emitElementalParticles(backend, evt, from, target, p, impactP, powerScale, motionScale);

      if (evt.composureBraced && p >= 0.28) {
        const braceT = clamp((p - 0.28) / 0.55, 0, 1);
        const shardCount = state.reducedMotion ? 6 : 12;
        for (let i = 0; i < shardCount; i++) {
          const ang = (i / shardCount) * Math.PI * 2;
          const dist = 20 + braceT * 88;
          backend.drawParticle({
            x: target.x + Math.cos(ang) * dist,
            y: target.y + Math.sin(ang) * dist * 0.8,
            radius: (9 - braceT * 5) * (i % 2 === 0 ? 1.2 : 0.85),
            color: i % 2 === 0 ? [0.48, 0.94, 1.0, (1 - braceT) * 0.95] : [1.0, 0.88, 0.45, (1 - braceT) * 0.9],
            stretchX: 2.0,
            stretchY: 0.45,
            rotation: ang,
            additive: true,
          });
        }
      }
    }

    // Combatant state lights & sparkles (Shiny / Elite / Braced / Shield)
    for (const vis of [state.player, state.enemy]) {
      const anchor = getSideAnchor(vis.side, layout, state);
      if (vis.bracedFlash > 0.05) {
        backend.addPointLight({
          id: `braced-light-${vis.side}`,
          x: anchor.x,
          y: anchor.y,
          radius: 165,
          color: [0.48, 0.94, 1.0],
          intensity: clamp(vis.bracedFlash * 1.4, 0, 2),
        });
      }
      if (vis.mon.isShiny) {
        const count = state.reducedMotion ? 2 : 4;
        for (let i = 0; i < count; i++) {
          const a = state.elapsedSeconds * 2.6 * motionScale + (i / count) * Math.PI * 2;
          const hue = ((state.elapsedSeconds * 0.6 + i * 0.25) % 1);
          const col: [number, number, number, number] =
            hue < 0.33
              ? [1.0, 0.92, 0.46, 0.82]
              : hue < 0.66
                ? [0.48, 0.94, 1.0, 0.82]
                : [1.0, 0.62, 0.92, 0.82];
          backend.drawParticle({
            x: anchor.x + Math.cos(a) * anchor.size * 0.45,
            y: anchor.y + Math.sin(a * 1.3) * anchor.size * 0.32,
            radius: 5,
            color: col,
            additive: true,
          });
        }
      }
    }

    // Capture sequence particles & PointLight
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

      const ballColor: [number, number, number] =
        state.enemy.captureBallKind === 'star'
          ? [0.55, 0.9, 1.0]
          : state.enemy.captureBallKind === 'great'
            ? [0.35, 0.7, 1.0]
            : [1.0, 0.45, 0.42];

      backend.addPointLight({
        id: 'capture-ball-light',
        x: bx,
        y: by,
        radius: 160,
        color: ballColor,
        intensity: cp > 0.28 && cp < 0.5 ? 1.65 : 0.95,
      });

      const sparkCount = state.reducedMotion ? 3 : 6;
      for (let i = 0; i < sparkCount; i++) {
        const a = state.elapsedSeconds * 4 * motionScale + (i / sparkCount) * Math.PI * 2;
        const r = 18 + (cp > 0.85 ? (cp - 0.85) * 320 : 12);
        backend.drawParticle({
          x: bx + Math.cos(a) * r,
          y: by + Math.sin(a) * r * 0.72,
          radius: 7,
          color: i % 2 === 0 ? [1.0, 0.92, 0.48, 0.9] : [ballColor[0], ballColor[1], ballColor[2], 0.9],
          additive: true,
        });
      }
    }

    // Evolution phase starlight particles & radiance light
    if (state.phase === 'evolving') {
      const anchor = getSideAnchor('player', layout, state);
      backend.addPointLight({
        id: 'evolution-radiance',
        x: anchor.x,
        y: anchor.y,
        radius: 240,
        color: [0.95, 0.88, 1.0],
        intensity: 1.6,
      });
      const count = state.reducedMotion ? 4 : 12;
      for (let i = 0; i < count; i++) {
        const rise = (state.elapsedSeconds * 0.8 * motionScale + i / count) % 1;
        const angle = state.elapsedSeconds * 3.4 * motionScale + i * 1.1;
        backend.drawParticle({
          x: anchor.x + Math.cos(angle) * (48 * (1 - rise * 0.42)),
          y: anchor.padY - rise * anchor.size * 1.4,
          radius: 8 * (1 - rise * 0.45),
          color: i % 2 === 0 ? [1.0, 0.92, 0.55, (1 - rise) * 0.92] : [0.62, 0.94, 1.0, (1 - rise) * 0.92],
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

    if (p < 0.48) {
      const t = clamp(p / 0.42, 0, 1);
      for (let i = 0; i < Math.max(4, Math.floor(count * 0.7)); i++) {
        const trail = clamp(t - i * 0.06, 0, 1);
        const spread = Math.sin(i * 2.4 + p * 12) * 14 * motionScale;
        const px = from.x + (target.x - from.x) * trail - Math.sin(angle) * spread;
        const py = from.y + (target.y - from.y) * trail + Math.cos(angle) * spread;
        backend.drawParticle({
          x: px,
          y: py,
          radius: (10 - i * 1.0) * powerScale,
          color: [r, g, b, (1 - i * 0.11) * 0.88],
          stretchX: evt.type === 'electric' || evt.type === 'steel' ? 2.2 : 1.35,
          stretchY: 0.75,
          rotation: angle,
          additive: evt.type !== 'dark' && evt.type !== 'ground',
        });
      }
    }

    if (impactP > 0.01) {
      const fade = clamp(1 - impactP, 0, 1);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + p * 2.4 * motionScale;
        const dist = (12 + impactP * 88 * powerScale) * (0.75 + (i % 3) * 0.2);
        const liftY = evt.type === 'fire' || evt.type === 'ghost' ? -impactP * 40 : 0;
        backend.drawParticle({
          x: target.x + Math.cos(a) * dist,
          y: target.y + Math.sin(a) * dist * 0.75 + liftY,
          radius: (12 * fade + 3) * powerScale,
          color: [Math.min(1, r + 0.2), Math.min(1, g + 0.2), Math.min(1, b + 0.2), fade * 0.92],
          stretchX: evt.type === 'fighting' || evt.type === 'flying' ? 2.1 : 1.15,
          stretchY: 0.85,
          rotation: a,
          additive: evt.type !== 'dark',
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
      const px = Math.max(2, Math.round(Math.min(width, height) / 160));
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      applyCameraToContext(ctx, width, height, camera);

      // 1. Per-combatant Shield prism dome, Composure BRACED! hex burst, Buff/Heal, Stat Chevrons, Shiny/Trait, Ability banner
      this.drawCombatantOverlays(ctx, state.player, getSideAnchor('player', layout, state), state.elapsedSeconds, state.reducedMotion, px);
      this.drawCombatantOverlays(ctx, state.enemy, getSideAnchor('enemy', layout, state), state.elapsedSeconds, state.reducedMotion, px);

      // 2. All 18-Type & Support VFX Choreographies
      for (const evt of events) {
        this.drawEventChoreography(ctx, state, evt, layout, px);
      }

      // 3. Poké / Great / Star Ball Capture Arc, Impact Flash & Wobble Shakes
      if (state.phase === 'capturing') {
        this.drawCaptureSequence(ctx, state, layout, px);
      }

      // 4. Evolution Radiant Spiral Metamorphosis
      if (state.phase === 'evolving') {
        this.drawEvolutionSequence(ctx, state, layout, px);
      }

      ctx.restore();
    }, 'post-light');
  }

  private drawCombatantOverlays(
    ctx: CanvasRenderingContext2D,
    vis: BattleCombatantVisual,
    anchor: CombatantRenderAnchor,
    time: number,
    reducedMotion: boolean,
    px: number,
  ): void {
    const mon = vis.mon;
    const motion = reducedMotion ? 0.15 : 1.0;
    const t = time * motion;
    const pal = TYPE_PALETTES[mon.type] ?? TYPE_PALETTES.normal;

    // Apex / Elite / Encounter Trait aura
    if (mon.isElite || mon.encounterTrait) {
      const auraColor =
        mon.isElite || mon.encounterTrait === 'apex'
          ? '#ff6b6b'
          : mon.encounterTrait === 'treasure'
            ? '#ffd954'
            : mon.encounterTrait === 'spirited'
              ? '#66e0ff'
              : '#c084fc';
      const pillarCount = reducedMotion ? 2 : 4;
      for (let i = 0; i < pillarCount; i++) {
        const rise = (t * 0.9 + i / pillarCount) % 1;
        const ox = (i - (pillarCount - 1) * 0.5) * anchor.size * 0.24;
        const py = anchor.padY - rise * anchor.size * 0.9;
        ctx.fillStyle = hexToRgba(auraColor, (1 - rise) * 0.72);
        ctx.fillRect(snap(anchor.x + ox, px), snap(py, px), px, px * 3);
      }
    }

    // Active Shield Prism Dome (shieldTurns > 0)
    if (mon.shieldTurns > 0) {
      const rx = anchor.size * 0.54;
      const ry = anchor.size * 0.46;
      const pulse = reducedMotion ? 0 : Math.sin(t * 3.0) * px;
      drawPixelHexagon(
        ctx,
        anchor.x,
        anchor.y,
        rx + pulse,
        ry + pulse,
        -Math.PI * 0.5,
        'rgba(126, 242, 255, 0.85)',
        px,
      );
      drawPixelHexagon(
        ctx,
        anchor.x,
        anchor.y,
        rx * 0.86,
        ry * 0.86,
        -Math.PI * 0.5,
        'rgba(255, 224, 128, 0.52)',
        px,
      );
      // Remaining shield turn pips above dome
      for (let i = 0; i < Math.min(5, mon.shieldTurns); i++) {
        const pipX = anchor.x + (i - (Math.min(5, mon.shieldTurns) - 1) * 0.5) * px * 4;
        drawPixelRect(ctx, pipX - px, anchor.y - ry - px * 3, px * 2, px * 2, '#7be8ff', px);
      }
    }

    // Composure BRACED! Hexagonal Pixel Barrier Burst (bracedFlash > 0)
    if (vis.bracedFlash > 0.02) {
      const bf = clamp(vis.bracedFlash, 0, 1);
      const expand = 1 + (1 - bf) * 0.35;
      const rx = anchor.size * 0.58 * expand;
      const ry = anchor.size * 0.48 * expand;
      drawPixelHexagon(
        ctx,
        anchor.x,
        anchor.y,
        rx,
        ry,
        -Math.PI * 0.5,
        `rgba(126, 242, 255, ${bf.toFixed(3)})`,
        px * 2,
      );
      drawPixelHexagon(
        ctx,
        anchor.x,
        anchor.y,
        rx * 0.78,
        ry * 0.78,
        Math.PI / 6,
        `rgba(255, 230, 118, ${(bf * 0.92).toFixed(3)})`,
        px,
      );

      // Pixel-framed BRACED! tag
      const tagW = 74;
      const tagH = 20;
      const tagX = snap(anchor.x - tagW * 0.5, px);
      const tagY = snap(anchor.y - anchor.size * 0.62 - (1 - bf) * 14, px);
      ctx.save();
      ctx.globalAlpha = clamp(bf * 1.25, 0, 1);
      ctx.fillStyle = '#0d193d';
      ctx.fillRect(tagX, tagY, tagW, tagH);
      ctx.strokeStyle = '#7be8ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(tagX, tagY, tagW, tagH);
      ctx.fillStyle = '#ffe566';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BRACED!', tagX + tagW * 0.5, tagY + tagH * 0.5 + 1);
      ctx.restore();
    }

    // Heal & Buff Pixel Flashes
    if (vis.healFlash > 0.04) {
      const hf = clamp(vis.healFlash, 0, 1);
      for (let i = 0; i < 3; i++) {
        const pxX = anchor.x + (i - 1) * anchor.size * 0.25;
        const pxY = anchor.padY - (1 - hf) * anchor.size * 0.85 - i * 10;
        drawPixelCrossStar(ctx, pxX, pxY, px * 2, px, `rgba(75, 212, 120, ${hf.toFixed(3)})`);
      }
    }
    if (vis.buffFlash > 0.04) {
      const bff = clamp(vis.buffFlash, 0, 1);
      for (let i = 0; i < 3; i++) {
        const pxX = anchor.x + (i - 1) * anchor.size * 0.26;
        const pxY = anchor.padY - (1 - bff) * anchor.size * 0.85 - i * 8;
        drawPixelChevronGlyph(ctx, pxX, pxY, true, `rgba(255, 224, 102, ${bff.toFixed(3)})`, px);
      }
    }

    // Stat Stage Chevrons (atk / def / spd)
    const stages: Array<{ label: string; val: number }> = [
      { label: 'ATK', val: mon.battleStages.atk },
      { label: 'DEF', val: mon.battleStages.def },
      { label: 'SPD', val: mon.battleStages.spd },
    ].filter((s) => s.val !== 0);

    if (stages.length > 0) {
      const sideDir = vis.side === 'player' ? -1 : 1;
      const baseX = snap(anchor.x + sideDir * anchor.size * 0.56, px);
      const baseY = snap(anchor.y - anchor.size * 0.24, px);
      ctx.save();
      for (let i = 0; i < stages.length; i++) {
        const st = stages[i];
        const y = baseY + i * 20;
        const isUp = st.val > 0;
        const col = isUp ? '#66f2ff' : '#ff7a7a';
        drawPixelChevronGlyph(ctx, baseX, y, isUp, col, Math.max(2, Math.round(px * 0.85)));
        ctx.fillStyle = '#0c1430';
        ctx.fillRect(baseX + px * 4, y - 7, 46, 14);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.strokeRect(baseX + px * 4, y - 7, 46, 14);
        ctx.fillStyle = col;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${st.label}${isUp ? '+' : ''}${st.val}`, baseX + px * 5, y);
      }
      ctx.restore();
    }

    // Shiny Rainbow Starlight Shimmer
    if (mon.isShiny) {
      const shimmerColors = ['#ffe566', '#7be8ff', '#ff96d5', '#a9ffbf'];
      const count = reducedMotion ? 2 : 4;
      for (let i = 0; i < count; i++) {
        const a = t * 2.1 + (i / count) * Math.PI * 2;
        const sx = anchor.x + Math.cos(a) * anchor.size * 0.46;
        const sy = anchor.y + Math.sin(a * 1.3) * anchor.size * 0.34;
        const color = shimmerColors[(i + Math.floor(t * 4)) % shimmerColors.length];
        drawPixelCrossStar(ctx, sx, sy, px * 2, px, color);
      }
    }

    // Ability Activation Pixel Callout Pulse
    if (vis.abilityBanner && vis.abilityBanner.elapsed < 2.4) {
      const ab = vis.abilityBanner;
      const fade = ab.elapsed < 0.2 ? ab.elapsed / 0.2 : ab.elapsed > 1.9 ? (2.4 - ab.elapsed) / 0.5 : 1;
      const alpha = clamp(fade, 0, 1);
      const boxW = Math.min(188, Math.max(128, ab.name.length * 8 + 26));
      const boxH = 30;
      const bx = snap(anchor.x - boxW * 0.5, px);
      const by = snap(anchor.y - anchor.size * 0.68, px);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#0d1538';
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.strokeStyle = pal.glow;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, boxW, boxH);

      // Corner pixel accents
      ctx.fillStyle = '#ffe566';
      ctx.fillRect(bx - 2, by - 2, 4, 4);
      ctx.fillRect(bx + boxW - 2, by - 2, 4, 4);

      ctx.fillStyle = pal.glow;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(ab.name, bx + boxW * 0.5, by + 4);
      ctx.fillStyle = '#e8f1ff';
      ctx.font = '9px monospace';
      ctx.fillText(ab.summary.slice(0, 26), bx + boxW * 0.5, by + 16);
      ctx.restore();
    }
  }

  private drawEventChoreography(
    ctx: CanvasRenderingContext2D,
    state: BattleSceneState,
    evt: BattleVfxEvent,
    layout: BattleStageLayout,
    px: number,
  ): void {
    const p = clamp(evt.elapsed / Math.max(0.08, evt.duration), 0, 1);
    const from = getSideAnchor(evt.fromSide, layout, state);
    const target = getSideAnchor(evt.targetSide, layout, state);
    const pal = TYPE_PALETTES[evt.type] ?? TYPE_PALETTES.normal;
    const scale = (evt.effectiveness >= 1.5 ? 1.24 : evt.effectiveness <= 0.5 ? 0.8 : 1.0) * (evt.isCrit ? 1.15 : 1);
    const alpha = p < 0.85 ? 1 : clamp((1 - p) / 0.15, 0, 1);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Dedicated Heal / Buff / Shield choreographies
    if (evt.category === 'heal') {
      const count = 6;
      for (let i = 0; i < count; i++) {
        const rise = (p * 1.35 + i / count) % 1;
        const hx = target.x + Math.sin(i * 2.1 + p * 5) * target.size * 0.36;
        const hy = target.padY - rise * target.size * 1.15;
        drawPixelCrossStar(ctx, hx, hy, px * 2, px, i % 2 === 0 ? '#4bd478' : '#a9ffbf');
      }
      drawPixelShockwave(
        ctx,
        target.x,
        target.padY - 4,
        (22 + p * 46) * scale,
        (9 + p * 16) * scale,
        '#a9ffbf',
        px,
      );
      ctx.restore();
      return;
    }

    if (evt.category === 'buff') {
      for (let i = 0; i < 4; i++) {
        const rise = (p * 1.4 + i * 0.25) % 1;
        const bx = target.x + (i - 1.5) * target.size * 0.24;
        const by = target.padY - rise * target.size * 1.1;
        drawPixelChevronGlyph(ctx, bx, by, true, i % 2 === 0 ? '#ffd93d' : pal.glow, px);
      }
      drawPixelShockwave(
        ctx,
        target.x,
        target.y,
        (26 + p * 44) * scale,
        (16 + p * 26) * scale,
        pal.glow,
        px,
      );
      ctx.restore();
      return;
    }

    if (evt.category === 'shield') {
      const r = target.size * (0.64 - p * 0.08);
      drawPixelHexagon(ctx, target.x, target.y, r, r * 0.85, -Math.PI * 0.5, '#7be8ff', px * 2);
      drawPixelHexagon(ctx, target.x, target.y, r * 0.8, r * 0.68, Math.PI / 6, '#ffe566', px);
      ctx.restore();
      return;
    }

    // Attack VFX across all 18 ElementalTypes
    const travelP = clamp(p / 0.42, 0, 1);
    const impactP = clamp((p - 0.30) / 0.70, 0, 1);
    const beamX = from.x + (target.x - from.x) * travelP;
    const beamY = from.y + (target.y - from.y) * travelP;
    const angle = Math.atan2(target.y - from.y, target.x - from.x);

    switch (evt.type) {
      case 'normal': {
        // Stepped pixel dash trail + expanding twin shockwave rings + 4-pt star impact
        drawPixelLine(ctx, from.x, from.y, beamX, beamY, pal.glow, px * 2);
        drawPixelStarburst(ctx, beamX, beamY, 20 * scale, 4, p * 4, pal.primary, '#ffffff', px);
        if (impactP > 0) {
          drawPixelShockwave(ctx, target.x, target.y, (18 + impactP * 76) * scale, (11 + impactP * 48) * scale, pal.glow, px);
        }
        break;
      }

      case 'grass': {
        // Swirling razor leaf pixel blades + emerald vine trail + petal burst
        drawPixelLine(ctx, from.x, from.y, beamX, beamY, pal.secondary, px);
        for (let i = 0; i < 6; i++) {
          const lp = clamp(p * 1.45 - i * 0.08, 0, 1);
          const lx = from.x + (target.x - from.x) * lp;
          const ly = from.y + (target.y - from.y) * lp + Math.sin(lp * 9 + i) * 22;
          drawPixelDiamond(ctx, lx, ly, 7 * scale, i % 2 === 0 ? pal.primary : pal.glow, pal.dark, px);
        }
        if (impactP > 0) {
          drawPixelShockwave(ctx, target.x, target.padY, (22 + impactP * 68) * scale, (8 + impactP * 24) * scale, pal.glow, px);
        }
        break;
      }

      case 'fire': {
        // Blazing cinder stream + erupting layered pixel flame pillars around target
        for (let i = 1; i <= 9; i++) {
          const t = (i / 9) * travelP;
          const fx = from.x + (target.x - from.x) * t + Math.sin(t * 14 + p * 10) * 14;
          const fy = from.y + (target.y - from.y) * t - Math.cos(t * 14 + p * 10) * 10;
          drawPixelRect(ctx, fx - px * 2, fy - px * 2, px * 4, px * 4, i % 2 === 0 ? pal.primary : pal.glow, px);
        }
        if (impactP > 0) {
          // 3 erupting pixel flame pillars
          for (let f = -1; f <= 1; f++) {
            const fx = target.x + f * 26 * scale;
            const pillarH = Math.sin(clamp(impactP * 1.35, 0, 1) * Math.PI) * (72 - Math.abs(f) * 16) * scale;
            if (pillarH > px) {
              drawPixelRect(ctx, fx - px * 3, target.padY - pillarH, px * 6, pillarH, pal.primary, px);
              drawPixelRect(ctx, fx - px * 1.5, target.padY - pillarH * 0.78, px * 3, pillarH * 0.78, '#ffd166', px);
              drawPixelRect(ctx, fx - px * 0.5, target.padY - pillarH * 0.45, px, pillarH * 0.45, '#ffffff', px);
            }
          }
        }
        break;
      }

      case 'water': {
        // Surging pixel tidal wave crest + foaming splash droplets
        const waveSteps = 10;
        for (let i = 0; i <= waveSteps; i++) {
          const t = (i / waveSteps) * travelP;
          const wx = from.x + (target.x - from.x) * t;
          const wy = from.y + (target.y - from.y) * t - Math.sin(t * Math.PI) * 44;
          drawPixelRect(ctx, wx - px * 2, wy - px * 2, px * 5, px * 4, i % 2 === 0 ? pal.primary : pal.glow, px);
        }
        if (impactP > 0) {
          drawPixelShockwave(ctx, target.x, target.padY - 4, (24 + impactP * 76) * scale, (10 + impactP * 26) * scale, pal.glow, px * 2);
          for (let s = 0; s < 6; s++) {
            const ang = -Math.PI * (0.15 + (s / 5) * 0.7);
            const dist = 16 + impactP * 68 * scale;
            drawPixelRect(
              ctx,
              target.x + Math.cos(ang) * dist,
              target.padY + Math.sin(ang) * dist * 0.9,
              px * 2,
              px * 2,
              s % 2 === 0 ? '#ffffff' : pal.glow,
              px,
            );
          }
        }
        break;
      }

      case 'electric': {
        // Sky-to-target main forked lightning bolt + horizontal surge bolt + square sparks
        const seed = Math.floor(p * (state.reducedMotion ? 3 : 12)) + evt.id.length;
        drawPixelLightning(ctx, target.x - 24, 12, target.x, target.y, seed, 8, 26, pal.primary, '#ffffff', px);
        drawPixelLightning(ctx, target.x - 16, 18, target.x + 28, target.y + 8, seed + 5, 6, 18, pal.glow, '#ffffff', px);
        drawPixelLightning(ctx, from.x, from.y, beamX, beamY, seed + 9, 6, 16, pal.primary, pal.glow, px);
        break;
      }

      case 'ice': {
        // Crystalline pixel ice lance + 6 erupting faceted ice shards
        drawPixelDiamond(ctx, beamX, beamY, 14 * scale, pal.glow, pal.secondary, px);
        drawPixelLine(ctx, from.x, from.y, beamX, beamY, pal.primary, px);
        if (impactP > 0) {
          for (let c = 0; c < 6; c++) {
            const a = (c / 6) * Math.PI * 2;
            const d = 14 + impactP * 58 * scale;
            drawPixelDiamond(ctx, target.x + Math.cos(a) * d, target.y + Math.sin(a) * d * 0.76, 9 * scale, pal.glow, pal.secondary, px);
          }
        }
        break;
      }

      case 'fighting': {
        // High-impact dash burst & radial crimson-gold strike cones
        drawPixelLine(ctx, from.x, from.y, beamX, beamY, pal.primary, px * 2);
        if (impactP > 0) {
          drawPixelStarburst(ctx, target.x, target.y, (32 + impactP * 56) * scale, 8, p * 2, pal.primary, '#ffe599', px * 2);
          drawPixelShockwave(ctx, target.x, target.y, (20 + impactP * 68) * scale, (14 + impactP * 44) * scale, '#ffffff', px);
        }
        break;
      }

      case 'poison': {
        // Arched toxic lumina venom squares & rising corrosive bubbles
        for (let i = 0; i < 6; i++) {
          const t = clamp(travelP - i * 0.08, 0, 1);
          const vx = from.x + (target.x - from.x) * t;
          const vy = from.y + (target.y - from.y) * t - Math.sin(t * Math.PI) * 34 + (i % 2) * 10;
          drawPixelRect(ctx, vx - px * 2, vy - px * 2, px * 4, px * 4, i % 2 === 0 ? pal.primary : pal.glow, px);
        }
        if (impactP > 0) {
          drawPixelSteppedDisc(
            ctx,
            target.x,
            target.padY,
            (18 + impactP * 44) * scale,
            (7 + impactP * 14) * scale,
            px,
            hexToRgba(pal.secondary, (1 - impactP) * 0.55),
            hexToRgba(pal.glow, (1 - impactP) * 0.85),
          );
          drawPixelShockwave(ctx, target.x, target.padY, (20 + impactP * 58) * scale, (8 + impactP * 20) * scale, pal.primary, px * 2);
        }
        break;
      }

      case 'ground': {
        // Erupting stepped tectonic pixel earth pillars under target
        for (let i = 0; i < 5; i++) {
          const gx = target.x + (i - 2) * 20 * scale;
          const gh = Math.sin(clamp(impactP * 1.4, 0, 1) * Math.PI) * (58 - Math.abs(i - 2) * 9) * scale;
          if (gh <= px) continue;
          drawPixelRect(ctx, gx - px * 3, target.padY - gh, px * 6, gh, pal.secondary, px);
          drawPixelRect(ctx, gx - px * 2, target.padY - gh - px * 2, px * 4, px * 4, pal.primary, px);
          drawPixelRect(ctx, gx - px, target.padY - gh - px * 3, px * 2, px * 2, pal.glow, px);
        }
        break;
      }

      case 'flying': {
        // Twin sweeping gale crescent slash arcs across arena
        for (const w of [-1, 1] as const) {
          for (let i = 0; i <= 10; i++) {
            const t = (i / 10) * travelP;
            const wx = from.x + (target.x - from.x) * t;
            const wy = from.y + (target.y - from.y) * t + Math.sin(t * Math.PI * 2 + w) * 26;
            drawPixelRect(ctx, wx - px, wy - px, px * 3, px * 2, i % 2 === 0 ? pal.glow : pal.primary, px);
          }
        }
        if (impactP > 0) {
          drawPixelLine(ctx, target.x - 42 * scale, target.y + 28 * scale, target.x + 42 * scale, target.y - 28 * scale, '#ffffff', px * 2);
        }
        break;
      }

      case 'psychic': {
        // Rotating hypnotic psychic prism diamond rings & astral beam
        drawPixelLine(ctx, from.x, from.y, beamX, beamY, pal.glow, px * 2);
        for (let ring = 0; ring < 3; ring++) {
          const r = (18 + ring * 16 + impactP * 38) * scale;
          drawPixelDiamond(ctx, target.x, target.y, r, 'rgba(255, 92, 168, 0.14)', ring % 2 === 0 ? pal.primary : pal.glow, px);
        }
        break;
      }

      case 'bug': {
        // Coordinated lantern-swarm pixel darts weaving toward target
        for (let i = 0; i < 8; i++) {
          const t = clamp(p * 1.38 - i * 0.04, 0, 1);
          const bx = from.x + (target.x - from.x) * t;
          const by = from.y + (target.y - from.y) * t + Math.sin(t * Math.PI * 3 + i * 1.4) * 26;
          drawPixelRect(ctx, bx - px, by - px, px * 3, px * 2, i % 2 === 0 ? pal.glow : pal.primary, px);
        }
        break;
      }

      case 'rock': {
        // Crashing pixel boulder meteors from above onto target
        for (let i = 0; i < 4; i++) {
          const rp = clamp((p - i * 0.08) / 0.55, 0, 1);
          if (rp <= 0) continue;
          const rx = target.x + (i - 1.5) * 22;
          const ry = target.y - 140 * (1 - rp) + (i % 2) * 14;
          const size = (14 - i * 1.5) * scale;
          drawPixelRect(ctx, rx - size * 0.5, ry - size * 0.5, size, size, pal.secondary, px);
          drawPixelRect(ctx, rx - size * 0.35, ry - size * 0.35, size * 0.7, size * 0.7, pal.primary, px);
          drawPixelRect(ctx, rx - px, ry - size * 0.35, px * 2, px, pal.glow, px);
        }
        break;
      }

      case 'ghost': {
        // Orbiting spectral wisps & shadow rings
        for (let i = 0; i < 4; i++) {
          const a = p * 7 + (i / 4) * Math.PI * 2;
          const rad = 22 + Math.sin(p * Math.PI) * 38 * scale;
          const wx = target.x + Math.cos(a) * rad;
          const wy = target.y + Math.sin(a) * rad * 0.72;
          drawPixelRect(ctx, wx - px * 2, wy - px * 2, px * 4, px * 4, pal.primary, px);
          drawPixelRect(ctx, wx - px, wy - px, px * 2, px * 2, pal.glow, px);
        }
        break;
      }

      case 'dragon': {
        // Twin intertwined Celestial Wyrm pixel star-streams + claw burst
        for (const sign of [-1, 1] as const) {
          const color = sign > 0 ? pal.primary : '#ffd479';
          for (let i = 1; i <= 12; i++) {
            const t = (i / 12) * travelP;
            const wave = Math.sin(t * Math.PI * 3.5 + p * 8) * 22 * sign;
            const sx = from.x + (target.x - from.x) * t - Math.sin(angle) * wave;
            const sy = from.y + (target.y - from.y) * t + Math.cos(angle) * wave;
            drawPixelRect(ctx, sx - px, sy - px, px * 3, px * 3, color, px);
          }
        }
        if (impactP > 0) {
          drawPixelStarburst(ctx, target.x, target.y, (36 + impactP * 38) * scale, 6, p * 4, pal.primary, pal.glow, px * 2);
        }
        break;
      }

      case 'dark': {
        // Intersecting X umbral cleave slashes + dark void sparks
        const span = Math.sin(clamp(p * 1.4, 0, 1) * Math.PI) * 52 * scale;
        if (span > 4) {
          drawPixelLine(ctx, target.x - span, target.y - span * 0.75, target.x + span, target.y + span * 0.75, pal.glow, px * 2);
          drawPixelLine(ctx, target.x - span, target.y + span * 0.75, target.x + span, target.y - span * 0.75, pal.dark, px * 2);
        }
        break;
      }

      case 'steel': {
        // Volley of 3 gleaming forged pixel lances + clang starburst
        for (let i = -1; i <= 1; i++) {
          const lp = clamp(p * 1.38 - Math.abs(i) * 0.08, 0, 1);
          const lx = from.x + (target.x - from.x) * lp;
          const ly = from.y + (target.y - from.y) * lp + i * 24 * (1 - lp);
          drawPixelLine(ctx, lx - Math.cos(angle) * 24, ly - Math.sin(angle) * 24, lx, ly, '#e8f4ff', px * 2);
          drawPixelRect(ctx, lx - px, ly - px, px * 2, px * 2, pal.secondary, px);
        }
        if (impactP > 0) {
          drawPixelStarburst(ctx, target.x, target.y, 28 * scale, 4, Math.PI * 0.25, '#e0f0fc', '#ffffff', px);
        }
        break;
      }

      case 'fairy': {
        // Moonbloom petal halo & shimmering starlight sigil
        for (let i = 0; i < 7; i++) {
          const a = p * 5 + (i / 7) * Math.PI * 2;
          const rad = (24 + Math.sin(p * Math.PI) * 42) * scale;
          const fx = target.x + Math.cos(a) * rad;
          const fy = target.y + Math.sin(a) * rad * 0.72;
          drawPixelCrossStar(ctx, fx, fy, px, px, i % 2 === 0 ? pal.primary : pal.glow);
        }
        drawPixelShockwave(ctx, target.x, target.y, 38 * scale, 26 * scale, pal.glow, px);
        break;
      }
    }

    // Super-Effective / Critical Hit Starburst Overlay
    if ((evt.effectiveness >= 1.5 || evt.isCrit) && impactP > 0.02) {
      const burstFade = clamp(1 - impactP, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha * burstFade;
      drawPixelStarburst(
        ctx,
        target.x,
        target.y,
        (42 + impactP * 54) * scale,
        8,
        p * 3,
        evt.isCrit ? '#ffe566' : pal.glow,
        '#ffffff',
        px,
      );
      ctx.restore();
    }

    ctx.restore();
  }

  private drawCaptureSequence(
    ctx: CanvasRenderingContext2D,
    state: BattleSceneState,
    layout: BattleStageLayout,
    px: number,
  ): void {
    const cp = clamp(state.enemy.captureProgress ?? 0, 0, 1);
    const from = getSideAnchor('player', layout, state);
    const to = getSideAnchor('enemy', layout, state);
    const ballSize = Math.max(24, layout.enemyPad.size * 0.26);
    const kind = state.enemy.captureBallKind ?? 'poke';

    if (cp < 0.30) {
      const t = cp / 0.30;
      const bx = from.x + (to.x - from.x) * t;
      const by = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * layout.height * 0.26;
      drawPixelBallSprite(ctx, bx, by, ballSize, kind, state.reducedMotion ? 0 : t * Math.PI * 4, 0);
    } else if (cp < 0.48) {
      const t = (cp - 0.30) / 0.18;
      const bx = to.x;
      const by = to.y - layout.height * 0.08;
      const beamColor =
        kind === 'star'
          ? 'rgba(130, 238, 255, 0.72)'
          : kind === 'great'
            ? 'rgba(102, 184, 255, 0.72)'
            : 'rgba(255, 160, 140, 0.72)';
      ctx.fillStyle = beamColor;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(to.x - to.size * 0.42 * (1 - t * 0.5), to.padY);
      ctx.lineTo(to.x + to.size * 0.42 * (1 - t * 0.5), to.padY);
      ctx.closePath();
      ctx.fill();
      drawPixelBallSprite(ctx, bx, by, ballSize, kind, 0, Math.sin(t * Math.PI) * 0.9);
    } else {
      const bx = to.x;
      const by = to.padY - ballSize * 0.45;
      const shakes = Math.max(1, state.enemy.captureShakes || 3);
      let shakeAngle = 0;
      if (cp < 0.88 && !state.reducedMotion) {
        const shakePhase = ((cp - 0.48) / 0.40) * shakes;
        const local = shakePhase % 1;
        shakeAngle = local < 0.65 ? Math.sin(local * Math.PI * 3.1) * 0.36 : 0;
      }
      drawPixelBallSprite(ctx, bx, by, ballSize, kind, shakeAngle, 0);
      if (cp >= 0.88) {
        const burst = (cp - 0.88) / 0.12;
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI * 0.5 + (i - 1) * 0.55;
          const dist = ballSize * (0.85 + burst * 0.9);
          drawPixelCrossStar(ctx, bx + Math.cos(a) * dist, by + Math.sin(a) * dist, px * 2, px, '#ffe566');
        }
      }
    }
  }

  private drawEvolutionSequence(
    ctx: CanvasRenderingContext2D,
    state: BattleSceneState,
    layout: BattleStageLayout,
    px: number,
  ): void {
    const anchor = getSideAnchor('player', layout, state);
    const t = state.reducedMotion ? 0.5 : state.elapsedSeconds;

    ctx.save();
    for (let strand = 0; strand < 2; strand++) {
      const col = strand === 0 ? '#ffe566' : '#7be8ff';
      for (let i = 0; i <= 22; i++) {
        const f = i / 22;
        const ang = f * Math.PI * 4 + t * 4 + strand * Math.PI;
        const rx = anchor.size * 0.48 * (1 - f * 0.34);
        const sx = anchor.x + Math.cos(ang) * rx;
        const sy = anchor.padY - f * anchor.size * 1.35;
        drawPixelRect(ctx, sx - px, sy - px, px * 2, px * 2, col, px);
      }
    }
    drawPixelHexagon(ctx, anchor.x, anchor.padY - 4, anchor.size * 0.56, anchor.size * 0.22, t * 0.9, '#ffe599', px);
    ctx.restore();
  }
}
