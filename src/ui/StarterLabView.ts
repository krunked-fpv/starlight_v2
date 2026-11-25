import type {
  AtlasManifest,
  DecodedSpriteFrames,
  DojoProfileState,
  UIBridgeCallbacks,
} from '../contracts';
import {
  getAbilityEntry,
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
  getFrames?: (speciesId: number) => DecodedSpriteFrames | null;
}

export class StarterLabView {
  private callbacks: UIBridgeCallbacks | null = null;
  private willowCanvas: HTMLCanvasElement | null = null;
  private trainerCanvas: HTMLCanvasElement | null = null;
  private welcomeEl: HTMLElement | null = null;
  private stylePillEl: HTMLElement | null = null;
  private starterCanvases = new Map<number, HTMLCanvasElement>();
  private lastProfileMemo = '';
  private lastSpriteStamp = '';

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
          <button type="button" class="sl-btn" data-testid="starter-back">
            ${createIconSvg('icon-close', 'sl-icon-sm')}
            <span>Switch Trainer</span>
          </button>
        </header>

        <div class="sl-starter-body">
          <div class="sl-willow-banner sl-glass-soft">
            <canvas class="sl-portrait-canvas" width="72" height="72" data-testid="starter-willow-canvas" aria-hidden="true"></canvas>
            <div class="sl-willow-copy">
              <div class="sl-willow-speaker">
                <span class="sl-pill">${createIconSvg('icon-lab', 'sl-icon-sm')} Professor Willow</span>
              </div>
              <p class="sl-willow-text" data-testid="starter-welcome-text">
                Welcome to Starlight Island! Choose your first partner Pokémon to begin your adventure across 18 connected biomes.
              </p>
            </div>
            <div class="sl-starter-style-box">
              <canvas class="sl-portrait-canvas-sm" width="56" height="56" data-testid="starter-trainer-canvas" aria-hidden="true"></canvas>
              <div class="sl-starter-style-meta">
                <span class="sl-pill" data-testid="starter-style-label">Signature Outfit</span>
                <div class="sl-starter-style-actions">
                  <button type="button" class="sl-btn" data-testid="starter-cycle-outfit">
                    ${createIconSvg('icon-style', 'sl-icon-sm')}
                    <span>Next Look</span>
                  </button>
                  <button type="button" class="sl-btn" data-testid="starter-toggle-cape">
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
                    <canvas class="sl-starter-sprite" width="112" height="104" data-testid="starter-canvas-${sp.id}" aria-label="${safeText(sp.name)} Preview"></canvas>
                    <div class="sl-starter-ability">
                      <span class="sl-pill">${createIconSvg('icon-sparkle', 'sl-icon-sm')} ${safeText(ability?.name ?? 'Starlight Bond')}</span>
                    </div>
                    <div class="sl-starter-stats sl-num">
                      <span>HP ${sp.baseStats.hp}</span>
                      <span>ATK ${sp.baseStats.atk}</span>
                      <span>DEF ${sp.baseStats.def}</span>
                      <span>SPD ${sp.baseStats.spd}</span>
                    </div>
                    <p class="sl-starter-desc">${safeText(sp.description)}</p>
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

    for (const id of STARTER_IDS) {
      const c = container.querySelector(`[data-testid="starter-canvas-${id}"]`) as HTMLCanvasElement | null;
      if (c) this.starterCanvases.set(id, c);
    }

    container.querySelector('[data-testid="starter-back"]')?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('title');
    });

    container.querySelector('[data-testid="starter-cycle-outfit"]')?.addEventListener('click', () => {
      const styles = getAllTrainerStyles();
      const currentStyle = this.currentStyleId;
      const idx = styles.findIndex((s) => s.id === currentStyle);
      const next = styles[(idx + 1) % styles.length];
      if (next) this.callbacks?.onUpdateAppearance({ styleId: next.id });
    });

    container.querySelector('[data-testid="starter-toggle-cape"]')?.addEventListener('click', () => {
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

  private currentStyleId = 'default';
  private currentCape = false;

  sync(
    profile: DojoProfileState,
    active: boolean,
    timeSec: number,
    assets: StarterLabAssets,
  ): void {
    this.currentStyleId = profile.appearance?.styleId ?? 'default';
    this.currentCape = Boolean(profile.appearance?.cape);
    if (!active) return;

    const trainerName = getCleanTrainerName(profile, profile.trainerId);
    const styles = getAllTrainerStyles();
    const styleName = styles.find((s) => s.id === this.currentStyleId)?.name ?? 'Signature Outfit';

    const memo = `${profile.trainerId}|${trainerName}|${this.currentStyleId}|${this.currentCape}`;
    if (memo !== this.lastProfileMemo) {
      this.lastProfileMemo = memo;
      if (this.welcomeEl) {
        this.welcomeEl.textContent =
          `Welcome to Starlight Island, ${trainerName}! Choose your first partner Pokémon to explore 18 biomes and 20 Elemental Shrines.`;
      }
      if (this.stylePillEl) {
        this.stylePillEl.textContent = `${trainerName} • ${styleName}${this.currentCape ? ' + Cape' : ''}`;
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

    const stamp = `${Math.floor(timeSec * 12)}|${Boolean(assets.fallbacksSheet)}`;
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
    this.callbacks = null;
  }
}
