import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({
  stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const {
  Rig,
  filterTrackedConfidence,
  interpolateTrackedFrames,
  smoothTrackedFrames,
  processTrackedFrames,
  trackedPointToStage,
  suggestTrackedRigMapping,
  retargetTrackedFramesToClip,
  reduceTrackedClipKeys,
  createTransformClipFromSamples,
} = compiled.exports;

const point = (x, y, confidence = 1) => ({ x, y, visibility: confidence, confidence });
const frame = (number, landmarks) => ({ frame: number, timeSeconds: number / 24, landmarks });

test('motion tracking cleanup filters confidence and fills short landmark gaps', () => {
  const source = [
    frame(0, { leftWrist: point(.2, .4), rightWrist: point(.8, .4) }),
    frame(1, { leftWrist: point(.25, .4, .1), rightWrist: point(.75, .4) }),
    frame(2, { leftWrist: point(.3, .4), rightWrist: point(.7, .4) }),
  ];
  const filtered = filterTrackedConfidence(source, .35);
  assert.equal(filtered[1].landmarks.leftWrist, undefined);
  const filled = interpolateTrackedFrames(filtered, 1);
  assert.ok(filled[1].landmarks.leftWrist);
  assert.equal(filled[1].landmarks.leftWrist.x, .25);
});

test('motion tracking smoothing is deterministic and preserves confidence channels', () => {
  const source = [frame(0, { nose: point(.1, .2) }), frame(1, { nose: point(.5, .6) }), frame(2, { nose: point(.9, .2) })];
  const once = smoothTrackedFrames(source, 3);
  const twice = smoothTrackedFrames(source, 3);
  assert.deepEqual(once, twice);
  assert.ok(once[1].landmarks.nose.confidence > 0);
  assert.ok(once[1].landmarks.nose.x > .1 && once[1].landmarks.nose.x < .9);
  assert.deepEqual(processTrackedFrames(source, { confidenceThreshold: .1, maxMissingGap: 2, smoothingWindow: 3 }), once);
});

test('tracked coordinates map to the editor stage and mirror for left-facing footage', () => {
  const normal = trackedPointToStage(point(.25, .5), { videoWidth: 640, videoHeight: 480, stageWidth: 800, stageHeight: 520, facing: 'right' });
  const mirrored = trackedPointToStage(point(.25, .5), { videoWidth: 640, videoHeight: 480, stageWidth: 800, stageHeight: 520, facing: 'left' });
  assert.deepEqual(normal, { x: 200, y: 260 });
  assert.deepEqual(mirrored, { x: 600, y: 260 });
});

test('automatic mapping suggests side-aware rig bones', () => {
  const rig = new Rig();
  rig.addBone(null, 'Pelvis', 80);
  rig.addBone(null, 'Left upper arm', 70);
  rig.addBone(null, 'Right upper arm', 70);
  const suggestions = suggestTrackedRigMapping(rig, ['leftShoulder', 'rightShoulder', 'leftHip']);
  assert.equal(suggestions.length, 3);
  assert.equal(suggestions.find(item => item.landmark === 'leftShoulder').boneId, [...rig.bones.values()][1].id);
  assert.equal(suggestions.find(item => item.landmark === 'rightShoulder').boneId, [...rig.bones.values()][2].id);
});

test('tracked frames solve the real rig and bake native transform tracks', () => {
  const rig = new Rig();
  const root = rig.addBone(null, 'Pelvis', 80);
  const arm = rig.addBone(root, 'Left upper arm', 70);
  const frames = [
    frame(0, { leftHip: point(.5, .55), leftShoulder: point(.5, .4), leftElbow: point(.62, .4), leftWrist: point(.74, .4) }),
    frame(1, { leftHip: point(.55, .55), leftShoulder: point(.55, .4), leftElbow: point(.62, .3), leftWrist: point(.72, .22) }),
  ];
  const clip = retargetTrackedFramesToClip(rig, frames, {
    rootLandmark: 'leftHip',
    bones: [{ boneId: arm, start: 'leftShoulder', end: 'leftElbow' }],
    ik: [{ effectorBoneId: arm, landmark: 'leftWrist', chainLength: 1 }],
  }, { videoWidth: 640, videoHeight: 480, stageWidth: 800, stageHeight: 520, fps: 24, keyTolerance: 0 });
  assert.equal(clip.fps, 24);
  assert.equal(clip.startFrame, 0);
  assert.equal(clip.endFrame, 1);
  assert.ok(clip.tracks.some(track => track.targetId === root && track.property === 'transform'));
  assert.ok(clip.tracks.some(track => track.targetId === arm && track.property === 'transform'));
  const reduced = reduceTrackedClipKeys(clip, 9999);
  assert.ok(reduced.tracks.every(track => track.keyframes.length <= 2));
});

test('controller recording samples become a native clip that survives project reload', () => {
  const rig = new Rig();
  const root = rig.addBone(null, 'Root', 80);
  const clip = createTransformClipFromSamples([
    { frame: 12, values: { [root]: { ...rig.bones.get(root).local, x: 220 } } },
    { frame: 13, values: { [root]: { ...rig.bones.get(root).local, x: 245 } } },
  ], 24, 'Joystick take', 0);
  assert.ok(clip);
  rig.animations.push(clip);
  rig.setTimeline({ activeAnimationId: clip.id, startFrame: clip.startFrame, endFrame: clip.endFrame, currentFrame: clip.startFrame });
  const reopened = new Rig(rig.toProject());
  reopened.applyAnimation(clip.id, 13);
  assert.equal(reopened.bones.get(root).local.x, 245);
});
