import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  SKYHOP_PALETTES,
  SKYHOP_WAVE_TEMPLATES,
  STARTER_IDS,
  STEPS_PER_ARCADE_CHARGE,
  STEPS_PER_CHEER_CHARGE,
  TILE,
  TOTAL_SPECIES_COUNT,
  WORLD_COLS,
  WORLD_MAP,
  WORLD_ROWS,
  StarlightAudioController,
  applyComposureGuardrail,
  calculateDamage,
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
    expect(bState.phase).toBe('shutter');
    expect(bState.inputLocked).toBe(true);
    expect(bState.player.mon.speciesId).toBe(1);
    battle.advanceUntilSettled();
    expect(battle.getState().phase).toBe('command');
    const initOutcome = battle.performMove(battle.getState().player.mon.moves[0].id);
    const settledOutcome = battle.advanceUntilSettled();
    expect(initOutcome.vfxEvents.length + settledOutcome.vfxEvents.length).toBeGreaterThanOrEqual(1);

    const sky = new DojoSkyHopController(bridge, loader);
    sky.open({ forceUnlock: true });
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

describe('v1-vs-v2 Regression Parity Suite (BUG-01..BUG-23)', () => {
  it('BUG-02 & BUG-19: populates live Compass Guidance (targetX/targetY) and real species flavor texts', () => {
    expect(getSpeciesEntry(1).description).toContain('sunny seed');
    expect(getSpeciesEntry(4).description).toContain('tail flame');
    expect(getSpeciesEntry(7).description).toContain('playful swimmer');

    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const ow = new DojoOverworldSim(bridge, new SpriteAssetLoader({ forceOffline: true }));
    ow.syncFromProfile();

    const compass = ow.getState().compassTarget;
    expect(compass).not.toBeNull();
    expect(compass!.label).toContain('Professor Willow');
    expect(compass!.x).toBe(9);
    expect(compass!.y).toBe(12);
  });

  it('BUG-04 & BUG-12 & BUG-14: enables Shallow Water encounters, auto-heal fountain steps, Landmarks, BFS auto-interact, and safe follower trailing', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const ow = new DojoOverworldSim(bridge, new SpriteAssetLoader({ forceOffline: true }));
    ow.syncFromProfile();

    // Injure lead Pokémon and step onto Healing Fountain (7,13) from (7,14)
    const profile = bridge.manager.getActiveProfile();
    profile.team[0].hp = 5;
    profile.pos = { x: 7, y: 14, dir: 'up' };
    ow.syncFromProfile();
    const healStep = ow.stepDirection(0, -1);
    expect(healStep.moved).toBe(true);
    expect(healStep.steppedHealSpot).toBe(true);
    // Follower should trail onto previous walkable tile (7,14)
    expect(ow.getState().follower).not.toBeNull();
    ow.update(0.05, { dx: 0, dy: 0 });

    // Landmark interactability
    const firstLandmarkKey = Object.keys(LANDMARKS)[0];
    const [lx, ly] = firstLandmarkKey.split(',').map(Number);
    const lmTarget = ow.getInteractableAtTile(lx, ly);
    expect(lmTarget?.kind).toBe('landmark');

    // BFS auto-interact target resolves on arrival
    profile.pos = { x: 8, y: 15, dir: 'up' };
    ow.syncFromProfile();
    const path = ow.setBfsTarget(9, 12, { autoInteract: true });
    expect(path.length).toBeGreaterThan(0);
    let arrived = false;
    for (let i = 0; i < 60; i++) {
      const ev = ow.update(0.05, { dx: 0, dy: 0 });
      if (ev?.arrivedInteractTarget) {
        arrived = true;
        break;
      }
    }
    expect(arrived).toBe(true);

    // Shallow Water encounter trigger in Sapphire Lagoon
    let shallowX = -1;
    let shallowY = -1;
    outer: for (let y = 1; y < WORLD_ROWS - 1; y++) {
      for (let x = 1; x < WORLD_COLS - 1; x++) {
        if (WORLD_MAP[y][x] === TILE.SHALLOW_WATER && isTileWalkableAt(x - 1, y)) {
          shallowX = x;
          shallowY = y;
          break outer;
        }
      }
    }
    expect(shallowX).toBeGreaterThan(0);
    profile.pos = { x: shallowX - 1, y: shallowY, dir: 'right' };
    ow.syncFromProfile();
    const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const waterStep = ow.stepDirection(1, 0);
    randSpy.mockRestore();
    expect(waterStep.moved).toBe(true);
    expect(waterStep.onGrass).toBe(true);
    expect(waterStep.wildEncounterTriggered?.biomeId).toBe('water');

    // Solid coordinate repair on syncFromProfile
    profile.pos = { x: 0, y: 0, dir: 'down' };
    ow.syncFromProfile();
    expect(isTileWalkableAt(ow.getState().player.tileX, ow.getState().player.tileY)).toBe(true);
  });

  it('BUG-05, BUG-06, BUG-15, BUG-16: forbids Shrine capture, awards Shrine rewards by id, allows safe Shrine/Rival flee, and rolls victory trail drops', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const profile = bridge.manager.getActiveProfile();

    const battle = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));
    const shrineState = battle.startEncounter({
      biomeId: 'forest',
      tier: 'shrine',
      shrineId: 'forest_shrine',
      forceOfflineRig: true,
    });
    // COMBAT-04: First-clear Shrine Guardian is NOT marked isElite (only Astral Trials are!)
    expect(shrineState.enemy.mon.isElite).toBe(false);
    battle.advanceUntilSettled();

    // BUG-06: Cannot capture Shrine Guardian; Star Ball is not consumed
    expect(shrineState.canCapture).toBe(false);
    expect(shrineState.canRun).toBe(true);
    const ballsBefore = profile.bag.starBalls;
    battle.throwBall('star');
    expect(profile.bag.starBalls).toBe(ballsBefore);
    expect(battle.getState().statusMessage).toContain('Shrine Guardians cannot be caught');

    // Wait out 180ms rejection cooldown, then BUG-15: Can step back safely from Shrine
    battle.advanceUntilSettled();
    const fleeRes = battle.flee();
    expect(fleeRes.battleEnded).toBe('fled');
    expect(battle.getState().statusMessage).toContain('Stepped back safely from the Shrine');

    // BUG-05 & BUG-16: Defeat Forest Shrine (start at Lv.5 so guardian scales cleanly, then boost lead)
    battle.startEncounter({
      biomeId: 'forest',
      tier: 'shrine',
      shrineId: 'forest_shrine',
      forceOfflineRig: true,
    });
    battle.advanceUntilSettled();
    profile.team[0].level = 25;
    profile.team[0].recalculateStats();
    profile.team[0].healFull();
    const forestShrine = Object.values(SHRINES).find((s) => s.id === 'forest_shrine')!;
    const potionsBefore = profile.bag.potions;
    const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    for (let turn = 0; turn < 10 && battle.getState().phase !== 'victory' && battle.getState().phase !== 'evolving'; turn++) {
      battle.performMove(battle.getState().player.mon.moves[0].id);
      battle.advanceUntilSettled();
    }
    randSpy.mockRestore();

    expect(['victory', 'evolving']).toContain(battle.getState().phase);
    expect(profile.shrinesCleared).toContain('forest_shrine');
    if (forestShrine.reward?.potions) {
      expect(profile.bag.potions).toBeGreaterThanOrEqual(potionsBefore + forestShrine.reward.potions);
    }
    // Trail drop with random=0.1 grants biome leaf_gem
    expect(profile.bag.gems.leaf_gem).toBeGreaterThanOrEqual(1);
  });

  it('BUG-07 & BUG-17: handles 0-PP Struggle, full-HP Potion refusal, Rival faint turn termination + per-faint XP, Rival rematch rewards, and catch XP exclusion', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const profile = bridge.manager.getActiveProfile();
    const lead = profile.team[0];

    const battle = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));
    battle.startEncounter({ biomeId: 'forest', tier: 'wild', forceSpeciesId: 10, forceOfflineRig: true });
    battle.advanceUntilSettled();

    // Full-HP potion should be refused without consuming a potion
    const potBefore = profile.bag.potions;
    battle.usePotion();
    expect(profile.bag.potions).toBe(potBefore);
    expect(battle.getState().statusMessage).toContain('already full');
    battle.advanceUntilSettled();

    // BUG-07: Drain all PP -> exposes Struggle and executes cleanly without soft-lock
    for (const mv of lead.getMoveObjects()) {
      lead.movePp[mv.id] = 0;
    }
    const zeroInit = battle.performMove(lead.getMoveObjects()[0].id);
    const zeroSettled = battle.advanceUntilSettled();
    expect(zeroInit.vfxEvents.length + zeroSettled.vfxEvents.length).toBeGreaterThanOrEqual(1);
    expect(battle.getState().player.mon.moves[0].id).toBe('struggle');

    // Start multi-mon Rival duel first, then boost lead so it reliably KOs enemy #1
    lead.restoreAllPp();
    const rivalState = battle.startEncounter({
      biomeId: 'forest',
      tier: 'rival',
      rivalId: 'rival_leo',
      forceOfflineRig: true,
    });
    expect(rivalState.rivalTotalMons).toBeGreaterThanOrEqual(2);
    expect(rivalState.enemyPartyPips.length).toBe(rivalState.rivalTotalMons);
    battle.advanceUntilSettled();
    lead.level = 25;
    lead.recalculateStats();
    lead.healFull();

    // Attack until enemy #1 faints; on the faint turn, enemy #2 MUST NOT attack and partial XP is awarded
    let faintTurnEnemyVfxCount = -1;
    let hpBeforeFaintTurn = lead.hp;
    let xpBeforeFaintTurn = lead.xp;
    let lvBeforeFaintTurn = lead.level;
    for (let t = 0; t < 4; t++) {
      hpBeforeFaintTurn = lead.hp;
      xpBeforeFaintTurn = lead.xp;
      lvBeforeFaintTurn = lead.level;
      const out1 = battle.performMove(battle.getState().player.mon.moves[0].id);
      const out2 = battle.advanceUntilSettled();
      if (battle.getState().rivalRemainingMons === rivalState.rivalTotalMons - 1) {
        faintTurnEnemyVfxCount =
          out1.vfxEvents.filter((e) => e.fromSide === 'enemy').length
          + out2.vfxEvents.filter((e) => e.fromSide === 'enemy').length;
        break;
      }
    }
    expect(faintTurnEnemyVfxCount).toBe(0);
    expect(lead.hp).toBe(hpBeforeFaintTurn);
    expect(lead.level > lvBeforeFaintTurn || lead.xp > xpBeforeFaintTurn).toBe(true);
    expect(battle.getState().enemyPartyPips[0].fainted).toBe(true);
    expect(battle.getState().enemyPartyPips[1].active).toBe(true);

    // Finish Rival -> verify rematch grants rematchRewards (NOT first-clear leaf_gem again!)
    for (let t = 0; t < 8 && battle.getState().phase !== 'victory' && battle.getState().phase !== 'evolving'; t++) {
      battle.performMove(battle.getState().player.mon.moves[0].id);
      battle.advanceUntilSettled();
    }
    expect(profile.rivalsDefeated).toContain('rival_leo');
    const leafGemsAfterFirst = profile.bag.gems.leaf_gem || 0;

    // Rematch: reset scaling anchor before startEncounter, then boost lead so rematch victory is deterministic
    lead.level = 5;
    lead.recalculateStats();
    lead.healFull();
    battle.startEncounter({ biomeId: 'forest', tier: 'rival', rivalId: 'rival_leo', forceOfflineRig: true });
    battle.advanceUntilSettled();
    lead.level = 50;
    lead.recalculateStats();
    lead.healFull();
    for (let t = 0; t < 16 && battle.getState().phase !== 'victory' && battle.getState().phase !== 'evolving'; t++) {
      lead.healFull();
      battle.performMove(battle.getState().player.mon.moves[0].id);
      battle.advanceUntilSettled();
    }
    expect(['victory', 'evolving']).toContain(battle.getState().phase);
    expect(profile.bag.gems.leaf_gem || 0).toBe(leafGemsAfterFirst);

    // Catch XP exclusion: caught Pokémon must NOT earn bench XP from catching itself!
    battle.startEncounter({ biomeId: 'forest', tier: 'wild', forceSpeciesId: 10, forceOfflineRig: true });
    battle.advanceUntilSettled();
    const catchRandSpy = vi.spyOn(Math, 'random').mockReturnValue(0.001);
    const catchInit = battle.throwBall('star');
    expect(battle.getState().phase).toBe('capturing');
    expect(battle.getState().inputLocked).toBe(true);
    const catchSettled = battle.advanceUntilSettled();
    catchRandSpy.mockRestore();
    expect(catchInit.battleEnded || catchSettled.battleEnded).toBe('caught');
    const caughtMon = profile.team[profile.team.length - 1];
    expect(caughtMon.speciesId).toBe(10);
    expect(caughtMon.xp).toBe(0);
    expect(caughtMon.hp).toBeGreaterThanOrEqual(1);
    expect(profile.bag.cheerCharges).toBeGreaterThanOrEqual(1);
  });

  it('BUG-11, BUG-22 & BUG-23: enforces Secret Arcade attunement/unlock, 26 waves + 18 palettes, and Audio masterVolume preservation', () => {
    expect(SKYHOP_WAVE_TEMPLATES.length).toBe(26);
    expect(SKYHOP_PALETTES.length).toBe(18);

    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);

    // Unattuned player cannot bypass unlock via plain open()
    const knockRes = bridge.manager.recordSecretKnock();
    expect(knockRes.attuned).toBe(false);
    const sky = new DojoSkyHopController(bridge, new SpriteAssetLoader({ forceOffline: true }));
    sky.open();
    expect(bridge.manager.isArcadeUnlocked()).toBe(false);
    expect(sky.getState().outOfCharges).toBe(true);

    // BUG-23: Audio controller preserves configured masterVolume across mute/unmute
    const audio = new StarlightAudioController();
    const fakeGain = { value: 0.52, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() };
    const internal = audio as unknown as {
      engine: { masterGain: { gain: typeof fakeGain }; ctx: { currentTime: number }; muted: boolean };
    };
    internal.engine.masterGain = { gain: fakeGain };
    internal.engine.ctx = { currentTime: 1.0 };

    audio.setMasterVolume(0.3);
    audio.setMuted(true);
    expect(fakeGain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1.0, 0.015);
    audio.setMuted(false);
    expect(fakeGain.setTargetAtTime).toHaveBeenLastCalledWith(0.3, 1.0, 0.015);
  });

  it('#16 Item 6 & #17 GAP-1/GAP-5: fresh starter Caught count is 1 (not 2), forced-switch triggers cleanly on faint with dual moveSfxEvents, and natural rare encounters can roll', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const profile = bridge.manager.getActiveProfile();

    // Fresh starter must show Caught (1), NEVER Caught (2)!
    expect(profile.pokedex.caught[1]).toBe(1);
    expect(profile.stats.totalCaught).toBe(1);

    // Add a healthy bench partner so fainting enters 'forced-switch' instead of auto-switching
    const bench = createPokemon(25, 10, 'forest');
    profile.team.push(bench);

    const battle = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));
    battle.startEncounter({ biomeId: 'forest', tier: 'wild', forceSpeciesId: 10, forceOfflineRig: true });
    battle.advanceUntilSettled();

    // Dual moveSfxEvents preserved across a normal 2-sided turn
    const turnInit = battle.performMove(battle.getState().player.mon.moves[0].id);
    const turnRest = battle.advanceUntilSettled();
    const allMoveSfx = [...(turnInit.moveSfxEvents ?? []), ...(turnRest.moveSfxEvents ?? [])];
    expect(allMoveSfx.length).toBe(2);
    expect(allMoveSfx[0].side).not.toBe(allMoveSfx[1].side);

    // Drop active mon to 1 HP and let enemy KO it -> enters 'forced-switch'
    profile.team[0].hp = 1;
    battle.performMove(battle.getState().player.mon.moves[0].id);
    battle.advanceUntilSettled();
    if (profile.team[0].isFainted) {
      expect(battle.getState().phase).toBe('forced-switch');
      const benchHpBefore = bench.hp;
      const swInit = battle.switchTeamMember(1);
      const swRest = battle.advanceUntilSettled();
      expect(battle.getState().phase).toBe('command');
      expect(battle.getState().player.mon.speciesId).toBe(25);
      // Forced switch grants clean send-out with NO free enemy hit
      expect(bench.hp).toBe(benchHpBefore);
      expect(swInit.vfxEvents.length + swRest.vfxEvents.length).toBe(0);
    }

    // Natural overworld rare encounter roll (with Math.random = 0.01)
    const ow = new DojoOverworldSim(bridge, new SpriteAssetLoader({ forceOffline: true }));
    profile.pos = { x: 8, y: 8, dir: 'up' };
    ow.syncFromProfile();
    const rSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01);
    let sawRare = false;
    for (let step = 0; step < 6; step++) {
      const ev = ow.stepDirection(0, -1);
      if (ev.wildEncounterTriggered?.isRarePatch) {
        sawRare = true;
        break;
      }
    }
    rSpy.mockRestore();
    expect(sawRare).toBe(true);
  });
});

describe('Round 2 Combat State Machine, Anti-Spam Lock & v1 Parity (COMBAT-01..COMBAT-12)', () => {
  it('COMBAT-01: hard-locks input during shutter, intro, and active turns (10x spam-clicking executes ONLY 1 turn)', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1); // Bulbasaur Lv.5
    const profile = bridge.manager.getActiveProfile();
    const battle = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));

    battle.startEncounter({
      biomeId: 'forest',
      tier: 'wild',
      forceSpeciesId: 10,
      forceOfflineRig: true,
      battlePace: 'classic',
    });

    // Rejects actions during shutter & intro!
    const moveId = battle.getState().player.mon.moves[0].id;
    const ppInitial = profile.team[0].getMovePp(moveId).current;
    expect(battle.getState().phase).toBe('shutter');
    expect(battle.getState().inputLocked).toBe(true);
    battle.performMove(moveId);
    battle.throwBall('poke');
    battle.flee();
    expect(battle.getState().active).toBe(true);
    expect(profile.team[0].getMovePp(moveId).current).toBe(ppInitial);

    // Step shutter -> intro -> command
    battle.advanceUntilSettled();
    expect(battle.getState().phase).toBe('command');
    expect(battle.getState().inputLocked).toBe(false);

    // Rapidly spam-fire performMove 10 times in a row during the active turn!
    battle.performMove(moveId);
    expect(battle.getState().inputLocked).toBe(true);
    expect(['player-acting', 'enemy-acting']).toContain(battle.getState().phase);
    for (let spam = 0; spam < 9; spam++) {
      battle.performMove(moveId);
    }

    // Only ONE move's PP was consumed & only ONE turn completes
    expect(profile.team[0].getMovePp(moveId).current).toBe(ppInitial - 1);
    battle.advanceUntilSettled();
    expect(battle.getState().turnNumber).toBe(2);
    expect(profile.team[0].getMovePp(moveId).current).toBe(ppInitial - 1);
  });

  it('COMBAT-01 & Difficulty Parity: Lv.5 Bulbasaur spamming resisted Vine Whip vs Lv.12 Volcano Shrine Moltres LOSES', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1); // Lv.5 Bulbasaur (Grass)
    const battle = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));

    const st = battle.startEncounter({
      biomeId: 'volcano',
      tier: 'shrine',
      shrineId: 'volcano_shrine',
      forceOfflineRig: true,
      battlePace: 'fast',
    });
    expect(st.enemy.mon.speciesId).toBe(146); // Moltres (Fire) Lv.12
    expect(st.enemy.mon.level).toBeGreaterThanOrEqual(12);
    expect(st.enemy.mon.isElite).toBe(false);
    battle.advanceUntilSettled();

    // Spam Vine Whip (move 0, Grass vs Fire 0.5x resisted) until battle ends
    for (let turn = 0; turn < 12 && battle.getState().phase === 'command'; turn++) {
      battle.performMove('vine_whip');
      battle.advanceUntilSettled();
    }
    expect(battle.getState().phase).toBe('defeat');
  });

  it('COMBAT-02, COMBAT-03, COMBAT-05: animates Poké Ball capture 0..1 (both catch and breakout), floating damage callouts, smooth displayedHp & monotonic cameraCueSeq', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const battle = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));

    battle.startEncounter({
      biomeId: 'forest',
      tier: 'wild',
      forceSpeciesId: 10,
      forceOfflineRig: true,
      battlePace: 'classic',
    });
    battle.advanceUntilSettled();

    const seqBefore = battle.getState().cameraCueSeq;
    const moveId = battle.getState().player.mon.moves[0].id;
    battle.performMove(moveId);

    // Step through windup into impact beat -> verify floating texts, cameraCueSeq increment & gradual displayedHp drain
    let sawFloatingDamage = false;
    let sawGradualHpDrain = false;
    for (let i = 0; i < 60; i++) {
      battle.update(0.03);
      const st = battle.getState();
      if (st.floatingTexts.some((ft) => ft.text.startsWith('-'))) {
        sawFloatingDamage = true;
      }
      if (
        Math.abs(st.enemy.displayedHp - st.enemy.mon.hp) > 0.2
        || Math.abs(st.player.displayedHp - st.player.mon.hp) > 0.2
      ) {
        sawGradualHpDrain = true;
      }
    }
    expect(sawFloatingDamage).toBe(true);
    expect(sawGradualHpDrain).toBe(true);
    expect(battle.getState().cameraCueSeq).toBeGreaterThan(seqBefore);
    battle.advanceUntilSettled();

    // Test Poké Ball breakout animation: enters 'capturing', sweeps captureProgress 0..0.88, resets to 0 on breakout, then enemy counter-attacks
    const missCatchSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    battle.throwBall('poke');
    expect(battle.getState().phase).toBe('capturing');
    expect(battle.getState().enemy.captureProgress).toBe(0);
    let maxCaptureProgress = 0;
    let sawBreakoutFloating = false;
    for (let i = 0; i < 120; i++) {
      battle.update(0.03);
      const st = battle.getState();
      if (st.phase === 'capturing' && st.enemy.captureProgress > maxCaptureProgress) {
        maxCaptureProgress = st.enemy.captureProgress;
      }
      if (st.floatingTexts.some((ft) => ft.text === 'BROKE FREE!')) {
        sawBreakoutFloating = true;
      }
    }
    missCatchSpy.mockRestore();
    expect(maxCaptureProgress).toBeGreaterThan(0.5);
    expect(sawBreakoutFloating).toBe(true);
    battle.advanceUntilSettled();
    expect(battle.getState().enemy.captureProgress).toBe(0);
  });

  it('COMBAT-07, COMBAT-08, COMBAT-09 & GAMEPLAY-02: Struggle beats Ghost 0x immunity, turn-end abilities skip Potion, ability metadata preserved, and 0-HP lead heals on encounter start', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const profile = bridge.manager.getActiveProfile();

    // COMBAT-09: Ability metadata preserves drainRatio & counterBoostStat
    const abilities = getAllAbilities();
    const siphon = abilities.find((a) => a.id === 'nectar_siphon');
    const mirage = abilities.find((a) => a.id === 'phantom_mirage');
    expect(siphon?.drainRatio).toBeGreaterThan(0);
    expect(mirage?.counterBoostStat).toBe('spd');

    // GAMEPLAY-02: Even if lead starts at 0 HP, startEncounter restores healthy lead cleanly
    profile.team[0].hp = 0;
    const battle = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));
    battle.startEncounter({ biomeId: 'cave', tier: 'wild', forceSpeciesId: 92, forceOfflineRig: true, battlePace: 'fast' }); // Gastly (Ghost)
    expect(profile.team[0].hp).toBeGreaterThan(0);
    battle.advanceUntilSettled();

    // COMBAT-07: Struggle vs Ghost deals >= 2 damage (not immune 0 / 1)
    for (const mv of profile.team[0].getMoveObjects()) {
      profile.team[0].movePp[mv.id] = 0;
    }
    const gastlyHpBefore = battle.getState().enemy.mon.hp;
    battle.performMove('struggle');
    battle.advanceUntilSettled();
    expect(gastlyHpBefore - battle.getState().enemy.mon.hp).toBeGreaterThanOrEqual(2);

    // COMBAT-08: Turn-end ability (Starlight Grace on Eevee #133) does NOT proc on Potion turn
    const eevee = createPokemon(133, 8, 'forest');
    eevee.hp = Math.max(1, eevee.maxHp - 25);
    profile.team = [eevee];
    const battle2 = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));
    battle2.startEncounter({ biomeId: 'forest', tier: 'wild', forceSpeciesId: 10, forceOfflineRig: true, battlePace: 'fast' });
    battle2.advanceUntilSettled();
    const outPot = battle2.usePotion();
    const outPotRest = battle2.advanceUntilSettled();
    const allAb = [...(outPot.abilitySfx ?? []), ...(outPotRest.abilitySfx ?? [])];
    expect(allAb.some((a) => a.abilityId === 'starlight_grace')).toBe(false);
  });
});

describe('Combat & Encounter Deep Audit Regression Suite', () => {
  it('preserves post-battle wild encounter cooldown across syncFromProfile and resets streak on non-encounter tiles', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const profile = bridge.manager.getActiveProfile();
    const ow = new DojoOverworldSim(bridge, new SpriteAssetLoader({ forceOffline: true }));

    // Find a pair of adjacent walkable TALL_GRASS tiles in Whispering Forest
    let grassRow = -1;
    let grassStartX = -1;
    outer: for (let y = 1; y < WORLD_ROWS - 1; y++) {
      for (let x = 1; x < WORLD_COLS - 2; x++) {
        if (
          WORLD_MAP[y][x] === TILE.TALL_GRASS
          && isTileWalkableAt(x, y)
          && WORLD_MAP[y][x + 1] === TILE.TALL_GRASS
          && isTileWalkableAt(x + 1, y)
        ) {
          grassRow = y;
          grassStartX = x;
          break outer;
        }
      }
    }
    expect(grassRow).toBeGreaterThan(0);

    profile.pos = { x: grassStartX, y: grassRow, dir: 'right' };
    ow.applyPostBattleCooldown();
    ow.syncFromProfile({ preserveEncounterPacing: true });

    // First 4 tall-grass steps after battle MUST NOT ambush even with random=0.001
    const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.001);
    for (let step = 1; step <= 4; step++) {
      const dx = step % 2 === 1 ? 1 : -1;
      const ev = ow.stepDirection(dx, 0);
      expect(ev.moved).toBe(true);
      expect(ev.onGrass).toBe(true);
      expect(ev.wildEncounterTriggered, `Unexpected ambush on post-battle step ${step}`).toBeUndefined();
    }
    // Step 5 reaches minStepsBetweenWilds (5) and can trigger cleanly
    const fifthEv = ow.stepDirection(1, 0);
    randSpy.mockRestore();
    expect(fifthEv.moved).toBe(true);
    expect(fifthEv.wildEncounterTriggered?.biomeId).toBe('forest');

    // Stepping off an encounter tile onto a non-encounter tile must reset wildStreak
    let edgeX = -1;
    let edgeY = -1;
    edgeSearch: for (let y = 1; y < WORLD_ROWS - 1; y++) {
      for (let x = 2; x < WORLD_COLS - 2; x++) {
        if (
          WORLD_MAP[y][x] === TILE.TALL_GRASS
          && isTileWalkableAt(x, y)
          && WORLD_MAP[y][x + 1] === TILE.GRASS
          && isTileWalkableAt(x + 1, y)
          && WORLD_MAP[y][x - 1] === TILE.TALL_GRASS
          && isTileWalkableAt(x - 1, y)
        ) {
          edgeX = x;
          edgeY = y;
          break edgeSearch;
        }
      }
    }
    expect(edgeX).toBeGreaterThan(0);
    profile.pos = { x: edgeX - 1, y: edgeY, dir: 'right' };
    ow.syncFromProfile();
    const highRand = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // Build streak on tall grass (oscillate without triggering because random=0.99)
    for (let i = 0; i < 6; i++) {
      const dx = i % 2 === 0 ? 1 : -1;
      const ev = ow.stepDirection(dx, 0);
      expect(ev.wildEncounterTriggered).toBeUndefined();
    }
    // Now at edgeX-1 -> step right to edgeX (tall grass, streak=7) -> step right to edgeX+1 (plain GRASS, resets streak!)
    expect(ow.stepDirection(1, 0).wildEncounterTriggered).toBeUndefined();
    const offGrass = ow.stepDirection(1, 0);
    expect(offGrass.onGrass).toBe(false);
    // Step back onto tall grass: because streak was reset to 0, random=0.99 must NOT force guaranteed encounter
    const backOnGrass = ow.stepDirection(-1, 0);
    highRand.mockRestore();
    expect(backOnGrass.onGrass).toBe(true);
    expect(backOnGrass.wildEncounterTriggered).toBeUndefined();
  });

  it('keeps HP at 0 on Defeat screen until closeBattle(), then heals team and recalls to Starlight Village (8,15)', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const profile = bridge.manager.getActiveProfile();
    profile.pos = { x: 50, y: 20, dir: 'down' };

    const battle = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));
    battle.startEncounter({
      biomeId: 'volcano',
      tier: 'shrine',
      shrineId: 'volcano_shrine',
      forceOfflineRig: true,
      battlePace: 'fast',
    });
    battle.advanceUntilSettled();

    for (let turn = 0; turn < 12 && battle.getState().phase === 'command'; turn++) {
      battle.performMove('vine_whip');
      battle.advanceUntilSettled();
    }

    const defeatState = battle.getState();
    expect(defeatState.phase).toBe('defeat');
    // HP must remain 0 on Defeat screen (never snapping/refilling to maxHp while fainted!)
    expect(defeatState.player.mon.hp).toBe(0);
    expect(defeatState.player.displayedHp).toBe(0);
    expect(defeatState.player.faintDrop).toBe(1);
    expect(profile.team[0].hp).toBe(0);

    // Closing the Defeat screen heals the team and recalls cleanly to Starlight Village spawn (8,15)
    battle.closeBattle();
    expect(profile.team[0].hp).toBe(profile.team[0].maxHp);
    expect(profile.pos.x).toBe(8);
    expect(profile.pos.y).toBe(15);
  });

  it('keeps caught wild Pokémon hidden on Victory, resets stale battle buffs, and preserves Gotcha destination for Team & Storage Box', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const profile = bridge.manager.getActiveProfile();
    profile.bag.starBalls = 5;

    const battle = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));
    battle.startEncounter({ biomeId: 'forest', tier: 'wild', forceSpeciesId: 10, forceOfflineRig: true, battlePace: 'fast' });
    battle.advanceUntilSettled();

    // Give the wild Caterpie active combat buffs & shield before catching
    const internal = battle as unknown as { enemyParty: Array<{ battleStages: { atk: number; def: number; spd: number }; shieldTurns: number }> };
    internal.enemyParty[0].battleStages.atk = 2;
    internal.enemyParty[0].shieldTurns = 2;

    const catchSpy = vi.spyOn(Math, 'random').mockReturnValue(0.001);
    battle.throwBall('star');
    battle.advanceUntilSettled();
    catchSpy.mockRestore();

    const teamCatchState = battle.getState();
    expect(teamCatchState.phase).toBe('victory');
    expect(teamCatchState.rewardSummary?.caught).toBe(true);
    expect(teamCatchState.enemy.captureProgress).toBe(1);
    expect(teamCatchState.enemy.faintDrop).toBe(1);
    expect(teamCatchState.statusMessage).toContain('Gotcha!');
    expect(teamCatchState.statusMessage).toContain('team');
    expect(profile.team.length).toBe(2);
    expect(profile.team[1].battleStages.atk).toBe(0);
    expect(profile.team[1].shieldTurns).toBe(0);

    // Fill remaining party slots to 6 and verify 7th catch routes to Storage Box
    while (profile.team.length < 6) {
      profile.team.push(createPokemon(16, 5, 'forest'));
    }
    battle.startEncounter({ biomeId: 'forest', tier: 'wild', forceSpeciesId: 19, forceOfflineRig: true, battlePace: 'fast' });
    battle.advanceUntilSettled();
    const boxSpy = vi.spyOn(Math, 'random').mockReturnValue(0.001);
    battle.throwBall('star');
    battle.advanceUntilSettled();
    boxSpy.mockRestore();

    expect(profile.team.length).toBe(6);
    expect(profile.box.length).toBe(1);
    expect(profile.box[0].speciesId).toBe(19);
    expect(battle.getState().statusMessage).toContain('Gotcha!');
    expect(battle.getState().statusMessage).toContain('Storage Box');
  });

  it('handles full-HP heal move narration, voluntary switch enemy counter-attack, evolution ceremony, and Apex trait damage', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const profile = bridge.manager.getActiveProfile();
    const lead = profile.team[0];
    const mate = createPokemon(25, 8, 'forest');
    profile.team.push(mate);

    const battle = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));
    battle.startEncounter({ biomeId: 'forest', tier: 'wild', forceSpeciesId: 10, forceOfflineRig: true, battlePace: 'fast' });
    battle.advanceUntilSettled();

    // Voluntary switch consumes turn so enemy counter-attacks
    const swInit = battle.switchTeamMember(1);
    const swRest = battle.advanceUntilSettled();
    expect(battle.getState().player.mon.speciesId).toBe(25);
    expect(
      swInit.vfxEvents.filter((e) => e.fromSide === 'enemy').length
      + swRest.vfxEvents.filter((e) => e.fromSide === 'enemy').length,
    ).toBeGreaterThanOrEqual(1);

    // Full-HP Synthesis logs "already full" cleanly when Bulbasaur is healthy
    battle.closeBattle();
    lead.healFull();
    profile.team = [lead];
    battle.startEncounter({ biomeId: 'forest', tier: 'wild', forceSpeciesId: 10, forceOfflineRig: true, battlePace: 'fast' });
    battle.advanceUntilSettled();
    const synthSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    battle.performMove('synthesis');
    battle.advanceUntilSettled();
    synthSpy.mockRestore();
    expect(battle.getState().battleLog.some((l) => l.includes('HP is already full'))).toBe(true);

    // Evolution ceremony on level-up past Lv.16 (Bulbasaur -> Ivysaur) using type-advantaged Vine Whip vs Squirtle
    battle.closeBattle();
    lead.level = 15;
    lead.recalculateStats();
    lead.healFull();
    lead.xp = lead.xpToNext - 1;
    battle.startEncounter({ biomeId: 'water', tier: 'wild', forceSpeciesId: 7, forceOfflineRig: true, battlePace: 'fast' });
    battle.advanceUntilSettled();
    for (let t = 0; t < 8 && battle.getState().phase === 'command'; t++) {
      battle.performMove('vine_whip');
      battle.advanceUntilSettled();
    }
    expect(battle.getState().phase).toBe('evolving');
    expect(battle.getState().evolutionTarget?.toId).toBe(2);
    const evoOut = battle.confirmEvolution();
    expect(evoOut.sfx).toContain('evolve');
    expect(battle.getState().phase).toBe('victory');
    expect(lead.speciesId).toBe(2);
    expect(battle.getState().player.mon.speciesId).toBe(2);
    expect(battle.getState().statusMessage).toContain('Ivysaur');

    // Apex encounter trait damage parity: Apex wild mon deals strictly higher damage when applyEncounterTraits is enabled
    const normalWild = createPokemon(19, 12, 'forest', { encounterTrait: null });
    const apexWild = createPokemon(19, 12, 'forest', { encounterTrait: 'apex' });
    const defender = createPokemon(1, 12, 'forest');
    const tackle = normalWild.getMoveObjects()[0];
    const baseDmg = calculateDamage(normalWild, defender, tackle, {
      applyAbilities: false,
      applyComposure: false,
      applyEncounterTraits: true,
      forceHit: true,
      forceCrit: false,
      fixedVariance: 1.0,
    }).damage;
    const apexDmg = calculateDamage(apexWild, defender, tackle, {
      applyAbilities: false,
      applyComposure: false,
      applyEncounterTraits: true,
      forceHit: true,
      forceCrit: false,
      fixedVariance: 1.0,
    }).damage;
    expect(apexDmg).toBeGreaterThan(baseDmg);
  });

  it('addresses playtester #9: Nidoran (F)/(M) distinction, readable cinema pacing with finished HP drain, clean Victory/Defeat popups & trail drop labels', () => {
    // Nidoran gender distinction without violating zero-emoji DOM invariants
    expect(getSpeciesEntry(29).name).toBe('Nidoran (F)');
    expect(getSpeciesEntry(32).name).toBe('Nidoran (M)');
    expect(containsEmoji(getSpeciesEntry(29).name)).toBe(false);
    expect(containsEmoji(getSpeciesEntry(32).name)).toBe(false);

    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const profile = bridge.manager.getActiveProfile();
    const battle = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));

    // Cinema turn pacing: readable announce + impact + post-turn holds, and displayedHp fully drained when Turn 2 unlocks
    battle.startEncounter({ biomeId: 'forest', tier: 'wild', forceSpeciesId: 29, forceOfflineRig: true, battlePace: 'cinema' });
    battle.advanceUntilSettled();
    expect(battle.getState().enemy.mon.displayName).toBe('Nidoran (F)');

    battle.performMove('tackle');
    let elapsed = 0;
    while (battle.getState().phase !== 'command' && elapsed < 10) {
      battle.update(0.04);
      elapsed += 0.04;
    }
    expect(elapsed).toBeGreaterThanOrEqual(2.2);
    expect(battle.getState().phase).toBe('command');
    expect(battle.getState().player.displayedHp).toBe(battle.getState().player.mon.hp);
    expect(battle.getState().enemy.displayedHp).toBe(battle.getState().enemy.mon.hp);

    // Victory clears stale damage popups & formats trail drops cleanly without leading "a "
    profile.team[0].level = 20;
    profile.team[0].recalculateStats();
    profile.team[0].healFull();
    const dropSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    for (let t = 0; t < 6 && battle.getState().phase === 'command'; t++) {
      battle.performMove('vine_whip');
      battle.advanceUntilSettled();
    }
    dropSpy.mockRestore();
    const winSt = battle.getState();
    expect(['victory', 'evolving']).toContain(winSt.phase);
    expect(winSt.floatingTexts.some((ft) => ft.text.startsWith('-'))).toBe(false);
    expect(winSt.player.abilityBanner).toBeNull();
    expect(winSt.enemy.abilityBanner).toBeNull();
    if (winSt.rewardSummary?.trailDrop) {
      expect(winSt.rewardSummary.trailDrop.startsWith('a ')).toBe(false);
    }

    // Wild AI must not infinitely spam Shield moves once DEF stage >= 2
    battle.closeBattle();
    battle.startEncounter({ biomeId: 'forest', tier: 'wild', forceSpeciesId: 152, forceOfflineRig: true, battlePace: 'fast' }); // Chikorita (has Petal Guard shield)
    battle.advanceUntilSettled();
    const chikoInternal = battle as unknown as {
      enemyParty: Array<{ battleStages: { def: number }; shieldTurns: number }>;
      chooseEnemyMove: (mon: unknown) => string;
    };
    chikoInternal.enemyParty[0].battleStages.def = 2;
    chikoInternal.enemyParty[0].shieldTurns = 0;
    for (let i = 0; i < 12; i++) {
      expect(chikoInternal.chooseEnemyMove(chikoInternal.enemyParty[0])).not.toBe('petal_guard');
    }
  });
});

describe('V1 Core Parity Deep Fixes (Battle, Sky-Hop, Audio & Save Hydrator)', () => {
  it('enforces Astral Shrine Trial moveIds without non-V1 apex trait, single +1 Cheer Heart on catch, Bond-before-XP, and bench/catch level-up SFX', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1); // Bulbasaur Lv.5
    const profile = bridge.manager.getActiveProfile();

    // 1. Astral Shrine Trial: uses trial.moveIds + isElite=true and NEVER encounterTrait='apex'
    const forestShrine = Object.values(SHRINES).find((s) => s.id === 'forest_shrine')!;
    const expectedTrial = getScaledShrineTrial(forestShrine, profile) as ReturnType<typeof getScaledShrineTrial> & {
      moveIds?: string[];
    };
    const battle = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));
    const trialState = battle.startEncounter({
      biomeId: 'forest',
      tier: 'shrine-trial',
      shrineId: 'forest_shrine',
      forceOfflineRig: true,
      battlePace: 'fast',
    });
    expect(trialState.enemy.mon.isElite).toBe(true);
    expect(trialState.enemy.mon.encounterTrait).toBeNull();
    if (Array.isArray(expectedTrial.moveIds) && expectedTrial.moveIds.length > 0) {
      expect(trialState.enemy.mon.moves.map((m) => m.id)).toEqual(expectedTrial.moveIds.slice(0, 4));
    }

    // 2. Single +1 Cheer Heart on catch (never double-awarded +2!) + level-up SFX on catch!
    battle.closeBattle();
    profile.bag.cheerCharges = 0;
    profile.bag.starBalls = 3;
    const lead = profile.team[0];
    lead.xp = lead.xpToNext - 1; // guaranteed level-up on catch XP
    battle.startEncounter({ biomeId: 'forest', tier: 'wild', forceSpeciesId: 10, forceOfflineRig: true, battlePace: 'fast' });
    battle.advanceUntilSettled();
    const catchSpy = vi.spyOn(Math, 'random').mockReturnValue(0.001);
    const out1 = battle.throwBall('star');
    const out2 = battle.advanceUntilSettled();
    catchSpy.mockRestore();

    expect(profile.bag.cheerCharges).toBe(1);
    expect([...out1.sfx, ...out2.sfx]).toContain('level-up');
  });

  it('resolves Buddy Endure BEFORE defensive counter-boost so a 1-HP enduring partner still triggers its counter-boost', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const profile = bridge.manager.getActiveProfile();

    // Pick a species with phantom_mirage (triggers on psychic/rock/normal -> SPD +1) & bond 90
    const mirageSpecies = getAllSpecies().find((sp) => sp.ability === 'phantom_mirage');
    expect(mirageSpecies).toBeDefined();

    const ghostMon = createPokemon(mirageSpecies!.id, 5, 'cave');
    ghostMon.bond = 90;
    ghostMon.hp = 2; // > 1 so Buddy Endure can trigger, low enough to be KO'd by Psychic
    profile.team = [ghostMon];

    const battle = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));
    battle.startEncounter({ biomeId: 'sanctum', tier: 'wild', forceSpeciesId: 150, forceOfflineRig: true, battlePace: 'fast' });
    // Ensure foe attacks with a Psychic move (which triggers phantom_mirage & deals lethal dmg to 2-HP Ghost)
    const internalBattle = battle as unknown as {
      enemyParty: Array<{ level: number; recalculateStats: () => void; healFull: () => void; moveIds: string[] }>;
    };
    internalBattle.enemyParty[0].level = 20;
    internalBattle.enemyParty[0].recalculateStats();
    internalBattle.enemyParty[0].healFull();
    internalBattle.enemyParty[0].moveIds = ['psychic'];
    battle.advanceUntilSettled();

    // Force random=0.01 so Buddy Endure triggers (endureChance 0.25 at bond 90)
    const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const init = battle.performMove(battle.getState().player.mon.moves[0].id);
    const rest = battle.advanceUntilSettled();
    randSpy.mockRestore();

    // Partner endured at 1 HP AND gained its phantom_mirage defensive SPD counter-boost!
    expect(ghostMon.hp).toBe(1);
    expect(ghostMon.battleStages.spd).toBeGreaterThanOrEqual(1);
    expect([...init.sfx, ...rest.sfx]).toContain('endure');
  });

  it('matches V1 Sky-Hop unlock gate, anti-repeat shuffled wave deck, non-repeating sky palette, Wave 2-5 escalation spawns, tap-to-glide release, and particles', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const profile = bridge.manager.getActiveProfile();

    const sky = new DojoSkyHopController(bridge, new SpriteAssetLoader({ forceOffline: true }));
    // 1. Locked cabinet refuses startNewRun even if charges > 0
    profile.arcade.unlocked = false;
    profile.arcade.charges = 3;
    expect(sky.startNewRun()).toBe(false);
    expect(sky.getState().running).toBe(false);
    expect(sky.getState().outOfCharges).toBe(true);

    // 2. Unlock & run back-to-back runs -> opening wave ID and sky palette never repeat consecutively!
    sky.open({ forceUnlock: true });
    profile.arcade.charges = 3;
    expect(sky.startNewRun()).toBe(true);
    const diag1 = sky.getWaveDeckDiagnostics();
    expect(sky.getState().particles.length).toBeGreaterThan(0); // wave fanfare particles spawned

    // 3. Tap-to-glide: releasing pointer (null) preserves glide target until partner arrives within 3px
    const startY = sky.getState().playerY;
    sky.setPointerNormY(0.2);
    sky.setPointerNormY(null);
    for (let i = 0; i < 40; i++) {
      sky.update(0.03);
    }
    expect(sky.getState().playerY).toBeLessThan(startY - 30);

    // 4. Second run picks fresh opening wave & non-repeating sky offset
    expect(sky.startNewRun()).toBe(true);
    const diag2 = sky.getWaveDeckDiagnostics();
    expect(diag2.lastOpeningWaveId).not.toBe(diag1.lastOpeningWaveId);
    expect(diag2.runSkyOffset).not.toBe(diag1.runSkyOffset);

    // 5. Wave escalation spawns: Wave 2 storm_orb, Wave 3 void_meteor, Wave 4 Cloud Gate, Wave 5 heart
    const internal = sky as unknown as {
      beginWave: (n: number) => void;
      pendingSpawns: Array<{ kind: string; yFrac: number }>;
    };
    internal.beginWave(2);
    expect(internal.pendingSpawns.some((s) => s.kind === 'storm_orb')).toBe(true);
    internal.beginWave(4);
    expect(internal.pendingSpawns.filter((s) => s.kind === 'cloud').length).toBeGreaterThanOrEqual(2);
    expect(internal.pendingSpawns.some((s) => s.kind === 'bigstar' && s.yFrac === 0.5)).toBe(true);
    internal.beginWave(6);
    expect(internal.pendingSpawns.filter((s) => s.kind === 'void_meteor').length).toBeGreaterThanOrEqual(2);
    sky.getState().hearts = 1;
    internal.beginWave(5);
    expect(internal.pendingSpawns.some((s) => s.kind === 'heart')).toBe(true);
  });

  it('exposes full V1 audio SFX wrappers & SaveHydrator activeTrainer fallback + export/import round-trip', () => {
    const audio = new StarlightAudioController();
    const internalAudio = audio as unknown as {
      engine: {
        playHoldTick: ReturnType<typeof vi.fn>;
        playCursorMove: ReturnType<typeof vi.fn>;
        playXpTick: ReturnType<typeof vi.fn>;
        playWarpTeleport: ReturnType<typeof vi.fn>;
        playSafeRecall: ReturnType<typeof vi.fn>;
        playWindup: ReturnType<typeof vi.fn>;
      };
    };
    internalAudio.engine.playHoldTick = vi.fn();
    internalAudio.engine.playCursorMove = vi.fn();
    internalAudio.engine.playXpTick = vi.fn();
    internalAudio.engine.playWarpTeleport = vi.fn();
    internalAudio.engine.playSafeRecall = vi.fn();
    internalAudio.engine.playWindup = vi.fn();

    audio.playHoldTick(0.6);
    audio.playCursorMove();
    audio.playXpTick(0.75);
    audio.playWarpTeleport({ phase: 'depart' });
    audio.playSafeRecall({ phase: 'full' });
    audio.playWindup('fire');

    expect(internalAudio.engine.playHoldTick).toHaveBeenCalledWith(0.6);
    expect(internalAudio.engine.playCursorMove).toHaveBeenCalledTimes(1);
    expect(internalAudio.engine.playXpTick).toHaveBeenCalledWith(0.75);
    expect(internalAudio.engine.playWarpTeleport).toHaveBeenCalledWith({ phase: 'depart' });
    expect(internalAudio.engine.playSafeRecall).toHaveBeenCalledWith({ phase: 'full' });
    expect(internalAudio.engine.playWindup).toHaveBeenCalledWith('fire');
    expect(audio.getMasterVolume()).toBe(0.65);

    // Save export/import + legacy activeTrainer fallback
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('ozias');
    bridge.manager.chooseStarter(4);
    const exported = bridge.exportSaveJSON();

    const bridge2 = new StarlightStorageBridge(createDefaultSaveState());
    const legacyShaped = JSON.parse(exported);
    delete legacyShaped.activeTrainerId;
    legacyShaped.activeTrainer = 'ozias';
    const imported = bridge2.importSaveJSON(JSON.stringify(legacyShaped));
    expect(imported.ok).toBe(true);
    expect(bridge2.toV3SaveState().activeTrainerId).toBe('ozias');
    expect(bridge2.toV3SaveState().profiles.ozias.starterId).toBe(4);
  });
});
