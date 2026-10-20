import { constants } from 'node:fs';
import { access, readdir } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import projectTools from './plugins/project-tools.mjs';
import designTools from './design-plugins/design-tools.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SERVER_VERSION = '1.1.0';

function defaultWorkspaceRoot() {
  return resolve(process.env.CHARACTER_STUDIO_WORKSPACE || join(here, '..'));
}

function defaultPluginDirectory() {
  return resolve(process.env.CHARACTER_STUDIO_MCP_PLUGINS || join(here, 'plugins'));
}

function workspacePath(workspaceRoot, requested = '') {
  if (typeof requested !== 'string' || !requested.trim()) throw new Error('A project path is required');
  const candidate = resolve(workspaceRoot, requested);
  const relativePath = relative(workspaceRoot, candidate);
  const escape = relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
  if (escape) throw new Error(`Path must stay inside CHARACTER_STUDIO_WORKSPACE: ${requested}`);
  return candidate;
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

async function loadExternalPlugins(pluginDirectory) {
  if (!await exists(pluginDirectory)) return [];
  const entries = await readdir(pluginDirectory, { withFileTypes: true });
  const names = entries
    .filter(entry => entry.isFile() && extname(entry.name) === '.mjs' && entry.name !== 'project-tools.mjs')
    .map(entry => entry.name)
    .sort();
  const plugins = [];
  for (const name of names) {
    const module = await import(pathToFileURL(join(pluginDirectory, name)).href);
    const plugin = module.default ?? module.plugin;
    if (plugin) plugins.push(plugin);
  }
  return plugins;
}

function addPluginTools(registry, plugin) {
  for (const tool of plugin.tools) {
    if (registry.has(tool.name)) throw new Error(`Duplicate MCP tool name: ${tool.name}`);
    registry.set(tool.name, { ...tool, pluginId: plugin.id });
  }
}

function addDesignTools(registry) {
  for (const tool of designTools.tools) {
    // The full server already exposes the general project inspector. Keep both
    // feature sets available by giving the compact design inspector a stable
    // namespace instead of silently dropping it.
    const name = registry.has(tool.name) ? `design_${tool.name}` : tool.name;
    if (registry.has(name)) throw new Error(`Duplicate MCP tool name: ${name}`);
    registry.set(name, {
      ...tool,
      name,
      pluginId: designTools.id,
      description: name === tool.name ? tool.description : `Design MCP alias for ${tool.name}. ${tool.description}`,
    });
  }
}

export async function createMcpRuntime(options = {}) {
  const workspaceRoot = resolve(options.workspaceRoot || defaultWorkspaceRoot());
  const pluginDirectory = resolve(options.pluginDirectory || defaultPluginDirectory());
  const includeDesignTools = options.includeDesignTools !== false;
  const plugins = [projectTools, ...(await loadExternalPlugins(pluginDirectory))];
  const tools = new Map();
  for (const plugin of plugins) addPluginTools(tools, plugin);
  if (includeDesignTools) addDesignTools(tools);

  const context = {
    workspaceRoot,
    resolvePath: requested => workspacePath(workspaceRoot, requested),
    exists,
  };
  const serverName = options.serverName || 'character-studio-mcp';
  const instructions = options.instructions || 'Character Studio MCP exposes the complete project, design, animation, scene, physics, asset, and native render toolset. Paths are restricted to CHARACTER_STUDIO_WORKSPACE.';

  async function handle(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid JSON-RPC request' } };
    }
    if (message.method.startsWith('notifications/')) return null;
    const id = message.id;
    try {
      if (message.method === 'initialize') {
        return { jsonrpc: '2.0', id, result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: serverName, version: options.version || MCP_SERVER_VERSION },
          instructions,
        } };
      }
      if (message.method === 'ping') return { jsonrpc: '2.0', id, result: {} };
      if (message.method === 'tools/list') {
        return { jsonrpc: '2.0', id, result: { tools: [...tools.values()].map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })) } };
      }
      if (message.method === 'tools/call') {
        const name = message.params?.name;
        const tool = tools.get(name);
        if (!tool) return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown MCP tool: ${name}` } };
        const result = await tool.execute(message.params?.arguments ?? {}, context);
        return { jsonrpc: '2.0', id, result: result ?? { content: [{ type: 'text', text: '' }] } };
      }
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${message.method}` } };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      return { jsonrpc: '2.0', id, error: { code: -32000, message: messageText } };
    }
  }

  return {
    workspaceRoot,
    pluginDirectory,
    plugins,
    tools,
    context,
    serverName,
    version: options.version || MCP_SERVER_VERSION,
    protocolVersion: MCP_PROTOCOL_VERSION,
    handle,
  };
}
