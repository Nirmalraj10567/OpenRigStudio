import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({ stdin: { contents: "export * from './src/engine/index'; export { useProject } from './src/state/projectStore';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, normalizeDynamics, addBoneDynamics, addMeshDynamics, addPhysicsBody, addParticleEmitter, buildPhysicsCache, cachedPhysicsFrame, bakeDynamics, collidePhysicsPoint, invalidateDynamics, projectToSVG, createConstraint, useProject, addCharacterViewSet, addCharacterView } = compiled.exports;
const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);

function springRig() {
  const rig = new Rig();
  const root = rig.addBone(null, 'Anchor', 0), tip = rig.addBone(root, 'Tail', 80);
  rig.bones.get(root).local = { x: 150, y: 120, rotation: 0, scaleX: 1, scaleY: 1 };
  rig.bones.get(tip).local = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  rig.update(); addBoneDynamics(rig, tip, 'tail'); rig.dynamics.endFrame = 36;
  return { rig, root, tip };
}

test('legacy projects default to disabled dynamics; malformed settings and cache are normalized', () => {
  assert.equal(new Rig({ bones: [], images: [] }).dynamics.enabled, false);
  const settings = normalizeDynamics({ enabled: true, fps: -1, startFrame: 30, endFrame: 2, substeps: 0, gravityY: NaN, bones: [null, { boneId: 'missing' }], meshes: [null], cache: { frames: [null] } }, new Set(), new Set());
  assert.equal(settings.fps, 1); assert.equal(settings.substeps, 1); assert.equal(settings.startFrame, 30); assert.equal(settings.endFrame, 30);
  assert.equal(settings.gravityY, 420); assert.deepEqual(settings.bones, []); assert.equal(settings.cache, undefined);
});

test('fixed-step gravity is non-destructive and seeking is independent of playback history', () => {
  const { rig, tip } = springRig(), local = { ...rig.bones.get(tip).local };
  rig.setTimeline({ currentFrame: 24 }); rig.update();
  const first = structuredClone(rig.physicsFrame);
  assert.ok(first.bones[tip] > .01); assert.deepEqual(rig.bones.get(tip).local, local);
  rig.setTimeline({ currentFrame: 5 }); rig.update(); rig.setTimeline({ currentFrame: 24 }); rig.update();
  assert.deepEqual(rig.physicsFrame, first);
  const restored = Rig.fromJSON(rig.toJSON()); restored.update();
  assert.deepEqual(restored.physicsFrame, first);
  rig.dynamics.enabled = false; rig.update(); near(rig.bones.get(tip).world.rotation, local.rotation);
});

test('follow-through lags authored parent motion and recomputes from animation keys', () => {
  const { rig, root, tip } = springRig(); rig.dynamics.gravityY = 0;
  rig.animations = [{ id: 'motion', name: 'Motion', fps: 24, startFrame: 0, endFrame: 36, setupPose: { [root]: { local: { ...rig.bones.get(root).local } } }, tracks: [{ id: 'rotation', targetId: root, property: 'rotation', keyframes: [{ id: 'a', frame: 0, value: 0 }, { id: 'b', frame: 6, value: 1 }, { id: 'c', frame: 36, value: 1 }] }] }];
  rig.setTimeline({ activeAnimationId: 'motion' }); rig.applyAnimation('motion', 6);
  assert.ok(rig.bones.get(tip).world.rotation < rig.bones.get(root).world.rotation);
  const first = structuredClone(rig.physicsFrame); rig.applyAnimation('motion', 30); rig.applyAnimation('motion', 6);
  assert.deepEqual(rig.physicsFrame, first);
});

test('cache matches preview, interpolates fractional frames, persists, and rejects stale inputs', () => {
  const { rig, tip } = springRig(); rig.setTimeline({ currentFrame: 12 }); rig.update();
  const expected = structuredClone(rig.physicsFrame), before = structuredClone(rig.bones.get(tip).local);
  const cache = buildPhysicsCache(rig); assert.equal(cache.frames.length, 37);
  assert.deepEqual(cachedPhysicsFrame(rig, 12), expected); assert.deepEqual(rig.bones.get(tip).local, before);
  const fractional = cachedPhysicsFrame(rig, 12.5);
  near(fractional.bones[tip], (cache.frames[12].bones[tip] + cache.frames[13].bones[tip]) / 2);
  const restored = Rig.fromJSON(rig.toJSON()); assert.ok(cachedPhysicsFrame(restored, 12));
  rig.dynamics.gravityY += 10; assert.equal(cachedPhysicsFrame(rig, 12), null);
  rig.dynamics.gravityY -= 10; invalidateDynamics(rig); assert.equal(rig.dynamics.cache, undefined);
});

test('simulation starts at a nonzero range and holds its final frame', () => {
  const { rig } = springRig(); rig.dynamics.startFrame = 10; rig.dynamics.endFrame = 20;
  rig.setTimeline({ currentFrame: 9 }); rig.update(); assert.equal(rig.physicsFrame, null);
  rig.setTimeline({ currentFrame: 10 }); rig.update(); assert.deepEqual(Object.values(rig.physicsFrame.bones), [0]);
  rig.setTimeline({ currentFrame: 20 }); rig.update(); const end = structuredClone(rig.physicsFrame);
  rig.setTimeline({ currentFrame: 25 }); rig.update(); assert.deepEqual(rig.physicsFrame, end);
});

test('circle and rotated box projections keep points outside collision geometry', () => {
  const body = { enabled: true, shape: 'circle', x: 0, y: 0, radius: 10 };
  near(Math.hypot(...Object.values(collidePhysicsPoint({ x: 0, y: 0 }, body))), 10);
  assert.deepEqual(collidePhysicsPoint({ x: 20, y: 0 }, body), { x: 20, y: 0 });
  const box = { ...body, shape: 'box', width: 20, height: 4, rotation: Math.PI / 2 };
  const point = collidePhysicsPoint({ x: 1, y: 0 }, box); near(point.x, 2); near(point.y, 0);
});

test('dynamic bodies fall onto static colliders without changing authored layer transforms', () => {
  const rig = new Rig(), layer = rig.addVectorLayer('Ball', [{ id: 'ball', kind: 'ellipse', radiusX: 10, radiusY: 10, fill: '#fff' }]);
  rig.layers.get(layer).local = { x: 200, y: 100, rotation: 0, scaleX: 1, scaleY: 1 }; rig.update();
  const id = addPhysicsBody(rig, layer), body = rig.dynamics.bodies.find(item => item.id === id); body.motion = 'dynamic'; body.radius = 10;
  const floorId = addPhysicsBody(rig), floor = rig.dynamics.bodies.find(item => item.id === floorId); Object.assign(floor, { shape: 'box', x: 200, y: 220, width: 300, height: 20, restitution: 0 });
  rig.dynamics.endFrame = 72; rig.setTimeline({ currentFrame: 72 }); rig.update();
  assert.ok(rig.layers.get(layer).world.y > 100); assert.ok(rig.layers.get(layer).world.y <= 200.0001);
  assert.equal(rig.layers.get(layer).local.y, 100);
});

test('cloth pins follow the authored mesh while free vertices respond to wind and gravity', () => {
  const rig = new Rig(), layer = rig.addVectorLayer('Cloth', [{ id: 'cloth', kind: 'rect', x: 0, y: 0, width: 60, height: 60, fill: '#eee' }]);
  rig.createMesh(layer, 2, 2); rig.update();
  const base = rig.getMeshVertices(layer); addMeshDynamics(rig, layer, 'cloth'); rig.dynamics.windX = 200; rig.dynamics.endFrame = 24;
  const authored = structuredClone(rig.layers.get(layer).mesh.vertices);
  rig.setTimeline({ currentFrame: 24 }); const points = rig.getMeshVertices(layer);
  const pinned = rig.dynamics.meshes[0].pinned;
  pinned.forEach(index => { near(points[index].x, base[index].x); near(points[index].y, base[index].y); });
  assert.ok(points.some((point, index) => !pinned.includes(index) && Math.hypot(point.x - base[index].x, point.y - base[index].y) > .1));
  assert.deepEqual(rig.layers.get(layer).mesh.vertices, authored);
  assert.ok(!projectToSVG(rig).includes('NaN'));
});

test('seeded particle emission is repeatable, bounded, finite, and included in SVG', () => {
  const rig = new Rig(); addParticleEmitter(rig); rig.dynamics.endFrame = 36;
  rig.setTimeline({ currentFrame: 24 }); rig.update(); const particles = structuredClone(rig.physicsFrame.particles);
  assert.ok(particles.length >= 10); assert.match(projectToSVG(rig), /data-physics-particles="true"><circle/);
  invalidateDynamics(rig); rig.update(); assert.deepEqual(rig.physicsFrame.particles, particles);
  rig.dynamics.seed = 5; rig.update(); assert.notDeepEqual(rig.physicsFrame.particles, particles);
});

test('bake creates editable transform keys and preserves a constrained simulated pose', () => {
  const { rig, tip } = springRig();
  const constraintId = createConstraint(rig, 'angle', tip); const constraint = rig.constraints.find(item => item.id === constraintId); constraint.minAngle = 0; constraint.maxAngle = 0;
  rig.setTimeline({ currentFrame: 24 }); rig.update(); const expected = { ...rig.bones.get(tip).world };
  const id = bakeDynamics(rig), clip = rig.animations.find(item => item.id === id);
  assert.equal(clip.tracks.find(track => track.targetId === tip && track.property === 'transform').keyframes.length, 37);
  rig.applyAnimation(id, 24); near(rig.bones.get(tip).world.rotation, expected.rotation);
  assert.equal(rig.physicsFrame, null); assert.equal(rig.dynamics.enabled, true);
  const loaded = Rig.fromJSON(rig.toJSON()); loaded.applyAnimation(id, 24); near(loaded.bones.get(tip).world.rotation, expected.rotation);
});

test('mesh and particle bakes match sampled positions and stay hidden in the source clip', () => {
  const rig = new Rig(), layer = rig.addVectorLayer('Soft patch', [{ id: 'rect', kind: 'rect', width: 40, height: 40, fill: '#fff' }]);
  rig.createMesh(layer, 2, 2); addMeshDynamics(rig, layer, 'soft-body'); addParticleEmitter(rig);
  rig.dynamics.endFrame = 24; rig.setTimeline({ currentFrame: 18 }); const expected = rig.getMeshVertices(layer), count = rig.physicsFrame.particles.length;
  const id = bakeDynamics(rig); rig.applyAnimation(id, 18);
  rig.getMeshVertices(layer).forEach((point, i) => { near(point.x, expected[i].x); near(point.y, expected[i].y); });
  const particleLayer = rig.animations.find(clip => clip.id === id).dynamicsBake.particleLayerId;
  assert.equal(rig.layers.get(particleLayer).shapes.length, count);
  rig.setTimeline({ activeAnimationId: null }); rig.update(); assert.equal(rig.getRenderLayer(particleLayer).visible, false);
});

test('editor cache generation is undoable, saving/name edits retain it, and pose edits invalidate it', () => {
  const { rig, tip } = springRig();
  useProject.getState().replaceProject(rig.toProject(), false); useProject.getState().setAutoKey(false);
  useProject.getState().updateProject(project => buildPhysicsCache(project));
  assert.equal(useProject.getState().rig.dynamics.cache.frames.length, 37);
  useProject.getState().updateProject(project => { project.name = 'Saved spring project'; });
  assert.ok(useProject.getState().rig.dynamics.cache);
  const saved = Rig.fromJSON(useProject.getState().serialize()); assert.ok(cachedPhysicsFrame(saved, 12));
  useProject.getState().updateProject(project => { project.bones.get(tip).local.rotation += .2; });
  assert.equal(useProject.getState().rig.dynamics.cache, undefined);
  useProject.getState().undo(); assert.ok(useProject.getState().rig.dynamics.cache);
});

test('static attached bodies hold their start pose while kinematic bodies follow animation', () => {
  const rig = new Rig(), boneId = rig.addBone(null, 'Moving collider', 10);
  rig.bones.get(boneId).local.x = 100; rig.update();
  const staticId = addPhysicsBody(rig, boneId), kineticId = addPhysicsBody(rig, boneId);
  rig.dynamics.bodies.find(body => body.id === staticId).motion = 'static';
  rig.animations = [{ id: 'move', name: 'Move', fps: 24, startFrame: 0, endFrame: 24, setupPose: { [boneId]: { local: { ...rig.bones.get(boneId).local } } }, tracks: [{ id: 'x', targetId: boneId, property: 'x', keyframes: [{ id: 'a', frame: 0, value: 100 }, { id: 'b', frame: 24, value: 200 }] }] }];
  rig.setTimeline({ activeAnimationId: 'move' }); rig.applyAnimation('move', 24);
  near(rig.physicsFrame.bodies[staticId].x, 100); near(rig.physicsFrame.bodies[kineticId].x, 200);
});

test('dynamic body offsets preserve target origins and baked output under parent transforms', () => {
  const { rig, root, tip } = springRig(); rig.dynamics.bones = []; rig.bones.get(root).local.rotation = .6;
  rig.update(); const id = addPhysicsBody(rig, tip), body = rig.dynamics.bodies.find(item => item.id === id);
  Object.assign(body, { motion: 'dynamic', x: 15, y: 10, rotation: .2 });
  rig.dynamics.gravityY = 0; rig.setTimeline({ currentFrame: 0 }); rig.update();
  const expected = { ...rig.bones.get(tip).world }; near(expected.x, rig.bones.get(root).world.x); near(expected.y, rig.bones.get(root).world.y);
  rig.dynamics.gravityY = 420; rig.setTimeline({ currentFrame: 24 }); rig.update(); const posed = { ...rig.bones.get(tip).world };
  const clip = bakeDynamics(rig); rig.applyAnimation(clip, 24); near(rig.bones.get(tip).world.x, posed.x); near(rig.bones.get(tip).world.y, posed.y);
});

test('jiggle translates under a scaled/rotated parent, stays bounded, settles, caches and bakes', () => {
  const { rig, root, tip } = springRig();
  rig.dynamics.bones = []; rig.dynamics.gravityY = 0; rig.dynamics.endFrame = 72;
  Object.assign(rig.bones.get(root).local, { rotation: .3, scaleX: 1.2, scaleY: .8 }); rig.update();
  addBoneDynamics(rig, tip, 'jiggle');
  Object.assign(rig.dynamics.bones[0], { stiffness: 100, damping: 10, maxDisplacement: 3 });
  rig.animations = [{ id: 'bounce', name: 'Bounce', fps: 24, startFrame: 0, endFrame: 72, tracks: [{ id: 'y', targetId: root, property: 'y', keyframes: [{ id: 'a', frame: 0, value: 120 }, { id: 'b', frame: 6, value: 108 }, { id: 'c', frame: 72, value: 108 }] }] }];
  rig.setTimeline({ activeAnimationId: 'bounce' });
  const original = { ...rig.bones.get(tip).local };
  const base = new Rig({ ...rig.toProject(), dynamics: { ...rig.dynamics, enabled: false } });
  for (let frame = 0; frame <= 72; frame += 3) {
    rig.applyAnimation('bounce', frame); base.applyAnimation('bounce', frame);
    const a = rig.bones.get(tip).world, b = base.bones.get(tip).world;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    assert.ok(distance <= 3.000001);
    if (frame === 6) assert.ok(distance > .5);
    if (frame === 72) assert.ok(distance < .02);
    assert.deepEqual(rig.bones.get(tip).local, original);
  }
  rig.applyAnimation('bounce', 6); const expected = { ...rig.bones.get(tip).world };
  const cache = buildPhysicsCache(rig), half = cachedPhysicsFrame(rig, 6.5);
  near(half.boneOffsets[tip].y, (cache.frames[6].boneOffsets[tip].y + cache.frames[7].boneOffsets[tip].y) / 2);
  const restored = Rig.fromJSON(rig.toJSON()); restored.applyAnimation('bounce', 6);
  near(restored.bones.get(tip).world.y, expected.y);
  const baked = bakeDynamics(rig); rig.applyAnimation(baked, 6);
  near(rig.bones.get(tip).world.x, expected.x); near(rig.bones.get(tip).world.y, expected.y);
});

test('adaptive cloth follows moving/rescaled authored poses without fighting frame-zero edge lengths', () => {
  const rig = new Rig(), id = rig.addVectorLayer('Dress', [{ id: 'cloth', kind: 'rect', width: 60, height: 80, fill: '#df8e84' }]);
  rig.createMesh(id, 3, 4); addMeshDynamics(rig, id);
  Object.assign(rig.dynamics, { gravityY: 0, endFrame: 24 });
  Object.assign(rig.dynamics.meshes[0], { poseFollow: 1, adaptiveRest: true, maxDisplacement: 8 });
  const local = { ...rig.layers.get(id).local };
  rig.animations = [{ id: 'turn', name: 'Turn and move', fps: 24, startFrame: 0, endFrame: 24, tracks: [{ id: 'pose', targetId: id, property: 'transform', keyframes: [{ id: 'a', frame: 0, value: local }, { id: 'b', frame: 24, value: { ...local, x: local.x + 100, scaleX: .4 } }] }] }];
  rig.setTimeline({ activeAnimationId: 'turn' });
  const base = new Rig({ ...rig.toProject(), dynamics: { ...rig.dynamics, enabled: false } });
  rig.applyAnimation('turn', 24); base.applyAnimation('turn', 24);
  const expected = base.getMeshVertices(id);
  rig.getMeshVertices(id).forEach((p, i) => { near(p.x, expected[i].x); near(p.y, expected[i].y); });
  rig.dynamics.windX = 400; rig.dynamics.gravityY = 300; rig.update();
  const posed = rig.getMeshVertices(id);
  posed.forEach((p, i) => assert.ok(Math.hypot(p.x - expected[i].x, p.y - expected[i].y) <= 8.00001));
  rig.dynamics.meshes[0].pinned.forEach(i => { near(posed[i].x, expected[i].x); near(posed[i].y, expected[i].y); });
});

test('changing the preview angle invalidates physics cache and simulates pins in the selected view', () => {
  const rig = new Rig(), id = rig.addVectorLayer('Cloth', [{ id: 'cloth', kind: 'rect', width: 40, height: 80, fill: '#fff' }]);
  rig.createMesh(id, 2, 3);
  const setId = addCharacterViewSet(rig, 'Dress', [id]), viewId = addCharacterView(rig, setId, -90, 'Side');
  rig.characterViews[0].views.find(v => v.id === viewId).targets[id].local.scaleX = .3;
  addMeshDynamics(rig, id); Object.assign(rig.dynamics, { endFrame: 12, gravityY: 0 });
  rig.setTimeline({ currentFrame: 12 }); buildPhysicsCache(rig);
  rig.characterAngleOverrides.set(setId, { frame: 12, angle: -90 });
  assert.equal(cachedPhysicsFrame(rig), null); rig.update();
  const base = new Rig({ ...rig.toProject(), dynamics: { ...rig.dynamics, enabled: false } });
  base.characterAngleOverrides.set(setId, { frame: 12, angle: -90 }); base.update();
  const expected = base.getMeshVertices(id), actual = rig.getMeshVertices(id);
  rig.dynamics.meshes[0].pinned.forEach(i => { near(actual[i].x, expected[i].x); near(actual[i].y, expected[i].y); });
});

test('Smart Bone view animation is resampled rather than frozen as a manual physics preview', () => {
  const rig = new Rig(), layer = rig.addVectorLayer('Dress', [{ id: 'cloth', kind: 'rect', width: 40, height: 80, fill: '#fff' }]);
  rig.createMesh(layer, 2, 3);
  const set = addCharacterViewSet(rig, 'Dress', [layer]), side = addCharacterView(rig, set, -90, 'Side');
  rig.characterViews[0].views.find(v => v.id === side).targets[layer].local.scaleX = .3;
  const driver = rig.addBone(null, 'Turn dial', 10), actionId = rig.createSmartAction('Turn', driver, 0, Math.PI / 2);
  const action = rig.smartActions.find(a => a.id === actionId);
  action.viewSetIds = [set]; action.keys = [{ angle: 0, targets: {}, viewAngles: { [set]: 0 } }, { angle: Math.PI / 2, targets: {}, viewAngles: { [set]: -90 } }];
  rig.animations = [{ id: 'spin', name: 'Spin', fps: 24, startFrame: 0, endFrame: 24, tracks: [{ id: 'turn', targetId: driver, property: 'rotation', keyframes: [{ id: 'a', frame: 0, value: 0 }, { id: 'b', frame: 24, value: Math.PI / 2 }] }] }];
  rig.setTimeline({ activeAnimationId: 'spin' });
  addMeshDynamics(rig, layer); Object.assign(rig.dynamics, { gravityY: 0, endFrame: 24 });
  Object.assign(rig.dynamics.meshes[0], { poseFollow: 1, adaptiveRest: true });
  const base = new Rig({ ...rig.toProject(), dynamics: { ...rig.dynamics, enabled: false } });
  buildPhysicsCache(rig);
  for (const frame of [12, 24, 6]) {
    rig.applyAnimation('spin', frame); base.applyAnimation('spin', frame);
    assert.ok(cachedPhysicsFrame(rig, frame));
    const points = rig.getMeshVertices(layer), expected = base.getMeshVertices(layer);
    points.forEach((p, i) => { near(p.x, expected[i].x); near(p.y, expected[i].y); });
  }
});
