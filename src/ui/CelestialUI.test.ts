import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ELEMENTAL_TYPES,
  type IOfflineSpriteRigSynthesizer,
  type SkyHopState,
} from '../contracts';
import {
  BADGE_DEFINITIONS,
  createDefaultProfile,
  createDefaultSaveState,
  createInitialSkyHopState,
  stepSkyHop,
  TOTAL_SPECIES_COUNT,
  triggerSkyHopStarDash,
} from '../core';
import { Canvas2DBackend } from '../graphics/engine';
import { SkyHopRenderer } from '../graphics/skyhop';
import skyHopRendererRaw from '../graphics/skyhop/SkyHopRenderer.ts?raw';
import badgesShowcaseRaw from './BadgesShowcase.ts?raw';
import celestialControllerRaw from './CelestialUIController.ts?raw';
import iconHelperRaw from './iconHelper.ts?raw';
import {
  ALL_ICON_IDS,
  badgeIconId,
  BADGE_ICON_IDS,
  computeHoloCardMetrics,
  CORE_ICON_IDS,
  filterAndPaginatePokedex,
  iconSvg,
  LivingTitleRenderer,
  safeText,
  sanitizeNoEmoji,
  TYPE_ICON_IDS,
  typeIconId,
} from './index';
import livingTitleRaw from './LivingTitleRenderer.ts?raw';
import pokedexViewRaw from './PokedexView.ts?raw';
import styleStudioRaw from './StyleStudioStage.ts?raw';

const RAW_EMOJI_DETECT_REGEX =
  /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F1E6}-\u{1F1FF}\u2600-\u27BF\u2B00-\u2BFF\uFE0E\uFE0F]/u;

async function readWorkspaceText(relPathFromRoot: string): Promise<string> {
  const fsSpec = ['node', 'fs'].join(':');
  const pathSpec = ['node', 'path'].join(':');
  const urlSpec = ['node', 'url'].join(':');
  const fsMod = (await import(/* @vite-ignore */ fsSpec)) as {
    readFileSync: (p: string, enc: string) => string;
  };
  const pathMod = (await import(/* @vite-ignore */ pathSpec)) as {
    dirname: (p: string) => string;
    resolve: (...parts: string[]) => string;
  };
  const urlMod = (await import(/* @vite-ignore */ urlSpec)) as {
    fileURLToPath: (u: string) => string;
  };
  const thisDir = pathMod.dirname(urlMod.fileURLToPath(import.meta.url));
  const abs = pathMod.resolve(thisDir, '..', '..', relPathFromRoot);
  return fsMod.readFileSync(abs, 'utf8');
}

function createFullMock2DContext() {
  const makeGrad = () => ({ addColorStop: vi.fn() });
  return {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    createLinearGradient: vi.fn(() => makeGrad()),
    createRadialGradient: vi.fn(() => makeGrad()),
    createPattern: vi.fn(() => ({ pattern: true })),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#fff',
    lineWidth: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    canvas: {
      width: 960,
      height: 540,
      clientWidth: 960,
      clientHeight: 540,
    },
  };
}

function createCanvasBackendHarness(opts?: { reducedMotion?: boolean; crtMode?: boolean }) {
  const ctx = createFullMock2DContext();
  const canvas = {
    width: 960,
    height: 540,
    clientWidth: 960,
    clientHeight: 540,
    getContext: vi.fn((type: string) => (type === '2d' ? ctx : null)),
  };
  const backend = new Canvas2DBackend();
  backend.initSync(canvas as unknown as HTMLCanvasElement, {
    dprCap: 2,
    reducedMotion: opts?.reducedMotion ?? false,
    crtMode: opts?.crtMode ?? false,
  });
  return { backend, ctx, canvas };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('iconHelper & zero-emoji UI policy', () => {
  it('references all 72 SVG symbol IDs in public/icons/starlight-icons.svg via iconSvg()', async () => {
    expect(CORE_ICON_IDS).toHaveLength(26);
    expect(TYPE_ICON_IDS).toHaveLength(18);
    expect(BADGE_ICON_IDS).toHaveLength(28);
    expect(ALL_ICON_IDS).toHaveLength(72);

    const svgContent = await readWorkspaceText('public/icons/starlight-icons.svg');

    for (const id of ALL_ICON_IDS) {
      const markup = iconSvg(id);
      expect(markup).toBe(`<svg class="sl-icon" aria-hidden="true"><use href="#${id}"></use></svg>`);
      expect(RAW_EMOJI_DETECT_REGEX.test(markup)).toBe(false);
      expect(svgContent).toContain(`<symbol id="${id}"`);
    }

    expect(iconSvg('icon-starball', 'sl-icon-lg')).toBe(
      '<svg class="sl-icon sl-icon-lg" aria-hidden="true"><use href="#icon-starball"></use></svg>',
    );
    expect(typeIconId('electric')).toBe('icon-type-electric');
    expect(badgeIconId(1)).toBe('icon-badge-1');
    expect(badgeIconId(28)).toBe('icon-badge-28');
  });

  it('strips raw Unicode emojis via sanitizeNoEmoji while keeping standard text & Pokémon accents intact', () => {
    const dirty = '🔥 Pikachu ⚡ Lv.28 ⭐ #0025 — Pokémon Ready! ✨❤️🚀';
    const clean = sanitizeNoEmoji(dirty);
    expect(RAW_EMOJI_DETECT_REGEX.test(clean)).toBe(false);
    expect(clean).toBe('Pikachu Lv.28 #0025 — Pokémon Ready!');

    const escaped = safeText('<b>Starlight</b> ✨ #1025 & More');
    expect(RAW_EMOJI_DETECT_REGEX.test(escaped)).toBe(false);
    expect(escaped).toBe('&lt;b&gt;Starlight&lt;/b&gt; #1025 &amp; More');
  });

  it('contains zero raw Unicode emojis across all UI source files and starlight.css', async () => {
    const cssText = await readWorkspaceText('src/styles/starlight.css');
    const sources: Array<[string, string]> = [
      ['src/styles/starlight.css', cssText],
      ['src/ui/iconHelper.ts', iconHelperRaw],
      ['src/ui/LivingTitleRenderer.ts', livingTitleRaw],
      ['src/ui/StyleStudioStage.ts', styleStudioRaw],
      ['src/ui/PokedexView.ts', pokedexViewRaw],
      ['src/ui/BadgesShowcase.ts', badgesShowcaseRaw],
      ['src/ui/CelestialUIController.ts', celestialControllerRaw],
      ['src/graphics/skyhop/SkyHopRenderer.ts', skyHopRendererRaw],
    ];
    for (const [name, content] of sources) {
      expect(RAW_EMOJI_DETECT_REGEX.test(content), `Found raw emoji in ${name}`).toBe(false);
    }
    expect(BADGE_DEFINITIONS).toHaveLength(28);
    expect(cssText).toContain('.crt-overlay.is-active');
    expect(cssText).toContain('prefers-reduced-motion: reduce');
    expect(cssText).toContain("[data-reduced-motion='true']");
    expect(cssText).toContain('min-width: 44px');
    expect(cssText).toContain('min-height: 44px');
  });

  it('exposes all required data-testid selectors across Celestial UI views', () => {
    const requiredIds = [
      'profile-slot0',
      'profile-slot1',
      'enter-world-btn',
      'nav-briefing',
      'biome-select',
      'encounter-wild',
      'encounter-shrine',
      'encounter-rival',
      'encounter-rare',
      'settings-toggle',
      'nav-pokedex',
      'nav-badges',
      'nav-style',
      'nav-skyhop',
      'save-btn',
      'interact-btn',
      'battle-move-',
      'battle-starball',
      'battle-potion',
      'battle-offline-rig',
      'battle-flee',
      'skyhop-start',
      'skyhop-flap',
      'skyhop-dash',
      'skyhop-exit',
    ];
    for (const id of requiredIds) {
      expect(celestialControllerRaw).toContain(`data-testid="${id}`);
    }
  });
});

describe('1,025 Collector Pokédex search, pagination & holographic math', () => {
  it('paginates cleanly across all 1,025 species (#0001..#1025)', () => {
    const profile = createDefaultProfile('slot0');
    const page1 = filterAndPaginatePokedex({
      query: '',
      typeFilter: 'all',
      caughtOnly: false,
      page: 1,
      pageSize: 24,
      pokedex: profile.pokedex,
    });

    expect(page1.totalMatches).toBe(TOTAL_SPECIES_COUNT);
    expect(page1.items).toHaveLength(24);
    expect(page1.items[0].id).toBe(1);
    expect(page1.items[0].name).toBe('Bulbasaur');
    expect(page1.totalPages).toBe(Math.ceil(1025 / 24));

    const lastPage = filterAndPaginatePokedex({
      query: '',
      typeFilter: 'all',
      caughtOnly: false,
      page: page1.totalPages,
      pageSize: 24,
      pokedex: profile.pokedex,
    });
    expect(lastPage.items[lastPage.items.length - 1].id).toBe(1025);
    expect(lastPage.items[lastPage.items.length - 1].name).toBe('Pecharunt');
  });

  it('filters by query, padded #ID, 18 elemental types, and caught status', () => {
    const profile = createDefaultProfile('slot0');

    const byHashId = filterAndPaginatePokedex({
      query: '#1024',
      typeFilter: 'all',
      caughtOnly: false,
      page: 1,
      pokedex: profile.pokedex,
    });
    expect(byHashId.items.map((s) => s.id)).toEqual([1024]);
    expect(byHashId.items[0].name).toBe('Terapagos');

    const byPaddedZero = filterAndPaginatePokedex({
      query: '#0025',
      typeFilter: 'all',
      caughtOnly: true,
      page: 1,
      pokedex: profile.pokedex,
    });
    expect(byPaddedZero.items.map((s) => s.id)).toEqual([25]);

    const byName = filterAndPaginatePokedex({
      query: 'pikachu',
      typeFilter: 'electric',
      caughtOnly: true,
      page: 1,
      pokedex: profile.pokedex,
    });
    expect(byName.items.map((s) => s.id)).toEqual([25]);

    for (const elemType of ELEMENTAL_TYPES) {
      const typed = filterAndPaginatePokedex({
        query: '',
        typeFilter: elemType,
        caughtOnly: false,
        page: 1,
        pokedex: profile.pokedex,
      });
      expect(typed.totalMatches).toBeGreaterThan(0);
      expect(
        typed.items.every((s) => s.primaryType === elemType || s.secondaryType === elemType),
      ).toBe(true);
    }
  });

  it('scales holographic foil intensity with Star Rank & Max Bond and disables tilt in reducedMotion', () => {
    const low = computeHoloCardMetrics(
      {
        speciesId: 16,
        pointerTiltX: 0.75,
        pointerTiltY: -0.5,
        starRank: 0,
        bondLevel: 0,
        caught: false,
        shiny: false,
      },
      false,
    );
    const maxBond = computeHoloCardMetrics(
      {
        speciesId: 25,
        pointerTiltX: 0.75,
        pointerTiltY: -0.5,
        starRank: 5,
        bondLevel: 100,
        caught: true,
        shiny: true,
      },
      false,
    );

    expect(maxBond.maxBond).toBe(true);
    expect(maxBond.intensity).toBeGreaterThan(low.intensity);
    expect(maxBond.intensity).toBeGreaterThanOrEqual(0.9);
    expect(maxBond.ryDeg).not.toBe(0);

    const reduced = computeHoloCardMetrics(
      {
        speciesId: 25,
        pointerTiltX: 1,
        pointerTiltY: 1,
        starRank: 5,
        bondLevel: 100,
        caught: true,
        shiny: false,
      },
      true,
    );
    expect(reduced.rxDeg).toBe(0);
    expect(reduced.ryDeg).toBe(0);
    expect(reduced.pxPercent).toBe(50);
    expect(reduced.pyPercent).toBe(50);
  });
});

describe('SkyHopRenderer & LivingTitleRenderer on Canvas2DBackend', () => {
  it('renders SkyHopRenderer cleanly on Canvas2DBackend in standalone fallback and Star Dash mode', () => {
    const { backend, ctx } = createCanvasBackendHarness();
    const profile = createDefaultProfile('slot0');
    const state: SkyHopState = createInitialSkyHopState(profile, false);
    state.active = true;
    state.running = true;

    const renderer = new SkyHopRenderer();
    renderer.update(state, 0.016);
    stepSkyHop(state, 0.016, profile);

    backend.beginFrame(1.0, 0.016);
    renderer.render(backend, state);
    const stats = backend.endFrame();

    expect(stats.backend).toBe('canvas2d');
    expect(stats.activeLights).toBeGreaterThan(0);
    expect(stats.activeParticles).toBeGreaterThan(0);
    expect(stats.drawCalls).toBeGreaterThan(5);
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();

    // Activate Star Dash and verify supersonic rendering + injected rig synthesizer integration
    const mockSynth: IOfflineSpriteRigSynthesizer = {
      renderRig: vi.fn(),
      toDataUrl: vi.fn(() => 'data:image/png;base64,'),
    };
    renderer.setRigSynthesizer(mockSynth);
    const dashed = triggerSkyHopStarDash(state);
    expect(dashed).toBe(true);

    renderer.update(state, 0.016);
    backend.beginFrame(1.016, 0.016);
    renderer.render(backend, state);
    const dashStats = backend.endFrame();

    expect(dashStats.activeLights).toBeGreaterThan(0);
    expect(mockSynth.renderRig).toHaveBeenCalledTimes(1);
    backend.dispose();
  });

  it('renders LivingTitleRenderer panorama, water reflections, and dual profiles on Canvas2DBackend', () => {
    const { backend } = createCanvasBackendHarness();
    const save = createDefaultSaveState();
    const mockSynth: IOfflineSpriteRigSynthesizer = {
      renderRig: vi.fn(),
      toDataUrl: vi.fn(() => 'data:image/png;base64,'),
    };

    const titleRenderer = new LivingTitleRenderer({ rigSynthesizer: mockSynth });
    titleRenderer.update(0.016, false);

    backend.beginFrame(0.5, 0.016);
    titleRenderer.render(backend, save);
    const stats = backend.endFrame();

    expect(stats.backend).toBe('canvas2d');
    expect(stats.activeLights).toBeGreaterThanOrEqual(4);
    expect(stats.activeParticles).toBeGreaterThan(0);
    // Invoked once for slot0 partner + once for slot1 partner
    expect(mockSynth.renderRig).toHaveBeenCalledTimes(2);
    backend.dispose();
  });
});
