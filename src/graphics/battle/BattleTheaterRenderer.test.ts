import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BIOME_IDS,
  ELEMENTAL_TYPES,
  type AtlasManifest,
  type BallKind,
  type BattleCameraCue,
  type BattleSceneState,
  type BiomeId,
  type BodyArchetype,
  type DecodedSpriteFrames,
  type EncounterTier,
  type OfflineRigDescriptor,
} from '../../contracts';
import {
  DojoBattleController,
  SpriteAssetLoader,
  StarlightStorageBridge,
  TYPE_PALETTES,
  createDefaultSaveState,
  getSpeciesEntry,
} from '../../core';
import { Canvas2DBackend } from '../engine';
import {
  BATTLE_ARENAS,
  BattleTheaterRenderer,
  BattleVfxDirector,
  OfflineSpriteRigSynthesizer,
  computeBattleStageLayout,
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
    fillText: ReturnType<typeof vi.fn>;
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
  const fillText = vi.fn();
  const strokeText = vi.fn();
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
    fillText,
    strokeText,
    setLineDash: vi.fn(),
    createLinearGradient: vi.fn(() => createGradientStub()),
    createRadialGradient: vi.fn(() => createGradientStub()),
    createPattern: vi.fn(() => ({})),
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '10px monospace',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowColor: 'transparent',
    shadowBlur: 0,
    _calls: {
      fillRect,
      strokeRect,
      rect,
      lineTo,
      stroke,
      fill,
      fillText,
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
      fillText: ReturnType<typeof vi.fn>;
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
  biomeId: BiomeId = 'village',
  tier: EncounterTier = 'wild',
  reducedMotion = false,
  forceOfflineRig = true,
): BattleSceneState {
  const bridge = new StarlightStorageBridge(createDefaultSaveState());
  bridge.manager.selectTrainer('violet');
  bridge.manager.chooseStarter(1);
  const loader = new SpriteAssetLoader({ forceOffline: forceOfflineRig });
  const controller = new DojoBattleController(bridge, loader);
  return controller.startEncounter({
    biomeId,
    tier,
    forceOfflineRig,
    reducedMotion,
  });
}

function makeFallbackManifest(): AtlasManifest {
  const archetypes: BodyArchetype[] = [
    'quadruped',
    'biped',
    'winged',
    'serpentine',
    'crystalline',
    'amorphous',
    'insectoid',
    'draconic',
    'construct',
    'flora',
    'aquatic',
  ];
  const regions: AtlasManifest['sheets']['fallbacks']['regions'] = {};
  archetypes.forEach((arch, idx) => {
    regions[arch] = {
      id: arch,
      x: (idx % 5) * 48,
      y: Math.floor(idx / 5) * 48,
      w: 48,
      h: 48,
    };
  });

  const arenas = {} as AtlasManifest['arenas'];
  for (const id of BIOME_IDS) {
    arenas[id] = `./atlases/arenas/${id}.png`;
  }
  arenas.skyhop = './atlases/arenas/skyhop.png';

  return {
    version: '2.0.0',
    seed: 20261124,
    generatedBy: 'test',
    sheets: {
      fallbacks: {
        id: 'fallbacks',
        albedoPath: './atlases/fallbacks-atlas.png',
        width: 240,
        height: 144,
        tileSize: 48,
        pixelCrisp: true,
        regions,
      },
    },
    arenas,
    tileRegions: {},
    iconIds: [],
    totalBytes: 0,
  };
}

function makeFakeImage(width: number, height: number): HTMLImageElement {
  return {
    width,
    height,
    naturalWidth: width,
    naturalHeight: height,
    complete: true,
  } as unknown as HTMLImageElement;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BATTLE_ARENAS (all 18 canonical C:\\dojo BiomeIds + 480x270 pixel-art backdrop)', () => {
  it('defines all 18 canonical C:\\dojo BiomeIds and renders both fallback and 480x270 atlas arenas crisply', async () => {
    expect(BIOME_IDS).toHaveLength(18);
    expect(Object.keys(BATTLE_ARENAS)).toHaveLength(18);
    expect(Object.keys(BATTLE_ARENAS).sort()).toEqual([...BIOME_IDS].sort());

    const { backend } = await createCanvasBackendHarness();
    const renderer = new BattleTheaterRenderer();

    // 1. Render all 18 arenas without external PNGs (pixel fallback backdrop + pedestals + weather)
    for (const biomeId of BIOME_IDS) {
      const arena = BATTLE_ARENAS[biomeId];
      expect(arena).toBeDefined();
      expect(arena.biomeId).toBe(biomeId);
      expect(arena.arenaPath).toContain(`${biomeId}.png`);

      const state = makeBattleFixture(biomeId, 'shrine');
      state.arenaLightingType = arena.elementalType;
      state.arenaLightingPulse = 0.85;

      backend.beginFrame(1.25, 0.016);
      renderer.update(state, 0.016);
      renderer.render(backend, state);
      const stats = backend.endFrame();

      expect(stats.drawCalls).toBeGreaterThan(3);
      expect(stats.activeLights).toBeGreaterThan(0);
    }

    // 2. Attach bespoke 480x270 arena PNGs + manifest and verify pixelCrisp: true sprite draw
    const manifest = makeFallbackManifest();
    const arenaImg = makeFakeImage(480, 270);
    const fallbacksImg = makeFakeImage(240, 144);
    renderer.attachAssets(
      manifest,
      () => arenaImg,
      (sheetId) => (sheetId === 'fallbacks' ? fallbacksImg : null),
    );

    const drawSpriteSpy = vi.spyOn(backend, 'drawSprite');
    const state = makeBattleFixture('crater', 'rare', false, true);
    state.shutter.active = false;
    state.phase = 'command';

    backend.beginFrame(2.0, 0.016);
    renderer.render(backend, state);
    backend.endFrame();

    expect(drawSpriteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: arenaImg,
        sw: 480,
        sh: 270,
        pixelCrisp: true,
      }),
    );

    backend.dispose();
  });
});

describe('OfflineSpriteRigSynthesizer (zero ovals, 48x48 fallbacks-atlas + 16x16 pixel-grid)', () => {
  const ARCHETYPES: BodyArchetype[] = [
    'quadruped',
    'biped',
    'winged',
    'serpentine',
    'crystalline',
    'amorphous',
    'insectoid',
    'draconic',
    'construct',
    'flora',
    'aquatic',
  ];

  it('synthesizes all 11 archetypes in pure 16x16 pixel grid with ZERO ellipses/arcs/bezier curves', () => {
    const synth = new OfflineSpriteRigSynthesizer();

    ARCHETYPES.forEach((archetype, idx) => {
      const ctx = createFullMockCanvas2DContext();
      const type = ELEMENTAL_TYPES[idx % ELEMENTAL_TYPES.length];
      const pal = TYPE_PALETTES[type];

      const rig: OfflineRigDescriptor = {
        speciesId: 10 + idx * 89,
        name: `Pixel-${archetype}`,
        primaryType: type,
        archetype,
        colorHex: pal.primary,
        shiny: idx % 2 === 0,
      };

      synth.renderRig(ctx, rig, {
        cx: 120,
        cy: 120,
        size: 128,
        time: 1.4,
        facing: idx % 2 === 0 ? 'right' : 'left',
        hitFlash: idx === 3 ? 0.9 : 0,
        rimColor: pal.glow,
        reducedMotion: false,
      });

      expect(ctx.imageSmoothingEnabled).toBe(false);
      expect(ctx._calls.ellipse).not.toHaveBeenCalled();
      expect(ctx._calls.arc).not.toHaveBeenCalled();
      expect(ctx._calls.bezierCurveTo).not.toHaveBeenCalled();
      expect(ctx._calls.quadraticCurveTo).not.toHaveBeenCalled();
      expect(ctx._calls.fillRect.mock.calls.length).toBeGreaterThan(20);
    });
  });

  it('crops exact 48x48 archetype sprites from attached fallbacks-atlas.png with imageSmoothingEnabled=false', () => {
    const synth = new OfflineSpriteRigSynthesizer();
    const manifest = makeFallbackManifest();
    const sheet = makeFakeImage(240, 144);
    synth.attachFallbackSheet(sheet, manifest);

    ARCHETYPES.forEach((archetype, idx) => {
      const ctx = createFullMockCanvas2DContext();
      const rig: OfflineRigDescriptor = {
        speciesId: 25 + idx,
        name: `Atlas-${archetype}`,
        primaryType: ELEMENTAL_TYPES[idx % ELEMENTAL_TYPES.length],
        archetype,
        colorHex: '#ffd93d',
        shiny: idx === 0,
      };

      synth.renderRig(ctx, rig, {
        cx: 100,
        cy: 100,
        size: 96,
        time: 0.8,
        facing: idx % 2 === 0 ? 'left' : 'right',
        hitFlash: idx === 1 ? 0.8 : 0,
      });

      expect(ctx.imageSmoothingEnabled).toBe(false);
      expect(ctx._calls.drawImage).toHaveBeenCalledWith(
        sheet,
        (idx % 5) * 48,
        Math.floor(idx / 5) * 48,
        48,
        48,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
      );
      expect(ctx._calls.ellipse).not.toHaveBeenCalled();
      expect(ctx._calls.arc).not.toHaveBeenCalled();
    });
  });

  it('produces crisp SVG pixel-grid data URLs in pure Node and PNG data URLs when canvas exists for species 1..1025', () => {
    const synth = new OfflineSpriteRigSynthesizer();

    for (const id of [1, 4, 7, 25, 133, 151, 384, 493, 700, 887, 1008, 1025]) {
      const sp = getSpeciesEntry(id);
      const rig: OfflineRigDescriptor = {
        speciesId: sp.id,
        name: sp.name,
        primaryType: sp.type,
        archetype: sp.archetype,
        colorHex: sp.color,
        shiny: id === 1025,
      };

      const nodeUrl = synth.toDataUrl(rig, 160);
      expect(nodeUrl.startsWith('data:image/svg+xml')).toBe(true);
      expect(decodeURIComponent(nodeUrl)).toContain('shape-rendering="crispEdges"');
    }

    const mockCtx = createFullMockCanvas2DContext();
    const mockCanvas = {
      width: 160,
      height: 160,
      getContext: vi.fn(() => mockCtx),
      toDataURL: vi.fn(() => 'data:image/png;base64,PIXELPNG'),
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => mockCanvas),
    });

    const eevee = getSpeciesEntry(133);
    const pngUrl = synth.toDataUrl(
      {
        speciesId: eevee.id,
        name: eevee.name,
        primaryType: eevee.type,
        archetype: eevee.archetype,
        colorHex: eevee.color,
      },
      160,
    );
    expect(pngUrl).toBe('data:image/png;base64,PIXELPNG');
    expect(mockCtx.imageSmoothingEnabled).toBe(false);
    expect(mockCtx._calls.fillRect).toHaveBeenCalled();
  });
});

describe('Live animated sprite frame rendering & offline fallback switching', () => {
  it('renders live decoded animated frames with pixelCrisp=true and seamlessly falls back when useOfflineRig=true', async () => {
    const { backend } = await createCanvasBackendHarness();
    const renderer = new BattleTheaterRenderer();

    const frameA = { width: 56, height: 56 } as unknown as HTMLCanvasElement;
    const frameB = { width: 56, height: 56 } as unknown as HTMLCanvasElement;
    const playerFrames: DecodedSpriteFrames = {
      key: '1:b:n',
      speciesId: 1,
      back: true,
      shiny: false,
      width: 56,
      height: 56,
      frames: [
        { canvas: frameA, delayMs: 120 },
        { canvas: frameB, delayMs: 120 },
      ],
      totalDurationMs: 240,
      sourceKind: 'animated-gif',
      archetype: 'quadruped',
      mirrorX: false,
    };
    const enemyFrames: DecodedSpriteFrames = {
      key: '25:f:s',
      speciesId: 25,
      back: false,
      shiny: true,
      width: 48,
      height: 48,
      frames: [{ canvas: frameB, delayMs: 100 }],
      totalDurationMs: 100,
      sourceKind: 'animated-gif',
      archetype: 'biped',
      mirrorX: true,
    };

    const state = makeBattleFixture('forest', 'wild', false, false);
    state.shutter.active = false;
    state.phase = 'command';
    state.player.frames = playerFrames;
    state.player.useOfflineRig = false;
    state.enemy.frames = enemyFrames;
    state.enemy.useOfflineRig = false;
    state.enemy.mon.isShiny = true;
    state.enemy.hitFlash = 0.85;

    const drawSpriteSpy = vi.spyOn(backend, 'drawSprite');

    // Frame 0 window (elapsedSeconds = 0.04s -> frameA)
    state.elapsedSeconds = 0.04;
    backend.beginFrame(0.04, 0.016);
    renderer.render(backend, state);
    backend.endFrame();

    expect(drawSpriteSpy).toHaveBeenCalledWith(
      expect.objectContaining({ source: frameA, pixelCrisp: true }),
    );
    expect(drawSpriteSpy).toHaveBeenCalledWith(
      expect.objectContaining({ source: frameB, flipX: true, pixelCrisp: true }),
    );

    // Frame 1 window (elapsedSeconds = 0.16s -> frameB for player too)
    drawSpriteSpy.mockClear();
    state.elapsedSeconds = 0.16;
    backend.beginFrame(0.16, 0.016);
    renderer.render(backend, state);
    backend.endFrame();

    expect(drawSpriteSpy).toHaveBeenCalledWith(
      expect.objectContaining({ source: frameB, pixelCrisp: true }),
    );

    // Toggle offline rig mode (?offlineRig=1) -> falls back to OfflineSpriteRigSynthesizer without drawSprite sprite frames
    drawSpriteSpy.mockClear();
    state.forceOfflineRig = true;
    backend.beginFrame(0.2, 0.016);
    renderer.render(backend, state);
    backend.endFrame();

    expect(drawSpriteSpy).not.toHaveBeenCalled();
    backend.dispose();
  });
});

describe('BattleVfxDirector (all 18 ElementalTypes, heal/buff/shield, BRACED!, Shield/Stat/Shiny/Ability, Capture & Evolution)', () => {
  it('renders distinct pixel VFX choreographies + PointLights for all 18 ElementalTypes and heal/buff/shield', async () => {
    const { backend } = await createCanvasBackendHarness();
    const renderer = new BattleTheaterRenderer();

    for (const elemType of ELEMENTAL_TYPES) {
      const state = makeBattleFixture('ruins', 'wild');
      state.shutter.active = false;
      state.phase = 'animating';

      renderer.triggerVfx({
        type: elemType,
        fromSide: 'player',
        targetSide: 'enemy',
        power: 95,
        effectiveness: 2,
        category: 'attack',
        composureBraced: elemType === 'fighting' || elemType === 'dragon',
        isCrit: elemType === 'fire' || elemType === 'electric',
        duration: 0.65,
      });

      for (let step = 0; step < 6; step++) {
        renderer.update(state, 0.045);
      }

      backend.beginFrame(state.elapsedSeconds, 0.016);
      renderer.render(backend, state);
      const stats = backend.endFrame();

      expect(state.activeVfx).toHaveLength(1);
      expect(stats.activeParticles).toBeGreaterThan(0);
      expect(stats.activeLights).toBeGreaterThan(0);
    }

    for (const category of ['heal', 'buff', 'shield'] as const) {
      const state = makeBattleFixture('grove', 'wild');
      state.shutter.active = false;
      state.phase = 'animating';

      renderer.triggerVfx({
        type: category === 'heal' ? 'grass' : category === 'shield' ? 'psychic' : 'electric',
        fromSide: 'player',
        targetSide: 'player',
        power: 50,
        effectiveness: 1,
        category,
        composureBraced: false,
        isCrit: false,
        duration: 0.65,
      });

      renderer.update(state, 0.05);
      renderer.update(state, 0.05);
      backend.beginFrame(state.elapsedSeconds, 0.016);
      renderer.render(backend, state);
      const stats = backend.endFrame();

      expect(stats.activeParticles).toBeGreaterThan(0);
      expect(stats.activeLights).toBeGreaterThan(0);
    }

    expect(new BattleVfxDirector()).toBeInstanceOf(BattleVfxDirector);
    backend.dispose();
  });

  it('renders Composure BRACED! burst, Shield dome, Stat chevrons, Shiny shimmer, Apex/Elite aura, Ability banner, Capture balls & Evolution', async () => {
    const { backend, ctx } = await createCanvasBackendHarness();
    const renderer = new BattleTheaterRenderer();

    const state = makeBattleFixture('sanctum', 'shrine-trial');
    state.shutter.active = false;
    state.phase = 'command';
    state.player.bracedFlash = 0.95;
    state.player.buffFlash = 0.8;
    state.player.healFlash = 0.7;
    state.player.mon.shieldTurns = 2;
    state.player.mon.isShiny = true;
    state.player.mon.battleStages = { atk: 2, def: -1, spd: 1 };
    state.player.abilityBanner = { name: 'Starlight Shield', summary: '+1 DEF & Barrier', elapsed: 0.3 };

    state.enemy.mon.isElite = true;
    state.enemy.mon.encounterTrait = 'apex';
    state.enemy.mon.shieldTurns = 1;

    backend.beginFrame(1.0, 0.016);
    renderer.render(backend, state);
    const stats = backend.endFrame();

    expect(stats.activeParticles).toBeGreaterThan(0);
    expect(stats.activeLights).toBeGreaterThan(0);
    expect(ctx._calls.fillText).toHaveBeenCalledWith('BRACED!', expect.any(Number), expect.any(Number));
    expect(ctx._calls.fillText).toHaveBeenCalledWith('ATK+2', expect.any(Number), expect.any(Number));
    expect(ctx._calls.fillText).toHaveBeenCalledWith('DEF-1', expect.any(Number), expect.any(Number));
    expect(ctx._calls.fillText).toHaveBeenCalledWith('SPD+1', expect.any(Number), expect.any(Number));
    // R2-VIS-04: Canvas must NOT duplicate the DOM ability text box on top of floating damage
    expect(ctx._calls.fillText).not.toHaveBeenCalledWith('Starlight Shield', expect.any(Number), expect.any(Number));

    // Verify ability banner auto-prunes after 2.4s
    for (let i = 0; i < 60; i++) {
      renderer.update(state, 0.05);
    }
    expect(state.player.abilityBanner).toBeNull();

    // Verify all 3 capture BallKinds across capture progress milestones
    for (const kind of ['poke', 'great', 'star'] as BallKind[]) {
      for (const cp of [0.15, 0.38, 0.68, 0.94]) {
        const capState = makeBattleFixture('faeveldt', 'wild');
        capState.shutter.active = false;
        capState.phase = 'capturing';
        capState.enemy.captureBallKind = kind;
        capState.enemy.captureShakes = 3;
        capState.enemy.captureProgress = cp;

        backend.beginFrame(2.0 + cp, 0.016);
        renderer.render(backend, capState);
        const capStats = backend.endFrame();
        expect(capStats.activeParticles).toBeGreaterThan(0);
        expect(capStats.activeLights).toBeGreaterThan(0);
      }
    }

    // Evolution radiant spiral metamorphosis
    const evoState = makeBattleFixture('village', 'wild');
    evoState.shutter.active = false;
    evoState.phase = 'evolving';
    backend.beginFrame(3.2, 0.016);
    renderer.render(backend, evoState);
    const evoStats = backend.endFrame();
    expect(evoStats.activeParticles).toBeGreaterThan(0);
    expect(evoStats.activeLights).toBeGreaterThan(0);

    backend.dispose();
  });
});

describe('BattleTheaterRenderer shutters, camera cues, hit-stop & reducedMotion <= 0.22s', () => {
  it('renders and completes all encounter shutters (wild, rare, rival, shrine, shrine-trial) and clamps reducedMotion <= 0.22s', async () => {
    const { backend } = await createCanvasBackendHarness();
    const renderer = new BattleTheaterRenderer();
    const tiers: EncounterTier[] = ['wild', 'rare', 'rival', 'shrine', 'shrine-trial'];

    for (const tier of tiers) {
      const state = makeBattleFixture('village', tier, false);
      renderer.triggerShutter(tier, false);

      for (let i = 0; i < 6; i++) {
        renderer.update(state, 0.045);
      }
      expect(state.shutter.active).toBe(true);
      expect(state.shutter.progress).toBeGreaterThan(0);
      expect(state.shutter.progress).toBeLessThan(1);

      backend.beginFrame(state.elapsedSeconds, 0.016);
      renderer.render(backend, state);
      const midStats = backend.endFrame();
      expect(midStats.drawCalls).toBeGreaterThan(2);

      for (let i = 0; i < 30; i++) {
        renderer.update(state, 0.045);
      }
      expect(state.shutter.active).toBe(false);
      expect(state.shutter.progress).toBe(1);
    }

    // Verify reducedMotion shutter duration <= 0.22s across all tiers
    for (const tier of tiers) {
      const rmState = makeBattleFixture('peak', tier, true);
      renderer.triggerShutter(tier, true);
      renderer.update(rmState, 0.016);
      expect(rmState.shutter.duration).toBeLessThanOrEqual(0.22);
    }

    backend.dispose();
  });

  it('drives all 7 camera cues, hit-stop freeze frames, and reducedMotion shake/rotation/hit-stop suppression', async () => {
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
      const state = makeBattleFixture('rift', 'shrine', false);
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

    const rmState = makeBattleFixture('volcano', 'rival', true);
    rmState.shutter.active = false;
    renderer.triggerShutter('rival', true);
    renderer.triggerCameraCue('heavyHit');
    renderer.update(rmState, 0.016);

    const rmCam = renderer.getCameraTransform(true);
    expect(rmState.hitStopRemaining).toBe(0);
    expect(rmCam.shakeX).toBe(0);
    expect(rmCam.shakeY).toBe(0);
    expect(rmCam.rotation).toBe(0);
    expect(rmState.shutter.duration).toBeLessThanOrEqual(0.22);

    backend.beginFrame(rmState.elapsedSeconds, 0.016);
    renderer.render(backend, rmState);
    const rmStats = backend.endFrame();
    expect(rmStats.drawCalls).toBeGreaterThan(2);

    backend.dispose();
  });

  it('prevents double-ticking BattleSceneState when controller skips visual timers and renderer ticks them once', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const controller = new DojoBattleController(bridge, new SpriteAssetLoader({ forceOffline: true }));
    const renderer = new BattleTheaterRenderer();

    const state = controller.startEncounter({ biomeId: 'forest', tier: 'wild', forceOfflineRig: true });
    renderer.triggerShutter('wild', false);

    controller.update(0.016, { skipVisualTimers: true });
    renderer.update(state, 0.016);

    expect(state.elapsedSeconds).toBeCloseTo(0.016, 6);
    expect(state.shutter.progress).toBeCloseTo(0.016 / state.shutter.duration, 5);
  });

  it('frames portrait mobile battle combatants inside the upper-middle arena window above the bottom HUD (#16 Item 3)', () => {
    const mobileLayout = computeBattleStageLayout(390, 844);
    expect(mobileLayout.enemyPad.y).toBeLessThan(844 * 0.36);
    expect(mobileLayout.playerPad.y).toBeLessThan(844 * 0.50);
    expect(mobileLayout.playerPad.y).toBeGreaterThan(mobileLayout.enemyPad.y);

    const desktopLayout = computeBattleStageLayout(1366, 768);
    expect(desktopLayout.playerPad.y).toBeCloseTo(768 * 0.705, 1);
    expect(desktopLayout.enemyPad.y).toBeCloseTo(768 * 0.575, 1);
  });

  it('COMBAT-02 & COMBAT-05: renders floating combat damage/callout popups and shakes camera on consecutive hit cues via cameraCueSeq', async () => {
    const { backend, ctx } = await createCanvasBackendHarness();
    const renderer = new BattleTheaterRenderer();
    const state = makeBattleFixture('volcano', 'shrine', false);
    state.shutter.active = false;
    state.phase = 'player-acting';
    state.floatingTexts = [
      { id: 'ft-1', side: 'enemy', text: '-24', color: '#fde047', size: 24, elapsed: 0.2, delay: 0, duration: 1.3, offsetY: -8 },
      { id: 'ft-2', side: 'enemy', text: 'SUPER EFFECTIVE!', color: '#fde047', size: 15, elapsed: 0.2, delay: 0.05, duration: 1.4, offsetY: -34 },
    ];

    // Hit #1
    state.cameraCue = 'hit';
    state.cameraCueSeq = 2;
    renderer.update(state, 0.016);
    expect(state.hitStopRemaining).toBeGreaterThan(0);

    // Let hit-stop and shake decay completely
    for (let i = 0; i < 40; i++) {
      renderer.update(state, 0.04);
    }
    expect(state.hitStopRemaining).toBe(0);

    // Consecutive Hit #2 with SAME cue ('hit') but incremented cameraCueSeq MUST re-trigger hit-stop & shake!
    state.cameraCue = 'hit';
    state.cameraCueSeq = 3;
    renderer.update(state, 0.016);
    expect(state.hitStopRemaining).toBeGreaterThan(0);
    const camAfterSecondHit = renderer.getCameraTransform(false);
    expect(Math.abs(camAfterSecondHit.shakeX) + Math.abs(camAfterSecondHit.shakeY)).toBeGreaterThan(0);

    backend.beginFrame(1.5, 0.016);
    renderer.render(backend, state);
    backend.endFrame();

    expect(ctx._calls.fillText).toHaveBeenCalledWith('-24', 0, 0);
    expect(ctx._calls.fillText).toHaveBeenCalledWith('SUPER EFFECTIVE!', 0, 0);

    backend.dispose();
  });
});
