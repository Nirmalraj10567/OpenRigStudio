/** Small plugin contract shared by the Character Studio MCP host and plugins. */
export function defineMcpPlugin(plugin) {
  if (!plugin || typeof plugin !== 'object' || typeof plugin.id !== 'string' || !plugin.id) throw new Error('MCP plugins need a non-empty id');
  if (!Array.isArray(plugin.tools)) throw new Error(`MCP plugin ${plugin.id} needs a tools array`);
  const names = new Set();
  for (const tool of plugin.tools) {
    if (!tool || typeof tool.name !== 'string' || !tool.name) throw new Error(`MCP plugin ${plugin.id} has a tool without a name`);
    if (names.has(tool.name)) throw new Error(`MCP plugin ${plugin.id} has duplicate tool ${tool.name}`);
    if (typeof tool.description !== 'string' || typeof tool.inputSchema !== 'object' || typeof tool.execute !== 'function') throw new Error(`MCP tool ${tool.name} is incomplete`);
    names.add(tool.name);
  }
  return Object.freeze({ ...plugin, version: typeof plugin.version === 'string' ? plugin.version : '0.1.0', tools: Object.freeze(plugin.tools.map(tool => Object.freeze(tool))) });
}

export function jsonToolResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

export function textToolResult(text) {
  return { content: [{ type: 'text', text: String(text) }] };
}

export function toolError(message) {
  return { isError: true, content: [{ type: 'text', text: String(message) }] };
}

export function objectArguments(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tool arguments must be a JSON object');
  return value;
}
