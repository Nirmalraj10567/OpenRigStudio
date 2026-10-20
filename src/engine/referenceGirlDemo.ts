import { addCharacterView, addCharacterViewSet, FULL_TURN_VIEWS } from './characterViews';
import { createId, Rig } from './Rig';
import { identity, worldToLocalPoint } from './math';
import type { Point2D, Transform2D } from './math';
import type { AnimationTrack, VectorShape } from './model';
import { makeMesh } from './mesh';
import { defaultDynamics } from './dynamics';
import { GIRL_COLORS, e, mapGirlShapes, referenceBackArtwork, referenceFrontArtwork, referenceProfileBody, referenceProfileHead } from './referenceGirlArtwork';
import type { GirlPart } from './referenceGirlArtwork';
import { addReferenceGirlFingers } from './referenceGirlHands';
import { applyHandPose } from './handRig';

const SCALE = .75, OFFSET = { x: 280, y: 24 };
const stage = (point: Point2D): Point2D => ({ x: OFFSET.x + point.x * SCALE, y: OFFSET.y + point.y * SCALE });
type Joint = { x: number; y: number; z: number };
const joint = (x: number, y: number, z = 0): Joint => ({ x, y, z });
const points = {
  pelvis: joint(166, 246), waist: joint(166, 208), neck: joint(160, 104), chin: joint(160, 83), crown: joint(160, 20),
  shoulderL: joint(112, 135), elbowL: joint(102, 223), wristL: joint(94, 298), fingersL: joint(98, 319),
  shoulderR: joint(198, 134), elbowR: joint(208, 203, 4), wristR: joint(210, 148, 29), fingersR: joint(200, 123, 32),
  hipL: joint(145, 248), kneeL: joint(150, 406), ankleL: joint(145, 548), toeL: joint(137, 612, 22),
  hipR: joint(185, 250), kneeR: joint(177, 404), ankleR: joint(168, 548), toeR: joint(190, 589, 19),
  drape: joint(166, 425), fringe: joint(166, 548),
  chestL: joint(146, 125, 15), chestTipL: joint(148, 153, 20),
  chestR: joint(178, 125, 15), chestTipR: joint(176, 153, 20),
};
type PointName = keyof typeof points;
const boneDefinitions = [
  ['pelvis', null, 'Pelvis · body anchor', 'pelvis', 'waist'],
  ['spine', 'pelvis', 'Spine · cropped jacket', 'waist', 'neck'],
  ['neck', 'spine', 'Neck', 'neck', 'chin'],
  ['head', 'neck', 'Head', 'chin', 'crown'],
  ['chestL', 'spine', 'Chest · left jiggle control', 'chestL', 'chestTipL'],
  ['chestR', 'spine', 'Chest · right jiggle control', 'chestR', 'chestTipR'],
  ['upperL', 'spine', 'Left upper arm', 'shoulderL', 'elbowL'],
  ['lowerL', 'upperL', 'Left forearm', 'elbowL', 'wristL'],
  ['handL', 'lowerL', 'Left hand', 'wristL', 'fingersL'],
  ['upperR', 'spine', 'Right upper arm', 'shoulderR', 'elbowR'],
  ['lowerR', 'upperR', 'Right forearm', 'elbowR', 'wristR'],
  ['handR', 'lowerR', 'Right hand · raised', 'wristR', 'fingersR'],
  ['thighL', 'pelvis', 'Left thigh', 'hipL', 'kneeL'],
  ['shinL', 'thighL', 'Left shin', 'kneeL', 'ankleL'],
  ['footL', 'shinL', 'Left heel', 'ankleL', 'toeL'],
  ['thighR', 'pelvis', 'Right thigh', 'hipR', 'kneeR'],
  ['shinR', 'thighR', 'Right shin', 'kneeR', 'ankleR'],
  ['footR', 'shinR', 'Right heel', 'ankleR', 'toeR'],
  ['drape', 'pelvis', 'Skirt · drape', 'pelvis', 'drape'],
  ['fringe', 'drape', 'Skirt · lower hem', 'drape', 'fringe'],
] as const;
type BoneKey = typeof boneDefinitions[number][0];
type Layout = Record<BoneKey, { world: Transform2D; length: number; origin: Point2D; tip: Point2D }>;

const attachments: Record<GirlPart, [BoneKey, string, number]> = {
  hairBack: ['head', 'Swept-back black hair · rear', 25], bag: ['spine', 'Purple shoulder bag and strap', 28],
  thighL: ['thighL', 'Left thigh · under skirt', 10], thighR: ['thighR', 'Right thigh · under skirt', 10],
  shinL: ['shinL', 'Left shin · under skirt', 12], shinR: ['shinR', 'Right shin · under skirt', 12],
  shoeL: ['footL', 'Left foot · red heel', 15], shoeR: ['footR', 'Right foot · red heel', 15],
  upperArmL: ['upperL', 'Left bare upper arm', 35], upperArmR: ['upperR', 'Right bare upper arm', 35],
  forearmL: ['lowerL', 'Left forearm', 38], forearmR: ['lowerR', 'Right forearm · raised', 76],
  neck: ['neck', 'Neck and collarbones', 40], midriff: ['pelvis', 'Exposed waist', 42],
  chest: ['spine', 'Chest · skin and contour · weighted', 41],
  jacket: ['spine', 'Cropped navy jacket · zipper and collar', 50],
  sleeveL: ['upperL', 'Left short sleeve', 52], sleeveR: ['upperR', 'Right short sleeve', 52],
  skirt: ['drape', 'Coral floral wrap skirt · weighted drape', 55], knot: ['pelvis', 'Wrap knot · left hip', 57],
  handL: ['handL', 'Left palm · wrist seam mask', 80], handR: ['handR', 'Right palm · raised grip', 81],
  face: ['head', 'Face · reference proportions', 100], eyes: ['head', 'Eyes · blue irises and lashes', 102],
  brows: ['head', 'Fine eyebrows', 103], noseMouth: ['head', 'Nose and subtle smile', 104],
  hairFront: ['head', 'Swept-back hairline · no fringe', 108], glasses: ['head', 'Amber sunglasses · on head', 110],
};

function projectPoint(name: PointName, angle: number): Point2D {
  const a = angle * Math.PI / 180, q = points[name];
  return { x: 160 + (q.x - 160) * Math.cos(a) + q.z * Math.sin(a), y: q.y };
}
function layout(angle: number): Layout {
  return Object.fromEntries(boneDefinitions.map(([key, , , start, end]) => {
    const origin = projectPoint(start, angle), tip = projectPoint(end, angle), a = stage(origin), b = stage(tip);
    return [key, { origin, tip, world: { ...identity(), ...a, rotation: Math.atan2(b.y - a.y, b.x - a.x) }, length: Math.hypot(b.x - a.x, b.y - a.y) }];
  })) as Layout;
}

/** Keep limb thickness while projecting their joint positions through a turn. */
function limbMap(q: Point2D, from: Layout[BoneKey], to: Layout[BoneKey], angle: number): Point2D {
  const a = from.world.rotation, b = to.world.rotation;
  const dx = q.x - from.origin.x, dy = q.y - from.origin.y;
  const u = (dx * Math.cos(a) + dy * Math.sin(a)) * to.length / from.length;
  const v = (-dx * Math.sin(a) + dy * Math.cos(a)) * (.82 + .18 * Math.abs(Math.cos(angle * Math.PI / 180)));
  return { x: to.origin.x + u * Math.cos(b) - v * Math.sin(b), y: to.origin.y + u * Math.sin(b) + v * Math.cos(b) };
}
const headParts = new Set<GirlPart>(['hairBack', 'face', 'eyes', 'brows', 'noseMouth', 'hairFront', 'glasses']);
const armParts = new Set<GirlPart>(['upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'sleeveL', 'sleeveR', 'handL', 'handR']);
const legParts = new Set<GirlPart>(['thighL', 'thighR', 'shinL', 'shinR', 'shoeL', 'shoeR']);

function artForView(front: ReturnType<typeof referenceFrontArtwork>, angle: number, rest: Layout, view: Layout): Record<GirlPart, VectorShape[]> {
  const absolute = Math.abs(angle), back = absolute > 90, profile = absolute === 90;
  const source = { ...front, ...(back ? referenceBackArtwork() : profile ? { ...referenceProfileHead(), ...referenceProfileBody() } : {}) };
  const cos = Math.abs(Math.cos(angle * Math.PI / 180)), bodyWidth = .62 + .38 * cos;
  return Object.fromEntries((Object.keys(front) as GirlPart[]).map(part => {
    const bone = attachments[part][0], origin = view[bone].origin;
    let shapes = source[part];
    if (part === 'skirt') {
      // Fixed source texture with a view-corrected mesh, so turns do not double-scale.
      if (back || angle === -90) shapes = shapes.filter(s => ![GIRL_COLORS.leaf, GIRL_COLORS.flower, '#8b6648'].includes(s.fill ?? '') && s.stroke !== '#697852');
      return [part, mapGirlShapes(shapes, q => ({ x: q.x - rest.drape.origin.x, y: q.y - rest.drape.origin.y }))];
    }
    let map: (q: Point2D) => Point2D;
    if (armParts.has(part) || legParts.has(part)) map = q => limbMap(q, rest[bone], view[bone], angle);
    else if (headParts.has(part)) {
      const direction = angle > 0 ? -1 : 1;
      const shift = absolute === 45 ? (angle < 0 ? -5 : 5) : 0;
      const width = absolute === 45 ? .86 : absolute === 135 ? .88 : 1;
      const feature = ['eyes', 'brows', 'noseMouth'].includes(part);
      map = q => ({ x: origin.x + (q.x - 160) * width * (profile ? direction : 1) + shift * (feature ? 1.6 : .4), y: q.y });
    } else if (profile && (part === 'jacket' || part === 'midriff' || part === 'chest')) {
      map = q => ({ x: 160 + (q.x - 160) * (angle < 0 ? 1 : -1), y: q.y });
    } else {
      const side = back ? -1 : 1;
      map = q => ({ x: origin.x + (q.x - rest[bone].origin.x) * bodyWidth * side, y: q.y });
    }
    return [part, mapGirlShapes(shapes, q => { const projected = map(q); return { x: projected.x - origin.x, y: projected.y - origin.y }; })];
  })) as Record<GirlPart, VectorShape[]>;
}

/** Source-proportioned redraw of image.png, with one poseable rig and eight views. */
export function createReferenceGirlDemo(): Rig {
  const rig = new Rig();
  rig.name = 'Reference girl · 360° hands & physics v5';
  rig.canvas = { width: 800, height: 520, background: '#f3f0e8' };
  rig.metadata = {
    referenceFile: 'image.png', version: '5',
    description: 'Front artwork redrawn in the original image coordinates. Other angles are inferred from the single front reference. Thin anime outlines, swept-back black hair, amber sunglasses, cropped navy jacket, exposed waist, floral coral wrap and red heels.',
    rigFeatures: '50 bones including 28 finger/thumb joints and two independent 360° wrist-roll dials, ten separately skinned digits, wrist/elbow seam masks, chest springs, pinned waist cloth, eight body views.',
    handUsage: 'Rig & animate → Hands & fingers: Wrist turn rolls from Back (0°) through Edge (90°), Palm (180°), Edge (270°), Back (360°). Curl and joint controls remain independent. Auto-key records native dial and digit bones; Hand turns clip demonstrates full revolutions.',
    physicsUsage: 'Play Secondary motion to see body-driven chest settling and skirt motion. Dynamics & physics exposes Jiggle controls and cloth pins, pose follow, travel and wind. Angle review is a separate clip.',
  };
  const background = rig.addVectorLayer('Neutral presentation background', [
    { id: createId('shape'), kind: 'rect', x: 0, y: 0, width: 800, height: 520, fill: rig.canvas.background },
    e(400, 496, 52, 5, '#dedbd0'),
  ]);
  rig.layers.get(background)!.local = identity(); rig.layers.get(background)!.locked = true;

  const ids = {} as Record<BoneKey, string>, rest = layout(0);
  for (const [key, parent, name] of boneDefinitions) {
    const state = rest[key], parentWorld = parent ? rest[parent].world : null;
    const id = rig.addBone(parent ? ids[parent] : null, name, state.length);
    ids[key] = id;
    rig.bones.get(id)!.local = { ...identity(), ...(parentWorld ? worldToLocalPoint(parentWorld, state.world)! : state.world), rotation: state.world.rotation - (parentWorld?.rotation ?? 0) };
    rig.bones.get(id)!.color = key.startsWith('chest') ? '#ce9ab6' : key === 'drape' || key === 'fringe' ? '#d69476' : '#6c9bb5';
    rig.update();
  }
  rig.bones.get(ids.pelvis)!.locked = true;
  const front = referenceFrontArtwork(), baseArt = artForView(front, 0, rest, rest), layers = {} as Record<GirlPart, string>;
  for (const part of Object.keys(front) as GirlPart[]) {
    const [bone, name, order] = attachments[part];
    const id = rig.addVectorLayer(name, baseArt[part]); layers[part] = id;
    const layer = rig.layers.get(id)!;
    layer.local = { ...identity(), rotation: -rest[bone].world.rotation, scaleX: SCALE, scaleY: SCALE };
    layer.zIndex = order;
    rig.bindings.set(id, { layerId: id, imageId: id, boneId: ids[bone], bindOffset: identity() });
    rig.update();
  }
  const skirt = rig.layers.get(layers.skirt)!;
  skirt.mesh = makeMesh(skirt, 6, 18)!;
  if (!rig.bindMesh(skirt.id, [ids.drape, ids.fringe])) throw new Error('Could not bind skirt deformation mesh');
  skirt.mesh.vertices.forEach(vertex => {
    const sourceY = vertex.y + rest.drape.origin.y;
    const blend = Math.max(0, Math.min(1, (sourceY - 360) / 170));
    const weight = blend * blend * (3 - 2 * blend);
    vertex.weights = { [ids.drape]: 1 - weight, [ids.fringe]: weight };
  });
  // Both garment and skin share spatial weights; collar/waist stay anchored.
  for (const part of ['chest', 'jacket'] as const) {
    const layer = rig.layers.get(layers[part])!;
    layer.mesh = makeMesh(layer, 8, 12)!;
    if (!rig.bindMesh(layer.id, [ids.spine, ids.chestL, ids.chestR])) throw new Error('Could not skin chest artwork');
    layer.mesh.vertices.forEach(vertex => {
      const x = vertex.x + rest.spine.origin.x, y = vertex.y + rest.spine.origin.y;
      const envelope = Math.max(0, Math.min(1, (y - 116) / 12, (179 - y) / 13));
      const left = Math.exp(-(((x - 147) / 16) ** 2 + ((y - 150) / 25) ** 2));
      const right = Math.exp(-(((x - 178) / 16) ** 2 + ((y - 150) / 25) ** 2));
      const total = Math.min(.88, (left + right) * envelope * .86), sum = left + right || 1;
      vertex.weights = { [ids.spine]: 1 - total, [ids.chestL]: total * left / sum, [ids.chestR]: total * right / sum };
    });
  }
  for (const [patchPart, targetPart] of [['forearmL', 'upperArmL'], ['forearmR', 'upperArmR'], ['handL', 'forearmL'], ['handR', 'forearmR']] as const) {
    rig.layers.get(layers[patchPart])!.patch = { enabled: true, hideEdges: true, preserveOutline: true, seamWidth: .25, targetIds: [layers[targetPart]] };
  }
  rig.update();

  const setId = addCharacterViewSet(rig, 'Reference girl · 8 angles', [...rig.bones.keys(), ...Object.values(layers)])!;
  FULL_TURN_VIEWS.filter(v => v.angle !== 0).forEach(v => addCharacterView(rig, setId, v.angle, v.name));
  const set = rig.characterViews[0];
  for (const view of set.views) {
    const posed = layout(view.angle), art = artForView(front, view.angle, rest, posed);
    for (const [key, parent] of boneDefinitions) {
      const state = posed[key], parentWorld = parent ? posed[parent].world : null;
      view.targets[ids[key]].local = { ...identity(), ...(parentWorld ? worldToLocalPoint(parentWorld, state.world)! : state.world), rotation: state.world.rotation - (parentWorld?.rotation ?? 0) };
      view.targets[ids[key]].length = state.length;
    }
    for (const part of Object.keys(front) as GirlPart[]) {
      const id = layers[part], [bone, , order] = attachments[part], target = view.targets[id];
      target.artwork = { type: 'vector', shapes: art[part] };
      if (part === 'skirt') {
        const width = .64 + .36 * Math.abs(Math.cos(view.angle * Math.PI / 180));
        target.mesh = skirt.mesh.vertices.map(v => ({ x: v.x * width, y: v.y }));
      } else if (!rig.layers.get(id)!.mesh) target.local.rotation = -posed[bone].world.rotation;
      if (view.angle !== 0 && (armParts.has(part) || legParts.has(part))) {
        const near = part.endsWith(view.angle < 0 ? 'L' : 'R');
        target.zIndex = armParts.has(part) ? near ? (part.startsWith('sleeve') ? 53 : 78) : 32 : order + (near ? 1 : -1);
      }
      if (Math.abs(view.angle) > 90) {
        if (part === 'bag') target.zIndex = 61;
        if (part === 'hairBack' || part === 'hairFront') target.zIndex = 115;
      }
    }
  }
  // Cancel the setup turn's skin transform in view mesh corrections. The
  // translational springs then deform that prepared silhouette at any angle.
  for (const view of set.views) {
    const posed = layout(view.angle);
    rig.characterAngleOverrides.set(setId, { frame: 0, angle: view.angle }); rig.update();
    for (const part of ['chest', 'jacket'] as const) {
      const layer = rig.layers.get(layers[part])!, anchor = stage(posed.spine.origin);
      view.targets[layer.id].mesh = layer.mesh!.vertices.map((vertex, index) =>
        rig.meshPointToLocal(layer.id, index, { x: anchor.x + vertex.x * SCALE, y: anchor.y + vertex.y * SCALE })!);
    }
  }
  rig.characterAngleOverrides.clear(); rig.update();
  const hands = addReferenceGirlFingers(rig, {
    setId, wrists: { Left: ids.handL, Right: ids.handR }, palms: { Left: layers.handL, Right: layers.handR },
    project: (side, angle, point) => {
      const bone = side === 'Left' ? 'handL' : 'handR';
      return stage(limbMap(point, rest[bone], layout(angle)[bone], angle));
    },
  });
  // Keys retain the setup while the existing turn track selects the artwork.
  const tracks: AnimationTrack[] = [...rig.bones.values()].map(bone => ({ id: createId('track'), targetId: bone.id, property: 'transform', keyframes: [{ id: createId('key'), frame: 0, value: { ...bone.local }, easing: 'smooth' }] }));
  tracks.push({ id: createId('track'), targetId: setId, property: 'viewAngle', keyframes: Array.from({ length: 9 }, (_, index) => ({ id: createId('key'), frame: index * 18, value: index === 0 ? 0 : index * -45, easing: 'smooth' })) });
  const clipId = createId('animation');
  const motionId = createId('animation');
  const motionTracks: AnimationTrack[] = [...rig.bones.values()].map(bone => ({ id: createId('track'), targetId: bone.id, property: 'transform', keyframes: [{ id: createId('key'), frame: 0, value: { ...bone.local }, easing: 'smooth' }] }));
  // A gentle weight shift/bounce provides a physical input; chest keys themselves
  // stay at their rest pose. Their visible movement comes from the solver.
  for (const [boneId, poses] of [
    [ids.pelvis, [[0, 0, 0, 0], [18, 1, -3, -.012], [28, -1, 2, .01], [40, 0, 0, 0], [60, -2, -2, .012], [72, 1, 1, -.01], [90, 0, 0, 0], [120, 0, 0, 0], [144, 0, 0, 0]]],
    [ids.spine, [[0, 0, 0, 0], [18, 0, 0, -.035], [28, 0, 0, .02], [40, 0, 0, 0], [60, 0, 0, .03], [72, 0, 0, -.025], [90, 0, 0, 0], [120, 0, 0, 0], [144, 0, 0, 0]]],
  ] as Array<[string, number[][]]>) {
    const base = rig.bones.get(boneId)!.local, track = motionTracks.find(t => t.targetId === boneId)!;
    track.keyframes = poses.map(([frame, x, y, rotation]) => ({ id: createId('key'), frame, value: { ...base, x: base.x + x, y: base.y + y, rotation: base.rotation + rotation }, easing: 'smooth' }));
  }
  motionTracks.push({ id: createId('track'), targetId: setId, property: 'viewAngle', keyframes: [{ id: createId('key'), frame: 0, value: 0 }] });
  const fingerTracks: AnimationTrack[] = [...rig.bones.values()].map(bone => ({ id: createId('track'), targetId: bone.id, property: 'transform', keyframes: [{ id: createId('key'), frame: 0, value: { ...bone.local }, easing: 'smooth' }] }));
  for (const [frame, pose] of [[18, 'open'], [42, 'grip'], [66, 'point'], [90, 'reference']] as const) {
    hands.forEach(hand => applyHandPose(rig, hand.id, pose));
    for (const id of hands.flatMap(hand => hand.fingers.flatMap(finger => finger.boneIds))) {
      fingerTracks.find(track => track.targetId === id)!.keyframes.push({ id: createId('key'), frame, value: { ...rig.bones.get(id)!.local }, easing: 'smooth' });
    }
  }
  fingerTracks.push({ id: createId('track'), targetId: setId, property: 'viewAngle', keyframes: [{ id: createId('key'), frame: 0, value: 0 }] });
  hands.forEach(hand => applyHandPose(rig, hand.id, 'open'));
  const turnTracks: AnimationTrack[] = [...rig.bones.values()].map(bone => ({ id: createId('track'), targetId: bone.id, property: 'transform', keyframes: [{ id: createId('key'), frame: 0, value: { ...bone.local }, easing: 'linear' }] }));
  hands.forEach((hand, index) => {
    const track = turnTracks.find(t => t.targetId === hand.turn!.driverBoneId)!;
    const base = rig.bones.get(hand.turn!.driverBoneId)!.local;
    track.keyframes.push({ id: createId('key'), frame: 96, value: { ...base, rotation: (index ? -1 : 1) * Math.PI * 2 }, easing: 'linear' });
  });
  turnTracks.push({ id: createId('track'), targetId: setId, property: 'viewAngle', keyframes: [{ id: createId('key'), frame: 0, value: 0 }] });
  rig.animations = [
    { id: clipId, name: 'Reference girl · angle review', fps: 24, startFrame: 0, endFrame: 144, tracks },
    { id: motionId, name: 'Secondary motion · chest & cloth', fps: 24, startFrame: 0, endFrame: 144, tracks: motionTracks },
    { id: createId('animation'), name: 'Finger articulation · open / grip / point', fps: 24, startFrame: 0, endFrame: 96, tracks: fingerTracks },
    { id: createId('animation'), name: 'Hand turns · independent 360° wrist rolls', fps: 24, startFrame: 0, endFrame: 96, tracks: turnTracks },
  ];
  rig.dynamics = {
    ...defaultDynamics(), enabled: true, startFrame: 0, endFrame: 144, substeps: 4,
    gravityY: 150, windX: 64, windNoise: 44, seed: 31,
    bones: [ids.chestL, ids.chestR].map((boneId, index) => ({ id: createId('dynamic'), boneId, enabled: true, mode: 'jiggle', stiffness: index ? 106 : 100, damping: 9, mass: 1, gravityScale: .025, windScale: 0, influence: .9, overlap: 1, maxDisplacement: 4 })),
    meshes: [{ id: createId('cloth'), layerId: skirt.id, enabled: true, mode: 'cloth', stiffness: 50, damping: 6, mass: .9, gravityScale: .2, windScale: .6,
      pinned: skirt.mesh.vertices.flatMap((v, index) => v.y < 42 ? [index] : []), poseFollow: .88, maxDisplacement: 12, adaptiveRest: true }],
  };
  rig.setTimeline({ activeAnimationId: motionId, currentFrame: 0, startFrame: 0, endFrame: 144, fps: 24 });
  rig.applyAnimation(motionId, 0);
  return rig;
}
