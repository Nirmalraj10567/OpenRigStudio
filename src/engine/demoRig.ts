import { identity, worldToLocalPoint } from './math';
import type { VectorShape } from './model';
import { createId, Rig } from './Rig';

/** An original articulated vector example. Call only on explicit user load. */
export function createDemoRig(): Rig {
  const rig = new Rig();
  rig.name = 'Pip · trail courier';
  rig.canvas = { width: 800, height: 520, background: '#202020' };
  rig.metadata = {
    example: 'Pip — an original articulated vector trail courier',
    description: 'Separate rigid artwork for every joint. Pose lower arms/legs with two-joint IK; rotate hands, feet and head with FK. Torso is locked to anchor the limbs.',
  };
  const ink = '#263747';
  const teal = '#64cfbf';
  const tealDark = '#33978f';
  const orange = '#ffbd71';
  const cream = '#ffedd0';
  const coral = '#f37b72';
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: string, stroke = 'none', strokeWidth = 2): VectorShape =>
    ({ id: createId('shape'), kind: 'ellipse', x, y, radiusX: rx, radiusY: ry, fill, stroke, strokeWidth });
  const path = (d: string, fill: string, stroke = ink, strokeWidth = 3): VectorShape =>
    ({ id: createId('shape'), kind: 'path', d, fill, stroke, strokeWidth });
  const bone = (parentId: string | null, name: string, x: number, y: number, endX: number, endY: number): string => {
    const id = rig.addBone(parentId, name, Math.hypot(endX - x, endY - y));
    const parent = parentId ? rig.bones.get(parentId) : undefined;
    const origin = parent ? worldToLocalPoint(parent.world, { x, y })! : { x, y };
    rig.bones.get(id)!.local = { ...identity(), ...origin, rotation: Math.atan2(endY - y, endX - x) - (parent?.world.rotation ?? 0) };
    rig.update();
    return id;
  };
  const art = (id: string, name: string, shapes: VectorShape[], upright = false) => {
    const layerId = rig.addVectorLayer(name, shapes);
    const layer = rig.vectors.get(layerId)!;
    layer.local = { ...identity(), rotation: upright ? -rig.bones.get(id)!.world.rotation : 0 };
    // Factory-authored art starts in bone-local coordinates, so its attachment
    // is identity rather than the pose-preserving offset used by editor bind.
    rig.bindings.set(layerId, { id: createId('binding'), layerId, imageId: layerId, boneId: id, bindOffset: identity() });
    rig.update();
  };
  const capsule = (length: number, radius: number, fill: string): VectorShape => path(
    `M 0 ${-radius} L ${length} ${-radius} Q ${length + radius} ${-radius} ${length + radius} 0 Q ${length + radius} ${radius} ${length} ${radius} L 0 ${radius} Q ${-radius} ${radius} ${-radius} 0 Q ${-radius} ${-radius} 0 ${-radius} Z`, fill,
  );
  const limb = (id: string, name: string, fill: string, radius: number) => {
    const length = rig.bones.get(id)!.length;
    art(id, name, [capsule(length, radius, fill), path(`M 7 ${-radius + 5} L ${length - 7} ${-radius + 5}`, 'none', cream, 3), ellipse(length, 0, radius - 4, radius - 4, ink), ellipse(length, 0, 3, 3, orange)]);
  };

  const torso = bone(null, 'Torso · anchor', 400, 290, 400, 185);
  rig.bones.get(torso)!.locked = true;
  const head = bone(torso, 'Head', 400, 185, 400, 109);
  const leftUpperArm = bone(torso, 'Left upper arm', 351, 207, 321, 263);
  const leftLowerArm = bone(leftUpperArm, 'Left lower arm', 321, 263, 294, 311);
  const leftHand = bone(leftLowerArm, 'Left hand', 294, 311, 283, 334);
  const rightUpperArm = bone(torso, 'Right upper arm', 449, 207, 483, 255);
  const rightLowerArm = bone(rightUpperArm, 'Right lower arm', 483, 255, 511, 302);
  const rightHand = bone(rightLowerArm, 'Right hand', 511, 302, 524, 323);
  const leftUpperLeg = bone(torso, 'Left upper leg', 378, 284, 363, 352);
  const leftLowerLeg = bone(leftUpperLeg, 'Left lower leg', 363, 352, 373, 423);
  const leftFoot = bone(leftLowerLeg, 'Left foot', 373, 423, 341, 432);
  const rightUpperLeg = bone(torso, 'Right upper leg', 422, 284, 437, 352);
  const rightLowerLeg = bone(rightUpperLeg, 'Right lower leg', 437, 352, 430, 423);
  const rightFoot = bone(rightLowerLeg, 'Right foot', 430, 423, 462, 432);

  // Back-to-front ordering keeps shoulder and hip pivots covered by the jacket.
  limb(leftUpperLeg, 'Left thigh · trousers', ink, 17);
  limb(rightUpperLeg, 'Right thigh · trousers', ink, 17);
  limb(leftLowerLeg, 'Left shin · gaiter', tealDark, 13);
  limb(rightLowerLeg, 'Right shin · gaiter', tealDark, 13);
  [leftFoot, rightFoot].forEach((id, index) => art(id, `${index ? 'Right' : 'Left'} boot`, [
    capsule(rig.bones.get(id)!.length, 14, orange),
    path('M -6 8 L 35 8', 'none', cream, 4), ellipse(4, -4, 4, 4, ink),
  ]));
  limb(leftUpperArm, 'Left sleeve', tealDark, 15);
  limb(rightUpperArm, 'Right sleeve', tealDark, 15);
  limb(leftLowerArm, 'Left forearm', teal, 12);
  limb(rightLowerArm, 'Right forearm', teal, 12);
  [leftHand, rightHand].forEach((id, index) => art(id, `${index ? 'Right' : 'Left'} glove`, [
    capsule(20, 13, orange), ellipse(8, -11, 9, 7, orange, ink, 3),
    path('M 18 -5 L 24 -5 M 19 1 L 26 1', 'none', '#d08453', 2),
  ]));
  art(torso, 'Jacket · chest and satchel', [
    path('M -28 -105 Q -53 -102 -52 -78 L -42 -9 Q -39 7 0 9 Q 39 7 42 -9 L 52 -78 Q 53 -102 28 -105 Z', teal),
    path('M 0 -91 L 0 1', 'none', tealDark, 3),
    path('M -35 -14 Q 0 -5 35 -14 L 33 6 Q 0 15 -33 6 Z', ink),
    path('M -32 -90 L -22 -97 L 34 -21 L 24 -14 Z', '#e5a164', ink, 2),
    path('M 7 -53 L 34 -53 L 35 -28 Q 21 -19 7 -28 Z', cream, ink, 2),
    ellipse(21, -41, 5, 5, coral),
    path('M -42 -99 Q 0 -116 42 -99 L 36 -84 Q 0 -96 -36 -84 Z', coral),
    path('M 20 -91 L 35 -83 L 43 -58 L 27 -66 Z', coral),
  ], true);
  art(head, 'Helmet · face', [
    ellipse(-43, -40, 9, 17, orange, ink, 3), ellipse(43, -40, 9, 17, orange, ink, 3),
    path('M -43 -54 Q -45 -88 0 -89 Q 45 -88 43 -54 L 42 -26 Q 39 -5 0 -4 Q -39 -5 -42 -26 Z', orange),
    path('M -33 -55 Q 0 -65 33 -55 L 32 -28 Q 0 -17 -32 -28 Z', ink, ink, 2),
    ellipse(-15, -42, 5, 8, '#a7f3df'), ellipse(15, -42, 5, 8, '#a7f3df'),
    path('M -7 -28 Q 0 -23 7 -28', 'none', cream, 2),
    path('M -35 -66 Q 0 -87 35 -66', 'none', cream, 5),
    path('M -44 -59 Q 0 -72 44 -59', 'none', '#d08453', 5),
    ellipse(0, -79, 6, 6, teal, ink, 2),
    ellipse(-27, -17, 6, 3, coral), ellipse(27, -17, 6, 3, coral),
  ], true);

  const animationId = createId('animation');
  rig.animations = [{
    id: animationId, name: 'Pip · poses', fps: 24, startFrame: 0, endFrame: 120,
    tracks: [...rig.bones.values()].map((joint) => ({
      id: createId('track'), targetId: joint.id, property: 'transform',
      keyframes: [{ id: createId('key'), frame: 0, value: { ...joint.local }, easing: 'linear' }],
    })),
  }];
  rig.setTimeline({ activeAnimationId: animationId });
  rig.update();
  return rig;
}
