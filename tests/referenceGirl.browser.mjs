// Explicit native-Chrome integration check (Node 22+). No automation packages.
// Run: node tests/referenceGirl.browser.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const projectFile = process.argv[2] ?? 'reference-girl-v5-hand-turns.json';
const server = await createServer({ root, logLevel: 'silent', server: { host: '127.0.0.1', port: 0, open: false } });
let browser, socket, profile, sequence = 0;
const pending = new Map();
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  profile = await mkdtemp(join(root, '.mcp-browser-'));
  browser = spawn(process.env.CHARACTER_STUDIO_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--password-store=basic', '--use-mock-keychain', '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let log = ''; const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 20000);
    browser.once('error', error => { clearTimeout(timeout); reject(error); });
    browser.stderr.on('data', chunk => { log += chunk; const match = log.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => { const message = JSON.parse(String(event.data)), entry = pending.get(message.id); if (entry) { clearTimeout(entry.timer); pending.delete(message.id); message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result); } });
  const request = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const target = await request('Target.createTarget', { url: origin });
  const { sessionId } = await request('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  await request('Runtime.enable', {}, sessionId);
  await request('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  const evaluate = async expression => { const result = await request('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result?.value; };
  for (let i = 0; i < 100; i++) { if (await evaluate(`location.origin === '${origin}' && !!document.getElementById('dynamics-tab')`)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  const checks = await evaluate(`(${async function (projectFile) {
    const { Rig } = await import('/src/engine/Rig.ts');
    const { renderCompositedCanvas } = await import('/src/engine/compositor.ts');
    const { projectToSVG } = await import('/src/engine/export.ts');
    const { useProject } = await import('/src/state/projectStore.ts');
    const { getHandRigs, handTurnAngle } = await import('/src/engine/handRig.ts');
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c.getContext('2d'); };
    const draw = async (rig, svg) => {
      const ctx = canvas(rig.canvas.width, rig.canvas.height); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      if (!svg) renderCompositedCanvas(ctx, rig);
      else {
        const url = URL.createObjectURL(new Blob([projectToSVG(rig)], { type: 'image/svg+xml' }));
        try { const image = new Image(); image.src = url; await image.decode(); ctx.drawImage(image, 0, 0); } finally { URL.revokeObjectURL(url); }
      }
      return ctx;
    };
    const pixel = (ctx, x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    const near = (a, b, tolerance = 3) => a.every((value, i) => Math.abs(value - b[i]) <= tolerance);
    const mask = new Rig(); mask.canvas = { width: 140, height: 120, background: '#fff' };
    const arm = mask.addVectorLayer('Arm', [{ id: 'arm', kind: 'rect', x: 20, y: 20, width: 50, height: 60, fill: '#f5ded0', stroke: '#123456', strokeWidth: 4 }]);
    const hand = mask.addVectorLayer('Hand', [{ id: 'hand', kind: 'rect', x: 15, y: 70, width: 60, height: 35, fill: '#f5ded0', stroke: '#3f00aa', strokeWidth: 2 }]);
    for (const [id, order] of [[arm, 1], [hand, 0]]) Object.assign(mask.layers.get(id), { local: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, zIndex: order });
    mask.layers.get(hand).patch = { enabled: true, targetIds: [arm], hideEdges: true, preserveOutline: true, seamWidth: 0 }; mask.update();
    const results = [];
    for (const svg of [false, true]) {
      const ctx = await draw(mask, svg), seam = pixel(ctx, 50, 80), outline = pixel(ctx, 15, 90);
      assert(near(seam, [245, 222, 208]), `Joint seam survived in ${svg ? 'SVG' : 'Canvas'}: ${seam}`);
      assert(near(outline, [63, 0, 170]), `Hand outline lost in ${svg ? 'SVG' : 'Canvas'}: ${outline}`);
      results.push({ renderer: svg ? 'SVG' : 'Canvas', seam, outline });
    }
    const mesh = new Rig(); mesh.canvas = { width: 140, height: 140, background: '#fff' };
    const id = mesh.addVectorLayer('Opaque cloth', [{ id: 'fabric', kind: 'rect', x: 20, y: 20, width: 80, height: 80, fill: '#d08070' }]);
    mesh.layers.get(id).local = { x: .3, y: .2, rotation: 0, scaleX: 1, scaleY: 1 }; mesh.createMesh(id, 3, 3);
    mesh.layers.get(id).mesh.vertices[5].x += 4; mesh.layers.get(id).mesh.vertices[5].y -= 5; mesh.update();
    for (const svg of [false, true]) {
      const ctx = await draw(mesh, svg); let cracks = 0;
      for (let y = 27; y < 94; y++) for (let x = 27; x < 94; x++) if (!near(pixel(ctx, x, y), [208, 128, 112], 7)) cracks++;
      assert(cracks === 0, `Visible mesh cracks in ${svg ? 'SVG' : 'Canvas'}: ${cracks}`);
      results.push({ renderer: svg ? 'SVG mesh' : 'Canvas mesh', interiorCrackPixels: cracks });
    }
    const response = await fetch('/' + projectFile); assert(response.ok, 'Exported character JSON is missing');
    useProject.getState().deserialize(await response.text(), false); useProject.getState().setFrame(24);
    const rig = useProject.getState().rig;
    assert(rig.dynamics.enabled && Object.keys(rig.physicsFrame.boneOffsets).length === 2, 'Saved chest physics did not reopen');
    assert(Object.keys(rig.physicsFrame.meshes).length === 1, 'Saved cloth physics did not reopen');
    document.getElementById('dynamics-tab').click();
    for (let i = 0; i < 100 && !document.querySelector('[aria-label="Bone dynamics preset"]'); i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert(document.querySelector('[aria-label="Bone dynamics preset"] option[value="jiggle"]'), 'Jiggle preset missing from editor');
    const rows = [...document.querySelectorAll('.dynamics-section .constraint-row')];
    rows.find(row => row.textContent.includes('Coral floral')).click();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert(document.querySelector('[aria-label="Adapt cloth rest shape to pose"]').checked, 'Cloth controls did not load');
    rows.find(row => row.textContent.includes('Chest · left')).click();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert(document.querySelector('[aria-label="Maximum jiggle travel (px)"]').value === '4', 'Jiggle travel control did not load');
    const hands = getHandRigs(rig);
    if (hands.length) {
      document.getElementById('rig-tab').click();
      await new Promise(resolve => setTimeout(resolve, 100));
      const panel = document.querySelector('[aria-label="Hands and fingers"]'); assert(panel, 'Hand controls missing');
      const handSelect = panel.querySelector('[aria-label="Hand rig"]');
      assert(handSelect.options.length === 2, 'Both hands must be selectable');
      const clickPose = async name => { [...panel.querySelectorAll('button')].find(button => button.textContent === name).click(); await new Promise(resolve => setTimeout(resolve, 100)); };
      for (const hand of hands) {
        handSelect.value = hand.id; handSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 100));
        const other = hands.find(h => h.id !== hand.id);
        const otherTips = JSON.stringify(other.fingers.map(f => rig.getBoneEnd(f.boneIds.at(-1))));
        await clickPose('Open');
        const open = hand.fingers.map(f => rig.getBoneEnd(f.boneIds.at(-1)));
        await clickPose('Grip');
        assert(hand.fingers.every((f, i) => { const p = rig.getBoneEnd(f.boneIds.at(-1)); return Math.hypot(p.x - open[i].x, p.y - open[i].y) > .1; }), 'Grip did not articulate every digit');
        assert(JSON.stringify(other.fingers.map(f => rig.getBoneEnd(f.boneIds.at(-1)))) === otherTips, 'Hand preset moved the opposite hand');
        const clip = rig.animations.find(c => c.id === rig.timeline.activeAnimationId);
        assert(hand.fingers.every(f => f.boneIds.every(id => clip.tracks.find(t => t.targetId === id).keyframes.some(k => k.frame === 24))), 'Finger controls failed to auto-key');
        await clickPose('Reference');
        if (hand.turn) {
          const wrist = JSON.stringify(rig.bones.get(hand.wristBoneId).world);
          const otherTurn = handTurnAngle(rig, other);
          const turnInput = panel.querySelector('[aria-label="Wrist turn degrees"]');
          assert(turnInput && panel.querySelector('[aria-label="Wrist turn"]'), 'Wrist turn inputs missing');
          for (const [label, degrees] of [['Back', 0], ['Edge', 90], ['Palm', 180], ['Edge', 270], ['Back', 360]]) {
            panel.querySelector('[aria-label="' + label + ' at ' + degrees + ' degrees"]').click();
            await new Promise(resolve => setTimeout(resolve, 80));
            assert(Math.abs(handTurnAngle(rig, hand) - degrees) < 1e-6, 'Wrist turn preset failed');
            assert(JSON.stringify(rig.bones.get(hand.wristBoneId).world) === wrist, 'Wrist turn moved the arm');
            assert(handTurnAngle(rig, other) === otherTurn, 'Wrist turn moved the opposite hand');
            assert(Number(turnInput.value) === degrees, 'Turn number did not follow preset');
          }
          const track = clip.tracks.find(t => t.targetId === hand.turn.driverBoneId);
          assert(track.keyframes.some(k => k.frame === 24 && Math.abs(k.value.rotation - Math.PI * 2) < 1e-6), 'Roll did not auto-key a full revolution');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(turnInput, '135'); turnInput.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(resolve => setTimeout(resolve, 100));
          assert(Math.abs(handTurnAngle(rig, hand) - 135) < 1e-6, 'Turn number input failed');
          await clickPose('Grip');
          assert(Math.abs(handTurnAngle(rig, hand) - 135) < 1e-6, 'Finger pose overwrote wrist turn');
          // Both renderer paths must actually produce different pixels for a roll.
          for (const svg of [false, true]) {
            const turned = (await draw(rig, svg)).canvas.toDataURL();
            panel.querySelector('[aria-label="Back at 0 degrees"]').click();
            await new Promise(resolve => setTimeout(resolve, 80));
            const back = (await draw(rig, svg)).canvas.toDataURL();
            assert(turned !== back, 'Hand roll was invisible in ' + (svg ? 'SVG' : 'Canvas'));
            panel.querySelector('[aria-label="Palm at 180 degrees"]').click();
            await new Promise(resolve => setTimeout(resolve, 80));
          }
          await clickPose('Reference');
          panel.querySelector('[aria-label="Back at 0 degrees"]').click();
          await new Promise(resolve => setTimeout(resolve, 80));
        }
      }
    }
    return { pixels: results, bones: rig.bones.size, hands: hands.length, rollDials: hands.filter(h => h.turn).length, fingerBones: hands.flatMap(h => h.fingers.flatMap(f => f.boneIds)).length, physics: 'enabled', activeClip: rig.animations.find(clip => clip.id === rig.timeline.activeAnimationId).name, controls: 'physics, finger poses, independent wrist turns, and auto-key verified' };
  }.toString()})(${JSON.stringify(projectFile)})`);
  assert.equal(checks.bones, projectFile.includes('v5') ? 50 : projectFile.includes('v4') ? 48 : 20);
  if (/v[45]/.test(projectFile)) { assert.equal(checks.hands, 2); assert.equal(checks.fingerBones, 28); }
  if (projectFile.includes('v5')) assert.equal(checks.rollDials, 2);
  const screenshot = await request('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
  await writeFile(join(root, projectFile.includes('v5') ? 'reference-girl-v5-browser.png' : projectFile.includes('v4') ? 'reference-girl-v4-browser.png' : 'reference-girl-v3-browser.png'), Buffer.from(screenshot.data, 'base64'));
  console.log(JSON.stringify(checks, null, 2));
} finally {
  for (const entry of pending.values()) clearTimeout(entry.timer);
  socket?.close();
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    const exited = new Promise(resolve => browser.once('exit', resolve)); browser.kill('SIGTERM');
    const timer = setTimeout(() => browser.kill('SIGKILL'), 5000); await exited; clearTimeout(timer);
  }
  await server.close(); if (profile) await rm(profile, { recursive: true, force: true });
}
