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
const { Rig, useProject, addCamera, removeCamera, setCameraCut, setCameraFollow, updateCameraControls,
  activeCameraId, sampledCamera, focusCamera, normalizeCameras, stageLayerTransform, stageLayerScale, stageLayerOffset, createCameraDemo, copyKeyframes, CAMERA_SWITCH_TARGET, projectToSVG } = compiled.exports;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const active = rig => rig.animations.find(clip => clip.id === rig.timeline.activeAnimationId);
function fixture() {
  const rig = new Rig();
  const layer = rig.addImage('Subject', { width: 100, height: 100 });
  rig.layers.get(layer).local.x = 500; rig.layers.get(layer).local.y = 200; rig.update();
  return { rig, layer };
}

test('legacy projects load Preview; cameras normalize and keep unique hotkeys', () => {
  const rig = new Rig();
  assert.equal(rig.cameraView, 'preview'); assert.deepEqual(rig.cameras, []);
  assert.deepEqual(normalizeCameras(null), []);
  const cameras = normalizeCameras([{ id: 'a', name: 'Wide', hotkey: 1, settings: { zoom: 50 } }, { id: 'b', name: 'Close', hotkey: 1 }, { id: 'a' }, { id: 'preview' }]);
  assert.equal(cameras.length, 2); assert.equal(cameras[0].hotkey, 1); assert.equal(cameras[1].hotkey, undefined);
  assert.equal(cameras[0].settings.zoom, 4); assert.equal(cameras[0].settings.enabled, true);
});

test('Preview changes never create timeline keys and Capture camera preserves the view', () => {
  const { rig } = fixture();
  rig.setTimeline({ currentFrame: 24 });
  updateCameraControls(rig, { cameraX: 80, zoom: 2, roll: 12 }, true);
  assert.equal(rig.animations.length, 0);
  const preview = rig.getStageView(), id = addCamera(rig, 'Captured');
  assert.deepEqual(rig.getStageView(), preview);
  assert.equal(rig.cameraView, id); assert.equal(rig.cameras[0].hotkey, 1);
});

test('camera track/zoom/roll interpolate on seek and leave base camera and artwork unchanged', () => {
  const { rig } = fixture(), id = addCamera(rig);
  const base = JSON.stringify(rig.cameras[0].settings), authored = JSON.stringify(rig.toProject().layers);
  rig.setTimeline({ currentFrame: 24 });
  updateCameraControls(rig, { cameraX: 100, zoom: 2, roll: 30 }, true);
  const clip = active(rig);
  assert.deepEqual(clip.tracks.map(track => track.property), ['cameraX', 'zoom', 'roll']);
  for (const track of clip.tracks) assert.deepEqual(track.keyframes.map(key => key.frame), [0, 24]);
  rig.applyAnimation(clip, 12);
  close(rig.getStageView().cameraX, 50); close(rig.getStageView().zoom, 1.5); close(rig.getStageView().roll, 15);
  rig.applyAnimation(clip, 0); close(rig.getStageView().zoom, 1);
  assert.equal(JSON.stringify(rig.cameras.find(camera => camera.id === id).settings), base);
  assert.equal(JSON.stringify(rig.toProject().layers), authored);
});

test('cuts use held camera IDs and camera deletion removes keys and restores a usable view', () => {
  const { rig } = fixture();
  const wide = addCamera(rig, 'Wide');
  updateCameraControls(rig, { zoom: 2 }, false);
  const closeId = addCamera(rig, 'Close');
  rig.setTimeline({ currentFrame: 24 }); setCameraCut(rig, closeId);
  assert.equal(rig.cameraView, 'switch');
  rig.applyAnimation(active(rig), 23); assert.equal(activeCameraId(rig), wide);
  rig.applyAnimation(active(rig), 24); assert.equal(activeCameraId(rig), closeId);
  const cuts = active(rig).tracks.find(track => track.targetId === CAMERA_SWITCH_TARGET);
  assert.deepEqual(cuts.keyframes.map(key => [key.frame, key.value]), [[0, wide], [24, closeId]]);
  removeCamera(rig, closeId);
  assert.equal(activeCameraId(rig), wide);
  assert.ok(active(rig).tracks.every(track => track.keyframes.every(key => key.value !== closeId)));
  removeCamera(rig, wide); assert.equal(rig.cameraView, 'preview');
});

test('follow camera compensates subject travel and unlink retains framing without jumping', () => {
  const { rig, layer } = fixture();
  const id = addCamera(rig, 'Follow');
  setCameraFollow(rig, layer);
  rig.layers.get(layer).local.x += 100; rig.layers.get(layer).local.y += 30; rig.update();
  rig.setTimeline({ currentFrame: 12 });
  close(rig.getStageView().cameraX, -100); close(rig.getStageView().cameraY, -30);
  setCameraFollow(rig, null);
  rig.applyAnimation(active(rig), 12);
  close(rig.getStageView().cameraX, -100); close(rig.getStageView().cameraY, -30);
  rig.layers.get(layer).local.x += 100; rig.update();
  close(rig.getStageView().cameraX, -100);
  assert.ok(active(rig).tracks.some(track => track.targetId === id && track.property === 'follow'));
});

test('perspective and orthographic cameras differ in depth scale and pan', () => {
  const { rig } = fixture();
  const id = addCamera(rig);
  updateCameraControls(rig, { perspective: .4, cameraX: 100, projection: 'perspective' }, false);
  const layer = { depth: 500, parallax: .5 };
  close(stageLayerScale(layer, rig.getStageView()), 1.2);
  close(stageLayerOffset(layer, rig.getStageView()).x, 50);
  updateCameraControls(rig, { projection: 'orthographic' }, false);
  close(stageLayerScale(layer, rig.getStageView()), 1);
  close(stageLayerOffset(layer, rig.getStageView()).x, 100);
  assert.equal(rig.cameras.find(camera => camera.id === id).settings.projection, 'orthographic');
});

test('unlink preserves earlier tracking frames and existing animated pan curves', () => {
  const { rig, layer } = fixture(); const id = addCamera(rig); setCameraFollow(rig, layer);
  rig.setTimeline({ currentFrame: 24 }); updateCameraControls(rig, { cameraX: 40 }, true);
  const clip = active(rig), pan = JSON.stringify(clip.tracks.find(track => track.property === 'cameraX'));
  rig.layers.get(layer).local.x += 100; rig.update();
  rig.applyAnimation(clip, 11); const earlier = rig.getStageView().cameraX;
  rig.applyAnimation(clip, 12); const linked = rig.getStageView().cameraX;
  setCameraFollow(rig, null); close(rig.getStageView().cameraX, linked);
  assert.equal(JSON.stringify(clip.tracks.find(track => track.property === 'cameraX')), pan);
  rig.applyAnimation(clip, 11); close(rig.getStageView().cameraX, earlier);
  rig.applyAnimation(clip, 12); close(rig.getStageView().cameraX, linked);
  assert.ok(clip.tracks.some(track => track.targetId === id && track.property === 'followOffset'));
});

test('editing frame-zero follow after later link keys updates the actual baseline', () => {
  const { rig, layer } = fixture(); const id = addCamera(rig);
  rig.setTimeline({ currentFrame: 24 }); setCameraFollow(rig, layer);
  rig.applyAnimation(active(rig), 0); assert.equal(sampledCamera(rig, id).follow, null);
  setCameraFollow(rig, layer); assert.equal(sampledCamera(rig, id).follow.targetId, layer);
  setCameraFollow(rig, null); assert.equal(sampledCamera(rig, id).follow, null);
  rig.applyAnimation(active(rig), 24); assert.equal(sampledCamera(rig, id).follow.targetId, layer);
});

test('changing frames directly cannot reuse a stale camera edit override', () => {
  const { rig } = fixture(); addCamera(rig);
  rig.setTimeline({ currentFrame: 24 }); updateCameraControls(rig, { zoom: 2 }, true);
  rig.setTimeline({ currentFrame: 12 }); updateCameraControls(rig, { cameraY: 20 }, true);
  close(rig.getStageView().zoom, 1.5);
});

test('custom camera keeps artwork key editing read-only even if Preview stage is disabled', () => {
  const { rig, layer } = fixture(); assert.equal(rig.stage2d.enabled, false); addCamera(rig);
  useProject.getState().replaceProject(rig.toProject(), false);
  const state = useProject.getState(); state.setFrame(24); state.keyPose([layer]);
  assert.equal(state.rig.animations.length, 0);
  state.updateCamera({ zoom: 2 }); assert.equal(active(state.rig).tracks.length, 1);
  assert.equal(active(state.rig).tracks[0].property, 'zoom');
});

test('focus object centers the subject and fits it inside the output frame', () => {
  const { rig, layer } = fixture();
  addCamera(rig);
  const patch = focusCamera(rig, layer); assert.ok(patch);
  updateCameraControls(rig, patch, false);
  const m = stageLayerTransform(rig.layers.get(layer), rig.getStageView(), { x: 400, y: 260 });
  close(m.a * 500 + m.c * 200 + m.e, 400);
  close(m.b * 500 + m.d * 200 + m.f, 260);
  assert.ok(100 * Math.abs(m.a) <= 800 * .82 + 1e-6);
  assert.ok(100 * Math.abs(m.d) <= 520 * .82 + 1e-6);
});

test('camera keys can move, paste, delete, and undo while 2.5D preview is active', () => {
  const { rig } = fixture(); rig.setStage2D({ enabled: true }); addCamera(rig);
  useProject.getState().replaceProject(rig.toProject(), false);
  const state = useProject.getState(); state.setAutoKey(true); state.setFrame(24);
  state.updateCamera({ zoom: 2 });
  let clip = active(state.rig), track = clip.tracks.find(item => item.property === 'zoom');
  const ref = { trackId: track.id, keyframeId: track.keyframes.find(key => key.frame === 24).id };
  const history = useProject.getState().past.length;
  state.moveSelectedKeys([ref], 12);
  assert.equal(useProject.getState().past.length, history + 1);
  close(state.rig.getStageView().zoom, 1 + (2 / 3) ** 2 * (3 - 2 * (2 / 3)));
  const copied = copyKeyframes(active(state.rig), [ref]);
  const pasted = state.pasteKeys(copied, 48); assert.equal(pasted.length, 1);
  state.deleteSelectedKeys(pasted);
  state.undo(); clip = active(useProject.getState().rig);
  assert.ok(clip.tracks.some(item => item.keyframes.some(key => key.frame === 48)));
});

test('camera gesture changes create one history entry; cancellation restores pose and keys', () => {
  const { rig } = fixture(); addCamera(rig);
  useProject.getState().replaceProject(rig.toProject(), false);
  const state = useProject.getState(); state.setFrame(24);
  const before = state.getProject();
  state.updateCamera({ cameraX: 25 }, true); state.updateCamera({ cameraX: 60 }, true);
  assert.equal(useProject.getState().past.length, 0);
  state.cancelGesture(before); assert.equal(state.rig.animations.length, 0); close(state.rig.getStageView().cameraX, 0);
  state.updateCamera({ cameraX: 60 }, true); state.finishGesture(before);
  assert.equal(useProject.getState().past.length, 1);
  state.undo(); assert.equal(useProject.getState().rig.animations.length, 0);
});

test('named cameras, follow links, cuts, and evaluated export survive JSON round-trip', () => {
  const rig = createCameraDemo();
  rig.applyAnimation(active(rig), 80);
  const svg = projectToSVG(rig), restored = Rig.fromJSON(rig.toJSON());
  assert.deepEqual(restored.cameras, rig.cameras); assert.equal(restored.cameraView, 'switch');
  assert.equal(activeCameraId(restored), activeCameraId(rig));
  assert.equal(projectToSVG(restored), svg);
  assert.match(svg, /data-stage-layer=/);
  rig.applyAnimation(active(rig), 24); assert.notEqual(projectToSVG(rig), svg);
});
