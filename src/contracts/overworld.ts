import type {
  BiomeId,
  Direction,
  ElementalType,
  StyleLoadout,
} from './types';
import type { IRenderBackend, AtlasManifest } from './render';

export type OverworldTileKind =
  | 'deep-water'
  | 'shallow-water'
  | 'sand'
  | 'ground'
  | 'tall-grass'
  | 'cobble'
  | 'cliff'
  | 'bridge'
  | 'plaza'
  | 'flowerbed';

export type OverworldLandmarkKind =
  | 'cottage'
  | 'shrine'
  | 'chest'
  | 'fountain'
  | 'signpost'
  | 'starfall'
  | 'studio'
  | 'observatory'
  | 'dock';

export interface OverworldLandmark {
  id: string;
  kind: OverworldLandmarkKind;
  biomeId: BiomeId;
  tileX: number;
  tileY: number;
  widthTiles: number;
  heightTiles: number;
  label: string;
  subtitle?: string;
  elementalType?: ElementalType;
  activated?: boolean;
  emissiveHex: string;
  lightRadius: number;
}

export interface OverworldProp {
  id: string;
  biomeId: BiomeId;
  kind:
    | 'crystal'
    | 'ember-vent'
    | 'spore-lantern'
    | 'coral'
    | 'ruin-pillar'
    | 'bamboo'
    | 'pine'
    | 'blossom-tree'
    | 'lantern-post'
    | 'boulder'
    | 'cloud-stone'
    | 'gear-spire';
  tileX: number;
  tileY: number;
  scale: number;
  swayPhase: number;
  glowHex?: string;
}

export interface OverworldActor {
  id: string;
  role: 'player' | 'follower' | 'npc' | 'rival';
  name: string;
  x: number; // world tile coordinates (float)
  y: number;
  facing: Direction;
  moving: boolean;
  walkCycle: number;
  speciesId?: number;
  primaryType?: ElementalType;
  style?: StyleLoadout;
  accentHex?: string;
  dialoguePrompt?: string;
}

export interface GrassDisplacement {
  tileX: number;
  tileY: number;
  bendX: number;
  bendY: number;
  intensity: number; // 0..1 decays smoothly
}

export interface FootstepEffect {
  x: number;
  y: number;
  kind: 'dust' | 'ripple' | 'sparkle' | 'petal';
  age: number;
  maxAge: number;
  colorHex: string;
}

export interface OverworldBiomeDescriptor {
  id: BiomeId;
  name: string;
  subtitle: string;
  elementalType: ElementalType;
  gridCol: number;
  gridRow: number;
  guardianSpeciesId: number;
  guardianName: string;
  wildSpeciesIds: number[];
  groundHex: string;
  grassHex: string;
  waterShallowHex: string;
  waterDeepHex: string;
  cliffHex: string;
  accentHex: string;
  propKind: OverworldProp['kind'];
  ambientTag: string;
}

export interface OverworldMapData {
  biomeId: BiomeId;
  width: number;
  height: number;
  tileSize: number;
  tiles: OverworldTileKind[]; // row-major width * height
  autotileMasks: Uint8Array; // 47-tile blob bitmask index per tile
  landmarks: OverworldLandmark[];
  props: OverworldProp[];
  spawnX: number;
  spawnY: number;
  neighbors: Partial<Record<Direction, BiomeId>>;
}

export interface OverworldSceneState {
  biome: OverworldBiomeDescriptor;
  map: OverworldMapData;
  player: OverworldActor;
  follower: OverworldActor;
  npcs: OverworldActor[];
  timeOfDay: number; // 0..1 (0.5 noon, 0.8 twilight starlight)
  elapsedSeconds: number;
  reducedMotion: boolean;
  activeWayfindingTarget: {
    x: number;
    y: number;
    label: string;
    kind: OverworldLandmarkKind;
  } | null;
  nearbyInteraction: OverworldLandmark | OverworldActor | null;
}

export interface IOverworldRenderer {
  attachAtlas(manifest: AtlasManifest | null): void;
  update(state: OverworldSceneState, dtSeconds: number): void;
  render(backend: IRenderBackend, state: OverworldSceneState): void;
  getDisplacementCount(): number;
  resetEffects(): void;
}
