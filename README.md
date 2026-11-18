# Wildlife Odyssey 3D — The Living World

A browser-based 3D wildlife exploration and scientific discovery game. Explore Emerald Valley Research Reserve, observe 36 real Southeast Asian species, photograph and film them, and build a field journal. Vietnamese and English.

Built with React, TypeScript, Vite, Three.js (React Three Fiber, Drei), Zustand and Rapier. Everything you see and hear is generated procedurally at run time; there is no backend.

**Status:** version 0.1.0. The full acceptance scenario passes in automated browser tests. Frame rate on a real GPU, audio, and browsers other than Chrome have not been tested; see [`docs/implementation-status.md`](docs/implementation-status.md) for what was verified and how.

Developed and tested with Node.js 22 (Vite 8 needs Node.js 20.19 or newer, or 22.12 or newer). The browser tests also need Google Chrome installed.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

Production build (static files in `dist/`, relocatable — `base: './'`):

```bash
npm run build
npm run preview    # http://127.0.0.1:4173
```

Deploy by copying `dist/` to any static host. No server-side code or environment variables are required.

## Checks

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit (strict)
npm run test       # Vitest unit tests
npm run test:e2e   # Playwright, runs against `npm run preview` in system Chrome
npm run check      # lint + typecheck + unit tests + build
```

`npm run build` must have been run before `npm run test:e2e`. The browser tests use software WebGL (SwiftShader) so they work without a GPU; on such machines the four tests take about 15 minutes in total.

## Controls

| Input | Action |
|---|---|
| W A S D | Move |
| Mouse (click to capture) / arrow keys | Look around |
| Shift | Sprint |
| Ctrl | Crouch; dive while swimming |
| Space | Jump |
| E | Interact / inspect |
| F | Bio scanner |
| C | Camera (T switches photo / video, 1-4 or wheel zoom, [ ] exposure, R size, O depth of field, - = aperture, G composition guides, H hide UI) |
| B | Binoculars |
| X | Macro lens |
| Z | Slow motion 1.0 / 0.5 / 0.25x |
| V | First person / over-the-shoulder third person (lens tools always use first person) |
| N | Minimap zoom: near, medium, far |
| Q (hold) | Quick View of everything collected so far; release to close |
| M | Map (click to set a waypoint) |
| J | Field journal |
| I | Inventory |
| Tab | Equipment wheel |
| F3 | Performance overlay |
| Esc | Pause and settings (minimap on/off, orientation and size; hand-held items on/off) |

If the browser refuses pointer capture (for example inside a sandboxed frame), drag with the mouse or use the arrow keys to look.

## Repository layout

```
src/
  app/          application shell and the 3D canvas
  engine/       rendering loop, input, physics, audio, camera maths
  world/        terrain, vegetation, water, weather, structures
  entities/     player and wildlife (models, behaviour, animation)
  systems/      photography, video, identification, quests, persistence, interaction
  ui/           HUD, tool overlays, journal, map, menus
  data/         species, biomes and quests (JSON and typed tables)
  i18n/         Vietnamese and English strings
  store/        game state (Zustand) and per-frame runtime state
  assets/fonts/ bundled typefaces
  tests/        unit tests (Vitest)
e2e/            browser tests (Playwright)
qa/harness/     exploratory QA scripts behind docs/qa-report.md
qa/quickview-layout.mjs  HUD and Quick View layout check at four window sizes, both languages
scripts/        maintenance scripts
docs/           design, architecture, status, QA report, handbook, prompts
public/         files copied as-is into the build (font licence)
```

## Documentation

- `docs/game-design.md` — design, biomes, tools, expeditions
- `docs/architecture.md` — module layout and decisions
- `docs/implementation-status.md` — feature checklist, test results, known issues
- `docs/performance.md` — budgets, measurements, settings
- `docs/qa-report.md` — end-to-end QA pass: verified checklist, defects found and fixed, what was not executed
- `docs/handbook.html` — sổ tay cho người mới (tiếng Việt): tech stack, kiến trúc, bảy sơ đồ, roadmap học lập trình game
- `docs/species-sources.md` — species list with verification state and sources
- `docs/asset-licenses.md` — asset provenance, bundled fonts and dependency licences
- `docs/prompts/` — the prompts each work pass started from
- `CHANGELOG.md` — what changed in each pass

The interface fonts (Chakra Petch, Be Vietnam Pro, JetBrains Mono; SIL Open Font License 1.1) are bundled in `src/assets/fonts/`, so the game needs no network access for them. Their licence text is in `public/licenses/FONTS-OFL.txt` and must stay with any copy of the build.

## Adding a species

1. Add a record to `src/data/species/animals.json` or `plants.json`.
2. Animals: add a behaviour profile and a habitat group in `src/entities/wildlife/profiles.ts` and a parameter recipe in `src/entities/wildlife/models.ts`. Plants: add metadata and a builder in `src/world/vegetation/plantModels.ts` and list the plant in a biome in `src/data/biomes/biomes.ts`.
3. Add its sources to `src/data/species/verification.json` once checked, then run `node scripts/species-report.mjs`.
4. `npm run test` — the catalog tests check schema, wiring and localisation.

## Licence

Code: MIT, see [`LICENSE`](LICENSE). Bundled fonts: SIL Open Font License 1.1, see `public/licenses/FONTS-OFL.txt`. Dependency licences are listed in `docs/asset-licenses.md`.
