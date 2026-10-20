import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import plugin from '../mcp/design-plugins/design-tools.mjs';
import renderPlugin from '../mcp/plugins/render-tools.mjs';
import { nativeEngine, openRig } from '../mcp/design/engine.mjs';
import { buildCharacter, listDesignPresets } from '../mcp/design/recipes.mjs';
import { leanResult } from '../mcp/design/results.mjs';

const workspace = mkdtempSync(join(tmpdir(), 'design-mcp-'));
const context = {
  workspaceRoot: workspace,
  resolvePath: (requested) => {
    const candidate = resolve(workspace, requested);
    const escape = relative(workspace, candidate).startsWith('..' + sep) || isAbsolute(relative(workspace, candidate));
    if (escape) throw new Error('escape: ' + requested);
    return candidate;
  },
  exists: async (path) => {
    try { await access(path, constants.F_OK); return true; } catch { return false; }
  },
};

const tool = (name) => {
  const found = plugin.tools.find((t) => t.name === name);
  assert.ok(found, 'tool exists: ' + name);
  return found;
};
const call = async (name, args) => {
  const res = await tool(name).execute(args, context);
  assert.ok(!res.isError, name + ' failed: ' + res.content[0].text);
  return { raw: res, json: JSON.parse(res.content[0].text) };
};
const callFails = async (name, args) => {
  const res = await tool(name).execute(args, context);
  assert.ok(res.isError, name + ' should have failed');
  return res.content[0].text;
};

test('design presets expose every recipe axis', () => {
  const presets = listDesignPresets();
  assert.deepEqual(presets.archetypes.map((a) => a.id), ['humanoid', 'chibi', 'mannequin', 'bust', 'quadruped']);
  assert.ok(presets.rigPresets.some((r) => r.id === 'starter6'));
  assert.ok(presets.palettes.length >= 6);
});

test('recipes build finite, deterministic rigs for every archetype', () => {
  for (const archetype of ['humanoid', 'chibi', 'mannequin', 'bust', 'quadruped']) {
    const first = buildCharacter({ archetype, name: 'Test ' + archetype });
    const second = buildCharacter({ archetype, name: 'Test ' + archetype });
    assert.equal(JSON.stringify(first), JSON.stringify(second), archetype + ' must be deterministic');
    assert.ok(!/NaN|Infinity/.test(JSON.stringify(first)), archetype + ' must stay finite');
    assert.ok(first.bones.length >= 3 && first.layers.length >= 4, archetype + ' needs bones and layers');
    assert.ok((first.animations || []).length === 1, archetype + ' ships one editable clip');
  }
  const starter = buildCharacter({ archetype: 'humanoid', rigPreset: 'starter6', name: 'Starter' });
  assert.equal(starter.bones.length, 7);
});

test('humanoid art uses joint-safe capsules, a neck bridge and part colors', () => {
  const pro = buildCharacter({ archetype: 'humanoid', name: 'Pro', style: 'toon',
    paletteColors: { skin: '#f2c19b', shirt: '#d9382c', pants: '#2b3a67', shoes: '#f5f5f5', hair: '#3a2a20' } });
  const byName = new Map(pro.layers.map((l) => [l.name, l]));
  const neck = byName.get('Neck');
  assert.ok(neck && neck.boundBoneId === 'neck', 'neck artwork bridges head and torso');
  const thigh = byName.get('Left thigh');
  assert.ok(thigh.shapes.length >= 4, 'thigh is a capsule with caps and cuff, got ' + thigh.shapes.length);
  assert.ok(thigh.shapes.every((s) => s.fill === '#2b3a67' || s.fill === '#1f2a4a'), 'pants stay off the skin');
  const face = byName.get('Face');
  assert.ok(face.shapes.some((s) => s.id.endsWith('-glint-l')), 'eyes have glints');
  assert.ok(face.shapes.some((s) => s.id.endsWith('-blush-l')), 'cheeks have blush');
  const head = byName.get('Head');
  assert.ok(head.shapes.some((s) => s.id.endsWith('-fringe')), 'hair has a fringe, not a plain cap');
  const profile = buildCharacter({ archetype: 'humanoid', name: 'Side', facing: 'profile' });
  const pface = profile.layers.find((l) => l.name === 'Face');
  assert.ok(pface.shapes.some((s) => s.id.endsWith('-nose') || s.id === 'dsg-nose') || profile.layers.find((l) => l.name === 'Head').shapes.some((s) => /nose/.test(s.id)), 'profile head has a nose');
  assert.ok(!pface.shapes.some((s) => /eye-l/.test(s.id)), 'profile face has one eye, not two');
});

test('recipe rigs load in the native engine with continuous joint chains', async () => {
  const project = buildCharacter({ archetype: 'humanoid', name: 'Chain check' });
  const rig = await openRig(project);
  const gap = (childId) => {
    const child = rig.bones.get(childId);
    const tip = rig.getBoneEnd(child.parentId);
    return Math.hypot(tip.x - child.world.x, tip.y - child.world.y);
  };
  for (const id of ['spine', 'neck', 'head', 'left-forearm', 'left-hand', 'right-shin', 'right-foot']) {
    assert.ok(gap(id) < 0.01, id + ' must attach at its parent tip, gap=' + gap(id));
  }
  const mounts = ['left-arm', 'right-arm', 'left-leg', 'right-leg'].map(gap);
  assert.ok(mounts.every((g) => g > 0.5), 'shoulder and hip mounts stay offset by design, gaps=' + mounts.join(','));
  const eng = await nativeEngine();
  assert.ok(!/NaN|Infinity/.test(eng.projectToSVG(rig)), 'SVG export stays finite');
});

test('tools/list stays within the token budget', () => {
  const shape = (tools) => tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
  const designChars = JSON.stringify(shape(plugin.tools)).length;
  const totalChars = JSON.stringify([...shape(plugin.tools), ...shape(renderPlugin.tools)]).length;
  assert.ok(designChars < 8000, 'design tools/list is ' + designChars + ' chars, budget 8000');
  assert.ok(totalChars < 10500, 'server tools/list is ' + totalChars + ' chars, budget 10500');
  assert.ok(!shape(plugin.tools).some((t) => /read the complete|entire project/i.test(t.description)), 'no whole-document reads');
});

test('leanResult never duplicates large payloads', () => {
  const small = leanResult({ ok: true });
  assert.ok(small.structuredContent, 'small results keep structuredContent');
  const big = leanResult({ blob: 'x'.repeat(5000) });
  assert.ok(!('structuredContent' in big), 'large results are single-copy');
  assert.ok(big.content[0].text.length > 5000);
});

test('design_character creates a healthy project and guards overwrite', async () => {
  const created = await call('design_character', { path: 'hero.json', name: 'Hero', archetype: 'humanoid', bodyColor: '#63c7b2' });
  assert.ok(created.json.created.endsWith('hero.json'));
  assert.equal(created.json.outline.counts.bones, 16);
  assert.equal(created.json.outline.counts.layers, 18);
  assert.equal(created.json.outline.counts.bindings, 16);
  assert.ok(created.json.outline.boneTree.some((b) => b.id === 'left-forearm' && b.depth === 3));
  const text = await callFails('design_character', { path: 'hero.json', name: 'Hero' });
  assert.ok(/overwrite/i.test(text), 'overwrite guard must explain itself, got: ' + text);
});

test('get_rig summary is compact and query_project pages without whole reads', async () => {
  const rig = await call('get_rig', { path: 'hero.json' });
  assert.ok(JSON.stringify(rig.json).length < 3500, 'get_rig summary must stay small, got ' + JSON.stringify(rig.json).length);
  assert.equal(rig.json.counts.layers, 18);
  const page = await call('query_project', { path: 'hero.json', select: 'layers', fields: ['id', 'bone'], limit: 5, cursor: 2 });
  assert.equal(page.json.rows.length, 5);
  assert.equal(page.json.total, 18);
  assert.equal(page.json.next, 7);
  assert.deepEqual(Object.keys(page.json.rows[0]).sort(), ['bone', 'id']);
  const clips = await call('query_project', { path: 'hero.json', select: 'clips' });
  assert.equal(clips.json.rows[0].id, 'main');
});

test('edit_rig, edit_layers and bind_layers compose a valid rig', async () => {
  await call('design_character', { path: 'edit.json', name: 'Edit Me', archetype: 'humanoid' });
  const added = await call('edit_rig', { path: 'edit.json', ops: [
    { op: 'addBone', parent: 'head', name: 'Antenna', length: 40, id: 'antenna' },
    { op: 'setLength', bone: 'antenna', length: 46 },
    { op: 'renameBone', bone: 'antenna', name: 'Antenna' },
  ] });
  assert.equal(added.json.changed.length, 3);
  assert.ok(added.json.changed[0].id === 'antenna');
  assert.equal(added.json.counts.bones, 17);
  const bad = await callFails('edit_rig', { path: 'edit.json', ops: [{ op: 'reparentBone', bone: 'root', parent: 'antenna' }] });
  assert.ok(/cycle/i.test(bad), 'cycle rejection must say so, got: ' + bad);
  const layered = await call('edit_layers', { path: 'edit.json', ops: [
    { op: 'addLayer', name: 'Antenna ball', bone: 'antenna', shapes: [{ kind: 'ellipse', x: 0, y: 46, radiusX: 10, radiusY: 10, fill: '#f1b866' }] },
  ] });
  assert.equal(layered.json.counts.layers, 19);
  const ballId = layered.json.changed[0].id;
  const rebound = await call('bind_layers', { path: 'edit.json', ops: [{ op: 'unbind', layer: ballId }, { op: 'bind', layer: ballId, bone: 'antenna' }] });
  assert.ok(rebound.json.changed.every((c) => c.layer === ballId));
  const report = await call('validate_rig', { path: 'edit.json' });
  assert.ok(report.json.ok, 'edited rig must validate: ' + JSON.stringify(report.json.errors));
});

test('edit_keyframes sends deltas and get_keyframes reads windows', async () => {
  await call('design_character', { path: 'anim.json', name: 'Actor', archetype: 'humanoid' });
  const upserted = await call('edit_keyframes', { path: 'anim.json', ops: [
    { op: 'upsert', track: { target: 'root', property: 'x' }, frame: 0, value: 400 },
    { op: 'upsert', track: { target: 'root', property: 'x' }, frame: 60, value: 460, easing: 'smooth' },
  ] });
  assert.ok(JSON.stringify(upserted.json).length < 800, 'keyframe reply must stay tiny');
  assert.equal(upserted.json.changed[0].keys, 1);
  const window = await call('get_keyframes', { path: 'anim.json', track: { target: 'root', property: 'x' }, from: 0, to: 30 });
  assert.equal(window.json.keys.length, 1);
  assert.equal(window.json.keys[0].value, 400);
  assert.equal(window.json.total, 2);
  await call('edit_animation', { path: 'anim.json', ops: [{ op: 'createClip', name: 'Wave', endFrame: 48, id: 'wave' }] });
  const shifted = await call('edit_keyframes', { path: 'anim.json', ops: [{ op: 'upsert', clip: 'wave', track: { target: 'left-arm', property: 'rotation' }, keys: [{ frame: 0, value: 0 }, { frame: 24, value: -0.9 }, { frame: 48, value: 0 }] }] });
  assert.equal(shifted.json.changed[0].total, 3);
});

test('edit_scene, validate_rig and auto_fix_rig close the loop', async () => {
  await call('design_character', { path: 'scene.json', name: 'Scene', archetype: 'bust' });
  const scene = await call('edit_scene', { path: 'scene.json', background: '#0d1826', timeline: { endFrame: 96 } });
  assert.ok(scene.json.touched.includes('background') && scene.json.touched.includes('timeline'));
  const ok = await call('validate_rig', { path: 'scene.json' });
  assert.ok(ok.json.ok, 'bust must validate: ' + JSON.stringify(ok.json.errors));
  assert.equal(ok.json.counts.bones, 3);
});

test('auto_fix_rig repairs a deliberately broken project', async () => {
  await call('design_character', { path: 'broken.json', name: 'Broken', archetype: 'humanoid' });
  const broken = JSON.parse((await call('get_rig', { path: 'broken.json', detail: 'full' })).raw.content[0].text);
  void broken;
  const { readFile, writeFile } = await import('node:fs/promises');
  const file = context.resolvePath('broken.json');
  const project = JSON.parse(await readFile(file, 'utf8'));
  project.bones.push({ ...project.bones[1], id: 'spine' });
  project.bones.find((b) => b.id === 'root').parentId = 'head';
  project.bones.find((b) => b.id === 'head').parentId = 'root';
  project.bindings.push({ id: 'binding-ghost', layerId: 'no-such-layer', imageId: 'no-such-layer', boneId: 'root', bindOffset: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
  project.bones.find((b) => b.id === 'spine').local = { x: NaN, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  await writeFile(file, JSON.stringify(project));
  const before = await tool('validate_rig').execute({ path: 'broken.json' }, context);
  assert.ok(before.isError !== true, 'validate returns a report, not an error');
  const report = JSON.parse(before.content[0].text);
  assert.ok(!report.ok && report.errors.length >= 3, 'broken rig must fail, got: ' + JSON.stringify(report.errors));
  const fixed = await call('auto_fix_rig', { path: 'broken.json' });
  assert.ok(fixed.json.fixes.length >= 4, 'expected several fixes, got: ' + JSON.stringify(fixed.json.fixes));
  assert.ok(fixed.json.ok, 'fixed rig must validate: ' + JSON.stringify(fixed.json.remainingErrors));
});

test('failures name the field and the next call', async () => {
  const missing = await callFails('get_rig', { path: 'does-not-exist.json' });
  assert.ok(/hint:/i.test(missing) && /next:/i.test(missing), 'missing file must hint design_character, got: ' + missing);
  const badOp = await callFails('edit_rig', { path: 'hero.json', ops: [{ op: 'wiggle', bone: 'root' }] });
  assert.ok(/Unknown rig op/i.test(badOp));
  const badBone = await callFails('edit_rig', { path: 'hero.json', ops: [{ op: 'setLength', bone: 'nope', length: 10 }] });
  assert.ok(/not found/i.test(badBone) && /get_rig/i.test(badBone));
});
