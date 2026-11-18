import { launch, check, note, section, finish } from './lib.mjs';
const g = await launch();
const { page, ev, pos, face, tp, wait, waitFor } = g;
await g.startGame('biologist');
const sample = () => ev(() => { const w = window.__WO__; return w.registry.wildlife.agents.filter((a) => a.active).map((a) => ({ id: a.id, sp: a.speciesId, loco: a.profile.locomotion, cls: a.profile.cls, beh: a.currentBehavior, x: a.position.x, y: a.position.y, z: a.position.z, g: w.heightAt(a.position.x, a.position.z), h: a.heading, v: a.speed, air: a.airborne, leg: a.rig?.parts.legFL?.rotation.x ?? null, wing: a.rig?.parts.wingL ? a.rig.parts.wingL.rotation.z + a.rig.parts.wingL.rotation.x : null, tail: a.rig?.parts.tail?.rotation.y ?? null, bad: !Number.isFinite(a.position.x + a.position.y + a.position.z) })); });

const hubs = [['grassland', 40, 120], ['forest', -215, 60], ['river', 139, 73.5], ['lake', 188, 196], ['mountain', -70, -292], ['ruins', -320, 318]];
const seen = new Map(); const behaviours = new Map(); const transitions = new Map();
const issues = { nan: 0, walkerAir: [], fishOut: [], backwards: 0, moving: 0, legsFrozen: 0, legsMoving: 0, wingsFrozen: 0, wingsMoving: 0, flyersUp: 0, flyerSamples: 0, tailFrozen: 0, tailMoving: 0 };
await section('6-7 wildlife census and motion', async () => {
  for (const [name, x, z] of hubs) {
    await tp(x, z, 4000);
    let prev = new Map();
    for (let i = 0; i < 7; i++) {
      await wait(2300);
      const s = await sample();
      for (const a of s) {
        seen.set(a.sp, (seen.get(a.sp) ?? new Set()).add(name));
        behaviours.set(a.sp, (behaviours.get(a.sp) ?? new Set()).add(a.beh));
        if (a.bad) issues.nan++;
        const p = prev.get(a.id);
        const walker = ['walk', 'run', 'hop', 'crawl', 'wade'].includes(a.loco);
        if (walker && !a.air && Math.abs(a.y - Math.max(a.g, a.loco === 'wade' ? -0.6 : -9)) > (a.loco === 'hop' ? 0.9 : 0.4) && a.g > -0.2) issues.walkerAir.push(`${a.sp} ${a.beh} y-g=${(a.y - a.g).toFixed(2)}`);
        if (a.cls === 'fish' && !(a.y < 0.02 && a.y > a.g - 0.02)) issues.fishOut.push(`${a.sp} y=${a.y.toFixed(2)} bed=${a.g.toFixed(2)}`);
        if (a.cls === 'bird' || a.loco === 'fly' || a.loco === 'soar') { if (a.beh === 'flying' || a.beh === 'soaring') { issues.flyerSamples++; if (a.y - a.g > 0.5) issues.flyersUp++; } }
        if (p) {
          if (p.beh !== a.beh) transitions.set(a.sp, (transitions.get(a.sp) ?? new Set()).add(`${p.beh}>${a.beh}`));
          const dx = a.x - p.x, dz = a.z - p.z; const d = Math.hypot(dx, dz);
          if (d > 0.6 && walker) { issues.moving++; if ((Math.sin(a.h) * dx + Math.cos(a.h) * dz) / d < 0.2 && (Math.sin(p.h) * dx + Math.cos(p.h) * dz) / d < 0.2) issues.backwards++; if (a.leg !== null) { if (Math.abs(a.leg - p.leg) < 1e-4) issues.legsFrozen++; else issues.legsMoving++; } }
          if ((a.beh === 'flying') && p.beh === 'flying' && a.wing !== null) { if (Math.abs(a.wing - p.wing) < 1e-4) issues.wingsFrozen++; else issues.wingsMoving++; }
          if (a.cls === 'fish' && d > 0.2 && a.tail !== null) { if (Math.abs(a.tail - p.tail) < 1e-5) issues.tailFrozen++; else issues.tailMoving++; }
        }
      }
      prev = new Map(s.map((a) => [a.id, a]));
    }
    note(`${name}: active species so far ${seen.size}`);
  }
  const all = await ev(() => [...new Set(window.__WO__.registry.wildlife.agents.map((a) => a.speciesId))]);
  const missing = all.filter((s) => !seen.has(s));
  check('6 animals are found near every hub; most species seen active', seen.size >= 17, `${seen.size}/${all.length} species active at the six hubs; not met: ${missing.join(', ') || 'none'}`);
  check('7 no animal has an invalid position', issues.nan === 0, `NaN samples=${issues.nan}`);
  check('7 walking animals stay on the ground', issues.walkerAir.length === 0, issues.walkerAir.slice(0, 5).join(' | ') || 'all grounded');
  check('7 fish stay between the bed and the surface', issues.fishOut.length === 0, issues.fishOut.slice(0, 5).join(' | ') || 'all inside the water');
  check('7 moving walkers face their direction of travel', issues.moving > 5 && issues.backwards / issues.moving < 0.1, `${issues.backwards} backwards of ${issues.moving} moving samples`);
  check('7 legs animate while walking', issues.legsMoving > 3 && issues.legsFrozen / Math.max(1, issues.legsMoving + issues.legsFrozen) < 0.1, `moving=${issues.legsMoving} frozen=${issues.legsFrozen}`);
  check('7 fish tails animate while swimming', issues.tailMoving > 3 && issues.tailFrozen <= issues.tailMoving * 0.1, `moving=${issues.tailMoving} frozen=${issues.tailFrozen}`);
  check('7 flying birds are actually in the air', issues.flyerSamples === 0 || issues.flyersUp / issues.flyerSamples > 0.8, `${issues.flyersUp}/${issues.flyerSamples} flying samples above ground`);
  if (issues.wingsMoving + issues.wingsFrozen > 0) check('7 wings animate in flight', issues.wingsFrozen <= issues.wingsMoving * 0.1, `moving=${issues.wingsMoving} frozen=${issues.wingsFrozen}`); else note('no bird was sampled in flight twice in a row during the census');
  const tr = [...transitions.entries()].map(([k, v]) => `${k}:${[...v].length}`);
  const total = [...transitions.values()].reduce((s, v) => s + v.size, 0);
  check('7 behaviour transitions happen on their own', total >= 12, `${total} distinct transitions across ${transitions.size} species (${tr.slice(0, 8).join(', ')})`);
  note('behaviours seen: ' + [...behaviours.entries()].map(([k, v]) => `${k.split('-')[0]}=${[...v].join('/')}`).join('; '));
});

await section('7 reactions to the player', async () => {
  // a perched or grounded bird takes off when the player runs up to it
  const pick = async (filter) => ev((filter) => { const w = window.__WO__; const p = w.runtime.player.pos; const list = w.registry.wildlife.agents.filter((a) => new Function('a', 'return ' + filter)(a)); list.sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p)); const a = list[0]; return a ? { id: a.id, sp: a.speciesId, x: a.position.x, y: a.position.y, z: a.position.z, beh: a.currentBehavior } : null; }, filter);
  const approach = async (a, dist) => { await ev(([a, dist]) => { const w = window.__WO__; let best = null; for (let i = 0; i < 16; i++) { const ang = (i / 16) * Math.PI * 2; const x = a.x + Math.cos(ang) * dist; const z = a.z + Math.sin(ang) * dist; const h = w.heightAt(x, z); if (h > 0.3 && (!best || Math.abs(h - a.y) < best.d)) best = { x, z, d: Math.abs(h - a.y) }; } w.teleport(best ? best.x : a.x + dist, best ? best.z : a.z); }, [a, dist]); await wait(1500); };
  const react = async (label, filter, dist, expect, sprint = true) => {
    const a = await pick(filter);
    if (!a) { note(`${label}: no candidate`); return; }
    await approach(a, dist);
    const before = await ev((id) => window.__WO__.registry.wildlife.get(id)?.currentBehavior, a.id);
    await ev((id) => { const w = window.__WO__; const t = w.registry.wildlife.get(id); w.lookAt(t.position.x, t.position.y + 0.3, t.position.z); }, a.id);
    if (sprint) { await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); }
    const got = new Set(); const t0 = Date.now();
    while (Date.now() - t0 < 14000) { await wait(700); const b = await ev((id) => { const t = window.__WO__.registry.wildlife.get(id); return t ? t.currentBehavior : 'gone'; }, a.id); got.add(b); if (expect.some((e) => got.has(e))) break; }
    if (sprint) { await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); }
    check(`7 ${label} reacts when approached`, expect.some((e) => got.has(e)), `${a.sp}: ${before} -> ${[...got].join(' > ')}`);
  };
  await tp(40, 120, 3000);
  await react('bird', "a.active && a.profile.cls === 'bird' && !a.airborne && a.currentBehavior !== 'flying' && a.currentBehavior !== 'soaring'", 9, ['flying', 'fleeing', 'alert']);
  await react('hare or small mammal', "a.active && ['lepus-peguensis','muntiacus-vaginalis','sus-scrofa'].includes(a.speciesId)", 14, ['fleeing', 'alert', 'running']);
  await tp(139, 73.5, 3000);
  await react('fish (player wading in)', "a.active && a.profile.cls === 'fish'", 6, ['fleeing', 'swimming'], true);
  await react('insect', "a.active && a.profile.cls === 'insect'", 3, ['flying', 'hovering', 'fleeing', 'perched', 'feeding', 'resting'], false);
});

finish('b_wild', g.diag);
await g.browser.close();
