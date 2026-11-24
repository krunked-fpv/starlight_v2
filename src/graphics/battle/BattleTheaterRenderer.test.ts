import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BIOME_IDS,
  ELEMENTAL_TYPES,
  type BattleCameraCue,
  type BattleSceneState,
  type BodyArchetype,
  type EncounterTier,
  type OfflineRigDescriptor,
  type StatusCondition,
} from '../../contracts';
import {
  createBattleState,
  createDefaultSaveState,
  getSpecies,
  TYPE_PALETTES,
} from '../../core';
import { Canvas2DBackend } from '../engine';
import {
  BATTLE_ARENAS,
  BattleTheaterRenderer,
  BattleVfxDirector,
  OfflineSpriteRigSynthesizer,
} from './index';

function createGradientStub() {
  return { addColorStop: vi.fn() };
}

function createFullMockCanvas2DContext(): CanvasRenderingContext2D & {
  _calls: {
    fillRect: ReturnType<typeof vi.fn>;
    strokeRect: ReturnType<typeof vi.fn>;
    rect: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    stroke: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
    bezierCurveTo: ReturnType<typeof vi.fn>;
    quadraticCurveTo: ReturnType<typeof vi.fn>;
    arc: ReturnType<typeof vi.fn>;
    ellipse: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
  };
} {
  const fillRect = vi.fn();
  const strokeRect = vi.fn();
  const rect = vi.fn();
  const lineTo = vi.fn();
  const stroke = vi.fn();
  const fill = vi.fn();
  const bezierCurveTo = vi.fn();
  const quadraticCurveTo = vi.fn();
  const arc = vi.fn();
  const ellipse = vi.fn();
  const drawImage = vi.fn();

  const ctx = {
    canvas: { width: 960, height: 540 },
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    clearRect: vi.fn(),
    fillRect,
    strokeRect,
    drawImage,
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo,
    quadraticCurveTo,
    bezierCurveTo,
    arc,
    ellipse,
    rect,
    clip: vi.fn(),
    fill,
    stroke,
    setLineDash: vi.fn(),
    createLinearGradient: vi.fn(() => createGradientStub()),
    createRadialGradient: vi.fn(() => createGradientStub()),
    createPattern: vi.fn(() => ({})),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    shadowColor: 'transparent',
    shadowBlur: 0,
    _calls: {
      fillRect,
      strokeRect,
      rect,
      lineTo,
      stroke,
      fill,
      bezierCurveTo,
      quadraticCurveTo,
      arc,
      ellipse,
      drawImage,
    },
  };

  return ctx as unknown as CanvasRenderingContext2D & {
    _calls: {
      fillRect: ReturnType<typeof vi.fn>;
      strokeRect: ReturnType<typeof vi.fn>;
    rect: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    stroke: ReturnType<typeof vi.fn>;
      fill: ReturnType<typeof vi.fn>;
      bezierCurveTo: ReturnType<typeof vi.fn>;
      quadraticCurveTo: ReturnType<typeof vi.fn>;
      arc: ReturnType<typeof vi.fn>;
      ellipse: ReturnType<typeof vi.fn>;
      drawImage: ReturnType<typeof vi.fn>;
    };
  };
}

async function createCanvasBackendHarness(width = 960, height = 540) {
  const ctx = createFullMockCanvas2DContext();
  (ctx.canvas as { width: number; height: number }).width = width;
  (ctx.canvas as { width: number; height: number }).height = height;

  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;

  const backend = new Canvas2DBackend();
  await backend.init(canvas, { dprCap: 2, reducedMotion: false, crtMode: false });
  return { backend, ctx, canvas };
}

function makeBattleFixture(
  biomeId: (typeof BIOME_IDS)[number] = 'starlight-village',
  tier: EncounterTier = 'wild',
  reducedMotion = false,
): BattleSceneState {
  const save = createDefaultSaveState();
  const profile = save.profiles.slot0;
  return createBattleState(profile, biomeId, tier, {
    reducedMotion,
    forceOfflineRig: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BATTLE_ARENAS (all 19 BiomeIds)', () => {
  it('defines 5 parallax planes for all 19 BiomeIds and renders each cleanly with Canvas2DBackend', async () => {
    expect(BIOME_IDS).toHaveLength(19);
    expect(Object.keys(BATTLE_ARENAS)).toHaveLength(19);

    const { backend } = await createCanvasBackendHarness();
    const renderer = new BattleTheaterRenderer();

    for (const biomeId of BIOME_IDS) {
      const arena = BATTLE_ARENAS[biomeId];
      expect(arena).toBeDefined();
      expect(arena.biomeId).toBe(biomeId);
      expect(arena.planes).toHaveLength(5);
      expect(arena.planes.map((p) => p.name)).toEqual([
        'sky',
        'far-horizon',
        'mid-landmarks',
        'combat-ground',
        'foreground-frame',
      ]);

      // Parallax factors must increase strictly from sky -> foreground-frame
      for (let i = 1; i < arena.planes.length; i++) {
        expect(arena.planes[i].parallaxFactor).toBeGreaterThan(arena.planes[i - 1].parallaxFactor);
      }

      const state = makeBattleFixture(biomeId, 'shrine');
      state.arenaLightingType = arena.elementalType;
      state.arenaLightingPulse = 0.9;

      backend.beginFrame(1.25, 0.016);
      renderer.update(state, 0.016);
      renderer.render(backend, state);
      const stats = backend.endFrame();

      expect(stats.drawCalls).toBeGreaterThan(3);
      expect(stats.activeLights).toBeGreaterThan(0);
    }

    backend.dispose();
  });
});

describe('OfflineSpriteRigSynthesizer (all 10 archetypes & 1,025 species)', () => {
  const ARCHETYPES: BodyArchetype[] = [
    'quadruped',
    'biped',
    'avian',
    'serpentine',
    'aquatic',
    'crystalline',
    'ethereal',
    'insectoid',
    'draconic',
    'armored',
  ];

  it('synthesizes all 10 archetypes using curved multi-shaded vector art without flat fillRect boxes', () => {
    const synth = new OfflineSpriteRigSynthesizer();

    ARCHETYPES.forEach((archetype, idx) => {
      const ctx = createFullMockCanvas2DContext();
      const type = ELEMENTAL_TYPES[idx % ELEMENTAL_TYPES.length];
      const secType = ELEMENTAL_TYPES[(idx + 5) % ELEMENTAL_TYPES.length];
      const pal = TYPE_PALETTES[type];

      const rig: OfflineRigDescriptor = {
        speciesId: 100 + idx * 91,
        name: `Test-${archetype}`,
        primaryType: type,
        secondaryType: secType,
        archetype,
        palette: [pal.primary, pal.secondary, pal.glow],
        shiny: idx % 2 === 0,
      };

      synth.renderRig(ctx, rig, {
        cx: 120,
        cy: 120,
        size: 140,
        time: 1.3,
        facing: idx % 2 === 0 ? 'right' : 'left',
        hitFlash: idx === 3 ? 0.85 : 0,
        rimColor: pal.glow,
        reducedMotion: false,
      });

      expect(ctx._calls.fillRect).not.toHaveBeenCalled();
      expect(ctx._calls.strokeRect).not.toHaveBeenCalled();
      expect(ctx._calls.rect).not.toHaveBeenCalled();
      expect(ctx._calls.fill).toHaveBeenCalled();
      expect(ctx._calls.stroke).toHaveBeenCalled();
      expect(
        ctx._calls.arc.mock.calls.length +
          ctx._calls.ellipse.mock.calls.length +
          ctx._calls.bezierCurveTo.mock.calls.length +
          ctx._calls.quadraticCurveTo.mock.calls.length +
          ctx._calls.lineTo.mock.calls.length,
      ).toBeGreaterThan(8);
    });
  });

  it('handles species 1..1025 and produces a safe data URL fallback in pure Node and canvas PNG when available', () => {
    const synth = new OfflineSpriteRigSynthesizer();

    for (const id of [1, 6, 25, 133, 151, 384, 493, 700, 887, 1008, 1025]) {
      const sp = getSpecies(id);
      const rig: OfflineRigDescriptor = {
        speciesId: sp.id,
        name: sp.name,
        primaryType: sp.primaryType,
        secondaryType: sp.secondaryType,
        archetype: sp.archetype,
        palette: sp.palette,
        shiny: id === 1025,
      };

      const nodeUrl = synth.toDataUrl(rig, 160);
      expect(nodeUrl.startsWith('data:image/svg+xml')).toBe(true);
    }

    // Also test canvas-backed PNG path when document.createElement('canvas') exists
    const mockCtx = createFullMockCanvas2DContext();
    const mockCanvas = {
      width: 160,
      height: 160,
      getContext: vi.fn(() => mockCtx),
      toDataURL: vi.fn(() => 'data:image/png;base64,MOCKPNG'),
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => mockCanvas),
    });

    const eevee = getSpecies(133);
    const pngUrl = synth.toDataUrl(
      {
        speciesId: eevee.id,
        name: eevee.name,
        primaryType: eevee.primaryType,
        secondaryType: eevee.secondaryType,
        archetype: eevee.archetype,
        palette: eevee.palette,
      },
      160,
    );
    expect(pngUrl).toBe('data:image/png;base64,MOCKPNG');
    expect(mockCtx._calls.fill).toHaveBeenCalled();
  });
});

describe('BattleVfxDirector (all 18 ElementalTypes, 5 statuses, Composure shield, capture & evolution)', () => {
  it('renders distinct VFX choreographies for all 18 ElementalTypes + Composure shatter', async () => {
    const { backend } = await createCanvasBackendHarness();
    const renderer = new BattleTheaterRenderer();

    for (const elemType of ELEMENTAL_TYPES) {
      const state = makeBattleFixture('astral-ruins', 'wild');
      state.shutter.active = false;
      state.phase = 'animating';

      renderer.triggerVfx({
        type: elemType,
        fromSide: 'player',
        targetSide: 'enemy',
        power: 92,
        effectiveness: 2,
        composureBroken: elemType === 'fighting' || elemType === 'dragon',
        duration: 0.6,
      });

      // Step into impact window so both projectile & impact particles/lights fire
      for (let step = 0; step < 6; step++) {
        renderer.update(state, 0.045);
      }

      backend.beginFrame(state.elapsedSeconds, 0.016);
      renderer.render(backend, state);
      const stats = backend.endFrame();

      expect(state.activeVfx.length).toBe(1);
      expect(stats.activeParticles).toBeGreaterThan(0);
      expect(stats.activeLights).toBeGreaterThan(0);
    }

    backend.dispose();
  });

  it('renders all 5 status states, Composure shield ratios, capturing sequence, and evolving ribbons', async () => {
    const { backend } = await createCanvasBackendHarness();
    const renderer = new BattleTheaterRenderer();
    const statuses: StatusCondition[] = ['none', 'frost', 'static', 'burn', 'sleep'];

    for (const status of statuses) {
      const state = makeBattleFixture('sapphire-lagoon', 'rare');
      state.shutter.active = false;
      state.phase = 'command';
      state.player.status = status;
      state.enemy.status = status;
      state.player.composureRatio = status === 'none' ? 1 : 0.45;
      state.enemy.composureRatio = status === 'frost' ? 0 : 0.75;

      backend.beginFrame(1.0, 0.016);
      renderer.render(backend, state);
      const stats = backend.endFrame();
      expect(stats.drawCalls).toBeGreaterThan(2);
    }

    // Star Ball capture arc, containment beam, shakes, and lock burst
    for (const cp of [0.15, 0.38, 0.68, 0.94]) {
      const captureState = makeBattleFixture('starbloom-glade', 'wild');
      captureState.shutter.active = false;
      captureState.phase = 'capturing';
      captureState.enemy.captureProgress = cp;

      backend.beginFrame(2.0 + cp, 0.016);
      renderer.render(backend, captureState);
      const stats = backend.endFrame();
      expect(stats.activeParticles).toBeGreaterThan(0);
      expect(stats.activeLights).toBeGreaterThan(0);
    }

    // Evolution metamorphosis ribbons
    const evoState = makeBattleFixture('starlight-village', 'wild');
    evoState.shutter.active = false;
    evoState.phase = 'evolving';
    backend.beginFrame(3.2, 0.016);
    renderer.render(backend, evoState);
    const evoStats = backend.endFrame();
    expect(evoStats.activeParticles).toBeGreaterThan(0);
    expect(evoStats.activeLights).toBeGreaterThan(0);

    // Direct director sanity check
    expect(new BattleVfxDirector()).toBeInstanceOf(BattleVfxDirector);
    backend.dispose();
  });
});

describe('BattleTheaterRenderer shutters, camera cues, hit-stop, reducedMotion & offline fallback', () => {
  it('renders and completes all 4 encounter transition shutters cleanly', async () => {
    const { backend } = await createCanvasBackendHarness();
    const renderer = new BattleTheaterRenderer();
    const tiers: EncounterTier[] = ['wild', 'rare', 'rival', 'shrine'];

    for (const tier of tiers) {
      const state = makeBattleFixture('starlight-village', tier, false);
      renderer.triggerShutter(tier, false);

      // Advance halfway through shutter
      for (let i = 0; i < 8; i++) {
        renderer.update(state, 0.045);
      }
      expect(state.shutter.active).toBe(true);
      expect(state.shutter.progress).toBeGreaterThan(0);
      expect(state.shutter.progress).toBeLessThan(1);

      backend.beginFrame(state.elapsedSeconds, 0.016);
      renderer.render(backend, state);
      const midStats = backend.endFrame();
      expect(midStats.drawCalls).toBeGreaterThan(2);

      // Complete shutter
      for (let i = 0; i < 30; i++) {
        renderer.update(state, 0.045);
      }
      expect(state.shutter.active).toBe(false);
      expect(state.shutter.progress).toBe(1);
    }

    backend.dispose();
  });

  it('drives all 7 camera cues, hit-stop freeze frames, and reducedMotion shake/strobe suppression', async () => {
    const { backend } = await createCanvasBackendHarness();
    const renderer = new BattleTheaterRenderer();
    const cues: BattleCameraCue[] = [
      'idle',
      'hit',
      'heavyHit',
      'starBall',
      'rivalIntro',
      'shrineGuardian',
      'evolution',
    ];

    for (const cue of cues) {
      const state = makeBattleFixture('drake-summit', 'shrine', false);
      state.shutter.active = false;
      state.phase = 'animating';
      state.player.lungeOffset = 0.7;
      state.enemy.hitFlash = 1.0;

      renderer.triggerCameraCue(cue);
      renderer.update(state, 0.016);

      if (cue === 'hit' || cue === 'heavyHit') {
        expect(state.hitStopRemaining).toBeGreaterThan(0);
        const cam = renderer.getCameraTransform(false);
        expect(Math.abs(cam.shakeX) + Math.abs(cam.shakeY)).toBeGreaterThan(0);
      }

      backend.beginFrame(state.elapsedSeconds, 0.016);
      renderer.render(backend, state);
      const stats = backend.endFrame();
      expect(stats.drawCalls).toBeGreaterThan(2);
    }

    // Verify reducedMotion zeroes shake, rotation, and hit-stop freeze
    const rmState = makeBattleFixture('ember-caldera', 'rival', true);
    rmState.shutter.active = false;
    renderer.triggerShutter('rival', true);
    renderer.triggerCameraCue('heavyHit');
    renderer.update(rmState, 0.016);

    const rmCam = renderer.getCameraTransform(true);
    expect(rmState.hitStopRemaining).toBe(0);
    expect(rmCam.shakeX).toBe(0);
    expect(rmCam.shakeY).toBe(0);
    expect(rmCam.rotation).toBe(0);

    backend.beginFrame(rmState.elapsedSeconds, 0.016);
    renderer.render(backend, rmState);
    const rmStats = backend.endFrame();
    expect(rmStats.drawCalls).toBeGreaterThan(2);

    // Verify zero broken images when spriteLoaded is false & useOfflineRig is false
    const fallbackState = makeBattleFixture('meadow', 'wild', false);
    fallbackState.shutter.active = false;
    fallbackState.forceOfflineRig = false;
    fallbackState.player.useOfflineRig = false;
    fallbackState.player.spriteLoaded = false;
    fallbackState.player.spriteUrl = 'https://invalid.local/missing.png';
    fallbackState.enemy.useOfflineRig = false;
    fallbackState.enemy.spriteLoaded = false;

    const { ctx } = await createCanvasBackendHarness();
    const fallbackBackend = new Canvas2DBackend();
    await fallbackBackend.init(
      {
        width: 960,
        height: 540,
        clientWidth: 960,
        clientHeight: 540,
        getContext: () => ctx,
      } as unknown as HTMLCanvasElement,
      { dprCap: 2 },
    );
    fallbackBackend.beginFrame(0.5, 0.016);
    renderer.render(fallbackBackend, fallbackState);
    fallbackBackend.endFrame();
    // Should synthesize offline rigs cleanly without throwing or drawing broken images
    expect(ctx._calls.drawImage).not.toHaveBeenCalled();
    expect(ctx._calls.fill).toHaveBeenCalled();

    fallbackBackend.dispose();
    backend.dispose();
  });
});
