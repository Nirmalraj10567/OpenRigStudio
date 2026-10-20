import { readFile, writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments } from '../plugin-api.mjs';
import { compileScene, recipeProperties, RECIPES } from '../scene-kit/compile.mjs';
import { validateScene } from '../scene-kit/validate.mjs';

export async function saveScene(input, context) {
  const output = context.resolvePath(input.path);
  if (!output.toLowerCase().endsWith('.json')) throw new Error('Scene path must end in .json');
  if (await context.exists(output) && input.overwrite !== true) throw new Error('Output exists; pass overwrite: true to replace it');
  const project = compileScene(input);
  const quality = await validateScene(project);
  if (!quality.ok) throw new Error(`Scene validation failed: ${quality.errors.join('; ')}`);
  await writeFile(output, `${JSON.stringify(project,null,2)}\n`, { flag: input.overwrite === true ? 'w' : 'wx' });
  return jsonToolResult({ created: output, durationSeconds: project.timeline.endFrame/project.timeline.fps, totalFrames: project.timeline.endFrame,
    layers: project.layers.length, bones: project.bones.length, tracks: project.animations[0].tracks.length, quality,
    next: 'preview_project_timeline → render_project_video' });
}

export default defineMcpPlugin({ id: 'character-studio-scene-kit', version: '1.0.0', tools: [
  { name: 'scene_catalog', description: 'List compact, ready-to-animate scene recipes and defaults. Start here for semantic authoring without coordinates.', inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => jsonToolResult({ presets: RECIPES, palettes: ['pastel','warm'], characters: ['suited','casual'], cameras: ['follow','wide'], defaults: { preset:'showroom_stumble',duration:5,fps:24,palette:'pastel',character:'suited',camera:'follow' }, example: { tool:'compose_scene',arguments:{path:'scene.json',preset:'showroom_stumble'} } }) },
  { name: 'compose_scene', description: 'Build and validate an editable vector scene from a short recipe. Handles joints, IK, contact shadows, furniture depth and camera framing; returns a compact summary. Recompile with overwrite to replace the entire generated scene.',
    inputSchema: { type:'object',properties:{path:{type:'string'},...recipeProperties,overwrite:{type:'boolean',default:false}},required:['path'],additionalProperties:false },
    execute: (args,context) => {
      const input = objectArguments(args);
      for (const key of Object.keys(input)) if (!['path','overwrite',...Object.keys(recipeProperties)].includes(key)) throw new Error(`Unknown recipe field: ${key}. Use scene_catalog for supported presets.`);
      return saveScene(input,context);
    } },
  { name: 'validate_scene', description: 'Check a Scene Kit project using the native engine: joints and artwork attachments at every frame and half-frame, world transforms, depth, camera bounds, SVG and deterministic seeking.',
    inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false},
    execute: async (args,context) => { const input=objectArguments(args); return jsonToolResult(await validateScene(JSON.parse(await readFile(context.resolvePath(input.path),'utf8')))); } },
] });
