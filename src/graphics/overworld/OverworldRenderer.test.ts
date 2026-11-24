import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BIOME_IDS,
  type AtlasManifest,
  type AtlasRegion,
  type BiomeId,
  type Direction,
  type OverworldActor,
  type OverworldLandmark,
  type OverworldProp,
  type OverworldSceneState,
  type PointLight,
  type StyleLoadout,
} from '../../contracts';
import { BIOME_DESCRIPTORS, getOverworldMap } from '../../core/data/biomes';
import {
  STYLE_AURAS,
  STYLE_CAPES,
  STYLE_HEADGEAR,
  STYLE_OUTFITS,
} from '../../core/data/styleCatalog';
import { Canvas2DBackend } from '../engine/Canvas2DBackend';
import { OverworldRenderer } from './index';

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

function makeSceneState(
  biomeId: BiomeId,
  overrides?: Partial<OverworldSceneState>,
): OverworldSceneState {
  const biome = BIOME_DESCRIPTORS[biomeId];
  const map = getOverworldMap(biomeId);
  const defaultStyle: StyleLoadout = {
    outfit: 'voyager',
    cape: 'starweave',
    headgear: 'star-beret',
    aura: 'starlight',
    primaryAccent: '#ffd166',
    secondaryAccent: '#7be8ff',
  };

  const player: OverworldActor = {
    id: 'player-1',
    role: 'player',
    name: 'Avery',
    x: map.spawnX,
    y: map.spawnY,
    facing: 'down',
    moving: false,
    walkCycle: 0,
    style: defaultStyle,
  };

  const follower: OverworldActor = {
    id: 'follower-1',
    role: 'follower',
    name: 'Eevee',
    x: map.spawnX - 1.1,
    y: map.spawnY - 0.3,
    facing: 'down',
    moving: false,
    walkCycle: 0,
    speciesId: 133,
    primaryType: 'normal',
  };

  const npcs: OverworldActor[] = [
    {
      id: 'npc-1',
      role: 'npc',
      name: 'Ranger Lyra',
      x: 11.2,
      y: 10.5,
      facing: 'right',
      moving: false,
      walkCycle: 0,
      accentHex: '#448876',
    },
    {
      id: 'rival-1',
      role: 'rival',
      name: 'Vesper',
      x: 15.8,
      y: 10.5,
      facing: 'left',
      moving: false,
      walkCycle: 0,
      accentHex: '#843080',
    },
  ];

  return {
    biome,
    map,
    player,
    follower,
    npcs,
    timeOfDay: 0.8,
    elapsedSeconds: 2.5,
    reducedMotion: false,
    activeWayfindingTarget: map.landmarks[0]
      ? {
          x: map.landmarks[0].tileX + map.landmarks[0].widthTiles * 0.5,
          y: map.landmarks[0].tileY + map.landmarks[0].heightTiles * 0.5,
          label: map.landmarks[0].label,
          kind: map.landmarks[0].kind,
        }
      : null,
    nearbyInteraction: map.landmarks[0] ?? null,
    ...overrides,
  };
}

function loadManifestFixture(): AtlasManifest {
  const cols = [
    'ground',
    'tall-grass',
    'sand',
    'cobble',
    'cliff',
    'shallow-water',
    'deep-water',
    'bridge',
    'plaza',
    'flowerbed',
    'shore-edge',
    'cliff-top',
  ];
  const regions: Record<string, AtlasRegion> = {};
  const biomeTileRowMap = {} as Record<BiomeId, number>;
  BIOME_IDS.forEach((biomeId, row) => {
    biomeTileRowMap[biomeId] = row;
    cols.forEach((colName, col) => {
      const id = `${biomeId}:${colName}`;
      regions[id] = { id, x: col * 32, y: row * 32, w: 32, h: 32 };
    });
  });

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
        width: 384,
        height: 608,
        tileSize: 32,
        regions,
      },
    },
    biomeTileRowMap,
    iconIds: [],
    totalBytes: 1086136,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OverworldRenderer', () => {
  it('renders Starlight Village and key showcase biomes cleanly on Canvas2DBackend with water quads and zero errors', async () => {
    const biomesToTest: BiomeId[] = [
      'starlight-village',
      'verdant-canopy',
      'ember-caldera',
      'sapphire-lagoon',
      'frost-glacier',
    ];

    const { canvas } = createMockCanvas(960, 540);
    const backend = new Canvas2DBackend();
    await backend.init(canvas, { dprCap: 2, reducedMotion: false, crtMode: false });

    const waterSpy = vi.spyOn(backend, 'drawWaterQuad');
    const canopySpy = vi.spyOn(backend, 'setCanopyConfig');
    const gradeSpy = vi.spyOn(backend, 'setColorGrade');
    const renderer = new OverworldRenderer();

    for (const biomeId of biomesToTest) {
      waterSpy.mockClear();
      canopySpy.mockClear();
      gradeSpy.mockClear();

      const state = makeSceneState(biomeId);
      renderer.update(state, 0.016);

      backend.beginFrame(state.elapsedSeconds, 0.016);
      renderer.render(backend, state);
      const stats = backend.endFrame();

      expect(stats.backend).toBe('canvas2d');
      expect(stats.drawCalls).toBeGreaterThan(0);
      expect(stats.activeLights).toBeGreaterThan(0);
      expect(waterSpy).toHaveBeenCalled();
      expect(gradeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ biomeId }),
      );

      if (biomeId === 'verdant-canopy') {
        expect(canopySpy).toHaveBeenCalledWith(
          expect.objectContaining({
            enabled: true,
            sunbeamIntensity: expect.any(Number),
          }),
        );
        const lastCanopy = canopySpy.mock.calls.at(-1)?.[0];
        expect(lastCanopy?.sunbeamIntensity).toBeGreaterThan(0.3);
      }
    }

    backend.dispose();
  });

  it('renders all 19 canonical biomes cleanly without runtime errors', async () => {
    const { canvas } = createMockCanvas(960, 540);
    const backend = new Canvas2DBackend();
    await backend.init(canvas, { dprCap: 1, reducedMotion: false, crtMode: false });
    const renderer = new OverworldRenderer();

    for (const biomeId of BIOME_IDS) {
      const state = makeSceneState(biomeId);
      renderer.update(state, 0.016);
      backend.beginFrame(1.0, 0.016);
      renderer.render(backend, state);
      const stats = backend.endFrame();
      expect(stats.drawCalls).toBeGreaterThan(0);
    }

    backend.dispose();
  });

  it('tracks spring-physics tall grass displacement around player and follower and clears on resetEffects', async () => {
    const { canvas } = createMockCanvas(960, 540);
    const backend = new Canvas2DBackend();
    await backend.init(canvas, { dprCap: 1, reducedMotion: false, crtMode: false });
    const renderer = new OverworldRenderer();

    expect(renderer.getDisplacementCount()).toBe(0);

    const state = makeSceneState('verdant-canopy');
    const grassIdx = state.map.tiles.findIndex((t) => t === 'tall-grass');
    expect(grassIdx).toBeGreaterThanOrEqual(0);
    const gx = grassIdx % state.map.width;
    const gy = Math.floor(grassIdx / state.map.width);

    // Move player & follower directly into the tall grass patch
    state.player.x = gx + 0.5;
    state.player.y = gy + 0.5;
    state.player.moving = true;
    state.follower.x = gx + 0.2;
    state.follower.y = gy + 0.6;
    state.follower.moving = true;

    renderer.update(state, 0.016);
    expect(renderer.getDisplacementCount()).toBeGreaterThan(0);

    backend.beginFrame(1.0, 0.016);
    renderer.render(backend, state);
    backend.endFrame();

    // Move player & follower away and allow spring displacement to decay back to 0
    state.player.x = 13.5;
    state.player.y = 10.5;
    state.player.moving = false;
    state.follower.x = 12.5;
    state.follower.y = 10.5;
    state.follower.moving = false;
    for (let i = 0; i < 45; i++) {
      state.elapsedSeconds += 0.05;
      renderer.update(state, 0.05);
    }
    expect(renderer.getDisplacementCount()).toBe(0);

    // Re-trigger displacement and verify resetEffects clears it immediately
    state.player.x = gx + 0.5;
    state.player.y = gy + 0.5;
    renderer.update(state, 0.016);
    expect(renderer.getDisplacementCount()).toBeGreaterThan(0);

    renderer.resetEffects();
    expect(renderer.getDisplacementCount()).toBe(0);

    backend.dispose();
  });

  it('emits real-time 2D PointLights for cottages, fountains, shrines, starfall nodes, observatory, and Style Studio auras', async () => {
    const { canvas } = createMockCanvas(1280, 720);
    const backend = new Canvas2DBackend();
    await backend.init(canvas, { dprCap: 1, reducedMotion: false, crtMode: false });

    const lightSpy = vi.spyOn(backend, 'addPointLight');
    const renderer = new OverworldRenderer();

    // 1. Starlight Village (cottage windows, fountain, studio, observatory, signpost, starfall, chest + starlight aura)
    const villageState = makeSceneState('starlight-village');
    renderer.update(villageState, 0.016);
    backend.beginFrame(2.0, 0.016);
    renderer.render(backend, villageState);
    const villageStats = backend.endFrame();

    const emittedVillageLights: PointLight[] = lightSpy.mock.calls.map((c) => c[0]);
    const ids = emittedVillageLights.map((l) => l.id);

    expect(ids.some((id) => id.includes('player-aura-starlight'))).toBe(true);
    expect(ids.some((id) => id.includes('cottage') && id.includes('win-left'))).toBe(true);
    expect(ids.some((id) => id.includes('cottage') && id.includes('win-right'))).toBe(true);
    expect(ids.some((id) => id.includes('fountain'))).toBe(true);
    expect(ids.some((id) => id.includes('observatory'))).toBe(true);
    expect(ids.some((id) => id.includes('starfall'))).toBe(true);
    expect(villageStats.activeLights).toBeGreaterThanOrEqual(6);
    expect(villageStats.activeLights).toBeLessThanOrEqual(24);

    // 2. Ember Caldera Shrine elemental hue + aurora aura
    lightSpy.mockClear();
    const calderaState = makeSceneState('ember-caldera');
    calderaState.player.style = {
      outfit: 'solstice-tunic',
      cape: 'cinder-cloak',
      headgear: 'sky-goggles',
      aura: 'aurora',
      primaryAccent: '#ffcf70',
      secondaryAccent: '#4ef2c2',
    };
    renderer.update(calderaState, 0.016);
    backend.beginFrame(2.1, 0.016);
    renderer.render(backend, calderaState);
    backend.endFrame();

    const calderaLights = lightSpy.mock.calls.map((c) => c[0]);
    expect(calderaLights.some((l) => l.id === 'player-aura-aurora')).toBe(true);
    const shrineLight = calderaLights.find((l) => l.id.includes('shrine'));
    expect(shrineLight).toBeDefined();
    // Fire shrine hue should have dominant red channel
    expect(shrineLight!.color[0]).toBeGreaterThan(shrineLight!.color[2]);

    // 3. Removing aura removes aura PointLight cleanly
    lightSpy.mockClear();
    calderaState.player.style = {
      ...calderaState.player.style,
      aura: 'none',
    };
    backend.beginFrame(2.2, 0.016);
    renderer.render(backend, calderaState);
    backend.endFrame();
    expect(lightSpy.mock.calls.some((c) => c[0].id.startsWith('player-aura-'))).toBe(false);

    backend.dispose();
  });

  it('uses baked terrain atlas regions via backend.drawSprite when AtlasManifest is attached', async () => {
    const manifest = loadManifestFixture();
    const { canvas } = createMockCanvas(960, 540);
    const backend = new Canvas2DBackend();
    await backend.init(canvas, { dprCap: 1, reducedMotion: false, crtMode: false });

    const terrainSheet = { width: 384, height: 608 } as unknown as HTMLCanvasElement;
    backend.registerAtlas('terrain', terrainSheet);
    backend.setAtlasRegions('terrain', manifest.sheets.terrain.regions);

    const spriteSpy = vi.spyOn(backend, 'drawSprite');
    const renderer = new OverworldRenderer();
    renderer.attachAtlas(manifest);

    const state = makeSceneState('sapphire-lagoon');
    renderer.update(state, 0.016);
    backend.beginFrame(1.0, 0.016);
    renderer.render(backend, state);
    const stats = backend.endFrame();

    expect(stats.drawCalls).toBeGreaterThan(0);
    expect(spriteSpy).toHaveBeenCalled();

    const terrainCalls = spriteSpy.mock.calls
      .map((c) => c[0])
      .filter((cmd) => cmd.sheetId === 'terrain');
    expect(terrainCalls.length).toBeGreaterThan(20);
    expect(terrainCalls.some((cmd) => cmd.regionId === 'sapphire-lagoon:ground')).toBe(true);
    expect(terrainCalls.some((cmd) => cmd.regionId === 'sapphire-lagoon:cobble')).toBe(true);
    expect(
      terrainCalls.some(
        (cmd) =>
          cmd.sy === manifest.biomeTileRowMap['sapphire-lagoon'] * manifest.sheets.terrain.tileSize,
      ),
    ).toBe(true);

    backend.dispose();
  });

  it('renders all 12 prop kinds, all 9 landmark kinds (open/closed chest, dock), all Style Studio loadouts, directions, footsteps, off-screen wayfinding, and reducedMotion', async () => {
    const { canvas } = createMockCanvas(640, 360);
    const backend = new Canvas2DBackend();
    await backend.init(canvas, { dprCap: 1, reducedMotion: false, crtMode: false });
    const renderer = new OverworldRenderer();

    const propKinds: OverworldProp['kind'][] = [
      'crystal',
      'ember-vent',
      'spore-lantern',
      'coral',
      'ruin-pillar',
      'bamboo',
      'pine',
      'blossom-tree',
      'lantern-post',
      'boulder',
      'cloud-stone',
      'gear-spire',
    ];

    const customProps: OverworldProp[] = propKinds.map((kind, i) => ({
      id: `test-prop-${kind}`,
      biomeId: 'starlight-village',
      kind,
      tileX: 2 + (i % 6) * 3,
      tileY: 4 + Math.floor(i / 6) * 4,
      scale: 1,
      swayPhase: i * 0.4,
      glowHex: '#7be8ff',
    }));

    const customLandmarks: OverworldLandmark[] = [
      ...getOverworldMap('starlight-village').landmarks.map((lm) =>
        lm.kind === 'chest' ? { ...lm, activated: true } : lm,
      ),
      {
        id: 'test-shrine-active',
        kind: 'shrine',
        biomeId: 'starlight-village',
        tileX: 9,
        tileY: 5,
        widthTiles: 2,
        heightTiles: 2,
        label: 'Activated Shrine',
        elementalType: 'fairy',
        activated: true,
        emissiveHex: '#ff96d5',
        lightRadius: 180,
      },
      {
        id: 'test-chest-closed',
        kind: 'chest',
        biomeId: 'starlight-village',
        tileX: 8,
        tileY: 12,
        widthTiles: 1,
        heightTiles: 1,
        label: 'Closed Chest',
        activated: false,
        emissiveHex: '#ffd166',
        lightRadius: 120,
      },
      {
        id: 'test-dock',
        kind: 'dock',
        biomeId: 'starlight-village',
        tileX: 17,
        tileY: 16,
        widthTiles: 2,
        heightTiles: 2,
        label: 'Harbor Pier',
        emissiveHex: '#ffd479',
        lightRadius: 120,
      },
    ];

    const baseMap = getOverworldMap('starlight-village');
    const state = makeSceneState('starlight-village', {
      map: {
        ...baseMap,
        props: customProps,
        landmarks: customLandmarks,
      },
      activeWayfindingTarget: {
        x: 26,
        y: 18,
        label: 'Far Dock',
        kind: 'dock',
      },
    });

    const directions: Direction[] = ['down', 'up', 'left', 'right'];
    for (let i = 0; i < Math.max(STYLE_OUTFITS.length, STYLE_CAPES.length, STYLE_HEADGEAR.length, STYLE_AURAS.length); i++) {
      state.player.facing = directions[i % directions.length];
      state.player.moving = true;
      state.player.x += 0.5;
      state.player.walkCycle += 0.6;
      state.follower.facing = directions[(i + 1) % directions.length];
      state.follower.moving = true;
      state.follower.x += 0.45;
      state.player.style = {
        outfit: STYLE_OUTFITS[i % STYLE_OUTFITS.length].id,
        cape: STYLE_CAPES[i % STYLE_CAPES.length].id,
        headgear: STYLE_HEADGEAR[i % STYLE_HEADGEAR.length].id,
        aura: STYLE_AURAS[i % STYLE_AURAS.length].id,
        primaryAccent: '#ffd166',
        secondaryAccent: '#7be8ff',
      };
      state.reducedMotion = i % 2 === 1;
      state.elapsedSeconds += 0.1;

      renderer.update(state, 0.032);
      backend.beginFrame(state.elapsedSeconds, 0.032);
      renderer.render(backend, state);
      const stats = backend.endFrame();
      expect(stats.drawCalls).toBeGreaterThan(0);
    }

    // Verify footsteps spawned while moving across bridge/water/plaza/ground
    state.player.x = 13.5;
    state.player.y = 17.5; // bridge over water
    renderer.update(state, 0.032);
    state.player.y = 18.1;
    renderer.update(state, 0.032);
    backend.beginFrame(state.elapsedSeconds + 0.1, 0.032);
    renderer.render(backend, state);
    const finalStats = backend.endFrame();
    expect(finalStats.activeParticles).toBeGreaterThan(0);

    backend.dispose();
  });
});
