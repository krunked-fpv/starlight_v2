import * as Config from './config.js';
import {
  BADGES,
  BIOMES,
  EVOLUTION_ITEMS,
  EVOLUTIONS,
  GAME_META,
  SHRINES,
  SOLID_TILES,
  SPECIES,
  STARTER_IDS,
  TRAINERS,
  TRAINER_ACCESSORIES,
  TRAINER_AURAS,
  TRAINER_STYLES,
  WORLD_COLS,
  WORLD_MAP,
  WORLD_ROWS,
  findNearestSafePosition,
  formatGameText,
  isTileWalkableAt,
  normalizeTrainerNickname,
  resolveTrainerDisplayName,
} from './config.js';
import { Pokemon, createStarterPokemon, getBondTier, getPlayerProgression } from './pokemon.js';

export { formatGameText, normalizeTrainerNickname, resolveTrainerDisplayName };

export const STORAGE_KEY = 'starlight_pokemon_save_v1';
export const MAX_CHEER_CHARGES = 3;
export const STEPS_PER_CHEER_CHARGE = 25;
export const MAX_ARCADE_CHARGES = 3;
export const STEPS_PER_ARCADE_CHARGE = 50;
export const BATTLES_PER_ARCADE_CHARGE = 2;
export const ARCADE_SHARD_BUYIN_COST = 5;
export const ARCADE_GEM_COOLDOWN_RUNS = 2;

const SOLID_TILE_IDS = new Set([3, 4, 8, 11, 12, 14, 16, 17, 18, 21, 25, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60]);
const VALID_DIRS = new Set(['up', 'down', 'left', 'right']);
const VALID_PACES = new Set(['cinema', 'classic', 'fast']);
const ALLOWED_BAG_CONSUMABLES = new Set(['potions', 'greatBalls', 'starBalls', 'cheerCharges']);

const SPECIES_ID_BY_NAME = new Map(
  Object.values(SPECIES || {}).map((sp) => [String(sp.name).trim().toLowerCase(), Number(sp.id)]),
);

const DIRECT_ENCOUNTER_IDS = new Set(
  [
    ...Object.values(BIOMES || {}).flatMap((b) => (b?.encounters || []).map((e) => Number(e?.id))),
    ...Object.values(SHRINES || {}).map((s) => Number(s?.guardianId)),
    ...(STARTER_IDS || []).map(Number),
  ].filter((id) => Number.isInteger(id) && Boolean(SPECIES[id])),
);

const PARENTS_BY_SPECIES = new Map();
for (const [fromKey, rules] of Object.entries(EVOLUTIONS || {})) {
  const fromId = Number(fromKey);
  if (!SPECIES[fromId] || !Array.isArray(rules)) continue;
  for (const rule of rules) {
    const toId = Number(rule?.to);
    if (!SPECIES[toId]) continue;
    const list = PARENTS_BY_SPECIES.get(toId) || [];
    if (!list.includes(fromId)) {
      list.push(fromId);
      PARENTS_BY_SPECIES.set(toId, list);
    }
  }
}

const SHRINE_BY_ID = new Map(
  Object.values(SHRINES || {})
    .filter((shrine) => shrine && shrine.id)
    .map((shrine) => [String(shrine.id), shrine]),
);

export function resolveSpeciesId(raw) {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 1 && raw <= 1025 && SPECIES[raw] ? raw : null;
  }
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const noHash = trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed;
  if (/^\d+$/.test(noHash)) {
    const num = Number(noHash);
    return Number.isSafeInteger(num) && num >= 1 && num <= 1025 && SPECIES[num] ? num : null;
  }

  const byName = SPECIES_ID_BY_NAME.get(trimmed.toLowerCase());
  return byName !== undefined && byName >= 1 && byName <= 1025 && SPECIES[byName] ? byName : null;
}

function isPlainObject(val) {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function computeSyncedPokedexState(profile) {
  const rawPokedex = isPlainObject(profile?.pokedex) ? profile.pokedex : null;
  const rawCaught = rawPokedex?.caught;
  const rawSeen = rawPokedex?.seen;

  const caught = {};
  if (Array.isArray(rawCaught)) {
    for (const item of rawCaught) {
      const id = resolveSpeciesId(item);
      if (id !== null) {
        caught[id] = Math.max(caught[id] || 0, 1);
      }
    }
  } else if (isPlainObject(rawCaught)) {
    for (const [k, v] of Object.entries(rawCaught)) {
      const id = resolveSpeciesId(k);
      if (id === null) continue;
      if (v === false || v === null || v === undefined || v === '') continue;
      const count = v === true ? 1 : Math.floor(Number(v));
      if (Number.isFinite(count) && count >= 1) {
        caught[id] = Math.max(caught[id] || 0, count);
      }
    }
  }

  const ownedCounts = new Map();
  const ownedMons = [
    ...(Array.isArray(profile?.team) ? profile.team : []),
    ...(Array.isArray(profile?.box) ? profile.box : []),
  ];
  for (const mon of ownedMons) {
    const spId = resolveSpeciesId(mon?.speciesId);
    if (spId !== null) {
      ownedCounts.set(spId, (ownedCounts.get(spId) || 0) + 1);
    }
  }
  for (const [spId, ownedCount] of ownedCounts.entries()) {
    caught[spId] = Math.max(caught[spId] || 0, ownedCount);
  }

  const starterId = resolveSpeciesId(profile?.starterId);
  if (starterId !== null) {
    caught[starterId] = Math.max(caught[starterId] || 0, 1);
  }

  // Walk non-wild single-parent evolution edges backwards to recover evolved starter/gift pre-evolutions
  for (const spId of Object.keys(caught).map(Number)) {
    let cur = spId;
    const visited = new Set([cur]);
    while (!DIRECT_ENCOUNTER_IDS.has(cur)) {
      const parents = PARENTS_BY_SPECIES.get(cur);
      if (!parents || parents.length !== 1) break;
      const parentId = parents[0];
      if (visited.has(parentId)) break;
      visited.add(parentId);
      if (SPECIES[parentId]) {
        caught[parentId] = Math.max(caught[parentId] || 0, 1);
      }
      cur = parentId;
    }
  }

  const seenSet = new Set();
  if (Array.isArray(rawSeen)) {
    for (const item of rawSeen) {
      const id = resolveSpeciesId(item);
      if (id !== null) seenSet.add(id);
    }
  } else if (isPlainObject(rawSeen)) {
    for (const [k, v] of Object.entries(rawSeen)) {
      if (v === false || v === null || v === undefined || v === '') continue;
      if (typeof v !== 'boolean') {
        const num = Number(v);
        if (!Number.isFinite(num) || num <= 0) continue;
      }
      const id = resolveSpeciesId(k);
      if (id !== null) seenSet.add(id);
    }
  }

  for (const id of Object.keys(caught).map(Number)) {
    seenSet.add(id);
  }

  const shrinesCleared = Array.isArray(profile?.shrinesCleared) ? profile.shrinesCleared : [];
  for (const shrineId of shrinesCleared) {
    const shrine = SHRINE_BY_ID.get(String(shrineId));
    const guardianId = resolveSpeciesId(shrine?.guardianId);
    if (guardianId !== null) {
      seenSet.add(guardianId);
    }
  }

  const seen = [...seenSet].sort((a, b) => a - b);
  const sumOfCaughtCounts = Object.values(caught).reduce((sum, count) => sum + count, 0);
  const rawPrevTotal = profile?.stats?.totalCaught;
  const prevTotalRaw = isInvalidNumericInput(rawPrevTotal) || (typeof rawPrevTotal === 'string' && rawPrevTotal.trim() === '')
    ? 0
    : Number(rawPrevTotal);
  const safePrevTotal = Number.isFinite(prevTotalRaw) && prevTotalRaw >= 0 ? Math.floor(prevTotalRaw) : 0;
  const totalCaught = Math.max(safePrevTotal, sumOfCaughtCounts);

  return {
    rawPokedex,
    rawCaught,
    rawSeen,
    caught,
    seen,
    totalCaught,
  };
}

export function syncProfilePokedex(profile) {
  if (!profile || typeof profile !== 'object') {
    return { changed: false, seenCount: 0, caughtCount: 0 };
  }

  const {
    rawPokedex,
    rawCaught,
    rawSeen,
    caught,
    seen,
    totalCaught,
  } = computeSyncedPokedexState(profile);

  const nextCaughtKeys = Object.keys(caught);
  let caughtChanged = !isPlainObject(rawCaught) || Object.keys(rawCaught).length !== nextCaughtKeys.length;
  if (!caughtChanged) {
    for (const key of nextCaughtKeys) {
      if (!Object.prototype.hasOwnProperty.call(rawCaught, key) || rawCaught[key] !== caught[key]) {
        caughtChanged = true;
        break;
      }
    }
  }

  let seenChanged = !Array.isArray(rawSeen) || rawSeen.length !== seen.length;
  if (!seenChanged) {
    for (let i = 0; i < seen.length; i += 1) {
      if (rawSeen[i] !== seen[i]) {
        seenChanged = true;
        break;
      }
    }
  }

  let statsChanged = false;
  if (!isPlainObject(profile.stats)) {
    profile.stats = hydrateProfileStats({ totalCaught });
    statsChanged = true;
  } else if (profile.stats.totalCaught !== totalCaught) {
    profile.stats.totalCaught = totalCaught;
    statsChanged = true;
  }

  if (!rawPokedex) {
    profile.pokedex = { seen, caught };
  } else {
    profile.pokedex.seen = seen;
    profile.pokedex.caught = caught;
  }

  const changed = !rawPokedex || caughtChanged || seenChanged || statsChanged;
  return {
    changed,
    seenCount: seen.length,
    caughtCount: nextCaughtKeys.length,
  };
}

/**
 * Synchronize a trainer profile's persisted `trainerXp` and `playerLevel`
 * from authoritative progression data without mutating party or box levels.
 */
export function syncProfilePlayerProgression(profile) {
  const prog = getPlayerProgression(profile);
  if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
    profile.trainerXp = prog.xp;
    profile.playerLevel = prog.level;
  }
  return prog;
}

export function isSpeciesCaught(profile, speciesId) {
  const id = resolveSpeciesId(speciesId);
  if (!id || !profile || typeof profile !== 'object') return false;
  const rawCaught = profile.pokedex?.caught;
  if (isPlainObject(rawCaught) && typeof rawCaught[id] === 'number' && Number.isFinite(rawCaught[id]) && rawCaught[id] >= 1) {
    return true;
  }
  const { caught } = computeSyncedPokedexState(profile);
  return (caught[id] || 0) >= 1;
}

export function isSpeciesSeen(profile, speciesId) {
  const id = resolveSpeciesId(speciesId);
  if (!id || !profile || typeof profile !== 'object') return false;
  const rawSeen = profile.pokedex?.seen;
  if (Array.isArray(rawSeen) && rawSeen.includes(id)) {
    return true;
  }
  if (isSpeciesCaught(profile, id)) {
    return true;
  }
  const { seen } = computeSyncedPokedexState(profile);
  return seen.includes(id);
}

function isMapTileWalkable(x, y) {
  if (!Array.isArray(WORLD_MAP) || WORLD_ROWS <= 0 || WORLD_COLS <= 0) return true;
  if (x < 0 || y < 0 || x >= WORLD_COLS || y >= WORLD_ROWS) return false;
  const tile = WORLD_MAP[y]?.[x];
  if (tile === undefined) return false;
  const solidSet = SOLID_TILES instanceof Set ? SOLID_TILES : SOLID_TILE_IDS;
  return !solidSet.has(tile);
}

function isSafeWorldTile(x, y) {
  if (typeof isTileWalkableAt === 'function') {
    return isTileWalkableAt(x, y);
  }
  return isMapTileWalkable(x, y);
}

function fallbackNearestSafe(x, y, dir) {
  if (typeof findNearestSafePosition === 'function') {
    return findNearestSafePosition(x, y, dir);
  }
  const spawnX = GAME_META.spawn?.x ?? 8;
  const spawnY = GAME_META.spawn?.y ?? 15;
  const queue = [[x, y]];
  const visited = new Set([`${x},${y}`]);
  const deltas = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];
  for (let head = 0; head < queue.length; head += 1) {
    const [cx, cy] = queue[head];
    if (isSafeWorldTile(cx, cy)) {
      return { x: cx, y: cy, dir };
    }
    for (const [dx, dy] of deltas) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_COLS || ny >= WORLD_ROWS) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push([nx, ny]);
    }
  }
  return { x: spawnX, y: spawnY, dir };
}

export function sanitizePosition(rawPos) {
  const spawnX = GAME_META.spawn?.x ?? 8;
  const spawnY = GAME_META.spawn?.y ?? 15;
  const spawnDir = GAME_META.spawn?.dir || 'down';
  const dir = VALID_DIRS.has(rawPos?.dir) ? rawPos.dir : spawnDir;

  const rawXInput = rawPos?.x;
  const rawYInput = rawPos?.y;
  if (
    isInvalidNumericInput(rawXInput)
    || isInvalidNumericInput(rawYInput)
    || (typeof rawXInput === 'string' && rawXInput.trim() === '')
    || (typeof rawYInput === 'string' && rawYInput.trim() === '')
  ) {
    return fallbackNearestSafe(spawnX, spawnY, dir);
  }

  const rawX = Number(rawXInput);
  const rawY = Number(rawYInput);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    return fallbackNearestSafe(spawnX, spawnY, dir);
  }

  const ix = Math.round(rawX);
  const iy = Math.round(rawY);
  if (ix < 0 || iy < 0 || ix >= WORLD_COLS || iy >= WORLD_ROWS) {
    return fallbackNearestSafe(spawnX, spawnY, dir);
  }

  if (isSafeWorldTile(ix, iy)) {
    return { x: ix, y: iy, dir };
  }

  return fallbackNearestSafe(ix, iy, dir);
}

function isInvalidNumericInput(rawVal) {
  return (
    rawVal === null
    || rawVal === undefined
    || rawVal === ''
    || (typeof rawVal === 'string' && rawVal.trim() === '')
    || typeof rawVal === 'boolean'
    || typeof rawVal === 'object'
    || typeof rawVal === 'symbol'
    || typeof rawVal === 'function'
  );
}

function toNonNegInt(rawVal, fallback = 0) {
  if (isInvalidNumericInput(rawVal)) {
    return fallback;
  }
  if (rawVal === -Infinity) return 0;
  const num = Number(rawVal);
  return Number.isFinite(num) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(num))) : fallback;
}

function clampCheerCharges(rawVal, fallback = 0) {
  const n = toNonNegInt(rawVal, fallback);
  return Math.max(0, Math.min(MAX_CHEER_CHARGES, n));
}

function clampCheerStepProgress(rawVal, fallback = 0) {
  const n = toNonNegInt(rawVal, fallback);
  return Math.max(0, Math.min(STEPS_PER_CHEER_CHARGE - 1, n));
}

function clampArcadeCharges(rawVal, fallback = 0) {
  const n = toNonNegInt(rawVal, fallback);
  return Math.max(0, Math.min(MAX_ARCADE_CHARGES, n));
}

function clampArcadeStepProgress(rawVal, fallback = 0) {
  const n = toNonNegInt(rawVal, fallback);
  return Math.max(0, Math.min(STEPS_PER_ARCADE_CHARGE - 1, n));
}

function clampArcadeBattleProgress(rawVal, fallback = 0) {
  const n = toNonNegInt(rawVal, fallback);
  return Math.max(0, Math.min(BATTLES_PER_ARCADE_CHARGE - 1, n));
}

function clampArcadeGemCooldown(rawVal, fallback = 0) {
  const n = toNonNegInt(rawVal, fallback);
  return Math.max(0, Math.min(ARCADE_GEM_COOLDOWN_RUNS, n));
}

function normalizeMonBond(rawBond) {
  if (isInvalidNumericInput(rawBond)) {
    return 20;
  }
  if (rawBond === -Infinity) return 0;
  const num = Number(rawBond);
  return Number.isFinite(num) ? Math.max(0, Math.min(100, Math.round(num))) : 20;
}

function createEmptyBag() {
  return {
    potions: 0,
    greatBalls: 0,
    starBalls: 0,
    starShards: 0,
    cheerCharges: 0,
    gems: hydrateGems(null),
  };
}

function hydrateGems(rawGems) {
  const src = isPlainObject(rawGems) ? rawGems : null;
  const gems = {};
  for (const key of Object.keys(EVOLUTION_ITEMS)) {
    gems[key] = src ? toNonNegInt(src[key], 0) : 0;
  }
  if (src) {
    for (const [key, rawVal] of Object.entries(src)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      if (!(key in gems)) {
        const val = toNonNegInt(rawVal, 0);
        if (val > 0) {
          gems[key] = val;
        }
      }
    }
  }
  return gems;
}

function hydrateUniqueStrings(rawList) {
  if (!Array.isArray(rawList)) return [];
  return [...new Set(rawList.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))];
}

function hydrateAppearance(rawAppearance) {
  const rawStyleId = rawAppearance?.styleId;
  const styleId = rawStyleId && TRAINER_STYLES?.[rawStyleId] ? rawStyleId : 'default';
  const rawAccessory = rawAppearance?.accessory;
  const accessory = rawAccessory && TRAINER_ACCESSORIES?.[rawAccessory] ? rawAccessory : 'cap';
  const rawAura = rawAppearance?.aura;
  const aura = rawAura && TRAINER_AURAS?.[rawAura] ? rawAura : 'none';
  const nickname = normalizeTrainerNickname(
    rawAppearance?.nickname ?? rawAppearance?.customName ?? rawAppearance?.trainerName,
  );
  return {
    styleId,
    accessory,
    cape: Boolean(rawAppearance?.cape),
    aura,
    ...(nickname ? { nickname } : {}),
  };
}

function clearLegacyProfileNicknames(profile) {
  if (!isPlainObject(profile)) return;
  delete profile.nickname;
  delete profile.customName;
  delete profile.trainerNickname;
  delete profile.customTrainerName;
}

function hydrateStarShards(rawShards, fallback = 0) {
  if (rawShards === undefined) {
    return fallback;
  }
  return toNonNegInt(rawShards, 0);
}

function hydrateCountMap(rawMap) {
  const out = {};
  if (!isPlainObject(rawMap)) return out;
  for (const [key, rawVal] of Object.entries(rawMap)) {
    const id = String(key).trim();
    if (!id || id === '__proto__' || id === 'constructor' || id === 'prototype') continue;
    if (rawVal === undefined) continue;
    out[id] = toNonNegInt(rawVal, 0);
  }
  return out;
}

function hydrateRecentEncounters(rawList) {
  if (!Array.isArray(rawList)) return [];
  const valid = [];
  for (const item of rawList) {
    const id = resolveSpeciesId(item);
    if (id !== null) {
      valid.push(id);
    }
  }
  return valid.slice(-20);
}

function hydrateRecentWarpBiomes(rawList) {
  const biomesMap = Config.BIOMES || BIOMES;
  return hydrateUniqueStrings(rawList)
    .filter((id) => Boolean(biomesMap[id]) && id !== 'village')
    .slice(-3);
}

function getCaughtSpeciesCount(profile) {
  const caught = profile?.pokedex?.caught;
  if (!isPlainObject(caught)) return 0;
  return Object.values(caught).filter((val) => val === true || (Number.isFinite(Number(val)) && Number(val) > 0)).length;
}

function hydrateArcade(rawArcade, { allowLegacyPlayUnlock = false } = {}) {
  const src = isPlainObject(rawArcade) ? rawArcade : {};
  const rawUnlocked = Boolean(src.unlocked === true || (src.unlocked && src.unlocked !== 'false'));
  const plays = toNonNegInt(src.plays, 0);
  const highScore = toNonNegInt(src.highScore, 0);
  const unlocked = Boolean(rawUnlocked || (allowLegacyPlayUnlock && (plays > 0 || highScore > 0)));
  const secretKnocks = unlocked
    ? Math.max(3, toNonNegInt(src.secretKnocks, 0))
    : Math.min(2, toNonNegInt(src.secretKnocks, 0));
  const charges = !unlocked
    ? 0
    : (src.charges === undefined ? MAX_ARCADE_CHARGES : clampArcadeCharges(src.charges, 0));
  const stepProgress = (!unlocked || charges >= MAX_ARCADE_CHARGES)
    ? 0
    : clampArcadeStepProgress(src.stepProgress, 0);
  const battleProgress = (!unlocked || charges >= MAX_ARCADE_CHARGES)
    ? 0
    : clampArcadeBattleProgress(src.battleProgress, 0);
  const gemCooldown = clampArcadeGemCooldown(src.gemCooldown, 0);
  return {
    unlocked,
    charges,
    stepProgress,
    battleProgress,
    gemCooldown,
    highScore,
    plays,
    bestWave: toNonNegInt(src.bestWave, 0),
    secretKnocks,
  };
}

function createFreshProfile(trainerId) {
  return {
    trainerId,
    starterId: null,
    trainerXp: 0,
    playerLevel: 1,
    pos: { ...GAME_META.spawn },
    appearance: hydrateAppearance(null),
    team: [],
    box: [],
    pokedex: {
      seen: [],
      caught: {},
    },
    badges: [],
    shrinesCleared: [],
    chestsOpened: [],
    questsCompleted: [],
    npcsTalked: [],
    biomesVisited: [],
    rivalsDefeated: [],
    rivalRematchCounts: {},
    shrineTrialCounts: {},
    recentEncounters: [],
    recentWarpBiomes: [],
    cheerStepProgress: 0,
    arcade: hydrateArcade(null, { allowLegacyPlayUnlock: false }),
    bag: {
      potions: 5,
      greatBalls: 3,
      starBalls: 1,
      starShards: 0,
      cheerCharges: 0,
      gems: hydrateGems(null),
    },
    stats: {
      battlesWon: 0,
      totalCaught: 0,
      steps: 0,
      evolutions: 0,
      shiniesFound: 0,
      upgrades: 0,
      cheers: 0,
    },
  };
}

function createFreshSaveState() {
  return {
    version: 2,
    activeTrainerId: null,
    settings: {
      muted: false,
      crtEnabled: true,
      showTouchPad: 'auto',
      battlePace: 'cinema',
    },
    profiles: {
      violet: createFreshProfile('violet'),
      ozias: createFreshProfile('ozias'),
    },
  };
}

function safeHydrateMon(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  try {
    const resolvedId = resolveSpeciesId(item.speciesId);
    const normalized = resolvedId !== null && resolvedId !== item.speciesId
      ? { ...item, speciesId: resolvedId }
      : item;
    if (item instanceof Pokemon) {
      const clean = Pokemon.fromJSON(normalized);
      Object.assign(item, clean);
      return item;
    }
    return Pokemon.fromJSON(normalized);
  } catch {
    return null;
  }
}

function generateUniqueUid(usedUids) {
  let candidate = '';
  do {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      candidate = crypto.randomUUID();
    } else {
      candidate = `pk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }
  } while (!candidate || usedUids.has(candidate));
  return candidate;
}

function deduplicateTeamAndBoxUids(profile, report = null) {
  if (!profile || typeof profile !== 'object') return 0;
  const seenUids = new Set();
  let deduplicated = 0;
  const allMons = [
    ...(Array.isArray(profile.team) ? profile.team : []),
    ...(Array.isArray(profile.box) ? profile.box : []),
  ];
  for (const mon of allMons) {
    if (!mon || typeof mon !== 'object') continue;
    const trimmedUid = typeof mon.uid === 'string' ? mon.uid.trim() : '';
    if (!trimmedUid || seenUids.has(trimmedUid)) {
      mon.uid = generateUniqueUid(seenUids);
      deduplicated += 1;
    } else {
      mon.uid = trimmedUid;
    }
    seenUids.add(mon.uid);
  }
  if (report && typeof report === 'object') {
    report.uidsDeduplicated = (report.uidsDeduplicated || 0) + deduplicated;
  }
  return deduplicated;
}

function repairProfileParty(profile) {
  if (!profile) return profile;
  if (!Array.isArray(profile.team)) {
    profile.team = [];
  } else {
    profile.team = profile.team.map((m) => (m instanceof Pokemon ? m : safeHydrateMon(m))).filter(Boolean);
  }
  if (!Array.isArray(profile.box)) {
    profile.box = [];
  } else {
    profile.box = profile.box.map((m) => (m instanceof Pokemon ? m : safeHydrateMon(m))).filter(Boolean);
  }
  if (profile.team.length === 0 && profile.box.length > 0) {
    profile.team.push(profile.box.shift());
  }
  if (profile.starterId && profile.team.length === 0) {
    const fallbackId = SPECIES[profile.starterId] ? profile.starterId : 1;
    profile.team.push(createStarterPokemon(fallbackId));
  }
  if (profile.team.length > 0 && profile.team.every((mon) => mon?.isFainted)) {
    profile.team[0]?.healFull?.();
  }
  return profile;
}

function hydrateProfileBag(rawBag) {
  const src = isPlainObject(rawBag) ? rawBag : null;
  return {
    potions: src && src.potions !== undefined ? toNonNegInt(src.potions, 0) : 5,
    greatBalls: src && src.greatBalls !== undefined ? toNonNegInt(src.greatBalls, 0) : 3,
    starBalls: src && src.starBalls !== undefined ? toNonNegInt(src.starBalls, 0) : 0,
    starShards: src ? hydrateStarShards(src.starShards, 2) : 0,
    cheerCharges: src && src.cheerCharges !== undefined ? clampCheerCharges(src.cheerCharges, 0) : 0,
    gems: hydrateGems(src?.gems),
  };
}

function hydrateProfileStats(rawStats) {
  const src = isPlainObject(rawStats) ? rawStats : {};
  return {
    battlesWon: toNonNegInt(src.battlesWon, 0),
    totalCaught: toNonNegInt(src.totalCaught, 0),
    steps: toNonNegInt(src.steps, 0),
    evolutions: toNonNegInt(src.evolutions, 0),
    shiniesFound: toNonNegInt(src.shiniesFound, 0),
    upgrades: toNonNegInt(src.upgrades, 0),
    cheers: toNonNegInt(src.cheers, 0),
  };
}

export function validateAndRepairProfile(raw, trainerIdFallback = null, report = null) {
  const fallbackTrainer = TRAINERS[trainerIdFallback] ? trainerIdFallback : 'violet';
  if (!isPlainObject(raw)) {
    return createFreshProfile(fallbackTrainer);
  }

  const trainerId = TRAINERS[raw.trainerId] ? raw.trainerId : fallbackTrainer;

  const rawTeamList = Array.isArray(raw.team) ? raw.team : [];
  const rawBoxList = Array.isArray(raw.box) ? raw.box : [];
  const hydratedTeamAll = rawTeamList.map(safeHydrateMon).filter(Boolean);
  const hydratedBoxRaw = rawBoxList.map(safeHydrateMon).filter(Boolean);

  const droppedTeam = rawTeamList.length - hydratedTeamAll.length;
  const droppedBox = rawBoxList.length - hydratedBoxRaw.length;
  const team = hydratedTeamAll.slice(0, 6);
  const teamOverflow = hydratedTeamAll.slice(6);
  const box = [...hydratedBoxRaw, ...teamOverflow];

  const starterId = resolveSpeciesId(raw.starterId);
  const rawPokedex = isPlainObject(raw.pokedex) ? raw.pokedex : {};
  const rawSeen = Array.isArray(rawPokedex.seen)
    ? [...rawPokedex.seen]
    : (isPlainObject(rawPokedex.seen) ? { ...rawPokedex.seen } : []);
  const rawCaught = Array.isArray(rawPokedex.caught)
    ? [...rawPokedex.caught]
    : (isPlainObject(rawPokedex.caught) ? { ...rawPokedex.caught } : {});

  const repairedAppearance = hydrateAppearance(raw.appearance);
  if (!repairedAppearance.nickname) {
    const legacyNickname = normalizeTrainerNickname(raw.nickname)
      ?? normalizeTrainerNickname(raw.customName);
    if (legacyNickname) {
      repairedAppearance.nickname = legacyNickname;
    }
  }

  const repaired = {
    trainerId,
    starterId,
    pos: sanitizePosition(raw.pos),
    appearance: repairedAppearance,
    team,
    box,
    pokedex: {
      seen: rawSeen,
      caught: rawCaught,
    },
    badges: hydrateUniqueStrings(raw.badges),
    shrinesCleared: hydrateUniqueStrings(raw.shrinesCleared),
    chestsOpened: hydrateUniqueStrings(raw.chestsOpened),
    questsCompleted: hydrateUniqueStrings(raw.questsCompleted),
    npcsTalked: hydrateUniqueStrings(raw.npcsTalked),
    biomesVisited: hydrateUniqueStrings(raw.biomesVisited),
    rivalsDefeated: hydrateUniqueStrings(raw.rivalsDefeated),
    rivalRematchCounts: hydrateCountMap(raw.rivalRematchCounts),
    shrineTrialCounts: hydrateCountMap(raw.shrineTrialCounts),
    recentEncounters: hydrateRecentEncounters(raw.recentEncounters),
    recentWarpBiomes: hydrateRecentWarpBiomes(raw.recentWarpBiomes),
    cheerStepProgress: clampCheerStepProgress(raw.cheerStepProgress, 0),
    bag: hydrateProfileBag(raw.bag),
    stats: hydrateProfileStats(raw.stats),
  };

  Object.assign(raw, repaired);
  delete raw.nickname;
  delete raw.customName;
  repairProfileParty(raw);
  deduplicateTeamAndBoxUids(raw, report);
  syncProfilePokedex(raw);
  syncProfilePlayerProgression(raw);

  raw.arcade = hydrateArcade(raw.arcade, { allowLegacyPlayUnlock: true });

  if (report && typeof report === 'object') {
    report.teamOverflowRescued = (report.teamOverflowRescued || 0) + teamOverflow.length;
    report.invalidMonsDropped = (report.invalidMonsDropped || 0) + droppedTeam + droppedBox;
  }

  return raw;
}

function hydrateProfile(raw, trainerId, report = null) {
  if (!isPlainObject(raw)) {
    return createFreshProfile(trainerId);
  }
  return validateAndRepairProfile({ ...raw, trainerId }, trainerId, report);
}

export class StorageManager {
  constructor(storageKey = STORAGE_KEY) {
    this.storageKey = storageKey;
    this.memoryFallback = null;
    this.lastSaveError = null;
    this.lastLoadError = null;
    this.lastRepairSummary = { uidsDeduplicated: 0, teamOverflowRescued: 0, invalidMonsDropped: 0 };
    this.state = this.load();
  }

  _getStorage() {
    try {
      if (typeof window !== 'undefined' && window?.localStorage) {
        return window.localStorage;
      }
      if (typeof globalThis !== 'undefined' && globalThis?.localStorage) {
        return globalThis.localStorage;
      }
    } catch {
      return null;
    }
    return null;
  }

  _formatStorageError(err) {
    if (!err) return 'StorageError';
    const name = typeof err.name === 'string' && err.name ? err.name : '';
    const msg = typeof err.message === 'string' && err.message ? err.message : String(err);
    if (name && msg && !msg.includes(name)) return `${name}: ${msg}`;
    return name || msg || 'StorageError';
  }

  _safeGetItem(key = this.storageKey, { recordLoadError = false } = {}) {
    try {
      const store = this._getStorage();
      if (!store || typeof store.getItem !== 'function') {
        if (recordLoadError) this.lastLoadError = 'localStorage unavailable';
        return null;
      }
      const val = store.getItem(key);
      if (recordLoadError) this.lastLoadError = null;
      return val;
    } catch (err) {
      if (recordLoadError) this.lastLoadError = this._formatStorageError(err);
      return null;
    }
  }

  _safeSetItem(key = this.storageKey, value) {
    try {
      const store = this._getStorage();
      if (!store || typeof store.setItem !== 'function') {
        this.lastSaveError = 'localStorage unavailable';
        return false;
      }
      store.setItem(key, value);
      this.lastSaveError = null;
      return true;
    } catch (err) {
      this.lastSaveError = this._formatStorageError(err);
      return false;
    }
  }

  _safeRemoveItem(key = this.storageKey) {
    try {
      const store = this._getStorage();
      if (!store || typeof store.removeItem !== 'function') {
        return false;
      }
      store.removeItem(key);
      return true;
    } catch (err) {
      this.lastSaveError = this._formatStorageError(err);
      return false;
    }
  }

  safeGetItem(key = this.storageKey) {
    return this._safeGetItem(key);
  }

  safeSetItem(key = this.storageKey, value) {
    return this._safeSetItem(key, value);
  }

  safeRemoveItem(key = this.storageKey) {
    return this._safeRemoveItem(key);
  }

  validateAndRepairProfile(profile, trainerIdFallback = null) {
    const report = { uidsDeduplicated: 0, teamOverflowRescued: 0, invalidMonsDropped: 0 };
    const repaired = validateAndRepairProfile(profile, trainerIdFallback, report);
    this.lastRepairSummary = report;
    return repaired;
  }

  getStorageDiagnostics() {
    let storageAvailable = false;
    let persisted = null;
    try {
      const store = this._getStorage();
      if (store && typeof store.getItem === 'function' && typeof store.setItem === 'function') {
        persisted = store.getItem(this.storageKey);
        storageAvailable = true;
      }
    } catch {
      storageAvailable = false;
      persisted = null;
    }

    const violet = this.state?.profiles?.violet;
    const ozias = this.state?.profiles?.ozias;

    return {
      storageKey: this.storageKey,
      storageAvailable,
      lastSaveError: this.lastSaveError,
      lastLoadError: this.lastLoadError,
      usingMemoryFallback: this.lastSaveError !== null || !storageAvailable,
      hasMemoryFallback: typeof this.memoryFallback === 'string',
      persistedBytes: typeof persisted === 'string' ? persisted.length : 0,
      memoryBytes: typeof this.memoryFallback === 'string' ? this.memoryFallback.length : 0,
      version: this.state?.version ?? 2,
      activeTrainerId: this.state?.activeTrainerId ?? null,
      lastRepairs: { ...this.lastRepairSummary },
      profiles: {
        violet: {
          teamCount: Array.isArray(violet?.team) ? violet.team.length : 0,
          boxCount: Array.isArray(violet?.box) ? violet.box.length : 0,
          caughtCount: isPlainObject(violet?.pokedex?.caught) ? Object.keys(violet.pokedex.caught).length : 0,
          seenCount: Array.isArray(violet?.pokedex?.seen) ? violet.pokedex.seen.length : 0,
        },
        ozias: {
          teamCount: Array.isArray(ozias?.team) ? ozias.team.length : 0,
          boxCount: Array.isArray(ozias?.box) ? ozias.box.length : 0,
          caughtCount: isPlainObject(ozias?.pokedex?.caught) ? Object.keys(ozias.pokedex.caught).length : 0,
          seenCount: Array.isArray(ozias?.pokedex?.seen) ? ozias.pokedex.seen.length : 0,
        },
      },
    };
  }

  load() {
    let rawFromStorage = null;
    let storageReadFailed = false;
    try {
      const store = this._getStorage();
      if (!store || typeof store.getItem !== 'function') {
        storageReadFailed = true;
        this.lastLoadError = 'localStorage unavailable';
      } else {
        rawFromStorage = store.getItem(this.storageKey);
        this.lastLoadError = null;
      }
    } catch (err) {
      storageReadFailed = true;
      this.lastLoadError = this._formatStorageError(err);
    }

    const useFallback = (storageReadFailed || this.lastSaveError !== null) && typeof this.memoryFallback === 'string';
    const rawJson = useFallback ? this.memoryFallback : rawFromStorage;

    if (!rawJson || typeof rawJson !== 'string') {
      if (!storageReadFailed && this.lastSaveError === null) {
        this.memoryFallback = null;
      }
      return createFreshSaveState();
    }

    let parsed = null;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      if (this.memoryFallback && this.memoryFallback !== rawJson) {
        try {
          parsed = JSON.parse(this.memoryFallback);
        } catch {
          parsed = null;
        }
      }
    }

    if (!isPlainObject(parsed)) {
      return createFreshSaveState();
    }

    const report = { uidsDeduplicated: 0, teamOverflowRescued: 0, invalidMonsDropped: 0 };
    const hydrated = {
      version: 2,
      activeTrainerId: parsed.activeTrainerId && TRAINERS[parsed.activeTrainerId] ? parsed.activeTrainerId : null,
      settings: {
        muted: Boolean(parsed.settings?.muted ?? false),
        crtEnabled: Boolean(parsed.settings?.crtEnabled ?? true),
        showTouchPad: ['auto', 'show', 'hide'].includes(parsed.settings?.showTouchPad)
          ? parsed.settings.showTouchPad
          : 'auto',
        battlePace: VALID_PACES.has(parsed.settings?.battlePace) ? parsed.settings.battlePace : 'cinema',
      },
      profiles: {
        violet: hydrateProfile(parsed.profiles?.violet, 'violet', report),
        ozias: hydrateProfile(parsed.profiles?.ozias, 'ozias', report),
      },
    };
    this.lastRepairSummary = report;
    return hydrated;
  }

  save() {
    this.state.version = 2;
    let serialized = '';
    try {
      serialized = JSON.stringify({
        version: 2,
        activeTrainerId: this.state.activeTrainerId,
        settings: this.state.settings,
        profiles: {
          violet: this.serializeProfile(this.state.profiles.violet),
          ozias: this.serializeProfile(this.state.profiles.ozias),
        },
      });
    } catch (err) {
      this.lastSaveError = this._formatStorageError(err);
      return false;
    }
    this.memoryFallback = serialized;
    return this._safeSetItem(this.storageKey, serialized);
  }

  syncPokedex(profile = this.getActiveProfile(), persist = true) {
    if (!profile) return null;
    const { changed } = syncProfilePokedex(profile);
    if (changed && persist) {
      this.save();
    }
    return profile.pokedex || null;
  }

  ensureValidParty(profile = this.getActiveProfile()) {
    if (!profile) return null;
    const beforeLen = profile.team.length;
    repairProfileParty(profile);
    const { changed: dexChanged } = syncProfilePokedex(profile);
    if (profile.team.length !== beforeLen || dexChanged) {
      this.save();
    }
    return profile.team;
  }

  ensureHealthyParty(profile = this.getActiveProfile()) {
    if (!profile) return false;
    this.ensureValidParty(profile);
    if (profile.team.length === 0) return false;
    if (profile.team.every((mon) => mon.isFainted)) {
      profile.team[0].healFull();
      this.save();
    }
    return true;
  }

  serializeProfile(profile) {
    const src = isPlainObject(profile) ? profile : {};
    const cleanBag = isPlainObject(src.bag)
      ? {
          potions: toNonNegInt(src.bag.potions, 0),
          greatBalls: toNonNegInt(src.bag.greatBalls, 0),
          starBalls: toNonNegInt(src.bag.starBalls, 0),
          starShards: toNonNegInt(src.bag.starShards, 0),
          cheerCharges: clampCheerCharges(src.bag.cheerCharges, 0),
          gems: hydrateGems(src.bag.gems),
        }
      : {
          potions: 5,
          greatBalls: 3,
          starBalls: 0,
          starShards: 0,
          cheerCharges: 0,
          gems: hydrateGems(null),
        };
    const out = {
      ...src,
      pos: sanitizePosition(src.pos),
      appearance: hydrateAppearance(src.appearance),
      badges: hydrateUniqueStrings(src.badges),
      shrinesCleared: hydrateUniqueStrings(src.shrinesCleared),
      chestsOpened: hydrateUniqueStrings(src.chestsOpened),
      questsCompleted: hydrateUniqueStrings(src.questsCompleted),
      npcsTalked: hydrateUniqueStrings(src.npcsTalked),
      biomesVisited: hydrateUniqueStrings(src.biomesVisited),
      rivalsDefeated: hydrateUniqueStrings(src.rivalsDefeated),
      rivalRematchCounts: hydrateCountMap(src.rivalRematchCounts),
      shrineTrialCounts: hydrateCountMap(src.shrineTrialCounts),
      recentEncounters: hydrateRecentEncounters(src.recentEncounters),
      recentWarpBiomes: hydrateRecentWarpBiomes(src.recentWarpBiomes),
      cheerStepProgress: clampCheerStepProgress(src.cheerStepProgress, 0),
      arcade: hydrateArcade(src.arcade, { allowLegacyPlayUnlock: false }),
      bag: cleanBag,
      stats: hydrateProfileStats(src.stats),
      team: (Array.isArray(src.team) ? src.team : []).map((p) => (typeof p?.toJSON === 'function' ? p.toJSON() : p)),
      box: (Array.isArray(src.box) ? src.box : []).map((p) => (typeof p?.toJSON === 'function' ? p.toJSON() : p)),
    };
    const prog = syncProfilePlayerProgression(out);
    if (isPlainObject(profile)) {
      profile.trainerXp = prog.xp;
      profile.playerLevel = prog.level;
    }
    return out;
  }

  selectTrainer(trainerId) {
    if (!TRAINERS[trainerId]) throw new Error(`Unknown trainerId: ${trainerId}`);
    this.state.activeTrainerId = trainerId;
    const profile = this.getActiveProfile();
    this.syncPokedex(profile, true);
    syncProfilePlayerProgression(profile);
    this.save();
    return profile;
  }

  getActiveTrainerId() {
    return this.state.activeTrainerId;
  }

  getProfile(trainerId) {
    return this.state.profiles[trainerId] || null;
  }

  getActiveProfile() {
    if (!this.state.activeTrainerId) return null;
    return this.state.profiles[this.state.activeTrainerId] || null;
  }

  getPlayerProgression(profile = this.getActiveProfile()) {
    return getPlayerProgression(profile);
  }

  getPlayerLevel(profile = this.getActiveProfile()) {
    return this.getPlayerProgression(profile).level;
  }

  getProfileSummary(trainerId) {
    const profile = this.getProfile(trainerId);
    if (!profile || !profile.starterId) {
      return { started: false, label: 'New Adventure!', leadId: null, dexCount: 0, badgeCount: 0, playerLevel: 1 };
    }
    syncProfilePokedex(profile);
    const prog = syncProfilePlayerProgression(profile);
    const playerLevel = prog.level;
    const lead = profile.team[0];
    const dexCount = Object.keys(profile.pokedex.caught).length;
    const badgeCount = profile.badges.length;
    const leadLabel = lead ? `Lv.${lead.level} ${lead.displayName || lead.name}` : 'Ready';
    return {
      started: true,
      label: `Trainer Lv.${playerLevel} • ${leadLabel} • Dex ${dexCount}/${Object.keys(SPECIES).length} • ${badgeCount} Badges`,
      leadId: lead ? lead.speciesId : profile.starterId,
      dexCount,
      badgeCount,
      playerLevel,
    };
  }

  chooseStarter(speciesId) {
    const profile = this.getActiveProfile();
    if (!profile) return null;
    const resolvedInput = resolveSpeciesId(speciesId) ?? speciesId;
    const starter = createStarterPokemon(resolvedInput);
    const numId = Number(starter.speciesId);
    profile.starterId = numId;
    profile.team = [starter];
    profile.box = [];
    profile.pos = { ...GAME_META.spawn };
    if (!isPlainObject(profile.pokedex) || !isPlainObject(profile.pokedex.caught)) {
      syncProfilePokedex(profile);
    }
    this.recordSeen(numId, false);
    profile.pokedex.caught[numId] = toNonNegInt(profile.pokedex.caught[numId], 0) + 1;
    if (!isPlainObject(profile.stats)) profile.stats = hydrateProfileStats(null);
    profile.stats.totalCaught = toNonNegInt(profile.stats.totalCaught, 0) + 1;
    syncProfilePokedex(profile);
    syncProfilePlayerProgression(profile);
    this.evaluateBadges(false);
    this.save();
    return starter;
  }

  getCheerState(profile = this.getActiveProfile()) {
    if (!profile || typeof profile !== 'object') {
      return {
        charges: 0,
        maxCharges: MAX_CHEER_CHARGES,
        stepProgress: 0,
        stepsPerCharge: STEPS_PER_CHEER_CHARGE,
        stepsUntilNext: STEPS_PER_CHEER_CHARGE,
      };
    }
    const charges = clampCheerCharges(profile.bag?.cheerCharges, 0);
    const rawProgress = clampCheerStepProgress(profile.cheerStepProgress, 0);
    const stepProgress = charges >= MAX_CHEER_CHARGES ? 0 : rawProgress;
    const stepsUntilNext = charges >= MAX_CHEER_CHARGES ? 0 : STEPS_PER_CHEER_CHARGE - stepProgress;
    return {
      charges,
      maxCharges: MAX_CHEER_CHARGES,
      stepProgress,
      stepsPerCharge: STEPS_PER_CHEER_CHARGE,
      stepsUntilNext,
    };
  }

  addCheerCharges(count = 1, persist = true) {
    const profile = this.getActiveProfile();
    if (!profile) {
      return { charges: 0, added: 0, maxCharges: MAX_CHEER_CHARGES };
    }
    if (!isPlainObject(profile.bag)) {
      profile.bag = createEmptyBag();
    }
    const prevCharges = clampCheerCharges(profile.bag.cheerCharges, 0);
    const addCount = toNonNegInt(count, 0);
    const nextCharges = Math.min(MAX_CHEER_CHARGES, prevCharges + addCount);
    const added = Math.max(0, nextCharges - prevCharges);
    profile.bag.cheerCharges = nextCharges;
    if (nextCharges >= MAX_CHEER_CHARGES) {
      profile.cheerStepProgress = 0;
    } else {
      profile.cheerStepProgress = clampCheerStepProgress(profile.cheerStepProgress, 0);
    }
    if (persist) this.save();
    return { charges: nextCharges, added, maxCharges: MAX_CHEER_CHARGES };
  }

  updatePosition(x, y, dir, incSteps = false) {
    const profile = this.getActiveProfile();
    if (!profile) {
      return {
        stepCheerEarned: false,
        cheerCharges: 0,
        stepProgress: 0,
        stepArcadeChargeEarned: false,
        arcadeCharges: 0,
        arcadeStepProgress: 0,
      };
    }
    profile.pos = sanitizePosition({ x, y, dir });
    if (!isPlainObject(profile.bag)) {
      profile.bag = createEmptyBag();
    }
    let stepCheerEarned = false;
    let cheerCharges = clampCheerCharges(profile.bag.cheerCharges, 0);
    profile.bag.cheerCharges = cheerCharges;
    let stepProgress = cheerCharges >= MAX_CHEER_CHARGES
      ? 0
      : clampCheerStepProgress(profile.cheerStepProgress, 0);

    if (!isPlainObject(profile.arcade)) {
      profile.arcade = hydrateArcade(null, { allowLegacyPlayUnlock: false });
    }
    const arcadeUnlocked = this.isArcadeUnlocked(profile);
    let stepArcadeChargeEarned = false;
    let arcadeCharges = arcadeUnlocked ? clampArcadeCharges(profile.arcade.charges, 0) : 0;
    profile.arcade.charges = arcadeCharges;
    let arcadeStepProgress = (!arcadeUnlocked || arcadeCharges >= MAX_ARCADE_CHARGES)
      ? 0
      : clampArcadeStepProgress(profile.arcade.stepProgress, 0);

    if (incSteps) {
      if (!isPlainObject(profile.stats)) profile.stats = hydrateProfileStats(null);
      profile.stats.steps = toNonNegInt(profile.stats.steps, 0) + 1;
      if (Array.isArray(profile.team) && profile.team.length > 0) {
        if (cheerCharges >= MAX_CHEER_CHARGES) {
          stepProgress = 0;
        } else {
          stepProgress += 1;
          if (stepProgress >= STEPS_PER_CHEER_CHARGE) {
            stepProgress = 0;
            cheerCharges = Math.min(MAX_CHEER_CHARGES, cheerCharges + 1);
            profile.bag.cheerCharges = cheerCharges;
            stepCheerEarned = true;
          }
        }

        if (arcadeUnlocked) {
          if (arcadeCharges >= MAX_ARCADE_CHARGES) {
            arcadeStepProgress = 0;
            profile.arcade.battleProgress = 0;
          } else {
            arcadeStepProgress += 1;
            if (arcadeStepProgress >= STEPS_PER_ARCADE_CHARGE) {
              arcadeStepProgress = 0;
              arcadeCharges = Math.min(MAX_ARCADE_CHARGES, arcadeCharges + 1);
              profile.arcade.charges = arcadeCharges;
              if (arcadeCharges >= MAX_ARCADE_CHARGES) {
                profile.arcade.battleProgress = 0;
              }
              stepArcadeChargeEarned = true;
            }
          }
        }
      }
    }
    profile.cheerStepProgress = stepProgress;
    profile.arcade.stepProgress = arcadeStepProgress;
    this.save();
    return {
      stepCheerEarned,
      cheerCharges,
      stepProgress,
      stepArcadeChargeEarned,
      arcadeCharges,
      arcadeStepProgress,
    };
  }

  recordSeen(speciesId, persist = true) {
    const profile = this.getActiveProfile();
    if (!profile) return;
    const numId = resolveSpeciesId(speciesId);
    if (!numId || !SPECIES[numId]) return;
    if (!isPlainObject(profile.pokedex) || !Array.isArray(profile.pokedex.seen)) {
      syncProfilePokedex(profile);
    }
    const alreadySeen = profile.pokedex.seen.includes(numId);
    if (!alreadySeen) {
      profile.pokedex.seen.push(numId);
    }
    const { changed } = syncProfilePokedex(profile);
    if (persist && (!alreadySeen || changed)) {
      this.save();
    }
  }

  recordShinyEncounter(persist = true) {
    const profile = this.getActiveProfile();
    if (!profile) return 0;
    if (!isPlainObject(profile.stats)) profile.stats = hydrateProfileStats(null);
    profile.stats.shiniesFound = toNonNegInt(profile.stats.shiniesFound, 0) + 1;
    if (persist) this.save();
    return profile.stats.shiniesFound;
  }

  recordCaught(pokemonInstance) {
    const profile = this.getActiveProfile();
    if (!profile || !pokemonInstance) return { destination: 'team', newBadges: [] };

    const mon = pokemonInstance instanceof Pokemon ? pokemonInstance : safeHydrateMon(pokemonInstance);
    if (!mon) return { destination: 'team', newBadges: [] };
    const numId = resolveSpeciesId(mon.speciesId);
    if (!numId || !SPECIES[numId]) return { destination: 'team', newBadges: [] };

    if (!isPlainObject(profile.pokedex) || !isPlainObject(profile.pokedex.caught)) {
      syncProfilePokedex(profile);
    }
    if (!isPlainObject(profile.stats)) {
      profile.stats = hydrateProfileStats(null);
    }
    if (!Array.isArray(profile.team)) profile.team = [];
    if (!Array.isArray(profile.box)) profile.box = [];

    const usedUids = new Set(
      [...profile.team, ...profile.box].map((m) => (typeof m?.uid === 'string' ? m.uid.trim() : '')).filter(Boolean),
    );
    const monUid = typeof mon.uid === 'string' ? mon.uid.trim() : '';
    if (!monUid || usedUids.has(monUid)) {
      mon.uid = generateUniqueUid(usedUids);
    }

    this.recordSeen(numId, false);
    const prevCaughtVal = profile.pokedex.caught[numId];
    const prevCount = prevCaughtVal === true ? 1 : toNonNegInt(prevCaughtVal, 0);
    profile.pokedex.caught[numId] = prevCount + 1;
    profile.stats.totalCaught = toNonNegInt(profile.stats.totalCaught, 0) + 1;
    if (mon.isShiny) {
      profile.stats.shiniesFound = toNonNegInt(profile.stats.shiniesFound, 0) + 1;
    }

    let destination = 'team';
    if (profile.team.length < 6) {
      profile.team.push(mon);
    } else {
      profile.box.push(mon);
      destination = 'box';
    }

    syncProfilePokedex(profile);
    syncProfilePlayerProgression(profile);
    const newBadges = this.evaluateBadges(false);
    this.save();
    return { destination, newBadges };
  }

  swapTeamWithBox(teamIdx, boxIdx) {
    const profile = this.getActiveProfile();
    if (!profile || !Array.isArray(profile.team) || !Array.isArray(profile.box)) return false;
    if (!Number.isInteger(teamIdx) || !Number.isInteger(boxIdx)) return false;
    if (teamIdx < 0 || teamIdx >= profile.team.length) return false;
    if (boxIdx < 0 || boxIdx >= profile.box.length) return false;
    if (!profile.team[teamIdx] || !profile.box[boxIdx]) return false;
    const temp = profile.team[teamIdx];
    profile.team[teamIdx] = profile.box[boxIdx];
    profile.box[boxIdx] = temp;
    deduplicateTeamAndBoxUids(profile);
    syncProfilePokedex(profile);
    this.save();
    return true;
  }

  depositToBox(teamIdx) {
    const profile = this.getActiveProfile();
    if (!profile || !Array.isArray(profile.team) || !Array.isArray(profile.box)) return false;
    if (profile.team.length <= 1) return false;
    if (!Number.isInteger(teamIdx) || teamIdx < 0 || teamIdx >= profile.team.length) return false;
    const mon = profile.team[teamIdx];
    if (!mon) return false;
    if (!mon.isFainted && !profile.team.some((m, idx) => idx !== teamIdx && m && !m.isFainted)) {
      return false;
    }
    profile.team.splice(teamIdx, 1);
    profile.box.push(mon);
    deduplicateTeamAndBoxUids(profile);
    syncProfilePokedex(profile);
    this.save();
    return true;
  }

  withdrawFromBox(boxIdx) {
    const profile = this.getActiveProfile();
    if (!profile || !Array.isArray(profile.team) || !Array.isArray(profile.box)) return false;
    if (profile.team.length >= 6) return false;
    if (!Number.isInteger(boxIdx) || boxIdx < 0 || boxIdx >= profile.box.length) return false;
    const mon = profile.box[boxIdx];
    if (!mon) return false;
    profile.box.splice(boxIdx, 1);
    profile.team.push(mon);
    deduplicateTeamAndBoxUids(profile);
    syncProfilePokedex(profile);
    this.save();
    return true;
  }

  setLeadPokemon(teamIdx) {
    const profile = this.getActiveProfile();
    if (
      !profile
      || !Array.isArray(profile.team)
      || !Number.isInteger(teamIdx)
      || teamIdx <= 0
      || teamIdx >= profile.team.length
      || !profile.team[teamIdx]
    ) {
      return false;
    }
    const [picked] = profile.team.splice(teamIdx, 1);
    profile.team.unshift(picked);
    syncProfilePokedex(profile);
    this.save();
    return true;
  }

  healTeam(refillMinPotions = false) {
    const profile = this.getActiveProfile();
    if (!profile) return;
    if (!Array.isArray(profile.team)) {
      profile.team = [];
    }
    for (const mon of profile.team) {
      mon?.healFull?.();
    }
    if (!isPlainObject(profile.bag)) {
      profile.bag = createEmptyBag();
    }
    const safePotions = toNonNegInt(profile.bag.potions, 0);
    profile.bag.potions = refillMinPotions && safePotions < 5 ? 5 : safePotions;
    this.save();
  }

  healPokemonWithPotion(monOrUid) {
    const profile = this.getActiveProfile();
    if (!profile) {
      return { healed: false, reason: 'no_profile' };
    }
    const targetUid = typeof monOrUid === 'string'
      ? monOrUid.trim()
      : (typeof monOrUid?.uid === 'string' ? monOrUid.uid.trim() : '');
    const ownedMons = [
      ...(Array.isArray(profile.team) ? profile.team : []),
      ...(Array.isArray(profile.box) ? profile.box : []),
    ];
    const mon = ownedMons.find((m) => m && ((monOrUid && m === monOrUid) || (targetUid && m.uid === targetUid))) || null;
    if (!mon) {
      return { healed: false, reason: 'not_found' };
    }

    const potions = toNonNegInt(profile.bag?.potions, 0);
    const maxHp = Number.isFinite(Number(mon.maxHp)) && Number(mon.maxHp) > 0 ? Math.round(Number(mon.maxHp)) : 20;
    const currentHp = Number.isFinite(Number(mon.hp)) ? Math.max(0, Math.round(Number(mon.hp))) : maxHp;
    if (currentHp >= maxHp) {
      return { healed: false, reason: 'full_hp', remainingPotions: potions };
    }
    if (potions < 1) {
      if (isPlainObject(profile.bag)) {
        profile.bag.potions = 0;
      }
      return { healed: false, reason: 'insufficient_potions', remainingPotions: 0 };
    }

    if (!isPlainObject(profile.bag)) {
      profile.bag = createEmptyBag();
    }
    profile.bag.potions = potions - 1;
    const healDelta = Math.max(18, Math.round(maxHp * 0.45));
    const healedHp = typeof mon.healAmount === 'function'
      ? mon.healAmount(healDelta)
      : (() => {
          const nextHp = Math.min(maxHp, currentHp + healDelta);
          mon.hp = nextHp;
          return Math.max(0, nextHp - currentHp);
        })();
    this.save();
    return {
      healed: true,
      healedHp,
      hp: mon.hp,
      maxHp: mon.maxHp,
      remainingPotions: profile.bag.potions,
    };
  }

  useItem(itemKey) {
    const profile = this.getActiveProfile();
    if (!profile || typeof itemKey !== 'string') return false;
    if (Object.prototype.hasOwnProperty.call(EVOLUTION_ITEMS, itemKey)) {
      return this.useGem(itemKey);
    }
    if (!ALLOWED_BAG_CONSUMABLES.has(itemKey)) {
      return false;
    }
    if (!isPlainObject(profile.bag)) return false;
    const current = itemKey === 'cheerCharges'
      ? clampCheerCharges(profile.bag.cheerCharges, 0)
      : toNonNegInt(profile.bag[itemKey], 0);
    if (current <= 0) return false;
    profile.bag[itemKey] = current - 1;
    this.save();
    return true;
  }

  addGem(gemId, count = 1, persist = true) {
    const profile = this.getActiveProfile();
    if (!profile || typeof gemId !== 'string' || !Object.prototype.hasOwnProperty.call(EVOLUTION_ITEMS, gemId)) {
      return 0;
    }
    const add = toNonNegInt(count, 0);
    if (!isPlainObject(profile.bag)) {
      profile.bag = createEmptyBag();
    }
    if (!isPlainObject(profile.bag.gems)) {
      profile.bag.gems = hydrateGems(null);
    }
    profile.bag.gems[gemId] = toNonNegInt(profile.bag.gems[gemId], 0) + add;
    if (persist) this.save();
    return profile.bag.gems[gemId];
  }

  useGem(gemId, persist = true) {
    const profile = this.getActiveProfile();
    if (!profile || typeof gemId !== 'string' || !Object.prototype.hasOwnProperty.call(EVOLUTION_ITEMS, gemId)) {
      return false;
    }
    if (!isPlainObject(profile.bag?.gems)) return false;
    const current = toNonNegInt(profile.bag.gems[gemId], 0);
    if (current <= 0) return false;
    profile.bag.gems[gemId] = current - 1;
    if (persist) this.save();
    return true;
  }

  addStarShards(count = 1, persist = true) {
    const profile = this.getActiveProfile();
    if (!profile) return 0;
    if (!isPlainObject(profile.bag)) {
      profile.bag = createEmptyBag();
    }
    const add = toNonNegInt(count, 0);
    const prev = hydrateStarShards(profile.bag.starShards, 0);
    profile.bag.starShards = prev + add;
    if (persist) this.save();
    return profile.bag.starShards;
  }

  addRewards(rawRewards = {}, persist = true) {
    const profile = this.getActiveProfile();
    if (!profile) return;
    if (!isPlainObject(profile.bag)) {
      profile.bag = createEmptyBag();
    }
    const rewards = isPlainObject(rawRewards) ? rawRewards : {};
    const safePotions = toNonNegInt(rewards.potions, 0);
    const safeBalls = toNonNegInt(rewards.greatBalls, 0);
    const safeStarBalls = toNonNegInt(rewards.starBalls, 0);
    const safeShards = toNonNegInt(rewards.starShards, 0);
    const safeCheers = toNonNegInt(rewards.cheerCharges, 0);
    profile.bag.potions = toNonNegInt(profile.bag.potions, 0) + safePotions;
    profile.bag.greatBalls = toNonNegInt(profile.bag.greatBalls, 0) + safeBalls;
    profile.bag.starBalls = toNonNegInt(profile.bag.starBalls, 0) + safeStarBalls;
    profile.bag.starShards = hydrateStarShards(profile.bag.starShards, 0) + safeShards;
    this.addCheerCharges(safeCheers, false);
    if (isPlainObject(rewards.gems)) {
      for (const [gemId, amount] of Object.entries(rewards.gems)) {
        if (Object.prototype.hasOwnProperty.call(EVOLUTION_ITEMS, gemId)) {
          const safeAmt = toNonNegInt(amount, 0);
          if (safeAmt > 0) {
            this.addGem(gemId, safeAmt, false);
          }
        }
      }
    }
    if (persist) this.save();
  }

  upgradePokemon(monOrUid) {
    const profile = this.getActiveProfile();
    if (!profile) {
      return { upgraded: false, reason: 'no_profile' };
    }

    const targetUid = typeof monOrUid === 'string'
      ? monOrUid.trim()
      : (typeof monOrUid?.uid === 'string' ? monOrUid.uid.trim() : '');
    const ownedMons = [
      ...(Array.isArray(profile.team) ? profile.team : []),
      ...(Array.isArray(profile.box) ? profile.box : []),
    ];
    const mon = ownedMons.find((m) => m && ((monOrUid && m === monOrUid) || (targetUid && m.uid === targetUid))) || null;
    if (!mon) {
      return { upgraded: false, reason: 'not_found' };
    }

    const currentShards = toNonNegInt(profile.bag?.starShards, 0);
    if (isPlainObject(profile.bag) && profile.bag.starShards !== currentShards) {
      profile.bag.starShards = currentShards;
    }
    const rawCost = typeof mon.getUpgradeCost === 'function' ? mon.getUpgradeCost() : null;
    const cost = rawCost !== null && rawCost !== undefined && !isInvalidNumericInput(rawCost) && Number.isFinite(Number(rawCost)) && Number(rawCost) > 0
      ? Math.floor(Number(rawCost))
      : null;
    if (cost === null) {
      return {
        upgraded: false,
        reason: 'max_tier',
        cost: null,
        remainingShards: currentShards,
      };
    }

    if (!isPlainObject(profile.bag)) {
      profile.bag = createEmptyBag();
    }
    if (currentShards < cost) {
      return {
        upgraded: false,
        reason: 'insufficient_shards',
        cost,
        remainingShards: currentShards,
      };
    }

    const remainingShards = currentShards - cost;
    profile.bag.starShards = remainingShards;
    const upgradeRes = mon.applyUpgrade();
    if (!upgradeRes?.upgraded) {
      profile.bag.starShards = currentShards;
      return {
        upgraded: false,
        reason: upgradeRes?.reason || 'upgrade_failed',
        cost,
        remainingShards: currentShards,
      };
    }

    if (!isPlainObject(profile.stats)) {
      profile.stats = hydrateProfileStats(null);
    }
    profile.stats.upgrades = toNonNegInt(profile.stats.upgrades, 0) + 1;
    syncProfilePokedex(profile);
    const newBadges = this.evaluateBadges(false);
    this.save();

    return {
      upgraded: true,
      cost,
      remainingShards,
      oldTier: upgradeRes.oldTier,
      newTier: upgradeRes.newTier,
      levelResult: upgradeRes.levelResult,
      pendingEvo: upgradeRes.pendingEvo,
      newBadges,
    };
  }

  cheerPokemon(monOrUid) {
    const profile = this.getActiveProfile();
    if (!profile) {
      return { cheered: false, reason: 'no_profile' };
    }

    const targetUid = typeof monOrUid === 'string'
      ? monOrUid.trim()
      : (typeof monOrUid?.uid === 'string' ? monOrUid.uid.trim() : '');
    const mons = [
      ...(Array.isArray(profile.team) ? profile.team : []),
      ...(Array.isArray(profile.box) ? profile.box : []),
    ];
    const mon = mons.find((m) => m && ((monOrUid && m === monOrUid) || (targetUid && m.uid === targetUid))) || null;
    if (!mon) {
      return { cheered: false, reason: 'not_found' };
    }

    const prevBond = normalizeMonBond(mon.bond);
    const cheerState = this.getCheerState(profile);
    if (isPlainObject(profile.bag) && profile.bag.cheerCharges !== cheerState.charges) {
      profile.bag.cheerCharges = cheerState.charges;
    }
    if (prevBond >= 100) {
      return {
        cheered: false,
        reason: 'max_bond',
        bond: 100,
        tier: getBondTier(100),
        remainingCheers: cheerState.charges,
        newBadges: [],
      };
    }

    if (cheerState.charges < 1) {
      return {
        cheered: false,
        reason: 'insufficient_cheers',
        cost: 1,
        bond: prevBond,
        tier: getBondTier(prevBond),
        remainingCheers: 0,
        stepsUntilNext: cheerState.stepsUntilNext,
        newBadges: [],
      };
    }

    if (!isPlainObject(profile.bag)) {
      profile.bag = createEmptyBag();
    }
    profile.bag.cheerCharges = cheerState.charges - 1;

    if (typeof mon.gainBond === 'function') {
      mon.bond = prevBond;
      mon.gainBond(10);
    } else {
      mon.bond = Math.max(0, Math.min(100, Math.round(prevBond + 10)));
    }
    const nextBond = normalizeMonBond(mon.bond);
    mon.bond = nextBond;

    if (!isPlainObject(profile.stats)) {
      profile.stats = hydrateProfileStats(null);
    }
    profile.stats.cheers = toNonNegInt(profile.stats.cheers, 0) + 1;

    const newBadges = this.evaluateBadges(false);
    this.save();

    return {
      cheered: true,
      cost: 1,
      remainingCheers: profile.bag.cheerCharges,
      prevBond,
      bond: nextBond,
      bondGain: Math.max(0, nextBond - prevBond),
      tier: getBondTier(nextBond),
      newBadges,
    };
  }

  hasAnyReadyEvolution(profile = this.getActiveProfile()) {
    if (!profile || typeof profile !== 'object') return false;
    const gems = profile.bag?.gems || {};
    const mons = [
      ...(Array.isArray(profile.team) ? profile.team : []),
      ...(Array.isArray(profile.box) ? profile.box : []),
    ];
    return mons.some((mon) => {
      if (!mon) return false;
      if (typeof mon.getPendingLevelEvolution === 'function' && mon.getPendingLevelEvolution()) {
        return true;
      }
      if (typeof mon.getAvailableItemEvolutions === 'function') {
        return mon.getAvailableItemEvolutions(gems).some((opt) => Boolean(opt?.canUse));
      }
      return false;
    });
  }

  updateAppearance(partial = {}) {
    const profile = this.getActiveProfile();
    if (!profile) return null;
    const current = hydrateAppearance(profile.appearance);
    const patch = isPlainObject(partial) ? { ...partial } : {};
    const hasNicknameKey = Object.prototype.hasOwnProperty.call(patch, 'nickname')
      || Object.prototype.hasOwnProperty.call(patch, 'customName');

    let nextNickname = current.nickname ?? null;
    if (hasNicknameKey) {
      const rawNick = Object.prototype.hasOwnProperty.call(patch, 'nickname') && patch.nickname !== undefined
        ? patch.nickname
        : patch.customName;
      nextNickname = normalizeTrainerNickname(rawNick);
      delete patch.nickname;
      delete patch.customName;
      clearLegacyProfileNicknames(profile);
    }

    const merged = {
      ...current,
      ...patch,
    };
    if (nextNickname) {
      merged.nickname = nextNickname;
    } else {
      delete merged.nickname;
    }

    profile.appearance = hydrateAppearance(merged);
    this.save();
    return profile.appearance;
  }

  getTrainerDisplayName(profile = this.getActiveProfile()) {
    const fallbackId = profile ? (this.state?.activeTrainerId ?? null) : null;
    return resolveTrainerDisplayName(profile, fallbackId);
  }

  setTrainerNickname(nickname, trainerId = this.state?.activeTrainerId) {
    const rawId = typeof trainerId === 'string' ? trainerId.trim().toLowerCase() : '';
    const hasTrainer = Boolean(rawId) && Object.prototype.hasOwnProperty.call(TRAINERS, rawId);
    const profile = hasTrainer ? this.getProfile(rawId) : null;
    if (!profile) {
      return resolveTrainerDisplayName(null, hasTrainer ? rawId : null);
    }

    const current = hydrateAppearance(profile.appearance);
    const cleaned = normalizeTrainerNickname(nickname);
    const baseAppearance = {
      styleId: current.styleId,
      accessory: current.accessory,
      cape: current.cape,
      aura: current.aura,
    };
    profile.appearance = hydrateAppearance(cleaned ? { ...baseAppearance, nickname: cleaned } : baseAppearance);
    clearLegacyProfileNicknames(profile);
    this.save();
    return this.getTrainerDisplayName(profile);
  }

  formatText(template, extraContext = {}) {
    const safeExtra = isPlainObject(extraContext) ? extraContext : {};
    return formatGameText(template, {
      profile: this.getActiveProfile(),
      ...safeExtra,
    });
  }

  setPokemonNickname(uid, nickname) {
    const profile = this.getActiveProfile();
    if (!profile || !uid) return null;
    const mon = [...profile.team, ...profile.box].find((m) => m.uid === uid);
    if (!mon) return null;
    if (typeof mon.setNickname === 'function') {
      mon.setNickname(nickname);
    } else {
      const cleaned = typeof nickname === 'string' ? nickname.trim().slice(0, 14).trim() : '';
      mon.nickname = cleaned.length > 0 ? cleaned : null;
    }
    this.save();
    return mon;
  }

  evolvePokemon(monOrUid, toSpeciesId, itemKey = null) {
    const profile = this.getActiveProfile();
    if (!profile) return null;
    const targetId = resolveSpeciesId(toSpeciesId);
    if (!targetId || !SPECIES[targetId]) return null;

    const targetUid = typeof monOrUid === 'string'
      ? monOrUid.trim()
      : (typeof monOrUid?.uid === 'string' ? monOrUid.uid.trim() : '');
    const ownedMons = [
      ...(Array.isArray(profile.team) ? profile.team : []),
      ...(Array.isArray(profile.box) ? profile.box : []),
    ];
    const mon = ownedMons.find((m) => m && ((monOrUid && m === monOrUid) || (targetUid && m.uid === targetUid))) || null;
    if (!mon) return null;

    const rules = Array.isArray(EVOLUTIONS?.[mon.speciesId]) ? EVOLUTIONS[mon.speciesId] : [];
    const hasItemArg = itemKey !== null && itemKey !== undefined && itemKey !== '';
    if (hasItemArg) {
      if (typeof itemKey !== 'string') return null;
      const cleanItemKey = itemKey.trim();
      if (!cleanItemKey || !Object.prototype.hasOwnProperty.call(EVOLUTION_ITEMS, cleanItemKey)) {
        return null;
      }
      const matchedItemRule = rules.find(
        (rule) => Number(rule?.to) === targetId && rule?.item === cleanItemKey,
      );
      if (!matchedItemRule) return null;
      if (!this.useGem(cleanItemKey, false)) return null;
    } else {
      const monLevel = !isInvalidNumericInput(mon.level) && Number.isFinite(Number(mon.level))
        ? Math.floor(Number(mon.level))
        : 0;
      const matchedLevelRule = rules.find(
        (rule) => (
          Number(rule?.to) === targetId
          && !isInvalidNumericInput(rule?.minLevel)
          && Number.isFinite(Number(rule.minLevel))
          && monLevel >= Number(rule.minLevel)
        ),
      );
      if (!matchedLevelRule) return null;
    }

    if (!isPlainObject(profile.pokedex) || !isPlainObject(profile.pokedex.caught)) {
      syncProfilePokedex(profile);
    }

    const preEvoId = resolveSpeciesId(mon.speciesId);
    if (preEvoId && SPECIES[preEvoId]) {
      this.recordSeen(preEvoId, false);
      profile.pokedex.caught[preEvoId] = Math.max(profile.pokedex.caught[preEvoId] || 0, 1);
    }

    const evolution = mon.evolve(targetId);
    this.recordSeen(targetId, false);
    profile.pokedex.caught[targetId] = toNonNegInt(profile.pokedex.caught[targetId], 0) + 1;
    if (!isPlainObject(profile.stats)) profile.stats = hydrateProfileStats(null);
    profile.stats.evolutions = toNonNegInt(profile.stats.evolutions, 0) + 1;
    syncProfilePokedex(profile);
    syncProfilePlayerProgression(profile);

    const newBadges = this.evaluateBadges(false);
    this.save();
    return { evolution, newBadges };
  }

  recordBiomeVisited(biomeId, persist = true) {
    const profile = this.getActiveProfile();
    if (!profile || !biomeId) return false;
    if (!Array.isArray(profile.biomesVisited)) profile.biomesVisited = [];
    if (profile.biomesVisited.includes(biomeId)) return false;
    profile.biomesVisited.push(biomeId);
    if (persist) this.save();
    return true;
  }

  /**
   * Persist a starlight warp landing without mutating step, cheer, arcade,
   * party, bag, or Pokédex progress.
   */
  warpToZone(x, y, dir = 'down', biomeId = null) {
    const profile = this.getActiveProfile();
    if (!profile) {
      return { warped: false, reason: 'no_profile' };
    }
    const safePos = sanitizePosition({ x, y, dir });
    profile.pos = safePos;
    const biomesMap = Config.BIOMES || BIOMES;
    const validBiomeId = typeof biomeId === 'string' && Object.prototype.hasOwnProperty.call(biomesMap, biomeId)
      ? biomeId
      : null;
    if (validBiomeId) {
      this.recordBiomeVisited(validBiomeId, false);
      if (validBiomeId !== 'village') {
        const prevWarps = hydrateRecentWarpBiomes(profile.recentWarpBiomes);
        profile.recentWarpBiomes = [...prevWarps.filter((b) => b !== validBiomeId), validBiomeId].slice(-3);
      }
    }
    const newBadges = this.evaluateBadges(false) || [];
    this.save();
    return {
      warped: true,
      pos: { ...safePos },
      biomeId: validBiomeId,
      newBadges,
    };
  }

  /**
   * Recall the trainer safely to Starlight Village without mutating step, cheer,
   * arcade, party, bag, or Pokédex progress.
   */
  warpToSafeZone() {
    const safePt = Config.getSafeZoneWarpPoint?.() || {
      x: GAME_META.spawn?.x ?? 8,
      y: GAME_META.spawn?.y ?? 15,
      dir: GAME_META.spawn?.dir || 'down',
    };
    const res = this.warpToZone(safePt.x, safePt.y, safePt.dir || 'down', 'village');
    return {
      ...res,
      mode: 'safe',
      biomeId: 'village',
    };
  }

  markNpcTalked(npcId) {
    const profile = this.getActiveProfile();
    if (!profile || !npcId) return false;
    if (!Array.isArray(profile.npcsTalked)) profile.npcsTalked = [];
    if (profile.npcsTalked.includes(npcId)) return false;
    profile.npcsTalked.push(npcId);
    this.save();
    return true;
  }

  completeQuest(questId, rewards = {}) {
    const profile = this.getActiveProfile();
    if (!profile || !questId) {
      return { completed: false, alreadyCompleted: false, rewards: null, newBadges: [] };
    }
    if (!Array.isArray(profile.questsCompleted)) profile.questsCompleted = [];
    if (profile.questsCompleted.includes(questId)) {
      return { completed: false, alreadyCompleted: true, rewards: null, newBadges: [] };
    }

    profile.questsCompleted.push(questId);
    this.addRewards(rewards || {}, false);
    syncProfilePlayerProgression(profile);
    const newBadges = this.evaluateBadges(false);
    this.save();
    return { completed: true, rewards, newBadges };
  }

  markChestOpened(chestId) {
    const profile = this.getActiveProfile();
    if (!profile || !chestId) return false;
    if (!Array.isArray(profile.chestsOpened)) profile.chestsOpened = [];
    if (profile.chestsOpened.includes(chestId)) return false;
    profile.chestsOpened.push(chestId);
    this.save();
    return true;
  }

  markShrineCleared(shrineId) {
    const profile = this.getActiveProfile();
    if (!profile || !shrineId) return [];
    if (!Array.isArray(profile.shrinesCleared)) profile.shrinesCleared = [];
    const firstClear = !profile.shrinesCleared.includes(shrineId);
    if (firstClear) {
      profile.shrinesCleared.push(shrineId);
    }
    syncProfilePokedex(profile);
    syncProfilePlayerProgression(profile);
    if (firstClear && this.isArcadeUnlocked(profile)) {
      this.addArcadeCharges(1, false);
    }
    const newBadges = this.evaluateBadges(false);
    this.save();
    return newBadges;
  }

  markRivalDefeated(rivalId, rewards = {}) {
    const profile = this.getActiveProfile();
    if (!profile || !rivalId) {
      return { firstWin: false, rematchCount: 0, newBadges: [] };
    }
    if (!Array.isArray(profile.rivalsDefeated)) {
      profile.rivalsDefeated = [];
    }
    if (!isPlainObject(profile.rivalRematchCounts)) {
      profile.rivalRematchCounts = {};
    }
    const id = String(rivalId);
    const firstWin = !profile.rivalsDefeated.includes(id);
    if (firstWin) {
      profile.rivalsDefeated.push(id);
      profile.rivalRematchCounts[id] = toNonNegInt(profile.rivalRematchCounts[id], 0);
    } else {
      profile.rivalRematchCounts[id] = toNonNegInt(profile.rivalRematchCounts[id], 0) + 1;
    }
    if (rewards && typeof rewards === 'object') {
      this.addRewards(rewards, false);
    }
    if (this.isArcadeUnlocked(profile)) {
      this.addArcadeCharges(1, false);
    }
    syncProfilePlayerProgression(profile);
    const newBadges = this.evaluateBadges(false);
    this.save();
    return {
      firstWin,
      rematchCount: profile.rivalRematchCounts[id],
      newBadges,
    };
  }

  recordShrineTrialWin(shrineId, rewards = { starShards: 3, starBalls: 1 }) {
    const profile = this.getActiveProfile();
    if (!profile || !shrineId) {
      return { trialCount: 0, newBadges: [] };
    }
    const id = String(shrineId);
    if (!isPlainObject(profile.shrineTrialCounts)) {
      profile.shrineTrialCounts = {};
    }
    const nextCount = toNonNegInt(profile.shrineTrialCounts[id], 0) + 1;
    profile.shrineTrialCounts[id] = nextCount;
    if (rewards && typeof rewards === 'object') {
      this.addRewards(rewards, false);
    }
    if (this.isArcadeUnlocked(profile)) {
      this.addArcadeCharges(1, false);
    }
    syncProfilePlayerProgression(profile);
    const newBadges = this.evaluateBadges(false);
    this.save();
    return { trialCount: nextCount, newBadges };
  }

  isArcadeAttuned(profile = this.getActiveProfile()) {
    if (!profile || typeof profile !== 'object') return false;
    if (Array.isArray(profile.badges) && profile.badges.length >= 1) return true;
    return getCaughtSpeciesCount(profile) >= 5;
  }

  isArcadeUnlocked(profile = this.getActiveProfile()) {
    if (!profile || typeof profile !== 'object') return false;
    return profile.arcade?.unlocked === true;
  }

  getArcadeState(profile = this.getActiveProfile()) {
    const attuned = this.isArcadeAttuned(profile);
    const unlocked = this.isArcadeUnlocked(profile);
    const starShards = toNonNegInt(profile?.bag?.starShards, 0);
    if (!profile || typeof profile !== 'object' || !unlocked) {
      return {
        unlocked: false,
        attuned,
        charges: 0,
        maxCharges: MAX_ARCADE_CHARGES,
        stepProgress: 0,
        stepsPerCharge: STEPS_PER_ARCADE_CHARGE,
        stepsUntilNext: STEPS_PER_ARCADE_CHARGE,
        battleProgress: 0,
        battlesPerCharge: BATTLES_PER_ARCADE_CHARGE,
        battlesUntilNext: BATTLES_PER_ARCADE_CHARGE,
        shardBuyInCost: ARCADE_SHARD_BUYIN_COST,
        starShards,
        canBuyWithShards: false,
        gemCooldown: clampArcadeGemCooldown(profile?.arcade?.gemCooldown, 0),
        highScore: toNonNegInt(profile?.arcade?.highScore, 0),
        bestWave: toNonNegInt(profile?.arcade?.bestWave, 0),
        plays: toNonNegInt(profile?.arcade?.plays, 0),
        secretKnocks: Math.min(2, toNonNegInt(profile?.arcade?.secretKnocks, 0)),
      };
    }

    const charges = profile.arcade?.charges === undefined
      ? MAX_ARCADE_CHARGES
      : clampArcadeCharges(profile.arcade.charges, 0);
    const stepProgress = charges >= MAX_ARCADE_CHARGES
      ? 0
      : clampArcadeStepProgress(profile.arcade?.stepProgress, 0);
    const battleProgress = charges >= MAX_ARCADE_CHARGES
      ? 0
      : clampArcadeBattleProgress(profile.arcade?.battleProgress, 0);
    const stepsUntilNext = charges >= MAX_ARCADE_CHARGES ? 0 : STEPS_PER_ARCADE_CHARGE - stepProgress;
    const battlesUntilNext = charges >= MAX_ARCADE_CHARGES ? 0 : BATTLES_PER_ARCADE_CHARGE - battleProgress;

    return {
      unlocked: true,
      attuned,
      charges,
      maxCharges: MAX_ARCADE_CHARGES,
      stepProgress,
      stepsPerCharge: STEPS_PER_ARCADE_CHARGE,
      stepsUntilNext,
      battleProgress,
      battlesPerCharge: BATTLES_PER_ARCADE_CHARGE,
      battlesUntilNext,
      shardBuyInCost: ARCADE_SHARD_BUYIN_COST,
      starShards,
      canBuyWithShards: charges < MAX_ARCADE_CHARGES && starShards >= ARCADE_SHARD_BUYIN_COST,
      gemCooldown: clampArcadeGemCooldown(profile.arcade?.gemCooldown, 0),
      highScore: toNonNegInt(profile.arcade?.highScore, 0),
      bestWave: toNonNegInt(profile.arcade?.bestWave, 0),
      plays: toNonNegInt(profile.arcade?.plays, 0),
      secretKnocks: Math.max(3, toNonNegInt(profile.arcade?.secretKnocks, 0)),
    };
  }

  unlockArcade(persist = true) {
    const profile = this.getActiveProfile();
    if (!profile) return false;
    profile.arcade = hydrateArcade(profile.arcade, { allowLegacyPlayUnlock: false });
    profile.arcade.unlocked = true;
    profile.arcade.secretKnocks = Math.max(3, toNonNegInt(profile.arcade.secretKnocks, 0));
    profile.arcade.charges = MAX_ARCADE_CHARGES;
    profile.arcade.stepProgress = 0;
    profile.arcade.battleProgress = 0;
    if (persist) this.save();
    return true;
  }

  recordSecretKnock() {
    const profile = this.getActiveProfile();
    if (!profile) {
      return { knocks: 0, attuned: false, unlocked: false, justUnlocked: false, charges: 0 };
    }
    profile.arcade = hydrateArcade(profile.arcade, { allowLegacyPlayUnlock: false });
    if (this.isArcadeUnlocked(profile)) {
      return {
        knocks: profile.arcade.secretKnocks,
        attuned: true,
        unlocked: true,
        justUnlocked: false,
        charges: profile.arcade.charges,
      };
    }

    const attuned = this.isArcadeAttuned(profile);
    if (!attuned) {
      return {
        knocks: profile.arcade.secretKnocks,
        attuned: false,
        unlocked: false,
        justUnlocked: false,
        charges: 0,
      };
    }

    const knocks = toNonNegInt(profile.arcade.secretKnocks, 0) + 1;
    profile.arcade.secretKnocks = knocks;
    if (knocks >= 3) {
      profile.arcade.unlocked = true;
      profile.arcade.charges = MAX_ARCADE_CHARGES;
      profile.arcade.stepProgress = 0;
      profile.arcade.battleProgress = 0;
      this.save();
      return {
        knocks,
        attuned: true,
        unlocked: true,
        justUnlocked: true,
        charges: MAX_ARCADE_CHARGES,
      };
    }

    this.save();
    return {
      knocks,
      attuned: true,
      unlocked: false,
      justUnlocked: false,
      charges: 0,
    };
  }

  addArcadeCharges(count = 1, persist = true) {
    const profile = this.getActiveProfile();
    if (!profile || !this.isArcadeUnlocked(profile)) {
      return { charges: 0, added: 0, maxCharges: MAX_ARCADE_CHARGES };
    }
    profile.arcade = hydrateArcade(profile.arcade, { allowLegacyPlayUnlock: false });
    const prevCharges = clampArcadeCharges(profile.arcade.charges, 0);
    const addCount = toNonNegInt(count, 0);
    const nextCharges = Math.min(MAX_ARCADE_CHARGES, prevCharges + addCount);
    const added = Math.max(0, nextCharges - prevCharges);
    profile.arcade.charges = nextCharges;
    if (nextCharges >= MAX_ARCADE_CHARGES) {
      profile.arcade.stepProgress = 0;
      profile.arcade.battleProgress = 0;
    }
    if (persist) this.save();
    return { charges: nextCharges, added, maxCharges: MAX_ARCADE_CHARGES };
  }

  consumeArcadeCharge(persist = true) {
    const profile = this.getActiveProfile();
    if (!profile || !this.isArcadeUnlocked(profile)) {
      return {
        consumed: false,
        reason: 'locked',
        remainingCharges: 0,
        maxCharges: MAX_ARCADE_CHARGES,
      };
    }
    profile.arcade = hydrateArcade(profile.arcade, { allowLegacyPlayUnlock: false });
    const current = clampArcadeCharges(profile.arcade.charges, 0);
    if (current < 1) {
      profile.arcade.charges = 0;
      return {
        consumed: false,
        reason: 'empty_charges',
        remainingCharges: 0,
        maxCharges: MAX_ARCADE_CHARGES,
      };
    }
    profile.arcade.charges = current - 1;
    if (persist) this.save();
    return {
      consumed: true,
      remainingCharges: profile.arcade.charges,
      maxCharges: MAX_ARCADE_CHARGES,
    };
  }

  buyArcadeChargeWithShards(persist = true) {
    const profile = this.getActiveProfile();
    if (!profile || !this.isArcadeUnlocked(profile)) {
      return {
        purchased: false,
        reason: 'locked',
        cost: ARCADE_SHARD_BUYIN_COST,
        charges: 0,
        remainingShards: toNonNegInt(profile?.bag?.starShards, 0),
      };
    }
    profile.arcade = hydrateArcade(profile.arcade, { allowLegacyPlayUnlock: false });
    if (!isPlainObject(profile.bag)) {
      profile.bag = createEmptyBag();
    }
    const charges = clampArcadeCharges(profile.arcade.charges, 0);
    const starShards = hydrateStarShards(profile.bag.starShards, 0);
    profile.bag.starShards = starShards;
    if (charges >= MAX_ARCADE_CHARGES) {
      return {
        purchased: false,
        reason: 'full_charges',
        cost: ARCADE_SHARD_BUYIN_COST,
        charges,
        remainingShards: starShards,
      };
    }
    if (starShards < ARCADE_SHARD_BUYIN_COST) {
      return {
        purchased: false,
        reason: 'insufficient_shards',
        cost: ARCADE_SHARD_BUYIN_COST,
        charges,
        remainingShards: starShards,
      };
    }
    profile.bag.starShards = starShards - ARCADE_SHARD_BUYIN_COST;
    this.addArcadeCharges(1, false);
    if (persist) this.save();
    return {
      purchased: true,
      cost: ARCADE_SHARD_BUYIN_COST,
      charges: profile.arcade.charges,
      remainingShards: profile.bag.starShards,
    };
  }

  recordArcadeRun({ score = 0, wave = 1, stars = 0, rewards = {} } = {}) {
    const profile = this.getActiveProfile();
    if (!profile || !this.isArcadeUnlocked(profile)) {
      return { isNewBest: false, highScore: 0, bestWave: 0, plays: 0, stars: 0, newBadges: [] };
    }
    profile.arcade = hydrateArcade(profile.arcade, { allowLegacyPlayUnlock: false });
    const safeScore = toNonNegInt(score, 0);
    const safeWave = Math.max(1, toNonNegInt(wave, 1));
    const prevHigh = toNonNegInt(profile.arcade.highScore, 0);
    const prevBestWave = toNonNegInt(profile.arcade.bestWave, 0);
    const isNewBest = safeScore > prevHigh;

    profile.arcade.plays = toNonNegInt(profile.arcade.plays, 0) + 1;
    profile.arcade.highScore = Math.max(prevHigh, safeScore);
    profile.arcade.bestWave = Math.max(prevBestWave, safeWave);
    profile.arcade.unlocked = true;

    let awardedGem = false;
    if (isPlainObject(rewards?.gems)) {
      for (const [gemId, amount] of Object.entries(rewards.gems)) {
        if (Object.prototype.hasOwnProperty.call(EVOLUTION_ITEMS, gemId) && toNonNegInt(amount, 0) > 0) {
          awardedGem = true;
          break;
        }
      }
    }
    if (awardedGem) {
      profile.arcade.gemCooldown = ARCADE_GEM_COOLDOWN_RUNS;
    } else {
      profile.arcade.gemCooldown = Math.max(0, clampArcadeGemCooldown(profile.arcade.gemCooldown, 0) - 1);
    }

    if (rewards && typeof rewards === 'object') {
      this.addRewards(rewards, false);
    }
    const newBadges = this.evaluateBadges(false);
    this.save();

    return {
      isNewBest,
      highScore: profile.arcade.highScore,
      bestWave: profile.arcade.bestWave,
      plays: profile.arcade.plays,
      stars: toNonNegInt(stars, 0),
      gemCooldown: profile.arcade.gemCooldown,
      newBadges,
    };
  }

  recordBattleWin() {
    const profile = this.getActiveProfile();
    if (!profile) return [];
    if (!isPlainObject(profile.stats)) profile.stats = hydrateProfileStats(null);
    profile.stats.battlesWon = toNonNegInt(profile.stats.battlesWon, 0) + 1;
    this.addCheerCharges(1, false);
    if (this.isArcadeUnlocked(profile)) {
      profile.arcade = hydrateArcade(profile.arcade, { allowLegacyPlayUnlock: false });
      if (profile.arcade.charges >= MAX_ARCADE_CHARGES) {
        profile.arcade.battleProgress = 0;
      } else {
        const nextBattleProg = clampArcadeBattleProgress(profile.arcade.battleProgress, 0) + 1;
        if (nextBattleProg >= BATTLES_PER_ARCADE_CHARGE) {
          profile.arcade.battleProgress = 0;
          this.addArcadeCharges(1, false);
        } else {
          profile.arcade.battleProgress = nextBattleProg;
        }
      }
    }
    syncProfilePlayerProgression(profile);
    const newBadges = this.evaluateBadges(false);
    this.save();
    return newBadges;
  }

  evaluateBadges(persist = true) {
    const profile = this.getActiveProfile();
    if (!profile) return [];
    if (!Array.isArray(profile.badges)) profile.badges = [];
    const unlockedNow = [];
    for (const badge of BADGES) {
      if (!profile.badges.includes(badge.id) && badge.check(profile)) {
        profile.badges.push(badge.id);
        unlockedNow.push(badge);
      }
    }
    const prevXp = profile.trainerXp;
    const prevLv = profile.playerLevel;
    const prog = syncProfilePlayerProgression(profile);
    const progChanged = prevXp !== prog.xp || prevLv !== prog.level;
    if (persist && (unlockedNow.length > 0 || progChanged)) this.save();
    return unlockedNow;
  }

  getSettings() {
    return this.state.settings;
  }

  updateSettings(partial) {
    const patch = isPlainObject(partial) ? partial : {};
    const next = { ...this.state.settings, ...patch };
    if (!VALID_PACES.has(next.battlePace)) {
      next.battlePace = this.state.settings?.battlePace || 'cinema';
    }
    if (!['auto', 'show', 'hide'].includes(next.showTouchPad)) {
      next.showTouchPad = ['auto', 'show', 'hide'].includes(this.state.settings?.showTouchPad)
        ? this.state.settings.showTouchPad
        : 'auto';
    }
    this.state.settings = next;
    this.save();
    return this.state.settings;
  }

  resetTrainerProgress(trainerId = this.state.activeTrainerId) {
    if (!trainerId || !TRAINERS[trainerId]) return;
    this.state.profiles[trainerId] = createFreshProfile(trainerId);
    this.save();
  }

  resetAllProgress() {
    const settings = { ...this.state.settings };
    this.state = createFreshSaveState();
    this.state.settings = settings;
    this.save();
  }
}

export const createStorageManager = (key = STORAGE_KEY) => new StorageManager(key);
