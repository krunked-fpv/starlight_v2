# Starlight v2 — Full `C:\dojo` Port & Super-Flashy HD-2D Pixel-Art Overhaul Design

**Date:** 2026-11-24  
**Architect:** `@mara-vance` (Principal Graphics Meta-Architect & Continuity Orchestrator)  
**Target Workspace:** `C:\starlight_v2` (branch `main`)  
**Source of Gameplay Truth:** `C:\dojo` (Pokémon: Starlight Island — Complete 1,025 Gen 1–9 Edition, read-only reference)

---

## 1. Intent & Why

The user's original game in `C:\dojo` is a nearly complete, deeply crafted Pokémon RPG built for **Violet** and **Ozias** (`100×84` connected Starlight Island, 18 biomes, 1,025 real Pokémon, 128 moves, 38 abilities, 20 shrines, 23 quests, 17 rivals, 28 badges, 23 chiptune tracks, secret Sky-Hop arcade, and real animated Pokémon sprites), limited primarily by simple flat retro canvas visuals and raw Unicode emojis.

The previous `C:\starlight_v2` attempt failed on two fronts:
1. It stripped out `C:\dojo`'s real gameplay, profiles (`Violet` & `Ozias`), `starlight_pokemon_save_v1` save key, and 935 real Pokémon names into a barebones `28×18` tech demo with debug buttons on the HUD.
2. Its graphic assets looked unacceptable: crude geometric egg/bean blobs instead of real Pokémon sprites, garish yellow `+` cross plaza tiles, repetitive brick bars, flat MS-Paint rectangle houses, pink-circle trees, cartoon sine-wave shorelines, and blocky Atari stick-figure trainers.

**The goal of this sprint:** Deliver the true purpose of Starlight v2 — a **100% full-on port of `C:\dojo`'s complete game** fused with **super flashy, studio-grade HD-2D Pixel Art** (think *Sea of Stars* / *Octopath Traveler* / *Pokémon BW2 & HGSS* elevated with real-time tangent-space normal-mapped 2D lighting, emissive Dual-Kawase bloom, starlight water reflections, animated pixel VFX, and crisp zero-emoji Celestial Pixel-Glass UI).

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **100% `C:\dojo` Gameplay & Content Parity:** Full `100×84` connected world across all 18 canonical `C:\dojo` biomes (`village`, `forest`, `cave`, `water`, `volcano`, `peak`, `grove`, `desert`, `marsh`, `sanctum`, `canyon`, `reef`, `ruins`, `rift`, `faeveldt`, `atoll`, `highlands`, `crater`), all 61 tile types, 20 shrines (+ Astral Shrine Trials), 36 treasure chests, 23 NPCs, 23 field quests, 17 rival trainers (+ rotating rematches), 20 landmarks, 18 signposts, 15 healing fountains, `SECRET_ARCADE_SPOT (11, 12)` 3-knock unlock, Starlight Compass, Safe Zone & Farm Zone warps, Tap-to-Walk BFS, Hold/Drag steering with corner-slide assist, Discovery Nodes (`shimmer`, `starfall`, `mystery_cry`), Professor Willow's Lab starter selection (`Bulbasaur`, `Charmander`, `Squirtle`), all 1,025 real Pokémon (`#001–#1025`), 128 moves, 38 battle abilities, 16 evolution gems, 457 evolution rules, 28 badges with live `.check()` unlock rules, centralized `BALANCE` combat/Composure/XP/readiness math, Tactical Readiness Briefing modal, earned Star Shards / Buddy Cheer / Sky-Hop Flight Charge economy, 10 outfits / 8 headgear / 6 auras / cape toggle / custom nickname, Parent Zone 3-second hold reset, and all 23 chiptune BGM themes + 1,025 deterministic procedural cries.
- **Super Flashy HD-2D Pixel Art:** Crisp nearest-neighbor (`GL_NEAREST` / `imageSmoothingEnabled = false`) studio-grade pixel art across every tile, building, tree, shrine, landmark, character, battle arena, VFX burst, and Sky-Hop cloud sea — illuminated by WebGL2 normal-mapped 2D point lights (up to 24 lights), emissive Dual-Kawase bloom, starlight water reflection shaders, dappled sunbeams, and animated pixel particles, with full visual parity on `Canvas2DBackend`.
- **Single-Canvas Animated Real Pokémon Sprites + High-Craft Pixel Fallbacks:** Real Gen V / Showdown animated `.gif` sprites decoded client-side into frame sequences and rendered directly inside the unified `#starlight-canvas` `IRenderBackend` (so Pokémon animate fluidly in Battle, Overworld Follower, Sky-Hop, Title, and Pokédex while receiving real WebGL2 rim-light, bloom, biome LUTs, reflections, and single-canvas context-loss recovery), backed by completely rebuilt crisp pixel-art elemental fallback sprites (zero geometric bean-blobs!) offline or under `?offlineRig=1`.
- **All Operating Invariants Preserved:**
  - 100% lossless migration of `C:\dojo`'s real `localStorage['starlight_pokemon_save_v1']` (`profiles.violet` & `profiles.ozias`) **and** legacy v1/v2 keys (`starlight_v2_save`, `starlight_island_save`, `starlight_save_v1`, `pokemon_starlight_v1`, `starlight_profiles`, IndexedDB `starlight_v2_db` / `starlight_island_db`).
  - **Strict zero-emoji DOM** (100% bespoke crisp SVG icon sprite sheet, zero raw Unicode emojis anywhere in DOM text nodes or attributes).
  - **`CLS < 0.001`**, zero horizontal overflow, and **`>= 44×44px` touch targets** across `360×640`, `768×1024`, `1366×768`, and `1920×1080`.
  - Relative `./` asset resolution working identically at `/` and `/starlight_v2/`.
  - Full offline PWA playability via `public/sw.js` (precaching app shell, baked atlases, backdrops, icons, and dynamically caching CORS-safe Pokémon sprites on demand without touching `localStorage`/`IndexedDB`).
  - `dist/` total footprint strictly **`< 25 MB`** (target `~4–12 MB`).
  - Dual WebGL2 / Canvas2D parity with instant zero-gap `webglcontextlost` hot-swap and `dt <= 50ms` frame pacing.
  - Deterministic double-bake (`npm run bake` produces byte-identical SHA-256 outputs across consecutive runs with zero network calls during build).
  - Specialist worktrees routed exclusively via abstract capability tiers (`inherit`, `pro`, `flash`) in `.agents/agents/`.
  - Final completion gated on `npm run verify` (deterministic double-bake + `35+` Vitest tests + `19+` zero-retry Playwright specs) **plus visual screenshot inspection of every screen** and zero-residue closeout.

### Non-Goals
- No backend server, user accounts, cloud sync, or runtime external API dependencies beyond optional CORS-safe PokéAPI/Showdown sprite fetching (which degrades gracefully offline via SW cache + crisp local pixel fallback).
- No rewriting `C:\dojo`'s tuned `BALANCE` combat/XP/readiness math — keep `C:\dojo`'s battle-proven balance table verbatim.
- Do not modify anything inside `C:\dojo`. `C:\dojo` is read-only reference truth.

### Anti-Goals (Immediate Failure Conditions)
- **Zero procedural placeholder art:** No `fillRect` box cottages, no pink-circle trees, no flat yellow `+` cross plaza tiles, no jagged sine-wave shorelines, no Atari stick-figure trainers, no geometric cyclops/bean-dog Pokémon rigs.
- **Zero blurry upscaling of pixel art:** All pixel-art sprites, tiles, landmarks, and Pokémon sprites MUST render with crisp nearest-neighbor sampling (`GL_NEAREST` in WebGL2, `imageSmoothingEnabled = false` in Canvas2D, `image-rendering: pixelated` in CSS).
- **Zero debug cheat buttons on the player HUD:** No `Wild | Rare | Rival | Shrine` or raw biome jump dropdown cluttering the adventure HUD (debug controls remain strictly on `window.__STARLIGHT_DEBUG__` for automated E2E/Red-Team testing).
- **Zero raw Unicode emojis leaking from `C:\dojo` strings into the DOM.**

---

## 3. Approaches Considered

1. **Approach A — Graphics Redo + Partial `C:\dojo` Data Parity (`28×18` rooms):** Faster, keeps old v2 demo loop, but leaves behind `C:\dojo`'s `100×84` world, 23 quests, 20 shrines, 128 moves, 38 abilities, tap-to-walk BFS, and 23 BGM tracks.
2. **Approach B — Full `C:\dojo` Game Port + Complete Super-Flashy HD-2D Pixel-Art Overhaul *(CHOSEN)*:** Ports the entire `C:\dojo` game cleanly into `C:\starlight_v2` and replaces 100% of its visuals with dazzling, high-craft HD-2D pixel art powered by `starlight_v2`'s WebGL2/Canvas2D normal-mapped lighting, bloom, water reflections, and zero-emoji Celestial Pixel-Glass UI.
3. **Approach C — Graphics Redo Only on Existing v2 Demo:** Rejected — preserves fake `Cloverling` names, fake `Lyra/Orion` profiles, missing `starlight_pokemon_save_v1` migration, and stripped gameplay.

---

## 4. Key Architectural Decisions (Architect's Calls)

To ensure zero ambiguity across specialist worktrees, the following cross-cutting calls are locked:

1. **Master Pixel-Art Sourcing & Granularity (`assets-src/` → `scripts/bake-assets.mjs`):**
   - **Art Generation:** `@mara-vance` invokes the host harness's built-in `image-generator` subagent during Phase 1 to author lush 16-bit/32-bit pixel-art master sheets, post-processed via `scripts/process-master-art.mjs` (pixel-grid alignment, palette quantization, clean chroma-key transparency, dark-tinted pixel outlines) and visually audited via `read_file` before committing into `assets-src/`. Once committed, `npm run bake` (`scripts/bake-assets.mjs`) is **100% offline, deterministic, and network-free**.
   - **61 Tiles × 47-Tile Autotiling:** `assets-src/tiles/` stores curated `32×32` high-craft pixel base tiles covering all 61 `TILE` IDs (plus multi-frame animated water/lava & tall-grass/flower overlays). `scripts/bake-assets.mjs` and `AutotileRenderer` deterministically composite crisp pixel-stepped 47-tile edge bevels, shoreline surf collars, cliff overhangs, and path borders from those authored base tiles, keeping `terrain-atlas.png` compact (`<= 2048×2048`, safely below WebGL's 4096 limit).
   - **18 Battle Arenas (`480×270`):** `assets-src/arenas/` holds **18 bespoke `480×270` crisp pixel-art battle vistas** (one per `C:\dojo` biome, ~35–90 KB each → ~1.2 MB total), packed/copied deterministically to `public/atlases/arenas/<biome>.png`. `BattleArenas.ts` layers animated pixel starfields/auroras, drifting pixel cloud/ember/spore parallax bands, custom biome-matched pixel pedestals, planar ground reflections, and foreground atmospheric framing on top.
2. **Canonical Save Schema (`schemaVersion: 3`) & Key Precedence:**
   - **Canonical Schema:** `starlight_v2_save` bumps to `schemaVersion: 3` adopting `C:\dojo`'s full dual-profile structure (`activeTrainer: 'violet' | 'ozias'`, `profiles: { violet, ozias }`, `team` + `box`, full `bag` with 16 `gems` + `cheerCharges` + `greatBalls` + `starBalls` + `starShards`, `pokedex: { seen, caught }`, `badges`, `shrinesCleared`, `shrineTrialCounts`, `questsCompleted`, `rivalsDefeated: string[]`, `openedChests`, `pos: { x, y, dir }` on `100×84`, `appearance`, `arcade`, `stats`) plus Starlight v2 `settings` and `migratedFromV1` provenance.
   - **Precedence Rule (Protects Real Returning Players):**
     1. Valid `starlight_v2_save` with `schemaVersion >= 3` (`v2-local`).
     2. **`localStorage['starlight_pokemon_save_v1']`** (real `C:\dojo` save for Violet & Ozias — checked BEFORE any pre-overhaul `schemaVersion: 2` demo save so real progress is never shadowed by earlier `Lyra`/`Orion` demo writes!).
     3. Legacy v1/v2 keys (`starlight_island_save`, `starlight_save_v1`, `pokemon_starlight_v1`, `starlight_profiles`, pre-overhaul `schemaVersion: 2`, IndexedDB `starlight_v2_db` / `starlight_island_db`) via best-effort lossless remapping (`slot0→violet`, `slot1→ozias`, old biome IDs mapped to nearest `C:\dojo` biome safe tile, old `badge-*` slugs mapped to canonical `C:\dojo` badge IDs, `superPotions→potions`), leaving all legacy keys byte-identically untouched.
   - `tests/redteam/save-continuity.spec.ts` is updated to assert both authentic `starlight_pokemon_save_v1` (Violet & Ozias) migration and legacy/corrupted/fuzzed payload recovery.
3. **`C:\dojo` Strictly Wins on All Gameplay Mechanics:**
   - **18 Biomes:** Exact `C:\dojo` 18 biomes (`village`..`crater`).
   - **Combat & Composure:** Exact `C:\dojo` `BALANCE.combat` mechanics (`attack | heal | buff | shield`, stat stages `[-4, +4]`, `0.68×` shields, 38 abilities, 4 encounter traits `curious`/`treasure`/`spirited`/`apex`). Composure is `C:\dojo`'s passive full-HP opening-hit anti-OHKO guardrail — rendered with a flashy hexagonal **`BRACED!` Composure shield flash & shatter VFX** (no fake depleting `0..100` poise meter and no non-`C:\dojo` status ailments). Instead, Battle Theater renders dedicated flashy shaders/auras for `C:\dojo`'s real states: active **Shield Barrier**, **Stat Buff/Debuff auras**, **38 Ability trigger bursts**, **Encounter Trait glow**, and **Shiny Starlight Shimmer**.
   - **First-Run Flow:** Fresh profiles (`starterId: null`, `team: []`) select Violet or Ozias → open **Professor Willow's Lab** (`Bulbasaur`, `Charmander`, `Squirtle` + live Trainer Style bar) → enter Starlight Village at `(8, 15)`. Returning / migrated profiles with a team enter straight into their saved `(x, y)` on the `100×84` island.
   - **CRT Default:** `crtMode: false` by default so crisp HD-2D pixel art shines cleanly; `?crt=1` or the Settings toggle activates CRT scanlines with `pointer-events: none`.
4. **Single-Canvas Animated `.gif` Sprite Architecture (`SpriteAssetLoader`):**
   - Rather than splitting Battle Theater into two canvases with a DOM `<img>` sandwich, `SpriteAssetLoader` decodes animated `.gif` Pokémon sprites client-side into crisp pixel frame arrays (`ImageBitmap[]` + frame delays) using Chromium's WebCodecs `ImageDecoder` with a compact zero-dependency GIF89a LZW frame-decoder fallback.
   - **Result:** Real Gen V / Showdown animated Pokémon **animate smoothly at full frame rate inside the single `#starlight-canvas` `IRenderBackend`** across **Battle Theater, Overworld Follower, Sky-Hop Arcade, Living Title Vista, and Collector Pokédex**, receiving full WebGL2 elemental rim-light, bloom, biome LUTs, reflections, GPU CRT, and zero-gap single-canvas `webglcontextlost` recovery!
5. **CORS-Safe Sprite Fetching & Zero-404 / Offline-PWA CI Contract:**
   - `SpriteAssetLoader` fetches external PokéAPI/Showdown sprites strictly with `{ mode: 'cors' }` (`raw.githubusercontent.com` serves `Access-Control-Allow-Origin: *`), preventing canvas/WebGL2 taint (`SecurityError`), and stores successful `200 OK` responses in SW cache `starlight-v2-sprites-v1`.
   - To avoid expected CDN 404 noise on Gen 8–9 `back/*.gif` assets, `#1–649` request Gen V animated `front`/`back` `.gif`, while `#650–1025` request Showdown `front` `.gif` (mirrored/framed cleanly for back view) → `official-artwork` PNG → local crisp pixel fallback, and offline / `?offlineRig=1` mode serves local baked pixel-art fallbacks directly without firing doomed external requests.
   - Playwright CI gates strictly enforce **zero 4xx/5xx, zero `requestfailed`, zero `console.error`, and zero broken `<img>`** across all same-origin assets and offline PWA runs, and test live animated GIF decoding deterministically via local `page.route` fixture interception (zero external CDN flakiness in CI).

---

## 5. Subsystem Architecture

### 5.1 Core Domain Layer (`src/core/dojo/**` & `src/core/save/saveHydrator.ts`)

| Module | Ported Responsibility (from `C:\dojo`) | v2 Enhancement |
| --- | --- | --- |
| `src/core/dojo/balance.ts` | Exact deep-frozen `BALANCE` table + all combat/Composure/XP/bench/readiness pure math. | Full TypeScript types; zero-emoji readiness metadata (`iconId`). |
| `src/core/dojo/worldData.ts` | Exact `100×84` `WORLD_MAP`, 61 `TILE` IDs, `SOLID_TILES`, 18 `BIOMES`, 20 `SHRINES`, 36 `CHESTS`, 23 `NPCS`, 23 `FIELD_QUESTS`, 17 `RIVAL_TRAINERS`, 20 `LANDMARKS`, 18 `SIGNPOSTS`, `SECRET_ARCADE_SPOT (11,12)`, walkability, compass, `getPlayerLevel`, Safe/Farm warps, `getTileDepthInfo`. | Precomputed 47-tile autotile bitmasks & 18 biome color-grade LUTs; emoji-free strings + `IconId` mapping. |
| `src/core/dojo/config.ts` | Complete **1,025 `SPECIES`**, 18 `TYPES` & `TYPE_CHART`, **128 `MOVES`**, **38 `ABILITIES`**, **16 `EVOLUTION_ITEMS`**, **457 `EVOLUTIONS`**, **28 `BADGES`** (with `.check()`), `TRAINERS` (`violet`, `ozias`), **10 `TRAINER_STYLES`**, **8 `TRAINER_ACCESSORIES`**, **6 `TRAINER_AURAS`**, `STARTER_IDS`, `getSpriteUrls`. | Every emoji mapped to semantic `IconId`; clean TypeScript exports. |
| `src/core/dojo/pokemon.ts` | `Pokemon` class, stat/damage/capture math, scaling, non-repeating encounter decks, 4 traits, 38 ability hooks, bond tiers, plus single-canvas `SpriteAssetLoader` (CORS fetch + `ImageDecoder` / GIF89a decoder + pixel fallback). | Decoupled from DOM `<img>` so WebGL2/Canvas2D renders live animated GIF frames everywhere. |
| `src/core/save/saveHydrator.ts` | `StorageManager` + `schemaVersion: 3` hydrator with `starlight_pokemon_save_v1` priority migration, legacy key migration, IndexedDB mirror, UID dedup, Pokédex ancestor recovery, walkable position repair, earned economy guards, and Parent Zone reset. | Lossless across both real `C:\dojo` saves and adversarial/legacy payloads. |
| `src/core/dojo/audio.ts` | Full procedural Web Audio chiptune synth: 23 `THEMES`, 1,025 deterministic Pokémon cries, SFX, warm low-pass mastering bus, synchronous mobile unlock. | Live PCM cry waveform tap for Collector Pokédex. |
| `src/core/dojo/battleEngine.ts` | 10-state combat machine, `turnToken` concurrency lock, tiered AI + Struggle, Composure guardrail, Poké/Great/Star Ball capture, Potion, Team Switch, Run, XP rubber-band & bench share, Shrine/Astral Trial/Rival/Wild rewards, pace presets. | Emits typed VFX/camera/Composure/capture/evolution events to `BattleTheaterRenderer`. |
| `src/core/dojo/skyHopEngine.ts` | Full Sky-Hop arcade rules: 3 Flight Charges (50 steps / 2 wins / 5 Star Shard buy-in), `WAVE_TEMPLATES`, Plasma Vortexes, Dread Meteors, Twin Storm Gates, Wave 5+ crosswinds, Starlight Dash, 6 skill-gated reward tiers + gem cooldown. | Typed `SkyHopState` consumed by `SkyHopRenderer`. |
| `src/core/dojo/overworldSim.ts` | Bounded Tap-to-Walk BFS (1,400 tiles, forgiving obstacle snap, auto-interact), Hold/Drag steering with corner-slide assist, keyboard controls, follower path trail, Discovery Nodes shuffle bag, step economy (Cheer / Arcade Charge), encounter grace, 450ms readiness cache, Secret Arcade 3-knock state. | Emits typed `OverworldSceneState` to `OverworldRenderer`. |

### 5.2 HD-2D Pixel Asset Baker (`assets-src/**`, `scripts/bake-assets.mjs`, `public/**`)
- `public/atlases/terrain-atlas.png` + `terrain-normal.png` + `terrain-emissive.png` (all 61 tiles across 18 biomes, crisp 32×32 pixel art + animated water/lava/grass variants)
- `public/atlases/props-atlas.png` + `props-normal.png` + `props-emissive.png` (cottages, Willow's Lab, Secret Arcade wall, healing fountain, elemental shrines, treasure chests open/closed, lush layered trees per biome, lanterns, signposts, all 20 named landmarks)
- `public/atlases/characters-atlas.png` (Violet, Ozias, Professor Willow, Rivals, Villagers — 32×40 4-dir × 4-frame JRPG pixel sprites, 8 headgear overlays, animated cape frames, portrait busts)
- `public/atlases/arenas/<biome>.png` (18 bespoke crisp `480×270` pixel-art battle vistas)
- `public/atlases/fallbacks-atlas.png` (crisp `48×48` pixel-art 10-archetype + 18-type offline Pokémon sprites — zero geometric blobs!)
- `public/atlases/manifest.json` + `public/icons/starlight-icons.svg` (expanded crisp zero-emoji SVG symbol pack) + PWA icons (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`)
- `public/sw.js` (precaches shell + all baked atlases/arenas/icons + dynamically caches CORS-safe Pokémon sprites into `starlight-v2-sprites-v1`, never touching user save storage)

### 5.3 Hybrid WebGL2 / Canvas2D Pixel Render Engine (`src/graphics/engine/**`, `src/graphics/shaders/**`)
- `GL_NEAREST` pixel-crisp texture filtering in WebGL2 and `imageSmoothingEnabled = false` in Canvas2D.
- True tangent-space normal-map lighting (`terrain-normal.png` / `props-normal.png`) lit by up to 24 real-time flickering RGB point lights.
- Emissive mask bleed (`terrain-emissive.png` / `props-emissive.png`) feeding the 12-tap Dual-Kawase bloom pass.
- Pixel-snapped starlight water reflection & animated surf-foam shader + canopy sunbeams & cloud shadows + optional CRT scanlines.
- Deterministic Canvas2D parity fallback & instant zero-gap `webglcontextlost` in-place canvas hot-swap with `dt <= 50ms`.

### 5.4 Domain Renderers & Celestial Pixel-Glass UI
- **Overworld (`src/graphics/overworld/**`):** Frustum-culled `100×84` diorama, 47-tile autotiled transitions, footstep-parting multi-blade pixel tall grass, live animated Lead Pokémon follower, 23 NPCs, 17 Rivals, 20 Shrines, 20 Landmarks, 36 Chests, 15 Fountains, 69 Lanterns, live readiness auras, discovery node light pillars, BFS path stepping dots, and live Violet/Ozias cosmetics (10 outfits, 8 headgear, cape, 6 point-light auras).
- **Battle Theater (`src/graphics/battle/**`):** 18 pixel-art parallax arenas, ornate pedestals, planar reflections, crisp animated Pokémon sprites (with elemental rim-light, idle breathing, lunge/hit-stop/recoil, Shield/Buff/Trait/Shiny/Composure `BRACED!` shaders), dazzling 18-type pixel VFX director, Poké/Great/Star Ball capture choreography, evolution light-burst, spring camera cues, and 4-mode shutters.
- **Sky-Hop (`src/graphics/skyhop/**`):** Multi-layer pixel aurora sky & cloud seas, animated gliding Lead Pokémon with pixel slipstream afterimages, glowing Plasma Vortexes, telegraphed Dread Meteors, Twin Storm Gates, and Star Dash light-speed burst.
- **Zero-Emoji Celestial Pixel-Glass UI (`src/ui/**`, `src/styles/**`):** Living Pixel-Art Title Vista (Violet & Ozias), Professor Willow's Starter Lab, clean Adventure Overworld HUD (Portrait, Lv, Lead HP, Dex, Badges, Arcade, Audio, Settings + Parent Zone, Compass, Biome Banner, Safe/Farm Warp Dock, Contextual Interact Pill, Dialogue, Celebration Confetti, Badge Toast), Tactical Readiness Briefing Modal, Battle Command Deck + Team Switch Drawer, Unified Drawer (`1,025 Pokédex` with holo cards + live cry waveform + Star Rank + Evolution + Buddy Cheer | `Team & Box` | `28 Badges` | `Island Guide` | `Style Studio`), and `Sky-Hop Modal` — strict zero-emoji compliance, `CLS < 0.001`, zero overflow, `>= 44×44px` touch targets across all 4 viewports.

---

## 6. Specialist Ownership & Verification Gate

Disjoint git worktrees routed strictly via `.agents/agents/` capability tiers:
- `@mara-vance` (`inherit`): `src/contracts/**`, `src/core/**`, `src/app/**`, `src/main.ts`, `assets-src/**` art curation & visual QA, docs & final integration.
- `@devon-park` (`flash`): `scripts/bake-assets.mjs`, `public/atlases/**`, `public/icons/**`, `public/sw.js`, `public/manifest.webmanifest`, `.github/workflows/deploy.yml`.
- `@kenji-sato` (`inherit`): `src/graphics/engine/**`, `src/graphics/shaders/**`.
- `@linnea-berg` (`pro`): `src/graphics/overworld/**`.
- `@dante-moreau` (`pro`): `src/graphics/battle/**`.
- `@sora-takahashi` (`pro`): `src/ui/**`, `src/graphics/skyhop/**`, `src/styles/**`.
- `@nadia-khoury` (`inherit`): `tests/redteam/**`, `tests/e2e/**`, `playwright.config.ts`.

**Completion Gate:**
- Deterministic double-bake SHA-256 parity + `dist/` `< 25 MB`
- `npm run verify`: `35+` Vitest tests (including `C:\dojo` `100×84` BFS & `1..1025` Dex reachability + save/economy invariants + engine/renderer tests) + `19+` zero-retry Playwright E2E/Red-Team specs across WebGL2, Canvas2D, `/starlight_v2/`, offline PWA, 4 viewports, CRT, reduced motion, and zero-emoji scan
- Mandatory visual screenshot inspection of every screen via `read_file` confirming super-flashy, cohesive HD-2D pixel art with zero trash placeholders
- Zero-residue worktree/temp cleanup and updated `ARCHITECTURE.md`, `SPEC.md`, and `HANDOFF.md`.

---

## 7. Left to the Builder

- Exact atlas packing coordinates inside `manifest.json` (within WebGL 4096 texture limit and `< 25 MB` total `dist/`).
- Fine shader tuning constants (normal strength, bloom intensity, water ripple frequency, biome color-grade saturation) validated empirically against live screenshots.
- Exact CSS grid/flex spacing breakpoints preserving `CLS < 0.001` and `>= 44×44px` touch targets across all 4 viewports.
