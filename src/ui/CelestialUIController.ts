import {
  type ActiveScreen,
  type AtlasManifest,
  type BattlePace,
  type DecodedSpriteFrames,
  type DojoProfileState,
  type DrawerTab,
  type ICelestialUIController,
  type IconId,
  type IOfflineSpriteRigSynthesizer,
  type OverworldInteractable,
  type RendererMode,
  type TouchPadMode,
  type TrainerId,
  type UIBridgeCallbacks,
  type UIRenderSnapshot,
} from '../contracts';
import {
  getAllEvolutionItems,
  getBiomeVisualProfile,
  getCleanTrainerName,
  getPlayerLevel,
  getSanitizedTraitLabel,
  getSpeciesEntry,
  getTypeEffectiveness,
  Pokemon,
  stripEmojis,
  TOTAL_SPECIES_COUNT,
  typeToIconId,
} from '../core';
import { BadgesShowcase } from './BadgesShowcase';
import { BriefingModal } from './BriefingModal';
import {
  createIconSvg,
  ensureSvgSpriteSheet,
  renderPokemonPreviewCanvas,
  renderTrainerPortraitCanvas,
  safeText,
  sanitizeNoEmoji,
} from './iconHelper';
import { IslandGuideView } from './IslandGuideView';
import { PokedexView } from './PokedexView';
import { StarterLabView } from './StarterLabView';
import { StyleStudioStage } from './StyleStudioStage';
import { TeamBoxView } from './TeamBoxView';

const INTERACT_ICON_MAP: Record<OverworldInteractable['kind'], IconId> = {
  npc: 'icon-quest',
  shrine: 'icon-shrine',
  chest: 'icon-chest',
  rival: 'icon-rival',
  signpost: 'icon-signpost',
  fountain: 'icon-fountain',
  discovery: 'icon-sparkle',
  'secret-arcade': 'icon-skyhop',
  landmark: 'icon-waypoint',
};

const SPECIAL_TYPES = new Set([
  'fire',
  'water',
  'grass',
  'electric',
  'ice',
  'psychic',
  'dragon',
  'dark',
  'fairy',
  'ghost',
]);

const EVO_ITEM_NAMES = new Map(getAllEvolutionItems().map((item) => [item.id, item.name]));

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

function compassNeedleSvg(): string {
  return `<svg class="sl-icon sl-icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12L20 5l-4.5 7L20 19 4 12z" fill="currentColor" transform="rotate(180 12 12)"/></svg>`;
}

function rpgCaretSvg(): string {
  return `<svg class="sl-icon" style="width:12px;height:12px;" viewBox="0 0 12 10" aria-hidden="true"><polygon points="1,1 11,1 6,9" fill="currentColor"/></svg>`;
}

function selectChevronSvg(): string {
  return `<svg class="sl-icon" style="width:14px;height:14px;" viewBox="0 0 14 10" aria-hidden="true"><path d="M2 2.5L7 7.5L12 2.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
}

function titleCrestSvg(): string {
  return `
    <svg class="sl-title-crest-svg" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="sl-crest-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff8d6"/>
          <stop offset="50%" stop-color="#f5cd6d"/>
          <stop offset="100%" stop-color="#6ce5ff"/>
        </linearGradient>
        <linearGradient id="sl-crest-star" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="50%" stop-color="#ffe699"/>
          <stop offset="100%" stop-color="#e89eff"/>
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="27" fill="rgba(10,16,38,0.82)" stroke="url(#sl-crest-ring)" stroke-width="2.6"/>
      <circle cx="32" cy="32" r="20" fill="none" stroke="rgba(108,229,255,0.45)" stroke-width="1.2" stroke-dasharray="3 3"/>
      <polygon points="32,8 37.5,24.5 54,32 37.5,39.5 32,56 26.5,39.5 10,32 26.5,24.5" fill="url(#sl-crest-star)"/>
      <circle cx="32" cy="32" r="5" fill="#0d1534" stroke="#fff5cc" stroke-width="1.8"/>
    </svg>
  `;
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

function formatStages(stages: { atk: number; def: number; spd: number }): string {
  const chips: string[] = [];
  for (const [k, label] of [
    ['atk', 'ATK'],
    ['def', 'DEF'],
    ['spd', 'SPD'],
  ] as const) {
    const val = stages[k] ?? 0;
    if (val !== 0) {
      const cls = val > 0 ? 'sl-pill sl-pill-emerald sl-num' : 'sl-pill sl-pill-rose sl-num';
      chips.push(`<span class="${cls}" data-stage-stat="${k}">${label} ${val > 0 ? `+${val}` : val}</span>`);
    }
  }
  return chips.join('');
}

function renderPpPips(current: number, max: number): string {
  const total = 5;
  const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const lit = current <= 0 ? 0 : Math.max(1, Math.round(ratio * total));
  let html = '<span class="sl-pp-pips" aria-hidden="true">';
  for (let i = 0; i < total; i += 1) {
    html += `<span class="sl-pp-pip${i < lit ? ' is-on' : ''}"></span>`;
  }
  html += '</span>';
  return html;
}

function getLeadMaxHp(lead: DojoProfileState['team'][number]): number {
  try {
    return Pokemon.fromJSON(lead).maxHp;
  } catch {
    return Math.max(20, lead.maxHp ?? lead.hp ?? 20);
  }
}

export class CelestialUIController implements ICelestialUIController {
  private root: HTMLElement | null = null;
  private shellEl: HTMLElement | null = null;
  private callbacks: UIBridgeCallbacks | null = null;

  private manifest: AtlasManifest | null = null;
  private getSheetImage: ((sheetId: string) => HTMLImageElement | null) | null = null;
  private getCachedFrames: ((speciesId: number, back?: boolean, shiny?: boolean) => DecodedSpriteFrames | null) | null = null;

  private readonly starterLab = new StarterLabView();
  private readonly briefingModal = new BriefingModal();
  private readonly pokedexView = new PokedexView();
  private readonly teamBoxView = new TeamBoxView();
  private readonly badgesShowcase = new BadgesShowcase();
  private readonly islandGuide = new IslandGuideView();
  private readonly styleStudio = new StyleStudioStage();

  private lastScreen: ActiveScreen | null = null;
  private screenBeforeSettings: ActiveScreen = 'overworld';
  private lastSnapshot: UIRenderSnapshot | null = null;
  private lastCrtMode: boolean | null = null;
  private lastReducedMotion: boolean | null = null;
  private lastTitleRenderTs = -1;
  private dpadRepeatTimer: ReturnType<typeof setInterval> | null = null;
  private battleSwitchOpen = false;
  private suppressedTransitionToast: string | null = null;
  private lastOverworldBiomeId: string | null = null;
  private skyPointerDown = false;
  private escapeGuardHandler: ((evt: KeyboardEvent) => void) | null = null;

  // Parent zone 3-second hold timer state
  private holdRafId: number | null = null;
  private holdTimerId: ReturnType<typeof setTimeout> | null = null;

  private readonly memo = new Map<string, string>();

  // Screen containers
  private crtOverlayEl: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private badgeToastEl: HTMLElement | null = null;

  private titleScreen: HTMLElement | null = null;
  private starterScreen: HTMLElement | null = null;
  private overworldScreen: HTMLElement | null = null;
  private briefingScreen: HTMLElement | null = null;
  private battleScreen: HTMLElement | null = null;
  private drawerScreen: HTMLElement | null = null;
  private settingsScreen: HTMLElement | null = null;
  private skyhopScreen: HTMLElement | null = null;
  private dialogueOverlay: HTMLElement | null = null;

  // Title refs
  private violetCard: HTMLElement | null = null;
  private oziasCard: HTMLElement | null = null;
  private violetPortraitCanvas: HTMLCanvasElement | null = null;
  private oziasPortraitCanvas: HTMLCanvasElement | null = null;
  private violetLeadCanvas: HTMLCanvasElement | null = null;
  private oziasLeadCanvas: HTMLCanvasElement | null = null;
  private violetMetaEl: HTMLElement | null = null;
  private oziasMetaEl: HTMLElement | null = null;
  private violetStatsEl: HTMLElement | null = null;
  private oziasStatsEl: HTMLElement | null = null;

  // Overworld HUD refs
  private hudPortraitCanvas: HTMLCanvasElement | null = null;
  private hudLeadSpriteCanvas: HTMLCanvasElement | null = null;
  private hudTrainerNameEl: HTMLElement | null = null;
  private hudTrainerLvEl: HTMLElement | null = null;
  private hudBiomeNameEl: HTMLElement | null = null;
  private hudLeadLabelEl: HTMLElement | null = null;
  private hudLeadHpBarEl: HTMLElement | null = null;
  private hudEconomyEl: HTMLElement | null = null;
  private hudCompassEl: HTMLElement | null = null;
  private biomeBannerEl: HTMLElement | null = null;
  private interactPillBtn: HTMLButtonElement | null = null;
  private dpadContainer: HTMLElement | null = null;
  private audioToggleBtn: HTMLButtonElement | null = null;
  private skyhopDockBtn: HTMLButtonElement | null = null;

  // Battle refs
  private enemyNameEl: HTMLElement | null = null;
  private enemyBadgesEl: HTMLElement | null = null;
  private enemyHpBarEl: HTMLElement | null = null;
  private enemyHpTrailEl: HTMLElement | null = null;
  private enemyHpValEl: HTMLElement | null = null;
  private enemyRivalDotsEl: HTMLElement | null = null;
  private enemyBuffsEl: HTMLElement | null = null;
  private enemyAbilityBannerEl: HTMLElement | null = null;

  private playerNameEl: HTMLElement | null = null;
  private playerBadgesEl: HTMLElement | null = null;
  private playerHpBarEl: HTMLElement | null = null;
  private playerHpTrailEl: HTMLElement | null = null;
  private playerHpValEl: HTMLElement | null = null;
  private playerXpBarEl: HTMLElement | null = null;
  private playerBuffsEl: HTMLElement | null = null;
  private playerAbilityBannerEl: HTMLElement | null = null;

  private battleDeckShellEl: HTMLElement | null = null;
  private battleTurnBadgeEl: HTMLElement | null = null;
  private battleCaretEl: HTMLElement | null = null;
  private battleMsgEl: HTMLElement | null = null;
  private moveButtons: HTMLButtonElement[] = [];
  private ballPokeBtn: HTMLButtonElement | null = null;
  private ballGreatBtn: HTMLButtonElement | null = null;
  private ballStarBtn: HTMLButtonElement | null = null;
  private potionBtn: HTMLButtonElement | null = null;
  private switchToggleBtn: HTMLButtonElement | null = null;
  private switchDrawerEl: HTMLElement | null = null;
  private offlineRigBtn: HTMLButtonElement | null = null;
  private fleeBtn: HTMLButtonElement | null = null;
  private resultBannerEl: HTMLElement | null = null;

  // Drawer refs
  private drawerTabs: Map<DrawerTab, HTMLButtonElement> = new Map();
  private drawerTabPanels: Map<DrawerTab, HTMLElement> = new Map();

  // Settings refs
  private setRendererSelect: HTMLSelectElement | null = null;
  private setAudioBtn: HTMLButtonElement | null = null;
  private setVolumeSlider: HTMLInputElement | null = null;
  private setVolumeLabel: HTMLElement | null = null;
  private setMotionBtn: HTMLButtonElement | null = null;
  private setCrtBtn: HTMLButtonElement | null = null;
  private setTouchGroupEl: HTMLElement | null = null;
  private setPaceGroupEl: HTMLElement | null = null;
  private setTelemetryEl: HTMLElement | null = null;
  private parentTrainerProgressEl: HTMLElement | null = null;
  private parentAllProgressEl: HTMLElement | null = null;

  // Sky-Hop refs
  private skyScoreEl: HTMLElement | null = null;
  private skyWaveEl: HTMLElement | null = null;
  private skyComboEl: HTMLElement | null = null;
  private skyHighEl: HTMLElement | null = null;
  private skyHeartsEl: HTMLElement | null = null;
  private skyChargesEl: HTMLElement | null = null;
  private skyWaveBannerEl: HTMLElement | null = null;
  private skyCenterCardEl: HTMLElement | null = null;
  private skyDashBarEl: HTMLElement | null = null;
  private skyDashBtn: HTMLButtonElement | null = null;
  private skyPauseBtn: HTMLButtonElement | null = null;
  private skyFlightSurface: HTMLElement | null = null;

  constructor(options?: { rigSynthesizer?: IOfflineSpriteRigSynthesizer | null }) {
    if (options?.rigSynthesizer) {
      this.setRigSynthesizer(options.rigSynthesizer);
    }
  }

  setRigSynthesizer(synth: IOfflineSpriteRigSynthesizer | null): void {
    this.styleStudio.setRigSynthesizer(synth);
  }

  attachAssets(
    manifest: AtlasManifest | null,
    getSheetImage: ((sheetId: string) => HTMLImageElement | null) | null,
    getCachedFrames?: ((speciesId: number, back?: boolean, shiny?: boolean) => DecodedSpriteFrames | null) | null,
  ): void {
    this.manifest = manifest;
    this.getSheetImage = getSheetImage;
    this.getCachedFrames = getCachedFrames ?? null;
  }

  mount(root: HTMLElement, callbacks: UIBridgeCallbacks): void {
    this.dispose();
    this.root = root;
    this.callbacks = callbacks;
    this.memo.clear();
    this.lastScreen = null;
    this.lastOverworldBiomeId = null;
    this.battleSwitchOpen = false;
    this.suppressedTransitionToast = null;
    this.skyPointerDown = false;

    const doc = root.ownerDocument;
    this.crtOverlayEl = doc ? doc.getElementById('crt-overlay') : null;
    if (doc) {
      void ensureSvgSpriteSheet(doc);
    }

    root.innerHTML = `
      <div class="sl-shell" data-testid="celestial-ui-shell" data-trainer="violet" data-active-screen="title">
        <!-- Fixed zero-CLS Notifications -->
        <div class="sl-toast" data-testid="toast-banner" role="status" aria-live="polite" hidden></div>
        <div class="sl-badge-toast" data-testid="badge-toast" role="status" aria-live="polite" hidden></div>

        <!-- 1. Living Pixel-Art Title Vista -->
        <section class="sl-screen sl-title-screen" data-screen="title" data-testid="title-screen" hidden>
          <div class="sl-title-topbar">
            <button type="button" class="sl-btn sl-title-settings-btn" data-testid="title-settings-btn" aria-label="Settings">
              ${createIconSvg('icon-settings', 'sl-icon-sm')}
              <span>Settings</span>
            </button>
          </div>

          <header class="sl-title-header">
            <div class="sl-title-kicker">
              ${createIconSvg('icon-star-rank', 'sl-icon-sm')}
              <span>Starlight Island • HD-2D Edition</span>
              ${createIconSvg('icon-star-rank', 'sl-icon-sm')}
            </div>
            <div class="sl-title-emblem-wrap">
              ${titleCrestSvg()}
              <h1 class="sl-title-heading">Pokémon: Starlight Island</h1>
            </div>
            <p class="sl-title-sub">1,025 Species • 18 Connected Biomes • Choose Violet or Ozias to begin</p>
          </header>

          <div class="sl-title-spacer" aria-hidden="true"></div>

          <div class="sl-profile-grid">
            <article class="sl-profile-card sl-glass" data-testid="profile-violet" data-trainer-id="violet">
              <div class="sl-profile-top">
                <div class="sl-profile-visuals">
                  <canvas class="sl-portrait-canvas" width="76" height="76" data-testid="profile-violet-portrait" aria-hidden="true"></canvas>
                  <canvas class="sl-profile-lead-canvas" width="56" height="56" data-testid="profile-violet-lead" aria-hidden="true"></canvas>
                </div>
                <div class="sl-profile-meta" data-testid="profile-violet-meta"></div>
              </div>
              <div class="sl-profile-stats sl-num" data-testid="profile-violet-stats"></div>
              <button type="button" class="sl-btn sl-btn-primary sl-profile-play-btn" data-testid="title-play-violet" data-play-trainer="violet">
                ${createIconSvg('icon-play', 'sl-icon-sm')}
                <span>Continue</span>
              </button>
            </article>

            <article class="sl-profile-card sl-glass" data-testid="profile-ozias" data-trainer-id="ozias">
              <div class="sl-profile-top">
                <div class="sl-profile-visuals">
                  <canvas class="sl-portrait-canvas" width="76" height="76" data-testid="profile-ozias-portrait" aria-hidden="true"></canvas>
                  <canvas class="sl-profile-lead-canvas" width="56" height="56" data-testid="profile-ozias-lead" aria-hidden="true"></canvas>
                </div>
                <div class="sl-profile-meta" data-testid="profile-ozias-meta"></div>
              </div>
              <div class="sl-profile-stats sl-num" data-testid="profile-ozias-stats"></div>
              <button type="button" class="sl-btn sl-btn-primary sl-profile-play-btn" data-testid="title-play-ozias" data-play-trainer="ozias">
                ${createIconSvg('icon-play', 'sl-icon-sm')}
                <span>Continue</span>
              </button>
            </article>
          </div>

          <div class="sl-title-footer-hint">Tap the island to walk or use WASD / Arrow Keys + Space to interact</div>
        </section>

        <!-- 2. Professor Willow's Starter Lab -->
        <section class="sl-screen sl-modal-screen" data-screen="starter" data-testid="starter-screen" hidden></section>

        <!-- 3. HD-2D RPG Adventure Overworld HUD -->
        <section class="sl-screen sl-overworld-screen" data-screen="overworld" data-testid="overworld-screen" hidden>
          <header class="sl-hud-top-row">
            <!-- Top-left Adventurer Crest + Waypoint Stack (zero duplicate zone banners) -->
            <div class="sl-hud-left-col">
              <div class="sl-trainer-pill sl-hud-plate" data-testid="hud-trainer-pill">
                <canvas class="sl-hud-portrait" width="46" height="46" data-testid="hud-trainer-portrait" title="Open Style Studio" aria-hidden="true"></canvas>
                <div class="sl-hud-trainer-copy">
                  <div class="sl-hud-trainer-line">
                    <strong class="sl-hud-trainer-name" data-testid="hud-trainer-name">Violet</strong>
                    <span class="sl-pill sl-pill-gold sl-num" data-testid="hud-trainer-level">Lv.1</span>
                    <span class="sl-hud-zone-sub" data-testid="hud-biome-name">Starlight Village</span>
                  </div>
                  <div class="sl-hud-lead-row">
                    <canvas class="sl-hud-lead-sprite" width="24" height="24" data-testid="hud-lead-sprite" aria-hidden="true"></canvas>
                    <span class="sl-hud-lead-text" data-testid="hud-lead-label">Partner Ready</span>
                    <div class="sl-hud-lead-hp-wrap" title="Lead Pokémon HP">
                      <div class="sl-bar-track sl-bar-track-sm">
                        <div class="sl-bar-fill sl-bar-hp" data-testid="hud-lead-hp-bar" style="--fill:1;"></div>
                      </div>
                    </div>
                  </div>
                  <div class="sl-hud-economy sl-num" data-testid="hud-economy"></div>
                </div>
              </div>

              <!-- Starlight Astrolabe Waypoint Compass Badge -->
              <button type="button" class="sl-compass-pill sl-hud-plate" data-testid="hud-compass" aria-label="Open Island Guide and Waypoints">
                <span class="sl-compass-dial" aria-hidden="true">${createIconSvg('icon-compass', 'sl-icon-sm')}</span>
                <span class="sl-compass-label">Explore Starlight Island</span>
              </button>
            </div>

            <!-- Top-right Iconic RPG Command Crest Bar -->
            <nav class="sl-action-dock sl-hud-plate" aria-label="Adventure Dock">
              <button type="button" class="sl-btn" data-testid="nav-pokedex" aria-label="Open Pokédex and Menu Drawer">
                ${createIconSvg('icon-pokedex', 'sl-icon-sm')}
                <span class="sl-dock-label">Menu</span>
              </button>
              <button type="button" class="sl-btn" data-testid="nav-briefing" aria-label="Tactical Readiness Briefing" title="Tactical Readiness Briefing">
                ${createIconSvg('icon-briefing', 'sl-icon-sm')}
                <span class="sl-dock-label sl-dock-label-wide">Briefing</span>
              </button>
              <button type="button" class="sl-btn" data-testid="warp-safe" aria-label="Safe Zone Warp to Starlight Village" title="Return to Starlight Village">
                ${createIconSvg('icon-warp-safe', 'sl-icon-sm')}
                <span class="sl-dock-label">Safe</span>
              </button>
              <button type="button" class="sl-btn sl-btn-cyan" data-testid="warp-farm" aria-label="Farm Zone Warp" title="Warp to Recommended Farm Zone">
                ${createIconSvg('icon-warp-farm', 'sl-icon-sm')}
                <span class="sl-dock-label">Farm</span>
              </button>
              <button type="button" class="sl-btn" data-testid="nav-skyhop" aria-label="Sky-Hop Arcade" title="Starlight Sky-Hop Arcade">
                ${createIconSvg('icon-skyhop', 'sl-icon-sm')}
                <span class="sl-dock-label sl-dock-label-wide">Sky-Hop</span>
              </button>
              <button type="button" class="sl-btn sl-btn-icon" data-testid="nav-settings" aria-label="Settings" title="Settings">
                ${createIconSvg('icon-settings', 'sl-icon-sm')}
              </button>
              <button type="button" class="sl-btn sl-btn-icon" data-testid="toggle-audio" aria-label="Toggle Audio" aria-pressed="false" title="Toggle Audio">
                ${createIconSvg('icon-audio-on', 'sl-icon-sm')}
              </button>
            </nav>
          </header>

          <!-- Area Transition Scroll Banner (only shown when crossing into a new biome; CLS = 0) -->
          <div class="sl-biome-banner sl-hud-plate" data-testid="biome-banner" aria-live="polite"></div>

          <footer class="sl-overworld-footer">
            <!-- Tactile Brass Touch Cross-Pad (Bottom-Left) -->
            <div class="sl-dpad" data-testid="touch-dpad" data-touch-active="false" role="group" aria-label="Movement Controls">
              <button type="button" class="sl-btn sl-dpad-btn sl-dpad-up" data-testid="dpad-up" aria-label="Move Up">${dpadChevronSvg('up')}</button>
              <button type="button" class="sl-btn sl-dpad-btn sl-dpad-left" data-testid="dpad-left" aria-label="Move Left">${dpadChevronSvg('left')}</button>
              <div class="sl-dpad-mid" aria-hidden="true">${createIconSvg('icon-waypoint', 'sl-icon-sm')}</div>
              <button type="button" class="sl-btn sl-dpad-btn sl-dpad-right" data-testid="dpad-right" aria-label="Move Right">${dpadChevronSvg('right')}</button>
              <button type="button" class="sl-btn sl-dpad-btn sl-dpad-down" data-testid="dpad-down" aria-label="Move Down">${dpadChevronSvg('down')}</button>
            </div>

            <!-- Contextual Interact Pill (Bottom-Center) -->
            <button type="button" class="sl-btn sl-btn-primary sl-interact-pill" data-testid="interact-pill" hidden>
              ${createIconSvg('icon-waypoint', 'sl-icon-sm')}
              <span>Interact</span>
            </button>
          </footer>
        </section>

        <!-- 4. Tactical Readiness Briefing Modal -->
        <section class="sl-screen sl-briefing-screen" data-screen="briefing" data-testid="briefing-screen" hidden></section>

        <!-- 5. Switch HD-2D Battle Theater HUD -->
        <section class="sl-screen sl-battle-screen" data-screen="battle" data-testid="battle-screen" hidden>
          <!-- Top Band: Enemy Crest Plate + Ability Ribbon TOP-LEFT, Rig Toggle TOP-RIGHT -->
          <div class="sl-battle-top-row">
            <div class="sl-combatant-stack">
              <div class="sl-combatant-card sl-combatant-enemy sl-hud-plate" data-testid="battle-enemy-card">
                <div class="sl-combatant-head">
                  <strong class="sl-combatant-name" data-testid="battle-enemy-name">Wild Foe Lv.5</strong>
                  <div class="sl-combatant-badges" data-testid="battle-enemy-badges"></div>
                </div>
                <div class="sl-gauge-row">
                  <span class="sl-gauge-label">HP</span>
                  <div class="sl-bar-track">
                    <div class="sl-bar-trail" data-testid="battle-enemy-hp-trail" style="--trail:1;"></div>
                    <div class="sl-bar-fill sl-bar-hp" data-testid="battle-enemy-hp-bar" style="--fill:1;"></div>
                  </div>
                  <span class="sl-gauge-val sl-num" data-testid="battle-enemy-hp-val">25/25</span>
                </div>
                <div class="sl-battle-meta-row">
                  <div class="sl-battle-buffs" data-testid="battle-enemy-buffs"></div>
                  <div class="sl-rival-dots" data-testid="battle-rival-dots"></div>
                </div>
              </div>
              <div class="sl-ability-banner" data-testid="battle-enemy-ability-banner" hidden></div>
            </div>

            <button
              type="button"
              class="sl-btn sl-battle-rig-btn"
              data-testid="battle-offline-rig"
              aria-pressed="false"
              aria-label="Toggle Offline Pixel Rig"
              title="Toggle Offline Pixel Rig"
            >
              ${createIconSvg('icon-sparkle', 'sl-icon-sm')}
            </button>
          </div>

          <!-- Center Unobstructed Arena + Player Crest Plate bottom-right opposite Player Sprite -->
          <div class="sl-battle-stage-gap">
            <div class="sl-combatant-stack sl-combatant-stack-right">
              <div class="sl-ability-banner" data-testid="battle-player-ability-banner" hidden></div>
              <div class="sl-combatant-card sl-combatant-player sl-hud-plate" data-testid="battle-player-card">
                <div class="sl-combatant-head">
                  <strong class="sl-combatant-name" data-testid="battle-player-name">Partner Lv.5</strong>
                  <div class="sl-combatant-badges" data-testid="battle-player-badges"></div>
                </div>
                <div class="sl-gauge-row">
                  <span class="sl-gauge-label">HP</span>
                  <div class="sl-bar-track">
                    <div class="sl-bar-trail" data-testid="battle-player-hp-trail" style="--trail:1;"></div>
                    <div class="sl-bar-fill sl-bar-hp" data-testid="battle-player-hp-bar" style="--fill:1;"></div>
                  </div>
                  <span class="sl-gauge-val sl-num" data-testid="battle-player-hp-val">25/25</span>
                </div>
                <div class="sl-gauge-row">
                  <span class="sl-gauge-label">XP</span>
                  <div class="sl-bar-track sl-bar-track-sm"><div class="sl-bar-fill sl-bar-xp" data-testid="battle-player-xp-bar" style="--fill:0;"></div></div>
                  <span class="sl-battle-buffs" data-testid="battle-player-buffs"></span>
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom Full-Width HD-2D RPG Command Console -->
          <div class="sl-battle-console">
            <div class="sl-battle-result-banner sl-glass" data-testid="battle-result-banner" hidden></div>
            <div class="sl-battle-switch-drawer sl-glass" data-testid="battle-switch-drawer" hidden></div>

            <div class="sl-battle-deck-shell sl-glass" data-testid="battle-deck-shell" data-busy="false">
              <div class="sl-battle-left-col">
                <div class="sl-battle-message-wrap">
                  <span class="sl-battle-turn-badge" data-testid="battle-turn-badge" hidden>Your Turn</span>
                  <div class="sl-battle-message" data-testid="battle-status-message">Ready for battle!</div>
                  <span class="sl-rpg-caret" data-testid="battle-caret" aria-hidden="true">${rpgCaretSvg()}</span>
                </div>

                <div class="sl-battle-actions">
                  <button type="button" class="sl-btn sl-act-poke" data-testid="battle-ball-poke">
                    ${createIconSvg('icon-pokeball', 'sl-icon-sm')}
                    <span>Poké Ball</span>
                  </button>
                  <button type="button" class="sl-btn sl-act-great" data-testid="battle-ball-great">
                    ${createIconSvg('icon-greatball', 'sl-icon-sm')}
                    <span>Great (0)</span>
                  </button>
                  <button type="button" class="sl-btn sl-act-star" data-testid="battle-ball-star">
                    ${createIconSvg('icon-starball', 'sl-icon-sm')}
                    <span>Star (0)</span>
                  </button>
                  <button type="button" class="sl-btn sl-act-potion" data-testid="battle-potion">
                    ${createIconSvg('icon-potion', 'sl-icon-sm')}
                    <span>Potion (0)</span>
                  </button>
                  <button type="button" class="sl-btn sl-act-switch" data-testid="battle-switch-btn">
                    ${createIconSvg('icon-team', 'sl-icon-sm')}
                    <span>Switch</span>
                  </button>
                  <button type="button" class="sl-btn sl-act-run" data-testid="battle-flee">
                    ${createIconSvg('icon-waypoint', 'sl-icon-sm')}
                    <span>Run</span>
                  </button>
                </div>
              </div>

              <div class="sl-move-grid">
                ${[0, 1, 2, 3]
                  .map(
                    (idx) => `
                  <button type="button" class="sl-move-card" data-testid="battle-move-${idx}" data-type="normal">
                    <div class="sl-move-top">
                      <span class="sl-move-name-group">
                        ${createIconSvg('icon-type-normal', 'sl-icon-sm')}
                        <span class="sl-move-name">Move</span>
                      </span>
                    </div>
                    <div class="sl-move-meta sl-num">
                      <span><span class="sl-move-cat-tag">PHY</span>PWR 40</span>
                      <span class="sl-move-pp-wrap">PP 20/20</span>
                    </div>
                  </button>
                `,
                  )
                  .join('')}
              </div>
            </div>
          </div>
        </section>

        <!-- 6. Unified 5-Tab Starlight Chronicle Journal Drawer -->
        <section class="sl-screen sl-modal-screen" data-screen="drawer" data-testid="collector-drawer" hidden>
          <div class="sl-modal-panel sl-glass sl-rpg-ornate" role="dialog" aria-modal="true" aria-label="Starlight Collector Menu">
            <header class="sl-drawer-header">
              <div class="sl-drawer-tabs" role="tablist" aria-label="Collector Tabs">
                <button type="button" class="sl-btn sl-drawer-tab" role="tab" data-drawer-tab="pokedex" data-testid="drawer-tab-pokedex" aria-selected="true">
                  ${createIconSvg('icon-pokedex', 'sl-icon-sm')}
                  <span>Pokédex</span>
                </button>
                <button type="button" class="sl-btn sl-drawer-tab" role="tab" data-drawer-tab="team" data-testid="drawer-tab-team" aria-selected="false">
                  ${createIconSvg('icon-team', 'sl-icon-sm')}
                  <span>Team &amp; Box</span>
                </button>
                <button type="button" class="sl-btn sl-drawer-tab" role="tab" data-drawer-tab="badges" data-testid="drawer-tab-badges" aria-selected="false">
                  ${createIconSvg('icon-badges', 'sl-icon-sm')}
                  <span>Badges</span>
                </button>
                <button type="button" class="sl-btn sl-drawer-tab" role="tab" data-drawer-tab="guide" data-testid="drawer-tab-guide" aria-selected="false">
                  ${createIconSvg('icon-guide', 'sl-icon-sm')}
                  <span>Island Guide</span>
                </button>
                <button type="button" class="sl-btn sl-drawer-tab" role="tab" data-drawer-tab="style" data-testid="drawer-tab-style" aria-selected="false">
                  ${createIconSvg('icon-style', 'sl-icon-sm')}
                  <span>Style Studio</span>
                </button>
              </div>
              <button type="button" class="sl-btn sl-btn-ghost" data-testid="drawer-close" aria-label="Return to Island">
                ${createIconSvg('icon-close', 'sl-icon-sm')}
                <span>Return</span>
              </button>
            </header>

            <div class="sl-drawer-panels">
              <div class="sl-drawer-panel" data-drawer-panel="pokedex" data-testid="drawer-panel-pokedex"></div>
              <div class="sl-drawer-panel" data-drawer-panel="team" data-testid="drawer-panel-team" hidden></div>
              <div class="sl-drawer-panel" data-drawer-panel="badges" data-testid="drawer-panel-badges" hidden></div>
              <div class="sl-drawer-panel" data-drawer-panel="guide" data-testid="drawer-panel-guide" hidden></div>
              <div class="sl-drawer-panel" data-drawer-panel="style" data-testid="drawer-panel-style" hidden></div>
            </div>
          </div>
        </section>

        <!-- 7. Settings & Parent Zone Modal (Crafted RPG Segmented Controls) -->
        <section class="sl-screen sl-modal-screen" data-screen="settings" data-testid="settings-screen" hidden>
          <div class="sl-modal-panel sl-glass sl-rpg-ornate sl-settings-modal" role="dialog" aria-modal="true" aria-label="Settings and Parent Zone">
            <header class="sl-modal-header">
              <h2 class="sl-modal-title">
                ${createIconSvg('icon-settings', 'sl-icon-md')}
                <span>Settings &amp; Trainer Profile</span>
              </h2>
              <button type="button" class="sl-btn sl-btn-primary" data-testid="settings-close">
                ${createIconSvg('icon-check', 'sl-icon-sm')}
                <span>Done</span>
              </button>
            </header>

            <div class="sl-settings-body">
              <div class="sl-settings-grid">
                <div class="sl-setting-card">
                  <div class="sl-setting-copy">
                    <strong>Switch Trainer Profile</strong>
                    <small>Swap between Violet &amp; Ozias</small>
                  </div>
                  <button type="button" class="sl-btn sl-btn-cyan" data-testid="setting-switch-trainer">
                    ${createIconSvg('icon-team', 'sl-icon-sm')}
                    <span>Switch</span>
                  </button>
                </div>

                <div class="sl-setting-card">
                  <div class="sl-setting-copy">
                    <strong>Local Progress Save</strong>
                    <small>Write save to browser storage</small>
                  </div>
                  <button type="button" class="sl-btn" data-testid="setting-save-now">
                    ${createIconSvg('icon-save', 'sl-icon-sm')}
                    <span>Save Now</span>
                  </button>
                </div>

                <div class="sl-setting-card">
                  <div class="sl-setting-copy">
                    <strong>Audio Synth</strong>
                    <small>Retro chiptune BGM &amp; SFX</small>
                  </div>
                  <button type="button" class="sl-btn" data-testid="setting-audio-mute" aria-pressed="false">
                    ${createIconSvg('icon-audio-on', 'sl-icon-sm')}
                    <span>Active</span>
                  </button>
                </div>

                <div class="sl-setting-card sl-setting-card-stack">
                  <div class="sl-setting-copy">
                    <label for="sl-setting-volume"><strong>Master Volume (<span class="sl-num" data-testid="setting-volume-val">65%</span>)</strong></label>
                  </div>
                  <input id="sl-setting-volume" class="sl-range" type="range" min="0" max="100" value="65" data-testid="setting-volume" />
                </div>

                <div class="sl-setting-card">
                  <div class="sl-setting-copy">
                    <strong>CRT Scanlines</strong>
                    <small>Subtle handheld phosphor lines</small>
                  </div>
                  <button type="button" class="sl-btn" data-testid="setting-crt" aria-pressed="false">
                    ${createIconSvg('icon-crt', 'sl-icon-sm')}
                    <span>Off</span>
                  </button>
                </div>

                <div class="sl-setting-card">
                  <div class="sl-setting-copy">
                    <strong>Reduced Motion</strong>
                    <small>Minimize camera shake &amp; tilt</small>
                  </div>
                  <button type="button" class="sl-btn" data-testid="setting-reduced-motion" aria-pressed="false">
                    ${createIconSvg('icon-motion', 'sl-icon-sm')}
                    <span>Off</span>
                  </button>
                </div>

                <div class="sl-setting-card sl-setting-card-stack">
                  <div class="sl-setting-copy">
                    <strong>Battle Pace</strong>
                    <small>Turn narration &amp; animation cadence</small>
                  </div>
                  <div class="sl-seg-group" data-testid="setting-battle-pace" role="group" aria-label="Battle Pace">
                    <button type="button" class="sl-seg-btn" data-pace-val="cinema" aria-pressed="false">Cinema</button>
                    <button type="button" class="sl-seg-btn" data-pace-val="classic" aria-pressed="false">Classic</button>
                    <button type="button" class="sl-seg-btn" data-pace-val="fast" aria-pressed="false">Fast</button>
                  </div>
                </div>

                <div class="sl-setting-card sl-setting-card-stack">
                  <div class="sl-setting-copy">
                    <strong>Touch D-Pad</strong>
                    <small>On-screen movement pad visibility</small>
                  </div>
                  <div class="sl-seg-group" data-testid="setting-touch-mode" role="group" aria-label="Touch D-Pad Mode">
                    <button type="button" class="sl-seg-btn" data-touch-val="auto" aria-pressed="false">Auto</button>
                    <button type="button" class="sl-seg-btn" data-touch-val="show" aria-pressed="false">Show</button>
                    <button type="button" class="sl-seg-btn" data-touch-val="hide" aria-pressed="false">Hide</button>
                  </div>
                </div>

                <div class="sl-setting-card sl-setting-card-stack sl-setting-card-wide">
                  <div class="sl-setting-copy">
                    <label for="sl-setting-renderer"><strong>Graphics Renderer</strong></label>
                    <small>Switch seamlessly between WebGL2 hardware and Canvas2D parity</small>
                  </div>
                  <div class="sl-select-wrap">
                    <select id="sl-setting-renderer" class="sl-select" data-testid="setting-renderer">
                      <option value="auto">Auto (WebGL2 + Canvas2D Parity)</option>
                      <option value="webgl2">WebGL2 Hardware</option>
                      <option value="canvas2d">Canvas2D Parity</option>
                    </select>
                    <span class="sl-select-caret" aria-hidden="true">${selectChevronSvg()}</span>
                  </div>
                </div>
              </div>

              <div class="sl-parent-zone" data-testid="parent-zone">
                <h3 class="sl-section-title">${createIconSvg('icon-shield', 'sl-icon-sm')} Parent Zone (Hold 3 Seconds to Reset)</h3>
                <p style="margin:0; font-size:12px; color:var(--sl-text-secondary);">
                  Press and hold a reset button for 3 full seconds to confirm. Releasing early cancels safely.
                </p>
                <div class="sl-parent-actions">
                  <button type="button" class="sl-btn sl-hold-btn" data-testid="parent-reset-trainer" data-hold-kind="trainer">
                    <span class="sl-hold-fill" data-testid="parent-reset-trainer-fill"></span>
                    ${createIconSvg('icon-warn', 'sl-icon-sm')}
                    <span class="sl-hold-label">Hold 3s: Reset Current Trainer</span>
                  </button>
                  <button type="button" class="sl-btn sl-hold-btn" data-testid="parent-reset-all" data-hold-kind="all">
                    <span class="sl-hold-fill" data-testid="parent-reset-all-fill"></span>
                    ${createIconSvg('icon-danger', 'sl-icon-sm')}
                    <span class="sl-hold-label">Hold 3s: Reset All Saves</span>
                  </button>
                </div>
              </div>

              <div class="sl-settings-footer-meta sl-num">
                <span>Starlight Island HD-2D</span>
                <span data-testid="engine-telemetry">Canvas2D • 60 FPS</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 8. Sky-Hop Arcade HUD -->
        <section class="sl-screen sl-skyhop-screen" data-screen="skyhop" data-testid="skyhop-screen" hidden>
          <div class="sl-skyhop-flight-surface" data-testid="skyhop-flight-surface" aria-label="Sky-Hop Flight Surface"></div>
          <div class="sl-skyhop-hud-layer">
            <header class="sl-skyhop-topbar sl-hud-plate">
              <div class="sl-skyhop-stats">
              <div class="sl-skyhop-stat">
                <span class="sl-skyhop-stat-label">Score</span>
                <span class="sl-skyhop-stat-val sl-num" data-testid="skyhop-score">0</span>
              </div>
              <div class="sl-skyhop-stat">
                <span class="sl-skyhop-stat-label">Wave</span>
                <span class="sl-skyhop-stat-val sl-num" data-testid="skyhop-wave">1</span>
              </div>
              <div class="sl-skyhop-stat">
                <span class="sl-skyhop-stat-label">Combo</span>
                <span class="sl-skyhop-stat-val sl-num" data-testid="skyhop-combo">1x</span>
              </div>
              <div class="sl-skyhop-stat">
                <span class="sl-skyhop-stat-label">Best</span>
                <span class="sl-skyhop-stat-val sl-num" data-testid="skyhop-highscore">0</span>
              </div>
              <div class="sl-skyhop-stat">
                <span class="sl-skyhop-stat-label">Hearts</span>
                <div data-testid="skyhop-hearts" style="display:flex; gap:4px; align-items:center;"></div>
              </div>
              <div class="sl-skyhop-stat">
                <span class="sl-skyhop-stat-label">Charges</span>
                <span class="sl-skyhop-stat-val sl-num" data-testid="skyhop-charges">3/3</span>
              </div>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button type="button" class="sl-btn sl-btn-ghost" data-testid="skyhop-pause" aria-label="Pause Sky-Hop">
                ${createIconSvg('icon-pause', 'sl-icon-sm')}
                <span>Pause</span>
              </button>
              <button type="button" class="sl-btn sl-btn-ghost" data-testid="skyhop-exit">
                ${createIconSvg('icon-close', 'sl-icon-sm')}
                <span>Exit</span>
              </button>
            </div>
          </header>

          <div class="sl-skyhop-wave-banner sl-hud-plate" data-testid="skyhop-wave-banner" hidden></div>
          <div class="sl-skyhop-banner sl-glass" data-testid="skyhop-center-card" hidden></div>

          <footer class="sl-skyhop-controls sl-hud-plate">
            <div class="sl-skyhop-flight-btns">
              <button type="button" class="sl-btn" data-testid="skyhop-up">
                ${dpadChevronSvg('up')}
                <span>Up</span>
              </button>
              <button type="button" class="sl-btn" data-testid="skyhop-down">
                ${dpadChevronSvg('down')}
                <span>Down</span>
              </button>
            </div>
            <div class="sl-skyhop-dash-wrap">
              <div class="sl-skyhop-dash-meter">
                <div class="sl-bar-track"><div class="sl-bar-fill sl-bar-dash" data-testid="skyhop-dash-bar" style="--fill:1;"></div></div>
              </div>
              <button type="button" class="sl-btn sl-btn-primary" data-testid="skyhop-dash">
                ${createIconSvg('icon-dash', 'sl-icon-sm')}
                <span>Star Dash</span>
              </button>
            </div>
          </footer>
          </div>
        </section>

        <!-- 9. Classic RPG Dialogue Overlay -->
        <div class="sl-dialogue-overlay" data-testid="dialogue-overlay" hidden></div>
      </div>
    `;

    this.cacheReferences(root);
    this.bindEvents();

    if (this.starterScreen) this.starterLab.mount(this.starterScreen, callbacks);
    if (this.briefingScreen) this.briefingModal.mount(this.briefingScreen, callbacks);

    const pPanel = this.drawerTabPanels.get('pokedex');
    const tPanel = this.drawerTabPanels.get('team');
    const bPanel = this.drawerTabPanels.get('badges');
    const gPanel = this.drawerTabPanels.get('guide');
    const sPanel = this.drawerTabPanels.get('style');

    if (pPanel) this.pokedexView.mount(pPanel, callbacks);
    if (tPanel) this.teamBoxView.mount(tPanel, callbacks);
    if (bPanel) this.badgesShowcase.mount(bPanel, callbacks);
    if (gPanel) this.islandGuide.mount(gPanel, callbacks);
    if (sPanel) this.styleStudio.mount(sPanel, callbacks);
  }

  private cacheReferences(root: HTMLElement): void {
    const q = <T extends HTMLElement = HTMLElement>(sel: string): T | null =>
      root.querySelector(sel) as T | null;

    this.shellEl = q('[data-testid="celestial-ui-shell"]');
    this.toastEl = q('[data-testid="toast-banner"]');
    this.badgeToastEl = q('[data-testid="badge-toast"]');
    this.dialogueOverlay = q('[data-testid="dialogue-overlay"]');

    this.titleScreen = q('[data-screen="title"]');
    this.starterScreen = q('[data-screen="starter"]');
    this.overworldScreen = q('[data-screen="overworld"]');
    this.briefingScreen = q('[data-screen="briefing"]');
    this.battleScreen = q('[data-screen="battle"]');
    this.drawerScreen = q('[data-screen="drawer"]');
    this.settingsScreen = q('[data-screen="settings"]');
    this.skyhopScreen = q('[data-screen="skyhop"]');

    this.violetCard = q('[data-testid="profile-violet"]');
    this.oziasCard = q('[data-testid="profile-ozias"]');
    this.violetPortraitCanvas = q('[data-testid="profile-violet-portrait"]');
    this.oziasPortraitCanvas = q('[data-testid="profile-ozias-portrait"]');
    this.violetLeadCanvas = q('[data-testid="profile-violet-lead"]');
    this.oziasLeadCanvas = q('[data-testid="profile-ozias-lead"]');
    this.violetMetaEl = q('[data-testid="profile-violet-meta"]');
    this.oziasMetaEl = q('[data-testid="profile-ozias-meta"]');
    this.violetStatsEl = q('[data-testid="profile-violet-stats"]');
    this.oziasStatsEl = q('[data-testid="profile-ozias-stats"]');

    this.hudPortraitCanvas = q('[data-testid="hud-trainer-portrait"]');
    this.hudLeadSpriteCanvas = q('[data-testid="hud-lead-sprite"]');
    this.hudTrainerNameEl = q('[data-testid="hud-trainer-name"]');
    this.hudTrainerLvEl = q('[data-testid="hud-trainer-level"]');
    this.hudBiomeNameEl = q('[data-testid="hud-biome-name"]');
    this.hudLeadLabelEl = q('[data-testid="hud-lead-label"]');
    this.hudLeadHpBarEl = q('[data-testid="hud-lead-hp-bar"]');
    this.hudEconomyEl = q('[data-testid="hud-economy"]');
    this.hudCompassEl = q('[data-testid="hud-compass"]');
    this.biomeBannerEl = q('[data-testid="biome-banner"]');
    this.interactPillBtn = q('[data-testid="interact-pill"]');
    this.dpadContainer = q('[data-testid="touch-dpad"]');
    this.audioToggleBtn = q('[data-testid="toggle-audio"]');
    this.skyhopDockBtn = q('[data-testid="nav-skyhop"]');

    this.enemyNameEl = q('[data-testid="battle-enemy-name"]');
    this.enemyBadgesEl = q('[data-testid="battle-enemy-badges"]');
    this.enemyHpBarEl = q('[data-testid="battle-enemy-hp-bar"]');
    this.enemyHpTrailEl = q('[data-testid="battle-enemy-hp-trail"]');
    this.enemyHpValEl = q('[data-testid="battle-enemy-hp-val"]');
    this.enemyBuffsEl = q('[data-testid="battle-enemy-buffs"]');
    this.enemyRivalDotsEl = q('[data-testid="battle-rival-dots"]');
    this.enemyAbilityBannerEl = q('[data-testid="battle-enemy-ability-banner"]');

    this.playerNameEl = q('[data-testid="battle-player-name"]');
    this.playerBadgesEl = q('[data-testid="battle-player-badges"]');
    this.playerHpBarEl = q('[data-testid="battle-player-hp-bar"]');
    this.playerHpTrailEl = q('[data-testid="battle-player-hp-trail"]');
    this.playerHpValEl = q('[data-testid="battle-player-hp-val"]');
    this.playerXpBarEl = q('[data-testid="battle-player-xp-bar"]');
    this.playerBuffsEl = q('[data-testid="battle-player-buffs"]');
    this.playerAbilityBannerEl = q('[data-testid="battle-player-ability-banner"]');

    this.battleDeckShellEl = q('[data-testid="battle-deck-shell"]');
    this.battleTurnBadgeEl = q('[data-testid="battle-turn-badge"]');
    this.battleCaretEl = q('[data-testid="battle-caret"]');
    this.battleMsgEl = q('[data-testid="battle-status-message"]');
    this.moveButtons = [0, 1, 2, 3]
      .map((i) => q<HTMLButtonElement>(`[data-testid="battle-move-${i}"]`))
      .filter((b): b is HTMLButtonElement => Boolean(b));
    this.ballPokeBtn = q('[data-testid="battle-ball-poke"]');
    this.ballGreatBtn = q('[data-testid="battle-ball-great"]');
    this.ballStarBtn = q('[data-testid="battle-ball-star"]');
    this.potionBtn = q('[data-testid="battle-potion"]');
    this.switchToggleBtn = q('[data-testid="battle-switch-btn"]');
    this.switchDrawerEl = q('[data-testid="battle-switch-drawer"]');
    this.offlineRigBtn = q('[data-testid="battle-offline-rig"]');
    this.fleeBtn = q('[data-testid="battle-flee"]');
    this.resultBannerEl = q('[data-testid="battle-result-banner"]');

    for (const tab of ['pokedex', 'team', 'badges', 'guide', 'style'] as const) {
      const btn = q<HTMLButtonElement>(`[data-drawer-tab="${tab}"]`);
      const panel = q<HTMLElement>(`[data-drawer-panel="${tab}"]`);
      if (btn) this.drawerTabs.set(tab, btn);
      if (panel) this.drawerTabPanels.set(tab, panel);
    }

    this.setRendererSelect = q('[data-testid="setting-renderer"]');
    this.setAudioBtn = q('[data-testid="setting-audio-mute"]');
    this.setVolumeSlider = q('[data-testid="setting-volume"]');
    this.setVolumeLabel = q('[data-testid="setting-volume-val"]');
    this.setMotionBtn = q('[data-testid="setting-reduced-motion"]');
    this.setCrtBtn = q('[data-testid="setting-crt"]');
    this.setTouchGroupEl = q('[data-testid="setting-touch-mode"]');
    this.setPaceGroupEl = q('[data-testid="setting-battle-pace"]');
    this.setTelemetryEl = q('[data-testid="engine-telemetry"]');
    this.parentTrainerProgressEl = q('[data-testid="parent-reset-trainer-fill"]');
    this.parentAllProgressEl = q('[data-testid="parent-reset-all-fill"]');

    this.skyScoreEl = q('[data-testid="skyhop-score"]');
    this.skyWaveEl = q('[data-testid="skyhop-wave"]');
    this.skyComboEl = q('[data-testid="skyhop-combo"]');
    this.skyHighEl = q('[data-testid="skyhop-highscore"]');
    this.skyHeartsEl = q('[data-testid="skyhop-hearts"]');
    this.skyChargesEl = q('[data-testid="skyhop-charges"]');
    this.skyWaveBannerEl = q('[data-testid="skyhop-wave-banner"]');
    this.skyCenterCardEl = q('[data-testid="skyhop-center-card"]');
    this.skyDashBarEl = q('[data-testid="skyhop-dash-bar"]');
    this.skyDashBtn = q('[data-testid="skyhop-dash"]');
    this.skyPauseBtn = q('[data-testid="skyhop-pause"]');
    this.skyFlightSurface = q('[data-testid="skyhop-flight-surface"]');
  }

  private bindEvents(): void {
    const root = this.root;
    if (!root) return;

    // Title screen
    root.querySelector('[data-testid="title-settings-btn"]')?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('settings');
    });
    root.querySelectorAll('[data-play-trainer]').forEach((btn) => {
      btn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        const tid = btn.getAttribute('data-play-trainer') as TrainerId | null;
        if (tid) this.callbacks?.onSelectTrainer(tid);
      });
    });
    this.violetCard?.addEventListener('click', () => this.callbacks?.onSelectTrainer('violet'));
    this.oziasCard?.addEventListener('click', () => this.callbacks?.onSelectTrainer('ozias'));

    // Overworld HUD Action Dock
    this.hudPortraitCanvas?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('style-studio', 'style');
    });
    this.hudCompassEl?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('pokedex', 'guide');
    });
    root.querySelector('[data-testid="nav-pokedex"]')?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('pokedex', 'pokedex');
    });
    root.querySelector('[data-testid="nav-briefing"]')?.addEventListener('click', () => {
      this.callbacks?.onOpenBriefingForBiome();
    });
    root.querySelector('[data-testid="warp-safe"]')?.addEventListener('click', () => {
      this.callbacks?.onWarpSafeZone();
    });
    root.querySelector('[data-testid="warp-farm"]')?.addEventListener('click', () => {
      this.callbacks?.onWarpFarmZone();
    });
    this.skyhopDockBtn?.addEventListener('click', () => {
      this.callbacks?.onOpenSkyHop();
    });
    root.querySelector('[data-testid="nav-settings"]')?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('settings');
    });
    this.audioToggleBtn?.addEventListener('click', () => {
      const muted = Boolean(this.lastSnapshot?.save.settings.audioMuted);
      this.callbacks?.onUpdateSettings({ audioMuted: !muted });
    });
    this.interactPillBtn?.addEventListener('click', () => {
      this.callbacks?.onInteractNearby();
    });

    // D-Pad (no double-step on pointerdown + click; keyboard activation still supported)
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
      this.callbacks?.onMoveInput(0, 0);
    };
    for (const [sel, dx, dy] of dpadDirs) {
      const btn = root.querySelector(sel) as HTMLButtonElement | null;
      if (!btn) continue;
      btn.addEventListener('click', (evt) => {
        if ((evt as MouseEvent).detail === 0) {
          this.callbacks?.onMoveInput(dx, dy);
        }
      });
      btn.addEventListener('pointerdown', () => {
        if (this.dpadRepeatTimer !== null) clearInterval(this.dpadRepeatTimer);
        this.callbacks?.onMoveInput(dx, dy);
        this.dpadRepeatTimer = setInterval(() => this.callbacks?.onMoveInput(dx, dy), 120);
      });
      btn.addEventListener('pointerup', stopRepeat);
      btn.addEventListener('pointercancel', stopRepeat);
      btn.addEventListener('pointerleave', stopRepeat);
    }

    // Battle Deck
    this.moveButtons.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        const moves = this.lastSnapshot?.battle.player.mon.moves ?? [];
        const allOutOfPp = moves.length > 0 && moves.every((m) => m.currentPp <= 0);
        if (allOutOfPp && idx === 0) {
          this.battleSwitchOpen = false;
          this.callbacks?.onBattleMove('struggle');
          return;
        }
        const move = moves[idx];
        if (move) {
          this.battleSwitchOpen = false;
          this.callbacks?.onBattleMove(move.id);
        }
      });
    });
    this.ballPokeBtn?.addEventListener('click', () => this.callbacks?.onBattleThrowBall('poke'));
    this.ballGreatBtn?.addEventListener('click', () => this.callbacks?.onBattleThrowBall('great'));
    this.ballStarBtn?.addEventListener('click', () => this.callbacks?.onBattleThrowBall('star'));
    this.potionBtn?.addEventListener('click', () => this.callbacks?.onBattleUsePotion());
    this.switchToggleBtn?.addEventListener('click', () => {
      if (this.lastSnapshot?.battle.phase === 'forced-switch') return;
      this.battleSwitchOpen = !this.battleSwitchOpen;
      this.memo.delete('b-switch');
      if (this.lastSnapshot) this.syncBattle(this.lastSnapshot);
    });
    this.switchDrawerEl?.addEventListener('click', (evt) => {
      const btn = (evt.target as HTMLElement | null)?.closest('[data-switch-idx]') as HTMLButtonElement | null;
      if (!btn) return;
      const idx = Number(btn.getAttribute('data-switch-idx'));
      if (Number.isInteger(idx)) {
        this.battleSwitchOpen = false;
        this.callbacks?.onBattleSwitchMember(idx);
      }
    });
    this.offlineRigBtn?.addEventListener('click', () => this.callbacks?.onBattleToggleOfflineRig());
    this.fleeBtn?.addEventListener('click', () => this.callbacks?.onBattleFlee());
    this.resultBannerEl?.addEventListener('click', (evt) => {
      const target = (evt.target as HTMLElement | null)?.closest('button') as HTMLButtonElement | null;
      if (!target) return;
      if (target.getAttribute('data-testid') === 'battle-confirm-evolution') {
        this.callbacks?.onBattleConfirmEvolution();
      } else if (target.getAttribute('data-testid') === 'battle-close-result') {
        this.callbacks?.onBattleCloseResult();
      }
    });

    // Unified 5-Tab Collector Drawer
    for (const [tab, btn] of this.drawerTabs) {
      btn.addEventListener('click', () => {
        const screen: ActiveScreen =
          tab === 'badges' ? 'badges' : tab === 'style' ? 'style-studio' : 'pokedex';
        this.callbacks?.onNavigateScreen(screen, tab);
      });
    }
    root.querySelector('[data-testid="drawer-close"]')?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('overworld');
    });

    // Settings Modal
    root.querySelector('[data-testid="settings-close"]')?.addEventListener('click', () => {
      const targetScreen: ActiveScreen =
        this.screenBeforeSettings !== 'settings'
          ? this.screenBeforeSettings
          : this.lastSnapshot?.profile
            ? 'overworld'
            : 'title';
      this.callbacks?.onNavigateScreen(targetScreen);
    });
    root.querySelector('[data-testid="setting-switch-trainer"]')?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('title');
    });
    this.setRendererSelect?.addEventListener('change', () => {
      if (this.setRendererSelect) {
        this.callbacks?.onUpdateSettings({ rendererOverride: this.setRendererSelect.value as RendererMode });
      }
    });
    this.setAudioBtn?.addEventListener('click', () => {
      const cur = Boolean(this.lastSnapshot?.save.settings.audioMuted);
      this.callbacks?.onUpdateSettings({ audioMuted: !cur });
    });
    this.setVolumeSlider?.addEventListener('input', () => {
      if (!this.setVolumeSlider) return;
      const val = Number(this.setVolumeSlider.value) / 100;
      if (this.setVolumeLabel) this.setVolumeLabel.textContent = `${Math.round(val * 100)}%`;
      this.callbacks?.onUpdateSettings({ masterVolume: val });
    });
    this.setMotionBtn?.addEventListener('click', () => {
      const cur = Boolean(this.lastSnapshot?.save.settings.reducedMotion);
      this.callbacks?.onUpdateSettings({ reducedMotion: !cur });
    });
    this.setCrtBtn?.addEventListener('click', () => {
      const cur = Boolean(this.lastSnapshot?.save.settings.crtMode);
      this.callbacks?.onUpdateSettings({ crtMode: !cur });
    });
    this.setTouchGroupEl?.addEventListener('click', (evt) => {
      const btn = (evt.target as HTMLElement | null)?.closest('[data-touch-val]') as HTMLButtonElement | null;
      const val = btn?.getAttribute('data-touch-val') as TouchPadMode | null;
      if (val) this.callbacks?.onUpdateSettings({ showTouchPad: val });
    });
    this.setPaceGroupEl?.addEventListener('click', (evt) => {
      const btn = (evt.target as HTMLElement | null)?.closest('[data-pace-val]') as HTMLButtonElement | null;
      const val = btn?.getAttribute('data-pace-val') as BattlePace | null;
      if (val) this.callbacks?.onUpdateSettings({ battlePace: val });
    });
    root.querySelector('[data-testid="setting-save-now"]')?.addEventListener('click', () => {
      this.callbacks?.onForceSave();
    });

    // Parent Zone 3-second hold reset
    const bindHoldReset = (sel: string, fillEl: HTMLElement | null, onConfirm: () => void) => {
      const btn = root.querySelector(sel) as HTMLButtonElement | null;
      if (!btn) return;
      const cancelHold = () => {
        if (this.holdTimerId !== null) {
          clearTimeout(this.holdTimerId);
          this.holdTimerId = null;
        }
        if (this.holdRafId !== null && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(this.holdRafId);
          this.holdRafId = null;
        }
        if (fillEl) fillEl.style.setProperty('--hold-progress', '0');
      };
      btn.addEventListener('pointerdown', () => {
        cancelHold();
        const startMs = Date.now();
        const updateFill = () => {
          const pct = Math.min(1, (Date.now() - startMs) / 3000);
          if (fillEl) fillEl.style.setProperty('--hold-progress', String(pct));
          if (pct < 1 && this.holdTimerId !== null && typeof requestAnimationFrame === 'function') {
            this.holdRafId = requestAnimationFrame(updateFill);
          }
        };
        this.holdTimerId = setTimeout(() => {
          cancelHold();
          onConfirm();
        }, 3000);
        if (typeof requestAnimationFrame === 'function') {
          this.holdRafId = requestAnimationFrame(updateFill);
        }
      });
      btn.addEventListener('pointerup', cancelHold);
      btn.addEventListener('pointerleave', cancelHold);
      btn.addEventListener('pointercancel', cancelHold);
    };

    bindHoldReset('[data-testid="parent-reset-trainer"]', this.parentTrainerProgressEl, () => {
      const tid = this.lastSnapshot?.profile?.trainerId ?? this.lastSnapshot?.save.activeTrainerId ?? 'violet';
      this.callbacks?.onResetTrainerProgress(tid);
    });
    bindHoldReset('[data-testid="parent-reset-all"]', this.parentAllProgressEl, () => {
      this.callbacks?.onResetAllProgress();
    });

    // Sky-Hop Arcade Controls (drag/press steering only - no accidental hover steer!)
    this.skyPauseBtn?.addEventListener('click', () => this.callbacks?.onToggleSkyHopPause());
    root.querySelector('[data-testid="skyhop-exit"]')?.addEventListener('click', () => {
      this.skyPointerDown = false;
      this.callbacks?.onCloseSkyHop();
    });
    this.skyDashBtn?.addEventListener('click', () => this.callbacks?.onSkyHopStarDash());

    const upBtn = root.querySelector('[data-testid="skyhop-up"]');
    const downBtn = root.querySelector('[data-testid="skyhop-down"]');
    upBtn?.addEventListener('pointerdown', () => this.callbacks?.onSkyHopKeyDir('up', true));
    upBtn?.addEventListener('pointerup', () => this.callbacks?.onSkyHopKeyDir('up', false));
    upBtn?.addEventListener('pointerleave', () => this.callbacks?.onSkyHopKeyDir('up', false));
    downBtn?.addEventListener('pointerdown', () => this.callbacks?.onSkyHopKeyDir('down', true));
    downBtn?.addEventListener('pointerup', () => this.callbacks?.onSkyHopKeyDir('down', false));
    downBtn?.addEventListener('pointerleave', () => this.callbacks?.onSkyHopKeyDir('down', false));

    const sendNormY = (evt: PointerEvent) => {
      if (!this.skyFlightSurface) return;
      const rect = this.skyFlightSurface.getBoundingClientRect();
      if (rect.height <= 0) return;
      const normY = Math.max(0, Math.min(1, (evt.clientY - rect.top) / rect.height));
      this.callbacks?.onSkyHopInputY(normY);
    };
    this.skyFlightSurface?.addEventListener('pointerdown', (evt) => {
      this.skyPointerDown = true;
      sendNormY(evt as PointerEvent);
    });
    this.skyFlightSurface?.addEventListener('pointermove', (evt) => {
      const pe = evt as PointerEvent;
      if (this.skyPointerDown || pe.buttons > 0) {
        sendNormY(pe);
      }
    });
    const endSkyPointer = () => {
      this.skyPointerDown = false;
      this.callbacks?.onSkyHopInputY(null);
    };
    this.skyFlightSurface?.addEventListener('pointerup', endSkyPointer);
    this.skyFlightSurface?.addEventListener('pointercancel', endSkyPointer);
    this.skyFlightSurface?.addEventListener('pointerleave', endSkyPointer);

    this.skyCenterCardEl?.addEventListener('click', (evt) => {
      const btn = (evt.target as HTMLElement | null)?.closest('button') as HTMLButtonElement | null;
      if (!btn) return;
      const action = btn.getAttribute('data-skyhop-action');
      if (action === 'start') this.callbacks?.onStartSkyHop();
      else if (action === 'resume') this.callbacks?.onToggleSkyHopPause();
      else if (action === 'buy-charge') this.callbacks?.onBuySkyHopCharge();
    });

    // Dialogue overlay clicks
    this.dialogueOverlay?.addEventListener('click', (evt) => {
      const btn = (evt.target as HTMLElement | null)?.closest('button') as HTMLButtonElement | null;
      if (!btn) return;
      const action = btn.getAttribute('data-dialogue-action');
      if (action === 'advance') this.callbacks?.onAdvanceDialogue();
      else if (action === 'confirm') this.lastSnapshot?.dialogue?.onConfirmAction?.();
      else if (action === 'dismiss') this.callbacks?.onDismissDialogue();
    });

    // Capturing Escape/X/Backspace guard: close open Battle Switch drawer before StarlightApp flees (GAP-3)
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this.escapeGuardHandler = (evt: KeyboardEvent) => {
        if (this.lastScreen !== 'battle') return;
        const isCancel = evt.key === 'Escape' || evt.key === 'Backspace' || evt.key === 'x' || evt.key === 'X';
        if (!isCancel) return;
        if (this.lastSnapshot?.battle.phase === 'forced-switch') {
          evt.preventDefault();
          evt.stopImmediatePropagation();
          return;
        }
        if (this.battleSwitchOpen) {
          evt.preventDefault();
          evt.stopImmediatePropagation();
          this.battleSwitchOpen = false;
          this.memo.delete('b-switch');
          if (this.lastSnapshot) this.syncBattle(this.lastSnapshot);
        }
      };
      window.addEventListener('keydown', this.escapeGuardHandler, true);
    }
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

    const activeTrainer = snapshot.profile?.trainerId ?? snapshot.save.activeTrainerId ?? 'violet';
    if (this.shellEl) {
      if (this.shellEl.getAttribute('data-trainer') !== activeTrainer) {
        this.shellEl.setAttribute('data-trainer', activeTrainer);
      }
      if (this.shellEl.getAttribute('data-active-screen') !== screen) {
        this.shellEl.setAttribute('data-active-screen', screen);
      }
    }

    const isDrawerScreen = screen === 'pokedex' || screen === 'badges' || screen === 'style-studio';

    if (this.lastScreen !== screen) {
      if (screen === 'settings' && this.lastScreen && this.lastScreen !== 'settings') {
        this.screenBeforeSettings = this.lastScreen;
      }
      // Suppress stale pre-navigation toasts (e.g. "Escaped safely.") when entering battle or any modal/drawer
      const suppressStale =
        screen === 'battle' ||
        isDrawerScreen ||
        screen === 'settings' ||
        screen === 'briefing' ||
        screen === 'skyhop';
      if (suppressStale) {
        this.suppressedTransitionToast = snapshot.toastMessage ? sanitizeNoEmoji(snapshot.toastMessage) : null;
      } else {
        this.suppressedTransitionToast = null;
      }
      if (screen === 'battle') {
        this.battleSwitchOpen = false;
      }
      this.lastScreen = screen;
      setHidden(this.titleScreen, screen !== 'title');
      setHidden(this.starterScreen, screen !== 'starter');
      setHidden(this.overworldScreen, screen !== 'overworld' && screen !== 'briefing');
      setHidden(this.briefingScreen, screen !== 'briefing');
      setHidden(this.battleScreen, screen !== 'battle');
      setHidden(this.drawerScreen, !isDrawerScreen);
      setHidden(this.settingsScreen, screen !== 'settings');
      setHidden(this.skyhopScreen, screen !== 'skyhop');
    }

    // Fixed-position Toast Banner (CLS === 0; suppresses stale transition toasts & hides while JRPG dialogue is open)
    const rawToast = snapshot.toastMessage ? sanitizeNoEmoji(snapshot.toastMessage) : '';
    const isStaleToast = rawToast !== '' && rawToast === this.suppressedTransitionToast;
    const cleanToast = isStaleToast || Boolean(snapshot.dialogue) ? '' : rawToast;
    if (this.suppressedTransitionToast !== null && rawToast !== this.suppressedTransitionToast) {
      this.suppressedTransitionToast = null;
    }

    if (cleanToast) {
      setHidden(this.toastEl, false);
      this.toastEl?.classList.add('is-visible');
      this.setMemoText('toast', this.toastEl, cleanToast);
    } else if (this.memo.get('toast') !== '') {
      this.memo.set('toast', '');
      this.toastEl?.classList.remove('is-visible');
      setHidden(this.toastEl, true);
    }

    // Animated Badge Unlock Toast
    if (snapshot.badgeToast) {
      const bt = snapshot.badgeToast;
      setHidden(this.badgeToastEl, false);
      this.badgeToastEl?.classList.add('is-visible');
      this.setMemoHtml(
        'badge-toast',
        this.badgeToastEl,
        `
          ${createIconSvg(bt.iconId, 'sl-icon-lg')}
          <div>
            <div style="font-size:10.5px; color:var(--sl-gold); font-weight:800; letter-spacing:0.08em;">BADGE UNLOCKED</div>
            <div style="font-family:var(--sl-font-display); font-size:15px;"><strong>${safeText(bt.name)}</strong></div>
            <div style="font-size:11.5px; color:var(--sl-text-secondary);">${safeText(bt.description)}</div>
          </div>
        `,
      );
    } else if (this.memo.get('badge-toast') !== '') {
      this.memo.set('badge-toast', '');
      this.badgeToastEl?.classList.remove('is-visible');
      setHidden(this.badgeToastEl, true);
    }

    const timeSec =
      snapshot.overworld.elapsedSeconds ||
      (typeof performance !== 'undefined' ? performance.now() * 0.001 : 0);
    const charSheet = this.getSheetImage?.('characters') ?? null;
    const fallbackSheet = this.getSheetImage?.('fallbacks') ?? null;
    const profile = snapshot.profile ?? snapshot.save.profiles.violet;

    if (screen === 'title') {
      this.syncTitle(snapshot, charSheet, fallbackSheet, timeSec);
    } else if (screen === 'starter') {
      this.starterLab.sync(profile, true, timeSec, {
        manifest: this.manifest,
        charactersSheet: charSheet,
        fallbacksSheet: fallbackSheet,
        spriteCacheVersion: snapshot.spriteCacheVersion,
        getFrames: (id) => this.getCachedFrames?.(id, false, false) ?? null,
      });
    } else if (screen === 'overworld' || screen === 'briefing') {
      this.syncOverworld(snapshot, profile, charSheet, fallbackSheet, timeSec);
      if (screen === 'briefing') {
        const b = snapshot.briefing;
        const bFrames = b ? this.getCachedFrames?.(b.previewSpeciesId, false, false) ?? null : null;
        this.briefingModal.sync(b, true, timeSec, {
          manifest: this.manifest,
          fallbacksSheet: fallbackSheet,
          frames: bFrames,
        });
      }
    } else if (screen === 'battle') {
      this.syncBattle(snapshot);
    } else if (isDrawerScreen) {
      this.syncDrawer(snapshot, profile, reducedMotion, timeSec, charSheet, fallbackSheet);
    } else if (screen === 'settings') {
      this.syncSettings(snapshot, reducedMotion, crtActive);
    } else if (screen === 'skyhop') {
      this.syncSkyHop(snapshot, fallbackSheet, timeSec);
    }

    this.syncDialogue(snapshot, charSheet);
  }

  private syncTitle(
    snapshot: UIRenderSnapshot,
    charSheet: HTMLImageElement | null,
    fallbackSheet: HTMLImageElement | null,
    timeSec: number,
  ): void {
    const activeId = snapshot.save.activeTrainerId;
    this.violetCard?.classList.toggle('is-selected', activeId === 'violet');
    this.oziasCard?.classList.toggle('is-selected', activeId === 'ozias');

    const renderMeta = (
      p: DojoProfileState,
      metaEl: HTMLElement | null,
      statsEl: HTMLElement | null,
      key: string,
      btnSel: string,
      tagline: string,
    ) => {
      const name = getCleanTrainerName(p, p.trainerId);
      const lv = getPlayerLevel(p);
      const caught = Object.values(p.pokedex.caught).filter((n) => Number(n) > 0).length;
      const lead = p.team[0];
      const leadSp = lead ? getSpeciesEntry(lead.speciesId) : null;
      const hasStarted = p.starterId !== null && p.team.length > 0;

      const metaHtml = `
        <div class="sl-profile-name-row">
          <span class="sl-profile-name">${safeText(name)}</span>
          <span class="sl-pill sl-pill-gold sl-num">Trainer Lv.${lv}</span>
        </div>
        <div class="sl-profile-tagline">${safeText(tagline)}</div>
      `;
      this.setMemoHtml(key, metaEl, metaHtml);

      const statsHtml = `
        <span class="sl-profile-stat">${createIconSvg('icon-pokedex', 'sl-icon-sm')} ${caught}/${TOTAL_SPECIES_COUNT}</span>
        <span class="sl-profile-stat">${createIconSvg('icon-badges', 'sl-icon-sm')} ${p.badges.length}/28 Badges</span>
        <span class="sl-profile-stat">
          ${leadSp ? createIconSvg(typeToIconId(leadSp.type), 'sl-icon-sm') : createIconSvg('icon-lab', 'sl-icon-sm')}
          ${leadSp ? `${safeText(stripEmojis(lead.nickname || leadSp.name))} Lv.${lead.level}` : 'Choose Starter'}
        </span>
      `;
      this.setMemoHtml(`${key}-stats`, statsEl, statsHtml);

      const ctaBtn = this.root?.querySelector(btnSel);
      const labelSpan = ctaBtn?.querySelector('span');
      if (labelSpan) {
        labelSpan.textContent = hasStarted ? 'Continue Adventure' : 'New Adventure';
      }
    };

    const v = snapshot.save.profiles.violet;
    const o = snapshot.save.profiles.ozias;
    renderMeta(v, this.violetMetaEl, this.violetStatsEl, 'title-v-meta', '[data-testid="title-play-violet"]', 'Starlight Mystic & Explorer');
    renderMeta(o, this.oziasMetaEl, this.oziasStatsEl, 'title-o-meta', '[data-testid="title-play-ozias"]', 'Thunder Champion & Ranger');

    const canvasStamp = [
      v.appearance.styleId,
      v.appearance.accessory,
      v.appearance.cape,
      v.appearance.aura,
      o.appearance.styleId,
      o.appearance.accessory,
      o.appearance.cape,
      o.appearance.aura,
      v.team[0]?.speciesId ?? 0,
      o.team[0]?.speciesId ?? 0,
      Boolean(charSheet),
      Boolean(fallbackSheet),
      snapshot.spriteCacheVersion,
    ].join('|');

    if (this.memo.get('title-canvases') !== canvasStamp || timeSec - this.lastTitleRenderTs >= 0.12) {
      this.memo.set('title-canvases', canvasStamp);
      this.lastTitleRenderTs = timeSec;
      if (this.violetPortraitCanvas) {
        renderTrainerPortraitCanvas(this.violetPortraitCanvas, 'violet', charSheet, this.manifest, v.appearance);
      }
      if (this.oziasPortraitCanvas) {
        renderTrainerPortraitCanvas(this.oziasPortraitCanvas, 'ozias', charSheet, this.manifest, o.appearance);
      }
      if (this.violetLeadCanvas) {
        setHidden(this.violetLeadCanvas, !v.team[0]);
        if (v.team[0]) {
          renderPokemonPreviewCanvas(
            this.violetLeadCanvas,
            v.team[0].speciesId,
            this.getCachedFrames?.(v.team[0].speciesId, false, v.team[0].isShiny) ?? null,
            fallbackSheet,
            this.manifest,
            v.team[0].isShiny,
            timeSec,
          );
        }
      }
      if (this.oziasLeadCanvas) {
        setHidden(this.oziasLeadCanvas, !o.team[0]);
        if (o.team[0]) {
          renderPokemonPreviewCanvas(
            this.oziasLeadCanvas,
            o.team[0].speciesId,
            this.getCachedFrames?.(o.team[0].speciesId, false, o.team[0].isShiny) ?? null,
            fallbackSheet,
            this.manifest,
            o.team[0].isShiny,
            timeSec,
          );
        }
      }
    }
  }

  private syncOverworld(
    snapshot: UIRenderSnapshot,
    profile: DojoProfileState,
    charSheet: HTMLImageElement | null,
    fallbackSheet: HTMLImageElement | null,
    timeSec: number,
  ): void {
    const ow = snapshot.overworld;
    const trainerName = getCleanTrainerName(profile, profile.trainerId);
    const lv = getPlayerLevel(profile);
    const bag = profile.bag;

    this.setMemoText('hud-name', this.hudTrainerNameEl, trainerName);
    this.setMemoText('hud-lv', this.hudTrainerLvEl, `Lv.${lv}`);
    this.setMemoText('hud-biome', this.hudBiomeNameEl, sanitizeNoEmoji(ow.currentBiomeName));

    // Lead Partner mini-sprite + live HP bar on top-left Adventurer Crest
    const lead = profile.team[0];
    if (lead) {
      const leadSp = getSpeciesEntry(lead.speciesId);
      const leadName = stripEmojis(lead.nickname || leadSp.name);
      const maxHp = getLeadMaxHp(lead);
      const hpRatio = Math.max(0, Math.min(1, lead.hp / Math.max(1, maxHp)));
      this.setMemoText('hud-lead', this.hudLeadLabelEl, `${leadName} Lv.${lead.level}`);
      if (this.hudLeadHpBarEl) {
        this.hudLeadHpBarEl.style.setProperty('--fill', String(hpRatio));
        this.hudLeadHpBarEl.setAttribute('data-low', String(hpRatio <= 0.25));
        this.hudLeadHpBarEl.setAttribute('data-mid', String(hpRatio > 0.25 && hpRatio <= 0.52));
      }
      if (this.hudLeadSpriteCanvas) {
        setHidden(this.hudLeadSpriteCanvas, false);
        const leadStamp = `${lead.speciesId}|${lead.isShiny}|${snapshot.spriteCacheVersion}|${Math.floor(timeSec * 6)}`;
        if (this.memo.get('hud-lead-sprite') !== leadStamp) {
          this.memo.set('hud-lead-sprite', leadStamp);
          renderPokemonPreviewCanvas(
            this.hudLeadSpriteCanvas,
            lead.speciesId,
            this.getCachedFrames?.(lead.speciesId, false, lead.isShiny) ?? null,
            fallbackSheet,
            this.manifest,
            lead.isShiny,
            timeSec,
          );
        }
      }
    } else {
      setHidden(this.hudLeadSpriteCanvas, true);
      this.setMemoText('hud-lead', this.hudLeadLabelEl, 'Visit Professor Willow');
      this.hudLeadHpBarEl?.style.setProperty('--fill', '1');
    }

    // Live portrait sync including accessory, cape & aura
    const portraitStamp = [
      profile.trainerId,
      profile.appearance.styleId,
      profile.appearance.accessory,
      profile.appearance.cape,
      profile.appearance.aura,
      Boolean(charSheet),
    ].join('|');
    if (this.memo.get('hud-portrait') !== portraitStamp && this.hudPortraitCanvas) {
      this.memo.set('hud-portrait', portraitStamp);
      renderTrainerPortraitCanvas(
        this.hudPortraitCanvas,
        profile.trainerId,
        charSheet,
        this.manifest,
        profile.appearance,
      );
    }

    const caughtCount = Object.values(profile.pokedex.caught).filter((n) => Number(n) > 0).length;
    const totalBalls = (bag.greatBalls ?? 0) + (bag.starBalls ?? 0);
    const econHtml = `
      <span class="sl-hud-chip">${createIconSvg('icon-pokedex', 'sl-icon-sm')} ${caughtCount}/${TOTAL_SPECIES_COUNT}</span>
      <span class="sl-hud-chip">${createIconSvg('icon-badges', 'sl-icon-sm')} ${profile.badges.length}/28</span>
      <span class="sl-hud-chip">${createIconSvg('icon-star-shard', 'sl-icon-sm')} ${bag.starShards}</span>
      <span class="sl-hud-chip">${createIconSvg('icon-potion', 'sl-icon-sm')} ${bag.potions}</span>
      <span class="sl-hud-chip">${createIconSvg('icon-starball', 'sl-icon-sm')} ${totalBalls}</span>
    `;
    this.setMemoHtml('hud-econ', this.hudEconomyEl, econHtml);

    // Compass Pill (crisp rotated SVG arrow; helpful exploration summary when target is null)
    if (ow.compassTarget) {
      const deg = Math.round((ow.compassTarget.angleRad * 180) / Math.PI);
      this.setMemoHtml(
        'hud-compass',
        this.hudCompassEl,
        `
          <span class="sl-compass-dial" aria-hidden="true">
            <span class="sl-compass-arrow" style="transform:rotate(${deg}deg);">${compassNeedleSvg()}</span>
          </span>
          <span class="sl-compass-label">${safeText(ow.compassTarget.label)}</span>
          <span class="sl-compass-dist sl-num">${ow.compassTarget.distanceTiles}m</span>
        `,
      );
    } else {
      const shrinesCleared = profile.shrinesCleared.length;
      this.setMemoHtml(
        'hud-compass',
        this.hudCompassEl,
        `
          <span class="sl-compass-dial" aria-hidden="true">${createIconSvg('icon-compass', 'sl-icon-sm')}</span>
          <span class="sl-compass-label">Island Guide • Shrines ${shrinesCleared}/20</span>
        `,
      );
    }

    // Area Transition Scroll Banner: ONLY display when entering a DIFFERENT biome (never duplicates initial spawn!)
    if (this.lastOverworldBiomeId === null) {
      this.lastOverworldBiomeId = ow.currentBiomeId;
      this.biomeBannerEl?.classList.remove('is-visible');
    } else {
      const changedBiome = this.lastOverworldBiomeId !== ow.currentBiomeId;
      if (changedBiome) {
        this.lastOverworldBiomeId = ow.currentBiomeId;
      }
      if (this.biomeBannerEl) {
        const showBanner = ow.biomeBannerTimer > 0 && (changedBiome || this.biomeBannerEl.classList.contains('is-visible'));
        this.biomeBannerEl.classList.toggle('is-visible', showBanner);
        if (showBanner) {
          const vp = getBiomeVisualProfile(ow.currentBiomeId);
          this.setMemoHtml(
            'biome-banner',
            this.biomeBannerEl,
            `
              ${createIconSvg(typeToIconId(vp.elementalType), 'sl-icon-md')}
              <div>
                <div class="sl-biome-name">${safeText(vp.displayName)}</div>
                <div class="sl-biome-sub">${safeText(vp.subtitle)}</div>
              </div>
            `,
          );
        }
      }
    }

    // Secret Sky-Hop Arcade dock button (hidden until unlocked at Secret Wall (11,12), matching v1 BUG-11)
    if (this.skyhopDockBtn) {
      const arcadeUnlocked = Boolean(profile.arcade?.unlocked);
      setHidden(this.skyhopDockBtn, !arcadeUnlocked);
      if (arcadeUnlocked) {
        const charges = profile.arcade?.charges ?? 0;
        this.setMemoHtml(
          'dock-skyhop',
          this.skyhopDockBtn,
          `${createIconSvg('icon-skyhop', 'sl-icon-sm')}<span class="sl-dock-label sl-dock-label-wide">Sky-Hop (${charges})</span>`,
        );
      }
    }

    // Audio icon on dock
    const muted = snapshot.save.settings.audioMuted;
    this.setMemoHtml(
      'dock-audio',
      this.audioToggleBtn,
      createIconSvg(muted ? 'icon-audio-off' : 'icon-audio-on', 'sl-icon-sm'),
    );
    this.audioToggleBtn?.setAttribute('aria-pressed', String(muted));

    // Contextual Interact Pill
    if (ow.nearbyInteraction) {
      const inter = ow.nearbyInteraction;
      setHidden(this.interactPillBtn, false);
      this.setMemoHtml(
        'interact-pill',
        this.interactPillBtn,
        `
          ${createIconSvg(INTERACT_ICON_MAP[inter.kind] ?? 'icon-waypoint', 'sl-icon-sm')}
          <span>${safeText(inter.actionVerb)}: ${safeText(inter.label)}</span>
        `,
      );
    } else if (this.memo.get('interact-pill') !== '') {
      this.memo.set('interact-pill', '');
      setHidden(this.interactPillBtn, true);
    }

    // Touch D-Pad mode
    if (this.dpadContainer) {
      const mode = snapshot.save.settings.showTouchPad;
      const isCoarse =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches;
      const active = mode === 'show' || (mode === 'auto' && isCoarse);
      this.dpadContainer.setAttribute('data-touch-active', String(active));
    }
  }

  private syncBattle(snapshot: UIRenderSnapshot): void {
    const battle = snapshot.battle;
    const p = battle.player.mon;
    const e = battle.enemy.mon;
    const commandReady = !battle.inputLocked && battle.phase === 'command';
    const bag = snapshot.profile?.bag ?? {
      potions: 0,
      greatBalls: 0,
      starBalls: 0,
      starShards: 0,
      cheerCharges: 0,
      gems: {},
    };
    const isEnemyCaught = Number(snapshot.profile?.pokedex?.caught?.[e.speciesId] ?? 0) > 0;

    this.battleDeckShellEl?.setAttribute('data-busy', String(!commandReady));
    if (this.battleTurnBadgeEl) {
      const label = battle.activeActionLabel ? sanitizeNoEmoji(battle.activeActionLabel) : '';
      setHidden(this.battleTurnBadgeEl, !label);
      if (label) this.setMemoText('b-turn-badge', this.battleTurnBadgeEl, label);
    }
    setHidden(this.battleCaretEl, !commandReady);

    // Enemy Crest Plate (Top-Left)
    this.setMemoText('b-e-name', this.enemyNameEl, `${sanitizeNoEmoji(e.displayName)} Lv.${e.level}`);
    const trait = getSanitizedTraitLabel(e.encounterTrait);
    const tierText =
      battle.tier === 'shrine-trial'
        ? `Trial #${battle.shrineTrialNumber}`
        : battle.tier === 'shrine'
          ? 'Shrine Guardian'
          : battle.tier === 'rival'
            ? battle.rivalName ?? 'Rival'
            : battle.tier === 'rare'
              ? 'Rare'
              : 'Wild';
    const eBadgesHtml = `
      <span class="sl-pill sl-type-pill" data-type="${e.type}">
        ${createIconSvg(typeToIconId(e.type), 'sl-icon-sm')}
        <span>${safeText(e.type.toUpperCase())}</span>
      </span>
      <span class="sl-pill">${safeText(tierText)}</span>
      ${isEnemyCaught ? `<span class="sl-pill sl-pill-emerald" data-testid="battle-enemy-caught">${createIconSvg('icon-pokeball', 'sl-icon-sm')} IN DEX</span>` : ''}
      ${e.isShiny ? `<span class="sl-pill sl-pill-gold">${createIconSvg('icon-sparkle', 'sl-icon-sm')} Shiny</span>` : ''}
      ${e.isElite ? `<span class="sl-pill sl-pill-gold">${createIconSvg('icon-crown', 'sl-icon-sm')} Elite</span>` : ''}
    `;
    this.setMemoHtml('b-e-badges', this.enemyBadgesEl, eBadgesHtml);

    const eMaxHp = Math.max(1, e.maxHp);
    const eDisplayedHp = Number.isFinite(battle.enemy.displayedHp) ? battle.enemy.displayedHp : e.hp;
    const eHpRatio = Math.max(0, Math.min(1, e.hp / eMaxHp));
    const eTrailRatio = Math.max(eHpRatio, Math.min(1, eDisplayedHp / eMaxHp));
    if (this.enemyHpBarEl) {
      this.enemyHpBarEl.style.setProperty('--fill', String(eHpRatio));
      this.enemyHpBarEl.setAttribute('data-low', String(eHpRatio <= 0.25));
      this.enemyHpBarEl.setAttribute('data-mid', String(eHpRatio > 0.25 && eHpRatio <= 0.52));
    }
    this.enemyHpTrailEl?.style.setProperty('--trail', String(eTrailRatio));
    this.setMemoText('b-e-hp', this.enemyHpValEl, `${Math.max(0, Math.round(eDisplayedHp))}/${e.maxHp}`);

    const eBuffHtml = `
      ${e.abilityName ? `<span class="sl-pill">${safeText(e.abilityName)}</span>` : ''}
      ${trait ? `<span class="sl-pill">${createIconSvg(trait.iconId, 'sl-icon-sm')} ${safeText(trait.label)}</span>` : ''}
      ${e.shieldTurns > 0 ? `<span class="sl-pill sl-pill-cyan">${createIconSvg('icon-shield', 'sl-icon-sm')} SHLD ${e.shieldTurns}T</span>` : ''}
      ${formatStages(e.battleStages)}
    `;
    this.setMemoHtml('b-e-buffs', this.enemyBuffsEl, eBuffHtml);

    // Rival Enemy Party Poké Ball Pips (powered by #36 enemyPartyPips!)
    const pips = battle.enemyPartyPips;
    if (Array.isArray(pips) && pips.length > 1) {
      const dots = pips
        .map((pip) => {
          const title = `${sanitizeNoEmoji(pip.name)} Lv.${pip.level}${pip.fainted ? ' (Fainted)' : pip.active ? ' (Active)' : ''}`;
          const style = pip.fainted
            ? 'opacity:0.24; filter:grayscale(1);'
            : pip.active
              ? 'color:var(--sl-brass-bright); filter:drop-shadow(0 0 4px rgba(255,230,153,0.75));'
              : 'opacity:0.9;';
          return `<span style="${style}" title="${safeText(title)}" data-pip-fainted="${pip.fainted}" data-pip-active="${pip.active}">${createIconSvg('icon-pokeball', 'sl-icon-sm')}</span>`;
        })
        .join('');
      this.setMemoHtml('b-e-dots', this.enemyRivalDotsEl, dots);
    } else if (battle.isTrainerBattle && battle.rivalTotalMons > 1) {
      const dots = Array.from({ length: battle.rivalTotalMons }, (_, i) => {
        const alive = i < battle.rivalRemainingMons;
        return `<span style="opacity:${alive ? 1 : 0.24};">${createIconSvg('icon-pokeball', 'sl-icon-sm')}</span>`;
      }).join('');
      this.setMemoHtml('b-e-dots', this.enemyRivalDotsEl, dots);
    } else {
      this.setMemoHtml('b-e-dots', this.enemyRivalDotsEl, '');
    }

    // Enemy Ability Activation Ribbon
    const eAb = battle.enemy.abilityBanner;
    if (eAb && this.enemyAbilityBannerEl) {
      setHidden(this.enemyAbilityBannerEl, false);
      this.setMemoHtml(
        'b-e-ab-ban',
        this.enemyAbilityBannerEl,
        `${createIconSvg('icon-sparkle', 'sl-icon-sm')} <strong>${safeText(sanitizeNoEmoji(eAb.name))}</strong> <span style="color:var(--sl-text); font-weight:700;">${safeText(sanitizeNoEmoji(eAb.summary))}</span>`,
      );
    } else {
      setHidden(this.enemyAbilityBannerEl, true);
    }

    // Player Crest Plate (Bottom-Right above console, clear of Player Sprite)
    this.setMemoText('b-p-name', this.playerNameEl, `${sanitizeNoEmoji(p.displayName)} Lv.${p.level}`);
    const pBadgesHtml = `
      <span class="sl-pill sl-type-pill" data-type="${p.type}">
        ${createIconSvg(typeToIconId(p.type), 'sl-icon-sm')}
        <span>${safeText(p.type.toUpperCase())}</span>
      </span>
      <span class="sl-pill sl-num" title="Bond">${createIconSvg('icon-bond', 'sl-icon-sm')} ${p.bond}</span>
      <span class="sl-pill sl-pill-gold sl-num" title="Star Rank">${createIconSvg('icon-star-rank', 'sl-icon-sm')} ${p.upgradeTier}</span>
    `;
    this.setMemoHtml('b-p-badges', this.playerBadgesEl, pBadgesHtml);

    const pMaxHp = Math.max(1, p.maxHp);
    const pDisplayedHp = Number.isFinite(battle.player.displayedHp) ? battle.player.displayedHp : p.hp;
    const pHpRatio = Math.max(0, Math.min(1, p.hp / pMaxHp));
    const pTrailRatio = Math.max(pHpRatio, Math.min(1, pDisplayedHp / pMaxHp));
    if (this.playerHpBarEl) {
      this.playerHpBarEl.style.setProperty('--fill', String(pHpRatio));
      this.playerHpBarEl.setAttribute('data-low', String(pHpRatio <= 0.25));
      this.playerHpBarEl.setAttribute('data-mid', String(pHpRatio > 0.25 && pHpRatio <= 0.52));
    }
    this.playerHpTrailEl?.style.setProperty('--trail', String(pTrailRatio));
    this.setMemoText('b-p-hp', this.playerHpValEl, `${Math.max(0, Math.round(pDisplayedHp))}/${p.maxHp}`);

    const pXpRatio = Number.isFinite(battle.player.displayedXpRatio)
      ? Math.max(0, Math.min(1, battle.player.displayedXpRatio))
      : Math.max(0, Math.min(1, p.xp / Math.max(1, p.xpToNext)));
    this.playerXpBarEl?.style.setProperty('--fill', String(pXpRatio));

    const pBuffHtml = `
      ${p.shieldTurns > 0 ? `<span class="sl-pill sl-pill-cyan">${createIconSvg('icon-shield', 'sl-icon-sm')} SHLD ${p.shieldTurns}T</span>` : ''}
      ${formatStages(p.battleStages)}
    `;
    this.setMemoHtml('b-p-buffs', this.playerBuffsEl, pBuffHtml);

    // Player Ability Activation Ribbon
    const pAb = battle.player.abilityBanner;
    if (pAb && this.playerAbilityBannerEl) {
      setHidden(this.playerAbilityBannerEl, false);
      this.setMemoHtml(
        'b-p-ab-ban',
        this.playerAbilityBannerEl,
        `${createIconSvg('icon-sparkle', 'sl-icon-sm')} <strong>${safeText(sanitizeNoEmoji(pAb.name))}</strong> <span style="color:var(--sl-text); font-weight:700;">${safeText(sanitizeNoEmoji(pAb.summary))}</span>`,
      );
    } else {
      setHidden(this.playerAbilityBannerEl, true);
    }

    // Crisp Single-Beat RPG Narration (COMBAT-12: matches v1 say() without truncating beats!)
    const beatMsg =
      sanitizeNoEmoji(battle.statusMessage) ||
      sanitizeNoEmoji(battle.battleLog[battle.battleLog.length - 1] ?? '') ||
      'Choose your next move!';
    this.setMemoText('b-msg', this.battleMsgEl, beatMsg);

    // 2x2 Vibrant Jewel Elemental Move Tiles (with Effectiveness Callout, Category Tag, PP Pips & Struggle guard)
    const allOutOfPp = p.moves.length > 0 && p.moves.every((m) => m.currentPp <= 0);
    this.moveButtons.forEach((btn, idx) => {
      if (allOutOfPp && idx === 0) {
        btn.style.visibility = 'visible';
        btn.disabled = !commandReady;
        btn.setAttribute('data-type', 'normal');
        this.setMemoHtml(
          'b-move-0',
          btn,
          `
            <div class="sl-move-top">
              <span class="sl-move-name-group">
                ${createIconSvg('icon-type-normal', 'sl-icon-sm')}
                <span class="sl-move-name">Struggle</span>
              </span>
              <span class="sl-eff-tag sl-eff-resist">RECOIL</span>
            </div>
            <div class="sl-move-meta sl-num">
              <span><span class="sl-move-cat-tag">PHY</span>PWR 35</span>
              <span class="sl-move-pp-wrap">Last Resort</span>
            </div>
          `,
        );
        return;
      }

      const m = p.moves[idx];
      if (!m) {
        btn.disabled = true;
        btn.style.visibility = 'hidden';
        return;
      }
      btn.style.visibility = 'visible';
      btn.disabled = !commandReady || m.currentPp <= 0;
      if (btn.getAttribute('data-type') !== m.type) {
        btn.setAttribute('data-type', m.type);
      }

      let catTag = 'PHY';
      let pwrText = `PWR ${m.power}`;
      let effTagHtml = '';

      if (m.id === 'struggle') {
        catTag = 'PHY';
        pwrText = `PWR ${m.power || 35}`;
        effTagHtml = `<span class="sl-eff-tag sl-eff-resist">RECOIL</span>`;
      } else if (m.category === 'attack') {
        catTag = m.damageClass === 'special' || (!m.damageClass && SPECIAL_TYPES.has(m.type)) ? 'SPC' : 'PHY';
        const mult = getTypeEffectiveness(m.type, e.type);
        if (mult === 0) {
          effTagHtml = `<span class="sl-eff-tag sl-eff-immune">0x IMMUNE</span>`;
        } else if (mult > 1) {
          effTagHtml = `<span class="sl-eff-tag sl-eff-super">${mult}x SUPER</span>`;
        } else if (mult < 1) {
          effTagHtml = `<span class="sl-eff-tag sl-eff-resist">${mult}x RESIST</span>`;
        }
      } else if (m.category === 'heal') {
        catTag = 'HEAL';
        pwrText = 'RECOVER';
        effTagHtml = `<span class="sl-eff-tag sl-eff-support">RESTORE</span>`;
      } else if (m.category === 'shield') {
        catTag = 'SHLD';
        pwrText = 'GUARD';
        effTagHtml = `<span class="sl-eff-tag sl-eff-support">BARRIER</span>`;
      } else {
        catTag = 'BUFF';
        pwrText = 'BOOST';
        effTagHtml = `<span class="sl-eff-tag sl-eff-support">STAT UP</span>`;
      }

      this.setMemoHtml(
        `b-move-${idx}`,
        btn,
        `
          <div class="sl-move-top">
            <span class="sl-move-name-group">
              ${createIconSvg(typeToIconId(m.type), 'sl-icon-sm')}
              <span class="sl-move-name">${safeText(m.name)}</span>
            </span>
            ${effTagHtml}
          </div>
          <div class="sl-move-meta sl-num">
            <span><span class="sl-move-cat-tag">${catTag}</span>${pwrText}</span>
            <span class="sl-move-pp-wrap">
              <span>PP ${m.currentPp}/${m.maxPp}</span>
              ${renderPpPips(m.currentPp, m.maxPp)}
            </span>
          </div>
        `,
      );
    });

    // Bag & Action Strip
    if (this.ballPokeBtn) this.ballPokeBtn.disabled = !commandReady || !battle.canCapture;
    if (this.ballGreatBtn) {
      this.ballGreatBtn.disabled = !commandReady || !battle.canCapture || bag.greatBalls <= 0;
      this.setMemoHtml(
        'b-great',
        this.ballGreatBtn,
        `${createIconSvg('icon-greatball', 'sl-icon-sm')} <span>Great (${bag.greatBalls})</span>`,
      );
    }
    if (this.ballStarBtn) {
      this.ballStarBtn.disabled = !commandReady || !battle.canCapture || bag.starBalls <= 0;
      this.setMemoHtml(
        'b-star',
        this.ballStarBtn,
        `${createIconSvg('icon-starball', 'sl-icon-sm')} <span>Star (${bag.starBalls})</span>`,
      );
    }
    if (this.potionBtn) {
      this.potionBtn.disabled = !commandReady || bag.potions <= 0 || p.hp >= p.maxHp;
      this.setMemoHtml(
        'b-pot',
        this.potionBtn,
        `${createIconSvg('icon-potion', 'sl-icon-sm')} <span>Potion (${bag.potions})</span>`,
      );
    }
    if (this.switchToggleBtn) {
      const teamCount = snapshot.profile?.team?.length ?? 1;
      const isForced = battle.phase === 'forced-switch';
      this.switchToggleBtn.disabled = isForced || !commandReady || teamCount <= 1;
      this.switchToggleBtn.setAttribute('aria-pressed', String(this.battleSwitchOpen || isForced));
    }
    if (this.fleeBtn) {
      this.fleeBtn.disabled = !commandReady || !battle.canRun;
    }
    if (this.offlineRigBtn) {
      this.offlineRigBtn.setAttribute('aria-pressed', String(battle.forceOfflineRig));
      this.offlineRigBtn.classList.toggle('is-active', battle.forceOfflineRig);
    }

    // Team Switch Drawer (supports voluntary switch + forced-switch phase from GAP-1)
    const isForcedSwitch = battle.phase === 'forced-switch';
    if ((isForcedSwitch || (this.battleSwitchOpen && commandReady)) && snapshot.profile) {
      setHidden(this.switchDrawerEl, false);
      const promptHtml = isForcedSwitch
        ? `<div class="sl-pill sl-pill-gold" data-testid="battle-forced-switch-prompt" style="width:100%; justify-content:center;">Choose your next Pokémon to continue!</div>`
        : '';
      const swHtml =
        promptHtml +
        snapshot.profile.team
          .map((m, idx) => {
            const sp = getSpeciesEntry(m.speciesId);
            const isCurrent = m.uid === p.uid;
            const fainted = m.hp <= 0;
            return `
              <button
                type="button"
                class="sl-btn"
                data-switch-idx="${idx}"
                data-testid="battle-switch-slot-${idx}"
                ${isCurrent || fainted ? 'disabled' : ''}
              >
                ${createIconSvg(typeToIconId(sp.type), 'sl-icon-sm')}
                <span>${safeText(stripEmojis(m.nickname || sp.name))} Lv.${m.level} (${m.hp} HP)</span>
              </button>
            `;
          })
          .join('');
      this.setMemoHtml('b-switch', this.switchDrawerEl, swHtml);
    } else {
      setHidden(this.switchDrawerEl, true);
    }

    // Victory / Defeat / Evolution Result Banner
    const showResult =
      battle.phase === 'evolving' || battle.phase === 'victory' || battle.phase === 'defeat';
    setHidden(this.resultBannerEl, !showResult);
    if (showResult) {
      if (battle.phase === 'evolving' && battle.evolutionTarget) {
        this.setMemoHtml(
          'b-result',
          this.resultBannerEl,
          `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; width:100%;">
              <div>
                <strong style="font-family:var(--sl-font-display); font-size:16px; color:var(--sl-gold-bright);">Evolution Ready!</strong>
                <div style="font-size:12.5px; color:var(--sl-text-secondary);">
                  ${safeText(p.displayName)} can evolve into ${safeText(battle.evolutionTarget.toName)}!
                </div>
              </div>
              <button type="button" class="sl-btn sl-btn-primary" data-testid="battle-confirm-evolution">
                ${createIconSvg('icon-evolve', 'sl-icon-sm')}
                <span>Evolve Now</span>
              </button>
            </div>
          `,
        );
      } else {
        const sum = battle.rewardSummary;
        const cleanDrop = sum?.trailDrop ? sanitizeNoEmoji(sum.trailDrop) : '';
        const summaryText = sum
          ? `+${sum.xpGained} XP • +${sum.shardsGained} Star Shards${sum.caught ? ' • Caught!' : ''}${sum.leveledUp ? ' • Level Up!' : ''}`
          : sanitizeNoEmoji(battle.statusMessage);
        const dropChipHtml = cleanDrop
          ? `<div style="margin-top:5px;"><span class="sl-pill sl-pill-gold" data-testid="battle-trail-drop">${createIconSvg('icon-gem', 'sl-icon-sm')} ${safeText(cleanDrop)}</span></div>`
          : '';
        this.setMemoHtml(
          'b-result',
          this.resultBannerEl,
          `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; width:100%;">
              <div>
                <strong style="font-family:var(--sl-font-display); font-size:16px; color:var(--sl-gold-bright);">${battle.phase === 'victory' ? 'Victory!' : 'Returned Safely'}</strong>
                <div style="font-size:12.5px; color:var(--sl-text-secondary);">${safeText(summaryText)}</div>
                ${dropChipHtml}
              </div>
              <button type="button" class="sl-btn sl-btn-primary" data-testid="battle-close-result">
                ${createIconSvg('icon-check', 'sl-icon-sm')}
                <span>Continue</span>
              </button>
            </div>
          `,
        );
      }
    }
  }

  private syncDrawer(
    snapshot: UIRenderSnapshot,
    profile: DojoProfileState,
    reducedMotion: boolean,
    timeSec: number,
    charSheet: HTMLImageElement | null,
    fallbackSheet: HTMLImageElement | null,
  ): void {
    const activeTab: DrawerTab =
      snapshot.screen === 'badges'
        ? 'badges'
        : snapshot.screen === 'style-studio'
          ? 'style'
          : snapshot.activeDrawerTab;

    for (const [tab, btn] of this.drawerTabs) {
      const selected = tab === activeTab;
      btn.classList.toggle('is-active', selected);
      btn.setAttribute('aria-selected', String(selected));
    }
    for (const [tab, panel] of this.drawerTabPanels) {
      setHidden(panel, tab !== activeTab);
    }

    if (activeTab === 'pokedex') {
      const frames = this.getCachedFrames?.(snapshot.selectedPokedexId, false, false) ?? null;
      this.pokedexView.sync(
        profile,
        snapshot.selectedPokedexId,
        snapshot.cryWaveform,
        reducedMotion,
        true,
        timeSec,
        {
          manifest: this.manifest,
          fallbacksSheet: fallbackSheet,
          frames,
          spriteCacheVersion: snapshot.spriteCacheVersion,
          getFrames: (id) => this.getCachedFrames?.(id, false, false) ?? null,
        },
      );
    } else if (activeTab === 'team') {
      this.teamBoxView.sync(profile, true, timeSec, {
        manifest: this.manifest,
        fallbacksSheet: fallbackSheet,
        getFrames: (id, shiny) => this.getCachedFrames?.(id, false, shiny) ?? null,
      });
    } else if (activeTab === 'badges') {
      this.badgesShowcase.sync(profile, snapshot.badges, true);
    } else if (activeTab === 'guide') {
      this.islandGuide.sync(profile, snapshot.overworld.currentBiomeId, true);
    } else if (activeTab === 'style') {
      const lead = profile.team[0];
      const leadFrames = lead
        ? this.getCachedFrames?.(lead.speciesId, false, lead.isShiny) ?? null
        : null;
      this.styleStudio.sync(profile, reducedMotion, true, timeSec, {
        manifest: this.manifest,
        charactersSheet: charSheet,
        fallbacksSheet: fallbackSheet,
        leadFrames,
      });
    }
  }

  private syncSettings(
    snapshot: UIRenderSnapshot,
    reducedMotion: boolean,
    crtActive: boolean,
  ): void {
    const s = snapshot.save.settings;
    if (this.setRendererSelect && this.root?.ownerDocument?.activeElement !== this.setRendererSelect) {
      this.setRendererSelect.value = s.rendererOverride;
    }
    this.setMemoHtml(
      's-audio',
      this.setAudioBtn,
      `${createIconSvg(s.audioMuted ? 'icon-audio-off' : 'icon-audio-on', 'sl-icon-sm')} <span>${s.audioMuted ? 'Muted' : 'Active'}</span>`,
    );
    this.setAudioBtn?.setAttribute('aria-pressed', String(s.audioMuted));

    const volPct = Math.round((s.masterVolume ?? 0.65) * 100);
    if (this.setVolumeSlider && this.root?.ownerDocument?.activeElement !== this.setVolumeSlider) {
      this.setVolumeSlider.value = String(volPct);
    }
    this.setMemoText('s-vol', this.setVolumeLabel, `${volPct}%`);

    this.setMemoHtml(
      's-motion',
      this.setMotionBtn,
      `${createIconSvg('icon-motion', 'sl-icon-sm')} <span>${reducedMotion ? 'On' : 'Off'}</span>`,
    );
    this.setMotionBtn?.setAttribute('aria-pressed', String(reducedMotion));

    this.setMemoHtml(
      's-crt',
      this.setCrtBtn,
      `${createIconSvg('icon-crt', 'sl-icon-sm')} <span>${crtActive ? 'On' : 'Off'}</span>`,
    );
    this.setCrtBtn?.setAttribute('aria-pressed', String(crtActive));

    this.setTouchGroupEl?.querySelectorAll('[data-touch-val]').forEach((el) => {
      const on = el.getAttribute('data-touch-val') === s.showTouchPad;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', String(on));
    });
    this.setPaceGroupEl?.querySelectorAll('[data-pace-val]').forEach((el) => {
      const on = el.getAttribute('data-pace-val') === s.battlePace;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', String(on));
    });

    const backendLabel = snapshot.capabilities.kind === 'webgl2' ? 'WebGL2' : 'Canvas2D';
    this.setMemoText(
      's-telem',
      this.setTelemetryEl,
      `${backendLabel} • ${Math.round(snapshot.frameStats.fps)} FPS`,
    );
  }

  private syncSkyHop(
    snapshot: UIRenderSnapshot,
    _fallbackSheet: HTMLImageElement | null,
    _timeSec: number,
  ): void {
    const sh = snapshot.skyhop;
    this.setMemoText('sh-score', this.skyScoreEl, String(sh.score));
    this.setMemoText('sh-wave', this.skyWaveEl, `${sh.wave}`);
    this.setMemoText('sh-combo', this.skyComboEl, `${sh.combo}x`);
    this.setMemoText('sh-high', this.skyHighEl, `${sh.highScore} (W${sh.bestWave})`);
    this.setMemoText('sh-charges', this.skyChargesEl, `${sh.charges}/${sh.maxCharges}`);

    const heartsHtml = Array.from({ length: sh.maxHearts }, (_, i) => {
      const filled = i < sh.hearts;
      return `<span style="opacity:${filled ? 1 : 0.22};">${createIconSvg('icon-cheer-heart', 'sl-icon-sm')}</span>`;
    }).join('');
    this.setMemoHtml('sh-hearts', this.skyHeartsEl, heartsHtml);

    const dashReadyRatio =
      sh.dashTimer > 0 ? 1 : Math.max(0, Math.min(1, 1 - sh.dashCooldown / 4.6));
    this.skyDashBarEl?.style.setProperty('--fill', String(dashReadyRatio));

    if (this.skyDashBtn) {
      this.skyDashBtn.disabled = !sh.running || sh.paused || sh.gameOver || sh.dashCooldown > 0 || sh.dashTimer > 0;
    }
    if (this.skyPauseBtn) {
      this.skyPauseBtn.disabled = !sh.running || sh.gameOver;
      this.setMemoHtml(
        'sh-pause',
        this.skyPauseBtn,
        `${createIconSvg(sh.paused ? 'icon-play' : 'icon-pause', 'sl-icon-sm')} <span>${sh.paused ? 'Resume' : 'Pause'}</span>`,
      );
    }

    const showWaveBanner = sh.running && !sh.paused && sh.waveBannerTimer > 0;
    setHidden(this.skyWaveBannerEl, !showWaveBanner);
    if (showWaveBanner) {
      this.setMemoText('sh-wban', this.skyWaveBannerEl, `Wave ${sh.wave}: ${sanitizeNoEmoji(sh.waveName)}`);
    }

    const showCenterCard = !sh.running || sh.paused || sh.gameOver || sh.outOfCharges;
    setHidden(this.skyCenterCardEl, !showCenterCard);
    if (showCenterCard) {
      const rewards = sh.lastRunRewards;
      const gemChips = rewards?.gems
        ? Object.entries(rewards.gems)
            .filter(([, count]) => Number(count) > 0)
            .map(([gemId, count]) => {
              const name = stripEmojis(EVO_ITEM_NAMES.get(gemId) ?? gemId);
              return `<span class="sl-pill sl-pill-gold">${createIconSvg('icon-gem', 'sl-icon-sm')} +${count} ${safeText(name)}</span>`;
            })
            .join('')
        : '';

      const rewardsHtml = rewards
        ? `
          <div class="sl-skyhop-rewards sl-glass-soft" data-testid="skyhop-rewards-card">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; justify-content:center;">
              <strong style="color:var(--sl-gold-bright);">${safeText(rewards.tierLabel)}</strong>
              ${rewards.isNewBest ? '<span class="sl-pill sl-pill-gold">NEW BEST</span>' : ''}
            </div>
            <div class="sl-num" style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center;">
              ${rewards.starShards > 0 ? `<span class="sl-pill">${createIconSvg('icon-star-shard', 'sl-icon-sm')} +${rewards.starShards} Shards</span>` : ''}
              ${rewards.potions > 0 ? `<span class="sl-pill">${createIconSvg('icon-potion', 'sl-icon-sm')} +${rewards.potions} Potions</span>` : ''}
              ${rewards.greatBalls > 0 ? `<span class="sl-pill">${createIconSvg('icon-greatball', 'sl-icon-sm')} +${rewards.greatBalls} Great</span>` : ''}
              ${rewards.starBalls > 0 ? `<span class="sl-pill">${createIconSvg('icon-starball', 'sl-icon-sm')} +${rewards.starBalls} Star</span>` : ''}
              ${rewards.cheerCharges > 0 ? `<span class="sl-pill">${createIconSvg('icon-cheer-heart', 'sl-icon-sm')} +${rewards.cheerCharges} Cheer</span>` : ''}
              ${gemChips}
            </div>
            <div style="font-size:11.5px; color:var(--sl-cyan);">${safeText(rewards.nextHint)}</div>
          </div>
        `
        : '';

      const actionButtons = sh.paused
        ? `
          <button type="button" class="sl-btn sl-btn-primary" data-skyhop-action="resume" data-testid="skyhop-resume">
            ${createIconSvg('icon-play', 'sl-icon-sm')}
            <span>Resume Flight</span>
          </button>
        `
        : sh.outOfCharges
          ? `
            <button type="button" class="sl-btn sl-btn-primary" data-skyhop-action="buy-charge" data-testid="skyhop-buy-charge" ${sh.canBuyWithShards ? '' : 'disabled'}>
              ${createIconSvg('icon-star-shard', 'sl-icon-sm')}
              <span>Buy Charge (${sh.shardBuyInCost} Shards — Have ${sh.starShards})</span>
            </button>
          `
          : `
            <button type="button" class="sl-btn sl-btn-primary" data-skyhop-action="start" data-testid="skyhop-start">
              ${createIconSvg('icon-skyhop', 'sl-icon-sm')}
              <span>${sh.gameOver ? 'Fly Again' : 'Launch Flight'}</span>
            </button>
          `;

      const centerHtml = `
        <span class="sl-pill sl-pill-cyan">
          ${createIconSvg(typeToIconId(sh.partnerType), 'sl-icon-sm')}
          <span>Partner Flight • ${safeText(sh.partnerName)}</span>
        </span>
        <h2 class="sl-modal-title" style="font-size:20px;">${
          sh.paused
            ? 'Sky-Hop Paused'
            : sh.outOfCharges
              ? 'Out of Flight Charges'
              : sh.gameOver
                ? `Flight Complete • ${sh.score} pts`
                : 'Starlight Sky-Hop Arcade'
        }</h2>
        <p style="margin:0; font-size:12.5px; color:var(--sl-text-secondary); line-height:1.45;">
          Hold &amp; drag or press Up/Down to gather Stars &amp; Comets. Activate Star Dash to shatter Storm Orbs!
        </p>
        ${rewardsHtml}
        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center; width:100%;">
          ${actionButtons}
        </div>
      `;
      this.setMemoHtml('sh-center', this.skyCenterCardEl, centerHtml);
    }
  }

  private syncDialogue(
    snapshot: UIRenderSnapshot,
    charSheet: HTMLImageElement | null,
  ): void {
    const dlg = snapshot.dialogue;
    if (!dlg) {
      if (this.memo.get('dlg') !== '') {
        this.memo.set('dlg', '');
        setHidden(this.dialogueOverlay, true);
      }
      return;
    }

    setHidden(this.dialogueOverlay, false);
    const line = dlg.lines[dlg.currentIndex] ?? dlg.lines[0] ?? '';
    const isLast = dlg.currentIndex >= dlg.lines.length - 1;
    const rewardHtml = (dlg.rewardTags ?? [])
      .map((r) => `<span class="sl-pill sl-pill-gold">${createIconSvg(r.iconId, 'sl-icon-sm')} ${safeText(r.label)}</span>`)
      .join('');

    const key = `${dlg.speaker}|${dlg.speakerPortrait ?? ''}|${dlg.title ?? ''}|${dlg.currentIndex}|${line}|${dlg.actionLabel ?? ''}|${rewardHtml}`;
    if (this.memo.get('dlg') !== key && this.dialogueOverlay) {
      this.memo.set('dlg', key);
      this.dialogueOverlay.innerHTML = `
        <div class="sl-dialogue-box sl-glass" role="dialog" aria-modal="true" aria-label="${safeText(dlg.speaker)}">
          <div class="sl-dialogue-nameplate">
            <strong class="sl-dialogue-speaker">${safeText(dlg.speaker)}</strong>
            ${dlg.title ? `<span class="sl-pill sl-pill-cyan" style="min-height:20px; padding:1px 7px; font-size:10.5px;">${safeText(dlg.title)}</span>` : ''}
          </div>
          <canvas class="sl-portrait-canvas" width="78" height="78" data-testid="dialogue-portrait-canvas" aria-hidden="true"></canvas>
          <div class="sl-dialogue-content">
            <p class="sl-dialogue-line">${safeText(line)}</p>
            ${rewardHtml ? `<div class="sl-dialogue-rewards">${rewardHtml}</div>` : ''}
            <div class="sl-dialogue-actions">
              ${
                !isLast
                  ? `<button type="button" class="sl-btn sl-btn-primary" data-dialogue-action="advance" data-testid="dialogue-next"><span>Next</span><span class="sl-rpg-caret" aria-hidden="true">${rpgCaretSvg()}</span></button>`
                  : dlg.actionLabel && dlg.onConfirmAction
                    ? `<button type="button" class="sl-btn sl-btn-primary" data-dialogue-action="confirm" data-testid="dialogue-confirm">${safeText(dlg.actionLabel)}</button>`
                    : ''
              }
              <button type="button" class="sl-btn" data-dialogue-action="dismiss" data-testid="dialogue-close">
                <span>${isLast ? 'Done' : 'Close'}</span>
                ${isLast ? `<span class="sl-rpg-caret" aria-hidden="true">${rpgCaretSvg()}</span>` : ''}
              </button>
            </div>
          </div>
        </div>
      `;

      const pCanvas = this.dialogueOverlay.querySelector('[data-testid="dialogue-portrait-canvas"]') as HTMLCanvasElement | null;
      if (pCanvas) {
        renderTrainerPortraitCanvas(
          pCanvas,
          dlg.speakerPortrait ?? 'willow',
          charSheet,
          this.manifest,
          snapshot.profile?.appearance,
        );
      }
    }
  }

  dispose(): void {
    if (this.escapeGuardHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('keydown', this.escapeGuardHandler, true);
      this.escapeGuardHandler = null;
    }
    if (this.dpadRepeatTimer !== null) {
      clearInterval(this.dpadRepeatTimer);
      this.dpadRepeatTimer = null;
    }
    if (this.holdTimerId !== null) {
      clearTimeout(this.holdTimerId);
      this.holdTimerId = null;
    }
    if (this.holdRafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.holdRafId);
      this.holdRafId = null;
    }
    this.starterLab.dispose();
    this.briefingModal.dispose();
    this.pokedexView.dispose();
    this.teamBoxView.dispose();
    this.badgesShowcase.dispose();
    this.islandGuide.dispose();
    this.styleStudio.dispose();
    this.drawerTabs.clear();
    this.drawerTabPanels.clear();
    if (this.root) {
      this.root.innerHTML = '';
    }
    this.memo.clear();
    this.moveButtons = [];
    this.root = null;
    this.shellEl = null;
    this.callbacks = null;
    this.lastSnapshot = null;
    this.lastScreen = null;
  }
}
