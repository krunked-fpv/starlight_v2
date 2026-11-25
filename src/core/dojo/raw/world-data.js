import { BALANCE } from './balance.js';

export const TILE = {
  GRASS: 0,
  PATH: 1,
  TALL_GRASS: 2,
  TREE: 3,
  WATER: 4,
  SHALLOW_WATER: 5,
  SAND: 6,
  BRIDGE: 7,
  CAVE_WALL: 8,
  CAVE_FLOOR: 9,
  CAVE_PATH: 10,
  WALL: 11,
  ROOF: 12,
  FLOWER: 13,
  SIGN: 14,
  HEAL: 15,
  SHRINE: 16,
  CHEST: 17,
  LAVA: 18,
  VOLCANO_FLOOR: 19,
  VOLCANO_PATH: 20,
  ICE_WALL: 21,
  SNOW_GRASS: 22,
  SNOW_PATH: 23,
  RUNE_TRAIL: 24,
  LANTERN: 25,
  GROVE_GRASS: 26,
  GROVE_PATH: 27,
  DUNE_SAND: 28,
  DUNE_PATH: 29,
  SANDSTONE_WALL: 30,
  MARSH_GRASS: 31,
  MARSH_PATH: 32,
  MARSH_WALL: 33,
  SANCTUM_FLOOR: 34,
  SANCTUM_PATH: 35,
  SANCTUM_WALL: 36,
  CANYON_GRASS: 37,
  CANYON_PATH: 38,
  CANYON_WALL: 39,
  REEF_WATER: 40,
  REEF_PATH: 41,
  REEF_WALL: 42,
  RUINS_FLOOR: 43,
  RUINS_PATH: 44,
  RUINS_WALL: 45,
  RIFT_FLOOR: 46,
  RIFT_PATH: 47,
  RIFT_WALL: 48,
  FAE_GRASS: 49,
  FAE_PATH: 50,
  FAE_WALL: 51,
  ATOLL_SAND: 52,
  ATOLL_PATH: 53,
  ATOLL_WALL: 54,
  CROWN_GRASS: 55,
  CROWN_PATH: 56,
  CROWN_WALL: 57,
  TERA_FLOOR: 58,
  TERA_PATH: 59,
  TERA_WALL: 60,
};

export const SOLID_TILES = new Set([
  TILE.TREE,
  TILE.WATER,
  TILE.CAVE_WALL,
  TILE.WALL,
  TILE.ROOF,
  TILE.SIGN,
  TILE.SHRINE,
  TILE.CHEST,
  TILE.LAVA,
  TILE.ICE_WALL,
  TILE.LANTERN,
  TILE.SANDSTONE_WALL,
  TILE.MARSH_WALL,
  TILE.SANCTUM_WALL,
  TILE.CANYON_WALL,
  TILE.REEF_WALL,
  TILE.RUINS_WALL,
  TILE.RIFT_WALL,
  TILE.FAE_WALL,
  TILE.ATOLL_WALL,
  TILE.CROWN_WALL,
  TILE.TERA_WALL,
]);

export const BIOMES = {
  village: {
    id: 'village',
    name: 'Starlight Village',
    icon: '🏡',
    levelRange: [2, 4],
    encounters: [],
  },
  forest: {
    id: 'forest',
    name: 'Whispering Forest',
    icon: '🌲',
    levelRange: [2, 7],
    encounters: [
      { id: 10, weight: 24 },
      { id: 16, weight: 22 },
      { id: 43, weight: 20 },
      { id: 133, weight: 18 },
      { id: 25, weight: 14 },
      { id: 11, weight: 10 },
      { id: 39, weight: 16 },
      { id: 179, weight: 16 },
      { id: 143, weight: 2 },
      { id: 280, weight: 14 },
      { id: 403, weight: 15 },
      { id: 152, weight: 14 },
      { id: 387, weight: 14 },
      { id: 495, weight: 14 },
      { id: 123, weight: 3 },
      { id: 214, weight: 2 },
      { id: 396, weight: 18 },
      { id: 13, weight: 20 },
      { id: 19, weight: 18 },
      { id: 29, weight: 22 },
      { id: 32, weight: 18 },
      { id: 52, weight: 14 },
      { id: 69, weight: 16 },
      { id: 83, weight: 4 },
      { id: 114, weight: 3 },
      { id: 127, weight: 2 },
      { id: 161, weight: 20 },
      { id: 163, weight: 18 },
      { id: 165, weight: 18 },
      { id: 172, weight: 18 },
      { id: 190, weight: 8 },
      { id: 204, weight: 12 },
      { id: 216, weight: 10 },
      { id: 234, weight: 3 },
      { id: 261, weight: 17 },
      { id: 263, weight: 20 },
      { id: 265, weight: 20 },
      { id: 273, weight: 18 },
      { id: 276, weight: 14 },
      { id: 287, weight: 14 },
      { id: 290, weight: 22 },
      { id: 352, weight: 4 },
      { id: 399, weight: 20 },
      { id: 401, weight: 20 },
      { id: 412, weight: 18 },
      { id: 415, weight: 18 },
      { id: 417, weight: 8 },
      { id: 438, weight: 10 },
      { id: 446, weight: 3 },
      { id: 504, weight: 18 },
      { id: 506, weight: 18 },
      { id: 509, weight: 17 },
      { id: 519, weight: 18 },
      { id: 540, weight: 18 },
      { id: 588, weight: 12 },
    ],
  },
  cave: {
    id: 'cave',
    name: 'Crystal Cavern',
    icon: '💎',
    levelRange: [4, 10],
    encounters: [
      { id: 74, weight: 24 },
      { id: 35, weight: 20 },
      { id: 37, weight: 18 },
      { id: 63, weight: 16 },
      { id: 92, weight: 14 },
      { id: 95, weight: 8 },
      { id: 180, weight: 12 },
      { id: 93, weight: 8 },
      { id: 281, weight: 12 },
      { id: 41, weight: 18 },
      { id: 304, weight: 14 },
      { id: 524, weight: 14 },
      { id: 200, weight: 12 },
      { id: 302, weight: 10 },
      { id: 50, weight: 15 },
      { id: 66, weight: 15 },
      { id: 109, weight: 15 },
      { id: 206, weight: 15 },
      { id: 293, weight: 15 },
      { id: 296, weight: 15 },
      { id: 303, weight: 12 },
      { id: 360, weight: 15 },
      { id: 527, weight: 15 },
      { id: 529, weight: 15 },
      { id: 532, weight: 15 },
      { id: 597, weight: 15 },
      { id: 621, weight: 8 },
      { id: 632, weight: 12 },
    ],
  },
  water: {
    id: 'water',
    name: 'Sapphire Lagoon',
    icon: '🌊',
    levelRange: [4, 10],
    encounters: [
      { id: 60, weight: 22 },
      { id: 54, weight: 20 },
      { id: 120, weight: 18 },
      { id: 58, weight: 16 },
      { id: 129, weight: 14 },
      { id: 131, weight: 10 },
      { id: 116, weight: 16 },
      { id: 117, weight: 8 },
      { id: 363, weight: 16 },
      { id: 349, weight: 14 },
      { id: 158, weight: 14 },
      { id: 393, weight: 14 },
      { id: 501, weight: 14 },
      { id: 170, weight: 14 },
      { id: 90, weight: 14 },
      { id: 183, weight: 16 },
      { id: 118, weight: 15 },
      { id: 278, weight: 15 },
      { id: 298, weight: 15 },
      { id: 320, weight: 15 },
      { id: 341, weight: 15 },
      { id: 418, weight: 15 },
      { id: 422, weight: 15 },
      { id: 515, weight: 15 },
      { id: 550, weight: 12 },
      { id: 580, weight: 15 },
    ],
  },
  volcano: {
    id: 'volcano',
    name: 'Ember Caldera',
    icon: '🌋',
    levelRange: [8, 15],
    encounters: [
      { id: 77, weight: 28 },
      { id: 37, weight: 18 },
      { id: 58, weight: 18 },
      { id: 126, weight: 20 },
      { id: 74, weight: 16 },
      { id: 181, weight: 8 },
      { id: 404, weight: 14 },
      { id: 155, weight: 18 },
      { id: 156, weight: 10 },
      { id: 371, weight: 14 },
      { id: 255, weight: 14 },
      { id: 390, weight: 14 },
      { id: 228, weight: 14 },
      { id: 218, weight: 14 },
      { id: 125, weight: 10 },
      { id: 636, weight: 10 },
      { id: 240, weight: 15 },
      { id: 322, weight: 15 },
      { id: 324, weight: 12 },
      { id: 485, weight: 5 },
      { id: 498, weight: 12 },
      { id: 513, weight: 15 },
      { id: 631, weight: 12 },
    ],
  },
  peak: {
    id: 'peak',
    name: 'Starfall Peak',
    icon: '❄️',
    levelRange: [10, 18],
    encounters: [
      { id: 86, weight: 28 },
      { id: 147, weight: 22 },
      { id: 35, weight: 18 },
      { id: 92, weight: 16 },
      { id: 148, weight: 16 },
      { id: 333, weight: 18 },
      { id: 364, weight: 14 },
      { id: 361, weight: 18 },
      { id: 372, weight: 10 },
      { id: 220, weight: 16 },
      { id: 215, weight: 14 },
      { id: 459, weight: 14 },
      { id: 582, weight: 14 },
      { id: 613, weight: 14 },
      { id: 359, weight: 10 },
      { id: 225, weight: 15 },
      { id: 227, weight: 8 },
      { id: 238, weight: 15 },
      { id: 307, weight: 15 },
      { id: 378, weight: 5 },
      { id: 615, weight: 12 },
    ],
  },
  grove: {
    id: 'grove',
    name: 'Celestial Grove',
    icon: '🌸',
    levelRange: [12, 20],
    encounters: [
      { id: 175, weight: 20 },
      { id: 252, weight: 20 },
      { id: 447, weight: 16 },
      { id: 280, weight: 14 },
      { id: 133, weight: 12 },
      { id: 333, weight: 12 },
      { id: 176, weight: 10 },
      { id: 253, weight: 10 },
      { id: 1, weight: 8 },
      { id: 4, weight: 8 },
      { id: 7, weight: 8 },
      { id: 546, weight: 14 },
      { id: 548, weight: 14 },
      { id: 570, weight: 12 },
      { id: 572, weight: 14 },
      { id: 427, weight: 14 },
      { id: 102, weight: 15 },
      { id: 174, weight: 15 },
      { id: 187, weight: 15 },
      { id: 191, weight: 15 },
      { id: 209, weight: 15 },
      { id: 235, weight: 12 },
      { id: 300, weight: 15 },
      { id: 313, weight: 15 },
      { id: 314, weight: 15 },
      { id: 357, weight: 12 },
      { id: 420, weight: 15 },
      { id: 431, weight: 15 },
      { id: 440, weight: 15 },
      { id: 441, weight: 12 },
      { id: 492, weight: 5 },
      { id: 511, weight: 15 },
      { id: 531, weight: 12 },
      { id: 585, weight: 15 },
      { id: 640, weight: 5 },
    ],
  },
  desert: {
    id: 'desert',
    name: 'Sunstone Dunes',
    icon: '🏜️',
    levelRange: [11, 19],
    encounters: [
      { id: 27, weight: 18 },
      { id: 111, weight: 16 },
      { id: 231, weight: 18 },
      { id: 246, weight: 14 },
      { id: 328, weight: 16 },
      { id: 443, weight: 14 },
      { id: 551, weight: 16 },
      { id: 343, weight: 15 },
      { id: 112, weight: 10 },
      { id: 329, weight: 10 },
      { id: 444, weight: 10 },
      { id: 104, weight: 15 },
      { id: 115, weight: 8 },
      { id: 331, weight: 15 },
      { id: 336, weight: 8 },
      { id: 377, weight: 5 },
      { id: 449, weight: 15 },
      { id: 554, weight: 15 },
      { id: 556, weight: 12 },
      { id: 557, weight: 15 },
      { id: 559, weight: 15 },
      { id: 629, weight: 15 },
    ],
  },
  marsh: {
    id: 'marsh',
    name: 'Glowspore Bayou',
    icon: '🍄',
    levelRange: [14, 22],
    encounters: [
      { id: 258, weight: 16 },
      { id: 270, weight: 18 },
      { id: 285, weight: 16 },
      { id: 406, weight: 16 },
      { id: 194, weight: 18 },
      { id: 355, weight: 14 },
      { id: 607, weight: 14 },
      { id: 577, weight: 14 },
      { id: 271, weight: 10 },
      { id: 315, weight: 10 },
      { id: 608, weight: 10 },
      { id: 23, weight: 15 },
      { id: 46, weight: 15 },
      { id: 48, weight: 15 },
      { id: 88, weight: 15 },
      { id: 167, weight: 15 },
      { id: 193, weight: 15 },
      { id: 283, weight: 15 },
      { id: 316, weight: 15 },
      { id: 339, weight: 15 },
      { id: 434, weight: 15 },
      { id: 451, weight: 15 },
      { id: 453, weight: 15 },
      { id: 455, weight: 12 },
      { id: 535, weight: 15 },
      { id: 543, weight: 15 },
      { id: 568, weight: 15 },
      { id: 590, weight: 15 },
      { id: 616, weight: 15 },
      { id: 618, weight: 12 },
    ],
  },
  sanctum: {
    id: 'sanctum',
    name: 'Astral Sky Citadel',
    icon: '🌌',
    levelRange: [16, 26],
    encounters: [
      { id: 81, weight: 18 },
      { id: 137, weight: 14 },
      { id: 374, weight: 16 },
      { id: 610, weight: 16 },
      { id: 633, weight: 14 },
      { id: 574, weight: 16 },
      { id: 624, weight: 15 },
      { id: 249, weight: 5 },
      { id: 82, weight: 10 },
      { id: 375, weight: 10 },
      { id: 611, weight: 10 },
      { id: 96, weight: 15 },
      { id: 198, weight: 12 },
      { id: 433, weight: 15 },
      { id: 439, weight: 15 },
      { id: 638, weight: 5 },
    ],
  },
  canyon: {
    id: 'canyon',
    name: 'Thundersteppe Canyon',
    icon: '⚡',
    levelRange: [15, 24],
    encounters: [
      { id: 21, weight: 15 },
      { id: 56, weight: 15 },
      { id: 84, weight: 15 },
      { id: 100, weight: 15 },
      { id: 128, weight: 8 },
      { id: 203, weight: 12 },
      { id: 207, weight: 12 },
      { id: 213, weight: 12 },
      { id: 236, weight: 15 },
      { id: 239, weight: 15 },
      { id: 241, weight: 8 },
      { id: 309, weight: 15 },
      { id: 311, weight: 15 },
      { id: 312, weight: 15 },
      { id: 327, weight: 15 },
      { id: 335, weight: 8 },
      { id: 522, weight: 15 },
      { id: 538, weight: 8 },
      { id: 539, weight: 8 },
      { id: 587, weight: 15 },
      { id: 595, weight: 15 },
      { id: 619, weight: 15 },
      { id: 626, weight: 8 },
      { id: 627, weight: 15 },
      { id: 639, weight: 5 },
    ],
  },
  reef: {
    id: 'reef',
    name: 'Abyssal Pearl Trench',
    icon: '🪸',
    levelRange: [17, 26],
    encounters: [
      { id: 72, weight: 15 },
      { id: 79, weight: 15 },
      { id: 98, weight: 15 },
      { id: 211, weight: 12 },
      { id: 222, weight: 15 },
      { id: 223, weight: 15 },
      { id: 318, weight: 15 },
      { id: 366, weight: 15 },
      { id: 369, weight: 8 },
      { id: 370, weight: 15 },
      { id: 456, weight: 15 },
      { id: 458, weight: 15 },
      { id: 489, weight: 8 },
      { id: 490, weight: 5 },
      { id: 564, weight: 12 },
      { id: 592, weight: 15 },
      { id: 594, weight: 12 },
      { id: 602, weight: 15 },
      { id: 647, weight: 5 },
    ],
  },
  ruins: {
    id: 'ruins',
    name: 'Chrono Relic Ruins',
    icon: '🏛️',
    levelRange: [20, 30],
    encounters: [
      { id: 138, weight: 12 },
      { id: 140, weight: 12 },
      { id: 142, weight: 8 },
      { id: 177, weight: 15 },
      { id: 201, weight: 15 },
      { id: 299, weight: 15 },
      { id: 345, weight: 12 },
      { id: 347, weight: 12 },
      { id: 353, weight: 15 },
      { id: 379, weight: 5 },
      { id: 408, weight: 12 },
      { id: 410, weight: 12 },
      { id: 436, weight: 15 },
      { id: 442, weight: 8 },
      { id: 561, weight: 12 },
      { id: 562, weight: 15 },
      { id: 566, weight: 12 },
      { id: 599, weight: 15 },
      { id: 622, weight: 15 },
    ],
  },
  rift: {
    id: 'rift',
    name: 'Mythic Starlight Rift',
    icon: '☄️',
    levelRange: [24, 36],
    encounters: [
      { id: 108, weight: 12 },
      { id: 132, weight: 12 },
      { id: 173, weight: 15 },
      { id: 325, weight: 15 },
      { id: 337, weight: 12 },
      { id: 338, weight: 12 },
      { id: 351, weight: 12 },
      { id: 380, weight: 5 },
      { id: 381, weight: 5 },
      { id: 383, weight: 5 },
      { id: 386, weight: 5 },
      { id: 425, weight: 15 },
      { id: 479, weight: 12 },
      { id: 480, weight: 5 },
      { id: 481, weight: 5 },
      { id: 482, weight: 5 },
      { id: 484, weight: 5 },
      { id: 487, weight: 5 },
      { id: 488, weight: 5 },
      { id: 491, weight: 5 },
      { id: 494, weight: 5 },
      { id: 517, weight: 15 },
      { id: 605, weight: 15 },
      { id: 641, weight: 5 },
      { id: 642, weight: 5 },
      { id: 645, weight: 5 },
      { id: 646, weight: 5 },
      { id: 648, weight: 5 },
    ],
  },
  faeveldt: {
    id: 'faeveldt',
    name: 'Pixie Faeveldt Glade',
    icon: '🧚',
    levelRange: [14, 24],
    encounters: [
      { id: 650, weight: 14 },
      { id: 653, weight: 14 },
      { id: 656, weight: 14 },
      { id: 659, weight: 16 },
      { id: 661, weight: 16 },
      { id: 664, weight: 16 },
      { id: 667, weight: 15 },
      { id: 669, weight: 16 },
      { id: 672, weight: 15 },
      { id: 674, weight: 15 },
      { id: 676, weight: 12 },
      { id: 677, weight: 15 },
      { id: 679, weight: 14 },
      { id: 682, weight: 15 },
      { id: 684, weight: 15 },
      { id: 686, weight: 14 },
      { id: 688, weight: 15 },
      { id: 690, weight: 14 },
      { id: 692, weight: 14 },
      { id: 694, weight: 15 },
      { id: 696, weight: 12 },
      { id: 698, weight: 12 },
      { id: 701, weight: 12 },
      { id: 702, weight: 14 },
      { id: 703, weight: 12 },
      { id: 704, weight: 14 },
      { id: 707, weight: 12 },
      { id: 708, weight: 15 },
      { id: 710, weight: 15 },
      { id: 712, weight: 15 },
      { id: 714, weight: 14 },
    ],
  },
  atoll: {
    id: 'atoll',
    name: 'Sunburst Alola Atoll',
    icon: '🌺',
    levelRange: [16, 26],
    encounters: [
      { id: 722, weight: 14 },
      { id: 725, weight: 14 },
      { id: 728, weight: 14 },
      { id: 731, weight: 16 },
      { id: 734, weight: 16 },
      { id: 736, weight: 16 },
      { id: 739, weight: 15 },
      { id: 741, weight: 12 },
      { id: 742, weight: 16 },
      { id: 744, weight: 16 },
      { id: 746, weight: 14 },
      { id: 747, weight: 15 },
      { id: 749, weight: 15 },
      { id: 751, weight: 15 },
      { id: 753, weight: 15 },
      { id: 755, weight: 15 },
      { id: 757, weight: 15 },
      { id: 759, weight: 15 },
      { id: 761, weight: 15 },
      { id: 764, weight: 12 },
      { id: 765, weight: 10 },
      { id: 766, weight: 10 },
      { id: 767, weight: 15 },
      { id: 769, weight: 15 },
      { id: 771, weight: 12 },
      { id: 772, weight: 8 },
      { id: 774, weight: 12 },
      { id: 775, weight: 12 },
      { id: 776, weight: 10 },
      { id: 777, weight: 12 },
      { id: 778, weight: 12 },
      { id: 779, weight: 12 },
      { id: 780, weight: 10 },
      { id: 781, weight: 10 },
      { id: 782, weight: 14 },
      { id: 785, weight: 6 },
      { id: 786, weight: 6 },
      { id: 787, weight: 6 },
      { id: 788, weight: 6 },
      { id: 789, weight: 6 },
      { id: 793, weight: 8 },
      { id: 794, weight: 8 },
      { id: 795, weight: 8 },
      { id: 796, weight: 8 },
      { id: 797, weight: 8 },
      { id: 798, weight: 8 },
      { id: 799, weight: 8 },
      { id: 803, weight: 8 },
      { id: 805, weight: 8 },
      { id: 806, weight: 8 },
    ],
  },
  highlands: {
    id: 'highlands',
    name: 'Iron Crown Highlands',
    icon: '🛡️',
    levelRange: [18, 30],
    encounters: [
      { id: 810, weight: 14 },
      { id: 813, weight: 14 },
      { id: 816, weight: 14 },
      { id: 819, weight: 16 },
      { id: 821, weight: 16 },
      { id: 824, weight: 16 },
      { id: 827, weight: 16 },
      { id: 829, weight: 15 },
      { id: 831, weight: 16 },
      { id: 833, weight: 15 },
      { id: 835, weight: 15 },
      { id: 837, weight: 15 },
      { id: 840, weight: 15 },
      { id: 843, weight: 15 },
      { id: 845, weight: 12 },
      { id: 846, weight: 15 },
      { id: 848, weight: 15 },
      { id: 850, weight: 15 },
      { id: 852, weight: 15 },
      { id: 854, weight: 14 },
      { id: 856, weight: 15 },
      { id: 859, weight: 15 },
      { id: 868, weight: 15 },
      { id: 870, weight: 12 },
      { id: 871, weight: 12 },
      { id: 872, weight: 15 },
      { id: 874, weight: 10 },
      { id: 875, weight: 10 },
      { id: 876, weight: 12 },
      { id: 877, weight: 12 },
      { id: 878, weight: 14 },
      { id: 880, weight: 10 },
      { id: 881, weight: 10 },
      { id: 882, weight: 10 },
      { id: 883, weight: 10 },
      { id: 884, weight: 12 },
      { id: 885, weight: 14 },
      { id: 891, weight: 6 },
      { id: 894, weight: 6 },
      { id: 895, weight: 6 },
      { id: 896, weight: 6 },
      { id: 897, weight: 6 },
    ],
  },
  crater: {
    id: 'crater',
    name: 'Terastal Crystal Crater',
    icon: '💎',
    levelRange: [22, 36],
    encounters: [
      { id: 906, weight: 14 },
      { id: 909, weight: 14 },
      { id: 912, weight: 14 },
      { id: 915, weight: 16 },
      { id: 917, weight: 16 },
      { id: 919, weight: 16 },
      { id: 921, weight: 16 },
      { id: 924, weight: 15 },
      { id: 926, weight: 15 },
      { id: 928, weight: 15 },
      { id: 931, weight: 12 },
      { id: 932, weight: 15 },
      { id: 935, weight: 14 },
      { id: 938, weight: 15 },
      { id: 940, weight: 15 },
      { id: 942, weight: 15 },
      { id: 944, weight: 15 },
      { id: 946, weight: 15 },
      { id: 948, weight: 15 },
      { id: 950, weight: 12 },
      { id: 951, weight: 15 },
      { id: 953, weight: 15 },
      { id: 955, weight: 15 },
      { id: 957, weight: 15 },
      { id: 960, weight: 15 },
      { id: 962, weight: 12 },
      { id: 963, weight: 14 },
      { id: 965, weight: 14 },
      { id: 967, weight: 12 },
      { id: 968, weight: 12 },
      { id: 969, weight: 14 },
      { id: 971, weight: 15 },
      { id: 973, weight: 12 },
      { id: 974, weight: 14 },
      { id: 976, weight: 12 },
      { id: 977, weight: 10 },
      { id: 978, weight: 10 },
      { id: 984, weight: 8 },
      { id: 985, weight: 8 },
      { id: 986, weight: 8 },
      { id: 987, weight: 8 },
      { id: 988, weight: 8 },
      { id: 989, weight: 8 },
      { id: 990, weight: 8 },
      { id: 991, weight: 8 },
      { id: 992, weight: 8 },
      { id: 993, weight: 8 },
      { id: 994, weight: 8 },
      { id: 995, weight: 8 },
      { id: 996, weight: 14 },
      { id: 999, weight: 12 },
      { id: 1001, weight: 6 },
      { id: 1002, weight: 6 },
      { id: 1003, weight: 6 },
      { id: 1004, weight: 6 },
      { id: 1005, weight: 8 },
      { id: 1006, weight: 8 },
      { id: 1011, weight: 12 },
      { id: 1012, weight: 12 },
      { id: 1014, weight: 6 },
      { id: 1015, weight: 6 },
      { id: 1016, weight: 6 },
      { id: 1020, weight: 8 },
      { id: 1021, weight: 8 },
      { id: 1022, weight: 8 },
      { id: 1023, weight: 8 },
    ],
  },
};

const CHAR_TO_TILE = {
  '.': TILE.GRASS,
  '=': TILE.PATH,
  ',': TILE.TALL_GRASS,
  T: TILE.TREE,
  '~': TILE.WATER,
  w: TILE.SHALLOW_WATER,
  s: TILE.SAND,
  B: TILE.BRIDGE,
  '#': TILE.CAVE_WALL,
  c: TILE.CAVE_FLOOR,
  p: TILE.CAVE_PATH,
  H: TILE.WALL,
  R: TILE.ROOF,
  '*': TILE.FLOWER,
  '!': TILE.SIGN,
  '+': TILE.HEAL,
  S: TILE.SHRINE,
  C: TILE.CHEST,
  L: TILE.LAVA,
  v: TILE.VOLCANO_FLOOR,
  a: TILE.VOLCANO_PATH,
  I: TILE.ICE_WALL,
  n: TILE.SNOW_GRASS,
  f: TILE.SNOW_PATH,
  r: TILE.RUNE_TRAIL,
  i: TILE.LANTERN,
  g: TILE.GROVE_GRASS,
  m: TILE.GROVE_PATH,
  d: TILE.DUNE_SAND,
  u: TILE.DUNE_PATH,
  D: TILE.SANDSTONE_WALL,
  y: TILE.MARSH_GRASS,
  b: TILE.MARSH_PATH,
  M: TILE.MARSH_WALL,
  z: TILE.SANCTUM_FLOOR,
  k: TILE.SANCTUM_PATH,
  Z: TILE.SANCTUM_WALL,
  e: TILE.CANYON_GRASS,
  q: TILE.CANYON_PATH,
  Q: TILE.CANYON_WALL,
  o: TILE.REEF_WATER,
  l: TILE.REEF_PATH,
  O: TILE.REEF_WALL,
  x: TILE.RUINS_FLOOR,
  j: TILE.RUINS_PATH,
  X: TILE.RUINS_WALL,
  t: TILE.RIFT_FLOOR,
  h: TILE.RIFT_PATH,
  W: TILE.RIFT_WALL,
  E: TILE.FAE_GRASS,
  P: TILE.FAE_PATH,
  F: TILE.FAE_WALL,
  N: TILE.ATOLL_SAND,
  U: TILE.ATOLL_PATH,
  A: TILE.ATOLL_WALL,
  G: TILE.CROWN_GRASS,
  '-': TILE.CROWN_PATH,
  K: TILE.CROWN_WALL,
  J: TILE.TERA_FLOOR,
  Y: TILE.TERA_PATH,
  V: TILE.TERA_WALL,
};

// 100 columns x 84 rows cohesive archipelago linking Village, Forest, Cavern, Lagoon, Ember Caldera, Starfall Peak, Celestial Grove, Sunstone Dunes, Glowspore Bayou, Astral Sky Citadel, Thundersteppe Canyon, Abyssal Pearl Trench, Chrono Relic Ruins, Mythic Starlight Rift, Pixie Faeveldt Glade, Sunburst Alola Atoll, Iron Crown Highlands & Terastal Crystal Crater
const RAW_MAP = [
  'TTTTTTTTTTTTTTTTTTTT################################DDDDDDDDDDDDDDDDQQQQQQQQQQQQQQQQFFFFFFFFFFFFFFFF',
  'T..,,,,..T..,,,,.CT##ppcccCc#cccccc##vvvvaaaLLLLvvv#DddddDuuuuuudddDQeeeqqqqqqqqqeeQFEEEEEEEEEEEEEEF',
  'T.,,,,,,....,,,,..T#pccccccp#cppppp##vCvaaaLLvvLLvv#DddddduuddddddCDQeeeqiirrrriqCeQFECEEEEEEEEEEEEF',
  'T..C,,,..T..,,,S..T#cp###ccp#cp##Sp##vvvvaaLviSivLv#DddddduurddddDDDQeeeqrrreeerrqqQFEEEEEErirEEEEEF',
  'T..,,,,..T..,,,r..T#cp#Cpccp#cp##rpi#aaaaavLvvrvvLv#DduuudirSriddddDQeeeerriSrirreeQFEEEEEErSrEEEEEF',
  'T....====...=rrr..T#cpppccccpppccrprraaaaavLLBBLLLL#DduuudddrruddddDQeeeqqirrrriqqeQFEEEFEErrrEEFEEF',
  'T.,,====,,,,====,.T##ccc######cccppi#vvvvvaaaaraavv#DduuudddduuddddDQeeqqeeeeeeeQeeQFEEEEEEPPEEEEEEF',
  'T.,,==,,,T..==,,,,T#ccccccppccccccp##vvvvvLLaaaarav#DdddddddduuddddDQeeqeeeQQeeeeeeQFEEEEEEPPEEEEEEF',
  'T..===..==!===..,.T#pccccc#pcccccpp####vvLLaLaaaarS#DddduuuuuuuddddDQqqqeeeqqeeeeeeQFEPPPPPPPPPPPPEF',
  'TTTi====iTTTTTTTTTT#ppcccc#pp####pp##vvvaaaaaaavvvv#DDdduudddddddddDQeqqqqqqqqqqqqeQFEEEEEEPPEEEEEEF',
  'T..*====*.........T##pccccccp#pp#pp##vvaaaLLLLaaavv#DduudduuuDDddddDQeqeeeeQQQeeeeqQFEEEEEEPPEEPEEEF',
  'T.RRRR..*..RRRR..*T#pp#r#ccpp#ppCpp##vvaaLLBBLLaaav#DCuuuudddddddddDQeqeeeeeeeeeeeqQFEEFEEEPPEEEEFEF',
  'T.HHHH.*...HHHH..*T#cp#r#ccpppppppp##vvaaavvvaaaavv#DddduuuuuuuddddDQqqqeeeeeeeeeeqQFE!EEEEPPEEEEEEF',
  'T..==..+====..==..T#cp#S#ccccccc#pp##aaa+a!aaaaaCv##DddddduuuudddddDQqqqqqqqqqqqqqqqPPPPPPPPPEEEEEEF',
  'T..==..===!==.==..Tipp#!###pppp##ppi#aaaaiaaaaaavvvauu!uuuuuuuddddduqq!qqqeeeeqqqqeqPPPP+PPPPEEEEEEF',
  'T..==...==..=======pppppppppppppppprraaaaaaaaaaavvvauuuu+uuuuuudddduqqqqqqeeeeqqqqeQFEEEEEEPPEEEEEEF',
  'T..**...==........TippppppppppppppprraaaaaiaaaaaLLv#DddduuuuuuuddddDQqqq+qeeeeqqqqeQFEEEEEEPPEEEEEEF',
  'T.......==........T########pp######i#vvvvaaarrrvvLv#DddddddduuuddddDQeeeeqeeeeqqqqeQFEEEEEEPPEEEEEEF',
  'TTTTi..===..iTTTTTTTssssssspp##ssssT#######irr#i####DddddddduuuddddDQeeeeqqqqqqqqqeQFEEEEEEPPEEEEEEF',
  'Tssss..===..ssssssTsssssssspp##ssssTIfffffnnrrnnfffIDddDDddduuuddddDQeeeeeeQQeeeeqeQFEEEEPEPPEEEEEEF',
  'Tss..ssss!==ssss..sssswwwssssppwwssTInSnffnnffnnfffIDddddddduuuddddDQeeeeeeeeeeeeqeQFEPPPPPPPPPPPPEF',
  'TsswwwwsssssssswwwwsswwwwwwsssswwssTInnnnnffffffnnfIDddddddduuuddddDQeeeQQeeeeeeeqqQFEEEEEEPPEEEEEEF',
  'Tsswwww~~BBBB~~wwwwss~~BBBB~~wwwwssiIfffnffff+ffnCIIDddddduuuuuddddDQeeeeeqqqqqqqqeQFEEEEEEPPEEEEEEF',
  'Tssw~~~~~ssss~~wwww~~~~srSsss~BBBBrrrffff!ffffffffffuuuuuuuuuuuddddDQeeeeeqeeeeeeqeQFEEEEEEPPEEEEEEF',
  'TsswCsssssww~~~wwww~~~~ssrsss~~wwssiIfffnnfffffnnfffuuuuudddduuddddDQeeqqqqeeeeeqqeQFEEFEEEPPEEEEFEF',
  'Tsswssssssww~~~~~~~~~~~ssssss~~~~~~TInnnnnfffffnnnnIDdddddddduuddddDQeeqeeeeeeeeeqeQFEEEEEEPPEEEEEEF',
  'T~~~~~~wwww~~~~~~~~~~~~~BB~~~~~~~~~TInnnIIfffffIIInIDdddddddruuddddDQeCqeeeQQeeeeqeQFEEEEEEPPEPEEEEF',
  'TTTTTTTTBBTTTTTTTTTTTTTirriTTTTTTTTTIfnnIIffrrfIIffIDddddddirriddddDQeeqqqqqqqqqqqeQFEPPPPPPPPPPPPEF',
  'T~~wwwwwBBww~~~wwww~~CssssffffnnfffIInffffrrffnnfffIDddddddrrddddddDQeeeeeerrieeeeeQFEEEEEEPPEEEEEEF',
  'T~wwwwsssssss~~wwww~~sssssffnnnnfffIIfffffrrfffnnnnIDDDDDDDrrDDDDDDDQQQQQQQrrQQQQQQQFEEEEEEPPEEEEEEF',
  'T~wwwsssssssswwww~~~~sssssffffnnffffffffffffIffnnnnIZZZZZZZrrZZZZZZZWWWWWWWrrWWWWWWWFEEEEEEPPEEEEEEF',
  'T~wwssssss*ssssswwBBBBBBBBrffffffffffnffffffIffnnffIZzzzzzzkkzzzzzzZWttthhhrrihhhttWFEEEFEEPPEEEFEEF',
  'T~wwwsssss*sssswww~~~wwwwwIfffnnnnffffffrfffIfffrrrrrrkkkkkkkzzzzCzZWttthhhhhhhhhtCWFEEEEEEPPEEEEEEF',
  'T~~wwwwsssssswwww~~~~wwwwwInnnIInnnfffffrrriSiIfrffIZzzzzzzkkzzzzzzZWttthhttttthhttWFEEEEEEPPEEEEEEF',
  'T~~~wwwwwswwwww~~~~~~wwwwwInnCIInnnfffnnffrrrrrffCfIZzzzzzkkkkzzzzzZWttthhtWWtthhttWFEEEEEEPPEEEEEEF',
  'T~~~~~~wwwww~~~~~~~~~~~~~~InnnffnnnnnnnnfffffffffnnIZzzZZzkkkkzZZzzZWttthhhhhhhhhtthPPPPPPPPPPPPPPEF',
  'T~~~~~~~BB~~~~~~~~~~~~~~~~IfffffffffffffnffffffffnnIZzzzzkkkkkkzzzzZWttthhtttthhhtthPPPPPPPPPPPPPCEF',
  'TTTTTTTTBBTTTTTTTTTTTTTTTTIIIIIIIIrrIIIIIIIIIIIIIIIIZzzzzkkkkkkzzzzZWttthhhhhhhhhttWFEEEEEEPPEEEEEEF',
  'TTgggggimm!mmgigT~~Tg*ggggggg*gggirriggggggTTgg*gggTZzzzzzkkkkzzzzzZWtttttWWttthhttWFEEEEEEPPEEEEEEF',
  'TgT*ggmmmmmmmmggg~~gggmmmmmmmgggg*rr*ggggTgggggggTgTZzzzzzzkkzzzzzzZWttthhhhhhhhhttWFEEEEEEPPEEEEEEF',
  'Tg*gggmmmg*mmmmmmBBmmmmimmmimmmmmmrrmmmmmmmrirrriggTZzzZZzzkkzzZZzzZWt!thhhtttthhttWFEEEEEEPPEEEEEEF',
  'Tggg*mmm*mmmmmggg~~gmmmmm+mmmmmmmmrrrrmrrrrrrrSrrmgrrrkkkkkkkzzzzzzkhhhhttttttthhttWFEEEEEEPPEEEEEEF',
  'Tggggmmgggggggg*g~~gmmmm*m*mmmmmmmmmmmmmmmmmmrrrgggrrrkkkkkkkzzzzzzkhhhhtth+hhhttttWVJJJJJJYYJJJJJJV',
  'Tgg*g*mgggggggggg~~ggmmmmmmmmggggggggggggggggmgggggTZzzzzzzkkzzzzzzZWttthhhhhhhttttWVJJJVJJYYJJJVJJV',
  'TgggCmmmmmmmmmmmmBBmgmmmmmmmmgg*ggg*gggg*gggggmmg*gTZzzzzzzkkzzzzzzZWttthhttWWtttttWVJJJJJJYYJJJJJJV',
  'Tgg*gg*ggggggg*gg~~gg*gggg*ggTgggggggg*gggggggg*CgTTZzzzzzzkkzzzzzzZWttthhtttttttttWVJ!JJJJYYJJJJCJV',
  'TTgggggggggTTgggT~~TggggggggggTggggggggTgggggggggTTTZzzzzzkkkkzzzzzZWttthhhhhhhhhhhhYYYYYYYYYYYYYYJV',
  'TTTTTTTmmTTTTTTTT~~TTTTTTmmTTTTTTTTTTTTTTTrrTTTTTTTTZzzzzzkkkkzzzzzZWttthhttttthhtthYYYYY+YYYYYYYYJV',
  'MMMMMMMbbMMMMMMMM~~MMMMMMbbMMMMMMMMMZZZZZZrrZZZZZZZZZzzZZzzkkzzzzzzZWttthhttttthhttWVJJJJJJYYJJJJJJV',
  'Myyyyyybb!yyyyyyM~~MyyyyybbbyyyyyyyMZzzzzzkkzzzzzzzZZzzzzzzkkzzzzzzZWttthhhhhhhhhttWVJJJJJJYYJYJJJJV',
  'MyyyyyybbbbbbbbMM~~MyyyyybbbbMMMyyyMZzzzzzkkzzzzzzzZZzzzzzkkkrrzzzzZWtttttWWttthhttWVJJJJJJYYJJJJJJV',
  'MyyMyyybbbbbbbbyy~~yybbbbbbbbyrSryyMZzzzzzkk!zzzzzzZZzzzzzkkirrizzzZWttthhhhhhhhhttWVJJVJJJYYJJJJVJV',
  'Myyyyyybbbbbbbbb~~~~bbbbbbbbbirriyyMZzzkkkkkzzzzkkkkkkkkkkkkkrrzzzzZWttthhttttthhttWVJJJJJJYYJJJJJJV',
  'MyyyyyyyyyybbbbbBBBBbbbbbbbbbyrryyBBkkkkkkkk+kkkrrrrkkkkkkkkkrSrzzzZWttthhrrrrrhhttWVJJJJJJYYJJJJJJV',
  'Myyyyyyyyyybbb+bBBBBbbbbbbbbbyyyyyBBkkkkkkkkkkkkkkkkkkkkkkkkkrrzzzzZWttthhirrrihhttWVJJJJJJYYJJJJJJV',
  'My~~~~yyyyybbbyy~~~~yybbbbyyyyyyyyyMZzzkkkkkzzzzkkkkkkkkkkkkirrizzzZWttthhrrrrrhhttWVJYYYYYYYYYYYYJV',
  'My~CBBbbbbbyyyyyM~~MyybbbbyyyyyyyyyMZzCzzzkkzzzzzzzZZzzzzzzkkrrzzzzZWttthhrrSrrhhttWVJJJJJJYYJJJJJJV',
  'My~~~~yyyyyyyyyyM~~MyyyCyyyyyyyyyyyMZzzzzzkkzzzzzzzZZzzzzzzkkzzzzzzZWttthhrrrrrhhttWVJJJJJJYYJJJJJJV',
  'MyyyyyyyyyyyyyyyM~~MyyyyyyyyyyyyyyyMZzzzzzkkzzzzzzzZZzzzzzzzzzzzzzzZWttthhirrrihhttWVJJJJJJYYJJJJJJV',
  'MMMMMMMMbbMMMMMMM~~MMMMMMMMMMMMMMMMMZZZZZZkkZZZZZZZZZZZZZZZZZZZZZZZZWttthhhhhhhhhttWVJJJJJJYYJJJJJJV',
  'OOOOOOOOllOOOOOOOOOOOOOOOOOOOOOOOOOOXXXXXXjjXXXXXXXXXXXXXXXXXXXXXXXXWttthhttttthhttWVJYYYYYYYYYYYYJV',
  'Ooooooolll!ooooooooollllllooooooooOOXxxxxjjjj!xxxxxxxxxxxxxirrrriixXWttthhtWWtthhttWVJJJJJJYYJJJJJJV',
  'OoooooollllooolllllllloollllooooCoOOXxCxxjjxxjxxxxXXxxxxxxjrrrrrrjxXWttthhhhhhhhhttWVJJJJJJYYJJJJJJV',
  'OooollllllllllooooooollooooooolllloOXxxxxjjxxjjjjjjjxxxxxxjrrSrrrjxXWttthhttttthhttWVJJVJJJYYJJJJVJV',
  'OoolllooooooollllllllooolllllloooolOXxxxxjjxxxxxxxxjxxxxxxjirrrrijxXWttthhttttthhttWVJJJJJJYYYJJJJJV',
  'OoolloooOOoolloooo+llllllllllllllllljjjjjjjjjjjjjjjj+jjjjjjjjjjjjjjjhhhhhhhtttthhttWVJJJJJJYYJJJJJJV',
  'OoolloooooooollooollllooorrrlllooolljjjjxxxxxxxxxxxjjjjjjjjjjjjjjjjjhhhhhhhtttthhttWVJJJJJJYYJJJJJJV',
  'OoollllllllooollloooooolirrriloooolOXxxxjxxxxxxxxjjjxxxxXXjjxxxxxxjXWttthhhhhhhhhhhhYYYYYYYYYYYYYYJV',
  'OoCollooolllllllloooooolrrSrrloooolOXxxxjjjjjjjjjjxxxxxxjjjjjjjjjjjXWttChtttttthhtthYYYYYYYYYYYYYYJV',
  'OoollllllllllooooooooollirrriloooolOXxxxxxxxxxxxxjjjjjjjjjxxxxxxCxjXWttthhhhhhhhhhtWVJJJJJJYYJJJJJJV',
  'OooooooooooooooooooooooooooolllllloOXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxjXWttttttttttttttWVJJJJJJYYJJJJJJV',
  'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOllOOOOOXXXXXXXXXjjXXXXXXXXXXXXXXXXXXjjXWWWWWWWWhhWWWWWWVJJJJJJYYJJJJJJV',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAUUAAAAAAAAAAAAAAUUAAAKKKKKKKKKKKKKKK--KKKKKKKKK--KKKKKKVJJJVJJYYJJJVJJV',
  'ANNNNNNNNNNNNNNNNNNNNNNNNNNNNUUNNNNNNNNNNNNNNUUNNNGGGGGGGGGGGGGGG--GGGGGGGGG--GGGGGGVJJJJJJYYJJJJJJV',
  'ANNNNNNNNNANNNNNNNNNNNNNANNN!UUNNNNNNNNNNNANNUUNNNGGCGGKGGGGGGGG!--GGGGKGGGG--GiriGGVJJJJJJYYJJJJJJV',
  'ANNNNiriNNNNNUNNNNNNNNNNNNNNNUUNNNNNNNNNNNNNNUUNNNGG-GGGGGGGGGGGG--G-GGGGGGG--GrSrGGVJJJJJJiriJJJJJV',
  'ANNNNrSrNNNNNNNNNNNNNNUNNNNNNUUNNNNNNNUNNNNNNUUNNNGG-GGGG-GGGGGGG--GGGGGGG-G--GrrrGGVJJJJJJrSrJJJJJV',
  'ANNUUrrrUUUUUUUUUUUUUUUUUU+UUUUUUUUUUUUUUUUUUUUUUU-----------+----------------------YYYYYYYrrrYYYYJV',
  'ANNUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUU----------------------------------YYYYYYYYYYYYYYJV',
  'ANNUNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNUNNGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG-GGVJJJJJJYYJJJJYJV',
  'ANNUNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNUNNGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG-GGVJJJJJJYYJJJJCJV',
  'ANNCNNNNNNNNNNNNNNANNNNNNNNNNNNNNNANNNNNNNNNNNNCNNGGGGGGGGGKGGGGGGGGGGGKGGGGGGGGGCGGVJJJJJJJJJJJJJJV',
  'ANNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGVJJJJJJJJJJJJJJV',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKVVVVVVVVVVVVVVVV',
];

export const WORLD_ROWS = RAW_MAP.length;
export const WORLD_COLS = RAW_MAP[0].length;
export const WORLD_MAP = RAW_MAP.map((row, y) => {
  if (row.length !== WORLD_COLS) {
    throw new Error(`WORLD_MAP row ${y} length ${row.length} !== ${WORLD_COLS}`);
  }
  return Array.from(row, (ch) => {
    const tile = CHAR_TO_TILE[ch];
    if (tile === undefined) throw new Error(`Unknown map tile char: ${ch}`);
    return tile;
  });
});

export const SIGNPOSTS = {
  '10,14': 'Welcome, {trainer}! Step on the glowing Healing Fountain nearby anytime to restore your team. Paths lead North to Whispering Forest, East through Crystal Cavern to Ember Caldera, and South through Sapphire Lagoon to Starfall Peak! Rumor says a star-marked cottage wall east of Professor Willow hides a secret once you earn a Badge or catch 5 Pokémon!',
  '10,8': 'Whispering Forest: Wild Grass, Normal, and Electric Pokémon dance in the tall grass! Follow the glowing rune stones to reach the Forest Shrine.',
  '23,14': 'Crystal Cavern: Watch for shimmering crystal floors! Keep heading East through the lantern tunnels to reach Ember Caldera, or North to Crystal Shrine.',
  '9,20': 'Sapphire Lagoon: Splash through shallow coral pools to meet Water Pokémon—and cross wooden bridges to find the Lagoon Shrine or Starfall Peak to the Southeast!',
  '42,13': 'Ember Caldera: Molten rivers glow beneath basalt bridges! Meet Ponyta, Vulpix, Growlithe, and Magmar—and follow the rune bridge north to Caldera Shrine.',
  '41,23': 'Starfall Peak: Frosty starlit grass sparkles under the aurora! Watch for Seel, Clefairy, Gastly, and rare Dratini as you climb toward Starfall Shrine.',
  '10,38': 'Celestial Grove: Blossom petals drift over moonstone paths! Meet Togepi, Treecko, and Riolu in the emerald meadows, heal at the Starlight Fountain, and seek Celestial Grove Shrine to the East!',
  '54,14': 'Sunstone Dunes: Golden mirage sands shimmer with Ground, Rock, and Dragon Pokémon! Heal at the oasis fountain nearby, watch out for Nomad Zara & Mirage Ace Sahara, and seek Sunstone Mirage Shrine to the North!',
  '9,49': 'Glowspore Bayou: Bioluminescent reeds and cypress lanterns light the misty boardwalks! Befriend Water, Grass, and Ghost Pokémon, and cross the eastern bridges toward Glowspore Lantern Shrine!',
  '44,51': 'Astral Sky Citadel: Starlight marble halls bridge the heavens! Heal at the courtyard fountain, speak with Astronomer Atlas, and ascend the eastern promenade to challenge Astral Sky Sanctum!',
  '70,14': 'Thundersteppe Canyon: Golden savannah storms crackle across terracotta mesas! Heal at the canyon fountain, watch for Stormtracker Kael & Storm Ace Volt, and climb north toward Raikou’s Thundersteppe Shrine!',
  '10,61': 'Abyssal Pearl Trench: Luminous coral reefs shimmer along the southern trench! Dive with Pearlkeeper Cora, face Abyssal Diver Coral, and seek Kyogre’s Abyssal Pearl Shrine in the southeast!',
  '45,61': 'Chrono Relic Ruins: Ancient clockwork gears hum beneath amber temple stones! Heal at the courtyard fountain, meet Historian Chronos & Chrono Sentinel Chrono, and challenge Dialga’s Chrono Relic Shrine!',
  '70,40': 'Mythic Starlight Rift: Prismatic starlight bridges span the edge of reality! Heal at the rift nexus, greet Astronomer Vega & Rift Paragon Nova, and ascend to Arceus’s Mythic Rift Shrine!',
  '86,12': 'Pixie Faeveldt Glade: Luminous pastel meadows welcome Gen 6 Kalos friends! Heal at the glade fountain, speak with Glade Keeper Valerie, challenge Pixie Maestro Serena, and seek Xerneas’s Pixie Faeveldt Shrine north!',
  '28,74': 'Sunburst Alola Atoll: Warm coral boardwalks shimmer with Gen 7 Alola Pokémon & Ultra Beasts! Heal along the lagoon, greet Sunburst Guide Lani, face Alola Champion Hau, and challenge Solgaleo’s Sunburst Atoll Shrine west!',
  '64,74': 'Iron Crown Highlands: Forged slate trails wind across Gen 8 Galar & Hisui moorlands! Heal at the citadel fountain, meet Highland Warden Sonia, duel Highland Ace Leon, and ascend to Zacian’s Iron Crown Shrine east!',
  '86,45': 'Terastal Crystal Crater: Iridescent Area Zero crystals pulse with Gen 9 Paldea & Paradox power! Heal at the crater hub, consult Researcher Briar, face Terastal Ace Nemona, and descend to Terapagos’s Terastal Crystal Shrine south!',
};

export const SHRINES = {
  '15,3': {
    id: 'forest_shrine',
    name: 'Forest Shrine',
    biome: 'forest',
    guardianId: 25,
    level: 6,
    badgeId: 'meadow',
    intro: 'The Forest Guardian Pikachu crackles with emerald light! Defeat it to claim the Meadow Badge!',
    clearedText: 'The Forest Shrine hums peacefully! Your Meadow Badge glows warmly.',
  },
  '33,3': {
    id: 'cave_shrine',
    name: 'Crystal Shrine',
    biome: 'cave',
    guardianId: 95,
    level: 8,
    badgeId: 'boulder',
    intro: 'A towering Crystal Onix rises from the gemstones! Show your strength for the Crystal Badge!',
    clearedText: 'Crystal chimes echo through the cavern! The Crystal Shrine honors your victory.',
  },
  '25,23': {
    id: 'water_shrine',
    name: 'Lagoon Shrine',
    biome: 'water',
    guardianId: 131,
    level: 8,
    badgeId: 'cascade',
    intro: 'The Guardian Lapras sings across the waves! Win this battle to earn the Cascade Badge!',
    clearedText: 'Gentle sea foam sparkles around the Lagoon Shrine. You hold its blessing!',
  },
  '46,3': {
    id: 'volcano_shrine',
    name: 'Caldera Shrine',
    biome: 'volcano',
    guardianId: 146,
    level: 12,
    badgeId: 'magma',
    intro: 'The Guardian Moltres spreads blazing golden wings above the magma! Defeat it to earn the Magma Badge!',
    clearedText: 'Warm embers swirl serenely around the Caldera Shrine. The Magma Badge shines on your vest!',
  },
  '44,33': {
    id: 'peak_shrine',
    name: 'Starfall Shrine',
    biome: 'peak',
    guardianId: 144,
    level: 15,
    badgeId: 'aurora',
    intro: 'The Guardian Articuno descends in a flurry of starlit frost! Triumph to claim the Aurora Badge!',
    clearedText: 'Aurora ribbons shimmer softly above Starfall Shrine. You carry its celestial blessing!',
  },
  '50,8': {
    id: 'thunder_shrine',
    name: 'Thunder Roost Shrine',
    biome: 'volcano',
    guardianId: 145,
    level: 14,
    badgeId: 'tempest',
    intro: 'The Guardian Zapdos crackles atop Thunder Roost with golden stormlight! Triumph to earn the Sky Tempest Badge!',
    clearedText: 'Crisp electric sparks hum peacefully around Thunder Roost Shrine. Your Sky Tempest Badge shines!',
  },
  '38,20': {
    id: 'starlight_shrine',
    name: 'Starlight Sanctum',
    biome: 'peak',
    guardianId: 151,
    level: 18,
    badgeId: 'celestial',
    intro: 'The mythical Guardian Mew floats in an aurora halo at Starlight Sanctum! Prove your heart to claim the Celestial Mythic Crown!',
    clearedText: 'Starlight Sanctum shimmers with timeless cosmic grace. You hold Mew’s celestial blessing!',
  },
  '23,13': {
    id: 'eclipse_shrine',
    name: 'Twilight Eclipse Shrine',
    biome: 'cave',
    guardianId: 282,
    level: 16,
    badgeId: 'eclipse',
    intro: 'The Guardian Gardevoir steps through violet starlight at Twilight Eclipse Shrine! Triumph to earn the Twilight Eclipse Badge!',
    clearedText: 'Serene moonbeams chime over the Twilight Eclipse Shrine. Your Twilight Eclipse Badge shines!',
  },
  '46,41': {
    id: 'grove_shrine',
    name: 'Celestial Grove Shrine',
    biome: 'grove',
    guardianId: 385,
    level: 20,
    badgeId: 'grove',
    intro: 'The mythical Guardian Jirachi awakens beneath drifting sakura starlight! Triumph to earn the Astral Grove Badge!',
    clearedText: 'Celestial melodies chime across the moonstone dais. Your Astral Grove Badge shines with starlight!',
  },
  '60,4': {
    id: 'desert_shrine',
    name: 'Sunstone Mirage Shrine',
    biome: 'desert',
    guardianId: 248,
    level: 19,
    badgeId: 'mirage',
    intro: 'The mighty Guardian Tyranitar shakes the Sunstone Mirage Shrine with golden sandstorms! Triumph to claim the Sunstone Mirage Badge!',
    clearedText: 'Golden desert winds hum serenely over the Sunstone Mirage Shrine. Your Sunstone Mirage Badge gleams brightly!',
  },
  '31,51': {
    id: 'marsh_shrine',
    name: 'Glowspore Lantern Shrine',
    biome: 'marsh',
    guardianId: 251,
    level: 22,
    badgeId: 'bayou',
    intro: 'The mythical Guardian Celebi emerges from glowing emerald mist at Glowspore Lantern Shrine! Triumph to earn the Glowspore Lantern Badge!',
    clearedText: 'Bioluminescent spores drift peacefully around Glowspore Lantern Shrine. You carry Celebi’s timeless blessing!',
  },
  '62,53': {
    id: 'sanctum_shrine',
    name: 'Astral Sky Sanctum',
    biome: 'sanctum',
    guardianId: 384,
    level: 25,
    badgeId: 'zenith',
    intro: 'The Sky Guardian Rayquaza descends from cosmic starlight at Astral Sky Sanctum! Conquer this supreme trial to claim the Astral Zenith Crown!',
    clearedText: 'Starlight auroras crown the Astral Sky Sanctum in emerald-gold splendor. You wear the Astral Zenith Crown!',
  },
  '76,4': {
    id: 'canyon_shrine',
    name: 'Thundersteppe Shrine',
    biome: 'canyon',
    guardianId: 243,
    level: 24,
    badgeId: 'steppe',
    intro: 'The Thunder Guardian Raikou roars across golden canyon mesas! Triumph to claim the Thundersteppe Badge!',
    clearedText: 'Warm savannah thunder crackles serenely over Thundersteppe Shrine. Your Thundersteppe Badge shines!',
  },
  '26,68': {
    id: 'reef_shrine',
    name: 'Abyssal Pearl Shrine',
    biome: 'reef',
    guardianId: 382,
    level: 26,
    badgeId: 'trench',
    intro: 'The Sea Basin Guardian Kyogre rises from luminous abyssal pearl tides! Triumph to earn the Abyssal Trench Badge!',
    clearedText: 'Iridescent pearl currents swirl peacefully around Abyssal Pearl Shrine. You carry Kyogre’s ocean blessing!',
  },
  '61,63': {
    id: 'ruins_shrine',
    name: 'Chrono Relic Shrine',
    biome: 'ruins',
    guardianId: 483,
    level: 28,
    badgeId: 'relic',
    intro: 'The Temporal Guardian Dialga chimes through amber clockwork arches at Chrono Relic Shrine! Triumph to earn the Chrono Relic Badge!',
    clearedText: 'Timeless golden gears turn in harmony around Chrono Relic Shrine. Your Chrono Relic Badge gleams!',
  },
  '76,56': {
    id: 'rift_shrine',
    name: 'Mythic Rift Shrine',
    biome: 'rift',
    guardianId: 493,
    level: 32,
    badgeId: 'rift_crown',
    intro: 'The Alpha Guardian Arceus radiates prismatic starlight at Mythic Rift Shrine! Conquer this mythic trial to claim the Starlight Rift Crown!',
    clearedText: 'Prismatic starlight crowns the Mythic Rift Shrine in eternal harmony. You wear the Starlight Rift Crown!',
  },
  '92,4': {
    id: 'faeveldt_shrine',
    name: 'Pixie Faeveldt Shrine',
    biome: 'faeveldt',
    guardianId: 716,
    level: 26,
    badgeId: 'pixie',
    intro: 'The Life Guardian Xerneas radiates pastel aurora horns at Pixie Faeveldt Shrine! Triumph to claim the Pixie Crest Badge!',
    clearedText: 'Soft fairy blossoms shimmer peacefully around Pixie Faeveldt Shrine. Your Pixie Crest Badge glows warmly!',
  },
  '6,76': {
    id: 'atoll_shrine',
    name: 'Sunburst Atoll Shrine',
    biome: 'atoll',
    guardianId: 791,
    level: 28,
    badgeId: 'kahuna',
    intro: 'The Sunne Guardian Solgaleo blazes across Sunburst Atoll Shrine! Triumph to earn the Alola Kahuna Badge!',
    clearedText: 'Warm golden sunbeams dance over Sunburst Atoll Shrine. Your Alola Kahuna Badge shines brightly!',
  },
  '80,75': {
    id: 'highlands_shrine',
    name: 'Iron Crown Shrine',
    biome: 'highlands',
    guardianId: 888,
    level: 32,
    badgeId: 'sovereign',
    intro: 'The Crowned Sword Guardian Zacian stands atop Iron Crown Shrine! Conquer this royal trial to claim the Sovereign Crown Badge!',
    clearedText: 'Noble highland banners gleam around Iron Crown Shrine. Your Sovereign Crown Badge shines!',
  },
  '92,76': {
    id: 'crater_shrine',
    name: 'Terastal Crystal Shrine',
    biome: 'crater',
    guardianId: 1024,
    level: 36,
    badgeId: 'terastal',
    intro: 'The Hidden Treasure Terapagos shimmers with prismatic Terastal energy at Terastal Crystal Shrine! Triumph to claim the Terastal Prism Crown!',
    clearedText: 'Iridescent crystal refractions crown Terastal Crystal Shrine in eternal wonder. You wear the Terastal Prism Crown!',
  },
};

export const CHESTS = {
  '3,3': {
    id: 'forest_chest',
    biome: 'forest',
    label: 'Forest Berry Stash',
    rewards: { potions: 3, greatBalls: 2 },
    message: '{trainer} opened the Forest Stash and found 3 Berry Potions + 2 Great Balls!',
  },
  '17,1': {
    id: 'forest_chest_leaf',
    biome: 'forest',
    label: 'Emerald Canopy Chest',
    rewards: { potions: 2, greatBalls: 2, gems: { leaf_gem: 1 } },
    message: '{trainer} opened the Emerald Canopy Chest and found a Verdant Gem 🍃 + 2 Berry Potions + 2 Great Balls!',
  },
  '26,1': {
    id: 'cave_chest_star',
    biome: 'cave',
    label: 'Starlight Vault Chest',
    rewards: { potions: 2, greatBalls: 1, starBalls: 2, starShards: 2 },
    message: '{trainer} opened the Starlight Vault Chest and found 2 🌟 Star Balls + 2 ✨ Star Shards + 1 Great Ball + 2 Berry Potions!',
  },
  '32,11': {
    id: 'cave_chest',
    biome: 'cave',
    label: 'Crystal Cache',
    rewards: { potions: 2, greatBalls: 3, starShards: 2 },
    message: '{trainer} opened the Crystal Cache and found 2 Berry Potions + 3 Great Balls + 2 ✨ Star Shards!',
  },
  '4,24': {
    id: 'lagoon_chest',
    biome: 'water',
    label: 'Lagoon Shell Chest',
    rewards: { potions: 3, greatBalls: 3, starShards: 2 },
    message: '{trainer} opened the Shell Chest and found 3 Berry Potions + 3 Great Balls + 2 ✨ Star Shards!',
  },
  '38,2': {
    id: 'volcano_chest_ember',
    biome: 'volcano',
    label: 'Caldera Ember Chest',
    rewards: { potions: 2, greatBalls: 2, starShards: 3, gems: { fire_gem: 1 } },
    message: '{trainer} opened the Caldera Ember Chest and found an Ember Gem 🔥 + 3 ✨ Star Shards + 2 Berry Potions + 2 Great Balls!',
  },
  '48,13': {
    id: 'volcano_chest_spark',
    biome: 'volcano',
    label: 'Lightning Basalt Chest',
    rewards: { potions: 1, greatBalls: 2, starShards: 3, gems: { thunder_gem: 1 } },
    message: '{trainer} opened the Lightning Basalt Chest and found a Spark Gem ⚡ + 3 ✨ Star Shards + 1 Berry Potion + 2 Great Balls!',
  },
  '49,22': {
    id: 'peak_chest_water',
    biome: 'peak',
    label: 'Glacial Tide Chest',
    rewards: { potions: 2, greatBalls: 2, starShards: 3, gems: { water_gem: 1 } },
    message: '{trainer} opened the Glacial Tide Chest and found a Tide Gem 💧 + 3 ✨ Star Shards + 2 Berry Potions + 2 Great Balls!',
  },
  '29,34': {
    id: 'peak_chest_moon',
    biome: 'peak',
    label: 'Moonbeam Ice Chest',
    rewards: { potions: 2, greatBalls: 3, starShards: 3, gems: { moon_gem: 1 } },
    message: '{trainer} opened the Moonbeam Ice Chest and found a Starlight Gem 🌙 + 3 ✨ Star Shards + 2 Berry Potions + 3 Great Balls!',
  },
  '49,34': {
    id: 'peak_chest_ice',
    biome: 'peak',
    label: 'Frost Crystal Chest',
    rewards: { potions: 2, greatBalls: 2, starShards: 3, gems: { ice_gem: 1 } },
    message: '{trainer} opened the Frost Crystal Chest and found an Aurora Gem ❄️ + 3 ✨ Star Shards + 2 Berry Potions + 2 Great Balls!',
  },
  '21,28': {
    id: 'lagoon_chest_sun',
    biome: 'water',
    label: 'Sunlit Cove Chest',
    rewards: { potions: 2, starBalls: 1, starShards: 3, gems: { sun_gem: 1 } },
    message: '{trainer} opened the Sunlit Cove Chest and found a Sunburst Gem ☀️ + 3 ✨ Star Shards + 1 🌟 Star Ball + 2 Berry Potions!',
  },
  '23,4': {
    id: 'cave_chest_dusk',
    biome: 'cave',
    label: 'Twilight Cavern Chest',
    rewards: { potions: 2, greatBalls: 2, starShards: 3, gems: { dusk_gem: 1 } },
    message: '{trainer} opened the Twilight Cavern Chest and found a Twilight Gem 🔮 + 3 ✨ Star Shards + 2 Great Balls + 2 Berry Potions!',
  },
  '4,44': {
    id: 'grove_chest_astral',
    biome: 'grove',
    label: 'Astral Wishing Chest',
    rewards: { potions: 2, starBalls: 2, starShards: 4, gems: { astral_gem: 1 } },
    message: '{trainer} opened the Astral Wishing Chest and found an Astral Gem 🌠 + 4 ✨ Star Shards + 2 🌟 Star Balls + 2 Berry Potions!',
  },
  '48,45': {
    id: 'grove_chest_wish',
    biome: 'grove',
    label: 'Sakura Star Chest',
    rewards: { potions: 3, greatBalls: 2, starShards: 3, gems: { moon_gem: 1, astral_gem: 1 } },
    message: '{trainer} opened the Sakura Star Chest and found a Starlight Gem 🌙 + an Astral Gem 🌠 + 3 ✨ Star Shards + 2 Great Balls + 3 Berry Potions!',
  },
  '66,2': {
    id: 'desert_chest_prism',
    biome: 'desert',
    label: 'Sunstone Prism Vault',
    rewards: { potions: 2, greatBalls: 2, starShards: 4, gems: { prism_gem: 1 } },
    message: '{trainer} opened the Sunstone Prism Vault and found a Prism Gem 💠 + 4 ✨ Star Shards + 2 Great Balls + 2 Berry Potions!',
  },
  '53,11': {
    id: 'desert_chest_sun',
    biome: 'desert',
    label: 'Golden Mirage Chest',
    rewards: { potions: 2, starBalls: 2, starShards: 3, gems: { sun_gem: 1 } },
    message: '{trainer} opened the Golden Mirage Chest and found a Sunburst Gem ☀️ + 3 ✨ Star Shards + 2 🌟 Star Balls + 2 Berry Potions!',
  },
  '3,56': {
    id: 'marsh_chest_dusk',
    biome: 'marsh',
    label: 'Glowspore Lantern Chest',
    rewards: { potions: 2, greatBalls: 2, starShards: 4, gems: { dusk_gem: 1 } },
    message: '{trainer} opened the Glowspore Lantern Chest and found a Twilight Gem 🔮 + 4 ✨ Star Shards + 2 Great Balls + 2 Berry Potions!',
  },
  '23,57': {
    id: 'marsh_chest_leaf',
    biome: 'marsh',
    label: 'Bayou Emerald Chest',
    rewards: { potions: 3, starBalls: 1, starShards: 3, gems: { leaf_gem: 1 } },
    message: '{trainer} opened the Bayou Emerald Chest and found a Verdant Gem 🍃 + 3 ✨ Star Shards + 1 🌟 Star Ball + 3 Berry Potions!',
  },
  '38,56': {
    id: 'sanctum_chest_prism',
    biome: 'sanctum',
    label: 'Astral Prism Reliquary',
    rewards: { potions: 2, starBalls: 2, starShards: 5, gems: { prism_gem: 1 } },
    message: '{trainer} opened the Astral Prism Reliquary and found a Prism Gem 💠 + 5 ✨ Star Shards + 2 🌟 Star Balls + 2 Berry Potions!',
  },
  '65,32': {
    id: 'sanctum_chest_astral',
    biome: 'sanctum',
    label: 'Zenith Starlight Coffer',
    rewards: { potions: 3, greatBalls: 3, starBalls: 2, starShards: 5, gems: { astral_gem: 1 } },
    message: '{trainer} opened the Zenith Starlight Coffer and found an Astral Gem 🌠 + 5 ✨ Star Shards + 2 🌟 Star Balls + 3 Great Balls + 3 Berry Potions!',
  },
  '81,2': {
    id: 'canyon_chest_thunder',
    biome: 'canyon',
    label: 'Thundersteppe Mesa Chest',
    rewards: { potions: 2, starBalls: 2, starShards: 4, gems: { thunder_gem: 1, chrono_gem: 1 } },
    message: '{trainer} opened the Thundersteppe Mesa Chest and found a Spark Gem ⚡ + Chrono Amber ⏳ + 4 ✨ Star Shards + 2 🌟 Star Balls + 2 Berry Potions!',
  },
  '70,26': {
    id: 'canyon_chest_chrono',
    biome: 'canyon',
    label: 'Fulgurite Gorge Coffer',
    rewards: { potions: 3, greatBalls: 2, starBalls: 1, starShards: 4, gems: { chrono_gem: 1 } },
    message: '{trainer} opened the Fulgurite Gorge Coffer and found a Chrono Amber ⏳ + 4 ✨ Star Shards + 1 🌟 Star Ball + 2 Great Balls + 3 Berry Potions!',
  },
  '2,68': {
    id: 'reef_chest_pearl',
    biome: 'reef',
    label: 'Pearl Trench Strongbox',
    rewards: { potions: 3, starBalls: 2, starShards: 4, gems: { water_gem: 1, moon_gem: 1 } },
    message: '{trainer} opened the Pearl Trench Strongbox and found a Tide Gem 💧 + Starlight Gem 🌙 + 4 ✨ Star Shards + 2 🌟 Star Balls + 3 Berry Potions!',
  },
  '32,62': {
    id: 'reef_chest_nebula',
    biome: 'reef',
    label: 'Abyssal Coral Vault',
    rewards: { potions: 2, starBalls: 2, starShards: 4, gems: { nebula_gem: 1 } },
    message: '{trainer} opened the Abyssal Coral Vault and found a Nebula Core ☄️ + 4 ✨ Star Shards + 2 🌟 Star Balls + 2 Berry Potions!',
  },
  '38,62': {
    id: 'ruins_chest_chrono',
    biome: 'ruins',
    label: 'Chrono Clockwork Chest',
    rewards: { potions: 2, starBalls: 2, starShards: 5, gems: { chrono_gem: 1 } },
    message: '{trainer} opened the Chrono Clockwork Chest and found a Chrono Amber ⏳ + 5 ✨ Star Shards + 2 🌟 Star Balls + 2 Berry Potions!',
  },
  '64,69': {
    id: 'ruins_chest_prism',
    biome: 'ruins',
    label: 'Relic Sanctum Reliquary',
    rewards: { potions: 3, starBalls: 2, starShards: 5, gems: { chrono_gem: 1, prism_gem: 1 } },
    message: '{trainer} opened the Relic Sanctum Reliquary and found a Chrono Amber ⏳ + Prism Gem 💠 + 5 ✨ Star Shards + 2 🌟 Star Balls + 3 Berry Potions!',
  },
  '82,32': {
    id: 'rift_chest_nebula',
    biome: 'rift',
    label: 'Nebula Starlight Chest',
    rewards: { potions: 3, starBalls: 2, starShards: 5, gems: { nebula_gem: 1 } },
    message: '{trainer} opened the Nebula Starlight Chest and found a Nebula Core ☄️ + 5 ✨ Star Shards + 2 🌟 Star Balls + 3 Berry Potions!',
  },
  '71,68': {
    id: 'rift_chest_astral',
    biome: 'rift',
    label: 'Mythic Rift Coffer',
    rewards: { potions: 3, starBalls: 3, starShards: 6, gems: { nebula_gem: 1, astral_gem: 1 } },
    message: '{trainer} opened the Mythic Rift Coffer and found a Nebula Core ☄️ + Astral Gem 🌠 + 6 ✨ Star Shards + 3 🌟 Star Balls + 3 Berry Potions!',
  },
  '86,2': {
    id: 'faeveldt_chest_pixie',
    biome: 'faeveldt',
    label: 'Pixie Blossom Chest',
    rewards: { potions: 3, starBalls: 2, starShards: 5, gems: { pixie_gem: 1 } },
    message: '{trainer} opened the Pixie Blossom Chest and found a Pixie Ribbon Gem 🎀 + 5 ✨ Star Shards + 2 🌟 Star Balls + 3 Berry Potions!',
  },
  '97,36': {
    id: 'faeveldt_chest_ribbon',
    biome: 'faeveldt',
    label: 'Moonlit Glade Coffer',
    rewards: { potions: 2, greatBalls: 2, starBalls: 2, starShards: 5, gems: { pixie_gem: 1, astral_gem: 1 } },
    message: '{trainer} opened the Moonlit Glade Coffer and found a Pixie Ribbon Gem 🎀 + Astral Gem 🌠 + 5 ✨ Star Shards + 2 🌟 Star Balls + 2 Great Balls + 2 Berry Potions!',
  },
  '3,81': {
    id: 'atoll_chest_alola',
    biome: 'atoll',
    label: 'Sunburst Kahuna Chest',
    rewards: { potions: 3, starBalls: 2, starShards: 5, gems: { alola_gem: 1 } },
    message: '{trainer} opened the Sunburst Kahuna Chest and found an Island Kahuna Shell 🌺 + 5 ✨ Star Shards + 2 🌟 Star Balls + 3 Berry Potions!',
  },
  '47,81': {
    id: 'atoll_chest_coral',
    biome: 'atoll',
    label: 'Alola Tide Strongbox',
    rewards: { potions: 2, greatBalls: 3, starBalls: 2, starShards: 6, gems: { alola_gem: 1, sun_gem: 1 } },
    message: '{trainer} opened the Alola Tide Strongbox and found an Island Kahuna Shell 🌺 + Sunburst Gem ☀️ + 6 ✨ Star Shards + 2 🌟 Star Balls + 3 Great Balls + 2 Berry Potions!',
  },
  '52,74': {
    id: 'highlands_chest_crown',
    biome: 'highlands',
    label: 'Iron Crown Coffer',
    rewards: { potions: 3, starBalls: 2, starShards: 6, gems: { crown_gem: 1 } },
    message: '{trainer} opened the Iron Crown Coffer and found a Sovereign Crest 🛡️ + 6 ✨ Star Shards + 2 🌟 Star Balls + 3 Berry Potions!',
  },
  '81,81': {
    id: 'highlands_chest_sovereign',
    biome: 'highlands',
    label: 'Sovereign Bastion Chest',
    rewards: { potions: 3, greatBalls: 2, starBalls: 2, starShards: 6, gems: { crown_gem: 1, prism_gem: 1 } },
    message: '{trainer} opened the Sovereign Bastion Chest and found a Sovereign Crest 🛡️ + Prism Gem 💠 + 6 ✨ Star Shards + 2 🌟 Star Balls + 2 Great Balls + 3 Berry Potions!',
  },
  '97,45': {
    id: 'crater_chest_tera',
    biome: 'crater',
    label: 'Terastal Crystal Vault',
    rewards: { potions: 3, starBalls: 3, starShards: 7, gems: { tera_gem: 1 } },
    message: '{trainer} opened the Terastal Crystal Vault and found a Terastal Shard 💎 + 7 ✨ Star Shards + 3 🌟 Star Balls + 3 Berry Potions!',
  },
  '97,80': {
    id: 'crater_chest_paradox',
    biome: 'crater',
    label: 'Area Zero Reliquary',
    rewards: { potions: 4, starBalls: 3, starShards: 8, gems: { tera_gem: 1, nebula_gem: 1 } },
    message: '{trainer} opened the Area Zero Reliquary and found a Terastal Shard 💎 + Nebula Core ☄️ + 8 ✨ Star Shards + 3 🌟 Star Balls + 4 Berry Potions!',
  },
};

export const NPCS = {
  '9,12': {
    id: 'npc_willow',
    name: 'Professor Willow',
    role: 'Island Researcher',
    biome: 'village',
    palette: {
      outfitPrimary: '#f8fafc',
      outfitSecondary: '#a855f7',
      hair: '#94a3b8',
      skin: '#fde2c8',
      hat: '#7e22ce',
    },
    greeting: 'Welcome, {trainer}! Explore all 6 regions of Starlight Island and register 10 unique Pokémon in your Dex for a special Starlight Gem!',
    questId: 'quest_willow_dex',
  },
  '10,7': {
    id: 'npc_fern',
    name: 'Ranger Fern',
    role: 'Forest Ranger',
    biome: 'forest',
    palette: {
      outfitPrimary: '#16a34a',
      outfitSecondary: '#facc15',
      hair: '#78350f',
      skin: '#f6cfa9',
      hat: '#15803d',
    },
    greeting: 'Listen to the leaves, {trainer}! Catch 3 different Whispering Forest Pokémon to earn supply packs from the Rangers!',
    questId: 'quest_forest_friends',
  },
  '22,16': {
    id: 'npc_pip',
    name: 'Geologist Pip',
    role: 'Cavern Geologist',
    biome: 'cave',
    palette: {
      outfitPrimary: '#7c3aed',
      outfitSecondary: '#22d3ee',
      hair: '#334155',
      skin: '#fde2c8',
      hat: '#f59e0b',
    },
    greeting: 'These crystals sing when trainers befriend cavern Pokémon, {trainer}! Catch any Crystal Cavern species and I will gift you a Starlight Gem!',
    questId: 'quest_cave_crystal',
  },
  '13,21': {
    id: 'npc_marina',
    name: 'Diver Marina',
    role: 'Lagoon Diver',
    biome: 'water',
    palette: {
      outfitPrimary: '#0284c7',
      outfitSecondary: '#67e8f9',
      hair: '#f43f5e',
      skin: '#f6cfa9',
      hat: '#0369a1',
    },
    greeting: 'The Sapphire tides are sparkling today, {trainer}! Catch 2 Lagoon species and I will share a Tide Gem I found on the reef!',
    questId: 'quest_lagoon_swimmers',
  },
  '40,12': {
    id: 'npc_ignis',
    name: 'Pyromancer Ignis',
    role: 'Caldera Flamekeeper',
    biome: 'volcano',
    palette: {
      outfitPrimary: '#ea580c',
      outfitSecondary: '#facc15',
      hair: '#450a0a',
      skin: '#fde2c8',
      hat: '#9a3412',
    },
    greeting: 'Brave heat in Ember Caldera, {trainer}! Befriend a volcanic partner (like Ponyta or Magmar) or clear Caldera Shrine for an Ember Gem!',
    questId: 'quest_volcano_brave',
  },
  '40,25': {
    id: 'npc_lyra',
    name: 'Stargazer Lyra',
    role: 'Aurora Astronomer',
    biome: 'peak',
    palette: {
      outfitPrimary: '#4f46e5',
      outfitSecondary: '#67e8f9',
      hair: '#e2e8f0',
      skin: '#fde2c8',
      hat: '#312e81',
    },
    greeting: 'Look at the aurora ribbons dancing above Starfall Peak, {trainer}! Catch Seel or Dratini—or clear Starfall Shrine—to earn a Spark Gem!',
    questId: 'quest_peak_aurora',
  },
  '5,16': {
    id: 'npc_celeste',
    name: 'Stylist Celeste',
    role: 'Island Stylist',
    biome: 'village',
    palette: {
      outfitPrimary: '#ec4899',
      outfitSecondary: '#fef08a',
      hair: '#6b21a8',
      skin: '#fde2c8',
      hat: '#be185d',
    },
    greeting: 'Looking sharp, {trainer}! Visit 4 regions, catch 6 species, or evolve a partner—and tap your HUD portrait anytime to customize your outfit!',
    questId: 'quest_celeste_style',
  },
  '37,32': {
    id: 'npc_yuki',
    name: 'Sculptor Yuki',
    role: 'Aurora Ice Sculptor',
    biome: 'peak',
    palette: {
      outfitPrimary: '#0891b2',
      outfitSecondary: '#e0f2fe',
      hair: '#cbd5e1',
      skin: '#fde2c8',
      hat: '#155e75',
    },
    greeting: 'The frost glitters like spun starlight, {trainer}! Befriend 2 Peak, Ice, or Dragon Pokémon—or clear Starfall Shrine—for an Aurora Gem!',
    questId: 'quest_yuki_peak',
  },
  '10,10': {
    id: 'npc_orion',
    name: 'Master Orion',
    role: 'Starlight Mentor',
    biome: 'village',
    palette: {
      outfitPrimary: '#312e81',
      outfitSecondary: '#fbbf24',
      hair: '#e2e8f0',
      skin: '#fde2c8',
      hat: '#4338ca',
    },
    greeting: 'Greetings, {trainer}! Open Team & Box in your Pokédex to channel ✨ Star Shards and Power Up a Pokémon’s Star Rank!',
    questId: 'quest_orion_upgrade',
  },
  '22,10': {
    id: 'npc_selene',
    name: 'Twilight Keeper Selene',
    role: 'Eclipse Lorekeeper',
    biome: 'cave',
    palette: {
      outfitPrimary: '#581c87',
      outfitSecondary: '#e879f9',
      hair: '#c7d2fe',
      skin: '#fde2c8',
      hat: '#3b0764',
    },
    greeting: 'The violet runes just east lead to Twilight Eclipse Shrine, {trainer}! Catch 2 Ghost or Psychic partners—or clear the Shrine—for a Twilight Gem!',
    questId: 'quest_selene_twilight',
  },
  '12,40': {
    id: 'npc_hana',
    name: 'Botanist Hana',
    role: 'Celestial Grove Naturalist',
    biome: 'grove',
    palette: {
      outfitPrimary: '#be185d',
      outfitSecondary: '#fbcfe8',
      hair: '#4c1d95',
      skin: '#fde2c8',
      hat: '#ec4899',
    },
    greeting: 'Welcome to Celestial Grove, {trainer}! Befriend 2 Celestial Grove Pokémon—or clear the Celestial Grove Shrine—and I will share a rare Astral Gem!',
    questId: 'quest_hana_grove',
  },
  '27,43': {
    id: 'npc_sora',
    name: 'Aura Master Sora',
    role: 'Starlight Bond Mentor',
    biome: 'grove',
    palette: {
      outfitPrimary: '#0f766e',
      outfitSecondary: '#fde68a',
      hair: '#1e293b',
      skin: '#f6cfa9',
      hat: '#115e59',
    },
    greeting: 'Your heart resonates with your partners, {trainer}! Reach 60+ Bond (Trusted Buddy 💖) with any Pokémon—or perform 2 evolutions—for an Astral Gem!',
    questId: 'quest_sora_bond',
  },
  '59,13': {
    id: 'npc_zara',
    name: 'Nomad Zara',
    role: 'Dune Archaeologist',
    biome: 'desert',
    palette: {
      outfitPrimary: '#d97706',
      outfitSecondary: '#fef08a',
      hair: '#451a03',
      skin: '#f6cfa9',
      hat: '#b45309',
    },
    greeting: 'The golden dunes hide ancient crystalline relics, {trainer}! Befriend 2 Sunstone Dunes Pokémon—or clear Sunstone Mirage Shrine—and I will share a Prism Gem!',
    questId: 'quest_zara_desert',
  },
  '13,50': {
    id: 'npc_milo',
    name: 'Mycologist Milo',
    role: 'Bayou Naturalist',
    biome: 'marsh',
    palette: {
      outfitPrimary: '#0d9488',
      outfitSecondary: '#c084fc',
      hair: '#334155',
      skin: '#fde2c8',
      hat: '#115e59',
    },
    greeting: 'Look at those glowing spores drifting across the bayou, {trainer}! Catch 2 Glowspore Bayou species—or clear Glowspore Lantern Shrine—for a Twilight Gem!',
    questId: 'quest_milo_marsh',
  },
  '40,52': {
    id: 'npc_atlas',
    name: 'Astronomer Atlas',
    role: 'Citadel Archivist',
    biome: 'sanctum',
    palette: {
      outfitPrimary: '#312e81',
      outfitSecondary: '#67e8f9',
      hair: '#e2e8f0',
      skin: '#fde2c8',
      hat: '#4338ca',
    },
    greeting: 'You stand within the Astral Sky Citadel, {trainer}! Befriend 2 Citadel species—or triumph at Astral Sky Sanctum—for both a Prism Gem and an Astral Gem!',
    questId: 'quest_atlas_sanctum',
  },
  '74,13': {
    id: 'npc_kael',
    name: 'Stormtracker Kael',
    role: 'Canyon Scout',
    biome: 'canyon',
    palette: {
      outfitPrimary: '#b45309',
      outfitSecondary: '#fde047',
      hair: '#451a03',
      skin: '#f6cfa9',
      hat: '#d97706',
    },
    greeting: 'Thunder rolls across Thundersteppe Canyon, {trainer}! Befriend 2 Canyon Pokémon—or clear Thundersteppe Shrine—for a Chrono Amber ⏳ and supplies!',
    questId: 'quest_kael_canyon',
  },
  '13,64': {
    id: 'npc_cora',
    name: 'Pearlkeeper Cora',
    role: 'Trench Oceanographer',
    biome: 'reef',
    palette: {
      outfitPrimary: '#0e7490',
      outfitSecondary: '#f9a8d4',
      hair: '#ec4899',
      skin: '#fde2c8',
      hat: '#0369a1',
    },
    greeting: 'The pearl currents gleam deep below, {trainer}! Catch 2 Abyssal Pearl Trench species—or clear Abyssal Pearl Shrine—for a rare Nebula Core ☄️!',
    questId: 'quest_cora_reef',
  },
  '48,67': {
    id: 'npc_chronos',
    name: 'Historian Chronos',
    role: 'Clockwork Archivist',
    biome: 'ruins',
    palette: {
      outfitPrimary: '#78350f',
      outfitSecondary: '#fbbf24',
      hair: '#cbd5e1',
      skin: '#fde2c8',
      hat: '#92400e',
    },
    greeting: 'Every gear in Chrono Relic Ruins keeps ancient starlight time, {trainer}! Catch 2 Ruins species—or clear Chrono Relic Shrine—for a Chrono Amber ⏳!',
    questId: 'quest_chronos_ruins',
  },
  '73,49': {
    id: 'npc_vega',
    name: 'Astronomer Vega',
    role: 'Rift Cartographer',
    biome: 'rift',
    palette: {
      outfitPrimary: '#4c1d95',
      outfitSecondary: '#e879f9',
      hair: '#f8fafc',
      skin: '#fde2c8',
      hat: '#3b0764',
    },
    greeting: 'You walk among cosmic fractures in Mythic Starlight Rift, {trainer}! Befriend 2 Rift Pokémon—or clear Mythic Rift Shrine—for a Nebula Core ☄️!',
    questId: 'quest_vega_rift',
  },
  '89,19': {
    id: 'npc_valerie',
    name: 'Glade Keeper Valerie',
    role: 'Faeveldt Mystic',
    biome: 'faeveldt',
    palette: {
      outfitPrimary: '#db2777',
      outfitSecondary: '#fbcfe8',
      hair: '#1e1b4b',
      skin: '#fde2c8',
      hat: '#be185d',
    },
    greeting: 'Welcome to Pixie Faeveldt Glade, {trainer}! Befriend 2 Kalos/Faeveldt Pokémon—or clear Pixie Faeveldt Shrine—for a Pixie Ribbon Gem 🎀!',
    questId: 'quest_valerie_faeveldt',
  },
  '22,76': {
    id: 'npc_lani',
    name: 'Sunburst Guide Lani',
    role: 'Alola Reef Naturalist',
    biome: 'atoll',
    palette: {
      outfitPrimary: '#ea580c',
      outfitSecondary: '#fef08a',
      hair: '#451a03',
      skin: '#f6cfa9',
      hat: '#0284c7',
    },
    greeting: 'Alola, {trainer}! Befriend 2 Sunburst Alola Atoll species—or clear Sunburst Atoll Shrine—and I will share an Island Kahuna Shell 🌺!',
    questId: 'quest_lani_atoll',
  },
  '57,76': {
    id: 'npc_sonia',
    name: 'Highland Warden Sonia',
    role: 'Galar & Hisui Historian',
    biome: 'highlands',
    palette: {
      outfitPrimary: '#334155',
      outfitSecondary: '#facc15',
      hair: '#fb923c',
      skin: '#fde2c8',
      hat: '#1e293b',
    },
    greeting: 'Splendid arrival in Iron Crown Highlands, {trainer}! Catch 2 Galar/Hisui species—or clear Iron Crown Shrine—for a Sovereign Crest 🛡️!',
    questId: 'quest_sonia_highlands',
  },
  '94,49': {
    id: 'npc_briar',
    name: 'Crater Researcher Briar',
    role: 'Area Zero Scholar',
    biome: 'crater',
    palette: {
      outfitPrimary: '#0891b2',
      outfitSecondary: '#a5f3fc',
      hair: '#312e81',
      skin: '#fde2c8',
      hat: '#155e75',
    },
    greeting: 'The Terastal crystals sing around us, {trainer}! Catch 2 Paldea/Crater Pokémon—or clear Terastal Crystal Shrine—for a Terastal Shard 💎!',
    questId: 'quest_briar_crater',
  },
};

function countCaughtFromList(profile, ids) {
  const caught = profile?.pokedex?.caught;
  if (!caught) return 0;
  if (Array.isArray(caught) || caught instanceof Set) {
    const caughtSet = new Set(Array.from(caught, Number).filter((n) => Number.isFinite(n) && n > 0));
    const seen = new Set();
    let count = 0;
    for (const id of ids) {
      if (!seen.has(id) && caughtSet.has(id)) {
        seen.add(id);
        count += 1;
      }
    }
    return count;
  }
  if (typeof caught !== 'object') return 0;
  const seen = new Set();
  let count = 0;
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const v = caught[id];
    if (v === true || (typeof v !== 'boolean' && Number.isFinite(Number(v)) && Number(v) > 0)) {
      count += 1;
    }
  }
  return count;
}

function countTotalCaught(profile) {
  return countUniqueCaughtSpecies(profile);
}

const FOREST_QUEST_IDS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25, 26, 29, 30, 31, 32, 33, 34, 39, 40, 43, 44, 45, 52, 53, 69, 70, 71, 83, 114, 123, 127, 133, 134, 135, 136, 143, 152, 153, 154, 161, 162, 163, 164, 165, 166, 172, 179, 180, 181, 182, 185, 190, 196, 197, 204, 205, 212, 214, 216, 217, 234, 261, 262, 263, 264, 265, 266, 267, 268, 269, 273, 274, 275, 276, 277, 280, 281, 282, 287, 288, 289, 290, 291, 292, 352, 387, 388, 389, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 412, 413, 414, 415, 416, 417, 424, 438, 446, 465, 470, 471, 475, 495, 496, 497, 504, 505, 506, 507, 508, 509, 510, 519, 520, 521, 540, 541, 542, 588, 589, 700, 862, 863, 865, 899, 900, 901];
const CAVE_QUEST_IDS = [35, 36, 37, 38, 41, 42, 50, 51, 63, 64, 65, 66, 67, 68, 74, 75, 76, 92, 93, 94, 95, 109, 110, 169, 180, 181, 200, 202, 206, 208, 281, 282, 293, 294, 295, 296, 297, 302, 303, 304, 305, 306, 360, 429, 475, 524, 525, 526, 527, 528, 529, 530, 532, 533, 534, 597, 598, 621, 632, 982];
const WATER_QUEST_IDS = [54, 55, 58, 59, 60, 61, 62, 90, 91, 116, 117, 118, 119, 120, 121, 129, 130, 131, 158, 159, 160, 170, 171, 183, 184, 186, 230, 278, 279, 298, 320, 321, 341, 342, 349, 350, 363, 364, 365, 393, 394, 395, 418, 419, 422, 423, 501, 502, 503, 515, 516, 550, 580, 581, 902];
const VOLCANO_CORE_IDS = [77, 126];
const VOLCANO_ALL_IDS = [37, 38, 58, 59, 74, 75, 76, 77, 78, 125, 126, 155, 156, 157, 181, 218, 219, 228, 229, 240, 255, 256, 257, 322, 323, 324, 371, 372, 373, 390, 391, 392, 404, 405, 466, 467, 485, 498, 499, 500, 513, 514, 631, 636, 637];
const PEAK_CORE_IDS = [86, 147, 148];
const YUKI_PEAK_IDS = [35, 36, 86, 87, 90, 91, 92, 93, 94, 124, 144, 147, 148, 149, 151, 215, 220, 221, 225, 227, 230, 238, 307, 308, 333, 334, 351, 359, 361, 362, 363, 364, 365, 371, 372, 373, 378, 380, 381, 384, 443, 444, 445, 459, 460, 461, 471, 473, 478, 483, 484, 487, 582, 583, 584, 610, 611, 612, 613, 614, 615, 621, 635, 646, 697, 698, 699, 704, 705, 706, 712, 713, 715, 718, 780, 782, 783, 784, 841, 842, 866, 872, 873, 875, 885, 886, 887, 895, 896, 903, 967, 974, 975, 978, 991, 996, 997, 998, 1005];
const TWILIGHT_QUEST_IDS = [35, 36, 41, 42, 63, 64, 65, 92, 93, 94, 96, 97, 137, 150, 151, 169, 177, 196, 197, 199, 200, 201, 202, 203, 233, 249, 280, 281, 282, 302, 325, 326, 337, 353, 354, 355, 356, 358, 360, 385, 386, 425, 426, 429, 433, 442, 474, 477, 478, 480, 481, 482, 488, 493, 517, 518, 561, 562, 563, 574, 575, 576, 577, 578, 579, 605, 606, 607, 608, 609, 648, 655, 677, 678, 708, 709, 710, 711, 720, 724, 765, 781, 789, 790, 792, 800, 826, 854, 855, 856, 857, 864, 876, 897, 898, 899, 937, 955, 956, 971, 972, 981, 987, 999];
const GROVE_QUEST_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 39, 40, 102, 103, 113, 133, 134, 135, 136, 174, 175, 176, 187, 188, 189, 191, 192, 196, 197, 209, 210, 235, 242, 252, 253, 254, 280, 281, 282, 300, 301, 313, 314, 333, 334, 350, 357, 385, 420, 421, 427, 428, 431, 432, 440, 441, 447, 448, 468, 470, 471, 475, 478, 492, 511, 512, 531, 546, 547, 548, 549, 570, 571, 572, 573, 585, 586, 640, 700];
const DESERT_QUEST_IDS = [27, 28, 104, 105, 111, 112, 115, 231, 232, 246, 247, 248, 328, 329, 330, 331, 332, 336, 343, 344, 377, 443, 444, 445, 449, 450, 464, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 629, 630];
const MARSH_QUEST_IDS = [23, 24, 46, 47, 48, 49, 88, 89, 167, 168, 193, 194, 195, 251, 258, 259, 260, 270, 271, 272, 283, 284, 285, 286, 315, 316, 317, 339, 340, 355, 356, 406, 407, 434, 435, 451, 452, 453, 454, 455, 469, 477, 535, 536, 537, 543, 544, 545, 568, 569, 577, 578, 579, 590, 591, 607, 608, 609, 616, 617, 618, 980];
const SANCTUM_QUEST_IDS = [81, 82, 96, 97, 122, 137, 198, 233, 249, 358, 374, 375, 376, 384, 430, 433, 439, 462, 474, 574, 575, 576, 610, 611, 612, 624, 625, 633, 634, 635, 638, 866, 983];
const CANYON_QUEST_IDS = [21, 22, 56, 57, 84, 85, 100, 101, 106, 107, 125, 128, 203, 207, 213, 236, 237, 239, 241, 243, 244, 309, 310, 311, 312, 327, 335, 466, 472, 522, 523, 538, 539, 587, 595, 596, 619, 620, 626, 627, 628, 639];
const REEF_QUEST_IDS = [72, 73, 79, 80, 98, 99, 199, 211, 222, 223, 224, 226, 245, 318, 319, 366, 367, 368, 369, 370, 382, 456, 457, 458, 489, 490, 564, 565, 592, 593, 594, 602, 603, 604, 647];
const RUINS_QUEST_IDS = [138, 139, 140, 141, 142, 177, 178, 201, 299, 345, 346, 347, 348, 353, 354, 379, 408, 409, 410, 411, 436, 437, 442, 476, 483, 486, 561, 562, 563, 566, 567, 599, 600, 601, 622, 623];
const RIFT_QUEST_IDS = [35, 36, 108, 132, 150, 173, 250, 325, 326, 337, 338, 351, 380, 381, 383, 386, 425, 426, 463, 479, 480, 481, 482, 484, 487, 488, 491, 493, 494, 517, 518, 605, 606, 641, 642, 643, 644, 645, 646, 648, 649];
const FAEVELDT_QUEST_IDS = Array.from({ length: 72 }, (_, i) => 650 + i);
const ATOLL_QUEST_IDS = Array.from({ length: 88 }, (_, i) => 722 + i);
const HIGHLANDS_QUEST_IDS = Array.from({ length: 96 }, (_, i) => 810 + i);
const CRATER_QUEST_IDS = Array.from({ length: 120 }, (_, i) => 906 + i);

export const FIELD_QUESTS = [
  {
    id: 'quest_forest_friends',
    npcId: 'npc_fern',
    title: 'Whispering Woodland Scout',
    description: 'Catch 3 different Whispering Forest Pokémon.',
    rewards: { greatBalls: 2, potions: 2 },
    check(profile) {
      return countCaughtFromList(profile, FOREST_QUEST_IDS) >= 3;
    },
    progressText(profile) {
      const n = Math.min(3, countCaughtFromList(profile, FOREST_QUEST_IDS));
      return `${n}/3 Forest species caught`;
    },
    completeDialogue: 'Splendid scouting, {trainer}! Ranger Fern handed you 2 Great Balls and 2 Berry Potions!',
  },
  {
    id: 'quest_cave_crystal',
    npcId: 'npc_pip',
    title: 'Crystal Cavern Spelunker',
    description: 'Befriend any Crystal Cavern Pokémon (such as Geodude, Clefairy, Vulpix, Abra, Gastly, or Onix).',
    rewards: { gems: { moon_gem: 1 }, potions: 1 },
    check(profile) {
      return countCaughtFromList(profile, CAVE_QUEST_IDS) >= 1;
    },
    progressText(profile) {
      const n = Math.min(1, countCaughtFromList(profile, CAVE_QUEST_IDS));
      return `${n}/1 Cavern species caught`;
    },
    completeDialogue: 'What a dazzling cavern friend, {trainer}! Geologist Pip gifted you a Starlight Gem 🌙 and 1 Berry Potion!',
  },
  {
    id: 'quest_lagoon_swimmers',
    npcId: 'npc_marina',
    title: 'Sapphire Tide Explorer',
    description: 'Catch 2 different Sapphire Lagoon Pokémon.',
    rewards: { gems: { water_gem: 1 }, greatBalls: 1 },
    check(profile) {
      return countCaughtFromList(profile, WATER_QUEST_IDS) >= 2;
    },
    progressText(profile) {
      const n = Math.min(2, countCaughtFromList(profile, WATER_QUEST_IDS));
      return `${n}/2 Lagoon species caught`;
    },
    completeDialogue: 'Splash-tastic work, {trainer}! Diver Marina rewarded you with a Tide Gem 💧 and 1 Great Ball!',
  },
  {
    id: 'quest_volcano_brave',
    npcId: 'npc_ignis',
    title: 'Heart of Ember Caldera',
    description: 'Catch Ponyta or Magmar (or 2 Caldera species), or clear the Caldera Shrine.',
    rewards: { gems: { fire_gem: 1 }, potions: 2 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('volcano_shrine')) return true;
      if (countCaughtFromList(profile, VOLCANO_CORE_IDS) >= 1) return true;
      return countCaughtFromList(profile, VOLCANO_ALL_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('volcano_shrine')) return 'Caldera Shrine cleared!';
      if (countCaughtFromList(profile, VOLCANO_CORE_IDS) >= 1) return '1/1 Caldera partner caught';
      const n = Math.min(2, countCaughtFromList(profile, VOLCANO_ALL_IDS));
      return `${n}/2 Caldera species caught`;
    },
    completeDialogue: 'Blazing courage, {trainer}! Pyromancer Ignis presented you with an Ember Gem 🔥 and 2 Berry Potions!',
  },
  {
    id: 'quest_peak_aurora',
    npcId: 'npc_lyra',
    title: 'Aurora Summit Seeker',
    description: 'Catch Seel, Dratini, or Dragonair on Starfall Peak, or clear the Starfall Shrine.',
    rewards: { gems: { thunder_gem: 1 }, greatBalls: 2 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('peak_shrine')) return true;
      return countCaughtFromList(profile, PEAK_CORE_IDS) >= 1;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('peak_shrine')) return 'Starfall Shrine cleared!';
      const n = Math.min(1, countCaughtFromList(profile, PEAK_CORE_IDS));
      return `${n}/1 Peak species caught`;
    },
    completeDialogue: 'Starlight smiles on you, {trainer}! Stargazer Lyra gifted you a Spark Gem ⚡ and 2 Great Balls!',
  },
  {
    id: 'quest_willow_dex',
    npcId: 'npc_willow',
    title: 'Starlight Dex Researcher',
    description: 'Register 10 unique Pokémon species in your Starlight Pokédex.',
    rewards: { greatBalls: 3, potions: 2, gems: { moon_gem: 1 } },
    check(profile) {
      return countTotalCaught(profile) >= 10;
    },
    progressText(profile) {
      const n = Math.min(10, countTotalCaught(profile));
      return `${n}/10 unique species caught`;
    },
    completeDialogue: 'Marvelous Pokédex research, {trainer}! Professor Willow rewarded you with a Starlight Gem 🌙, 3 Great Balls, and 2 Berry Potions!',
  },
  {
    id: 'quest_celeste_style',
    npcId: 'npc_celeste',
    title: 'Starlight Fashion Trailblazer',
    description: 'Explore 4+ island regions, catch 6 unique species, or evolve a partner Pokémon.',
    rewards: { starBalls: 2, gems: { leaf_gem: 1 } },
    check(profile) {
      const visited = (profile?.biomesVisited || []).length;
      const caught = countTotalCaught(profile);
      const evos = profile?.stats?.evolutions || 0;
      return visited >= 4 || evos >= 1 || caught >= 6;
    },
    progressText(profile) {
      const visited = Math.min(4, (profile?.biomesVisited || []).length);
      const caught = Math.min(6, countTotalCaught(profile));
      return `${visited}/4 regions visited or ${caught}/6 species caught (or evolve 1 Pokémon)`;
    },
    completeDialogue: 'Fabulous adventuring, {trainer}! Stylist Celeste presented you with 2 🌟 Star Balls and a Verdant Gem 🍃!',
  },
  {
    id: 'quest_yuki_peak',
    npcId: 'npc_yuki',
    title: 'Crystal Ice Sculptor',
    description: 'Catch 2 Peak, Ice, or Dragon Pokémon, or clear the Starfall Shrine.',
    rewards: { starBalls: 1, gems: { ice_gem: 1 } },
    check(profile) {
      if (profile?.shrinesCleared?.includes('peak_shrine')) return true;
      return countCaughtFromList(profile, YUKI_PEAK_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('peak_shrine')) return 'Starfall Shrine cleared!';
      const n = Math.min(2, countCaughtFromList(profile, YUKI_PEAK_IDS));
      return `${n}/2 Peak/Ice/Dragon species caught`;
    },
    completeDialogue: 'Chiseled like starlit crystal, {trainer}! Sculptor Yuki gifted you 1 🌟 Star Ball and an Aurora Gem ❄️!',
  },
  {
    id: 'quest_orion_upgrade',
    npcId: 'npc_orion',
    title: 'Star Rank Awakening',
    description: 'Use ✨ Star Shards in Team & Box to Power Up any Pokémon at least once.',
    rewards: { starShards: 4, starBalls: 1 },
    check(profile) {
      return (profile?.stats?.upgrades || 0) >= 1;
    },
    progressText(profile) {
      const n = Math.min(1, profile?.stats?.upgrades || 0);
      return `${n}/1 Pokémon powered up via Star Shards`;
    },
    completeDialogue: 'Magnificent resonance, {trainer}! Master Orion gifted you 4 ✨ Star Shards and 1 🌟 Star Ball!',
  },
  {
    id: 'quest_selene_twilight',
    npcId: 'npc_selene',
    title: 'Twilight Eclipse Watcher',
    description: 'Clear Twilight Eclipse Shrine or catch 2 Ghost/Psychic species.',
    rewards: { gems: { dusk_gem: 1 }, starShards: 3, starBalls: 1 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('eclipse_shrine')) return true;
      return countCaughtFromList(profile, TWILIGHT_QUEST_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('eclipse_shrine')) return 'Twilight Eclipse Shrine cleared!';
      const n = Math.min(2, countCaughtFromList(profile, TWILIGHT_QUEST_IDS));
      return `${n}/2 Twilight Ghost/Psychic species caught`;
    },
    completeDialogue: 'The twilight crystals sing in harmony, {trainer}! Keeper Selene gifted you a Twilight Gem 🔮, 3 ✨ Star Shards, and 1 🌟 Star Ball!',
  },
  {
    id: 'quest_hana_grove',
    npcId: 'npc_hana',
    title: 'Celestial Grove Naturalist',
    description: 'Catch 2 Celestial Grove species or clear the Celestial Grove Shrine.',
    rewards: { gems: { astral_gem: 1 }, starBalls: 1, potions: 2 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('grove_shrine')) return true;
      return countCaughtFromList(profile, GROVE_QUEST_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('grove_shrine')) return 'Celestial Grove Shrine cleared!';
      const n = Math.min(2, countCaughtFromList(profile, GROVE_QUEST_IDS));
      return `${n}/2 Celestial Grove species caught`;
    },
    completeDialogue: 'The blossoms bloom brighter for you, {trainer}! Botanist Hana gifted you an Astral Gem 🌠, 1 🌟 Star Ball, and 2 Berry Potions!',
  },
  {
    id: 'quest_sora_bond',
    npcId: 'npc_sora',
    title: 'Heartfelt Bond Master',
    description: 'Reach 60+ Bond on any owned Pokémon or perform at least 2 evolutions.',
    rewards: { gems: { astral_gem: 1 }, starShards: 4, starBalls: 1 },
    check(profile) {
      if ((profile?.stats?.evolutions || 0) >= 2) return true;
      const owned = [...(profile?.team || []), ...(profile?.box || [])];
      return owned.some((mon) => (Number(mon?.bond) || 0) >= 60);
    },
    progressText(profile) {
      const owned = [...(profile?.team || []), ...(profile?.box || [])];
      const topBond = owned.reduce((best, mon) => Math.max(best, Number(mon?.bond) || 0), 0);
      const evos = Math.min(2, profile?.stats?.evolutions || 0);
      return `Highest Bond ${Math.min(60, topBond)}/60 or ${evos}/2 evolutions`;
    },
    completeDialogue: 'True harmony shines between trainer and partner, {trainer}! Aura Master Sora rewarded you with an Astral Gem 🌠, 4 ✨ Star Shards, and 1 🌟 Star Ball!',
  },
  {
    id: 'quest_zara_desert',
    npcId: 'npc_zara',
    title: 'Sunstone Dunes Explorer',
    description: 'Catch 2 Sunstone Dunes Pokémon or clear the Sunstone Mirage Shrine.',
    rewards: { gems: { prism_gem: 1 }, starShards: 4, starBalls: 1 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('desert_shrine')) return true;
      return countCaughtFromList(profile, DESERT_QUEST_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('desert_shrine')) return 'Sunstone Mirage Shrine cleared!';
      const n = Math.min(2, countCaughtFromList(profile, DESERT_QUEST_IDS));
      return `${n}/2 Sunstone Dunes species caught`;
    },
    completeDialogue: 'Golden wisdom, {trainer}! Nomad Zara gifted you a Prism Gem 💠, 4 ✨ Star Shards, and 1 🌟 Star Ball!',
  },
  {
    id: 'quest_milo_marsh',
    npcId: 'npc_milo',
    title: 'Glowspore Bayou Chronicler',
    description: 'Catch 2 Glowspore Bayou Pokémon or clear the Glowspore Lantern Shrine.',
    rewards: { gems: { dusk_gem: 1 }, starShards: 4, starBalls: 1 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('marsh_shrine')) return true;
      return countCaughtFromList(profile, MARSH_QUEST_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('marsh_shrine')) return 'Glowspore Lantern Shrine cleared!';
      const n = Math.min(2, countCaughtFromList(profile, MARSH_QUEST_IDS));
      return `${n}/2 Glowspore Bayou species caught`;
    },
    completeDialogue: 'Radiant field notes, {trainer}! Mycologist Milo gifted you a Twilight Gem 🔮, 4 ✨ Star Shards, and 1 🌟 Star Ball!',
  },
  {
    id: 'quest_atlas_sanctum',
    npcId: 'npc_atlas',
    title: 'Astral Sky Pathfinder',
    description: 'Catch 2 Astral Sky Citadel Pokémon or clear the Astral Sky Sanctum.',
    rewards: { gems: { prism_gem: 1, astral_gem: 1 }, starShards: 5, starBalls: 2 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('sanctum_shrine')) return true;
      return countCaughtFromList(profile, SANCTUM_QUEST_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('sanctum_shrine')) return 'Astral Sky Sanctum cleared!';
      const n = Math.min(2, countCaughtFromList(profile, SANCTUM_QUEST_IDS));
      return `${n}/2 Astral Sky Citadel species caught`;
    },
    completeDialogue: 'The constellations applaud you, {trainer}! Astronomer Atlas gifted you a Prism Gem 💠, an Astral Gem 🌠, 5 ✨ Star Shards, and 2 🌟 Star Balls!',
  },
  {
    id: 'quest_kael_canyon',
    npcId: 'npc_kael',
    title: 'Thundersteppe Canyon Ranger',
    description: 'Catch 2 Thundersteppe Canyon Pokémon or clear the Thundersteppe Shrine.',
    rewards: { gems: { chrono_gem: 1 }, starShards: 5, starBalls: 1 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('canyon_shrine')) return true;
      return countCaughtFromList(profile, CANYON_QUEST_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('canyon_shrine')) return 'Thundersteppe Shrine cleared!';
      const n = Math.min(2, countCaughtFromList(profile, CANYON_QUEST_IDS));
      return `${n}/2 Thundersteppe Canyon species caught`;
    },
    completeDialogue: 'Electric teamwork, {trainer}! Stormtracker Kael gifted you a Chrono Amber ⏳, 5 ✨ Star Shards, and 1 🌟 Star Ball!',
  },
  {
    id: 'quest_cora_reef',
    npcId: 'npc_cora',
    title: 'Abyssal Pearl Cartographer',
    description: 'Catch 2 Abyssal Pearl Trench Pokémon or clear the Abyssal Pearl Shrine.',
    rewards: { gems: { nebula_gem: 1 }, starShards: 5, starBalls: 1 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('reef_shrine')) return true;
      return countCaughtFromList(profile, REEF_QUEST_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('reef_shrine')) return 'Abyssal Pearl Shrine cleared!';
      const n = Math.min(2, countCaughtFromList(profile, REEF_QUEST_IDS));
      return `${n}/2 Abyssal Pearl Trench species caught`;
    },
    completeDialogue: 'Deep-sea brilliance, {trainer}! Pearlkeeper Cora gifted you a Nebula Core ☄️, 5 ✨ Star Shards, and 1 🌟 Star Ball!',
  },
  {
    id: 'quest_chronos_ruins',
    npcId: 'npc_chronos',
    title: 'Chrono Relic Keeper',
    description: 'Catch 2 Chrono Relic Ruins Pokémon or clear the Chrono Relic Shrine.',
    rewards: { gems: { chrono_gem: 1 }, starShards: 6, starBalls: 2 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('ruins_shrine')) return true;
      return countCaughtFromList(profile, RUINS_QUEST_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('ruins_shrine')) return 'Chrono Relic Shrine cleared!';
      const n = Math.min(2, countCaughtFromList(profile, RUINS_QUEST_IDS));
      return `${n}/2 Chrono Relic Ruins species caught`;
    },
    completeDialogue: 'Timeless mastery, {trainer}! Historian Chronos gifted you a Chrono Amber ⏳, 6 ✨ Star Shards, and 2 🌟 Star Balls!',
  },
  {
    id: 'quest_vega_rift',
    npcId: 'npc_vega',
    title: 'Mythic Rift Voyager',
    description: 'Catch 2 Mythic Starlight Rift Pokémon or clear the Mythic Rift Shrine.',
    rewards: { gems: { nebula_gem: 1 }, starShards: 6, starBalls: 2 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('rift_shrine')) return true;
      return countCaughtFromList(profile, RIFT_QUEST_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('rift_shrine')) return 'Mythic Rift Shrine cleared!';
      const n = Math.min(2, countCaughtFromList(profile, RIFT_QUEST_IDS));
      return `${n}/2 Mythic Starlight Rift species caught`;
    },
    completeDialogue: 'Cosmic wonder, {trainer}! Astronomer Vega gifted you a Nebula Core ☄️, 6 ✨ Star Shards, and 2 🌟 Star Balls!',
  },
  {
    id: 'quest_valerie_faeveldt',
    npcId: 'npc_valerie',
    title: 'Pixie Faeveldt Keeper',
    description: 'Catch 2 Pixie Faeveldt Glade (Kalos) Pokémon or clear the Pixie Faeveldt Shrine.',
    rewards: { gems: { pixie_gem: 1 }, starShards: 6, starBalls: 2 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('faeveldt_shrine')) return true;
      return countCaughtFromList(profile, FAEVELDT_QUEST_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('faeveldt_shrine')) return 'Pixie Faeveldt Shrine cleared!';
      const n = Math.min(2, countCaughtFromList(profile, FAEVELDT_QUEST_IDS));
      return `${n}/2 Faeveldt species caught`;
    },
    completeDialogue: 'Enchanting grace, {trainer}! Glade Keeper Valerie gifted you a Pixie Ribbon Gem 🎀, 6 ✨ Star Shards, and 2 🌟 Star Balls!',
  },
  {
    id: 'quest_lani_atoll',
    npcId: 'npc_lani',
    title: 'Sunburst Atoll Voyagers',
    description: 'Catch 2 Sunburst Alola Atoll Pokémon or clear the Sunburst Atoll Shrine.',
    rewards: { gems: { alola_gem: 1 }, starShards: 6, starBalls: 2 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('atoll_shrine')) return true;
      return countCaughtFromList(profile, ATOLL_QUEST_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('atoll_shrine')) return 'Sunburst Atoll Shrine cleared!';
      const n = Math.min(2, countCaughtFromList(profile, ATOLL_QUEST_IDS));
      return `${n}/2 Alola Atoll species caught`;
    },
    completeDialogue: 'Sunburst aloha, {trainer}! Guide Lani gifted you an Island Kahuna Shell 🌺, 6 ✨ Star Shards, and 2 🌟 Star Balls!',
  },
  {
    id: 'quest_sonia_highlands',
    npcId: 'npc_sonia',
    title: 'Iron Crown Chronicler',
    description: 'Catch 2 Iron Crown Highlands (Galar/Hisui) Pokémon or clear the Iron Crown Shrine.',
    rewards: { gems: { crown_gem: 1 }, starShards: 7, starBalls: 2 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('highlands_shrine')) return true;
      return countCaughtFromList(profile, HIGHLANDS_QUEST_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('highlands_shrine')) return 'Iron Crown Shrine cleared!';
      const n = Math.min(2, countCaughtFromList(profile, HIGHLANDS_QUEST_IDS));
      return `${n}/2 Highlands species caught`;
    },
    completeDialogue: 'Royal scholarship, {trainer}! Warden Sonia gifted you a Sovereign Crest 🛡️, 7 ✨ Star Shards, and 2 🌟 Star Balls!',
  },
  {
    id: 'quest_briar_crater',
    npcId: 'npc_briar',
    title: 'Terastal Crystal Pioneer',
    description: 'Catch 2 Terastal Crystal Crater (Paldea) Pokémon or clear the Terastal Crystal Shrine.',
    rewards: { gems: { tera_gem: 1 }, starShards: 8, starBalls: 2 },
    check(profile) {
      if (profile?.shrinesCleared?.includes('crater_shrine')) return true;
      return countCaughtFromList(profile, CRATER_QUEST_IDS) >= 2;
    },
    progressText(profile) {
      if (profile?.shrinesCleared?.includes('crater_shrine')) return 'Terastal Crystal Shrine cleared!';
      const n = Math.min(2, countCaughtFromList(profile, CRATER_QUEST_IDS));
      return `${n}/2 Crater species caught`;
    },
    completeDialogue: 'Breakthrough brilliance, {trainer}! Researcher Briar gifted you a Terastal Shard 💎, 8 ✨ Star Shards, and 2 🌟 Star Balls!',
  },
];

export const RIVAL_TRAINERS = {
  '11,5': {
    id: 'rival_leo',
    name: 'Forest Ranger Leo',
    role: 'Whispering Forest Challenger',
    biome: 'forest',
    palette: {
      outfitPrimary: '#15803d',
      outfitSecondary: '#fde047',
      hair: '#78350f',
      skin: '#f6cfa9',
      hat: '#166534',
      accent: '#4ade80',
    },
    party: [
      { speciesId: 16, level: 5 },
      { speciesId: 43, level: 6 },
    ],
    rematchPool: [18, 45, 12, 26, 123, 154, 214, 389],
    rewards: { greatBalls: 2, potions: 2, gems: { leaf_gem: 1 } },
    rematchRewards: { greatBalls: 1, potions: 1 },
    intro: 'Hey {trainer}! Ready to test your teamwork under the forest canopy? Let’s battle!',
    rematchIntro: 'Back for a woodland rematch, {trainer}? My partners trained hard!',
    winText: 'Awesome teamwork, {trainer}! Forest Ranger Leo gifted you a Verdant Gem 🍃 and Ranger supplies!',
    rematchWinText: 'Sharp strategy, {trainer}! Leo shared bonus Ranger supplies after a great rematch!',
  },
  '31,8': {
    id: 'rival_aria',
    name: 'Crystal Ace Aria',
    role: 'Crystal Cavern Challenger',
    biome: 'cave',
    palette: {
      outfitPrimary: '#7e22ce',
      outfitSecondary: '#22d3ee',
      hair: '#1e1b4b',
      skin: '#fde2c8',
      hat: '#581c87',
      accent: '#e879f9',
    },
    party: [
      { speciesId: 64, level: 10 },
      { speciesId: 196, level: 11 },
    ],
    rematchPool: [65, 94, 197, 282, 306, 429, 526, 208],
    rewards: { greatBalls: 2, gems: { moon_gem: 1 } },
    rematchRewards: { greatBalls: 1 },
    intro: 'The crystals shimmer when strong trainers meet, {trainer}! Show me your sparkle!',
    rematchIntro: 'The cavern echoes with our rematch spirit, {trainer}!',
    winText: 'Dazzling victory, {trainer}! Crystal Ace Aria rewarded you with a Starlight Gem 🌙 and Great Balls!',
    rematchWinText: 'Brilliant battle, {trainer}! Aria handed you a Great Ball for another stellar duel!',
  },
  '7,30': {
    id: 'rival_kai',
    name: 'Tide Captain Kai',
    role: 'Sapphire Lagoon Challenger',
    biome: 'water',
    palette: {
      outfitPrimary: '#0369a1',
      outfitSecondary: '#fde047',
      hair: '#0f172a',
      skin: '#f6cfa9',
      hat: '#0284c7',
      accent: '#38bdf8',
    },
    party: [
      { speciesId: 61, level: 10 },
      { speciesId: 117, level: 12 },
    ],
    rematchPool: [62, 186, 230, 121, 130, 131, 160, 395],
    rewards: { starBalls: 1, gems: { water_gem: 1 } },
    rematchRewards: { greatBalls: 2 },
    intro: 'Ahoy, {trainer}! Think your crew can ride the Sapphire Lagoon waves? Battle stations!',
    rematchIntro: 'High tide rematch, {trainer}! Let’s make a splash!',
    winText: 'Smooth sailing, {trainer}! Tide Captain Kai gifted you a 🌟 Star Ball and a Tide Gem 💧!',
    rematchWinText: 'First-mate form, {trainer}! Kai shared extra Great Balls from his sea chest!',
  },
  '45,14': {
    id: 'rival_blaze',
    name: 'Caldera Champion Blaze',
    role: 'Ember Caldera Challenger',
    biome: 'volcano',
    palette: {
      outfitPrimary: '#c2410c',
      outfitSecondary: '#fef08a',
      hair: '#450a0a',
      skin: '#fde2c8',
      hat: '#9a3412',
      accent: '#fb923c',
    },
    party: [
      { speciesId: 59, level: 14 },
      { speciesId: 181, level: 15 },
      { speciesId: 471, level: 16 },
    ],
    rematchPool: [38, 126, 467, 157, 257, 392, 466, 637],
    rewards: { starBalls: 2, gems: { ice_gem: 1 } },
    rematchRewards: { starBalls: 1, potions: 2 },
    intro: 'Welcome to Ember Caldera, {trainer}! Show me if your team can outshine fire, thunder, and frost!',
    rematchIntro: 'Ready to turn up the heat again, {trainer}? Let’s clash at full power!',
    winText: 'Unstoppable spirit, {trainer}! Caldera Champion Blaze awarded you 2 🌟 Star Balls and an Aurora Gem ❄️!',
    rematchWinText: 'True Champion caliber, {trainer}! Blaze gifted you a 🌟 Star Ball and Berry Potions!',
  },
  '46,30': {
    id: 'rival_astra',
    name: 'Aurora Ace Astra',
    role: 'Starfall Peak Challenger',
    biome: 'peak',
    palette: {
      outfitPrimary: '#4338ca',
      outfitSecondary: '#fef08a',
      hair: '#f8fafc',
      skin: '#fde2c8',
      hat: '#312e81',
      accent: '#38bdf8',
    },
    party: [
      { speciesId: 334, level: 17 },
      { speciesId: 365, level: 18 },
      { speciesId: 282, level: 19 },
    ],
    rematchPool: [149, 473, 461, 478, 359, 227, 460, 584],
    rewards: { starBalls: 2, starShards: 4, gems: { sun_gem: 1 } },
    rematchRewards: { starBalls: 1, starShards: 3 },
    intro: 'The auroras shine brightest for fearless challengers, {trainer}! Ready to face Starfall Peak’s finest?',
    rematchIntro: 'Back beneath the starlight ridge, {trainer}? Let’s dance with aurora power again!',
    winText: 'Radiant victory, {trainer}! Aurora Ace Astra gifted you 2 🌟 Star Balls, 4 ✨ Star Shards, and a Sunburst Gem ☀️!',
    rematchWinText: 'Celestial teamwork, {trainer}! Astra shared a 🌟 Star Ball and 3 ✨ Star Shards after an unforgettable rematch!',
  },
  '38,41': {
    id: 'rival_kieran',
    name: 'Astral Envoy Kieran',
    role: 'Celestial Grove Challenger',
    biome: 'grove',
    palette: {
      outfitPrimary: '#0f766e',
      outfitSecondary: '#fbcfe8',
      hair: '#312e81',
      skin: '#fde2c8',
      hat: '#115e59',
      accent: '#2dd4bf',
    },
    party: [
      { speciesId: 254, level: 18 },
      { speciesId: 350, level: 19 },
      { speciesId: 448, level: 21 },
    ],
    rematchPool: [468, 475, 3, 6, 9, 547, 549, 571],
    rewards: { starBalls: 2, starShards: 5, gems: { astral_gem: 1 } },
    rematchRewards: { starBalls: 1, starShards: 4 },
    intro: 'The sakura starlight foretold your arrival, {trainer}! Let’s test our Celestial Grove partners in battle!',
    rematchIntro: 'Ready for another radiant clash beneath the sakura canopy, {trainer}?',
    winText: 'Luminous strategy, {trainer}! Astral Envoy Kieran gifted you 2 🌟 Star Balls, 5 ✨ Star Shards, and an Astral Gem 🌠!',
    rematchWinText: 'Your bond glows like a comet, {trainer}! Kieran shared 1 🌟 Star Ball and 4 ✨ Star Shards after a thrilling rematch!',
  },
  '60,18': {
    id: 'rival_sahara',
    name: 'Mirage Ace Sahara',
    role: 'Sunstone Dunes Challenger',
    biome: 'desert',
    palette: {
      outfitPrimary: '#b45309',
      outfitSecondary: '#fde047',
      hair: '#451a03',
      skin: '#f6cfa9',
      hat: '#92400e',
      accent: '#fbbf24',
    },
    party: [
      { speciesId: 330, level: 19 },
      { speciesId: 553, level: 20 },
      { speciesId: 445, level: 22 },
    ],
    rematchPool: [28, 464, 232, 248, 450, 555, 530, 344],
    rewards: { starBalls: 2, starShards: 5, gems: { prism_gem: 1 } },
    rematchRewards: { starBalls: 1, starShards: 4 },
    intro: 'The desert mirage sharpens every battle instinct, {trainer}! Ready to challenge Sunstone Dunes’ finest?',
    rematchIntro: 'Back across the golden sands, {trainer}? Let’s raise another desert storm!',
    winText: 'Blistering brilliance, {trainer}! Mirage Ace Sahara gifted you 2 🌟 Star Balls, 5 ✨ Star Shards, and a Prism Gem 💠!',
    rematchWinText: 'True sandstorm mastery, {trainer}! Sahara shared 1 🌟 Star Ball and 4 ✨ Star Shards after a thrilling rematch!',
  },
  '24,53': {
    id: 'rival_nyx',
    name: 'Bayou Mystic Nyx',
    role: 'Glowspore Bayou Challenger',
    biome: 'marsh',
    palette: {
      outfitPrimary: '#581c87',
      outfitSecondary: '#2dd4bf',
      hair: '#1e1b4b',
      skin: '#fde2c8',
      hat: '#0f766e',
      accent: '#c084fc',
    },
    party: [
      { speciesId: 272, level: 21 },
      { speciesId: 407, level: 22 },
      { speciesId: 609, level: 23 },
    ],
    rematchPool: [260, 286, 195, 477, 579, 469, 452, 454],
    rewards: { starBalls: 2, starShards: 5, gems: { leaf_gem: 1 } },
    rematchRewards: { starBalls: 1, starShards: 4 },
    intro: 'The lantern spores dance to our rhythm, {trainer}! Step onto the bayou boardwalk and battle me!',
    rematchIntro: 'Ready for another glowing duel in Glowspore Bayou, {trainer}?',
    winText: 'Enchanting tactics, {trainer}! Bayou Mystic Nyx gifted you 2 🌟 Star Balls, 5 ✨ Star Shards, and a Verdant Gem 🍃!',
    rematchWinText: 'Your team gleams brighter than bayou spores, {trainer}! Nyx shared 1 🌟 Star Ball and 4 ✨ Star Shards!',
  },
  '59,46': {
    id: 'rival_zephyr',
    name: 'Zenith Champion Zephyr',
    role: 'Astral Sky Citadel Challenger',
    biome: 'sanctum',
    palette: {
      outfitPrimary: '#312e81',
      outfitSecondary: '#fde047',
      hair: '#e2e8f0',
      skin: '#fde2c8',
      hat: '#1e1b4b',
      accent: '#67e8f9',
    },
    party: [
      { speciesId: 462, level: 24 },
      { speciesId: 635, level: 25 },
      { speciesId: 376, level: 26 },
    ],
    rematchPool: [474, 612, 576, 625, 475, 468, 248, 373],
    rewards: { starBalls: 3, starShards: 6, gems: { astral_gem: 1 } },
    rematchRewards: { starBalls: 2, starShards: 5 },
    intro: 'Only trainers with sky-high resolve ascend Astral Sky Citadel, {trainer}! Show me your ultimate synergy!',
    rematchIntro: 'Once more beneath the zenith stars, {trainer}? Let’s clash at full cosmic strength!',
    winText: 'Transcendent victory, {trainer}! Zenith Champion Zephyr awarded you 3 🌟 Star Balls, 6 ✨ Star Shards, and an Astral Gem 🌠!',
    rematchWinText: 'Champion-grade brilliance, {trainer}! Zephyr gifted you 2 🌟 Star Balls and 5 ✨ Star Shards!',
  },
  '78,18': {
    id: 'rival_volt',
    name: 'Storm Ace Volt',
    role: 'Thundersteppe Canyon Challenger',
    biome: 'canyon',
    palette: {
      outfitPrimary: '#b45309',
      outfitSecondary: '#fde047',
      hair: '#1e293b',
      skin: '#f6cfa9',
      hat: '#92400e',
      accent: '#facc15',
    },
    party: [
      { speciesId: 405, level: 22 },
      { speciesId: 466, level: 23 },
      { speciesId: 523, level: 24 },
    ],
    rematchPool: [101, 135, 310, 472, 604, 620, 539, 128],
    rewards: { starBalls: 2, starShards: 6, gems: { chrono_gem: 1 } },
    rematchRewards: { starBalls: 1, starShards: 5 },
    intro: 'The canyon storms answer our speed, {trainer}! Can your team outpace Thundersteppe Canyon’s finest?',
    rematchIntro: 'Back for a lightning-fast canyon rematch, {trainer}? Let’s spark the sky!',
    winText: 'Electrifying victory, {trainer}! Storm Ace Volt gifted you 2 🌟 Star Balls, 6 ✨ Star Shards, and a Chrono Amber ⏳!',
    rematchWinText: 'Blinding brilliance, {trainer}! Volt shared 1 🌟 Star Ball and 5 ✨ Star Shards!',
  },
  '22,63': {
    id: 'rival_coral',
    name: 'Abyssal Diver Coral',
    role: 'Abyssal Pearl Trench Challenger',
    biome: 'reef',
    palette: {
      outfitPrimary: '#0369a1',
      outfitSecondary: '#fbcfe8',
      hair: '#0f172a',
      skin: '#fde2c8',
      hat: '#0e7490',
      accent: '#38bdf8',
    },
    party: [
      { speciesId: 171, level: 24 },
      { speciesId: 350, level: 25 },
      { speciesId: 593, level: 26 },
    ],
    rematchPool: [73, 80, 199, 319, 368, 457, 565, 594],
    rewards: { starBalls: 2, starShards: 6, gems: { nebula_gem: 1 } },
    rematchRewards: { starBalls: 1, starShards: 5 },
    intro: 'Dive deep into the pearl currents, {trainer}! Show me if your team can weather the Abyssal Trench!',
    rematchIntro: 'Ready to ride the pearl waves again, {trainer}? Let’s battle beneath the coral arch!',
    winText: 'Radiant tide mastery, {trainer}! Abyssal Diver Coral gifted you 2 🌟 Star Balls, 6 ✨ Star Shards, and a Nebula Core ☄️!',
    rematchWinText: 'Seamless current synergy, {trainer}! Coral shared 1 🌟 Star Ball and 5 ✨ Star Shards!',
  },
  '56,68': {
    id: 'rival_chrono',
    name: 'Chrono Sentinel Chrono',
    role: 'Chrono Relic Ruins Challenger',
    biome: 'ruins',
    palette: {
      outfitPrimary: '#78350f',
      outfitSecondary: '#fbbf24',
      hair: '#334155',
      skin: '#fde2c8',
      hat: '#451a03',
      accent: '#f59e0b',
    },
    party: [
      { speciesId: 344, level: 27 },
      { speciesId: 437, level: 28 },
      { speciesId: 623, level: 29 },
    ],
    rematchPool: [139, 141, 142, 346, 348, 409, 411, 561],
    rewards: { starBalls: 3, starShards: 7, gems: { chrono_gem: 1 } },
    rematchRewards: { starBalls: 2, starShards: 5 },
    intro: 'Only trainers with timeless resolve unlock Chrono Relic Ruins, {trainer}! Face my ancient guardians!',
    rematchIntro: 'The clockwork chimes for another clash, {trainer}! Ready to test time itself?',
    winText: 'Monumental triumph, {trainer}! Chrono Sentinel Chrono awarded you 3 🌟 Star Balls, 7 ✨ Star Shards, and a Chrono Amber ⏳!',
    rematchWinText: 'Timeless precision, {trainer}! Chrono shared 2 🌟 Star Balls and 5 ✨ Star Shards!',
  },
  '77,48': {
    id: 'rival_nova',
    name: 'Rift Paragon Nova',
    role: 'Mythic Starlight Rift Challenger',
    biome: 'rift',
    palette: {
      outfitPrimary: '#581c87',
      outfitSecondary: '#f472b6',
      hair: '#f8fafc',
      skin: '#fde2c8',
      hat: '#3b0764',
      accent: '#e879f9',
    },
    party: [
      { speciesId: 612, level: 30 },
      { speciesId: 637, level: 31 },
      { speciesId: 635, level: 32 },
    ],
    rematchPool: [426, 479, 442, 474, 373, 376, 445, 468],
    rewards: { starBalls: 3, starShards: 8, gems: { nebula_gem: 1 } },
    rematchRewards: { starBalls: 2, starShards: 6 },
    intro: 'Beyond the stars lies Mythic Starlight Rift, {trainer}! Show me everything you and your partners have learned!',
    rematchIntro: 'Returned to the Rift nexus, {trainer}? Let’s ignite a supernova duel!',
    winText: 'Mythic victory, {trainer}! Rift Paragon Nova awarded you 3 🌟 Star Balls, 8 ✨ Star Shards, and a Nebula Core ☄️!',
    rematchWinText: 'Starlight legend, {trainer}! Nova gifted you 2 🌟 Star Balls and 6 ✨ Star Shards!',
  },
  '94,26': {
    id: 'rival_serena',
    name: 'Pixie Maestro Serena',
    role: 'Pixie Faeveldt Glade Challenger',
    biome: 'faeveldt',
    palette: {
      outfitPrimary: '#db2777',
      outfitSecondary: '#fbcfe8',
      hair: '#d97706',
      skin: '#fde2c8',
      hat: '#9d174d',
      accent: '#f9a8d4',
    },
    party: [
      { speciesId: 658, level: 26 },
      { speciesId: 681, level: 27 },
      { speciesId: 700, level: 28 },
    ],
    rematchPool: [652, 655, 671, 675, 678, 683, 685, 706],
    rewards: { starBalls: 2, starShards: 6, gems: { pixie_gem: 1 } },
    rematchRewards: { starBalls: 1, starShards: 5 },
    intro: 'The pastel meadows shimmer for our showcase, {trainer}! Ready to face Pixie Faeveldt Glade’s finest?',
    rematchIntro: 'Encore beneath the fairy blossoms, {trainer}? Let’s dazzle the glade!',
    winText: 'Radiant performance, {trainer}! Pixie Maestro Serena gifted you 2 🌟 Star Balls, 6 ✨ Star Shards, and a Pixie Ribbon Gem 🎀!',
    rematchWinText: 'Graceful synergy, {trainer}! Serena shared 1 🌟 Star Ball and 5 ✨ Star Shards!',
  },
  '38,76': {
    id: 'rival_hau',
    name: 'Alola Champion Hau',
    role: 'Sunburst Alola Atoll Challenger',
    biome: 'atoll',
    palette: {
      outfitPrimary: '#ea580c',
      outfitSecondary: '#fde047',
      hair: '#14532d',
      skin: '#f6cfa9',
      hat: '#0284c7',
      accent: '#fb923c',
    },
    party: [
      { speciesId: 724, level: 28 },
      { speciesId: 745, level: 29 },
      { speciesId: 784, level: 30 },
    ],
    rematchPool: [727, 730, 743, 750, 752, 760, 763, 778],
    rewards: { starBalls: 2, starShards: 7, gems: { alola_gem: 1 } },
    rematchRewards: { starBalls: 1, starShards: 5 },
    intro: 'Alola, {trainer}! My partners and I love battling on the warm boardwalk—let’s give it our best!',
    rematchIntro: 'Back for another Sunburst Atoll showdown, {trainer}? Awesome!',
    winText: 'Whoa, awesome battle, {trainer}! Alola Champion Hau gifted you 2 🌟 Star Balls, 7 ✨ Star Shards, and an Island Kahuna Shell 🌺!',
    rematchWinText: 'Malasada-fueled rematch, {trainer}! Hau shared 1 🌟 Star Ball and 5 ✨ Star Shards!',
  },
  '74,76': {
    id: 'rival_leon',
    name: 'Highland Ace Leon',
    role: 'Iron Crown Highlands Challenger',
    biome: 'highlands',
    palette: {
      outfitPrimary: '#312e81',
      outfitSecondary: '#facc15',
      hair: '#7e22ce',
      skin: '#f6cfa9',
      hat: '#1e293b',
      accent: '#94a3b8',
    },
    party: [
      { speciesId: 823, level: 30 },
      { speciesId: 849, level: 31 },
      { speciesId: 887, level: 32 },
    ],
    rematchPool: [812, 815, 818, 851, 861, 879, 884, 901],
    rewards: { starBalls: 3, starShards: 7, gems: { crown_gem: 1 } },
    rematchRewards: { starBalls: 2, starShards: 5 },
    intro: 'Welcome to Iron Crown Highlands, {trainer}! Show me if your team can topple a Champion-time showcase!',
    rematchIntro: 'Ready for a sovereign rematch on the highland road, {trainer}?',
    winText: 'Champion-grade courage, {trainer}! Highland Ace Leon awarded you 3 🌟 Star Balls, 7 ✨ Star Shards, and a Sovereign Crest 🛡️!',
    rematchWinText: 'Unbeatable resolve, {trainer}! Leon shared 2 🌟 Star Balls and 5 ✨ Star Shards!',
  },
  '93,64': {
    id: 'rival_nemona',
    name: 'Terastal Ace Nemona',
    role: 'Terastal Crystal Crater Challenger',
    biome: 'crater',
    palette: {
      outfitPrimary: '#0e7490',
      outfitSecondary: '#facc15',
      hair: '#1e293b',
      skin: '#fde2c8',
      hat: '#4338ca',
      accent: '#38bdf8',
    },
    party: [
      { speciesId: 908, level: 33 },
      { speciesId: 959, level: 34 },
      { speciesId: 998, level: 35 },
    ],
    rematchPool: [911, 914, 923, 936, 937, 941, 980, 983],
    rewards: { starBalls: 3, starShards: 8, gems: { tera_gem: 1 } },
    rematchRewards: { starBalls: 2, starShards: 6 },
    intro: 'Ooh, {trainer}! A true treasure hunt in Terastal Crystal Crater deserves an all-out crystal battle!',
    rematchIntro: 'Yes!! Ready for another crystal-powered rematch, {trainer}?',
    winText: 'Dazzling Terastal triumph, {trainer}! Terastal Ace Nemona awarded you 3 🌟 Star Balls, 8 ✨ Star Shards, and a Terastal Shard 💎!',
    rematchWinText: 'You keep getting stronger, {trainer}! Nemona shared 2 🌟 Star Balls and 6 ✨ Star Shards!',
  },
};

export const LANDMARKS = {
  '16,11': {
    id: 'landmark_telescope',
    name: 'Starlight Telescope',
    biome: 'village',
    icon: '🔭',
    description: 'Through the brass lens, you spot smoke rising over Ember Caldera in the northeast and glittering aurora ribbons over Starfall Peak in the southeast!',
  },
  '9,3': {
    id: 'landmark_great_tree',
    name: 'Whispering Great Tree',
    biome: 'forest',
    icon: '🌳',
    description: 'Ancient emerald leaves shimmer overhead. Golden sparkles in nearby tall grass often attract rare friends—or even a Starlight Shimmer Pokémon!',
  },
  '42,9': {
    id: 'landmark_caldera_cairn',
    name: 'Ancient Caldera Cairn',
    biome: 'volcano',
    icon: '🪨',
    description: 'Stacked obsidian stones warm the air around the magma basin. An Ember Gem can awaken Fire-hearted Pokémon like Vulpix, Growlithe, or Eevee!',
  },
  '12,32': {
    id: 'landmark_coral_arch',
    name: 'Singing Coral Arch',
    biome: 'water',
    icon: '🪸',
    description: 'Gentle tides hum musical chords through rose-pearl coral. Just east across the Aurora Pier Bridge rises snowy Starfall Peak!',
  },
  '34,30': {
    id: 'landmark_aurora_spire',
    name: 'Aurora Star Spire',
    biome: 'peak',
    icon: '🌠',
    description: 'A crystalline obelisk that gathers falling starlight. Trainers say rare Dratini and Dragonair dance in the frosty grass near the summit!',
  },
  '7,8': {
    id: 'landmark_starlight_forge',
    name: 'Starlight Shard Pillar',
    biome: 'forest',
    icon: '✨',
    description: 'A humming crystal pillar etched with Star Ranks (★1–★5). Collect ✨ Star Shards from wild battles, shrines, chests, and rivals—then open Team & Box in your Pokédex to Power Up any partner!',
  },
  '25,13': {
    id: 'landmark_eclipse_monolith',
    name: 'Twilight Eclipse Monolith',
    biome: 'cave',
    icon: '🔮',
    description: 'Violet-gold runes point west to the Twilight Eclipse Shrine, where Gardevoir guards the Eclipse Badge. A Twilight Gem 🔮 awakens Steelix or Umbreon, while a Sunburst Gem ☀️ awakens Bellossom, Politoed, or Altaria!',
  },
  '6,41': {
    id: 'landmark_sakura_arbor',
    name: 'Sakura Star Arbor',
    biome: 'grove',
    icon: '🌸',
    description: 'An ancient blossom archway woven with glowing starlight vines. Wild Togepi, Treecko, and Riolu love playing in the emerald meadow nearby—and an Astral Gem 🌠 awakens Togetic, Riolu, Feebas, or Kirlia!',
  },
  '22,44': {
    id: 'landmark_astral_sundial',
    name: 'Astral Lotus Sundial',
    biome: 'grove',
    icon: '🌠',
    description: 'A moonstone dial aligned with Jirachi’s Celestial Grove Shrine to the east. Partners with 60+ Bond (Trusted Buddy 💖) gain battle perks and may even tough out a knockout blow at 1 HP!',
  },
  '56,4': {
    id: 'landmark_sunstone_obelisk',
    name: 'Sunstone Obelisk',
    biome: 'desert',
    icon: '🏜️',
    description: 'A radiant sandstone pillar humming with solar resonance. Trainers say Prism Gems 💠 awaken Rhydon, Boldore, Magneton, Porygon2, and Dusclops into unstoppable titans!',
  },
  '10,52': {
    id: 'landmark_glowspore_lantern',
    name: 'Giant Glowspore Lantern',
    biome: 'marsh',
    icon: '🍄',
    description: 'A towering bioluminescent mushroom spire guiding travelers over the misty boardwalks toward Celebi’s Glowspore Lantern Shrine in the east!',
  },
  '59,36': {
    id: 'landmark_astral_orrery',
    name: 'Astral Sky Orrery',
    biome: 'sanctum',
    icon: '🌌',
    description: 'Spinning golden rings chart every constellation above Starlight Island, aligning the path south toward Rayquaza’s Astral Sky Sanctum!',
  },
  '74,8': {
    id: 'landmark_canyon_spire',
    name: 'Thundersteppe Tesla Spire',
    biome: 'canyon',
    icon: '⚡',
    description: 'A towering sandstone lightning rod humming with savannah stormlight, pointing north toward Raikou’s Thundersteppe Shrine!',
  },
  '6,65': {
    id: 'landmark_pearl_trench',
    name: 'Bioluminescent Pearl Arch',
    biome: 'reef',
    icon: '🪸',
    description: 'An iridescent coral arch cradling a radiant sea pearl. Follow the glowing pearl boardwalks southeast to challenge Kyogre’s Abyssal Pearl Shrine!',
  },
  '40,68': {
    id: 'landmark_chrono_sundial',
    name: 'Great Chrono Sundial',
    biome: 'ruins',
    icon: '🏛️',
    description: 'A bronze clockwork monolith whose amber hands resonate with Chrono Amber ⏳ evolutions and Dialga’s Chrono Relic Shrine to the northeast!',
  },
  '76,36': {
    id: 'landmark_rift_nexus',
    name: 'Starlight Rift Nexus',
    biome: 'rift',
    icon: '☄️',
    description: 'A floating prismatic crystal core where Nebula Core ☄️ energy converges, guiding fearless trainers south toward Arceus’s Mythic Rift Shrine!',
  },
  '95,10': {
    id: 'landmark_faeveldt_arch',
    name: 'Pixie Blossom Arch',
    biome: 'faeveldt',
    icon: '🧚',
    description: 'A shimmering rose-quartz fairy archway humming with Pixie Ribbon Gem 🎀 resonance, guiding explorers north toward Xerneas’s Pixie Faeveldt Shrine!',
  },
  '13,75': {
    id: 'landmark_atoll_altar',
    name: 'Sunburst Moon Altar',
    biome: 'atoll',
    icon: '🌺',
    description: 'A sunlit coral & golden-shell altar aligned with Solgaleo’s Sunburst Atoll Shrine and Island Kahuna Shell 🌺 evolutions!',
  },
  '68,75': {
    id: 'landmark_highlands_citadel',
    name: 'Iron Crown Monolith',
    biome: 'highlands',
    icon: '🛡️',
    description: 'A forged slate monument carved with twin wolf crests, honoring Sovereign Crest 🛡️ evolutions and Zacian’s Iron Crown Shrine east!',
  },
  '88,60': {
    id: 'landmark_crater_tera_core',
    name: 'Terastal Zero Core',
    biome: 'crater',
    icon: '💎',
    description: 'A radiant Area Zero crystal prism pulsing with Terastal Shard 💎 starlight, pointing south toward Terapagos’s Terastal Crystal Shrine!',
  },
};

export const SECRET_ARCADE_SPOT = {
  id: 'starlight_arcade',
  name: 'Starlight Sky-Hop Cabinet',
  x: 11,
  y: 12,
  key: '11,12',
  icon: '🕹️',
  biome: 'village',
  description: 'A hidden star-marked cottage wall east of Professor Willow! Earn 1 Badge or register 5 Pokémon species to attune your Starlight, then knock 3 times to reveal the Starlight Sky-Hop arcade!',
};

export function getBiomeAt(x, y) {
  if (x >= 84) return y <= 41 ? BIOMES.faeveldt : BIOMES.crater;
  if (y >= 72) return x <= 49 ? BIOMES.atoll : BIOMES.highlands;
  if (x >= 68) return y <= 29 ? BIOMES.canyon : BIOMES.rift;
  if (y >= 60) return x <= 35 ? BIOMES.reef : BIOMES.ruins;
  if (x >= 52) {
    return y <= 29 ? BIOMES.desert : BIOMES.sanctum;
  }
  if (y >= 48) {
    return x <= 35 ? BIOMES.marsh : BIOMES.sanctum;
  }
  if (y >= 38) return BIOMES.grove;
  if (y <= 9 && x <= 19) return BIOMES.forest;
  if (x >= 20 && x <= 35 && y <= 17) return BIOMES.cave;
  if (x >= 36 && y <= 18) return BIOMES.volcano;
  if ((x >= 36 && y >= 19) || (x >= 26 && y >= 28)) return BIOMES.peak;
  if (y >= 18) return BIOMES.water;
  return BIOMES.village;
}

export function isTileWalkableAt(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x >= WORLD_COLS || y >= WORLD_ROWS) return false;
  const key = `${x},${y}`;
  if (NPCS[key] || LANDMARKS[key] || RIVAL_TRAINERS[key]) return false;
  const tile = WORLD_MAP[y]?.[x];
  return tile !== undefined && !SOLID_TILES.has(tile);
}

const DEFAULT_SPAWN = { x: 8, y: 15, dir: 'down' };

let _depthLookupCache = null;

function getDepthLookupCache() {
  if (_depthLookupCache) return _depthLookupCache;
  const shrinesByBiome = {};
  for (const [key, shrine] of Object.entries(SHRINES)) {
    const [sx, sy] = key.split(',').map(Number);
    if (!shrinesByBiome[shrine.biome]) shrinesByBiome[shrine.biome] = [];
    shrinesByBiome[shrine.biome].push([sx, sy]);
  }
  const maxDistByBiome = {};
  for (let ry = 0; ry < WORLD_ROWS; ry++) {
    for (let rx = 0; rx < WORLD_COLS; rx++) {
      const bId = getBiomeAt(rx, ry).id;
      const list = shrinesByBiome[bId];
      if (!list) continue;
      let minD = Infinity;
      for (const [sx, sy] of list) {
        const d = Math.hypot(rx - sx, ry - sy);
        if (d < minD) minD = d;
      }
      if (!maxDistByBiome[bId] || minD > maxDistByBiome[bId]) {
        maxDistByBiome[bId] = minD;
      }
    }
  }
  _depthLookupCache = { shrinesByBiome, maxDistByBiome };
  return _depthLookupCache;
}

const DEPTH_ZONE_LABELS = ['Outskirts', 'Heartland', 'Deep Wilds'];

export function getTileDepthInfo(x, y) {
  const validX = x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x));
  const validY = y !== null && y !== undefined && y !== '' && Number.isFinite(Number(y));
  const cx = validX
    ? Math.max(0, Math.min(WORLD_COLS - 1, Math.round(Number(x))))
    : DEFAULT_SPAWN.x;
  const cy = validY
    ? Math.max(0, Math.min(WORLD_ROWS - 1, Math.round(Number(y))))
    : DEFAULT_SPAWN.y;
  const biome = getBiomeAt(cx, cy);
  const { shrinesByBiome, maxDistByBiome } = getDepthLookupCache();
  const list = shrinesByBiome[biome.id];
  if (!list || list.length === 0) {
    return { biomeId: biome.id, depthTier: 0, zoneLabel: DEPTH_ZONE_LABELS[0] };
  }
  let minD = Infinity;
  for (const [sx, sy] of list) {
    const d = Math.hypot(cx - sx, cy - sy);
    if (d < minD) minD = d;
  }
  const maxD = maxDistByBiome[biome.id] || 1;
  const proximity = 1 - minD / maxD;
  // Keep the southern Whispering Forest entrance corridor as Outskirts (depthTier 0)
  // so newly arrived trainers stepping north from Starlight Village aren't pushed into Heartland.
  const isSouthernForestOutskirts = (
    biome.id === 'forest'
    && cy >= 6
    && cx >= 5
    && cx <= 13
    && minD > 4.5
  );
  let depthTier = 0;
  if (minD <= 4.5 || (!isSouthernForestOutskirts && proximity >= 0.67)) {
    depthTier = 2;
  } else if (!isSouthernForestOutskirts && proximity >= 0.34) {
    depthTier = 1;
  }
  return {
    biomeId: biome.id,
    depthTier,
    zoneLabel: DEPTH_ZONE_LABELS[depthTier],
  };
}

export function findNearestSafePosition(x, y, dir = 'down') {
  const safeDir = ['up', 'down', 'left', 'right'].includes(dir) ? dir : 'down';
  if (Number.isFinite(x) && Number.isFinite(y)) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (isTileWalkableAt(rx, ry)) {
      return { x: rx, y: ry, dir: safeDir };
    }
  }

  const startX = Number.isFinite(x) ? Math.max(0, Math.min(WORLD_COLS - 1, Math.round(x))) : DEFAULT_SPAWN.x;
  const startY = Number.isFinite(y) ? Math.max(0, Math.min(WORLD_ROWS - 1, Math.round(y))) : DEFAULT_SPAWN.y;
  const visited = new Set([`${startX},${startY}`]);
  const queue = [[startX, startY]];
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  while (queue.length > 0) {
    const [cx, cy] = queue.shift();
    if (isTileWalkableAt(cx, cy)) {
      return { x: cx, y: cy, dir: safeDir };
    }
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_COLS || ny >= WORLD_ROWS) continue;
      const k = `${nx},${ny}`;
      if (!visited.has(k)) {
        visited.add(k);
        queue.push([nx, ny]);
      }
    }
  }

  return { ...DEFAULT_SPAWN, dir: safeDir };
}

function getBiomeChests(biomeId) {
  return Object.entries(CHESTS)
    .filter(([key, chest]) => {
      if (chest.biome) return chest.biome === biomeId;
      const [cx, cy] = key.split(',').map(Number);
      return getBiomeAt(cx, cy).id === biomeId;
    })
    .map(([, chest]) => chest);
}

export function getBiomeDiscoveryStats(profile, biomeId, _speciesMap = null) {
  const biome = BIOMES[biomeId] || BIOMES.village;
  const seenSet = new Set((profile?.pokedex?.seen || []).map(Number));
  const caughtObj = profile?.pokedex?.caught || {};
  const nativeIds = [...new Set((biome.encounters || []).map((e) => Number(e.id)))];

  let seen = 0;
  let caught = 0;
  for (const id of nativeIds) {
    const rawVal = caughtObj[id];
    const isCaught = rawVal === true || Number(rawVal) > 0;
    if (isCaught) caught += 1;
    if (isCaught || seenSet.has(id)) seen += 1;
  }

  const shrinesClearedSet = new Set(profile?.shrinesCleared || []);
  const biomeShrines = Object.values(SHRINES).filter((s) => s.biome === biome.id);
  const hasShrine = biomeShrines.length > 0;
  const shrineCleared = hasShrine && biomeShrines.every((s) => shrinesClearedSet.has(s.id));

  const chestsOpenedSet = new Set(profile?.chestsOpened || []);
  const biomeChests = getBiomeChests(biome.id);
  const chestsOpened = biomeChests.filter((c) => chestsOpenedSet.has(c.id)).length;

  return {
    biomeId: biome.id,
    name: biome.name,
    icon: biome.icon,
    seen,
    caught,
    totalSpecies: nativeIds.length,
    hasShrine,
    shrineCleared,
    chestsOpened,
    chestsTotal: biomeChests.length,
  };
}

function parseCoordsKey(key) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function findEntryCoords(obj, predicate) {
  for (const [key, value] of Object.entries(obj)) {
    if (predicate(value)) return parseCoordsKey(key);
  }
  return { ...DEFAULT_SPAWN };
}

function computeArrowDir(dx, dy) {
  if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return '★ Here';
  const angle = Math.atan2(dy, dx);
  const dirs = ['→ East', '↘ SE', '↓ South', '↙ SW', '← West', '↖ NW', '↑ North', '↗ NE'];
  const idx = Math.round(angle / (Math.PI / 4));
  return dirs[((idx % 8) + 8) % 8];
}

export function getCompassGuidance(profile, speciesMap = null) {
  const px = Number.isFinite(profile?.pos?.x) ? profile.pos.x : DEFAULT_SPAWN.x;
  const py = Number.isFinite(profile?.pos?.y) ? profile.pos.y : DEFAULT_SPAWN.y;
  const currentBiome = getBiomeAt(px, py);
  const biomeStats = getBiomeDiscoveryStats(profile, currentBiome.id, speciesMap);

  const npcsTalked = new Set(profile?.npcsTalked || []);
  const chestsOpened = new Set(profile?.chestsOpened || []);
  const questsCompleted = new Set(profile?.questsCompleted || []);
  const shrinesCleared = new Set(profile?.shrinesCleared || []);
  const badges = new Set(profile?.badges || []);
  const caughtCount = countTotalCaught(profile);
  const hasParty = Array.isArray(profile?.team);
  const partyCount = hasParty ? profile.team.length : 0;
  const totalSpecies = speciesMap ? Object.keys(speciesMap).length : 1025;
  const inEarlyForestOnboarding = shrinesCleared.size === 0 && badges.size === 0;

  let goal = null;

  if (!npcsTalked.has('npc_willow') && caughtCount <= 1 && shrinesCleared.size === 0) {
    const pos = findEntryCoords(NPCS, (n) => n.id === 'npc_willow');
    goal = {
      icon: '👩‍🔬',
      title: 'Talk to Professor Willow',
      targetBiomeId: 'village',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (
    inEarlyForestOnboarding
    && !npcsTalked.has('npc_fern')
    && !questsCompleted.has('quest_forest_friends')
    && caughtCount < 5
  ) {
    const pos = findEntryCoords(NPCS, (n) => n.id === 'npc_fern');
    goal = {
      icon: '🌿',
      title: 'Meet Ranger Fern (North)',
      targetBiomeId: 'forest',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (
    inEarlyForestOnboarding
    && (caughtCount < 3 || (hasParty && partyCount < 2))
  ) {
    goal = {
      icon: '🐾',
      title: 'Catch Forest Friends',
      targetBiomeId: 'forest',
      targetX: 8,
      targetY: 6,
    };
  } else if (
    inEarlyForestOnboarding
    && !chestsOpened.has('forest_chest')
    && caughtCount < 5
  ) {
    const pos = findEntryCoords(CHESTS, (c) => c.id === 'forest_chest');
    goal = {
      icon: '🎒',
      title: 'Claim Ranger Supplies',
      targetBiomeId: 'forest',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('forest_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'forest_shrine');
    goal = {
      icon: '🌲',
      title: 'Forest Shrine (North)',
      targetBiomeId: 'forest',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('cave_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'cave_shrine');
    goal = {
      icon: '💎',
      title: 'Crystal Shrine (East)',
      targetBiomeId: 'cave',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('water_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'water_shrine');
    goal = {
      icon: '🌊',
      title: 'Lagoon Shrine (South)',
      targetBiomeId: 'water',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('volcano_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'volcano_shrine');
    goal = {
      icon: '🌋',
      title: 'Caldera Shrine (Far East)',
      targetBiomeId: 'volcano',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('peak_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'peak_shrine');
    goal = {
      icon: '❄️',
      title: 'Starfall Shrine (SE Peak)',
      targetBiomeId: 'peak',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('thunder_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'thunder_shrine');
    goal = {
      icon: '🌩️',
      title: 'Thunder Roost Shrine (NE Cliff)',
      targetBiomeId: 'volcano',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('eclipse_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'eclipse_shrine');
    goal = {
      icon: '🔮',
      title: 'Twilight Eclipse Shrine (Cavern)',
      targetBiomeId: 'cave',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('starlight_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'starlight_shrine');
    goal = {
      icon: '👑',
      title: 'Starlight Sanctum (Peak Summit)',
      targetBiomeId: 'peak',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('grove_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'grove_shrine');
    goal = {
      icon: '🌸',
      title: 'Celestial Grove Shrine (South)',
      targetBiomeId: 'grove',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('desert_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'desert_shrine');
    goal = {
      icon: '🏜️',
      title: 'Sunstone Mirage Shrine (East)',
      targetBiomeId: 'desert',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('marsh_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'marsh_shrine');
    goal = {
      icon: '🍄',
      title: 'Glowspore Lantern Shrine (SW)',
      targetBiomeId: 'marsh',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('sanctum_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'sanctum_shrine');
    goal = {
      icon: '🌌',
      title: 'Astral Sky Sanctum (SE)',
      targetBiomeId: 'sanctum',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('canyon_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'canyon_shrine');
    goal = {
      icon: '⚡',
      title: 'Thundersteppe Shrine (NE Canyon)',
      targetBiomeId: 'canyon',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('reef_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'reef_shrine');
    goal = {
      icon: '🪸',
      title: 'Abyssal Pearl Shrine (SW Trench)',
      targetBiomeId: 'reef',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('ruins_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'ruins_shrine');
    goal = {
      icon: '🏛️',
      title: 'Chrono Relic Shrine (South Ruins)',
      targetBiomeId: 'ruins',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('rift_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'rift_shrine');
    goal = {
      icon: '☄️',
      title: 'Mythic Rift Shrine (Far SE Rift)',
      targetBiomeId: 'rift',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('faeveldt_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'faeveldt_shrine');
    goal = {
      icon: '🧚',
      title: 'Pixie Faeveldt Shrine (East Glade)',
      targetBiomeId: 'faeveldt',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('atoll_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'atoll_shrine');
    goal = {
      icon: '🌺',
      title: 'Sunburst Atoll Shrine (SW Atoll)',
      targetBiomeId: 'atoll',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('highlands_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'highlands_shrine');
    goal = {
      icon: '🛡️',
      title: 'Iron Crown Shrine (South Highlands)',
      targetBiomeId: 'highlands',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (!shrinesCleared.has('crater_shrine')) {
    const pos = findEntryCoords(SHRINES, (s) => s.id === 'crater_shrine');
    goal = {
      icon: '💎',
      title: 'Terastal Crystal Shrine (SE Crater)',
      targetBiomeId: 'crater',
      targetX: pos.x,
      targetY: pos.y,
    };
  } else if (caughtCount < totalSpecies) {
    const pos = findEntryCoords(NPCS, (n) => n.id === 'npc_willow');
    goal = {
      icon: '📖',
      title: 'Complete Dex & Evolutions!',
      targetBiomeId: currentBiome.id,
      targetX: pos.x,
      targetY: pos.y,
    };
  } else {
    goal = {
      icon: '👑',
      title: 'Starlight Champion! Hunt Shimmers!',
      targetBiomeId: currentBiome.id,
      targetX: px,
      targetY: py,
    };
  }

  const dx = goal.targetX - px;
  const dy = goal.targetY - py;
  const distance = Math.round(Math.hypot(dx, dy));
  const arrowDir = computeArrowDir(dx, dy);

  return {
    ...goal,
    distance,
    arrowDir,
    biomeStats,
  };
}

const ENCOUNTER_TILE_SET = new Set([
  TILE.TALL_GRASS,
  TILE.CAVE_FLOOR,
  TILE.SHALLOW_WATER,
  TILE.VOLCANO_FLOOR,
  TILE.SNOW_GRASS,
  TILE.GROVE_GRASS,
  TILE.DUNE_SAND,
  TILE.MARSH_GRASS,
  TILE.SANCTUM_FLOOR,
  TILE.CANYON_GRASS,
  TILE.REEF_WATER,
  TILE.RUINS_FLOOR,
  TILE.RIFT_FLOOR,
  TILE.FAE_GRASS,
  TILE.ATOLL_SAND,
  TILE.CROWN_GRASS,
  TILE.TERA_FLOOR,
]);

const SHRINES_BY_BIOME = Object.values(SHRINES).reduce((acc, shrine) => {
  if (shrine?.biome && shrine?.id) {
    if (!acc[shrine.biome]) acc[shrine.biome] = [];
    acc[shrine.biome].push(shrine.id);
  }
  return acc;
}, {});

export const FARMING_BIOME_ORDER = [
  'forest',
  'cave',
  'water',
  'volcano',
  'peak',
  'desert',
  'grove',
  'marsh',
  'faeveldt',
  'canyon',
  'sanctum',
  'atoll',
  'reef',
  'highlands',
  'ruins',
  'crater',
  'rift',
];

export const BIOME_WARP_POINTS = {
  village: { x: 8, y: 15, dir: 'down' },
  forest: { x: 4, y: 5, dir: 'up' },
  cave: { x: 21, y: 5, dir: 'right' },
  water: { x: 15, y: 31, dir: 'down' },
  volcano: { x: 39, y: 11, dir: 'up' },
  peak: { x: 47, y: 23, dir: 'down' },
  grove: { x: 25, y: 44, dir: 'up' },
  desert: { x: 56, y: 16, dir: 'down' },
  marsh: { x: 13, y: 55, dir: 'down' },
  sanctum: { x: 46, y: 53, dir: 'right' },
  canyon: { x: 73, y: 17, dir: 'down' },
  reef: { x: 16, y: 64, dir: 'down' },
  ruins: { x: 51, y: 64, dir: 'down' },
  rift: { x: 78, y: 42, dir: 'down' },
  faeveldt: { x: 90, y: 14, dir: 'right' },
  atoll: { x: 25, y: 77, dir: 'down' },
  highlands: { x: 60, y: 77, dir: 'down' },
  crater: { x: 88, y: 46, dir: 'down' },
};

export const BIOME_MINIMAP_PALETTE = {
  village: { base: '#57ba62', path: '#fde68a', encounter: '#2d8a47', accent: '#facc15' },
  forest: { base: '#3ba352', path: '#e7c68b', encounter: '#1f7a3d', accent: '#86efac' },
  cave: { base: '#4c4566', path: '#7c6fa6', encounter: '#9333ea', accent: '#22d3ee' },
  water: { base: '#f5d078', path: '#38bdf8', encounter: '#0ea5e9', accent: '#67e8f9' },
  volcano: { base: '#573d3b', path: '#946e69', encounter: '#ea580c', accent: '#fb923c' },
  peak: { base: '#cbd5e1', path: '#f8fafc', encounter: '#38bdf8', accent: '#a5f3fc' },
  grove: { base: '#1e7a5c', path: '#e2e8f0', encounter: '#34d399', accent: '#f9a8d4' },
  desert: { base: '#e5a93b', path: '#fde68a', encounter: '#d97706', accent: '#fef08a' },
  marsh: { base: '#14584b', path: '#52796f', encounter: '#2dd4bf', accent: '#c084fc' },
  sanctum: { base: '#25215c', path: '#c4b5fd', encounter: '#6366f1', accent: '#fde047' },
  canyon: { base: '#c38134', path: '#f0b26b', encounter: '#eab308', accent: '#38bdf8' },
  reef: { base: '#0e586d', path: '#bae6fd', encounter: '#0284c7', accent: '#f472b6' },
  ruins: { base: '#5b442c', path: '#e7c68b', encounter: '#b45309', accent: '#fbbf24' },
  rift: { base: '#1d1035', path: '#a855f7', encounter: '#7e22ce', accent: '#e879f9' },
  faeveldt: { base: '#4c3a6e', path: '#fbcfe8', encounter: '#6ee7b7', accent: '#f9a8d4' },
  atoll: { base: '#f0b865', path: '#fdba74', encounter: '#fb923c', accent: '#38bdf8' },
  highlands: { base: '#3b4a5e', path: '#94a3b8', encounter: '#14b8a6', accent: '#cbd5e1' },
  crater: { base: '#132a46', path: '#7dd3fc', encounter: '#0284c7', accent: '#f472b6' },
};

/**
 * Resolve a guaranteed-walkable landing coordinate for a biome.
 * @param {string} biomeId
 * @returns {{ biomeId: string, x: number, y: number, dir: string }}
 */
export function getBiomeWarpPoint(biomeId) {
  const biome = BIOMES[biomeId] || BIOMES.forest;
  const pt = BIOME_WARP_POINTS[biome.id];
  const fallbackDir = pt?.dir || 'down';

  if (pt && isTileWalkableAt(pt.x, pt.y) && getBiomeAt(pt.x, pt.y).id === biome.id) {
    return { biomeId: biome.id, x: pt.x, y: pt.y, dir: fallbackDir };
  }

  let firstWalkable = null;
  for (let y = 0; y < WORLD_ROWS; y++) {
    for (let x = 0; x < WORLD_COLS; x++) {
      if (!isTileWalkableAt(x, y) || getBiomeAt(x, y).id !== biome.id) continue;
      if (!ENCOUNTER_TILE_SET.has(WORLD_MAP[y][x])) {
        return { biomeId: biome.id, x, y, dir: fallbackDir };
      }
      if (!firstWalkable) {
        firstWalkable = { x, y };
      }
    }
  }

  if (firstWalkable) {
    return { biomeId: biome.id, x: firstWalkable.x, y: firstWalkable.y, dir: fallbackDir };
  }

  const safe = findNearestSafePosition(pt?.x ?? DEFAULT_SPAWN.x, pt?.y ?? DEFAULT_SPAWN.y, fallbackDir);
  return { biomeId: biome.id, x: safe.x, y: safe.y, dir: safe.dir };
}

export const BIOME_SCALING_OFFSETS = Object.freeze({
  ...BALANCE.scaling.biomeOffsets,
});

export const TRAINER_XP_WEIGHTS = {
  battleWin: 14,
  badge: 60,
  shrine: 85,
  rival: 50,
  rivalRematch: 30,
  shrineTrial: 40,
  quest: 45,
  speciesCaught: 4,
};

function clampPlayerLevel(value) {
  return Math.max(1, Math.min(50, Math.round(value)));
}

function toValidNonNegInt(value) {
  if (typeof value === 'boolean' || value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

function toValidInt1to50(value) {
  if (typeof value === 'boolean' || value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 50) return null;
  return num;
}

function countUniqueKeys(collection) {
  if (!collection) return 0;
  const items = collection instanceof Set
    ? Array.from(collection)
    : (Array.isArray(collection) ? collection : []);
  if (items.length === 0) return 0;
  const seen = new Set();
  for (const item of items) {
    if (item !== null && item !== undefined && item !== '' && item !== false) {
      seen.add(String(item));
    }
  }
  return seen.size;
}

function sumNonNegIntValues(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 0;
  let total = 0;
  for (const val of Object.values(record)) {
    const n = toValidNonNegInt(val);
    if (n !== null && n > 0) {
      total += n;
    }
  }
  return total;
}

function countUniqueCaughtSpecies(profile) {
  const caught = profile?.pokedex?.caught;
  if (!caught) return 0;
  if (Array.isArray(caught) || caught instanceof Set) {
    return countUniqueKeys(caught);
  }
  if (typeof caught !== 'object') return 0;
  const seen = new Set();
  for (const [id, val] of Object.entries(caught)) {
    if (val === true) {
      seen.add(String(id));
    } else {
      const n = toValidNonNegInt(val);
      if (n !== null && n > 0) {
        seen.add(String(id));
      }
    }
  }
  return seen.size;
}

/**
 * XP required to advance from `level` to `level + 1` (0 at max Lv.50).
 * @param {number} level
 * @returns {number}
 */
export function getPlayerLevelXpRequired(level = 1) {
  const num = Number(level);
  if (num >= 50) return 0;
  const lv = Math.max(1, Math.floor(Number.isFinite(num) ? num : 1));
  if (lv >= 50) return 0;
  return 30 + (lv - 1) * 10;
}

/**
 * Total cumulative Trainer XP required to reach `level` (Lv.1 = 0).
 * @param {number} level
 * @returns {number}
 */
export function getCumulativeXpForPlayerLevel(level = 1) {
  const num = Number(level);
  const target = num === Infinity
    ? 50
    : (num === -Infinity || !Number.isFinite(num) ? 1 : clampPlayerLevel(num));
  let total = 0;
  for (let i = 1; i < target; i++) {
    total += getPlayerLevelXpRequired(i);
  }
  return total;
}

/**
 * Compute milestone-based Trainer XP strictly from trainer accomplishments (never team/box levels).
 * @param {object|null} profile
 * @returns {number}
 */
export function computeMilestoneTrainerXp(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return 0;
  const battlesWon = toValidNonNegInt(profile.stats?.battlesWon) || 0;
  const badgeCount = countUniqueKeys(profile.badges);
  const shrineCount = countUniqueKeys(profile.shrinesCleared);
  const rivalCount = countUniqueKeys(profile.rivalsDefeated);
  const rivalRematchTotal = sumNonNegIntValues(profile.rivalRematchCounts);
  const shrineTrialTotal = sumNonNegIntValues(profile.shrineTrialCounts);
  const questCount = countUniqueKeys(profile.questsCompleted);
  const uniqueCaughtCount = countUniqueCaughtSpecies(profile);

  return (
    battlesWon * TRAINER_XP_WEIGHTS.battleWin
    + badgeCount * TRAINER_XP_WEIGHTS.badge
    + shrineCount * TRAINER_XP_WEIGHTS.shrine
    + rivalCount * TRAINER_XP_WEIGHTS.rival
    + rivalRematchTotal * TRAINER_XP_WEIGHTS.rivalRematch
    + shrineTrialTotal * TRAINER_XP_WEIGHTS.shrineTrial
    + questCount * TRAINER_XP_WEIGHTS.quest
    + Math.max(0, uniqueCaughtCount - 1) * TRAINER_XP_WEIGHTS.speciesCaught
  );
}

/**
 * Resolve player progression state from cumulative Trainer XP (Lv.1..50).
 * @param {number} xp
 * @returns {{ level: number, xp: number, xpIntoLevel: number, xpToNext: number, progressPct: number, isMaxLevel: boolean }}
 */
export function getPlayerLevelFromXp(xp = 0) {
  const maxXpFloor = getCumulativeXpForPlayerLevel(50);
  const isInfinity = xp === Infinity || (typeof xp === 'string' && xp.trim() === 'Infinity');
  const safeXp = isInfinity
    ? maxXpFloor
    : (toValidNonNegInt(xp) ?? 0);

  let level = 1;
  let levelStartXp = 0;
  while (level < 50) {
    const req = getPlayerLevelXpRequired(level);
    if (safeXp < levelStartXp + req) break;
    levelStartXp += req;
    level += 1;
  }

  const isMaxLevel = level >= 50;
  const xpToNext = isMaxLevel ? 0 : getPlayerLevelXpRequired(level);
  const xpIntoLevel = isMaxLevel ? 0 : Math.max(0, safeXp - levelStartXp);
  const progressPct = isMaxLevel
    ? 100
    : (xpToNext > 0 ? Math.max(0, Math.min(100, Math.round((xpIntoLevel / xpToNext) * 100))) : 100);

  return {
    level,
    xp: safeXp,
    xpIntoLevel,
    xpToNext,
    progressPct,
    isMaxLevel,
  };
}

/**
 * Single-source player progression resolver from a trainer profile or scalar level.
 * Never derives player level from party or box Pokémon levels.
 * @param {object|number|string|null} profileOrLevel
 * @returns {{ level: number, xp: number, xpIntoLevel: number, xpToNext: number, progressPct: number, isMaxLevel: boolean }}
 */
export function getPlayerProgression(profileOrLevel = null) {
  if (
    profileOrLevel === null
    || profileOrLevel === undefined
    || typeof profileOrLevel === 'boolean'
    || Array.isArray(profileOrLevel)
  ) {
    return getPlayerLevelFromXp(0);
  }

  if (typeof profileOrLevel === 'number') {
    if (profileOrLevel === -Infinity) return getPlayerLevelFromXp(0);
    if (profileOrLevel === Infinity) return getPlayerLevelFromXp(getCumulativeXpForPlayerLevel(50));
    if (!Number.isFinite(profileOrLevel)) return getPlayerLevelFromXp(0);
    const level = clampPlayerLevel(profileOrLevel);
    return getPlayerLevelFromXp(getCumulativeXpForPlayerLevel(level));
  }

  if (typeof profileOrLevel === 'string') {
    const trimmed = profileOrLevel.trim();
    if (!trimmed) return getPlayerLevelFromXp(0);
    if (trimmed === '-Infinity') return getPlayerLevelFromXp(0);
    if (trimmed === 'Infinity') return getPlayerLevelFromXp(getCumulativeXpForPlayerLevel(50));
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return getPlayerLevelFromXp(0);
    const level = clampPlayerLevel(parsed);
    return getPlayerLevelFromXp(getCumulativeXpForPlayerLevel(level));
  }

  if (typeof profileOrLevel === 'object') {
    const milestoneXp = computeMilestoneTrainerXp(profileOrLevel);
    const persistedXp = toValidNonNegInt(profileOrLevel.trainerXp) || 0;
    const explicitLv = toValidInt1to50(profileOrLevel.playerLevel);
    const explicitFloorXp = (persistedXp === 0 && explicitLv !== null)
      ? getCumulativeXpForPlayerLevel(explicitLv)
      : 0;
    const effectiveXp = Math.max(persistedXp, milestoneXp, explicitFloorXp);
    return getPlayerLevelFromXp(effectiveXp);
  }

  return getPlayerLevelFromXp(0);
}

/**
 * Single-source Player Level (1..50) from a trainer profile or scalar level.
 * @param {object|number|string|null} profileOrLevel
 * @returns {number}
 */
export function getPlayerLevel(profileOrLevel = null) {
  return getPlayerProgression(profileOrLevel).level;
}

/**
 * Resolve the Starlight Village Sanctuary warp point beside the Healing Fountain (zero wild encounters).
 * @returns {{ biomeId: string, biome: object, x: number, y: number, dir: string }}
 */
export function getSafeZoneWarpPoint() {
  const wp = getBiomeWarpPoint('village');
  return {
    biomeId: 'village',
    biome: BIOMES.village,
    x: wp.x,
    y: wp.y,
    dir: wp.dir || 'down',
  };
}

function resolveBuiltInScaledRange(biomeId, playerLevel, profile) {
  const biome = BIOMES[biomeId] || BIOMES.forest;
  const [rawMin, rawMax] = Array.isArray(biome?.levelRange) ? biome.levelRange : [2, 7];
  const baseMin = Math.max(1, Math.min(50, Math.round(rawMin)));
  const baseMax = Math.max(baseMin, Math.min(50, Math.round(rawMax)));
  const offset = Object.prototype.hasOwnProperty.call(BIOME_SCALING_OFFSETS, biomeId)
    ? BIOME_SCALING_OFFSETS[biomeId]
    : 0;
  const badgesCount = Array.isArray(profile?.badges) ? profile.badges.length : 0;
  const shouldScale = biomeId !== 'village' && !(badgesCount === 0 && playerLevel <= baseMax);

  let minLv = baseMin;
  let maxLv = baseMax;
  if (shouldScale) {
    const center = Math.round(playerLevel) + offset;
    const scaledMax = Math.max(baseMax, Math.min(50, center + 2));
    const scaledMin = Math.max(baseMin, Math.min(scaledMax - 2, center - 3));
    minLv = Math.max(1, scaledMin);
    maxLv = Math.max(minLv, scaledMax);
  }

  const isScaled = minLv !== baseMin || maxLv !== baseMax;
  const threatRef = (biomeId === 'forest' && !isScaled) ? Math.max(playerLevel, 5) : playerLevel;
  const delta = maxLv - threatRef;
  let threatLabel = 'Balanced';
  let threatTone = 'balanced';
  if (delta > 10.5) {
    threatLabel = 'Apex';
    threatTone = 'apex';
  } else if (delta > 6) {
    threatLabel = 'Veteran';
    threatTone = 'veteran';
  } else if (delta > 3.5) {
    threatLabel = 'Challenging';
    threatTone = 'challenging';
  }

  return {
    baseMin,
    baseMax,
    minLv,
    maxLv,
    threatLabel,
    threatTone,
    isScaled,
  };
}

function resolveThreatTierFallback(biomeId, playerLevel, maxLv, isScaled) {
  const threatRef = (biomeId === 'forest' && !isScaled) ? Math.max(playerLevel, 5) : playerLevel;
  const delta = maxLv - threatRef;
  if (delta > 10.5) return { threatLabel: 'Apex', threatTone: 'apex' };
  if (delta > 6) return { threatLabel: 'Veteran', threatTone: 'veteran' };
  if (delta > 3.5) return { threatLabel: 'Challenging', threatTone: 'challenging' };
  return { threatLabel: 'Balanced', threatTone: 'balanced' };
}

const ENDGAME_WARP_BIOMES = new Set([
  'sanctum',
  'atoll',
  'reef',
  'highlands',
  'ruins',
  'crater',
  'rift',
]);

/**
 * Deterministically resolve the best spike-free farming biome and landing warp coordinate
 * for a scalar Player Level or trainer profile (never keying off party/box Pokémon levels).
 * @param {number|string|object|null} levelOrProfile
 * @param {object|null} profileArg
 * @param {{ getScaledRange?: (biomeId: string, target: number|object) => object }} options
 * @returns {object}
 */
export function resolveFarmingBiomeForLevel(levelOrProfile, profileArg = null, options = {}) {
  const isScalarInput = typeof levelOrProfile === 'number' || typeof levelOrProfile === 'string';
  const profile = profileArg && typeof profileArg === 'object' && !Array.isArray(profileArg)
    ? profileArg
    : (levelOrProfile && typeof levelOrProfile === 'object' && !Array.isArray(levelOrProfile)
      ? levelOrProfile
      : null);

  const playerLevel = isScalarInput
    ? getPlayerLevel(levelOrProfile)
    : getPlayerLevel(profile ?? levelOrProfile);

  let scaledTarget = playerLevel;
  if (profile) {
    if (!isScalarInput || getPlayerLevel(profile) === playerLevel) {
      scaledTarget = toValidInt1to50(profile.playerLevel) === playerLevel
        ? profile
        : { ...profile, playerLevel };
    } else if (Array.isArray(profile.badges) && getPlayerLevel({ badges: profile.badges }) <= playerLevel) {
      scaledTarget = {
        badges: profile.badges,
        playerLevel,
        trainerXp: getCumulativeXpForPlayerLevel(playerLevel),
      };
    }
  }

  const customGetScaledRange = typeof options?.getScaledRange === 'function'
    ? options.getScaledRange
    : null;

  const evaluations = [];
  for (let orderIdx = 0; orderIdx < FARMING_BIOME_ORDER.length; orderIdx++) {
    const biomeId = FARMING_BIOME_ORDER[orderIdx];
    if (biomeId === 'village') continue;
    const biome = BIOMES[biomeId];
    if (!biome || !Array.isArray(biome.levelRange) || biome.levelRange.length < 2) continue;

    const builtIn = resolveBuiltInScaledRange(biomeId, playerLevel, profile);
    const rawScaled = customGetScaledRange ? customGetScaledRange(biomeId, scaledTarget) : null;
    const baseMin = Number.isFinite(Number(rawScaled?.baseMin)) ? Number(rawScaled.baseMin) : builtIn.baseMin;
    const baseMax = Number.isFinite(Number(rawScaled?.baseMax)) ? Number(rawScaled.baseMax) : builtIn.baseMax;
    const minLv = Number.isFinite(Number(rawScaled?.minLv)) ? Number(rawScaled.minLv) : builtIn.minLv;
    const maxLv = Number.isFinite(Number(rawScaled?.maxLv)) ? Number(rawScaled.maxLv) : builtIn.maxLv;
    const isScaled = typeof rawScaled?.isScaled === 'boolean'
      ? rawScaled.isScaled
      : (minLv !== baseMin || maxLv !== baseMax);
    const derivedThreat = resolveThreatTierFallback(biomeId, playerLevel, maxLv, isScaled);
    const threatTone = rawScaled?.threatTone || derivedThreat.threatTone;
    const threatLabel = rawScaled?.threatLabel || derivedThreat.threatLabel;

    const safeThreat = threatTone !== 'veteran' && threatTone !== 'apex';
    const safeCap = maxLv <= Math.max(7, playerLevel + 4) && minLv <= Math.max(2, playerLevel + 1);
    const inActual = minLv <= playerLevel && playerLevel <= maxLv;
    const inBase = baseMin <= playerLevel && playerLevel <= baseMax;

    evaluations.push({
      biomeId,
      biome,
      orderIdx,
      baseMin,
      baseMax,
      minLv,
      maxLv,
      baseMid: (baseMin + baseMax) / 2,
      actualMid: (minLv + maxLv) / 2,
      threatLabel,
      threatTone,
      isScaled,
      safeThreat,
      safeCap,
      inActual,
      inBase,
    });
  }

  let filtered = evaluations.filter((e) => e.safeThreat && e.safeCap && e.inActual);
  if (filtered.length === 0) {
    filtered = evaluations.filter((e) => e.safeThreat && e.safeCap);
  }
  if (filtered.length === 0) {
    filtered = evaluations.filter((e) => e.safeThreat);
  }
  if (filtered.length === 0) {
    filtered = evaluations;
  }

  const nativeMatches = filtered.filter((e) => e.inBase);
  const candidates = nativeMatches.length > 0 ? nativeMatches : filtered;

  const hasShrinesCleared = Boolean(
    profile && (Array.isArray(profile.shrinesCleared) || profile.shrinesCleared instanceof Set),
  );
  const clearedSet = hasShrinesCleared ? new Set(profile.shrinesCleared) : null;

  const computeFitScore = (entry) => (
    Math.abs(playerLevel - entry.actualMid) * 1.2
    + Math.abs(playerLevel - entry.baseMid) * 0.8
    + (entry.threatTone === 'balanced' ? 0 : 0.6)
  );

  const compareCandidates = (a, b) => {
    const scoreA = computeFitScore(a);
    const scoreB = computeFitScore(b);
    if (Math.abs(scoreA - scoreB) > 1e-6) {
      return scoreA - scoreB;
    }

    if (clearedSet) {
      const aUncleared = (SHRINES_BY_BIOME[a.biomeId] || []).some((sid) => !clearedSet.has(sid)) ? 0 : 1;
      const bUncleared = (SHRINES_BY_BIOME[b.biomeId] || []).some((sid) => !clearedSet.has(sid)) ? 0 : 1;
      if (aUncleared !== bUncleared) return aUncleared - bUncleared;
    }

    return a.orderIdx - b.orderIdx;
  };

  candidates.sort(compareCandidates);

  const defaultBest = candidates[0] || {
    biomeId: 'forest',
    biome: BIOMES.forest,
    baseMin: BIOMES.forest.levelRange[0],
    baseMax: BIOMES.forest.levelRange[1],
    minLv: BIOMES.forest.levelRange[0],
    maxLv: BIOMES.forest.levelRange[1],
    threatLabel: 'Balanced',
    threatTone: 'balanced',
    isScaled: false,
  };

  let chosen = defaultBest;
  const recentWarpBiomes = Array.isArray(profile?.recentWarpBiomes)
    ? profile.recentWarpBiomes.filter((id) => typeof id === 'string' && id !== 'village' && Boolean(BIOMES[id]))
    : [];

  if (recentWarpBiomes.length > 0 && candidates[0]) {
    const recentSet = new Set(recentWarpBiomes);
    if (recentSet.has(defaultBest.biomeId)) {
      const bestScore = computeFitScore(defaultBest);
      const rotationPool = filtered
        .filter((e) => (
          e.threatTone === 'balanced'
          && (
            Math.abs(computeFitScore(e) - bestScore) <= 4.5
            || (playerLevel >= 28 && ENDGAME_WARP_BIOMES.has(e.biomeId))
          )
        ))
        .sort(compareCandidates);

      const fresh = rotationPool.find((e) => !recentSet.has(e.biomeId));
      if (fresh) {
        chosen = fresh;
      } else {
        const leastRecentPool = rotationPool.some((e) => e.biomeId === defaultBest.biomeId)
          ? rotationPool
          : [...rotationPool, defaultBest];
        if (leastRecentPool.length >= 2) {
          leastRecentPool.sort((a, b) => {
            const idxA = recentWarpBiomes.lastIndexOf(a.biomeId);
            const idxB = recentWarpBiomes.lastIndexOf(b.biomeId);
            if (idxA !== idxB) return idxA - idxB;
            return compareCandidates(a, b);
          });
          chosen = leastRecentPool[0];
        }
      }
    }
  }

  const clamped = playerLevel < 2 ? 'low' : (playerLevel > 36 ? 'high' : null);
  const warp = getBiomeWarpPoint(chosen.biomeId);

  return {
    biomeId: chosen.biomeId,
    biome: chosen.biome,
    playerLevel,
    targetLevel: playerLevel,
    partyLevel: playerLevel,
    baseMin: chosen.baseMin,
    baseMax: chosen.baseMax,
    minLv: chosen.minLv,
    maxLv: chosen.maxLv,
    levelRange: [...chosen.biome.levelRange],
    threatLabel: chosen.threatLabel,
    threatTone: chosen.threatTone,
    isScaled: chosen.isScaled,
    clamped,
    x: warp.x,
    y: warp.y,
    dir: warp.dir,
  };
}
