import { expect, test, type Page } from '@playwright/test';

const BIOME_VALID_SET = new Set([
  'starlight-village',
  'meadow',
  'verdant-canopy',
  'ember-caldera',
  'sapphire-lagoon',
  'volt-highlands',
  'frost-glacier',
  'valor-dojo',
  'mire-bayou',
  'ochre-canyon',
  'zephyr-peaks',
  'astral-ruins',
  'amber-thicket',
  'basalt-quarry',
  'mist-hollow',
  'drake-summit',
  'eclipse-crag',
  'aegis-foundry',
  'starbloom-glade',
]);

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

function buildRealisticLegacyV1Payload() {
  return {
    version: 1,
    activeSlot: 'slot0',
    profiles: {
      slot0: {
        name: 'Aether',
        title: 'Caldera Sky-Navigator',
        biomeId: 'ember-caldera',
        x: 14.2,
        y: 10.8,
        facing: 'right',
        playtime: 9145,
        party: [
          {
            uid: 'v1-aether-pikachu',
            speciesId: 25,
            level: 36,
            hp: 92,
            composure: 64,
            bond: 100,
            starRank: 5,
            shiny: false,
            moves: ['thunderbolt', 'volt-tackle', 'starlight-pulse', 'quick-attack'],
          },
          {
            uid: 'v1-aether-charizard',
            speciesId: 6,
            level: 40,
            hp: 118,
            composure: 82,
            bond: 91,
            starRank: 4,
            shiny: false,
          },
        ],
        pokedex: {
          1: { seen: true, caught: true, starRank: 3, bond: 70, timesEncountered: 2 },
          6: { seen: true, caught: true, starRank: 4, bond: 91, timesEncountered: 4 },
          25: { seen: true, caught: true, starRank: 5, bond: 100, shiny: false, timesEncountered: 12 },
          150: { seen: true, caught: true, starRank: 5, bond: 95, timesEncountered: 1 },
          384: { seen: true, caught: false, starRank: 2, bond: 20, timesEncountered: 1 },
          658: { seen: true, caught: true, starRank: 4, bond: 84, timesEncountered: 3 },
          1024: { seen: true, caught: true, starRank: 5, bond: 100, shiny: true, timesEncountered: 1 },
          1025: { seen: true, caught: true, starRank: 4, bond: 88, shiny: true, timesEncountered: 2 },
        },
        badges: [
          'badge-fire',
          'badge-water',
          'badge-electric',
          'badge-dragon',
          'Clover Crest',
          'Canopy Leaf',
          'Borealis Prism',
          'Astral Eye',
          'Starbloom Crown',
          'pioneer',
          'skyhop',
          21,
        ],
        style: {
          outfit: 'astral-robe',
          cape: 'cinder-cloak',
          headgear: 'sky-goggles',
          aura: 'sky-thunder',
          primaryAccent: '#ff7b47',
          secondaryAccent: '#7ce8ff',
        },
        inventory: {
          pokeBalls: 19,
          starBalls: 11,
          potions: 7,
          superPotions: 4,
          starShards: 340,
        },
        skyHopHighScore: 1240,
        skyHopBestCombo: 23,
        rivalsDefeated: 4,
      },
      slot1: {
        name: 'Vesper',
        title: 'Glacier Archivist',
        biomeId: 'frost-glacier',
        x: 12.5,
        y: 11.2,
        facing: 'left',
        party: [
          {
            uid: 'v1-vesper-glaceon',
            speciesId: 471,
            level: 31,
            hp: 88,
            composure: 77,
            bond: 86,
            starRank: 4,
          },
        ],
        pokedex: {
          471: { seen: true, caught: true, stars: 4, friendship: 86, timesEncountered: 5 },
          1025: true,
        },
        badges: ['badge-ice', 'badge-ghost', 'badge-fairy'],
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

test.describe('Red-Team: Legacy v1 Save Continuity & Fuzzing', () => {
  test('hydrates realistic Starlight v1 dual-profile save non-destructively with 100% continuity', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    const v1Payload = buildRealisticLegacyV1Payload();
    const rawV1Json = JSON.stringify(v1Payload);

    await page.addInitScript((payloadStr: string) => {
      if (!sessionStorage.getItem('__seed_v1_done')) {
        sessionStorage.setItem('__seed_v1_done', '1');
        localStorage.clear();
        localStorage.setItem('starlight_island_save', payloadStr);
      }
    }, rawV1Json);

    await page.goto('./?renderer=canvas2d');
    await waitForAppBoot(page);

    expect(errors.consoleErrors, `Unexpected console errors: ${errors.consoleErrors.join('; ')}`).toEqual([]);
    expect(errors.pageErrors, `Unexpected page errors: ${errors.pageErrors.join('; ')}`).toEqual([]);

    const state = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(state.hydrationSource).toBe('v1-migrated');
    expect(state.save.schemaVersion).toBe(2);
    expect(state.save.migratedFromV1?.sourceKey).toBe('starlight_island_save');

    // Non-destructive verification: original legacy key must remain byte-identical
    const storedKeys = await page.evaluate(() => ({
      legacyRaw: localStorage.getItem('starlight_island_save'),
      v2Raw: localStorage.getItem('starlight_v2_save'),
    }));
    expect(storedKeys.legacyRaw).toBe(rawV1Json);
    expect(storedKeys.v2Raw).toBeTruthy();

    // Verify Slot 0 (Aether) hydration integrity
    const slot0 = state.save.profiles.slot0;
    expect(slot0.name).toBe('Aether');
    expect(slot0.biomeId).toBe('ember-caldera');
    expect(state.biomeId).toBe('ember-caldera');
    expect(slot0.style.aura).toBe('sky-thunder');
    expect(slot0.style.cape).toBe('cinder-cloak');
    expect(slot0.style.outfit).toBe('astral-robe');
    expect(slot0.style.headgear).toBe('sky-goggles');
    expect(slot0.badges).toHaveLength(12);
    expect(slot0.badges).toEqual(
      expect.arrayContaining([
        'badge-fire',
        'badge-water',
        'badge-electric',
        'badge-dragon',
        'badge-normal',
        'badge-grass',
        'badge-ice',
        'badge-psychic',
        'badge-fairy',
        'badge-pioneer',
        'badge-skyhop',
        'badge-bond',
      ]),
    );

    // Pokédex #25 (Star Rank 5, Bond 100) and #1025 (caught) preserved
    expect(slot0.pokedex[25]).toMatchObject({
      seen: true,
      caught: true,
      starRank: 5,
      bond: 100,
    });
    expect(slot0.pokedex[1025]).toMatchObject({
      seen: true,
      caught: true,
      starRank: 4,
      bond: 88,
      shiny: true,
    });

    // Party & Composure states preserved
    expect(slot0.party[0].speciesId).toBe(25);
    expect(slot0.party[0].composure).toBe(64);
    expect(slot0.party[0].bond).toBe(100);
    expect(slot0.party[0].starRank).toBe(5);
    expect(slot0.party[1].speciesId).toBe(6);
    expect(slot0.party[1].composure).toBe(82);

    // Dual-profile Slot 1 (Vesper) preserved intact
    const slot1 = state.save.profiles.slot1;
    expect(slot1.name).toBe('Vesper');
    expect(slot1.biomeId).toBe('frost-glacier');
    expect(slot1.style.aura).toBe('aurora');
    expect(slot1.style.cape).toBe('prism-shawl');
    expect(slot1.pokedex[471]).toMatchObject({ caught: true, starRank: 4, bond: 86 });
    expect(slot1.pokedex[1025]).toMatchObject({ caught: true });

    // Confirm hydrated data renders cleanly in Title & Overworld UI
    await expect(page.getByTestId('profile-slot0-meta')).toContainText('Aether');
    await expect(page.getByTestId('profile-slot0-meta')).toContainText('12 / 28 Badges');
    await expect(page.getByTestId('profile-slot1-meta')).toContainText('Vesper');

    await page.getByTestId('enter-world-btn').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await expect(page.getByTestId('overworld-biome-name')).toHaveText('Cindercrest Caldera');

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('recovers cleanly from corrupted v2 JSON by falling back to valid legacy v1 save', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    const legacyFallback = JSON.stringify({
      trainerName: 'Solstice',
      biome: 'volt-highlands',
      badges: ['badge-electric', 'badge-steel', 'badge-pioneer'],
      style: { aura: 'ember-crown', cape: 'zephyr-mantle' },
      pokedex: [25, 1008, 1025],
    });

    await page.addInitScript((legacyStr: string) => {
      if (!sessionStorage.getItem('__seed_corrupt_v2')) {
        sessionStorage.setItem('__seed_corrupt_v2', '1');
        localStorage.clear();
        localStorage.setItem('starlight_v2_save', '{"schemaVersion":2, "profiles": { CORRUPTED');
        localStorage.setItem('starlight_island_save', legacyStr);
      }
    }, legacyFallback);

    await page.goto('./?renderer=canvas2d');
    await waitForAppBoot(page);

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);

    const state = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(state.hydrationSource).toBe('v1-migrated');
    expect(state.save.profiles.slot0.name).toBe('Solstice');
    expect(state.save.profiles.slot0.biomeId).toBe('volt-highlands');
    expect(state.save.profiles.slot0.style.aura).toBe('ember-crown');
    expect(state.save.profiles.slot0.style.cape).toBe('zephyr-mantle');
    expect(state.save.profiles.slot0.pokedex[1025]?.caught).toBe(true);

    // Legacy key untouched, v2 key repaired to valid JSON
    const storageCheck = await page.evaluate(() => {
      const legacy = localStorage.getItem('starlight_island_save');
      const v2 = localStorage.getItem('starlight_v2_save');
      let v2Valid = false;
      try {
        v2Valid = Boolean(v2 && JSON.parse(v2).schemaVersion === 2);
      } catch {
        v2Valid = false;
      }
      return { legacy, v2Valid };
    });
    expect(storageCheck.legacy).toBe(legacyFallback);
    expect(storageCheck.v2Valid).toBe(true);
  });

  test('survives completely mangled, primitive, and adversarial out-of-bounds payloads without crashing', async ({
    browser,
  }) => {
    const fuzzCases: Array<{
      label: string;
      v2Value: string | null;
      v1Value: string | null;
    }> = [
      {
        label: 'invalid JSON in both v2 and v1',
        v2Value: '{{{broken-json!!!',
        v1Value: '<<<not-json>>>',
      },
      {
        label: 'JSON null and array primitives',
        v2Value: 'null',
        v1Value: '[1, 2, 3]',
      },
      {
        label: 'adversarial out-of-bounds and wrong-type fields',
        v2Value: JSON.stringify({
          schemaVersion: 999,
          activeSlot: 'slot99',
          profiles: {
            slot0: {
              name: '     ',
              biomeId: 'nonexistent-crater',
              x: -999,
              y: 99999,
              facing: 'diagonal',
              party: [
                null,
                'not-a-member',
                {
                  speciesId: 999999,
                  level: -50,
                  hp: -10,
                  composure: 5000,
                  bond: 999,
                  starRank: 99,
                },
              ],
              pokedex: {
                0: true,
                '-5': true,
                1026: true,
                25: { caught: true, bond: 999, starRank: 42 },
              },
              badges: ['not-a-real-badge', 999, -1, null],
              style: {
                outfit: 'invalid-outfit',
                cape: 'invalid-cape',
                headgear: 'invalid-hat',
                aura: 'invalid-aura',
              },
              inventory: {
                pokeBalls: -12,
                starBalls: 999999,
                potions: 'lots',
              },
            },
            slot1: 'completely-corrupted-slot',
          },
          settings: {
            rendererOverride: 'vulkan-raytrace',
            masterVolume: 99,
          },
        }),
        v1Value: null,
      },
    ];

    for (const fuzz of fuzzCases) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = attachErrorCollector(page);

      await page.addInitScript(
        ({ v2Val, v1Val }: { v2Val: string | null; v1Val: string | null }) => {
          localStorage.clear();
          if (v2Val !== null) localStorage.setItem('starlight_v2_save', v2Val);
          if (v1Val !== null) localStorage.setItem('starlight_island_save', v1Val);
        },
        { v2Val: fuzz.v2Value, v1Val: fuzz.v1Value },
      );

      await page.goto('./?renderer=canvas2d');
      await waitForAppBoot(page);

      expect(errors.consoleErrors, `Console errors for fuzz case "${fuzz.label}"`).toEqual([]);
      expect(errors.pageErrors, `Page errors for fuzz case "${fuzz.label}"`).toEqual([]);

      const state = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
      expect(state.save.schemaVersion).toBe(2);
      expect(['slot0', 'slot1']).toContain(state.save.activeSlot);

      for (const slotKey of ['slot0', 'slot1'] as const) {
        const profile = state.save.profiles[slotKey];
        expect(profile.name.trim().length).toBeGreaterThan(0);
        expect(BIOME_VALID_SET.has(profile.biomeId)).toBe(true);
        expect(Number.isFinite(profile.x) && profile.x >= 1 && profile.x <= 26).toBe(true);
        expect(Number.isFinite(profile.y) && profile.y >= 2 && profile.y <= 16).toBe(true);
        expect(profile.party.length).toBeGreaterThan(0);
        for (const member of profile.party) {
          expect(member.speciesId).toBeGreaterThanOrEqual(1);
          expect(member.speciesId).toBeLessThanOrEqual(1025);
          expect(member.level).toBeGreaterThanOrEqual(1);
          expect(member.level).toBeLessThanOrEqual(100);
          expect(member.composure).toBeGreaterThanOrEqual(0);
          expect(member.composure).toBeLessThanOrEqual(100);
          expect(member.bond).toBeGreaterThanOrEqual(0);
          expect(member.bond).toBeLessThanOrEqual(100);
          expect(member.starRank).toBeGreaterThanOrEqual(0);
          expect(member.starRank).toBeLessThanOrEqual(5);
        }
        expect(profile.inventory.pokeBalls).toBeGreaterThanOrEqual(0);
        expect(profile.inventory.starBalls).toBeLessThanOrEqual(999);
      }

      if (fuzz.label.includes('out-of-bounds')) {
        const s0 = state.save.profiles.slot0;
        expect(s0.pokedex[0]).toBeUndefined();
        expect(s0.pokedex[1026]).toBeUndefined();
        expect(s0.pokedex[25].bond).toBeLessThanOrEqual(100);
        expect(s0.pokedex[25].starRank).toBeLessThanOrEqual(5);
      }

      await context.close();
    }
  });

  test('persists Style Studio outfit/aura edits and biome travel across full page.reload()', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);

    await page.goto('./?renderer=canvas2d');
    await waitForAppBoot(page);

    // Enter overworld and travel to Frost Glacier
    await page.getByTestId('enter-world-btn').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    await page.getByTestId('biome-select').selectOption('frost-glacier');
    await expect(page.getByTestId('overworld-biome-name')).toHaveText('Crystalline Borealis Glacier');

    // Open Style Studio and equip new outfit, cape, headgear, and aura
    await page.getByTestId('nav-style').click();
    await expect(page.getByTestId('style-studio-screen')).toBeVisible();

    await page.getByTestId('style-outfit-astral-robe').click();
    await page.getByTestId('style-cape-prism-shawl').click();
    await page.getByTestId('style-headgear-lunar-circlet').click();
    await page.getByTestId('style-aura-aurora').click();

    await expect(page.getByTestId('style-outfit-astral-robe')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('style-aura-aurora')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('style-close').click();
    await page.getByTestId('save-btn').click();
    await page.evaluate(() => window.__STARLIGHT_DEBUG__!.forceSave());

    // Full page reload and verify complete persistence
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppBoot(page);

    const reloaded = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(reloaded.hydrationSource).toBe('v2-local');
    expect(reloaded.biomeId).toBe('frost-glacier');
    expect(reloaded.save.profiles.slot0.style).toMatchObject({
      outfit: 'astral-robe',
      cape: 'prism-shawl',
      headgear: 'lunar-circlet',
      aura: 'aurora',
    });

    await page.getByTestId('enter-world-btn').click();
    await expect(page.getByTestId('overworld-biome-name')).toHaveText('Crystalline Borealis Glacier');

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });
});
