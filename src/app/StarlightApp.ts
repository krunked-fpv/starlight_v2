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
  OverworldCameraSnapshot,
  OverworldSceneState,
  OverworldScreenProjection,
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
  LANDMARKS,
  NPCS,
  RIVAL_TRAINERS,
  SHRINES,
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
    camera: OverworldCameraSnapshot;
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
  tileToScreen: (tx: number, ty: number) => OverworldScreenProjection;
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
  village: 'overworld',
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

function normalizeDialogueLines(raw: string | string[] | undefined | null): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((line): line is string => typeof line === 'string' && line.trim().length > 0);
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return [raw];
  }
  return [];
}

const DIRECTION_KEYS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  KeyA: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  KeyD: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  KeyW: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  KeyS: { dx: 0, dy: 1 },
};

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
  private screenBeforeSettings: ActiveScreen = 'overworld';
  private activeDrawerTab: DrawerTab = 'pokedex';
  private manifest: AtlasManifest | null = null;
  private briefing: TacticalBriefingData | null = null;
  private dialogue: DialogueModalState | null = null;
  private selectedPokedexId = 25;
  private toastMessage: string | null = null;
  private toastUntil = 0;
  private badgeToast: BadgeToastState | null = null;
  private readonly badgeQueue: string[] = [];
  private autosaveAccum = 0;
  private uiSyncAccum = 0;
  private modalBgRenderAccum = 0;
  private lastSyncedBattlePhase = '';
  private lastSyncedSkyScore = -1;
  private cachedTitleSave: StarlightSaveState | null = null;
  private audioUnlocked = false;
  private currentBgmTheme = '';

  private readonly pressedKeys = new Set<string>();
  private readonly dirStack: Array<{ code: string; dx: number; dy: number }> = [];
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
  private stagePointerMoveHandler: ((e: PointerEvent) => void) | null = null;
  private stagePointerUpHandler: ((e: PointerEvent) => void) | null = null;
  private activeDragPointerId: number | null = null;
  private dragStartClient = { x: 0, y: 0 };
  private isDraggingSteer = false;
  private readonly battleSfxTimers: Array<ReturnType<typeof setTimeout>> = [];

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
    const getCachedSprite = (speciesId: number, back?: boolean, shiny?: boolean) => {
      const opts = { back: Boolean(back), shiny: Boolean(shiny) };
      const cached = this.sprites.getCached(speciesId, opts);
      if (!cached && !this.sprites.isForceOffline() && this.sprites.getInflightCount() < 16) {
        void this.sprites.loadSpeciesSprite(speciesId, opts);
      }
      return cached;
    };

    this.overworldRenderer.attachAtlas(this.manifest, getSheetImg);
    this.battleRenderer.attachAssets(this.manifest, getArenaImg, getSheetImg);

    const rigSynth = this.battleRenderer.getOfflineRigSynthesizer();
    this.titleRenderer.setRigSynthesizer(rigSynth);
    this.titleRenderer.attachAssets(this.manifest, getArenaImg, getSheetImg);

    this.skyHopRenderer.setRigSynthesizer(rigSynth);
    this.skyHopRenderer.attachAssets(this.manifest, getArenaImg, getSheetImg);

    this.ui.setRigSynthesizer(rigSynth);
    this.ui.attachAssets(this.manifest, getSheetImg, getCachedSprite);

    // Refresh follower/UI automatically whenever an animated sprite decodes (#34, R2-VIS-02)
    this.unsubSprites = this.sprites.onUpdate(() => {
      this.overworldSim.refreshState();
      this.uiSyncAccum = 0.2;
      if (this.screen === 'starter' || this.screen === 'title' || isDrawerScreen(this.screen)) {
        this.syncUI();
      }
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
      targetTheme = bState.shrineId ? 'shrine' : bState.isTrainerBattle ? 'rival' : 'battle';
    } else {
      const biomeId = this.overworldSim.getState().currentBiomeId;
      targetTheme = BIOME_BGM_MAP[biomeId] ?? 'overworld';
    }
    if (targetTheme !== this.currentBgmTheme) {
      this.currentBgmTheme = targetTheme;
      this.audio.playBGM(targetTheme);
    }
  }

  private clearMovementInputs(): void {
    this.pressedKeys.clear();
    this.dirStack.length = 0;
    this.touchMoveVec = { dx: 0, dy: 0 };
    if (this.touchMoveTimeout) {
      clearTimeout(this.touchMoveTimeout);
      this.touchMoveTimeout = null;
    }
    this.overworldSim?.clearBfsPath();
  }

  private showToast(message: string, durationMs = 2800): void {
    const clean = stripEmojis(message).trim();
    if (!clean) return;
    this.toastMessage = clean;
    this.toastUntil = Date.now() + durationMs;
  }

  private clearToast(): void {
    this.toastMessage = null;
    this.toastUntil = 0;
  }

  private popNextBadgeToast(): void {
    while (this.badgeQueue.length > 0) {
      const nextId = this.badgeQueue.shift()!;
      const badge = this.badges.find((b) => b.id === nextId);
      if (badge) {
        this.badgeToast = {
          badgeId: badge.id,
          name: badge.name,
          description: badge.description,
          iconId: badge.iconId as IconId,
          remainingSec: 3.6,
        };
        return;
      }
    }
    this.badgeToast = null;
  }

  private triggerBadgeToast(badgeIds: string[] | undefined): void {
    if (!badgeIds || badgeIds.length === 0) return;
    for (const id of badgeIds) {
      if (!id) continue;
      if (this.badgeToast?.badgeId === id || this.badgeQueue.includes(id)) continue;
      if (this.badges.some((b) => b.id === id)) {
        this.badgeQueue.push(id);
      }
    }
    if (!this.badgeToast) {
      this.popNextBadgeToast();
    }
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
        void this.sprites.loadSpeciesSprite(this.briefing.previewSpeciesId, { back: false, shiny: false });
        this.dialogue = null;
        this.clearMovementInputs();
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
        this.audio.playSafeRecall();
        this.storage.manager.healTeam(true);
        const warpRes = this.overworldSim.warpToSafeZone();
        this.triggerBadgeToast(warpRes.newBadgeIds);
        this.briefing = null;
        this.dialogue = null;
        this.clearMovementInputs();
        this.screen = 'overworld';
        this.showToast('Warped to Starlight Village and healed your team.');
        this.syncBgmForCurrentScreen();
        this.syncUI();
      },

      onWarpFarmZone: () => {
        this.ensureAudioUnlocked();
        this.audio.playWarpTeleport();
        const res = this.overworldSim.warpToFarmZone();
        this.triggerBadgeToast(res.newBadgeIds);
        this.briefing = null;
        this.dialogue = null;
        this.clearMovementInputs();
        this.screen = 'overworld';
        this.showToast(`Warped to recommended zone: ${res.biomeName}.`);
        this.syncBgmForCurrentScreen();
        this.syncUI();
      },

      onWarpBiome: (biomeId: BiomeId) => {
        this.ensureAudioUnlocked();
        this.audio.playWarpTeleport();
        this.handleWarpBiome(biomeId);
      },

      onInteractNearby: () => {
        this.ensureAudioUnlocked();
        this.handleInteractNearby();
      },

      onTriggerEncounter: (tier: EncounterTier) => {
        this.ensureAudioUnlocked();
        if (this.screen === 'battle' && this.battleController.isActive()) return;
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
        this.handleFleeBattle();
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
        this.handleCloseBattleResult();
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
          this.audio.playUpgradeFanfare();
          this.overworldSim.refreshState();
          this.triggerBadgeToast(res.newBadges?.map((b: { id: string }) => b.id));
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
          this.audio.playBuddyCheer();
          this.overworldSim.refreshState();
          this.triggerBadgeToast(res.newBadges?.map((b: { id: string }) => b.id));
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
          const restored = Number(res.healedHp ?? res.amount ?? 0);
          this.showToast(`Restored ${restored} HP with a Potion.`);
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
        this.handleOpenSkyHop(false);
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
          if (this.overworldSim.canStepNow()) {
            const stepEv = this.overworldSim.stepDirection(dx, dy);
            this.handleOverworldStepEvent(stepEv);
          }
          this.touchMoveTimeout = setTimeout(() => {
            this.touchMoveVec = { dx: 0, dy: 0 };
          }, 180);
        } else {
          this.touchMoveTimeout = null;
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
    const liveProfile = this.storage.manager.getActiveProfile();
    const liveTeam = Array.isArray(liveProfile?.team) ? liveProfile.team : [];
    if (liveTeam.length > 0 && !liveTeam.some((m: { isFainted?: boolean; hp?: number }) => m && !m.isFainted && (m.hp ?? 0) > 0)) {
      this.storage.manager.healTeam(true);
      this.storage.manager.warpToSafeZone();
    }
    const profile = this.storage.getActiveProfileJSON();
    this.overworldSim.syncFromProfile();
    this.briefing = null;
    this.dialogue = null;

    if (!profile || !profile.starterId || profile.team.length === 0) {
      this.screen = 'starter';
      for (const starterId of [1, 4, 7]) {
        void this.sprites.loadSpeciesSprite(starterId, { back: false, shiny: false });
      }
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

  private clearBattleTimers(): void {
    while (this.battleSfxTimers.length > 0) {
      const id = this.battleSfxTimers.pop();
      if (id !== undefined) clearTimeout(id);
    }
  }

  private handleNavigateScreen(screen: ActiveScreen, drawerTab?: DrawerTab): void {
    if (screen === 'settings' && this.screen !== 'settings') {
      this.screenBeforeSettings = this.screen;
    }
    if (screen !== 'overworld') {
      this.clearMovementInputs();
    }
    if (isDrawerScreen(screen) || screen === 'settings' || screen === 'briefing') {
      this.clearToast();
    }
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
      const profile = this.storage.getActiveProfileJSON();
      if (profile?.team) {
        for (const mon of profile.team.slice(0, 6)) {
          void this.sprites.loadSpeciesSprite(mon.speciesId, { back: false, shiny: Boolean(mon.isShiny) });
        }
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
        const wasDefeat = this.battleController.getState().phase === 'defeat';
        this.clearBattleTimers();
        this.battleController.closeBattle();
        if (wasDefeat) {
          this.overworldSim.applyPostWarpGrace();
          this.overworldSim.syncFromProfile({ preserveEncounterPacing: true });
        }
      }
      if (this.skyHopController.getState().active) {
        this.skyHopController.close();
      }
      this.overworldSim.refreshState();
    }
    if (screen === 'title' || screen === 'starter') {
      this.clearToast();
      this.clearBattleTimers();
      this.briefing = null;
      this.dialogue = null;
      this.battleController.closeBattle();
      this.skyHopController.close();
      if (screen === 'starter') {
        for (const starterId of [1, 4, 7]) {
          void this.sprites.loadSpeciesSprite(starterId, { back: false, shiny: false });
        }
      }
    }
    this.screen = screen;
    this.syncBgmForCurrentScreen();
    this.syncUI();
  }

  private handleWarpBiome(biomeId: BiomeId): void {
    const warpRes = this.overworldSim.warpToBiome(biomeId);
    this.triggerBadgeToast(warpRes.newBadgeIds);
    this.briefing = null;
    this.dialogue = null;
    this.clearMovementInputs();
    this.screen = 'overworld';
    const biomeName = stripEmojis(BIOMES[biomeId]?.name ?? biomeId);
    this.showToast(`Arrived at ${biomeName}.`);
    this.syncBgmForCurrentScreen();
    this.syncUI();
  }

  private handleOpenSkyHop(forceUnlock = false): void {
    if (!this.storage.manager.getActiveTrainerId()) {
      this.storage.manager.selectTrainer('violet');
    }
    this.clearToast();
    this.clearMovementInputs();
    this.briefing = null;
    this.dialogue = null;
    this.skyHopController.open({ forceUnlock });
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

    // GAMEPLAY-03: In safe Starlight Village, warp cleanly to Whispering Forest instead of spawning zero-walk wilds by the fountain
    if (b.biomeId === 'village') {
      this.handleWarpBiome('forest');
      return;
    }

    // Biome scouting briefing -> launch a wild encounter in that biome
    this.handleStartBattle({
      biomeId: b.biomeId,
      tier: 'wild',
    });
  }

  private handleFleeBattle(): void {
    const outcome = this.battleController.flee();
    this.applyBattleOutcome(outcome);
    if (outcome.battleEnded === 'fled') {
      this.clearBattleTimers();
      this.clearMovementInputs();
      const fleeMsg = this.battleController.getState().statusMessage || 'Got away safely!';
      this.overworldSim.applyPostBattleCooldown();
      this.overworldSim.applyPostEscapeGrace();
      this.overworldSim.syncFromProfile({ preserveEncounterPacing: true });
      this.screen = 'overworld';
      this.syncBgmForCurrentScreen();
      this.showToast(fleeMsg);
      this.syncUI();
    }
  }

  private handleCloseBattleResult(): void {
    this.clearBattleTimers();
    const meta = this.battleController.getLastEncounterMeta();
    const wasDefeat = meta.phase === 'defeat';
    const wasVictory = meta.phase === 'victory';
    this.battleController.closeBattle();
    this.overworldSim.applyPostBattleCooldown();
    if (wasDefeat) {
      this.overworldSim.applyPostWarpGrace();
    }
    this.overworldSim.syncFromProfile({ preserveEncounterPacing: true });

    if (wasDefeat) {
      this.audio.playSafeRecall();
      this.showToast('Your team rested safely at Starlight Village Healing Fountain!');
    } else if (wasVictory) {
      // GAMEPLAY-01: Authentic v1 Rival & Shrine post-victory RPG dialogue
      const profileLive = this.storage.manager.getActiveProfile();
      if (meta.rivalId) {
        const rival = Object.values(RIVAL_TRAINERS).find((r) => r.id === meta.rivalId);
        if (rival) {
          const rewards = (meta.wasRivalRematch ? rival.rematchRewards : rival.rewards) ?? {};
          const rawWinText = (meta.wasRivalRematch && rival.rematchWinText)
            ? rival.rematchWinText
            : (rival.winText || `${rival.name}: "What an awesome battle!"`);
          this.dialogue = {
            speaker: stripEmojis(rival.name),
            speakerPortrait: 'rival',
            title: meta.wasRivalRematch ? 'Rival Rematch Victory!' : 'Rival Victory!',
            lines: [formatCleanGameText(rawWinText, { profile: profileLive, rival, trainerData: rival })],
            currentIndex: 0,
            rewardTags: buildRewardTags(rewards as Record<string, unknown>, this.evolutionItemNames),
          };
        }
      } else if (meta.shrineId) {
        const shrine = Object.values(SHRINES).find((s) => s.id === meta.shrineId);
        if (meta.shrineTrialNumber > 0) {
          this.dialogue = {
            speaker: stripEmojis(shrine?.name || 'Astral Shrine'),
            title: `Astral Shrine Trial #${meta.shrineTrialNumber} Cleared!`,
            lines: [
              formatCleanGameText(
                `You triumphed in Astral Shrine Trial #${meta.shrineTrialNumber}! The shrine resonates with radiant starlight.`,
                { profile: profileLive },
              ),
            ],
            currentIndex: 0,
            rewardTags: buildRewardTags({ starShards: 3, starBalls: 1 }, this.evolutionItemNames),
          };
        } else if (shrine && !meta.wasShrineClearedBefore) {
          const rawClear =
            (shrine as { clearText?: string; winText?: string }).clearText
            || (shrine as { clearText?: string; winText?: string }).winText
            || `You triumphed over the Guardian of ${stripEmojis(shrine.name)} and earned its Elemental Blessing!`;
          this.dialogue = {
            speaker: stripEmojis(shrine.name),
            title: `${stripEmojis(shrine.name)} Cleared!`,
            lines: [formatCleanGameText(rawClear, { profile: profileLive })],
            currentIndex: 0,
            rewardTags: buildRewardTags(shrine.reward as Record<string, unknown>, this.evolutionItemNames),
          };
        }
      }
    }

    this.clearMovementInputs();
    this.screen = 'overworld';
    this.syncBgmForCurrentScreen();
    this.syncUI();
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

    // GAMEPLAY-02: ensureHealthyParty() guard so battle NEVER starts with a 0-HP fainted party
    const liveProfile = this.storage.manager.getActiveProfile();
    const liveTeam = Array.isArray(liveProfile?.team) ? liveProfile.team : [];
    if (liveTeam.length > 0 && !liveTeam.some((m: { isFainted?: boolean; hp?: number }) => m && !m.isFainted && (m.hp ?? 0) > 0)) {
      this.storage.manager.healTeam(true);
    }

    const settings = this.storage.getSettings();
    const reducedMotion = settings.reducedMotion;
    this.battleController.startEncounter({
      ...options,
      reducedMotion,
      battlePace: settings.battlePace,
      forceOfflineRig: this.sprites.isForceOffline(),
    });
    this.clearBattleTimers();
    this.battleRenderer.triggerShutter(options.tier, reducedMotion);
    const stingerMode =
      options.tier === 'shrine' || options.tier === 'shrine-trial'
        ? 'shrine'
        : options.tier === 'rival'
          ? 'rival'
          : 'wild';
    this.audio.playEncounterStinger(stingerMode);
    this.clearToast();
    this.clearMovementInputs();
    this.briefing = null;
    this.dialogue = null;
    this.lastSyncedBattlePhase = '';
    this.screen = 'battle';
    this.syncBgmForCurrentScreen();
    this.syncUI();
  }

  private applyBattleOutcome(outcome: BattleActionOutcome): void {
    const settings = this.storage.getSettings();
    const reducedMotion = settings.reducedMotion;

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
        duration: reducedMotion ? Math.min(0.28, ev.duration) : Math.max(0.18, ev.duration),
      });
    }

    const moveSfxList = outcome.moveSfxEvents && outcome.moveSfxEvents.length > 0
      ? outcome.moveSfxEvents
      : outcome.moveSfxId
        ? [{ moveId: outcome.moveSfxId, type: outcome.moveSfxFx || 'normal', side: 'player' as const }]
        : [];
    for (const mSfx of moveSfxList) {
      this.audio.playMoveSfx(mSfx.moveId, mSfx.type);
    }

    if (outcome.crySpeciesIds) {
      for (const speciesId of outcome.crySpeciesIds) {
        this.audio.playSpeciesCry(speciesId);
      }
    }

    if (outcome.abilitySfx) {
      for (const ab of outcome.abilitySfx) {
        this.audio.playAbilityCue(ab.abilityId, ab.type);
      }
    }

    const hasLevelUpSfx = outcome.sfx.includes('level-up');
    for (const sfx of outcome.sfx) {
      if (sfx === 'move-select') this.audio.playMoveSelect();
      else if (sfx === 'windup') this.audio.playWindup();
      else if (sfx === 'hit') this.audio.playHit(false);
      else if (sfx === 'super-hit') this.audio.playHit(true);
      else if (sfx === 'miss') this.audio.playMiss();
      else if (sfx === 'heal') this.audio.playHealChime();
      else if (sfx === 'buff') this.audio.playBuffChime();
      else if (sfx === 'shield') this.audio.playShieldChime();
      else if (sfx === 'brace') this.audio.playComposureBrace();
      else if (sfx === 'endure') this.audio.playBuddyEndure();
      else if (sfx === 'faint') this.audio.playFaint();
      else if (sfx === 'shiny') this.audio.playShinySparkle();
      else if (sfx === 'catch-throw') this.audio.playCatchThrow();
      else if (sfx === 'star-shimmer') this.audio.playStarBallShimmer();
      else if (sfx === 'catch-absorb') this.audio.playCatchAbsorb();
      else if (sfx === 'catch-bounce') this.audio.playCatchBounce();
      else if (sfx === 'catch-shake') this.audio.playCatchShake(outcome.shakeIndex ?? 1);
      else if (sfx === 'catch-breakout') this.audio.playCatchBreakout();
      else if (sfx === 'catch-success') this.audio.playCatchSuccess();
      else if (sfx === 'level-up') this.audio.playLevelUp();
      else if (sfx === 'victory') {
        if (!hasLevelUpSfx) this.audio.playVictoryFanfare();
      } else if (sfx === 'badge') this.audio.playBadgeFanfare();
      else if (sfx === 'evo-start') this.audio.playEvolutionStart();
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
    // R2-VIS-03: Clear transient toasts before opening RPG dialogue so toasts never cover dialogue text
    if (nearby.kind !== 'fountain') {
      this.clearToast();
    }

    if (nearby.kind === 'secret-arcade') {
      if (this.storage.manager.isArcadeUnlocked()) {
        this.handleOpenSkyHop();
        return;
      }
      const res = this.storage.manager.recordSecretKnock();
      this.overworldSim.refreshState();
      if (res && res.attuned === false) {
        this.audio.playMenuBlip(420);
        this.dialogue = {
          speaker: 'Mysterious Star Emblem',
          lines: [
            'A faint Starlight Emblem gleams on the village wall.',
            'It awaits a trainer who has earned 1 Island Badge or registered 5 unique species in their Pokédex!',
          ],
          currentIndex: 0,
        };
      } else if (res?.unlocked) {
        this.audio.playArcadeUnlockFanfare();
        this.dialogue = {
          speaker: 'Secret Star Emblem',
          title: 'Starlight Sky-Hop Unlocked!',
          lines: [
            'The three starlight chimes resonate together and reveal a hidden arcade portal!',
            'Step inside anytime from here or the navigation dock to play Starlight Sky-Hop.',
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
      this.showToast('Starlight Healing Fountain fully restored your team HP & PP and refilled Berry Potions!');
      this.syncUI();
      return;
    }

    if (nearby.kind === 'shrine') {
      const sh = this.overworldSim.getState().shrines.find((s) => s.id === nearby.id);
      const kind = sh?.cleared ? 'shrine-trial' : 'shrine';
      this.briefing = this.overworldSim.buildTacticalBriefing(kind, nearby.id, sh?.biomeId);
      void this.sprites.loadSpeciesSprite(this.briefing.previewSpeciesId, { back: false, shiny: false });
      this.clearMovementInputs();
      this.audio.playMenuBlip(640);
      this.screen = 'briefing';
      this.syncUI();
      return;
    }

    if (nearby.kind === 'rival') {
      const rv = this.overworldSim.getState().rivals.find((r) => r.id === nearby.id);
      this.briefing = this.overworldSim.buildTacticalBriefing('rival', nearby.id, rv?.biomeId);
      void this.sprites.loadSpeciesSprite(this.briefing.previewSpeciesId, { back: false, shiny: false });
      this.clearMovementInputs();
      this.audio.playMenuBlip(640);
      this.screen = 'briefing';
      this.syncUI();
      return;
    }

    if (nearby.kind === 'chest') {
      const rawChest = Object.values(CHESTS).find((c) => c.id === nearby.id);
      const profileLive = this.storage.manager.getActiveProfile();
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
            formatCleanGameText(rawChest.message || 'You opened the Starlight Treasure Chest!', { profile: profileLive }),
          ],
          currentIndex: 0,
          rewardTags: buildRewardTags(rawChest.rewards, this.evolutionItemNames),
        };
        this.syncUI();
      } else if (rawChest) {
        this.audio.playMenuBlip(460);
        this.dialogue = {
          speaker: stripEmojis(rawChest.label || 'Opened Treasure Chest'),
          lines: ['This treasure chest has already been opened!'],
          currentIndex: 0,
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
      const quest =
        FIELD_QUESTS.find((q) => (rawNpc.questId && q.id === rawNpc.questId) || q.npcId === rawNpc.id) ?? null;
      const doneSet = new Set<string>(profileLive?.questsCompleted ?? []);

      const isWillow = rawNpc.id.includes('willow') || rawNpc.name.toLowerCase().includes('willow');
      const portrait: DialogueModalState['speakerPortrait'] = isWillow ? 'willow' : undefined;

      if (quest && !doneSet.has(quest.id)) {
        const ready = typeof quest.check === 'function' ? Boolean(quest.check(profileLive)) : false;
        if (ready) {
          const qRes = this.storage.manager.completeQuest(quest.id, quest.rewards);
          this.audio.playQuestCompleteFanfare();
          this.triggerBadgeToast(qRes?.newBadges?.map((b: { id: string }) => b.id));
          this.overworldSim.refreshState();
          const completeLines = normalizeDialogueLines(quest.completeDialogue);
          const lines = (completeLines.length > 0
            ? completeLines
            : [`Quest complete: ${quest.title}! Thank you, {trainer}!`]
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

        const rawProgress = typeof quest.progressText === 'function'
          ? quest.progressText(profileLive)
          : typeof quest.progress === 'function'
            ? quest.progress(profileLive)
            : quest.description;
        const progressLine = formatCleanGameText(rawProgress || quest.description, { profile: profileLive });
        const introCandidates = normalizeDialogueLines(quest.introDialogue);
        const reminderCandidates = normalizeDialogueLines(quest.reminderDialogue);
        const greetingCandidates = normalizeDialogueLines(rawNpc.greeting);
        const rawLines = introCandidates.length > 0
          ? introCandidates
          : reminderCandidates.length > 0
            ? reminderCandidates
            : greetingCandidates.length > 0
              ? greetingCandidates
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

      const doneLines = quest && doneSet.has(quest.id)
        ? normalizeDialogueLines(quest.completeDialogue)
        : [];
      const npcLines = [
        ...normalizeDialogueLines(rawNpc.dialogue),
        ...normalizeDialogueLines(rawNpc.lines),
        ...normalizeDialogueLines(rawNpc.greeting),
      ];
      const rawLines = doneLines.length > 0
        ? doneLines
        : npcLines.length > 0
          ? npcLines
          : ['Welcome to Starlight Island, {trainer}!'];
      this.audio.playMenuBlip(560);
      this.overworldSim.refreshState();
      this.dialogue = {
        speaker: stripEmojis(rawNpc.name),
        speakerPortrait: portrait,
        title: quest && doneSet.has(quest.id) ? `${stripEmojis(quest.title)} (Complete)` : undefined,
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
      return;
    }

    if (nearby.kind === 'landmark') {
      const rawLm = Object.values(LANDMARKS).find((l) => l.id === nearby.id);
      if (rawLm) {
        const profileLive = this.storage.manager.getActiveProfile();
        this.audio.playMenuBlip(540);
        this.dialogue = {
          speaker: stripEmojis(rawLm.name),
          lines: [formatCleanGameText(rawLm.description || 'A remarkable Starlight Island landmark.', { profile: profileLive })],
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
    const { tileX, tileY } = this.overworldRenderer.screenToTile(canvasX, canvasY, width, height, ow);

    // If tapping directly on or adjacent to an interactable tile, face & interact cleanly
    const tappedInteractable = this.overworldSim.getInteractableAtTile(tileX, tileY);
    const manhattanDist = Math.abs(tileX - ow.player.tileX) + Math.abs(tileY - ow.player.tileY);
    if (tappedInteractable && manhattanDist <= 1) {
      this.overworldSim.faceTile(tileX, tileY);
      this.handleInteractNearby();
      return;
    }

    const path = this.overworldSim.setBfsTarget(tileX, tileY, { autoInteract: Boolean(tappedInteractable) });
    if (path.length > 0) {
      this.audio.playMenuBlip(600);
    }
  }

  private handleOverworldStepEvent(ev: ReturnType<DojoOverworldSim['update']>): void {
    if (!ev || !ev.moved) return;
    this.audio.playStep(ev.onGrass);

    if (ev.steppedHealSpot) {
      this.storage.manager.healTeam(true);
      this.overworldSim.refreshState();
      this.audio.playHealChime();
      this.showToast('Starlight Healing Fountain restored your entire team and refilled Potions!');
    } else if (ev.discoveryPicked) {
      this.audio.playDiscoveryChime(ev.discoveryPicked.kind);
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

    if (ev.newBadgeIds && ev.newBadgeIds.length > 0) {
      this.triggerBadgeToast(ev.newBadgeIds);
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
      return;
    }

    if (ev.arrivedInteractTarget) {
      this.handleInteractNearby();
    }
  }

  private async handleUpdateSettings(patch: Partial<GameSettings>): Promise<void> {
    const prev = this.storage.getSettings();
    const next = this.storage.updateSettings(patch);

    this.audio.setMuted(next.audioMuted);
    this.audio.setMasterVolume(next.masterVolume);
    this.battleController.setBattlePace(next.battlePace);
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
      this.activeDragPointerId = e.pointerId;
      this.dragStartClient = { x: e.clientX, y: e.clientY };
      this.isDraggingSteer = false;
      this.handleTapWorldCanvas(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    };

    this.stagePointerMoveHandler = (e: PointerEvent) => {
      if (this.activeDragPointerId === null || e.pointerId !== this.activeDragPointerId) return;
      if (this.screen !== 'overworld' || this.dialogue) {
        this.activeDragPointerId = null;
        this.isDraggingSteer = false;
        this.touchMoveVec = { dx: 0, dy: 0 };
        return;
      }
      const movedDist = Math.hypot(e.clientX - this.dragStartClient.x, e.clientY - this.dragStartClient.y);
      if (!this.isDraggingSteer && movedDist < 18) return;
      this.isDraggingSteer = true;
      const canvas = this.engine.getCanvas() ?? this.canvasEl;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const ow = this.overworldSim.getState();
      const playerScreen = this.overworldRenderer.tileToScreen(ow.player.x, ow.player.y, rect.width, rect.height, ow);
      const dx = (e.clientX - rect.left) - playerScreen.x;
      const dy = (e.clientY - rect.top) - playerScreen.y;
      if (Math.hypot(dx, dy) < 12) {
        this.touchMoveVec = { dx: 0, dy: 0 };
        return;
      }
      this.overworldSim.clearBfsPath();
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.touchMoveVec = { dx: dx > 0 ? 1 : -1, dy: 0 };
      } else {
        this.touchMoveVec = { dx: 0, dy: dy > 0 ? 1 : -1 };
      }
    };

    this.stagePointerUpHandler = (e: PointerEvent) => {
      if (this.activeDragPointerId === null || e.pointerId !== this.activeDragPointerId) return;
      this.activeDragPointerId = null;
      if (this.isDraggingSteer) {
        this.isDraggingSteer = false;
        this.touchMoveVec = { dx: 0, dy: 0 };
      }
    };

    const stageTarget = this.stageShellEl ?? this.canvasEl;
    stageTarget.addEventListener('pointerdown', this.stagePointerDownHandler);
    window.addEventListener('pointermove', this.stagePointerMoveHandler);
    window.addEventListener('pointerup', this.stagePointerUpHandler);
    window.addEventListener('pointercancel', this.stagePointerUpHandler);

    this.keyDownHandler = (e: KeyboardEvent) => {
      if (isEditableElement(e.target)) return;
      const code = e.code;

      if (this.screen === 'skyhop') {
        const sState = this.skyHopController.getState();
        if (code === 'ArrowUp' || code === 'KeyW') {
          e.preventDefault();
          this.skyHopController.setKeyDir('up', true);
        } else if (code === 'ArrowDown' || code === 'KeyS') {
          e.preventDefault();
          this.skyHopController.setKeyDir('down', true);
        } else if (code === 'Space') {
          e.preventDefault();
          if (!sState.running) {
            if (this.skyHopController.startNewRun()) {
              this.audio.playArcadeBoost();
            } else {
              this.showToast('Out of Arcade Charges — buy one with Star Shards or walk/battle more!');
            }
            this.syncUI();
          } else if (this.skyHopController.activateDash()) {
            this.audio.playArcadeBoost();
          }
        } else if (code === 'Enter' && !sState.running) {
          e.preventDefault();
          if (this.skyHopController.startNewRun()) {
            this.audio.playArcadeBoost();
          } else {
            this.showToast('Out of Arcade Charges — buy one with Star Shards or walk/battle more!');
          }
          this.syncUI();
        } else if (code === 'KeyP') {
          e.preventDefault();
          this.skyHopController.togglePause();
          this.audio.playMenuBlip(480);
          this.syncUI();
        } else if (code === 'Escape') {
          e.preventDefault();
          this.skyHopController.close();
          this.overworldSim.refreshState();
          this.screen = 'overworld';
          this.syncBgmForCurrentScreen();
          this.syncUI();
        }
        return;
      }

      if (this.screen === 'battle') {
        const bState = this.battleController.getState();
        const switchDrawerOpenEl = document.querySelector<HTMLElement>(
          '[data-testid="battle-switch-drawer"]:not([hidden])',
        );
        const switchToggleBtn = document.querySelector<HTMLButtonElement>(
          '[data-testid="battle-switch-btn"], [data-testid="battle-switch-toggle"]',
        );
        const isSwitchDrawerOpen = Boolean(switchDrawerOpenEl)
          || switchToggleBtn?.getAttribute('aria-pressed') === 'true';

        // Arrow keyboard focus navigation across active battle controls (skip utility rig toggle, prioritize active drawer/result/moves)
        if (
          code === 'ArrowUp'
          || code === 'ArrowDown'
          || code === 'ArrowLeft'
          || code === 'ArrowRight'
        ) {
          const battleRoot = document.querySelector('[data-testid="battle-screen"]');
          if (battleRoot) {
            const isVisibleBtn = (btn: HTMLButtonElement) =>
              !btn.disabled && !btn.closest('[hidden]') && btn.offsetParent !== null;
            let scopeRoot: Element = battleRoot;
            if (bState.phase === 'evolving' || bState.phase === 'victory' || bState.phase === 'defeat') {
              scopeRoot = battleRoot.querySelector('[data-testid="battle-result-banner"]') ?? battleRoot;
            } else if (bState.phase === 'forced-switch' || isSwitchDrawerOpen) {
              scopeRoot = battleRoot.querySelector('[data-testid="battle-switch-drawer"]') ?? battleRoot;
            }
            const rawFocusables = Array.from(
              scopeRoot.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
            ).filter((btn) => isVisibleBtn(btn) && btn.getAttribute('data-testid') !== 'battle-offline-rig');
            // Order move buttons first during command phase so ArrowRight/ArrowDown starts on Move 1
            const moveBtns = rawFocusables.filter((btn) => btn.getAttribute('data-testid')?.startsWith('battle-move-'));
            const otherBtns = rawFocusables.filter((btn) => !btn.getAttribute('data-testid')?.startsWith('battle-move-'));
            const focusables = moveBtns.length > 0 ? [...moveBtns, ...otherBtns] : rawFocusables;
            if (focusables.length > 0) {
              e.preventDefault();
              const curIdx = focusables.indexOf(document.activeElement as HTMLButtonElement);
              const step = code === 'ArrowRight' || code === 'ArrowDown' ? 1 : -1;
              const nextIdx =
                curIdx === -1
                  ? (step > 0 ? 0 : focusables.length - 1)
                  : (curIdx + step + focusables.length) % focusables.length;
              focusables[nextIdx].focus();
            }
          }
          return;
        }

        // COMBAT-01 & COMBAT-06: HARD INPUT LOCK — hotkeys ONLY fire when phase === 'command' && !inputLocked && switch drawer closed!
        if (bState.phase === 'command' && !bState.inputLocked && !isSwitchDrawerOpen) {
          const digitIdx =
            code === 'Digit1' ? 0
              : code === 'Digit2' ? 1
                : code === 'Digit3' ? 2
                  : code === 'Digit4' ? 3
                    : -1;
          if (digitIdx >= 0) {
            const move = bState.player.mon.moves[digitIdx];
            if (move && move.currentPp > 0) {
              e.preventDefault();
              this.ensureAudioUnlocked();
              const outcome = this.battleController.performMove(move.id);
              this.applyBattleOutcome(outcome);
            }
            return;
          }
          if (code === 'KeyB' && bState.canCapture) {
            e.preventDefault();
            this.ensureAudioUnlocked();
            this.applyBattleOutcome(this.battleController.throwBall('poke'));
            return;
          }
          if (code === 'KeyG' && bState.canCapture) {
            e.preventDefault();
            this.ensureAudioUnlocked();
            this.applyBattleOutcome(this.battleController.throwBall('great'));
            return;
          }
          if (code === 'KeyS' && bState.canCapture) {
            e.preventDefault();
            this.ensureAudioUnlocked();
            this.applyBattleOutcome(this.battleController.throwBall('star'));
            return;
          }
          if (code === 'KeyP' || code === 'KeyH') {
            e.preventDefault();
            this.ensureAudioUnlocked();
            this.applyBattleOutcome(this.battleController.usePotion());
            return;
          }
          if (code === 'KeyR' && bState.canRun) {
            e.preventDefault();
            this.ensureAudioUnlocked();
            this.handleFleeBattle();
            return;
          }
        }
        if (code === 'Space' || code === 'Enter' || code === 'KeyZ') {
          if (bState.phase === 'evolving') {
            e.preventDefault();
            const outcome = this.battleController.confirmEvolution();
            this.applyBattleOutcome(outcome);
            return;
          }
          if (bState.phase === 'victory' || bState.phase === 'defeat') {
            e.preventDefault();
            this.handleCloseBattleResult();
            return;
          }
          const activeBtn = document.activeElement;
          if (
            activeBtn instanceof HTMLButtonElement
            && !activeBtn.disabled
            && activeBtn.closest('[data-testid="battle-screen"]')
          ) {
            e.preventDefault();
            activeBtn.click();
            return;
          }
          if (bState.phase === 'forced-switch') {
            const firstSwitch = document.querySelector<HTMLButtonElement>(
              '[data-testid="battle-switch-drawer"] [data-testid^="battle-switch-slot-"]:not(:disabled)',
            );
            if (firstSwitch) {
              e.preventDefault();
              firstSwitch.focus();
            }
            return;
          }
          if (bState.phase === 'command' && !bState.inputLocked && !isSwitchDrawerOpen) {
            const firstMove = document.querySelector<HTMLButtonElement>(
              '[data-testid="battle-screen"] [data-testid^="battle-move-"]:not(:disabled)',
            );
            if (firstMove) {
              e.preventDefault();
              firstMove.focus();
              firstMove.click();
            }
            return;
          }
        }
        if (code === 'Escape' || code === 'KeyX' || code === 'Backspace') {
          e.preventDefault();
          // Close Switch drawer first (NEVER flee while switch drawer is open or during forced-switch!)
          if (bState.phase === 'forced-switch') {
            return;
          }
          if (isSwitchDrawerOpen && switchToggleBtn) {
            switchToggleBtn.click();
            return;
          }
          if (bState.phase === 'victory' || bState.phase === 'defeat') {
            this.handleCloseBattleResult();
          } else if (code === 'Escape' && bState.phase === 'command' && !bState.inputLocked) {
            this.handleFleeBattle();
          }
        }
        return;
      }

      if (this.screen === 'briefing') {
        if (code === 'Space' || code === 'Enter' || code === 'KeyZ') {
          e.preventDefault();
          this.handleConfirmBriefing();
          return;
        }
        if (code === 'Escape' || code === 'KeyX' || code === 'Backspace') {
          e.preventDefault();
          this.audio.playMenuBlip(420);
          this.briefing = null;
          this.screen = 'overworld';
          this.syncBgmForCurrentScreen();
          this.syncUI();
        }
        return;
      }

      if (code === 'Escape' || code === 'KeyX' || code === 'Backspace') {
        if (this.dialogue) {
          e.preventDefault();
          this.dialogue = null;
          this.syncUI();
        } else if (this.screen === 'settings') {
          e.preventDefault();
          this.screen = this.screenBeforeSettings || 'overworld';
          this.syncBgmForCurrentScreen();
          this.syncUI();
        } else if (isDrawerScreen(this.screen)) {
          e.preventDefault();
          this.screen = 'overworld';
          this.syncBgmForCurrentScreen();
          this.syncUI();
        }
        return;
      }

      if (isDrawerScreen(this.screen) && (code === 'KeyM' || code === 'KeyP')) {
        e.preventDefault();
        this.screen = 'overworld';
        this.syncBgmForCurrentScreen();
        this.syncUI();
        return;
      }

      if (this.screen === 'overworld') {
        const dirVec = DIRECTION_KEYS[code];
        if (dirVec) {
          e.preventDefault();
          this.pressedKeys.add(code);
          const existingIdx = this.dirStack.findIndex((item) => item.code === code);
          if (existingIdx !== -1) {
            this.dirStack.splice(existingIdx, 1);
          }
          this.dirStack.push({ code, dx: dirVec.dx, dy: dirVec.dy });
          return;
        }
        if (code === 'Space' || code === 'Enter' || code === 'KeyE' || code === 'KeyZ') {
          e.preventDefault();
          this.handleInteractNearby();
          return;
        }
        if (code === 'KeyH' && !this.dialogue) {
          e.preventDefault();
          this.audio.playSafeRecall();
          this.storage.manager.healTeam(true);
          const warpRes = this.overworldSim.warpToSafeZone();
          this.triggerBadgeToast(warpRes.newBadgeIds);
          this.clearMovementInputs();
          this.showToast('Warped to Starlight Village and healed your team.');
          this.syncBgmForCurrentScreen();
          this.syncUI();
          return;
        }
        if (code === 'KeyT' && !this.dialogue) {
          e.preventDefault();
          this.audio.playWarpTeleport();
          const res = this.overworldSim.warpToFarmZone();
          this.triggerBadgeToast(res.newBadgeIds);
          this.clearMovementInputs();
          this.showToast(`Warped to recommended zone: ${res.biomeName}.`);
          this.syncBgmForCurrentScreen();
          this.syncUI();
          return;
        }
        if (code === 'KeyB' && !this.dialogue) {
          e.preventDefault();
          this.briefing = this.overworldSim.buildTacticalBriefing(
            'biome',
            this.overworldSim.getState().currentBiomeId,
          );
          void this.sprites.loadSpeciesSprite(this.briefing.previewSpeciesId, { back: false, shiny: false });
          this.clearMovementInputs();
          this.screen = 'briefing';
          this.syncUI();
          return;
        }
        if ((code === 'KeyM' || code === 'KeyP') && !this.dialogue) {
          e.preventDefault();
          this.handleNavigateScreen('pokedex', 'pokedex');
        }
      }
    };

    this.keyUpHandler = (e: KeyboardEvent) => {
      const code = e.code;
      this.pressedKeys.delete(code);
      const idx = this.dirStack.findIndex((item) => item.code === code);
      if (idx !== -1) {
        this.dirStack.splice(idx, 1);
      }
      if (code === 'ArrowUp' || code === 'KeyW') {
        this.skyHopController.setKeyDir('up', false);
      } else if (code === 'ArrowDown' || code === 'KeyS') {
        this.skyHopController.setKeyDir('down', false);
      }
    };

    this.blurHandler = () => {
      this.clearMovementInputs();
      this.skyHopController.setKeyDir('up', false);
      this.skyHopController.setKeyDir('down', false);
    };

    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
    window.addEventListener('blur', this.blurHandler);
  }

  private resolveHeldDirection(): { dx: number; dy: number } {
    if (this.touchMoveVec.dx !== 0 || this.touchMoveVec.dy !== 0) {
      return { dx: Math.sign(this.touchMoveVec.dx), dy: Math.sign(this.touchMoveVec.dy) };
    }
    if (this.dirStack.length > 0) {
      const latest = this.dirStack[this.dirStack.length - 1];
      return { dx: latest.dx, dy: latest.dy };
    }
    let dx = 0;
    let dy = 0;
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
        this.popNextBadgeToast();
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
      this.battleController.update(dtSeconds, { skipVisualTimers: true });
      const stepOutcome = this.battleController.drainStepOutcome();
      if (stepOutcome) {
        this.applyBattleOutcome(stepOutcome);
      }
      const bState = this.battleController.getState();
      this.battleRenderer.update(bState, dtSeconds);
      const battleUiStamp = `${bState.phase}|${bState.inputLocked}|${bState.statusMessage}|${Math.round(bState.player.displayedHp)}|${Math.round(bState.enemy.displayedHp)}`;
      if (battleUiStamp !== this.lastSyncedBattlePhase) {
        this.lastSyncedBattlePhase = battleUiStamp;
        needsImmediateUiSync = true;
      }
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
      if (ev.newBadgeIds && ev.newBadgeIds.length > 0) {
        this.triggerBadgeToast(ev.newBadgeIds);
        this.audio.playBadgeFanfare();
      }
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

      // If a wild encounter just triggered this tick, immediately render the first battle shutter frame
      // instead of flashing 1 stale Overworld frame!
      if ((this.screen as ActiveScreen) === 'battle') {
        const bState = this.battleController.getState();
        this.battleRenderer.update(bState, dtSeconds);
        backend.beginFrame(elapsedSeconds, dtSeconds);
        this.battleRenderer.render(backend, bState);
        backend.endFrame();
      } else {
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
          camera: this.overworldRenderer.getCameraState(),
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
      tileToScreen: (tx: number, ty: number) => {
        const canvas = this.engine.getCanvas() ?? this.canvasEl;
        const rect = canvas?.getBoundingClientRect();
        const ow = this.overworldSim.getState();
        return this.overworldRenderer.tileToScreen(
          tx,
          ty,
          rect && rect.width > 0 ? rect.width : undefined,
          rect && rect.height > 0 ? rect.height : undefined,
          ow,
        );
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
        this.handleOpenSkyHop(true);
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
    this.clearBattleTimers();
    if (this.unlockAudioHandler) {
      window.removeEventListener('pointerdown', this.unlockAudioHandler);
      window.removeEventListener('keydown', this.unlockAudioHandler);
    }
    if (this.stagePointerDownHandler) {
      (this.stageShellEl ?? this.canvasEl)?.removeEventListener('pointerdown', this.stagePointerDownHandler);
    }
    if (this.stagePointerMoveHandler) {
      window.removeEventListener('pointermove', this.stagePointerMoveHandler);
    }
    if (this.stagePointerUpHandler) {
      window.removeEventListener('pointerup', this.stagePointerUpHandler);
      window.removeEventListener('pointercancel', this.stagePointerUpHandler);
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
