import { expect, test, type Page } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile-360x640', width: 360, height: 640 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'chromebook-1366x768', width: 1366, height: 768 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
] as const;

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
      // Skip elements hidden via [hidden] ancestor or display:none
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

test.describe('Red-Team: Accessibility, CRT, Zero-Emoji Ban & CLS Audit', () => {
  test('enforces strict Zero-Emoji Ban across all 8 screens (visible & hidden text nodes)', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);
    const allViolations: string[] = [];

    await page.goto('./?renderer=canvas2d');
    await waitForAppBoot(page);

    // 1. Title
    allViolations.push(...(await scanScreenForRawEmojis(page, 'title')));

    // 2. Overworld + Settings popover
    await page.getByTestId('enter-world-btn').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await page.getByTestId('settings-toggle').click();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'overworld+settings')));
    await page.getByTestId('settings-close').click();

    // 3. Tactical Readiness Briefing
    await page.getByTestId('nav-briefing').click();
    await expect(page.getByTestId('briefing-screen')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'briefing')));
    await page.getByTestId('briefing-close').click();

    // 4. Battle Dock
    await page.getByTestId('encounter-wild').click();
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
      undefined,
      { timeout: 10_000 },
    );
    allViolations.push(...(await scanScreenForRawEmojis(page, 'battle')));
    await page.getByTestId('battle-flee').click();

    // 5. 1,025 Pokédex
    await page.getByTestId('nav-pokedex').click();
    await expect(page.getByTestId('pokedex-screen')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'pokedex')));
    await page.getByTestId('pokedex-close').click();

    // 6. 28 Badges
    await page.getByTestId('nav-badges').click();
    await expect(page.getByTestId('badges-screen')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'badges')));
    await page.getByTestId('badges-close').click();

    // 7. Style Studio
    await page.getByTestId('nav-style').click();
    await expect(page.getByTestId('style-studio-screen')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'style-studio')));
    await page.getByTestId('style-close').click();

    // 8. Sky-Hop
    await page.getByTestId('nav-skyhop').click();
    await expect(page.getByTestId('skyhop-screen')).toBeVisible();
    allViolations.push(...(await scanScreenForRawEmojis(page, 'skyhop')));

    expect(allViolations, `Raw Unicode emojis detected:\n${allViolations.join('\n')}`).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });

  for (const vp of VIEWPORTS) {
    test(`CLS < 0.001, >= 44x44px touch targets, and zero horizontal overflow on ${vp.name}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();
      const errors = attachErrorCollector(page);

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
      await page.waitForTimeout(250);

      // Title screen audit
      const titleAudit = await auditViewportControlsAndOverflow(page);
      expect(titleAudit.overflowPx, `${vp.name} title horizontal overflow`).toBe(0);
      expect(
        titleAudit.undersizedControls,
        `${vp.name} title undersized targets: ${JSON.stringify(titleAudit.undersizedControls)}`,
      ).toEqual([]);

      // Overworld audit
      await page.getByTestId('enter-world-btn').click();
      await expect(page.getByTestId('overworld-screen')).toBeVisible();
      await page.waitForTimeout(200);

      const owAudit = await auditViewportControlsAndOverflow(page);
      expect(owAudit.overflowPx, `${vp.name} overworld horizontal overflow`).toBe(0);
      expect(
        owAudit.undersizedControls,
        `${vp.name} overworld undersized targets: ${JSON.stringify(owAudit.undersizedControls)}`,
      ).toEqual([]);

      // Battle screen audit
      await page.getByTestId('encounter-wild').click();
      await expect(page.getByTestId('battle-screen')).toBeVisible();
      await page.waitForFunction(
        () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
        undefined,
        { timeout: 10_000 },
      );
      const battleAudit = await auditViewportControlsAndOverflow(page);
      expect(battleAudit.overflowPx, `${vp.name} battle horizontal overflow`).toBe(0);
      expect(
        battleAudit.undersizedControls,
        `${vp.name} battle undersized targets: ${JSON.stringify(battleAudit.undersizedControls)}`,
      ).toEqual([]);
      await page.getByTestId('battle-flee').click();

      // Pokédex, Badges, Style Studio, Sky-Hop audit
      await page.getByTestId('nav-pokedex').click();
      await expect(page.getByTestId('pokedex-screen')).toBeVisible();
      const dexAudit = await auditViewportControlsAndOverflow(page);
      expect(dexAudit.overflowPx, `${vp.name} pokedex horizontal overflow`).toBe(0);
      expect(dexAudit.undersizedControls).toEqual([]);
      await page.getByTestId('pokedex-close').click();

      await page.getByTestId('nav-badges').click();
      await expect(page.getByTestId('badges-screen')).toBeVisible();
      const badgesAudit = await auditViewportControlsAndOverflow(page);
      expect(badgesAudit.overflowPx, `${vp.name} badges horizontal overflow`).toBe(0);
      expect(badgesAudit.undersizedControls).toEqual([]);
      await page.getByTestId('badges-close').click();

      await page.getByTestId('nav-style').click();
      await expect(page.getByTestId('style-studio-screen')).toBeVisible();
      const styleAudit = await auditViewportControlsAndOverflow(page);
      expect(styleAudit.overflowPx, `${vp.name} style studio horizontal overflow`).toBe(0);
      expect(styleAudit.undersizedControls).toEqual([]);
      await page.getByTestId('style-close').click();

      await page.getByTestId('nav-skyhop').click();
      await expect(page.getByTestId('skyhop-screen')).toBeVisible();
      const skyAudit = await auditViewportControlsAndOverflow(page);
      expect(skyAudit.overflowPx, `${vp.name} skyhop horizontal overflow`).toBe(0);
      expect(skyAudit.undersizedControls).toEqual([]);

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
      await context.close();
    });
  }

  test('respects prefers-reduced-motion media query and ?reducedMotion=1 with attenuated shutter', async ({
    browser,
  }) => {
    // 1. Media query prefers-reduced-motion: reduce
    const reducedCtx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await reducedCtx.newPage();
    const errors = attachErrorCollector(page);

    await page.goto('./?renderer=canvas2d');
    await waitForAppBoot(page);

    await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
    await expect(page.locator('#ui-layer')).toHaveAttribute('data-reduced-motion', 'true');

    const reducedState = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(reducedState.capabilities.reducedMotion).toBe(true);
    expect(reducedState.save.settings.reducedMotion).toBe(true);

    // Measure attenuated Shrine shutter duration (<= 0.35s vs 1.05s full motion)
    await page.getByTestId('enter-world-btn').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();
    await page.getByTestId('encounter-shrine').click();
    await expect(page.getByTestId('battle-screen')).toBeVisible();
    await page.waitForFunction(
      () => window.__STARLIGHT_DEBUG__?.getState().battlePhase === 'command',
      undefined,
      { timeout: 10_000 },
    );
    const shutterState = await page.evaluate(() => window.__STARLIGHT_DEBUG__!.getState());
    expect(shutterState.battleShutterDuration).toBeLessThanOrEqual(0.35);

    // Confirm Pokédex holographic card tilt stays zeroed under reduced motion
    await page.getByTestId('battle-flee').click();
    await page.getByTestId('nav-pokedex').click();
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

    await qPage.goto('./?renderer=canvas2d&reducedMotion=1');
    await waitForAppBoot(qPage);
    await expect(qPage.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
    await expect(qPage.locator('#ui-layer')).toHaveAttribute('data-reduced-motion', 'true');
    expect(qErrors.consoleErrors).toEqual([]);
    expect(qErrors.pageErrors).toEqual([]);
    await queryCtx.close();
  });

  test('activates CRT scanlines cleanly via ?crt=1 and Settings toggle with pointer-events: none', async ({
    page,
  }) => {
    const errors = attachErrorCollector(page);

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

    // Buttons must remain 100% clickable underneath active CRT scanlines
    await page.getByTestId('enter-world-btn').click();
    await expect(page.getByTestId('overworld-screen')).toBeVisible();

    await page.getByTestId('nav-pokedex').click();
    await expect(page.getByTestId('pokedex-screen')).toBeVisible();
    await page.getByTestId('pokedex-close').click();

    // Toggle CRT off and back on via Settings popover
    await page.getByTestId('settings-toggle').click();
    await expect(page.getByTestId('setting-crt')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('setting-crt').click();
    await expect(page.getByTestId('setting-crt')).toHaveAttribute('aria-pressed', 'false');
    await expect(crtOverlay).not.toHaveClass(/is-active/);

    await page.getByTestId('setting-crt').click();
    await expect(page.getByTestId('setting-crt')).toHaveAttribute('aria-pressed', 'true');
    await expect(crtOverlay).toHaveClass(/is-active/);

    await page.getByTestId('settings-close').click();
    await page.getByTestId('encounter-wild').click();
    await expect(page.getByTestId('battle-screen')).toBeVisible();

    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });
});
