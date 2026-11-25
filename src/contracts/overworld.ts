import type {
  BiomeId,
  DecodedSpriteFrames,
  Direction,
  ElementalType,
  ReadinessTier,
  ResolvedTrainerLook,
  TrainerId,
} from './types';
import type { AtlasManifest, IRenderBackend } from './render';

export interface OverworldShrineNode {
  id: string;
  biomeId: BiomeId;
  x: number;
  y: number;
  name: string;
  guardianId: number;
  guardianName: string;
  elementalType: ElementalType;
  level: number;
  cleared: boolean;
  readinessTier: ReadinessTier;
}

export interface OverworldChestNode {
  id: string;
  biomeId: BiomeId;
  x: number;
  y: number;
  label: string;
  opened: boolean;
}

export interface OverworldNpcNode {
  id: string;
  x: number;
  y: number;
  name: string;
  role: 'professor' | 'villager' | 'quest' | 'guide';
  accentHex: string;
  talked: boolean;
  hasAvailableQuest: boolean;
  questCompleted: boolean;
}

export interface OverworldRivalNode {
  id: string;
  biomeId: BiomeId;
  x: number;
  y: number;
  name: string;
  title: string;
  accentHex: string;
  defeated: boolean;
  rematchCount: number;
  readinessTier: ReadinessTier;
}

export interface OverworldLandmarkNode {
  id: string;
  biomeId: BiomeId;
  x: number;
  y: number;
  name: string;
  kind: 'cottage' | 'lab' | 'observatory' | 'obelisk' | 'fountain' | 'shrine-arch' | 'monument';
  accentHex: string;
}

export interface OverworldSignpostNode {
  id: string;
  x: number;
  y: number;
  title: string;
  text: string;
}

export interface OverworldDiscoveryNode {
  id: string;
  x: number;
  y: number;
  kind: 'starShard' | 'potion' | 'greatBall' | 'berry';
  biomeId: BiomeId;
  accentHex: string;
  spawnedAt: number;
}

export interface OverworldInteractable {
  kind: 'npc' | 'shrine' | 'chest' | 'rival' | 'signpost' | 'fountain' | 'discovery' | 'secret-arcade' | 'landmark';
  id: string;
  x: number;
  y: number;
  label: string;
  actionVerb: string;
}

export interface OverworldPlayerState {
  trainerId: TrainerId;
  displayName: string;
  x: number; // float tile coords in 0..99
  y: number; // float tile coords in 0..83
  tileX: number;
  tileY: number;
  facing: Direction;
  moving: boolean;
  walkCycle: number;
  look: ResolvedTrainerLook;
}

export interface OverworldFollowerState {
  speciesId: number;
  name: string;
  type: ElementalType;
  isShiny: boolean;
  x: number;
  y: number;
  facing: Direction;
  moving: boolean;
  walkCycle: number;
  frames: DecodedSpriteFrames | null;
}

export interface GrassDisplacement {
  tileX: number;
  tileY: number;
  bendX: number;
  bendY: number;
  intensity: number;
}

export interface FootstepEffect {
  x: number;
  y: number;
  kind: 'dust' | 'ripple' | 'sparkle' | 'petal';
  age: number;
  maxAge: number;
  colorHex: string;
}

export interface CompassTarget {
  x: number;
  y: number;
  label: string;
  biomeId: BiomeId;
  kind: 'shrine' | 'quest' | 'rival' | 'chest' | 'fountain' | 'explore';
  distanceTiles: number;
  angleRad: number;
}

export interface OverworldSceneState {
  cols: number; // 100
  rows: number; // 84
  tileSize: number; // 32
  worldMap: number[][]; // 84 x 100 TILE IDs (0..60)
  currentBiomeId: BiomeId;
  currentBiomeName: string;
  biomeBannerTimer: number;
  player: OverworldPlayerState;
  follower: OverworldFollowerState | null;
  shrines: OverworldShrineNode[];
  chests: OverworldChestNode[];
  npcs: OverworldNpcNode[];
  rivals: OverworldRivalNode[];
  landmarks: OverworldLandmarkNode[];
  signposts: OverworldSignpostNode[];
  discoveryNodes: OverworldDiscoveryNode[];
  bfsPath: Array<{ x: number; y: number }>;
  secretArcadeSpot: { x: number; y: number; unlocked: boolean; knocks: number };
  nearbyInteraction: OverworldInteractable | null;
  compassTarget: CompassTarget | null;
  timeOfDay: number;
  elapsedSeconds: number;
  reducedMotion: boolean;
  stepsTotal: number;
}

export interface IOverworldRenderer {
  attachAtlas(manifest: AtlasManifest | null): void;
  update(state: OverworldSceneState, dtSeconds: number): void;
  render(backend: IRenderBackend, state: OverworldSceneState): void;
  getDisplacementCount(): number;
  resetEffects(): void;
}
