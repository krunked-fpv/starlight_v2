# Starlight v2 — Full `C:\dojo` Port & Super-Flashy HD-2D Pixel-Art Overhaul Implementation Plan

> **For agentic workers:** Execute via specialist git worktrees routed strictly by `.agents/agents/` capability tiers (`inherit`, `pro`, `flash`) with per-task verification and zero-residue closeout. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a complete, faithful port of `C:\dojo` (*Pokémon: Starlight Island — Complete 1,025 Gen 1–9 Edition*) inside `C:\starlight_v2`, reimagined with super-flashy, high-craft HD-2D pixel art, real single-canvas animated Pokémon sprites, normal-mapped WebGL2/Canvas2D lighting & bloom, and zero-emoji Celestial Pixel-Glass UI.

**Architecture:** `C:\dojo`'s proven game simulation (`100×84` island, 18 biomes, 61 tiles, 1,025 species, 128 moves, 38 abilities, 28 live badges, 20 shrines, 23 quests, 17 rivals, 23 chiptune tracks, Sky-Hop arcade, and `BALANCE` combat math) is ported read-only into typed modules under `src/core/dojo/**` and `src/core/save/saveHydrator.ts` (`schemaVersion: 3`). Visual assets are authored as crisp pixel-art master sheets in `assets-src/**`, deterministically packed by `scripts/bake-assets.mjs` into `public/atlases/**` (with Sobel normal & emissive maps) and `public/icons/starlight-icons.svg`, and rendered through a crisp `GL_NEAREST` hybrid WebGL2/Canvas2D engine (`IRenderBackend`) with client-side animated GIF frame decoding (`SpriteAssetLoader`).

**Tech Stack:** TypeScript 5.8, Vite 6.2 (`base: './'`), WebGL2 GLSL ES 3.00 + Canvas2D parity, Pure-Node `node:zlib` deterministic PNG/SVG baker, Web Audio procedural chiptune synth, Service Worker PWA, Vitest 3.1, Playwright 1.51.

**Spec:** `docs/superpowers/specs/2026-11-24-starlight-v2-hd2d-pixel-overhaul-design.md`

---

## Global Constraints

- **Read-only `C:\dojo`:** NEVER modify, write, delete, or touch any file inside `C:\dojo`. All edits happen strictly inside `C:\starlight_v2`.
- **100% Save Continuity (`schemaVersion: 3`):** Preserve lossless non-destructive migration of `localStorage['starlight_pokemon_save_v1']` (`profiles.violet` & `profiles.ozias`, taking priority over pre-overhaul `schemaVersion: 2` demo saves!) AND all legacy keys (`starlight_island_save`, `starlight_save_v1`, `pokemon_starlight_v1`, `starlight_profiles`, IndexedDB `starlight_v2_db` / `starlight_island_db`). Never overwrite or delete legacy keys.
- **Zero-Emoji DOM Compliance:** Zero raw Unicode emojis (`\p{Extended_Pictographic}`, `\p{Emoji_Presentation}`, `\u2600-\u27BF`, `\u2B00-\u2BFF`, `\uFE0F`) anywhere in DOM text nodes or `aria-label`/`title`/`placeholder` attributes. Every icon uses `<svg><use href="#icon-..."/></svg>` from `public/icons/starlight-icons.svg` (hidden via zero-size box, NEVER `display:none`).
- **Strict Layout & Accessibility:** `CLS < 0.001`, zero horizontal overflow, and `>= 44×44px` touch targets on all visible interactive controls across `360×640`, `768×1024`, `1366×768`, and `1920×1080`.
- **Pixel-Art Crispness & Quality Bar:** `GL_NEAREST` in WebGL2, `imageSmoothingEnabled = false` in Canvas2D, `image-rendering: pixelated` on pixel canvases. Zero procedural placeholder boxes, pink circles, yellow `+` plaza tiles, Atari stick figures, or geometric cyclops bean-dogs.
- **Relative `./` Subpath & Offline PWA:** Serves identically at `/` and `/starlight_v2/` with zero local 4xx/5xx errors; full offline reload and gameplay via `public/sw.js` with zero broken `<img>` elements and CORS-safe sprite caching (`starlight-v2-sprites-v1`).
- **Footprint & Determinism:** `dist/` strictly `< 25 MB` (`< 26,214,400` bytes). Consecutive `npm run bake` runs produce 100% byte-identical SHA-256 outputs across `public/atlases/**` and `public/icons/**` with zero network calls during build.
- **Dual Renderer Parity & Frame Pacing:** Seamless `WebGL2Backend` and `Canvas2DBackend` parity, SwiftShader software detection under `auto`, `dt <= 50ms` clamping, and zero-gap `webglcontextlost` in-place canvas hot-swap.
- **Specialist Routing & Verification Gate:** Route specialist worktrees exclusively via abstract capability tiers (`inherit`, `pro`, `flash`) in `.agents/agents/`. Gate completion on `npm run verify` (deterministic double-bake + `35+` Vitest tests + `19+` zero-retry Playwright specs) + live visual screenshot audit of every screen + zero-residue closeout.

---

## Review Focus

1. **Real `C:\dojo` Save Shadowing:** If a returning player has BOTH `starlight_pokemon_save_v1` (real Violet/Ozias save) AND an older pre-overhaul `starlight_v2_save` (`schemaVersion: 2` Lyra/Orion default), the hydrator MUST prefer `starlight_pokemon_save_v1` rather than silently hiding Violet/Ozias behind the old demo save. *(Pinned by Task 2 unit tests & Task 8 Red-Team spec)*
2. **Animated GIF Canvas Taint & Offline Fallback:** Fetching external PokéAPI/Showdown GIFs without `{ mode: 'cors' }` or caching opaque responses in `sw.js` will taint WebGL2 `texImage2D` and throw `SecurityError`; offline mode must immediately resolve to local baked pixel-art fallbacks with zero `requestfailed` console errors. *(Pinned by Task 2 `SpriteAssetLoader` tests, Task 3 SW tests, & Task 8 Offline PWA spec)*
3. **Emoji Leakage from `C:\dojo` Strings:** `C:\dojo`'s `config.js`, `world-data.js`, `battle.js`, and `pokedex.js` embed hundreds of raw Unicode emojis in biome names, NPC dialogue, battle logs, ability labels, and trait tags; every single rendered string MUST pass through the emoji-stripping + SVG icon mapper so the DOM never contains a single emoji. *(Pinned by Task 2 unit test scanning all catalog/world outputs & Task 8 Zero-Emoji Red-Team spec)*
4. **WebGL Texture Size & `dist/` Budget:** Packing 61 pixel tiles, 20 landmarks, characters, fallbacks, and 18 `480×270` battle arenas must keep every single atlas PNG `<= 2048×2048` (safe for mobile/WebGL2) and total `dist/` strictly `< 25 MB`. *(Pinned by Task 3 bake validation & Task 8 CI gate)*
5. **100×84 Reachability & Fresh-Profile Starter Lab Flow:** Porting `WORLD_MAP` (`100×84`) and fresh Violet/Ozias profiles (`team: []`, `starterId: null`) must preserve 100% BFS walkability to all 134 interactive targets + `SECRET_ARCADE_SPOT (11,12)` and must never crash when entering Title → Starter Lab → Overworld → Battle → Pokédex → Sky-Hop. *(Pinned by Task 2 `dojoParity.test.ts` & Task 8 dual-renderer E2E specs)*

---

## File Ownership Map (Disjoint Worktrees)

- **Task 1 (`@mara-vance`, `inherit`):** `assets-src/**`, `scripts/process-master-art.mjs` (master HD-2D pixel-art asset generation, quantization, transparency cleanup, and visual audit via `read_file`)
- **Task 2 (`@mara-vance`, `inherit`):** `src/contracts/**`, `src/core/dojo/**`, `src/core/save/saveHydrator.ts`, `src/core/index.ts`, `src/core/dojo/dojoParity.test.ts` (full read-only port of `C:\dojo` core + `schemaVersion: 3` save hydrator + CORS-safe `SpriteAssetLoader` with `ImageDecoder`/GIF89a decoder)
- **Task 3 (`@devon-park`, `flash`):** `scripts/bake-assets.mjs`, `public/atlases/**`, `public/icons/**`, `public/sw.js`, `public/manifest.webmanifest`, `.github/workflows/deploy.yml`
- **Task 4 (`@kenji-sato`, `inherit`):** `src/graphics/engine/**`, `src/graphics/shaders/**` (`GL_NEAREST` pixel crispness, tangent-space normal-map lighting, emissive bloom pass, pixel-water shader, Canvas2D parity, context-loss hot-swap + unit tests)
- **Task 5 (`@linnea-berg`, `pro`):** `src/graphics/overworld/**` (`100×84` frustum-culled pixel tilemap, 61 tiles, 47-tile autotiling, parting tall grass, animated Lead Pokémon follower, 20 landmarks, 20 shrines + readiness auras, discovery nodes, BFS path dots, Violet/Ozias live cosmetics + unit tests)
- **Task 6 (`@dante-moreau`, `pro`):** `src/graphics/battle/**` (18 bespoke `480×270` pixel-art battle vistas + animated parallax layers, crisp animated Pokémon sprites + rebuilt pixel-art offline fallback sprites, 18-type flashy pixel VFX director, Composure `BRACED!` & Shield/Buff/Ability/Trait/Shiny shaders, capture & evolution choreography, 4-mode shutters + unit tests)
- **Task 7 (`@sora-takahashi`, `pro` + `@mara-vance` app integration):** `src/ui/**`, `src/graphics/skyhop/**`, `src/styles/**`, `src/app/StarlightApp.ts`, `src/main.ts`, `index.html`, `vite.config.ts` (zero-emoji Celestial Pixel-Glass UI covering all `C:\dojo` screens + flashy pixel-art Sky-Hop + `StarlightApp` wiring + unit tests)
- **Task 8 (`@nadia-khoury`, `inherit` + `@mara-vance` closeout):** `tests/redteam/**`, `tests/e2e/**`, `playwright.config.ts`, `ARCHITECTURE.md`, `SPEC.md`, `HANDOFF.md` (19+ zero-retry Playwright specs, live screenshot visual QA of every screen, double-bake SHA-256 verification, `< 25 MB` check, zero-residue cleanup)

---

### Task 1: Curate Studio-Grade HD-2D Pixel-Art Master Assets (`assets-src/**`)

**Owner:** `@mara-vance` (`inherit`) + built-in `image-generator`

**Files:**
- Create: `scripts/process-master-art.mjs` (one-time authoring helper: chroma-key background removal, clean pixel-grid quantization, crisp dark-tinted pixel outlining, RGBA PNG export)
- Create: `assets-src/tiles/*.png` (curated crisp `32×32` pixel tiles covering all 61 `C:\dojo` tile types across all 18 biomes)
- Create: `assets-src/props/*.png` (Starlight Village cottages, Professor Willow's Lab, Secret Arcade star wall, Healing Fountain, Elemental Shrines, Treasure Chests open/closed, 6 lush biome tree styles, Lantern Posts, Signposts, and 20 named landmarks)
- Create: `assets-src/characters/*.png` (Violet, Ozias, Professor Willow, Rival, NPCs — `32×40` 4-dir × 4-frame JRPG pixel sprites, 8 headgear overlays, animated cape, 72×72 portrait busts)
- Create: `assets-src/arenas/<biome>.png` (18 bespoke `480×270` crisp pixel-art battle vistas)
- Create: `assets-src/fallbacks/*.png` (crisp `48×48` pixel-art 10-archetype + 18-type offline Pokémon sprites)
- Copy (read-only from `C:\dojo\assets\icons\`): `assets-src/icons/{icon-192,icon-512,apple-touch-icon}.png`

**Interfaces:**
- Produces: Clean, visually inspected pixel-art PNG source assets in `assets-src/**` ready for deterministic packing by `scripts/bake-assets.mjs` in Task 3.

- [ ] **Step 1:** Generate hero pixel-art master sheets via `image-generator` (18 biome pixel-art battle vistas, Starlight Village buildings & landmarks sheet, biome trees & shrine/chest/fountain props sheet, Violet/Ozias/Willow/Rival JRPG character sheets, and 10-archetype cute pixel Pokémon fallback sheet).
- [ ] **Step 2:** Write `scripts/process-master-art.mjs` to cleanly quantize battle arenas to crisp `480×270` pixel art, extract & chroma-key crisp transparent sprites/props/characters/fallbacks, and synthesize/refine cohesive 32×32 hue-shifted pixel-art tiles for all 61 `TILE` types.
- [ ] **Step 3:** Visually inspect EVERY generated PNG sheet via `read_file`. Reject and regenerate/refine any tile, building, character, fallback sprite, or arena that fails the super-flashy pixel-art bar (zero MS-Paint boxes, zero ugly blobs, zero noisy artifacts).
- [ ] **Step 4:** Verify total `assets-src/` size stays well under `10 MB` and commit `assets-src/` + `scripts/process-master-art.mjs`.

---

### Task 2: Full `C:\dojo` Core Port, `schemaVersion: 3` Save Continuity & Single-Canvas GIF `SpriteAssetLoader`

**Owner:** `@mara-vance` (`inherit`)

**Files:**
- Modify: `src/contracts/{types,render,overworld,battle,ui,index}.ts`
- Create: `src/core/dojo/{balance,worldData,config,pokemon,audio,battleEngine,skyHopEngine,overworldSim,spriteLoader,emojiSanitizer,index}.ts`
- Modify: `src/core/save/saveHydrator.ts`
- Modify: `src/core/index.ts`
- Create: `src/core/dojo/dojoParity.test.ts`

**Interfaces:**
- Consumes: Read-only `C:\dojo\js\{balance,world-data,config,pokemon,storage,audio,battle,minigame,overworld}.js` as behavioral & data reference.
- Produces:
  - Canonical `DojoBiomeId` (18 biomes), `TileId` (`0..60`), `WorldMapData` (`100×84`), `SpeciesEntry` (1..1,025), `MoveEntry` (128), `AbilityEntry` (38), `BadgeEntry` (28), `EvolutionItemEntry` (16), `TrainerStyleId` (10), `TrainerAccessoryId` (8), `TrainerAuraId` (6).
  - `StarlightSaveState` (`schemaVersion: 3`, `profiles: { violet, ozias }`, `activeTrainer`, `settings`, `migratedFromV1`) & `hydrateSaveState()` / `persistSaveState()` / `StorageManager` prioritizing `schemaVersion >= 3` → `starlight_pokemon_save_v1` → legacy keys.
  - `SpriteAssetLoader`: `loadSpeciesSprite(speciesId, opts)` decoding CORS-fetched Gen V/Showdown animated `.gif` via `ImageDecoder` + pure-JS GIF89a LZW fallback into crisp `DecodedSpriteFrames`, falling back cleanly offline or under `?offlineRig=1` to local baked pixel-art fallbacks with zero console errors or canvas taint.
  - `stripEmojis(text)` & `EMOJI_TO_ICON_ID` mapping ensuring zero raw Unicode emojis escape core data into DOM.
  - `DojoBattleController`, `DojoOverworldSim`, `DojoSkyHopController`, `DojoAudioEngine` (23 BGM themes + 1,025 cries + live PCM cry waveform tap).

- [ ] **Step 1:** Write `src/core/dojo/dojoParity.test.ts` testing:
  - Exact `100×84` map dimensions, 61 tiles, 18 biomes, 20 shrines, 36 chests, 23 NPCs, 23 quests, 17 rivals, 20 landmarks, 18 signposts, 1,025 real species (`#1 Bulbasaur`, `#25 Pikachu`, `#1025 Pecharunt`), 128 moves, 38 abilities, 28 badges, 16 evolution gems, 457 evolutions.
  - 100% BFS reachability from `(8, 15)` to all 134 interactive targets + `SECRET_ARCADE_SPOT (11,12)`.
  - 100% `1..1025` National Dex reachability via starters/biomes/shrines/evolutions.
  - `starlight_pokemon_save_v1` migration priority over pre-overhaul `schemaVersion: 2` demo saves + lossless legacy key migration + corruption fuzzing.
  - Earned economy invariants (0 starting shards/cheers, 25 steps/cheer, 50 steps/arcade charge, max 4 shards < 5 buy-in, Composure opening-hit guardrail).
  - Zero raw Unicode emojis in sanitized species/biome/move/ability/badge/dialogue outputs.
  - `SpriteAssetLoader` offline fallback & pure-JS GIF89a multi-frame decoding unit test.
- [ ] **Step 2:** Update `src/contracts/*.ts` with unified TypeScript contracts for the full `C:\dojo` port + HD-2D pixel renderer.
- [ ] **Step 3:** Port `C:\dojo` core modules cleanly into `src/core/dojo/**` and upgrade `src/core/save/saveHydrator.ts` (`schemaVersion: 3`).
- [ ] **Step 4:** Run `npx vitest run src/core/dojo/dojoParity.test.ts` and `npm run typecheck` (for core/contracts). Expected: 100% PASS.
- [ ] **Step 5:** Commit contracts + ported `C:\dojo` core + save continuity.

---

### Task 3: Deterministic HD-2D Pixel Atlas Baker, Zero-Emoji SVG Icon Pack & Offline PWA (`@devon-park`, `flash`)

**Owner:** `@devon-park` (`flash` worktree)

**Files:**
- Modify: `scripts/bake-assets.mjs`
- Regenerate: `public/atlases/{terrain-atlas,terrain-normal,terrain-emissive,props-atlas,props-normal,props-emissive,characters-atlas,fallbacks-atlas}.png`, `public/atlases/arenas/*.png`, `public/atlases/manifest.json`
- Regenerate: `public/icons/{starlight-icons,starlight-emblem}.svg`, `public/icons/{icon-192,icon-512,apple-touch-icon}.png`
- Modify: `public/sw.js`, `public/manifest.webmanifest`, `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `assets-src/**` (Task 1) and `AtlasManifest` / `IconId` contracts (Task 2).
- Produces: Deterministic PNG atlases (each `<= 2048×2048`), Sobel normal maps, emissive bloom masks, 18 biome arenas, `manifest.json` mapping all 61 tiles + props + landmarks + characters + fallbacks + arenas, expanded crisp zero-emoji `starlight-icons.svg` (covering all HUD/type/badge/gem/style/accessory/aura/readiness/trait icons), and `public/sw.js` (`starlight-v2-cache-3.0.0` + `starlight-v2-sprites-v1` CORS-safe sprite cache).

- [ ] **Step 1:** Implement pure-Node PNG decoder/encoder + deterministic atlas packing + Sobel normal-map & emissive-mask generation in `scripts/bake-assets.mjs` (reading `assets-src/**`, zero network calls, zero timestamps, Mulberry32 seed `20261124`).
- [ ] **Step 2:** Expand `starlight-icons.svg` (preserving zero-size box host styling, NEVER `display:none`) with crisp multi-stop pixel-celestial SVG symbols for all `C:\dojo` HUD/type/badge/gem/style/accessory/aura/readiness/trait icons.
- [ ] **Step 3:** Update `public/sw.js` to precache core shell + all baked atlases/arenas/icons + dynamically cache CORS-safe (`response.type === 'cors'`, `status === 200`) PokéAPI/Showdown sprites into `starlight-v2-sprites-v1` without touching `localStorage`/`IndexedDB`.
- [ ] **Step 4:** Verify deterministic double-bake (`sha256` identical across 2 consecutive `npm run bake` runs), every atlas PNG `<= 2048×2048`, total `public/` footprint `< 15 MB`.
- [ ] **Step 5:** Commit atlas baker, baked assets, and PWA updates.

---

### Task 4: Crisp `GL_NEAREST` Normal-Mapped Pixel WebGL2 & Canvas2D Render Engine (`@kenji-sato`, `inherit`)

**Owner:** `@kenji-sato` (`inherit` worktree)

**Files:**
- Modify: `src/graphics/shaders/programs.ts`
- Modify: `src/graphics/engine/WebGL2Backend.ts`
- Modify: `src/graphics/engine/Canvas2DBackend.ts`
- Modify: `src/graphics/engine/RenderEngine.ts`
- Update: `src/graphics/engine/RenderEngine.test.ts`

**Interfaces:**
- Consumes: `IRenderBackend`, `AtlasManifest`, `SpriteDrawCmd` (with `pixelCrisp`, `normalSheetId`, `rimColor`, `emissive`), `PointLight`, `WaterConfig`, `CanopyShadowConfig`, `BiomeColorGrade`.
- Produces:
  - `GL_NEAREST` texture filtering for pixel-art atlases and dynamic Pokémon sprite textures (`WebGL2Backend`) + `imageSmoothingEnabled = false` (`Canvas2DBackend`).
  - True tangent-space normal-map lighting inside `SPRITE_SHADER` / lighting pass so all pixel tiles and props respond dynamically to up to 24 real-time point lights!
  - Separate emissive contribution channel feeding the 12-tap Dual-Kawase bloom pass so lanterns, shrine crystals, lava fissures, and cottage windows radiate lush HD-2D glow.
  - Upgraded pixel-snapped starlight water shader (rippled twilight sky reflection, twinkling pixel stars, crisp caustic highlights, frothy pixel surf).
  - Seamless zero-gap `webglcontextlost` in-place canvas hot-swap, SwiftShader detection, and `dt <= 50ms` clamping.

- [ ] **Step 1:** Add failing unit tests in `RenderEngine.test.ts` verifying `GL_NEAREST` pixel-atlas binding, normal-map + emissive texture uniform binding, `imageSmoothingEnabled = false` on `Canvas2DBackend`, and seamless context-loss hot-swap with multi-sheet atlases (`terrain`, `props`, `characters`, `fallbacks`).
- [ ] **Step 2:** Upgrade `programs.ts`, `WebGL2Backend.ts`, `Canvas2DBackend.ts`, and `RenderEngine.ts`.
- [ ] **Step 3:** Run `npx vitest run src/graphics/engine/RenderEngine.test.ts`. Expected: ALL PASS.
- [ ] **Step 4:** Commit render engine upgrades.

---

### Task 5: HD-2D Pixel Overworld Renderer for `100×84` 18-Biome Starlight Island (`@linnea-berg`, `pro`)

**Owner:** `@linnea-berg` (`pro` worktree — runs in parallel with Task 6!)

**Files:**
- Modify: `src/graphics/overworld/{OverworldRenderer,AutotileRenderer,LandmarkRenderer,CharacterRigRenderer,index}.ts`
- Update: `src/graphics/overworld/OverworldRenderer.test.ts`

**Interfaces:**
- Consumes: `OverworldSceneState` (`100×84` `WORLD_MAP`, 61 tile IDs, 18 biomes, 20 shrines + readiness tiers, 36 chests, 23 NPCs, 17 rivals + readiness tiers, 20 landmarks, 18 signposts, 15 fountains, 69 lanterns, `SECRET_ARCADE_SPOT`, discovery nodes, BFS path waypoints, Violet/Ozias cosmetics + Lead Pokémon `DecodedSpriteFrames`), `IRenderBackend`, `AtlasManifest`.
- Produces: `OverworldRenderer` rendering frustum-culled `100×84` HD-2D pixel art using the baked `terrain`, `props`, and `characters` atlases (with normal & emissive maps), 47-tile crisp pixel shoreline/path/cliff edges, spring-physics parting tall grass, real animated Lead Pokémon follower (with crisp pixel fallback), real-time point lights (capped at 24 prioritized nearest lights), readiness aura rings, glowing discovery nodes, BFS stepping dots, and live Violet/Ozias outfits/headgear/capes/auras.

- [ ] **Step 1:** Update `OverworldRenderer.test.ts` covering frustum culling across the `100×84` map, all 61 tile IDs & 18 biomes, readiness aura rendering, discovery node point lights, animated follower rendering, parting tall grass displacement, and live Style Studio cosmetics (10 outfits, 8 headgear, cape, 6 auras).
- [ ] **Step 2:** Implement atlas-driven HD-2D pixel rendering across `AutotileRenderer.ts`, `LandmarkRenderer.ts`, `CharacterRigRenderer.ts`, and `OverworldRenderer.ts` (zero flat MS-Paint fallback rectangles!).
- [ ] **Step 3:** Run `npx vitest run src/graphics/overworld/OverworldRenderer.test.ts`. Expected: ALL PASS.
- [ ] **Step 4:** Commit HD-2D Overworld renderer.

---

### Task 6: Flashy HD-2D Pixel Battle Theater & 18-Type Pixel VFX Director (`@dante-moreau`, `pro`)

**Owner:** `@dante-moreau` (`pro` worktree — runs in parallel with Task 5!)

**Files:**
- Modify: `src/graphics/battle/{BattleTheaterRenderer,BattleArenas,BattleVfxDirector,OfflineSpriteRigSynthesizer,index}.ts`
- Update: `src/graphics/battle/BattleTheaterRenderer.test.ts`

**Interfaces:**
- Consumes: `BattleSceneState` (18 `C:\dojo` biomes, real animated `DecodedSpriteFrames` for player & enemy Pokémon, Composure `braced` trigger, Shield barrier, stat stage boosts, 38 ability triggers, 4 encounter traits, shiny shimmer, Poké/Great/Star Ball capture phases, evolution target), `IRenderBackend`, `AtlasManifest` (18 `arenas/<biome>.png` + `fallbacks-atlas.png`).
- Produces:
  - `BattleArenas`: Renders bespoke `480×270` pixel-art battle vistas scaled crisply + animated pixel parallax skies/clouds/embers/spores + ornate pixel pedestals + planar ground reflections + dynamic arena elemental lighting.
  - `BattleTheaterRenderer`: Renders live animated Gen V/Showdown Pokémon frames crisp (`imageSmoothingEnabled = false` / `GL_NEAREST`) inside the unified canvas with elemental rim-light, grounded shadows, breathing/lunge/hit-stop/recoil kinematics, Shield prism barrier, Stat Buff/Debuff pixel chevrons, Composure `BRACED!` hexagonal burst, Trait/Shiny sparkles, capture ball arc & wobble, evolution metamorphosis, and 4-mode encounter shutters.
  - `OfflineSpriteRigSynthesizer`: Completely rebuilt to render crisp, charming pixel-art sprites from `fallbacks-atlas.png` (palette-tinted per species/shiny with pixel starlight shimmer — ZERO geometric cyclops ovals!).
  - `BattleVfxDirector`: Super flashy 18-type pixel-art elemental VFX beams, shockwaves, pixel sparks, flame pillars, forked thunderbolts, tidal surges, frost shatters, and victory confetti.

- [ ] **Step 1:** Update `BattleTheaterRenderer.test.ts` covering all 18 `C:\dojo` biome arenas, live decoded animated sprite frame playback, crisp pixel fallback rendering (`?offlineRig=1`), all 18 elemental VFX choreographies, Composure `BRACED!` shield burst, Shield/Buff/Trait/Shiny visuals, capture arc, evolution, and reduced-motion `<= 0.22s` shutter.
- [ ] **Step 2:** Implement the upgraded `BattleArenas.ts`, `OfflineSpriteRigSynthesizer.ts`, `BattleVfxDirector.ts`, and `BattleTheaterRenderer.ts`.
- [ ] **Step 3:** Run `npx vitest run src/graphics/battle/BattleTheaterRenderer.test.ts`. Expected: ALL PASS.
- [ ] **Step 4:** Commit HD-2D Battle Theater.

---

### Task 7: Zero-Emoji Celestial Pixel-Glass UI, Flashy Pixel Sky-Hop & `StarlightApp` Integration (`@sora-takahashi`, `pro` + `@mara-vance`, `inherit`)

**Owner:** `@sora-takahashi` (`pro` worktree for `src/ui/**`, `src/graphics/skyhop/**`, `src/styles/**`) + `@mara-vance` (`src/app/StarlightApp.ts`, `src/main.ts`, `index.html`, `vite.config.ts`)

**Files:**
- Modify: `src/ui/{CelestialUIController,LivingTitleRenderer,PokedexView,BadgesShowcase,StyleStudioStage,iconHelper,index}.ts`
- Create: `src/ui/{StarterLabView,TeamBoxView,IslandGuideView,BriefingModal}.ts`
- Modify: `src/graphics/skyhop/SkyHopRenderer.ts`
- Modify: `src/styles/starlight.css`
- Update: `src/ui/CelestialUI.test.ts`
- Modify: `src/app/StarlightApp.ts`, `src/main.ts`, `index.html`, `vite.config.ts`

**Interfaces:**
- Consumes: All `src/core/dojo/**` engines, `StorageManager`, `SpriteAssetLoader`, `RenderEngine`, `OverworldRenderer`, `BattleTheaterRenderer`, `AtlasManifest`.
- Produces:
  - Complete zero-emoji Celestial Pixel-Glass UI covering all `C:\dojo` screens (Living Pixel-Art Title Vista for Violet & Ozias, Professor Willow's Starter Lab with live Style bar, clean Adventure Overworld HUD with Compass/Biome Banner/Safe & Farm Warp Dock/Interact Pill/Dialogue/Confetti/Badge Toast, Tactical Readiness Briefing Modal, Battle Command Deck + Team Switch Drawer, Unified 5-Tab Drawer `Pokédex | Team & Box | Badges | Guide | Style` with 3D holo cards & live cry waveform & Star Rank/Evolution/Buddy Cheer, Settings + Parent Zone 3s hold reset, and Starlight Sky-Hop Modal).
  - Flashy HD-2D Pixel-Art `SkyHopRenderer` (pixel aurora sky, 3 pixel cloud-sea layers, animated gliding Lead Pokémon sprite with starlight afterimages, glowing Plasma Vortexes, telegraphed Dread Meteors, Twin Storm Gates, Star Dash tunnel).
  - Clean `StarlightApp.ts` connecting pointer Tap-to-Walk BFS, Hold/Drag steering, keyboard shortcuts, audio unlock & 23 dynamic BGM tracks, autosave, and `window.__STARLIGHT_DEBUG__`.

- [ ] **Step 1:** Update `CelestialUI.test.ts` asserting strict zero-emoji static + runtime compliance across all UI files, 1,025 Pokédex search/filter (name, `#id`, type, ability, biome, Gen 1–9), 28 Badges, 10 Outfits / 8 Headgear / 6 Auras Style Studio, Starter Lab, Team/Box, Island Guide, and Sky-Hop rendering.
- [ ] **Step 2:** Implement `@sora-takahashi`'s UI views, `SkyHopRenderer.ts`, and `starlight.css` (pixel-beveled Celestial Glass theme, `CLS < 0.001`, zero horizontal overflow, `>= 44×44px` touch targets across all 4 viewports).
- [ ] **Step 3:** Wire `src/app/StarlightApp.ts`, `src/main.ts`, `index.html`, and `vite.config.ts` cleanly.
- [ ] **Step 4:** Run `npm run typecheck && npm run build && npm run test:unit`. Expected: 0 TS errors, clean `dist/` `< 25 MB`, `35+` Vitest tests PASS.
- [ ] **Step 5:** Commit UI, Sky-Hop, and `StarlightApp` integration.

---

### Task 8: Red-Team Playwright Suite, Visual Screenshot Audit & Zero-Residue Closeout (`@nadia-khoury`, `inherit` + `@mara-vance`, `inherit`)

**Owner:** `@nadia-khoury` (`inherit` worktree for `tests/**`, `playwright.config.ts`) + `@mara-vance` (visual QA & docs closeout)

**Files:**
- Update: `tests/redteam/save-continuity.spec.ts` (authentic `starlight_pokemon_save_v1` Violet/Ozias priority migration + legacy v1/v2 + corruption fuzzing)
- Update: `tests/redteam/webgl-fault-injection.spec.ts` (mid-overworld & mid-battle WebGL2 context-loss hot-swap + SwiftShader Canvas2D parity + `dt <= 50ms`)
- Update: `tests/redteam/subpath-offline-pwa.spec.ts` (`/starlight_v2/` zero-404 asset & arena loading + SW cache + cold offline reload + live offline gameplay with zero broken images)
- Update: `tests/redteam/accessibility-cls-emoji.spec.ts` (strict zero-emoji DOM scan across all screens + `CLS < 0.001` & `>= 44×44px` touch targets across 4 viewports + `prefers-reduced-motion` + CRT click-through)
- Update: `tests/e2e/full-journey.spec.ts` (dual-renderer `webgl2` & `canvas2d` end-to-end journey: Title Violet/Ozias → Starter Lab → Starlight Village Overworld Tap-to-Walk/Keyboard/Fountain/Compass/Warp → Tactical Readiness Briefing → Wild & Shrine Battle with live animated GIF route stub, Composure, Capture, Team Switch → 1,025 Pokédex + Holo Tilt + Cry Waveform → 28 Badges → Style Studio → Sky-Hop Arcade)
- Update: `ARCHITECTURE.md`, `SPEC.md`, `HANDOFF.md`

- [ ] **Step 1:** Update all 5 Playwright test suites (`19+` specs, `retries: 0`).
- [ ] **Step 2:** Run full verification gate:
  - Double-bake SHA-256 identity check (`npm run bake` twice, diff hashes)
  - `dist/` size `< 25 MB` check
  - `npm run verify` (`npm run build && npm run test:unit && npm run test:e2e`)
  - Verify `git status` inside `C:\dojo` is 100% untouched!
- [ ] **Step 3:** Capture fresh live Chromium screenshots of EVERY screen (Title, Starter Lab, Starlight Village Overworld, Forest/Lagoon/Volcano/Cavern/Rift Overworld, Battle Theater with animated sprites & VFX, Battle with `?offlineRig=1`, 1,025 Pokédex holographic card, 28 Badges, Style Studio, Sky-Hop Arcade) and inspect EVERY screenshot via `read_file`. Fix any visual blemish immediately and re-verify!
- [ ] **Step 4:** Remove all temporary worktrees and scratch directories cleanly (zero residue), update `ARCHITECTURE.md`, `SPEC.md`, `HANDOFF.md`, and run final clean `npm run verify`.
