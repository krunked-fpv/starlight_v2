import {
  BIOME_IDS,
  type ActiveScreen,
  type BiomeId,
  type EncounterTier,
  type ICelestialUIController,
  type IconId,
  type IOfflineSpriteRigSynthesizer,
  type OverworldLandmarkKind,
  type RendererMode,
  type StatusCondition,
  type TrainerProfile,
  type UIBridgeCallbacks,
  type UIRenderSnapshot,
} from '../contracts';
import { BIOME_DESCRIPTORS, getSpecies, TOTAL_SPECIES_COUNT } from '../core';
import { BadgesShowcase } from './BadgesShowcase';
import { iconSvg, safeText, sanitizeNoEmoji, typeIconId } from './iconHelper';
import { renderProfileCardPreview } from './LivingTitleRenderer';
import { PokedexView } from './PokedexView';
import { StyleStudioStage } from './StyleStudioStage';

const STATUS_ICON_MAP: Record<StatusCondition, IconId> = {
  none: 'icon-composure',
  frost: 'icon-type-ice',
  static: 'icon-type-electric',
  burn: 'icon-type-fire',
  sleep: 'icon-type-psychic',
};

const LANDMARK_ICON_MAP: Record<OverworldLandmarkKind, IconId> = {
  cottage: 'icon-waypoint',
  shrine: 'icon-shrine',
  chest: 'icon-chest',
  fountain: 'icon-fountain',
  signpost: 'icon-signpost',
  starfall: 'icon-starfall',
  studio: 'icon-style',
  observatory: 'icon-pokedex',
  dock: 'icon-skyhop',
};

function dpadChevronSvg(dir: 'up' | 'down' | 'left' | 'right'): string {
  const path =
    dir === 'up'
      ? 'M16 7l8 12H8z'
      : dir === 'down'
        ? 'M16 25L8 13h16z'
        : dir === 'left'
          ? 'M7 16l12-8v16z'
          : 'M25 16L13 8v16z';
  return `<svg class="sl-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="${path}" fill="currentColor"/></svg>`;
}

function setHidden(el: HTMLElement | null, hidden: boolean): void {
  if (!el) return;
  if (hidden) {
    el.setAttribute('hidden', '');
    el.setAttribute('aria-hidden', 'true');
  } else {
    el.removeAttribute('hidden');
    el.removeAttribute('aria-hidden');
  }
}

export class CelestialUIController implements ICelestialUIController {
  private root: HTMLElement | null = null;
  private callbacks: UIBridgeCallbacks | null = null;
  private rigSynthesizer: IOfflineSpriteRigSynthesizer | null = null;

  private readonly pokedexView = new PokedexView();
  private readonly badgesShowcase = new BadgesShowcase();
  private readonly styleStudio = new StyleStudioStage();

  private settingsOpen = false;
  private lastScreen: ActiveScreen | null = null;
  private lastSnapshot: UIRenderSnapshot | null = null;
  private lastCrtMode: boolean | null = null;
  private lastReducedMotion: boolean | null = null;
  private lastTitlePreviewTs = -1;
  private lastStyleStageTs = -1;
  private dpadRepeatTimer: ReturnType<typeof setInterval> | null = null;

  private readonly memo = new Map<string, string>();

  // Persistent DOM containers
  private crtOverlayEl: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;

  private titleScreen: HTMLElement | null = null;
  private overworldScreen: HTMLElement | null = null;
  private battleScreen: HTMLElement | null = null;
  private skyhopScreen: HTMLElement | null = null;
  private briefingScreen: HTMLElement | null = null;
  private pokedexScreen: HTMLElement | null = null;
  private badgesScreen: HTMLElement | null = null;
  private styleScreen: HTMLElement | null = null;

  // Title refs
  private slot0Card: HTMLButtonElement | null = null;
  private slot1Card: HTMLButtonElement | null = null;
  private slot0Canvas: HTMLCanvasElement | null = null;
  private slot1Canvas: HTMLCanvasElement | null = null;
  private slot0MetaEl: HTMLElement | null = null;
  private slot1MetaEl: HTMLElement | null = null;
  private enterWorldBtn: HTMLButtonElement | null = null;

  // Overworld refs
  private biomeIconEl: HTMLElement | null = null;
  private biomeNameEl: HTMLElement | null = null;
  private biomeSubEl: HTMLElement | null = null;
  private partyLeadPillEl: HTMLElement | null = null;
  private partyHpValEl: HTMLElement | null = null;
  private partyCompValEl: HTMLElement | null = null;
  private briefingBtn: HTMLButtonElement | null = null;
  private briefingScorePillEl: HTMLElement | null = null;
  private biomeSelect: HTMLSelectElement | null = null;
  private settingsToggleBtn: HTMLButtonElement | null = null;
  private settingsPanel: HTMLElement | null = null;
  private crtBtn: HTMLButtonElement | null = null;
  private motionBtn: HTMLButtonElement | null = null;
  private audioBtn: HTMLButtonElement | null = null;
  private touchBtn: HTMLButtonElement | null = null;
  private rendererSelect: HTMLSelectElement | null = null;
  private engineTelemetryEl: HTMLElement | null = null;
  private interactBtn: HTMLButtonElement | null = null;
  private dpadContainer: HTMLElement | null = null;

  // Briefing refs
  private briefingDrawerContent: HTMLElement | null = null;

  // Battle refs
  private enemyNameEl: HTMLElement | null = null;
  private enemyTierPillEl: HTMLElement | null = null;
  private enemyTypesEl: HTMLElement | null = null;
  private enemyHpBarEl: HTMLElement | null = null;
  private enemyHpValEl: HTMLElement | null = null;
  private enemyCompBarEl: HTMLElement | null = null;
  private enemyCompValEl: HTMLElement | null = null;
  private enemyStatusEl: HTMLElement | null = null;

  private playerNameEl: HTMLElement | null = null;
  private playerBondPillEl: HTMLElement | null = null;
  private playerTypesEl: HTMLElement | null = null;
  private playerHpBarEl: HTMLElement | null = null;
  private playerHpValEl: HTMLElement | null = null;
  private playerCompBarEl: HTMLElement | null = null;
  private playerCompValEl: HTMLElement | null = null;
  private playerStatusEl: HTMLElement | null = null;

  private battleMsgEl: HTMLElement | null = null;
  private moveButtons: HTMLButtonElement[] = [];
  private starBallBtn: HTMLButtonElement | null = null;
  private potionBtn: HTMLButtonElement | null = null;
  private offlineRigBtn: HTMLButtonElement | null = null;
  private evolveBtn: HTMLButtonElement | null = null;
  private fleeBtn: HTMLButtonElement | null = null;

  // Sky-Hop refs
  private skyScoreEl: HTMLElement | null = null;
  private skyComboEl: HTMLElement | null = null;
  private skyHighEl: HTMLElement | null = null;
  private skyShieldsEl: HTMLElement | null = null;
  private skyDashBarEl: HTMLElement | null = null;
  private skyBannerEl: HTMLElement | null = null;
  private skyBannerTitleEl: HTMLElement | null = null;
  private skyStartBtn: HTMLButtonElement | null = null;
  private skyFlapBtn: HTMLButtonElement | null = null;
  private skyDashBtn: HTMLButtonElement | null = null;

  constructor(options?: { rigSynthesizer?: IOfflineSpriteRigSynthesizer | null }) {
    if (options?.rigSynthesizer) {
      this.setRigSynthesizer(options.rigSynthesizer);
    }
  }

  setRigSynthesizer(synth: IOfflineSpriteRigSynthesizer | null): void {
    this.rigSynthesizer = synth;
    this.pokedexView.setRigSynthesizer(synth);
    this.styleStudio.setRigSynthesizer(synth);
  }

  mount(root: HTMLElement, callbacks: UIBridgeCallbacks): void {
    this.dispose();
    this.root = root;
    this.callbacks = callbacks;
    this.memo.clear();
    this.lastScreen = null;
    this.settingsOpen = false;

    const doc = root.ownerDocument;
    this.crtOverlayEl = doc ? doc.getElementById('crt-overlay') : null;

    const biomeOptionsHtml = BIOME_IDS.map((id) => {
      const desc = BIOME_DESCRIPTORS[id];
      return `<option value="${id}">${safeText(desc.name)}</option>`;
    }).join('');

    root.innerHTML = `
      <div class="sl-shell" data-testid="celestial-ui-shell">
        <div class="sl-toast" data-testid="toast-banner" role="status" aria-live="polite" hidden></div>

        <!-- 1. Living Title & Dual-Profile Select Vista -->
        <section class="sl-screen sl-title-screen" data-screen="title" data-testid="title-screen" hidden>
          <header class="sl-title-header sl-glass">
            <div class="sl-title-kicker">
              ${iconSvg('icon-star-rank', 'sl-icon-sm')}
              <span>Starlight v2 Celestial Edition</span>
              ${iconSvg('icon-star-rank', 'sl-icon-sm')}
            </div>
            <h1 class="sl-title-heading">Pokémon: Starlight Island</h1>
            <p class="sl-title-sub">Choose your Voyager profile to enter the Starlight Archipelago</p>
          </header>

          <div class="sl-profile-grid">
            <button type="button" class="sl-profile-card" data-testid="profile-slot0" aria-pressed="true">
              <canvas class="sl-profile-preview" width="92" height="84" data-testid="profile-slot0-canvas" aria-hidden="true"></canvas>
              <div class="sl-profile-meta" data-testid="profile-slot0-meta"></div>
            </button>
            <button type="button" class="sl-profile-card" data-testid="profile-slot1" aria-pressed="false">
              <canvas class="sl-profile-preview" width="92" height="84" data-testid="profile-slot1-canvas" aria-hidden="true"></canvas>
              <div class="sl-profile-meta" data-testid="profile-slot1-meta"></div>
            </button>
          </div>

          <div class="sl-title-cta-row">
            <button type="button" class="sl-btn sl-btn-primary sl-enter-btn" data-testid="enter-world-btn">
              ${iconSvg('icon-starfall', 'sl-icon-md')}
              <span>Enter Starlight Island</span>
            </button>
          </div>
        </section>

        <!-- 2. Overworld Celestial Glass HUD -->
        <section class="sl-screen sl-overworld-screen" data-screen="overworld" data-testid="overworld-screen" hidden>
          <header class="sl-top-bar sl-glass">
            <div class="sl-biome-summary">
              <span data-testid="overworld-biome-icon">${iconSvg('icon-type-normal', 'sl-icon-lg')}</span>
              <div class="sl-biome-text">
                <div class="sl-biome-name" data-testid="overworld-biome-name">Starlight Village</div>
                <div class="sl-biome-sub" data-testid="overworld-biome-sub">Cozy Lantern Harbor</div>
              </div>
            </div>

            <div class="sl-vitality-strip">
              <div class="sl-vital-box" data-testid="overworld-party-lead">Lead</div>
              <div class="sl-vital-box">
                ${iconSvg('icon-bond', 'sl-icon-sm')}
                <span class="sl-num" data-testid="overworld-hp-val">100%</span>
              </div>
              <div class="sl-vital-box">
                ${iconSvg('icon-composure', 'sl-icon-sm')}
                <span class="sl-num" data-testid="overworld-comp-val">100%</span>
              </div>
            </div>

            <div class="sl-top-controls">
              <select class="sl-select sl-biome-select" data-testid="biome-select" aria-label="Travel to Biome">
                ${biomeOptionsHtml}
              </select>
              <div class="sl-encounter-group" role="group" aria-label="Quick Encounters">
                <button type="button" class="sl-btn" data-testid="encounter-wild" title="Wild Encounter">
                  ${iconSvg('icon-pokeball', 'sl-icon-sm')}
                  <span>Wild</span>
                </button>
                <button type="button" class="sl-btn" data-testid="encounter-rare" title="Rare Starfall Encounter">
                  ${iconSvg('icon-starfall', 'sl-icon-sm')}
                  <span>Rare</span>
                </button>
                <button type="button" class="sl-btn" data-testid="encounter-rival" title="Rival Challenge">
                  ${iconSvg('icon-crown', 'sl-icon-sm')}
                  <span>Rival</span>
                </button>
                <button type="button" class="sl-btn sl-btn-cyan" data-testid="encounter-shrine" title="Shrine Guardian">
                  ${iconSvg('icon-shrine', 'sl-icon-sm')}
                  <span>Shrine</span>
                </button>
              </div>
              <button type="button" class="sl-btn" data-testid="nav-briefing" aria-label="Tactical Readiness Briefing">
                ${iconSvg('icon-briefing', 'sl-icon-sm')}
                <span class="sl-num" data-testid="nav-briefing-score">100</span>
              </button>
              <button type="button" class="sl-btn" data-testid="settings-toggle" aria-expanded="false" aria-label="Display & Audio Settings">
                ${iconSvg('icon-settings', 'sl-icon-sm')}
              </button>
            </div>
          </header>

          <aside class="sl-settings-popover sl-glass" data-testid="settings-panel" hidden>
            <div class="sl-settings-header">
              <span>${iconSvg('icon-settings', 'sl-icon-sm')} Display &amp; Engine Settings</span>
              <button type="button" class="sl-btn" data-testid="settings-close" aria-label="Close Settings">Done</button>
            </div>
            <div class="sl-settings-row">
              <span>CRT Scanlines</span>
              <button type="button" class="sl-btn" data-testid="setting-crt" aria-pressed="false">
                ${iconSvg('icon-crt', 'sl-icon-sm')}
                <span>Off</span>
              </button>
            </div>
            <div class="sl-settings-row">
              <span>Reduced Motion</span>
              <button type="button" class="sl-btn" data-testid="setting-reduced-motion" aria-pressed="false">
                ${iconSvg('icon-motion', 'sl-icon-sm')}
                <span>Off</span>
              </button>
            </div>
            <div class="sl-settings-row">
              <span>Audio Synth</span>
              <button type="button" class="sl-btn" data-testid="setting-audio-mute" aria-pressed="false">
                ${iconSvg('icon-audio-on', 'sl-icon-sm')}
                <span>Active</span>
              </button>
            </div>
            <div class="sl-settings-row">
              <span>Touch D-Pad</span>
              <button type="button" class="sl-btn" data-testid="setting-touch-controls" aria-pressed="false">
                ${iconSvg('icon-waypoint', 'sl-icon-sm')}
                <span>Auto</span>
              </button>
            </div>
            <div class="sl-settings-row">
              <label for="sl-setting-renderer-select">Renderer</label>
              <select id="sl-setting-renderer-select" class="sl-select" data-testid="setting-renderer">
                <option value="auto">Auto (WebGL2 + Parity)</option>
                <option value="webgl2">WebGL2</option>
                <option value="canvas2d">Canvas2D Parity</option>
              </select>
            </div>
            <div class="sl-settings-meta sl-num" data-testid="engine-telemetry">Canvas2D • 60 FPS</div>
          </aside>

          <footer class="sl-overworld-footer">
            <div class="sl-dpad sl-glass" data-testid="touch-dpad" data-touch-active="false" role="group" aria-label="Movement Controls">
              <button type="button" class="sl-btn sl-dpad-btn sl-dpad-up" data-testid="dpad-up" aria-label="Move Up">${dpadChevronSvg('up')}</button>
              <button type="button" class="sl-btn sl-dpad-btn sl-dpad-left" data-testid="dpad-left" aria-label="Move Left">${dpadChevronSvg('left')}</button>
              <div class="sl-dpad-mid" aria-hidden="true">${iconSvg('icon-waypoint', 'sl-icon-sm')}</div>
              <button type="button" class="sl-btn sl-dpad-btn sl-dpad-right" data-testid="dpad-right" aria-label="Move Right">${dpadChevronSvg('right')}</button>
              <button type="button" class="sl-btn sl-dpad-btn sl-dpad-down" data-testid="dpad-down" aria-label="Move Down">${dpadChevronSvg('down')}</button>
            </div>

            <nav class="sl-bottom-dock sl-glass" aria-label="Handheld Navigation Dock">
              <button type="button" class="sl-btn" data-testid="nav-pokedex">
                ${iconSvg('icon-pokedex', 'sl-icon-sm')}
                <span>Pokédex</span>
              </button>
              <button type="button" class="sl-btn" data-testid="nav-badges">
                ${iconSvg('icon-badges', 'sl-icon-sm')}
                <span>28 Badges</span>
              </button>
              <button type="button" class="sl-btn" data-testid="nav-style">
                ${iconSvg('icon-style', 'sl-icon-sm')}
                <span>Style</span>
              </button>
              <button type="button" class="sl-btn sl-btn-cyan" data-testid="nav-skyhop">
                ${iconSvg('icon-skyhop', 'sl-icon-sm')}
                <span>Sky-Hop</span>
              </button>
              <button type="button" class="sl-btn" data-testid="save-btn">
                ${iconSvg('icon-save', 'sl-icon-sm')}
                <span>Save</span>
              </button>
              <button type="button" class="sl-btn sl-btn-primary sl-interact-btn" data-testid="interact-btn">
                ${iconSvg('icon-waypoint', 'sl-icon-sm')}
                <span>Explore</span>
              </button>
            </nav>
          </footer>
        </section>

        <!-- 3. Tactical Readiness Briefing Drawer -->
        <section class="sl-screen sl-briefing-screen" data-screen="briefing" data-testid="briefing-screen" hidden>
          <div class="sl-briefing-drawer sl-glass" data-testid="briefing-drawer" role="dialog" aria-modal="true" aria-label="Tactical Readiness Briefing">
            <div class="sl-briefing-head">
              <h2 class="sl-modal-title" style="font-size:16px;">
                ${iconSvg('icon-briefing', 'sl-icon-md')}
                <span>Tactical Readiness Briefing</span>
              </h2>
              <button type="button" class="sl-btn" data-testid="briefing-close">Close</button>
            </div>
            <div data-testid="briefing-content" style="display:flex; flex-direction:column; gap:10px;"></div>
          </div>
        </section>

        <!-- 4. Battle Theater Dock -->
        <section class="sl-screen sl-battle-screen" data-screen="battle" data-testid="battle-screen" hidden>
          <div class="sl-battle-top-cards">
            <div class="sl-combatant-card sl-glass" data-testid="battle-player-card">
              <div class="sl-combatant-head">
                <strong class="sl-combatant-name" data-testid="battle-player-name">Pikachu Lv.28</strong>
                <div class="sl-combatant-badges" data-testid="battle-player-types"></div>
              </div>
              <div class="sl-gauge-row">
                <span class="sl-gauge-label">Vitality</span>
                <div class="sl-bar-track"><div class="sl-bar-fill sl-bar-hp" data-testid="battle-player-hp-bar" style="--fill:1;"></div></div>
                <span class="sl-gauge-val sl-num" data-testid="battle-player-hp-val">100/100</span>
              </div>
              <div class="sl-gauge-row">
                <span class="sl-gauge-label">${iconSvg('icon-composure', 'sl-icon-sm')} Poise</span>
                <div class="sl-bar-track"><div class="sl-bar-fill sl-bar-composure" data-testid="battle-player-comp-bar" style="--fill:1;"></div></div>
                <span class="sl-gauge-val sl-num" data-testid="battle-player-comp-val">100%</span>
              </div>
              <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                <span class="sl-pill" data-testid="battle-player-bond">Bond 100</span>
                <span class="sl-pill" data-testid="battle-player-status" hidden></span>
              </div>
            </div>

            <div class="sl-combatant-card sl-glass" data-testid="battle-enemy-card">
              <div class="sl-combatant-head">
                <strong class="sl-combatant-name" data-testid="battle-enemy-name">Foe</strong>
                <div class="sl-combatant-badges">
                  <span class="sl-pill" data-testid="battle-enemy-tier">Wild</span>
                  <span class="sl-combatant-badges" data-testid="battle-enemy-types"></span>
                </div>
              </div>
              <div class="sl-gauge-row">
                <span class="sl-gauge-label">Vitality</span>
                <div class="sl-bar-track"><div class="sl-bar-fill sl-bar-hp" data-testid="battle-enemy-hp-bar" style="--fill:1;"></div></div>
                <span class="sl-gauge-val sl-num" data-testid="battle-enemy-hp-val">100/100</span>
              </div>
              <div class="sl-gauge-row">
                <span class="sl-gauge-label">${iconSvg('icon-composure', 'sl-icon-sm')} Poise</span>
                <div class="sl-bar-track"><div class="sl-bar-fill sl-bar-composure" data-testid="battle-enemy-comp-bar" style="--fill:1;"></div></div>
                <span class="sl-gauge-val sl-num" data-testid="battle-enemy-comp-val">100%</span>
              </div>
              <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                <span class="sl-pill" data-testid="battle-enemy-status" hidden></span>
              </div>
            </div>
          </div>

          <div class="sl-battle-bottom">
            <div class="sl-battle-message sl-glass" data-testid="battle-status-message">Preparing Starlight Arena...</div>
            <div class="sl-battle-dock sl-glass">
              <div class="sl-move-grid">
                ${[0, 1, 2, 3]
                  .map(
                    (idx) => `
                  <button type="button" class="sl-move-card" data-testid="battle-move-${idx}" data-type="normal">
                    <div class="sl-move-top">
                      <span>Move</span>
                      <span>${iconSvg('icon-type-normal', 'sl-icon-sm')}</span>
                    </div>
                    <div class="sl-move-meta sl-num">
                      <span>PWR 70</span>
                      <span>POISE -16</span>
                    </div>
                  </button>
                `,
                  )
                  .join('')}
              </div>
              <div class="sl-battle-actions">
                <button type="button" class="sl-btn sl-btn-cyan" data-testid="battle-starball">
                  ${iconSvg('icon-starball', 'sl-icon-sm')}
                  <span>Star Ball (0)</span>
                </button>
                <button type="button" class="sl-btn" data-testid="battle-potion">
                  ${iconSvg('icon-potion', 'sl-icon-sm')}
                  <span>Potion (0)</span>
                </button>
                <button type="button" class="sl-btn" data-testid="battle-offline-rig" aria-pressed="false">
                  ${iconSvg('icon-star-rank', 'sl-icon-sm')}
                  <span>Offline Rig</span>
                </button>
                <button type="button" class="sl-btn sl-btn-primary" data-testid="battle-evolve">
                  ${iconSvg('icon-starfall', 'sl-icon-sm')}
                  <span>Evolve</span>
                </button>
                <button type="button" class="sl-btn" data-testid="battle-flee" style="grid-column: 1 / -1;">
                  ${iconSvg('icon-waypoint', 'sl-icon-sm')}
                  <span>Flee / Return to Island</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 5. Sky-Hop HUD -->
        <section class="sl-screen sl-skyhop-screen" data-screen="skyhop" data-testid="skyhop-screen" hidden>
          <header class="sl-skyhop-topbar sl-glass">
            <div class="sl-skyhop-stat">
              <span class="sl-skyhop-stat-label">Score</span>
              <span class="sl-skyhop-stat-val sl-num" data-testid="skyhop-score">0</span>
            </div>
            <div class="sl-skyhop-stat">
              <span class="sl-skyhop-stat-label">Combo</span>
              <span class="sl-skyhop-stat-val sl-num" data-testid="skyhop-combo">0x</span>
            </div>
            <div class="sl-skyhop-stat">
              <span class="sl-skyhop-stat-label">Best</span>
              <span class="sl-skyhop-stat-val sl-num" data-testid="skyhop-highscore">0</span>
            </div>
            <div class="sl-skyhop-stat">
              <span class="sl-skyhop-stat-label">Shields</span>
              <div data-testid="skyhop-shields" style="display:flex; gap:4px; align-items:center;"></div>
            </div>
            <div class="sl-skyhop-stat">
              <span class="sl-skyhop-stat-label">Star Dash</span>
              <div class="sl-bar-track"><div class="sl-bar-fill sl-bar-dash" data-testid="skyhop-dash-bar" style="--fill:0.65;"></div></div>
            </div>
            <button type="button" class="sl-btn" data-testid="skyhop-exit">Return to Island</button>
          </header>

          <div class="sl-skyhop-banner sl-glass" data-testid="skyhop-banner">
            <h2 class="sl-modal-title" data-testid="skyhop-banner-title">Starlight Sky-Hop</h2>
            <p style="margin:0; font-size:13px; color:var(--sl-text-secondary);">Collect Star Shards, ride Aurora currents, and shatter hazards with Star Dash.</p>
          </div>

          <footer class="sl-skyhop-controls sl-glass">
            <button type="button" class="sl-btn sl-btn-primary" data-testid="skyhop-start">
              ${iconSvg('icon-skyhop', 'sl-icon-sm')}
              <span>Launch Flight</span>
            </button>
            <button type="button" class="sl-btn sl-btn-cyan" data-testid="skyhop-flap">
              ${iconSvg('icon-type-flying', 'sl-icon-sm')}
              <span>Flap / Glide</span>
            </button>
            <button type="button" class="sl-btn" data-testid="skyhop-dash">
              ${iconSvg('icon-starfall', 'sl-icon-sm')}
              <span>Star Dash</span>
            </button>
          </footer>
        </section>

        <!-- 6. 1,025 Collector Holographic Pokédex Modal -->
        <section class="sl-screen sl-modal-screen" data-screen="pokedex" data-testid="pokedex-screen" hidden></section>

        <!-- 7. 28 Elemental & Mastery Badges Showcase Modal -->
        <section class="sl-screen sl-modal-screen" data-screen="badges" data-testid="badges-screen" hidden></section>

        <!-- 8. Style Studio Dressing Room Modal -->
        <section class="sl-screen sl-modal-screen" data-screen="style-studio" data-testid="style-studio-screen" hidden></section>
      </div>
    `;

    this.cacheReferences(root);
    this.bindEvents();

    if (this.pokedexScreen) this.pokedexView.mount(this.pokedexScreen, callbacks);
    if (this.badgesScreen) this.badgesShowcase.mount(this.badgesScreen, callbacks);
    if (this.styleScreen) this.styleStudio.mount(this.styleScreen, callbacks);
  }

  private cacheReferences(root: HTMLElement): void {
    const q = <T extends HTMLElement = HTMLElement>(sel: string): T | null =>
      root.querySelector(sel) as T | null;

    this.toastEl = q('[data-testid="toast-banner"]');

    this.titleScreen = q('[data-screen="title"]');
    this.overworldScreen = q('[data-screen="overworld"]');
    this.battleScreen = q('[data-screen="battle"]');
    this.skyhopScreen = q('[data-screen="skyhop"]');
    this.briefingScreen = q('[data-screen="briefing"]');
    this.pokedexScreen = q('[data-screen="pokedex"]');
    this.badgesScreen = q('[data-screen="badges"]');
    this.styleScreen = q('[data-screen="style-studio"]');

    this.slot0Card = q('[data-testid="profile-slot0"]');
    this.slot1Card = q('[data-testid="profile-slot1"]');
    this.slot0Canvas = q('[data-testid="profile-slot0-canvas"]');
    this.slot1Canvas = q('[data-testid="profile-slot1-canvas"]');
    this.slot0MetaEl = q('[data-testid="profile-slot0-meta"]');
    this.slot1MetaEl = q('[data-testid="profile-slot1-meta"]');
    this.enterWorldBtn = q('[data-testid="enter-world-btn"]');

    this.biomeIconEl = q('[data-testid="overworld-biome-icon"]');
    this.biomeNameEl = q('[data-testid="overworld-biome-name"]');
    this.biomeSubEl = q('[data-testid="overworld-biome-sub"]');
    this.partyLeadPillEl = q('[data-testid="overworld-party-lead"]');
    this.partyHpValEl = q('[data-testid="overworld-hp-val"]');
    this.partyCompValEl = q('[data-testid="overworld-comp-val"]');
    this.briefingBtn = q('[data-testid="nav-briefing"]');
    this.briefingScorePillEl = q('[data-testid="nav-briefing-score"]');
    this.biomeSelect = q('[data-testid="biome-select"]');
    this.settingsToggleBtn = q('[data-testid="settings-toggle"]');
    this.settingsPanel = q('[data-testid="settings-panel"]');
    this.crtBtn = q('[data-testid="setting-crt"]');
    this.motionBtn = q('[data-testid="setting-reduced-motion"]');
    this.audioBtn = q('[data-testid="setting-audio-mute"]');
    this.touchBtn = q('[data-testid="setting-touch-controls"]');
    this.rendererSelect = q('[data-testid="setting-renderer"]');
    this.engineTelemetryEl = q('[data-testid="engine-telemetry"]');
    this.interactBtn = q('[data-testid="interact-btn"]');
    this.dpadContainer = q('[data-testid="touch-dpad"]');

    this.briefingDrawerContent = q('[data-testid="briefing-content"]');

    this.enemyNameEl = q('[data-testid="battle-enemy-name"]');
    this.enemyTierPillEl = q('[data-testid="battle-enemy-tier"]');
    this.enemyTypesEl = q('[data-testid="battle-enemy-types"]');
    this.enemyHpBarEl = q('[data-testid="battle-enemy-hp-bar"]');
    this.enemyHpValEl = q('[data-testid="battle-enemy-hp-val"]');
    this.enemyCompBarEl = q('[data-testid="battle-enemy-comp-bar"]');
    this.enemyCompValEl = q('[data-testid="battle-enemy-comp-val"]');
    this.enemyStatusEl = q('[data-testid="battle-enemy-status"]');

    this.playerNameEl = q('[data-testid="battle-player-name"]');
    this.playerBondPillEl = q('[data-testid="battle-player-bond"]');
    this.playerTypesEl = q('[data-testid="battle-player-types"]');
    this.playerHpBarEl = q('[data-testid="battle-player-hp-bar"]');
    this.playerHpValEl = q('[data-testid="battle-player-hp-val"]');
    this.playerCompBarEl = q('[data-testid="battle-player-comp-bar"]');
    this.playerCompValEl = q('[data-testid="battle-player-comp-val"]');
    this.playerStatusEl = q('[data-testid="battle-player-status"]');

    this.battleMsgEl = q('[data-testid="battle-status-message"]');
    this.moveButtons = [0, 1, 2, 3]
      .map((i) => q<HTMLButtonElement>(`[data-testid="battle-move-${i}"]`))
      .filter((b): b is HTMLButtonElement => Boolean(b));
    this.starBallBtn = q('[data-testid="battle-starball"]');
    this.potionBtn = q('[data-testid="battle-potion"]');
    this.offlineRigBtn = q('[data-testid="battle-offline-rig"]');
    this.evolveBtn = q('[data-testid="battle-evolve"]');
    this.fleeBtn = q('[data-testid="battle-flee"]');

    this.skyScoreEl = q('[data-testid="skyhop-score"]');
    this.skyComboEl = q('[data-testid="skyhop-combo"]');
    this.skyHighEl = q('[data-testid="skyhop-highscore"]');
    this.skyShieldsEl = q('[data-testid="skyhop-shields"]');
    this.skyDashBarEl = q('[data-testid="skyhop-dash-bar"]');
    this.skyBannerEl = q('[data-testid="skyhop-banner"]');
    this.skyBannerTitleEl = q('[data-testid="skyhop-banner-title"]');
    this.skyStartBtn = q('[data-testid="skyhop-start"]');
    this.skyFlapBtn = q('[data-testid="skyhop-flap"]');
    this.skyDashBtn = q('[data-testid="skyhop-dash"]');
  }

  private bindEvents(): void {
    const root = this.root;
    if (!root) return;

    this.slot0Card?.addEventListener('click', () => this.callbacks?.onSelectProfile('slot0'));
    this.slot1Card?.addEventListener('click', () => this.callbacks?.onSelectProfile('slot1'));
    this.enterWorldBtn?.addEventListener('click', () => {
      const slot = this.lastSnapshot?.save.activeSlot ?? 'slot0';
      this.callbacks?.onEnterWorld(slot);
    });

    this.biomeSelect?.addEventListener('change', () => {
      if (this.biomeSelect) {
        this.callbacks?.onTravelBiome(this.biomeSelect.value as BiomeId);
      }
    });

    const encounterMap: Array<[string, EncounterTier]> = [
      ['[data-testid="encounter-wild"]', 'wild'],
      ['[data-testid="encounter-rare"]', 'rare'],
      ['[data-testid="encounter-rival"]', 'rival'],
      ['[data-testid="encounter-shrine"]', 'shrine'],
    ];
    for (const [sel, tier] of encounterMap) {
      root.querySelector(sel)?.addEventListener('click', () => {
        this.settingsOpen = false;
        this.callbacks?.onTriggerEncounter(tier);
      });
    }

    this.briefingBtn?.addEventListener('click', () => {
      const next: ActiveScreen = this.lastSnapshot?.screen === 'briefing' ? 'overworld' : 'briefing';
      this.callbacks?.onNavigateScreen(next);
    });
    root.querySelector('[data-testid="briefing-close"]')?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('overworld');
    });

    this.settingsToggleBtn?.addEventListener('click', () => {
      this.settingsOpen = !this.settingsOpen;
      this.applySettingsDrawerState();
    });
    root.querySelector('[data-testid="settings-close"]')?.addEventListener('click', () => {
      this.settingsOpen = false;
      this.applySettingsDrawerState();
    });

    this.crtBtn?.addEventListener('click', () => {
      const cur = Boolean(this.lastSnapshot?.save.settings.crtMode);
      this.callbacks?.onUpdateSettings({ crtMode: !cur });
    });
    this.motionBtn?.addEventListener('click', () => {
      const cur = Boolean(this.lastSnapshot?.save.settings.reducedMotion);
      this.callbacks?.onUpdateSettings({ reducedMotion: !cur });
    });
    this.audioBtn?.addEventListener('click', () => {
      const cur = Boolean(this.lastSnapshot?.save.settings.audioMuted);
      this.callbacks?.onUpdateSettings({ audioMuted: !cur });
    });
    this.touchBtn?.addEventListener('click', () => {
      const cur = Boolean(this.lastSnapshot?.save.settings.showTouchControls);
      this.callbacks?.onUpdateSettings({ showTouchControls: !cur });
    });
    this.rendererSelect?.addEventListener('change', () => {
      if (this.rendererSelect) {
        this.callbacks?.onUpdateSettings({
          rendererOverride: this.rendererSelect.value as RendererMode,
        });
      }
    });

    root.querySelector('[data-testid="nav-pokedex"]')?.addEventListener('click', () => {
      this.settingsOpen = false;
      this.callbacks?.onNavigateScreen('pokedex');
    });
    root.querySelector('[data-testid="nav-badges"]')?.addEventListener('click', () => {
      this.settingsOpen = false;
      this.callbacks?.onNavigateScreen('badges');
    });
    root.querySelector('[data-testid="nav-style"]')?.addEventListener('click', () => {
      this.settingsOpen = false;
      this.callbacks?.onNavigateScreen('style-studio');
    });
    root.querySelector('[data-testid="nav-skyhop"]')?.addEventListener('click', () => {
      this.settingsOpen = false;
      this.callbacks?.onNavigateScreen('skyhop');
    });
    root.querySelector('[data-testid="save-btn"]')?.addEventListener('click', () => {
      this.callbacks?.onForceSave();
    });
    this.interactBtn?.addEventListener('click', () => {
      this.callbacks?.onInteractNearby();
    });

    // Touch D-pad bindings
    const dpadDirs: Array<[string, number, number]> = [
      ['[data-testid="dpad-up"]', 0, -1],
      ['[data-testid="dpad-down"]', 0, 1],
      ['[data-testid="dpad-left"]', -1, 0],
      ['[data-testid="dpad-right"]', 1, 0],
    ];
    const stopRepeat = () => {
      if (this.dpadRepeatTimer !== null) {
        clearInterval(this.dpadRepeatTimer);
        this.dpadRepeatTimer = null;
      }
    };
    for (const [sel, dx, dy] of dpadDirs) {
      const btn = root.querySelector(sel) as HTMLButtonElement | null;
      if (!btn) continue;
      btn.addEventListener('click', () => this.callbacks?.onMoveInput(dx, dy));
      btn.addEventListener('pointerdown', () => {
        stopRepeat();
        this.dpadRepeatTimer = setInterval(() => this.callbacks?.onMoveInput(dx, dy), 120);
      });
      btn.addEventListener('pointerup', stopRepeat);
      btn.addEventListener('pointercancel', stopRepeat);
      btn.addEventListener('pointerleave', stopRepeat);
    }

    // Battle commands
    this.moveButtons.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        const move = this.lastSnapshot?.availableMoves[idx];
        if (move) {
          this.callbacks?.onBattleMove(move.id);
        }
      });
    });
    this.starBallBtn?.addEventListener('click', () => this.callbacks?.onBattleThrowStarBall());
    this.potionBtn?.addEventListener('click', () => this.callbacks?.onBattleUsePotion());
    this.offlineRigBtn?.addEventListener('click', () => this.callbacks?.onBattleToggleOfflineRig());
    this.evolveBtn?.addEventListener('click', () => this.callbacks?.onBattleTriggerEvolution());
    this.fleeBtn?.addEventListener('click', () => this.callbacks?.onBattleFlee());

    // Sky-Hop controls
    this.skyStartBtn?.addEventListener('click', () => this.callbacks?.onStartSkyHop());
    this.skyFlapBtn?.addEventListener('click', () => this.callbacks?.onSkyHopFlap());
    this.skyDashBtn?.addEventListener('click', () => this.callbacks?.onSkyHopStarDash());
    root.querySelector('[data-testid="skyhop-exit"]')?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('overworld');
    });
  }

  private applySettingsDrawerState(): void {
    setHidden(this.settingsPanel, !this.settingsOpen);
    this.settingsToggleBtn?.setAttribute('aria-expanded', String(this.settingsOpen));
  }

  private setMemoText(key: string, el: HTMLElement | null, value: string): void {
    if (!el) return;
    if (this.memo.get(key) === value) return;
    this.memo.set(key, value);
    el.textContent = value;
  }

  private setMemoHtml(key: string, el: HTMLElement | null, html: string): void {
    if (!el) return;
    if (this.memo.get(key) === html) return;
    this.memo.set(key, html);
    el.innerHTML = html;
  }

  sync(snapshot: UIRenderSnapshot): void {
    if (!this.root) return;
    this.lastSnapshot = snapshot;

    const screen = snapshot.screen;
    const reducedMotion = Boolean(snapshot.save.settings.reducedMotion || snapshot.capabilities.reducedMotion);
    const crtActive = Boolean(snapshot.save.settings.crtMode || snapshot.capabilities.crtMode);

    if (this.lastReducedMotion !== reducedMotion) {
      this.lastReducedMotion = reducedMotion;
      this.root.dataset.reducedMotion = String(reducedMotion);
      if (this.root.ownerDocument?.documentElement) {
        this.root.ownerDocument.documentElement.dataset.reducedMotion = String(reducedMotion);
      }
    }

    if (this.lastCrtMode !== crtActive) {
      this.lastCrtMode = crtActive;
      this.crtOverlayEl?.classList.toggle('is-active', crtActive);
    }

    if (this.lastScreen !== screen) {
      this.lastScreen = screen;
      setHidden(this.titleScreen, screen !== 'title');
      setHidden(this.overworldScreen, screen !== 'overworld' && screen !== 'briefing');
      setHidden(this.briefingScreen, screen !== 'briefing');
      setHidden(this.battleScreen, screen !== 'battle');
      setHidden(this.skyhopScreen, screen !== 'skyhop');
      setHidden(this.pokedexScreen, screen !== 'pokedex');
      setHidden(this.badgesScreen, screen !== 'badges');
      setHidden(this.styleScreen, screen !== 'style-studio');
      if (screen !== 'overworld') {
        this.settingsOpen = false;
        this.applySettingsDrawerState();
      }
    }

    // Toast notification (zero CLS fixed pill)
    const cleanToast = snapshot.toastMessage ? sanitizeNoEmoji(snapshot.toastMessage) : '';
    if (cleanToast) {
      setHidden(this.toastEl, false);
      this.toastEl?.classList.add('is-visible');
      this.setMemoText('toast', this.toastEl, cleanToast);
    } else if (this.memo.get('toast') !== '') {
      this.memo.set('toast', '');
      this.toastEl?.classList.remove('is-visible');
      setHidden(this.toastEl, true);
    }

    if (screen === 'title') {
      this.syncTitle(snapshot, reducedMotion);
    } else if (screen === 'overworld' || screen === 'briefing') {
      this.syncOverworld(snapshot, reducedMotion, crtActive);
      if (screen === 'briefing') {
        this.syncBriefing(snapshot);
      }
    } else if (screen === 'battle') {
      this.syncBattle(snapshot);
    } else if (screen === 'skyhop') {
      this.syncSkyHop(snapshot);
    }

    const nowSec = snapshot.overworld.elapsedSeconds || (typeof performance !== 'undefined' ? performance.now() * 0.001 : 0);

    // Always keep modal views synced cleanly when active
    if (screen === 'pokedex') {
      this.pokedexView.sync(
        snapshot.profile,
        snapshot.selectedPokedexId,
        snapshot.cryWaveform,
        reducedMotion,
        true,
        nowSec,
      );
    } else if (screen === 'badges') {
      this.badgesShowcase.sync(snapshot.profile, snapshot.badges, true);
    } else if (screen === 'style-studio') {
      const styleChanged =
        this.memo.get('style-sig') !==
        `${snapshot.profile.style.outfit}|${snapshot.profile.style.cape}|${snapshot.profile.style.headgear}|${snapshot.profile.style.aura}|${snapshot.profile.slotId}`;
      if (styleChanged || nowSec - this.lastStyleStageTs >= 0.05) {
        this.memo.set(
          'style-sig',
          `${snapshot.profile.style.outfit}|${snapshot.profile.style.cape}|${snapshot.profile.style.headgear}|${snapshot.profile.style.aura}|${snapshot.profile.slotId}`,
        );
        this.lastStyleStageTs = nowSec;
        this.styleStudio.sync(snapshot.profile, reducedMotion, true, nowSec);
      }
    }
  }

  private syncTitle(snapshot: UIRenderSnapshot, reducedMotion: boolean): void {
    const activeSlot = snapshot.save.activeSlot;
    this.slot0Card?.classList.toggle('is-selected', activeSlot === 'slot0');
    this.slot1Card?.classList.toggle('is-selected', activeSlot === 'slot1');
    this.slot0Card?.setAttribute('aria-pressed', String(activeSlot === 'slot0'));
    this.slot1Card?.setAttribute('aria-pressed', String(activeSlot === 'slot1'));

    const buildMetaHtml = (p: TrainerProfile): string => {
      const caughtCount = Object.values(p.pokedex).filter((e) => e.caught).length;
      const lead = p.party[0];
      const leadSp = getSpecies(lead?.speciesId ?? 25);
      return `
        <div class="sl-profile-name-row">
          <span class="sl-profile-name">${safeText(p.name)}</span>
          <span class="sl-pill sl-num">${p.slotId === activeSlot ? 'Active' : 'Ready'}</span>
        </div>
        <div class="sl-profile-title">${safeText(p.title)}</div>
        <div class="sl-profile-stats sl-num">
          <span class="sl-profile-stat">${iconSvg('icon-badges', 'sl-icon-sm')} ${p.badges.length} / 28 Badges</span>
          <span class="sl-profile-stat">${iconSvg('icon-pokedex', 'sl-icon-sm')} ${caughtCount} / ${TOTAL_SPECIES_COUNT}</span>
          <span class="sl-profile-stat">${iconSvg(typeIconId(leadSp.primaryType), 'sl-icon-sm')} ${safeText(leadSp.name)} Lv.${lead?.level ?? 1}</span>
        </div>
      `;
    };

    this.setMemoHtml('slot0-meta', this.slot0MetaEl, buildMetaHtml(snapshot.save.profiles.slot0));
    this.setMemoHtml('slot1-meta', this.slot1MetaEl, buildMetaHtml(snapshot.save.profiles.slot1));

    const nowSec = typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
    const styleKey = `${snapshot.save.profiles.slot0.style.outfit}|${snapshot.save.profiles.slot1.style.outfit}|${activeSlot}`;
    if (this.memo.get('title-preview-key') !== styleKey || nowSec - this.lastTitlePreviewTs >= 0.065) {
      this.memo.set('title-preview-key', styleKey);
      this.lastTitlePreviewTs = nowSec;
      if (this.slot0Canvas) {
        renderProfileCardPreview(this.slot0Canvas, snapshot.save.profiles.slot0, this.rigSynthesizer, nowSec, reducedMotion);
      }
      if (this.slot1Canvas) {
        renderProfileCardPreview(this.slot1Canvas, snapshot.save.profiles.slot1, this.rigSynthesizer, nowSec, reducedMotion);
      }
    }
  }

  private syncOverworld(snapshot: UIRenderSnapshot, reducedMotion: boolean, crtActive: boolean): void {
    const biome = snapshot.overworld.biome;
    this.setMemoHtml('ow-biome-icon', this.biomeIconEl, iconSvg(typeIconId(biome.elementalType), 'sl-icon-lg'));
    this.setMemoText('ow-biome-name', this.biomeNameEl, sanitizeNoEmoji(biome.name));
    this.setMemoText('ow-biome-sub', this.biomeSubEl, sanitizeNoEmoji(biome.subtitle));

    const lead = snapshot.profile.party[0];
    const leadSp = getSpecies(lead?.speciesId ?? 25);
    this.setMemoHtml(
      'ow-lead',
      this.partyLeadPillEl,
      `${iconSvg(typeIconId(leadSp.primaryType), 'sl-icon-sm')} <span>${safeText(leadSp.name)} Lv.${lead?.level ?? 1}</span>`,
    );
    this.setMemoText('ow-hp', this.partyHpValEl, `${snapshot.briefing.partyHpPercent}%`);
    this.setMemoText('ow-comp', this.partyCompValEl, `${snapshot.briefing.avgComposure}%`);
    this.setMemoText(
      'ow-brief-score',
      this.briefingScorePillEl,
      `${snapshot.briefing.readinessScore} ${snapshot.briefing.readinessGrade}`,
    );

    if (this.biomeSelect && this.root?.ownerDocument?.activeElement !== this.biomeSelect) {
      if (this.biomeSelect.value !== biome.id) {
        this.biomeSelect.value = biome.id;
      }
    }

    // Settings controls sync
    this.setMemoHtml(
      'set-crt',
      this.crtBtn,
      `${iconSvg('icon-crt', 'sl-icon-sm')} <span>${crtActive ? 'On' : 'Off'}</span>`,
    );
    this.crtBtn?.setAttribute('aria-pressed', String(crtActive));

    this.setMemoHtml(
      'set-motion',
      this.motionBtn,
      `${iconSvg('icon-motion', 'sl-icon-sm')} <span>${reducedMotion ? 'On' : 'Off'}</span>`,
    );
    this.motionBtn?.setAttribute('aria-pressed', String(reducedMotion));

    const muted = snapshot.save.settings.audioMuted;
    this.setMemoHtml(
      'set-audio',
      this.audioBtn,
      `${iconSvg(muted ? 'icon-audio-off' : 'icon-audio-on', 'sl-icon-sm')} <span>${muted ? 'Muted' : 'Active'}</span>`,
    );
    this.audioBtn?.setAttribute('aria-pressed', String(muted));

    const touchOn = snapshot.save.settings.showTouchControls;
    this.setMemoHtml(
      'set-touch',
      this.touchBtn,
      `${iconSvg('icon-waypoint', 'sl-icon-sm')} <span>${touchOn ? 'On' : 'Auto'}</span>`,
    );
    this.touchBtn?.setAttribute('aria-pressed', String(touchOn));
    this.dpadContainer?.setAttribute('data-touch-active', String(touchOn));

    if (this.rendererSelect && this.root?.ownerDocument?.activeElement !== this.rendererSelect) {
      if (this.rendererSelect.value !== snapshot.save.settings.rendererOverride) {
        this.rendererSelect.value = snapshot.save.settings.rendererOverride;
      }
    }

    const backendLabel = snapshot.capabilities.kind === 'webgl2' ? 'WebGL2' : 'Canvas2D';
    this.setMemoText(
      'engine-telem',
      this.engineTelemetryEl,
      `${backendLabel} • ${Math.round(snapshot.frameStats.fps)} FPS • ${snapshot.frameStats.activeLights} Lights`,
    );

    // Interact CTA updates seamlessly to nearby Shrine / Chest / Fountain / Signpost / Starfall / NPC
    const nearby = snapshot.overworld.nearbyInteraction;
    let interactIcon: IconId = 'icon-waypoint';
    let interactLabel = 'Explore';
    if (nearby) {
      if ('kind' in nearby) {
        interactIcon = LANDMARK_ICON_MAP[nearby.kind] ?? 'icon-waypoint';
        interactLabel = sanitizeNoEmoji(nearby.label);
      } else {
        interactIcon = nearby.role === 'rival' ? 'icon-crown' : 'icon-waypoint';
        interactLabel = `Talk: ${sanitizeNoEmoji(nearby.name)}`;
      }
    }
    this.setMemoHtml(
      'ow-interact',
      this.interactBtn,
      `${iconSvg(interactIcon, 'sl-icon-sm')} <span>${safeText(interactLabel)}</span>`,
    );
  }

  private syncBriefing(snapshot: UIRenderSnapshot): void {
    const b = snapshot.briefing;
    const key = [
      b.biomeId,
      b.readinessScore,
      b.readinessGrade,
      b.partyHpPercent,
      b.avgComposure,
      b.guardianCleared,
      b.starBallsReady,
      b.potionsReady,
      b.wayfindingLabel,
      b.alerts.map((a) => `${a.severity}:${a.iconId}:${a.text}`).join('|'),
    ].join('~');

    if (this.memo.get('briefing-html') === key || !this.briefingDrawerContent) return;
    this.memo.set('briefing-html', key);

    const counterHtml = b.recommendedTypes
      .map(
        (t) =>
          `<span class="sl-pill sl-type-pill" data-type="${t}">${iconSvg(typeIconId(t), 'sl-icon-sm')} ${safeText(t.toUpperCase())}</span>`,
      )
      .join('');

    const alertsHtml = b.alerts
      .map(
        (a) => `
        <div class="sl-alert-item" data-severity="${a.severity}">
          ${iconSvg(a.iconId, 'sl-icon-sm')}
          <span>${safeText(a.text)}</span>
        </div>
      `,
      )
      .join('');

    this.briefingDrawerContent.innerHTML = `
      <div class="sl-briefing-score-box">
        <div class="sl-readiness-badge" data-grade="${b.readinessGrade}" data-testid="briefing-score">
          <span class="sl-readiness-val sl-num">${b.readinessScore}</span>
          <span class="sl-readiness-grade">${b.readinessGrade}</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; min-width:0;">
          <div style="display:flex; align-items:center; gap:6px;">
            ${iconSvg(typeIconId(b.biomeType), 'sl-icon-sm')}
            <strong>${safeText(b.biomeName)}</strong>
          </div>
          <div style="font-size:12px; color:var(--sl-text-secondary);">
            Guardian: <strong>${safeText(b.guardianSpecies.name)}</strong> (${b.guardianCleared ? 'Shrine Cleared' : 'Active Challenge'})
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">${counterHtml}</div>
        </div>
      </div>

      <div class="sl-briefing-kpis sl-num">
        <div class="sl-vital-box">${iconSvg('icon-bond', 'sl-icon-sm')} Vitality: ${b.partyHpPercent}%</div>
        <div class="sl-vital-box">${iconSvg('icon-composure', 'sl-icon-sm')} Poise: ${b.avgComposure}%</div>
        <div class="sl-vital-box">${iconSvg('icon-starball', 'sl-icon-sm')} Star Balls: ${b.starBallsReady}</div>
        <div class="sl-vital-box">${iconSvg('icon-potion', 'sl-icon-sm')} Potions: ${b.potionsReady}</div>
      </div>

      <div class="sl-vital-box">
        ${iconSvg('icon-waypoint', 'sl-icon-sm')}
        <span>Wayfinding: <strong>${safeText(b.wayfindingLabel)}</strong></span>
      </div>

      <div class="sl-alert-list">${alertsHtml}</div>
    `;
  }

  private syncBattle(snapshot: UIRenderSnapshot): void {
    const battle = snapshot.battle;
    const player = battle.player;
    const enemy = battle.enemy;
    const commandReady = battle.phase === 'command';

    // Enemy card
    this.setMemoText(
      'b-e-name',
      this.enemyNameEl,
      `${sanitizeNoEmoji(enemy.species.name)} Lv.${enemy.member.level}`,
    );
    const tierLabel =
      battle.tier === 'shrine'
        ? 'Shrine Guardian'
        : battle.tier === 'rival'
          ? 'Rival'
          : battle.tier === 'rare'
            ? 'Rare Starfall'
            : 'Wild';
    this.setMemoText('b-e-tier', this.enemyTierPillEl, tierLabel);
    this.setMemoHtml(
      'b-e-types',
      this.enemyTypesEl,
      [enemy.species.primaryType, enemy.species.secondaryType]
        .filter((t): t is NonNullable<typeof t> => Boolean(t))
        .map((t) => iconSvg(typeIconId(t), 'sl-icon-sm'))
        .join(''),
    );
    const eHpRatio = Math.max(0, Math.min(1, enemy.member.hp / Math.max(1, enemy.member.maxHp)));
    if (this.enemyHpBarEl) {
      this.enemyHpBarEl.style.setProperty('--fill', String(eHpRatio));
      this.enemyHpBarEl.setAttribute('data-low', String(eHpRatio <= 0.28));
    }
    this.setMemoText('b-e-hp', this.enemyHpValEl, `${enemy.member.hp}/${enemy.member.maxHp}`);

    const eCompRatio = Math.max(
      0,
      Math.min(1, enemy.member.composure / Math.max(1, enemy.member.maxComposure)),
    );
    if (this.enemyCompBarEl) {
      this.enemyCompBarEl.style.setProperty('--fill', String(eCompRatio));
    }
    this.setMemoText(
      'b-e-comp',
      this.enemyCompValEl,
      enemy.member.composure <= 0 ? 'BROKEN' : `${Math.round(eCompRatio * 100)}%`,
    );
    if (enemy.status !== 'none') {
      setHidden(this.enemyStatusEl, false);
      this.setMemoHtml(
        'b-e-status',
        this.enemyStatusEl,
        `${iconSvg(STATUS_ICON_MAP[enemy.status], 'sl-icon-sm')} <span>${enemy.status.toUpperCase()}</span>`,
      );
    } else {
      setHidden(this.enemyStatusEl, true);
    }

    // Player card
    this.setMemoText(
      'b-p-name',
      this.playerNameEl,
      `${sanitizeNoEmoji(player.member.nickname ?? player.species.name)} Lv.${player.member.level}`,
    );
    this.setMemoHtml(
      'b-p-types',
      this.playerTypesEl,
      [player.species.primaryType, player.species.secondaryType]
        .filter((t): t is NonNullable<typeof t> => Boolean(t))
        .map((t) => iconSvg(typeIconId(t), 'sl-icon-sm'))
        .join(''),
    );
    const pHpRatio = Math.max(0, Math.min(1, player.member.hp / Math.max(1, player.member.maxHp)));
    if (this.playerHpBarEl) {
      this.playerHpBarEl.style.setProperty('--fill', String(pHpRatio));
      this.playerHpBarEl.setAttribute('data-low', String(pHpRatio <= 0.28));
    }
    this.setMemoText('b-p-hp', this.playerHpValEl, `${player.member.hp}/${player.member.maxHp}`);

    const pCompRatio = Math.max(
      0,
      Math.min(1, player.member.composure / Math.max(1, player.member.maxComposure)),
    );
    if (this.playerCompBarEl) {
      this.playerCompBarEl.style.setProperty('--fill', String(pCompRatio));
    }
    this.setMemoText(
      'b-p-comp',
      this.playerCompValEl,
      player.member.composure <= 0 ? 'BROKEN' : `${Math.round(pCompRatio * 100)}%`,
    );
    this.setMemoHtml(
      'b-p-bond',
      this.playerBondPillEl,
      `${iconSvg('icon-bond', 'sl-icon-sm')} <span class="sl-num">Bond ${player.member.bond}</span> • ${iconSvg('icon-star-rank', 'sl-icon-sm')} <span class="sl-num">${player.member.starRank}</span>`,
    );
    if (player.status !== 'none') {
      setHidden(this.playerStatusEl, false);
      this.setMemoHtml(
        'b-p-status',
        this.playerStatusEl,
        `${iconSvg(STATUS_ICON_MAP[player.status], 'sl-icon-sm')} <span>${player.status.toUpperCase()}</span>`,
      );
    } else {
      setHidden(this.playerStatusEl, true);
    }

    this.setMemoText('b-msg', this.battleMsgEl, sanitizeNoEmoji(battle.statusMessage));

    // 4 Elemental Move Cards
    const moves = snapshot.availableMoves;
    this.moveButtons.forEach((btn, idx) => {
      const m = moves[idx];
      if (!m) {
        btn.disabled = true;
        btn.style.visibility = 'hidden';
        return;
      }
      btn.style.visibility = 'visible';
      btn.disabled = !commandReady;
      if (btn.getAttribute('data-type') !== m.type) {
        btn.setAttribute('data-type', m.type);
      }
      const moveHtml = `
        <div class="sl-move-top">
          <span>${safeText(m.name)}</span>
          ${iconSvg(typeIconId(m.type), 'sl-icon-sm')}
        </div>
        <div class="sl-move-meta sl-num">
          <span>${m.power > 0 ? `PWR ${m.power}` : 'STATUS'}</span>
          <span>POISE ${m.composureShift >= 0 ? `+${m.composureShift}` : m.composureShift}</span>
        </div>
      `;
      this.setMemoHtml(`b-move-${idx}`, btn, moveHtml);
    });

    const inv = snapshot.profile.inventory;
    const totalBalls = inv.starBalls + inv.pokeBalls;
    const totalPotions = inv.potions + inv.superPotions;

    if (this.starBallBtn) {
      this.starBallBtn.disabled = !commandReady || !battle.canCapture || totalBalls <= 0;
      this.setMemoHtml(
        'b-starball',
        this.starBallBtn,
        `${iconSvg('icon-starball', 'sl-icon-sm')} <span>Star Ball (${totalBalls})</span>`,
      );
    }
    if (this.potionBtn) {
      this.potionBtn.disabled = !commandReady || totalPotions <= 0;
      this.setMemoHtml(
        'b-potion',
        this.potionBtn,
        `${iconSvg('icon-potion', 'sl-icon-sm')} <span>Potion (${totalPotions})</span>`,
      );
    }
    if (this.offlineRigBtn) {
      this.offlineRigBtn.setAttribute('aria-pressed', String(battle.forceOfflineRig));
      this.offlineRigBtn.classList.toggle('is-active', battle.forceOfflineRig);
    }
    if (this.evolveBtn) {
      const canEvolve = Boolean(battle.evolutionTarget || player.species.evolvesTo);
      this.evolveBtn.disabled = !canEvolve || (!commandReady && battle.phase !== 'evolving');
      const targetName = battle.evolutionTarget?.name ?? (player.species.evolvesTo ? getSpecies(player.species.evolvesTo).name : 'Max Form');
      this.setMemoHtml(
        'b-evolve',
        this.evolveBtn,
        `${iconSvg('icon-starfall', 'sl-icon-sm')} <span>${canEvolve ? `Evolve: ${safeText(targetName)}` : 'Peak Form'}</span>`,
      );
    }
    if (this.fleeBtn) {
      const doneText = battle.phase === 'victory' || battle.phase === 'defeat' ? 'Return to Island' : 'Flee / Return';
      this.setMemoHtml(
        'b-flee',
        this.fleeBtn,
        `${iconSvg('icon-waypoint', 'sl-icon-sm')} <span>${doneText}</span>`,
      );
    }
  }

  private syncSkyHop(snapshot: UIRenderSnapshot): void {
    const sh = snapshot.skyhop;
    this.setMemoText('sh-score', this.skyScoreEl, String(sh.score));
    this.setMemoText('sh-combo', this.skyComboEl, `${sh.combo}x`);
    this.setMemoText('sh-high', this.skyHighEl, String(sh.highScore));

    const shieldsHtml = Array.from({ length: 3 }, (_, i) => {
      const active = i < sh.shields;
      return `<span style="opacity:${active ? 1 : 0.25};">${iconSvg('icon-composure', 'sl-icon-sm')}</span>`;
    }).join('');
    this.setMemoHtml('sh-shields', this.skyShieldsEl, shieldsHtml);

    if (this.skyDashBarEl) {
      this.skyDashBarEl.style.setProperty('--fill', String(Math.max(0, Math.min(1, sh.starDashCharge / 100))));
    }

    const showBanner = !sh.running || sh.gameOver;
    setHidden(this.skyBannerEl, !showBanner);
    if (showBanner) {
      this.setMemoText(
        'sh-banner',
        this.skyBannerTitleEl,
        sh.gameOver ? `Flight Complete • Score ${sh.score}` : 'Starlight Sky-Hop Ready',
      );
    }

    if (this.skyStartBtn) {
      this.setMemoHtml(
        'sh-start',
        this.skyStartBtn,
        `${iconSvg('icon-skyhop', 'sl-icon-sm')} <span>${sh.gameOver ? 'Fly Again' : sh.running ? 'Restart' : 'Launch Flight'}</span>`,
      );
    }
    if (this.skyFlapBtn) {
      this.skyFlapBtn.disabled = !sh.running || sh.gameOver;
    }
    if (this.skyDashBtn) {
      this.skyDashBtn.disabled = !sh.running || sh.gameOver || sh.starDashCharge < 40 || sh.starDashActive;
    }
  }

  dispose(): void {
    if (this.dpadRepeatTimer !== null) {
      clearInterval(this.dpadRepeatTimer);
      this.dpadRepeatTimer = null;
    }
    this.pokedexView.dispose();
    this.badgesShowcase.dispose();
    this.styleStudio.dispose();
    if (this.root) {
      this.root.innerHTML = '';
    }
    this.memo.clear();
    this.moveButtons = [];
    this.root = null;
    this.callbacks = null;
    this.lastSnapshot = null;
    this.lastScreen = null;
  }
}
