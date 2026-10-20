import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { buildCityPickupScene } from '../mcp/plugins/city-pickup-story.mjs';

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

test('buildCityPickupScene generates a 3D car, pretty girl in one-shoulder dress, handsome driver, and dialogue', async () => {
  const project = await buildCityPickupScene({ fps: 24, duration: 8 });

  assert.equal(project.schemaVersion, 1);
  assert.equal(project.stage2d.camera3d.enabled, true);
  assert.equal(project.cameras.length, 3);
  assert.ok(project.layers.length >= 20);

  // 1. Verify 3D Car & Wheels
  const chassis = project.layers.find(l => l.id === 'layer-3d-car-body');
  assert.ok(chassis, 'Car chassis layer must exist');
  assert.ok(chassis.mesh3d, 'Car chassis must have 3D mesh');
  assert.ok(chassis.mesh3d.vertices.length > 20);

  const wheelFL = project.layers.find(l => l.id === 'layer-wheel-fl');
  assert.ok(wheelFL, 'Wheel FL must exist');
  assert.ok(wheelFL.mesh3d, 'Wheel FL must have 3D mesh');

  const door = project.layers.find(l => l.id === 'layer-car-passenger-door');
  assert.ok(door, 'Opening passenger door layer must exist');
  assert.equal(door.boundBoneId, 'car-door-hinge');

  // 2. Verify Pretty Girl Elena (One-shoulder dress)
  const girlHead = project.layers.find(l => l.id === 'layer-girl-head');
  assert.ok(girlHead, 'Elena pretty head must exist');
  assert.equal(girlHead.boundBoneId, 'girl-head');

  const girlTorso = project.layers.find(l => l.id === 'layer-girl-torso');
  assert.ok(girlTorso, 'Elena one-shoulder torso must exist');
  assert.equal(girlTorso.boundBoneId, 'girl-torso');

  const girlArmL = project.layers.find(l => l.id === 'layer-girl-arm-left');
  assert.ok(girlArmL, 'Elena left arm must exist');

  // 3. Verify Handsome Driver Luke
  const driver = project.layers.find(l => l.id === 'layer-driver-luke');
  assert.ok(driver, 'Driver Luke layer must exist');
  assert.equal(driver.boundBoneId, 'driver-root');

  // 4. Verify Subtitles
  const subLuke = project.layers.find(l => l.id === 'layer-subtitle-luke');
  assert.ok(subLuke, 'Luke dialogue subtitle must exist');
  const subElena = project.layers.find(l => l.id === 'layer-subtitle-elena');
  assert.ok(subElena, 'Elena dialogue subtitle must exist');

  // 5. Verify Animation Clip & Tracks
  const clip = project.animations[0];
  assert.ok(clip);
  assert.equal(clip.fps, 24);
  assert.equal(clip.endFrame, 192);
  assert.ok(clip.tracks.some(t => t.targetId === 'car-root'));
  assert.ok(clip.tracks.some(t => t.targetId === 'car-door-hinge'));
  assert.ok(clip.tracks.some(t => t.targetId === 'girl-root'));
  assert.ok(clip.tracks.some(t => t.targetId === 'girl-head'));
  assert.ok(clip.tracks.some(t => t.targetId === 'girl-arm-left'));
  assert.ok(clip.tracks.some(t => t.targetId === 'driver-root'));
  assert.ok(clip.tracks.some(t => t.targetId === 'cam-arrival-wide'));

  // 6. Test round-trip with Rig.fromJSON and projectToSVG
  const rig = Rig.fromJSON(JSON.stringify(project));
  assert.equal(rig.layers.size, project.layers.length);
  assert.equal(rig.stage2d.camera3d.enabled, true);

  const svg = projectToSVG(rig);
  assert.match(svg, /data-3d-layer/);
  assert.doesNotMatch(svg, /NaN|undefined/);

  // Check deterministic frame seeking & animation evaluation
  rig.timeline.currentFrame = 125;
  rig.applyAnimation(clip, 125);
  const view1 = resolveCameraView(rig, rig.cameraView);
  assert.ok(Number.isFinite(view1.camera3d.position.x));
  assert.ok(Number.isFinite(view1.camera3d.position.y));
  assert.ok(Number.isFinite(view1.camera3d.position.z));
});
