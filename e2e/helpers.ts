import { expect, type Page } from '@playwright/test';

/** Problems collected from the browser while a test runs. */
export interface Diagnostics {
  errors: string[];
  failedRequests: string[];
}

export function watch(page: Page): Diagnostics {
  const d: Diagnostics = { errors: [], failedRequests: [] };
  page.on('pageerror', (e) => d.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') d.errors.push(`console.error: ${m.text()}`);
  });
  page.on('requestfailed', (r) => d.failedRequests.push(`${r.url()} (${r.failure()?.errorText ?? 'failed'})`));
  page.on('response', (r) => {
    if (r.status() >= 400) d.failedRequests.push(`${r.url()} (HTTP ${r.status()})`);
  });
  return d;
}

/** Low graphics preset so the suite is usable with software WebGL. */
export async function useLowGraphics(page: Page, language: 'en' | 'vi' = 'en'): Promise<void> {
  await page.addInitScript((lang) => {
    if (localStorage.getItem('wildlife-odyssey:settings')) return;
    localStorage.setItem(
      'wildlife-odyssey:settings',
      JSON.stringify({ language: lang, quality: 'low', renderScale: 0.5, shadows: 'off', vegetation: 0.4, drawDistance: 'low', adaptive: false, dayMinutes: 0, master: 0 }),
    );
  }, language);
}

export async function openMenu(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 120_000 });
}

export async function startExpedition(page: Page, role: 'biologist' | 'archaeologist' = 'biologist'): Promise<void> {
  await page.getByTestId('menu-new').click();
  const confirm = page.getByTestId('confirm-yes');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.getByTestId(`role-${role}`).click();
  await page.getByTestId('role-begin').click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 60_000 });
  // Let the first frames of the world render.
  await page.waitForFunction(() => window.__WO__ !== undefined && window.__WO__.runtime.perf.triangles > 1000, undefined, { timeout: 60_000 });
}

export interface Vec {
  x: number;
  y: number;
  z: number;
}

export const playerPos = (page: Page): Promise<Vec> =>
  page.evaluate(() => {
    const p = window.__WO__!.runtime.player.pos;
    return { x: p.x, y: p.y, z: p.z };
  });

/**
 * Test-harness positioning: places the player `distance` metres from the
 * nearest animal of a species (on land, with a clear line of sight if one can
 * be found) and points the camera at it. All game actions are then performed
 * with real key presses.
 */
export async function standNear(page: Page, speciesId: string, distance: number): Promise<{ id: string; behavior: string }> {
  const result = await page.evaluate(
    ({ speciesId, distance }) => {
      const wo = window.__WO__!;
      const agents = wo.registry.wildlife!.agents.filter((a) => a.speciesId === speciesId);
      const p = wo.runtime.player.pos;
      agents.sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p));
      const a = agents[0]!;
      // Try eight bearings and keep the first that is dry land.
      let best: [number, number] = [a.position.x + distance, a.position.z];
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
      return { id: a.id, behavior: a.currentBehavior };
    },
    { speciesId, distance },
  );
  await page.waitForTimeout(1200);
  await aimAtAgent(page, result.id);
  return result;
}

/** Points the camera at an animal's body centre (re-aim after it moves). */
export async function aimAtAgent(page: Page, agentId: string): Promise<void> {
  await page.evaluate((id) => {
    const wo = window.__WO__!;
    const a = wo.registry.wildlife!.get(id)!;
    wo.lookAt(a.position.x, a.position.y + a.rigDef.centerY, a.position.z);
  }, agentId);
  await page.waitForTimeout(600);
}

/** Keeps re-aiming until the reticle reports the expected species. */
export async function lockOn(page: Page, agentId: string, speciesId: string, timeout = 40_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    await aimAtAgent(page, agentId);
    const target = await page.evaluate(() => window.__WO__!.runtime.target?.speciesId ?? null);
    if (target === speciesId) return;
    if (Date.now() - start > timeout) throw new Error(`Could not lock on to ${speciesId}; reticle reports ${String(target)}`);
  }
}

/** Captures the rendered frame through the game's own capture path and summarises it. */
export async function frameStats(page: Page): Promise<{ width: number; height: number; distinct: number; meanLuma: number; lumaSpread: number }> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const rt = window.__WO__!.runtime;
        rt.capture = {
          width: 0,
          height: 0,
          reject,
          resolve: (canvas: HTMLCanvasElement) => {
            const ctx = canvas.getContext('2d')!;
            const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const seen = new Set<number>();
            let sum = 0;
            let lo = 255;
            let hi = 0;
            let n = 0;
            for (let i = 0; i < data.length; i += 4 * 37) {
              const l = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
              seen.add((data[i]! >> 3) | ((data[i + 1]! >> 3) << 5) | ((data[i + 2]! >> 3) << 10));
              sum += l;
              lo = Math.min(lo, l);
              hi = Math.max(hi, l);
              n++;
            }
            resolve({ width: canvas.width, height: canvas.height, distinct: seen.size, meanLuma: sum / n, lumaSpread: hi - lo });
          },
        };
      }),
  );
}

/**
 * Captures a frame through the game's capture path and counts pixels in the colour of the
 * hand-held scanner's lit screen (an unlit, saturated cyan that nothing in the world uses).
 * `raw` asks for the frame exactly as displayed, hand-held items included (a debug option;
 * photographs never use it).
 */
export async function scannerScreenPixels(page: Page, raw: boolean): Promise<{ pixels: number; hadViewModel: boolean; width: number; height: number }> {
  return page.evaluate(
    (raw) =>
      new Promise((resolve, reject) => {
        const rt = window.__WO__!.runtime;
        rt.capture = {
          width: 0,
          height: 0,
          raw,
          reject,
          resolve: (canvas: HTMLCanvasElement) => {
            const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
            let pixels = 0;
            for (let i = 0; i < data.length; i += 4) {
              if (data[i]! < 95 && data[i + 1]! > 228 && data[i + 2]! > 185) pixels++;
            }
            resolve({ pixels, hadViewModel: rt.viewModel.lastCaptureHadViewModel, width: canvas.width, height: canvas.height });
          },
        };
      }),
    raw,
  );
}

/** What the researcher is holding, as the HUD reports it. */
export async function heldItem(page: Page): Promise<{ item: string; raise: number; atEye: boolean; viewModel: boolean }> {
  return page.evaluate(() => {
    const wo = window.__WO__!;
    return { item: wo.runtime.held.item ?? 'none', raise: wo.runtime.held.raise, atEye: wo.runtime.held.atEye, viewModel: wo.runtime.viewModel.visible };
  });
}
