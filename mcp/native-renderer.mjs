import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// MCP invokes the project's own browser exports through Chrome's built-in
// debugging protocol. No animation is authored here and no browser-automation
// package is needed. Chrome provides Canvas, image decoding and WebCodecs.
export async function nativeRender(project, options) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const candidates = [process.env.CHARACTER_STUDIO_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  let executable;
  for (const path of candidates) { try { await access(path); executable = path; break; } catch {} }
  if (!executable) throw new Error('Set CHARACTER_STUDIO_CHROME_PATH to an installed Chrome/Chromium executable for native Canvas/WebCodecs export');
  if (typeof WebSocket === 'undefined') throw new Error('Native render tools require Node 22 or later');
  const { createServer } = await import('vite');
  const server = await createServer({ root, logLevel: 'silent', server: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
  let browser, socket, profile;
  const pending = new Map();
  try {
    process.stderr.write(`[native-render] Starting ${options.kind} export with Character Studio\n`);
    await server.listen();
    const address = server.httpServer.address();
    profile = await mkdtemp(join(root, '.mcp-browser-'));
    browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--password-store=basic', '--use-mock-keychain', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--disable-default-apps', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((resolve, reject) => {
      let log = '';
      const timer = setTimeout(() => reject(new Error(`Chrome startup timed out: ${log.slice(-500)}`)), 20000);
      browser.once('error', error => { clearTimeout(timer); reject(error); });
      browser.once('exit', code => { clearTimeout(timer); reject(new Error(`Chrome exited (${code}): ${log.slice(-500)}`)); });
      browser.stderr.on('data', chunk => {
        log = (log + chunk).slice(-4096);
        const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('Chrome connection failed')), { once: true }); });
    let sequence = 0;
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data)), entry = pending.get(message.id);
      if (entry) { clearTimeout(entry.timer); pending.delete(message.id); if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result); }
    });
    socket.addEventListener('close', () => {
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Chrome disconnected during export')); }
      pending.clear();
    });
    const request = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`Native export timeout: ${method}`)); }, 240000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const target = await request('Target.createTarget', { url: `http://127.0.0.1:${address.port}/` });
    const { sessionId } = await request('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    await request('Runtime.enable', {}, sessionId);
    // Wait for the target origin to be ready before importing the native engine.
    let loaded = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const status = await request('Runtime.evaluate', { expression: 'location.origin + "|" + document.readyState', returnByValue: true }, sessionId);
      if (status.result?.value?.startsWith(`http://127.0.0.1:${address.port}|`) && status.result.value.endsWith('complete')) { loaded = true; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!loaded) throw new Error('Character Studio did not load for export');
    process.stderr.write('[native-render] Native engine ready\n');
    await request('Runtime.evaluate', { expression: `globalThis.__mcpProject = ${JSON.stringify(project)}; true`, returnByValue: true }, sessionId);
    const expression = `(async () => {
      const options = ${JSON.stringify(options)};
      let blob, metadata;
      if (options.kind === 'frame') {
        const { Rig } = await import('/src/engine/Rig.ts');
        const { exportPNG } = await import('/src/engine/export.ts');
        const rig = new Rig(globalThis.__mcpProject);
        if (rig.timeline.activeAnimationId) rig.applyAnimation(rig.timeline.activeAnimationId, options.frame);
        else { rig.setTimeline({ currentFrame: options.frame }); rig.update(); }
        blob = await exportPNG(rig);
        metadata = { frame: options.frame, width: rig.canvas.width, height: rig.canvas.height, format: 'png' };
      } else if (options.kind === 'timeline') {
        const { Rig } = await import('/src/engine/Rig.ts');
        const { projectToSVG } = await import('/src/engine/export.ts');
        const rig = new Rig(globalThis.__mcpProject);
        const frames = options.frames;
        const columns = options.columns;
        const cellWidth = options.cellWidth;
        const cellHeight = Math.round(cellWidth * rig.canvas.height / rig.canvas.width);
        const labelHeight = 30;
        const canvas = document.createElement('canvas');
        canvas.width = columns * cellWidth; canvas.height = Math.ceil(frames.length / columns) * (cellHeight + labelHeight);
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Timeline preview canvas is unavailable');
        ctx.fillStyle = '#101820'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = '600 14px Arial, sans-serif'; ctx.textBaseline = 'middle';
        for (let index = 0; index < frames.length; index++) {
          const frame = frames[index];
          if (rig.timeline.activeAnimationId) rig.applyAnimation(rig.timeline.activeAnimationId, frame);
          else { rig.setTimeline({ currentFrame: frame }); rig.update(); }
          const url = URL.createObjectURL(new Blob([projectToSVG(rig)], { type: 'image/svg+xml' }));
          try {
            const image = new Image(); image.src = url; await image.decode();
            const column = index % columns, row = Math.floor(index / columns), x = column * cellWidth, y = row * (cellHeight + labelHeight);
            ctx.drawImage(image, x, y, cellWidth, cellHeight);
            ctx.fillStyle = '#101820'; ctx.fillRect(x, y + cellHeight, cellWidth, labelHeight);
            ctx.fillStyle = '#f2f7f5'; ctx.fillText('Frame ' + frame + ' · ' + (frame / rig.timeline.fps).toFixed(2) + 's', x + 10, y + cellHeight + labelHeight / 2);
          } finally { URL.revokeObjectURL(url); }
        }
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Could not encode timeline preview PNG');
        metadata = { frames, columns, width: canvas.width, height: canvas.height, format: 'png' };
      } else {
        const { renderProjectVideo } = await import('/src/engine/videoExport.ts');
        const result = await renderProjectVideo(globalThis.__mcpProject, { format: options.format, includeAudio: true });
        blob = result.blob;
        metadata = { ...result.plan, format: result.format, videoCodec: result.videoCodec, audioCodec: result.audioCodec };
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return { metadata, data: btoa(binary), size: bytes.length };
    })()`;
    const result = await request('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    if (!result.result?.value?.data) throw new Error('Native renderer produced no output');
    process.stderr.write(`[native-render] Exported ${result.result.value.size} bytes\n`);
    return result.result.value;
  } finally {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    socket?.close();
    if (browser && browser.exitCode === null && browser.signalCode === null) {
      const exited = new Promise(resolve => browser.once('exit', resolve));
      browser.kill('SIGTERM');
      const killTimer = setTimeout(() => browser.kill('SIGKILL'), 5000);
      await exited; clearTimeout(killTimer);
    }
    await server.close();
    if (profile) await rm(profile, { recursive: true, force: true });
  }
}
