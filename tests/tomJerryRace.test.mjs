import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const workspace = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { outputFiles } = await build({ stdin: { contents: "export { Rig } from './src/engine/Rig'; export { localToWorldPoint } from './src/engine/math';", resolveDir: workspace }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, localToWorldPoint } = compiled.exports;

test('MCP Tom and Jerry car race project has five seconds of deterministic car and wheel animation', async () => {
  const project = JSON.parse(await readFile(`${workspace}/tom-jerry-car-race.json`, 'utf8'));
  const rig = new Rig(project), clip = project.animations[0];
  assert.equal(project.metadata.story, 'tom_and_jerry_car_race');
  assert.equal(project.timeline.endFrame / project.timeline.fps, 5);
  assert.equal(clip.tracks.length, 10);
  assert.equal(project.bones.length, 6);
  const sample = frame => { rig.applyAnimation(clip.id, frame); return { tom: { ...rig.bones.get('tom-car-root').world }, jerry: { ...rig.bones.get('jerry-car-root').world }, wheel: rig.bones.get('tom-wheel-front').world.rotation, svg: rig.toJSON() }; };
  const start = sample(0), middle = sample(60), finish = sample(119);
  assert.ok(middle.tom.x > start.tom.x + 300);
  assert.ok(middle.jerry.x > start.jerry.x + 400);
  assert.ok(finish.tom.x > middle.tom.x);
  assert.ok(finish.jerry.x > middle.jerry.x);
  assert.ok(Math.abs(middle.wheel - start.wheel) > 10, 'wheels must spin');
  const driver = localToWorldPoint(rig.layers.get('tom-driver').world, { x: 0, y: -86 });
  assert.ok(Number.isFinite(driver.x) && Number.isFinite(driver.y));
  rig.applyAnimation(clip.id, 60); const repeat = rig.bones.get('tom-car-root').world;
  assert.deepEqual(repeat, middle.tom, 'animation seeking must be deterministic');
  assert.equal(rig.toProject().layers.length, 14);
});
