import { expect, test, type Page } from '@playwright/test';

function attachCollectors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedResponses: Array<{ url: string; status: number }> = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      failedResponses.push({ url: res.url(), status: res.status() });
    }
  });

  return { consoleErrors, pageErrors, failedResponses };
}

async function waitForAppBoot(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__STARLIGHT_DEBUG__), undefined, {
    timeout: 20_000,
  });
  await expect(page.getByTestId('celestial-ui-shell')).toBeVisible();
}

async function assertElementCanvasDrawn(page: Page, selector: string): Promise<void> {
  const drawn = await page.evaluate((sel: string) => {
    const canvas = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
      return { nonTransparent: 0, distinct: 0 };
    }
    const probe = document.createElement('canvas');
    probe.width = Math.min(120, canvas.width);
    probe.height = Math.min(80, canvas.height);
    const ctx = probe.getContext('2d');
    if (!ctx) return { nonTransparent: 0, distinct: 0 };
    ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let nonTransparent = 0;
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        nonTransparent += 1;
        colors.add(((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3));
      }
    }
    return { nonTransparent, distinct: colors.size };
  }, selector);

  expect(drawn.nonTransparent, `Expected ${selector} to have drawn pixels`).toBeGreaterThan(20);
  expect(drawn.distinct, `Expected ${selector} to have tonal/color variance`).toBeGreaterThan(3);
}

for (const renderer of ['webgl2', 'canvas2d'] as const) {
  test.describe(`E2E Full Player Journey (${renderer})`, () => {
    test(`completes Title -> Overworld -> Biomes -> Briefing -> Battles -> 1025 Pokédex -> 28 Badges -> Style Studio -> Sky-Hop on ${renderer}`, async ({
      page,
    }) => {
      const telemetry = attachCollectors(page);

      await page.goto(`./?renderer=${renderer}`);
      await waitForAppBoot(page);

      const initialState = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
      expect(initialState.backend).toBe(renderer);
      expect(initialState.manifestLoaded).toBe(true);

      // 1. Title Vista dual-profile preview: switch slot1 and back to slot0
      await expect(page.getByTestId('title-screen')).toBeVisible();
      await assertElementCanvasDrawn(page, '[data-testid="profile-slot0-canvas"]');
      await assertElementCanvasDrawn(page, '[data-testid="profile-slot1-canvas"]');

      await page.getByTestId('profile-slot1').click();
      await expect(page.getByTestId('profile-slot1')).toHaveAttribute('aria-pressed', 'true');
      expect(
        await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().activeSlot),
      ).toBe('slot1');

      await page.getByTestId('profile-slot0').click();
      await expect(page.getByTestId('profile-slot0')).toHaveAttribute('aria-pressed', 'true');
      expect(
        await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().activeSlot),
      ).toBe('slot0');

      // 2. Enter Starlight Village
      await page.getByTestId('enter-world-btn').click();
      await expect(page.getByTestId('overworld-screen')).toBeVisible();
      await expect(page.getByTestId('overworld-biome-name')).toHaveText('Starlight Village');

      // Confirm live draw calls on main stage (soft assertion so full journey still audits every downstream screen)
      await page.waitForTimeout(220);
      const owStats = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().frameStats);
      expect.soft(owStats.drawCalls, `Expected live drawCalls > 0 on ${renderer}`).toBeGreaterThan(0);

      // 3. Interact with nearby Starlight Healing Fountain & walk through tall grass
      await page.getByTestId('interact-btn').click();
      await expect(page.getByTestId('toast-banner')).toContainText('Starlight Healing Fountain');

      const posStart = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().playerPos);
      // Walk left then down from (13.5, 11.4) into tall-grass patch [4..9, 12..14]
      await page.keyboard.down('ArrowLeft');
      await page.waitForTimeout(1050);
      await page.keyboard.up('ArrowLeft');
      await page.keyboard.down('ArrowDown');
      await page.waitForTimeout(380);
      await page.keyboard.up('ArrowDown');

      const postWalk = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
      // If tall grass naturally triggered a wild encounter, return to overworld cleanly
      if (postWalk.screen === 'battle') {
        await page.getByTestId('battle-flee').click();
        await expect(page.getByTestId('overworld-screen')).toBeVisible();
      } else {
        expect(Math.hypot(postWalk.playerPos.x - posStart.x, postWalk.playerPos.y - posStart.y)).toBeGreaterThan(1.5);
        expect(postWalk.grassDisplacements).toBeGreaterThan(0);
      }

      // 4. Travel to another biome
      await page.getByTestId('biome-select').selectOption('sapphire-lagoon');
      await expect(page.getByTestId('overworld-biome-name')).toHaveText('Sapphire Coral Lagoon');
      expect(
        await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().biomeId),
      ).toBe('sapphire-lagoon');

      // 5. Open Tactical Readiness Briefing
      await page.getByTestId('nav-briefing').click();
      await expect(page.getByTestId('briefing-screen')).toBeVisible();
      await expect(page.getByTestId('briefing-score')).toBeVisible();
      await page.getByTestId('briefing-close').click();
      await expect(page.getByTestId('briefing-screen')).toBeHidden();

      // 6a. Trigger Wild encounter -> elemental move -> Star Ball -> Offline Rig
      await page.getByTestId('encounter-wild').click();
      await expect(page.getByTestId('battle-screen')).toBeVisible();
      await page.waitForFunction(
        () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
        undefined,
        { timeout: 10_000 },
      );

      const preMoveMsg = await page.getByTestId('battle-status-message').textContent();
      await page.getByTestId('battle-move-0').click();
      await page.waitForFunction(() => {
        const p = window.__STARLIGHT_DEBUG__?.getState().battlePhase;
        return p === 'command' || p === 'victory' || p === 'defeat';
      }, undefined, { timeout: 10_000 });
      const postMoveMsg = await page.getByTestId('battle-status-message').textContent();
      expect(postMoveMsg).not.toBe(preMoveMsg);

      const afterMovePhase = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().battlePhase);
      if (afterMovePhase === 'command') {
        await page.getByTestId('battle-starball').click();
        await page.waitForFunction(() => {
          const p = window.__STARLIGHT_DEBUG__?.getState().battlePhase;
          return p === 'command' || p === 'victory';
        }, undefined, { timeout: 10_000 });
      }

      await page.getByTestId('battle-offline-rig').click();
      await expect(page.getByTestId('battle-offline-rig')).toHaveAttribute('aria-pressed', 'true');

      await page.getByTestId('battle-flee').click();
      await expect(page.getByTestId('overworld-screen')).toBeVisible();

      // 6b. Trigger Shrine encounter -> trigger Evolution
      await page.getByTestId('encounter-shrine').click();
      await expect(page.getByTestId('battle-screen')).toBeVisible();
      await page.waitForFunction(
        () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
        undefined,
        { timeout: 10_000 },
      );

      await page.getByTestId('battle-evolve').click();
      await page.waitForFunction(
        () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'evolving',
        undefined,
        { timeout: 5_000 },
      );
      await page.waitForFunction(
        () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
        undefined,
        { timeout: 10_000 },
      );
      // Pikachu (#25) evolves into Raichu (#26)
      await expect(page.getByTestId('battle-player-name')).toContainText('Raichu');

      await page.getByTestId('battle-flee').click();
      await expect(page.getByTestId('overworld-screen')).toBeVisible();

      // 7. Open 1,025 Pokédex: search #1025 & #25, verify holographic card tilt & Play Cry waveform
      await page.getByTestId('nav-pokedex').click();
      await expect(page.getByTestId('pokedex-screen')).toBeVisible();

      await page.getByTestId('pokedex-search').fill('#1025');
      await page.getByTestId('pokedex-row-1025').click();
      await expect(page.getByTestId('pokedex-card-number')).toHaveText('#1025');

      await page.getByTestId('pokedex-search').fill('#25');
      await page.getByTestId('pokedex-row-25').click();
      await expect(page.getByTestId('pokedex-card-number')).toHaveText('#0025');
      await expect(page.getByTestId('pokedex-card-name')).toHaveText('Pikachu');
      await expect(page.getByTestId('pokedex-holo-card')).toHaveAttribute('data-max-bond', 'true');

      // Verify 3D holographic card pointer tilt updates CSS variables
      const holoBox = await page.getByTestId('pokedex-holo-card').boundingBox();
      expect(holoBox).not.toBeNull();
      if (holoBox) {
        await page.mouse.move(holoBox.x + holoBox.width * 0.85, holoBox.y + holoBox.height * 0.15);
      }
      const tilt = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="pokedex-holo-card"]') as HTMLElement | null;
        return {
          rx: el?.style.getPropertyValue('--holo-rx') ?? '',
          ry: el?.style.getPropertyValue('--holo-ry') ?? '',
        };
      });
      expect(tilt.rx).not.toBe('0deg');
      expect(tilt.ry).not.toBe('0deg');

      // Trigger Play Cry and verify procedural waveform canvas is rendered
      await page.getByTestId('pokedex-play-cry').click();
      await page.waitForTimeout(160);
      await assertElementCanvasDrawn(page, '[data-testid="pokedex-cry-canvas"]');

      await page.getByTestId('pokedex-close').click();
      await expect(page.getByTestId('pokedex-screen')).toBeHidden();

      // 8. Open 28 Badges showcase and verify all 28 badge cards
      await page.getByTestId('nav-badges').click();
      await expect(page.getByTestId('badges-screen')).toBeVisible();
      await expect(page.locator('[data-testid^="badge-card-"]')).toHaveCount(28);
      await page.getByTestId('badge-card-28').click();
      await expect(page.getByTestId('badge-detail')).toContainText('Starlight Sovereign');
      await page.getByTestId('badges-close').click();

      // 9. Open Style Studio and equip Sky Thunder aura & Cinder Cloak cape live
      await page.getByTestId('nav-style').click();
      await expect(page.getByTestId('style-studio-screen')).toBeVisible();
      await page.getByTestId('style-aura-sky-thunder').click();
      await page.getByTestId('style-cape-cinder-cloak').click();
      await expect(page.getByTestId('style-aura-sky-thunder')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('style-cape-cinder-cloak')).toHaveAttribute('aria-pressed', 'true');
      await assertElementCanvasDrawn(page, '[data-testid="style-stage-canvas"]');

      const styleState = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
      expect(styleState.save.profiles.slot0.style.aura).toBe('sky-thunder');
      expect(styleState.save.profiles.slot0.style.cape).toBe('cinder-cloak');
      await page.getByTestId('style-close').click();

      // 10. Launch Starlight Sky-Hop -> Flap & Star Dash -> verify score rises -> Return
      await page.getByTestId('nav-skyhop').click();
      await expect(page.getByTestId('skyhop-screen')).toBeVisible();

      await page.getByTestId('skyhop-start').click();
      await page.waitForTimeout(180);
      await page.getByTestId('skyhop-flap').click();
      await page.getByTestId('skyhop-dash').click();
      await page.waitForTimeout(600);

      const skyScore = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().skyhopScore);
      expect(skyScore).toBeGreaterThan(0);
      const displayedScore = Number(await page.getByTestId('skyhop-score').textContent());
      expect(displayedScore).toBeGreaterThan(0);

      await page.getByTestId('skyhop-exit').click();
      await expect(page.getByTestId('overworld-screen')).toBeVisible();

      // 11. Final empirical integrity gates
      expect(telemetry.failedResponses, `4xx/5xx responses: ${JSON.stringify(telemetry.failedResponses)}`).toEqual([]);
      expect(telemetry.consoleErrors, `Console errors: ${telemetry.consoleErrors.join('; ')}`).toEqual([]);
      expect(telemetry.pageErrors, `Page errors: ${telemetry.pageErrors.join('; ')}`).toEqual([]);
    });
  });
}
