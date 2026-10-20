import { connectStudioMcp } from '../client.mjs';

// Reproducible example: every scene edit goes through the running MCP server.
const client = await connectStudioMcp(process.env.CHARACTER_STUDIO_WORKSPACE);
const path = 'garden-cafe-scene.json';
async function call(name, args) {
  const response = await client.request('tools/call', { name, arguments: args });
  if (response.error || response.result?.isError) throw new Error(JSON.stringify(response.error ?? response.result));
  console.log(`${name}: ${JSON.stringify(response.result.structuredContent)}`);
  return response.result.structuredContent;
}
try {
  const list = await client.request('tools/list');
  if (!list.result.tools.some(tool => tool.name === 'animate_character')) throw new Error('MCP animation plugin is missing');
  await call('animate_character', { sourcePath: 'mcp-character-scene.json', path, story: 'garden_to_coffee_shop', name: 'A Little Coffee Break', fps: 24, overwrite: true });
  await call('add_scene_prop', { path, id: 'garden-birds', name: 'Garden birds', zIndex: -60, shapes: [{ kind: 'path', d: 'M 337 210 Q 346 199 355 210 Q 364 199 373 210 M 403 185 Q 411 176 420 185 Q 429 176 437 185', fill: 'none', stroke: '#5d7b65', strokeWidth: 3 }] });
  await call('set_animation_keyframes', { path, clipId: 'garden-cafe-animation', targetId: 'garden-birds', property: 'visible', keyframes: [{ frame: 0, value: true, easing: 'step' }, { frame: 240, value: false }] });
  if (process.argv.includes('--render')) {
    for (const [shot, frame] of [['walk', 105], ['order', 312], ['drink', 475]]) {
      await call('preview_project_frame', { path, outputPath: `garden-cafe-${shot}.png`, frame, overwrite: true });
    }
    await call('render_project_video', { path, outputPath: 'garden-cafe-story.mp4', format: 'mp4', overwrite: true });
  }
} finally { await client.close(); }
