import type {
  ActiveScreen,
  AtlasManifest,
  BadgeToastState,
  BallKind,
  BattleSceneState,
  BiomeId,
  DialogueModalState,
  DojoBadgeEntry,
  DojoEvolutionItem,
  DrawerTab,
  EncounterTier,
  FrameStats,
  GameSettings,
  IconId,
  OverworldSceneState,
  RendererCapabilities,
  RendererMode,
  SaveHydrationResult,
  SkyHopState,
  StarlightSaveState,
  TacticalBriefingData,
  TrainerAccessoryId,
  TrainerAuraId,
  TrainerId,
  TrainerStyleId,
  UIBridgeCallbacks,
  UIRenderSnapshot,
} from '../contracts';
import {
  BIOMES,
  CHESTS,
  DojoBattleController,
  DojoOverworldSim,
  DojoSkyHopController,
  FIELD_QUESTS,
  NPCS,
  SpriteAssetLoader,
  StarlightAudioController,
  StarlightStorageBridge,
  formatCleanGameText,
  getAllBadges,
  getAllEvolutionItems,
  getSpeciesEntry,
  hydrateSaveState,
  persistSaveState,
  stripEmojis,
  type BattleActionOutcome,
} from '../core';
import { createRenderEngine, type RenderEngine } from '../graphics/engine';
import { OverworldRenderer } from '../graphics/overworld';
import { BattleTheaterRenderer } from '../graphics/battle';
import { SkyHopRenderer } from '../graphics/skyhop';
import { CelestialUIController, LivingTitleRenderer } from '../ui';

export interface StarlightDebugHandle {
  getState: () => {
    screen: ActiveScreen;
    activeDrawerTab: DrawerTab;
    backend: string;
    capabilities: RendererCapabilities;
    frameStats: FrameStats;
    hydrationSource: SaveHydrationResult['source'];
    activeTrainerId: TrainerId | null;
    biomeId: BiomeId;
    playerPos: { x: number; y: number };
    grassDisplacements: number;
    contextEvents: Array<{ type: string; previousBackend: string; activeBackend: string; reason?: string }>;
    save: StarlightSaveState;
    battleActive: boolean;
    battlePhase: BattleSceneState['phase'];
    battleShutterDuration: number;
    skyhopScore: number;
    manifestLoaded: boolean;
    spriteCacheVersion: number;
  };
  simulateContextLoss: () => boolean;
  switchRenderer: (mode: RendererMode) => Promise<string>;
  navigateScreen: (screen: ActiveScreen, drawerTab?: DrawerTab) => void;
  selectTrainer: (trainerId: TrainerId) => void;
  chooseStarter: (speciesId: number) => void;
  warpBiome: (biomeId: BiomeId) => void;
  travelBiome: (biomeId: BiomeId) => void;
  triggerEncounter: (tier: EncounterTier, options?: { biomeId?: BiomeId; forceSpeciesId?: number; shrineId?: string; rivalId?: string }) => void;
  openSkyHop: () => void;
  forceSave: () => Promise<void>;
  renderEngine?: unknown;
}

declare global {
  interface Window {
    __STARLIGHT_DEBUG__?: StarlightDebugHandle;
  }
}

const BIOME_BGM_MAP: Record<BiomeId, string> = {
  village: 'village',
  forest: 'forest',
  water: 'water',
  peak: 'peak',
  cave: 'cave',
  desert: 'desert',
  grove: 'grove',
  marsh: 'marsh',
  volcano: 'volcano',
  reef: 'reef',
  ruins: 'ruins',
  canyon: 'canyon',
  sanctum: 'sanctum',
  rift: 'rift',
  highlands: 'highlands',
  faeveldt: 'faeveldt',
  crater: 'crater',
  atoll: 'atoll',
};

function isDrawerScreen(screen: ActiveScreen): boolean {
  return screen === 'pokedex' || screen === 'badges' || screen === 'style-studio';
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function buildRewardTags(
  rewards: Record<string, unknown> | undefined | null,
  evolutionItemNames: ReadonlyMap<string, string>,
): Array<{ iconId: IconId; label: string }> {
  if (!rewards || typeof rewards !== 'object') return [];
  const tags: Array<{ iconId: IconId; label: string }> = [];
  const pushNum = (key: string, iconId: IconId, singular: string, plural: string) => {
    const val = Number(rewards[key] ?? 0);
    if (Number.isFinite(val) && val > 0) {
      tags.push({ iconId, label: `+${val} ${val === 1 ? singular : plural}` });
    }
  };
  pushNum('starShards', 'icon-star-shard', 'Star Shard', 'Star Shards');
  pushNum('potions', 'icon-potion', 'Potion', 'Potions');
  pushNum('greatBalls', 'icon-greatball', 'Great Ball', 'Great Balls');
  pushNum('starBalls', 'icon-starball', 'Star Ball', 'Star Balls');
  pushNum('cheerCharges', 'icon-cheer-heart', 'Cheer Charge', 'Cheer Charges');

  const gems = rewards.gems;
  if (gems && typeof gems === 'object') {
    for (const [gemId, qty] of Object.entries(gems as Record<string, unknown>)) {
      const count = Number(qty ?? 0);
      if (count > 0) {
        const name = stripEmojis(evolutionItemNames.get(gemId) ?? gemId);
        tags.push({ iconId: 'icon-gem', label: `+${count} ${name}` });
      }
    }
  }
  return tags;
}

export class StarlightApp {
  private readonly engine: RenderEngine = createRenderEngine();
  private readonly overworldRenderer = new OverworldRenderer();
  private readonly battleRenderer = new BattleTheaterRenderer();
  private readonly titleRenderer = new LivingTitleRenderer();
  private readonly skyHopRenderer = new SkyHopRenderer();
  private readonly ui = new CelestialUIController();
  private readonly audio = new StarlightAudioController();
  private readonly badges: DojoBadgeEntry[] = getAllBadges();
  private readonly evolutionItems: DojoEvolutionItem[] = getAllEvolutionItems();
  private readonly evolutionItemNames: Map<string, string> = new Map(
    this.evolutionItems.map((item) => [item.id, item.name]),
  );

  private storage!: StarlightStorageBridge;
  private sprites!: SpriteAssetLoader;
  private overworldSim!: DojoOverworldSim;
  private battleController!: DojoBattleController;
  private skyHopController!: DojoSkyHopController;

  private hydrationSource: SaveHydrationResult['source'] = 'fresh-default';
  private screen: ActiveScreen = 'title';
  private activeDrawerTab: DrawerTab = 'pokedex';
  private manifest: AtlasManifest | null = null;
  private briefing: TacticalBriefingData | null = null;
  private dialogue: DialogueModalState | null = null;
  private selectedPokedexId = 25;
  private toastMessage: string | null = null;
  private toastUntil = 0;
  private badgeToast: BadgeToastState | null = null;
  private autosaveAccum = 0;
  private uiSyncAccum = 0;
  private modalBgRenderAccum = 0;
  private lastSyncedBattlePhase = '';
  private lastSyncedSkyScore = -1;
  private cachedTitleSave: StarlightSaveState | null = null;
  private audioUnlocked = false;
  private currentBgmTheme = '';

  private readonly pressedKeys = new Set<string>();
  private touchMoveVec = { dx: 0, dy: 0 };
  private touchMoveTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly contextEvents: Array<{
    type: string;
    previousBackend: string;
    activeBackend: string;
    reason?: string;
  }> = [];

  private canvasEl!: HTMLCanvasElement;
  private stageShellEl: HTMLElement | null = null;
  private uiRootEl!: HTMLElement;

  private unsubContext: (() => void) | null = null;
  private unsubSprites: (() => void) | null = null;
  private keyDownHandler: ((e: KeyboardEvent) => void) | null = null;
  private keyUpHandler: ((e: KeyboardEvent) => void) | null = null;
  private blurHandler: (() => void) | null = null;
  private unlockAudioHandler: (() => void) | null = null;
  private stagePointerDownHandler: ((e: PointerEvent) => void) | null = null;

  async boot(): Promise<void> {
    const canvas = document.getElementById('starlight-canvas') as HTMLCanvasElement | null;
    const uiRoot = document.getElementById('ui-layer') as HTMLElement | null;
    if (!canvas || !uiRoot) {
      throw new Error('Missing #starlight-canvas or #ui-layer root elements.');
    }

    this.canvasEl = canvas;
    this.stageShellEl = document.getElementById('stage-shell');
    this.uiRootEl = uiRoot;

    const params = new URLSearchParams(window.location.search);
    const forceOfflineRig = params.get('offlineRig') === '1' || params.get('offlineRig') === 'true';

    // 1. Lossless non-destructive save hydration (schemaVersion 3, starlight_pokemon_save_v1 priority)
    const hydrated = await hydrateSaveState();
    this.hydrationSource = hydrated.source;
    this.storage = new StarlightStorageBridge(hydrated.state);

    // 2. Core C:\dojo gameplay modules + CORS-safe animated sprite loader
    this.sprites = new SpriteAssetLoader({ forceOffline: forceOfflineRig });
    this.overworldSim = new DojoOverworldSim(this.storage, this.sprites);
    this.battleController = new DojoBattleController(this.storage, this.sprites);
    this.skyHopController = new DojoSkyHopController(this.storage, this.sprites);

    // 3. Apply initial settings (audio, reduced motion, CRT)
    const settings = this.storage.getSettings();
    this.audio.setMuted(settings.audioMuted);
    this.audio.setMasterVolume(settings.masterVolume);
    this.applyDocumentPreferences(settings);

    // 4. Initialize dual WebGL2 / Canvas2D render engine
    await this.engine.init(this.canvasEl, {
      preferredMode: settings.rendererOverride,
      reducedMotion: settings.reducedMotion,
      crtMode: settings.crtMode,
    });
    this.syncRendererDocumentAttr();

    this.unsubContext = this.engine.onContextEvent((ev) => {
      this.syncRendererDocumentAttr();
      this.contextEvents.push({
        type: ev.type,
        previousBackend: ev.previousBackend,
        activeBackend: ev.activeBackend,
        reason: ev.reason,
      });
      if (this.contextEvents.length > 24) {
        this.contextEvents.shift();
      }
      if (ev.type === 'lost') {
        this.modalBgRenderAccum = 0.25;
        this.showToast('Graphics recovered seamlessly on Canvas2D.');
      } else if (ev.type === 'restored') {
        this.modalBgRenderAccum = 0.25;
        this.showToast('WebGL2 hardware graphics restored.');
      }
    });

    // 5. Load baked HD-2D pixel atlases & arenas from relative subpath `./atlases/manifest.json`
    try {
      this.manifest = await this.engine.loadManifest('./atlases/manifest.json');
    } catch {
      this.manifest = null;
    }

    const getArenaImg = (id: BiomeId | 'skyhop') => this.engine.getArenaImage(id);
    const getSheetImg = (sheetId: string) => this.engine.getSheetImage(sheetId);
    const getCachedSprite = (speciesId: number, back?: boolean, shiny?: boolean) =>
      this.sprites.getCached(speciesId, { back: Boolean(back), shiny: Boolean(shiny) });

    this.overworldRenderer.attachAtlas(this.manifest, getSheetImg);
    this.battleRenderer.attachAssets(this.manifest, getArenaImg, getSheetImg);

    const rigSynth = this.battleRenderer.getOfflineRigSynthesizer();
    this.titleRenderer.setRigSynthesizer(rigSynth);
    this.titleRenderer.attachAssets(this.manifest, getArenaImg, getSheetImg);

    this.skyHopRenderer.setRigSynthesizer(rigSynth);
    this.skyHopRenderer.attachAssets(this.manifest, getArenaImg, getSheetImg);

    this.ui.setRigSynthesizer(rigSynth);
    this.ui.attachAssets(this.manifest, getSheetImg, getCachedSprite);

    // Refresh follower/UI automatically whenever an animated sprite decodes
    this.unsubSprites = this.sprites.onUpdate(() => {
      this.overworldSim.refreshState();
    });

    // Preload title preview sprites & starters asynchronously (never blocks boot)
    this.preloadKeySprites();

    // 6. Mount Celestial Pixel-Glass UI shell
    this.ui.mount(this.uiRootEl, this.createUIBridgeCallbacks());

    // 7. Attach global keyboard, pointer tap-to-walk, and audio unlock handlers
    this.bindInputHandlers();
    this.exposeDebugHandle();
    this.registerServiceWorker();

    if (hydrated.source === 'dojo-v1-migrated' || hydrated.source === 'legacy-v1-migrated') {
      this.showToast('Imported your Starlight Island adventure save.');
    }

    // 8. Sync initial UI frame & launch locked-dt 60 FPS loop
    this.syncUI();
    this.engine.startLoop((dtSeconds, elapsedSeconds, backend) => {
      this.tick(dtSeconds, elapsedSeconds, backend);
    });
  }

  private preloadKeySprites(): void {
    const save = this.storage.toV3SaveState();
    const ids = new Set<number>([1, 4, 7, 25]);
    for (const tid of ['violet', 'ozias'] as const) {
      const lead = save.profiles[tid]?.team?.[0];
      if (lead?.speciesId) ids.add(lead.speciesId);
    }
    for (const id of ids) {
      void this.sprites.loadSpeciesSprite(id, { back: false, shiny: false });
    }
  }

  private registerServiceWorker(): void {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const isLocalOrSecure =
      window.isSecureContext ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    if (!isLocalOrSecure) return;
    void navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // Safe no-op in unsupported or blocked contexts
    });
  }

  private syncRendererDocumentAttr(): void {
    const caps = this.engine.activeBackend.capabilities;
    const isSoftware = Boolean(caps.isSoftwareRasterizer || caps.kind === 'canvas2d');
    document.documentElement.setAttribute('data-software-renderer', String(isSoftware));
  }

  private applyDocumentPreferences(settings: GameSettings): void {
    const root = document.documentElement;
    root.classList.toggle('crt-active', Boolean(settings.crtMode));
    root.classList.toggle('reduced-motion', Boolean(settings.reducedMotion));
    root.setAttribute('data-crt', String(Boolean(settings.crtMode)));
    root.setAttribute('data-reduced-motion', String(Boolean(settings.reducedMotion)));

    if (this.uiRootEl) {
      this.uiRootEl.setAttribute('data-reduced-motion', String(Boolean(settings.reducedMotion)));
    }

    const crtEl = document.getElementById('crt-overlay');
    if (crtEl) {
      crtEl.classList.toggle('is-active', Boolean(settings.crtMode));
    }
  }

  private ensureAudioUnlocked(): void {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    this.audio.unlock();
    this.syncBgmForCurrentScreen();
  }

  private syncBgmForCurrentScreen(): void {
    if (!this.audioUnlocked) return;
    let targetTheme = 'title';
    if (this.screen === 'title' || this.screen === 'starter') {
      targetTheme = 'title';
    } else if (this.screen === 'skyhop') {
      targetTheme = 'arcade';
    } else if (this.screen === 'battle') {
      const bState = this.battleController.getState();
      targetTheme = bState.isBoss ? 'boss' : 'battle';
    } else {
      const biomeId = this.overworldSim.getState().currentBiomeId;
      targetTheme = BIOME_BGM_MAP[biomeId] ?? 'overworld';
    }
    if (targetTheme !== this.currentBgmTheme) {
      this.currentBgmTheme = targetTheme;
      this.audio.playBGM(targetTheme);
    }
  }

  private showToast(message: string, durationMs = 2800): void {
    const clean = stripEmojis(message).trim();
    if (!clean) return;
    this.toastMessage = clean;
    this.toastUntil = Date.now() + durationMs;
  }

  private triggerBadgeToast(badgeIds: string[] | undefined): void {
    if (!badgeIds || badgeIds.length === 0) return;
    const firstId = badgeIds[0];
    const badge = this.badges.find((b) => b.id === firstId);
    if (!badge) return;
    this.badgeToast = {
      badgeId: badge.id,
      name: badge.name,
      description: badge.description,
      iconId: badge.iconId as IconId,
      remainingSec: 4.0,
    };
  }

  private createUIBridgeCallbacks(): UIBridgeCallbacks {
    return {
      onSelectTrainer: (trainerId: TrainerId) => {
        this.ensureAudioUnlocked();
        this.audio.playMenuBlip(660);
        this.handleSelectTrainer(trainerId);
      },

      onChooseStarter: (speciesId: number) => {
        this.ensureAudioUnlocked();
        this.handleChooseStarter(speciesId);
      },

      onNavigateScreen: (screen: ActiveScreen, drawerTab?: DrawerTab) => {
        this.ensureAudioUnlocked();
        this.audio.playMenuBlip(540);
        this.handleNavigateScreen(screen, drawerTab);
      },

      onOpenBriefingForBiome: (biomeId?: BiomeId) => {
        this.ensureAudioUnlocked();
        this.audio.playMenuBlip(580);
        const targetBiome = biomeId ?? this.overworldSim.getState().currentBiomeId;
        this.briefing = this.overworldSim.buildTacticalBriefing('biome', targetBiome, targetBiome);
        this.dialogue = null;
        this.screen = 'briefing';
        this.syncUI();
      },

      onConfirmBriefing: () => {
        this.ensureAudioUnlocked();
        this.handleConfirmBriefing();
      },

      onDismissBriefing: () => {
        this.audio.playMenuBlip(420);
        this.briefing = null;
        this.screen = 'overworld';
        this.syncBgmForCurrentScreen();
        this.syncUI();
      },

      onAdvanceDialogue: () => {
        this.ensureAudioUnlocked();
        this.audio.playMenuBlip(560);
        if (!this.dialogue) return;
        if (this.dialogue.currentIndex + 1 < this.dialogue.lines.length) {
          this.dialogue = {
            ...this.dialogue,
            currentIndex: this.dialogue.currentIndex + 1,
          };
        } else {
          const action = this.dialogue.onConfirmAction;
          this.dialogue = null;
          if (action) action();
        }
        this.syncUI();
      },

      onDismissDialogue: () => {
        this.audio.playMenuBlip(420);
        this.dialogue = null;
        this.syncUI();
      },

      onWarpSafeZone: () => {
        this.ensureAudioUnlocked();
        this.audio.playHealChime();
        this.storage.manager.healTeam(true);
        this.overworldSim.warpToSafeZone();
        this.briefing = null;
        this.dialogue = null;
        this.screen = 'overworld';
        this.showToast('Warped to Starlight Village and healed your team.');
        this.syncBgmForCurrentScreen();
        this.syncUI();
      },

      onWarpFarmZone: () => {
        this.ensureAudioUnlocked();
        this.audio.playMenuBlip(620);
        const res = this.overworldSim.warpToFarmZone();
        this.briefing = null;
        this.dialogue = null;
        this.screen = 'overworld';
        this.showToast(`Warped to recommended zone: ${res.biomeName}.`);
        this.syncBgmForCurrentScreen();
        this.syncUI();
      },

      onWarpBiome: (biomeId: BiomeId) => {
        this.ensureAudioUnlocked();
        this.audio.playMenuBlip(620);
        this.handleWarpBiome(biomeId);
      },

      onInteractNearby: () => {
        this.ensureAudioUnlocked();
        this.handleInteractNearby();
      },

      onTriggerEncounter: (tier: EncounterTier) => {
        this.ensureAudioUnlocked();
        this.handleStartBattle({
          biomeId: this.overworldSim.getState().currentBiomeId,
          tier,
        });
      },

      onBattleMove: (moveId: string) => {
        this.ensureAudioUnlocked();
        const outcome = this.battleController.performMove(moveId);
        this.applyBattleOutcome(outcome);
      },

      onBattleThrowBall: (kind: BallKind) => {
        this.ensureAudioUnlocked();
        const outcome = this.battleController.throwBall(kind);
        this.applyBattleOutcome(outcome);
      },

      onBattleUsePotion: () => {
        this.ensureAudioUnlocked();
        const outcome = this.battleController.usePotion();
        this.applyBattleOutcome(outcome);
      },

      onBattleSwitchMember: (teamIdx: number) => {
        this.ensureAudioUnlocked();
        const outcome = this.battleController.switchTeamMember(teamIdx);
        this.applyBattleOutcome(outcome);
      },

      onBattleFlee: () => {
        this.ensureAudioUnlocked();
        const outcome = this.battleController.flee();
        this.applyBattleOutcome(outcome);
        if (outcome.battleEnded === 'fled') {
          this.overworldSim.applyPostEscapeGrace();
          this.overworldSim.syncFromProfile();
          this.screen = 'overworld';
          this.syncBgmForCurrentScreen();
          this.showToast('Escaped safely.');
          this.syncUI();
        }
      },

      onBattleToggleOfflineRig: () => {
        this.ensureAudioUnlocked();
        const nowOffline = this.battleController.toggleOfflineRig();
        this.audio.playMenuBlip(nowOffline ? 460 : 620);
        this.showToast(nowOffline ? 'Offline Pixel Rig preview enabled.' : 'Live animated sprites enabled.');
        this.syncUI();
      },

      onBattleConfirmEvolution: () => {
        this.ensureAudioUnlocked();
        const outcome = this.battleController.confirmEvolution();
        this.applyBattleOutcome(outcome);
      },

      onBattleCloseResult: () => {
        this.ensureAudioUnlocked();
        this.battleController.closeBattle();
        this.overworldSim.syncFromProfile();
        this.screen = 'overworld';
        this.syncBgmForCurrentScreen();
        this.syncUI();
      },

      onSelectPokedexSpecies: (speciesId: number) => {
        this.ensureAudioUnlocked();
        this.selectedPokedexId = Math.max(1, Math.min(1025, Math.round(speciesId)));
        void this.sprites.loadSpeciesSprite(this.selectedPokedexId, { back: false, shiny: false });
        this.audio.playMenuBlip(600);
        this.syncUI();
      },

      onPlaySpeciesCry: (speciesId: number) => {
        this.ensureAudioUnlocked();
        const id = Math.max(1, Math.min(1025, Math.round(speciesId)));
        this.selectedPokedexId = id;
        this.audio.playSpeciesCry(id);
        this.syncUI();
      },

      onSetLeadPokemon: (teamIdx: number) => {
        this.ensureAudioUnlocked();
        if (this.storage.manager.setLeadPokemon(teamIdx)) {
          this.audio.playMenuBlip(700);
          this.overworldSim.refreshState();
          this.showToast('Updated your Lead Partner.');
          this.syncUI();
        }
      },

      onSwapTeamWithBox: (teamIdx: number, boxIdx: number) => {
        this.ensureAudioUnlocked();
        if (this.storage.manager.swapTeamWithBox(teamIdx, boxIdx)) {
          this.audio.playMenuBlip(640);
          this.overworldSim.refreshState();
          this.showToast('Swapped party and box Pokémon.');
          this.syncUI();
        }
      },

      onDepositToBox: (teamIdx: number) => {
        this.ensureAudioUnlocked();
        if (this.storage.manager.depositToBox(teamIdx)) {
          this.audio.playMenuBlip(520);
          this.overworldSim.refreshState();
          this.showToast('Moved Pokémon to Storage Box.');
          this.syncUI();
        } else {
          this.showToast('Keep at least one partner in your active party.');
        }
      },

      onWithdrawFromBox: (boxIdx: number) => {
        this.ensureAudioUnlocked();
        if (this.storage.manager.withdrawFromBox(boxIdx)) {
          this.audio.playMenuBlip(680);
          this.overworldSim.refreshState();
          this.showToast('Added Pokémon to your active party.');
          this.syncUI();
        } else {
          this.showToast('Your active team is already full (6 max).');
        }
      },

      onUpgradePokemon: (uid: string) => {
        this.ensureAudioUnlocked();
        const res = this.storage.manager.upgradePokemon(uid);
        if (res?.upgraded) {
          this.audio.playBadgeFanfare();
          this.overworldSim.refreshState();
          this.showToast(`Star-Rank upgraded to Tier ${res.newTier}!`);
          this.syncUI();
        } else {
          this.showToast(stripEmojis(res?.reason || 'Not enough Star Shards for upgrade.'));
        }
      },

      onCheerPokemon: (uid: string) => {
        this.ensureAudioUnlocked();
        const res = this.storage.manager.cheerPokemon(uid);
        if (res?.cheered) {
          this.audio.playHealChime();
          this.overworldSim.refreshState();
          this.showToast('Buddy Cheer boosted bond and recovered HP!');
          this.syncUI();
        } else {
          this.showToast(stripEmojis(res?.reason || 'Walk more steps to recharge Buddy Cheer!'));
        }
      },

      onHealPokemonWithPotion: (uid: string) => {
        this.ensureAudioUnlocked();
        const res = this.storage.manager.healPokemonWithPotion(uid);
        if (res?.healed) {
          this.audio.playHealChime();
          this.overworldSim.refreshState();
          this.showToast(`Restored ${res.amount ?? 0} HP with a Potion.`);
          this.syncUI();
        } else {
          this.showToast(stripEmojis(res?.reason || 'Cannot use Potion right now.'));
        }
      },

      onEvolvePokemon: (uid: string, toSpeciesId: number, itemKey?: string) => {
        this.ensureAudioUnlocked();
        const res = this.storage.manager.evolvePokemon(uid, toSpeciesId, itemKey ?? null);
        if (res?.evolution) {
          this.audio.playEvolveFanfare();
          this.overworldSim.refreshState();
          this.triggerBadgeToast(res.newBadges?.map((b: { id: string }) => b.id));
          this.showToast(`Evolved into ${stripEmojis(res.evolution.newName)}!`);
          this.syncUI();
        } else {
          this.showToast('Evolution requirements not met yet.');
        }
      },

      onRenamePokemon: (uid: string, nickname: string) => {
        this.ensureAudioUnlocked();
        const clean = stripEmojis(nickname).trim().slice(0, 16);
        this.storage.manager.setPokemonNickname(uid, clean);
        this.overworldSim.refreshState();
        this.showToast(clean ? `Renamed partner to ${clean}.` : 'Restored default species name.');
        this.syncUI();
      },

      onUpdateAppearance: (patch) => {
        this.ensureAudioUnlocked();
        if (typeof patch.nickname === 'string') {
          this.storage.manager.setTrainerNickname(stripEmojis(patch.nickname));
        }
        const stylePatch: Partial<{
          styleId: TrainerStyleId;
          accessory: TrainerAccessoryId;
          cape: boolean;
          aura: TrainerAuraId;
        }> = {};
        if (patch.styleId !== undefined) stylePatch.styleId = patch.styleId;
        if (patch.accessory !== undefined) stylePatch.accessory = patch.accessory;
        if (patch.cape !== undefined) stylePatch.cape = patch.cape;
        if (patch.aura !== undefined) stylePatch.aura = patch.aura;
        if (Object.keys(stylePatch).length > 0) {
          this.storage.manager.updateAppearance(stylePatch);
        }
        this.audio.playMenuBlip(640);
        this.overworldSim.refreshState();
        this.syncUI();
      },

      onUpdateSettings: (patch: Partial<GameSettings>) => {
        this.ensureAudioUnlocked();
        void this.handleUpdateSettings(patch);
      },

      onResetTrainerProgress: (trainerId: TrainerId) => {
        this.ensureAudioUnlocked();
        this.storage.manager.resetTrainerProgress(trainerId);
        this.overworldSim.syncFromProfile();
        this.battleController.closeBattle();
        this.skyHopController.close();
        this.briefing = null;
        this.dialogue = null;
        if (this.storage.manager.getActiveTrainerId() === trainerId) {
          this.screen = 'starter';
        }
        this.showToast(`Reset ${trainerId === 'ozias' ? 'Ozias' : 'Violet'}'s adventure progress.`);
        this.syncBgmForCurrentScreen();
        this.syncUI();
      },

      onResetAllProgress: () => {
        this.ensureAudioUnlocked();
        this.storage.manager.resetAllProgress();
        this.overworldSim.syncFromProfile();
        this.battleController.closeBattle();
        this.skyHopController.close();
        this.briefing = null;
        this.dialogue = null;
        this.screen = 'title';
        this.showToast('Reset all Starlight v2 profiles.');
        this.syncBgmForCurrentScreen();
        this.syncUI();
      },

      onOpenSkyHop: () => {
        this.ensureAudioUnlocked();
        this.handleOpenSkyHop();
      },

      onStartSkyHop: () => {
        this.ensureAudioUnlocked();
        const started = this.skyHopController.startNewRun();
        if (started) {
          this.audio.playArcadeBoost();
        } else {
          this.showToast('Out of Arcade Charges — buy one with Star Shards or walk/battle more!');
        }
        this.syncUI();
      },

      onBuySkyHopCharge: () => {
        this.ensureAudioUnlocked();
        if (this.skyHopController.buyChargeWithShards()) {
          this.audio.playChestOpen();
          this.showToast('Purchased +1 Sky-Hop Arcade Charge!');
        } else {
          this.showToast('Need more Star Shards to buy a charge.');
        }
        this.syncUI();
      },

      onToggleSkyHopPause: () => {
        this.skyHopController.togglePause();
        this.audio.playMenuBlip(480);
        this.syncUI();
      },

      onSkyHopInputY: (normY: number | null) => {
        this.skyHopController.setPointerNormY(normY);
      },

      onSkyHopKeyDir: (dir: 'up' | 'down', held: boolean) => {
        this.skyHopController.setKeyDir(dir, held);
      },

      onSkyHopStarDash: () => {
        this.ensureAudioUnlocked();
        if (this.skyHopController.activateDash()) {
          this.audio.playArcadeBoost();
        }
      },

      onCloseSkyHop: () => {
        this.skyHopController.close();
        this.overworldSim.refreshState();
        this.screen = 'overworld';
        this.syncBgmForCurrentScreen();
        this.syncUI();
      },

      onMoveInput: (dx: number, dy: number) => {
        this.ensureAudioUnlocked();
        if (this.screen !== 'overworld' || this.dialogue) return;
        this.touchMoveVec = { dx, dy };
        if (this.touchMoveTimeout) clearTimeout(this.touchMoveTimeout);
        if (dx !== 0 || dy !== 0) {
          const stepEv = this.overworldSim.stepDirection(dx, dy);
          this.handleOverworldStepEvent(stepEv);
          this.touchMoveTimeout = setTimeout(() => {
            this.touchMoveVec = { dx: 0, dy: 0 };
          }, 180);
        }
      },

      onTapWorldCanvas: (canvasX: number, canvasY: number, width: number, height: number) => {
        this.ensureAudioUnlocked();
        this.handleTapWorldCanvas(canvasX, canvasY, width, height);
      },

      onForceSave: () => {
        this.storage.saveSync();
        this.audio.playMenuBlip(740);
        this.showToast('Adventure saved.');
        this.syncUI();
      },
    };
  }

  private handleSelectTrainer(trainerId: TrainerId): void {
    this.storage.manager.selectTrainer(trainerId);
    const profile = this.storage.getActiveProfileJSON();
    this.overworldSim.syncFromProfile();
    this.briefing = null;
    this.dialogue = null;

    if (!profile || !profile.starterId || profile.team.length === 0) {
      this.screen = 'starter';
    } else {
      this.screen = 'overworld';
      const lead = profile.team[0];
      if (lead) {
        this.selectedPokedexId = lead.speciesId;
        void this.sprites.loadSpeciesSprite(lead.speciesId, { back: false, shiny: Boolean(lead.isShiny) });
      }
    }
    this.syncBgmForCurrentScreen();
    this.syncUI();
  }

  private handleChooseStarter(speciesId: number): void {
    const active = this.storage.manager.getActiveTrainerId();
    if (!active) {
      this.storage.manager.selectTrainer('violet');
    }
    this.storage.manager.chooseStarter(speciesId);
    this.storage.manager.healTeam(true);
    this.overworldSim.syncFromProfile();
    this.selectedPokedexId = speciesId;
    void this.sprites.loadSpeciesSprite(speciesId, { back: false, shiny: false });
    void this.sprites.loadSpeciesSprite(speciesId, { back: true, shiny: false });

    const sp = getSpeciesEntry(speciesId);
    this.audio.playVictoryFanfare();
    this.screen = 'overworld';
    this.showToast(`${sp.name} joined your Starlight journey!`);
    this.syncBgmForCurrentScreen();
    this.syncUI();
  }

  private handleNavigateScreen(screen: ActiveScreen, drawerTab?: DrawerTab): void {
    if (isDrawerScreen(screen)) {
      if (drawerTab) {
        this.activeDrawerTab = drawerTab;
      } else if (screen === 'badges') {
        this.activeDrawerTab = 'badges';
      } else if (screen === 'style-studio') {
        this.activeDrawerTab = 'style';
      } else {
        this.activeDrawerTab = 'pokedex';
      }
      if (this.activeDrawerTab === 'pokedex') {
        void this.sprites.loadSpeciesSprite(this.selectedPokedexId, { back: false, shiny: false });
      }
    }
    if (screen === 'skyhop') {
      this.handleOpenSkyHop();
      return;
    }
    if (screen === 'overworld') {
      this.briefing = null;
      this.dialogue = null;
      if (this.battleController.isActive()) {
        this.battleController.closeBattle();
      }
      if (this.skyHopController.getState().active) {
        this.skyHopController.close();
      }
      this.overworldSim.refreshState();
    }
    if (screen === 'title') {
      this.briefing = null;
      this.dialogue = null;
      this.battleController.closeBattle();
      this.skyHopController.close();
    }
    this.screen = screen;
    this.syncBgmForCurrentScreen();
    this.syncUI();
  }

  private handleWarpBiome(biomeId: BiomeId): void {
    this.overworldSim.warpToBiome(biomeId);
    this.briefing = null;
    this.dialogue = null;
    this.screen = 'overworld';
    const biomeName = stripEmojis(BIOMES[biomeId]?.name ?? biomeId);
    this.showToast(`Arrived at ${biomeName}.`);
    this.syncBgmForCurrentScreen();
    this.syncUI();
  }

  private handleOpenSkyHop(): void {
    if (!this.storage.manager.getActiveTrainerId()) {
      this.storage.manager.selectTrainer('violet');
    }
    this.briefing = null;
    this.dialogue = null;
    this.skyHopController.open();
    this.screen = 'skyhop';
    this.syncBgmForCurrentScreen();
    this.syncUI();
  }

  private handleConfirmBriefing(): void {
    const b = this.briefing;
    if (!b) return;
    this.briefing = null;

    if (b.kind === 'shrine' || b.kind === 'shrine-trial') {
      this.handleStartBattle({
        biomeId: b.biomeId,
        tier: b.kind,
        shrineId: b.targetId,
      });
      return;
    }
    if (b.kind === 'rival') {
      this.handleStartBattle({
        biomeId: b.biomeId,
        tier: 'rival',
        rivalId: b.targetId,
      });
      return;
    }

    // Biome scouting briefing -> launch a wild encounter in that biome (or forest if village)
    const targetBiome: BiomeId = b.biomeId === 'village' ? 'forest' : b.biomeId;
    this.handleStartBattle({
      biomeId: targetBiome,
      tier: 'wild',
    });
  }

  private handleStartBattle(options: {
    biomeId: BiomeId;
    tier: EncounterTier;
    shrineId?: string;
    rivalId?: string;
    depthTier?: number;
    isRarePatch?: boolean;
    forceSpeciesId?: number;
  }): void {
    if (!this.storage.manager.getActiveTrainerId()) {
      this.storage.manager.selectTrainer('violet');
    }
    const profile = this.storage.getActiveProfileJSON();
    if (!profile || profile.team.length === 0) {
      this.storage.manager.chooseStarter(25);
    }

    const reducedMotion = this.storage.getSettings().reducedMotion;
    this.battleController.startEncounter({
      ...options,
      reducedMotion,
      forceOfflineRig: this.sprites.isForceOffline(),
    });
    this.battleRenderer.triggerShutter(options.tier, reducedMotion);
    this.audio.playEncounterStinger();
    this.briefing = null;
    this.dialogue = null;
    this.screen = 'battle';
    this.syncBgmForCurrentScreen();
    this.syncUI();
  }

  private applyBattleOutcome(outcome: BattleActionOutcome): void {
    const reducedMotion = this.storage.getSettings().reducedMotion;
    for (const ev of outcome.vfxEvents) {
      this.battleRenderer.triggerVfx({
        type: ev.type,
        fromSide: ev.fromSide,
        targetSide: ev.targetSide,
        power: ev.power,
        effectiveness: ev.effectiveness,
        category: ev.category,
        composureBraced: ev.composureBraced,
        isCrit: ev.isCrit,
        duration: reducedMotion ? Math.min(0.28, ev.duration) : ev.duration,
      });
    }

    if (outcome.moveSfxId) {
      this.audio.playMoveSfx(outcome.moveSfxId, outcome.moveSfxFx);
    }
    for (const sfx of outcome.sfx) {
      if (sfx === 'hit') this.audio.playHit(false);
      else if (sfx === 'super-hit') this.audio.playHit(true);
      else if (sfx === 'heal') this.audio.playHealChime();
      else if (sfx === 'catch-throw') this.audio.playCatchThrow();
      else if (sfx === 'catch-success') this.audio.playCatchSuccess();
      else if (sfx === 'victory') this.audio.playVictoryFanfare();
      else if (sfx === 'badge') this.audio.playBadgeFanfare();
      else if (sfx === 'evolve') this.audio.playEvolveFanfare();
    }

    if (outcome.newBadgeIds && outcome.newBadgeIds.length > 0) {
      this.triggerBadgeToast(outcome.newBadgeIds);
    }
    this.syncUI();
  }

  private handleInteractNearby(): void {
    if (this.dialogue) {
      if (this.dialogue.currentIndex + 1 < this.dialogue.lines.length) {
        this.dialogue = { ...this.dialogue, currentIndex: this.dialogue.currentIndex + 1 };
      } else {
        const cb = this.dialogue.onConfirmAction;
        this.dialogue = null;
        if (cb) cb();
      }
      this.audio.playMenuBlip(560);
      this.syncUI();
      return;
    }

    const nearby = this.overworldSim.resolveNearbyInteractable();
    if (!nearby) return;

    if (nearby.kind === 'secret-arcade') {
      if (this.storage.manager.isArcadeUnlocked()) {
        this.handleOpenSkyHop();
        return;
      }
      const res = this.storage.manager.recordSecretKnock();
      this.overworldSim.refreshState();
      if (res?.unlocked) {
        this.audio.playBadgeFanfare();
        this.dialogue = {
          speaker: 'Secret Star Emblem',
          title: 'Starlight Sky-Hop Unlocked!',
          lines: [
            'The three starlight chimes resonate together and reveal a hidden arcade portal!',
            'Step inside anytime from here or the bottom dock to play Starlight Sky-Hop.',
          ],
          currentIndex: 0,
          actionLabel: 'Enter Sky-Hop',
          onConfirmAction: () => this.handleOpenSkyHop(),
        };
      } else {
        this.audio.playMenuBlip(740 + (res?.knocks ?? 1) * 110);
        this.dialogue = {
          speaker: 'Mysterious Star Emblem',
          lines: [
            `A glowing constellation chimed softly on the village wall (${res?.knocks ?? 1}/3 knocks).`,
          ],
          currentIndex: 0,
        };
      }
      this.syncUI();
      return;
    }

    if (nearby.kind === 'fountain') {
      this.storage.manager.healTeam(true);
      this.overworldSim.refreshState();
      this.audio.playHealChime();
      this.showToast('Starlight Healing Fountain restored your entire team and refilled Potions!');
      this.syncUI();
      return;
    }

    if (nearby.kind === 'shrine') {
      const sh = this.overworldSim.getState().shrines.find((s) => s.id === nearby.id);
      const kind = sh?.cleared ? 'shrine-trial' : 'shrine';
      this.briefing = this.overworldSim.buildTacticalBriefing(kind, nearby.id, sh?.biomeId);
      this.audio.playMenuBlip(640);
      this.screen = 'briefing';
      this.syncUI();
      return;
    }

    if (nearby.kind === 'rival') {
      const rv = this.overworldSim.getState().rivals.find((r) => r.id === nearby.id);
      this.briefing = this.overworldSim.buildTacticalBriefing('rival', nearby.id, rv?.biomeId);
      this.audio.playMenuBlip(640);
      this.screen = 'briefing';
      this.syncUI();
      return;
    }

    if (nearby.kind === 'chest') {
      const rawChest = Object.values(CHESTS).find((c) => c.id === nearby.id);
      if (rawChest && this.storage.manager.markChestOpened(rawChest.id)) {
        if (rawChest.rewards) {
          this.storage.manager.addRewards(rawChest.rewards, false);
        }
        const newBadges = this.storage.manager.evaluateBadges(true) || [];
        this.triggerBadgeToast(newBadges.map((b: { id: string }) => b.id));
        this.audio.playChestOpen();
        this.overworldSim.refreshState();
        this.dialogue = {
          speaker: stripEmojis(rawChest.label || 'Starlight Treasure Chest'),
          lines: [
            formatCleanGameText(rawChest.message || 'You opened the Starlight Treasure Chest!'),
          ],
          currentIndex: 0,
          rewardTags: buildRewardTags(rawChest.rewards, this.evolutionItemNames),
        };
        this.syncUI();
      }
      return;
    }

    if (nearby.kind === 'npc') {
      const rawNpc = Object.values(NPCS).find((n) => n.id === nearby.id);
      if (!rawNpc) return;
      this.storage.manager.markNpcTalked(rawNpc.id);
      const profileLive = this.storage.manager.getActiveProfile();
      const quest = FIELD_QUESTS.find((q) => q.npcId === rawNpc.id) ?? null;
      const doneSet = new Set<string>(profileLive?.questsCompleted ?? []);

      const isWillow = rawNpc.id.includes('willow') || rawNpc.name.toLowerCase().includes('willow');
      const portrait: DialogueModalState['speakerPortrait'] = isWillow ? 'willow' : undefined;

      if (quest && !doneSet.has(quest.id)) {
        const ready = typeof quest.check === 'function' ? Boolean(quest.check(profileLive)) : false;
        if (ready) {
          const qRes = this.storage.manager.completeQuest(quest.id, quest.rewards);
          this.audio.playBadgeFanfare();
          this.triggerBadgeToast(qRes?.newBadges?.map((b: { id: string }) => b.id));
          this.overworldSim.refreshState();
          const lines = (quest.completeDialogue?.length
            ? quest.completeDialogue
            : [`Quest complete: ${quest.title}! Thank you, {player}!`]
          ).map((l) => formatCleanGameText(l, { profile: profileLive }));
          this.dialogue = {
            speaker: stripEmojis(rawNpc.name),
            speakerPortrait: portrait,
            title: stripEmojis(quest.title),
            lines,
            currentIndex: 0,
            rewardTags: buildRewardTags(quest.rewards, this.evolutionItemNames),
          };
          this.syncUI();
          return;
        }

        const progressLine = typeof quest.progress === 'function'
          ? stripEmojis(quest.progress(profileLive))
          : stripEmojis(quest.description);
        const rawLines = quest.introDialogue?.length
          ? quest.introDialogue
          : quest.reminderDialogue?.length
            ? quest.reminderDialogue
            : [quest.description];
        const lines = [
          ...rawLines.map((l) => formatCleanGameText(l, { profile: profileLive })),
          `Progress: ${progressLine}`,
        ];
        this.audio.playMenuBlip(580);
        this.overworldSim.refreshState();
        this.dialogue = {
          speaker: stripEmojis(rawNpc.name),
          speakerPortrait: portrait,
          title: stripEmojis(quest.title),
          lines,
          currentIndex: 0,
        };
        this.syncUI();
        return;
      }

      const rawLines = rawNpc.dialogue?.length
        ? rawNpc.dialogue
        : rawNpc.lines?.length
          ? rawNpc.lines
          : rawNpc.greeting
            ? [rawNpc.greeting]
            : ['Welcome to Starlight Island, {player}!'];
      this.audio.playMenuBlip(560);
      this.overworldSim.refreshState();
      this.dialogue = {
        speaker: stripEmojis(rawNpc.name),
        speakerPortrait: portrait,
        lines: rawLines.map((l) => formatCleanGameText(l, { profile: profileLive })),
        currentIndex: 0,
      };
      this.syncUI();
      return;
    }

    if (nearby.kind === 'signpost') {
      const sign = this.overworldSim.getState().signposts.find((s) => s.id === nearby.id);
      if (sign) {
        this.audio.playMenuBlip(520);
        this.dialogue = {
          speaker: sign.title,
          lines: [sign.text],
          currentIndex: 0,
        };
        this.syncUI();
      }
    }
  }

  private handleTapWorldCanvas(canvasX: number, canvasY: number, width: number, height: number): void {
    if (this.screen !== 'overworld' || this.dialogue) return;
    if (width <= 0 || height <= 0) return;

    const ow = this.overworldSim.getState();
    const mapPxW = ow.cols * ow.tileSize;
    const mapPxH = ow.rows * ow.tileSize;
    const rawCenterX = (ow.player.x + 0.5) * ow.tileSize;
    const rawCenterY = (ow.player.y + 0.5) * ow.tileSize;

    const clampedCenterX = mapPxW <= width
      ? mapPxW * 0.5
      : Math.max(width * 0.5, Math.min(mapPxW - width * 0.5, rawCenterX));
    const clampedCenterY = mapPxH <= height
      ? mapPxH * 0.5
      : Math.max(height * 0.5, Math.min(mapPxH - height * 0.5, rawCenterY));

    const camX = clampedCenterX - width * 0.5;
    const camY = clampedCenterY - height * 0.5;

    const tileX = Math.max(0, Math.min(ow.cols - 1, Math.floor((camX + canvasX) / ow.tileSize)));
    const tileY = Math.max(0, Math.min(ow.rows - 1, Math.floor((camY + canvasY) / ow.tileSize)));

    // If tapping directly on or adjacent to an active nearby interactable, interact cleanly
    if (Math.hypot(tileX - ow.player.tileX, tileY - ow.player.tileY) <= 1.2) {
      const nearby = this.overworldSim.resolveNearbyInteractable();
      if (nearby && Math.hypot(nearby.x - tileX, nearby.y - tileY) <= 1.2) {
        this.handleInteractNearby();
        return;
      }
    }

    const path = this.overworldSim.setBfsTarget(tileX, tileY);
    if (path.length > 0) {
      this.audio.playMenuBlip(600);
    }
  }

  private handleOverworldStepEvent(ev: ReturnType<DojoOverworldSim['update']>): void {
    if (!ev || !ev.moved) return;
    this.audio.playStep(ev.onGrass);

    if (ev.discoveryPicked) {
      this.audio.playChestOpen();
      const label =
        ev.discoveryPicked.kind === 'starShard'
          ? '+2 Star Shards'
          : ev.discoveryPicked.kind === 'potion'
            ? '+1 Potion'
            : ev.discoveryPicked.kind === 'greatBall'
              ? '+1 Great Ball'
              : '+1 Buddy Cheer';
      this.showToast(`Found hidden treasure: ${label}!`);
    } else if (ev.stepArcadeChargeEarned) {
      this.showToast('Earned +1 Sky-Hop Arcade Charge from exploring!');
    } else if (ev.stepCheerEarned) {
      this.showToast('Buddy Cheer recharged!');
    }

    if (ev.biomeChanged) {
      this.syncBgmForCurrentScreen();
    }

    if (ev.wildEncounterTriggered) {
      this.handleStartBattle({
        biomeId: ev.wildEncounterTriggered.biomeId,
        tier: ev.wildEncounterTriggered.isRarePatch ? 'rare' : 'wild',
        depthTier: ev.wildEncounterTriggered.depthTier,
        isRarePatch: ev.wildEncounterTriggered.isRarePatch,
      });
    }
  }

  private async handleUpdateSettings(patch: Partial<GameSettings>): Promise<void> {
    const prev = this.storage.getSettings();
    const next = this.storage.updateSettings(patch);

    this.audio.setMuted(next.audioMuted);
    this.audio.setMasterVolume(next.masterVolume);
    this.applyDocumentPreferences(next);
    this.engine.activeBackend.setReducedMotion(next.reducedMotion);
    this.engine.activeBackend.setCrtMode(next.crtMode);

    if (patch.rendererOverride !== undefined && patch.rendererOverride !== prev.rendererOverride) {
      this.modalBgRenderAccum = 0.25;
      await this.engine.switchBackend(patch.rendererOverride, 'User preference updated');
      this.syncRendererDocumentAttr();
    }

    this.overworldSim.refreshState();
    this.syncUI();
  }

  private bindInputHandlers(): void {
    this.unlockAudioHandler = () => {
      this.ensureAudioUnlocked();
    };
    window.addEventListener('pointerdown', this.unlockAudioHandler, { passive: true });
    window.addEventListener('keydown', this.unlockAudioHandler, { passive: true });

    this.stagePointerDownHandler = (e: PointerEvent) => {
      if (this.screen !== 'overworld' || this.dialogue) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const canvas = this.engine.getCanvas() ?? this.canvasEl;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      this.handleTapWorldCanvas(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    };
    (this.stageShellEl ?? this.canvasEl).addEventListener('pointerdown', this.stagePointerDownHandler);

    this.keyDownHandler = (e: KeyboardEvent) => {
      if (isEditableElement(e.target)) return;
      const code = e.code;

      if (this.screen === 'skyhop') {
        if (code === 'ArrowUp' || code === 'KeyW') {
          e.preventDefault();
          this.skyHopController.setKeyDir('up', true);
        } else if (code === 'ArrowDown' || code === 'KeyS') {
          e.preventDefault();
          this.skyHopController.setKeyDir('down', true);
        } else if (code === 'Space') {
          e.preventDefault();
          if (this.skyHopController.activateDash()) {
            this.audio.playArcadeBoost();
          }
        } else if (code === 'KeyP' || code === 'Escape') {
          e.preventDefault();
          this.skyHopController.togglePause();
          this.syncUI();
        }
        return;
      }

      if (code === 'Escape') {
        if (this.dialogue) {
          this.dialogue = null;
          this.syncUI();
        } else if (isDrawerScreen(this.screen) || this.screen === 'settings' || this.screen === 'briefing') {
          this.briefing = null;
          this.screen = 'overworld';
          this.syncBgmForCurrentScreen();
          this.syncUI();
        }
        return;
      }

      if (this.screen === 'overworld') {
        if (
          code === 'ArrowUp' ||
          code === 'ArrowDown' ||
          code === 'ArrowLeft' ||
          code === 'ArrowRight' ||
          code === 'KeyW' ||
          code === 'KeyA' ||
          code === 'KeyS' ||
          code === 'KeyD'
        ) {
          e.preventDefault();
          this.pressedKeys.add(code);
          return;
        }
        if (code === 'Space' || code === 'Enter' || code === 'KeyE') {
          e.preventDefault();
          this.handleInteractNearby();
          return;
        }
        if (code === 'KeyB' && !this.dialogue) {
          e.preventDefault();
          this.briefing = this.overworldSim.buildTacticalBriefing(
            'biome',
            this.overworldSim.getState().currentBiomeId,
          );
          this.screen = 'briefing';
          this.syncUI();
          return;
        }
        if ((code === 'KeyM' || code === 'KeyP') && !this.dialogue) {
          e.preventDefault();
          this.activeDrawerTab = 'pokedex';
          this.screen = 'pokedex';
          this.syncUI();
        }
      }
    };

    this.keyUpHandler = (e: KeyboardEvent) => {
      const code = e.code;
      this.pressedKeys.delete(code);
      if (code === 'ArrowUp' || code === 'KeyW') {
        this.skyHopController.setKeyDir('up', false);
      } else if (code === 'ArrowDown' || code === 'KeyS') {
        this.skyHopController.setKeyDir('down', false);
      }
    };

    this.blurHandler = () => {
      this.pressedKeys.clear();
      this.touchMoveVec = { dx: 0, dy: 0 };
      this.skyHopController.setKeyDir('up', false);
      this.skyHopController.setKeyDir('down', false);
    };

    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
    window.addEventListener('blur', this.blurHandler);
  }

  private resolveHeldDirection(): { dx: number; dy: number } {
    let dx = this.touchMoveVec.dx;
    let dy = this.touchMoveVec.dy;
    if (this.pressedKeys.has('ArrowLeft') || this.pressedKeys.has('KeyA')) dx -= 1;
    if (this.pressedKeys.has('ArrowRight') || this.pressedKeys.has('KeyD')) dx += 1;
    if (this.pressedKeys.has('ArrowUp') || this.pressedKeys.has('KeyW')) dy -= 1;
    if (this.pressedKeys.has('ArrowDown') || this.pressedKeys.has('KeyS')) dy += 1;
    return { dx: Math.sign(dx), dy: Math.sign(dy) };
  }

  private tick(dtSeconds: number, elapsedSeconds: number, backend: RenderEngine['activeBackend']): void {
    const settings = this.storage.getSettings();
    let needsImmediateUiSync = false;

    // Expire toasts cleanly
    if (this.toastMessage && Date.now() >= this.toastUntil) {
      this.toastMessage = null;
      needsImmediateUiSync = true;
    }
    if (this.badgeToast) {
      this.badgeToast = {
        ...this.badgeToast,
        remainingSec: this.badgeToast.remainingSec - dtSeconds,
      };
      if (this.badgeToast.remainingSec <= 0) {
        this.badgeToast = null;
        needsImmediateUiSync = true;
      }
    }

    // Periodic background autosave (every 15 seconds)
    this.autosaveAccum += dtSeconds;
    if (this.autosaveAccum >= 15) {
      this.autosaveAccum = 0;
      this.storage.saveSync();
    }

    // Scene update & render dispatch
    if (this.screen === 'title' || this.screen === 'starter') {
      this.titleRenderer.update(dtSeconds, settings.reducedMotion);
      backend.beginFrame(elapsedSeconds, dtSeconds);
      this.titleRenderer.render(
        backend,
        this.cachedTitleSave ?? this.storage.toV3SaveState(),
        settings.reducedMotion,
      );
      backend.endFrame();
    } else if (this.screen === 'battle') {
      this.battleController.update(dtSeconds);
      const bState = this.battleController.getState();
      if (bState.phase !== this.lastSyncedBattlePhase) {
        this.lastSyncedBattlePhase = bState.phase;
        needsImmediateUiSync = true;
      }
      this.battleRenderer.update(bState, dtSeconds);
      backend.beginFrame(elapsedSeconds, dtSeconds);
      this.battleRenderer.render(backend, bState);
      backend.endFrame();
    } else if (this.screen === 'skyhop') {
      const ev = this.skyHopController.update(dtSeconds);
      const sState = this.skyHopController.getState();
      if (ev.collectedStar) this.audio.playArcadeStar(sState.combo);
      if (ev.healedHeart) this.audio.playHealChime();
      if (ev.hitHazard) this.audio.playArcadeBump();
      if (ev.runEnded) this.audio.playVictoryFanfare();
      if (sState.score !== this.lastSyncedSkyScore || ev.hitHazard || ev.runEnded || ev.healedHeart) {
        this.lastSyncedSkyScore = sState.score;
        needsImmediateUiSync = true;
      }
      this.skyHopRenderer.update(sState, dtSeconds);
      backend.beginFrame(elapsedSeconds, dtSeconds);
      this.skyHopRenderer.render(backend, sState);
      backend.endFrame();
    } else {
      const held = this.screen === 'overworld' && !this.dialogue
        ? this.resolveHeldDirection()
        : { dx: 0, dy: 0 };
      const stepEv = this.overworldSim.update(dtSeconds, held);
      if (stepEv) {
        this.handleOverworldStepEvent(stepEv);
        if (stepEv.moved) needsImmediateUiSync = true;
      }
      const owState = this.overworldSim.getState();
      this.overworldRenderer.update(owState, dtSeconds);

      const occludedByModal = isDrawerScreen(this.screen) || this.screen === 'settings';
      let shouldRenderOverworld = true;
      if (occludedByModal && dtSeconds > 0.0001) {
        this.modalBgRenderAccum += dtSeconds;
        if (this.modalBgRenderAccum < 0.25) {
          shouldRenderOverworld = false;
        } else {
          this.modalBgRenderAccum = 0;
        }
      } else {
        this.modalBgRenderAccum = 0.25;
      }

      if (shouldRenderOverworld) {
        backend.beginFrame(elapsedSeconds, dtSeconds);
        this.overworldRenderer.render(backend, owState);
        backend.endFrame();
      }
    }

    this.uiSyncAccum += dtSeconds;
    if (needsImmediateUiSync || this.uiSyncAccum >= 0.09) {
      this.uiSyncAccum = 0;
      this.syncUI();
    }
  }

  private buildSnapshot(): UIRenderSnapshot {
    const save = this.storage.toV3SaveState();
    this.cachedTitleSave = save;
    const profile = this.storage.getActiveProfileJSON();
    return {
      screen: this.screen,
      activeDrawerTab: this.activeDrawerTab,
      save,
      profile,
      overworld: this.overworldSim.getState(),
      battle: this.battleController.getState(),
      skyhop: this.skyHopController.getState(),
      briefing: this.briefing,
      dialogue: this.dialogue,
      badges: this.badges,
      evolutionItems: this.evolutionItems,
      capabilities: this.engine.activeBackend.capabilities,
      frameStats: this.engine.getStats(),
      toastMessage: this.toastMessage,
      badgeToast: this.badgeToast,
      selectedPokedexId: this.selectedPokedexId,
      cryWaveform: this.audio.getCryWaveformSnapshot(this.selectedPokedexId),
      spriteCacheVersion: this.sprites.getVersion(),
    };
  }

  private syncUI(): void {
    this.ui.sync(this.buildSnapshot());
  }

  private exposeDebugHandle(): void {
    const existingRenderEngine = (window.__STARLIGHT_DEBUG__ as { renderEngine?: unknown } | undefined)?.renderEngine;

    const handle: StarlightDebugHandle = {
      renderEngine: existingRenderEngine,
      getState: () => {
        const save = this.storage.toV3SaveState();
        const ow = this.overworldSim.getState();
        const b = this.battleController.getState();
        const sh = this.skyHopController.getState();
        return {
          screen: this.screen,
          activeDrawerTab: this.activeDrawerTab,
          backend: this.engine.activeBackend.kind,
          capabilities: this.engine.activeBackend.capabilities,
          frameStats: this.engine.getStats(),
          hydrationSource: this.hydrationSource,
          activeTrainerId: save.activeTrainerId,
          biomeId: ow.currentBiomeId,
          playerPos: { x: ow.player.tileX, y: ow.player.tileY },
          grassDisplacements: this.overworldRenderer.getDisplacementCount(),
          contextEvents: [...this.contextEvents],
          save,
          battleActive: b.active,
          battlePhase: b.phase,
          battleShutterDuration: b.shutter.duration,
          skyhopScore: sh.score,
          manifestLoaded: this.manifest !== null,
          spriteCacheVersion: this.sprites.getVersion(),
        };
      },
      simulateContextLoss: () => this.engine.simulateContextLoss(),
      switchRenderer: async (mode: RendererMode) => {
        const res = await this.engine.switchBackend(mode, 'Debug switchRenderer');
        this.storage.updateSettings({ rendererOverride: mode });
        this.syncUI();
        return res;
      },
      navigateScreen: (screen: ActiveScreen, drawerTab?: DrawerTab) => {
        this.handleNavigateScreen(screen, drawerTab);
      },
      selectTrainer: (trainerId: TrainerId) => {
        this.handleSelectTrainer(trainerId);
      },
      chooseStarter: (speciesId: number) => {
        this.handleChooseStarter(speciesId);
      },
      warpBiome: (biomeId: BiomeId) => {
        if (BIOMES[biomeId]) {
          this.handleWarpBiome(biomeId);
        }
      },
      travelBiome: (biomeId: BiomeId) => {
        if (BIOMES[biomeId]) {
          this.handleWarpBiome(biomeId);
        }
      },
      triggerEncounter: (tier: EncounterTier, options) => {
        this.handleStartBattle({
          biomeId: options?.biomeId ?? this.overworldSim.getState().currentBiomeId,
          tier,
          forceSpeciesId: options?.forceSpeciesId,
          shrineId: options?.shrineId,
          rivalId: options?.rivalId,
        });
      },
      openSkyHop: () => {
        this.handleOpenSkyHop();
      },
      forceSave: async () => {
        await persistSaveState(this.storage.toV3SaveState());
      },
    };

    window.__STARLIGHT_DEBUG__ = handle;
  }

  dispose(): void {
    this.engine.stopLoop();
    this.unsubContext?.();
    this.unsubSprites?.();
    this.unsubContext = null;
    this.unsubSprites = null;

    if (this.touchMoveTimeout) {
      clearTimeout(this.touchMoveTimeout);
      this.touchMoveTimeout = null;
    }
    if (this.unlockAudioHandler) {
      window.removeEventListener('pointerdown', this.unlockAudioHandler);
      window.removeEventListener('keydown', this.unlockAudioHandler);
    }
    if (this.stagePointerDownHandler) {
      (this.stageShellEl ?? this.canvasEl)?.removeEventListener('pointerdown', this.stagePointerDownHandler);
    }
    if (this.keyDownHandler) window.removeEventListener('keydown', this.keyDownHandler);
    if (this.keyUpHandler) window.removeEventListener('keyup', this.keyUpHandler);
    if (this.blurHandler) window.removeEventListener('blur', this.blurHandler);

    this.audio.stopBGM();
    this.ui.dispose();
    this.engine.dispose();
  }
}

export type { OverworldSceneState, SkyHopState };
