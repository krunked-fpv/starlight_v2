import type {
  BattlePace,
  DojoProfileState,
  GameSettings,
  RendererMode,
  SaveHydrationResult,
  StarlightSaveState,
  TouchPadMode,
  TrainerId,
} from '../../contracts';
import {
  STORAGE_KEY as DOJO_V1_STORAGE_KEY,
  StorageManager,
  createStorageManager,
  validateAndRepairProfile,
} from '../dojo/raw/storage.js';
import { Pokemon } from '../dojo/raw/pokemon.js';

export const V2_STORAGE_KEY = 'starlight_v2_save';
export const DOJO_STORAGE_KEY = DOJO_V1_STORAGE_KEY; // 'starlight_pokemon_save_v1'
export const V1_LEGACY_KEYS = [
  'starlight_pokemon_save_v1',
  'starlight_island_save',
  'starlight_save_v1',
  'pokemon_starlight_v1',
  'starlight_profiles',
] as const;

const IDB_V2_NAME = 'starlight_v2_db';
const IDB_V1_NAME = 'starlight_island_db';
const IDB_STORE = 'saves';

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
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
    showTouchPad: 'auto',
    battlePace: 'cinema',
  };
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

function sanitizeSettings(raw: unknown): GameSettings {
  const def = createDefaultSettings();
  if (!isRecord(raw)) return applyUrlQueryOverrides(def);
  const renderer: RendererMode =
    raw.rendererOverride === 'webgl2' || raw.rendererOverride === 'canvas2d' || raw.rendererOverride === 'auto'
      ? raw.rendererOverride
      : def.rendererOverride;
  const showTouchPad: TouchPadMode =
    raw.showTouchPad === 'auto' || raw.showTouchPad === 'show' || raw.showTouchPad === 'hide'
      ? raw.showTouchPad
      : raw.showTouchControls === true
        ? 'show'
        : def.showTouchPad;
  const battlePace: BattlePace =
    raw.battlePace === 'cinema' || raw.battlePace === 'classic' || raw.battlePace === 'fast'
      ? raw.battlePace
      : def.battlePace;

  // Note: Legacy dojo saves defaulted crtEnabled: true; per spec Decision 3, v2 defaults crtMode: false
  // unless the user explicitly toggled crtMode in v2/v3 settings!
  const crtMode = typeof raw.crtMode === 'boolean' ? raw.crtMode : def.crtMode;
  const audioMuted = typeof raw.audioMuted === 'boolean'
    ? raw.audioMuted
    : typeof raw.muted === 'boolean'
      ? raw.muted
      : def.audioMuted;

  return applyUrlQueryOverrides({
    reducedMotion: typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : def.reducedMotion,
    crtMode,
    rendererOverride: renderer,
    audioMuted,
    masterVolume: clamp(raw.masterVolume, 0, 1, def.masterVolume),
    showTouchPad,
    battlePace,
  });
}

function serializeRepairedProfile(repaired: Record<string, unknown>): DojoProfileState {
  const team = Array.isArray(repaired.team)
    ? repaired.team.map((m) => (m instanceof Pokemon ? m.toJSON() : m))
    : [];
  const box = Array.isArray(repaired.box)
    ? repaired.box.map((m) => (m instanceof Pokemon ? m.toJSON() : m))
    : [];
  return {
    ...(repaired as unknown as DojoProfileState),
    team,
    box,
  };
}

/**
 * Converts a legacy pre-overhaul v2 (Lyra/Orion slot0/slot1) or old flat v1 trainer object
 * into a canonical C:\dojo Violet/Ozias profile losslessly!
 */
function convertLegacyProfileToDojo(raw: unknown, trainerId: TrainerId): DojoProfileState {
  if (!isRecord(raw)) {
    return serializeRepairedProfile(validateAndRepairProfile(null, trainerId));
  }

  // Already a dojo-shaped profile?
  if (
    raw.trainerId === 'violet'
    || raw.trainerId === 'ozias'
    || 'starterId' in raw
    || 'shrinesCleared' in raw
    || 'chestsOpened' in raw
    || isRecord(raw.bag)
  ) {
    return serializeRepairedProfile(validateAndRepairProfile({ ...raw, trainerId }, trainerId));
  }

  // Legacy v1 or old v2 (slot0/slot1) format -> translate cleanly
  const rawParty = Array.isArray(raw.party) ? raw.party : Array.isArray(raw.team) ? raw.team : [];
  const team = rawParty
    .map((m) => {
      if (!isRecord(m)) return null;
      const speciesId = Number(m.speciesId ?? m.id ?? m.dexId ?? 25);
      const level = Math.max(1, Math.min(50, Math.round(Number(m.level ?? m.lv ?? 5))));
      return {
        uid: typeof m.uid === 'string' ? m.uid : undefined,
        speciesId: Number.isInteger(speciesId) && speciesId >= 1 && speciesId <= 1025 ? speciesId : 25,
        level,
        xp: Number(m.xp ?? 0),
        hp: typeof m.hp === 'number' ? m.hp : undefined,
        isShiny: Boolean(m.shiny ?? m.isShiny),
        nickname: typeof m.nickname === 'string' ? m.nickname : null,
        bond: Number(m.bond ?? m.friendship ?? 40),
        upgradeTier: Math.max(0, Math.min(5, Number(m.starRank ?? m.upgradeTier ?? 0))),
      };
    })
    .filter(Boolean);

  const starterId = team.length > 0 ? (team[0] as { speciesId: number }).speciesId : null;

  // Convert legacy pokedex formats (array or Record<id, {seen, caught}>)
  const seen: number[] = [];
  const caught: Record<number, number> = {};
  const rawDex = raw.pokedex ?? raw.dex;
  if (Array.isArray(rawDex)) {
    for (const item of rawDex) {
      const id = typeof item === 'number' ? Math.round(item) : isRecord(item) ? Number(item.speciesId ?? item.id) : 0;
      if (id >= 1 && id <= 1025) {
        seen.push(id);
        caught[id] = Math.max(caught[id] ?? 0, 1);
      }
    }
  } else if (isRecord(rawDex)) {
    for (const [k, v] of Object.entries(rawDex)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > 1025) continue;
      if (v === true) {
        seen.push(id);
        caught[id] = 1;
      } else if (isRecord(v)) {
        if (v.seen || v.caught) seen.push(id);
        if (v.caught) caught[id] = 1;
      }
    }
  }

  const inv = isRecord(raw.inventory) ? raw.inventory : isRecord(raw.bag) ? raw.bag : {};
  const oldStyle = isRecord(raw.style) ? raw.style : {};
  const mappedStyleId =
    oldStyle.outfit === 'astral-robe' ? 'twilight'
      : oldStyle.outfit === 'ranger-coat' ? 'ranger'
        : oldStyle.outfit === 'solstice-tunic' ? 'solstice'
          : oldStyle.outfit === 'aegis-jacket' ? 'royal'
            : 'default';
  const mappedAccessory =
    oldStyle.headgear === 'sky-goggles' ? 'goggles'
      : oldStyle.headgear === 'lunar-circlet' ? 'crown'
        : oldStyle.headgear === 'shrine-visor' ? 'visor'
          : 'cap';
  const mappedAura =
    oldStyle.aura === 'starlight' ? 'stars'
      : oldStyle.aura === 'sky-thunder' ? 'lightning'
        : oldStyle.aura === 'aurora' ? 'cosmic'
          : oldStyle.aura === 'ember-crown' ? 'blossom'
            : 'none';

  const customNickname =
    typeof raw.name === 'string'
    && raw.name.trim().length > 0
    && !['lyra', 'orion', 'violet', 'ozias'].includes(raw.name.trim().toLowerCase())
      ? raw.name.trim().slice(0, 18)
      : undefined;

  const converted = {
    trainerId,
    starterId,
    pos: isRecord(raw.pos) ? raw.pos : { x: 8, y: 15, dir: 'down' },
    appearance: {
      styleId: mappedStyleId,
      accessory: mappedAccessory,
      cape: Boolean(oldStyle.cape && oldStyle.cape !== 'none'),
      aura: mappedAura,
      ...(customNickname ? { nickname: customNickname } : {}),
    },
    team,
    box: [],
    pokedex: { seen, caught },
    badges: Array.isArray(raw.badges) ? raw.badges.filter((b): b is string => typeof b === 'string') : [],
    shrinesCleared: Array.isArray(raw.clearedShrines) ? raw.clearedShrines : [],
    chestsOpened: Array.isArray(raw.openedChests) ? raw.openedChests : [],
    bag: {
      potions: Number(inv.potions ?? 5),
      greatBalls: Number(inv.pokeBalls ?? inv.greatBalls ?? 3),
      starBalls: Number(inv.starBalls ?? 1),
      starShards: Number(inv.starShards ?? inv.shards ?? 0),
      cheerCharges: 0,
    },
    arcade: {
      unlocked: Number(raw.skyHopHighScore ?? 0) > 0,
      highScore: Number(raw.skyHopHighScore ?? 0),
      plays: Number(raw.skyHopHighScore ?? 0) > 0 ? 1 : 0,
    },
  };

  return serializeRepairedProfile(validateAndRepairProfile(converted, trainerId));
}

export function createDefaultSaveState(): StarlightSaveState {
  return {
    schemaVersion: 3,
    activeTrainerId: null,
    profiles: {
      violet: serializeRepairedProfile(validateAndRepairProfile(null, 'violet')),
      ozias: serializeRepairedProfile(validateAndRepairProfile(null, 'ozias')),
    },
    settings: applyUrlQueryOverrides(createDefaultSettings()),
  };
}

export function hydratePayload(
  raw: unknown,
  sourceKey: string,
  preservedLegacyKeys: string[],
): StarlightSaveState {
  if (!isRecord(raw)) return createDefaultSaveState();

  const profilesObj = isRecord(raw.profiles) ? raw.profiles : null;
  let violetRaw: unknown = profilesObj?.violet ?? profilesObj?.slot0 ?? profilesObj?.[0];
  let oziasRaw: unknown = profilesObj?.ozias ?? profilesObj?.slot1 ?? profilesObj?.[1];

  if (!violetRaw && Array.isArray(raw.profiles)) {
    violetRaw = raw.profiles[0];
    oziasRaw = raw.profiles[1];
  } else if (!violetRaw && (raw.trainerName || raw.name || raw.party || raw.team || raw.pokedex || raw.badges)) {
    violetRaw = { ...raw, name: raw.trainerName ?? raw.name };
  }

  let activeTrainerId: TrainerId | null = null;
  if (raw.activeTrainerId === 'violet' || raw.activeTrainerId === 'ozias') {
    activeTrainerId = raw.activeTrainerId;
  } else if (raw.activeSlot === 'slot1' || raw.activeProfile === 1) {
    activeTrainerId = 'ozias';
  } else if (raw.activeSlot === 'slot0' || raw.activeProfile === 0) {
    activeTrainerId = 'violet';
  }

  const state: StarlightSaveState = {
    schemaVersion: 3,
    activeTrainerId,
    profiles: {
      violet: convertLegacyProfileToDojo(violetRaw, 'violet'),
      ozias: convertLegacyProfileToDojo(oziasRaw, 'ozias'),
    },
    settings: sanitizeSettings(raw.settings),
  };

  if (sourceKey !== V2_STORAGE_KEY || Number(raw.schemaVersion) < 3) {
    state.migratedFromV1 = {
      sourceKey,
      migratedAt: Date.now(),
      preservedLegacyKeys,
    };
  } else if (isRecord(raw.migratedFromV1)) {
    state.migratedFromV1 = raw.migratedFromV1 as StarlightSaveState['migratedFromV1'];
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

/**
 * Canonical Save Hydrator with strict precedence:
 *   1. Native v3 (`starlight_v2_save` with `schemaVersion >= 3`)
 *   2. Authentic C:\dojo save (`starlight_pokemon_save_v1`) — ALWAYS beats pre-overhaul schemaVersion 2 demo saves!
 *   3. Pre-overhaul v2 save (`starlight_v2_save` with `schemaVersion === 2`)
 *   4. Other legacy v1 keys (`starlight_island_save`, `starlight_save_v1`, `pokemon_starlight_v1`, `starlight_profiles`)
 *   5. IndexedDB backups (`starlight_v2_db`, `starlight_island_db`)
 *   6. Fresh dual-profile Violet & Ozias save
 *
 * Strictly non-destructive: NEVER deletes or mutates ANY legacy key!
 */
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

    let parsedV2Candidate: Record<string, unknown> | null = null;
    try {
      const rawV2 = localStorage.getItem(V2_STORAGE_KEY);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        if (isRecord(parsed)) {
          if (Number(parsed.schemaVersion) >= 3) {
            const state = hydratePayload(parsed, V2_STORAGE_KEY, presentLegacyKeys);
            return { state, source: 'v3-local', warnings };
          }
          parsedV2Candidate = parsed;
        }
      }
    } catch {
      warnings.push('Corrupted v2 localStorage payload detected; checking dojo & legacy sources.');
    }

    // 2. Authentic C:\dojo save takes priority over pre-overhaul schemaVersion 2 demo saves!
    try {
      const rawDojo = localStorage.getItem(DOJO_STORAGE_KEY);
      if (rawDojo) {
        const parsed = JSON.parse(rawDojo);
        if (isRecord(parsed)) {
          const state = hydratePayload(parsed, DOJO_STORAGE_KEY, presentLegacyKeys);
          await persistSaveState(state);
          return { state, source: 'dojo-v1-migrated', warnings };
        }
      }
    } catch {
      warnings.push(`Skipped unreadable legacy key "${DOJO_STORAGE_KEY}".`);
    }

    // 3. Pre-overhaul schemaVersion 2 save (if no authentic dojo save existed)
    if (parsedV2Candidate) {
      const state = hydratePayload(parsedV2Candidate, V2_STORAGE_KEY, presentLegacyKeys);
      await persistSaveState(state);
      return { state, source: 'v2-migrated', warnings };
    }

    // 4. Other legacy v1 keys
    for (const legacyKey of presentLegacyKeys) {
      if (legacyKey === DOJO_STORAGE_KEY) continue;
      try {
        const rawLegacy = localStorage.getItem(legacyKey);
        if (!rawLegacy) continue;
        const parsed = JSON.parse(rawLegacy);
        if (!isRecord(parsed)) continue;
        const state = hydratePayload(parsed, legacyKey, presentLegacyKeys);
        await persistSaveState(state);
        return { state, source: 'legacy-v1-migrated', warnings };
      } catch {
        warnings.push(`Skipped unreadable legacy key "${legacyKey}".`);
      }
    }
  }

  // 5. IndexedDB backups
  const idbV2 = await readFromIndexedDb(IDB_V2_NAME, V2_STORAGE_KEY);
  if (isRecord(idbV2)) {
    const state = hydratePayload(idbV2, V2_STORAGE_KEY, presentLegacyKeys);
    return { state, source: 'v3-idb', warnings };
  }

  const idbV1 = await readFromIndexedDb(IDB_V1_NAME, 'starlight_island_save');
  if (isRecord(idbV1)) {
    const state = hydratePayload(idbV1, 'indexeddb:starlight_island_db', presentLegacyKeys);
    await persistSaveState(state);
    return { state, source: 'legacy-v1-migrated', warnings };
  }

  // 6. Fresh Violet & Ozias save
  const fresh = createDefaultSaveState();
  await persistSaveState(fresh);
  return { state: fresh, source: 'fresh-default', warnings };
}

export async function persistSaveState(state: StarlightSaveState): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(V2_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private browsing / quota fallback
    }
  }
  await writeToIndexedDb(IDB_V2_NAME, V2_STORAGE_KEY, state);
}

/**
 * Bridges C:\dojo's complete StorageManager gameplay mutations with Starlight v2's
 * canonical schemaVersion 3 storage key (`starlight_v2_save`) + IndexedDB mirror,
 * NEVER touching `starlight_pokemon_save_v1` or any legacy key!
 */
export class StarlightStorageBridge {
  readonly manager: StorageManager;
  private settings: GameSettings;
  private migratedFromV1?: StarlightSaveState['migratedFromV1'];

  constructor(initialState: StarlightSaveState) {
    this.settings = { ...initialState.settings };
    this.migratedFromV1 = initialState.migratedFromV1;
    this.manager = createStorageManager(V2_STORAGE_KEY);
    this.loadFromV3State(initialState);
    // Override manager.save so every internal dojo mutation writes schemaVersion: 3 cleanly!
    this.manager.save = () => {
      const snapshot = this.toV3SaveState();
      void persistSaveState(snapshot);
      return true;
    };
  }

  private loadFromV3State(state: StarlightSaveState): void {
    this.manager.state = {
      version: 2,
      activeTrainerId: state.activeTrainerId,
      settings: {
        muted: state.settings.audioMuted,
        crtEnabled: state.settings.crtMode,
        showTouchPad: state.settings.showTouchPad,
        battlePace: state.settings.battlePace,
      },
      profiles: {
        violet: validateAndRepairProfile({ ...state.profiles.violet }, 'violet'),
        ozias: validateAndRepairProfile({ ...state.profiles.ozias }, 'ozias'),
      },
    };
  }

  getSettings(): GameSettings {
    return { ...this.settings };
  }

  updateSettings(patch: Partial<GameSettings>): GameSettings {
    this.settings = {
      ...this.settings,
      ...patch,
    };
    this.manager.state.settings = {
      muted: this.settings.audioMuted,
      crtEnabled: this.settings.crtMode,
      showTouchPad: this.settings.showTouchPad,
      battlePace: this.settings.battlePace,
    };
    this.saveSync();
    return this.getSettings();
  }

  getActiveProfileLive(): Record<string, unknown> | null {
    return this.manager.getActiveProfile() as Record<string, unknown> | null;
  }

  getActiveProfileJSON(): DojoProfileState | null {
    const live = this.manager.getActiveProfile();
    if (!live) return null;
    return this.manager.serializeProfile(live) as DojoProfileState;
  }

  toV3SaveState(): StarlightSaveState {
    return {
      schemaVersion: 3,
      activeTrainerId: (this.manager.state.activeTrainerId as TrainerId | null) ?? null,
      profiles: {
        violet: this.manager.serializeProfile(this.manager.state.profiles.violet) as DojoProfileState,
        ozias: this.manager.serializeProfile(this.manager.state.profiles.ozias) as DojoProfileState,
      },
      settings: { ...this.settings },
      ...(this.migratedFromV1 ? { migratedFromV1: this.migratedFromV1 } : {}),
    };
  }

  saveSync(): void {
    const snapshot = this.toV3SaveState();
    void persistSaveState(snapshot);
  }
}
