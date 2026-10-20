import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({ stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, defaultCamera3D, normalizeCamera3D, normalizeStage2DSettings, project3DPoint, depthOfFieldBlur, extrudePolygon, inflatePolygon, latheProfile, parseOBJ, generateLayer3D, addCamera, captureCameraBookmark, applyCameraBookmark, addCameraTransitionPreset, setDefaultCameraTransition, recordCameraCutPreset, activeCameraId, projectToSVG, createCameraPath, addCameraRig, recordCameraRig, triggerLiveCamera, updateLiveCamera, updateCameraControls } = compiled.exports;
const close = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);

function cameraRig() {
  const rig = new Rig();
  const layer = rig.addVectorLayer('Card', [{ id: 'card', kind: 'rect', x: -60, y: -40, width: 120, height: 80, fill: '#74c8d7' }]);
  rig.layers.get(layer).local = { x: 400, y: 260, rotation: 0, scaleX: 1, scaleY: 1 };
  const camera = addCamera(rig, 'Wide'); rig.cameraView = camera; rig.update();
  return { rig, layer, camera };
}

test('physical camera normalization preserves legacy defaults and bounds optical controls', () => {
  const camera = normalizeCamera3D({ enabled: true, focalLength: 9999, sensorWidth: 0, near: -1, far: 1, aperture: -4, fStop: 0, position: { z: 800 } });
  assert.equal(camera.enabled, true); assert.equal(camera.focalLength, 400); assert.equal(camera.sensorWidth, 10); assert.equal(camera.near, .01); assert.equal(camera.far, 10); assert.equal(camera.aperture, 0); assert.equal(camera.fStop, .1); assert.equal(camera.position.z, 800);
  const legacy = normalizeStage2DSettings({ enabled: true }); assert.equal(legacy.camera3d, undefined); assert.deepEqual(defaultCamera3D().position, { x: 0, y: 0, z: 900 });
});

test('perspective projection responds to depth and focal length; orthographic does not', () => {
  const camera = { ...defaultCamera3D(), enabled: true, position: { x: 0, y: 0, z: 900 } };
  const near = project3DPoint({ x: 100, y: 0, z: 700 }, camera, { width: 800, height: 520 });
  const far = project3DPoint({ x: 100, y: 0, z: 500 }, camera, { width: 800, height: 520 });
  assert.ok(near.x > far.x); assert.ok(near.scale > far.scale); assert.ok(near.depth < far.depth);
  const ortho = project3DPoint({ x: 100, y: 0, z: 700 }, { ...camera, projection: 'orthographic' }, { width: 800, height: 520 });
  close(ortho.x, 400 + 100 * 800 / 900); assert.equal(depthOfFieldBlur(900, { ...camera, depthOfField: true, aperture: 8, fStop: 2.8 }), 0); assert.ok(depthOfFieldBlur(400, { ...camera, depthOfField: true, aperture: 8, fStop: 2.8 }) > 0);
});

test('OBJ, extrusion, inflate, and lathe generators create bounded triangle meshes', () => {
  const obj = parseOBJ('v -1 -1 0\nv 1 -1 0\nv 1 1 0\nv -1 1 0\nf 1 2 3 4'); assert.equal(obj.vertices.length, 4); assert.equal(obj.triangles.length, 2);
  assert.throws(() => parseOBJ('v 0 0 0\nf 1 2 3'));
  const polygon = [{ x: -20, y: -20 }, { x: 20, y: -20 }, { x: 20, y: 20 }, { x: -20, y: 20 }];
  const extruded = extrudePolygon(polygon, 30), inflated = inflatePolygon(polygon, 30), lathed = latheProfile([{ x: 0, y: -20 }, { x: 24, y: 0 }, { x: 0, y: 20 }], 12);
  assert.equal(extruded.vertices.length, 8); assert.ok(extruded.triangles.length >= 12); assert.ok(inflated.vertices.length > extruded.vertices.length); assert.equal(lathed.lathe.segments, 12); assert.ok(lathed.triangles.length > 20);
});

test('3D layer transforms, generated geometry, shadows and SVG round-trip', () => {
  const { rig, layer } = cameraRig(); rig.cameraView = 'preview'; rig.setStage2D({ enabled: true, camera3d: { ...defaultCamera3D(), enabled: true, position: { x: 0, y: 0, z: 700 }, depthOfField: true, aperture: 8, focusDistance: 700 } });
  assert.equal(generateLayer3D(rig, layer, 'extrude', 24), true); rig.layers.get(layer).transform3d = { position: { x: 0, y: 0, z: -100 }, rotation: { x: 14, y: 25, z: 0 }, scale: { x: 1, y: 1, z: 1 } }; rig.update();
  const svg = projectToSVG(rig); assert.match(svg, /data-3d-layer/); assert.doesNotMatch(svg, /NaN|undefined/);
  const loaded = Rig.fromJSON(rig.toJSON()); assert.deepEqual(loaded.layers.get(layer).mesh3d.vertices, rig.layers.get(layer).mesh3d.vertices); assert.equal(loaded.stage2d.camera3d.enabled, true);
});

test('camera bookmarks, physical lens animation, transitions, hot switching and path keys persist', () => {
  const { rig, camera } = cameraRig(); const second = addCamera(rig, 'Close'); rig.setTimeline({ currentFrame: 0 }); const bookmark = captureCameraBookmark(rig, 'Wide bookmark'); assert.ok(bookmark);
  rig.setTimeline({ currentFrame: 12 }); rig.cameraView = camera; const cameraSettings = { ...defaultCamera3D(), enabled: true, focalLength: 85 }; updateCameraControls(rig, { camera3d: cameraSettings }, false); const cameraBookmark = captureCameraBookmark(rig, 'Physical lens'); assert.ok(cameraBookmark); assert.equal(applyCameraBookmark(rig, cameraBookmark), true); rig.cameraView = camera; rig.cameras.find(item => item.id === second).settings.camera3d = { ...cameraSettings, focalLength: 35 };
  const preset = addCameraTransitionPreset(rig, { name: 'Dissolve', kind: 'dissolve', duration: 12, easing: 'smooth' }); assert.equal(setDefaultCameraTransition(rig, preset), true);
  rig.setTimeline({ currentFrame: 24 }); recordCameraCutPreset(rig, second, preset); const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId); assert.ok(clip.tracks.some(track => track.property === 'cameraTransition'));
  rig.applyAnimation(clip, 30); assert.equal(activeCameraId(rig), second); assert.ok(rig.getStageView().camera3d);
  rig.cameraView = camera; assert.equal(createCameraPath(rig, camera, 10), false); rig.cameraProduction.bookmarks.push({ id: 'b2', name: 'Second', frame: 20, cameraId: camera, settings: rig.cameras[0].settings }); assert.equal(createCameraPath(rig, camera, 10), true);
  const rigId = addCameraRig(rig, camera); assert.ok(rigId); assert.equal(recordCameraRig(rig, rigId), true);
  triggerLiveCamera(rig, camera); rig.cameraProduction.liveControl.enabled = true; updateLiveCamera(rig, { x: 10, y: -5, zoom: .1 }); assert.equal(rig.liveCameraId, camera); assert.ok(rig.liveCameraPose);
  const loaded = Rig.fromJSON(rig.toJSON()); assert.equal(loaded.cameraProduction.bookmarks.length, rig.cameraProduction.bookmarks.length); assert.equal(loaded.cameraProduction.cameraRigs.length, 1);
});
