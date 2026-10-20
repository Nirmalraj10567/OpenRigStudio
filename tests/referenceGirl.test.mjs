import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({
  stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, createReferenceGirlDemo, projectToSVG, characterViewAngle, sampleCharacterView, setCharacterViewAngle, meshBounds } = compiled.exports;

test('reference girl is a native editable rig with eight authored angles', () => {
  const rig = createReferenceGirlDemo();
  const set = rig.characterViews[0];
  assert.equal(rig.bones.size, 50);
  assert.equal(set.views.length, 8);
  const art = [...rig.layers.values()].filter(layer => set.targetIds.includes(layer.id));
  assert.ok(art.every(layer => layer.type === 'vector'));
  assert.ok(art.every(layer => layer.boundBoneId || layer.mesh?.vertices.every(v => Object.values(v.weights).reduce((a, b) => a + b, 0) > .999)));
  assert.ok(!set.targetIds.includes([...rig.layers.values()].find(layer => /background/.test(layer.name)).id));
  const skirt = art.find(layer => layer.name.includes('floral wrap skirt'));
  assert.ok(skirt.mesh.vertices.length > 50);
  assert.ok(art.some(layer => layer.name.includes('Amber sunglasses')));
  assert.ok([...rig.bones.values()].every(bone => Number.isFinite(bone.world.x) && Number.isFinite(bone.world.y)));
  assert.equal(characterViewAngle(rig, set.id), 0);
  assert.equal(sampleCharacterView(set, -90).nearest.name, 'Side');
  assert.ok(!projectToSVG(rig).includes('<image'));
  // Guard the long reference proportions against the oversized head in v1.
  const hair = art.find(layer => /hairline/.test(layer.name));
  const bounds = meshBounds(hair);
  assert.ok(bounds.height < 90 && bounds.width < 75);
  const head = [...rig.bones.values()].find(bone => bone.name === 'Head');
  assert.ok(Math.abs(head.world.y - (24 + 83 * .75)) < 1e-6);
});

test('reference girl turn animation changes views without mutating authored setup', () => {
  const rig = createReferenceGirlDemo();
  rig.dynamics.enabled = false;
  const set = rig.characterViews[0];
  const setup = JSON.stringify({ bones: rig.toProject().bones, layers: rig.toProject().layers, bindings: rig.toProject().bindings });
  const frontSvg = projectToSVG(rig);
  const animation = rig.animations.find(clip => clip.name.includes('angle review'));
  assert.ok(animation);
  assert.equal(animation.endFrame, 144);
  assert.ok(animation.tracks.some(track => track.targetId === set.id && track.property === 'viewAngle'));
  rig.setTimeline({ activeAnimationId: animation.id });
  rig.applyAnimation(animation, 36);
  assert.equal(characterViewAngle(rig, set.id), -90);
  assert.ok(rig.getRenderLayer([...rig.layers.keys()].find(id => rig.layers.get(id).name.startsWith('Face'))).shapes.length > 0);
  assert.notEqual(projectToSVG(rig), frontSvg);
  assert.equal(JSON.stringify({ bones: rig.toProject().bones, layers: rig.toProject().layers, bindings: rig.toProject().bindings }), setup);
  const restored = Rig.fromJSON(rig.toJSON());
  restored.applyAnimation(restored.animations[0], 72);
  assert.equal(characterViewAngle(restored, restored.characterViews[0].id), -180);
  assert.equal(restored.characterViews[0].views.length, 8);
});

test('reference redraw has attached limb chains throughout turns and survives JSON at every angle', () => {
  const rig = createReferenceGirlDemo(); rig.dynamics.enabled = false;
  rig.setTimeline({ activeAnimationId: rig.animations.find(clip => clip.name.includes('angle review')).id });
  rig.applyAnimation(rig.timeline.activeAnimationId, 0);
  const restored = Rig.fromJSON(rig.toJSON());
  for (let frame = 0; frame <= 144; frame += 3) {
    for (const instance of [rig, restored]) {
      instance.applyAnimation(instance.timeline.activeAnimationId, frame);
      for (const bone of instance.bones.values()) {
        assert.ok(Object.values(bone.world).every(Number.isFinite));
        if (!bone.parentId || !/forearm|hand|shin|heel|Head|Neck|lower hem/.test(bone.name)) continue;
        const tip = instance.getBoneEnd(bone.parentId);
        assert.ok(Math.hypot(tip.x - bone.world.x, tip.y - bone.world.y) < 1e-6, `${bone.name} detached at ${frame}`);
      }
      for (const layer of instance.layers.values()) {
        if (layer.mesh) assert.ok(instance.getMeshVertices(layer.id).every(p => Number.isFinite(p.x + p.y)));
      }
    }
    assert.equal(projectToSVG(restored), projectToSVG(rig));
  }
});

test('arms remain poseable in front and profile; skirt hem deforms independently', () => {
  for (const angle of [0, -90, 90, -180]) {
    const rig = createReferenceGirlDemo();
    rig.dynamics.enabled = false; rig.update();
    setCharacterViewAngle(rig, rig.characterViews[0].id, angle, false);
    const forearm = [...rig.bones.values()].find(b => b.name === 'Left forearm');
    const hand = [...rig.bones.values()].find(b => b.name === 'Left hand');
    const before = { ...hand.world };
    assert.ok(rig.rotateBoneTo(forearm.id, { x: forearm.world.x - 30, y: forearm.world.y + 30 }));
    assert.ok(Math.hypot(before.x - hand.world.x, before.y - hand.world.y) > 1);
    const elbow = rig.getBoneEnd(forearm.id);
    assert.ok(Math.hypot(elbow.x - hand.world.x, elbow.y - hand.world.y) < 1e-6);
    const skirt = [...rig.layers.values()].find(l => l.name.startsWith('Coral floral'));
    const vertices = rig.getMeshVertices(skirt.id);
    const hem = [...rig.bones.values()].find(b => b.name === 'Skirt · lower hem');
    assert.ok(rig.rotateBoneTo(hem.id, { x: hem.world.x + 12, y: hem.world.y + 75 }));
    const deformed = rig.getMeshVertices(skirt.id);
    assert.ok(Math.hypot(vertices[0].x - deformed[0].x, vertices[0].y - deformed[0].y) < 1e-6);
    assert.ok(Math.hypot(vertices.at(-1).x - deformed.at(-1).x, vertices.at(-1).y - deformed.at(-1).y) > 1);
  }
});

test('reference v3 has real chest and cloth secondary motion with pinned waistband and masked joints', () => {
  const rig = createReferenceGirlDemo(), project = rig.toProject();
  assert.equal(rig.dynamics.enabled, true);
  assert.equal(rig.dynamics.bones.filter(b => b.mode === 'jiggle').length, 2);
  const patches = [...rig.layers.values()].filter(l => l.patch?.enabled);
  assert.equal(patches.length, 14); assert.ok(patches.every(l => l.patch.preserveOutline));
  const base = new Rig({ ...project, dynamics: { ...project.dynamics, enabled: false } });
  const cloth = rig.dynamics.meshes[0], chestIds = rig.dynamics.bones.map(b => b.boneId);
  let maxJiggle = 0, maxCloth = 0;
  for (const frame of [0, 12, 24, 48, 96, 144]) {
    rig.applyAnimation(rig.timeline.activeAnimationId, frame); base.applyAnimation(base.timeline.activeAnimationId, frame);
    for (const id of chestIds) {
      const a = rig.bones.get(id).world, b = base.bones.get(id).world, travel = Math.hypot(a.x - b.x, a.y - b.y);
      maxJiggle = Math.max(maxJiggle, travel); assert.ok(travel <= 3.60001);
    }
    const a = rig.getMeshVertices(cloth.layerId), b = base.getMeshVertices(cloth.layerId);
    a.forEach((p, i) => {
      const travel = Math.hypot(p.x - b[i].x, p.y - b[i].y); maxCloth = Math.max(maxCloth, travel);
      assert.ok(travel <= 12.00001);
      if (cloth.pinned.includes(i)) assert.ok(travel < 1e-6);
    });
    if (frame === 24) for (const layer of [...rig.layers.values()].filter(l => l.mesh && /Chest · skin|Cropped navy jacket/.test(l.name))) {
      const skin = rig.getMeshVertices(layer.id), original = base.getMeshVertices(layer.id);
      assert.ok(skin.some((p, i) => Math.hypot(p.x - original[i].x, p.y - original[i].y) > .1), `${layer.name} did not deform`);
    }
  }
  assert.ok(maxJiggle > .5); assert.ok(maxCloth > 2);
  rig.applyAnimation(rig.timeline.activeAnimationId, 24);
  const expected = structuredClone(rig.physicsFrame), loaded = Rig.fromJSON(rig.toJSON());
  assert.deepEqual(loaded.physicsFrame, expected);
  rig.applyAnimation(rig.timeline.activeAnimationId, 96); rig.applyAnimation(rig.timeline.activeAnimationId, 24);
  assert.deepEqual(rig.physicsFrame, expected);
});
