import { launch, check, note, section, finish } from './lib.mjs';
const g = await launch({ lang: 'en' });
const { page, ev, pos, face, tp, wait, waitFor, click, exists, text } = g;
await page.goto('http://127.0.0.1:4173/');
await page.waitForSelector('[data-testid="main-menu"]', { timeout: 180000 });
await section('14 verification labels', async () => {
  await click('menu-guide'); await page.waitForSelector('[data-testid="guide-panel"]', { timeout: 30000 });
  const r = await ev(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const panel = document.querySelector('[data-testid="guide-panel"]'); const ids = [...panel.querySelectorAll('[data-testid^="species-card-"]')].map((c) => c.getAttribute('data-testid').replace('species-card-', '')); let unTax = 0, unStatus = 0, verTax = 0, both = 0; for (const id of ids) { panel.querySelector(`[data-testid="species-card-${id}"]`).click(); for (let i = 0; i < 60; i++) { if (document.querySelector('[data-testid="species-page"]')?.getAttribute('data-species') === id) break; await sleep(40); } await sleep(60); const t = document.querySelector('[data-testid="species-page"]').innerText; const a = /Classification not yet checked/.test(t); const b = /Conservation status not yet checked/.test(t); if (a) unTax++; if (b) unStatus++; if (/Classification checked against/.test(t)) verTax++; if (a && /Classification checked against/.test(t)) both++; } return { n: ids.length, unTax, unStatus, verTax, both }; });
  check('14 every species says whether its classification was checked; 26 say it was not', r.unTax + r.verTax === 36 && r.unTax === 26 && r.both === 0, JSON.stringify(r));
  await click('panel-close');
});
await g.startGame('biologist');
const settings = () => ev(() => { const s = window.__WO__.store.getState().settings; return { q: s.quality, scale: s.renderScale, sh: s.shadows, veg: s.vegetation, dd: s.drawDistance }; });
const settle = async (frames = 3, timeout = 240000) => { const c0 = await ev(() => window.__WO__.runtime.time.real); await waitFor((c0) => window.__WO__.runtime.time.real > c0 + 0.25, c0, timeout); await wait(1500); };
const setQuality = async (label) => { await page.keyboard.press('Escape'); await waitFor(() => Boolean(document.querySelector('[data-testid="pause"]')), undefined, 60000); await ev((label) => [...document.querySelectorAll('[data-testid="set-quality"] button')].find((b) => b.textContent.trim() === label).click(), label); await wait(500); await click('pause-resume'); await waitFor(() => !document.querySelector('[data-testid="pause"]'), undefined, 60000); };

const rows = {};
await section('20 graphics presets', async () => {
  await tp(-215, 60, 4000);
  for (const q of ['Low', 'Medium', 'High', 'Low']) {
    await setQuality(q); await settle();
    const key = rows[q] ? q + '2' : q;
    const f = await g.frame();
    rows[key] = { ...(await settings()), ...(await g.perf()), colours: f.distinct };
    note(`${key}: ${JSON.stringify(rows[key])}`);
    if (q === 'Medium') await g.shot('preset-medium-forest');
  }
  check('20 each preset applies its settings', rows.Low.sh === 'off' && rows.Medium.sh === 'low' && rows.High.sh === 'high' && rows.Low.dd === 'low' && rows.Medium.dd === 'medium' && rows.High.dd === 'high' && rows.Low.scale === 0.75 && rows.Medium.scale === 1, `${rows.Low.sh}/${rows.Medium.sh}/${rows.High.sh} shadows, ${rows.Low.dd}/${rows.Medium.dd}/${rows.High.dd} distance, scale ${rows.Low.scale}/${rows.Medium.scale}/${rows.High.scale}`);
  check('20 render resolution follows the preset', rows.Low.w === 720 && rows.Medium.w === 960 && rows.High.w === 960, `${rows.Low.w}x${rows.Low.h} / ${rows.Medium.w}x${rows.Medium.h} / ${rows.High.w}x${rows.High.h}`);
  check('20 scene detail rises Low < Medium < High and every preset renders', rows.Low.tris < rows.Medium.tris && rows.Medium.tris < rows.High.tris && [rows.Low, rows.Medium, rows.High].every((r) => r.colours > 40), `${Math.round(rows.Low.tris / 1000)}k / ${Math.round(rows.Medium.tris / 1000)}k / ${Math.round(rows.High.tris / 1000)}k triangles; chunks ${rows.Low.chunks}/${rows.Medium.chunks}/${rows.High.chunks}`);
  check('20 draw calls stay bounded on every preset', [rows.Low, rows.Medium, rows.High].every((r) => r.calls < 600), `${rows.Low.calls} / ${rows.Medium.calls} / ${rows.High.calls} calls in the rainforest`);
  check('20 switching presets back and forth does not leak GPU resources', rows.Low2.geo <= rows.Low.geo * 1.15 + 20 && rows.Low2.tex <= rows.Low.tex + 2, `geometries ${rows.Low.geo} -> ${rows.Medium.geo} -> ${rows.High.geo} -> ${rows.Low2.geo}; textures ${rows.Low.tex} -> ${rows.Medium.tex} -> ${rows.High.tex} -> ${rows.Low2.tex}; programs ${rows.Low.prog} -> ${rows.Low2.prog}`);
});

await section('20 performance tools', async () => {
  await page.keyboard.press('F3'); await wait(1500);
  const t = await text('perf');
  check('20 performance overlay reports fps, frame time, draw calls, triangles, resolution, objects and GPU resources', /FPS/.test(t) && /frame/.test(t) && /draw calls/.test(t) && /triangles/.test(t) && /render/.test(t) && /plants/.test(t) && /GPU/.test(t), t.replace(/\s+/g, ' ').slice(0, 220));
  await page.keyboard.press('F3');
  const s0 = await ev(() => window.__WO__.runtime.perf.renderScale);
  await ev(() => window.__WO__.store.getState().setSetting('adaptive', true));
  const dropped = await waitFor((s0) => window.__WO__.runtime.perf.renderScale < s0 - 0.01, s0, 60000);
  const s1 = await ev(() => window.__WO__.runtime.perf.renderScale);
  check('20 adaptive resolution lowers the render scale when the frame rate is low', dropped, `scale ${s0} -> ${s1} at ${(await g.perf()).fps} fps`);
  await ev(() => window.__WO__.store.getState().setSetting('adaptive', false));
});

await section('memory', async () => {
  const hubs = [[40, 120], [-215, 60], [140, 56], [188, 196], [-70, -292], [-320, 318]];
  const laps = [];
  for (let lap = 0; lap < 3; lap++) { for (const [x, z] of hubs) await tp(x, z, 3200); const p = await g.perf(); laps.push({ heap: await g.heap(), geo: p.geo, tex: p.tex, prog: p.prog }); note(`lap ${lap + 1}: ${JSON.stringify(laps[lap])}`); }
  check('no memory growth across three laps of all biomes (JS heap)', laps[2].heap <= laps[0].heap * 1.2 + 5, laps.map((l) => l.heap + ' MB').join(' -> '));
  check('no GPU resource growth across three laps', laps[2].geo <= laps[0].geo + 10 && laps[2].tex <= laps[0].tex + 1 && laps[2].prog <= laps[0].prog + 1, laps.map((l) => `${l.geo} geo/${l.tex} tex/${l.prog} prog`).join(' -> '));
});

await section('visual', async () => {
  await ev(() => window.__WO__.store.getState().setSetting('drawDistance', 'medium'));
  await tp(-70, -292, 6000); await ev(() => { const w = window.__WO__; w.lookAt(40, 10, 0); }); await wait(6000);
  await g.shot('seams-view');
  await tp(64.5, 100, 5000); await ev(() => { const w = window.__WO__; const p = w.runtime.player.pos; w.lookAt(64, p.y + 0.6, p.z - 60); }); await wait(5000);
  await g.shot('seams-ground');
  check('screenshots captured for terrain seam inspection', true, 'seams-view.png, seams-ground.png');
});
finish('f_perf', g.diag);
await g.browser.close();
