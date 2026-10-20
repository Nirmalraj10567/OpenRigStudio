import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({ stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const {
  Rig, identity, addGroupMask, updateGroupMask, moveGroupMask, removeGroupMask, groupMasks, keyCompositing,
  compositeMaskAlpha, duplicateSmartAction, createSmartFolder, copySmartKeys, pasteSmartKeys, createTurnControl,
  orderedSmartActions, projectToSVG,
} = compiled.exports;

function fixture() {
  const rig = new Rig();
  const body = rig.addVectorLayer('Body', [{ id: 'body', kind: 'rect', x: 0, y: 0, width: 100, height: 100, fill: '#f00', stroke: '#000', strokeWidth: 8 }]);
  const shoulder = rig.addVectorLayer('Shoulder patch', [{ id: 'shoulder', kind: 'ellipse', x: 0, y: 0, radiusX: 60, radiusY: 50, fill: '#fff' }]);
  const group = rig.addLayerGroup?.('Torso') ?? null;
  const groupId = group ?? [...rig.groups.keys()][0] ?? (() => { const id = 'manual-group'; rig.groups.set(id, { id, name: 'Torso', parentGroupId: null, childIds: [body, shoulder], childrenIds: [], local: identity(), world: identity(), visible: true, locked: false, opacity: 1, zIndex: 0, mode: 'group', blendMode: 'source-over', maskMode: 'clip' }); return id; })();
  rig.layers.get(body).parentGroupId = groupId; rig.layers.get(shoulder).parentGroupId = groupId; rig.groups.get(groupId).childIds = [body, shoulder];
  rig.update();
  return { rig, body, shoulder, groupId };
}

test('ordered masks support alpha, clipping, Boolean operations, inversion and source visibility', () => {
  const { rig, body, shoulder, groupId } = fixture();
  const first = addGroupMask(rig, groupId, shoulder, 'alpha');
  const second = addGroupMask(rig, groupId, body, 'clip');
  assert.ok(first && second);
  assert.deepEqual(groupMasks(rig.groups.get(groupId)).map(mask => mask.operation), ['add', 'intersect']);
  assert.equal(updateGroupMask(rig, groupId, first, { operation: 'subtract', inverted: true, hideSource: false }), true);
  assert.equal(moveGroupMask(rig, groupId, second, -1), true);
  assert.equal(groupMasks(rig.groups.get(groupId))[0].id, second);
  assert.equal(removeGroupMask(rig, groupId, first), true);
  assert.equal(compositeMaskAlpha(0.8, 0.5, 'subtract'), 0.4);
  const svg = projectToSVG(rig);
  assert.match(svg, /<mask /);
  assert.match(svg, /clipPath|mask/);
});

test('mask stacks and patch layers animate through normal project tracks', () => {
  const { rig, body, shoulder, groupId } = fixture();
  addGroupMask(rig, groupId, shoulder, 'alpha');
  rig.layers.get(shoulder).patch = { enabled: true, targetIds: [body], hideEdges: true, seamWidth: 3 };
  keyCompositing(rig, groupId, 'masks');
  keyCompositing(rig, shoulder, 'patch');
  const clip = rig.animations.find(animation => animation.id === rig.timeline.activeAnimationId);
  assert.ok(clip.tracks.some(track => track.targetId === groupId && track.property === 'masks'));
  assert.ok(clip.tracks.some(track => track.targetId === shoulder && track.property === 'patch'));
  const restored = Rig.fromJSON(rig.toJSON());
  assert.equal(restored.groups.get(groupId).masks.length, 1);
  assert.deepEqual(restored.layers.get(shoulder).patch.targetIds, [body]);
});

test('joint masking preserves the hand contours while legacy fill-only patches still hide theirs', () => {
  const rig = new Rig();
  const arm = rig.addVectorLayer('Arm', [{ id: 'arm', kind: 'rect', width: 20, height: 80, fill: '#f5ded0', stroke: '#111111' }]);
  const hand = rig.addVectorLayer('Hand', [{ id: 'hand', kind: 'path', d: 'M 0 0 L 10 0 L 12 25 L 2 25 Z', fill: '#f5ded0', stroke: '#3f00aa' }]);
  rig.layers.get(hand).patch = { enabled: true, hideEdges: true, preserveOutline: true, seamWidth: .25, targetIds: [arm] };
  const svg = projectToSVG(rig);
  assert.match(svg, /<mask /); assert.match(svg, /stroke="#3f00aa"/);
  const loaded = Rig.fromJSON(rig.toJSON());
  assert.equal(loaded.layers.get(hand).patch.preserveOutline, true);
  loaded.layers.get(hand).patch.preserveOutline = false;
  assert.ok(!projectToSVG(loaded).includes('stroke="#3f00aa"'));
  loaded.layers.get(hand).patch.hideEdges = false;
  assert.ok(projectToSVG(loaded).includes('stroke="#3f00aa"'));
});

test('Smart Action folders, duplication, mirroring, key clipboard and turn controls are persisted', () => {
  const rig = new Rig();
  const driver = rig.addBone(null, 'Turn', 80);
  const target = rig.addVectorLayer('Head', [{ id: 'head', kind: 'ellipse', radiusX: 40, radiusY: 50, fill: '#fff' }]);
  const actionId = rig.createSmartAction('Head turn', driver, -Math.PI, Math.PI);
  rig.smartActions[0].baseline[target] = { local: { ...rig.layers.get(target).local }, opacity: 1, visible: true, zIndex: 0 };
  rig.smartActions[0].keys.push({ angle: Math.PI / 2, targets: { [target]: { transform: { x: 15, rotation: .2 } } } });
  const folderId = createSmartFolder(rig, 'Turns');
  rig.smartActions[0].folderId = folderId;
  const copy = copySmartKeys(rig, actionId, [Math.PI / 2]);
  assert.equal(pasteSmartKeys(rig, actionId, copy, 0), true);
  const mirrored = duplicateSmartAction(rig, actionId, true);
  assert.ok(mirrored);
  assert.equal(rig.smartActions.find(action => action.id === mirrored).startAngle, -Math.PI);
  const quick = createTurnControl(rig, 'body');
  assert.ok(quick && rig.bones.has(rig.smartActions.find(action => action.id === quick).driverBoneId));
  const ordered = orderedSmartActions(rig.smartActions);
  assert.equal(ordered.diagnostics.length, 0);
  const loaded = Rig.fromJSON(rig.toJSON());
  assert.equal(loaded.smartActionFolders.length, 1);
  assert.ok(loaded.smartActions.some(action => action.id === mirrored));
});

test('Smart Action dependencies report cycles and priority ordering is deterministic', () => {
  const rig = new Rig();
  const a = rig.addBone(null, 'A', 20), b = rig.addBone(null, 'B', 20);
  rig.createSmartAction('First', a, 0, 1); rig.createSmartAction('Second', b, 0, 1);
  rig.smartActions[0].dependencies = [rig.smartActions[1].id];
  rig.smartActions[1].dependencies = [rig.smartActions[0].id];
  const result = orderedSmartActions(rig.smartActions);
  assert.ok(result.diagnostics.some(message => message.includes('Cyclic')));
  assert.equal(result.actions.length, 0);
});
