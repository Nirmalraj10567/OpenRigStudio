import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({ stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, mapAnimationFrame, trimAnimation, stretchAnimation, retimeAnimation, createAnimationLayer, createCycle, addAnimationTransition } = compiled.exports;

test('cycle, ping-pong, offset and clip retiming map frames deterministically', () => {
  const clip = { startFrame: 0, endFrame: 10, loopMode: 'cycle', loopStart: 2, loopEnd: 6, cycleOffset: 1, playbackRate: 1 };
  assert.equal(mapAnimationFrame(0, clip), 3);
  assert.equal(mapAnimationFrame(4, clip), 3);
  assert.equal(mapAnimationFrame(8, { ...clip, loopMode: 'ping-pong', cycleOffset: 0 }), 2);
  const source = { id: 'clip', name: 'source', fps: 24, startFrame: 0, endFrame: 20, tracks: [{ id: 'track', targetId: 'bone', property: 'x', keyframes: [{ id: 'a', frame: 0, value: 0 }, { id: 'b', frame: 20, value: 100 }] }] };
  assert.deepEqual(trimAnimation(source, 5, 15).tracks[0].keyframes.map(key => key.frame), [5, 15]);
  assert.deepEqual(stretchAnimation(source, 2).tracks[0].keyframes.map(key => key.frame), [0, 40]);
  assert.deepEqual(retimeAnimation(source, 10, 30).tracks[0].keyframes.map(key => key.frame), [10, 30]);
});

test('NLA override and additive layers blend source clips into the active pose', () => {
  const rig = new Rig();
  const boneId = rig.addBone(null, 'Arm', 50);
  rig.bones.get(boneId).local.x = 0;
  rig.update();
  const baseX = rig.bones.get(boneId).local.x;
  const base = { id: 'base', name: 'Base', fps: 24, startFrame: 0, endFrame: 10, tracks: [], setupPose: { [boneId]: { local: { ...rig.bones.get(boneId).local } } } };
  const override = { id: 'override', name: 'Override', fps: 24, startFrame: 0, endFrame: 10, tracks: [{ id: 'override-track', targetId: boneId, property: 'x', keyframes: [{ id: 'o0', frame: 0, value: 20 }] }], setupPose: { [boneId]: { local: { ...rig.bones.get(boneId).local } } } };
  const additive = { id: 'additive', name: 'Additive', fps: 24, startFrame: 0, endFrame: 10, tracks: [{ id: 'add-track', targetId: boneId, property: 'x', keyframes: [{ id: 'a0', frame: 0, value: 10 }] }], setupPose: { [boneId]: { local: { ...rig.bones.get(boneId).local, x: 2 } } } };
  base.nlaLayers = [{ id: 'override-layer', name: 'Override layer', clipId: 'override', startFrame: 0, endFrame: 10, speed: 1, offset: 0, weight: .5, blendMode: 'override', loopMode: 'once', blendIn: 0, blendOut: 0, muted: false, solo: false }, { id: 'add-layer', name: 'Additive layer', clipId: 'additive', startFrame: 0, endFrame: 10, speed: 1, offset: 0, weight: 1, blendMode: 'additive', loopMode: 'once', blendIn: 0, blendOut: 0, muted: false, solo: false }];
  rig.animations = [base, override, additive]; rig.setTimeline({ activeAnimationId: 'base' }); rig.applyAnimation('base', 0);
  assert.equal(rig.bones.get(boneId).local.x, baseX + 18);
});

test('NLA layer creation, cycle metadata and transitions persist through JSON', () => {
  const rig = new Rig();
  const host = { id: 'host', name: 'NLA host', fps: 24, startFrame: 0, endFrame: 24, tracks: [] };
  const source = { id: 'source', name: 'Walk', fps: 24, startFrame: 0, endFrame: 12, tracks: [] };
  rig.animations = [host, source];
  assert.equal(createAnimationLayer(rig, 'host', 'source') !== null, true);
  const layer = rig.animations[0].nlaLayers[0];
  assert.equal(createCycle(rig, 'host', 0, 12, true), true);
  assert.equal(addAnimationTransition(rig, 'host', layer.id, layer.id, 6), false);
  const saved = Rig.fromJSON(rig.toJSON());
  assert.equal(saved.animations[0].nlaLayers.length, 1);
  assert.equal(saved.animations[0].loopMode, 'ping-pong');
});
