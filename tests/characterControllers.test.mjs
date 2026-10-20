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
const {
  applyCharacterDeadZone,
  createCharacterControl,
  createCharacterRuntime,
  processCharacterJoystick,
  resolveCharacterAnimation,
  snapCharacterToEightDirections,
  stepCharacterRuntime,
} = compiled.exports;

test('character control input applies a continuous dead zone and eight-direction snap', () => {
  assert.deepEqual(applyCharacterDeadZone({ x: .1, y: 0 }, .15), { x: 0, y: 0 });
  const control = createCharacterControl('player-1', { deadZone: .1, allowEightDirections: true });
  const input = processCharacterJoystick(control, { x: .72, y: .7 });
  assert.ok(Math.abs(input.x - input.y) < .02);
  assert.ok(Math.hypot(input.x, input.y) <= 1);
  assert.deepEqual(snapCharacterToEightDirections({ x: 0, y: 0 }), { x: 0, y: 0 });
});

test('animation mapping stays scoped to the control that owns the input', () => {
  const first = createCharacterControl('player-1');
  const second = createCharacterControl('player-2', { animationMap: { idle: 'Rest', walk: 'Step', run: 'Sprint', jump: 'Hop', attack: 'Strike' } });
  assert.equal(resolveCharacterAnimation(first, { x: 0, y: 0 }), 'Idle');
  assert.equal(resolveCharacterAnimation(second, { x: .3, y: 0 }), 'Step');
  assert.equal(resolveCharacterAnimation(second, { x: 1, y: 0 }, 'attack'), 'Strike');
});

test('two character runtime steps move independently and clamp to their own bounds', () => {
  const leftControl = createCharacterControl('left', { moveSpeed: 100, runMultiplier: 1 });
  const rightControl = createCharacterControl('right', { moveSpeed: 300, runMultiplier: 2 });
  const left = stepCharacterRuntime(leftControl, { ...createCharacterRuntime({ x: 100, y: 80 }, 'Idle'), input: { x: 1, y: 0 } }, .1, 100);
  const right = stepCharacterRuntime(rightControl, { ...createCharacterRuntime({ x: 100, y: 80 }, 'Idle'), input: { x: 0, y: 1 } }, .1, 100);
  assert.equal(left.position.x, 110);
  assert.equal(left.position.y, 80);
  assert.equal(right.position.x, 100);
  assert.equal(right.position.y, 140);
  assert.equal(left.animation, 'Run');
  assert.equal(right.animation, 'Run');
});
