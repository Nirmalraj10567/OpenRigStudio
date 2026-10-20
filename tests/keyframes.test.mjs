import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({
  stdin: { contents: "export * from './src/engine/index'; export * from './src/engine/controllerPose'; export {useProject} from './src/state/projectStore';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, useProject, moveKeyframes, copyKeyframes, pasteKeyframes, sampleTrack, sampleControllerPose } = compiled.exports;

function setup() {
  const rig = new Rig();
  const bone = rig.addBone(null, 'Hips');
  rig.bones.get(bone).local.x = 100;
  rig.update();
  useProject.getState().replaceProject(rig.toProject(), false);
  useProject.getState().setAutoKey(true);
  return { bone, state: useProject.getState() };
}
const active = () => useProject.getState().rig.animations.find(clip => clip.id === useProject.getState().rig.timeline.activeAnimationId);

test('group retiming preserves spacing, clamps at zero, and replaces destination collisions atomically', () => {
  const clip = { id: 'c', name: 'Test', fps: 24, startFrame: 0, endFrame: 20, tracks: [
    { id: 'a', targetId: 'bone', property: 'x', keyframes: [{ id: 'one', frame: 4, value: 10 }, { id: 'two', frame: 8, value: 20 }, { id: 'collision', frame: 12, value: 99 }] },
    { id: 'b', targetId: 'bone', property: 'y', keyframes: [{ id: 'other', frame: 8, value: 30 }] },
  ] };
  const refs = [{ trackId: 'a', keyframeId: 'one' }, { trackId: 'a', keyframeId: 'two' }, { trackId: 'b', keyframeId: 'other' }];
  const moved = moveKeyframes(clip, refs, 4);
  assert.deepEqual(moved.clip.tracks[0].keyframes.map(key => [key.id, key.frame]), [['one', 8], ['two', 12]]);
  assert.equal(moved.clip.tracks[1].keyframes[0].frame, 12);
  const clamped = moveKeyframes(clip, refs, -100);
  assert.deepEqual(clamped.clip.tracks[0].keyframes.slice(0, 2).map(key => key.frame), [0, 4]);
  assert.equal(clamped.clip.tracks[1].keyframes[0].frame, 4);
  assert.equal(clip.tracks[0].keyframes[0].frame, 4);
});

test('multi-channel paste preserves timing and clones nested mesh values and unique IDs', () => {
  const clip = { id: 'c', name: 'Mesh', fps: 24, startFrame: 0, endFrame: 10, tracks: [
    { id: 'mesh', targetId: 'layer', property: 'mesh', keyframes: [{ id: 'm', frame: 2, value: [{ x: 3, y: 4 }], easing: 'step' }] },
    { id: 'x', targetId: 'bone', property: 'x', keyframes: [{ id: 'x1', frame: 6, value: 10 }] },
  ] };
  const copied = copyKeyframes(clip, [{ trackId: 'mesh', keyframeId: 'm' }, { trackId: 'x', keyframeId: 'x1' }]);
  const result = pasteKeyframes(clip, copied, 20);
  assert.equal(result.clip.endFrame, 24);
  assert.equal(result.clip.tracks[0].keyframes[1].frame, 20);
  assert.equal(result.clip.tracks[1].keyframes[1].frame, 24);
  assert.equal(result.clip.tracks[0].keyframes[1].easing, 'step');
  assert.notEqual(result.clip.tracks[0].keyframes[1].id, 'm');
  result.clip.tracks[0].keyframes[1].value[0].x = 99;
  assert.equal(copied[0].value[0].x, 3);
  assert.equal(clip.tracks[0].keyframes[0].value[0].x, 3);
});

test('interpolation controls affect the outgoing segment for numeric and mesh channels', () => {
  const track = { id: 't', targetId: 'b', property: 'x', keyframes: [{ id: 'a', frame: 0, value: 0 }, { id: 'b', frame: 4, value: 100 }] };
  const expectations = { linear: 25, smooth: 15.625, 'ease-in': 6.25, 'ease-out': 43.75, 'ease-in-out': 12.5, step: 0 };
  for (const [easing, expected] of Object.entries(expectations)) {
    track.keyframes[0].easing = easing;
    assert.equal(sampleTrack(track, 1), expected);
    assert.equal(sampleTrack(track, 4), 100);
  }
  const mesh = { ...track, property: 'mesh', keyframes: [{ id: 'a', frame: 0, value: [{ x: 0, y: 0 }], easing: 'smooth' }, { id: 'b', frame: 4, value: [{ x: 100, y: 20 }] }] };
  assert.deepEqual(sampleTrack(mesh, 1), [{ x: 15.625, y: 3.125 }]);
});

test('canvas auto-key commits once at gesture end; cancellation and frame zero create no animation', () => {
  const { bone, state } = setup();
  const beforeZero = state.getProject();
  state.rig.bones.get(bone).local.x = 110;
  state.finishGesture(beforeZero);
  assert.equal(active(), undefined);
  state.setFrame(12);
  const before = state.getProject();
  state.rig.bones.get(bone).local.x = 160;
  state.cancelGesture(before);
  assert.equal(state.rig.bones.get(bone).local.x, 110);
  assert.equal(active(), undefined);
  const history = useProject.getState().past.length;
  state.rig.bones.get(bone).local.x = 160;
  state.finishGesture(before);
  assert.equal(useProject.getState().past.length, history + 1);
  assert.deepEqual(active().tracks[0].keyframes.map(key => [key.frame, key.value.x]), [[0, 110], [12, 160]]);
  state.setFrame(0);
  assert.equal(state.rig.bones.get(bone).local.x, 110);
});

test('property touch auto-keys and deleting all keys restores the saved setup pose with undo/redo', () => {
  const { bone, state } = setup();
  state.setFrame(12);
  state.rig.bones.get(bone).local.x = 150;
  state.touch();
  const clip = active();
  const refs = clip.tracks.flatMap(track => track.keyframes.map(key => ({ trackId: track.id, keyframeId: key.id })));
  state.deleteSelectedKeys(refs);
  assert.equal(state.rig.bones.get(bone).local.x, 100);
  assert.ok(active().tracks.every(track => track.keyframes.length === 0));
  state.undo();
  assert.equal(useProject.getState().rig.bones.get(bone).local.x, 150);
  state.redo();
  assert.equal(useProject.getState().rig.bones.get(bone).local.x, 100);
  const saved = Rig.fromJSON(useProject.getState().serialize());
  saved.applyAnimation(saved.timeline.activeAnimationId, 12);
  assert.equal(saved.bones.get(bone).local.x, 100);
});

test('retiming updates the displayed pose without adding unwanted auto-keys and supports one-step undo', () => {
  const { bone, state } = setup();
  state.setFrame(12);
  state.updateProject(project => { project.bones.get(bone).local.x = 150; });
  const clip = active(), track = clip.tracks[0], key = track.keyframes.find(item => item.frame === 12);
  const history = useProject.getState().past.length;
  state.moveSelectedKeys([{ trackId: track.id, keyframeId: key.id }], 12);
  assert.equal(useProject.getState().past.length, history + 1);
  assert.deepEqual(active().tracks[0].keyframes.map(item => item.frame), [0, 24]);
  assert.equal(state.rig.bones.get(bone).local.x, 125);
  state.undo();
  assert.deepEqual(active().tracks[0].keyframes.map(item => item.frame), [0, 12]);
  assert.equal(useProject.getState().rig.bones.get(bone).local.x, 150);
});

test('auto-key can be disabled and Smart Edit/Stage blocks keyframe editing', () => {
  const { bone, state } = setup();
  state.setAutoKey(false);
  state.setFrame(10);
  state.updateProject(project => { project.bones.get(bone).local.x = 200; });
  assert.equal(active(), undefined);
  state.keyPose([bone]);
  const clip = active(), refs = clip.tracks[0].keyframes.map(key => ({ trackId: clip.tracks[0].id, keyframeId: key.id }));
  state.rig.setStage2D({ enabled: true });
  const original = JSON.stringify(clip);
  assert.deepEqual(state.moveSelectedKeys(refs, 5), []);
  state.deleteSelectedKeys(refs);
  assert.equal(JSON.stringify(active()), original);
  state.rig.setStage2D({ enabled: false });
  useProject.setState({ smartEdit: { actionId: 'test' } });
  state.deleteSelectedKeys(refs);
  assert.equal(JSON.stringify(active()), original);
  useProject.setState({ smartEdit: null });
});

test('auto-key and scalar imported channels agree regardless of track ordering', () => {
  const { bone, state } = setup();
  state.addAnimation({ tracks: [{ id: 'x', targetId: bone, property: 'x', keyframes: [{ id: 'x0', frame: 0, value: 100 }, { id: 'x24', frame: 24, value: 200 }] }] });
  state.setFrame(12);
  state.updateProject(project => { project.bones.get(bone).local.x = 175; });
  state.setFrame(24);
  assert.equal(state.rig.bones.get(bone).local.x, 200);
  const overlay = sampleControllerPose(state.rig, [{ controllerId: 'test', clipId: active().id, frame: 24, outputs: [] }]);
  assert.equal(overlay.get(bone).transform.x, 200);
  state.setFrame(12);
  assert.equal(state.rig.bones.get(bone).local.x, 175);
  state.setFrame(0);
  assert.equal(state.rig.bones.get(bone).local.x, 100);
});

test('removing only the setup key still recovers frame zero without removing the later motion', () => {
  const { bone, state } = setup();
  state.setFrame(12);
  state.updateProject(project => { project.bones.get(bone).local.x = 200; });
  const track = active().tracks[0];
  state.deleteSelectedKeys([{ trackId: track.id, keyframeId: track.keyframes.find(key => key.frame === 0).id }]);
  state.setFrame(0);
  assert.equal(state.rig.bones.get(bone).local.x, 100);
  state.setFrame(12);
  assert.equal(state.rig.bones.get(bone).local.x, 200);
});

test('legacy clips retain their frame-zero pose when all channel keys are deleted', () => {
  const { bone, state } = setup();
  state.addAnimation({ tracks: [{ id: 'x', targetId: bone, property: 'x', keyframes: [{ id: 'x0', frame: 0, value: 100 }, { id: 'x24', frame: 24, value: 300 }] }] });
  state.setFrame(24);
  state.deleteSelectedKeys([{ trackId: 'x', keyframeId: 'x0' }, { trackId: 'x', keyframeId: 'x24' }]);
  assert.equal(state.rig.bones.get(bone).local.x, 100);
  state.setFrame(0);
  assert.equal(state.rig.bones.get(bone).local.x, 100);
});
