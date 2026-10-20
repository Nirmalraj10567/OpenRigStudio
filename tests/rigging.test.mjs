import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

// Compile the actual TypeScript modules in memory using Vite's installed compiler.
const { outputFiles } = await build({
  stdin: { contents: "export * from './src/engine/Rig'; export * from './src/engine/math'; export * from './src/engine/demoRig'; export * from './src/ui/boneOverlay'; export { useProject } from './src/state/projectStore';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, identity, localToWorldPoint, worldToLocalPoint, useProject, createDemoRig, poseChainIds, drawBoneOverlay } = compiled.exports;
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const pointNear = (a, b, tolerance) => { near(a.x, b.x, tolerance); near(a.y, b.y, tolerance); };
const poseNear = (a, b) => Object.keys(identity()).forEach(key => near(a[key], b[key]));
function chain() {
  const rig = new Rig();
  const root = rig.addBone(null, 'Upper', 100);
  const child = rig.addBone(root, 'Lower', 80);
  rig.bones.get(root).local = identity(); rig.update();
  return { rig, root, child };
}

test('binding does not double artwork position and keeps animation-local values', () => {
  const rig = new Rig(); const bone = rig.addBone(null); const image = rig.addImage();
  const layer = rig.layers.get(image); const before = { ...layer.world }; const local = { ...layer.local };
  assert.equal(rig.bind(image, bone), true);
  poseNear(layer.world, before); poseNear(layer.local, local);
  rig.bones.get(bone).local.x += 50; rig.update();
  near(layer.world.x, before.x + 50);
});

test('locked bones reject rigid mapping without changing an existing binding', () => {
  const rig = new Rig(); const bone = rig.addBone(null, 'Target', 80); const image = rig.addImage('Badge');
  rig.bones.get(bone).locked = true;
  assert.equal(rig.bind(image, bone), false);
  assert.equal(rig.layers.get(image).boundBoneId, null);
  rig.bones.get(bone).locked = false;
  assert.equal(rig.bind(image, bone), true);
  rig.bones.get(bone).locked = true;
  const mapped = rig.layers.get(image).boundBoneId;
  assert.equal(rig.bind(image, bone), false);
  assert.equal(rig.layers.get(image).boundBoneId, mapped);
});

test('image/vector bind, rebind, unbind preserve rotated nonuniform world poses', () => {
  for (const vector of [false, true]) {
    const { rig, root, child } = chain();
    rig.bones.get(root).local = { x: 90, y: 60, rotation: .7, scaleX: 2, scaleY: .5 };
    const id = vector ? rig.addVectorLayer() : rig.addImage();
    const layer = rig.layers.get(id);
    layer.local = { x: 270, y: 120, rotation: -.3, scaleX: .8, scaleY: 1.2 }; rig.update();
    const before = { ...layer.world };
    assert.equal(rig.bind(id, root), true); poseNear(layer.world, before);
    assert.equal(rig.bind(id, child), true); poseNear(layer.world, before);
    rig.bones.get(root).local.rotation += .4; rig.update();
    const posed = { ...layer.world };
    assert.equal(rig.unbind(id), true); poseNear(layer.world, posed);
    assert.equal(layer.boundBoneId, null);
  }
});

test('deleting an ancestor releases bound artwork without jumping', () => {
  const { rig, root, child } = chain(); const id = rig.addVectorLayer();
  rig.bind(id, child); rig.bones.get(child).local.rotation = .4; rig.update();
  const before = { ...rig.layers.get(id).world }; rig.remove(root);
  assert.equal(rig.bones.size, 0); assert.equal(rig.bindings.size, 0);
  poseNear(rig.layers.get(id).world, before); assert.equal(rig.layers.get(id).boundBoneId, null);
});

test('world/local conversion, bound movement and reparenting work under nonuniform rotation', () => {
  const { rig, root, child } = chain();
  rig.bones.get(root).local = { x: 100, y: 50, rotation: .8, scaleX: 2, scaleY: .5 }; rig.update();
  const p = { x: 31, y: -24 };
  pointNear(worldToLocalPoint(rig.bones.get(root).world, localToWorldPoint(rig.bones.get(root).world, p)), p);
  assert.equal(rig.moveWorld(child, { x: 310, y: 180 }), true);
  pointNear(rig.bones.get(child).world, { x: 310, y: 180 });
  const before = { ...rig.bones.get(child).world };
  assert.equal(rig.reparentBone(child, null), true); poseNear(rig.bones.get(child).world, before);
  assert.equal(rig.reparentBone(child, root), true); poseNear(rig.bones.get(child).world, before);
  const id = rig.addImage(); rig.bind(id, child);
  assert.equal(rig.moveWorld(id, { x: 320, y: 230 }), true);
  pointNear(rig.layers.get(id).world, { x: 320, y: 230 });
});

test('children start at parent tip and cyclic parenting is rejected', () => {
  const { rig, root, child } = chain();
  pointNear(rig.bones.get(child).world, rig.getBoneEnd(root));
  assert.equal(rig.reparentBone(root, child), false);
  assert.equal(rig.reparentBone(root, root), false);
});

test('IK reaches target while keeping root and segment lengths fixed; bound art follows', () => {
  const { rig, root, child } = chain(); const id = rig.addImage(); rig.bind(id, child);
  const layerBefore = { ...rig.layers.get(id).world };
  const rootBefore = { ...rig.bones.get(root).world };
  assert.equal(rig.solveIK(child, { x: 120, y: 70 }), true);
  pointNear(rig.getBoneEnd(child), { x: 120, y: 70 }, .1);
  pointNear(rig.bones.get(root).world, rootBefore);
  assert.equal(rig.bones.get(root).length, 100); assert.equal(rig.bones.get(child).length, 80);
  assert.notDeepEqual(rig.layers.get(id).world, layerBefore);
});

test('IK bends a straight chain toward a collinear reachable target', () => {
  const { rig, child } = chain();
  assert.equal(rig.solveIK(child, { x: 120, y: 0 }), true);
  pointNear(rig.getBoneEnd(child), { x: 120, y: 0 }, .1);
});

test('IK handles unreachable targets and locked joints without nonfinite values', () => {
  const { rig, root, child } = chain(); rig.bones.get(root).locked = true;
  rig.solveIK(child, { x: 100, y: 80 });
  near(rig.bones.get(root).local.rotation, 0);
  pointNear(rig.getBoneEnd(child), { x: 100, y: 80 }, .1);
  rig.solveIK(child, { x: 1000, y: 0 });
  assert.ok([...rig.bones.values()].every(bone => Object.values(bone.world).every(Number.isFinite)));
  assert.ok(Math.hypot(rig.getBoneEnd(child).x, rig.getBoneEnd(child).y) <= 180.001);
});

test('invalid mappings and singular parent transforms fail safely', () => {
  const { rig, root, child } = chain(); const id = rig.addImage();
  assert.equal(rig.bind(id, 'missing'), false); assert.equal(rig.bind('missing', root), false);
  rig.bones.get(root).local.scaleX = 0; rig.update();
  assert.equal(rig.bind(id, root), false); assert.equal(rig.moveWorld(child, { x: 1, y: 1 }), false);
  assert.equal(rig.solveIK(child, { x: NaN, y: 0 }), false);
  assert.equal(worldToLocalPoint(rig.bones.get(root).world, { x: 0, y: 0 }), null);
});

test('JSON round trip preserves mapping and follows the same posed chain', () => {
  const { rig, child } = chain(); const id = rig.addVectorLayer(); rig.bind(id, child);
  rig.solveIK(child, { x: 120, y: 70 });
  const loaded = Rig.fromJSON(rig.toJSON());
  assert.equal(loaded.layers.get(id).boundBoneId, child);
  poseNear(loaded.layers.get(id).world, rig.layers.get(id).world);
  loaded.bones.get(child).local.rotation += .3; loaded.update();
  assert.notDeepEqual(loaded.layers.get(id).world, rig.layers.get(id).world);
});

test('explicit store mapping supports undo/redo and invalid target never falls back', () => {
  const { rig, root, child } = chain(); const id = rig.addImage();
  useProject.getState().replaceProject(rig.toProject(), false);
  useProject.getState().select(id);
  assert.equal(useProject.getState().bindSelected(id, 'missing'), false);
  assert.equal(useProject.getState().rig.bindings.size, 0);
  assert.equal(useProject.getState().bindSelected(id, child), true);
  assert.equal(useProject.getState().rig.layers.get(id).boundBoneId, child);
  useProject.getState().undo(); assert.equal(useProject.getState().rig.layers.get(id).boundBoneId, null);
  useProject.getState().redo(); assert.equal(useProject.getState().rig.layers.get(id).boundBoneId, child);
  useProject.getState().select(root); useProject.getState().addBoneUnder(null);
  const state = useProject.getState(); assert.equal(state.rig.bones.get(state.selectedId).parentId, null);
});

test('two-joint IK keeps ancestor and opposite limb in place', () => {
  const rig = createDemoRig();
  const lower = [...rig.bones.values()].find(b => b.name === 'Left lower arm');
  const torso = rig.getRoots()[0];
  const right = [...rig.bones.values()].find(b => b.name === 'Right lower arm');
  const torsoBefore = { ...torso.world }, rightBefore = { ...right.world };
  const target = { x: 313, y: 292 };
  assert.equal(rig.solveIK(lower.id, target, 2), true);
  pointNear(rig.getBoneEnd(lower.id), target, .1);
  poseNear(torso.world, torsoBefore); poseNear(right.world, rightBefore);
  assert.equal(rig.getPoseBoneIds(lower.id, 2).length, 2);
  assert.deepEqual(poseChainIds(rig, lower.id, 2), rig.getPoseBoneIds(lower.id, 2));
});

test('locked ancestor blocks full-chain rotations above that ancestor', () => {
  const { rig, root, child } = chain(); const tip = rig.addBone(child, 'Tip', 40);
  rig.bones.get(child).locked = true;
  const before = { ...rig.bones.get(root).local };
  assert.deepEqual(rig.getPoseBoneIds(tip), [tip]);
  rig.solveIK(tip, { x: 180, y: 40 });
  poseNear(rig.bones.get(root).local, before);
  near(rig.bones.get(child).local.rotation, 0);
});

test('IK handles coincident target, arbitrary child offset, and reflection', () => {
  const { rig, root, child } = chain();
  rig.bones.get(child).length = 100;
  rig.solveIK(child, { x: 0, y: 0 }, 2);
  pointNear(rig.getBoneEnd(child), { x: 0, y: 0 }, .1);
  rig.bones.get(root).local = { ...identity(), rotation: .5, scaleX: -1 };
  rig.bones.get(child).local = { ...identity(), x: 70, y: 30, rotation: -.6 };
  rig.update();
  const target = { ...rig.getBoneEnd(child) };
  rig.bones.get(root).local.rotation = -.5;
  rig.bones.get(child).local.rotation = .8; rig.update();
  assert.equal(rig.solveIK(child, target, 2), true);
  pointNear(rig.getBoneEnd(child), target, .1);
});

test('FK respects locks and preserves bone origin and child local transform', () => {
  const { rig, root, child } = chain();
  const origin = { ...rig.bones.get(root).world }, childLocal = { ...rig.bones.get(child).local };
  assert.equal(rig.rotateBoneTo(root, { x: 0, y: 100 }), true);
  pointNear(rig.bones.get(root).world, origin);
  pointNear(rig.getBoneEnd(root), { x: 0, y: 100 });
  poseNear(rig.bones.get(child).local, childLocal);
  rig.bones.get(root).locked = true;
  const locked = { ...rig.bones.get(root).local };
  assert.equal(rig.rotateBoneTo(root, { x: 100, y: 0 }), false);
  poseNear(rig.bones.get(root).local, locked);
});

test('demo is fully bound and new factory calls do not share mutable data', () => {
  const rig = createDemoRig(), other = createDemoRig();
  assert.equal(rig.layers.size, 14); assert.equal(rig.bones.size, 14);
  assert.equal(rig.bindings.size, rig.layers.size);
  for (const layer of rig.layers.values()) assert.ok(rig.bones.has(layer.boundBoneId));
  assert.notEqual(rig.id, other.id);
  const id = [...rig.bones.values()].find(b => b.name === 'Left lower arm').id;
  const attached = [...rig.layers.values()].find(l => l.boundBoneId === id);
  const before = { ...attached.world };
  rig.solveIK(id, { x: 313, y: 292 }, 2);
  assert.notDeepEqual(attached.world, before);
  const restored = Rig.fromJSON(rig.toJSON());
  poseNear(restored.layers.get(attached.id).world, attached.world);
});

test('key pose records the complete limb atomically and survives scrubbing and undo/redo', () => {
  useProject.getState().replaceProject(createDemoRig().toProject(), false);
  const state = useProject.getState(), rig = state.rig;
  const id = [...rig.bones.values()].find(b => b.name === 'Left lower arm').id;
  state.setFrame(24);
  rig.solveIK(id, { x: 313, y: 292 }, 2);
  const pose = { ...rig.getBoneEnd(id) };
  const ids = rig.getPoseBoneIds(id, 2);
  const history = useProject.getState().past.length;
  state.keyPose(ids);
  assert.equal(useProject.getState().past.length, history + 1);
  const clip = rig.animations[0];
  for (const targetId of ids) assert.ok(clip.tracks.find(t => t.targetId === targetId).keyframes.some(k => k.frame === 24));
  state.setFrame(0); state.setFrame(24);
  pointNear(rig.getBoneEnd(id), pose);
  state.undo();
  assert.ok(useProject.getState().rig.animations[0].tracks.every(t => !t.keyframes.some(k => k.frame === 24)));
  state.redo(); useProject.getState().setFrame(24);
  pointNear(useProject.getState().rig.getBoneEnd(id), pose);
});

test('auto-key records a frame-zero pose and the edited pose at the current frame', () => {
  useProject.getState().replaceProject(createDemoRig().toProject(), false);
  const state = useProject.getState();
  const rig = state.rig;
  const id = [...rig.bones.values()].find(bone => bone.name === 'Left lower arm').id;
  const original = rig.bones.get(id).local.rotation;
  state.setAutoKey(true);
  state.setFrame(12);
  state.updateProject(project => {
    project.bones.get(id).local.rotation = original + Math.PI / 4;
  });
  const animation = useProject.getState().rig.animations.find(item => item.id === useProject.getState().rig.timeline.activeAnimationId);
  const track = animation.tracks.find(item => item.targetId === id && item.property === 'transform');
  assert.ok(track?.keyframes.some(key => key.frame === 0));
  assert.ok(track?.keyframes.some(key => key.frame === 12));
  state.setFrame(0);
  near(useProject.getState().rig.bones.get(id).local.rotation, original);
  state.setFrame(12);
  near(useProject.getState().rig.bones.get(id).local.rotation, original + Math.PI / 4);
});

test('wireframe bone overlay uses thin screen-space strokes at different zoom levels', () => {
  const { rig, child } = chain();
  for (const zoom of [.5, 1, 2]) {
    const scales = [], widths = [], labels = [];
    const ctx = new Proxy({
      scale: (x, y) => scales.push([x, y]),
      measureText: () => ({ width: 30 }),
      fillText: text => labels.push(text),
    }, {
      get(target, key) { return key in target ? target[key] : () => {}; },
      set(target, key, value) { if (key === 'lineWidth') widths.push(value); target[key] = value; return true; },
    });
    drawBoneOverlay(ctx, rig, { zoom, selectedId: child, names: true, pose: true, chainLength: 2 });
    assert.equal(scales.length, 2);
    for (const [x, y] of scales) { near(x, 1 / zoom); near(y, 1 / zoom); }
    assert.ok(widths.every(width => width <= 1.5));
    assert.deepEqual(labels, ['Upper', 'Lower']);
  }
});
