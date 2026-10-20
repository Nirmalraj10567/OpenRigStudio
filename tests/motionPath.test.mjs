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
const { Rig, bakeMotionPath, sampleMotionPath } = compiled.exports;

test('motion paths sample by distance and bake transform keys across the frame range', () => {
  const rig = new Rig();
  const targetId = rig.addImage('Walker', { width: 80, height: 120 });
  const path = { id: 'path-test', name: 'Walk arc', targetId, points: [{ x: 100, y: 180 }, { x: 300, y: 180 }, { x: 420, y: 260 }], startFrame: 0, endFrame: 10, orientToPath: true, enabled: true };
  const middle = sampleMotionPath(path, .5);
  assert.ok(middle.point.x > 190 && middle.point.x < 310);
  assert.ok(Number.isFinite(middle.tangent));
  assert.equal(bakeMotionPath(rig, path), true);
  const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  const track = clip?.tracks.find(item => item.targetId === targetId && item.property === 'transform');
  assert.ok(track);
  assert.equal(track.keyframes.length, 11);
  assert.equal(track.keyframes[0].frame, 0);
  assert.equal(track.keyframes.at(-1).frame, 10);
  assert.notEqual(track.keyframes[0].value.x, track.keyframes.at(-1).value.x);
});
