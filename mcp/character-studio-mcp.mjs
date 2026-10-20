#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { createMcpRuntime } from './server-core.mjs';

function log(message) { process.stderr.write(`[character-studio-mcp] ${message}\n`); }
function write(response) { if (response) process.stdout.write(`${JSON.stringify(response)}\n`); }

const runtime = await createMcpRuntime({ includeDesignTools: true });
log(`ready · workspace ${runtime.workspaceRoot} · plugins ${runtime.plugins.map(plugin => plugin.id).join(', ')} · tools ${runtime.tools.size}`);
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  try { write(await runtime.handle(JSON.parse(line))); }
  catch (error) { log(`invalid JSON-RPC message: ${error instanceof Error ? error.message : String(error)}`); }
}
