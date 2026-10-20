import { createReferenceGirlDemo } from './referenceGirlDemo';
import { createId, Rig } from './Rig';
import { identity } from './math';
import type { Transform2D } from './math';
import type { AnimationClip, AnimationTrack, VectorShape } from './model';
import { applyHandPose, getHandRigs } from './handRig';

const ink = '#263845';
const path = (d: string, fill = 'none', stroke = ink, strokeWidth = 2): VectorShape => ({ id: createId('shape'), kind: 'path', d, fill, stroke, strokeWidth, lineCap: 'round', lineJoin: 'round' });
const rect = (x: number, y: number, width: number, height: number, fill: string): VectorShape => ({ id: createId('shape'), kind: 'rect', x, y, width, height, fill });
const ellipse = (x: number, y: number, radiusX: number, radiusY: number, fill: string, stroke = 'none', strokeWidth = 1): VectorShape => ({ id: createId('shape'), kind: 'ellipse', x, y, radiusX, radiusY, fill, stroke, strokeWidth });
function bone(rig: Rig, name: string) { const item = [...rig.bones.values()].find(item => item.name === name); if (!item) throw new Error(`Missing football rig bone: ${name}`); return item; }

/** Native FK/IK keys with a true moving-foot collision, then gravity and bounce.
 * The ball uses an editable one-shot launch impulse so the kick remains
 * deterministic even when the contact collider is hidden. Dress, hair and
 * chest are live simulations.
 */
export function createReferenceGirlFootballScene(): Rig {
  const rig = createReferenceGirlDemo(); rig.dynamics.enabled = false; rig.update();
  rig.name = 'Reference girl · football kick · dress, hair & chest physics';
  rig.canvas = { width: 900, height: 560, background: '#91bfb9' };
  const artwork = (name: string, shapes: VectorShape[], zIndex: number) => {
    const id = rig.addVectorLayer(name, shapes), layer = rig.layers.get(id)!;
    layer.local = identity(); layer.zIndex = zIndex; return layer;
  };
  const background = [...rig.layers.values()].find(l => l.name === 'Neutral presentation background')!;
  background.visible = false;
  const field = artwork('Football pitch · grass stripes and white markings', [
    rect(0, 0, 900, 560, '#b9d8d2'), ellipse(740, 69, 34, 34, '#f9e5b2'),
    path('M 0 217 Q 125 148 271 208 Q 460 140 606 206 Q 783 132 900 191 L 900 330 L 0 330 Z', '#84afa0', 'none'),
    rect(0, 269, 900, 291, '#7fab76'),
    ...[294, 350, 412, 488].map((y, i) => rect(0, y, 900, 24 + i * 5, '#79a670')),
    path('M 15 296 L 876 296 L 892 526 L 8 526 Z M 56 424 L 860 424 M 584 296 L 630 526', 'none', '#e4ecd3', 2),
    ellipse(608, 417, 71, 36, 'none', '#e4ecd3', 2),
    path('M 764 424 L 743 349 L 870 349 M 804 424 L 792 383 L 875 383', 'none', '#e4ecd3', 2),
    ...[110, 155, 682, 736].map((x, i) => ellipse(x, 97 + i % 2 * 6, 35, 8, '#eaf1df')),
    ...Array.from({ length: 45 }, (_, i) => path(`M ${i * 21} ${535 + i % 3 * 5} l 2 -5 l 2 5`, 'none', '#638e60', 1)),
  ], -900);
  artwork('Goal · frame and net', [
    path('M 756 416 L 756 281 L 863 281 L 884 405 L 756 416 M 756 281 L 780 309 L 884 309 M 780 309 L 786 412', 'none', '#e7e9d7', 3),
    ...Array.from({ length: 7 }, (_, i) => path(`M ${768 + i * 15} 283 L ${790 + i * 13} 410`, 'none', '#d7e0c8', .8)),
    ...Array.from({ length: 7 }, (_, i) => path(`M 758 ${297 + i * 17} L 879 ${310 + i * 14}`, 'none', '#d7e0c8', .8)),
  ], -700);
  artwork('Player · soft grass shadow', [{ ...ellipse(398, 493, 39, 6, '#315c48'), opacity: .22 }], 2);

  const head = bone(rig, 'Head');
  const hairMeshes = [...rig.layers.values()].filter(l => /Swept-back black hair|Swept-back hairline/.test(l.name)).map(layer => {
    if (!rig.createMesh(layer.id, 6, 8) || !rig.bindMesh(layer.id, [head.id])) throw new Error('Could not prepare wind-driven hair');
    // Fix the scalp/hairline. Pin only the top row so loose locks below the
    // ears can flutter under wind instead of freezing the whole hair mesh.
    const top = Math.min(...layer.mesh!.vertices.map(v => v.y));
    const pinned = layer.mesh!.vertices.flatMap((v, i) => Math.abs(v.y - top) < .01 ? [i] : []);
    return { layerId: layer.id, pinned };
  });
  const skirt = [...rig.layers.values()].find(l => l.name === 'Coral floral wrap skirt · weighted drape')!;
  const thigh = bone(rig, 'Right thigh'), shin = bone(rig, 'Right shin'), rightFoot = bone(rig, 'Right heel');
  const pelvis = bone(rig, 'Pelvis · body anchor'), spine = bone(rig, 'Spine · cropped jacket');
  const leftShin = bone(rig, 'Left shin'), leftFoot = bone(rig, 'Left heel');
  const drape = bone(rig, 'Skirt · drape'), hem = bone(rig, 'Skirt · lower hem');
  rig.bindMesh(skirt.id, [drape.id, hem.id, thigh.id]);
  skirt.mesh!.vertices.forEach(v => {
    const lower = Math.max(0, Math.min(1, (v.y - 100) / 160));
    const kick = lower * .3 * Math.max(0, Math.min(1, (v.x + 20) / 55));
    v.weights = { [drape.id]: (1 - lower) * (1 - kick), [hem.id]: lower * (1 - kick), [thigh.id]: kick };
  });

  const radius = 18, groundY = 487;
  const ball = artwork('Football · dynamic ball', [
    ellipse(0, 0, radius, radius, '#f9f4df', ink, 1.4),
    path('M -7 -3 L 0 -10 L 8 -3 L 5 6 L -5 6 Z', ink, 'none'),
    path('M -7 -3 L -17 0 M 8 -3 L 17 0 M -5 6 L -9 15 M 5 6 L 9 15 M 0 -10 L 0 -17', 'none', ink, 1.2),
    path('M -17 0 L -14 8 L -9 15 M 17 0 L 14 8 L 9 15', 'none', ink, 1),
  ], 86);
  ball.local = { ...identity(), x: 465, y: groundY - radius };
  const ballShadow = artwork('Football · ground shadow', [{ ...ellipse(0, 0, 18, 3, '#315c48'), opacity: .25 }], 3);
  ballShadow.local = { ...identity(), x: ball.local.x, y: groundY };

  getHandRigs(rig).forEach(h => applyHandPose(rig, h.id, 'open'));
  const base = new Map([...rig.bones.values()].map(b => [b.id, { ...b.local }]));
  const leftAnkle = { ...leftFoot.world }, leftRotation = leftFoot.world.rotation;
  const toeLength = rightFoot.length + 6;
  // Interpolate world-space pose goals, then save normal bone keys every frame.
  // This keeps the support ankle planted and makes the striking toe measurable.
  const goals = [
    [0, 426, 470, 0, 0, 0], [14, 425, 470, 0, 0, -.015],
    [30, 400, 452, -2, 7, -.05], [39, 413, 462, -1, 9, -.03],
    [48, 446, 484, 2, 10, .045], [55, 476, 464, 3, 8, .065],
    [68, 458, 459, 2, 5, .02], [86, 426, 470, 0, 0, 0], [144, 426, 470, 0, 0, 0],
  ];
  const tracks: AnimationTrack[] = [...rig.bones.values()].map(b => ({ id: createId('track'), targetId: b.id, property: 'transform', keyframes: [] }));
  for (let frame = 0; frame <= 144; frame++) {
    rig.bones.forEach(b => { b.local = { ...base.get(b.id)! }; });
    const next = goals.findIndex(g => g[0] >= frame), b = goals[Math.max(1, next)], a = goals[Math.max(0, next - 1)];
    const t = (frame - a[0]) / Math.max(1, b[0] - a[0]), u = t * t * (3 - 2 * t);
    const mix = (i: number) => a[i] + (b[i] - a[i]) * u;
    pelvis.local.x += mix(3); pelvis.local.y += mix(4); spine.local.rotation += mix(5);
    const upperL = bone(rig, 'Left upper arm'), upperR = bone(rig, 'Right upper arm');
    upperL.local.rotation += mix(5) * -2; upperR.local.rotation += mix(5) * 2;
    drape.local.rotation -= mix(5) * .1; hem.local.rotation -= mix(5) * .5;
    rig.update();
    rig.solveIK(leftShin.id, leftAnkle, 2);
    leftFoot.local.rotation = leftRotation - leftShin.world.rotation;
    const footRotation = .62;
    // Toe circle is centred at the visible end of the shoe, below ball centre.
    const ankle = { x: mix(1) - Math.cos(footRotation) * toeLength, y: mix(2) - Math.sin(footRotation) * toeLength };
    rig.solveIK(shin.id, ankle, 2); rightFoot.local.rotation = footRotation - shin.world.rotation; rig.update();
    for (const track of tracks) track.keyframes.push({ id: createId('key'), frame, value: { ...rig.bones.get(track.targetId)!.local }, easing: 'linear' });
  }
  // Keep static targets compact and editable rather than writing redundant keys.
  tracks.forEach(t => { if (t.keyframes.every(k => JSON.stringify(k.value) === JSON.stringify(t.keyframes[0].value))) t.keyframes = [t.keyframes[0]]; });
  tracks.push({ id: createId('track'), targetId: rig.characterViews[0].id, property: 'viewAngle', keyframes: [{ id: createId('key'), frame: 0, value: 0 }] });
  const clip: AnimationClip = { id: createId('animation'), name: 'Football kick · wind, dress, hair, chest & ball physics', fps: 24, startFrame: 0, endFrame: 144, tracks };
  rig.animations = [clip];
  const kickContact = { id: createId('body'), targetId: rightFoot.id, name: 'Right foot · kick contact', shape: 'circle' as const, motion: 'kinematic' as const, x: toeLength, y: 0, radius: 4, width: 8, height: 8, rotation: 0, mass: 1, restitution: .35, friction: .03, enabled: true };
  const ballBody = { id: createId('body'), targetId: ball.id, name: 'Football · kicked dynamic body', shape: 'circle' as const, motion: 'dynamic' as const, x: 0, y: 0, radius, width: radius * 2, height: radius * 2, rotation: 0, mass: .45, restitution: .6, friction: .2, windScale: .04, initialVelocity: { x: 110, y: -235 }, launchFrame: 24, enabled: true };
  const floor = { id: createId('body'), name: 'Grass floor · football bounce', shape: 'box' as const, motion: 'static' as const, x: 450, y: groundY + 30, radius: 8, width: 2000, height: 60, rotation: 0, mass: 1, restitution: .48, friction: .16, enabled: true };
  rig.dynamics = {
    enabled: true, startFrame: 0, endFrame: 144, fps: 24, substeps: 8,
    gravityX: 0, gravityY: 310, windX: 110, windY: -8, windNoise: 45, seed: 47,
    bones: [bone(rig, 'Chest · left jiggle control'), bone(rig, 'Chest · right jiggle control')].map((b, i) => ({ id: createId('dynamic'), boneId: b.id, enabled: true, mode: 'jiggle' as const, stiffness: i ? 112 : 104, damping: 8.5, mass: 1, gravityScale: .018, windScale: 0, influence: .9, overlap: 1, maxDisplacement: 4.5 })),
    bodies: [floor, kickContact, ballBody],
    meshes: [
      { id: createId('cloth'), layerId: skirt.id, enabled: true, mode: 'cloth' as const, stiffness: 48, damping: 6, mass: .85, gravityScale: .14, windScale: .95, pinned: skirt.mesh!.vertices.flatMap((v, i) => v.y < 42 ? [i] : []), poseFollow: .9, maxDisplacement: 15, adaptiveRest: true },
      ...hairMeshes.map(({ layerId, pinned }) => ({ id: createId('cloth'), layerId, enabled: true, mode: 'cloth' as const, stiffness: 26, damping: 4, mass: .55, gravityScale: .04, windScale: 1.65, pinned, poseFollow: .96, maxDisplacement: 8, adaptiveRest: true })),
    ], emitters: [],
  };
  rig.metadata = { ...rig.metadata, version: 'football-3', scene: 'Football on a windy grass pitch', footballUsage: 'The editable right-foot contact remains available, while the dynamic ball receives a deterministic launch impulse at frame 24. No ball translation keys are authored.', simulationUsage: 'Live wind-driven dress and loose hair, pinned waist/scalp, chest jiggle. The planted ankle remains fixed.', sceneIds: JSON.stringify({ field: field.id, ball: ball.id, ballShadow: ballShadow.id, kickFoot: rightFoot.id, leftFoot: leftFoot.id, ballBody: ballBody.id, kickContact: kickContact.id, floor: floor.id, hairMeshes: hairMeshes.map(m => m.layerId), groundY, kickFrame: 48 }) };
  rig.setTimeline({ activeAnimationId: clip.id, currentFrame: 0, startFrame: 0, endFrame: 144, fps: 24, loop: false });
  rig.applyAnimation(clip.id, 0); return rig;
}
