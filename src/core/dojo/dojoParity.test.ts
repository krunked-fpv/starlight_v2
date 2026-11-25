import { describe, it, expect, beforeEach } from 'vitest';
import {
  BIOME_IDS,
} from '../../contracts';
import {
  ARCADE_SHARD_BUYIN_COST,
  BIOMES,
  CHESTS,
  EVOLUTIONS,
  FIELD_QUESTS,
  LANDMARKS,
  MAX_ARCADE_SHARDS,
  NPCS,
  RIVAL_TRAINERS,
  SECRET_ARCADE_SPOT,
  SHRINES,
  SIGNPOSTS,
  STARTER_IDS,
  STEPS_PER_ARCADE_CHARGE,
  STEPS_PER_CHEER_CHARGE,
  TILE,
  TOTAL_SPECIES_COUNT,
  WORLD_COLS,
  WORLD_MAP,
  WORLD_ROWS,
  applyComposureGuardrail,
  containsEmoji,
  createPokemon,
  decodeGif89aBytes,
  findBfsPath,
  getAllAbilities,
  getAllBadges,
  getAllEvolutionItems,
  getAllMoves,
  getAllSpecies,
  getAllTrainerAccessories,
  getAllTrainerAuras,
  getAllTrainerStyles,
  getBiomeVisualProfile,
  getScaledShrineTrial,
  getSpeciesEntry,
  isTileWalkableAt,
  resolveCorsSpriteCandidates,
  SpriteAssetLoader,
  stripEmojis,
  DojoBattleController,
  DojoOverworldSim,
  DojoSkyHopController,
} from './index';
import {
  DOJO_STORAGE_KEY,
  V2_STORAGE_KEY,
  StarlightStorageBridge,
  createDefaultSaveState,
  hydrateSaveState,
} from '../save/saveHydrator';

/** Minimal valid 2-frame 2x2 GIF89a binary with transparency & per-frame delays */
function buildTestTwoFrameGif89a(): Uint8Array {
  return new Uint8Array([
    // Header GIF89a
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
    // Logical Screen Descriptor: 2x2, GCT flag=1, size=0 (2 colors)
    0x02, 0x00, 0x02, 0x00, 0x80, 0x00, 0x00,
    // Global Color Table: idx0 = red (255,0,0), idx1 = blue (0,0,255)
    0xff, 0x00, 0x00, 0x00, 0x00, 0xff,
    // Frame 1 Graphic Control Extension: delay 12 (120ms), no transparency
    0x21, 0xf9, 0x04, 0x04, 0x0c, 0x00, 0x00, 0x00,
    // Frame 1 Image Descriptor: (0,0) 2x2
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00,
    // LZW min code size = 2; codes: Clear(4), 0, 0, 0, 0, EOI(5)
    0x02, 0x03, 0x04, 0x00, 0x50, 0x00,
    // Frame 2 Graphic Control Extension: delay 15 (150ms)
    0x21, 0xf9, 0x04, 0x04, 0x0f, 0x00, 0x00, 0x00,
    // Frame 2 Image Descriptor: (0,0) 2x2
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00,
    // LZW min code size = 2; codes: Clear(4), 1, 1, 1, 1, EOI(5)
    0x02, 0x03, 0x0c, 0x91, 0x50, 0x00,
    // Trailer
    0x3b,
  ]);
}

describe('C:\\dojo Full Parity & Data Integrity', () => {
  it('matches exact C:\\dojo world, species, move, ability, badge, and quest counts', () => {
    expect(WORLD_COLS).toBe(100);
    expect(WORLD_ROWS).toBe(84);
    expect(WORLD_MAP.length).toBe(84);
    expect(WORLD_MAP[0].length).toBe(100);
    expect(Object.keys(TILE).length).toBe(61);
    expect(Object.keys(BIOMES).length).toBe(18);
    expect(BIOME_IDS.length).toBe(18);
    expect(Object.keys(SHRINES).length).toBe(20);
    expect(Object.keys(CHESTS).length).toBe(36);
    expect(Object.keys(NPCS).length).toBe(23);
    expect(FIELD_QUESTS.length).toBe(23);
    expect(Object.keys(RIVAL_TRAINERS).length).toBe(17);
    expect(Object.keys(LANDMARKS).length).toBe(20);
    expect(Object.keys(SIGNPOSTS).length).toBe(18);

    const allSpecies = getAllSpecies();
    expect(allSpecies.length).toBe(1025);
    expect(getSpeciesEntry(1).name).toBe('Bulbasaur');
    expect(getSpeciesEntry(25).name).toBe('Pikachu');
    expect(getSpeciesEntry(1025).name).toBe('Pecharunt');

    expect(getAllMoves().length).toBe(128);
    expect(getAllAbilities().length).toBe(38);
    expect(getAllBadges().length).toBe(28);
    expect(getAllEvolutionItems().length).toBe(16);
    expect(Object.keys(EVOLUTIONS).length).toBe(457);
    expect(STARTER_IDS).toEqual([1, 4, 7]);
  });

  it('guarantees 100% BFS walkability from spawn (8,15) to all shrines, chests, NPCs, rivals, signposts, and Secret Arcade (11,12)', () => {
    const visited = new Uint8Array(WORLD_COLS * WORLD_ROWS);
    const queue = new Int32Array(WORLD_COLS * WORLD_ROWS);
    let head = 0;
    let tail = 0;
    const startIdx = 15 * WORLD_COLS + 8;
    visited[startIdx] = 1;
    queue[tail++] = startIdx;

    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % WORLD_COLS;
      const cy = (cur - cx) / WORLD_COLS;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= WORLD_COLS || ny >= WORLD_ROWS) continue;
        const nIdx = ny * WORLD_COLS + nx;
        if (visited[nIdx] || !isTileWalkableAt(nx, ny)) continue;
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }

    const canReachOrAdjoin = (x: number, y: number): boolean => {
      if (isTileWalkableAt(x, y) && visited[y * WORLD_COLS + x]) return true;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < WORLD_COLS && ny < WORLD_ROWS && visited[ny * WORLD_COLS + nx]) {
          return true;
        }
      }
      return false;
    };

    expect(canReachOrAdjoin(SECRET_ARCADE_SPOT.x, SECRET_ARCADE_SPOT.y)).toBe(true);
    for (const key of Object.keys(SHRINES)) {
      const [xs, ys] = key.split(',').map(Number);
      expect(canReachOrAdjoin(xs, ys)).toBe(true);
    }
    for (const key of Object.keys(CHESTS)) {
      const [x, y] = key.split(',').map(Number);
      expect(canReachOrAdjoin(x, y)).toBe(true);
    }
    for (const key of Object.keys(NPCS)) {
      const [x, y] = key.split(',').map(Number);
      expect(canReachOrAdjoin(x, y)).toBe(true);
    }
    for (const key of Object.keys(RIVAL_TRAINERS)) {
      const [x, y] = key.split(',').map(Number);
      expect(canReachOrAdjoin(x, y)).toBe(true);
    }
    for (const key of Object.keys(SIGNPOSTS)) {
      const [x, y] = key.split(',').map(Number);
      expect(canReachOrAdjoin(x, y)).toBe(true);
    }
    // Verify findBfsPath returns a valid walkable path to Secret Arcade spot
    const pathToArcade = findBfsPath(8, 15, SECRET_ARCADE_SPOT.x, SECRET_ARCADE_SPOT.y);
    expect(pathToArcade.length).toBeGreaterThan(0);
  });

  it('guarantees 100% 1..1025 National Dex reachability via starters, biome tables, shrines, Astral Shrine Trials, and evolutions', () => {
    const reachable = new Set<number>(STARTER_IDS);
    for (const b of Object.values(BIOMES)) {
      for (const enc of b.encounters || []) reachable.add(Number(enc.id));
    }
    for (const s of Object.values(SHRINES)) {
      reachable.add(Number(s.guardianId));
      // Astral Shrine Trials rotate through all biome roaming legends & mythicals
      for (let t = 0; t < 12; t++) {
        const trial = getScaledShrineTrial(s, { shrineTrialCounts: { [s.id]: t } });
        reachable.add(Number(trial.guardianId));
      }
    }

    // Close over all evolution edges
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...reachable]) {
        const rules = EVOLUTIONS[id];
        if (!Array.isArray(rules)) continue;
        for (const r of rules) {
          if (!reachable.has(r.to)) {
            reachable.add(r.to);
            changed = true;
          }
        }
      }
    }
    expect(reachable.size).toBe(TOTAL_SPECIES_COUNT);
  });

  it('strips 100% of raw Unicode emojis across all sanitized catalog, biome, badge, style, and dialogue strings', () => {
    for (const sp of getAllSpecies()) {
      expect(containsEmoji(sp.name)).toBe(false);
      expect(containsEmoji(sp.description)).toBe(false);
    }
    for (const mv of getAllMoves()) {
      expect(containsEmoji(mv.name)).toBe(false);
    }
    for (const ab of getAllAbilities()) {
      expect(containsEmoji(ab.name)).toBe(false);
      expect(containsEmoji(ab.description)).toBe(false);
    }
    for (const badge of getAllBadges()) {
      expect(containsEmoji(badge.name)).toBe(false);
      expect(containsEmoji(badge.description)).toBe(false);
    }
    for (const item of getAllEvolutionItems()) {
      expect(containsEmoji(item.name)).toBe(false);
      expect(containsEmoji(item.description)).toBe(false);
    }
    for (const st of getAllTrainerStyles()) expect(containsEmoji(st.name)).toBe(false);
    for (const acc of getAllTrainerAccessories()) expect(containsEmoji(acc.name)).toBe(false);
    for (const au of getAllTrainerAuras()) expect(containsEmoji(au.name)).toBe(false);
    for (const bId of BIOME_IDS) {
      const vp = getBiomeVisualProfile(bId);
      expect(containsEmoji(vp.displayName)).toBe(false);
      expect(containsEmoji(vp.subtitle)).toBe(false);
    }
    expect(stripEmojis('✨ Starlight ✅ Village 🏡')).toBe('Starlight Village');
  });
});

describe('schemaVersion 3 Save Hydrator & Precedence', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, String(v)); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
      },
    });
  });

  it('prioritizes authentic starlight_pokemon_save_v1 (Violet & Ozias) over pre-overhaul schemaVersion 2 demo saves and preserves legacy bytes', async () => {
    const oldDemoV2 = JSON.stringify({
      schemaVersion: 2,
      activeSlot: 'slot0',
      profiles: {
        slot0: { name: 'Lyra', party: [{ speciesId: 25, level: 28 }] },
        slot1: { name: 'Orion', party: [{ speciesId: 133, level: 26 }] },
      },
    });
    const realDojoSave = JSON.stringify({
      version: 2,
      activeTrainerId: 'violet',
      profiles: {
        violet: {
          trainerId: 'violet',
          starterId: 7,
          team: [{ speciesId: 9, level: 36, nickname: 'Splashy', isShiny: true }],
          badges: ['forest', 'water', 'starlight'],
          bag: { potions: 11, greatBalls: 7, starBalls: 4, starShards: 18, cheerCharges: 2 },
        },
        ozias: {
          trainerId: 'ozias',
          starterId: 4,
          team: [{ speciesId: 6, level: 32 }],
          badges: ['volcano'],
        },
      },
    });

    store.set(V2_STORAGE_KEY, oldDemoV2);
    store.set(DOJO_STORAGE_KEY, realDojoSave);

    const res = await hydrateSaveState();
    expect(res.source).toBe('dojo-v1-migrated');
    expect(res.state.schemaVersion).toBe(3);
    expect(res.state.activeTrainerId).toBe('violet');
    expect(res.state.profiles.violet.starterId).toBe(7);
    expect(res.state.profiles.violet.team[0].speciesId).toBe(9);
    expect(res.state.profiles.violet.team[0].nickname).toBe('Splashy');
    expect(res.state.profiles.violet.team[0].isShiny).toBe(true);
    expect(res.state.profiles.violet.bag.starShards).toBe(18);
    expect(res.state.profiles.ozias.starterId).toBe(4);
    expect(res.state.profiles.ozias.team[0].speciesId).toBe(6);
    // Legacy key MUST remain byte-identical!
    expect(store.get(DOJO_STORAGE_KEY)).toBe(realDojoSave);
  });

  it('recovers gracefully from corrupted JSON payloads without throwing', async () => {
    store.set(V2_STORAGE_KEY, '{not-valid-json');
    store.set(DOJO_STORAGE_KEY, '<<<corrupt>>>');
    const res = await hydrateSaveState();
    expect(res.state.schemaVersion).toBe(3);
    expect(res.source).toBe('fresh-default');
    expect(res.warnings.length).toBeGreaterThanOrEqual(2);
    expect(res.state.profiles.violet.bag.starShards).toBe(0);
    expect(res.state.profiles.violet.bag.cheerCharges).toBe(0);
  });
});

describe('Earned Economy, Composure, Battle & Sky-Hop Invariants', () => {
  it('enforces earned economy & Composure full-HP opening-hit guardrail', () => {
    expect(STEPS_PER_CHEER_CHARGE).toBe(25);
    expect(STEPS_PER_ARCADE_CHARGE).toBe(50);
    expect(MAX_ARCADE_SHARDS).toBeLessThan(ARCADE_SHARD_BUYIN_COST);

    const fresh = createDefaultSaveState();
    expect(fresh.profiles.violet.bag.starShards).toBe(0);
    expect(fresh.profiles.violet.bag.cheerCharges).toBe(0);

    const atk = createPokemon(150, 12, 'cave');
    const def = createPokemon(25, 10, 'forest');
    const guarded = applyComposureGuardrail(999, atk, def, {
      applyComposure: true,
      defenderSide: 'player',
      isBoss: false,
    });
    expect(guarded.composureCapped).toBe(true);
    expect(guarded.damage).toBeLessThan(def.maxHp);
  });

  it('runs clean Overworld, Battle, and Sky-Hop cycles via StarlightStorageBridge', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);

    const loader = new SpriteAssetLoader({ forceOffline: true });
    const ow = new DojoOverworldSim(bridge, loader);
    ow.syncFromProfile();
    expect(ow.getState().currentBiomeId).toBe('village');
    expect(ow.getState().follower?.speciesId).toBe(1);

    const battle = new DojoBattleController(bridge, loader);
    const bState = battle.startEncounter({ biomeId: 'forest', tier: 'wild', forceOfflineRig: true });
    expect(bState.active).toBe(true);
    expect(bState.player.mon.speciesId).toBe(1);
    const outcome = battle.performMove(bState.player.mon.moves[0].id);
    expect(outcome.vfxEvents.length).toBeGreaterThanOrEqual(1);

    const sky = new DojoSkyHopController(bridge, loader);
    sky.open();
    expect(sky.startNewRun()).toBe(true);
    expect(sky.getState().running).toBe(true);
    sky.update(0.016);
    expect(sky.getState().elapsedSeconds).toBeGreaterThan(0);
  });
});

describe('SpriteAssetLoader GIF89a Decoder & CORS / Offline Policy', () => {
  it('decodes multi-frame GIF89a bytes cleanly with per-frame delays', () => {
    const gifBytes = buildTestTwoFrameGif89a();
    const decoded = decodeGif89aBytes(gifBytes);
    expect(decoded).not.toBeNull();
    expect(decoded!.width).toBe(2);
    expect(decoded!.height).toBe(2);
    expect(decoded!.frames.length).toBe(2);
    expect(decoded!.frames[0].delayMs).toBe(120);
    expect(decoded!.frames[1].delayMs).toBe(150);
    // Frame 1 is solid red (255,0,0,255); Frame 2 is solid blue (0,0,255,255)
    expect(decoded!.frames[0].rgba[0]).toBe(255);
    expect(decoded!.frames[0].rgba[2]).toBe(0);
    expect(decoded!.frames[1].rgba[0]).toBe(0);
    expect(decoded!.frames[1].rgba[2]).toBe(255);
  });

  it('avoids missing Showdown back/*.gif URLs for Gen 6-9 and returns instant offline pixel fallback', async () => {
    const gen5Back = resolveCorsSpriteCandidates(25, true, false);
    expect(gen5Back[0].url).toContain('generation-v/black-white/animated/back/25.gif');

    const gen9Back = resolveCorsSpriteCandidates(1025, true, false);
    expect(gen9Back.some((c) => c.url.includes('showdown/back/'))).toBe(false);
    expect(gen9Back[0].mirrorX).toBe(true);

    const loader = new SpriteAssetLoader({ forceOffline: true });
    const fb = await loader.loadSpeciesSprite(25, { back: false, shiny: false });
    expect(fb.sourceKind).toBe('offline-pixel');
    expect(fb.archetype).toBe('biped');
    const eeveeFb = await loader.loadSpeciesSprite(133, { back: false, shiny: false });
    expect(eeveeFb.archetype).toBe('quadruped');
  });
});
