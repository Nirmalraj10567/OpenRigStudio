import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

/** Minimal stdio client for repeatable calls to this project's actual MCP server. */
export async function connectStudioMcp(workspace = fileURLToPath(new URL('..', import.meta.url))) {
  if (process.env.CHARACTER_STUDIO_MCP_URL) return connectStudioMcpHttp(process.env.CHARACTER_STUDIO_MCP_URL);
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

/** Streamable-HTTP client for the built-in HTTP/HTTPS MCP transport. */
export async function connectStudioMcpHttp(url = process.env.CHARACTER_STUDIO_MCP_URL, options = {}) {
  if (!url) throw new Error('An MCP URL is required');
  const endpoint = new URL(url).href;
  const token = options.token ?? process.env.CHARACTER_STUDIO_MCP_TOKEN ?? process.env.CHARACTER_STUDIO_MCP_AUTH_TOKEN;
  const timeoutMs = options.timeoutMs ?? 300000;
  let sessionId = '';
  let nextId = 0;
  const request = async (method, params = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-06-18' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (sessionId) headers['Mcp-Session-Id'] = sessionId;
      const id = ++nextId;
      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: controller.signal });
      const returnedSession = response.headers.get('mcp-session-id');
      if (returnedSession) sessionId = returnedSession;
      const text = await response.text();
      let payload = null;
      if (text) { try { payload = JSON.parse(text); } catch { throw new Error(`MCP HTTP returned invalid JSON (${response.status})`); } }
      if (!response.ok) throw new Error(payload?.error?.message || `MCP HTTP request failed (${response.status})`);
      return payload;
    } finally { clearTimeout(timer); }
  };
  const initialized = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'character-studio-http-client', version: '1.0.0' } });
  if (initialized?.error) throw new Error(initialized.error.message);
  const notifyHeaders = { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-06-18' };
  if (token) notifyHeaders.Authorization = `Bearer ${token}`;
  if (sessionId) notifyHeaders['Mcp-Session-Id'] = sessionId;
  await fetch(endpoint, { method: 'POST', headers: notifyHeaders, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  const close = async () => {
    if (!sessionId) return;
    const headers = token ? { Authorization: `Bearer ${token}`, 'Mcp-Session-Id': sessionId } : { 'Mcp-Session-Id': sessionId };
    await fetch(endpoint, { method: 'DELETE', headers }).catch(() => {});
    sessionId = '';
  };
  return { request, close, get sessionId() { return sessionId; }, endpoint };
}
