import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({ stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, identity, addCharacterViewSet, createHeadCreator, updateHeadCreatorControls, updateHeadCreatorMask, createHeadCreatorTurnKeys } = compiled.exports;

function headRig() {
  const rig = new Rig();
  const head = rig.addBone(null, 'Head', 80);
  rig.bones.get(head).local = { ...identity(), x: 400, y: 260 };
  const add = name => {
    const id = rig.addVectorLayer(name, [{ id: `${name}-shape`, kind: 'ellipse', x: 0, y: 0, radiusX: 14, radiusY: 8, fill: '#fff' }]);
    rig.layers.get(id).local = identity(); rig.bind(id, head); return id;
  };
  const leftEye = add('Left eye'), rightEye = add('Right eye'), nose = add('Nose'), mouth = add('Mouth'), leftEar = add('Left ear'), rightEar = add('Right ear');
  rig.update();
  return { rig, head, leftEye, rightEye, nose, mouth, leftEar, rightEar };
}

test('Head Creator generates a persisted head-only view rig and facial profile', () => {
  const { rig, head } = headRig();
  const id = createHeadCreator(rig, 'Moss head', head);
  assert.ok(id);
  const creator = rig.headCreators[0];
  assert.equal(creator.name, 'Moss head');
  assert.equal(creator.slots.length, 5);
  assert.equal(rig.characterViews.find(item => item.id === creator.viewSetId).views.length, 5);
  assert.ok(creator.facialProfileId);
  assert.ok(creator.maskLayerId);
  const restored = Rig.fromJSON(rig.toJSON());
  assert.equal(restored.headCreators[0].viewSetId, creator.viewSetId);
  assert.equal(restored.headCreators[0].slots.length, 5);
  assert.equal(restored.facialProfiles[0].viewSetId, creator.viewSetId);
});

test('Head Creator controls update every prepared slot without baking base artwork', () => {
  const parts = headRig();
  const id = createHeadCreator(parts.rig, 'Layout head', parts.head);
  const creator = parts.rig.headCreators[0];
  const authored = JSON.stringify(parts.rig.toProject().layers);
  assert.equal(updateHeadCreatorControls(parts.rig, id, { eyeSpacing: .75, noseDepth: .6, mouthWidth: .4, earVisibility: .25 }), true);
  assert.equal(JSON.stringify(parts.rig.toProject().layers), authored);
  const front = parts.rig.characterViews.find(item => item.id === creator.viewSetId).views.find(view => view.angle === 0);
  assert.notEqual(front.targets[parts.leftEye].local.x, creator.slots.find(slot => slot.angle === 0).baseline[parts.leftEye].local.x);
  assert.equal(updateHeadCreatorMask(parts.rig, id, { enabled: true, radiusX: 110 }), true);
  assert.equal(parts.rig.layers.get(creator.maskLayerId).visible, true);
});

test('Head Creator creates editable transition keys across generated slots', () => {
  const { rig, head } = headRig();
  const id = createHeadCreator(rig, 'Keys head', head);
  assert.equal(createHeadCreatorTurnKeys(rig, id, 0, 48), true);
  const creator = rig.headCreators[0];
  const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  const track = clip.tracks.find(item => item.targetId === creator.viewSetId && item.property === 'viewAngle');
  assert.equal(track.keyframes.length, 5);
  assert.deepEqual(track.keyframes.map(key => key.frame), [0, 12, 24, 36, 48]);
});

test('Head Creator splits a head branch out of an existing full-character view set', () => {
  const { rig, head, leftEye, rightEye, mouth } = headRig();
  const bodyBone = rig.addBone(null, 'Body', 180);
  const body = addCharacterViewSet(rig, 'Full character', [head, leftEye, rightEye, mouth, bodyBone]);
  assert.ok(body);
  const id = createHeadCreator(rig, 'Split head', head);
  assert.ok(id);
  const creator = rig.headCreators[0];
  assert.equal(creator.bodyViewSetId, body);
  assert.notEqual(creator.viewSetId, body);
  assert.equal(rig.characterViews.find(item => item.id === body).targetIds.includes(head), false);
  assert.equal(rig.characterViews.find(item => item.id === creator.viewSetId).targetIds.includes(head), true);
});
