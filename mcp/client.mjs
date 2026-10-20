import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

/** Minimal stdio client for repeatable calls to this project's actual MCP server. */
export async function connectStudioMcp(workspace = fileURLToPath(new URL('..', import.meta.url))) {
  const entry = process.env.CHARACTER_STUDIO_MCP_ENTRY || fileURLToPath(new URL('./character-studio-mcp.mjs', import.meta.url));
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, CHARACTER_STUDIO_WORKSPACE: workspace }, stdio: ['pipe', 'pipe', 'inherit'],
  });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map(); let nextId = 0;
  function rejectAll(error) {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    pending.clear();
  }
  child.on('error', rejectAll);
  child.on('exit', code => rejectAll(new Error(`MCP server exited (${code})`)));
  lines.on('line', line => {
    try {
      const response = JSON.parse(line), entry = pending.get(response.id);
      if (entry) { clearTimeout(entry.timer); pending.delete(response.id); entry.resolve(response); }
    } catch (error) { rejectAll(error); }
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP request timeout: ${method}`)); }, 300000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const close = async () => {
    lines.close(); rejectAll(new Error('MCP client closed'));
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.stdin.end(); await exited;
  };
  try {
    const initialized = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'character-studio-cli', version: '1.0.0' } });
    if (initialized.error) throw new Error(initialized.error.message);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    return { request, close };
  } catch (error) { await close(); throw error; }
}
