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
  hexToRgb01,
  hexToRgb255,
  rgb255ToStr,
  shadeRgb,
  strokeEllipse,
  type LightCandidate,
  type ViewTileBounds,
} from './AutotileRenderer';

export const READINESS_COLORS: Record<
  ReadinessTier,
  {
    hex: string;
    softHex: string;
    fillActive: string;
    fillDim: string;
    ringActive: string;
    ringDim: string;
    innerActive: string;
    innerDim: string;
    outerWarning: string;
    pip: string;
    pulseSpeed: number;
    lineWidth: number;
    isWarning: boolean;
  }
> = {
  favored: {
    hex: '#22c55e',
    softHex: '#86efac',
    fillActive: 'rgba(34, 197, 94, 0.18)',
    fillDim: 'rgba(34, 197, 94, 0.09)',
    ringActive: 'rgba(52, 211, 153, 0.76)',
    ringDim: 'rgba(52, 211, 153, 0.30)',
    innerActive: 'rgba(134, 239, 172, 0.42)',
    innerDim: 'rgba(134, 239, 172, 0.16)',
    outerWarning: 'rgba(103, 232, 249, 0.20)',
    pip: 'rgba(134, 239, 172, 0.90)',
    pulseSpeed: 4.5,
    lineWidth: 1.6,
    isWarning: false,
  },
  balanced: {
    hex: '#38bdf8',
    softHex: '#bae6fd',
    fillActive: 'rgba(56, 189, 248, 0.19)',
    fillDim: 'rgba(56, 189, 248, 0.09)',
    ringActive: 'rgba(56, 189, 248, 0.80)',
    ringDim: 'rgba(56, 189, 248, 0.32)',
    innerActive: 'rgba(253, 224, 71, 0.42)',
    innerDim: 'rgba(186, 230, 253, 0.18)',
    outerWarning: 'rgba(253, 224, 71, 0.24)',
    pip: 'rgba(186, 230, 253, 0.92)',
    pulseSpeed: 5.2,
    lineWidth: 1.7,
    isWarning: false,
  },
  challenging: {
    hex: '#f59e0b',
    softHex: '#fde68a',
    fillActive: 'rgba(245, 158, 11, 0.24)',
    fillDim: 'rgba(245, 158, 11, 0.12)',
    ringActive: 'rgba(245, 158, 11, 0.92)',
    ringDim: 'rgba(245, 158, 11, 0.42)',
    innerActive: 'rgba(253, 224, 71, 0.62)',
    innerDim: 'rgba(253, 230, 138, 0.24)',
    outerWarning: 'rgba(253, 224, 71, 0.42)',
    pip: 'rgba(254, 240, 138, 0.98)',
    pulseSpeed: 7.2,
    lineWidth: 2.1,
    isWarning: true,
  },
  danger: {
    hex: '#fb7185',
    softHex: '#fda4af',
    fillActive: 'rgba(239, 68, 68, 0.28)',
    fillDim: 'rgba(239, 68, 68, 0.14)',
    ringActive: 'rgba(251, 113, 133, 0.96)',
    ringDim: 'rgba(251, 113, 133, 0.46)',
    innerActive: 'rgba(254, 205, 211, 0.72)',
    innerDim: 'rgba(252, 165, 165, 0.28)',
    outerWarning: 'rgba(239, 68, 68, 0.56)',
    pip: 'rgba(255, 241, 242, 1.0)',
    pulseSpeed: 9.5,
    lineWidth: 2.35,
    isWarning: true,
  },
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
  const wave = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * pal.pulseSpeed);
  const pulse = reducedMotion ? 1 : (pal.isWarning ? 0.92 + 0.11 * wave : 0.95 + 0.05 * wave);

  fillEllipse(ctx, cx, cy, rx * 1.08 * pulse, ry * 1.08 * pulse, dimmed ? pal.fillDim : pal.fillActive);
  strokeEllipse(
    ctx,
    cx,
    cy,
    rx * pulse,
    ry * pulse,
    dimmed ? pal.ringDim : pal.ringActive,
    dimmed ? 1.3 : pal.lineWidth,
  );
  strokeEllipse(ctx, cx, cy, rx * 0.80, ry * 0.80, dimmed ? pal.innerDim : pal.innerActive, 1.0);

  // V1-parity outer pulsing threat warning ring for 'challenging' & 'danger' tiers
  if (!dimmed && pal.isWarning) {
    const outerGrow = tier === 'danger' ? 1.24 + wave * 0.14 : 1.17 + wave * 0.08;
    strokeEllipse(
      ctx,
      cx,
      cy,
      rx * outerGrow,
      ry * outerGrow,
      pal.outerWarning,
      tier === 'danger' ? 1.55 : 1.15,
    );
  }

  if (!dimmed) {
    ctx.fillStyle = pal.pip;
    const pipSize = pal.isWarning ? 4 : 3;
    const spinSpeed = pal.isWarning ? (tier === 'danger' ? 1.9 : 1.4) : 0.85;
    for (let i = 0; i < 4; i++) {
      const ang = (reducedMotion ? 0 : t * spinSpeed) + (i * Math.PI) / 2;
      const px = Math.round(cx + Math.cos(ang) * rx * pulse) - (pipSize >> 1);
      const py = Math.round(cy + Math.sin(ang) * ry * pulse) - (pipSize >> 1);
      ctx.fillRect(px, py, pipSize, pipSize);
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
  private cachedLandmarkRef: OverworldLandmarkNode[] | null = null;
  private cachedLandmarkCols = 0;
  private cachedLandmarkIndices = new Set<number>();

  /**
   * Returns tile keys occupied by landmarks so AutotileRenderer does not double-draw
   * overlapping tile props (e.g. Great Tree at 9,3).
   */
  getLandmarkTileKeys(state: OverworldSceneState): Set<string> {
    const keys = new Set<string>();
    for (let i = 0; i < state.landmarks.length; i++) {
      const lm = state.landmarks[i];
      keys.add(`${lm.x},${lm.y}`);
    }
    return keys;
  }

  /**
   * Cached numeric tile index set (`ty * cols + tx`) for zero-allocation O(1) lookup per frame.
   */
  getLandmarkTileIndices(state: OverworldSceneState): ReadonlySet<number> {
    if (this.cachedLandmarkRef === state.landmarks && this.cachedLandmarkCols === state.cols) {
      return this.cachedLandmarkIndices;
    }
    this.cachedLandmarkRef = state.landmarks;
    this.cachedLandmarkCols = state.cols;
    this.cachedLandmarkIndices.clear();
    for (let i = 0; i < state.landmarks.length; i++) {
      const lm = state.landmarks[i];
      this.cachedLandmarkIndices.add(lm.y * state.cols + lm.x);
    }
    return this.cachedLandmarkIndices;
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

    for (let i = 0; i < shrines.length; i++) {
      const shrine = shrines[i];
      if (!isInBounds(shrine.x, shrine.y, bounds, 1)) continue;
      const regionId = shrine.cleared ? 'shrine_cleared' : 'shrine_open';
      const dw = Math.round(tileSize * 1.62);
      const dh = dw;
      const dx = Math.round((shrine.x + 0.5) * tileSize - dw * 0.5);
      const dy = Math.round((shrine.y + 0.94) * tileSize - dh);
      outSprites.push(
        buildSpriteCmd(manifest, 'props', regionId, dx, dy, dw, dh, {
          emissive: shrine.cleared ? 0.25 : 0.48,
          depth: (shrine.y + 0.92) * tileSize,
        }),
      );
    }

    for (let i = 0; i < chests.length; i++) {
      const chest = chests[i];
      if (!isInBounds(chest.x, chest.y, bounds, 1)) continue;
      const regionId = chest.opened ? 'chest_open' : 'chest_closed';
      const dw = Math.round(tileSize * 1.18);
      const dh = dw;
      const dx = Math.round((chest.x + 0.5) * tileSize - dw * 0.5);
      const dy = Math.round((chest.y + 0.92) * tileSize - dh);
      outSprites.push(
        buildSpriteCmd(manifest, 'props', regionId, dx, dy, dw, dh, {
          emissive: chest.opened ? 0 : 0.24,
          depth: (chest.y + 0.88) * tileSize,
        }),
      );
    }

    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!isInBounds(lm.x, lm.y, bounds, 1)) continue;
      const { regionId, sizeTiles } = resolveLandmarkPropRegion(lm);
      const dw = Math.round(tileSize * sizeTiles);
      const dh = dw;
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

    for (let i = 0; i < shrines.length; i++) {
      const sh = shrines[i];
      if (!isInBounds(sh.x, sh.y, bounds, 4)) continue;
      const pal = TYPE_PALETTES[sh.elementalType] ?? TYPE_PALETTES.normal;
      push(
        `shrine-${sh.id}`,
        sh.x,
        sh.y,
        tileSize * (sh.cleared ? 3.8 : 4.6),
        [pal.rgb[0], pal.rgb[1], pal.rgb[2]],
        sh.cleared ? 0.95 : 1.32,
        2.6,
        0.1,
      );
    }

    for (let i = 0; i < chests.length; i++) {
      const ch = chests[i];
      if (ch.opened || !isInBounds(ch.x, ch.y, bounds, 3)) continue;
      push(
        `chest-${ch.id}`,
        ch.x,
        ch.y,
        tileSize * 2.8,
        [1.0, 0.85, 0.42],
        0.92,
        2.3,
        0.11,
      );
    }

    for (let i = 0; i < discoveryNodes.length; i++) {
      const disc = discoveryNodes[i];
      if (!isInBounds(disc.x, disc.y, bounds, 3)) continue;
      push(
        `discovery-${disc.id}`,
        disc.x,
        disc.y,
        tileSize * 2.1,
        hexToRgb01(disc.accentHex || '#fde047'),
        0.64,
        3.2,
        0.12,
      );
    }

    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!isInBounds(lm.x, lm.y, bounds, 3)) continue;
      const color =
        lm.kind === 'observatory'
          ? ([0.55, 0.78, 1.0] as [number, number, number])
          : hexToRgb01(lm.accentHex || '#ffd479');
      push(
        `landmark-${lm.id}`,
        lm.x,
        lm.y,
        tileSize * (lm.kind === 'observatory' ? 3.8 : 2.8),
        color,
        lm.kind === 'observatory' ? 0.98 : 0.7,
        2.0,
        0.08,
      );
    }
  }

  /**
   * Renders ground-plane node visuals: BFS stepping stones, shrine readiness aura rings,
   * pixel-stepped oval shadows, jewel-faceted discovery crystals, nearby interaction halo,
   * and procedural fallbacks when 'props' atlas is not attached.
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
    for (let i = 0; i < shrines.length; i++) {
      const sh = shrines[i];
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
      drawContactShadow(ctx, cx, baseY, tileSize * 0.48, 5.5, 0.36);
      if (!hasPropsAtlas) {
        this.drawFallbackShrine(ctx, sh, cx, baseY, tileSize, t);
      }
    }

    // 4. Chests: shadow (+ fallback)
    for (let i = 0; i < chests.length; i++) {
      const ch = chests[i];
      if (!isInBounds(ch.x, ch.y, bounds, 1)) continue;
      const cx = (ch.x + 0.5) * tileSize;
      const baseY = (ch.y + 0.9) * tileSize;
      drawContactShadow(ctx, cx, baseY, tileSize * 0.38, 4.2, 0.34);
      if (!hasPropsAtlas) {
        this.drawFallbackChest(ctx, ch, cx, baseY, tileSize);
      }
    }

    // 5. Landmarks: shadow (+ fallback)
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!isInBounds(lm.x, lm.y, bounds, 1)) continue;
      const cx = (lm.x + 0.5) * tileSize;
      const baseY = (lm.y + 0.9) * tileSize;
      drawContactShadow(ctx, cx, baseY, tileSize * 0.5, 5.8, 0.35);
      if (!hasPropsAtlas) {
        this.drawFallbackLandmark(ctx, lm, cx, baseY, tileSize);
      }
    }

    // 6. Discovery nodes: crisp jewel-faceted starlight crystal prisms (zero blown-out yellow blobs!)
    for (let i = 0; i < discoveryNodes.length; i++) {
      const disc = discoveryNodes[i];
      if (!isInBounds(disc.x, disc.y, bounds, 1)) continue;
      this.drawDiscoveryBeacon(ctx, disc, tileSize, elapsedSeconds, reducedMotion);
    }
  }

  /**
   * Renders post-sprite floating indicators: crisp chest glints, V1-parity bespoke landmark
   * animated crests, and chamfered celestial interaction emblem.
   */
  renderPostSpriteOverlays(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
  ): void {
    const { tileSize, chests, landmarks, nearbyInteraction, elapsedSeconds, reducedMotion } = state;
    const t = reducedMotion ? 0 : elapsedSeconds;
    ctx.imageSmoothingEnabled = false;

    // 1. Bespoke V1-parity landmark signature animated pixel crests & glints
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!isInBounds(lm.x, lm.y, bounds, 1)) continue;
      this.drawLandmarkCrestOverlay(ctx, lm, tileSize, t);
    }

    for (let i = 0; i < chests.length; i++) {
      const ch = chests[i];
      if (ch.opened || !isInBounds(ch.x, ch.y, bounds, 1)) continue;
      const cx = (ch.x + 0.5) * tileSize;
      const sy = (ch.y + 0.25) * tileSize + Math.sin(t * 3.1 + ch.x) * 2;
      const twinkle = 0.65 + 0.35 * Math.sin(t * 4.2 + ch.y);
      ctx.fillStyle = `rgba(255, 240, 138, ${twinkle.toFixed(2)})`;
      drawFourPointStar(ctx, cx, sy, 4.2, 1.5, t * 0.8);
      ctx.fill();
    }

    if (nearbyInteraction) {
      const cx = Math.round((nearbyInteraction.x + 0.5) * tileSize);
      const bob = reducedMotion ? 0 : Math.round(Math.sin(t * 4.2) * 2.5);
      const by = Math.round((nearbyInteraction.y - 0.52) * tileSize + bob);

      // Chamfered celestial brass pixel-diamond prompt emblem
      ctx.fillStyle = '#0c1026';
      ctx.fillRect(cx - 5, by - 8, 10, 16);
      ctx.fillRect(cx - 8, by - 5, 16, 10);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(cx - 4, by - 7, 8, 14);
      ctx.fillRect(cx - 7, by - 4, 14, 8);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(cx - 4, by - 7, 6, 2);
      ctx.fillStyle = '#15214d';
      ctx.fillRect(cx - 3, by - 5, 6, 10);
      ctx.fillRect(cx - 5, by - 3, 10, 6);

      ctx.fillStyle = '#fff5b8';
      drawFourPointStar(ctx, cx, by, 4.4, 1.6, t * 0.85);
      ctx.fill();
    }
  }

  /**
   * Emits restrained, crisp golden shimmer particles for unopened chests & active discovery nodes
   * (tight radii so discovery crystals stay sharp and never wash out into blurry blobs!).
   */
  emitNodeParticles(
    backend: IRenderBackend,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
  ): void {
    const { tileSize, chests, discoveryNodes, elapsedSeconds, reducedMotion } = state;
    const t = reducedMotion ? elapsedSeconds * 0.25 : elapsedSeconds;

    for (let i = 0; i < chests.length; i++) {
      const ch = chests[i];
      if (ch.opened || !isInBounds(ch.x, ch.y, bounds, 1)) continue;
      const cx = (ch.x + 0.5) * tileSize;
      const cy = (ch.y + 0.45) * tileSize - ((t * 10 + ch.x * 3) % 14);
      const alpha = 0.42 + 0.26 * Math.sin(t * 3.5 + ch.x + ch.y);
      backend.drawParticle({
        x: cx + Math.sin(t * 2 + ch.x) * 6,
        y: cy,
        radius: 3.8,
        color: [1.0, 0.88, 0.44, clamp(alpha, 0.14, 0.68)],
        softness: 0.72,
        additive: true,
      });
    }

    for (let i = 0; i < discoveryNodes.length; i++) {
      const disc = discoveryNodes[i];
      if (!isInBounds(disc.x, disc.y, bounds, 1)) continue;
      const [r, g, b] = hexToRgb01(disc.accentHex || '#fde047');
      const cx = (disc.x + 0.5) * tileSize;
      const cy = (disc.y + 0.52) * tileSize;
      // Subtle crisp rim halo rather than a giant washed-out yellow blob
      backend.drawParticle({
        x: cx,
        y: cy,
        radius: 5.5,
        color: [r, g, b, 0.28 + 0.14 * Math.sin(t * 3.4)],
        softness: 0.84,
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

    ctx.fillStyle = 'rgba(12, 18, 42, 0.90)';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 214, 120, 0.94)';
    ctx.lineWidth = 1.6;
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
        ctx.fillStyle = `rgba(18, 28, 64, ${(0.72 * wave).toFixed(2)})`;
        ctx.fillRect(cx - 4, cy - 4, 8, 8);
        ctx.fillStyle = `rgba(124, 232, 255, ${(0.9 * wave).toFixed(2)})`;
        ctx.fillRect(cx - 3, cy - 3, 6, 6);
        ctx.fillStyle = `rgba(255, 248, 198, ${(0.95 * wave).toFixed(2)})`;
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

  /**
   * V1-parity 3 distinct animated Discovery Node overlays (zero washed-out yellow blobs!):
   * - `starfall` / `starShard`: bobbing faceted cyan meteor crystal + pink cross glints
   * - `mystery_cry` / `berry`: luminous violet ellipse + rising golden/magenta pixel music notes
   * - `shimmer` / `potion` / `greatBall`: chamfered golden border + aurora corner glints + dancing star sparkles
   */
  private drawDiscoveryBeacon(
    ctx: CanvasRenderingContext2D,
    disc: OverworldDiscoveryNode,
    tileSize: number,
    elapsedSeconds: number,
    reducedMotion: boolean,
  ): void {
    const t = reducedMotion ? 0 : elapsedSeconds;
    const sx = Math.round(disc.x * tileSize);
    const sy = Math.round(disc.y * tileSize);
    const cx = sx + (tileSize >> 1);
    const baseY = Math.round((disc.y + 0.72) * tileSize);
    const pulse = reducedMotion ? 0.75 : 0.55 + 0.45 * Math.sin(t * 5.2 + disc.x);
    const aurora = reducedMotion ? 0.6 : 0.5 + 0.5 * Math.cos(t * 3.8 + disc.x * 0.7);
    const kindStr = String(disc.kind);

    // 1. Starfall Meteor Crystal (`starfall` / `starShard`)
    if (kindStr === 'starfall' || kindStr === 'starShard') {
      const bob = reducedMotion ? 0 : Math.round(Math.sin(t * 4.2 + disc.x) * 2.4);
      const cy = baseY - 10 + bob;

      drawContactShadow(ctx, cx, baseY + 3, 7.5, 3, 0.28);
      fillEllipse(ctx, cx, baseY + 1, 10.5, 5.2, `rgba(56, 189, 248, ${(0.14 + aurora * 0.12).toFixed(2)})`);
      strokeEllipse(
        ctx,
        cx,
        baseY + 1,
        10.5 + pulse * 1.4,
        5.0 + pulse * 0.6,
        `rgba(103, 232, 249, ${(0.55 + pulse * 0.35).toFixed(2)})`,
        1.5,
      );

      // 1px dark twilight-indigo crystal outline
      ctx.fillStyle = '#0c1330';
      ctx.fillRect(cx - 1, cy - 8, 2, 16);
      ctx.fillRect(cx - 3, cy - 6, 6, 12);
      ctx.fillRect(cx - 5, cy - 3, 10, 6);
      ctx.fillRect(cx - 6, cy - 1, 12, 2);

      // Multi-tone faceted cyan meteor prism
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(cx - 1, cy - 7, 2, 14);
      ctx.fillRect(cx - 3, cy - 4, 6, 8);
      ctx.fillRect(cx - 4, cy - 2, 8, 4);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(cx - 3, cy - 4, 4, 6);
      ctx.fillRect(cx - 1, cy - 6, 2, 10);
      ctx.fillStyle = '#a5f3fc';
      ctx.fillRect(cx - 2, cy - 4, 2, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 2, cy - 3, 2, 2);

      // Twin pink starlight cross glints (V1 starfall motif)
      ctx.fillStyle = '#f472b6';
      ctx.fillRect(sx + 5, sy + 7, 3, 1);
      ctx.fillRect(sx + 6, sy + 6, 1, 3);
      ctx.fillRect(sx + 23, sy + 20, 3, 1);
      ctx.fillRect(sx + 24, sy + 19, 1, 3);
      return;
    }

    // 2. Mystery Cry Musical Rustle (`mystery_cry` / `berry`)
    if (kindStr === 'mystery_cry' || kindStr === 'berry') {
      fillEllipse(ctx, cx, sy + 17, 11.5, 7.5, `rgba(192, 132, 252, ${(0.16 + aurora * 0.12).toFixed(2)})`);
      strokeEllipse(
        ctx,
        cx,
        sy + 17,
        10.5 + pulse * 1.4,
        7.2 + pulse * 0.9,
        `rgba(232, 121, 249, ${(0.58 + pulse * 0.36).toFixed(2)})`,
        1.6,
      );

      // Two floating pixel eighth-notes (gold & magenta)
      for (let i = 0; i < 2; i++) {
        const phase = t * 3.4 + i * 2.1 + disc.x;
        const nx = Math.round(sx + 9 + i * 10 + Math.sin(phase) * 2);
        const ny = Math.round(sy + 17 - (((phase * 0.55) % 1 + 1) % 1) * 11);
        ctx.fillStyle = '#120d28';
        ctx.fillRect(nx - 1, ny + 3, 6, 5);
        ctx.fillRect(nx + 2, ny - 3, 4, 9);
        ctx.fillRect(nx + 2, ny - 3, 7, 4);
        ctx.fillStyle = i === 0 ? '#fde047' : '#e879f9';
        ctx.fillRect(nx, ny + 4, 4, 3);
        ctx.fillRect(nx + 3, ny - 2, 2, 7);
        ctx.fillRect(nx + 3, ny - 2, 5, 2);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx + 6, sy + 22, 2, 2);
      ctx.fillRect(sx + 24, sy + 9, 2, 2);
      return;
    }

    // 3. Golden Shimmer Rustle (`shimmer` / `potion` / `greatBall`)
    const rgb = hexToRgb255(disc.accentHex || '#fde047');
    const hiRgb = shadeRgb(rgb, 1.2, 30);

    // Subtle aurora pad + crisp golden dashed frame corners (zero blurry yellow blob!)
    ctx.fillStyle = `rgba(103, 232, 249, ${(0.10 + aurora * 0.10).toFixed(2)})`;
    ctx.fillRect(sx + 4, sy + 4, tileSize - 8, tileSize - 8);

    const frameCol = rgb255ToStr(rgb, 0.58 + pulse * 0.36);
    ctx.fillStyle = frameCol;
    // Chamfered golden corner brackets
    ctx.fillRect(sx + 3, sy + 3, 8, 2);
    ctx.fillRect(sx + 3, sy + 3, 2, 8);
    ctx.fillRect(sx + tileSize - 11, sy + 3, 8, 2);
    ctx.fillRect(sx + tileSize - 5, sy + 3, 2, 8);
    ctx.fillRect(sx + 3, sy + tileSize - 5, 8, 2);
    ctx.fillRect(sx + 3, sy + tileSize - 11, 2, 8);
    ctx.fillRect(sx + tileSize - 11, sy + tileSize - 5, 8, 2);
    ctx.fillRect(sx + tileSize - 5, sy + tileSize - 11, 2, 8);

    // Aurora cyan corner glints
    ctx.fillStyle = `rgba(103, 232, 249, ${(0.55 + aurora * 0.4).toFixed(2)})`;
    ctx.fillRect(sx + 2, sy + 2, 3, 3);
    ctx.fillRect(sx + tileSize - 5, sy + 2, 3, 3);

    // 4 dancing multi-color pixel star sparkles
    const sparkCols = ['#fef08a', '#67e8f9', rgb255ToStr(hiRgb, 1), '#e879f9'];
    for (let i = 0; i < 4; i++) {
      const phase = t * 4.2 + i * 1.65 + disc.x;
      const rx = Math.round(sx + 7 + (((i * 6 + Math.sin(phase) * 4) % 18) + 18) % 18);
      const ry = Math.round(sy + 21 - Math.abs(Math.cos(phase * 1.15)) * 15);
      ctx.fillStyle = sparkCols[i];
      ctx.fillRect(rx - 1, ry, 3, 1);
      ctx.fillRect(rx, ry - 1, 1, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rx, ry, 1, 1);
    }
  }

  /**
   * Bespoke V1-parity animated pixel accents giving each of the 20 island landmarks
   * its unmistakable signature motif (telescope glint, orrery orbital rings, chrono clock hands,
   * pearl orb, rift ring, caldera ember core, Terastal prismatic flare, etc.).
   */
  private drawLandmarkCrestOverlay(
    ctx: CanvasRenderingContext2D,
    lm: OverworldLandmarkNode,
    tileSize: number,
    t: number,
  ): void {
    const cx = Math.round((lm.x + 0.5) * tileSize);
    const cy = Math.round((lm.y + 0.22) * tileSize);
    const pulse = 0.55 + 0.45 * Math.sin(t * 3.2 + lm.x * 0.7);
    const accent = lm.accentHex || '#fde047';

    if (lm.id === 'landmark_astral_orrery' || lm.id === 'landmark_rift_nexus') {
      const isRift = lm.id === 'landmark_rift_nexus';
      strokeEllipse(
        ctx,
        cx,
        cy - 4,
        13,
        5,
        isRift ? 'rgba(56, 189, 248, 0.72)' : 'rgba(253, 224, 71, 0.78)',
        1.2,
      );
      const ang = t * 1.6 + lm.x;
      const ox = Math.round(cx + Math.cos(ang) * 13);
      const oy = Math.round(cy - 4 + Math.sin(ang) * 5);
      ctx.fillStyle = isRift ? '#e879f9' : '#67e8f9';
      ctx.fillRect(ox - 1, oy - 1, 3, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox, oy, 1, 1);
    } else if (lm.id === 'landmark_chrono_sundial' || lm.id === 'landmark_astral_sundial') {
      strokeEllipse(ctx, cx, cy - 2, 8, 8, 'rgba(253, 224, 71, 0.68)', 1.2);
      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(cx - 1, cy - 7, 2, 6);
      ctx.fillRect(cx, cy - 2, 5, 2);
    } else if (lm.id === 'landmark_great_tree' || lm.id === 'landmark_sakura_arbor') {
      const isSakura = lm.id === 'landmark_sakura_arbor';
      for (let k = 0; k < 2; k++) {
        const ang = t * 1.4 + k * Math.PI + lm.y;
        const px = Math.round(cx + Math.cos(ang) * 14);
        const py = Math.round(cy - 6 + Math.sin(ang * 1.3) * 5);
        ctx.fillStyle = isSakura ? '#fbcfe8' : '#fef08a';
        ctx.fillRect(px, py, 3, 2);
      }
    } else if (lm.id === 'landmark_pearl_trench' || lm.id === 'landmark_coral_arch') {
      fillEllipse(ctx, cx, cy - 2, 4, 4, `rgba(248, 250, 252, ${(0.55 + pulse * 0.4).toFixed(2)})`);
      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(cx - 1, cy - 3, 2, 2);
    } else if (lm.id === 'landmark_crater_tera_core') {
      ctx.fillStyle = `rgba(244, 114, 182, ${(0.65 + pulse * 0.35).toFixed(2)})`;
      ctx.fillRect(cx - 6, cy - 5, 3, 5);
      ctx.fillStyle = `rgba(254, 240, 138, ${(0.65 + pulse * 0.35).toFixed(2)})`;
      ctx.fillRect(cx + 4, cy - 5, 3, 5);
      ctx.fillStyle = '#ffffff';
      drawFourPointStar(ctx, cx, cy - 8, 4.5, 1.4, t * 0.9);
      ctx.fill();
    } else if (lm.kind === 'observatory' || lm.id === 'landmark_telescope') {
      ctx.fillStyle = `rgba(255, 250, 210, ${(0.5 + pulse * 0.48).toFixed(2)})`;
      drawFourPointStar(ctx, cx + 6, cy - 12, 4.2, 1.3, t * 0.6);
      ctx.fill();
    } else {
      // Crisp floating starlight crest glint tinted with each monument's accent
      const rgb = hexToRgb255(accent);
      ctx.fillStyle = rgb255ToStr(rgb, 0.55 + pulse * 0.4);
      drawFourPointStar(ctx, cx, cy - 10, 3.8, 1.2, t * 0.7);
      ctx.fill();
    }
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
