# STARLIGHT V2 — TECHNICAL SPECIFICATION & CONTRACTS (SHIPPED)

Canonical TypeScript contracts reside in `src/contracts/{types,render,overworld,battle,ui,index}.ts`.

## 1. Save Continuity Contract (`src/core/save/saveHydrator.ts`)

- **Primary v3 Persistence**: `localStorage['starlight_v2_save']` (`schemaVersion: 3`, dual `profiles.violet` & `profiles.ozias`) mirrored asynchronously to `IndexedDB` (`starlight_v2_db` / store `saves`).
- **Non-Destructive Precedence & Migration**:
  1. Native `schemaVersion >= 3` in `starlight_v2_save` (`v3-local`).
  2. Authentic Dojo save `starlight_pokemon_save_v1` (`dojo-v1-migrated`) — strictly overrides pre-overhaul `schemaVersion: 2` Lyra/Orion demo saves.
  3. Pre-overhaul `schemaVersion === 2` `starlight_v2_save` (`v2-migrated`).
  4. Legacy v1 keys (`starlight_island_save`, `starlight_save_v1`, `pokemon_starlight_v1`, `starlight_profiles`) & IndexedDB backups (`starlight_v2_db`, `starlight_island_db`).
  5. Fresh Violet & Ozias default profiles (`fresh-default`).
  - Legacy keys are strictly read-only and never modified or deleted.
- **Query Overrides**: `?renderer=auto|webgl2|canvas2d`, `?crt=1|0`, `?reducedMotion=1|0`, `?offlineRig=1|0`.

## 2. Hybrid HD-2D Pixel Rendering & Frame-Pacing Contract (`src/contracts/render.ts`, `src/graphics/engine/**`)

- `IRenderBackend` is implemented with crisp pixel parity (`GL_NEAREST` / `imageSmoothingEnabled = false`) by `WebGL2Backend` and `Canvas2DBackend`.
- `RenderEngine` drives `backend.beginFrame(elapsed, dt)` / `backend.endFrame()`, clamping `dt <= 0.05s` (50 ms).
- `webglcontextlost` immediately hot-swaps `#starlight-canvas` in-place to `Canvas2DBackend`, re-registers loaded atlases, repaints synchronously with zero blank frames, and preserves active gameplay state.
- `window.__STARLIGHT_DEBUG__` exposes read-only runtime state (`screen`, `activeDrawerTab`, `backend`, `capabilities`, `frameStats`, `hydrationSource`, `activeTrainerId`, `biomeId`, `playerPos`, `grassDisplacements`, `contextEvents`, `save`, `battleActive`, `battlePhase`, `battleShutterDuration`, `skyhopScore`, `manifestLoaded`, `spriteCacheVersion`) plus test hooks (`simulateContextLoss()`, `switchRenderer()`, `navigateScreen()`, `selectTrainer()`, `chooseStarter()`, `warpBiome()`, `triggerEncounter()`, `openSkyHop()`, `forceSave()`).

## 3. Deterministic Pixel Atlas Baker & Subpath Contract (`scripts/bake-assets.mjs`, `public/sw.js`)

- `npm run bake` is 100% offline and deterministic (seed `20261124`); consecutive runs produce byte-identical SHA-256 hashes across all 33 baked outputs:
  - `terrain-{atlas,normal,emissive}.png` (`256×256`, 61 tiles `tile_0..tile_60`)
  - `props-{atlas,normal,emissive}.png` (`512×256`, 17 props/buildings)
  - `characters-atlas.png` (`512×128`, 16 directional trainer/NPC sprites & portraits)
  - `fallbacks-atlas.png` (`512×128`, 11 pixel creature archetypes)
  - 19 `arenas/*.png` (`480×270`, 18 biomes + `skyhop`)
  - `manifest.json` (`version: "3.0.0"`)
  - `starlight-icons.svg` (99 bespoke multi-stop `<symbol>` icons: 53 UI/item/cosmetic + 18 elemental types + 28 badges), `starlight-emblem.svg`, and 3 PWA icons.
- `#svg-sprite-host` hides the injected sprite sheet via a zero-size box (never `display:none`) so Chromium `<linearGradient>` paint servers resolve inside `<use href="#icon-...">`.
- Production `dist/` stays well below 25 MB (~5.25 MB) and serves identically at `/` and `/starlight_v2/` with zero local 4xx/5xx errors and full offline reload via `public/sw.js`.

## 4. Visual Domain & Accessibility Contracts

- **Overworld (`src/graphics/overworld/**`)**: `100×84` 18-biome world with 61 pixel tiles, 47-tile bevels, pixel-snapped water, parting tall grass, cottages/fountain/observatory/Secret Arcade, 20 shrines, 36 chests, 23 NPCs, 17 rivals, animated Lead Pokémon follower, and live Style Studio cosmetics.
- **Battle Theater (`src/graphics/battle/**`)**: 18 bespoke `480×270` pixel arenas, single-canvas animated GIF89a Pokémon playback + crisp 11-archetype pixel offline fallback, 18-type pixel VFX + real-time lights, Composure `BRACED!` burst, Shield/Stat/Shiny/Trait/Ability presentation, capture/evolution cinematics, and 4-mode shutters (`<= 0.22s` reduced motion).
- **Celestial Pixel-Glass UI & Sky-Hop (`src/ui/**`, `src/graphics/skyhop/**`, `src/styles/starlight.css`)**: Strict zero-emoji DOM compliance across all text nodes and `aria-label`/`title`/`placeholder` attributes, `CLS < 0.001`, zero horizontal overflow, and `>= 44×44px` touch targets across `360×640`, `768×1024`, `1366×768`, and `1920×1080`, plus click-through CRT scanlines (`pointer-events: none`).

## 5. Verification Gates

- `npm run test:unit`: **51** Vitest unit tests across 5 suites (`dojoParity`, `RenderEngine`, `OverworldRenderer`, `BattleTheaterRenderer`, `CelestialUI`).
- `npm run test:e2e`: **21** zero-retry Playwright specs across 5 suites (`save-continuity`, `webgl-fault-injection`, `subpath-offline-pwa`, `accessibility-cls-emoji`, `full-journey`).
- `npm run verify`: Runs full `npm run build` (`bake + tsc --noEmit + vite build`), `npm run test:unit`, and `npm run test:e2e`.
