import { readFile, writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments } from '../plugin-api.mjs';

const T = (x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) => ({ x, y, rotation, scaleX, scaleY });

async function load(context, path) {
  const project = JSON.parse(await readFile(context.resolvePath(path), 'utf8'));
  return project;
}

async function save(context, path, project) {
  const output = context.resolvePath(path);
  await writeFile(output, `${JSON.stringify(project, null, 2)}\n`);
  return output;
}

let shapeCounter = 0;
const R = (x, y, width, height, fill, extra = {}) => ({
  id: `pig-s-${++shapeCounter}`,
  kind: 'rect',
  x, y, width, height, fill, ...extra
});
const E = (x, y, radiusX, radiusY, fill, extra = {}) => ({
  id: `pig-s-${++shapeCounter}`,
  kind: 'ellipse',
  x, y, radiusX, radiusY, fill, ...extra
});
const P = (d, fill = 'none', stroke = 'none', strokeWidth = 2, extra = {}) => ({
  id: `pig-s-${++shapeCounter}`,
  kind: 'path',
  d, fill, stroke, strokeWidth, ...extra
});

export default defineMcpPlugin({
  id: 'pig-story-plugin',
  version: '1.0.0',
  tools: [
    {
      name: 'animate_pig',
      description: 'Animates a cute pig walking through a lush forest, drinking water from a scenic pond with air flow & water physics.',
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

        project.canvas = { width: 1280, height: 720, background: '#8ed0ec' };
        project.layers = [];
        project.bones = [];
        project.bindings = [];

        // 1. Sky and Sun
        project.layers.push({
          id: 'env-sky',
          name: 'Sky & Sun',
          type: 'vector',
          local: T(0, 0),
          zIndex: -100,
          opacity: 1,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            R(0, 0, 1280, 720, '#bae6fd'),
            E(1120, 110, 55, 55, '#fef08a'),
            E(1120, 110, 70, 70, '#fef9c3', { opacity: 0.35 }),
            P('M 0 450 L 200 280 L 440 460 L 680 300 L 920 470 L 1150 320 L 1280 430 L 1280 720 L 0 720 Z', '#a7f3d0')
          ]
        });

        // 2. Air Flow & Wind Streamlines in Atmosphere
        project.layers.push({
          id: 'env-air-flow-upper',
          name: 'Air Flow Wind Currents',
          type: 'vector',
          local: T(0, 0),
          zIndex: -85,
          opacity: 0.7,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            P('M -100 180 Q 200 150 500 190 T 1100 160 T 1500 185', 'none', '#ffffff', 3, { opacity: 0.4 }),
            P('M -150 240 Q 150 210 450 250 T 1050 220 T 1450 245', 'none', '#ffffff', 2.5, { opacity: 0.35 }),
            P('M -80 310 Q 250 280 600 320 T 1200 290 T 1600 315', 'none', '#e0f2fe', 2, { opacity: 0.3 })
          ]
        });

        // 3. Forest Background (Distant Trees & Hills)
        project.layers.push({
          id: 'env-distant-forest',
          name: 'Distant Forest',
          type: 'vector',
          local: T(0, 0),
          zIndex: -80,
          opacity: 1,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            P('M 0 430 Q 320 340 640 420 T 1280 410 L 1280 720 L 0 720 Z', '#86efac'),
            R(80, 310, 20, 100, '#78350f'),
            E(90, 280, 50, 55, '#15803d'),
            R(260, 290, 22, 120, '#78350f'),
            E(271, 250, 65, 70, '#166534'),
            R(520, 320, 18, 90, '#78350f'),
            E(529, 290, 45, 50, '#15803d'),
            R(820, 280, 25, 130, '#78350f'),
            E(832, 240, 70, 75, '#166534')
          ]
        });

        // 4. Midground (Main Forest Ground, Large Trees, Flowers)
        project.layers.push({
          id: 'env-midground',
          name: 'Forest Ground & Path',
          type: 'vector',
          local: T(0, 0),
          zIndex: -50,
          opacity: 1,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            P('M 0 490 Q 400 460 800 500 T 1280 480 L 1280 720 L 0 720 Z', '#4ade80'),
            P('M 0 570 Q 350 540 680 575 L 820 600 L 800 680 Q 350 650 0 680 Z', '#d97706'),
            R(20, 180, 55, 360, '#92400e'),
            E(47, 140, 130, 120, '#16a34a'),
            E(10, 200, 80, 80, '#15803d'),
            R(580, 260, 32, 240, '#92400e'),
            E(596, 220, 80, 75, '#15803d'),
            E(200, 530, 45, 30, '#22c55e'),
            E(240, 540, 35, 25, '#16a34a'),
            E(480, 535, 40, 25, '#16a34a'),
            E(340, 540, 8, 8, '#f43f5e'),
            E(340, 540, 3, 3, '#fef08a'),
            E(510, 545, 9, 9, '#ec4899'),
            E(510, 545, 3, 3, '#fef08a')
          ]
        });

        // 5. Scenic Pond Base Basin & Bank
        project.layers.push({
          id: 'env-pond-base',
          name: 'Pond Basin & Edge Stones',
          type: 'vector',
          local: T(0, 0),
          zIndex: -40,
          opacity: 1,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            // Sand / stone bank
            P('M 790 540 Q 940 480 1200 520 Q 1280 540 1280 720 L 780 720 Q 750 630 790 540 Z', '#a8a29e'),
            // Pond bed / deep water layer
            P('M 810 550 Q 960 500 1200 535 Q 1280 550 1280 720 L 800 720 Q 770 640 810 550 Z', '#0284c7'),
            // Stones on the edge
            E(785, 565, 14, 10, '#78716c'),
            E(775, 600, 16, 12, '#57534e'),
            E(770, 635, 18, 11, '#78716c'),
            E(780, 675, 15, 12, '#57534e')
          ]
        });

        // 6. Water Body with Physical Wave Currents (Driven by Air Flow)
        project.layers.push({
          id: 'layer-water-body',
          name: 'Water Body & Wave Flow',
          type: 'vector',
          local: T(0, 0),
          zIndex: -35,
          opacity: 0.9,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            // Top translucent water surface with subtle blue gradient tone
            P('M 810 550 Q 960 500 1200 535 Q 1280 550 1280 720 L 800 720 Q 770 640 810 550 Z', '#38bdf8')
          ]
        });

        // 7. Dynamic Water Physics Wave Crests & Air Flow Pull Lines
        project.layers.push({
          id: 'layer-pond-waves-primary',
          name: 'Wind-Driven Water Waves 1',
          type: 'vector',
          local: T(0, 0),
          zIndex: -30,
          opacity: 0.85,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            P('M 830 575 Q 920 560 1020 580 Q 1120 565 1220 580', 'none', '#bae6fd', 3.5),
            P('M 860 620 Q 960 605 1070 625 Q 1170 610 1270 625', 'none', '#e0f2fe', 3.0),
            P('M 820 665 Q 930 650 1050 670 Q 1160 655 1260 670', 'none', '#bae6fd', 2.5)
          ]
        });

        project.layers.push({
          id: 'layer-pond-waves-secondary',
          name: 'Wind-Driven Water Waves 2',
          type: 'vector',
          local: T(0, 0),
          zIndex: -28,
          opacity: 0.75,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            P('M 890 595 Q 990 580 1100 600 Q 1190 585 1280 600', 'none', '#f0f9ff', 2.5),
            P('M 840 640 Q 940 628 1040 645 Q 1140 630 1240 645', 'none', '#e0f2fe', 2.0)
          ]
        });

        // 8. Water Inflow / Suction Flow to Pig Snout
        project.layers.push({
          id: 'layer-water-suction',
          name: 'Water Inflow to Snout',
          type: 'vector',
          local: T(825, 590),
          zIndex: -25,
          opacity: 0,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            // Curved stream lines converging into the snout
            P('M 120 -15 Q 60 5 0 0', 'none', '#ffffff', 2.5),
            P('M 90 25 Q 45 15 0 0', 'none', '#e0f2fe', 2.5),
            P('M 110 50 Q 55 30 0 0', 'none', '#bae6fd', 2),
            // Concentric expansion ripples
            E(0, 0, 16, 8, 'none', { stroke: '#ffffff', strokeWidth: 2.5 }),
            E(0, 0, 32, 14, 'none', { stroke: '#e0f2fe', strokeWidth: 2, opacity: 0.8 }),
            E(0, 0, 48, 20, 'none', { stroke: '#bae6fd', strokeWidth: 1.5, opacity: 0.6 })
          ]
        });

        // 9. Floating Pond Props (Lily pads, lotus, reeds)
        project.layers.push({
          id: 'layer-pond-props',
          name: 'Floating Lily Pads & Lotus',
          type: 'vector',
          local: T(0, 0),
          zIndex: -22,
          opacity: 1,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            E(970, 575, 26, 15, '#15803d', { stroke: '#166534', strokeWidth: 1.5 }),
            P('M 970 575 L 996 575', 'none', '#38bdf8', 3),
            E(970, 571, 11, 9, '#f472b6'),
            E(970, 569, 7, 7, '#fbcfe8'),
            E(970, 569, 2.5, 2.5, '#fef08a'),
            E(1120, 605, 30, 17, '#15803d', { stroke: '#166534', strokeWidth: 1.5 }),
            P('M 1120 605 L 1150 605', 'none', '#38bdf8', 3)
          ]
        });

        // 10. Reeds on Far Shore
        project.layers.push({
          id: 'layer-pond-reeds',
          name: 'Wind-Swaying Reeds',
          type: 'vector',
          local: T(0, 0),
          zIndex: -21,
          opacity: 1,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            R(1180, 460, 4, 90, '#15803d'),
            E(1182, 475, 5, 16, '#78350f'),
            R(1220, 450, 4, 100, '#15803d'),
            E(1222, 465, 5, 18, '#78350f'),
            R(1250, 470, 4, 80, '#15803d'),
            E(1252, 485, 5, 15, '#78350f')
          ]
        });

        // 11. Low Air Flow Breeze Streamlines over Water Surface
        project.layers.push({
          id: 'env-air-flow-water',
          name: 'Air Flow over Water',
          type: 'vector',
          local: T(0, 0),
          zIndex: -20,
          opacity: 0.6,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            P('M 760 520 Q 920 495 1100 525 T 1350 510', 'none', '#ffffff', 2, { opacity: 0.5 }),
            P('M 800 545 Q 980 525 1180 550 T 1400 535', 'none', '#e0f2fe', 2.5, { opacity: 0.4 })
          ]
        });

        // 12. Pig Rig Bones
        project.bones = [
          { id: 'pig-root', name: 'Pig Body Root', parentId: null, length: 20, local: T(150, 540) },
          { id: 'bone-back-leg-left', name: 'Back Leg L (Far)', parentId: 'pig-root', length: 50, local: T(-60, 30) },
          { id: 'bone-front-leg-left', name: 'Front Leg L (Far)', parentId: 'pig-root', length: 50, local: T(45, 30) },
          { id: 'bone-back-leg-right', name: 'Back Leg R (Near)', parentId: 'pig-root', length: 50, local: T(-45, 35) },
          { id: 'bone-front-leg-right', name: 'Front Leg R (Near)', parentId: 'pig-root', length: 50, local: T(60, 35) },
          { id: 'bone-head', name: 'Pig Head', parentId: 'pig-root', length: 30, local: T(70, -25) },
          { id: 'bone-tail', name: 'Pig Curly Tail', parentId: 'pig-root', length: 20, local: T(-75, -10) }
        ];

        // 13. Pig Far Legs (zIndex 10)
        project.layers.push(
          {
            id: 'layer-back-leg-left',
            name: 'Back Leg (Far)',
            type: 'vector',
            local: T(0, 0),
            zIndex: 10,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'bone-back-leg-left',
            shapes: [
              R(-14, 0, 28, 48, '#f472b6'),
              R(-14, 38, 28, 14, '#9d174d')
            ]
          },
          {
            id: 'layer-front-leg-left',
            name: 'Front Leg (Far)',
            type: 'vector',
            local: T(0, 0),
            zIndex: 10,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'bone-front-leg-left',
            shapes: [
              R(-14, 0, 28, 48, '#f472b6'),
              R(-14, 38, 28, 14, '#9d174d')
            ]
          }
        );

        // 14. Pig Body & Shadow (zIndex 20)
        project.layers.push({
          id: 'layer-pig-body',
          name: 'Pig Body',
          type: 'vector',
          local: T(0, 0),
          zIndex: 20,
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: 'pig-root',
          shapes: [
            E(0, 75, 95, 20, '#14532d', { opacity: 0.35 }),
            E(0, 0, 85, 60, '#fbcfe8', { stroke: '#f472b6', strokeWidth: 3 }),
            E(-15, -15, 60, 38, '#fdf2f8', { opacity: 0.6 })
          ]
        });

        // 15. Pig Tail Layer (zIndex 22)
        project.layers.push({
          id: 'layer-pig-tail',
          name: 'Pig Tail',
          type: 'vector',
          local: T(0, 0),
          zIndex: 22,
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: 'bone-tail',
          shapes: [
            P('M 0 0 Q -25 -15 -15 -35 Q 0 -45 -5 -15 Q -25 -15 -15 10', 'none', '#f43f5e', 5)
          ]
        });

        // 16. Pig Head & Face (zIndex 25)
        project.layers.push({
          id: 'layer-pig-head',
          name: 'Pig Head & Snout',
          type: 'vector',
          local: T(0, 0),
          zIndex: 25,
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: 'bone-head',
          shapes: [
            P('M -10 -40 L -2 -75 L 18 -45 Z', '#f472b6', '#db2777', 2),
            E(0, 0, 52, 48, '#fbcfe8', { stroke: '#f472b6', strokeWidth: 3 }),
            P('M 8 -40 L 22 -78 L 40 -40 Z', '#f472b6', '#db2777', 2),
            P('M 14 -42 L 23 -68 L 34 -42 Z', '#fdf2f8'),
            E(-5, 12, 14, 10, '#fb7185', { opacity: 0.55 }),
            E(12, -14, 8, 8, '#1e1b4b'),
            E(14, -16, 3, 3, '#ffffff'),
            E(10, -12, 1.5, 1.5, '#ffffff'),
            E(40, 6, 26, 18, '#f472b6', { stroke: '#db2777', strokeWidth: 2 }),
            E(40, 6, 22, 14, '#fbcfe8'),
            E(34, 6, 4, 6, '#881337'),
            E(46, 6, 4, 6, '#881337'),
            P('M 16 28 Q 28 36 38 26', 'none', '#db2777', 3)
          ]
        });

        // 17. Pig Near Legs (zIndex 30)
        project.layers.push(
          {
            id: 'layer-back-leg-right',
            name: 'Back Leg (Near)',
            type: 'vector',
            local: T(0, 0),
            zIndex: 30,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'bone-back-leg-right',
            shapes: [
              R(-15, 0, 30, 52, '#fbcfe8', { stroke: '#f472b6', strokeWidth: 2 }),
              R(-15, 40, 30, 14, '#be185d')
            ]
          },
          {
            id: 'layer-front-leg-right',
            name: 'Front Leg (Near)',
            type: 'vector',
            local: T(0, 0),
            zIndex: 30,
            opacity: 1,
            visible: true,
            locked: false,
            boundBoneId: 'bone-front-leg-right',
            shapes: [
              R(-15, 0, 30, 52, '#fbcfe8', { stroke: '#f472b6', strokeWidth: 2 }),
              R(-15, 40, 30, 14, '#be185d')
            ]
          }
        );

        // 18. Bindings
        project.bindings = [
          { layerId: 'layer-pig-body', imageId: 'layer-pig-body', boneId: 'pig-root', bindOffset: T(0, 0) },
          { layerId: 'layer-pig-tail', imageId: 'layer-pig-tail', boneId: 'bone-tail', bindOffset: T(0, 0) },
          { layerId: 'layer-pig-head', imageId: 'layer-pig-head', boneId: 'bone-head', bindOffset: T(0, 0) },
          { layerId: 'layer-back-leg-left', imageId: 'layer-back-leg-left', boneId: 'bone-back-leg-left', bindOffset: T(0, 0) },
          { layerId: 'layer-front-leg-left', imageId: 'layer-front-leg-left', boneId: 'bone-front-leg-left', bindOffset: T(0, 0) },
          { layerId: 'layer-back-leg-right', imageId: 'layer-back-leg-right', boneId: 'bone-back-leg-right', bindOffset: T(0, 0) },
          { layerId: 'layer-front-leg-right', imageId: 'layer-front-leg-right', boneId: 'bone-front-leg-right', bindOffset: T(0, 0) }
        ];

        // 19. Foreground vegetation
        project.layers.push({
          id: 'env-foreground-grass',
          name: 'Foreground Grass & Shrooms',
          type: 'vector',
          local: T(0, 0),
          zIndex: 50,
          opacity: 1,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            R(320, 640, 8, 20, '#fef3c7'),
            E(324, 636, 18, 12, '#ef4444'),
            E(320, 634, 3, 3, '#ffffff'),
            E(328, 636, 2.5, 2.5, '#ffffff'),
            P('M 100 720 Q 110 650 140 620 Q 120 660 115 720 Z', '#15803d'),
            P('M 115 720 Q 130 640 165 610 Q 145 655 130 720 Z', '#22c55e')
          ]
        });

        // 20. Total Timing & Animation Keyframes
        const totalDurationSec = 11;
        const totalFrames = totalDurationSec * fps;
        const walkEndSec = 4.5;
        const walkEndFrame = Math.round(walkEndSec * fps);
        const drinkStartSec = 5.2;
        const drinkStartFrame = Math.round(drinkStartSec * fps);
        const drinkEndSec = 9.2;
        const drinkEndFrame = Math.round(drinkEndSec * fps);

        const startX = 100;
        const pondEdgeX = 725;
        const baseY = 540;
        const stepRate = 3.2;

        const rootKeys = [];
        const headKeys = [];
        const tailKeys = [];
        const flLeftKeys = [];
        const frLeftKeys = [];
        const flRightKeys = [];
        const frRightKeys = [];

        // Air flow & water physics tracks
        const airFlowUpperKeys = [];
        const airFlowWaterKeys = [];
        const wave1Keys = [];
        const wave2Keys = [];
        const suctionTransformKeys = [];
        const suctionOpacityKeys = [];
        const lilyPropsKeys = [];
        const reedsKeys = [];

        for (let frame = 0; frame <= totalFrames; frame++) {
          const timeSec = frame / fps;

          // AIR FLOW & WIND PHYSICS: Wind blowing across stage from left to right at ~120px/s
          const windShiftUpper = (timeSec * 140) % 400;
          airFlowUpperKeys.push({
            id: `k-afu-${frame}`,
            frame,
            value: T(windShiftUpper, Math.sin(timeSec * 2.5) * 6),
            easing: 'linear'
          });

          const windShiftWater = (timeSec * 160) % 350;
          airFlowWaterKeys.push({
            id: `k-afw-${frame}`,
            frame,
            value: T(windShiftWater, Math.sin(timeSec * 3.2) * 5),
            easing: 'linear'
          });

          // WATER WAVES PHYSICS: Harmonic oscillation pushed by air flow
          const wavePhase1 = timeSec * 4.0;
          const wavePhase2 = timeSec * 3.3 + 1.2;
          const waveX1 = (Math.sin(wavePhase1) * 12) + ((timeSec * 35) % 40);
          const waveY1 = Math.cos(wavePhase1) * 4;
          const waveX2 = (Math.sin(wavePhase2) * 10) + ((timeSec * 28) % 35);
          const waveY2 = Math.cos(wavePhase2) * 3.5;

          wave1Keys.push({ id: `k-w1-${frame}`, frame, value: T(waveX1, waveY1), easing: 'linear' });
          wave2Keys.push({ id: `k-w2-${frame}`, frame, value: T(waveX2, waveY2), easing: 'linear' });

          // POND PROPS (Lilypads drifting + reeds swaying with the air flow)
          const reedSway = Math.sin(timeSec * 3.0) * 0.08;
          reedsKeys.push({ id: `k-reeds-${frame}`, frame, value: T(0, 0, reedSway), easing: 'linear' });
          const lilyDrift = Math.sin(timeSec * 2.2) * 6;
          lilyPropsKeys.push({ id: `k-lily-${frame}`, frame, value: T(lilyDrift, Math.cos(timeSec * 2.2) * 3), easing: 'linear' });

          // CHARACTER ANIMATION PHASES:
          // Phase 1: Walking to the pond (0s - 4.5s)
          if (frame <= walkEndFrame) {
            const walkProgress = frame / walkEndFrame;
            const smoothT = Math.sin((walkProgress * Math.PI) / 2);
            const currentX = startX + (pondEdgeX - startX) * smoothT;
            const bounce = Math.abs(Math.sin(timeSec * stepRate * Math.PI * 2)) * 8 * (1 - walkProgress * 0.4);
            const tilt = Math.sin(timeSec * stepRate * Math.PI * 2) * 0.04 * (1 - walkProgress * 0.4);

            rootKeys.push({ id: `k-r-${frame}`, frame, value: T(currentX, baseY - bounce, tilt), easing: 'linear' });
            headKeys.push({ id: `k-h-${frame}`, frame, value: T(70, -25, Math.sin(timeSec * stepRate * Math.PI * 2) * 0.06), easing: 'linear' });
            tailKeys.push({ id: `k-t-${frame}`, frame, value: T(-75, -10, Math.sin(timeSec * 8) * 0.2), easing: 'linear' });

            const swing = 0.45 * (1 - walkProgress * 0.4);
            const legPhase1 = Math.sin(timeSec * stepRate * Math.PI * 2) * swing;
            const legPhase2 = -legPhase1;

            flRightKeys.push({ id: `k-fr-${frame}`, frame, value: T(60, 35, legPhase1), easing: 'linear' });
            frLeftKeys.push({ id: `k-bl-${frame}`, frame, value: T(-60, 30, legPhase1), easing: 'linear' });
            flLeftKeys.push({ id: `k-fl-${frame}`, frame, value: T(45, 30, legPhase2), easing: 'linear' });
            frRightKeys.push({ id: `k-br-${frame}`, frame, value: T(-45, 35, legPhase2), easing: 'linear' });

            suctionTransformKeys.push({ id: `k-st-${frame}`, frame, value: T(0, 0, 0, 0.01, 0.01), easing: 'step' });
            suctionOpacityKeys.push({ id: `k-so-${frame}`, frame, value: 0, easing: 'step' });
          }
          // Phase 2: Approach & Lower Head into Water (4.5s - 5.2s)
          else if (frame < drinkStartFrame) {
            const bendT = (frame - walkEndFrame) / (drinkStartFrame - walkEndFrame);
            const easeBend = bendT * bendT * (3 - 2 * bendT);

            const curX = pondEdgeX;
            const curY = baseY + easeBend * 12;
            const curBodyTilt = easeBend * 0.12;
            const headAngle = easeBend * 0.65;
            const headY = -25 + easeBend * 35;

            rootKeys.push({ id: `k-r-${frame}`, frame, value: T(curX, curY, curBodyTilt), easing: 'linear' });
            headKeys.push({ id: `k-h-${frame}`, frame, value: T(70, headY, headAngle), easing: 'linear' });
            tailKeys.push({ id: `k-t-${frame}`, frame, value: T(-75, -10, Math.sin(timeSec * 10) * 0.3), easing: 'linear' });

            flRightKeys.push({ id: `k-fr-${frame}`, frame, value: T(60, 35, 0.05), easing: 'linear' });
            frLeftKeys.push({ id: `k-bl-${frame}`, frame, value: T(-60, 30, -0.05), easing: 'linear' });
            flLeftKeys.push({ id: `k-fl-${frame}`, frame, value: T(45, 30, 0.02), easing: 'linear' });
            frRightKeys.push({ id: `k-br-${frame}`, frame, value: T(-45, 35, -0.02), easing: 'linear' });

            suctionTransformKeys.push({ id: `k-st-${frame}`, frame, value: T(0, 0, 0, 0.2, 0.2), easing: 'linear' });
            suctionOpacityKeys.push({ id: `k-so-${frame}`, frame, value: easeBend * 0.5, easing: 'linear' });
          }
          // Phase 3: Drinking water from pond with air flow pull & suction physics (5.2s - 9.2s)
          else if (frame <= drinkEndFrame) {
            const drinkTime = (frame - drinkStartFrame) / fps;
            const sipRate = 4.0;
            const sipBob = Math.sin(drinkTime * sipRate * Math.PI * 2);
            const headAngle = 0.65 + sipBob * 0.08;
            const headY = 10 + sipBob * 4;
            const bodyBob = Math.sin(drinkTime * sipRate * Math.PI * 2) * 2;

            rootKeys.push({ id: `k-r-${frame}`, frame, value: T(pondEdgeX, baseY + 12 + bodyBob, 0.12), easing: 'linear' });
            headKeys.push({ id: `k-h-${frame}`, frame, value: T(70, headY, headAngle), easing: 'linear' });
            tailKeys.push({ id: `k-t-${frame}`, frame, value: T(-75, -10, Math.sin(drinkTime * 12) * 0.4), easing: 'linear' });

            flRightKeys.push({ id: `k-fr-${frame}`, frame, value: T(60, 35, 0.05), easing: 'linear' });
            frLeftKeys.push({ id: `k-bl-${frame}`, frame, value: T(-60, 30, -0.05), easing: 'linear' });
            flLeftKeys.push({ id: `k-fl-${frame}`, frame, value: T(45, 30, 0.02), easing: 'linear' });
            frRightKeys.push({ id: `k-br-${frame}`, frame, value: T(-45, 35, -0.02), easing: 'linear' });

            // Water physics suction pulses into snout combined with wind drift
            const suctionPulse = (Math.sin(drinkTime * sipRate * Math.PI * 2) + 1) / 2;
            const suctionScale = 0.85 + suctionPulse * 0.5;
            suctionTransformKeys.push({ id: `k-st-${frame}`, frame, value: T(Math.sin(drinkTime * 5) * 4, 0, 0, suctionScale, suctionScale), easing: 'linear' });
            suctionOpacityKeys.push({ id: `k-so-${frame}`, frame, value: 0.85 + suctionPulse * 0.15, easing: 'linear' });
          }
          // Phase 4: Satisfied Pig lifts head up, looks refreshed (9.2s - 11.0s)
          else {
            const finishT = (frame - drinkEndFrame) / (totalFrames - drinkEndFrame);
            const easeFinish = finishT * finishT * (3 - 2 * finishT);

            const headAngle = 0.65 - easeFinish * 0.85;
            const headY = 10 - easeFinish * 40;
            const bodyTilt = 0.12 - easeFinish * 0.16;

            rootKeys.push({ id: `k-r-${frame}`, frame, value: T(pondEdgeX, baseY + 12 - easeFinish * 12, bodyTilt), easing: 'linear' });
            headKeys.push({ id: `k-h-${frame}`, frame, value: T(70, headY, headAngle), easing: 'linear' });
            tailKeys.push({ id: `k-t-${frame}`, frame, value: T(-75, -10, Math.sin(timeSec * 14) * 0.5), easing: 'linear' });

            flRightKeys.push({ id: `k-fr-${frame}`, frame, value: T(60, 35, 0), easing: 'linear' });
            frLeftKeys.push({ id: `k-bl-${frame}`, frame, value: T(-60, 30, 0), easing: 'linear' });
            flLeftKeys.push({ id: `k-fl-${frame}`, frame, value: T(45, 30, 0), easing: 'linear' });
            frRightKeys.push({ id: `k-br-${frame}`, frame, value: T(-45, 35, 0), easing: 'linear' });

            suctionTransformKeys.push({ id: `k-st-${frame}`, frame, value: T(0, 0, 0, 1.2, 1.2), easing: 'linear' });
            suctionOpacityKeys.push({ id: `k-so-${frame}`, frame, value: Math.max(0, (1 - easeFinish) * 0.5), easing: 'linear' });
          }
        }

        // 21. Native Physics & Dynamics System (Air flow wind force + particle emitters)
        project.dynamics = {
          enabled: true,
          startFrame: 0,
          endFrame: totalFrames,
          fps,
          substeps: 4,
          gravityX: 0,
          gravityY: 160,
          windX: 180, // Air flow horizontal force pushing rightward across the water
          windY: -35, // Updraft pulling water mist
          windNoise: 50, // Natural turbulent gusts
          seed: 24,
          bones: [
            {
              id: 'dyn-tail',
              boneId: 'bone-tail',
              enabled: true,
              mode: 'tail',
              stiffness: 28,
              damping: 5,
              mass: 0.7,
              gravityScale: 0.1,
              windScale: 1.8,
              influence: 1,
              overlap: 0.4
            }
          ],
          bodies: [],
          meshes: [],
          emitters: [
            {
              id: 'emitter-water-spray',
              name: 'Pond Water Droplets & Spray',
              enabled: true,
              x: 825,
              y: 585,
              rate: 35,
              lifetime: 1.6,
              speed: 95,
              spread: 0.85,
              direction: -Math.PI * 0.45,
              size: 4,
              color: '#bae6fd'
            },
            {
              id: 'emitter-air-breeze-mist',
              name: 'Air Flow Moisture Particles',
              enabled: true,
              x: 750,
              y: 530,
              rate: 28,
              lifetime: 2.2,
              speed: 130,
              spread: 0.5,
              direction: -0.15,
              size: 2.8,
              color: '#f0fdf4'
            }
          ]
        };

        const clipId = 'pig-pond-physics-story';
        project.animations = [
          {
            id: clipId,
            name: 'Pig Forest Walk & Pond Drink with Air Flow & Water Physics',
            fps,
            startFrame: 0,
            endFrame: totalFrames,
            loopMode: 'once',
            tracks: [
              { id: 'track-root', targetId: 'pig-root', property: 'transform', keyframes: rootKeys },
              { id: 'track-head', targetId: 'bone-head', property: 'transform', keyframes: headKeys },
              { id: 'track-tail', targetId: 'bone-tail', property: 'transform', keyframes: tailKeys },
              { id: 'track-fr-leg', targetId: 'bone-front-leg-right', property: 'transform', keyframes: flRightKeys },
              { id: 'track-bl-leg', targetId: 'bone-back-leg-left', property: 'transform', keyframes: frLeftKeys },
              { id: 'track-fl-leg', targetId: 'bone-front-leg-left', property: 'transform', keyframes: flLeftKeys },
              { id: 'track-br-leg', targetId: 'bone-back-leg-right', property: 'transform', keyframes: frRightKeys },
              // Physics & Environmental wave / airflow tracks
              { id: 'track-af-upper', targetId: 'env-air-flow-upper', property: 'transform', keyframes: airFlowUpperKeys },
              { id: 'track-af-water', targetId: 'env-air-flow-water', property: 'transform', keyframes: airFlowWaterKeys },
              { id: 'track-wave1', targetId: 'layer-pond-waves-primary', property: 'transform', keyframes: wave1Keys },
              { id: 'track-wave2', targetId: 'layer-pond-waves-secondary', property: 'transform', keyframes: wave2Keys },
              { id: 'track-suction-t', targetId: 'layer-water-suction', property: 'transform', keyframes: suctionTransformKeys },
              { id: 'track-suction-o', targetId: 'layer-water-suction', property: 'opacity', keyframes: suctionOpacityKeys },
              { id: 'track-lily', targetId: 'layer-pond-props', property: 'transform', keyframes: lilyPropsKeys },
              { id: 'track-reeds', targetId: 'layer-pond-reeds', property: 'transform', keyframes: reedsKeys }
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
          bones: project.bones.length,
          dynamics: {
            windX: project.dynamics.windX,
            windY: project.dynamics.windY,
            emitters: project.dynamics.emitters.length
          }
        });
      }
    }
  ]
});
