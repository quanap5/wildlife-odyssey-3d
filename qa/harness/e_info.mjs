import { launch, check, note, section, finish } from './lib.mjs';
const g = await launch({ lang: 'en' });
const { page, ev, pos, face, tp, wait, waitFor, click, exists, text } = g;
await page.goto('http://127.0.0.1:4173/');
await page.waitForSelector('[data-testid="main-menu"]', { timeout: 180000 });

await section('14 species information in both languages', async () => {
  await click('menu-guide');
  await page.waitForSelector('[data-testid="guide-panel"]', { timeout: 30000 });
  const data = await ev(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const q = (s, root = document) => root.querySelector(s);
    const panel = q('[data-testid="guide-panel"]');
    const read = () => { const p = q('[data-testid="species-page"]'); const rows = {}; p.querySelectorAll('table.data-table tr').forEach((tr, i) => { rows[i] = [tr.querySelector('th')?.textContent.trim(), tr.querySelector('td')?.textContent.trim()]; }); return { id: p.getAttribute('data-species'), name: q('[data-testid="species-name"]').textContent.trim(), alt: q('[data-testid="species-alt-name"]').textContent.trim(), sci: q('[data-testid="species-scientific"]').textContent.trim(), sciItalic: getComputedStyle(q('[data-testid="species-scientific"]')).fontStyle, rows, heads: [...p.querySelectorAll('h4')].map((h) => h.textContent.trim()), lists: [...p.querySelectorAll('ul')].map((u) => u.children.length), paras: [...p.querySelectorAll('p')].map((x) => x.textContent.trim()).filter((t) => t.length > 30), links: [...p.querySelectorAll('a[href^="http"]')].length, text: p.innerText.length, img: Boolean(p.querySelector('img')?.naturalWidth) }; };
    const waitSpecies = async (id, lang) => { for (let i = 0; i < 80; i++) { const p = q('[data-testid="species-page"]'); if (p && p.getAttribute('data-species') === id && document.documentElement.lang !== '__' ) return true; await sleep(50); } return false; };
    const cards = [...panel.querySelectorAll('[data-testid^="species-card-"]')].map((c) => c.getAttribute('data-testid').replace('species-card-', ''));
    const out = [];
    for (const id of cards) {
      q(`[data-testid="species-card-${id}"]`, panel).click(); await waitSpecies(id); await sleep(80);
      const en = read();
      q('[data-testid="lang-vi"]', panel).click(); await sleep(140);
      const vi = read();
      q('[data-testid="lang-en"]', panel).click(); await sleep(100);
      out.push({ id, en, vi });
    }
    return out;
  });
  check('14 the field guide lists all 36 species', data.length === 36, `${data.length} cards`);
  const problems = [];
  let verifiedLinks = 0;
  for (const { id, en, vi } of data) {
    const p = (m) => problems.push(`${id}: ${m}`);
    if (en.id !== id || vi.id !== id) p('page did not follow the card');
    if (!en.name || !vi.name) p('missing name');
    if (en.alt !== vi.name || vi.alt !== en.name) p(`alt names do not cross-reference (en.alt="${en.alt}" vi.name="${vi.name}")`);
    if (en.sci !== vi.sci || !/^[A-Z][a-z]+ [a-z-]+/.test(en.sci)) p(`scientific name "${en.sci}" / "${vi.sci}"`);
    if (en.sciItalic !== 'italic') p('scientific name not italic');
    const enRows = Object.values(en.rows); const viRows = Object.values(vi.rows);
    if (enRows.length < 8 || enRows.length !== viRows.length) p(`table rows en=${enRows.length} vi=${viRows.length}`);
    for (let i = 0; i < Math.min(enRows.length, viRows.length); i++) { if (!enRows[i][1] || !viRows[i][1]) p(`empty value in row "${enRows[i][0]}"`); }
    for (const i of [1, 2, 3]) if (enRows[i] && viRows[i] && enRows[i][1] !== viRows[i][1]) p(`taxon differs between languages: ${enRows[i][1]} vs ${viRows[i][1]}`);
    if (enRows[0] && viRows[0] && enRows[0][0] === viRows[0][0]) p('table labels not translated');
    if (en.paras.length < 1 || vi.paras.length < 1) p('no description paragraph');
    if (en.paras[0] && vi.paras[0] && en.paras[0] === vi.paras[0]) p('description identical in both languages');
    if (Math.max(...en.lists, 0) < 2) p('fewer than two adaptations');
    if (en.heads.length < 3 || en.heads.length !== vi.heads.length) p(`section headings en=${en.heads.length} vi=${vi.heads.length}`);
    if (en.heads.join() === vi.heads.join()) p('headings not translated');
    if (!en.img) p('no portrait image');
    if (en.links > 0) verifiedLinks++;
  }
  check('14 every species page is complete and consistent in English and Vietnamese', problems.length === 0, problems.slice(0, 8).join(' ; ') || '36 species x 2 languages: names cross-referenced, binomial identical and italic, taxonomy identical, labels/headings/descriptions translated, >= 2 adaptations, portrait present');
  check('14 source links are shown on verified species only', verifiedLinks === 10, `${verifiedLinks} species pages carry source links (ledger says 10 verified)`);
  const sample = data.find((d) => d.id === 'rusa-unicolor');
  note('sample EN: ' + JSON.stringify({ name: sample.en.name, alt: sample.en.alt, sci: sample.en.sci, rows: Object.values(sample.en.rows).map((r) => r.join('=')).slice(0, 6), heads: sample.en.heads }));
  note('sample VI: ' + JSON.stringify({ name: sample.vi.name, alt: sample.vi.alt, rows: Object.values(sample.vi.rows).map((r) => r.join('=')).slice(0, 6), heads: sample.vi.heads }));
  const unver = data.filter((d) => /not yet verified|unverified/i.test(JSON.stringify(d.en.rows) + d.en.paras.join(' '))).length;
  note(`pages that state they are unverified: ${unver}`);
  await g.shot('guide-vi'); await click('panel-close');
});

await section('15 menus, journal and overlays respond', async () => {
  const openClose = async (label, open, sel, close) => { await open(); const ok = await waitFor((sel) => Boolean(document.querySelector(sel)), sel, 15000); await close(); const gone = await waitFor((sel) => !document.querySelector(sel), sel, 15000); check(`15 ${label} opens and closes`, ok && gone, `opened=${ok} closed=${gone}`); };
  await openClose('menu settings', () => click('menu-settings'), '[data-testid="settings-panel"]', () => click('panel-close'));
  await openClose('menu credits', () => click('menu-credits'), '[data-testid="credits-panel"]', () => click('panel-close'));
  await click('menu-new'); await wait(500); await click('role-archaeologist'); await wait(300); await click('role-begin');
  await page.waitForSelector('[data-testid="hud"]', { timeout: 180000 }); await wait(2500);
  await ev(() => { const s = window.__WO__.store.getState(); s.discover('rusa-unicolor', 'scan', [0, 0, 0], 'grassland'); });
  await page.keyboard.press('KeyJ');
  const j = await waitFor(() => Boolean(document.querySelector('[data-testid="journal"]')), undefined, 15000);
  const tabs = {};
  for (const t of ['encyclopedia', 'album', 'videos', 'map', 'progress', 'notes']) { await click(`tab-${t}`).catch(() => {}); await wait(900); tabs[t] = await ev(() => { const b = document.querySelector('[data-testid="journal"] .panel-body'); return b ? b.innerText.trim().length + b.querySelectorAll('canvas, img').length * 50 : -1; }); }
  check('15 research journal opens and every tab shows content', j && Object.values(tabs).every((v) => v > 10), JSON.stringify(tabs));
  await page.keyboard.press('KeyJ'); await wait(700);
  await openClose('map (M)', () => page.keyboard.press('KeyM'), '[data-testid="map-panel"] canvas', () => page.keyboard.press('KeyM'));
  await openClose('inventory (I)', () => page.keyboard.press('KeyI'), '[data-testid="inventory"]', () => page.keyboard.press('KeyI'));
  await page.keyboard.down('Tab'); const wh = await waitFor(() => Boolean(document.querySelector('[data-testid="wheel"]')), undefined, 10000); await page.keyboard.press('Digit3'); await page.keyboard.up('Tab'); await wait(800);
  check('15 equipment wheel (Tab) selects a tool', wh && (await ev(() => window.__WO__.store.getState().tool)) === 'binoculars', `tool=${await ev(() => window.__WO__.store.getState().tool)}`);
  await page.keyboard.press('KeyB');
  await openClose('pause (Esc)', () => page.keyboard.press('Escape'), '[data-testid="pause"]', () => click('pause-resume'));
});

await section('18 save while standing on a structure', async () => {
  await tp(-320, 309.5, 3000); await face(0, -1);
  await page.keyboard.down('KeyW');
  const on = await waitFor(() => { const w = window.__WO__; const p = w.runtime.player.pos; return p.z < 304.5 && p.y - w.heightAt(p.x, p.z) > 0.25; }, undefined, 60000);
  await page.keyboard.up('KeyW'); await wait(800);
  const s = await ev(() => { const w = window.__WO__; const p = w.runtime.player.pos; return { z: p.z, above: p.y - w.heightAt(p.x, p.z) }; });
  await page.keyboard.press('Escape'); await waitFor(() => Boolean(document.querySelector('[data-testid="pause"]')), undefined, 20000); await click('pause-menu');
  await waitFor(() => Boolean(document.querySelector('[data-testid="main-menu"]')), undefined, 40000);
  await page.reload(); await page.waitForSelector('[data-testid="main-menu"]', { timeout: 180000 }); await click('menu-continue');
  await page.waitForSelector('[data-testid="hud"]', { timeout: 180000 }); await wait(4000);
  const r = await ev(() => { const w = window.__WO__; const p = w.runtime.player.pos; return { z: p.z, above: p.y - w.heightAt(p.x, p.z), grounded: w.runtime.player.grounded }; });
  await face(1, 0); const a = await pos(); await page.keyboard.down('KeyW'); await wait(5000); await page.keyboard.up('KeyW'); const b = await pos();
  check('18 a save made on top of the ruins platform restores on top of it and the player can walk', on && r.above > 0.2 && Math.hypot(b.x - a.x, b.z - a.z) > 2, `saved ${s.above.toFixed(2)} m above terrain at z=${s.z.toFixed(1)}; restored ${r.above.toFixed(2)} m above; then moved ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(2)} m`);
});

await section('6 water dragon', async () => {
  await tp(84, -86, 5000);
  const d = await ev(() => { const w = window.__WO__; const p = w.runtime.player.pos; return w.registry.wildlife.agents.filter((a) => a.speciesId === 'physignathus-cocincinus').map((a) => ({ active: a.active, d: Math.round(a.position.distanceTo(p)), beh: a.currentBehavior, y: +(a.position.y - w.heightAt(a.position.x, a.position.z)).toFixed(2) })); });
  check('6 the one species missed by the census (Chinese water dragon) is present in its habitat', d.some((x) => x.active), JSON.stringify(d));
});

finish('e_info', g.diag);
await g.browser.close();
