import { ELEMENTAL_TYPES, type ElementalType, type IconId } from '../contracts';

export const CORE_ICON_IDS: readonly IconId[] = [
  'icon-pokeball',
  'icon-starball',
  'icon-potion',
  'icon-super-potion',
  'icon-star-shard',
  'icon-composure',
  'icon-briefing',
  'icon-waypoint',
  'icon-shrine',
  'icon-chest',
  'icon-fountain',
  'icon-signpost',
  'icon-starfall',
  'icon-pokedex',
  'icon-badges',
  'icon-style',
  'icon-skyhop',
  'icon-settings',
  'icon-audio-on',
  'icon-audio-off',
  'icon-crt',
  'icon-motion',
  'icon-save',
  'icon-bond',
  'icon-star-rank',
  'icon-crown',
] as const;

export const TYPE_ICON_IDS: readonly IconId[] = ELEMENTAL_TYPES.map(
  (t): IconId => `icon-type-${t}`,
);

export const BADGE_ICON_IDS: readonly IconId[] = Array.from(
  { length: 28 },
  (_, i): IconId => `icon-badge-${i + 1}`,
);

export const ALL_ICON_IDS: readonly IconId[] = [
  ...CORE_ICON_IDS,
  ...TYPE_ICON_IDS,
  ...BADGE_ICON_IDS,
];

const KNOWN_ICON_SET = new Set<string>(ALL_ICON_IDS);

// Strips all raw Unicode emojis, pictographs, regional flags, skin-tone modifiers,
// variation selectors, keycap combiners, ZWJ, and symbol/dingbat glyphs while
// preserving ASCII, digits, punctuation, bullets, dashes, and accented Latin letters.
const EMOJI_STRIP_REGEX =
  /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u2600-\u27BF\u2B00-\u2BFF\uFE0E\uFE0F\u20E3\u200D]/gu;

export function sanitizeNoEmoji(text: string): string {
  if (!text) return '';
  return text
    .replace(EMOJI_STRIP_REGEX, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeText(text: string): string {
  return escapeHtml(sanitizeNoEmoji(text));
}

export function isValidIconId(id: string): id is IconId {
  return KNOWN_ICON_SET.has(id);
}

export function typeIconId(type: ElementalType): IconId {
  return `icon-type-${type}`;
}

export function badgeIconId(index: number): IconId {
  const clamped = Math.max(1, Math.min(28, Math.floor(index)));
  return `icon-badge-${clamped}`;
}

export function iconSvg(id: IconId, className?: string): string {
  const safeId = KNOWN_ICON_SET.has(id)
    ? id
    : String(id).replace(/[^a-zA-Z0-9_-]/g, '') || 'icon-star-rank';
  const cls = className ? `sl-icon ${escapeHtml(className)}` : 'sl-icon';
  return `<svg class="${cls}" aria-hidden="true"><use href="#${safeId}"></use></svg>`;
}
