import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({ stdin: { contents: "export * from './src/engine/index'; export {useProject} from './src/state/projectStore';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, createFrogCarScene, videoRenderPlan, videoFrameAt, videoAudioWindow, renderProjectVideo, activeCameraId, projectToSVG, useProject } = compiled.exports;
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const fixture = { timeline: { fps: 24, startFrame: 0, endFrame: 240 }, canvas: { width: 800, height: 520 } };

test('video frame plan renders exact duration and resamples FPS without changing playback speed', () => {
  const normal = videoRenderPlan(fixture); assert.equal(normal.frames, 240); assert.equal(normal.duration, 10);
  assert.deepEqual(videoFrameAt(normal, 0), { frame: 0, timestamp: 0, duration: 1 / 24 });
  const higher = videoRenderPlan(fixture, { fps: 30, scale: 2 }); assert.equal(higher.frames, 300); assert.equal(higher.duration, 10); assert.equal(higher.width, 1600); assert.equal(higher.height, 1040);
  near(videoFrameAt(higher, 150).frame, 120); near(videoFrameAt(higher, 299).frame, 239.2);
});

test('trimmed export rebases timestamps and keeps the final partial frame inside its time range', () => {
  const plan = videoRenderPlan(fixture, { startFrame: 12, endFrame: 235, fps: 30 });
  assert.equal(plan.frames, 279); near(videoFrameAt(plan, 0).frame, 12);
  const last = videoFrameAt(plan, plan.frames - 1); assert.ok(last.frame < 235); near(last.timestamp + last.duration, plan.duration); assert.ok(last.duration < 1 / 30);
});

test('invalid render settings fail before allocating an encoder or producing empty output', () => {
  for (const options of [{ fps: 0 }, { fps: Infinity }, { endFrame: 0 }, { startFrame: -1 }, { startFrame: 240 }, { scale: 0 }, { endFrame: 10_000_000 }]) assert.throws(() => videoRenderPlan(fixture, options));
  assert.throws(() => videoFrameAt(videoRenderPlan(fixture), 240));
});

test('audio trimming accounts for delayed start, partial overlap, decoded duration, mute, and gain', () => {
  const audio = { duration: 5, offsetSeconds: 3, muted: false, volume: .8 };
  const plan = videoRenderPlan(fixture, { startFrame: 48, endFrame: 240 });
  assert.deepEqual(videoAudioWindow(audio, plan), { sourceOffset: 0, outputOffset: 1, duration: 5, volume: .8 });
  const later = videoRenderPlan(fixture, { startFrame: 120, endFrame: 240 });
  assert.deepEqual(videoAudioWindow(audio, later), { sourceOffset: 2, outputOffset: 0, duration: 3, volume: .8 });
  assert.equal(videoAudioWindow({ ...audio, muted: true }, plan), null); assert.equal(videoAudioWindow({ ...audio, volume: 0 }, plan), null);
  assert.equal(videoAudioWindow(audio, videoRenderPlan(fixture, { startFrame: 216 })), null);
  assert.equal(videoAudioWindow(audio, later, 1), null);
});

test('frog car scene opens as ordinary project data with complete actors, camera cuts, and local soundtrack', () => {
  const rig = createFrogCarScene();
  assert.equal(rig.timeline.endFrame, 240); assert.equal(rig.timeline.fps, 24); assert.equal(rig.timeline.loop, false);
  assert.equal(rig.characterViews[0].views.length, 8); assert.equal(rig.cameras.length, 3); assert.equal(rig.cameraView, 'switch');
  assert.equal(rig.bones.get(rig.metadata.frogRootId).parentId, rig.metadata.chassisId);
  assert.match(rig.audio.src, /^data:audio\/wav;base64,/); assert.equal(rig.audio.duration, 10);
  const wave = Buffer.from(rig.audio.src.split(',')[1], 'base64'); assert.equal(wave.toString('ascii', 0, 4), 'RIFF'); assert.equal(wave.toString('ascii', 8, 12), 'WAVE'); assert.equal(wave.readUInt32LE(24), 16000); assert.equal(wave.length, 44 + 16000 * 10 * 2);
  assert.ok(rig.audio.peaks.some(peak => peak > .05));
  rig.applyAnimation(rig.timeline.activeAnimationId, 0); const wide = activeCameraId(rig);
  rig.applyAnimation(rig.timeline.activeAnimationId, 72); const drive = activeCameraId(rig); assert.notEqual(drive, wide);
  rig.applyAnimation(rig.timeline.activeAnimationId, 216); assert.notEqual(activeCameraId(rig), drive);
});

test('frog boards through an animated door and remains seated relative to the moving chassis', () => {
  const rig = createFrogCarScene(), root = rig.bones.get(rig.metadata.frogRootId), car = rig.bones.get(rig.metadata.chassisId);
  const door = [...rig.bones.values()].find(bone => bone.name === 'Car door · hinge');
  rig.applyAnimation(rig.timeline.activeAnimationId, 0); near(root.world.x - car.world.x, -240); near(door.local.scaleX, 1);
  rig.applyAnimation(rig.timeline.activeAnimationId, 32); assert.ok(door.local.scaleX < .3); assert.ok(root.world.y - car.world.y < 40);
  const driver = [...rig.bones.values()].find(bone => bone.name === 'Moss · Right front palm');
  for (const frame of [120, 160, 190]) {
    rig.applyAnimation(rig.timeline.activeAnimationId, frame); near(root.world.x - car.world.x, -20); near(root.world.y - car.world.y, -40); near(door.local.scaleX, 1);
    const hand = rig.getBoneEnd(driver.id); near(hand.x, car.world.x + 15, .001); near(hand.y, car.world.y - 35, .001);
  }
});

test('continuous wheel animation completes full rotations and ordinary pose keying preserves its spin channel', () => {
  const rig = createFrogCarScene(), wheel = [...rig.bones.values()].find(bone => bone.name === 'Wheel FL');
  rig.applyAnimation(rig.timeline.activeAnimationId, 120); const first = wheel.local.rotation; assert.ok(first > Math.PI * 2);
  rig.applyAnimation(rig.timeline.activeAnimationId, 121); assert.ok(wheel.local.rotation > first);
  rig.cameraView = 'preview'; rig.setStage2D({ enabled: false }); useProject.getState().replaceProject(rig.toProject(), false);
  const state = useProject.getState(); state.setFrame(120); const value = state.rig.bones.get(wheel.id).local.rotation + .3;
  state.updateProject(project => { project.bones.get(wheel.id).local.rotation = value; }); state.setFrame(120);
  near(state.rig.bones.get(wheel.id).local.rotation, value);
});

test('scene playback and JSON/SVG round-trip retain boarding, driver pose, and final camera composition', () => {
  const rig = createFrogCarScene(); rig.applyAnimation(rig.timeline.activeAnimationId, 0); const opening = projectToSVG(rig);
  rig.applyAnimation(rig.timeline.activeAnimationId, 140); const riding = projectToSVG(rig); assert.notEqual(riding, opening);
  const restored = Rig.fromJSON(rig.toJSON()); assert.equal(projectToSVG(restored), riding); assert.deepEqual(restored.characterViews, rig.characterViews);
  rig.applyAnimation(rig.timeline.activeAnimationId, 0); assert.equal(projectToSVG(rig), opening);
});

test('video export cancellation and missing browser encoding leave the source project untouched', async () => {
  const rig = new Rig(), original = rig.toJSON();
  await assert.rejects(renderProjectVideo(rig), /WebCodecs/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(renderProjectVideo(rig, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(rig.toJSON(), original);
});
