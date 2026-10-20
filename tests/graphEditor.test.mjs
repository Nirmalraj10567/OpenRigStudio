import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({ stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { sampleTrack, graphChannels, graphScalarTrack, setTangent, automaticTangents, copyCurve, pasteCurve, editGraphKey, filterMotionCurve, graphVelocity, normalizeCurveChannels } = compiled.exports;

function transformTrack() {
  return { id: 'pose', targetId: 'bone', property: 'transform', keyframes: [
    { id: 'a', frame: 0, value: { x: 0, y: 20, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: 'b', frame: 10, value: { x: 100, y: 60, rotation: Math.PI, scaleX: 2, scaleY: 1.5 } },
  ] };
}

test('graph sampling supports Bezier handles and professional easing presets', () => {
  const track = { id: 'x', targetId: 'bone', property: 'x', keyframes: [
    { id: 'a', frame: 0, value: 0, curves: { $: { easing: 'bezier', outTangent: { frame: 8, value: 60 } } } },
    { id: 'b', frame: 10, value: 100, curves: { $: { easing: 'bezier', inTangent: { frame: -8, value: -60 } } } },
  ] };
  const middle = sampleTrack(track, 5);
  assert.ok(Number.isFinite(middle));
  assert.ok(middle > 0 && middle < 100);
  for (const easing of ['bounce', 'elastic', 'overshoot']) {
    track.keyframes[0].easing = easing;
    assert.ok(Number.isFinite(sampleTrack(track, 3)));
  }
});

test('graph channels expose separate transform curves and tangent edits lock symmetrically', () => {
  const track = transformTrack();
  assert.deepEqual(graphChannels(track).slice(0, 4).map(channel => channel.path), ['x', 'y', 'rotation', 'scaleX']);
  const clip = { id: 'clip', name: 'Graph', fps: 24, startFrame: 0, endFrame: 20, tracks: [track] };
  const ref = [{ trackId: track.id, keyframeId: 'a' }];
  const curved = setTangent(clip, ref, 'x', 'outTangent', { frame: 3, value: 30 }, true);
  const curve = curved.tracks[0].keyframes[0].curves.x;
  assert.equal(curve.easing, 'bezier');
  assert.equal(curve.locked, true);
  assert.ok(curve.inTangent && curve.outTangent);
  const moved = editGraphKey(curved, ref[0], 'x', 2, 25);
  assert.equal(moved.tracks[0].keyframes[0].value.x, 25);
});

test('graph automatic ease, velocity, filtering and curve copy/paste preserve editable data', () => {
  const clip = { id: 'clip', name: 'Graph', fps: 24, startFrame: 0, endFrame: 20, tracks: [{ id: 'x', targetId: 'bone', property: 'x', keyframes: [
    { id: 'a', frame: 0, value: 0 }, { id: 'b', frame: 5, value: 100 }, { id: 'c', frame: 10, value: 0 },
  ] }] };
  const selection = [{ trackId: 'x', keyframeId: 'b' }];
  const eased = automaticTangents(clip, selection, '$', 'auto-ease', .4);
  assert.equal(eased.tracks[0].keyframes[1].curves.$.easing, 'bezier');
  assert.ok(Number.isFinite(graphVelocity(eased.tracks[0], '$', 5, 24)));
  const filtered = filterMotionCurve(eased, 'x', '$', .5);
  assert.ok(Number.isFinite(filtered.tracks[0].keyframes[1].value));
  const copied = copyCurve(eased.tracks[0], '$');
  const pasted = pasteCurve(eased, 'x', '$', copied, 20);
  assert.ok(pasted.tracks[0].keyframes.some(key => key.frame === 20));
  assert.deepEqual(normalizeCurveChannels({ x: { easing: 'bounce', outTangent: { frame: 4, value: 20 } } }).x.outTangent, { frame: 4, value: 20 });
});
