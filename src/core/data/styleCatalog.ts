import type { AuraId, CapeId, HeadgearId, OutfitId } from '../../contracts';

export interface StyleOptionMeta<T extends string> {
  id: T;
  name: string;
  description: string;
  primaryHex: string;
  secondaryHex: string;
  lightRgb?: [number, number, number];
  lightRadius?: number;
  lightIntensity?: number;
}

export const STYLE_OUTFITS: StyleOptionMeta<OutfitId>[] = [
  { id: 'voyager', name: 'Starlight Voyager', description: 'Tailored indigo coat with brass astrolabe clasps.', primaryHex: '#3c5aa6', secondaryHex: '#ffd166' },
  { id: 'astral-robe', name: 'Astral Observatory Robe', description: 'Midnight velvet tunic lined with constellation trim.', primaryHex: '#4f359b', secondaryHex: '#8cecff' },
  { id: 'ranger-coat', name: 'Canopy Ranger Coat', description: 'Weatherproof emerald field jacket for island treks.', primaryHex: '#247a56', secondaryHex: '#d9b45b' },
  { id: 'solstice-tunic', name: 'Solstice Ember Tunic', description: 'Warm crimson festival weave spun with gold thread.', primaryHex: '#c43e3b', secondaryHex: '#ffcf70' },
  { id: 'aegis-jacket', name: 'Aegis Foundry Jacket', description: 'Brushed silver armor-cloth forged at Clockwork Ridge.', primaryHex: '#637c94', secondaryHex: '#7be8ff' },
];

export const STYLE_CAPES: StyleOptionMeta<CapeId>[] = [
  { id: 'none', name: 'No Cape', description: 'Classic streamlined explorer silhouette.', primaryHex: '#4a5568', secondaryHex: '#94a3b8' },
  { id: 'starweave', name: 'Starweave Mantle', description: 'Billowing celestial cloak speckled with micro-stars.', primaryHex: '#25316d', secondaryHex: '#ffe082' },
  { id: 'zephyr-mantle', name: 'Zephyr Silk Scarf', description: 'Airy turquoise streamer that trails behind every step.', primaryHex: '#22a6b3', secondaryHex: '#c7ecee' },
  { id: 'cinder-cloak', name: 'Cindercrest Drape', description: 'Woven caldera cape edged with glowing embers.', primaryHex: '#b33939', secondaryHex: '#ffbe76' },
  { id: 'prism-shawl', name: 'Borealis Prism Shawl', description: 'Iridescent frosted silk catching twilight light.', primaryHex: '#7ed6df', secondaryHex: '#f8a5c2' },
];

export const STYLE_HEADGEAR: StyleOptionMeta<HeadgearId>[] = [
  { id: 'none', name: 'Bare Head', description: 'Natural breeze through your hair.', primaryHex: '#64748b', secondaryHex: '#cbd5e1' },
  { id: 'star-beret', name: 'Starlight Beret', description: 'Velvet navigator cap pinned with a golden star.', primaryHex: '#31448f', secondaryHex: '#ffd966' },
  { id: 'sky-goggles', name: 'Sky-Hop Goggles', description: 'Brass-rimmed aviator lenses built for aurora flights.', primaryHex: '#c98932', secondaryHex: '#68e1fd' },
  { id: 'lunar-circlet', name: 'Lunar Crescent Circlet', description: 'Silver crescent crown worn by shrine keepers.', primaryHex: '#cbd5e1', secondaryHex: '#a5b4fc' },
  { id: 'shrine-visor', name: 'Aegis Shrine Visor', description: 'Crystalline tactical visor for high-energy battles.', primaryHex: '#475569', secondaryHex: '#5eead4' },
];

export const STYLE_AURAS: StyleOptionMeta<AuraId>[] = [
  { id: 'none', name: 'No Aura', description: 'Natural ambient lighting only.', primaryHex: '#475569', secondaryHex: '#94a3b8' },
  {
    id: 'starlight',
    name: 'Starlight Halo',
    description: 'Warm golden-cyan starlight illuminating nearby tiles & water.',
    primaryHex: '#ffe082',
    secondaryHex: '#7be8ff',
    lightRgb: [1.0, 0.88, 0.56],
    lightRadius: 175,
    lightIntensity: 1.15,
  },
  {
    id: 'sky-thunder',
    name: 'Sky Thunder Aura',
    description: 'Crackling golden-electric field lighting surrounding foliage.',
    primaryHex: '#ffd93d',
    secondaryHex: '#60c8ff',
    lightRgb: [1.0, 0.9, 0.35],
    lightRadius: 190,
    lightIntensity: 1.28,
  },
  {
    id: 'aurora',
    name: 'Borealis Aurora',
    description: 'Drifting emerald-violet polar ribbons radiating cool glow.',
    primaryHex: '#4ef2c2',
    secondaryHex: '#b388ff',
    lightRgb: [0.42, 0.96, 0.85],
    lightRadius: 185,
    lightIntensity: 1.18,
  },
  {
    id: 'ember-crown',
    name: 'Ember Crown',
    description: 'Dancing hearth-fire sparks casting cozy amber warmth.',
    primaryHex: '#ff7b47',
    secondaryHex: '#ffd166',
    lightRgb: [1.0, 0.52, 0.25],
    lightRadius: 180,
    lightIntensity: 1.22,
  },
];

export const AURA_BY_ID: Record<AuraId, StyleOptionMeta<AuraId>> = Object.fromEntries(
  STYLE_AURAS.map((a) => [a.id, a]),
) as Record<AuraId, StyleOptionMeta<AuraId>>;
