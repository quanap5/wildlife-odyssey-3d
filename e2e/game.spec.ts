import { expect, test } from '@playwright/test';
import { aimAtAgent, frameStats, heldItem, lockOn, openMenu, playerPos, scannerScreenPixels, standNear, startExpedition, useLowGraphics, watch } from './helpers';

test.describe('Wildlife Odyssey 3D', () => {
  test('main menu: loads, renders a 3D world, switches language, opens the field guide', async ({ page }) => {
    const diag = watch(page);
    await useLowGraphics(page, 'vi');
    await openMenu(page);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('WILDLIFE ODYSSEY 3D');
    for (const id of ['menu-continue', 'menu-new', 'menu-guide', 'menu-settings', 'menu-credits']) await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId('menu-continue')).toBeDisabled();
    await expect(page.getByTestId('menu-new')).toHaveText('Chuyến thám hiểm mới');

    // The canvas shows an actual rendered scene, not a blank or flat-coloured frame.
    await page.waitForFunction(() => (window.__WO__?.runtime.perf.triangles ?? 0) > 10_000, undefined, { timeout: 90_000 });
    const frame = await frameStats(page);
    expect(frame.width).toBeGreaterThan(300);
    expect(frame.distinct).toBeGreaterThan(40);
    expect(frame.lumaSpread).toBeGreaterThan(60);
    const perf = await page.evaluate(() => window.__WO__!.runtime.perf);
    expect(perf.calls).toBeGreaterThan(10);
    expect(perf.plants).toBeGreaterThan(500);
    expect(perf.activeAgents).toBeGreaterThan(0);

    await page.getByTestId('lang-en').click();
    await expect(page.getByTestId('menu-new')).toHaveText('New Expedition');

    // Field guide lists the whole catalog; switching language keeps the open species page.
    await page.getByTestId('menu-guide').click();
    await expect(page.locator('[data-testid^="species-card-"]')).toHaveCount(36);
    await page.getByTestId('species-card-buceros-bicornis').click();
    await expect(page.getByTestId('species-name')).toHaveText('Great hornbill');
    await expect(page.getByTestId('species-scientific')).toHaveText('Buceros bicornis');
    // Switch language with the species page still open.
    await page.getByTestId('guide-panel').getByTestId('lang-vi').click();
    await expect(page.getByTestId('species-name')).toHaveText('Hồng hoàng');
    await expect(page.getByTestId('species-alt-name')).toHaveText('Great hornbill');
    await expect(page.getByTestId('species-page')).toContainText('Bucerotidae');
    await page.getByTestId('guide-panel').getByTestId('lang-en').click();
    await expect(page.getByTestId('species-name')).toHaveText('Great hornbill');
    await page.getByTestId('panel-close').click();

    // Settings are reachable from the menu and persist.
    await page.getByTestId('menu-settings').click();
    await expect(page.getByTestId('settings-panel')).toBeVisible();
    await page.getByTestId('set-quality').getByRole('button', { name: 'Low' }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wildlife-odyssey:settings') ?? '{}').quality)).toBe('low');
    await page.getByTestId('panel-close').click();

    await page.getByTestId('menu-credits').click();
    await expect(page.getByTestId('credits-panel')).toBeVisible();
    await page.getByTestId('panel-close').click();

    expect(diag.errors, diag.errors.join('\n')).toEqual([]);
    expect(diag.failedRequests, diag.failedRequests.join('\n')).toEqual([]);
  });

  test('acceptance scenario: explore, photograph, scan, inspect, record, map, save and resume', async ({ page }) => {
    test.setTimeout(45 * 60_000);
    const diag = watch(page);
    await useLowGraphics(page, 'en');
    await openMenu(page);

    await test.step('1-5: new expedition as Wildlife Biologist, spawn at camp', async () => {
      await startExpedition(page, 'biologist');
      const s = await page.evaluate(() => {
        const st = window.__WO__!.store.getState();
        return { role: st.role, screen: st.screen, backend: window.__WO__!.registry.physics?.backend };
      });
      expect(s).toEqual({ role: 'biologist', screen: 'playing', backend: 'rapier' });
      const p = await playerPos(page);
      expect(Math.hypot(p.x - 0, p.z - 60)).toBeLessThan(12);
      await expect(page.getByTestId('tracker')).toContainText('First Steps into the Wild');
      const frame = await frameStats(page);
      expect(frame.distinct).toBeGreaterThan(40);
    });

    await test.step('6: move with WASD and look around', async () => {
      const before = await playerPos(page);
      const yaw0 = await page.evaluate(() => window.__WO__!.runtime.player.yaw);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(6000);
      await page.keyboard.up('KeyW');
      const after = await playerPos(page);
      expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(2);
      // Feet stay on the ground.
      const ground = await page.evaluate((p) => window.__WO__!.heightAt(p.x, p.z), after);
      expect(Math.abs(after.y - ground)).toBeLessThan(0.4);
      // Keyboard look.
      await page.keyboard.down('ArrowLeft');
      await page.waitForTimeout(1500);
      await page.keyboard.up('ArrowLeft');
      const yaw1 = await page.evaluate(() => window.__WO__!.runtime.player.yaw);
      expect(yaw1).toBeGreaterThan(yaw0 + 0.05);
      // Mouse look (drag fallback when pointer lock is unavailable in automation).
      const box = (await page.getByTestId('game-canvas').boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(1200);
      const yaw2 = await page.evaluate(() => window.__WO__!.runtime.player.yaw);
      expect(Math.abs(yaw2 - yaw1)).toBeGreaterThan(0.02);
      await page.keyboard.press('Escape');
      if (await page.getByTestId('pause').isVisible().catch(() => false)) await page.getByTestId('pause-resume').click();
    });

    let deerId = '';
    await test.step('7-10: walk towards the forest edge; a deer notices and reacts', async () => {
      const deer = await standNear(page, 'rusa-unicolor', 34);
      deerId = deer.id;
      const seen = new Set<string>();
      await page.keyboard.down('KeyW');
      for (let i = 0; i < 40 && !(seen.has('alert') || seen.has('fleeing')); i++) {
        await aimAtAgent(page, deerId);
        seen.add(await page.evaluate((id) => window.__WO__!.registry.wildlife!.get(id)!.currentBehavior, deerId));
      }
      await page.keyboard.up('KeyW');
      expect([...seen].some((b) => b === 'alert' || b === 'fleeing'), `behaviours seen: ${[...seen].join(', ')}`).toBe(true);
      const info = await page.evaluate(() => ({ biome: window.__WO__!.runtime.player.biome, agents: window.__WO__!.runtime.perf.activeAgents, plants: window.__WO__!.runtime.perf.plants }));
      expect(info.agents).toBeGreaterThan(3);
      expect(info.plants).toBeGreaterThan(200);
    });

    await test.step('11: binoculars (B) zoom by changing the field of view', async () => {
      const deer = await standNear(page, 'rusa-unicolor', 26);
      deerId = deer.id;
      const fov0 = await page.evaluate(() => window.__WO__!.runtime.camera.fov);
      await page.keyboard.press('KeyB');
      await expect(page.getByTestId('tool-binoculars')).toBeVisible();
      await page.waitForFunction(() => window.__WO__!.runtime.camera.zoom > 5.5, undefined, { timeout: 30_000 });
      const fov1 = await page.evaluate(() => window.__WO__!.runtime.camera.fov);
      expect(fov1).toBeLessThan(fov0 / 4);
      const canvasSize = await page.getByTestId('game-canvas').boundingBox();
      // Zooming changed the projection, not the size of the canvas element.
      expect(canvasSize?.width).toBe(960);
      await page.keyboard.press('KeyB');
      await expect(page.getByTestId('tool-binoculars')).toBeHidden();
    });

    await test.step('12-15: camera (C), zoom, focus, photograph; photo is scored and identifies the species', async () => {
      await page.keyboard.press('KeyC');
      await expect(page.getByTestId('viewfinder')).toBeVisible();
      await page.keyboard.press('Digit3');
      await page.waitForFunction(() => Math.abs(window.__WO__!.runtime.camera.zoom - 4) < 0.1, undefined, { timeout: 30_000 });
      await lockOn(page, deerId, 'rusa-unicolor');
      await expect(page.getByTestId('subject')).toContainText('Unknown species');
      await page.waitForFunction(() => window.__WO__!.runtime.focusLock >= 1, undefined, { timeout: 30_000 });
      await expect(page.getByTestId('viewfinder')).toHaveAttribute('data-focus', 'locked');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__WO__!.store.getState().photos.length === 1, undefined, { timeout: 60_000 });
      const shot = await page.evaluate(async () => {
        const st = window.__WO__!.store.getState();
        const meta = st.photos[0]!;
        return { meta, discovered: Object.keys(st.discovered), score: st.lastShot?.score?.total };
      });
      expect(shot.meta.speciesId).toBe('rusa-unicolor');
      expect(shot.meta.quality).toBeGreaterThan(35);
      expect(shot.meta.quality).toBeLessThanOrEqual(100);
      expect(shot.meta.width).toBeGreaterThan(300);
      expect(shot.discovered).toContain('rusa-unicolor');
      await expect(page.getByTestId('scorecard')).toBeVisible();
      await expect(page.getByTestId('subject')).toContainText('Sambar deer');
      await page.keyboard.press('KeyC');
    });

    await test.step('scanner (F) identifies the animal from the species database', async () => {
      const deer = await standNear(page, 'rusa-unicolor', 24);
      deerId = deer.id;
      await page.keyboard.press('KeyF');
      await expect(page.getByTestId('scanner')).toBeVisible();
      const start = Date.now();
      while (Date.now() - start < 60_000) {
        await aimAtAgent(page, deerId);
        if (await page.evaluate(() => window.__WO__!.store.getState().discovered['rusa-unicolor']?.scanned === true)) break;
      }
      expect(await page.evaluate(() => window.__WO__!.store.getState().discovered['rusa-unicolor']?.scanned)).toBe(true);
      await lockOn(page, deerId, 'rusa-unicolor');
      await expect(page.getByTestId('scan-name')).toHaveText('Sambar deer');
      await expect(page.getByTestId('scanner')).toContainText('Cervidae');
      await page.keyboard.press('KeyF');
    });

    await test.step('16-17: journal (J) shows both names, scientific name, family, habitat and adaptations', async () => {
      await page.keyboard.press('KeyJ');
      await expect(page.getByTestId('journal')).toBeVisible();
      await expect(page.getByTestId('species-card-rusa-unicolor')).toHaveAttribute('data-open', 'true');
      await expect(page.getByTestId('species-card-buceros-bicornis')).toHaveAttribute('data-open', 'false');
      await page.getByTestId('species-card-rusa-unicolor').click();
      const pageEl = page.getByTestId('species-page');
      await expect(page.getByTestId('species-name')).toHaveText('Sambar deer');
      await expect(page.getByTestId('species-alt-name')).toHaveText('Nai');
      await expect(page.getByTestId('species-scientific')).toHaveText('Rusa unicolor');
      await expect(pageEl).toContainText('Cervidae');
      await expect(pageEl).toContainText('Artiodactyla');
      await expect(pageEl).toContainText('Grassland and Meadow');
      await expect(pageEl).toContainText('Survival adaptations');
      await expect(pageEl).toContainText('Antlers are shed and regrown every year');
      // The photograph is in the album with its score and can be opened.
      await page.getByTestId('tab-album').click();
      await expect(page.getByTestId('photo-card')).toHaveCount(1);
      await page.getByTestId('photo-card').click();
      await expect(page.getByTestId('photo-lightbox').locator('img')).toBeVisible({ timeout: 20_000 });
      const natural = await page.getByTestId('photo-lightbox').locator('img').evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }));
      expect(natural.w).toBeGreaterThan(300);
      // At top level (not embedded in a frame) the photo can be downloaded.
      await expect(page.getByTestId('photo-lightbox').getByRole('button', { name: 'Download' })).toBeEnabled();
      await page.getByTestId('photo-lightbox').getByRole('button', { name: 'Close' }).click();
      await page.getByTestId('tab-progress').click();
      await expect(page.getByTestId('quest-first-steps')).toBeVisible();
      await page.keyboard.press('KeyJ');
      await expect(page.getByTestId('journal')).toBeHidden();
    });

    await test.step('18: inspection mode shows the animal in its own 3D view', async () => {
      await page.keyboard.press('KeyJ');
      await page.getByTestId('tab-encyclopedia').click();
      await page.getByTestId('species-card-rusa-unicolor').click();
      await page.getByTestId('species-inspect').click();
      await expect(page.getByTestId('inspection')).toBeVisible();
      await expect(page.getByTestId('inspect-name')).toHaveText('Sambar deer');
      await expect(page.getByTestId('inspection').locator('canvas')).toBeVisible();
      await expect(page.getByTestId('inspect-anims').getByRole('button')).toHaveCount(6);
      await page.getByTestId('inspect-anims').getByRole('button', { name: 'Feeding' }).click();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('inspection')).toBeHidden();
    });

    await test.step('19-21: record a video, replay at 0.5x, save it to the journal', async () => {
      const support = await page.evaluate(() => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm'));
      expect(support, 'this Chrome build must support MediaRecorder/webm').toBe(true);
      const deer = await standNear(page, 'rusa-unicolor', 24);
      deerId = deer.id;
      await page.keyboard.press('KeyC');
      await page.keyboard.press('KeyT');
      await expect(page.getByTestId('tool-video')).toBeVisible();
      await lockOn(page, deerId, 'rusa-unicolor');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__WO__!.store.getState().recording === true, undefined, { timeout: 20_000 });
      const start = Date.now();
      while (Date.now() - start < 9000) await aimAtAgent(page, deerId);
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('video-review')).toBeVisible({ timeout: 40_000 });
      await expect(page.getByTestId('review-subject')).toHaveText('Sambar deer');
      await page.getByTestId('review-rate-0.5').click();
      const rate = await page.getByTestId('review-video').evaluate((v: HTMLVideoElement) => v.playbackRate);
      expect(rate).toBe(0.5);
      await expect(page.getByTestId('video-review')).toContainText('not high-frame-rate footage');
      const size = await page.evaluate(() => window.__WO__!.store.getState().pendingVideo?.blob.size ?? 0);
      expect(size).toBeGreaterThan(1000);
      await page.getByTestId('review-save').click();
      await page.waitForFunction(() => window.__WO__!.store.getState().videos.length === 1, undefined, { timeout: 30_000 });
      const video = await page.evaluate(() => window.__WO__!.store.getState().videos[0]!);
      expect(video.speciesId).toBe('rusa-unicolor');
      expect(video.bytes).toBeGreaterThan(1000);
      expect(video.behaviors.length).toBeGreaterThan(0);
      await page.keyboard.press('KeyC');
    });

    await test.step('22-24: at the river, observe fish under water, identify and photograph one', async () => {
      // Swim, then dive with Ctrl to watch below the surface.
      await page.evaluate(() => window.__WO__!.teleport(140, 56));
      await page.waitForFunction(() => window.__WO__!.runtime.player.swimming, undefined, { timeout: 30_000 });
      await page.waitForFunction(() => window.__WO__!.runtime.player.biome === 'freshwater', undefined, { timeout: 30_000 });
      await page.keyboard.down('ControlLeft');
      await page.waitForFunction(() => window.__WO__!.runtime.camera.underwater, undefined, { timeout: 40_000 });
      const fishNear = await page.evaluate(() => {
        const wo = window.__WO__!;
        return wo.registry.wildlife!.agents.filter((a) => a.profile.cls === 'fish' && a.active).map((a) => ({ y: a.position.y, depthOk: wo.heightAt(a.position.x, a.position.z) < a.position.y && a.position.y < 0 }));
      });
      expect(fishNear.length).toBeGreaterThan(3);
      expect(fishNear.every((f) => f.depthOk)).toBe(true);
      await page.keyboard.up('ControlLeft');

      // From the bank: scan a fish, then photograph it.
      const fish = await page.evaluate(() => {
        const wo = window.__WO__!;
        const a = wo.registry.wildlife!.agents.filter((x) => x.speciesId === 'barbonymus-gonionotus' && x.active)[0]!;
        // Find the nearest bank point.
        let best: [number, number] = [a.position.x, a.position.z];
        let bestD = Infinity;
        for (let i = 0; i < 48; i++) {
          for (const r of [8, 10, 12, 14, 16]) {
            const ang = (i / 48) * Math.PI * 2;
            const x = a.position.x + Math.cos(ang) * r;
            const z = a.position.z + Math.sin(ang) * r;
            const h = wo.heightAt(x, z);
            if (h > 0.25 && h < 2 && r < bestD) {
              bestD = r;
              best = [x, z];
            }
          }
        }
        wo.teleport(best[0], best[1]);
        return { id: a.id, bank: best };
      });
      await page.waitForTimeout(1500);
      await page.keyboard.press('KeyF');
      const t0 = Date.now();
      while (Date.now() - t0 < 90_000) {
        await aimAtAgent(page, fish.id);
        if (await page.evaluate(() => Boolean(window.__WO__!.store.getState().discovered['barbonymus-gonionotus']))) break;
      }
      expect(await page.evaluate(() => Boolean(window.__WO__!.store.getState().discovered['barbonymus-gonionotus']))).toBe(true);
      await page.keyboard.press('KeyF');
      await page.keyboard.press('KeyC');
      await page.keyboard.press('Digit3');
      await lockOn(page, fish.id, 'barbonymus-gonionotus', 60_000);
      const before = await page.evaluate(() => window.__WO__!.store.getState().photos.length);
      await page.keyboard.press('Enter');
      await page.waitForFunction((n) => window.__WO__!.store.getState().photos.length > n, before, { timeout: 60_000 });
      const last = await page.evaluate(() => window.__WO__!.store.getState().photos.at(-1)!);
      expect(last.biome).toBe('freshwater');
      await page.keyboard.press('KeyC');
    });

    await test.step('25-26: map (M), waypoint, reach another biome', async () => {
      await page.keyboard.press('KeyM');
      await expect(page.getByTestId('map-panel')).toBeVisible();
      const box = (await page.getByTestId('map-canvas').boundingBox())!;
      // The map is a square letterboxed in its element; click in the western forest.
      const side = Math.min(box.width, box.height);
      const left = box.x + (box.width - side) / 2;
      const top = box.y + (box.height - side) / 2;
      await page.mouse.click(left + side * 0.27, top + side * 0.56);
      const wp = await page.evaluate(() => window.__WO__!.store.getState().waypoint);
      expect(wp).not.toBeNull();
      expect(wp![0]).toBeGreaterThan(-260);
      expect(wp![0]).toBeLessThan(-210);
      expect(Math.abs(wp![1] - 61)).toBeLessThan(25);
      await page.keyboard.press('KeyM');
      await expect(page.getByTestId('map-panel')).toBeHidden();
      await expect(page.getByTestId('hud')).toContainText('Waypoint');
      // Travel there (harness teleport to just short of the marker, then walk the rest).
      await page.evaluate((w) => {
        window.__WO__!.teleport(w[0] + 14, w[1]);
        window.__WO__!.runtime.player.yaw = Math.PI / 2;
      }, wp!);
      await page.waitForFunction(() => window.__WO__!.runtime.player.biome === 'rainforest', undefined, { timeout: 30_000 });
      await page.keyboard.down('KeyW');
      await page.waitForFunction(() => window.__WO__!.store.getState().waypoint === null, undefined, { timeout: 180_000 });
      await page.keyboard.up('KeyW');
      const visited = await page.evaluate(() => window.__WO__!.store.getState().visitedBiomes);
      expect(visited).toEqual(expect.arrayContaining(['grassland', 'freshwater', 'rainforest']));
    });

    await test.step('27: complete research mission 1', async () => {
      // Remaining objective: walk 40 m in total.
      await page.keyboard.down('KeyS');
      await page.waitForFunction(() => window.__WO__!.store.getState().quest.completed.includes('first-steps'), undefined, { timeout: 240_000 });
      await page.keyboard.up('KeyS');
      // The player is told: mission complete, badge earned, next mission.
      await expect(page.getByTestId('notices')).toContainText('Badge earned', { timeout: 5000 });
      await expect(page.getByTestId('notices')).toContainText('Life by the River');
      const s = await page.evaluate(() => {
        const st = window.__WO__!.store.getState();
        return { badges: st.badges, active: st.quest.activeIndex };
      });
      expect(s.badges).toContain('first-researcher');
      expect(s.active).toBeGreaterThanOrEqual(1);
    });

    let saved: { pos: { x: number; y: number; z: number }; discovered: string[]; photos: number; videos: number; completed: string[] };
    await test.step('28: save and return to the main menu', async () => {
      saved = await page.evaluate(() => {
        const st = window.__WO__!.store.getState();
        const p = window.__WO__!.runtime.player.pos;
        return { pos: { x: p.x, y: p.y, z: p.z }, discovered: Object.keys(st.discovered).sort(), photos: st.photos.length, videos: st.videos.length, completed: st.quest.completed };
      });
      await page.keyboard.press('Escape');
      if (!(await page.getByTestId('pause').isVisible().catch(() => false))) await page.keyboard.press('Escape');
      await expect(page.getByTestId('pause')).toBeVisible();
      await page.getByTestId('pause-menu').click();
      await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('menu-continue')).toBeEnabled();
    });

    await test.step('29-30: reload the page, continue, and find everything preserved', async () => {
      await page.reload();
      await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 120_000 });
      await expect(page.getByTestId('menu-continue')).toBeEnabled();
      await page.getByTestId('menu-continue').click();
      await expect(page.getByTestId('hud')).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(2500);
      const now = await page.evaluate(() => {
        const st = window.__WO__!.store.getState();
        const p = window.__WO__!.runtime.player.pos;
        return { pos: { x: p.x, y: p.y, z: p.z }, discovered: Object.keys(st.discovered).sort(), photos: st.photos.length, videos: st.videos.length, completed: st.quest.completed, role: st.role };
      });
      expect(now.role).toBe('biologist');
      expect(now.discovered).toEqual(saved.discovered);
      expect(now.discovered).toEqual(expect.arrayContaining(['rusa-unicolor', 'barbonymus-gonionotus']));
      expect(now.photos).toBe(saved.photos);
      expect(now.videos).toBe(saved.videos);
      expect(now.completed).toEqual(saved.completed);
      expect(Math.hypot(now.pos.x - saved.pos.x, now.pos.z - saved.pos.z)).toBeLessThan(1.5);
      // Stored media survived the reload too.
      await page.keyboard.press('KeyJ');
      await page.getByTestId('tab-album').click();
      await expect(page.getByTestId('photo-card')).toHaveCount(saved.photos);
      await expect(page.getByTestId('photo-card').first().locator('img')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('tab-videos').click();
      await expect(page.getByTestId('video-card')).toHaveCount(1);
      await page.getByTestId('video-card').click();
      await expect(page.getByTestId('video-player').locator('video')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('rate-0.5').click();
      expect(await page.getByTestId('video-player').locator('video').evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(0.5);
    });

    expect(diag.errors, diag.errors.join('\n')).toEqual([]);
    expect(diag.failedRequests, diag.failedRequests.join('\n')).toEqual([]);
  });

  test('tools, interactions and environment: archaeologist, slow motion, third person, jump, signs, plants, macro, weather, night, Vietnamese, reset', async ({ page }) => {
    test.setTimeout(25 * 60_000);
    const diag = watch(page);
    await useLowGraphics(page, 'en');
    await openMenu(page);
    await startExpedition(page, 'archaeologist');
    expect(await page.evaluate(() => window.__WO__!.store.getState().role)).toBe('archaeologist');

    await test.step('slow motion (Z) slows the simulation clock to 0.5x and 0.25x, then restores it', async () => {
      const rate = async (): Promise<number> => {
        const a = await page.evaluate(() => ({ sim: window.__WO__!.runtime.time.sim, real: window.__WO__!.runtime.time.real }));
        await page.waitForTimeout(5000);
        const b = await page.evaluate(() => ({ sim: window.__WO__!.runtime.time.sim, real: window.__WO__!.runtime.time.real }));
        return (b.sim - a.sim) / (b.real - a.real);
      };
      expect(await rate()).toBeCloseTo(1, 1);
      await page.keyboard.press('KeyZ');
      expect(await page.evaluate(() => window.__WO__!.store.getState().slowmo)).toBe(1);
      await expect(page.getByTestId('hud')).toContainText('0.5');
      expect(await rate()).toBeCloseTo(0.5, 1);
      await page.keyboard.press('KeyZ');
      expect(await rate()).toBeCloseTo(0.25, 1);
      await page.keyboard.press('KeyZ');
      expect(await page.evaluate(() => window.__WO__!.store.getState().slowmo)).toBe(0);
      expect(await rate()).toBeCloseTo(1, 1);
    });

    await test.step('third person (V) and the performance overlay (F3)', async () => {
      await page.keyboard.press('KeyV');
      expect(await page.evaluate(() => window.__WO__!.store.getState().viewMode)).toBe('third');
      await page.waitForTimeout(2500);
      const frame = await frameStats(page);
      expect(frame.distinct).toBeGreaterThan(40);
      await page.keyboard.press('KeyV');
      expect(await page.evaluate(() => window.__WO__!.store.getState().viewMode)).toBe('first');
      await page.keyboard.press('F3');
      await expect(page.getByTestId('perf')).toBeVisible();
      await expect(page.getByTestId('perf')).toContainText(/fps/i);
      await page.keyboard.press('F3');
      await expect(page.getByTestId('perf')).toBeHidden();
    });

    await test.step('jump (Space) leaves the ground and lands again', async () => {
      const y0 = (await playerPos(page)).y;
      await page.keyboard.down('Space');
      await page.waitForFunction((y) => window.__WO__!.runtime.player.pos.y > y + 0.25, y0, { timeout: 60_000 });
      await page.keyboard.up('Space');
      await page.waitForFunction((y) => window.__WO__!.runtime.player.grounded && Math.abs(window.__WO__!.runtime.player.pos.y - y) < 0.15, y0, { timeout: 60_000 });
    });

    await test.step('interact (E) reads the camp notice board', async () => {
      await page.evaluate(() => {
        const wo = window.__WO__!;
        wo.teleport(9.5, 63.4);
        setTimeout(() => wo.lookAt(9.5, wo.heightAt(9.5, 61.5) + 1.5, 61.5), 500);
      });
      await expect(page.getByTestId('prompt')).toBeVisible({ timeout: 40_000 });
      await page.keyboard.press('KeyE');
      await expect(page.getByTestId('reader')).toBeVisible();
      await expect(page.getByTestId('reader')).not.toBeEmpty();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('reader')).toBeHidden();
    });

    let plantId = '';
    await test.step('scanner (F) identifies a plant and files it in the journal', async () => {
      const plant = await page.evaluate(() => {
        const wo = window.__WO__!;
        const p = wo.runtime.player.pos;
        const trees = wo.registry.plants.filter((c) => c.radius > 1.2 && wo.heightAt(c.x, c.z) > 0.5);
        trees.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        const c = trees[0]!;
        const d = Math.hypot(c.x - p.x, c.z - p.z) || 1;
        // Stand 9 m short of it, on the side we are already on.
        wo.teleport(c.x + ((p.x - c.x) / d) * 9, c.z + ((p.z - c.z) / d) * 9);
        return { id: c.id, speciesId: c.speciesId, x: c.x, y: c.y, z: c.z };
      });
      plantId = plant.speciesId;
      await page.waitForTimeout(1200);
      await page.keyboard.press('KeyF');
      const t0 = Date.now();
      while (Date.now() - t0 < 90_000) {
        await page.evaluate((c) => window.__WO__!.lookAt(c.x, c.y, c.z), plant);
        await page.waitForTimeout(600);
        if (await page.evaluate((id) => Boolean(window.__WO__!.store.getState().discovered[id]), plant.speciesId)) break;
      }
      expect(await page.evaluate((id) => Boolean(window.__WO__!.store.getState().discovered[id]), plant.speciesId)).toBe(true);
      // First sighting raises the discovery card for that species.
      await expect(page.getByTestId('discovery-card')).toBeVisible({ timeout: 6000 });
      await expect(page.getByTestId('discovery-card')).toHaveAttribute('data-species', plant.speciesId);
      await page.keyboard.press('KeyF');
      await page.keyboard.press('KeyJ');
      await expect(page.getByTestId(`species-card-${plant.speciesId}`)).toHaveAttribute('data-open', 'true');
      await page.keyboard.press('KeyJ');
      await expect(page.getByTestId('journal')).toBeHidden();
    });

    await test.step('camera: composition guides (G) and aperture (- =)', async () => {
      await page.keyboard.press('KeyC');
      const frame = page.getByTestId('vf-frame');
      await expect(frame).toHaveAttribute('data-grid', 'thirds');
      for (const mode of ['golden', 'diagonal', 'off', 'thirds']) {
        await page.keyboard.press('KeyG');
        await expect(frame).toHaveAttribute('data-grid', mode);
      }
      await expect(page.getByTestId('vf-aperture')).toContainText('f/4');
      await page.keyboard.press('Equal');
      await expect(page.getByTestId('vf-aperture')).toContainText('f/5.6');
      await page.keyboard.press('Minus');
      await page.keyboard.press('Minus');
      await expect(page.getByTestId('vf-aperture')).toContainText('f/2.8');
      await page.keyboard.press('KeyC');
      await expect(page.getByTestId('hud')).toHaveAttribute('data-tool', 'none');
    });

    await test.step('macro lens (X) toggles', async () => {
      await page.keyboard.press('KeyX');
      await expect(page.getByTestId('hud')).toHaveAttribute('data-tool', 'macro');
      await page.keyboard.press('KeyX');
      await expect(page.getByTestId('hud')).toHaveAttribute('data-tool', 'none');
    });

    await test.step('pause menu: rain and night change the world; resume', async () => {
      const day = await frameStats(page);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('pause')).toBeVisible();
      await page.getByTestId('set-weather').getByRole('button', { name: 'Light rain' }).click();
      await page.getByTestId('set-time').getByRole('button', { name: 'Night' }).click();
      await page.getByTestId('pause-resume').click();
      await expect(page.getByTestId('pause')).toBeHidden();
      await page.waitForFunction(() => window.__WO__!.runtime.weather.rain > 0.3 && window.__WO__!.runtime.time.daylight < 0.2, undefined, { timeout: 180_000 });
      const night = await frameStats(page);
      expect(night.meanLuma).toBeLessThan(day.meanLuma * 0.6);
      expect(night.distinct).toBeGreaterThan(5);
    });

    await test.step('language switch in game: HUD turns Vietnamese', async () => {
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('pause')).toBeVisible();
      await page.getByTestId('pause').getByTestId('lang-vi').click();
      await page.getByTestId('pause-resume').click();
      await expect(page.getByTestId('tracker')).toContainText('Những bước đầu vào thiên nhiên');
    });

    await test.step('save, return to menu, reset progress', async () => {
      await page.keyboard.press('Escape');
      await page.getByTestId('pause-menu').click();
      await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('menu-continue')).toBeEnabled();
      await page.getByTestId('menu-reset').click();
      await page.getByTestId('confirm-yes').click();
      await expect(page.getByTestId('menu-continue')).toBeDisabled({ timeout: 30_000 });
      expect(await page.evaluate((id) => Boolean(window.__WO__!.store.getState().discovered[id]), plantId)).toBe(false);
    });

    expect(diag.errors, diag.errors.join('\n')).toEqual([]);
    expect(diag.failedRequests, diag.failedRequests.join('\n')).toEqual([]);
  });

  test('HUD and hands: minimap, views, hand-held tools, badges and Quick View', async ({ page }) => {
    test.setTimeout(25 * 60_000);
    const diag = watch(page);
    await useLowGraphics(page, 'en');
    await openMenu(page);
    await startExpedition(page, 'biologist');
    const held = page.getByTestId('held-item');
    const minimap = page.getByTestId('minimap');
    const settings = (): Promise<Record<string, unknown>> => page.evaluate(() => JSON.parse(localStorage.getItem('wildlife-odyssey:settings') ?? '{}') as Record<string, unknown>);

    await test.step('minimap sits in the top-right corner and follows the player', async () => {
      await expect(minimap).toBeVisible();
      const box = (await minimap.boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(viewport.width - (box.x + box.width)).toBeLessThan(24);
      expect(box.y).toBeLessThan(24);
      expect(Math.abs(box.width - box.height)).toBeLessThan(1);
      await expect(minimap).toHaveAttribute('data-mode', 'rotate');
      const before = await playerPos(page);
      await expect.poll(async () => Math.abs(Number(await minimap.getAttribute('data-px')) - before.x), { timeout: 15_000 }).toBeLessThan(0.2);
      // Walk forward with the real key and watch the minimap's position follow.
      await page.keyboard.down('KeyW');
      await page.waitForFunction((b) => Math.hypot(window.__WO__!.runtime.player.pos.x - b.x, window.__WO__!.runtime.player.pos.z - b.z) > 2.5, before, { timeout: 60_000 });
      await page.keyboard.up('KeyW');
      await page.waitForTimeout(1500);
      const after = await playerPos(page);
      expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(2.5);
      await expect.poll(async () => Math.hypot(Number(await minimap.getAttribute('data-px')) - after.x, Number(await minimap.getAttribute('data-pz')) - after.z), { timeout: 15_000 }).toBeLessThan(0.3);
      // The canvas really is drawn: it is not one flat colour.
      const colours = await page.evaluate(() => {
        const c = document.querySelector<HTMLCanvasElement>('[data-testid="minimap"] canvas')!;
        const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
        const seen = new Set<number>();
        for (let i = 0; i < data.length; i += 4 * 23) seen.add((data[i]! >> 4) | ((data[i + 1]! >> 4) << 4) | ((data[i + 2]! >> 4) << 8));
        return seen.size;
      });
      expect(colours).toBeGreaterThan(8);
      // Biome and coordinates sit under it.
      await expect(page.getByTestId('hud-biome')).toContainText('Grassland');
      await expect(page.getByTestId('hud-coords')).toHaveText(/^[EW] \d+ · [NS] \d+$/);
    });

    await test.step('N cycles the three minimap zoom levels and the choice is saved', async () => {
      await expect(minimap).toHaveAttribute('data-zoom', '1');
      // The label is on screen for under two seconds, which is shorter than one round trip to a
      // software-rendered page, so record every label the minimap shows instead of polling for it.
      await page.evaluate(() => {
        const w = window as unknown as { zoomLabels: string[] };
        w.zoomLabels = [];
        new MutationObserver(() => {
          const text = document.querySelector('[data-testid="minimap-zoom"]')?.textContent;
          if (text && w.zoomLabels[w.zoomLabels.length - 1] !== text) w.zoomLabels.push(text);
        }).observe(document.querySelector('[data-testid="minimap"]')!, { childList: true, subtree: true, characterData: true });
      });
      const radii: string[] = [];
      for (const zoom of ['2', '0', '1']) {
        await page.keyboard.press('KeyN');
        await expect(minimap).toHaveAttribute('data-zoom', zoom);
        radii.push((await minimap.getAttribute('data-radius'))!);
        expect((await settings()).minimapZoom).toBe(Number(zoom));
      }
      expect(radii).toEqual(['240', '60', '120']);
      const labels = await page.evaluate(() => (window as unknown as { zoomLabels: string[] }).zoomLabels);
      expect(labels).toEqual(['Far · 240 m', 'Near · 60 m', 'Medium · 120 m']);
      // The label is shown only briefly.
      await expect(page.getByTestId('minimap-zoom')).toBeHidden({ timeout: 10_000 });
    });

    await test.step('badges: tool bar, clock, weather and an empty collection', async () => {
      await expect(page.getByTestId('toolbar')).toBeVisible();
      await expect(page.getByTestId('toolbar')).toHaveAttribute('data-active', 'none');
      await expect(page.getByTestId('hud-tool')).toContainText('Hands free');
      await expect(page.getByTestId('hud-badges').locator('[data-badge="time"]')).toHaveText(/\d\d:\d\d/);
      await expect(page.getByTestId('hud-badges').locator('[data-badge="weather"]')).not.toBeEmpty();
      await expect(page.getByTestId('hud-collection')).toHaveAttribute('data-count', '0');
      await expect(page.getByTestId('hud-collection')).toContainText('0/36');
      // The research camp counts as the first landmark found, so the collection starts with something new;
      // one look at Quick View clears the mark.
      await expect(page.getByTestId('hud-collection-dot')).toBeVisible();
      await page.keyboard.down('KeyQ');
      await expect(page.getByTestId('quick-row-landmarks')).toHaveAttribute('data-new', '1');
      await expect(page.getByTestId('quick-row-species')).toHaveAttribute('data-count', '0');
      await page.keyboard.up('KeyQ');
      await expect(page.getByTestId('quick-view')).toBeHidden();
      await expect(page.getByTestId('hud-collection-dot')).toHaveCount(0);
      await expect(page.getByTestId('hud-mission-badges')).toContainText('0/5');
      // Nothing may sit over the middle of the screen or leave the window.
      const layout = await page.evaluate(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const ids = ['toolbar', 'hud-badges', 'minimap', 'hud-biome', 'tracker', 'compass'];
        return ids.map((id) => {
          const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
          return { id, inside: r.left >= 0 && r.top >= 0 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5, coversCentre: r.left < vw / 2 && r.right > vw / 2 && r.top < vh / 2 && r.bottom > vh / 2 };
        });
      });
      for (const l of layout) expect(l, l.id).toMatchObject({ inside: true, coversCentre: false });
      const overlap = await page.evaluate(() => {
        const rect = (id: string): DOMRect => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
        const hit = (a: DOMRect, b: DOMRect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        return { toolbarBadges: hit(rect('toolbar'), rect('hud-badges')), minimapCompass: hit(rect('minimap'), rect('compass')), trackerCompass: hit(rect('tracker'), rect('compass')) };
      });
      expect(overlap).toEqual({ toolbarBadges: false, minimapCompass: false, trackerCompass: false });
    });

    await test.step('scanner (F) is held in the hand; it is on screen but never in a captured frame', async () => {
      await expect(held).toHaveAttribute('data-item', 'none');
      await page.keyboard.press('KeyF');
      await expect(held).toHaveAttribute('data-item', 'scanner');
      await page.waitForFunction(() => window.__WO__!.runtime.held.raise >= 1 && window.__WO__!.runtime.viewModel.visible, undefined, { timeout: 30_000 });
      expect(await heldItem(page)).toMatchObject({ item: 'scanner', atEye: false, viewModel: true });
      await expect(minimap).toBeVisible();
      // The frame as displayed shows the scanner's lit screen ...
      const shown = await scannerScreenPixels(page, true);
      expect(shown.hadViewModel).toBe(true);
      expect(shown.pixels).toBeGreaterThan(150);
      // ... and a captured frame of the same view does not contain a single pixel of it.
      const captured = await scannerScreenPixels(page, false);
      expect(captured.hadViewModel).toBe(false);
      expect(captured.pixels).toBe(0);
      expect(await heldItem(page)).toMatchObject({ item: 'scanner', viewModel: true });
    });

    let scanned = '';
    await test.step('a scan fills the collection badge and marks it as new', async () => {
      const plant = await page.evaluate(() => {
        const wo = window.__WO__!;
        const p = wo.runtime.player.pos;
        const trees = wo.registry.plants.filter((c) => c.radius > 1.2 && wo.heightAt(c.x, c.z) > 0.5);
        trees.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        const c = trees[0]!;
        const d = Math.hypot(c.x - p.x, c.z - p.z) || 1;
        wo.teleport(c.x + ((p.x - c.x) / d) * 9, c.z + ((p.z - c.z) / d) * 9);
        return { speciesId: c.speciesId, x: c.x, y: c.y, z: c.z };
      });
      scanned = plant.speciesId;
      const t0 = Date.now();
      while (Date.now() - t0 < 90_000) {
        await page.evaluate((c) => window.__WO__!.lookAt(c.x, c.y, c.z), plant);
        await page.waitForTimeout(600);
        if (await page.evaluate((id) => Boolean(window.__WO__!.store.getState().discovered[id]), scanned)) break;
      }
      expect(await page.evaluate((id) => Boolean(window.__WO__!.store.getState().discovered[id]), scanned)).toBe(true);
      await page.keyboard.press('KeyF');
      await expect(held).toHaveAttribute('data-item', 'none', { timeout: 15_000 });
      await expect(page.getByTestId('hud-collection')).toHaveAttribute('data-count', '1');
      await expect(page.getByTestId('hud-collection')).toContainText('1/36');
      await expect(page.getByTestId('hud-collection-dot')).toBeVisible();
    });

    await test.step('camera (C): the prop goes up to the eye, then the lens view takes over; the photo is clean', async () => {
      await page.keyboard.press('KeyC');
      await expect(held).toHaveAttribute('data-item', 'camera');
      await page.waitForFunction(() => window.__WO__!.runtime.held.atEye, undefined, { timeout: 30_000 });
      expect(await heldItem(page)).toMatchObject({ item: 'camera', atEye: true, viewModel: false });
      await expect(page.getByTestId('viewfinder')).toBeVisible();
      // Lens tools clear the corners.
      await expect(minimap).toBeHidden();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__WO__!.store.getState().photos.length === 1, undefined, { timeout: 60_000 });
      expect(await page.evaluate(() => window.__WO__!.runtime.viewModel.lastCaptureHadViewModel)).toBe(false);
      await page.keyboard.press('KeyC');
      await expect(held).toHaveAttribute('data-item', 'none', { timeout: 15_000 });
      await expect(minimap).toBeVisible();
    });

    await test.step('every tool, the map and the journal put the matching item in the hand', async () => {
      for (const [key, item] of [['KeyB', 'binoculars'], ['KeyX', 'macro'], ['KeyF', 'scanner']] as const) {
        await page.keyboard.press(key);
        await expect(held).toHaveAttribute('data-item', item, { timeout: 15_000 });
        await expect(page.getByTestId('hud')).toHaveAttribute('data-tool', item);
        await page.keyboard.press(key);
        await expect(held).toHaveAttribute('data-item', 'none', { timeout: 15_000 });
      }
      await page.keyboard.press('KeyM');
      await expect(held).toHaveAttribute('data-item', 'map', { timeout: 15_000 });
      await expect(page.getByTestId('map-panel')).toBeVisible();
      await page.keyboard.press('KeyM');
      await expect(page.getByTestId('map-panel')).toBeHidden();
      await page.keyboard.press('KeyJ');
      await expect(held).toHaveAttribute('data-item', 'journal', { timeout: 15_000 });
      await expect(page.getByTestId('journal')).toBeVisible();
      await page.keyboard.press('KeyJ');
      await expect(page.getByTestId('journal')).toBeHidden();
      await expect(held).toHaveAttribute('data-item', 'none', { timeout: 15_000 });
    });

    await test.step('Quick View: hold Q to see what was collected, keep walking, release to close', async () => {
      const quick = page.getByTestId('quick-view');
      await expect(quick).toBeHidden();
      await page.keyboard.down('KeyQ');
      await expect(quick).toBeVisible();
      // Under the minimap, on the right, clear of the middle of the screen.
      const q = (await quick.boundingBox())!;
      const m = (await minimap.boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(q.y).toBeGreaterThanOrEqual(m.y + m.height);
      expect(q.x).toBeGreaterThan(viewport.width / 2);
      expect(q.y + q.height).toBeLessThanOrEqual(viewport.height);
      // ... and nothing in it is cut off to make it fit.
      const clipped = await quick.evaluate((el) => {
        const list = el.querySelector('ul')!;
        return el.scrollHeight > el.clientHeight + 1 || list.scrollHeight > list.clientHeight + 1;
      });
      expect(clipped).toBe(false);
      // The scanned species and the new photograph are there, marked new.
      await expect(page.getByTestId('quick-row-species')).toHaveAttribute('data-count', '1');
      await expect(page.getByTestId('quick-row-species')).toHaveAttribute('data-new', '1');
      await expect(page.getByTestId('quick-species')).toHaveAttribute('data-species', scanned);
      await expect(page.getByTestId('quick-row-photos')).toHaveAttribute('data-count', '1');
      await expect(page.getByTestId('quick-photo')).toHaveCount(1);
      await expect(page.getByTestId('quick-photo').locator('img')).toBeVisible({ timeout: 20_000 });
      // Empty collections explain how to start them.
      await expect(page.getByTestId('quick-row-videos')).toHaveAttribute('data-count', '0');
      await expect(page.getByTestId('quick-row-videos')).toContainText('record');
      await expect(quick).toContainText('J: open journal');
      // The game is not paused and the player can still walk.
      const s = await page.evaluate(() => ({ overlay: window.__WO__!.store.getState().overlay, paused: window.__WO__!.runtime.paused }));
      expect(s).toEqual({ overlay: 'none', paused: false });
      const before = await playerPos(page);
      await page.keyboard.down('KeyW');
      await page.waitForFunction((b) => Math.hypot(window.__WO__!.runtime.player.pos.x - b.x, window.__WO__!.runtime.player.pos.z - b.z) > 1.5, before, { timeout: 60_000 });
      await page.keyboard.up('KeyW');
      await expect(quick).toBeVisible();
      await page.keyboard.up('KeyQ');
      await expect(quick).toBeHidden();
      // Looking at it clears the "new" mark.
      await expect(page.getByTestId('hud-collection-dot')).toHaveCount(0);
      // Not offered through a lens.
      await page.keyboard.press('KeyB');
      await page.keyboard.down('KeyQ');
      await page.waitForTimeout(800);
      await expect(quick).toBeHidden();
      await page.keyboard.up('KeyQ');
      await page.keyboard.press('KeyB');
      await expect(held).toHaveAttribute('data-item', 'none', { timeout: 15_000 });
    });

    await test.step('V switches to the shoulder camera; a lens tool borrows first person and gives the view back', async () => {
      const boom = (): Promise<{ third: number; back: number }> =>
        page.evaluate(() => {
          const wo = window.__WO__!;
          const p = wo.runtime.player.pos;
          const c = wo.runtime.camera.pos;
          return { third: wo.runtime.camera.third, back: Math.hypot(c.x - p.x, c.z - p.z) };
        });
      expect((await boom()).third).toBe(0);
      await page.keyboard.press('KeyV');
      await expect(page.getByTestId('hud')).toHaveAttribute('data-view', 'third');
      expect((await settings()).viewMode).toBe('third');
      await page.waitForFunction(() => window.__WO__!.runtime.camera.third >= 1, undefined, { timeout: 30_000 });
      await page.waitForFunction(
        () => {
          const wo = window.__WO__!;
          return Math.hypot(wo.runtime.camera.pos.x - wo.runtime.player.pos.x, wo.runtime.camera.pos.z - wo.runtime.player.pos.z) > 1.5;
        },
        undefined,
        { timeout: 30_000 },
      );
      // The camera never ends up under the ground.
      const clear = await page.evaluate(() => {
        const wo = window.__WO__!;
        const c = wo.runtime.camera.pos;
        return c.y - wo.heightAt(c.x, c.z);
      });
      expect(clear).toBeGreaterThan(0.3);
      // The scanner works in third person and is carried by the avatar, not drawn as a view model.
      await page.keyboard.press('KeyF');
      await expect(held).toHaveAttribute('data-item', 'scanner', { timeout: 15_000 });
      await page.waitForFunction(() => window.__WO__!.runtime.held.raise >= 1, undefined, { timeout: 30_000 });
      expect(await heldItem(page)).toMatchObject({ item: 'scanner', viewModel: false });
      expect((await boom()).third).toBe(1);
      await page.keyboard.press('KeyF');
      // Binoculars are looked through: first person while they are up ...
      await page.keyboard.press('KeyB');
      await page.waitForFunction(() => window.__WO__!.runtime.camera.third <= 0, undefined, { timeout: 30_000 });
      expect((await boom()).back).toBeLessThan(0.2);
      expect(await page.evaluate(() => window.__WO__!.store.getState().viewMode)).toBe('third');
      // ... and the shoulder view comes back when they are put away.
      await page.keyboard.press('KeyB');
      await page.waitForFunction(() => window.__WO__!.runtime.camera.third >= 1, undefined, { timeout: 30_000 });
      const frame = await frameStats(page);
      expect(frame.distinct).toBeGreaterThan(40);
      await page.keyboard.press('KeyV');
      await expect(page.getByTestId('hud')).toHaveAttribute('data-view', 'first');
      expect((await settings()).viewMode).toBe('first');
      await page.waitForFunction(() => window.__WO__!.runtime.camera.third <= 0, undefined, { timeout: 30_000 });
    });

    await test.step('settings: minimap, orientation, size and hand-held items can be changed in game', async () => {
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('pause')).toBeVisible();
      await page.getByTestId('set-minimap-mode').getByRole('button', { name: 'North up' }).click();
      await page.getByTestId('set-minimap-size').getByRole('button', { name: 'Large' }).click();
      await page.getByTestId('set-held').getByRole('button', { name: 'Off' }).click();
      expect(await settings()).toMatchObject({ minimapMode: 'north', minimapSize: 'large', heldItems: false });
      await page.getByTestId('pause-resume').click();
      await expect(page.getByTestId('pause')).toBeHidden();
      await expect(minimap).toHaveAttribute('data-mode', 'north');
      expect(Math.round((await minimap.boundingBox())!.width)).toBe(196);
      await page.keyboard.press('KeyF');
      await page.waitForTimeout(2500);
      expect(await heldItem(page)).toMatchObject({ item: 'none', viewModel: false });
      await page.keyboard.press('KeyF');
      // The minimap can be switched off altogether.
      await page.evaluate(() => window.__WO__!.store.getState().setSetting('minimap', false));
      await expect(minimap).toBeHidden();
    });

    expect(diag.errors, diag.errors.join('\n')).toEqual([]);
    expect(diag.failedRequests, diag.failedRequests.join('\n')).toEqual([]);
  });
});
