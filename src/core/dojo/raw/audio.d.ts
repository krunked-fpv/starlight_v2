/* eslint-disable @typescript-eslint/no-explicit-any */
export const THEMES: Record<string, any>;
export class AudioEngine {
  ctx: AudioContext | null;
  muted: boolean;
  masterFilter: AudioNode | null;
  masterGain: GainNode | null;
  currentTheme: string | null;
  unlock(): void;
  ensureContext(): AudioContext | null;
  setMuted(muted: boolean): void;
  playBGM(themeName: string): void;
  stopBGM(): void;
  playMenuBlip(freq?: number): void;
  playStep(onGrass?: boolean): void;
  playEncounterStinger(): void;
  playHit(superEff?: boolean): void;
  playMoveSfx(moveId: string, fx?: string): boolean;
  playHealChime(): void;
  playCatchThrow(): void;
  playCatchShake(): void;
  playCatchSuccess(): void;
  playVictoryFanfare(): void;
  playBadgeFanfare(): void;
  playEvolveFanfare(): void;
  playChestOpen(): void;
  playArcadeStar(combo?: number): void;
  playArcadeBoost(): void;
  playArcadeBump(): void;
  playPokemonCry(speciesOrId: any): {
    speciesId: number;
    baseFreq: number;
    wave: string;
    duration: number;
    played: boolean;
  };
}
export function createAudioEngine(): AudioEngine;
