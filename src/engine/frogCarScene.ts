import { createCarDemo } from './carDemo';
import { createFrogViewDemo } from './characterViewDemo';
import { addCamera, setCameraCut } from './camera';
import { createId, Rig } from './Rig';
import { identity } from './math';
import type { AnimationClip, CharacterViewSet, CharacterViewTarget, ProjectAudio, SerializableValue, VectorShape } from './model';
import type { Transform2D } from './math';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const ink = '#253f46';
const path = (d: string, fill: string, stroke = ink, strokeWidth = 3): VectorShape => ({ id: createId('shape'), kind: 'path', d, fill, stroke, strokeWidth });
const ellipse = (x: number, y: number, radiusX: number, radiusY: number, fill: string, opacity = 1): VectorShape => ({ id: createId('shape'), kind: 'ellipse', x, y, radiusX, radiusY, fill, stroke: 'none', opacity });
const rect = (x: number, y: number, width: number, height: number, fill: string): VectorShape => ({ id: createId('shape'), kind: 'rect', x, y, width, height, fill });

/** Original PCM soundtrack: soft bells, door click, jump chirp, and engine hum. */
function sceneSoundtrack(duration: number): ProjectAudio {
  const sampleRate = 16000, count = Math.round(duration * sampleRate);
  const bytes = new Uint8Array(44 + count * 2), data = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, index) => bytes[offset + index] = char.charCodeAt(0));
  text(0, 'RIFF'); data.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true); data.setUint32(24, sampleRate, true);
  data.setUint32(28, sampleRate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); text(36, 'data'); data.setUint32(40, count * 2, true);
  const peaks = Array.from({ length: 160 }, () => 0);
  const notes = [[.2, 523.25], [.48, 659.25], [.76, 783.99], [8.7, 783.99], [9, 659.25], [9.3, 523.25]];
  for (let index = 0; index < count; index++) {
    const t = index / sampleRate;
    let sample = 0;
    for (const [start, frequency] of notes) {
      const dt = t - start;
      if (dt >= 0 && dt < 1) sample += .1 * Math.exp(-dt * 6) * Math.sin(2 * Math.PI * frequency * dt);
    }
    const door = t - .9;
    if (door >= 0 && door < .12) sample += .1 * Math.exp(-door * 45) * Math.sin(2 * Math.PI * 1300 * door);
    const jump = t - 1.3;
    if (jump >= 0 && jump < .55) sample += .05 * Math.sin(Math.PI * jump / .55) * Math.sin(2 * Math.PI * (300 * jump + 500 * jump * jump));
    if (t >= 3 && t < 9.5) {
      const envelope = Math.min(1, (t - 3) / .6, (9.5 - t) / .7);
      sample += envelope * (.045 * Math.sin(2 * Math.PI * 90 * t + 2 * Math.sin(2 * Math.PI * 2.7 * t)) + .02 * Math.sin(2 * Math.PI * 180 * t));
    }
    const horn = t - 5.6;
    if (horn >= 0 && horn < .24) sample += .06 * Math.sin(Math.PI * horn / .24) * (Math.sin(2 * Math.PI * 440 * horn) + Math.sin(2 * Math.PI * 554.37 * horn));
    sample = Math.max(-1, Math.min(1, sample)); data.setInt16(44 + index * 2, Math.round(sample * 32767), true);
    const bucket = Math.min(peaks.length - 1, Math.floor(index / count * peaks.length)); peaks[bucket] = Math.max(peaks[bucket], Math.abs(sample));
  }
  let binary = ''; for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return { id: createId('audio'), name: 'Original frog road-trip soundtrack.wav', src: `data:audio/wav;base64,${btoa(binary)}`, duration, offsetSeconds: 0, volume: .8, muted: false, peaks };
}

/** A complete editable ten-second project, built from the existing car and frog rigs. */
export function createFrogCarScene(): Rig {
  const rig = createCarDemo(); rig.name = 'Moss · frog car ride'; rig.canvas.background = '#c4e6de';
  rig.animations = []; rig.actionLibrary = []; rig.controllers = []; rig.controllerInstances = [];
  const chassis = [...rig.bones.values()].find(bone => bone.name === 'Chassis')!;
  chassis.local = { ...identity(), x: 440, y: 310 };
  rig.update();

  const artwork = (name: string, shapes: VectorShape[], zIndex: number, boneId?: string, depth = 0, parallax = 1) => {
    const id = rig.addVectorLayer(name, shapes), layer = rig.layers.get(id)!;
    layer.local = identity(); layer.zIndex = zIndex; layer.depth = depth; layer.parallax = parallax;
    if (boneId) rig.bindings.set(id, { layerId: id, imageId: id, boneId, bindOffset: identity() });
    rig.update(); return id;
  };
  const anchor = (name: string, parentId: string | null, local: Partial<Transform2D>) => {
    const id = rig.addBone(parentId, name, 0); rig.bones.get(id)!.local = { ...identity(), ...local }; rig.update(); return id;
  };

  artwork('Sky · mint morning', [rect(-1500, -1000, 3800, 2000, '#c4e6de'), ellipse(657, 95, 39, 39, '#ffe4a2')], -1000, undefined, -650, .15);
  artwork('Clouds · distant', [ellipse(132, 96, 42, 17, '#f4fbef'), ellipse(174, 89, 48, 22, '#f4fbef'), ellipse(216, 99, 39, 15, '#f4fbef'), ellipse(540, 146, 45, 16, '#f4fbef'), ellipse(581, 138, 48, 21, '#f4fbef')], -900, undefined, -500, .2);
  artwork('Hills · depth plane', [path('M -1500 380 Q -1300 160 -1100 340 Q -900 130 -680 340 Q -450 130 -220 340 Q 20 100 230 330 Q 430 155 640 340 Q 880 150 1100 340 Q 1350 130 1600 340 L 2200 620 L -1500 620 Z', '#8cb9a5', 'none')], -800, undefined, -240, .45);
  artwork('Meadow · roadside', [rect(-1500, 318, 3800, 300, '#8ebf83'), rect(-1500, 389, 3800, 8, '#e2eac0')], -700);
  artwork('Road · asphalt', [rect(-1500, 397, 3800, 400, '#526a6d'), rect(-1500, 408, 3800, 3, '#829c97')], -600);
  const scenery = anchor('Passing trees', null, {});
  artwork('Trees · moving scenery', [0, 340, 690, 1060, 1430, 1800].flatMap((x, index) => [rect(x + 32, 273, 13, 74, '#8d9c72'), ellipse(x + 40, 260, 49, 52, index % 2 ? '#619776' : '#70a482'), ellipse(x + 19, 274, 35, 32, '#619776')]), -650, scenery, -120, .65);
  const road = anchor('Road markings', null, { y: 453 });
  artwork('Road · moving lane stripes', Array.from({ length: 38 }, (_, i) => rect((i - 5) * 112, 0, 61, 7, '#e6edce')), -590, road);
  artwork('Car · soft contact shadow', [ellipse(0, 96, 191, 14, '#233f46', .2)], 5, chassis.id);

  const body = [...rig.layers.values()].find(layer => layer.name === 'Car body')!;
  if (body.type === 'vector') body.shapes = [
    path('M -198 7 Q -191 -35 -154 -49 L -84 -63 Q -40 -70 6 -69 L 101 -62 Q 151 -56 180 -20 L 201 7 Q 204 26 188 35 L -186 35 Q -204 27 -198 7 Z M -110 -50 L -110 27 L 46 27 L 46 -50 Z', '#e7a16a', ink, 4),
    path('M -158 -26 L -124 -32 M 102 -32 L 157 -25', 'none', '#ffd2a3', 4),
    ellipse(161, -5, 10, 7, '#fff2ca'), ellipse(-172, -5, 9, 7, '#db6c58'),
  ];
  body.zIndex = 180;
  for (const layer of rig.layers.values()) {
    if (/Wheel (FR|RR)/.test(layer.name)) layer.visible = false;
    if (/Wheel (FL|RL)/.test(layer.name)) layer.zIndex = 320;
    if (/undercarriage/.test(layer.name)) { layer.zIndex = 175; if (layer.type === 'vector') layer.shapes[0].fill = '#ad704c'; }
    if (/trim/.test(layer.name)) layer.zIndex = 270;
  }
  artwork('Car · open cabin and seat', [path('M -126 -56 L 49 -56 L 56 28 L -129 28 Z', '#334b50', ink, 2), path('M -70 -48 L -32 -48 L -21 27 L -74 27 Z', '#b88a64', ink, 3), path('M -64 -42 L -58 18', 'none', '#e0af87', 3)], 30, chassis.id);
  artwork('Car · windshield', [path('M 74 -48 L 60 -109 L 107 -87 L 127 -46 Z', '#b7e4db', ink, 3), path('M 77 -91 L 106 -54', 'none', '#eaf7e9', 4)], 280, chassis.id);
  const door = anchor('Car door · hinge', chassis.id, { x: -110, y: -24 });
  artwork('Car · opening door', [path('M 0 0 L 156 0 L 156 51 L 0 51 Z', '#e7a16a', ink, 3), path('M 11 8 L 143 8', 'none', '#ffd2a3', 4), path('M 124 19 L 139 19', 'none', ink, 4), path('M 10 43 L 143 43', 'none', '#bd7e53', 3)], 260, door);
  const steering = anchor('Steering wheel · cockpit', chassis.id, { x: 15, y: -35 });
  artwork('Car · steering wheel', [ellipse(0, 0, 18, 18, ink), ellipse(0, 0, 13, 13, '#9fac91'), path('M 0 -14 L 0 14 M -14 0 L 14 0', 'none', ink, 3), ellipse(0, 0, 5, 5, '#e9c28d')], 300, steering);

  // Merge the frog as ordinary parts; fresh IDs keep the two rigs independent.
  const frog = createFrogViewDemo().toProject();
  const ids = new Map([...frog.bones.map(bone => [bone.id, createId('bone')]), ...frog.layers.map(layer => [layer.id, createId('layer')])] as Array<[string, string]>);
  const frogRoot = frog.bones.find(bone => !bone.parentId)!;
  const stand: Transform2D = { x: -240, y: 40, rotation: frogRoot.local.rotation, scaleX: .55, scaleY: .55 };
  const targets = (source: Record<string, CharacterViewTarget>) => Object.fromEntries(Object.entries(source).map(([id, state]) => {
    const target = clone(state); if (target.zIndex !== undefined) target.zIndex += 100;
    if (id === frogRoot.id) {
      target.local = { ...stand, x: stand.x + (state.local.x - frogRoot.local.x) * .55, y: stand.y + (state.local.y - frogRoot.local.y) * .55,
        rotation: stand.rotation + state.local.rotation - frogRoot.local.rotation, scaleX: stand.scaleX * state.local.scaleX / frogRoot.local.scaleX, scaleY: stand.scaleY * state.local.scaleY / frogRoot.local.scaleY };
    }
    return [ids.get(id)!, target];
  }));
  const project = rig.toProject();
  project.bones.push(...frog.bones.map(bone => ({ ...clone(bone), id: ids.get(bone.id)!, name: `Moss · ${bone.name}`, parentId: bone.parentId ? ids.get(bone.parentId)! : chassis.id, childrenIds: [], local: bone.id === frogRoot.id ? { ...stand } : { ...bone.local } })));
  project.layers.push(...frog.layers.map(layer => ({ ...clone(layer), id: ids.get(layer.id)!, name: `Moss · ${layer.name}`, zIndex: layer.zIndex + 100, boundBoneId: layer.boundBoneId ? ids.get(layer.boundBoneId)! : null })));
  project.bindings.push(...frog.bindings.map(binding => ({ ...clone(binding), id: createId('binding'), layerId: ids.get(binding.layerId ?? binding.imageId)!, imageId: ids.get(binding.imageId)!, boneId: ids.get(binding.boneId)! })));
  const views: CharacterViewSet[] = (frog.characterViews ?? []).map(set => ({ ...clone(set), id: createId('character'), name: 'Moss · frog driver', angle: 45,
    targetIds: set.targetIds.map(id => ids.get(id)!), baseline: targets(set.baseline), views: set.views.map(view => ({ ...clone(view), id: createId('view'), targets: targets(view.targets) })) }));
  project.characterViews = views; rig.loadProject(project);
  const rider = rig.bones.get(ids.get(frogRoot.id)!)!;
  const rightArm = [...rig.bones.values()].find(bone => bone.name === 'Moss · Right front arm')!;
  const rightPalm = [...rig.bones.values()].find(bone => bone.name === 'Moss · Right front palm')!;
  const leftArm = [...rig.bones.values()].find(bone => bone.name === 'Moss · Left front arm')!;
  const head = [...rig.bones.values()].find(bone => bone.name === 'Moss · Frog head')!;
  const seat = { ...stand, x: -20, y: -40 };
  const armStart = { ...rightArm.local }, palmStart = { ...rightPalm.local };
  rider.local = { ...seat }; rig.characterViews[0].angle = 75; rig.update();
  rig.solveIK(rightPalm.id, { x: chassis.local.x + 15, y: chassis.local.y - 35 }, 2);
  const armDriving = { ...rightArm.local }, palmDriving = { ...rightPalm.local };
  rider.local = { ...stand }; rightArm.local = armStart; rightPalm.local = palmStart; rig.characterViews[0].angle = 45; rig.update();

  const clip: AnimationClip = { id: createId('animation'), name: 'Frog boards → door closes → car ride', fps: 24, startFrame: 0, endFrame: 240, tracks: [] };
  const key = (targetId: string, property: string, values: Array<[number, SerializableValue, ('linear' | 'smooth' | 'step')?]>) => {
    clip.tracks.push({ id: createId('track'), targetId, property, keyframes: values.map(([frame, value, easing]) => ({ id: createId('key'), frame, value, easing: easing ?? 'smooth' })) });
  };
  const pose = (value: Transform2D) => value as unknown as SerializableValue;
  key(chassis.id, 'transform', [[0, pose({ ...chassis.local })], [72, pose({ ...chassis.local })], [105, pose({ ...chassis.local, x: 463, y: 308.5 })], [145, pose({ ...chassis.local, x: 503, y: 310.5 })], [190, pose({ ...chassis.local, x: 538, y: 309 })], [216, pose({ ...chassis.local, x: 550, y: 310 })], [240, pose({ ...chassis.local, x: 555, y: 310 })]]);
  key(rider.id, 'transform', [[0, pose(stand)], [26, pose(stand)], [43, pose({ ...stand, x: -150, y: -99, rotation: stand.rotation + .1 })], [65, pose(seat)], [240, pose(seat)]]);
  const doorPose = { ...rig.bones.get(door)!.local };
  key(door, 'transform', [[0, pose(doorPose)], [12, pose(doorPose)], [25, pose({ ...doorPose, rotation: -.45, scaleX: .24 })], [54, pose({ ...doorPose, rotation: -.45, scaleX: .24 })], [72, pose(doorPose)], [240, pose(doorPose)]]);
  key(rightArm.id, 'transform', [[0, pose(armStart)], [52, pose(armStart)], [80, pose(armDriving)], [240, pose(armDriving)]]);
  key(rightPalm.id, 'transform', [[0, pose(palmStart)], [52, pose(palmStart)], [80, pose(palmDriving)], [240, pose(palmDriving)]]);
  key(leftArm.id, 'rotation', [[0, leftArm.local.rotation], [12, leftArm.local.rotation + .45], [24, leftArm.local.rotation], [72, leftArm.local.rotation], [212, leftArm.local.rotation], [225, leftArm.local.rotation + .4], [236, leftArm.local.rotation], [240, leftArm.local.rotation + .3]]);
  key(head.id, 'rotation', [[0, head.local.rotation], [25, head.local.rotation - .1], [72, head.local.rotation], [160, head.local.rotation + .05], [240, head.local.rotation]]);
  key(views[0].id, 'viewAngle', [[0, 45, 'linear'], [64, 45, 'linear'], [92, 75, 'linear'], [210, 75, 'linear'], [240, 0, 'linear']]);
  key(road, 'x', [[0, 0, 'linear'], [72, 0, 'linear'], [216, -1090], [240, -1120]]);
  key(scenery, 'x', [[0, 0, 'linear'], [72, 0, 'linear'], [216, -360], [240, -370]]);
  key(steering, 'rotation', [[0, 0], [85, -.08], [125, .1], [167, -.06], [215, 0], [240, 0]]);
  for (const wheel of [...rig.bones.values()].filter(bone => /^Wheel /.test(bone.name))) key(wheel.id, 'spin', [[0, 0, 'linear'], [72, 0, 'linear'], [216, Math.PI * 8], [240, Math.PI * 8.1]]);
  clip.setupPose = Object.fromEntries([...rig.bones.values(), ...rig.layers.values()].map(target => [target.id, { local: { ...target.local }, ...(rig.layers.has(target.id) ? { opacity: rig.layers.get(target.id)!.opacity } : {}) }]));
  rig.animations = [clip]; rig.setTimeline({ activeAnimationId: clip.id, currentFrame: 0, fps: 24, startFrame: 0, endFrame: 240, loop: false, isPlaying: false });
  rig.applyAnimation(clip, 0);
  const shot = (name: string, zoom: number, cameraX: number, cameraY: number, follow = false) => {
    rig.cameraView = 'preview'; rig.setStage2D({ enabled: true, zoom, cameraX, cameraY, perspective: .12 });
    const id = addCamera(rig, name)!;
    if (follow) rig.cameras.find(camera => camera.id === id)!.follow = { targetId: chassis.id, anchorX: 440, anchorY: 310 };
    return id;
  };
  const wide = shot('01 · Boarding — wide', .9, 0, 0);
  const driving = shot('02 · Driving — follow car', 1.12, -44.8, -34, true);
  const finish = shot('03 · Arrival — wide', .9, -36, 0, true);
  rig.setTimeline({ currentFrame: 0 }); setCameraCut(rig, wide);
  rig.setTimeline({ currentFrame: 72 }); setCameraCut(rig, driving);
  rig.setTimeline({ currentFrame: 216 }); setCameraCut(rig, finish);
  rig.cameraView = 'switch'; rig.applyAnimation(clip, 0);
  rig.audio = sceneSoundtrack(10);
  rig.metadata = { example: 'Complete frog car ride scene', description: 'A ten-second editable animation: opening car door, frog boarding, steering, spinning wheels, scrolling road, three camera shots, and original sound.',
    storyboard: '0–72 boarding and door close; 72–216 drive; 216–240 arrival and wave', chassisId: chassis.id, frogRootId: rider.id, sceneDurationSeconds: '10', soundtrack: 'Original synthesized PCM audio, embedded locally' };
  rig.update(); return rig;
}
