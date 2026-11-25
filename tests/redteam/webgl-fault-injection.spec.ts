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

async function enterOverworldWithStarter(page: Page): Promise<void> {
  await page.getByTestId('title-play-violet').click();
  await expect(page.getByTestId('starter-screen')).toBeVisible();
  await page.getByTestId('starter-choose-1').click();
  await expect(page.getByTestId('overworld-screen')).toBeVisible();
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

async function exitActiveBattleCleanly(page: Page): Promise<void> {
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
  if (await page.getByTestId('dialogue-overlay').isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
  }
  await expect(page.getByTestId('overworld-screen')).toBeVisible();
}

interface CanvasPixelAudit {
  width: number;
  height: number;
  sampledCount: number;
  nonTransparentCount: number;
  distinctColors: number;
  meanLuma: number;
  mode: '2d' | 'toDataURL';
}

async function sampleMainCanvasPixels(page: Page): Promise<CanvasPixelAudit> {
  return page.evaluate(async () => {
    const canvas = document.getElementById('starlight-canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      throw new Error('#starlight-canvas element missing');
    }
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) {
      return {
        width: w,
        height: h,
        sampledCount: 0,
        nonTransparentCount: 0,
        distinctColors: 0,
        meanLuma: 0,
        mode: '2d' as const,
      };
    }

    const probeCanvas = document.createElement('canvas');
    const pw = Math.min(160, w);
    const ph = Math.min(90, h);
    probeCanvas.width = pw;
    probeCanvas.height = ph;
    const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true }) ?? probeCanvas.getContext('2d');
    if (!probeCtx) {
      throw new Error('Could not create probe 2D context');
    }

    const direct2d = canvas.getContext('2d');
    let data: Uint8ClampedArray;
    let mode: '2d' | 'toDataURL' = '2d';

    if (direct2d) {
      probeCtx.drawImage(canvas, 0, 0, pw, ph);
      data = probeCtx.getImageData(0, 0, pw, ph).data;
    } else {
      mode = 'toDataURL';
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      probeCtx.drawImage(canvas, 0, 0, pw, ph);
      data = probeCtx.getImageData(0, 0, pw, ph).data;
    }

    let nonTransparentCount = 0;
    let lumaSum = 0;
    const colorBuckets = new Set<number>();
    const totalPixels = pw * ph;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a > 0) {
        nonTransparentCount += 1;
        lumaSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        colorBuckets.add(key);
      }
    }

    return {
      width: w,
      height: h,
      sampledCount: totalPixels,
      nonTransparentCount,
      distinctColors: colorBuckets.size,
      meanLuma: nonTransparentCount > 0 ? lumaSum / nonTransparentCount : 0,
      mode,
    };
  });
}

test.describe('Red-Team: WebGL2 Context Loss & SwiftShader Canvas2D Parity Torture', () => {
  test('mid-overworld WebGL2 context loss hot-swaps to Canvas2D with live frame continuity', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await stubExternalSpriteCdns(page);

    await page.goto('./?renderer=webgl2');
    await waitForAppBoot(page);

    const bootState = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(bootState.capabilities.webgl2Supported).toBe(true);
    expect(bootState.backend).toBe('webgl2');

    await enterOverworldWithStarter(page);
    await page.waitForFunction(
      () => {
        const s = window.__STARLIGHT_DEBUG__?.getState();
        return Boolean(s && s.frameStats.fps > 0 && s.frameStats.drawCalls > 0);
      },
      undefined,
      { timeout: 10_000 },
    );

    const beforeLoss = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(beforeLoss.frameStats.fps).toBeGreaterThan(0);
    expect(beforeLoss.frameStats.drawCalls).toBeGreaterThan(0);

    // Inject WebGL2 context loss mid-overworld
    const simulated = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.simulateContextLoss());
    expect(simulated).toBe(true);

    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().backend === 'canvas2d',
      undefined,
      { timeout: 10_000 },
    );

    const afterLoss1 = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(afterLoss1.backend).toBe('canvas2d');
    expect(afterLoss1.frameStats.contextLostCount).toBeGreaterThanOrEqual(1);
    expect(
      afterLoss1.contextEvents.some(
        (ev) => ev.type === 'lost' && ev.activeBackend === 'canvas2d',
      ),
    ).toBe(true);

    // Confirm live loop ticks & player movement still responds smoothly on Canvas2D
    const posBefore = afterLoss1.playerPos;
    await page.keyboard.down('ArrowRight');
    try {
      await page.waitForFunction(
        (startX: number) => (window.__STARLIGHT_DEBUG__?.getState().playerPos.x ?? startX) > startX,
        posBefore.x,
        { timeout: 6_000 },
      );
    } finally {
      await page.keyboard.up('ArrowRight');
    }

    const afterLoss2 = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(afterLoss2.playerPos.x).toBeGreaterThan(posBefore.x);
    expect(afterLoss2.frameStats.fps).toBeGreaterThan(0);
    expect(afterLoss2.frameStats.drawCalls).toBeGreaterThan(0);
    expect(afterLoss2.frameStats.clampedDtMs).toBeGreaterThan(0);
    expect(afterLoss2.frameStats.clampedDtMs).toBeLessThanOrEqual(50);

    const pixelAudit = await sampleMainCanvasPixels(page);
    expect(pixelAudit.nonTransparentCount).toBeGreaterThan(pixelAudit.sampledCount * 0.8);
    expect(pixelAudit.distinctColors).toBeGreaterThan(6);

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('mid-battle Shrine VFX WebGL2 context loss hot-swaps cleanly and keeps battle interactive', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await stubExternalSpriteCdns(page);

    await page.goto('./?renderer=webgl2');
    await waitForAppBoot(page);
    await enterOverworldWithStarter(page);

    // Launch Shrine Guardian encounter under WebGL2
    await page.evaluate(() =>
      window.__STARLIGHT_DEBUG__!.triggerEncounter('shrine', { biomeId: 'forest' }),
    );
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
      undefined,
      { timeout: 20_000 },
    );

    // Fire elemental move VFX and kill WebGL2 context immediately mid-VFX
    const msgBefore = await page.getByTestId('battle-status-message').textContent();
    await page.getByTestId('battle-move-0').click();
    const lost = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.simulateContextLoss());
    expect(lost).toBe(true);

    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().backend === 'canvas2d',
      undefined,
      { timeout: 10_000 },
    );

    await page.waitForFunction(() => {
      const phase = window.__STARLIGHT_DEBUG__?.getState().battlePhase;
      return phase === 'command' || phase === 'victory' || phase === 'defeat' || phase === 'evolving';
    }, undefined, { timeout: 10_000 });

    const midBattle = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(midBattle.battleActive).toBe(true);
    expect(midBattle.frameStats.contextLostCount).toBeGreaterThanOrEqual(1);
    expect(midBattle.frameStats.drawCalls).toBeGreaterThan(0);

    const msgAfter = await page.getByTestId('battle-status-message').textContent();
    expect(msgAfter).not.toBe(msgBefore);

    // Offline Pixel Rig toggle remains responsive after context loss
    await page.getByTestId('battle-offline-rig').click();
    await expect(page.getByTestId('battle-offline-rig')).toHaveAttribute('aria-pressed', 'true');

    // If still in command phase, verify another move executes cleanly too
    if (midBattle.battlePhase === 'command') {
      await page.getByTestId('battle-move-0').click();
      await waitForBattleSettled(page);
    }

    await page.waitForTimeout(220);
    const pixelAudit = await sampleMainCanvasPixels(page);
    expect(pixelAudit.nonTransparentCount).toBeGreaterThan(pixelAudit.sampledCount * 0.8);
    expect(pixelAudit.distinctColors).toBeGreaterThan(6);

    await exitActiveBattleCleanly(page);

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('Canvas2D SwiftShader parity renders crisp non-blank pixels, clamps dt <= 50ms, and switches renderer via Settings UI', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await stubExternalSpriteCdns(page);

    await page.goto('./?renderer=canvas2d');
    await waitForAppBoot(page);

    const initState = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(initState.backend).toBe('canvas2d');

    await enterOverworldWithStarter(page);

    // Walk across Starlight Village via keyboard input
    const posBefore = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().playerPos);
    await page.keyboard.down('ArrowRight');
    try {
      await page.waitForFunction(
        (startX: number) => (window.__STARLIGHT_DEBUG__?.getState().playerPos.x ?? startX) > startX,
        posBefore.x,
        { timeout: 6_000 },
      );
    } finally {
      await page.keyboard.up('ArrowRight');
    }
    const posAfter = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().playerPos);
    expect(posAfter.x).toBeGreaterThan(posBefore.x);

    const overworldStats = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().frameStats);
    expect(overworldStats.drawCalls).toBeGreaterThan(0);
    expect(overworldStats.clampedDtMs).toBeGreaterThan(0);
    expect(overworldStats.clampedDtMs).toBeLessThanOrEqual(50);

    const overworldPixels = await sampleMainCanvasPixels(page);
    expect(overworldPixels.nonTransparentCount).toBeGreaterThan(overworldPixels.sampledCount * 0.85);
    expect(overworldPixels.distinctColors).toBeGreaterThan(8);

    // Trigger wild battle and confirm crisp non-blank pixels on Canvas2D
    await page.evaluate(() =>
      window.__STARLIGHT_DEBUG__!.triggerEncounter('wild', { biomeId: 'forest', forceSpeciesId: 25 }),
    );
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(180);

    const battlePixels = await sampleMainCanvasPixels(page);
    expect(battlePixels.nonTransparentCount).toBeGreaterThan(battlePixels.sampledCount * 0.85);
    expect(battlePixels.distinctColors).toBeGreaterThan(8);

    await exitActiveBattleCleanly(page);

    // Live Settings renderer switch: canvas2d -> webgl2 -> canvas2d
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();

    await page.getByTestId('setting-renderer').selectOption('webgl2');
    await page.waitForFunction(
      () => {
        const s = window.__STARLIGHT_DEBUG__?.getState();
        return Boolean(s && s.backend === 'webgl2' && s.frameStats.drawCalls > 0);
      },
      undefined,
      { timeout: 10_000 },
    );

    const glStats = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().frameStats);
    expect(glStats.drawCalls).toBeGreaterThan(0);
    expect(glStats.clampedDtMs).toBeLessThanOrEqual(50);

    await page.getByTestId('setting-renderer').selectOption('canvas2d');
    await page.waitForFunction(
      () => {
        const s = window.__STARLIGHT_DEBUG__?.getState();
        return Boolean(s && s.backend === 'canvas2d' && s.frameStats.drawCalls > 0 && s.frameStats.clampedDtMs > 0);
      },
      undefined,
      { timeout: 10_000 },
    );

    const finalPixels = await sampleMainCanvasPixels(page);
    expect(finalPixels.nonTransparentCount).toBeGreaterThan(finalPixels.sampledCount * 0.85);
    expect(finalPixels.distinctColors).toBeGreaterThan(8);

    const finalStats = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().frameStats);
    expect(finalStats.clampedDtMs).toBeGreaterThan(0);
    expect(finalStats.clampedDtMs).toBeLessThanOrEqual(50);

    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });
});
