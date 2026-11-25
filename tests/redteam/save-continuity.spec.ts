import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

const CANONICAL_BIOMES = new Set([
  'village',
  'forest',
  'cave',
  'water',
  'volcano',
  'peak',
  'grove',
  'desert',
  'marsh',
  'sanctum',
  'canyon',
  'reef',
  'ruins',
  'rift',
  'faeveldt',
  'atoll',
  'highlands',
  'crater',
]);

const VALID_STYLES = new Set([
  'default',
  'royal',
  'aurora',
  'ember',
  'ranger',
  'nebula',
  'solstice',
  'twilight',
  'celestial',
  'sakura',
]);

const VALID_ACCESSORIES = new Set([
  'cap',
  'crown',
  'wizard',
  'headband',
  'goggles',
  'halo',
  'visor',
  'antlers',
]);

const VALID_AURAS = new Set(['none', 'stars', 'hearts', 'lightning', 'blossom', 'cosmic']);

/** Valid deterministic 2-frame 2x2 GIF89a with per-frame delays */
const STUB_TWO_FRAME_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
  0x02, 0x00, 0x02, 0x00, 0x80, 0x00, 0x00,
  0xff, 0x00, 0x00, 0x00, 0x00, 0xff,
  0x21, 0xf9, 0x04, 0x04, 0x0c, 0x00, 0x00, 0x00,
  0x2c, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00,
  0x02, 0x03, 0x04, 0x00, 0x50, 0x00,
  0x21, 0xf9, 0x04, 0x04, 0x0f, 0x00, 0x00, 0x00,
  0x2c, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00,
  0x02, 0x03, 0x0c, 0x91, 0x50, 0x00,
  0x3b,
]);

type FulfillBody = NonNullable<Parameters<Route['fulfill']>[0]>['body'];

function toFulfillBody(bytes: Uint8Array): FulfillBody {
  const NodeBuffer = (globalThis as unknown as { Buffer: { from(data: Uint8Array): FulfillBody } }).Buffer;
  return NodeBuffer.from(bytes);
}

const stubbedContexts = new WeakSet<BrowserContext>();

async function stubExternalSpriteCdns(page: Page): Promise<void> {
  const ctx = page.context();
  if (stubbedContexts.has(ctx)) return;
  stubbedContexts.add(ctx);
  const body = toFulfillBody(STUB_TWO_FRAME_GIF);
  const handler = async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/gif',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body,
    });
  };
  await ctx.route('https://raw.githubusercontent.com/**', handler);
  await ctx.route('https://play.pokemonshowdown.com/**', handler);
}

function attachErrorCollector(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  return { consoleErrors, pageErrors };
}

async function waitForAppBoot(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__STARLIGHT_DEBUG__), undefined, {
    timeout: 20_000,
  });
  await expect(page.getByTestId('celestial-ui-shell')).toBeVisible();
}

function buildAuthenticDojoV1Payload() {
  return {
    version: 2,
    activeTrainerId: 'violet',
    settings: {
      muted: false,
      crtEnabled: true,
      showTouchPad: 'auto',
      battlePace: 'cinema',
    },
    profiles: {
      violet: {
        trainerId: 'violet',
        starterId: 7,
        pos: { x: 39, y: 11, dir: 'up' },
        appearance: {
          styleId: 'celestial',
          accessory: 'crown',
          cape: true,
          aura: 'cosmic',
        },
        team: [
          {
            uid: 'dojo-v-blastoise',
            speciesId: 9,
            level: 36,
            xp: 120,
            hp: 118,
            caughtBiome: 'village',
            isShiny: true,
            nickname: 'Splashy',
            bond: 100,
            upgradeTier: 4,
          },
          {
            uid: 'dojo-v-pikachu',
            speciesId: 25,
            level: 30,
            xp: 45,
            hp: 78,
            caughtBiome: 'forest',
            isShiny: false,
            nickname: null,
            bond: 85,
            upgradeTier: 3,
          },
        ],
        box: [
          {
            uid: 'dojo-v-pecharunt',
            speciesId: 1025,
            level: 42,
            xp: 0,
            hp: 130,
            caughtBiome: 'crater',
            isShiny: false,
            nickname: null,
            bond: 60,
            upgradeTier: 2,
          },
        ],
        pokedex: {
          seen: [7, 8, 9, 25, 150, 1025],
          caught: { 7: 1, 8: 1, 9: 1, 25: 2, 1025: 1 },
        },
        badges: ['forest', 'water', 'volcano', 'starlight'],
        shrinesCleared: ['forest', 'water'],
        chestsOpened: ['c_forest_1', 'c_water_1'],
        bag: {
          potions: 11,
          greatBalls: 7,
          starBalls: 4,
          starShards: 18,
          cheerCharges: 2,
          gems: { water_gem: 2, fire_gem: 1 },
        },
        arcade: {
          unlocked: true,
          charges: 3,
          highScore: 640,
          plays: 4,
          bestWave: 5,
          secretKnocks: 3,
        },
      },
      ozias: {
        trainerId: 'ozias',
        starterId: 4,
        pos: { x: 47, y: 23, dir: 'down' },
        appearance: {
          styleId: 'ember',
          accessory: 'goggles',
          cape: false,
          aura: 'lightning',
        },
        team: [
          {
            uid: 'dojo-o-charizard',
            speciesId: 6,
            level: 34,
            xp: 80,
            hp: 110,
            caughtBiome: 'village',
            isShiny: false,
            nickname: 'Cinder',
            bond: 92,
            upgradeTier: 3,
          },
        ],
        box: [],
        pokedex: {
          seen: [4, 5, 6, 471],
          caught: { 4: 1, 5: 1, 6: 1, 471: 1 },
        },
        badges: ['volcano', 'peak'],
        bag: {
          potions: 6,
          greatBalls: 5,
          starBalls: 2,
          starShards: 9,
          cheerCharges: 1,
        },
      },
    },
  };
}

function buildPreOverhaulV2DemoPayload() {
  return {
    schemaVersion: 2,
    activeSlot: 'slot0',
    profiles: {
      slot0: {
        name: 'Lyra',
        biomeId: 'meadow',
        party: [{ speciesId: 25, level: 28, bond: 100, starRank: 5 }],
        badges: ['badge-electric'],
      },
      slot1: {
        name: 'Orion',
        biomeId: 'frost-glacier',
        party: [{ speciesId: 133, level: 26, bond: 80, starRank: 3 }],
        badges: ['badge-ice'],
      },
    },
  };
}

function buildLegacyIslandSavePayload() {
  return {
    version: 1,
    activeSlot: 'slot0',
    profiles: {
      slot0: {
        name: 'Aether',
        pos: { x: 15, y: 31, dir: 'down' },
        party: [
          {
            uid: 'legacy-aether-pikachu',
            speciesId: 25,
            level: 36,
            hp: 92,
            bond: 100,
            starRank: 5,
            shiny: false,
          },
          {
            uid: 'legacy-aether-charizard',
            speciesId: 6,
            level: 40,
            hp: 118,
            bond: 91,
            starRank: 4,
            shiny: false,
          },
        ],
        pokedex: {
          1: { seen: true, caught: true },
          6: { seen: true, caught: true },
          25: { seen: true, caught: true },
          384: { seen: true, caught: false },
          1025: { seen: true, caught: true },
        },
        badges: ['forest', 'water', 'volcano'],
        style: {
          outfit: 'astral-robe',
          cape: 'cinder-cloak',
          headgear: 'sky-goggles',
          aura: 'sky-thunder',
        },
        inventory: {
          pokeBalls: 19,
          starBalls: 11,
          potions: 7,
          starShards: 34,
        },
        skyHopHighScore: 1240,
      },
      slot1: {
        name: 'Vesper',
        pos: { x: 47, y: 23, dir: 'left' },
        party: [
          {
            uid: 'legacy-vesper-glaceon',
            speciesId: 471,
            level: 31,
            hp: 88,
            bond: 86,
            starRank: 4,
          },
        ],
        pokedex: {
          471: { seen: true, caught: true },
          1025: true,
        },
        badges: ['peak', 'sanctum'],
        style: {
          outfit: 'aegis-jacket',
          cape: 'prism-shawl',
          headgear: 'lunar-circlet',
          aura: 'aurora',
        },
        skyHopHighScore: 810,
      },
    },
  };
}

test.describe('Red-Team: schemaVersion 3 Save Continuity, Precedence & Fuzzing', () => {
  test('authentic starlight_pokemon_save_v1 (Violet & Ozias) beats pre-overhaul schemaVersion 2 (Lyra/Orion) and stays byte-identical', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await stubExternalSpriteCdns(page);

    const dojoJson = JSON.stringify(buildAuthenticDojoV1Payload());
    const oldDemoV2Json = JSON.stringify(buildPreOverhaulV2DemoPayload());

    await page.addInitScript(
      ({ dojoRaw, oldV2Raw }: { dojoRaw: string; oldV2Raw: string }) => {
        if (!sessionStorage.getItem('__seed_dojo_precedence')) {
          sessionStorage.setItem('__seed_dojo_precedence', '1');
          localStorage.clear();
          localStorage.setItem('starlight_v2_save', oldV2Raw);
          localStorage.setItem('starlight_pokemon_save_v1', dojoRaw);
        }
      },
      { dojoRaw: dojoJson, oldV2Raw: oldDemoV2Json },
    );

    await page.goto('./?renderer=canvas2d');
    await waitForAppBoot(page);

    expect(errors.consoleErrors, `Unexpected console errors: ${errors.consoleErrors.join('; ')}`).toEqual([]);
    expect(errors.pageErrors, `Unexpected page errors: ${errors.pageErrors.join('; ')}`).toEqual([]);

    const state = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(state.hydrationSource).toBe('dojo-v1-migrated');
    expect(state.save.schemaVersion).toBe(3);
    expect(state.save.activeTrainerId).toBe('violet');
    expect(state.save.migratedFromV1?.sourceKey).toBe('starlight_pokemon_save_v1');
    // v2 default CRT policy: crtMode defaults false unless explicitly toggled in v2/v3
    expect(state.save.settings.crtMode).toBe(false);

    // Non-destructive verification: starlight_pokemon_save_v1 MUST remain byte-identical!
    const storedKeys = await page.evaluate(() => ({
      dojoRaw: localStorage.getItem('starlight_pokemon_save_v1'),
      v3Raw: localStorage.getItem('starlight_v2_save'),
    }));
    expect(storedKeys.dojoRaw).toBe(dojoJson);
    expect(storedKeys.v3Raw).toBeTruthy();
    expect(JSON.parse(storedKeys.v3Raw!).schemaVersion).toBe(3);

    // Verify Violet profile hydrated cleanly (NOT Lyra demo save!)
    const violet = state.save.profiles.violet;
    expect(violet.trainerId).toBe('violet');
    expect(violet.starterId).toBe(7);
    expect(violet.team[0].speciesId).toBe(9);
    expect(violet.team[0].nickname).toBe('Splashy');
    expect(violet.team[0].isShiny).toBe(true);
    expect(violet.team[0].upgradeTier).toBe(4);
    expect(violet.team[0].bond).toBe(100);
    expect(violet.box[0]?.speciesId).toBe(1025);
    expect(violet.pokedex.caught[1025]).toBeGreaterThanOrEqual(1);
    expect(violet.badges).toEqual(expect.arrayContaining(['forest', 'water', 'volcano', 'starlight']));
    expect(violet.appearance).toMatchObject({
      styleId: 'celestial',
      accessory: 'crown',
      cape: true,
      aura: 'cosmic',
    });
    expect(violet.bag.starShards).toBe(18);
    expect(violet.bag.greatBalls).toBe(7);
    expect(violet.bag.starBalls).toBe(4);
    expect(violet.bag.cheerCharges).toBe(2);

    // Verify Ozias profile hydrated cleanly (NOT Orion demo save!)
    const ozias = state.save.profiles.ozias;
    expect(ozias.trainerId).toBe('ozias');
    expect(ozias.starterId).toBe(4);
    expect(ozias.team[0].speciesId).toBe(6);
    expect(ozias.team[0].nickname).toBe('Cinder');
    expect(ozias.appearance).toMatchObject({
      styleId: 'ember',
      accessory: 'goggles',
      cape: false,
      aura: 'lightning',
    });

    // Verify Title UI renders hydrated Violet & Ozias cards and enters Overworld at Ember Caldera
    await expect(page.getByTestId('profile-violet-meta')).toContainText('Violet');
    await expect(page.getByTestId('profile-violet')).toContainText('Splashy Lv.36');
    await expect(page.getByTestId('profile-violet')).toContainText('4/28 Badges');
    await expect(page.getByTestId('profile-ozias-meta')).toContainText('Ozias');
    await expect(page.getByTestId('profile-ozias')).toContainText('Cinder Lv.34');

    await page.getByTestId('title-play-violet').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await expect(page.getByTestId('hud-biome-name')).toHaveText('Ember Caldera');

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('migrates legacy starlight_island_save (slot0/slot1) into Violet & Ozias schemaVersion 3 non-destructively', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await stubExternalSpriteCdns(page);

    const legacyRaw = JSON.stringify(buildLegacyIslandSavePayload());
    await page.addInitScript((payloadStr: string) => {
      if (!sessionStorage.getItem('__seed_legacy_island')) {
        sessionStorage.setItem('__seed_legacy_island', '1');
        localStorage.clear();
        localStorage.setItem('starlight_island_save', payloadStr);
      }
    }, legacyRaw);

    await page.goto('./?renderer=canvas2d');
    await waitForAppBoot(page);

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);

    const state = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(state.hydrationSource).toBe('legacy-v1-migrated');
    expect(state.save.schemaVersion).toBe(3);
    expect(state.save.activeTrainerId).toBe('violet');
    expect(state.save.migratedFromV1?.sourceKey).toBe('starlight_island_save');

    // Original legacy key must remain byte-identical
    const storageCheck = await page.evaluate(() => ({
      legacy: localStorage.getItem('starlight_island_save'),
      v3: localStorage.getItem('starlight_v2_save'),
    }));
    expect(storageCheck.legacy).toBe(legacyRaw);
    expect(JSON.parse(storageCheck.v3!).schemaVersion).toBe(3);

    // slot0 -> Violet
    const violet = state.save.profiles.violet;
    expect(violet.appearance).toMatchObject({
      styleId: 'twilight',
      accessory: 'goggles',
      cape: true,
      aura: 'lightning',
      nickname: 'Aether',
    });
    expect(violet.team.map((m) => m.speciesId)).toEqual([25, 6]);
    expect(violet.pokedex.caught[1025]).toBeGreaterThanOrEqual(1);
    expect(violet.pokedex.seen).toContain(384);
    expect(violet.arcade.highScore).toBe(1240);

    // slot1 -> Ozias
    const ozias = state.save.profiles.ozias;
    expect(ozias.appearance).toMatchObject({
      styleId: 'royal',
      accessory: 'crown',
      cape: true,
      aura: 'cosmic',
      nickname: 'Vesper',
    });
    expect(ozias.team[0].speciesId).toBe(471);
    expect(ozias.pokedex.caught[1025]).toBeGreaterThanOrEqual(1);

    await expect(page.getByTestId('profile-violet-meta')).toContainText('Aether');
    await expect(page.getByTestId('profile-ozias-meta')).toContainText('Vesper');

    await page.getByTestId('title-play-violet').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await expect(page.getByTestId('hud-biome-name')).toHaveText('Sapphire Lagoon');

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('recovers cleanly from corrupted starlight_v2_save JSON by falling back to starlight_pokemon_save_v1 or starlight_island_save', async ({
    browser,
  }) => {
    // Subcase A: corrupted starlight_v2_save falls back to authentic starlight_pokemon_save_v1
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = attachErrorCollector(page);
      await stubExternalSpriteCdns(page);

      const dojoRaw = JSON.stringify(buildAuthenticDojoV1Payload());
      await page.addInitScript((raw: string) => {
        localStorage.clear();
        localStorage.setItem('starlight_v2_save', '{"schemaVersion":3, "profiles": { CORRUPTED');
        localStorage.setItem('starlight_pokemon_save_v1', raw);
      }, dojoRaw);

      await page.goto('./?renderer=canvas2d');
      await waitForAppBoot(page);

      expect(errors.consoleErrors).toEqual([]);
      expect(errors.pageErrors).toEqual([]);

      const state = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
      expect(state.hydrationSource).toBe('dojo-v1-migrated');
      expect(state.save.schemaVersion).toBe(3);
      expect(state.save.profiles.violet.team[0].nickname).toBe('Splashy');

      const keys = await page.evaluate(() => ({
        dojo: localStorage.getItem('starlight_pokemon_save_v1'),
        v3: localStorage.getItem('starlight_v2_save'),
      }));
      expect(keys.dojo).toBe(dojoRaw);
      expect(JSON.parse(keys.v3!).schemaVersion).toBe(3);

      await context.close();
    }

    // Subcase B: corrupted starlight_v2_save falls back to legacy starlight_island_save
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = attachErrorCollector(page);
      await stubExternalSpriteCdns(page);

      const legacyFallback = JSON.stringify({
        trainerName: 'Solstice',
        pos: { x: 46, y: 53, dir: 'right' },
        party: [{ speciesId: 25, level: 22, bond: 80 }],
        badges: ['forest', 'sanctum'],
        style: { outfit: 'solstice-tunic', cape: 'zephyr-mantle', aura: 'ember-crown' },
        pokedex: [25, 1008, 1025],
      });

      await page.addInitScript((raw: string) => {
        localStorage.clear();
        localStorage.setItem('starlight_v2_save', '{{{BROKEN_V3_PAYLOAD');
        localStorage.setItem('starlight_island_save', raw);
      }, legacyFallback);

      await page.goto('./?renderer=canvas2d');
      await waitForAppBoot(page);

      expect(errors.consoleErrors).toEqual([]);
      expect(errors.pageErrors).toEqual([]);

      const state = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
      expect(state.hydrationSource).toBe('legacy-v1-migrated');
      expect(state.save.schemaVersion).toBe(3);
      expect(state.save.profiles.violet.appearance.nickname).toBe('Solstice');
      expect(state.save.profiles.violet.appearance.styleId).toBe('solstice');
      expect(state.save.profiles.violet.appearance.aura).toBe('blossom');
      expect(state.save.profiles.violet.pokedex.caught[1025]).toBeGreaterThanOrEqual(1);

      const keys = await page.evaluate(() => ({
        legacy: localStorage.getItem('starlight_island_save'),
        v3: localStorage.getItem('starlight_v2_save'),
      }));
      expect(keys.legacy).toBe(legacyFallback);
      expect(JSON.parse(keys.v3!).schemaVersion).toBe(3);

      await context.close();
    }
  });

  test('survives mangled, primitive, and adversarial out-of-bounds payloads across fuzz cases with repaired valid profiles', async ({
    browser,
  }) => {
    const fuzzCases: Array<{
      label: string;
      v2Value: string | null;
      dojoValue: string | null;
      legacyValue: string | null;
    }> = [
      {
        label: 'invalid JSON in all three storage keys',
        v2Value: '{{{broken-json!!!',
        dojoValue: '<<<corrupt-dojo>>>',
        legacyValue: '][not-json',
      },
      {
        label: 'JSON null, number, and array primitives',
        v2Value: 'null',
        dojoValue: '42',
        legacyValue: '[1, 2, 3]',
      },
      {
        label: 'adversarial out-of-bounds & wrong-type schemaVersion 3 fields',
        v2Value: JSON.stringify({
          schemaVersion: 999,
          activeTrainerId: 'invalid-trainer',
          profiles: {
            violet: {
              trainerId: 'violet',
              starterId: 999999,
              pos: { x: -999, y: 99999, dir: 'diagonal' },
              appearance: {
                styleId: 'nonexistent-style',
                accessory: 'invalid-hat',
                cape: 'yes',
                aura: 'nuclear-glow',
                nickname: '   ',
              },
              team: [
                null,
                'not-a-pokemon',
                {
                  speciesId: 999999,
                  level: -50,
                  hp: -10,
                  bond: 999,
                  upgradeTier: 99,
                },
                {
                  speciesId: 25,
                  level: 999,
                  hp: -20,
                  bond: 999,
                  upgradeTier: 42,
                },
              ],
              pokedex: {
                seen: [-5, 0, 1026, 25, 'NaN'],
                caught: { '0': 1, '-5': 2, '1026': 1, '25': 3 },
              },
              badges: [null, 999, '', 'forest'],
              bag: {
                potions: -12,
                greatBalls: 'lots',
                starBalls: null,
                starShards: -999,
                cheerCharges: 999,
              },
            },
            ozias: 'completely-corrupted-profile',
          },
          settings: {
            rendererOverride: 'vulkan-raytrace',
            masterVolume: 99,
            battlePace: 'hyperspeed',
            showTouchPad: 'always-invalid',
          },
        }),
        dojoValue: null,
        legacyValue: null,
      },
    ];

    for (const fuzz of fuzzCases) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = attachErrorCollector(page);
      await stubExternalSpriteCdns(page);

      await page.addInitScript(
        ({
          v2Val,
          dojoVal,
          legacyVal,
        }: {
          v2Val: string | null;
          dojoVal: string | null;
          legacyVal: string | null;
        }) => {
          localStorage.clear();
          if (v2Val !== null) localStorage.setItem('starlight_v2_save', v2Val);
          if (dojoVal !== null) localStorage.setItem('starlight_pokemon_save_v1', dojoVal);
          if (legacyVal !== null) localStorage.setItem('starlight_island_save', legacyVal);
        },
        { v2Val: fuzz.v2Value, dojoVal: fuzz.dojoValue, legacyVal: fuzz.legacyValue },
      );

      await page.goto('./?renderer=canvas2d');
      await waitForAppBoot(page);

      expect(errors.consoleErrors, `Console errors for fuzz case "${fuzz.label}"`).toEqual([]);
      expect(errors.pageErrors, `Page errors for fuzz case "${fuzz.label}"`).toEqual([]);

      const state = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
      expect(state.save.schemaVersion).toBe(3);
      expect(CANONICAL_BIOMES.has(state.biomeId)).toBe(true);
      expect([null, 'violet', 'ozias']).toContain(state.save.activeTrainerId);
      expect(state.save.settings.masterVolume).toBeGreaterThanOrEqual(0);
      expect(state.save.settings.masterVolume).toBeLessThanOrEqual(1);
      expect(['auto', 'webgl2', 'canvas2d']).toContain(state.save.settings.rendererOverride);
      expect(['cinema', 'classic', 'fast']).toContain(state.save.settings.battlePace);

      for (const tid of ['violet', 'ozias'] as const) {
        const profile = state.save.profiles[tid];
        expect(profile.trainerId).toBe(tid);
        expect(Number.isFinite(profile.pos.x) && profile.pos.x >= 0 && profile.pos.x < 100).toBe(true);
        expect(Number.isFinite(profile.pos.y) && profile.pos.y >= 0 && profile.pos.y < 84).toBe(true);
        expect(VALID_STYLES.has(profile.appearance.styleId)).toBe(true);
        expect(VALID_ACCESSORIES.has(profile.appearance.accessory)).toBe(true);
        expect(VALID_AURAS.has(profile.appearance.aura)).toBe(true);
        expect(profile.team.length).toBeLessThanOrEqual(6);
        for (const member of profile.team) {
          expect(member.speciesId).toBeGreaterThanOrEqual(1);
          expect(member.speciesId).toBeLessThanOrEqual(1025);
          expect(member.level).toBeGreaterThanOrEqual(1);
          expect(member.level).toBeLessThanOrEqual(50);
          expect(member.bond).toBeGreaterThanOrEqual(0);
          expect(member.bond).toBeLessThanOrEqual(100);
          expect(member.upgradeTier).toBeGreaterThanOrEqual(0);
          expect(member.upgradeTier).toBeLessThanOrEqual(5);
        }
        expect(profile.bag.potions).toBeGreaterThanOrEqual(0);
        expect(profile.bag.greatBalls).toBeGreaterThanOrEqual(0);
        expect(profile.bag.starBalls).toBeGreaterThanOrEqual(0);
        expect(profile.bag.starShards).toBeGreaterThanOrEqual(0);
        expect(profile.bag.cheerCharges).toBeGreaterThanOrEqual(0);
        expect(profile.bag.cheerCharges).toBeLessThanOrEqual(3);
      }

      if (fuzz.label.includes('out-of-bounds')) {
        const v = state.save.profiles.violet;
        expect(v.pokedex.caught[0]).toBeUndefined();
        expect(v.pokedex.caught[1026]).toBeUndefined();
        expect(v.pokedex.seen.every((id) => id >= 1 && id <= 1025)).toBe(true);
        expect(v.team.length).toBe(1);
        expect(v.team[0].speciesId).toBe(25);
        expect(v.team[0].bond).toBeLessThanOrEqual(100);
        expect(v.team[0].upgradeTier).toBeLessThanOrEqual(5);
      }

      await context.close();
    }
  });

  test('persists starter choice, Style Studio loadout, and biome warp across full page.reload() as v3-local', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await stubExternalSpriteCdns(page);

    await page.goto('./?renderer=canvas2d');
    await waitForAppBoot(page);

    // 1. Choose Violet -> Starter Lab -> Choose Charmander (#4)
    await page.getByTestId('title-play-violet').click();
    await expect(page.getByTestId('starter-screen')).toBeVisible();
    await page.getByTestId('starter-choose-4').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await expect(page.getByTestId('hud-biome-name')).toHaveText('Starlight Village');

    // 2. Open Collector Drawer -> Island Guide -> Warp to Starfall Peak
    await page.getByTestId('nav-pokedex').click();
    await expect(page.getByTestId('collector-drawer')).toBeVisible();
    await page.getByTestId('drawer-tab-guide').click();
    await expect(page.getByTestId('drawer-panel-guide')).toBeVisible();
    await page.getByTestId('guide-warp-peak').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await expect(page.getByTestId('hud-biome-name')).toHaveText('Starfall Peak');

    // 3. Open Collector Drawer -> Style Studio -> Equip styleId, accessory, cape, aura
    await page.getByTestId('nav-pokedex').click();
    await page.getByTestId('drawer-tab-style').click();
    await expect(page.getByTestId('drawer-panel-style')).toBeVisible();

    await page.getByTestId('style-outfit-celestial').click();
    await page.getByTestId('style-accessory-crown').click();
    await page.getByTestId('style-cape-toggle').click();
    await page.getByTestId('style-aura-cosmic').click();

    await expect(page.getByTestId('style-outfit-celestial')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('style-accessory-crown')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('style-cape-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('style-aura-cosmic')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('drawer-close').click();
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();
    await page.getByTestId('setting-save-now').click();
    await page.evaluate(() => window.__STARLIGHT_DEBUG__!.forceSave());

    // 4. Full reload and confirm v3-local persistence
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppBoot(page);

    const reloaded = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(reloaded.hydrationSource).toBe('v3-local');
    expect(reloaded.save.schemaVersion).toBe(3);
    expect(reloaded.save.profiles.violet.starterId).toBe(4);
    expect(reloaded.save.profiles.violet.team[0].speciesId).toBe(4);
    expect(reloaded.save.profiles.violet.appearance).toMatchObject({
      styleId: 'celestial',
      accessory: 'crown',
      cape: true,
      aura: 'cosmic',
    });

    // Clicking Continue on Violet skips Starter Lab and lands right back at Starfall Peak
    await page.getByTestId('title-play-violet').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await expect(page.getByTestId('hud-biome-name')).toHaveText('Starfall Peak');
    expect(await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().biomeId)).toBe('peak');

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });
});
