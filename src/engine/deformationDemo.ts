import { identity } from './math';
import { createId, Rig } from './Rig';
import type { AnimationTrack, VectorShape } from './model';

/** Original flattened artwork and a separate expression dial. Explicit load only. */
export function createDeformationDemo(): Rig {
  const rig = new Rig();
  rig.name = 'Ripple · ribbon sprite';
  rig.canvas = { width: 800, height: 520, background: '#202020' };
  rig.metadata = {
    example: 'Ripple — an original ribbon sprite with deformable flattened artwork',
    description: 'The single striped ribbon image has three blended skin joints. Rotate Smile dial (floating above the face) from 0° to 90° to curve the vector mouth and squint the eyes. Mesh vertices, weights and Smart keys are editable.',
  };
  const root = rig.addBone(null, 'Ribbon · base', 120);
  rig.bones.get(root)!.local = { ...identity(), x: 260, y: 310 };
  rig.update();
  const middle = rig.addBone(root, 'Ribbon · middle', 120);
  const tip = rig.addBone(middle, 'Ribbon · tip', 130);
  const driver = rig.addBone(null, 'Smile dial · 0° → 90°', 68);
  rig.bones.get(driver)!.local = { ...identity(), x: 145, y: 130 };
  rig.bones.get(driver)!.color = '#f6be68';
  rig.update();

  // Self-contained SVG: no remote references, scripts or imported artwork.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="144" viewBox="0 0 440 144">
    <defs><clipPath id="r"><path d="M4 36 Q78 4 168 35 Q282 70 435 57 Q373 140 244 112 Q94 96 4 117Z"/></clipPath></defs>
    <path d="M4 36 Q78 4 168 35 Q282 70 435 57 Q373 140 244 112 Q94 96 4 117Z" fill="#5bd5bd" stroke="#173c4a" stroke-width="6"/>
    <g clip-path="url(#r)" fill="none" stroke-linecap="round">
      <path d="M42 0Q90 72 48 145M126 0Q172 82 141 145M218 0Q260 88 237 145M318 0Q345 90 331 145" stroke="#2c9c9e" stroke-width="23"/>
      <path d="M-5 50Q96 21 173 51T430 70" stroke="#d6f8c1" stroke-width="7"/>
      <path d="M10 111Q99 89 216 115T446 74" stroke="#25818c" stroke-width="9"/>
    </g>
    <g fill="#ffe6a7"><circle cx="85" cy="67" r="6"/><circle cx="177" cy="77" r="6"/><circle cx="274" cy="90" r="5"/><circle cx="365" cy="84" r="4"/></g>
  </svg>`;
  const ribbon = rig.addImage('Ribbon · single flattened striped image', {
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width: 440, height: 144, color: '#5bd5bd', local: { ...identity(), x: 446, y: 305 },
  });
  rig.createMesh(ribbon, 16, 5);
  rig.bindMesh(ribbon, [root, middle, tip]);

  const ellipse = (x: number, y: number, radiusX: number, radiusY: number, fill: string, stroke?: string): VectorShape =>
    ({ id: createId('shape'), kind: 'ellipse', x, y, radiusX, radiusY, fill, stroke, strokeWidth: 3 });
  const face = rig.addVectorLayer('Face · warm little mask', [
    ellipse(0, 0, 59, 67, '#ffc990', '#173c4a'),
    ellipse(-40, 17, 12, 7, '#ef8c88'), ellipse(40, 17, 12, 7, '#ef8c88'),
    ellipse(-12, -44, 18, 7, '#ffe6be'),
  ]);
  rig.layers.get(face)!.local = { ...identity(), x: 231, y: 304 };
  rig.bind(face, root);
  const eyes = rig.addVectorLayer('Eyes · Smart squint', [
    ellipse(-22, 0, 7, 12, '#173c4a'), ellipse(22, 0, 7, 12, '#173c4a'),
    ellipse(-24, -4, 2, 3, '#ffffff'), ellipse(20, -4, 2, 3, '#ffffff'),
  ]);
  rig.layers.get(eyes)!.local = { ...identity(), x: 231, y: 292 };
  rig.bind(eyes, root);
  const mouth = rig.addVectorLayer('Mouth · Smart smile mesh', [{
    id: createId('shape'), kind: 'path', d: 'M -28 0 Q 0 4 28 0', fill: 'none', stroke: '#173c4a', strokeWidth: 5,
  }]);
  rig.layers.get(mouth)!.local = { ...identity(), x: 231, y: 324 };
  rig.bind(mouth, root);
  rig.createMesh(mouth, 8, 2);
  rig.bindMesh(mouth, [root]);

  const action = rig.createSmartAction('Smile · curve mouth + squint', driver, 0, Math.PI / 2)!;
  rig.beginSmartEdit(action, Math.PI / 2);
  rig.layers.get(mouth)!.mesh!.vertices.forEach(v => { v.y += Math.sin(v.u * Math.PI) * 23; });
  rig.layers.get(eyes)!.local.scaleY *= 0.3;
  rig.captureSmartKey(action, Math.PI / 2, [mouth, eyes]);
  rig.endSmartEdit();

  // Start in a visibly deformed pose; bind matrices remain the straight rest pose.
  rig.bones.get(middle)!.local.rotation = -0.25;
  rig.bones.get(tip)!.local.rotation = 0.35;
  rig.bones.get(driver)!.local.rotation = Math.PI / 6;
  rig.update();
  const tracks: AnimationTrack[] = [...rig.bones.values()].map(bone => ({
    id: createId('track'), targetId: bone.id, property: 'transform',
    keyframes: bone.id === driver ? [
      { id: createId('key'), frame: 0, value: { ...bone.local, rotation: 0 }, easing: 'smooth' as const },
      { id: createId('key'), frame: 32, value: { ...bone.local, rotation: 0 }, easing: 'smooth' as const },
      { id: createId('key'), frame: 64, value: { ...bone.local, rotation: Math.PI / 2 }, easing: 'smooth' as const },
      { id: createId('key'), frame: 96, value: { ...bone.local, rotation: Math.PI / 2 }, easing: 'smooth' as const },
      { id: createId('key'), frame: 120, value: { ...bone.local, rotation: 0 }, easing: 'smooth' as const },
    ] : [{ id: createId('key'), frame: 0, value: { ...bone.local }, easing: 'linear' as const }],
  }));
  [ribbon, mouth].forEach(layerId => tracks.push({
    id: createId('track'), targetId: layerId, property: 'mesh',
    keyframes: [{ id: createId('key'), frame: 0, value: rig.layers.get(layerId)!.mesh!.vertices.map(v => ({ x: v.x, y: v.y })) }],
  }));
  const animationId = createId('animation');
  rig.animations = [{ id: animationId, name: 'Ripple · skin and expression poses', fps: 24, startFrame: 0, endFrame: 120, tracks }];
  rig.setTimeline({ activeAnimationId: animationId });
  return rig;
}
