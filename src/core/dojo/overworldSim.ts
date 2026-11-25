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
  BADGES,
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

export type V1DiscoveryKind = 'shimmer' | 'starfall' | 'mystery_cry';

export interface V1DiscoveryNode extends OverworldDiscoveryNode {
  v1Kind: V1DiscoveryKind;
  ttl: number;
}

export interface TacticalBriefingPartyMember {
  speciesId: number;
  name: string;
  level: number;
  upgradeTier: number;
  type: ElementalType;
}

export interface TacticalBriefingV1Data extends TacticalBriefingData {
  upgradeTier: number;
  badgeName: string | null;
  partyPreview: TacticalBriefingPartyMember[];
  minLv: number;
  maxLv: number;
  rematchNumber: number | null;
  trialNumber: number | null;
  isAstralTrial: boolean;
  isRematch: boolean;
  pivot: { action: 'safe' | 'farm'; label: string } | null;
}

const DISCOVERY_NODE_KINDS: readonly V1DiscoveryKind[] = ['shimmer', 'starfall', 'mystery_cry'];

export interface OverworldStepEvent {
  moved: boolean;
  onGrass: boolean;
  biomeChanged?: BiomeId;
  wildEncounterTriggered?: { biomeId: BiomeId; depthTier: number; isRarePatch: boolean };
  discoveryPicked?: V1DiscoveryNode;
  mysteryCrySpeciesId?: number;
  mysteryCrySpeciesName?: string;
  steppedHealSpot?: boolean;
  arrivedInteractTarget?: { x: number; y: number };
  newBadgeIds?: string[];
  stepCheerEarned?: boolean;
  stepArcadeChargeEarned?: boolean;
}

const BFS_GRID_SIZE = WORLD_COLS * WORLD_ROWS;
const bfsVisitedStamp = new Uint32Array(BFS_GRID_SIZE);
const bfsParent = new Int32Array(BFS_GRID_SIZE);
const bfsQueue = new Int32Array(BFS_GRID_SIZE);
let bfsCurrentStamp = 0;

const BFS_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

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
  bfsCurrentStamp += 1;
  if (bfsCurrentStamp >= 0xfffffffe) {
    bfsVisitedStamp.fill(0);
    bfsCurrentStamp = 1;
  }
  const stamp = bfsCurrentStamp;

  let head = 0;
  let tail = 0;
  const startIdx = sy * WORLD_COLS + sx;
  bfsVisitedStamp[startIdx] = stamp;
  bfsParent[startIdx] = -1;
  bfsQueue[tail++] = startIdx;

  let bestIdx = -1;
  let bestDist = Infinity;

  let expanded = 0;
  while (head < tail && expanded < maxExpanded) {
    const cur = bfsQueue[head++];
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

    for (let d = 0; d < 4; d++) {
      const nx = cx + BFS_DIRS[d][0];
      const ny = cy + BFS_DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= WORLD_COLS || ny >= WORLD_ROWS) continue;
      const nIdx = ny * WORLD_COLS + nx;
      if (bfsVisitedStamp[nIdx] === stamp) continue;
      if (!isTileWalkableAt(nx, ny)) continue;
      bfsVisitedStamp[nIdx] = stamp;
      bfsParent[nIdx] = cur;
      bfsQueue[tail++] = nIdx;
    }
  }

  if (bestIdx === -1 || bestIdx === startIdx) return [];
  const path: Array<{ x: number; y: number }> = [];
  let cur = bestIdx;
  while (cur !== -1 && cur !== startIdx) {
    const px = cur % WORLD_COLS;
    const py = (cur - px) / WORLD_COLS;
    path.push({ x: px, y: py });
    cur = bfsParent[cur];
  }
  path.reverse();
  return path;
}

function parseCoordKey(key: string): { x: number; y: number } {
  const [xs, ys] = key.split(',');
  return { x: Number(xs) || 0, y: Number(ys) || 0 };
}

interface StaticShrineSpec {
  id: string;
  biomeId: BiomeId;
  x: number;
  y: number;
  name: string;
  guardianId: number;
  guardianName: string;
  elementalType: ElementalType;
  level: number;
  rawShrine: (typeof SHRINES)[string];
}

interface StaticChestSpec {
  id: string;
  biomeId: BiomeId;
  x: number;
  y: number;
  label: string;
}

interface StaticNpcSpec {
  id: string;
  x: number;
  y: number;
  name: string;
  role: OverworldNpcNode['role'];
  accentHex: string;
  questId: string | null;
}

interface StaticRivalSpec {
  id: string;
  biomeId: BiomeId;
  x: number;
  y: number;
  name: string;
  title: string;
  accentHex: string;
  aceLevel: number;
  aceType: ElementalType;
  partyCount: number;
  rawRival: (typeof RIVAL_TRAINERS)[string];
}

interface StaticTileEntry {
  kind: 'secret-arcade' | 'fountain' | 'shrine' | 'rival' | 'chest' | 'npc' | 'signpost' | 'landmark';
  priority: number;
  maxDist: number;
  index: number;
  x: number;
  y: number;
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
  private discoveryNodes: V1DiscoveryNode[] = [];
  private discoverySpawnCooldown = 0;
  private discoveryKindBag: V1DiscoveryKind[] = [];
  private lastDiscoveryKind: V1DiscoveryKind | null = null;
  private discoverySeq = 100;
  private readonly staticShrines: StaticShrineSpec[] = [];
  private readonly staticChests: StaticChestSpec[] = [];
  private readonly staticNpcs: StaticNpcSpec[] = [];
  private readonly staticRivals: StaticRivalSpec[] = [];
  private readonly staticLandmarks: OverworldLandmarkNode[] = [];
  private readonly staticSignposts: OverworldSignpostNode[] = [];
  private readonly tileInteractables = new Map<number, StaticTileEntry[]>();
  private readonly actorBlockedTiles = new Set<number>();
  private cachedReadinessSig = '';
  private cachedShrineReadiness: ReadinessTier[] = [];
  private cachedShrineLevels: number[] = [];
  private cachedRivalReadiness: ReadinessTier[] = [];

  constructor(storage: StarlightStorageBridge, sprites: SpriteAssetLoader) {
    this.storage = storage;
    this.sprites = sprites;

    const addTileEntry = (entry: StaticTileEntry) => {
      const idx = entry.y * WORLD_COLS + entry.x;
      let list = this.tileInteractables.get(idx);
      if (!list) {
        list = [];
        this.tileInteractables.set(idx, list);
      }
      list.push(entry);
    };

    if (SECRET_ARCADE_SPOT) {
      addTileEntry({
        kind: 'secret-arcade',
        priority: 1,
        maxDist: 1.45,
        index: 0,
        x: SECRET_ARCADE_SPOT.x,
        y: SECRET_ARCADE_SPOT.y,
      });
    }

    // Scan static map for HEAL tiles once
    for (let y = 0; y < WORLD_ROWS; y++) {
      const row = WORLD_MAP[y];
      if (!row) continue;
      for (let x = 0; x < WORLD_COLS; x++) {
        if (row[x] === TILE.HEAL) {
          addTileEntry({ kind: 'fountain', priority: 2, maxDist: 1.45, index: 0, x, y });
        }
      }
    }

    // Precompute static shrines
    for (const [key, s] of Object.entries(SHRINES)) {
      const coord = parseCoordKey(key);
      const guardian = getSpeciesEntry(s.guardianId);
      const idx = this.staticShrines.length;
      this.staticShrines.push({
        id: s.id,
        biomeId: (s.biome as BiomeId) || 'forest',
        x: coord.x,
        y: coord.y,
        name: stripEmojis(s.name),
        guardianId: s.guardianId,
        guardianName: guardian.name,
        elementalType: guardian.type,
        level: s.level,
        rawShrine: s,
      });
      addTileEntry({ kind: 'shrine', priority: 3, maxDist: 1.5, index: idx, x: coord.x, y: coord.y });
    }

    // Precompute static chests
    for (const [key, c] of Object.entries(CHESTS)) {
      const coord = parseCoordKey(key);
      const bId = ((c.biome || getBiomeAt(coord.x, coord.y)?.id) as BiomeId) || 'forest';
      const idx = this.staticChests.length;
      this.staticChests.push({
        id: c.id,
        biomeId: bId,
        x: coord.x,
        y: coord.y,
        label: stripEmojis(c.label || 'Starlight Treasure Chest'),
      });
      addTileEntry({ kind: 'chest', priority: 5, maxDist: 1.45, index: idx, x: coord.x, y: coord.y });
    }

    // Precompute static NPCs & quest links
    const questByNpcId = new Map(FIELD_QUESTS.map((q) => [q.npcId, q]));
    const questById = new Map(FIELD_QUESTS.map((q) => [q.id, q]));
    for (const [key, n] of Object.entries(NPCS)) {
      const { x, y } = parseCoordKey(key);
      const quest = (n.questId ? questById.get(n.questId) : null) ?? questByNpcId.get(n.id) ?? null;
      const idx = this.staticNpcs.length;
      this.staticNpcs.push({
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
        questId: quest ? quest.id : null,
      });
      this.actorBlockedTiles.add(y * WORLD_COLS + x);
      addTileEntry({ kind: 'npc', priority: 6, maxDist: 1.5, index: idx, x, y });
    }

    // Precompute static Rivals
    for (const [key, r] of Object.entries(RIVAL_TRAINERS)) {
      const { x, y } = parseCoordKey(key);
      const ace = r.party?.[r.party.length - 1] ?? { speciesId: 25, level: 8 };
      const aceType = getSpeciesEntry(ace.speciesId).type;
      const idx = this.staticRivals.length;
      this.staticRivals.push({
        id: r.id,
        biomeId: (r.biome as BiomeId) || 'forest',
        x,
        y,
        name: stripEmojis(r.name),
        title: stripEmojis(r.role || 'Starlight Rival'),
        accentHex: r.palette?.outfitPrimary || '#f43f5e',
        aceLevel: ace.level,
        aceType,
        partyCount: r.party?.length ?? 1,
        rawRival: r,
      });
      this.actorBlockedTiles.add(y * WORLD_COLS + x);
      addTileEntry({ kind: 'rival', priority: 4, maxDist: 1.5, index: idx, x, y });
    }

    // Precompute static Landmarks (immutable across entire session)
    for (const [key, l] of Object.entries(LANDMARKS)) {
      const { x, y } = parseCoordKey(key);
      const lower = l.name.toLowerCase();
      const kind: OverworldLandmarkNode['kind'] =
        lower.includes('lab') ? 'lab'
          : lower.includes('observatory') || lower.includes('telescope') ? 'observatory'
            : lower.includes('fountain') ? 'fountain'
              : lower.includes('cottage') || lower.includes('home') ? 'cottage'
                : lower.includes('shrine') || lower.includes('citadel') ? 'shrine-arch'
                  : 'obelisk';
      const idx = this.staticLandmarks.length;
      this.staticLandmarks.push({
        id: l.id,
        biomeId: (l.biome as BiomeId) || 'village',
        x,
        y,
        name: stripEmojis(l.name),
        kind,
        accentHex: '#ffd479',
      });
      addTileEntry({ kind: 'landmark', priority: 8, maxDist: 1.45, index: idx, x, y });
    }

    // Precompute static Signposts (immutable across entire session)
    for (const [key, text] of Object.entries(SIGNPOSTS)) {
      const { x, y } = parseCoordKey(key);
      const biome = getBiomeAt(x, y);
      const idx = this.staticSignposts.length;
      this.staticSignposts.push({
        id: `sign-${key}`,
        x,
        y,
        title: `${stripEmojis(biome?.name || 'Starlight Island')} Signpost`,
        text: stripEmojis(text),
      });
      addTileEntry({ kind: 'signpost', priority: 7, maxDist: 1.45, index: idx, x, y });
    }

    this.refreshDiscoveryNodes(0);
    this.state = this.buildSceneState();
  }

  private pickNextDiscoveryKind(): V1DiscoveryKind {
    if (this.discoveryKindBag.length === 0) {
      const freshBag: V1DiscoveryKind[] = [...DISCOVERY_NODE_KINDS];
      for (let i = freshBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = freshBag[i];
        freshBag[i] = freshBag[j];
        freshBag[j] = tmp;
      }
      if (this.lastDiscoveryKind && freshBag[0] === this.lastDiscoveryKind && freshBag.length > 1) {
        const swapIdx = 1 + Math.floor(Math.random() * (freshBag.length - 1));
        const tmp = freshBag[0];
        freshBag[0] = freshBag[swapIdx];
        freshBag[swapIdx] = tmp;
      }
      this.discoveryKindBag = freshBag;
    }

    const activeKinds = new Set(this.discoveryNodes.map((n) => n.v1Kind));
    let pickIdx = this.discoveryKindBag.findIndex((k) => k !== this.lastDiscoveryKind && !activeKinds.has(k));
    if (pickIdx === -1) {
      pickIdx = this.discoveryKindBag.findIndex((k) => k !== this.lastDiscoveryKind);
    }
    if (pickIdx === -1) pickIdx = 0;

    const [kind] = this.discoveryKindBag.splice(pickIdx, 1);
    const chosen: V1DiscoveryKind = kind ?? 'starfall';
    this.lastDiscoveryKind = chosen;
    return chosen;
  }

  private buildV1DiscoveryNode(x: number, y: number, biomeId: BiomeId, v1Kind: V1DiscoveryKind): V1DiscoveryNode {
    // Matches LandmarkRenderer 3-kind visual mapping (#16):
    // starfall -> starShard (cyan meteor), mystery_cry -> berry (violet music aura), shimmer -> greatBall (gold sparkles)
    const mappedKind: OverworldDiscoveryNode['kind'] =
      v1Kind === 'starfall' ? 'starShard' : v1Kind === 'mystery_cry' ? 'berry' : 'greatBall';
    const accentHex =
      v1Kind === 'starfall' ? '#67e8f9' : v1Kind === 'mystery_cry' ? '#c084fc' : '#facc15';
    return {
      id: `disc-${v1Kind}-${this.discoverySeq++}`,
      x,
      y,
      kind: mappedKind,
      v1Kind,
      biomeId,
      accentHex,
      spawnedAt: Math.round(this.state?.elapsedSeconds ?? 0),
      ttl: 18 + Math.random() * 6,
    };
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

  private buildInteractableFromEntry(entry: StaticTileEntry, skipOpenedChest: boolean): OverworldInteractable | null {
    switch (entry.kind) {
      case 'secret-arcade': {
        const unlocked = this.storage.manager.isArcadeUnlocked();
        return {
          kind: 'secret-arcade',
          id: 'secret-arcade',
          x: entry.x,
          y: entry.y,
          label: unlocked ? 'Starlight Sky-Hop Arcade' : 'Mysterious Star Emblem',
          actionVerb: unlocked ? 'Play Arcade' : 'Inspect Star',
        };
      }
      case 'fountain':
        return {
          kind: 'fountain',
          id: `fountain-${entry.x}-${entry.y}`,
          x: entry.x,
          y: entry.y,
          label: 'Starlight Healing Fountain',
          actionVerb: 'Heal Team',
        };
      case 'shrine': {
        const sh = this.state.shrines[entry.index];
        if (!sh) return null;
        return {
          kind: 'shrine',
          id: sh.id,
          x: sh.x,
          y: sh.y,
          label: sh.name,
          actionVerb: sh.cleared ? 'Astral Trial' : 'Challenge Shrine',
        };
      }
      case 'rival': {
        const rv = this.state.rivals[entry.index];
        if (!rv) return null;
        return {
          kind: 'rival',
          id: rv.id,
          x: rv.x,
          y: rv.y,
          label: rv.name,
          actionVerb: rv.defeated ? 'Rematch Duel' : 'Challenge Rival',
        };
      }
      case 'chest': {
        const ch = this.state.chests[entry.index];
        if (!ch || (skipOpenedChest && ch.opened)) return null;
        return {
          kind: 'chest',
          id: ch.id,
          x: ch.x,
          y: ch.y,
          label: ch.opened ? 'Opened Treasure Chest' : ch.label,
          actionVerb: ch.opened ? 'Inspect Chest' : 'Open Chest',
        };
      }
      case 'npc': {
        const npc = this.state.npcs[entry.index];
        if (!npc) return null;
        return {
          kind: 'npc',
          id: npc.id,
          x: npc.x,
          y: npc.y,
          label: npc.name,
          actionVerb: npc.hasAvailableQuest ? 'Talk (Quest)' : 'Talk',
        };
      }
      case 'signpost': {
        const sign = this.state.signposts[entry.index];
        if (!sign) return null;
        return {
          kind: 'signpost',
          id: sign.id,
          x: sign.x,
          y: sign.y,
          label: sign.title,
          actionVerb: 'Read Sign',
        };
      }
      case 'landmark': {
        const lm = this.state.landmarks[entry.index];
        if (!lm) return null;
        return {
          kind: 'landmark',
          id: lm.id,
          x: lm.x,
          y: lm.y,
          label: lm.name,
          actionVerb: 'Inspect',
        };
      }
    }
  }

  getInteractableAtTile(tx: number, ty: number): OverworldInteractable | null {
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return null;
    if (tx < 0 || ty < 0 || tx >= WORLD_COLS || ty >= WORLD_ROWS) return null;
    const entries = this.tileInteractables.get(ty * WORLD_COLS + tx);
    if (!entries || entries.length === 0) return null;
    let bestEntry: StaticTileEntry | null = null;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!bestEntry || e.priority < bestEntry.priority) {
        bestEntry = e;
      }
    }
    return bestEntry ? this.buildInteractableFromEntry(bestEntry, false) : null;
  }

  setBfsTarget(goalX: number, goalY: number, options?: { autoInteract?: boolean }): Array<{ x: number; y: number }> {
    const gx = Math.max(0, Math.min(WORLD_COLS - 1, Math.round(goalX)));
    const gy = Math.max(0, Math.min(WORLD_ROWS - 1, Math.round(goalY)));
    const interactive = options?.autoInteract ? this.getInteractableAtTile(gx, gy) : null;

    let targetX = gx;
    let targetY = gy;
    // V1 overworld.js forgiving Manhattan 1-2 wall-snap when tapping a non-interactable solid edge tile
    if (!interactive && !isTileWalkableAt(gx, gy)) {
      let snappedX = gx;
      let snappedY = gy;
      let bestScore = Infinity;
      for (let dist = 1; dist <= 2 && bestScore === Infinity; dist++) {
        for (let dy = -dist; dy <= dist; dy++) {
          for (let dx = -dist; dx <= dist; dx++) {
            if (Math.abs(dx) + Math.abs(dy) !== dist) continue;
            const cx = gx + dx;
            const cy = gy + dy;
            if (cx < 0 || cy < 0 || cx >= WORLD_COLS || cy >= WORLD_ROWS) continue;
            if (!isTileWalkableAt(cx, cy) || this.actorBlockedTiles.has(cy * WORLD_COLS + cx)) continue;
            const playerDist = Math.abs(cx - this.tileX) + Math.abs(cy - this.tileY);
            if (playerDist < bestScore) {
              bestScore = playerDist;
              snappedX = cx;
              snappedY = cy;
            }
          }
        }
      }
      targetX = snappedX;
      targetY = snappedY;
    }

    this.bfsPath = findBfsPath(this.tileX, this.tileY, targetX, targetY);
    this.autoInteractTarget = interactive ? { x: gx, y: gy } : null;
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

  private refreshDiscoveryNodes(dt: number): void {
    // Expire old or distant dynamic V1 discovery nodes (shimmer / starfall / mystery_cry)
    for (let i = this.discoveryNodes.length - 1; i >= 0; i--) {
      const node = this.discoveryNodes[i];
      node.ttl -= dt;
      const dist = Math.abs(node.x - this.tileX) + Math.abs(node.y - this.tileY);
      if (node.ttl <= 0 || dist > 18) {
        this.discoveryNodes.splice(i, 1);
      }
    }

    if (dt > 0) {
      this.discoverySpawnCooldown -= dt;
    }
    if (this.discoveryNodes.length >= 2 || this.discoverySpawnCooldown > 0) return;

    const occupied = new Set<number>();
    for (let i = 0; i < this.discoveryNodes.length; i++) {
      occupied.add(this.discoveryNodes[i].y * WORLD_COLS + this.discoveryNodes[i].x);
    }

    const candidates: Array<{ x: number; y: number; biomeId: BiomeId }> = [];
    for (let dy = -7; dy <= 7; dy++) {
      for (let dx = -9; dx <= 9; dx++) {
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist < 2 || dist > 12) continue;
        const cx = this.tileX + dx;
        const cy = this.tileY + dy;
        if (cx < 0 || cy < 0 || cx >= WORLD_COLS || cy >= WORLD_ROWS) continue;
        const key = cy * WORLD_COLS + cx;
        if (occupied.has(key) || this.actorBlockedTiles.has(key) || !isTileWalkableAt(cx, cy)) continue;
        const tile = WORLD_MAP[cy]?.[cx];
        const biomeId = ENCOUNTER_TILE_BIOME[tile];
        if (biomeId) {
          candidates.push({ x: cx, y: cy, biomeId });
        }
      }
    }

    if (candidates.length > 0) {
      const slots = Math.min(2 - this.discoveryNodes.length, candidates.length);
      for (let i = 0; i < slots; i++) {
        const pickIdx = Math.floor(Math.random() * candidates.length);
        const [chosen] = candidates.splice(pickIdx, 1);
        const v1Kind = this.pickNextDiscoveryKind();
        this.discoveryNodes.push(this.buildV1DiscoveryNode(chosen.x, chosen.y, chosen.biomeId, v1Kind));
      }
      this.discoverySpawnCooldown = 4.0;
    } else {
      this.discoverySpawnCooldown = 2.0;
    }
  }

  private pickMysteryCrySpecies(biomeId: BiomeId): { speciesId: number; speciesName: string } {
    const profileLive = this.storage.manager.getActiveProfile();
    const seenIds = new Set<number>();
    const rawSeen = profileLive?.pokedex?.seen;
    if (Array.isArray(rawSeen)) {
      for (const id of rawSeen) {
        const n = Number(id);
        if (Number.isInteger(n) && n >= 1) seenIds.add(n);
      }
    } else if (rawSeen && typeof rawSeen === 'object') {
      for (const [k, v] of Object.entries(rawSeen)) {
        if (!v) continue;
        const n = Number(k);
        if (Number.isInteger(n) && n >= 1) seenIds.add(n);
      }
    }
    const biomeEncounters = (BIOMES[biomeId]?.encounters ?? [])
      .map((e: { id?: number }) => Number(e?.id))
      .filter((id: number) => Number.isInteger(id) && Boolean(SPECIES[id]));
    const unseen = biomeEncounters.filter((id: number) => !seenIds.has(id));
    const pool = unseen.length > 0 ? unseen : biomeEncounters;
    const speciesId = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : 25;
    return {
      speciesId,
      speciesName: getSpeciesEntry(speciesId).name,
    };
  }

  stepDirection(dx: number, dy: number, options?: { allowCornerSlide?: boolean }): OverworldStepEvent {
    const adx = Math.sign(dx);
    const ady = Math.sign(dy);
    if (adx === 0 && ady === 0) return { moved: false, onGrass: false };

    let stepDx = Math.abs(dx) >= Math.abs(dy) ? adx : 0;
    let stepDy = Math.abs(dy) > Math.abs(dx) ? ady : 0;
    if (stepDx !== 0) {
      this.facing = stepDx > 0 ? 'right' : 'left';
    } else {
      this.facing = stepDy > 0 ? 'down' : 'up';
    }

    const prevBiome = this.state.currentBiomeId;
    const prevX = this.tileX;
    const prevY = this.tileY;
    let nextX = prevX + stepDx;
    let nextY = prevY + stepDy;

    const isPassable = (tx: number, ty: number): boolean =>
      isTileWalkableAt(tx, ty) && !this.actorBlockedTiles.has(ty * WORLD_COLS + tx);

    if (!isPassable(nextX, nextY) && options?.allowCornerSlide) {
      // V1 overworld.js perpendicular corner-slide assist around 1-tile obstacle edges
      const perps: ReadonlyArray<readonly [number, number]> =
        stepDx !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
      let slideCand: readonly [number, number] | null = null;
      for (const [pdx, pdy] of perps) {
        const sx = prevX + pdx;
        const sy = prevY + pdy;
        if (isPassable(sx, sy) && isPassable(sx + stepDx, sy + stepDy)) {
          if (slideCand !== null) {
            slideCand = null; // Ambiguous opening on both sides — don't auto-pick
            break;
          }
          slideCand = [pdx, pdy];
        }
      }
      if (slideCand) {
        stepDx = slideCand[0];
        stepDy = slideCand[1];
        nextX = prevX + stepDx;
        nextY = prevY + stepDy;
        this.facing = stepDx !== 0 ? (stepDx > 0 ? 'right' : 'left') : (stepDy > 0 ? 'down' : 'up');
      }
    }

    if (!isPassable(nextX, nextY)) {
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

    const tile = WORLD_MAP[this.tileY]?.[this.tileX] ?? 0;
    const encounterBiome = ENCOUNTER_TILE_BIOME[tile];
    const onGrass = Boolean(encounterBiome);

    // Check V1 dynamic discovery node pickup (shimmer / starfall / mystery_cry)
    let discoveryPicked: V1DiscoveryNode | undefined;
    let mysteryCrySpeciesId: number | undefined;
    let mysteryCrySpeciesName: string | undefined;
    let wildEncounterTriggered: OverworldStepEvent['wildEncounterTriggered'];
    const discIdx = this.discoveryNodes.findIndex((d) => d.x === this.tileX && d.y === this.tileY);
    if (discIdx !== -1) {
      discoveryPicked = this.discoveryNodes.splice(discIdx, 1)[0];
      this.stepsSinceWild = 0;
      this.wildStreak = 0;
      this.bfsPath = [];
      this.autoInteractTarget = null;
      if (discoveryPicked.v1Kind === 'starfall') {
        this.storage.manager.addStarShards(2, true);
      } else if (discoveryPicked.v1Kind === 'mystery_cry') {
        const echo = this.pickMysteryCrySpecies(discoveryPicked.biomeId);
        mysteryCrySpeciesId = echo.speciesId;
        mysteryCrySpeciesName = echo.speciesName;
        (this.storage.manager as { recordSeen?: (id: number) => void }).recordSeen?.(echo.speciesId);
        this.storage.manager.addStarShards(2, true);
      } else {
        // Shimmer patch: rare-patch encounter in wild biomes outside grace, else Shimmer Dew (+2 Shards & +1 Cheer)
        if (encounterBiome && newBiome !== 'village' && this.graceSteps <= 0) {
          const depthInfo = getTileDepthInfo(this.tileX, this.tileY);
          wildEncounterTriggered = {
            biomeId: encounterBiome,
            depthTier: depthInfo?.depthTier ?? 0,
            isRarePatch: true,
          };
        } else {
          this.storage.manager.addRewards({ starShards: 2, cheerCharges: 1 }, true);
        }
      }
    }

    // Auto-heal when stepping onto Starlight Healing Fountain tile (v1 parity)
    let steppedHealSpot = false;
    if (tile === TILE.HEAL && this.needsAutoHeal()) {
      steppedHealSpot = true;
    }

    // Wild encounter pacing (exact BALANCE.overworld + v1 overworld.js:2643 rules!)
    if (!discoveryPicked && !wildEncounterTriggered) {
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
    }

    const needsFullRefresh = Boolean(
      biomeChanged
      || discoveryPicked
      || steppedHealSpot
      || newBadgeIds.length > 0
      || stepMeta?.stepCheerEarned
      || stepMeta?.stepArcadeChargeEarned
      || wildEncounterTriggered,
    );

    if (needsFullRefresh) {
      this.refreshState();
    } else {
      // O(1) incremental overworld step update — avoids rebuilding 134 world entities & 37 readiness checks per step
      const profileLive = this.storage.manager.getActiveProfile();
      this.state.player.tileX = this.tileX;
      this.state.player.tileY = this.tileY;
      this.state.player.facing = this.facing;
      this.state.stepsTotal = profileLive?.stats?.steps ?? (this.state.stepsTotal + 1);
      this.state.bfsPath = this.bfsPath;
      this.state.nearbyInteraction = this.resolveNearbyInteractable();
      if (this.state.compassTarget) {
        const cdx = this.state.compassTarget.x - this.tileX;
        const cdy = this.state.compassTarget.y - this.tileY;
        this.state.compassTarget.distanceTiles = Math.round(Math.hypot(cdx, cdy));
        this.state.compassTarget.angleRad = Math.atan2(cdy, cdx);
      }
    }

    return {
      moved: true,
      onGrass,
      biomeChanged,
      wildEncounterTriggered,
      discoveryPicked,
      mysteryCrySpeciesId,
      mysteryCrySpeciesName,
      steppedHealSpot: steppedHealSpot || undefined,
      newBadgeIds: newBadgeIds.length > 0 ? newBadgeIds : undefined,
      stepCheerEarned: Boolean(stepMeta?.stepCheerEarned),
      stepArcadeChargeEarned: Boolean(stepMeta?.stepArcadeChargeEarned),
    };
  }

  update(
    dtSeconds: number,
    heldInput: { dx: number; dy: number },
    options?: { allowCornerSlide?: boolean },
  ): OverworldStepEvent | null {
    const dt = Math.min(0.05, Math.max(0.001, dtSeconds));
    this.state.elapsedSeconds += dt;
    if (this.state.biomeBannerTimer > 0) {
      this.state.biomeBannerTimer = Math.max(0, this.state.biomeBannerTimer - dt);
    }
    this.refreshDiscoveryNodes(dt);

    let stepEvent: OverworldStepEvent | null = null;
    this.moveCooldown = Math.max(0, this.moveCooldown - dt);

    if (heldInput.dx !== 0 || heldInput.dy !== 0) {
      this.bfsPath = [];
      this.autoInteractTarget = null;
      this.state.bfsPath = [];
      if (this.moveCooldown <= 0) {
        stepEvent = this.stepDirection(heldInput.dx, heldInput.dy, options);
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

    // 4. Forgiving adjacent fallback (O(1) 3x3 spatial tile grid lookup — zero 134-entity scans)
    let bestEntry: StaticTileEntry | null = null;
    let bestDist = Infinity;
    const minY = Math.max(0, this.tileY - 1);
    const maxY = Math.min(WORLD_ROWS - 1, this.tileY + 1);
    const minX = Math.max(0, this.tileX - 1);
    const maxX = Math.min(WORLD_COLS - 1, this.tileX + 1);

    for (let ty = minY; ty <= maxY; ty++) {
      const rowBase = ty * WORLD_COLS;
      for (let tx = minX; tx <= maxX; tx++) {
        const entries = this.tileInteractables.get(rowBase + tx);
        if (!entries) continue;
        const dist = Math.hypot(tx - this.tileX, ty - this.tileY);
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (dist > entry.maxDist) continue;
          if (entry.kind === 'chest' && this.state.chests[entry.index]?.opened) continue;
          if (
            !bestEntry ||
            dist < bestDist - 1e-6 ||
            (Math.abs(dist - bestDist) <= 1e-6 && entry.priority < bestEntry.priority)
          ) {
            bestEntry = entry;
            bestDist = dist;
          }
        }
      }
    }

    return bestEntry ? this.buildInteractableFromEntry(bestEntry, true) : null;
  }

  buildTacticalBriefing(
    kind: TacticalBriefingData['kind'],
    targetId: string,
    biomeIdOverride?: BiomeId,
  ): TacticalBriefingV1Data {
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
    let minLv = 5;
    let maxLv = 5;
    let upgradeTier = 0;
    let badgeName: string | null = null;
    let partyPreview: TacticalBriefingPartyMember[] = [];
    let rematchNumber: number | null = null;
    let trialNumber: number | null = null;
    let isAstralTrial = false;
    let isRematch = false;
    let previewSpeciesId = 25;

    if (kind === 'shrine' || kind === 'shrine-trial') {
      const shrineList = Object.values(SHRINES);
      const shrine = shrineList.find((s) => s.id === targetId) ?? shrineList[0];
      biomeId = (shrine.biome as BiomeId) || biomeId;
      isAstralTrial = kind === 'shrine-trial';
      const spec = isAstralTrial
        ? getScaledShrineTrial(shrine, profile)
        : getScaledShrineGuard(shrine, profile);
      previewSpeciesId = spec.guardianId;
      targetLevel = spec.level;
      minLv = spec.level;
      maxLv = spec.level;
      upgradeTier = Math.max(0, Number((spec as { upgradeTier?: number }).upgradeTier ?? (isAstralTrial ? 2 : 0)));
      trialNumber = isAstralTrial
        ? Math.max(1, Number((spec as { trialNumber?: number }).trialNumber ?? ((profile?.shrineTrialCounts?.[shrine.id] ?? 0) + 1)))
        : null;
      const guardianEntry = getSpeciesEntry(spec.guardianId);
      enemyTypes = [guardianEntry.type];
      if (!isAstralTrial && (shrine as { badgeId?: string }).badgeId) {
        const badgeObj = BADGES.find((b) => b.id === (shrine as { badgeId?: string }).badgeId);
        badgeName = badgeObj ? stripEmojis(badgeObj.name) : null;
      }
      partyPreview = [
        {
          speciesId: spec.guardianId,
          name: guardianEntry.name,
          level: spec.level,
          upgradeTier,
          type: guardianEntry.type,
        },
      ];
      title = isAstralTrial
        ? `${stripEmojis(shrine.name)} (Trial #${trialNumber ?? 1})`
        : stripEmojis(shrine.name);
      subtitle = `Guardian ${guardianEntry.name} - Lv.${spec.level}`;
    } else if (kind === 'rival') {
      const rivalList = Object.values(RIVAL_TRAINERS);
      const rival = rivalList.find((r) => r.id === targetId) ?? rivalList[0];
      biomeId = (rival.biome as BiomeId) || biomeId;
      isRematch = Boolean(profile?.rivalsDefeated?.includes(rival.id));
      rematchNumber = isRematch ? Math.max(1, Number(profile?.rivalRematchCounts?.[rival.id] ?? 0) + 1) : null;
      const party = getScaledRivalParty(rival, profile);
      enemyCount = party.length;
      const ace = party[party.length - 1] ?? party[0];
      previewSpeciesId = ace?.speciesId ?? 25;
      partyPreview = party.map((p: { speciesId: number; level: number; upgradeTier?: number }) => {
        const sp = getSpeciesEntry(p.speciesId);
        return {
          speciesId: p.speciesId,
          name: sp.name,
          level: p.level,
          upgradeTier: Math.max(0, Number(p.upgradeTier ?? 0)),
          type: sp.type,
        };
      });
      const levels = partyPreview.map((p) => p.level);
      minLv = levels.length > 0 ? Math.min(...levels) : 8;
      maxLv = levels.length > 0 ? Math.max(...levels) : 8;
      targetLevel = maxLv;
      upgradeTier = partyPreview.reduce((best, p) => Math.max(best, p.upgradeTier), 0);
      enemyTypes = [...new Set(partyPreview.map((p) => p.type))];
      title = stripEmojis(rival.name);
      subtitle = `${enemyCount}-Pokémon Duel - Ace Lv.${targetLevel}`;
    } else {
      const biome = BIOMES[biomeId] ?? BIOMES.forest;
      title = stripEmojis(biome.name);
      subtitle = getBiomeVisualProfile(biomeId).subtitle;
      const range = biome.levelRange ?? [2, 7];
      minLv = range[0];
      maxLv = range[1];
      targetLevel = Math.round((range[0] + range[1]) / 2);
      const sampleEnc = biome.encounters?.[0];
      previewSpeciesId = sampleEnc?.id ?? 25;
      const previewSp = getSpeciesEntry(previewSpeciesId);
      enemyTypes = [getBiomeVisualProfile(biomeId).elementalType];
      partyPreview = [
        {
          speciesId: previewSpeciesId,
          name: previewSp.name,
          level: targetLevel,
          upgradeTier: 0,
          type: previewSp.type,
        },
      ];
    }

    const readiness = assessEncounterReadiness(profile, {
      kind: kind === 'shrine-trial' ? 'trial' : kind === 'biome' ? 'biome' : kind,
      targetLevel,
      enemyTypes,
      enemyCount,
      typeChart: TYPE_CHART,
    });

    const pivot: { action: 'safe' | 'farm'; label: string } | null = readiness.needsHeal
      ? { action: 'safe', label: 'Safe Zone' }
      : readiness.tier === 'danger' || readiness.tier === 'challenging'
        ? { action: 'farm', label: 'Farm Zone' }
        : null;

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
      upgradeTier,
      badgeName,
      partyPreview,
      minLv,
      maxLv,
      rematchNumber,
      trialNumber,
      isAstralTrial,
      isRematch,
      pivot,
    };
  }

  refreshState(): OverworldSceneState {
    this.state = this.buildSceneState();
    return this.state;
  }

  private computeReadinessSignature(profileLive: ReturnType<StarlightStorageBridge['manager']['getActiveProfile']>): string {
    const team = Array.isArray(profileLive?.team) ? profileLive.team : [];
    const clearedLen = Array.isArray(profileLive?.shrinesCleared) ? profileLive.shrinesCleared.length : 0;
    const rivalsLen = Array.isArray(profileLive?.rivalsDefeated) ? profileLive.rivalsDefeated.length : 0;
    const trialSum = profileLive?.shrineTrialCounts
      ? Object.values(profileLive.shrineTrialCounts as Record<string, number>).reduce((a, b) => a + (Number(b) || 0), 0)
      : 0;
    let sig = `${profileLive?.trainerId ?? ''}|${team.length}|${clearedLen}|${rivalsLen}|${trialSum}`;
    for (let i = 0; i < team.length; i++) {
      const m = team[i];
      if (!m) continue;
      sig += `|${m.speciesId}:${m.level}:${m.hp}/${m.maxHp}:${m.isFainted ? 1 : 0}`;
    }
    return sig;
  }

  private ensureReadinessCache(
    profileLive: ReturnType<StarlightStorageBridge['manager']['getActiveProfile']>,
    shrinesCleared: Set<string>,
  ): void {
    const sig = this.computeReadinessSignature(profileLive);
    if (sig === this.cachedReadinessSig && this.cachedShrineReadiness.length === this.staticShrines.length) {
      return;
    }
    this.cachedReadinessSig = sig;
    this.cachedShrineReadiness = new Array(this.staticShrines.length);
    this.cachedShrineLevels = new Array(this.staticShrines.length);

    for (let i = 0; i < this.staticShrines.length; i++) {
      const s = this.staticShrines[i];
      const cleared = shrinesCleared.has(s.id);
      const spec = cleared
        ? getScaledShrineTrial(s.rawShrine, profileLive)
        : getScaledShrineGuard(s.rawShrine, profileLive);
      const scaledLv = Math.max(1, Number(spec?.level ?? s.level));
      const guardianType = getSpeciesEntry(spec?.guardianId ?? s.guardianId).type;
      this.cachedShrineLevels[i] = scaledLv;
      this.cachedShrineReadiness[i] = assessEncounterReadiness(profileLive, {
        kind: cleared ? 'trial' : 'shrine',
        targetLevel: scaledLv,
        enemyTypes: [guardianType],
        typeChart: TYPE_CHART,
      }).tier as ReadinessTier;
    }

    this.cachedRivalReadiness = this.staticRivals.map((r) => {
      const party = getScaledRivalParty(r.rawRival, profileLive) as Array<{ speciesId: number; level: number }>;
      let maxLv = r.aceLevel;
      const typeSet = new Set<ElementalType>();
      if (Array.isArray(party) && party.length > 0) {
        maxLv = 0;
        for (let j = 0; j < party.length; j++) {
          if (party[j].level > maxLv) maxLv = party[j].level;
          typeSet.add(getSpeciesEntry(party[j].speciesId).type);
        }
      } else {
        typeSet.add(r.aceType);
      }
      return assessEncounterReadiness(profileLive, {
        kind: 'rival',
        targetLevel: maxLv,
        enemyTypes: [...typeSet],
        enemyCount: Array.isArray(party) && party.length > 0 ? party.length : r.partyCount,
        typeChart: TYPE_CHART,
      }).tier as ReadinessTier;
    });
  }

  private buildSceneState(): OverworldSceneState {
    const profileLive = this.storage.manager.getActiveProfile();
    const trainerId: TrainerId = (profileLive?.trainerId === 'ozias' ? 'ozias' : 'violet');
    const look = getResolvedTrainerLook(trainerId, profileLive?.appearance);
    const displayName = getCleanTrainerName(profileLive, trainerId);
    const currentBiomeObj = getBiomeAt(this.tileX, this.tileY) ?? BIOMES.village;
    const currentBiomeId = (currentBiomeObj.id as BiomeId) || 'village';

    const shrinesCleared = new Set<string>(profileLive?.shrinesCleared ?? []);
    const chestsOpened = new Set<string>(profileLive?.chestsOpened ?? []);
    const npcsTalked = new Set<string>(profileLive?.npcsTalked ?? []);
    const questsDone = new Set<string>(profileLive?.questsCompleted ?? []);
    const rivalsDefeated = new Set<string>(profileLive?.rivalsDefeated ?? []);

    this.ensureReadinessCache(profileLive, shrinesCleared);

    const shrines: OverworldShrineNode[] = this.staticShrines.map((s, idx) => ({
      id: s.id,
      biomeId: s.biomeId,
      x: s.x,
      y: s.y,
      name: s.name,
      guardianId: s.guardianId,
      guardianName: s.guardianName,
      elementalType: s.elementalType,
      level: this.cachedShrineLevels[idx] ?? s.level,
      cleared: shrinesCleared.has(s.id),
      readinessTier: this.cachedShrineReadiness[idx] ?? 'ready',
    }));

    const chests: OverworldChestNode[] = this.staticChests.map((c) => ({
      id: c.id,
      biomeId: c.biomeId,
      x: c.x,
      y: c.y,
      label: c.label,
      opened: chestsOpened.has(c.id),
    }));

    const npcs: OverworldNpcNode[] = this.staticNpcs.map((n) => {
      const done = Boolean(n.questId && questsDone.has(n.questId));
      return {
        id: n.id,
        x: n.x,
        y: n.y,
        name: n.name,
        role: n.role,
        accentHex: n.accentHex,
        talked: npcsTalked.has(n.id),
        hasAvailableQuest: Boolean(n.questId && !done),
        questCompleted: done,
      };
    });

    const rivals: OverworldRivalNode[] = this.staticRivals.map((r, idx) => ({
      id: r.id,
      biomeId: r.biomeId,
      x: r.x,
      y: r.y,
      name: r.name,
      title: r.title,
      accentHex: r.accentHex,
      defeated: rivalsDefeated.has(r.id),
      rematchCount: profileLive?.rivalRematchCounts?.[r.id] ?? 0,
      readinessTier: this.cachedRivalReadiness[idx] ?? 'ready',
    }));

    const landmarks = this.staticLandmarks;
    const signposts = this.staticSignposts;

    // Lead Pokémon Follower
    const lead = Array.isArray(profileLive?.team) ? profileLive.team[0] : undefined;
    let follower: OverworldSceneState['follower'] = null;
    if (lead) {
      const sp = getSpeciesEntry(lead.speciesId);
      const isShiny = Boolean(lead.isShiny);
      const cachedFrames = this.sprites.getCached(lead.speciesId, { back: false, shiny: isShiny });
      if (!cachedFrames) {
        void this.sprites.loadSpeciesSprite(lead.speciesId, { back: false, shiny: isShiny });
      }
      follower = {
        speciesId: lead.speciesId,
        name: stripEmojis(lead.nickname || sp.name),
        type: sp.type,
        isShiny,
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
        unlocked: Boolean(profileLive?.arcade?.unlocked),
        knocks: profileLive?.arcade?.secretKnocks ?? 0,
      },
      nearbyInteraction: null,
      compassTarget,
      timeOfDay: 0.78, // Cozy starlight twilight
      elapsedSeconds: this.state?.elapsedSeconds ?? 0,
      reducedMotion: this.storage.getSettings().reducedMotion,
      stepsTotal: profileLive?.stats?.steps ?? 0,
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
