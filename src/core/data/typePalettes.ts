import type { ElementalType, TypeVisualPalette } from '../../contracts';

export const TYPE_PALETTES: Record<ElementalType, TypeVisualPalette> = {
  normal: { primary: '#d9d2be', secondary: '#a79f8b', glow: '#fff8e1', dark: '#544e42', rgb: [0.85, 0.82, 0.75] },
  grass: { primary: '#4bd478', secondary: '#1f8a4c', glow: '#a9ffbf', dark: '#103b24', rgb: [0.29, 0.83, 0.47] },
  fire: { primary: '#ff6b35', secondary: '#c72c1c', glow: '#ffd166', dark: '#4f120b', rgb: [1.0, 0.42, 0.21] },
  water: { primary: '#38b6ff', secondary: '#1462b8', glow: '#9be8ff', dark: '#0a254d', rgb: [0.22, 0.71, 1.0] },
  electric: { primary: '#ffd93d', secondary: '#e09f00', glow: '#fff6a6', dark: '#4d3600', rgb: [1.0, 0.85, 0.24] },
  ice: { primary: '#7be8ff', secondary: '#349ec9', glow: '#dffaff', dark: '#113a4d', rgb: [0.48, 0.91, 1.0] },
  fighting: { primary: '#e05246', secondary: '#96221b', glow: '#ff9b8f', dark: '#420d0a', rgb: [0.88, 0.32, 0.27] },
  poison: { primary: '#b55cff', secondary: '#6b21a8', glow: '#e4b8ff', dark: '#2c0b4a', rgb: [0.71, 0.36, 1.0] },
  ground: { primary: '#d9a05b', secondary: '#8f5a23', glow: '#ffe0a8', dark: '#3d240c', rgb: [0.85, 0.63, 0.36] },
  flying: { primary: '#7fb5ff', secondary: '#4575cc', glow: '#d4e8ff', dark: '#1a2f5c', rgb: [0.5, 0.71, 1.0] },
  psychic: { primary: '#ff5ca8', secondary: '#b01c6e', glow: '#ffb8df', dark: '#4a092e', rgb: [1.0, 0.36, 0.66] },
  bug: { primary: '#9be038', secondary: '#558b16', glow: '#d9ff8f', dark: '#243d07', rgb: [0.61, 0.88, 0.22] },
  rock: { primary: '#c7b07b', secondary: '#7d6941', glow: '#f2e2b8', dark: '#382e1b', rgb: [0.78, 0.69, 0.48] },
  ghost: { primary: '#816bff', secondary: '#432ea3', glow: '#c8bdff', dark: '#1b1147', rgb: [0.51, 0.42, 1.0] },
  dragon: { primary: '#5e7bff', secondary: '#2c3ab8', glow: '#a8baff', dark: '#111857', rgb: [0.37, 0.48, 1.0] },
  dark: { primary: '#6e6580', secondary: '#342c42', glow: '#b6a8d4', dark: '#15101f', rgb: [0.43, 0.4, 0.5] },
  steel: { primary: '#9cb5c9', secondary: '#5a7287', glow: '#e0f0fc', dark: '#23303d', rgb: [0.61, 0.71, 0.79] },
  fairy: { primary: '#ff96d5', secondary: '#c74c9b', glow: '#ffe0f4', dark: '#4d1439', rgb: [1.0, 0.59, 0.84] },
};
