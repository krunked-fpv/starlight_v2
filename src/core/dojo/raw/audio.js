// Authentic Retro Chiptune Web Audio Engine (Lookahead Sync, Duty-Cycle Pulse Waves & Percussion)

const E2 = 82.41;
const F2 = 87.31;
const Fs2 = 92.50;
const G2 = 98.00;
const Gs2 = 103.83;
const Ab2 = 103.83;
const A2 = 110.00;
const Bb2 = 116.54;
const B1 = 61.74;
const B2 = 123.47;
const C2 = 65.41;
const D2 = 73.42;
const Ds2 = 77.78;

const C3 = 130.81;
const Cs3 = 138.59;
const D3 = 146.83;
const Ds3 = 155.56;
const E3 = 164.81;
const F3 = 174.61;
const Fs3 = 185.00;
const G3 = 196.00;
const Gs3 = 207.65;
const A3 = 220.00;
const Bb3 = 233.08;
const B3 = 246.94;

const C4 = 261.63;
const Cs4 = 277.18;
const D4 = 293.66;
const Ds4 = 311.13;
const E4 = 329.63;
const F4 = 349.23;
const Fs4 = 369.99;
const G4 = 392.00;
const Gs4 = 415.30;
const A4 = 440.00;
const Bb4 = 466.16;
const B4 = 493.88;

const C5 = 523.25;
const Cs5 = 554.37;
const D5 = 587.33;
const Ds5 = 622.25;
const E5 = 659.25;
const F5 = 698.46;
const Fs5 = 739.99;
const G5 = 783.99;
const Gs5 = 830.61;
const A5 = 880.00;
const Bb5 = 932.33;
const B5 = 987.77;
const C6 = 1046.50;
const D6 = 1174.66;
const E6 = 1318.51;

export const THEMES = {
  title: {
    stepSec: 0.195,
    leadWave: 'pulse25',
    melody: [
      E4, 0, G4, B4, E5, 0, D5, B4,
      C5, 0, B4, A4, G4, 0, Fs4, 0,
      E4, 0, G4, B4, E5, 0, Fs5, G5,
      Fs5, 0, D5, B4, E5, 0, 0, 0,
    ],
    arp: [
      B3, 0, 0, E4, 0, 0, B3, 0,
      C4, 0, 0, E4, 0, 0, D4, 0,
      B3, 0, 0, E4, 0, 0, G4, 0,
      D4, 0, B3, 0, E4, 0, 0, 0,
    ],
    bass: [
      E3, 0, B2, 0, E3, 0, G3, 0,
      C3, 0, G3, 0, B2, 0, Fs3, 0,
      E3, 0, B2, 0, E3, 0, G3, 0,
      D3, 0, B2, 0, E3, 0, B2, 0,
    ],
    drums: [
      'K', 0, 'h', 0, 'S', 0, 'h', 0,
      'K', 0, 'h', 0, 'S', 0, 'h', 'h',
    ],
    leadGain: 0.056,
    arpGain: 0.032,
    bassGain: 0.092,
    drumGain: 0.045,
  },
  overworld: {
    stepSec: 0.165,
    leadWave: 'pulse25',
    melody: [
      G4, 0, B4, D5, G5, 0, Fs5, D5,
      E5, 0, D5, C5, B4, 0, A4, 0,
      G4, 0, B4, D5, E5, 0, D5, B4,
      C5, B4, A4, G4, A4, 0, D4, 0,
      G4, 0, B4, D5, G5, 0, A5, G5,
      Fs5, 0, D5, Fs5, G5, 0, E5, 0,
      D5, 0, C5, B4, A4, 0, B4, C5,
      D5, 0, Fs4, 0, G4, 0, 0, 0,
    ],
    arp: [
      D4, 0, 0, B3, 0, 0, D4, 0,
      C4, 0, 0, E4, 0, 0, D4, 0,
      B3, 0, 0, D4, 0, 0, B3, 0,
      E4, 0, C4, 0, D4, 0, 0, 0,
    ],
    bass: [
      G3, 0, D3, 0, G3, 0, B2, 0,
      C3, 0, G3, 0, G2, 0, D3, 0,
      G3, 0, D3, 0, E3, 0, B2, 0,
      C3, 0, A2, 0, D3, 0, A2, 0,
      G3, 0, D3, 0, G3, 0, B2, 0,
      D3, 0, A2, 0, E3, 0, B2, 0,
      C3, 0, G2, 0, A2, 0, C3, 0,
      D3, 0, A2, 0, G2, 0, D3, 0,
    ],
    drums: [
      'K', 0, 'h', 0, 'S', 0, 'h', 0,
      'K', 0, 'K', 0, 'S', 0, 'h', 0,
    ],
    leadGain: 0.056,
    arpGain: 0.030,
    bassGain: 0.095,
    drumGain: 0.048,
  },
  battle: {
    // Grounded, tense Gen 1 / Gen 3 inspired E-minor battle groove (~106 BPM 16th grid, -1 = sustain tie)
    stepSec: 0.142,
    leadWave: 'pulse25',
    melody: [
      // Bar 1: Bold dramatic Em -> Bb tension intro
      E4, -1, 0, E4, G4, -1, 0, A4, Bb4, -1, -1, 0, A4, -1, G4, 0,
      // Bar 2: Minor rise -> B7 dominant stab
      E4, -1, 0, G4, B4, -1, -1, 0, Ds5, -1, -1, 0, B4, -1, 0, 0,
      // Bar 3: Driving E-minor battle motif
      E5, -1, -1, D5, E5, 0, G5, -1, Fs5, -1, E5, 0, B4, -1, -1, 0,
      // Bar 4: Urgent dominant response
      E5, -1, -1, Fs5, G5, 0, A5, -1, Fs5, -1, Ds5, -1, B4, -1, 0, 0,
      // Bar 5: High-energy minor hook
      G5, -1, -1, Fs5, E5, 0, B4, -1, C5, -1, D5, 0, E5, -1, -1, 0,
      // Bar 6: Phrygian bII (F) -> B7 turnaround
      F5, -1, -1, E5, D5, 0, C5, -1, B4, -1, Ds5, -1, E5, -1, 0, 0,
      // Bar 7: Ascending minor climax
      C5, -1, E5, -1, G5, -1, B5, -1, A5, -1, G5, 0, Fs5, -1, E5, 0,
      // Bar 8: B7 lock -> Em resolve
      Ds5, -1, Fs5, -1, B5, -1, -1, 0, A5, 0, Fs5, 0, E5, -1, 0, 0,
    ],
    // Held chord tones only on strong bar accents
    arp: [
      B3, -1, 0, 0, B3, -1, 0, 0, D4, -1, 0, 0, 0, 0, 0, 0,
      B3, -1, 0, 0, E4, -1, 0, 0, Fs4, -1, 0, 0, Ds4, -1, 0, 0,
      B4, -1, 0, 0, G4, -1, 0, 0, A4, -1, 0, 0, G4, -1, 0, 0,
      B4, -1, 0, 0, B4, -1, 0, 0, A4, -1, 0, 0, Fs4, -1, 0, 0,
      B4, -1, 0, 0, G4, -1, 0, 0, E4, -1, 0, 0, G4, -1, 0, 0,
      A4, -1, 0, 0, F4, -1, 0, 0, Fs4, -1, 0, 0, Ds4, -1, 0, 0,
      E4, -1, 0, 0, G4, -1, 0, 0, C5, -1, 0, 0, B4, -1, 0, 0,
      Fs4, -1, 0, 0, Ds5, -1, 0, 0, B4, -1, 0, 0, G4, -1, 0, 0,
    ],
    // Heavy, grounded 8th-note octave/fifth triangle bassline
    bass: [
      E2, 0, E3, 0, E2, 0, B2, 0, E2, 0, E3, 0, D2, 0, D3, 0,
      E2, 0, E3, 0, G2, 0, G3, 0, B1, 0, B2, 0, Ds2, 0, Fs2, 0,
      E2, 0, E3, 0, B2, 0, E3, 0, D2, 0, D3, 0, B1, 0, B2, 0,
      E2, 0, E3, 0, G2, 0, G3, 0, B1, 0, B2, 0, Ds2, 0, B2, 0,
      G2, 0, G3, 0, E2, 0, E3, 0, C2, 0, C3, 0, E2, 0, E3, 0,
      F2, 0, F3, 0, D2, 0, D3, 0, B1, 0, B2, 0, E2, 0, B2, 0,
      C2, 0, C3, 0, G2, 0, C3, 0, A2, 0, A3, 0, B2, 0, E3, 0,
      B1, 0, B2, 0, Ds2, 0, B2, 0, B1, 0, Fs2, 0, E2, 0, B2, 0,
    ],
    // Clean 4/4 pocket with minimal crisp percussion (zero fast-forward noise clutter)
    drums: [
      'K', 0, 0, 0, 'S', 0, 'h', 0,
      'K', 0, 'K', 0, 'S', 0, 'h', 0,
      'K', 0, 0, 0, 'S', 0, 'h', 0,
      'K', 0, 'K', 0, 'S', 0, 0, 'S',
    ],
    leadGain: 0.064,
    arpGain: 0.032,
    bassGain: 0.108,
    drumGain: 0.052,
  },
  forest: {
    // Warm gentle woodland flute/pulse groove (G Major / E Minor pastoral)
    stepSec: 0.175,
    leadWave: 'pulse25',
    arpWave: 'triangle',
    melody: [
      B4, -1, D5, 0, E5, -1, G5, 0,
      Fs5, -1, D5, B4, A4, -1, 0, 0,
      G4, -1, B4, 0, D5, -1, B4, 0,
      C5, B4, A4, G4, E4, -1, 0, 0,
      E5, -1, D5, C5, B4, -1, D5, 0,
      C5, -1, A4, B4, G4, -1, 0, 0,
      A4, B4, C5, D5, E5, -1, Fs5, 0,
      D5, -1, B4, A4, G4, -1, 0, 0,
    ],
    arp: [
      G4, 0, D4, 0, B3, 0, D4, 0,
      A4, 0, Fs4, 0, D4, 0, Fs4, 0,
      E4, 0, B3, 0, G3, 0, B3, 0,
      C4, 0, E4, 0, G4, 0, E4, 0,
    ],
    bass: [
      G3, 0, D3, 0, E3, 0, B2, 0,
      D3, 0, A2, 0, D3, 0, A2, 0,
      G3, 0, D3, 0, B2, 0, G2, 0,
      C3, 0, G3, 0, E3, 0, B2, 0,
      C3, 0, G3, 0, G2, 0, D3, 0,
      A2, 0, E3, 0, G2, 0, D3, 0,
      C3, 0, A2, 0, D3, 0, Fs3, 0,
      G3, 0, D3, 0, G2, 0, D3, 0,
    ],
    drums: [
      'K', 0, 0, 'h', 0, 0, 'h', 0,
      'K', 0, 0, 'h', 'S', 0, 'h', 0,
    ],
    leadGain: 0.052,
    arpGain: 0.028,
    bassGain: 0.088,
    drumGain: 0.036,
  },
  cave: {
    // Mysterious echoing crystal minor arpeggio (D Minor)
    stepSec: 0.180,
    leadWave: 'pulse12',
    arpWave: 'triangle',
    melody: [
      D5, -1, -1, 0, F5, -1, E5, 0,
      A4, -1, -1, 0, C5, -1, Bb4, 0,
      A4, -1, G4, 0, F4, -1, E4, 0,
      D4, -1, F4, A4, Cs5, -1, 0, 0,
      D5, -1, A4, 0, F5, -1, D5, 0,
      E5, -1, C5, 0, Bb4, -1, G4, 0,
      A4, -1, Cs5, 0, E5, -1, A5, 0,
      F5, -1, E5, Cs5, D5, -1, 0, 0,
    ],
    arp: [
      D4, 0, A4, 0, F4, 0, A4, 0,
      C4, 0, G4, 0, E4, 0, G4, 0,
      Bb3, 0, F4, 0, D4, 0, F4, 0,
      A3, 0, E4, 0, Cs4, 0, E4, 0,
    ],
    bass: [
      D3, 0, 0, 0, A2, 0, 0, 0,
      C3, 0, 0, 0, G2, 0, 0, 0,
      Bb2, 0, 0, 0, F2, 0, 0, 0,
      A2, 0, 0, 0, E2, 0, A2, 0,
      D3, 0, A2, 0, D3, 0, F3, 0,
      C3, 0, G2, 0, Bb2, 0, F2, 0,
      A2, 0, E3, 0, A2, 0, Cs3, 0,
      D3, 0, A2, 0, D2, 0, 0, 0,
    ],
    drums: [
      'K', 0, 0, 0, 0, 0, 'h', 0,
      0, 0, 'h', 0, 'S', 0, 0, 0,
    ],
    leadGain: 0.048,
    arpGain: 0.034,
    bassGain: 0.084,
    drumGain: 0.028,
  },
  water: {
    // Breezy sunlit lagoon bounce (C Major / F Major)
    stepSec: 0.160,
    leadWave: 'pulse25',
    melody: [
      E5, 0, G5, 0, C6, -1, B5, G5,
      A5, 0, G5, E5, D5, -1, 0, 0,
      F5, 0, A5, 0, G5, -1, E5, C5,
      D5, E5, F5, G5, E5, -1, 0, 0,
      G5, 0, E5, C5, A4, 0, C5, D5,
      E5, 0, G5, E5, D5, -1, 0, 0,
      C5, 0, D5, E5, F5, 0, G5, A5,
      G5, -1, D5, B4, C5, -1, 0, 0,
    ],
    arp: [
      C4, 0, E4, G4, C4, 0, E4, G4,
      F4, 0, A4, C5, G4, 0, B4, D5,
      A4, 0, C5, E5, F4, 0, A4, C5,
      G4, 0, B4, D5, C4, 0, E4, G4,
    ],
    bass: [
      C3, 0, G2, C3, C3, 0, E3, 0,
      F3, 0, C3, 0, G2, 0, D3, 0,
      F3, 0, C3, F3, C3, 0, G2, 0,
      G2, 0, D3, 0, C3, 0, G2, 0,
      C3, 0, E3, 0, A2, 0, E3, 0,
      C3, 0, G2, 0, G2, 0, D3, 0,
      A2, 0, E3, 0, F2, 0, C3, 0,
      G2, 0, D3, G2, C3, 0, G2, 0,
    ],
    drums: [
      'K', 0, 'h', 0, 'S', 0, 'h', 'h',
      'K', 0, 'h', 'K', 'S', 0, 'h', 0,
    ],
    leadGain: 0.054,
    arpGain: 0.032,
    bassGain: 0.090,
    drumGain: 0.042,
  },
  volcano: {
    // Driving fiery bass & heroic minor brassy pulse (A Minor / E Phrygian)
    stepSec: 0.148,
    leadWave: 'pulse25',
    melody: [
      A4, -1, 0, A4, C5, -1, E5, 0,
      F5, -1, E5, D5, E5, -1, B4, 0,
      A4, -1, C5, D5, E5, -1, A5, 0,
      Gs5, -1, E5, B4, E5, -1, 0, 0,
      F5, -1, D5, B4, E5, -1, C5, A4,
      D5, -1, B4, Gs4, A4, -1, E4, 0,
      F4, -1, A4, C5, E5, -1, D5, C5,
      B4, -1, Gs4, E4, A4, -1, 0, 0,
    ],
    arp: [
      A3, -1, E4, 0, A3, -1, E4, 0,
      D4, -1, F4, 0, E4, -1, Gs4, 0,
      A3, -1, E4, 0, C4, -1, E4, 0,
      E4, -1, B4, 0, Gs4, -1, E4, 0,
    ],
    bass: [
      A2, 0, A3, 0, E2, 0, A2, 0,
      F2, 0, F3, 0, E2, 0, B2, 0,
      A2, 0, A3, 0, C3, 0, E3, 0,
      E2, 0, E3, 0, Gs2, 0, B2, 0,
      D2, 0, D3, 0, C2, 0, C3, 0,
      B1, 0, B2, 0, A2, 0, E3, 0,
      F2, 0, C3, 0, E2, 0, B2, 0,
      E2, 0, Gs2, B2, A2, 0, E2, 0,
    ],
    drums: [
      'K', 0, 'h', 0, 'S', 0, 'h', 0,
      'K', 'K', 'h', 0, 'S', 0, 'h', 'S',
    ],
    leadGain: 0.060,
    arpGain: 0.034,
    bassGain: 0.104,
    drumGain: 0.048,
  },
  peak: {
    // Ethereal crystalline starlit bell-pulse waltz (3/4 feel: 48 steps, A Major / F# Minor)
    stepSec: 0.185,
    leadWave: 'pulse12',
    arpWave: 'triangle',
    melody: [
      Cs5, -1, E5, A5, -1, Gs5,
      Fs5, -1, E5, Cs5, -1, 0,
      D5, -1, Fs5, E5, -1, Cs5,
      B4, -1, -1, 0, 0, 0,
      A4, -1, Cs5, E5, -1, A5,
      Gs5, -1, Fs5, E5, -1, Cs5,
      D5, -1, B4, Cs5, -1, Gs4,
      A4, -1, -1, 0, 0, 0,
    ],
    arp: [
      A4, 0, E4, Cs5, 0, E4,
      Fs4, 0, Cs4, A4, 0, Cs4,
      D4, 0, A4, E4, 0, B4,
      E4, 0, B4, Gs4, 0, B4,
    ],
    bass: [
      A2, 0, E3, A3, E3, 0,
      Fs2, 0, Cs3, Fs3, Cs3, 0,
      D3, 0, A3, E3, 0, B3,
      E2, 0, B2, E3, B2, 0,
      A2, 0, E3, Cs3, 0, A3,
      E3, 0, B3, Cs3, 0, Gs3,
      D3, 0, A3, E3, 0, B2,
      A2, 0, E3, A2, 0, 0,
    ],
    drums: [
      'K', 0, 'h', 0, 'h', 0,
      'K', 0, 'h', 'S', 0, 'h',
    ],
    leadGain: 0.050,
    arpGain: 0.032,
    bassGain: 0.084,
    drumGain: 0.024,
  },
  shrine: {
    // Epic guardian showdown theme (D Minor heroic battle, 128 steps)
    stepSec: 0.136,
    leadWave: 'pulse25',
    melody: [
      D5, -1, 0, D5, F5, -1, A5, 0, Bb5, -1, -1, 0, A5, -1, G5, 0,
      F5, -1, E5, D5, Cs5, -1, E5, 0, A5, -1, -1, 0, E5, -1, 0, 0,
      D5, -1, F5, 0, A5, -1, D6, 0, C6, -1, Bb5, 0, A5, -1, G5, 0,
      F5, -1, G5, 0, E5, -1, Cs5, 0, D5, -1, -1, 0, A4, -1, 0, 0,
      Bb4, -1, D5, 0, F5, -1, Bb5, 0, A5, -1, G5, 0, F5, -1, E5, 0,
      G5, -1, E5, 0, C5, -1, G4, 0, A4, -1, Cs5, 0, E5, -1, A5, 0,
      D6, -1, C6, 0, Bb5, -1, A5, 0, G5, -1, F5, 0, E5, -1, D5, 0,
      Cs5, -1, E5, 0, A5, -1, Cs5, 0, D5, -1, -1, 0, 0, 0, 0, 0,
    ],
    arp: [
      D4, -1, 0, 0, A4, -1, 0, 0, Bb4, -1, 0, 0, G4, -1, 0, 0,
      F4, -1, 0, 0, E4, -1, 0, 0, A4, -1, 0, 0, Cs4, -1, 0, 0,
      D4, -1, 0, 0, F4, -1, 0, 0, C5, -1, 0, 0, G4, -1, 0, 0,
      A4, -1, 0, 0, E4, -1, 0, 0, D4, -1, 0, 0, A3, -1, 0, 0,
    ],
    bass: [
      D2, 0, D3, 0, D2, 0, A2, 0, Bb2, 0, Bb3, 0, G2, 0, G3, 0,
      F2, 0, F3, 0, A2, 0, A3, 0, A2, 0, E3, 0, Cs3, 0, A2, 0,
      D2, 0, D3, 0, F2, 0, F3, 0, C2, 0, C3, 0, G2, 0, G3, 0,
      A2, 0, A3, 0, A2, 0, E2, 0, D2, 0, D3, 0, A2, 0, D3, 0,
      Bb2, 0, Bb3, 0, F2, 0, F3, 0, F2, 0, C3, 0, D3, 0, A2, 0,
      C2, 0, C3, 0, G2, 0, C3, 0, A2, 0, A3, 0, E3, 0, A2, 0,
      Bb2, 0, Bb3, 0, G2, 0, G3, 0, E2, 0, E3, 0, D2, 0, D3, 0,
      A2, 0, E3, 0, A2, 0, Cs3, 0, D2, 0, A2, 0, D3, 0, 0, 0,
    ],
    drums: [
      'K', 0, 'h', 0, 'S', 0, 'h', 0,
      'K', 0, 'K', 'h', 'S', 0, 'h', 'S',
    ],
    leadGain: 0.064,
    arpGain: 0.036,
    bassGain: 0.108,
    drumGain: 0.052,
  },
  rival: {
    // Energetic Rival Duel chiptune (C Minor heroic pulse groove, 128 steps)
    stepSec: 0.132,
    leadWave: 'pulse25',
    melody: [
      // Bar 1: Crisp rival challenge motif
      G4, -1, 0, G4, C5, -1, Ds5, 0, D5, -1, C5, 0, B4, -1, G4, 0,
      // Bar 2: Syncopated climb to G5
      C5, -1, D5, 0, Ds5, -1, F5, 0, G5, -1, -1, 0, D5, -1, 0, 0,
      // Bar 3: High-energy rival hook
      G5, -1, 0, F5, Ds5, 0, D5, -1, C5, -1, D5, 0, Ds5, -1, G4, 0,
      // Bar 4: Ab -> G dominant answer
      Gs5, -1, G5, 0, F5, -1, Ds5, 0, D5, -1, B4, 0, G4, -1, 0, 0,
      // Bar 5: Driving octave leap & melodic run
      C5, -1, G5, -1, F5, 0, Ds5, 0, D5, -1, F5, 0, Ds5, -1, C5, 0,
      // Bar 6: Fm -> Bb -> Eb lift
      F5, -1, Gs5, 0, G5, 0, F5, 0, Ds5, -1, Bb4, 0, Ds5, -1, G5, 0,
      // Bar 7: Climactic run toward C6
      Gs5, -1, G5, 0, F5, 0, Ds5, 0, F5, -1, G5, 0, Bb5, -1, C6, 0,
      // Bar 8: B5 -> G5 -> C5 triumphant turnaround
      B5, -1, G5, 0, D5, -1, B4, 0, C5, -1, -1, 0, 0, 0, 0, 0,
    ],
    arp: [
      C4, -1, Ds4, 0, G4, -1, Ds4, 0, D4, -1, G4, 0, B4, -1, G4, 0,
      C4, -1, Ds4, 0, G4, -1, C5, 0, D4, -1, G4, 0, B4, -1, G4, 0,
      Gs4, -1, C5, 0, Ds5, -1, C5, 0, G4, -1, Bb4, 0, D5, -1, Bb4, 0,
      F4, -1, Gs4, 0, C5, -1, Gs4, 0, G4, -1, B4, 0, D5, -1, B4, 0,
    ],
    bass: [
      C2, 0, C3, 0, C2, 0, G2, 0, G2, 0, G3, 0, B2, 0, D3, 0,
      C2, 0, C3, 0, Ds2, 0, G2, 0, G2, 0, D3, 0, G2, 0, B2, 0,
      C2, 0, C3, 0, G2, 0, C3, 0, Bb2, 0, F3, 0, Ds2, 0, Bb2, 0,
      Gs2, 0, Ds3, 0, F2, 0, C3, 0, G2, 0, D3, 0, G2, 0, B2, 0,
      C2, 0, C3, 0, Ds2, 0, C3, 0, Bb2, 0, D3, 0, C2, 0, G2, 0,
      F2, 0, C3, 0, F2, 0, Gs2, 0, Ds2, 0, Bb2, 0, G2, 0, Ds3, 0,
      Gs2, 0, Ds3, 0, F2, 0, C3, 0, Bb2, 0, F3, 0, C3, 0, G3, 0,
      G2, 0, D3, 0, G2, 0, B2, 0, C2, 0, G2, 0, C3, 0, 0, 0,
    ],
    drums: [
      'K', 0, 'h', 0, 'S', 0, 'h', 'K',
      'K', 0, 'h', 0, 'S', 0, 'h', 'S',
    ],
    leadGain: 0.062,
    arpGain: 0.034,
    bassGain: 0.106,
    drumGain: 0.052,
  },
  grove: {
    // Dreamy 64-step pentatonic starlight grove melody (D Major / B Minor Pentatonic)
    stepSec: 0.172,
    leadWave: 'pulse12',
    arpWave: 'triangle',
    melody: [
      D5, -1, E5, Fs5, A5, -1, -1, 0, B5, -1, A5, Fs5, E5, -1, D5, 0,
      Fs5, -1, A5, B5, D6, -1, -1, 0, B5, -1, A5, Fs5, E5, -1, 0, 0,
      A5, -1, Fs5, E5, D5, -1, E5, Fs5, A5, -1, B5, A5, Fs5, -1, D5, 0,
      E5, -1, Fs5, A5, B5, -1, A5, Fs5, E5, -1, Fs5, E5, D5, -1, 0, 0,
    ],
    arp: [
      D4, 0, A4, 0, Fs4, 0, A4, 0, B3, 0, Fs4, 0, D4, 0, Fs4, 0,
      G3, 0, D4, 0, B4, 0, D4, 0, A3, 0, E4, 0, A4, 0, E4, 0,
    ],
    bass: [
      D3, 0, A2, 0, D3, 0, Fs3, 0, B2, 0, Fs3, 0, B2, 0, D3, 0,
      G2, 0, D3, 0, G3, 0, D3, 0, A2, 0, E3, 0, A2, 0, E3, 0,
      D3, 0, A2, 0, Fs2, 0, D3, 0, G2, 0, D3, 0, B2, 0, Fs3, 0,
      A2, 0, E3, 0, A2, 0, E3, 0, D2, 0, A2, 0, D3, 0, 0, 0,
    ],
    drums: [
      'K', 0, 0, 'h', 0, 0, 'h', 0,
      'K', 0, 0, 'h', 'S', 0, 'h', 0,
    ],
    leadGain: 0.052,
    arpGain: 0.032,
    bassGain: 0.086,
    drumGain: 0.026,
  },
  desert: {
    // Exotic E Phrygian Dominant desert adventure groove (64 steps)
    stepSec: 0.156,
    leadWave: 'pulse25',
    arpWave: 'pulse12',
    melody: [
      E4, -1, F4, Gs4, B4, -1, Gs4, F4, E4, -1, Gs4, B4, C5, -1, B4, 0,
      D5, -1, C5, B4, Gs4, -1, F4, Gs4, B4, -1, Gs4, F4, E4, -1, 0, 0,
      E5, -1, F5, E5, D5, -1, C5, B4, C5, -1, D5, C5, B4, -1, Gs4, 0,
      A4, -1, C5, B4, Gs4, -1, F4, Gs4, E4, -1, B4, Gs4, E4, -1, 0, 0,
    ],
    arp: [
      E4, 0, Gs4, B4, E4, 0, Gs4, B4,
      F4, 0, A4, C5, F4, 0, A4, C5,
      D4, 0, F4, A4, Gs4, 0, B4, E5,
      A3, 0, C4, E4, Gs3, 0, B3, E4,
    ],
    bass: [
      E2, 0, E3, 0, B2, 0, E3, 0, E2, 0, E3, 0, Gs2, 0, B2, 0,
      F2, 0, F3, 0, C3, 0, F3, 0, E2, 0, B2, 0, E3, 0, B2, 0,
      A2, 0, E3, 0, G2, 0, D3, 0, F2, 0, C3, 0, E2, 0, B2, 0,
      F2, 0, C3, 0, Gs2, 0, B2, 0, E2, 0, B2, 0, E3, 0, 0, 0,
    ],
    drums: [
      'K', 0, 'h', 'K', 'S', 0, 'h', 0,
      'K', 0, 'h', 'K', 'S', 0, 'h', 'S',
    ],
    leadGain: 0.056,
    arpGain: 0.030,
    bassGain: 0.094,
    drumGain: 0.044,
  },
  marsh: {
    // Mysterious bouncy G Dorian bayou waltz/groove (96 steps = 16 x 6/8 bars)
    stepSec: 0.174,
    leadWave: 'pulse12',
    arpWave: 'triangle',
    melody: [
      G4, -1, Bb4, D5, -1, C5,
      Bb4, -1, A4, G4, -1, 0,
      F4, -1, A4, C5, -1, Bb4,
      A4, -1, G4, Fs4, -1, 0,
      G4, -1, Bb4, D5, -1, E5,
      F5, -1, D5, C5, -1, Bb4,
      A4, -1, C5, Bb4, -1, Fs4,
      G4, -1, -1, 0, 0, 0,
      D5, -1, E5, F5, -1, D5,
      C5, -1, Bb4, A4, -1, G4,
      Bb4, -1, C5, D5, -1, C5,
      A4, -1, Fs4, D4, -1, 0,
      G4, -1, A4, Bb4, -1, D5,
      E5, -1, C5, A4, -1, Bb4,
      D5, -1, C5, Bb4, -1, A4,
      G4, -1, -1, 0, 0, 0,
    ],
    arp: [
      G4, 0, D4, Bb4, 0, D4,
      F4, 0, C4, A4, 0, C4,
      E4, 0, C4, G4, 0, C4,
      D4, 0, A4, Fs4, 0, A4,
    ],
    bass: [
      G2, 0, D3, G3, 0, D3,
      G2, 0, D3, Bb2, 0, D3,
      F2, 0, C3, F3, 0, C3,
      D2, 0, A2, D3, 0, A2,
      G2, 0, D3, G3, 0, E3,
      F2, 0, C3, Bb2, 0, F3,
      C3, 0, G3, D3, 0, A2,
      G2, 0, D3, G2, 0, 0,
      Bb2, 0, F3, D3, 0, F3,
      C3, 0, G3, F2, 0, C3,
      G2, 0, D3, Bb2, 0, F3,
      D3, 0, A2, D2, 0, 0,
      G2, 0, D3, G3, 0, D3,
      C3, 0, G3, A2, 0, E3,
      D3, 0, A2, D3, 0, A2,
      G2, 0, D3, G2, 0, 0,
    ],
    drums: [
      'K', 0, 'h', 'S', 0, 'h',
      'K', 0, 'h', 'S', 'h', 0,
    ],
    leadGain: 0.052,
    arpGain: 0.032,
    bassGain: 0.088,
    drumGain: 0.030,
  },
  sanctum: {
    // Majestic cosmic astral anthem in E Major / C# Minor (128 steps)
    stepSec: 0.158,
    leadWave: 'pulse25',
    arpWave: 'triangle',
    melody: [
      E5, -1, -1, B4, Gs5, -1, Fs5, 0, E5, -1, Ds5, E5, Fs5, -1, 0, 0,
      Cs5, -1, -1, E5, Gs5, -1, B5, 0, A5, -1, Gs5, Fs5, E5, -1, 0, 0,
      Gs5, -1, Fs5, E5, Ds5, -1, E5, Fs5, Gs5, -1, B5, 0, Fs5, -1, 0, 0,
      E5, -1, Ds5, Cs5, B4, -1, Cs5, Ds5, E5, -1, -1, 0, 0, 0, 0, 0,
      A5, -1, Gs5, Fs5, E5, -1, Cs5, 0, Fs5, -1, Gs5, A5, B5, -1, 0, 0,
      Gs5, -1, E5, B4, Cs5, -1, E5, Fs5, Gs5, -1, Fs5, Ds5, B4, -1, 0, 0,
      Cs5, -1, E5, Gs5, A5, -1, B5, 0, Gs5, -1, E5, Cs5, Ds5, -1, Fs5, 0,
      E5, -1, B4, Gs4, B4, -1, Ds5, 0, E5, -1, -1, 0, 0, 0, 0, 0,
    ],
    arp: [
      E4, 0, B4, Gs4, E4, 0, B4, Gs4,
      B3, 0, Fs4, Ds4, B3, 0, Fs4, Ds4,
      Cs4, 0, Gs4, E4, Cs4, 0, Gs4, E4,
      A3, 0, E4, Cs4, B3, 0, Fs4, Ds4,
    ],
    bass: [
      E2, 0, E3, 0, B2, 0, E3, 0, B1, 0, B2, 0, Fs2, 0, B2, 0,
      Cs3, 0, Gs3, 0, Cs3, 0, E3, 0, A2, 0, E3, 0, B2, 0, Fs3, 0,
      E2, 0, B2, 0, B1, 0, Fs2, 0, Cs3, 0, Gs3, 0, B2, 0, Fs3, 0,
      A2, 0, E3, 0, B2, 0, Fs3, 0, E2, 0, B2, 0, E3, 0, 0, 0,
      A2, 0, E3, 0, A2, 0, Cs3, 0, B2, 0, Fs3, 0, B2, 0, Ds3, 0,
      E2, 0, B2, 0, Cs3, 0, Gs3, 0, B2, 0, Fs3, 0, B1, 0, Fs2, 0,
      Cs3, 0, Gs3, 0, A2, 0, E3, 0, E2, 0, B2, 0, B1, 0, Fs2, 0,
      E2, 0, B2, 0, B1, 0, B2, 0, E2, 0, B2, 0, E3, 0, 0, 0,
    ],
    drums: [
      'K', 0, 'h', 0, 'S', 0, 'h', 0,
      'K', 0, 'K', 'h', 'S', 0, 'h', 'S',
    ],
    leadGain: 0.058,
    arpGain: 0.034,
    bassGain: 0.096,
    drumGain: 0.044,
  },
  canyon: {
    // Driving F# Minor / A Mixolydian Thundersteppe gallop (64 steps)
    stepSec: 0.146,
    leadWave: 'pulse25',
    arpWave: 'pulse12',
    melody: [
      Fs4, -1, A4, Cs5, E5, -1, Cs5, A4, B4, -1, Cs5, B4, A4, -1, Fs4, 0,
      D5, -1, Cs5, B4, A4, -1, Gs4, A4, B4, -1, Cs5, E5, Fs5, -1, 0, 0,
      Fs5, -1, E5, Cs5, D5, -1, B4, Gs4, A4, -1, Cs5, E5, Fs5, -1, A5, 0,
      Gs5, -1, Fs5, E5, Cs5, -1, B4, A4, B4, -1, Gs4, E4, Fs4, -1, 0, 0,
    ],
    arp: [
      Fs4, 0, A4, Cs5, Fs4, 0, A4, Cs5,
      D4, 0, Fs4, A4, E4, 0, Gs4, B4,
      Fs4, 0, A4, Cs5, B3, 0, D4, Fs4,
      Cs4, 0, E4, Gs4, Fs4, 0, A4, Cs5,
    ],
    bass: [
      Fs2, 0, Fs3, 0, Cs3, 0, Fs3, 0, D2, 0, D3, 0, E2, 0, E3, 0,
      D2, 0, A2, 0, E2, 0, B2, 0, Fs2, 0, Cs3, 0, Fs3, 0, E3, 0,
      D2, 0, A2, 0, B2, 0, Fs3, 0, A2, 0, E3, 0, D3, 0, A2, 0,
      E2, 0, B2, 0, Cs3, 0, Gs3, 0, Fs2, 0, Cs3, 0, Fs3, 0, 0, 0,
    ],
    drums: [
      'K', 0, 'h', 'K', 'S', 0, 'h', 0,
      'K', 0, 'h', 'K', 'S', 0, 'h', 'S',
    ],
    leadGain: 0.058,
    arpGain: 0.032,
    bassGain: 0.098,
    drumGain: 0.048,
  },
  reef: {
    // Bioluminescent E Dorian underwater reef pulse (64 steps)
    stepSec: 0.172,
    leadWave: 'pulse12',
    arpWave: 'triangle',
    melody: [
      B4, -1, E5, Fs5, G5, -1, A5, 0, B5, -1, A5, G5, Fs5, -1, E5, 0,
      D5, -1, Fs5, E5, C5, -1, D5, E5, Fs5, -1, E5, D5, B4, -1, 0, 0,
      G5, -1, Fs5, E5, D5, -1, B4, D5, E5, -1, G5, A5, B5, -1, G5, 0,
      A5, -1, G5, Fs5, E5, -1, D5, C5, B4, -1, D5, Fs5, E5, -1, 0, 0,
    ],
    arp: [
      E4, 0, B4, G4, E4, 0, B4, G4,
      D4, 0, A4, Fs4, C4, 0, G4, E4,
      G4, 0, D5, B4, D4, 0, A4, Fs4,
      C4, 0, G4, E4, B3, 0, Fs4, Ds4,
    ],
    bass: [
      E2, 0, B2, 0, E3, 0, B2, 0, G2, 0, D3, 0, Fs2, 0, D3, 0,
      D2, 0, A2, 0, C3, 0, G3, 0, B2, 0, Fs3, 0, B2, 0, D3, 0,
      E2, 0, B2, 0, D3, 0, A2, 0, C3, 0, G3, 0, G2, 0, D3, 0,
      A2, 0, E3, 0, D3, 0, A2, 0, E2, 0, B2, 0, E3, 0, 0, 0,
    ],
    drums: [
      'K', 0, 0, 'h', 0, 0, 'h', 0,
      'K', 0, 'h', 0, 'S', 0, 'h', 0,
    ],
    leadGain: 0.052,
    arpGain: 0.034,
    bassGain: 0.088,
    drumGain: 0.028,
  },
  ruins: {
    // Ticking D Harmonic Minor clockwork temple mystery (64 steps)
    stepSec: 0.162,
    leadWave: 'pulse12',
    arpWave: 'pulse25',
    melody: [
      D5, -1, F5, E5, D5, -1, Cs5, D5, A4, -1, Bb4, A4, G4, -1, A4, 0,
      Bb4, -1, D5, Cs5, E5, -1, A5, 0, G5, -1, F5, E5, Cs5, -1, 0, 0,
      D5, -1, A4, F5, E5, -1, Cs5, A4, Bb4, -1, D5, F5, G5, -1, Bb5, 0,
      A5, -1, G5, F5, E5, -1, Cs5, E5, D5, -1, -1, 0, 0, 0, 0, 0,
    ],
    arp: [
      D4, 0, A4, F4, Cs4, 0, A4, E4,
      Bb3, 0, F4, D4, A3, 0, E4, Cs4,
      D4, 0, F4, A4, G4, 0, Bb4, D5,
      A4, 0, E4, Cs4, D4, 0, A4, F4,
    ],
    bass: [
      D2, 0, A2, 0, D3, 0, A2, 0, A2, 0, E3, 0, A2, 0, Cs3, 0,
      Bb2, 0, F3, 0, A2, 0, E3, 0, G2, 0, D3, 0, A2, 0, E3, 0,
      D2, 0, A2, 0, F2, 0, C3, 0, Bb2, 0, F3, 0, G2, 0, D3, 0,
      A2, 0, E3, 0, A2, 0, Cs3, 0, D2, 0, A2, 0, D3, 0, 0, 0,
    ],
    drums: [
      'K', 0, 'h', 0, 'S', 0, 'h', 0,
      'K', 'h', 'h', 0, 'S', 0, 'h', 'h',
    ],
    leadGain: 0.054,
    arpGain: 0.032,
    bassGain: 0.094,
    drumGain: 0.038,
  },
  rift: {
    // Cosmic C# Minor / E Major starlight rift synth anthem (128 steps)
    stepSec: 0.144,
    leadWave: 'pulse25',
    arpWave: 'pulse12',
    melody: [
      Cs5, -1, E5, Gs5, B5, -1, Gs5, E5, Fs5, -1, E5, Ds5, Cs5, -1, Gs4, 0,
      A4, -1, B4, Cs5, Ds5, -1, Fs5, 0, Gs5, -1, Fs5, Ds5, B4, -1, 0, 0,
      Cs5, -1, Gs5, Fs5, E5, -1, Ds5, Cs5, B4, -1, Cs5, Ds5, E5, -1, Gs5, 0,
      A5, -1, Gs5, Fs5, E5, -1, Ds5, B4, Cs5, -1, -1, 0, 0, 0, 0, 0,
      E5, -1, Gs5, B5, A5, -1, Gs5, Fs5, E5, -1, Ds5, E5, Fs5, -1, B4, 0,
      Cs5, -1, Ds5, E5, Fs5, -1, A5, 0, Gs5, -1, E5, Cs5, Ds5, -1, B4, 0,
      A4, -1, Cs5, E5, Gs5, -1, B5, 0, A5, -1, Gs5, Fs5, E5, -1, Ds5, 0,
      Cs5, -1, Gs5, E5, Ds5, -1, B4, Gs4, Cs5, -1, -1, 0, 0, 0, 0, 0,
    ],
    arp: [
      Cs4, 0, Gs4, E4, Cs4, 0, Gs4, E4,
      A3, 0, E4, Cs4, B3, 0, Fs4, Ds4,
      E4, 0, B4, Gs4, Ds4, 0, Fs4, B4,
      A4, 0, Cs5, E5, Gs4, 0, B4, Ds5,
    ],
    bass: [
      Cs3, 0, Gs3, 0, Cs3, 0, E3, 0, Fs2, 0, Cs3, 0, Gs2, 0, Ds3, 0,
      A2, 0, E3, 0, B2, 0, Fs3, 0, Gs2, 0, Ds3, 0, B2, 0, Fs3, 0,
      Cs3, 0, Gs3, 0, E3, 0, B3, 0, B2, 0, Fs3, 0, Cs3, 0, Gs3, 0,
      A2, 0, E3, 0, B2, 0, Fs3, 0, Cs3, 0, Gs3, 0, Cs3, 0, 0, 0,
      E2, 0, B2, 0, Fs2, 0, Cs3, 0, E2, 0, B2, 0, B1, 0, Fs2, 0,
      Cs3, 0, Gs3, 0, Fs2, 0, Cs3, 0, E2, 0, B2, 0, B1, 0, Fs2, 0,
      A2, 0, E3, 0, E2, 0, B2, 0, Fs2, 0, Cs3, 0, B2, 0, Fs3, 0,
      Cs3, 0, Gs3, 0, B2, 0, Fs3, 0, Cs3, 0, Gs3, 0, 0, 0, 0, 0,
    ],
    drums: [
      'K', 0, 'h', 0, 'S', 0, 'h', 'K',
      'K', 0, 'h', 'K', 'S', 0, 'h', 'S',
    ],
    leadGain: 0.062,
    arpGain: 0.036,
    bassGain: 0.104,
    drumGain: 0.050,
  },
  faeveldt: {
    // Enchanted Pixie Faeveldt Glade celesta waltz-pulse in D Major / B Minor (64 steps)
    stepSec: 0.168,
    leadWave: 'pulse12',
    arpWave: 'triangle',
    melody: [
      Fs5, -1, A5, D6, B5, -1, A5, Fs5, G5, -1, Fs5, E5, D5, -1, 0, 0,
      B4, -1, D5, Fs5, A5, -1, G5, Fs5, E5, -1, Fs5, G5, A5, -1, 0, 0,
      D6, -1, Cs5, B5, A5, -1, Fs5, D5, E5, -1, G5, B5, A5, -1, Fs5, 0,
      G5, -1, Fs5, E5, D5, -1, Cs5, E5, D5, -1, -1, 0, 0, 0, 0, 0,
    ],
    arp: [
      D4, 0, Fs4, A4, B3, 0, D4, Fs4,
      G4, 0, B4, D5, A3, 0, Cs4, E4,
      Fs4, 0, A4, D5, G4, 0, B4, D5,
      E4, 0, G4, B4, A4, 0, E4, Cs4,
    ],
    bass: [
      D3, 0, A2, 0, B2, 0, Fs3, 0, G2, 0, D3, 0, A2, 0, E3, 0,
      B2, 0, Fs3, 0, G2, 0, D3, 0, A2, 0, E3, 0, A2, 0, Cs3, 0,
      D3, 0, A2, 0, B2, 0, Fs3, 0, E2, 0, B2, 0, A2, 0, E3, 0,
      G2, 0, D3, 0, A2, 0, E3, 0, D2, 0, A2, 0, D3, 0, 0, 0,
    ],
    drums: [
      'K', 0, 0, 'h', 0, 0, 'h', 0,
      'K', 0, 'h', 0, 'S', 0, 'h', 0,
    ],
    leadGain: 0.052,
    arpGain: 0.032,
    bassGain: 0.088,
    drumGain: 0.030,
  },
  atoll: {
    // Sunburst Alola Atoll tropical steel-drum bounce in C Major / G Mixolydian (64 steps)
    stepSec: 0.152,
    leadWave: 'pulse25',
    arpWave: 'triangle',
    melody: [
      G5, -1, E5, G5, A5, -1, C6, 0, B5, -1, A5, G5, E5, -1, D5, 0,
      F5, -1, A5, G5, E5, -1, C5, D5, E5, -1, G5, E5, D5, -1, 0, 0,
      C5, -1, E5, G5, C6, -1, B5, A5, G5, -1, E5, C5, D5, -1, F5, 0,
      A5, -1, G5, F5, E5, -1, D5, B4, C5, -1, -1, 0, 0, 0, 0, 0,
    ],
    arp: [
      C4, 0, E4, G4, F4, 0, A4, C5,
      G4, 0, B4, D5, C4, 0, E4, G4,
      A3, 0, C4, E4, F4, 0, A4, C5,
      G4, 0, B4, D5, C4, 0, E4, G4,
    ],
    bass: [
      C3, 0, G2, C3, F3, 0, C3, 0, G2, 0, D3, 0, C3, 0, G2, 0,
      F2, 0, C3, 0, C3, 0, G2, 0, G2, 0, D3, 0, G2, 0, B2, 0,
      C3, 0, G2, 0, A2, 0, E3, 0, F2, 0, C3, 0, G2, 0, D3, 0,
      F2, 0, C3, 0, G2, 0, D3, G2, C3, 0, G2, 0, C3, 0, 0, 0,
    ],
    drums: [
      'K', 0, 'h', 'K', 'S', 0, 'h', 0,
      'K', 0, 'h', 'K', 'S', 0, 'h', 'S',
    ],
    leadGain: 0.056,
    arpGain: 0.032,
    bassGain: 0.092,
    drumGain: 0.044,
  },
  highlands: {
    // Iron Crown Highlands noble highland march in F# Minor / A Major (64 steps)
    stepSec: 0.146,
    leadWave: 'pulse25',
    arpWave: 'pulse12',
    melody: [
      Fs4, -1, Cs5, 0, A4, -1, B4, Cs5, D5, -1, Cs5, B4, A4, -1, Fs4, 0,
      E5, -1, D5, Cs5, B4, -1, A4, Gs4, A4, -1, Cs5, E5, Fs5, -1, 0, 0,
      A5, -1, Gs5, Fs5, E5, -1, Cs5, A4, D5, -1, Fs5, E5, D5, -1, Cs5, 0,
      B4, -1, Cs5, D5, E5, -1, Cs5, Gs4, Fs4, -1, -1, 0, 0, 0, 0, 0,
    ],
    arp: [
      Fs4, 0, A4, Cs5, D4, 0, Fs4, A4,
      E4, 0, Gs4, B4, Cs4, 0, E4, Gs4,
      Fs4, 0, A4, Cs5, B3, 0, D4, Fs4,
      E4, 0, Gs4, B4, Fs4, 0, A4, Cs5,
    ],
    bass: [
      Fs2, 0, Cs3, 0, Fs3, 0, Cs3, 0, D2, 0, A2, 0, E2, 0, B2, 0,
      E2, 0, B2, 0, Cs3, 0, Gs3, 0, Fs2, 0, Cs3, 0, Fs3, 0, E3, 0,
      D2, 0, A2, 0, A2, 0, E3, 0, B2, 0, Fs3, 0, Cs3, 0, Gs3, 0,
      D2, 0, A2, 0, E2, 0, B2, 0, Fs2, 0, Cs3, 0, Fs3, 0, 0, 0,
    ],
    drums: [
      'K', 0, 'h', 0, 'S', 0, 'h', 0,
      'K', 'K', 'h', 0, 'S', 0, 'h', 'S',
    ],
    leadGain: 0.058,
    arpGain: 0.032,
    bassGain: 0.096,
    drumGain: 0.046,
  },
  crater: {
    // Terastal Crystal Crater radiant crystalline synth anthem in E Minor / G Major (128 steps)
    stepSec: 0.140,
    leadWave: 'pulse25',
    arpWave: 'pulse12',
    melody: [
      E5, -1, B4, E5, G5, -1, Fs5, D5, E5, -1, B4, G4, A4, -1, B4, 0,
      C5, -1, E5, G5, Fs5, -1, D5, B4, E5, -1, G5, B5, A5, -1, 0, 0,
      B5, -1, A5, G5, Fs5, -1, G5, A5, B5, -1, G5, E5, D5, -1, B4, 0,
      C5, -1, D5, E5, Fs5, -1, D5, B4, E5, -1, -1, 0, 0, 0, 0, 0,
      G5, -1, B5, D6, C6, -1, B5, A5, G5, -1, Fs5, E5, D5, -1, B4, 0,
      E5, -1, Fs5, G5, A5, -1, C6, 0, B5, -1, G5, E5, Fs5, -1, D5, 0,
      C5, -1, E5, G5, B5, -1, A5, G5, Fs5, -1, A5, D6, B5, -1, G5, 0,
      E5, -1, G5, Fs5, D5, -1, B4, Ds5, E5, -1, -1, 0, 0, 0, 0, 0,
    ],
    arp: [
      E4, 0, G4, B4, D4, 0, Fs4, A4,
      C4, 0, E4, G4, B3, 0, Ds4, Fs4,
      G4, 0, B4, D5, D4, 0, Fs4, A4,
      C4, 0, E4, G4, B3, 0, E4, G4,
    ],
    bass: [
      E2, 0, B2, 0, E3, 0, B2, 0, G2, 0, D3, 0, Fs2, 0, D3, 0,
      C2, 0, G2, 0, D2, 0, A2, 0, E2, 0, B2, 0, E3, 0, B2, 0,
      G2, 0, D3, 0, D2, 0, A2, 0, E2, 0, B2, 0, B1, 0, Fs2, 0,
      C2, 0, G2, 0, D2, 0, A2, 0, E2, 0, B2, 0, E3, 0, 0, 0,
      G2, 0, D3, 0, C3, 0, G3, 0, E2, 0, B2, 0, B1, 0, Fs2, 0,
      C2, 0, G2, 0, A2, 0, E3, 0, G2, 0, D3, 0, D2, 0, A2, 0,
      C2, 0, G2, 0, G2, 0, D3, 0, D2, 0, A2, 0, G2, 0, D3, 0,
      E2, 0, B2, 0, B1, 0, Fs2, 0, E2, 0, B2, 0, E3, 0, 0, 0,
    ],
    drums: [
      'K', 0, 'h', 0, 'S', 0, 'h', 'K',
      'K', 0, 'h', 'K', 'S', 0, 'h', 'S',
    ],
    leadGain: 0.060,
    arpGain: 0.034,
    bassGain: 0.100,
    drumGain: 0.048,
  },
  arcade: {
    // Upbeat 128-step retro Starlight Sky-Hop arcade chiptune loop (C Major / G Mixolydian)
    stepSec: 0.132,
    leadWave: 'pulse25',
    arpWave: 'pulse12',
    melody: [
      E5, 0, G5, 0, C6, -1, B5, G5, A5, 0, G5, E5, D5, -1, E5, 0,
      F5, 0, A5, 0, G5, -1, E5, C5, D5, 0, E5, F5, G5, -1, 0, 0,
      E5, 0, G5, 0, C6, -1, D6, C6, B5, 0, A5, G5, A5, -1, E5, 0,
      F5, 0, G5, A5, G5, -1, E5, C5, D5, 0, B4, 0, C5, -1, 0, 0,
      A5, -1, G5, F5, E5, 0, G5, C6, B5, -1, A5, G5, A5, -1, E5, 0,
      F5, 0, A5, C6, B5, 0, G5, D5, E5, 0, G5, C6, D6, -1, 0, 0,
      E6, -1, D6, C6, B5, 0, A5, G5, F5, 0, A5, C6, B5, -1, G5, 0,
      A5, 0, B5, C6, D6, 0, G5, B5, C6, -1, -1, 0, 0, 0, 0, 0,
    ],
    arp: [
      C4, 0, E4, G4, C5, 0, G4, E4, A3, 0, C4, E4, G4, 0, E4, C4,
      F4, 0, A4, C5, C4, 0, E4, G4, D4, 0, F4, A4, G4, 0, B4, D5,
      C4, 0, E4, G4, C5, 0, G4, E4, G4, 0, B4, D5, A4, 0, C5, E5,
      F4, 0, A4, C5, G4, 0, B4, D5, G3, 0, B3, D4, C4, 0, E4, G4,
    ],
    bass: [
      C2, 0, C3, 0, G2, 0, C3, 0, A2, 0, E3, 0, G2, 0, D3, 0,
      F2, 0, C3, 0, C2, 0, G2, 0, G2, 0, D3, 0, G2, 0, B2, 0,
      C2, 0, C3, 0, E2, 0, G2, 0, G2, 0, D3, 0, A2, 0, E3, 0,
      F2, 0, C3, 0, G2, 0, D3, 0, G2, 0, D3, 0, C3, 0, G2, 0,
      F2, 0, F3, 0, C2, 0, C3, 0, G2, 0, G3, 0, A2, 0, E3, 0,
      D2, 0, D3, 0, G2, 0, D3, 0, C2, 0, G2, 0, B2, 0, G2, 0,
      C2, 0, C3, 0, E2, 0, B2, 0, F2, 0, C3, 0, G2, 0, D3, 0,
      F2, 0, C3, 0, G2, 0, D3, 0, C2, 0, G2, 0, C3, 0, 0, 0,
    ],
    drums: [
      'K', 0, 'h', 0, 'S', 0, 'h', 'K',
      'K', 0, 'h', 'K', 'S', 0, 'h', 'S',
    ],
    leadGain: 0.060,
    arpGain: 0.034,
    bassGain: 0.102,
    drumGain: 0.048,
  },
};

export class AudioEngine {
  constructor({ silent = false, attachUnlockListeners = true } = {}) {
    this.ctx = null;
    this.masterFilter = null;
    this.masterGain = null;
    this.compressor = null;
    this.bgmBus = null;
    this.silentSink = null;
    this.silent = Boolean(silent);

    this.pulse12Wave = null;
    this.pulse25Wave = null;
    this.warmPulseWave = null;
    this.noiseBuffer = null;

    this.muted = false;
    this.unlocked = false;
    this._unlockPromise = null;
    this._resumeCount = 0;
    this._wakeBufferPlayed = false;
    this._pausedByVisibility = false;
    this._destroying = false;
    this._pendingVoices = [];
    this._activeCryCleanup = null;
    this._crySeq = 0;
    this._cryDisconnectTimers = new Set();

    this.currentTheme = null;
    this.schedulerTimer = null;
    this.schedulerStartCount = 0;
    this.bgmGeneration = 0;
    this.activeBgmNodes = new Set();

    this.nextStepTime = 0;
    this.stepIndex = 0;
    this.bgmSyncStartTime = 0;
    this.bgmStepsSinceSync = 0;
    this._lastCursorAt = 0;

    this._boundGesture = () => this._handleGesture();
    this._boundUnlock = this._boundGesture;
    this._boundVisibility = () => this._handleVisibilityChange();
    this._boundLifecycleResume = () => this._handleLifecycleResume();
    this._unlockListenersAttached = false;
    this._lifecycleListenersAttached = false;

    if (attachUnlockListeners && typeof window !== 'undefined') {
      const opts = { capture: true, passive: true };
      window.addEventListener('pointerdown', this._boundGesture, opts);
      window.addEventListener('pointerup', this._boundGesture, opts);
      window.addEventListener('touchstart', this._boundGesture, opts);
      window.addEventListener('touchend', this._boundGesture, opts);
      window.addEventListener('mousedown', this._boundGesture, opts);
      window.addEventListener('keydown', this._boundGesture, opts);
      window.addEventListener('click', this._boundGesture, opts);
      this._unlockListenersAttached = true;
    }

    if (typeof document !== 'undefined' || typeof window !== 'undefined') {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this._boundVisibility);
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('pageshow', this._boundLifecycleResume);
        window.addEventListener('focus', this._boundLifecycleResume);
      }
      this._lifecycleListenersAttached = true;
    }
  }

  _removeUnlockListeners() {
    if (!this._unlockListenersAttached || typeof window === 'undefined') return;
    const opts = { capture: true, passive: true };
    window.removeEventListener('pointerdown', this._boundGesture, opts);
    window.removeEventListener('pointerup', this._boundGesture, opts);
    window.removeEventListener('touchstart', this._boundGesture, opts);
    window.removeEventListener('touchend', this._boundGesture, opts);
    window.removeEventListener('mousedown', this._boundGesture, opts);
    window.removeEventListener('keydown', this._boundGesture, opts);
    window.removeEventListener('click', this._boundGesture, opts);
    this._unlockListenersAttached = false;
  }

  _removeLifecycleListeners() {
    if (!this._lifecycleListenersAttached) return;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._boundVisibility);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pageshow', this._boundLifecycleResume);
      window.removeEventListener('focus', this._boundLifecycleResume);
    }
    this._lifecycleListenersAttached = false;
  }

  _handleGesture() {
    if (this.ctx?.state === 'running' && this.unlocked) return;
    this.unlock();
  }

  _applyAudioSession() {
    try {
      if (typeof navigator !== 'undefined' && navigator.audioSession) {
        navigator.audioSession.type = 'playback';
      }
    } catch {
      // Ignore unsupported audioSession API
    }
  }

  _playSilentWakeBuffer(ctx) {
    if (!ctx || this._wakeBufferPlayed) return;
    if (typeof ctx.createBuffer !== 'function' || typeof ctx.createBufferSource !== 'function' || !ctx.destination) {
      return;
    }
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = () => {
        try {
          src.disconnect();
        } catch {
          // Ignore
        }
      };
      src.start(0);
      this._wakeBufferPlayed = true;
    } catch {
      // Ignore hardware/mock rejection
    }
  }

  _isInactiveState(state) {
    return state === 'suspended' || state === 'interrupted';
  }

  _clearCryTimers() {
    for (const timerId of this._cryDisconnectTimers) {
      clearTimeout(timerId);
    }
    this._cryDisconnectTimers.clear();
  }

  _stopActiveCry(immediate = false) {
    const cleanup = this._activeCryCleanup;
    this._activeCryCleanup = null;
    if (typeof cleanup === 'function') {
      cleanup(immediate);
    }
  }

  _handleStateChange() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'running') {
      this._handleRunningState();
      return;
    }
    // Treat mobile iOS/Android 'interrupted' identically to 'suspended'
    if (this._isInactiveState(ctx.state) || ctx.state !== 'running') {
      this.unlocked = false;
      this._wakeBufferPlayed = false;
      this._unlockPromise = null;
      if (this.schedulerTimer !== null || this.activeBgmNodes.size > 0) {
        this.bgmGeneration += 1;
        this.stopScheduler();
        this._haltActiveBgmNodes();
      }
      this._stopActiveCry(true);
    }
  }

  _handleVisibilityChange() {
    if (typeof document !== 'undefined' && document.hidden) {
      this._pausedByVisibility = true;
      this._wakeBufferPlayed = false;
      this.bgmGeneration += 1;
      this.stopScheduler();
      this._haltActiveBgmNodes();
      return;
    }
    this._handleLifecycleResume();
  }

  _handleLifecycleResume() {
    if (typeof document !== 'undefined' && document.hidden) return;
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') {
      this.unlock();
      return;
    }
    this._handleRunningState();
  }

  _handleRunningState() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') {
      this.unlocked = false;
      this._wakeBufferPlayed = false;
      return false;
    }
    this.unlocked = true;
    this._pausedByVisibility = false;
    if (!this._wakeBufferPlayed) {
      this._playSilentWakeBuffer(ctx);
    }
    this._flushPendingVoices();
    const isHidden = typeof document !== 'undefined' && document.hidden === true;
    if (this.currentTheme && !this.muted && !this.schedulerTimer && !isHidden) {
      this.startScheduler();
    }
    return true;
  }

  _queuePendingVoice(kind, opts) {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this._pendingVoices = this._pendingVoices.filter((entry) => nowMs - entry.createdAt <= 400);
    while (this._pendingVoices.length >= 24) {
      this._pendingVoices.shift();
    }
    this._pendingVoices.push({ kind, opts, createdAt: nowMs });
  }

  _flushPendingVoices() {
    if (this.muted || !this.ctx || this.ctx.state !== 'running' || this._pendingVoices.length === 0) {
      return;
    }
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const queued = this._pendingVoices.splice(0, this._pendingVoices.length);
    for (const entry of queued) {
      if (nowMs - entry.createdAt > 400) continue;
      if (entry.kind === 'noise') {
        this.playNoise(entry.opts);
      } else {
        this.triggerVoice(entry.opts);
      }
    }
  }

  buildPulseWave(ctx, duty = 0.25) {
    if (typeof ctx.createPeriodicWave !== 'function') return null;
    try {
      const harmonics = 16;
      const real = new Float32Array(harmonics + 1);
      const imag = new Float32Array(harmonics + 1);
      for (let n = 1; n <= harmonics; n++) {
        // Gentle Gibbs/Nyquist roll-off while preserving authentic Game Boy square bite
        const rolloff = 1 / (1 + Math.pow(n / 11, 2));
        imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty) * rolloff * 2.0;
      }
      return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    } catch {
      return null;
    }
  }

  buildWarmPulseWave(ctx) {
    return this.buildPulseWave(ctx, 0.25);
  }

  ensureContext() {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    try {
      this.ctx = new AudioCtx();
      this.masterFilter = this.ctx.createBiquadFilter();
      this.masterFilter.type = 'lowpass';
      this.masterFilter.frequency.value = 1260;
      this.masterFilter.Q.value = 0.65;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.52;

      this.compressor = null;
      if (typeof this.ctx.createDynamicsCompressor === 'function') {
        const comp = this.ctx.createDynamicsCompressor();
        if (comp.threshold) comp.threshold.value = -16;
        if (comp.knee) comp.knee.value = 14;
        if (comp.ratio) comp.ratio.value = 3;
        if (comp.attack) comp.attack.value = 0.003;
        if (comp.release) comp.release.value = 0.15;
        this.compressor = comp;
      }

      this.bgmBus = this.ctx.createGain();
      this.bgmBus.gain.value = 1.0;

      this.bgmBus.connect(this.masterFilter);
      this.masterFilter.connect(this.masterGain);
      let outputNode = this.masterGain;
      if (this.compressor) {
        this.masterGain.connect(this.compressor);
        outputNode = this.compressor;
      }
      if (this.silent) {
        this.silentSink = this.ctx.createGain();
        this.silentSink.gain.value = 0;
        outputNode.connect(this.silentSink);
        this.silentSink.connect(this.ctx.destination);
      } else {
        outputNode.connect(this.ctx.destination);
      }

      this.ctx.onstatechange = () => this._handleStateChange();
      this.pulse12Wave = this.buildPulseWave(this.ctx, 0.125);
      this.pulse25Wave = this.buildPulseWave(this.ctx, 0.25);
      this.warmPulseWave = this.pulse25Wave;
      this.noiseBuffer = typeof this.ctx.createBuffer === 'function' ? this.buildNoiseBuffer(this.ctx) : null;
      return this.ctx;
    } catch {
      this.ctx = null;
      this.masterFilter = null;
      this.masterGain = null;
      this.compressor = null;
      this.bgmBus = null;
      this.silentSink = null;
      return null;
    }
  }

  async destroy() {
    this._destroying = true;
    this.stopBGM();
    this._stopActiveCry(true);
    this._clearCryTimers();
    this._removeUnlockListeners();
    this._removeLifecycleListeners();
    this.unlocked = false;
    this._unlockPromise = null;
    this._wakeBufferPlayed = false;
    this._pausedByVisibility = false;
    this._pendingVoices = [];
    this._activeCryCleanup = null;
    const ctx = this.ctx;
    if (ctx) {
      try {
        ctx.onstatechange = null;
      } catch {
        // Ignore
      }
    }
    this.ctx = null;
    this.masterFilter = null;
    this.masterGain = null;
    this.compressor = null;
    this.bgmBus = null;
    this.silentSink = null;
    this._destroying = false;
    if (ctx && typeof ctx.close === 'function') {
      await ctx.close().catch(() => {});
    }
  }

  buildNoiseBuffer(ctx) {
    const length = Math.max(1, Math.floor(ctx.sampleRate));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  unlock() {
    const ctx = this.ensureContext();
    if (!ctx) return Promise.resolve(false);
    this._applyAudioSession();

    if (ctx.state === 'running' && this.unlocked) {
      this._flushPendingVoices();
      const isHidden = typeof document !== 'undefined' && document.hidden === true;
      if (this.currentTheme && !this.muted && !this.schedulerTimer && !isHidden) {
        this.startScheduler();
      }
      return Promise.resolve(true);
    }

    if (ctx.state === 'running') {
      return Promise.resolve(this._handleRunningState());
    }

    if (!this._isInactiveState(ctx.state)) {
      this.unlocked = false;
      this._unlockPromise = null;
      return Promise.resolve(false);
    }

    this._wakeBufferPlayed = false;
    this._playSilentWakeBuffer(ctx);

    if (typeof ctx.resume === 'function') {
      this._resumeCount += 1;
      try {
        const resumePromise = Promise.resolve(ctx.resume())
          .then(() => {
            if (this.ctx !== ctx) return false;
            if (ctx.state === 'running') {
              return this._handleRunningState();
            }
            this.unlocked = false;
            return false;
          })
          .catch(() => {
            if (this.ctx === ctx && ctx.state === 'running') {
              return this._handleRunningState();
            }
            return false;
          });
        this._unlockPromise = resumePromise;
        return resumePromise;
      } catch {
        this._unlockPromise = null;
        return Promise.resolve(false);
      }
    }
    return Promise.resolve(this._handleRunningState());
  }

  _haltActiveBgmNodes() {
    for (const entry of this.activeBgmNodes) {
      try {
        entry.source.onended = null;
      } catch {
        // Ignore
      }
      try {
        entry.source.stop();
      } catch {
        // Ignore already-stopped nodes
      }
      try {
        entry.source.disconnect();
      } catch {
        // Ignore
      }
      try {
        entry.gain.disconnect();
      } catch {
        // Ignore
      }
      if (entry.extra) {
        try {
          entry.extra.disconnect();
        } catch {
          // Ignore
        }
      }
    }
    this.activeBgmNodes.clear();

    if (this.ctx && this.masterFilter && !this._destroying && this.ctx.state !== 'closed' && typeof this.ctx.createGain === 'function') {
      if (this.bgmBus) {
        try {
          this.bgmBus.disconnect();
        } catch {
          // Ignore
        }
      }
      this.bgmBus = this.ctx.createGain();
      this.bgmBus.gain.value = 1.0;
      this.bgmBus.connect(this.masterFilter);
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.masterGain && this.ctx) {
      const now = Number.isFinite(Number(this.ctx.currentTime))
        ? Math.max(0, Number(this.ctx.currentTime))
        : 0;
      try {
        this.masterGain.gain?.cancelScheduledValues?.(now);
        this.masterGain.gain?.setTargetAtTime?.(this.muted ? 0 : 0.52, now, 0.015);
      } catch {
        // Ignore mock AudioParam differences
      }
    }
    if (this.muted) {
      this._pendingVoices = [];
      this._stopActiveCry(true);
      this.bgmGeneration += 1;
      this.stopScheduler();
      this._haltActiveBgmNodes();
    } else if (
      this.currentTheme &&
      this.ctx &&
      this.ctx.state === 'running' &&
      !(typeof document !== 'undefined' && document.hidden === true)
    ) {
      this.startScheduler();
    }
  }

  isMuted() {
    return this.muted;
  }

  _trackBgmNode(source, gainNode, extraNode = null) {
    const entry = { source, gain: gainNode, extra: extraNode };
    this.activeBgmNodes.add(entry);
    source.onended = () => {
      this.activeBgmNodes.delete(entry);
      try {
        source.disconnect();
      } catch {
        // Ignore
      }
      if (extraNode) {
        try {
          extraNode.disconnect();
        } catch {
          // Ignore
        }
      }
      try {
        gainNode.disconnect();
      } catch {
        // Ignore
      }
    };
  }

  triggerVoice({
    freq,
    endFreq = null,
    midFreq = null,
    wave = 'triangle',
    useWarmPulse = false,
    attack = 0.006,
    decay = 0.045,
    sustain = 0.36,
    duration = 0.14,
    gain = 0.12,
    delay = 0,
    startTime = null,
    destination = null,
    trackBgm = false,
    _cryToken = null,
  }) {
    if (this.muted) return null;
    const ctx = this.ensureContext();
    const dest = destination || this.masterFilter;
    if (!ctx || !dest) return null;
    if (this._isInactiveState(ctx.state) || ctx.state !== 'running') {
      if (ctx.state === 'closed') return null;
      if (startTime === null && !trackBgm) {
        this._queuePendingVoice('voice', {
          freq,
          endFreq,
          midFreq,
          wave,
          useWarmPulse,
          attack,
          decay,
          sustain,
          duration,
          gain,
          delay,
          startTime: null,
          destination,
          trackBgm: false,
          _cryToken,
        });
        this.unlock();
        return { queued: true };
      }
      return null;
    }

    const hasNum = (v) => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v));
    const ctxNow = Number.isFinite(Number(ctx.currentTime)) ? Math.max(0, Number(ctx.currentTime)) : 0;
    const dur = Math.max(0.025, hasNum(duration) ? Number(duration) : 0.14);
    const safeDelay = hasNum(delay) ? Math.max(0, Number(delay)) : 0;
    const start = Math.max(0, hasNum(startTime) ? Number(startTime) : ctxNow + safeDelay);
    const atk = Math.min(dur * 0.45, Math.max(0.002, hasNum(attack) ? Number(attack) : 0.006));
    const decEnd = Math.min(dur * 0.82, atk + Math.max(0.008, hasNum(decay) ? Number(decay) : 0.045));
    const peakGain = Math.max(0.001, hasNum(gain) ? Number(gain) : 0.12);
    const safeSustain = hasNum(sustain) ? Number(sustain) : 0.36;
    const sustainGain = Math.max(0.0001, peakGain * Math.max(0.04, Math.min(0.95, safeSustain)));

    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    if (wave === 'pulse12' && this.pulse12Wave) {
      osc.setPeriodicWave(this.pulse12Wave);
    } else if ((wave === 'pulse25' || wave === 'square' || useWarmPulse) && this.pulse25Wave) {
      osc.setPeriodicWave(this.pulse25Wave);
    } else {
      osc.type = wave === 'pulse12' || wave === 'pulse25' ? 'square' : wave;
    }

    const safeFreq = hasNum(freq) ? Number(freq) : 440;
    const startHz = Math.max(20, safeFreq);
    osc.frequency.setValueAtTime(startHz, start);
    if (hasNum(midFreq)) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, Number(midFreq)), start + dur * 0.45);
    }
    if (hasNum(endFreq) && Math.max(20, Number(endFreq)) !== startHz) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, Number(endFreq)), start + dur);
    }

    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(peakGain, start + atk);
    if (decEnd > atk && decEnd < dur) {
      env.gain.exponentialRampToValueAtTime(sustainGain, start + decEnd);
    }
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(env);
    env.connect(dest);
    if (trackBgm) {
      this._trackBgmNode(osc, env);
    } else {
      osc.onended = () => {
        try {
          osc.disconnect();
        } catch {
          // Ignore
        }
        try {
          env.disconnect();
        } catch {
          // Ignore
        }
      };
    }
    osc.start(start);
    osc.stop(start + dur + 0.02);
    return osc;
  }

  playTone(opts) {
    this.triggerVoice({
      wave: opts.type === 'square' ? 'pulse25' : (opts.type || 'triangle'),
      useWarmPulse: opts.type === 'square',
      ...opts,
    });
  }

  playNoise({
    duration = 0.14,
    gain = 0.18,
    filterType = 'lowpass',
    startFreq = 820,
    endFreq = 180,
    q = 0.9,
    attack = 0.003,
    delay = 0,
    startTime = null,
    destination = null,
    trackBgm = false,
  }) {
    if (this.muted) return null;
    const ctx = this.ensureContext();
    const dest = destination || this.masterFilter;
    if (!ctx || !dest) return null;
    if (this._isInactiveState(ctx.state) || ctx.state !== 'running') {
      if (ctx.state === 'closed') return null;
      if (startTime === null && !trackBgm) {
        this._queuePendingVoice('noise', {
          duration,
          gain,
          filterType,
          startFreq,
          endFreq,
          q,
          attack,
          delay,
          startTime: null,
          destination,
          trackBgm: false,
        });
        this.unlock();
        return { queued: true };
      }
      return null;
    }
    if (!this.noiseBuffer) return null;

    const hasNum = (v) => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v));
    const ctxNow = Number.isFinite(Number(ctx.currentTime)) ? Math.max(0, Number(ctx.currentTime)) : 0;
    const dur = Math.max(0.02, hasNum(duration) ? Number(duration) : 0.14);
    const safeDelay = hasNum(delay) ? Math.max(0, Number(delay)) : 0;
    const start = Math.max(0, hasNum(startTime) ? Number(startTime) : ctxNow + safeDelay);
    const atk = Math.min(dur * 0.35, Math.max(0.002, hasNum(attack) ? Number(attack) : 0.003));
    const safeStartFreq = hasNum(startFreq) ? Math.max(30, Number(startFreq)) : 820;
    const safeEndFreq = hasNum(endFreq) ? Math.max(30, Number(endFreq)) : 180;
    const safeGain = hasNum(gain) ? Math.max(0.001, Number(gain)) : 0.18;
    const safeQ = hasNum(q) ? Math.max(0.1, Number(q)) : 0.9;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = safeQ;
    filter.frequency.setValueAtTime(safeStartFreq, start);
    if (safeEndFreq !== safeStartFreq) {
      filter.frequency.exponentialRampToValueAtTime(safeEndFreq, start + dur);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(safeGain, start + atk);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(dest);
    if (trackBgm) {
      this._trackBgmNode(src, env, filter);
    } else {
      src.onended = () => {
        try {
          src.disconnect();
        } catch {
          // Ignore
        }
        try {
          filter.disconnect();
        } catch {
          // Ignore
        }
        try {
          env.disconnect();
        } catch {
          // Ignore
        }
      };
    }

    src.start(start);
    src.stop(start + dur + 0.02);
    return src;
  }

  triggerDrum(hitType, startTime, drumGain = 0.08) {
    if (!hitType || !this.bgmBus) return;
    if (hitType === 'K') {
      // Pure grounded low-frequency triangle kick thud (zero white-noise clutter)
      this.triggerVoice({
        freq: 112,
        endFreq: 36,
        wave: 'triangle',
        startTime,
        duration: 0.075,
        attack: 0.002,
        decay: 0.03,
        sustain: 0.25,
        gain: Math.min(0.11, drumGain * 1.25),
        destination: this.bgmBus,
        trackBgm: true,
      });
    } else if (hitType === 'S') {
      // Warm tight Game Boy snare
      this.triggerVoice({
        freq: 175,
        endFreq: 78,
        wave: 'triangle',
        startTime,
        duration: 0.055,
        attack: 0.002,
        decay: 0.024,
        sustain: 0.2,
        gain: drumGain * 0.72,
        destination: this.bgmBus,
        trackBgm: true,
      });
      this.playNoise({
        startTime,
        duration: 0.06,
        gain: drumGain * 0.78,
        filterType: 'lowpass',
        startFreq: 920,
        endFreq: 240,
        q: 0.65,
        attack: 0.002,
        destination: this.bgmBus,
        trackBgm: true,
      });
    } else if (hitType === 'h') {
      // Subtle soft low-passed tick
      this.playNoise({
        startTime,
        duration: 0.018,
        gain: drumGain * 0.24,
        filterType: 'lowpass',
        startFreq: 980,
        endFreq: 420,
        q: 0.65,
        attack: 0.002,
        destination: this.bgmBus,
        trackBgm: true,
      });
    }
  }

  playBGM(theme) {
    if (!THEMES[theme]) return;
    if (this.currentTheme === theme && this.schedulerTimer) return;

    this.stopBGM();
    this.currentTheme = theme;
    this.stepIndex = 0;

    const ctx = this.ensureContext();
    const isHidden = typeof document !== 'undefined' && document.hidden === true;
    if (!ctx || this.muted || ctx.state !== 'running' || isHidden) return;
    this.startScheduler();
  }

  stopBGM() {
    this.bgmGeneration += 1;
    this.stopScheduler();
    this._haltActiveBgmNodes();
    this.currentTheme = null;
    this.stepIndex = 0;
    this.nextStepTime = 0;
    this.bgmSyncStartTime = 0;
    this.bgmStepsSinceSync = 0;
  }

  stopScheduler() {
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  startScheduler() {
    this.stopScheduler();
    if (this.muted || this._destroying) return;
    if (typeof document !== 'undefined' && document.hidden === true) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.currentTheme || ctx.state !== 'running') return;

    const gen = ++this.bgmGeneration;
    this.schedulerStartCount += 1;
    const ctxNow = Number.isFinite(Number(ctx.currentTime)) ? Math.max(0, Number(ctx.currentTime)) : 0;
    this.nextStepTime = ctxNow + 0.03;
    this.bgmSyncStartTime = this.nextStepTime;
    this.bgmStepsSinceSync = 0;
    this.schedulerTimer = setInterval(() => this.scheduleAhead(gen), 25);
    this.scheduleAhead(gen);
  }

  _countHoldSteps(arr, startIdx) {
    if (!arr || arr.length === 0) return 1;
    let hold = 1;
    while (startIdx + hold < arr.length && arr[startIdx + hold] === -1) {
      hold += 1;
    }
    return hold;
  }

  scheduleAhead(gen = this.bgmGeneration) {
    if (gen !== this.bgmGeneration) return;
    if (this.muted || !this.currentTheme || !this.ctx || this.ctx.state !== 'running') return;
    const theme = THEMES[this.currentTheme];
    if (!theme) return;

    const now = this.ctx.currentTime;
    // Anti-burst guard: if browser tab was backgrounded or stalled, re-anchor cleanly instead of dumping backlog
    if (now - this.nextStepTime > 0.5) {
      this.nextStepTime = now + 0.03;
      this.bgmSyncStartTime = this.nextStepTime;
      this.bgmStepsSinceSync = 0;
    }

    const horizon = now + 0.14;
    const dest = this.bgmBus || this.masterFilter;

    while (this.nextStepTime < horizon) {
      const idx = this.stepIndex % theme.melody.length;
      const melFreq = theme.melody[idx];
      const arpIdx = theme.arp ? idx % theme.arp.length : 0;
      const arpFreq = theme.arp ? theme.arp[arpIdx] : 0;
      const bassIdx = idx % theme.bass.length;
      const bassFreq = theme.bass[bassIdx];
      const drumHit = theme.drums ? theme.drums[idx % theme.drums.length] : null;
      const stepDur = theme.stepSec;

      if (melFreq > 0) {
        const melHold = this._countHoldSteps(theme.melody, idx);
        this.triggerVoice({
          freq: melFreq,
          wave: theme.leadWave || 'pulse25',
          startTime: this.nextStepTime,
          duration: stepDur * Math.max(0.72, melHold - 0.16),
          attack: 0.005,
          decay: 0.035,
          sustain: 0.54,
          gain: Math.min(0.12, theme.leadGain),
          destination: dest,
          trackBgm: true,
        });
      }
      if (arpFreq > 0) {
        const arpHold = this._countHoldSteps(theme.arp, arpIdx);
        this.triggerVoice({
          freq: arpFreq,
          wave: theme.arpWave || 'pulse25',
          startTime: this.nextStepTime,
          duration: stepDur * Math.max(0.65, arpHold - 0.18),
          attack: 0.004,
          decay: 0.025,
          sustain: 0.42,
          gain: Math.min(0.12, theme.arpGain),
          destination: dest,
          trackBgm: true,
        });
      }
      if (bassFreq > 0) {
        const bassHold = this._countHoldSteps(theme.bass, bassIdx);
        this.triggerVoice({
          freq: bassFreq,
          wave: 'triangle',
          startTime: this.nextStepTime,
          duration: stepDur * Math.max(0.84, bassHold - 0.12),
          attack: 0.004,
          decay: 0.035,
          sustain: 0.62,
          gain: Math.min(0.12, theme.bassGain),
          destination: dest,
          trackBgm: true,
        });
      }
      if (drumHit) {
        this.triggerDrum(drumHit, this.nextStepTime, theme.drumGain || 0.052);
      }

      this.nextStepTime += stepDur;
      this.stepIndex += 1;
      this.bgmStepsSinceSync += 1;
    }
  }

  getDiagnostics() {
    const theme = this.currentTheme ? THEMES[this.currentTheme] : null;
    const stepSec = theme?.stepSec || 0;
    const expectedStepsPerSec = stepSec > 0 ? 1 / stepSec : 0;
    const audioNow = this.ctx ? this.ctx.currentTime : 0;
    const elapsedAudio = this.bgmStepsSinceSync > 0 && this.ctx
      ? Math.max(0.001, (this.nextStepTime - this.bgmSyncStartTime))
      : 0;
    const measuredStepsPerSec = elapsedAudio > 0 && this.bgmStepsSinceSync > 0
      ? this.bgmStepsSinceSync / elapsedAudio
      : 0;
    const tempoDriftPct = expectedStepsPerSec > 0 && measuredStepsPerSec > 0
      ? Math.abs(measuredStepsPerSec - expectedStepsPerSec) / expectedStepsPerSec * 100
      : 0;

    return {
      currentTheme: this.currentTheme,
      unlocked: this.unlocked,
      muted: this.muted,
      contextState: this.ctx?.state || 'none',
      queuedVoices: this._pendingVoices.length,
      resumeCount: this._resumeCount,
      schedulerActive: this.schedulerTimer !== null,
      schedulerStartCount: this.schedulerStartCount,
      activeBgmNodes: this.activeBgmNodes.size,
      stepIndex: this.stepIndex,
      stepSec,
      expectedStepsPerSec: Number(expectedStepsPerSec.toFixed(3)),
      measuredStepsPerSec: Number(measuredStepsPerSec.toFixed(3)),
      tempoDriftPct: Number(tempoDriftPct.toFixed(4)),
      audioCurrentTime: Number(audioNow.toFixed(3)),
    };
  }

  // --- Sound Effects ---

  playCursorMove() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this._lastCursorAt < 35) return;
    this._lastCursorAt = now;
    this.triggerVoice({
      freq: 720,
      wave: 'pulse25',
      duration: 0.032,
      attack: 0.002,
      decay: 0.015,
      sustain: 0.25,
      gain: 0.05,
    });
  }

  playMoveSelect() {
    this.triggerVoice({
      freq: 587.33,
      wave: 'pulse25',
      duration: 0.048,
      attack: 0.002,
      decay: 0.02,
      sustain: 0.45,
      gain: 0.085,
      delay: 0,
    });
    this.triggerVoice({
      freq: 880.0,
      wave: 'pulse25',
      duration: 0.078,
      attack: 0.002,
      decay: 0.03,
      sustain: 0.4,
      gain: 0.095,
      delay: 0.048,
    });
  }

  playMenuBlip(pitch = 620) {
    this.triggerVoice({
      freq: pitch,
      wave: 'pulse25',
      duration: 0.045,
      attack: 0.002,
      decay: 0.02,
      sustain: 0.25,
      gain: 0.065,
    });
  }

  playEncounterAlert(mode = 'wild') {
    const raw = typeof mode === 'string' ? mode.trim().toLowerCase() : 'wild';
    const resolvedMode = raw === 'rare' || raw === 'rival' || raw === 'shrine' ? raw : 'wild';
    let firstVoice = null;
    const trackFirst = (v) => {
      if (!firstVoice && v) firstVoice = v;
      return v;
    };

    if (resolvedMode === 'rare') {
      // Glittering crystal major-9th sparkle swell for rare / shiny encounters
      trackFirst(this.playNoise({
        duration: 0.16,
        gain: 0.055,
        filterType: 'bandpass',
        startFreq: 1800,
        endFreq: 4200,
        q: 1.5,
        delay: 0,
      }));
      [
        { freq: Fs5, wave: 'pulse12', dur: 0.11, delay: 0, gain: 0.075 },
        { freq: A5, wave: 'sine', dur: 0.13, delay: 0.065, gain: 0.08 },
        { freq: 1108.73, wave: 'pulse12', dur: 0.15, delay: 0.13, gain: 0.082 },
        { freq: E6, endFreq: E6 * 1.02, wave: 'sine', dur: 0.28, delay: 0.195, gain: 0.09 },
      ].forEach((n) => {
        trackFirst(this.triggerVoice({
          freq: n.freq,
          endFreq: n.endFreq ?? null,
          wave: n.wave,
          duration: n.dur,
          attack: 0.005,
          decay: 0.04,
          sustain: 0.56,
          gain: n.gain,
          delay: n.delay,
        }));
      });
      trackFirst(this.triggerVoice({
        freq: E4,
        endFreq: B4,
        wave: 'triangle',
        duration: 0.34,
        attack: 0.01,
        decay: 0.08,
        sustain: 0.5,
        gain: 0.075,
        delay: 0.02,
      }));
      return { played: Boolean(firstVoice), muted: this.muted, mode: resolvedMode };
    }

    if (resolvedMode === 'rival') {
      // Dramatic brassy showdown fanfare swell for Rival encounters
      trackFirst(this.playNoise({
        duration: 0.12,
        gain: 0.08,
        filterType: 'highpass',
        startFreq: 1200,
        endFreq: 2600,
        q: 1.0,
        delay: 0,
      }));
      [
        { freq: E4, dur: 0.09, delay: 0, wave: 'pulse25', gain: 0.088 },
        { freq: G4, dur: 0.09, delay: 0.07, wave: 'pulse25', gain: 0.09 },
        { freq: A4, dur: 0.09, delay: 0.14, wave: 'pulse25', gain: 0.092 },
        { freq: B4, dur: 0.10, delay: 0.21, wave: 'pulse12', gain: 0.095 },
        { freq: E5, endFreq: E5 * 1.015, dur: 0.26, delay: 0.29, wave: 'pulse25', gain: 0.102 },
      ].forEach((n) => {
        trackFirst(this.triggerVoice({
          freq: n.freq,
          endFreq: n.endFreq ?? null,
          wave: n.wave,
          duration: n.dur,
          attack: 0.004,
          decay: 0.03,
          sustain: 0.58,
          gain: n.gain,
          delay: n.delay,
        }));
      });
      trackFirst(this.triggerVoice({
        freq: E3,
        endFreq: B3,
        wave: 'triangle',
        duration: 0.38,
        attack: 0.008,
        decay: 0.08,
        sustain: 0.55,
        gain: 0.095,
        delay: 0,
      }));
      return { played: Boolean(firstVoice), muted: this.muted, mode: resolvedMode };
    }

    if (resolvedMode === 'shrine') {
      // Mystical echoing astral fifths swell for Shrine Guardian encounters
      trackFirst(this.playNoise({
        duration: 0.22,
        gain: 0.05,
        filterType: 'bandpass',
        startFreq: 760,
        endFreq: 1950,
        q: 1.6,
        delay: 0,
      }));
      [
        { freq: C5, dur: 0.15, delay: 0, wave: 'sine', gain: 0.088 },
        { freq: G5, dur: 0.17, delay: 0.085, wave: 'triangle', gain: 0.088 },
        { freq: D6, dur: 0.20, delay: 0.17, wave: 'sine', gain: 0.082 },
        { freq: E6, dur: 0.32, delay: 0.26, wave: 'sine', gain: 0.085 },
      ].forEach((n) => {
        trackFirst(this.triggerVoice({
          freq: n.freq,
          wave: n.wave,
          duration: n.dur,
          attack: 0.012,
          decay: 0.055,
          sustain: 0.58,
          gain: n.gain,
          delay: n.delay,
        }));
      });
      [C4, G4].forEach((freq, i) => {
        trackFirst(this.triggerVoice({
          freq,
          wave: 'triangle',
          duration: 0.36,
          attack: 0.016,
          decay: 0.09,
          sustain: 0.52,
          gain: 0.072,
          delay: i * 0.085,
        }));
      });
      return { played: Boolean(firstVoice), muted: this.muted, mode: resolvedMode };
    }

    // Default 'wild': bold chiptune encounter alert swell
    trackFirst(this.playNoise({
      duration: 0.10,
      gain: 0.055,
      filterType: 'bandpass',
      startFreq: 1200,
      endFreq: 2400,
      delay: 0.01,
    }));
    trackFirst(this.triggerVoice({
      freq: B4,
      wave: 'pulse25',
      duration: 0.10,
      attack: 0.004,
      decay: 0.03,
      sustain: 0.55,
      gain: 0.09,
      delay: 0,
    }));
    trackFirst(this.triggerVoice({
      freq: E4,
      wave: 'triangle',
      duration: 0.10,
      gain: 0.06,
      delay: 0,
    }));
    trackFirst(this.triggerVoice({
      freq: E5,
      wave: 'pulse25',
      duration: 0.14,
      attack: 0.004,
      decay: 0.035,
      sustain: 0.55,
      gain: 0.09,
      delay: 0.11,
    }));
    trackFirst(this.triggerVoice({
      freq: Gs4,
      wave: 'triangle',
      duration: 0.14,
      gain: 0.062,
      delay: 0.11,
    }));
    trackFirst(this.triggerVoice({
      freq: Gs5,
      endFreq: B5,
      wave: 'pulse25',
      duration: 0.19,
      attack: 0.005,
      decay: 0.045,
      sustain: 0.52,
      gain: 0.088,
      delay: 0.21,
    }));
    return { played: Boolean(firstVoice), muted: this.muted, mode: resolvedMode };
  }

  playDiscoveryChime(kind = 'starfall') {
    const raw = typeof kind === 'string' ? kind.trim().toLowerCase() : 'starfall';
    const resolvedKind = raw === 'shimmer' || raw === 'mystery_cry' ? raw : 'starfall';
    let firstVoice = null;
    const trackFirst = (v) => {
      if (!firstVoice && v) firstVoice = v;
      return v;
    };

    if (resolvedKind === 'shimmer') {
      // Prismatic dewdrop harmonic bloom
      trackFirst(this.playNoise({
        duration: 0.18,
        gain: 0.042,
        filterType: 'bandpass',
        startFreq: 1600,
        endFreq: 3200,
        q: 1.8,
        delay: 0,
      }));
      [
        { freq: G5, delay: 0, dur: 0.18, gain: 0.075 },
        { freq: B5, delay: 0.06, dur: 0.20, gain: 0.078 },
        { freq: D6, delay: 0.12, dur: 0.24, gain: 0.072 },
        { freq: E6, delay: 0.18, dur: 0.30, gain: 0.076 },
      ].forEach((n) => {
        trackFirst(this.triggerVoice({
          freq: n.freq,
          wave: 'sine',
          duration: n.dur,
          attack: 0.012,
          decay: 0.06,
          sustain: 0.52,
          gain: n.gain,
          delay: n.delay,
        }));
      });
      [G4, D5].forEach((freq, i) => {
        trackFirst(this.triggerVoice({
          freq,
          wave: 'triangle',
          duration: 0.34,
          attack: 0.016,
          decay: 0.09,
          sustain: 0.45,
          gain: 0.058,
          delay: i * 0.06,
        }));
      });
      return { played: Boolean(firstVoice), muted: this.muted, kind: resolvedKind };
    }

    if (resolvedKind === 'mystery_cry') {
      // Curious echoing woodland mystery call
      trackFirst(this.playNoise({
        duration: 0.16,
        gain: 0.04,
        filterType: 'bandpass',
        startFreq: 900,
        endFreq: 1800,
        q: 2.0,
        delay: 0,
      }));
      trackFirst(this.triggerVoice({
        freq: Fs5,
        midFreq: Ds5,
        endFreq: Fs5,
        wave: 'sine',
        duration: 0.22,
        attack: 0.015,
        decay: 0.07,
        sustain: 0.52,
        gain: 0.082,
        delay: 0,
      }));
      trackFirst(this.triggerVoice({
        freq: Fs5 * 0.5,
        midFreq: Ds5 * 0.5,
        endFreq: Fs5 * 0.5,
        wave: 'triangle',
        duration: 0.22,
        attack: 0.015,
        decay: 0.07,
        sustain: 0.44,
        gain: 0.056,
        delay: 0.01,
      }));
      trackFirst(this.triggerVoice({
        freq: Fs5,
        midFreq: Gs5,
        endFreq: A5,
        wave: 'pulse12',
        duration: 0.24,
        attack: 0.014,
        decay: 0.06,
        sustain: 0.5,
        gain: 0.068,
        delay: 0.17,
      }));
      trackFirst(this.triggerVoice({
        freq: B4,
        wave: 'sine',
        duration: 0.28,
        attack: 0.02,
        decay: 0.08,
        sustain: 0.42,
        gain: 0.052,
        delay: 0.18,
      }));
      return { played: Boolean(firstVoice), muted: this.muted, kind: resolvedKind };
    }

    // Default 'starfall': cascading celestial starfall chime
    trackFirst(this.playNoise({
      duration: 0.18,
      gain: 0.045,
      filterType: 'bandpass',
      startFreq: 2000,
      endFreq: 3800,
      q: 1.6,
      delay: 0,
    }));
    [
      { freq: E6, delay: 0, dur: 0.11, wave: 'sine', gain: 0.076 },
      { freq: D6, delay: 0.055, dur: 0.11, wave: 'sine', gain: 0.074 },
      { freq: B5, delay: 0.11, dur: 0.12, wave: 'pulse12', gain: 0.068 },
      { freq: G5, delay: 0.165, dur: 0.13, wave: 'sine', gain: 0.076 },
      { freq: B5, delay: 0.225, dur: 0.14, wave: 'sine', gain: 0.08 },
      { freq: E6, delay: 0.29, dur: 0.30, wave: 'sine', gain: 0.086 },
    ].forEach((n) => {
      trackFirst(this.triggerVoice({
        freq: n.freq,
        wave: n.wave,
        duration: n.dur,
        attack: 0.006,
        decay: 0.04,
        sustain: 0.54,
        gain: n.gain,
        delay: n.delay,
      }));
    });
    trackFirst(this.triggerVoice({
      freq: G4,
      endFreq: E5,
      wave: 'triangle',
      duration: 0.36,
      attack: 0.015,
      decay: 0.1,
      sustain: 0.46,
      gain: 0.065,
      delay: 0.02,
    }));
    return { played: Boolean(firstVoice), muted: this.muted, kind: resolvedKind };
  }

  playPhysicalImpact(power = 45) {
    const boost = Math.min(1.25, Math.max(0.85, power / 50));
    // Heavy, punchy low-frequency thud with instant noise transient, zero high-pitched ringing
    this.triggerVoice({
      freq: 128,
      endFreq: 26,
      wave: 'sine',
      duration: 0.14,
      attack: 0.002,
      decay: 0.045,
      sustain: 0.22,
      gain: 0.24 * boost,
    });
    this.triggerVoice({
      freq: 96,
      endFreq: 22,
      wave: 'triangle',
      duration: 0.13,
      attack: 0.002,
      decay: 0.045,
      sustain: 0.18,
      gain: 0.19 * boost,
    });
    this.playNoise({
      duration: 0.095,
      gain: 0.22 * boost,
      filterType: 'lowpass',
      startFreq: 620,
      endFreq: 95,
      q: 0.65,
      attack: 0.002,
    });
  }

  playTackle() {
    this.playPhysicalImpact(42);
  }

  playFaint() {
    // Low-frequency descending pitch drop
    this.triggerVoice({
      freq: 220,
      endFreq: 46,
      wave: 'pulse25',
      duration: 0.44,
      attack: 0.005,
      decay: 0.14,
      sustain: 0.35,
      gain: 0.11,
    });
    this.triggerVoice({
      freq: 110,
      endFreq: 28,
      wave: 'triangle',
      duration: 0.44,
      attack: 0.005,
      decay: 0.15,
      sustain: 0.38,
      gain: 0.16,
    });
    this.playNoise({
      duration: 0.18,
      gain: 0.11,
      filterType: 'lowpass',
      startFreq: 340,
      endFreq: 65,
      q: 0.65,
      delay: 0.16,
    });
  }

  playElemental(type, moveId = '') {
    if (moveId === 'tackle' || moveId === 'quick_attack') {
      this.playPhysicalImpact(moveId === 'quick_attack' ? 50 : 42);
      return;
    }

    if (moveId === 'sky_wing') {
      this.playNoise({
        duration: 0.2,
        gain: 0.16,
        filterType: 'bandpass',
        startFreq: 440,
        endFreq: 1120,
        q: 1.4,
      });
      this.triggerVoice({
        freq: 523.25,
        endFreq: 880,
        wave: 'triangle',
        duration: 0.14,
        gain: 0.1,
      });
      this.playPhysicalImpact(56);
      return;
    }

    if (moveId === 'star_melody') {
      [523.25, 659.25, 783.99, 987.77, 1046.5].forEach((freq, i) => {
        this.triggerVoice({
          freq,
          endFreq: freq * 1.02,
          wave: i % 2 === 0 ? 'pulse25' : 'sine',
          duration: 0.11,
          gain: 0.082,
          delay: i * 0.045,
        });
      });
      return;
    }

    if (moveId === 'hyper_nova') {
      this.triggerVoice({
        freq: 220,
        midFreq: 659.25,
        endFreq: 1046.5,
        wave: 'pulse25',
        duration: 0.28,
        gain: 0.11,
      });
      [523.25, 783.99, 1046.5].forEach((freq, i) => {
        this.triggerVoice({
          freq,
          wave: 'sine',
          duration: 0.24,
          gain: 0.085,
          delay: 0.05 + i * 0.03,
        });
      });
      this.playNoise({
        duration: 0.2,
        gain: 0.14,
        filterType: 'lowpass',
        startFreq: 980,
        endFreq: 240,
        delay: 0.06,
      });
      return;
    }

    if (moveId === 'petal_blizzard') {
      [587.33, 739.99, 880.0, 1174.66].forEach((f, i) => {
        this.triggerVoice({
          freq: f,
          endFreq: f * 1.12,
          wave: 'pulse25',
          duration: 0.1,
          gain: 0.088,
          delay: i * 0.04,
        });
      });
      this.playNoise({
        duration: 0.22,
        gain: 0.13,
        filterType: 'bandpass',
        startFreq: 1050,
        endFreq: 480,
        q: 1.3,
      });
      return;
    }

    if (moveId === 'cosmos_mind') {
      [440, 554.37, 659.25, 880, 1108.73].forEach((f, i) => {
        this.triggerVoice({
          freq: f,
          wave: 'sine',
          duration: 0.14,
          gain: 0.082,
          delay: i * 0.045,
        });
      });
      return;
    }

    if (moveId === 'meteor_slam') {
      this.triggerVoice({
        freq: 420,
        endFreq: 52,
        wave: 'triangle',
        duration: 0.24,
        gain: 0.2,
      });
      this.playNoise({
        duration: 0.22,
        gain: 0.22,
        filterType: 'lowpass',
        startFreq: 760,
        endFreq: 95,
        q: 0.8,
        delay: 0.04,
      });
      return;
    }

    if (moveId === 'phantom_claw') {
      this.triggerVoice({
        freq: 466.16,
        midFreq: 622.25,
        endFreq: 246.94,
        wave: 'pulse12',
        duration: 0.22,
        gain: 0.085,
      });
      this.playNoise({
        duration: 0.14,
        gain: 0.14,
        filterType: 'bandpass',
        startFreq: 980,
        endFreq: 360,
        q: 1.8,
      });
      return;
    }

    if (moveId === 'thunder_tempest') {
      [987.77, 1174.66, 880, 1318.51].forEach((f, i) => {
        this.triggerVoice({
          freq: f,
          endFreq: f * 0.55,
          wave: i % 2 === 0 ? 'pulse12' : 'pulse25',
          duration: 0.095,
          gain: 0.09,
          delay: i * 0.042,
        });
      });
      this.playNoise({
        duration: 0.18,
        gain: 0.15,
        filterType: 'lowpass',
        startFreq: 960,
        endFreq: 180,
        delay: 0.04,
      });
      return;
    }

    if (moveId === 'aurora_flare') {
      this.playNoise({
        duration: 0.22,
        gain: 0.1,
        filterType: 'bandpass',
        startFreq: 1200,
        endFreq: 720,
        q: 1.6,
      });
      [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => {
        this.triggerVoice({
          freq: f,
          endFreq: f * 1.06,
          wave: i % 2 === 0 ? 'sine' : 'pulse12',
          duration: 0.14,
          gain: 0.08,
          delay: i * 0.04,
        });
      });
      return;
    }

    if (moveId === 'cotton_guard') {
      this.playShieldChime();
      return;
    }

    if (moveId === 'thunder_fang') {
      this.playPhysicalImpact(62);
      this.triggerVoice({
        freq: 1174.66,
        endFreq: 523.25,
        wave: 'pulse12',
        duration: 0.09,
        gain: 0.095,
      });
      this.triggerVoice({
        freq: 1318.51,
        endFreq: 659.25,
        wave: 'pulse25',
        duration: 0.1,
        gain: 0.09,
        delay: 0.045,
      });
      this.playNoise({
        duration: 0.11,
        gain: 0.12,
        filterType: 'bandpass',
        startFreq: 1150,
        endFreq: 480,
        q: 1.7,
        delay: 0.02,
      });
      return;
    }

    if (moveId === 'wild_volt') {
      this.triggerVoice({
        freq: 329.63,
        endFreq: 1318.51,
        wave: 'pulse12',
        duration: 0.16,
        gain: 0.095,
      });
      this.triggerVoice({
        freq: 135,
        endFreq: 32,
        wave: 'triangle',
        duration: 0.24,
        gain: 0.17,
        delay: 0.08,
      });
      [1174.66, 1567.98, 987.77, 1318.51].forEach((f, i) => {
        this.triggerVoice({
          freq: f,
          endFreq: f * 0.52,
          wave: i % 2 === 0 ? 'pulse12' : 'pulse25',
          duration: 0.095,
          gain: 0.088,
          delay: 0.085 + i * 0.04,
        });
      });
      this.playNoise({
        duration: 0.2,
        gain: 0.15,
        filterType: 'lowpass',
        startFreq: 980,
        endFreq: 140,
        delay: 0.08,
      });
      return;
    }

    if (moveId === 'moonblast') {
      [587.33, 739.99, 880.0, 1174.66, 1318.51].forEach((f, i) => {
        this.triggerVoice({
          freq: f,
          endFreq: f * 1.03,
          wave: i % 2 === 0 ? 'sine' : 'triangle',
          duration: 0.15,
          gain: 0.085,
          delay: i * 0.036,
        });
      });
      this.triggerVoice({
        freq: 220,
        endFreq: 58,
        wave: 'triangle',
        duration: 0.28,
        gain: 0.15,
        delay: 0.12,
      });
      this.playNoise({
        duration: 0.22,
        gain: 0.1,
        filterType: 'bandpass',
        startFreq: 1100,
        endFreq: 520,
        q: 1.5,
        delay: 0.1,
      });
      return;
    }

    if (moveId === 'calm_aura') {
      [440.0, 554.37, 659.25, 880.0, 987.77].forEach((f, i) => {
        this.triggerVoice({
          freq: f,
          wave: 'sine',
          duration: 0.26,
          attack: 0.014,
          sustain: 0.52,
          gain: 0.09,
          delay: i * 0.055,
        });
        this.triggerVoice({
          freq: f * 0.5,
          wave: 'triangle',
          duration: 0.22,
          gain: 0.055,
          delay: i * 0.055,
        });
      });
      return;
    }

    if (moveId === 'shadow_pulse') {
      this.triggerVoice({
        freq: 349.23,
        midFreq: 466.16,
        endFreq: 207.65,
        wave: 'sine',
        duration: 0.3,
        gain: 0.12,
      });
      this.triggerVoice({
        freq: 523.25,
        midFreq: 392.0,
        endFreq: 246.94,
        wave: 'pulse12',
        duration: 0.28,
        gain: 0.078,
        delay: 0.04,
      });
      [415.3, 311.13].forEach((f, i) => {
        this.triggerVoice({
          freq: f,
          endFreq: f * 0.78,
          wave: 'sine',
          duration: 0.16,
          gain: 0.085,
          delay: 0.1 + i * 0.08,
        });
      });
      this.playNoise({
        duration: 0.26,
        gain: 0.1,
        filterType: 'bandpass',
        startFreq: 720,
        endFreq: 210,
        q: 2.0,
        delay: 0.02,
      });
      return;
    }

    if (moveId === 'iron_crush') {
      this.triggerVoice({
        freq: 987.77,
        endFreq: 880.0,
        wave: 'pulse12',
        duration: 0.14,
        gain: 0.085,
      });
      this.triggerVoice({
        freq: 739.99,
        endFreq: 659.25,
        wave: 'triangle',
        duration: 0.16,
        gain: 0.1,
        delay: 0.01,
      });
      this.triggerVoice({
        freq: 140,
        endFreq: 26,
        wave: 'triangle',
        duration: 0.26,
        gain: 0.22,
        delay: 0.04,
      });
      this.playNoise({
        duration: 0.22,
        gain: 0.22,
        filterType: 'lowpass',
        startFreq: 780,
        endFreq: 90,
        q: 0.75,
        delay: 0.04,
      });
      return;
    }

    if (moveId === 'glacier_crash') {
      [1046.5, 1318.51, 1567.98, 1975.53].forEach((f, i) => {
        this.triggerVoice({
          freq: f,
          endFreq: f * 1.04,
          wave: i % 2 === 0 ? 'pulse12' : 'sine',
          duration: 0.1,
          gain: 0.08,
          delay: i * 0.032,
        });
      });
      this.triggerVoice({
        freq: 165,
        endFreq: 36,
        wave: 'triangle',
        duration: 0.18,
        gain: 0.18,
        delay: 0.04,
      });
      this.playNoise({
        duration: 0.2,
        gain: 0.14,
        filterType: 'bandpass',
        startFreq: 1200,
        endFreq: 540,
        q: 1.8,
        delay: 0.02,
      });
      return;
    }

    if (moveId === 'magma_cannon') {
      this.triggerVoice({
        freq: 148,
        endFreq: 34,
        wave: 'triangle',
        duration: 0.3,
        gain: 0.19,
      });
      this.triggerVoice({
        freq: 293.66,
        endFreq: 110,
        wave: 'pulse25',
        duration: 0.22,
        gain: 0.09,
      });
      this.triggerVoice({
        freq: 349.23,
        endFreq: 98,
        wave: 'pulse25',
        duration: 0.24,
        gain: 0.09,
        delay: 0.06,
      });
      [0, 0.06, 0.12, 0.18].forEach((d, idx) => {
        this.playNoise({
          duration: 0.11,
          gain: 0.17 - idx * 0.02,
          filterType: idx % 2 === 0 ? 'bandpass' : 'lowpass',
          startFreq: 520 + idx * 140,
          endFreq: idx % 2 === 0 ? 1050 : 180,
          q: 1.2,
          delay: d,
        });
      });
      return;
    }

    if (moveId === 'leaf_blade') {
      this.playNoise({
        duration: 0.14,
        gain: 0.14,
        filterType: 'bandpass',
        startFreq: 1180,
        endFreq: 420,
        q: 1.5,
      });
      [659.25, 880.0, 1174.66].forEach((f, i) => {
        this.triggerVoice({
          freq: f,
          endFreq: f * 1.18,
          wave: i % 2 === 0 ? 'pulse12' : 'pulse25',
          duration: 0.085,
          gain: 0.09,
          delay: i * 0.038,
        });
      });
      this.playPhysicalImpact(62);
      return;
    }

    if (moveId === 'eruption_flare') {
      this.triggerVoice({
        freq: 175,
        endFreq: 36,
        wave: 'triangle',
        duration: 0.3,
        gain: 0.2,
      });
      this.triggerVoice({
        freq: 311.13,
        midFreq: 440,
        endFreq: 110,
        wave: 'pulse25',
        duration: 0.24,
        gain: 0.095,
      });
      [0, 0.055, 0.11, 0.17].forEach((d, idx) => {
        this.playNoise({
          duration: 0.12,
          gain: 0.18 - idx * 0.02,
          filterType: idx % 2 === 0 ? 'bandpass' : 'lowpass',
          startFreq: 480 + idx * 160,
          endFreq: idx % 2 === 0 ? 1120 : 190,
          q: 1.1,
          delay: d,
        });
      });
      return;
    }

    if (moveId === 'aura_sphere') {
      this.triggerVoice({
        freq: 329.63,
        endFreq: 659.25,
        wave: 'sine',
        duration: 0.18,
        gain: 0.11,
      });
      this.triggerVoice({
        freq: 440,
        endFreq: 880,
        wave: 'pulse12',
        duration: 0.18,
        gain: 0.075,
        delay: 0.02,
      });
      [523.25, 783.99, 1046.5].forEach((f, i) => {
        this.triggerVoice({
          freq: f,
          endFreq: f * 1.02,
          wave: i === 1 ? 'triangle' : 'sine',
          duration: 0.2,
          gain: 0.088,
          delay: 0.1 + i * 0.025,
        });
      });
      this.playNoise({
        duration: 0.15,
        gain: 0.12,
        filterType: 'lowpass',
        startFreq: 960,
        endFreq: 260,
        delay: 0.1,
      });
      return;
    }

    if (moveId === 'psycho_cut') {
      [0, 0.065].forEach((d, idx) => {
        this.triggerVoice({
          freq: idx === 0 ? 1046.5 : 1318.51,
          endFreq: idx === 0 ? 587.33 : 739.99,
          wave: 'pulse12',
          duration: 0.1,
          gain: 0.09,
          delay: d,
        });
        this.triggerVoice({
          freq: idx === 0 ? 783.99 : 987.77,
          endFreq: idx === 0 ? 440 : 523.25,
          wave: 'sine',
          duration: 0.12,
          gain: 0.085,
          delay: d + 0.012,
        });
      });
      this.playNoise({
        duration: 0.16,
        gain: 0.12,
        filterType: 'bandpass',
        startFreq: 1220,
        endFreq: 520,
        q: 1.8,
      });
      return;
    }

    if (moveId === 'aqua_tail') {
      this.playNoise({
        duration: 0.22,
        gain: 0.15,
        filterType: 'lowpass',
        startFreq: 1080,
        endFreq: 310,
      });
      [523.25, 659.25, 783.99, 987.77].forEach((f, i) => {
        this.triggerVoice({
          freq: f,
          endFreq: f * 1.04,
          wave: i % 2 === 0 ? 'sine' : 'pulse12',
          duration: 0.1,
          gain: 0.082,
          delay: i * 0.036,
        });
      });
      this.playPhysicalImpact(64);
      return;
    }

    if (moveId === 'draco_meteor') {
      [
        [1318.51, 392.0, 0],
        [1174.66, 329.63, 0.055],
        [1567.98, 440.0, 0.11],
      ].forEach(([f1, f2, d]) => {
        this.triggerVoice({
          freq: f1,
          endFreq: f2,
          wave: 'pulse12',
          duration: 0.14,
          gain: 0.085,
          delay: d,
        });
      });
      this.triggerVoice({
        freq: 196,
        endFreq: 28,
        wave: 'triangle',
        duration: 0.28,
        gain: 0.21,
        delay: 0.12,
      });
      this.playNoise({
        duration: 0.24,
        gain: 0.2,
        filterType: 'lowpass',
        startFreq: 860,
        endFreq: 110,
        q: 0.8,
        delay: 0.12,
      });
      return;
    }

    if (moveId === 'omen_wind') {
      this.triggerVoice({
        freq: 466.16,
        midFreq: 587.33,
        endFreq: 261.63,
        wave: 'sine',
        duration: 0.3,
        gain: 0.11,
      });
      [1046.5, 1318.51, 1567.98].forEach((f, i) => {
        this.triggerVoice({
          freq: f,
          endFreq: f * 0.94,
          wave: 'pulse12',
          duration: 0.12,
          gain: 0.072,
          delay: 0.03 + i * 0.045,
        });
      });
      this.playNoise({
        duration: 0.26,
        gain: 0.11,
        filterType: 'bandpass',
        startFreq: 960,
        endFreq: 340,
        q: 1.9,
        delay: 0.02,
      });
      return;
    }

    if (moveId === 'doom_desire') {
      [880.0, 1046.5, 1318.51, 1567.98].forEach((f, i) => {
        this.triggerVoice({
          freq: f,
          wave: i % 2 === 0 ? 'pulse12' : 'sine',
          duration: 0.14,
          gain: 0.08,
          delay: i * 0.04,
        });
      });
      [587.33, 880.0, 1174.66].forEach((f) => {
        this.triggerVoice({
          freq: f,
          endFreq: f * 1.01,
          wave: 'sine',
          duration: 0.28,
          gain: 0.09,
          delay: 0.16,
        });
      });
      this.triggerVoice({
        freq: 220,
        endFreq: 44,
        wave: 'triangle',
        duration: 0.26,
        gain: 0.18,
        delay: 0.16,
      });
      this.playNoise({
        duration: 0.2,
        gain: 0.13,
        filterType: 'bandpass',
        startFreq: 1120,
        endFreq: 480,
        q: 1.4,
        delay: 0.16,
      });
      return;
    }

    if (this._playSprint6MoveSfx(moveId)) {
      return;
    }
    if (this._playSprint7MoveSfx(moveId)) {
      return;
    }
    if (this.playNamedMoveSfx(moveId)) {
      return;
    }

    this.playAttackSfx(type, moveId);
  }

  playNamedMoveSfx(moveId = '') {
    const id = String(moveId || '');
    if (!id) return false;
    if (this._playSprint8MoveSfx(id)) return true;
    if (this._playSprint7MoveSfx(id)) return true;
    if (this._playSprint6MoveSfx(id)) return true;
    return false;
  }

  playAttackSfx(type = 'normal', moveId = '') {
    if (moveId && this.playNamedMoveSfx(moveId)) {
      return;
    }

    switch (type) {
      case 'fire':
        this.triggerVoice({
          freq: 240,
          endFreq: 82,
          wave: 'triangle',
          duration: 0.24,
          gain: 0.14,
        });
        [0, 0.05, 0.1, 0.16].forEach((d, idx) => {
          this.playNoise({
            duration: 0.09,
            gain: 0.15 - idx * 0.018,
            filterType: 'bandpass',
            startFreq: 420 + idx * 140,
            endFreq: 980,
            q: 1.4,
            delay: d,
          });
        });
        break;

      case 'water':
        this.playNoise({
          duration: 0.22,
          gain: 0.14,
          filterType: 'lowpass',
          startFreq: 920,
          endFreq: 300,
        });
        [
          [310, 690, 0],
          [410, 830, 0.06],
          [520, 940, 0.12],
        ].forEach(([f1, f2, d]) => {
          this.triggerVoice({
            freq: f1,
            endFreq: f2,
            wave: 'sine',
            duration: 0.11,
            gain: 0.12,
            delay: d,
          });
        });
        break;

      case 'grass':
        [523.25, 659.25, 783.99, 987.77].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 1.1,
            wave: 'pulse25',
            duration: 0.095,
            gain: 0.09,
            delay: i * 0.048,
          });
        });
        this.playNoise({
          duration: 0.15,
          gain: 0.1,
          filterType: 'bandpass',
          startFreq: 900,
          endFreq: 440,
          q: 1.2,
        });
        break;

      case 'electric':
        this.triggerVoice({
          freq: 880,
          endFreq: 420,
          wave: 'pulse12',
          duration: 0.095,
          gain: 0.095,
          delay: 0,
        });
        this.triggerVoice({
          freq: 1046.5,
          endFreq: 523.25,
          wave: 'pulse25',
          duration: 0.115,
          gain: 0.1,
          delay: 0.065,
        });
        this.playNoise({
          duration: 0.11,
          gain: 0.11,
          filterType: 'bandpass',
          startFreq: 960,
          endFreq: 580,
          q: 1.6,
          delay: 0.02,
        });
        break;

      case 'rock':
        this.triggerVoice({
          freq: 112,
          endFreq: 24,
          wave: 'triangle',
          duration: 0.18,
          gain: 0.22,
        });
        this.playNoise({
          duration: 0.18,
          gain: 0.22,
          filterType: 'lowpass',
          startFreq: 580,
          endFreq: 100,
          q: 0.7,
        });
        break;

      case 'psychic':
      case 'star':
        this.triggerVoice({
          freq: 440,
          endFreq: 880,
          wave: 'sine',
          duration: 0.22,
          gain: 0.12,
          delay: 0,
        });
        this.triggerVoice({
          freq: 659.25,
          endFreq: 987.77,
          wave: 'triangle',
          duration: 0.22,
          gain: 0.09,
          delay: 0.04,
        });
        break;

      case 'ice':
        this.playNoise({
          duration: 0.24,
          gain: 0.11,
          filterType: 'bandpass',
          startFreq: 1150,
          endFreq: 680,
          q: 1.8,
        });
        [880, 1174.66, 1318.51, 1567.98].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 1.03,
            wave: i % 2 === 0 ? 'pulse12' : 'sine',
            duration: 0.11,
            gain: 0.082,
            delay: i * 0.042,
          });
        });
        break;

      case 'ghost':
        this.triggerVoice({
          freq: 370,
          midFreq: 493.88,
          endFreq: 233.08,
          wave: 'sine',
          duration: 0.28,
          gain: 0.12,
        });
        this.triggerVoice({
          freq: 554.37,
          midFreq: 440,
          endFreq: 311.13,
          wave: 'pulse12',
          duration: 0.26,
          gain: 0.072,
          delay: 0.05,
        });
        this.playNoise({
          duration: 0.24,
          gain: 0.09,
          filterType: 'bandpass',
          startFreq: 640,
          endFreq: 240,
          q: 1.9,
          delay: 0.02,
        });
        break;

      case 'dragon':
        this.triggerVoice({
          freq: 146.83,
          midFreq: 293.66,
          endFreq: 440,
          wave: 'pulse25',
          duration: 0.26,
          gain: 0.105,
        });
        this.triggerVoice({
          freq: 220,
          endFreq: 587.33,
          wave: 'triangle',
          duration: 0.24,
          gain: 0.13,
          delay: 0.04,
        });
        this.playNoise({
          duration: 0.22,
          gain: 0.14,
          filterType: 'lowpass',
          startFreq: 880,
          endFreq: 220,
          q: 0.85,
        });
        break;

      case 'fighting':
        this.playPhysicalImpact(64);
        this.triggerVoice({
          freq: 220,
          endFreq: 587.33,
          wave: 'pulse25',
          duration: 0.12,
          gain: 0.095,
          delay: 0.015,
        });
        break;

      case 'flying':
        this.playNoise({
          duration: 0.22,
          gain: 0.15,
          filterType: 'bandpass',
          startFreq: 460,
          endFreq: 1180,
          q: 1.6,
        });
        this.triggerVoice({
          freq: 523.25,
          endFreq: 880,
          wave: 'triangle',
          duration: 0.16,
          gain: 0.09,
        });
        break;

      case 'poison':
        this.playNoise({
          duration: 0.22,
          gain: 0.13,
          filterType: 'bandpass',
          startFreq: 840,
          endFreq: 320,
          q: 1.8,
        });
        [349.23, 311.13, 277.18].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 0.84,
            wave: i % 2 === 0 ? 'pulse12' : 'sine',
            duration: 0.11,
            gain: 0.085,
            delay: i * 0.048,
          });
        });
        break;

      case 'ground':
        this.triggerVoice({
          freq: 98,
          endFreq: 24,
          wave: 'triangle',
          duration: 0.24,
          gain: 0.21,
        });
        this.playNoise({
          duration: 0.22,
          gain: 0.2,
          filterType: 'lowpass',
          startFreq: 560,
          endFreq: 85,
          q: 0.75,
        });
        break;

      case 'bug':
        [659.25, 783.99, 659.25, 880].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 1.08,
            wave: 'pulse12',
            duration: 0.075,
            gain: 0.08,
            delay: i * 0.04,
          });
        });
        this.playNoise({
          duration: 0.16,
          gain: 0.1,
          filterType: 'bandpass',
          startFreq: 1150,
          endFreq: 680,
          q: 1.7,
        });
        break;

      case 'steel':
        this.triggerVoice({
          freq: 987.77,
          endFreq: 880,
          wave: 'pulse12',
          duration: 0.14,
          gain: 0.085,
        });
        this.triggerVoice({
          freq: 1479.98,
          endFreq: 1318.51,
          wave: 'sine',
          duration: 0.18,
          gain: 0.08,
          delay: 0.015,
        });
        this.playPhysicalImpact(58);
        break;

      case 'dark':
        this.triggerVoice({
          freq: 293.66,
          midFreq: 246.94,
          endFreq: 164.81,
          wave: 'pulse12',
          duration: 0.24,
          gain: 0.095,
        });
        this.triggerVoice({
          freq: 220,
          endFreq: 130.81,
          wave: 'sine',
          duration: 0.26,
          gain: 0.11,
          delay: 0.03,
        });
        this.playNoise({
          duration: 0.2,
          gain: 0.11,
          filterType: 'bandpass',
          startFreq: 720,
          endFreq: 210,
          q: 1.9,
        });
        break;

      case 'fairy':
        [659.25, 830.61, 987.77, 1318.51].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 1.03,
            wave: i % 2 === 0 ? 'sine' : 'pulse12',
            duration: 0.14,
            gain: 0.082,
            delay: i * 0.042,
          });
        });
        break;

      case 'wind':
        this.playNoise({
          duration: 0.22,
          gain: 0.16,
          filterType: 'bandpass',
          startFreq: 380,
          endFreq: 940,
          q: 1.5,
        });
        this.triggerVoice({
          freq: 493.88,
          endFreq: 739.99,
          wave: 'triangle',
          duration: 0.16,
          gain: 0.09,
        });
        break;

      case 'heal':
        this.playHealChime();
        break;

      case 'buff':
        this.playBuffChime();
        break;

      case 'shield':
        this.playShieldChime();
        break;

      default:
        this.playPhysicalImpact(45);
        break;
    }
  }

  playPokeballThrow() {
    this.triggerVoice({
      freq: 300,
      endFreq: 720,
      wave: 'sine',
      duration: 0.18,
      gain: 0.13,
    });
    this.triggerVoice({
      freq: 450,
      endFreq: 880,
      wave: 'triangle',
      duration: 0.14,
      gain: 0.07,
      delay: 0.03,
    });
  }

  playPokeballAbsorb() {
    this.triggerVoice({
      freq: 760,
      endFreq: 310,
      wave: 'triangle',
      duration: 0.22,
      gain: 0.11,
    });
    this.triggerVoice({
      freq: 520,
      endFreq: 240,
      wave: 'sine',
      duration: 0.22,
      gain: 0.1,
      delay: 0.02,
    });
  }

  playPokeballBounce(bounceIdx = 0) {
    const scale = Math.pow(0.68, Math.max(0, bounceIdx));
    this.triggerVoice({
      freq: 820,
      endFreq: 360,
      wave: 'triangle',
      duration: 0.055,
      attack: 0.003,
      decay: 0.02,
      sustain: 0.2,
      gain: 0.105 * scale,
    });
    this.triggerVoice({
      freq: 165,
      endFreq: 68,
      wave: 'sine',
      duration: 0.075,
      attack: 0.003,
      gain: 0.13 * scale,
    });
    this.playNoise({
      duration: 0.04,
      gain: 0.08 * scale,
      filterType: 'lowpass',
      startFreq: 860,
      endFreq: 340,
      q: 0.8,
    });
  }

  playPokeballWobble(step = 1) {
    const base = 240 + (step % 2) * 28;
    this.triggerVoice({
      freq: base,
      midFreq: base * 1.38,
      endFreq: base * 0.9,
      wave: 'triangle',
      duration: 0.13,
      attack: 0.008,
      sustain: 0.35,
      gain: 0.11,
    });
    this.triggerVoice({
      freq: base * 1.5,
      endFreq: base * 1.12,
      wave: 'sine',
      duration: 0.1,
      gain: 0.075,
      delay: 0.03,
    });
  }

  playBreakout() {
    this.playNoise({
      duration: 0.14,
      gain: 0.16,
      filterType: 'lowpass',
      startFreq: 860,
      endFreq: 280,
      q: 0.9,
    });
    this.triggerVoice({
      freq: 460,
      endFreq: 210,
      wave: 'triangle',
      duration: 0.18,
      gain: 0.13,
    });
  }

  playCaptureSuccess() {
    const lockTones = [523.25, 659.25, 783.99];
    lockTones.forEach((freq, i) => {
      this.triggerVoice({
        freq,
        wave: 'pulse25',
        duration: 0.14,
        gain: 0.095,
        delay: i * 0.11,
      });
    });

    const chordDelay = 0.34;
    [261.63, 523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      this.triggerVoice({
        freq,
        wave: i === 4 ? 'pulse25' : i === 0 ? 'triangle' : 'sine',
        duration: 0.48,
        attack: 0.015,
        decay: 0.1,
        sustain: 0.55,
        gain: i === 0 ? 0.11 : 0.085,
        delay: chordDelay,
      });
    });

    // Warm celebratory sparkle harmonic tail
    [
      { freq: C6, delay: 0.56, dur: 0.24, gain: 0.062 },
      { freq: E6, delay: 0.64, dur: 0.3, gain: 0.064 },
      { freq: 1567.98, delay: 0.72, dur: 0.38, gain: 0.056 },
    ].forEach((tail) => {
      this.triggerVoice({
        freq: tail.freq,
        wave: 'sine',
        duration: tail.dur,
        attack: 0.014,
        decay: 0.08,
        sustain: 0.48,
        gain: tail.gain,
        delay: tail.delay,
      });
    });
  }

  playLevelUp() {
    const lead = [523.25, 659.25, 783.99, 1046.5];
    const harmony = [329.63, 392.0, 523.25, 659.25];
    lead.forEach((freq, i) => {
      const isLast = i === lead.length - 1;
      const delay = i * 0.095;
      const dur = isLast ? 0.38 : 0.12;
      this.triggerVoice({
        freq,
        wave: 'pulse25',
        duration: dur,
        gain: 0.095,
        delay,
      });
      this.triggerVoice({
        freq: harmony[i],
        wave: 'triangle',
        duration: dur,
        gain: 0.085,
        delay,
      });
    });
    this.triggerVoice({
      freq: 261.63,
      wave: 'triangle',
      duration: 0.42,
      gain: 0.11,
      delay: 0.285,
    });

    // Radiant ascending harmonic tail resolve
    [
      { freq: G5, delay: 0.42, dur: 0.24, gain: 0.058 },
      { freq: C6, delay: 0.48, dur: 0.30, gain: 0.064 },
      { freq: E6, delay: 0.54, dur: 0.36, gain: 0.056 },
    ].forEach((tail) => {
      this.triggerVoice({
        freq: tail.freq,
        wave: 'sine',
        duration: tail.dur,
        attack: 0.012,
        decay: 0.07,
        sustain: 0.48,
        gain: tail.gain,
        delay: tail.delay,
      });
    });
  }

  playHealChime() {
    const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
    notes.forEach((n, i) => {
      this.triggerVoice({
        freq: n,
        wave: 'sine',
        duration: 0.2,
        gain: 0.12,
        delay: i * 0.085,
      });
      this.triggerVoice({
        freq: n * 0.5,
        wave: 'triangle',
        duration: 0.2,
        gain: 0.065,
        delay: i * 0.085,
      });
    });
  }

  playBadgeFanfare() {
    const lead = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    const harmony = [329.63, 392.0, 523.25, 659.25, 783.99];
    lead.forEach((freq, i) => {
      const isLast = i === lead.length - 1;
      const delay = i * 0.1;
      const dur = isLast ? 0.46 : 0.13;
      this.triggerVoice({
        freq,
        wave: 'pulse25',
        duration: dur,
        gain: 0.1,
        delay,
      });
      this.triggerVoice({
        freq: harmony[i],
        wave: 'triangle',
        duration: dur,
        gain: 0.08,
        delay,
      });
    });

    // Regal triumphant resolution chord tail
    [
      { freq: C4, wave: 'triangle', delay: 0.52, dur: 0.48, gain: 0.085 },
      { freq: G5, wave: 'sine', delay: 0.54, dur: 0.42, gain: 0.062 },
      { freq: C6, wave: 'sine', delay: 0.58, dur: 0.44, gain: 0.065 },
      { freq: 1567.98, wave: 'sine', delay: 0.62, dur: 0.46, gain: 0.056 },
    ].forEach((tail) => {
      this.triggerVoice({
        freq: tail.freq,
        wave: tail.wave,
        duration: tail.dur,
        attack: 0.015,
        decay: 0.09,
        sustain: 0.52,
        gain: tail.gain,
        delay: tail.delay,
      });
    });
  }

  playHoldTick(progress) {
    const safeProgress = Number.isFinite(Number(progress))
      ? Math.max(0, Math.min(1, Number(progress)))
      : 0;
    const freq = 310 + Math.round(safeProgress * 440);
    this.triggerVoice({
      freq,
      wave: 'sine',
      duration: 0.06,
      gain: 0.075,
    });
  }

  playWindup(type = 'normal') {
    const highSweep = type === 'psychic'
      || type === 'ice'
      || type === 'electric'
      || type === 'ghost'
      || type === 'fairy'
      || type === 'flying'
      || type === 'bug'
      || type === 'steel';
    const startFreq = highSweep ? 320 : (type === 'ground' || type === 'fighting' ? 160 : 190);
    const endFreq = highSweep ? 680 : (type === 'dark' || type === 'poison' ? 280 : 390);
    this.triggerVoice({
      freq: startFreq,
      endFreq,
      wave: type === 'ghost' || type === 'fairy' || type === 'dark' ? 'sine' : 'triangle',
      duration: 0.15,
      attack: 0.015,
      decay: 0.04,
      sustain: 0.45,
      gain: 0.075,
    });
  }

  playHitStop() {
    this.triggerVoice({
      freq: 92,
      endFreq: 28,
      wave: 'sine',
      duration: 0.085,
      attack: 0.002,
      decay: 0.03,
      sustain: 0.2,
      gain: 0.22,
    });
    this.playNoise({
      duration: 0.045,
      gain: 0.14,
      filterType: 'lowpass',
      startFreq: 420,
      endFreq: 90,
      q: 0.7,
      attack: 0.002,
    });
  }

  playBuffChime() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      this.triggerVoice({
        freq: f,
        wave: 'pulse25',
        duration: i === notes.length - 1 ? 0.22 : 0.085,
        gain: 0.08,
        delay: i * 0.055,
      });
      this.triggerVoice({
        freq: f * 0.5,
        wave: 'triangle',
        duration: 0.14,
        gain: 0.06,
        delay: i * 0.055,
      });
    });
  }

  playShieldChime() {
    const notes = [587.33, 880.0, 1174.66];
    notes.forEach((f, i) => {
      this.triggerVoice({
        freq: f,
        wave: 'sine',
        duration: 0.24,
        attack: 0.008,
        sustain: 0.5,
        gain: 0.105,
        delay: i * 0.06,
      });
      this.triggerVoice({
        freq: f * 0.5,
        wave: 'triangle',
        duration: 0.2,
        gain: 0.06,
        delay: i * 0.06,
      });
    });
  }

  playComposureBrace() {
    // Crisp, gentle defensive brace cue: grounded low-mid guard thump + crystalline fifth shimmer
    this.triggerVoice({
      freq: 220.0,
      endFreq: 146.83,
      wave: 'triangle',
      duration: 0.085,
      attack: 0.004,
      sustain: 0.35,
      gain: 0.09,
    });
    const notes = [523.25, 783.99];
    notes.forEach((f, i) => {
      this.triggerVoice({
        freq: f,
        wave: 'sine',
        duration: 0.17,
        attack: 0.006,
        sustain: 0.42,
        gain: i === 0 ? 0.085 : 0.072,
        delay: 0.035 + i * 0.052,
      });
      this.triggerVoice({
        freq: f * 0.5,
        wave: 'triangle',
        duration: 0.14,
        gain: 0.045,
        delay: 0.035 + i * 0.052,
      });
    });
  }

  playShinySparkle() {
    const notes = [659.25, 783.99, 987.77, 1318.51, 1567.98];
    notes.forEach((f, i) => {
      this.triggerVoice({
        freq: f,
        wave: i % 2 === 0 ? 'pulse12' : 'sine',
        duration: 0.14,
        attack: 0.004,
        sustain: 0.45,
        gain: 0.085,
        delay: i * 0.058,
      });
    });
  }

  playEvolutionStart() {
    const pulse = [293.66, 349.23, 440.0, 523.25, 659.25, 783.99];
    pulse.forEach((f, i) => {
      this.triggerVoice({
        freq: f,
        endFreq: f * 1.04,
        wave: 'pulse25',
        duration: 0.14,
        attack: 0.01,
        sustain: 0.55,
        gain: 0.08,
        delay: i * 0.11,
      });
      this.triggerVoice({
        freq: f * 0.5,
        wave: 'triangle',
        duration: 0.16,
        gain: 0.07,
        delay: i * 0.11,
      });
    });
  }

  playEvolutionFanfare() {
    const lead = [523.25, 659.25, 783.99, 1046.5, 987.77, 1046.5, 1318.51];
    const timings = [0, 0.09, 0.18, 0.27, 0.40, 0.49, 0.60];
    const durs = [0.09, 0.09, 0.09, 0.13, 0.09, 0.11, 0.50];
    lead.forEach((f, i) => {
      this.triggerVoice({
        freq: f,
        wave: 'pulse25',
        duration: durs[i],
        attack: 0.006,
        sustain: 0.58,
        gain: 0.095,
        delay: timings[i],
      });
      this.triggerVoice({
        freq: f * 0.5,
        wave: 'triangle',
        duration: durs[i],
        gain: 0.085,
        delay: timings[i],
      });
    });
    [261.63, 392.0, 523.25].forEach((f) => {
      this.triggerVoice({
        freq: f,
        wave: 'sine',
        duration: 0.52,
        gain: 0.08,
        delay: 0.60,
      });
    });
  }

  playXpTick(progress = 0.5) {
    const p = Math.max(0, Math.min(1, Number.isFinite(Number(progress)) ? Number(progress) : 0.5));
    const freq = 420 + p * 640;
    this.triggerVoice({
      freq,
      endFreq: freq * 1.06,
      wave: 'pulse25',
      duration: 0.048,
      attack: 0.002,
      decay: 0.018,
      sustain: 0.3,
      gain: 0.06,
    });
  }

  playStarBallShimmer() {
    const notes = [783.99, 987.77, 1174.66, 1567.98, 1975.53];
    notes.forEach((freq, i) => {
      this.triggerVoice({
        freq,
        endFreq: freq * 1.03,
        wave: i % 2 === 0 ? 'pulse12' : 'sine',
        duration: 0.16,
        attack: 0.004,
        decay: 0.04,
        sustain: 0.45,
        gain: 0.08,
        delay: i * 0.048,
      });
    });
    this.triggerVoice({
      freq: 392.0,
      endFreq: 783.99,
      wave: 'triangle',
      duration: 0.28,
      gain: 0.085,
      delay: 0.02,
    });
  }

  playUpgradeFanfare() {
    const lead = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.51, 1567.98];
    lead.forEach((freq, i) => {
      const isFinal = i === lead.length - 1;
      const delay = i * 0.068;
      const duration = isFinal ? 0.42 : 0.14;
      this.triggerVoice({
        freq,
        endFreq: freq * 1.015,
        wave: i % 2 === 0 ? 'sine' : 'pulse12',
        duration,
        attack: 0.005,
        decay: 0.04,
        sustain: 0.52,
        gain: isFinal ? 0.095 : 0.082,
        delay,
      });
      this.triggerVoice({
        freq: freq * 0.5,
        wave: 'triangle',
        duration,
        gain: isFinal ? 0.095 : 0.062,
        delay,
      });
    });
    [523.25, 783.99, 1046.5].forEach((freq) => {
      this.triggerVoice({
        freq,
        wave: 'sine',
        duration: 0.48,
        attack: 0.01,
        sustain: 0.55,
        gain: 0.075,
        delay: 0.408,
      });
    });
  }

  playBuddyCheer() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const isLast = i === notes.length - 1;
      const delay = i * 0.068;
      this.triggerVoice({
        freq,
        endFreq: freq * 1.02,
        wave: i % 2 === 0 ? 'sine' : 'pulse25',
        duration: isLast ? 0.34 : 0.14,
        attack: 0.006,
        sustain: 0.52,
        gain: isLast ? 0.105 : 0.088,
        delay,
      });
      this.triggerVoice({
        freq: freq * 0.5,
        wave: 'triangle',
        duration: isLast ? 0.3 : 0.13,
        gain: 0.065,
        delay,
      });
    });
  }

  playBuddyEndure() {
    this.triggerVoice({
      freq: 146.83,
      endFreq: 82.41,
      wave: 'triangle',
      duration: 0.12,
      attack: 0.004,
      sustain: 0.4,
      gain: 0.13,
    });
    const resolveNotes = [440.0, 554.37, 659.25, 880.0, 1108.73];
    resolveNotes.forEach((freq, i) => {
      const isLast = i === resolveNotes.length - 1;
      const delay = 0.07 + i * 0.062;
      this.triggerVoice({
        freq,
        endFreq: freq * 1.015,
        wave: i % 2 === 0 ? 'sine' : 'pulse25',
        duration: isLast ? 0.38 : 0.15,
        attack: 0.006,
        sustain: 0.55,
        gain: isLast ? 0.105 : 0.088,
        delay,
      });
      this.triggerVoice({
        freq: freq * 0.5,
        wave: 'triangle',
        duration: isLast ? 0.34 : 0.14,
        gain: 0.062,
        delay,
      });
    });
  }

  playChestFanfare() {
    // Bright shimmering treasure arpeggio
    const arp = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98];
    arp.forEach((freq, i) => {
      const isLast = i === arp.length - 1;
      const delay = i * 0.058;
      this.triggerVoice({
        freq,
        endFreq: freq * 1.015,
        wave: i % 2 === 0 ? 'pulse12' : 'sine',
        duration: isLast ? 0.42 : 0.13,
        attack: 0.004,
        decay: 0.035,
        sustain: 0.55,
        gain: isLast ? 0.105 : 0.088,
        delay,
      });
      this.triggerVoice({
        freq: freq * 0.5,
        wave: 'triangle',
        duration: isLast ? 0.38 : 0.12,
        gain: 0.06,
        delay,
      });
    });
    [523.25, 783.99, 1046.5].forEach((freq) => {
      this.triggerVoice({
        freq,
        wave: 'sine',
        duration: 0.44,
        attack: 0.01,
        sustain: 0.52,
        gain: 0.072,
        delay: 0.29,
      });
    });
    // Shimmering treasure bell tail
    [
      { freq: 1318.51, delay: 0.46, dur: 0.28, gain: 0.056 },
      { freq: 1567.98, delay: 0.53, dur: 0.34, gain: 0.058 },
      { freq: 2093.0, delay: 0.60, dur: 0.40, gain: 0.048 },
    ].forEach((tail) => {
      this.triggerVoice({
        freq: tail.freq,
        wave: 'sine',
        duration: tail.dur,
        attack: 0.012,
        decay: 0.08,
        sustain: 0.46,
        gain: tail.gain,
        delay: tail.delay,
      });
    });
  }

  playQuestCompleteFanfare() {
    // Warm uplifting hero chord fanfare
    const lead = [392.0, 523.25, 659.25, 783.99, 1046.5, 1318.51];
    const timings = [0, 0.075, 0.15, 0.225, 0.31, 0.41];
    const durs = [0.11, 0.11, 0.11, 0.13, 0.15, 0.46];
    lead.forEach((freq, i) => {
      this.triggerVoice({
        freq,
        endFreq: freq * 1.01,
        wave: i >= 4 ? 'pulse25' : 'triangle',
        duration: durs[i],
        attack: 0.005,
        decay: 0.04,
        sustain: 0.58,
        gain: i === lead.length - 1 ? 0.105 : 0.09,
        delay: timings[i],
      });
    });
    [261.63, 392.0, 523.25, 659.25].forEach((freq, i) => {
      this.triggerVoice({
        freq,
        wave: i === 0 ? 'triangle' : 'sine',
        duration: 0.5,
        attack: 0.012,
        sustain: 0.55,
        gain: 0.078,
        delay: 0.41,
      });
    });
    // Heroic radiant tail sparkle
    [
      { freq: G5, delay: 0.57, dur: 0.26, gain: 0.056 },
      { freq: C6, delay: 0.64, dur: 0.32, gain: 0.062 },
      { freq: E6, delay: 0.71, dur: 0.38, gain: 0.058 },
      { freq: 1567.98, delay: 0.78, dur: 0.42, gain: 0.05 },
    ].forEach((tail) => {
      this.triggerVoice({
        freq: tail.freq,
        wave: 'sine',
        duration: tail.dur,
        attack: 0.014,
        decay: 0.08,
        sustain: 0.48,
        gain: tail.gain,
        delay: tail.delay,
      });
    });
  }

  playArcadeUnlockFanfare() {
    // Cosmic secret discovery chime
    this.playNoise({
      duration: 0.28,
      gain: 0.09,
      filterType: 'bandpass',
      startFreq: 680,
      endFreq: 1620,
      q: 1.5,
    });
    const cosmic = [440.0, 554.37, 659.25, 880.0, 1108.73, 1318.51, 1760.0];
    cosmic.forEach((freq, i) => {
      const isLast = i === cosmic.length - 1;
      const delay = i * 0.062;
      this.triggerVoice({
        freq,
        endFreq: freq * 1.025,
        wave: i % 2 === 0 ? 'pulse12' : 'sine',
        duration: isLast ? 0.48 : 0.15,
        attack: 0.005,
        decay: 0.04,
        sustain: 0.56,
        gain: isLast ? 0.1 : 0.082,
        delay,
      });
      if (i % 2 === 0) {
        this.triggerVoice({
          freq: freq * 0.5,
          wave: 'triangle',
          duration: isLast ? 0.42 : 0.14,
          gain: 0.058,
          delay,
        });
      }
    });
  }

  playArcadeStar(combo = 1) {
    // Ascending combo pitch star chime
    const safeCombo = Math.max(1, Math.min(16, Math.round(Number(combo) || 1)));
    const scale = [
      523.25, 587.33, 659.25, 783.99, 880.0,
      1046.5, 1174.66, 1318.51, 1567.98, 1760.0,
    ];
    const baseFreq = scale[Math.min(scale.length - 1, safeCombo - 1)];
    const extraSemitones = safeCombo > scale.length ? Math.min(5, safeCombo - scale.length) : 0;
    const freq = Number((baseFreq * Math.pow(2, extraSemitones / 12)).toFixed(2));
    this.triggerVoice({
      freq,
      endFreq: Math.min(2400, freq * 1.24),
      wave: 'pulse12',
      duration: 0.11,
      attack: 0.003,
      decay: 0.03,
      sustain: 0.45,
      gain: 0.088,
    });
    this.triggerVoice({
      freq: Math.min(2600, freq * 1.5),
      wave: 'sine',
      duration: 0.14,
      attack: 0.004,
      sustain: 0.4,
      gain: 0.068,
      delay: 0.032,
    });
  }

  playArcadeBoost() {
    // Punchy star-dash whoosh chime
    this.playNoise({
      duration: 0.2,
      gain: 0.14,
      filterType: 'bandpass',
      startFreq: 480,
      endFreq: 1280,
      q: 1.4,
    });
    this.triggerVoice({
      freq: 329.63,
      midFreq: 659.25,
      endFreq: 1318.51,
      wave: 'pulse25',
      duration: 0.18,
      attack: 0.003,
      decay: 0.05,
      sustain: 0.48,
      gain: 0.095,
    });
    this.triggerVoice({
      freq: 220.0,
      endFreq: 440.0,
      wave: 'triangle',
      duration: 0.16,
      gain: 0.08,
      delay: 0.02,
    });
  }

  playArcadeBump() {
    // Soft non-jarring shield bump
    this.triggerVoice({
      freq: 185,
      endFreq: 88,
      wave: 'triangle',
      duration: 0.11,
      attack: 0.003,
      decay: 0.04,
      sustain: 0.25,
      gain: 0.12,
    });
    this.playNoise({
      duration: 0.075,
      gain: 0.085,
      filterType: 'lowpass',
      startFreq: 380,
      endFreq: 120,
      q: 0.7,
      attack: 0.002,
    });
  }

  _normalizeWarpPhase(options = {}) {
    const rawPhase = options && typeof options === 'object' ? options.phase : undefined;
    const normPhase = typeof rawPhase === 'string' ? rawPhase.trim().toLowerCase() : '';
    return normPhase === 'depart' || normPhase === 'arrive' || normPhase === 'full'
      ? normPhase
      : 'full';
  }

  /**
   * Procedural Starlight Warp Teleport cue (`'depart' | 'arrive' | 'full'`).
   * Delegates to `playSafeRecall` when `options.mode === 'safe'`.
   * Schedules purely via Web Audio (`triggerVoice` + `playNoise`) with zero timers or leaked nodes.
   */
  playWarpTeleport(options = {}) {
    const rawMode = options && typeof options === 'object' ? options.mode : undefined;
    const normMode = typeof rawMode === 'string' ? rawMode.trim().toLowerCase() : '';
    if (normMode === 'safe') {
      return this.playSafeRecall(options);
    }

    const phase = this._normalizeWarpPhase(options);

    if (this.muted) {
      return { played: false, muted: true, phase };
    }

    let firstVoice = null;
    const captureFirst = (voice) => {
      if (!firstVoice && voice) {
        firstVoice = voice;
      }
    };

    if (phase === 'depart' || phase === 'full') {
      // Shimmering ascending Starlight arpeggio + gentle upward bandpass whoosh
      const departArp = [E4, G4, B4, D5, Fs5, A5, B5];
      departArp.forEach((freq, i) => {
        const isPulse = i % 2 === 0;
        captureFirst(this.triggerVoice({
          freq,
          endFreq: freq * 1.018,
          wave: isPulse ? 'pulse12' : 'sine',
          duration: 0.095 + i * 0.006,
          attack: 0.003,
          decay: 0.028,
          sustain: 0.42,
          gain: isPulse ? 0.068 : 0.074,
          delay: i * 0.025,
        }));
      });

      this.playNoise({
        duration: 0.2,
        gain: 0.085,
        filterType: 'bandpass',
        startFreq: 360,
        endFreq: 1650,
        q: 1.5,
        attack: 0.012,
        delay: 0,
      });
    }

    if (phase === 'arrive' || phase === 'full') {
      // Warm landing celestial chord chime + soft sparkle high-bell harmonic
      const arriveDelay = phase === 'full' ? 0.18 : 0;
      const arriveChord = [
        { freq: G4, wave: 'triangle', duration: 0.28, gain: 0.084, offset: 0 },
        { freq: B4, wave: 'sine', duration: 0.28, gain: 0.072, offset: 0.014 },
        { freq: D5, wave: 'triangle', duration: 0.3, gain: 0.068, offset: 0.028 },
        { freq: G5, wave: 'sine', duration: 0.34, gain: 0.08, offset: 0.042 },
      ];
      arriveChord.forEach(({ freq, wave, duration, gain, offset }) => {
        captureFirst(this.triggerVoice({
          freq,
          endFreq: freq * 1.008,
          wave,
          duration,
          attack: 0.005,
          decay: 0.065,
          sustain: 0.54,
          gain,
          delay: arriveDelay + offset,
        }));
      });

      // Soft sparkle high-bell harmonic (zero ear-piercing harshness)
      this.triggerVoice({
        freq: D6,
        endFreq: D6 * 1.012,
        wave: 'sine',
        duration: 0.26,
        attack: 0.004,
        decay: 0.06,
        sustain: 0.42,
        gain: 0.048,
        delay: arriveDelay + 0.065,
      });
    }

    return {
      played: Boolean(firstVoice),
      muted: false,
      phase,
    };
  }

  /**
   * Procedural Starlight Village Safe-Zone Recall cue (`'depart' | 'arrive' | 'full'`).
   * Warm descending-homeward chime + airy breeze resolving into a cozy Cmaj9 hearth chord.
   * Schedules purely via Web Audio (`triggerVoice` + `playNoise`) with zero timers or leaked nodes.
   */
  playSafeRecall(options = {}) {
    const phase = this._normalizeWarpPhase(options);

    if (this.muted) {
      return { played: false, muted: true, phase, mode: 'safe' };
    }

    let firstVoice = null;
    const captureFirst = (voice) => {
      if (!firstVoice && voice) {
        firstVoice = voice;
      }
    };

    if (phase === 'depart' || phase === 'full') {
      // Gentle descending-homeward chime (G5, E5, D5, B4, G4) + soft airy bandpass breeze
      const departChime = [G5, E5, D5, B4, G4];
      departChime.forEach((freq, i) => {
        const isSine = i % 2 === 0;
        captureFirst(this.triggerVoice({
          freq,
          wave: isSine ? 'sine' : 'triangle',
          duration: 0.12 + i * 0.012,
          attack: 0.005,
          decay: 0.04,
          sustain: 0.48,
          gain: isSine ? 0.072 : 0.068,
          delay: i * 0.028,
        }));
      });

      captureFirst(this.playNoise({
        duration: 0.18,
        gain: 0.065,
        filterType: 'bandpass',
        startFreq: 900,
        endFreq: 320,
        q: 1.2,
        attack: 0.014,
        delay: 0,
      }));
    }

    if (phase === 'arrive' || phase === 'full') {
      // Warm resolving C-major-9th hearth chord + soft G5 bell sparkle
      const arriveDelay = phase === 'full' ? 0.16 : 0;
      const arriveChord = [
        { freq: C4, wave: 'triangle', duration: 0.34, gain: 0.082, offset: 0 },
        { freq: E4, wave: 'sine', duration: 0.34, gain: 0.072, offset: 0.016 },
        { freq: G4, wave: 'triangle', duration: 0.34, gain: 0.068, offset: 0.032 },
        { freq: B4, wave: 'sine', duration: 0.36, gain: 0.062, offset: 0.048 },
        { freq: C5, wave: 'sine', duration: 0.38, gain: 0.076, offset: 0.064 },
      ];
      arriveChord.forEach(({ freq, wave, duration, gain, offset }) => {
        captureFirst(this.triggerVoice({
          freq,
          wave,
          duration,
          attack: 0.008,
          decay: 0.075,
          sustain: 0.56,
          gain,
          delay: arriveDelay + offset,
        }));
      });

      // Soft G5 bell sparkle
      captureFirst(this.triggerVoice({
        freq: G5,
        endFreq: G5 * 1.005,
        wave: 'sine',
        duration: 0.28,
        attack: 0.006,
        decay: 0.065,
        sustain: 0.44,
        gain: 0.048,
        delay: arriveDelay + 0.084,
      }));
    }

    return {
      played: Boolean(firstVoice),
      muted: false,
      phase,
      mode: 'safe',
    };
  }

  _playSprint6MoveSfx(moveId) {
    switch (moveId) {
      case 'frenzy_flora':
        this.playNoise({
          duration: 0.28,
          gain: 0.14,
          filterType: 'bandpass',
          startFreq: 980,
          endFreq: 380,
          q: 1.4,
        });
        [440, 554.37, 659.25, 830.61, 1108.73].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 1.08,
            wave: i % 2 === 0 ? 'pulse25' : 'triangle',
            duration: 0.12,
            gain: 0.082,
            delay: i * 0.042,
          });
        });
        this.triggerVoice({
          freq: 146.83,
          endFreq: 48,
          wave: 'triangle',
          duration: 0.22,
          gain: 0.15,
          delay: 0.14,
        });
        return true;

      case 'spore_burst':
        this.playNoise({
          duration: 0.22,
          gain: 0.1,
          filterType: 'bandpass',
          startFreq: 860,
          endFreq: 480,
          q: 1.6,
        });
        [523.25, 622.25, 783.99, 932.33, 1174.66].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 1.12,
            wave: i % 2 === 0 ? 'sine' : 'pulse12',
            duration: 0.12,
            gain: 0.078,
            delay: i * 0.04,
          });
        });
        return true;

      case 'solar_blade':
        this.triggerVoice({
          freq: 329.63,
          endFreq: 987.77,
          wave: 'pulse25',
          duration: 0.14,
          gain: 0.09,
        });
        [0.05, 0.11].forEach((d, idx) => {
          this.playNoise({
            duration: 0.11,
            gain: 0.14,
            filterType: 'bandpass',
            startFreq: idx === 0 ? 1150 : 1280,
            endFreq: 420,
            q: 1.7,
            delay: d,
          });
        });
        this.playPhysicalImpact(76);
        return true;

      case 'fiery_dance':
        [440, 523.25, 659.25, 783.99, 880].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 1.04,
            wave: i % 2 === 0 ? 'pulse25' : 'triangle',
            duration: 0.11,
            gain: 0.084,
            delay: i * 0.044,
          });
        });
        [0, 0.09].forEach((d) => {
          this.playNoise({
            duration: 0.12,
            gain: 0.13,
            filterType: 'bandpass',
            startFreq: 520,
            endFreq: 1020,
            q: 1.3,
            delay: d,
          });
        });
        return true;

      case 'hydro_vortex':
        this.playNoise({
          duration: 0.28,
          gain: 0.16,
          filterType: 'lowpass',
          startFreq: 980,
          endFreq: 240,
        });
        [
          [261.63, 523.25, 0],
          [329.63, 659.25, 0.06],
          [392.0, 783.99, 0.12],
        ].forEach(([f1, f2, d]) => {
          this.triggerVoice({
            freq: f1,
            endFreq: f2,
            wave: 'sine',
            duration: 0.12,
            gain: 0.1,
            delay: d,
          });
        });
        this.triggerVoice({
          freq: 130.81,
          endFreq: 34,
          wave: 'triangle',
          duration: 0.24,
          gain: 0.17,
          delay: 0.12,
        });
        return true;

      case 'razor_shell':
        this.triggerVoice({
          freq: 1046.5,
          endFreq: 1318.51,
          wave: 'pulse12',
          duration: 0.07,
          gain: 0.078,
        });
        this.triggerVoice({
          freq: 587.33,
          midFreq: 783.99,
          endFreq: 493.88,
          wave: 'sine',
          duration: 0.18,
          gain: 0.1,
          delay: 0.03,
        });
        this.playPhysicalImpact(66);
        return true;

      case 'plasma_cannon':
        [659.25, 987.77].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            wave: 'pulse12',
            duration: 0.06,
            gain: 0.078,
            delay: i * 0.035,
          });
        });
        this.triggerVoice({
          freq: 1174.66,
          midFreq: 659.25,
          endFreq: 293.66,
          wave: 'pulse25',
          duration: 0.24,
          gain: 0.1,
          delay: 0.07,
        });
        this.triggerVoice({
          freq: 146.83,
          endFreq: 32,
          wave: 'triangle',
          duration: 0.22,
          gain: 0.18,
          delay: 0.1,
        });
        this.playNoise({
          duration: 0.18,
          gain: 0.14,
          filterType: 'bandpass',
          startFreq: 1080,
          endFreq: 280,
          q: 1.5,
          delay: 0.07,
        });
        return true;

      case 'volt_tackle':
        this.triggerVoice({
          freq: 293.66,
          endFreq: 1174.66,
          wave: 'pulse12',
          duration: 0.15,
          gain: 0.09,
        });
        this.playPhysicalImpact(72);
        [1046.5, 1318.51, 880.0].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 0.62,
            wave: i % 2 === 0 ? 'pulse12' : 'pulse25',
            duration: 0.095,
            gain: 0.085,
            delay: 0.07 + i * 0.038,
          });
        });
        return true;

      case 'sandstorm_crush':
        this.playNoise({
          duration: 0.26,
          gain: 0.16,
          filterType: 'bandpass',
          startFreq: 720,
          endFreq: 340,
          q: 1.2,
        });
        [118, 98].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: 24,
            wave: 'triangle',
            duration: 0.18,
            gain: 0.2,
            delay: 0.04 + i * 0.075,
          });
        });
        this.playNoise({
          duration: 0.2,
          gain: 0.2,
          filterType: 'lowpass',
          startFreq: 660,
          endFreq: 95,
          q: 0.7,
          delay: 0.08,
        });
        return true;

      case 'prism_laser':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            wave: i % 2 === 0 ? 'sine' : 'pulse12',
            duration: 0.12,
            gain: 0.075,
            delay: i * 0.025,
          });
        });
        this.triggerVoice({
          freq: 880,
          midFreq: 1318.51,
          endFreq: 659.25,
          wave: 'sine',
          duration: 0.24,
          gain: 0.11,
          delay: 0.06,
        });
        this.playNoise({
          duration: 0.18,
          gain: 0.1,
          filterType: 'bandpass',
          startFreq: 1200,
          endFreq: 620,
          q: 2.0,
          delay: 0.08,
        });
        return true;

      case 'zen_meteor':
        this.triggerVoice({
          freq: 392.0,
          endFreq: 783.99,
          wave: 'sine',
          duration: 0.16,
          gain: 0.105,
        });
        this.triggerVoice({
          freq: 175,
          endFreq: 32,
          wave: 'triangle',
          duration: 0.24,
          gain: 0.2,
          delay: 0.09,
        });
        this.triggerVoice({
          freq: 987.77,
          endFreq: 659.25,
          wave: 'sine',
          duration: 0.18,
          gain: 0.085,
          delay: 0.11,
        });
        this.playNoise({
          duration: 0.18,
          gain: 0.17,
          filterType: 'lowpass',
          startFreq: 760,
          endFreq: 110,
          delay: 0.09,
        });
        return true;

      case 'icicle_spear':
        this.triggerVoice({
          freq: 1174.66,
          wave: 'sine',
          duration: 0.08,
          gain: 0.075,
        });
        [987.77, 1174.66, 1318.51].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 0.76,
            wave: i % 2 === 0 ? 'pulse12' : 'sine',
            duration: 0.085,
            gain: 0.082,
            delay: 0.03 + i * 0.055,
          });
        });
        this.playNoise({
          duration: 0.2,
          gain: 0.12,
          filterType: 'bandpass',
          startFreq: 1220,
          endFreq: 560,
          q: 1.8,
          delay: 0.08,
        });
        return true;

      case 'spectral_lantern':
        this.triggerVoice({
          freq: 349.23,
          midFreq: 523.25,
          endFreq: 246.94,
          wave: 'sine',
          duration: 0.3,
          gain: 0.11,
        });
        [622.25, 466.16, 739.99].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 0.88,
            wave: 'pulse12',
            duration: 0.13,
            gain: 0.072,
            delay: 0.04 + i * 0.06,
          });
        });
        this.playNoise({
          duration: 0.24,
          gain: 0.095,
          filterType: 'bandpass',
          startFreq: 680,
          endFreq: 240,
          q: 2.0,
        });
        return true;

      case 'night_daze':
        this.triggerVoice({
          freq: 293.66,
          midFreq: 440.0,
          endFreq: 196.0,
          wave: 'sine',
          duration: 0.28,
          gain: 0.115,
        });
        [659.25, 493.88, 392.0].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 0.82,
            wave: 'pulse12',
            duration: 0.12,
            gain: 0.078,
            delay: 0.04 + i * 0.052,
          });
        });
        this.playNoise({
          duration: 0.22,
          gain: 0.12,
          filterType: 'bandpass',
          startFreq: 940,
          endFreq: 260,
          q: 1.7,
          delay: 0.05,
        });
        return true;

      case 'dragon_rush':
        this.triggerVoice({
          freq: 196.0,
          endFreq: 587.33,
          wave: 'pulse25',
          duration: 0.18,
          gain: 0.095,
        });
        this.playNoise({
          duration: 0.22,
          gain: 0.15,
          filterType: 'bandpass',
          startFreq: 440,
          endFreq: 1050,
          q: 1.2,
        });
        this.triggerVoice({
          freq: 135,
          endFreq: 28,
          wave: 'triangle',
          duration: 0.26,
          gain: 0.2,
          delay: 0.08,
        });
        [293.66, 440.0].forEach((f) => {
          this.triggerVoice({
            freq: f,
            wave: 'pulse25',
            duration: 0.2,
            gain: 0.075,
            delay: 0.1,
          });
        });
        return true;

      case 'dune_aegis':
        [220.0, 329.63].forEach((f) => {
          this.triggerVoice({
            freq: f,
            wave: 'triangle',
            duration: 0.22,
            gain: 0.085,
          });
        });
        [587.33, 739.99, 880.0, 1174.66].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            wave: 'sine',
            duration: 0.22,
            attack: 0.008,
            sustain: 0.5,
            gain: 0.092,
            delay: i * 0.048,
          });
        });
        this.playNoise({
          duration: 0.16,
          gain: 0.08,
          filterType: 'bandpass',
          startFreq: 920,
          endFreq: 480,
          q: 1.4,
        });
        return true;

      default:
        return false;
    }
  }

  _playSprint7MoveSfx(moveId) {
    switch (moveId) {
      case 'thorn_barrage':
        this.playNoise({
          duration: 0.22,
          gain: 0.13,
          filterType: 'bandpass',
          startFreq: 1120,
          endFreq: 420,
          q: 1.5,
        });
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 0.85,
            wave: i % 2 === 0 ? 'pulse25' : 'triangle',
            duration: 0.09,
            gain: 0.08,
            delay: i * 0.036,
          });
        });
        this.playPhysicalImpact(64);
        return true;

      case 'jungle_totem':
        [392.0, 493.88, 587.33, 783.99, 987.77].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            wave: i % 2 === 0 ? 'triangle' : 'sine',
            duration: 0.16,
            attack: 0.008,
            sustain: 0.52,
            gain: 0.088,
            delay: i * 0.045,
          });
        });
        this.playNoise({
          duration: 0.18,
          gain: 0.08,
          filterType: 'bandpass',
          startFreq: 760,
          endFreq: 420,
          q: 1.2,
        });
        return true;

      case 'inferno_overdrive':
        this.triggerVoice({
          freq: 220.0,
          midFreq: 523.25,
          endFreq: 880.0,
          wave: 'pulse25',
          duration: 0.22,
          gain: 0.095,
        });
        [0, 0.06, 0.12].forEach((d, idx) => {
          this.playNoise({
            duration: 0.14,
            gain: 0.15 - idx * 0.02,
            filterType: 'bandpass',
            startFreq: 520 + idx * 180,
            endFreq: 1100,
            q: 1.3,
            delay: d,
          });
        });
        this.triggerVoice({
          freq: 130.81,
          endFreq: 34,
          wave: 'triangle',
          duration: 0.24,
          gain: 0.18,
          delay: 0.08,
        });
        return true;

      case 'blaze_kick':
        this.playNoise({
          duration: 0.18,
          gain: 0.14,
          filterType: 'bandpass',
          startFreq: 680,
          endFreq: 1180,
          q: 1.5,
        });
        this.triggerVoice({
          freq: 349.23,
          endFreq: 783.99,
          wave: 'pulse25',
          duration: 0.13,
          gain: 0.09,
        });
        this.playPhysicalImpact(74);
        return true;

      case 'abyssal_geyser':
        this.triggerVoice({
          freq: 110.0,
          endFreq: 44.0,
          wave: 'triangle',
          duration: 0.24,
          gain: 0.18,
        });
        this.playNoise({
          duration: 0.28,
          gain: 0.16,
          filterType: 'lowpass',
          startFreq: 1020,
          endFreq: 260,
        });
        [329.63, 440.0, 587.33, 783.99].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 1.15,
            wave: 'sine',
            duration: 0.12,
            gain: 0.09,
            delay: 0.03 + i * 0.045,
          });
        });
        return true;

      case 'pearl_cascade':
        [587.33, 739.99, 880.0, 1174.66].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            wave: i % 2 === 0 ? 'sine' : 'pulse12',
            duration: 0.12,
            gain: 0.082,
            delay: i * 0.038,
          });
        });
        this.playPhysicalImpact(64);
        return true;

      case 'steppe_bolt':
        this.triggerVoice({
          freq: 1046.5,
          endFreq: 440.0,
          wave: 'pulse12',
          duration: 0.11,
          gain: 0.09,
        });
        this.triggerVoice({
          freq: 1318.51,
          endFreq: 587.33,
          wave: 'pulse25',
          duration: 0.12,
          gain: 0.088,
          delay: 0.048,
        });
        this.playPhysicalImpact(70);
        return true;

      case 'ion_tempest':
        [783.99, 1046.5, 1318.51, 987.77].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 0.68,
            wave: i % 2 === 0 ? 'pulse12' : 'pulse25',
            duration: 0.11,
            gain: 0.085,
            delay: i * 0.04,
          });
        });
        this.playNoise({
          duration: 0.22,
          gain: 0.14,
          filterType: 'bandpass',
          startFreq: 1160,
          endFreq: 320,
          q: 1.6,
          delay: 0.05,
        });
        this.triggerVoice({
          freq: 146.83,
          endFreq: 32,
          wave: 'triangle',
          duration: 0.22,
          gain: 0.17,
          delay: 0.09,
        });
        return true;

      case 'canyon_rend':
        this.playNoise({
          duration: 0.24,
          gain: 0.2,
          filterType: 'lowpass',
          startFreq: 720,
          endFreq: 110,
          q: 0.8,
        });
        [128, 96].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: 24,
            wave: 'triangle',
            duration: 0.18,
            gain: 0.21,
            delay: i * 0.08,
          });
        });
        this.triggerVoice({
          freq: 293.66,
          endFreq: 146.83,
          wave: 'pulse25',
          duration: 0.16,
          gain: 0.08,
          delay: 0.02,
        });
        return true;

      case 'amber_bastion':
        [293.66, 440.0, 587.33, 880.0, 1174.66].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            wave: i < 2 ? 'triangle' : 'sine',
            duration: 0.24,
            attack: 0.006,
            sustain: 0.52,
            gain: 0.09,
            delay: i * 0.042,
          });
        });
        return true;

      case 'chrono_cannon':
        [1046.5, 1318.51].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            wave: 'pulse12',
            duration: 0.045,
            gain: 0.075,
            delay: i * 0.05,
          });
        });
        this.triggerVoice({
          freq: 523.25,
          midFreq: 987.77,
          endFreq: 659.25,
          wave: 'sine',
          duration: 0.24,
          gain: 0.11,
          delay: 0.09,
        });
        this.triggerVoice({
          freq: 261.63,
          endFreq: 523.25,
          wave: 'triangle',
          duration: 0.22,
          gain: 0.095,
          delay: 0.1,
        });
        return true;

      case 'champion_strike':
        [0, 0.055, 0.11].forEach((d, idx) => {
          this.triggerVoice({
            freq: 140 + idx * 30,
            endFreq: 32,
            wave: 'triangle',
            duration: 0.09,
            gain: 0.16,
            delay: d,
          });
        });
        [523.25, 659.25, 1046.5].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            wave: 'pulse25',
            duration: 0.11,
            gain: 0.085,
            delay: 0.03 + i * 0.05,
          });
        });
        return true;

      case 'polar_lance':
        [1046.5, 1318.51, 1567.98].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 0.78,
            wave: i % 2 === 0 ? 'pulse12' : 'sine',
            duration: 0.1,
            gain: 0.08,
            delay: i * 0.045,
          });
        });
        this.playNoise({
          duration: 0.22,
          gain: 0.11,
          filterType: 'bandpass',
          startFreq: 1240,
          endFreq: 580,
          q: 1.8,
          delay: 0.05,
        });
        return true;

      case 'relic_hex':
        this.triggerVoice({
          freq: 311.13,
          midFreq: 466.16,
          endFreq: 220.0,
          wave: 'sine',
          duration: 0.3,
          gain: 0.11,
        });
        [587.33, 440.0, 698.46].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 0.86,
            wave: 'pulse12',
            duration: 0.13,
            gain: 0.072,
            delay: 0.04 + i * 0.056,
          });
        });
        this.playNoise({
          duration: 0.22,
          gain: 0.095,
          filterType: 'bandpass',
          startFreq: 720,
          endFreq: 240,
          q: 2.0,
        });
        return true;

      case 'rift_claw':
        this.triggerVoice({
          freq: 392.0,
          midFreq: 659.25,
          endFreq: 246.94,
          wave: 'pulse25',
          duration: 0.2,
          gain: 0.09,
        });
        this.playNoise({
          duration: 0.16,
          gain: 0.14,
          filterType: 'bandpass',
          startFreq: 1040,
          endFreq: 360,
          q: 1.7,
        });
        this.playPhysicalImpact(74);
        return true;

      case 'cosmos_supernova':
        this.triggerVoice({
          freq: 220.0,
          midFreq: 587.33,
          endFreq: 1174.66,
          wave: 'pulse25',
          duration: 0.26,
          gain: 0.1,
        });
        [440.0, 659.25, 880.0, 1318.51].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            wave: i % 2 === 0 ? 'sine' : 'pulse12',
            duration: 0.24,
            gain: 0.085,
            delay: 0.06 + i * 0.036,
          });
        });
        this.triggerVoice({
          freq: 146.83,
          endFreq: 28,
          wave: 'triangle',
          duration: 0.28,
          gain: 0.2,
          delay: 0.1,
        });
        return true;

      default:
        return false;
    }
  }

  playAbilityCue(abilityId = '', type = 'normal') {
    const id = String(abilityId || '');
    switch (id) {
      case 'overgrow':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'pulse25', duration: 0.1, gain: 0.075, delay: i * 0.036 });
        });
        return;
      case 'blaze':
        [392.0, 493.88, 587.33, 783.99].forEach((f, i) => {
          this.triggerVoice({ freq: f, endFreq: f * 1.04, wave: 'pulse25', duration: 0.11, gain: 0.08, delay: i * 0.036 });
        });
        this.playNoise({ duration: 0.12, gain: 0.09, filterType: 'bandpass', startFreq: 520, endFreq: 980, q: 1.4 });
        return;
      case 'torrent':
        [440.0, 587.33, 783.99, 987.77].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i % 2 === 0 ? 'sine' : 'triangle', duration: 0.12, gain: 0.082, delay: i * 0.038 });
        });
        return;
      case 'volt_reflex':
        [783.99, 1046.5, 1318.51].forEach((f, i) => {
          this.triggerVoice({ freq: f, endFreq: f * 1.05, wave: 'pulse12', duration: 0.08, gain: 0.08, delay: i * 0.03 });
        });
        return;
      case 'storm_conduit':
        [659.25, 987.77, 1318.51].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'pulse12', duration: 0.1, gain: 0.08, delay: i * 0.036 });
          this.triggerVoice({ freq: f * 0.5, wave: 'triangle', duration: 0.11, gain: 0.055, delay: i * 0.036 });
        });
        return;
      case 'diamond_guard':
        [587.33, 880.0, 1174.66].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'sine', duration: 0.2, gain: 0.09, delay: i * 0.045 });
        });
        return;
      case 'dune_titan':
        this.triggerVoice({ freq: 146.83, endFreq: 220.0, wave: 'triangle', duration: 0.16, gain: 0.12 });
        [440.0, 554.37, 659.25].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'pulse25', duration: 0.11, gain: 0.07, delay: 0.03 + i * 0.038 });
        });
        return;
      case 'mystic_prism':
        [659.25, 830.61, 987.77, 1318.51].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i % 2 === 0 ? 'sine' : 'pulse12', duration: 0.12, gain: 0.078, delay: i * 0.035 });
        });
        return;
      case 'cosmic_presence':
        [293.66, 440.0, 659.25, 880.0, 1174.66].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i === 0 ? 'triangle' : 'sine', duration: 0.16, gain: 0.08, delay: i * 0.036 });
        });
        return;
      case 'permafrost':
        [987.77, 1174.66, 1318.51].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i % 2 === 0 ? 'sine' : 'pulse12', duration: 0.13, gain: 0.075, delay: i * 0.038 });
        });
        return;
      case 'shadow_cloak':
        [392.0, 466.16, 587.33, 311.13].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i % 2 === 0 ? 'sine' : 'pulse12', duration: 0.14, gain: 0.075, delay: i * 0.042 });
        });
        return;
      case 'dragon_heart':
        [293.66, 440.0, 587.33, 880.0].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i === 0 ? 'triangle' : 'pulse25', duration: 0.14, gain: 0.082, delay: i * 0.04 });
        });
        return;
      case 'prism_scales':
        [523.25, 783.99, 987.77, 1318.51].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'sine', duration: 0.16, gain: 0.082, delay: i * 0.04 });
        });
        return;
      case 'starlight_grace':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'sine', duration: 0.18, gain: 0.09, delay: i * 0.05 });
        });
        return;
      case 'chlorophyll_rush':
        [587.33, 739.99, 880.0, 1174.66].forEach((f, i) => {
          this.triggerVoice({ freq: f, endFreq: f * 1.03, wave: i % 2 === 0 ? 'pulse25' : 'sine', duration: 0.11, gain: 0.078, delay: i * 0.034 });
        });
        return;
      case 'nectar_siphon':
        [440.0, 554.37, 659.25, 880.0].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'sine', duration: 0.14, gain: 0.082, delay: i * 0.042 });
        });
        return;
      case 'magma_armor':
        this.triggerVoice({ freq: 130.81, endFreq: 73.42, wave: 'triangle', duration: 0.18, gain: 0.12 });
        [329.63, 440.0, 523.25].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'pulse25', duration: 0.12, gain: 0.075, delay: 0.02 + i * 0.04 });
        });
        return;
      case 'supernova_core':
        [392.0, 523.25, 659.25, 987.77].forEach((f, i) => {
          this.triggerVoice({ freq: f, endFreq: f * 1.06, wave: i % 2 === 0 ? 'pulse25' : 'sine', duration: 0.13, gain: 0.082, delay: i * 0.036 });
        });
        this.playNoise({ duration: 0.14, gain: 0.09, filterType: 'bandpass', startFreq: 620, endFreq: 1080, q: 1.4 });
        return;
      case 'abyssal_current':
        [392.0, 493.88, 659.25, 783.99].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'sine', duration: 0.16, gain: 0.085, delay: i * 0.045 });
        });
        return;
      case 'pearl_aegis':
        [523.25, 659.25, 987.77, 1318.51].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i === 0 ? 'triangle' : 'sine', duration: 0.19, gain: 0.086, delay: i * 0.04 });
        });
        return;
      case 'thunder_steppe':
        [659.25, 880.0, 1174.66, 1318.51].forEach((f, i) => {
          this.triggerVoice({ freq: f, endFreq: f * 1.04, wave: 'pulse12', duration: 0.09, gain: 0.078, delay: i * 0.032 });
        });
        return;
      case 'rail_overload':
        [880.0, 1174.66].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'pulse12', duration: 0.06, gain: 0.08, delay: i * 0.032 });
        });
        this.triggerVoice({ freq: 1318.51, endFreq: 659.25, wave: 'pulse25', duration: 0.15, gain: 0.088, delay: 0.068 });
        return;
      case 'fossil_bastion':
        this.triggerVoice({ freq: 146.83, endFreq: 98.0, wave: 'triangle', duration: 0.16, gain: 0.12 });
        [440.0, 587.33, 880.0].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'sine', duration: 0.18, gain: 0.082, delay: 0.03 + i * 0.045 });
        });
        return;
      case 'chrono_shift':
        [1046.5, 1318.51].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'pulse12', duration: 0.04, gain: 0.072, delay: i * 0.048 });
        });
        [587.33, 880.0, 1174.66].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'sine', duration: 0.16, gain: 0.082, delay: 0.08 + i * 0.038 });
        });
        return;
      case 'champion_spirit':
        this.triggerVoice({ freq: 164.81, endFreq: 82.41, wave: 'triangle', duration: 0.11, gain: 0.13 });
        [523.25, 783.99, 1046.5].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'pulse25', duration: 0.12, gain: 0.085, delay: 0.02 + i * 0.038 });
        });
        return;
      case 'aurora_cloak':
        [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i % 2 === 0 ? 'sine' : 'pulse12', duration: 0.15, gain: 0.078, delay: i * 0.038 });
        });
        return;
      case 'phantom_mirage':
        [349.23, 466.16, 622.25, 440.0].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i % 2 === 0 ? 'sine' : 'pulse12', duration: 0.14, gain: 0.076, delay: i * 0.042 });
        });
        return;
      case 'rift_sovereign':
        this.triggerVoice({ freq: 164.81, endFreq: 329.63, wave: 'triangle', duration: 0.18, gain: 0.12 });
        [440.0, 659.25, 987.77, 1318.51].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i % 2 === 0 ? 'pulse25' : 'sine', duration: 0.17, gain: 0.084, delay: 0.03 + i * 0.04 });
        });
        return;
      case 'orichalcum_pulse':
        this.triggerVoice({ freq: 146.83, endFreq: 58.0, wave: 'triangle', duration: 0.14, gain: 0.14 });
        [329.63, 440.0, 554.37, 659.25].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'pulse25', duration: 0.12, gain: 0.084, delay: 0.02 + i * 0.038 });
        });
        return;
      case 'gale_wings':
        this.playNoise({ duration: 0.2, gain: 0.12, filterType: 'bandpass', startFreq: 480, endFreq: 1180, q: 1.5 });
        [392.0, 493.88, 587.33, 783.99].forEach((f, i) => {
          this.triggerVoice({ freq: f, endFreq: f * 1.05, wave: i % 2 === 0 ? 'triangle' : 'sine', duration: 0.13, gain: 0.08, delay: i * 0.036 });
        });
        return;
      case 'toxic_alchemy':
        this.playNoise({ duration: 0.18, gain: 0.09, filterType: 'bandpass', startFreq: 780, endFreq: 320, q: 1.8 });
        [311.13, 349.23, 415.3, 523.25].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i % 2 === 0 ? 'sine' : 'pulse12', duration: 0.14, gain: 0.08, delay: i * 0.04 });
        });
        return;
      case 'stamina_earth':
        this.triggerVoice({ freq: 130.81, endFreq: 42.0, wave: 'triangle', duration: 0.18, gain: 0.14 });
        [293.66, 440.0, 587.33].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'pulse25', duration: 0.14, gain: 0.08, delay: 0.03 + i * 0.042 });
        });
        return;
      case 'swarm_resonance':
        [659.25, 739.99, 880.0, 987.77].forEach((f, i) => {
          this.triggerVoice({ freq: f, endFreq: f * 1.06, wave: 'pulse12', duration: 0.09, gain: 0.078, delay: i * 0.032 });
        });
        this.playNoise({ duration: 0.15, gain: 0.08, filterType: 'bandpass', startFreq: 1080, endFreq: 640, q: 1.6 });
        return;
      case 'corviknight_armor':
        [493.88, 739.99, 987.77].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i % 2 === 0 ? 'pulse12' : 'sine', duration: 0.18, gain: 0.084, delay: i * 0.042 });
        });
        this.triggerVoice({ freq: 1479.98, wave: 'sine', duration: 0.22, gain: 0.06, delay: 0.08 });
        return;
      case 'supreme_overlord':
        this.triggerVoice({ freq: 130.81, endFreq: 48.0, wave: 'triangle', duration: 0.16, gain: 0.13 });
        [261.63, 311.13, 392.0, 523.25].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i % 2 === 0 ? 'pulse12' : 'sine', duration: 0.15, gain: 0.082, delay: 0.02 + i * 0.04 });
        });
        return;
      case 'pixilate_aura':
        [783.99, 987.77, 1174.66, 1318.51].forEach((f, i) => {
          this.triggerVoice({ freq: f, endFreq: f * 1.02, wave: i % 2 === 0 ? 'sine' : 'pulse12', duration: 0.14, gain: 0.078, delay: i * 0.038 });
        });
        return;
      case 'disguise_veil':
        this.playNoise({ duration: 0.16, gain: 0.085, filterType: 'bandpass', startFreq: 960, endFreq: 440, q: 1.5 });
        [659.25, 783.99, 932.33, 1174.66].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i % 2 === 0 ? 'sine' : 'triangle', duration: 0.15, gain: 0.08, delay: i * 0.04 });
        });
        return;
      case 'tera_prism':
        [523.25, 659.25, 783.99, 987.77, 1318.51].forEach((f, i) => {
          this.triggerVoice({ freq: f, endFreq: f * 1.015, wave: i % 2 === 0 ? 'sine' : 'pulse12', duration: 0.18, gain: 0.082, delay: i * 0.036 });
        });
        return;
      default: {
        const fallbackByType = {
          grass: 'overgrow',
          fire: 'blaze',
          water: 'torrent',
          electric: 'storm_conduit',
          rock: 'diamond_guard',
          psychic: 'mystic_prism',
          ice: 'permafrost',
          ghost: 'shadow_cloak',
          dragon: 'dragon_heart',
          fighting: 'orichalcum_pulse',
          flying: 'gale_wings',
          poison: 'toxic_alchemy',
          ground: 'stamina_earth',
          bug: 'swarm_resonance',
          steel: 'corviknight_armor',
          dark: 'supreme_overlord',
          fairy: 'pixilate_aura',
        };
        if (fallbackByType[type]) {
          this.playAbilityCue(fallbackByType[type], 'normal');
        } else {
          this.playBuffChime();
        }
        return;
      }
    }
  }

  _playSprint8MoveSfx(moveId) {
    switch (moveId) {
      case 'close_combat':
        [0, 0.05, 0.1, 0.15].forEach((d, idx) => {
          this.triggerVoice({
            freq: 155 + idx * 24,
            endFreq: 34,
            wave: 'triangle',
            duration: 0.085,
            gain: 0.16,
            delay: d,
          });
          this.triggerVoice({
            freq: 440 + idx * 90,
            endFreq: 220,
            wave: 'pulse25',
            duration: 0.065,
            gain: 0.082,
            delay: d + 0.01,
          });
        });
        this.playNoise({ duration: 0.14, gain: 0.15, filterType: 'lowpass', startFreq: 680, endFreq: 120, delay: 0.14 });
        return true;

      case 'vacuum_wave':
        this.playNoise({ duration: 0.2, gain: 0.13, filterType: 'bandpass', startFreq: 420, endFreq: 1120, q: 1.7 });
        this.triggerVoice({ freq: 392.0, midFreq: 659.25, endFreq: 293.66, wave: 'pulse12', duration: 0.2, gain: 0.088 });
        this.triggerVoice({ freq: 196.0, endFreq: 58.0, wave: 'triangle', duration: 0.16, gain: 0.14, delay: 0.08 });
        return true;

      case 'collision_course':
        this.triggerVoice({ freq: 164.81, endFreq: 523.25, wave: 'pulse25', duration: 0.16, gain: 0.095 });
        this.playPhysicalImpact(84);
        this.triggerVoice({ freq: 110.0, endFreq: 26.0, wave: 'triangle', duration: 0.26, gain: 0.2, delay: 0.1 });
        this.playNoise({ duration: 0.2, gain: 0.18, filterType: 'lowpass', startFreq: 860, endFreq: 110, delay: 0.1 });
        return true;

      case 'brave_bird':
        this.triggerVoice({ freq: 1046.5, endFreq: 1318.51, wave: 'pulse12', duration: 0.09, gain: 0.082 });
        this.playNoise({ duration: 0.24, gain: 0.16, filterType: 'bandpass', startFreq: 520, endFreq: 1240, q: 1.5, delay: 0.02 });
        this.playPhysicalImpact(78);
        return true;

      case 'air_slash':
        [0, 0.075].forEach((d, idx) => {
          this.playNoise({
            duration: 0.13,
            gain: 0.14,
            filterType: 'bandpass',
            startFreq: idx === 0 ? 1140 : 1240,
            endFreq: 440,
            q: 1.8,
            delay: d,
          });
          this.triggerVoice({
            freq: idx === 0 ? 880.0 : 1046.5,
            endFreq: idx === 0 ? 493.88 : 587.33,
            wave: 'pulse12',
            duration: 0.11,
            gain: 0.085,
            delay: d,
          });
        });
        return true;

      case 'tailwind_grace':
        this.playNoise({ duration: 0.24, gain: 0.11, filterType: 'bandpass', startFreq: 460, endFreq: 1160, q: 1.4 });
        [523.25, 659.25, 783.99, 1046.5, 1174.66].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: i % 2 === 0 ? 'sine' : 'triangle', duration: 0.15, gain: 0.08, delay: i * 0.042 });
        });
        return true;

      case 'sludge_wave':
        this.playNoise({ duration: 0.28, gain: 0.15, filterType: 'lowpass', startFreq: 980, endFreq: 240 });
        [
          [349.23, 246.94, 0],
          [415.3, 277.18, 0.06],
          [311.13, 207.65, 0.12],
        ].forEach(([f1, f2, d]) => {
          this.triggerVoice({ freq: f1, endFreq: f2, wave: 'sine', duration: 0.12, gain: 0.105, delay: d });
        });
        return true;

      case 'poison_jab':
        this.triggerVoice({ freq: 830.61, endFreq: 349.23, wave: 'pulse12', duration: 0.11, gain: 0.088 });
        this.triggerVoice({ freq: 622.25, endFreq: 277.18, wave: 'sine', duration: 0.12, gain: 0.085, delay: 0.045 });
        this.playPhysicalImpact(68);
        return true;

      case 'malignant_chain':
        [659.25, 493.88, 698.46, 466.16].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 0.85,
            wave: i % 2 === 0 ? 'pulse12' : 'sine',
            duration: 0.12,
            gain: 0.082,
            delay: i * 0.048,
          });
        });
        this.playNoise({ duration: 0.22, gain: 0.11, filterType: 'bandpass', startFreq: 920, endFreq: 280, q: 1.9, delay: 0.04 });
        return true;

      case 'earthquake':
        [92, 118, 84].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: 22,
            wave: 'triangle',
            duration: 0.18,
            gain: 0.21,
            delay: i * 0.075,
          });
        });
        [0, 0.08].forEach((d) => {
          this.playNoise({ duration: 0.18, gain: 0.2, filterType: 'lowpass', startFreq: 620, endFreq: 85, q: 0.75, delay: d });
        });
        return true;

      case 'earth_power':
        this.triggerVoice({ freq: 110.0, endFreq: 38.0, wave: 'triangle', duration: 0.26, gain: 0.19 });
        this.triggerVoice({ freq: 220.0, midFreq: 440.0, endFreq: 164.81, wave: 'pulse25', duration: 0.24, gain: 0.09, delay: 0.04 });
        this.playNoise({ duration: 0.24, gain: 0.16, filterType: 'bandpass', startFreq: 480, endFreq: 1020, q: 1.2, delay: 0.05 });
        return true;

      case 'headlong_rush':
        [0, 0.07].forEach((d, i) => {
          this.triggerVoice({ freq: 135 + i * 20, endFreq: 28, wave: 'triangle', duration: 0.13, gain: 0.19, delay: d });
        });
        this.triggerVoice({ freq: 246.94, endFreq: 493.88, wave: 'pulse25', duration: 0.14, gain: 0.088 });
        this.playNoise({ duration: 0.2, gain: 0.18, filterType: 'lowpass', startFreq: 720, endFreq: 110, delay: 0.08 });
        return true;

      case 'bug_buzz':
        [0, 0.04, 0.08, 0.12].forEach((d, i) => {
          this.triggerVoice({
            freq: i % 2 === 0 ? 622.25 : 659.25,
            endFreq: i % 2 === 0 ? 698.46 : 739.99,
            wave: 'pulse12',
            duration: 0.09,
            gain: 0.08,
            delay: d,
          });
        });
        this.triggerVoice({ freq: 311.13, endFreq: 466.16, wave: 'sine', duration: 0.24, gain: 0.095 });
        return true;

      case 'x_scissor':
        [0, 0.055].forEach((d, idx) => {
          this.playNoise({
            duration: 0.12,
            gain: 0.14,
            filterType: 'bandpass',
            startFreq: 1200,
            endFreq: 420,
            q: 1.7,
            delay: d,
          });
          this.triggerVoice({
            freq: idx === 0 ? 783.99 : 987.77,
            endFreq: idx === 0 ? 440.0 : 523.25,
            wave: 'pulse12',
            duration: 0.095,
            gain: 0.085,
            delay: d,
          });
        });
        this.playPhysicalImpact(68);
        return true;

      case 'quiver_step':
        [587.33, 739.99, 880.0, 1174.66, 1318.51].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 1.04,
            wave: i % 2 === 0 ? 'pulse12' : 'sine',
            duration: 0.12,
            gain: 0.078,
            delay: i * 0.04,
          });
        });
        return true;

      case 'flash_cannon':
        [880.0, 1174.66].forEach((f, i) => {
          this.triggerVoice({ freq: f, wave: 'pulse12', duration: 0.07, gain: 0.078, delay: i * 0.035 });
        });
        this.triggerVoice({ freq: 1318.51, midFreq: 987.77, endFreq: 493.88, wave: 'sine', duration: 0.24, gain: 0.11, delay: 0.07 });
        this.triggerVoice({ freq: 196.0, endFreq: 44.0, wave: 'triangle', duration: 0.2, gain: 0.16, delay: 0.09 });
        return true;

      case 'gigaton_hammer':
        this.triggerVoice({ freq: 987.77, endFreq: 739.99, wave: 'pulse12', duration: 0.14, gain: 0.085 });
        this.triggerVoice({ freq: 1479.98, endFreq: 1174.66, wave: 'sine', duration: 0.16, gain: 0.08, delay: 0.015 });
        this.triggerVoice({ freq: 120, endFreq: 22, wave: 'triangle', duration: 0.28, gain: 0.22, delay: 0.05 });
        this.playNoise({ duration: 0.24, gain: 0.22, filterType: 'lowpass', startFreq: 760, endFreq: 85, q: 0.75, delay: 0.05 });
        return true;

      case 'king_shield':
        [392.0, 587.33, 783.99, 1174.66].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            wave: i < 2 ? 'pulse25' : 'sine',
            duration: 0.22,
            attack: 0.008,
            sustain: 0.52,
            gain: 0.088,
            delay: i * 0.045,
          });
        });
        return true;

      case 'dark_pulse':
        this.triggerVoice({ freq: 261.63, midFreq: 311.13, endFreq: 146.83, wave: 'pulse12', duration: 0.28, gain: 0.092 });
        [392.0, 311.13, 233.08].forEach((f, i) => {
          this.triggerVoice({ freq: f, endFreq: f * 0.82, wave: 'sine', duration: 0.14, gain: 0.095, delay: 0.04 + i * 0.055 });
        });
        this.playNoise({ duration: 0.22, gain: 0.11, filterType: 'bandpass', startFreq: 760, endFreq: 200, q: 1.9, delay: 0.02 });
        return true;

      case 'kowtow_cleave':
        this.triggerVoice({ freq: 1174.66, endFreq: 440.0, wave: 'pulse12', duration: 0.12, gain: 0.088 });
        this.playNoise({ duration: 0.15, gain: 0.14, filterType: 'bandpass', startFreq: 1120, endFreq: 320, q: 1.8 });
        this.playPhysicalImpact(80);
        return true;

      case 'lunar_shroud':
        [329.63, 493.88, 659.25, 987.77].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            wave: i % 2 === 0 ? 'sine' : 'pulse12',
            duration: 0.24,
            attack: 0.01,
            sustain: 0.5,
            gain: 0.085,
            delay: i * 0.048,
          });
        });
        this.playNoise({ duration: 0.2, gain: 0.08, filterType: 'bandpass', startFreq: 640, endFreq: 280, q: 1.7 });
        return true;

      case 'dazzling_gleam':
        [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 1.04,
            wave: i % 2 === 0 ? 'sine' : 'pulse12',
            duration: 0.16,
            gain: 0.082,
            delay: i * 0.038,
          });
        });
        this.playNoise({ duration: 0.16, gain: 0.09, filterType: 'bandpass', startFreq: 1220, endFreq: 680, q: 1.5, delay: 0.04 });
        return true;

      case 'play_rough':
        [523.25, 659.25, 587.33, 783.99].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 1.15,
            wave: i % 2 === 0 ? 'pulse25' : 'triangle',
            duration: 0.085,
            gain: 0.085,
            delay: i * 0.045,
          });
        });
        this.playPhysicalImpact(72);
        return true;

      case 'geomancy_bloom':
        [440.0, 554.37, 659.25, 880.0, 1108.73, 1318.51].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 1.02,
            wave: i % 2 === 0 ? 'sine' : 'pulse12',
            duration: 0.18,
            attack: 0.01,
            sustain: 0.54,
            gain: 0.082,
            delay: i * 0.042,
          });
        });
        return true;

      case 'water_shuriken':
        [0, 0.055, 0.11].forEach((d, i) => {
          this.triggerVoice({
            freq: 880.0 + i * 110,
            endFreq: 493.88,
            wave: 'pulse12',
            duration: 0.09,
            gain: 0.082,
            delay: d,
          });
          this.playNoise({
            duration: 0.09,
            gain: 0.11,
            filterType: 'lowpass',
            startFreq: 1080,
            endFreq: 340,
            delay: d + 0.01,
          });
        });
        return true;

      case 'dragon_darts':
        [0, 0.07].forEach((d, i) => {
          this.triggerVoice({
            freq: i === 0 ? 587.33 : 659.25,
            endFreq: i === 0 ? 293.66 : 329.63,
            wave: 'pulse25',
            duration: 0.12,
            gain: 0.092,
            delay: d,
          });
          this.triggerVoice({
            freq: 220.0 + i * 40,
            endFreq: 44.0,
            wave: 'triangle',
            duration: 0.14,
            gain: 0.15,
            delay: d + 0.02,
          });
        });
        return true;

      case 'bitter_blade':
        this.triggerVoice({ freq: 440.0, midFreq: 659.25, endFreq: 246.94, wave: 'pulse12', duration: 0.2, gain: 0.088 });
        this.playNoise({ duration: 0.18, gain: 0.14, filterType: 'bandpass', startFreq: 980, endFreq: 340, q: 1.6 });
        this.playPhysicalImpact(76);
        return true;

      case 'electro_drift':
        this.triggerVoice({ freq: 392.0, midFreq: 987.77, endFreq: 1567.98, wave: 'pulse12', duration: 0.18, gain: 0.09 });
        [1046.5, 1318.51, 880.0].forEach((f, i) => {
          this.triggerVoice({
            freq: f,
            endFreq: f * 0.6,
            wave: i % 2 === 0 ? 'pulse12' : 'pulse25',
            duration: 0.1,
            gain: 0.085,
            delay: 0.07 + i * 0.036,
          });
        });
        this.playNoise({ duration: 0.18, gain: 0.13, filterType: 'bandpass', startFreq: 1180, endFreq: 360, q: 1.5, delay: 0.06 });
        return true;

      default:
        return false;
    }
  }

  playPokemonCry(speciesOrId) {
    let speciesId = 1;
    let type = '';
    let baseStats = null;

    if (typeof speciesOrId === 'number' || typeof speciesOrId === 'string') {
      const parsed = Number(speciesOrId);
      if (Number.isFinite(parsed) && parsed > 0) {
        speciesId = Math.max(1, Math.min(1025, Math.round(parsed)));
      }
    } else if (speciesOrId && typeof speciesOrId === 'object') {
      const parsed = Number(speciesOrId.speciesId ?? speciesOrId.id ?? speciesOrId.species?.id);
      if (Number.isFinite(parsed) && parsed > 0) {
        speciesId = Math.max(1, Math.min(1025, Math.round(parsed)));
      }
      type = String(speciesOrId.type || speciesOrId.species?.type || '').toLowerCase();
      baseStats = speciesOrId.baseStats || speciesOrId.species?.baseStats || null;
    }

    const hashSeed = (id, salt) => {
      let h = (Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(salt + 1, 0xc2b2ae35)) >>> 0;
      h ^= h >>> 16;
      h = Math.imul(h, 0x7feb352d) >>> 0;
      h ^= h >>> 15;
      h = Math.imul(h, 0x846ca68b) >>> 0;
      h ^= h >>> 16;
      return h >>> 0;
    };

    const u0 = hashSeed(speciesId, 0) / 0x100000000;
    const u1 = hashSeed(speciesId, 1) / 0x100000000;
    const u2 = hashSeed(speciesId, 2) / 0x100000000;
    const u3 = hashSeed(speciesId, 3) / 0x100000000;
    const u4 = hashSeed(speciesId, 4) / 0x100000000;

    const waves = ['pulse12', 'pulse25', 'triangle', 'sine'];
    const typeWaveBias = {
      electric: 0,
      bug: 0,
      steel: 0,
      fighting: 1,
      fire: 1,
      dragon: 1,
      dark: 1,
      rock: 2,
      ground: 2,
      water: 2,
      grass: 2,
      normal: 2,
      psychic: 3,
      ghost: 3,
      fairy: 3,
      ice: 3,
      flying: 3,
      poison: 0,
    };
    const waveIdx = type && Object.prototype.hasOwnProperty.call(typeWaveBias, type)
      ? (u0 < 0.6 ? typeWaveBias[type] : Math.floor(u0 * waves.length) % waves.length)
      : Math.floor(u0 * waves.length) % waves.length;
    const wave = waves[waveIdx];

    let pitchBias = 0;
    if (baseStats && typeof baseStats === 'object') {
      const spd = Number(baseStats.spd) || 60;
      const hp = Number(baseStats.hp) || 60;
      pitchBias = Math.max(-75, Math.min(95, (spd - hp) * 1.1));
    }
    const rawBase = 175 + u1 * 485 + pitchBias;
    const baseFreq = Number(Math.max(130, Math.min(820, rawBase)).toFixed(2));
    const duration = Number((0.22 + u2 * 0.21).toFixed(3));

    const contourMode = Math.floor(u3 * 5);
    let midFreq = baseFreq * 1.18;
    let endFreq = baseFreq * 0.86;
    if (contourMode === 0) {
      midFreq = baseFreq * (1.2 + u4 * 0.22);
      endFreq = baseFreq * (1.02 + u2 * 0.16);
    } else if (contourMode === 1) {
      midFreq = baseFreq * (0.76 + u4 * 0.14);
      endFreq = baseFreq * (1.28 + u2 * 0.2);
    } else if (contourMode === 2) {
      midFreq = baseFreq * (1.12 + u4 * 0.16);
      endFreq = baseFreq * (0.64 + u2 * 0.12);
    } else if (contourMode === 3) {
      midFreq = baseFreq * (1.32 + u4 * 0.16);
      endFreq = baseFreq * (0.82 + u2 * 0.14);
    } else {
      midFreq = baseFreq * (0.9 + u4 * 0.12);
      endFreq = baseFreq * (1.36 + u2 * 0.18);
    }

    midFreq = Math.max(90, Math.min(1320, midFreq));
    endFreq = Math.max(80, Math.min(1380, endFreq));

    // Smoothly fade down (<= 25ms) and stop any previous still-sounding cry before starting the new one
    this._stopActiveCry(false);

    const ctx = this.ensureContext();
    let cryBus = null;
    if (!this.muted && ctx && ctx.state === 'running' && this.masterFilter && typeof ctx.createGain === 'function') {
      try {
        cryBus = ctx.createGain();
        cryBus.gain.value = 1;
        cryBus.connect(this.masterFilter);
      } catch {
        cryBus = null;
      }
    }

    const cryToken = ++this._crySeq;
    const voiceDestination = cryBus || undefined;
    const oscNodes = [];

    const primaryGain = 0.068;
    const primaryOsc = this.triggerVoice({
      freq: baseFreq,
      midFreq,
      endFreq,
      wave,
      attack: 0.012,
      decay: duration * 0.28,
      sustain: 0.48,
      duration,
      gain: primaryGain,
      destination: voiceDestination,
      _cryToken: cryToken,
    });
    if (primaryOsc && typeof primaryOsc === 'object') {
      oscNodes.push(primaryOsc);
    }

    if (primaryOsc && u3 > 0.3) {
      const harmRatio = u4 > 0.5 ? 1.5 : 0.5;
      const harmWave = wave === 'pulse12' ? 'triangle' : 'sine';
      const harmOsc = this.triggerVoice({
        freq: Math.max(70, Math.min(1400, baseFreq * harmRatio)),
        midFreq: Math.max(70, Math.min(1400, midFreq * harmRatio)),
        endFreq: Math.max(70, Math.min(1400, endFreq * harmRatio)),
        wave: harmWave,
        attack: 0.014,
        decay: duration * 0.25,
        sustain: 0.36,
        duration: Math.max(0.12, duration * 0.78),
        gain: 0.032,
        delay: 0.035,
        destination: voiceDestination,
        _cryToken: cryToken,
      });
      if (harmOsc && typeof harmOsc === 'object') {
        oscNodes.push(harmOsc);
      }
    }

    if (primaryOsc && u4 > 0.42) {
      const vibShift = 1 + (0.018 + u2 * 0.016);
      const vibOsc = this.triggerVoice({
        freq: Math.max(70, Math.min(1400, baseFreq * vibShift)),
        midFreq: Math.max(70, Math.min(1400, midFreq / vibShift)),
        endFreq: Math.max(70, Math.min(1400, endFreq * vibShift)),
        wave: 'sine',
        attack: 0.02,
        decay: duration * 0.3,
        sustain: 0.32,
        duration: Math.max(0.1, duration * 0.72),
        gain: 0.014,
        delay: 0.025,
        destination: voiceDestination,
        _cryToken: cryToken,
      });
      if (vibOsc && typeof vibOsc === 'object') {
        oscNodes.push(vibOsc);
      }
    }

    const hasLiveOsc = oscNodes.some((node) => typeof node.stop === 'function');
    const isQueued = Boolean(primaryOsc?.queued);

    if (!primaryOsc) {
      if (cryBus) {
        try {
          cryBus.disconnect();
        } catch {
          // Ignore
        }
      }
    } else if (cryBus || hasLiveOsc || isQueued) {
      let cleaned = false;
      let autoTimer = null;

      const disconnectCryBus = () => {
        if (cryBus) {
          try {
            cryBus.disconnect();
          } catch {
            // Ignore
          }
        }
      };

      const cleanup = (immediate = false) => {
        if (cleaned) return;
        cleaned = true;
        if (autoTimer !== null) {
          clearTimeout(autoTimer);
          this._cryDisconnectTimers.delete(autoTimer);
          autoTimer = null;
        }
        if (isQueued && this._pendingVoices.length > 0) {
          this._pendingVoices = this._pendingVoices.filter((entry) => entry?.opts?._cryToken !== cryToken);
        }

        const activeCtx = this.ctx;
        const now = activeCtx && typeof activeCtx.currentTime === 'number' ? activeCtx.currentTime : 0;
        const fadeSec = immediate ? 0.004 : 0.018;

        if (cryBus) {
          try {
            cryBus.gain?.cancelScheduledValues?.(now);
            const curGain = typeof cryBus.gain?.value === 'number' && cryBus.gain.value > 0.0001
              ? cryBus.gain.value
              : 1;
            cryBus.gain?.setValueAtTime?.(curGain, now);
            cryBus.gain?.linearRampToValueAtTime?.(0.0001, now + fadeSec);
          } catch {
            // Ignore mock/parameter errors
          }
        }

        for (const osc of oscNodes) {
          if (typeof osc.stop === 'function') {
            try {
              osc.stop(immediate ? now : now + fadeSec);
            } catch {
              // Ignore already-stopped nodes
            }
          }
        }

        if (immediate || !hasLiveOsc) {
          for (const osc of oscNodes) {
            if (typeof osc.disconnect === 'function') {
              try {
                osc.disconnect();
              } catch {
                // Ignore
              }
            }
          }
          disconnectCryBus();
          return;
        }

        const discTimer = setTimeout(() => {
          this._cryDisconnectTimers.delete(discTimer);
          for (const osc of oscNodes) {
            if (typeof osc.disconnect === 'function') {
              try {
                osc.disconnect();
              } catch {
                // Ignore
              }
            }
          }
          disconnectCryBus();
        }, Math.ceil(fadeSec * 1000) + 6);
        this._cryDisconnectTimers.add(discTimer);
      };

      if (cryBus || hasLiveOsc) {
        autoTimer = setTimeout(() => {
          this._cryDisconnectTimers.delete(autoTimer);
          autoTimer = null;
          if (this._activeCryCleanup === cleanup) {
            this._activeCryCleanup = null;
          }
          if (!cleaned) {
            cleaned = true;
            disconnectCryBus();
          }
        }, Math.ceil((duration + 0.09) * 1000));
        this._cryDisconnectTimers.add(autoTimer);
      }

      this._activeCryCleanup = cleanup;
    }

    return {
      speciesId,
      baseFreq,
      wave,
      duration,
      played: Boolean(primaryOsc),
    };
  }
}

export const createAudioEngine = () => new AudioEngine();
