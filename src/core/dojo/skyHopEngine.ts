import type { ElementalType, SkyHopEntity, SkyHopParticle, SkyHopState } from '../../contracts';
import { EVOLUTION_ITEMS, TYPES } from './raw/config.js';
import { ARCADE_SHARD_BUYIN_COST, MAX_ARCADE_CHARGES } from './raw/storage.js';
import type { StarlightStorageBridge } from '../save/saveHydrator';
import type { SpriteAssetLoader } from './spriteLoader';
import { getSpeciesEntry } from './catalog';
import { stripEmojis } from './emojiSanitizer';

export const SKYHOP_LOGICAL_W = 760;
export const SKYHOP_LOGICAL_H = 420;
export const SKYHOP_PLAYER_X = 132;
export const MIN_ARCADE_REWARD_SCORE = 80;
export const MAX_ARCADE_SHARDS = 4;
const MAX_HEARTS = 3;

const BASE_GEM_POOL = ['leaf_gem', 'fire_gem', 'water_gem', 'thunder_gem', 'moon_gem', 'sun_gem'];
const MID_GEM_POOL = ['ice_gem', 'dusk_gem', 'astral_gem'];
const ENDGAME_GEM_POOL = ['prism_gem', 'chrono_gem', 'nebula_gem', 'pixie_gem', 'alola_gem', 'crown_gem', 'tera_gem'];

export function getUnlockedArcadeGemPool(badgeCount: number): string[] {
  const pool = [...BASE_GEM_POOL];
  if (badgeCount >= 3) pool.push(...MID_GEM_POOL);
  if (badgeCount >= 8) pool.push(...ENDGAME_GEM_POOL);
  return pool.filter((id) => Boolean(EVOLUTION_ITEMS[id]));
}

export interface SkyHopWaveSpec {
  id: string;
  name: string;
  items: Array<{ delay: number; kind: SkyHopEntity['kind']; yFrac: number; speedMult?: number }>;
}

export const SKYHOP_WAVE_TEMPLATES: SkyHopWaveSpec[] = [
  {
    id: 'rising_arc',
    name: 'Rising Starlight Arc',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.78 },
      { delay: 0.25, kind: 'cloud', yFrac: 0.5 },
      { delay: 0.35, kind: 'star', yFrac: 0.66 },
      { delay: 0.7, kind: 'star', yFrac: 0.54 },
      { delay: 0.78, kind: 'cloud', yFrac: 0.32 },
      { delay: 1.05, kind: 'bigstar', yFrac: 0.42 },
      { delay: 1.25, kind: 'storm_orb', yFrac: 0.56 },
      { delay: 1.4, kind: 'star', yFrac: 0.3 },
      { delay: 1.75, kind: 'star', yFrac: 0.2 },
      { delay: 1.75, kind: 'cloud', yFrac: 0.76 },
    ],
  },
  {
    id: 'falling_cascade',
    name: 'Starfall Cascade',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.2 },
      { delay: 0.28, kind: 'cloud', yFrac: 0.48 },
      { delay: 0.35, kind: 'star', yFrac: 0.32 },
      { delay: 0.7, kind: 'star', yFrac: 0.46 },
      { delay: 0.85, kind: 'cloud', yFrac: 0.22 },
      { delay: 1.05, kind: 'bigstar', yFrac: 0.6 },
      { delay: 1.22, kind: 'storm_orb', yFrac: 0.46 },
      { delay: 1.4, kind: 'star', yFrac: 0.74 },
      { delay: 1.75, kind: 'star', yFrac: 0.82 },
      { delay: 1.82, kind: 'cloud', yFrac: 0.56 },
    ],
  },
  {
    id: 'sine_ribbon',
    name: 'Celestial Ribbon',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.5 },
      { delay: 0.32, kind: 'star', yFrac: 0.34 },
      { delay: 0.42, kind: 'cloud', yFrac: 0.54 },
      { delay: 0.64, kind: 'star', yFrac: 0.24 },
      { delay: 0.85, kind: 'cloud', yFrac: 0.78 },
      { delay: 0.96, kind: 'star', yFrac: 0.36 },
      { delay: 1.15, kind: 'storm_orb', yFrac: 0.5 },
      { delay: 1.28, kind: 'star', yFrac: 0.56 },
      { delay: 1.6, kind: 'bigstar', yFrac: 0.72 },
      { delay: 1.85, kind: 'cloud', yFrac: 0.22 },
      { delay: 1.92, kind: 'star', yFrac: 0.56 },
    ],
  },
  {
    id: 'twin_lanes',
    name: 'Twin Sky Lanes',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.25 },
      { delay: 0.0, kind: 'cloud', yFrac: 0.5 },
      { delay: 0.0, kind: 'star', yFrac: 0.75 },
      { delay: 0.45, kind: 'star', yFrac: 0.25 },
      { delay: 0.45, kind: 'star', yFrac: 0.75 },
      { delay: 0.9, kind: 'cloud', yFrac: 0.5 },
      { delay: 0.9, kind: 'cloud', yFrac: 0.26 },
      { delay: 1.3, kind: 'bigstar', yFrac: 0.25 },
      { delay: 1.3, kind: 'storm_orb', yFrac: 0.5 },
      { delay: 1.3, kind: 'bigstar', yFrac: 0.75 },
      { delay: 1.85, kind: 'cloud', yFrac: 0.5 },
      { delay: 1.85, kind: 'cloud', yFrac: 0.74 },
    ],
  },
  {
    id: 'diamond_constellation',
    name: 'Diamond Constellation',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.5 },
      { delay: 0.35, kind: 'star', yFrac: 0.34 },
      { delay: 0.35, kind: 'cloud', yFrac: 0.5 },
      { delay: 0.35, kind: 'star', yFrac: 0.66 },
      { delay: 0.7, kind: 'star', yFrac: 0.22 },
      { delay: 0.7, kind: 'bigstar', yFrac: 0.5 },
      { delay: 0.7, kind: 'star', yFrac: 0.78 },
      { delay: 1.05, kind: 'star', yFrac: 0.34 },
      { delay: 1.05, kind: 'storm_orb', yFrac: 0.5 },
      { delay: 1.05, kind: 'star', yFrac: 0.66 },
      { delay: 1.4, kind: 'star', yFrac: 0.5 },
      { delay: 1.85, kind: 'cloud', yFrac: 0.22 },
      { delay: 1.85, kind: 'cloud', yFrac: 0.78 },
    ],
  },
  {
    id: 'comet_chase',
    name: 'Rainbow Comet Chase',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.48 },
      { delay: 0.28, kind: 'star', yFrac: 0.48 },
      { delay: 0.45, kind: 'cloud', yFrac: 0.3 },
      { delay: 0.58, kind: 'comet', yFrac: 0.48, speedMult: 1.25 },
      { delay: 0.92, kind: 'storm_orb', yFrac: 0.52 },
      { delay: 1.05, kind: 'cloud', yFrac: 0.24 },
      { delay: 1.05, kind: 'cloud', yFrac: 0.74 },
      { delay: 1.5, kind: 'star', yFrac: 0.48 },
      { delay: 1.8, kind: 'comet', yFrac: 0.35, speedMult: 1.25 },
      { delay: 1.82, kind: 'cloud', yFrac: 0.64 },
    ],
  },
  {
    id: 'zigzag_sky',
    name: 'Skyline Zigzag',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.24 },
      { delay: 0.22, kind: 'cloud', yFrac: 0.5 },
      { delay: 0.4, kind: 'star', yFrac: 0.5 },
      { delay: 0.55, kind: 'cloud', yFrac: 0.82 },
      { delay: 0.8, kind: 'star', yFrac: 0.76 },
      { delay: 1.05, kind: 'storm_orb', yFrac: 0.48 },
      { delay: 1.2, kind: 'bigstar', yFrac: 0.5 },
      { delay: 1.45, kind: 'cloud', yFrac: 0.18 },
      { delay: 1.6, kind: 'star', yFrac: 0.24 },
      { delay: 1.78, kind: 'cloud', yFrac: 0.58 },
      { delay: 2.0, kind: 'star', yFrac: 0.5 },
    ],
  },
  {
    id: 'sky_ladder',
    name: 'Starlight Ladder',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.8 },
      { delay: 0.35, kind: 'star', yFrac: 0.65 },
      { delay: 0.4, kind: 'cloud', yFrac: 0.44 },
      { delay: 0.7, kind: 'star', yFrac: 0.5 },
      { delay: 0.75, kind: 'cloud', yFrac: 0.22 },
      { delay: 1.05, kind: 'star', yFrac: 0.35 },
      { delay: 1.15, kind: 'storm_orb', yFrac: 0.62 },
      { delay: 1.4, kind: 'bigstar', yFrac: 0.2 },
      { delay: 1.65, kind: 'cloud', yFrac: 0.72 },
      { delay: 1.75, kind: 'cloud', yFrac: 0.42 },
    ],
  },
  {
    id: 'orbit_halo',
    name: 'Astral Orbit Halo',
    items: [
      { delay: 0.1, kind: 'star', yFrac: 0.35 },
      { delay: 0.1, kind: 'cloud', yFrac: 0.5 },
      { delay: 0.1, kind: 'star', yFrac: 0.65 },
      { delay: 0.45, kind: 'star', yFrac: 0.22 },
      { delay: 0.45, kind: 'comet', yFrac: 0.5 },
      { delay: 0.45, kind: 'star', yFrac: 0.78 },
      { delay: 0.8, kind: 'star', yFrac: 0.35 },
      { delay: 0.8, kind: 'storm_orb', yFrac: 0.5 },
      { delay: 0.8, kind: 'star', yFrac: 0.65 },
      { delay: 1.3, kind: 'void_meteor', yFrac: 0.3 },
      { delay: 1.45, kind: 'cloud', yFrac: 0.48 },
    ],
  },
  {
    id: 'meteor_shower',
    name: 'Prism Meteor Shower',
    items: [
      { delay: 0.0, kind: 'comet', yFrac: 0.24, speedMult: 1.2 },
      { delay: 0.2, kind: 'void_meteor', yFrac: 0.56 },
      { delay: 0.4, kind: 'star', yFrac: 0.42 },
      { delay: 0.75, kind: 'comet', yFrac: 0.6, speedMult: 1.2 },
      { delay: 0.9, kind: 'cloud', yFrac: 0.22 },
      { delay: 1.15, kind: 'star', yFrac: 0.78 },
      { delay: 1.25, kind: 'storm_orb', yFrac: 0.48 },
      { delay: 1.5, kind: 'bigstar', yFrac: 0.46 },
      { delay: 1.75, kind: 'cloud', yFrac: 0.76 },
    ],
  },
  {
    id: 'aurora_bridge',
    name: 'Aurora Sky Bridge',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.5 },
      { delay: 0.25, kind: 'cloud', yFrac: 0.32 },
      { delay: 0.3, kind: 'star', yFrac: 0.5 },
      { delay: 0.45, kind: 'cloud', yFrac: 0.22 },
      { delay: 0.45, kind: 'cloud', yFrac: 0.78 },
      { delay: 0.6, kind: 'bigstar', yFrac: 0.5 },
      { delay: 0.9, kind: 'star', yFrac: 0.5 },
      { delay: 0.95, kind: 'storm_orb', yFrac: 0.66 },
      { delay: 1.2, kind: 'star', yFrac: 0.5 },
      { delay: 1.45, kind: 'cloud', yFrac: 0.24 },
      { delay: 1.45, kind: 'void_meteor', yFrac: 0.52 },
      { delay: 1.45, kind: 'cloud', yFrac: 0.76 },
    ],
  },
  {
    id: 'double_helix',
    name: 'Cosmic Double Helix',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.3 },
      { delay: 0.0, kind: 'cloud', yFrac: 0.5 },
      { delay: 0.0, kind: 'star', yFrac: 0.7 },
      { delay: 0.45, kind: 'star', yFrac: 0.46 },
      { delay: 0.45, kind: 'star', yFrac: 0.54 },
      { delay: 0.9, kind: 'star', yFrac: 0.7 },
      { delay: 0.9, kind: 'storm_orb', yFrac: 0.5 },
      { delay: 0.9, kind: 'star', yFrac: 0.3 },
      { delay: 1.35, kind: 'bigstar', yFrac: 0.5 },
      { delay: 1.65, kind: 'void_meteor', yFrac: 0.42 },
      { delay: 1.8, kind: 'cloud', yFrac: 0.22 },
      { delay: 1.8, kind: 'cloud', yFrac: 0.78 },
    ],
  },
  {
    id: 'nebula_sprint',
    name: 'Nebula Star Trio',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.26 },
      { delay: 0.25, kind: 'star', yFrac: 0.26 },
      { delay: 0.35, kind: 'cloud', yFrac: 0.48 },
      { delay: 0.5, kind: 'bigstar', yFrac: 0.26 },
      { delay: 0.65, kind: 'cloud', yFrac: 0.62 },
      { delay: 1.0, kind: 'storm_orb', yFrac: 0.38 },
      { delay: 1.1, kind: 'star', yFrac: 0.74 },
      { delay: 1.35, kind: 'star', yFrac: 0.74 },
      { delay: 1.6, kind: 'comet', yFrac: 0.74 },
      { delay: 1.7, kind: 'cloud', yFrac: 0.34 },
      { delay: 1.75, kind: 'void_meteor', yFrac: 0.56 },
    ],
  },
  {
    id: 'starlight_crown',
    name: 'Starlight Crown',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.68 },
      { delay: 0.25, kind: 'cloud', yFrac: 0.42 },
      { delay: 0.35, kind: 'star', yFrac: 0.44 },
      { delay: 0.7, kind: 'star', yFrac: 0.6 },
      { delay: 0.85, kind: 'storm_orb', yFrac: 0.48 },
      { delay: 1.05, kind: 'bigstar', yFrac: 0.25 },
      { delay: 1.05, kind: 'cloud', yFrac: 0.78 },
      { delay: 1.4, kind: 'star', yFrac: 0.6 },
      { delay: 1.55, kind: 'void_meteor', yFrac: 0.36 },
      { delay: 1.75, kind: 'star', yFrac: 0.44 },
      { delay: 2.1, kind: 'star', yFrac: 0.68 },
    ],
  },
  {
    id: 'starlight_spiral',
    name: 'Starlight Spiral',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.5 },
      { delay: 0.28, kind: 'star', yFrac: 0.34 },
      { delay: 0.32, kind: 'cloud', yFrac: 0.64 },
      { delay: 0.56, kind: 'star', yFrac: 0.22 },
      { delay: 0.84, kind: 'bigstar', yFrac: 0.36 },
      { delay: 0.92, kind: 'cloud', yFrac: 0.18 },
      { delay: 1.12, kind: 'star', yFrac: 0.54 },
      { delay: 1.24, kind: 'storm_orb', yFrac: 0.42 },
      { delay: 1.4, kind: 'star', yFrac: 0.72 },
      { delay: 1.68, kind: 'comet', yFrac: 0.8, speedMult: 1.2 },
      { delay: 1.8, kind: 'cloud', yFrac: 0.48 },
    ],
  },
  {
    id: 'prism_slalom',
    name: 'Prism Slalom',
    items: [
      { delay: 0.0, kind: 'cloud', yFrac: 0.24 },
      { delay: 0.05, kind: 'star', yFrac: 0.46 },
      { delay: 0.35, kind: 'star', yFrac: 0.62 },
      { delay: 0.5, kind: 'cloud', yFrac: 0.8 },
      { delay: 0.7, kind: 'bigstar', yFrac: 0.52 },
      { delay: 0.9, kind: 'cloud', yFrac: 0.24 },
      { delay: 1.05, kind: 'star', yFrac: 0.44 },
      { delay: 1.28, kind: 'storm_orb', yFrac: 0.68 },
      { delay: 1.4, kind: 'star', yFrac: 0.3 },
      { delay: 1.65, kind: 'comet', yFrac: 0.24, speedMult: 1.22 },
      { delay: 1.85, kind: 'cloud', yFrac: 0.58 },
    ],
  },
  {
    id: 'meteor_weave',
    name: 'Starlight Weave',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.32 },
      { delay: 0.0, kind: 'star', yFrac: 0.68 },
      { delay: 0.35, kind: 'cloud', yFrac: 0.5 },
      { delay: 0.5, kind: 'comet', yFrac: 0.26, speedMult: 1.2 },
      { delay: 0.82, kind: 'star', yFrac: 0.72 },
      { delay: 1.05, kind: 'void_meteor', yFrac: 0.46 },
      { delay: 1.15, kind: 'bigstar', yFrac: 0.24 },
      { delay: 1.45, kind: 'cloud', yFrac: 0.78 },
      { delay: 1.6, kind: 'star', yFrac: 0.56 },
      { delay: 1.88, kind: 'star', yFrac: 0.38 },
    ],
  },
  {
    id: 'eclipse_gate',
    name: 'Eclipse Twin Gate',
    items: [
      { delay: 0.0, kind: 'cloud', yFrac: 0.22 },
      { delay: 0.0, kind: 'star', yFrac: 0.5 },
      { delay: 0.0, kind: 'cloud', yFrac: 0.78 },
      { delay: 0.42, kind: 'star', yFrac: 0.36 },
      { delay: 0.42, kind: 'star', yFrac: 0.64 },
      { delay: 0.85, kind: 'bigstar', yFrac: 0.5 },
      { delay: 0.9, kind: 'storm_orb', yFrac: 0.24 },
      { delay: 1.25, kind: 'cloud', yFrac: 0.5 },
      { delay: 1.55, kind: 'comet', yFrac: 0.28, speedMult: 1.25 },
      { delay: 1.55, kind: 'star', yFrac: 0.72 },
    ],
  },
  {
    id: 'shooting_gallery',
    name: 'Shooting Star Cascade',
    items: [
      { delay: 0.0, kind: 'comet', yFrac: 0.22, speedMult: 1.26 },
      { delay: 0.32, kind: 'comet', yFrac: 0.44, speedMult: 1.26 },
      { delay: 0.4, kind: 'cloud', yFrac: 0.72 },
      { delay: 0.68, kind: 'comet', yFrac: 0.66, speedMult: 1.26 },
      { delay: 0.95, kind: 'cloud', yFrac: 0.26 },
      { delay: 1.12, kind: 'bigstar', yFrac: 0.48 },
      { delay: 1.35, kind: 'storm_orb', yFrac: 0.74 },
      { delay: 1.55, kind: 'star', yFrac: 0.32 },
      { delay: 1.85, kind: 'star', yFrac: 0.52 },
    ],
  },
  {
    id: 'crescent_moon',
    name: 'Crescent Moon Arc',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.2 },
      { delay: 0.28, kind: 'star', yFrac: 0.34 },
      { delay: 0.32, kind: 'cloud', yFrac: 0.62 },
      { delay: 0.56, kind: 'bigstar', yFrac: 0.5 },
      { delay: 0.84, kind: 'star', yFrac: 0.66 },
      { delay: 0.96, kind: 'cloud', yFrac: 0.3 },
      { delay: 1.12, kind: 'star', yFrac: 0.8 },
      { delay: 1.38, kind: 'storm_orb', yFrac: 0.52 },
      { delay: 1.55, kind: 'star', yFrac: 0.36 },
      { delay: 1.85, kind: 'comet', yFrac: 0.22, speedMult: 1.22 },
    ],
  },
  {
    id: 'thunder_steppe',
    name: 'Thundersteppe Hop',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.72 },
      { delay: 0.25, kind: 'storm_orb', yFrac: 0.38 },
      { delay: 0.42, kind: 'star', yFrac: 0.72 },
      { delay: 0.72, kind: 'cloud', yFrac: 0.76 },
      { delay: 0.84, kind: 'bigstar', yFrac: 0.3 },
      { delay: 1.12, kind: 'star', yFrac: 0.24 },
      { delay: 1.25, kind: 'cloud', yFrac: 0.54 },
      { delay: 1.5, kind: 'comet', yFrac: 0.34, speedMult: 1.24 },
      { delay: 1.78, kind: 'void_meteor', yFrac: 0.66 },
      { delay: 1.9, kind: 'star', yFrac: 0.26 },
    ],
  },
  {
    id: 'nebula_tunnel',
    name: 'Nebula Sky Tunnel',
    items: [
      { delay: 0.0, kind: 'cloud', yFrac: 0.2 },
      { delay: 0.0, kind: 'cloud', yFrac: 0.8 },
      { delay: 0.15, kind: 'star', yFrac: 0.5 },
      { delay: 0.48, kind: 'star', yFrac: 0.5 },
      { delay: 0.78, kind: 'cloud', yFrac: 0.24 },
      { delay: 0.78, kind: 'cloud', yFrac: 0.76 },
      { delay: 0.84, kind: 'bigstar', yFrac: 0.5 },
      { delay: 1.22, kind: 'storm_orb', yFrac: 0.54 },
      { delay: 1.45, kind: 'star', yFrac: 0.3 },
      { delay: 1.75, kind: 'comet', yFrac: 0.68, speedMult: 1.22 },
    ],
  },
  {
    id: 'zenith_stair',
    name: 'Zenith Sky Stairs',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.78 },
      { delay: 0.26, kind: 'star', yFrac: 0.64 },
      { delay: 0.36, kind: 'cloud', yFrac: 0.34 },
      { delay: 0.54, kind: 'star', yFrac: 0.5 },
      { delay: 0.82, kind: 'star', yFrac: 0.36 },
      { delay: 0.92, kind: 'cloud', yFrac: 0.74 },
      { delay: 1.1, kind: 'bigstar', yFrac: 0.24 },
      { delay: 1.38, kind: 'storm_orb', yFrac: 0.48 },
      { delay: 1.56, kind: 'star', yFrac: 0.62 },
      { delay: 1.85, kind: 'comet', yFrac: 0.76, speedMult: 1.2 },
    ],
  },
  {
    id: 'aurora_zigzag',
    name: 'Aurora Sky Pulse',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.26 },
      { delay: 0.26, kind: 'cloud', yFrac: 0.48 },
      { delay: 0.42, kind: 'star', yFrac: 0.74 },
      { delay: 0.68, kind: 'void_meteor', yFrac: 0.32 },
      { delay: 0.82, kind: 'bigstar', yFrac: 0.7 },
      { delay: 1.08, kind: 'cloud', yFrac: 0.52 },
      { delay: 1.22, kind: 'star', yFrac: 0.26 },
      { delay: 1.48, kind: 'storm_orb', yFrac: 0.68 },
      { delay: 1.65, kind: 'comet', yFrac: 0.28, speedMult: 1.24 },
      { delay: 1.9, kind: 'star', yFrac: 0.48 },
    ],
  },
  {
    id: 'supernova_ring',
    name: 'Supernova Star Ring',
    items: [
      { delay: 0.0, kind: 'star', yFrac: 0.5 },
      { delay: 0.28, kind: 'star', yFrac: 0.28 },
      { delay: 0.28, kind: 'star', yFrac: 0.72 },
      { delay: 0.56, kind: 'cloud', yFrac: 0.5 },
      { delay: 0.65, kind: 'bigstar', yFrac: 0.22 },
      { delay: 0.65, kind: 'bigstar', yFrac: 0.78 },
      { delay: 1.0, kind: 'storm_orb', yFrac: 0.5 },
      { delay: 1.32, kind: 'star', yFrac: 0.34 },
      { delay: 1.32, kind: 'star', yFrac: 0.66 },
      { delay: 1.68, kind: 'cloud', yFrac: 0.24 },
      { delay: 1.68, kind: 'cloud', yFrac: 0.76 },
    ],
  },
  {
    id: 'astral_crosswind',
    name: 'Astral Jetstream',
    items: [
      { delay: 0.0, kind: 'comet', yFrac: 0.5, speedMult: 1.28 },
      { delay: 0.3, kind: 'cloud', yFrac: 0.28 },
      { delay: 0.42, kind: 'star', yFrac: 0.64 },
      { delay: 0.7, kind: 'star', yFrac: 0.76 },
      { delay: 0.88, kind: 'void_meteor', yFrac: 0.44 },
      { delay: 1.05, kind: 'bigstar', yFrac: 0.24 },
      { delay: 1.32, kind: 'cloud', yFrac: 0.72 },
      { delay: 1.48, kind: 'storm_orb', yFrac: 0.48 },
      { delay: 1.72, kind: 'comet', yFrac: 0.28, speedMult: 1.24 },
      { delay: 1.95, kind: 'star', yFrac: 0.62 },
    ],
  },
];

export const SKYHOP_PALETTES = [
  { name: 'Starlight Village Dusk', top: '#0f172a', mid: '#312e81', bottom: '#4c1d95', accent: '#c084fc' },
  { name: 'Whispering Canopy', top: '#064e3b', mid: '#0f766e', bottom: '#1e3a8a', accent: '#4ade80' },
  { name: 'Crystal Cavern Glow', top: '#1e1b4b', mid: '#6d28d9', bottom: '#0f172a', accent: '#e879f9' },
  { name: 'Sapphire Horizon', top: '#0c4a6e', mid: '#0284c7', bottom: '#1e1b4b', accent: '#38bdf8' },
  { name: 'Ember Sunset', top: '#431407', mid: '#c2410c', bottom: '#7c2d12', accent: '#fb923c' },
  { name: 'Starfall Aurora', top: '#1e1b4b', mid: '#0f766e', bottom: '#3b0764', accent: '#67e8f9' },
  { name: 'Celestial Blossom', top: '#500724', mid: '#9d174d', bottom: '#312e81', accent: '#f9a8d4' },
  { name: 'Sunstone Mirage', top: '#451a03', mid: '#b45309', bottom: '#1e293b', accent: '#fde047' },
  { name: 'Glowspore Twilight', top: '#022c22', mid: '#115e59', bottom: '#312e81', accent: '#2dd4bf' },
  { name: 'Astral Citadel', top: '#090d1a', mid: '#4338ca', bottom: '#0f172a', accent: '#a78bfa' },
  { name: 'Thundersteppe Storm', top: '#1e293b', mid: '#854d0e', bottom: '#0f172a', accent: '#facc15' },
  { name: 'Abyssal Pearl Sky', top: '#082f49', mid: '#0e7490', bottom: '#1e1b4b', accent: '#7dd3fc' },
  { name: 'Chrono Relic Sunset', top: '#2e1065', mid: '#b45309', bottom: '#172554', accent: '#fbbf24' },
  { name: 'Mythic Rift Nebula', top: '#3b0764', mid: '#a21caf', bottom: '#0f172a', accent: '#f0abfc' },
  { name: 'Faeveldt Rose Dawn', top: '#4c0519', mid: '#db2777', bottom: '#312e81', accent: '#fbcfe8' },
  { name: 'Sunburst Alola Horizon', top: '#7c2d12', mid: '#ea580c', bottom: '#0e7490', accent: '#fed7aa' },
  { name: 'Iron Crown Summit', top: '#0f172a', mid: '#334155', bottom: '#1e3a8a', accent: '#93c5fd' },
  { name: 'Terastal Prism', top: '#1e1b4b', mid: '#0369a1', bottom: '#831843', accent: '#f472b6' },
];

export interface SkyHopTickEvents {
  collectedStar?: boolean;
  hitHazard?: boolean;
  healedHeart?: boolean;
  dashActivated?: boolean;
  waveAdvanced?: boolean;
  runEnded?: boolean;
  rewardedRun?: boolean;
  newBadgeIds?: string[];
}

const MAX_SKYHOP_PARTICLES = 220;

export class DojoSkyHopController {
  private readonly storage: StarlightStorageBridge;
  private readonly sprites: SpriteAssetLoader;
  private state: SkyHopState;
  private pendingSpawns: Array<{ delay: number; kind: SkyHopEntity['kind']; yFrac: number; speedMult?: number; spawned: boolean }> = [];
  private waveElapsed = 0;
  private entitySeq = 1;
  private pointerTargetY: number | null = null;
  private pointerActive = false;
  private keysHeld = new Set<'up' | 'down'>();
  private waveDeck: SkyHopWaveSpec[] = [];
  private lastWaveId: string | null = null;
  private lastOpeningWaveId: string | null = null;
  private recentWaveIds: string[] = [];
  private runSkyOffset = 0;
  private lastRunSkyOffset = -1;

  constructor(storage: StarlightStorageBridge, sprites: SpriteAssetLoader) {
    this.storage = storage;
    this.sprites = sprites;
    this.state = this.createInitialState();
  }

  private createInitialState(): SkyHopState {
    const profile = this.storage.getActiveProfileJSON();
    const lead = profile?.team?.[0];
    const sp = getSpeciesEntry(lead?.speciesId ?? profile?.starterId ?? 25);
    const arcade = this.storage.manager.getArcadeState();

    return {
      active: false,
      running: false,
      paused: false,
      gameOver: false,
      outOfCharges: false,
      partnerSpeciesId: sp.id,
      partnerName: stripEmojis(lead?.nickname || sp.name),
      partnerType: sp.type as ElementalType,
      partnerShiny: Boolean(lead?.isShiny),
      partnerFrames: null,
      playerX: SKYHOP_PLAYER_X,
      playerY: SKYHOP_LOGICAL_H * 0.5,
      playerVy: 0,
      bankAngle: 0,
      dashTimer: 0,
      dashCooldown: 0,
      magnetTimer: 0,
      hitInvulnTimer: 0,
      shakeTimer: 0,
      wave: 1,
      waveName: SKYHOP_WAVE_TEMPLATES[0].name,
      waveBannerTimer: 0,
      skyIndex: 0,
      score: 0,
      combo: 1,
      comboStreak: 0,
      starsCollected: 0,
      highScore: arcade?.highScore ?? 0,
      bestWave: arcade?.bestWave ?? 0,
      hearts: MAX_HEARTS,
      maxHearts: MAX_HEARTS,
      charges: arcade?.charges ?? MAX_ARCADE_CHARGES,
      maxCharges: MAX_ARCADE_CHARGES,
      starShards: arcade?.starShards ?? 0,
      canBuyWithShards: Boolean(arcade?.canBuyWithShards),
      shardBuyInCost: ARCADE_SHARD_BUYIN_COST,
      elapsedSeconds: 0,
      reducedMotion: this.storage.getSettings().reducedMotion,
      entities: [],
      particles: [],
      lastRunRewards: null,
    };
  }

  getState(): SkyHopState {
    return this.state;
  }

  open(options?: { forceUnlock?: boolean }): SkyHopState {
    if (options?.forceUnlock && !this.storage.manager.isArcadeUnlocked()) {
      this.storage.manager.unlockArcade(true);
    }
    this.syncPartnerAndArcade();
    this.state.active = true;
    this.state.running = false;
    this.state.gameOver = false;
    this.state.paused = false;
    this.state.outOfCharges = !this.storage.manager.isArcadeUnlocked() || this.state.charges <= 0;
    return this.state;
  }

  close(): void {
    this.state.active = false;
    this.state.running = false;
    this.state.paused = false;
    this.keysHeld.clear();
    this.pointerActive = false;
    this.pointerTargetY = null;
  }

  getWaveDeckDiagnostics(): {
    lastWaveId: string | null;
    lastOpeningWaveId: string | null;
    recentWaveIds: string[];
    deckRemaining: number;
    runSkyOffset: number;
  } {
    return {
      lastWaveId: this.lastWaveId,
      lastOpeningWaveId: this.lastOpeningWaveId,
      recentWaveIds: [...this.recentWaveIds],
      deckRemaining: this.waveDeck.length,
      runSkyOffset: this.runSkyOffset,
    };
  }

  /**
   * Exact v1 Fisher-Yates wave deck refill with 4-tail recent-avoid & back-to-back guard
   * (`C:\dojo\js\minigame.js:726-756`).
   */
  private refillWaveDeck(extraAvoidIds: string[] = []): void {
    const deck = SKYHOP_WAVE_TEMPLATES.map((tpl) => ({ ...tpl }));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const recentAvoid = new Set(
      [this.lastWaveId, ...this.recentWaveIds.slice(-4), ...extraAvoidIds].filter(Boolean) as string[],
    );
    if (deck.length > 1) {
      const checkTailCount = Math.min(4, deck.length - 1);
      for (let offset = 0; offset < checkTailCount; offset++) {
        const tailIdx = deck.length - 1 - offset;
        if (!recentAvoid.has(deck[tailIdx].id)) continue;
        const swapIdx = deck.findIndex((item, idx) => idx < tailIdx && !recentAvoid.has(item.id));
        if (swapIdx !== -1) {
          [deck[tailIdx], deck[swapIdx]] = [deck[swapIdx], deck[tailIdx]];
        }
      }
      if (this.lastWaveId && deck[deck.length - 1].id === this.lastWaveId) {
        const altIdx = deck.findIndex((item) => item.id !== this.lastWaveId);
        if (altIdx !== -1) {
          const lastIdx = deck.length - 1;
          [deck[lastIdx], deck[altIdx]] = [deck[altIdx], deck[lastIdx]];
        }
      }
    }
    this.waveDeck = deck;
  }

  /**
   * Exact v1 non-repeating wave draw (`C:\dojo\js\minigame.js:758-785`).
   */
  private drawNextWave(isOpening = false): SkyHopWaveSpec {
    const extraAvoid = isOpening && this.lastOpeningWaveId ? [this.lastOpeningWaveId] : [];
    if (!Array.isArray(this.waveDeck) || this.waveDeck.length === 0) {
      this.refillWaveDeck(extraAvoid);
    }
    const immediateAvoid = new Set([this.lastWaveId, ...extraAvoid].filter(Boolean) as string[]);
    if (this.waveDeck.length > 1 && immediateAvoid.has(this.waveDeck[this.waveDeck.length - 1]?.id)) {
      const swapIdx = this.waveDeck.findIndex((w) => !immediateAvoid.has(w.id));
      if (swapIdx !== -1) {
        const lastIdx = this.waveDeck.length - 1;
        [this.waveDeck[lastIdx], this.waveDeck[swapIdx]] = [this.waveDeck[swapIdx], this.waveDeck[lastIdx]];
      }
    }
    let next = this.waveDeck.pop() ?? SKYHOP_WAVE_TEMPLATES[0];
    if (this.lastWaveId && next.id === this.lastWaveId && this.waveDeck.length > 0) {
      const alt = this.waveDeck[0];
      this.waveDeck[0] = next;
      next = alt;
    }
    this.lastWaveId = next.id;
    if (isOpening && this.lastWaveId) {
      this.lastOpeningWaveId = this.lastWaveId;
    }
    if (this.lastWaveId) {
      this.recentWaveIds = [...this.recentWaveIds.filter((id) => id !== this.lastWaveId), this.lastWaveId].slice(-8);
    }
    return next;
  }

  private pushParticle(p: SkyHopParticle): void {
    if (this.state.particles.length >= MAX_SKYHOP_PARTICLES) {
      this.state.particles.shift();
    }
    this.state.particles.push(p);
  }

  private spawnTrailParticles(x: number, y: number, count = 2, burst = false): void {
    const baseColor = TYPES[this.state.partnerType]?.color || '#38bdf8';
    const colors =
      this.state.dashTimer > 0 || this.state.partnerShiny
        ? [baseColor, '#fde047', '#f472b6', '#ffffff', '#67e8f9']
        : [baseColor, '#bae6fd', '#fde047', '#ffffff'];
    const shapes: Array<SkyHopParticle['shape']> = burst ? ['star', 'spark', 'dot'] : ['dot', 'spark'];
    const actualCount = this.state.reducedMotion ? Math.max(1, Math.ceil(count * 0.4)) : count;

    for (let i = 0; i < actualCount; i++) {
      const angle = burst
        ? (Math.PI * 2 * i) / Math.max(1, actualCount) + (Math.random() - 0.5) * 0.25
        : Math.PI + (Math.random() - 0.5) * 0.9;
      const speed = burst ? 90 + Math.random() * 165 : 65 + Math.random() * 85;
      this.pushParticle({
        x: x - (burst ? 0 : 18),
        y: y + (Math.random() - 0.5) * 14,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: burst ? 0.58 + Math.random() * 0.18 : 0.44,
        size: burst ? 4.8 + (i % 3) * 0.9 : 3.2,
        color: colors[i % colors.length],
        shape: shapes[i % shapes.length],
      });
    }
  }

  private spawnWaveFanfareParticles(waveNum = 1): void {
    const sky = SKYHOP_PALETTES[this.state.skyIndex] ?? SKYHOP_PALETTES[0];
    const colors = [sky.accent || '#38bdf8', '#fde047', '#f472b6', '#ffffff', '#67e8f9'];
    const rawCount = waveNum > 1 ? 28 : 16;
    const count = this.state.reducedMotion ? Math.ceil(rawCount * 0.4) : rawCount;
    for (let i = 0; i < count; i++) {
      const y = 26 + ((SKYHOP_LOGICAL_H - 52) * i) / Math.max(1, count - 1) + (Math.random() - 0.5) * 18;
      this.pushParticle({
        x: waveNum > 1 ? SKYHOP_LOGICAL_W - 24 - (i % 4) * 32 : SKYHOP_PLAYER_X + (Math.random() - 0.3) * 80,
        y,
        vx: waveNum > 1 ? -(180 + Math.random() * 160) : 70 + Math.random() * 120,
        vy: (Math.random() - 0.5) * 60,
        life: 0,
        maxLife: 0.72 + Math.random() * 0.22,
        size: 4.5 + (i % 3) * 1.2,
        color: colors[i % colors.length],
        shape: i % 2 === 0 ? 'star' : 'spark',
      });
    }
  }

  private spawnVictoryBurstParticles(): void {
    const sky = SKYHOP_PALETTES[this.state.skyIndex] ?? SKYHOP_PALETTES[0];
    const colors = ['#fde047', '#f472b6', '#38bdf8', sky.accent || '#a78bfa', '#ffffff'];
    const count = this.state.reducedMotion ? 18 : 44;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 110 + (i % 5) * 48;
      this.pushParticle({
        x: SKYHOP_PLAYER_X + ((i % 3) - 1) * 24,
        y: this.state.playerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.85,
        size: 5 + (i % 3) * 1.2,
        color: colors[i % colors.length],
        shape: i % 3 === 0 ? 'star' : 'spark',
      });
    }
    this.pushParticle({
      x: SKYHOP_PLAYER_X,
      y: this.state.playerY,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0.65,
      size: 24,
      maxSize: 120,
      color: '#fde047',
      shape: 'ring',
    });
  }

  private syncPartnerAndArcade(): void {
    const profile = this.storage.getActiveProfileJSON();
    const lead = profile?.team?.[0];
    const sp = getSpeciesEntry(lead?.speciesId ?? profile?.starterId ?? 25);
    const arcade = this.storage.manager.getArcadeState();

    this.state.partnerSpeciesId = sp.id;
    this.state.partnerName = stripEmojis(lead?.nickname || sp.name);
    this.state.partnerType = sp.type;
    this.state.partnerShiny = Boolean(lead?.isShiny);
    this.state.highScore = arcade?.highScore ?? 0;
    this.state.bestWave = arcade?.bestWave ?? 0;
    this.state.charges = arcade?.charges ?? 0;
    this.state.starShards = arcade?.starShards ?? 0;
    this.state.canBuyWithShards = Boolean(arcade?.canBuyWithShards);
    this.state.reducedMotion = this.storage.getSettings().reducedMotion;

    const cached = this.sprites.getCached(sp.id, { back: false, shiny: this.state.partnerShiny });
    if (cached) this.state.partnerFrames = cached;
    void this.sprites.loadSpeciesSprite(sp.id, { back: false, shiny: this.state.partnerShiny }).then((f) => {
      this.state.partnerFrames = f;
    });
  }

  buyChargeWithShards(): boolean {
    const res = this.storage.manager.buyArcadeChargeWithShards(true);
    this.syncPartnerAndArcade();
    if (res.purchased) {
      this.state.outOfCharges = false;
    }
    return Boolean(res.purchased);
  }

  startNewRun(): boolean {
    this.syncPartnerAndArcade();
    // V1 parity (C:\dojo\js\minigame.js:946-958): enforce arcade unlock gate before charge consumption
    if (!this.storage.manager.isArcadeUnlocked()) {
      this.state.outOfCharges = true;
      this.state.running = false;
      this.state.gameOver = true;
      this.state.paused = false;
      this.state.entities = [];
      this.state.particles = [];
      this.pendingSpawns = [];
      this.pointerActive = false;
      this.pointerTargetY = null;
      this.keysHeld.clear();
      return false;
    }

    const consume = this.storage.manager.consumeArcadeCharge(true);
    this.syncPartnerAndArcade();
    if (!consume.consumed) {
      this.state.outOfCharges = true;
      this.state.running = false;
      this.state.gameOver = true;
      this.state.paused = false;
      this.state.entities = [];
      this.state.particles = [];
      this.pendingSpawns = [];
      this.pointerActive = false;
      this.pointerTargetY = null;
      this.keysHeld.clear();
      return false;
    }

    // V1 parity (C:\dojo\js\minigame.js:986-991): fresh non-repeating starting sky palette per run
    let skyStart = Math.floor(Math.random() * SKYHOP_PALETTES.length);
    if (SKYHOP_PALETTES.length > 1 && skyStart === this.lastRunSkyOffset) {
      skyStart = (skyStart + 1 + Math.floor(Math.random() * (SKYHOP_PALETTES.length - 1))) % SKYHOP_PALETTES.length;
    }
    this.runSkyOffset = skyStart;
    this.lastRunSkyOffset = skyStart;

    this.state.active = true;
    this.state.running = true;
    this.state.paused = false;
    this.state.gameOver = false;
    this.state.outOfCharges = false;
    this.state.lastRunRewards = null;
    this.state.score = 0;
    this.state.combo = 1;
    this.state.comboStreak = 0;
    this.state.starsCollected = 0;
    this.state.hearts = MAX_HEARTS;
    this.state.playerY = SKYHOP_LOGICAL_H * 0.5;
    this.state.playerVy = 0;
    this.state.bankAngle = 0;
    this.state.dashTimer = 0;
    this.state.dashCooldown = 0;
    this.state.magnetTimer = 0;
    this.state.hitInvulnTimer = 0;
    this.state.shakeTimer = 0;
    this.pointerActive = false;
    this.pointerTargetY = null;
    this.keysHeld.clear();
    this.state.entities = [];
    this.state.particles = [];
    this.beginWave(1);
    return true;
  }

  togglePause(): void {
    if (!this.state.running || this.state.gameOver) return;
    this.state.paused = !this.state.paused;
  }

  setPointerNormY(normY: number | null, active?: boolean): void {
    if (normY === null) {
      // V1 tap-to-glide parity (minigame.js:658-662,1340-1350): releasing pointer stops active drag
      // while preserving pointerTargetY so a quick tap smoothly glides to the target height!
      this.pointerActive = false;
      return;
    }
    this.pointerActive = active ?? true;
    this.pointerTargetY = Math.max(40, Math.min(SKYHOP_LOGICAL_H - 40, normY * SKYHOP_LOGICAL_H));
  }

  setKeyDir(dir: 'up' | 'down', held: boolean): void {
    if (held) {
      this.keysHeld.add(dir);
      this.pointerActive = false;
      this.pointerTargetY = null;
    } else {
      this.keysHeld.delete(dir);
    }
  }

  activateDash(): boolean {
    if (!this.state.running || this.state.paused || this.state.gameOver) return false;
    if (this.state.dashCooldown > 0 || this.state.dashTimer > 0) return false;
    this.state.dashTimer = 1.15;
    this.state.dashCooldown = 4.6;
    this.state.magnetTimer = Math.max(this.state.magnetTimer, 1.15);
    this.spawnTrailParticles(SKYHOP_PLAYER_X, this.state.playerY, 36, true);
    this.pushParticle({
      x: SKYHOP_PLAYER_X,
      y: this.state.playerY,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0.48,
      size: 26,
      maxSize: 82,
      color: '#fde047',
      shape: 'ring',
    });
    return true;
  }

  private beginWave(waveNum: number): void {
    this.state.wave = waveNum;
    const tpl = this.drawNextWave(waveNum === 1);
    this.state.waveName = tpl.name;
    this.state.skyIndex = (this.runSkyOffset + Math.max(0, waveNum - 1)) % SKYHOP_PALETTES.length;
    this.state.waveBannerTimer = 1.8;
    this.waveElapsed = 0;
    this.spawnWaveFanfareParticles(waveNum);

    const flip = waveNum % 2 === 0;
    const delayScale = Math.max(0.58, 1 - (waveNum - 1) * 0.045);
    this.pendingSpawns = tpl.items.map((item) => ({
      ...item,
      delay: Number((item.delay * delayScale).toFixed(3)),
      yFrac: flip ? Math.max(0.16, Math.min(0.84, 1 - item.yFrac)) : item.yFrac,
      spawned: false,
    }));

    // V1 Wave Escalation Spawns (C:\dojo\js\minigame.js:1061-1098)
    if (waveNum >= 2) {
      this.pendingSpawns.push({
        delay: Number((0.75 * delayScale).toFixed(3)),
        kind: 'storm_orb',
        yFrac: flip ? 0.34 : 0.66,
        spawned: false,
      });
    }

    if (waveNum >= 3) {
      const meteorCount = Math.min(3, 1 + Math.floor((waveNum - 3) / 3));
      for (let idx = 0; idx < meteorCount; idx += 1) {
        this.pendingSpawns.push({
          delay: Number(((0.45 + idx * 0.72) * delayScale).toFixed(3)),
          kind: 'void_meteor',
          yFrac: 0.22 + ((waveNum + idx * 2) % 4) * 0.18,
          spawned: false,
        });
      }
    }

    if (waveNum >= 4 && waveNum % 2 === 0) {
      const gateDelay = Number((1.55 * delayScale).toFixed(3));
      this.pendingSpawns.push(
        { delay: gateDelay, kind: 'cloud', yFrac: 0.36, spawned: false },
        { delay: gateDelay, kind: 'bigstar', yFrac: 0.5, spawned: false },
        { delay: gateDelay, kind: 'cloud', yFrac: 0.64, spawned: false },
      );
    }

    if (waveNum >= 5 && waveNum % 5 === 0 && this.state.hearts < MAX_HEARTS) {
      this.pendingSpawns.push({
        delay: Number((1.45 * delayScale).toFixed(3)),
        kind: 'heart',
        yFrac: flip ? 0.24 : 0.76,
        spawned: false,
      });
    }
  }

  private spawnEntity(spec: { kind: SkyHopEntity['kind']; yFrac: number; speedMult?: number }): void {
    const waveBoost = Math.min(265, (this.state.wave - 1) * 24);
    const kind = spec.kind;
    const speedMult = spec.speedMult ?? (kind === 'void_meteor' ? 1.34 : kind === 'storm_orb' ? 1.16 : 1);
    const speed = (255 + waveBoost) * speedMult;
    const y = Math.max(36, Math.min(SKYHOP_LOGICAL_H - 36, spec.yFrac * SKYHOP_LOGICAL_H));
    const radius =
      kind === 'void_meteor'
        ? 21
        : kind === 'storm_orb'
          ? 20
          : kind === 'cloud'
            ? 22
            : kind === 'bigstar'
              ? 20
              : kind === 'comet'
                ? 18
                : 15;
    const vy =
      kind === 'void_meteor'
        ? (y > SKYHOP_LOGICAL_H * 0.5 ? -1 : 1) * (48 + Math.min(34, this.state.wave * 3))
        : 0;
    const bobAmp =
      kind === 'storm_orb'
        ? 46 + Math.min(24, this.state.wave * 2.5)
        : kind === 'comet'
          ? 26
          : kind === 'void_meteor'
            ? 0
            : 10;
    const bobFreq =
      kind === 'storm_orb'
        ? 3.6 + Math.min(1.4, this.state.wave * 0.12)
        : kind === 'comet'
          ? 4.5
          : 2.6;

    this.state.entities.push({
      id: `sh-${this.entitySeq++}`,
      kind,
      x: kind === 'void_meteor' ? SKYHOP_LOGICAL_W + 96 : SKYHOP_LOGICAL_W + 34,
      y,
      baseY: y,
      vy,
      radius,
      speed,
      age: 0,
      bobAmp,
      bobFreq,
    });
  }

  static computeRewards(score: number, wave: number, badgeCount: number, gemCooldown: number) {
    const safeScore = Math.max(0, Math.floor(score));
    const safeWave = Math.max(1, Math.floor(wave));
    if (safeScore < MIN_ARCADE_REWARD_SCORE) {
      return {
        tierLabel: 'Flight Warm-Up',
        nextHint: `Reach ${MIN_ARCADE_REWARD_SCORE}+ pts to earn Star Shards and Potions!`,
        starShards: 0,
        potions: 0,
        greatBalls: 0,
        starBalls: 0,
        cheerCharges: 0,
        gems: {} as Record<string, number>,
      };
    }

    let starShards = 1;
    let potions = 1;
    let greatBalls = 0;
    let starBalls = 0;
    let cheerCharges = 0;
    let tierLabel = 'Tier 1: Sky Rookie';
    let nextHint = 'Next Tier: 180+ pts & Wave 2 for +2 Star Shards & +1 Cheer!';
    const gems: Record<string, number> = {};

    if (safeScore >= 180 && safeWave >= 2) {
      starShards = 2;
      cheerCharges = 1;
      tierLabel = 'Tier 2: Starlight Flyer';
      nextHint = 'Next Tier: 300+ pts & Wave 3 for +1 Great Ball!';
    }
    if (safeScore >= 300 && safeWave >= 3) {
      greatBalls = 1;
      tierLabel = 'Tier 3: Nebula Glider';
      nextHint = 'Next Tier: 450+ pts & Wave 5 for +3 Star Shards & +2 Potions!';
    }
    if (safeScore >= 450 && safeWave >= 5) {
      starShards = 3;
      potions = 2;
      tierLabel = 'Tier 4: Comet Vanguard';
      nextHint = 'Next Tier: 650+ pts & Wave 6 for +4 Star Shards & +1 Star Ball!';
    }
    if (safeScore >= 650 && safeWave >= 6) {
      starShards = Math.min(MAX_ARCADE_SHARDS, 4);
      greatBalls = 2;
      starBalls = 1;
      tierLabel = 'Tier 5: Starlight Ace';
      nextHint = 'Next Tier: 900+ pts & Wave 8 for an Evolution Gem!';
    }
    if (safeScore >= 900 && safeWave >= 8) {
      tierLabel = 'Tier 6: Astral Legend';
      nextHint = 'Max Reward Tier Reached!';
      if (gemCooldown <= 0) {
        const pool = getUnlockedArcadeGemPool(badgeCount);
        if (pool.length > 0) {
          const picked = pool[Math.floor(Math.random() * pool.length)];
          gems[picked] = 1;
        }
      } else {
        starBalls += 1;
      }
    }

    return {
      tierLabel,
      nextHint,
      starShards: Math.min(MAX_ARCADE_SHARDS, starShards),
      potions,
      greatBalls,
      starBalls,
      cheerCharges,
      gems,
    };
  }

  private finishRun(): string[] {
    this.state.running = false;
    this.state.gameOver = true;
    this.pointerActive = false;
    this.pointerTargetY = null;
    this.keysHeld.clear();
    if (this.state.score >= MIN_ARCADE_REWARD_SCORE) {
      this.spawnVictoryBurstParticles();
    }
    const profile = this.storage.getActiveProfileJSON();
    const badgeCount = profile?.badges?.length ?? 0;
    const gemCooldown = profile?.arcade?.gemCooldown ?? 0;
    const rewards = DojoSkyHopController.computeRewards(this.state.score, this.state.wave, badgeCount, gemCooldown);
    const rec = this.storage.manager.recordArcadeRun({
      score: this.state.score,
      wave: this.state.wave,
      stars: this.state.starsCollected,
      rewards,
    });
    this.syncPartnerAndArcade();
    this.state.outOfCharges = this.state.charges <= 0;
    this.state.lastRunRewards = {
      ...rewards,
      isNewBest: Boolean(rec?.isNewBest),
    };
    return Array.isArray(rec?.newBadges) ? rec.newBadges.map((b: { id: string }) => b.id) : [];
  }

  update(dtSeconds: number): SkyHopTickEvents {
    const events: SkyHopTickEvents = {};
    if (!this.state.active || !this.state.running || this.state.paused || this.state.gameOver) {
      return events;
    }

    const dt = Math.min(0.05, Math.max(0.001, dtSeconds));
    this.state.elapsedSeconds += dt;
    if (this.state.dashTimer > 0) this.state.dashTimer = Math.max(0, this.state.dashTimer - dt);
    else if (this.state.dashCooldown > 0) this.state.dashCooldown = Math.max(0, this.state.dashCooldown - dt);
    if (this.state.magnetTimer > 0) this.state.magnetTimer = Math.max(0, this.state.magnetTimer - dt);
    if (this.state.hitInvulnTimer > 0) this.state.hitInvulnTimer = Math.max(0, this.state.hitInvulnTimer - dt);
    if (this.state.shakeTimer > 0) this.state.shakeTimer = Math.max(0, this.state.shakeTimer - dt);
    if (this.state.waveBannerTimer > 0) this.state.waveBannerTimer = Math.max(0, this.state.waveBannerTimer - dt);

    const speedMult = this.state.dashTimer > 0 ? 1.25 : 1.0;
    if (this.keysHeld.has('up') || this.keysHeld.has('down')) {
      const dir = (this.keysHeld.has('down') ? 1 : 0) - (this.keysHeld.has('up') ? 1 : 0);
      this.state.playerVy = dir * 355 * speedMult;
      this.state.playerY += this.state.playerVy * dt;
    } else if (this.pointerTargetY !== null) {
      const diff = this.pointerTargetY - this.state.playerY;
      if (Math.abs(diff) <= 3) {
        this.state.playerY = this.pointerTargetY;
        this.state.playerVy = 0;
        if (!this.pointerActive) this.pointerTargetY = null;
      } else {
        const followRate = this.pointerActive ? 15.5 : 10.5;
        this.state.playerVy = Math.max(-520, Math.min(520, diff * followRate));
        this.state.playerY += this.state.playerVy * dt;
      }
    } else {
      this.state.playerVy *= Math.pow(0.02, dt);
    }

    // Wave 5+ gentle rhythmic sky crosswind (v1 parity)
    if (this.state.wave >= 5) {
      const windVy = Math.sin(this.waveElapsed * 1.9) * Math.min(54, (this.state.wave - 4) * 10);
      this.state.playerY += windVy * (this.pointerActive ? 0.3 : 1) * dt;
    }

    this.state.playerY = Math.max(40, Math.min(SKYHOP_LOGICAL_H - 40, this.state.playerY));
    this.state.bankAngle = Math.max(-0.35, Math.min(0.35, this.state.playerVy / 900));

    // Ambient starlight trail behind Lead Pokémon (v1 minigame.js:1365-1367)
    const trailChance = this.state.dashTimer > 0 ? 0.98 : 0.6;
    if (Math.random() < (this.state.reducedMotion ? trailChance * 0.35 : trailChance)) {
      this.spawnTrailParticles(SKYHOP_PLAYER_X, this.state.playerY, this.state.dashTimer > 0 ? 4 : 2, false);
    }

    this.waveElapsed += dt;
    let maxDelay = 0;
    for (const sp of this.pendingSpawns) {
      if (sp.delay > maxDelay) maxDelay = sp.delay;
      if (!sp.spawned && this.waveElapsed >= sp.delay) {
        sp.spawned = true;
        this.spawnEntity(sp);
      }
    }

    const scrollBoost = this.state.dashTimer > 0 ? 1.45 : 1.0;
    for (let i = this.state.entities.length - 1; i >= 0; i--) {
      const ent = this.state.entities[i];
      ent.age += dt;
      ent.x -= ent.speed * scrollBoost * dt;
      if (ent.kind === 'void_meteor') {
        ent.baseY += ent.vy * dt;
        if (ent.baseY < 42) {
          ent.baseY = 42;
          ent.vy = Math.abs(ent.vy || 50);
        } else if (ent.baseY > SKYHOP_LOGICAL_H - 42) {
          ent.baseY = SKYHOP_LOGICAL_H - 42;
          ent.vy = -Math.abs(ent.vy || 50);
        }
        ent.y = ent.baseY;
      } else {
        ent.y = Math.max(28, Math.min(SKYHOP_LOGICAL_H - 28, ent.baseY + Math.sin(ent.age * ent.bobFreq) * ent.bobAmp));
      }

      const isHazard = ent.kind === 'cloud' || ent.kind === 'storm_orb' || ent.kind === 'void_meteor';
      if (!isHazard && (this.state.dashTimer > 0 || this.state.magnetTimer > 0)) {
        const dx = SKYHOP_PLAYER_X - ent.x;
        const dy = this.state.playerY - ent.y;
        const d = Math.hypot(dx, dy);
        if (d > 1 && d < 125) {
          ent.x += (dx / d) * 280 * dt;
          ent.baseY += (dy / d) * 280 * dt;
          ent.y = ent.baseY;
        }
      }

      const dist = Math.hypot(ent.x - SKYHOP_PLAYER_X, ent.y - this.state.playerY);
      const hitRadius =
        ent.kind === 'cloud'
          ? 28
          : ent.kind === 'storm_orb'
            ? 26
            : ent.kind === 'void_meteor'
              ? 27
              : 29;
      if (dist <= hitRadius) {
        if (isHazard) {
          if (this.state.dashTimer > 0) {
            if (ent.kind === 'void_meteor') {
              this.state.dashTimer = 0;
              this.state.magnetTimer = 0;
              this.state.combo = 1;
              this.state.comboStreak = 0;
              this.state.hitInvulnTimer = 0.55;
              this.state.shakeTimer = 0.22;
              this.spawnTrailParticles(ent.x, ent.y, 28, true);
              this.pushParticle({
                x: ent.x,
                y: ent.y,
                vx: 0,
                vy: 0,
                life: 0,
                maxLife: 0.42,
                size: 18,
                maxSize: 74,
                color: '#f87171',
                shape: 'ring',
              });
              events.hitHazard = true;
            } else {
              this.state.score += ent.kind === 'storm_orb' ? 8 : 5;
              this.spawnTrailParticles(ent.x, ent.y, 20, true);
              events.collectedStar = true;
            }
            this.state.entities.splice(i, 1);
            continue;
          }
          if (this.state.hitInvulnTimer <= 0) {
            this.state.hearts = Math.max(0, this.state.hearts - 1);
            this.state.combo = 1;
            this.state.comboStreak = 0;
            this.state.hitInvulnTimer = 1.0;
            this.state.shakeTimer = 0.28;
            this.spawnTrailParticles(SKYHOP_PLAYER_X, this.state.playerY, 24, true);
            events.hitHazard = true;
            this.state.entities.splice(i, 1);
            if (this.state.hearts <= 0) {
              const newBadgeIds = this.finishRun();
              events.runEnded = true;
              events.rewardedRun = this.state.score >= MIN_ARCADE_REWARD_SCORE;
              if (newBadgeIds.length > 0) events.newBadgeIds = newBadgeIds;
              return events;
            }
            continue;
          }
        } else if (ent.kind === 'heart') {
          this.state.hearts = Math.min(MAX_HEARTS, this.state.hearts + 1);
          this.state.score += 15;
          this.spawnTrailParticles(ent.x, ent.y, 20, true);
          this.pushParticle({
            x: ent.x,
            y: ent.y,
            vx: 0,
            vy: 0,
            life: 0,
            maxLife: 0.45,
            size: 16,
            maxSize: 64,
            color: '#f472b6',
            shape: 'ring',
          });
          events.healedHeart = true;
          this.state.entities.splice(i, 1);
          continue;
        } else {
          this.state.starsCollected += 1;
          this.state.comboStreak += ent.kind === 'bigstar' ? 2 : 1;
          this.state.combo = Math.min(5, 1 + Math.floor(this.state.comboStreak / 5));
          const pts = ent.kind === 'bigstar' ? 20 : ent.kind === 'comet' ? 16 : 8;
          this.state.score += pts * this.state.combo;
          if (ent.kind === 'comet') this.state.magnetTimer = Math.max(this.state.magnetTimer, 0.85);
          this.spawnTrailParticles(ent.x, ent.y, ent.kind === 'bigstar' ? 24 : 12, true);
          if (ent.kind === 'bigstar') {
            this.pushParticle({
              x: ent.x,
              y: ent.y,
              vx: 0,
              vy: 0,
              life: 0,
              maxLife: 0.4,
              size: 14,
              maxSize: 58,
              color: '#fde047',
              shape: 'ring',
            });
          }
          events.collectedStar = true;
          this.state.entities.splice(i, 1);
          continue;
        }
      }

      if (ent.x < -36) {
        if (ent.kind === 'star' || ent.kind === 'bigstar' || ent.kind === 'comet') {
          this.state.comboStreak = Math.max(0, this.state.comboStreak - 4);
          this.state.combo = Math.min(5, 1 + Math.floor(this.state.comboStreak / 5));
        }
        this.state.entities.splice(i, 1);
      }
    }

    for (let i = this.state.particles.length - 1; i >= 0; i--) {
      const p = this.state.particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life >= p.maxLife) this.state.particles.splice(i, 1);
    }

    const allSpawned = this.pendingSpawns.every((sp) => sp.spawned);
    if (allSpawned && (this.state.entities.length === 0 || this.waveElapsed >= maxDelay + 3.2)) {
      this.state.score += 12 + Math.min(28, this.state.wave * 4);
      this.beginWave(this.state.wave + 1);
      events.waveAdvanced = true;
    }

    return events;
  }
}
