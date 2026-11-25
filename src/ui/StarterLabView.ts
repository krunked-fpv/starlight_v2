import type {
  AtlasManifest,
  DecodedSpriteFrames,
  DojoProfileState,
  TrainerAccessoryId,
  TrainerAuraId,
  TrainerStyleId,
  UIBridgeCallbacks,
} from '../contracts';
import {
  getAbilityEntry,
  getAllTrainerAccessories,
  getAllTrainerAuras,
  getAllTrainerStyles,
  getCleanTrainerName,
  getSpeciesEntry,
  STARTER_IDS,
  typeToIconId,
} from '../core';
import {
  createIconSvg,
  renderPokemonPreviewCanvas,
  renderTrainerPortraitCanvas,
  safeText,
} from './iconHelper';

export interface StarterLabAssets {
  manifest: AtlasManifest | null;
  charactersSheet: CanvasImageSource | null;
  fallbacksSheet: CanvasImageSource | null;
  spriteCacheVersion?: number;
  getFrames?: (speciesId: number) => DecodedSpriteFrames | null;
}

const STARTER_FLAVOR_FALLBACK: Record<number, string> = {
  1: 'A sunny seed rests on its back, blooming with sweet forest energy.',
  4: 'Its lively tail flame burns brightest when cheering on its trainer!',
  7: 'A playful swimmer whose sleek shell slices swiftly through waves.',
};

export class StarterLabView {
  private callbacks: UIBridgeCallbacks | null = null;
  private willowCanvas: HTMLCanvasElement | null = null;
  private trainerCanvas: HTMLCanvasElement | null = null;
  private welcomeEl: HTMLElement | null = null;
  private stylePillEl: HTMLElement | null = null;
  private auraBtn: HTMLButtonElement | null = null;
  private capeBtn: HTMLButtonElement | null = null;
  private starterCanvases = new Map<number, HTMLCanvasElement>();
  private lastProfileMemo = '';
  private lastSpriteStamp = '';

  private currentStyleId: TrainerStyleId = 'default';
  private currentAccessory: TrainerAccessoryId = 'cap';
  private currentAura: TrainerAuraId = 'none';
  private currentCape = false;

  mount(container: HTMLElement, callbacks: UIBridgeCallbacks): void {
    this.callbacks = callbacks;
    this.starterCanvases.clear();
    this.lastProfileMemo = '';
    this.lastSpriteStamp = '';

    const starters = STARTER_IDS.map((id) => getSpeciesEntry(id));

    container.innerHTML = `
      <div class="sl-modal-panel sl-glass sl-starter-panel" role="dialog" aria-modal="true" aria-label="Professor Willow Starter Lab">
        <header class="sl-modal-header">
          <h2 class="sl-modal-title">
            ${createIconSvg('icon-lab', 'sl-icon-md')}
            <span>Professor Willow's Starlight Lab</span>
          </h2>
          <button type="button" class="sl-btn sl-btn-ghost" data-testid="starter-back">
            ${createIconSvg('icon-close', 'sl-icon-sm')}
            <span>Switch Trainer</span>
          </button>
        </header>

        <div class="sl-starter-body">
          <div class="sl-willow-banner">
            <canvas class="sl-portrait-canvas" width="76" height="76" data-testid="starter-willow-canvas" aria-hidden="true"></canvas>
            <div class="sl-willow-copy">
              <div class="sl-willow-speaker">
                ${createIconSvg('icon-lab', 'sl-icon-sm')}
                <span>Professor Willow</span>
              </div>
              <p class="sl-willow-text" data-testid="starter-welcome-text">
                Welcome to Starlight Island! Pick Grass, Fire, or Water — every partner starts at Level 5 ready to explore 18 biomes.
              </p>
            </div>
            <div class="sl-starter-style-box">
              <canvas class="sl-portrait-canvas-sm" width="52" height="52" data-testid="starter-trainer-canvas" aria-hidden="true"></canvas>
              <div class="sl-starter-style-meta">
                <span class="sl-pill sl-pill-gold" data-testid="starter-style-label">Signature Outfit</span>
                <div class="sl-starter-style-actions">
                  <button type="button" class="sl-btn" data-testid="starter-cycle-outfit" title="Cycle Trainer Outfit">
                    ${createIconSvg('icon-style', 'sl-icon-sm')}
                    <span>Outfit</span>
                  </button>
                  <button type="button" class="sl-btn" data-testid="starter-cycle-accessory" title="Cycle Headgear">
                    ${createIconSvg('icon-hat', 'sl-icon-sm')}
                    <span>Gear</span>
                  </button>
                  <button type="button" class="sl-btn" data-testid="starter-cycle-aura" title="Cycle Starlight Aura">
                    ${createIconSvg('icon-aura', 'sl-icon-sm')}
                    <span>Aura</span>
                  </button>
                  <button type="button" class="sl-btn" data-testid="starter-toggle-cape" aria-pressed="false" title="Toggle Starlight Cape">
                    ${createIconSvg('icon-cape', 'sl-icon-sm')}
                    <span>Cape</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="sl-starter-grid">
            ${starters
              .map((sp) => {
                const ability = getAbilityEntry(sp.ability);
                const rawDesc = sp.description?.trim() ?? '';
                const desc =
                  !rawDesc || rawDesc.endsWith('of Starlight Island.')
                    ? STARTER_FLAVOR_FALLBACK[sp.id] ?? rawDesc
                    : rawDesc;
                return `
                  <article class="sl-starter-card sl-pixel-card" data-type="${sp.type}" data-testid="starter-card-${sp.id}">
                    <div class="sl-starter-card-head">
                      <span class="sl-pill sl-num">#${String(sp.id).padStart(4, '0')}</span>
                      <span class="sl-pill sl-type-pill" data-type="${sp.type}">
                        ${createIconSvg(typeToIconId(sp.type), 'sl-icon-sm')}
                        <span>${safeText(sp.type.toUpperCase())}</span>
                      </span>
                    </div>
                    <h3 class="sl-starter-name">${safeText(sp.name)}</h3>
                    <canvas class="sl-starter-sprite" width="118" height="110" data-testid="starter-canvas-${sp.id}" aria-label="${safeText(sp.name)} Preview"></canvas>
                    <div class="sl-starter-ability">
                      <span class="sl-pill sl-pill-cyan">${createIconSvg('icon-sparkle', 'sl-icon-sm')} ${safeText(ability?.name ?? 'Starlight Bond')}</span>
                    </div>
                    <div class="sl-starter-stats sl-num">
                      <div class="sl-starter-stat-cell">
                        <span class="sl-starter-stat-k">HP</span>
                        <span class="sl-starter-stat-v">${sp.baseStats.hp}</span>
                      </div>
                      <div class="sl-starter-stat-cell">
                        <span class="sl-starter-stat-k">ATK</span>
                        <span class="sl-starter-stat-v">${sp.baseStats.atk}</span>
                      </div>
                      <div class="sl-starter-stat-cell">
                        <span class="sl-starter-stat-k">DEF</span>
                        <span class="sl-starter-stat-v">${sp.baseStats.def}</span>
                      </div>
                      <div class="sl-starter-stat-cell">
                        <span class="sl-starter-stat-k">SPD</span>
                        <span class="sl-starter-stat-v">${sp.baseStats.spd}</span>
                      </div>
                    </div>
                    <p class="sl-starter-desc">${safeText(desc)}</p>
                    <button type="button" class="sl-btn sl-btn-primary sl-starter-choose-btn" data-testid="starter-choose-${sp.id}" data-starter-id="${sp.id}">
                      ${createIconSvg('icon-pokeball', 'sl-icon-sm')}
                      <span>Choose ${safeText(sp.name)}</span>
                    </button>
                  </article>
                `;
              })
              .join('')}
          </div>
        </div>
      </div>
    `;

    this.willowCanvas = container.querySelector('[data-testid="starter-willow-canvas"]');
    this.trainerCanvas = container.querySelector('[data-testid="starter-trainer-canvas"]');
    this.welcomeEl = container.querySelector('[data-testid="starter-welcome-text"]');
    this.stylePillEl = container.querySelector('[data-testid="starter-style-label"]');
    this.auraBtn = container.querySelector('[data-testid="starter-cycle-aura"]');
    this.capeBtn = container.querySelector('[data-testid="starter-toggle-cape"]');

    for (const id of STARTER_IDS) {
      const c = container.querySelector(`[data-testid="starter-canvas-${id}"]`) as HTMLCanvasElement | null;
      if (c) this.starterCanvases.set(id, c);
    }

    container.querySelector('[data-testid="starter-back"]')?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('title');
    });

    container.querySelector('[data-testid="starter-cycle-outfit"]')?.addEventListener('click', () => {
      const styles = getAllTrainerStyles();
      const idx = styles.findIndex((s) => s.id === this.currentStyleId);
      const next = styles[(idx + 1) % styles.length];
      if (next) this.callbacks?.onUpdateAppearance({ styleId: next.id });
    });

    container.querySelector('[data-testid="starter-cycle-accessory"]')?.addEventListener('click', () => {
      const accs = getAllTrainerAccessories();
      const idx = accs.findIndex((a) => a.id === this.currentAccessory);
      const next = accs[(idx + 1) % accs.length];
      if (next) this.callbacks?.onUpdateAppearance({ accessory: next.id });
    });

    container.querySelector('[data-testid="starter-cycle-aura"]')?.addEventListener('click', () => {
      const auras = getAllTrainerAuras();
      const idx = auras.findIndex((a) => a.id === this.currentAura);
      const next = auras[(idx + 1) % auras.length];
      if (next) this.callbacks?.onUpdateAppearance({ aura: next.id });
    });

    this.capeBtn?.addEventListener('click', () => {
      this.callbacks?.onUpdateAppearance({ cape: !this.currentCape });
    });

    container.querySelectorAll('[data-starter-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-starter-id'));
        if (Number.isInteger(id) && id >= 1) {
          this.callbacks?.onChooseStarter(id);
        }
      });
    });
  }

  sync(
    profile: DojoProfileState,
    active: boolean,
    timeSec: number,
    assets: StarterLabAssets,
  ): void {
    this.currentStyleId = profile.appearance?.styleId ?? 'default';
    this.currentAccessory = profile.appearance?.accessory ?? 'cap';
    this.currentAura = profile.appearance?.aura ?? 'none';
    this.currentCape = Boolean(profile.appearance?.cape);
    if (!active) return;

    const trainerName = getCleanTrainerName(profile, profile.trainerId);
    const styleName = getAllTrainerStyles().find((s) => s.id === this.currentStyleId)?.name ?? 'Signature Outfit';
    const accName = getAllTrainerAccessories().find((a) => a.id === this.currentAccessory)?.name ?? 'Cap';
    const auraName = getAllTrainerAuras().find((a) => a.id === this.currentAura)?.name ?? 'No Aura';

    const memo = [
      profile.trainerId,
      trainerName,
      this.currentStyleId,
      this.currentAccessory,
      this.currentAura,
      this.currentCape,
      Boolean(assets.charactersSheet),
    ].join('|');

    if (memo !== this.lastProfileMemo) {
      this.lastProfileMemo = memo;
      if (this.welcomeEl) {
        this.welcomeEl.textContent =
          `Welcome to Starlight Island, ${trainerName}! Pick Grass, Fire, or Water to begin your journey across 18 connected biomes and 20 Shrines.`;
      }
      if (this.stylePillEl) {
        const parts = [styleName, accName];
        if (this.currentAura !== 'none') parts.push(auraName);
        if (this.currentCape) parts.push('Cape');
        this.stylePillEl.textContent = parts.join(' • ');
      }
      if (this.auraBtn) {
        this.auraBtn.classList.toggle('is-active', this.currentAura !== 'none');
        this.auraBtn.setAttribute('aria-pressed', String(this.currentAura !== 'none'));
      }
      if (this.capeBtn) {
        this.capeBtn.classList.toggle('is-active', this.currentCape);
        this.capeBtn.setAttribute('aria-pressed', String(this.currentCape));
      }
      if (this.willowCanvas) {
        renderTrainerPortraitCanvas(this.willowCanvas, 'willow', assets.charactersSheet, assets.manifest);
      }
      if (this.trainerCanvas) {
        renderTrainerPortraitCanvas(
          this.trainerCanvas,
          profile.trainerId,
          assets.charactersSheet,
          assets.manifest,
          profile.appearance,
        );
      }
    }

    const stamp = `${Math.floor(timeSec * 12)}|${assets.spriteCacheVersion ?? 0}|${Boolean(assets.fallbacksSheet)}`;
    if (stamp !== this.lastSpriteStamp) {
      this.lastSpriteStamp = stamp;
      for (const id of STARTER_IDS) {
        const canvas = this.starterCanvases.get(id);
        if (!canvas) continue;
        renderPokemonPreviewCanvas(
          canvas,
          id,
          assets.getFrames?.(id) ?? null,
          assets.fallbacksSheet,
          assets.manifest,
          false,
          timeSec,
        );
      }
    }
  }

  dispose(): void {
    this.starterCanvases.clear();
    this.willowCanvas = null;
    this.trainerCanvas = null;
    this.welcomeEl = null;
    this.stylePillEl = null;
    this.capeBtn = null;
    this.callbacks = null;
  }
}
