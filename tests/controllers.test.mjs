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
const { Rig, identity, createCarControllerDefinition, createCharacterControllerDefinition, createCustomControllerDefinition, createCarDemo,
  createStyleDemo, applyControllerDeadzone, normalizeControllerInputValue, evaluateControllerMapping, listStylePresets,
  saveStylePreset, applyStylePreset, removeStylePreset, setShapeStyle, replaceImageArtwork,
  normalizeStage2DSettings, stageLayerScale, stageLayerOffset, parseBVH, parseMotionFile,
  createMotionImportDefaults, retarget3DMotionToClip, validateMotionFileName, appendAnimationClip, useProject } = compiled.exports;
const { copyKeyframes, moveKeyframes, pasteKeyframes, deleteKeyframes, setKeyframeInterpolation, sampleTrack } = compiled.exports;

function clip(id, name) { return { id, name, fps: 24, startFrame: 0, endFrame: 24, tracks: [] }; }

test('controller definitions normalize axes, joystick values and deadzones', () => {
  assert.ok(Math.abs(applyControllerDeadzone(.5, .1) - 4 / 9) < 1e-12);
  assert.ok(Math.abs(applyControllerDeadzone(.5, .1, true) + 4 / 9) < 1e-12);
  assert.deepEqual(normalizeControllerInputValue({ id: 'stick', name: 'Stick', type: 'joystick' }, { x: 2, y: 0 }), { x: 1, y: 0 });
  const definition = createCustomControllerDefinition('Test');
  assert.equal(definition.type, 'custom'); assert.equal(definition.inputs.length, 1);
});

test('character template prioritizes jump/run/walk over idle and references clips only', () => {
  const rig = new Rig(); rig.animations = [clip('idle', 'Idle'), clip('walk', 'Walk Forward'), clip('run', 'Run'), clip('jump', 'Jump')];
  const definition = createCharacterControllerDefinition(rig);
  assert.deepEqual(definition.inputs.map(input => input.id), ['move', 'jump', 'attack']);
  const clips = rig.animations;
  const idle = evaluateControllerMapping(definition, { move: { x: 0, y: 0 }, jump: false, attack: false }, .1, undefined, [], clips);
  assert.equal(idle.clipId, 'idle');
  const walking = evaluateControllerMapping(definition, { move: { x: .3, y: 0 }, jump: false, attack: false }, .1, idle, [], clips);
  assert.equal(walking.clipId, 'walk');
  const jumping = evaluateControllerMapping(definition, { move: { x: .3, y: 0 }, jump: true, attack: false }, .1, walking, [], clips);
  assert.equal(jumping.clipId, 'jump');
});

test('car template exposes throttle, steering and wheel rotation mappings', () => {
  const rig = new Rig(); const body = rig.addBone(null, 'Car chassis'); rig.addBone(body, 'Front wheel left'); rig.addBone(body, 'Front wheel right');
  rig.animations = [clip('drive', 'Car Drive'), clip('idle', 'Car Idle')];
  const definition = createCarControllerDefinition(rig);
  assert.deepEqual(definition.inputs.map(input => input.id), ['throttle', 'steer']);
  assert.ok(definition.bindings.some(binding => binding.parameter === 'speed' && binding.targetId === body));
  assert.ok(definition.states.some(state => state.id === 'drive' && state.actionId === 'drive'));
  assert.ok(definition.bindings.some(binding => binding.parameter === 'wheelRotation'));
});

test('controller runtime applies saved references without duplicating animation clips', () => {
  const rig = new Rig(); const body = rig.addBone(null, 'Car body');
  rig.animations = [clip('drive', 'Drive')];
  const definition = createCarControllerDefinition(rig); definition.bindings.push({ inputId: 'throttle', actionId: '', targetId: body, parameter: 'speed', scale: 20, deadzone: 0, invert: false });
  assert.equal(rig.addControllerDefinition(definition), definition.id);
  const instance = rig.addControllerInstance(definition.id); assert.ok(instance);
  const before = rig.animations.length;
  assert.ok(rig.setControllerInput(instance, 'throttle', 1));
  const evaluation = rig.applyController(instance, .5);
  assert.equal(evaluation.clipId, 'drive'); assert.equal(rig.animations.length, before);
  assert.equal(rig.toProject().controllers.length, 1); assert.equal(rig.toProject().controllerInstances.length, 1);
  rig.resetControllerInputs(instance); assert.equal(rig.getControllerEvaluation(instance), null);
});

test('controller definition/instance edits are undoable while high-frequency input is transient', () => {
  const rig = new Rig(); useProject.getState().replaceProject(rig.toProject(), false);
  const definition = createCustomControllerDefinition('Reusable');
  useProject.getState().addControllerDefinition(definition);
  const state = useProject.getState(); assert.equal(state.past.length, 1);
  const instance = state.addControllerInstance(definition.id); assert.ok(instance);
  assert.equal(useProject.getState().past.length, 2);
  assert.equal(useProject.getState().setControllerInput(instance, 'action', true), true);
  useProject.getState().applyController(instance, .016);
  assert.equal(useProject.getState().past.length, 2);
  useProject.getState().undo(); assert.equal(useProject.getState().rig.controllerInstances.length, 0);
  useProject.getState().redo(); assert.equal(useProject.getState().rig.controllerInstances.length, 1);
});

test('car demo contains reusable wheel rig, saved clips and a ready controller', () => {
  const rig = createCarDemo();
  assert.equal(rig.name, 'Original vector car · controller demo');
  assert.deepEqual(['Car Idle', 'Car Drive', 'Car Reverse', 'Car Brake'], rig.animations.map(clip => clip.name));
  assert.equal(rig.controllers.length, 1);
  for (const name of ['Wheel FL', 'Wheel FR', 'Wheel RL', 'Wheel RR']) assert.ok([...rig.bones.values()].some(bone => bone.name === name));
  const instance = rig.addControllerInstance(rig.controllers[0].id); assert.ok(instance);
  assert.equal(rig.setControllerInput(instance, 'throttle', 1), true);
  const evaluation = rig.applyController(instance, .25);
  assert.equal(evaluation.stateId, 'drive'); assert.equal(evaluation.clipId, rig.animations.find(clip => clip.name === 'Car Drive').id);
  assert.ok(evaluation.outputs.some(output => output.parameter === 'rotation'));
  const restored = Rig.fromJSON(rig.toJSON());
  assert.equal(restored.animations.length, 4); assert.equal(restored.controllers.length, 1); assert.equal(restored.controllerInstances.length, 1);
  assert.equal(restored.controllerState.size, 0);
});

test('style presets recolour selected vector parts without changing rigging or geometry', () => {
  const rig = createStyleDemo();
  const layer = rig.layersInOrder.find(layer => layer.type === 'vector' && layer.name.includes('Jacket'));
  assert.ok(layer && layer.type === 'vector');
  const shape = layer.shapes[0];
  const originalGeometry = JSON.stringify({ d: shape.d, points: shape.points, local: layer.local, mesh: layer.mesh, binding: [...rig.bindings.values()].find(binding => binding.layerId === layer.id) });
  assert.equal(setShapeStyle(rig, layer.id, shape.id, { fill: '#ff00aa', opacity: .5 }), true);
  assert.equal(shape.fill, '#ff00aa'); assert.equal(shape.opacity, .5);
  const presetId = saveStylePreset(rig, 'Test outfit', [layer.id]); assert.ok(presetId);
  assert.ok(listStylePresets(rig).some(preset => preset.id === presetId));
  assert.equal(setShapeStyle(rig, layer.id, shape.id, { fill: '#001122', opacity: 1 }), true);
  assert.equal(applyStylePreset(rig, presetId), 1);
  assert.equal(shape.fill, '#ff00aa'); assert.equal(shape.opacity, .5);
  assert.equal(JSON.stringify({ d: shape.d, points: shape.points, local: layer.local, mesh: layer.mesh, binding: [...rig.bindings.values()].find(binding => binding.layerId === layer.id) }), originalGeometry);
  assert.equal(removeStylePreset(rig, presetId), true);
  assert.equal(removeStylePreset(rig, presetId), false);
});

test('style editing preserves image dimensions, mesh and binding while rejecting remote artwork', () => {
  const rig = new Rig();
  const bone = rig.addBone(null, 'Image root');
  const layerId = rig.addImage('Raster shirt');
  const layer = rig.images.get(layerId); assert.ok(layer);
  layer.width = 120; layer.height = 240; layer.mesh = { vertices: [{ x: 0, y: 0, u: 0, v: 0, weights: { [bone]: 1 } }], triangles: [], bounds: { x: 0, y: 0, width: 120, height: 240 } };
  assert.equal(rig.bind(layerId, bone), true);
  const before = { id: layer.id, width: layer.width, height: layer.height, mesh: JSON.stringify(layer.mesh), binding: JSON.stringify([...rig.bindings.values()].find(binding => binding.layerId === layerId)) };
  assert.equal(replaceImageArtwork(rig, layerId, 'https://example.com/shirt.png'), false);
  assert.equal(replaceImageArtwork(rig, layerId, 'data:image/png;base64,AAAA'), true);
  assert.deepEqual({ id: layer.id, width: layer.width, height: layer.height, mesh: JSON.stringify(layer.mesh), binding: JSON.stringify([...rig.bindings.values()].find(binding => binding.layerId === layerId)) }, before);
});

test('2.5D stage adds bounded depth, parallax and camera presentation without changing authored transforms', () => {
  const rig = new Rig();
  const layerId = rig.addImage('Depth layer');
  const layer = rig.images.get(layerId); assert.ok(layer);
  const authored = { ...layer.local };
  assert.deepEqual(normalizeStage2DSettings({ enabled: true, cameraX: 10, cameraY: -5, zoom: 9, perspective: 2 }), { enabled: true, cameraX: 10, cameraY: -5, zoom: 4, perspective: .8, yaw: 0, pitch: 0, roll: 0, projection: 'perspective' });
  layer.depth = 500; layer.parallax = .5; rig.setStage2D({ enabled: true, cameraX: 100, cameraY: -40, zoom: 1.2, perspective: .4 });
  assert.equal(stageLayerScale(layer, rig.stage2d), 1.44);
  assert.deepEqual(stageLayerOffset(layer, rig.stage2d), { x: 50, y: -20 });
  assert.deepEqual(layer.local, authored);
  const saved = rig.toProject();
  assert.equal(saved.stage2d.enabled, true); assert.equal(saved.layers.find(item => item.id === layerId).depth, 500);
  const restored = Rig.fromJSON(JSON.stringify(saved));
  assert.deepEqual(restored.stage2d, rig.stage2d);
  assert.deepEqual(restored.layers.get(layerId).local, authored);
});

test('3D motion import parses BVH, retargets human joints and rejects proprietary formats clearly', () => {
  const bvh = `HIERARCHY
ROOT Hips {
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT LeftArm {
    OFFSET 10 0 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site { OFFSET 10 0 0 }
  }
}
MOTION
Frames: 2
Frame Time: 0.0333333
0 0 0 0 0 0 0 0 0
10 3 0 20 0 0 35 0 0`;
  const parsed = parseBVH(bvh, 'walk.bvh');
  assert.ok(parsed.motion); assert.equal(parsed.motion.frameCount, 2); assert.equal(parsed.motion.skeleton.length, 2);
  assert.equal(validateMotionFileName('walk.rlmotion').valid, false);
  assert.match(parseMotionFile('{}', 'walk.rlmotion').error, /unsupported/i);
  const rig = new Rig(); const hips = rig.addBone(null, 'Hips'); rig.addBone(hips, 'Left upper arm');
  const options = createMotionImportDefaults(parsed.motion);
  const result = retarget3DMotionToClip(rig, parsed.motion, { ...options, projectionAngle: 0, flip: true });
  assert.ok('tracks' in result); assert.equal(result.endFrame, 1); assert.ok(result.tracks.some(track => track.targetId === hips && track.property === 'x'));
  const armTrack = result.tracks.find(track => track.property === 'rotation' && track.targetId !== hips); assert.ok(armTrack);
  assert.ok(Math.abs(armTrack.keyframes[1].value + (35 * Math.PI / 180)) < 1e-8);
});

test('aligned motion clips append to the active clip and merge matching tracks', () => {
  const previous = {
    id: 'walk', name: 'Walk', fps: 24, startFrame: 0, endFrame: 2,
    tracks: [{ id: 'root-x', targetId: 'hips', property: 'x', keyframes: [
      { id: 'walk-0', frame: 0, value: 0 }, { id: 'walk-2', frame: 2, value: 20 },
    ] }],
  };
  const next = {
    id: 'turn', name: 'Turn', fps: 24, startFrame: 0, endFrame: 1,
    tracks: [{ id: 'turn-x', targetId: 'hips', property: 'x', keyframes: [
      { id: 'turn-0', frame: 0, value: 20 }, { id: 'turn-1', frame: 1, value: 24 },
    ] }],
  };
  const appended = appendAnimationClip(previous, next);
  assert.equal(appended.id, 'walk');
  assert.equal(appended.endFrame, 4);
  assert.equal(appended.tracks.length, 1);
  assert.deepEqual(appended.tracks[0].keyframes.map(key => key.frame), [0, 2, 3, 4]);
  assert.deepEqual(appended.tracks[0].keyframes.slice(2).map(key => key.value), [20, 24]);
});

test('Moho-style key editing moves, copies, pastes, deletes and changes interpolation', () => {
  const clip = {
    id: 'clip', name: 'Keys', fps: 24, startFrame: 0, endFrame: 12,
    tracks: [{ id: 'track', targetId: 'bone', property: 'rotation', keyframes: [
      { id: 'key-a', frame: 2, value: 0, easing: 'smooth' },
      { id: 'key-b', frame: 6, value: 1, easing: 'linear' },
    ] }],
  };
  const selection = [{ trackId: 'track', keyframeId: 'key-a' }];
  const moved = moveKeyframes(clip, selection, 3);
  assert.deepEqual(moved.clip.tracks[0].keyframes.map(key => key.frame), [5, 6]);
  const copied = copyKeyframes(moved.clip, moved.selection);
  assert.deepEqual(copied.map(key => key.offset), [0]);
  const pasted = pasteKeyframes(moved.clip, copied, 10);
  assert.equal(pasted.clip.tracks[0].keyframes.find(key => key.frame === 10).value, 0);
  const eased = setKeyframeInterpolation(pasted.clip, [{ trackId: 'track', keyframeId: 'key-b' }], 'step');
  assert.equal(eased.tracks[0].keyframes.find(key => key.frame === 6).easing, 'step');
  assert.equal(sampleTrack(eased.tracks[0], 7), 1);
  const deleted = deleteKeyframes(eased, pasted.selection);
  assert.ok(!deleted.tracks[0].keyframes.some(key => key.frame === 10));
});
