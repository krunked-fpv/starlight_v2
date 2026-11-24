import type {
  BiomeColorGrade,
  BiomeId,
  Direction,
  OverworldBiomeDescriptor,
  OverworldLandmark,
  OverworldMapData,
  OverworldProp,
  OverworldTileKind,
} from '../../contracts';

export const BIOME_DESCRIPTORS: Record<BiomeId, OverworldBiomeDescriptor> = {
  'starlight-village': {
    id: 'starlight-village',
    name: 'Starlight Village',
    subtitle: 'Cozy Lantern Harbor & Observatory Hub',
    elementalType: 'normal',
    gridCol: 2,
    gridRow: 2,
    guardianSpeciesId: 133,
    guardianName: 'Eevee',
    wildSpeciesIds: [25, 133, 39, 175, 572],
    groundHex: '#4f7d58',
    grassHex: '#3f6e49',
    waterShallowHex: '#3aa6d6',
    waterDeepHex: '#184e82',
    cliffHex: '#6c5a4e',
    accentHex: '#ffd479',
    propKind: 'lantern-post',
    ambientTag: 'warm-twilight',
  },
  meadow: {
    id: 'meadow',
    name: 'Sunlit Clover Meadow',
    subtitle: 'Breezy Wildflower Plains',
    elementalType: 'normal',
    gridCol: 2,
    gridRow: 1,
    guardianSpeciesId: 143,
    guardianName: 'Snorlax',
    wildSpeciesIds: [133, 16, 161, 300, 831],
    groundHex: '#69a653',
    grassHex: '#4f8f3d',
    waterShallowHex: '#4bc2e3',
    waterDeepHex: '#206ea3',
    cliffHex: '#8a7357',
    accentHex: '#fff3a8',
    propKind: 'blossom-tree',
    ambientTag: 'sunlit-breeze',
  },
  'verdant-canopy': {
    id: 'verdant-canopy',
    name: 'Whispering Emerald Canopy',
    subtitle: 'Dappled Sunbeam Old-Growth',
    elementalType: 'grass',
    gridCol: 1,
    gridRow: 1,
    guardianSpeciesId: 3,
    guardianName: 'Venusaur',
    wildSpeciesIds: [1, 152, 252, 722, 906],
    groundHex: '#38784b',
    grassHex: '#255c37',
    waterShallowHex: '#35a397',
    waterDeepHex: '#165257',
    cliffHex: '#594b3d',
    accentHex: '#7ef29d',
    propKind: 'pine',
    ambientTag: 'forest-sunbeams',
  },
  'ember-caldera': {
    id: 'ember-caldera',
    name: 'Cindercrest Caldera',
    subtitle: 'Glowing Basalt Thermal Springs',
    elementalType: 'fire',
    gridCol: 3,
    gridRow: 1,
    guardianSpeciesId: 6,
    guardianName: 'Charizard',
    wildSpeciesIds: [4, 37, 155, 255, 909],
    groundHex: '#613c35',
    grassHex: '#8c4329',
    waterShallowHex: '#ff7b33',
    waterDeepHex: '#b32814',
    cliffHex: '#3d2522',
    accentHex: '#ff9f43',
    propKind: 'ember-vent',
    ambientTag: 'volcanic-embers',
  },
  'sapphire-lagoon': {
    id: 'sapphire-lagoon',
    name: 'Sapphire Coral Lagoon',
    subtitle: 'Starlit Reefs & Tidal Pools',
    elementalType: 'water',
    gridCol: 2,
    gridRow: 3,
    guardianSpeciesId: 658,
    guardianName: 'Greninja',
    wildSpeciesIds: [7, 131, 158, 258, 912],
    groundHex: '#d4be8d',
    grassHex: '#4ea885',
    waterShallowHex: '#38c7f0',
    waterDeepHex: '#12549c',
    cliffHex: '#756859',
    accentHex: '#7ef2ff',
    propKind: 'coral',
    ambientTag: 'coastal-surf',
  },
  'volt-highlands': {
    id: 'volt-highlands',
    name: 'Skythunder Spire Highlands',
    subtitle: 'Charged Quartz Plateaus',
    elementalType: 'electric',
    gridCol: 3,
    gridRow: 2,
    guardianSpeciesId: 1008,
    guardianName: 'Miraidon',
    wildSpeciesIds: [25, 179, 403, 777, 921],
    groundHex: '#57685e',
    grassHex: '#4a7554',
    waterShallowHex: '#4db8e8',
    waterDeepHex: '#1c4f8a',
    cliffHex: '#4f5569',
    accentHex: '#ffe052',
    propKind: 'crystal',
    ambientTag: 'static-storm',
  },
  'frost-glacier': {
    id: 'frost-glacier',
    name: 'Crystalline Borealis Glacier',
    subtitle: 'Mirror Ice & Polar Ribbons',
    elementalType: 'ice',
    gridCol: 1,
    gridRow: 0,
    guardianSpeciesId: 471,
    guardianName: 'Glaceon',
    wildSpeciesIds: [131, 215, 361, 471, 974],
    groundHex: '#b8dff0',
    grassHex: '#8bc4de',
    waterShallowHex: '#63d2f2',
    waterDeepHex: '#1f6b99',
    cliffHex: '#6e8ea8',
    accentHex: '#a3f7ff',
    propKind: 'crystal',
    ambientTag: 'aurora-frost',
  },
  'valor-dojo': {
    id: 'valor-dojo',
    name: 'Ironcrest Bamboo Terrace',
    subtitle: 'Misty Mountain Training Grounds',
    elementalType: 'fighting',
    gridCol: 0,
    gridRow: 2,
    guardianSpeciesId: 448,
    guardianName: 'Lucario',
    wildSpeciesIds: [66, 280, 447, 619, 852],
    groundHex: '#7a8a56',
    grassHex: '#4f7339',
    waterShallowHex: '#4cb5ba',
    waterDeepHex: '#1e5c6e',
    cliffHex: '#6b5748',
    accentHex: '#ff7d6b',
    propKind: 'bamboo',
    ambientTag: 'bamboo-mist',
  },
  'mire-bayou': {
    id: 'mire-bayou',
    name: 'Bioluminescent Spore Bayou',
    subtitle: 'Luminous Violet Marshlands',
    elementalType: 'poison',
    gridCol: 0,
    gridRow: 3,
    guardianSpeciesId: 94,
    guardianName: 'Gengar',
    wildSpeciesIds: [92, 169, 453, 757, 944],
    groundHex: '#453e59',
    grassHex: '#4e3569',
    waterShallowHex: '#7848ad',
    waterDeepHex: '#351b5c',
    cliffHex: '#372e45',
    accentHex: '#d07aff',
    propKind: 'spore-lantern',
    ambientTag: 'bioluminescent',
  },
  'ochre-canyon': {
    id: 'ochre-canyon',
    name: 'Amber Mesa Badlands',
    subtitle: 'Terracotta Arches & Starlight Sand',
    elementalType: 'ground',
    gridCol: 4,
    gridRow: 2,
    guardianSpeciesId: 445,
    guardianName: 'Garchomp',
    wildSpeciesIds: [104, 328, 443, 551, 980],
    groundHex: '#c4864b',
    grassHex: '#9e6c38',
    waterShallowHex: '#4fb0c6',
    waterDeepHex: '#1f6482',
    cliffHex: '#8c4c2b',
    accentHex: '#ffd185',
    propKind: 'boulder',
    ambientTag: 'desert-dusk',
  },
  'zephyr-peaks': {
    id: 'zephyr-peaks',
    name: 'Cloudstep Zephyr Cliffs',
    subtitle: 'Sky-Hop Launch Promontory',
    elementalType: 'flying',
    gridCol: 2,
    gridRow: 0,
    guardianSpeciesId: 249,
    guardianName: 'Lugia',
    wildSpeciesIds: [18, 276, 396, 661, 823],
    groundHex: '#7d9e89',
    grassHex: '#5c8c71',
    waterShallowHex: '#7ec8f2',
    waterDeepHex: '#3d79bd',
    cliffHex: '#798599',
    accentHex: '#b8e2ff',
    propKind: 'cloud-stone',
    ambientTag: 'sky-aurora',
  },
  'astral-ruins': {
    id: 'astral-ruins',
    name: 'Astral Prism Sanctuary',
    subtitle: 'Floating Star-Carved Monoliths',
    elementalType: 'psychic',
    gridCol: 3,
    gridRow: 0,
    guardianSpeciesId: 151,
    guardianName: 'Mew',
    wildSpeciesIds: [196, 282, 374, 778, 956],
    groundHex: '#574c7d',
    grassHex: '#6c4b8f',
    waterShallowHex: '#8d72e1',
    waterDeepHex: '#3a247a',
    cliffHex: '#40385e',
    accentHex: '#ff7ec3',
    propKind: 'ruin-pillar',
    ambientTag: 'astral-shimmer',
  },
  'amber-thicket': {
    id: 'amber-thicket',
    name: 'Lanternmoss Amber Thicket',
    subtitle: 'Firefly Groves & Honeyed Bark',
    elementalType: 'bug',
    gridCol: 0,
    gridRow: 1,
    guardianSpeciesId: 637,
    guardianName: 'Volcarona',
    wildSpeciesIds: [12, 123, 214, 636, 919],
    groundHex: '#658038',
    grassHex: '#4b6b23',
    waterShallowHex: '#54b098',
    waterDeepHex: '#20635d',
    cliffHex: '#5e4b30',
    accentHex: '#d4ff66',
    propKind: 'blossom-tree',
    ambientTag: 'firefly-grove',
  },
  'basalt-quarry': {
    id: 'basalt-quarry',
    name: 'Starstone Basalt Ridge',
    subtitle: 'Meteorite Veins & Terraced Stone',
    elementalType: 'rock',
    gridCol: 4,
    gridRow: 1,
    guardianSpeciesId: 248,
    guardianName: 'Tyranitar',
    wildSpeciesIds: [95, 246, 304, 744, 932],
    groundHex: '#8a7c66',
    grassHex: '#6e6552',
    waterShallowHex: '#4f9bb5',
    waterDeepHex: '#235270',
    cliffHex: '#594e3f',
    accentHex: '#f5dc9b',
    propKind: 'boulder',
    ambientTag: 'quarry-dust',
  },
  'mist-hollow': {
    id: 'mist-hollow',
    name: 'Wispveil Twilight Hollow',
    subtitle: 'Lantern-Lit Fog & Ancient Pines',
    elementalType: 'ghost',
    gridCol: 1,
    gridRow: 3,
    guardianSpeciesId: 887,
    guardianName: 'Dragapult',
    wildSpeciesIds: [93, 355, 607, 778, 971],
    groundHex: '#3c3b5c',
    grassHex: '#302f52',
    waterShallowHex: '#6063b5',
    waterDeepHex: '#23245e',
    cliffHex: '#2b2942',
    accentHex: '#a394ff',
    propKind: 'spore-lantern',
    ambientTag: 'twilight-mist',
  },
  'drake-summit': {
    id: 'drake-summit',
    name: 'Celestial Wyrm Summit',
    subtitle: 'Starlit Peak Above the Clouds',
    elementalType: 'dragon',
    gridCol: 4,
    gridRow: 0,
    guardianSpeciesId: 384,
    guardianName: 'Rayquaza',
    wildSpeciesIds: [147, 371, 443, 704, 996],
    groundHex: '#4b5582',
    grassHex: '#3b4a78',
    waterShallowHex: '#5c8cff',
    waterDeepHex: '#233a8a',
    cliffHex: '#353a5c',
    accentHex: '#8ca8ff',
    propKind: 'ruin-pillar',
    ambientTag: 'starlit-peak',
  },
  'eclipse-crag': {
    id: 'eclipse-crag',
    name: 'Umbral Eclipse Crag',
    subtitle: 'Obsidian Spires & Silver Moonpools',
    elementalType: 'dark',
    gridCol: 3,
    gridRow: 3,
    guardianSpeciesId: 197,
    guardianName: 'Umbreon',
    wildSpeciesIds: [197, 215, 359, 570, 983],
    groundHex: '#353042',
    grassHex: '#2a2438',
    waterShallowHex: '#564d78',
    waterDeepHex: '#1f1a33',
    cliffHex: '#221d2e',
    accentHex: '#c8b8ff',
    propKind: 'crystal',
    ambientTag: 'moonlit-crag',
  },
  'aegis-foundry': {
    id: 'aegis-foundry',
    name: 'Aegis Clockwork Forge',
    subtitle: 'Gilded Gears & Steaming Canals',
    elementalType: 'steel',
    gridCol: 4,
    gridRow: 3,
    guardianSpeciesId: 376,
    guardianName: 'Metagross',
    wildSpeciesIds: [81, 212, 374, 681, 959],
    groundHex: '#697887',
    grassHex: '#516273',
    waterShallowHex: '#5aa7c7',
    waterDeepHex: '#234c6b',
    cliffHex: '#43505e',
    accentHex: '#a8e4ff',
    propKind: 'gear-spire',
    ambientTag: 'foundry-sparks',
  },
  'starbloom-glade': {
    id: 'starbloom-glade',
    name: 'Starbloom Moonlit Glade',
    subtitle: 'Sakura Petals & Fairy Pools',
    elementalType: 'fairy',
    gridCol: 1,
    gridRow: 2,
    guardianSpeciesId: 282,
    guardianName: 'Gardevoir',
    wildSpeciesIds: [39, 175, 280, 700, 957],
    groundHex: '#5f8a74',
    grassHex: '#4a7a69',
    waterShallowHex: '#70c4e8',
    waterDeepHex: '#335d99',
    cliffHex: '#6e5c73',
    accentHex: '#ffa8e2',
    propKind: 'blossom-tree',
    ambientTag: 'petal-glow',
  },
};

export const BIOME_COLOR_GRADES: Record<BiomeId, BiomeColorGrade> = {
  'starlight-village': { biomeId: 'starlight-village', ambientRgb: [0.68, 0.72, 0.88], ambientStrength: 0.72, tintRgb: [1.03, 0.98, 0.92], contrast: 1.06, saturation: 1.12, bloomIntensity: 0.42, bloomThreshold: 0.7, vignetteStrength: 0.28, skyTopHex: '#10183d', skyHorizonHex: '#3b4f8c', starlightGlow: 0.85 },
  meadow: { biomeId: 'meadow', ambientRgb: [0.95, 0.94, 0.86], ambientStrength: 0.88, tintRgb: [1.04, 1.02, 0.95], contrast: 1.04, saturation: 1.14, bloomIntensity: 0.28, bloomThreshold: 0.78, vignetteStrength: 0.18, skyTopHex: '#2b6cb0', skyHorizonHex: '#88d4f2', starlightGlow: 0.35 },
  'verdant-canopy': { biomeId: 'verdant-canopy', ambientRgb: [0.72, 0.88, 0.76], ambientStrength: 0.76, tintRgb: [0.94, 1.05, 0.96], contrast: 1.08, saturation: 1.16, bloomIntensity: 0.36, bloomThreshold: 0.72, vignetteStrength: 0.32, skyTopHex: '#153b3b', skyHorizonHex: '#3c8568', starlightGlow: 0.5 },
  'ember-caldera': { biomeId: 'ember-caldera', ambientRgb: [0.96, 0.66, 0.54], ambientStrength: 0.72, tintRgb: [1.1, 0.94, 0.86], contrast: 1.12, saturation: 1.18, bloomIntensity: 0.52, bloomThreshold: 0.64, vignetteStrength: 0.35, skyTopHex: '#2b121e', skyHorizonHex: '#9c3626', starlightGlow: 0.45 },
  'sapphire-lagoon': { biomeId: 'sapphire-lagoon', ambientRgb: [0.78, 0.92, 1.0], ambientStrength: 0.86, tintRgb: [0.94, 1.02, 1.08], contrast: 1.05, saturation: 1.15, bloomIntensity: 0.38, bloomThreshold: 0.72, vignetteStrength: 0.2, skyTopHex: '#123e73', skyHorizonHex: '#52c4e8', starlightGlow: 0.65 },
  'volt-highlands': { biomeId: 'volt-highlands', ambientRgb: [0.84, 0.84, 0.96], ambientStrength: 0.74, tintRgb: [1.02, 1.0, 0.92], contrast: 1.1, saturation: 1.15, bloomIntensity: 0.48, bloomThreshold: 0.66, vignetteStrength: 0.3, skyTopHex: '#161b47', skyHorizonHex: '#4b5a94', starlightGlow: 0.78 },
  'frost-glacier': { biomeId: 'frost-glacier', ambientRgb: [0.82, 0.94, 1.0], ambientStrength: 0.85, tintRgb: [0.93, 1.02, 1.1], contrast: 1.07, saturation: 1.1, bloomIntensity: 0.46, bloomThreshold: 0.7, vignetteStrength: 0.22, skyTopHex: '#0f2847', skyHorizonHex: '#55b5d9', starlightGlow: 0.88 },
  'valor-dojo': { biomeId: 'valor-dojo', ambientRgb: [0.92, 0.84, 0.78], ambientStrength: 0.82, tintRgb: [1.05, 0.97, 0.92], contrast: 1.07, saturation: 1.1, bloomIntensity: 0.3, bloomThreshold: 0.76, vignetteStrength: 0.25, skyTopHex: '#2b243b', skyHorizonHex: '#94625b', starlightGlow: 0.42 },
  'mire-bayou': { biomeId: 'mire-bayou', ambientRgb: [0.68, 0.56, 0.86], ambientStrength: 0.66, tintRgb: [0.98, 0.9, 1.08], contrast: 1.12, saturation: 1.2, bloomIntensity: 0.54, bloomThreshold: 0.62, vignetteStrength: 0.38, skyTopHex: '#170f2e', skyHorizonHex: '#4f2c73', starlightGlow: 0.82 },
  'ochre-canyon': { biomeId: 'ochre-canyon', ambientRgb: [0.98, 0.82, 0.66], ambientStrength: 0.84, tintRgb: [1.08, 0.98, 0.88], contrast: 1.08, saturation: 1.14, bloomIntensity: 0.34, bloomThreshold: 0.74, vignetteStrength: 0.24, skyTopHex: '#382038', skyHorizonHex: '#cf7c4e', starlightGlow: 0.4 },
  'zephyr-peaks': { biomeId: 'zephyr-peaks', ambientRgb: [0.85, 0.93, 1.0], ambientStrength: 0.88, tintRgb: [0.96, 1.01, 1.08], contrast: 1.05, saturation: 1.12, bloomIntensity: 0.4, bloomThreshold: 0.74, vignetteStrength: 0.2, skyTopHex: '#1a3875', skyHorizonHex: '#8ac8f5', starlightGlow: 0.72 },
  'astral-ruins': { biomeId: 'astral-ruins', ambientRgb: [0.76, 0.66, 0.98], ambientStrength: 0.68, tintRgb: [1.02, 0.93, 1.1], contrast: 1.11, saturation: 1.2, bloomIntensity: 0.55, bloomThreshold: 0.62, vignetteStrength: 0.34, skyTopHex: '#140e38', skyHorizonHex: '#6b3b8c', starlightGlow: 0.95 },
  'amber-thicket': { biomeId: 'amber-thicket', ambientRgb: [0.88, 0.92, 0.68], ambientStrength: 0.78, tintRgb: [1.04, 1.04, 0.9], contrast: 1.07, saturation: 1.16, bloomIntensity: 0.42, bloomThreshold: 0.7, vignetteStrength: 0.28, skyTopHex: '#1c2b24', skyHorizonHex: '#738c46', starlightGlow: 0.62 },
  'basalt-quarry': { biomeId: 'basalt-quarry', ambientRgb: [0.86, 0.82, 0.74], ambientStrength: 0.8, tintRgb: [1.04, 1.0, 0.94], contrast: 1.09, saturation: 1.06, bloomIntensity: 0.32, bloomThreshold: 0.76, vignetteStrength: 0.28, skyTopHex: '#212233', skyHorizonHex: '#7d6e5d', starlightGlow: 0.5 },
  'mist-hollow': { biomeId: 'mist-hollow', ambientRgb: [0.64, 0.66, 0.92], ambientStrength: 0.64, tintRgb: [0.92, 0.94, 1.1], contrast: 1.1, saturation: 1.15, bloomIntensity: 0.5, bloomThreshold: 0.64, vignetteStrength: 0.4, skyTopHex: '#0f102b', skyHorizonHex: '#3d3e78', starlightGlow: 0.9 },
  'drake-summit': { biomeId: 'drake-summit', ambientRgb: [0.7, 0.76, 0.98], ambientStrength: 0.72, tintRgb: [0.96, 0.98, 1.1], contrast: 1.1, saturation: 1.18, bloomIntensity: 0.52, bloomThreshold: 0.64, vignetteStrength: 0.32, skyTopHex: '#0b1033', skyHorizonHex: '#3b4e9e', starlightGlow: 0.96 },
  'eclipse-crag': { biomeId: 'eclipse-crag', ambientRgb: [0.58, 0.56, 0.76], ambientStrength: 0.6, tintRgb: [0.94, 0.92, 1.08], contrast: 1.14, saturation: 1.12, bloomIntensity: 0.48, bloomThreshold: 0.64, vignetteStrength: 0.42, skyTopHex: '#090717', skyHorizonHex: '#332854', starlightGlow: 0.92 },
  'aegis-foundry': { biomeId: 'aegis-foundry', ambientRgb: [0.82, 0.88, 0.94], ambientStrength: 0.78, tintRgb: [0.98, 1.0, 1.06], contrast: 1.09, saturation: 1.08, bloomIntensity: 0.44, bloomThreshold: 0.68, vignetteStrength: 0.28, skyTopHex: '#182230', skyHorizonHex: '#526b82', starlightGlow: 0.6 },
  'starbloom-glade': { biomeId: 'starbloom-glade', ambientRgb: [0.88, 0.78, 0.94], ambientStrength: 0.78, tintRgb: [1.05, 0.96, 1.06], contrast: 1.06, saturation: 1.18, bloomIntensity: 0.48, bloomThreshold: 0.66, vignetteStrength: 0.26, skyTopHex: '#1f1640', skyHorizonHex: '#8a529c', starlightGlow: 0.88 },
};

// Deterministic seeded PRNG for consistent biome layouts
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Maps an 8-neighbor bitmask (with diagonal gating) into the canonical 47-tile blob index (0..46).
 */
const BLOB_LOOKUP = new Map<number, number>();
(() => {
  const canonicalMasks = [
    0, 2, 8, 10, 11, 16, 18, 22, 24, 26, 27, 30, 31, 64, 66, 72, 74, 75, 80, 82, 86, 88, 90, 91,
    94, 95, 104, 106, 107, 120, 122, 123, 126, 127, 208, 210, 214, 216, 218, 219, 222, 223, 248,
    250, 251, 254, 255,
  ];
  canonicalMasks.forEach((m, idx) => BLOB_LOOKUP.set(m, idx));
})();

export function compute47BlobIndex(
  tiles: OverworldTileKind[],
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const kind = tiles[y * width + x];
  const same = (nx: number, ny: number): boolean => {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return true;
    const nk = tiles[ny * width + nx];
    if (kind === 'shallow-water' || kind === 'deep-water') {
      return nk === 'shallow-water' || nk === 'deep-water';
    }
    return nk === kind;
  };
  const n = same(x, y - 1);
  const s = same(x, y + 1);
  const w = same(x - 1, y);
  const e = same(x + 1, y);
  const nw = n && w && same(x - 1, y - 1);
  const ne = n && e && same(x + 1, y - 1);
  const sw = s && w && same(x - 1, y + 1);
  const se = s && e && same(x + 1, y + 1);

  const mask =
    (nw ? 1 : 0) |
    (n ? 2 : 0) |
    (ne ? 4 : 0) |
    (w ? 8 : 0) |
    (e ? 16 : 0) |
    (sw ? 32 : 0) |
    (s ? 64 : 0) |
    (se ? 128 : 0);

  return BLOB_LOOKUP.get(mask) ?? 46;
}

const mapCache = new Map<BiomeId, OverworldMapData>();

function findNeighbors(biomeId: BiomeId): Partial<Record<Direction, BiomeId>> {
  const target = BIOME_DESCRIPTORS[biomeId];
  const all = Object.values(BIOME_DESCRIPTORS);
  const findAt = (col: number, row: number): BiomeId | undefined =>
    all.find((b) => b.gridCol === col && b.gridRow === row)?.id;

  const neighbors: Partial<Record<Direction, BiomeId>> = {};
  const north = findAt(target.gridCol, target.gridRow - 1);
  const south = findAt(target.gridCol, target.gridRow + 1);
  const west = findAt(target.gridCol - 1, target.gridRow);
  const east = findAt(target.gridCol + 1, target.gridRow);
  if (north) neighbors.up = north;
  if (south) neighbors.down = south;
  if (west) neighbors.left = west;
  if (east) neighbors.right = east;
  return neighbors;
}

export function getOverworldMap(biomeId: BiomeId): OverworldMapData {
  const cached = mapCache.get(biomeId);
  if (cached) return cached;

  const width = 28;
  const height = 20;
  const tileSize = 48;
  const rng = mulberry32(hashString(`starlight-v2-map:${biomeId}`));
  const biome = BIOME_DESCRIPTORS[biomeId];
  const tiles: OverworldTileKind[] = new Array(width * height).fill('ground');

  const setTile = (x: number, y: number, k: OverworldTileKind) => {
    if (x >= 0 && y >= 0 && x < width && y < height) {
      tiles[y * width + x] = k;
    }
  };

  // Sculpt scenic island coastline on the south & east or lakes depending on biome
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Northern cliff escarpment with pass-through gate at x=12..15
      if (y <= 1 && (x < 12 || x > 15)) {
        setTile(x, y, 'cliff');
        continue;
      }
      if (y === 2 && (x < 5 || x > 22)) {
        setTile(x, y, 'cliff');
        continue;
      }
      // Southern translucent shoreline / lagoon
      const shoreCurve = height - 4 + Math.round(Math.sin(x * 0.35 + (biome.gridCol + 1)) * 1.4);
      if (y >= shoreCurve + 2) {
        setTile(x, y, 'deep-water');
      } else if (y >= shoreCurve) {
        setTile(x, y, 'shallow-water');
      } else if (y === shoreCurve - 1 && x >= 3 && x <= width - 4) {
        setTile(x, y, 'sand');
      }
    }
  }

  // Cobblestone promenade crossroad
  for (let x = 2; x < width - 2; x++) {
    setTile(x, 10, 'cobble');
    setTile(x, 11, 'cobble');
  }
  for (let y = 2; y < height - 4; y++) {
    setTile(13, y, 'cobble');
    setTile(14, y, 'cobble');
  }
  // Wooden boardwalk bridge extending into the starlight water
  for (let y = height - 5; y < height - 1; y++) {
    setTile(13, y, 'bridge');
    setTile(14, y, 'bridge');
  }

  // Central plaza
  for (let y = 8; y <= 12; y++) {
    for (let x = 11; x <= 16; x++) {
      setTile(x, y, 'plaza');
    }
  }

  // Lush tall-grass patches for footstep-parting & wild encounters
  const grassZones: Array<[number, number, number, number]> = [
    [3, 4, 9, 8],
    [18, 4, 24, 8],
    [4, 12, 9, 14],
    [18, 12, 23, 14],
  ];
  for (const [x0, y0, x1, y1] of grassZones) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (tiles[y * width + x] === 'ground' && rng() > 0.14) {
          setTile(x, y, 'tall-grass');
        }
      }
    }
  }

  // Flowerbeds near roads
  for (let x = 9; x <= 18; x++) {
    if (tiles[7 * width + x] === 'ground' && (x === 10 || x === 17)) {
      setTile(x, 7, 'flowerbed');
    }
  }

  // Landmarks
  const landmarks: OverworldLandmark[] = [];
  if (biomeId === 'starlight-village') {
    landmarks.push(
      {
        id: 'village-fountain',
        kind: 'fountain',
        biomeId,
        tileX: 13,
        tileY: 9,
        widthTiles: 2,
        heightTiles: 2,
        label: 'Starlight Healing Fountain',
        subtitle: 'Restores Party HP & Composure',
        emissiveHex: '#7be8ff',
        lightRadius: 210,
      },
      {
        id: 'village-cottage-west',
        kind: 'cottage',
        biomeId,
        tileX: 6,
        tileY: 5,
        widthTiles: 3,
        heightTiles: 3,
        label: 'Voyager Cottage',
        subtitle: 'Warm Lantern Home',
        emissiveHex: '#ffcf70',
        lightRadius: 220,
      },
      {
        id: 'village-studio',
        kind: 'studio',
        biomeId,
        tileX: 19,
        tileY: 5,
        widthTiles: 3,
        heightTiles: 3,
        label: 'Style Studio Boutique',
        subtitle: 'Outfits, Capes & Glowing Auras',
        emissiveHex: '#ff96d5',
        lightRadius: 210,
      },
      {
        id: 'village-observatory',
        kind: 'observatory',
        biomeId,
        tileX: 12,
        tileY: 3,
        widthTiles: 4,
        heightTiles: 3,
        label: 'Celestial Observatory',
        subtitle: '1,025 Pokédex & Sky-Hop Launch',
        emissiveHex: '#96b8ff',
        lightRadius: 240,
      },
      {
        id: 'village-sign',
        kind: 'signpost',
        biomeId,
        tileX: 16,
        tileY: 11,
        widthTiles: 1,
        heightTiles: 1,
        label: 'Starlight Island Waypost',
        subtitle: 'North: Clover Meadow • South: Sapphire Lagoon',
        emissiveHex: '#ffd479',
        lightRadius: 110,
      },
      {
        id: 'village-starfall',
        kind: 'starfall',
        biomeId,
        tileX: 22,
        tileY: 12,
        widthTiles: 1,
        heightTiles: 1,
        label: 'Starfall Shimmer Node',
        subtitle: 'Gather Star Shards & Rare Signal',
        emissiveHex: '#fff08a',
        lightRadius: 180,
      },
      {
        id: 'village-chest',
        kind: 'chest',
        biomeId,
        tileX: 5,
        tileY: 12,
        widthTiles: 1,
        heightTiles: 1,
        label: 'Harbor Supply Chest',
        subtitle: 'Star Balls & Potions',
        emissiveHex: '#ffd166',
        lightRadius: 135,
      },
    );
  } else {
    landmarks.push(
      {
        id: `${biomeId}-shrine`,
        kind: 'shrine',
        biomeId,
        tileX: 13,
        tileY: 4,
        widthTiles: 2,
        heightTiles: 2,
        label: `${biome.name} Shrine`,
        subtitle: `Challenge Guardian ${biome.guardianName}`,
        elementalType: biome.elementalType,
        emissiveHex: biome.accentHex,
        lightRadius: 250,
      },
      {
        id: `${biomeId}-fountain`,
        kind: 'fountain',
        biomeId,
        tileX: 13,
        tileY: 9,
        widthTiles: 2,
        heightTiles: 2,
        label: 'Wayfarer Healing Spring',
        subtitle: 'Restores Party HP & Composure',
        emissiveHex: '#7be8ff',
        lightRadius: 195,
      },
      {
        id: `${biomeId}-chest`,
        kind: 'chest',
        biomeId,
        tileX: 6,
        tileY: 6,
        widthTiles: 1,
        heightTiles: 1,
        label: 'Relic Treasure Chest',
        subtitle: 'Star Balls & Star Shards',
        emissiveHex: '#ffd479',
        lightRadius: 140,
      },
      {
        id: `${biomeId}-starfall`,
        kind: 'starfall',
        biomeId,
        tileX: 21,
        tileY: 6,
        widthTiles: 1,
        heightTiles: 1,
        label: 'Starfall Shimmer Node',
        subtitle: 'Luminous Rare Encounter Beacon',
        emissiveHex: biome.accentHex,
        lightRadius: 190,
      },
      {
        id: `${biomeId}-sign`,
        kind: 'signpost',
        biomeId,
        tileX: 16,
        tileY: 11,
        widthTiles: 1,
        heightTiles: 1,
        label: `${biome.name} Trail Marker`,
        subtitle: biome.subtitle,
        emissiveHex: '#ffd479',
        lightRadius: 115,
      },
    );
  }

  // Clear tall grass under landmarks so buildings & shrines sit cleanly on ground/plaza
  for (const lm of landmarks) {
    for (let dy = -1; dy <= lm.heightTiles; dy++) {
      for (let dx = -1; dx <= lm.widthTiles; dx++) {
        const tx = lm.tileX + dx;
        const ty = lm.tileY + dy;
        if (tx >= 0 && ty >= 0 && tx < width && ty < height && tiles[ty * width + tx] === 'tall-grass') {
          tiles[ty * width + tx] = 'ground';
        }
      }
    }
  }

  // Biome signature micro-props
  const props: OverworldProp[] = [];
  const candidateCoords: Array<[number, number]> = [
    [2, 4], [3, 9], [10, 4], [17, 4], [24, 5], [25, 9],
    [2, 13], [10, 13], [17, 13], [24, 13], [8, 3], [19, 3],
    [11, 14], [16, 14],
  ];
  candidateCoords.forEach(([px, py], i) => {
    const t = tiles[py * width + px];
    if (t === 'ground' || t === 'sand' || t === 'flowerbed') {
      props.push({
        id: `${biomeId}-prop-${i}`,
        biomeId,
        kind: biome.propKind,
        tileX: px,
        tileY: py,
        scale: 0.85 + rng() * 0.35,
        swayPhase: rng() * Math.PI * 2,
        glowHex: i % 2 === 0 ? biome.accentHex : undefined,
      });
    }
  });

  // Compute 47-tile blob autotile masks
  const autotileMasks = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      autotileMasks[y * width + x] = compute47BlobIndex(tiles, width, height, x, y);
    }
  }

  const mapData: OverworldMapData = {
    biomeId,
    width,
    height,
    tileSize,
    tiles,
    autotileMasks,
    landmarks,
    props,
    spawnX: 13.5,
    spawnY: 11.4,
    neighbors: findNeighbors(biomeId),
  };

  mapCache.set(biomeId, mapData);
  return mapData;
}
