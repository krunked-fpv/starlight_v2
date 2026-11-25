import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { getStarlightV1Dir, hasStarlightV1Repo, startReadOnlyV1Server } from './v1-static-server.mjs';

const HAS_V1_REPO = hasStarlightV1Repo();

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
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
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

function parsePpFromMoveText(text: string | null): number {
  const m = (text ?? '').match(/(\d+)\s*\/\s*(\d+)/);
  return m ? Number(m[1]) : -1;
}

async function bootV2ToOverworld(page: Page, renderer: 'webgl2' | 'canvas2d' = 'webgl2', starterId = 1): Promise<void> {
  await stubExternalSpriteCdns(page);
  await page.goto(`./?renderer=${renderer}`);
  await page.waitForFunction(
    () => typeof window.__STARLIGHT_DEBUG__?.getState === 'function' && window.__STARLIGHT_DEBUG__.getState().manifestLoaded,
    undefined,
    { timeout: 20_000 },
  );
  await expect(page.getByTestId('celestial-ui-shell')).toBeVisible();
  await page.getByTestId('title-play-violet').click();
  await expect(page.getByTestId('starter-screen')).toBeVisible();
  await page.getByTestId(`starter-choose-${starterId}`).click();
  await expect(page.getByTestId('overworld-screen')).toBeVisible();
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
}

test.describe('Starlight v1 vs v2 Gameplay, Camera & UX Parity Playtest', () => {
  test('Overworld overhead camera zooms to authentic zone scale on desktop (1366x768) & mobile (390x844) and tap-to-walk lands accurately', async ({
    browser,
  }) => {
    // Desktop 1366x768
    const deskCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const deskPage = await deskCtx.newPage();
    const deskTelemetry = attachCollectors(deskPage);
    await bootV2ToOverworld(deskPage, 'webgl2', 1);

    const deskCam = await deskPage.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().camera);
    expect(deskCam.visibleTilesX, 'Desktop overhead view should show ~14-18 tiles horizontally').toBeGreaterThanOrEqual(12);
    expect(deskCam.visibleTilesX, 'Desktop overhead view must NOT show the whole map (>20 tiles wide)').toBeLessThanOrEqual(20);
    expect(deskCam.zoom).toBeGreaterThanOrEqual(2);

    // Verify fresh starter caught count is strictly 1 (not 2)
    const caughtAfterStarter = await deskPage.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().save.profiles.violet.pokedex.caught[1]);
    expect(caughtAfterStarter).toBe(1);

    // Tap-to-walk accuracy check: project target tile (10, 15) from spawn (8, 15)
    const tapPt = await deskPage.evaluate(() => {
      const canvas = document.getElementById('starlight-canvas');
      const rect = canvas?.getBoundingClientRect();
      if (!rect || !window.__STARLIGHT_DEBUG__) return null;
      const pt = window.__STARLIGHT_DEBUG__.tileToScreen(10, 15);
      return { clientX: rect.left + pt.x, clientY: rect.top + pt.y };
    });
    expect(tapPt, 'Expected valid screen projection for tile (10,15)').not.toBeNull();
    if (tapPt) {
      await deskPage.mouse.click(tapPt.clientX, tapPt.clientY);
      await deskPage.waitForFunction(
        () => {
          const p = window.__STARLIGHT_DEBUG__?.getState().playerPos;
          return p && p.x === 10 && p.y === 15;
        },
        undefined,
        { timeout: 10_000 },
      );
    }

    // Keyboard WASD hold-to-walk check
    await deskPage.keyboard.down('KeyA');
    try {
      await deskPage.waitForFunction(
        () => (window.__STARLIGHT_DEBUG__?.getState().playerPos.x ?? 10) < 10,
        undefined,
        { timeout: 6_000 },
      );
    } finally {
      await deskPage.keyboard.up('KeyA');
    }
    const afterWasd = await deskPage.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().playerPos);
    expect(afterWasd.x).toBeLessThan(10);

    expect(deskTelemetry.consoleErrors).toEqual([]);
    expect(deskTelemetry.pageErrors).toEqual([]);
    expect(deskTelemetry.failedLocalResponses).toEqual([]);
    await deskCtx.close();

    // Mobile 390x844
    const mobCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const mobPage = await mobCtx.newPage();
    const mobTelemetry = attachCollectors(mobPage);
    await bootV2ToOverworld(mobPage, 'webgl2', 1);

    const mobCam = await mobPage.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().camera);
    expect(mobCam.visibleTilesX, 'Mobile overhead view should show ~9-12 tiles horizontally').toBeGreaterThanOrEqual(7);
    expect(mobCam.visibleTilesX, 'Mobile overhead view must NOT show >14 tiles wide').toBeLessThanOrEqual(14);

    // Mobile tap-to-walk accuracy check
    const mobTap = await mobPage.evaluate(() => {
      const canvas = document.getElementById('starlight-canvas');
      const rect = canvas?.getBoundingClientRect();
      if (!rect || !window.__STARLIGHT_DEBUG__) return null;
      const pt = window.__STARLIGHT_DEBUG__.tileToScreen(10, 15);
      return { clientX: rect.left + pt.x, clientY: rect.top + pt.y };
    });
    expect(mobTap).not.toBeNull();
    if (mobTap) {
      await mobPage.mouse.click(mobTap.clientX, mobTap.clientY);
      await mobPage.waitForFunction(
        () => {
          const p = window.__STARLIGHT_DEBUG__?.getState().playerPos;
          return p && p.x === 10 && p.y === 15;
        },
        undefined,
        { timeout: 10_000 },
      );
    }

    expect(mobTelemetry.consoleErrors).toEqual([]);
    expect(mobTelemetry.pageErrors).toEqual([]);
    expect(mobTelemetry.failedLocalResponses).toEqual([]);
    await mobCtx.close();
  });

  test('Overworld regressions parity: Compass -> Island Guide, Willow NPC, Fountain auto-heal, Secret Arcade attunement, Hotkeys & Switch Trainer', async ({
    page,
  }) => {
    const telemetry = attachCollectors(page);
    await bootV2ToOverworld(page, 'canvas2d', 1);

    // BUG-02: Live Compass Guidance is active (not "Compass Ready") and opens Island Guide
    const compassBtn = page.getByTestId('hud-compass');
    await expect(compassBtn).toBeVisible();
    await expect(compassBtn).not.toContainText('Compass Ready');
    await expect(compassBtn).toContainText(/Willow|Forest|Fern/i);
    await compassBtn.click();
    await expect(page.getByTestId('collector-drawer')).toBeVisible();
    await expect(page.getByTestId('drawer-panel-guide')).toBeVisible();
    // BUG-10: Field Quests render real progressText (e.g. "0/3 Forest species caught")
    await expect(page.getByTestId('drawer-panel-guide')).toContainText(/0\/3/);
    await page.getByTestId('drawer-close').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // BUG-11: Sky-Hop dock button hidden until Secret Arcade unlocked
    await expect(page.getByTestId('nav-skyhop')).toBeHidden();

    // BUG-12: Walk up onto Healing Fountain (7,13) via (7,14) and verify heal
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => (window.__STARLIGHT_DEBUG__?.getState().playerPos.y ?? 15) <= 14, undefined, { timeout: 5_000 });
    await page.keyboard.up('ArrowUp');
    await page.keyboard.down('ArrowLeft');
    await page.waitForFunction(() => (window.__STARLIGHT_DEBUG__?.getState().playerPos.x ?? 8) <= 7, undefined, { timeout: 5_000 });
    await page.keyboard.up('ArrowLeft');
    await expect(page.getByTestId('interact-pill')).toContainText(/Fountain/i);
    await page.getByTestId('interact-pill').click();
    await expect(page.getByTestId('toast-banner')).toContainText(/Fountain|restored/i);

    // BUG-01 & BUG-10: Talk to Professor Willow (9,12) cleanly with zero TypeError crash
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => (window.__STARLIGHT_DEBUG__?.getState().playerPos.x ?? 7) >= 9, undefined, { timeout: 5_000 });
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => (window.__STARLIGHT_DEBUG__?.getState().playerPos.y ?? 14) <= 13, undefined, { timeout: 5_000 });
    await page.keyboard.up('ArrowUp');

    const interactPill = page.getByTestId('interact-pill');
    if (await interactPill.isVisible().catch(() => false)) {
      await interactPill.click();
      await expect(page.getByTestId('dialogue-overlay')).toBeVisible();
      await page.keyboard.press('Space');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('dialogue-overlay')).toBeHidden();
    }

    // BUG-11: Secret Arcade wall (11,12) shows unattuned prompt before 1 badge / 5 species
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => (window.__STARLIGHT_DEBUG__?.getState().playerPos.x ?? 9) >= 11, undefined, { timeout: 5_000 });
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(180);
    await page.keyboard.press('Space');
    await page.waitForTimeout(220);
    const dlgVisible = await page.getByTestId('dialogue-overlay').isVisible().catch(() => false);
    if (dlgVisible) {
      // Page 1 introduces the Mysterious Star Emblem; page 2 gives the attunement prerequisite
      const page1Text = (await page.getByTestId('dialogue-overlay').textContent()) ?? '';
      if (!/Badge|species|attun/i.test(page1Text)) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(180);
      }
      await expect(page.getByTestId('dialogue-overlay')).toContainText(/Badge|species|attun|Emblem/i);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('dialogue-overlay')).toBeHidden();
    }
    await expect(page.getByTestId('nav-skyhop')).toBeHidden();

    // BUG-13: Hotkeys T (Farm Zone) & H (Safe Zone)
    await page.keyboard.press('KeyT');
    await page.waitForFunction(() => window.__STARLIGHT_DEBUG__?.getState().biomeId !== 'village', undefined, { timeout: 5_000 });
    await page.keyboard.press('KeyH');
    await page.waitForFunction(() => window.__STARLIGHT_DEBUG__?.getState().biomeId === 'village', undefined, { timeout: 5_000 });

    // BUG-08: Settings -> Switch Trainer Profile returns cleanly to Title screen
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();
    await page.getByTestId('setting-switch-trainer').click();
    await expect(page.getByTestId('title-screen')).toBeVisible();
    // Re-enter Violet directly into Overworld (progress preserved!)
    await page.getByTestId('title-play-violet').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedLocalResponses).toEqual([]);
  });

  test('Combat parity: wild move/PP/catch/run, rival hotkey & safe flee, shrine no-capture, and blackout defeat-reset recovery at (8,15)', async ({
    page,
  }) => {
    const telemetry = attachCollectors(page);
    await bootV2ToOverworld(page, 'canvas2d', 1);

    // 1. Wild Battle: move, catch attempt, clean exit
    await page.evaluate(() =>
      window.__STARLIGHT_DEBUG__!.triggerEncounter('wild', { biomeId: 'forest', forceSpeciesId: 10 }),
    );
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(() => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command', undefined, {
      timeout: 10_000,
    });

    const msgBefore = await page.getByTestId('battle-status-message').textContent();
    await page.getByTestId('battle-move-0').click();
    await page.waitForFunction(() => {
      const ph = window.__STARLIGHT_DEBUG__?.getState().battlePhase;
      return ph === 'command' || ph === 'victory' || ph === 'defeat' || ph === 'evolving';
    }, undefined, { timeout: 10_000 });
    const msgAfter = await page.getByTestId('battle-status-message').textContent();
    expect(msgAfter).not.toBe(msgBefore);

    const phaseAfterMove = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().battlePhase);
    if (phaseAfterMove === 'command') {
      await page.getByTestId('battle-ball-poke').click();
      await page.waitForFunction(() => {
        const ph = window.__STARLIGHT_DEBUG__?.getState().battlePhase;
        return ph === 'command' || ph === 'victory' || ph === 'defeat' || ph === 'evolving';
      }, undefined, { timeout: 10_000 });
    }

    const phaseToExit = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().battlePhase);
    if (phaseToExit === 'evolving') {
      await page.getByTestId('battle-confirm-evolution').click();
      await page.getByTestId('battle-close-result').click();
    } else if (phaseToExit === 'victory' || phaseToExit === 'defeat') {
      await page.getByTestId('battle-close-result').click();
    } else {
      await page.getByTestId('battle-flee').click();
    }
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // 2. Rival Battle: keyboard '1' move hotkey (BUG-13) + safe flee (BUG-15)
    await page.evaluate(() => window.__STARLIGHT_DEBUG__!.triggerEncounter('rival', { biomeId: 'forest' }));
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(() => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command', undefined, {
      timeout: 10_000,
    });
    const rivalMsgBefore = await page.getByTestId('battle-status-message').textContent();
    await page.keyboard.press('Digit1');
    await page.waitForFunction(() => {
      const ph = window.__STARLIGHT_DEBUG__?.getState().battlePhase;
      return (
        ph === 'command' ||
        ph === 'forced-switch' ||
        ph === 'victory' ||
        ph === 'defeat' ||
        ph === 'evolving'
      );
    }, undefined, { timeout: 10_000 });
    const rivalMsgAfter = await page.getByTestId('battle-status-message').textContent();
    expect(rivalMsgAfter).not.toBe(rivalMsgBefore);

    let rivalPhase = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().battlePhase);
    if (rivalPhase === 'forced-switch') {
      // Verify BUG-15 forced-switch auto-opens Switch Drawer and sending healthy partner returns cleanly to command
      await expect(page.getByTestId('battle-switch-drawer')).toBeVisible();
      const healthySwitch = page.locator('[data-testid^="battle-switch-slot-"]:not([disabled])').first();
      await healthySwitch.click();
      await page.waitForFunction(() => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command', undefined, {
        timeout: 6_000,
      });
      rivalPhase = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().battlePhase);
    }
    if (rivalPhase === 'victory' || rivalPhase === 'defeat') {
      await page.getByTestId('battle-close-result').click();
    } else if (rivalPhase === 'evolving') {
      await page.getByTestId('battle-confirm-evolution').click();
      await page.getByTestId('battle-close-result').click();
    } else {
      await expect(page.getByTestId('battle-flee')).toBeEnabled();
      await page.getByTestId('battle-flee').click();
    }
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // 3. Shrine Battle: capture forbidden (BUG-06) + blackout defeat recovery at Starlight Village (8,15)
    await page.evaluate(() => window.__STARLIGHT_DEBUG__!.warpBiome('crater'));
    await page.evaluate(() => window.__STARLIGHT_DEBUG__!.triggerEncounter('shrine', { biomeId: 'crater' }));
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(() => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command', undefined, {
      timeout: 10_000,
    });
    await expect(page.getByTestId('battle-ball-poke')).toBeDisabled();
    await expect(page.getByTestId('battle-ball-great')).toBeDisabled();
    await expect(page.getByTestId('battle-ball-star')).toBeDisabled();

    // Fight until Lv.5 squad faints against high-level Crater Shrine Guardian (handling forced-switch if 2+ team)
    for (let turn = 0; turn < 12; turn += 1) {
      const ph = await waitForBattleSettled(page);
      if (ph === 'defeat' || ph === 'victory') break;
      if (ph === 'forced-switch') {
        const healthySwitch = page.locator('[data-testid^="battle-switch-slot-"]:not([disabled])').first();
        if (await healthySwitch.isVisible().catch(() => false)) {
          await healthySwitch.click();
          await waitForBattleSettled(page);
        }
      } else if (ph === 'command') {
        await page.getByTestId('battle-move-1').click();
        await waitForBattleSettled(page);
      }
    }

    const endPhase = await waitForBattleSettled(page);
    expect(['defeat', 'victory', 'command']).toContain(endPhase);
    if (endPhase === 'defeat' || endPhase === 'victory') {
      await page.getByTestId('battle-close-result').click();
    } else {
      await page.getByTestId('battle-flee').click();
    }
    if (await page.getByTestId('dialogue-overlay').isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
    }

    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    if (endPhase === 'defeat') {
      // Mandatory v1 parity invariant: blackout resets cleanly to Starlight Village (8,15), full HP, walkable!
      const afterReset = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
      expect(afterReset.biomeId).toBe('village');
      expect(afterReset.playerPos).toEqual({ x: 8, y: 15 });
      const lead = afterReset.save.profiles.violet.team[0];
      expect(lead.hp).toBeGreaterThan(0);

      await page.keyboard.down('ArrowRight');
      try {
        await page.waitForFunction(
          () => (window.__STARLIGHT_DEBUG__?.getState().playerPos.x ?? 8) > 8,
          undefined,
          { timeout: 6_000 },
        );
      } finally {
        await page.keyboard.up('ArrowRight');
      }
      const moved = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().playerPos);
      expect(moved.x).toBeGreaterThan(8);
    }

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedLocalResponses).toEqual([]);
  });

  test('Side-by-side live Starlight v1 (C:\\dojo) vs Starlight v2 parity check', async ({ browser }) => {
    test.skip(!HAS_V1_REPO, `Starlight v1 repo not found at ${getStarlightV1Dir()}`);

    const v1Srv = await startReadOnlyV1Server();
    try {
      const ctxV1 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const ctxV2 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const pageV1 = await ctxV1.newPage();
      const pageV2 = await ctxV2.newPage();

      const telV2 = attachCollectors(pageV2);
      await stubExternalSpriteCdns(pageV1);

      // Boot v1
      await pageV1.goto(v1Srv.baseUrl, { waitUntil: 'domcontentloaded' });
      await pageV1.locator('#trainer-card-violet').waitFor({ state: 'visible', timeout: 15_000 });
      await pageV1.click('#trainer-card-violet');
      await pageV1.locator('.starter-pick-btn').first().waitFor({ state: 'visible', timeout: 15_000 });
      await pageV1.locator('.starter-pick-btn', { hasText: 'Bulbasaur' }).first().click();
      await pageV1.locator('#game-shell').waitFor({ state: 'visible', timeout: 15_000 });
      await pageV1.evaluate(() => {
        const w = window as unknown as { __starlightApp?: { closeDialogue?: () => void } };
        w.__starlightApp?.closeDialogue?.();
      });

      // Boot v2
      await bootV2ToOverworld(pageV2, 'webgl2', 1);

      // Compare core spawn, starter, roster & camera framing parity
      const v1Data = await pageV1.evaluate(async () => {
        const w = window as unknown as {
          __starlightApp: {
            overworld: {
              getProfile: () => { pos: { x: number; y: number }; team: Array<{ speciesId: number; level: number; maxHp: number }> };
              currentBiomeId: string;
              viewW: number;
              viewH: number;
              tileSize: number;
            };
          };
        };
        const app = w.__starlightApp;
        const prof = app.overworld.getProfile();
        const ow = app.overworld;
        const dynamicImport = new Function('p', 'return import(p)') as (
          p: string,
        ) => Promise<{ SPECIES: Record<string, unknown>; BADGES: unknown[]; BIOMES: Record<string, unknown> }>;
        const cfg = await dynamicImport('./js/config.js');
        return {
          spawnPos: { x: prof.pos.x, y: prof.pos.y },
          biome: ow.currentBiomeId,
          starterSpeciesId: prof.team[0]?.speciesId,
          starterLevel: prof.team[0]?.level,
          starterMaxHp: prof.team[0]?.maxHp,
          speciesCount: Object.keys(cfg.SPECIES).length,
          badgeCount: cfg.BADGES.length,
          biomeCount: Object.keys(cfg.BIOMES).length,
          tilesWide: Number((ow.viewW / ow.tileSize).toFixed(2)),
          tilesTall: Number((ow.viewH / ow.tileSize).toFixed(2)),
        };
      });

      const v2Data = await pageV2.evaluate(() => {
        const state = window.__STARLIGHT_DEBUG__!.getState();
        const prof = state.save.profiles.violet;
        return {
          spawnPos: { x: state.playerPos.x, y: state.playerPos.y },
          biome: state.biomeId,
          starterSpeciesId: prof.team[0]?.speciesId,
          starterLevel: prof.team[0]?.level,
          starterHp: prof.team[0]?.hp,
          camera: state.camera,
        };
      });

      // Exact spawn, biome, starter & stat parity
      expect(v2Data.spawnPos).toEqual(v1Data.spawnPos);
      expect(v2Data.biome).toBe(v1Data.biome);
      expect(v2Data.starterSpeciesId).toBe(v1Data.starterSpeciesId);
      expect(v2Data.starterLevel).toBe(v1Data.starterLevel);
      expect(v2Data.starterHp).toBe(v1Data.starterMaxHp);

      // Verify Collector counts in v2 match v1 (1025 species, 28 badges, 18 biomes) + BUG-19 unseen masking & authentic flavor
      await pageV2.getByTestId('nav-pokedex').click();
      await expect(pageV2.getByTestId('collector-drawer')).toBeVisible();
      await expect(pageV2.getByTestId('pokedex-holo-card')).toContainText('Caught (1)');
      await expect(pageV2.getByTestId('pokedex-holo-card')).not.toContainText('of Starlight Island.');
      await expect(pageV2.getByTestId('pokedex-row-2')).toContainText('???');
      await pageV2.getByTestId('pokedex-search').fill('#1025');
      await expect(pageV2.getByTestId('pokedex-row-1025')).toBeVisible();
      await expect(pageV2.getByTestId('pokedex-row-1025')).toContainText('???');
      expect(v1Data.speciesCount).toBe(1025);

      // Verify Team & Box stats + BUG-21 Style Studio live cosmetics + Adventure Record
      await pageV2.getByTestId('drawer-tab-team').click();
      await expect(pageV2.getByTestId('team-card-0')).toContainText(/ATK\s+\d+/);
      await expect(pageV2.getByTestId('team-card-0')).toContainText(/Evolves:\s+Ivysaur/i);

      await pageV2.getByTestId('drawer-tab-badges').click();
      await expect(pageV2.locator('[data-testid^="badge-card-"]')).toHaveCount(v1Data.badgeCount);

      await pageV2.getByTestId('drawer-tab-guide').click();
      await expect(pageV2.locator('[data-testid^="guide-biome-"]')).toHaveCount(v1Data.biomeCount);
      await expect(pageV2.getByTestId('drawer-panel-guide')).toContainText(/Earn 1 Badge or catch 5 species/i);

      await pageV2.getByTestId('drawer-tab-style').click();
      await expect(pageV2.getByTestId('drawer-panel-style')).toContainText(/Adventure Record/i);
      await pageV2.getByTestId('style-outfit-celestial').click();
      await pageV2.getByTestId('style-accessory-crown').click();
      await pageV2.getByTestId('style-aura-cosmic').click();

      await pageV2.getByTestId('drawer-close').click();

      // Compare v2 overhead camera framing against v1 overhead framing (both ~13-18 tiles wide!)
      expect(v2Data.camera.visibleTilesX).toBeGreaterThanOrEqual(12);
      expect(v2Data.camera.visibleTilesX).toBeLessThanOrEqual(20);
      expect(v1Data.tilesWide).toBeGreaterThanOrEqual(12);
      expect(v1Data.tilesWide).toBeLessThanOrEqual(20);

      // Verify Sapphire Lagoon shallow water (BUG-04) & Whispering Forest warp + Sky-Hop clean loop
      await pageV2.evaluate(() => window.__STARLIGHT_DEBUG__!.warpBiome('water'));
      await expect(pageV2.getByTestId('hud-biome-name')).toHaveText('Sapphire Lagoon');
      await pageV2.evaluate(() => window.__STARLIGHT_DEBUG__!.openSkyHop());
      await expect(pageV2.getByTestId('skyhop-screen')).toBeVisible();
      await pageV2.getByTestId('skyhop-start').click();
      await pageV2.getByTestId('skyhop-dash').click();
      await pageV2.waitForTimeout(350);
      await pageV2.getByTestId('skyhop-exit').click();
      await expect(pageV2.getByTestId('overworld-screen')).toBeVisible();
      await expect(pageV2.getByTestId('nav-skyhop')).toBeVisible();

      expect(telV2.consoleErrors).toEqual([]);
      expect(telV2.pageErrors).toEqual([]);
      expect(telV2.failedLocalResponses).toEqual([]);

      await ctxV1.close();
      await ctxV2.close();
    } finally {
      await v1Srv.close();
    }
  });

  test('Round 2 Combat Integrity: Anti-Spam Hard Lock, Poké Ball Capture Animation & Switch Hotkey Guard', async ({
    page,
  }) => {
    const telemetry = attachCollectors(page);
    await bootV2ToOverworld(page, 'canvas2d', 1);

    // 5A. Shutter & Intro Input Lock (COMBAT-01): spam during shutter/intro must NOT consume PP or abort intro
    await page.evaluate(() =>
      window.__STARLIGHT_DEBUG__!.triggerEncounter('wild', { biomeId: 'forest', forceSpeciesId: 25 }),
    );
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Digit1');
    }
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
      undefined,
      { timeout: 20_000 },
    );
    const move0TextBefore = await page.getByTestId('battle-move-0').textContent();
    const ppBefore = parsePpFromMoveText(move0TextBefore);
    expect(ppBefore, `Expected full PP on battle-move-0 after shutter spam, got "${move0TextBefore}"`).toBeGreaterThanOrEqual(20);
    // Check max PP equals current PP (0 PP consumed during shutter/intro!)
    const maxPpMatch = (move0TextBefore ?? '').match(/(\d+)\s*\/\s*(\d+)/);
    expect(maxPpMatch).not.toBeNull();
    if (maxPpMatch) {
      expect(Number(maxPpMatch[1])).toBe(Number(maxPpMatch[2]));
    }

    // 5B. 25x Rapid-Click + Digit1 Anti-Spam Hard Lock & Turn Pacing (COMBAT-01, COMBAT-02, COMBAT-12)
    const tStart = Date.now();
    await page.getByTestId('battle-move-0').click();

    // Immediately transitions out of command into an acting/animating phase and locks controls
    await page.waitForFunction(
      () => {
        const ph = window.__STARLIGHT_DEBUG__?.getState().battlePhase;
        return ph === 'player-acting' || ph === 'enemy-acting' || ph === 'animating';
      },
      undefined,
      { timeout: 2_500 },
    );
    await expect(page.getByTestId('battle-move-0')).toBeDisabled();
    await expect(page.getByTestId('battle-flee')).toBeDisabled();

    // Fire 15 synthetic DOM clicks + 10 Digit1 presses while turn is locked!
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="battle-move-0"]') as HTMLButtonElement | null;
      for (let i = 0; i < 15; i += 1) {
        btn?.click();
      }
    });
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('Digit1');
    }

    const phaseAfterSpam = await waitForBattleSettled(page);
    const turnElapsedMs = Date.now() - tStart;
    expect(
      turnElapsedMs,
      `Expected paced sequential turn (>= 450ms), NOT 0ms synchronous instant resolution (got ${turnElapsedMs}ms)`,
    ).toBeGreaterThanOrEqual(450);

    const statusAfterSpam = (await page.getByTestId('battle-status-message').textContent()) ?? '';
    expect(
      statusAfterSpam,
      'COMBAT-12: Single-beat statusMessage must not concatenate history with " • " bullets',
    ).not.toContain(' • ');

    if (phaseAfterSpam === 'command') {
      const move0TextAfter = await page.getByTestId('battle-move-0').textContent();
      const ppAfter = parsePpFromMoveText(move0TextAfter);
      expect(
        ppAfter,
        `Anti-spam lock failed: 25 spam inputs consumed ${ppBefore - ppAfter} PP instead of exactly 1 PP`,
      ).toBe(ppBefore - 1);

      // 5C. Poké Ball Capture Animation Sequence (COMBAT-03): must enter 'capturing' phase with locked controls
      await page.getByTestId('battle-ball-poke').click();
      await page.waitForFunction(
        () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'capturing',
        undefined,
        { timeout: 2_500 },
      );
      await expect(page.getByTestId('battle-move-0')).toBeDisabled();
      await expect(page.getByTestId('battle-flee')).toBeDisabled();
      await waitForBattleSettled(page, 18_000);
    }

    // Exit wild battle cleanly
    const wildEndPh = await waitForBattleSettled(page);
    if (wildEndPh === 'evolving') {
      await page.getByTestId('battle-confirm-evolution').click();
      await page.getByTestId('battle-close-result').click();
    } else if (wildEndPh === 'victory' || wildEndPh === 'defeat') {
      await page.getByTestId('battle-close-result').click();
    } else {
      await page.getByTestId('battle-flee').click();
    }
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // Ensure Violet has at least 2 team members so Switch Drawer can open in Rival battle
    const teamLen = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().save.profiles.violet.team.length);
    if (teamLen < 2) {
      await page.evaluate(() =>
        window.__STARLIGHT_DEBUG__!.triggerEncounter('wild', { biomeId: 'forest', forceSpeciesId: 10 }),
      );
      await page.waitForFunction(
        () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
        undefined,
        { timeout: 20_000 },
      );
      await page.getByTestId('battle-ball-star').click();
      const catchPh = await waitForBattleSettled(page, 18_000);
      if (catchPh === 'victory' || catchPh === 'defeat') {
        await page.getByTestId('battle-close-result').click();
      } else {
        await page.getByTestId('battle-flee').click();
      }
      await expect(page.getByTestId('overworld-screen')).toBeVisible();
    }

    // 5D. Switch Drawer Hotkey Guard (COMBAT-06) in Forest Rival Battle
    await page.evaluate(() => window.__STARLIGHT_DEBUG__!.triggerEncounter('rival', { biomeId: 'forest' }));
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
      undefined,
      { timeout: 20_000 },
    );
    const switchBtn = page.getByTestId('battle-switch-btn');
    if (await switchBtn.isEnabled()) {
      const ppBeforeDrawer = parsePpFromMoveText(await page.getByTestId('battle-move-0').textContent());
      await switchBtn.click();
      await expect(page.getByTestId('battle-switch-drawer')).toBeVisible();
      await page.keyboard.press('Digit1');
      await page.keyboard.press('Digit1');
      await page.keyboard.press('KeyR');
      await page.waitForTimeout(220);
      // Must still be in battle, command phase, switch drawer open, zero PP spent!
      await expect(page.getByTestId('battle-screen')).toBeVisible();
      await expect(page.getByTestId('battle-switch-drawer')).toBeVisible();
      const ppAfterDrawer = parsePpFromMoveText(await page.getByTestId('battle-move-0').textContent());
      expect(ppAfterDrawer, 'COMBAT-06: Hotkeys must NOT fire behind open Switch Drawer').toBe(ppBeforeDrawer);
      // Escape closes Switch Drawer without fleeing!
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('battle-switch-drawer')).toBeHidden();
      await expect(page.getByTestId('battle-screen')).toBeVisible();
    }
    await page.getByTestId('battle-flee').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedLocalResponses).toEqual([]);
  });

  test('Round 2 Boss Difficulty Parity: Lv.5 Bulbasaur spamming resisted attack vs Lv.12 Volcano Moltres Shrine MUST lose & rescue-reset', async ({
    page,
  }) => {
    const bossTel = attachCollectors(page);
    await bootV2ToOverworld(page, 'canvas2d', 1);

    await page.evaluate(() => window.__STARLIGHT_DEBUG__!.warpBiome('volcano'));
    await page.evaluate(() => window.__STARLIGHT_DEBUG__!.triggerEncounter('shrine', { biomeId: 'volcano' }));
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
      undefined,
      { timeout: 20_000 },
    );

    // Capture strictly disabled on Shrine Guardian
    await expect(page.getByTestId('battle-ball-poke')).toBeDisabled();
    await expect(page.getByTestId('battle-ball-great')).toBeDisabled();
    await expect(page.getByTestId('battle-ball-star')).toBeDisabled();

    let bossEndPhase = 'command';
    for (let turn = 0; turn < 10; turn += 1) {
      bossEndPhase = await waitForBattleSettled(page, 18_000);
      if (bossEndPhase === 'defeat' || bossEndPhase === 'victory') break;
      if (bossEndPhase === 'command') {
        // Spam resisted Grass move (Vine Whip) blindly against Lv.12 Fire/Flying Moltres
        await page.getByTestId('battle-move-1').click();
      }
    }

    expect(
      bossEndPhase,
      'COMBAT-04 Difficulty Parity: Lv.5 Bulbasaur spamming resisted Vine Whip vs Lv.12 Moltres Shrine MUST lose (defeat), NEVER win!',
    ).toBe('defeat');

    await page.getByTestId('battle-close-result').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    const afterBossReset = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(afterBossReset.biomeId).toBe('village');
    expect(afterBossReset.playerPos).toEqual({ x: 8, y: 15 });
    expect(afterBossReset.save.profiles.violet.team[0].hp).toBeGreaterThan(0);

    expect(bossTel.consoleErrors).toEqual([]);
    expect(bossTel.pageErrors).toEqual([]);
    expect(bossTel.failedLocalResponses).toEqual([]);
  });
});
