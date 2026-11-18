import { launch, check, note, section, finish } from './lib.mjs';
const g = await launch();
const { page, ev, pos, face, tp, wait, waitFor, click, exists, text } = g;
await g.startGame('biologist');
const near = async (filter, dist) => ev(([filter, dist]) => { const w = window.__WO__; const p = w.runtime.player.pos; const list = w.registry.wildlife.agents.filter((a) => new Function('a', 'return ' + filter)(a)); list.sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p)); const a = list[0]; if (!a) return null; let best = null; for (let i = 0; i < 16; i++) { const ang = (i / 16) * Math.PI * 2; const x = a.position.x + Math.cos(ang) * dist; const z = a.position.z + Math.sin(ang) * dist; const h = w.heightAt(x, z); if (h > 0.3 && (!best || Math.abs(h - a.position.y) < best.d)) best = { x, z, d: Math.abs(h - a.position.y) }; } w.teleport(best ? best.x : a.position.x + dist, best ? best.z : a.position.z); return { id: a.id, sp: a.speciesId }; }, [filter, dist]);
const discovered = (sp) => ev((sp) => Boolean(window.__WO__.store.getState().discovered[sp]), sp);

await section('8 scanner', async () => {
  await tp(40, 120, 3000);
  const bird = await near("a.speciesId === 'gallus-gallus' || (a.profile.cls === 'bird' && a.active && !a.airborne)", 9);
  await wait(1500); await page.keyboard.press('KeyF');
  let ok = false; const t0 = Date.now();
  while (Date.now() - t0 < 70000 && bird) { await g.aim(bird.id); if (await discovered(bird.sp)) { ok = true; break; } }
  const nm = await text('scan-name');
  check('8 scanner identifies a bird', ok, bird ? `${bird.sp}; panel shows "${nm}"; target=${JSON.stringify(await ev(() => { const t = window.__WO__.runtime.target; return t ? { sp: t.speciesId, d: +t.distance.toFixed(1), vis: +t.visibility.toFixed(2) } : null; }))}` : 'no bird found');
  await page.keyboard.press('KeyF');
  // understory plant
  const plant = await ev(() => { const w = window.__WO__; const p = w.runtime.player.pos; const c = w.registry.plants.filter((c) => c.radius < 1.3 && w.heightAt(c.x, c.z) > 0.5).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; if (!c) return null; const d = Math.hypot(c.x - p.x, c.z - p.z) || 1; w.teleport(c.x + ((p.x - c.x) / d) * 4, c.z + ((p.z - c.z) / d) * 4); return { sp: c.speciesId, x: c.x, y: c.y, z: c.z }; });
  await wait(1500); await page.keyboard.press('KeyF');
  ok = false; const t1 = Date.now();
  while (Date.now() - t1 < 60000 && plant) { await ev((c) => window.__WO__.lookAt(c.x, c.y, c.z), plant); await wait(650); if (await discovered(plant.sp)) { ok = true; break; } }
  check('8 scanner identifies a small plant', ok, plant ? plant.sp : 'no small plant nearby');
  await page.keyboard.press('KeyF');
});

let deer = null;
await section('9-10 camera', async () => {
  deer = await near("a.speciesId === 'rusa-unicolor'", 17);
  await wait(1500);
  await page.keyboard.press('KeyC');
  check('10 camera opens with a viewfinder', await exists('viewfinder'));
  const fovs = [];
  for (const [key, z] of [['Digit1', 1], ['Digit2', 2], ['Digit3', 4], ['Digit4', 8]]) {
    await page.keyboard.press(key);
    await waitFor((z) => Math.abs(window.__WO__.runtime.camera.zoom - z) < 0.04, z, 30000);
    await g.aim(deer.id, 900);
    const c = await ev(() => { const c = window.__WO__.runtime.camera; const t = window.__WO__.runtime.target; return { zoom: c.zoom, fov: c.fov, frac: t ? t.frameFraction : null }; });
    const expected = (2 * Math.atan(Math.tan((62 * Math.PI) / 360) / z) * 180) / Math.PI;
    fovs.push({ z, fov: +c.fov.toFixed(2), expected: +expected.toFixed(2), frac: c.frac ? +c.frac.toFixed(3) : null });
  }
  check('10 zoom 1x/2x/4x/8x each narrow the field of view to the optical value', fovs.every((f) => Math.abs(f.fov - f.expected) < 0.6), JSON.stringify(fovs));
  const fr = fovs.map((f) => f.frac).filter((x) => x);
  check('10 the subject grows in frame with each zoom step', fr.length === 4 && fr[1] > fr[0] * 1.6 && fr[2] > fr[1] * 1.6 && fr[3] > fr[2] * 1.6, fr.join(' -> '));
  const box = await page.locator('[data-testid="game-canvas"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const z0 = await ev(() => window.__WO__.runtime.camera.targetZoom);
  await page.mouse.wheel(0, 400); await wait(1500);
  const z1 = await ev(() => window.__WO__.runtime.camera.targetZoom);
  await page.mouse.wheel(0, -900); await wait(1500);
  const z2 = await ev(() => window.__WO__.runtime.camera.targetZoom);
  check('10 mouse wheel zooms smoothly in both directions', z1 !== z0 && z2 !== z1 && Math.sign(z1 - z0) !== Math.sign(z2 - z1), `${z0} -> ${z1} -> ${z2}`);
  await page.keyboard.press('Digit3');
  await waitFor(() => Math.abs(window.__WO__.runtime.camera.zoom - 4) < 0.05, undefined, 30000);
  const locked = await g.lockOn(deer.id, 'rusa-unicolor');
  const lk = await waitFor(() => document.querySelector('[data-testid="viewfinder"]')?.getAttribute('data-focus') === 'locked', undefined, 30000);
  check('10 autofocus locks on the animal under the reticle', locked && lk, `target=${locked} focus=${await ev(() => document.querySelector('[data-testid="viewfinder"]')?.getAttribute('data-focus'))}`);
  await ev(() => { const w = window.__WO__; const p = w.runtime.player.pos; w.lookAt(p.x, p.y + 80, p.z + 5); });
  const lost = await waitFor(() => document.querySelector('[data-testid="viewfinder"]')?.getAttribute('data-focus') === 'none' && window.__WO__.runtime.focusLock === 0, undefined, 30000);
  check('10 focus is released when the subject leaves the reticle', lost);
  // photographs at every output size
  const sizes = ['screen', 'hd', 'fhd', 'qhd'];
  for (let i = 0; i < sizes.length; i++) {
    await g.lockOn(deer.id, 'rusa-unicolor');
    const n = await ev(() => window.__WO__.store.getState().photos.length);
    await page.keyboard.press('Enter');
    const got = await waitFor((n) => window.__WO__.store.getState().photos.length > n, n, 90000);
    if (!got) { check(`9 photo captured at size ${sizes[i]}`, false, 'no photo stored within 90 s'); }
    await page.keyboard.press('KeyR'); await wait(700);
  }
  await page.keyboard.press('KeyC');
  const metas = await ev(() => window.__WO__.store.getState().photos.map((p) => ({ id: p.id, sp: p.speciesId, q: p.quality, w: p.width, h: p.height, beh: p.observedBehavior })));
  check('9 four photographs stored, each identifying the species and scored 0-100', metas.length === 4 && metas.every((m) => m.sp === 'rusa-unicolor' && m.q >= 0 && m.q <= 100), JSON.stringify(metas.map((m) => `${m.w}x${m.h} q${m.q}`)));
  await page.keyboard.press('KeyJ'); await wait(1500); await click('tab-album'); await wait(1500);
  const cards = await ev(() => document.querySelectorAll('[data-testid="photo-card"]').length);
  const real = [];
  for (let i = 0; i < cards; i++) {
    await ev((i) => document.querySelectorAll('[data-testid="photo-card"]')[i].click(), i);
    await page.waitForSelector('[data-testid="photo-lightbox"] img', { timeout: 30000 });
    await waitFor(() => { const im = document.querySelector('[data-testid="photo-lightbox"] img'); return im && im.complete && im.naturalWidth > 0; }, undefined, 30000);
    real.push(await ev(() => { const im = document.querySelector('[data-testid="photo-lightbox"] img'); const c = document.createElement('canvas'); c.width = 160; c.height = 90; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 160, 90); const d = x.getImageData(0, 0, 160, 90).data; const s = new Set(); for (let k = 0; k < d.length; k += 4) s.add((d[k] >> 3) | ((d[k + 1] >> 3) << 5) | ((d[k + 2] >> 3) << 10)); return { w: im.naturalWidth, h: im.naturalHeight, colours: s.size }; }));
    await ev(() => [...document.querySelectorAll('[data-testid="photo-lightbox"] button')].find((b) => /close/i.test(b.textContent))?.click());
    await wait(500);
  }
  const dims = real.map((r) => `${r.w}x${r.h}`).sort();
  check('9 stored files are real images with scene content', real.length === 4 && real.every((r) => r.colours > 60), JSON.stringify(real));
  check('9 output sizes HD, Full HD and QHD produce files of exactly those dimensions', ['1280x720', '1920x1080', '2560x1440'].every((d) => dims.includes(d)), dims.join(', '));
  const match = metas.map((m) => `${m.w}x${m.h}`).sort().join() === dims.join();
  check('9 recorded photo dimensions match the stored files', match, `meta ${metas.map((m) => `${m.w}x${m.h}`).join(',')}`);
  await page.keyboard.press('KeyJ'); await wait(800);
  // binoculars
  await page.keyboard.press('KeyB'); await wait(2500);
  const b = await ev(() => ({ zoom: window.__WO__.runtime.camera.zoom, fov: window.__WO__.runtime.camera.fov, tool: window.__WO__.store.getState().tool }));
  check('10 binoculars magnify', b.tool === 'binoculars' && b.zoom > 3 && b.fov < 25, JSON.stringify(b));
  await page.keyboard.press('KeyB');
});

await section('11-12 video and slow motion', async () => {
  deer = await near("a.speciesId === 'rusa-unicolor'", 20); await wait(1500);
  await page.keyboard.press('KeyC'); await page.keyboard.press('KeyT');
  await g.lockOn(deer.id, 'rusa-unicolor');
  await page.keyboard.press('KeyZ');
  await page.keyboard.press('Enter');
  const rec = await waitFor(() => window.__WO__.store.getState().recording === true, undefined, 20000);
  const s = Date.now(); while (Date.now() - s < 8000) await g.aim(deer.id);
  await page.keyboard.press('Enter');
  const rev = await waitFor(() => Boolean(document.querySelector('[data-testid="video-review"]')), undefined, 40000);
  check('11 video records and opens for review', rec && rev);
  const v = await ev(async () => { const el = document.querySelector('[data-testid="review-video"]'); if (!el) return null; if (el.readyState < 2) await new Promise((r) => { el.addEventListener('loadeddata', r, { once: true }); setTimeout(r, 15000); }); const t0 = el.currentTime; await el.play().catch(() => {}); await new Promise((r) => setTimeout(r, 2500)); return { w: el.videoWidth, h: el.videoHeight, ready: el.readyState, advanced: +(el.currentTime - t0).toFixed(2), paused: el.paused, bytes: window.__WO__.store.getState().pendingVideo?.blob.size, mime: window.__WO__.store.getState().pendingVideo?.mime, scale: window.__WO__.store.getState().pendingVideo?.simScale }; });
  check('11 the recording is a playable video with real frames', v && v.w > 100 && v.ready >= 2 && v.bytes > 5000, JSON.stringify(v));
  check('11 playback actually advances', v && (v.advanced > 0.2 || v.advanced < 0), JSON.stringify(v && { advanced: v.advanced, paused: v.paused }));
  check('12 a clip filmed in slow motion is tagged with the simulation speed', v && v.scale === 0.5, `simScale=${v && v.scale}`);
  for (const r of [0.5, 0.25, 1]) { await click(`review-rate-${r}`); await wait(500); const pr = await ev(() => document.querySelector('[data-testid="review-video"]').playbackRate); check(`12 playback speed ${r}x is applied to the player`, pr === r, `playbackRate=${pr}`); }
  await click('review-save');
  const saved = await waitFor(() => window.__WO__.store.getState().videos.length === 1, undefined, 30000);
  check('11 video saved to the journal', saved, JSON.stringify(await ev(() => { const v = window.__WO__.store.getState().videos[0]; return v && { sp: v.speciesId, bytes: v.bytes, seconds: v.seconds, behaviors: v.behaviors, simScale: v.simScale }; })));
  await page.keyboard.press('KeyC'); await page.keyboard.press('KeyZ'); await page.keyboard.press('KeyZ');
  const sc = await ev(() => ({ slowmo: window.__WO__.store.getState().slowmo, scale: window.__WO__.runtime.time.scale }));
  check('12 simulation speed returns to 1.0 after cycling Z', sc.slowmo === 0 && sc.scale === 1, JSON.stringify(sc));
});

await section('13 close-up inspection', async () => {
  const plant = await ev(() => { const w = window.__WO__; const p = w.runtime.player.pos; const c = w.registry.plants.filter((c) => c.radius < 1.3 && w.heightAt(c.x, c.z) > 0.5).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; const d = Math.hypot(c.x - p.x, c.z - p.z) || 1; w.teleport(c.x + ((p.x - c.x) / d) * 2.2, c.z + ((p.z - c.z) / d) * 2.2); return { sp: c.speciesId, x: c.x, y: c.y, z: c.z }; });
  await wait(1800); await ev((c) => window.__WO__.lookAt(c.x, c.y, c.z), plant);
  const pr = await waitFor(() => Boolean(document.querySelector('[data-testid="prompt"]')), undefined, 20000);
  const ptxt = await text('prompt');
  await page.keyboard.press('KeyE');
  const open = await waitFor(() => Boolean(document.querySelector('[data-testid="inspection"] canvas')), undefined, 30000);
  check('13 E on a nearby subject opens the close-up inspection view', pr && open, `prompt="${ptxt}" species=${plant.sp}`);
  await wait(3000);
  const insp = await ev(() => { const c = document.querySelector('[data-testid="inspection"] canvas'); return c ? { w: c.width, h: c.height, name: document.querySelector('[data-testid="inspect-name"]')?.textContent ?? null } : null; });
  check('13 the inspection view renders its own 3D canvas', insp && insp.w > 100, JSON.stringify(insp));
  await g.shot('inspect-plant');
  await page.keyboard.press('Escape');
  check('13 Esc closes the inspection', await waitFor(() => !document.querySelector('[data-testid="inspection"]'), undefined, 20000));
});

finish('c_tools', g.diag);
await g.browser.close();
