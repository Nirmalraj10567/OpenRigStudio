import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({
  stdin: {
    contents: "export * from './src/engine/Rig'; export * from './src/engine/autoRig';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, autoRig } = compiled.exports;

test('auto mapping creates a semantic human rig and becomes idempotent', () => {
  const rig = new Rig();
  const first = autoRig(rig, { mode: 'full', spineCount: 3, bindArtwork: false, gearUp: true });
  assert.ok(first.boneCount >= 10);
  assert.ok(first.createdBoneIds.length >= 10);
  assert.equal(first.boneCount, rig.bones.size);

  const idsBefore = [...rig.bones.keys()].sort();
  const second = autoRig(rig, { mode: 'full', spineCount: 3, bindArtwork: false, gearUp: true });
  assert.equal(second.createdBoneIds.length, 0);
  assert.deepEqual([...rig.bones.keys()].sort(), idsBefore);
  assert.equal(second.boneCount, first.boneCount);
});

test('auto mapping reports unmapped artwork and leaves existing bindings when binding is disabled', () => {
  const rig = new Rig();
  const imageId = rig.addImage('Unrelated prop');
  const rootId = rig.addBone(null, 'Existing root', 80);
  assert.equal(rig.bind(imageId, rootId), true);

  const result = autoRig(rig, { mode: 'head', spineCount: 1, bindArtwork: false, gearUp: false });
  assert.ok(result.unmappedLayerIds.length >= 0);
  assert.equal(rig.layers.get(imageId).boundBoneId, rootId);
  assert.equal(rig.bindings.get(imageId).boneId, rootId);
});
