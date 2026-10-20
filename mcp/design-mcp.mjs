#!/usr/bin/env node
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createInterface } from 'node:readline';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import designTools from './design-plugins/design-tools.mjs';
import renderTools from './plugins/render-tools.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(process.env.CHARACTER_STUDIO_WORKSPACE || join(here, '..'));

function log(message) { process.stderr.write('[design-mcp] ' + message + '\n'); }
function workspacePath(requested) {
  if (typeof requested !== 'string' || !requested.trim()) throw new Error('A project path is required');
  const candidate = resolve(workspaceRoot, requested);
  const escape = relative(workspaceRoot, candidate).startsWith('..' + sep) || isAbsolute(relative(workspaceRoot, candidate));
  if (escape) throw new Error('Path must stay inside CHARACTER_STUDIO_WORKSPACE: ' + requested);
  return candidate;
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

const tools = new Map();
for (const plugin of [designTools, renderTools]) {
  for (const tool of plugin.tools) {
    if (tools.has(tool.name)) throw new Error('Duplicate MCP tool name: ' + tool.name);
    tools.set(tool.name, { ...tool, pluginId: plugin.id });
  }
}
const context = { workspaceRoot, resolvePath: workspacePath, exists };

function reply(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); }
function failure(id, code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n'); }

async function handle(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return;
  if (message.method.startsWith('notifications/')) return;
  const id = message.id;
  try {
    if (message.method === 'initialize') {
      reply(id, {
        protocolVersion: '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'design-mcp', version: '1.0.0' },
        instructions: 'Lean character-design server. Workflow: list_design_presets, then design_character, then get_rig. Edit with edit_rig, edit_layers, bind_layers, edit_keyframes, edit_animation, edit_scene. Check with validate_rig, repair with auto_fix_rig. Render with preview_project_frame, preview_project_timeline, render_project_video. Results are single-copy and compact; pass detail:full only when needed.',
      });
      return;
    }
    if (message.method === 'ping') { reply(id, {}); return; }
    if (message.method === 'tools/list') {
      reply(id, { tools: [...tools.values()].map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })) });
      return;
    }
    if (message.method === 'tools/call') {
      const name = message.params && message.params.name;
      const tool = tools.get(name);
      if (!tool) { failure(id, -32602, 'Unknown MCP tool: ' + name); return; }
      const result = await tool.execute((message.params && message.params.arguments) || {}, context);
      reply(id, result);
      return;
    }
    failure(id, -32601, 'Method not found: ' + message.method);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    if (id !== undefined) failure(id, -32000, messageText);
    else log(messageText);
  }
}

log('ready - workspace ' + workspaceRoot + ' - tools ' + tools.size);
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  try { await handle(JSON.parse(line)); } catch (error) { log('invalid JSON-RPC message: ' + (error instanceof Error ? error.message : String(error))); }
}
