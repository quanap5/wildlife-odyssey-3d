# Prompts and work passes

The game was built in a series of passes, each started by a prompt. This folder keeps the prompts that were supplied as files, and records the others.

| # | Date (2026) | Pass | Prompt | Outcome |
|---|---|---|---|---|
| 1 | 11 Nov | Build the game | [`01-master-prompt.md`](01-master-prompt.md) (verbatim) | Playable game; see `docs/implementation-status.md` |
| 2 | 11 Nov | Art direction | Given in chat, not kept verbatim. Asked for a nature-documentary look across vegetation, terrain, trees, wildlife, water, light and atmosphere, photo mode, journal interface, discovery feedback and a living environment, using licensed assets where available and procedural ones otherwise | "Art pass" section of `docs/implementation-status.md`; art direction in `docs/game-design.md` |
| 3 | 11 Nov | End-to-end QA | Given in chat, not kept verbatim. Asked for an independent test of the whole player flow in a real browser, with every failure reproduced, fixed and regression-tested, and no unexecuted test reported as passed | `docs/qa-report.md` (110 checks, 4 defects fixed) |
| 4 | 12 Nov | Beginner handbook | Given in chat (Vietnamese): a learning document on the tech stack, architecture and diagrams, plus a learning roadmap for new game programmers | `docs/handbook.html` |
| 5 | 13 Nov | Typeface | Given in chat: apply the "D" pairing (Chakra Petch, Be Vietnam Pro, JetBrains Mono) | Bundled fonts; `docs/asset-licenses.md` |
| 6 | 13 Nov | Minimap, views, hand-held tools, HUD badges, Quick View | [`06-hud-features-prompt.txt`](06-hud-features-prompt.txt) (verbatim) | In progress on the `feature/hud-minimap-held-items` branch; not part of `main` |

Rules that every pass carried, quoted from the prompts:

- "Do not replace working game features with static visual demonstrations."
- "Preserve all existing gameplay systems, species data, save files, and controls."
- "Do not report a feature as complete until it is implemented and verified."
- "Do not report unexecuted tests as passed."
