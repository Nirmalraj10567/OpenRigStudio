import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { test } from 'node:test';
import { validateScene } from '../mcp/scene-kit/validate.mjs';

const workspace = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { outputFiles } = await build({ stdin: { contents: "export { Rig } from './src/engine/Rig'; export { projectToSVG } from './src/engine/export';", resolveDir: workspace }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, projectToSVG } = compiled.exports;

test('MCP showroom reference recreation has a five-second camera zoom, visitor fall, furniture, and deterministic seeking', async () => {
  const project = JSON.parse(await readFile(`${workspace}/reference-showroom-scene.json`, 'utf8'));
  const rig = new Rig(project), clip = project.animations[0];
  assert.equal(project.metadata.sceneKitVersion, '1');
  assert.equal(project.timeline.endFrame / project.timeline.fps, 5);
  assert.ok(project.layers.some(layer => layer.id === 'bed-front'));
  assert.ok(project.layers.some(layer => layer.id === 'purple-sofa'));
  assert.ok(project.layers.some(layer => layer.id === 'sofa-information'));
  assert.ok(project.layers.some(layer => layer.id === 'actor-pants-waist'));
  assert.ok(project.layers.some(layer => layer.id === 'near-arm-hand'));
  assert.ok(project.layers.some(layer => layer.id === 'near-leg-shoe'));
  assert.equal(project.bones.length, 17);
  assert.equal(project.animations[0].tracks.length, 19);
  assert.deepEqual((await validateScene(project)).errors, []);
  rig.applyAnimation(clip.id, 0);
  const wide = { camera: { ...rig.bones.get('shot').world }, visitor: { ...rig.bones.get('actor').world }, svg: projectToSVG(rig) };
  rig.applyAnimation(clip.id, 72);
  const action = { visitor: { ...rig.bones.get('actor').world }, svg: projectToSVG(rig) };
  rig.applyAnimation(clip.id, 120);
  const close = { camera: { ...rig.bones.get('shot').world }, visitor: { ...rig.bones.get('actor').world }, svg: projectToSVG(rig) };
  assert.ok(close.camera.scaleX > wide.camera.scaleX * 1.3, 'camera should zoom into the close-up');
  assert.ok(close.visitor.rotation > action.visitor.rotation + .3, 'visitor should fall forward');
  assert.notEqual(wide.svg, close.svg);
  rig.applyAnimation(clip.id, 0); rig.applyAnimation(clip.id, 120); assert.equal(projectToSVG(rig), close.svg, 'showroom seeking must be deterministic');
  assert.doesNotMatch(close.svg, /NaN|Infinity/);
});

test('corrected showroom deliverable is native vector/bone animation, not a copied image plate', async () => {
  const workspace = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
  const project = JSON.parse(await readFile(`${workspace}/reference-showroom-rigged-animation.json`, 'utf8'));
  assert.equal(project.metadata.exactReferencePlate, undefined);
  assert.equal(project.layers.some(layer => layer.type === 'image'), false);
  assert.equal(project.bones.length, 17);
  assert.equal(project.animations[0].tracks.length, 19);
  assert.ok(project.animations[0].tracks.some(track => track.targetId === 'near-leg-upper'));
  assert.ok(project.animations[0].tracks.some(track => track.targetId === 'shot'));
  assert.ok(project.animations[0].tracks.some(track => track.targetId === 'near-arm-lower'));
});
