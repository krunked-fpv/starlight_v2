import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

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
  await ctx.route('https://pokeapi.co/**', handler);
}

function attachCollectors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedLocalResponses: Array<{ url: string; status: number }> = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().startsWith('http://127.0.0.1:')) {
      failedLocalResponses.push({ url: res.url(), status: res.status() });
    }
  });

  return { consoleErrors, pageErrors, failedLocalResponses };
}

async function waitForBattleSettled(page: Page, timeout = 20_000): Promise<string> {
  await page.waitForFunction(
    () => {
      const ph = window.__STARLIGHT_DEBUG__?.getState().battlePhase;
      return (
        ph === 'command' ||
        ph === 'forced-switch' ||
        ph === 'evolving' ||
        ph === 'victory' ||
        ph === 'defeat'
      );
    },
    undefined,
    { timeout },
  );
  return page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().battlePhase);
}

function parseHp(text: string | null): { current: number; max: number } {
  const m = (text ?? '').match(/(\d+)\s*\/\s*(\d+)/);
  return m ? { current: Number(m[1]), max: Number(m[2]) } : { current: -1, max: -1 };
}

function parsePp(text: string | null): number {
  const m = (text ?? '').match(/PP\s+(\d+)\s*\/\s*(\d+)/);
  return m ? Number(m[1]) : -1;
}

async function dismissDialogueIfVisible(page: Page): Promise<void> {
  const overlay = page.getByTestId('dialogue-overlay');
  if (await overlay.isVisible().catch(() => false)) {
    const closeBtn = page.getByTestId('dialogue-close');
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(overlay).toBeHidden();
  }
}

async function bootFreshToOverworld(
  page: Page,
  renderer: 'webgl2' | 'canvas2d',
  starterId = 1,
): Promise<void> {
  await stubExternalSpriteCdns(page);
  await page.goto(`./?renderer=${renderer}`);
  await page.waitForFunction(
    () => typeof window.__STARLIGHT_DEBUG__?.getState === 'function' && window.__STARLIGHT_DEBUG__.getState().manifestLoaded,
    undefined,
    { timeout: 20_000 },
  );
  await page.getByTestId('title-play-violet').click();
  await expect(page.getByTestId('starter-screen')).toBeVisible();
  await page.getByTestId(`starter-choose-${starterId}`).click();
  await expect(page.getByTestId('overworld-screen')).toBeVisible();
  await dismissDialogueIfVisible(page);
}

async function walkInForestUntilEncounter(page: Page, maxIterations = 40): Promise<boolean> {
  let sweepX: 'ArrowRight' | 'ArrowLeft' = 'ArrowRight';
  for (let i = 0; i < maxIterations; i += 1) {
    const snap = await page.evaluate(() => {
      const s = window.__STARLIGHT_DEBUG__!.getState();
      const pos = s.save.profiles.violet.pos;
      return { screen: s.screen, x: pos.x, y: pos.y };
    });
    if (snap.screen === 'battle') return true;

    // Steer into Whispering Forest's obstacle-free tall-grass patch x=[4..6], y=[2..4]
    // north of the (4,5) warp point and pace inside tall grass so wildStreak never resets.
    let key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
    if (snap.y > 4) {
      key = 'ArrowUp';
    } else if (snap.y < 2) {
      key = 'ArrowDown';
    } else if (snap.x < 4) {
      key = 'ArrowRight';
    } else if (snap.x > 6) {
      key = 'ArrowLeft';
    } else {
      if (snap.x <= 4) sweepX = 'ArrowRight';
      else if (snap.x >= 6) sweepX = 'ArrowLeft';
      key = sweepX;
    }

    await page.keyboard.down(key);
    try {
      await page.waitForFunction(
        ({ startX, startY }) => {
          const s = window.__STARLIGHT_DEBUG__?.getState();
          if (!s) return false;
          if (s.screen === 'battle') return true;
          const p = s.save.profiles.violet.pos;
          return p.x !== startX || p.y !== startY;
        },
        { startX: snap.x, startY: snap.y },
        { timeout: 1_500 },
      );
    } catch {
      // Retry on next iteration if frame cadence did not finish crossing a tile boundary
    } finally {
      await page.keyboard.up(key);
    }

    const after = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().screen);
    if (after === 'battle') return true;
  }
  return false;
}

test.describe('Multi-Turn Combat & Encounter Playtest Suite', () => {
  for (const renderer of ['webgl2', 'canvas2d'] as const) {
    test(`natural tall-grass wild encounters, multi-turn combat, victory XP, post-battle cooldown & consecutive catch (${renderer})`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const telemetry = attachCollectors(page);
      // Use Charmander (Fire) so Whispering Forest Bug/Grass/Flying wilds cannot create an unwinnable Grass-vs-Flying stalemate
      await bootFreshToOverworld(page, renderer, 4);

      // Enable fast battle pace for snappy multi-turn coverage
      await page.getByTestId('nav-settings').click();
      await page.locator('[data-pace-val="fast"]').click();
      await page.getByTestId('settings-close').click();

      // Warp to Whispering Forest and trigger a NATURAL tall-grass wild encounter by walking
      await page.getByTestId('warp-farm').click();
      await expect(page.getByTestId('hud-biome-name')).not.toHaveText('Starlight Village');

      let phase = 'command';
      let xpBefore = { level: 1, xp: 0 };
      let verifiedTurn1 = false;

      // Allow 1 retry in the rare case an extreme-RNG high-ATK wild encounter (e.g. Teddiursa crit) KOs a Lv.5 starter
      for (let encounterAttempt = 0; encounterAttempt < 2; encounterAttempt += 1) {
        if (encounterAttempt > 0) {
          await dismissDialogueIfVisible(page);
          await page.getByTestId('warp-farm').click();
          await expect(page.getByTestId('hud-biome-name')).not.toHaveText('Starlight Village');
        }

        const triggeredFirst = await walkInForestUntilEncounter(page, 40);
        expect(triggeredFirst, 'Expected natural tall-grass wild encounter by walking').toBe(true);
        await expect(page.getByTestId('battle-screen')).toBeVisible();

        const phase0 = await waitForBattleSettled(page);
        expect(phase0).toBe('command');

        xpBefore = await page.evaluate(() => {
          const lead = window.__STARLIGHT_DEBUG__!.getState().save.profiles.violet.team[0];
          return { level: lead.level, xp: lead.xp };
        });

        const initialEnemyHp = parseHp(await page.getByTestId('battle-enemy-hp-val').textContent());
        const initialMovePp = parsePp(await page.getByTestId('battle-move-1').textContent());
        expect(initialEnemyHp.current).toBeGreaterThan(0);
        expect(initialMovePp).toBeGreaterThan(0);

        // Turn 1: Execute Quick Attack (move-1) and verify PP decrements & HP changes
        await page.getByTestId('battle-move-1').click();
        phase = await waitForBattleSettled(page);
        if (phase === 'command') {
          const afterT1EnemyHp = parseHp(await page.getByTestId('battle-enemy-hp-val').textContent());
          const afterT1Pp = parsePp(await page.getByTestId('battle-move-1').textContent());
          expect(afterT1Pp).toBe(initialMovePp - 1);
          expect(afterT1EnemyHp.current).toBeLessThanOrEqual(initialEnemyHp.current);
          verifiedTurn1 = true;
        } else if (phase === 'victory' || phase === 'evolving') {
          verifiedTurn1 = true;
        }

        // Continue multi-turn combat until victory (choosing highest-effectiveness move & healing safely)
        let healedLastTurn = false;
        for (let turn = 0; turn < 24; turn += 1) {
          phase = await waitForBattleSettled(page);
          if (phase === 'victory' || phase === 'defeat' || phase === 'evolving') break;
          if (phase === 'command') {
            const pHp = parseHp(await page.getByTestId('battle-player-hp-val').textContent());
            const eHp = parseHp(await page.getByTestId('battle-enemy-hp-val').textContent());
            const enemyLow = eHp.current > 0 && eHp.current <= 12;
            const criticalHp = pHp.current > 0 && pHp.current <= pHp.max * 0.45;
            const cautionHp = !healedLastTurn && pHp.current > 0 && pHp.current <= pHp.max * 0.65;

            if (!enemyLow && (criticalHp || cautionHp) && (await page.getByTestId('battle-potion').isEnabled())) {
              await page.getByTestId('battle-potion').click();
              healedLastTurn = true;
            } else if (
              !enemyLow &&
              (criticalHp || cautionHp) &&
              !(await page.getByTestId('battle-move-3').isDisabled())
            ) {
              await page.getByTestId('battle-move-3').click();
              healedLastTurn = true;
            } else {
              // Prefer Flame Wheel (move-2, STAB Fire) unless resisted, else Quick Attack (move-1)
              const m2Text = (await page.getByTestId('battle-move-2').textContent()) ?? '';
              const m2Disabled = await page.getByTestId('battle-move-2').isDisabled();
              const pickId = !m2Disabled && !m2Text.includes('RESIST') && !m2Text.includes('IMMUNE')
                ? 'battle-move-2'
                : 'battle-move-1';
              await page.getByTestId(pickId).click();
              healedLastTurn = false;
            }
          }
        }

        if (phase === 'evolving') {
          await page.getByTestId('battle-confirm-evolution').click();
          phase = await waitForBattleSettled(page);
        }
        if (phase === 'victory') break;
        if (phase === 'defeat' && encounterAttempt === 0) {
          await page.getByTestId('battle-close-result').click();
          await expect(page.getByTestId('overworld-screen')).toBeVisible();
          await dismissDialogueIfVisible(page);
        }
      }

      expect(verifiedTurn1).toBe(true);
      expect(phase).toBe('victory');
      await expect(page.getByTestId('battle-result-banner')).toContainText(/Victory!/i);

      const xpAfter = await page.evaluate(() => {
        const lead = window.__STARLIGHT_DEBUG__!.getState().save.profiles.violet.team[0];
        return { level: lead.level, xp: lead.xp };
      });
      expect(xpAfter.level > xpBefore.level || xpAfter.xp > xpBefore.xp).toBe(true);

      await page.getByTestId('battle-close-result').click();
      await expect(page.getByTestId('overworld-screen')).toBeVisible();

      // Verify post-battle cooldown prevents an immediate step-1 ambush
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(180);
      expect(await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().screen)).toBe('overworld');

      // Continue walking in tall grass to trigger a CONSECUTIVE 2nd natural wild encounter
      const triggeredSecond = await walkInForestUntilEncounter(page, 36);
      expect(triggeredSecond, 'Expected consecutive natural tall-grass encounter #2').toBe(true);
      await expect(page.getByTestId('battle-screen')).toBeVisible();
      await waitForBattleSettled(page);

      // Catch the 2nd wild Pokémon (throw balls until caught or flee if fainted)
      const teamBeforeCatch = await page.evaluate(
        () => window.__STARLIGHT_DEBUG__!.getState().save.profiles.violet.team.length,
      );
      let catchEnd = 'command';
      for (let attempt = 0; attempt < 8; attempt += 1) {
        catchEnd = await waitForBattleSettled(page);
        if (catchEnd !== 'command') break;
        const greatEnabled = await page.getByTestId('battle-ball-great').isEnabled();
        await page.getByTestId(greatEnabled ? 'battle-ball-great' : 'battle-ball-poke').click();
      }
      if (catchEnd === 'evolving') {
        await page.getByTestId('battle-confirm-evolution').click();
        catchEnd = await waitForBattleSettled(page);
      }
      if (catchEnd === 'victory') {
        const statusMsg = (await page.getByTestId('battle-status-message').textContent()) ?? '';
        expect(statusMsg).toContain('Gotcha!');
        const teamAfterCatch = await page.evaluate(
          () => window.__STARLIGHT_DEBUG__!.getState().save.profiles.violet.team.length,
        );
        expect(teamAfterCatch).toBe(teamBeforeCatch + 1);
        await page.getByTestId('battle-close-result').click();
      } else if (catchEnd === 'defeat') {
        await page.getByTestId('battle-close-result').click();
        await dismissDialogueIfVisible(page);
      } else {
        await page.getByTestId('battle-flee').click();
      }
      await expect(page.getByTestId('overworld-screen')).toBeVisible();

      expect(telemetry.consoleErrors).toEqual([]);
      expect(telemetry.pageErrors).toEqual([]);
      expect(telemetry.failedLocalResponses).toEqual([]);
    });
  }

  test('keyboard focus, Potion, Voluntary Switch, Evolution ceremony & Full-Party Box Catch', async ({ page }) => {
    test.setTimeout(90_000);
    const telemetry = attachCollectors(page);
    await stubExternalSpriteCdns(page);

    // Seed a 6-mon party with Lv.15 Bulbasaur 1 XP away from evolving into Ivysaur
    await page.addInitScript(() => {
      if (localStorage.getItem('starlight_v2_save')) return;
      localStorage.setItem(
        'starlight_v2_save',
        JSON.stringify({
          schemaVersion: 3,
          activeTrainerId: 'violet',
          settings: { battlePace: 'fast', reducedMotion: false, audioMuted: true },
          profiles: {
            violet: {
              trainerId: 'violet',
              starterId: 1,
              pos: { x: 8, y: 15, dir: 'down' },
              team: [
                { uid: 'lead-1', speciesId: 1, level: 15, xp: 344, bond: 40, hp: 50 },
                { uid: 'mate-2', speciesId: 25, level: 14, xp: 0, bond: 30 },
                { uid: 'mate-3', speciesId: 4, level: 12, xp: 0, bond: 30 },
                { uid: 'mate-4', speciesId: 7, level: 12, xp: 0, bond: 30 },
                { uid: 'mate-5', speciesId: 133, level: 12, xp: 0, bond: 30 },
                { uid: 'mate-6', speciesId: 16, level: 12, xp: 0, bond: 30 },
              ],
              box: [],
              bag: { potions: 5, greatBalls: 5, starBalls: 6, starShards: 12, cheerCharges: 2, gems: {} },
              pokedex: { seen: [1, 4, 7, 16, 25, 133], caught: { 1: 1, 4: 1, 7: 1, 16: 1, 25: 1, 133: 1 } },
            },
          },
        }),
      );
    });

    await page.goto('./?renderer=canvas2d');
    await page.waitForFunction(
      () => typeof window.__STARLIGHT_DEBUG__?.getState === 'function' && window.__STARLIGHT_DEBUG__.getState().manifestLoaded,
      undefined,
      { timeout: 20_000 },
    );
    await page.getByTestId('title-play-violet').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // 1. Keyboard ArrowRight focus must land on battle-move-0 (NOT battle-offline-rig!), Potion heals, Voluntary Switch swaps active mon
    await page.evaluate(() =>
      window.__STARLIGHT_DEBUG__!.triggerEncounter('wild', { biomeId: 'water', forceSpeciesId: 7 }),
    );
    await waitForBattleSettled(page);

    await page.keyboard.press('ArrowRight');
    const focusedTestId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focusedTestId).toBe('battle-move-0');

    // Use Potion on damaged Bulbasaur (started at 50 HP < maxHp)
    await expect(page.getByTestId('battle-potion')).toBeEnabled();
    await page.getByTestId('battle-potion').click();
    await waitForBattleSettled(page);
    await expect(page.getByTestId('battle-potion')).toContainText('Potion (4)');

    // Voluntary switch to Pikachu (slot 1)
    await page.getByTestId('battle-switch-btn').click();
    await expect(page.getByTestId('battle-switch-drawer')).toBeVisible();
    await page.getByTestId('battle-switch-slot-1').click();
    await waitForBattleSettled(page);
    await expect(page.getByTestId('battle-player-name')).toContainText('Pikachu');

    // Switch back to Bulbasaur and win vs Water-type Squirtle (2x weak to Vine Whip) to trigger Evolution Ceremony!
    await page.getByTestId('battle-switch-btn').click();
    await page.getByTestId('battle-switch-slot-0').click();
    await waitForBattleSettled(page);

    let evoPhase = 'command';
    for (let t = 0; t < 12; t += 1) {
      evoPhase = await waitForBattleSettled(page);
      if (evoPhase !== 'command') break;
      const bHp = parseHp(await page.getByTestId('battle-player-hp-val').textContent());
      if (bHp.current > 0 && bHp.current <= bHp.max * 0.45 && (await page.getByTestId('battle-potion').isEnabled())) {
        await page.getByTestId('battle-potion').click();
      } else if (t === 0) {
        await page.keyboard.press('Space');
      } else {
        await page.getByTestId('battle-move-2').click();
      }
    }
    expect(evoPhase).toBe('evolving');
    await expect(page.getByTestId('battle-confirm-evolution')).toBeVisible();
    await page.getByTestId('battle-confirm-evolution').click();

    await expect(page.getByTestId('battle-player-name')).toContainText('Ivysaur');
    await expect(page.getByTestId('battle-status-message')).toContainText('Ivysaur');
    await page.getByTestId('battle-close-result').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await dismissDialogueIfVisible(page);

    // 2. Full 6-mon party catch -> 7th Pokémon goes cleanly to Storage Box with Gotcha message preserved
    await page.evaluate(() =>
      window.__STARLIGHT_DEBUG__!.triggerEncounter('wild', { biomeId: 'forest', forceSpeciesId: 10 }),
    );
    await waitForBattleSettled(page);
    let boxPhase = 'command';
    for (let i = 0; i < 8; i += 1) {
      boxPhase = await waitForBattleSettled(page);
      if (boxPhase === 'victory' || boxPhase === 'defeat') break;
      if (boxPhase === 'evolving') {
        await page.getByTestId('battle-confirm-evolution').click();
        boxPhase = await waitForBattleSettled(page);
        break;
      }
      if (boxPhase === 'forced-switch') {
        await page.locator('[data-testid^="battle-switch-slot-"]:not([disabled])').first().click();
        continue;
      }
      if (boxPhase === 'command') {
        const starEnabled = await page.getByTestId('battle-ball-star').isEnabled();
        await page.getByTestId(starEnabled ? 'battle-ball-star' : 'battle-ball-poke').click();
      }
    }
    expect(boxPhase).toBe('victory');
    await expect(page.getByTestId('battle-status-message')).toContainText('Gotcha!');
    await expect(page.getByTestId('battle-status-message')).toContainText('Storage Box');
    const counts = await page.evaluate(() => {
      const p = window.__STARLIGHT_DEBUG__!.getState().save.profiles.violet;
      return { team: p.team.length, box: p.box.length };
    });
    expect(counts).toEqual({ team: 6, box: 1 });
    await page.getByTestId('battle-close-result').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await dismissDialogueIfVisible(page);

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedLocalResponses).toEqual([]);
  });

  test('Full Rival multi-mon victory + dialogue, Shrine clear + Astral Trial flee toast, and Forced-Switch + Defeat HP=0 recovery', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const telemetry = attachCollectors(page);
    await stubExternalSpriteCdns(page);

    // Seed Fire/Flying Charizard ace (type-advantaged vs Rival Leo's Grass Oddish & Forest Shrine) for crisp victory
    await page.addInitScript(() => {
      if (localStorage.getItem('starlight_v2_save')) return;
      localStorage.setItem(
        'starlight_v2_save',
        JSON.stringify({
          schemaVersion: 3,
          activeTrainerId: 'violet',
          settings: { battlePace: 'fast', reducedMotion: false, audioMuted: true },
          profiles: {
            violet: {
              trainerId: 'violet',
              starterId: 4,
              pos: { x: 8, y: 15, dir: 'down' },
              team: [
                { uid: 'ace-1', speciesId: 6, level: 24, xp: 0, bond: 60, upgradeTier: 2 },
                { uid: 'ace-2', speciesId: 25, level: 20, xp: 0, bond: 50, upgradeTier: 1 },
              ],
              box: [],
              bag: { potions: 5, greatBalls: 5, starBalls: 5, starShards: 10, cheerCharges: 2, gems: {} },
              pokedex: { seen: [4, 5, 6, 25], caught: { 4: 1, 5: 1, 6: 1, 25: 1 } },
            },
          },
        }),
      );
    });

    await page.goto('./?renderer=canvas2d');
    await page.waitForFunction(
      () => typeof window.__STARLIGHT_DEBUG__?.getState === 'function' && window.__STARLIGHT_DEBUG__.getState().manifestLoaded,
      undefined,
      { timeout: 20_000 },
    );
    await page.getByTestId('title-play-violet').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // 1. Multi-Pokémon Rival Leo battle all the way to victory + post-victory dialogue
    await page.evaluate(() =>
      window.__STARLIGHT_DEBUG__!.triggerEncounter('rival', { biomeId: 'forest', rivalId: 'rival_leo' }),
    );
    await waitForBattleSettled(page);
    await expect(page.getByTestId('battle-ball-poke')).toBeDisabled();
    const seenRivalFoes = new Set<string>();
    let sawFirstPipFainted = false;
    let rivalEnd = 'command';
    for (let t = 0; t < 18; t += 1) {
      rivalEnd = await waitForBattleSettled(page);
      const foeName = (await page.getByTestId('battle-enemy-name').textContent()) ?? '';
      seenRivalFoes.add(foeName);
      const pip0Fainted = await page.locator('[data-testid="battle-rival-dots"] > span').first().getAttribute('data-pip-fainted');
      if (pip0Fainted === 'true') sawFirstPipFainted = true;
      if (rivalEnd === 'victory' || rivalEnd === 'defeat') break;
      if (rivalEnd === 'forced-switch') {
        await page.locator('[data-testid^="battle-switch-slot-"]:not([disabled])').first().click();
      } else if (rivalEnd === 'command') {
        await page.getByTestId('battle-move-0').click();
      }
    }
    expect(rivalEnd).toBe('victory');
    expect(seenRivalFoes.size).toBeGreaterThanOrEqual(2);
    expect(sawFirstPipFainted).toBe(true);

    await page.getByTestId('battle-close-result').click();
    await expect(page.getByTestId('dialogue-overlay')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('dialogue-overlay')).toBeHidden();

    // 2. Forest Shrine clear + post-clear dialogue + Astral Shrine Trial flee toast
    await page.evaluate(() =>
      window.__STARLIGHT_DEBUG__!.triggerEncounter('shrine', { biomeId: 'forest', shrineId: 'forest_shrine' }),
    );
    await waitForBattleSettled(page);
    let shrineEnd = 'command';
    for (let t = 0; t < 18; t += 1) {
      shrineEnd = await waitForBattleSettled(page);
      if (shrineEnd === 'victory' || shrineEnd === 'defeat') break;
      if (shrineEnd === 'forced-switch') {
        await page.locator('[data-testid^="battle-switch-slot-"]:not([disabled])').first().click();
      } else if (shrineEnd === 'command') {
        await page.getByTestId('battle-move-0').click();
      }
    }
    expect(shrineEnd).toBe('victory');
    await page.getByTestId('battle-close-result').click();
    await expect(page.getByTestId('dialogue-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('dialogue-overlay')).toBeHidden();

    const cleared = await page.evaluate(
      () => window.__STARLIGHT_DEBUG__!.getState().save.profiles.violet.shrinesCleared,
    );
    expect(cleared).toContain('forest_shrine');

    // Astral Shrine Trial #1 -> safe flee shows Shrine-specific toast
    await page.evaluate(() =>
      window.__STARLIGHT_DEBUG__!.triggerEncounter('shrine-trial', { biomeId: 'forest', shrineId: 'forest_shrine' }),
    );
    await waitForBattleSettled(page);
    await page.getByTestId('battle-flee').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await expect(page.getByTestId('toast-banner')).toContainText('Stepped back safely from the Shrine');

    // 3. Forced-switch + Defeat HP=0 preservation -> clean recall to Starlight Village
    // Switch to a fresh low-level 2-mon party against Lv.12 Volcano Moltres Shrine for deterministic forced-switch & defeat
    await page.evaluate(() => {
      localStorage.setItem(
        'starlight_v2_save',
        JSON.stringify({
          schemaVersion: 3,
          activeTrainerId: 'violet',
          settings: { battlePace: 'fast', reducedMotion: false, audioMuted: true },
          profiles: {
            violet: {
              trainerId: 'violet',
              starterId: 1,
              pos: { x: 50, y: 20, dir: 'down' },
              team: [
                { uid: 'low-1', speciesId: 1, level: 5, xp: 0, bond: 20 },
                { uid: 'low-2', speciesId: 10, level: 4, xp: 0, bond: 20 },
              ],
              box: [],
              bag: { potions: 5, greatBalls: 3, starBalls: 0, starShards: 0, cheerCharges: 0, gems: {} },
              pokedex: { seen: [1, 10], caught: { 1: 1, 10: 1 } },
            },
          },
        }),
      );
    });
    await page.reload();
    await page.waitForFunction(
      () => typeof window.__STARLIGHT_DEBUG__?.getState === 'function' && window.__STARLIGHT_DEBUG__.getState().manifestLoaded,
      undefined,
      { timeout: 20_000 },
    );
    await page.getByTestId('title-play-violet').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    await page.evaluate(() => {
      window.__STARLIGHT_DEBUG__!.warpBiome('volcano');
      window.__STARLIGHT_DEBUG__!.triggerEncounter('shrine', { biomeId: 'volcano', shrineId: 'volcano_shrine' });
    });
    await waitForBattleSettled(page);

    let sawForcedSwitch = false;
    let blackoutEnd = 'command';
    for (let t = 0; t < 18; t += 1) {
      blackoutEnd = await waitForBattleSettled(page);
      if (blackoutEnd === 'defeat' || blackoutEnd === 'victory') break;
      if (blackoutEnd === 'forced-switch') {
        sawForcedSwitch = true;
        await expect(page.getByTestId('battle-switch-drawer')).toBeVisible();
        await page.locator('[data-testid^="battle-switch-slot-"]:not([disabled])').first().click();
        const postSwPhase = await waitForBattleSettled(page);
        expect(postSwPhase).toBe('command');
      } else if (blackoutEnd === 'command') {
        await page.getByTestId('battle-move-0').click();
      }
    }

    expect(blackoutEnd).toBe('defeat');
    expect(sawForcedSwitch).toBe(true);
    // Verify Defeat screen keeps HP at 0 (no premature full-heal refill on Defeat screen!)
    await page.waitForTimeout(250);
    const defeatHp = parseHp(await page.getByTestId('battle-player-hp-val').textContent());
    expect(defeatHp.current).toBe(0);

    await page.getByTestId('battle-close-result').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await dismissDialogueIfVisible(page);
    const postRecall = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(postRecall.biomeId).toBe('village');
    expect(postRecall.playerPos).toEqual({ x: 8, y: 15 });
    expect(postRecall.save.profiles.violet.team[0].hp).toBeGreaterThan(0);

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedLocalResponses).toEqual([]);
  });
});
