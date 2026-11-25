import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BIOME_IDS,
  TRAINER_ACCESSORY_IDS,
  TRAINER_AURA_IDS,
  TRAINER_STYLE_IDS,
  type AtlasManifest,
  type AtlasRegion,
  type BiomeId,
  type BodyArchetype,
  type DecodedSpriteFrames,
  type Direction,
  type OverworldSceneState,
  type PointLight,
  type ReadinessTier,
  type TrainerId,
} from '../../contracts';
import {
  DojoOverworldSim,
  SpriteAssetLoader,
  TILE,
  WORLD_COLS,
  WORLD_MAP,
  WORLD_ROWS,
  getBiomeVisualProfile,
  getResolvedTrainerLook,
} from '../../core/dojo';
import { StarlightStorageBridge, createDefaultSaveState } from '../../core/save/saveHydrator';
import { Canvas2DBackend } from '../engine/Canvas2DBackend';
import { MAX_RENDER_LIGHTS, OverworldRenderer } from './index';

function createMock2DContext(): CanvasRenderingContext2D {
  const makeGrad = () => ({ addColorStop: vi.fn() });
  const ctx = {
    canvas: null as unknown as HTMLCanvasElement,
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
    fill: vi.fn(),
    stroke: vi.fn(),
    createLinearGradient: vi.fn(() => makeGrad()),
    createRadialGradient: vi.fn(() => makeGrad()),
    createPattern: vi.fn(() => ({ pattern: true })),
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    shadowColor: 'transparent',
    shadowBlur: 0,
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

function createMockCanvas(width = 960, height = 540): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const ctx = createMock2DContext();
  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    getContext: vi.fn((kind: string) => (kind === '2d' ? ctx : null)),
  } as unknown as HTMLCanvasElement;
  (ctx as { canvas: HTMLCanvasElement }).canvas = canvas;
  return { canvas, ctx };
}

function makeRegionGrid(names: string[], w: number, h: number, cols = 8): Record<string, AtlasRegion> {
  const regions: Record<string, AtlasRegion> = {};
  names.forEach((id, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    regions[id] = { id, x: col * w, y: row * h, w, h };
  });
  return regions;
}

function loadV2ManifestFixture(): AtlasManifest {
  const terrainNames = Array.from({ length: 61 }, (_, i) => `tile_${i}`);
  const propNames = [
    'cottage_violet',
    'cottage_lab',
    'fountain',
    'shrine_open',
    'shrine_cleared',
    'tree_oak',
    'tree_sakura',
    'tree_pine',
    'tree_palm',
    'prop_mushroom',
    'prop_crystal',
    'chest_closed',
    'chest_open',
    'lantern',
    'signpost',
    'landmark_observatory',
    'landmark_obelisk',
  ];
  const charNames = [
    'violet_down',
    'violet_up',
    'violet_left',
    'violet_right',
    'violet_idle',
    'ozias_down',
    'ozias_up',
    'ozias_left',
    'ozias_right',
    'ozias_idle',
    'willow_idle',
    'rival_idle',
  ];
  const fallbackNames: BodyArchetype[] = [
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

  const arenas = Object.fromEntries(
    [...BIOME_IDS, 'skyhop'].map((id) => [id, `./atlases/arenas/${id}.png`]),
  ) as AtlasManifest['arenas'];

  return {
    version: '2.0.0',
    seed: 20261124,
    generatedBy: 'scripts/bake-assets.mjs',
    sheets: {
      terrain: {
        id: 'terrain',
        albedoPath: './atlases/terrain-atlas.png',
        normalPath: './atlases/terrain-normal.png',
        emissivePath: './atlases/terrain-emissive.png',
        width: 256,
        height: 256,
        tileSize: 32,
        pixelCrisp: true,
        regions: makeRegionGrid(terrainNames, 32, 32, 8),
      },
      props: {
        id: 'props',
        albedoPath: './atlases/props-atlas.png',
        normalPath: './atlases/props-normal.png',
        emissivePath: './atlases/props-emissive.png',
        width: 512,
        height: 512,
        tileSize: 64,
        pixelCrisp: true,
        regions: makeRegionGrid(propNames, 64, 64, 6),
      },
      characters: {
        id: 'characters',
        albedoPath: './atlases/characters-atlas.png',
        width: 256,
        height: 256,
        tileSize: 32,
        pixelCrisp: true,
        regions: makeRegionGrid(charNames, 32, 40, 4),
      },
      fallbacks: {
        id: 'fallbacks',
        albedoPath: './atlases/fallbacks-atlas.png',
        width: 256,
        height: 192,
        tileSize: 48,
        pixelCrisp: true,
        regions: makeRegionGrid(fallbackNames, 48, 48, 4),
      },
    },
    arenas,
    tileRegions: Object.fromEntries(terrainNames.map((n) => [n, n])),
    iconIds: [],
    totalBytes: 1024000,
  };
}

function registerFixtureAtlases(backend: Canvas2DBackend, manifest: AtlasManifest): void {
  for (const [sheetId, desc] of Object.entries(manifest.sheets)) {
    const fakeImg = { width: desc.width, height: desc.height } as unknown as HTMLCanvasElement;
    backend.registerAtlas(sheetId, fakeImg);
    backend.setAtlasRegions(sheetId, desc.regions);
  }
}

function createSimScene(trainerId: TrainerId = 'violet', starterId = 25): {
  sim: DojoOverworldSim;
  state: OverworldSceneState;
} {
  const bridge = new StarlightStorageBridge(createDefaultSaveState());
  bridge.manager.selectTrainer(trainerId);
  bridge.manager.chooseStarter(starterId);
  const loader = new SpriteAssetLoader({ forceOffline: true });
  const sim = new DojoOverworldSim(bridge, loader);
  sim.syncFromProfile();
  return { sim, state: sim.getState() };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OverworldRenderer (Starlight v2 HD-2D Pixel Overworld)', () => {
  it('frustum-culls the 100x84 WORLD_MAP (+2 tile margin), renders Starlight Village hero cottages & Secret Arcade light', async () => {
    const manifest = loadV2ManifestFixture();
    const { canvas } = createMockCanvas(960, 540);
    const backend = new Canvas2DBackend();
    await backend.init(canvas, { dprCap: 1, reducedMotion: false, crtMode: false });
    registerFixtureAtlases(backend, manifest);

    const spriteSpy = vi.spyOn(backend, 'drawSprite');
    const lightSpy = vi.spyOn(backend, 'addPointLight');

    const renderer = new OverworldRenderer();
    renderer.attachAtlas(manifest);

    const { state } = createSimScene('violet', 25);
    expect(state.cols).toBe(100);
    expect(state.rows).toBe(84);
    expect(state.worldMap.length).toBe(WORLD_ROWS);
    expect(state.worldMap[0].length).toBe(WORLD_COLS);

    state.player.look = getResolvedTrainerLook('violet', {
      styleId: 'default',
      accessory: 'cap',
      cape: true,
      aura: 'stars',
    });

    renderer.update(state, 0.016);
    backend.beginFrame(1.5, 0.016);
    renderer.render(backend, state);
    const stats = backend.endFrame();

    expect(stats.backend).toBe('canvas2d');
    expect(stats.drawCalls).toBeGreaterThan(0);

    const cmds = spriteSpy.mock.calls.map((c) => c[0]);
    const terrainCmds = cmds.filter((c) => c.sheetId === 'terrain');
    // 960x540 at 32px = ~30x17 (+2 margin -> max ~35x22 = ~770), strictly << 8400 total map tiles
    expect(terrainCmds.length).toBeGreaterThan(300);
    expect(terrainCmds.length).toBeLessThan(1200);
    expect(terrainCmds.every((c) => c.pixelCrisp === true && c.useNormalMap === true)).toBe(true);

    // Cohesive hero pixel cottages instead of raw flat blocks
    const propRegions = new Set(cmds.filter((c) => c.sheetId === 'props').map((c) => c.regionId));
    expect(propRegions.has('cottage_violet')).toBe(true);
    expect(propRegions.has('cottage_lab')).toBe(true);
    expect(propRegions.has('fountain')).toBe(true);
    expect(propRegions.has('signpost')).toBe(true);
    expect(propRegions.has('lantern')).toBe(true);
    expect(propRegions.has('tree_oak')).toBe(true);
    expect(propRegions.has('landmark_observatory')).toBe(true);

    // Secret Arcade star glimmer light at (11,12) & player aura light
    const lightIds = lightSpy.mock.calls.map((c) => c[0].id);
    expect(lightIds.some((id) => id === 'secret-arcade-star')).toBe(true);
    expect(lightIds.some((id) => id === 'player-aura-stars')).toBe(true);

    backend.dispose();
  });

  it('draws ALL 61 tile IDs (0..60) crisply from terrain sheet, emits water/lava quads with 4-neighbor foam, and picks biome trees', async () => {
    const manifest = loadV2ManifestFixture();
    const { canvas } = createMockCanvas(2240, 256);
    const backend = new Canvas2DBackend();
    await backend.init(canvas, { dprCap: 1, reducedMotion: false, crtMode: false });
    registerFixtureAtlases(backend, manifest);

    const spriteSpy = vi.spyOn(backend, 'drawSprite');
    const waterSpy = vi.spyOn(backend, 'drawWaterQuad');
    const renderer = new OverworldRenderer();
    renderer.attachAtlas(manifest);

    // Build a 63x3 test world containing every tile ID 0..60 surrounded by walkable ground
    const row0 = Array.from({ length: 63 }, () => TILE.GRASS);
    const row1 = [TILE.GRASS, ...Array.from({ length: 61 }, (_, i) => i), TILE.GRASS];
    const row2 = Array.from({ length: 63 }, () => TILE.GRASS);

    const { state } = createSimScene('ozias', 4);
    state.cols = 63;
    state.rows = 3;
    state.worldMap = [row0, row1, row2];
    state.player.x = 31;
    state.player.y = 1;
    state.landmarks = [];
    state.shrines = [];
    state.chests = [];
    state.npcs = [];
    state.rivals = [];

    renderer.update(state, 0.016);
    backend.beginFrame(1.0, 0.016);
    renderer.render(backend, state);
    backend.endFrame();

    const terrainRegions = new Set(
      spriteSpy.mock.calls
        .map((c) => c[0])
        .filter((c) => c.sheetId === 'terrain')
        .map((c) => c.regionId),
    );
    for (let id = 0; id <= 60; id++) {
      expect(terrainRegions.has(`tile_${id}`)).toBe(true);
    }

    const propRegions61 = new Set(
      spriteSpy.mock.calls
        .map((c) => c[0])
        .filter((c) => c.sheetId === 'props')
        .map((c) => c.regionId),
    );
    expect(propRegions61.has('fountain')).toBe(true);
    expect(propRegions61.has('lantern')).toBe(true);
    expect(propRegions61.has('signpost')).toBe(true);

    // Water/Lava tiles (WATER=4, SHALLOW_WATER=5, LAVA=18, REEF_WATER=40) emit drawWaterQuad with foamMask
    const waterCalls = waterSpy.mock.calls;
    expect(waterCalls.length).toBe(4);
    for (const call of waterCalls) {
      expect(call[5]).toBeGreaterThan(0); // Surrounded N/S by grass -> shoreline foam mask > 0
    }

    // Biome-specific tree sprites for TILE.TREE
    const biomeTreeCases: Array<[BiomeId, string]> = [
      ['village', 'tree_oak'],
      ['forest', 'tree_oak'],
      ['grove', 'tree_sakura'],
      ['faeveldt', 'tree_sakura'],
      ['peak', 'tree_pine'],
      ['highlands', 'tree_pine'],
      ['water', 'tree_palm'],
      ['atoll', 'tree_palm'],
      ['reef', 'tree_palm'],
      ['desert', 'tree_palm'],
      ['marsh', 'prop_mushroom'],
      ['cave', 'prop_crystal'],
      ['crater', 'prop_crystal'],
      ['rift', 'prop_crystal'],
    ];

    for (const [bId, expectedProp] of biomeTreeCases) {
      spriteSpy.mockClear();
      state.currentBiomeId = bId;
      state.worldMap = [
        [TILE.GRASS, TILE.GRASS, TILE.GRASS],
        [TILE.GRASS, TILE.TREE, TILE.GRASS],
        [TILE.GRASS, TILE.GRASS, TILE.GRASS],
      ];
      state.cols = 3;
      state.rows = 3;
      state.player.x = 0;
      state.player.y = 0;

      // Put tree at a coordinate matching that biome in WORLD_MAP or test via getBiomeAt coordinates
      const coordByBiome: Partial<Record<BiomeId, [number, number]>> = {
        village: [5, 14],
        forest: [5, 5],
        grove: [5, 42],
        faeveldt: [90, 10],
        peak: [40, 25],
        highlands: [60, 76],
        water: [5, 22],
        atoll: [10, 76],
        reef: [10, 64],
        desert: [58, 10],
        marsh: [10, 52],
        cave: [25, 10],
        crater: [90, 50],
        rift: [75, 45],
      };
      const [wx, wy] = coordByBiome[bId]!;
      const mapCopy = WORLD_MAP.map((r) => [...r]);
      mapCopy[wy][wx] = TILE.TREE;
      state.cols = WORLD_COLS;
      state.rows = WORLD_ROWS;
      state.worldMap = mapCopy;
      state.player.x = wx;
      state.player.y = wy;

      renderer.update(state, 0.016);
      backend.beginFrame(1.2, 0.016);
      renderer.render(backend, state);
      backend.endFrame();

      const props = spriteSpy.mock.calls
        .map((c) => c[0])
        .filter((c) => c.sheetId === 'props')
        .map((c) => c.regionId);
      expect(props).toContain(expectedProp);
    }

    backend.dispose();
  });

  it('renders all 18 canonical biomes cleanly via DojoOverworldSim and applies getBiomeVisualProfile', async () => {
    const manifest = loadV2ManifestFixture();
    const { canvas } = createMockCanvas(960, 540);
    const backend = new Canvas2DBackend();
    await backend.init(canvas, { dprCap: 1, reducedMotion: false, crtMode: false });
    registerFixtureAtlases(backend, manifest);

    const gradeSpy = vi.spyOn(backend, 'setColorGrade');
    const waterCfgSpy = vi.spyOn(backend, 'setWaterConfig');
    const canopySpy = vi.spyOn(backend, 'setCanopyConfig');

    const renderer = new OverworldRenderer();
    renderer.attachAtlas(manifest);
    const { sim } = createSimScene('violet', 1);

    expect(BIOME_IDS.length).toBe(18);
    for (const biomeId of BIOME_IDS) {
      gradeSpy.mockClear();
      waterCfgSpy.mockClear();
      canopySpy.mockClear();

      sim.warpToBiome(biomeId);
      const state = sim.getState();
      expect(state.currentBiomeId).toBe(biomeId);

      renderer.update(state, 0.016);
      backend.beginFrame(2.0, 0.016);
      renderer.render(backend, state);
      const stats = backend.endFrame();

      expect(stats.drawCalls).toBeGreaterThan(0);
      const expectedProfile = getBiomeVisualProfile(biomeId);
      expect(gradeSpy).toHaveBeenCalledWith(expect.objectContaining({ biomeId: expectedProfile.id }));
      expect(waterCfgSpy).toHaveBeenCalledWith(expect.objectContaining({ enabled: expectedProfile.waterConfig.enabled }));
      expect(canopySpy).toHaveBeenCalledWith(expect.objectContaining({ enabled: expectedProfile.canopyConfig.enabled }));
    }

    backend.dispose();
  });

  it('enforces the <= 24 point-light budget cap and sorts lights by distance to camera center', async () => {
    const manifest = loadV2ManifestFixture();
    const { canvas } = createMockCanvas(1280, 720);
    const backend = new Canvas2DBackend();
    await backend.init(canvas, { dprCap: 1, reducedMotion: false, crtMode: false });
    registerFixtureAtlases(backend, manifest);

    const lightSpy = vi.spyOn(backend, 'addPointLight');
    const renderer = new OverworldRenderer();
    renderer.attachAtlas(manifest);

    const { state } = createSimScene('violet', 25);
    // Position player in map interior (40, 40) so camera center is unclamped
    state.player.x = 40;
    state.player.y = 40;
    state.player.tileX = 40;
    state.player.tileY = 40;
    state.player.look = getResolvedTrainerLook('violet', {
      styleId: 'royal',
      accessory: 'crown',
      cape: true,
      aura: 'cosmic',
    });

    // Pack > 50 candidate lights around (40, 40)
    const denseMap = WORLD_MAP.map((r) => [...r]);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const tx = 40 + dx;
        const ty = 40 + dy;
        if (dx === 0 && dy === 0) continue;
        denseMap[ty][tx] = (dx + dy) % 2 === 0 ? TILE.LANTERN : TILE.HEAL;
      }
    }
    state.worldMap = denseMap;
    state.shrines = state.shrines.map((s, idx) => ({
      ...s,
      x: 38 + (idx % 5),
      y: 38 + Math.floor(idx / 5),
    }));

    renderer.update(state, 0.016);
    backend.beginFrame(1.0, 0.016);
    renderer.render(backend, state);
    const stats = backend.endFrame();

    expect(MAX_RENDER_LIGHTS).toBe(24);
    expect(lightSpy.mock.calls.length).toBe(24);
    expect(stats.activeLights).toBeLessThanOrEqual(24);

    // Verify lights are ordered nearest-first from camera center
    const camX = (state.player.x + 0.5) * state.tileSize;
    const camY = (state.player.y + 0.5) * state.tileSize;
    const emitted: PointLight[] = lightSpy.mock.calls.map((c) => c[0]);
    expect(emitted[0].id).toBe('player-aura-cosmic');
    for (let i = 1; i < emitted.length; i++) {
      const prevD = Math.hypot(emitted[i - 1].x - camX, emitted[i - 1].y - camY);
      const curD = Math.hypot(emitted[i].x - camX, emitted[i].y - camY);
      expect(curD).toBeGreaterThanOrEqual(prevD - 1e-4);
    }

    backend.dispose();
  });

  it('tracks spring-physics parting tall grass across all 7 grass types and resets cleanly', async () => {
    const { canvas } = createMockCanvas(960, 540);
    const backend = new Canvas2DBackend();
    await backend.init(canvas, { dprCap: 1, reducedMotion: false, crtMode: false });

    const renderer = new OverworldRenderer();
    expect(renderer.getDisplacementCount()).toBe(0);

    const { state } = createSimScene('violet', 1);
    const grassTypes = [
      TILE.TALL_GRASS,
      TILE.SNOW_GRASS,
      TILE.GROVE_GRASS,
      TILE.MARSH_GRASS,
      TILE.CANYON_GRASS,
      TILE.FAE_GRASS,
      TILE.CROWN_GRASS,
    ];

    for (const grassTile of grassTypes) {
      renderer.resetEffects();
      expect(renderer.getDisplacementCount()).toBe(0);

      state.worldMap = [
        [TILE.GRASS, TILE.GRASS, TILE.GRASS, TILE.GRASS, TILE.GRASS],
        [TILE.GRASS, grassTile, grassTile, TILE.GRASS, TILE.GRASS],
        [TILE.GRASS, TILE.GRASS, TILE.GRASS, TILE.GRASS, TILE.GRASS],
      ];
      state.cols = 5;
      state.rows = 3;
      state.player.x = 1;
      state.player.y = 1;
      state.player.moving = true;
      if (state.follower) {
        state.follower.x = 2;
        state.follower.y = 1;
        state.follower.moving = true;
      }

      renderer.update(state, 0.016);
      expect(renderer.getDisplacementCount()).toBeGreaterThan(0);

      backend.beginFrame(1.0, 0.016);
      renderer.render(backend, state);
      backend.endFrame();
    }

    // Move away and let spring physics decay to 0
    state.player.x = 4;
    state.player.y = 2;
    state.player.moving = false;
    if (state.follower) {
      state.follower.x = 4;
      state.follower.y = 0;
      state.follower.moving = false;
    }
    for (let i = 0; i < 45; i++) {
      state.elapsedSeconds += 0.05;
      renderer.update(state, 0.05);
    }
    expect(renderer.getDisplacementCount()).toBe(0);

    // Re-trigger and verify resetEffects clears immediately
    state.player.x = 1;
    state.player.y = 1;
    renderer.update(state, 0.016);
    expect(renderer.getDisplacementCount()).toBeGreaterThan(0);
    renderer.resetEffects();
    expect(renderer.getDisplacementCount()).toBe(0);

    backend.dispose();
  });

  it('renders animated Lead Pokémon frames via SpriteAssetLoader.selectFrame, fallbacks for all 11 archetypes, shiny sparkles, NPCs & Rivals', async () => {
    const manifest = loadV2ManifestFixture();
    const { canvas } = createMockCanvas(960, 540);
    const backend = new Canvas2DBackend();
    await backend.init(canvas, { dprCap: 1, reducedMotion: false, crtMode: false });
    registerFixtureAtlases(backend, manifest);

    const spriteSpy = vi.spyOn(backend, 'drawSprite');
    const particleSpy = vi.spyOn(backend, 'drawParticle');
    const renderer = new OverworldRenderer();
    renderer.attachAtlas(manifest);

    const { state } = createSimScene('violet', 25);

    // 1. Live animated decoded GIF frames on follower
    const frame0 = { width: 48, height: 48 } as unknown as HTMLCanvasElement;
    const frame1 = { width: 48, height: 48 } as unknown as HTMLCanvasElement;
    const decoded: DecodedSpriteFrames = {
      key: '25:f:s',
      speciesId: 25,
      back: false,
      shiny: true,
      width: 48,
      height: 48,
      frames: [
        { canvas: frame0, delayMs: 100 },
        { canvas: frame1, delayMs: 100 },
      ],
      totalDurationMs: 200,
      sourceKind: 'animated-gif',
      archetype: 'biped',
    };
    state.follower = {
      speciesId: 25,
      name: 'Pikachu',
      type: 'electric',
      isShiny: true,
      x: 8,
      y: 14,
      facing: 'right',
      moving: true,
      walkCycle: 0.4,
      frames: decoded,
    };

    state.elapsedSeconds = 0.02;
    renderer.update(state, 0.016);
    backend.beginFrame(0.02, 0.016);
    renderer.render(backend, state);
    backend.endFrame();

    expect(spriteSpy.mock.calls.some((c) => c[0].source === frame0 && c[0].pixelCrisp === true)).toBe(true);
    expect(particleSpy).toHaveBeenCalled();

    spriteSpy.mockClear();
    state.elapsedSeconds = 0.14;
    backend.beginFrame(0.14, 0.016);
    renderer.render(backend, state);
    backend.endFrame();
    expect(spriteSpy.mock.calls.some((c) => c[0].source === frame1 && c[0].pixelCrisp === true)).toBe(true);

    // 2. Fallback sprites for all 11 archetypes when follower.frames is null
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
    for (const arch of archetypes) {
      spriteSpy.mockClear();
      state.follower = {
        speciesId: 133,
        name: 'Partner',
        type: 'normal',
        isShiny: false,
        x: 8,
        y: 14,
        facing: 'left',
        moving: false,
        walkCycle: 0,
        frames: {
          key: 'fb',
          speciesId: 133,
          back: false,
          shiny: false,
          width: 48,
          height: 48,
          frames: [],
          totalDurationMs: 1000,
          sourceKind: 'offline-pixel',
          archetype: arch,
        },
      };
      backend.beginFrame(1.0, 0.016);
      renderer.render(backend, state);
      backend.endFrame();

      expect(
        spriteSpy.mock.calls.some((c) => c[0].sheetId === 'fallbacks' && c[0].regionId === arch),
      ).toBe(true);
    }

    // 3. NPCs (willow_idle) & Rivals (rival_idle) + all 4 readiness tiers + shrines + chests + bfsPath + nearbyInteraction + compassTarget + landmarks
    spriteSpy.mockClear();
    state.player.x = 11;
    state.player.y = 6; // Bring Forest Shrine (15,3), Rival Leo (11,5), Chest (17,1), Willow (9,12), Forge Pillar (7,8) into view
    state.nearbyInteraction = {
      kind: 'shrine',
      id: 'forest_shrine',
      x: 15,
      y: 3,
      label: 'Forest Shrine',
      actionVerb: 'Challenge Shrine',
    };
    state.bfsPath = [
      { x: 11, y: 6 },
      { x: 12, y: 6 },
      { x: 13, y: 6 },
    ];
    state.compassTarget = {
      x: 92,
      y: 76,
      label: 'Terastal Crystal Shrine',
      biomeId: 'crater',
      kind: 'shrine',
      distanceTiles: 100,
      angleRad: 0.7,
    };
    const tiers: ReadinessTier[] = ['favored', 'balanced', 'challenging', 'danger'];
    state.shrines = state.shrines.map((sh, i) => ({
      ...sh,
      cleared: i % 2 === 1,
      readinessTier: tiers[i % tiers.length],
    }));
    state.chests = state.chests.map((ch, i) => ({ ...ch, opened: i % 2 === 1 }));
    state.rivals = state.rivals.map((rv, i) => ({
      ...rv,
      readinessTier: tiers[i % tiers.length],
      defeated: i % 2 === 1,
    }));

    renderer.update(state, 0.016);
    backend.beginFrame(1.5, 0.016);
    renderer.render(backend, state);
    backend.endFrame();

    const charRegions = new Set(
      spriteSpy.mock.calls
        .map((c) => c[0])
        .filter((c) => c.sheetId === 'characters')
        .map((c) => c.regionId),
    );
    expect(charRegions.has('willow_idle')).toBe(true);
    expect(charRegions.has('rival_idle')).toBe(true);

    const propRegions = new Set(
      spriteSpy.mock.calls
        .map((c) => c[0])
        .filter((c) => c.sheetId === 'props')
        .map((c) => c.regionId),
    );
    expect(propRegions.has('shrine_open') || propRegions.has('shrine_cleared')).toBe(true);
    expect(propRegions.has('chest_closed') || propRegions.has('chest_open')).toBe(true);
    expect(propRegions.has('landmark_obelisk')).toBe(true);

    backend.dispose();
  });

  it('renders live Violet & Ozias Style Studio cosmetics across all 10 styles, 8 accessories, cape toggle, 6 auras, 4 directions, and atlas-null fallback', async () => {
    const manifest = loadV2ManifestFixture();
    const { canvas } = createMockCanvas(640, 360);
    const backend = new Canvas2DBackend();
    await backend.init(canvas, { dprCap: 1, reducedMotion: false, crtMode: false });
    registerFixtureAtlases(backend, manifest);

    const spriteSpy = vi.spyOn(backend, 'drawSprite');
    const lightSpy = vi.spyOn(backend, 'addPointLight');
    const renderer = new OverworldRenderer();
    renderer.attachAtlas(manifest);

    const { state } = createSimScene('violet', 1);
    const trainers: TrainerId[] = ['violet', 'ozias'];
    const directions: Direction[] = ['down', 'up', 'left', 'right'];

    const iterations = Math.max(
      TRAINER_STYLE_IDS.length,
      TRAINER_ACCESSORY_IDS.length,
      TRAINER_AURA_IDS.length,
    );

    for (let i = 0; i < iterations; i++) {
      const trainerId = trainers[i % trainers.length];
      const dir = directions[i % directions.length];
      const styleId = TRAINER_STYLE_IDS[i % TRAINER_STYLE_IDS.length];
      const accessory = TRAINER_ACCESSORY_IDS[i % TRAINER_ACCESSORY_IDS.length];
      const aura = TRAINER_AURA_IDS[i % TRAINER_AURA_IDS.length];
      const cape = i % 2 === 0;

      spriteSpy.mockClear();
      lightSpy.mockClear();

      state.player.trainerId = trainerId;
      state.player.facing = dir;
      state.player.moving = true;
      state.player.x = 8 + (i % 4) * 0.35;
      state.player.walkCycle += 0.6;
      state.player.look = getResolvedTrainerLook(trainerId, {
        styleId,
        accessory,
        cape,
        aura,
      });
      state.reducedMotion = i % 3 === 0;
      state.elapsedSeconds += 0.1;

      renderer.update(state, 0.032);
      backend.beginFrame(state.elapsedSeconds, 0.032);
      renderer.render(backend, state);
      const stats = backend.endFrame();

      expect(stats.drawCalls).toBeGreaterThan(0);
      expect(
        spriteSpy.mock.calls.some(
          (c) => c[0].sheetId === 'characters' && c[0].regionId === `${trainerId}_${dir}`,
        ),
      ).toBe(true);

      const hasAuraLight = lightSpy.mock.calls.some((c) => c[0].id === `player-aura-${aura}`);
      expect(hasAuraLight).toBe(aura !== 'none');
    }

    // Verify clean procedural fallback rendering when manifest is null
    renderer.attachAtlas(null);
    state.player.x = 8;
    state.player.y = 15;
    renderer.update(state, 0.016);
    backend.beginFrame(5.0, 0.016);
    renderer.render(backend, state);
    const fallbackStats = backend.endFrame();
    expect(fallbackStats.drawCalls).toBeGreaterThan(0);

    backend.dispose();
  });
});
