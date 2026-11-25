/* eslint-disable @typescript-eslint/no-explicit-any */
export * from './world-data.js';
export const GAME_META: {
  title: string;
  subtitle: string;
  version: string;
  tileSize: number;
  viewportCols: number;
  viewportRows: number;
  spawn: { x: number; y: number; dir: string };
};
export const TRAINERS: Record<string, any>;
export const TRAINER_STYLES: Record<string, any>;
export const TRAINER_ACCESSORIES: Record<string, any>;
export const TRAINER_AURAS: Record<string, any>;
export function resolveTrainerLook(trainerId: string, appearance?: any): any;
export function normalizeTrainerNickname(raw: any): string | null;
export function resolveTrainerDisplayName(profileOrContext?: any, fallbackTrainerId?: string | null): string;
export function formatGameText(template: any, context?: any): string;
export const TYPES: Record<string, { id: string; label: string; color: string; bg: string; icon: string }>;
export const TYPE_CHART: Record<string, Record<string, number>>;
export const MOVES: Record<string, any>;
export const EVOLUTION_ITEMS: Record<string, { id: string; name: string; icon: string; color: string; description: string }>;
export const ABILITIES: Record<string, any>;
export const STARTER_IDS: number[];
export const SPECIES: Record<number, {
  id: number;
  name: string;
  type: string;
  biome: string;
  color: string;
  catchFactor: number;
  ability?: string;
  baseStats: { hp: number; atk: number; def: number; spd: number };
  movePool: string[];
  flavor?: string;
  description?: string;
}>;
export const EVOLUTIONS: Record<number, Array<{ to: number; minLevel?: number; item?: string }>>;
export function getSpriteUrls(id: number, back?: boolean, shiny?: boolean): {
  animated: string;
  static: string;
  fallbacks: string[];
};
export const BADGES: Array<{
  id: string;
  name: string;
  type: string;
  icon: string;
  description: string;
  check(profile: any): boolean;
}>;
export const ENCOUNTER_TRAITS: Record<string, {
  id: string;
  label: string;
  icon: string;
  badgeText: string;
  catchMult: number;
  bondBonus: number;
  xpMult: number;
  shardBonus: number;
  dmgMult: number;
}>;
