import type {
  BallKind,
  BiomeId,
  BodyArchetype,
  DecodedSpriteFrames,
  DojoMoveEntry,
  ElementalType,
  EncounterTier,
  EncounterTraitId,
} from './types';
import type { AtlasManifest, IRenderBackend } from './render';

export type BattleCameraCue =
  | 'idle'
  | 'hit'
  | 'heavyHit'
  | 'starBall'
  | 'rivalIntro'
  | 'shrineGuardian'
  | 'evolution';

export interface BattleShutterState {
  active: boolean;
  tier: EncounterTier;
  progress: number; // 0..1
  duration: number;
}

export interface BattleVfxEvent {
  id: string;
  type: ElementalType;
  fromSide: 'player' | 'enemy';
  targetSide: 'player' | 'enemy';
  power: number;
  effectiveness: number;
  category: 'attack' | 'heal' | 'buff' | 'shield';
  composureBraced: boolean;
  isCrit: boolean;
  elapsed: number;
  duration: number;
}

export interface BattleCombatantSnapshot {
  uid: string;
  speciesId: number;
  name: string;
  displayName: string;
  type: ElementalType;
  level: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  xp: number;
  xpToNext: number;
  bond: number;
  upgradeTier: number;
  isShiny: boolean;
  isElite: boolean;
  encounterTrait: EncounterTraitId | null;
  abilityId: string | null;
  abilityName: string | null;
  archetype: BodyArchetype;
  colorHex: string;
  battleStages: { atk: number; def: number; spd: number };
  shieldTurns: number;
  moves: Array<DojoMoveEntry & { currentPp: number; maxPp: number }>;
}

export interface BattleCombatantVisual {
  side: 'player' | 'enemy';
  mon: BattleCombatantSnapshot;
  frames: DecodedSpriteFrames | null;
  useOfflineRig: boolean;
  hitFlash: number; // 0..1
  lungeOffset: number; // -1..1
  recoilOffset: number; // 0..1
  bracedFlash: number; // 0..1 hexagonal Composure BRACED! burst
  buffFlash: number; // 0..1 stat boost shimmer
  healFlash: number; // 0..1 heal glow
  abilityBanner: { name: string; summary: string; elapsed: number } | null;
  captureProgress: number; // 0..1
  captureShakes: number;
  captureBallKind: BallKind;
}

export interface BattleSceneState {
  active: boolean;
  biomeId: BiomeId;
  tier: EncounterTier;
  isBoss: boolean;
  isTrainerBattle: boolean;
  rivalId: string | null;
  rivalName: string | null;
  rivalTotalMons: number;
  rivalRemainingMons: number;
  shrineId: string | null;
  shrineTrialNumber: number;
  turnNumber: number;
  phase:
    | 'shutter'
    | 'intro'
    | 'command'
    | 'animating'
    | 'capturing'
    | 'evolving'
    | 'victory'
    | 'defeat';
  player: BattleCombatantVisual;
  enemy: BattleCombatantVisual;
  shutter: BattleShutterState;
  activeVfx: BattleVfxEvent[];
  cameraCue: BattleCameraCue;
  cameraCueElapsed: number;
  hitStopRemaining: number;
  arenaLightingType: ElementalType | null;
  arenaLightingPulse: number; // 0..1
  elapsedSeconds: number;
  reducedMotion: boolean;
  forceOfflineRig: boolean;
  statusMessage: string;
  battleLog: string[];
  canCapture: boolean;
  canRun: boolean;
  evolutionTarget?: { fromId: number; toId: number; toName: string };
  rewardSummary?: {
    xpGained: number;
    shardsGained: number;
    newBadges: string[];
    caught: boolean;
    leveledUp: boolean;
  };
}

export interface OfflineRigDescriptor {
  speciesId: number;
  name: string;
  primaryType: ElementalType;
  archetype: BodyArchetype;
  colorHex: string;
  shiny?: boolean;
}

export interface IOfflineSpriteRigSynthesizer {
  attachFallbackSheet(sheet: HTMLImageElement | HTMLCanvasElement | null, manifest: AtlasManifest | null): void;
  renderRig(
    ctx: CanvasRenderingContext2D,
    rig: OfflineRigDescriptor,
    options: {
      cx: number;
      cy: number;
      size: number;
      time: number;
      facing: 'left' | 'right';
      hitFlash?: number;
      rimColor?: string;
      reducedMotion?: boolean;
    },
  ): void;
  toDataUrl(rig: OfflineRigDescriptor, size?: number): string;
}

export interface IBattleTheaterRenderer {
  attachAssets(
    manifest: AtlasManifest | null,
    getArenaImage: (biomeId: BiomeId) => HTMLImageElement | null,
    getSheetImage: (sheetId: string) => HTMLImageElement | null,
  ): void;
  triggerShutter(tier: EncounterTier, reducedMotion: boolean): void;
  triggerVfx(event: Omit<BattleVfxEvent, 'id' | 'elapsed'>): void;
  triggerCameraCue(cue: BattleCameraCue): void;
  update(state: BattleSceneState, dtSeconds: number): void;
  render(backend: IRenderBackend, state: BattleSceneState): void;
  getOfflineRigSynthesizer(): IOfflineSpriteRigSynthesizer;
}
