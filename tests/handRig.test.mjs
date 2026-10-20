import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const { outputFiles } = await build({ stdin: { contents: "export * from './src/engine/index'; export {useProject} from './src/state/projectStore';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, createReferenceGirlDemo, getHandRigs, applyHandPose, setFingerCurl, setCharacterViewAngle, validMesh, useProject, setHandTurn, handTurnAngle, handTurnAvailable, projectToSVG, worldToLocalPoint } = compiled.exports;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (a, b) => assert.ok(distance(a, b) < 1e-6, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const make = () => { const rig = createReferenceGirlDemo(); rig.dynamics.enabled = false; rig.update(); return rig; };

test('both hands have five true digit chains, isolated normalized skin weights, and all angle targets', () => {
  const rig = make(), hands = getHandRigs(rig);
  assert.equal(hands.length, 2);
  for (const hand of hands) {
    assert.deepEqual(hand.fingers.map(f => f.name), ['Thumb', 'Index', 'Middle', 'Ring', 'Little']);
    for (const digit of hand.fingers) {
      assert.equal(digit.boneIds.length, digit.name === 'Thumb' ? 2 : 3);
      digit.boneIds.forEach((id, i) => assert.equal(rig.bones.get(id).parentId, i ? digit.boneIds[i - 1] : hand.wristBoneId));
      const mesh = rig.layers.get(digit.layerId).mesh; assert.ok(validMesh(mesh));
      for (const vertex of mesh.vertices) {
        assert.ok(Math.abs(Object.values(vertex.weights).reduce((sum, w) => sum + w, 0) - 1) < 1e-6);
        assert.ok(Object.keys(vertex.weights).every(id => digit.boneIds.includes(id)));
      }
      for (const view of rig.characterViews[0].views) {
        assert.ok(digit.boneIds.every(id => view.targets[id]?.length > 0));
        assert.equal(view.targets[digit.layerId].mesh.length, mesh.vertices.length);
      }
    }
  }
  const bad = Rig.fromJSON(rig.toJSON()); bad.remove(hands[0].fingers[0].boneIds[0]);
  assert.equal(getHandRigs(bad).length, 1);
  assert.equal(setFingerCurl(bad, hands[0].id, 'Index', 1), false);
});

test('curling one digit deforms its artwork without moving the wrist, arm, or neighboring fingers at any view', () => {
  const rig = make(), hands = getHandRigs(rig);
  for (const view of rig.characterViews[0].views) for (const hand of hands) {
    hands.forEach(h => applyHandPose(rig, h.id, 'reference'));
    setCharacterViewAngle(rig, rig.characterViews[0].id, view.angle, false);
    const index = hand.fingers.find(f => f.name === 'Index');
    const untouched = [...rig.bones.values()].filter(b => !index.boneIds.includes(b.id)).map(b => [b.id, { ...b.world }]);
    const neighbor = hand.fingers.find(f => f.name === 'Middle');
    const otherArt = rig.getMeshVertices(neighbor.layerId), before = rig.getMeshVertices(index.layerId);
    const origin = { ...rig.bones.get(index.boneIds[0]).world };
    assert.ok(setFingerCurl(rig, hand.id, 'Index', 1));
    near(rig.bones.get(index.boneIds[0]).world, origin);
    untouched.forEach(([id, expected]) => assert.deepEqual(rig.bones.get(id).world, expected));
    assert.deepEqual(rig.getMeshVertices(neighbor.layerId), otherArt);
    const after = rig.getMeshVertices(index.layerId);
    assert.ok(after.some((p, i) => distance(p, before[i]) > .5));
    assert.ok(after.every(p => Number.isFinite(p.x + p.y)));
    index.boneIds.slice(1).forEach((id, i) => near(rig.bones.get(id).world, rig.getBoneEnd(index.boneIds[i])));
  }
});

test('finger IK reaches a target with a bounded chain and leaves the wrist and other digits in place', () => {
  for (const side of [0, 1]) {
    const rig = make(), hand = getHandRigs(rig)[side];
    for (const digit of hand.fingers) {
      applyHandPose(rig, hand.id, 'reference');
      const tipId = digit.boneIds.at(-1), origin = rig.bones.get(digit.boneIds[0]).world, end = rig.getBoneEnd(tipId);
      const target = { x: origin.x + (end.x - origin.x) * .83, y: origin.y + (end.y - origin.y) * .83 };
      const wrist = { ...rig.bones.get(hand.wristBoneId).world };
      const neighbor = hand.fingers.find(f => f !== digit), stable = rig.getMeshVertices(neighbor.layerId);
      assert.ok(rig.solveIK(tipId, target, digit.boneIds.length));
      assert.ok(distance(rig.getBoneEnd(tipId), target) < .2, `${hand.name} ${digit.name} missed target`);
      assert.deepEqual(rig.bones.get(hand.wristBoneId).world, wrist);
      assert.deepEqual(rig.getMeshVertices(neighbor.layerId), stable);
    }
  }
});

test('finger controls auto-key, undo, and reopen the same deformed digits through project JSON', () => {
  useProject.getState().replaceProject(make().toProject(), false); useProject.getState().setAutoKey(true);
  let state = useProject.getState(); state.setFrame(24);
  const hand = getHandRigs(state.rig)[0], index = hand.fingers.find(f => f.name === 'Index');
  const before = state.rig.getMeshVertices(index.layerId);
  state.updateProject(rig => setFingerCurl(rig, hand.id, 'Index', 1));
  const clip = state.rig.animations.find(c => c.id === state.rig.timeline.activeAnimationId);
  assert.ok(index.boneIds.every(id => clip.tracks.find(t => t.targetId === id).keyframes.some(k => k.frame === 24)));
  const posed = state.rig.getMeshVertices(index.layerId); assert.notDeepEqual(posed, before);
  const loaded = Rig.fromJSON(state.serialize()); assert.deepEqual(loaded.getMeshVertices(index.layerId), posed);
  assert.equal(getHandRigs(loaded)[0].fingers.length, 5);
  state.undo(); state = useProject.getState(); assert.deepEqual(state.rig.getMeshVertices(index.layerId), before);
  state.redo(); assert.deepEqual(useProject.getState().rig.getMeshVertices(index.layerId), posed);
});

test('wrist roll preserves upstream joints and authored curls, swaps surfaces, and closes a full revolution', () => {
  const rig = make(), hands = getHandRigs(rig);
  for (const hand of hands) {
    applyHandPose(rig, hand.id, 'open');
    const digitIds = hand.fingers.flatMap(f => f.boneIds);
    const fixed = [...rig.bones.values()].filter(b => !digitIds.includes(b.id) && b.id !== hand.turn.driverBoneId).map(b => [b.id, { ...b.world }]);
    const locals = digitIds.map(id => ({ ...rig.bones.get(id).local }));
    const meshes = [hand.palmLayerId, ...hand.fingers.map(f => f.layerId)];
    const initial = meshes.map(id => rig.getMeshVertices(id));
    assert.ok(handTurnAvailable(rig, hand));
    for (const degrees of [45, 90, 135, 180, 270, 315, 360, -360, 720]) {
      assert.ok(setHandTurn(rig, hand.id, degrees));
      assert.ok(Math.abs(handTurnAngle(rig, hand) - degrees) < 1e-9);
      fixed.forEach(([id, world]) => assert.deepEqual(rig.bones.get(id).world, world));
      digitIds.forEach((id, i) => assert.deepEqual(rig.bones.get(id).local, locals[i]));
      for (const finger of hand.fingers) finger.boneIds.slice(1).forEach((id, i) => near(rig.bones.get(id).world, rig.getBoneEnd(finger.boneIds[i])));
      meshes.forEach((id, i) => {
        const points = rig.getMeshVertices(id);
        assert.ok(points.every(p => Number.isFinite(p.x + p.y)));
        if (degrees % 360 === 0) assert.deepEqual(points, initial[i]);
        else assert.notDeepEqual(points, initial[i]);
      });
      if (degrees === 90 || degrees === 270) {
        const mesh = rig.layers.get(hand.palmLayerId).mesh, vertices = rig.getMeshVertices(hand.palmLayerId);
        let area = 0;
        for (let i = 0; i < mesh.triangles.length; i += 3) {
          const [a, b, c] = mesh.triangles.slice(i, i + 3).map(j => vertices[j]);
          area += Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
        }
        assert.ok(area > 10, 'edge-on palm lost all thickness');
      }
      if (degrees === 180) {
        const shapes = rig.getRenderLayer(hand.palmLayerId).shapes;
        assert.ok(shapes.some(s => hand.turn.palmShapeIds.includes(s.id) && s.opacity === 1));
        assert.ok(!shapes.some(s => hand.turn.backShapeIds.includes(s.id)));
        const thumb = hand.fingers.find(f => f.name === 'Thumb');
        assert.ok(rig.getRenderLayer(thumb.layerId).zIndex < rig.getRenderLayer(hand.palmLayerId).zIndex);
      }
    }
    setHandTurn(rig, hand.id, 0);
  }
});

test('all body angles compose with either hand roll and editable open/grip/point poses', () => {
  const rig = make(), hands = getHandRigs(rig), set = rig.characterViews[0];
  for (const view of set.views) for (const pose of ['reference', 'open', 'grip', 'point']) {
    setCharacterViewAngle(rig, set.id, view.angle, false);
    for (const hand of hands) {
      applyHandPose(rig, hand.id, pose);
      const wrist = { ...rig.bones.get(hand.wristBoneId).world };
      for (const degrees of [45, 90, 180, 270]) {
        setHandTurn(rig, hand.id, degrees);
        assert.deepEqual(rig.bones.get(hand.wristBoneId).world, wrist);
        for (const id of [hand.palmLayerId, ...hand.fingers.map(f => f.layerId)]) {
          const vertices = rig.getMeshVertices(id);
          assert.ok(vertices.length > 0 && vertices.every(p => Number.isFinite(p.x + p.y) && distance(p, wrist) < 65));
        }
      }
      setHandTurn(rig, hand.id, 0);
    }
  }
});

test('turned finger IK reaches visible targets, including exact edges, without moving the arm or other digits', () => {
  const rig = make();
  for (const hand of getHandRigs(rig)) for (const degrees of [45, 90, 180, 270]) {
    applyHandPose(rig, hand.id, 'open'); setHandTurn(rig, hand.id, degrees);
    const digit = hand.fingers.find(f => f.name === 'Index'), endId = digit.boneIds.at(-1);
    setFingerCurl(rig, hand.id, digit.name, .4);
    const target = rig.getBoneEnd(endId);
    setFingerCurl(rig, hand.id, digit.name, 0);
    const wrist = { ...rig.bones.get(hand.wristBoneId).world }, other = hand.fingers.find(f => f.name === 'Middle');
    const stable = rig.getMeshVertices(other.layerId);
    assert.ok(rig.solveIK(endId, target, 3));
    assert.ok(distance(rig.getBoneEnd(endId), target) < .2, `${hand.name} ${degrees}° IK missed`);
    assert.deepEqual(rig.bones.get(hand.wristBoneId).world, wrist);
    assert.deepEqual(rig.getMeshVertices(other.layerId), stable);
    setHandTurn(rig, hand.id, 0);
  }
});

test('roll keys preserve unwrapped revolutions, random seeking, auto-key/undo, and native JSON/SVG', () => {
  const rig = make(), hand = getHandRigs(rig)[0];
  const clip = rig.animations.find(c => c.name.startsWith('Hand turns'));
  rig.setTimeline({ activeAnimationId: clip.id });
  for (const frame of [24, 72, 48, 96, 0, 24]) {
    rig.applyAnimation(clip.id, frame);
    assert.ok(Math.abs(handTurnAngle(rig, hand) - frame * 3.75) < 1e-8);
    const reopened = Rig.fromJSON(rig.toJSON());
    assert.equal(projectToSVG(reopened), projectToSVG(rig));
  }
  useProject.getState().replaceProject(rig.toProject(), false);
  useProject.getState().setAutoKey(true); useProject.getState().setFrame(48);
  let state = useProject.getState();
  const before = handTurnAngle(state.rig, hand);
  state.updateProject(r => setHandTurn(r, hand.id, 540));
  const saved = state.rig.animations.find(c => c.id === clip.id);
  assert.ok(saved.tracks.some(t => t.targetId === hand.turn.driverBoneId && t.keyframes.some(k => k.frame === 48)));
  assert.equal(handTurnAngle(Rig.fromJSON(state.serialize()), hand), 540);
  state.undo(); state = useProject.getState(); assert.equal(handTurnAngle(state.rig, hand), before);
  state.redo(); assert.equal(handTurnAngle(useProject.getState().rig, hand), 540);
});

test('older hand metadata and damaged turn references remain safe and finger-editable', () => {
  const rig = make(), hands = getHandRigs(rig);
  delete hands[0].turn;
  hands[1].turn.vertexDepths[hands[1].palmLayerId] = [NaN];
  rig.metadata.handRigs = JSON.stringify(hands); rig.update();
  for (const hand of getHandRigs(rig)) {
    assert.equal(handTurnAvailable(rig, hand), false);
    assert.equal(setHandTurn(rig, hand.id, 45), false);
    assert.ok(applyHandPose(rig, hand.id, 'grip'));
  }
  assert.equal(getHandRigs(rig).length, 2);
});

test('wrist seam deformation stays local, rolls continuously, and inverse mesh editing preserves UVs', () => {
  const rig = make(), hand = getHandRigs(rig)[0], wrist = rig.bones.get(hand.wristBoneId);
  const axis = { ...wrist.world, rotation: rig.bones.get(hand.turn.axisBoneId).world.rotation };
  const forearm = rig.layers.get(hand.turn.forearmLayerId), rest = rig.getMeshVertices(forearm.id);
  setHandTurn(rig, hand.id, 90);
  const edge = rig.getMeshVertices(forearm.id);
  rest.forEach((point, i) => { if (worldToLocalPoint(axis, point).x < -12) near(edge[i], point); });
  assert.ok(edge.some((p, i) => distance(p, rest[i]) > .5));
  const finger = hand.fingers.find(f => f.name === 'Index');
  for (const angle of [0, 90, 180, 270, 360]) {
    setHandTurn(rig, hand.id, angle - .001); const before = rig.getMeshVertices(finger.layerId);
    setHandTurn(rig, hand.id, angle + .001); const after = rig.getMeshVertices(finger.layerId);
    assert.ok(after.every((p, i) => distance(p, before[i]) < .01), `jump near ${angle}°`);
  }
  setHandTurn(rig, hand.id, 135);
  for (const id of [forearm.id, hand.palmLayerId, finger.layerId]) {
    const layer = rig.layers.get(id), before = rig.getMeshVertices(id), index = Math.floor(before.length / 2);
    const uv = layer.mesh.vertices.map(({ u, v }) => [u, v]);
    const target = { x: before[index].x + .1, y: before[index].y - .12 };
    assert.ok(rig.setMeshVertex(id, index, target));
    const after = rig.getMeshVertices(id); near(after[index], target);
    after.forEach((p, i) => { if (i !== index) near(p, before[i]); });
    assert.deepEqual(layer.mesh.vertices.map(({ u, v }) => [u, v]), uv);
  }
});
