import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { build3DCarSceneProject } from '../mcp/plugins/horror-palace-story.mjs';

const { outputFiles } = await build({
  stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external'
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, projectToSVG, resolveCameraView } = compiled.exports;

test('build3DCarSceneProject generates a complete True 3D car scene with physical camera and 3D meshes', async () => {
  const project = await build3DCarSceneProject({ fps: 24, duration: 6, carColor: '#be123c' });

  assert.equal(project.schemaVersion, 1);
  assert.equal(project.stage2d.camera3d.enabled, true);
  assert.equal(typeof project.stage2d.camera3d.depthOfField, 'boolean');
  assert.equal(project.stage2d.camera3d.shadow.enabled, true);
  assert.equal(project.cameras.length, 3);
  assert.ok(project.layers.length >= 12);

  // Check 3D meshes on chassis and wheels
  const chassis = project.layers.find(l => l.id === 'layer-3d-car-chassis');
  assert.ok(chassis);
  assert.ok(chassis.mesh3d);
  assert.ok(chassis.mesh3d.vertices.length > 20);
  assert.ok(chassis.mesh3d.triangles.length > 20);

  const wheelFL = project.layers.find(l => l.id === 'layer-3d-wheel-fl');
  assert.ok(wheelFL);
  assert.ok(wheelFL.mesh3d);
  assert.equal(wheelFL.transform3d.position.z, 68);

  const wheelFR = project.layers.find(l => l.id === 'layer-3d-wheel-fr');
  assert.ok(wheelFR);
  assert.equal(wheelFR.transform3d.position.z, -68);

  // Check animation clip and tracks
  const clip = project.animations[0];
  assert.ok(clip);
  assert.equal(clip.fps, 24);
  assert.equal(clip.endFrame, 144);
  assert.ok(clip.tracks.some(t => t.property === 'camera3d'));
  assert.ok(clip.tracks.some(t => t.targetId === 'layer-3d-wheel-fl' && t.property === 'transform3d'));
  assert.ok(clip.tracks.some(t => t.targetId === 'layer-3d-car-chassis' && t.property === 'transform3d'));

  // Test round-trip with Rig.fromJSON and projectToSVG
  const rig = Rig.fromJSON(JSON.stringify(project));
  assert.equal(rig.layers.size, project.layers.length);
  assert.equal(rig.stage2d.camera3d.enabled, true);

  const svg = projectToSVG(rig);
  assert.match(svg, /data-3d-layer/);
  assert.match(svg, /filter/);
  assert.doesNotMatch(svg, /NaN|undefined/);

  // Check deterministic frame seeking
  rig.timeline.currentFrame = 72;
  rig.applyAnimation(clip, 72);
  const view = resolveCameraView(rig, rig.cameraView);
  assert.ok(Number.isFinite(view.camera3d.position.x));
  assert.ok(Number.isFinite(view.camera3d.position.y));
  assert.ok(Number.isFinite(view.camera3d.position.z));
});
