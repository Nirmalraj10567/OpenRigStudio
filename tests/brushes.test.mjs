import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { test } from 'node:test';

const workspace = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { outputFiles } = await build({ entryPoints: [`${workspace}/src/engine/brushes.ts`], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { BRUSH_PRESETS, createBrushShapes } = compiled.exports;

const points = Array.from({ length: 14 }, (_, index) => ({ x: index * 10, y: Math.sin(index / 2) * 18, pressure: .2 + index / 20, tiltX: 0, tiltY: 0 }));

test('brush library creates finite editable vector artwork for every preset', () => {
  assert.equal(BRUSH_PRESETS.length, 15);
  for (const preset of BRUSH_PRESETS) {
    const shapes = createBrushShapes(points, { id: preset.id, size: preset.defaultSize, opacity: preset.defaultOpacity, color: '#64c7b5', pressure: preset.pressure }, `test-${preset.id}`);
    assert.ok(shapes.length > 0, `${preset.id} should create at least one shape`);
    assert.ok(shapes.every(shape => shape.brushId === preset.id), `${preset.id} metadata should survive`);
    assert.ok(shapes.every(shape => JSON.stringify(shape).match(/NaN|Infinity/) === null), `${preset.id} must stay finite`);
    assert.ok(shapes.some(shape => shape.kind === 'path' || shape.kind === 'ellipse'), `${preset.id} should use renderable vector geometry`);
  }
});

test('brush output is deterministic and honors pressure-disabled size', () => {
  const settings = { id: 'studio-ink', size: 7, opacity: .8, color: '#fff', pressure: false };
  const first = createBrushShapes(points, settings, 'deterministic');
  const second = createBrushShapes(points, settings, 'deterministic');
  assert.deepEqual(first, second);
  assert.equal(first[0].strokeWidth, 7);
  assert.equal(first[0].lineCap, 'round');
  assert.equal(first[0].lineJoin, 'round');
});

test('a click gesture creates an editable vector dot instead of disappearing', () => {
  const shapes = createBrushShapes([{ x: 0, y: 0, pressure: .75 }, { x: 0, y: 0, pressure: .75 }], { id: 'studio-ink', size: 8, opacity: 1, color: '#fff', pressure: false }, 'click');
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].kind, 'ellipse');
  assert.equal(shapes[0].x, 0);
  assert.equal(shapes[0].y, 0);
});
