import { launch, check, note, section, finish } from './lib.mjs';
const g = await launch();
const { page, ev, pos, face, tp, wait } = g;
await g.startGame('archaeologist');
await tp(-320, 312); await face(0, -1);
await page.keyboard.down('KeyW');
const trace = [];
for (let i = 0; i < 14; i++) { await wait(900); const p = await pos(); const h = await ev(() => { const w = window.__WO__; const p = w.runtime.player.pos; return w.heightAt(p.x, p.z); }); trace.push(`${p.z.toFixed(1)}/${(p.y - h).toFixed(2)}${p.grounded ? '' : '*'}`); }
await page.keyboard.up('KeyW');
note('z / height above terrain while walking north onto the platform: ' + trace.join(' '));
const p = await pos();
check('ruins: player can walk onto the platform and reach the inner wall', p.z < 297, `ended z=${p.z.toFixed(2)}`);
check('ruins: inner wall stops the player', p.z > 293.4, `ended z=${p.z.toFixed(2)}`);
const prompt = await g.exists('prompt');
note('prompt visible near stele/wall: ' + prompt + ' text=' + (await g.text('prompt')));
// what about teleport onto the platform
await tp(-316, 300); await face(1, 0); const a = await pos(); await page.keyboard.down('KeyW'); await wait(5000); await page.keyboard.up('KeyW'); const b = await pos();
check('ruins: a player placed on the platform is not stuck', Math.hypot(b.x - a.x, b.z - a.z) > 2, `moved ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(2)} m, y-terrain=${(b.y - (await ev(() => { const w = window.__WO__; const p = w.runtime.player.pos; return w.heightAt(p.x, p.z); }))).toFixed(2)}`);
finish('ruins', g.diag);
await g.browser.close();
