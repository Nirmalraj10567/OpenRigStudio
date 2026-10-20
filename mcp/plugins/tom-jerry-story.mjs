import { readFile, writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments } from '../plugin-api.mjs';

const T = (x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) => ({ x, y, rotation, scaleX, scaleY });

async function load(context, path) {
  try {
    return JSON.parse(await readFile(context.resolvePath(path), 'utf8'));
  } catch {
    return { schemaVersion: 1, id: 'tom-jerry', name: 'Tom and Jerry Chase', canvas: { width: 1280, height: 720, background: '#fef08a' }, layers: [], bones: [], bindings: [] };
  }
}

async function save(context, path, project) {
  const output = context.resolvePath(path);
  await writeFile(output, `${JSON.stringify(project, null, 2)}\n`);
  return output;
}

let shapeCounter = 0;
const R = (x, y, width, height, fill, extra = {}) => ({
  id: `tj-s-${++shapeCounter}`,
  kind: 'rect',
  x, y, width, height, fill, ...extra
});
const E = (x, y, radiusX, radiusY, fill, extra = {}) => ({
  id: `tj-s-${++shapeCounter}`,
  kind: 'ellipse',
  x, y, radiusX, radiusY, fill, ...extra
});
const P = (d, fill = 'none', stroke = 'none', strokeWidth = 2, extra = {}) => ({
  id: `tj-s-${++shapeCounter}`,
  kind: 'path',
  d, fill, stroke, strokeWidth, ...extra
});

export default defineMcpPlugin({
  id: 'tom-jerry-plugin',
  version: '1.0.0',
  tools: [
    {
      name: 'animate_tom_and_jerry',
      description: 'Creates and animates a classic 5-second slapstick Tom and Jerry chase scene with seamlessly attached limbs, running legs, cheese, frying pan, skids, and mouse hole dive.',
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

        project.canvas = { width: 1280, height: 720, background: '#fef08a' };
        project.layers = [];
        project.bones = [];
        project.bindings = [];

        // 1. Classic Living Room Background (Striped wall, wood floor, baseboard, mouse hole)
        project.layers.push({
          id: 'env-living-room',
          name: 'Living Room Background & Mouse Hole',
          type: 'vector',
          local: T(0, 0),
          zIndex: -100,
          opacity: 1,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            // Yellow pastel wallpaper
            R(0, 0, 1280, 520, '#fef08a'),
            // Wallpaper stripes
            ...[80, 200, 320, 440, 560, 680, 800, 920, 1040, 1160].map(x => R(x, 0, 40, 520, '#fde047', { opacity: 0.35 })),
            // Picture frame on wall
            R(580, 100, 120, 90, '#78350f'),
            R(590, 110, 100, 70, '#bae6fd'),
            E(640, 145, 25, 20, '#f43f5e'),
            // Wooden Skirting Board / Baseboard
            R(0, 480, 1280, 50, '#92400e'),
            R(0, 480, 1280, 8, '#78350f'),
            // Wooden Floor
            R(0, 530, 1280, 190, '#b45309'),
            // Floor plank lines
            R(0, 570, 1280, 3, '#78350f'),
            R(0, 620, 1280, 3, '#78350f'),
            R(0, 670, 1280, 3, '#78350f'),
            // Oval living room rug
            E(640, 610, 280, 75, '#ef4444', { stroke: '#fbbf24', strokeWidth: 5 }),
            E(640, 610, 240, 60, '#b91c1c'),
            // Jerry's Mouse Hole on left wall
            P('M 90 530 L 90 480 Q 120 440 150 480 L 150 530 Z', '#1e1b4b', '#78350f', 4)
          ]
        });

        // 2. Cartoon Dust Clouds & Skid Smoke
        project.layers.push({
          id: 'layer-dust-clouds',
          name: 'Running Dust & Skid Smoke',
          type: 'vector',
          local: T(0, 0),
          zIndex: -20,
          opacity: 0.8,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            E(0, 0, 28, 22, '#f8fafc', { opacity: 0.85 }),
            E(-18, 5, 20, 16, '#f1f5f9', { opacity: 0.8 }),
            E(18, 5, 22, 18, '#f1f5f9', { opacity: 0.8 }),
            E(-30, 10, 14, 12, '#e2e8f0', { opacity: 0.7 })
          ]
        });

        // 3. Impact Stars & Daze FX (when Tom hits wall)
        project.layers.push({
          id: 'layer-impact-stars',
          name: 'Comedic Impact Stars',
          type: 'vector',
          local: T(150, 420),
          zIndex: 60,
          opacity: 0,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            P('M 0 -25 L 8 -8 L 26 -8 L 12 4 L 18 22 L 0 10 L -18 22 L -12 4 L -26 -8 L -8 -8 Z', '#facc15', '#ea580c', 2),
            P('M -40 -35 L -34 -22 L -20 -22 L -30 -12 L -26 0 L -40 -8 L -54 0 L -50 -12 L -60 -22 L -46 -22 Z', '#38bdf8', '#0284c7', 2),
            P('M 40 -35 L 46 -22 L 60 -22 L 50 -12 L 54 0 L 40 -8 L 26 0 L 30 -12 L 20 -22 L 34 -22 Z', '#f43f5e', '#be123c', 2),
            E(-25, -60, 10, 7, '#fef08a'),
            E(25, -60, 10, 7, '#fef08a')
          ]
        });

        // 4. JERRY MOUSE RIG (Seamless body-leg connectivity)
        project.bones.push(
          { id: 'jerry-root', name: 'Jerry Root', parentId: null, length: 15, local: T(400, 540) },
          { id: 'jerry-body', name: 'Jerry Body', parentId: 'jerry-root', length: 25, local: T(0, -12) },
          { id: 'jerry-head', name: 'Jerry Head', parentId: 'jerry-body', length: 20, local: T(12, -22) },
          { id: 'jerry-arm', name: 'Jerry Arm & Cheese', parentId: 'jerry-body', length: 20, local: T(12, -8) },
          { id: 'jerry-tail', name: 'Jerry Tail', parentId: 'jerry-root', length: 25, local: T(-16, -4) },
          { id: 'jerry-leg-l', name: 'Jerry Leg Left', parentId: 'jerry-root', length: 18, local: T(6, 4) },
          { id: 'jerry-leg-r', name: 'Jerry Leg Right', parentId: 'jerry-root', length: 18, local: T(-6, 4) }
        );

        // Jerry Layers
        project.layers.push(
          {
            id: 'jerry-layer-tail',
            name: 'Jerry Tail',
            type: 'vector',
            local: T(0, 0),
            zIndex: 19,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'jerry-tail',
            shapes: [
              P('M 0 0 Q -25 -15 -20 -35 Q -15 -50 -5 -35', 'none', '#b45309', 3.5)
            ]
          },
          {
            id: 'jerry-layer-leg-r',
            name: 'Jerry Leg Right (Back)',
            type: 'vector',
            local: T(0, 0),
            zIndex: 20,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'jerry-leg-r',
            shapes: [
              P('M 0 -4 L -4 12 L 6 16', 'none', '#92400e', 7),
              E(6, 16, 7, 4, '#fbcfe8')
            ]
          },
          {
            id: 'jerry-layer-body',
            name: 'Jerry Body',
            type: 'vector',
            local: T(0, 0),
            zIndex: 25,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'jerry-body',
            shapes: [
              E(0, 0, 22, 28, '#b45309', { stroke: '#78350f', strokeWidth: 2 }),
              E(4, 2, 14, 18, '#fef08a')
            ]
          },
          {
            id: 'jerry-layer-leg-l',
            name: 'Jerry Leg Left (Front)',
            type: 'vector',
            local: T(0, 0),
            zIndex: 26,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'jerry-leg-l',
            shapes: [
              P('M 0 -4 L 6 12 L 16 16', 'none', '#b45309', 8),
              E(16, 16, 8, 4.5, '#fbcfe8')
            ]
          },
          {
            id: 'jerry-layer-head',
            name: 'Jerry Head & Big Ears',
            type: 'vector',
            local: T(0, 0),
            zIndex: 28,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'jerry-head',
            shapes: [
              E(-12, -22, 16, 16, '#b45309'),
              E(-12, -22, 10, 10, '#fbcfe8'),
              E(10, -24, 16, 16, '#b45309'),
              E(10, -24, 10, 10, '#fbcfe8'),
              E(0, 0, 20, 18, '#b45309', { stroke: '#78350f', strokeWidth: 1.5 }),
              E(8, 4, 14, 10, '#fef08a'),
              E(18, 2, 3.5, 3, '#0f172a'),
              E(6, -6, 5, 8, '#ffffff'),
              E(7, -6, 2.5, 4.5, '#0284c7'),
              E(7, -7, 1, 1.5, '#ffffff'),
              P('M 4 8 Q 12 14 18 6', 'none', '#78350f', 2),
              P('M 12 6 L 26 4 M 12 8 L 26 10', 'none', '#78350f', 1)
            ]
          },
          {
            id: 'jerry-layer-cheese',
            name: 'Jerry Arms & Golden Cheese',
            type: 'vector',
            local: T(0, 0),
            zIndex: 30,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'jerry-arm',
            shapes: [
              P('M -4 5 L 12 5', 'none', '#b45309', 6),
              P('M 12 -15 L 42 0 L 12 15 Z', '#facc15', '#ea580c', 2),
              E(22, 0, 4, 3, '#ca8a04'),
              E(30, -2, 2.5, 2, '#ca8a04'),
              E(20, 6, 3, 2, '#ca8a04'),
              E(35, 3, 2, 2, '#ca8a04')
            ]
          }
        );

        // 5. TOM CAT RIG (Direct Torso-to-Legs Socket Connection)
        project.bones.push(
          { id: 'tom-root', name: 'Tom Root', parentId: null, length: 30, local: T(150, 480) },
          { id: 'tom-body', name: 'Tom Torso', parentId: 'tom-root', length: 70, local: T(0, 0) },
          { id: 'tom-head', name: 'Tom Head', parentId: 'tom-body', length: 45, local: T(25, -95) },
          { id: 'tom-arm-pan', name: 'Tom Frying Pan Arm', parentId: 'tom-body', length: 60, local: T(25, -60) },
          { id: 'tom-arm-claw', name: 'Tom Left Claw Arm', parentId: 'tom-body', length: 50, local: T(-20, -60) },
          { id: 'tom-tail', name: 'Tom Tail', parentId: 'tom-root', length: 55, local: T(-25, -15) },
          // Legs pivot right at the lower hip joint (y: 0 relative to tom-root)
          { id: 'tom-leg-l', name: 'Tom Leg Left (Front)', parentId: 'tom-root', length: 60, local: T(12, 0) },
          { id: 'tom-leg-r', name: 'Tom Leg Right (Back)', parentId: 'tom-root', length: 60, local: T(-12, 0) }
        );

        // Tom Layers
        project.layers.push(
          {
            id: 'tom-layer-tail',
            name: 'Tom Tail',
            type: 'vector',
            local: T(0, 0),
            zIndex: 14,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'tom-tail',
            shapes: [
              P('M 0 0 Q -50 -40 -30 -80 Q -10 -110 -25 -130', 'none', '#64748b', 12),
              E(-25, -130, 8, 8, '#f8fafc')
            ]
          },
          // Back Leg: starts INSIDE the hip socket (y: -15) and flows down to paw
          {
            id: 'tom-layer-leg-r',
            name: 'Tom Leg Right (Back)',
            type: 'vector',
            local: T(0, 0),
            zIndex: 16,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'tom-leg-r',
            shapes: [
              // Upper thigh overlapping inside hip + shin
              P('M 0 -15 L -10 25 L -15 65', 'none', '#475569', 22),
              // White paw
              E(-10, 68, 18, 10, '#f8fafc', { stroke: '#334155', strokeWidth: 1.5 })
            ]
          },
          // Torso: centered at y: -45, extending down past y: 0 to y: +15, seamlessly covering hips
          {
            id: 'tom-layer-body',
            name: 'Tom Torso',
            type: 'vector',
            local: T(0, 0),
            zIndex: 24,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'tom-body',
            shapes: [
              // Smooth blue-grey body
              E(0, -45, 36, 55, '#64748b', { stroke: '#475569', strokeWidth: 2 }),
              // Lower pelvis belly patch to seal connection
              E(0, -10, 28, 25, '#64748b'),
              // White chest and belly patch
              E(8, -38, 22, 40, '#f8fafc')
            ]
          },
          // Front Leg: starts INSIDE the hip socket (y: -15) and flows down to paw
          {
            id: 'tom-layer-leg-l',
            name: 'Tom Leg Left (Front)',
            type: 'vector',
            local: T(0, 0),
            zIndex: 26,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'tom-leg-l',
            shapes: [
              // Upper thigh overlapping inside hip + shin
              P('M 0 -15 L 15 25 L 25 65', 'none', '#64748b', 24),
              // White paw
              E(30, 68, 18, 10, '#f8fafc', { stroke: '#475569', strokeWidth: 1.5 })
            ]
          },
          {
            id: 'tom-layer-arm-claw',
            name: 'Tom Reaching Claw Arm',
            type: 'vector',
            local: T(0, 0),
            zIndex: 30,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'tom-arm-claw',
            shapes: [
              P('M 0 0 L 40 -10 L 70 -5', 'none', '#64748b', 18),
              E(75, -5, 12, 10, '#f8fafc'),
              P('M 82 -10 L 90 -12 M 85 -5 L 94 -6 M 82 0 L 90 2', 'none', '#ffffff', 2.5)
            ]
          },
          {
            id: 'tom-layer-head',
            name: 'Tom Head & Furious Face',
            type: 'vector',
            local: T(0, 0),
            zIndex: 35,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'tom-head',
            shapes: [
              P('M -22 -20 L -35 -55 L -6 -35 Z', '#64748b', '#475569', 2),
              P('M -20 -24 L -28 -48 L -10 -34 Z', '#f472b6'),
              P('M 12 -25 L 30 -58 L 26 -22 Z', '#64748b', '#475569', 2),
              P('M 14 -28 L 25 -50 L 22 -26 Z', '#f472b6'),
              E(0, 0, 32, 28, '#64748b', { stroke: '#475569', strokeWidth: 2 }),
              E(8, 8, 22, 14, '#f8fafc'),
              P('M 12 2 L 18 2 L 15 7 Z', '#0f172a'),
              E(0, -10, 8, 12, '#fef08a', { stroke: '#ea580c', strokeWidth: 1.5 }),
              E(2, -10, 3, 7, '#0f172a'),
              E(14, -10, 8, 12, '#fef08a', { stroke: '#ea580c', strokeWidth: 1.5 }),
              E(16, -10, 3, 7, '#0f172a'),
              P('M 4 12 Q 16 28 26 10 Z', '#991b1b', '#0f172a', 2),
              P('M 6 12 L 9 17 L 12 12 M 16 12 L 19 17 L 22 12', 'none', '#ffffff', 2),
              P('M 22 6 L 45 2 M 22 10 L 48 10 M 22 14 L 45 18', 'none', '#ffffff', 2)
            ]
          },
          {
            id: 'tom-layer-pan',
            name: 'Tom Arm with Frying Pan',
            type: 'vector',
            local: T(0, 0),
            zIndex: 40,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'tom-arm-pan',
            shapes: [
              P('M 0 0 L 35 -20 L 60 -40', 'none', '#64748b', 18),
              E(60, -40, 10, 10, '#f8fafc'),
              R(60, -45, 30, 8, '#78350f'),
              E(115, -41, 32, 32, '#1e293b', { stroke: '#475569', strokeWidth: 4 }),
              E(115, -41, 25, 25, '#0f172a')
            ]
          }
        );

        // 6. Bindings
        project.bindings = [
          // Jerry
          { layerId: 'jerry-layer-tail', imageId: 'jerry-layer-tail', boneId: 'jerry-tail', bindOffset: T(0, 0) },
          { layerId: 'jerry-layer-leg-l', imageId: 'jerry-layer-leg-l', boneId: 'jerry-leg-l', bindOffset: T(0, 0) },
          { layerId: 'jerry-layer-leg-r', imageId: 'jerry-layer-leg-r', boneId: 'jerry-leg-r', bindOffset: T(0, 0) },
          { layerId: 'jerry-layer-body', imageId: 'jerry-layer-body', boneId: 'jerry-body', bindOffset: T(0, 0) },
          { layerId: 'jerry-layer-head', imageId: 'jerry-layer-head', boneId: 'jerry-head', bindOffset: T(0, 0) },
          { layerId: 'jerry-layer-cheese', imageId: 'jerry-layer-cheese', boneId: 'jerry-arm', bindOffset: T(0, 0) },
          // Tom
          { layerId: 'tom-layer-tail', imageId: 'tom-layer-tail', boneId: 'tom-tail', bindOffset: T(0, 0) },
          { layerId: 'tom-layer-leg-l', imageId: 'tom-layer-leg-l', boneId: 'tom-leg-l', bindOffset: T(0, 0) },
          { layerId: 'tom-layer-leg-r', imageId: 'tom-layer-leg-r', boneId: 'tom-leg-r', bindOffset: T(0, 0) },
          { layerId: 'tom-layer-body', imageId: 'tom-layer-body', boneId: 'tom-body', bindOffset: T(0, 0) },
          { layerId: 'tom-layer-arm-claw', imageId: 'tom-layer-arm-claw', boneId: 'tom-arm-claw', bindOffset: T(0, 0) },
          { layerId: 'tom-layer-head', imageId: 'tom-layer-head', boneId: 'tom-head', bindOffset: T(0, 0) },
          { layerId: 'tom-layer-pan', imageId: 'tom-layer-pan', boneId: 'tom-arm-pan', bindOffset: T(0, 0) }
        ];

        // 7. ANIMATION CHOREOGRAPHY (5 SECONDS = 120 FRAMES @ 24 FPS)
        const totalDurationSec = 5;
        const totalFrames = totalDurationSec * fps;

        const forwardSec = 2.0;
        const forwardFrame = Math.round(forwardSec * fps);
        const skidSec = 2.8;
        const skidFrame = Math.round(skidSec * fps);
        const escapeSec = 4.2;
        const escapeFrame = Math.round(escapeSec * fps);

        // Jerry Tracks
        const jRootKeys = [];
        const jHeadKeys = [];
        const jArmKeys = [];
        const jTailKeys = [];
        const jLegLKeys = [];
        const jLegRKeys = [];

        // Tom Tracks
        const tRootKeys = [];
        const tHeadKeys = [];
        const tPanKeys = [];
        const tClawKeys = [];
        const tTailKeys = [];
        const tLegLKeys = [];
        const tLegRKeys = [];

        // FX Tracks
        const dustKeys = [];
        const dustOpacityKeys = [];
        const starsOpacityKeys = [];
        const starsTransformKeys = [];

        const jRunRate = 7.0;
        const tRunRate = 4.5;

        for (let frame = 0; frame <= totalFrames; frame++) {
          const timeSec = frame / fps;

          // Phase 1: High-Speed Dash from Left to Right (0 - 2.0s)
          if (frame <= forwardFrame) {
            const p1 = frame / forwardFrame;
            const jX = 350 + p1 * 720;
            const tX = 80 + p1 * 700;

            const jBounce = Math.abs(Math.sin(timeSec * jRunRate * Math.PI * 2)) * 14;
            const jLegPhase = Math.sin(timeSec * jRunRate * Math.PI * 2) * 1.1;
            jRootKeys.push({ id: `k-jr-${frame}`, frame, value: T(jX, 540 - jBounce, 0.15, 1, 1), easing: 'linear' });
            jHeadKeys.push({ id: `k-jh-${frame}`, frame, value: T(12, -22, -0.25 + Math.sin(timeSec * 25) * 0.1), easing: 'linear' });
            jArmKeys.push({ id: `k-ja-${frame}`, frame, value: T(12, -8, Math.sin(timeSec * 30) * 0.3), easing: 'linear' });
            jTailKeys.push({ id: `k-jt-${frame}`, frame, value: T(-16, -4, Math.sin(timeSec * 25) * 0.4), easing: 'linear' });
            jLegLKeys.push({ id: `k-jll-${frame}`, frame, value: T(6, 4, jLegPhase), easing: 'linear' });
            jLegRKeys.push({ id: `k-jlr-${frame}`, frame, value: T(-6, 4, -jLegPhase), easing: 'linear' });

            const tBounce = Math.abs(Math.sin(timeSec * tRunRate * Math.PI * 2)) * 22;
            const tLegPhase = Math.sin(timeSec * tRunRate * Math.PI * 2) * 1.1;
            const panSwing = Math.sin(timeSec * 16) * 0.8;
            tRootKeys.push({ id: `k-tr-${frame}`, frame, value: T(tX, 480 - tBounce, 0.22, 1, 1), easing: 'linear' });
            tHeadKeys.push({ id: `k-th-${frame}`, frame, value: T(25, -95, 0.1), easing: 'linear' });
            tPanKeys.push({ id: `k-tp-${frame}`, frame, value: T(25, -60, panSwing), easing: 'linear' });
            tClawKeys.push({ id: `k-tc-${frame}`, frame, value: T(-20, -60, -tLegPhase * 0.7), easing: 'linear' });
            tTailKeys.push({ id: `k-tt-${frame}`, frame, value: T(-25, -15, Math.sin(timeSec * 20) * 0.5), easing: 'linear' });
            // Front & Back Leg strides attached seamlessly to hips
            tLegLKeys.push({ id: `k-tll-${frame}`, frame, value: T(12, 0, tLegPhase), easing: 'linear' });
            tLegRKeys.push({ id: `k-tlr-${frame}`, frame, value: T(-12, 0, -tLegPhase), easing: 'linear' });

            dustKeys.push({ id: `k-dt-${frame}`, frame, value: T(tX - 60, 560 + Math.sin(timeSec * 20) * 8, 0, 1 + Math.sin(timeSec * 15) * 0.3, 1), easing: 'linear' });
            dustOpacityKeys.push({ id: `k-do-${frame}`, frame, value: 0.75, easing: 'linear' });

            starsOpacityKeys.push({ id: `k-so-${frame}`, frame, value: 0, easing: 'step' });
            starsTransformKeys.push({ id: `k-st-${frame}`, frame, value: T(150, 420, 0, 0.01, 0.01), easing: 'step' });
          }
          // Phase 2: Jerry U-Turns & Tom Skids in Panic (2.0s - 2.8s)
          else if (frame <= skidFrame) {
            const p2 = (frame - forwardFrame) / (skidFrame - forwardFrame);
            const easeSkid = p2 * p2 * (3 - 2 * p2);

            const jX = 1070 - easeSkid * 320;
            const jJump = Math.sin(p2 * Math.PI) * 45;
            const jLegPhase = Math.sin(timeSec * jRunRate * Math.PI * 2) * 1.1;
            jRootKeys.push({ id: `k-jr-${frame}`, frame, value: T(jX, 540 - jJump, -0.2, -1, 1), easing: 'linear' });
            jHeadKeys.push({ id: `k-jh-${frame}`, frame, value: T(12, -22, 0.1), easing: 'linear' });
            jArmKeys.push({ id: `k-ja-${frame}`, frame, value: T(12, -8, 0), easing: 'linear' });
            jTailKeys.push({ id: `k-jt-${frame}`, frame, value: T(-16, -4, 0.3), easing: 'linear' });
            jLegLKeys.push({ id: `k-jll-${frame}`, frame, value: T(6, 4, jLegPhase), easing: 'linear' });
            jLegRKeys.push({ id: `k-jlr-${frame}`, frame, value: T(-6, 4, -jLegPhase), easing: 'linear' });

            const tX = 780 + Math.sin(p2 * Math.PI * 0.5) * 80;
            tRootKeys.push({ id: `k-tr-${frame}`, frame, value: T(tX, 490, -0.4, 1, 1), easing: 'linear' });
            tHeadKeys.push({ id: `k-th-${frame}`, frame, value: T(25, -95, -0.3 + Math.sin(timeSec * 35) * 0.15), easing: 'linear' });
            tPanKeys.push({ id: `k-tp-${frame}`, frame, value: T(25, -60, -1.2), easing: 'linear' });
            tClawKeys.push({ id: `k-tc-${frame}`, frame, value: T(-20, -60, 0.9), easing: 'linear' });
            tTailKeys.push({ id: `k-tt-${frame}`, frame, value: T(-25, -15, -0.6), easing: 'linear' });
            tLegLKeys.push({ id: `k-tll-${frame}`, frame, value: T(12, 0, -0.8), easing: 'linear' });
            tLegRKeys.push({ id: `k-tlr-${frame}`, frame, value: T(-12, 0, -0.6), easing: 'linear' });

            dustKeys.push({ id: `k-dt-${frame}`, frame, value: T(tX - 20, 560, 0, 1.8 + p2 * 0.8, 1.2), easing: 'linear' });
            dustOpacityKeys.push({ id: `k-do-${frame}`, frame, value: 0.9, easing: 'linear' });

            starsOpacityKeys.push({ id: `k-so-${frame}`, frame, value: 0, easing: 'step' });
            starsTransformKeys.push({ id: `k-st-${frame}`, frame, value: T(150, 420, 0, 0.01, 0.01), easing: 'step' });
          }
          // Phase 3: Chase Back to Left & Jerry Dives into Hole (2.8s - 4.2s)
          else if (frame <= escapeFrame) {
            const p3 = (frame - skidFrame) / (escapeFrame - skidFrame);
            const jX = 750 - p3 * 630;
            const jBounce = Math.abs(Math.sin(timeSec * jRunRate * Math.PI * 2)) * 12;
            const jLegPhase = Math.sin(timeSec * jRunRate * Math.PI * 2) * 1.1;

            const jScale = p3 > 0.9 ? Math.max(0.1, (1 - (p3 - 0.9) * 10)) : 1;
            jRootKeys.push({ id: `k-jr-${frame}`, frame, value: T(jX, 540 - jBounce, -0.15, -jScale, jScale), easing: 'linear' });
            jHeadKeys.push({ id: `k-jh-${frame}`, frame, value: T(12, -22, 0.1), easing: 'linear' });
            jArmKeys.push({ id: `k-ja-${frame}`, frame, value: T(12, -8, 0.2), easing: 'linear' });
            jTailKeys.push({ id: `k-jt-${frame}`, frame, value: T(-16, -4, Math.sin(timeSec * 25) * 0.3), easing: 'linear' });
            jLegLKeys.push({ id: `k-jll-${frame}`, frame, value: T(6, 4, jLegPhase), easing: 'linear' });
            jLegRKeys.push({ id: `k-jlr-${frame}`, frame, value: T(-6, 4, -jLegPhase), easing: 'linear' });

            const tX = 860 - p3 * 700;
            const tBounce = Math.abs(Math.sin(timeSec * tRunRate * Math.PI * 2)) * 18;
            const tLegPhase = Math.sin(timeSec * tRunRate * Math.PI * 2) * 1.1;
            tRootKeys.push({ id: `k-tr-${frame}`, frame, value: T(tX, 480 - tBounce, -0.22, -1, 1), easing: 'linear' });
            tHeadKeys.push({ id: `k-th-${frame}`, frame, value: T(25, -95, -0.1), easing: 'linear' });
            tPanKeys.push({ id: `k-tp-${frame}`, frame, value: T(25, -60, 0.6), easing: 'linear' });
            tClawKeys.push({ id: `k-tc-${frame}`, frame, value: T(-20, -60, -tLegPhase * 0.7), easing: 'linear' });
            tTailKeys.push({ id: `k-tt-${frame}`, frame, value: T(-25, -15, Math.sin(timeSec * 20) * 0.4), easing: 'linear' });
            tLegLKeys.push({ id: `k-tll-${frame}`, frame, value: T(12, 0, tLegPhase), easing: 'linear' });
            tLegRKeys.push({ id: `k-tlr-${frame}`, frame, value: T(-12, 0, -tLegPhase), easing: 'linear' });

            dustKeys.push({ id: `k-dt-${frame}`, frame, value: T(tX + 50, 560, 0, 1.2, 1), easing: 'linear' });
            dustOpacityKeys.push({ id: `k-do-${frame}`, frame, value: 0.6, easing: 'linear' });

            starsOpacityKeys.push({ id: `k-so-${frame}`, frame, value: 0, easing: 'step' });
            starsTransformKeys.push({ id: `k-st-${frame}`, frame, value: T(150, 420, 0, 0.01, 0.01), easing: 'step' });
          }
          // Phase 4: Tom Crashes into Wall with Comedic Dazed Stars! (4.2s - 5.0s)
          else {
            jRootKeys.push({ id: `k-jr-${frame}`, frame, value: T(120, 535, 0, 0.9, 0.9), easing: 'linear' });
            jHeadKeys.push({ id: `k-jh-${frame}`, frame, value: T(12, -22, Math.sin(timeSec * 8) * 0.2), easing: 'linear' });
            jArmKeys.push({ id: `k-ja-${frame}`, frame, value: T(12, -8, 0.4), easing: 'linear' });
            jTailKeys.push({ id: `k-jt-${frame}`, frame, value: T(-16, -4, 0), easing: 'linear' });
            jLegLKeys.push({ id: `k-jll-${frame}`, frame, value: T(6, 4, 0), easing: 'linear' });
            jLegRKeys.push({ id: `k-jlr-${frame}`, frame, value: T(-6, 4, 0), easing: 'linear' });

            const wobble = Math.sin((timeSec - 4.2) * 18) * 0.15;
            tRootKeys.push({ id: `k-tr-${frame}`, frame, value: T(160, 510, wobble, -0.85, 1.15), easing: 'linear' });
            tHeadKeys.push({ id: `k-th-${frame}`, frame, value: T(25, -90, 0.4 + wobble), easing: 'linear' });
            tPanKeys.push({ id: `k-tp-${frame}`, frame, value: T(25, -40, 1.4), easing: 'linear' });
            tClawKeys.push({ id: `k-tc-${frame}`, frame, value: T(-20, -40, 0.8), easing: 'linear' });
            tTailKeys.push({ id: `k-tt-${frame}`, frame, value: T(-25, -10, 0.8), easing: 'linear' });
            tLegLKeys.push({ id: `k-tll-${frame}`, frame, value: T(12, 0, 0.8), easing: 'linear' });
            tLegRKeys.push({ id: `k-tlr-${frame}`, frame, value: T(-12, 0, -0.8), easing: 'linear' });

            dustOpacityKeys.push({ id: `k-do-${frame}`, frame, value: 0, easing: 'step' });
            dustKeys.push({ id: `k-dt-${frame}`, frame, value: T(0, 0, 0, 0.01, 0.01), easing: 'step' });

            const starRot = (timeSec - 4.2) * 6;
            starsOpacityKeys.push({ id: `k-so-${frame}`, frame, value: 1.0, easing: 'linear' });
            starsTransformKeys.push({ id: `k-st-${frame}`, frame, value: T(150, 390 + Math.sin(timeSec * 10) * 8, starRot, 1, 1), easing: 'linear' });
          }
        }

        const clipId = 'tom-jerry-chase-story';
        project.animations = [
          {
            id: clipId,
            name: 'Classic Tom and Jerry Slapstick Chase',
            fps,
            startFrame: 0,
            endFrame: totalFrames,
            loopMode: 'once',
            tracks: [
              // Jerry
              { id: 'track-jerry-root', targetId: 'jerry-root', property: 'transform', keyframes: jRootKeys },
              { id: 'track-jerry-head', targetId: 'jerry-head', property: 'transform', keyframes: jHeadKeys },
              { id: 'track-jerry-arm', targetId: 'jerry-arm', property: 'transform', keyframes: jArmKeys },
              { id: 'track-jerry-tail', targetId: 'jerry-tail', property: 'transform', keyframes: jTailKeys },
              { id: 'track-jerry-leg-l', targetId: 'jerry-leg-l', property: 'transform', keyframes: jLegLKeys },
              { id: 'track-jerry-leg-r', targetId: 'jerry-leg-r', property: 'transform', keyframes: jLegRKeys },
              // Tom
              { id: 'track-tom-root', targetId: 'tom-root', property: 'transform', keyframes: tRootKeys },
              { id: 'track-tom-head', targetId: 'tom-head', property: 'transform', keyframes: tHeadKeys },
              { id: 'track-tom-pan', targetId: 'tom-arm-pan', property: 'transform', keyframes: tPanKeys },
              { id: 'track-tom-claw', targetId: 'tom-arm-claw', property: 'transform', keyframes: tClawKeys },
              { id: 'track-tom-tail', targetId: 'tom-tail', property: 'transform', keyframes: tTailKeys },
              { id: 'track-tom-leg-l', targetId: 'tom-leg-l', property: 'transform', keyframes: tLegLKeys },
              { id: 'track-tom-leg-r', targetId: 'tom-leg-r', property: 'transform', keyframes: tLegRKeys },
              // FX
              { id: 'track-dust-t', targetId: 'layer-dust-clouds', property: 'transform', keyframes: dustKeys },
              { id: 'track-dust-o', targetId: 'layer-dust-clouds', property: 'opacity', keyframes: dustOpacityKeys },
              { id: 'track-stars-t', targetId: 'layer-impact-stars', property: 'transform', keyframes: starsTransformKeys },
              { id: 'track-stars-o', targetId: 'layer-impact-stars', property: 'opacity', keyframes: starsOpacityKeys }
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
