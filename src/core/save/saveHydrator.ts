import {
  BIOME_IDS,
  type AuraId,
  type BiomeId,
  type CapeId,
  type Direction,
  type GameSettings,
  type HeadgearId,
  type OutfitId,
  type PartyMember,
  type PokedexEntryState,
  type RendererMode,
  type SaveHydrationResult,
  type StarlightSaveState,
  type TrainerProfile,
} from '../../contracts';
import { BADGE_BY_ID } from '../data/badges';
import { createPartyMember, TOTAL_SPECIES_COUNT } from '../catalog/speciesCatalog';

export const V2_STORAGE_KEY = 'starlight_v2_save';
export const V1_LEGACY_KEYS = [
  'starlight_island_save',
  'starlight_save_v1',
  'pokemon_starlight_v1',
  'starlight_profiles',
] as const;

const IDB_V2_NAME = 'starlight_v2_db';
const IDB_V1_NAME = 'starlight_island_db';
const IDB_STORE = 'saves';

const VALID_BIOMES = new Set<string>(BIOME_IDS);
const VALID_OUTFITS = new Set<OutfitId>(['voyager', 'astral-robe', 'ranger-coat', 'solstice-tunic', 'aegis-jacket']);
const VALID_CAPES = new Set<CapeId>(['none', 'starweave', 'zephyr-mantle', 'cinder-cloak', 'prism-shawl']);
const VALID_HEADGEAR = new Set<HeadgearId>(['none', 'star-beret', 'sky-goggles', 'lunar-circlet', 'shrine-visor']);
const VALID_AURAS = new Set<AuraId>(['none', 'starlight', 'sky-thunder', 'aurora', 'ember-crown']);
const VALID_DIRS = new Set<Direction>(['down', 'up', 'left', 'right']);

export function createDefaultProfile(slotId: 'slot0' | 'slot1'): TrainerProfile {
  const now = Date.now();
  if (slotId === 'slot0') {
    const party: PartyMember[] = [
      createPartyMember(25, 28, { uid: 'lyra-pikachu', bond: 100, starRank: 5, composure: 100 }),
      createPartyMember(282, 32, { uid: 'lyra-gardevoir', bond: 94, starRank: 4, composure: 100 }),
      createPartyMember(448, 30, { uid: 'lyra-lucario', bond: 88, starRank: 4, composure: 100 }),
      createPartyMember(445, 34, { uid: 'lyra-garchomp', bond: 85, starRank: 4, composure: 100 }),
    ];
    const pokedex: Record<number, PokedexEntryState> = {
      1: { seen: true, caught: true, starRank: 3, bond: 72, timesEncountered: 3 },
      4: { seen: true, caught: true, starRank: 3, bond: 76, timesEncountered: 2 },
      6: { seen: true, caught: true, starRank: 4, bond: 85, timesEncountered: 2 },
      7: { seen: true, caught: true, starRank: 3, bond: 70, timesEncountered: 2 },
      25: { seen: true, caught: true, starRank: 5, bond: 100, shiny: false, timesEncountered: 8 },
      131: { seen: true, caught: true, starRank: 4, bond: 82, timesEncountered: 2 },
      133: { seen: true, caught: true, starRank: 5, bond: 96, timesEncountered: 5 },
      151: { seen: true, caught: true, starRank: 5, bond: 100, shiny: true, timesEncountered: 1 },
      197: { seen: true, caught: true, starRank: 4, bond: 90, timesEncountered: 3 },
      249: { seen: true, caught: false, starRank: 2, bond: 30, timesEncountered: 1 },
      282: { seen: true, caught: true, starRank: 4, bond: 94, timesEncountered: 4 },
      384: { seen: true, caught: false, starRank: 2, bond: 25, timesEncountered: 1 },
      445: { seen: true, caught: true, starRank: 4, bond: 85, timesEncountered: 3 },
      448: { seen: true, caught: true, starRank: 4, bond: 88, timesEncountered: 4 },
      471: { seen: true, caught: true, starRank: 4, bond: 84, timesEncountered: 2 },
      658: { seen: true, caught: true, starRank: 4, bond: 86, timesEncountered: 2 },
      887: { seen: true, caught: true, starRank: 4, bond: 80, timesEncountered: 2 },
      1008: { seen: true, caught: false, starRank: 3, bond: 40, timesEncountered: 1 },
      1024: { seen: true, caught: true, starRank: 5, bond: 100, shiny: true, timesEncountered: 1 },
      1025: { seen: true, caught: true, starRank: 4, bond: 78, timesEncountered: 1 },
    };
    return {
      slotId: 'slot0',
      name: 'Lyra',
      title: 'Starlight Navigator',
      createdAt: now,
      updatedAt: now,
      playtimeSeconds: 5420,
      biomeId: 'starlight-village',
      x: 13.5,
      y: 11.4,
      facing: 'down',
      party,
      pokedex,
      badges: [
        'badge-normal',
        'badge-grass',
        'badge-water',
        'badge-electric',
        'badge-fairy',
        'badge-pioneer',
        'badge-bond',
        'badge-composure',
        'badge-stylist',
      ],
      openedChests: [],
      clearedShrines: ['meadow-shrine', 'verdant-canopy-shrine', 'sapphire-lagoon-shrine', 'volt-highlands-shrine', 'starbloom-glade-shrine'],
      inventory: {
        pokeBalls: 14,
        starBalls: 8,
        potions: 10,
        superPotions: 5,
        starShards: 120,
      },
      style: {
        outfit: 'voyager',
        cape: 'starweave',
        headgear: 'star-beret',
        aura: 'starlight',
        primaryAccent: '#5882ff',
        secondaryAccent: '#ffd479',
      },
      unlocks: {
        outfits: ['voyager', 'astral-robe', 'ranger-coat', 'solstice-tunic', 'aegis-jacket'],
        capes: ['none', 'starweave', 'zephyr-mantle', 'cinder-cloak', 'prism-shawl'],
        headgear: ['none', 'star-beret', 'sky-goggles', 'lunar-circlet', 'shrine-visor'],
        auras: ['none', 'starlight', 'sky-thunder', 'aurora', 'ember-crown'],
      },
      skyHopHighScore: 680,
      skyHopBestCombo: 14,
      rivalsDefeated: 2,
    };
  }

  const party: PartyMember[] = [
    createPartyMember(133, 26, { uid: 'orion-eevee', bond: 95, starRank: 5, composure: 100 }),
    createPartyMember(6, 34, { uid: 'orion-charizard', bond: 92, starRank: 4, composure: 100 }),
    createPartyMember(658, 33, { uid: 'orion-greninja', bond: 86, starRank: 4, composure: 100 }),
    createPartyMember(887, 35, { uid: 'orion-dragapult', bond: 84, starRank: 4, composure: 100 }),
  ];
  const pokedex: Record<number, PokedexEntryState> = {
    6: { seen: true, caught: true, starRank: 4, bond: 92, timesEncountered: 3 },
    25: { seen: true, caught: true, starRank: 4, bond: 84, timesEncountered: 4 },
    133: { seen: true, caught: true, starRank: 5, bond: 95, timesEncountered: 6 },
    149: { seen: true, caught: true, starRank: 4, bond: 82, timesEncountered: 2 },
    658: { seen: true, caught: true, starRank: 4, bond: 86, timesEncountered: 3 },
    887: { seen: true, caught: true, starRank: 4, bond: 84, timesEncountered: 2 },
    1007: { seen: true, caught: true, starRank: 5, bond: 98, timesEncountered: 1 },
  };
  return {
    slotId: 'slot1',
    name: 'Orion',
    title: 'Aurora Sky-Runner',
    createdAt: now,
    updatedAt: now,
    playtimeSeconds: 3890,
    biomeId: 'sapphire-lagoon',
    x: 13.5,
    y: 11.4,
    facing: 'down',
    party,
    pokedex,
    badges: [
      'badge-fire',
      'badge-water',
      'badge-flying',
      'badge-dragon',
      'badge-pioneer',
      'badge-skyhop',
    ],
    openedChests: [],
    clearedShrines: ['ember-caldera-shrine', 'sapphire-lagoon-shrine', 'zephyr-peaks-shrine'],
    inventory: {
      pokeBalls: 12,
      starBalls: 6,
      potions: 8,
      superPotions: 4,
      starShards: 95,
    },
    style: {
      outfit: 'solstice-tunic',
      cape: 'zephyr-mantle',
      headgear: 'sky-goggles',
      aura: 'sky-thunder',
      primaryAccent: '#ff7b47',
      secondaryAccent: '#66e0ff',
    },
    unlocks: {
      outfits: ['voyager', 'astral-robe', 'ranger-coat', 'solstice-tunic', 'aegis-jacket'],
      capes: ['none', 'starweave', 'zephyr-mantle', 'cinder-cloak', 'prism-shawl'],
      headgear: ['none', 'star-beret', 'sky-goggles', 'lunar-circlet', 'shrine-visor'],
      auras: ['none', 'starlight', 'sky-thunder', 'aurora', 'ember-crown'],
    },
    skyHopHighScore: 940,
    skyHopBestCombo: 19,
    rivalsDefeated: 1,
  };
}

export function createDefaultSettings(): GameSettings {
  const prefersReduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return {
    reducedMotion: prefersReduced,
    crtMode: false,
    rendererOverride: 'auto',
    audioMuted: false,
    masterVolume: 0.65,
    showTouchControls: false,
  };
}

export function createDefaultSaveState(): StarlightSaveState {
  return {
    schemaVersion: 2,
    activeSlot: 'slot0',
    profiles: {
      slot0: createDefaultProfile('slot0'),
      slot1: createDefaultProfile('slot1'),
    },
    settings: createDefaultSettings(),
  };
}

function asRecord(val: unknown): Record<string, unknown> | null {
  return val && typeof val === 'object' && !Array.isArray(val) ? (val as Record<string, unknown>) : null;
}

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, val));
}

function sanitizePartyMember(raw: unknown, idx: number): PartyMember | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const speciesId = clampNum(
    obj.speciesId ?? obj.id ?? obj.dexId,
    1,
    TOTAL_SPECIES_COUNT,
    25,
  );
  const level = clampNum(obj.level ?? obj.lv, 1, 100, 20);
  const base = createPartyMember(speciesId, level, {
    uid: typeof obj.uid === 'string' && obj.uid.trim() ? obj.uid : `migrated-${speciesId}-${idx}`,
    nickname: typeof obj.nickname === 'string' && obj.nickname.trim() ? obj.nickname.slice(0, 24) : undefined,
    xp: clampNum(obj.xp, 0, 999999, Math.round(level * 30)),
    hp: typeof obj.hp === 'number' && Number.isFinite(obj.hp) ? Math.max(1, Math.round(obj.hp)) : undefined,
    composure: clampNum(obj.composure, 0, 100, 100),
    bond: clampNum(obj.bond ?? obj.friendship, 0, 100, 75),
    starRank: clampNum(obj.starRank ?? obj.stars, 0, 5, 3),
    shiny: Boolean(obj.shiny),
    moves: Array.isArray(obj.moves)
      ? obj.moves.filter((m): m is string => typeof m === 'string').slice(0, 4)
      : undefined,
  });
  return base;
}

function sanitizePokedex(raw: unknown, fallback: Record<number, PokedexEntryState>): Record<number, PokedexEntryState> {
  const result: Record<number, PokedexEntryState> = { ...fallback };
  if (Array.isArray(raw)) {
    // Legacy v1 array of caught species IDs or entry objects
    for (const item of raw) {
      if (typeof item === 'number' && item >= 1 && item <= TOTAL_SPECIES_COUNT) {
        result[Math.floor(item)] = { seen: true, caught: true, starRank: 3, bond: 70, timesEncountered: 1 };
      } else {
        const rec = asRecord(item);
        const id = rec ? clampNum(rec.speciesId ?? rec.id, 1, TOTAL_SPECIES_COUNT, 0) : 0;
        if (id >= 1) {
          result[id] = {
            seen: Boolean(rec?.seen ?? true),
            caught: Boolean(rec?.caught ?? false),
            starRank: clampNum(rec?.starRank ?? rec?.stars, 0, 5, 2),
            bond: clampNum(rec?.bond, 0, 100, 60),
            shiny: Boolean(rec?.shiny),
            timesEncountered: clampNum(rec?.timesEncountered, 1, 999, 1),
          };
        }
      }
    }
    return result;
  }
  const mapObj = asRecord(raw);
  if (!mapObj) return result;
  for (const [k, v] of Object.entries(mapObj)) {
    const id = Number(k);
    if (!Number.isInteger(id) || id < 1 || id > TOTAL_SPECIES_COUNT) continue;
    if (typeof v === 'boolean') {
      result[id] = { seen: true, caught: v, starRank: v ? 3 : 1, bond: v ? 65 : 0, timesEncountered: 1 };
    } else {
      const rec = asRecord(v);
      if (rec) {
        result[id] = {
          seen: Boolean(rec.seen ?? rec.caught ?? true),
          caught: Boolean(rec.caught ?? false),
          starRank: clampNum(rec.starRank ?? rec.stars, 0, 5, rec.caught ? 3 : 1),
          bond: clampNum(rec.bond ?? rec.friendship, 0, 100, rec.caught ? 70 : 0),
          shiny: Boolean(rec.shiny),
          timesEncountered: clampNum(rec.timesEncountered, 1, 999, 1),
        };
      }
    }
  }
  return result;
}

function sanitizeBadges(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const out = new Set<string>();
  for (const b of raw) {
    if (typeof b === 'string') {
      if (BADGE_BY_ID[b]) {
        out.add(b);
      } else {
        // Map legacy v1 badge names/slugs by substring match
        const lower = b.toLowerCase();
        const found = Object.values(BADGE_BY_ID).find(
          (def) => def.id.includes(lower) || def.name.toLowerCase().includes(lower) || def.type === lower,
        );
        if (found) out.add(found.id);
      }
    } else if (typeof b === 'number' && b >= 1 && b <= 28) {
      const found = Object.values(BADGE_BY_ID).find((def) => def.index === Math.floor(b));
      if (found) out.add(found.id);
    }
  }
  return out.size > 0 ? Array.from(out) : [...fallback];
}

export function sanitizeProfile(raw: unknown, slotId: 'slot0' | 'slot1'): TrainerProfile {
  const def = createDefaultProfile(slotId);
  const obj = asRecord(raw);
  if (!obj) return def;

  const rawBiome = typeof obj.biomeId === 'string'
    ? obj.biomeId
    : typeof obj.biome === 'string'
      ? obj.biome
      : def.biomeId;
  const biomeId: BiomeId = VALID_BIOMES.has(rawBiome) ? (rawBiome as BiomeId) : def.biomeId;

  const rawParty = Array.isArray(obj.party)
    ? obj.party.map((m, i) => sanitizePartyMember(m, i)).filter((m): m is PartyMember => Boolean(m)).slice(0, 6)
    : [];
  const party = rawParty.length > 0 ? rawParty : def.party;

  const styleObj = asRecord(obj.style ?? obj.cosmetics ?? obj.styleStudio);
  const outfit = styleObj && VALID_OUTFITS.has(styleObj.outfit as OutfitId) ? (styleObj.outfit as OutfitId) : def.style.outfit;
  const cape = styleObj && VALID_CAPES.has(styleObj.cape as CapeId) ? (styleObj.cape as CapeId) : def.style.cape;
  const headgear = styleObj && VALID_HEADGEAR.has(styleObj.headgear as HeadgearId) ? (styleObj.headgear as HeadgearId) : def.style.headgear;
  const aura = styleObj && VALID_AURAS.has(styleObj.aura as AuraId) ? (styleObj.aura as AuraId) : def.style.aura;

  const invObj = asRecord(obj.inventory ?? obj.bag);
  const facing = VALID_DIRS.has(obj.facing as Direction) ? (obj.facing as Direction) : def.facing;

  return {
    ...def,
    slotId,
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 20) : def.name,
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim().slice(0, 32) : def.title,
    createdAt: clampNum(obj.createdAt, 0, Number.MAX_SAFE_INTEGER, def.createdAt),
    updatedAt: clampNum(obj.updatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    playtimeSeconds: clampNum(obj.playtimeSeconds ?? obj.playtime, 0, 9999999, def.playtimeSeconds),
    biomeId,
    x: clampNum(obj.x, 1, 26, def.x),
    y: clampNum(obj.y, 2, 16, def.y),
    facing,
    party,
    pokedex: sanitizePokedex(obj.pokedex ?? obj.dex, def.pokedex),
    badges: sanitizeBadges(obj.badges, def.badges),
    openedChests: Array.isArray(obj.openedChests) ? obj.openedChests.filter((x): x is string => typeof x === 'string') : def.openedChests,
    clearedShrines: Array.isArray(obj.clearedShrines) ? obj.clearedShrines.filter((x): x is string => typeof x === 'string') : def.clearedShrines,
    inventory: {
      pokeBalls: clampNum(invObj?.pokeBalls ?? invObj?.pokeballs, 0, 999, def.inventory.pokeBalls),
      starBalls: clampNum(invObj?.starBalls ?? invObj?.starballs, 0, 999, def.inventory.starBalls),
      potions: clampNum(invObj?.potions, 0, 999, def.inventory.potions),
      superPotions: clampNum(invObj?.superPotions, 0, 999, def.inventory.superPotions),
      starShards: clampNum(invObj?.starShards ?? invObj?.shards, 0, 999999, def.inventory.starShards),
    },
    style: {
      outfit,
      cape,
      headgear,
      aura,
      primaryAccent: typeof styleObj?.primaryAccent === 'string' ? styleObj.primaryAccent : def.style.primaryAccent,
      secondaryAccent: typeof styleObj?.secondaryAccent === 'string' ? styleObj.secondaryAccent : def.style.secondaryAccent,
    },
    skyHopHighScore: clampNum(obj.skyHopHighScore ?? obj.skyhopScore, 0, 9999999, def.skyHopHighScore),
    skyHopBestCombo: clampNum(obj.skyHopBestCombo, 0, 9999, def.skyHopBestCombo),
    rivalsDefeated: clampNum(obj.rivalsDefeated, 0, 999, def.rivalsDefeated),
  };
}

function sanitizeSettings(raw: unknown): GameSettings {
  const def = createDefaultSettings();
  const obj = asRecord(raw);
  if (!obj) return applyUrlQueryOverrides(def);
  const renderer = obj.rendererOverride;
  const rendererOverride: RendererMode =
    renderer === 'webgl2' || renderer === 'canvas2d' || renderer === 'auto'
      ? renderer
      : def.rendererOverride;

  return applyUrlQueryOverrides({
    reducedMotion: typeof obj.reducedMotion === 'boolean' ? obj.reducedMotion : def.reducedMotion,
    crtMode: typeof obj.crtMode === 'boolean' ? obj.crtMode : def.crtMode,
    rendererOverride,
    audioMuted: typeof obj.audioMuted === 'boolean' ? obj.audioMuted : def.audioMuted,
    masterVolume: clampNum(obj.masterVolume, 0, 1, def.masterVolume),
    showTouchControls: typeof obj.showTouchControls === 'boolean' ? obj.showTouchControls : def.showTouchControls,
  });
}

export function applyUrlQueryOverrides(settings: GameSettings): GameSettings {
  if (typeof window === 'undefined') return settings;
  const params = new URLSearchParams(window.location.search);
  const next = { ...settings };
  const rendererParam = params.get('renderer')?.toLowerCase();
  if (rendererParam === 'canvas2d' || rendererParam === 'webgl2' || rendererParam === 'auto') {
    next.rendererOverride = rendererParam;
  }
  const crtParam = params.get('crt');
  if (crtParam === '1' || crtParam === 'true') next.crtMode = true;
  if (crtParam === '0' || crtParam === 'false') next.crtMode = false;

  const rmParam = params.get('reducedMotion');
  if (rmParam === '1' || rmParam === 'true') next.reducedMotion = true;
  if (rmParam === '0' || rmParam === 'false') next.reducedMotion = false;

  return next;
}

export function hydratePayload(raw: unknown, sourceKey: string, preservedLegacyKeys: string[]): StarlightSaveState {
  const obj = asRecord(raw);
  if (!obj) return createDefaultSaveState();

  const profilesObj = asRecord(obj.profiles);
  let slot0Raw: unknown = profilesObj?.slot0 ?? profilesObj?.[0];
  let slot1Raw: unknown = profilesObj?.slot1 ?? profilesObj?.[1];

  // Legacy v1 array of profiles or single flat trainer object
  if (!slot0Raw && Array.isArray(obj.profiles)) {
    slot0Raw = obj.profiles[0];
    slot1Raw = obj.profiles[1];
  } else if (!slot0Raw && (obj.trainerName || obj.name || obj.party || obj.pokedex || obj.badges)) {
    slot0Raw = { ...obj, name: obj.trainerName ?? obj.name };
  }

  const activeSlot: 'slot0' | 'slot1' =
    obj.activeSlot === 'slot1' || obj.activeProfile === 1 ? 'slot1' : 'slot0';

  const state: StarlightSaveState = {
    schemaVersion: 2,
    activeSlot,
    profiles: {
      slot0: sanitizeProfile(slot0Raw, 'slot0'),
      slot1: sanitizeProfile(slot1Raw, 'slot1'),
    },
    settings: sanitizeSettings(obj.settings),
  };

  if (sourceKey !== V2_STORAGE_KEY) {
    state.migratedFromV1 = {
      sourceKey,
      migratedAt: Date.now(),
      preservedLegacyKeys,
    };
  } else if (asRecord(obj.migratedFromV1)) {
    state.migratedFromV1 = obj.migratedFromV1 as StarlightSaveState['migratedFromV1'];
  }

  return state;
}

function readFromIndexedDb(dbName: string, key: string): Promise<unknown | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.close();
          resolve(null);
          return;
        }
        try {
          const tx = db.transaction(IDB_STORE, 'readonly');
          const getReq = tx.objectStore(IDB_STORE).get(key);
          getReq.onsuccess = () => {
            const result = getReq.result ?? null;
            db.close();
            resolve(result);
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch {
          db.close();
          resolve(null);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

function writeToIndexedDb(dbName: string, key: string, value: StarlightSaveState): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onerror = () => resolve(false);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(value, key);
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
          tx.onerror = () => {
            db.close();
            resolve(false);
          };
        } catch {
          db.close();
          resolve(false);
        }
      };
    } catch {
      resolve(false);
    }
  });
}

export async function hydrateSaveState(): Promise<SaveHydrationResult> {
  const warnings: string[] = [];
  const presentLegacyKeys: string[] = [];

  if (typeof localStorage !== 'undefined') {
    for (const legacyKey of V1_LEGACY_KEYS) {
      try {
        if (localStorage.getItem(legacyKey) !== null) {
          presentLegacyKeys.push(legacyKey);
        }
      } catch {
        // Ignore restricted storage environments
      }
    }

    // 1. Prefer native v2 save when present and valid
    try {
      const rawV2 = localStorage.getItem(V2_STORAGE_KEY);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        const state = hydratePayload(parsed, V2_STORAGE_KEY, presentLegacyKeys);
        return { state, source: 'v2-local', warnings };
      }
    } catch {
      warnings.push('Corrupted v2 localStorage payload detected; checking backup/legacy sources.');
    }

    // 2. Non-destructive legacy v1 localStorage migration
    for (const legacyKey of presentLegacyKeys) {
      try {
        const rawV1 = localStorage.getItem(legacyKey);
        if (!rawV1) continue;
        const parsed = JSON.parse(rawV1);
        const state = hydratePayload(parsed, legacyKey, presentLegacyKeys);
        await persistSaveState(state);
        return { state, source: 'v1-migrated', warnings };
      } catch {
        warnings.push(`Skipped unreadable legacy key "${legacyKey}".`);
      }
    }
  }

  // 3. Check IndexedDB v2 then v1 fallback
  const idbV2 = await readFromIndexedDb(IDB_V2_NAME, V2_STORAGE_KEY);
  if (idbV2) {
    const state = hydratePayload(idbV2, V2_STORAGE_KEY, presentLegacyKeys);
    return { state, source: 'v2-idb', warnings };
  }

  const idbV1 = await readFromIndexedDb(IDB_V1_NAME, 'starlight_island_save');
  if (idbV1) {
    const state = hydratePayload(idbV1, 'indexeddb:starlight_island_db', presentLegacyKeys);
    await persistSaveState(state);
    return { state, source: 'v1-migrated', warnings };
  }

  // 4. Fresh default dual-profile save
  const fresh = createDefaultSaveState();
  fresh.settings = applyUrlQueryOverrides(fresh.settings);
  await persistSaveState(fresh);
  return { state: fresh, source: 'fresh-default', warnings };
}

export async function persistSaveState(state: StarlightSaveState): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(V2_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage quota or private browsing fallback
    }
  }
  await writeToIndexedDb(IDB_V2_NAME, V2_STORAGE_KEY, state);
}
