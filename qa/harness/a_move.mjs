import { launch, check, note, section, finish } from './lib.mjs';
const g = await launch();
const { page, ev, pos, face, tp, wait, waitFor } = g;
const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await wait(ms); const p = await pos(); for (const k of keys.slice().reverse()) await page.keyboard.up(k); return p; };
const H = (x, z) => ev(([x, z]) => window.__WO__.heightAt(x, z), [x, z]);

await section('1-2 start', async () => {
  await g.startGame('biologist');
  const st = await ev(() => { const s = window.__WO__.store.getState(); return { screen: s.screen, role: s.role, phys: window.__WO__.registry.physics?.backend }; });
  check('1 new expedition starts as biologist', st.screen === 'playing' && st.role === 'biologist', JSON.stringify(st));
  const f = await g.frame();
  check('2 3D world renders (frame not blank)', f.distinct > 40 && f.spread > 60, JSON.stringify(f));
  const p = await g.perf();
  check('2 scene has terrain, plants and animals', p.tris > 50000 && p.plants > 300 && p.active > 0 && p.chunks > 8, JSON.stringify(p));
});

await section('3 locomotion', async () => {
  await tp(40, 110);
  await face(1, 0);
  const a = await pos();
  const w = await hold(['KeyW'], 6000);
  await wait(800);
  const b = await pos();
  check('3 walk forward (W) moves along the view direction', b.x - a.x > 3 && Math.abs(b.z - a.z) < (b.x - a.x) * 0.4, `dx=${(b.x - a.x).toFixed(1)} dz=${(b.z - a.z).toFixed(1)}`);
  check('3 walk speed is the configured 4.2 m/s', Math.abs(w.speed - 4.2) < 0.5, `speed=${w.speed.toFixed(2)}`);
  const s = await hold(['ShiftLeft', 'KeyW'], 6000);
  check('3 sprint (Shift+W) is faster and flagged', s.sprinting && Math.abs(s.speed - 7.6) < 0.8, `speed=${s.speed.toFixed(2)} sprinting=${s.sprinting}`);
  await wait(1500);
  const eye0 = await ev(() => window.__WO__.runtime.camera.pos.y - window.__WO__.runtime.player.pos.y);
  await page.keyboard.down('ControlLeft'); await wait(3500);
  const c0 = await pos();
  const eye1 = await ev(() => window.__WO__.runtime.camera.pos.y - window.__WO__.runtime.player.pos.y);
  await page.keyboard.down('KeyW'); await wait(5000); const c = await pos(); await page.keyboard.up('KeyW'); await page.keyboard.up('ControlLeft');
  check('3 crouch (Ctrl) lowers the camera', c0.crouching && eye0 - eye1 > 0.3, `eye ${eye0.toFixed(2)} -> ${eye1.toFixed(2)}`);
  check('3 crouch-walk is slower (1.9 m/s)', c.crouching && Math.abs(c.speed - 1.9) < 0.4, `speed=${c.speed.toFixed(2)}`);
  await wait(2500);
  const u = await pos();
  check('3 standing up again after crouch', !u.crouching, `crouching=${u.crouching}`);
  const y0 = u.y;
  await page.keyboard.down('Space');
  const rose = await waitFor((y) => window.__WO__.runtime.player.pos.y > y + 0.5, y0, 40000);
  await page.keyboard.up('Space');
  const landed = await waitFor((y) => window.__WO__.runtime.player.grounded && Math.abs(window.__WO__.runtime.player.pos.y - y) < 0.2, y0, 40000);
  check('3 jump (Space) rises more than 0.5 m and lands', rose && landed, `rose=${rose} landed=${landed}`);
  // strafing and backing up
  await face(1, 0); const d0 = await pos(); await hold(['KeyD'], 4000); await wait(600); const d1 = await pos();
  check('3 strafe right (D) moves to the right of the view', d1.z - d0.z > 1.5 && Math.abs(d1.x - d0.x) < 1.5, `dx=${(d1.x - d0.x).toFixed(1)} dz=${(d1.z - d0.z).toFixed(1)}`);
  await hold(['KeyS'], 4000); await wait(600); const d2 = await pos();
  check('3 backwards (S) moves away from the view direction', d2.x - d1.x < -1.5, `dx=${(d2.x - d1.x).toFixed(1)}`);
});

await section('4 biomes', async () => {
  const spots = { grassland: [40, 120], rainforest: [-215, 60], freshwater: [140, 56], mountain: [-70, -292], ruins: [-320, 318] };
  for (const [biome, [x, z]] of Object.entries(spots)) {
    await tp(x, z, 3500);
    await hold(['KeyW'], 2500);
    const p = await pos();
    const label = await ev(() => document.querySelector('[data-testid="hud"]')?.getAttribute('data-biome'));
    const f = await g.frame();
    const pf = await g.perf();
    check(`4 biome ${biome}: entered, shown on HUD, renders`, p.biome === biome && label === biome && f.distinct > 40, `biome=${p.biome} hud=${label} colours=${f.distinct} calls=${pf.calls} tris=${Math.round(pf.tris / 1000)}k fps=${pf.fps}`);
  }
  const visited = await ev(() => window.__WO__.store.getState().visitedBiomes);
  check('4 all five biomes recorded as explored', visited.length === 5, visited.join(','));
});

await section('5 collisions', async () => {
  // terrain following on a slope
  await tp(-40, -230); await face(-0.8, -0.6);
  let worst = 0; let below = 0;
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 9; i++) { await wait(900); const d = await ev(() => { const w = window.__WO__; const p = w.runtime.player; return { dy: p.pos.y - w.heightAt(p.pos.x, p.pos.z), g: p.grounded }; }); if (d.g) worst = Math.max(worst, Math.abs(d.dy)); if (d.dy < -0.25) below++; }
  await page.keyboard.up('KeyW');
  check('5 terrain: feet stay on the ground on a slope, never below it', worst < 0.35 && below === 0, `max |feet-ground|=${worst.toFixed(2)} below=${below}`);
  // tree trunk
  await tp(-215, 60);
  const tree = await ev(() => { const w = window.__WO__; const p = w.runtime.player.pos; const c = w.registry.plantBlockers.filter((b) => b.kind === 'cylinder' && b.r > 0.45).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; return c ? { x: c.x, z: c.z, r: c.r } : null; });
  if (tree) {
    const d = await ev((t) => { const w = window.__WO__; const p = w.runtime.player.pos; const L = Math.hypot(p.x - t.x, p.z - t.z) || 1; const sx = t.x + ((p.x - t.x) / L) * (t.r + 3); const sz = t.z + ((p.z - t.z) / L) * (t.r + 3); w.teleport(sx, sz); return [sx, sz]; }, tree);
    await wait(2000);
    await ev((t) => { const w = window.__WO__; w.lookAt(t.x, w.runtime.player.pos.y + 1.6, t.z); }, tree); await wait(800);
    await hold(['KeyW'], 7000); await wait(500);
    const p = await pos(); const dist = Math.hypot(p.x - tree.x, p.z - tree.z);
    const side = (p.x - tree.x) * (d[0] - tree.x) + (p.z - tree.z) * (d[1] - tree.z);
    check('5 tree trunk blocks the player', dist >= tree.r && side > 0, `trunk r=${tree.r.toFixed(2)} stopped at ${dist.toFixed(2)} m from the axis, same side=${side > 0}`);
  } else check('5 tree trunk blocks the player', false, 'no trunk blocker found near the player');
  // boulder
  const rock = await ev(() => { const w = window.__WO__; const p = w.runtime.player.pos; const c = w.registry.plantBlockers.filter((b) => b.kind === 'sphere' && b.r > 0.7).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; return c ? { x: c.x, y: c.y, z: c.z, r: c.r } : null; });
  if (rock) {
    const start = await ev((t) => { const w = window.__WO__; let best = null; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const x = t.x + Math.cos(a) * (t.r + 3); const z = t.z + Math.sin(a) * (t.r + 3); const h = w.heightAt(x, z); if (h > 0.4 && (!best || Math.abs(h - (t.y - 0.3)) < best.d)) best = { x, z, d: Math.abs(h - (t.y - 0.3)) }; } if (best) w.teleport(best.x, best.z); return best; }, rock);
    await wait(2000);
    await ev((t) => { const w = window.__WO__; w.lookAt(t.x, w.runtime.player.pos.y + 1.6, t.z); }, rock); await wait(800);
    await hold(['KeyW'], 7000); await wait(500);
    const p = await pos(); const dist = Math.hypot(p.x - rock.x, p.z - rock.z);
    const top = p.y - (rock.y - 0.36 * (rock.r / 0.78));
    check('5 boulder blocks the player (or is climbed, not walked through)', dist >= rock.r * 0.75 || p.y > rock.y, `boulder r=${rock.r.toFixed(2)}; player ${dist.toFixed(2)} m from centre, feet ${top.toFixed(2)} m above its base`);
  } else note('no boulder with r>0.7 near the forest spot');
  // ruins wall
  await tp(-320, 297); await face(0, -1);
  const w0 = await pos(); await hold(['KeyW'], 7000); await wait(500); const w1 = await pos();
  check('5 ruins wall blocks the player', w1.z > 300 - 6.6 - 0.36 + 0.3 - 0.05 && w0.z - w1.z > 0.5, `z ${w0.z.toFixed(2)} -> ${w1.z.toFixed(2)} (wall face at z≈${(300 - 6.6 + 0.35).toFixed(2)})`);
  // tent at camp
  await tp(4, 70); const tent = await ev(() => null);
  // map edge
  await tp(500, 60); await face(1, 0); await hold(['ShiftLeft', 'KeyW'], 9000); await wait(500); const e = await pos();
  check('5 world edge: the player cannot leave the map', e.x <= 512 && Number.isFinite(e.y), `x=${e.x.toFixed(1)} y=${e.y.toFixed(1)}`);
  const f = await g.frame();
  check('5 world edge still renders', f.distinct > 20, JSON.stringify(f));
  // water
  await tp(140, 56, 3000); const sw = await pos();
  await page.keyboard.down('ControlLeft'); const under = await waitFor(() => window.__WO__.runtime.camera.underwater, undefined, 50000); await page.keyboard.up('ControlLeft');
  const up = await waitFor(() => !window.__WO__.runtime.camera.underwater, undefined, 60000);
  check('5 water: swimming, diving with Ctrl, surfacing again', sw.swimming && under && up, `swimming=${sw.swimming} dived=${under} surfaced=${up}`);
});

await section('camera clipping', async () => {
  const spots = [[-40, -230, -0.8, -0.6], [-60, -250, 0.7, 0.7], [-215, 60, 1, 0], [-320, 310, 0, -1]];
  await page.keyboard.press('KeyV'); await wait(1500);
  let bad = [];
  for (const [x, z, dx, dz] of spots) {
    await tp(x, z, 2500); await face(dx, dz); await wait(2500);
    const c = await ev(() => { const w = window.__WO__; const c = w.runtime.camera.pos; return { clear: c.y - w.heightAt(c.x, c.z), mode: w.store.getState().viewMode }; });
    if (!(c.clear > 0.12)) bad.push(`${x},${z}: ${c.clear.toFixed(2)}`);
  }
  check('third-person camera never goes under the terrain', bad.length === 0, bad.join(' ; ') || 'clearance > 0.12 m at 4 spots');
  await page.keyboard.press('KeyV'); await wait(1200);
  // first person crouched on a slope
  await tp(-40, -230, 2500); await page.keyboard.down('ControlLeft'); await wait(3000);
  const c = await ev(() => { const w = window.__WO__; const c = w.runtime.camera.pos; return c.y - w.heightAt(c.x, c.z); });
  await page.keyboard.up('ControlLeft');
  check('first-person camera stays above ground when crouched on a slope', c > 0.4, `clearance ${c.toFixed(2)} m`);
});

finish('a_move', g.diag);
await g.browser.close();
