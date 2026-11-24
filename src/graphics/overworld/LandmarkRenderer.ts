import type {
  OverworldActor,
  OverworldLandmark,
  OverworldSceneState,
  PointLight,
} from '../../contracts';
import { TYPE_PALETTES } from '../../core/data/typePalettes';
import {
  clamp,
  drawContactShadow,
  drawFourPointStar,
  fillEllipse,
  hexRgba,
  hexToRgb01,
  hexToRgb255,
  mixRgb,
  rgb255ToStr,
  roundedRectPath,
  strokeEllipse,
} from './AutotileRenderer';

export class LandmarkRenderer {
  /**
   * Emits real-time 2D PointLights for cottages (both lit windows), fountains,
   * shrines, starfall shimmer nodes, observatories, boutiques, signposts, chests, and docks.
   */
  collectLights(
    state: OverworldSceneState,
    out: PointLight[],
    maxLights: number,
  ): void {
    const { map, biome, timeOfDay } = state;
    const { tileSize, landmarks } = map;

    // Slight twilight boost so warm windows & starlight shrines glow vividly
    const twilightBoost = 0.85 + 0.35 * clamp(Math.abs(timeOfDay - 0.5) * 2, 0, 1);

    for (const lm of landmarks) {
      if (out.length >= maxLights) break;
      const cx = (lm.tileX + lm.widthTiles * 0.5) * tileSize;
      const cy = (lm.tileY + lm.heightTiles * 0.5) * tileSize;
      const baseRadius = Math.max(90, lm.lightRadius || tileSize * 3.5);

      switch (lm.kind) {
        case 'cottage': {
          const w = lm.widthTiles * tileSize;
          const h = lm.heightTiles * tileSize;
          const leftWinX = lm.tileX * tileSize + w * 0.25;
          const rightWinX = lm.tileX * tileSize + w * 0.75;
          const winY = lm.tileY * tileSize + h * 0.58;

          out.push({
            id: `${lm.id}-win-left`,
            x: leftWinX,
            y: winY,
            radius: baseRadius * 0.78,
            color: [1.0, 0.8, 0.42],
            intensity: 1.15 * twilightBoost,
            flickerSpeed: 3.1,
            flickerAmount: 0.08,
          });
          if (out.length < maxLights) {
            out.push({
              id: `${lm.id}-win-right`,
              x: rightWinX,
              y: winY,
              radius: baseRadius * 0.78,
              color: [1.0, 0.8, 0.42],
              intensity: 1.15 * twilightBoost,
              flickerSpeed: 3.4,
              flickerAmount: 0.08,
            });
          }
          break;
        }

        case 'fountain': {
          out.push({
            id: `${lm.id}-glow`,
            x: cx,
            y: cy,
            radius: baseRadius,
            color: [0.36, 0.88, 1.0],
            intensity: 1.22 * twilightBoost,
            flickerSpeed: 2.2,
            flickerAmount: 0.07,
          });
          break;
        }

        case 'shrine': {
          const elType = lm.elementalType ?? biome.elementalType;
          const paletteRgb = TYPE_PALETTES[elType]?.rgb ?? hexToRgb01(lm.emissiveHex);
          const boost = lm.activated ? 1.35 : 1.12;
          out.push({
            id: `${lm.id}-altar`,
            x: cx,
            y: cy - tileSize * 0.12,
            radius: baseRadius * (lm.activated ? 1.15 : 1.0),
            color: paletteRgb,
            intensity: boost * twilightBoost,
            flickerSpeed: 2.5,
            flickerAmount: 0.1,
          });
          break;
        }

        case 'starfall': {
          out.push({
            id: `${lm.id}-beacon`,
            x: cx,
            y: cy,
            radius: baseRadius,
            color: [1.0, 0.91, 0.48],
            intensity: 1.32 * twilightBoost,
            flickerSpeed: 2.9,
            flickerAmount: 0.16,
          });
          break;
        }

        case 'observatory': {
          out.push({
            id: `${lm.id}-beacon`,
            x: cx,
            y: lm.tileY * tileSize + tileSize * 0.7,
            radius: baseRadius,
            color: [0.55, 0.76, 1.0],
            intensity: 1.28 * twilightBoost,
            flickerSpeed: 1.8,
            flickerAmount: 0.08,
          });
          if (out.length < maxLights) {
            out.push({
              id: `${lm.id}-door`,
              x: cx,
              y: (lm.tileY + lm.heightTiles - 0.35) * tileSize,
              radius: baseRadius * 0.62,
              color: [1.0, 0.84, 0.52],
              intensity: 0.95 * twilightBoost,
              flickerSpeed: 2.6,
              flickerAmount: 0.05,
            });
          }
          break;
        }

        case 'studio': {
          out.push({
            id: `${lm.id}-boutique`,
            x: cx,
            y: lm.tileY * tileSize + lm.heightTiles * tileSize * 0.62,
            radius: baseRadius,
            color: [1.0, 0.58, 0.86],
            intensity: 1.14 * twilightBoost,
            flickerSpeed: 2.4,
            flickerAmount: 0.06,
          });
          break;
        }

        case 'signpost': {
          out.push({
            id: `${lm.id}-lantern`,
            x: cx + tileSize * 0.25,
            y: cy - tileSize * 0.1,
            radius: baseRadius,
            color: [1.0, 0.82, 0.46],
            intensity: 0.88 * twilightBoost,
            flickerSpeed: 3.5,
            flickerAmount: 0.09,
          });
          break;
        }

        case 'chest': {
          out.push({
            id: `${lm.id}-glint`,
            x: cx,
            y: cy,
            radius: baseRadius,
            color: [1.0, 0.84, 0.44],
            intensity: (lm.activated ? 0.55 : 0.96) * twilightBoost,
            flickerSpeed: 2.2,
            flickerAmount: 0.1,
          });
          break;
        }

        case 'dock': {
          out.push({
            id: `${lm.id}-harbor`,
            x: cx,
            y: cy,
            radius: baseRadius,
            color: [1.0, 0.78, 0.44],
            intensity: 0.98 * twilightBoost,
            flickerSpeed: 3.1,
            flickerAmount: 0.09,
          });
          break;
        }
      }
    }
  }

  /**
   * Renders a high-craft 2.5D diorama landmark within its tile footprint.
   */
  renderLandmark(
    ctx: CanvasRenderingContext2D,
    lm: OverworldLandmark,
    state: OverworldSceneState,
  ): void {
    const { tileSize } = state.map;
    const x = lm.tileX * tileSize;
    const y = lm.tileY * tileSize;
    const w = lm.widthTiles * tileSize;
    const h = lm.heightTiles * tileSize;
    const cx = x + w * 0.5;
    const baseY = y + h;
    const t = state.reducedMotion ? state.elapsedSeconds * 0.2 : state.elapsedSeconds;

    switch (lm.kind) {
      case 'cottage':
        this.drawCottage(ctx, x, y, w, h, t, state.reducedMotion);
        break;
      case 'studio':
        this.drawStyleStudio(ctx, x, y, w, h, t);
        break;
      case 'observatory':
        this.drawObservatory(ctx, x, y, w, h, t);
        break;
      case 'shrine':
        this.drawShrine(ctx, lm, x, y, w, h, t, state.biome.elementalType);
        break;
      case 'fountain':
        this.drawFountain(ctx, cx, y, w, h, t);
        break;
      case 'chest':
        this.drawChest(ctx, cx, baseY, tileSize, Boolean(lm.activated), t);
        break;
      case 'signpost':
        this.drawSignpost(ctx, cx, baseY, tileSize, t);
        break;
      case 'starfall':
        this.drawStarfallNode(ctx, cx, baseY, tileSize, lm.emissiveHex, t);
        break;
      case 'dock':
        this.drawDock(ctx, x, y, w, h, t);
        break;
    }
  }

  /**
   * Renders crisp interaction highlight halo when nearbyInteraction is active.
   */
  renderNearbyInteractionHalo(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
  ): void {
    const target = state.nearbyInteraction;
    if (!target) return;
    const { tileSize } = state.map;
    const t = state.reducedMotion ? 0 : state.elapsedSeconds;
    const pulse = 0.72 + 0.28 * Math.sin(t * 4.5);

    let cx = 0;
    let cy = 0;
    let rx = tileSize * 0.6;
    let ry = tileSize * 0.28;
    let glowHex = '#ffd479';

    if ('tileX' in target) {
      cx = (target.tileX + target.widthTiles * 0.5) * tileSize;
      cy = (target.tileY + target.heightTiles) * tileSize - tileSize * 0.14;
      rx = Math.max(tileSize * 0.58, target.widthTiles * tileSize * 0.48);
      ry = Math.max(tileSize * 0.24, tileSize * 0.3);
      glowHex = target.emissiveHex || '#ffd479';
    } else {
      const actor = target as OverworldActor;
      cx = actor.x * tileSize;
      cy = actor.y * tileSize;
      glowHex = actor.accentHex || '#8be8ff';
    }

    strokeEllipse(ctx, cx, cy, rx * (0.96 + 0.06 * pulse), ry * (0.96 + 0.06 * pulse), hexRgba(glowHex, 0.78), 2.2);
    strokeEllipse(ctx, cx, cy, rx * 1.12, ry * 1.12, hexRgba('#ffffff', 0.34 * pulse), 1.2);

    // Floating vector diamond prompt above target (ZERO emojis!)
    const bobY = cy - ry * 2.2 - tileSize * 0.95 - (state.reducedMotion ? 0 : Math.sin(t * 4) * 3.5);
    ctx.save();
    ctx.fillStyle = 'rgba(14, 20, 44, 0.86)';
    roundedRectPath(ctx, cx - 11, bobY - 11, 22, 22, 6);
    ctx.fill();
    ctx.strokeStyle = hexRgba(glowHex, 0.92);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = hexRgba(glowHex, 0.98);
    drawFourPointStar(ctx, cx, bobY, 6, 2.4, t * 0.8);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Renders world-space target ring at activeWayfindingTarget.
   */
  renderWayfindingWorldRing(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
  ): void {
    const target = state.activeWayfindingTarget;
    if (!target) return;
    const { tileSize } = state.map;
    const t = state.reducedMotion ? 0 : state.elapsedSeconds;
    const wx = target.x * tileSize;
    const wy = target.y * tileSize;
    const phase = (t * 0.9) % 1;
    const r = tileSize * (0.45 + phase * 0.65);

    strokeEllipse(ctx, wx, wy, r, r * 0.48, `rgba(255, 218, 122, ${(1 - phase) * 0.82})`, 2.0);
    strokeEllipse(ctx, wx, wy, tileSize * 0.42, tileSize * 0.2, 'rgba(130, 228, 255, 0.72)', 1.5);
  }

  /**
   * Renders a crisp vector screen-edge compass arrow & label when activeWayfindingTarget
   * lies outside or near the edge of the viewport (ZERO Unicode emojis!).
   */
  renderWayfindingScreenCompass(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    camX: number,
    camY: number,
    camZoom: number,
    viewW: number,
    viewH: number,
  ): void {
    const target = state.activeWayfindingTarget;
    if (!target) return;
    const { tileSize } = state.map;
    const wx = target.x * tileSize;
    const wy = target.y * tileSize;

    const sx = viewW * 0.5 + (wx - camX - viewW * 0.5) * camZoom;
    const sy = viewH * 0.5 + (wy - camY - viewH * 0.5) * camZoom;

    const margin = 42;
    if (sx >= margin && sx <= viewW - margin && sy >= margin && sy <= viewH - margin) {
      return;
    }

    const cx = viewW * 0.5;
    const cy = viewH * 0.5;
    const dx = sx - cx;
    const dy = sy - cy;
    const angle = Math.atan2(dy, dx);
    const halfW = Math.max(40, cx - margin);
    const halfH = Math.max(40, cy - margin);
    const scaleX = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : 1e6;
    const scaleY = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : 1e6;
    const k = Math.min(scaleX, scaleY, 1);
    const px = cx + dx * k;
    const py = cy + dy * k;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);

    // Outer celestial glass chevron ring
    ctx.fillStyle = 'rgba(14, 22, 48, 0.88)';
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 214, 120, 0.92)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Directional vector arrow
    ctx.fillStyle = '#ffd978';
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-4, -6);
    ctx.lineTo(-1, 0);
    ctx.lineTo(-4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawCottage(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    t: number,
    reducedMotion: boolean,
  ): void {
    const cx = x + w * 0.5;
    drawContactShadow(ctx, cx, y + h - 3, w * 0.5, h * 0.14, 0.36);

    const wallX = x + w * 0.08;
    const wallW = w * 0.84;
    const wallY = y + h * 0.44;
    const wallH = h * 0.52;

    // Stone masonry base
    ctx.fillStyle = '#6c728a';
    ctx.fillRect(wallX - 2, wallY + wallH - 12, wallW + 4, 12);
    ctx.strokeStyle = 'rgba(20, 24, 42, 0.35)';
    ctx.lineWidth = 1;
    for (let sx = wallX; sx < wallX + wallW - 8; sx += 14) {
      ctx.strokeRect(sx, wallY + wallH - 11, 14, 10);
    }

    // Cream timber walls & corner beams
    ctx.fillStyle = '#e8dbc6';
    ctx.fillRect(wallX, wallY, wallW, wallH - 10);
    ctx.fillStyle = '#7a5234';
    ctx.fillRect(wallX, wallY, 7, wallH - 10);
    ctx.fillRect(wallX + wallW - 7, wallY, 7, wallH - 10);
    ctx.fillRect(wallX, wallY, wallW, 5);

    // Chimney & rising cozy smoke puffs
    const chimX = x + w * 0.72;
    const chimY = y + h * 0.06;
    ctx.fillStyle = '#8c5a4d';
    ctx.fillRect(chimX, chimY, 14, h * 0.28);
    ctx.fillStyle = '#5c3a32';
    ctx.fillRect(chimX - 2, chimY, 18, 4);

    const puffCount = reducedMotion ? 1 : 3;
    for (let i = 0; i < puffCount; i++) {
      const cycle = ((t * 0.45 + i * 0.33) % 1);
      const sx = chimX + 7 + Math.sin(cycle * Math.PI * 2 + i) * 5;
      const sy = chimY - 4 - cycle * 22;
      ctx.fillStyle = `rgba(225, 232, 248, ${(1 - cycle) * 0.35})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5 + cycle * 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pitched slate-indigo roof with shingled tiers
    ctx.fillStyle = '#384b85';
    ctx.beginPath();
    ctx.moveTo(x + 2, wallY + 4);
    ctx.lineTo(cx, y + h * 0.06);
    ctx.lineTo(x + w - 2, wallY + 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#4e67ab';
    ctx.beginPath();
    ctx.moveTo(x + 8, wallY + 2);
    ctx.lineTo(cx, y + h * 0.1);
    ctx.lineTo(cx + 8, wallY + 2);
    ctx.closePath();
    ctx.fill();

    // Warm golden brass eaves trim
    ctx.fillStyle = '#e8bf68';
    ctx.fillRect(x + 2, wallY + 1, w - 4, 4);

    // Arched oak front door
    const doorW = 18;
    const doorH = 27;
    const doorX = cx - doorW * 0.5;
    const doorY = y + h - doorH - 3;
    ctx.fillStyle = '#693f26';
    roundedRectPath(ctx, doorX, doorY, doorW, doorH, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd978';
    ctx.beginPath();
    ctx.arc(doorX + doorW - 5, doorY + doorH * 0.56, 2, 0, Math.PI * 2);
    ctx.fill();

    // Two glowing warm mullioned cottage windows + flower boxes
    const winW = 16;
    const winH = 16;
    const winY = wallY + 11;
    const windows = [wallX + 12, wallX + wallW - 12 - winW];
    for (const wx of windows) {
      // Soft window halo spill
      ctx.fillStyle = 'rgba(255, 212, 110, 0.24)';
      ctx.beginPath();
      ctx.arc(wx + winW * 0.5, winY + winH * 0.5, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#5c3c24';
      ctx.fillRect(wx - 2, winY - 2, winW + 4, winH + 4);
      ctx.fillStyle = '#ffd875';
      ctx.fillRect(wx, winY, winW, winH);
      ctx.fillStyle = '#fff8cf';
      ctx.fillRect(wx + 2, winY + 2, winW - 6, winH - 6);
      // Window mullions
      ctx.fillStyle = '#5c3c24';
      ctx.fillRect(wx + winW * 0.5 - 1, winY, 2, winH);
      ctx.fillRect(wx, winY + winH * 0.5 - 1, winW, 2);
      // Flower planter
      ctx.fillStyle = '#734a30';
      ctx.fillRect(wx - 2, winY + winH + 1, winW + 4, 4);
    }
  }

  private drawStyleStudio(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    t: number,
  ): void {
    const cx = x + w * 0.5;
    drawContactShadow(ctx, cx, y + h - 3, w * 0.5, h * 0.14, 0.35);

    const wallX = x + w * 0.08;
    const wallW = w * 0.84;
    const wallY = y + h * 0.35;
    const wallH = h * 0.62;

    // Cream-lavender boutique walls
    ctx.fillStyle = '#ede3f7';
    ctx.fillRect(wallX, wallY, wallW, wallH);
    ctx.fillStyle = '#56418f';
    ctx.fillRect(wallX, y + h * 0.14, wallW, h * 0.22);

    // Rooftop luminous star emblem marquee
    const glint = 0.78 + 0.22 * Math.sin(t * 2.6);
    ctx.fillStyle = `rgba(255, 158, 224, ${glint})`;
    drawFourPointStar(ctx, cx, y + h * 0.24, 11, 4.5, 0);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    drawFourPointStar(ctx, cx, y + h * 0.24, 5, 2, 0);
    ctx.fill();

    // Striped rose-ivory scalloped boutique awning
    const awningY = wallY - 2;
    const awningH = 16;
    const stripes = 8;
    const stripeW = (wallW + 8) / stripes;
    for (let i = 0; i < stripes; i++) {
      const sx = wallX - 4 + i * stripeW;
      ctx.fillStyle = i % 2 === 0 ? '#e35ca8' : '#fcf5ff';
      ctx.fillRect(sx, awningY, stripeW + 0.5, awningH - 3);
      ctx.beginPath();
      ctx.arc(sx + stripeW * 0.5, awningY + awningH - 3, stripeW * 0.5, 0, Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(20, 14, 42, 0.24)';
    ctx.fillRect(wallX, awningY + awningH, wallW, 5);

    // Glowing cyan display boutique window + chic entry door
    ctx.fillStyle = '#7cd9ff';
    roundedRectPath(ctx, wallX + 10, wallY + 24, wallW * 0.42, 26, 4);
    ctx.fill();
    ctx.fillStyle = '#d4f5ff';
    ctx.fillRect(wallX + 14, wallY + 28, 12, 16);

    ctx.fillStyle = '#794ea3';
    roundedRectPath(ctx, wallX + wallW - 30, wallY + 22, 20, wallH - 24, 5);
    ctx.fill();
    ctx.fillStyle = '#ffd1f2';
    ctx.fillRect(wallX + wallW - 26, wallY + 27, 12, 14);
  }

  private drawObservatory(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    t: number,
  ): void {
    const cx = x + w * 0.5;
    drawContactShadow(ctx, cx, y + h - 4, w * 0.48, h * 0.14, 0.38);

    // Stone masonry rotunda drum
    const drumX = x + w * 0.12;
    const drumW = w * 0.76;
    const drumY = y + h * 0.46;
    const drumH = h * 0.5;
    ctx.fillStyle = '#b9c6e0';
    ctx.fillRect(drumX, drumY, drumW, drumH);
    ctx.fillStyle = '#8b99ba';
    ctx.fillRect(drumX, drumY + drumH - 10, drumW, 10);

    // Ribbed celestial indigo dome
    const domeR = drumW * 0.46;
    const domeCy = drumY + 2;
    ctx.fillStyle = '#385199';
    ctx.beginPath();
    ctx.arc(cx, domeCy, domeR, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    // Dome rib shading & gold trim belt
    ctx.strokeStyle = 'rgba(130, 178, 255, 0.38)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, domeCy, domeR * 0.7, Math.PI, 0);
    ctx.stroke();

    ctx.fillStyle = '#ebbf5e';
    ctx.fillRect(drumX - 3, drumY - 2, drumW + 6, 5);

    // Brass telescope protruding toward the stars
    const scopeShift = Math.sin(t * 0.7) * 2;
    ctx.save();
    ctx.translate(cx + 4, domeCy - domeR * 0.42);
    ctx.rotate(-0.46 + scopeShift * 0.015);
    ctx.fillStyle = '#d4a346';
    ctx.fillRect(0, -4, domeR * 0.95, 8);
    ctx.fillStyle = '#ffe594';
    ctx.fillRect(2, -2, domeR * 0.85, 2.5);
    ctx.fillStyle = '#8ce6ff';
    ctx.beginPath();
    ctx.arc(domeR * 0.95, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Glowing arched observatory portal
    const doorW = 24;
    const doorH = 30;
    ctx.fillStyle = '#242c54';
    roundedRectPath(ctx, cx - doorW * 0.5, y + h - doorH - 2, doorW, doorH, 12);
    ctx.fill();
    ctx.fillStyle = '#9cc0ff';
    drawFourPointStar(ctx, cx, y + h - doorH * 0.55, 5, 2, t * 0.5);
    ctx.fill();
  }

  private drawShrine(
    ctx: CanvasRenderingContext2D,
    lm: OverworldLandmark,
    x: number,
    y: number,
    w: number,
    h: number,
    t: number,
    fallbackType: OverworldSceneState['biome']['elementalType'],
  ): void {
    const cx = x + w * 0.5;
    const elType = lm.elementalType ?? fallbackType;
    const pal = TYPE_PALETTES[elType];
    const primaryRgb = hexToRgb255(pal.primary);
    const glowRgb = hexToRgb255(pal.glow);

    drawContactShadow(ctx, cx, y + h - 3, w * 0.48, h * 0.16, 0.36);

    // Two-tier carved basalt dais
    ctx.fillStyle = '#5c637d';
    roundedRectPath(ctx, x + 6, y + h - 18, w - 12, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#838ba8';
    roundedRectPath(ctx, x + 12, y + h - 25, w - 24, 10, 3);
    ctx.fill();

    // Twin fluted shrine pillars with carved elemental runes
    const pillarW = 12;
    const pillarH = h * 0.62;
    const leftPx = x + w * 0.16;
    const rightPx = x + w * 0.84 - pillarW;
    const pillarTop = y + h * 0.16;

    for (const px of [leftPx, rightPx]) {
      ctx.fillStyle = '#737b99';
      ctx.fillRect(px, pillarTop, pillarW, pillarH);
      ctx.fillStyle = '#9ca5c7';
      ctx.fillRect(px + 2, pillarTop, 4, pillarH);
      // Glowing rune sigil on pillar
      const pulse = 0.68 + 0.32 * Math.sin(t * 2.8);
      ctx.fillStyle = rgb255ToStr(glowRgb, pulse);
      ctx.fillRect(px + 3, pillarTop + 12, 6, 2.5);
      ctx.fillRect(px + 5, pillarTop + 16, 2, 10);
      ctx.fillRect(px + 3, pillarTop + 28, 6, 2.5);
    }

    // Torii-inspired celestial lintel beam
    ctx.fillStyle = '#9ea8cc';
    roundedRectPath(ctx, x + 4, pillarTop - 6, w - 8, 9, 4);
    ctx.fill();
    ctx.fillStyle = '#5c6382';
    ctx.fillRect(x + 10, pillarTop + 7, w - 20, 5);

    // Floating faceted elemental crystal altar core
    const floatY = y + h * 0.45 + Math.sin(t * 2.3) * 3.5;
    const orbScale = lm.activated ? 1.22 : 1.0;

    // Soft radial aura behind crystal
    fillEllipse(ctx, cx, floatY, 16 * orbScale, 16 * orbScale, rgb255ToStr(primaryRgb, 0.28));

    ctx.fillStyle = rgb255ToStr(primaryRgb);
    ctx.beginPath();
    ctx.moveTo(cx, floatY - 14 * orbScale);
    ctx.lineTo(cx + 10 * orbScale, floatY);
    ctx.lineTo(cx, floatY + 14 * orbScale);
    ctx.lineTo(cx - 10 * orbScale, floatY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = rgb255ToStr(glowRgb, 0.92);
    ctx.beginPath();
    ctx.moveTo(cx, floatY - 11 * orbScale);
    ctx.lineTo(cx + 5 * orbScale, floatY - 1);
    ctx.lineTo(cx, floatY + 4 * orbScale);
    ctx.lineTo(cx - 5 * orbScale, floatY - 1);
    ctx.closePath();
    ctx.fill();
  }

  private drawFountain(
    ctx: CanvasRenderingContext2D,
    cx: number,
    y: number,
    w: number,
    h: number,
    t: number,
  ): void {
    const basinCy = y + h * 0.68;
    const rx = w * 0.44;
    const ry = h * 0.22;

    drawContactShadow(ctx, cx, basinCy + 4, rx * 1.05, ry * 1.08, 0.34);

    // Outer sculpted marble basin rim
    fillEllipse(ctx, cx, basinCy + 2, rx, ry, '#8d99b8');
    fillEllipse(ctx, cx, basinCy - 2, rx * 0.98, ry * 0.94, '#b8c3de');

    // Luminous cyan-aqua healing water pool
    fillEllipse(ctx, cx, basinCy - 2, rx * 0.84, ry * 0.74, '#2aa8de');
    const ripple = (t * 0.8) % 1;
    strokeEllipse(
      ctx,
      cx,
      basinCy - 2,
      rx * (0.28 + ripple * 0.52),
      ry * (0.24 + ripple * 0.46),
      `rgba(204, 248, 255, ${(1 - ripple) * 0.72})`,
      1.6,
    );

    // Central marble spire & upper chalice
    ctx.fillStyle = '#c4cfe8';
    ctx.fillRect(cx - 6, y + h * 0.28, 12, h * 0.38);
    fillEllipse(ctx, cx, y + h * 0.3, rx * 0.44, ry * 0.44, '#aebad6');
    fillEllipse(ctx, cx, y + h * 0.29, rx * 0.34, ry * 0.3, '#69dcff');

    // Animated glistening water plume & side arcs
    const plumeH = 12 + Math.sin(t * 5.2) * 2.5;
    ctx.fillStyle = 'rgba(200, 248, 255, 0.9)';
    ctx.fillRect(cx - 2.5, y + h * 0.29 - plumeH, 5, plumeH);
    ctx.strokeStyle = 'rgba(176, 242, 255, 0.78)';
    ctx.lineWidth = 2;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, y + h * 0.29 - plumeH * 0.7);
      ctx.quadraticCurveTo(cx + dir * 13, y + h * 0.24, cx + dir * 18, basinCy - 3);
      ctx.stroke();
    }
  }

  private drawChest(
    ctx: CanvasRenderingContext2D,
    cx: number,
    baseY: number,
    tileSize: number,
    opened: boolean,
    t: number,
  ): void {
    const w = tileSize * 0.68;
    const h = tileSize * 0.52;
    const left = cx - w * 0.5;
    const top = baseY - h - 4;

    drawContactShadow(ctx, cx, baseY - 3, w * 0.55, 6, 0.36);

    // Base chest box
    ctx.fillStyle = '#7d4924';
    roundedRectPath(ctx, left, top + h * 0.34, w, h * 0.66, 3);
    ctx.fill();

    // Gold vertical bands
    ctx.fillStyle = '#ebb854';
    ctx.fillRect(left + 4, top + h * 0.34, 4, h * 0.66);
    ctx.fillRect(left + w - 8, top + h * 0.34, 4, h * 0.66);

    if (opened) {
      // Dark interior & tilted open lid
      ctx.fillStyle = '#24140d';
      ctx.fillRect(left + 2, top + h * 0.34, w - 4, 6);

      ctx.fillStyle = '#9c5d30';
      roundedRectPath(ctx, left - 1, top - 4, w + 2, h * 0.38, 4);
      ctx.fill();
      ctx.fillStyle = '#ebb854';
      ctx.fillRect(left - 1, top + h * 0.28, w + 2, 3);

      // Subtle empty-open star glint
      ctx.fillStyle = `rgba(255, 232, 138, ${0.4 + 0.25 * Math.sin(t * 2.5)})`;
      drawFourPointStar(ctx, cx, top + h * 0.3, 5, 2, t * 0.5);
      ctx.fill();
    } else {
      // Domed closed lid
      ctx.fillStyle = '#a86432';
      roundedRectPath(ctx, left - 1, top, w + 2, h * 0.44, 5);
      ctx.fill();
      ctx.fillStyle = '#ebb854';
      ctx.fillRect(left - 1, top + h * 0.36, w + 2, 3.5);
      ctx.fillRect(left + 4, top, 4, h * 0.4);
      ctx.fillRect(left + w - 8, top, 4, h * 0.4);
      // Golden lock clasp
      ctx.fillStyle = '#ffe580';
      roundedRectPath(ctx, cx - 4, top + h * 0.28, 8, 9, 2);
      ctx.fill();
      ctx.fillStyle = '#4a2b12';
      ctx.fillRect(cx - 1, top + h * 0.38, 2, 4);
    }
  }

  private drawSignpost(
    ctx: CanvasRenderingContext2D,
    cx: number,
    baseY: number,
    tileSize: number,
    t: number,
  ): void {
    drawContactShadow(ctx, cx, baseY - 3, tileSize * 0.34, 5, 0.34);

    // Timber post
    ctx.fillStyle = '#6b4425';
    ctx.fillRect(cx - 3.5, baseY - tileSize * 0.56, 7, tileSize * 0.52);

    // Beveled oak signboard
    const boardW = tileSize * 0.72;
    const boardH = tileSize * 0.34;
    const bx = cx - boardW * 0.5;
    const by = baseY - tileSize * 0.72;
    ctx.fillStyle = '#9c6b3b';
    roundedRectPath(ctx, bx, by, boardW, boardH, 4);
    ctx.fill();
    ctx.fillStyle = '#c48f56';
    roundedRectPath(ctx, bx + 2, by + 2, boardW - 4, boardH - 4, 3);
    ctx.fill();

    // Carved text lines
    ctx.fillStyle = '#573619';
    ctx.fillRect(bx + 6, by + 5.5, boardW - 14, 2.2);
    ctx.fillRect(bx + 6, by + 10, boardW - 18, 2.2);

    // Swinging mini amber lantern on right hook
    const sway = Math.sin(t * 2.4) * 1.4;
    ctx.fillStyle = '#ffd978';
    ctx.fillRect(bx + boardW - 3 + sway, by + boardH * 0.35, 6, 7);
    ctx.fillStyle = '#fff9d6';
    ctx.fillRect(bx + boardW - 1.5 + sway, by + boardH * 0.35 + 1.5, 3, 4);
  }

  private drawStarfallNode(
    ctx: CanvasRenderingContext2D,
    cx: number,
    baseY: number,
    tileSize: number,
    emissiveHex: string,
    t: number,
  ): void {
    const cy = baseY - tileSize * 0.36;
    const glowRgb = hexToRgb255(emissiveHex || '#fff08a');
    const coreCol = rgb255ToStr(mixRgb(glowRgb, [255, 240, 138], 0.5));

    // Crater rim
    fillEllipse(ctx, cx, baseY - 6, tileSize * 0.38, tileSize * 0.16, '#484366');
    fillEllipse(ctx, cx, baseY - 7, tileSize * 0.27, tileSize * 0.11, '#2a2542');

    // Pulsing star aura
    const pulse = 0.8 + 0.2 * Math.sin(t * 3.4);
    fillEllipse(ctx, cx, cy, 16 * pulse, 16 * pulse, rgb255ToStr(glowRgb, 0.25));

    // Floating rotating four-point starlight crystal
    const floatY = cy + Math.sin(t * 2.6) * 3.5;
    ctx.save();
    ctx.translate(cx, floatY);
    ctx.rotate(t * 0.4);
    ctx.fillStyle = coreCol;
    drawFourPointStar(ctx, 0, 0, 14 * pulse, 5.2 * pulse, 0);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    drawFourPointStar(ctx, 0, 0, 6.5, 2.4, 0);
    ctx.fill();
    ctx.restore();
  }

  private drawDock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    t: number,
  ): void {
    // Timber support pilings with subtle water foam collars
    const posts: Array<[number, number]> = [
      [x + 6, y + 6],
      [x + w - 12, y + 6],
      [x + 6, y + h - 10],
      [x + w - 12, y + h - 10],
    ];
    for (const [px, py] of posts) {
      fillEllipse(ctx, px + 3, py + 9, 7, 2.5, 'rgba(220, 246, 255, 0.45)');
      ctx.fillStyle = '#52341e';
      ctx.fillRect(px, py - 4, 6, 13);
    }

    // Weathered timber dock planks
    ctx.fillStyle = '#8f5e36';
    roundedRectPath(ctx, x + 2, y + 2, w - 4, h - 6, 3);
    ctx.fill();
    ctx.strokeStyle = '#472b16';
    ctx.lineWidth = 1.4;
    for (let py = y + 8; py < y + h - 6; py += 9) {
      ctx.beginPath();
      ctx.moveTo(x + 3, py);
      ctx.lineTo(x + w - 3, py);
      ctx.stroke();
    }

    // Harbor lantern post on pier corner
    const lx = x + w - 10;
    const ly = y + 4;
    ctx.fillStyle = '#38405a';
    ctx.fillRect(lx - 1.5, ly - 18, 3, 18);
    ctx.fillStyle = `rgba(255, 224, 128, ${0.85 + 0.15 * Math.sin(t * 3.5)})`;
    ctx.fillRect(lx - 4, ly - 22, 8, 7);
  }
}
