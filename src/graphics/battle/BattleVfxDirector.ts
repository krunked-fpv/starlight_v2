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

function drawPixelImpactRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  outerColor: string,
  innerColor: string,
  px: number,
): void {
  drawPixelShockwave(ctx, cx, cy, rx, ry, outerColor, px * 2, 24);
  drawPixelShockwave(ctx, cx, cy, rx * 0.84, ry * 0.84, innerColor, px, 20);
  // Crisp cardinal impact flare ticks
  drawPixelRect(ctx, cx - rx - px * 2, cy - px * 0.5, px * 3, px, '#ffffff', px);
  drawPixelRect(ctx, cx + rx - px, cy - px * 0.5, px * 3, px, '#ffffff', px);
}

// Reusable scratch vertex buffer for hexagons (zero per-frame array allocs)
const HEX_VERTS_X = new Float64Array(6);
const HEX_VERTS_Y = new Float64Array(6);

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
  for (let i = 0; i < 6; i++) {
    const a = rotation + (i / 6) * Math.PI * 2;
    HEX_VERTS_X[i] = cx + Math.cos(a) * rx;
    HEX_VERTS_Y[i] = cy + Math.sin(a) * ry;
  }
  for (let i = 0; i < 6; i++) {
    const k = clamp(edgeProgress - i, 0, 1);
    if (k <= 0.01) break;
    const next = (i + 1) % 6;
    const x0 = HEX_VERTS_X[i];
    const y0 = HEX_VERTS_Y[i];
    const x1 = HEX_VERTS_X[next];
    const y1 = HEX_VERTS_Y[next];
    drawPixelLine(ctx, x0, y0, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, color, px);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(snap(x0, px), snap(y0, px), px, px);
  }
}

/**
 * Faceted pixel-art crystal shard with dark outline, split light/dark bevel faces, and white specular streak.
 */
function drawPixelCrystalShard(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  lightColor: string,
  midColor: string,
  outlineColor: string,
  px: number,
): void {
  const steps = Math.max(2, Math.round(radius / px));
  const sx = snap(cx, px);
  const sy = snap(cy, px);
  for (let r = -steps; r <= steps; r++) {
    const w = Math.max(0, steps - Math.abs(r));
    // Outline wrap
    ctx.fillStyle = outlineColor;
    ctx.fillRect(sx - (w + 1) * px, sy + r * px, (w * 2 + 3) * px, px);
    if (w > 0) {
      // Left lit facet
      ctx.fillStyle = lightColor;
      ctx.fillRect(sx - w * px, sy + r * px, w * px, px);
      // Right shaded facet
      ctx.fillStyle = midColor;
      ctx.fillRect(sx, sy + r * px, (w + 1) * px, px);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx, sy + r * px, px, px);
    }
  }
  // Crisp top-left specular gleam
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sx - Math.max(1, Math.floor(steps * 0.4)) * px, sy - Math.max(1, Math.floor(steps * 0.4)) * px, px, px * 2);
}

/**
 * Handcrafted tapered pixel-art flame tongue (deep crimson outline -> orange body -> golden inner -> white core).
 */
function drawPixelFlameTongue(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  width: number,
  height: number,
  flickerPhase: number,
  outerHex: string,
  midHex: string,
  px: number,
): void {
  const rows = Math.max(4, Math.round(height / px));
  const halfMax = Math.max(2, Math.round(width * 0.5 / px));
  const sx = snap(cx, px);
  const sby = snap(baseY, px);
  for (let r = 0; r < rows; r++) {
    const t = r / rows; // 0 = base, 1 = tip
    const sway = Math.round(Math.sin(t * 4.5 + flickerPhase) * (t * 2.2)) * px;
    const hw = Math.max(1, Math.round(halfMax * Math.sin(Math.pow(1 - t, 0.72) * Math.PI * 0.5)));
    const py = sby - r * px;
    // Deep crimson/dark ink rim
    ctx.fillStyle = '#4a0d16';
    ctx.fillRect(sx + sway - (hw + 1) * px, py, (hw * 2 + 2) * px, px);
    // Outer blazing body
    ctx.fillStyle = outerHex;
    ctx.fillRect(sx + sway - hw * px, py, hw * 2 * px, px);
    // Mid golden core
    if (hw >= 2 && t < 0.76) {
      const mhw = Math.max(1, hw - 1);
      ctx.fillStyle = midHex;
      ctx.fillRect(sx + sway - mhw * px, py, mhw * 2 * px, px);
    }
    // White-hot base core
    if (hw >= 3 && t < 0.42) {
      const chw = Math.max(1, hw - 2);
      ctx.fillStyle = '#fffce0';
      ctx.fillRect(sx + sway - chw * px, py, chw * 2 * px, px);
    }
  }
}

/**
 * Handcrafted glossy pixel-art water droplet (teardrop silhouette with dark ocean rim + specular shine).
 */
function drawPixelWaterDroplet(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  bodyHex: string,
  glowHex: string,
  px: number,
): void {
  const u = Math.max(px, Math.round(px * scale));
  const sx = snap(cx, u);
  const sy = snap(cy, u);
  ctx.fillStyle = '#0c2c52';
  ctx.fillRect(sx - u, sy - u * 2, u * 2, u);
  ctx.fillRect(sx - u * 2, sy - u, u * 4, u * 3);
  ctx.fillRect(sx - u, sy + u * 2, u * 2, u);
  ctx.fillStyle = bodyHex;
  ctx.fillRect(sx - u, sy - u, u * 2, u * 3);
  ctx.fillStyle = glowHex;
  ctx.fillRect(sx - u, sy, u, u);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sx - u, sy - u, u, u);
}

/**
 * Handcrafted beveled rotating pixel razor leaf (dark emerald outline + emerald blade + bright center vein).
 */
function drawPixelRazorLeaf(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  scale: number,
  primaryHex: string,
  glowHex: string,
  darkHex: string,
  px: number,
): void {
  ctx.save();
  ctx.translate(snap(cx, px), snap(cy, px));
  ctx.rotate(angle);
  const u = Math.max(px, Math.round(px * scale));
  ctx.fillStyle = darkHex;
  ctx.fillRect(-u * 3, -u, u * 6, u * 2);
  ctx.fillRect(-u * 2, -u * 2, u * 4, u * 4);
  ctx.fillStyle = primaryHex;
  ctx.fillRect(-u * 2, -u, u * 4, u * 2);
  ctx.fillStyle = glowHex;
  ctx.fillRect(-u * 2, -u, u * 3, u);
  ctx.fillStyle = '#eaffd6';
  ctx.fillRect(-u, 0, u * 2, Math.max(1, Math.floor(u * 0.5)));
  ctx.restore();
}

/**
 * Handcrafted 3-tone faceted pixel boulder with outline and specular bevel.
 */
function drawPixelBoulder(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  primaryHex: string,
  shadowHex: string,
  glowHex: string,
  px: number,
): void {
  const half = Math.max(px * 2, snap(size * 0.5, px));
  const sx = snap(cx, px);
  const sy = snap(cy, px);
  // Dark mineral ink silhouette (chamfered octagon)
  ctx.fillStyle = '#191426';
  ctx.fillRect(sx - half + px, sy - half - px, half * 2 - px * 2, half * 2 + px * 2);
  ctx.fillRect(sx - half - px, sy - half + px, half * 2 + px * 2, half * 2 - px * 2);
  // Shaded lower-right body
  ctx.fillStyle = shadowHex;
  ctx.fillRect(sx - half, sy - half + px, half * 2, half * 2 - px * 2);
  ctx.fillRect(sx - half + px, sy - half, half * 2 - px * 2, half * 2);
  // Mid-tone upper-left face
  ctx.fillStyle = primaryHex;
  ctx.fillRect(sx - half + px, sy - half, Math.max(px, half * 1.4), Math.max(px, half * 1.3));
  // Crisp highlight bevel edge
  ctx.fillStyle = glowHex;
  ctx.fillRect(sx - half + px, sy - half, Math.max(px, half), px);
  ctx.fillRect(sx - half + px, sy - half + px, px, Math.max(px, half * 0.6));
}

/**
 * Crisp directional pixel speed-lines across impact zones (anime/arcade punch!).
 */
function drawPixelSpeedLines(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  length: number,
  color: string,
  px: number,
  count = 5,
): void {
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) * 0.5) * px * 5;
    const len = length * (i % 2 === 0 ? 1.0 : 0.68);
    const sx = cx + nx * offset - dx * len * 0.5;
    const sy = cy + ny * offset - dy * len * 0.5;
    drawPixelLine(ctx, sx, sy, sx + dx * len, sy + dy * len, i % 2 === 0 ? '#ffffff' : color, px);
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
    const mx = cx + Math.cos(a) * radius * 0.52;
    const my = cy + Math.sin(a) * radius * 0.52;
    drawPixelLine(ctx, cx, cy, mx, my, coreColor, px);
  }
  drawPixelRect(ctx, cx - px, cy - px, px * 2, px * 2, '#ffffff', px);
}

// Preallocated lightning polyline scratch buffers (zero per-frame array allocs)
const BOLT_X = new Float64Array(16);
const BOLT_Y = new Float64Array(16);

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
  withForks = false,
): void {
  const segs = Math.min(14, Math.max(2, segments));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  BOLT_X[0] = x0;
  BOLT_Y[0] = y0;
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const jitter = Math.sin(seed * 17.3 + i * 9.7) * spread * (1 - Math.abs(t - 0.5) * 0.55);
    BOLT_X[i] = x0 + dx * t + nx * jitter;
    BOLT_Y[i] = y0 + dy * t + ny * jitter;
  }
  BOLT_X[segs] = x1;
  BOLT_Y[segs] = y1;

  // Outer aura
  for (let i = 0; i < segs; i++) {
    drawPixelLine(ctx, BOLT_X[i], BOLT_Y[i], BOLT_X[i + 1], BOLT_Y[i + 1], outerColor, px * 2);
  }
  // Optional secondary jagged pixel forks branching off mid-bolt
  if (withForks && segs >= 4) {
    const f1 = Math.floor(segs * 0.35);
    const f2 = Math.floor(segs * 0.65);
    drawPixelLine(
      ctx,
      BOLT_X[f1],
      BOLT_Y[f1],
      BOLT_X[f1] + nx * spread * 1.1 + dx * 0.14,
      BOLT_Y[f1] + ny * spread * 1.1 + dy * 0.14,
      outerColor,
      px,
    );
    drawPixelLine(
      ctx,
      BOLT_X[f2],
      BOLT_Y[f2],
      BOLT_X[f2] - nx * spread * 0.95 + dx * 0.12,
      BOLT_Y[f2] - ny * spread * 0.95 + dy * 0.12,
      outerColor,
      px,
    );
  }
  // White-hot inner core
  for (let i = 0; i < segs; i++) {
    drawPixelLine(ctx, BOLT_X[i], BOLT_Y[i], BOLT_X[i + 1], BOLT_Y[i + 1], coreColor, px);
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
  const px = Math.max(2, Math.round(size / 12));
  const topColor =
    kind === 'star' ? '#2c3d9e' : kind === 'great' ? '#2570d9' : '#e03e3e';
  const topShade =
    kind === 'star' ? '#1c2670' : kind === 'great' ? '#1a4da3' : '#a8232c';
  const topHighlight =
    kind === 'star' ? '#7be8ff' : kind === 'great' ? '#75c4ff' : '#ff9999';
  const trimColor =
    kind === 'star' ? '#ffd954' : kind === 'great' ? '#e84855' : '#1b1d36';

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(snap(cx, px), snap(cy, px));
  if (rotation !== 0) ctx.rotate(rotation);

  const split = Math.round(openAmount * px * 3);
  const rows = [3, 5, 6, 6, 6, 6, 5, 3];

  // Upper cap with 3-tone shading & curved glossy specular pixel
  for (let r = 0; r < 4; r++) {
    const hw = rows[r];
    const y = (-4 + r) * px - split;
    ctx.fillStyle = '#121026';
    ctx.fillRect(-(hw + 1) * px, y, (hw * 2 + 2) * px, px);
    ctx.fillStyle = topColor;
    ctx.fillRect(-hw * px, y, hw * 2 * px, px);
    ctx.fillStyle = topShade;
    ctx.fillRect((hw - 2) * px, y, 2 * px, px);
  }
  ctx.fillStyle = topHighlight;
  ctx.fillRect(-4 * px, -3 * px - split, px * 2, px);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-3 * px, -3 * px - split, px, px);
  if (kind === 'star') {
    ctx.fillStyle = '#ffe566';
    ctx.fillRect(-px, -3 * px - split, px * 2, px);
    ctx.fillRect(-px * 0.5, -2 * px - split, px, px);
  } else if (kind === 'great') {
    ctx.fillStyle = trimColor;
    ctx.fillRect(-5 * px, -2 * px - split, px * 2, px);
    ctx.fillRect(3 * px, -2 * px - split, px * 2, px);
  }

  // Lower cap with cool silver under-shadow
  for (let r = 4; r < 8; r++) {
    const hw = rows[r];
    const y = (-4 + r) * px + split;
    ctx.fillStyle = '#121026';
    ctx.fillRect(-(hw + 1) * px, y, (hw * 2 + 2) * px, px);
    ctx.fillStyle = r >= 6 ? '#bccbe6' : '#f4f8ff';
    ctx.fillRect(-hw * px, y, hw * 2 * px, px);
  }

  // Equatorial band & lock clasp
  if (openAmount < 0.35) {
    ctx.fillStyle = '#121026';
    ctx.fillRect(-6 * px, -px * 0.5, 12 * px, px);
    ctx.fillStyle = trimColor;
    ctx.fillRect(-px * 1.5, -px * 1.5, px * 3, px * 3);
    ctx.fillStyle = kind === 'star' ? '#7be8ff' : '#ffffff';
    ctx.fillRect(-px * 0.5, -px * 0.5, px, px);
  } else {
    drawPixelCrossStar(ctx, 0, 0, px * 3, px, '#7be8ff', '#ffffff');
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

function isCombatantHiddenOrFainted(state: BattleSceneState, vis: BattleCombatantVisual): boolean {
  if ((vis.faintDrop ?? 0) > 0.35) return true;
  if (
    vis.side === 'enemy' &&
    (Boolean(state.rewardSummary?.caught) || (vis.captureProgress ?? 0) >= 0.45)
  ) {
    return true;
  }
  if (
    vis.mon.hp <= 0 &&
    (state.phase === 'victory' || state.phase === 'defeat' || state.phase === 'evolving')
  ) {
    return true;
  }
  return false;
}

function hasCombatantOverlayWork(state: BattleSceneState, vis: BattleCombatantVisual): boolean {
  if (isCombatantHiddenOrFainted(state, vis)) return false;
  const mon = vis.mon;
  return (
    mon.isElite ||
    Boolean(mon.encounterTrait) ||
    mon.shieldTurns > 0 ||
    vis.bracedFlash > 0.02 ||
    vis.healFlash > 0.04 ||
    vis.buffFlash > 0.04 ||
    mon.battleStages.atk !== 0 ||
    mon.battleStages.def !== 0 ||
    mon.battleStages.spd !== 0 ||
    mon.isShiny ||
    Boolean(vis.abilityBanner && vis.abilityBanner.elapsed < 2.4)
  );
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

    for (let eIdx = 0; eIdx < events.length; eIdx++) {
      const evt = events[eIdx];
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

      const lightX = p < 0.36 ? beamX : target.x;
      const lightY = p < 0.36 ? beamY : target.y;
      const lightFade = p < 0.36 ? 1 : 1 - impactP * 0.82;
      backend.addPointLight({
        id: `vfx-light-${evt.id}`,
        x: lightX,
        y: lightY,
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

    // Combatant state lights & sparkles (zero array alloc)
    this.emitCombatantStateLights(backend, state, state.player, layout, motionScale);
    this.emitCombatantStateLights(backend, state, state.enemy, layout, motionScale);

    // Capture sequence particles & PointLight
    const isCapturedResting =
      state.phase !== 'capturing' &&
      (Boolean(state.rewardSummary?.caught) || (state.enemy.captureProgress ?? 0) >= 0.99);

    if (state.phase === 'capturing' || isCapturedResting) {
      const cp = isCapturedResting ? 1 : clamp(state.enemy.captureProgress ?? 0, 0, 1);
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
        radius: isCapturedResting ? 125 : 160,
        color: ballColor,
        intensity: isCapturedResting ? 0.72 : cp > 0.28 && cp < 0.5 ? 1.65 : 0.95,
      });

      const sparkCount = isCapturedResting ? (state.reducedMotion ? 2 : 3) : (state.reducedMotion ? 3 : 6);
      for (let i = 0; i < sparkCount; i++) {
        const a = state.elapsedSeconds * (isCapturedResting ? 1.8 : 4) * motionScale + (i / sparkCount) * Math.PI * 2;
        const r = isCapturedResting ? 22 : 18 + (cp > 0.85 ? (cp - 0.85) * 320 : 12);
        backend.drawParticle({
          x: bx + Math.cos(a) * r,
          y: by + Math.sin(a) * r * 0.72,
          radius: isCapturedResting ? 5 : 7,
          color: i % 2 === 0 ? [1.0, 0.92, 0.48, isCapturedResting ? 0.72 : 0.9] : [ballColor[0], ballColor[1], ballColor[2], isCapturedResting ? 0.7 : 0.9],
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

  private emitCombatantStateLights(
    backend: IRenderBackend,
    state: BattleSceneState,
    vis: BattleCombatantVisual,
    layout: BattleStageLayout,
    motionScale: number,
  ): void {
    if (isCombatantHiddenOrFainted(state, vis)) return;
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
        const hue = (state.elapsedSeconds * 0.6 + i * 0.25) % 1;
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
      const trailCount = Math.max(4, Math.floor(count * 0.7));
      for (let i = 0; i < trailCount; i++) {
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
    const isCapturedResting =
      state.phase !== 'capturing' &&
      (Boolean(state.rewardSummary?.caught) || (state.enemy.captureProgress ?? 0) >= 0.99);
    const hasFloating = Array.isArray(state.floatingTexts) && state.floatingTexts.length > 0;
    const hasPlayerOv = hasCombatantOverlayWork(state, state.player);
    const hasEnemyOv = hasCombatantOverlayWork(state, state.enemy);

    if (
      events.length === 0 &&
      !hasFloating &&
      !hasPlayerOv &&
      !hasEnemyOv &&
      state.phase !== 'capturing' &&
      !isCapturedResting &&
      state.phase !== 'evolving'
    ) {
      return;
    }

    backend.drawCustom2D((ctx, width, height) => {
      const layout = computeBattleStageLayout(width, height);
      const px = Math.max(2, Math.round(Math.min(width, height) / 180));
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      applyCameraToContext(ctx, width, height, camera);

      // 1. Per-combatant Shield prism dome, Composure BRACED! hex burst, Buff/Heal, Stat Chevrons, Shiny/Trait, Ability ring
      if (hasPlayerOv) {
        this.drawCombatantOverlays(ctx, state.player, getSideAnchor('player', layout, state), layout, state.elapsedSeconds, state.reducedMotion, px);
      }
      if (hasEnemyOv) {
        this.drawCombatantOverlays(ctx, state.enemy, getSideAnchor('enemy', layout, state), layout, state.elapsedSeconds, state.reducedMotion, px);
      }

      // 2. All 18-Type & Support Handcrafted Pixel VFX Choreographies
      for (let i = 0; i < events.length; i++) {
        this.drawEventChoreography(ctx, state, events[i], layout, px);
      }

      // 3. Poké / Great / Star Ball Capture Arc, Impact Flash, Wobble Shakes & Resting Caught Ball
      if (state.phase === 'capturing') {
        this.drawCaptureSequence(ctx, state, layout, px);
      } else if (isCapturedResting) {
        this.drawRestingCapturedBall(ctx, state, layout, px);
      }

      // 4. Evolution Radiant Spiral Metamorphosis
      if (state.phase === 'evolving') {
        this.drawEvolutionSequence(ctx, state, layout, px);
      }

      // 5. Floating Damage Numbers & Tactical Combat Callouts (COMBAT-05)
      if (hasFloating) {
        this.drawFloatingTexts(ctx, state, layout);
      }

      ctx.restore();
    }, 'post-light');
  }

  private drawCombatantOverlays(
    ctx: CanvasRenderingContext2D,
    vis: BattleCombatantVisual,
    anchor: CombatantRenderAnchor,
    layout: BattleStageLayout,
    time: number,
    reducedMotion: boolean,
    px: number,
  ): void {
    const mon = vis.mon;
    const motion = reducedMotion ? 0.15 : 1.0;
    const t = time * motion;
    const pal = TYPE_PALETTES[mon.type] ?? TYPE_PALETTES.normal;

    // Apex / Elite / Encounter Trait rising pixel aura pillars
    if (mon.isElite || mon.encounterTrait) {
      const auraColor =
        mon.isElite || mon.encounterTrait === 'apex'
          ? '#ff6b6b'
          : mon.encounterTrait === 'treasure'
            ? '#ffd954'
            : mon.encounterTrait === 'spirited'
              ? '#66e0ff'
              : '#c084fc';
      const pillarCount = reducedMotion ? 2 : 5;
      for (let i = 0; i < pillarCount; i++) {
        const rise = (t * 0.9 + i / pillarCount) % 1;
        const ox = (i - (pillarCount - 1) * 0.5) * anchor.size * 0.22;
        const py = anchor.padY - rise * anchor.size * 0.92;
        ctx.fillStyle = hexToRgba(auraColor, (1 - rise) * 0.72);
        ctx.fillRect(snap(anchor.x + ox, px), snap(py, px), px, px * 3);
        ctx.fillStyle = hexToRgba('#ffffff', (1 - rise) * 0.65);
        ctx.fillRect(snap(anchor.x + ox, px), snap(py, px), px, px);
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
      const pips = Math.min(5, mon.shieldTurns);
      for (let i = 0; i < pips; i++) {
        const pipX = anchor.x + (i - (pips - 1) * 0.5) * px * 4;
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

      const tagW = 78;
      const tagH = 22;
      const tagX = snap(clamp(anchor.x - tagW * 0.5, 14, layout.width - tagW - 14), px);
      const tagY = snap(clamp(anchor.y - anchor.size * 0.64 - (1 - bf) * 14, 34, layout.height - tagH - 14), px);
      ctx.save();
      ctx.globalAlpha = clamp(bf * 1.25, 0, 1);
      ctx.fillStyle = '#070a1c';
      ctx.fillRect(tagX - 2, tagY - 2, tagW + 4, tagH + 4);
      ctx.fillStyle = '#0e1b42';
      ctx.fillRect(tagX, tagY, tagW, tagH);
      ctx.fillStyle = 'rgba(126, 242, 255, 0.22)';
      ctx.fillRect(tagX + 2, tagY + 2, tagW - 4, 3);
      ctx.strokeStyle = '#7be8ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(tagX, tagY, tagW, tagH);
      ctx.fillStyle = '#070a1c';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BRACED!', tagX + tagW * 0.5 + 1, tagY + tagH * 0.5 + 2);
      ctx.fillStyle = '#ffe566';
      ctx.fillText('BRACED!', tagX + tagW * 0.5, tagY + tagH * 0.5 + 1);
      ctx.restore();
    }

    // Heal & Buff Pixel Flashes
    if (vis.healFlash > 0.04) {
      const hf = clamp(vis.healFlash, 0, 1);
      for (let i = 0; i < 4; i++) {
        const pxX = anchor.x + (i - 1.5) * anchor.size * 0.22;
        const pxY = anchor.padY - (1 - hf) * anchor.size * 0.9 - i * 8;
        drawPixelCrossStar(ctx, pxX, pxY, px * 2, px, `rgba(75, 212, 120, ${hf.toFixed(3)})`, '#e8fff0');
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

    // Stat Stage Micro-Pills (atk / def / spd)
    const hasStages =
      mon.battleStages.atk !== 0 || mon.battleStages.def !== 0 || mon.battleStages.spd !== 0;
    if (hasStages) {
      const stages: Array<{ label: string; val: number }> = [];
      if (mon.battleStages.atk !== 0) stages.push({ label: 'ATK', val: mon.battleStages.atk });
      if (mon.battleStages.def !== 0) stages.push({ label: 'DEF', val: mon.battleStages.def });
      if (mon.battleStages.spd !== 0) stages.push({ label: 'SPD', val: mon.battleStages.spd });

      const pillW = 60;
      const pillH = 18;
      const rawX =
        vis.side === 'player'
          ? anchor.x - anchor.size * 0.62 - pillW
          : anchor.x + anchor.size * 0.62;
      const baseX = snap(clamp(rawX, 14, layout.width - pillW - 14), px);
      const baseY = snap(clamp(anchor.y - anchor.size * 0.34, 48, layout.height - 140), px);
      ctx.save();
      for (let i = 0; i < stages.length; i++) {
        const st = stages[i];
        const y = baseY + i * 22;
        const isUp = st.val > 0;
        const col = isUp ? '#78f4ff' : '#ff8a8a';
        ctx.fillStyle = 'rgba(6, 9, 24, 0.94)';
        ctx.fillRect(baseX - 2, y - 9 - 2, pillW + 4, pillH + 4);
        ctx.fillStyle = 'rgba(13, 21, 50, 0.94)';
        ctx.fillRect(baseX, y - 9, pillW, pillH);
        ctx.fillStyle = isUp ? 'rgba(102, 242, 255, 0.16)' : 'rgba(255, 122, 122, 0.16)';
        ctx.fillRect(baseX + 1, y - 8, pillW - 2, 4);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.strokeRect(baseX + 0.5, y - 8.5, pillW - 1, pillH - 1);
        drawPixelChevronGlyph(ctx, baseX + 9, y, isUp, col, 2);
        ctx.fillStyle = '#070a1c';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const label = `${st.label}${isUp ? '+' : ''}${st.val}`;
        ctx.fillText(label, baseX + 19, y + 1.5);
        ctx.fillStyle = col;
        ctx.fillText(label, baseX + 18, y + 0.5);
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

    // Ability Activation Subtle Pixel Aura Ring (R2-VIS-04: DOM owns text ribbon)
    if (vis.abilityBanner && vis.abilityBanner.elapsed < 2.4) {
      const ab = vis.abilityBanner;
      const fade = ab.elapsed < 0.2 ? ab.elapsed / 0.2 : ab.elapsed > 1.9 ? (2.4 - ab.elapsed) / 0.5 : 1;
      const alpha = clamp(fade, 0, 1);
      const pulse = reducedMotion ? 0 : Math.sin(ab.elapsed * 8) * px;
      drawPixelHexagon(
        ctx,
        anchor.x,
        anchor.padY - px * 2,
        anchor.size * 0.48 + pulse,
        anchor.size * 0.16 + pulse * 0.4,
        t * 0.7,
        hexToRgba(pal.glow, alpha * 0.75),
        px,
      );
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

    // Dedicated Heal / Buff / Shield pixel choreographies
    if (evt.category === 'heal') {
      const count = 8;
      for (let i = 0; i < count; i++) {
        const rise = (p * 1.35 + i / count) % 1;
        const hx = target.x + Math.sin(i * 2.1 + p * 5) * target.size * 0.38;
        const hy = target.padY - rise * target.size * 1.2;
        drawPixelCrossStar(ctx, hx, hy, px * 2, px, i % 2 === 0 ? '#34d399' : '#a7f3d0', '#ffffff');
      }
      drawPixelImpactRing(ctx, target.x, target.padY - 4, (22 + p * 52) * scale, (9 + p * 18) * scale, '#34d399', '#eafff3', px);
      ctx.restore();
      return;
    }

    if (evt.category === 'buff') {
      for (let i = 0; i < 5; i++) {
        const rise = (p * 1.45 + i * 0.2) % 1;
        const bx = target.x + (i - 2) * target.size * 0.20;
        const by = target.padY - rise * target.size * 1.15;
        drawPixelChevronGlyph(ctx, bx, by, true, i % 2 === 0 ? '#ffd93d' : pal.glow, px);
      }
      drawPixelImpactRing(ctx, target.x, target.y, (24 + p * 46) * scale, (14 + p * 26) * scale, pal.primary, '#fff3b0', px);
      ctx.restore();
      return;
    }

    if (evt.category === 'shield') {
      const r = target.size * (0.66 - p * 0.08);
      drawPixelHexagon(ctx, target.x, target.y, r, r * 0.85, -Math.PI * 0.5, '#7be8ff', px * 2);
      drawPixelHexagon(ctx, target.x, target.y, r * 0.82, r * 0.68, Math.PI / 6, '#ffe566', px);
      drawPixelCrossStar(ctx, target.x, target.y - r * 0.85, px * 2, px, '#7be8ff', '#ffffff');
      ctx.restore();
      return;
    }

    // All 18 ElementalTypes — Handcrafted HD-2D Pixel-Art Attack Choreographies
    const travelP = clamp(p / 0.42, 0, 1);
    const impactP = clamp((p - 0.30) / 0.70, 0, 1);
    const beamX = from.x + (target.x - from.x) * travelP;
    const beamY = from.y + (target.y - from.y) * travelP;
    const angle = Math.atan2(target.y - from.y, target.x - from.x);

    switch (evt.type) {
      case 'normal': {
        // Kinetic anime-pixel speed-lines + twin expanding impact rings + 8-pt star flash
        drawPixelSpeedLines(ctx, (from.x + beamX) * 0.5, (from.y + beamY) * 0.5, angle, Math.hypot(beamX - from.x, beamY - from.y) * 0.75, pal.glow, px, 5);
        drawPixelStarburst(ctx, beamX, beamY, 22 * scale, 4, p * 5, pal.primary, '#ffffff', px);
        if (impactP > 0) {
          drawPixelImpactRing(ctx, target.x, target.y, (18 + impactP * 82) * scale, (11 + impactP * 52) * scale, pal.glow, '#ffffff', px);
          drawPixelStarburst(ctx, target.x, target.y, (24 + impactP * 38) * scale, 8, p * 2, pal.primary, '#ffffff', px);
        }
        break;
      }

      case 'grass': {
        // Coiling emerald pixel vine + spinning beveled pixel razor leaves + petal vortex burst
        drawPixelLine(ctx, from.x, from.y, beamX, beamY, pal.dark, px * 2);
        drawPixelLine(ctx, from.x, from.y, beamX, beamY, pal.primary, px);
        for (let i = 0; i < 7; i++) {
          const lp = clamp(p * 1.48 - i * 0.075, 0, 1);
          const lx = from.x + (target.x - from.x) * lp;
          const ly = from.y + (target.y - from.y) * lp + Math.sin(lp * 10 + i * 1.3) * 24;
          drawPixelRazorLeaf(ctx, lx, ly, angle + lp * 8 + i, scale * 0.9, pal.primary, pal.glow, pal.dark, px);
        }
        if (impactP > 0) {
          drawPixelImpactRing(ctx, target.x, target.padY - 4, (22 + impactP * 72) * scale, (8 + impactP * 26) * scale, pal.primary, '#d9ffba', px);
          for (let b = 0; b < 6; b++) {
            const a = (b / 6) * Math.PI * 2 + impactP * 3;
            const d = 14 + impactP * 56 * scale;
            drawPixelRazorLeaf(ctx, target.x + Math.cos(a) * d, target.y + Math.sin(a) * d * 0.7, a, 0.75 * scale, pal.glow, '#eaffd6', pal.dark, px);
          }
        }
        break;
      }

      case 'fire': {
        // Spiraling blazing pixel fireballs + 5 layered tapered pixel flame tongues erupting on target!
        for (let i = 1; i <= 8; i++) {
          const t = (i / 8) * travelP;
          const fx = from.x + (target.x - from.x) * t + Math.sin(t * 14 + p * 11) * 14;
          const fy = from.y + (target.y - from.y) * t - Math.cos(t * 14 + p * 11) * 10;
          const sz = (12 + (i % 3) * 4) * scale;
          drawPixelFlameTongue(ctx, fx, fy + sz * 0.4, sz, sz * 1.2, p * 14 + i, pal.primary, '#ffd166', px);
        }
        if (impactP > 0) {
          drawPixelImpactRing(ctx, target.x, target.padY, (20 + impactP * 64) * scale, (8 + impactP * 22) * scale, '#ff5722', '#ffd166', px);
          for (let f = -2; f <= 2; f++) {
            const fx = target.x + f * 20 * scale;
            const pillarH = Math.sin(clamp(impactP * 1.35, 0, 1) * Math.PI) * (82 - Math.abs(f) * 14) * scale;
            if (pillarH > px * 4) {
              drawPixelFlameTongue(ctx, fx, target.padY, (22 - Math.abs(f) * 2) * scale, pillarH, p * 16 + f * 1.7, pal.primary, '#ffd166', px);
            }
          }
        }
        break;
      }

      case 'water': {
        // Foaming crescent pixel tidal wave + glossy pixel water droplets + concentric ripple rings
        for (let i = 0; i <= 10; i++) {
          const t = (i / 10) * travelP;
          const wx = from.x + (target.x - from.x) * t;
          const wy = from.y + (target.y - from.y) * t - Math.sin(t * Math.PI) * 46;
          drawPixelRect(ctx, wx - px * 3, wy - px * 2, px * 6, px * 5, '#0f4c8a', px);
          drawPixelRect(ctx, wx - px * 2, wy - px * 2, px * 5, px * 4, pal.primary, px);
          drawPixelRect(ctx, wx - px, wy - px * 3, px * 3, px * 2, '#e6fcff', px);
        }
        if (impactP > 0) {
          drawPixelImpactRing(ctx, target.x, target.padY - 4, (24 + impactP * 82) * scale, (10 + impactP * 28) * scale, pal.primary, '#e6fcff', px);
          for (let s = 0; s < 8; s++) {
            const ang = -Math.PI * (0.12 + (s / 7) * 0.76);
            const dist = 16 + impactP * 76 * scale;
            drawPixelWaterDroplet(
              ctx,
              target.x + Math.cos(ang) * dist,
              target.padY + Math.sin(ang) * dist * 0.92 + impactP * impactP * 24,
              0.9 * scale,
              pal.primary,
              pal.glow,
              px,
            );
          }
        }
        break;
      }

      case 'electric': {
        // Sky-strike forked thunderbolts + horizontal arc surge + crackling ground spark ring
        const seed = Math.floor(p * (state.reducedMotion ? 3 : 14)) + evt.id.length;
        drawPixelLightning(ctx, target.x - 26, 8, target.x, target.y, seed, 9, 28, pal.primary, '#ffffff', px, true);
        drawPixelLightning(ctx, target.x + 22, 16, target.x + 12, target.y + 10, seed + 5, 7, 20, '#7be8ff', '#ffffff', px, true);
        drawPixelLightning(ctx, from.x, from.y, beamX, beamY, seed + 9, 7, 18, pal.primary, '#fff9c4', px, false);
        if (impactP > 0) {
          drawPixelImpactRing(ctx, target.x, target.padY, (20 + impactP * 68) * scale, (9 + impactP * 24) * scale, pal.primary, '#ffffff', px);
          for (let s = 0; s < 4; s++) {
            const a = (s / 4) * Math.PI * 2 + seed;
            drawPixelCrossStar(ctx, target.x + Math.cos(a) * 44 * impactP * scale, target.y + Math.sin(a) * 32 * impactP * scale, px * 2, px, '#ffe566', '#ffffff');
          }
        }
        break;
      }

      case 'ice': {
        // Faceted ice crystal lance + 6 erupting beveled frost crystals + 8-point snowflake starburst
        drawPixelLine(ctx, from.x, from.y, beamX, beamY, '#b8f2ff', px * 2);
        drawPixelCrystalShard(ctx, beamX, beamY, 15 * scale, '#e8fbff', pal.primary, '#1c446e', px);
        if (impactP > 0) {
          drawPixelHexagon(ctx, target.x, target.padY - 2, (24 + impactP * 54) * scale, (10 + impactP * 20) * scale, 0, '#c8f6ff', px);
          for (let c = 0; c < 6; c++) {
            const a = (c / 6) * Math.PI * 2;
            const d = 16 + impactP * 62 * scale;
            drawPixelCrystalShard(ctx, target.x + Math.cos(a) * d, target.y + Math.sin(a) * d * 0.76, 11 * scale, '#e8fbff', pal.primary, '#1c446e', px);
          }
          drawPixelStarburst(ctx, target.x, target.y, (18 + impactP * 32) * scale, 6, impactP * 1.5, '#9be8ff', '#ffffff', px);
        }
        break;
      }

      case 'fighting': {
        // Blazing crimson-gold speed-lines + heavy radial comic-pixel strike burst + dual shockwaves
        drawPixelSpeedLines(ctx, (from.x + beamX) * 0.5, (from.y + beamY) * 0.5, angle, 96 * scale, pal.primary, px * 2, 5);
        if (impactP > 0) {
          drawPixelStarburst(ctx, target.x, target.y, (34 + impactP * 62) * scale, 10, p * 2.4, pal.primary, '#ffe599', px * 2);
          drawPixelImpactRing(ctx, target.x, target.y, (22 + impactP * 76) * scale, (14 + impactP * 48) * scale, '#ff8a5b', '#ffffff', px);
        }
        break;
      }

      case 'poison': {
        // Bubbling multi-tone toxic globules + splattering corrosive pixel pool & rising bubbles
        for (let i = 0; i < 6; i++) {
          const t = clamp(travelP - i * 0.08, 0, 1);
          const vx = from.x + (target.x - from.x) * t;
          const vy = from.y + (target.y - from.y) * t - Math.sin(t * Math.PI) * 38 + (i % 2) * 10;
          drawPixelRect(ctx, vx - px * 3, vy - px * 3, px * 6, px * 6, '#2e104d', px);
          drawPixelRect(ctx, vx - px * 2, vy - px * 2, px * 4, px * 4, i % 2 === 0 ? pal.primary : '#c084fc', px);
          drawPixelRect(ctx, vx - px, vy - px, px, px, '#b8ff7a', px);
        }
        if (impactP > 0) {
          drawPixelSteppedDisc(
            ctx,
            target.x,
            target.padY,
            (20 + impactP * 48) * scale,
            (8 + impactP * 16) * scale,
            px,
            hexToRgba(pal.secondary, (1 - impactP) * 0.62),
            hexToRgba('#b8ff7a', (1 - impactP) * 0.9),
          );
          for (let b = 0; b < 5; b++) {
            const bx = target.x + (b - 2) * 16 * scale;
            const by = target.padY - impactP * (40 + (b % 3) * 18) * scale;
            drawPixelRect(ctx, bx - px * 2, by - px * 2, px * 4, px * 4, pal.primary, px);
            drawPixelRect(ctx, bx - px, by - px, px, px, '#d9ff9e', px);
          }
        }
        break;
      }

      case 'ground': {
        // Jagged beveled tectonic crags + seismic floor fissure + flying rock debris
        for (let i = 0; i < 5; i++) {
          const gx = target.x + (i - 2) * 22 * scale;
          const gh = Math.sin(clamp(impactP * 1.4, 0, 1) * Math.PI) * (66 - Math.abs(i - 2) * 10) * scale;
          if (gh <= px * 2) continue;
          // Dark rock outline + left lit / right shaded faces
          drawPixelRect(ctx, gx - px * 4, target.padY - gh, px * 8, gh, '#261810', px);
          drawPixelRect(ctx, gx - px * 3, target.padY - gh + px, px * 3, gh - px, pal.primary, px);
          drawPixelRect(ctx, gx, target.padY - gh + px, px * 3, gh - px, pal.secondary, px);
          drawPixelRect(ctx, gx - px * 2, target.padY - gh - px * 2, px * 4, px * 3, pal.glow, px);
        }
        if (impactP > 0) {
          drawPixelImpactRing(ctx, target.x, target.padY, (24 + impactP * 76) * scale, (8 + impactP * 24) * scale, pal.primary, pal.glow, px);
        }
        break;
      }

      case 'flying': {
        // Twin razor gale ribbons + dramatic crisp diagonal crescent air-slash
        for (const w of [-1, 1] as const) {
          for (let i = 0; i <= 11; i++) {
            const t = (i / 11) * travelP;
            const wx = from.x + (target.x - from.x) * t;
            const wy = from.y + (target.y - from.y) * t + Math.sin(t * Math.PI * 2 + w) * 28;
            drawPixelRect(ctx, wx - px * 2, wy - px, px * 5, px * 2, i % 2 === 0 ? '#ffffff' : pal.glow, px);
            drawPixelRect(ctx, wx - px, wy + px, px * 3, px, pal.primary, px);
          }
        }
        if (impactP > 0) {
          drawPixelSpeedLines(ctx, target.x, target.y, -0.62, 110 * scale, pal.glow, px * 2, 4);
          drawPixelImpactRing(ctx, target.x, target.y, (20 + impactP * 64) * scale, (14 + impactP * 40) * scale, pal.glow, '#ffffff', px);
        }
        break;
      }

      case 'psychic': {
        // Warped astral beam + 3 rotating concentric telekinetic hex/crystal prism rings
        drawPixelLine(ctx, from.x, from.y, beamX, beamY, pal.primary, px * 3);
        drawPixelLine(ctx, from.x, from.y, beamX, beamY, '#ffffff', px);
        for (let ring = 0; ring < 3; ring++) {
          const r = (18 + ring * 17 + impactP * 42) * scale;
          drawPixelHexagon(
            ctx,
            target.x,
            target.y,
            r,
            r * 0.72,
            p * (ring % 2 === 0 ? 3.5 : -2.8) + ring,
            ring % 2 === 0 ? pal.primary : '#7be8ff',
            px,
          );
        }
        if (impactP > 0) {
          drawPixelCrystalShard(ctx, target.x, target.y, 16 * (1 - impactP * 0.5) * scale, '#ffd6f5', pal.primary, '#42124a', px);
        }
        break;
      }

      case 'bug': {
        // Luminous winged pixel darts weaving in swarm formation + golden pollen starburst
        for (let i = 0; i < 9; i++) {
          const t = clamp(p * 1.4 - i * 0.04, 0, 1);
          const bx = from.x + (target.x - from.x) * t;
          const by = from.y + (target.y - from.y) * t + Math.sin(t * Math.PI * 3.5 + i * 1.4) * 28;
          drawPixelRect(ctx, bx - px * 2, by - px, px * 4, px * 2, pal.dark, px);
          drawPixelRect(ctx, bx - px, by - px, px * 3, px * 2, i % 2 === 0 ? pal.glow : pal.primary, px);
          // Tiny flickering pixel wings
          drawPixelRect(ctx, bx - px, by - px * 2, px * 2, px, '#f6ffba', px);
        }
        if (impactP > 0) {
          drawPixelStarburst(ctx, target.x, target.y, (20 + impactP * 44) * scale, 6, p * 4, pal.primary, '#f6ffba', px);
        }
        break;
      }

      case 'rock': {
        // Faceted 3-tone plunging pixel boulders with speed trails + shattering rubble chips
        for (let i = 0; i < 4; i++) {
          const rp = clamp((p - i * 0.08) / 0.54, 0, 1);
          if (rp <= 0) continue;
          const rx = target.x + (i - 1.5) * 24;
          const ry = target.y - 148 * (1 - rp) + (i % 2) * 14;
          const size = (18 - i * 1.8) * scale;
          drawPixelLine(ctx, rx, ry - 32, rx, ry, pal.glow, px);
          drawPixelBoulder(ctx, rx, ry, size, pal.primary, pal.secondary, pal.glow, px);
        }
        if (impactP > 0) {
          drawPixelImpactRing(ctx, target.x, target.padY, (22 + impactP * 68) * scale, (8 + impactP * 24) * scale, pal.secondary, pal.glow, px);
        }
        break;
      }

      case 'ghost': {
        // Swirling tapered spectral wisps with eerie glowing eyes + phantom vortex rings
        for (let i = 0; i < 5; i++) {
          const a = p * 7.2 + (i / 5) * Math.PI * 2;
          const rad = 22 + Math.sin(p * Math.PI) * 44 * scale;
          const wx = target.x + Math.cos(a) * rad;
          const wy = target.y + Math.sin(a) * rad * 0.72;
          drawPixelFlameTongue(ctx, wx, wy + px * 3, 14 * scale, 22 * scale, p * 12 + i, pal.primary, '#c4b5fd', px);
        }
        if (impactP > 0) {
          drawPixelImpactRing(ctx, target.x, target.y, (20 + impactP * 68) * scale, (14 + impactP * 44) * scale, '#7c3aed', '#e9d5ff', px);
        }
        break;
      }

      case 'dragon': {
        // Twin braided celestial wyrm comet streams + cosmic claw slash starburst
        for (const sign of [-1, 1] as const) {
          const color = sign > 0 ? pal.primary : '#ffd479';
          const core = sign > 0 ? '#7be8ff' : '#ffffff';
          for (let i = 1; i <= 12; i++) {
            const t = (i / 12) * travelP;
            const wave = Math.sin(t * Math.PI * 3.5 + p * 8) * 24 * sign;
            const sx = from.x + (target.x - from.x) * t - Math.sin(angle) * wave;
            const sy = from.y + (target.y - from.y) * t + Math.cos(angle) * wave;
            drawPixelRect(ctx, sx - px * 2, sy - px * 2, px * 4, px * 4, color, px);
            drawPixelRect(ctx, sx - px, sy - px, px * 2, px * 2, core, px);
          }
        }
        if (impactP > 0) {
          drawPixelStarburst(ctx, target.x, target.y, (38 + impactP * 44) * scale, 8, p * 4, pal.primary, '#ffe58f', px * 2);
          drawPixelImpactRing(ctx, target.x, target.y, (24 + impactP * 72) * scale, (16 + impactP * 46) * scale, '#7be8ff', '#ffd479', px);
        }
        break;
      }

      case 'dark': {
        // Dramatic razor umbral X-cleave blades with dark-matter outer aura + magenta highlight core
        const span = Math.sin(clamp(p * 1.4, 0, 1) * Math.PI) * 58 * scale;
        if (span > 4) {
          drawPixelLine(ctx, target.x - span, target.y - span * 0.75, target.x + span, target.y + span * 0.75, '#120822', px * 4);
          drawPixelLine(ctx, target.x - span, target.y - span * 0.75, target.x + span, target.y + span * 0.75, pal.glow, px * 2);
          drawPixelLine(ctx, target.x - span, target.y + span * 0.75, target.x + span, target.y - span * 0.75, '#120822', px * 4);
          drawPixelLine(ctx, target.x - span, target.y + span * 0.75, target.x + span, target.y - span * 0.75, '#e879f9', px * 2);
          drawPixelShockwave(ctx, target.x, target.y, span * 0.9, span * 0.65, '#4c1d95', px * 2, 20);
        }
        break;
      }

      case 'steel': {
        // Volley of 3 forged chrome pixel lances with bevel highlights + diamond clang-flash
        for (let i = -1; i <= 1; i++) {
          const lp = clamp(p * 1.38 - Math.abs(i) * 0.08, 0, 1);
          const lx = from.x + (target.x - from.x) * lp;
          const ly = from.y + (target.y - from.y) * lp + i * 24 * (1 - lp);
          drawPixelLine(ctx, lx - Math.cos(angle) * 32, ly - Math.sin(angle) * 32, lx, ly, '#475569', px * 3);
          drawPixelLine(ctx, lx - Math.cos(angle) * 28, ly - Math.sin(angle) * 28, lx, ly, '#f1f8ff', px);
          drawPixelCrystalShard(ctx, lx, ly, 7 * scale, '#ffffff', '#94a3b8', '#1e293b', px);
        }
        if (impactP > 0) {
          drawPixelStarburst(ctx, target.x, target.y, (28 + impactP * 28) * scale, 4, Math.PI * 0.25, '#cbd5e1', '#ffffff', px * 2);
          drawPixelImpactRing(ctx, target.x, target.y, (18 + impactP * 58) * scale, (12 + impactP * 38) * scale, '#e2e8f0', '#ffffff', px);
        }
        break;
      }

      case 'fairy': {
        // Swirling moonbloom starlight halo + sparkling pastel cross-stars + radiant double ring
        for (let i = 0; i < 8; i++) {
          const a = p * 5.2 + (i / 8) * Math.PI * 2;
          const rad = (24 + Math.sin(p * Math.PI) * 46) * scale;
          const fx = target.x + Math.cos(a) * rad;
          const fy = target.y + Math.sin(a) * rad * 0.72;
          drawPixelCrossStar(ctx, fx, fy, px * 2, px, i % 2 === 0 ? pal.primary : '#ffe58f', '#ffffff');
        }
        drawPixelImpactRing(ctx, target.x, target.y, (30 + impactP * 44) * scale, (20 + impactP * 30) * scale, pal.glow, '#fff0f9', px);
        break;
      }
    }

    // Super-Effective / Critical Hit Cosmic Starburst Overlay
    if ((evt.effectiveness >= 1.5 || evt.isCrit) && impactP > 0.02) {
      const burstFade = clamp(1 - impactP, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha * burstFade;
      drawPixelStarburst(
        ctx,
        target.x,
        target.y,
        (44 + impactP * 58) * scale,
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
          ? 'rgba(130, 238, 255, 0.68)'
          : kind === 'great'
            ? 'rgba(102, 184, 255, 0.68)'
            : 'rgba(255, 160, 140, 0.68)';
      ctx.fillStyle = beamColor;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(to.x - to.size * 0.42 * (1 - t * 0.5), to.padY);
      ctx.lineTo(to.x + to.size * 0.42 * (1 - t * 0.5), to.padY);
      ctx.closePath();
      ctx.fill();
      // Pixel scanline absorption rings inside tractor beam
      for (let r = 0; r < 3; r++) {
        const rf = (t * 2 + r / 3) % 1;
        const ry = to.padY - rf * (to.padY - by);
        const rw = to.size * 0.38 * (1 - rf * 0.8);
        drawPixelRect(ctx, to.x - rw, ry, rw * 2, px, '#ffffff', px);
      }
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

  private drawRestingCapturedBall(
    ctx: CanvasRenderingContext2D,
    state: BattleSceneState,
    layout: BattleStageLayout,
    px: number,
  ): void {
    const to = getSideAnchor('enemy', layout, state);
    const ballSize = Math.max(24, layout.enemyPad.size * 0.26);
    const kind = state.enemy.captureBallKind ?? 'poke';
    const bx = to.x;
    const by = to.padY - ballSize * 0.45;
    drawPixelSteppedDisc(ctx, bx, to.padY + px * 0.5, ballSize * 0.55, ballSize * 0.16, px, 'rgba(6, 9, 24, 0.52)');
    drawPixelBallSprite(ctx, bx, by, ballSize, kind, 0, 0);
    const twinkle = state.reducedMotion ? 0.85 : 0.55 + 0.45 * Math.sin(state.elapsedSeconds * 4.5);
    ctx.save();
    ctx.globalAlpha = twinkle;
    drawPixelCrossStar(ctx, bx - ballSize * 0.65, by - ballSize * 0.52, px * 1.5, px, '#ffe566');
    drawPixelCrossStar(ctx, bx + ballSize * 0.68, by - ballSize * 0.36, px * 1.2, px, '#7be8ff');
    ctx.restore();
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
        if (i % 4 === 0) {
          drawPixelRect(ctx, sx, sy, px, px, '#ffffff', px);
        }
      }
    }
    drawPixelHexagon(ctx, anchor.x, anchor.padY - 4, anchor.size * 0.56, anchor.size * 0.22, t * 0.9, '#ffe599', px);
    ctx.restore();
  }

  private drawFloatingTexts(
    ctx: CanvasRenderingContext2D,
    state: BattleSceneState,
    layout: BattleStageLayout,
  ): void {
    const scaleFactor = clamp(Math.min(layout.width / 960, layout.height / 540), 0.72, 1.35);
    for (let i = 0; i < state.floatingTexts.length; i++) {
      const ft = state.floatingTexts[i];
      const localTime = ft.elapsed - ft.delay;
      if (localTime < 0) continue;
      const progress = clamp(localTime / Math.max(0.25, ft.duration), 0, 1);
      if (progress >= 1) continue;

      const anchor = getSideAnchor(ft.side, layout, state);
      const risePx = state.reducedMotion
        ? 10 * progress
        : (1 - Math.pow(1 - progress, 2)) * 46 * scaleFactor;
      const popScale = state.reducedMotion
        ? 1
        : progress < 0.14
          ? 0.72 + (progress / 0.14) * 0.44
          : progress < 0.28
            ? 1.16 - ((progress - 0.14) / 0.14) * 0.16
            : 1.0;
      const alpha = progress > 0.72 ? clamp(1 - (progress - 0.72) / 0.28, 0, 1) : 1;

      const fontSize = Math.max(11, Math.round(ft.size * scaleFactor));
      const x = Math.round(anchor.x);
      const y = Math.round(anchor.y - anchor.size * 0.42 + ft.offsetY * scaleFactor - risePx);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      if (popScale !== 1) {
        ctx.scale(popScale, popScale);
      }
      ctx.font = `900 ${fontSize}px "Trebuchet MS", "Segoe UI", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.26));
      ctx.strokeStyle = '#070a1c';
      ctx.fillStyle = 'rgba(7, 10, 28, 0.88)';
      ctx.fillText(ft.text, 2, 3);
      ctx.strokeText(ft.text, 0, 0);
      ctx.fillStyle = ft.color || '#ffffff';
      ctx.fillText(ft.text, 0, 0);
      ctx.restore();
    }
  }
}
