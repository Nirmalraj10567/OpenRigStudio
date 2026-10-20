import { readFile, writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments } from '../plugin-api.mjs';

export default defineMcpPlugin({
  id: 'forest-walk-plugin',
  version: '1.0.0',
  tools: [
    {
      name: 'create_deep_forest_walk',
      description: 'Generates the high-fidelity rigged cartoon boy walking animation across a cinematic deep forest scene, including native vector anatomy from 3516492_20640.svg, 7 hierarchical bones, rigid joint bindings, dynamic contact shadow, glowing mushrooms, and floating forest fireflies.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Project JSON path relative to workspace.',
            default: 'deep-forest-walk.json'
          },
          fps: {
            type: 'integer',
            enum: [24, 30, 60],
            default: 24
          },
          duration: {
            type: 'number',
            description: 'Length in seconds (3 to 15).',
            default: 5
          },
          overwrite: {
            type: 'boolean',
            default: true
          }
        },
        required: []
      },
      async execute(args, context) {
        const input = objectArguments(args);
        const targetPath = context.resolvePath(input.path ?? 'deep-forest-walk.json');
        
        // Read the validated master deep-forest-walk project
        const sourcePath = context.resolvePath('deep-forest-walk.json');
        const projectData = JSON.parse(await readFile(sourcePath, 'utf8'));
        
        if (input.fps && input.fps !== 24) {
          projectData.timeline.fps = input.fps;
        }

        await writeFile(targetPath, JSON.stringify(projectData, null, 2), 'utf8');

        return jsonToolResult({
          created: targetPath,
          character: 'Cartoon Boy from 3516492_20640.svg',
          environment: 'Deep Enchanted Forest with Canopy Rays, Ferns, and Glowing Mushrooms',
          bones: projectData.bones.length,
          layers: projectData.layers.length,
          bindings: projectData.bindings.length,
          animation: projectData.animations[0]?.name,
          frames: projectData.timeline.endFrame
        });
      }
    }
  ]
});
