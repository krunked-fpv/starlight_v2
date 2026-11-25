export const ELEMENTAL_TYPES = [
  'normal',
  'grass',
  'fire',
  'water',
  'electric',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
] as const;

export type ElementalType = (typeof ELEMENTAL_TYPES)[number];

/** Canonical 18 Starlight Island biomes matching C:\dojo WORLD_MAP */
export const BIOME_IDS = [
  'village',
  'forest',
  'cave',
  'water',
  'volcano',
  'peak',
  'grove',
  'desert',
  'marsh',
  'sanctum',
  'canyon',
  'reef',
  'ruins',
  'rift',
  'faeveldt',
  'atoll',
  'highlands',
  'crater',
] as const;

export type BiomeId = (typeof BIOME_IDS)[number];
export type DojoBiomeId = BiomeId;

export type TrainerId = 'violet' | 'ozias';
export type Direction = 'down' | 'up' | 'left' | 'right';
export type RendererMode = 'auto' | 'webgl2' | 'canvas2d';
export type BattlePace = 'cinema' | 'classic' | 'fast';
export type TouchPadMode = 'auto' | 'show' | 'hide';

export type ActiveScreen =
  | 'title'
  | 'starter'
  | 'overworld'
  | 'battle'
  | 'pokedex'
  | 'badges'
  | 'style-studio'
  | 'skyhop'
  | 'briefing'
  | 'settings';

export type DrawerTab = 'pokedex' | 'team' | 'badges' | 'guide' | 'style';

export type EncounterTier = 'wild' | 'rare' | 'rival' | 'shrine' | 'shrine-trial';
export type EncounterTraitId = 'curious' | 'treasure' | 'spirited' | 'apex';
export type ReadinessTier = 'favored' | 'balanced' | 'challenging' | 'danger';
export type BallKind = 'poke' | 'great' | 'star';

export const TRAINER_STYLE_IDS = [
  'default',
  'royal',
  'aurora',
  'ember',
  'ranger',
  'nebula',
  'solstice',
  'twilight',
  'celestial',
  'sakura',
] as const;
export type TrainerStyleId = (typeof TRAINER_STYLE_IDS)[number];

export const TRAINER_ACCESSORY_IDS = [
  'cap',
  'crown',
  'wizard',
  'headband',
  'goggles',
  'halo',
  'visor',
  'antlers',
] as const;
export type TrainerAccessoryId = (typeof TRAINER_ACCESSORY_IDS)[number];

export const TRAINER_AURA_IDS = [
  'none',
  'stars',
  'hearts',
  'lightning',
  'blossom',
  'cosmic',
] as const;
export type TrainerAuraId = (typeof TRAINER_AURA_IDS)[number];

export type BodyArchetype =
  | 'biped'
  | 'quadruped'
  | 'winged'
  | 'serpentine'
  | 'aquatic'
  | 'insectoid'
  | 'draconic'
  | 'construct'
  | 'amorphous'
  | 'flora'
  | 'crystalline';

export interface TypeVisualPalette {
  primary: string;
  secondary: string;
  glow: string;
  dark: string;
  rgb: [number, number, number];
}

export interface DecodedSpriteFrame {
  canvas: HTMLCanvasElement;
  delayMs: number;
}

export interface DecodedSpriteFrames {
  key: string;
  speciesId: number;
  back: boolean;
  shiny: boolean;
  width: number;
  height: number;
  frames: DecodedSpriteFrame[];
  totalDurationMs: number;
  sourceKind: 'animated-gif' | 'static-png' | 'offline-pixel';
  archetype: BodyArchetype;
  mirrorX?: boolean;
}

export interface DojoMoveEntry {
  id: string;
  name: string;
  type: ElementalType;
  power: number;
  accuracy: number;
  pp: number;
  damageClass: 'physical' | 'special' | 'status';
  category: 'attack' | 'heal' | 'buff' | 'shield';
  buffStat?: 'atk' | 'def' | 'spd';
  buffStages?: number;
  grantShield?: boolean;
  fx: string;
}

export interface DojoAbilityEntry {
  id: string;
  name: string;
  type: ElementalType;
  trigger: 'entry' | 'attack' | 'defense' | 'turn_end';
  stat?: 'atk' | 'def' | 'spd';
  stages?: number;
  grantShield?: boolean;
  shieldTurns?: number;
  boostStat?: 'atk' | 'def' | 'spd';
  boostStages?: number;
  description: string;
}

export interface DojoSpeciesEntry {
  id: number;
  name: string;
  type: ElementalType;
  biome: BiomeId;
  color: string;
  catchFactor: number;
  ability?: string;
  baseStats: { hp: number; atk: number; def: number; spd: number };
  movePool: string[];
  description: string;
  generation: number;
  archetype: BodyArchetype;
}

export interface DojoEvolutionRule {
  to: number;
  minLevel?: number;
  item?: string;
}

export interface DojoEvolutionItem {
  id: string;
  name: string;
  color: string;
  description: string;
}

export interface DojoBadgeEntry {
  id: string;
  index: number;
  name: string;
  type: ElementalType;
  description: string;
  iconId: string;
  check(profile: DojoProfileState): boolean;
}

export interface TrainerAppearance {
  styleId: TrainerStyleId;
  accessory: TrainerAccessoryId;
  cape: boolean;
  aura: TrainerAuraId;
  nickname?: string;
}

export interface ResolvedTrainerLook {
  id: TrainerId;
  name: string;
  styleId: TrainerStyleId;
  outfitPrimary: string;
  outfitSecondary: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  hair: string;
  skin: string;
  accessory: TrainerAccessoryId;
  cape: boolean;
  aura: TrainerAuraId;
  tagline: string;
}

export interface DojoPokemonJSON {
  uid: string;
  speciesId: number;
  level: number;
  xp: number;
  hp: number;
  maxHp?: number;
  atk?: number;
  def?: number;
  spd?: number;
  xpToNext?: number;
  caughtBiome: string;
  isShiny: boolean;
  nickname: string | null;
  bond: number;
  upgradeTier: number;
  isElite: boolean;
  encounterTrait: EncounterTraitId | null;
  abilityId: string | null;
  movePp: Record<string, number>;
}

export interface DojoBagState {
  potions: number;
  greatBalls: number;
  starBalls: number;
  starShards: number;
  cheerCharges: number;
  gems: Record<string, number>;
}

export interface DojoArcadeState {
  unlocked: boolean;
  charges: number;
  stepProgress: number;
  battleProgress: number;
  gemCooldown: number;
  highScore: number;
  plays: number;
  bestWave: number;
  secretKnocks: number;
}

export interface DojoProfileStats {
  battlesWon: number;
  totalCaught: number;
  steps: number;
  evolutions: number;
  shiniesFound: number;
  upgrades: number;
  cheers: number;
}

export interface DojoProfileState {
  trainerId: TrainerId;
  starterId: number | null;
  trainerXp: number;
  playerLevel: number;
  pos: { x: number; y: number; dir: Direction };
  appearance: TrainerAppearance;
  team: DojoPokemonJSON[];
  box: DojoPokemonJSON[];
  pokedex: {
    seen: number[];
    caught: Record<number, number>;
  };
  badges: string[];
  shrinesCleared: string[];
  chestsOpened: string[];
  questsCompleted: string[];
  npcsTalked: string[];
  biomesVisited: string[];
  rivalsDefeated: string[];
  rivalRematchCounts: Record<string, number>;
  shrineTrialCounts: Record<string, number>;
  recentEncounters: number[];
  recentWarpBiomes: string[];
  cheerStepProgress: number;
  arcade: DojoArcadeState;
  bag: DojoBagState;
  stats: DojoProfileStats;
}

export interface GameSettings {
  reducedMotion: boolean;
  crtMode: boolean;
  rendererOverride: RendererMode;
  audioMuted: boolean;
  masterVolume: number;
  showTouchPad: TouchPadMode;
  battlePace: BattlePace;
}

export interface StarlightSaveState {
  schemaVersion: 3;
  activeTrainerId: TrainerId | null;
  profiles: {
    violet: DojoProfileState;
    ozias: DojoProfileState;
  };
  settings: GameSettings;
  migratedFromV1?: {
    sourceKey: string;
    migratedAt: number;
    preservedLegacyKeys: string[];
  };
}

export interface SaveHydrationResult {
  state: StarlightSaveState;
  source:
    | 'v3-local'
    | 'v3-idb'
    | 'dojo-v1-migrated'
    | 'v2-migrated'
    | 'legacy-v1-migrated'
    | 'fresh-default';
  warnings: string[];
}
