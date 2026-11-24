# STARLIGHT V2 — TECHNICAL SPECIFICATION & CONTRACTS

All TypeScript interfaces below are canonical and live in `src/contracts/`. Every worker implements strictly against these contracts without modifying files outside its exclusive ownership slice.

## 1. Save Continuity Contract (`src/contracts/types.ts`, `src/core/save/saveHydrator.ts`)

- **Legacy v1 Keys Supported (Read-Only Non-Destructive Migration)**:
  - `localStorage`: `starlight_island_save`, `starlight_save_v1`, `pokemon_starlight_v1`, `starlight_profiles`
  - `IndexedDB`: database `starlight_island_db` (store `saves`) and `starlight_v2_db` (store `saves`)
- **Primary v2 Persistence Key**: `starlight_v2_save` (mirrored to `IndexedDB` `starlight_v2_db`).
- **Invariants**:
  1. Legacy v1 keys are NEVER deleted or overwritten during hydration; migration metadata is recorded in `migratedFromV1`.
  2. Dual trainer profiles (`slot0`, `slot1`) always hydrate with valid party, 1..1025 Pokédex entries (`seen`, `caught`, `starRank`, `bond`), 28-Badge unlock IDs, Style Studio cosmetics/unlocks, inventory, Sky-Hop high score, and valid biome position.
  3. Corrupted or partial JSON payloads gracefully sanitize missing fields to safe defaults without crashing.
  4. Query parameters `?renderer=webgl2|canvas2d`, `?crt=1`, `?reducedMotion=1`, and `?offlineRig=1` override initial runtime display flags cleanly.

## 2. Render Engine & Atlas Contract (`src/contracts/render.ts`)

- `IRenderBackend` is implemented identically by `WebGL2Backend` (`src/graphics/engine/WebGL2Backend.ts`) and `Canvas2DBackend` (`src/graphics/engine/Canvas2DBackend.ts`).
- `RenderEngine` (`src/graphics/engine/RenderEngine.ts`) negotiates backend capability, detects software rasterizers (SwiftShader/llvmpipe) under `auto` mode, hooks `webglcontextlost` / `webglcontextrestored` with automatic live fallback to `Canvas2DBackend`, clamps `dt <= 0.05` seconds (50 ms), and exposes `window.__STARLIGHT_DEBUG__` diagnostics for automated verification.
- `AtlasManifest` (`public/atlases/manifest.json`) declares deterministic PNG sprite sheets (`terrain-atlas.png`, `terrain-normal.png`, `terrain-emissive.png`, `props-atlas.png`, `characters-atlas.png`), `biomeTileRowMap` across all 19 biomes, and `iconIds`.

## 3. Procedural Asset Baker & CI Contract (`scripts/bake-assets.mjs`, `.github/workflows/deploy.yml`)

- Running `npm run bake` twice in succession MUST produce byte-identical output files (`public/atlases/*.png`, `public/atlases/manifest.json`, `public/icons/starlight-icons.svg`, `public/icons/starlight-emblem.svg`).
- `public/icons/starlight-icons.svg` MUST define `<symbol id="...">` entries for every `IconId` in `src/contracts/ui.ts`:
  - Core items & HUD: `icon-pokeball`, `icon-starball`, `icon-potion`, `icon-super-potion`, `icon-star-shard`, `icon-composure`, `icon-briefing`, `icon-waypoint`, `icon-shrine`, `icon-chest`, `icon-fountain`, `icon-signpost`, `icon-starfall`, `icon-pokedex`, `icon-badges`, `icon-style`, `icon-skyhop`, `icon-settings`, `icon-audio-on`, `icon-audio-off`, `icon-crt`, `icon-motion`, `icon-save`, `icon-bond`, `icon-star-rank`, `icon-crown`
  - All 18 Elemental Types: `icon-type-normal` through `icon-type-fairy`
  - All 28 Elemental & Mastery Badges: `icon-badge-1` through `icon-badge-28`
- Total `dist/` size MUST stay strictly under 25 MB (target < 5 MB).
- `.github/workflows/deploy.yml` runs on `ubuntu-latest`: `npm ci` -> `npm run bake` -> determinism check -> `npm run build` -> headless Playwright verification -> static GitHub Pages deploy (`actions/upload-pages-artifact` + `actions/deploy-pages`).

## 4. Overworld Diorama Contract (`src/contracts/overworld.ts`, `src/graphics/overworld/**`)

- Exports `OverworldRenderer` implementing `IOverworldRenderer`.
- Renders Starlight Village + all 18 canonical biomes with:
  - 47-tile autotiled ground/coastline transitions and animated shoreline surf foam
  - Translucent multi-depth water reflecting twilight sky gradients and shimmering starlight
  - Grounded cliff drop-shadows, cobblestone roads, and 18-biome signature micro-props
  - Layered tall grass that physically bends/parts around player & follower movement with smooth spring return
  - Real-time 2D point lights from cottage windows, Healing Fountains, Shrine altars, Starfall nodes, and Style Studio player auras (`starlight`, `sky-thunder`, `aurora`, `ember-crown`)
  - Dappled forest canopy sunbeams and drifting cloud shadows
  - Crisp directional multi-frame Trainer, Follower, NPC, and Rival rigs displaying live Style Studio outfits, capes, and headgear, plus footstep dust/ripple/sparkle puffs.

## 5. Battle Theater Contract (`src/contracts/battle.ts`, `src/graphics/battle/**`)

- Exports `BattleTheaterRenderer` implementing `IBattleTheaterRenderer` and `OfflineSpriteRigSynthesizer` implementing `IOfflineSpriteRigSynthesizer`.
- Renders 18 unique 5-plane parallax combat arenas with sculpted platforms, planar reflections, grounded contact shadows, and dynamic elemental lighting that shifts hue & pulses when moves execute.
- Renders high-DPI Pokémon sprites with elemental rim-light, breathing/floating idle life, anticipation lunge, hit-stop freeze frames, status overlays (`frost`, `static`, `burn`, `sleep`), and luminous hexagonal Composure shield.
- Synthesizes multi-shaded, archetype-driven elemental art rigs automatically when offline or when external sprites fail (`forceOfflineRig` or load failure) — zero flat rectangles or black silhouettes.
- Executes 18 distinct elemental VFX choreographies, spring-damped camera framing cues (`hit`, `heavyHit`, `starBall`, `rivalIntro`, `shrineGuardian`, `evolution`), and 4-tier encounter shutters (`wild`, `rare`, `rival`, `shrine`) attenuated cleanly under `prefers-reduced-motion`.

## 6. Celestial Glass UI, Collector Pokédex & Sky-Hop Contract (`src/contracts/ui.ts`, `src/ui/**`, `src/graphics/skyhop/**`, `src/styles/**`)

- Exports `CelestialUIController` (`src/ui/CelestialUIController.ts`) and `SkyHopRenderer` (`src/graphics/skyhop/SkyHopRenderer.ts`).
- **Zero-Emoji Ban**: Zero raw Unicode emoji codepoints in HUD bars, buttons, pills, badges, move cards, Pokédex, Tactical Readiness Briefing, or wayfinding markers. All icons render via `<svg class="sl-icon"><use href="#icon-..."></use></svg>`.
- **Zero Layout Shift (`CLS === 0`) & Ergonomics**: Fixed/grid-reserved containers with explicit dimensions and touch targets `>= 44x44` CSS px verified at `360x640`, `768x1024`, `1366x768`, and `1920x1080`.
- **Living Title & Dual-Profile Vista**: Animated twilight Starlight Island panorama with drifting constellations, village warm glow, and live animated previews of both `slot0` and `slot1` trainers with their lead partner.
- **1,025 Collector Holographic Pokédex**: Search/filter across all 1,025 species, interactive pointer-tilted holographic foil diffraction card scaling intensity with Star Rank (`0..5`) and Max Bond (`100`), plus live procedural Web Audio cry waveform canvas.
- **28 Elemental Badges Showcase & Style Studio Stage**: Metallic/crystalline 28-Badge collector case and live animated pedestal dressing-room preview for outfits, capes, headgear, and glowing auras.
- **Starlight Sky-Hop**: Multi-layer parallax cloud seas, shifting aurora skies, banking/gliding lead partner rig, Star Dash slipstream ribbons, swirling Plasma Vortex shaders, and particle-trailed Dread Meteors.

## 7. Red-Team & Empirical Verification Contract (`tests/redteam/**`, `tests/e2e/**`)

- Automated verification proves:
  1. Legacy v1 `localStorage` and `IndexedDB` save hydration across dual profiles with zero data loss.
  2. Live `WEBGL_lose_context` fault injection mid-overworld and mid-battle recovering cleanly with zero uncaught errors.
  3. `?renderer=canvas2d` and SwiftShader headless parity with zero timeouts.
  4. Production static build mounted under `/starlight_v2/` subpath + offline mode toggle with zero 404 requests.
  5. Zero raw emojis in UI DOM, `CLS === 0` across all 4 viewports, touch targets `>= 44px`, `prefers-reduced-motion: reduce` attenuation, and CRT scanline toggle composition.
