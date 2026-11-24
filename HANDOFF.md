# STARLIGHT V2 — SPRINT HANDOFF

## Shipped Capabilities & Visual Subsystems
- **Hybrid Engine (`src/graphics/engine/`, `src/graphics/shaders/programs.ts`)**: 5 GLSL ES 3.00 shaders (sprites, starlight water reflections + surf foam, 24-light filmic lighting + canopy sunbeams/cloud shadows, Dual-Kawase bloom + biome LUT + CRT scanlines, additive particles) paired with `Canvas2DBackend` parity, SwiftShader detection, `dt <= 50ms` clamping, and zero-gap `webglcontextlost` canvas hot-swap.
- **Asset Baker & Offline PWA (`scripts/bake-assets.mjs`, `public/sw.js`)**: Deterministic pure-Node baker (`seed 20261124`) producing 5 byte-identical RGBA/normal/emissive PNG atlases and 72 multi-stop SVG icons (zero raw emojis). Static `./` build (`dist/` ~1.50 MB) runs identically at `/` and `/starlight_v2/` with Service Worker precaching of hashed Vite bundles.
- **Overworld (`src/graphics/overworld/`)**: Starlight Village + 18 biomes with 47-tile autotiles, surf foam, starlight water, parting tall grass, 12 micro-props, real-time landmark/aura point lights, and live Style Studio Trainer/Follower/NPC/Rival rigs.
- **Battle Theater (`src/graphics/battle/`)**: 19 5-plane parallax arenas, 10-archetype multi-shaded `OfflineSpriteRigSynthesizer`, 18-type VFX, status & hexagonal Composure shields, 7 spring camera cues, and 4-tier shutters.
- **Celestial UI & Sky-Hop (`src/ui/`, `src/graphics/skyhop/`, `src/styles/starlight.css`)**: Living twilight Title Vista with dual-profile previews, Tactical Readiness Briefing, 1,025 collector holographic Pokédex + live cry waveform, 28 Badges showcase, live Style Studio stage, and aurora/cloud Sky-Hop arcade.

## Verified Invariants & Boundaries
- **Verified Green**: 35/35 Vitest unit tests, 19/19 zero-retry Playwright E2E/Red-Team specs, byte-identical double bake, and live browser audit across WebGL2 (`/starlight_v2/`) and Canvas2D (`/`) with 0 console/page/network errors, 0 emojis, `CLS < 0.001`, and `>= 44x44px` touch targets across 4 viewports.
- **Boundaries**: Offline elemental rigs replace remote `<img>` fetches to guarantee zero broken offline sprites; software SwiftShader WebGL2 scales to `0.55x` while real GPUs run up to `2x` DPR; Web Audio unlocks on first gesture.

## Local Launch, Bake & Deployment
- Run locally: `npm ci && npm run dev` (or `npm run build && node tests/redteam/subpath-server.mjs` for `/` and `/starlight_v2/`).
- Full gate: `npm run verify`. CI/CD (`.github/workflows/deploy.yml`) validates deterministic bake, `< 25 MB` `dist/`, and Playwright on `ubuntu-latest` before GitHub Pages deploy.

## Next-Sprint Opportunities
1. Layer optional cached remote PokéAPI sprites atop `OfflineSpriteRigSynthesizer` with instant offline fallback.
2. Add multi-trainer Shrine gauntlets, island quests, and live Battle Dock Party Swap UI.
3. Add WebGL2 normal-map specular reflections on metallic/crystalline shrines and water caustics.
