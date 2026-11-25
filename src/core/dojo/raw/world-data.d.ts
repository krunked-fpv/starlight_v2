/* eslint-disable @typescript-eslint/no-explicit-any */
export const TILE: Record<string, number>;
export const SOLID_TILES: Set<number>;
export const BIOMES: Record<string, {
  id: string;
  name: string;
  icon: string;
  levelRange: [number, number];
  encounters: Array<{ id: number; weight: number }>;
}>;
export const WORLD_ROWS: number;
export const WORLD_COLS: number;
export const WORLD_MAP: number[][];
export const SIGNPOSTS: Record<string, string>;
export const SHRINES: Record<string, {
  id: string;
  biome: string;
  name: string;
  guardianId: number;
  level: number;
  badgeId?: string;
  reward?: Record<string, any>;
  intro?: string;
  victory?: string;
}>;
export const CHESTS: Record<string, {
  id: string;
  biome?: string;
  label?: string;
  rewards?: Record<string, any>;
  message?: string;
}>;
export const NPCS: Record<string, {
  id: string;
  name: string;
  role?: string;
  biome?: string;
  palette?: { outfitPrimary?: string; outfitSecondary?: string; hair?: string; skin?: string; hat?: string };
  dialogue?: string[];
  lines?: string[];
  greeting?: string;
  questId?: string;
}>;
export const FIELD_QUESTS: Array<{
  id: string;
  npcId: string;
  title: string;
  description: string;
  rewards?: Record<string, any>;
  check?: (profile: any) => boolean;
  progress?: (profile: any) => string;
  progressText?: (profile: any) => string;
  introDialogue?: string[];
  reminderDialogue?: string[];
  completeDialogue?: string | string[];
}>;
export const RIVAL_TRAINERS: Record<string, {
  id: string;
  name: string;
  role?: string;
  biome: string;
  palette?: { outfitPrimary?: string; outfitSecondary?: string; hair?: string; skin?: string };
  party: Array<{ speciesId: number; level: number }>;
  rematchPool?: number[];
  rewards?: Record<string, any>;
  rematchRewards?: Record<string, any>;
  intro?: string;
  defeat?: string;
  rematchIntro?: string;
  winText?: string;
  rematchWinText?: string;
}>;
export const LANDMARKS: Record<string, {
  id: string;
  name: string;
  biome: string;
  icon?: string;
  description?: string;
}>;
export const SECRET_ARCADE_SPOT: { x: number; y: number; name?: string; [key: string]: any };
export function getBiomeAt(x: number, y: number): {
  id: string;
  name: string;
  icon: string;
  levelRange: [number, number];
  encounters: Array<{ id: number; weight: number }>;
};
export function isTileWalkableAt(x: number, y: number): boolean;
export function getTileDepthInfo(x: number, y: number): {
  depthTier: number;
  isRarePatch: boolean;
  biomeId: string;
};
export function findNearestSafePosition(x: number, y: number, dir?: string): { x: number; y: number; dir: string };
export function getBiomeDiscoveryStats(profile: any, biomeId?: string, speciesMap?: any): any;
export function getCompassGuidance(profile: any, speciesMap?: any): any;
export const FARMING_BIOME_ORDER: string[];
export const BIOME_WARP_POINTS: Record<string, { x: number; y: number; dir?: string }>;
export const BIOME_MINIMAP_PALETTE: Record<string, string>;
export function getBiomeWarpPoint(biomeId: string): { x: number; y: number; dir?: string };
export const BIOME_SCALING_OFFSETS: Record<string, number>;
export const TRAINER_XP_WEIGHTS: Record<string, number>;
export function getPlayerLevelXpRequired(level?: number): number;
export function getCumulativeXpForPlayerLevel(level?: number): number;
export function computeMilestoneTrainerXp(profile: any): number;
export function getPlayerLevelFromXp(xp?: number): any;
export function getPlayerProgression(profileOrLevel?: any): {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpToNext: number;
  progressPct: number;
  isMaxLevel: boolean;
};
export function getPlayerLevel(profileOrLevel?: any): number;
export function getSafeZoneWarpPoint(): { biomeId: string; biome: any; x: number; y: number; dir: string };
export function resolveFarmingBiomeForLevel(levelOrProfile: any, profileArg?: any, options?: any): {
  biomeId: string;
  biome: any;
  playerLevel: number;
  minLv: number;
  maxLv: number;
  threatLabel: string;
  threatTone: string;
  x: number;
  y: number;
  dir?: string;
};
