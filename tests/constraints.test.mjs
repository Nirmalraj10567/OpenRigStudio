import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({ stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const {
  Rig, identity, createConstraint, updateConstraint, recordConstraintKey, boneInfluenceWeight,
} = compiled.exports;

function constraintRig() {
  const rig = new Rig();
  const root = rig.addBone(null, 'Root', 100);
  const child = rig.addBone(root, 'Child', 100);
  const target = rig.addBone(null, 'Target', 40);
  rig.bones.get(root).local = { ...identity(), x: 100, y: 200 };
  rig.bones.get(child).local = { ...identity(), x: 100, y: 0 };
  rig.bones.get(target).local = { ...identity(), x: 300, y: 200 };
  rig.update();
  return { rig, root, child, target };
}

test('angle, translation, scale, distance and pin constraints solve non-destructively', () => {
  const { rig, root, child } = constraintRig();
  const authoredChild = { ...rig.bones.get(child).local };
  const angle = createConstraint(rig, 'angle', child);
  updateConstraint(rig, angle, { minAngle: -15, maxAngle: 15 });
  rig.bones.get(child).local.rotation = Math.PI / 2;
  rig.update();
  assert.ok(Math.abs(rig.bones.get(child).world.rotation - rig.bones.get(root).world.rotation - 15 * Math.PI / 180) < 1e-6);
  assert.deepEqual(rig.bones.get(child).local, { ...authoredChild, rotation: Math.PI / 2 });

  const translation = createConstraint(rig, 'translation', root);
  updateConstraint(rig, translation, { minX: 110, maxX: 120, minY: 190, maxY: 210 });
  rig.update();
  assert.equal(rig.bones.get(root).world.x, 110);

  const scale = createConstraint(rig, 'scale', root);
  updateConstraint(rig, scale, { minScaleX: .5, maxScaleX: 1.25, minScaleY: .5, maxScaleY: 1.25 });
  rig.bones.get(root).local.scaleX = 2;
  rig.update();
  assert.equal(rig.bones.get(root).world.scaleX, 1.25);

  const pin = createConstraint(rig, 'pin', child);
  updateConstraint(rig, pin, { pinX: 150, pinY: 250 });
  rig.update();
  assert.ok(Math.hypot(rig.bones.get(child).world.x - 150, rig.bones.get(child).world.y - 250) < 1e-5);
});

test('target, parent blend, direction and squash/stretch constraints support dependencies', () => {
  const { rig, root, child, target } = constraintRig();
  const aim = createConstraint(rig, 'target', root, target);
  updateConstraint(rig, aim, { targetMode: 'aim' });
  rig.update();
  assert.ok(Math.abs(rig.bones.get(root).world.rotation) < 1e-6);

  rig.bones.get(target).local = { ...rig.bones.get(target).local, x: 100, y: 300 };
  rig.update();
  assert.ok(Math.abs(rig.bones.get(root).world.rotation - Math.PI / 2) < 1e-6);

  const parent = createConstraint(rig, 'parent', child, target);
  updateConstraint(rig, parent, { parentInfluence: .5 });
  rig.update();
  assert.ok(Number.isFinite(rig.bones.get(child).world.x));

  const stretch = createConstraint(rig, 'squashStretch', root, target);
  updateConstraint(rig, stretch, { minStretch: .5, maxStretch: 2 });
  rig.update();
  assert.ok(rig.bones.get(root).world.scaleX >= .5 && rig.bones.get(root).world.scaleX <= 2);
});

test('constraint keyframes are editable, interpolate weight, and survive JSON round-trip', () => {
  const { rig, root } = constraintRig();
  const id = createConstraint(rig, 'angle', root);
  updateConstraint(rig, id, { minAngle: -10, maxAngle: 10, weight: 1 });
  assert.equal(recordConstraintKey(rig, id, 0), true);
  updateConstraint(rig, id, { weight: 0 });
  assert.equal(recordConstraintKey(rig, id, 24), true);
  const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  assert.equal(clip.tracks.find(track => track.targetId === id && track.property === 'constraint').keyframes.length, 2);
  const restored = Rig.fromJSON(rig.toJSON());
  assert.equal(restored.constraints[0].keyframes.length, 0);
  assert.equal(restored.animations[0].tracks.some(track => track.targetId === id && track.property === 'constraint'), true);
  restored.setTimeline({ currentFrame: 12 });
  restored.update();
  assert.ok(restored.constraintDebug.length > 0);
});

test('bone influence falloff is bounded and changes generated weight curves', () => {
  assert.equal(boneInfluenceWeight(0, { radius: 100, falloff: 2, strength: 1 }), 1);
  assert.equal(boneInfluenceWeight(10000, { radius: 100, falloff: 2, strength: 1 }), 0);
  assert.ok(boneInfluenceWeight(2500, { radius: 100, falloff: 1, strength: 1 }) > boneInfluenceWeight(2500, { radius: 100, falloff: 4, strength: 1 }));
});
