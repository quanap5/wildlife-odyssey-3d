# Changelog

Dates are 2026. What was verified, and how, is recorded per feature in `docs/implementation-status.md`.

## Unreleased

On the `feature/hud-minimap-held-items` branch, not on `main`:

- Corner minimap (N cycles zoom), over-the-shoulder third-person camera, hand-held research tools, HUD badges and tool bar, Quick View of collected items (hold Q).
- State: implemented; lint, typecheck and unit tests pass on the branch. The new browser test does not pass yet, the existing browser suite has not been re-run against it, and the documentation has not been updated. See the branch's commit message.

## 0.1.0 — 13 Nov

First complete version.

### Game (11 Nov)

- 1 km² procedural reserve with five biomes, day and night, weather, water, structures.
- 36 real Southeast Asian species (22 animals, 14 plants) in Vietnamese and English; 22 animal species simulated with a behaviour state machine.
- Research tools: camera with scored photographs, video recording with slow-motion review, binoculars, bio scanner, macro lens, 3D inspection.
- Field journal, map with waypoint, five research missions, save and load in IndexedDB.
- Unit tests (Vitest) and browser tests (Playwright) covering the 30-step acceptance scenario.

### Art pass (11 Nov)

- Leaf-card canopies, ground cover, terrain shader, water, atmosphere particles, animal coat detail.
- Viewfinder guides and aperture, discovery card, journal paper styling.

### QA pass (11 Nov)

- 110 scripted checks in real Chrome (`docs/qa-report.md`). Four defects found and fixed: insect wings freezing at some frame rates, Medium-preset triangle budget, visible soil tiling on Low, squirrel tail.

### Documentation (12 Nov)

- `docs/handbook.html`: beginner handbook in Vietnamese (tech stack, architecture, seven diagrams, learning roadmap).

### Typeface (13 Nov)

- Bundled fonts: Chakra Petch, Be Vietnam Pro, JetBrains Mono (SIL Open Font License 1.1), Latin and Vietnamese subsets.
- Fix: key-cap text on the HUD was nearly white on white.

### Known limits

Frame rate on a real GPU, audio, Firefox and Safari are untested; 26 of 36 species entries are not yet checked against sources. Full list in `docs/implementation-status.md`.
