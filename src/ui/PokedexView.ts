import {
  BIOME_IDS,
  ELEMENTAL_TYPES,
  type AtlasManifest,
  type BiomeId,
  type CryWaveformSnapshot,
  type DecodedSpriteFrames,
  type DojoProfileState,
  type DojoSpeciesEntry,
  type ElementalType,
  type UIBridgeCallbacks,
} from '../contracts';
import {
  EVOLUTIONS,
  getAbilityEntry,
  getAllEvolutionItems,
  getAllSpecies,
  getBiomeVisualProfile,
  getEvolutionRules,
  getMoveEntry,
  getSpeciesEntry,
  TOTAL_SPECIES_COUNT,
  TYPE_PALETTES,
  typeToIconId,
} from '../core';
import { createIconSvg, renderPokemonPreviewCanvas, safeText } from './iconHelper';

export interface PokedexQueryOptions {
  query: string;
  typeFilter: ElementalType | 'all';
  abilityFilter?: string | 'all';
  genFilter?: number | 'all';
  biomeFilter?: BiomeId | 'all';
  caughtOnly: boolean;
  needToCatchOnly?: boolean;
  page: number;
  pageSize?: number;
  pokedex: DojoProfileState['pokedex'];
}

export interface PokedexPageResult {
  items: DojoSpeciesEntry[];
  totalMatches: number;
  caughtCount: number;
  seenCount: number;
  page: number;
  totalPages: number;
}

export interface PokedexAssets {
  manifest: AtlasManifest | null;
  fallbacksSheet: CanvasImageSource | null;
  frames: DecodedSpriteFrames | null;
  spriteCacheVersion?: number;
  getFrames?: (speciesId: number) => DecodedSpriteFrames | null;
}

export function filterAndPaginatePokedex(opts: PokedexQueryOptions): PokedexPageResult {
  const catalog = getAllSpecies();
  const rawQ = opts.query.trim().toLowerCase();
  const q = rawQ.startsWith('#') ? rawQ.slice(1).trim() : rawQ;
  const pageSize = Math.max(1, Math.floor(opts.pageSize ?? 24));
  const abilityFilter = opts.abilityFilter ?? 'all';
  const genFilter = opts.genFilter ?? 'all';
  const biomeFilter = opts.biomeFilter ?? 'all';

  const seenSet = new Set<number>(Array.isArray(opts.pokedex?.seen) ? opts.pokedex.seen : []);
  const caughtMap = opts.pokedex?.caught ?? {};

  let caughtCount = 0;
  let seenCount = 0;
  const matches: DojoSpeciesEntry[] = [];

  for (let i = 0; i < catalog.length; i++) {
    const sp = catalog[i];
    const isCaught = Number(caughtMap[sp.id] ?? 0) > 0;
    const isSeen = isCaught || seenSet.has(sp.id);
    if (isCaught) caughtCount += 1;
    if (isSeen) seenCount += 1;

    if (opts.caughtOnly && !isCaught) continue;
    if (opts.needToCatchOnly && isCaught) continue;
    if (opts.typeFilter !== 'all' && sp.type !== opts.typeFilter) continue;
    if (abilityFilter !== 'all' && sp.ability !== abilityFilter) continue;
    if (genFilter !== 'all' && sp.generation !== genFilter) continue;
    if (biomeFilter !== 'all' && sp.biome !== biomeFilter) continue;

    if (q) {
      const padded = String(sp.id).padStart(4, '0');
      if (!sp.name.toLowerCase().includes(q) && !padded.includes(q) && String(sp.id) !== q) {
        continue;
      }
    }
    matches.push(sp);
  }

  const totalMatches = matches.length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / pageSize));
  const clampedPage = Math.max(1, Math.min(totalPages, Math.floor(opts.page)));
  const start = (clampedPage - 1) * pageSize;
  const items = matches.slice(start, start + pageSize);

  return {
    items,
    totalMatches,
    caughtCount,
    seenCount,
    page: clampedPage,
    totalPages,
  };
}

export function computeHoloCardMetrics(
  state: {
    speciesId: number;
    pointerTiltX: number;
    pointerTiltY: number;
    starRank: number;
    bondLevel: number;
    caught: boolean;
    shiny: boolean;
  },
  reducedMotion: boolean,
): {
  rxDeg: number;
  ryDeg: number;
  intensity: number;
  pxPercent: number;
  pyPercent: number;
  maxBond: boolean;
} {
  const starRank = Math.max(0, Math.min(5, state.starRank));
  const bondLevel = Math.max(0, Math.min(100, state.bondLevel));
  const maxBond = bondLevel >= 100;

  const rankContrib = (starRank / 5) * 0.42;
  const bondContrib = (bondLevel / 100) * 0.32;
  const statusContrib = (state.caught ? 0.08 : 0.02) + (maxBond ? 0.12 : 0) + (state.shiny ? 0.1 : 0);
  const intensity = Math.min(1, Math.max(0.08, Number((0.08 + rankContrib + bondContrib + statusContrib).toFixed(3))));

  if (reducedMotion) {
    return {
      rxDeg: 0,
      ryDeg: 0,
      intensity,
      pxPercent: 50,
      pyPercent: 50,
      maxBond,
    };
  }

  const tx = Math.max(-1, Math.min(1, state.pointerTiltX));
  const ty = Math.max(-1, Math.min(1, state.pointerTiltY));
  return {
    rxDeg: Number((-ty * 13).toFixed(2)),
    ryDeg: Number((tx * 13).toFixed(2)),
    intensity,
    pxPercent: Number((50 + tx * 40).toFixed(1)),
    pyPercent: Number((50 + ty * 40).toFixed(1)),
    maxBond,
  };
}

const PRE_EVO_MAP: Map<number, Array<{ fromId: number; label: string }>> = (() => {
  const map = new Map<number, Array<{ fromId: number; label: string }>>();
  const itemLookup = new Map(getAllEvolutionItems().map((it) => [it.id, it.name]));
  for (const [fromRaw, rules] of Object.entries(EVOLUTIONS)) {
    const fromId = Number(fromRaw);
    if (!Array.isArray(rules)) continue;
    for (const r of rules) {
      const list = map.get(r.to) ?? [];
      const req = r.item
        ? (itemLookup.get(r.item) ?? r.item)
        : r.minLevel
          ? `Lv.${r.minLevel}`
          : 'Evolve';
      list.push({ fromId, label: req });
      map.set(r.to, list);
    }
  }
  return map;
})();

function formatDexNum(id: number): string {
  return `#${String(id).padStart(4, '0')}`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

type OwnershipMode = 'all' | 'caught' | 'missing';

export class PokedexView {
  private callbacks: UIBridgeCallbacks | null = null;
  private rootEl: HTMLElement | null = null;

  private searchQuery = '';
  private typeFilter: ElementalType | 'all' = 'all';
  private abilityFilter: string | 'all' = 'all';
  private genFilter: number | 'all' = 'all';
  private biomeFilter: BiomeId | 'all' = 'all';
  private ownershipMode: OwnershipMode = 'all';
  private advancedOpen = false;
  private currentPage = 1;
  private readonly pageSize = 24;

  private pointerTiltX = 0;
  private pointerTiltY = 0;
  private reducedMotion = false;
  private lastSelectedId = 25;
  private currentProfile: DojoProfileState | null = null;
  private currentWaveform: CryWaveformSnapshot | null = null;
  private lastAssets: PokedexAssets | undefined;

  private searchInput: HTMLInputElement | null = null;
  private caughtToggleBtn: HTMLButtonElement | null = null;
  private filtersToggleBtn: HTMLButtonElement | null = null;
  private advancedTrayEl: HTMLElement | null = null;
  private countBadgeEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private pageInfoEl: HTMLElement | null = null;
  private prevPageBtn: HTMLButtonElement | null = null;
  private nextPageBtn: HTMLButtonElement | null = null;

  private holoCardEl: HTMLElement | null = null;
  private cardNumberEl: HTMLElement | null = null;
  private cardNameEl: HTMLElement | null = null;
  private cardTypesEl: HTMLElement | null = null;
  private portraitCanvas: HTMLCanvasElement | null = null;
  private cryCanvas: HTMLCanvasElement | null = null;
  private playCryBtn: HTMLButtonElement | null = null;
  private cardAbilityEl: HTMLElement | null = null;
  private cardMovesEl: HTMLElement | null = null;
  private cardEvoEl: HTMLElement | null = null;
  private cardLoreEl: HTMLElement | null = null;
  private cardHabitatEl: HTMLElement | null = null;
  private cardStatusEl: HTMLElement | null = null;
  private cardBstEl: HTMLElement | null = null;
  private statRows: Array<{ bar: HTMLElement; val: HTMLElement }> = [];

  private lastListKey = '';
  private lastDetailKey = '';
  private lastTilePaintStamp = '';

  mount(container: HTMLElement, callbacks: UIBridgeCallbacks): void {
    this.callbacks = callbacks;
    this.rootEl = container;
    this.statRows = [];
    this.lastListKey = '';
    this.lastDetailKey = '';
    this.lastTilePaintStamp = '';

    const typeChipsHtml = [
      `<button type="button" class="sl-dex-filter-chip is-active" data-dex-type="all" aria-pressed="true">All Types</button>`,
      ...ELEMENTAL_TYPES.map(
        (t) => `
          <button type="button" class="sl-dex-filter-chip" data-dex-type="${t}" aria-pressed="false">
            ${createIconSvg(typeToIconId(t), 'sl-icon-sm')}
            <span>${capitalize(t)}</span>
          </button>
        `,
      ),
    ].join('');

    const genChipsHtml = [
      `<button type="button" class="sl-dex-filter-chip is-active" data-dex-gen="all" aria-pressed="true">All Gens</button>`,
      ...Array.from({ length: 9 }, (_, i) => i + 1).map(
        (g) => `<button type="button" class="sl-dex-filter-chip" data-dex-gen="${g}" aria-pressed="false">Gen ${g}</button>`,
      ),
    ].join('');

    const biomeChipsHtml = [
      `<button type="button" class="sl-dex-filter-chip is-active" data-dex-biome="all" aria-pressed="true">All Biomes</button>`,
      ...BIOME_IDS.map((bId) => {
        const bp = getBiomeVisualProfile(bId);
        return `
          <button type="button" class="sl-dex-filter-chip" data-dex-biome="${bId}" aria-pressed="false">
            ${createIconSvg(typeToIconId(bp.elementalType), 'sl-icon-sm')}
            <span>${safeText(bp.displayName)}</span>
          </button>
        `;
      }),
    ].join('');

    const abilityEntries = new Map<string, string>();
    for (const sp of getAllSpecies()) {
      if (sp.ability && !abilityEntries.has(sp.ability)) {
        const ab = getAbilityEntry(sp.ability);
        if (ab) abilityEntries.set(sp.ability, ab.name);
      }
    }
    const abilityChipsHtml = [
      `<button type="button" class="sl-dex-filter-chip is-active" data-dex-ability="all" aria-pressed="true">All Abilities</button>`,
      ...Array.from(abilityEntries.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(
          ([id, name]) =>
            `<button type="button" class="sl-dex-filter-chip" data-dex-ability="${safeText(id)}" aria-pressed="false">${safeText(name)}</button>`,
        ),
    ].join('');

    container.innerHTML = `
      <div class="sl-pokedex-body">
        <div class="sl-dex-browser">
          <div class="sl-dex-toolbar">
            <input
              type="search"
              class="sl-input sl-dex-search"
              data-testid="pokedex-search"
              placeholder="Search #0001..#1025 or species name..."
              aria-label="Search Pokédex species"
            />
            <button type="button" class="sl-btn" data-testid="pokedex-caught-toggle" aria-pressed="false">
              ${createIconSvg('icon-starball', 'sl-icon-sm')}
              <span>All 1,025</span>
            </button>
            <button type="button" class="sl-btn" data-testid="pokedex-filters-toggle" aria-expanded="false">
              ${createIconSvg('icon-compass', 'sl-icon-sm')}
              <span>Filters</span>
            </button>
          </div>

          <!-- Tactile Elemental Type Filter Ribbon (Zero raw <select> boxes!) -->
          <div class="sl-dex-type-ribbon" role="group" aria-label="Filter by Elemental Type">
            ${typeChipsHtml}
          </div>

          <!-- Collapsible RPG Filter Tray (Generations, Biomes & Abilities) -->
          <div class="sl-dex-advanced-tray" data-testid="pokedex-advanced-tray" hidden>
            <div class="sl-dex-tray-group">
              <div class="sl-dex-tray-label">Generation</div>
              <div class="sl-dex-chip-wrap">${genChipsHtml}</div>
            </div>
            <div class="sl-dex-tray-group">
              <div class="sl-dex-tray-label">Island Biome Habitat</div>
              <div class="sl-dex-chip-wrap">${biomeChipsHtml}</div>
            </div>
            <div class="sl-dex-tray-group">
              <div class="sl-dex-tray-label">Signature Ability</div>
              <div class="sl-dex-chip-wrap">${abilityChipsHtml}</div>
            </div>
          </div>

          <div class="sl-dex-summary-bar sl-num">
            <span data-testid="pokedex-counts">0 Caught • 0 Seen / ${TOTAL_SPECIES_COUNT}</span>
            <span data-testid="pokedex-page-info">Page 1 / 1</span>
          </div>

          <!-- Visual Collectible Pokédex Sprite Card Grid -->
          <div class="sl-dex-grid" data-testid="pokedex-list" role="listbox" aria-label="Species Catalog"></div>

          <div class="sl-dex-pagination">
            <button type="button" class="sl-btn" data-testid="pokedex-prev-page">Prev Page</button>
            <button type="button" class="sl-btn" data-testid="pokedex-next-page">Next Page</button>
          </div>
        </div>

        <div class="sl-dex-detail">
          <div
            class="sl-holo-card"
            data-testid="pokedex-holo-card"
            data-type="electric"
            data-star-rank="0"
            data-max-bond="false"
          >
            <div class="sl-holo-foil" aria-hidden="true"></div>
            <div class="sl-holo-glare" aria-hidden="true"></div>

            <div class="sl-holo-header">
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="sl-pill sl-pill-gold sl-num" data-testid="pokedex-card-number">#0025</span>
                <strong style="font-family:var(--sl-font-display); font-size:21px; color:var(--sl-brass-bright); text-shadow:0 2px 0 #060813;" data-testid="pokedex-card-name">Pikachu</strong>
              </div>
              <div data-testid="pokedex-card-types" style="display:flex; gap:6px;"></div>
            </div>

            <div class="sl-holo-portrait-wrap">
              <canvas class="sl-holo-portrait" width="144" height="136" data-testid="pokedex-portrait-canvas" aria-label="Selected Pokémon Sprite"></canvas>
              <div class="sl-stat-list sl-num">
                <div class="sl-stat-row">
                  <span>HP</span>
                  <div class="sl-bar-track sl-bar-track-sm"><div class="sl-bar-fill sl-bar-stat-hp" data-stat-bar="hp" style="--fill:0.5;"></div></div>
                  <span data-stat-val="hp">0</span>
                </div>
                <div class="sl-stat-row">
                  <span>ATK</span>
                  <div class="sl-bar-track sl-bar-track-sm"><div class="sl-bar-fill sl-bar-stat-atk" data-stat-bar="atk" style="--fill:0.5;"></div></div>
                  <span data-stat-val="atk">0</span>
                </div>
                <div class="sl-stat-row">
                  <span>DEF</span>
                  <div class="sl-bar-track sl-bar-track-sm"><div class="sl-bar-fill sl-bar-stat-def" data-stat-bar="def" style="--fill:0.5;"></div></div>
                  <span data-stat-val="def">0</span>
                </div>
                <div class="sl-stat-row">
                  <span>SPD</span>
                  <div class="sl-bar-track sl-bar-track-sm"><div class="sl-bar-fill sl-bar-stat-spd" data-stat-bar="spd" style="--fill:0.5;"></div></div>
                  <span data-stat-val="spd">0</span>
                </div>
                <div class="sl-stat-total-row">
                  <span>BASE POWER</span>
                  <span data-testid="pokedex-card-bst">0</span>
                </div>
              </div>
            </div>

            <div class="sl-dex-meta-pills">
              <span class="sl-pill sl-pill-emerald" data-testid="pokedex-card-status">Wild Catalog</span>
              <span class="sl-pill" data-testid="pokedex-card-habitat">Gen 1</span>
              <span class="sl-pill sl-pill-cyan" data-testid="pokedex-card-ability">Ability</span>
            </div>

            <div class="sl-dex-meta-pills" data-testid="pokedex-card-moves"></div>

            <div class="sl-dex-evo-chain" data-testid="pokedex-card-evo"></div>

            <div class="sl-dex-lore-box">
              <p class="sl-dex-lore" data-testid="pokedex-card-lore"></p>
            </div>

            <div class="sl-cry-row">
              <canvas class="sl-cry-canvas" width="240" height="44" data-testid="pokedex-cry-canvas" aria-label="Pokémon Cry Waveform"></canvas>
              <button type="button" class="sl-btn sl-btn-cyan" data-testid="pokedex-play-cry">
                ${createIconSvg('icon-audio-on', 'sl-icon-sm')}
                <span>Play Cry</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.searchInput = container.querySelector('[data-testid="pokedex-search"]');
    this.caughtToggleBtn = container.querySelector('[data-testid="pokedex-caught-toggle"]');
    this.filtersToggleBtn = container.querySelector('[data-testid="pokedex-filters-toggle"]');
    this.advancedTrayEl = container.querySelector('[data-testid="pokedex-advanced-tray"]');
    this.countBadgeEl = container.querySelector('[data-testid="pokedex-counts"]');
    this.listEl = container.querySelector('[data-testid="pokedex-list"]');
    this.pageInfoEl = container.querySelector('[data-testid="pokedex-page-info"]');
    this.prevPageBtn = container.querySelector('[data-testid="pokedex-prev-page"]');
    this.nextPageBtn = container.querySelector('[data-testid="pokedex-next-page"]');

    this.holoCardEl = container.querySelector('[data-testid="pokedex-holo-card"]');
    this.cardNumberEl = container.querySelector('[data-testid="pokedex-card-number"]');
    this.cardNameEl = container.querySelector('[data-testid="pokedex-card-name"]');
    this.cardTypesEl = container.querySelector('[data-testid="pokedex-card-types"]');
    this.portraitCanvas = container.querySelector('[data-testid="pokedex-portrait-canvas"]');
    this.cryCanvas = container.querySelector('[data-testid="pokedex-cry-canvas"]');
    this.playCryBtn = container.querySelector('[data-testid="pokedex-play-cry"]');
    this.cardAbilityEl = container.querySelector('[data-testid="pokedex-card-ability"]');
    this.cardMovesEl = container.querySelector('[data-testid="pokedex-card-moves"]');
    this.cardEvoEl = container.querySelector('[data-testid="pokedex-card-evo"]');
    this.cardLoreEl = container.querySelector('[data-testid="pokedex-card-lore"]');
    this.cardHabitatEl = container.querySelector('[data-testid="pokedex-card-habitat"]');
    this.cardStatusEl = container.querySelector('[data-testid="pokedex-card-status"]');
    this.cardBstEl = container.querySelector('[data-testid="pokedex-card-bst"]');

    for (const key of ['hp', 'atk', 'def', 'spd']) {
      const bar = container.querySelector(`[data-stat-bar="${key}"]`) as HTMLElement | null;
      const val = container.querySelector(`[data-stat-val="${key}"]`) as HTMLElement | null;
      if (bar && val) this.statRows.push({ bar, val });
    }

    this.searchInput?.addEventListener('input', () => {
      this.searchQuery = this.searchInput?.value ?? '';
      this.currentPage = 1;
      this.lastListKey = '';
      this.refreshListOnly();
      this.paintVisibleTileSprites(0);
    });

    this.caughtToggleBtn?.addEventListener('click', () => {
      this.ownershipMode =
        this.ownershipMode === 'all' ? 'caught' : this.ownershipMode === 'caught' ? 'missing' : 'all';
      this.currentPage = 1;
      this.lastListKey = '';
      this.refreshListOnly();
      this.paintVisibleTileSprites(0);
    });

    this.filtersToggleBtn?.addEventListener('click', () => {
      this.advancedOpen = !this.advancedOpen;
      if (this.advancedTrayEl) this.advancedTrayEl.hidden = !this.advancedOpen;
      this.filtersToggleBtn?.setAttribute('aria-expanded', String(this.advancedOpen));
      this.filtersToggleBtn?.classList.toggle('is-active', this.advancedOpen || this.countActiveSubfilters() > 0);
    });

    container.addEventListener('click', (evt) => {
      const target = evt.target as HTMLElement | null;

      const typeBtn = target?.closest('[data-dex-type]') as HTMLButtonElement | null;
      if (typeBtn) {
        this.typeFilter = (typeBtn.getAttribute('data-dex-type') as ElementalType | 'all') || 'all';
        this.currentPage = 1;
        this.lastListKey = '';
        this.syncFilterChipStates();
        this.refreshListOnly();
        this.paintVisibleTileSprites(0);
        return;
      }

      const genBtn = target?.closest('[data-dex-gen]') as HTMLButtonElement | null;
      if (genBtn) {
        const raw = genBtn.getAttribute('data-dex-gen') ?? 'all';
        this.genFilter = raw === 'all' ? 'all' : Number(raw);
        this.currentPage = 1;
        this.lastListKey = '';
        this.syncFilterChipStates();
        this.refreshListOnly();
        this.paintVisibleTileSprites(0);
        return;
      }

      const biomeBtn = target?.closest('[data-dex-biome]') as HTMLButtonElement | null;
      if (biomeBtn) {
        this.biomeFilter = (biomeBtn.getAttribute('data-dex-biome') as BiomeId | 'all') || 'all';
        this.currentPage = 1;
        this.lastListKey = '';
        this.syncFilterChipStates();
        this.refreshListOnly();
        this.paintVisibleTileSprites(0);
        return;
      }

      const abBtn = target?.closest('[data-dex-ability]') as HTMLButtonElement | null;
      if (abBtn) {
        this.abilityFilter = abBtn.getAttribute('data-dex-ability') || 'all';
        this.currentPage = 1;
        this.lastListKey = '';
        this.syncFilterChipStates();
        this.refreshListOnly();
        this.paintVisibleTileSprites(0);
      }
    });

    this.prevPageBtn?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage -= 1;
        this.lastListKey = '';
        this.refreshListOnly();
        this.paintVisibleTileSprites(0);
      }
    });

    this.nextPageBtn?.addEventListener('click', () => {
      this.currentPage += 1;
      this.lastListKey = '';
      this.refreshListOnly();
      this.paintVisibleTileSprites(0);
    });

    this.listEl?.addEventListener('click', (evt) => {
      const btn = (evt.target as HTMLElement | null)?.closest('[data-species-id]') as HTMLButtonElement | null;
      if (!btn) return;
      const id = Number(btn.getAttribute('data-species-id'));
      if (Number.isInteger(id) && id >= 1) {
        this.callbacks?.onSelectPokedexSpecies(id);
      }
    });

    this.cardEvoEl?.addEventListener('click', (evt) => {
      const btn = (evt.target as HTMLElement | null)?.closest('[data-evo-species-id]') as HTMLButtonElement | null;
      if (!btn) return;
      const id = Number(btn.getAttribute('data-evo-species-id'));
      if (Number.isInteger(id) && id >= 1) {
        this.callbacks?.onSelectPokedexSpecies(id);
      }
    });

    this.playCryBtn?.addEventListener('click', () => {
      this.callbacks?.onPlaySpeciesCry(this.lastSelectedId);
    });

    if (this.holoCardEl) {
      this.holoCardEl.addEventListener('pointermove', (evt) => {
        if (!this.holoCardEl) return;
        const rect = this.holoCardEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const nx = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = ((evt.clientY - rect.top) / rect.height) * 2 - 1;
        this.pointerTiltX = Math.max(-1, Math.min(1, nx));
        this.pointerTiltY = Math.max(-1, Math.min(1, ny));
        this.updateHoloCssVars();
      });
      this.holoCardEl.addEventListener('pointerleave', () => {
        this.pointerTiltX = 0;
        this.pointerTiltY = 0;
        this.updateHoloCssVars();
      });
    }
  }

  private countActiveSubfilters(): number {
    let n = 0;
    if (this.genFilter !== 'all') n += 1;
    if (this.biomeFilter !== 'all') n += 1;
    if (this.abilityFilter !== 'all') n += 1;
    return n;
  }

  private syncFilterChipStates(): void {
    if (!this.rootEl) return;
    this.rootEl.querySelectorAll('[data-dex-type]').forEach((el) => {
      const on = el.getAttribute('data-dex-type') === this.typeFilter;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', String(on));
    });
    this.rootEl.querySelectorAll('[data-dex-gen]').forEach((el) => {
      const on = el.getAttribute('data-dex-gen') === String(this.genFilter);
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', String(on));
    });
    this.rootEl.querySelectorAll('[data-dex-biome]').forEach((el) => {
      const on = el.getAttribute('data-dex-biome') === this.biomeFilter;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', String(on));
    });
    this.rootEl.querySelectorAll('[data-dex-ability]').forEach((el) => {
      const on = el.getAttribute('data-dex-ability') === this.abilityFilter;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', String(on));
    });

    const subCount = this.countActiveSubfilters();
    if (this.filtersToggleBtn) {
      this.filtersToggleBtn.classList.toggle('is-active', this.advancedOpen || subCount > 0);
      const span = this.filtersToggleBtn.querySelector('span');
      if (span) span.textContent = subCount > 0 ? `Filters (${subCount})` : 'Filters';
    }
  }

  sync(
    profile: DojoProfileState,
    selectedSpeciesId: number,
    cryWaveform: CryWaveformSnapshot,
    reducedMotion: boolean,
    active: boolean,
    timeSec: number,
    assets?: PokedexAssets,
  ): void {
    this.currentProfile = profile;
    this.lastSelectedId = Math.max(1, Math.min(TOTAL_SPECIES_COUNT, Math.round(selectedSpeciesId || 1)));
    this.currentWaveform = cryWaveform;
    this.reducedMotion = reducedMotion;
    this.lastAssets = assets;
    if (!active) return;

    this.refreshListOnly();
    this.refreshDetailOnly();
    this.renderCanvases(timeSec, assets);

    const tileStamp = `${this.lastListKey}|${assets?.spriteCacheVersion ?? 0}|${Math.floor(timeSec * 6)}`;
    if (tileStamp !== this.lastTilePaintStamp) {
      this.lastTilePaintStamp = tileStamp;
      this.paintVisibleTileSprites(timeSec);
    }
  }

  private getOwnedSummary(speciesId: number): {
    caught: boolean;
    seen: boolean;
    caughtCount: number;
    starRank: number;
    bond: number;
    shiny: boolean;
  } {
    const p = this.currentProfile;
    if (!p) {
      return { caught: false, seen: false, caughtCount: 0, starRank: 0, bond: 0, shiny: false };
    }
    const caughtCount = Number(p.pokedex.caught[speciesId] ?? 0);
    const caught = caughtCount > 0;
    const seen = caught || p.pokedex.seen.includes(speciesId);
    let starRank = 0;
    let bond = 0;
    let shiny = false;
    for (const m of [...p.team, ...p.box]) {
      if (m.speciesId === speciesId) {
        starRank = Math.max(starRank, m.upgradeTier ?? 0);
        bond = Math.max(bond, m.bond ?? 0);
        if (m.isShiny) shiny = true;
      }
    }
    return { caught, seen, caughtCount, starRank, bond, shiny };
  }

  private refreshListOnly(): void {
    if (!this.currentProfile || !this.listEl) return;

    const result = filterAndPaginatePokedex({
      query: this.searchQuery,
      typeFilter: this.typeFilter,
      abilityFilter: this.abilityFilter,
      genFilter: this.genFilter,
      biomeFilter: this.biomeFilter,
      caughtOnly: this.ownershipMode === 'caught',
      needToCatchOnly: this.ownershipMode === 'missing',
      page: this.currentPage,
      pageSize: this.pageSize,
      pokedex: this.currentProfile.pokedex,
    });
    this.currentPage = result.page;

    const memo = [
      this.searchQuery,
      this.typeFilter,
      this.abilityFilter,
      this.genFilter,
      this.biomeFilter,
      this.ownershipMode,
      result.page,
      result.totalMatches,
      result.caughtCount,
      result.seenCount,
      this.lastSelectedId,
    ].join('|');

    if (memo === this.lastListKey) return;
    this.lastListKey = memo;
    this.lastTilePaintStamp = '';

    if (this.countBadgeEl) {
      this.countBadgeEl.textContent = `${result.caughtCount} Caught • ${result.seenCount} Seen / ${TOTAL_SPECIES_COUNT}`;
    }

    if (this.caughtToggleBtn) {
      this.caughtToggleBtn.setAttribute('aria-pressed', String(this.ownershipMode !== 'all'));
      this.caughtToggleBtn.classList.toggle('is-active', this.ownershipMode !== 'all');
      const labelSpan = this.caughtToggleBtn.querySelector('span');
      if (labelSpan) {
        labelSpan.textContent =
          this.ownershipMode === 'caught'
            ? `Caught (${result.caughtCount})`
            : this.ownershipMode === 'missing'
              ? `Need (${TOTAL_SPECIES_COUNT - result.caughtCount})`
              : `All ${TOTAL_SPECIES_COUNT}`;
      }
    }

    if (this.pageInfoEl) {
      this.pageInfoEl.textContent = `Page ${result.page}/${result.totalPages} (${result.totalMatches})`;
    }
    if (this.prevPageBtn) this.prevPageBtn.disabled = result.page <= 1;
    if (this.nextPageBtn) this.nextPageBtn.disabled = result.page >= result.totalPages;

    if (result.items.length === 0) {
      this.listEl.innerHTML = `<div class="sl-empty-state" style="grid-column:1 / -1;">No matching species in 1,025 catalog.</div>`;
      return;
    }

    const seenSet = new Set(this.currentProfile.pokedex.seen);
    const caughtMap = this.currentProfile.pokedex.caught;

    this.listEl.innerHTML = result.items
      .map((sp) => {
        const caught = Number(caughtMap[sp.id] ?? 0) > 0;
        const seen = caught || seenSet.has(sp.id);
        const selected = sp.id === this.lastSelectedId;
        const biomeName = getBiomeVisualProfile(sp.biome).displayName;
        const statusIcon = caught
          ? createIconSvg('icon-starball', 'sl-icon-sm')
          : seen
            ? createIconSvg('icon-pokeball', 'sl-icon-sm')
            : '';
        const visualSlot = seen
          ? `<canvas class="sl-dex-tile-canvas" width="54" height="50" data-tile-species="${sp.id}" aria-hidden="true"></canvas>`
          : `<div class="sl-dex-tile-mystery" aria-hidden="true">?</div>`;

        return `
          <button
            type="button"
            class="sl-dex-tile ${selected ? 'is-selected' : ''}"
            data-species-id="${sp.id}"
            data-caught="${caught}"
            data-seen="${seen}"
            data-testid="pokedex-row-${sp.id}"
            role="option"
            aria-selected="${selected}"
          >
            <div class="sl-dex-tile-top sl-num">
              <span>${formatDexNum(sp.id)}</span>
              <span>${statusIcon}</span>
            </div>
            ${visualSlot}
            <div class="sl-dex-tile-name">${safeText(seen ? sp.name : '???')}</div>
            <div class="sl-dex-tile-sub">${safeText(seen ? capitalize(sp.type) : biomeName)}</div>
          </button>
        `;
      })
      .join('');
  }

  private paintVisibleTileSprites(timeSec: number): void {
    if (!this.listEl) return;
    const assets = this.lastAssets;
    this.listEl.querySelectorAll('canvas[data-tile-species]').forEach((node) => {
      const canvas = node as HTMLCanvasElement;
      const id = Number(canvas.getAttribute('data-tile-species'));
      if (!Number.isInteger(id) || id < 1) return;
      const frames = assets?.getFrames?.(id) ?? (id === this.lastSelectedId ? assets?.frames ?? null : null);
      renderPokemonPreviewCanvas(
        canvas,
        id,
        frames,
        assets?.fallbacksSheet ?? null,
        assets?.manifest ?? null,
        false,
        timeSec,
        false,
      );
    });
  }

  private refreshDetailOnly(): void {
    if (!this.currentProfile) return;
    const sp = getSpeciesEntry(this.lastSelectedId);
    const owned = this.getOwnedSummary(sp.id);

    const detailKey = `${sp.id}|${owned.caught}|${owned.seen}|${owned.starRank}|${owned.bond}|${owned.shiny}|${this.reducedMotion}`;
    this.updateHoloCssVars();
    if (detailKey === this.lastDetailKey) return;
    this.lastDetailKey = detailKey;

    if (this.holoCardEl) {
      this.holoCardEl.setAttribute('data-type', sp.type);
      this.holoCardEl.setAttribute('data-star-rank', String(owned.starRank));
      this.holoCardEl.setAttribute('data-max-bond', String(owned.bond >= 100));
    }
    if (this.cardNumberEl) this.cardNumberEl.textContent = formatDexNum(sp.id);
    if (this.cardNameEl) this.cardNameEl.textContent = sp.name;

    if (this.cardTypesEl) {
      this.cardTypesEl.innerHTML = `
        <span class="sl-pill sl-type-pill" data-type="${sp.type}">
          ${createIconSvg(typeToIconId(sp.type), 'sl-icon-sm')}
          <span>${capitalize(sp.type)}</span>
        </span>
      `;
    }

    const stats = [sp.baseStats.hp, sp.baseStats.atk, sp.baseStats.def, sp.baseStats.spd];
    const biome = getBiomeVisualProfile(sp.biome);
    let total = 0;
    stats.forEach((v, idx) => {
      total += v;
      const row = this.statRows[idx];
      if (!row) return;
      row.bar.style.setProperty('--fill', owned.seen ? String(Math.min(1, v / 160)) : '0.08');
      row.val.textContent = owned.seen ? String(v) : '??';
    });
    if (this.cardBstEl) {
      this.cardBstEl.textContent = owned.seen ? String(total) : '???';
    }

    if (this.cardStatusEl) {
      const statusParts = [
        owned.caught ? `Caught (${owned.caughtCount})` : owned.seen ? 'Seen' : 'Unmet • Silhouette',
      ];
      if (owned.shiny) statusParts.push('Shiny');
      if (owned.starRank > 0) statusParts.push(`${owned.starRank}-Star`);
      this.cardStatusEl.textContent = statusParts.join(' • ');
      this.cardStatusEl.className = owned.caught ? 'sl-pill sl-pill-emerald' : 'sl-pill';
    }

    if (this.cardHabitatEl) {
      const catchPct = Math.round(sp.catchFactor * 100);
      this.cardHabitatEl.textContent = owned.seen
        ? `Gen ${sp.generation} • ${biome.displayName} • Catch ${catchPct}%`
        : `Gen ${sp.generation} • Habitat: ${biome.displayName}`;
    }

    if (this.cardAbilityEl) {
      const ab = getAbilityEntry(sp.ability);
      this.cardAbilityEl.textContent = owned.seen
        ? ab
          ? `Ability: ${ab.name}`
          : 'Ability: Starlight Spirit'
        : 'Ability: ??? (Meet to record)';
      this.cardAbilityEl.setAttribute('title', owned.seen ? ab?.description ?? '' : 'Encounter this species to discover its ability.');
    }

    if (this.cardMovesEl) {
      if (!owned.seen) {
        this.cardMovesEl.innerHTML = `<span class="sl-pill">Moves: ??? (Encounter in ${safeText(biome.displayName)})</span>`;
      } else {
        const moveIds = Array.isArray(sp.movePool) ? sp.movePool.slice(0, 4) : [];
        this.cardMovesEl.innerHTML = moveIds
          .map((mid) => {
            const mv = getMoveEntry(mid);
            return `<span class="sl-pill">${createIconSvg(typeToIconId(mv.type), 'sl-icon-sm')} ${safeText(mv.name)}</span>`;
          })
          .join('');
      }
    }

    if (this.cardEvoEl) {
      const pre = PRE_EVO_MAP.get(sp.id) ?? [];
      const nextRules = getEvolutionRules(sp.id);
      const itemMap = new Map(getAllEvolutionItems().map((it) => [it.id, it.name]));

      const parts: string[] = [];
      for (const p of pre) {
        const preSp = getSpeciesEntry(p.fromId);
        parts.push(`
          <button type="button" class="sl-btn" data-evo-species-id="${preSp.id}">
            <span>From ${safeText(preSp.name)} (${safeText(p.label)})</span>
          </button>
        `);
      }
      for (const r of nextRules) {
        const nextSp = getSpeciesEntry(r.to);
        const req = r.item
          ? (itemMap.get(r.item) ?? r.item)
          : r.minLevel
            ? `Lv.${r.minLevel}`
            : 'Evolve';
        parts.push(`
          <button type="button" class="sl-btn sl-btn-cyan" data-evo-species-id="${nextSp.id}">
            ${createIconSvg('icon-evolve', 'sl-icon-sm')}
            <span>To ${safeText(nextSp.name)} (${safeText(req)})</span>
          </button>
        `);
      }
      this.cardEvoEl.innerHTML =
        parts.length > 0
          ? parts.join('')
          : `<span class="sl-pill">Final or Standalone Stage</span>`;
    }

    if (this.cardLoreEl) {
      const ab = getAbilityEntry(sp.ability);
      this.cardLoreEl.textContent = owned.seen
        ? ab
          ? `${sp.description} — ${ab.name}: ${ab.description}`
          : sp.description
        : `Unmet species logged in Starlight Island habitat charts. Explore ${biome.displayName} to encounter and record full stats, moves, and lore!`;
    }
  }

  private updateHoloCssVars(): void {
    if (!this.holoCardEl) return;
    const owned = this.getOwnedSummary(this.lastSelectedId);
    const metrics = computeHoloCardMetrics(
      {
        speciesId: this.lastSelectedId,
        pointerTiltX: this.pointerTiltX,
        pointerTiltY: this.pointerTiltY,
        starRank: owned.starRank,
        bondLevel: owned.bond,
        caught: owned.caught,
        shiny: owned.shiny,
      },
      this.reducedMotion,
    );
    this.holoCardEl.style.setProperty('--holo-rx', `${metrics.rxDeg}deg`);
    this.holoCardEl.style.setProperty('--holo-ry', `${metrics.ryDeg}deg`);
    this.holoCardEl.style.setProperty('--holo-px', String(metrics.pxPercent));
    this.holoCardEl.style.setProperty('--holo-py', String(metrics.pyPercent));
    this.holoCardEl.style.setProperty('--holo-intensity', String(metrics.intensity));
  }

  private renderCanvases(timeSec: number, assets?: PokedexAssets): void {
    const sp = getSpeciesEntry(this.lastSelectedId);
    const owned = this.getOwnedSummary(sp.id);

    if (this.portraitCanvas) {
      renderPokemonPreviewCanvas(
        this.portraitCanvas,
        sp.id,
        assets?.frames ?? null,
        assets?.fallbacksSheet ?? null,
        assets?.manifest ?? null,
        owned.shiny,
        timeSec,
        !owned.seen,
      );
    }

    if (this.cryCanvas && this.currentWaveform) {
      let ctx: CanvasRenderingContext2D | null = null;
      try {
        ctx = this.cryCanvas.getContext('2d', { willReadFrequently: true }) ?? this.cryCanvas.getContext('2d');
      } catch {
        ctx = null;
      }
      if (!ctx) return;
      const w = this.cryCanvas.width || 240;
      const h = this.cryCanvas.height || 44;
      const pal = TYPE_PALETTES[sp.type] ?? TYPE_PALETTES.electric;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#060a1e';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(235, 183, 77, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const samples = this.currentWaveform.samples;
      const activePlay = this.currentWaveform.playing && this.currentWaveform.speciesId === sp.id;
      ctx.strokeStyle = activePlay ? '#ffeaad' : pal.primary;
      ctx.lineWidth = 2;
      ctx.beginPath();

      if (samples && samples.length > 1) {
        const count = samples.length;
        for (let i = 0; i < count; i++) {
          const x = (i / (count - 1)) * w;
          const amp = Math.max(-1, Math.min(1, samples[i]));
          const y = h / 2 - amp * (h * 0.42);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      } else {
        const freq = 0.05 + (sp.id % 11) * 0.008;
        const phase = activePlay ? timeSec * 12 : 0;
        for (let x = 0; x <= w; x += 4) {
          const env = Math.sin((x / w) * Math.PI);
          const y = h / 2 + Math.sin(x * freq + phase) * env * (h * 0.26);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }

  dispose(): void {
    this.statRows = [];
    this.rootEl = null;
    this.callbacks = null;
    this.currentProfile = null;
    this.currentWaveform = null;
    this.lastAssets = undefined;
  }
}
