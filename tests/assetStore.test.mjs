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
const { Rig, DEFAULT_CHARACTER_DESIGN, addStudioCharacter, applyCharacterDesignToGroup, characterGroupForSelection } = compiled.exports;

test('asset-store character application preserves group, bones, layers, and animation targets', () => {
  const rig = new Rig();
  const added = addStudioCharacter(rig, DEFAULT_CHARACTER_DESIGN);
  const beforeLayers = [...rig.groups.get(added.groupId).childIds];
  const beforeBones = [...added.boneIds];
  const animatedLayer = beforeLayers.find(id => rig.layers.has(id));
  rig.animations = [{ id: 'asset-test-animation', name: 'Asset test', startFrame: 0, endFrame: 24, fps: 24, tracks: [{ id: 'asset-track', targetId: animatedLayer, property: 'transform', keyframes: [{ id: 'asset-key', frame: 0, value: { ...rig.layers.get(animatedLayer).local }, easing: 'linear' }] }] }];
  rig.setTimeline({ activeAnimationId: 'asset-test-animation' });
  const result = applyCharacterDesignToGroup(rig, added.groupId, { ...DEFAULT_CHARACTER_DESIGN, shirt: 'hoodie', shirtColor: '#6fbf73' }, 'shirt');
  assert.ok(result);
  assert.equal(characterGroupForSelection(rig, added.rootId), added.groupId);
  assert.deepEqual(beforeBones, [...rig.bones.keys()].filter(id => beforeBones.includes(id)));
  assert.ok(beforeLayers.every(id => rig.groups.get(added.groupId).childIds.includes(id)));
  assert.ok(rig.animations[0].tracks.some(track => track.targetId === animatedLayer));
  assert.ok(result.updatedLayerIds.length > 0 || result.addedLayerIds.length > 0);
});

test('asset-store selection resolves a layer and its bound bone back to the character group', () => {
  const rig = new Rig();
  const added = addStudioCharacter(rig, DEFAULT_CHARACTER_DESIGN);
  const layerId = rig.groups.get(added.groupId).childIds.find(id => rig.layers.has(id));
  assert.equal(characterGroupForSelection(rig, layerId), added.groupId);
  assert.equal(characterGroupForSelection(rig, added.rootId), added.groupId);
  assert.equal(characterGroupForSelection(rig, null), null);
});
