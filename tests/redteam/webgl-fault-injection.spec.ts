import { expect, test, type Page } from '@playwright/test';

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
    const probeCtx = probeCanvas.getContext('2d');
    if (!probeCtx) {
      throw new Error('Could not create probe 2D context');
    }

    // Attempt direct 2D readback first; fall back to drawImage inside rAF for WebGL2 canvases
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
        // Quantize slightly to count genuine chromatic/tonal variance
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

test.describe('Red-Team: WebGL2 Context Loss & SwiftShader Parity Torture', () => {
  test('mid-overworld WebGL2 context loss hot-swaps to Canvas2D with live frame continuity', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);

    await page.goto('./?renderer=webgl2');
    await waitForAppBoot(page);

    const bootState = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(bootState.capabilities.webgl2Supported).toBe(true);
    expect(bootState.backend).toBe('webgl2');

    // Enter overworld and confirm active rendering & frame loop advancement
    await page.getByTestId('enter-world-btn').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await page.waitForTimeout(350);

    const beforeLoss = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect.soft(beforeLoss.frameStats.fps, 'FPS before context loss').toBeGreaterThan(0);
    expect.soft(beforeLoss.frameStats.drawCalls, 'drawCalls before context loss').toBeGreaterThan(0);

    // Inject GPU WebGL2 context loss mid-overworld
    const simulated = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.simulateContextLoss());
    expect(simulated).toBe(true);

    // Wait for seamless fallback to Canvas2D
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

    // Verify render loop continues ticking without freeze and pixels are non-blank
    await page.waitForTimeout(350);
    const afterLoss2 = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(afterLoss2.save.profiles.slot0.playtimeSeconds).toBeGreaterThan(
      afterLoss1.save.profiles.slot0.playtimeSeconds,
    );
    expect.soft(afterLoss2.frameStats.fps, 'FPS after context loss').toBeGreaterThan(0);
    expect.soft(afterLoss2.frameStats.drawCalls, 'drawCalls after context loss').toBeGreaterThan(0);

    const pixelAudit = await sampleMainCanvasPixels(page);
    expect.soft(pixelAudit.nonTransparentCount, 'Canvas non-transparent pixels after loss').toBeGreaterThan(
      pixelAudit.sampledCount * 0.8,
    );
    expect.soft(pixelAudit.distinctColors, 'Canvas color variance after loss').toBeGreaterThan(6);

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('mid-battle Shrine VFX WebGL2 context loss keeps battle interactive and live', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);

    await page.goto('./?renderer=webgl2');
    await waitForAppBoot(page);

    await page.getByTestId('enter-world-btn').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // Launch Shrine encounter under WebGL2
    await page.getByTestId('encounter-shrine').click();
    await expect(page.getByTestId('battle-screen')).toBeVisible();

    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
      undefined,
      { timeout: 10_000 },
    );

    // Fire elemental move VFX then immediately kill WebGL2 context mid-animation
    await page.getByTestId('battle-move-0').click();
    const lost = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.simulateContextLoss());
    expect(lost).toBe(true);

    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().backend === 'canvas2d',
      undefined,
      { timeout: 10_000 },
    );

    // Confirm battle turn resolves cleanly back to interactive state without hanging
    await page.waitForFunction(() => {
      const phase = window.__STARLIGHT_DEBUG__?.getState().battlePhase;
      return phase === 'command' || phase === 'victory' || phase === 'defeat';
    }, undefined, { timeout: 10_000 });

    const midBattle1 = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(midBattle1.battleActive).toBe(true);
    expect.soft(midBattle1.frameStats.drawCalls, 'Mid-battle drawCalls after context loss').toBeGreaterThan(0);

    // Verify battle dock remains interactive
    await page.getByTestId('battle-offline-rig').click();
    await expect(page.getByTestId('battle-offline-rig')).toHaveAttribute('aria-pressed', 'true');

    await page.waitForTimeout(250);
    const midBattle2 = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(midBattle2.save.profiles.slot0.playtimeSeconds).toBeGreaterThan(
      midBattle1.save.profiles.slot0.playtimeSeconds,
    );

    const pixelAudit = await sampleMainCanvasPixels(page);
    expect.soft(pixelAudit.nonTransparentCount, 'Battle canvas non-transparent pixels after loss').toBeGreaterThan(
      pixelAudit.sampledCount * 0.8,
    );
    expect.soft(pixelAudit.distinctColors, 'Battle canvas color variance after loss').toBeGreaterThan(6);

    await page.getByTestId('battle-flee').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('Canvas2D SwiftShader parity mode renders crisp non-blank pixels, clamps dt <= 50ms, and switches renderer via Settings UI', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);

    await page.goto('./?renderer=canvas2d');
    await waitForAppBoot(page);

    const initState = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(initState.backend).toBe('canvas2d');

    await page.getByTestId('enter-world-btn').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // Walk across overworld via keyboard input
    const posBefore = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().playerPos);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(420);
    await page.keyboard.up('ArrowRight');
    const posAfter = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().playerPos);
    expect(posAfter.x).toBeGreaterThan(posBefore.x + 0.3);

    // Verify non-blank Canvas2D pixel output and dt clamp <= 50ms
    const overworldStats = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().frameStats);
    expect.soft(overworldStats.drawCalls, 'Canvas2D overworld drawCalls').toBeGreaterThan(0);
    expect(overworldStats.clampedDtMs).toBeGreaterThan(0);
    expect(overworldStats.clampedDtMs).toBeLessThanOrEqual(50);

    const overworldPixels = await sampleMainCanvasPixels(page);
    expect.soft(overworldPixels.nonTransparentCount, 'Canvas2D overworld non-transparent pixels').toBeGreaterThan(
      overworldPixels.sampledCount * 0.85,
    );
    expect.soft(overworldPixels.distinctColors, 'Canvas2D overworld distinct colors').toBeGreaterThan(8);

    // Trigger wild battle and verify non-blank battle frame
    await page.getByTestId('encounter-wild').click();
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
      undefined,
      { timeout: 10_000 },
    );

    const battlePixels = await sampleMainCanvasPixels(page);
    expect.soft(battlePixels.nonTransparentCount, 'Canvas2D battle non-transparent pixels').toBeGreaterThan(
      battlePixels.sampledCount * 0.85,
    );
    expect.soft(battlePixels.distinctColors, 'Canvas2D battle distinct colors').toBeGreaterThan(8);

    await page.getByTestId('battle-flee').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // Switch renderer live via Settings UI (Canvas2D -> WebGL2 -> Canvas2D)
    await page.getByTestId('settings-toggle').click();
    await expect(page.getByTestId('settings-panel')).toBeVisible();

    await page.getByTestId('setting-renderer').selectOption('webgl2');
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().backend === 'webgl2',
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(220);
    const glStats = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().frameStats);
    expect.soft(glStats.drawCalls, 'WebGL2 drawCalls after Settings switch').toBeGreaterThan(0);
    expect(glStats.clampedDtMs).toBeLessThanOrEqual(50);

    await page.getByTestId('setting-renderer').selectOption('canvas2d');
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().backend === 'canvas2d',
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(220);

    const finalPixels = await sampleMainCanvasPixels(page);
    expect.soft(finalPixels.nonTransparentCount, 'Canvas2D final non-transparent pixels').toBeGreaterThan(
      finalPixels.sampledCount * 0.85,
    );
    expect.soft(finalPixels.distinctColors, 'Canvas2D final distinct colors').toBeGreaterThan(8);

    const finalStats = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().frameStats);
    expect(finalStats.clampedDtMs).toBeGreaterThan(0);
    expect(finalStats.clampedDtMs).toBeLessThanOrEqual(50);

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });
});
