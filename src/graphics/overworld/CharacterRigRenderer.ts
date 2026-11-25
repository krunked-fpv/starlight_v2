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
import { SpriteAssetLoader, TILE, getBiomeVisualProfile, getSpeciesEntry } from '../../core/dojo';
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
  lerp,
  markImmutableCanvas,
  mixRgb,
  strokeEllipse,
  type LightCandidate,
  type ViewTileBounds,
} from './AutotileRenderer';
import { drawReadinessAuraRing } from './LandmarkRenderer';
import { measureSpriteOpaqueBounds, type SpriteOpaqueBounds } from '../battle/SpriteSilhouette';

interface MotionSample {
  x: number;
  y: number;
  stepAccum: number;
}

interface SoftFollowerEntry {
  canvas: HTMLCanvasElement;
  bounds: SpriteOpaqueBounds;
}

const SOFTENED_FOLLOWER_CACHE = new WeakMap<HTMLCanvasElement, SoftFollowerEntry | null>();

function isReadableDomCanvas(src: unknown): src is HTMLCanvasElement {
  if (!src || typeof src !== 'object') return false;
  const c = src as { width?: number; height?: number; getContext?: unknown };
  return typeof c.getContext === 'function' && typeof c.width === 'number' && typeof c.height === 'number' && c.width > 0 && c.height > 0;
}

/**
 * Pre-softens & warmly harmonizes a live Pokémon animation frame ONCE (WeakMap-cached & tagged
 * __starlightImmutable for single-upload WebGL2 VRAM reuse) so miniature following Pokémon feel
 * plush, smooth-edged, and naturally integrated into the 16-bit/32-bit pixel overworld instead
 * of looking like razor-sharp black-outlined nearest-neighbor stickers!
 */
export function getSoftenedFollowerFrame(
  source: HTMLCanvasElement,
  measuredBounds: SpriteOpaqueBounds | null,
): SoftFollowerEntry | null {
  if (!isReadableDomCanvas(source) || typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }

  const cached = SOFTENED_FOLLOWER_CACHE.get(source);
  if (cached !== undefined) return cached;

  try {
    const fw = source.width;
    const fh = source.height;
    const b = measuredBounds ?? {
      minX: 0,
      minY: 0,
      maxX: fw - 1,
      maxY: fh - 1,
      contentW: fw,
      contentH: fh,
      frameW: fw,
      frameH: fh,
    };

    const pad = 3;
    const maxContentDim = Math.max(b.contentW, b.contentH, 1);
    // Harmonious miniature companion pixel density (~38px content -> smooth bilinear upscale at 2.5x zoom)
    const targetDim = clamp(Math.round(Math.min(maxContentDim, 38)), 22, 38);
    const scale = targetDim / maxContentDim;
    const dstContentW = Math.max(8, Math.round(b.contentW * scale));
    const dstContentH = Math.max(8, Math.round(b.contentH * scale));
    const outW = dstContentW + pad * 2;
    const outH = dstContentH + pad * 2;

    // Step 1: Smooth high-quality bilinear downsampling onto scratch canvas
    const work = document.createElement('canvas');
    work.width = outW;
    work.height = outH;
    const wCtx = work.getContext('2d', { willReadFrequently: true }) ?? work.getContext('2d');
    if (!wCtx || typeof wCtx.getImageData !== 'function') {
      SOFTENED_FOLLOWER_CACHE.set(source, null);
      return null;
    }

    wCtx.imageSmoothingEnabled = true;
    wCtx.imageSmoothingQuality = 'high';
    wCtx.clearRect(0, 0, outW, outH);

    // If source is huge (e.g. 475x475 official artwork), do a 2-step progressive box/bilinear downsample
    if (maxContentDim > 112) {
      const midW = Math.max(dstContentW * 2, 64);
      const midH = Math.max(dstContentH * 2, 64);
      const mid = document.createElement('canvas');
      mid.width = midW;
      mid.height = midH;
      const mCtx = mid.getContext('2d');
      if (mCtx) {
        mCtx.imageSmoothingEnabled = true;
        mCtx.imageSmoothingQuality = 'high';
        mCtx.drawImage(source, b.minX, b.minY, b.contentW, b.contentH, 0, 0, midW, midH);
        wCtx.drawImage(mid, 0, 0, midW, midH, pad, pad, dstContentW, dstContentH);
      } else {
        wCtx.drawImage(source, b.minX, b.minY, b.contentW, b.contentH, pad, pad, dstContentW, dstContentH);
      }
    } else {
      wCtx.drawImage(source, b.minX, b.minY, b.contentW, b.contentH, pad, pad, dstContentW, dstContentH);
    }

    // Step 2: Gentle outline warming, saturation harmony, subtle 3x3 micro-soften & feathered rim
    const imgData = wCtx.getImageData(0, 0, outW, outH);
    const src = new Uint8ClampedArray(imgData.data);
    const dst = imgData.data;

    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const idx = (y * outW + x) * 4;
        const a = src[idx + 3];
        if (a < 8) {
          dst[idx + 3] = 0;
          continue;
        }

        // Accumulate soft 3x3 weighted neighborhood (alpha-weighted) to take off razor-sharp aliasing
        let sumR = src[idx] * 4;
        let sumG = src[idx + 1] * 4;
        let sumB = src[idx + 2] * 4;
        let sumW = 4;
        let transparentNeighbors = 0;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= outH) {
            transparentNeighbors += 1;
            continue;
          }
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= outW) {
              transparentNeighbors += 1;
              continue;
            }
            const ni = (ny * outW + nx) * 4;
            const na = src[ni + 3];
            if (na < 36) {
              transparentNeighbors += 1;
            } else {
              const wt = (dx === 0 || dy === 0 ? 1.0 : 0.5) * (na / 255);
              sumR += src[ni] * wt;
              sumG += src[ni + 1] * wt;
              sumB += src[ni + 2] * wt;
              sumW += wt;
            }
          }
        }

        // Blend ~30% toward soft neighbor average for plush mini-sprite feel
        let r = lerp(src[idx], sumR / sumW, 0.30);
        let g = lerp(src[idx + 1], sumG / sumW, 0.30);
        let bVal = lerp(src[idx + 2], sumB / sumW, 0.30);

        const lum = (0.299 * r + 0.587 * g + 0.114 * bVal) / 255;

        // Soften harsh pure-black #000 outlines into warm deep twilight plum-slate ink
        if (lum < 0.22) {
          const darkFactor = clamp((0.22 - lum) / 0.22, 0, 1);
          r = lerp(r, 48, darkFactor * 0.58);
          g = lerp(g, 42, darkFactor * 0.58);
          bVal = lerp(bVal, 68, darkFactor * 0.62);
        } else {
          // Gently temper neon over-saturation (~14% toward warm luma) so follower harmonizes with terrain
          const lumaPx = 0.299 * r + 0.587 * g + 0.114 * bVal;
          r = lerp(r, lumaPx * 1.02, 0.14);
          g = lerp(g, lumaPx * 1.0, 0.14);
          bVal = lerp(bVal, lumaPx * 0.98, 0.14);
        }

        // Feather outer silhouette edge slightly so companion never looks like a harsh cutout sticker
        let outA = a;
        if (transparentNeighbors > 0) {
          const feather = transparentNeighbors >= 3 ? 0.78 : 0.88;
          outA = Math.round(a * feather);
        }

        dst[idx] = clamp(Math.round(r), 0, 255);
        dst[idx + 1] = clamp(Math.round(g), 0, 255);
        dst[idx + 2] = clamp(Math.round(bVal), 0, 255);
        dst[idx + 3] = clamp(outA, 0, 255);
      }
    }
    wCtx.putImageData(imgData, 0, 0);

    // Step 3: Blit into a clean GPU-friendly canvas (without willReadFrequently) & tag immutable!
    const gpuCanvas = document.createElement('canvas');
    gpuCanvas.width = outW;
    gpuCanvas.height = outH;
    const gCtx = gpuCanvas.getContext('2d');
    if (gCtx) {
      gCtx.imageSmoothingEnabled = true;
      gCtx.drawImage(work, 0, 0);
    }
    markImmutableCanvas(gpuCanvas);

    const entry: SoftFollowerEntry = {
      canvas: gCtx ? gpuCanvas : markImmutableCanvas(work),
      bounds: {
        minX: pad,
        minY: pad,
        maxX: pad + dstContentW - 1,
        maxY: pad + dstContentH - 1,
        contentW: dstContentW,
        contentH: dstContentH,
        frameW: outW,
        frameH: outH,
      },
    };
    SOFTENED_FOLLOWER_CACHE.set(source, entry);
    return entry;
  } catch {
    SOFTENED_FOLLOWER_CACHE.set(source, null);
    return null;
  }
}

export const AURA_VISUALS: Record<
  TrainerAuraId,
  {
    primaryHex: string;
    secondaryHex: string;
    primarySoftRgba: string;
    secondaryRingRgba: string;
    lightRgb: [number, number, number] | null;
    lightRadius: number;
    lightIntensity: number;
  }
> = {
  none: {
    primaryHex: '#94a3b8',
    secondaryHex: '#cbd5e1',
    primarySoftRgba: 'rgba(148, 163, 184, 0.24)',
    secondaryRingRgba: 'rgba(203, 213, 225, 0.78)',
    lightRgb: null,
    lightRadius: 0,
    lightIntensity: 0,
  },
  stars: {
    primaryHex: '#fde047',
    secondaryHex: '#fef9c3',
    primarySoftRgba: 'rgba(253, 224, 71, 0.24)',
    secondaryRingRgba: 'rgba(254, 249, 195, 0.78)',
    lightRgb: [1.0, 0.88, 0.34],
    lightRadius: 128,
    lightIntensity: 1.05,
  },
  hearts: {
    primaryHex: '#f472b6',
    secondaryHex: '#fbcfe8',
    primarySoftRgba: 'rgba(244, 114, 182, 0.24)',
    secondaryRingRgba: 'rgba(251, 207, 232, 0.78)',
    lightRgb: [0.98, 0.48, 0.74],
    lightRadius: 120,
    lightIntensity: 0.98,
  },
  lightning: {
    primaryHex: '#38bdf8',
    secondaryHex: '#fef08a',
    primarySoftRgba: 'rgba(56, 189, 248, 0.24)',
    secondaryRingRgba: 'rgba(254, 240, 138, 0.78)',
    lightRgb: [0.28, 0.78, 1.0],
    lightRadius: 136,
    lightIntensity: 1.12,
  },
  blossom: {
    primaryHex: '#fb7185',
    secondaryHex: '#fce7f3',
    primarySoftRgba: 'rgba(251, 113, 133, 0.24)',
    secondaryRingRgba: 'rgba(252, 231, 243, 0.78)',
    lightRgb: [0.98, 0.52, 0.64],
    lightRadius: 122,
    lightIntensity: 0.96,
  },
  cosmic: {
    primaryHex: '#2dd4bf',
    secondaryHex: '#c084fc',
    primarySoftRgba: 'rgba(45, 212, 191, 0.24)',
    secondaryRingRgba: 'rgba(192, 132, 252, 0.78)',
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

function createCosmeticCanvas(w: number, h: number): {
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
    // GPU-friendly canvas (avoid willReadFrequently which forces Skia CPU readback path)
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  } catch {
    return null;
  }
}

const NPC_HAT_PALETTES: ReadonlyArray<{ hat: string; hi: string; trim: string; scarf: string }> = [
  { hat: '#9a3412', hi: '#c2410c', trim: '#fbbf24', scarf: '#e11d48' },
  { hat: '#0f766e', hi: '#14b8a6', trim: '#99f6e4', scarf: '#0ea5e9' },
  { hat: '#4338ca', hi: '#6366f1', trim: '#fde047', scarf: '#818cf8' },
  { hat: '#9d174d', hi: '#db2777', trim: '#fbcfe8', scarf: '#ec4899' },
  { hat: '#b45309', hi: '#d97706', trim: '#fef08a', scarf: '#f59e0b' },
];

export class CharacterRigRenderer {
  private footsteps: FootstepEffect[] = [];
  private samples = new Map<string, MotionSample>();
  private backCosmeticCanvas: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
  private frontCosmeticCanvas: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
  private lastBackKey = '';
  private lastFrontKey = '';

  resetEffects(): void {
    this.footsteps.length = 0;
    this.samples.clear();
    this.lastBackKey = '';
    this.lastFrontKey = '';
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
    } else if (
      tileId === TILE.RUNE_TRAIL ||
      currentBiomeId === 'sanctum' ||
      currentBiomeId === 'rift' ||
      currentBiomeId === 'crater'
    ) {
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
      color: [meta.lightRgb[0], meta.lightRgb[1], meta.lightRgb[2]],
      intensity: meta.lightIntensity,
      flickerSpeed: auraId === 'lightning' ? 6.5 : 2.8,
      flickerAmount: auraId === 'lightning' ? 0.16 : 0.08,
    };
    out.push({ light, distSq: dx * dx + dy * dy });
  }

  /**
   * Collects Y-sorted SpriteDrawCmds for NPCs, Rivals, softened & harmonized Lead Follower,
   * Player, and dirty-checked cosmetic canvases.
   */
  collectSprites(
    state: OverworldSceneState,
    bounds: ViewTileBounds,
    manifest: AtlasManifest | null,
    outSprites: SpriteDrawCmd[],
  ): boolean {
    const { tileSize, npcs, rivals, follower, player, elapsedSeconds, reducedMotion, currentBiomeId } = state;
    const t = reducedMotion ? 0 : elapsedSeconds;

    // 1. 23 NPCs (Professor Willow uses 'willow_idle'; villagers use 4 bespoke HD-2D villager archetypes!)
    const charRegions = manifest?.sheets?.characters?.regions;
    const villagerRegions = [
      'villager_scout',
      'villager_scholar',
      'villager_artisan',
      'villager_sailor',
    ];
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      if (!isInBounds(npc.x, npc.y, bounds, 1)) continue;
      const isWillow = npc.role === 'professor' || npc.id.includes('willow');
      let regionId: string;
      if (isWillow) {
        regionId = 'willow_idle';
      } else {
        let hash = i;
        for (let k = 0; k < npc.id.length; k++) {
          hash = (hash * 31 + npc.id.charCodeAt(k)) >>> 0;
        }
        const preferred = villagerRegions[hash % villagerRegions.length];
        regionId = charRegions?.[preferred] ? preferred : 'ozias_idle';
      }
      const tintRgb = isWillow
        ? null
        : mixRgb([255, 255, 255], hexToRgb255(npc.accentHex || '#a855f7'), 0.16);

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
    for (let i = 0; i < rivals.length; i++) {
      const rival = rivals[i];
      if (!isInBounds(rival.x, rival.y, bounds, 1)) continue;
      const dw = 32;
      const dh = 40;
      const dx = Math.round((rival.x + 0.5) * tileSize - dw * 0.5);
      const dy = Math.round((rival.y + 0.94) * tileSize - dh);
      const [rr, rg, rb] = hexToRgb01(rival.accentHex || '#f43f5e');
      outSprites.push(
        buildSpriteCmd(manifest, 'characters', 'rival_idle', dx, dy, dw, dh, {
          depth: (rival.y + 0.94) * tileSize,
          rimColor: rival.defeated ? undefined : [rr, rg, rb, 0.48],
        }),
      );
    }

    // 3. Lead Pokémon Follower — INTENTIONALLY SOFTENED & WARMLY HARMONIZED!
    // Uses bilinear smoothing (pixelCrisp: false), pre-softened outline-warmed cached frame,
    // and subtle biome ambient tint so miniature companions blend warmly into the pixel world
    // instead of appearing jagged or overly sharp!
    if (follower) {
      const bob = follower.moving
        ? -Math.abs(Math.sin(follower.walkCycle * Math.PI * 1.4)) * (reducedMotion ? 1.0 : 2.6)
        : Math.sin(t * 2.6) * 0.7;
      const depth = (follower.y + 0.92) * tileSize;
      const shinyRim: [number, number, number, number] | undefined = follower.isShiny
        ? [1.0, 0.92, 0.48, 0.52]
        : undefined;

      // Subtle biome atmospheric tint so follower shares the world's warm/cool ambient lighting
      const biomeAmb = getBiomeVisualProfile(currentBiomeId).colorGrade.ambientRgb;
      const followerTint: [number, number, number, number] = [
        clamp(lerp(0.98, biomeAmb[0] * 1.06, 0.16), 0.84, 1.04),
        clamp(lerp(0.97, biomeAmb[1] * 1.04, 0.16), 0.84, 1.03),
        clamp(lerp(0.97, biomeAmb[2] * 1.04, 0.16), 0.84, 1.04),
        0.96,
      ];

      const animFrame = follower.frames
        ? SpriteAssetLoader.selectFrame(follower.frames, elapsedSeconds)
        : null;

      if (animFrame) {
        const rawBounds = measureSpriteOpaqueBounds(follower.frames, animFrame);
        const soft = getSoftenedFollowerFrame(animFrame, rawBounds);
        const drawSource = soft ? soft.canvas : animFrame;
        const activeBounds = soft ? soft.bounds : rawBounds;
        const fw = drawSource.width || follower.frames?.width || 48;
        const fh = drawSource.height || follower.frames?.height || 48;
        const baseFlip = follower.facing === 'right';
        const flipX = follower.frames?.mirrorX ? !baseFlip : baseFlip;
        let dw: number;
        let dh: number;
        let dx: number;
        let dy: number;

        if (activeBounds && activeBounds.contentW > 0 && activeBounds.contentH > 0) {
          const targetSpan = 27;
          const contentDim = Math.max(activeBounds.contentW, activeBounds.contentH, 20);
          const fit = clamp(targetSpan / contentDim, 0.35, 1.2);
          dw = Math.max(16, Math.round(fw * fit));
          dh = Math.max(16, Math.round(fh * fit));
          const rawCx = (activeBounds.minX + activeBounds.maxX + 1) * 0.5;
          const alignedCx = flipX ? fw - rawCx : rawCx;
          dx = Math.round((follower.x + 0.5) * tileSize - alignedCx * fit);
          dy = Math.round((follower.y + 0.90) * tileSize - (activeBounds.maxY + 1) * fit + bob);
        } else {
          const fit = Math.min(30 / Math.max(1, fw), 30 / Math.max(1, fh));
          dw = Math.max(18, Math.round(fw * fit));
          dh = Math.max(18, Math.round(fh * fit));
          dx = Math.round((follower.x + 0.5) * tileSize - dw * 0.5);
          dy = Math.round((follower.y + 0.90) * tileSize - dh + bob);
        }

        outSprites.push({
          source: drawSource,
          dx,
          dy,
          dw,
          dh,
          flipX,
          pixelCrisp: false, // Smooth bilinear filtering (eliminates harsh nearest-neighbor sharpness!)
          tint: followerTint,
          depth,
          rimColor: shinyRim,
        });
      } else {
        const archetype: BodyArchetype =
          follower.frames?.archetype ?? getSpeciesEntry(follower.speciesId).archetype;
        const regionId = resolveFallbackArchetypeRegion(manifest, archetype);
        const dw = 29;
        const dh = 29;
        const dx = Math.round((follower.x + 0.5) * tileSize - dw * 0.5);
        const dy = Math.round((follower.y + 0.90) * tileSize - dh + bob);

        outSprites.push(
          buildSpriteCmd(manifest, 'fallbacks', regionId, dx, dy, dw, dh, {
            flipX: follower.facing === 'right',
            pixelCrisp: false, // Soften fallback mini follower too
            useNormalMap: false,
            tint: followerTint,
            depth,
            rimColor: shinyRim,
          }),
        );
      }
    }

    // 4. Player (Violet / Ozias — crisp 2x HD-2D 64x80 sprite) + dirty-checked live Style Studio cosmetics
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

    let usedCanvasCosmetics = false;
    if (typeof document !== 'undefined') {
      if (!this.backCosmeticCanvas) this.backCosmeticCanvas = createCosmeticCanvas(48, 52);
      if (!this.frontCosmeticCanvas) this.frontCosmeticCanvas = createCosmeticCanvas(48, 52);

      if (this.backCosmeticCanvas && this.frontCosmeticCanvas) {
        usedCanvasCosmetics = true;
        const ox = Math.round((player.x + 0.5) * tileSize - 24);
        const oy = Math.round((player.y + 0.94) * tileSize - 48 + playerBob);
        const animBucket = reducedMotion ? 0 : Math.floor(t * 15);

        // Back layer (cape when facing !== 'up')
        if (player.look.cape && player.facing !== 'up') {
          const backKey = `${player.facing}|${player.look.outfitPrimary}|${player.look.outfitSecondary}|${player.moving ? 1 : 0}|${Math.round(player.walkCycle * 6)}|${animBucket}`;
          if (backKey !== this.lastBackKey) {
            this.lastBackKey = backKey;
            const bCtx = this.backCosmeticCanvas.ctx;
            bCtx.clearRect(0, 0, 48, 52);
            this.drawPixelCape(bCtx, 24, 48, player.facing, player.look, player.moving, player.walkCycle, t, reducedMotion);
          }
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
        const needsFrontAnim =
          player.look.aura !== 'none' ||
          player.look.accessory === 'halo' ||
          player.look.accessory === 'headband' ||
          (player.look.cape && player.facing === 'up');
        const frontKey = `${player.facing}|${player.look.styleId}|${player.look.accessory}|${player.look.aura}|${player.look.cape ? 1 : 0}|${needsFrontAnim ? animBucket : 0}`;
        if (frontKey !== this.lastFrontKey) {
          this.lastFrontKey = frontKey;
          const fCtx = this.frontCosmeticCanvas.ctx;
          fCtx.clearRect(0, 0, 48, 52);
          this.drawPlayerFrontCosmetics(fCtx, 24, 48, player, t, reducedMotion);
        }
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
        rimColor: rimRgb ? [rimRgb[0], rimRgb[1], rimRgb[2], 0.44] : undefined,
      }),
    );

    return usedCanvasCosmetics;
  }

  /**
   * Renders grounded pixel-stepped oval shadows, rival readiness aura rings, player aura ground ring,
   * terrain-aware footsteps, hop-synced soft follower shadow, and procedural fallbacks.
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
    if (this.footsteps.length > 0) {
      this.renderFootsteps(ctx);
    }

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
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      if (!isInBounds(npc.x, npc.y, bounds, 1)) continue;
      const cx = (npc.x + 0.5) * tileSize;
      const by = (npc.y + 0.92) * tileSize;
      drawContactShadow(ctx, cx, by, 10, 3.8, 0.34);
      if (!hasChars) {
        this.drawFallbackHumanoid(ctx, cx, by, npc.accentHex || '#a855f7', '#fef3c7', 'down');
      }
    }

    // 4. Rivals readiness aura rings + shadows (+ fallback)
    for (let i = 0; i < rivals.length; i++) {
      const rival = rivals[i];
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

    // 5. Follower soft hop-synced elliptical ground shadow (+ fallback)
    if (follower) {
      const fx = (follower.x + 0.5) * tileSize;
      const fy = (follower.y + 0.92) * tileSize;
      const hopLift = follower.moving
        ? Math.abs(Math.sin(follower.walkCycle * Math.PI * 1.4)) * (reducedMotion ? 0.3 : 1.0)
        : 0;
      const shadowScale = 1 - hopLift * 0.18;
      // Soft translucent elliptical ground shadow grounding the softened mini Pokémon naturally
      fillEllipse(ctx, fx, fy, 10.5 * shadowScale, 4.2 * shadowScale, 'rgba(12, 16, 36, 0.14)');
      fillEllipse(ctx, fx, fy, 7.6 * shadowScale, 3.0 * shadowScale, 'rgba(10, 14, 32, 0.22)');
      const hasFrames = Boolean(follower.frames && follower.frames.frames.length > 0);
      if (!hasFrames && !hasFallbacks) {
        this.drawFallbackFollower(ctx, follower, fx, fy, t);
      }
    }

    // 6. Player shadow (+ back cape fallback in Node Vitest + character fallback)
    const px = (player.x + 0.5) * tileSize;
    const py = (player.y + 0.92) * tileSize;
    drawContactShadow(ctx, px, py, 10.5, 4.0, 0.36);

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
   * - Detailed villager hats/scarves + refined golden diamond quest '!' crests
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

    // 2. Refined villager neckerchief accents + V1-parity golden quest crests (star ready vs unvisited '!')
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      if (!isInBounds(npc.x, npc.y, bounds, 1)) continue;
      const isWillow = npc.role === 'professor' || npc.id.includes('willow');
      if (!isWillow) {
        let hash = i;
        for (let k = 0; k < npc.id.length; k++) {
          hash = (hash * 31 + npc.id.charCodeAt(k)) >>> 0;
        }
        const style = NPC_HAT_PALETTES[hash % NPC_HAT_PALETTES.length];
        const scarfCol = npc.accentHex || style.scarf;
        const nx = Math.round((npc.x + 0.5) * tileSize);
        const ny = Math.round((npc.y + 0.94) * tileSize);
        // Subtle crisp neckerchief & golden clasp accent complementing bespoke villager sprite
        ctx.fillStyle = '#12152e';
        ctx.fillRect(nx - 5, ny - 21, 10, 4);
        ctx.fillStyle = scarfCol;
        ctx.fillRect(nx - 4, ny - 20, 8, 2);
        ctx.fillStyle = style.trim;
        ctx.fillRect(nx - 1, ny - 20, 2, 2);
      }
      if (npc.hasAvailableQuest) {
        this.drawQuestExclamationBadge(ctx, npc, tileSize, t, reducedMotion, true);
      } else if (!npc.talked && !npc.questCompleted && npc.role !== 'villager') {
        this.drawQuestExclamationBadge(ctx, npc, tileSize, t, reducedMotion, false);
      }
    }

    // 2b. V1-parity Rival floating readiness emblem (crossed pixel swords vs rematch star + readiness pip)
    const { rivals } = state;
    for (let i = 0; i < rivals.length; i++) {
      const rival = rivals[i];
      if (!isInBounds(rival.x, rival.y, bounds, 1)) continue;
      this.drawRivalStatusCrest(ctx, rival, tileSize, t, reducedMotion);
    }

    // 3. Shiny follower delicate pixel glints
    if (follower?.isShiny) {
      const fx = (follower.x + 0.5) * tileSize;
      const fy = (follower.y + 0.45) * tileSize;
      for (let i = 0; i < 2; i++) {
        const ang = t * 2.6 + i * Math.PI;
        const gx = Math.round(fx + Math.cos(ang) * 14);
        const gy = Math.round(fy + Math.sin(ang) * 8);
        ctx.fillStyle = '#fff59d';
        drawFourPointStar(ctx, gx, gy, 3.6, 1.2, t);
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
          (auraId === 'hearts' || auraId === 'blossom' ? (elapsedSeconds * 12 + i * 6) % 16 : 0);
        const useSec = i % 2 === 1;
        backend.drawParticle({
          x: px + ox,
          y: py + oy,
          radius: reducedMotion ? 5.2 : 7.2,
          color: [useSec ? sr : r, useSec ? sg : g, useSec ? sb : b, reducedMotion ? 0.4 : 0.62],
          softness: 0.8,
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
          x: fx + Math.cos(ang) * 13,
          y: fy + Math.sin(ang) * 7,
          radius: 4.5,
          color: [1.0, 0.94, 0.58, 0.58],
          softness: 0.78,
          additive: true,
        });
      }
    }
  }

  renderFootsteps(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.footsteps.length; i++) {
      const f = this.footsteps[i];
      const t = clamp(f.age / Math.max(0.01, f.maxAge), 0, 1);
      const alpha = (1 - t) * 0.75;

      if (f.kind === 'ripple') {
        const r = 4 + t * 12;
        strokeEllipse(ctx, f.x, f.y, r, r * 0.48, hexRgba(f.colorHex, alpha), 1.4);
      } else if (f.kind === 'sparkle') {
        const size = (1 - Math.abs(t - 0.35)) * 4.5;
        ctx.fillStyle = hexRgba(f.colorHex, alpha);
        drawFourPointStar(ctx, f.x, f.y - t * 8, Math.max(1.5, size), Math.max(0.6, size * 0.35), t * 2);
        ctx.fill();
      } else if (f.kind === 'petal') {
        ctx.fillStyle = hexRgba(f.colorHex, alpha);
        ctx.fillRect(Math.round(f.x + Math.sin(t * 6) * 3) - 1, Math.round(f.y - t * 6) - 1, 3, 2);
      } else {
        const r = 2 + Math.round(t * 2.5);
        ctx.fillStyle = hexRgba(f.colorHex, alpha * 0.68);
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

    if (look.cape && facing === 'up') {
      this.drawPixelCape(ctx, ax, baseY, facing, look, moving, walkCycle, t, reducedMotion);
    }

    this.drawOutfitStyleTrim(ctx, ax, baseY, facing, look);
    this.drawPixelAccessory(ctx, ax, baseY - 26, facing, look.accessory, look, t, reducedMotion);

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

    if (look.styleId === 'default') {
      if (facing !== 'up') {
        ctx.fillStyle = '#18122e';
        ctx.fillRect(ax - 2, torsoTop + 3, 4, 4);
        ctx.fillStyle = '#ffd966';
        ctx.fillRect(ax - 1, torsoTop + 4, 2, 2);
      }
      return;
    }

    if (facing === 'up') {
      ctx.fillStyle = '#16112b';
      ctx.fillRect(ax - 7, torsoTop, 14, 5);
      ctx.fillStyle = primary;
      ctx.fillRect(ax - 6, torsoTop + 1, 12, 3);
      ctx.fillStyle = secondary;
      ctx.fillRect(ax - 5, torsoTop + 8, 10, 2);
      return;
    }

    ctx.fillStyle = '#16112b';
    ctx.fillRect(ax - 7, torsoTop - 1, 14, 5);
    ctx.fillStyle = primary;
    ctx.fillRect(ax - 6, torsoTop, 12, 3);
    ctx.fillStyle = secondary;
    ctx.fillRect(ax - 2, torsoTop + 2, 4, 3);

    ctx.fillStyle = secondary;
    ctx.fillRect(ax - 6, torsoTop + 8, 12, 2);
    ctx.fillStyle = look.accent;
    ctx.fillRect(ax - 1, torsoTop + 4, 2, 3);
    ctx.fillStyle = primary;
    ctx.fillRect(ax - 6, torsoTop + 10, 3, 4);
    ctx.fillRect(ax + 3, torsoTop + 10, 3, 4);
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
    ctx.fillStyle = '#18122e';
    ctx.fillRect(ax - 9 + trail, topY + 1, 18, 6);
    ctx.fillRect(ax - 11 + trail + wave, topY + 6, 22, botY - topY - 4);

    ctx.fillStyle = look.outfitPrimary;
    ctx.fillRect(ax - 8 + trail, topY + 2, 16, 6);
    ctx.fillRect(ax - 10 + trail + wave, topY + 7, 20, botY - topY - 7);

    // Subtle shaded vertical cape pleats
    ctx.fillStyle = 'rgba(18, 14, 38, 0.24)';
    ctx.fillRect(ax - 5 + trail + wave, topY + 8, 2, botY - topY - 10);
    ctx.fillRect(ax + 3 + trail + wave, topY + 8, 2, botY - topY - 10);

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
        if (look.styleId === 'default') {
          if (facing !== 'up') {
            ctx.fillStyle = '#18122e';
            ctx.fillRect(ax - 2 + dirOff, headY - 12, 4, 4);
            ctx.fillStyle = '#ffd966';
            ctx.fillRect(ax - 1 + dirOff, headY - 11, 2, 2);
            ctx.fillStyle = '#fff9d6';
            ctx.fillRect(ax - 1 + dirOff, headY - 11, 1, 1);
          }
          break;
        }
        ctx.fillStyle = '#18122e';
        ctx.fillRect(ax - 8, headY - 13, 16, 6);
        ctx.fillStyle = look.outfitPrimary;
        ctx.fillRect(ax - 7, headY - 12, 14, 4);
        ctx.fillStyle = look.outfitSecondary;
        ctx.fillRect(ax - 6 + dirOff, headY - 9, 12, 2);
        ctx.fillStyle = '#fff8d6';
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
    fillEllipse(ctx, ax, ay, 17 * pulse, 7 * pulse, meta.primarySoftRgba);
    strokeEllipse(ctx, ax, ay, 15 * pulse, 6.4 * pulse, meta.secondaryRingRgba, 1.5);

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
      ctx.fillStyle = col;

      if (auraId === 'hearts') {
        ctx.fillRect(ax + ox - 1, cy + oy - 1, 1, 2);
        ctx.fillRect(ax + ox + 1, cy + oy - 1, 1, 2);
        ctx.fillRect(ax + ox, cy + oy, 1, 2);
      } else if (auraId === 'lightning') {
        ctx.fillRect(ax + ox, cy + oy - 2, 2, 3);
        ctx.fillRect(ax + ox - 1, cy + oy, 2, 2);
      } else if (auraId === 'blossom') {
        ctx.fillRect(ax + ox - 1, cy + oy, 3, 2);
      } else {
        drawFourPointStar(ctx, ax + ox, cy + oy, 3.2, 1.2, ang);
        ctx.fill();
      }
    }
  }

  /**
   * Sleek, beveled golden pixel-art diamond quest crest (replaces clunky dark-navy square box).
   */
  private drawQuestExclamationBadge(
    ctx: CanvasRenderingContext2D,
    npc: OverworldNpcNode,
    tileSize: number,
    t: number,
    reducedMotion: boolean,
    isQuestAvailable = true,
  ): void {
    const cx = Math.round((npc.x + 0.5) * tileSize);
    const bob = reducedMotion ? 0 : Math.round(Math.sin(t * 4.2 + npc.x) * 1.8);
    const by = Math.round((npc.y - 0.56) * tileSize + bob);

    // Subtle soft amber glow halo behind crest
    fillEllipse(ctx, cx, by, 8.5, 8.5, isQuestAvailable ? 'rgba(255, 212, 102, 0.24)' : 'rgba(186, 230, 253, 0.16)');

    // Chamfered 1px dark indigo pixel-diamond frame
    ctx.fillStyle = '#0c1026';
    ctx.fillRect(cx - 3, by - 8, 6, 16);
    ctx.fillRect(cx - 5, by - 6, 10, 12);
    ctx.fillRect(cx - 7, by - 4, 14, 8);
    ctx.fillRect(cx - 1, by - 9, 2, 18);

    // Gilded brass beveled rim
    ctx.fillStyle = isQuestAvailable ? '#d99624' : '#94a3b8';
    ctx.fillRect(cx - 2, by - 7, 4, 14);
    ctx.fillRect(cx - 4, by - 5, 8, 10);
    ctx.fillRect(cx - 6, by - 3, 12, 6);

    // Warm sunlit top-left specular rim
    ctx.fillStyle = isQuestAvailable ? '#fff3b0' : '#e2e8f0';
    ctx.fillRect(cx - 2, by - 7, 4, 2);
    ctx.fillRect(cx - 5, by - 4, 3, 2);

    // Deep royal-sapphire inner medallion
    ctx.fillStyle = '#182454';
    ctx.fillRect(cx - 2, by - 5, 4, 10);
    ctx.fillRect(cx - 4, by - 3, 8, 6);
    ctx.fillStyle = '#273a7a';
    ctx.fillRect(cx - 2, by - 5, 3, 3);

    // Crisp luminous cream-gold '!' glyph with 1px drop shadow
    ctx.fillStyle = '#0a0e22';
    ctx.fillRect(cx, by - 3, 2, 4);
    ctx.fillRect(cx, by + 3, 2, 2);
    ctx.fillStyle = '#fff5b8';
    ctx.fillRect(cx - 1, by - 4, 2, 4);
    ctx.fillRect(cx - 1, by + 2, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 1, by - 4, 1, 2);
  }

  private drawRivalStatusCrest(
    ctx: CanvasRenderingContext2D,
    rival: OverworldSceneState['rivals'][number],
    tileSize: number,
    t: number,
    reducedMotion: boolean,
  ): void {
    const cx = Math.round((rival.x + 0.5) * tileSize);
    const bob = reducedMotion ? 0 : Math.round(Math.sin(t * 4.0 + rival.x) * 1.8);
    const by = Math.round((rival.y - 0.58) * tileSize + bob);

    const tierRim =
      rival.defeated
        ? '#38bdf8'
        : rival.readinessTier === 'danger'
          ? '#f43f5e'
          : rival.readinessTier === 'challenging'
            ? '#f59e0b'
            : rival.readinessTier === 'favored'
              ? '#22c55e'
              : '#38bdf8';

    // Dark pixel-outlined chamfered shield badge
    ctx.fillStyle = '#0c1026';
    ctx.fillRect(cx - 6, by - 6, 12, 12);
    ctx.fillRect(cx - 4, by - 7, 8, 14);
    ctx.fillStyle = tierRim;
    ctx.fillRect(cx - 5, by - 5, 10, 10);
    ctx.fillRect(cx - 3, by - 6, 6, 12);
    ctx.fillStyle = '#141d42';
    ctx.fillRect(cx - 4, by - 4, 8, 8);

    if (rival.defeated) {
      // Crisp 4-point cyan rematch star
      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(cx - 3, by, 6, 1);
      ctx.fillRect(cx, by - 3, 1, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 1, by - 1, 2, 2);
    } else {
      // Crisp crossed pixel duelist blades (zero emoji)
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(cx - 3, by - 3, 2, 2);
      ctx.fillRect(cx - 1, by - 1, 2, 2);
      ctx.fillRect(cx + 1, by + 1, 2, 2);
      ctx.fillRect(cx + 1, by - 3, 2, 2);
      ctx.fillRect(cx - 3, by + 1, 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 1, by - 1, 2, 2);
    }
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
      ctx.fillStyle = '#2d2642';
      ctx.fillRect(x - 3, y - 19, 2, 2);
      ctx.fillRect(x + 1, y - 19, 2, 2);
    }
  }
}
