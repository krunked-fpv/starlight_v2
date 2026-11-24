import type {
  BiomeId,
  BodyArchetype,
  ElementalType,
  EncounterTier,
  PartyMember,
  SpeciesRecord,
  StatusCondition,
} from './types';
import type { IRenderBackend } from './render';

export type BattleCameraCue =
  | 'idle'
  | 'hit'
  | 'heavyHit'
  | 'starBall'
  | 'rivalIntro'
  | 'shrineGuardian'
  | 'evolution';

export interface BattleParallaxPlane {
  name: 'sky' | 'far-horizon' | 'mid-landmarks' | 'combat-ground' | 'foreground-frame';
  parallaxFactor: number;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
}

export interface BattleArenaDescriptor {
  biomeId: BiomeId;
  elementalType: ElementalType;
  name: string;
  planes: [
    BattleParallaxPlane,
    BattleParallaxPlane,
    BattleParallaxPlane,
    BattleParallaxPlane,
    BattleParallaxPlane,
  ];
  platformKind: 'meadow-stone' | 'water-mirror' | 'crystal-dias' | 'volcanic-basalt' | 'astral-marble' | 'cloud-ledge';
  ambientGlowHex: string;
  reflectionAlpha: number;
}

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
  effectiveness: number; // 0.5, 1, 2, 4
  composureBroken: boolean;
  elapsed: number;
  duration: number;
}

export interface BattleCombatantVisual {
  side: 'player' | 'enemy';
  member: PartyMember;
  species: SpeciesRecord;
  spriteUrl?: string;
  spriteLoaded: boolean;
  useOfflineRig: boolean;
  hitFlash: number; // 0..1
  lungeOffset: number; // -1..1
  recoilOffset: number; // 0..1
  status: StatusCondition;
  composureRatio: number; // 0..1
  captureProgress?: number; // 0..1 during Star Ball throw
}

export interface BattleSceneState {
  active: boolean;
  biomeId: BiomeId;
  tier: EncounterTier;
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
  canCapture: boolean;
  evolutionTarget?: SpeciesRecord;
}

export interface OfflineRigDescriptor {
  speciesId: number;
  name: string;
  primaryType: ElementalType;
  secondaryType: ElementalType | null;
  archetype: BodyArchetype;
  palette: [string, string, string];
  shiny?: boolean;
}

export interface IOfflineSpriteRigSynthesizer {
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
  triggerShutter(tier: EncounterTier, reducedMotion: boolean): void;
  triggerVfx(event: Omit<BattleVfxEvent, 'id' | 'elapsed'>): void;
  triggerCameraCue(cue: BattleCameraCue): void;
  update(state: BattleSceneState, dtSeconds: number): void;
  render(backend: IRenderBackend, state: BattleSceneState): void;
  getOfflineRigSynthesizer(): IOfflineSpriteRigSynthesizer;
}
