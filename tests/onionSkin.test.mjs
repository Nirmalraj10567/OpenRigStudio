import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({
  stdin: { contents: "export * from './src/engine/index'; export { useProject } from './src/state/projectStore';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { DEFAULT_ONION_SKIN_SETTINGS, normalizeOnionSkinSettings, onionSkinFrames, Rig, useProject } = compiled.exports;

test('onion skin settings normalize counts, opacity, and tints safely', () => {
  const settings = normalizeOnionSkinSettings({ previousFrames: 99, nextFrames: -4, previousOpacity: 2, nextOpacity: -.5, previousTint: 'blue', nextTint: '#ff00aa', showWhilePlaying: false });
  assert.equal(settings.previousFrames, 5);
  assert.equal(settings.nextFrames, 0);
  assert.equal(settings.previousOpacity, 1);
  assert.equal(settings.nextOpacity, 0);
  assert.equal(settings.previousTint, DEFAULT_ONION_SKIN_SETTINGS.previousTint);
  assert.equal(settings.nextTint, '#ff00aa');
  assert.equal(settings.showWhilePlaying, false);
});

test('onion skin frames stay inside the timeline and never wrap through loop boundaries', () => {
  const frames = onionSkinFrames(12.4, 0, 20, { ...DEFAULT_ONION_SKIN_SETTINGS, previousFrames: 2, nextFrames: 3 });
  assert.deepEqual(frames.map(item => [item.direction, item.frame, item.distance]), [
    ['next', 15, 3],
    ['previous', 10, 2], ['next', 14, 2],
    ['previous', 11, 1], ['next', 13, 1],
  ]);
  assert.deepEqual(onionSkinFrames(0, 0, 20, { ...DEFAULT_ONION_SKIN_SETTINGS, previousFrames: 5, nextFrames: 1 }).map(item => item.frame), [1]);
  assert.deepEqual(onionSkinFrames(20, 0, 20, { ...DEFAULT_ONION_SKIN_SETTINGS, previousFrames: 1, nextFrames: 5 }).map(item => item.frame), [19]);
});

test('onion skin opacity falls off toward farther frames while preserving direction tint', () => {
  const frames = onionSkinFrames(10, 0, 20, { ...DEFAULT_ONION_SKIN_SETTINGS, previousFrames: 3, nextFrames: 0, previousOpacity: .3, previousTint: '#123456' });
  assert.equal(frames[0].distance, 3);
  assert.equal(frames.at(-1).distance, 1);
  assert.ok(frames[0].opacity < frames.at(-1).opacity);
  assert.ok(frames.every(item => item.tint === '#123456'));
});

test('onion skin preferences stay outside project history and serialized artwork', () => {
  const rig = new Rig();
  useProject.getState().replaceProject(rig.toProject(), false);
  const before = useProject.getState().serialize();
  const history = useProject.getState().past.length;
  useProject.getState().setOnionSkin({ enabled: true, previousFrames: 4, activeLayerOnly: true });
  assert.equal(useProject.getState().onionSkin.enabled, true);
  assert.equal(useProject.getState().onionSkin.previousFrames, 4);
  assert.equal(useProject.getState().serialize(), before);
  assert.equal(useProject.getState().past.length, history);
});
