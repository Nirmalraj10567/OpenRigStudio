import { readFile, writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments } from '../plugin-api.mjs';

async function load(context, path) {
  const project = JSON.parse(await readFile(context.resolvePath(path), 'utf8'));
  return project;
}

async function save(context, path, project) {
  const output = context.resolvePath(path);
  await writeFile(output, `${JSON.stringify(project, null, 2)}\n`);
  return output;
}

export default defineMcpPlugin({
  id: 'scooter-story-plugin',
  version: '1.0.0',
  tools: [
    {
      name: 'animate_scooter',
      description: 'Animates the character riding a scooter in the city to a luxury hotel.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' }
        },
        required: ['path']
      },
      async execute(args, context) {
        const input = objectArguments(args);
        const project = await load(context, input.path);
        
        // Add City Background Prop
        project.layers.unshift({
          id: "city-bg",
          name: "City",
          type: "vector",
          local: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
          opacity: 1,
          visible: true,
          locked: true,
          boundBoneId: null,
          zIndex: -2,
          shapes: [
            { id: "sky", kind: "rect", x: 0, y: 0, width: 800, height: 520, fill: "#87CEEB" },
            { id: "road", kind: "rect", x: 0, y: 400, width: 800, height: 120, fill: "#555555" },
            // City Buildings
            { id: "b1", kind: "rect", x: 50, y: 150, width: 80, height: 250, fill: "#2F4F4F" },
            { id: "b2", kind: "rect", x: 150, y: 100, width: 100, height: 300, fill: "#696969" },
            { id: "b3", kind: "rect", x: 300, y: 200, width: 70, height: 200, fill: "#708090" }
          ]
        });

        // Add Luxury Hotel
        project.layers.push({
          id: "luxury-hotel",
          name: "Hotel",
          type: "vector",
          local: { x: 600, y: 50, rotation: 0, scaleX: 1, scaleY: 1 },
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: null,
          zIndex: -1,
          shapes: [
            { id: "hotel-base", kind: "rect", x: 0, y: 0, width: 150, height: 350, fill: "#FFD700" },
            { id: "hotel-door", kind: "rect", x: 50, y: 250, width: 50, height: 100, fill: "#8B4513" },
            { id: "hotel-sign", kind: "rect", x: 10, y: 20, width: 130, height: 40, fill: "#000" }
          ]
        });

        // Add Scooter attached to character
        project.layers.push({
          id: "scooter",
          name: "Scooter",
          type: "vector",
          local: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: "root", // attached to the character root
          zIndex: 10,
          shapes: [
            // Scooter base
            { id: "scooter-base", kind: "rect", x: -20, y: 40, width: 80, height: 10, fill: "#ff0000" },
            // Handlebar stem
            { id: "scooter-stem", kind: "rect", x: 50, y: -40, width: 8, height: 80, fill: "#cccccc" },
            // Handlebar
            { id: "scooter-handle", kind: "rect", x: 40, y: -40, width: 28, height: 8, fill: "#000000" },
            // Wheels
            { id: "scooter-w1", kind: "ellipse", x: -20, y: 40, width: 30, height: 30, fill: "#333333" },
            { id: "scooter-w2", kind: "ellipse", x: 50, y: 40, width: 30, height: 30, fill: "#333333" }
          ]
        });
        project.bindings.push({
          layerId: "scooter",
          imageId: "scooter",
          boneId: "root",
          bindOffset: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }
        });

        // Create animation clip
        const clipId = "scooter-clip";
        project.animations = [
          {
            id: clipId,
            name: "Scooter Ride",
            startFrame: 0,
            endFrame: 100,
            tracks: [
              {
                id: "ride-track",
                targetId: "root",
                property: "transform",
                keyframes: [
                  { id: "k1", frame: 0, value: { x: 100, y: 350, rotation: 0, scaleX: 1, scaleY: 1 }, easing: "smooth" },
                  { id: "k2", frame: 100, value: { x: 600, y: 350, rotation: 0, scaleX: 1, scaleY: 1 }, easing: "smooth" }
                ]
              },
              {
                id: "arm-track",
                targetId: "right-arm-bone",
                property: "transform",
                keyframes: [
                  { id: "ak1", frame: 0, value: { x: 0, y: 0, rotation: -1.0, scaleX: 1, scaleY: 1 }, easing: "linear" }
                ]
              }
            ],
            setupPose: {}
          }
        ];
        
        project.timeline.activeAnimationId = clipId;
        project.timeline.endFrame = 100;

        await save(context, input.path, project);
        return jsonToolResult({ success: true, path: input.path });
      }
    }
  ]
});
