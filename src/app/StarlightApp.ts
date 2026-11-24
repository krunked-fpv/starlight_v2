import type {
  ActiveScreen,
  AtlasManifest,
  BattleSceneState,
  BiomeId,
  EncounterTier,
  FrameStats,
  GameSettings,
  OverworldActor,
  OverworldLandmark,
  OverworldMapData,
  OverworldSceneState,
  RendererCapabilities,
  SaveHydrationResult,
  SkyHopState,
  StarlightSaveState,
  TrainerProfile,
  UIBridgeCallbacks,
} from '../contracts';
import {
  attemptStarBallCapture,
  awardVictoryRewards,
  BADGE_DEFINITIONS,
  BIOME_DESCRIPTORS,
  chooseEnemyMove,
  computeTacticalBriefing,
  createBattleState,
  createInitialSkyHopState,
  executeBattleMove,
  getOverworldMap,
  getSpecies,
  hydrateSaveState,
  MOVES_BY_ID,
  persistSaveState,
  ProceduralAudioSynth,
  resolveMoves,
  startSkyHopRun,
  stepSkyHop,
  triggerSkyHopFlap,
  triggerSkyHopStarDash,
} from '../core';
import { createRenderEngine, type RenderEngine } from '../graphics/engine';
import { OverworldRenderer } from '../graphics/overworld';
import { BattleTheaterRenderer } from '../graphics/battle';
import { SkyHopRenderer } from '../graphics/skyhop';
import { CelestialUIController, LivingTitleRenderer } from '../ui';

export interface StarlightDebugHandle {
  getState: () => {
    screen: ActiveScreen;
    backend: string;
    capabilities: RendererCapabilities;
    frameStats: FrameStats;
    hydrationSource: SaveHydrationResult['source'];
    activeSlot: 'slot0' | 'slot1';
    biomeId: BiomeId;
    playerPos: { x: number; y: number };
    grassDisplacements: number;
    contextEvents: Array<{ type: string; previousBackend: string; activeBackend: string; reason?: string }>;
    save: StarlightSaveState;
    battleActive: boolean;
    battlePhase: BattleSceneState['phase'];
    skyhopScore: number;
    manifestLoaded: boolean;
  };
  simulateContextLoss: () => boolean;
  switchRenderer: (mode: 'auto' | 'webgl2' | 'canvas2d') => Promise<string>;
  navigateScreen: (screen: ActiveScreen) => void;
  travelBiome: (biomeId: BiomeId) => void;
  triggerEncounter: (tier: EncounterTier) => void;
  forceSave: () => Promise<void>;
}

declare global {
  interface Window {
    __STARLIGHT_DEBUG__?: StarlightDebugHandle;
  }
}

export class StarlightApp {
  private readonly engine: RenderEngine = createRenderEngine();
  private readonly overworldRenderer = new OverworldRenderer();
  private readonly battleRenderer = new BattleTheaterRenderer();
  private readonly titleRenderer = new LivingTitleRenderer();
  private readonly skyHopRenderer = new SkyHopRenderer();
  private readonly ui = new CelestialUIController();
  private readonly audio = new ProceduralAudioSynth();

  private save!: StarlightSaveState;
  private hydrationSource: SaveHydrationResult['source'] = 'fresh-default';
  private screen: ActiveScreen = 'title';
  private map!: OverworldMapData;
  private overworldState!: OverworldSceneState;
  private battleState!: BattleSceneState;
  private skyHopState!: SkyHopState;
  private manifest: AtlasManifest | null = null;
  private selectedPokedexId = 25;
  private toastMessage: string | null = null;
  private toastUntil = 0;
  private forceOfflineRig = false;
  private autosaveAccum = 0;
  private stepAccum = 0;
  private wildEncounterCooldown = 2.5;
  private battleTurnTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pressedKeys = new Set<string>();
  private touchMoveVec = { dx: 0, dy: 0 };
  private readonly contextEvents: Array<{
    type: string;
    previousBackend: string;
    activeBackend: string;
    reason?: string;
  }> = [];

  private canvasEl!: HTMLCanvasElement;
  private uiRootEl!: HTMLElement;
  private resizeHandler: (() => void) | null = null;
  private keyDownHandler: ((e: KeyboardEvent) => void) | null = null;
  private keyUpHandler: ((e: KeyboardEvent) => void) | null = null;
  private unsubContext: (() => void) | null = null;

  async boot(): Promise<void> {
    const canvas = document.getElementById('starlight-canvas') as HTMLCanvasElement | null;
    const uiRoot = document.getElementById('ui-layer');
    if (!canvas || !uiRoot) {
      throw new Error('Starlight v2 root DOM elements (#starlight-canvas, #ui-layer) are missing.');
    }
    this.canvasEl = canvas;
    this.uiRootEl = uiRoot;

    // Parse extra debug/offline query flags
    const params = new URLSearchParams(window.location.search);
    this.forceOfflineRig = params.get('offlineRig') === '1' || params.get('offlineRig') === 'true';

    // Share stylized offline elemental art rig synthesizer across UI, Title, Style Studio, and Sky-Hop
    const rigSynth = this.battleRenderer.getOfflineRigSynthesizer();
    this.titleRenderer.setRigSynthesizer(rigSynth);
    this.ui.setRigSynthesizer(rigSynth);
    this.skyHopRenderer.setRigSynthesizer(rigSynth);

    // 1. Load zero-emoji SVG icon sprite sheet + hydrate v1/v2 saves in parallel
    const [, hydration] = await Promise.all([
      this.loadSvgSpriteSheet(),
      hydrateSaveState(),
    ]);
    this.save = hydration.state;
    this.hydrationSource = hydration.source;
    this.audio.setAudioConfig(this.save.settings.audioMuted, this.save.settings.masterVolume);

    // 2. Initialize Hybrid WebGL2 / Canvas2D Render Engine
    await this.engine.init(this.canvasEl, {
      preferredMode: this.save.settings.rendererOverride,
      reducedMotion: this.save.settings.reducedMotion,
      crtMode: this.save.settings.crtMode,
    });

    this.unsubContext = this.engine.onContextEvent((ev) => {
      this.contextEvents.push(ev);
      if (ev.type === 'lost') {
        this.showToast(`GPU context lost — seamlessly switched to ${ev.activeBackend.toUpperCase()} renderer.`);
      } else if (ev.type === 'restored') {
        this.showToast('GPU context restored cleanly.');
      }
    });

    // 3. Load deterministic baked procedural atlases relative to document.baseURI
    try {
      const manifestUrl = new URL('./atlases/manifest.json', document.baseURI).toString();
      this.manifest = await this.engine.loadManifest(manifestUrl);
      this.overworldRenderer.attachAtlas(this.manifest);
    } catch {
      this.overworldRenderer.attachAtlas(null);
    }

    // 4. Initialize World, Battle, and Sky-Hop runtime states for active profile
    this.rebuildProfileRuntimeStates(this.activeProfile());

    // 5. Mount Celestial Glass UI
    this.ui.mount(this.uiRootEl, this.buildUICallbacks());

    // 6. Bind viewport resize & keyboard controls
    this.bindInputAndResize();

    // 7. Register offline PWA Service Worker cleanly
    this.registerServiceWorker();

    // 8. Expose debug & adversarial test verification bridge
    this.exposeDebugHandle();

    // 9. Start locked 60 FPS game & render loop (dt clamped <= 50ms inside RenderEngine)
    this.engine.startLoop((dtSeconds, elapsedSeconds, backend) => {
      this.tick(dtSeconds, elapsedSeconds, backend);
    });

    if (this.hydrationSource === 'v1-migrated') {
      this.showToast('Legacy Starlight v1 save migrated cleanly with 100% continuity.');
    }
  }

  private activeProfile(): TrainerProfile {
    return this.save.profiles[this.save.activeSlot];
  }

  private async loadSvgSpriteSheet(): Promise<void> {
    const host = document.getElementById('svg-sprite-host');
    if (!host) return;
    try {
      const url = new URL('./icons/starlight-icons.svg', document.baseURI).toString();
      const res = await fetch(url);
      if (res.ok) {
        host.innerHTML = await res.text();
      }
    } catch {
      // Non-fatal fallback if icons unavailable in isolated tests
    }
  }

  private registerServiceWorker(): void {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const isSecure =
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    if (!isSecure) return;
    const swUrl = new URL('./sw.js', document.baseURI).toString();
    void navigator.serviceWorker.register(swUrl).catch(() => {
      // Non-fatal in sandboxed or headless preview environments
    });
  }

  private rebuildProfileRuntimeStates(profile: TrainerProfile): void {
    this.map = getOverworldMap(profile.biomeId);
    const biome = BIOME_DESCRIPTORS[profile.biomeId];
    const lead = profile.party[0];
    const leadSpecies = getSpecies(lead?.speciesId ?? 25);
    this.selectedPokedexId = leadSpecies.id;

    const player: OverworldActor = {
      id: 'player',
      role: 'player',
      name: profile.name,
      x: Math.max(1.5, Math.min(this.map.width - 1.5, profile.x)),
      y: Math.max(2.5, Math.min(this.map.height - 2.5, profile.y)),
      facing: profile.facing,
      moving: false,
      walkCycle: 0,
      style: profile.style,
      accentHex: profile.style.primaryAccent,
    };

    const follower: OverworldActor = {
      id: 'follower',
      role: 'follower',
      name: leadSpecies.name,
      x: Math.max(1.5, player.x - 1.15),
      y: player.y + 0.1,
      facing: profile.facing,
      moving: false,
      walkCycle: 0,
      speciesId: leadSpecies.id,
      primaryType: leadSpecies.primaryType,
      accentHex: leadSpecies.palette[0],
    };

    const npcs: OverworldActor[] = [
      {
        id: 'rival-vance',
        role: 'rival',
        name: profile.slotId === 'slot0' ? 'Orion' : 'Lyra',
        x: 16.5,
        y: 9.2,
        facing: 'left',
        moving: false,
        walkCycle: 0,
        accentHex: '#ff7b47',
        dialoguePrompt: 'Challenge Rival Duel',
      },
      {
        id: 'prof-celeste',
        role: 'npc',
        name: 'Prof. Celeste',
        x: 10.5,
        y: 9.4,
        facing: 'right',
        moving: false,
        walkCycle: 0,
        accentHex: '#7be8ff',
        dialoguePrompt: 'Inspect 1,025 Pokédex',
      },
    ];

    const shrineLandmark =
      this.map.landmarks.find((l) => l.kind === 'shrine') ??
      this.map.landmarks.find((l) => l.kind === 'starfall') ??
      this.map.landmarks[0];

    this.overworldState = {
      biome,
      map: this.map,
      player,
      follower,
      npcs,
      timeOfDay: biome.id === 'starlight-village' ? 0.78 : 0.62,
      elapsedSeconds: 0,
      reducedMotion: this.save.settings.reducedMotion,
      activeWayfindingTarget: shrineLandmark
        ? {
            x: shrineLandmark.tileX + shrineLandmark.widthTiles * 0.5,
            y: shrineLandmark.tileY + shrineLandmark.heightTiles * 0.5,
            label: shrineLandmark.label,
            kind: shrineLandmark.kind,
          }
        : null,
      nearbyInteraction: null,
    };

    this.syncLandmarkStates();
    this.overworldRenderer.resetEffects();

    // Standby battle state so UI snapshots always carry a valid BattleSceneState
    this.battleState = createBattleState(profile, profile.biomeId, 'wild', {
      reducedMotion: this.save.settings.reducedMotion,
      forceOfflineRig: this.forceOfflineRig,
    });
    this.battleState.active = false;
    this.battleState.shutter.active = false;
    this.battleState.phase = 'command';

    this.skyHopState = createInitialSkyHopState(profile, this.save.settings.reducedMotion);
  }

  private syncLandmarkStates(): void {
    const profile = this.activeProfile();
    for (const lm of this.map.landmarks) {
      if (lm.kind === 'chest') {
        lm.activated = profile.openedChests.includes(lm.id);
      } else if (lm.kind === 'shrine') {
        lm.activated = profile.clearedShrines.includes(lm.id);
      }
    }
  }

  private buildUICallbacks(): UIBridgeCallbacks {
    return {
      onSelectProfile: (slotId) => {
        this.audio.playUiClick();
        this.save.activeSlot = slotId;
        this.rebuildProfileRuntimeStates(this.activeProfile());
        void persistSaveState(this.save);
      },
      onEnterWorld: (slotId) => {
        this.audio.playUiClick();
        if (slotId && slotId !== this.save.activeSlot) {
          this.save.activeSlot = slotId;
          this.rebuildProfileRuntimeStates(this.activeProfile());
        }
        this.screen = 'overworld';
        this.showToast(`Welcome to ${this.overworldState.biome.name}, ${this.activeProfile().name}!`);
        void persistSaveState(this.save);
      },
      onNavigateScreen: (targetScreen) => {
        this.audio.playUiClick();
        if (targetScreen === 'skyhop') {
          this.skyHopState.active = true;
          this.skyHopState.highScore = this.activeProfile().skyHopHighScore;
        } else {
          this.skyHopState.active = false;
          this.skyHopState.running = false;
        }
        this.screen = targetScreen;
      },
      onTravelBiome: (biomeId) => {
        this.audio.playUiClick();
        this.travelToBiome(biomeId);
      },
      onTriggerEncounter: (tier) => {
        this.audio.playUiClick();
        this.startBattleEncounter(tier);
      },
      onInteractNearby: () => {
        this.audio.playUiClick();
        this.interactWithNearby();
      },
      onBattleMove: (moveId) => {
        this.handlePlayerBattleMove(moveId);
      },
      onBattleThrowStarBall: () => {
        this.handleStarBallThrow();
      },
      onBattleUsePotion: () => {
        this.handleBattlePotion();
      },
      onBattleFlee: () => {
        this.audio.playUiClick();
        this.exitBattleToOverworld('Returned safely to the overworld.');
      },
      onBattleToggleOfflineRig: () => {
        this.audio.playUiClick();
        this.forceOfflineRig = !this.forceOfflineRig;
        this.battleState.forceOfflineRig = this.forceOfflineRig;
        this.battleState.player.useOfflineRig = true;
        this.battleState.enemy.useOfflineRig = true;
        this.showToast(
          this.forceOfflineRig
            ? 'Offline Elemental Art Rig showcase active.'
            : 'Standard high-DPI sprite + offline art rig parity mode.',
        );
      },
      onBattleTriggerEvolution: () => {
        this.handleBattleEvolution();
      },
      onSelectPokedexSpecies: (speciesId) => {
        this.audio.playUiClick();
        this.selectedPokedexId = Math.max(1, Math.min(1025, speciesId));
      },
      onPlaySpeciesCry: (speciesId) => {
        this.selectedPokedexId = speciesId;
        this.audio.playSpeciesCry(speciesId);
      },
      onUpdateStyle: (patch) => {
        this.audio.playUiClick();
        const profile = this.activeProfile();
        profile.style = { ...profile.style, ...patch };
        this.overworldState.player.style = profile.style;
        if (patch.aura && patch.aura !== 'none' && !profile.badges.includes('badge-stylist')) {
          profile.badges.push('badge-stylist');
        }
        profile.updatedAt = Date.now();
        void persistSaveState(this.save);
        this.showToast('Style Studio look updated live in the overworld.');
      },
      onUpdateSettings: (patch) => {
        this.audio.playUiClick();
        void this.applySettingsPatch(patch);
      },
      onStartSkyHop: () => {
        this.audio.playSkyHopDash();
        startSkyHopRun(this.skyHopState, this.activeProfile());
        this.screen = 'skyhop';
      },
      onSkyHopFlap: () => {
        this.audio.playUiClick();
        triggerSkyHopFlap(this.skyHopState);
      },
      onSkyHopStarDash: () => {
        if (triggerSkyHopStarDash(this.skyHopState)) {
          this.audio.playSkyHopDash();
        }
      },
      onMoveInput: (dx, dy) => {
        this.touchMoveVec = { dx, dy };
      },
      onForceSave: () => {
        this.audio.playUiClick();
        const profile = this.activeProfile();
        profile.updatedAt = Date.now();
        void persistSaveState(this.save);
        this.showToast('Starlight v2 journey saved locally.');
      },
    };
  }

  private async applySettingsPatch(patch: Partial<GameSettings>): Promise<void> {
    const prevRenderer = this.save.settings.rendererOverride;
    this.save.settings = { ...this.save.settings, ...patch };
    this.audio.setAudioConfig(this.save.settings.audioMuted, this.save.settings.masterVolume);
    this.overworldState.reducedMotion = this.save.settings.reducedMotion;
    this.battleState.reducedMotion = this.save.settings.reducedMotion;
    this.skyHopState.reducedMotion = this.save.settings.reducedMotion;
    this.engine.activeBackend.setReducedMotion(this.save.settings.reducedMotion);
    this.engine.activeBackend.setCrtMode(this.save.settings.crtMode);

    if (patch.rendererOverride && patch.rendererOverride !== prevRenderer) {
      const nextKind = await this.engine.switchBackend(patch.rendererOverride, 'user-setting');
      this.engine.activeBackend.setReducedMotion(this.save.settings.reducedMotion);
      this.engine.activeBackend.setCrtMode(this.save.settings.crtMode);
      this.showToast(`Renderer switched to ${nextKind.toUpperCase()}.`);
    }
    await persistSaveState(this.save);
  }

  private travelToBiome(biomeId: BiomeId): void {
    const profile = this.activeProfile();
    profile.biomeId = biomeId;
    const nextMap = getOverworldMap(biomeId);
    profile.x = nextMap.spawnX;
    profile.y = nextMap.spawnY;
    profile.updatedAt = Date.now();
    this.rebuildProfileRuntimeStates(profile);
    this.screen = 'overworld';
    this.showToast(`Arrived at ${BIOME_DESCRIPTORS[biomeId].name}.`);
    void persistSaveState(this.save);
  }

  private startBattleEncounter(tier: EncounterTier): void {
    if (this.battleTurnTimer) {
      clearTimeout(this.battleTurnTimer);
      this.battleTurnTimer = null;
    }
    const profile = this.activeProfile();
    // Ensure lead has vitality if fainted
    if (profile.party.every((m) => m.hp <= 0) && profile.party[0]) {
      profile.party[0].hp = profile.party[0].maxHp;
      profile.party[0].composure = 100;
    }
    this.battleState = createBattleState(profile, profile.biomeId, tier, {
      reducedMotion: this.save.settings.reducedMotion,
      forceOfflineRig: this.forceOfflineRig,
    });
    this.battleRenderer.triggerShutter(tier, this.save.settings.reducedMotion);
    this.battleRenderer.triggerCameraCue(this.battleState.cameraCue);
    this.screen = 'battle';
    this.audio.playSpeciesCry(this.battleState.enemy.species.id);
    void persistSaveState(this.save);
  }

  private handlePlayerBattleMove(moveId: string): void {
    if (this.screen !== 'battle' || this.battleState.phase !== 'command') return;
    const move = MOVES_BY_ID[moveId] ?? MOVES_BY_ID['starlight-pulse'];
    const profile = this.activeProfile();

    this.battleState.phase = 'animating';
    this.battleState.player.lungeOffset = 1;
    this.battleState.arenaLightingType = move.type;
    this.battleState.arenaLightingPulse = 1;

    const outcome = executeBattleMove(
      this.battleState.player.member,
      this.battleState.enemy.member,
      move,
      'player',
    );
    this.battleState.enemy.status = this.battleState.enemy.member.status;
    this.battleState.enemy.composureRatio =
      this.battleState.enemy.member.composure / this.battleState.enemy.member.maxComposure;
    this.battleState.player.composureRatio =
      this.battleState.player.member.composure / this.battleState.player.member.maxComposure;

    if (outcome.damage > 0) {
      this.battleState.enemy.hitFlash = 1;
      this.battleState.enemy.recoilOffset = 1;
      this.battleState.hitStopRemaining =
        this.save.settings.reducedMotion ? 0 : outcome.cameraCue === 'heavyHit' ? 0.085 : 0.045;
      this.audio.playBattleHit(outcome.cameraCue === 'heavyHit');
    } else {
      this.audio.playUiClick();
    }

    if (outcome.composureBroken && !profile.badges.includes('badge-composure')) {
      profile.badges.push('badge-composure');
    }

    this.battleRenderer.triggerVfx({
      type: move.type,
      fromSide: 'player',
      targetSide: move.category === 'status' ? 'player' : 'enemy',
      power: move.power || 60,
      effectiveness: outcome.effectiveness,
      composureBroken: outcome.composureBroken,
      duration: this.save.settings.reducedMotion ? 0.45 : 0.85,
    });
    this.battleRenderer.triggerCameraCue(outcome.cameraCue);
    this.battleState.cameraCue = outcome.cameraCue;
    this.battleState.cameraCueElapsed = 0;
    this.battleState.statusMessage = outcome.message;

    if (outcome.defeatedTarget) {
      this.battleTurnTimer = setTimeout(() => {
        const rewardMsg = awardVictoryRewards(profile, this.battleState);
        this.battleState.phase = 'victory';
        this.battleState.statusMessage = rewardMsg;
        this.syncLandmarkStates();
        void persistSaveState(this.save);
      }, this.save.settings.reducedMotion ? 260 : 620);
      return;
    }

    // Schedule Enemy Counterattack
    this.battleTurnTimer = setTimeout(() => {
      if (this.screen !== 'battle' || !this.battleState.active) return;
      const foeMove = chooseEnemyMove(this.battleState);
      this.battleState.enemy.lungeOffset = 1;
      this.battleState.arenaLightingType = foeMove.type;
      this.battleState.arenaLightingPulse = 0.85;

      const foeOutcome = executeBattleMove(
        this.battleState.enemy.member,
        this.battleState.player.member,
        foeMove,
        'enemy',
      );
      this.battleState.player.status = this.battleState.player.member.status;
      this.battleState.player.composureRatio =
        this.battleState.player.member.composure / this.battleState.player.member.maxComposure;
      this.battleState.enemy.composureRatio =
        this.battleState.enemy.member.composure / this.battleState.enemy.member.maxComposure;

      if (foeOutcome.damage > 0) {
        this.battleState.player.hitFlash = 1;
        this.battleState.player.recoilOffset = 1;
        this.audio.playBattleHit(foeOutcome.cameraCue === 'heavyHit');
      }

      this.battleRenderer.triggerVfx({
        type: foeMove.type,
        fromSide: 'enemy',
        targetSide: foeMove.category === 'status' ? 'enemy' : 'player',
        power: foeMove.power || 55,
        effectiveness: foeOutcome.effectiveness,
        composureBroken: foeOutcome.composureBroken,
        duration: this.save.settings.reducedMotion ? 0.42 : 0.78,
      });
      this.battleRenderer.triggerCameraCue(foeOutcome.cameraCue);
      this.battleState.cameraCue = foeOutcome.cameraCue;
      this.battleState.cameraCueElapsed = 0;
      this.battleState.statusMessage = foeOutcome.message;
      this.battleState.turnNumber += 1;

      if (foeOutcome.defeatedTarget) {
        this.battleState.phase = 'defeat';
        this.battleState.statusMessage = `${this.battleState.player.species.name} fell back! Healing at Starlight Fountain restores full poise.`;
        this.battleState.player.member.hp = Math.max(1, Math.round(this.battleState.player.member.maxHp * 0.25));
      } else {
        this.battleState.phase = 'command';
      }
      void persistSaveState(this.save);
    }, this.save.settings.reducedMotion ? 320 : 760);
  }

  private handleStarBallThrow(): void {
    if (this.screen !== 'battle' || this.battleState.phase !== 'command') return;
    const profile = this.activeProfile();
    this.battleState.phase = 'capturing';
    this.battleState.enemy.captureProgress = 0.01;
    this.battleState.cameraCue = 'starBall';
    this.battleState.cameraCueElapsed = 0;
    this.battleRenderer.triggerCameraCue('starBall');
    this.battleState.statusMessage = 'Launching celestial Star Ball...';
    this.audio.playStarBallCapture();

    const result = attemptStarBallCapture(profile, this.battleState);
    this.battleTurnTimer = setTimeout(() => {
      if (this.screen !== 'battle') return;
      this.battleState.enemy.captureProgress = undefined;
      this.battleState.statusMessage = result.message;
      if (result.caught) {
        this.battleState.phase = 'victory';
        if (result.starRankAwarded >= 5 && !profile.badges.includes('badge-prism')) {
          profile.badges.push('badge-prism');
        }
      } else {
        this.battleState.phase = 'command';
      }
      void persistSaveState(this.save);
    }, this.save.settings.reducedMotion ? 360 : 980);
  }

  private handleBattlePotion(): void {
    if (this.screen !== 'battle' || this.battleState.phase !== 'command') return;
    const profile = this.activeProfile();
    if (profile.inventory.potions <= 0 && profile.inventory.superPotions <= 0) {
      this.battleState.statusMessage = 'No Potions left in your pack!';
      return;
    }
    const useSuper = profile.inventory.superPotions > 0;
    if (useSuper) profile.inventory.superPotions -= 1;
    else profile.inventory.potions -= 1;

    const lead = this.battleState.player.member;
    const heal = useSuper ? Math.round(lead.maxHp * 0.65) : Math.round(lead.maxHp * 0.4);
    lead.hp = Math.min(lead.maxHp, lead.hp + heal);
    lead.composure = Math.min(lead.maxComposure, lead.composure + 35);
    lead.status = 'none';
    this.battleState.player.status = 'none';
    this.battleState.player.composureRatio = lead.composure / lead.maxComposure;
    this.battleState.statusMessage = `${this.battleState.player.species.name} restored +${heal} HP & Composure!`;
    this.audio.playUiClick();
    void persistSaveState(this.save);
  }

  private handleBattleEvolution(): void {
    if (this.screen !== 'battle') return;
    const profile = this.activeProfile();
    const lead = this.battleState.player.member;
    const current = this.battleState.player.species;
    const nextId = current.evolvesTo ?? (current.id === 25 ? 26 : current.id === 133 ? 196 : current.id);
    const nextSpecies = getSpecies(nextId);

    this.battleState.phase = 'evolving';
    this.battleState.evolutionTarget = nextSpecies;
    this.battleState.cameraCue = 'evolution';
    this.battleState.cameraCueElapsed = 0;
    this.battleRenderer.triggerCameraCue('evolution');
    this.battleState.statusMessage =
      nextId !== current.id
        ? `Starlight Evolution! ${current.name} is ascending into ${nextSpecies.name}!`
        : `${current.name} resonates with Starlight Ascension (+1 Star Rank & Max Composure)!`;
    this.audio.playStarBallCapture();

    this.battleTurnTimer = setTimeout(() => {
      if (this.screen !== 'battle') return;
      lead.speciesId = nextSpecies.id;
      lead.starRank = Math.min(5, lead.starRank + 1);
      lead.composure = lead.maxComposure;
      lead.maxHp += 10;
      lead.hp = lead.maxHp;
      this.battleState.player.species = nextSpecies;
      this.battleState.player.composureRatio = 1;
      profile.pokedex[nextSpecies.id] = {
        seen: true,
        caught: true,
        starRank: lead.starRank,
        bond: Math.max(lead.bond, 90),
        shiny: lead.shiny,
        timesEncountered: (profile.pokedex[nextSpecies.id]?.timesEncountered ?? 0) + 1,
      };
      this.overworldState.follower.speciesId = nextSpecies.id;
      this.overworldState.follower.name = nextSpecies.name;
      this.overworldState.follower.primaryType = nextSpecies.primaryType;
      this.battleState.phase = 'command';
      this.battleState.evolutionTarget = undefined;
      this.battleState.statusMessage = `${nextSpecies.name} radiates renewed Starlight energy!`;
      void persistSaveState(this.save);
    }, this.save.settings.reducedMotion ? 400 : 1050);
  }

  private exitBattleToOverworld(toast: string): void {
    if (this.battleTurnTimer) {
      clearTimeout(this.battleTurnTimer);
      this.battleTurnTimer = null;
    }
    this.battleState.active = false;
    this.screen = 'overworld';
    this.showToast(toast);
    void persistSaveState(this.save);
  }

  private interactWithNearby(): void {
    const profile = this.activeProfile();
    const target = this.overworldState.nearbyInteraction;
    if (!target) {
      this.showToast('Walk closer to a Shrine, Fountain, Chest, Starfall node, or Companion to interact.');
      return;
    }

    if ('role' in target) {
      if (target.role === 'rival') {
        this.startBattleEncounter('rival');
      } else {
        this.screen = 'pokedex';
      }
      return;
    }

    const lm: OverworldLandmark = target;
    switch (lm.kind) {
      case 'fountain':
        for (const m of profile.party) {
          m.hp = m.maxHp;
          m.composure = m.maxComposure;
          m.status = 'none';
        }
        this.showToast('Starlight Healing Fountain restored full party HP, Status & Composure!');
        break;
      case 'shrine':
        this.startBattleEncounter('shrine');
        break;
      case 'chest':
        if (profile.openedChests.includes(lm.id)) {
          this.showToast('This treasure chest has already been claimed.');
        } else {
          profile.openedChests.push(lm.id);
          profile.inventory.starBalls += 3;
          profile.inventory.superPotions += 2;
          profile.inventory.starShards += 35;
          lm.activated = true;
          this.showToast('Opened chest: +3 Star Balls, +2 Super Potions, +35 Star Shards!');
        }
        break;
      case 'starfall':
        profile.inventory.starShards += 20;
        if (!profile.badges.includes('badge-starfall')) {
          profile.badges.push('badge-starfall');
        }
        this.startBattleEncounter('rare');
        break;
      case 'studio':
        this.screen = 'style-studio';
        break;
      case 'observatory':
        this.screen = 'pokedex';
        break;
      case 'signpost':
      case 'cottage':
      case 'dock':
      default:
        this.showToast(`${lm.label}${lm.subtitle ? ` — ${lm.subtitle}` : ''}`);
        break;
    }
    void persistSaveState(this.save);
  }

  private bindInputAndResize(): void {
    this.resizeHandler = () => {
      this.engine.resize();
    };
    window.addEventListener('resize', this.resizeHandler, { passive: true });

    this.keyDownHandler = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement | null)?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') return;

      const key = e.key.toLowerCase();
      this.pressedKeys.add(key);

      if (this.screen === 'skyhop') {
        if (key === ' ' || key === 'arrowup' || key === 'w') {
          e.preventDefault();
          if (!this.skyHopState.running) {
            startSkyHopRun(this.skyHopState, this.activeProfile());
          } else {
            triggerSkyHopFlap(this.skyHopState);
          }
        } else if (key === 'shift' || key === 'd' || key === 'arrowright') {
          if (triggerSkyHopStarDash(this.skyHopState)) {
            this.audio.playSkyHopDash();
          }
        } else if (key === 'escape') {
          this.skyHopState.active = false;
          this.skyHopState.running = false;
          this.screen = 'overworld';
        }
        return;
      }

      if (this.screen === 'overworld') {
        if (key === 'e' || key === 'enter' || key === ' ') {
          e.preventDefault();
          this.interactWithNearby();
        } else if (key === 'b') {
          this.screen = 'briefing';
        } else if (key === 'p') {
          this.screen = 'pokedex';
        }
        return;
      }

      if (key === 'escape' && (this.screen === 'pokedex' || this.screen === 'badges' || this.screen === 'style-studio' || this.screen === 'briefing')) {
        this.screen = 'overworld';
      }
    };

    this.keyUpHandler = (e: KeyboardEvent) => {
      this.pressedKeys.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
  }

  private updateOverworldMovement(dtSeconds: number): void {
    let dx = this.touchMoveVec.dx;
    let dy = this.touchMoveVec.dy;
    if (this.pressedKeys.has('arrowleft') || this.pressedKeys.has('a')) dx -= 1;
    if (this.pressedKeys.has('arrowright') || this.pressedKeys.has('d')) dx += 1;
    if (this.pressedKeys.has('arrowup') || this.pressedKeys.has('w')) dy -= 1;
    if (this.pressedKeys.has('arrowdown') || this.pressedKeys.has('s')) dy += 1;

    const player = this.overworldState.player;
    const follower = this.overworldState.follower;
    const len = Math.hypot(dx, dy);

    if (len > 0.05) {
      const nx = dx / len;
      const ny = dy / len;
      const speed = 4.6; // tiles per second
      const candX = player.x + nx * speed * dtSeconds;
      const candY = player.y + ny * speed * dtSeconds;

      if (Math.abs(nx) > Math.abs(ny)) {
        player.facing = nx < 0 ? 'left' : 'right';
      } else {
        player.facing = ny < 0 ? 'up' : 'down';
      }

      // Check seamless neighbor biome crossings at map borders
      if (candY < 1.2 && this.map.neighbors.up) {
        this.travelToBiome(this.map.neighbors.up);
        return;
      }
      if (candY > this.map.height - 1.2 && this.map.neighbors.down) {
        this.travelToBiome(this.map.neighbors.down);
        return;
      }
      if (candX < 1.2 && this.map.neighbors.left) {
        this.travelToBiome(this.map.neighbors.left);
        return;
      }
      if (candX > this.map.width - 1.2 && this.map.neighbors.right) {
        this.travelToBiome(this.map.neighbors.right);
        return;
      }

      const clampedX = Math.max(1.4, Math.min(this.map.width - 1.4, candX));
      const clampedY = Math.max(1.8, Math.min(this.map.height - 1.4, candY));
      const tile = this.map.tiles[Math.floor(clampedY) * this.map.width + Math.floor(clampedX)];
      if (tile !== 'cliff' && tile !== 'deep-water') {
        player.x = clampedX;
        player.y = clampedY;
      }

      player.moving = true;
      player.walkCycle += dtSeconds * 8.5;

      const profile = this.activeProfile();
      profile.x = player.x;
      profile.y = player.y;
      profile.facing = player.facing;

      this.stepAccum += dtSeconds;
      if (this.stepAccum > 0.32) {
        this.stepAccum = 0;
        this.audio.playFootstep(tile === 'shallow-water' || tile === 'bridge');
      }

      // Tall-grass wild encounter chance
      if (tile === 'tall-grass') {
        this.wildEncounterCooldown -= dtSeconds;
        if (this.wildEncounterCooldown <= 0 && Math.random() < dtSeconds * 0.45) {
          this.wildEncounterCooldown = 6.5;
          this.startBattleEncounter('wild');
          return;
        }
      }
    } else {
      player.moving = false;
    }

    // Smooth partner follower trailing behind the trainer
    const targetDist = 1.15;
    const fdx = player.x - follower.x;
    const fdy = player.y - follower.y;
    const dist = Math.hypot(fdx, fdy);
    if (dist > targetDist) {
      const pull = Math.min(dist - targetDist, 4.4 * dtSeconds);
      follower.x += (fdx / dist) * pull;
      follower.y += (fdy / dist) * pull;
      follower.moving = true;
      follower.walkCycle += dtSeconds * 8.0;
      follower.facing =
        Math.abs(fdx) > Math.abs(fdy)
          ? (fdx < 0 ? 'left' : 'right')
          : (fdy < 0 ? 'up' : 'down');
    } else {
      follower.moving = false;
    }

    // Detect closest interactable landmark or NPC within 2.3 tiles
    let closest: OverworldLandmark | OverworldActor | null = null;
    let bestDist = 2.35;
    for (const lm of this.map.landmarks) {
      const cx = lm.tileX + lm.widthTiles * 0.5;
      const cy = lm.tileY + lm.heightTiles * 0.5;
      const d = Math.hypot(player.x - cx, player.y - cy);
      if (d < bestDist) {
        bestDist = d;
        closest = lm;
      }
    }
    for (const npc of this.overworldState.npcs) {
      const d = Math.hypot(player.x - npc.x, player.y - npc.y);
      if (d < bestDist) {
        bestDist = d;
        closest = npc;
      }
    }
    this.overworldState.nearbyInteraction = closest;
  }

  private tick(
    dtSeconds: number,
    elapsedSeconds: number,
    backend: RenderEngine['activeBackend'],
  ): void {
    const profile = this.activeProfile();
    profile.playtimeSeconds += dtSeconds;

    if (this.toastMessage && performance.now() > this.toastUntil) {
      this.toastMessage = null;
    }

    // Update & render active presentation domain
    if (this.screen === 'title') {
      this.titleRenderer.update(dtSeconds, this.save.settings.reducedMotion);
      this.titleRenderer.render(backend, this.save, this.save.settings.reducedMotion);
    } else if (this.screen === 'battle') {
      this.battleState.elapsedSeconds += dtSeconds;
      this.battleState.reducedMotion = this.save.settings.reducedMotion;
      this.battleState.forceOfflineRig = this.forceOfflineRig;
      if (this.battleState.phase === 'shutter') {
        this.battleState.shutter.progress += dtSeconds / Math.max(0.1, this.battleState.shutter.duration);
        if (this.battleState.shutter.progress >= 1) {
          this.battleState.shutter.active = false;
          this.battleState.shutter.progress = 1;
          this.battleState.phase = 'command';
        }
      }
      if (this.battleState.phase === 'capturing' && this.battleState.enemy.captureProgress !== undefined) {
        this.battleState.enemy.captureProgress = Math.min(1, this.battleState.enemy.captureProgress + dtSeconds * 1.15);
      }
      this.battleRenderer.update(this.battleState, dtSeconds);
      this.battleRenderer.render(backend, this.battleState);
    } else if (this.screen === 'skyhop') {
      this.skyHopState.reducedMotion = this.save.settings.reducedMotion;
      const stepRes = stepSkyHop(this.skyHopState, dtSeconds, profile);
      if (stepRes.collectedShard) this.audio.playUiClick();
      if (stepRes.hitHazard) this.audio.playBattleHit(true);
      this.skyHopRenderer.update(this.skyHopState, dtSeconds);
      this.skyHopRenderer.render(backend, this.skyHopState);
    } else {
      // Overworld renders continuously underneath HUD & overlay modals (Briefing, Pokédex, Badges, Style Studio)
      if (this.screen === 'overworld') {
        this.updateOverworldMovement(dtSeconds);
      }
      this.overworldState.elapsedSeconds = elapsedSeconds;
      this.overworldState.reducedMotion = this.save.settings.reducedMotion;
      this.overworldRenderer.update(this.overworldState, dtSeconds);
      this.overworldRenderer.render(backend, this.overworldState);
    }

    // Periodic autosave every 12 seconds
    this.autosaveAccum += dtSeconds;
    if (this.autosaveAccum >= 12) {
      this.autosaveAccum = 0;
      profile.updatedAt = Date.now();
      void persistSaveState(this.save);
    }

    // Sync Celestial Glass UI snapshot
    const briefing = computeTacticalBriefing(profile, profile.biomeId, this.map);
    const cryWaveform = this.audio.getCryWaveformSnapshot(this.selectedPokedexId, elapsedSeconds * 2.2);
    const availableMoves = resolveMoves(this.battleState.player.member.moves);

    this.ui.sync({
      screen: this.screen,
      save: this.save,
      profile,
      overworld: this.overworldState,
      battle: this.battleState,
      skyhop: this.skyHopState,
      briefing,
      badges: BADGE_DEFINITIONS,
      capabilities: backend.capabilities,
      frameStats: this.engine.getStats(),
      toastMessage: this.toastMessage,
      selectedPokedexId: this.selectedPokedexId,
      cryWaveform,
      availableMoves,
    });
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    this.toastUntil = performance.now() + 3400;
  }

  private exposeDebugHandle(): void {
    window.__STARLIGHT_DEBUG__ = {
      getState: () => ({
        screen: this.screen,
        backend: this.engine.activeBackend.kind,
        capabilities: this.engine.activeBackend.capabilities,
        frameStats: this.engine.getStats(),
        hydrationSource: this.hydrationSource,
        activeSlot: this.save.activeSlot,
        biomeId: this.activeProfile().biomeId,
        playerPos: { x: this.overworldState.player.x, y: this.overworldState.player.y },
        grassDisplacements: this.overworldRenderer.getDisplacementCount(),
        contextEvents: [...this.contextEvents],
        save: this.save,
        battleActive: this.battleState.active,
        battlePhase: this.battleState.phase,
        skyhopScore: this.skyHopState.score,
        manifestLoaded: this.manifest !== null,
      }),
      simulateContextLoss: () => this.engine.simulateContextLoss(),
      switchRenderer: (mode) => this.engine.switchBackend(mode, 'debug-bridge'),
      navigateScreen: (screen) => {
        this.screen = screen;
        if (screen === 'skyhop') this.skyHopState.active = true;
      },
      travelBiome: (biomeId) => this.travelToBiome(biomeId),
      triggerEncounter: (tier) => this.startBattleEncounter(tier),
      forceSave: async () => {
        this.activeProfile().updatedAt = Date.now();
        await persistSaveState(this.save);
      },
    };
  }

  dispose(): void {
    if (this.battleTurnTimer) clearTimeout(this.battleTurnTimer);
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    if (this.keyDownHandler) window.removeEventListener('keydown', this.keyDownHandler);
    if (this.keyUpHandler) window.removeEventListener('keyup', this.keyUpHandler);
    if (this.unsubContext) this.unsubContext();
    this.ui.dispose();
    this.engine.dispose();
  }
}
