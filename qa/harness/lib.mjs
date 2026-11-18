import { chromium } from '@playwright/test';
import fs from 'node:fs';
export const results = [];
export const T0 = Date.now();
export function check(id, ok, evidence = '') {
  const line = `${ok ? 'PASS' : 'FAIL'} ${id}${evidence ? ' — ' + evidence : ''}`;
  results.push({ id, ok: Boolean(ok), evidence });
  console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${line}`);
  return Boolean(ok);
}
export function note(msg) { console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] NOTE ${msg}`); }
export async function section(name, fn) {
  try { await fn(); } catch (e) { check(`${name}: completed without exception`, false, String(e).split('\n')[0].slice(0, 260)); }
}
export async function launch({ preset = 'low', w = 960, h = 540, lang = 'en', keepStorage = false } = {}) {
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc', '--enable-precise-memory-info'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args });
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const presets = {
    low: { quality: 'low', renderScale: 0.5, shadows: 'off', vegetation: 0.4, drawDistance: 'low' },
    medium: { quality: 'medium', renderScale: 0.5, shadows: 'low', vegetation: 0.85, drawDistance: 'low' },
  };
  await ctx.addInitScript(([p, lang, keep]) => {
    if (keep && localStorage.getItem('wildlife-odyssey:settings')) return;
    localStorage.setItem('wildlife-odyssey:settings', JSON.stringify({ language: lang, ...p, adaptive: false, dayMinutes: 0, master: 0 }));
  }, [presets[preset], lang, keepStorage]);
  const page = await ctx.newPage();
  const diag = { errors: [], warnings: [], failed: [] };
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') diag.errors.push(t.slice(0, 300));
    else if (m.type() === 'warning' && !/GPU stall|THREE.Clock/.test(t)) diag.warnings.push(t.slice(0, 200));
  });
  page.on('pageerror', (e) => diag.errors.push('pageerror: ' + e.message.slice(0, 300)));
  page.on('requestfailed', (r) => diag.failed.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) diag.failed.push(`${r.url()} ${r.status()}`); });
  const ev = (f, a) => page.evaluate(f, a);
  const click = (id) => ev((id) => { const el = document.querySelector(`[data-testid="${id}"]`); if (!el) throw new Error('no element ' + id); el.click(); }, id);
  const exists = (id) => ev((id) => Boolean(document.querySelector(`[data-testid="${id}"]`)), id);
  const text = (id) => ev((id) => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? null, id);
  const wait = (ms) => page.waitForTimeout(ms);
  const waitFor = async (f, a, timeout = 60000) => { try { await page.waitForFunction(f, a, { timeout }); return true; } catch { return false; } };
  const pos = () => ev(() => { const p = window.__WO__.runtime.player; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, speed: p.speed, grounded: p.grounded, crouching: p.crouching, sprinting: p.sprinting, swimming: p.swimming, biome: p.biome, yaw: p.yaw }; });
  const face = (dx, dz) => ev(([dx, dz]) => { const w = window.__WO__; const p = w.runtime.player.pos; w.lookAt(p.x + dx * 30, p.y + 1.6, p.z + dz * 30); }, [dx, dz]);
  const tp = async (x, z, settle = 2500) => { await ev(([x, z]) => window.__WO__.teleport(x, z), [x, z]); await wait(settle); };
  const frame = () => ev(() => new Promise((resolve, reject) => {
    const rt = window.__WO__.runtime;
    rt.capture = { width: 0, height: 0, reject, resolve: (canvas) => {
      const c = canvas.getContext('2d'); const { data } = c.getImageData(0, 0, canvas.width, canvas.height);
      const seen = new Set(); let sum = 0, lo = 255, hi = 0, n = 0;
      for (let i = 0; i < data.length; i += 4 * 37) { const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; seen.add((data[i] >> 3) | ((data[i + 1] >> 3) << 5) | ((data[i + 2] >> 3) << 10)); sum += l; lo = Math.min(lo, l); hi = Math.max(hi, l); n++; }
      resolve({ w: canvas.width, h: canvas.height, distinct: seen.size, mean: Math.round(sum / n), spread: Math.round(hi - lo) });
    } };
  }));
  const perf = () => ev(() => { const p = window.__WO__.runtime.perf; return { fps: +p.fps.toFixed(2), calls: p.calls, tris: p.triangles, plants: p.plants, active: p.activeAgents, chunks: p.chunks, geo: p.geometries, tex: p.textures, prog: p.programs, w: p.width, h: p.height }; });
  const heap = () => ev(() => { if (window.gc) window.gc(); return Math.round(performance.memory.usedJSHeapSize / 1048576); });
  const shot = (name) => page.screenshot({ path: `qa/out/${name}.png`, timeout: 120000 }).catch(() => null);
  const startGame = async (role = 'biologist') => {
    await page.goto('http://127.0.0.1:4173/');
    await page.waitForSelector('[data-testid="main-menu"]', { timeout: 180000 });
    await click('menu-new'); await wait(600);
    if (await exists('confirm-yes')) { await click('confirm-yes'); await wait(600); }
    await click(`role-${role}`); await wait(400); await click('role-begin');
    await page.waitForSelector('[data-testid="hud"]', { timeout: 180000 });
    await waitFor(() => window.__WO__ && window.__WO__.runtime.perf.triangles > 1000);
  };
  const aim = async (id, ms = 650) => { await ev((id) => { const w = window.__WO__; const a = w.registry.wildlife.get(id); if (a) w.lookAt(a.position.x, a.position.y + a.rigDef.centerY, a.position.z); }, id); await wait(ms); };
  const lockOn = async (id, speciesId, timeout = 50000) => { const s = Date.now(); for (;;) { await aim(id); const t = await ev(() => window.__WO__.runtime.target?.speciesId ?? null); if (t === speciesId) return true; if (Date.now() - s > timeout) return false; } };
  return { browser, ctx, page, diag, ev, click, exists, text, wait, waitFor, pos, face, tp, frame, perf, heap, shot, startGame, aim, lockOn };
}
export function finish(name, diag) {
  const fails = results.filter((r) => !r.ok);
  console.log(`\n== ${name}: ${results.length - fails.length} passed, ${fails.length} failed ==`);
  for (const f of fails) console.log(`  FAIL ${f.id} — ${f.evidence}`);
  console.log(`console errors: ${diag.errors.length}${diag.errors.length ? '\n  ' + [...new Set(diag.errors)].slice(0, 6).join('\n  ') : ''}`);
  console.log(`failed requests: ${diag.failed.length}${diag.failed.length ? ' ' + diag.failed.slice(0, 3).join(' ') : ''}`);
  if (diag.warnings.length) console.log(`warnings: ${[...new Set(diag.warnings)].slice(0, 4).join(' | ')}`);
  fs.writeFileSync(`qa/out/${name}.json`, JSON.stringify({ results, diag }, null, 1));
}
