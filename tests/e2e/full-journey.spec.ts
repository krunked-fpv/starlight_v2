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
}

function attachCollectors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedLocalResponses: Array<{ url: string; status: number }> = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().startsWith('http://127.0.0.1:4173')) {
      failedLocalResponses.push({ url: res.url(), status: res.status() });
    }
  });

  return { consoleErrors, pageErrors, failedLocalResponses };
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
    const ctx = probe.getContext('2d', { willReadFrequently: true }) ?? probe.getContext('2d');
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

async function waitForBattleSettled(page: Page, timeout = 15_000): Promise<string> {
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

async function exitBattleCleanly(page: Page): Promise<void> {
  let phase = await waitForBattleSettled(page);
  if (phase === 'forced-switch') {
    const healthySwitch = page.locator('[data-testid^="battle-switch-slot-"]:not([disabled])').first();
    if (await healthySwitch.isVisible().catch(() => false)) {
      await healthySwitch.click();
      phase = await waitForBattleSettled(page);
    }
  }
  if (phase === 'evolving') {
    await page.getByTestId('battle-confirm-evolution').click();
    await page.getByTestId('battle-close-result').click();
  } else if (phase === 'victory' || phase === 'defeat') {
    await page.getByTestId('battle-close-result').click();
  } else {
    await page.getByTestId('battle-flee').click();
  }
  // Dismiss optional post-victory Rival/Shrine dialogue (GAMEPLAY-01)
  if (await page.getByTestId('dialogue-overlay').isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
  }
  await expect(page.getByTestId('overworld-screen')).toBeVisible();
}

for (const renderer of ['webgl2', 'canvas2d'] as const) {
  test.describe(`E2E Full Player Journey (${renderer})`, () => {
    test(`completes Title -> Starter Lab -> Overworld -> Briefing -> Wild & Shrine Battles -> 5-Tab Drawer -> Sky-Hop on ${renderer}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const telemetry = attachCollectors(page);
      await stubExternalSpriteCdns(page);

      await page.goto(`./?renderer=${renderer}`);
      await waitForAppBoot(page);

      const initialState = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
      expect(initialState.backend).toBe(renderer);
      expect(initialState.manifestLoaded).toBe(true);

      // 1. Title Vista: Violet & Ozias cards & pixel portraits rendered
      await expect(page.getByTestId('title-screen')).toBeVisible();
      await expect(page.getByTestId('profile-violet-meta')).toContainText('Violet');
      await expect(page.getByTestId('profile-ozias-meta')).toContainText('Ozias');
      await assertElementCanvasDrawn(page, '[data-testid="profile-violet-portrait"]');
      await assertElementCanvasDrawn(page, '[data-testid="profile-ozias-portrait"]');

      // 2. Choose Violet -> Starter Lab -> Choose Bulbasaur (#1)
      await page.getByTestId('title-play-violet').click();
      await expect(page.getByTestId('starter-screen')).toBeVisible();
      await assertElementCanvasDrawn(page, '[data-testid="starter-willow-canvas"]');
      await assertElementCanvasDrawn(page, '[data-testid="starter-canvas-1"]');
      await page.getByTestId('starter-choose-1').click();

      // 3. Starlight Village Overworld
      await expect(page.getByTestId('overworld-screen')).toBeVisible();
      await expect(page.getByTestId('hud-biome-name')).toHaveText('Starlight Village');
      await page.waitForFunction(
        () => {
          const st = window.__STARLIGHT_DEBUG__?.getState();
          const canvas = document.getElementById('starlight-canvas');
          if (!st || !canvas) return false;
          const rect = canvas.getBoundingClientRect();
          return (
            st.screen === 'overworld' &&
            st.frameStats.drawCalls > 0 &&
            rect.width > 0 &&
            rect.height > 0 &&
            Math.abs(st.camera.viewportWidth - rect.width) <= 2 &&
            Math.abs(st.camera.viewportHeight - rect.height) <= 2
          );
        },
        undefined,
        { timeout: 10_000 },
      );

      const owStats = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().frameStats);
      expect(owStats.drawCalls, `Expected live drawCalls > 0 on ${renderer}`).toBeGreaterThan(0);

      // 3a. Tap-to-Walk BFS canvas click from spawn (8, 15) -> tile (10, 15) via zoomed overhead projection
      const tapPoint = await page.evaluate(() => {
        const canvas = document.getElementById('starlight-canvas');
        const rect = canvas?.getBoundingClientRect();
        if (!rect || !window.__STARLIGHT_DEBUG__) return null;
        const pt = window.__STARLIGHT_DEBUG__.tileToScreen(10, 15);
        return { x: rect.left + pt.x, y: rect.top + pt.y };
      });
      expect(tapPoint).not.toBeNull();
      if (tapPoint) {
        await page.mouse.click(tapPoint.x, tapPoint.y);
      }
      await page.waitForFunction(
        () => (window.__STARLIGHT_DEBUG__?.getState().playerPos.x ?? 0) >= 10,
        undefined,
        { timeout: 10_000 },
      );

      // 3b. Arrow key walk left back toward center
      const posAfterTap = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().playerPos);
      await page.keyboard.down('ArrowLeft');
      try {
        await page.waitForFunction(
          (startX: number) => (window.__STARLIGHT_DEBUG__?.getState().playerPos.x ?? startX) < startX,
          posAfterTap.x,
          { timeout: 6_000 },
        );
      } finally {
        await page.keyboard.up('ArrowLeft');
      }
      const posAfterKey = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().playerPos);
      expect(posAfterKey.x).toBeLessThan(posAfterTap.x);

      // 3c. Warp to safe spawn (8, 15), step precisely to (7, 14) right below Healing Fountain (7, 13), and heal
      await page.getByTestId('warp-safe').click();
      await expect(page.getByTestId('toast-banner')).toContainText('Starlight Village');
      for (let step = 0; step < 8; step += 1) {
        const pos = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().playerPos);
        if (pos.x === 7 && pos.y === 14) break;
        const key = pos.y > 14 ? 'ArrowUp' : pos.y < 14 ? 'ArrowDown' : pos.x > 7 ? 'ArrowLeft' : 'ArrowRight';
        await page.keyboard.down(key);
        try {
          await page.waitForFunction(
            ({ sx, sy }) => {
              const p = window.__STARLIGHT_DEBUG__?.getState().playerPos;
              return Boolean(p && (p.x !== sx || p.y !== sy));
            },
            { sx: pos.x, sy: pos.y },
            { timeout: 3_000 },
          );
        } finally {
          await page.keyboard.up(key);
        }
      }
      await expect(page.getByTestId('interact-pill')).toBeVisible();
      await expect(page.getByTestId('interact-pill')).toContainText('Starlight Healing Fountain');
      await page.getByTestId('interact-pill').click();
      await expect(page.getByTestId('toast-banner')).toContainText('Starlight Healing Fountain');

      // 3d. Farm Zone warp + Biome warp via Island Guide
      await page.getByTestId('warp-farm').click();
      await expect(page.getByTestId('overworld-screen')).toBeVisible();
      const farmBiome = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().biomeId);
      expect(farmBiome).not.toBe('village');

      // 4. Tactical Readiness Briefing
      await page.getByTestId('nav-briefing').click();
      await expect(page.getByTestId('briefing-screen')).toBeVisible();
      await expect(page.getByTestId('briefing-tier-badge')).toBeVisible();
      await assertElementCanvasDrawn(page, '[data-testid="briefing-preview-canvas"]');
      await page.getByTestId('briefing-close').click();
      await expect(page.getByTestId('briefing-screen')).toBeHidden();

      // 5a. Wild Battle: move, Poké/Great/Star Ball, Potion (if damaged), Offline Rig toggle, Flee/Continue
      await page.evaluate(() =>
        window.__STARLIGHT_DEBUG__!.triggerEncounter('wild', { biomeId: 'forest', forceSpeciesId: 133 }),
      );
      await expect(page.getByTestId('battle-screen')).toBeVisible();
      await page.waitForFunction(
        () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
        undefined,
        { timeout: 20_000 },
      );

      const preMoveMsg = await page.getByTestId('battle-status-message').textContent();
      await page.getByTestId('battle-move-0').click();
      await waitForBattleSettled(page);
      const postMoveMsg = await page.getByTestId('battle-status-message').textContent();
      expect(postMoveMsg).not.toBe(preMoveMsg);

      // Use Potion if Bulbasaur took damage and battle is still in command phase
      const potionBtn = page.getByTestId('battle-potion');
      if (await potionBtn.isEnabled()) {
        await potionBtn.click();
        await waitForBattleSettled(page);
      }

      // Throw Poké Ball / Great Ball / Star Ball while still in command phase
      for (const ballTestId of ['battle-ball-poke', 'battle-ball-great', 'battle-ball-star'] as const) {
        const curPhase = await waitForBattleSettled(page);
        if (curPhase !== 'command') break;
        const btn = page.getByTestId(ballTestId);
        if (await btn.isEnabled()) {
          await btn.click();
          await waitForBattleSettled(page);
        }
      }

      // Toggle Offline Pixel Rig cleanly
      await page.getByTestId('battle-offline-rig').click();
      await expect(page.getByTestId('battle-offline-rig')).toHaveAttribute('aria-pressed', 'true');

      await exitBattleCleanly(page);

      // 5b. Shrine Battle: move, Potion if damaged, Offline Rig toggle, Flee/Continue
      await page.evaluate(() =>
        window.__STARLIGHT_DEBUG__!.triggerEncounter('shrine', { biomeId: 'forest' }),
      );
      await expect(page.getByTestId('battle-screen')).toBeVisible();
      await page.waitForFunction(
        () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
        undefined,
        { timeout: 20_000 },
      );
      await page.getByTestId('battle-move-0').click();
      const afterShrineMove = await waitForBattleSettled(page);
      if (afterShrineMove === 'command' && (await page.getByTestId('battle-potion').isEnabled())) {
        await page.getByTestId('battle-potion').click();
        await waitForBattleSettled(page);
      }
      await page.getByTestId('battle-offline-rig').click();
      await exitBattleCleanly(page);

      // 6. Unified 5-Tab Collector Drawer
      await page.getByTestId('nav-pokedex').click();
      await expect(page.getByTestId('collector-drawer')).toBeVisible();

      // Tab 1: 1,025 Pokédex search (#1025 & #25) + Holo Tilt + Cry Waveform
      await page.getByTestId('pokedex-search').fill('#1025');
      await page.getByTestId('pokedex-row-1025').click();
      await expect(page.getByTestId('pokedex-card-number')).toHaveText('#1025');
      await expect(page.getByTestId('pokedex-card-name')).toHaveText('Pecharunt');

      await page.getByTestId('pokedex-search').fill('#25');
      await page.getByTestId('pokedex-row-25').click();
      await expect(page.getByTestId('pokedex-card-number')).toHaveText('#0025');
      await expect(page.getByTestId('pokedex-card-name')).toHaveText('Pikachu');

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

      await page.getByTestId('pokedex-play-cry').click();
      await page.waitForTimeout(160);
      await assertElementCanvasDrawn(page, '[data-testid="pokedex-cry-canvas"]');

      // Tab 2: Team & Box
      await page.getByTestId('drawer-tab-team').click();
      await expect(page.getByTestId('drawer-panel-team')).toBeVisible();
      await expect(page.getByTestId('team-bag-strip')).toBeVisible();
      await expect(page.getByTestId('team-card-0')).toBeVisible();

      // Tab 3: 28 Badges
      await page.getByTestId('drawer-tab-badges').click();
      await expect(page.getByTestId('drawer-panel-badges')).toBeVisible();
      await expect(page.locator('[data-testid^="badge-card-"]')).toHaveCount(28);
      await page.getByTestId('badge-card-28').click();
      await expect(page.getByTestId('badge-detail')).toContainText('Terastal Star Crown');

      // Tab 5: Style Studio (outfit, accessory, cape, aura)
      await page.getByTestId('drawer-tab-style').click();
      await expect(page.getByTestId('drawer-panel-style')).toBeVisible();
      await page.getByTestId('style-outfit-aurora').click();
      await page.getByTestId('style-accessory-goggles').click();
      await page.getByTestId('style-cape-toggle').click();
      await page.getByTestId('style-aura-lightning').click();

      await expect(page.getByTestId('style-outfit-aurora')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('style-accessory-goggles')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('style-cape-toggle')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('style-aura-lightning')).toHaveAttribute('aria-pressed', 'true');
      await assertElementCanvasDrawn(page, '[data-testid="style-stage-canvas"]');

      const styleState = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
      expect(styleState.save.profiles.violet.appearance).toMatchObject({
        styleId: 'aurora',
        accessory: 'goggles',
        cape: true,
        aura: 'lightning',
      });

      // Tab 4: Island Guide -> Warp to Sapphire Lagoon (closes drawer & warps cleanly)
      await page.getByTestId('drawer-tab-guide').click();
      await expect(page.getByTestId('drawer-panel-guide')).toBeVisible();
      await expect(page.locator('[data-testid^="guide-biome-"]')).toHaveCount(18);
      await page.getByTestId('guide-warp-water').click();
      await expect(page.getByTestId('overworld-screen')).toBeVisible();
      await expect(page.getByTestId('hud-biome-name')).toHaveText('Sapphire Lagoon');

      // 7. Sky-Hop Arcade: gated until unlocked (BUG-11), then open, fly, Star Dash, score rises, Exit
      await expect(page.getByTestId('nav-skyhop')).toBeHidden();
      await page.evaluate(() => window.__STARLIGHT_DEBUG__!.openSkyHop());
      await expect(page.getByTestId('skyhop-screen')).toBeVisible();

      await page.getByTestId('skyhop-start').click();
      await expect(page.getByTestId('skyhop-center-card')).toBeHidden();

      // Fire Star Dash and steer onto Wave 1 Rising Starlight Arc Star 0 lane (yFrac 0.78) until score rises
      await page.getByTestId('skyhop-dash').click();
      const surfaceBox = await page.getByTestId('skyhop-flight-surface').boundingBox();
      if (surfaceBox) {
        await page.mouse.move(surfaceBox.x + surfaceBox.width * 0.4, surfaceBox.y + surfaceBox.height * 0.78);
        await page.mouse.down();
      }
      try {
        await page.waitForFunction(
          () => (window.__STARLIGHT_DEBUG__?.getState().skyhopScore ?? 0) > 0,
          undefined,
          { timeout: 25_000 },
        );
      } finally {
        if (surfaceBox) {
          await page.mouse.up();
        }
      }
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(120);
      await page.keyboard.up('ArrowUp');

      const skyScore = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().skyhopScore);
      expect(skyScore).toBeGreaterThan(0);
      const displayedScore = Number(await page.getByTestId('skyhop-score').textContent());
      expect(displayedScore).toBeGreaterThan(0);

      await page.getByTestId('skyhop-exit').click();
      await expect(page.getByTestId('overworld-screen')).toBeVisible();

      // 8. Final empirical integrity gates
      expect(
        telemetry.failedLocalResponses,
        `Local 4xx/5xx responses: ${JSON.stringify(telemetry.failedLocalResponses)}`,
      ).toEqual([]);
      expect(telemetry.consoleErrors, `Console errors: ${telemetry.consoleErrors.join('; ')}`).toEqual([]);
      expect(telemetry.pageErrors, `Page errors: ${telemetry.pageErrors.join('; ')}`).toEqual([]);
    });
  });
}
