import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({
  stdin: {
    contents: "export * from './src/engine/index'; export * from './src/engine/propsToolkit'; export { useProject } from './src/state/projectStore';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));

const {
  Rig,
  DEFAULT_HOUSE_PROP,
  DEFAULT_TREE_PROP,
  PROP_ANGLES,
  addDesignedProp,
  collidePhysicsPoint,
  createLayerGroup,
  createPropRig,
  localToWorldPoint,
  meshBounds,
  normalizePropDesign,
  physicsBodies,
  projectToSVG,
  useProject,
} = compiled.exports;

const viewSet = rig => rig.characterViews.find(set => set.name.includes('prepared views'));
const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
// Bounds of the evaluated artwork, including strokes and curve control hulls,
// transformed into stage space (not just bone origins or authored local bounds).
const worldBounds = layer => {
  const bounds = meshBounds(layer);
  assert.ok(bounds, `missing artwork: ${layer.name}`);
  const points = [
    { x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height }, { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ].map(point => localToWorldPoint(layer.world, point));
  return {
    minX: Math.min(...points.map(point => point.x)), maxX: Math.max(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)), maxY: Math.max(...points.map(point => point.y)),
  };
};
const allTargetShapes = rig => {
  const ids = [];
  rig.layers.forEach(layer => layer.type === 'vector' && layer.shapes.forEach(shape => ids.push(shape.id)));
  rig.characterViews.forEach(set => {
    Object.values(set.baseline).forEach(target => target.artwork?.type === 'vector' && target.artwork.shapes.forEach(shape => ids.push(shape.id)));
    set.views.forEach(view => Object.values(view.targets).forEach(target => target.artwork?.type === 'vector' && target.artwork.shapes.forEach(shape => ids.push(shape.id))));
  });
  return ids;
};

test('prop defaults and malformed design input normalize to safe kind/style/ranges', () => {
  assert.deepEqual(normalizePropDesign(null), DEFAULT_HOUSE_PROP);
  const normalized = normalizePropDesign({
    kind: 'tree', style: 'townhouse', name: `  ${'x'.repeat(200)}  `,
    primaryColor: '#12', secondaryColor: '#123456', detailColor: '#abcdef',
    size: 99, angle: 180, physics: 'wind', windStrength: -4, stiffness: 500, damping: 0,
  });
  assert.equal(normalized.kind, 'tree');
  assert.equal(normalized.style, 'oak');
  assert.equal(normalized.name.length, 80);
  assert.equal(normalized.primaryColor, DEFAULT_TREE_PROP.primaryColor);
  assert.equal(normalized.secondaryColor, '#123456');
  assert.equal(normalized.angle, -180);
  assert.equal(normalized.size, 1.4);
  assert.equal(normalized.windStrength, 0);
  assert.equal(normalized.stiffness, 120);
  assert.equal(normalized.damping, 1);
  assert.equal(normalizePropDesign({ kind: 'house', physics: 'wind' }).physics, 'collider');
});

test('all house/tree styles have eight authored, distinct vector views', () => {
  for (const design of [
    { ...DEFAULT_HOUSE_PROP, style: 'cottage', physics: 'none' },
    { ...DEFAULT_HOUSE_PROP, style: 'townhouse', physics: 'none' },
    { ...DEFAULT_TREE_PROP, style: 'oak', physics: 'none' },
    { ...DEFAULT_TREE_PROP, style: 'pine', physics: 'none' },
  ]) {
    const rig = createPropRig(design);
    const set = viewSet(rig);
    assert.ok(set);
    assert.deepEqual(set.views.map(view => view.angle), PROP_ANGLES.map(view => view.angle));
    const frames = PROP_ANGLES.map(({ angle }) => {
      rig.characterAngleOverrides.set(set.id, { frame: 0, angle });
      rig.setTimeline({ currentFrame: 0 });
      rig.update();
      return projectToSVG(rig);
    });
    assert.equal(new Set(frames).size, 8, `${design.kind}/${design.style} views collapsed`);
    assert.equal(new Set(allTargetShapes(rig)).size, allTargetShapes(rig).length, 'view shape IDs must be unique');
    assert.ok(set.views.every(view => Object.values(view.targets).every(target => target.artwork?.type === 'vector')));
  }
});

test('groups preserve back-to-front authored order and root binding moves the complete prop', () => {
  const rig = createPropRig({ ...DEFAULT_HOUSE_PROP, physics: 'none' });
  const result = addDesignedProp(rig, { ...DEFAULT_HOUSE_PROP, name: 'Second house', physics: 'none' }, { x: 180, y: 430 });
  const group = rig.groups.get(result.groupId);
  assert.ok(group);
  assert.equal(group.childIds.length, result.layerIds.length);
  assert.deepEqual(group.childIds, result.layerIds);
  assert.match(rig.layers.get(result.layerIds[0]).name, /Foundation/);
  assert.match(rig.layers.get(result.layerIds.at(-1)).name, /Details/);
  result.layerIds.forEach(id => {
    assert.equal(rig.layers.get(id).parentGroupId, result.groupId);
    assert.equal(rig.layers.get(id).boundBoneId, result.rootId);
  });
  const before = rig.layers.get(result.layerIds[1]).world.x;
  rig.bones.get(result.rootId).local.x += 55;
  rig.update();
  assert.equal(rig.layers.get(result.layerIds[1]).world.x, before + 55);
});

test('tree artwork is upright at the root and canopy joint in every prepared view and size', () => {
  for (const style of ['oak', 'pine']) for (const size of [.6, 1, 1.4]) {
    const rig = createPropRig({ ...DEFAULT_TREE_PROP, style, size, physics: 'none' });
    for (const { angle } of PROP_ANGLES) {
      viewSet(rig).angle = angle;
      rig.characterAngleOverrides.clear();
      rig.update();
      const trunk = rig.layersInOrder.find(layer => layer.name.includes('Trunk ·'));
      const canopy = rig.layersInOrder.find(layer => layer.name.includes('canopy · silhouette'));
      near(trunk.world.x, 400); near(trunk.world.y, 430);
      near(canopy.world.x, 400); near(canopy.world.y, 430 - 164 * size);
      const trunkBounds = worldBounds(trunk), canopyBounds = worldBounds(canopy);
      assert.ok(trunkBounds.minY < 430 - 160 * size, 'trunk must reach upward to the canopy');
      assert.ok(trunkBounds.maxY <= 432 && trunkBounds.maxY >= 430);
      assert.ok(trunkBounds.minX > 400 - 42 * size && trunkBounds.maxX < 400 + 42 * size, 'trunk must stay narrow and vertical');
      assert.ok(canopyBounds.minY < canopy.world.y - 75 * size);
      assert.ok(canopyBounds.minX < 400 && canopyBounds.maxX > 400);
      assert.ok(canopyBounds.minY > 0 && canopyBounds.maxY < 430);
    }
  }
});

test('house roofs stay above the walls and profile/rear views hide the front door', () => {
  for (const style of ['cottage', 'townhouse']) {
    const rig = createPropRig({ ...DEFAULT_HOUSE_PROP, style, physics: 'none' });
    for (const { angle } of PROP_ANGLES) {
      viewSet(rig).angle = angle;
      rig.characterAngleOverrides.clear();
      rig.update();
      const roof = rig.layersInOrder.find(layer => layer.name.includes('Roof ·'));
      assert.ok(worldBounds(roof).maxY < 330, 'pitched roof must not descend to the foundation');
      const entrance = rig.layersInOrder.find(layer => layer.name.includes('Door · front'));
      assert.ok(entrance, 'the front entrance must remain independently editable');
      assert.equal(entrance.visible, Math.abs(angle) < 90, `front door at ${angle}°`);
    }
  }
});

test('adding a prop appends without replacing existing animation, views, timeline, or dynamics settings', () => {
  const rig = new Rig();
  const existingLayer = rig.addVectorLayer('Existing artwork', [{ id: 'existing-shape', kind: 'rect', x: 0, y: 0, width: 20, height: 20, fill: '#ffffff' }]);
  const existingBone = rig.addBone(null, 'Existing bone', 20);
  const existingViewSet = compiled.exports.addCharacterViewSet(rig, 'Existing view', [existingLayer]);
  rig.animations = [{ id: 'old-animation', name: 'Old', fps: 24, startFrame: 0, endFrame: 48, tracks: [] }];
  rig.setTimeline({ currentFrame: 12, startFrame: 0, endFrame: 48, activeAnimationId: 'old-animation' });
  rig.dynamics.windX = 17;
  const before = rig.toProject();
  const result = addDesignedProp(rig, { ...DEFAULT_TREE_PROP, physics: 'none', name: 'Appended tree' });
  assert.ok(result.groupId);
  assert.equal(rig.layers.has(existingLayer), true);
  assert.equal(rig.bones.has(existingBone), true);
  assert.deepEqual(rig.animations, before.animations);
  assert.equal(rig.timeline.endFrame, 48);
  assert.equal(rig.timeline.currentFrame, 12);
  assert.equal(rig.dynamics.windX, 17);
  assert.deepEqual(rig.characterViews.find(set => set.id === existingViewSet), before.characterViews.find(set => set.id === existingViewSet));
});

test('native collider is attached to the root and survives JSON export/import', () => {
  const rig = createPropRig(DEFAULT_HOUSE_PROP);
  const result = addDesignedProp(rig, { ...DEFAULT_HOUSE_PROP, name: 'Collision house' });
  const body = physicsBodies(rig).find(item => item.id === result.physicsIds[0]);
  assert.ok(body);
  assert.equal(body.shape, 'box');
  assert.equal(body.motion, 'kinematic');
  assert.equal(body.targetId, result.rootId);
  const pushed = collidePhysicsPoint({ x: body.x, y: body.y }, body);
  assert.ok(Math.hypot(pushed.x - body.x, pushed.y - body.y) > 0);
  const restored = Rig.fromJSON(rig.toJSON());
  const restoredSet = viewSet(restored);
  assert.equal(restored.metadata.exportType, 'prop-studio-project');
  assert.deepEqual(JSON.parse(restored.metadata.propDesign), normalizePropDesign(DEFAULT_HOUSE_PROP));
  assert.equal(restoredSet.views.length, 8);
  assert.ok(physicsBodies(restored).some(item => item.id === body.id && item.shape === 'box'));
});

test('native wind displaces only the canopy, remains repeatable, and keeps the root anchored', () => {
  const rig = createPropRig({ ...DEFAULT_TREE_PROP, windStrength: 140, stiffness: 18, damping: 3 });
  const result = addDesignedProp(rig, { ...DEFAULT_TREE_PROP, name: 'Wind tree', physics: 'wind', windStrength: 140, stiffness: 18, damping: 3 }, { x: 270, y: 430 });
  const root = rig.bones.get(result.rootId);
  const canopyId = result.boneIds[1];
  const base = { ...rig.bones.get(canopyId).world };
  rig.setTimeline({ currentFrame: 48 });
  rig.update();
  const posed = { ...rig.bones.get(canopyId).world };
  const anchored = { ...root.world };
  assert.ok(Math.abs(posed.rotation - base.rotation) > 1e-4, 'wind should visibly move the canopy');
  assert.equal(anchored.x, 270);
  assert.equal(anchored.y, 430);
  const frame = structuredClone(rig.physicsFrame);
  rig.setTimeline({ currentFrame: 0 });
  rig.update();
  rig.setTimeline({ currentFrame: 48 });
  rig.update();
  assert.deepEqual(rig.physicsFrame, frame);
  const restored = Rig.fromJSON(rig.toJSON());
  restored.setTimeline({ currentFrame: 48 });
  restored.update();
  assert.deepEqual(restored.physicsFrame, frame);
});

test('appended recipes are keyed by group ID and wind controls use native scene-force scaling', () => {
  const fresh = new Rig();
  fresh.setTimeline({ startFrame: 6, endFrame: 66, fps: 30, currentFrame: 6 });
  const freshResult = addDesignedProp(fresh, { ...DEFAULT_TREE_PROP, physics: 'wind', windStrength: 120, name: 'Recipe tree' });
  const freshDynamic = fresh.dynamics.bones.find(item => item.id === freshResult.physicsIds[0]);
  assert.equal(fresh.dynamics.windX, 80);
  assert.equal(fresh.dynamics.startFrame, 6);
  assert.equal(fresh.dynamics.endFrame, 66);
  assert.equal(fresh.dynamics.fps, 30);
  assert.equal(freshDynamic.windScale, 1.5);
  assert.deepEqual(JSON.parse(fresh.metadata.propDesigns)[freshResult.groupId], normalizePropDesign({ ...DEFAULT_TREE_PROP, physics: 'wind', windStrength: 120, name: 'Recipe tree' }));
  assert.deepEqual(JSON.parse(fresh.metadata[`propDesign.${freshResult.groupId}`]), normalizePropDesign({ ...DEFAULT_TREE_PROP, physics: 'wind', windStrength: 120, name: 'Recipe tree' }));

  const existing = new Rig();
  existing.dynamics.enabled = true;
  existing.dynamics.windX = 35;
  existing.dynamics.windNoise = 2;
  existing.dynamics.startFrame = 2;
  existing.dynamics.endFrame = 42;
  existing.dynamics.fps = 18;
  const existingResult = addDesignedProp(existing, { ...DEFAULT_TREE_PROP, physics: 'wind', windStrength: 40, name: 'Reuse tree' });
  const existingDynamic = existing.dynamics.bones.find(item => item.id === existingResult.physicsIds[0]);
  assert.equal(existing.dynamics.windX, 35);
  assert.equal(existing.dynamics.windNoise, 2);
  assert.equal(existing.dynamics.startFrame, 2);
  assert.equal(existing.dynamics.endFrame, 42);
  assert.equal(existing.dynamics.fps, 18);
  assert.equal(existingDynamic.windScale, .5);
  assert.ok(existingResult.warnings.some(warning => /forces\/settings were reused/.test(warning)));
});

test('preflight failures occur before mutation for limits, Smart Edit, and baked animation', () => {
  const full = new Rig();
  for (let index = 0; index < 256; index += 1) assert.ok(createLayerGroup(full, `Group ${index}`));
  const before = full.toJSON();
  assert.throws(() => addDesignedProp(full, { ...DEFAULT_HOUSE_PROP, physics: 'none' }), /group limit/);
  assert.equal(full.toJSON(), before);

  const smart = new Rig();
  smart.smartEditingActionId = 'smart-edit';
  const smartBefore = smart.toJSON();
  assert.throws(() => addDesignedProp(smart, DEFAULT_TREE_PROP), /Smart Bone/);
  assert.equal(smart.toJSON(), smartBefore);

  const baked = new Rig();
  baked.animations = [{ id: 'baked', name: 'Baked', fps: 24, startFrame: 0, endFrame: 12, tracks: [], dynamicsBake: { sourceAnimationId: null, startFrame: 0, endFrame: 12, fps: 24, targetIds: [], meshIds: [] } }];
  baked.setTimeline({ activeAnimationId: 'baked' });
  const bakedBefore = baked.toJSON();
  assert.throws(() => addDesignedProp(baked, DEFAULT_HOUSE_PROP), /baked dynamics/);
  assert.equal(baked.toJSON(), bakedBefore);
  baked.setTimeline({ activeAnimationId: null });
  assert.doesNotThrow(() => addDesignedProp(baked, { ...DEFAULT_HOUSE_PROP, physics: 'none', name: 'Baked-safe prop' }));

  const disabledPhysics = new Rig();
  disabledPhysics.dynamics.bodies.push({ id: 'old-body', name: 'Old body', shape: 'box', motion: 'static', x: 0, y: 0, radius: 1, width: 10, height: 10, rotation: 0, mass: 1, restitution: 0, friction: .2, enabled: true });
  const disabledBefore = disabledPhysics.toJSON();
  assert.throws(() => addDesignedProp(disabledPhysics, DEFAULT_HOUSE_PROP), /existing dynamics are disabled/);
  assert.equal(disabledPhysics.toJSON(), disabledBefore);
});

test('the existing project store can wrap a prop append in one undo/redo transaction', () => {
  const store = useProject.getState();
  store.replaceProject(new Rig().toProject(), false);
  store.clearHistory();
  store.updateProject(rig => { addDesignedProp(rig, { ...DEFAULT_TREE_PROP, physics: 'none', name: 'Undo tree' }); });
  assert.equal(useProject.getState().canUndo(), true);
  assert.ok(useProject.getState().rig.groups.size > 0);
  useProject.getState().undo();
  assert.equal(useProject.getState().rig.groups.size, 0);
  useProject.getState().redo();
  assert.ok(useProject.getState().rig.groups.size > 0);
});
