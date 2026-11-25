import type { ElementalType, IconId } from '../../contracts';

/**
 * Matches every Unicode Emoji / Pictographic / Dingbat / Variation Selector code point
 * prohibited by Starlight v2's Zero-Emoji DOM invariant.
 */
export const EMOJI_PATTERN =
  /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]/gu;

/**
 * Maps legacy C:\dojo icon emojis cleanly into Starlight v2's zero-emoji SVG symbol IDs.
 */
export const EMOJI_TO_ICON_ID: Record<string, IconId> = {
  '🌿': 'icon-type-grass',
  '🍃': 'icon-type-grass',
  '🔥': 'icon-type-fire',
  '💧': 'icon-type-water',
  '🌊': 'icon-type-water',
  '⚡': 'icon-type-electric',
  '🌩️': 'icon-type-electric',
  '🪨': 'icon-type-rock',
  '⛰️': 'icon-type-ground',
  '🏜️': 'icon-type-rock',
  '✨': 'icon-sparkle',
  '⭐': 'icon-star-rank',
  '🌟': 'icon-starball',
  '🌠': 'icon-starfall',
  '❄️': 'icon-type-ice',
  '👻': 'icon-type-ghost',
  '🐉': 'icon-type-dragon',
  '🥊': 'icon-type-fighting',
  '🪽': 'icon-type-flying',
  '🧪': 'icon-type-poison',
  '🦋': 'icon-type-bug',
  '⚙️': 'icon-type-steel',
  '🛡️': 'icon-shield',
  '🌙': 'icon-type-dark',
  '🧚': 'icon-type-fairy',
  '🌸': 'icon-type-fairy',
  '🌺': 'icon-type-grass',
  '👑': 'icon-crown',
  '🏆': 'icon-trophy',
  '💎': 'icon-gem',
  '💠': 'icon-gem',
  '🔮': 'icon-shrine',
  '🌌': 'icon-aura',
  '☄️': 'icon-starfall',
  '⏳': 'icon-gem',
  '🎀': 'icon-bond',
  '💖': 'icon-cheer-heart',
  '💛': 'icon-bond',
  '🌱': 'icon-type-grass',
  '✅': 'icon-check',
  '⚖️': 'icon-balance',
  '⚠️': 'icon-warn',
  '🚨': 'icon-danger',
  '🏡': 'icon-warp-safe',
  '🌲': 'icon-type-grass',
  '🌋': 'icon-type-fire',
  '🍄': 'icon-type-grass',
  '🪸': 'icon-type-water',
  '🏛️': 'icon-shrine',
  '🧬': 'icon-evolve',
  '🧢': 'icon-hat',
  '🧙': 'icon-hat',
  '🥽': 'icon-hat',
  '💫': 'icon-sparkle',
  '🕶️': 'icon-hat',
  '⚪': 'icon-pokeball',
  '🔴': 'icon-pokeball',
  '🔵': 'icon-greatball',
  '🍓': 'icon-potion',
  '☀️': 'icon-star-shard',
  '🪐': 'icon-aura',
  '★': 'icon-star-rank',
  '⚔️': 'icon-sword',
  '⛩️': 'icon-shrine',
  '🎟️': 'icon-skyhop',
  '🕹️': 'icon-skyhop',
  '📖': 'icon-pokedex',
  '🏅': 'icon-badges',
  '🎒': 'icon-team',
  '🗺️': 'icon-guide',
  '🔒': 'icon-lock',
  '🎯': 'icon-briefing',
  '🧭': 'icon-compass',
  '🔊': 'icon-audio-on',
  '🔇': 'icon-audio-off',
  '🎭': 'icon-style',
  '♟️': 'icon-crown',
  '🚀': 'icon-warp-farm',
};

/**
 * Strips 100% of raw Unicode emojis / pictographs / variation selectors and cleans whitespace.
 * Preserves Nidoran gender distinction as ASCII `(F)` / `(M)` so zero-emoji DOM invariants stay 100% clean.
 */
export function stripEmojis(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/♀/g, ' (F)')
    .replace(/♂/g, ' (M)')
    .replace(EMOJI_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function containsEmoji(raw: string): boolean {
  EMOJI_PATTERN.lastIndex = 0;
  return EMOJI_PATTERN.test(raw);
}

export function emojiToIconId(emoji: string | undefined | null, fallback: IconId = 'icon-sparkle'): IconId {
  if (!emoji) return fallback;
  const trimmed = emoji.trim();
  if (EMOJI_TO_ICON_ID[trimmed]) return EMOJI_TO_ICON_ID[trimmed];
  // Try stripping FE0F variation selector
  const bare = trimmed.replace(/\uFE0F/g, '');
  if (EMOJI_TO_ICON_ID[bare]) return EMOJI_TO_ICON_ID[bare];
  return fallback;
}

export function typeToIconId(type: ElementalType | string): IconId {
  const valid = new Set<string>([
    'normal', 'grass', 'fire', 'water', 'electric', 'ice',
    'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
    'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
  ]);
  const key = String(type || 'normal').toLowerCase();
  return (`icon-type-${valid.has(key) ? key : 'normal'}`) as IconId;
}

export function readinessTierToIconId(tier: 'favored' | 'balanced' | 'challenging' | 'danger'): IconId {
  switch (tier) {
    case 'favored':
      return 'icon-check';
    case 'balanced':
      return 'icon-balance';
    case 'challenging':
      return 'icon-warn';
    case 'danger':
    default:
      return 'icon-danger';
  }
}
