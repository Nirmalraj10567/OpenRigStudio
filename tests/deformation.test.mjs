import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({
  stdin: { contents: "export * from './src/engine/index'; export {useProject} from './src/state/projectStore';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, identity, localToWorldPoint, triangleAffine, applyMatrix, normalizeWeights, validMesh,
  drawMeshLayer, createDeformationDemo, projectToSVG, useProject } = compiled.exports;
const close = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`);
const point = (a, b, epsilon) => { close(a.x, b.x, epsilon); close(a.y, b.y, epsilon); };
const points = (a, b) => { assert.equal(a.length, b.length); a.forEach((p, i) => point(p, b[i])); };
function fixture() {
  const rig = new Rig();
  const b1 = rig.addBone(null, 'Base', 100), b2 = rig.addBone(b1, 'Tip', 100);
  rig.bones.get(b1).local = identity(); rig.update();
  const layerId = rig.addImage('Flat artwork', { width: 200, height: 100, local: { ...identity(), x: 100 } });
  assert.ok(rig.createMesh(layerId, 4, 2));
  return { rig, b1, b2, layerId, layer: rig.layers.get(layerId) };
}
function expressionFixture() {
  const { rig, b1, b2, layerId, layer } = fixture();
  const driver = rig.addBone(null, 'Expression control');
  rig.bones.get(driver).local = identity(); rig.update();
  const actionId = rig.createSmartAction('Smile', driver, 0, Math.PI / 2);
  assert.ok(actionId);
  return { rig, b1, b2, layerId, layer, driver, actionId };
}

test('regular mesh has valid coverage, UVs and bounded density', () => {
  const { rig, layerId, layer } = fixture();
  assert.equal(layer.mesh.vertices.length, 15);
  assert.equal(layer.mesh.triangles.length, 48);
  assert.ok(validMesh(layer.mesh));
  points(rig.getMeshVertices(layerId), layer.mesh.vertices.map(v => localToWorldPoint(layer.world, v)));
  assert.equal(rig.createMesh(layerId, 6, 6), false);
  const second = rig.addImage();
  assert.equal(rig.createMesh(second, NaN, 2), false);
  assert.ok(rig.createMesh(second, 10000, 10000));
  assert.ok(rig.layers.get(second).mesh.vertices.length <= 1089);
});

test('auto weights preserve rest pose and deform different parts of one flat layer', () => {
  const { rig, layerId, layer, b1, b2 } = fixture();
  const before = rig.getMeshVertices(layerId);
  assert.ok(rig.bindMesh(layerId, [b1, b2]));
  points(rig.getMeshVertices(layerId), before);
  for (const vertex of layer.mesh.vertices) close(Object.values(vertex.weights).reduce((a, b) => a + b, 0), 1);
  rig.setVertexWeights(layerId, 0, { [b1]: 1 });
  rig.setVertexWeights(layerId, 4, { [b2]: 1 });
  rig.bones.get(b2).local.rotation = Math.PI / 2; rig.update();
  const after = rig.getMeshVertices(layerId);
  point(after[0], before[0]);
  point(after[4], { x: 150, y: 100 });
  assert.notDeepEqual(after[4], before[4]);
});

test('rigid conversion, rebind and skin unbind preserve the visible mesh', () => {
  const { rig, layerId, b1, b2 } = fixture();
  rig.removeMesh(layerId); rig.bind(layerId, b1); rig.createMesh(layerId, 4, 2);
  rig.bones.get(b1).local.rotation = .4; rig.update();
  let before = rig.getMeshVertices(layerId);
  assert.ok(rig.bindMesh(layerId, [b1, b2]));
  points(rig.getMeshVertices(layerId), before);
  assert.equal(rig.layers.get(layerId).boundBoneId, null);
  rig.bones.get(b2).local.rotation = .5; rig.update();
  before = rig.getMeshVertices(layerId);
  assert.ok(rig.bindMesh(layerId, [b2])); points(rig.getMeshVertices(layerId), before);
  assert.ok(rig.unbind(layerId)); points(rig.getMeshVertices(layerId), before);
  assert.ok(rig.layers.get(layerId).mesh.vertices.every(v => !Object.keys(v.weights).length));
});

test('vertex dragging inverse-maps skin and leaves UV and neighbouring vertices unchanged', () => {
  const { rig, layerId, layer, b1, b2 } = fixture();
  rig.bindMesh(layerId, [b1, b2]);
  rig.bones.get(b2).local.rotation = .7; rig.update();
  const before = rig.getMeshVertices(layerId), uv = { u: layer.mesh.vertices[3].u, v: layer.mesh.vertices[3].v };
  const target = { x: 157, y: -64 };
  assert.ok(rig.setMeshVertex(layerId, 3, target));
  point(rig.getMeshVertices(layerId)[3], target);
  point(rig.getMeshVertices(layerId)[4], before[4]);
  assert.equal(layer.mesh.vertices[3].u, uv.u); assert.equal(layer.mesh.vertices[3].v, uv.v);
});

test('invalid weights and vertex indices fail without corrupting the mesh', () => {
  const { rig, layerId, layer, b1 } = fixture();
  const before = JSON.stringify(layer.mesh);
  assert.equal(rig.setVertexWeights(layerId, 0, { [b1]: -1 }), false);
  assert.equal(rig.setVertexWeights(layerId, 0, { missing: 1 }), false);
  assert.equal(rig.setVertexWeights(layerId, 0, { [b1]: Infinity }), false);
  assert.equal(rig.setMeshVertex(layerId, 200, { x: 0, y: 0 }), false);
  assert.equal(rig.setMeshVertex(layerId, 0, { x: NaN, y: 0 }), false);
  assert.equal(JSON.stringify(layer.mesh), before);
  assert.deepEqual(normalizeWeights({ a: 2, b: 2 }), { a: .5, b: .5 });
});

test('deleting weighted bones cleans references and preserves mesh geometry', () => {
  const { rig, layerId, b1, b2 } = fixture(); rig.bindMesh(layerId, [b1, b2]);
  rig.bones.get(b2).local.rotation = .4; rig.update();
  const before = rig.getMeshVertices(layerId); rig.remove(b1);
  points(rig.getMeshVertices(layerId), before);
  assert.ok(rig.layers.get(layerId).mesh.vertices.every(v => Object.keys(v.weights).length === 0));
});

test('Smart action interpolates transform, opacity and mesh non-destructively without drift', () => {
  const { rig, layerId, layer, driver, actionId } = expressionFixture();
  const base = JSON.stringify(layer.local), rest = layer.mesh.vertices.map(v => ({ x: v.x, y: v.y }));
  assert.ok(rig.beginSmartEdit(actionId, Math.PI / 2));
  layer.local.x += 40; layer.opacity = .4; layer.mesh.vertices[0].y += 20;
  assert.ok(rig.captureSmartKey(actionId, Math.PI / 2, [layerId]));
  rig.endSmartEdit();
  assert.equal(JSON.stringify(layer.local), base); close(layer.opacity, 1);
  rig.bones.get(driver).local.rotation = Math.PI / 4; rig.update();
  close(layer.world.x, layer.local.x + 20); close(rig.getLayerOpacity(layerId), .7);
  close(rig.getMeshVertices(layerId)[0].y, rest[0].y + 10);
  for (let i = 0; i < 50; i++) rig.update();
  close(layer.world.x, layer.local.x + 20); assert.equal(JSON.stringify(layer.local), base);
  close(layer.mesh.vertices[0].y, rest[0].y);
  rig.bones.get(driver).local.rotation = 10; rig.update(); close(layer.world.x, layer.local.x + 40);
  rig.bones.get(driver).local.rotation = -10; rig.update(); close(layer.world.x, layer.local.x);
  rig.bones.get(driver).local.rotation = Math.PI / 2;
  rig.smartActions[0].enabled = false; rig.update(); close(layer.world.x, layer.local.x);
});

test('Smart turn actions switch layer visibility and order without mutating authored layers', () => {
  const { rig, layerId, layer, driver, actionId } = expressionFixture();
  const base = { visible: layer.visible, zIndex: layer.zIndex };
  assert.ok(rig.beginSmartEdit(actionId, Math.PI / 2));
  layer.visible = false; layer.zIndex = 900;
  assert.ok(rig.captureSmartKey(actionId, Math.PI / 2, [layerId]));
  rig.endSmartEdit();
  assert.deepEqual({ visible: layer.visible, zIndex: layer.zIndex }, base);
  rig.bones.get(driver).local.rotation = Math.PI / 4 - .001; rig.update();
  assert.equal(rig.getRenderLayer(layerId).visible, true);
  assert.equal(rig.getRenderLayer(layerId).zIndex, base.zIndex);
  rig.bones.get(driver).local.rotation = Math.PI / 2; rig.update();
  assert.equal(rig.getRenderLayer(layerId).visible, false);
  assert.equal(rig.getRenderLayer(layerId).zIndex, 900);
  assert.deepEqual({ visible: layer.visible, zIndex: layer.zIndex }, base);
  const restored = Rig.fromJSON(rig.toJSON()); restored.bones.get(driver).local.rotation = Math.PI / 2; restored.update();
  assert.equal(restored.getRenderLayer(layerId).visible, false);
  assert.equal(restored.getRenderLayer(layerId).zIndex, 900);
});

test('multiple actions add independently and never evaluate driver feedback', () => {
  const { rig, layerId, layer, driver, actionId } = expressionFixture();
  const driver2 = rig.addBone(null, 'Other control'); rig.bones.get(driver2).local.rotation = 0;
  const second = rig.createSmartAction('Second', driver2, 0, 1);
  rig.beginSmartEdit(actionId, Math.PI / 2); layer.local.x += 20;
  rig.captureSmartKey(actionId, Math.PI / 2, [layerId]); rig.endSmartEdit();
  rig.beginSmartEdit(second, 1); layer.local.x += 30; rig.bones.get(driver).local.rotation += Math.PI;
  rig.captureSmartKey(second, 1, [layerId, driver]); rig.endSmartEdit();
  rig.bones.get(driver).local.rotation = Math.PI / 2; rig.bones.get(driver2).local.rotation = 1; rig.update();
  close(layer.world.x, layer.local.x + 50);
  const world = { ...layer.world }; rig.smartActions.reverse(); rig.update(); point(layer.world, world);
  assert.equal(rig.captureSmartKey(actionId, .5, [driver]), false);
});

test('Smart edit Capture is atomic; Cancel restores pose, keys and undo history', () => {
  const { rig, actionId, layerId, driver } = expressionFixture();
  useProject.getState().replaceProject(rig.toProject(), false);
  const store = useProject.getState(); const before = store.serialize();
  assert.ok(store.beginSmartEdit(actionId, Math.PI / 2));
  store.updateProject(r => { r.layers.get(layerId).local.y += 35; });
  store.setFrame(48); store.play();
  assert.equal(store.rig.timeline.currentFrame, 0); assert.equal(store.rig.timeline.isPlaying, false);
  assert.equal(useProject.getState().past.length, 0);
  store.cancelSmartEdit(); assert.equal(useProject.getState().serialize(), before);
  assert.ok(useProject.getState().beginSmartEdit(actionId, Math.PI / 2));
  useProject.getState().updateProject(r => { r.layers.get(layerId).local.y += 35; });
  assert.ok(useProject.getState().captureSmartEdit([layerId]));
  assert.equal(useProject.getState().past.length, 1);
  close(useProject.getState().rig.layers.get(layerId).local.y, 0);
  useProject.getState().undo(); assert.equal(useProject.getState().rig.smartActions[0].keys.length, 1);
  useProject.getState().redo(); assert.equal(useProject.getState().rig.smartActions[0].keys.length, 2);
  const loaded = useProject.getState().rig; loaded.bones.get(driver).local.rotation = Math.PI / 2; loaded.update();
  close(loaded.layers.get(layerId).world.y, 35);
});

test('deformation example round-trips exact mesh and expression evaluation', () => {
  const rig = createDeformationDemo(); const restored = Rig.fromJSON(rig.toJSON());
  assert.ok(rig.smartActions.length > 0);
  assert.ok([...rig.images.values()].some(l => l.mesh));
  for (const layer of rig.layers.values()) {
    if (layer.mesh) points(restored.getMeshVertices(layer.id), rig.getMeshVertices(layer.id));
    point(restored.layers.get(layer.id).world, layer.world);
    close(restored.getLayerOpacity(layer.id), rig.getLayerOpacity(layer.id));
  }
  const action = restored.smartActions[0]; restored.bones.get(action.driverBoneId).local.rotation = action.endAngle; restored.update();
  const mouth = [...restored.layers.values()].find(l => l.name.includes('Mouth'));
  assert.notDeepEqual(restored.getMeshVertices(mouth.id), rig.getMeshVertices(mouth.id));
});

test('timeline mesh and control-bone keys interpolate and survive saving', () => {
  const { rig, layerId, driver, actionId } = expressionFixture();
  rig.beginSmartEdit(actionId, Math.PI / 2); rig.layers.get(layerId).opacity = .5;
  rig.captureSmartKey(actionId, Math.PI / 2, [layerId]); rig.endSmartEdit();
  useProject.getState().replaceProject(rig.toProject(), false);
  useProject.getState().keyPose([layerId, driver]);
  useProject.getState().setFrame(24);
  const current = useProject.getState().rig;
  const initialY = current.layers.get(layerId).mesh.vertices[0].y;
  current.layers.get(layerId).mesh.vertices[0].y += 40; current.bones.get(driver).local.rotation = Math.PI / 2;
  useProject.getState().keyPose([layerId, driver]);
  const loaded = Rig.fromJSON(useProject.getState().serialize());
  loaded.applyAnimation(loaded.timeline.activeAnimationId, 12);
  close(loaded.layers.get(layerId).mesh.vertices[0].y, initialY + 20);
  close(loaded.getLayerOpacity(layerId), .75);
});

test('triangle affine maps all three texture points exactly and rejects degeneracy', () => {
  const source = [{ x: 10, y: 20 }, { x: 210, y: 20 }, { x: 10, y: 120 }];
  const target = [{ x: 80, y: 70 }, { x: 270, y: 130 }, { x: 50, y: 160 }];
  const matrix = triangleAffine(source, target); assert.ok(matrix);
  source.forEach((p, i) => point(applyMatrix(matrix, p), target[i]));
  assert.equal(triangleAffine([source[0], source[0], source[0]], target), null);
});

test('canvas draws skinned texture triangles rather than an undeformed image', () => {
  const { rig, layerId, layer, b1, b2 } = fixture(); rig.bindMesh(layerId, [b1, b2]);
  rig.bones.get(b2).local.rotation = .4; rig.update();
  const calls = [], stack = [];
  const ctx = new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key === 'save') return () => stack.push(target.globalAlpha);
      if (key === 'restore') return () => { target.globalAlpha = stack.pop(); };
      return key in target ? target[key] : (...args) => calls.push([key, ...args]);
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  assert.ok(drawMeshLayer(ctx, rig, layer, { complete: true, naturalWidth: 200 }));
  assert.equal(calls.filter(([name]) => name === 'drawImage').length, layer.mesh.triangles.length / 3);
  assert.equal(calls.filter(([name]) => name === 'clip').length, layer.mesh.triangles.length / 3);
  assert.ok(calls.filter(([name]) => name === 'transform').every(call => call.slice(1).every(Number.isFinite)));
  assert.equal(stack.length, 0); close(ctx.globalAlpha, 1);
});

test('SVG export uses evaluated mesh vertices, texture transforms and Smart opacity', () => {
  const { rig, layerId, layer, driver, actionId, b1, b2 } = expressionFixture();
  rig.bindMesh(layerId, [b1, b2]);
  rig.beginSmartEdit(actionId, Math.PI / 2); layer.opacity = .25;
  rig.captureSmartKey(actionId, Math.PI / 2, [layerId]); rig.endSmartEdit();
  rig.bones.get(driver).local.rotation = Math.PI / 2;
  rig.bones.get(b2).local.rotation = .4; rig.update();
  const exported = projectToSVG(rig, false);
  assert.match(exported, /opacity="0.25"/); assert.match(exported, /clipPathUnits="userSpaceOnUse"/);
  assert.match(exported, /transform="matrix\(/);
  const vertices = rig.getMeshVertices(layerId);
  const triangle = layer.mesh.triangles.slice(0, 3).map(index => `${vertices[index].x},${vertices[index].y}`).join(' ');
  assert.ok(exported.includes(`points="${triangle}"`));
  const before = rig.toJSON(); projectToSVG(rig); assert.equal(rig.toJSON(), before);
});

test('legacy projects stay compatible and malformed mesh/action payloads fail safely', () => {
  const { rig, layerId } = fixture(); const data = rig.toProject();
  delete data.smartActions; data.layers[0].mesh.vertices[0].u = 42;
  data.smartActions = [{ id: 'invalid', driverBoneId: 'missing', startAngle: 'oops', endAngle: 2, keys: [] }];
  const loaded = new Rig(data);
  assert.equal(loaded.smartActions.length, 0);
  assert.deepEqual(loaded.getMeshVertices(layerId), []);
  assert.doesNotThrow(() => projectToSVG(loaded));
  delete data.layers[0].mesh; delete data.smartActions;
  const legacy = new Rig(data); assert.equal(legacy.smartActions.length, 0);
  assert.equal(legacy.layers.size, 1);
});

test('moving and rigid rebinding evaluated artwork do not double Smart deltas', () => {
  const { rig, layerId, layer, driver, actionId, b1 } = expressionFixture();
  rig.removeMesh(layerId);
  rig.beginSmartEdit(actionId, Math.PI / 2);
  layer.local.x += 25; layer.local.rotation += .3;
  rig.captureSmartKey(actionId, Math.PI / 2, [layerId]); rig.endSmartEdit();
  rig.bones.get(driver).local.rotation = Math.PI / 2; rig.update();
  const before = { ...layer.world };
  assert.ok(rig.bind(layerId, b1)); point(layer.world, before); close(layer.world.rotation, before.rotation);
  assert.ok(rig.moveWorld(layerId, { x: 210, y: 45 })); point(layer.world, { x: 210, y: 45 });
  const bound = { ...layer.world }; rig.unbind(layerId); point(layer.world, bound); close(layer.world.rotation, bound.rotation);
});

test('timeline Smart dials interpolate their angle range without shortest-path wrapping', () => {
  const { rig, driver, actionId } = expressionFixture();
  rig.smartActions.find(action => action.id === actionId).endAngle = Math.PI * 1.5;
  const clip = { id: 'dial-clip', name: 'Full dial', startFrame: 0, endFrame: 24, fps: 24,
    tracks: [{ id: 'dial-track', targetId: driver, property: 'transform', keyframes: [
      { id: 'k0', frame: 0, value: identity() },
      { id: 'k24', frame: 24, value: { ...identity(), rotation: Math.PI * 1.5 } },
    ] }] };
  rig.applyAnimation(clip, 12);
  close(rig.bones.get(driver).local.rotation, Math.PI * .75);
});
