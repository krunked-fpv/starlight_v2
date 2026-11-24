import type {
  BodyArchetype,
  ElementalType,
  IOfflineSpriteRigSynthesizer,
  OfflineRigDescriptor,
} from '../../contracts';
import { TYPE_PALETTES } from '../../core';
import {
  clamp,
  drawPolygonPath,
  drawStarPath,
  hexToRgba,
  mixHex,
  safeEllipse,
} from './BattleArenas';

interface RigTraits {
  earKind: 0 | 1 | 2 | 3;
  crestKind: 0 | 1 | 2 | 3;
  tailKind: 0 | 1 | 2 | 3;
  markingKind: 0 | 1 | 2 | 3;
  eyeKind: 0 | 1 | 2 | 3;
  bodyScaleX: number;
  bodyScaleY: number;
  wingSpan: number;
  phaseOffset: number;
}

interface RigPaletteResolved {
  primary: string;
  secondary: string;
  glow: string;
  highlight: string;
  shadow: string;
  ink: string;
  eyeCore: string;
  ornament: string;
  ornamentGlow: string;
}

function hashSpecies(speciesId: number): number {
  let h = Math.imul(speciesId ^ 0x9e3779b1, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function extractTraits(speciesId: number): RigTraits {
  const h = hashSpecies(Math.max(1, Math.floor(speciesId)));
  return {
    earKind: (h & 3) as 0 | 1 | 2 | 3,
    crestKind: ((h >>> 2) & 3) as 0 | 1 | 2 | 3,
    tailKind: ((h >>> 4) & 3) as 0 | 1 | 2 | 3,
    markingKind: ((h >>> 6) & 3) as 0 | 1 | 2 | 3,
    eyeKind: ((h >>> 8) & 3) as 0 | 1 | 2 | 3,
    bodyScaleX: 0.92 + (((h >>> 10) & 15) / 15) * 0.16,
    bodyScaleY: 0.93 + (((h >>> 14) & 15) / 15) * 0.14,
    wingSpan: 0.9 + (((h >>> 18) & 15) / 15) * 0.24,
    phaseOffset: (((h >>> 22) & 63) / 63) * Math.PI * 2,
  };
}

function resolvePalette(rig: OfflineRigDescriptor): RigPaletteResolved {
  const pPal = TYPE_PALETTES[rig.primaryType] ?? TYPE_PALETTES.normal;
  const sPal = rig.secondaryType ? TYPE_PALETTES[rig.secondaryType] : pPal;

  const basePrimary = rig.palette[0] || pPal.primary;
  const baseSecondary = rig.palette[1] || sPal.secondary;
  const baseGlow = rig.palette[2] || pPal.glow;

  const primary = rig.shiny ? mixHex(basePrimary, '#fff0a8', 0.28) : basePrimary;
  const secondary = rig.shiny ? mixHex(baseSecondary, '#82f5ff', 0.34) : baseSecondary;
  const glow = rig.shiny ? '#fff8d4' : baseGlow;

  return {
    primary,
    secondary,
    glow,
    highlight: mixHex(primary, '#ffffff', 0.44),
    shadow: mixHex(primary, pPal.dark, 0.56),
    ink: mixHex(pPal.dark, '#1e1633', 0.45),
    eyeCore: rig.shiny ? '#ff70c8' : mixHex(sPal.glow, '#ffd479', 0.28),
    ornament: sPal.primary,
    ornamentGlow: sPal.glow,
  };
}

function makeBodyGrad(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  pal: RigPaletteResolved,
): CanvasGradient {
  const grad = ctx.createRadialGradient(
    cx - radius * 0.32,
    cy - radius * 0.35,
    radius * 0.1,
    cx + radius * 0.12,
    cy + radius * 0.15,
    radius * 1.15,
  );
  grad.addColorStop(0, pal.highlight);
  grad.addColorStop(0.52, pal.primary);
  grad.addColorStop(1, pal.shadow);
  return grad;
}

function drawLimbCapsule(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  fill: string | CanvasGradient,
  ink: string,
  outlineW: number,
): void {
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(angle);
  ctx.beginPath();
  safeEllipse(ctx, len * 0.5, 0, Math.max(thickness * 0.6, len * 0.54), thickness * 0.5, 0);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = outlineW;
  ctx.stroke();
  ctx.restore();
}

function drawExpressiveEye(
  ctx: CanvasRenderingContext2D,
  ex: number,
  ey: number,
  r: number,
  pal: RigPaletteResolved,
  eyeKind: 0 | 1 | 2 | 3,
  outlineW: number,
): void {
  ctx.save();
  if (eyeKind === 2) {
    // Serene arched crystal eye
    ctx.fillStyle = pal.eyeCore;
    ctx.beginPath();
    safeEllipse(ctx, ex, ey, r * 1.1, r * 0.82, -0.1);
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = outlineW * 0.8;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex - r * 0.25, ey - r * 0.22, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Outer sclera / socket
  ctx.fillStyle = '#fff9f0';
  ctx.beginPath();
  if (eyeKind === 1) {
    // Fierce slanted battle eye
    ctx.moveTo(ex - r * 1.15, ey - r * 0.45);
    ctx.quadraticCurveTo(ex + r * 0.2, ey - r * 0.85, ex + r * 1.1, ey - r * 0.1);
    ctx.quadraticCurveTo(ex + r * 0.25, ey + r * 0.95, ex - r * 1.05, ey + r * 0.45);
    ctx.closePath();
  } else {
    safeEllipse(ctx, ex, ey, r * 1.0, r * 1.12, -0.06);
  }
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = outlineW * 0.78;
  ctx.stroke();

  // Luminous iris gradient
  const irisGrad = ctx.createRadialGradient(
    ex + r * 0.1,
    ey - r * 0.1,
    r * 0.08,
    ex + r * 0.1,
    ey + r * 0.05,
    r * 0.75,
  );
  irisGrad.addColorStop(0, pal.glow);
  irisGrad.addColorStop(0.55, pal.eyeCore);
  irisGrad.addColorStop(1, pal.ink);
  ctx.fillStyle = irisGrad;
  ctx.beginPath();
  safeEllipse(ctx, ex + r * 0.14, ey + r * 0.04, r * 0.62, r * 0.78, 0);
  ctx.fill();

  // Star or double specular catchlight
  ctx.fillStyle = '#ffffff';
  if (eyeKind === 3) {
    drawStarPath(ctx, ex - r * 0.08, ey - r * 0.22, r * 0.36, r * 0.13, 4, 0.2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(ex - r * 0.12, ey - r * 0.28, r * 0.30, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + r * 0.34, ey + r * 0.28, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHeadEarsAndCrest(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  hr: number,
  traits: RigTraits,
  pal: RigPaletteResolved,
  outlineW: number,
  sway: number,
): void {
  // Ears / Horns behind or atop head
  for (const dir of [-1, 1] as const) {
    const baseAngle = dir < 0 ? -2.25 : -0.88;
    const ex = hx + Math.cos(baseAngle) * hr * 0.72;
    const ey = hy + Math.sin(baseAngle) * hr * 0.72;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(dir * (0.35 + sway * 0.04));

    ctx.beginPath();
    if (traits.earKind === 0) {
      // Pointed fox/lynx ear
      ctx.moveTo(-hr * 0.22, hr * 0.1);
      ctx.quadraticCurveTo(0, -hr * 0.85, hr * 0.26, -hr * 0.62);
      ctx.quadraticCurveTo(hr * 0.24, -hr * 0.1, hr * 0.16, hr * 0.14);
      ctx.closePath();
    } else if (traits.earKind === 1) {
      // Rounded cozy bear/lop ear
      safeEllipse(ctx, 0, -hr * 0.22, hr * 0.28, hr * 0.34, 0);
    } else if (traits.earKind === 2) {
      // Swept aquatic/avian fin ear
      ctx.moveTo(-hr * 0.14, 0);
      ctx.quadraticCurveTo(dir * hr * 0.45, -hr * 0.75, dir * hr * 0.56, -hr * 0.2);
      ctx.quadraticCurveTo(dir * hr * 0.25, hr * 0.12, 0, hr * 0.16);
      ctx.closePath();
    } else {
      // Twin curved crystalline horns
      ctx.moveTo(-hr * 0.12, hr * 0.08);
      ctx.quadraticCurveTo(dir * hr * 0.06, -hr * 0.72, dir * hr * 0.28, -hr * 0.76);
      ctx.quadraticCurveTo(dir * hr * 0.2, -hr * 0.25, hr * 0.14, hr * 0.1);
      ctx.closePath();
    }
    ctx.fillStyle = traits.earKind === 3 ? pal.secondary : pal.primary;
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = outlineW;
    ctx.stroke();
    ctx.restore();
  }

  // Forehead / Crown Ornament
  ctx.save();
  if (traits.crestKind === 0) {
    // Luminous forehead gem
    drawPolygonPath(ctx, hx + hr * 0.14, hy - hr * 0.44, hr * 0.22, 4, Math.PI * 0.25);
    ctx.fillStyle = pal.ornamentGlow;
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = outlineW * 0.7;
    ctx.stroke();
  } else if (traits.crestKind === 1) {
    // Elemental flame / leaf crown tuft
    ctx.beginPath();
    ctx.moveTo(hx - hr * 0.12, hy - hr * 0.8);
    ctx.quadraticCurveTo(hx + hr * 0.05, hy - hr * 1.48 + sway * 2, hx + hr * 0.32, hy - hr * 1.15);
    ctx.quadraticCurveTo(hx + hr * 0.22, hy - hr * 0.82, hx + hr * 0.12, hy - hr * 0.75);
    ctx.closePath();
    ctx.fillStyle = pal.ornament;
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = outlineW * 0.8;
    ctx.stroke();
  } else if (traits.crestKind === 2) {
    // Sculpted chevron brow crest
    ctx.beginPath();
    ctx.moveTo(hx - hr * 0.18, hy - hr * 0.68);
    ctx.lineTo(hx + hr * 0.16, hy - hr * 1.05);
    ctx.lineTo(hx + hr * 0.42, hy - hr * 0.64);
    ctx.lineTo(hx + hr * 0.14, hy - hr * 0.74);
    ctx.closePath();
    ctx.fillStyle = pal.secondary;
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = outlineW * 0.8;
    ctx.stroke();
  } else {
    // Floating miniature halo crown
    ctx.strokeStyle = pal.ornamentGlow;
    ctx.lineWidth = Math.max(2, outlineW * 1.1);
    ctx.beginPath();
    safeEllipse(ctx, hx, hy - hr * 1.15 + sway * 1.5, hr * 0.42, hr * 0.14, -0.08);
    ctx.stroke();
  }
  ctx.restore();
}

function drawElementalOrnament(
  ctx: CanvasRenderingContext2D,
  type: ElementalType,
  cx: number,
  cy: number,
  u: number,
  pal: RigPaletteResolved,
  outlineW: number,
  t: number,
): void {
  ctx.save();
  switch (type) {
    case 'fire': {
      // Flickering flame tail/aura plume
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        const fx = cx - u * 0.42;
        const fy = cy - u * 0.08;
        ctx.moveTo(fx, fy + u * 0.16);
        ctx.quadraticCurveTo(fx - u * 0.34, fy - u * 0.1 + Math.sin(t * 5 + i) * 3, fx - u * 0.1, fy - u * (0.48 - i * 0.12));
        ctx.quadraticCurveTo(fx + u * 0.18, fy - u * 0.16, fx + u * 0.08, fy + u * 0.14);
        ctx.closePath();
        ctx.fillStyle = i === 0 ? pal.ornament : pal.ornamentGlow;
        ctx.fill();
        if (i === 0) {
          ctx.strokeStyle = pal.ink;
          ctx.lineWidth = outlineW * 0.75;
          ctx.stroke();
        }
      }
      break;
    }
    case 'grass':
    case 'bug': {
      // Luminous sprouting leaves / petal collar
      for (const ang of [-0.55, 0.35]) {
        ctx.save();
        ctx.translate(cx - u * 0.12, cy - u * 0.32);
        ctx.rotate(ang + Math.sin(t * 2.2) * 0.06);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-u * 0.24, -u * 0.28, 0, -u * 0.48);
        ctx.quadraticCurveTo(u * 0.22, -u * 0.25, 0, 0);
        ctx.closePath();
        ctx.fillStyle = pal.ornament;
        ctx.fill();
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = outlineW * 0.75;
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'electric': {
      // Crackling twin lightning bolt sigils
      ctx.fillStyle = pal.ornamentGlow;
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW * 0.75;
      ctx.beginPath();
      ctx.moveTo(cx - u * 0.36, cy - u * 0.14);
      ctx.lineTo(cx - u * 0.58, cy - u * 0.38);
      ctx.lineTo(cx - u * 0.42, cy - u * 0.42);
      ctx.lineTo(cx - u * 0.62, cy - u * 0.68);
      ctx.lineTo(cx - u * 0.28, cy - u * 0.40);
      ctx.lineTo(cx - u * 0.40, cy - u * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'water':
    case 'ice': {
      // Orbiting water droplet / frost prism crystal
      for (let i = 0; i < 3; i++) {
        const a = t * 1.4 + (i / 3) * Math.PI * 2;
        const ox = cx + Math.cos(a) * u * 0.56;
        const oy = cy - u * 0.12 + Math.sin(a) * u * 0.22;
        drawPolygonPath(ctx, ox, oy, u * 0.085, type === 'ice' ? 6 : 4, a);
        ctx.fillStyle = hexToRgba(pal.ornamentGlow, 0.85);
        ctx.fill();
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = outlineW * 0.65;
        ctx.stroke();
      }
      break;
    }
    case 'psychic':
    case 'ghost':
    case 'fairy': {
      // Floating astral/petal orbit ring
      ctx.strokeStyle = hexToRgba(pal.ornamentGlow, 0.68);
      ctx.lineWidth = Math.max(1.5, outlineW * 0.8);
      ctx.beginPath();
      safeEllipse(ctx, cx, cy - u * 0.05, u * 0.62, u * 0.22, -0.22);
      ctx.stroke();
      for (let i = 0; i < 2; i++) {
        const a = t * 1.8 + i * Math.PI;
        const ox = cx + Math.cos(a) * u * 0.60;
        const oy = cy - u * 0.05 + Math.sin(a) * u * 0.20;
        drawStarPath(ctx, ox, oy, u * 0.09, u * 0.035, 4, t);
        ctx.fillStyle = pal.ornamentGlow;
        ctx.fill();
      }
      break;
    }
    default: {
      // Subtle elemental crest shoulder glow orb
      const gx = cx - u * 0.32;
      const gy = cy - u * 0.24;
      const orbGrad = ctx.createRadialGradient(gx, gy, 1, gx, gy, u * 0.22);
      orbGrad.addColorStop(0, pal.ornamentGlow);
      orbGrad.addColorStop(1, hexToRgba(pal.ornament, 0));
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(gx, gy, u * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawTailShape(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  u: number,
  traits: RigTraits,
  pal: RigPaletteResolved,
  outlineW: number,
  sway: number,
): void {
  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate(sway * 0.09);
  ctx.beginPath();
  if (traits.tailKind === 0) {
    // Plush curved brush tail
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-u * 0.38, -u * 0.05, -u * 0.56, -u * 0.45, -u * 0.26, -u * 0.56);
    ctx.bezierCurveTo(-u * 0.1, -u * 0.58, -u * 0.06, -u * 0.28, u * 0.04, -u * 0.08);
    ctx.closePath();
  } else if (traits.tailKind === 1) {
    // Twin-pronged ribbon / bolt tail
    ctx.moveTo(0, 0);
    ctx.lineTo(-u * 0.36, -u * 0.16);
    ctx.lineTo(-u * 0.26, -u * 0.28);
    ctx.lineTo(-u * 0.52, -u * 0.48);
    ctx.lineTo(-u * 0.14, -u * 0.30);
    ctx.lineTo(-u * 0.18, -u * 0.12);
    ctx.closePath();
  } else {
    // Sleek tapering tail with crescent tip
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-u * 0.46, u * 0.06, -u * 0.52, -u * 0.34);
    ctx.quadraticCurveTo(-u * 0.32, -u * 0.42, -u * 0.28, -u * 0.16);
    ctx.quadraticCurveTo(-u * 0.14, -u * 0.04, 0, -u * 0.06);
    ctx.closePath();
  }
  ctx.fillStyle = makeBodyGrad(ctx, -u * 0.22, -u * 0.22, u * 0.32, pal);
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = outlineW;
  ctx.stroke();
  ctx.restore();
}

function drawArchetypeBody(
  ctx: CanvasRenderingContext2D,
  archetype: BodyArchetype,
  u: number,
  traits: RigTraits,
  pal: RigPaletteResolved,
  outlineW: number,
  t: number,
  sway: number,
): void {
  const sx = traits.bodyScaleX;
  const sy = traits.bodyScaleY;

  switch (archetype) {
    case 'quadruped': {
      drawTailShape(ctx, -u * 0.32, u * 0.04, u, traits, pal, outlineW, sway);
      // Far legs
      drawLimbCapsule(ctx, -u * 0.18, u * 0.14, -u * 0.26, u * 0.42, u * 0.11, pal.shadow, pal.ink, outlineW);
      drawLimbCapsule(ctx, u * 0.16, u * 0.14, u * 0.22, u * 0.42, u * 0.11, pal.shadow, pal.ink, outlineW);

      // Supple torso
      ctx.beginPath();
      safeEllipse(ctx, -u * 0.04, u * 0.08, u * 0.34 * sx, u * 0.22 * sy, -0.08);
      ctx.fillStyle = makeBodyGrad(ctx, -u * 0.04, u * 0.08, u * 0.34, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();

      // Chest fluff / collar
      ctx.beginPath();
      safeEllipse(ctx, u * 0.15, u * 0.02, u * 0.16, u * 0.18, 0.25);
      ctx.fillStyle = pal.glow;
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW * 0.78;
      ctx.stroke();

      // Near legs
      drawLimbCapsule(ctx, -u * 0.24, u * 0.16, -u * 0.18, u * 0.44, u * 0.12, makeBodyGrad(ctx, -u * 0.2, u * 0.3, u * 0.16, pal), pal.ink, outlineW);
      drawLimbCapsule(ctx, u * 0.12, u * 0.15, u * 0.16, u * 0.45, u * 0.12, makeBodyGrad(ctx, u * 0.14, u * 0.3, u * 0.16, pal), pal.ink, outlineW);

      // Expressive Head
      const hx = u * 0.22;
      const hy = -u * 0.18;
      const hr = u * 0.23;
      drawHeadEarsAndCrest(ctx, hx, hy, hr, traits, pal, outlineW, sway);
      ctx.beginPath();
      safeEllipse(ctx, hx, hy, hr * 1.04, hr * 0.94, -0.05);
      ctx.fillStyle = makeBodyGrad(ctx, hx, hy, hr, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();
      drawExpressiveEye(ctx, hx + hr * 0.34, hy - hr * 0.08, hr * 0.26, pal, traits.eyeKind, outlineW);
      break;
    }

    case 'biped': {
      drawTailShape(ctx, -u * 0.18, u * 0.2, u * 0.92, traits, pal, outlineW, sway);
      // Far arm & leg
      drawLimbCapsule(ctx, u * 0.14, -u * 0.04, u * 0.34, u * 0.08, u * 0.1, pal.shadow, pal.ink, outlineW);
      drawLimbCapsule(ctx, u * 0.1, u * 0.2, u * 0.22, u * 0.45, u * 0.13, pal.shadow, pal.ink, outlineW);

      // Upright pear/athletic torso
      ctx.beginPath();
      ctx.moveTo(0, -u * 0.16);
      ctx.bezierCurveTo(u * 0.24 * sx, -u * 0.12, u * 0.28 * sx, u * 0.24, 0, u * 0.30 * sy);
      ctx.bezierCurveTo(-u * 0.26 * sx, u * 0.24, -u * 0.22 * sx, -u * 0.12, 0, -u * 0.16);
      ctx.closePath();
      ctx.fillStyle = makeBodyGrad(ctx, 0, u * 0.08, u * 0.28, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();

      // Belly patch
      ctx.beginPath();
      safeEllipse(ctx, u * 0.06, u * 0.1, u * 0.14, u * 0.16, 0);
      ctx.fillStyle = pal.glow;
      ctx.fill();

      // Near leg & near arm
      drawLimbCapsule(ctx, -u * 0.1, u * 0.22, -u * 0.16, u * 0.46, u * 0.14, makeBodyGrad(ctx, -u * 0.12, u * 0.34, u * 0.15, pal), pal.ink, outlineW);
      drawLimbCapsule(ctx, -u * 0.12, -u * 0.02, u * 0.04, u * 0.14, u * 0.11, makeBodyGrad(ctx, -u * 0.05, u * 0.06, u * 0.14, pal), pal.ink, outlineW);

      // Head
      const hx = u * 0.04;
      const hy = -u * 0.28;
      const hr = u * 0.22;
      drawHeadEarsAndCrest(ctx, hx, hy, hr, traits, pal, outlineW, sway);
      ctx.beginPath();
      safeEllipse(ctx, hx, hy, hr * 1.02, hr * 0.94, 0);
      ctx.fillStyle = makeBodyGrad(ctx, hx, hy, hr, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();
      drawExpressiveEye(ctx, hx + hr * 0.38, hy - hr * 0.06, hr * 0.25, pal, traits.eyeKind, outlineW);
      break;
    }

    case 'avian': {
      // Back wing
      const wingFlap = Math.sin(t * 4.2 + traits.phaseOffset) * 0.14;
      ctx.save();
      ctx.translate(-u * 0.06, -u * 0.06);
      ctx.rotate(-0.35 + wingFlap);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-u * 0.48 * traits.wingSpan, -u * 0.46, -u * 0.65 * traits.wingSpan, -u * 0.12, -u * 0.26, u * 0.12);
      ctx.closePath();
      ctx.fillStyle = pal.secondary;
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();
      ctx.restore();

      // Fanned tail feathers
      for (const ang of [-0.3, 0, 0.3]) {
        ctx.save();
        ctx.translate(-u * 0.24, u * 0.14);
        ctx.rotate(ang);
        ctx.beginPath();
        safeEllipse(ctx, -u * 0.16, 0, u * 0.18, u * 0.065, 0);
        ctx.fillStyle = pal.secondary;
        ctx.fill();
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = outlineW * 0.75;
        ctx.stroke();
        ctx.restore();
      }

      // Talons
      drawLimbCapsule(ctx, -u * 0.04, u * 0.24, -u * 0.06, u * 0.43, u * 0.06, '#f7c863', pal.ink, outlineW * 0.8);
      drawLimbCapsule(ctx, u * 0.12, u * 0.24, u * 0.14, u * 0.43, u * 0.06, '#f7c863', pal.ink, outlineW * 0.8);

      // Streamlined avian body
      ctx.beginPath();
      safeEllipse(ctx, 0, u * 0.05, u * 0.26 * sx, u * 0.24 * sy, -0.35);
      ctx.fillStyle = makeBodyGrad(ctx, 0, u * 0.05, u * 0.28, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();

      // Head + sharp curved beak
      const hx = u * 0.14;
      const hy = -u * 0.2;
      const hr = u * 0.18;
      drawHeadEarsAndCrest(ctx, hx, hy, hr, traits, pal, outlineW, sway);
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.fillStyle = makeBodyGrad(ctx, hx, hy, hr, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();

      // Beak
      ctx.beginPath();
      ctx.moveTo(hx + hr * 0.75, hy - hr * 0.15);
      ctx.quadraticCurveTo(hx + hr * 1.58, hy + hr * 0.08, hx + hr * 0.82, hy + hr * 0.34);
      ctx.closePath();
      ctx.fillStyle = '#ffd166';
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW * 0.85;
      ctx.stroke();

      // Near layered wing
      ctx.save();
      ctx.translate(-u * 0.06, u * 0.02);
      ctx.rotate(0.18 - wingFlap);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-u * 0.38, -u * 0.18, -u * 0.48, u * 0.18, -u * 0.08, u * 0.18);
      ctx.closePath();
      ctx.fillStyle = makeBodyGrad(ctx, -u * 0.2, 0, u * 0.28, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();
      ctx.restore();

      drawExpressiveEye(ctx, hx + hr * 0.32, hy - hr * 0.1, hr * 0.27, pal, traits.eyeKind, outlineW);
      break;
    }

    case 'serpentine': {
      // Undulating S-curve body segments
      const segs = 7;
      for (let i = segs - 1; i >= 0; i--) {
        const frac = i / (segs - 1);
        const segX = -u * 0.44 + frac * u * 0.56;
        const segY = u * 0.26 - Math.sin(frac * Math.PI * 1.45 + sway * 0.25) * u * 0.22;
        const segR = u * (0.08 + (1 - frac * 0.35) * 0.11);
        ctx.beginPath();
        ctx.arc(segX, segY, segR, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 ? makeBodyGrad(ctx, segX, segY, segR, pal) : pal.secondary;
        ctx.fill();
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = outlineW;
        ctx.stroke();
      }
      // Neck & sculpted dragon-serpent head
      const hx = u * 0.18;
      const hy = -u * 0.22;
      const hr = u * 0.20;
      drawHeadEarsAndCrest(ctx, hx, hy, hr, traits, pal, outlineW, sway);
      ctx.beginPath();
      safeEllipse(ctx, hx, hy, hr * 1.18, hr * 0.88, 0.08);
      ctx.fillStyle = makeBodyGrad(ctx, hx, hy, hr, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();
      drawExpressiveEye(ctx, hx + hr * 0.38, hy - hr * 0.08, hr * 0.25, pal, traits.eyeKind, outlineW);
      break;
    }

    case 'aquatic': {
      // Sweeping translucent tail fluke
      ctx.save();
      ctx.translate(-u * 0.32, u * 0.14);
      ctx.rotate(sway * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-u * 0.36, -u * 0.32, -u * 0.52, -u * 0.1, -u * 0.28, u * 0.04);
      ctx.bezierCurveTo(-u * 0.48, u * 0.24, -u * 0.26, u * 0.38, 0, u * 0.08);
      ctx.closePath();
      ctx.fillStyle = pal.secondary;
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();
      ctx.restore();

      // Hydrodynamic torso
      ctx.beginPath();
      safeEllipse(ctx, -u * 0.02, u * 0.1, u * 0.34 * sx, u * 0.21 * sy, -0.15);
      ctx.fillStyle = makeBodyGrad(ctx, 0, u * 0.1, u * 0.32, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();

      // Pectoral fins
      drawLimbCapsule(ctx, u * 0.04, u * 0.18, u * 0.16, u * 0.38, u * 0.1, pal.secondary, pal.ink, outlineW);

      // Head + neck frill
      const hx = u * 0.18;
      const hy = -u * 0.16;
      const hr = u * 0.21;
      drawHeadEarsAndCrest(ctx, hx, hy, hr, traits, pal, outlineW, sway);
      ctx.beginPath();
      safeEllipse(ctx, hx, hy, hr * 1.02, hr * 0.95, 0);
      ctx.fillStyle = makeBodyGrad(ctx, hx, hy, hr, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();
      drawExpressiveEye(ctx, hx + hr * 0.36, hy - hr * 0.06, hr * 0.26, pal, traits.eyeKind, outlineW);
      break;
    }

    case 'crystalline': {
      // Orbiting floating crystal shards
      for (let i = 0; i < 4; i++) {
        const a = t * 1.15 + traits.phaseOffset + (i / 4) * Math.PI * 2;
        const ox = Math.cos(a) * u * 0.46;
        const oy = -u * 0.04 + Math.sin(a) * u * 0.24;
        drawPolygonPath(ctx, ox, oy, u * 0.10, 4, a * 0.5);
        ctx.fillStyle = i % 2 === 0 ? pal.secondary : pal.glow;
        ctx.fill();
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = outlineW * 0.8;
        ctx.stroke();
      }
      // Faceted hexagonal crystal core body
      drawPolygonPath(ctx, 0, -u * 0.04, u * 0.36 * sx, 6, Math.PI / 6);
      ctx.fillStyle = makeBodyGrad(ctx, 0, -u * 0.04, u * 0.36, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();

      // Inner refractive prism facets & resonant orbital ring
      drawPolygonPath(ctx, -u * 0.05, -u * 0.1, u * 0.21, 6, Math.PI / 6);
      ctx.fillStyle = hexToRgba(pal.highlight, 0.52);
      ctx.fill();
      ctx.strokeStyle = hexToRgba('#ffffff', 0.65);
      ctx.lineWidth = outlineW * 0.55;
      ctx.stroke();

      ctx.strokeStyle = hexToRgba(pal.glow, 0.75);
      ctx.lineWidth = outlineW * 0.7;
      ctx.beginPath();
      safeEllipse(ctx, 0, -u * 0.04, u * 0.48, u * 0.18, -0.26);
      ctx.stroke();

      drawExpressiveEye(ctx, u * 0.11, -u * 0.06, u * 0.095, pal, traits.eyeKind, outlineW);
      break;
    }

    case 'ethereal': {
      // Wispveil floating spirit cloak & trailing mist tendrils
      ctx.beginPath();
      ctx.moveTo(-u * 0.28, u * 0.16);
      ctx.bezierCurveTo(-u * 0.36, -u * 0.36, u * 0.36, -u * 0.36, u * 0.28, u * 0.16);
      ctx.quadraticCurveTo(u * 0.18, u * 0.42 + sway * 2, u * 0.04, u * 0.24);
      ctx.quadraticCurveTo(-u * 0.04, u * 0.46 - sway * 2, -u * 0.16, u * 0.24);
      ctx.quadraticCurveTo(-u * 0.24, u * 0.38, -u * 0.28, u * 0.16);
      ctx.closePath();
      ctx.fillStyle = makeBodyGrad(ctx, 0, -u * 0.04, u * 0.34, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();

      drawHeadEarsAndCrest(ctx, u * 0.02, -u * 0.14, u * 0.24, traits, pal, outlineW, sway);
      // Twin floating spirit orbs
      for (const side of [-1, 1] as const) {
        const ox = side * u * 0.36;
        const oy = u * 0.02 + Math.sin(t * 2.5 + side) * u * 0.05;
        ctx.beginPath();
        ctx.arc(ox, oy, u * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = pal.glow;
        ctx.fill();
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = outlineW * 0.7;
        ctx.stroke();
      }
      drawExpressiveEye(ctx, u * 0.12, -u * 0.12, u * 0.075, pal, traits.eyeKind, outlineW);
      drawExpressiveEye(ctx, -u * 0.06, -u * 0.11, u * 0.068, pal, traits.eyeKind, outlineW);
      break;
    }

    case 'insectoid': {
      const flutter = Math.sin(t * 7.5 + traits.phaseOffset) * 0.16;
      // Translucent iridescent insect wings
      for (const [wx, wy, rx, ry, rot] of [
        [-u * 0.18, -u * 0.24, u * 0.34, u * 0.15, -0.55 + flutter],
        [-u * 0.16, -u * 0.08, u * 0.24, u * 0.11, -0.22 - flutter],
      ] as const) {
        ctx.save();
        ctx.translate(wx, wy);
        ctx.rotate(rot);
        ctx.beginPath();
        safeEllipse(ctx, 0, 0, rx, ry, 0);
        ctx.fillStyle = hexToRgba(pal.glow, 0.72);
        ctx.fill();
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = outlineW * 0.85;
        ctx.stroke();
        ctx.restore();
      }

      // Segmented abdomen + thorax
      ctx.beginPath();
      safeEllipse(ctx, -u * 0.16, u * 0.16, u * 0.22, u * 0.14, 0.35);
      ctx.fillStyle = pal.secondary;
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();

      ctx.beginPath();
      safeEllipse(ctx, u * 0.04, 0, u * 0.19, u * 0.17, 0);
      ctx.fillStyle = makeBodyGrad(ctx, u * 0.04, 0, u * 0.2, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();

      // Articulated limbs
      drawLimbCapsule(ctx, u * 0.14, u * 0.08, u * 0.28, u * 0.34, u * 0.06, pal.shadow, pal.ink, outlineW * 0.85);
      drawLimbCapsule(ctx, -u * 0.02, u * 0.12, u * 0.08, u * 0.38, u * 0.06, pal.primary, pal.ink, outlineW * 0.85);

      // Head + antennae
      const hx = u * 0.18;
      const hy = -u * 0.16;
      const hr = u * 0.17;
      drawHeadEarsAndCrest(ctx, hx, hy, hr, traits, pal, outlineW, sway);
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.fillStyle = makeBodyGrad(ctx, hx, hy, hr, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();
      drawExpressiveEye(ctx, hx + hr * 0.38, hy - hr * 0.05, hr * 0.32, pal, traits.eyeKind, outlineW);
      break;
    }

    case 'draconic': {
      // Sweeping winged dragon wings
      const flap = Math.sin(t * 2.8 + traits.phaseOffset) * 0.12;
      ctx.save();
      ctx.translate(-u * 0.06, -u * 0.08);
      ctx.rotate(-0.2 + flap);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-u * 0.56 * traits.wingSpan, -u * 0.44);
      ctx.quadraticCurveTo(-u * 0.38, -u * 0.14, -u * 0.50, u * 0.04);
      ctx.quadraticCurveTo(-u * 0.25, u * 0.02, -u * 0.24, u * 0.16);
      ctx.closePath();
      ctx.fillStyle = pal.secondary;
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();
      ctx.restore();

      drawTailShape(ctx, -u * 0.2, u * 0.22, u * 1.08, traits, pal, outlineW, sway);

      // Muscular chest & belly scutes
      ctx.beginPath();
      safeEllipse(ctx, -u * 0.02, u * 0.08, u * 0.27 * sx, u * 0.25 * sy, -0.2);
      ctx.fillStyle = makeBodyGrad(ctx, 0, u * 0.08, u * 0.28, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();

      ctx.beginPath();
      safeEllipse(ctx, u * 0.08, u * 0.12, u * 0.14, u * 0.17, -0.15);
      ctx.fillStyle = pal.glow;
      ctx.fill();

      drawLimbCapsule(ctx, -u * 0.08, u * 0.22, -u * 0.14, u * 0.45, u * 0.14, makeBodyGrad(ctx, -u * 0.1, u * 0.34, u * 0.15, pal), pal.ink, outlineW);
      drawLimbCapsule(ctx, u * 0.12, u * 0.22, u * 0.22, u * 0.44, u * 0.12, pal.shadow, pal.ink, outlineW);
      drawLimbCapsule(ctx, u * 0.12, -u * 0.02, u * 0.32, u * 0.10, u * 0.09, makeBodyGrad(ctx, u * 0.2, 0, u * 0.12, pal), pal.ink, outlineW);

      // Sculpted dragon snout & horns
      const hx = u * 0.14;
      const hy = -u * 0.25;
      const hr = u * 0.20;
      drawHeadEarsAndCrest(ctx, hx, hy, hr, traits, pal, outlineW, sway);
      ctx.beginPath();
      safeEllipse(ctx, hx + hr * 0.16, hy, hr * 1.2, hr * 0.86, 0.05);
      ctx.fillStyle = makeBodyGrad(ctx, hx, hy, hr, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();
      drawExpressiveEye(ctx, hx + hr * 0.4, hy - hr * 0.1, hr * 0.25, pal, 1, outlineW);
      break;
    }

    case 'armored': {
      // Fortified carapace & pauldrons
      drawLimbCapsule(ctx, -u * 0.18, u * 0.22, -u * 0.24, u * 0.45, u * 0.16, pal.shadow, pal.ink, outlineW);
      drawLimbCapsule(ctx, u * 0.14, u * 0.22, u * 0.22, u * 0.45, u * 0.16, pal.shadow, pal.ink, outlineW);

      // Hex-beveled armored torso
      drawPolygonPath(ctx, 0, u * 0.06, u * 0.33 * sx, 6, 0);
      ctx.fillStyle = makeBodyGrad(ctx, 0, u * 0.06, u * 0.34, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();

      // Shoulder pauldrons
      for (const side of [-1, 1] as const) {
        ctx.beginPath();
        safeEllipse(ctx, side * u * 0.27, -u * 0.04, u * 0.15, u * 0.12, side * 0.35);
        ctx.fillStyle = pal.secondary;
        ctx.fill();
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = outlineW;
        ctx.stroke();
      }

      // Metallic chest core crest
      drawPolygonPath(ctx, u * 0.04, u * 0.06, u * 0.12, 4, Math.PI * 0.25);
      ctx.fillStyle = pal.glow;
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW * 0.75;
      ctx.stroke();

      // Visored helmet head
      const hx = u * 0.04;
      const hy = -u * 0.25;
      const hr = u * 0.21;
      drawHeadEarsAndCrest(ctx, hx, hy, hr, traits, pal, outlineW, sway);
      drawPolygonPath(ctx, hx, hy, hr, 6, Math.PI / 6);
      ctx.fillStyle = makeBodyGrad(ctx, hx, hy, hr, pal);
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = outlineW;
      ctx.stroke();
      drawExpressiveEye(ctx, hx + hr * 0.35, hy - hr * 0.04, hr * 0.25, pal, 1, outlineW);
      break;
    }
  }
}

export class OfflineSpriteRigSynthesizer implements IOfflineSpriteRigSynthesizer {
  renderRig(
    ctx: CanvasRenderingContext2D,
    rig: OfflineRigDescriptor,
    options: {
      cx: number;
      cy: number;
      size: number;
      time: number;
      facing: 'left' | 'right';
      hitFlash?: number;
      rimColor?: string;
      reducedMotion?: boolean;
    },
  ): void {
    const size = Math.max(24, options.size);
    const u = size * 0.92;
    const traits = extractTraits(rig.speciesId);
    const pal = resolvePalette(rig);
    const motionScale = options.reducedMotion ? 0.14 : 1.0;
    const t = options.time * motionScale;

    // Breathing squash-and-stretch + buoyant bob
    const breathPhase = Math.sin(t * 2.7 + traits.phaseOffset);
    const breathScaleX = 1 + breathPhase * 0.032;
    const breathScaleY = 1 - breathPhase * 0.036;
    const bobY =
      rig.archetype === 'ethereal' || rig.archetype === 'crystalline' || rig.archetype === 'avian'
        ? Math.sin(t * 2.3 + traits.phaseOffset) * (size * 0.045)
        : Math.abs(breathPhase) * (size * 0.015);
    const sway = Math.sin(t * 2.1 + traits.phaseOffset);

    const outlineW = Math.max(1.4, size * 0.022);
    const dirSign = options.facing === 'left' ? -1 : 1;
    const hitFlash = clamp(options.hitFlash ?? 0, 0, 1);

    ctx.save();
    ctx.translate(options.cx, options.cy - bobY);
    ctx.scale(dirSign * breathScaleX, breathScaleY);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Elemental rim-light aura behind silhouette
    if (options.rimColor) {
      ctx.save();
      ctx.shadowColor = options.rimColor;
      ctx.shadowBlur = size * 0.12;
      const rimGrad = ctx.createRadialGradient(0, 0, u * 0.08, 0, 0, u * 0.56);
      rimGrad.addColorStop(0, hexToRgba(options.rimColor, 0.24));
      rimGrad.addColorStop(1, hexToRgba(options.rimColor, 0));
      ctx.fillStyle = rimGrad;
      ctx.beginPath();
      ctx.arc(0, 0, u * 0.56, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Secondary elemental crest/aura ornament
    drawElementalOrnament(
      ctx,
      rig.secondaryType ?? rig.primaryType,
      0,
      0,
      u,
      pal,
      outlineW,
      t,
    );

    // Main multi-shaded creature body
    drawArchetypeBody(ctx, rig.archetype, u, traits, pal, outlineW, t, sway);

    // Light-facing directional cel rim crescent highlight
    if (options.rimColor) {
      ctx.save();
      ctx.strokeStyle = options.rimColor;
      ctx.lineWidth = Math.max(1.5, outlineW * 0.95);
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.arc(u * 0.04, -u * 0.08, u * 0.34, -Math.PI * 0.72, -Math.PI * 0.08);
      ctx.stroke();
      ctx.restore();
    }

    // Hit-flash white-gold contoured blend (re-draws silhouette under additive blend, zero box!)
    if (hitFlash > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = hitFlash * 0.78;
      const flashPal: RigPaletteResolved = {
        ...pal,
        primary: '#fff8d4',
        secondary: '#ffe999',
        glow: '#ffffff',
        highlight: '#ffffff',
        shadow: '#ffd875',
        ink: '#fffbe6',
        eyeCore: '#ffffff',
      };
      drawArchetypeBody(ctx, rig.archetype, u, traits, flashPal, outlineW, t, sway);
      ctx.restore();
    }

    // Shiny iridescent star-sparkles
    if (rig.shiny) {
      for (let s = 0; s < 4; s++) {
        const a = t * 1.9 + (s / 4) * Math.PI * 2;
        const sx = Math.cos(a) * u * 0.48;
        const sy = -u * 0.08 + Math.sin(a * 1.3) * u * 0.34;
        const pulseR = u * (0.045 + 0.025 * Math.sin(t * 4.5 + s));
        drawStarPath(ctx, sx, sy, pulseR * 1.6, pulseR * 0.45, 4, t + s);
        ctx.fillStyle = s % 2 === 0 ? '#fff6a6' : '#a3f7ff';
        ctx.fill();
      }
    }

    ctx.restore();
  }

  toDataUrl(rig: OfflineRigDescriptor, size = 160): string {
    const safeSize = Math.max(32, Math.round(size));
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = safeSize;
        canvas.height = safeSize;
        const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
        if (ctx && typeof canvas.toDataURL === 'function') {
          ctx.clearRect(0, 0, safeSize, safeSize);
          this.renderRig(ctx, rig, {
            cx: safeSize * 0.5,
            cy: safeSize * 0.56,
            size: safeSize * 0.76,
            time: 0.45,
            facing: 'right',
            rimColor: TYPE_PALETTES[rig.primaryType]?.glow,
            reducedMotion: true,
          });
          const url = canvas.toDataURL('image/png');
          if (typeof url === 'string' && url.startsWith('data:')) {
            return url;
          }
        }
      } catch {
        // Fall through to safe SVG data URL in headless or mock DOM environments
      }
    }

    // Safe lightweight fallback SVG data URL for pure Node tests without canvas
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 ${safeSize} ${safeSize}"></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}
