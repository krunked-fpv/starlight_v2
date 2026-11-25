import type {
  BiomeId,
  BodyArchetype,
  DojoAbilityEntry,
  DojoBadgeEntry,
  DojoEvolutionItem,
  DojoEvolutionRule,
  DojoMoveEntry,
  DojoProfileState,
  DojoSpeciesEntry,
  ElementalType,
  IconId,
  ResolvedTrainerLook,
  TrainerAccessoryId,
  TrainerAuraId,
  TrainerId,
  TrainerStyleId,
} from '../../contracts';
import {
  ABILITIES,
  BADGES,
  BIOMES,
  CHESTS,
  ENCOUNTER_TRAITS,
  EVOLUTION_ITEMS,
  EVOLUTIONS,
  FIELD_QUESTS,
  GAME_META,
  LANDMARKS,
  MOVES,
  NPCS,
  RIVAL_TRAINERS,
  SECRET_ARCADE_SPOT,
  SHRINES,
  SIGNPOSTS,
  SOLID_TILES,
  SPECIES,
  STARTER_IDS,
  TILE,
  TRAINERS,
  TRAINER_ACCESSORIES,
  TRAINER_AURAS,
  TRAINER_STYLES,
  TYPE_CHART,
  TYPES,
  WORLD_COLS,
  WORLD_MAP,
  WORLD_ROWS,
  formatGameText,
  resolveTrainerDisplayName,
  resolveTrainerLook,
} from './raw/config.js';
import { resolveSpeciesArchetype } from './raw/pokemon.js';
import { emojiToIconId, stripEmojis, typeToIconId } from './emojiSanitizer';

export {
  BIOMES,
  CHESTS,
  ENCOUNTER_TRAITS,
  EVOLUTIONS,
  FIELD_QUESTS,
  GAME_META,
  LANDMARKS,
  NPCS,
  RIVAL_TRAINERS,
  SECRET_ARCADE_SPOT,
  SHRINES,
  SIGNPOSTS,
  SOLID_TILES,
  STARTER_IDS,
  TILE,
  TRAINERS,
  TYPE_CHART,
  TYPES,
  WORLD_COLS,
  WORLD_MAP,
  WORLD_ROWS,
};

export const TOTAL_SPECIES_COUNT = 1025;

export function getGenerationForSpeciesId(id: number): number {
  if (id <= 151) return 1;
  if (id <= 251) return 2;
  if (id <= 386) return 3;
  if (id <= 493) return 4;
  if (id <= 649) return 5;
  if (id <= 721) return 6;
  if (id <= 809) return 7;
  if (id <= 905) return 8;
  return 9;
}

const SANITIZED_SPECIES_CACHE = new Map<number, DojoSpeciesEntry>();

export function getSpeciesEntry(id: number): DojoSpeciesEntry {
  const safeId = Math.max(1, Math.min(TOTAL_SPECIES_COUNT, Math.round(id)));
  const cached = SANITIZED_SPECIES_CACHE.get(safeId);
  if (cached) return cached;
  const raw = SPECIES[safeId] ?? SPECIES[25];
  const entry: DojoSpeciesEntry = {
    id: raw.id,
    name: stripEmojis(raw.name),
    type: (raw.type || 'normal') as ElementalType,
    biome: (raw.biome || 'forest') as BiomeId,
    color: raw.color || '#38bdf8',
    catchFactor: Number.isFinite(raw.catchFactor) ? raw.catchFactor : 0.78,
    ability: raw.ability,
    baseStats: { ...raw.baseStats },
    movePool: [...(raw.movePool || ['tackle'])],
    description: stripEmojis(raw.flavor || raw.description || `${raw.name} of Starlight Island.`),
    generation: getGenerationForSpeciesId(raw.id),
    archetype: (resolveSpeciesArchetype(raw.id) as BodyArchetype) || 'biped',
  };
  SANITIZED_SPECIES_CACHE.set(safeId, entry);
  return entry;
}

export function getAllSpecies(): DojoSpeciesEntry[] {
  const list: DojoSpeciesEntry[] = [];
  for (let id = 1; id <= TOTAL_SPECIES_COUNT; id++) {
    list.push(getSpeciesEntry(id));
  }
  return list;
}

export function getMoveEntry(moveId: string): DojoMoveEntry {
  const raw = MOVES[moveId] ?? MOVES.tackle;
  return {
    id: raw.id,
    name: stripEmojis(raw.name),
    type: (raw.type || 'normal') as ElementalType,
    power: Number(raw.power) || 0,
    accuracy: Number(raw.accuracy) || 100,
    pp: Number(raw.pp) || 20,
    damageClass: raw.damageClass || 'physical',
    category: raw.category || 'attack',
    buffStat: raw.buffStat,
    buffStages: raw.buffStages,
    grantShield: Boolean(raw.grantShield),
    fx: raw.fx || 'impact',
  };
}

export function getAllMoves(): DojoMoveEntry[] {
  return Object.keys(MOVES).map((id) => getMoveEntry(id));
}

export function getAbilityEntry(abilityId: string | null | undefined): DojoAbilityEntry | null {
  if (!abilityId || !ABILITIES[abilityId]) return null;
  const raw = ABILITIES[abilityId];
  return {
    id: raw.id,
    name: stripEmojis(raw.name),
    type: (raw.type || 'normal') as ElementalType,
    trigger: raw.trigger,
    stat: raw.stat,
    stages: raw.stages,
    grantShield: Boolean(raw.grantShield),
    shieldTurns: raw.shieldTurns,
    boostStat: raw.boostStat,
    boostStages: raw.boostStages,
    description: stripEmojis(raw.description),
  };
}

export function getAllAbilities(): DojoAbilityEntry[] {
  return Object.keys(ABILITIES)
    .map((id) => getAbilityEntry(id))
    .filter((a): a is DojoAbilityEntry => Boolean(a));
}

export function getAllBadges(): DojoBadgeEntry[] {
  return BADGES.map((raw, idx) => ({
    id: raw.id,
    index: idx + 1,
    name: stripEmojis(raw.name),
    type: (raw.type || 'normal') as ElementalType,
    description: stripEmojis(raw.description),
    iconId: emojiToIconId(raw.icon, typeToIconId(raw.type)),
    check(profile: DojoProfileState): boolean {
      return Boolean(raw.check(profile));
    },
  }));
}

export function getAllEvolutionItems(): DojoEvolutionItem[] {
  return Object.values(EVOLUTION_ITEMS).map((raw) => ({
    id: raw.id,
    name: stripEmojis(raw.name),
    color: raw.color,
    description: stripEmojis(raw.description),
  }));
}

export function getEvolutionRules(speciesId: number): DojoEvolutionRule[] {
  const rules = EVOLUTIONS[speciesId];
  return Array.isArray(rules) ? rules.map((r) => ({ ...r })) : [];
}

export interface SanitizedStyleOption {
  id: TrainerStyleId;
  name: string;
  iconId: IconId;
  outfitPrimary: string;
  outfitSecondary: string;
  accent: string;
  accentDark: string;
}

export function getAllTrainerStyles(): SanitizedStyleOption[] {
  return Object.values(TRAINER_STYLES).map((raw) => ({
    id: raw.id as TrainerStyleId,
    name: stripEmojis(raw.name),
    iconId: emojiToIconId(raw.icon, 'icon-style'),
    outfitPrimary: raw.outfitPrimary,
    outfitSecondary: raw.outfitSecondary,
    accent: raw.accent,
    accentDark: raw.accentDark,
  }));
}

export interface SanitizedAccessoryOption {
  id: TrainerAccessoryId;
  name: string;
  iconId: IconId;
}

export function getAllTrainerAccessories(): SanitizedAccessoryOption[] {
  return Object.values(TRAINER_ACCESSORIES).map((raw) => ({
    id: raw.id as TrainerAccessoryId,
    name: stripEmojis(raw.name),
    iconId: emojiToIconId(raw.icon, 'icon-hat'),
  }));
}

export interface SanitizedAuraOption {
  id: TrainerAuraId;
  name: string;
  iconId: IconId;
  color: string;
}

export function getAllTrainerAuras(): SanitizedAuraOption[] {
  return Object.values(TRAINER_AURAS).map((raw) => ({
    id: raw.id as TrainerAuraId,
    name: stripEmojis(raw.name),
    iconId: emojiToIconId(raw.icon, 'icon-aura'),
    color: raw.color,
  }));
}

export function getResolvedTrainerLook(
  trainerId: TrainerId,
  appearance?: DojoProfileState['appearance'] | null,
): ResolvedTrainerLook {
  const raw = resolveTrainerLook(trainerId, appearance || undefined);
  return {
    id: (raw.id === 'ozias' ? 'ozias' : 'violet') as TrainerId,
    name: stripEmojis(raw.name),
    styleId: raw.styleId as TrainerStyleId,
    outfitPrimary: raw.outfitPrimary,
    outfitSecondary: raw.outfitSecondary,
    accent: raw.accent,
    accentDark: raw.accentDark,
    accentSoft: raw.accentSoft,
    hair: raw.hair,
    skin: raw.skin,
    accessory: raw.accessory as TrainerAccessoryId,
    cape: Boolean(raw.cape),
    aura: raw.aura as TrainerAuraId,
    tagline: stripEmojis(raw.tagline),
  };
}

export function formatCleanGameText(template: string, context?: Record<string, unknown>): string {
  return stripEmojis(formatGameText(template, context));
}

export function getCleanTrainerName(profile: DojoProfileState | null, fallbackId?: TrainerId | null): string {
  return stripEmojis(resolveTrainerDisplayName(profile, fallbackId ?? null));
}

export function getSanitizedTraitLabel(traitId: string | null | undefined): {
  label: string;
  iconId: IconId;
} | null {
  if (!traitId || !ENCOUNTER_TRAITS[traitId]) return null;
  const raw = ENCOUNTER_TRAITS[traitId];
  return {
    label: stripEmojis(raw.label),
    iconId: emojiToIconId(raw.icon, 'icon-sparkle'),
  };
}
