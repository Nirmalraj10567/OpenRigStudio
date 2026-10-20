import { readFile, writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments } from '../plugin-api.mjs';
import { saveScene } from './scene-tools.mjs';

const T = (x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) => ({ x, y, rotation, scaleX, scaleY });

async function save(context, path, project) {
  const output = context.resolvePath(path);
  await writeFile(output, `${JSON.stringify(project, null, 2)}\n`);
  return output;
}

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error('referencePath must be a PNG image');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function createReferencePlate(context, input) {
  const referencePath = context.resolvePath(input.referencePath);
  const outputPath = context.resolvePath(input.path);
  if (await context.exists(outputPath) && input.overwrite !== true) throw new Error('Output exists; pass overwrite: true to replace it');
  const buffer = await readFile(referencePath);
  const { width, height } = pngSize(buffer);
  const fps = input.fps ?? 24;
  if (![24, 30, 60].includes(fps)) throw new Error('fps must be 24, 30, or 60');
  const totalFrames = fps * 5;
  const centerX = width / 2, centerY = height / 2;
  const focalX = width * .42, focalY = height * .82;
  const zoom = Math.max(1.02, Math.min(1.5, Number(input.zoom ?? 1.28)));
  const zoomX = centerX - (focalX - centerX) * zoom;
  const zoomY = centerY - (focalY - centerY) * zoom;
  const src = `data:image/png;base64,${buffer.toString('base64')}`;
  const id = 'reference-plate';
  const track = (targetId, values) => ({ id: `track-${targetId}-transform`, targetId, property: 'transform', keyframes: values.map(([frame, value, easing = 'linear'], index) => ({ id: `key-${targetId}-${index}`, frame, value, easing })) });
  const clip = { id: 'reference-plate-animation', name: 'Exact supplied reference plate · slow camera move', fps, startFrame: 0, endFrame: totalFrames, loopMode: 'once', tracks: [track(id, [[0, T(centerX, centerY, 0, 1, 1)], [Math.round(totalFrames * .48), T(centerX, centerY, 0, 1, 1)], [totalFrames, T(zoomX, zoomY, 0, zoom, zoom), 'smooth']])], setupPose: {} };
  const project = {
    schemaVersion: 1,
    id: 'exact-reference-plate-animation',
    name: input.name?.trim() || 'Exact supplied showroom reference plate',
    canvas: { width, height, background: '#fff' },
    layers: [{ id, name: 'Exact supplied reference image', type: 'image', src, width, height, color: '#fff', local: T(centerX, centerY), zIndex: 0, opacity: 1, visible: true, locked: false, boundBoneId: null }],
    bones: [], bindings: [], animations: [clip],
    dynamics: { enabled: false, startFrame: 0, endFrame: totalFrames, fps, substeps: 4, gravityX: 0, gravityY: 420, windX: 0, windY: 0, windNoise: 0, seed: 1, bones: [], bodies: [], meshes: [], emitters: [] },
    stage2d: { enabled: false, cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0, projection: 'perspective' }, cameraView: 'preview',
    timeline: { currentFrame: 0, currentTime: 0, isPlaying: false, loop: false, fps, startFrame: 0, endFrame: totalFrames, activeAnimationId: clip.id },
    metadata: { createdBy: 'character-studio-mcp', referencePath: input.referencePath, exactReferencePlate: true, animationNote: 'Uses the supplied pixels exactly; no separable character rig is available in the screenshot.' },
  };
  return { outputPath: await save(context, input.path, project), project, width, height, totalFrames };
}

export default defineMcpPlugin({
  id: 'reference-showroom-plugin', version: '2.0.0',
  tools: [{
    name: 'recreate_furniture_showroom_animation',
    description: 'Create a validated five-second native showroom animation: perspective beds and sofa, connected two-segment limbs, planted-foot walk, inspection, forward stumble and camera push-in.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', default: 'reference-showroom-scene.json' }, name: { type: 'string', default: 'Furniture showroom reference recreation' }, fps: { type: 'integer', enum: [24, 30, 60], default: 24 }, overwrite: { type: 'boolean', default: false } }, required: ['path'] },
    execute(args, context) {
      const input = objectArguments(args);
      return saveScene({ path: input.path ?? 'reference-showroom-scene.json', name: input.name ?? 'Furniture showroom reference recreation', fps: input.fps ?? 24, overwrite: input.overwrite, preset: 'showroom_stumble' }, context);
    },
  }, {
    name: 'animate_exact_reference_plate',
    description: 'Create an editable five-second project using the supplied PNG pixels exactly as the visible animation plate, with a native timeline camera move toward the referenced character. Use this when exact character appearance matters more than a separable rig.',
    inputSchema: { type: 'object', properties: { referencePath: { type: 'string', description: 'PNG screenshot path inside the workspace.' }, path: { type: 'string', default: 'exact-reference-plate.json' }, name: { type: 'string' }, fps: { type: 'integer', enum: [24, 30, 60], default: 24 }, zoom: { type: 'number', minimum: 1.02, maximum: 1.5, default: 1.28 }, overwrite: { type: 'boolean', default: false } }, required: ['referencePath', 'path'] },
    async execute(args, context) {
      const input = objectArguments(args);
      if (!input.referencePath || !input.path) throw new Error('referencePath and path are required');
      const result = await createReferencePlate(context, input);
      return jsonToolResult({ created: result.outputPath, referencePath: input.referencePath, exactReferencePlate: true, durationSeconds: 5, totalFrames: result.totalFrames, width: result.width, height: result.height, layers: result.project.layers.length, bones: 0, note: 'The supplied screenshot is preserved pixel-for-pixel. A separate character rig requires original artwork or video frames.' });
    },
  }],
});
