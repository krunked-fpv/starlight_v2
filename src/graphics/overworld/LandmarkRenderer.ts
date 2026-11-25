import type {
  AtlasManifest,
  IRenderBackend,
  OverworldChestNode,
  OverworldDiscoveryNode,
  OverworldLandmarkNode,
  OverworldSceneState,
  OverworldShrineNode,
  ReadinessTier,
  SpriteDrawCmd,
} from '../../contracts';
import { TYPE_PALETTES } from '../../core/data/typePalettes';
import {
  buildSpriteCmd,
  clamp,
  drawContactShadow,
  drawFourPointStar,
  fillEllipse,
  hexRgba,
  hexToRgb01,
  hexToRgb255,
  rgb255ToStr,
  strokeEllipse,
  type LightCandidate,
  type ViewTileBounds,
} from './AutotileRenderer';

export const READINESS_COLORS: Record<ReadinessTier, { hex: string; softHex: string }> = {
  favored: { hex: '#22c55e', softHex: '#86efac' },
  balanced: { hex: '#38bdf8', softHex: '#bae6fd' },
  challenging: { hex: '#f59e0b', softHex: '#fde68a' },
  danger: { hex: '#ef4444', softHex: '#fca5a5' },
};

export function drawReadinessAuraRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  tier: ReadinessTier,
  t: number,
  reducedMotion: boolean,
  dimmed = false,
): void {
  const pal = READINESS_COLORS[tier] ?? READINESS_COLORS.balanced;
  const pulse = reducedMotion ? 1 : 0.94 + 0.06 * Math.sin(t * 3.2);
  const alphaBase = dimmed ? 0.34 : 0.82;

  fillEllipse(ctx, cx, cy, rx * 1.08 * pulse, ry * 1.08 * pulse, hexRgba(pal.hex, dimmed ? 0.1 : 0.2));
  strokeEllipse(ctx, cx, cy, rx * pulse, ry * pulse, hexRgba(pal.hex, alphaBase), dimmed ? 1.3 : 2.0);
  strokeEllipse(ctx, cx, cy, rx * 0.82, ry * 0.82, hexRgba(pal.softHex, alphaBase * 0.55), 1.0);

  if (!dimmed) {
    // 4 crisp pixel beacon pips around ring perimeter
    ctx.fillStyle = hexRgba(pal.softHex, 0.92);
    for (let i = 0; i < 4; i++) {
      const ang = (reducedMotion ? 0 : t * 0.9) + (i * Math.PI) / 2;
      const px = Math.round(cx + Math.cos(ang) * rx * pulse) - 1;
      const py = Math.round(cy + Math.sin(ang) * ry * pulse) - 1;
      ctx.fillRect(px, py, 3, 3);
    }
  }
}

export function resolveLandmarkPropRegion(lm: OverworldLandmarkNode): {
  regionId: string;
  sizeTiles: number;
} {
  if (lm.kind === 'observatory') {
    return { regionId: 'landmark_observatory', sizeTiles: 1.75 };
  }
  if (lm.kind === 'cottage') {
    return { regionId: 'cottage_violet', sizeTiles: 2.5 };
  }
  if (lm.kind === 'lab') {
    return { regionId: 'cottage_lab', sizeTiles: 2.5 };
  }
  if (lm.kind === 'fountain') {
    return { regionId: 'fountain', sizeTiles: 1.45 };
  }
  if (lm.id === 'landmark_great_tree') {
    return { regionId: 'tree_oak', sizeTiles: 1.92 };
  }
  if (lm.id === 'landmark_sakura_arbor') {
    return { regionId: 'tree_sakura', sizeTiles: 1.75 };
  }
  if (lm.id === 'landmark_glowspore_lantern') {
    return { regionId: 'prop_mushroom', sizeTiles: 1.7 };
  }
  if (
    lm.id === 'landmark_rift_nexus' ||
    lm.id === 'landmark_crater_tera_core' ||
    lm.id === 'landmark_coral_arch' ||
    lm.id === 'landmark_pearl_trench'
  ) {
    return { regionId: 'prop_crystal', sizeTiles: 1.68 };
  }
  return { regionId: 'landmark_obelisk', sizeTiles: 1.68 };
}

function isInBounds(x: number, y: number, bounds: ViewTileBounds, pad = 2): boolean {
  return (
    x >= bounds.minTx - pad &&
    x <= bounds.maxTx + pad &&
    y >= bounds.minTy - pad &&
    y <= bounds.maxTy + pad
  );
}

export class LandmarkRenderer {
  /**
   * Returns tile keys occupied by landmarks so AutotileRenderer does not double-draw
   * overlapping tile props (e.g. Great Tree at 9,3).
   */
  getLandmarkTileKeys(state: OverworldSceneState): Set<string> {
    const keys = new Set<string>();
    for (const lm of state.landmarks) {
      keys.add(`${lm.x},${lm.y}`);
    }
    return keys;
  }

  /**
   * Collects Y-sorted SpriteDrawCmds from sheet 'props' for all visible shrines,
   * chests, and named landmarks.
   */
  collectSprites(
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    manifest: AtlasManifest | null,
    outSprites: SpriteDrawCmd[],
  ): void {
    const { tileSize, shrines, chests, landmarks } = state;

    for (const shrine of shrines) {
      if (!isInBounds(shrine.x, shrine.y, bounds, 1)) continue;
      const regionId = shrine.cleared ? 'shrine_cleared' : 'shrine_open';
      const dw = Math.round(tileSize * 1.62);
      const dh = Math.round(tileSize * 1.62);
      const dx = Math.round((shrine.x + 0.5) * tileSize - dw * 0.5);
      const dy = Math.round((shrine.y + 0.94) * tileSize - dh);
      outSprites.push(
        buildSpriteCmd(manifest, 'props', regionId, dx, dy, dw, dh, {
          emissive: shrine.cleared ? 0.25 : 0.48,
          depth: (shrine.y + 0.92) * tileSize,
        }),
      );
    }

    for (const chest of chests) {
      if (!isInBounds(chest.x, chest.y, bounds, 1)) continue;
      const regionId = chest.opened ? 'chest_open' : 'chest_closed';
      const dw = Math.round(tileSize * 1.18);
      const dh = Math.round(tileSize * 1.18);
      const dx = Math.round((chest.x + 0.5) * tileSize - dw * 0.5);
      const dy = Math.round((chest.y + 0.92) * tileSize - dh);
      outSprites.push(
        buildSpriteCmd(manifest, 'props', regionId, dx, dy, dw, dh, {
          emissive: chest.opened ? 0 : 0.24,
          depth: (chest.y + 0.88) * tileSize,
        }),
      );
    }

    for (const lm of landmarks) {
      if (!isInBounds(lm.x, lm.y, bounds, 1)) continue;
      const { regionId, sizeTiles } = resolveLandmarkPropRegion(lm);
      const dw = Math.round(tileSize * sizeTiles);
      const dh = Math.round(tileSize * sizeTiles);
      const dx = Math.round((lm.x + 0.5) * tileSize - dw * 0.5);
      const dy = Math.round((lm.y + 0.94) * tileSize - dh);
      outSprites.push(
        buildSpriteCmd(manifest, 'props', regionId, dx, dy, dw, dh, {
          emissive: lm.kind === 'observatory' || regionId === 'prop_crystal' ? 0.25 : 0.12,
          depth: (lm.y + 0.91) * tileSize,
        }),
      );
    }
  }

  /**
   * Collects candidate PointLights for shrines, unopened chests, discovery nodes, and landmarks.
   */
  collectLights(
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    camCenterX: number,
    camCenterY: number,
    out: LightCandidate[],
  ): void {
    const { tileSize, timeOfDay, shrines, chests, discoveryNodes, landmarks } = state;
    const twilightBoost = 0.85 + 0.35 * clamp(Math.abs(timeOfDay - 0.5) * 2, 0, 1);

    const push = (
      id: string,
      tx: number,
      ty: number,
      radius: number,
      color: [number, number, number],
      intensity: number,
      flickerSpeed: number,
      flickerAmount: number,
    ) => {
      const wx = (tx + 0.5) * tileSize;
      const wy = (ty + 0.45) * tileSize;
      const dx = wx - camCenterX;
      const dy = wy - camCenterY;
      out.push({
        distSq: dx * dx + dy * dy,
        light: {
          id,
          x: wx,
          y: wy,
          radius,
          color,
          intensity: intensity * twilightBoost,
          flickerSpeed,
          flickerAmount,
        },
      });
    };

    for (const sh of shrines) {
      if (!isInBounds(sh.x, sh.y, bounds, 4)) continue;
      const pal = TYPE_PALETTES[sh.elementalType] ?? TYPE_PALETTES.normal;
      push(
        `shrine-${sh.id}`,
        sh.x,
        sh.y,
        tileSize * (sh.cleared ? 3.8 : 4.6),
        [...pal.rgb],
        sh.cleared ? 0.95 : 1.32,
        2.6,
        0.1,
      );
    }

    for (const ch of chests) {
      if (ch.opened || !isInBounds(ch.x, ch.y, bounds, 3)) continue;
      push(
        `chest-${ch.id}`,
        ch.x,
        ch.y,
        tileSize * 2.8,
        [1.0, 0.85, 0.42],
        0.96,
        2.3,
        0.11,
      );
    }

    for (const disc of discoveryNodes) {
      if (!isInBounds(disc.x, disc.y, bounds, 3)) continue;
      push(
        `discovery-${disc.id}`,
        disc.x,
        disc.y,
        tileSize * 2.6,
        hexToRgb01(disc.accentHex || '#fde047'),
        0.92,
        3.2,
        0.14,
      );
    }

    for (const lm of landmarks) {
      if (!isInBounds(lm.x, lm.y, bounds, 3)) continue;
      const color =
        lm.kind === 'observatory'
          ? ([0.55, 0.78, 1.0] as [number, number, number])
          : hexToRgb01(lm.accentHex || '#ffd479');
      push(
        `landmark-${lm.id}`,
        lm.x,
        lm.y,
        tileSize * (lm.kind === 'observatory' ? 4.0 : 3.0),
        color,
        lm.kind === 'observatory' ? 1.12 : 0.82,
        2.0,
        0.08,
      );
    }
  }

  /**
   * Renders ground-plane node visuals: BFS stepping stones, shrine readiness aura rings,
   * contact shadows, discovery beacons, nearby interaction halo, and procedural fallbacks
   * when 'props' atlas is not attached.
   */
  renderGroundOverlays(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    hasPropsAtlas: boolean,
  ): void {
    const { tileSize, shrines, chests, landmarks, discoveryNodes, bfsPath, elapsedSeconds, reducedMotion } = state;
    const t = reducedMotion ? 0 : elapsedSeconds;
    ctx.imageSmoothingEnabled = false;

    // 1. BFS tap-to-move glowing starlight stepping stones
    if (bfsPath.length > 0) {
      this.renderBfsSteppingStones(ctx, bfsPath, tileSize, elapsedSeconds, reducedMotion);
    }

    // 2. Nearby interaction ground halo
    if (state.nearbyInteraction) {
      this.renderInteractionHalo(ctx, state, t);
    }

    // 3. Shrines: readiness aura ring + shadow (+ procedural fallback if no atlas)
    for (const sh of shrines) {
      if (!isInBounds(sh.x, sh.y, bounds, 1)) continue;
      const cx = (sh.x + 0.5) * tileSize;
      const baseY = (sh.y + 0.9) * tileSize;
      drawReadinessAuraRing(
        ctx,
        cx,
        baseY - 2,
        tileSize * 0.62,
        tileSize * 0.28,
        sh.readinessTier,
        t,
        reducedMotion,
        sh.cleared,
      );
      drawContactShadow(ctx, cx, baseY, tileSize * 0.48, 6, 0.36);
      if (!hasPropsAtlas) {
        this.drawFallbackShrine(ctx, sh, cx, baseY, tileSize, t);
      }
    }

    // 4. Chests: shadow (+ fallback)
    for (const ch of chests) {
      if (!isInBounds(ch.x, ch.y, bounds, 1)) continue;
      const cx = (ch.x + 0.5) * tileSize;
      const baseY = (ch.y + 0.9) * tileSize;
      drawContactShadow(ctx, cx, baseY, tileSize * 0.38, 4.5, 0.34);
      if (!hasPropsAtlas) {
        this.drawFallbackChest(ctx, ch, cx, baseY, tileSize);
      }
    }

    // 5. Landmarks: shadow (+ fallback)
    for (const lm of landmarks) {
      if (!isInBounds(lm.x, lm.y, bounds, 1)) continue;
      const cx = (lm.x + 0.5) * tileSize;
      const baseY = (lm.y + 0.9) * tileSize;
      drawContactShadow(ctx, cx, baseY, tileSize * 0.5, 6, 0.35);
      if (!hasPropsAtlas) {
        this.drawFallbackLandmark(ctx, lm, cx, baseY, tileSize);
      }
    }

    // 6. Discovery nodes: pulsing starlight diamond beacons
    for (const disc of discoveryNodes) {
      if (!isInBounds(disc.x, disc.y, bounds, 1)) continue;
      this.drawDiscoveryBeacon(ctx, disc, tileSize, elapsedSeconds, reducedMotion);
    }
  }

  /**
   * Renders post-sprite floating indicators: chest glints & nearby interaction floating pixel badge.
   */
  renderPostSpriteOverlays(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
  ): void {
    const { tileSize, chests, nearbyInteraction, elapsedSeconds, reducedMotion } = state;
    const t = reducedMotion ? 0 : elapsedSeconds;
    ctx.imageSmoothingEnabled = false;

    for (const ch of chests) {
      if (ch.opened || !isInBounds(ch.x, ch.y, bounds, 1)) continue;
      const cx = (ch.x + 0.5) * tileSize;
      const sy = (ch.y + 0.25) * tileSize + Math.sin(t * 3.1 + ch.x) * 2;
      const twinkle = 0.65 + 0.35 * Math.sin(t * 4.2 + ch.y);
      ctx.fillStyle = `rgba(255, 240, 138, ${twinkle.toFixed(3)})`;
      drawFourPointStar(ctx, cx, sy, 4.5, 1.8, t * 0.8);
      ctx.fill();
    }

    if (nearbyInteraction) {
      const cx = (nearbyInteraction.x + 0.5) * tileSize;
      const bob = reducedMotion ? 0 : Math.round(Math.sin(t * 4.2) * 3);
      const by = (nearbyInteraction.y - 0.52) * tileSize + bob;

      ctx.save();
      ctx.fillStyle = 'rgba(12, 18, 42, 0.88)';
      ctx.fillRect(Math.round(cx - 8), Math.round(by - 8), 16, 16);
      ctx.strokeStyle = '#ffd479';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(Math.round(cx - 8), Math.round(by - 8), 16, 16);

      ctx.fillStyle = '#ffe58f';
      drawFourPointStar(ctx, cx, by, 5, 2, t * 0.9);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Emits soft golden shimmer particles for unopened chests & active discovery nodes.
   */
  emitNodeParticles(
    backend: IRenderBackend,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
  ): void {
    const { tileSize, chests, discoveryNodes, elapsedSeconds, reducedMotion } = state;
    const t = reducedMotion ? elapsedSeconds * 0.25 : elapsedSeconds;

    for (const ch of chests) {
      if (ch.opened || !isInBounds(ch.x, ch.y, bounds, 1)) continue;
      const cx = (ch.x + 0.5) * tileSize;
      const cy = (ch.y + 0.45) * tileSize - ((t * 10 + ch.x * 3) % 14);
      const alpha = 0.45 + 0.3 * Math.sin(t * 3.5 + ch.x + ch.y);
      backend.drawParticle({
        x: cx + Math.sin(t * 2 + ch.x) * 6,
        y: cy,
        radius: 4.5,
        color: [1.0, 0.88, 0.42, clamp(alpha, 0.15, 0.75)],
        softness: 0.72,
        additive: true,
      });
    }

    for (const disc of discoveryNodes) {
      if (!isInBounds(disc.x, disc.y, bounds, 1)) continue;
      const [r, g, b] = hexToRgb01(disc.accentHex || '#fde047');
      const cx = (disc.x + 0.5) * tileSize;
      const cy = (disc.y + 0.45) * tileSize;
      backend.drawParticle({
        x: cx,
        y: cy,
        radius: 10,
        color: [r, g, b, 0.42 + 0.2 * Math.sin(t * 3.8)],
        softness: 0.82,
        additive: true,
      });
    }
  }

  /**
   * Renders a crisp vector screen-edge compass arrow when compassTarget lies outside viewport.
   */
  renderCompassOverlay(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    camX: number,
    camY: number,
    camZoom: number,
    viewW: number,
    viewH: number,
  ): void {
    const target = state.compassTarget;
    if (!target) return;
    const { tileSize } = state;
    const wx = (target.x + 0.5) * tileSize;
    const wy = (target.y + 0.5) * tileSize;

    const sx = viewW * 0.5 + (wx - camX - viewW * 0.5) * camZoom;
    const sy = viewH * 0.5 + (wy - camY - viewH * 0.5) * camZoom;

    const marginX = 46;
    const marginTop = 74;
    const marginBottom = 64;
    if (sx >= marginX && sx <= viewW - marginX && sy >= marginTop && sy <= viewH - marginBottom) {
      return;
    }

    const cx = viewW * 0.5;
    const cy = viewH * 0.5;
    const dx = sx - cx;
    const dy = sy - cy;
    const angle = Math.atan2(dy, dx);
    const halfW = Math.max(40, cx - marginX);
    const halfHTop = Math.max(40, cy - marginTop);
    const halfHBottom = Math.max(40, viewH - marginBottom - cy);
    const halfH = dy < 0 ? halfHTop : halfHBottom;
    const scaleX = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : 1e6;
    const scaleY = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : 1e6;
    const k = Math.min(scaleX, scaleY, 1);
    const px = cx + dx * k;
    const py = cy + dy * k;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);

    ctx.fillStyle = 'rgba(14, 22, 48, 0.88)';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 214, 120, 0.92)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffd978';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-4, -5.5);
    ctx.lineTo(-1, 0);
    ctx.lineTo(-4, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private renderBfsSteppingStones(
    ctx: CanvasRenderingContext2D,
    bfsPath: Array<{ x: number; y: number }>,
    tileSize: number,
    elapsedSeconds: number,
    reducedMotion: boolean,
  ): void {
    const t = reducedMotion ? 0 : elapsedSeconds;
    for (let i = 0; i < bfsPath.length; i++) {
      const step = bfsPath[i];
      const cx = Math.round((step.x + 0.5) * tileSize);
      const cy = Math.round((step.y + 0.5) * tileSize);
      const wave = reducedMotion ? 0.8 : 0.55 + 0.45 * Math.sin(t * 5.2 - i * 0.55);
      const isLast = i === bfsPath.length - 1;

      if (isLast) {
        const ringR = tileSize * (0.36 + (reducedMotion ? 0 : 0.06 * Math.sin(t * 4.2)));
        strokeEllipse(ctx, cx, cy + 2, ringR, ringR * 0.52, 'rgba(124, 232, 255, 0.92)', 2.0);
        ctx.fillStyle = 'rgba(255, 232, 132, 0.95)';
        drawFourPointStar(ctx, cx, cy, 6, 2.2, t * 0.9);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(18, 28, 64, ${(0.72 * wave).toFixed(3)})`;
        ctx.fillRect(cx - 4, cy - 4, 8, 8);
        ctx.fillStyle = `rgba(124, 232, 255, ${(0.9 * wave).toFixed(3)})`;
        ctx.fillRect(cx - 3, cy - 3, 6, 6);
        ctx.fillStyle = `rgba(255, 248, 198, ${(0.95 * wave).toFixed(3)})`;
        ctx.fillRect(cx - 1, cy - 1, 2, 2);
      }
    }
  }

  private renderInteractionHalo(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    t: number,
  ): void {
    const target = state.nearbyInteraction;
    if (!target) return;
    const { tileSize } = state;
    const cx = (target.x + 0.5) * tileSize;
    const cy = (target.y + 0.78) * tileSize;
    const pulse = 0.92 + 0.08 * Math.sin(t * 4.5);

    strokeEllipse(ctx, cx, cy, tileSize * 0.56 * pulse, tileSize * 0.26 * pulse, 'rgba(255, 212, 121, 0.85)', 2.0);
    strokeEllipse(ctx, cx, cy, tileSize * 0.68 * pulse, tileSize * 0.32 * pulse, 'rgba(255, 255, 255, 0.38)', 1.2);
  }

  private drawDiscoveryBeacon(
    ctx: CanvasRenderingContext2D,
    disc: OverworldDiscoveryNode,
    tileSize: number,
    elapsedSeconds: number,
    reducedMotion: boolean,
  ): void {
    const t = reducedMotion ? 0 : elapsedSeconds;
    const cx = (disc.x + 0.5) * tileSize;
    const baseY = (disc.y + 0.68) * tileSize;
    const bob = reducedMotion ? 0 : Math.sin(t * 3.2 + disc.x) * 3;
    const rgb = hexToRgb255(disc.accentHex || '#fde047');

    fillEllipse(ctx, cx, baseY + 5, tileSize * 0.32, tileSize * 0.14, rgb255ToStr(rgb, 0.3));
    ctx.save();
    ctx.translate(cx, baseY - 4 + bob);
    ctx.fillStyle = rgb255ToStr(rgb, 0.96);
    drawFourPointStar(ctx, 0, 0, 9, 3.6, t * 0.7);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    drawFourPointStar(ctx, 0, 0, 4, 1.5, 0);
    ctx.fill();
    ctx.restore();
  }

  private drawFallbackShrine(
    ctx: CanvasRenderingContext2D,
    sh: OverworldShrineNode,
    cx: number,
    baseY: number,
    tileSize: number,
    t: number,
  ): void {
    const pal = TYPE_PALETTES[sh.elementalType] ?? TYPE_PALETTES.normal;
    ctx.fillStyle = '#5f6885';
    ctx.fillRect(Math.round(cx - 14), Math.round(baseY - 8), 28, 8);
    ctx.fillStyle = '#7e88a8';
    ctx.fillRect(Math.round(cx - 12), Math.round(baseY - 28), 6, 22);
    ctx.fillRect(Math.round(cx + 6), Math.round(baseY - 28), 6, 22);
    ctx.fillStyle = '#9aa6c9';
    ctx.fillRect(Math.round(cx - 15), Math.round(baseY - 32), 30, 6);
    ctx.fillStyle = sh.cleared ? pal.glow : pal.primary;
    const fy = Math.round(baseY - 19 + Math.sin(t * 2.5) * 2);
    ctx.fillRect(Math.round(cx - 4), fy - 5, 8, 10);
    void tileSize;
  }

  private drawFallbackChest(
    ctx: CanvasRenderingContext2D,
    ch: OverworldChestNode,
    cx: number,
    baseY: number,
    _tileSize: number,
  ): void {
    ctx.fillStyle = '#7d4924';
    ctx.fillRect(Math.round(cx - 10), Math.round(baseY - 12), 20, 12);
    ctx.fillStyle = ch.opened ? '#24140d' : '#a86432';
    ctx.fillRect(Math.round(cx - 11), Math.round(baseY - (ch.opened ? 18 : 17)), 22, 6);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(Math.round(cx - 2), Math.round(baseY - 13), 4, 4);
  }

  private drawFallbackLandmark(
    ctx: CanvasRenderingContext2D,
    lm: OverworldLandmarkNode,
    cx: number,
    baseY: number,
    _tileSize: number,
  ): void {
    if (lm.kind === 'observatory') {
      ctx.fillStyle = '#b4c2de';
      ctx.fillRect(Math.round(cx - 12), Math.round(baseY - 22), 24, 22);
      ctx.fillStyle = '#3c569c';
      ctx.fillRect(Math.round(cx - 11), Math.round(baseY - 34), 22, 13);
      return;
    }
    ctx.fillStyle = '#6d7594';
    ctx.fillRect(Math.round(cx - 8), Math.round(baseY - 34), 16, 34);
    ctx.fillStyle = lm.accentHex || '#ffd479';
    ctx.fillRect(Math.round(cx - 3), Math.round(baseY - 26), 6, 10);
  }
}
