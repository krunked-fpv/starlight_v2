import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

const SUBPATH_URL = 'http://127.0.0.1:4173/starlight_v2/?renderer=canvas2d';

/**
 * Valid deterministic 2-frame 2x2 GIF89a:
 *   Frame 1: solid red (255,0,0), delay 120ms
 *   Frame 2: solid blue (0,0,255), delay 150ms
 */
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

async function stubExternalSpritesOnContext(
  context: BrowserContext,
  onIntercept?: (url: string) => void,
): Promise<void> {
  const body = toFulfillBody(STUB_TWO_FRAME_GIF);
  const handler = async (route: Route) => {
    onIntercept?.(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'image/gif',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
      body,
    });
  };
  await context.route('https://raw.githubusercontent.com/**', handler);
  await context.route('https://play.pokemonshowdown.com/**', handler);
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

async function assertCanvasNonBlank(page: Page, selector: string): Promise<void> {
  const stats = await page.evaluate((sel: string) => {
    const canvas = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
      return { ok: false, nonTransparent: 0, distinct: 0, tainted: false };
    }
    const probe = document.createElement('canvas');
    const pw = Math.min(120, canvas.width);
    const ph = Math.min(80, canvas.height);
    probe.width = pw;
    probe.height = ph;
    const pctx = probe.getContext('2d', { willReadFrequently: true }) ?? probe.getContext('2d');
    if (!pctx) return { ok: false, nonTransparent: 0, distinct: 0, tainted: false };
    try {
      pctx.drawImage(canvas, 0, 0, pw, ph);
      const data = pctx.getImageData(0, 0, pw, ph).data;
      let nonTransparent = 0;
      const colors = new Set<number>();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
          nonTransparent += 1;
          colors.add(((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3));
        }
      }
      return { ok: true, nonTransparent, distinct: colors.size, tainted: false };
    } catch {
      return { ok: false, nonTransparent: 0, distinct: 0, tainted: true };
    }
  }, selector);

  expect(stats.tainted, `Canvas ${selector} must NOT be tainted by CORS`).toBe(false);
  expect(stats.ok, `Canvas ${selector} must exist with positive dimensions`).toBe(true);
  expect(stats.nonTransparent, `Canvas ${selector} must not be transparent/blank`).toBeGreaterThan(20);
  expect(stats.distinct, `Canvas ${selector} must have visible tonal/color variance`).toBeGreaterThan(3);
}

test.describe('Red-Team: GitHub Pages Subpath (/starlight_v2/), Offline PWA & Animated GIF Audit', () => {
  test('serves /starlight_v2/ cleanly with zero 4xx/5xx failures, valid manifest, all 8 baked atlases, and all 99 SVG symbols', async ({
    context,
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await stubExternalSpritesOnContext(context);

    const failedResponses: Array<{ url: string; status: number }> = [];
    const failedRequests: Array<{ url: string; reason: string }> = [];
    const okUrls = new Set<string>();

    // Verify GitHub Pages redirect /starlight_v2 -> /starlight_v2/
    const redirectRes = await page.request.get('http://127.0.0.1:4173/starlight_v2', {
      maxRedirects: 0,
    });
    expect([301, 302]).toContain(redirectRes.status());
    expect(redirectRes.headers().location).toBe('/starlight_v2/');

    page.on('response', (res) => {
      if (res.status() >= 400) {
        failedResponses.push({ url: res.url(), status: res.status() });
      } else {
        const parsed = new URL(res.url());
        if (parsed.origin === 'http://127.0.0.1:4173') {
          okUrls.add(parsed.pathname);
        }
      }
    });
    page.on('requestfailed', (req) => {
      failedRequests.push({ url: req.url(), reason: req.failure()?.errorText ?? 'unknown' });
    });

    await page.goto(SUBPATH_URL, { waitUntil: 'networkidle' });
    await waitForAppBoot(page);

    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().manifestLoaded === true,
      undefined,
      { timeout: 10_000 },
    );

    // Explicitly validate manifest.webmanifest and emblem icon under /starlight_v2/
    const manifestAudit = await page.evaluate(async () => {
      const res = await fetch(new URL('./manifest.webmanifest', document.baseURI).toString());
      const json = res.ok ? await res.json() : null;
      const iconUrl = json?.icons?.[0]?.src
        ? new URL(json.icons[0].src, document.baseURI).toString()
        : null;
      const iconRes = iconUrl ? await fetch(iconUrl) : null;
      return {
        status: res.status,
        shortName: json?.short_name,
        startUrl: json?.start_url,
        iconStatus: iconRes?.status ?? 0,
      };
    });
    expect(manifestAudit.status).toBe(200);
    expect(manifestAudit.shortName).toBe('Starlight v2');
    expect(manifestAudit.startUrl).toBe('./');
    expect(manifestAudit.iconStatus).toBe(200);

    // Verify ALL 8 baked atlases + manifest + starlight-icons.svg loaded cleanly under /starlight_v2/
    for (const expectedAsset of [
      '/starlight_v2/atlases/manifest.json',
      '/starlight_v2/atlases/terrain-atlas.png',
      '/starlight_v2/atlases/terrain-normal.png',
      '/starlight_v2/atlases/terrain-emissive.png',
      '/starlight_v2/atlases/props-atlas.png',
      '/starlight_v2/atlases/props-normal.png',
      '/starlight_v2/atlases/props-emissive.png',
      '/starlight_v2/atlases/characters-atlas.png',
      '/starlight_v2/atlases/fallbacks-atlas.png',
      '/starlight_v2/icons/starlight-icons.svg',
    ]) {
      expect(okUrls.has(expectedAsset), `Expected ${expectedAsset} to load 200 OK under subpath`).toBe(true);
    }

    // Wait for async ensureSvgSpriteSheet() to inject all 99 SVG symbols
    await page.waitForFunction(
      () => document.querySelectorAll('#svg-sprite-host symbol').length === 99,
      undefined,
      { timeout: 10_000 },
    );

    const svgAudit = await page.evaluate(() => {
      const spriteSvg = document.querySelector('#svg-sprite-host svg');
      const spriteDisplay = spriteSvg ? window.getComputedStyle(spriteSvg).display : 'missing';
      const symbols = Array.from(document.querySelectorAll('#svg-sprite-host symbol'));
      const ids = symbols.map((s) => s.id);
      return { count: symbols.length, ids, spriteDisplay };
    });
    expect(svgAudit.count).toBe(99);
    expect(
      svgAudit.spriteDisplay,
      'Sprite <svg> inside #svg-sprite-host must NOT use display:none (breaks Chromium url(#gradient) paint servers)',
    ).not.toBe('none');
    expect(svgAudit.ids).toEqual(
      expect.arrayContaining([
        'icon-pokeball',
        'icon-greatball',
        'icon-starball',
        'icon-potion',
        'icon-star-shard',
        'icon-cheer-heart',
        'icon-composure',
        'icon-briefing',
        'icon-compass',
        'icon-lab',
        'icon-type-electric',
        'icon-type-fairy',
        'icon-type-dragon',
        'icon-badge-1',
        'icon-badge-14',
        'icon-badge-28',
      ]),
    );
    for (let i = 1; i <= 28; i += 1) {
      expect(svgAudit.ids).toContain(`icon-badge-${i}`);
    }

    expect(failedResponses, `Unexpected 4xx/5xx responses: ${JSON.stringify(failedResponses)}`).toEqual([]);
    expect(failedRequests, `Unexpected failed requests: ${JSON.stringify(failedRequests)}`).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('executes full gameplay loop offline after starlight-v2-cache-3.1.0 SW activation with zero errors or broken images', async ({
    context,
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await stubExternalSpritesOnContext(context);

    await page.goto(SUBPATH_URL, { waitUntil: 'networkidle' });
    await waitForAppBoot(page);

    // Wait for Service Worker activation and cache population
    const swStatus = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        return { supported: false, active: false, cacheNames: [] as string[], cachedCount: 0 };
      }
      const reg = await navigator.serviceWorker.ready;
      const cacheNames = await caches.keys();
      let cachedCount = 0;
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        cachedCount += keys.length;
      }
      return {
        supported: true,
        active: Boolean(reg.active),
        cacheNames,
        cachedCount,
      };
    });
    expect(swStatus.supported).toBe(true);
    expect(swStatus.active).toBe(true);
    expect(swStatus.cacheNames).toContain('starlight-v2-cache-3.1.0');
    expect(swStatus.cachedCount).toBeGreaterThanOrEqual(30);

    // Cut network completely — true offline PWA mode
    await context.setOffline(true);

    // 1. Title -> Starter Lab -> Overworld
    await expect(page.getByTestId('title-screen')).toBeVisible();
    await page.getByTestId('title-play-violet').click();
    await expect(page.getByTestId('starter-screen')).toBeVisible();
    await page.getByTestId('starter-choose-1').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await page.waitForTimeout(220);
    await assertCanvasNonBlank(page, '#starlight-canvas');

    // 2. Battle with Offline Pixel Rig active
    await page.evaluate(() =>
      window.__STARLIGHT_DEBUG__!.triggerEncounter('wild', { biomeId: 'forest', forceSpeciesId: 25 }),
    );
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
      undefined,
      { timeout: 10_000 },
    );
    await page.getByTestId('battle-offline-rig').click();
    await expect(page.getByTestId('battle-offline-rig')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('battle-move-0').click();
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
      { timeout: 15_000 },
    );
    await assertCanvasNonBlank(page, '#starlight-canvas');

    const bPhase = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState().battlePhase);
    if (bPhase === 'victory' || bPhase === 'defeat') {
      await page.getByTestId('battle-close-result').click();
    } else if (bPhase === 'evolving') {
      await page.getByTestId('battle-confirm-evolution').click();
      await page.getByTestId('battle-close-result').click();
    } else {
      await page.getByTestId('battle-flee').click();
    }
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // 3. Unified 5-Tab Collector Drawer offline
    await page.getByTestId('nav-pokedex').click();
    await expect(page.getByTestId('collector-drawer')).toBeVisible();

    // Tab 1: Pokédex #1025 + Cry Waveform
    await page.getByTestId('pokedex-search').fill('#1025');
    await page.getByTestId('pokedex-row-1025').click();
    await expect(page.getByTestId('pokedex-card-number')).toHaveText('#1025');
    await page.getByTestId('pokedex-play-cry').click();
    await page.waitForTimeout(160);
    await assertCanvasNonBlank(page, '[data-testid="pokedex-portrait-canvas"]');
    await assertCanvasNonBlank(page, '[data-testid="pokedex-cry-canvas"]');

    // Tab 2: Team & Box
    await page.getByTestId('drawer-tab-team').click();
    await expect(page.getByTestId('drawer-panel-team')).toBeVisible();
    await expect(page.getByTestId('team-card-0')).toBeVisible();

    // Tab 3: 28 Badges
    await page.getByTestId('drawer-tab-badges').click();
    await expect(page.getByTestId('drawer-panel-badges')).toBeVisible();
    await expect(page.locator('[data-testid^="badge-card-"]')).toHaveCount(28);
    await page.getByTestId('badge-card-28').click();

    // Tab 4: Island Guide
    await page.getByTestId('drawer-tab-guide').click();
    await expect(page.getByTestId('drawer-panel-guide')).toBeVisible();
    await expect(page.locator('[data-testid^="guide-biome-"]')).toHaveCount(18);

    // Tab 5: Style Studio
    await page.getByTestId('drawer-tab-style').click();
    await expect(page.getByTestId('drawer-panel-style')).toBeVisible();
    await page.getByTestId('style-aura-lightning').click();
    await page.waitForTimeout(160);
    await assertCanvasNonBlank(page, '[data-testid="style-stage-canvas"]');

    await page.getByTestId('drawer-close').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // 4. Sky-Hop Arcade offline
    await page.evaluate(() => window.__STARLIGHT_DEBUG__!.openSkyHop());
    await expect(page.getByTestId('skyhop-screen')).toBeVisible();
    await page.getByTestId('skyhop-start').click();
    await page.waitForTimeout(180);
    await page.getByTestId('skyhop-dash').click();
    await page.waitForTimeout(260);
    await assertCanvasNonBlank(page, '#starlight-canvas');
    await page.getByTestId('skyhop-exit').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // Zero broken <img> elements anywhere in DOM
    const brokenImages = await page.evaluate(() =>
      Array.from(document.images)
        .filter((img) => !img.complete || img.naturalWidth === 0)
        .map((img) => img.src),
    );
    expect(brokenImages).toEqual([]);

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('cold offline page.reload() succeeds cleanly after Service Worker warms caches', async ({
    context,
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await stubExternalSpritesOnContext(context);

    await page.goto(SUBPATH_URL, { waitUntil: 'networkidle' });
    await waitForAppBoot(page);

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });

    // Cut network completely and trigger a cold offline reload
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppBoot(page);

    await expect(page.getByTestId('title-screen')).toBeVisible();
    await expect(page.getByTestId('profile-violet')).toBeVisible();
    await expect(page.getByTestId('profile-ozias')).toBeVisible();

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('intercepts external animated GIF sprite URL with deterministic 2-frame GIF89a, increments spriteCacheVersion, and renders battle untainted', async ({
    browser,
  }) => {
    // Fresh context without prior SW sprite cache so page.route deterministically intercepts external animated GIFs
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = attachErrorCollector(page);
    const interceptedGifUrls: string[] = [];

    await page.route('https://raw.githubusercontent.com/**', async (route) => {
      const url = route.request().url();
      if (url.endsWith('.gif')) {
        interceptedGifUrls.push(url);
      }
      await route.fulfill({
        status: 200,
        contentType: 'image/gif',
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: toFulfillBody(STUB_TWO_FRAME_GIF),
      });
    });

    await page.goto(SUBPATH_URL);
    await waitForAppBoot(page);

    // Wait for initial sprite preloads to decode our deterministic 2-frame GIF89a and bump spriteCacheVersion
    await page.waitForFunction(
      () => (window.__STARLIGHT_DEBUG__?.getState().spriteCacheVersion ?? 0) > 0,
      undefined,
      { timeout: 10_000 },
    );

    const versionAfterBoot = await page.evaluate(
      () => window.__STARLIGHT_DEBUG__!.getState().spriteCacheVersion,
    );
    expect(versionAfterBoot).toBeGreaterThan(0);
    expect(interceptedGifUrls.length).toBeGreaterThan(0);

    // Choose Violet -> Bulbasaur -> trigger Wild Pikachu (#25) battle with live animated sprite (Offline Rig OFF)
    await page.getByTestId('title-play-violet').click();
    await page.getByTestId('starter-choose-1').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    const versionBeforeBattle = await page.evaluate(
      () => window.__STARLIGHT_DEBUG__!.getState().spriteCacheVersion,
    );

    await page.evaluate(() =>
      window.__STARLIGHT_DEBUG__!.triggerEncounter('wild', { biomeId: 'forest', forceSpeciesId: 133 }),
    );
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
      undefined,
      { timeout: 10_000 },
    );

    // Wait for Eevee (#133) front GIF + Bulbasaur (#1) back GIF decode to increment spriteCacheVersion further
    await page.waitForFunction(
      (prevVer: number) => (window.__STARLIGHT_DEBUG__?.getState().spriteCacheVersion ?? 0) > prevVer,
      versionBeforeBattle,
      { timeout: 10_000 },
    );

    // Confirm Offline Pixel Rig is OFF (rendering live multi-frame decoded GIF onto single canvas)
    await expect(page.getByTestId('battle-offline-rig')).toHaveAttribute('aria-pressed', 'false');
    expect(interceptedGifUrls.some((u) => u.includes('/133.gif'))).toBe(true);

    // Wait across both frame intervals (120ms + 150ms) and prove zero canvas taint & non-blank pixels
    await page.waitForTimeout(300);
    await assertCanvasNonBlank(page, '#starlight-canvas');

    const dataUrlOk = await page.evaluate(() => {
      const canvas = document.getElementById('starlight-canvas') as HTMLCanvasElement | null;
      if (!canvas) return false;
      const url = canvas.toDataURL('image/png');
      return url.startsWith('data:image/png;base64,') && url.length > 200;
    });
    expect(dataUrlOk, 'Single-canvas toDataURL() must succeed with zero CORS taint').toBe(true);

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
    await context.close();
  });
});
