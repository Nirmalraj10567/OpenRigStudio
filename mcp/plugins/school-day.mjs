import { writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments, toolError } from '../plugin-api.mjs';
import { createSchoolDayScene } from '../school-day-scene.mjs';

const pathSchema = {
  type: 'string',
  description: 'Project JSON path relative to CHARACTER_STUDIO_WORKSPACE.',
  default: 'school-day.json',
};

export default defineMcpPlugin({
  id: 'school-day-plugin',
  name: 'The Bell Rings at Four',
  version: '1.0.0',
  tools: [
    {
      name: 'create_school_day',
      description: 'Create an editable square motion-graphics short: a girl teacher works through one school day morning to evening in a classroom, each lesson being a portfolio subject (numbers, drawing, stories, play), ending on a closing title plate. Authored as ordinary layers and native keyframes with a single animated classroom camera.',
      inputSchema: {
        type: 'object',
        properties: {
          path: pathSchema,
          name: { type: 'string', description: 'Project name.', default: 'The Bell Rings at Four' },
          fps: { type: 'integer', enum: [12, 24, 30, 60], default: 24 },
          duration: { type: 'number', description: 'Length in seconds (10–120).', default: 30 },
          overwrite: { type: 'boolean', default: false },
        },
        required: [],
      },
      async execute(args, context) {
        const input = objectArguments(args);
        const path = input.path ?? 'school-day.json';
        const output = context.resolvePath(path);
        if (context.exists(path) && input.overwrite !== true) {
          return toolError(`${path} already exists. Re-run with overwrite: true to replace it.`);
        }
        const project = createSchoolDayScene({
          name: input.name ?? 'The Bell Rings at Four',
          fps: input.fps ?? 24,
          duration: input.duration ?? 30,
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
          beats: ['hook 0–1.0s', 'numbers 1.0–7.6s', 'drawing 7.6–14.2s', 'stories 14.2–20.8s', 'play 20.8–26.4s', 'home 26.4–28.6s', 'close 28.6–30.0s'],
          cameraId: 'class-cam',
          audioCues: project.metadata.audioCues,
        });
      },
    },
  ],
});
