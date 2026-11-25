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
  getSpeciesEntry,
  TOTAL_SPECIES_COUNT,
  TYPE_PALETTES,
  typeToIconId,
} from '../core';
import { createIconSvg, renderPokemonPreviewCanvas, safeText } from './iconHelper';

export interface PokedexQueryOptions {
  query: string;
  typeFilter: ElementalType | 'all';
  genFilter?: number | 'all';
  biomeFilter?: BiomeId | 'all';
  caughtOnly: boolean;
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
}

export function filterAndPaginatePokedex(opts: PokedexQueryOptions): PokedexPageResult {
  const catalog = getAllSpecies();
  const rawQ = opts.query.trim().toLowerCase();
  const q = rawQ.startsWith('#') ? rawQ.slice(1).trim() : rawQ;
  const pageSize = Math.max(1, Math.floor(opts.pageSize ?? 24));
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
    if (opts.typeFilter !== 'all' && sp.type !== opts.typeFilter) continue;
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

// Build reverse evolution index once for instant evolution chain lookup
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

export class PokedexView {
  private callbacks: UIBridgeCallbacks | null = null;

  private searchQuery = '';
  private typeFilter: ElementalType | 'all' = 'all';
  private genFilter: number | 'all' = 'all';
  private biomeFilter: BiomeId | 'all' = 'all';
  private caughtOnly = false;
  private currentPage = 1;
  private readonly pageSize = 24;

  private pointerTiltX = 0;
  private pointerTiltY = 0;
  private reducedMotion = false;
  private lastSelectedId = 25;
  private currentProfile: DojoProfileState | null = null;
  private currentWaveform: CryWaveformSnapshot | null = null;

  private searchInput: HTMLInputElement | null = null;
  private genSelect: HTMLSelectElement | null = null;
  private biomeSelect: HTMLSelectElement | null = null;
  private caughtToggleBtn: HTMLButtonElement | null = null;
  private countBadgeEl: HTMLElement | null = null;
  private typeButtons = new Map<string, HTMLButtonElement>();
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
  private cardEvoEl: HTMLElement | null = null;
  private cardLoreEl: HTMLElement | null = null;
  private cardHabitatEl: HTMLElement | null = null;
  private cardStatusEl: HTMLElement | null = null;
  private statRows: Array<{ bar: HTMLElement; val: HTMLElement }> = [];

  private lastListKey = '';
  private lastDetailKey = '';

  mount(container: HTMLElement, callbacks: UIBridgeCallbacks): void {
    this.callbacks = callbacks;
    this.typeButtons.clear();
    this.statRows = [];
    this.lastListKey = '';
    this.lastDetailKey = '';

    const biomeOptionsHtml = BIOME_IDS.map((bId) => {
      const bp = getBiomeVisualProfile(bId);
      return `<option value="${bId}">${safeText(bp.displayName)}</option>`;
    }).join('');

    const genOptionsHtml = Array.from({ length: 9 }, (_, i) => i + 1)
      .map((g) => `<option value="${g}">Gen ${g}</option>`)
      .join('');

    container.innerHTML = `
      <div class="sl-pokedex-body">
        <div class="sl-dex-browser">
          <div class="sl-dex-toolbar">
            <input
              type="search"
              class="sl-input sl-dex-search"
              data-testid="pokedex-search"
              placeholder="Search #0001..#1025 or name"
              aria-label="Search Pokédex species"
            />
            <button type="button" class="sl-btn" data-testid="pokedex-caught-toggle" aria-pressed="false">
              ${createIconSvg('icon-starball', 'sl-icon-sm')}
              <span>All 1,025</span>
            </button>
          </div>

          <div class="sl-dex-subfilters">
            <select class="sl-select" data-testid="pokedex-gen-filter" aria-label="Filter by Generation">
              <option value="all">All Gens (1-9)</option>
              ${genOptionsHtml}
            </select>
            <select class="sl-select" data-testid="pokedex-biome-filter" aria-label="Filter by Biome">
              <option value="all">All 18 Biomes</option>
              ${biomeOptionsHtml}
            </select>
            <span class="sl-pill sl-num" data-testid="pokedex-counts">0 / ${TOTAL_SPECIES_COUNT}</span>
          </div>

          <div class="sl-dex-type-strip" role="group" aria-label="Filter by Elemental Type">
            <button type="button" class="sl-btn sl-chip is-active" data-testid="pokedex-type-all" data-filter-type="all" aria-pressed="true">
              All
            </button>
            ${ELEMENTAL_TYPES.map(
              (t) => `
              <button type="button" class="sl-btn sl-chip" data-testid="pokedex-type-${t}" data-filter-type="${t}" aria-pressed="false">
                ${createIconSvg(typeToIconId(t), 'sl-icon-sm')}
                <span>${capitalize(t)}</span>
              </button>
            `,
            ).join('')}
          </div>

          <div class="sl-dex-list" data-testid="pokedex-list" role="listbox" aria-label="Species Catalog"></div>

          <div class="sl-dex-pagination">
            <button type="button" class="sl-btn" data-testid="pokedex-prev-page">Prev</button>
            <span class="sl-pill sl-num" data-testid="pokedex-page-info">Page 1 / 1</span>
            <button type="button" class="sl-btn" data-testid="pokedex-next-page">Next</button>
          </div>
        </div>

        <div class="sl-dex-detail">
          <div class="sl-holo-card" data-holo-card="true" data-testid="pokedex-holo-card" data-type="electric" data-star-rank="0" data-max-bond="false">
            <div class="sl-holo-foil" aria-hidden="true"></div>
            <div class="sl-holo-glare" aria-hidden="true"></div>

            <div class="sl-holo-header">
              <div>
                <span class="sl-pill sl-num" data-testid="pokedex-card-number">#0025</span>
                <strong class="sl-profile-name" data-testid="pokedex-card-name" style="margin-left: 6px;">Pikachu</strong>
              </div>
              <div class="sl-combatant-badges" data-testid="pokedex-card-types"></div>
            </div>

            <div class="sl-holo-portrait-wrap">
              <canvas class="sl-holo-portrait" width="160" height="140" data-testid="pokedex-portrait-canvas" aria-label="Species Pixel Portrait"></canvas>
              <div class="sl-stat-list">
                ${(['HP', 'ATK', 'DEF', 'SPD'] as const)
                  .map(
                    (label, idx) => `
                  <div class="sl-stat-row">
                    <span>${label}</span>
                    <div class="sl-bar-track"><div class="sl-bar-fill sl-bar-xp" data-stat-bar="${idx}" style="--fill: 0.5;"></div></div>
                    <span class="sl-num" data-stat-val="${idx}">0</span>
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <div class="sl-dex-meta-pills">
              <span class="sl-pill" data-testid="pokedex-card-status">Catalog</span>
              <span class="sl-pill" data-testid="pokedex-card-habitat">Gen 1 • Whispering Forest</span>
              <span class="sl-pill" data-testid="pokedex-card-ability">Ability: Static</span>
            </div>

            <div class="sl-dex-evo-chain" data-testid="pokedex-evo-chain"></div>

            <p class="sl-dex-lore" data-testid="pokedex-card-lore"></p>

            <div class="sl-cry-row">
              <canvas class="sl-cry-canvas" width="240" height="44" data-testid="pokedex-cry-canvas" aria-label="Live Cry Waveform"></canvas>
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
    this.genSelect = container.querySelector('[data-testid="pokedex-gen-filter"]');
    this.biomeSelect = container.querySelector('[data-testid="pokedex-biome-filter"]');
    this.caughtToggleBtn = container.querySelector('[data-testid="pokedex-caught-toggle"]');
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
    this.cardEvoEl = container.querySelector('[data-testid="pokedex-evo-chain"]');
    this.cardLoreEl = container.querySelector('[data-testid="pokedex-card-lore"]');
    this.cardHabitatEl = container.querySelector('[data-testid="pokedex-card-habitat"]');
    this.cardStatusEl = container.querySelector('[data-testid="pokedex-card-status"]');

    for (let i = 0; i < 4; i++) {
      const bar = container.querySelector(`[data-stat-bar="${i}"]`) as HTMLElement | null;
      const val = container.querySelector(`[data-stat-val="${i}"]`) as HTMLElement | null;
      if (bar && val) this.statRows.push({ bar, val });
    }

    this.searchInput?.addEventListener('input', () => {
      this.searchQuery = this.searchInput?.value ?? '';
      this.currentPage = 1;
      this.lastListKey = '';
      this.refreshListOnly();
    });

    this.genSelect?.addEventListener('change', () => {
      const val = this.genSelect?.value ?? 'all';
      this.genFilter = val === 'all' ? 'all' : Number(val);
      this.currentPage = 1;
      this.lastListKey = '';
      this.refreshListOnly();
    });

    this.biomeSelect?.addEventListener('change', () => {
      const val = this.biomeSelect?.value ?? 'all';
      this.biomeFilter = val === 'all' ? 'all' : (val as BiomeId);
      this.currentPage = 1;
      this.lastListKey = '';
      this.refreshListOnly();
    });

    this.caughtToggleBtn?.addEventListener('click', () => {
      this.caughtOnly = !this.caughtOnly;
      this.currentPage = 1;
      this.lastListKey = '';
      this.refreshListOnly();
    });

    container.querySelectorAll('[data-filter-type]').forEach((el) => {
      const btn = el as HTMLButtonElement;
      const t = btn.getAttribute('data-filter-type') ?? 'all';
      this.typeButtons.set(t, btn);
      btn.addEventListener('click', () => {
        this.typeFilter = t as ElementalType | 'all';
        this.currentPage = 1;
        this.lastListKey = '';
        this.refreshListOnly();
      });
    });

    this.prevPageBtn?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage -= 1;
        this.lastListKey = '';
        this.refreshListOnly();
      }
    });

    this.nextPageBtn?.addEventListener('click', () => {
      this.currentPage += 1;
      this.lastListKey = '';
      this.refreshListOnly();
    });

    const selectSpeciesById = (id: number) => {
      if (!Number.isInteger(id) || id < 1 || id > TOTAL_SPECIES_COUNT) return;
      this.lastSelectedId = id;
      this.callbacks?.onSelectPokedexSpecies(id);
      this.refreshDetailOnly();
      this.lastListKey = '';
      this.refreshListOnly();
    };

    this.listEl?.addEventListener('click', (evt) => {
      const target = (evt.target as HTMLElement | null)?.closest('[data-species-id]') as HTMLElement | null;
      if (!target) return;
      selectSpeciesById(Number(target.getAttribute('data-species-id')));
    });

    this.cardEvoEl?.addEventListener('click', (evt) => {
      const target = (evt.target as HTMLElement | null)?.closest('[data-evo-species-id]') as HTMLElement | null;
      if (!target) return;
      selectSpeciesById(Number(target.getAttribute('data-evo-species-id')));
    });

    this.playCryBtn?.addEventListener('click', () => {
      this.callbacks?.onPlaySpeciesCry(this.lastSelectedId);
    });

    this.holoCardEl?.addEventListener('pointermove', (evt) => {
      if (!this.holoCardEl) return;
      const rect = this.holoCardEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((evt.clientY - rect.top) / rect.height) * 2 - 1;
      this.pointerTiltX = Math.max(-1, Math.min(1, nx));
      this.pointerTiltY = Math.max(-1, Math.min(1, ny));
      this.updateHoloCssVars();
    });

    this.holoCardEl?.addEventListener('pointerleave', () => {
      this.pointerTiltX = 0;
      this.pointerTiltY = 0;
      this.updateHoloCssVars();
    });
  }

  sync(
    profile: DojoProfileState,
    selectedId: number,
    cryWaveform: CryWaveformSnapshot,
    reducedMotion: boolean,
    active: boolean,
    timeSec: number,
    assets?: PokedexAssets,
  ): void {
    this.currentProfile = profile;
    this.lastSelectedId = Math.max(1, Math.min(TOTAL_SPECIES_COUNT, Math.floor(selectedId || 25)));
    this.currentWaveform = cryWaveform;
    this.reducedMotion = reducedMotion;

    if (!active) return;

    this.refreshListOnly();
    this.refreshDetailOnly();
    this.renderCanvases(timeSec, assets);
  }

  private getOwnedSummary(speciesId: number): {
    caught: boolean;
    seen: boolean;
    starRank: number;
    bond: number;
    shiny: boolean;
    caughtCount: number;
  } {
    const profile = this.currentProfile;
    const caughtCount = Number(profile?.pokedex?.caught?.[speciesId] ?? 0);
    const caught = caughtCount > 0;
    const seen = caught || Boolean(profile?.pokedex?.seen?.includes(speciesId));
    const owned = [...(profile?.team ?? []), ...(profile?.box ?? [])].filter((m) => m.speciesId === speciesId);
    const bestStar = owned.reduce((acc, m) => Math.max(acc, m.upgradeTier ?? 0), 0);
    const bestBond = owned.reduce((acc, m) => Math.max(acc, m.bond ?? 0), 0);
    const anyShiny = owned.some((m) => m.isShiny);
    return { caught, seen, starRank: bestStar, bond: bestBond, shiny: anyShiny, caughtCount };
  }

  private refreshListOnly(): void {
    if (!this.currentProfile || !this.listEl) return;

    const result = filterAndPaginatePokedex({
      query: this.searchQuery,
      typeFilter: this.typeFilter,
      genFilter: this.genFilter,
      biomeFilter: this.biomeFilter,
      caughtOnly: this.caughtOnly,
      page: this.currentPage,
      pageSize: this.pageSize,
      pokedex: this.currentProfile.pokedex,
    });
    this.currentPage = result.page;

    const memo = [
      this.searchQuery,
      this.typeFilter,
      this.genFilter,
      this.biomeFilter,
      this.caughtOnly ? '1' : '0',
      result.page,
      result.totalPages,
      result.totalMatches,
      result.caughtCount,
      result.seenCount,
      this.lastSelectedId,
    ].join('|');

    if (memo === this.lastListKey) return;
    this.lastListKey = memo;

    if (this.countBadgeEl) {
      this.countBadgeEl.textContent = `${result.caughtCount} Caught • ${result.seenCount} Seen / ${TOTAL_SPECIES_COUNT}`;
    }

    if (this.caughtToggleBtn) {
      this.caughtToggleBtn.setAttribute('aria-pressed', String(this.caughtOnly));
      const labelSpan = this.caughtToggleBtn.querySelector('span');
      if (labelSpan) {
        labelSpan.textContent = this.caughtOnly
          ? `Caught (${result.caughtCount})`
          : `All ${TOTAL_SPECIES_COUNT}`;
      }
    }

    for (const [t, btn] of this.typeButtons) {
      const active = t === this.typeFilter;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }

    if (this.pageInfoEl) {
      this.pageInfoEl.textContent = `Page ${result.page} / ${result.totalPages} (${result.totalMatches})`;
    }
    if (this.prevPageBtn) this.prevPageBtn.disabled = result.page <= 1;
    if (this.nextPageBtn) this.nextPageBtn.disabled = result.page >= result.totalPages;

    if (result.items.length === 0) {
      this.listEl.innerHTML = `<div class="sl-pill" style="justify-content:center; padding:16px;">No matching species in 1,025 catalog.</div>`;
      return;
    }

    const seenSet = new Set(this.currentProfile.pokedex.seen);
    const caughtMap = this.currentProfile.pokedex.caught;

    this.listEl.innerHTML = result.items
      .map((sp) => {
        const caught = Number(caughtMap[sp.id] ?? 0) > 0;
        const seen = caught || seenSet.has(sp.id);
        const selected = sp.id === this.lastSelectedId;
        const statusIcon = caught
          ? createIconSvg('icon-starball', 'sl-icon-sm')
          : seen
            ? createIconSvg('icon-pokeball', 'sl-icon-sm')
            : '';
        return `
          <button
            type="button"
            class="sl-dex-row ${selected ? 'is-selected' : ''}"
            data-species-id="${sp.id}"
            data-testid="pokedex-row-${sp.id}"
            role="option"
            aria-selected="${selected}"
          >
            <span class="sl-num">${formatDexNum(sp.id)}</span>
            <span class="sl-dex-row-name"><strong>${safeText(sp.name)}</strong></span>
            <span>${createIconSvg(typeToIconId(sp.type), 'sl-icon-sm')}</span>
            <span>${statusIcon}</span>
          </button>
        `;
      })
      .join('');
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
    stats.forEach((v, idx) => {
      const row = this.statRows[idx];
      if (!row) return;
      row.bar.style.setProperty('--fill', String(Math.min(1, v / 160)));
      row.val.textContent = String(v);
    });

    if (this.cardStatusEl) {
      const statusParts = [
        owned.caught ? `Caught (${owned.caughtCount})` : owned.seen ? 'Seen' : 'Catalog',
      ];
      if (owned.shiny) statusParts.push('Shiny');
      if (owned.starRank > 0) statusParts.push(`${owned.starRank}-Star`);
      this.cardStatusEl.textContent = statusParts.join(' • ');
    }

    if (this.cardHabitatEl) {
      const biome = getBiomeVisualProfile(sp.biome);
      const catchPct = Math.round(sp.catchFactor * 100);
      this.cardHabitatEl.textContent = `Gen ${sp.generation} • ${biome.displayName} • Catch ${catchPct}%`;
    }

    if (this.cardAbilityEl) {
      const ab = getAbilityEntry(sp.ability);
      this.cardAbilityEl.textContent = ab ? `Ability: ${ab.name}` : 'Ability: Starlight Spirit';
      this.cardAbilityEl.setAttribute('title', ab?.description ?? '');
    }

    if (this.cardEvoEl) {
      const pre = PRE_EVO_MAP.get(sp.id) ?? [];
      const nextRules = getEvolutionRules(sp.id);
      const itemMap = new Map(getAllEvolutionItems().map((it) => [it.id, it.name]));

      const parts: string[] = [];
      for (const p of pre) {
        const preSp = getSpeciesEntry(p.fromId);
        parts.push(`
          <button type="button" class="sl-btn sl-chip" data-evo-species-id="${preSp.id}">
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
          <button type="button" class="sl-btn sl-chip sl-btn-cyan" data-evo-species-id="${nextSp.id}">
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
      this.cardLoreEl.textContent = ab ? `${sp.description} (${ab.name}: ${ab.description})` : sp.description;
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
      );
    }

    if (this.cryCanvas && this.currentWaveform) {
      let ctx: CanvasRenderingContext2D | null = null;
      try {
        ctx = this.cryCanvas.getContext('2d');
      } catch {
        ctx = null;
      }
      if (ctx) {
        const w = this.cryCanvas.width || 240;
        const h = this.cryCanvas.height || 44;
        const midY = h * 0.5;
        const pal = TYPE_PALETTES[sp.type];
        const samples = this.currentWaveform.samples;

        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(124, 232, 255, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(w, midY);
        ctx.stroke();

        if (samples && samples.length > 1) {
          ctx.save();
          ctx.strokeStyle = this.currentWaveform.playing ? pal.glow : pal.primary;
          ctx.lineWidth = this.currentWaveform.playing ? 2.4 : 1.8;
          ctx.beginPath();
          for (let i = 0; i < samples.length; i++) {
            const x = (i / (samples.length - 1)) * w;
            const y = midY - samples[i] * (h * 0.42);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  dispose(): void {
    this.typeButtons.clear();
    this.statRows = [];
    this.searchInput = null;
    this.genSelect = null;
    this.biomeSelect = null;
    this.caughtToggleBtn = null;
    this.countBadgeEl = null;
    this.listEl = null;
    this.pageInfoEl = null;
    this.prevPageBtn = null;
    this.nextPageBtn = null;
    this.holoCardEl = null;
    this.portraitCanvas = null;
    this.cryCanvas = null;
    this.callbacks = null;
  }
}
