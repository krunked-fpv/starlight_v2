import {
  ELEMENTAL_TYPES,
  type CryWaveformSnapshot,
  type ElementalType,
  type HolographicCardState,
  type IOfflineSpriteRigSynthesizer,
  type PokedexEntryState,
  type SpeciesRecord,
  type TrainerProfile,
  type UIBridgeCallbacks,
} from '../contracts';
import {
  BIOME_DESCRIPTORS,
  getAllSpecies,
  getSpecies,
  TOTAL_SPECIES_COUNT,
  TYPE_PALETTES,
} from '../core';
import { iconSvg, safeText, typeIconId } from './iconHelper';
import { drawSpeciesPortrait } from './StyleStudioStage';

export interface PokedexQueryOptions {
  query: string;
  typeFilter: ElementalType | 'all';
  caughtOnly: boolean;
  page: number;
  pageSize?: number;
  pokedex: Record<number, PokedexEntryState>;
}

export interface PokedexPageResult {
  items: SpeciesRecord[];
  totalMatches: number;
  caughtCount: number;
  seenCount: number;
  page: number;
  totalPages: number;
}

export function filterAndPaginatePokedex(opts: PokedexQueryOptions): PokedexPageResult {
  const catalog = getAllSpecies();
  const rawQ = opts.query.trim().toLowerCase();
  const q = rawQ.startsWith('#') ? rawQ.slice(1).trim() : rawQ;
  const pageSize = Math.max(1, Math.floor(opts.pageSize ?? 24));

  let caughtCount = 0;
  let seenCount = 0;
  const matches: SpeciesRecord[] = [];

  for (let i = 0; i < catalog.length; i++) {
    const sp = catalog[i];
    const entry = opts.pokedex[sp.id];
    const isCaught = Boolean(entry?.caught);
    const isSeen = Boolean(entry?.seen || isCaught);
    if (isCaught) caughtCount += 1;
    if (isSeen) seenCount += 1;

    if (opts.caughtOnly && !isCaught) continue;
    if (opts.typeFilter !== 'all' && sp.primaryType !== opts.typeFilter && sp.secondaryType !== opts.typeFilter) {
      continue;
    }
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
  state: HolographicCardState,
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

function formatDexNum(id: number): string {
  return `#${String(id).padStart(4, '0')}`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export class PokedexView {
  private callbacks: UIBridgeCallbacks | null = null;
  private rigSynthesizer: IOfflineSpriteRigSynthesizer | null = null;

  private searchQuery = '';
  private typeFilter: ElementalType | 'all' = 'all';
  private caughtOnly = false;
  private currentPage = 1;
  private readonly pageSize = 24;

  private pointerTiltX = 0;
  private pointerTiltY = 0;
  private reducedMotion = false;
  private lastSelectedId = 25;
  private currentProfile: TrainerProfile | null = null;
  private currentWaveform: CryWaveformSnapshot | null = null;

  // Persistent DOM references (never tear down focused search input)
  private searchInput: HTMLInputElement | null = null;
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
  private starPipsEl: HTMLElement | null = null;
  private bondValEl: HTMLElement | null = null;
  private bondBarEl: HTMLElement | null = null;
  private cardLoreEl: HTMLElement | null = null;
  private cardHabitatEl: HTMLElement | null = null;
  private cardStatusEl: HTMLElement | null = null;
  private statRows: Array<{ bar: HTMLElement; val: HTMLElement }> = [];

  private lastListKey = '';
  private lastDetailKey = '';

  setRigSynthesizer(synth: IOfflineSpriteRigSynthesizer | null): void {
    this.rigSynthesizer = synth;
  }

  mount(container: HTMLElement, callbacks: UIBridgeCallbacks): void {
    this.callbacks = callbacks;
    this.typeButtons.clear();
    this.statRows = [];

    container.innerHTML = `
      <div class="sl-modal-panel sl-glass" role="dialog" aria-modal="true" aria-label="Starlight 1,025 Collector Pokédex">
        <div class="sl-modal-header">
          <h2 class="sl-modal-title">
            ${iconSvg('icon-pokedex', 'sl-icon-md')}
            <span>Collector Pokédex</span>
            <span class="sl-pill sl-num" data-testid="pokedex-counts">0 / ${TOTAL_SPECIES_COUNT}</span>
          </h2>
          <button type="button" class="sl-btn" data-testid="pokedex-close">Return to Island</button>
        </div>
        <div class="sl-pokedex-body">
          <div class="sl-dex-browser">
            <div class="sl-dex-toolbar">
              <input
                type="search"
                class="sl-input sl-dex-search"
                data-testid="pokedex-search"
                placeholder="Search #0001..#1025 or species name"
                aria-label="Search Pokédex species"
              />
              <button type="button" class="sl-btn" data-testid="pokedex-caught-toggle" aria-pressed="false">
                ${iconSvg('icon-starball', 'sl-icon-sm')}
                <span>All 1,025</span>
              </button>
            </div>
            <div class="sl-dex-type-strip" role="group" aria-label="Filter by Elemental Type">
              <button type="button" class="sl-btn sl-chip is-active" data-testid="pokedex-type-all" data-filter-type="all" aria-pressed="true">
                All
              </button>
              ${ELEMENTAL_TYPES.map(
                (t) => `
                <button type="button" class="sl-btn sl-chip" data-testid="pokedex-type-${t}" data-filter-type="${t}" aria-pressed="false">
                  ${iconSvg(typeIconId(t), 'sl-icon-sm')}
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
            <div class="sl-holo-card" data-testid="pokedex-holo-card" data-type="electric" data-star-rank="5" data-max-bond="false">
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
                <canvas class="sl-holo-portrait" width="184" height="156" data-testid="pokedex-portrait-canvas" aria-label="Species Portrait"></canvas>
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
                  <div class="sl-stat-row" style="margin-top: 4px;">
                    <span>${iconSvg('icon-bond', 'sl-icon-sm')}</span>
                    <div class="sl-bar-track"><div class="sl-bar-fill sl-bar-bond" data-testid="pokedex-bond-bar" style="--fill: 0;"></div></div>
                    <span class="sl-num" data-testid="pokedex-bond-val">0</span>
                  </div>
                </div>
              </div>
              <div style="position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                <div class="sl-star-pips" data-testid="pokedex-star-pips" aria-label="Star Rank"></div>
                <span class="sl-pill" data-testid="pokedex-card-status">Registered</span>
                <span class="sl-pill" data-testid="pokedex-card-habitat">Starlight Village</span>
              </div>
              <p data-testid="pokedex-card-lore" style="position: relative; z-index: 1; margin: 0; font-size: 12px; color: var(--sl-text-secondary); min-height: 34px;"></p>
              <div class="sl-cry-row">
                <canvas class="sl-cry-canvas" width="260" height="48" data-testid="pokedex-cry-canvas" aria-label="Procedural Cry Waveform"></canvas>
                <button type="button" class="sl-btn sl-btn-cyan" data-testid="pokedex-play-cry">
                  ${iconSvg('icon-audio-on', 'sl-icon-sm')}
                  <span>Play Cry</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.searchInput = container.querySelector('[data-testid="pokedex-search"]') as HTMLInputElement | null;
    this.caughtToggleBtn = container.querySelector('[data-testid="pokedex-caught-toggle"]') as HTMLButtonElement | null;
    this.countBadgeEl = container.querySelector('[data-testid="pokedex-counts"]') as HTMLElement | null;
    this.listEl = container.querySelector('[data-testid="pokedex-list"]') as HTMLElement | null;
    this.pageInfoEl = container.querySelector('[data-testid="pokedex-page-info"]') as HTMLElement | null;
    this.prevPageBtn = container.querySelector('[data-testid="pokedex-prev-page"]') as HTMLButtonElement | null;
    this.nextPageBtn = container.querySelector('[data-testid="pokedex-next-page"]') as HTMLButtonElement | null;

    this.holoCardEl = container.querySelector('[data-testid="pokedex-holo-card"]') as HTMLElement | null;
    this.cardNumberEl = container.querySelector('[data-testid="pokedex-card-number"]') as HTMLElement | null;
    this.cardNameEl = container.querySelector('[data-testid="pokedex-card-name"]') as HTMLElement | null;
    this.cardTypesEl = container.querySelector('[data-testid="pokedex-card-types"]') as HTMLElement | null;
    this.portraitCanvas = container.querySelector('[data-testid="pokedex-portrait-canvas"]') as HTMLCanvasElement | null;
    this.cryCanvas = container.querySelector('[data-testid="pokedex-cry-canvas"]') as HTMLCanvasElement | null;
    this.playCryBtn = container.querySelector('[data-testid="pokedex-play-cry"]') as HTMLButtonElement | null;
    this.starPipsEl = container.querySelector('[data-testid="pokedex-star-pips"]') as HTMLElement | null;
    this.bondValEl = container.querySelector('[data-testid="pokedex-bond-val"]') as HTMLElement | null;
    this.bondBarEl = container.querySelector('[data-testid="pokedex-bond-bar"]') as HTMLElement | null;
    this.cardLoreEl = container.querySelector('[data-testid="pokedex-card-lore"]') as HTMLElement | null;
    this.cardHabitatEl = container.querySelector('[data-testid="pokedex-card-habitat"]') as HTMLElement | null;
    this.cardStatusEl = container.querySelector('[data-testid="pokedex-card-status"]') as HTMLElement | null;

    for (let i = 0; i < 4; i++) {
      const bar = container.querySelector(`[data-stat-bar="${i}"]`) as HTMLElement | null;
      const val = container.querySelector(`[data-stat-val="${i}"]`) as HTMLElement | null;
      if (bar && val) this.statRows.push({ bar, val });
    }

    const closeBtn = container.querySelector('[data-testid="pokedex-close"]') as HTMLButtonElement | null;
    closeBtn?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('overworld');
    });

    this.searchInput?.addEventListener('input', () => {
      this.searchQuery = this.searchInput?.value ?? '';
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

    const allFilterButtons = container.querySelectorAll('[data-filter-type]');
    allFilterButtons.forEach((el) => {
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

    this.listEl?.addEventListener('click', (evt) => {
      const target = (evt.target as HTMLElement | null)?.closest('[data-species-id]') as HTMLElement | null;
      if (!target) return;
      const id = Number(target.getAttribute('data-species-id'));
      if (Number.isInteger(id) && id >= 1) {
        this.lastSelectedId = id;
        this.callbacks?.onSelectPokedexSpecies(id);
        this.refreshDetailOnly();
        this.lastListKey = '';
        this.refreshListOnly();
      }
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
    profile: TrainerProfile,
    selectedId: number,
    cryWaveform: CryWaveformSnapshot,
    reducedMotion: boolean,
    active: boolean,
    timeSec: number,
  ): void {
    this.currentProfile = profile;
    this.lastSelectedId = Math.max(1, Math.min(TOTAL_SPECIES_COUNT, Math.floor(selectedId || 25)));
    this.currentWaveform = cryWaveform;
    this.reducedMotion = reducedMotion;

    if (!active) return;

    this.refreshListOnly();
    this.refreshDetailOnly();
    this.renderCanvases(timeSec);
  }

  private refreshListOnly(): void {
    if (!this.currentProfile || !this.listEl) return;

    const result = filterAndPaginatePokedex({
      query: this.searchQuery,
      typeFilter: this.typeFilter,
      caughtOnly: this.caughtOnly,
      page: this.currentPage,
      pageSize: this.pageSize,
      pokedex: this.currentProfile.pokedex,
    });
    this.currentPage = result.page;

    const memo = [
      this.searchQuery,
      this.typeFilter,
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

    this.listEl.innerHTML = result.items
      .map((sp) => {
        const entry = this.currentProfile?.pokedex[sp.id];
        const caught = Boolean(entry?.caught);
        const seen = Boolean(entry?.seen || caught);
        const selected = sp.id === this.lastSelectedId;
        const statusIcon = caught
          ? iconSvg('icon-starball', 'sl-icon-sm')
          : seen
            ? iconSvg('icon-pokeball', 'sl-icon-sm')
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
            <span><strong>${safeText(sp.name)}</strong></span>
            <span>${iconSvg(typeIconId(sp.primaryType), 'sl-icon-sm')}${sp.secondaryType ? iconSvg(typeIconId(sp.secondaryType), 'sl-icon-sm') : ''}</span>
            <span>${statusIcon}</span>
          </button>
        `;
      })
      .join('');
  }

  private refreshDetailOnly(): void {
    if (!this.currentProfile) return;
    const sp = getSpecies(this.lastSelectedId);
    const entry = this.currentProfile.pokedex[sp.id];
    const caught = Boolean(entry?.caught);
    const seen = Boolean(entry?.seen || caught);
    const starRank = entry?.starRank ?? 0;
    const bond = entry?.bond ?? 0;
    const shiny = Boolean(entry?.shiny);

    const detailKey = `${sp.id}|${caught}|${seen}|${starRank}|${bond}|${shiny}|${this.reducedMotion}`;
    this.updateHoloCssVars();
    if (detailKey === this.lastDetailKey) return;
    this.lastDetailKey = detailKey;

    if (this.holoCardEl) {
      this.holoCardEl.setAttribute('data-type', sp.primaryType);
      this.holoCardEl.setAttribute('data-star-rank', String(starRank));
      this.holoCardEl.setAttribute('data-max-bond', String(bond >= 100));
    }
    if (this.cardNumberEl) this.cardNumberEl.textContent = formatDexNum(sp.id);
    if (this.cardNameEl) this.cardNameEl.textContent = sp.name;

    if (this.cardTypesEl) {
      const typeBadges = [sp.primaryType, sp.secondaryType].filter((t): t is ElementalType => Boolean(t));
      this.cardTypesEl.innerHTML = typeBadges
        .map(
          (t) => `
          <span class="sl-pill sl-type-pill" data-type="${t}">
            ${iconSvg(typeIconId(t), 'sl-icon-sm')}
            <span>${capitalize(t)}</span>
          </span>
        `,
        )
        .join('');
    }

    const stats = [sp.baseHp, sp.baseAtk, sp.baseDef, sp.baseSpd];
    stats.forEach((v, idx) => {
      const row = this.statRows[idx];
      if (!row) return;
      row.bar.style.setProperty('--fill', String(Math.min(1, v / 160)));
      row.val.textContent = String(v);
    });

    if (this.bondBarEl) {
      this.bondBarEl.style.setProperty('--fill', String(Math.min(1, bond / 100)));
    }
    if (this.bondValEl) {
      this.bondValEl.textContent = `${bond}`;
    }

    if (this.starPipsEl) {
      this.starPipsEl.innerHTML = Array.from({ length: 5 }, (_, i) => {
        const filled = i < starRank;
        return `<span class="sl-star-pip ${filled ? 'is-filled' : ''}">${iconSvg('icon-star-rank', 'sl-icon-sm')}</span>`;
      }).join('');
    }

    if (this.cardStatusEl) {
      const statusParts = [caught ? 'Caught' : seen ? 'Seen' : 'Catalog'];
      if (shiny) statusParts.push('Shiny');
      if (bond >= 100) statusParts.push('Max Bond');
      this.cardStatusEl.textContent = statusParts.join(' • ');
    }

    if (this.cardHabitatEl) {
      const biome = BIOME_DESCRIPTORS[sp.habitat];
      this.cardHabitatEl.textContent = `Gen ${sp.generation} • ${biome ? biome.name : sp.habitat}`;
    }

    if (this.cardLoreEl) {
      const evoHint = sp.evolvesTo ? ` Evolves into ${getSpecies(sp.evolvesTo).name} at Lv.${sp.evolveLevel ?? 20}.` : '';
      this.cardLoreEl.textContent = `${sp.lore}${evoHint}`;
    }
  }

  private updateHoloCssVars(): void {
    if (!this.holoCardEl) return;
    const entry = this.currentProfile?.pokedex[this.lastSelectedId];
    const metrics = computeHoloCardMetrics(
      {
        speciesId: this.lastSelectedId,
        pointerTiltX: this.pointerTiltX,
        pointerTiltY: this.pointerTiltY,
        starRank: entry?.starRank ?? 0,
        bondLevel: entry?.bond ?? 0,
        caught: Boolean(entry?.caught),
        shiny: Boolean(entry?.shiny),
      },
      this.reducedMotion,
    );
    this.holoCardEl.style.setProperty('--holo-rx', `${metrics.rxDeg}deg`);
    this.holoCardEl.style.setProperty('--holo-ry', `${metrics.ryDeg}deg`);
    this.holoCardEl.style.setProperty('--holo-px', String(metrics.pxPercent));
    this.holoCardEl.style.setProperty('--holo-py', String(metrics.pyPercent));
    this.holoCardEl.style.setProperty('--holo-intensity', String(metrics.intensity));
  }

  private renderCanvases(timeSec: number): void {
    const sp = getSpecies(this.lastSelectedId);
    const entry = this.currentProfile?.pokedex[sp.id];

    if (this.portraitCanvas) {
      let ctx: CanvasRenderingContext2D | null = null;
      try {
        ctx = this.portraitCanvas.getContext('2d');
      } catch {
        ctx = null;
      }
      if (ctx) {
        const w = this.portraitCanvas.width || 184;
        const h = this.portraitCanvas.height || 156;
        ctx.clearRect(0, 0, w, h);
        const pal = TYPE_PALETTES[sp.primaryType];
        const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.5, w * 0.65);
        bg.addColorStop(0, `${pal.primary}38`);
        bg.addColorStop(1, 'rgba(6, 10, 26, 0.92)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        drawSpeciesPortrait(ctx, sp, this.rigSynthesizer, {
          cx: w * 0.5,
          cy: h * 0.52,
          size: 112,
          time: timeSec,
          facing: 'left',
          shiny: Boolean(entry?.shiny),
          reducedMotion: this.reducedMotion,
        });
      }
    }

    if (this.cryCanvas && this.currentWaveform) {
      let ctx: CanvasRenderingContext2D | null = null;
      try {
        ctx = this.cryCanvas.getContext('2d');
      } catch {
        ctx = null;
      }
      if (ctx) {
        const w = this.cryCanvas.width || 260;
        const h = this.cryCanvas.height || 48;
        const midY = h * 0.5;
        const pal = TYPE_PALETTES[sp.primaryType];
        const samples = this.currentWaveform.samples;

        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(124, 232, 255, 0.2)';
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
