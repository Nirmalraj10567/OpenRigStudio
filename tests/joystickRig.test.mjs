import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({
  stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, createId } = compiled.exports;

function clip(id, name, rootId, value) {
  return { id, name, fps: 24, startFrame: 0, endFrame: 12, tracks: [{ id: `${id}-track`, targetId: rootId, property: 'transform', keyframes: [{ id: `${id}-key`, frame: 0, value: { x: 200, y: 180, rotation: value, scaleX: 1, scaleY: 1 } }] }] };
}

function makeRig() {
  const rig = new Rig();
  const root = rig.addBone(null, 'Player root', 80);
  const controllerId = createId('controller');
  const definition = {
    id: controllerId,
    name: 'Player joystick', type: 'character',
    inputs: [{ id: 'move', name: 'Move', type: 'joystick' }, { id: 'jump', name: 'Jump', type: 'button' }, { id: 'attack', name: 'Attack', type: 'button' }],
    bindings: [{ inputId: 'move', actionId: '', targetId: root, parameter: 'x', component: 'x', scale: 80, deadzone: .15, invert: false }],
    states: [
      { id: 'idle', name: 'Idle', actionId: 'idle', priority: 0, conditions: [] },
      { id: 'jump', name: 'Jump', actionId: 'jump', priority: 100, conditions: [{ inputId: 'jump', operator: 'pressed' }], loop: false },
      { id: 'attack', name: 'Attack', actionId: 'attack', priority: 90, conditions: [{ inputId: 'attack', operator: 'pressed' }], loop: false },
    ],
    transitions: [], initialStateId: 'idle',
  };
  rig.controllers = [definition];
  rig.animations = [clip('idle', 'Idle', root, 0), clip('jump', 'Jump', root, .3), clip('attack', 'Attack', root, -.3)];
  const instanceId = rig.addControllerInstance(controllerId);
  return { rig, root, instanceId };
}

test('joystick input reaches the real Rig with dead zone and release-to-neutral behavior', () => {
  const { rig, root, instanceId } = makeRig();
  rig.setControllerInput(instanceId, 'move', { x: .05, y: 0 });
  rig.applyController(instanceId, .1);
  assert.equal(rig.getControllerEvaluation(instanceId).inputs.move.x, .05);
  assert.equal(rig.getConstraintBaseLocal(root).x, rig.bones.get(root).local.x);
  rig.setControllerInput(instanceId, 'move', { x: .8, y: 0 });
  rig.applyController(instanceId, .1);
  assert.ok(rig.getConstraintBaseLocal(root).x > rig.bones.get(root).local.x, 'strong right input did not move the real root');
  rig.resetControllerInputs(instanceId);
  assert.equal(rig.getConstraintBaseLocal(root).x, rig.bones.get(root).local.x, 'reset left a controller overlay behind');
});

test('joystick action inputs resolve jump and attack clips on the same real Rig', () => {
  const { rig, instanceId } = makeRig();
  rig.setControllerInput(instanceId, 'jump', true);
  const jump = rig.applyController(instanceId, 0);
  assert.equal(jump.clipId, 'jump');
  rig.resetControllerInputs(instanceId);
  rig.setControllerInput(instanceId, 'attack', true);
  const attack = rig.applyController(instanceId, 0);
  assert.equal(attack.clipId, 'attack');
});
