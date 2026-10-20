#!/usr/bin/env node
import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import projectTools from './plugins/project-tools.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(process.env.CHARACTER_STUDIO_WORKSPACE || join(here, '..'));
const pluginDirectory = resolve(process.env.CHARACTER_STUDIO_MCP_PLUGINS || join(here, 'plugins'));

function log(message) { process.stderr.write(`[character-studio-mcp] ${message}\n`); }
function workspacePath(requested = '') {
  if (typeof requested !== 'string' || !requested.trim()) throw new Error('A project path is required');
  const candidate = resolve(workspaceRoot, requested);
  const escape = relative(workspaceRoot, candidate).startsWith(`..${sep}`) || isAbsolute(relative(workspaceRoot, candidate));
  if (escape) throw new Error(`Path must stay inside CHARACTER_STUDIO_WORKSPACE: ${requested}`);
  return candidate;
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

async function loadExternalPlugins() {
  if (!await exists(pluginDirectory)) return [];
  const names = (await readdir(pluginDirectory, { withFileTypes: true })).filter(entry => entry.isFile() && extname(entry.name) === '.mjs' && entry.name !== 'project-tools.mjs').map(entry => entry.name).sort();
  const plugins = [];
  for (const name of names) {
    const module = await import(pathToFileURL(join(pluginDirectory, name)).href);
    const plugin = module.default ?? module.plugin;
    if (plugin) plugins.push(plugin);
  }
  return plugins;
}

const plugins = [projectTools, ...(await loadExternalPlugins())];
const tools = new Map();
for (const plugin of plugins) {
  for (const tool of plugin.tools) {
    if (tools.has(tool.name)) throw new Error(`Duplicate MCP tool name: ${tool.name}`);
    tools.set(tool.name, { ...tool, pluginId: plugin.id });
  }
}
const context = { workspaceRoot, resolvePath: workspacePath, exists };

function reply(id, result) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`); }
function failure(id, code, message) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`); }

async function handle(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return;
  if (message.method.startsWith('notifications/')) return;
  const id = message.id;
  try {
    if (message.method === 'initialize') {
      reply(id, { protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'character-studio-mcp', version: '1.0.0' }, instructions: 'Use project tools to inspect and edit Character Studio JSON files inside the configured workspace.' });
      return;
    }
    if (message.method === 'ping') { reply(id, {}); return; }
    if (message.method === 'tools/list') {
      reply(id, { tools: [...tools.values()].map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })) });
      return;
    }
    if (message.method === 'tools/call') {
      const name = message.params?.name;
      const tool = tools.get(name);
      if (!tool) { failure(id, -32602, `Unknown MCP tool: ${name}`); return; }
      const result = await tool.execute(message.params?.arguments ?? {}, context);
      reply(id, result);
      return;
    }
    failure(id, -32601, `Method not found: ${message.method}`);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    if (id !== undefined) failure(id, -32000, messageText);
    else log(messageText);
  }
}

log(`ready · workspace ${workspaceRoot} · plugins ${plugins.map(plugin => plugin.id).join(', ')}`);
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  try { await handle(JSON.parse(line)); } catch (error) { log(`invalid JSON-RPC message: ${error instanceof Error ? error.message : String(error)}`); }
}
