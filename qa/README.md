# QA harness

Exploratory end-to-end checks used for `docs/qa-report.md`. They are separate from the Playwright suite in `e2e/`: each script plays part of the game in real Chrome, prints `PASS` / `FAIL` lines with the measured evidence, and writes a JSON result file.

```bash
npm run build
npm run preview &            # http://127.0.0.1:4173
mkdir -p qa/out
node qa/harness/a_move.mjs   # movement, biomes, collisions, camera clipping
node qa/harness/b_wild.mjs   # wildlife census, locomotion, animation, reactions
node qa/harness/c_tools.mjs  # scanner, zoom, focus, photo sizes, video, slow motion, inspection
node qa/harness/d_mission.mjs# missions 1 and 2 by play, save, reload, media persistence
node qa/harness/e_info.mjs   # all species pages in both languages, journal, menus, save on a structure
node qa/harness/f_perf.mjs   # presets, performance overlay, adaptive resolution, memory
node qa/harness/g_visual.mjs # all 36 species portraits
node qa/harness/h_medium.mjs # Medium preset triangle budget in the rainforest
node qa/harness/fonts.mjs    # bundled typefaces: family per role, Vietnamese and italic faces, clipped text
```

The scripts launch system Chrome with software WebGL so they run without a GPU; on such a machine each takes 4-13 minutes. `ruins.mjs` is the follow-up probe for the ruins platform.

They use the game's debug handle (`window.__WO__`) to place the player and aim the camera; movement, tools and menus go through real input.
