/**
 * Records the demo clips used in the README.
 *
 * The real game is played by script in Chrome, one frame at a time: the page's
 * clock is paused and advanced 1/12 s per frame, so the simulation runs at its
 * true speed however slowly the machine renders, and each frame is saved as a
 * PNG. `encode-demo.sh` turns the frames into GIFs.
 *
 *   npm run build && npm run preview &        # http://127.0.0.1:4173
 *   node qa/demo/record-demo.mjs explore      # or: photo, journal
 *   sh qa/demo/encode-demo.sh
 *
 * Positioning the player next to an animal and keeping the lens on it use the
 * game's debug handle (window.__WO__); walking, tools, the shutter and the
 * journal are real key presses and clicks.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const scene = process.argv[2] ?? 'explore';
const URL = process.env.DEMO_URL ?? 'http://127.0.0.1:4173/';
const FPS = 12;
const STEP = 1000 / FPS;
const out = path.resolve('qa/out/demo', scene);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);

// Software WebGL so the script also runs on a machine without a GPU.
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const ctx = await browser.newContext({ viewport: { width: 1056, height: 594 } });
await ctx.addInitScript(() => {
  localStorage.setItem('wildlife-odyssey:settings', JSON.stringify({ language: 'en', quality: 'medium', renderScale: 0.68, shadows: 'off', vegetation: 0.7, drawDistance: 'low', adaptive: false, dayMinutes: 0, master: 0 }));
});
const page = await ctx.newPage();
page.on('pageerror', (e) => log('pageerror ' + e.message));
page.on('console', (m) => m.type() === 'error' && log('console.error ' + m.text().slice(0, 200)));

await page.clock.install({ time: new Date('2026-11-18T08:00:00') });
await page.goto(URL);
await page.clock.pauseAt(new Date('2026-11-18T08:00:05'));

const ev = (f, a) => page.evaluate(f, a);
const tick = async (n = 1) => {
  for (let i = 0; i < n; i++) await page.clock.fastForward(STEP);
};
/**
 * CSS animations and transitions run on the compositor's real clock, which the paused page clock
 * does not slow down, so a fade that lasts six seconds would be over within one captured frame.
 * Every animation is therefore paused and moved by hand to where it would be at the page's own time.
 */
const syncAnimations = () =>
  ev(() => {
    const w = window;
    w.__animStart ??= new WeakMap();
    const now = performance.now();
    for (const a of document.getAnimations()) {
      if (!w.__animStart.has(a)) w.__animStart.set(a, now - (typeof a.currentTime === 'number' ? Math.min(a.currentTime, 0) : 0));
      if (a.playState === 'running') a.pause();
      if (a.playState !== 'finished') a.currentTime = now - w.__animStart.get(a);
    }
  });
let frame = 0;
/** Advance one frame and save it. */
const grab = async (n = 1, each) => {
  for (let i = 0; i < n; i++) {
    if (each) await each(i);
    await tick();
    await syncAnimations();
    await page.screenshot({ path: path.join(out, `f-${String(frame++).padStart(3, '0')}.png`), timeout: 180000 });
  }
};
const click = async (id) => {
  await ev((id) => document.querySelector(`[data-testid="${id}"]`).click(), id);
  await tick(2);
};
const until = async (f, max = 600) => {
  for (let i = 0; i < max; i++) {
    if (await ev(f)) return true;
    await tick();
    await syncAnimations();
  }
  return false;
};
/** Jumps the page clock ahead in one step so that on-screen notices expire, without rendering every frame in between. */
const skipNotices = async () => {
  await page.clock.fastForward(8000);
  await tick(3);
  await syncAnimations();
};
/** Let time pass without recording. */
const idle = async (n, each) => {
  for (let i = 0; i < n; i++) {
    if (each) await each(i);
    await tick();
    await syncAnimations();
  }
};

for (let i = 0; i < 400 && !(await page.locator('[data-testid="main-menu"]').count()); i++) {
  await tick();
  await new Promise((r) => setTimeout(r, 150));
}
await click('menu-new');
await click('role-biologist');
await click('role-begin');
await until(() => Boolean(window.__WO__ && window.__WO__.runtime.perf.triangles > 1000 && document.querySelector('[data-testid="hud"]')));
// Capture the mouse like a player would, so the "click to look" hint goes away.
await page.mouse.click(528, 300);
await tick(6);
log('in game; pointer locked: ' + (await ev(() => window.__WO__.input.locked)));

/** Nearest animal of a species; stands the player `distance` metres from it, looking a little to one side. */
const approach = async (speciesId, distance, offset) =>
  ev(
    ({ speciesId, distance, offset }) => {
      const wo = window.__WO__;
      const p = wo.runtime.player.pos;
      const agents = wo.registry.wildlife.agents.filter((a) => a.speciesId === speciesId);
      agents.sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p));
      const a = agents[0];
      let best = [a.position.x + distance, a.position.z];
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const x = a.position.x + Math.cos(ang) * distance;
        const z = a.position.z + Math.sin(ang) * distance;
        if (wo.heightAt(x, z) > 0.3 && Math.abs(wo.heightAt(x, z) - a.position.y) < 3) {
          best = [x, z];
          break;
        }
      }
      wo.teleport(best[0], best[1]);
      wo.runtime.player.yaw = Math.atan2(-(a.position.x - best[0]), -(a.position.z - best[1])) + offset;
      wo.runtime.player.pitch = 0;
      return a.id;
    },
    { speciesId, distance, offset },
  );
/** Turns the view a fraction of the way towards an animal, like a hand following it. */
const follow = (id, k) =>
  ev(
    ({ id, k }) => {
      const wo = window.__WO__;
      const a = wo.registry.wildlife.get(id);
      const c = wo.runtime.camera.pos;
      const dx = a.position.x - c.x;
      const dy = a.position.y + a.rigDef.centerY - c.y;
      const dz = a.position.z - c.z;
      const p = wo.runtime.player;
      let d = Math.atan2(-dx, -dz) - p.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.yaw += d * k;
      p.pitch += (Math.atan2(dy, Math.hypot(dx, dz)) - p.pitch) * k;
    },
    { id, k },
  );

if (scene === 'explore') {
  // Walk out of the research camp towards the forest edge, looking around.
  await grab(6);
  await page.keyboard.down('KeyW');
  await grab(14);
  await page.keyboard.down('ArrowLeft');
  await grab(20);
  await page.keyboard.up('ArrowLeft');
  await grab(8);
  await page.keyboard.down('ArrowRight');
  await grab(30);
  await page.keyboard.up('ArrowRight');
  await grab(12);
  await page.keyboard.up('KeyW');
} else if (scene === 'photo') {
  // Raise the camera on a sambar deer, zoom in, wait for focus, release the shutter.
  const id = await approach('rusa-unicolor', 19, 0.22);
  // A first photograph is taken off the record, so the species is already known and the start-of-game
  // notices have gone: the recorded shot then shows the score card without a stack of messages over it.
  await idle(10, () => follow(id, 0.3));
  await page.keyboard.press('KeyC');
  await page.keyboard.press('Digit3');
  await until(() => window.__WO__.runtime.focusLock >= 1, 120);
  await idle(4, () => follow(id, 0.4));
  await page.keyboard.press('Enter');
  await until(() => window.__WO__.store.getState().photos.length > 0, 60);
  await page.keyboard.press('KeyC');
  await ev(() => (window.__WO__.runtime.player.yaw += 0.2));
  await idle(4);
  await skipNotices();
  await grab(8, () => follow(id, 0.12));
  await page.keyboard.press('KeyC');
  await grab(12, () => follow(id, 0.2));
  await page.keyboard.press('Digit3');
  await grab(22, () => follow(id, 0.3));
  for (let i = 0; i < 40 && !(await ev(() => window.__WO__.runtime.focusLock >= 1)); i++) await grab(1, () => follow(id, 0.4));
  await grab(6, () => follow(id, 0.4));
  await page.keyboard.press('Enter');
  for (let i = 0; i < 12 && !(await ev(() => window.__WO__.store.getState().photos.length > 1)); i++) await grab(1, () => follow(id, 0.4));
  log('photos: ' + (await ev(() => JSON.stringify(window.__WO__.store.getState().photos.map((p) => ({ s: p.speciesId, q: Math.round(p.quality), r: p.rating }))))));
  await grab(34, () => follow(id, 0.4));
} else if (scene === 'journal') {
  // Scan the deer, see the discovery card, open its page in the field journal.
  const id = await approach('rusa-unicolor', 19, -0.2);
  // Wait off the record until the start-of-game notices have gone.
  await idle(6);
  await skipNotices();
  await grab(8, () => follow(id, 0.12));
  await page.keyboard.press('KeyF');
  for (let i = 0; i < 70 && !(await ev(() => Boolean(window.__WO__.store.getState().discovered['rusa-unicolor']))); i++) await grab(1, () => follow(id, 0.35));
  log('discovered: ' + (await ev(() => Object.keys(window.__WO__.store.getState().discovered).join(','))));
  await grab(30, () => follow(id, 0.35));
  await page.keyboard.press('KeyF');
  await grab(10, () => follow(id, 0.2));
  await page.keyboard.press('KeyJ');
  await grab(8);
  await page.getByTestId('species-card-rusa-unicolor').click();
  await grab(36);
}

log(`${frame} frames in ${out}`);
await browser.close();
