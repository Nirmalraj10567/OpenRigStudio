import { addCharacterView, addCharacterViewSet, FULL_TURN_VIEWS, setCharacterViewAngle } from './characterViews';
import { createDemoRig } from './demoRig';
import { createId, Rig } from './Rig';
import { identity, worldToLocalPoint } from './math';
import type { CharacterViewSet, VectorShape } from './model';

const ink = '#243e40', green = '#77c983', dark = '#3c9068', cream = '#f5e7b5';
const ellipse = (x: number, y: number, radiusX: number, radiusY: number, fill: string, stroke = ink): VectorShape => ({ id: createId('shape'), kind: 'ellipse', x, y, radiusX, radiusY, fill, stroke, strokeWidth: 3 });
const path = (d: string, fill: string, stroke = ink, strokeWidth = 3): VectorShape => ({ id: createId('shape'), kind: 'path', d, fill, stroke, strokeWidth });

/** Project the authored joint layout for an original demo's prepared angles. */
function layoutView(rig: Rig, set: CharacterViewSet, angle: number) {
  const width = .2 + .8 * Math.abs(Math.cos(angle * Math.PI / 180));
  const root = rig.getRoots()[0], cx = root.world.x;
  const projected = new Map<string, { x: number; y: number; rotation: number; scaleX: number; scaleY: number; length: number }>();
  for (const bone of rig.bones.values()) {
    const end = rig.getBoneEnd(bone.id)!;
    const x = cx + (bone.world.x - cx) * width, y = bone.world.y;
    const endX = cx + (end.x - cx) * width;
    projected.set(bone.id, { ...identity(), x, y, rotation: Math.atan2(end.y - y, endX - x), length: Math.hypot(endX - x, end.y - y) });
  }
  const view = set.views.find(item => item.angle === angle)!;
  for (const bone of rig.bones.values()) {
    const world = projected.get(bone.id)!, parent = bone.parentId ? projected.get(bone.parentId) : undefined;
    const point = parent ? worldToLocalPoint(parent, world)! : world;
    view.targets[bone.id].local = { ...identity(), x: point.x, y: point.y, rotation: world.rotation - (parent?.rotation ?? 0) };
    view.targets[bone.id].length = world.length;
  }
  for (const layer of rig.layers.values()) {
    if (layer.boundBoneId) {
      const bone = rig.bones.get(layer.boundBoneId)!, world = projected.get(bone.id)!;
      const target = view.targets[layer.id];
      // Limbs use bone-local X; upright face/body artwork keeps its orientation.
      if (Math.abs(layer.local.rotation) < .001) target.local.scaleX *= world.length / Math.max(1, bone.length);
      else target.local.rotation += bone.world.rotation - world.rotation;
      if (/left|right/i.test(layer.name)) {
        const left = /left/i.test(layer.name), nearLeft = angle < 0;
        target.zIndex = (left === nearLeft ? 30 : -10) + layer.zIndex;
        if (Math.abs(angle) === 90 && left !== nearLeft) target.opacity = .75;
      }
    }
  }
}

function addViews(rig: Rig, name: string) {
  const id = addCharacterViewSet(rig, name, [...rig.bones.keys(), ...rig.layers.keys()])!;
  FULL_TURN_VIEWS.filter(view => view.angle !== 0).forEach(view => addCharacterView(rig, id, view.angle, view.name));
  return rig.characterViews.find(set => set.id === id)!;
}

function animateTurn(rig: Rig, set: CharacterViewSet) {
  rig.setTimeline({ currentFrame: 0 }); setCharacterViewAngle(rig, set.id, 0, true, true);
  for (const [index, angle] of [-45, -90, -135, -180].entries()) {
    rig.setTimeline({ currentFrame: (index + 1) * 24 }); setCharacterViewAngle(rig, set.id, angle, true);
  }
  rig.setTimeline({ currentFrame: 120 }); setCharacterViewAngle(rig, set.id, -360, true);
  rig.applyAnimation(rig.timeline.activeAnimationId, 0);
  rig.metadata.multiViewDemo = 'Front 0° → Front Side -45° → Side -90° → Back Side -135° → Back -180°. Eight prepared views, one reusable rig.';
}

export function createHumanViewDemo(): Rig {
  const rig = createDemoRig(); rig.name = 'Pip · multi-view character';
  const set = addViews(rig, 'Pip · whole character');
  const head = [...rig.layers.values()].find(layer => /Helmet/.test(layer.name))!;
  const torso = [...rig.layers.values()].find(layer => /Jacket/.test(layer.name))!;
  for (const view of set.views) {
    if (view.angle === 0) continue;
    layoutView(rig, set, view.angle);
    const angle = Math.abs(view.angle), side = angle === 90, back = angle > 90, direction = Math.sign(view.angle);
    const w = side ? 24 : angle === 45 || angle === 135 ? 35 : 43;
    const shapes = [ellipse(0, -44, w, 44, '#ffbd71'), path(`M ${-w} -59 Q 0 -83 ${w} -59`, 'none', cream, 5), path(`M ${-w} -56 Q 0 -70 ${w} -56`, 'none', '#d08453', 4)];
    if (back) shapes.push(path('M 0 -70 L 0 -8', 'none', '#d08453', 3), ellipse(0, -39, 15, 21, '#e5a164'));
    else {
      shapes.push(ellipse(direction * (side ? 13 : 5), -42, side ? 15 : w - 9, 17, ink));
      if (!side) shapes.push(ellipse(-12 + direction * 8, -43, 4, 7, '#a7f3df'));
      shapes.push(ellipse((side ? direction * 16 : 12 + direction * 8), -43, 4, 7, '#a7f3df'), path(`M ${direction * 9 - 5} -24 Q ${direction * 9} -20 ${direction * 9 + 5} -24`, 'none', cream, 2));
      if (side) shapes.push(path(direction < 0 ? 'M -22 -45 L -34 -31 L -22 -30' : 'M 22 -45 L 34 -31 L 22 -30', '#ffbd71'));
    }
    view.targets[head.id].artwork = { type: 'vector', shapes };
    view.targets[head.id].zIndex = 100;
    view.targets[torso.id].local.scaleX *= side ? .45 : angle === 45 || angle === 135 ? .75 : 1;
    view.targets[torso.id].zIndex = 20;
    if (back) view.targets[torso.id].artwork = { type: 'vector', shapes: [
      path('M -28 -105 Q -53 -102 -52 -78 L -42 -9 Q 0 18 42 -9 L 52 -78 Q 53 -102 28 -105 Z', '#33978f'),
      path('M -27 -92 L 27 -92 L 32 -23 Q 0 -8 -32 -23 Z', '#e5a164'),
      path('M -20 -85 L -20 -30 M 20 -85 L 20 -30', 'none', cream, 4), ellipse(0, -56, 12, 12, '#f37b72'),
    ] };
  }
  animateTurn(rig, set); return rig;
}

export function createFrogViewDemo(): Rig {
  const rig = new Rig(); rig.name = 'Moss · custom frog views'; rig.canvas.background = '#202d31';
  const bone = (parentId: string | null, name: string, x: number, y: number, endX: number, endY: number) => {
    const id = rig.addBone(parentId, name, Math.hypot(endX - x, endY - y));
    const parent = parentId ? rig.bones.get(parentId) : undefined;
    const point = parent ? worldToLocalPoint(parent.world, { x, y })! : { x, y };
    rig.bones.get(id)!.local = { ...identity(), ...point, rotation: Math.atan2(endY - y, endX - x) - (parent?.world.rotation ?? 0) }; rig.update(); return id;
  };
  const art = (boneId: string, name: string, shapes: VectorShape[], upright = false) => {
    const id = rig.addVectorLayer(name, shapes), layer = rig.layers.get(id)!;
    layer.local = { ...identity(), rotation: upright ? -rig.bones.get(boneId)!.world.rotation : 0 };
    rig.bindings.set(id, { layerId: id, imageId: id, boneId, bindOffset: identity() }); rig.update(); return id;
  };
  const limb = (id: string, name: string, radius: number, fill: string) => {
    const length = rig.bones.get(id)!.length;
    return art(id, name, [ellipse(length / 2, 0, length / 2 + 8, radius, fill), ellipse(length, 0, radius - 3, radius - 3, green)]);
  };
  const root = bone(null, 'Frog body', 400, 305, 400, 225);
  const headBone = bone(root, 'Frog head', 400, 225, 400, 155);
  for (const [side, sign] of [['Left', -1], ['Right', 1]] as const) {
    const thigh = bone(root, `${side} hind thigh`, 400 + sign * 48, 305, 400 + sign * 105, 345);
    const shin = bone(thigh, `${side} hind shin`, 400 + sign * 105, 345, 400 + sign * 52, 386);
    const foot = bone(shin, `${side} webbed foot`, 400 + sign * 52, 386, 400 + sign * 112, 398);
    limb(thigh, `${side} haunch`, 27, dark); limb(shin, `${side} hind leg`, 13, green);
    art(foot, `${side} webbed toes`, [path('M -8 -8 L 50 -15 L 62 -6 L 50 1 L 65 10 L 50 16 L -8 10 Z', green)]);
    const arm = bone(root, `${side} front arm`, 400 + sign * 53, 248, 400 + sign * 75, 304);
    const hand = bone(arm, `${side} front palm`, 400 + sign * 75, 304, 400 + sign * 90, 325);
    limb(arm, `${side} front arm artwork`, 12, dark);
    art(hand, `${side} fingers`, [path('M -5 -8 L 26 -15 L 32 -7 L 23 -2 L 35 6 L 29 13 L 22 8 L -5 9 Z', green)]);
  }
  const body = art(root, 'Frog torso · belly', [ellipse(0, -5, 65, 83, green), ellipse(0, 6, 46, 57, cream, 'none')], true);
  const head = art(headBone, 'Frog head artwork', [ellipse(0, -16, 83, 51, green), ellipse(-48, -50, 30, 33, green), ellipse(48, -50, 30, 33, green)], true);
  const leftEye = art(headBone, 'Left eye', [ellipse(-48, -54, 22, 25, cream), ellipse(-47, -55, 9, 15, ink, 'none'), ellipse(-43, -61, 3, 4, '#fff', 'none')], true);
  const rightEye = art(headBone, 'Right eye', [ellipse(48, -54, 22, 25, cream), ellipse(47, -55, 9, 15, ink, 'none'), ellipse(51, -61, 3, 4, '#fff', 'none')], true);
  const mouth = art(headBone, 'Frog smile', [path('M -49 -13 Q 0 17 49 -13', 'none', ink, 4), ellipse(-60, -12, 10, 5, '#df9990', 'none'), ellipse(60, -12, 10, 5, '#df9990', 'none')], true);
  const set = addViews(rig, 'Moss · custom frog');
  for (const view of set.views) {
    if (view.angle !== 0) layoutView(rig, set, view.angle);
    const angle = Math.abs(view.angle), back = angle > 90, side = angle === 90, direction = Math.sign(view.angle);
    const width = side ? .7 : angle === 45 || angle === 135 ? .85 : 1;
    view.targets[body].local.scaleX *= width;
    view.targets[body].zIndex = 20;
    view.targets[head].zIndex = 100;
    if (back) {
      view.targets[body].artwork = { type: 'vector', shapes: [ellipse(0, -5, 65 * width, 83, dark), ellipse(-18, -24, 11, 15, '#2e7457', 'none'), ellipse(19, 4, 14, 18, '#2e7457', 'none'), ellipse(-14, 33, 9, 11, '#2e7457', 'none')] };
      const quarter = angle === 135;
      view.targets[head].artwork = { type: 'vector', shapes: [ellipse(quarter ? direction * 9 : 0, -18, 78 * width, 51, dark), ellipse(-40 * width, -50, quarter && direction > 0 ? 17 : 27, 29, dark), ellipse(40 * width, -50, quarter && direction < 0 ? 17 : 27, 29, dark), path(`M ${quarter ? direction * 10 : 0} -55 L ${quarter ? direction * 6 : 0} 12`, 'none', '#2e7457', 3)] };
      view.targets[leftEye].visible = false; view.targets[rightEye].visible = false; view.targets[mouth].visible = false;
    } else if (view.angle !== 0) {
      view.targets[head].artwork = { type: 'vector', shapes: [ellipse(direction * 7, -16, 79 * width, 49, green), ellipse(direction * 35, -51, 31, 34, green), ellipse(direction * 53, -3, 20, 19, green)] };
      for (const [id, sign] of [[leftEye, -1], [rightEye, 1]] as const) {
        const near = sign === direction;
        view.targets[id].visible = !side || near;
        const x = side ? direction * 35 : sign * 48 * width + direction * 10;
        view.targets[id].artwork = { type: 'vector', shapes: [ellipse(x, -54, 22, 25, cream), ellipse(x, -55, 9, 15, ink, 'none'), ellipse(x + 4, -61, 3, 4, '#fff', 'none')] };
        view.targets[id].local.scaleX *= near ? 1 : .65;
        view.targets[id].zIndex = near ? 105 : 99;
      }
      view.targets[mouth].artwork = { type: 'vector', shapes: [path(`M ${direction * 6 - 35 * width} -10 Q ${direction * 18} 9 ${direction * 6 + 35 * width} -10`, 'none', ink, 4)] };
    }
    view.targets[leftEye].zIndex = view.targets[leftEye].zIndex === set.baseline[leftEye].zIndex ? 105 : view.targets[leftEye].zIndex;
    view.targets[rightEye].zIndex = view.targets[rightEye].zIndex === set.baseline[rightEye].zIndex ? 105 : view.targets[rightEye].zIndex;
    view.targets[mouth].zIndex = 110;
  }
  // Match the front ordering to all other views so layers do not change at 0°.
  for (const id of [body, head, leftEye, rightEye, mouth]) {
    rig.layers.get(id)!.zIndex = set.views.find(view => view.angle === 0)!.targets[id].zIndex!;
    set.baseline[id].zIndex = rig.layers.get(id)!.zIndex;
  }
  rig.metadata.example = 'Moss — original articulated frog with eight prepared artwork views and arbitrary creature bones';
  animateTurn(rig, set); rig.update(); return rig;
}

/** The same authored frog driven by one Smart Bone dial instead of a view-angle track. */
export function createFrogSmartTurnDemo(): Rig {
  const rig = createFrogViewDemo();
  rig.name = 'Moss · Smart Bone 360° frog';
  const set = rig.characterViews[0];
  const driverId = rig.addBone(null, 'Moss_Turn · Smart Bone 360°', 72);
  const driver = rig.bones.get(driverId)!;
  driver.local = { ...identity(), x: 135, y: 112 };
  driver.color = '#f6be68';
  rig.update();
  const actionId = rig.createSmartAction('Moss · Smart Bone 360° turn', driverId, 0, Math.PI * 2)!;
  const action = rig.smartActions.find(item => item.id === actionId)!;
  action.viewSetIds = [set.id];
  const turnKeys: Array<[number, number]> = [
    [0, 0], [Math.PI / 4, -45], [Math.PI / 2, -90], [Math.PI * .75, -135],
    [Math.PI, -180], [Math.PI * 1.25, -225], [Math.PI * 1.5, -270], [Math.PI * 1.75, -315], [Math.PI * 2, -360],
  ];
  action.keys = turnKeys.map(([angle, viewAngle]) => ({ angle, targets: {}, viewAngles: { [set.id]: viewAngle } }));
  const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId)!;
  clip.name = 'Smart Bone · Moss full 360° turn';
  clip.tracks = clip.tracks.filter(track => track.targetId !== set.id && track.targetId !== driverId);
  clip.tracks.push({ id: createId('track'), targetId: driverId, property: 'transform', keyframes: turnKeys.map(([rotation], index) => ({
    id: createId('key'), frame: index * 15, value: { ...driver.local, rotation }, easing: 'linear' as const,
  })) });
  rig.metadata = { ...rig.metadata, example: 'Moss · Smart Bone 360° frog', smartBoneDriverId: driverId,
    description: 'The existing eight-view frog is rotated by one Smart Bone dial from 0° through 360°. The dial drives the prepared head/body artwork, visibility, order and view interpolation.' };
  rig.setTimeline({ activeAnimationId: clip.id, currentFrame: 0, startFrame: 0, endFrame: 120, fps: 24, loop: false });
  rig.applyAnimation(clip, 0);
  return rig;
}
