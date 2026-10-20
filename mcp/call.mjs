#!/usr/bin/env node
import { connectStudioMcp } from './client.mjs';

const [tool, json = '{}'] = process.argv.slice(2);
if (!tool) throw new Error('Usage: node mcp/call.mjs list | <tool_name> \'{"argument":"value"}\'');
const args = JSON.parse(json);
const client = await connectStudioMcp(process.env.CHARACTER_STUDIO_WORKSPACE);
try {
  const response = await client.request(tool === 'list' ? 'tools/list' : 'tools/call', tool === 'list' ? {} : { name: tool, arguments: args });
  console.log(JSON.stringify(response, null, 2));
  if (response.error || response.result?.isError) process.exitCode = 1;
} finally { await client.close(); }
