import {
  ELEMENTAL_TYPES,
  type AtlasManifest,
  type AtlasRegion,
  type DecodedSpriteFrames,
  type ElementalType,
  type IconId,
  type TrainerAppearance,
  type TrainerId,
} from '../contracts';
import {
  getResolvedTrainerLook,
  getSpeciesEntry,
  SpriteAssetLoader,
  stripEmojis,
  TYPE_PALETTES,
  typeToIconId,
} from '../core';

export const CORE_ICON_IDS: readonly IconId[] = [
  'icon-pokeball',
  'icon-greatball',
  'icon-starball',
  'icon-potion',
  'icon-star-shard',
  'icon-cheer-heart',
  'icon-composure',
  'icon-briefing',
  'icon-waypoint',
  'icon-compass',
  'icon-warp-safe',
  'icon-warp-farm',
  'icon-shrine',
  'icon-chest',
  'icon-fountain',
  'icon-signpost',
  'icon-starfall',
  'icon-pokedex',
  'icon-team',
  'icon-badges',
  'icon-guide',
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
  'icon-trophy',
  'icon-shield',
  'icon-sword',
  'icon-sparkle',
  'icon-gem',
  'icon-evolve',
  'icon-quest',
  'icon-rival',
  'icon-lab',
  'icon-lock',
  'icon-check',
  'icon-warn',
  'icon-danger',
  'icon-balance',
  'icon-close',
  'icon-cape',
  'icon-hat',
  'icon-aura',
  'icon-pause',
  'icon-play',
  'icon-dash',
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

// Strips raw Unicode emojis, pictographs, regional flags, skin-tone modifiers,
// variation selectors, keycap combiners, ZWJ, and symbol/dingbat glyphs.
const EXTRA_EMOJI_STRIP_REGEX =
  /[\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0E\u20E3]/gu;

export function sanitizeNoEmoji(text: string): string {
  if (!text) return '';
  return stripEmojis(text)
    .replace(EXTRA_EMOJI_STRIP_REGEX, '')
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

export function typeIconId(type: ElementalType | string): IconId {
  return typeToIconId(type);
}

export function badgeIconId(index: number): IconId {
  const clamped = Math.max(1, Math.min(28, Math.floor(index)));
  return `icon-badge-${clamped}`;
}

export function createIconSvg(id: IconId, className?: string): string {
  const safeId = KNOWN_ICON_SET.has(id)
    ? id
    : String(id).replace(/[^a-zA-Z0-9_-]/g, '') || 'icon-star-rank';
  const cls = className ? `sl-icon ${escapeHtml(className)}` : 'sl-icon';
  return `<svg class="${cls}" aria-hidden="true"><use href="#${safeId}"></use></svg>`;
}

export function iconSvg(id: IconId, className?: string): string {
  return createIconSvg(id, className);
}

const FALLBACK_CORE_SYMBOL_PATHS: Record<string, string> = {
  'icon-greatball':
    '<circle cx="16" cy="16" r="13" fill="#f5f9ff" stroke="#1b2447" stroke-width="2"/><path d="M3 16a13 13 0 0 1 26 0z" fill="#38bdf8"/><path d="M7 9l4 4M25 9l-4 4" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/><line x1="3" y1="16" x2="29" y2="16" stroke="#1b2447" stroke-width="2.4"/><circle cx="16" cy="16" r="4" fill="#fff" stroke="#1b2447" stroke-width="2"/>',
  'icon-cheer-heart':
    '<path d="M16 27S5 19.5 5 11.5A6 6 0 0 1 16 8a6 6 0 0 1 11 3.5C27 19.5 16 27 16 27z" fill="#ff70a6" stroke="#ffe3f1" stroke-width="1.6"/><polygon points="16,11 17.5,14 20.8,14.4 18.4,16.7 19,20 16,18.4 13,20 13.6,16.7 11.2,14.4 14.5,14" fill="#fff8d6"/>',
  'icon-compass':
    '<circle cx="16" cy="16" r="12.5" fill="#13204a" stroke="#ffd566" stroke-width="2"/><polygon points="16,6 19.5,16 16,13.5 12.5,16" fill="#ff7a7a"/><polygon points="16,26 19.5,16 16,18.5 12.5,16" fill="#7ce8ff"/><circle cx="16" cy="16" r="2" fill="#fff8d6"/>',
  'icon-warp-safe':
    '<path d="M5 16L16 6l11 10v11H5z" fill="#2a3d7a" stroke="#ffd566" stroke-width="2"/><rect x="13" y="17" width="6" height="10" fill="#ffd566"/><rect x="8" y="16" width="3.5" height="3.5" fill="#7ce8ff"/><rect x="20.5" y="16" width="3.5" height="3.5" fill="#7ce8ff"/>',
  'icon-warp-farm':
    '<circle cx="16" cy="16" r="12" fill="none" stroke="#4ade80" stroke-width="2" stroke-dasharray="4 3"/><polygon points="16,7 22,16 18,16 18,24 14,24 14,16 10,16" fill="#4ade80"/>',
  'icon-team':
    '<circle cx="11" cy="11" r="4" fill="#7ce8ff"/><path d="M5 24c0-4 2.7-6.5 6-6.5s6 2.5 6 6.5z" fill="#38bdf8"/><circle cx="21" cy="12" r="3.5" fill="#ffd566"/><path d="M16 24c0-3.4 2.2-5.5 5-5.5s5 2.1 5 5.5z" fill="#f59e0b"/>',
  'icon-guide':
    '<rect x="5" y="5" width="22" height="22" rx="3" fill="#1b2b5e" stroke="#7ce8ff" stroke-width="1.8"/><polygon points="8,11 13,8 19,11 24,8 24,22 19,24 13,21 8,24" fill="#2f4a8a" stroke="#ffd566" stroke-width="1.4"/>',
  'icon-trophy':
    '<path d="M9 6h14v7a7 7 0 0 1-14 0z" fill="#ffd566" stroke="#5c3d00" stroke-width="1.6"/><path d="M9 8H5c0 4 2 6 4 6M23 8h4c0 4-2 6-4 6" fill="none" stroke="#ffd566" stroke-width="2"/><rect x="14" y="19" width="4" height="5" fill="#ffd566"/><rect x="10" y="24" width="12" height="3" rx="1" fill="#fde047"/>',
  'icon-shield':
    '<path d="M16 4l10 4v7c0 6.5-4.3 11.2-10 13-5.7-1.8-10-6.5-10-13V8z" fill="#38bdf8" stroke="#e0f7fa" stroke-width="1.8"/><path d="M16 8v15" stroke="#ffffff" stroke-width="1.4" opacity="0.7"/>',
  'icon-sword':
    '<path d="M25 5l2 2-11 11-2-2z" fill="#e0f2fe" stroke="#1e293b" stroke-width="1.2"/><path d="M10 17l5 5-2 2-5-5z" fill="#ffd566"/><path d="M7 22l3 3-4 2z" fill="#a855f7"/>',
  'icon-sparkle':
    '<polygon points="16,3 18.5,13.5 29,16 18.5,18.5 16,29 13.5,18.5 3,16 13.5,13.5" fill="#fff59d" stroke="#f59e0b" stroke-width="1.2"/>',
  'icon-gem':
    '<polygon points="10,6 22,6 28,13 16,27 4,13" fill="#7ce8ff" stroke="#e0f7fa" stroke-width="1.6"/><polygon points="10,6 22,6 19,13 13,13" fill="#e0f7fa" opacity="0.8"/><line x1="4" y1="13" x2="28" y2="13" stroke="#ffffff" stroke-width="1.2"/>',
  'icon-evolve':
    '<path d="M11 6c4 4 6 8 10 10M21 6c-4 4-6 8-10 10M11 16c4 4 6 6 10 10M21 16c-4 4-6 6-10 10" fill="none" stroke="#c084fc" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="16" r="3" fill="#ffd566"/>',
  'icon-quest':
    '<rect x="7" y="4" width="18" height="24" rx="2.5" fill="#1e2d5e" stroke="#ffd566" stroke-width="1.8"/><circle cx="16" cy="12" r="2.2" fill="#ffd566"/><rect x="14.5" y="16" width="3" height="7" rx="1" fill="#7ce8ff"/>',
  'icon-rival':
    '<polygon points="16,4 25,11 22,25 10,25 7,11" fill="#ef4444" stroke="#fde047" stroke-width="1.8"/><polygon points="16,9 20,16 16,22 12,16" fill="#ffd566"/>',
  'icon-lab':
    '<path d="M12 5h8v5l6 12a4 4 0 0 1-3.6 5.8H9.6A4 4 0 0 1 6 22l6-12z" fill="#38bdf8" stroke="#e0f7fa" stroke-width="1.8"/><rect x="10.5" y="3.5" width="11" height="3" rx="1" fill="#ffd566"/><circle cx="14" cy="19" r="2" fill="#fff"/><circle cx="19" cy="22" r="1.5" fill="#fff"/>',
  'icon-lock':
    '<rect x="7" y="14" width="18" height="13" rx="2.5" fill="#475569" stroke="#cbd5e1" stroke-width="1.8"/><path d="M11 14v-3.5a5 5 0 0 1 10 0V14" fill="none" stroke="#ffd566" stroke-width="2.4"/><circle cx="16" cy="20" r="2" fill="#ffd566"/>',
  'icon-check':
    '<circle cx="16" cy="16" r="12" fill="#14532d" stroke="#4ade80" stroke-width="2"/><path d="M10 16.5l4 4 8-9" fill="none" stroke="#86efac" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  'icon-warn':
    '<polygon points="16,4 29,27 3,27" fill="#78350f" stroke="#fbbf24" stroke-width="2"/><rect x="14.7" y="12" width="2.6" height="7.5" rx="1" fill="#fde047"/><circle cx="16" cy="23" r="1.6" fill="#fde047"/>',
  'icon-danger':
    '<polygon points="11,4 21,4 28,11 28,21 21,28 11,28 4,21 4,11" fill="#7f1d1d" stroke="#ff7a7a" stroke-width="2"/><line x1="11" y1="11" x2="21" y2="21" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><line x1="21" y1="11" x2="11" y2="21" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
  'icon-balance':
    '<line x1="16" y1="6" x2="16" y2="26" stroke="#ffd566" stroke-width="2"/><line x1="7" y1="10" x2="25" y2="10" stroke="#7ce8ff" stroke-width="2"/><path d="M7 10l-3 8h6zM25 10l-3 8h6z" fill="#7ce8ff"/><rect x="11" y="25" width="10" height="2.5" rx="1" fill="#ffd566"/>',
  'icon-close':
    '<line x1="8" y1="8" x2="24" y2="24" stroke="#f8fafc" stroke-width="2.8" stroke-linecap="round"/><line x1="24" y1="8" x2="8" y2="24" stroke="#f8fafc" stroke-width="2.8" stroke-linecap="round"/>',
  'icon-cape':
    '<path d="M10 6h12l4 20-10-4-10 4z" fill="#a855f7" stroke="#ffd566" stroke-width="1.6"/>',
  'icon-hat':
    '<path d="M7 19c0-6 4-10 9-10s9 4 9 10z" fill="#38bdf8" stroke="#e0f7fa" stroke-width="1.6"/><path d="M5 19h22v3H5z" fill="#ffd566"/>',
  'icon-aura':
    '<circle cx="16" cy="16" r="10" fill="none" stroke="#c084fc" stroke-width="2" stroke-dasharray="3 2"/><circle cx="16" cy="16" r="5" fill="#7ce8ff"/>',
  'icon-pause':
    '<rect x="8" y="6" width="5.5" height="20" rx="1.5" fill="#f8fafc"/><rect x="18.5" y="6" width="5.5" height="20" rx="1.5" fill="#f8fafc"/>',
  'icon-play':
    '<polygon points="9,6 26,16 9,26" fill="#ffd566" stroke="#fff8d6" stroke-width="1.4"/>',
  'icon-dash':
    '<polygon points="18,4 7,17 15,17 12,28 25,14 17,14" fill="#7ce8ff" stroke="#fff8d6" stroke-width="1.4"/>',
};

/**
 * Hydrates `#svg-sprite-host` with `./icons/starlight-icons.svg` and injects any
 * missing `IconId` symbols so `<svg><use href="#icon-..."/></svg>` never breaks.
 * NEVER uses `display: none` on the sprite host (zero-size accessible clip box).
 */
export async function ensureSvgSpriteSheet(
  docOrHost?: Document | HTMLElement | null,
  spriteUrl?: string,
): Promise<void> {
  const doc =
    docOrHost && 'createElement' in docOrHost
      ? docOrHost
      : docOrHost?.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  let host =
    docOrHost && !('createElement' in docOrHost)
      ? docOrHost
      : doc.getElementById('svg-sprite-host');
  if (!host && doc.body) {
    host = doc.createElement('div');
    host.id = 'svg-sprite-host';
    doc.body.appendChild(host);
  }
  if (!host) return;

  // Enforce zero-size accessible clip box (never display: none!)
  host.style.position = 'absolute';
  host.style.width = '0px';
  host.style.height = '0px';
  host.style.overflow = 'hidden';
  host.style.clip = 'rect(0, 0, 0, 0)';
  host.style.pointerEvents = 'none';
  host.setAttribute('aria-hidden', 'true');

  if (typeof fetch === 'function' && !host.querySelector('svg')) {
    try {
      const baseUri = typeof doc.baseURI === 'string' && doc.baseURI ? doc.baseURI : undefined;
      const targetUrl =
        spriteUrl ?? (baseUri ? new URL('./icons/starlight-icons.svg', baseUri).href : './icons/starlight-icons.svg');
      const res = await fetch(targetUrl);
      if (res.ok) {
        host.innerHTML = await res.text();
      }
    } catch {
      // Offline / unit test fallback below guarantees all 99 symbols exist
    }
  }

  let svgRoot = host.querySelector('svg');
  if (!svgRoot) {
    svgRoot = doc.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as SVGSVGElement;
    svgRoot.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgRoot.setAttribute('width', '0');
    svgRoot.setAttribute('height', '0');
    host.appendChild(svgRoot);
  }

  const missingMarkup: string[] = [];
  for (const id of ALL_ICON_IDS) {
    if (host.querySelector(`#${id}`)) continue;
    const body =
      FALLBACK_CORE_SYMBOL_PATHS[id] ??
      `<circle cx="16" cy="16" r="11" fill="#38bdf8" stroke="#ffd566" stroke-width="2"/><polygon points="16,7 19,13 25,14 20.5,18 21.5,24 16,21 10.5,24 11.5,18 7,14 13,13" fill="#fff8d6"/>`;
    missingMarkup.push(`<symbol id="${id}" viewBox="0 0 32 32">${body}</symbol>`);
  }
  if (missingMarkup.length > 0) {
    svgRoot.insertAdjacentHTML('beforeend', missingMarkup.join('\n'));
  }
}

// ---------------------------------------------------------------------------
// Crisp Pixel-Art Fallback Matrices (12x12) for Pokémon Previews & Portraits
// ---------------------------------------------------------------------------
// Legend: '.' transparent, 'O' dark outline, 'P' primary, 'L' highlight,
// 'S' shadow, 'A' accent/belly/leaf/flame, 'E' eye dark, 'W' eye glint
const ARCHETYPE_PIXELS_12: Record<string, readonly string[]> = {
  biped: [
    '...OO..OO...',
    '..OPLO.OPLO.',
    '..OPOOOOOPO.',
    '..OLLLLLLLO.',
    '..OEWPPWEPO.',
    '..OPPPPPPSO.',
    '..OOAAAAPOO.',
    '.OPAAAAAAPO.',
    '.OOPPPPPPOO.',
    '..OSSO.OSSO.',
    '..OOO...OOO.',
    '............',
  ],
  quadruped: [
    '............',
    '..OO....OO..',
    '.OPLO..OPLO.',
    '.OPLOOOOPLO.',
    '.OLLLLLLLLO.',
    '.OEPPPPWEPO.',
    '.OPPPPPPAAO.',
    'OOPPPPPSSSOO',
    '.OPPSPPSSPO.',
    '.OSSO..OSSO.',
    '.OOO....OOO.',
    '............',
  ],
  winged: [
    '....OOOO....',
    '..OOLLLLO...',
    '.OOPLLLPPO..',
    'OPLOPPPPOPLO',
    'OPPOPWEPOPPO',
    'OOOOPAAAOOOP',
    '..OOPPPPOO..',
    '...OPSSPO...',
    '...OSSOSSO..',
    '....O..O....',
    '...OO..OO...',
    '............',
  ],
  serpentine: [
    '....OOOO....',
    '...OLLLLOO..',
    '..OEPPWELPO.',
    '..OPPPPPSSO.',
    '...OOAAAO...',
    '....OPPPPO..',
    '...OPLLLPO..',
    '..OPPPSSPO..',
    '..OSSO..OO..',
    '...OOAAOO...',
    '....OOOO....',
    '............',
  ],
  aquatic: [
    '.....OO.....',
    '...OOAAOO...',
    '..OLLLLLLO..',
    '.OEPPPPPWEO.',
    'OOPPPPAAAOO.',
    'OAAOPPPPSOO.',
    '.OOOPPPSSPO.',
    '...OPSSSOO..',
    '..OO....OO..',
    '............',
    '............',
    '............',
  ],
  insectoid: [
    '..O......O..',
    '...O.OO.O...',
    '..OOLLLLOO..',
    '.OAAELLLEAO.',
    '.OAAOPPPPAO.',
    '..OOOPPPPOO.',
    '.OOPAAAAAPO.',
    '.O.OPSSPSO.O',
    'O..OSSOSSO.O',
    '....OO.OO...',
    '............',
    '............',
  ],
  draconic: [
    '..OO....OO..',
    '.OAAO..OAAO.',
    '..OPLOOOPLO.',
    '..OLLLLLLLO.',
    '..OEWPPAEPO.',
    '.OOPPPAAAOO.',
    'OPLOPPPPSSOO',
    'OPO.OPSSSO..',
    '.O..OSSOSSO.',
    '....OOO.OOO.',
    '............',
    '............',
  ],
  construct: [
    '....OOOO....',
    '..OOAAAAOO..',
    '.OOLLLLLLOO.',
    '.OPPPEEPPPO.',
    '.OPPAAAAAPO.',
    'OPLOPPPPPOPL',
    'OPO.OPPPPO.O',
    '....OPSSPO..',
    '...OSSO.OSS.',
    '...OOO...OO.',
    '............',
    '............',
  ],
  amorphous: [
    '....OOOO....',
    '..OOLLLLOO..',
    '.OLLLLLLLLO.',
    '.OEPPPPPWEO.',
    'OPLPPPPPPPSO',
    'OPPPAAAAPPSO',
    'OPPPPPPPSSSO',
    '.OPSSSSSSPO.',
    '..OOOOOOOO..',
    '............',
    '............',
    '............',
  ],
  flora: [
    '...OOAAOO...',
    '..OAAAAAAO..',
    '..OOAAAAOO..',
    '..OLLLLLLO..',
    '.OEPPPPPWEO.',
    '.OPPPAAAPSO.',
    '..OPPPPPPSO.',
    '..OOPPPPOO..',
    '...OSSOSSO..',
    '...OOO.OOO..',
    '............',
    '............',
  ],
  crystalline: [
    '.....OO.....',
    '....OAAO....',
    '...OALLLO...',
    '..OALLLPPO..',
    '.OAEPPPWEPO.',
    '.OPPPAAAPSO.',
    '..OPPPSSPO..',
    '...OPSSPO...',
    '....OSSO....',
    '.....OO.....',
    '............',
    '............',
  ],
};

function findRegion(
  manifest: AtlasManifest | null,
  sheetKeys: string[],
  regionCandidates: string[],
): AtlasRegion | null {
  if (!manifest?.sheets) return null;
  for (const sKey of sheetKeys) {
    const sheet = manifest.sheets[sKey];
    if (!sheet?.regions) continue;
    for (const rKey of regionCandidates) {
      if (sheet.regions[rKey]) return sheet.regions[rKey];
    }
  }
  return null;
}

function mixHexSimple(hexA: string, hexB: string, ratio: number): string {
  const parse = (h: string): [number, number, number] => {
    const c = h.replace('#', '');
    const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
    const n = Number.parseInt(full.slice(0, 6), 16);
    if (Number.isNaN(n)) return [120, 160, 220];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r1, g1, b1] = parse(hexA);
  const [r2, g2, b2] = parse(hexB);
  const k = Math.max(0, Math.min(1, ratio));
  const r = Math.round(r1 + (r2 - r1) * k);
  const g = Math.round(g1 + (g2 - g1) * k);
  const b = Math.round(b1 + (b2 - b1) * k);
  return `rgb(${r}, ${g}, ${b})`;
}

const STARTER_PIXELS_16: Record<number, readonly string[]> = {
  // #0001 Bulbasaur — teal-mint quadruped with lush green bulb on back
  1: [
    '......OOOO......',
    '.....OGGGGO.....',
    '....OGLLGGGO....',
    '...OGGLLGGGGO...',
    '...OGGGGGGGGO...',
    '..OOOOPPPPOOOO..',
    '.OPPPPLLPPLPPPO.',
    '.OPWEOPLLPOEWPO.',
    '.OPPPPPPPPPPPPO.',
    '.OPSPPPPPPPPSPO.',
    '..OPPPSSSSPPPO..',
    '..OPSOOOOOOSPO..',
    '..OPPO....OPPO..',
    '..OOO......OOO..',
    '................',
    '................',
  ],
  // #0004 Charmander — warm orange lizard with golden-red tail flame
  4: [
    '.....OOOO.......',
    '....OPLPPO......',
    '...OPLPPWEO.....',
    '...OPPPPPPO..OO.',
    '....OPPPPO..OFO.',
    '....OCCCCO.OFYO.',
    '...OPCCCCPOOFYO.',
    '...OPCCCCPO.OO..',
    '....OPCCCPO.O...',
    '....OPPPPOO.....',
    '....OPPSPO......',
    '....OPPO.O......',
    '...OPPO.OPPO....',
    '...OOO...OOO....',
    '................',
    '................',
  ],
  // #0007 Squirtle — sky-blue turtle with brown shell, cream belly & curled tail
  7: [
    '.....OOOO.......',
    '....OPLLPO......',
    '...OPLPPWEO.....',
    '...OPPPPPPO.....',
    '....OPPPPO......',
    '...OOBBBBOO.....',
    '..OBBCCBPPPO....',
    '..OBBCCBPPLPO...',
    '..OBBCCBPPPO....',
    '..OOBBBOOPO..OO.',
    '...OPPPPO..OPLO.',
    '...OPSO.O..OPLO.',
    '...OPPO.OPPOOO..',
    '...OOO...OOO....',
    '................',
    '................',
  ],
};

export function drawPixelArchetypeSprite(
  ctx: CanvasRenderingContext2D,
  speciesId: number,
  x: number,
  y: number,
  size: number,
  shiny = false,
  silhouette = false,
): void {
  const sp = getSpeciesEntry(speciesId);
  const pal = TYPE_PALETTES[sp.type] ?? TYPE_PALETTES.normal;
  const starterGrid = STARTER_PIXELS_16[speciesId];
  const grid = starterGrid ?? ARCHETYPE_PIXELS_12[sp.archetype] ?? ARCHETYPE_PIXELS_12.biped;
  const gridDim = grid.length;
  const pxSize = Math.max(1, Math.floor(size / gridDim));
  const ox = Math.round(x + (size - pxSize * gridDim) * 0.5);
  const oy = Math.round(y + (size - pxSize * gridDim) * 0.5);

  const base = shiny ? '#ffd566' : sp.color || pal.primary;
  const colors: Record<string, string> = silhouette
    ? {
        O: '#0b1026',
        P: '#1d2b53',
        L: '#273b6e',
        S: '#141d3c',
        A: '#2c447c',
        E: '#0f1733',
        W: '#38528f',
        G: '#1f335c',
        C: '#1a274a',
        B: '#182444',
        F: '#263b6e',
        Y: '#2e4782',
      }
    : {
        O: '#111633',
        P: speciesId === 1 && !shiny ? '#4fd1a5' : speciesId === 4 && !shiny ? '#fb7b2c' : speciesId === 7 && !shiny ? '#4bb4f8' : base,
        L: speciesId === 1 && !shiny ? '#86efac' : speciesId === 4 && !shiny ? '#fdba74' : speciesId === 7 && !shiny ? '#93e1ff' : mixHexSimple(base, '#ffffff', 0.42),
        S: speciesId === 1 && !shiny ? '#15803d' : speciesId === 4 && !shiny ? '#c2410c' : speciesId === 7 && !shiny ? '#1d6fb8' : mixHexSimple(base, pal.dark, 0.52),
        A: shiny ? '#7ce8ff' : pal.glow,
        E: '#0d132b',
        W: '#ffffff',
        G: shiny ? '#bef264' : '#22c55e',
        C: '#fde68a',
        B: '#a16207',
        F: '#ef4444',
        Y: '#fde047',
      };

  for (let row = 0; row < grid.length; row++) {
    const line = grid[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      const fill = colors[ch];
      if (!fill) continue;
      ctx.fillStyle = fill;
      ctx.fillRect(ox + col * pxSize, oy + row * pxSize, pxSize, pxSize);
    }
  }

  if (shiny && !silhouette) {
    ctx.fillStyle = '#fff9c4';
    ctx.fillRect(ox + pxSize * (gridDim - 3), oy + pxSize, pxSize, pxSize * 2);
    ctx.fillRect(ox + pxSize * (gridDim - 4), oy + pxSize * 2, pxSize * 3, pxSize);
  }
}

function getSafe2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d', { willReadFrequently: true }) ?? canvas.getContext('2d');
  } catch {
    return null;
  }
}

/**
 * Draws the live animated Pokémon frame or crisp `fallbacks-atlas.png` pixel sprite
 * (`imageSmoothingEnabled = false`) onto any preview `<canvas>` in Pokédex, Starter Lab,
 * Team/Box, or Tactical Briefing. Never emits `<img>` tags or blurry upscales.
 */
export function renderPokemonPreviewCanvas(
  canvas: HTMLCanvasElement,
  speciesId: number,
  frames: DecodedSpriteFrames | null,
  _fallbackSheet: CanvasImageSource | null,
  _manifest: AtlasManifest | null,
  shiny = false,
  timeSec = 0,
  silhouette = false,
): void {
  const ctx = getSafe2DContext(canvas);
  if (!ctx) return;

  const w = canvas.width || 96;
  const h = canvas.height || 96;
  const sp = getSpeciesEntry(speciesId);
  const pal = TYPE_PALETTES[sp.type] ?? TYPE_PALETTES.normal;

  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;

  // Soft elemental spotlight halo & grounded pedestal shadow (no boxy edges)
  const bg = ctx.createRadialGradient(w * 0.5, h * 0.46, Math.max(4, w * 0.08), w * 0.5, h * 0.5, w * 0.66);
  bg.addColorStop(0, silhouette ? 'rgba(99, 132, 224, 0.24)' : shiny ? 'rgba(255, 224, 130, 0.34)' : `${pal.primary}44`);
  bg.addColorStop(0.55, silhouette ? 'rgba(18, 28, 64, 0.72)' : `${pal.dark}66`);
  bg.addColorStop(1, 'rgba(7, 11, 28, 0.88)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle grounded elliptical shadow disc under sprite
  ctx.save();
  ctx.fillStyle = 'rgba(4, 7, 20, 0.58)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.83, w * 0.31, Math.max(3, h * 0.075), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = silhouette ? 'rgba(108, 229, 255, 0.16)' : shiny ? 'rgba(255, 224, 130, 0.24)' : `${pal.glow}24`;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.82, w * 0.26, Math.max(2, h * 0.055), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const frameCanvas = SpriteAssetLoader.selectFrame(frames, timeSec);
  if (frameCanvas && frameCanvas.width > 0 && frameCanvas.height > 0 && !silhouette) {
    const pad = Math.max(4, Math.round(Math.min(w, h) * 0.08));
    const availW = Math.max(8, w - pad * 2);
    const availH = Math.max(8, h - pad * 2);
    const scale = Math.min(availW / frameCanvas.width, availH / frameCanvas.height);
    const dw = Math.max(8, Math.round(frameCanvas.width * scale));
    const dh = Math.max(8, Math.round(frameCanvas.height * scale));
    const dx = Math.round((w - dw) * 0.5);
    const dy = Math.round(h - pad - dh);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (frames?.mirrorX) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(frameCanvas, w - dx - dw, dy, dw, dh);
    } else {
      ctx.drawImage(frameCanvas, dx, dy, dw, dh);
    }
    ctx.restore();
  } else {
    // Always draw crisp species-colored pixel sprite (or mystery silhouette when unmet)
    const drawSize = Math.max(28, Math.min(w, h) - 12);
    drawPixelArchetypeSprite(
      ctx,
      speciesId,
      Math.round((w - drawSize) * 0.5),
      Math.round((h - drawSize) * 0.5),
      drawSize,
      shiny,
      silhouette,
    );
  }

  if (shiny && !silhouette) {
    ctx.fillStyle = '#fff59d';
    ctx.fillRect(w - 14, 6, 6, 2);
    ctx.fillRect(w - 12, 4, 2, 6);
  }
}

const PORTRAIT_PIXELS_12: readonly string[] = [
  '...OOOOOO...',
  '..OHHHHHHO..',
  '.OHAAAAAAHO.',
  '.OHSSSSSSHO.',
  '.OHSEWWESHO.',
  '.OHSSSSSSHO.',
  '..OSSSSSSO..',
  '..OCCCCCCOO.',
  '.OPPCCCCPPO.',
  '.OPPPCCPPPO.',
  '.OSSOSSSOSS.',
  '..OOOOOOOO..',
];

/**
 * Draws the pixel portrait bust (`violet_portrait`, `ozias_portrait`, `willow_portrait`,
 * `rival_portrait`) from `characters-atlas.png`, with crisp pixel fallback if unloaded.
 */
export function renderTrainerPortraitCanvas(
  canvas: HTMLCanvasElement,
  trainerId: TrainerId | 'willow' | 'rival',
  charactersSheet: CanvasImageSource | null,
  manifest: AtlasManifest | null,
  appearance?: TrainerAppearance | null,
): void {
  const ctx = getSafe2DContext(canvas);
  if (!ctx) return;

  const w = canvas.width || 64;
  const h = canvas.height || 64;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;

  const resolvedLook =
    trainerId === 'violet' || trainerId === 'ozias'
      ? getResolvedTrainerLook(trainerId, appearance)
      : null;

  const bgAccent =
    trainerId === 'willow'
      ? '#4ade80'
      : trainerId === 'rival'
        ? '#f43f5e'
        : resolvedLook?.accent ?? '#c084fc';

  const bg = ctx.createRadialGradient(w * 0.5, h * 0.34, 3, w * 0.5, h * 0.5, w * 0.72);
  bg.addColorStop(0, `${bgAccent}3a`);
  bg.addColorStop(0.55, '#15204c');
  bg.addColorStop(1, '#080c22');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = `${bgAccent}38`;
  ctx.fillRect(0, h - Math.max(3, Math.round(h * 0.09)), w, Math.max(3, Math.round(h * 0.09)));

  const regionCandidates = [
    `${trainerId}_portrait`,
    `${trainerId}-portrait`,
    `portrait_${trainerId}`,
    `portrait-${trainerId}`,
    `${trainerId}_idle`,
    `${trainerId}-idle`,
    trainerId === 'willow' ? 'npc-down-idle' : trainerId === 'rival' ? 'rival-down-idle' : 'trainer-down-idle',
  ];
  const region = findRegion(manifest, ['characters', 'characters-atlas'], regionCandidates);

  if (charactersSheet && region) {
    // Cape backdrop behind portrait shoulders when equipped
    if (resolvedLook && appearance?.cape) {
      ctx.fillStyle = resolvedLook.outfitSecondary;
      ctx.fillRect(Math.round(w * 0.08), Math.round(h * 0.54), Math.round(w * 0.84), Math.round(h * 0.44));
      ctx.fillStyle = resolvedLook.accent;
      ctx.fillRect(Math.round(w * 0.08), Math.round(h * 0.54), Math.round(w * 0.84), Math.max(2, Math.round(h * 0.05)));
    }
    const pad = Math.max(2, Math.round(Math.min(w, h) * 0.05));
    const availW = Math.max(8, w - pad * 2);
    const availH = Math.max(8, h - pad * 2);
    const scale = Math.min(availW / region.w, availH / region.h);
    const dw = Math.max(8, Math.round(region.w * scale));
    const dh = Math.max(8, Math.round(region.h * scale));
    const dx = Math.round((w - dw) * 0.5);
    const dy = Math.round(h - pad - dh);
    ctx.drawImage(charactersSheet, region.x, region.y, region.w, region.h, dx, dy, dw, dh);
  } else {
    // Crisp 12x12 pixel portrait bust fallback
    const hair =
      trainerId === 'willow'
        ? '#cbd5e1'
        : trainerId === 'rival'
          ? '#e879f9'
          : resolvedLook?.hair ?? '#3b0764';
    const skin =
      trainerId === 'willow'
        ? '#f5d0b5'
        : trainerId === 'rival'
          ? '#f3d2c1'
          : resolvedLook?.skin ?? '#fde2c8';
    const primary =
      trainerId === 'willow'
        ? '#f8fafc'
        : trainerId === 'rival'
          ? '#be123c'
          : resolvedLook?.outfitPrimary ?? '#a855f7';
    const secondary =
      trainerId === 'willow'
        ? '#22c55e'
        : trainerId === 'rival'
          ? '#fbbf24'
          : resolvedLook?.outfitSecondary ?? '#f472b6';

    const palette: Record<string, string> = {
      O: '#10152e',
      H: hair,
      S: skin,
      P: primary,
      C: secondary,
      A: bgAccent,
      E: '#141a38',
      W: '#ffffff',
    };

    const px = Math.max(2, Math.floor((Math.min(w, h) - 6) / 12));
    const ox = Math.round((w - px * 12) * 0.5);
    const oy = Math.round((h - px * 12) * 0.5);
    for (let row = 0; row < PORTRAIT_PIXELS_12.length; row++) {
      const line = PORTRAIT_PIXELS_12[row];
      for (let col = 0; col < line.length; col++) {
        const fill = palette[line[col]];
        if (!fill) continue;
        ctx.fillStyle = fill;
        ctx.fillRect(ox + col * px, oy + row * px, px, px);
      }
    }
  }

  // Live Cosmetic Overlays (Outfit trim, Accessory badge, Cape clasp, Aura sparkles — BUG-21)
  if (resolvedLook && appearance) {
    const u = Math.max(2, Math.round(w / 24));
    // Outfit trim ribbon along bottom collar when customized
    if (appearance.styleId && appearance.styleId !== 'default') {
      ctx.fillStyle = resolvedLook.outfitPrimary;
      ctx.fillRect(0, h - u * 2, w, u * 2);
      ctx.fillStyle = resolvedLook.accent;
      ctx.fillRect(Math.round(w * 0.2), h - u * 2, Math.round(w * 0.6), u);
    }

    // Cape gold clasp indicator
    if (appearance.cape) {
      ctx.fillStyle = '#fde047';
      ctx.fillRect(Math.round(w * 0.16), Math.round(h * 0.74), u * 2, u * 2);
      ctx.fillRect(Math.round(w * 0.84) - u * 2, Math.round(h * 0.74), u * 2, u * 2);
    }

    // Equipped Headgear / Accessory pixel overlay
    const acc = appearance.accessory;
    if (acc === 'crown') {
      ctx.fillStyle = '#facc15';
      ctx.fillRect(Math.round(w * 0.3), u, Math.round(w * 0.4), u * 2);
      ctx.fillRect(Math.round(w * 0.3), 0, u, u);
      ctx.fillRect(Math.round(w * 0.48), 0, u, u);
      ctx.fillRect(Math.round(w * 0.66), 0, u, u);
    } else if (acc === 'halo') {
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = Math.max(2, u * 0.7);
      ctx.beginPath();
      ctx.ellipse(w * 0.5, u * 1.8, w * 0.24, u * 1.1, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (acc === 'goggles') {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(Math.round(w * 0.28), Math.round(h * 0.26), u * 4, u * 2);
      ctx.fillRect(Math.round(w * 0.54), Math.round(h * 0.26), u * 4, u * 2);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(Math.round(w * 0.46), Math.round(h * 0.28), u * 2, u);
    } else if (acc === 'visor') {
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(Math.round(w * 0.24), Math.round(h * 0.28), Math.round(w * 0.52), u * 2);
    } else if (acc === 'wizard') {
      ctx.fillStyle = '#6d28d9';
      ctx.fillRect(Math.round(w * 0.22), u * 2, Math.round(w * 0.56), u * 1.5);
      ctx.fillRect(Math.round(w * 0.36), 0, Math.round(w * 0.28), u * 2);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(Math.round(w * 0.46), u, u * 2, u);
    } else if (acc === 'headband') {
      ctx.fillStyle = '#facc15';
      ctx.fillRect(Math.round(w * 0.22), Math.round(h * 0.2), Math.round(w * 0.56), u * 1.5);
    } else if (acc === 'antlers') {
      ctx.fillStyle = '#f472b6';
      ctx.fillRect(Math.round(w * 0.24), u, u * 2, u * 3);
      ctx.fillRect(Math.round(w * 0.76) - u * 2, u, u * 2, u * 3);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(Math.round(w * 0.24), u, u, u);
      ctx.fillRect(Math.round(w * 0.76) - u, u, u, u);
    }

    // Equipped Aura particle sparkles around frame
    const auraColors: Record<string, string> = {
      stars: '#fde047',
      hearts: '#f472b6',
      lightning: '#38bdf8',
      blossom: '#fb7185',
      cosmic: '#2dd4bf',
    };
    const auraColor = auraColors[appearance.aura ?? 'none'];
    if (auraColor) {
      ctx.fillStyle = auraColor;
      const pts: Array<[number, number]> = [
        [w * 0.12, h * 0.18],
        [w * 0.86, h * 0.22],
        [w * 0.14, h * 0.56],
        [w * 0.86, h * 0.58],
      ];
      for (const [px, py] of pts) {
        const ix = Math.round(px);
        const iy = Math.round(py);
        ctx.fillRect(ix - u, iy, u * 3, Math.max(2, Math.round(u * 0.7)));
        ctx.fillRect(ix, iy - u, Math.max(2, Math.round(u * 0.7)), u * 3);
      }
      ctx.strokeStyle = `${auraColor}99`;
      ctx.lineWidth = Math.max(2, u * 0.6);
      ctx.strokeRect(1, 1, w - 2, h - 2);
    }
  }
}
