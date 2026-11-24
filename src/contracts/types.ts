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

export const BIOME_IDS = [
  'starlight-village',
  'meadow',
  'verdant-canopy',
  'ember-caldera',
  'sapphire-lagoon',
  'volt-highlands',
  'frost-glacier',
  'valor-dojo',
  'mire-bayou',
  'ochre-canyon',
  'zephyr-peaks',
  'astral-ruins',
  'amber-thicket',
  'basalt-quarry',
  'mist-hollow',
  'drake-summit',
  'eclipse-crag',
  'aegis-foundry',
  'starbloom-glade',
] as const;

export type BiomeId = (typeof BIOME_IDS)[number];

export type BodyArchetype =
  | 'quadruped'
  | 'biped'
  | 'avian'
  | 'serpentine'
  | 'aquatic'
  | 'crystalline'
  | 'ethereal'
  | 'insectoid'
  | 'draconic'
  | 'armored';

export type StatusCondition = 'none' | 'frost' | 'static' | 'burn' | 'sleep';
export type EncounterTier = 'wild' | 'rare' | 'rival' | 'shrine';
export type Direction = 'down' | 'up' | 'left' | 'right';
export type RendererMode = 'auto' | 'webgl2' | 'canvas2d';
export type ActiveScreen =
  | 'title'
  | 'overworld'
  | 'battle'
  | 'pokedex'
  | 'badges'
  | 'style-studio'
  | 'skyhop'
  | 'briefing';

export type AuraId = 'none' | 'starlight' | 'sky-thunder' | 'aurora' | 'ember-crown';
export type OutfitId = 'voyager' | 'astral-robe' | 'ranger-coat' | 'solstice-tunic' | 'aegis-jacket';
export type CapeId = 'none' | 'starweave' | 'zephyr-mantle' | 'cinder-cloak' | 'prism-shawl';
export type HeadgearId = 'none' | 'star-beret' | 'sky-goggles' | 'lunar-circlet' | 'shrine-visor';

export interface TypeVisualPalette {
  primary: string;
  secondary: string;
  glow: string;
  dark: string;
  rgb: [number, number, number];
}

export interface MoveRecord {
  id: string;
  name: string;
  type: ElementalType;
  power: number;
  accuracy: number;
  category: 'physical' | 'special' | 'status';
  composureShift: number;
  statusEffect?: StatusCondition;
  statusChance?: number;
  description: string;
}

export interface SpeciesRecord {
  id: number; // 1..1025
  name: string;
  primaryType: ElementalType;
  secondaryType: ElementalType | null;
  archetype: BodyArchetype;
  generation: number;
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  baseSpd: number;
  habitat: BiomeId;
  evolvesTo?: number;
  evolveLevel?: number;
  signatureMoves: string[];
  cryBaseHz: number;
  cryModHz: number;
  cryShape: 'sine' | 'triangle' | 'sawtooth' | 'square';
  lore: string;
  palette: [string, string, string];
}

export interface PartyMember {
  uid: string;
  speciesId: number;
  nickname?: string;
  level: number;
  xp: number;
  xpToNext: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  composure: number; // 0..100
  maxComposure: number;
  status: StatusCondition;
  bond: number; // 0..100
  starRank: number; // 0..5
  shiny: boolean;
  moves: string[];
}

export interface PokedexEntryState {
  seen: boolean;
  caught: boolean;
  starRank: number; // 0..5
  bond: number; // 0..100
  shiny?: boolean;
  timesEncountered: number;
}

export interface BadgeDefinition {
  id: string;
  index: number; // 1..28
  name: string;
  category: 'elemental' | 'mastery';
  type: ElementalType;
  biomeId: BiomeId;
  material: 'gold' | 'silver' | 'prism' | 'obsidian' | 'astral';
  primaryColor: string;
  accentColor: string;
  requirement: string;
  iconId: string;
}

export interface InventoryState {
  pokeBalls: number;
  starBalls: number;
  potions: number;
  superPotions: number;
  starShards: number;
}

export interface StyleLoadout {
  outfit: OutfitId;
  cape: CapeId;
  headgear: HeadgearId;
  aura: AuraId;
  primaryAccent: string;
  secondaryAccent: string;
}

export interface StyleUnlocks {
  outfits: OutfitId[];
  capes: CapeId[];
  headgear: HeadgearId[];
  auras: AuraId[];
}

export interface TrainerProfile {
  slotId: 'slot0' | 'slot1';
  name: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  playtimeSeconds: number;
  biomeId: BiomeId;
  x: number;
  y: number;
  facing: Direction;
  party: PartyMember[];
  pokedex: Record<number, PokedexEntryState>;
  badges: string[]; // unlocked BadgeDefinition.id list
  openedChests: string[];
  clearedShrines: string[];
  inventory: InventoryState;
  style: StyleLoadout;
  unlocks: StyleUnlocks;
  skyHopHighScore: number;
  skyHopBestCombo: number;
  rivalsDefeated: number;
}

export interface GameSettings {
  reducedMotion: boolean;
  crtMode: boolean;
  rendererOverride: RendererMode;
  audioMuted: boolean;
  masterVolume: number; // 0..1
  showTouchControls: boolean;
}

export interface StarlightSaveState {
  schemaVersion: 2;
  activeSlot: 'slot0' | 'slot1';
  profiles: {
    slot0: TrainerProfile;
    slot1: TrainerProfile;
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
  source: 'v2-local' | 'v2-idb' | 'v1-migrated' | 'fresh-default';
  warnings: string[];
}
