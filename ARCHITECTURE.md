# STARLIGHT V2 — ARCHITECTURE CONTRACT (SHIPPED REALITY)

> **Core Constitution**: Git, code, and markdown contracts are persistent truth; agent sessions and scratchpads are disposable compute.

## 1. Shipped System Topology

Starlight v2 separates **Core Game State & Continuity** (`src/core/**`) from the **Cozy HD-2D & Celestial Diorama Presentation Layer** (`src/graphics/**`, `src/ui/**`, `src/styles/**`), unified by `StarlightApp` (`src/app/StarlightApp.ts`) and bootstrapped by `src/main.ts`.

- **Core Game Domain (`src/core/**`)**:
  - `src/core/catalog/speciesCatalog.ts`: Full 1..1,025 National Dex catalog with curated Gen 1–9 anchors, dual types, stats, 10 body archetypes, evolution metadata, and species-seeded cry parameters.
  - `src/core/data/biomes.ts`: Starlight Village + 18 canonical elemental biomes (19 total), 47-tile blob autotile bitmask computation, landmarks, micro-props, and per-biome color-grade LUT descriptors.
  - `src/core/data/badges.ts`: 28 metallic/crystalline Elemental & Mastery Badges.
  - `src/core/data/typePalettes.ts`, `styleCatalog.ts`, `tacticalBriefing.ts`: 18x18 effectiveness matrix, Style Studio outfits/capes/headgear/auras, and zero-emoji Tactical Readiness Briefing engine.
  - `src/core/save/saveHydrator.ts`: Non-destructive v1 -> v2 save hydrator supporting legacy `localStorage` (`starlight_island_save`, `starlight_save_v1`, `pokemon_starlight_v1`, `starlight_profiles`) and `IndexedDB` (`starlight_island_db`, `starlight_v2_db`) across dual trainer profiles (`slot0`, `slot1`) plus URL query flags (`?renderer=`, `?crt=`, `?reducedMotion=`, `?offlineRig=`).
  - `src/core/battle/battleEngine.ts`, `src/core/audio/audioSynth.ts`, `src/core/skyhop/skyHopEngine.ts`: Composure shield combat math, Star Ball captures, Evolution, procedural Web Audio + live PCM cry waveform tap, and Sky-Hop arcade physics.

## 2. Shipped Hybrid WebGL2 / Canvas2D Render Graph

- **`src/graphics/engine/RenderEngine.ts`**: Negotiates `WebGL2Backend` vs. `Canvas2DBackend`, detects software rasterizers (SwiftShader/llvmpipe) under `auto` mode, replaces `<canvas>` in-place on context swap (preventing WebGL2/2D context lockouts), repaints one synchronous frame immediately on swap for zero blank gaps, handles `webglcontextlost`/`webglcontextrestored` hot-swapping, preloads relative `./atlases/manifest.json`, and clamps `dt <= 50ms` for locked 60 FPS pacing.
- **`src/graphics/engine/WebGL2Backend.ts` & `src/graphics/shaders/programs.ts`**: 5 GLSL ES 3.00 shaders (`SPRITE_SHADER`, `WATER_SHADER`, `LIGHTING_CANOPY_SHADER` with up to 24 RGB point lights + filmic tone-compression + canopy sunbeams/cloud shadows, `BLOOM_COMPOSITE_SHADER` with 12-tap Dual-Kawase bloom + biome LUT + vignette + CRT scanlines, and `PARTICLE_SHADER`), hybrid offscreen 2D layer uploads, `preserveDrawingBuffer: true`, `dpr <= 2` on hardware GPUs, and `0.55x` internal resolution scaling when forced on software SwiftShader.
- **`src/graphics/engine/Canvas2DBackend.ts`**: Deterministic WebGL-free parity renderer using `{ alpha: false, willReadFrequently: true }` for zero ANGLE readback stalls, multi-depth water reflections & surf foam, 24 additive radial lights, canopy sunbeams, biome tint/vignette, and optional CRT scanline pattern.

## 3. Visual Domain Renderers & Celestial Glass UI

- **Overworld (`src/graphics/overworld/**`)**: `OverworldRenderer`, `AutotileRenderer`, `LandmarkRenderer`, `CharacterRigRenderer` — 47-tile autotiled terrain, surf foam coastlines, translucent starlight water, spring-physics parting tall grass, 12 micro-prop kinds, real-time cottage/fountain/shrine/starfall/aura point lights, and live Style Studio outfits/capes/headgear/auras.
- **Battle Theater (`src/graphics/battle/**`)**: `BattleTheaterRenderer`, `BattleArenas`, `BattleVfxDirector`, `OfflineSpriteRigSynthesizer` — 19 unique 5-plane parallax arenas, 10-archetype multi-shaded offline elemental art rigs, 18-type VFX, status & hexagonal Composure shields, 7 spring camera cues, and 4-tier encounter shutters (`0.22s` attenuated under reduced motion).
- **Celestial UI & Sky-Hop (`src/ui/**`, `src/graphics/skyhop/**`, `src/styles/starlight.css`)**: Zero-emoji vector HUD (`CelestialUIController`, `iconHelper`), animated twilight `LivingTitleRenderer`, searchable 1,025 `PokedexView` with 3D holographic foil cards & live cry waveform, `BadgesShowcase` (28 badges), live `StyleStudioStage`, and `SkyHopRenderer`.

## 4. Static Asset Pipeline, Offline PWA & Verification

- **`scripts/bake-assets.mjs`**: Seeded Mulberry32 PRNG (`20261124`) + pure Node `node:zlib` PNG baker generating byte-identical `public/atlases/{terrain-atlas,terrain-normal,terrain-emissive,props-atlas,characters-atlas}.png`, `public/atlases/manifest.json`, and 72 bespoke multi-stop SVG symbols in `public/icons/starlight-icons.svg` (hidden via zero-size box, never `display:none`, preserving Chromium gradient paint servers).
- **`public/sw.js` & `vite.config.ts` (`base: './'`)**: Relative-path static output (~1.50 MB total `dist/`, well under 25 MB). `sw.js` precaches core assets and dynamically extracts hashed `./assets/*` Vite JS/CSS chunks from `index.html` during `install`, enabling full offline reloads at `/` and `/starlight_v2/` without touching user save storage.
- **CI & Verification**: `.github/workflows/deploy.yml` (`ubuntu-latest` -> deterministic double-bake hash check -> `dist/` size gate -> Playwright E2E/Red-Team -> GitHub Pages deploy), `vitest.config.ts` (35 unit tests in `src/**/*.test.ts`), and `playwright.config.ts` + `tests/{redteam,e2e}/**` (19 Playwright specs + `subpath-server.mjs`).
