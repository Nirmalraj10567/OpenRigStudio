import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({ stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, identity, createLayerGroup, reparentLayerItem, reorderGroupChildren, setGroupIsolation, removeLayerGroup, keyGroupProperty, projectToSVG } = compiled.exports;

function groupRig() {
  const rig = new Rig();
  const back = rig.addVectorLayer('Back hair', [{ id: 'back', kind: 'ellipse', x: 0, y: 0, radiusX: 60, radiusY: 70, fill: '#294b5a' }]);
  const face = rig.addVectorLayer('Face', [{ id: 'face', kind: 'ellipse', x: 0, y: 0, radiusX: 50, radiusY: 60, fill: '#ffbd71' }]);
  const mask = rig.addVectorLayer('Hair mask', [{ id: 'mask', kind: 'ellipse', x: 0, y: -30, radiusX: 45, radiusY: 25, fill: '#fff' }]);
  rig.layers.get(back).local = { ...identity(), x: 400, y: 260 };
  rig.layers.get(face).local = { ...identity(), x: 400, y: 260 };
  rig.layers.get(mask).local = { ...identity(), x: 400, y: 260 };
  rig.update();
  return { rig, back, face, mask };
}

test('nested groups inherit transforms, opacity, visibility, blend metadata and clipping', () => {
  const { rig, back, face, mask } = groupRig();
  const hair = createLayerGroup(rig, 'Hair', 'group');
  const head = createLayerGroup(rig, 'Head', 'group');
  assert.ok(hair && head);
  assert.equal(reparentLayerItem(rig, hair, head, false), true);
  assert.equal(reparentLayerItem(rig, back, hair), true);
  assert.equal(reparentLayerItem(rig, mask, hair), true);
  assert.equal(reparentLayerItem(rig, face, head), true);
  rig.groups.get(head).local = { ...identity(), x: 25, y: 15, scaleX: 1.2, scaleY: 1.2 };
  rig.groups.get(hair).opacity = .5;
  rig.groups.get(hair).blendMode = 'multiply';
  rig.groups.get(hair).clipLayerId = mask;
  rig.update();
  assert.ok(Math.abs(rig.layers.get(back).world.x - 505) < 1e-6);
  assert.equal(rig.getLayerOpacity(back), .5);
  assert.equal(rig.getLayerBlendMode(back), 'multiply');
  assert.equal(rig.getGroupClipLayers(back).some(layer => layer.id === mask), true);
  rig.groups.get(hair).visible = false; rig.update();
  assert.equal(rig.getRenderLayer(back).visible, false);
  rig.groups.get(hair).visible = true; rig.isolatedGroupId = head; rig.update();
  assert.equal(rig.getRenderLayer(back).visible, true);
  assert.equal(rig.getRenderLayer(face).visible, true);
  const svg = projectToSVG(rig);
  assert.match(svg, /clipPath/);
  assert.match(svg, /mix-blend-mode:multiply/);
});

test('switch groups show one child and isolation survives nested layer ordering', () => {
  const { rig, back, face } = groupRig();
  const switchId = createLayerGroup(rig, 'Head drawings', 'switch');
  assert.ok(switchId);
  assert.equal(reparentLayerItem(rig, back, switchId), true);
  assert.equal(reparentLayerItem(rig, face, switchId), true);
  const group = rig.groups.get(switchId);
  group.activeChildId = back; rig.update();
  assert.equal(rig.getRenderLayer(back).visible, true);
  assert.equal(rig.getRenderLayer(face).visible, false);
  group.activeChildId = face; rig.update();
  assert.equal(rig.getRenderLayer(back).visible, false);
  assert.equal(rig.getRenderLayer(face).visible, true);
  assert.equal(setGroupIsolation(rig, switchId), true);
  assert.equal(rig.isolatedGroupId, switchId);
  assert.equal(setGroupIsolation(rig, null), true);
});

test('group order keyframes and JSON persistence retain hierarchy', () => {
  const { rig, back, face } = groupRig();
  const groupId = createLayerGroup(rig, 'Order group', 'group');
  assert.ok(groupId);
  reparentLayerItem(rig, back, groupId); reparentLayerItem(rig, face, groupId);
  const group = rig.groups.get(groupId);
  assert.equal(reorderGroupChildren(rig, groupId, [face, back], true), true);
  rig.setTimeline({ currentFrame: 12 });
  assert.equal(reorderGroupChildren(rig, groupId, [back, face], true), true);
  const clip = rig.animations.find(animation => animation.id === rig.timeline.activeAnimationId);
  assert.equal(clip.tracks.some(track => track.targetId === groupId && track.property === 'layerOrder'), true);
  const restored = Rig.fromJSON(rig.toJSON());
  assert.equal(restored.groups.get(groupId).childIds.length, 2);
  assert.equal(restored.layers.get(face).parentGroupId, groupId);
  assert.equal(restored.animations.some(animation => animation.tracks.some(track => track.targetId === groupId && track.property === 'layerOrder')), true);
  assert.equal(removeLayerGroup(restored, groupId, false), true);
  assert.equal(restored.layers.get(back).parentGroupId, null);
});

test('reparenting a leaf preserves its evaluated pose under a transformed group', () => {
  const { rig, back } = groupRig();
  const groupId = createLayerGroup(rig, 'Offset group', 'group');
  rig.groups.get(groupId).local = { ...identity(), x: 75, y: -20, rotation: 0.1, scaleX: 1.1, scaleY: 0.9 };
  rig.update();
  const before = { ...rig.layers.get(back).world };
  assert.equal(reparentLayerItem(rig, back, groupId), true);
  assert.ok(Math.abs(rig.layers.get(back).world.x - before.x) < 1e-6);
  assert.ok(Math.abs(rig.layers.get(back).world.y - before.y) < 1e-6);
  assert.ok(Math.abs(rig.layers.get(back).world.rotation - before.rotation) < 1e-6);
});

test('group opacity, visibility, switch child and order tracks evaluate on the timeline', () => {
  const { rig, back, face } = groupRig();
  const groupId = createLayerGroup(rig, 'Animated group', 'switch');
  reparentLayerItem(rig, back, groupId, false); reparentLayerItem(rig, face, groupId, false);
  const group = rig.groups.get(groupId);
  keyGroupProperty(rig, groupId, 'opacity', 1);
  keyGroupProperty(rig, groupId, 'visible', true);
  keyGroupProperty(rig, groupId, 'switchChild', back);
  keyGroupProperty(rig, groupId, 'layerOrder', [back, face]);
  rig.setTimeline({ currentFrame: 12 });
  keyGroupProperty(rig, groupId, 'opacity', .4);
  keyGroupProperty(rig, groupId, 'visible', false);
  keyGroupProperty(rig, groupId, 'switchChild', face);
  keyGroupProperty(rig, groupId, 'layerOrder', [face, back]);
  const clip = rig.animations[0];
  rig.applyAnimation(clip, 6);
  assert.ok(Math.abs(rig.getLayerOpacity(back) - .7) < 1e-6);
  assert.equal(rig.getRenderLayer(back).visible, true);
  assert.equal(rig.getRenderLayer(face).visible, false);
  rig.applyAnimation(clip, 12);
  assert.equal(rig.getRenderLayer(back).visible, false);
  assert.equal(rig.getRenderLayer(face).visible, false);
  assert.equal(group.activeChildId, face);
  assert.deepEqual(group.childIds, [face, back]);
});
