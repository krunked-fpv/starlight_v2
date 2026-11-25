import type {
  BiomeId,
  CompassTarget,
  Direction,
  ElementalType,
  OverworldChestNode,
  OverworldDiscoveryNode,
  OverworldInteractable,
  OverworldLandmarkNode,
  OverworldNpcNode,
  OverworldRivalNode,
  OverworldSceneState,
  OverworldShrineNode,
  OverworldSignpostNode,
  ReadinessTier,
  TacticalBriefingData,
  TrainerId,
} from '../../contracts';
import { BALANCE, assessEncounterReadiness } from './raw/balance.js';
import {
  BIOMES,
  CHESTS,
  FIELD_QUESTS,
  GAME_META,
  LANDMARKS,
  NPCS,
  RIVAL_TRAINERS,
  SECRET_ARCADE_SPOT,
  SHRINES,
  SIGNPOSTS,
  SPECIES,
  TILE,
  TYPE_CHART,
  WORLD_COLS,
  WORLD_MAP,
  WORLD_ROWS,
  findNearestSafePosition,
  getBiomeAt,
  getBiomeWarpPoint,
  getCompassGuidance,
  getSafeZoneWarpPoint,
  getTileDepthInfo,
  isTileWalkableAt,
  resolveFarmingBiomeForLevel,
} from './raw/config.js';
import { getScaledRivalParty, getScaledShrineGuard, getScaledShrineTrial } from './raw/pokemon.js';
import type { StarlightStorageBridge } from '../save/saveHydrator';
import type { SpriteAssetLoader } from './spriteLoader';
import { getCleanTrainerName, getResolvedTrainerLook, getSpeciesEntry } from './catalog';
import { getBiomeVisualProfile } from './biomeVisuals';
import { readinessTierToIconId, stripEmojis } from './emojiSanitizer';

const ENCOUNTER_TILE_BIOME: Record<number, BiomeId> = {
  [TILE.TALL_GRASS]: 'forest',
  [TILE.CAVE_FLOOR]: 'cave',
  [TILE.SHALLOW_WATER]: 'water',
  [TILE.VOLCANO_FLOOR]: 'volcano',
  [TILE.SNOW_GRASS]: 'peak',
  [TILE.GROVE_GRASS]: 'grove',
  [TILE.DUNE_SAND]: 'desert',
  [TILE.MARSH_GRASS]: 'marsh',
  [TILE.SANCTUM_FLOOR]: 'sanctum',
  [TILE.CANYON_GRASS]: 'canyon',
  [TILE.REEF_WATER]: 'reef',
  [TILE.RUINS_FLOOR]: 'ruins',
  [TILE.RIFT_FLOOR]: 'rift',
  [TILE.FAE_GRASS]: 'faeveldt',
  [TILE.ATOLL_SAND]: 'atoll',
  [TILE.CROWN_GRASS]: 'highlands',
  [TILE.TERA_FLOOR]: 'crater',
};

export interface OverworldStepEvent {
  moved: boolean;
  onGrass: boolean;
  biomeChanged?: BiomeId;
  wildEncounterTriggered?: { biomeId: BiomeId; depthTier: number; isRarePatch: boolean };
  discoveryPicked?: OverworldDiscoveryNode;
  steppedHealSpot?: boolean;
  arrivedInteractTarget?: { x: number; y: number };
  newBadgeIds?: string[];
  stepCheerEarned?: boolean;
  stepArcadeChargeEarned?: boolean;
}

/**
 * Pure 4-directional BFS shortest-path solver on the 100×84 WORLD_MAP.
 * If destination is a solid interactive tile (shrine/chest/sign/fountain/wall), stops cleanly on
 * the closest adjacent walkable tile.
 */
export function findBfsPath(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  maxExpanded = 3500,
): Array<{ x: number; y: number }> {
  const sx = Math.max(0, Math.min(WORLD_COLS - 1, Math.round(startX)));
  const sy = Math.max(0, Math.min(WORLD_ROWS - 1, Math.round(startY)));
  const gx = Math.max(0, Math.min(WORLD_COLS - 1, Math.round(goalX)));
  const gy = Math.max(0, Math.min(WORLD_ROWS - 1, Math.round(goalY)));
  if (sx === gx && sy === gy) return [];

  const goalWalkable = isTileWalkableAt(gx, gy);
  const visited = new Uint8Array(WORLD_COLS * WORLD_ROWS);
  const parent = new Int32Array(WORLD_COLS * WORLD_ROWS).fill(-1);
  const queue = new Int32Array(WORLD_COLS * WORLD_ROWS);

  let head = 0;
  let tail = 0;
  const startIdx = sy * WORLD_COLS + sx;
  visited[startIdx] = 1;
  queue[tail++] = startIdx;

  let bestIdx = -1;
  let bestDist = Infinity;
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];

  let expanded = 0;
  while (head < tail && expanded < maxExpanded) {
    const cur = queue[head++];
    expanded++;
    const cx = cur % WORLD_COLS;
    const cy = (cur - cx) / WORLD_COLS;

    const manhattan = Math.abs(cx - gx) + Math.abs(cy - gy);
    if (goalWalkable && cx === gx && cy === gy) {
      bestIdx = cur;
      break;
    }
    if (!goalWalkable && manhattan === 1) {
      bestIdx = cur;
      break;
    }
    if (manhattan < bestDist) {
      bestDist = manhattan;
      bestIdx = cur;
    }

    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_COLS || ny >= WORLD_ROWS) continue;
      const nIdx = ny * WORLD_COLS + nx;
      if (visited[nIdx]) continue;
      if (!isTileWalkableAt(nx, ny)) continue;
      visited[nIdx] = 1;
      parent[nIdx] = cur;
      queue[tail++] = nIdx;
    }
  }

  if (bestIdx === -1 || bestIdx === startIdx) return [];
  const path: Array<{ x: number; y: number }> = [];
  let cur = bestIdx;
  while (cur !== -1 && cur !== startIdx) {
    const px = cur % WORLD_COLS;
    const py = (cur - px) / WORLD_COLS;
    path.push({ x: px, y: py });
    cur = parent[cur];
  }
  path.reverse();
  return path;
}

function parseCoordKey(key: string): { x: number; y: number } {
  const [xs, ys] = key.split(',');
  return { x: Number(xs) || 0, y: Number(ys) || 0 };
}

export class DojoOverworldSim {
  private readonly storage: StarlightStorageBridge;
  private readonly sprites: SpriteAssetLoader;
  private state: OverworldSceneState;

  private tileX = GAME_META.spawn.x;
  private tileY = GAME_META.spawn.y;
  private floatX = GAME_META.spawn.x;
  private floatY = GAME_META.spawn.y;
  private followerX = GAME_META.spawn.x;
  private followerY = GAME_META.spawn.y + 0.85;
  private followerTargetX = GAME_META.spawn.x;
  private followerTargetY = GAME_META.spawn.y + 0.85;
  private followerFacing: Direction = 'down';
  private facing: Direction = 'down';
  private moveCooldown = 0;
  private stepsSinceWild = BALANCE.overworld.minStepsBetweenWilds;
  private wildStreak = 0;
  private graceSteps = 0;
  private bfsPath: Array<{ x: number; y: number }> = [];
  private autoInteractTarget: { x: number; y: number } | null = null;
  private discoveryNodes: OverworldDiscoveryNode[] = [];
  private discoveryRespawnTimer = 0;
  private discoverySeq = 100;
  private healTiles: Array<{ x: number; y: number }> = [];
  private shrineCoords: Map<string, { x: number; y: number }> = new Map();
  private chestCoords: Map<string, { x: number; y: number }> = new Map();

  constructor(storage: StarlightStorageBridge, sprites: SpriteAssetLoader) {
    this.storage = storage;
    this.sprites = sprites;

    // Scan static map for HEAL tiles and index shrine/chest coordinates
    for (let y = 0; y < WORLD_ROWS; y++) {
      for (let x = 0; x < WORLD_COLS; x++) {
        if (WORLD_MAP[y]?.[x] === TILE.HEAL) {
          this.healTiles.push({ x, y });
        }
      }
    }
    for (const [key, shrine] of Object.entries(SHRINES)) {
      this.shrineCoords.set(shrine.id, parseCoordKey(key));
    }
    for (const [key, chest] of Object.entries(CHESTS)) {
      this.chestCoords.set(chest.id, parseCoordKey(key));
    }

    this.spawnInitialDiscoveryNodes();
    this.state = this.buildSceneState();
  }

  private spawnInitialDiscoveryNodes(): void {
    const candidates: Array<{ x: number; y: number; kind: OverworldDiscoveryNode['kind']; accent: string }> = [
      { x: 14, y: 14, kind: 'starShard', accent: '#fde047' },
      { x: 24, y: 12, kind: 'potion', accent: '#fb7185' },
      { x: 10, y: 24, kind: 'greatBall', accent: '#38bdf8' },
      { x: 32, y: 26, kind: 'starShard', accent: '#fde047' },
      { x: 46, y: 16, kind: 'berry', accent: '#4ade80' },
      { x: 58, y: 40, kind: 'starShard', accent: '#fde047' },
      { x: 74, y: 24, kind: 'greatBall', accent: '#38bdf8' },
      { x: 84, y: 62, kind: 'starShard', accent: '#fde047' },
    ];
    this.discoveryNodes = candidates
      .filter((c) => isTileWalkableAt(c.x, c.y))
      .map((c, idx) => ({
        id: `disc-${idx}`,
        x: c.x,
        y: c.y,
        kind: c.kind,
        biomeId: (getBiomeAt(c.x, c.y)?.id as BiomeId) || 'forest',
        accentHex: c.accent,
        spawnedAt: idx,
      }));
  }

  private placeFollowerBehind(px: number, py: number, dir: Direction): void {
    const candidates: Array<[number, number]> =
      dir === 'up'
        ? [[px, py + 1], [px - 1, py], [px + 1, py], [px, py - 1]]
        : dir === 'down'
          ? [[px, py - 1], [px - 1, py], [px + 1, py], [px, py + 1]]
          : dir === 'left'
            ? [[px + 1, py], [px, py + 1], [px, py - 1], [px - 1, py]]
            : [[px - 1, py], [px, py + 1], [px, py - 1], [px + 1, py]];

    for (const [cx, cy] of candidates) {
      if (isTileWalkableAt(cx, cy)) {
        this.followerX = cx;
        this.followerY = cy;
        this.followerTargetX = cx;
        this.followerTargetY = cy;
        this.followerFacing = dir;
        return;
      }
    }
    this.followerX = px;
    this.followerY = py;
    this.followerTargetX = px;
    this.followerTargetY = py;
    this.followerFacing = dir;
  }

  syncFromProfile(options?: { preserveEncounterPacing?: boolean }): void {
    const profile = this.storage.getActiveProfileJSON();
    if (profile?.pos) {
      const safe = isTileWalkableAt(profile.pos.x, profile.pos.y)
        ? { x: profile.pos.x, y: profile.pos.y, dir: profile.pos.dir || 'down' }
        : findNearestSafePosition(profile.pos.x, profile.pos.y, profile.pos.dir || 'down');
      this.tileX = safe.x;
      this.tileY = safe.y;
      this.floatX = safe.x;
      this.floatY = safe.y;
      this.facing = (safe.dir as Direction) || 'down';
      this.placeFollowerBehind(this.tileX, this.tileY, this.facing);
    }
    if (!options?.preserveEncounterPacing) {
      this.stepsSinceWild = BALANCE.overworld.minStepsBetweenWilds;
      this.wildStreak = 0;
    }
    this.bfsPath = [];
    this.autoInteractTarget = null;
    this.refreshState();
  }

  getState(): OverworldSceneState {
    return this.state;
  }

  canStepNow(): boolean {
    return this.moveCooldown <= 0;
  }

  faceTile(tx: number, ty: number): void {
    const dx = tx - this.tileX;
    const dy = ty - this.tileY;
    if (dx === 0 && dy === 0) return;
    const nextFacing: Direction =
      Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    if (this.facing !== nextFacing) {
      this.facing = nextFacing;
      this.storage.manager.updatePosition(this.tileX, this.tileY, this.facing, false);
      this.state.player.facing = this.facing;
      this.state.nearbyInteraction = this.resolveNearbyInteractable();
    }
  }

  getInteractableAtTile(tx: number, ty: number): OverworldInteractable | null {
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return null;
    if (tx < 0 || ty < 0 || tx >= WORLD_COLS || ty >= WORLD_ROWS) return null;
    const key = `${tx},${ty}`;

    if (SECRET_ARCADE_SPOT && SECRET_ARCADE_SPOT.x === tx && SECRET_ARCADE_SPOT.y === ty) {
      const unlocked = this.storage.manager.isArcadeUnlocked();
      return {
        kind: 'secret-arcade',
        id: 'secret-arcade',
        x: tx,
        y: ty,
        label: unlocked ? 'Starlight Sky-Hop Arcade' : 'Mysterious Star Emblem',
        actionVerb: unlocked ? 'Play Arcade' : 'Inspect Star',
      };
    }

    if (WORLD_MAP[ty]?.[tx] === TILE.HEAL) {
      return {
        kind: 'fountain',
        id: `fountain-${tx}-${ty}`,
        x: tx,
        y: ty,
        label: 'Starlight Healing Fountain',
        actionVerb: 'Heal Team',
      };
    }

    if (SHRINES[key]) {
      const sh = this.state.shrines.find((s) => s.x === tx && s.y === ty);
      if (sh) {
        return {
          kind: 'shrine',
          id: sh.id,
          x: tx,
          y: ty,
          label: sh.name,
          actionVerb: sh.cleared ? 'Astral Trial' : 'Challenge Shrine',
        };
      }
    }

    if (RIVAL_TRAINERS[key]) {
      const rv = this.state.rivals.find((r) => r.x === tx && r.y === ty);
      if (rv) {
        return {
          kind: 'rival',
          id: rv.id,
          x: tx,
          y: ty,
          label: rv.name,
          actionVerb: rv.defeated ? 'Rematch Duel' : 'Challenge Rival',
        };
      }
    }

    if (CHESTS[key]) {
      const ch = this.state.chests.find((c) => c.x === tx && c.y === ty);
      if (ch) {
        return {
          kind: 'chest',
          id: ch.id,
          x: tx,
          y: ty,
          label: ch.opened ? 'Opened Treasure Chest' : ch.label,
          actionVerb: ch.opened ? 'Inspect Chest' : 'Open Chest',
        };
      }
    }

    if (NPCS[key]) {
      const npc = this.state.npcs.find((n) => n.x === tx && n.y === ty);
      if (npc) {
        return {
          kind: 'npc',
          id: npc.id,
          x: tx,
          y: ty,
          label: npc.name,
          actionVerb: npc.hasAvailableQuest ? 'Talk (Quest)' : 'Talk',
        };
      }
    }

    if (SIGNPOSTS[key]) {
      const sign = this.state.signposts.find((s) => s.x === tx && s.y === ty);
      if (sign) {
        return {
          kind: 'signpost',
          id: sign.id,
          x: tx,
          y: ty,
          label: sign.title,
          actionVerb: 'Read Sign',
        };
      }
    }

    if (LANDMARKS[key]) {
      const lm = this.state.landmarks.find((l) => l.x === tx && l.y === ty);
      if (lm) {
        return {
          kind: 'landmark',
          id: lm.id,
          x: tx,
          y: ty,
          label: lm.name,
          actionVerb: 'Inspect',
        };
      }
    }

    return null;
  }

  setBfsTarget(goalX: number, goalY: number, options?: { autoInteract?: boolean }): Array<{ x: number; y: number }> {
    const interactive = options?.autoInteract ? this.getInteractableAtTile(goalX, goalY) : null;
    this.bfsPath = findBfsPath(this.tileX, this.tileY, goalX, goalY);
    this.autoInteractTarget = interactive ? { x: goalX, y: goalY } : null;
    this.state.bfsPath = this.bfsPath;
    return this.bfsPath;
  }

  clearBfsPath(): void {
    this.bfsPath = [];
    this.autoInteractTarget = null;
    this.state.bfsPath = [];
  }

  applyPostBattleCooldown(): void {
    this.stepsSinceWild = 0;
    this.wildStreak = 0;
  }

  applyPostEscapeGrace(): void {
    this.stepsSinceWild = 0;
    this.wildStreak = 0;
    this.graceSteps = Math.max(this.graceSteps, BALANCE.overworld.postEscapeGraceSteps);
  }

  applyPostWarpGrace(): void {
    this.stepsSinceWild = 0;
    this.wildStreak = 0;
    this.graceSteps = Math.max(this.graceSteps, BALANCE.overworld.postWarpGraceSteps);
  }

  warpToSafeZone(): { biomeId: BiomeId; x: number; y: number; newBadgeIds: string[] } {
    const res = this.storage.manager.warpToSafeZone();
    this.tileX = res.pos.x;
    this.tileY = res.pos.y;
    this.floatX = res.pos.x;
    this.floatY = res.pos.y;
    this.facing = (res.pos.dir as Direction) || 'down';
    this.placeFollowerBehind(this.tileX, this.tileY, this.facing);
    this.bfsPath = [];
    this.autoInteractTarget = null;
    this.stepsSinceWild = 0;
    this.wildStreak = 0;
    this.graceSteps = BALANCE.overworld.postWarpGraceSteps;
    this.state.biomeBannerTimer = 2.6;
    this.refreshState();
    const newBadgeIds = Array.isArray(res?.newBadges) ? res.newBadges.map((b: { id: string }) => b.id) : [];
    return { biomeId: 'village', x: this.tileX, y: this.tileY, newBadgeIds };
  }

  warpToFarmZone(): { biomeId: BiomeId; biomeName: string; x: number; y: number; newBadgeIds: string[] } {
    const profile = this.storage.manager.getActiveProfile();
    const rec = resolveFarmingBiomeForLevel(profile);
    const biomeId = (rec.biomeId as BiomeId) || 'forest';
    const warpRes = this.storage.manager.warpToZone(rec.x, rec.y, rec.dir || 'down', biomeId);
    this.tileX = warpRes?.pos?.x ?? rec.x;
    this.tileY = warpRes?.pos?.y ?? rec.y;
    this.floatX = this.tileX;
    this.floatY = this.tileY;
    this.facing = ((warpRes?.pos?.dir ?? rec.dir) as Direction) || 'down';
    this.placeFollowerBehind(this.tileX, this.tileY, this.facing);
    this.bfsPath = [];
    this.autoInteractTarget = null;
    this.stepsSinceWild = 0;
    this.wildStreak = 0;
    this.graceSteps = BALANCE.overworld.postWarpGraceSteps;
    this.state.biomeBannerTimer = 2.6;
    this.refreshState();
    const newBadgeIds = Array.isArray(warpRes?.newBadges) ? warpRes.newBadges.map((b: { id: string }) => b.id) : [];
    return { biomeId, biomeName: stripEmojis(rec.biome?.name || biomeId), x: this.tileX, y: this.tileY, newBadgeIds };
  }

  warpToBiome(biomeId: BiomeId): { biomeId: BiomeId; x: number; y: number; newBadgeIds: string[] } {
    const wp = getBiomeWarpPoint(biomeId);
    const warpRes = this.storage.manager.warpToZone(wp.x, wp.y, wp.dir || 'down', biomeId);
    this.tileX = warpRes?.pos?.x ?? wp.x;
    this.tileY = warpRes?.pos?.y ?? wp.y;
    this.floatX = this.tileX;
    this.floatY = this.tileY;
    this.facing = ((warpRes?.pos?.dir ?? wp.dir) as Direction) || 'down';
    this.placeFollowerBehind(this.tileX, this.tileY, this.facing);
    this.bfsPath = [];
    this.autoInteractTarget = null;
    this.stepsSinceWild = 0;
    this.wildStreak = 0;
    this.graceSteps = BALANCE.overworld.postWarpGraceSteps;
    this.state.biomeBannerTimer = 2.6;
    this.refreshState();
    const newBadgeIds = Array.isArray(warpRes?.newBadges) ? warpRes.newBadges.map((b: { id: string }) => b.id) : [];
    return { biomeId, x: this.tileX, y: this.tileY, newBadgeIds };
  }

  private needsAutoHeal(): boolean {
    const profile = this.storage.manager.getActiveProfile();
    if (!profile) return false;
    const team = Array.isArray(profile.team) ? profile.team : [];
    const anyInjured = team.some((m: { hp: number; maxHp: number }) => m && m.hp < m.maxHp);
    if (anyInjured) return true;
    const anyLowPp = team.some((m: { getMoveObjects?: () => Array<{ id: string }>; getMovePp?: (id: string) => { current: number; max: number } }) => {
      const moves = typeof m?.getMoveObjects === 'function' ? m.getMoveObjects() : [];
      return moves.some((mv) => {
        const pp = m.getMovePp?.(mv.id);
        return Boolean(pp && pp.current < pp.max);
      });
    });
    if (anyLowPp) return true;
    return (profile.bag?.potions ?? 0) < 5;
  }

  private maybeRespawnNearbyDiscoveryNodes(dt: number): void {
    this.discoveryRespawnTimer += dt;
    if (this.discoveryRespawnTimer < 14) return;
    this.discoveryRespawnTimer = 0;
    if (this.discoveryNodes.length >= 10) return;

    const occupied = new Set(this.discoveryNodes.map((n) => `${n.x},${n.y}`));
    const candidates: Array<{ x: number; y: number; biomeId: BiomeId }> = [];
    for (let dy = -7; dy <= 7; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist < 3 || dist > 11) continue;
        const cx = this.tileX + dx;
        const cy = this.tileY + dy;
        if (occupied.has(`${cx},${cy}`) || !isTileWalkableAt(cx, cy)) continue;
        const tile = WORLD_MAP[cy]?.[cx];
        const biomeId = ENCOUNTER_TILE_BIOME[tile];
        if (biomeId) {
          candidates.push({ x: cx, y: cy, biomeId });
        }
      }
    }
    if (candidates.length === 0) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const kinds: Array<{ kind: OverworldDiscoveryNode['kind']; accent: string }> = [
      { kind: 'starShard', accent: '#fde047' },
      { kind: 'potion', accent: '#fb7185' },
      { kind: 'greatBall', accent: '#38bdf8' },
      { kind: 'berry', accent: '#4ade80' },
    ];
    const spec = kinds[this.discoverySeq % kinds.length];
    this.discoveryNodes.push({
      id: `disc-${this.discoverySeq++}`,
      x: pick.x,
      y: pick.y,
      kind: spec.kind,
      biomeId: pick.biomeId,
      accentHex: spec.accent,
      spawnedAt: Math.round(this.state.elapsedSeconds),
    });
  }

  stepDirection(dx: number, dy: number): OverworldStepEvent {
    const adx = Math.sign(dx);
    const ady = Math.sign(dy);
    if (adx === 0 && ady === 0) return { moved: false, onGrass: false };

    if (Math.abs(dx) >= Math.abs(dy)) {
      this.facing = adx > 0 ? 'right' : 'left';
    } else {
      this.facing = ady > 0 ? 'down' : 'up';
    }

    const prevBiome = this.state.currentBiomeId;
    const prevX = this.tileX;
    const prevY = this.tileY;
    const nextX = prevX + (Math.abs(dx) >= Math.abs(dy) ? adx : 0);
    const nextY = prevY + (Math.abs(dy) > Math.abs(dx) ? ady : 0);

    // Check NPC/Rival collision too
    const coordKey = `${nextX},${nextY}`;
    const blockedByActor = Boolean(NPCS[coordKey] || RIVAL_TRAINERS[coordKey]);

    if (!isTileWalkableAt(nextX, nextY) || blockedByActor) {
      this.storage.manager.updatePosition(prevX, prevY, this.facing, false);
      this.state.player.facing = this.facing;
      this.state.nearbyInteraction = this.resolveNearbyInteractable();
      return { moved: false, onGrass: false };
    }

    this.tileX = nextX;
    this.tileY = nextY;
    this.moveCooldown = 0.145;

    // Trail follower cleanly onto the player's previous walkable tile
    const fdx = prevX - this.followerTargetX;
    const fdy = prevY - this.followerTargetY;
    if (fdx !== 0 || fdy !== 0) {
      this.followerFacing = Math.abs(fdx) >= Math.abs(fdy) ? (fdx > 0 ? 'right' : 'left') : (fdy > 0 ? 'down' : 'up');
    } else {
      this.followerFacing = this.facing;
    }
    this.followerTargetX = prevX;
    this.followerTargetY = prevY;

    const stepMeta = this.storage.manager.updatePosition(this.tileX, this.tileY, this.facing, true);

    const newBiome = ((getBiomeAt(this.tileX, this.tileY)?.id) as BiomeId) || 'forest';
    let biomeChanged: BiomeId | undefined;
    const newBadgeIds: string[] = [];
    if (newBiome !== prevBiome) {
      biomeChanged = newBiome;
      this.storage.manager.recordBiomeVisited(newBiome, true);
      const visitedBadges = this.storage.manager.evaluateBadges(true) || [];
      for (const b of visitedBadges) {
        if (b?.id) newBadgeIds.push(b.id);
      }
      this.state.biomeBannerTimer = 2.6;
    }

    // Check discovery node pickup
    let discoveryPicked: OverworldDiscoveryNode | undefined;
    const discIdx = this.discoveryNodes.findIndex((d) => d.x === this.tileX && d.y === this.tileY);
    if (discIdx !== -1) {
      discoveryPicked = this.discoveryNodes.splice(discIdx, 1)[0];
      if (discoveryPicked.kind === 'starShard') this.storage.manager.addStarShards(2, true);
      else if (discoveryPicked.kind === 'potion') this.storage.manager.addRewards({ potions: 1 }, true);
      else if (discoveryPicked.kind === 'greatBall') this.storage.manager.addRewards({ greatBalls: 1 }, true);
      else this.storage.manager.addCheerCharges(1, true);
    }

    const tile = WORLD_MAP[this.tileY]?.[this.tileX] ?? 0;

    // Auto-heal when stepping onto Starlight Healing Fountain tile (v1 parity)
    let steppedHealSpot = false;
    if (tile === TILE.HEAL && this.needsAutoHeal()) {
      steppedHealSpot = true;
    }

    const encounterBiome = ENCOUNTER_TILE_BIOME[tile];
    const onGrass = Boolean(encounterBiome);

    // Wild encounter pacing (exact BALANCE.overworld + v1 overworld.js:2643 rules!)
    let wildEncounterTriggered: OverworldStepEvent['wildEncounterTriggered'];
    if (this.graceSteps > 0) {
      this.graceSteps -= 1;
      this.wildStreak = 0;
    } else {
      if (newBiome !== 'village') {
        this.stepsSinceWild += 1;
      }
      if (encounterBiome && newBiome !== 'village') {
        if (this.stepsSinceWild >= BALANCE.overworld.minStepsBetweenWilds) {
          this.wildStreak += 1;
          const triggered =
            this.wildStreak >= BALANCE.overworld.maxEncounterStreak
            || Math.random() < BALANCE.overworld.wildEncounterChance;
          if (triggered) {
            this.stepsSinceWild = 0;
            this.wildStreak = 0;
            this.bfsPath = [];
            this.autoInteractTarget = null;
            const depthInfo = getTileDepthInfo(this.tileX, this.tileY);
            const depthTier = depthInfo?.depthTier ?? 0;
            const rareChance = depthTier >= 2 ? 0.06 : depthTier === 1 ? 0.035 : 0.02;
            const isRarePatch = Boolean(depthInfo?.isRarePatch) || Math.random() < rareChance;
            wildEncounterTriggered = {
              biomeId: encounterBiome,
              depthTier,
              isRarePatch,
            };
          }
        }
      } else {
        // v1 overworld.js:2661 parity: stepping off encounter tiles resets consecutive wild streak
        this.wildStreak = 0;
      }
    }

    this.refreshState();
    return {
      moved: true,
      onGrass,
      biomeChanged,
      wildEncounterTriggered,
      discoveryPicked,
      steppedHealSpot: steppedHealSpot || undefined,
      newBadgeIds: newBadgeIds.length > 0 ? newBadgeIds : undefined,
      stepCheerEarned: Boolean(stepMeta?.stepCheerEarned),
      stepArcadeChargeEarned: Boolean(stepMeta?.stepArcadeChargeEarned),
    };
  }

  update(dtSeconds: number, heldInput: { dx: number; dy: number }): OverworldStepEvent | null {
    const dt = Math.min(0.05, Math.max(0.001, dtSeconds));
    this.state.elapsedSeconds += dt;
    if (this.state.biomeBannerTimer > 0) {
      this.state.biomeBannerTimer = Math.max(0, this.state.biomeBannerTimer - dt);
    }
    this.maybeRespawnNearbyDiscoveryNodes(dt);

    let stepEvent: OverworldStepEvent | null = null;
    this.moveCooldown = Math.max(0, this.moveCooldown - dt);

    if (heldInput.dx !== 0 || heldInput.dy !== 0) {
      this.bfsPath = [];
      this.autoInteractTarget = null;
      this.state.bfsPath = [];
      if (this.moveCooldown <= 0) {
        stepEvent = this.stepDirection(heldInput.dx, heldInput.dy);
        this.moveCooldown = 0.145;
      }
    } else if (this.bfsPath.length > 0 && this.moveCooldown <= 0) {
      const next = this.bfsPath.shift()!;
      stepEvent = this.stepDirection(next.x - this.tileX, next.y - this.tileY);
      this.moveCooldown = 0.135;
      if (!stepEvent.moved) {
        this.bfsPath = [];
        this.autoInteractTarget = null;
        this.state.bfsPath = [];
      } else if (this.bfsPath.length === 0 && this.autoInteractTarget && !stepEvent.wildEncounterTriggered) {
        const target = this.autoInteractTarget;
        this.autoInteractTarget = null;
        const dist = Math.abs(target.x - this.tileX) + Math.abs(target.y - this.tileY);
        if (dist <= 1) {
          this.faceTile(target.x, target.y);
          stepEvent.arrivedInteractTarget = target;
        }
      }
    }

    // Smooth visual interpolation toward logical tile
    const lerpRate = 1 - Math.pow(0.0004, dt);
    this.floatX += (this.tileX - this.floatX) * lerpRate;
    this.floatY += (this.tileY - this.floatY) * lerpRate;

    const moving = Math.hypot(this.tileX - this.floatX, this.tileY - this.floatY) > 0.03
      || heldInput.dx !== 0 || heldInput.dy !== 0 || this.bfsPath.length > 0;

    // Follower smoothly trails onto player's previous walkable tile (never clips into walls)
    const fRate = 1 - Math.pow(0.004, dt);
    this.followerX += (this.followerTargetX - this.followerX) * fRate;
    this.followerY += (this.followerTargetY - this.followerY) * fRate;

    this.state.player.x = this.floatX;
    this.state.player.y = this.floatY;
    this.state.player.tileX = this.tileX;
    this.state.player.tileY = this.tileY;
    this.state.player.facing = this.facing;
    this.state.player.moving = moving;
    this.state.player.walkCycle = moving ? this.state.player.walkCycle + dt * 8.5 : 0;

    if (this.state.follower) {
      this.state.follower.x = this.followerX;
      this.state.follower.y = this.followerY;
      this.state.follower.facing = this.followerFacing;
      this.state.follower.moving = moving || Math.hypot(this.followerTargetX - this.followerX, this.followerTargetY - this.followerY) > 0.04;
      this.state.follower.walkCycle = this.state.follower.moving ? this.state.follower.walkCycle + dt * 7.5 : 0;
    }

    return stepEvent;
  }

  resolveNearbyInteractable(): OverworldInteractable | null {
    const dirVec =
      this.facing === 'up' ? [0, -1]
        : this.facing === 'down' ? [0, 1]
          : this.facing === 'left' ? [-1, 0]
            : [1, 0];
    const fx = this.tileX + dirVec[0];
    const fy = this.tileY + dirVec[1];

    // 1. Strictly prioritize the exact tile the player is facing (v1 parity!)
    const faced = this.getInteractableAtTile(fx, fy);
    if (faced && faced.kind !== 'fountain') {
      return faced;
    }

    // 2. Standing directly on a Healing Fountain tile
    if (WORLD_MAP[this.tileY]?.[this.tileX] === TILE.HEAL) {
      return {
        kind: 'fountain',
        id: `fountain-${this.tileX}-${this.tileY}`,
        x: this.tileX,
        y: this.tileY,
        label: 'Starlight Healing Fountain',
        actionVerb: 'Heal Team',
      };
    }

    // 3. Facing a Healing Fountain directly
    if (faced) {
      return faced;
    }

    // 4. Forgiving adjacent fallback (closest interactable within 1.45 tiles so sideways stand-next-to works seamlessly)
    const candidates: Array<{ item: OverworldInteractable; dist: number; priority: number }> = [];
    const consider = (item: OverworldInteractable, priority: number, maxDist = 1.45) => {
      const d = Math.hypot(item.x - this.tileX, item.y - this.tileY);
      if (d <= maxDist) {
        candidates.push({ item, dist: d, priority });
      }
    };

    if (SECRET_ARCADE_SPOT) {
      const unlocked = this.storage.manager.isArcadeUnlocked();
      consider({
        kind: 'secret-arcade',
        id: 'secret-arcade',
        x: SECRET_ARCADE_SPOT.x,
        y: SECRET_ARCADE_SPOT.y,
        label: unlocked ? 'Starlight Sky-Hop Arcade' : 'Mysterious Star Emblem',
        actionVerb: unlocked ? 'Play Arcade' : 'Inspect Star',
      }, 1, 1.45);
    }

    for (const h of this.healTiles) {
      consider({
        kind: 'fountain',
        id: `fountain-${h.x}-${h.y}`,
        x: h.x,
        y: h.y,
        label: 'Starlight Healing Fountain',
        actionVerb: 'Heal Team',
      }, 2, 1.45);
    }

    for (const sh of this.state.shrines) {
      consider({
        kind: 'shrine',
        id: sh.id,
        x: sh.x,
        y: sh.y,
        label: sh.name,
        actionVerb: sh.cleared ? 'Astral Trial' : 'Challenge Shrine',
      }, 3, 1.5);
    }

    for (const rv of this.state.rivals) {
      consider({
        kind: 'rival',
        id: rv.id,
        x: rv.x,
        y: rv.y,
        label: rv.name,
        actionVerb: rv.defeated ? 'Rematch Duel' : 'Challenge Rival',
      }, 4, 1.5);
    }

    for (const ch of this.state.chests) {
      if (!ch.opened) {
        consider({
          kind: 'chest',
          id: ch.id,
          x: ch.x,
          y: ch.y,
          label: ch.label,
          actionVerb: 'Open Chest',
        }, 5, 1.45);
      }
    }

    for (const npc of this.state.npcs) {
      consider({
        kind: 'npc',
        id: npc.id,
        x: npc.x,
        y: npc.y,
        label: npc.name,
        actionVerb: npc.hasAvailableQuest ? 'Talk (Quest)' : 'Talk',
      }, 6, 1.5);
    }

    for (const sign of this.state.signposts) {
      consider({
        kind: 'signpost',
        id: sign.id,
        x: sign.x,
        y: sign.y,
        label: sign.title,
        actionVerb: 'Read Sign',
      }, 7, 1.45);
    }

    for (const lm of this.state.landmarks) {
      consider({
        kind: 'landmark',
        id: lm.id,
        x: lm.x,
        y: lm.y,
        label: lm.name,
        actionVerb: 'Inspect',
      }, 8, 1.45);
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.dist - b.dist || a.priority - b.priority);
    return candidates[0].item;
  }

  buildTacticalBriefing(
    kind: TacticalBriefingData['kind'],
    targetId: string,
    biomeIdOverride?: BiomeId,
  ): TacticalBriefingData {
    const profile = this.storage.manager.getActiveProfile();
    const farmZone = resolveFarmingBiomeForLevel(profile);
    const farmBiomeId = (farmZone.biomeId as BiomeId) || 'forest';
    const farmBiomeName = stripEmojis(farmZone.biome?.name || 'Whispering Forest');

    let title = 'Area Readiness';
    let subtitle = 'Starlight Island Scouting';
    let biomeId: BiomeId = biomeIdOverride ?? this.state.currentBiomeId;
    let enemyTypes: ElementalType[] = [];
    let enemyCount = 1;
    let targetLevel = 5;
    let previewSpeciesId = 25;

    if (kind === 'shrine' || kind === 'shrine-trial') {
      const shrineList = Object.values(SHRINES);
      const shrine = shrineList.find((s) => s.id === targetId) ?? shrineList[0];
      biomeId = (shrine.biome as BiomeId) || biomeId;
      const spec = kind === 'shrine-trial'
        ? getScaledShrineTrial(shrine, profile)
        : getScaledShrineGuard(shrine, profile);
      previewSpeciesId = spec.guardianId;
      targetLevel = spec.level;
      enemyTypes = [getSpeciesEntry(spec.guardianId).type];
      title = kind === 'shrine-trial' ? `${stripEmojis(shrine.name)} (Trial #${(spec as { trialNumber?: number }).trialNumber ?? 1})` : stripEmojis(shrine.name);
      subtitle = `Guardian ${getSpeciesEntry(spec.guardianId).name} - Lv.${spec.level}`;
    } else if (kind === 'rival') {
      const rivalList = Object.values(RIVAL_TRAINERS);
      const rival = rivalList.find((r) => r.id === targetId) ?? rivalList[0];
      biomeId = (rival.biome as BiomeId) || biomeId;
      const party = getScaledRivalParty(rival, profile);
      enemyCount = party.length;
      const ace = party[party.length - 1] ?? party[0];
      previewSpeciesId = ace?.speciesId ?? 25;
      targetLevel = ace?.level ?? 8;
      enemyTypes = [...new Set(party.map((p) => getSpeciesEntry(p.speciesId).type))];
      title = stripEmojis(rival.name);
      subtitle = `${enemyCount}-Pokémon Duel - Ace Lv.${targetLevel}`;
    } else {
      const biome = BIOMES[biomeId] ?? BIOMES.forest;
      title = stripEmojis(biome.name);
      subtitle = getBiomeVisualProfile(biomeId).subtitle;
      const range = biome.levelRange ?? [2, 7];
      targetLevel = Math.round((range[0] + range[1]) / 2);
      const sampleEnc = biome.encounters?.[0];
      previewSpeciesId = sampleEnc?.id ?? 25;
      enemyTypes = [getBiomeVisualProfile(biomeId).elementalType];
    }

    const readiness = assessEncounterReadiness(profile, {
      kind: kind === 'biome' ? 'biome' : kind,
      targetLevel,
      enemyTypes,
      enemyCount,
      typeChart: TYPE_CHART,
    });

    return {
      kind,
      targetId,
      title,
      subtitle,
      biomeId,
      enemyTypes,
      enemyCount,
      teamLevel: readiness.teamLevel,
      targetLevel: readiness.targetLevel,
      levelDelta: readiness.levelDelta,
      needsHeal: readiness.needsHeal,
      avgHpRatio: readiness.avgHpRatio,
      faintedCount: readiness.faintedCount,
      healthyCount: readiness.healthyCount,
      hasTypeAdvantage: readiness.hasTypeAdvantage,
      hasTypeRisk: readiness.hasTypeRisk,
      suggestedCounterTypes: readiness.suggestedCounterTypes as ElementalType[],
      tier: readiness.tier as ReadinessTier,
      label: stripEmojis(readiness.label),
      iconId: readinessTierToIconId(readiness.tier),
      tip: stripEmojis(readiness.tip),
      previewSpeciesId,
      previewSpeciesName: getSpeciesEntry(previewSpeciesId).name,
      canChallenge: readiness.healthyCount > 0 || (Array.isArray(profile?.team) && profile.team.length === 0),
      farmZoneBiomeId: farmBiomeId,
      farmZoneBiomeName: farmBiomeName,
    };
  }

  refreshState(): OverworldSceneState {
    this.state = this.buildSceneState();
    return this.state;
  }

  private buildSceneState(): OverworldSceneState {
    const profileLive = this.storage.manager.getActiveProfile();
    const profile = this.storage.getActiveProfileJSON();
    const trainerId: TrainerId = (profile?.trainerId === 'ozias' ? 'ozias' : 'violet');
    const look = getResolvedTrainerLook(trainerId, profile?.appearance);
    const displayName = getCleanTrainerName(profile, trainerId);
    const currentBiomeObj = getBiomeAt(this.tileX, this.tileY) ?? BIOMES.village;
    const currentBiomeId = (currentBiomeObj.id as BiomeId) || 'village';

    const shrinesCleared = new Set(profile?.shrinesCleared ?? []);
    const chestsOpened = new Set(profile?.chestsOpened ?? []);
    const npcsTalked = new Set(profile?.npcsTalked ?? []);
    const questsDone = new Set(profile?.questsCompleted ?? []);
    const rivalsDefeated = new Set(profile?.rivalsDefeated ?? []);

    const shrines: OverworldShrineNode[] = Object.values(SHRINES).map((s) => {
      const coord = this.shrineCoords.get(s.id) ?? { x: 10, y: 10 };
      const guardian = getSpeciesEntry(s.guardianId);
      const readiness = assessEncounterReadiness(profileLive, {
        kind: 'shrine',
        targetLevel: s.level,
        enemyTypes: [guardian.type],
        typeChart: TYPE_CHART,
      });
      return {
        id: s.id,
        biomeId: (s.biome as BiomeId) || 'forest',
        x: coord.x,
        y: coord.y,
        name: stripEmojis(s.name),
        guardianId: s.guardianId,
        guardianName: guardian.name,
        elementalType: guardian.type,
        level: s.level,
        cleared: shrinesCleared.has(s.id),
        readinessTier: readiness.tier as ReadinessTier,
      };
    });

    const chests: OverworldChestNode[] = Object.values(CHESTS).map((c) => {
      const coord = this.chestCoords.get(c.id) ?? { x: 10, y: 10 };
      const bId = ((c.biome || getBiomeAt(coord.x, coord.y)?.id) as BiomeId) || 'forest';
      return {
        id: c.id,
        biomeId: bId,
        x: coord.x,
        y: coord.y,
        label: stripEmojis(c.label || 'Starlight Treasure Chest'),
        opened: chestsOpened.has(c.id),
      };
    });

    const questByNpcId = new Map(FIELD_QUESTS.map((q) => [q.npcId, q]));
    const questById = new Map(FIELD_QUESTS.map((q) => [q.id, q]));
    const npcs: OverworldNpcNode[] = Object.entries(NPCS).map(([key, n]) => {
      const { x, y } = parseCoordKey(key);
      const quest = (n.questId ? questById.get(n.questId) : null) ?? questByNpcId.get(n.id) ?? null;
      const done = Boolean(quest && questsDone.has(quest.id));
      return {
        id: n.id,
        x,
        y,
        name: stripEmojis(n.name),
        role: n.id.includes('willow') || n.name.toLowerCase().includes('willow')
          ? 'professor'
          : quest
            ? 'quest'
            : 'villager',
        accentHex: n.palette?.outfitPrimary || n.palette?.outfitSecondary || '#a855f7',
        talked: npcsTalked.has(n.id),
        hasAvailableQuest: Boolean(quest && !done),
        questCompleted: done,
      };
    });

    const rivals: OverworldRivalNode[] = Object.entries(RIVAL_TRAINERS).map(([key, r]) => {
      const { x, y } = parseCoordKey(key);
      const ace = r.party?.[r.party.length - 1] ?? { speciesId: 25, level: 8 };
      const aceType = getSpeciesEntry(ace.speciesId).type;
      const readiness = assessEncounterReadiness(profileLive, {
        kind: 'rival',
        targetLevel: ace.level,
        enemyTypes: [aceType],
        enemyCount: r.party?.length ?? 1,
        typeChart: TYPE_CHART,
      });
      return {
        id: r.id,
        biomeId: (r.biome as BiomeId) || 'forest',
        x,
        y,
        name: stripEmojis(r.name),
        title: stripEmojis(r.role || 'Starlight Rival'),
        accentHex: r.palette?.outfitPrimary || '#f43f5e',
        defeated: rivalsDefeated.has(r.id),
        rematchCount: profile?.rivalRematchCounts?.[r.id] ?? 0,
        readinessTier: readiness.tier as ReadinessTier,
      };
    });

    const landmarks: OverworldLandmarkNode[] = Object.entries(LANDMARKS).map(([key, l]) => {
      const { x, y } = parseCoordKey(key);
      const lower = l.name.toLowerCase();
      const kind: OverworldLandmarkNode['kind'] =
        lower.includes('lab') ? 'lab'
          : lower.includes('observatory') || lower.includes('telescope') ? 'observatory'
            : lower.includes('fountain') ? 'fountain'
              : lower.includes('cottage') || lower.includes('home') ? 'cottage'
                : lower.includes('shrine') || lower.includes('citadel') ? 'shrine-arch'
                  : 'obelisk';
      return {
        id: l.id,
        biomeId: (l.biome as BiomeId) || 'village',
        x,
        y,
        name: stripEmojis(l.name),
        kind,
        accentHex: '#ffd479',
      };
    });

    const signposts: OverworldSignpostNode[] = Object.entries(SIGNPOSTS).map(([key, text]) => {
      const { x, y } = parseCoordKey(key);
      const biome = getBiomeAt(x, y);
      return {
        id: `sign-${key}`,
        x,
        y,
        title: `${stripEmojis(biome?.name || 'Starlight Island')} Signpost`,
        text: stripEmojis(text),
      };
    });

    // Lead Pokémon Follower
    const lead = profile?.team?.[0];
    let follower: OverworldSceneState['follower'] = null;
    if (lead) {
      const sp = getSpeciesEntry(lead.speciesId);
      const cachedFrames = this.sprites.getCached(lead.speciesId, { back: false, shiny: lead.isShiny });
      if (!cachedFrames) {
        void this.sprites.loadSpeciesSprite(lead.speciesId, { back: false, shiny: lead.isShiny });
      }
      follower = {
        speciesId: lead.speciesId,
        name: stripEmojis(lead.nickname || sp.name),
        type: sp.type,
        isShiny: Boolean(lead.isShiny),
        x: this.followerX,
        y: this.followerY,
        facing: this.facing,
        moving: false,
        walkCycle: this.state?.follower?.walkCycle ?? 0,
        frames: cachedFrames,
      };
    }

    // Compass Guidance
    let compassTarget: CompassTarget | null = null;
    try {
      const rawGuide = getCompassGuidance(profileLive, SPECIES);
      const tx = typeof rawGuide?.targetX === 'number' ? rawGuide.targetX : rawGuide?.x;
      const ty = typeof rawGuide?.targetY === 'number' ? rawGuide.targetY : rawGuide?.y;
      if (rawGuide && typeof tx === 'number' && typeof ty === 'number') {
        const dx = tx - this.tileX;
        const dy = ty - this.tileY;
        const titleStr = stripEmojis(rawGuide.title || rawGuide.label || 'Next Destination');
        const lowerTitle = titleStr.toLowerCase();
        const inferredKind: CompassTarget['kind'] =
          rawGuide.kind === 'shrine' || lowerTitle.includes('shrine') || lowerTitle.includes('sanctum')
            ? 'shrine'
            : rawGuide.kind === 'quest' || lowerTitle.includes('talk') || lowerTitle.includes('meet')
              ? 'quest'
              : rawGuide.kind === 'rival'
                ? 'rival'
                : rawGuide.kind === 'chest' || lowerTitle.includes('claim') || lowerTitle.includes('supplies')
                  ? 'chest'
                  : 'explore';
        compassTarget = {
          x: tx,
          y: ty,
          label: titleStr,
          biomeId: ((rawGuide.targetBiomeId || rawGuide.biome || getBiomeAt(tx, ty)?.id) as BiomeId) || 'forest',
          kind: inferredKind,
          distanceTiles: Math.round(Math.hypot(dx, dy)),
          angleRad: Math.atan2(dy, dx),
        };
      }
    } catch {
      compassTarget = null;
    }

    const nextState: OverworldSceneState = {
      cols: WORLD_COLS,
      rows: WORLD_ROWS,
      tileSize: GAME_META.tileSize,
      worldMap: WORLD_MAP,
      currentBiomeId,
      currentBiomeName: stripEmojis(currentBiomeObj.name),
      biomeBannerTimer: this.state?.biomeBannerTimer ?? 2.2,
      player: {
        trainerId,
        displayName,
        x: this.floatX,
        y: this.floatY,
        tileX: this.tileX,
        tileY: this.tileY,
        facing: this.facing,
        moving: this.state?.player?.moving ?? false,
        walkCycle: this.state?.player?.walkCycle ?? 0,
        look,
      },
      follower,
      shrines,
      chests,
      npcs,
      rivals,
      landmarks,
      signposts,
      discoveryNodes: this.discoveryNodes,
      bfsPath: this.bfsPath,
      secretArcadeSpot: {
        x: SECRET_ARCADE_SPOT.x,
        y: SECRET_ARCADE_SPOT.y,
        unlocked: Boolean(profile?.arcade?.unlocked),
        knocks: profile?.arcade?.secretKnocks ?? 0,
      },
      nearbyInteraction: null,
      compassTarget,
      timeOfDay: 0.78, // Cozy starlight twilight
      elapsedSeconds: this.state?.elapsedSeconds ?? 0,
      reducedMotion: this.storage.getSettings().reducedMotion,
      stepsTotal: profile?.stats?.steps ?? 0,
    };
    this.state = nextState;
    nextState.nearbyInteraction = this.resolveNearbyInteractable();
    return nextState;
  }

  getSafeWarpCoords(): { x: number; y: number } {
    const pt = getSafeZoneWarpPoint();
    return { x: pt.x, y: pt.y };
  }
}
