import type { CryWaveformSnapshot } from '../../contracts';
import { AudioEngine, THEMES, createAudioEngine } from './raw/audio.js';
import { SPECIES } from './raw/config.js';

export { THEMES };

type AudioEngineExtended = Omit<AudioEngine, 'playWindup' | 'playWarpTeleport' | 'playSafeRecall'> & {
  getDiagnostics?: () => Record<string, unknown>;
  playHoldTick?: (progress?: number) => void;
  playXpTick?: (progress?: number) => void;
  playWindup?: (type?: string) => void;
  playTackle?: () => void;
  playWarpTeleport?: (options?: { phase?: 'depart' | 'arrive' | 'full'; mode?: 'starlight' | 'safe' }) => void;
  playSafeRecall?: (options?: { phase?: 'depart' | 'arrive' | 'full' }) => void;
};

/**
 * Wraps C:\dojo's 23-theme chiptune Web Audio engine + 1,025 deterministic Pokémon cries
 * and attaches a real-time AnalyserNode waveform tap for the Pokédex Cry Visualizer.
 */
export class StarlightAudioController {
  private readonly engine: AudioEngineExtended;
  private analyser: AnalyserNode | null = null;
  private waveformSamples = new Float32Array(128);
  private lastCrySpeciesId = 25;
  private cryPlayingUntilMs = 0;
  private masterVolume = 0.65;

  constructor() {
    this.engine = createAudioEngine() as AudioEngineExtended;
    this.synthesizeDeterministicWaveform(25, 420, 'pulse12');
  }

  unlock(): void {
    this.engine.unlock();
    this.attachAnalyser();
    this.applyGainNow();
  }

  private attachAnalyser(): void {
    const ctx = this.engine.ensureContext?.();
    if (!ctx) return;
    if (this.analyser || typeof ctx.createAnalyser !== 'function') {
      this.applyGainNow();
      return;
    }
    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      if (this.engine.masterGain) {
        this.engine.masterGain.connect(analyser);
        this.applyGainNow();
      }
      this.analyser = analyser;
    } catch {
      this.analyser = null;
    }
  }

  setMuted(muted: boolean): void {
    this.engine.setMuted(Boolean(muted));
    this.applyGainNow();
  }

  isMuted(): boolean {
    if (typeof this.engine.isMuted === 'function') {
      return Boolean(this.engine.isMuted());
    }
    return Boolean(this.engine.muted);
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.65));
    this.applyGainNow();
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  getCurrentTheme(): string | null {
    return this.engine.currentTheme ?? null;
  }

  getDiagnostics(): Record<string, unknown> {
    if (typeof this.engine.getDiagnostics === 'function') {
      return this.engine.getDiagnostics() as Record<string, unknown>;
    }
    return {
      muted: this.isMuted(),
      currentTheme: this.getCurrentTheme(),
      masterVolume: this.masterVolume,
    };
  }

  private applyGainNow(): void {
    const gainParam = this.engine.masterGain?.gain;
    if (!gainParam) return;
    const target = this.engine.muted ? 0 : this.masterVolume;
    try {
      const ctx = this.engine.ctx;
      const now = ctx && Number.isFinite(ctx.currentTime) ? Math.max(0, ctx.currentTime) : 0;
      if (typeof gainParam.cancelScheduledValues === 'function') {
        gainParam.cancelScheduledValues(now);
      }
      if (typeof gainParam.setTargetAtTime === 'function' && ctx) {
        gainParam.setTargetAtTime(target, now, 0.015);
      } else {
        gainParam.value = target;
      }
    } catch {
      // Ignore in headless environments
    }
  }

  playBGM(themeName: string): void {
    const key = THEMES[themeName] ? themeName : 'overworld';
    this.engine.playBGM(key);
    this.applyGainNow();
  }

  stopBGM(): void {
    this.engine.stopBGM();
  }

  playMenuBlip(freq?: number): void {
    this.engine.playMenuBlip(freq);
  }

  playCursorMove(): void {
    this.engine.playCursorMove?.();
  }

  playHoldTick(progress = 0): void {
    this.engine.playHoldTick?.(progress);
  }

  playXpTick(progress = 0.5): void {
    this.engine.playXpTick?.(progress);
  }

  playStep(onGrass = false): void {
    if (onGrass) {
      this.engine.playNoise({ duration: 0.035, gain: 0.028, filterFreq: 1850 });
    } else {
      this.engine.playTone({ freq: 240, endFreq: 190, duration: 0.028, gain: 0.022, type: 'triangle' });
    }
  }

  playEncounterStinger(mode = 'wild'): void {
    this.engine.playEncounterAlert(mode);
  }

  playMoveSelect(): void {
    this.engine.playMoveSelect?.();
  }

  playWindup(type = 'normal'): void {
    this.engine.playWindup?.(type);
  }

  playTackle(): void {
    this.engine.playTackle?.();
  }

  playHitStop(): void {
    this.engine.playHitStop?.();
  }

  playHit(superEffective = false): void {
    this.engine.playPhysicalImpact(superEffective ? 92 : 48);
  }

  playMiss(): void {
    this.engine.playTone?.({ freq: 340, endFreq: 165, duration: 0.14, gain: 0.055, type: 'triangle' });
  }

  playMoveSfx(moveId: string, moveTypeOrFx?: string): void {
    this.engine.playAttackSfx(moveTypeOrFx || 'normal', moveId);
  }

  playFaint(): void {
    this.engine.playFaint?.();
  }

  playBuffChime(): void {
    this.engine.playBuffChime?.();
  }

  playShieldChime(): void {
    this.engine.playShieldChime?.();
  }

  playComposureBrace(): void {
    this.engine.playComposureBrace?.();
  }

  playBuddyEndure(): void {
    this.engine.playBuddyEndure?.();
  }

  playAbilityCue(abilityId: string, abilityType = 'normal'): void {
    this.engine.playAbilityCue?.(abilityId, abilityType);
  }

  playShinySparkle(): void {
    this.engine.playShinySparkle?.();
  }

  playHealChime(): void {
    this.engine.playHealChime();
  }

  playUpgradeFanfare(): void {
    this.engine.playUpgradeFanfare?.();
  }

  playBuddyCheer(): void {
    this.engine.playBuddyCheer?.();
  }

  playQuestCompleteFanfare(): void {
    this.engine.playQuestCompleteFanfare?.();
  }

  playArcadeUnlockFanfare(): void {
    this.engine.playArcadeUnlockFanfare?.();
  }

  playDiscoveryChime(kind?: string): void {
    this.engine.playDiscoveryChime?.(kind);
  }

  playWarpTeleport(options?: { phase?: 'depart' | 'arrive' | 'full'; mode?: 'starlight' | 'safe' }): void {
    this.engine.playWarpTeleport?.(options);
  }

  playSafeRecall(options?: { phase?: 'depart' | 'arrive' | 'full' }): void {
    this.engine.playSafeRecall?.(options);
  }

  playCatchThrow(): void {
    this.engine.playPokeballThrow();
  }

  playCatchAbsorb(): void {
    this.engine.playPokeballAbsorb?.();
  }

  playCatchBounce(bounceIdx = 0): void {
    this.engine.playPokeballBounce?.(bounceIdx);
  }

  playCatchShake(shakeIdx = 1): void {
    this.engine.playPokeballWobble?.(shakeIdx);
  }

  playCatchBreakout(): void {
    this.engine.playBreakout?.();
  }

  playStarBallShimmer(): void {
    this.engine.playStarBallShimmer?.();
  }

  playCatchSuccess(): void {
    this.engine.playCaptureSuccess();
  }

  playLevelUp(): void {
    this.engine.playLevelUp();
  }

  playVictoryFanfare(): void {
    if (typeof this.engine.playQuestCompleteFanfare === 'function') {
      this.engine.playQuestCompleteFanfare();
    } else {
      this.engine.playLevelUp();
    }
  }

  playBadgeFanfare(): void {
    this.engine.playBadgeFanfare();
  }

  playEvolutionStart(): void {
    this.engine.playEvolutionStart?.();
  }

  playEvolveFanfare(): void {
    this.engine.playEvolutionFanfare();
  }

  playChestOpen(): void {
    this.engine.playChestFanfare();
  }

  playArcadeStar(combo = 1): void {
    this.engine.playArcadeStar(combo);
  }

  playArcadeBoost(): void {
    this.engine.playArcadeBoost();
  }

  playArcadeBump(): void {
    this.engine.playArcadeBump();
  }

  playSpeciesCry(speciesId: number): CryWaveformSnapshot {
    const id = Math.max(1, Math.min(1025, Math.round(speciesId)));
    const sp = SPECIES[id];
    this.attachAnalyser();
    const res = this.engine.playPokemonCry(sp || id);
    this.lastCrySpeciesId = id;
    const durationMs = Math.max(260, Math.round((res?.duration ?? 0.32) * 1000));
    this.cryPlayingUntilMs = Date.now() + durationMs;
    this.synthesizeDeterministicWaveform(id, res?.baseFreq ?? 340, res?.wave ?? 'pulse25');
    return this.getCryWaveformSnapshot(id);
  }

  private synthesizeDeterministicWaveform(speciesId: number, baseFreq: number, wave: string): void {
    const out = this.waveformSamples;
    const cycles = Math.max(2, Math.min(14, baseFreq / 58));
    for (let i = 0; i < out.length; i++) {
      const t = i / out.length;
      const env = Math.sin(Math.PI * t) * Math.exp(-t * 1.45);
      const phase = t * cycles * Math.PI * 2 + (speciesId % 17) * 0.25;
      let val = Math.sin(phase);
      if (wave === 'pulse12' || wave === 'pulse25') {
        const duty = wave === 'pulse12' ? 0.25 : 0.5;
        val = (phase / (Math.PI * 2)) % 1 < duty ? 0.88 : -0.88;
      } else if (wave === 'triangle') {
        val = (2 / Math.PI) * Math.asin(Math.sin(phase));
      }
      out[i] = val * env;
    }
  }

  getCryWaveformSnapshot(speciesId?: number): CryWaveformSnapshot {
    const id = speciesId ?? this.lastCrySpeciesId;
    const playing = Date.now() < this.cryPlayingUntilMs && id === this.lastCrySpeciesId;
    if (playing && this.analyser) {
      try {
        const live = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(live);
        let peak = 0;
        for (let i = 0; i < 128; i++) {
          const sample = live[i * 2] ?? 0;
          if (Math.abs(sample) > peak) peak = Math.abs(sample);
        }
        if (peak > 0.02) {
          const outSamples = new Float32Array(128);
          for (let i = 0; i < 128; i++) {
            outSamples[i] = live[i * 2] ?? 0;
          }
          return {
            speciesId: id,
            samples: outSamples,
            peakAmplitude: Math.min(1, peak),
            playing: true,
          };
        }
      } catch {
        // Fallback to deterministic synthetic contour
      }
    }

    if (id !== this.lastCrySpeciesId) {
      this.lastCrySpeciesId = id;
      const sp = SPECIES[id];
      const baseHz = 180 + ((id * 37) % 440);
      this.synthesizeDeterministicWaveform(id, baseHz, sp?.type === 'electric' ? 'pulse12' : 'triangle');
    }

    let peak = 0;
    for (let i = 0; i < this.waveformSamples.length; i++) {
      const a = Math.abs(this.waveformSamples[i]);
      if (a > peak) peak = a;
    }
    return {
      speciesId: id,
      samples: new Float32Array(this.waveformSamples),
      peakAmplitude: peak,
      playing,
    };
  }
}
