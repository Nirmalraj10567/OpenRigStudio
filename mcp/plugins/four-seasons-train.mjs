import { writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments, toolError } from '../plugin-api.mjs';
import { createFourSeasonsTrainScene } from '../four-seasons-scene.mjs';

const pathSchema = {
  type: 'string',
  description: 'Project JSON path relative to CHARACTER_STUDIO_WORKSPACE.',
  default: 'four-seasons-train.json',
};

export default defineMcpPlugin({
  id: 'four-seasons-train-plugin',
  name: 'Four Seasons carriage',
  version: '1.0.0',
  tools: [
    {
      name: 'create_four_seasons_train',
      description: 'Create an editable Grand Budapest-style vector short: a symmetric train carriage interior with a coffee cup on the table, while spring, summer, autumn and winter country scrolls past the window. Authored as ordinary layers, bones and keyframes.',
      inputSchema: {
        type: 'object',
        properties: {
          path: pathSchema,
          name: { type: 'string', description: 'Project name.', default: 'Four Seasons · Carriage No. 4' },
          fps: { type: 'integer', enum: [12, 24, 30, 60], default: 24 },
          duration: { type: 'number', description: 'Length in seconds (8–120).', default: 24 },
          overwrite: { type: 'boolean', default: false },
        },
        required: [],
      },
      async execute(args, context) {
        const input = objectArguments(args);
        const path = input.path ?? 'four-seasons-train.json';
        const output = context.resolvePath(path);
        if (context.exists(path) && input.overwrite !== true) {
          return toolError(`${path} already exists. Re-run with overwrite: true to replace it.`);
        }
        const project = createFourSeasonsTrainScene({
          name: input.name ?? 'Four Seasons · Carriage No. 4',
          fps: input.fps ?? 24,
          duration: input.duration ?? 24,
        });
        await writeFile(output, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
        return jsonToolResult({
          path,
          absolutePath: output,
          canvas: project.canvas,
          fps: project.timeline.fps,
          endFrame: project.timeline.endFrame,
          durationSeconds: project.timeline.endFrame / project.timeline.fps,
          layers: project.layers.length,
          vectorLayers: project.layers.filter(layer => layer.type === 'vector').length,
          bones: project.bones.length,
          tracks: project.animations[0].tracks.length,
          keyframes: project.animations[0].tracks.reduce((sum, track) => sum + track.keyframes.length, 0),
          chapters: ['SPRING 0–7.4s', 'SUMMER 7.4–12.4s', 'AUTUMN 12.4–17.4s', 'WINTER 17.4–24s'],
          cupLayerId: 'coffee-cup',
          saucerLayerId: 'coffee-saucer',
          sipBoneId: 'pov-right-fore',
          cameraId: 'carriage-camera',
        });
      },
    },
  ],
});
