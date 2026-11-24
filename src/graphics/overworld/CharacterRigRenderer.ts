import type {
  Direction,
  FootstepEffect,
  IRenderBackend,
  OverworldActor,
  OverworldSceneState,
  OverworldTileKind,
  PointLight,
  StyleLoadout,
} from '../../contracts';
import { getSpecies } from '../../core/catalog/speciesCatalog';
import {
  AURA_BY_ID,
  STYLE_CAPES,
  STYLE_HEADGEAR,
  STYLE_OUTFITS,
} from '../../core/data/styleCatalog';
import { TYPE_PALETTES } from '../../core/data/typePalettes';
import {
  clamp,
  drawContactShadow,
  drawFourPointStar,
  fillEllipse,
  hexRgba,
  hexToRgb01,
  hexToRgb255,
  rgb255ToStr,
  roundedRectPath,
  shadeRgb,
  strokeEllipse,
} from './AutotileRenderer';

interface ActorMotionSample {
  x: number;
  y: number;
  vx: number;
  vy: number;
  stepAccum: number;
}

const DEFAULT_STYLE: StyleLoadout = {
  outfit: 'voyager',
  cape: 'none',
  headgear: 'star-beret',
  aura: 'none',
  primaryAccent: '#ffd166',
  secondaryAccent: '#7be8ff',
};

function findMeta<T extends string>(list: Array<{ id: T; primaryHex: string; secondaryHex: string }>, id: T) {
  return list.find((item) => item.id === id) ?? list[0];
}

export class CharacterRigRenderer {
  private footsteps: FootstepEffect[] = [];
  private actorSamples = new Map<string, ActorMotionSample>();

  resetEffects(): void {
    this.footsteps.length = 0;
    this.actorSamples.clear();
  }

  getFootstepCount(): number {
    return this.footsteps.length;
  }

  /**
   * Tracks actor velocities, emits terrain-aware footstep effects, and ages active decals.
   */
  update(state: OverworldSceneState, dtSeconds: number): void {
    const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
    const { map } = state;

    const tracked: OverworldActor[] = [state.player, state.follower];
    for (const actor of tracked) {
      const prev = this.actorSamples.get(actor.id);
      if (!prev) {
        this.actorSamples.set(actor.id, {
          x: actor.x,
          y: actor.y,
          vx: 0,
          vy: 0,
          stepAccum: 0,
        });
        continue;
      }

      const dx = actor.x - prev.x;
      const dy = actor.y - prev.y;
      const dist = Math.hypot(dx, dy);
      if (dt > 0.0001) {
        const blend = clamp(dt * 14, 0.15, 1);
        prev.vx = prev.vx * (1 - blend) + (dx / dt) * blend;
        prev.vy = prev.vy * (1 - blend) + (dy / dt) * blend;
      }

      if (dist > 0.002) {
        prev.stepAccum += dist;
      } else if (actor.moving && dt > 0) {
        // Support animated walkCycle preview even when actor x/y stays stationary
        prev.stepAccum += dt * 1.4;
      }

      if (prev.stepAccum >= 0.44) {
        prev.stepAccum %= 0.44;
        this.spawnFootstep(state, actor, map.tiles);
      }

      prev.x = actor.x;
      prev.y = actor.y;
    }

    // Age & prune footsteps
    for (let i = this.footsteps.length - 1; i >= 0; i--) {
      this.footsteps[i].age += dt;
      if (this.footsteps[i].age >= this.footsteps[i].maxAge) {
        this.footsteps.splice(i, 1);
      }
    }
  }

  private spawnFootstep(
    state: OverworldSceneState,
    actor: OverworldActor,
    tiles: OverworldTileKind[],
  ): void {
    const { map, biome, reducedMotion } = state;
    if (reducedMotion && this.footsteps.length >= 6) return;
    if (this.footsteps.length >= 48) {
      this.footsteps.shift();
    }

    const tx = clamp(Math.floor(actor.x), 0, map.width - 1);
    const ty = clamp(Math.floor(actor.y), 0, map.height - 1);
    const tileKind = tiles[ty * map.width + tx] ?? 'ground';

    let kind: FootstepEffect['kind'] = 'dust';
    let colorHex = biome.groundHex;
    let maxAge = 0.55;

    const aura = actor.style?.aura ?? 'none';
    if (tileKind === 'shallow-water' || tileKind === 'deep-water' || tileKind === 'bridge') {
      kind = 'ripple';
      colorHex = '#bceeff';
      maxAge = 0.72;
    } else if (tileKind === 'plaza' || (actor.role === 'player' && aura !== 'none')) {
      kind = 'sparkle';
      colorHex = aura !== 'none' ? AURA_BY_ID[aura].primaryHex : biome.accentHex;
      maxAge = 0.65;
    } else if (tileKind === 'flowerbed' || biome.id === 'starbloom-glade') {
      kind = 'petal';
      colorHex = biome.accentHex;
      maxAge = 0.68;
    } else if (tileKind === 'sand') {
      kind = 'dust';
      colorHex = '#e6cfa0';
      maxAge = 0.5;
    }

    this.footsteps.push({
      x: actor.x * map.tileSize,
      y: actor.y * map.tileSize + 2,
      kind,
      age: 0,
      maxAge,
      colorHex,
    });
  }

  /**
   * Emits a real-time 2D PointLight from the player's equipped Style Studio aura.
   */
  collectPlayerAuraLight(
    state: OverworldSceneState,
    out: PointLight[],
  ): void {
    const { player, map } = state;
    const auraId = player.style?.aura ?? 'none';
    if (auraId === 'none') return;

    const meta = AURA_BY_ID[auraId];
    if (!meta || !meta.lightRgb || !meta.lightRadius || !meta.lightIntensity) return;

    out.push({
      id: `player-aura-${auraId}`,
      x: player.x * map.tileSize,
      y: player.y * map.tileSize - map.tileSize * 0.25,
      radius: meta.lightRadius,
      color: [...meta.lightRgb],
      intensity: meta.lightIntensity,
      flickerSpeed: auraId === 'sky-thunder' ? 6.5 : auraId === 'ember-crown' ? 4.8 : 2.6,
      flickerAmount: auraId === 'sky-thunder' ? 0.16 : 0.08,
    });
  }

  /**
   * Emits soft glowing aura particles around the player via backend.drawParticle.
   */
  emitAuraParticles(backend: IRenderBackend, state: OverworldSceneState): void {
    const { player, map, elapsedSeconds, reducedMotion } = state;
    const auraId = player.style?.aura ?? 'none';
    if (auraId === 'none') return;

    const meta = AURA_BY_ID[auraId];
    const [r, g, b] = meta.lightRgb ?? hexToRgb01(meta.primaryHex);
    const [sr, sg, sb] = hexToRgb01(meta.secondaryHex);
    const px = player.x * map.tileSize;
    const py = player.y * map.tileSize - 10;

    const count = reducedMotion ? 2 : 5;
    for (let i = 0; i < count; i++) {
      const ang = (elapsedSeconds * (reducedMotion ? 0.35 : 1.7) + (i * Math.PI * 2) / count);
      const orbitR = 14 + (i % 2) * 5;
      const ox = Math.cos(ang) * orbitR;
      const oy = Math.sin(ang) * (orbitR * 0.46) - (auraId === 'ember-crown' ? ((elapsedSeconds * 16 + i * 7) % 18) : 0);
      const useSec = i % 2 === 1;
      backend.drawParticle({
        x: px + ox,
        y: py + oy,
        radius: reducedMotion ? 6 : 8.5,
        color: [useSec ? sr : r, useSec ? sg : g, useSec ? sb : b, reducedMotion ? 0.42 : 0.65],
        softness: 0.78,
        additive: true,
      });
    }
  }

  /**
   * Renders active footstep dust puffs, water ripples, petals, and starlight sparkles.
   */
  renderFootsteps(ctx: CanvasRenderingContext2D): void {
    for (const f of this.footsteps) {
      const t = clamp(f.age / Math.max(0.01, f.maxAge), 0, 1);
      const alpha = (1 - t) * 0.75;

      if (f.kind === 'ripple') {
        const r = 4 + t * 14;
        strokeEllipse(ctx, f.x, f.y, r, r * 0.48, hexRgba(f.colorHex, alpha), 1.4);
      } else if (f.kind === 'sparkle') {
        const size = (1 - Math.abs(t - 0.35)) * 5.2;
        ctx.fillStyle = hexRgba(f.colorHex, alpha);
        drawFourPointStar(ctx, f.x, f.y - t * 9, Math.max(1.5, size), Math.max(0.6, size * 0.36), t * 2);
        ctx.fill();
      } else if (f.kind === 'petal') {
        fillEllipse(
          ctx,
          f.x + Math.sin(t * 6) * 4,
          f.y - t * 6,
          2.8,
          1.8,
          hexRgba(f.colorHex, alpha),
        );
      } else {
        const r = 3 + t * 5.5;
        ctx.fillStyle = hexRgba(f.colorHex, alpha * 0.68);
        ctx.beginPath();
        ctx.arc(f.x - t * 3, f.y - t * 5, r * 0.65, 0, Math.PI * 2);
        ctx.arc(f.x + t * 3, f.y - t * 4, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * Renders an actor (player, follower, npc, or rival) with grounded shadow,
   * directional multi-frame animation, and live Style Studio cosmetics.
   */
  renderActor(
    ctx: CanvasRenderingContext2D,
    actor: OverworldActor,
    state: OverworldSceneState,
  ): void {
    const { tileSize } = state.map;
    const ax = actor.x * tileSize;
    const ay = actor.y * tileSize;
    const t = state.reducedMotion ? state.elapsedSeconds * 0.2 : state.elapsedSeconds;

    if (actor.role === 'follower') {
      this.drawFollowerRig(ctx, actor, ax, ay, t, state.reducedMotion);
      return;
    }

    this.drawHumanoidRig(ctx, actor, ax, ay, t, state.reducedMotion);
  }

  private drawHumanoidRig(
    ctx: CanvasRenderingContext2D,
    actor: OverworldActor,
    ax: number,
    ay: number,
    t: number,
    reducedMotion: boolean,
  ): void {
    const style = actor.style ?? DEFAULT_STYLE;
    const isPlayer = actor.role === 'player';
    const isRival = actor.role === 'rival';

    const stridePhase = actor.moving ? actor.walkCycle * Math.PI * 1.5 : 0;
    const stride = actor.moving ? Math.sin(stridePhase) : 0;
    const bob = actor.moving
      ? -Math.abs(Math.sin(stridePhase)) * (reducedMotion ? 1.0 : 2.6)
      : Math.sin(t * 2.4 + ax * 0.05) * (reducedMotion ? 0 : 0.7);

    // Aura underlay ring for player
    if (isPlayer && style.aura !== 'none') {
      this.drawAuraUnderlay(ctx, ax, ay, style.aura, t, reducedMotion);
    }

    // Grounded contact shadow
    drawContactShadow(ctx, ax, ay + 1, 11.5, 4.4, 0.36);

    // Resolve palette based on role & Style Studio outfit
    let coatHex = '#3c5aa6';
    let trimHex = '#ffd166';
    let hairHex = '#352b54';
    let skinHex = '#f5d4b8';
    let bootsHex = '#3d2e2a';

    if (isPlayer) {
      const outfit = findMeta(STYLE_OUTFITS, style.outfit);
      coatHex = outfit.primaryHex;
      trimHex = style.primaryAccent || outfit.secondaryHex;
    } else if (isRival) {
      coatHex = actor.accentHex || '#843080';
      trimHex = '#ff84d0';
      hairHex = '#d0daf0';
      bootsHex = '#2a223a';
    } else {
      coatHex = actor.accentHex || '#448876';
      trimHex = '#daf2c0';
      hairHex = '#844a34';
      skinHex = '#eec6a8';
    }

    const coatRgb = hexToRgb255(coatHex);
    const coatDark = rgb255ToStr(shadeRgb(coatRgb, 0.72));
    const coatLight = rgb255ToStr(shadeRgb(coatRgb, 1.15, 10));
    const dir = actor.facing;

    // Velocity vector for flowing cape direction
    const sample = this.actorSamples.get(actor.id);
    const capeWave = Math.sin(t * (actor.moving ? 8.5 : 2.6) + stridePhase) * (reducedMotion ? 0.6 : 3.2);
    const showCapeBehind = isPlayer && style.cape !== 'none' && dir !== 'up';
    const showCapeInFront = isPlayer && style.cape !== 'none' && dir === 'up';

    if (showCapeBehind) {
      this.drawFlowingCape(ctx, ax, ay + bob, dir, style.cape, capeWave, stride, sample, false);
    }

    // Boots / legs with alternating walk stride
    ctx.fillStyle = bootsHex;
    if (dir === 'left' || dir === 'right') {
      const f = dir === 'right' ? 1 : -1;
      ctx.fillRect(ax - 3 + stride * 3.8 * f, ay - 9 + Math.min(0, stride * 2), 5, 9);
      ctx.fillStyle = rgb255ToStr(shadeRgb(hexToRgb255(bootsHex), 0.78));
      ctx.fillRect(ax - 2 - stride * 3.8 * f, ay - 9 - Math.min(0, stride * 2), 5, 9);
    } else {
      ctx.fillRect(ax - 6.5, ay - 9 - Math.max(0, stride * 2.2), 5, 9);
      ctx.fillRect(ax + 1.5, ay - 9 - Math.max(0, -stride * 2.2), 5, 9);
    }

    // Torso / Coat silhouette tailored by Style Studio OutfitId
    const torsoY = ay - 22 + bob;
    const outfitId = isPlayer ? style.outfit : 'voyager';
    if (outfitId === 'astral-robe') {
      ctx.fillStyle = coatHex;
      ctx.beginPath();
      ctx.moveTo(ax - 7, torsoY);
      ctx.lineTo(ax + 7, torsoY);
      ctx.lineTo(ax + 10, torsoY + 15);
      ctx.lineTo(ax - 10, torsoY + 15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = trimHex;
      ctx.fillRect(ax - 2, torsoY + 1, 4, 13);
    } else {
      ctx.fillStyle = coatHex;
      roundedRectPath(ctx, ax - 7.5, torsoY, 15, 13.5, 3);
      ctx.fill();
      ctx.fillStyle = coatLight;
      ctx.fillRect(ax - 5.5, torsoY + 1, 11, 3);
      ctx.fillStyle = trimHex;
      ctx.fillRect(ax - 7.5, torsoY + 9, 15, 2.2);
      if (outfitId === 'ranger-coat' || outfitId === 'aegis-jacket') {
        ctx.fillStyle = trimHex;
        ctx.fillRect(ax - 1.5, torsoY + 2, 3, 7);
      }
    }

    // Swinging arms
    ctx.fillStyle = coatDark;
    if (dir === 'left') {
      ctx.fillRect(ax - 2 + stride * 2.4, torsoY + 2, 4, 9);
    } else if (dir === 'right') {
      ctx.fillRect(ax - 2 - stride * 2.4, torsoY + 2, 4, 9);
    } else {
      ctx.fillRect(ax - 10, torsoY + 2 + stride * 2, 3.2, 8.5);
      ctx.fillRect(ax + 6.8, torsoY + 2 - stride * 2, 3.2, 8.5);
    }

    // Facing-up cape drapes cleanly over shoulders & torso
    if (showCapeInFront) {
      this.drawFlowingCape(ctx, ax, ay + bob, dir, style.cape, capeWave, stride, sample, true);
    }

    // Head & expressive face
    const headY = torsoY - 7.5;
    ctx.fillStyle = skinHex;
    ctx.beginPath();
    ctx.arc(ax, headY, 7.2, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = hairHex;
    if (dir === 'up') {
      ctx.beginPath();
      ctx.arc(ax, headY - 0.5, 7.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(ax, headY - 2, 7.5, Math.PI, 0);
      ctx.fill();
      if (dir === 'down') {
        ctx.fillRect(ax - 6.5, headY - 4, 3, 5);
        ctx.fillRect(ax + 3.5, headY - 4, 3, 5);
      } else if (dir === 'left') {
        ctx.fillRect(ax + 1, headY - 4, 6, 7);
      } else {
        ctx.fillRect(ax - 7, headY - 4, 6, 7);
      }
    }

    // Eyes
    if (dir === 'down') {
      ctx.fillStyle = '#1b1f38';
      ctx.fillRect(ax - 3.6, headY - 0.5, 2, 2.8);
      ctx.fillRect(ax + 1.6, headY - 0.5, 2, 2.8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ax - 3.3, headY - 0.5, 1, 1);
      ctx.fillRect(ax + 1.9, headY - 0.5, 1, 1);
    } else if (dir === 'left') {
      ctx.fillStyle = '#1b1f38';
      ctx.fillRect(ax - 4.4, headY - 0.5, 2, 2.8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ax - 4.2, headY - 0.5, 1, 1);
    } else if (dir === 'right') {
      ctx.fillStyle = '#1b1f38';
      ctx.fillRect(ax + 2.4, headY - 0.5, 2, 2.8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ax + 2.6, headY - 0.5, 1, 1);
    }

    // Headgear (player Style Studio or default NPC/Rival hat)
    if (isPlayer) {
      this.drawHeadgear(ctx, ax, headY, dir, style.headgear, t);
    } else if (isRival) {
      // Sleek rival crest headband
      ctx.fillStyle = '#6c2a76';
      ctx.fillRect(ax - 7, headY - 6.5, 14, 3.2);
      ctx.fillStyle = '#ff84d0';
      ctx.fillRect(ax - 2, headY - 7, 4, 3.5);
    }

    // Aura overlay glints
    if (isPlayer && style.aura !== 'none') {
      this.drawAuraOverlay(ctx, ax, ay + bob, style.aura, t, reducedMotion);
    }
  }

  private drawFlowingCape(
    ctx: CanvasRenderingContext2D,
    ax: number,
    ay: number,
    dir: Direction,
    capeId: StyleLoadout['cape'],
    wave: number,
    stride: number,
    sample: ActorMotionSample | undefined,
    frontOverBack: boolean,
  ): void {
    if (capeId === 'none') return;
    const meta = findMeta(STYLE_CAPES, capeId);
    const velLagX = sample ? clamp(-sample.vx * 1.4, -7, 7) : 0;

    let trailDirX = 0;
    if (dir === 'left') trailDirX = 1;
    else if (dir === 'right') trailDirX = -1;

    const topY = ay - 21;
    const botY = ay - 5 + Math.abs(stride) * 1.2;
    const swayX = trailDirX * 8 + velLagX + wave;

    ctx.save();
    if (capeId === 'zephyr-mantle') {
      // Airy dual turquoise silk scarf streamers
      ctx.fillStyle = meta.primaryHex;
      ctx.beginPath();
      ctx.moveTo(ax - 5, topY + 2);
      ctx.quadraticCurveTo(ax + swayX * 0.7, topY + 9, ax + swayX * 1.25 - 3, botY + 2);
      ctx.lineTo(ax + swayX * 1.25 + 3, botY + 2);
      ctx.quadraticCurveTo(ax + swayX * 0.5, topY + 7, ax + 5, topY + 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = meta.secondaryHex;
      ctx.fillRect(ax + swayX * 1.15 - 2, botY - 1, 5, 2.5);
    } else {
      // Full billowing mantle/cloak
      const halfTop = frontOverBack ? 7.5 : 8.5;
      const halfBot = frontOverBack ? 10.5 : 12;
      ctx.fillStyle = meta.primaryHex;
      ctx.beginPath();
      ctx.moveTo(ax - halfTop, topY + 2);
      ctx.quadraticCurveTo(ax - halfBot + swayX * 0.4, (topY + botY) * 0.5, ax - halfBot + swayX, botY);
      ctx.lineTo(ax + halfBot + swayX, botY);
      ctx.quadraticCurveTo(ax + halfBot + swayX * 0.4, (topY + botY) * 0.5, ax + halfTop, topY + 2);
      ctx.closePath();
      ctx.fill();

      // Glowing/accent hem trim
      ctx.strokeStyle = meta.secondaryHex;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax - halfBot + swayX, botY);
      ctx.lineTo(ax + halfBot + swayX, botY);
      ctx.stroke();

      // Starweave constellation specks
      if (capeId === 'starweave') {
        ctx.fillStyle = meta.secondaryHex;
        ctx.fillRect(ax - 3 + swayX * 0.6, topY + 9, 2, 2);
        ctx.fillRect(ax + 3 + swayX * 0.7, topY + 12, 2, 2);
      }
    }
    ctx.restore();
  }

  private drawHeadgear(
    ctx: CanvasRenderingContext2D,
    ax: number,
    headY: number,
    dir: Direction,
    headgear: StyleLoadout['headgear'],
    t: number,
  ): void {
    if (headgear === 'none') return;
    const meta = findMeta(STYLE_HEADGEAR, headgear);

    switch (headgear) {
      case 'star-beret': {
        const tilt = dir === 'left' ? -2 : dir === 'right' ? 2 : 1;
        fillEllipse(ctx, ax + tilt, headY - 6.5, 9, 3.8, meta.primaryHex);
        ctx.fillStyle = meta.secondaryHex;
        drawFourPointStar(ctx, ax + tilt * 1.5, headY - 7, 3.4, 1.3, 0);
        ctx.fill();
        break;
      }

      case 'sky-goggles': {
        // Aviator brass band & dual cyan lenses
        ctx.fillStyle = meta.primaryHex;
        ctx.fillRect(ax - 7.5, headY - 5.5, 15, 3);
        if (dir !== 'up') {
          ctx.fillStyle = meta.secondaryHex;
          const off = dir === 'left' ? -2 : dir === 'right' ? 2 : 0;
          ctx.beginPath();
          ctx.arc(ax - 3 + off, headY - 4, 2.8, 0, Math.PI * 2);
          ctx.arc(ax + 3 + off, headY - 4, 2.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(ax - 4 + off, headY - 5, 1.4, 1.4);
          ctx.fillRect(ax + 2 + off, headY - 5, 1.4, 1.4);
        }
        break;
      }

      case 'lunar-circlet': {
        ctx.strokeStyle = meta.primaryHex;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ax, headY - 3, 7.6, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
        // Hovering luminous crescent gem
        const floatY = headY - 10 + Math.sin(t * 3.1) * 1.2;
        ctx.fillStyle = meta.secondaryHex;
        ctx.beginPath();
        ctx.arc(ax, floatY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ax - 0.8, floatY - 0.8, 1.1, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'shrine-visor': {
        ctx.fillStyle = meta.primaryHex;
        roundedRectPath(ctx, ax - 7.5, headY - 4, 15, 5, 2);
        ctx.fill();
        if (dir !== 'up') {
          ctx.fillStyle = meta.secondaryHex;
          const vx = dir === 'left' ? ax - 6.5 : dir === 'right' ? ax - 2 : ax - 5.5;
          const vw = dir === 'down' ? 11 : 8.5;
          ctx.fillRect(vx, headY - 2.6, vw, 2.2);
        }
        break;
      }
    }
  }

  private drawAuraUnderlay(
    ctx: CanvasRenderingContext2D,
    ax: number,
    ay: number,
    auraId: StyleLoadout['aura'],
    t: number,
    reducedMotion: boolean,
  ): void {
    const meta = AURA_BY_ID[auraId];
    const pulse = reducedMotion ? 1 : 0.92 + 0.08 * Math.sin(t * 4);
    fillEllipse(ctx, ax, ay, 18 * pulse, 7.5 * pulse, hexRgba(meta.primaryHex, 0.24));
    strokeEllipse(ctx, ax, ay, 16 * pulse, 6.8 * pulse, hexRgba(meta.secondaryHex, 0.72), 1.6);

    if (auraId === 'sky-thunder') {
      // Crackling electric ring notches
      ctx.strokeStyle = meta.primaryHex;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const ang = t * (reducedMotion ? 0.4 : 2.8) + (i * Math.PI) / 2;
        const x0 = ax + Math.cos(ang) * 14;
        const y0 = ay + Math.sin(ang) * 5.8;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + Math.cos(ang) * 4, y0 - 4);
        ctx.stroke();
      }
    }
  }

  private drawAuraOverlay(
    ctx: CanvasRenderingContext2D,
    ax: number,
    ay: number,
    auraId: StyleLoadout['aura'],
    t: number,
    reducedMotion: boolean,
  ): void {
    const meta = AURA_BY_ID[auraId];
    const count = reducedMotion ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const ang = t * (reducedMotion ? 0.5 : 2.4) + (i * Math.PI * 2) / count;
      const ox = Math.cos(ang) * 14;
      const oy = ay - 14 + Math.sin(ang) * 5;
      ctx.fillStyle = hexRgba(i % 2 === 0 ? meta.primaryHex : meta.secondaryHex, 0.88);
      drawFourPointStar(ctx, ax + ox, oy, 3.6, 1.4, ang);
      ctx.fill();
    }
  }

  private drawFollowerRig(
    ctx: CanvasRenderingContext2D,
    actor: OverworldActor,
    ax: number,
    ay: number,
    t: number,
    reducedMotion: boolean,
  ): void {
    const species = getSpecies(actor.speciesId ?? 133);
    const primaryType = actor.primaryType ?? species.primaryType;
    const typePal = TYPE_PALETTES[primaryType];
    const furHex = actor.speciesId === 133 ? '#e8bd78' : species.palette[0] || typePal.primary;
    const trimHex = actor.speciesId === 133 ? '#fff0c4' : species.palette[2] || typePal.glow;
    const darkHex = actor.speciesId === 133 ? '#6b472d' : typePal.dark;

    const stride = actor.moving ? Math.sin(actor.walkCycle * Math.PI * 1.6) : 0;
    const floatMode = species.archetype === 'ethereal' || species.archetype === 'avian';
    const bob = floatMode
      ? Math.sin(t * 3.4) * (reducedMotion ? 0.6 : 2.6) - 3
      : actor.moving
        ? -Math.abs(stride) * (reducedMotion ? 0.8 : 2.4)
        : Math.sin(t * 2.8) * (reducedMotion ? 0 : 0.8);

    drawContactShadow(ctx, ax, ay + 1, 9.5, 3.8, 0.32);

    const dir = actor.facing;
    const bodyY = ay - 10 + bob;

    // Fluffy / elemental tail
    const tailWag = Math.sin(t * 5.2) * (reducedMotion ? 0.4 : 2.2);
    const tailOx = dir === 'left' ? 8 : dir === 'right' ? -8 : 0;
    const tailOy = dir === 'down' ? -4 : 1;
    fillEllipse(ctx, ax + tailOx + tailWag * 0.4, bodyY + tailOy, 5.2, 4, trimHex);

    // Paws / feet
    if (!floatMode) {
      ctx.fillStyle = darkHex;
      ctx.fillRect(ax - 6, ay - 5 - Math.max(0, stride * 2), 3.5, 5);
      ctx.fillRect(ax + 2.5, ay - 5 - Math.max(0, -stride * 2), 3.5, 5);
    }

    // Body + collar mane
    fillEllipse(ctx, ax, bodyY, 8.2, 6.4, furHex);
    fillEllipse(ctx, ax, bodyY - 2, 6.2, 3.8, trimHex);

    // Head & expressive ears / crest
    const headY = bodyY - 7.5;
    ctx.fillStyle = furHex;
    ctx.beginPath();
    ctx.arc(ax, headY, 6.4, 0, Math.PI * 2);
    ctx.fill();

    // Archetype ears/crest
    if (species.archetype === 'quadruped' || species.archetype === 'biped') {
      ctx.fillStyle = furHex;
      ctx.beginPath();
      ctx.moveTo(ax - 5.5, headY - 2);
      ctx.lineTo(ax - 8, headY - 11);
      ctx.lineTo(ax - 1.5, headY - 5.5);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(ax + 5.5, headY - 2);
      ctx.lineTo(ax + 8, headY - 11);
      ctx.lineTo(ax + 1.5, headY - 5.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = darkHex;
      ctx.fillRect(ax - 7.2, headY - 10.5, 2.6, 2.6);
      ctx.fillRect(ax + 4.6, headY - 10.5, 2.6, 2.6);
    } else if (species.archetype === 'crystalline' || species.archetype === 'draconic') {
      ctx.fillStyle = trimHex;
      ctx.beginPath();
      ctx.moveTo(ax - 3, headY - 5);
      ctx.lineTo(ax, headY - 12);
      ctx.lineTo(ax + 3, headY - 5);
      ctx.closePath();
      ctx.fill();
    }

    // Directional eyes
    if (dir !== 'up') {
      const ex = dir === 'left' ? -2.2 : dir === 'right' ? 2.2 : 0;
      ctx.fillStyle = '#181c36';
      ctx.fillRect(ax - 3.2 + ex, headY - 0.5, 1.8, 2.4);
      ctx.fillRect(ax + 1.4 + ex, headY - 0.5, 1.8, 2.4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ax - 3 + ex, headY - 0.5, 0.9, 0.9);
      ctx.fillRect(ax + 1.6 + ex, headY - 0.5, 0.9, 0.9);
    }
  }
}
