import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({
  stdin: { contents: "export * from './src/engine/index'; export {useProject} from './src/state/projectStore';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, normalizeStage2DSettings, stageLayerTransform, stageLayerScale, stageLayerOffset,
  stageRenderLayers, applyStage2DTransform, projectToSVG, createStageDemo, useProject } = compiled.exports;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);
const center = { x: 400, y: 260 };
const settings = patch => normalizeStage2DSettings({ enabled: true, ...patch });
const projected = (matrix, point) => ({ x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f });

test('legacy stage settings default to zero angles and malformed angles are bounded', () => {
  assert.deepEqual(normalizeStage2DSettings({ enabled: true }), settings({ yaw: 0, pitch: 0, roll: 0 }));
  const safe = normalizeStage2DSettings({ yaw: Infinity, pitch: NaN, roll: '45' });
  assert.deepEqual([safe.yaw, safe.pitch, safe.roll], [0, 0, 0]);
  const clamped = normalizeStage2DSettings({ yaw: 999, pitch: -999, roll: -999 });
  assert.deepEqual([clamped.yaw, clamped.pitch, clamped.roll], [180, -85, -180]);
});

test('zero-angle projection preserves the existing depth, zoom, and parallax result', () => {
  const layer = { depth: 500, parallax: 0.5 };
  const stage = settings({ cameraX: 100, cameraY: -40, zoom: 1.2, perspective: 0.4 });
  const matrix = stageLayerTransform(layer, stage, center);
  close(stageLayerScale(layer, stage), 1.44);
  assert.deepEqual(stageLayerOffset(layer, stage), { x: 50, y: -20 });
  const point = projected(matrix, { x: 500, y: 300 });
  close(point.x, 400 + 50 + 100 * 1.44);
  close(point.y, 260 - 20 + 40 * 1.44);
  close(matrix.b, 0); close(matrix.c, 0);
});

test('yaw foreshortens plane width and separates depth planes in opposite directions', () => {
  const stage = settings({ yaw: 45 });
  const flat = stageLayerTransform({ depth: 0 }, stage, center);
  close(flat.a, Math.SQRT1_2); close(flat.d, 1);
  const front = projected(stageLayerTransform({ depth: 200 }, stage, center), center);
  const back = projected(stageLayerTransform({ depth: -200 }, stage, center), center);
  close(front.x, center.x + 200 * Math.SQRT1_2);
  close(back.x, center.x - 200 * Math.SQRT1_2);
  close(front.y, center.y);
  const side = stageLayerTransform({ depth: 0 }, settings({ yaw: 90 }), center);
  close(side.a, 0);
  const reverse = stageLayerTransform({ depth: 0 }, settings({ yaw: -45 }), center);
  close(reverse.a, flat.a);
  close(stageLayerOffset({ depth: 200 }, settings({ yaw: -45 })).x, -200 * Math.SQRT1_2);
});

test('pitch and roll alter projection while keeping the stage center fixed', () => {
  const pitch = stageLayerTransform({ depth: 0 }, settings({ pitch: 60 }), center);
  close(pitch.a, 1); close(pitch.d, 0.5);
  const elevated = projected(stageLayerTransform({ depth: 100 }, settings({ pitch: 30 }), center), center);
  close(elevated.x, center.x); close(elevated.y, center.y - 50);
  const roll = stageLayerTransform({}, settings({ roll: 90 }), center);
  const point = projected(roll, { x: center.x + 100, y: center.y });
  close(point.x, center.x); close(point.y, center.y + 100);
  const orbit = projected(stageLayerTransform({}, settings({ yaw: 45, pitch: 35, roll: 12 }), center), center);
  close(orbit.x, center.x); close(orbit.y, center.y);
});

test('back view reverses depth planes and disabled staging preserves authored order', () => {
  const layers = [{ id: 'front', depth: 200, zIndex: 0 }, { id: 'back', depth: -200, zIndex: 1 }, { id: 'mid', depth: 0, zIndex: 2 }];
  assert.deepEqual(stageRenderLayers(layers, settings({})).map(layer => layer.id), ['back', 'mid', 'front']);
  assert.deepEqual(stageRenderLayers(layers, settings({ yaw: 180 })).map(layer => layer.id), ['front', 'mid', 'back']);
  assert.deepEqual(stageRenderLayers(layers, settings({ enabled: false, yaw: 180 })).map(layer => layer.id), ['front', 'back', 'mid']);
  assert.deepEqual(stageLayerTransform(layers[0], settings({ enabled: false, yaw: 45 }), center), { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
});

test('angle rendering is non-destructive and survives JSON and undo/redo', () => {
  const demo = createStageDemo();
  const authored = JSON.stringify({ bones: demo.toProject().bones, layers: demo.toProject().layers, animations: demo.animations, bindings: [...demo.bindings.values()] });
  useProject.getState().replaceProject(demo.toProject(), false);
  const state = useProject.getState();
  state.updateProject(rig => rig.setStage2D({ yaw: -45, pitch: 25, roll: 10 }));
  assert.equal(state.rig.stage2d.yaw, -45);
  const after = state.rig.toProject();
  assert.equal(JSON.stringify({ bones: after.bones, layers: after.layers, animations: state.rig.animations, bindings: [...state.rig.bindings.values()] }), authored);
  const loaded = Rig.fromJSON(state.serialize());
  assert.deepEqual(loaded.stage2d, state.rig.stage2d);
  state.undo(); assert.equal(useProject.getState().rig.stage2d.yaw, 0);
  state.redo(); assert.equal(useProject.getState().rig.stage2d.yaw, -45);
});

test('canvas and SVG project vector, image, and mesh content with the same matrices', () => {
  const rig = new Rig();
  const vector = rig.addVectorLayer('Vector', [{ id: 'rect', kind: 'rect', width: 100, height: 100, fill: '#80cbbc' }]);
  const image = rig.addImage('Image');
  rig.layers.get(vector).depth = -120;
  rig.layers.get(image).depth = 90;
  assert.equal(rig.createMesh(image, 2, 2), true);
  rig.setStage2D({ enabled: true, yaw: 40, pitch: 25, roll: 15, perspective: 0.4 });
  const svg = projectToSVG(rig);
  for (const layer of rig.layers.values()) {
    const expected = stageLayerTransform(layer, rig.stage2d, center);
    const calls = [];
    applyStage2DTransform({ transform: (...args) => calls.push(args) }, layer, rig.stage2d, center);
    assert.deepEqual(calls, [[expected.a, expected.b, expected.c, expected.d, expected.e, expected.f]]);
    assert.ok(svg.includes(`data-stage-layer="${layer.id}" transform="matrix(${calls[0].join(' ')})"`));
  }
  assert.match(svg, /mesh-clip-/);
  assert.ok(svg.indexOf(`data-stage-layer="${vector}"`) < svg.indexOf(`data-stage-layer="${image}"`));
  rig.setStage2D({ enabled: false });
  assert.ok(!projectToSVG(rig).includes('data-stage-layer='));
  const calls = [];
  applyStage2DTransform({ transform: (...args) => calls.push(args) }, rig.layers.get(image), rig.stage2d, center);
  assert.deepEqual(calls, []);
});
