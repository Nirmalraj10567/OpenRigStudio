export type CharacterJoystickType = 'virtual' | 'keyboard' | 'gamepad';

export type CharacterAnimationMap = {
  idle: string;
  walk: string;
  run: string;
  jump: string;
  attack?: string;
};

export type CharacterJoystickPosition = {
  x: number;
  y: number;
};

/**
 * Runtime configuration for one independently controlled character.
 *
 * The character id is deliberately part of the config rather than living on
 * a shared controller. This makes it impossible for a joystick event to lose
 * its target while the UI is rendering multiple players.
 */
export type CharacterControl = {
  characterId: string;
  enabled: boolean;
  joystickType: CharacterJoystickType;
  deadZone: number;
  moveSpeed: number;
  runMultiplier: number;
  allowEightDirections: boolean;
  animationMap: CharacterAnimationMap;
  joystickPosition: CharacterJoystickPosition;
};

export type CharacterJoystickInput = { x: number; y: number };
export type CharacterAction = 'attack' | 'jump';
export type CharacterAnimation = string;

export type CharacterRuntime = {
  position: { x: number; y: number };
  input: CharacterJoystickInput;
  animation: CharacterAnimation;
  action: CharacterAction | null;
  actionUntil: number;
};

export type CharacterStageBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const DEFAULT_BOUNDS: CharacterStageBounds = { minX: 52, maxX: 748, minY: 38, maxY: 218 };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function normalizeCharacterJoystick(input: Partial<CharacterJoystickInput> | undefined): CharacterJoystickInput {
  const x = clamp(Number.isFinite(input?.x) ? Number(input?.x) : 0, -1, 1);
  const y = clamp(Number.isFinite(input?.y) ? Number(input?.y) : 0, -1, 1);
  const length = Math.hypot(x, y);
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
}

/** Continuously rescales input outside the dead zone so full travel stays responsive. */
export function applyCharacterDeadZone(input: CharacterJoystickInput, deadZone = 0): CharacterJoystickInput {
  const normalized = normalizeCharacterJoystick(input);
  const zone = clamp(Number.isFinite(deadZone) ? deadZone : 0, 0, .99);
  const magnitude = Math.hypot(normalized.x, normalized.y);
  if (magnitude <= zone || magnitude === 0) return { x: 0, y: 0 };
  const rescaled = (magnitude - zone) / (1 - zone);
  return { x: normalized.x / magnitude * rescaled, y: normalized.y / magnitude * rescaled };
}

/** Snap only the angle, keeping the post-dead-zone travel magnitude intact. */
export function snapCharacterToEightDirections(input: CharacterJoystickInput): CharacterJoystickInput {
  const magnitude = Math.min(1, Math.hypot(input.x, input.y));
  if (magnitude === 0) return { x: 0, y: 0 };
  const angle = Math.atan2(input.y, input.x);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  return { x: Math.cos(snapped) * magnitude, y: Math.sin(snapped) * magnitude };
}

export function processCharacterJoystick(control: CharacterControl, input: CharacterJoystickInput): CharacterJoystickInput {
  const afterDeadZone = applyCharacterDeadZone(input, control.deadZone);
  return control.allowEightDirections ? snapCharacterToEightDirections(afterDeadZone) : afterDeadZone;
}

export function resolveCharacterAnimation(
  control: CharacterControl,
  input: CharacterJoystickInput,
  action: CharacterAction | null = null,
): CharacterAnimation {
  if (action === 'attack' && control.animationMap.attack) return control.animationMap.attack;
  if (action === 'jump') return control.animationMap.jump;
  const magnitude = Math.hypot(input.x, input.y);
  if (magnitude <= .001) return control.animationMap.idle;
  return magnitude >= .78 ? control.animationMap.run : control.animationMap.walk;
}

export function createCharacterRuntime(
  position: { x: number; y: number },
  animation: CharacterAnimation,
): CharacterRuntime {
  return { position: { ...position }, input: { x: 0, y: 0 }, animation, action: null, actionUntil: 0 };
}

export function triggerCharacterAction(
  runtime: CharacterRuntime,
  action: CharacterAction,
  now = 0,
  duration = 620,
): CharacterRuntime {
  return { ...runtime, action, actionUntil: now + Math.max(0, duration) };
}

/** Deterministic per-character movement step; no shared position or input is touched. */
export function stepCharacterRuntime(
  control: CharacterControl,
  runtime: CharacterRuntime,
  deltaSeconds: number,
  now = 0,
  bounds: CharacterStageBounds = DEFAULT_BOUNDS,
): CharacterRuntime {
  const input = control.enabled ? processCharacterJoystick(control, runtime.input) : { x: 0, y: 0 };
  const magnitude = Math.hypot(input.x, input.y);
  const running = magnitude >= .78;
  const speed = Math.max(0, Number.isFinite(control.moveSpeed) ? control.moveSpeed : 0)
    * (running ? Math.max(1, control.runMultiplier) : 1);
  const dt = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, .1);
  const position = {
    x: clamp(runtime.position.x + input.x * speed * dt, bounds.minX, bounds.maxX),
    y: clamp(runtime.position.y + input.y * speed * dt, bounds.minY, bounds.maxY),
  };
  const action = runtime.actionUntil > now ? runtime.action : null;
  return {
    ...runtime,
    position,
    input,
    action,
    animation: resolveCharacterAnimation(control, input, action),
    ...(action ? {} : { actionUntil: 0 }),
  };
}

export function createCharacterControl(characterId: string, overrides: Partial<CharacterControl> = {}): CharacterControl {
  return {
    characterId,
    enabled: true,
    joystickType: 'virtual',
    deadZone: .15,
    moveSpeed: 250,
    runMultiplier: 1.8,
    allowEightDirections: true,
    animationMap: { idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump', attack: 'Attack' },
    joystickPosition: { x: 50, y: 10 },
    ...overrides,
  };
}
