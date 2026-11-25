import type {
  AtlasManifest,
  DecodedSpriteFrames,
  DojoProfileState,
  IconId,
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

const ACCESSORY_ICON_MAP: Record<TrainerAccessoryId, IconId> = {
  cap: 'icon-hat',
  crown: 'icon-crown',
  wizard: 'icon-sparkle',
  headband: 'icon-bond',
  goggles: 'icon-compass',
  halo: 'icon-star-rank',
  visor: 'icon-shield',
  antlers: 'icon-type-fairy',
};

const AURA_COLOR_MAP: Record<TrainerAuraId, string> = {
  none: '#64748b',
  stars: '#fde047',
  hearts: '#f472b6',
  lightning: '#38bdf8',
  blossom: '#fb7185',
  cosmic: '#2dd4bf',
};

export class StarterLabView {
  private callbacks: UIBridgeCallbacks | null = null;
  private rootEl: HTMLElement | null = null;
  private willowCanvas: HTMLCanvasElement | null = null;
  private trainerCanvas: HTMLCanvasElement | null = null;
  private welcomeEl: HTMLElement | null = null;
  private stylePillEl: HTMLElement | null = null;
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
    this.rootEl = container;
    this.starterCanvases.clear();
    this.lastProfileMemo = '';
    this.lastSpriteStamp = '';

    const starters = STARTER_IDS.map((id) => getSpeciesEntry(id));
    const styles = getAllTrainerStyles();
    const accessories = getAllTrainerAccessories();
    const auras = getAllTrainerAuras();

    const outfitSwatchesHtml = styles
      .map(
        (s) => `
          <button
            type="button"
            class="sl-swatch-btn"
            data-starter-outfit="${s.id}"
            data-testid="starter-outfit-${s.id}"
            title="${safeText(s.name)}"
            aria-label="Outfit: ${safeText(s.name)}"
            aria-pressed="false"
          >
            <span class="sl-swatch-pair" aria-hidden="true">
              <span class="sl-swatch-dot" style="background:${safeText(s.outfitPrimary)};"></span>
              <span class="sl-swatch-dot" style="background:${safeText(s.outfitSecondary)};"></span>
            </span>
          </button>
        `,
      )
      .join('');

    const gearSwatchesHtml = accessories
      .map(
        (a) => `
          <button
            type="button"
            class="sl-swatch-btn"
            data-starter-accessory="${a.id}"
            data-testid="starter-accessory-${a.id}"
            title="${safeText(a.name)}"
            aria-label="Gear: ${safeText(a.name)}"
            aria-pressed="false"
          >
            ${createIconSvg(ACCESSORY_ICON_MAP[a.id] ?? 'icon-hat', 'sl-icon-sm')}
          </button>
        `,
      )
      .join('');

    const auraSwatchesHtml = auras
      .map(
        (a) => `
          <button
            type="button"
            class="sl-swatch-btn"
            data-starter-aura="${a.id}"
            data-testid="starter-aura-${a.id}"
            title="${safeText(a.name)}"
            aria-label="Aura: ${safeText(a.name)}"
            aria-pressed="false"
          >
            <span class="sl-swatch-dot" style="background:${AURA_COLOR_MAP[a.id] ?? '#94a3b8'};"></span>
          </button>
        `,
      )
      .join('');

    container.innerHTML = `
      <div class="sl-modal-panel sl-glass sl-rpg-ornate sl-starter-panel" role="dialog" aria-modal="true" aria-label="Professor Willow Starter Lab">
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
            <canvas class="sl-portrait-canvas" width="78" height="78" data-testid="starter-willow-canvas" aria-hidden="true"></canvas>
            <div class="sl-willow-copy">
              <div class="sl-willow-speaker">
                ${createIconSvg('icon-lab', 'sl-icon-sm')}
                <span>Professor Willow</span>
              </div>
              <p class="sl-willow-text" data-testid="starter-welcome-text">
                Welcome to Starlight Island! Customize your Trainer crest and pick Grass, Fire, or Water — every partner starts at Level 5 ready for 18 connected biomes!
              </p>
            </div>
          </div>

          <!-- Direct Visual Swatch Wardrobe (Zero blind cycling buttons!) -->
          <div class="sl-starter-wardrobe">
            <div class="sl-starter-wardrobe-preview">
              <canvas class="sl-portrait-canvas-sm" width="56" height="56" data-testid="starter-trainer-canvas" aria-hidden="true"></canvas>
              <button type="button" class="sl-btn" data-testid="starter-toggle-cape" aria-pressed="false" title="Toggle Starlight Cape">
                ${createIconSvg('icon-cape', 'sl-icon-sm')}
                <span>Cape: Off</span>
              </button>
            </div>

            <div class="sl-starter-wardrobe-rows">
              <div class="sl-swatch-row" role="group" aria-label="Trainer Outfits">
                <span class="sl-swatch-row-label">Outfit</span>
                ${outfitSwatchesHtml}
              </div>
              <div class="sl-swatch-row" role="group" aria-label="Trainer Headgear">
                <span class="sl-swatch-row-label">Gear</span>
                ${gearSwatchesHtml}
              </div>
              <div class="sl-swatch-row" role="group" aria-label="Trainer Auras">
                <span class="sl-swatch-row-label">Aura</span>
                ${auraSwatchesHtml}
                <span class="sl-pill sl-pill-gold" data-testid="starter-style-label" style="margin-left:auto;">Signature Outfit • Adventure Cap</span>
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
                    <canvas class="sl-starter-sprite" width="88" height="78" data-testid="starter-canvas-${sp.id}" aria-label="${safeText(sp.name)} Preview"></canvas>
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
    this.capeBtn = container.querySelector('[data-testid="starter-toggle-cape"]');

    for (const id of STARTER_IDS) {
      const c = container.querySelector(`[data-testid="starter-canvas-${id}"]`) as HTMLCanvasElement | null;
      if (c) this.starterCanvases.set(id, c);
    }

    container.querySelector('[data-testid="starter-back"]')?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('title');
    });

    container.addEventListener('click', (evt) => {
      const target = evt.target as HTMLElement | null;
      const outfitBtn = target?.closest('[data-starter-outfit]') as HTMLButtonElement | null;
      if (outfitBtn) {
        const styleId = outfitBtn.getAttribute('data-starter-outfit') as TrainerStyleId | null;
        if (styleId) this.callbacks?.onUpdateAppearance({ styleId });
        return;
      }
      const accBtn = target?.closest('[data-starter-accessory]') as HTMLButtonElement | null;
      if (accBtn) {
        const accessory = accBtn.getAttribute('data-starter-accessory') as TrainerAccessoryId | null;
        if (accessory) this.callbacks?.onUpdateAppearance({ accessory });
        return;
      }
      const auraBtn = target?.closest('[data-starter-aura]') as HTMLButtonElement | null;
      if (auraBtn) {
        const aura = auraBtn.getAttribute('data-starter-aura') as TrainerAuraId | null;
        if (aura) this.callbacks?.onUpdateAppearance({ aura });
        return;
      }
      const starterBtn = target?.closest('[data-starter-id]') as HTMLButtonElement | null;
      if (starterBtn) {
        const id = Number(starterBtn.getAttribute('data-starter-id'));
        if (Number.isInteger(id) && id >= 1) {
          this.callbacks?.onChooseStarter(id);
        }
      }
    });

    this.capeBtn?.addEventListener('click', () => {
      this.callbacks?.onUpdateAppearance({ cape: !this.currentCape });
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
    const accName = getAllTrainerAccessories().find((a) => a.id === this.currentAccessory)?.name ?? 'Adventure Cap';
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
          `Welcome to Starlight Island, ${trainerName}! Customize your crest and pick Grass, Fire, or Water to begin your journey across 18 biomes and 20 Shrines.`;
      }
      if (this.stylePillEl) {
        const parts = [styleName, accName];
        if (this.currentAura !== 'none') parts.push(auraName);
        if (this.currentCape) parts.push('Cape');
        this.stylePillEl.textContent = parts.join(' • ');
      }
      if (this.capeBtn) {
        this.capeBtn.classList.toggle('is-active', this.currentCape);
        this.capeBtn.setAttribute('aria-pressed', String(this.currentCape));
        const span = this.capeBtn.querySelector('span');
        if (span) span.textContent = this.currentCape ? 'Cape: On' : 'Cape: Off';
      }

      if (this.rootEl) {
        this.rootEl.querySelectorAll('[data-starter-outfit]').forEach((el) => {
          const on = el.getAttribute('data-starter-outfit') === this.currentStyleId;
          el.classList.toggle('is-active', on);
          el.setAttribute('aria-pressed', String(on));
        });
        this.rootEl.querySelectorAll('[data-starter-accessory]').forEach((el) => {
          const on = el.getAttribute('data-starter-accessory') === this.currentAccessory;
          el.classList.toggle('is-active', on);
          el.setAttribute('aria-pressed', String(on));
        });
        this.rootEl.querySelectorAll('[data-starter-aura]').forEach((el) => {
          const on = el.getAttribute('data-starter-aura') === this.currentAura;
          el.classList.toggle('is-active', on);
          el.setAttribute('aria-pressed', String(on));
        });
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
    this.rootEl = null;
    this.willowCanvas = null;
    this.trainerCanvas = null;
    this.welcomeEl = null;
    this.stylePillEl = null;
    this.capeBtn = null;
    this.callbacks = null;
  }
}
