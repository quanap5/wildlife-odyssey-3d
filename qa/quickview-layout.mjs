/**
 * Measures the Quick View panel in real Chrome: empty and full collections, both languages,
 * at several window sizes. The panel must stay inside the window, right of the centre, under
 * the minimap, and must not be clipped at the sizes the game is designed for.
 * Usage: npm run build && npm run preview & node qa/quickview-layout.mjs [screenshotDir]
 */
import { chromium } from '@playwright/test';

const out = process.argv[2];
const sizes = [ [960, 540], [1280, 720], [1920, 1080], [800, 450] ];
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args });
let failed = 0;
for (const lang of ['en', 'vi']) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript((lang) => {
    localStorage.setItem('wildlife-odyssey:settings', JSON.stringify({ language: lang, quality: 'low', renderScale: 0.5, shadows: 'off', vegetation: 0.4, drawDistance: 'low', adaptive: false, dayMinutes: 0, master: 0 }));
  }, lang);
  await page.goto('http://127.0.0.1:4173/');
  await page.getByTestId('menu-new').click({ timeout: 120_000 });
  const confirm = page.getByTestId('confirm-yes');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.getByTestId('role-biologist').click();
  await page.getByTestId('role-begin').click();
  await page.getByTestId('hud').waitFor({ timeout: 120_000 });
  await page.waitForFunction(() => window.__WO__?.runtime.perf.triangles > 1000, undefined, { timeout: 120_000 });

  for (const state of ['empty', 'full']) {
    if (state === 'full') {
      await page.evaluate(() => {
        const st = window.__WO__.store;
        const now = Date.now();
        const ids = ['rusa-unicolor', 'pycnonotus-jocosus', 'barbonymus-gonionotus', 'physignathus-cocincinus', 'melastoma-malabathricum', 'imperata-cylindrica'];
        const discovered = {};
        ids.forEach((id, i) => (discovered[id] = { speciesId: id, at: now - i * 1000, scanned: true, photographed: true, viewed: false, bestQuality: 80, behaviors: [] }));
        const photos = [0, 1, 2, 3, 4, 5].map((i) => ({ id: `p${i}`, speciesId: ids[i], timestamp: now - i * 500, imageBlobId: `missing-${i}`, quality: 70 + i, rating: 'good', location: [0, 0, 0], biome: 'grassland', width: 960, height: 540 }));
        const videos = [{ id: 'v1', speciesId: 'physignathus-cocincinus', timestamp: now, blobId: 'x', mime: 'video/webm', seconds: 5, bytes: 1, location: [0, 0, 0], biome: 'freshwater', behaviors: ['idle'], simScale: 1 }];
        st.setState({ discovered, photos, videos, artifacts: ['jar', 'bell', 'tablet'], notes: ['note1', 'note2', 'note3', 'note4'], landmarks: ['camp', 'forest-station', 'river-station', 'summit-viewpoint', 'ruins', 'rock-shelter'], badges: ['first-researcher', 'freshwater-surveyor', 'forest-ecologist', 'field-archaeologist', 'master-naturalist'] });
      });
    }
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(1500);
      // The HUD itself: every block inside the window, none over the centre.
      const hud = await page.evaluate(() => {
        const vw = window.innerWidth, vh = window.innerHeight;
        return ['toolbar', 'hud-badges', 'minimap', 'hud-biome', 'tracker', 'compass'].map((id) => {
          const r = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
          if (!r) return { id, missing: true };
          return { id, inside: r.left >= 0 && r.top >= 0 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5, centre: r.left < vw / 2 && r.right > vw / 2 && r.top < vh / 2 && r.bottom > vh / 2 };
        });
      });
      const hudBad = hud.filter((b) => b.missing || !b.inside || b.centre);
      if (hudBad.length) { failed++; console.log(`FAIL hud ${lang} ${w}x${h} ${JSON.stringify(hudBad)}`); } else console.log(`PASS hud ${lang} ${state} ${w}x${h}`);
      await page.keyboard.down('KeyQ');
      await page.getByTestId('quick-view').waitFor({ timeout: 60_000 });
      await page.waitForTimeout(1200);
      const m = await page.evaluate(() => {
        const q = document.querySelector('[data-testid="quick-view"]');
        const r = q.getBoundingClientRect();
        const mm = document.querySelector('[data-testid="minimap"]').getBoundingClientRect();
        const ul = q.querySelector('ul');
        const rows = [...q.querySelectorAll('.qv-row')].map((li) => Math.round(li.getBoundingClientRect().height));
        const tb = document.querySelector('[data-testid="toolbar"]')?.getBoundingClientRect();
        return {
          top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right),
          underMinimap: r.top >= mm.bottom, clipped: ul.scrollHeight > ul.clientHeight + 1 || q.scrollHeight > q.clientHeight + 1,
          overToolbar: tb ? r.left < tb.right && tb.left < r.right && r.top < tb.bottom && tb.top < r.bottom : false, rows,
        };
      });
      const inside = m.bottom <= h && m.right <= w && m.top >= 0;
      const rightOfCentre = m.left > w / 2;
      // 800 x 450 is below the design size: the panel may be clipped there, but must still stay inside the window.
      const ok = inside && rightOfCentre && m.underMinimap && !m.overToolbar && (h < 540 || !m.clipped);
      if (!ok) failed++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${lang} ${state} ${w}x${h} ${JSON.stringify(m)}`);
      if (out) await page.screenshot({ path: `${out}/quick-${lang}-${state}-${w}x${h}.png` });
      await page.keyboard.up('KeyQ');
      await page.waitForTimeout(600);
    }
  }
  if (errors.length) { failed++; console.log('console errors:', errors); }
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
