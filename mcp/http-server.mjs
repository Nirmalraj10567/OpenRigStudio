#!/usr/bin/env node
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createMcpRuntime } from './server-core.mjs';

const DEFAULT_PORT = 8787;
const DEFAULT_PATH = '/mcp';
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function log(message) { process.stderr.write(`[character-studio-mcp-http] ${message}\n`); }
function bool(value, fallback = false) { return value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase()); }
function isLoopback(host) { return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host); }
function tokenMatches(expected, received) {
  if (!expected || typeof received !== 'string') return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseAuthorization(request) {
  const value = request.headers.authorization;
  if (typeof value !== 'string') return '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? '';
}

function requestOriginAllowed(request, allowedOrigin) {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigin) return true;
  if (allowedOrigin === '*') return true;
  return allowedOrigin.split(',').map(value => value.trim()).filter(Boolean).includes(origin);
}

function applyCors(request, response, allowedOrigin) {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigin) return;
  response.setHeader('Access-Control-Allow-Origin', allowedOrigin === '*' ? '*' : origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version');
}

function sendJson(request, response, status, payload, allowedOrigin, extraHeaders = {}) {
  applyCors(request, response, allowedOrigin);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  response.end(payload === undefined ? '' : JSON.stringify(payload));
}

function sendText(request, response, status, text, allowedOrigin, extraHeaders = {}) {
  applyCors(request, response, allowedOrigin);
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...extraHeaders });
  response.end(text);
}

async function readBody(request, maxBytes = MAX_BODY_BYTES) {
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) throw Object.assign(new Error('Request body is too large'), { statusCode: 413 });
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Request body is too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sessionIdFrom(request, url) {
  return request.headers['mcp-session-id'] || url.searchParams.get('sessionId') || '';
}

export async function createMcpHttpServer(options = {}) {
  const runtime = options.runtime || await createMcpRuntime({
    workspaceRoot: options.workspaceRoot,
    pluginDirectory: options.pluginDirectory,
    includeDesignTools: options.includeDesignTools !== false,
    serverName: options.serverName || 'character-studio-mcp-http',
    version: options.version,
  });
  const host = options.host || process.env.CHARACTER_STUDIO_MCP_HOST || '127.0.0.1';
  const configuredPort = Number(options.port ?? process.env.CHARACTER_STUDIO_MCP_PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(configuredPort) || configuredPort < 0 || configuredPort > 65535) throw new Error('CHARACTER_STUDIO_MCP_PORT must be an integer from 0 to 65535');
  const endpointPath = options.path || process.env.CHARACTER_STUDIO_MCP_PATH || DEFAULT_PATH;
  if (!endpointPath.startsWith('/')) throw new Error('CHARACTER_STUDIO_MCP_PATH must start with /');
  const authToken = options.authToken ?? process.env.CHARACTER_STUDIO_MCP_AUTH_TOKEN ?? '';
  const corsOrigin = options.corsOrigin ?? process.env.CHARACTER_STUDIO_MCP_CORS_ORIGIN ?? '';
  const certPath = options.tlsCert ?? process.env.CHARACTER_STUDIO_MCP_TLS_CERT;
  const keyPath = options.tlsKey ?? process.env.CHARACTER_STUDIO_MCP_TLS_KEY;
  const allowAnonymous = options.allowAnonymous ?? bool(process.env.CHARACTER_STUDIO_MCP_ALLOW_ANONYMOUS);
  if ((certPath && !keyPath) || (!certPath && keyPath)) throw new Error('Set both CHARACTER_STUDIO_MCP_TLS_CERT and CHARACTER_STUDIO_MCP_TLS_KEY for HTTPS');
  if (!allowAnonymous && !isLoopback(host) && !authToken) throw new Error('A bearer token is required when the MCP server binds to a non-loopback host; set CHARACTER_STUDIO_MCP_AUTH_TOKEN or explicitly opt into anonymous access');
  const tls = certPath && keyPath ? { cert: await readFile(certPath), key: await readFile(keyPath) } : null;
  const sessions = new Map();
  let boundPort = configuredPort;

  function authorized(request) {
    return allowAnonymous || !authToken || tokenMatches(authToken, parseAuthorization(request));
  }

  function protocolHeaders(sessionId = '') {
    return {
      'MCP-Protocol-Version': runtime.protocolVersion,
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    };
  }

  function createSession() {
    const id = randomUUID();
    const session = { id, streams: new Set(), createdAt: Date.now(), lastSeen: Date.now() };
    sessions.set(id, session);
    return session;
  }

  function closeSession(id) {
    const session = sessions.get(id);
    if (!session) return false;
    for (const stream of session.streams) {
      clearInterval(stream.heartbeat);
      if (!stream.response.writableEnded) stream.response.end();
    }
    sessions.delete(id);
    return true;
  }

  function publish(session, response) {
    if (!session || !response) return;
    const payload = JSON.stringify(response);
    for (const stream of session.streams) {
      if (!stream.response.writableEnded) stream.response.write(`event: message\ndata: ${payload}\n\n`);
    }
  }

  function startSse(request, response, session, legacy = false) {
    applyCors(request, response, corsOrigin);
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      ...protocolHeaders(session.id),
    });
    response.write(': connected\n\n');
    if (legacy) response.write(`event: endpoint\ndata: ${endpointPath === '/mcp' ? '/message' : `${endpointPath}/message`}?sessionId=${encodeURIComponent(session.id)}\n\n`);
    const stream = { response, heartbeat: setInterval(() => { if (!response.writableEnded) response.write(': heartbeat\n\n'); }, 25000) };
    session.streams.add(stream);
    request.on('close', () => { clearInterval(stream.heartbeat); session.streams.delete(stream); });
  }

  async function handleRpc(request, response, body, session, streamResponse = false) {
    let parsed;
    try { parsed = JSON.parse(body); } catch { sendJson(request, response, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, corsOrigin); return; }
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    if (!messages.length) { sendJson(request, response, 400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Empty JSON-RPC batch' } }, corsOrigin); return; }
    const responses = [];
    let activeSession = session;
    for (const message of messages) {
      if (message?.method === 'initialize' && !activeSession) activeSession = createSession();
      if (activeSession) activeSession.lastSeen = Date.now();
      const result = await runtime.handle(message);
      if (result) { responses.push(result); if (streamResponse) publish(activeSession, result); }
    }
    if (streamResponse) { sendJson(request, response, 202, { accepted: true }, corsOrigin, protocolHeaders(activeSession?.id)); return; }
    if (!responses.length) { response.writeHead(202, protocolHeaders(activeSession?.id)); response.end(); return; }
    const payload = Array.isArray(parsed) ? responses : responses[0];
    sendJson(request, response, 200, payload, corsOrigin, protocolHeaders(activeSession?.id));
  }

  async function requestHandler(request, response) {
    const scheme = tls ? 'https' : 'http';
    const url = new URL(request.url || '/', `${scheme}://${request.headers.host || 'localhost'}`);
    if (request.method === 'OPTIONS') {
      if (!requestOriginAllowed(request, corsOrigin)) { sendText(request, response, 403, 'Origin not allowed', corsOrigin); return; }
      applyCors(request, response, corsOrigin);
      response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID' });
      response.end(); return;
    }
    if (!requestOriginAllowed(request, corsOrigin)) { sendText(request, response, 403, 'Origin not allowed', corsOrigin); return; }
    if (url.pathname === '/healthz') {
      sendJson(request, response, 200, { ok: true, name: runtime.serverName, version: runtime.version, protocolVersion: runtime.protocolVersion, transport: tls ? 'https' : 'http', tools: runtime.tools.size }, corsOrigin); return;
    }
    if (!authorized(request)) { sendJson(request, response, 401, { error: 'Unauthorized', hint: 'Send Authorization: Bearer <CHARACTER_STUDIO_MCP_AUTH_TOKEN>' }, corsOrigin, { 'WWW-Authenticate': 'Bearer' }); return; }
    const sessionId = sessionIdFrom(request, url);
    const session = sessionId ? sessions.get(sessionId) : null;
    if (sessionId && !session) { sendJson(request, response, 404, { error: 'Unknown MCP session' }, corsOrigin); return; }

    if (url.pathname === endpointPath && request.method === 'GET') {
      if (!(request.headers.accept || '').includes('text/event-stream')) { sendText(request, response, 405, 'Use POST for MCP JSON-RPC or request text/event-stream', corsOrigin, { Allow: 'POST, DELETE, OPTIONS' }); return; }
      startSse(request, response, session || createSession()); return;
    }
    if (url.pathname === endpointPath && request.method === 'DELETE') {
      closeSession(sessionId); response.writeHead(204, protocolHeaders()); response.end(); return;
    }
    if (url.pathname === endpointPath && request.method === 'POST') {
      try { await handleRpc(request, response, await readBody(request), session); } catch (error) { sendJson(request, response, error.statusCode || 500, { error: error instanceof Error ? error.message : String(error) }, corsOrigin); }
      return;
    }
    const legacySsePath = endpointPath === '/mcp' ? '/sse' : `${endpointPath}/sse`;
    const legacyMessagePath = endpointPath === '/mcp' ? '/message' : `${endpointPath}/message`;
    if (url.pathname === legacySsePath && request.method === 'GET') { startSse(request, response, session || createSession(), true); return; }
    if (url.pathname === legacyMessagePath && request.method === 'POST') {
      if (!session) { sendJson(request, response, 404, { error: 'Unknown MCP session' }, corsOrigin); return; }
      try { await handleRpc(request, response, await readBody(request), session, true); } catch (error) { sendJson(request, response, error.statusCode || 500, { error: error instanceof Error ? error.message : String(error) }, corsOrigin); }
      return;
    }
    if (url.pathname === '/' && request.method === 'GET') { sendJson(request, response, 200, { name: runtime.serverName, protocolVersion: runtime.protocolVersion, endpoint: endpointPath, tools: runtime.tools.size, secure: Boolean(tls) }, corsOrigin); return; }
    sendText(request, response, 404, 'Not found', corsOrigin);
  }

  const server = tls ? createHttpsServer(tls, requestHandler) : createHttpServer(requestHandler);
  const api = {
    server,
    runtime,
    host,
    endpointPath,
    secure: Boolean(tls),
    get port() { return boundPort; },
    get url() { return `${tls ? 'https' : 'http'}://${host === '0.0.0.0' ? '127.0.0.1' : host}:${boundPort}${endpointPath}`; },
    listen() { return new Promise((resolve, reject) => { const onError = error => { server.off('listening', onListening); reject(error); }; const onListening = () => { server.off('error', onError); const address = server.address(); boundPort = typeof address === 'object' && address ? address.port : configuredPort; resolve(api); }; server.once('error', onError); server.once('listening', onListening); server.listen(configuredPort, host); }); },
    close() { for (const id of sessions.keys()) closeSession(id); return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
  return api;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const api = await createMcpHttpServer();
  await api.listen();
  log(`ready · ${api.url} · ${api.runtime.tools.size} tools · workspace ${api.runtime.workspaceRoot}`);
  const shutdown = async () => { try { await api.close(); } finally { process.exit(0); } };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
