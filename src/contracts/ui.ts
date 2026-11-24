import type {
  ActiveScreen,
  AuraId,
  BadgeDefinition,
  BiomeId,
  CapeId,
  ElementalType,
  EncounterTier,
  GameSettings,
  HeadgearId,
  MoveRecord,
  OutfitId,
  SpeciesRecord,
  StarlightSaveState,
  TrainerProfile,
} from './types';
import type { BattleSceneState } from './battle';
import type { OverworldSceneState } from './overworld';
import type { FrameStats, IRenderBackend, RendererCapabilities } from './render';

export type IconId =
  | 'icon-pokeball'
  | 'icon-starball'
  | 'icon-potion'
  | 'icon-super-potion'
  | 'icon-star-shard'
  | 'icon-composure'
  | 'icon-briefing'
  | 'icon-waypoint'
  | 'icon-shrine'
  | 'icon-chest'
  | 'icon-fountain'
  | 'icon-signpost'
  | 'icon-starfall'
  | 'icon-pokedex'
  | 'icon-badges'
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
  | `icon-type-${ElementalType}`
  | `icon-badge-${number}`;

export interface TacticalBriefingData {
  biomeId: BiomeId;
  biomeName: string;
  biomeType: ElementalType;
  readinessScore: number; // 0..100
  readinessGrade: 'OPTIMAL' | 'READY' | 'CAUTION';
  partyHpPercent: number;
  avgComposure: number;
  recommendedTypes: ElementalType[];
  guardianSpecies: SpeciesRecord;
  guardianCleared: boolean;
  starBallsReady: number;
  potionsReady: number;
  activeAura: AuraId;
  wayfindingLabel: string;
  alerts: Array<{
    severity: 'info' | 'warn' | 'advantage';
    iconId: IconId;
    text: string;
  }>;
}

export interface HolographicCardState {
  speciesId: number;
  pointerTiltX: number; // -1..1
  pointerTiltY: number; // -1..1
  starRank: number; // 0..5
  bondLevel: number; // 0..100
  caught: boolean;
  shiny: boolean;
}

export interface CryWaveformSnapshot {
  speciesId: number;
  samples: Float32Array; // -1..1 normalized length 128
  peakAmplitude: number;
  playing: boolean;
}

export interface SkyHopEntity {
  id: string;
  kind: 'star-shard' | 'plasma-vortex' | 'dread-meteor' | 'ring-boost';
  x: number; // 0..1 normalized viewport
  y: number; // 0..1 normalized viewport
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  collected?: boolean;
}

export interface SkyHopState {
  active: boolean;
  running: boolean;
  gameOver: boolean;
  partnerSpeciesId: number;
  partnerType: ElementalType;
  playerX: number; // 0..1
  playerY: number; // 0..1
  playerVy: number;
  bankAngle: number; // radians
  starDashCharge: number; // 0..100
  starDashActive: boolean;
  starDashRemaining: number;
  auroraPhase: number;
  cloudScroll: number;
  score: number;
  combo: number;
  highScore: number;
  shields: number;
  elapsedSeconds: number;
  reducedMotion: boolean;
  entities: SkyHopEntity[];
}

export interface ISkyHopRenderer {
  update(state: SkyHopState, dtSeconds: number): void;
  render(backend: IRenderBackend, state: SkyHopState): void;
}

export interface UIRenderSnapshot {
  screen: ActiveScreen;
  save: StarlightSaveState;
  profile: TrainerProfile;
  overworld: OverworldSceneState;
  battle: BattleSceneState;
  skyhop: SkyHopState;
  briefing: TacticalBriefingData;
  badges: BadgeDefinition[];
  capabilities: RendererCapabilities;
  frameStats: FrameStats;
  toastMessage: string | null;
  selectedPokedexId: number;
  cryWaveform: CryWaveformSnapshot;
  availableMoves: MoveRecord[];
}

export interface UIBridgeCallbacks {
  onSelectProfile(slotId: 'slot0' | 'slot1'): void;
  onEnterWorld(slotId?: 'slot0' | 'slot1'): void;
  onNavigateScreen(screen: ActiveScreen): void;
  onTravelBiome(biomeId: BiomeId): void;
  onTriggerEncounter(tier: EncounterTier): void;
  onInteractNearby(): void;
  onBattleMove(moveId: string): void;
  onBattleThrowStarBall(): void;
  onBattleUsePotion(): void;
  onBattleFlee(): void;
  onBattleToggleOfflineRig(): void;
  onBattleTriggerEvolution(): void;
  onSelectPokedexSpecies(speciesId: number): void;
  onPlaySpeciesCry(speciesId: number): void;
  onUpdateStyle(patch: Partial<{
    outfit: OutfitId;
    cape: CapeId;
    headgear: HeadgearId;
    aura: AuraId;
  }>): void;
  onUpdateSettings(patch: Partial<GameSettings>): void;
  onStartSkyHop(): void;
  onSkyHopFlap(): void;
  onSkyHopStarDash(): void;
  onMoveInput(dx: number, dy: number): void;
  onForceSave(): void;
}

export interface ICelestialUIController {
  mount(root: HTMLElement, callbacks: UIBridgeCallbacks): void;
  sync(snapshot: UIRenderSnapshot): void;
  dispose(): void;
}
