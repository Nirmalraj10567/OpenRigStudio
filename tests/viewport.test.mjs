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
const { fitEditorViewport, zoomEditorViewportAtPoint, clampEditorZoom } = compiled.exports;

test('pointer zoom keeps the point under the cursor fixed', () => {
  const next = zoomEditorViewportAtPoint({ pan: { x: 12, y: -8 }, zoom: 1 }, { x: 160, y: 90 }, 2);
  assert.equal(next.zoom, 2);
  assert.deepEqual(next.pan, { x: -136, y: -106 });
});

test('editor zoom is clamped to the safe interactive range', () => {
  assert.equal(clampEditorZoom(.001), .1);
  assert.equal(clampEditorZoom(99), 4);
  const unchanged = zoomEditorViewportAtPoint({ pan: { x: 3, y: 4 }, zoom: 4 }, { x: 0, y: 0 }, 2);
  assert.deepEqual(unchanged, { pan: { x: 3, y: 4 }, zoom: 4 });
});

test('fit editor viewport frames the complete stage without changing artwork coordinates', () => {
  assert.deepEqual(fitEditorViewport(1000, 700, 800, 520, 24), { pan: { x: 0, y: 0 }, zoom: 1.19 });
  assert.deepEqual(fitEditorViewport(40, 40, 800, 520, 24), { pan: { x: 0, y: 0 }, zoom: .1 });
});
