import { readFile, writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments } from '../plugin-api.mjs';
import { nativeRender } from '../native-renderer.mjs';

async function render(args, context, kind) {
  const input = objectArguments(args);
  const source = context.resolvePath(input.path), output = context.resolvePath(input.outputPath);
  const format = kind === 'frame' ? 'png' : input.format ?? 'mp4';
  if (!['png', 'mp4', 'webm'].includes(format) || !output.toLowerCase().endsWith(`.${format}`) || source === output) throw new Error('Output extension must match the render format and differ from the source');
  if (kind === 'video' && !['mp4', 'webm'].includes(format)) throw new Error('Video format must be mp4 or webm');
  if (await context.exists(output) && input.overwrite !== true) throw new Error('Output exists; pass overwrite: true to replace it');
  const project = JSON.parse(await readFile(source, 'utf8'));
  const frame = input.frame ?? project.timeline?.currentFrame ?? 0;
  if (kind === 'frame' && (!Number.isFinite(frame) || frame < project.timeline?.startFrame || frame > project.timeline?.endFrame)) throw new Error('Frame must be inside the project timeline');
  const result = await nativeRender(project, { kind, frame, format });
  await writeFile(output, Buffer.from(result.data, 'base64'), { flag: input.overwrite === true ? 'w' : 'wx' });
  return jsonToolResult({ output, bytes: result.size, renderer: 'Character Studio native Canvas/SVG/WebCodecs', ...result.metadata });
}
async function renderTimeline(args, context) {
  const input = objectArguments(args);
  const source = context.resolvePath(input.path), output = context.resolvePath(input.outputPath);
  if (!output.toLowerCase().endsWith('.png') || source === output) throw new Error('Timeline preview output must be a different .png file');
  if (await context.exists(output) && input.overwrite !== true) throw new Error('Output exists; pass overwrite: true to replace it');
  const project = JSON.parse(await readFile(source, 'utf8'));
  const start = project.timeline?.startFrame ?? 0, end = project.timeline?.endFrame ?? 0;
  const samples = Math.max(2, Math.min(24, Math.round(input.samples ?? 6)));
  const frames = Array.isArray(input.frames) && input.frames.length ? input.frames.map(Number) : Array.from({ length: samples }, (_, index) => Math.round(start + (end - start) * index / (samples - 1)));
  if (frames.some(frame => !Number.isFinite(frame) || frame < start || frame > end)) throw new Error('Timeline preview frames must stay inside the project timeline');
  const columns = Math.max(1, Math.min(6, Math.round(input.columns ?? 3)));
  const cellWidth = Math.max(240, Math.min(800, Math.round(input.cellWidth ?? 420)));
  const result = await nativeRender(project, { kind: 'timeline', frames, columns, cellWidth });
  await writeFile(output, Buffer.from(result.data, 'base64'), { flag: input.overwrite === true ? 'w' : 'wx' });
  return jsonToolResult({ output, bytes: result.size, renderer: 'Character Studio native Canvas/SVG/WebCodecs', ...result.metadata });
}
const common = { path: { type: 'string', description: 'Editable project JSON path.' }, outputPath: { type: 'string', description: 'Output file path inside the workspace.' }, overwrite: { type: 'boolean', default: false } };
export default defineMcpPlugin({ id: 'character-studio-native-render-tools', version: '1.0.0', tools: [
  { name: 'preview_project_frame', description: 'Export a PNG frame through the native Character Studio engine using installed Chrome. Source JSON and editor state remain unchanged.', inputSchema: { type: 'object', properties: { ...common, frame: { type: 'number', minimum: 0 } }, required: ['path', 'outputPath', 'frame'] }, execute: (args, context) => render(args, context, 'frame') },
  { name: 'preview_project_timeline', description: 'Sample the native editable animation timeline and export a labeled PNG contact sheet showing the scenes at selected frames.', inputSchema: { type: 'object', properties: { ...common, frames: { type: 'array', items: { type: 'number' }, description: 'Optional exact timeline frames.' }, samples: { type: 'integer', minimum: 2, maximum: 24, default: 6 }, columns: { type: 'integer', minimum: 1, maximum: 6, default: 3 }, cellWidth: { type: 'integer', minimum: 240, maximum: 800, default: 420 } }, required: ['path', 'outputPath'] }, execute: (args, context) => renderTimeline(args, context) },
  { name: 'render_project_video', description: 'Render the editable animation with the project’s own renderProjectVideo/Canvas/SVG/WebCodecs pipeline to MP4 or WebM. Requires installed Chrome via CHARACTER_STUDIO_CHROME_PATH; no animation automation library.', inputSchema: { type: 'object', properties: { ...common, format: { type: 'string', enum: ['mp4', 'webm'], default: 'mp4' } }, required: ['path', 'outputPath'] }, execute: (args, context) => render(args, context, 'video') },
] });
