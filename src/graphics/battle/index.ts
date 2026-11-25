export {
  BATTLE_ARENAS,
  computeBattleStageLayout,
  renderArena,
  renderArenaBackdrop,
  renderArenaForeground,
  emitArenaPointLights,
  type ArenaPedestalKind,
  type ArenaWeatherKind,
  type BattleArenaDescriptor,
  type BattleCameraTransform,
  type BattlePadAnchor,
  type BattleStageLayout,
} from './BattleArenas';

export { OfflineSpriteRigSynthesizer } from './OfflineSpriteRigSynthesizer';
export { BattleVfxDirector, type BattleCeremonyState } from './BattleVfxDirector';
export {
  BattleTheaterRenderer,
  resolveSpriteMotionStyle,
  type SpriteMotionStyle,
} from './BattleTheaterRenderer';
