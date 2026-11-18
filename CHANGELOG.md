# Changelog

Dates are 2026. What was verified, and how, is recorded per feature in `docs/implementation-status.md`.

## Unreleased

On the `feature/hud-minimap-held-items` branch, not on `main`.

### HUD, minimap and hand-held tools (13-18 Nov)

- Corner minimap drawn on a 2D canvas from the full map's relief image: player arrow, explored area, landmarks, waypoint; N cycles three zoom levels; heading-up or north-up; size and on/off in settings.
- Over-the-shoulder third-person camera with ground, trunk and wall checks and a 0.25 s switch. Lens tools borrow first person and hand the view back. The chosen view is saved.
- Hand-held props (binoculars, camera, scanner, macro lens, map, journal, specimen tray), drawn in first person as a separate pass and carried by the avatar in third person. They are never in a photograph or a recording.
- HUD: tool bar, clock, weather, collection badge, context badges, mission-badge count, biome and coordinates under the minimap.
- Quick View: hold Q for a glance at everything collected, without pausing.
- Fix (18 Nov): Quick View ran past the bottom of a 960 x 540 window. Rows without pictures now share one line, the panel is wider, and the panel is the part of the right-hand column that gives way, so it cannot leave the window at any size.
- Fix (18 Nov): the "click to look around" hint showed through the Quick View panel.
- Tests: 192 unit tests (40 new); a fourth browser test, "HUD and hands"; `qa/quickview-layout.mjs`. Results are in `docs/implementation-status.md`.

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
