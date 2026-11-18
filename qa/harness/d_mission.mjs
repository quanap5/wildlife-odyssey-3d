import { launch, check, note, section, finish } from './lib.mjs';
const g = await launch();
const { page, ev, pos, face, tp, wait, waitFor, click, exists, text } = g;
await g.startGame('biologist');
const quest = () => ev(() => { const s = window.__WO__.store.getState(); return { active: s.quest.activeIndex, completed: s.quest.completed, badges: s.badges, overlay: s.overlay }; });
const tracker = () => ev(() => [...document.querySelectorAll('[data-testid="tracker"] li')].map((li) => (li.className.includes('done') || li.querySelector('s, del') || /line-through/.test(getComputedStyle(li).textDecorationLine) ? '[x] ' : '[ ] ') + li.textContent.trim().slice(0, 40)));
const bankNear = (id, radii = [8, 10, 12, 14, 16]) => ev(([id, radii]) => { const w = window.__WO__; const a = w.registry.wildlife.get(id); let best = null; for (let i = 0; i < 48; i++) for (const r of radii) { const ang = (i / 48) * Math.PI * 2; const x = a.position.x + Math.cos(ang) * r; const z = a.position.z + Math.sin(ang) * r; const h = w.heightAt(x, z); if (h > 0.25 && h < 2 && (!best || r < best.r)) best = { x, z, r }; } if (best) w.teleport(best.x, best.z); return best; }, [id, radii]);
const disc = (sp) => ev((sp) => Boolean(window.__WO__.store.getState().discovered[sp]), sp);

await section('16 mission 1 played with real inputs', async () => {
  await face(-1, 0.3);
  await page.keyboard.down('KeyW'); await wait(16000); await page.keyboard.up('KeyW');
  const deer = await ev(() => { const w = window.__WO__; const p = w.runtime.player.pos; const a = w.registry.wildlife.agents.filter((x) => x.speciesId === 'rusa-unicolor').sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0]; return { id: a.id, d: a.position.distanceTo(p) }; });
  note(`walked from camp; nearest deer ${deer.d.toFixed(0)} m; tracker: ${(await tracker()).join(' | ')}`);
  if (deer.d > 45) { await ev((id) => { const w = window.__WO__; const a = w.registry.wildlife.get(id); w.teleport(a.position.x + 22, a.position.z + 6); }, deer.id); await wait(2000); }
  await g.aim(deer.id, 1500);
  await page.keyboard.press('KeyB'); await wait(2500); await g.aim(deer.id, 1200); await page.keyboard.press('KeyB'); await wait(800);
  await page.keyboard.press('KeyC'); await page.keyboard.press('Digit2'); await g.lockOn(deer.id, 'rusa-unicolor');
  const n = await ev(() => window.__WO__.store.getState().photos.length);
  await page.keyboard.press('Enter'); await waitFor((n) => window.__WO__.store.getState().photos.length > n, n, 60000); await page.keyboard.press('KeyC'); await wait(800);
  await page.keyboard.press('KeyF'); const t0 = Date.now(); let scanned = false;
  while (Date.now() - t0 < 60000) { await g.aim(deer.id); if (await ev(() => window.__WO__.store.getState().discovered['rusa-unicolor']?.scanned)) { scanned = true; break; } }
  await page.keyboard.press('KeyF'); await wait(600);
  await page.keyboard.press('KeyJ'); await wait(2000); await click('species-card-rusa-unicolor'); await wait(1500); await page.keyboard.press('KeyJ'); await wait(1000);
  let q = await quest();
  if (!q.completed.includes('first-steps')) { note('remaining: ' + (await tracker()).join(' | ')); await page.keyboard.down('KeyS'); await waitFor(() => window.__WO__.store.getState().quest.completed.includes('first-steps'), undefined, 90000); await page.keyboard.up('KeyS'); q = await quest(); }
  check('16 mission 1 "First Steps" completes through play', q.completed.includes('first-steps') && q.badges.includes('first-researcher'), JSON.stringify(q));
  const overlay = await waitFor(() => Boolean(document.querySelector('[data-testid="complete"]')), undefined, 15000);
  check('16 completion is announced to the player', overlay || q.overlay === 'complete', `overlay shown=${overlay}`);
  if (overlay) { await click('complete-continue'); await wait(800); }
  check('16 the tracker moves on to mission 2', (await text('tracker'))?.includes('Life by the River'), (await text('tracker'))?.slice(0, 60));
});

await section('16 mission 2 "Life by the River"', async () => {
  await tp(140, 56, 3000);
  const species = await ev(() => { const w = window.__WO__; const p = w.runtime.player.pos; const by = new Map(); for (const a of w.registry.wildlife.agents) if (a.profile.cls === 'fish') { const d = a.position.distanceTo(p); if (!by.has(a.speciesId) || d < by.get(a.speciesId).d) by.set(a.speciesId, { id: a.id, d, x: a.position.x, z: a.position.z }); } return [...by.entries()].map(([sp, v]) => ({ sp, ...v })).sort((a, b) => a.d - b.d); });
  note('fish species and nearest individual: ' + species.map((s) => `${s.sp} ${s.d.toFixed(0)} m`).join(', '));
  let found = 0; let filmed = null;
  for (const s of species) {
    if (found >= 2) break;
    await ev((s) => window.__WO__.teleport(s.x, s.z), s); await wait(2500);
    const id = await ev((sp) => { const w = window.__WO__; const p = w.runtime.player.pos; const a = w.registry.wildlife.agents.filter((x) => x.speciesId === sp && x.active).sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0]; return a ? a.id : null; }, s.sp);
    if (!id) { note(`${s.sp}: no active individual after travelling there`); continue; }
    const bank = await bankNear(id); await wait(1500);
    if (!bank) { note(`${s.sp}: no bank within 16 m`); continue; }
    await page.keyboard.press('KeyF'); const t0 = Date.now(); let ok = false;
    while (Date.now() - t0 < 80000) { await g.aim(id); if (await disc(s.sp)) { ok = true; break; } }
    await page.keyboard.press('KeyF'); await wait(500);
    const tgt = await ev(() => { const t = window.__WO__.runtime.target; return t ? `${t.speciesId} ${t.distance.toFixed(1)} m vis ${t.visibility.toFixed(2)}` : 'none'; });
    check(`16 fish species ${found + 1} identified from the bank`, ok, `${s.sp} from ${bank.r} m; last target: ${tgt}`);
    if (ok) { found++; if (!filmed) filmed = { id, sp: s.sp }; }
  }
  if (filmed) {
    await bankNear(filmed.id); await wait(1500);
    await page.keyboard.press('KeyC'); await page.keyboard.press('KeyT'); await page.keyboard.press('Digit3');
    await g.lockOn(filmed.id, filmed.sp, 60000);
    await page.keyboard.press('Enter'); await waitFor(() => window.__WO__.store.getState().recording === true, undefined, 20000);
    const s0 = Date.now(); while (Date.now() - s0 < 9000) await g.aim(filmed.id);
    await page.keyboard.press('Enter');
    const rev = await waitFor(() => Boolean(document.querySelector('[data-testid="video-review"]')), undefined, 40000);
    const subj = await text('review-subject');
    if (rev) await click('review-save');
    await waitFor(() => window.__WO__.store.getState().videos.length >= 1, undefined, 30000);
    const v = await ev(() => window.__WO__.store.getState().videos.at(-1));
    check('16 fish filmed and the behaviour recorded with the clip', rev && v && v.behaviors.length > 0, `subject="${subj}" ${JSON.stringify(v && { sp: v.speciesId, behaviors: v.behaviors })}`);
    await page.keyboard.press('KeyC'); await wait(600);
  }
  // water plant
  const plant = await ev(() => { const w = window.__WO__; const spots = [[188, 196], [139, 73], [230, 180], [260, 215], [120, 40]]; return spots; });
  let shot = null;
  for (const [x, z] of plant) {
    await tp(x, z, 3500);
    const c = await ev(() => { const w = window.__WO__; const p = w.runtime.player.pos; const list = w.registry.plants.filter((c) => c.speciesId === 'nelumbo-nucifera' || c.speciesId === 'colocasia-esculenta').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)); const c = list[0]; if (!c) return null; let best = null; for (let i = 0; i < 32; i++) for (const r of [3, 5, 7, 9, 12]) { const ang = (i / 32) * Math.PI * 2; const px = c.x + Math.cos(ang) * r; const pz = c.z + Math.sin(ang) * r; const h = w.heightAt(px, pz); if (h > 0.2 && (!best || r < best.r)) best = { x: px, z: pz, r }; } if (best) w.teleport(best.x, best.z); return { sp: c.speciesId, x: c.x, y: c.y, z: c.z, n: list.length, r: best?.r }; });
    if (!c || !c.r) continue;
    await wait(2000); await page.keyboard.press('KeyC'); await page.keyboard.press('Digit2');
    let locked = false; const t0 = Date.now();
    while (Date.now() - t0 < 30000) { await ev((c) => window.__WO__.lookAt(c.x, c.y, c.z), c); await wait(700); if ((await ev(() => window.__WO__.runtime.target?.speciesId)) === c.sp) { locked = true; break; } }
    const n = await ev(() => window.__WO__.store.getState().photos.length);
    await page.keyboard.press('Enter'); await waitFor((n) => window.__WO__.store.getState().photos.length > n, n, 60000);
    shot = await ev(() => { const p = window.__WO__.store.getState().photos.at(-1); return { sp: p.speciesId, q: p.quality }; });
    await page.keyboard.press('KeyC'); await wait(600);
    note(`water plant ${c.sp} from ${c.r} m (${c.n} candidates): locked=${locked} photo=${JSON.stringify(shot)}`);
    if (shot.sp === c.sp) break;
  }
  check('16 a lotus or taro is photographed and recognised', shot && (shot.sp === 'nelumbo-nucifera' || shot.sp === 'colocasia-esculenta'), JSON.stringify(shot));
  const q = await quest();
  check('16 mission 2 completes and awards its badge', q.completed.includes('life-by-the-river') && q.badges.includes('freshwater-surveyor'), JSON.stringify({ completed: q.completed, badges: q.badges, progress: await ev(() => window.__WO__.store.getState().quest.progress['life-by-the-river']) }));
  if (await exists('complete')) { await click('complete-continue'); await wait(600); }
});

let saved = null;
await section('17-19 save, reload, restore', async () => {
  await tp(-320, 312, 3000); await face(0, -1);
  await page.keyboard.down('KeyW'); await wait(5000); await page.keyboard.up('KeyW'); await wait(1000);
  saved = await ev(() => { const s = window.__WO__.store.getState(); const p = window.__WO__.runtime.player.pos; const w = window.__WO__; return { pos: [p.x, p.y, p.z], above: p.y - w.heightAt(p.x, p.z), disc: Object.keys(s.discovered).sort(), photos: s.photos.map((x) => x.id), videos: s.videos.map((x) => x.id), completed: s.quest.completed, badges: s.badges, biomes: s.visitedBiomes.slice().sort(), role: s.role }; });
  note(`saving on the ruins platform at z=${saved.pos[2].toFixed(1)}, ${saved.above.toFixed(2)} m above terrain; ${saved.disc.length} species, ${saved.photos.length} photos, ${saved.videos.length} videos`);
  await page.keyboard.press('Escape');
  const paused = await waitFor(() => Boolean(document.querySelector('[data-testid="pause"]')), undefined, 20000);
  await click('pause-menu');
  const menu = await waitFor(() => Boolean(document.querySelector('[data-testid="main-menu"]')), undefined, 40000);
  const cont = await ev(() => !document.querySelector('[data-testid="menu-continue"]').disabled);
  check('17 pause, save and return to the main menu; Continue is offered', paused && menu && cont, `paused=${paused} menu=${menu} continue=${cont}`);
  await page.reload();
  await page.waitForSelector('[data-testid="main-menu"]', { timeout: 180000 });
  await click('menu-continue');
  await page.waitForSelector('[data-testid="hud"]', { timeout: 180000 });
  await wait(4000);
  const now = await ev(() => { const s = window.__WO__.store.getState(); const p = window.__WO__.runtime.player.pos; const w = window.__WO__; return { pos: [p.x, p.y, p.z], above: p.y - w.heightAt(p.x, p.z), disc: Object.keys(s.discovered).sort(), photos: s.photos.map((x) => x.id), videos: s.videos.map((x) => x.id), completed: s.quest.completed, badges: s.badges, biomes: s.visitedBiomes.slice().sort(), role: s.role }; });
  const same = (k) => JSON.stringify(saved[k]) === JSON.stringify(now[k]);
  check('18 after a browser reload, Continue restores discoveries, quests, badges, biomes and role', ['disc', 'completed', 'badges', 'biomes', 'role'].every(same), ['disc', 'completed', 'badges', 'biomes', 'role'].filter((k) => !same(k)).join(',') || `${now.disc.length} species, quests ${now.completed.join('+')}`);
  check('18 position restored', Math.hypot(now.pos[0] - saved.pos[0], now.pos[2] - saved.pos[2]) < 1.5, `saved ${saved.pos.map((v) => v.toFixed(1))} now ${now.pos.map((v) => v.toFixed(1))} (${now.above.toFixed(2)} m above terrain)`);
  await face(1, 0); const a = await pos(); await page.keyboard.down('KeyW'); await wait(5000); await page.keyboard.up('KeyW'); const b = await pos();
  check('18 the restored player can move (not embedded in the ruins platform)', Math.hypot(b.x - a.x, b.z - a.z) > 2, `moved ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(2)} m`);
  check('19 photo and video records restored', same('photos') && same('videos'), `${now.photos.length} photos, ${now.videos.length} videos`);
  await page.keyboard.press('KeyJ'); await wait(1500); await click('tab-album'); await wait(1500);
  const cards = await ev(() => document.querySelectorAll('[data-testid="photo-card"]').length);
  let opened = 0;
  for (let i = 0; i < cards; i++) {
    await ev((i) => document.querySelectorAll('[data-testid="photo-card"]')[i].click(), i);
    const ok = await waitFor(() => { const im = document.querySelector('[data-testid="photo-lightbox"] img'); return im && im.complete && im.naturalWidth > 100; }, undefined, 30000);
    if (ok) opened++;
    await ev(() => [...document.querySelectorAll('[data-testid="photo-lightbox"] button')].find((b) => /close/i.test(b.textContent))?.click()); await wait(400);
  }
  check('19 every saved photo still opens as an image after the reload', cards === saved.photos.length && opened === cards, `${opened}/${cards} opened`);
  await click('tab-videos'); await wait(1500);
  const vcards = await ev(() => document.querySelectorAll('[data-testid="video-card"]').length);
  await ev(() => document.querySelector('[data-testid="video-card"]')?.click());
  const vok = await waitFor(() => Boolean(document.querySelector('[data-testid="video-player"] video')), undefined, 30000);
  const v = vok ? await ev(async () => { const el = document.querySelector('[data-testid="video-player"] video'); if (el.readyState < 2) await new Promise((r) => { el.addEventListener('loadeddata', r, { once: true }); setTimeout(r, 15000); }); const t0 = el.currentTime; await el.play().catch(() => {}); await new Promise((r) => setTimeout(r, 2500)); return { w: el.videoWidth, ready: el.readyState, advanced: +(el.currentTime - t0).toFixed(2), dur: el.duration }; }) : null;
  check('19 the saved video plays from storage after the reload', vcards === saved.videos.length && v && v.w > 100 && v.ready >= 2 && v.advanced !== 0, JSON.stringify(v));
});

finish('d_mission', g.diag);
await g.browser.close();
