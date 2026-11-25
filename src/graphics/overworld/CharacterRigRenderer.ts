import type {
  AtlasManifest,
  BodyArchetype,
  Direction,
  FootstepEffect,
  IRenderBackend,
  OverworldFollowerState,
  OverworldNpcNode,
  OverworldPlayerState,
  OverworldSceneState,
  PointLight,
  ResolvedTrainerLook,
  SpriteDrawCmd,
  TrainerAccessoryId,
  TrainerAuraId,
} from '../../contracts';
import { TYPE_PALETTES } from '../../core/data/typePalettes';
import { SpriteAssetLoader, getSpeciesEntry } from '../../core/dojo';
import {
  LIQUID_TILES,
  TALL_GRASS_TILES,
  buildSpriteCmd,
  clamp,
  drawContactShadow,
  drawFourPointStar,
  fillEllipse,
  hexRgba,
  hexToRgb01,
  hexToRgb255,
  mixRgb,
  strokeEllipse,
  type LightCandidate,
  type ViewTileBounds,
} from './AutotileRenderer';
import { drawReadinessAuraRing } from './LandmarkRenderer';
import { TILE } from '../../core/dojo';

interface MotionSample {
  x: number;
  y: number;
  stepAccum: number;
}

export const AURA_VISUALS: Record<
  TrainerAuraId,
  {
    primaryHex: string;
    secondaryHex: string;
    lightRgb: [number, number, number] | null;
    lightRadius: number;
    lightIntensity: number;
  }
> = {
  none: {
    primaryHex: '#94a3b8',
    secondaryHex: '#cbd5e1',
    lightRgb: null,
    lightRadius: 0,
    lightIntensity: 0,
  },
  stars: {
    primaryHex: '#fde047',
    secondaryHex: '#fef9c3',
    lightRgb: [1.0, 0.88, 0.34],
    lightRadius: 128,
    lightIntensity: 1.05,
  },
  hearts: {
    primaryHex: '#f472b6',
    secondaryHex: '#fbcfe8',
    lightRgb: [0.98, 0.48, 0.74],
    lightRadius: 120,
    lightIntensity: 0.98,
  },
  lightning: {
    primaryHex: '#38bdf8',
    secondaryHex: '#fef08a',
    lightRgb: [0.28, 0.78, 1.0],
    lightRadius: 136,
    lightIntensity: 1.12,
  },
  blossom: {
    primaryHex: '#fb7185',
    secondaryHex: '#fce7f3',
    lightRgb: [0.98, 0.52, 0.64],
    lightRadius: 122,
    lightIntensity: 0.96,
  },
  cosmic: {
    primaryHex: '#2dd4bf',
    secondaryHex: '#c084fc',
    lightRgb: [0.24, 0.88, 0.82],
    lightRadius: 138,
    lightIntensity: 1.1,
  },
};

function isInBounds(x: number, y: number, bounds: ViewTileBounds, pad = 2): boolean {
  return (
    x >= bounds.minTx - pad &&
    x <= bounds.maxTx + pad &&
    y >= bounds.minTy - pad &&
    y <= bounds.maxTy + pad
  );
}

export function resolveFallbackArchetypeRegion(
  manifest: AtlasManifest | null,
  archetype: BodyArchetype,
): string {
  const regions = manifest?.sheets?.fallbacks?.regions;
  if (!regions) {
    return archetype;
  }
  if (regions[archetype]) return archetype;
  const prefixed = `fallback_${archetype}`;
  if (regions[prefixed]) return prefixed;
  if (archetype === 'aquatic') {
    if (regions.winged) return 'winged';
    if (regions.quadruped) return 'quadruped';
  }
  return Object.keys(regions)[0] ?? archetype;
}

export function resolveCharacterRegion(
  manifest: AtlasManifest | null,
  trainerId: 'violet' | 'ozias',
  facing: Direction,
): string {
  const desired = `${trainerId}_${facing}`;
  const regions = manifest?.sheets?.characters?.regions;
  if (!regions) return desired;
  if (regions[desired]) return desired;
  const idle = `${trainerId}_idle`;
  if (regions[idle]) return idle;
  return desired;
}

function createScratchCanvas(w: number, h: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) ?? canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  } catch {
    return null;
  }
}

export class CharacterRigRenderer {
  private footsteps: FootstepEffect[] = [];
  private samples = new Map<string, MotionSample>();
  private backCosmeticCanvas: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
  private frontCosmeticCanvas: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

  resetEffects(): void {
    this.footsteps.length = 0;
    this.samples.clear();
  }

  getFootstepCount(): number {
    return this.footsteps.length;
  }

  /**
   * Tracks player and follower locomotion to spawn terrain-aware footsteps & grass dust/petal bursts.
   */
  update(state: OverworldSceneState, dtSeconds: number): void {
    const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);

    const track = (id: string, x: number, y: number, moving: boolean, isPlayer: boolean) => {
      const prev = this.samples.get(id);
      if (!prev) {
        this.samples.set(id, { x, y, stepAccum: 0 });
        return;
      }
      const dist = Math.hypot(x - prev.x, y - prev.y);
      if (dist > 0.002) {
        prev.stepAccum += dist;
      } else if (moving && dt > 0) {
        prev.stepAccum += dt * 1.4;
      }

      if (prev.stepAccum >= 0.45) {
        prev.stepAccum %= 0.45;
        this.spawnFootstep(state, x, y, isPlayer);
      }
      prev.x = x;
      prev.y = y;
    };

    track('player', state.player.x, state.player.y, state.player.moving, true);
    if (state.follower) {
      track('follower', state.follower.x, state.follower.y, state.follower.moving, false);
    }

    for (let i = this.footsteps.length - 1; i >= 0; i--) {
      this.footsteps[i].age += dt;
      if (this.footsteps[i].age >= this.footsteps[i].maxAge) {
        this.footsteps.splice(i, 1);
      }
    }
  }

  private spawnFootstep(
    state: OverworldSceneState,
    tileFloatX: number,
    tileFloatY: number,
    isPlayer: boolean,
  ): void {
    const { cols, rows, tileSize, worldMap, currentBiomeId, reducedMotion, player } = state;
    if (reducedMotion && this.footsteps.length >= 6) return;
    if (this.footsteps.length >= 48) {
      this.footsteps.shift();
    }

    const tx = clamp(Math.round(tileFloatX), 0, cols - 1);
    const ty = clamp(Math.round(tileFloatY), 0, rows - 1);
    const tileId = worldMap[ty]?.[tx] ?? TILE.GRASS;

    let kind: FootstepEffect['kind'] = 'dust';
    let colorHex = '#d8ccb2';
    let maxAge = 0.55;

    const aura = player.look.aura;
    if (LIQUID_TILES.has(tileId) || tileId === TILE.BRIDGE) {
      kind = 'ripple';
      colorHex = tileId === TILE.LAVA ? '#fb923c' : '#bceeff';
      maxAge = 0.72;
    } else if (isPlayer && aura !== 'none') {
      kind = aura === 'blossom' ? 'petal' : 'sparkle';
      colorHex = AURA_VISUALS[aura].primaryHex;
      maxAge = 0.65;
    } else if (
      tileId === TILE.FLOWER ||
      tileId === TILE.GROVE_GRASS ||
      tileId === TILE.FAE_GRASS ||
      currentBiomeId === 'grove' ||
      currentBiomeId === 'faeveldt'
    ) {
      kind = 'petal';
      colorHex = tileId === TILE.GROVE_GRASS || tileId === TILE.FAE_GRASS ? '#f9a8d4' : '#fde047';
      maxAge = 0.68;
    } else if (TALL_GRASS_TILES.has(tileId)) {
      kind = 'dust';
      colorHex = tileId === TILE.SNOW_GRASS ? '#bae6fd' : '#86efac';
      maxAge = 0.56;
    } else if (tileId === TILE.RUNE_TRAIL || currentBiomeId === 'sanctum' || currentBiomeId === 'rift' || currentBiomeId === 'crater') {
      kind = 'sparkle';
      colorHex = '#7dd3fc';
      maxAge = 0.62;
    }

    this.footsteps.push({
      x: (tileFloatX + 0.5) * tileSize,
      y: (tileFloatY + 0.88) * tileSize,
      kind,
      age: 0,
      maxAge,
      colorHex,
    });
  }

  /**
   * Collects player's equipped Style Studio aura PointLight candidate.
   */
  collectPlayerAuraLight(
    state: OverworldSceneState,
    camCenterX: number,
    camCenterY: number,
    out: LightCandidate[],
  ): void {
    const { player, tileSize } = state;
    const auraId = player.look.aura;
    const meta = AURA_VISUALS[auraId];
    if (!meta || !meta.lightRgb || auraId === 'none') return;

    const wx = (player.x + 0.5) * tileSize;
    const wy = (player.y + 0.45) * tileSize;
    const dx = wx - camCenterX;
    const dy = wy - camCenterY;
    const light: PointLight = {
      id: `player-aura-${auraId}`,
      x: wx,
      y: wy,
      radius: meta.lightRadius,
      color: [...meta.lightRgb],
      intensity: meta.lightIntensity,
      flickerSpeed: auraId === 'lightning' ? 6.5 : 2.8,
      flickerAmount: auraId === 'lightning' ? 0.16 : 0.08,
    };
    out.push({ light, distSq: dx * dx + dy * dy });
  }

  /**
   * Collects Y-sorted SpriteDrawCmds for NPCs, Rivals, Lead Follower, Player,
   * and (when DOM canvas available) Y-sorted cosmetic overlay canvases for proper occlusion.
   * Returns true if offscreen cosmetic canvases were emitted into outSprites.
   */
  collectSprites(
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    manifest: AtlasManifest | null,
    outSprites: SpriteDrawCmd[],
  ): boolean {
    const { tileSize, npcs, rivals, follower, player, elapsedSeconds, reducedMotion } = state;
    const t = reducedMotion ? 0 : elapsedSeconds;

    // 1. 23 NPCs
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      if (!isInBounds(npc.x, npc.y, bounds, 1)) continue;
      const isWillow = npc.role === 'professor' || npc.id.includes('willow');
      const regionId = isWillow
        ? 'willow_idle'
        : i % 2 === 0
          ? 'willow_idle'
          : 'ozias_idle';
      const tintRgb = isWillow
        ? null
        : mixRgb([255, 255, 255], hexToRgb255(npc.accentHex || '#a855f7'), 0.34);

      const dw = 32;
      const dh = 40;
      const dx = Math.round((npc.x + 0.5) * tileSize - dw * 0.5);
      const dy = Math.round((npc.y + 0.94) * tileSize - dh);
      outSprites.push(
        buildSpriteCmd(manifest, 'characters', regionId, dx, dy, dw, dh, {
          depth: (npc.y + 0.94) * tileSize,
          ...(tintRgb ? { tint: [tintRgb[0] / 255, tintRgb[1] / 255, tintRgb[2] / 255, 1] } : {}),
        }),
      );
    }

    // 2. 17 Rivals
    for (const rival of rivals) {
      if (!isInBounds(rival.x, rival.y, bounds, 1)) continue;
      const dw = 32;
      const dh = 40;
      const dx = Math.round((rival.x + 0.5) * tileSize - dw * 0.5);
      const dy = Math.round((rival.y + 0.94) * tileSize - dh);
      const [rr, rg, rb] = hexToRgb01(rival.accentHex || '#f43f5e');
      outSprites.push(
        buildSpriteCmd(manifest, 'characters', 'rival_idle', dx, dy, dw, dh, {
          depth: (rival.y + 0.94) * tileSize,
          rimColor: rival.defeated ? undefined : [rr, rg, rb, 0.52],
        }),
      );
    }

    // 3. Lead Pokémon Follower (animated GIF/PNG frames OR 'fallbacks' pixel archetype sprite)
    if (follower) {
      const bob = follower.moving
        ? -Math.round(Math.abs(Math.sin(follower.walkCycle * Math.PI * 1.4)) * (reducedMotion ? 1 : 2.6))
        : Math.round(Math.sin(t * 2.8) * 0.8);
      const depth = (follower.y + 0.92) * tileSize;
      const shinyRim: [number, number, number, number] | undefined = follower.isShiny
        ? [1.0, 0.92, 0.42, 0.72]
        : undefined;

      const animFrame = follower.frames
        ? SpriteAssetLoader.selectFrame(follower.frames, elapsedSeconds)
        : null;

      if (animFrame) {
        const fw = animFrame.width || follower.frames?.width || 48;
        const fh = animFrame.height || follower.frames?.height || 48;
        const fit = Math.min(40 / Math.max(1, fw), 40 / Math.max(1, fh));
        const dw = Math.max(18, Math.round(fw * fit));
        const dh = Math.max(18, Math.round(fh * fit));
        const dx = Math.round((follower.x + 0.5) * tileSize - dw * 0.5);
        const dy = Math.round((follower.y + 0.94) * tileSize - dh + bob);
        const baseFlip = follower.facing === 'right';
        const flipX = follower.frames?.mirrorX ? !baseFlip : baseFlip;

        outSprites.push({
          source: animFrame,
          dx,
          dy,
          dw,
          dh,
          flipX,
          pixelCrisp: true,
          depth,
          rimColor: shinyRim,
        });
      } else {
        const archetype: BodyArchetype =
          follower.frames?.archetype ?? getSpeciesEntry(follower.speciesId).archetype;
        const regionId = resolveFallbackArchetypeRegion(manifest, archetype);
        const dw = 40;
        const dh = 40;
        const dx = Math.round((follower.x + 0.5) * tileSize - dw * 0.5);
        const dy = Math.round((follower.y + 0.94) * tileSize - dh + bob);

        outSprites.push(
          buildSpriteCmd(manifest, 'fallbacks', regionId, dx, dy, dw, dh, {
            flipX: follower.facing === 'right',
            depth,
            rimColor: shinyRim,
          }),
        );
      }
    }

    // 4. Player (Violet / Ozias) + Y-sorted live Style Studio cosmetics
    const playerBob = player.moving
      ? -Math.round(Math.abs(Math.sin(player.walkCycle * Math.PI * 1.5)) * (reducedMotion ? 1 : 2.5))
      : Math.round(Math.sin(t * 2.4) * 0.7);
    const pDepth = (player.y + 0.94) * tileSize;
    const pRegion = resolveCharacterRegion(manifest, player.trainerId, player.facing);
    const pDx = Math.round((player.x + 0.5) * tileSize - 16);
    const pDy = Math.round((player.y + 0.94) * tileSize - 40 + playerBob);
    const auraMeta = AURA_VISUALS[player.look.aura];
    const rimRgb =
      player.look.aura !== 'none'
        ? hexToRgb01(auraMeta.primaryHex)
        : player.look.styleId !== 'default'
          ? hexToRgb01(player.look.accent)
          : null;

    // Offscreen cosmetic layers (used in browsers so trees/cottages properly occlude cape & headgear)
    let usedCanvasCosmetics = false;
    if (typeof document !== 'undefined') {
      if (!this.backCosmeticCanvas) this.backCosmeticCanvas = createScratchCanvas(48, 52);
      if (!this.frontCosmeticCanvas) this.frontCosmeticCanvas = createScratchCanvas(48, 52);

      if (this.backCosmeticCanvas && this.frontCosmeticCanvas) {
        usedCanvasCosmetics = true;
        const ox = Math.round((player.x + 0.5) * tileSize - 24);
        const oy = Math.round((player.y + 0.94) * tileSize - 48 + playerBob);

        // Back layer (cape when facing !== 'up')
        const bCtx = this.backCosmeticCanvas.ctx;
        bCtx.clearRect(0, 0, 48, 52);
        if (player.look.cape && player.facing !== 'up') {
          this.drawPixelCape(bCtx, 24, 48, player.facing, player.look, player.moving, player.walkCycle, t, reducedMotion);
          outSprites.push({
            source: this.backCosmeticCanvas.canvas,
            dx: ox,
            dy: oy,
            dw: 48,
            dh: 52,
            pixelCrisp: true,
            depth: pDepth - 0.05,
          });
        }

        // Front layer (outfit trim, front cape if facing === 'up', 8 accessories, aura glints)
        const fCtx = this.frontCosmeticCanvas.ctx;
        fCtx.clearRect(0, 0, 48, 52);
        this.drawPlayerFrontCosmetics(fCtx, 24, 48, player, t, reducedMotion);
        outSprites.push({
          source: this.frontCosmeticCanvas.canvas,
          dx: ox,
          dy: oy,
          dw: 48,
          dh: 52,
          pixelCrisp: true,
          depth: pDepth + 0.05,
        });
      }
    }

    outSprites.push(
      buildSpriteCmd(manifest, 'characters', pRegion, pDx, pDy, 32, 40, {
        depth: pDepth,
        rimColor: rimRgb ? [rimRgb[0], rimRgb[1], rimRgb[2], 0.45] : undefined,
      }),
    );

    return usedCanvasCosmetics;
  }

  /**
   * Renders grounded contact shadows, rival readiness aura rings, player aura ground ring,
   * terrain-aware footsteps, optional back cape (when not using offscreen canvas), and
   * procedural pixel character fallbacks when atlases are unattached.
   */
  renderGroundUnderlays(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    manifest: AtlasManifest | null,
    usedCanvasCosmetics: boolean,
  ): void {
    const { tileSize, npcs, rivals, follower, player, elapsedSeconds, reducedMotion } = state;
    const t = reducedMotion ? 0 : elapsedSeconds;
    const hasChars = Boolean(manifest?.sheets?.characters);
    const hasFallbacks = Boolean(manifest?.sheets?.fallbacks);
    ctx.imageSmoothingEnabled = false;

    // 1. Footsteps
    this.renderFootsteps(ctx);

    // 2. Player aura ground ring
    if (player.look.aura !== 'none') {
      this.drawAuraGroundRing(
        ctx,
        (player.x + 0.5) * tileSize,
        (player.y + 0.9) * tileSize,
        player.look.aura,
        t,
        reducedMotion,
      );
    }

    // 3. NPCs shadows (+ fallback)
    for (const npc of npcs) {
      if (!isInBounds(npc.x, npc.y, bounds, 1)) continue;
      const cx = (npc.x + 0.5) * tileSize;
      const by = (npc.y + 0.92) * tileSize;
      drawContactShadow(ctx, cx, by, 10, 4, 0.34);
      if (!hasChars) {
        this.drawFallbackHumanoid(ctx, cx, by, npc.accentHex || '#a855f7', '#fef3c7', 'down');
      }
    }

    // 4. Rivals readiness aura rings + shadows (+ fallback)
    for (const rival of rivals) {
      if (!isInBounds(rival.x, rival.y, bounds, 1)) continue;
      const cx = (rival.x + 0.5) * tileSize;
      const by = (rival.y + 0.92) * tileSize;
      drawReadinessAuraRing(
        ctx,
        cx,
        by - 1,
        tileSize * 0.52,
        tileSize * 0.22,
        rival.readinessTier,
        t,
        reducedMotion,
        rival.defeated,
      );
      drawContactShadow(ctx, cx, by, 10.5, 4, 0.36);
      if (!hasChars) {
        this.drawFallbackHumanoid(ctx, cx, by, rival.accentHex || '#f43f5e', '#fde047', 'down');
      }
    }

    // 5. Follower shadow (+ fallback)
    if (follower) {
      const fx = (follower.x + 0.5) * tileSize;
      const fy = (follower.y + 0.92) * tileSize;
      drawContactShadow(ctx, fx, fy, 10, 3.8, 0.32);
      const hasFrames = Boolean(follower.frames && follower.frames.frames.length > 0);
      if (!hasFrames && !hasFallbacks) {
        this.drawFallbackFollower(ctx, follower, fx, fy, t);
      }
    }

    // 6. Player shadow (+ back cape fallback if Node Vitest without DOM canvas + character fallback)
    const px = (player.x + 0.5) * tileSize;
    const py = (player.y + 0.92) * tileSize;
    drawContactShadow(ctx, px, py, 11, 4.2, 0.36);

    const playerBob = player.moving
      ? -Math.round(Math.abs(Math.sin(player.walkCycle * Math.PI * 1.5)) * (reducedMotion ? 1 : 2.5))
      : Math.round(Math.sin(t * 2.4) * 0.7);

    if (!usedCanvasCosmetics && player.look.cape && player.facing !== 'up') {
      this.drawPixelCape(ctx, px, py + playerBob, player.facing, player.look, player.moving, player.walkCycle, t, reducedMotion);
    }

    if (!hasChars) {
      this.drawFallbackHumanoid(
        ctx,
        px,
        py + playerBob,
        player.look.outfitPrimary,
        player.look.outfitSecondary,
        player.facing,
      );
    }
  }

  /**
   * Renders post-sprite character overlays:
   * - Direct player cosmetics (when DOM offscreen canvas wasn't used)
   * - NPC quest '!' floating pixel badges
   * - Shiny follower pixel star sparkles
   */
  renderPostSpriteOverlays(
    ctx: CanvasRenderingContext2D,
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    usedCanvasCosmetics: boolean,
  ): void {
    const { tileSize, npcs, follower, player, elapsedSeconds, reducedMotion } = state;
    const t = reducedMotion ? 0 : elapsedSeconds;
    ctx.imageSmoothingEnabled = false;

    // 1. Player front cosmetics fallback in Node / headless tests
    if (!usedCanvasCosmetics) {
      const playerBob = player.moving
        ? -Math.round(Math.abs(Math.sin(player.walkCycle * Math.PI * 1.5)) * (reducedMotion ? 1 : 2.5))
        : Math.round(Math.sin(t * 2.4) * 0.7);
      const px = Math.round((player.x + 0.5) * tileSize);
      const py = Math.round((player.y + 0.94) * tileSize + playerBob);
      this.drawPlayerFrontCosmetics(ctx, px, py, player, t, reducedMotion);
    }

    // 2. NPC quest '!' pixel badges
    for (const npc of npcs) {
      if (!isInBounds(npc.x, npc.y, bounds, 1)) continue;
      if (!npc.hasAvailableQuest) continue;
      this.drawQuestExclamationBadge(ctx, npc, tileSize, t, reducedMotion);
    }

    // 3. Shiny follower pixel glints
    if (follower?.isShiny) {
      const fx = (follower.x + 0.5) * tileSize;
      const fy = (follower.y + 0.45) * tileSize;
      for (let i = 0; i < 2; i++) {
        const ang = t * 2.6 + i * Math.PI;
        const gx = Math.round(fx + Math.cos(ang) * 14);
        const gy = Math.round(fy + Math.sin(ang) * 8);
        ctx.fillStyle = '#fff59d';
        drawFourPointStar(ctx, gx, gy, 4, 1.4, t);
        ctx.fill();
      }
    }
  }

  /**
   * Emits soft glowing particles for player's equipped Style Studio aura and shiny follower.
   */
  emitCharacterParticles(backend: IRenderBackend, state: OverworldSceneState): void {
    const { player, follower, tileSize, elapsedSeconds, reducedMotion } = state;
    const auraId = player.look.aura;

    if (auraId !== 'none') {
      const meta = AURA_VISUALS[auraId];
      const [r, g, b] = hexToRgb01(meta.primaryHex);
      const [sr, sg, sb] = hexToRgb01(meta.secondaryHex);
      const px = (player.x + 0.5) * tileSize;
      const py = (player.y + 0.5) * tileSize;
      const count = reducedMotion ? 2 : 5;

      for (let i = 0; i < count; i++) {
        const ang = elapsedSeconds * (reducedMotion ? 0.35 : 1.8) + (i * Math.PI * 2) / count;
        const orbitR = 14 + (i % 2) * 5;
        const ox = Math.cos(ang) * orbitR;
        const oy =
          Math.sin(ang) * (orbitR * 0.48) -
          (auraId === 'hearts' || auraId === 'blossom' ? ((elapsedSeconds * 12 + i * 6) % 16) : 0);
        const useSec = i % 2 === 1;
        backend.drawParticle({
          x: px + ox,
          y: py + oy,
          radius: reducedMotion ? 5.5 : 7.8,
          color: [useSec ? sr : r, useSec ? sg : g, useSec ? sb : b, reducedMotion ? 0.42 : 0.68],
          softness: 0.78,
          additive: auraId !== 'blossom',
        });
      }
    }

    if (follower?.isShiny) {
      const fx = (follower.x + 0.5) * tileSize;
      const fy = (follower.y + 0.45) * tileSize;
      const count = reducedMotion ? 1 : 3;
      for (let i = 0; i < count; i++) {
        const ang = elapsedSeconds * 2.2 + (i * Math.PI * 2) / count;
        backend.drawParticle({
          x: fx + Math.cos(ang) * 14,
          y: fy + Math.sin(ang) * 7,
          radius: 5.5,
          color: [1.0, 0.94, 0.52, 0.7],
          softness: 0.75,
          additive: true,
        });
      }
    }
  }

  renderFootsteps(ctx: CanvasRenderingContext2D): void {
    for (const f of this.footsteps) {
      const t = clamp(f.age / Math.max(0.01, f.maxAge), 0, 1);
      const alpha = (1 - t) * 0.75;

      if (f.kind === 'ripple') {
        const r = 4 + t * 12;
        strokeEllipse(ctx, f.x, f.y, r, r * 0.48, hexRgba(f.colorHex, alpha), 1.4);
      } else if (f.kind === 'sparkle') {
        const size = (1 - Math.abs(t - 0.35)) * 4.8;
        ctx.fillStyle = hexRgba(f.colorHex, alpha);
        drawFourPointStar(ctx, f.x, f.y - t * 8, Math.max(1.5, size), Math.max(0.6, size * 0.35), t * 2);
        ctx.fill();
      } else if (f.kind === 'petal') {
        ctx.fillStyle = hexRgba(f.colorHex, alpha);
        ctx.fillRect(Math.round(f.x + Math.sin(t * 6) * 3) - 1, Math.round(f.y - t * 6) - 1, 3, 2);
      } else {
        const r = 2 + Math.round(t * 3);
        ctx.fillStyle = hexRgba(f.colorHex, alpha * 0.7);
        ctx.fillRect(Math.round(f.x - t * 3 - r * 0.5), Math.round(f.y - t * 4), r, r);
        ctx.fillRect(Math.round(f.x + t * 3), Math.round(f.y - t * 3), r, r);
      }
    }
  }

  private drawPlayerFrontCosmetics(
    ctx: CanvasRenderingContext2D,
    ax: number,
    baseY: number,
    player: OverworldPlayerState,
    t: number,
    reducedMotion: boolean,
  ): void {
    const { look, facing, moving, walkCycle } = player;

    // Cape front shoulder drape when facing up
    if (look.cape && facing === 'up') {
      this.drawPixelCape(ctx, ax, baseY, facing, look, moving, walkCycle, t, reducedMotion);
    }

    // 10 Outfit style crisp pixel scarf, sash, & emblem trim
    this.drawOutfitStyleTrim(ctx, ax, baseY, facing, look);

    // 8 Crisp pixel headgear accessories
    this.drawPixelAccessory(ctx, ax, baseY - 26, facing, look.accessory, look, t, reducedMotion);

    // 6 Animated pixel aura sparkle accents
    if (look.aura !== 'none') {
      this.drawPixelAuraAccents(ctx, ax, baseY - 18, look.aura, t, reducedMotion);
    }
  }

  private drawOutfitStyleTrim(
    ctx: CanvasRenderingContext2D,
    ax: number,
    baseY: number,
    facing: Direction,
    look: ResolvedTrainerLook,
  ): void {
    const primary = look.outfitPrimary;
    const secondary = look.outfitSecondary;
    const torsoTop = baseY - 20;

    // Crisp pixel scarf/collar & belt sash colored by the 10 Style Studio palettes
    if (facing === 'up') {
      ctx.fillStyle = primary;
      ctx.fillRect(ax - 6, torsoTop + 1, 12, 3);
      ctx.fillStyle = secondary;
      ctx.fillRect(ax - 5, torsoTop + 8, 10, 2);
      return;
    }

    // Collar / scarf accent
    ctx.fillStyle = primary;
    ctx.fillRect(ax - 6, torsoTop, 12, 3);
    ctx.fillStyle = secondary;
    ctx.fillRect(ax - 2, torsoTop + 2, 4, 3);

    // Side sash tail & waist belt
    ctx.fillStyle = secondary;
    ctx.fillRect(ax - 6, torsoTop + 8, 12, 2);
    if (look.styleId !== 'default') {
      // Distinctive style chest clasp & coat hem accent
      ctx.fillStyle = look.accent;
      ctx.fillRect(ax - 1, torsoTop + 4, 2, 3);
      ctx.fillStyle = primary;
      ctx.fillRect(ax - 6, torsoTop + 10, 3, 4);
      ctx.fillRect(ax + 3, torsoTop + 10, 3, 4);
    }
  }

  private drawPixelCape(
    ctx: CanvasRenderingContext2D,
    ax: number,
    baseY: number,
    facing: Direction,
    look: ResolvedTrainerLook,
    moving: boolean,
    walkCycle: number,
    t: number,
    reducedMotion: boolean,
  ): void {
    const wave = reducedMotion
      ? 0
      : Math.round(Math.sin(t * (moving ? 8 : 2.6) + walkCycle * 2) * (moving ? 2.5 : 1.2));
    const trail = facing === 'left' ? 3 : facing === 'right' ? -3 : 0;
    const topY = baseY - 22;
    const botY = baseY - 5;

    ctx.save();
    // 1px dark indigo outline + body + secondary luminous hem
    ctx.fillStyle = '#18122e';
    ctx.fillRect(ax - 9 + trail, topY + 1, 18, 6);
    ctx.fillRect(ax - 11 + trail + wave, topY + 6, 22, botY - topY - 4);

    ctx.fillStyle = look.outfitPrimary;
    ctx.fillRect(ax - 8 + trail, topY + 2, 16, 6);
    ctx.fillRect(ax - 10 + trail + wave, topY + 7, 20, botY - topY - 7);

    // Luminous hem trim & star pin
    ctx.fillStyle = look.outfitSecondary;
    ctx.fillRect(ax - 10 + trail + wave, botY - 2, 20, 2);
    ctx.fillStyle = '#fff9c4';
    ctx.fillRect(ax - 1 + trail, topY + 3, 2, 2);
    ctx.restore();
  }

  private drawPixelAccessory(
    ctx: CanvasRenderingContext2D,
    ax: number,
    headY: number,
    facing: Direction,
    accessory: TrainerAccessoryId,
    look: ResolvedTrainerLook,
    t: number,
    reducedMotion: boolean,
  ): void {
    const dirOff = facing === 'left' ? -2 : facing === 'right' ? 2 : 0;

    switch (accessory) {
      case 'cap': {
        ctx.fillStyle = '#18122e';
        ctx.fillRect(ax - 8, headY - 12, 16, 6);
        ctx.fillStyle = look.outfitPrimary === '#a855f7' ? '#ef4444' : look.outfitPrimary;
        ctx.fillRect(ax - 7, headY - 11, 14, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ax - 6 + dirOff, headY - 8, 12, 2);
        ctx.fillStyle = look.outfitSecondary;
        ctx.fillRect(ax - 1 + dirOff, headY - 11, 2, 2);
        break;
      }
      case 'crown': {
        ctx.fillStyle = '#92400e';
        ctx.fillRect(ax - 7, headY - 13, 14, 5);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(ax - 6, headY - 12, 12, 4);
        ctx.fillRect(ax - 6, headY - 15, 2, 3);
        ctx.fillRect(ax - 1, headY - 16, 2, 4);
        ctx.fillRect(ax + 4, headY - 15, 2, 3);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(ax - 1, headY - 15, 2, 2);
        ctx.fillStyle = look.accent;
        ctx.fillRect(ax - 1, headY - 11, 2, 2);
        break;
      }
      case 'wizard': {
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(ax - 10, headY - 9, 20, 3);
        ctx.fillStyle = '#4338ca';
        ctx.fillRect(ax - 9, headY - 9, 18, 2);
        ctx.fillRect(ax - 6, headY - 14, 12, 5);
        ctx.fillRect(ax - 4, headY - 18, 8, 4);
        ctx.fillRect(ax - 1 + dirOff, headY - 21, 4, 3);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(ax - 6, headY - 10, 12, 1);
        break;
      }
      case 'headband': {
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(ax - 7, headY - 8, 14, 3);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(ax - 1 + dirOff, headY - 9, 3, 3);
        // Fluttering tail ribbons
        const flutter = reducedMotion ? 0 : Math.round(Math.sin(t * 6) * 1.5);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(ax + (facing === 'right' ? -10 : 7), headY - 7 + flutter, 3, 4);
        break;
      }
      case 'goggles': {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(ax - 7, headY - 9, 14, 3);
        if (facing !== 'up') {
          ctx.fillStyle = '#b45309';
          ctx.fillRect(ax - 6 + dirOff, headY - 10, 5, 4);
          ctx.fillRect(ax + 1 + dirOff, headY - 10, 5, 4);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(ax - 5 + dirOff, headY - 9, 3, 2);
          ctx.fillRect(ax + 2 + dirOff, headY - 9, 3, 2);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(ax - 5 + dirOff, headY - 9, 1, 1);
          ctx.fillRect(ax + 2 + dirOff, headY - 9, 1, 1);
        }
        break;
      }
      case 'halo': {
        const floatY = reducedMotion ? 0 : Math.round(Math.sin(t * 3.4) * 1.5);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(ax - 7, headY - 16 + floatY, 14, 3);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(ax - 6, headY - 16 + floatY, 12, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ax - 3, headY - 16 + floatY, 6, 1);
        break;
      }
      case 'visor': {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(ax - 7, headY - 7, 14, 4);
        if (facing !== 'up') {
          ctx.fillStyle = '#22d3ee';
          ctx.fillRect(ax - 6 + dirOff, headY - 6, 12, 2);
          ctx.fillStyle = '#e0f2fe';
          ctx.fillRect(ax - 4 + dirOff, headY - 6, 3, 1);
        }
        break;
      }
      case 'antlers': {
        // Woodland antlers & sakura blossoms
        ctx.fillStyle = '#78350f';
        ctx.fillRect(ax - 6, headY - 13, 2, 5);
        ctx.fillRect(ax - 9, headY - 16, 4, 2);
        ctx.fillRect(ax + 4, headY - 13, 2, 5);
        ctx.fillRect(ax + 5, headY - 16, 4, 2);
        ctx.fillStyle = '#f472b6';
        ctx.fillRect(ax - 8, headY - 12, 4, 4);
        ctx.fillRect(ax + 4, headY - 12, 4, 4);
        ctx.fillStyle = '#fff1f2';
        ctx.fillRect(ax - 7, headY - 11, 2, 2);
        ctx.fillRect(ax + 5, headY - 11, 2, 2);
        break;
      }
    }
  }

  private drawAuraGroundRing(
    ctx: CanvasRenderingContext2D,
    ax: number,
    ay: number,
    auraId: TrainerAuraId,
    t: number,
    reducedMotion: boolean,
  ): void {
    const meta = AURA_VISUALS[auraId];
    const pulse = reducedMotion ? 1 : 0.92 + 0.08 * Math.sin(t * 4);
    fillEllipse(ctx, ax, ay, 17 * pulse, 7 * pulse, hexRgba(meta.primaryHex, 0.24));
    strokeEllipse(ctx, ax, ay, 15 * pulse, 6.4 * pulse, hexRgba(meta.secondaryHex, 0.78), 1.5);

    if (auraId === 'lightning') {
      ctx.fillStyle = meta.secondaryHex;
      for (let i = 0; i < 4; i++) {
        const ang = (reducedMotion ? 0 : t * 3.2) + (i * Math.PI) / 2;
        const sx = Math.round(ax + Math.cos(ang) * 14);
        const sy = Math.round(ay + Math.sin(ang) * 6);
        ctx.fillRect(sx, sy - 3, 2, 4);
      }
    }
  }

  private drawPixelAuraAccents(
    ctx: CanvasRenderingContext2D,
    ax: number,
    cy: number,
    auraId: TrainerAuraId,
    t: number,
    reducedMotion: boolean,
  ): void {
    const meta = AURA_VISUALS[auraId];
    const count = reducedMotion ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const ang = (reducedMotion ? 0 : t * 2.4) + (i * Math.PI * 2) / count;
      const ox = Math.round(Math.cos(ang) * 15);
      const oy = Math.round(Math.sin(ang) * 6);
      const col = i % 2 === 0 ? meta.primaryHex : meta.secondaryHex;
      ctx.fillStyle = hexRgba(col, 0.92);

      if (auraId === 'hearts') {
        // Tiny 3x3 pixel heart
        ctx.fillRect(ax + ox - 1, cy + oy - 1, 1, 2);
        ctx.fillRect(ax + ox + 1, cy + oy - 1, 1, 2);
        ctx.fillRect(ax + ox, cy + oy, 1, 2);
      } else if (auraId === 'lightning') {
        ctx.fillRect(ax + ox, cy + oy - 2, 2, 3);
        ctx.fillRect(ax + ox - 1, cy + oy, 2, 2);
      } else if (auraId === 'blossom') {
        ctx.fillRect(ax + ox - 1, cy + oy, 3, 2);
      } else {
        // stars / cosmic
        drawFourPointStar(ctx, ax + ox, cy + oy, 3.2, 1.2, ang);
        ctx.fill();
      }
    }
  }

  private drawQuestExclamationBadge(
    ctx: CanvasRenderingContext2D,
    npc: OverworldNpcNode,
    tileSize: number,
    t: number,
    reducedMotion: boolean,
  ): void {
    const cx = Math.round((npc.x + 0.5) * tileSize);
    const bob = reducedMotion ? 0 : Math.round(Math.sin(t * 4.5 + npc.x) * 2);
    const by = Math.round((npc.y - 0.58) * tileSize + bob);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(cx - 5, by - 7, 10, 12);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx - 5, by - 7, 10, 12);

    ctx.fillStyle = '#fde047';
    ctx.fillRect(cx - 1, by - 5, 2, 5);
    ctx.fillRect(cx - 1, by + 2, 2, 2);
  }

  private drawFallbackHumanoid(
    ctx: CanvasRenderingContext2D,
    cx: number,
    baseY: number,
    primaryHex: string,
    secondaryHex: string,
    facing: Direction,
  ): void {
    const x = Math.round(cx);
    const y = Math.round(baseY);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x - 5, y - 8, 4, 8);
    ctx.fillRect(x + 1, y - 8, 4, 8);
    ctx.fillStyle = primaryHex;
    ctx.fillRect(x - 7, y - 21, 14, 13);
    ctx.fillStyle = secondaryHex;
    ctx.fillRect(x - 6, y - 13, 12, 3);
    ctx.fillStyle = '#f6d4b8';
    ctx.fillRect(x - 6, y - 32, 12, 11);
    ctx.fillStyle = '#3b2458';
    ctx.fillRect(x - 6, y - 34, 12, 4);
    if (facing !== 'up') {
      const ex = facing === 'left' ? -2 : facing === 'right' ? 2 : 0;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x - 3 + ex, y - 27, 2, 2);
      ctx.fillRect(x + 1 + ex, y - 27, 2, 2);
    }
  }

  private drawFallbackFollower(
    ctx: CanvasRenderingContext2D,
    follower: OverworldFollowerState,
    fx: number,
    fy: number,
    t: number,
  ): void {
    const pal = TYPE_PALETTES[follower.type] ?? TYPE_PALETTES.normal;
    const x = Math.round(fx);
    const y = Math.round(fy + Math.sin(t * 3) * 1.5);
    const bodyHex = follower.isShiny ? '#fde047' : pal.primary;
    const trimHex = follower.isShiny ? '#fff8c4' : pal.glow;

    fillEllipse(ctx, x, y - 10, 9, 7, bodyHex);
    fillEllipse(ctx, x, y - 18, 7, 6, bodyHex);
    ctx.fillStyle = trimHex;
    ctx.fillRect(x - 4, y - 14, 8, 3);
    if (follower.facing !== 'up') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x - 3, y - 19, 2, 2);
      ctx.fillRect(x + 1, y - 19, 2, 2);
    }
  }
}
