import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const { outputFiles } = await build({ stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, createReferenceGirlFootballScene, projectToSVG } = compiled.exports;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('football scene is editable and contains a kick clip, field, dynamic ball, contact, and floor', () => {
  const rig = createReferenceGirlFootballScene();
  assert.equal(rig.name, 'Reference girl · football kick · dress, hair & chest physics');
  assert.equal(rig.bones.size, 50);
  assert.ok(rig.layers.has([...rig.layers.values()].find(layer => layer.name === 'Football · dynamic ball').id));
  assert.equal(rig.animations.length, 1);
  assert.match(rig.animations[0].name, /Football kick/);
  assert.equal(rig.dynamics.bodies.filter(body => body.motion === 'dynamic').length, 1);
  assert.equal(rig.dynamics.bodies.filter(body => body.motion === 'static').length, 1);
  assert.ok(rig.dynamics.bodies.some(body => body.motion === 'kinematic' && /kick contact/.test(body.name)));
  assert.equal(rig.dynamics.bodies.find(body => body.motion === 'dynamic').launchFrame, 24);
  assert.equal(rig.dynamics.meshes.length, 3);
  assert.ok(rig.dynamics.meshes.filter(mesh => mesh.windScale > .9).length >= 2);
  assert.ok(projectToSVG(rig).includes('Football'));
});

test('kick launches, bounces, and stays inside the grass floor while cloth, hair, and chest respond', () => {
  const rig = createReferenceGirlFootballScene(), clip = rig.animations[0], ballBody = rig.dynamics.bodies.find(body => body.motion === 'dynamic');
  const ballLayer = rig.layers.get(ballBody.targetId), baseProject = rig.toProject(); baseProject.dynamics.enabled = false; const base = new Rig(baseProject);
  const observations = [];
  for (let frame = 0; frame <= 120; frame += 4) {
    rig.applyAnimation(clip.id, frame); base.applyAnimation(clip.id, frame);
    const ball = rig.physicsFrame.bodies[ballBody.id], baseBall = base.layers.get(ballLayer.id).world;
    const skirt = rig.physicsFrame.meshes[rig.dynamics.meshes[0].layerId], baseSkirt = base.getMeshVertices(rig.dynamics.meshes[0].layerId);
    const hairTravel = rig.dynamics.meshes.slice(1).flatMap(mesh => rig.physicsFrame.meshes[mesh.layerId].map((point, index) => distance(point, base.getMeshVertices(mesh.layerId)[index])));
    const chestTravel = rig.dynamics.bones.map(item => Math.hypot(rig.physicsFrame.boneOffsets[item.boneId].x, rig.physicsFrame.boneOffsets[item.boneId].y));
    observations.push({ frame, ball, ballDelta: distance(ball, baseBall), skirtTravel: Math.max(...skirt.map((point, i) => distance(point, baseSkirt[i]))), hairTravel: Math.max(...hairTravel), chestTravel: Math.max(...chestTravel) });
    assert.ok(Number.isFinite(ball.x + ball.y));
    assert.ok(ball.y <= 469.01, `ball crossed floor at ${frame}: ${ball.y}`);
  }
  const before = observations.filter(item => item.frame < ballBody.launchFrame);
  assert.ok(before.every(item => item.ballDelta < .01));
  assert.ok(Math.max(...observations.map(item => item.ball.x)) - observations[0].ball.x > 150);
  const descending = observations.some((item, index) => index > 0 && item.ball.y > observations[index - 1].ball.y);
  const rebound = observations.some((item, index) => index > 1 && item.ball.y < observations[index - 1].ball.y && observations[index - 1].ball.y > 450);
  assert.ok(descending && rebound, 'ball did not show a flight and rebound');
  assert.ok(Math.max(...observations.map(item => item.skirtTravel)) > 5);
  assert.ok(Math.max(...observations.map(item => item.hairTravel)) > 2);
  assert.ok(Math.max(...observations.map(item => item.chestTravel)) > .5);
  rig.applyAnimation(clip.id, 48); const reopened = Rig.fromJSON(rig.toJSON()); reopened.applyAnimation(clip.id, 48);
  assert.equal(projectToSVG(reopened), projectToSVG(rig));
});
