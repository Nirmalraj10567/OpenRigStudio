import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({ stdin: { contents: "export * from './src/engine/index'; export {useProject} from './src/state/projectStore';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, useProject, addCharacterViewSet, addCharacterView, setCharacterViewAngle, characterViewAngle, sampleCharacterView, updateCharacterViewTarget,
  normalizeCharacterViews, addCharacterViewParts, removeCharacterViewPart, removeCharacterViewSet, createHumanViewDemo, createFrogViewDemo, createFrogSmartTurnDemo, projectToSVG, addCamera, setCameraCut, makeMesh } = compiled.exports;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const active = rig => rig.animations.find(clip => clip.id === rig.timeline.activeAnimationId);
function fixture() {
  const rig = new Rig();
  const id = rig.addVectorLayer('Custom creature', [{ id: 'front', kind: 'ellipse', x: 0, y: 0, radiusX: 40, radiusY: 30, fill: '#77c983' }]);
  rig.layers.get(id).local.x = 300; rig.layers.get(id).local.y = 250; rig.update();
  const setId = addCharacterViewSet(rig, 'Any creature', [id]);
  const side = addCharacterView(rig, setId, -90, 'Side');
  return { rig, id, setId, side, set: rig.characterViews[0] };
}

test('multi-view legacy defaults and malformed definitions normalize without overlapping ownership', () => {
  assert.deepEqual(new Rig({}).characterViews, []);
  const { set, id } = fixture();
  assert.deepEqual(normalizeCharacterViews(null, new Set()), []);
  const malformed = { ...set, id: 'second', targetIds: [id, 'missing'], views: [...set.views, { ...set.views[0], id: 'duplicate', angle: 360 }] };
  const normalized = normalizeCharacterViews([set, malformed], new Set([id]));
  assert.equal(normalized.length, 1); assert.equal(normalized[0].views.length, 2);
  assert.deepEqual(normalized[0].targetIds, [id]);
});

test('arbitrary artwork without human bones interpolates alignment and switches prepared art non-destructively', () => {
  const { rig, id, setId, side, set } = fixture();
  const authored = JSON.stringify(rig.toProject().layers);
  const old = set.views.find(view => view.id === side).targets[id];
  updateCharacterViewTarget(rig, setId, side, id, { local: { ...old.local, x: 340, scaleX: .5 }, artwork: { type: 'vector', shapes: [{ id: 'profile', kind: 'ellipse', radiusX: 20, radiusY: 30, fill: '#3c9068' }] } });
  setCharacterViewAngle(rig, setId, -30, false);
  close(rig.layers.get(id).world.x, 300 + 40 / 3); close(rig.layers.get(id).world.scaleX, 1 - .5 / 3);
  assert.equal(rig.getRenderLayer(id).shapes[0].id, 'front');
  setCharacterViewAngle(rig, setId, -90, false); assert.equal(rig.getRenderLayer(id).shapes[0].id, 'profile');
  for (let i = 0; i < 30; i++) rig.update();
  assert.equal(JSON.stringify(rig.toProject().layers), authored); close(rig.layers.get(id).world.x, 340);
});

test('cyclic angle sampling is continuous across back view and limited view sets clamp', () => {
  const { set } = fixture();
  set.views.push({ ...structuredClone(set.views[1]), id: 'back', angle: -180, name: 'Back' }, { ...structuredClone(set.views[0]), id: 'right', angle: 135, name: 'Right' });
  const left = sampleCharacterView(set, 179), right = sampleCharacterView(set, -179);
  assert.equal(left.nearest.id, 'back'); assert.equal(right.nearest.id, 'back');
  assert.equal(sampleCharacterView(set, 180).nearest.id, 'back'); assert.equal(sampleCharacterView(set, 540).nearest.id, 'back');
  set.wrap = false; assert.equal(sampleCharacterView(set, 300).angle, 135);
});

test('nearest-view mode holds transforms and view-specific visibility/order do not mutate base layers', () => {
  const { rig, id, set, setId, side } = fixture(); set.interpolate = false;
  const layer = rig.layers.get(id), pose = set.views.find(view => view.id === side).targets[id];
  updateCharacterViewTarget(rig, setId, side, id, { local: { ...pose.local, x: 450 }, visible: false, zIndex: 100 });
  setCharacterViewAngle(rig, setId, -10, false); close(layer.world.x, 300);
  setCharacterViewAngle(rig, setId, -80, false); close(layer.world.x, 450);
  assert.equal(rig.getRenderLayer(id).visible, false); assert.equal(rig.getRenderLayer(id).zIndex, 100);
  assert.equal(layer.visible, true); assert.equal(layer.zIndex, 0);
});

test('prepared view order is used by the actual render list above authored root ordering', () => {
  const { rig, id, setId, side } = fixture();
  const torso = rig.addVectorLayer('Torso', [{ id: 'torso', kind: 'rect', width: 20, height: 20, fill: '#fff' }]);
  rig.layers.get(torso).zIndex = 50;
  updateCharacterViewTarget(rig, setId, side, id, { zIndex: 100 });
  setCharacterViewAngle(rig, setId, -90, false);
  assert.deepEqual(rig.layersInOrder.map(layer => layer.id), [torso, id]);
  setCharacterViewAngle(rig, setId, 0, false);
  assert.deepEqual(rig.layersInOrder.map(layer => layer.id), [id, torso]);
  assert.equal(rig.layers.get(id).zIndex, 0);
});

test('independent characters and head/body subsets use independent timeline channels', () => {
  const { rig, setId, id } = fixture();
  const other = rig.addImage('Independent frog head'), head = addCharacterViewSet(rig, 'Head', [other]);
  addCharacterView(rig, head, -90, 'Head side');
  assert.equal(addCharacterViewSet(rig, 'Duplicate', [id]), null);
  rig.setTimeline({ currentFrame: 24 }); setCharacterViewAngle(rig, setId, -90, true); setCharacterViewAngle(rig, head, 45, true);
  rig.applyAnimation(active(rig), 12); close(characterViewAngle(rig, setId), -45); close(characterViewAngle(rig, head), 22.5);
  assert.deepEqual(active(rig).tracks.map(track => track.targetId), [setId, head]);
});

test('view scale composes with authored animation and bones remain poseable in turned views', () => {
  const { rig, id, setId, side, set } = fixture();
  const state = set.views.find(view => view.id === side).targets[id];
  updateCharacterViewTarget(rig, setId, side, id, { local: { ...state.local, scaleX: .5 } });
  rig.layers.get(id).local.scaleX = 2; setCharacterViewAngle(rig, setId, -90, false); close(rig.layers.get(id).world.scaleX, 1);
  assert.ok(rig.moveWorld(id, { x: 380, y: 220 })); close(rig.layers.get(id).world.x, 380); close(rig.layers.get(id).world.y, 220);
  const frog = createFrogViewDemo(), frogSet = frog.characterViews[0];
  setCharacterViewAngle(frog, frogSet.id, -90, false);
  const joint = [...frog.bones.values()].find(bone => bone.name === 'Left front palm'), origin = { ...joint.world };
  assert.ok(frog.rotateBoneTo(joint.id, { x: joint.world.x + 50, y: joint.world.y + 10 })); close(joint.world.x, origin.x); close(joint.world.y, origin.y);
});

test('new parts can join all existing angles or move to an independent view set without losing artwork', () => {
  const { rig, setId, set, id } = fixture();
  const tail = rig.addImage('Custom tail');
  assert.equal(addCharacterViewParts(rig, setId, [tail, tail, 'missing']), 1);
  assert.ok(set.views.every(view => view.targets[tail]?.artwork.type === 'image'));
  set.views[0].targets[tail].local.x += 20;
  assert.notEqual(set.views[0].targets[tail].local.x, set.views[1].targets[tail].local.x);
  assert.ok(removeCharacterViewPart(rig, setId, tail));
  assert.ok(rig.layers.has(tail)); assert.ok(set.views.every(view => !view.targets[tail]));
  const independent = addCharacterViewSet(rig, 'Tail turn', [tail]); assert.ok(independent);
  assert.equal(addCharacterViewParts(rig, setId, [tail]), 0); assert.equal(removeCharacterViewPart(rig, setId, id), false);
});

test('view mesh corrections preserve UVs and compose without drift; vertex editing inverse-maps them', () => {
  const { rig, id, setId, set, side } = fixture();
  const layer = rig.layers.get(id); layer.mesh = makeMesh(layer, 1, 1);
  const mesh = layer.mesh.vertices.map(vertex => ({ x: vertex.x, y: vertex.y }));
  set.baseline[id].mesh = structuredClone(mesh); set.views[0].targets[id].mesh = structuredClone(mesh);
  const corrected = mesh.map(point => ({ x: point.x + 10, y: point.y })); set.views.find(view => view.id === side).targets[id].mesh = corrected;
  const uvs = JSON.stringify(layer.mesh.vertices.map(vertex => [vertex.u, vertex.v]));
  setCharacterViewAngle(rig, setId, -90, false); const world = rig.getMeshVertices(id)[0]; close(world.x, layer.world.x + mesh[0].x + 10);
  assert.ok(rig.setMeshVertex(id, 0, { x: world.x + 5, y: world.y })); close(rig.getMeshVertices(id)[0].x, world.x + 5);
  assert.equal(JSON.stringify(layer.mesh.vertices.map(vertex => [vertex.u, vertex.v])), uvs);
});

test('angle auto-key, explicit keys, deletion, and undo restore the setup instead of baking a view', () => {
  const { rig, setId } = fixture(); useProject.getState().replaceProject(rig.toProject(), false);
  let state = useProject.getState(); state.setAutoKey(true); state.setFrame(24); state.setCharacterAngle(setId, -90);
  const track = active(state.rig).tracks[0]; assert.deepEqual(track.keyframes.map(key => [key.frame, key.value]), [[0, 0], [24, -90]]);
  state.setFrame(12); close(characterViewAngle(state.rig, setId), -45);
  state.keyCharacterAngle(setId); assert.ok(active(state.rig).tracks[0].keyframes.some(key => key.frame === 12));
  const refs = active(state.rig).tracks[0].keyframes.map(key => ({ trackId: track.id, keyframeId: key.id }));
  state.deleteSelectedKeys(refs); close(characterViewAngle(state.rig, setId), 0);
  state.undo(); state = useProject.getState(); close(characterViewAngle(state.rig, setId), -45);
});

test('rigid-to-skin conversion, rebind, and unbind preserve a turned and morphed mesh', () => {
  const { rig, id, setId, set, side } = fixture(); const joint = rig.addBone(null, 'Creature joint');
  assert.ok(rig.bind(id, joint));
  const layer = rig.layers.get(id); layer.mesh = makeMesh(layer, 1, 1);
  const neutral = layer.mesh.vertices.map(vertex => ({ x: vertex.x, y: vertex.y }));
  set.baseline[id].mesh = structuredClone(neutral); set.views[0].targets[id].mesh = structuredClone(neutral);
  const target = set.views.find(view => view.id === side).targets[id];
  target.mesh = neutral.map(point => ({ x: point.x + 10, y: point.y - 4 })); target.local.scaleX = .5;
  setCharacterViewAngle(rig, setId, -90, false); const expected = rig.getMeshVertices(id);
  const equalPoints = points => points.forEach((point, index) => { close(point.x, expected[index].x); close(point.y, expected[index].y); });
  assert.ok(rig.bindMesh(id, [joint])); equalPoints(rig.getMeshVertices(id));
  assert.ok(rig.unbind(id)); equalPoints(rig.getMeshVertices(id));
  assert.ok(rig.bindMesh(id, [joint])); equalPoints(rig.getMeshVertices(id));
});

test('removing a character or part cleans view ownership without deleting camera tracks', () => {
  const { rig, id, setId } = fixture(); rig.setTimeline({ currentFrame: 24 }); setCharacterViewAngle(rig, setId, -90, true);
  const camera = addCamera(rig); setCameraCut(rig, camera);
  rig.remove(id); assert.equal(rig.characterViews.length, 0);
  assert.ok(active(rig).tracks.some(track => track.targetId === '$camera-switch'));
  assert.ok(active(rig).tracks.every(track => track.targetId !== setId));
  const other = fixture(); removeCharacterViewSet(other.rig, other.setId); assert.equal(other.rig.characterViews.length, 0); assert.equal(other.rig.layers.size, 1);
});

test('human and custom frog demos have eight actual artwork views, animate, and round-trip SVG', () => {
  for (const make of [createHumanViewDemo, createFrogViewDemo]) {
    const rig = make(), set = rig.characterViews[0]; assert.equal(set.views.length, 8);
    const original = JSON.stringify({ bones: rig.toProject().bones, layers: rig.toProject().layers, bindings: rig.toProject().bindings });
    const front = projectToSVG(rig);
    rig.applyAnimation(active(rig), 96); close(characterViewAngle(rig, set.id), -180);
    const back = projectToSVG(rig); assert.notEqual(back, front);
    assert.equal(JSON.stringify({ bones: rig.toProject().bones, layers: rig.toProject().layers, bindings: rig.toProject().bindings }), original);
    const restored = Rig.fromJSON(rig.toJSON()); assert.deepEqual(restored.characterViews, rig.characterViews); assert.equal(projectToSVG(restored), back);
    rig.applyAnimation(active(rig), 0); assert.equal(projectToSVG(rig), front);
  }
});

test('existing frog character can be driven through a full turn by one Smart Bone dial', () => {
  const frog = createFrogSmartTurnDemo(), set = frog.characterViews[0], action = frog.smartActions.find(item => item.viewSetIds?.includes(set.id));
  assert.ok(action); assert.equal(action.viewSetIds.length, 1); assert.equal(action.keys.length, 9);
  const driver = frog.bones.get(action.driverBoneId);
  frog.applyAnimation(frog.timeline.activeAnimationId, 0); assert.equal(characterViewAngle(frog, set.id), 0);
  frog.applyAnimation(frog.timeline.activeAnimationId, 60); close(characterViewAngle(frog, set.id), -180); assert.ok(driver.local.rotation > Math.PI * .9);
  frog.applyAnimation(frog.timeline.activeAnimationId, 120); close(characterViewAngle(frog, set.id), -360); assert.ok(Math.abs(driver.local.rotation - Math.PI * 2) < 1e-6);
  const restored = Rig.fromJSON(frog.toJSON()); restored.applyAnimation(restored.timeline.activeAnimationId, 60);
  close(characterViewAngle(restored, restored.characterViews[0].id), -180); assert.ok(restored.smartActions[0].viewSetIds?.length);
});
