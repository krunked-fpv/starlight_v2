import { expect, test, type Page } from '@playwright/test';

const SUBPATH_URL = 'http://127.0.0.1:4173/starlight_v2/?renderer=canvas2d';

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

async function assertCanvasNonBlank(page: Page, selector: string, soft = false): Promise<void> {
  const stats = await page.evaluate((sel: string) => {
    const canvas = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
      return { ok: false, nonTransparent: 0, distinct: 0 };
    }
    const probe = document.createElement('canvas');
    const pw = Math.min(120, canvas.width);
    const ph = Math.min(80, canvas.height);
    probe.width = pw;
    probe.height = ph;
    const pctx = probe.getContext('2d');
    if (!pctx) return { ok: false, nonTransparent: 0, distinct: 0 };
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
    return { ok: true, nonTransparent, distinct: colors.size };
  }, selector);

  const check = soft ? expect.soft : expect;
  check(stats.ok, `Canvas ${selector} must exist with positive dimensions`).toBe(true);
  check(stats.nonTransparent, `Canvas ${selector} must not be transparent/blank`).toBeGreaterThan(20);
  check(stats.distinct, `Canvas ${selector} must have visible visual variance`).toBeGreaterThan(3);
}

test.describe('Red-Team: GitHub Pages Subpath (/starlight_v2/) & Offline PWA Audit', () => {
  test('serves /starlight_v2/ cleanly with zero 404/5xx failures, valid manifest, and all 72 SVG symbols', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    const failedResponses: Array<{ url: string; status: number }> = [];
    const failedRequests: Array<{ url: string; reason: string }> = [];
    const okUrls = new Set<string>();

    // Verify GitHub Pages-style redirect from /starlight_v2 -> /starlight_v2/
    const redirectRes = await page.request.get('http://127.0.0.1:4173/starlight_v2', {
      maxRedirects: 0,
    });
    expect([301, 302]).toContain(redirectRes.status());
    expect(redirectRes.headers().location).toBe('/starlight_v2/');

    page.on('response', (res) => {
      if (res.status() >= 400) {
        failedResponses.push({ url: res.url(), status: res.status() });
      } else {
        okUrls.add(new URL(res.url()).pathname);
      }
    });
    page.on('requestfailed', (req) => {
      failedRequests.push({ url: req.url(), reason: req.failure()?.errorText ?? 'unknown' });
    });

    await page.goto(SUBPATH_URL, { waitUntil: 'networkidle' });
    await waitForAppBoot(page);

    // Confirm atlas manifest loaded cleanly
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().manifestLoaded === true,
      undefined,
      { timeout: 10_000 },
    );

    // Explicitly validate manifest.webmanifest and emblem icon under subpath
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

    // Verify all baked assets resolved under /starlight_v2/
    expect(okUrls.has('/starlight_v2/atlases/manifest.json')).toBe(true);
    expect(okUrls.has('/starlight_v2/atlases/terrain-atlas.png')).toBe(true);
    expect(okUrls.has('/starlight_v2/atlases/terrain-normal.png')).toBe(true);
    expect(okUrls.has('/starlight_v2/atlases/terrain-emissive.png')).toBe(true);
    expect(okUrls.has('/starlight_v2/atlases/props-atlas.png')).toBe(true);
    expect(okUrls.has('/starlight_v2/atlases/characters-atlas.png')).toBe(true);
    expect(okUrls.has('/starlight_v2/icons/starlight-icons.svg')).toBe(true);

    // Verify all 72 bespoke SVG symbols injected into #svg-sprite-host AND sprite <svg> is not display:none
    // (Chromium drops url(#linearGradient) paint servers inside <use> when the host <svg> has display:none!)
    const svgAudit = await page.evaluate(() => {
      const spriteSvg = document.querySelector('#svg-sprite-host svg');
      const spriteDisplay = spriteSvg ? window.getComputedStyle(spriteSvg).display : 'missing';
      const symbols = Array.from(document.querySelectorAll('#svg-sprite-host symbol'));
      const ids = symbols.map((s) => s.id);
      return { count: symbols.length, ids, spriteDisplay };
    });
    expect(svgAudit.count).toBe(72);
    expect
      .soft(
        svgAudit.spriteDisplay,
        'Sprite <svg> inside #svg-sprite-host must NOT use display:none (breaks Chromium url(#gradient) paint servers in <use> icons)',
      )
      .not.toBe('none');
    expect(svgAudit.ids).toEqual(
      expect.arrayContaining([
        'icon-pokeball',
        'icon-starball',
        'icon-potion',
        'icon-composure',
        'icon-briefing',
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

  test('executes full gameplay loop offline after Service Worker activation with zero errors or broken images', async ({
    context,
    page,
  }) => {
    const errors = attachErrorCollector(page);

    await page.goto(SUBPATH_URL, { waitUntil: 'networkidle' });
    await waitForAppBoot(page);

    // Wait for Service Worker registration, activation, and precache population
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
    expect(swStatus.cacheNames.some((n) => n.startsWith('starlight-v2-cache-'))).toBe(true);
    expect(swStatus.cachedCount).toBeGreaterThanOrEqual(11);

    // Cut network completely — true offline PWA mode
    await context.setOffline(true);

    // 1. Overworld
    await page.getByTestId('enter-world-btn').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await page.waitForTimeout(220);
    await assertCanvasNonBlank(page, '#starlight-canvas', true);

    // 2. Battle with Offline Elemental Art Rig active
    await page.getByTestId('encounter-wild').click();
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
      undefined,
      { timeout: 10_000 },
    );
    await page.getByTestId('battle-offline-rig').click();
    await expect(page.getByTestId('battle-offline-rig')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('battle-move-0').click();
    await page.waitForFunction(() => {
      const p = window.__STARLIGHT_DEBUG__?.getState().battlePhase;
      return p === 'command' || p === 'victory' || p === 'defeat';
    }, undefined, { timeout: 10_000 });
    await assertCanvasNonBlank(page, '#starlight-canvas', true);
    await page.getByTestId('battle-flee').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // 3. 1,025 Pokédex + procedural cry waveform offline
    await page.getByTestId('nav-pokedex').click();
    await expect(page.getByTestId('pokedex-screen')).toBeVisible();
    await page.getByTestId('pokedex-search').fill('#1025');
    await page.getByTestId('pokedex-row-1025').click();
    await expect(page.getByTestId('pokedex-card-number')).toHaveText('#1025');
    await page.getByTestId('pokedex-play-cry').click();
    await page.waitForTimeout(160);
    await assertCanvasNonBlank(page, '[data-testid="pokedex-portrait-canvas"]');
    await assertCanvasNonBlank(page, '[data-testid="pokedex-cry-canvas"]');
    await page.getByTestId('pokedex-close').click();

    // 4. 28 Badges showcase offline
    await page.getByTestId('nav-badges').click();
    await expect(page.getByTestId('badges-screen')).toBeVisible();
    await expect(page.locator('[data-testid^="badge-card-"]')).toHaveCount(28);
    await page.getByTestId('badge-card-28').click();
    await page.getByTestId('badges-close').click();

    // 5. Style Studio offline
    await page.getByTestId('nav-style').click();
    await expect(page.getByTestId('style-studio-screen')).toBeVisible();
    await page.getByTestId('style-aura-sky-thunder').click();
    await page.waitForTimeout(160);
    await assertCanvasNonBlank(page, '[data-testid="style-stage-canvas"]');
    await page.getByTestId('style-close').click();

    // 6. Starlight Sky-Hop offline
    await page.getByTestId('nav-skyhop').click();
    await expect(page.getByTestId('skyhop-screen')).toBeVisible();
    await page.getByTestId('skyhop-start').click();
    await page.waitForTimeout(180);
    await page.getByTestId('skyhop-flap').click();
    await page.waitForTimeout(260);
    await assertCanvasNonBlank(page, '#starlight-canvas', true);
    await page.getByTestId('skyhop-exit').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // Assert zero broken <img> elements anywhere in the DOM
    const brokenImages = await page.evaluate(() =>
      Array.from(document.images)
        .filter((img) => !img.complete || img.naturalWidth === 0)
        .map((img) => img.src),
    );
    expect(brokenImages).toEqual([]);

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('offline reload succeeds cleanly when Service Worker has warmed caches', async ({
    context,
    page,
  }) => {
    const errors = attachErrorCollector(page);

    await page.goto(SUBPATH_URL, { waitUntil: 'networkidle' });
    await waitForAppBoot(page);

    // Wait for SW ready so sw.js takes control of client
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });

    // Go offline immediately after initial visit and attempt a cold offline reload
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppBoot(page);

    await expect(page.getByTestId('title-screen')).toBeVisible();
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });
});
