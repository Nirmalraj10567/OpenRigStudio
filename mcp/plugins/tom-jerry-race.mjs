import { writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments } from '../plugin-api.mjs';

const T = (x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) => ({ x, y, rotation, scaleX, scaleY });
let shapeId = 0;
const R = (x, y, width, height, fill, extra = {}) => ({ id: `race-shape-${++shapeId}`, kind: 'rect', x, y, width, height, fill, ...extra });
const E = (x, y, radiusX, radiusY, fill, extra = {}) => ({ id: `race-shape-${++shapeId}`, kind: 'ellipse', x, y, radiusX, radiusY, fill, ...extra });
const P = (d, fill = 'none', stroke = 'none', strokeWidth = 2, extra = {}) => ({ id: `race-shape-${++shapeId}`, kind: 'path', d, fill, stroke, strokeWidth, ...extra });

async function save(context, path, project) {
  const output = context.resolvePath(path);
  await writeFile(output, `${JSON.stringify(project, null, 2)}\n`);
  return output;
}

function layer(id, name, shapes, zIndex, boneId = null, locked = false) {
  return { id, name, type: 'vector', local: T(), zIndex, opacity: 1, visible: true, locked, boundBoneId: boneId, shapes };
}

function keyTrack(tracks, id, targetId, property, keyframes) {
  tracks.push({ id, targetId, property, keyframes });
}

function makeProject(fps, name) {
  const totalFrames = fps * 5;
  const bones = [
    { id: 'tom-car-root', name: 'Tom car root', parentId: null, length: 100, local: T(160, 500) },
    { id: 'tom-wheel-front', name: 'Tom front wheel', parentId: 'tom-car-root', length: 1, local: T(66, 29) },
    { id: 'tom-wheel-back', name: 'Tom back wheel', parentId: 'tom-car-root', length: 1, local: T(-66, 29) },
    { id: 'jerry-car-root', name: 'Jerry car root', parentId: null, length: 100, local: T(100, 600) },
    { id: 'jerry-wheel-front', name: 'Jerry front wheel', parentId: 'jerry-car-root', length: 1, local: T(66, 29) },
    { id: 'jerry-wheel-back', name: 'Jerry back wheel', parentId: 'jerry-car-root', length: 1, local: T(-66, 29) },
  ];
  const bindings = [];
  const layers = [];
  const add = (id, label, shapes, zIndex, boneId = null, locked = false) => {
    layers.push(layer(id, label, shapes, zIndex, boneId, locked));
    if (boneId) bindings.push({ layerId: id, imageId: id, boneId, bindOffset: T() });
  };

  // Bright cartoon track and stadium.
  add('race-sky', 'Race sky and stadium', [
    R(0, 0, 1280, 720, '#9bdcf0'), E(1040, 100, 48, 48, '#fff0a8'),
    R(0, 250, 1280, 180, '#70a37b'), R(70, 180, 1140, 105, '#d66b61'),
    ...Array.from({ length: 15 }, (_, i) => R(90 + i * 76, 205, 45, 62, i % 2 ? '#f7d99b' : '#fff1cb')),
    R(0, 430, 1280, 290, '#3f5264'), R(0, 438, 1280, 7, '#e7d9a0'), R(0, 690, 1280, 30, '#263647'),
  ], -100, null, true);
  add('race-lanes', 'Racing lanes', [
    R(0, 535, 1280, 5, '#f6e6ae'), R(0, 575, 1280, 5, '#f6e6ae'), R(0, 615, 1280, 5, '#f6e6ae'),
    ...Array.from({ length: 18 }, (_, i) => R(i * 90 - 20, 468, 44, 7, '#f5e7b1')),
    ...Array.from({ length: 18 }, (_, i) => R(i * 90 + 20, 650, 44, 7, '#f5e7b1')),
  ], -80, null, true);
  add('finish-line', 'Finish line', [
    ...Array.from({ length: 6 }, (_, row) => Array.from({ length: 2 }, (_, col) => R(1090 + col * 25, 450 + row * 34, 25, 34, (row + col) % 2 ? '#fffaf0' : '#1e293b'))).flat(),
    R(1138, 205, 8, 250, '#3b2f2a'), P('M 1146 205 L 1230 205 L 1188 255 L 1146 255 Z', '#ef4444'),
  ], -40, null, true);
  add('race-banner', 'Race banner', [R(390, 72, 500, 70, '#fff7d6', { stroke: '#dc5c52', strokeWidth: 5 }), P('M 455 108 L 510 92 L 510 124 Z', '#dc5c52'), P('M 770 108 L 715 92 L 715 124 Z', '#dc5c52'), E(522, 107, 8, 8, '#e84d4d'), E(550, 107, 8, 8, '#4d9ee8'), E(578, 107, 8, 8, '#f0bb4b'), E(607, 107, 8, 8, '#e84d4d'), E(636, 107, 8, 8, '#4d9ee8'), E(664, 107, 8, 8, '#f0bb4b')], -20, null, true);

  const carShapes = (body, accent) => [
    P('M -112 10 Q -106 -28 -72 -34 L -34 -66 L 53 -66 Q 79 -61 100 -28 L 116 -2 Q 121 16 104 26 L -103 26 Q -118 22 -112 10 Z', body, '#243447', 4),
    P('M -38 -59 L -26 -22 L 58 -22 L 51 -59 Z', '#b8e4e7', '#243447', 3),
    R(-92, 0, 28, 9, accent), R(67, 0, 30, 9, accent), E(-66, 30, 27, 27, '#1e293b', { stroke: '#f8fafc', strokeWidth: 4 }), E(66, 30, 27, 27, '#1e293b', { stroke: '#f8fafc', strokeWidth: 4 }),
    E(-66, 30, 9, 9, '#f0bf5b'), E(66, 30, 9, 9, '#f0bf5b'),
    R(-104, -8, 12, 9, '#fff2b3'), R(92, -8, 12, 9, '#f05d59'),
  ];
  add('tom-car-body', 'Tom racing car', carShapes('#4a83c6', '#f4bd4b'), 30, 'tom-car-root');
  add('tom-driver', 'Tom driver', [
    E(-4, -86, 32, 28, '#64748b', { stroke: '#334155', strokeWidth: 3 }), P('M -24 -106 L -30 -135 L -5 -114 Z', '#64748b', '#334155', 2), P('M 12 -108 L 32 -136 L 30 -104 Z', '#64748b', '#334155', 2), E(-2, -82, 17, 10, '#f8fafc'), E(-15, -88, 5, 8, '#facc15'), E(6, -88, 5, 8, '#facc15'), P('M -4 -72 Q 7 -62 18 -73', 'none', '#0f172a', 3), R(-26, -116, 55, 9, '#1e293b')
  ], 40, 'tom-car-root');
  add('tom-wheel-front-art', 'Tom front wheel art', [E(0, 0, 20, 20, '#1e293b', { stroke: '#f8fafc', strokeWidth: 3 }), P('M -12 0 L 12 0 M 0 -12 L 0 12', 'none', '#f0bf5b', 3)], 45, 'tom-wheel-front');
  add('tom-wheel-back-art', 'Tom back wheel art', [E(0, 0, 20, 20, '#1e293b', { stroke: '#f8fafc', strokeWidth: 3 }), P('M -12 0 L 12 0 M 0 -12 L 0 12', 'none', '#f0bf5b', 3)], 45, 'tom-wheel-back');
  add('jerry-car-body', 'Jerry racing car', carShapes('#dc655c', '#7bd3c8'), 50, 'jerry-car-root');
  add('jerry-driver', 'Jerry driver', [
    E(-4, -86, 29, 25, '#b45309', { stroke: '#78350f', strokeWidth: 3 }), E(-27, -108, 15, 15, '#b45309'), E(18, -108, 15, 15, '#b45309'), E(-27, -108, 9, 9, '#fbcfe8'), E(18, -108, 9, 9, '#fbcfe8'), E(7, -88, 4, 7, '#f8fafc'), E(9, -88, 2, 4, '#0284c7'), E(17, -80, 3, 3, '#0f172a'), P('M 14 -75 Q 22 -69 29 -76', 'none', '#78350f', 2), R(-27, -116, 50, 8, '#facc15')
  ], 60, 'jerry-car-root');
  add('jerry-wheel-front-art', 'Jerry front wheel art', [E(0, 0, 20, 20, '#1e293b', { stroke: '#f8fafc', strokeWidth: 3 }), P('M -12 0 L 12 0 M 0 -12 L 0 12', 'none', '#7bd3c8', 3)], 65, 'jerry-wheel-front');
  add('jerry-wheel-back-art', 'Jerry back wheel art', [E(0, 0, 20, 20, '#1e293b', { stroke: '#f8fafc', strokeWidth: 3 }), P('M -12 0 L 12 0 M 0 -12 L 0 12', 'none', '#7bd3c8', 3)], 65, 'jerry-wheel-back');
  add('race-dust', 'Race dust', [E(0, 0, 38, 20, '#f8fafc', { opacity: .8 }), E(-35, 5, 24, 14, '#e2e8f0', { opacity: .7 }), E(32, 7, 23, 14, '#f1f5f9', { opacity: .75 })], 20, null, true);
  add('race-speed-lines', 'Speed lines', [P('M 0 0 L 115 0', 'none', '#fff3b0', 5), P('M 0 20 L 80 20', 'none', '#fff3b0', 4), P('M 0 -20 L 90 -20', 'none', '#fff3b0', 3)], 10, null, true);

  const tracks = [];
  const keyframes = (id, frames) => frames.map(([frame, value, easing = 'linear'], index) => ({ id: `${id}-${index}`, frame, value, easing }));
  const tomRoot = [], jerryRoot = [], tomWheelFront = [], tomWheelBack = [], jerryWheelFront = [], jerryWheelBack = [], dust = [], dustOpacity = [], lines = [], linesOpacity = [];
  for (let frame = 0; frame <= totalFrames; frame++) {
    const t = frame / fps;
    const u = Math.min(1, t / 4.4);
    const s = u * u * (3 - 2 * u);
    const jerryX = 105 + 980 * s;
    const tomX = 155 + 925 * Math.min(1, Math.max(0, (t - .16) / 4.25));
    const bob = Math.sin(t * 18) * 3;
    const tomY = 500 + Math.sin(t * 6) * 4;
    const jerryY = 600 + Math.cos(t * 7) * 3;
    const finishWobble = t > 4.4 ? Math.sin((t - 4.4) * 15) * .04 : 0;
    tomRoot.push([frame, T(tomX, tomY + bob, finishWobble)]);
    jerryRoot.push([frame, T(jerryX, jerryY - bob, -finishWobble)]);
    const spin = frame * 0.55;
    tomWheelFront.push([frame, T(66, 29, spin)]); tomWheelBack.push([frame, T(-66, 29, spin)]);
    jerryWheelFront.push([frame, T(66, 29, spin * 1.12)]); jerryWheelBack.push([frame, T(-66, 29, spin * 1.12)]);
    dust.push([frame, T(Math.min(tomX, jerryX) - 120, 550 + Math.sin(t * 12) * 5, 0, 1 + s * .6, 1)]);
    dustOpacity.push([frame, t > 4.55 ? 0 : .22 + s * .58]);
    lines.push([frame, T((t * 240) % 260 - 80, 410)]); linesOpacity.push([frame, .2 + s * .55]);
  }
  keyTrack(tracks, 'track-tom-root', 'tom-car-root', 'transform', keyframes('tom-root', tomRoot));
  keyTrack(tracks, 'track-jerry-root', 'jerry-car-root', 'transform', keyframes('jerry-root', jerryRoot));
  keyTrack(tracks, 'track-tom-wheel-front', 'tom-wheel-front', 'transform', keyframes('tom-wheel-front', tomWheelFront));
  keyTrack(tracks, 'track-tom-wheel-back', 'tom-wheel-back', 'transform', keyframes('tom-wheel-back', tomWheelBack));
  keyTrack(tracks, 'track-jerry-wheel-front', 'jerry-wheel-front', 'transform', keyframes('jerry-wheel-front', jerryWheelFront));
  keyTrack(tracks, 'track-jerry-wheel-back', 'jerry-wheel-back', 'transform', keyframes('jerry-wheel-back', jerryWheelBack));
  keyTrack(tracks, 'track-dust', 'race-dust', 'transform', keyframes('dust', dust));
  keyTrack(tracks, 'track-dust-opacity', 'race-dust', 'opacity', keyframes('dust-opacity', dustOpacity));
  keyTrack(tracks, 'track-lines', 'race-speed-lines', 'transform', keyframes('lines', lines));
  keyTrack(tracks, 'track-lines-opacity', 'race-speed-lines', 'opacity', keyframes('lines-opacity', linesOpacity));
  const clip = { id: 'tom-jerry-car-race-5s', name: 'Tom and Jerry · 5 second car race', fps, startFrame: 0, endFrame: totalFrames, loopMode: 'once', tracks, setupPose: {} };
  const project = {
    schemaVersion: 1, id: 'tom-jerry-car-race', name, canvas: { width: 1280, height: 720, background: '#9bdcf0' }, layers, bones, bindings,
    animations: [clip], dynamics: { enabled: false, startFrame: 0, endFrame: totalFrames, fps, substeps: 4, gravityX: 0, gravityY: 420, windX: 0, windY: 0, windNoise: 0, seed: 1, bones: [], bodies: [], meshes: [], emitters: [] },
    stage2d: { enabled: false, cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0, projection: 'perspective' }, cameraView: 'preview',
    timeline: { currentFrame: 0, currentTime: 0, isPlaying: false, loop: false, fps, startFrame: 0, endFrame: totalFrames, activeAnimationId: clip.id },
    metadata: { createdBy: 'character-studio-mcp', story: 'tom_and_jerry_car_race', durationSeconds: '5', description: 'Two cartoon racers speed across a stadium track; Tom and Jerry swap the lead, wheels spin, dust and speed lines animate.' },
  };
  return project;
}

export default defineMcpPlugin({
  id: 'tom-jerry-car-race-plugin',
  version: '1.0.0',
  tools: [{
    name: 'create_tom_jerry_car_race',
    description: 'Create an editable 5-second Tom-and-Jerry-style cartoon car race with two cars, drivers, spinning wheels, speed lines, dust, stadium track, lane markings, and finish flag.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', default: 'tom-jerry-car-race.json' }, name: { type: 'string', default: 'Tom and Jerry · Car Race' }, fps: { type: 'integer', enum: [24, 30, 60], default: 24 }, overwrite: { type: 'boolean', default: false } }, required: ['path'] },
    async execute(args, context) {
      const input = objectArguments(args); const path = typeof input.path === 'string' && input.path ? input.path : 'tom-jerry-car-race.json';
      const output = context.resolvePath(path); if (await context.exists(output) && input.overwrite !== true) throw new Error('Output exists; pass overwrite: true to replace it');
      const fps = input.fps ?? 24; if (![24, 30, 60].includes(fps)) throw new Error('fps must be 24, 30, or 60');
      const project = makeProject(fps, typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'Tom and Jerry · Car Race');
      return jsonToolResult({ created: await save(context, path, project), durationSeconds: 5, totalFrames: project.timeline.endFrame, layers: project.layers.length, bones: project.bones.length, tracks: project.animations[0].tracks.length, keys: project.animations[0].tracks.reduce((sum, track) => sum + track.keyframes.length, 0) });
    },
  }],
});
