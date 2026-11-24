import {
  BIOME_IDS,
  ELEMENTAL_TYPES,
  type BiomeId,
  type BodyArchetype,
  type ElementalType,
  type PartyMember,
  type SpeciesRecord,
} from '../../contracts';
import { SIGNATURE_MOVE_BY_TYPE, TYPE_PALETTES } from '../data/typePalettes';

export const TOTAL_SPECIES_COUNT = 1025;

type CuratedSeed = [
  number,
  string,
  ElementalType,
  ElementalType | null,
  BodyArchetype,
  number, // gen
  number, // hp
  number, // atk
  number, // def
  number, // spd
  number?, // evolvesTo
  number?, // evolveLevel
  string?, // lore
];

// Iconic National Dex anchors spanning Generations 1 through 9 (1..1025)
const CURATED_SEEDS: CuratedSeed[] = [
  [1, 'Bulbasaur', 'grass', 'poison', 'quadruped', 1, 45, 49, 49, 45, 2, 16, 'Stores dappled canopy sunlight inside the luminous bulb on its back.'],
  [2, 'Ivysaur', 'grass', 'poison', 'quadruped', 1, 60, 62, 63, 60, 3, 32, 'Its blooming bud releases soothing starlit pollen across meadows.'],
  [3, 'Venusaur', 'grass', 'poison', 'quadruped', 1, 80, 82, 83, 80, undefined, undefined, 'Guardian of Whispering Emerald Canopy whose petals drink sunbeams.'],
  [4, 'Charmander', 'fire', null, 'biped', 1, 39, 52, 43, 65, 5, 16, 'Its lively tail flame flickers brighter near Starlight Island shrines.'],
  [5, 'Charmeleon', 'fire', null, 'biped', 1, 58, 64, 58, 80, 6, 36, 'Leaves glowing trails of embers when bounding across basalt ridges.'],
  [6, 'Charizard', 'fire', 'flying', 'draconic', 1, 78, 84, 78, 100, undefined, undefined, 'Soars above Cindercrest Caldera chasing aurora winds and starlight.'],
  [7, 'Squirtle', 'water', null, 'biped', 1, 44, 48, 65, 43, 8, 16, 'Skims effortlessly across Sapphire Lagoon surf foam.'],
  [8, 'Wartortle', 'water', null, 'biped', 1, 59, 63, 80, 58, 9, 36, 'Its feathered tail glitters with refracted starlight beneath the waves.'],
  [9, 'Blastoise', 'water', null, 'armored', 1, 79, 83, 100, 78, undefined, undefined, 'Pressurized tidal jets carve shimmering rainbows above coral shoals.'],
  [12, 'Butterfree', 'bug', 'flying', 'insectoid', 1, 60, 45, 50, 70, undefined, undefined, 'Scatters iridescent lantern scales throughout Amber Thicket.'],
  [16, 'Pidgey', 'normal', 'flying', 'avian', 1, 40, 45, 40, 56, 18, 18, 'Glides along warm afternoon updrafts over Sunlit Clover Meadow.'],
  [18, 'Pidgeot', 'normal', 'flying', 'avian', 1, 83, 80, 75, 101, undefined, undefined, 'Cuts clean slipstreams through Cloudstep Zephyr Cliffs.'],
  [25, 'Pikachu', 'electric', null, 'quadruped', 1, 45, 62, 45, 95, 26, 24, 'Channels Sky Thunder sparks that illuminate Starlight Village lanes.'],
  [26, 'Raichu', 'electric', null, 'biped', 1, 65, 90, 58, 110, undefined, undefined, 'Grounds storm-spire lightning through its gleaming crescent tail.'],
  [37, 'Vulpix', 'fire', null, 'quadruped', 1, 38, 41, 40, 65, 38, 26, 'Six curled ember tails radiate cozy campfire warmth at dusk.'],
  [38, 'Ninetales', 'fire', null, 'quadruped', 1, 73, 76, 75, 100, undefined, undefined, 'Mystical nine-tailed guardian woven into island folklore.'],
  [39, 'Jigglypuff', 'normal', 'fairy', 'ethereal', 1, 115, 45, 20, 20, undefined, undefined, 'Hums soft resonant lullabies beneath Starbloom Glade blossoms.'],
  [66, 'Machop', 'fighting', null, 'biped', 1, 70, 80, 50, 35, 68, 28, 'Hones steady Composure stance along Ironcrest Bamboo Terrace.'],
  [68, 'Machamp', 'fighting', null, 'biped', 1, 90, 130, 80, 55, undefined, undefined, 'Masters rhythmic strikes capable of shattering crystalline barriers.'],
  [81, 'Magnemite', 'electric', 'steel', 'crystalline', 1, 35, 45, 70, 45, 82, 30, 'Hovers cleanly above Clockwork Forge gears on magnetic currents.'],
  [82, 'Magneton', 'electric', 'steel', 'crystalline', 1, 55, 65, 95, 70, undefined, undefined, 'Linked cores emit synchronized auroral pulses across stormy ridges.'],
  [92, 'Gastly', 'ghost', 'poison', 'ethereal', 1, 30, 35, 30, 80, 93, 25, 'Drifts like violet lantern smoke through Bioluminescent Bayou.'],
  [93, 'Haunter', 'ghost', 'poison', 'ethereal', 1, 45, 50, 45, 95, 94, 36, 'Peers playfully from twilight mist around Wispveil Hollow shrines.'],
  [94, 'Gengar', 'ghost', 'poison', 'ethereal', 1, 60, 65, 60, 110, undefined, undefined, 'Shadow-lantern trickster that bends ambient glow into purple halos.'],
  [95, 'Onix', 'rock', 'ground', 'serpentine', 1, 35, 45, 160, 70, 208, 35, 'Coils through meteoritic Starstone Basalt Ridge caverns.'],
  [104, 'Cubone', 'ground', null, 'biped', 1, 50, 50, 95, 35, 105, 28, 'Watches constellations from high terracotta arches in Amber Mesa.'],
  [123, 'Scyther', 'bug', 'flying', 'insectoid', 1, 70, 110, 80, 105, 212, 32, 'Slices through sunbeams faster than the eye can track.'],
  [131, 'Lapras', 'water', 'ice', 'aquatic', 1, 130, 85, 80, 60, undefined, undefined, 'Carries island travelers serenely over star-reflecting lagoons.'],
  [133, 'Eevee', 'normal', null, 'quadruped', 1, 55, 55, 50, 55, 196, 20, 'Attuned to every Starlight Island shrine and elemental constellation.'],
  [134, 'Vaporeon', 'water', null, 'aquatic', 1, 130, 65, 60, 65, undefined, undefined, 'Dissolves seamlessly into translucent lagoon starlight ripples.'],
  [135, 'Jolteon', 'electric', null, 'quadruped', 1, 65, 65, 60, 130, undefined, undefined, 'Sprints across highland mesas leaving golden electric afterimages.'],
  [136, 'Flareon', 'fire', null, 'quadruped', 1, 65, 130, 60, 65, undefined, undefined, 'Radiates steady hearthlight during chilly mountain twilight.'],
  [143, 'Snorlax', 'normal', null, 'biped', 1, 160, 110, 65, 30, undefined, undefined, 'Naps peacefully beside Clover Meadow shrines, unshakably composed.'],
  [147, 'Dratini', 'dragon', null, 'serpentine', 1, 41, 64, 45, 50, 149, 30, 'Glides through cloud-veiled waterfalls below Celestial Wyrm Summit.'],
  [149, 'Dragonite', 'dragon', 'flying', 'draconic', 1, 91, 134, 95, 80, undefined, undefined, 'Guides lost sky-voyagers home through starlit aurora currents.'],
  [150, 'Mewtwo', 'psychic', null, 'biped', 1, 106, 110, 90, 130, undefined, undefined, 'Projects luminous prism fields capable of bending combat arenas.'],
  [151, 'Mew', 'psychic', null, 'ethereal', 1, 100, 100, 100, 100, undefined, undefined, 'Playful astral mirage glimpsed near floating sanctuary monoliths.'],
  [152, 'Chikorita', 'grass', null, 'quadruped', 2, 45, 49, 65, 45, 154, 24, 'Its leaf senses warm breezes drifting off Starlight Harbor.'],
  [155, 'Cyndaquil', 'fire', null, 'quadruped', 2, 39, 52, 43, 65, 157, 24, 'Curls comfortably near warm caldera vents and lantern posts.'],
  [158, 'Totodile', 'water', null, 'biped', 2, 50, 65, 64, 43, 160, 24, 'Splashes exuberantly through shallow tidepools at dawn.'],
  [175, 'Togepi', 'fairy', null, 'ethereal', 2, 35, 20, 65, 20, 468, 22, 'Radiates gentle starbloom joy that boosts party Bond.'],
  [179, 'Mareep', 'electric', null, 'quadruped', 2, 55, 40, 40, 35, 181, 24, 'Fluffy static wool softly lights highland footpaths at night.'],
  [196, 'Espeon', 'psychic', null, 'quadruped', 2, 65, 65, 60, 110, undefined, undefined, 'Forehead gem shimmers in resonance with Astral Prism Sanctuary.'],
  [197, 'Umbreon', 'dark', null, 'quadruped', 2, 95, 65, 110, 65, undefined, undefined, 'Luminous moonlit rings pulse brightly atop Umbral Eclipse Crag.'],
  [212, 'Scizor', 'bug', 'steel', 'armored', 2, 70, 130, 100, 65, undefined, undefined, 'Crimson forged carapace gleams under Clockwork Forge sparks.'],
  [214, 'Heracross', 'bug', 'fighting', 'insectoid', 2, 80, 125, 75, 85, undefined, undefined, 'Defends honeyed Amber Thicket trunks with poised strength.'],
  [215, 'Sneasel', 'dark', 'ice', 'biped', 2, 55, 95, 55, 115, 461, 30, 'Darts silently over frosted glass ledges under aurora skies.'],
  [246, 'Larvitar', 'rock', 'ground', 'biped', 2, 50, 64, 50, 41, 248, 34, 'Draws mineral vitality from fallen starstones in Basalt Ridge.'],
  [248, 'Tyranitar', 'rock', 'dark', 'armored', 2, 100, 134, 110, 61, undefined, undefined, 'Sovereign guardian of Starstone Basalt Ridge whose stride shakes cliffs.'],
  [249, 'Lugia', 'psychic', 'flying', 'draconic', 2, 106, 90, 130, 110, undefined, undefined, 'Wings calm raging aurora tempests across Cloudstep Zephyr Cliffs.'],
  [251, 'Celebi', 'psychic', 'grass', 'ethereal', 2, 100, 100, 100, 100, undefined, undefined, 'Weaves timeless verdant trails wherever Starfall seeds take root.'],
  [252, 'Treecko', 'grass', null, 'biped', 3, 40, 45, 35, 70, 254, 24, 'Perches calmly on sunbeam-dappled boughs watching the canopy.'],
  [255, 'Torchic', 'fire', null, 'avian', 3, 45, 60, 40, 45, 257, 24, 'Keeps a cozy golden ember warm inside its downy crest.'],
  [258, 'Mudkip', 'water', null, 'aquatic', 3, 50, 70, 50, 40, 260, 24, 'Head fin reads subtle currents in Starlight Harbor coves.'],
  [280, 'Ralts', 'psychic', 'fairy', 'ethereal', 3, 28, 25, 25, 40, 282, 24, 'Senses harmonious Trainer Bond across Starbloom Moonlit Glade.'],
  [282, 'Gardevoir', 'psychic', 'fairy', 'ethereal', 3, 68, 65, 65, 80, undefined, undefined, 'Weaves celestial prism barriers to protect its cherished partner.'],
  [304, 'Aron', 'steel', 'rock', 'armored', 3, 50, 70, 100, 30, 306, 30, 'Polishes its metallic shell against Clockwork Forge ore veins.'],
  [328, 'Trapinch', 'ground', null, 'insectoid', 3, 45, 100, 45, 10, 330, 30, 'Carves spiral star-traps in the warm sands of Amber Mesa.'],
  [359, 'Absol', 'dark', null, 'quadruped', 3, 65, 130, 60, 75, undefined, undefined, 'Appears on moonlit crags to warn travelers of incoming storms.'],
  [374, 'Beldum', 'steel', 'psychic', 'crystalline', 3, 40, 55, 80, 30, 376, 32, 'Floats via harmonic magnetic resonance near astral shrines.'],
  [376, 'Metagross', 'steel', 'psychic', 'armored', 3, 80, 135, 130, 70, undefined, undefined, 'Four linked minds compute flawless Composure tactics in battle.'],
  [384, 'Rayquaza', 'dragon', 'flying', 'serpentine', 3, 105, 150, 90, 95, undefined, undefined, 'Glides through the aurora above Celestial Wyrm Summit.'],
  [443, 'Gible', 'dragon', 'ground', 'draconic', 4, 58, 70, 45, 42, 445, 32, 'Burrows eagerly beneath warm terraced stone along Amber Mesa.'],
  [445, 'Garchomp', 'dragon', 'ground', 'draconic', 4, 108, 130, 95, 102, undefined, undefined, 'Cuts through canyon thermals with supersonic starlit momentum.'],
  [447, 'Riolu', 'fighting', null, 'biped', 4, 40, 70, 40, 60, 448, 22, 'Reads waves of Aura rippling across misty bamboo terraces.'],
  [448, 'Lucario', 'fighting', 'steel', 'biped', 4, 70, 110, 70, 90, undefined, undefined, 'Channels luminous Aura spheres that pierce Composure shields.'],
  [471, 'Glaceon', 'ice', null, 'quadruped', 4, 65, 60, 110, 65, undefined, undefined, 'Freezes twilight mist into diamond dust across Borealis Glacier.'],
  [493, 'Arceus', 'normal', null, 'crystalline', 4, 120, 120, 120, 120, undefined, undefined, 'Mythic architect of celestial rings reflected in Starlight Island lore.'],
  [570, 'Zorua', 'dark', null, 'quadruped', 5, 40, 65, 40, 65, 571, 30, 'Conjures playful twilight illusions around village signposts.'],
  [607, 'Litwick', 'ghost', 'fire', 'ethereal', 5, 50, 30, 55, 20, 609, 32, 'Cast soft cerulean-violet flame along Wispveil Hollow walkways.'],
  [636, 'Larvesta', 'bug', 'fire', 'insectoid', 5, 55, 85, 55, 60, 637, 36, 'Warms Amber Thicket glades with radiant solar-amber silk.'],
  [637, 'Volcarona', 'bug', 'fire', 'insectoid', 5, 85, 60, 65, 100, undefined, undefined, 'Golden lantern wings illuminate night skies like a miniature sun.'],
  [658, 'Greninja', 'water', 'dark', 'biped', 6, 72, 95, 67, 122, undefined, undefined, 'Forms gleaming star-water shuriken over Sapphire Coral Lagoon.'],
  [681, 'Aegislash', 'steel', 'ghost', 'armored', 6, 60, 140, 140, 60, undefined, undefined, 'Shifts seamlessly between Aegis defense and spectral blade strikes.'],
  [700, 'Sylveon', 'fairy', null, 'quadruped', 6, 95, 65, 65, 60, undefined, undefined, 'Trailing pastel ribbons soothe wild storms and lift team Composure.'],
  [722, 'Rowlet', 'grass', 'flying', 'avian', 7, 68, 55, 55, 42, 724, 24, 'Glides noiselessly beneath Emerald Canopy sunbeams at dusk.'],
  [778, 'Mimikyu', 'ghost', 'fairy', 'ethereal', 7, 55, 90, 80, 96, undefined, undefined, 'Admires Style Studio boutiques and dreams of matching outfits.'],
  [823, 'Corviknight', 'flying', 'steel', 'avian', 8, 98, 87, 105, 67, undefined, undefined, 'Ferries sky-travelers along windswept Zephyr Cliffs routes.'],
  [887, 'Dragapult', 'dragon', 'ghost', 'draconic', 8, 88, 120, 75, 142, undefined, undefined, 'Streaks past aurora ribbons with phantom velocity.'],
  [906, 'Sprigatito', 'grass', null, 'quadruped', 9, 40, 61, 54, 65, 908, 24, 'Leaves a crisp sweet-clover scent across Starlight Island trails.'],
  [909, 'Fuecoco', 'fire', null, 'biped', 9, 67, 45, 59, 36, 911, 24, 'Basks cheerfully on sun-warmed cobblestone tiles in the plaza.'],
  [912, 'Quaxly', 'water', null, 'avian', 9, 55, 65, 45, 50, 914, 24, 'Keeps its glossy crest immaculate with Sapphire Lagoon mist.'],
  [959, 'Tinkaton', 'fairy', 'steel', 'biped', 9, 85, 75, 77, 94, undefined, undefined, 'Forges starstone hammers inside Aegis Clockwork Forge.'],
  [983, 'Kingambit', 'dark', 'steel', 'armored', 9, 100, 135, 120, 50, undefined, undefined, 'Commands obsidian ridge duels with supreme tactical poise.'],
  [1007, 'Koraidon', 'fighting', 'dragon', 'draconic', 9, 100, 135, 115, 135, undefined, undefined, 'Apex winged sovereign bounding across sunlit island horizons.'],
  [1008, 'Miraidon', 'electric', 'dragon', 'draconic', 9, 100, 135, 100, 135, undefined, undefined, 'Channels shimmering photon lightning across Skythunder Spire.'],
  [1024, 'Terapagos', 'normal', null, 'crystalline', 9, 95, 95, 110, 85, undefined, undefined, 'Faceted astral shell refracts all 18 elemental spectrums into starlight.'],
  [1025, 'Pecharunt', 'poison', 'ghost', 'ethereal', 9, 88, 88, 160, 88, undefined, undefined, 'Rare nocturnal curiosity wrapped in iridescent amethyst mist.'],
];

const CURATED_MAP = new Map<number, CuratedSeed>(CURATED_SEEDS.map((s) => [s[0], s]));

const ARCHETYPES: BodyArchetype[] = [
  'quadruped',
  'biped',
  'avian',
  'serpentine',
  'aquatic',
  'crystalline',
  'ethereal',
  'insectoid',
  'draconic',
  'armored',
];

const CRY_SHAPES: Array<SpeciesRecord['cryShape']> = ['sine', 'triangle', 'sawtooth', 'square'];

const PREFIX_BY_TYPE: Record<ElementalType, string[]> = {
  normal: ['Clover', 'Breeze', 'Loom', 'Hearth', 'Fawn', 'Pip'],
  grass: ['Fern', 'Moss', 'Sylva', 'Bramble', 'Petal', 'Liana'],
  fire: ['Cinder', 'Pyro', 'Ember', 'Blaze', 'Scorch', 'Ignis'],
  water: ['Tide', 'Coral', 'Rill', 'Foam', 'Maris', 'Brine'],
  electric: ['Volt', 'Spark', 'Jolt', 'Arc', 'Zing', 'Fulgur'],
  ice: ['Frost', 'Rime', 'Glaci', 'Crystal', 'Sleet', 'Borea'],
  fighting: ['Valor', 'Kenshi', 'Brawl', 'Grit', 'Stride', 'Fist'],
  poison: ['Spore', 'Venin', 'Mire', 'Toxi', 'Nox', 'Vile'],
  ground: ['Mesa', 'Ochre', 'Terra', 'Dune', 'Loam', 'Quake'],
  flying: ['Zephyr', 'Plume', 'Gale', 'Aerie', 'Soar', 'Swift'],
  psychic: ['Astral', 'Prism', 'Luma', 'Aura', 'Esper', 'Nebul'],
  bug: ['Glim', 'Chitin', 'Moth', 'Nectar', 'Wing', 'Larv'],
  rock: ['Basalt', 'Cairn', 'Shard', 'Quartz', 'Crag', 'Slate'],
  ghost: ['Wisp', 'Shade', 'Veil', 'Phant', 'Gloom', 'Eerie'],
  dragon: ['Wyrm', 'Drako', 'Aether', 'Scale', 'Crest', 'Vyrn'],
  dark: ['Umbra', 'Nyx', 'Dusk', 'Noct', 'Eclip', 'Obsid'],
  steel: ['Aegis', 'Ferro', 'Cog', 'Gild', 'Anvil', 'Alloy'],
  fairy: ['Star', 'Fae', 'Moon', 'Lull', 'Pix', 'Bloom'],
};

const SUFFIXES = [
  'ling', 'kin', 'fox', 'wing', 'tail', 'fin', 'horn', 'sprite', 'crest', 'paw',
  'mane', 'gleam', 'shell', 'drake', 'wisp', 'flare', 'mite', 'stride', 'bloom', 'core',
];

const TYPE_TO_BIOME: Record<ElementalType, BiomeId> = {
  normal: 'meadow',
  grass: 'verdant-canopy',
  fire: 'ember-caldera',
  water: 'sapphire-lagoon',
  electric: 'volt-highlands',
  ice: 'frost-glacier',
  fighting: 'valor-dojo',
  poison: 'mire-bayou',
  ground: 'ochre-canyon',
  flying: 'zephyr-peaks',
  psychic: 'astral-ruins',
  bug: 'amber-thicket',
  rock: 'basalt-quarry',
  ghost: 'mist-hollow',
  dragon: 'drake-summit',
  dark: 'eclipse-crag',
  steel: 'aegis-foundry',
  fairy: 'starbloom-glade',
};

function genForId(id: number): number {
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

function buildSpeciesRecord(id: number): SpeciesRecord {
  const clamped = Math.max(1, Math.min(TOTAL_SPECIES_COUNT, Math.floor(id)));
  const curated = CURATED_MAP.get(clamped);
  const seed = Math.imul(clamped ^ 0x9e3779b1, 0x85ebca6b) >>> 0;

  let name: string;
  let primaryType: ElementalType;
  let secondaryType: ElementalType | null;
  let archetype: BodyArchetype;
  let generation: number;
  let baseHp: number;
  let baseAtk: number;
  let baseDef: number;
  let baseSpd: number;
  let evolvesTo: number | undefined;
  let evolveLevel: number | undefined;
  let lore: string;

  if (curated) {
    [
      ,
      name,
      primaryType,
      secondaryType,
      archetype,
      generation,
      baseHp,
      baseAtk,
      baseDef,
      baseSpd,
      evolvesTo,
      evolveLevel,
    ] = curated;
    lore = curated[12] ?? `Native to Starlight Island's ${TYPE_TO_BIOME[primaryType].replace('-', ' ')} expanse.`;
  } else {
    primaryType = ELEMENTAL_TYPES[seed % ELEMENTAL_TYPES.length];
    const hasSecondary = (seed >>> 5) % 3 === 0;
    const secCandidate = ELEMENTAL_TYPES[((seed >>> 8) + 3) % ELEMENTAL_TYPES.length];
    secondaryType = hasSecondary && secCandidate !== primaryType ? secCandidate : null;
    archetype = ARCHETYPES[(seed >>> 12) % ARCHETYPES.length];
    generation = genForId(clamped);
    const prefixes = PREFIX_BY_TYPE[primaryType];
    const p = prefixes[(seed >>> 4) % prefixes.length];
    const s = SUFFIXES[(seed >>> 16) % SUFFIXES.length];
    name = `${p}${s}`;
    baseHp = 48 + ((seed >>> 3) % 62);
    baseAtk = 46 + ((seed >>> 9) % 68);
    baseDef = 44 + ((seed >>> 15) % 66);
    baseSpd = 42 + ((seed >>> 21) % 72);
    if (clamped < TOTAL_SPECIES_COUNT && clamped % 3 === 1 && !CURATED_MAP.has(clamped + 1)) {
      evolvesTo = clamped + 1;
      evolveLevel = 22;
    }
    lore = `Starlight Island catalog #${String(clamped).padStart(4, '0')} thriving across ${TYPE_TO_BIOME[primaryType].replace('-', ' ')} landscapes.`;
  }

  const primaryPalette = TYPE_PALETTES[primaryType];
  const secondaryPalette = secondaryType ? TYPE_PALETTES[secondaryType] : primaryPalette;
  const habitat = TYPE_TO_BIOME[primaryType] ?? BIOME_IDS[1];

  const signatureMoves = [
    SIGNATURE_MOVE_BY_TYPE[primaryType],
    secondaryType ? SIGNATURE_MOVE_BY_TYPE[secondaryType] : 'starlight-pulse',
    'astral-guard',
    primaryType === 'electric' ? 'zephyr-dive' : 'sky-thunder',
  ].filter((v, idx, arr) => arr.indexOf(v) === idx);
  while (signatureMoves.length < 4) {
    signatureMoves.push('starlight-pulse');
  }

  return {
    id: clamped,
    name,
    primaryType,
    secondaryType,
    archetype,
    generation,
    baseHp,
    baseAtk,
    baseDef,
    baseSpd,
    habitat,
    evolvesTo,
    evolveLevel,
    signatureMoves: signatureMoves.slice(0, 4),
    cryBaseHz: 185 + ((seed % 420) * 0.9),
    cryModHz: 4 + ((seed >>> 7) % 18),
    cryShape: CRY_SHAPES[(seed >>> 11) % CRY_SHAPES.length],
    lore,
    palette: [primaryPalette.primary, secondaryPalette.secondary, primaryPalette.glow],
  };
}

let cachedCatalog: SpeciesRecord[] | null = null;

export function getAllSpecies(): readonly SpeciesRecord[] {
  if (!cachedCatalog) {
    cachedCatalog = new Array<SpeciesRecord>(TOTAL_SPECIES_COUNT);
    for (let i = 1; i <= TOTAL_SPECIES_COUNT; i++) {
      cachedCatalog[i - 1] = buildSpeciesRecord(i);
    }
  }
  return cachedCatalog;
}

export function getSpecies(id: number): SpeciesRecord {
  const catalog = getAllSpecies();
  const idx = Math.max(1, Math.min(TOTAL_SPECIES_COUNT, Math.floor(id))) - 1;
  return catalog[idx];
}

export function searchSpecies(options: {
  query?: string;
  type?: ElementalType | 'all';
  generation?: number | 'all';
  limit?: number;
}): SpeciesRecord[] {
  const q = (options.query ?? '').trim().toLowerCase();
  const typeFilter = options.type ?? 'all';
  const genFilter = options.generation ?? 'all';
  const limit = options.limit ?? TOTAL_SPECIES_COUNT;
  const catalog = getAllSpecies();
  const results: SpeciesRecord[] = [];
  for (let i = 0; i < catalog.length; i++) {
    const sp = catalog[i];
    if (typeFilter !== 'all' && sp.primaryType !== typeFilter && sp.secondaryType !== typeFilter) {
      continue;
    }
    if (genFilter !== 'all' && sp.generation !== genFilter) {
      continue;
    }
    if (q) {
      const idStr = String(sp.id).padStart(4, '0');
      if (!sp.name.toLowerCase().includes(q) && !idStr.includes(q) && String(sp.id) !== q) {
        continue;
      }
    }
    results.push(sp);
    if (results.length >= limit) break;
  }
  return results;
}

export function createPartyMember(
  speciesId: number,
  level: number,
  overrides?: Partial<PartyMember>,
): PartyMember {
  const sp = getSpecies(speciesId);
  const lv = Math.max(1, Math.min(100, Math.floor(level)));
  const maxHp = Math.round(sp.baseHp * 1.4 + lv * 3.1 + 24);
  const atk = Math.round(sp.baseAtk * 0.9 + lv * 1.9 + 12);
  const def = Math.round(sp.baseDef * 0.9 + lv * 1.7 + 10);
  const spd = Math.round(sp.baseSpd * 0.9 + lv * 1.8 + 10);

  return {
    uid: overrides?.uid ?? `pm-${sp.id}-${lv}`,
    speciesId: sp.id,
    nickname: overrides?.nickname,
    level: lv,
    xp: overrides?.xp ?? Math.round(lv * 35),
    xpToNext: overrides?.xpToNext ?? Math.round(lv * 60 + 80),
    hp: overrides?.hp !== undefined ? Math.min(maxHp, Math.max(0, overrides.hp)) : maxHp,
    maxHp,
    atk,
    def,
    spd,
    composure: overrides?.composure ?? 100,
    maxComposure: 100,
    status: overrides?.status ?? 'none',
    bond: overrides?.bond ?? 72,
    starRank: overrides?.starRank ?? 3,
    shiny: overrides?.shiny ?? false,
    moves: overrides?.moves?.length ? overrides.moves : [...sp.signatureMoves],
  };
}
