// Scene authoring produces ordinary Character Studio project data and keys.
// Playback, hierarchy, drawing and export remain owned by the existing engine.
const T = (x = 0, y = 0, rotation = 0, scale = 1) => ({ x, y, rotation, scaleX: scale, scaleY: scale });
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const compose = (a, b) => ({ x: a.x + b.x * a.scaleX * Math.cos(a.rotation) - b.y * a.scaleY * Math.sin(a.rotation), y: a.y + b.x * a.scaleX * Math.sin(a.rotation) + b.y * a.scaleY * Math.cos(a.rotation), rotation: a.rotation + b.rotation, scaleX: a.scaleX * b.scaleX, scaleY: a.scaleY * b.scaleY });
const xml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

export function createGardenCafeScene(source, { name = 'A little coffee break', fps = 24 } = {}) {
  if (!Number.isInteger(fps) || fps < 12 || fps > 60) throw new Error('fps must be an integer from 12 to 60');
  const project = structuredClone(source);
  const requiredBones = ['root', 'head-bone', 'left-arm-bone', 'right-arm-bone', 'left-leg-bone', 'right-leg-bone'];
  for (const id of requiredBones) if (!project.bones?.some(bone => bone.id === id)) throw new Error(`This story needs the create_character_scene rig; missing ${id}`);
  for (const id of ['character-body', 'character-face', 'character-head', 'character-left-arm', 'character-right-arm', 'character-left-leg', 'character-right-leg']) {
    if (!project.layers?.some(layer => layer.id === id && layer.type === 'vector')) throw new Error(`Missing vector character part: ${id}`);
  }
  project.id = 'garden-cafe-story'; project.name = name;
  project.canvas = { width: 1280, height: 720, background: '#e4eee2' };
  project.layers = project.layers.filter(layer => layer.id.startsWith('character-') && !['character-ground', 'character-shadow'].includes(layer.id));
  project.bones = project.bones.filter(bone => requiredBones.includes(bone.id));
  project.bindings = project.bindings.filter(binding => project.layers.some(layer => layer.id === (binding.layerId ?? binding.imageId)));
  project.groups = []; project.cameras = []; project.cameraView = 'preview';
  project.smartActions = []; project.constraints = []; project.controllers = []; project.controllerInstances = [];
  project.characterViews = []; project.facialProfiles = []; project.lipSyncTracks = []; project.audio = undefined;
  project.stage2d = { enabled: false, cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0, projection: 'perspective' };
  project.dynamics = { ...project.dynamics, enabled: false, cache: undefined, bones: [], bodies: [], meshes: [], emitters: [] };
  const clip = { id: 'garden-cafe-animation', name: 'Garden walk → café order → coffee break', fps, startFrame: 0, endFrame: 24 * fps, loopMode: 'once', tracks: [] };
  project.animations = [clip];
  project.timeline = { currentFrame: 0, currentTime: 0, isPlaying: false, loop: false, fps, startFrame: 0, endFrame: 24 * fps, activeAnimationId: clip.id };
  const track = (targetId, property, values, easing = 'linear') => {
    const id = `${targetId}-${property}`;
    clip.tracks.push({ id, targetId, property, keyframes: values.map(([time, value, mode], index) => ({ id: `${id}-${index}`, frame: Math.round(time * fps), value, easing: mode ?? easing })) });
  };
  const show = (id, from, to) => track(id, 'visible', [...(from > 0 ? [[0, false]] : []), [from, true], [to, false]], 'step');
  let shapeNumber = 0;
  const R = (x, y, width, height, fill, extra = {}) => ({ id: `cafe-shape-${++shapeNumber}`, kind: 'rect', x, y, width, height, fill, ...extra });
  const E = (x, y, radiusX, radiusY, fill, extra = {}) => ({ id: `cafe-shape-${++shapeNumber}`, kind: 'ellipse', x, y, radiusX, radiusY, fill, ...extra });
  const P = (d, fill, stroke = 'none', strokeWidth = 2) => ({ id: `cafe-shape-${++shapeNumber}`, kind: 'path', d, fill, stroke, strokeWidth });
  const layer = (id, name, shapes, zIndex, range, local = T(), boneId) => {
    const value = { id, name, type: 'vector', shapes, local, zIndex, visible: !range || range[0] === 0, opacity: 1, locked: false, boundBoneId: boneId ?? null };
    project.layers.push(value);
    if (range) show(id, ...range);
    if (boneId) project.bindings.push({ layerId: id, imageId: id, boneId, bindOffset: T() });
    return value;
  };
  const text = (id, words, x, y, size, color, range, width = 600, z = 900, weight = 700) => {
    const height = size * 1.6;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="${width / 2}" y="${height * .69}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${xml(words)}</text></svg>`;
    project.layers.push({ id, name: words, type: 'image', src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width, height, color, local: T(x, y), zIndex: z, visible: range[0] === 0, opacity: 1, locked: false, boundBoneId: null });
    show(id, ...range);
  };
  const outside = [0, 10], inside = [10, 18], nook = [18, 24];
  const tree = (x, y, s = 1) => [R(x - 10 * s, y - 95 * s, 20 * s, 95 * s, '#9b7251'), E(x, y - 146 * s, 82 * s, 78 * s, '#54896a'), E(x - 48 * s, y - 119 * s, 56 * s, 55 * s, '#679d71'), E(x + 44 * s, y - 134 * s, 59 * s, 63 * s, '#75a878')];
  const plant = (x, y, s = 1) => [P(`M ${x - 24*s} ${y - 45*s} L ${x + 24*s} ${y - 45*s} L ${x + 18*s} ${y} L ${x - 18*s} ${y} Z`, '#bd6f50'), E(x, y - 82*s, 12*s, 38*s, '#4e8261'), E(x - 20*s, y - 72*s, 20*s, 14*s, '#689966'), E(x + 21*s, y - 91*s, 21*s, 14*s, '#689966')];
  const cup = () => [
    E(26, 20, 30, 5, '#543d2d', { opacity: .14 }),
    P('M 2 -30 L 49 -30 L 44 16 Q 26 23 8 16 Z', '#fff7df', '#6d4b34', 2),
    E(26, -30, 23, 6, '#774d31'), E(26, -31, 17, 3, '#b78452'),
    P('M 5 -20 C -20 -23 -18 10 8 6', 'none', '#fff7df', 7),
    E(26, -3, 11, 12, '#dca366'), P('M 25 -10 Q 18 -3 26 5 Q 33 0 25 -10', '#735235'),
  ];

  // 01 — garden, path, building, and an opening door.
  layer('garden-sky', 'Garden · morning sky', [R(0, 0, 1280, 720, '#d1e6df'), E(676, 128, 48, 48, '#f7d797'), P('M 0 450 Q 250 190 530 410 Q 740 250 1010 440 L 1280 410 L 1280 650 L 0 650 Z', '#b4cfa3'), R(0, 487, 1280, 190, '#7da572')], -100, outside);
  const clouds = layer('garden-clouds', 'Garden · drifting clouds', [E(250, 151, 75, 22, '#f8f4e7'), E(204, 143, 35, 27, '#f8f4e7'), E(282, 136, 42, 34, '#f8f4e7'), E(605, 232, 70, 21, '#f8f4e7')], -90, outside);
  track(clouds.id, 'x', [[0, 0], [10, 38]]);
  layer('garden-trees', 'Garden · trees and bushes', [...tree(98, 546, 1.5), ...tree(538, 549, .87), E(18, 547, 92, 52, '#527f5a'), E(426, 557, 98, 42, '#5f8f60')], -80, outside);
  layer('garden-bench', 'Garden · wooden bench', [R(248, 475, 161, 14, '#a7744d'), R(248, 497, 161, 14, '#ae7e54'), R(240, 531, 180, 15, '#a7744d'), R(260, 510, 10, 66, '#425b4e'), R(391, 510, 10, 66, '#425b4e')], -50, outside);
  layer('garden-path', 'Garden · footpath', [P('M 0 580 Q 530 575 770 582 L 1280 582 L 1280 720 L 0 720 Z', '#d8bf98'), R(0, 610, 1280, 4, '#efe0b9'), R(0, 696, 1280, 24, '#62865a'), ...[60, 214, 370, 528, 684, 840, 996, 1152].map(x => R(x, 647, 79, 3, '#c4a77f'))], -40, outside);
  layer('cafe-building', 'Bloom coffee · building', [R(770, 200, 460, 395, '#c88060'), R(792, 211, 417, 372, '#f1d9b4'), R(757, 184, 486, 30, '#a5654f'), R(760, 575, 485, 22, '#a36c50'), R(788, 262, 420, 72, '#365e4e'), R(812, 365, 167, 178, '#6a8e7f'), R(822, 375, 147, 158, '#c3d9c5'), R(830, 392, 128, 5, '#f8f1d9'), R(890, 375, 7, 158, '#f8f1d9'), R(998, 352, 174, 230, '#4c6556')], -20, outside);
  text('cafe-sign', 'BLOOM COFFEE', 999, 294, 31, '#fff2d6', outside, 410, -10);
  layer('cafe-awning', 'Café · striped awning', Array.from({ length: 10 }, (_, i) => [R(786 + i*42, 335, 42, 26, i%2 ? '#f4e6c5' : '#bc6c51'), E(807+i*42, 361, 21, 9, i%2 ? '#f4e6c5' : '#bc6c51')]).flat(), 0, outside);
  layer('cafe-door', 'Café · hinged entry door', [R(0, 0, 159, 221, '#a97955'), R(12, 12, 135, 162, '#b2ccc1'), R(18, 20, 124, 6, '#e8e6c9'), R(130, 177, 8, 15, '#f4d684'), R(18, 190, 94, 12, '#8a5a40')], 20, outside, T(1005, 355));
  track('cafe-door', 'scaleX', [[0, 1], [8.1, 1], [8.6, .15], [9.7, .15], [9.98, 1]], 'smooth');
  layer('cafe-exterior-props', 'Café · plants and chalkboard', [...plant(1195, 591, .72), P('M 827 495 L 892 495 L 908 581 L 812 581 Z', '#9d6c48'), R(829, 504, 60, 66, '#355747'), E(858, 550, 13, 13, '#c79e64')], 30, outside);
  text('open-sign', 'OPEN', 1084, 444, 20, '#355747', [0, 8.3], 110, 31);
  text('menu-outside', 'COFFEE', 859, 521, 11, '#fff1d3', outside, 64, 32);
  layer('garden-flowers', 'Garden · flower beds', [90, 140, 472, 512, 572, 715, 746].flatMap((x, i) => [R(x, 558, 3, 22, '#486b4c'), E(x, 554, 9, 9, i%2 ? '#edb85f' : '#d78479'), E(x, 554, 3, 3, '#fff0c0')]), 35, outside);
  text('garden-heading', 'A LITTLE COFFEE BREAK', 296, 60, 24, '#304e40', outside, 520);
  text('garden-subtitle', 'A walk through the garden', 279, 96, 17, '#52745e', outside, 480, 900, 400);

  // 02 — order at the counter, a barista, menu, coffee machine and handoff.
  layer('cafe-interior', 'Café interior · walls and floor', [R(0, 0, 1280, 720, '#f1e3c8'), R(0, 543, 1280, 177, '#bd9872'), R(0, 532, 1280, 13, '#547560'), ...[568, 620, 687].map(y => R(0, y, 1280, 2, '#a98261')), ...[200, 520, 870, 1170].map(x => P(`M ${x} 545 L ${x-70} 720`, 'none', '#a98261'))], -100, inside);
  layer('cafe-window', 'Café · garden window', [R(73, 152, 312, 304, '#567664'), R(87, 167, 283, 274, '#ccdfcc'), ...tree(204, 441, .72), R(221, 167, 9, 274, '#f5e9cb'), R(87, 307, 283, 9, '#f5e9cb'), R(63, 450, 332, 17, '#a37953')], -70, inside);
  layer('cafe-menu-board', 'Café · menu and shelves', [R(901, 130, 288, 232, '#aa7850'), R(912, 141, 266, 209, '#36594b'), R(479, 286, 230, 14, '#a67e54'), ...plant(667, 286, .5), R(509, 248, 28, 36, '#f5e6c1'), R(551, 248, 28, 36, '#f5e6c1'), R(593, 248, 28, 36, '#f5e6c1')], -50, inside);
  text('inside-heading', 'BLOOM COFFEE', 274, 60, 28, '#36594b', inside, 440);
  text('menu-title', 'TODAY’S MENU', 1045, 175, 23, '#f6e5bd', inside, 254, -30);
  text('menu-latte', 'LATTE     4.00', 1045, 226, 18, '#e8dbc0', inside, 240, -30, 400);
  text('menu-espresso', 'ESPRESSO     3.00', 1045, 268, 17, '#e8dbc0', inside, 240, -30, 400);
  text('menu-croissant', 'CROISSANT     3.50', 1045, 310, 16, '#e8dbc0', inside, 240, -30, 400);
  layer('barista', 'Barista · smiling server', [R(945, 365, 118, 173, '#658064'), E(1004, 346, 47, 52, '#e7ad78'), P('M 955 323 Q 1004 253 1053 323 Z', '#4b4836'), R(952, 312, 104, 14, '#4b4836'), E(988, 344, 4, 5, '#3c4537'), E(1021, 344, 4, 5, '#3c4537'), P('M 988 368 Q 1006 383 1024 368', 'none', '#6a5038', 3), R(971, 409, 71, 123, '#bc845b'), P('M 969 380 L 980 416 M 1036 381 L 1030 416', 'none', '#bc845b', 9), E(1006, 455, 20, 20, '#e6c79b')], 150, inside);
  layer('barista-hand', 'Barista · serving hand', [P('M 990 449 Q 940 448 910 488', 'none', '#658064', 22), E(911, 487, 15, 12, '#e7ad78')], 160, inside);
  track('barista-hand', 'x', [[10, 0], [13.8, 0], [14.8, -37], [15.6, 0], [18, 0]], 'smooth');
  layer('coffee-counter', 'Café · wooden service counter', [R(762, 530, 495, 118, '#b88057'), R(780, 555, 460, 6, '#cd9a6a'), R(744, 514, 524, 24, '#634b36'), R(744, 509, 524, 7, '#e2c29a'), ...[805, 914, 1023, 1132].map(x => R(x, 566, 2, 69, '#9b6847'))], 250, inside);
  layer('espresso-machine', 'Café · espresso machine and pastry', [R(1092, 431, 133, 77, '#d1bd9e'), R(1105, 440, 105, 33, '#455d52'), E(1118, 455, 7, 7, '#dfbd70'), R(1155, 465, 6, 29, '#657269'), R(1125, 502, 84, 5, '#4a5d51'), E(840, 507, 55, 6, '#dfd2b4'), P('M 802 501 Q 828 469 852 500 Q 828 488 802 501 Z', '#d8a465'), P('M 841 501 Q 865 472 887 501 Z', '#d8a465')], 260, inside);
  const bubble = (id, words, x, y, range, width = 360) => {
    layer(id, words, [E(0, 0, width/2, 44, '#fff9e9'), P('M -40 25 L -65 72 L -3 37 Z', '#fff9e9')], 850, range, T(x, y));
    text(`${id}-text`, words, x, y, 24, '#3c5142', range, width - 25);
  };
  bubble('order-bubble', 'One coffee, please!', 482, 238, [12.1, 14.4], 334);
  bubble('barista-bubble', 'Coming right up!', 931, 80, [14.45, 16.5], 352);

  // 03 — quiet garden-facing coffee nook.
  layer('coffee-nook', 'Coffee nook · garden-view corner', [R(0, 0, 1280, 720, '#efe0c5'), R(0, 560, 1280, 160, '#b78b64'), R(0, 550, 1280, 13, '#557661'), R(130, 130, 632, 345, '#66846d'), R(146, 146, 600, 312, '#cfdfc2'), ...tree(250, 457, .9), ...tree(650, 457, .85), R(435, 146, 11, 312, '#f9eed3'), R(146, 312, 600, 10, '#f9eed3'), R(117, 467, 658, 19, '#a57c54'), ...plant(1155, 643, 1.7), R(879, 0, 4, 112, '#8a7457'), P('M 824 161 Q 880 71 936 161 Z', '#59816b'), E(880, 162, 56, 7, '#eec779')], -100, nook);
  layer('coffee-table', 'Coffee nook · table and stool', [R(626, 609, 13, 79, '#72573d'), R(568, 609, 13, 79, '#72573d'), E(603, 606, 58, 15, '#97734f'), R(930, 585, 14, 116, '#6b5843'), E(936, 698, 70, 9, '#6b5843'), E(933, 582, 139, 24, '#a9774f'), E(933, 577, 139, 20, '#d2a678'), E(971, 577, 41, 7, '#f5e9c9'), ...plant(1039, 574, .36)], 200, nook);
  text('nook-title', 'A MOMENT TO SLOW DOWN', 440, 66, 26, '#3c604b', nook, 750);
  bubble('happy-bubble', 'Mmm… perfect.', 890, 281, [22, 24], 314);

  // Preserve the source character's colors and identity, but expose its legs and
  // give the right arm an elbow so the cup can reach the mouth naturally.
  const body = project.layers.find(item => item.id === 'character-body');
  body.shapes.find(item => item.id === 'torso').radiusY = 82;
  body.shapes.find(item => item.id === 'torso').radiusX = 91;
  const rightArm = project.bones.find(item => item.id === 'right-arm-bone'); rightArm.length = 65;
  const armArt = project.layers.find(item => item.id === 'character-right-arm');
  const oldHand = armArt.shapes.find(item => item.id === 'right-hand');
  const armFill = armArt.shapes[0].fill;
  armArt.shapes = [R(-15, 0, 30, 65, armFill, { stroke: '#d5fff0', strokeWidth: 4 }), E(0, 65, 15, 15, armFill)];
  project.bones.push({ id: 'right-forearm-bone', name: 'Right forearm · coffee reach', parentId: rightArm.id, length: 65, local: T(65, 0) });
  layer('character-right-forearm', 'Right forearm and hand', [R(-13, 0, 26, 60, armFill, { stroke: '#d5fff0', strokeWidth: 3 }), E(0, 65, 22, 17, oldHand?.fill ?? '#f0b45a')], 406);
  project.layers.find(item => item.id === 'character-right-forearm').boundBoneId = 'right-forearm-bone';
  project.bindings.push({ layerId: 'character-right-forearm', imageId: 'character-right-forearm', boneId: 'right-forearm-bone', bindOffset: T(0, 0, -Math.PI/2) });
  project.bones.push({ id: 'coffee-grip', name: 'Coffee cup · right hand attachment', parentId: 'right-forearm-bone', length: 0, local: T(65, 0) });
  const characterParts = project.layers.filter(item => item.id.startsWith('character-'));
  characterParts.forEach((item, i) => { item.zIndex = 400+i; track(item.id, 'opacity', [[0, 1], [9.1, 1], [9.8, 0, 'step'], [10, 1], [24, 1]]); });
  layer('character-contact-shadow', 'Character · moving contact shadow', [E(0, 0, 80, 10, '#3e4834', { opacity: .22 })], 300);
  layer('coffee-held', 'Coffee · attached cup', cup(), 700, [15.5, 24], T(), 'coffee-grip');
  layer('coffee-counter-cup', 'Coffee · barista handoff', cup(), 710, [14.2, 15.5]);
  layer('coffee-steam', 'Coffee · rising steam', [P('M 15 -46 Q 4 -59 17 -75 M 34 -47 Q 49 -62 35 -78', 'none', '#fff6df', 3)], 715, [15.5, 24], T(), 'coffee-grip');

  const baseBones = new Map(project.bones.map(bone => [bone.id, structuredClone(bone.local)]));
  function poseAt(t) {
    const ext = t < 10, order = t < 18;
    const scale = ext ? mix(.68, .50, smooth((t-9.1)/.6)) : order ? .91 : 1.04;
    const walk = ext ? clamp((t-1)/7.5) : order ? clamp((t-10)/1.7) : 0;
    const walking = ext ? t >= 1 && t < 9.3 : order && t < 11.7;
    const phase = (t-(ext ? 1 : 10))*Math.PI*2/.74;
    const gate = walking ? Math.min(1, (t-(ext ? 1 : 10))/.2, ((ext ? 9.3 : 11.7)-t)/.25) : 0;
    const swing = Math.sin(phase)*.57*Math.max(0, gate);
    const x = ext ? mix(146, 1084, walk) : order ? mix(314, 501, walk) : 626;
    const floor = ext ? 614 : 646;
    const rootLocal = T(x, floor - 120*scale - (walking ? Math.abs(Math.sin(phase))*4 : 0), -Math.PI/2, scale);
    const poses = { root: rootLocal };
    for (const [id, sign] of [['left-leg-bone', 1], ['right-leg-bone', -1]]) {
      poses[id] = { ...baseBones.get(id), rotation: baseBones.get(id).rotation + swing*sign, x: baseBones.get(id).x + Math.max(0, Math.sin(phase)*sign)*14*Math.max(0, gate) };
    }
    poses['left-arm-bone'] = { ...baseBones.get('left-arm-bone'), rotation: Math.PI - swing*.6 };
    let hand = { x: 103 - Math.sin(-swing*.6)*123, y: -48 + Math.cos(-swing*.6)*123 };
    if (!walking) hand = { x: 113, y: 78 };
    if (t >= 12 && t < 14.2) {
      const wave = smooth((t-12)/.4) * smooth((14.2-t)/.4);
      hand = { x: mix(113, 219, wave), y: mix(78, -89 + Math.sin(t*9)*8, wave) };
    }
    if (t >= 14.2) {
      const reach = smooth((t-14.2)/1.3);
      hand = { x: mix(113, 213, reach), y: mix(78, 9, reach) };
    }
    // Two lifts and sips, each returning the cup to a relaxed holding pose.
    let sip = 0;
    if (t >= 18) {
      sip = t < 21.4 ? smooth((t-18.55)/.9) * (1-smooth((t-20.75)/.65)) : smooth((t-22.15)/.7) * (1-smooth((t-23.25)/.6));
      hand = { x: mix(188, -18, sip), y: mix(8, -62, sip) - Math.sin(sip*Math.PI)*64 };
    }
    const dx = hand.x - 103, dy = hand.y + 48, distance = Math.min(129.8, Math.max(5, Math.hypot(dx, dy)));
    const direction = Math.atan2(dy, dx), elbow = Math.acos(distance/130);
    const upperWorld = direction + elbow, lowerWorld = direction - elbow;
    poses['right-arm-bone'] = { ...baseBones.get('right-arm-bone'), rotation: upperWorld + Math.PI/2 };
    poses['right-forearm-bone'] = T(65, 0, lowerWorld-upperWorld);
    poses['coffee-grip'] = T(65, 0, -lowerWorld - sip*.22);
    poses['head-bone'] = { ...baseBones.get('head-bone'), rotation: (walking ? Math.sin(phase)*.022 : .025*Math.sin(t*2)) + sip*.055 };
    return { poses, sip, floor, scale };
  }
  const samples = Array.from({ length: clip.endFrame+1 }, (_, frame) => ({ t: frame/fps, ...poseAt(frame/fps) }));
  for (const id of ['root', 'left-leg-bone', 'right-leg-bone', 'left-arm-bone', 'right-arm-bone', 'right-forearm-bone', 'coffee-grip', 'head-bone']) {
    track(id, 'transform', samples.map(({ t, poses }) => [t, poses[id], t === 10-1/fps || t === 18-1/fps ? 'step' : 'linear']));
  }
  for (const bone of project.bones) if (samples[0].poses[bone.id]) bone.local = structuredClone(samples[0].poses[bone.id]);
  track('character-contact-shadow', 'transform', samples.map(({ t, poses, floor, scale }) => [t, T(poses.root.x, floor, 0, scale), t === 10-1/fps || t === 18-1/fps ? 'step' : 'linear']));
  const pickup = poseAt(15.5).poses;
  const pickupWorld = compose(compose(compose(pickup.root, pickup['right-arm-bone']), pickup['right-forearm-bone']), pickup['coffee-grip']);
  track('coffee-counter-cup', 'transform', [[0, T(908, 491, 0, .91)], [14.2, T(908, 491, 0, .91)], [15.5, pickupWorld], [24, pickupWorld]], 'smooth');
  track('coffee-steam', 'opacity', samples.map(({ t, sip }) => [t, .45 + .15*Math.sin(t*6) - sip*.2]));
  const face = project.layers.find(item => item.id === 'character-face'), initialFace = structuredClone(face.shapes);
  const faceFrames = [];
  for (let frame = 0; frame <= clip.endFrame; frame += 2) {
    const t = frame/fps, shapes = structuredClone(initialFace);
    const blink = [2.2, 5.4, 8.1, 11.5, 16.4, 21.8].some(time => t >= time && t < time+.14);
    for (const shape of shapes) if (shape.id.endsWith('eye') || shape.id.endsWith('pupil')) { if (blink) shape.radiusY = 2; }
    const mouth = shapes.findIndex(shape => shape.id === 'smile');
    if (mouth >= 0 && ((t > 12.15 && t < 14 && Math.floor(t*8)%2) || poseAt(t).sip > .9)) shapes[mouth] = { id: 'smile', kind: 'ellipse', x: 0, y: -13, radiusX: 11, radiusY: 8, fill: '#162431' };
    faceFrames.push([t, shapes]);
  }
  track(face.id, 'shapes', faceFrames, 'step');
  clip.setupPose = Object.fromEntries([...project.bones, ...project.layers].map(item => [item.id, { local: structuredClone(item.local), ...(item.type ? { opacity: item.opacity, visible: item.visible } : {}) }]));
  project.metadata = { ...source.metadata, createdBy: 'character-studio-mcp', story: 'garden_to_coffee_shop', sourceCharacter: source.name, durationSeconds: '24', storyboard: '0–10: garden walk and café entry; 10–18: order, barista and cup handoff; 18–24: garden-view coffee nook, two sips', cupLayerId: 'coffee-held', cupGripId: 'coffee-grip' };
  return project;
}
