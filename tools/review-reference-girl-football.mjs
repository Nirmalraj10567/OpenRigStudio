import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { nativeRender } from '../mcp/native-renderer.mjs';
const root = process.cwd(), require = createRequire(`${root}/package.json`), { build } = require('esbuild');
const result = await build({ stdin: { contents: "export {createReferenceGirlFootballScene} from './src/engine/referenceGirlFootballScene'; export {Rig} from './src/engine/Rig';", resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} }; new Function('module', 'exports', 'require', result.outputFiles[0].text)(compiled, compiled.exports, require);
const { createReferenceGirlFootballScene, Rig } = compiled.exports;
const rig = createReferenceGirlFootballScene(), project = rig.toProject();
const baselineProject = structuredClone(project); baselineProject.dynamics.enabled = false;
await writeFile(`${root}/reference-girl-football.json`, JSON.stringify(project, null, 2));
const ballBody = rig.dynamics.bodies.find(body => body.name.includes('kicked dynamic'));
const ballLayer = rig.layers.get(ballBody.targetId);
const sample = [];
const baseline = new Rig(baselineProject);
for (const frame of [0, 8, 17, 24, 32, 48, 54, 58, 62, 66, 70, 72, 80, 96, 120]) {
  rig.applyAnimation(rig.timeline.activeAnimationId, frame);
  baseline.applyAnimation(baseline.timeline.activeAnimationId, frame);
  const ball = rig.physicsFrame?.bodies[ballBody.id];
  const skirt = rig.physicsFrame?.meshes[rig.dynamics.meshes[0].layerId];
  const baseSkirt = baseline.getMeshVertices(rig.dynamics.meshes[0].layerId);
  const hair = rig.dynamics.meshes.slice(1).map(mesh => ({ layerId: mesh.layerId, maxTravel: Math.max(...(rig.physicsFrame?.meshes[mesh.layerId] ?? []).map((point, index) => Math.hypot(point.x - baseline.getMeshVertices(mesh.layerId)[index].x, point.y - baseline.getMeshVertices(mesh.layerId)[index].y))) }));
  const chest = rig.dynamics.bones.map(dynamic => ({ id: dynamic.boneId, offset: rig.physicsFrame?.boneOffsets?.[dynamic.boneId] }));
  sample.push({ frame, ball, ballWorld: ballLayer.world, skirtTravel: skirt ? Math.max(...skirt.map((point, index) => Math.hypot(point.x - baseSkirt[index].x, point.y - baseSkirt[index].y))): 0, hair, chest });
}
const balls = sample.map(item => item.ball).filter(Boolean);
const skirtTravels = sample.map(item => item.skirtTravel), hairTravels = sample.flatMap(item => item.hair.map(hair => hair.maxTravel));
const chestTravel = sample.flatMap(item => item.chest.map(chest => Math.hypot(chest.offset?.x ?? 0, chest.offset?.y ?? 0)));
const verification = {
  ballHeldBeforeKick: balls.filter((_, index) => sample[index].frame < ballBody.launchFrame).every(ball => Math.hypot(ball.x - balls[0].x, ball.y - balls[0].y) < .01),
  ballLaunched: Math.max(...balls.map(ball => ball.x)) - balls[0].x > 150,
  ballBounced: sample.some((item, index) => index > 1 && item.ball.y < sample[index - 1].ball.y && sample[index - 1].ball.y > 450),
  ballStayedAboveGroundAfterContact: balls.every(ball => ball.y <= 469.01),
  dressMoved: Math.max(...skirtTravels) > 5,
  hairMovedInWind: Math.max(...hairTravels) > 2,
  chestJiggleMoved: Math.max(...chestTravel) > .5,
  allFinite: [...balls, ...skirtTravels, ...hairTravels, ...chestTravel].every(value => typeof value === 'number' ? Number.isFinite(value) : Object.values(value).every(Number.isFinite)),
};
await writeFile(`${root}/reference-girl-football-physics.json`, JSON.stringify({ ball: ballBody, verification, samples: sample }, null, 2));
console.log(JSON.stringify({ name: rig.name, bones: rig.bones.size, layers: rig.layers.size, clip: rig.animations[0].name, verification, bodies: rig.dynamics.bodies.map(body => ({ name: body.name, motion: body.motion, launchFrame: body.launchFrame })), meshes: rig.dynamics.meshes.map(mesh => ({ layerId: mesh.layerId, windScale: mesh.windScale, pinned: mesh.pinned.length })), sample }, null, 2));
const save = async (name, source, options) => { const output = await nativeRender(source, options); await writeFile(`${root}/${name}.png`, Buffer.from(output.data, 'base64')); };
await save('reference-girl-football-timeline', project, { kind: 'timeline', frames: [0, 8, 17, 24, 32, 48, 54, 58, 62, 66, 70, 72, 80, 96, 120], columns: 3, cellWidth: 420 });
const close = structuredClone(project); close.canvas = { width: 420, height: 320, background: '#8fc58b' }; close.stage2d = { ...close.stage2d, enabled: true, zoom: 1.8, cameraX: -220, cameraY: -115, projection: 'orthographic' };
await save('reference-girl-football-close', close, { kind: 'timeline', frames: [0, 8, 17, 24, 32, 48, 72, 96], columns: 4, cellWidth: 420 });
await save('reference-girl-football-frame-24', project, { kind: 'frame', frame: 24 });
const video = await nativeRender(project, { kind: 'video', format: 'webm' });
await writeFile(`${root}/reference-girl-football.webm`, Buffer.from(video.data, 'base64'));
