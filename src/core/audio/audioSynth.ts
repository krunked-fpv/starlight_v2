import type { CryWaveformSnapshot, ElementalType } from '../../contracts';
import { getSpecies } from '../catalog/speciesCatalog';

const TYPE_TIMBRE_SHIFT: Record<ElementalType, number> = {
  normal: 0,
  grass: 24,
  fire: 65,
  water: -18,
  electric: 120,
  ice: 92,
  fighting: -42,
  poison: -28,
  ground: -64,
  flying: 88,
  psychic: 110,
  bug: 72,
  rock: -70,
  ghost: 38,
  dragon: -32,
  dark: -55,
  steel: 54,
  fairy: 135,
};

export class ProceduralAudioSynth {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private volume = 0.65;
  private lastCrySpeciesId = 25;
  private cryPlayingUntil = 0;
  private cachedCryBuffer = new Float32Array(128);

  constructor() {
    this.fillDeterministicCrySamples(25, 0);
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      try {
        this.ctx = new AudioCtor();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.volume;
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setAudioConfig(muted: boolean, volume: number): void {
    this.muted = muted;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  /** Computes deterministic procedural PCM cry waveform for any of the 1,025 species */
  fillDeterministicCrySamples(speciesId: number, phaseOffset: number): Float32Array {
    const sp = getSpecies(speciesId);
    const freqNorm = ((sp.cryBaseHz + TYPE_TIMBRE_SHIFT[sp.primaryType]) / 420) * Math.PI * 2;
    const modNorm = (sp.cryModHz / 12) * Math.PI * 2;
    const out = this.cachedCryBuffer;
    for (let i = 0; i < out.length; i++) {
      const t = i / out.length;
      const env = Math.sin(t * Math.PI) * (0.65 + 0.35 * Math.cos(t * Math.PI * 3));
      const fm = Math.sin(t * modNorm * 2.5 + phaseOffset) * 1.45;
      let carrier = Math.sin(t * freqNorm * 3.5 + fm + phaseOffset * 2);
      if (sp.cryShape === 'square') {
        carrier = Math.sign(carrier) * 0.72 + carrier * 0.28;
      } else if (sp.cryShape === 'sawtooth') {
        carrier = (((t * freqNorm + phaseOffset) % 1) * 2 - 1) * 0.6 + carrier * 0.4;
      } else if (sp.cryShape === 'triangle') {
        carrier = (2 / Math.PI) * Math.asin(carrier);
      }
      out[i] = Math.max(-1, Math.min(1, carrier * env * 0.92));
    }
    return out;
  }

  playSpeciesCry(speciesId: number): CryWaveformSnapshot {
    this.lastCrySpeciesId = speciesId;
    const sp = getSpecies(speciesId);
    this.cryPlayingUntil = performance.now() + 720;
    this.fillDeterministicCrySamples(speciesId, 0);

    const ctx = this.ensureContext();
    if (ctx && this.masterGain) {
      const now = ctx.currentTime;
      const baseFreq = Math.max(110, sp.cryBaseHz + TYPE_TIMBRE_SHIFT[sp.primaryType]);
      const osc = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      const envGain = ctx.createGain();

      osc.type = sp.cryShape;
      osc.frequency.setValueAtTime(baseFreq * 0.86, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.28, now + 0.16);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.94, now + 0.42);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.12, now + 0.62);

      mod.type = 'sine';
      mod.frequency.setValueAtTime(sp.cryModHz * 2.2, now);
      modGain.gain.setValueAtTime(baseFreq * 0.16, now);
      mod.connect(modGain);
      modGain.connect(osc.frequency);

      envGain.gain.setValueAtTime(0.001, now);
      envGain.gain.linearRampToValueAtTime(0.28, now + 0.04);
      envGain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);

      osc.connect(envGain);
      envGain.connect(this.masterGain);

      osc.start(now);
      mod.start(now);
      osc.stop(now + 0.7);
      mod.stop(now + 0.7);
    }

    return this.getCryWaveformSnapshot(speciesId, performance.now() * 0.004);
  }

  getCryWaveformSnapshot(speciesId: number, animPhase: number): CryWaveformSnapshot {
    const playing = performance.now() < this.cryPlayingUntil && this.lastCrySpeciesId === speciesId;
    if (playing && this.analyser && this.ctx && this.ctx.state === 'running') {
      const raw = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(raw);
      let peak = 0;
      for (let i = 0; i < this.cachedCryBuffer.length; i++) {
        const s = raw[i * 2] ?? 0;
        peak = Math.max(peak, Math.abs(s));
        this.cachedCryBuffer[i] = s;
      }
      if (peak > 0.02) {
        return { speciesId, samples: this.cachedCryBuffer, peakAmplitude: peak, playing: true };
      }
    }

    const samples = this.fillDeterministicCrySamples(speciesId, playing ? animPhase * 3.5 : animPhase * 0.55);
    let peak = 0;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    return { speciesId, samples, peakAmplitude: peak, playing };
  }

  playUiClick(): void {
    this.playTone(680, 920, 0.065, 'triangle', 0.11);
  }

  playFootstep(onWater: boolean): void {
    this.playTone(onWater ? 340 : 185, onWater ? 520 : 130, 0.05, 'sine', 0.06);
  }

  playBattleHit(heavy: boolean): void {
    this.playTone(heavy ? 180 : 280, heavy ? 52 : 110, heavy ? 0.24 : 0.14, 'sawtooth', heavy ? 0.24 : 0.16);
  }

  playStarBallCapture(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((hz, i) => {
      setTimeout(() => this.playTone(hz, hz * 1.03, 0.16, 'triangle', 0.16), i * 95);
    });
  }

  playSkyHopDash(): void {
    this.playTone(360, 1080, 0.22, 'triangle', 0.18);
  }

  private playTone(
    startHz: number,
    endHz: number,
    durationSec: number,
    type: OscillatorType,
    gainPeak: number,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startHz, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, endHz), now + durationSec);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }
}
