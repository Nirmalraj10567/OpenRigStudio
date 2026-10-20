import { readFile, writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments } from '../plugin-api.mjs';

const T = (x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) => ({ x, y, rotation, scaleX, scaleY });

async function load(context, path) {
  try {
    return JSON.parse(await readFile(context.resolvePath(path), 'utf8'));
  } catch {
    return { schemaVersion: 1, id: 'naruto-sasuke', name: 'Naruto vs Sasuke', canvas: { width: 1280, height: 720, background: '#0f172a' }, layers: [], bones: [], bindings: [] };
  }
}

async function save(context, path, project) {
  const output = context.resolvePath(path);
  await writeFile(output, `${JSON.stringify(project, null, 2)}\n`);
  return output;
}

let shapeCounter = 0;
const R = (x, y, width, height, fill, extra = {}) => ({
  id: `ns-s-${++shapeCounter}`,
  kind: 'rect',
  x, y, width, height, fill, ...extra
});
const E = (x, y, radiusX, radiusY, fill, extra = {}) => ({
  id: `ns-s-${++shapeCounter}`,
  kind: 'ellipse',
  x, y, radiusX, radiusY, fill, ...extra
});
const P = (d, fill = 'none', stroke = 'none', strokeWidth = 2, extra = {}) => ({
  id: `ns-s-${++shapeCounter}`,
  kind: 'path',
  d, fill, stroke, strokeWidth, ...extra
});

export default defineMcpPlugin({
  id: 'naruto-sasuke-plugin',
  version: '1.0.0',
  tools: [
    {
      name: 'animate_naruto_sasuke',
      description: 'Creates and animates an epic 5-second anime clash between Naruto Uzumaki (Rasengan) and Sasuke Uchiha (Chidori) at the Final Valley.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          fps: { type: 'integer', default: 24 }
        },
        required: ['path']
      },
      async execute(args, context) {
        const input = objectArguments(args);
        const project = await load(context, input.path);
        const fps = input.fps ?? 24;

        project.canvas = { width: 1280, height: 720, background: '#090d16' };
        project.layers = [];
        project.bones = [];
        project.bindings = [];

        // 1. Dramatic Anime Stormy Sky & Final Valley Waterfall
        project.layers.push({
          id: 'env-anime-sky',
          name: 'Final Valley · Storm Sky & Waterfall',
          type: 'vector',
          local: T(0, 0),
          zIndex: -100,
          opacity: 1,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            // Dark stormy sky gradient
            R(0, 0, 1280, 720, '#0f172a'),
            P('M 0 0 L 1280 0 L 1280 380 Q 640 450 0 380 Z', '#1e1b4b'),
            // Distant lightning bolts
            P('M 620 20 L 590 120 L 640 140 L 580 250', 'none', '#c084fc', 3, { opacity: 0.8 }),
            P('M 320 40 L 350 110 L 330 130 L 370 210', 'none', '#38bdf8', 2.5, { opacity: 0.7 }),
            // Giant Stone Cliffs (Valley of the End)
            P('M 0 160 L 260 220 L 290 560 L 0 600 Z', '#334155'),
            P('M 1280 160 L 1020 220 L 990 560 L 1280 600 Z', '#334155'),
            // Waterfall in Center Gorge
            P('M 580 200 L 700 200 L 720 540 L 560 540 Z', '#38bdf8', '#bae6fd', 2),
            P('M 600 220 L 605 520 M 640 210 L 640 530 M 680 220 L 675 520', 'none', '#ffffff', 2.5, { opacity: 0.6 }),
            // Mist and Water Basin
            P('M 0 520 Q 640 490 1280 520 L 1280 720 L 0 720 Z', '#1e293b'),
            P('M 0 560 Q 640 530 1280 560 L 1280 720 L 0 720 Z', '#0f766e', '#14b8a6', 3)
          ]
        });

        // 2. Speed Lines & Anime Impact Energy (Clash Background)
        project.layers.push({
          id: 'env-speed-lines',
          name: 'Anime Speed & Action Lines',
          type: 'vector',
          local: T(0, 0),
          zIndex: -80,
          opacity: 0,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            P('M 0 200 L 580 440 M 0 350 L 580 450 M 0 500 L 580 460', 'none', '#60a5fa', 4, { opacity: 0.7 }),
            P('M 1280 200 L 700 440 M 1280 350 L 700 450 M 1280 500 L 700 460', 'none', '#c084fc', 4, { opacity: 0.7 }),
            P('M 200 0 L 620 400 M 1080 0 L 660 400', 'none', '#ffffff', 3, { opacity: 0.8 })
          ]
        });

        // 3. Battle Rock Pillars / Platforms
        project.layers.push({
          id: 'env-rock-ground',
          name: 'Battlefield Rocks & Water Surface',
          type: 'vector',
          local: T(0, 0),
          zIndex: -50,
          opacity: 1,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            // Left battle rock (Naruto side)
            P('M 60 520 L 380 520 L 350 620 L 30 620 Z', '#475569', '#64748b', 3),
            // Right battle rock (Sasuke side)
            P('M 900 520 L 1220 520 L 1250 620 L 930 620 Z', '#475569', '#64748b', 3),
            // Water ripples on lake surface
            P('M 400 580 Q 640 560 880 580', 'none', '#67e8f9', 3),
            P('M 450 630 Q 640 610 830 630', 'none', '#bae6fd', 2.5)
          ]
        });

        // 4. Massive Clash Aura & Explosion Spheres (Center stage x: 640, y: 440)
        project.layers.push({
          id: 'layer-clash-energy',
          name: 'Rasengan vs Chidori Energy Clash',
          type: 'vector',
          local: T(640, 440),
          zIndex: 40,
          opacity: 0,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            // Shockwave outer ring
            E(0, 0, 160, 160, 'none', { stroke: '#ffffff', strokeWidth: 8, opacity: 0.9 }),
            E(0, 0, 190, 190, 'none', { stroke: '#67e8f9', strokeWidth: 5, opacity: 0.6 }),
            // Giant energy sphere split (Blue Rasengan Left / Purple Lightning Right)
            P('M 0 -110 A 110 110 0 0 0 0 110 Z', '#38bdf8', '#60a5fa', 4),
            P('M 0 -110 A 110 110 0 0 1 0 110 Z', '#a855f7', '#c084fc', 4),
            // Core White Hot Burst
            E(0, 0, 45, 45, '#ffffff', { stroke: '#fef08a', strokeWidth: 4 }),
            // Crackling Lightning Arcs
            P('M -40 -30 L -10 -90 L 30 -60 L 70 -110', 'none', '#ffffff', 4),
            P('M 40 30 L 10 90 L -30 60 L -70 110', 'none', '#ffffff', 4),
            P('M -90 10 L -40 40 L 40 -40 L 100 -20', 'none', '#67e8f9', 3.5),
            P('M 80 50 L 40 20 L -30 -10 L -100 -40', 'none', '#e879f9', 3.5)
          ]
        });

        // 5. NARUTO RIG & ARTWORK (Left fighter)
        project.bones.push(
          { id: 'naruto-root', name: 'Naruto Root', parentId: null, length: 30, local: T(240, 480) },
          { id: 'naruto-body', name: 'Naruto Torso', parentId: 'naruto-root', length: 50, local: T(0, -30) },
          { id: 'naruto-head', name: 'Naruto Head', parentId: 'naruto-body', length: 40, local: T(15, -45) },
          { id: 'naruto-arm-front', name: 'Naruto Rasengan Arm', parentId: 'naruto-body', length: 50, local: T(25, -15) },
          { id: 'naruto-arm-back', name: 'Naruto Back Arm', parentId: 'naruto-body', length: 45, local: T(-20, -15) },
          { id: 'naruto-leg-front', name: 'Naruto Front Leg', parentId: 'naruto-root', length: 45, local: T(15, 10) },
          { id: 'naruto-leg-back', name: 'Naruto Back Leg', parentId: 'naruto-root', length: 45, local: T(-15, 10) }
        );

        // Naruto Back Arm & Legs (zIndex 10)
        project.layers.push(
          {
            id: 'naruto-layer-arm-back',
            name: 'Naruto Back Arm',
            type: 'vector',
            local: T(0, 0),
            zIndex: 10,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'naruto-arm-back',
            shapes: [
              P('M 0 0 L -30 20 L -50 10', 'none', '#ea580c', 14), // Orange sleeve
              E(-50, 10, 8, 8, '#fcd34d') // Hand
            ]
          },
          {
            id: 'naruto-layer-leg-back',
            name: 'Naruto Back Leg',
            type: 'vector',
            local: T(0, 0),
            zIndex: 10,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'naruto-leg-back',
            shapes: [
              P('M 0 0 L -20 30 L -35 50', 'none', '#ea580c', 16),
              R(-42, 45, 20, 12, '#1e293b') // Blue Ninja Sandal
            ]
          }
        );

        // Naruto Torso & Front Leg (zIndex 15)
        project.layers.push(
          {
            id: 'naruto-layer-body',
            name: 'Naruto Torso & Jacket',
            type: 'vector',
            local: T(0, 0),
            zIndex: 15,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'naruto-body',
            shapes: [
              // Orange Jumpsuit with Blue/White Collar
              R(-18, -25, 36, 50, '#ea580c', { stroke: '#c2410c', strokeWidth: 2 }),
              // Blue shoulder accents
              R(-18, -25, 36, 12, '#1e3a8a'),
              // White neck collar
              P('M -14 -25 L 0 -15 L 14 -25', 'none', '#ffffff', 5),
              // Red Uzumaki Swirl symbol on back
              E(-5, 0, 8, 8, 'none', { stroke: '#dc2626', strokeWidth: 2 })
            ]
          },
          {
            id: 'naruto-layer-leg-front',
            name: 'Naruto Front Leg',
            type: 'vector',
            local: T(0, 0),
            zIndex: 15,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'naruto-leg-front',
            shapes: [
              P('M 0 0 L 25 25 L 35 50', 'none', '#ea580c', 16),
              // Shuriken holster bandage on thigh
              R(10, 18, 14, 10, '#ffffff'),
              R(28, 45, 22, 12, '#1e293b') // Blue Ninja Sandal
            ]
          }
        );

        // Naruto Head & Spiky Blond Hair & Headband (zIndex 20)
        project.layers.push({
          id: 'naruto-layer-head',
          name: 'Naruto Head & Hair',
          type: 'vector',
          local: T(0, 0),
          zIndex: 20,
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: 'naruto-head',
          shapes: [
            // Face
            E(0, 0, 18, 18, '#fcd34d'),
            // Whiskers on cheeks
            P('M -10 -2 L -18 -4 M -10 2 L -18 2 M -10 6 L -18 8', 'none', '#92400e', 1.5),
            P('M 8 -2 L 16 -4 M 8 2 L 16 2 M 8 6 L 16 8', 'none', '#92400e', 1.5),
            // Determined Anime Eye & Brow
            P('M 2 -4 L 14 -2', 'none', '#78350f', 3),
            E(8, 0, 4, 5, '#0284c7'), // Blue eye
            E(9, -1, 1.5, 1.5, '#ffffff'),
            // Determined Mouth (Shouting)
            P('M 4 8 Q 12 16 16 8 Z', '#dc2626', '#78350f', 1.5),
            // Konoha Headband (Blue band + silver metal plate)
            R(-18, -14, 38, 10, '#1e3a8a'),
            R(-8, -13, 22, 8, '#cbd5e1', { stroke: '#64748b', strokeWidth: 1 }),
            // Konoha Leaf Symbol
            P('M 1 -9 Q 6 -7 3 -12', 'none', '#1e293b', 1.5),
            // Iconic Spiky Yellow Hair
            P('M -20 -10 L -30 -25 L -15 -25 L -20 -42 L 0 -30 L 10 -45 L 20 -28 L 30 -38 L 26 -15 L 34 -8 L 22 -6 Z', '#facc15', '#eab308', 2)
          ]
        });

        // Naruto Front Arm with RASENGAN (zIndex 25)
        project.layers.push({
          id: 'naruto-layer-arm-front',
          name: 'Naruto Arm & Rasengan',
          type: 'vector',
          local: T(0, 0),
          zIndex: 25,
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: 'naruto-arm-front',
          shapes: [
            // Thrusting Arm
            P('M 0 0 L 25 5 L 48 0', 'none', '#ea580c', 15),
            E(48, 0, 9, 9, '#fcd34d'),
            // Swirling Chakra Sphere - RASENGAN
            E(65, 0, 24, 24, '#38bdf8', { stroke: '#ffffff', strokeWidth: 3, opacity: 0.85 }),
            E(65, 0, 16, 16, '#93c5fd', { stroke: '#bae6fd', strokeWidth: 2.5 }),
            E(65, 0, 8, 8, '#ffffff'),
            // Swirling Chakra Spirals
            P('M 45 -12 Q 65 -28 85 -10 Q 90 15 65 24 Q 45 15 48 -5', 'none', '#ffffff', 2.5),
            P('M 52 -18 Q 80 -18 80 5 Q 75 22 55 18', 'none', '#60a5fa', 2)
          ]
        });

        // 6. SASUKE RIG & ARTWORK (Right fighter)
        project.bones.push(
          { id: 'sasuke-root', name: 'Sasuke Root', parentId: null, length: 30, local: T(1040, 480) },
          { id: 'sasuke-body', name: 'Sasuke Torso', parentId: 'sasuke-root', length: 50, local: T(0, -30) },
          { id: 'sasuke-head', name: 'Sasuke Head', parentId: 'sasuke-body', length: 40, local: T(-15, -45) },
          { id: 'sasuke-arm-front', name: 'Sasuke Chidori Arm', parentId: 'sasuke-body', length: 50, local: T(-25, -15) },
          { id: 'sasuke-arm-back', name: 'Sasuke Back Arm', parentId: 'sasuke-body', length: 45, local: T(20, -15) },
          { id: 'sasuke-leg-front', name: 'Sasuke Front Leg', parentId: 'sasuke-root', length: 45, local: T(-15, 10) },
          { id: 'sasuke-leg-back', name: 'Sasuke Back Leg', parentId: 'sasuke-root', length: 45, local: T(15, 10) }
        );

        // Sasuke Back Arm & Legs (zIndex 10)
        project.layers.push(
          {
            id: 'sasuke-layer-arm-back',
            name: 'Sasuke Back Arm',
            type: 'vector',
            local: T(0, 0),
            zIndex: 10,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'sasuke-arm-back',
            shapes: [
              P('M 0 0 L 30 20 L 50 10', 'none', '#1e293b', 14),
              E(50, 10, 8, 8, '#fef08a')
            ]
          },
          {
            id: 'sasuke-layer-leg-back',
            name: 'Sasuke Back Leg',
            type: 'vector',
            local: T(0, 0),
            zIndex: 10,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'sasuke-leg-back',
            shapes: [
              P('M 0 0 L 20 30 L 35 50', 'none', '#f8fafc', 15), // White shorts
              R(28, 45, 20, 12, '#0f172a') // Dark Ninja Sandal
            ]
          }
        );

        // Sasuke Torso & Front Leg (zIndex 15)
        project.layers.push(
          {
            id: 'sasuke-layer-body',
            name: 'Sasuke Torso & High Collar Shirt',
            type: 'vector',
            local: T(0, 0),
            zIndex: 15,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'sasuke-body',
            shapes: [
              // Dark Blue/Grey High-Collar Shirt
              R(-18, -25, 36, 50, '#1e293b', { stroke: '#0f172a', strokeWidth: 2 }),
              // High standing collar
              P('M -16 -25 L -20 -40 L 0 -30 L 20 -40 L 16 -25 Z', '#1e293b', '#0f172a', 2),
              // Uchiha Fan symbol on back (Red and White Fan)
              P('M 8 -10 A 6 6 0 0 0 8 2 Z', '#dc2626'),
              P('M 8 2 A 6 6 0 0 0 8 14 Z', '#ffffff')
            ]
          },
          {
            id: 'sasuke-layer-leg-front',
            name: 'Sasuke Front Leg',
            type: 'vector',
            local: T(0, 0),
            zIndex: 15,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'sasuke-leg-front',
            shapes: [
              P('M 0 0 L -25 25 L -35 50', 'none', '#f8fafc', 15),
              // Arm / Leg warmers
              R(-32, 25, 14, 15, '#334155'),
              R(-45, 45, 22, 12, '#0f172a')
            ]
          }
        );

        // Sasuke Head & Spiky Black Hair & Sharingan (zIndex 20)
        project.layers.push({
          id: 'sasuke-layer-head',
          name: 'Sasuke Head & Hair',
          type: 'vector',
          local: T(0, 0),
          zIndex: 20,
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: 'sasuke-head',
          shapes: [
            // Face
            E(0, 0, 18, 18, '#fef08a'),
            // Intense Brow
            P('M -2 -4 L -14 -2', 'none', '#0f172a', 3),
            // Glowing Red SHARINGAN EYE
            E(-8, 0, 4.5, 5.5, '#ef4444', { stroke: '#991b1b', strokeWidth: 1.5 }),
            E(-8, 0, 1.8, 1.8, '#000000'), // Pupil
            // Tomoe dots
            E(-10, -2, 1, 1, '#000000'),
            E(-6, 2, 1, 1, '#000000'),
            // Mouth
            P('M -4 8 Q -12 16 -16 8 Z', '#991b1b', '#0f172a', 1.5),
            // Headband tied on forehead
            R(-18, -14, 38, 9, '#1e293b'),
            R(-14, -13, 20, 7, '#cbd5e1', { stroke: '#475569', strokeWidth: 1 }),
            // Scratched Rogue Line across metal plate
            P('M -14 -9 L 6 -9', 'none', '#dc2626', 1.5),
            // Iconic Spiky Jet-Black Hair with Front Bangs
            P('M 20 -10 L 32 -25 L 18 -28 L 25 -42 L 5 -32 L -5 -46 L -18 -32 L -32 -40 L -25 -18 L -36 -5 L -20 -4 Z', '#0f172a', '#1e1b4b', 2),
            // Front hair bangs framing face
            P('M -14 -12 L -22 6 L -12 -2 M -6 -12 L -14 12 L -6 2', 'none', '#0f172a', 3)
          ]
        });

        // Sasuke Front Arm with CHIDORI (zIndex 25)
        project.layers.push({
          id: 'sasuke-layer-arm-front',
          name: 'Sasuke Arm & Chidori Lightning',
          type: 'vector',
          local: T(0, 0),
          zIndex: 25,
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: 'sasuke-arm-front',
          shapes: [
            // Thrusting Arm
            P('M 0 0 L -25 5 L -48 0', 'none', '#1e293b', 15),
            E(-48, 0, 9, 9, '#fef08a'),
            // Crackling Lightning Sphere - CHIDORI (One Thousand Birds)
            E(-65, 0, 24, 24, '#c084fc', { stroke: '#ffffff', strokeWidth: 3, opacity: 0.85 }),
            E(-65, 0, 15, 15, '#e879f9', { stroke: '#fdf4ff', strokeWidth: 2 }),
            E(-65, 0, 7, 7, '#ffffff'),
            // Piercing jagged electric lightning bolts
            P('M -45 -20 L -65 -35 L -60 -15 L -85 -30', 'none', '#ffffff', 3),
            P('M -50 20 L -70 35 L -65 15 L -90 30', 'none', '#ffffff', 3),
            P('M -75 -15 L -95 0 L -80 15 L -105 0', 'none', '#67e8f9', 3.5),
            P('M -40 -10 L -65 0 L -45 10', 'none', '#c084fc', 2.5)
          ]
        });

        // 7. Bindings
        project.bindings = [
          // Naruto
          { layerId: 'naruto-layer-body', imageId: 'naruto-layer-body', boneId: 'naruto-body', bindOffset: T(0, 0) },
          { layerId: 'naruto-layer-head', imageId: 'naruto-layer-head', boneId: 'naruto-head', bindOffset: T(0, 0) },
          { layerId: 'naruto-layer-arm-front', imageId: 'naruto-layer-arm-front', boneId: 'naruto-arm-front', bindOffset: T(0, 0) },
          { layerId: 'naruto-layer-arm-back', imageId: 'naruto-layer-arm-back', boneId: 'naruto-arm-back', bindOffset: T(0, 0) },
          { layerId: 'naruto-layer-leg-front', imageId: 'naruto-layer-leg-front', boneId: 'naruto-leg-front', bindOffset: T(0, 0) },
          { layerId: 'naruto-layer-leg-back', imageId: 'naruto-layer-leg-back', boneId: 'naruto-leg-back', bindOffset: T(0, 0) },
          // Sasuke
          { layerId: 'sasuke-layer-body', imageId: 'sasuke-layer-body', boneId: 'sasuke-body', bindOffset: T(0, 0) },
          { layerId: 'sasuke-layer-head', imageId: 'sasuke-layer-head', boneId: 'sasuke-head', bindOffset: T(0, 0) },
          { layerId: 'sasuke-layer-arm-front', imageId: 'sasuke-layer-arm-front', boneId: 'sasuke-arm-front', bindOffset: T(0, 0) },
          { layerId: 'sasuke-layer-arm-back', imageId: 'sasuke-layer-arm-back', boneId: 'sasuke-arm-back', bindOffset: T(0, 0) },
          { layerId: 'sasuke-layer-leg-front', imageId: 'sasuke-layer-leg-front', boneId: 'sasuke-leg-front', bindOffset: T(0, 0) },
          { layerId: 'sasuke-layer-leg-back', imageId: 'sasuke-layer-leg-back', boneId: 'sasuke-leg-back', bindOffset: T(0, 0) }
        ];

        // 8. ANIMATION CHOREOGRAPHY (5 SECONDS = 120 FRAMES @ 24 FPS)
        const totalDurationSec = 5;
        const totalFrames = totalDurationSec * fps; // 120 frames

        const chargeEndFrame = 28;  // ~1.15s (Charging chakra)
        const clashStartFrame = 58; // ~2.4s (Mid-air collision)
        const clashEndFrame = 92;   // ~3.8s (Energy explosion)

        // Naruto Tracks
        const nRootKeys = [];
        const nArmFKeys = [];
        const nArmBKeys = [];
        const nLegFKeys = [];
        const nLegBKeys = [];

        // Sasuke Tracks
        const sRootKeys = [];
        const sArmFKeys = [];
        const sArmBKeys = [];
        const sLegFKeys = [];
        const sLegBKeys = [];

        // Clash & FX Tracks
        const speedLinesOpacityKeys = [];
        const clashTransformKeys = [];
        const clashOpacityKeys = [];

        for (let frame = 0; frame <= totalFrames; frame++) {
          const timeSec = frame / fps;

          // Phase 1: Combat Stance & Chakra Charge (0 - 1.15s)
          if (frame <= chargeEndFrame) {
            const chargeT = frame / chargeEndFrame;
            // Naruto charging Rasengan
            const nVibe = Math.sin(timeSec * 35) * 2;
            nRootKeys.push({ id: `k-nr-${frame}`, frame, value: T(240, 480 + nVibe, 0.1), easing: 'linear' });
            nArmFKeys.push({ id: `k-na-${frame}`, frame, value: T(25, -15, -0.2 + Math.sin(timeSec * 20) * 0.15), easing: 'linear' });
            nArmBKeys.push({ id: `k-nab-${frame}`, frame, value: T(-20, -15, 0.4), easing: 'linear' });
            nLegFKeys.push({ id: `k-nlf-${frame}`, frame, value: T(15, 10, -0.2), easing: 'linear' });
            nLegBKeys.push({ id: `k-nlb-${frame}`, frame, value: T(-15, 10, 0.3), easing: 'linear' });

            // Sasuke charging Chidori
            const sVibe = Math.sin(timeSec * 35 + 1) * 2;
            sRootKeys.push({ id: `k-sr-${frame}`, frame, value: T(1040, 480 + sVibe, -0.1), easing: 'linear' });
            sArmFKeys.push({ id: `k-sa-${frame}`, frame, value: T(-25, -15, 0.2 + Math.sin(timeSec * 20) * 0.15), easing: 'linear' });
            sArmBKeys.push({ id: `k-sab-${frame}`, frame, value: T(20, -15, -0.4), easing: 'linear' });
            sLegFKeys.push({ id: `k-slf-${frame}`, frame, value: T(-15, 10, 0.2), easing: 'linear' });
            sLegBKeys.push({ id: `k-slb-${frame}`, frame, value: T(15, 10, -0.3), easing: 'linear' });

            speedLinesOpacityKeys.push({ id: `k-sl-${frame}`, frame, value: chargeT * 0.4, easing: 'linear' });
            clashTransformKeys.push({ id: `k-ct-${frame}`, frame, value: T(0, 0, 0, 0.01, 0.01), easing: 'step' });
            clashOpacityKeys.push({ id: `k-co-${frame}`, frame, value: 0, easing: 'step' });
          }
          // Phase 2: High Speed Sprint & Leap towards center (1.15s - 2.4s)
          else if (frame < clashStartFrame) {
            const rushT = (frame - chargeEndFrame) / (clashStartFrame - chargeEndFrame);
            const easeRush = rushT * rushT; // Accelerate

            // Naruto leaps up from x: 240 to clash point x: 575, y: 440
            const nX = 240 + (575 - 240) * easeRush;
            const nJump = Math.sin(rushT * Math.PI) * 70;
            nRootKeys.push({ id: `k-nr-${frame}`, frame, value: T(nX, 480 - nJump, 0.35), easing: 'linear' });
            nArmFKeys.push({ id: `k-na-${frame}`, frame, value: T(25, -15, -0.6), easing: 'linear' });
            nArmBKeys.push({ id: `k-nab-${frame}`, frame, value: T(-20, -15, 0.8), easing: 'linear' });
            nLegFKeys.push({ id: `k-nlf-${frame}`, frame, value: T(15, 10, -0.5), easing: 'linear' });
            nLegBKeys.push({ id: `k-nlb-${frame}`, frame, value: T(-15, 10, 0.7), easing: 'linear' });

            // Sasuke leaps up from x: 1040 to clash point x: 705, y: 440
            const sX = 1040 + (705 - 1040) * easeRush;
            const sJump = Math.sin(rushT * Math.PI) * 70;
            sRootKeys.push({ id: `k-sr-${frame}`, frame, value: T(sX, 480 - sJump, -0.35), easing: 'linear' });
            sArmFKeys.push({ id: `k-sa-${frame}`, frame, value: T(-25, -15, 0.6), easing: 'linear' });
            sArmBKeys.push({ id: `k-sab-${frame}`, frame, value: T(20, -15, -0.8), easing: 'linear' });
            sLegFKeys.push({ id: `k-slf-${frame}`, frame, value: T(-15, 10, 0.5), easing: 'linear' });
            sLegBKeys.push({ id: `k-slb-${frame}`, frame, value: T(15, 10, -0.7), easing: 'linear' });

            speedLinesOpacityKeys.push({ id: `k-sl-${frame}`, frame, value: 0.9, easing: 'linear' });
            clashTransformKeys.push({ id: `k-ct-${frame}`, frame, value: T(0, 0, 0, 0.1, 0.1), easing: 'linear' });
            clashOpacityKeys.push({ id: `k-co-${frame}`, frame, value: rushT * 0.3, easing: 'linear' });
          }
          // Phase 3: EPIC MID-AIR CLASH (2.4s - 3.8s) - Rasengan vs Chidori explosion!
          else if (frame <= clashEndFrame) {
            const clashTime = (frame - clashStartFrame) / (clashEndFrame - clashStartFrame);
            // Intense screen shake at collision
            const shakeX = Math.sin(timeSec * 50) * 8;
            const shakeY = Math.cos(timeSec * 60) * 8;

            nRootKeys.push({ id: `k-nr-${frame}`, frame, value: T(575 + shakeX, 440 + shakeY, 0.4), easing: 'linear' });
            nArmFKeys.push({ id: `k-na-${frame}`, frame, value: T(25, -15, -0.7 + Math.sin(timeSec * 30) * 0.1), easing: 'linear' });
            nArmBKeys.push({ id: `k-nab-${frame}`, frame, value: T(-20, -15, 0.9), easing: 'linear' });
            nLegFKeys.push({ id: `k-nlf-${frame}`, frame, value: T(15, 10, -0.6), easing: 'linear' });
            nLegBKeys.push({ id: `k-nlb-${frame}`, frame, value: T(-15, 10, 0.8), easing: 'linear' });

            sRootKeys.push({ id: `k-sr-${frame}`, frame, value: T(705 - shakeX, 440 - shakeY, -0.4), easing: 'linear' });
            sArmFKeys.push({ id: `k-sa-${frame}`, frame, value: T(-25, -15, 0.7 - Math.sin(timeSec * 30) * 0.1), easing: 'linear' });
            sArmBKeys.push({ id: `k-sab-${frame}`, frame, value: T(20, -15, -0.9), easing: 'linear' });
            sLegFKeys.push({ id: `k-slf-${frame}`, frame, value: T(-15, 10, 0.6), easing: 'linear' });
            sLegBKeys.push({ id: `k-slb-${frame}`, frame, value: T(15, 10, -0.8), easing: 'linear' });

            speedLinesOpacityKeys.push({ id: `k-sl-${frame}`, frame, value: 1.0, easing: 'linear' });

            // Expanding and rotating massive energy sphere
            const sphereScale = 0.8 + clashTime * 1.5;
            const sphereRot = timeSec * 15;
            clashTransformKeys.push({ id: `k-ct-${frame}`, frame, value: T(shakeX * 0.5, shakeY * 0.5, sphereRot, sphereScale, sphereScale), easing: 'linear' });
            clashOpacityKeys.push({ id: `k-co-${frame}`, frame, value: 1.0, easing: 'linear' });
          }
          // Phase 4: Shockwave Explosion & Dramatic Rebound (3.8s - 5.0s)
          else {
            const reboundT = (frame - clashEndFrame) / (totalFrames - clashEndFrame);
            const easeRebound = Math.sin((reboundT * Math.PI) / 2);

            // Naruto blown backwards to left
            const nX = 575 - easeRebound * 260;
            const nY = 440 + easeRebound * 50;
            nRootKeys.push({ id: `k-nr-${frame}`, frame, value: T(nX, nY, 0.4 - easeRebound * 0.3), easing: 'linear' });
            nArmFKeys.push({ id: `k-na-${frame}`, frame, value: T(25, -15, -0.3), easing: 'linear' });
            nArmBKeys.push({ id: `k-nab-${frame}`, frame, value: T(-20, -15, 0.3), easing: 'linear' });
            nLegFKeys.push({ id: `k-nlf-${frame}`, frame, value: T(15, 10, -0.1), easing: 'linear' });
            nLegBKeys.push({ id: `k-nlb-${frame}`, frame, value: T(-15, 10, 0.2), easing: 'linear' });

            // Sasuke blown backwards to right
            const sX = 705 + easeRebound * 260;
            const sY = 440 + easeRebound * 50;
            sRootKeys.push({ id: `k-sr-${frame}`, frame, value: T(sX, sY, -0.4 + easeRebound * 0.3), easing: 'linear' });
            sArmFKeys.push({ id: `k-sa-${frame}`, frame, value: T(-25, -15, 0.3), easing: 'linear' });
            sArmBKeys.push({ id: `k-sab-${frame}`, frame, value: T(20, -15, -0.3), easing: 'linear' });
            sLegFKeys.push({ id: `k-slf-${frame}`, frame, value: T(-15, 10, 0.1), easing: 'linear' });
            sLegBKeys.push({ id: `k-slb-${frame}`, frame, value: T(15, 10, -0.2), easing: 'linear' });

            speedLinesOpacityKeys.push({ id: `k-sl-${frame}`, frame, value: Math.max(0, 1 - easeRebound), easing: 'linear' });

            // Energy sphere expands rapidly and fades
            const sphereScale = 2.3 + easeRebound * 2.0;
            clashTransformKeys.push({ id: `k-ct-${frame}`, frame, value: T(0, 0, timeSec * 5, sphereScale, sphereScale), easing: 'linear' });
            clashOpacityKeys.push({ id: `k-co-${frame}`, frame, value: Math.max(0, (1 - easeRebound) * 0.9), easing: 'linear' });
          }
        }

        // 9. Particle Physics Emitters for Chakra Sparks
        project.dynamics = {
          enabled: true,
          startFrame: 0,
          endFrame: totalFrames,
          fps,
          substeps: 4,
          gravityX: 0,
          gravityY: 100,
          windX: 0,
          windY: -50,
          windNoise: 80,
          seed: 99,
          bones: [],
          bodies: [],
          meshes: [],
          emitters: [
            {
              id: 'emitter-chakra-sparks',
              name: 'Rasengan Chakra Sparks',
              enabled: true,
              x: 610,
              y: 440,
              rate: 55,
              lifetime: 0.8,
              speed: 160,
              spread: Math.PI * 2,
              direction: 0,
              size: 4,
              color: '#38bdf8'
            },
            {
              id: 'emitter-lightning-sparks',
              name: 'Chidori Lightning Sparks',
              enabled: true,
              x: 670,
              y: 440,
              rate: 55,
              lifetime: 0.8,
              speed: 180,
              spread: Math.PI * 2,
              direction: 0,
              size: 4.5,
              color: '#c084fc'
            }
          ]
        };

        const clipId = 'naruto-vs-sasuke-clash';
        project.animations = [
          {
            id: clipId,
            name: 'Rasengan vs Chidori Clash',
            fps,
            startFrame: 0,
            endFrame: totalFrames,
            loopMode: 'once',
            tracks: [
              // Naruto
              { id: 'track-naruto-root', targetId: 'naruto-root', property: 'transform', keyframes: nRootKeys },
              { id: 'track-naruto-arm-f', targetId: 'naruto-arm-front', property: 'transform', keyframes: nArmFKeys },
              { id: 'track-naruto-arm-b', targetId: 'naruto-arm-back', property: 'transform', keyframes: nArmBKeys },
              { id: 'track-naruto-leg-f', targetId: 'naruto-leg-front', property: 'transform', keyframes: nLegFKeys },
              { id: 'track-naruto-leg-b', targetId: 'naruto-leg-back', property: 'transform', keyframes: nLegBKeys },
              // Sasuke
              { id: 'track-sasuke-root', targetId: 'sasuke-root', property: 'transform', keyframes: sRootKeys },
              { id: 'track-sasuke-arm-f', targetId: 'sasuke-arm-front', property: 'transform', keyframes: sArmFKeys },
              { id: 'track-sasuke-arm-b', targetId: 'sasuke-arm-back', property: 'transform', keyframes: sArmBKeys },
              { id: 'track-sasuke-leg-f', targetId: 'sasuke-leg-front', property: 'transform', keyframes: sLegFKeys },
              { id: 'track-sasuke-leg-b', targetId: 'sasuke-leg-back', property: 'transform', keyframes: sLegBKeys },
              // Clash & FX
              { id: 'track-speed-lines', targetId: 'env-speed-lines', property: 'opacity', keyframes: speedLinesOpacityKeys },
              { id: 'track-clash-t', targetId: 'layer-clash-energy', property: 'transform', keyframes: clashTransformKeys },
              { id: 'track-clash-o', targetId: 'layer-clash-energy', property: 'opacity', keyframes: clashOpacityKeys }
            ],
            setupPose: {}
          }
        ];

        project.timeline = {
          currentFrame: 0,
          currentTime: 0,
          isPlaying: false,
          loop: false,
          fps,
          startFrame: 0,
          endFrame: totalFrames,
          activeAnimationId: clipId
        };

        await save(context, input.path, project);
        return jsonToolResult({
          success: true,
          path: input.path,
          totalFrames,
          durationSeconds: totalDurationSec,
          layers: project.layers.length,
          bones: project.bones.length
        });
      }
    }
  ]
});
