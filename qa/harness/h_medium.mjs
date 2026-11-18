import { launch, check, note, finish } from './lib.mjs';
const g = await launch({ w: 960, h: 540 });
const { page, ev, tp, wait, waitFor, click } = g;
await g.startGame('biologist');
await tp(-215, 60, 4000);
await page.keyboard.press('Escape'); await waitFor(() => Boolean(document.querySelector('[data-testid="pause"]')), undefined, 60000);
await ev(() => [...document.querySelectorAll('[data-testid="set-quality"] button')].find((b) => b.textContent.trim() === 'Medium').click()); await wait(500); await click('pause-resume');
const c0 = await ev(() => window.__WO__.runtime.time.real); await waitFor((c0) => window.__WO__.runtime.time.real > c0 + 0.25, c0, 240000); await wait(2000);
const p = await g.perf(); const f = await g.frame();
check('Medium preset in the rainforest stays under 2 million triangles a frame (shadow pass included)', p.tris < 2000000 && f.distinct > 40, JSON.stringify(p));
await g.shot('medium-forest-after');
// squirrel portrait after the tail fix
finish('h_medium', g.diag);
await g.browser.close();
