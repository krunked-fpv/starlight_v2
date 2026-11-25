import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile-360x640', width: 360, height: 640 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'chromebook-1366x768', width: 1366, height: 768 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
] as const;

/** Valid deterministic 2-frame 2x2 GIF89a */
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

async function scanScreenForRawEmojis(page: Page, screenLabel: string): Promise<string[]> {
  return page.evaluate((label: string) => {
    const emojiRegex =
      /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u20E3]/gu;
    const violations: string[] = [];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parentTag = node.parentElement?.tagName;
      if (parentTag === 'SCRIPT' || parentTag === 'STYLE') continue;
      const text = node.nodeValue ?? '';
      const matches = text.match(emojiRegex);
      if (matches && matches.length > 0) {
        violations.push(`[${label}] text node "${text.trim().slice(0, 60)}" matched ${matches.join(',')}`);
      }
    }

    const attrs = ['aria-label', 'title', 'placeholder'] as const;
    for (const el of Array.from(document.querySelectorAll('*'))) {
      for (const attr of attrs) {
        const val = el.getAttribute(attr);
        if (!val) continue;
        const matches = val.match(emojiRegex);
        if (matches && matches.length > 0) {
          violations.push(`[${label}] ${el.tagName}[${attr}="${val}"] matched ${matches.join(',')}`);
        }
      }
    }

    return violations;
  }, screenLabel);
}

interface TouchAndOverflowReport {
  scrollWidth: number;
  clientWidth: number;
  overflowPx: number;
  undersizedControls: Array<{
    tag: string;
    testId: string;
    width: number;
    height: number;
  }>;
}

async function auditViewportControlsAndOverflow(page: Page): Promise<TouchAndOverflowReport> {
  return page.evaluate(() => {
    const docEl = document.documentElement;
    const scrollWidth = Math.max(docEl.scrollWidth, document.body.scrollWidth);
    const clientWidth = docEl.clientWidth;
    const overflowPx = Math.max(0, scrollWidth - clientWidth);

    const undersizedControls: Array<{
      tag: string;
      testId: string;
      width: number;
      height: number;
    }> = [];

    const controls = Array.from(document.querySelectorAll('button, select, input'));
    for (const el of controls) {
      const htmlEl = el as HTMLElement;
      if (htmlEl.closest('[hidden]')) continue;
      const style = window.getComputedStyle(htmlEl);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        continue;
      }
      const rect = htmlEl.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      if (rect.width < 43.9 || rect.height < 43.9) {
        undersizedControls.push({
          tag: htmlEl.tagName.toLowerCase(),
          testId: htmlEl.getAttribute('data-testid') ?? htmlEl.className ?? 'unnamed',
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        });
      }
    }

    return { scrollWidth, clientWidth, overflowPx, undersizedControls };
  });
}

test.describe('Red-Team: Accessibility, Zero-Emoji Ban, 4-Viewport CLS/Targets, Reduced Motion & CRT', () => {
  test('enforces strict Zero-Emoji Ban across EVERY screen and all 5 Collector Drawer tabs', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await stubExternalSpriteCdns(page);
    const allViolations: string[] = [];

    await page.goto('./?renderer=canvas2d');
    await waitForAppBoot(page);

    // 1. Title
    await expect(page.getByTestId('title-screen')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'title')));

    // 2. Starter Lab
    await page.getByTestId('title-play-violet').click();
    await expect(page.getByTestId('starter-screen')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'starter-lab')));
    await page.getByTestId('starter-choose-1').click();

    // 3. Overworld
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'overworld')));

    // 4. Tactical Readiness Briefing
    await page.getByTestId('nav-briefing').click();
    await expect(page.getByTestId('briefing-screen')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'briefing')));
    await page.getByTestId('briefing-close').click();

    // 5. Battle Command Deck
    await page.evaluate(() =>
      window.__STARLIGHT_DEBUG__!.triggerEncounter('wild', { biomeId: 'forest', forceSpeciesId: 25 }),
    );
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
      undefined,
      { timeout: 20_000 },
    );
    allViolations.push(...(await scanScreenForRawEmojis(page, 'battle')));
    await page.getByTestId('battle-flee').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    // 6. Unified 5-Tab Collector Drawer (all 5 tabs!)
    await page.getByTestId('nav-pokedex').click();
    await expect(page.getByTestId('collector-drawer')).toBeVisible();

    // 6a. Pokédex
    await expect(page.getByTestId('drawer-panel-pokedex')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'drawer-pokedex')));

    // 6b. Team & Box
    await page.getByTestId('drawer-tab-team').click();
    await expect(page.getByTestId('drawer-panel-team')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'drawer-team')));

    // 6c. Badges
    await page.getByTestId('drawer-tab-badges').click();
    await expect(page.getByTestId('drawer-panel-badges')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'drawer-badges')));

    // 6d. Island Guide
    await page.getByTestId('drawer-tab-guide').click();
    await expect(page.getByTestId('drawer-panel-guide')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'drawer-guide')));

    // 6e. Style Studio
    await page.getByTestId('drawer-tab-style').click();
    await expect(page.getByTestId('drawer-panel-style')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'drawer-style')));

    await page.getByTestId('drawer-close').click();

    // 7. Settings & Parent Zone
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'settings')));
    await page.getByTestId('settings-close').click();

    // 8. Sky-Hop Arcade (unlock & open cleanly since nav-skyhop is gated until unlocked per BUG-11)
    await page.evaluate(() => window.__STARLIGHT_DEBUG__!.openSkyHop());
    await expect(page.getByTestId('skyhop-screen')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'skyhop')));

    expect(allViolations, `Raw Unicode emojis detected:\n${allViolations.join('\n')}`).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  for (const vp of VIEWPORTS) {
    test(`CLS < 0.001, >= 44x44px touch targets, and zero horizontal overflow on ${vp.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const errors = attachErrorCollector(page);
      await stubExternalSpriteCdns(page);

      // Install buffered LayoutShift PerformanceObserver before first paint
      await page.addInitScript(() => {
        const w = window as unknown as {
          __STARLIGHT_CLS__?: number;
          __STARLIGHT_CLS_ENTRIES__?: Array<{ value: number; startTime: number }>;
        };
        w.__STARLIGHT_CLS__ = 0;
        w.__STARLIGHT_CLS_ENTRIES__ = [];
        if (typeof PerformanceObserver !== 'undefined') {
          try {
            const obs = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                const ls = entry as PerformanceEntry & {
                  value?: number;
                  hadRecentInput?: boolean;
                };
                if (!ls.hadRecentInput && typeof ls.value === 'number') {
                  w.__STARLIGHT_CLS__ = (w.__STARLIGHT_CLS__ ?? 0) + ls.value;
                  w.__STARLIGHT_CLS_ENTRIES__?.push({
                    value: ls.value,
                    startTime: ls.startTime,
                  });
                }
              }
            });
            obs.observe({ type: 'layout-shift', buffered: true });
          } catch {
            // Unsupported observer type fallback
          }
        }
      });

      await page.goto('./?renderer=canvas2d');
      await waitForAppBoot(page);
      await page.waitForTimeout(220);

      const assertScreenClean = async (screenName: string) => {
        const audit = await auditViewportControlsAndOverflow(page);
        expect(audit.overflowPx, `${vp.name} [${screenName}] horizontal overflow`).toBe(0);
        expect(
          audit.undersizedControls,
          `${vp.name} [${screenName}] undersized targets: ${JSON.stringify(audit.undersizedControls)}`,
        ).toEqual([]);
      };

      // 1. Title
      await assertScreenClean('title');

      // 2. Starter Lab
      await page.getByTestId('title-play-violet').click();
      await expect(page.getByTestId('starter-screen')).toBeVisible();
      await assertScreenClean('starter-lab');

      // 3. Overworld
      await page.getByTestId('starter-choose-1').click();
      await expect(page.getByTestId('overworld-screen')).toBeVisible();
      await page.waitForTimeout(160);
      await assertScreenClean('overworld');

      // 4. Battle
      await page.evaluate(() =>
        window.__STARLIGHT_DEBUG__!.triggerEncounter('wild', { biomeId: 'forest', forceSpeciesId: 25 }),
      );
      await expect(page.getByTestId('battle-screen')).toBeVisible();
      await page.waitForFunction(
        () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
        undefined,
        { timeout: 20_000 },
      );
      await assertScreenClean('battle');
      await page.getByTestId('battle-flee').click();
      await expect(page.getByTestId('overworld-screen')).toBeVisible();

      // 5. Collector Drawer (all 5 tabs)
      await page.getByTestId('nav-pokedex').click();
      await expect(page.getByTestId('collector-drawer')).toBeVisible();
      await assertScreenClean('drawer-pokedex');

      await page.getByTestId('drawer-tab-team').click();
      await expect(page.getByTestId('drawer-panel-team')).toBeVisible();
      await assertScreenClean('drawer-team');

      await page.getByTestId('drawer-tab-badges').click();
      await expect(page.getByTestId('drawer-panel-badges')).toBeVisible();
      await assertScreenClean('drawer-badges');

      await page.getByTestId('drawer-tab-guide').click();
      await expect(page.getByTestId('drawer-panel-guide')).toBeVisible();
      await assertScreenClean('drawer-guide');

      await page.getByTestId('drawer-tab-style').click();
      await expect(page.getByTestId('drawer-panel-style')).toBeVisible();
      await assertScreenClean('drawer-style');

      await page.getByTestId('drawer-close').click();

      // 6. Settings
      await page.getByTestId('nav-settings').click();
      await expect(page.getByTestId('settings-screen')).toBeVisible();
      await assertScreenClean('settings');
      await page.getByTestId('settings-close').click();

      // 7. Sky-Hop
      await page.evaluate(() => window.__STARLIGHT_DEBUG__!.openSkyHop());
      await expect(page.getByTestId('skyhop-screen')).toBeVisible();
      await assertScreenClean('skyhop');

      const cls = await page.evaluate(() => {
        const w = window as unknown as {
          __STARLIGHT_CLS__?: number;
          __STARLIGHT_CLS_ENTRIES__?: Array<{ value: number; startTime: number }>;
        };
        return {
          total: w.__STARLIGHT_CLS__ ?? 0,
          entries: w.__STARLIGHT_CLS_ENTRIES__ ?? [],
        };
      });

      expect(
        cls.total,
        `${vp.name} CLS exceeded threshold: ${cls.total} (${JSON.stringify(cls.entries)})`,
      ).toBeLessThan(0.001);

      expect(errors.consoleErrors).toEqual([]);
      expect(errors.pageErrors).toEqual([]);
    });
  }

  test('respects prefers-reduced-motion: reduce and ?reducedMotion=1 with shutter <= 0.22s and zeroed Holo tilt', async ({
    browser,
  }) => {
    // 1. OS media query prefers-reduced-motion: reduce
    const reducedCtx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await reducedCtx.newPage();
    const errors = attachErrorCollector(page);
    await stubExternalSpriteCdns(page);

    await page.goto('./?renderer=canvas2d');
    await waitForAppBoot(page);

    await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
    await expect(page.locator('#ui-layer')).toHaveAttribute('data-reduced-motion', 'true');

    const reducedState = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(reducedState.capabilities.reducedMotion).toBe(true);
    expect(reducedState.save.settings.reducedMotion).toBe(true);

    // Choose Violet -> Bulbasaur -> Shrine encounter and verify attenuated shutter <= 0.22s
    await page.getByTestId('title-play-violet').click();
    await page.getByTestId('starter-choose-1').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    await page.evaluate(() =>
      window.__STARLIGHT_DEBUG__!.triggerEncounter('shrine', { biomeId: 'forest' }),
    );
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
      undefined,
      { timeout: 20_000 },
    );

    const shutterState = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(shutterState.battleShutterDuration).toBeLessThanOrEqual(0.22);

    // Confirm Pokédex holographic card tilt stays strictly 0deg under reduced motion
    await page.getByTestId('battle-flee').click();
    await page.getByTestId('nav-pokedex').click();
    await expect(page.getByTestId('pokedex-holo-card')).toBeVisible();

    const cardBox = await page.getByTestId('pokedex-holo-card').boundingBox();
    expect(cardBox).not.toBeNull();
    if (cardBox) {
      await page.mouse.move(cardBox.x + cardBox.width * 0.85, cardBox.y + cardBox.height * 0.15);
    }
    const holoVars = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pokedex-holo-card"]') as HTMLElement | null;
      return {
        rx: el?.style.getPropertyValue('--holo-rx'),
        ry: el?.style.getPropertyValue('--holo-ry'),
      };
    });
    expect(holoVars.rx).toBe('0deg');
    expect(holoVars.ry).toBe('0deg');

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
    await reducedCtx.close();

    // 2. Explicit ?reducedMotion=1 override under no-preference media
    const queryCtx = await browser.newContext({ reducedMotion: 'no-preference' });
    const qPage = await queryCtx.newPage();
    const qErrors = attachErrorCollector(qPage);
    await stubExternalSpriteCdns(qPage);

    await qPage.goto('./?renderer=canvas2d&reducedMotion=1');
    await waitForAppBoot(qPage);
    await expect(qPage.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
    await expect(qPage.locator('#ui-layer')).toHaveAttribute('data-reduced-motion', 'true');

    expect(qErrors.consoleErrors).toEqual([]);
    expect(qErrors.pageErrors).toEqual([]);
    await queryCtx.close();
  });

  test('activates CRT scanlines via ?crt=1 and Settings toggle with pointer-events: none and 100% click-through', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    await stubExternalSpriteCdns(page);

    await page.goto('./?renderer=canvas2d&crt=1');
    await waitForAppBoot(page);

    const crtOverlay = page.locator('#crt-overlay');
    await expect(crtOverlay).toHaveClass(/is-active/);
    const crtStyle = await crtOverlay.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { pointerEvents: cs.pointerEvents, opacity: Number(cs.opacity) };
    });
    expect(crtStyle.pointerEvents).toBe('none');
    expect(crtStyle.opacity).toBeGreaterThan(0);

    // Controls underneath active CRT overlay remain 100% clickable
    await page.getByTestId('title-play-violet').click();
    await expect(page.getByTestId('starter-screen')).toBeVisible();
    await page.getByTestId('starter-choose-1').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    await page.getByTestId('nav-pokedex').click();
    await expect(page.getByTestId('collector-drawer')).toBeVisible();
    await page.getByTestId('drawer-close').click();

    // Toggle CRT off and back on via Settings modal
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();
    await expect(page.getByTestId('setting-crt')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('setting-crt').click();
    await expect(page.getByTestId('setting-crt')).toHaveAttribute('aria-pressed', 'false');
    await expect(crtOverlay).not.toHaveClass(/is-active/);

    await page.getByTestId('setting-crt').click();
    await expect(page.getByTestId('setting-crt')).toHaveAttribute('aria-pressed', 'true');
    await expect(crtOverlay).toHaveClass(/is-active/);

    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });
});
