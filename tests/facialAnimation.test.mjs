import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({ stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, identity, automaticBlink, createAudioFacialClip, recordFacialKey } = compiled.exports;

function faceRig() {
  const rig = new Rig();
  const head = rig.addBone(null, 'Head', 80);
  rig.bones.get(head).local = { ...identity(), x: 400, y: 260 };
  const add = name => { const id = rig.addVectorLayer(name, [{ id: `${name}-shape`, kind: 'ellipse', x: 0, y: 0, radiusX: 20, radiusY: 12, fill: '#fff' }]); rig.layers.get(id).local = identity(); rig.bind(id, head); return id; };
  const leftEye = add('Left eye'), rightEye = add('Right eye'), leftBrow = add('Left brow'), rightBrow = add('Right brow'), mouth = add('Mouth rest');
  rig.update(); const profile = rig.createFacialProfile('Test face', { head, leftEye, rightEye, leftBrow, rightBrow, mouth });
  return { rig, profile, head, leftEye, rightEye, leftBrow, rightBrow, mouth };
}

test('facial profiles persist targets, presets and neutral calibration data', () => {
  const { rig, profile } = faceRig();
  assert.ok(profile); assert.equal(rig.facialProfiles[0].presets.length >= 4, true);
  rig.facialProfiles[0].calibration.neutral.smile = .2;
  const restored = Rig.fromJSON(rig.toJSON());
  assert.equal(restored.facialProfiles[0].targets.mouth, rig.facialProfiles[0].targets.mouth);
  assert.equal(restored.facialProfiles[0].calibration.neutral.smile, .2);
});

test('facial live parameters drive eyes, brows, mouth and head non-destructively', () => {
  const { rig, profile, leftEye, leftBrow, mouth, head } = faceRig();
  const authored = JSON.stringify(rig.toProject().layers);
  rig.setFacialLive(profile, { blinkLeft: 1, browLeft: 1, mouthOpen: 1, headRoll: 20, eyeX: .5 });
  const eye = rig.layers.get(leftEye), brow = rig.layers.get(leftBrow), mouthLayer = rig.layers.get(mouth), headBone = rig.bones.get(head);
  assert.ok(eye.world.scaleY < 1); assert.ok(brow.world.y < 0); assert.notEqual(mouthLayer.world.y, 260); assert.ok(headBone.world.rotation > 0);
  assert.equal(JSON.stringify(rig.toProject().layers), authored);
  rig.clearFacialLive(profile); assert.equal(rig.layers.get(leftEye).world.scaleY, 1);
});

test('facial keys interpolate as editable timeline data and audio draft creates a portable clip', () => {
  const { rig, profile } = faceRig();
  assert.ok(recordFacialKey(rig, profile, { blinkLeft: 0, blinkRight: 0, browLeft: 0, browRight: 0, eyeX: 0, eyeY: 0, headYaw: 0, headPitch: 0, headRoll: 0, smile: 0, mouthOpen: 0 }, 0));
  assert.ok(recordFacialKey(rig, profile, { blinkLeft: 1, blinkRight: 1, browLeft: .5, browRight: .5, eyeX: .4, eyeY: 0, headYaw: 30, headPitch: 0, headRoll: 0, smile: 1, mouthOpen: 1 }, 24));
  rig.applyAnimation(rig.timeline.activeAnimationId, 12); assert.ok(rig.layers.get(rig.facialProfiles[0].targets.leftEye).world.scaleY < 1);
  rig.audio = { id: 'audio', name: 'test.wav', src: 'data:audio/wav;base64,AAAA', duration: 2, offsetSeconds: 0, volume: 1, muted: false, peaks: Array.from({ length: 100 }, (_, i) => i % 10 / 10) };
  const clip = createAudioFacialClip(rig, profile); assert.ok(clip); assert.ok(clip.tracks[0].keyframes.length > 2); assert.equal(clip.tracks[0].property, 'facial');
});

test('automatic blink produces a smooth bounded cycle', () => {
  assert.equal(automaticBlink(1, 3.8, .18), 0);
  assert.ok(automaticBlink(3.71, 3.8, .18) > 0); assert.ok(automaticBlink(3.8, 3.8, .18) < 1e-9);
});
