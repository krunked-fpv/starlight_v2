# STARLIGHT V2 — TECHNICAL SPECIFICATION & CONTRACTS (SHIPPED)

Canonical TypeScript contracts reside in `src/contracts/{types,render,overworld,battle,ui,index}.ts`.

## 1. Save Continuity Contract (`src/core/save/saveHydrator.ts`)

- **Primary v2 Persistence**: `localStorage['starlight_v2_save']` mirrored asynchronously to `IndexedDB` (`starlight_v2_db` / store `saves`).
- **Non-Destructive Legacy v1 Migration**: Reads `starlight_island_save`, `starlight_save_v1`, `pokemon_starlight_v1`, `starlight_profiles`, and `IndexedDB` (`starlight_island_db`). Legacy keys are never deleted or overwritten; migration provenance is recorded under `migratedFromV1`.
- **Sanitization & Continuity**: Always yields valid dual trainer profiles (`slot0`, `slot1`), 1..1,025 Pokédex entries (`seen`, `caught`, `starRank`, `bond`, `shiny`), 28 Badge IDs, Style Studio cosmetics/unlocks, inventory, Sky-Hop high scores, and clamped coordinates even under corrupted/malformed JSON.
- **Query Overrides**: `?renderer=auto|webgl2|canvas2d`, `?crt=1|0`, `?reducedMotion=1|0`, `?offlineRig=1|0`.

## 2. Hybrid Rendering & Frame-Pacing Contract (`src/contracts/render.ts`, `src/graphics/engine/**`)

- `IRenderBackend` is implemented with visual parity by `WebGL2Backend` and `Canvas2DBackend`.
- `RenderEngine` invokes `backend.beginFrame(elapsed, dt)` and `backend.endFrame()` via `StarlightApp.tick()`, clamping `dt <= 0.05s` (50 ms).
- `webglcontextlost` immediately hot-swaps `#starlight-canvas` in-place to `Canvas2DBackend`, re-registers loaded atlases, paints an immediate synchronous frame, and preserves all gameplay state; `webglcontextrestored` telemetry increments cleanly.
- `window.__STARLIGHT_DEBUG__` exposes read-only runtime state (`backend`, `capabilities`, `frameStats`, `hydrationSource`, `grassDisplacements`, `battlePhase`, `battleShutterDuration`, `contextEvents`, `manifestLoaded`) plus fault-injection hooks (`simulateContextLoss()`, `switchRenderer()`).

## 3. Procedural Asset Baker & Subpath Contract (`scripts/bake-assets.mjs`, `public/sw.js`)

- `npm run bake` is 100% offline and deterministic (seed `20261124`); consecutive runs produce byte-identical SHA-256 outputs across all 5 PNG atlases, `manifest.json`, `starlight-icons.svg` (72 `<symbol>` icons: 26 core HUD/items, 18 elemental types, 28 metallic/crystalline badges), and `starlight-emblem.svg`.
- `starlight-icons.svg` uses `width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden"` (never `display:none`) so Chromium `<linearGradient>` paint servers resolve inside `<use href="#icon-...">`.
- Production `dist/` stays well below the 25 MB cap (~1.50 MB) and serves cleanly at both `/` and `/starlight_v2/` with zero 404s and full offline reload via `public/sw.js`.

## 4. Visual Domain Contracts

- **Overworld (`src/graphics/overworld/**`)**: 19 regions (Starlight Village + 18 elemental biomes), 47-tile autotiles, animated surf foam, starlight water reflections, spring-physics parting tall grass, 12 micro-props, real-time cottage/fountain/shrine/starfall/aura lights, canopy sunbeams & cloud shadows, and live Style Studio outfits/capes/headgear/auras.
- **Battle Theater (`src/graphics/battle/**`)**: 19 unique 5-plane parallax arenas, 10-archetype multi-shaded `OfflineSpriteRigSynthesizer`, 18 elemental VFX choreographies, status overlays (`frost`, `static`, `burn`, `sleep`), hexagonal Composure shield + shatter burst, 7 spring camera cues, and 4-tier encounter shutters (`0.22s` attenuated under reduced motion).
- **Celestial Glass UI & Sky-Hop (`src/ui/**`, `src/graphics/skyhop/**`, `src/styles/starlight.css`)**: Strict zero-emoji DOM compliance, `CLS < 0.001` and `>= 44x44px` touch targets across `360x640`, `768x1024`, `1366x768`, and `1920x1080`, animated twilight Title & dual-profile vista, 1,025 collector holographic Pokédex + live procedural cry waveform, 28 Badges case, live Style Studio stage, and multi-layer aurora/cloud Sky-Hop arcade.

## 5. Verification Gates

- `npm run test:unit`: 35 Vitest unit tests (`src/**/*.test.ts`).
- `npm run test:e2e`: 19 zero-retry Playwright specs (`tests/redteam/**`, `tests/e2e/**`) covering v1 save continuity/fuzzing, mid-overworld & mid-battle WebGL2 context-loss hot-swap, SwiftShader Canvas2D parity, `/starlight_v2/` subpath + offline PWA reload, zero-emoji DOM scan, 4-viewport CLS & touch targets, `prefers-reduced-motion`, CRT click-through, and full dual-renderer gameplay journey.
