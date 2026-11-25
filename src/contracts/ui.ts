import type {
  ActiveScreen,
  BallKind,
  BiomeId,
  DecodedSpriteFrames,
  DojoBadgeEntry,
  DojoEvolutionItem,
  DojoProfileState,
  DrawerTab,
  ElementalType,
  EncounterTier,
  GameSettings,
  ReadinessTier,
  StarlightSaveState,
  TrainerAccessoryId,
  TrainerAuraId,
  TrainerId,
  TrainerStyleId,
} from './types';
import type { BattleSceneState } from './battle';
import type { OverworldSceneState } from './overworld';
import type { FrameStats, IRenderBackend, RendererCapabilities } from './render';

export type IconId =
  | 'icon-pokeball'
  | 'icon-greatball'
  | 'icon-starball'
  | 'icon-potion'
  | 'icon-star-shard'
  | 'icon-cheer-heart'
  | 'icon-composure'
  | 'icon-briefing'
  | 'icon-waypoint'
  | 'icon-compass'
  | 'icon-warp-safe'
  | 'icon-warp-farm'
  | 'icon-shrine'
  | 'icon-chest'
  | 'icon-fountain'
  | 'icon-signpost'
  | 'icon-starfall'
  | 'icon-pokedex'
  | 'icon-team'
  | 'icon-badges'
  | 'icon-guide'
  | 'icon-style'
  | 'icon-skyhop'
  | 'icon-settings'
  | 'icon-audio-on'
  | 'icon-audio-off'
  | 'icon-crt'
  | 'icon-motion'
  | 'icon-save'
  | 'icon-bond'
  | 'icon-star-rank'
  | 'icon-crown'
  | 'icon-trophy'
  | 'icon-shield'
  | 'icon-sword'
  | 'icon-sparkle'
  | 'icon-gem'
  | 'icon-evolve'
  | 'icon-quest'
  | 'icon-rival'
  | 'icon-lab'
  | 'icon-lock'
  | 'icon-check'
  | 'icon-warn'
  | 'icon-danger'
  | 'icon-balance'
  | 'icon-close'
  | 'icon-cape'
  | 'icon-hat'
  | 'icon-aura'
  | 'icon-pause'
  | 'icon-play'
  | 'icon-dash'
  | `icon-type-${ElementalType}`
  | `icon-badge-${number}`;

export interface TacticalBriefingData {
  kind: 'biome' | 'shrine' | 'shrine-trial' | 'rival';
  targetId: string;
  title: string;
  subtitle: string;
  biomeId: BiomeId;
  enemyTypes: ElementalType[];
  enemyCount: number;
  teamLevel: number;
  targetLevel: number;
  levelDelta: number;
  needsHeal: boolean;
  avgHpRatio: number;
  faintedCount: number;
  healthyCount: number;
  hasTypeAdvantage: boolean;
  hasTypeRisk: boolean;
  suggestedCounterTypes: ElementalType[];
  tier: ReadinessTier;
  label: string;
  iconId: IconId;
  tip: string;
  previewSpeciesId: number;
  previewSpeciesName: string;
  canChallenge: boolean;
  farmZoneBiomeId: BiomeId;
  farmZoneBiomeName: string;
  upgradeTier?: number;
  badgeName?: string;
  partyPreview?: Array<{ speciesId: number; name: string; level: number; type: ElementalType; upgradeTier?: number }>;
  rematchNumber?: number;
  minLv?: number;
  maxLv?: number;
}

export interface DialogueModalState {
  speaker: string;
  speakerPortrait?: 'violet' | 'ozias' | 'willow' | 'rival';
  title?: string;
  lines: string[];
  currentIndex: number;
  rewardTags?: Array<{ iconId: IconId; label: string }>;
  actionLabel?: string;
  onConfirmAction?: () => void;
}

export interface CryWaveformSnapshot {
  speciesId: number;
  samples: Float32Array;
  peakAmplitude: number;
  playing: boolean;
}

export interface SkyHopEntity {
  id: string;
  kind: 'star' | 'bigstar' | 'comet' | 'cloud' | 'storm_orb' | 'void_meteor' | 'heart';
  x: number; // 0..760 logical coords
  y: number; // 0..420 logical coords
  baseY: number;
  vy: number;
  radius: number;
  speed: number;
  age: number;
  bobAmp: number;
  bobFreq: number;
}

export interface SkyHopParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  maxSize?: number;
  color: string;
  shape: 'dot' | 'spark' | 'star' | 'ring';
}

export interface SkyHopState {
  active: boolean;
  running: boolean;
  paused: boolean;
  gameOver: boolean;
  outOfCharges: boolean;
  partnerSpeciesId: number;
  partnerName: string;
  partnerType: ElementalType;
  partnerShiny: boolean;
  partnerFrames: DecodedSpriteFrames | null;
  playerX: number;
  playerY: number;
  playerVy: number;
  bankAngle: number;
  dashTimer: number;
  dashCooldown: number;
  magnetTimer: number;
  hitInvulnTimer: number;
  shakeTimer: number;
  wave: number;
  waveName: string;
  waveBannerTimer: number;
  skyIndex: number;
  score: number;
  combo: number;
  comboStreak: number;
  starsCollected: number;
  highScore: number;
  bestWave: number;
  hearts: number;
  maxHearts: number;
  charges: number;
  maxCharges: number;
  starShards: number;
  canBuyWithShards: boolean;
  shardBuyInCost: number;
  elapsedSeconds: number;
  reducedMotion: boolean;
  entities: SkyHopEntity[];
  particles: SkyHopParticle[];
  lastRunRewards?: {
    tierLabel: string;
    nextHint: string;
    starShards: number;
    potions: number;
    greatBalls: number;
    starBalls: number;
    cheerCharges: number;
    gems: Record<string, number>;
    isNewBest: boolean;
  } | null;
}

export interface ISkyHopRenderer {
  update(state: SkyHopState, dtSeconds: number): void;
  render(backend: IRenderBackend, state: SkyHopState): void;
}

export interface BadgeToastState {
  badgeId: string;
  name: string;
  description: string;
  iconId: IconId;
  remainingSec: number;
}

export interface CelebrationBannerState {
  seq: number;
  iconId: IconId;
  title: string;
  subtitle?: string;
  tone?: 'gold' | 'quest' | 'heal' | 'starlight' | 'arcade' | 'badge' | 'shrine';
}

export interface UIRenderSnapshot {
  screen: ActiveScreen;
  activeDrawerTab: DrawerTab;
  save: StarlightSaveState;
  profile: DojoProfileState | null;
  overworld: OverworldSceneState;
  battle: BattleSceneState;
  skyhop: SkyHopState;
  briefing: TacticalBriefingData | null;
  dialogue: DialogueModalState | null;
  badges: DojoBadgeEntry[];
  evolutionItems: DojoEvolutionItem[];
  capabilities: RendererCapabilities;
  frameStats: FrameStats;
  toastMessage: string | null;
  badgeToast: BadgeToastState | null;
  celebration?: CelebrationBannerState | null;
  selectedPokedexId: number;
  cryWaveform: CryWaveformSnapshot;
  spriteCacheVersion: number;
}

export interface UIBridgeCallbacks {
  onSelectTrainer(trainerId: TrainerId): void;
  onChooseStarter(speciesId: number): void;
  onNavigateScreen(screen: ActiveScreen, drawerTab?: DrawerTab): void;
  onOpenBriefingForBiome(biomeId?: BiomeId): void;
  onConfirmBriefing(): void;
  onDismissBriefing(): void;
  onAdvanceDialogue(): void;
  onDismissDialogue(): void;
  onWarpSafeZone(): void;
  onWarpFarmZone(): void;
  onWarpBiome(biomeId: BiomeId): void;
  onInteractNearby(): void;
  onTriggerEncounter(tier: EncounterTier): void;
  onBattleMove(moveId: string): void;
  onBattleThrowBall(kind: BallKind): void;
  onBattleUsePotion(): void;
  onBattleSwitchMember(teamIdx: number): void;
  onBattleFlee(): void;
  onBattleToggleOfflineRig(): void;
  onBattleConfirmEvolution(): void;
  onBattleCloseResult(): void;
  onSelectPokedexSpecies(speciesId: number): void;
  onPlaySpeciesCry(speciesId: number): void;
  onSetLeadPokemon(teamIdx: number): void;
  onSwapTeamWithBox(teamIdx: number, boxIdx: number): void;
  onDepositToBox(teamIdx: number): void;
  onWithdrawFromBox(boxIdx: number): void;
  onUpgradePokemon(uid: string): void;
  onCheerPokemon(uid: string): void;
  onHealPokemonWithPotion(uid: string): void;
  onEvolvePokemon(uid: string, toSpeciesId: number, itemKey?: string): void;
  onRenamePokemon(uid: string, nickname: string): void;
  onUpdateAppearance(patch: Partial<{
    styleId: TrainerStyleId;
    accessory: TrainerAccessoryId;
    cape: boolean;
    aura: TrainerAuraId;
    nickname: string;
  }>): void;
  onUpdateSettings(patch: Partial<GameSettings>): void;
  onResetTrainerProgress(trainerId: TrainerId): void;
  onResetAllProgress(): void;
  onParentHoldTick?: (progress: number) => void;
  onOpenSkyHop(): void;
  onStartSkyHop(): void;
  onBuySkyHopCharge(): void;
  onToggleSkyHopPause(): void;
  onSkyHopInputY(normY: number | null): void;
  onSkyHopKeyDir(dir: 'up' | 'down', held: boolean): void;
  onSkyHopStarDash(): void;
  onCloseSkyHop(): void;
  onMoveInput(dx: number, dy: number): void;
  onTapWorldCanvas(canvasX: number, canvasY: number, width: number, height: number): void;
  onForceSave(): void;
}

export interface ICelestialUIController {
  mount(root: HTMLElement, callbacks: UIBridgeCallbacks): void;
  sync(snapshot: UIRenderSnapshot): void;
  dispose(): void;
}
