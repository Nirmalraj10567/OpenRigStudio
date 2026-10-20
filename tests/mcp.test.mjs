import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const workspace = fileURLToPath(new URL('..', import.meta.url));
const serverPath = join(workspace, 'mcp', 'character-studio-mcp.mjs');
const { outputFiles } = await build({ stdin: { contents: "export { Rig } from './src/engine/Rig'; export { projectToSVG } from './src/engine/export'; export { localToWorldPoint } from './src/engine/math';", resolveDir: workspace }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, projectToSVG, localToWorldPoint } = compiled.exports;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

function verifyCharacterRig(project) {
  const rig = new Rig(project);
  const point = (layerId, localPoint) => localToWorldPoint(rig.layers.get(layerId).world, localPoint);
  const rest = Object.fromEntries([...rig.layers.values()].map(layer => [layer.id, { ...layer.world }]));
  near(point('character-head', { x: 0, y: -56 }).x, 400);
  near(point('character-head', { x: 0, y: -56 }).y, 168);
  near(point('character-left-arm', { x: 0, y: 120 }).y, 390);
  assert.equal(rig.layers.get('character-body').shapes[0].fill, '#4aa3df');
  assert.equal(rig.layers.get('character-left-leg').shapes[1].fill, '#f0b45a');

  // Each limb must move independently with its joint while other artwork stays put.
  for (const side of ['left', 'right']) for (const limb of ['arm', 'leg']) {
    const bone = rig.bones.get(`${side}-${limb}-bone`);
    const angle = bone.local.rotation;
    const layerId = `character-${side}-${limb}`;
    const tip = { x: 0, y: limb === 'arm' ? 120 : 77 };
    const before = point(layerId, tip);
    bone.local.rotation += Math.PI / 2; rig.update();
    const after = point(layerId, tip);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 80, `${layerId} must follow its bone`);
    near(after.x, bone.world.x - tip.y); near(after.y, bone.world.y);
    for (const layer of rig.layers.values()) {
      if (layer.id !== layerId) assert.deepEqual(layer.world, rest[layer.id], `${layer.id} must not follow ${bone.id}`);
    }
    bone.local.rotation = angle; rig.update();
  }

  rig.bones.get('head-bone').local.rotation += Math.PI / 6; rig.update();
  assert.notDeepEqual(rig.layers.get('character-head').world, rest['character-head']);
  assert.deepEqual(rig.layers.get('character-face').world, rig.layers.get('character-head').world);
  assert.deepEqual(rig.layers.get('character-body').world, rest['character-body']);
  const headPose = { ...rig.layers.get('character-head').world };
  rig.bones.get('root').local.x += 50; rig.update();
  near(rig.layers.get('character-head').world.x, headPose.x + 50);
  near(rig.layers.get('character-body').world.x, rest['character-body'].x + 50);
  assert.deepEqual(rig.layers.get('character-ground').world, rest['character-ground']);
  assert.deepEqual(rig.layers.get('character-shadow').world, rest['character-shadow']);
  const svg = projectToSVG(rig);
  assert.ok(svg.length > 1000); assert.doesNotMatch(svg, /NaN|Infinity/);
  assert.equal(projectToSVG(Rig.fromJSON(rig.toJSON())), svg, 'posed bindings must survive saving/reopening');
}

function verifyCafeAnimation(project) {
  const rig = new Rig(project), clip = project.animations[0];
  const seek = seconds => rig.applyAnimation(clip.id, seconds * project.timeline.fps);
  assert.equal(project.timeline.endFrame / project.timeline.fps, 24);
  seek(1); const startX = rig.bones.get('root').world.x;
  seek(7); assert.ok(rig.bones.get('root').world.x > startX + 600, 'character walks toward the café');
  const stride = rig.bones.get('left-leg-bone').world.rotation;
  seek(7.37); assert.ok(Math.abs(stride - rig.bones.get('left-leg-bone').world.rotation) > .2, 'legs articulate during travel');
  assert.equal(rig.getRenderLayer('garden-sky').visible, true);
  assert.equal(rig.getRenderLayer('cafe-interior').visible, false);
  seek(13); assert.equal(rig.getRenderLayer('order-bubble').visible, true);
  assert.equal(rig.getRenderLayer('garden-sky').visible, false);
  assert.equal(rig.getRenderLayer('cafe-interior').visible, true);
  seek(15.5);
  assert.equal(rig.getRenderLayer('coffee-counter-cup').visible, false);
  assert.equal(rig.getRenderLayer('coffee-held').visible, true);
  near(rig.layers.get('coffee-counter-cup').world.x, rig.layers.get('coffee-held').world.x);
  near(rig.layers.get('coffee-counter-cup').world.y, rig.layers.get('coffee-held').world.y);
  for (const time of [16, 19, 19.8, 20.1, 23]) {
    seek(time);
    const hand = localToWorldPoint(rig.bones.get('right-forearm-bone').world, { x: 65, y: 0 });
    near(hand.x, rig.layers.get('coffee-held').world.x);
    near(hand.y, rig.layers.get('coffee-held').world.y);
  }
  seek(19.8);
  const rim = localToWorldPoint(rig.layers.get('coffee-held').world, { x: 26, y: -30 });
  const mouth = localToWorldPoint(rig.layers.get('character-face').world, { x: 0, y: -13 });
  assert.ok(Math.hypot(rim.x-mouth.x, rim.y-mouth.y) < 20, 'cup rim reaches the mouth during drinking');
  assert.equal(rig.getRenderLayer('coffee-nook').visible, true);
  const svg = projectToSVG(rig);
  assert.doesNotMatch(svg, /NaN|Infinity/);
  seek(2); seek(19.8); assert.equal(projectToSVG(rig), svg, 'seeking must be deterministic');
  const reopened = Rig.fromJSON(rig.toJSON()); reopened.applyAnimation(clip.id, 19.8*project.timeline.fps);
  assert.equal(projectToSVG(reopened), svg, 'story animation must survive JSON round-trip');
  for (const track of clip.tracks) {
    assert.equal(new Set(track.keyframes.map(key => key.frame)).size, track.keyframes.length, `${track.id} has duplicate frames`);
  }
}

test('MCP plugin host initializes, lists tools, creates a character, and updates a physics project', async () => {
  const temp = await mkdtemp(join(workspace, '.mcp-test-'));
  const relativePath = relative(workspace, join(temp, 'agent-ball.json'));
  const child = spawn(process.execPath, [serverPath], { cwd: workspace, env: { ...process.env, CHARACTER_STUDIO_WORKSPACE: workspace }, stdio: ['pipe', 'pipe', 'pipe'] });
  const input = createInterface({ input: child.stdout });
  const pending = new Map();
  input.on('line', line => {
    const message = JSON.parse(line);
    const entry = pending.get(message.id);
    if (entry) { pending.delete(message.id); clearTimeout(entry.timer); entry.resolve(message); }
  });
  let sequence = 0;
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { if (pending.delete(id)) reject(new Error(`MCP request timed out: ${method}`)); }, 10000);
    pending.set(id, { resolve, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  try {
    const initialized = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test-agent', version: '1.0.0' } });
    assert.equal(initialized.result.serverInfo.name, 'character-studio-mcp');
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

    const listed = await request('tools/list');
    const toolNames = listed.result.tools.map(tool => tool.name);
    for (const requiredTool of ['create_character_scene', 'inspect_project', 'read_project', 'create_physics_ball_scene', 'update_physics_settings', 'write_project', 'animate_character', 'inspect_animation', 'set_animation_keyframes', 'add_scene_prop', 'preview_project_frame', 'preview_project_timeline', 'render_project_video', 'animate_tom_and_jerry', 'create_tom_jerry_car_race', 'recreate_furniture_showroom_animation', 'animate_exact_reference_plate', 'scene_catalog', 'compose_scene', 'validate_scene']) assert.ok(toolNames.includes(requiredTool), `MCP tool missing: ${requiredTool}`);

    const characterPath = relative(workspace, join(temp, 'agent-character.json'));
    const character = await request('tools/call', { name: 'create_character_scene', arguments: { path: characterPath, name: 'MCP Test Character', bodyColor: '#4aa3df', accentColor: '#f0b45a', overwrite: true } });
    const characterPayload = JSON.parse(character.result.content[0].text);
    assert.equal(characterPayload.summary.name, 'MCP Test Character');
    assert.equal(characterPayload.summary.layers.length, 9);
    assert.equal(characterPayload.summary.bones.length, 6);
    assert.equal(characterPayload.summary.bindings.length, 7);
    const characterRaw = JSON.parse(await readFile(join(workspace, characterPath), 'utf8'));
    assert.equal(characterRaw.metadata.createdBy, 'character-studio-mcp');
    assert.ok(characterRaw.bindings.length > 0, 'Generated artwork must follow the starter rig');
    verifyCharacterRig(characterRaw);
    const readCharacter = await request('tools/call', { name: 'read_project', arguments: { path: characterPath } });
    assert.deepEqual(readCharacter.result.structuredContent.project, characterRaw);
    const refused = await request('tools/call', { name: 'create_character_scene', arguments: { path: characterPath, name: 'Do not overwrite' } });
    assert.match(refused.error.message, /Refusing to overwrite/);
    assert.deepEqual(JSON.parse(await readFile(join(workspace, characterPath), 'utf8')), characterRaw);

    const storyPath = relative(workspace, join(temp, 'cafe-story.json'));
    const story = await request('tools/call', { name: 'animate_character', arguments: { sourcePath: characterPath, path: storyPath, story: 'garden_to_coffee_shop' } });
    assert.equal(story.error, undefined, JSON.stringify(story));
    assert.equal(story.result.structuredContent.timeline.endFrame, 576);
    assert.deepEqual(JSON.parse(await readFile(join(workspace, characterPath), 'utf8')), characterRaw, 'source character must remain intact');
    const storyRead = await request('tools/call', { name: 'read_project', arguments: { path: storyPath } });
    verifyCafeAnimation(storyRead.result.structuredContent.project);
    const animationInfo = await request('tools/call', { name: 'inspect_animation', arguments: { path: storyPath } });
    assert.ok(animationInfo.result.structuredContent.clips[0].tracks.some(track => track.targetId === 'coffee-grip'));
    const prop = await request('tools/call', { name: 'add_scene_prop', arguments: { path: storyPath, id: 'napkin', name: 'Table napkin', shapes: [{ kind: 'rect', x: 865, y: 560, width: 45, height: 8, fill: '#fff' }], zIndex: 800 } });
    assert.equal(prop.error, undefined);
    const keyed = await request('tools/call', { name: 'set_animation_keyframes', arguments: { path: storyPath, clipId: 'garden-cafe-animation', targetId: 'napkin', property: 'visible', keyframes: [{ frame: 0, value: false, easing: 'step' }, { frame: 432, value: true }] } });
    assert.equal(keyed.error, undefined);
    const edited = new Rig(JSON.parse(await readFile(join(workspace, storyPath), 'utf8')));
    edited.applyAnimation('garden-cafe-animation', 100); assert.equal(edited.layers.get('napkin').visible, false);
    edited.applyAnimation('garden-cafe-animation', 500); assert.equal(edited.layers.get('napkin').visible, true);
    const beforeBadEdit = await readFile(join(workspace, storyPath), 'utf8');
    const rejected = await request('tools/call', { name: 'set_animation_keyframes', arguments: { path: storyPath, clipId: 'garden-cafe-animation', targetId: 'root', property: 'rotation', keyframes: [{ frame: 5, value: 'invalid' }] } });
    assert.ok(rejected.error); assert.equal(await readFile(join(workspace, storyPath), 'utf8'), beforeBadEdit);

    const qualityScenePath = relative(workspace, join(temp, 'quality-showroom.json'));
    const qualityScene = await request('tools/call', { name: 'compose_scene', arguments: { path: qualityScenePath, preset: 'showroom_stumble', palette: 'pastel', character: 'suited', camera: 'follow', duration: 5, fps: 24 } });
    assert.equal(qualityScene.error, undefined, JSON.stringify(qualityScene));
    assert.equal(qualityScene.result.structuredContent.quality.ok, true);
    assert.equal(qualityScene.result.structuredContent.quality.maxJointGap, 0);
    const qualityValidated = await request('tools/call', { name: 'validate_scene', arguments: { path: qualityScenePath } });
    assert.equal(qualityValidated.error, undefined, JSON.stringify(qualityValidated));
    assert.equal(qualityValidated.result.structuredContent.ok, true);
    assert.equal(qualityValidated.result.structuredContent.maxJointGap, 0);

    const created = await request('tools/call', { name: 'create_physics_ball_scene', arguments: { path: relativePath, gravityY: 900, restitution: 0.82, durationSeconds: 4, overwrite: true } });
    const createdPayload = JSON.parse(created.result.content[0].text);
    assert.equal(createdPayload.summary.dynamics.gravityY, 900);
    assert.equal(createdPayload.summary.timeline.endFrame, 120);

    const updated = await request('tools/call', { name: 'update_physics_settings', arguments: { path: relativePath, bodyId: 'ball-body-dynamic', friction: 0.25, mass: 2 } });
    const updatedPayload = JSON.parse(updated.result.content[0].text);
    assert.equal(updatedPayload.summary.dynamics.bodies.find(body => body.id === 'ball-body-dynamic').mass, 2);
    assert.equal(updatedPayload.summary.dynamics.bodies.find(body => body.id === 'ball-body-dynamic').friction, 0.25);

    const inspected = await request('tools/call', { name: 'inspect_project', arguments: { path: relativePath } });
    const inspectedPayload = JSON.parse(inspected.result.content[0].text);
    assert.equal(inspectedPayload.dynamics.endFrame, 120);
    assert.equal(inspectedPayload.dynamics.bodies.length, 2);

    const raw = JSON.parse(await readFile(join(workspace, relativePath), 'utf8'));
    assert.equal(raw.dynamics.gravityY, 900);
    assert.equal(raw.dynamics.bodies.find(body => body.id === 'ball-body-dynamic').mass, 2);

    const traversal = await request('tools/call', { name: 'inspect_project', arguments: { path: '../package.json' } });
    assert.equal(traversal.error.code, -32000);
  } finally {
    for (const { timer } of pending.values()) clearTimeout(timer);
    input.close();
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    await rm(temp, { recursive: true, force: true });
  }
});
