import type { CryWaveformSnapshot } from '../../contracts';
import { AudioEngine, THEMES, createAudioEngine } from './raw/audio.js';
import { SPECIES } from './raw/config.js';

export { THEMES };

/**
 * Wraps C:\dojo's 23-theme chiptune Web Audio engine + 1,025 deterministic Pokémon cries
 * and attaches a real-time AnalyserNode waveform tap for the Pokédex Cry Visualizer.
 */
export class StarlightAudioController {
  private readonly engine: AudioEngine;
  private analyser: AnalyserNode | null = null;
  private waveformSamples = new Float32Array(128);
  private lastCrySpeciesId = 25;
  private cryPlayingUntilMs = 0;
  private masterVolume = 0.65;

  constructor() {
    this.engine = createAudioEngine();
    this.synthesizeDeterministicWaveform(25, 420, 'pulse12');
  }

  unlock(): void {
    this.engine.unlock();
    this.attachAnalyser();
  }

  private attachAnalyser(): void {
    const ctx = this.engine.ensureContext?.();
    if (!ctx || this.analyser || typeof ctx.createAnalyser !== 'function') return;
    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      if (this.engine.masterGain) {
        this.engine.masterGain.connect(analyser);
        this.engine.masterGain.gain.value = this.engine.muted ? 0 : this.masterVolume;
      }
      this.analyser = analyser;
    } catch {
      this.analyser = null;
    }
  }

  setMuted(muted: boolean): void {
    this.engine.setMuted(Boolean(muted));
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.65));
    if (this.engine.masterGain && !this.engine.muted) {
      try {
        this.engine.masterGain.gain.value = this.masterVolume;
      } catch {
        // Ignore in headless environments
      }
    }
  }

  playBGM(themeName: string): void {
    const key = THEMES[themeName] ? themeName : 'overworld';
    this.engine.playBGM(key);
  }

  stopBGM(): void {
    this.engine.stopBGM();
  }

  playMenuBlip(freq?: number): void {
    this.engine.playMenuBlip(freq);
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

  playHit(superEffective = false): void {
    this.engine.playPhysicalImpact(superEffective ? 92 : 48);
  }

  playMoveSfx(moveId: string, fx?: string): void {
    this.engine.playAttackSfx(fx || 'normal', moveId);
  }

  playHealChime(): void {
    this.engine.playHealChime();
  }

  playCatchThrow(): void {
    this.engine.playPokeballThrow();
  }

  playCatchShake(): void {
    this.engine.playPokeballWobble(1);
  }

  playCatchSuccess(): void {
    this.engine.playCaptureSuccess();
  }

  playVictoryFanfare(): void {
    this.engine.playLevelUp();
  }

  playBadgeFanfare(): void {
    this.engine.playBadgeFanfare();
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
