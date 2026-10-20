import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { connectStudioMcpHttp } from '../mcp/client.mjs';
import { createMcpHttpServer } from '../mcp/http-server.mjs';

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

test('full MCP Streamable HTTP transport exposes design and studio tools', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'character-studio-http-'));
  const server = await createMcpHttpServer({ workspaceRoot: workspace, host: '127.0.0.1', port: 0, allowAnonymous: true });
  await server.listen();
  try {
    const health = await jsonFetch(`${server.url.replace(/\/mcp$/, '')}/healthz`);
    assert.equal(health.response.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.transport, 'http');

    const client = await connectStudioMcpHttp(server.url);
    try {
      const listed = await client.request('tools/list');
      const names = listed.result.tools.map(tool => tool.name);
      assert.ok(names.includes('create_character_scene'));
      assert.ok(names.includes('compose_scene'));
      assert.ok(names.includes('design_character'));
      assert.ok(names.includes('inspect_project'));
      assert.ok(names.includes('design_inspect_project'));
      assert.ok(names.includes('render_project_video'));

      const created = await client.request('tools/call', { name: 'create_character_scene', arguments: { path: 'remote-character.json', overwrite: true } });
      assert.equal(created.error, undefined, JSON.stringify(created));
      const saved = JSON.parse(await readFile(join(workspace, 'remote-character.json'), 'utf8'));
      assert.equal(saved.metadata.createdBy, 'character-studio-mcp');

      const catalog = await client.request('tools/call', { name: 'feature_catalog', arguments: {} });
      assert.ok(catalog.result.structuredContent.features.project.includes('patch_project'));
      const patched = await client.request('tools/call', { name: 'patch_project', arguments: { path: 'remote-character.json', operations: [{ op: 'set', path: '/name', value: 'Patched Remote Character' }, { op: 'merge', path: '/metadata', value: { source: 'http-test' } }] } });
      assert.equal(patched.error, undefined, JSON.stringify(patched));
      const full = await client.request('tools/call', { name: 'inspect_project_full', arguments: { path: 'remote-character.json' } });
      assert.equal(full.result.structuredContent.name, 'Patched Remote Character');
      assert.equal(full.result.structuredContent.counts.layers, 9);
      const valid = await client.request('tools/call', { name: 'validate_project', arguments: { path: 'remote-character.json' } });
      assert.equal(valid.error, undefined, JSON.stringify(valid));
      assert.equal(valid.result.structuredContent.ok, true);

      const designed = await client.request('tools/call', { name: 'design_character', arguments: { path: 'remote-design.json', archetype: 'bust', name: 'Remote Bust' } });
      assert.equal(designed.error, undefined, JSON.stringify(designed));
      assert.equal(JSON.parse(await readFile(join(workspace, 'remote-design.json'), 'utf8')).name, 'Remote Bust');
      assert.ok(client.sessionId, 'HTTP initialize must establish an MCP session');
    } finally {
      await client.close();
    }
  } finally {
    await server.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('HTTP transport rejects unauthorized remote-style requests', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'character-studio-auth-'));
  const server = await createMcpHttpServer({ workspaceRoot: workspace, host: '127.0.0.1', port: 0, authToken: 'test-token' });
  await server.listen();
  try {
    const denied = await jsonFetch(server.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) });
    assert.equal(denied.response.status, 401);
    const client = await connectStudioMcpHttp(server.url, { token: 'test-token' });
    await client.close();
  } finally {
    await server.close();
    await rm(workspace, { recursive: true, force: true });
  }
});
