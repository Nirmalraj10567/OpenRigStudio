import type {
  ActionLibraryItem, AnimationClip, ControllerBinding, ControllerCondition, ControllerDefinition,
  ControllerEvaluation, ControllerInput, ControllerInputValue, ControllerInstance, ControllerStateDefinition,
} from './model';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 512
  && !['__proto__', 'constructor', 'prototype'].includes(value);
const number = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value.slice(0, 1024) : [];
const compareId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
function unique<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => !seen.has(item.id) && !!seen.add(item.id));
}

export function clampControllerAxis(value: unknown): number {
  return Math.max(-1, Math.min(1, number(value)));
}

/** Continuous rescaled deadzone: ±deadzone maps to zero, ±1 remains ±1. */
export function applyControllerDeadzone(value: unknown, deadzone = 0, invert = false): number {
  const axis = clampControllerAxis(value), zone = Math.max(0, Math.min(1, number(deadzone)));
  if (Math.abs(axis) <= zone || zone === 1) return 0;
  return Math.sign(axis) * (Math.abs(axis) - zone) / (1 - zone) * (invert ? -1 : 1);
}

export function normalizeControllerInputValue(input: ControllerInput, value: unknown): ControllerInputValue {
  if (input.type === 'button') return value === true || (typeof value === 'number' && Number.isFinite(value) && value > 0);
  if (input.type === 'axis') return clampControllerAxis(value);
  const x = object(value) ? clampControllerAxis(value.x) : clampControllerAxis(value);
  const y = object(value) ? clampControllerAxis(value.y) : 0;
  const length = Math.max(1, Math.hypot(x, y));
  return { x: x / length, y: y / length };
}

export function normalizeActionLibrary(value: unknown): ActionLibraryItem[] {
  return unique(list(value).flatMap((item): ActionLibraryItem[] => {
    if (!object(item) || !text(item.id)) return [];
    const animationId = text(item.animationId) ? item.animationId : undefined;
    const clipId = text(item.clipId) ? item.clipId : undefined;
    const actionName = text(item.actionName) ? item.actionName : undefined;
    if (!animationId && !clipId && !actionName) return [];
    return [{ id: item.id, name: text(item.name) ? item.name : actionName ?? 'Action',
      ...(animationId ? { animationId } : {}), ...(clipId ? { clipId } : {}), ...(actionName ? { actionName } : {}),
      ...(typeof item.loop === 'boolean' ? { loop: item.loop } : {}),
      ...(typeof item.speed === 'number' ? { speed: Math.max(0, Math.min(100, number(item.speed, 1))) } : {}) }];
  }));
}

function conditions(value: unknown, inputs: Set<string>): ControllerCondition[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 1024) return null;
  const result: ControllerCondition[] = [];
  for (const item of value) {
    if (!object(item) || !text(item.inputId) || !inputs.has(item.inputId)) return null;
    const operator = item.operator ?? '>=';
    if (!['>', '>=', '<', '<=', '==', '!=', 'pressed', 'released'].includes(String(operator))) return null;
    result.push({ inputId: item.inputId, operator: operator as ControllerCondition['operator'], threshold: number(item.threshold, .5),
      ...(item.component === 'x' || item.component === 'y' || item.component === 'magnitude' ? { component: item.component } : {}),
      ...(item.absolute === true ? { absolute: true } : {}) });
  }
  return result;
}

export function normalizeControllerDefinitions(value: unknown): ControllerDefinition[] {
  return unique(list(value).flatMap((item): ControllerDefinition[] => {
    if (!object(item) || !text(item.id)) return [];
    const inputs = unique(list(item.inputs).flatMap((input): ControllerInput[] => {
      if (!object(input) || !text(input.id) || !['button', 'axis', 'joystick'].includes(String(input.type))) return [];
      const normalized: ControllerInput = { id: input.id, name: text(input.name) ? input.name : input.id, type: input.type as ControllerInput['type'] };
      if (input.defaultValue !== undefined) normalized.defaultValue = normalizeControllerInputValue(normalized, input.defaultValue);
      return [normalized];
    }));
    const ids = new Set(inputs.map(input => input.id));
    const bindings = list(item.bindings).flatMap((binding): ControllerBinding[] => {
      if (!object(binding) || !text(binding.inputId) || !ids.has(binding.inputId) || !text(binding.parameter)) return [];
      return [{ inputId: binding.inputId, actionId: text(binding.actionId) ? binding.actionId : '',
        ...(text(binding.targetId) ? { targetId: binding.targetId } : {}), parameter: binding.parameter,
        scale: Math.max(-1e6, Math.min(1e6, number(binding.scale, 1))), deadzone: Math.max(0, Math.min(1, number(binding.deadzone))),
        invert: binding.invert === true,
        ...(binding.component === 'x' || binding.component === 'y' || binding.component === 'magnitude' ? { component: binding.component } : {}),
        ...(binding.priority !== undefined ? { priority: number(binding.priority) } : {}) }];
    });
    const states = unique(list(item.states).flatMap((state): ControllerStateDefinition[] => {
      if (!object(state) || !text(state.id)) return [];
      const checks = conditions(state.conditions, ids);
      if (!checks) return [];
      return [{ id: state.id, name: text(state.name) ? state.name : state.id,
        ...(text(state.actionId) ? { actionId: state.actionId } : {}), priority: number(state.priority), conditions: checks,
        ...(typeof state.loop === 'boolean' ? { loop: state.loop } : {}) }];
    }));
    const stateIds = new Set(states.map(state => state.id));
    const transitions: ControllerDefinition['transitions'] = list(item.transitions).flatMap(transition => {
      if (!object(transition) || !text(transition.from) || !text(transition.to)
        || (transition.from !== '*' && !stateIds.has(transition.from)) || !stateIds.has(transition.to)) return [];
      const checks = conditions(transition.conditions, ids);
      return checks ? [{ from: transition.from, to: transition.to, conditions: checks, priority: number(transition.priority) }] : [];
    });
    return [{ id: item.id, name: text(item.name) ? item.name : 'Controller',
      type: item.type === 'car' || item.type === 'character' ? item.type : 'custom', inputs, bindings, states, transitions,
      ...(text(item.initialStateId) && stateIds.has(item.initialStateId) ? { initialStateId: item.initialStateId } : {}) }];
  }));
}

export function normalizeControllerInstances(value: unknown, definitionIds?: Set<string>, rigId?: string): ControllerInstance[] {
  return unique(list(value).flatMap((item): ControllerInstance[] => {
    if (!object(item) || !text(item.id) || !text(item.definitionId) || (definitionIds && !definitionIds.has(item.definitionId))) return [];
    const targetRig = text(item.rigId) ? item.rigId : rigId;
    if (!targetRig) return [];
    return [{ id: item.id, definitionId: item.definitionId, rigId: targetRig, x: number(item.x), y: number(item.y),
      rotation: number(item.rotation), scale: Math.max(.01, Math.min(100, number(item.scale, 1))), visibleInRender: item.visibleInRender === true }];
  }));
}

export function controllerScalar(value: ControllerInputValue | undefined, component?: ControllerBinding['component']): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return clampControllerAxis(value);
  if (!value) return 0;
  return component === 'y' ? value.y : component === 'magnitude' ? Math.min(1, Math.hypot(value.x, value.y)) : value.x;
}

export function matchesControllerConditions(checks: ControllerCondition[] = [], inputs: Record<string, ControllerInputValue>): boolean {
  return checks.every(condition => {
    let value = controllerScalar(inputs[condition.inputId], condition.component);
    if (condition.absolute) value = Math.abs(value);
    const threshold = condition.threshold ?? .5;
    switch (condition.operator ?? '>=') {
      case '>': return value > threshold;
      case '>=': return value >= threshold;
      case '<': return value < threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      case '!=': return value !== threshold;
      case 'pressed': return value > .5;
      case 'released': return value <= .5;
    }
  });
}

/** Highest priority wins, ties by stable ID rather than input insertion order. */
export function chooseActiveControllerState(states: ControllerStateDefinition[], inputs: Record<string, ControllerInputValue>): ControllerStateDefinition | undefined {
  return states.filter(state => matchesControllerConditions(state.conditions, inputs))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || compareId(a, b))[0];
}

export function resolveControllerAction(actionId: string | undefined | null, library: ActionLibraryItem[], clips: AnimationClip[]): AnimationClip | undefined {
  if (!actionId) return undefined;
  const action = library.find(item => item.id === actionId);
  const id = action?.animationId ?? action?.clipId ?? actionId;
  const name = (action?.actionName ?? actionId).trim().toLowerCase();
  return clips.find(clip => clip.id === id) ?? [...clips].sort(compareId).find(clip => clip.name.trim().toLowerCase() === name);
}

/** Pure deterministic step. Unknown actions/targets are inert; callers resolve targets. */
export function evaluateControllerMapping(
  definition: ControllerDefinition, values: Record<string, ControllerInputValue>, dt = 0,
  previous?: ControllerEvaluation, library: ActionLibraryItem[] = [], clips: AnimationClip[] = [], controllerId = definition.id,
): ControllerEvaluation {
  const inputs = Object.fromEntries(definition.inputs.map(input => [input.id, normalizeControllerInputValue(input, values[input.id] ?? input.defaultValue)]));
  const delta = Math.max(0, number(dt));
  let state = definition.states.find(item => item.id === (previous?.stateId ?? definition.initialStateId));
  if (definition.transitions.length && state) {
    const transition = definition.transitions.filter(item => (item.from === '*' || item.from === state!.id)
      && matchesControllerConditions(item.conditions, inputs))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)
        || (definition.states.find(s => s.id === b.to)?.priority ?? 0) - (definition.states.find(s => s.id === a.to)?.priority ?? 0)
        || compareId({ id: a.to }, { id: b.to }))[0];
    if (transition) state = definition.states.find(item => item.id === transition.to);
  } else state = chooseActiveControllerState(definition.states, inputs) ?? state;
  const parameters: Record<string, number> = {};
  const accumulators = { ...previous?.accumulators };
  const outputs: ControllerEvaluation['outputs'] = [];
  const candidates: Array<{ id: string; priority: number }> = [];
  definition.bindings.forEach((binding, index) => {
    const value = applyControllerDeadzone(controllerScalar(inputs[binding.inputId], binding.component), binding.deadzone, binding.invert) * binding.scale;
    parameters[binding.parameter] = number((parameters[binding.parameter] ?? 0) + value);
    if (binding.parameter === 'action' && Math.abs(value) > 0 && resolveControllerAction(binding.actionId, library, clips)) {
      candidates.push({ id: binding.actionId, priority: binding.priority ?? 0 });
    }
    if (!binding.targetId) return;
    let parameter = binding.parameter, mapped = value;
    if (['speed', 'velocityX', 'velocityY', 'wheelRotation'].includes(parameter)) {
      mapped = number((accumulators[index] ?? 0) + value * delta);
      accumulators[index] = mapped;
      parameter = parameter === 'wheelRotation' ? 'rotation' : parameter === 'velocityY' ? 'y' : 'x';
    } else if (parameter === 'steer') parameter = 'rotation';
    else if (parameter === 'wheelPosition') parameter = 'y';
    if (['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'].includes(parameter)) outputs.push({ targetId: binding.targetId, parameter, value: mapped });
  });
  const stateClip = resolveControllerAction(state?.actionId, library, clips);
  const actionId = stateClip ? state!.actionId! : candidates.sort((a, b) => b.priority - a.priority || compareId(a, b))[0]?.id ?? null;
  const clip = resolveControllerAction(actionId, library, clips);
  const changed = previous?.stateId !== (state?.id ?? null) || previous?.actionId !== actionId;
  const stateTime = number((changed ? 0 : previous?.stateTime ?? 0) + delta);
  const action = library.find(item => item.id === actionId);
  const start = number(clip?.startFrame), duration = Math.max(0, number(clip?.endFrame) - start);
  const frames = number(stateTime * Math.max(.001, number(clip?.fps, 24)) * number(action?.speed, 1));
  const loop = state?.loop ?? action?.loop ?? true;
  const frame = start + (duration > 0 ? loop ? frames % duration : Math.min(duration, frames) : 0);
  return { controllerId, definitionId: definition.id, inputs, stateId: state?.id ?? null, actionId,
    clipId: clip?.id ?? null, frame, elapsed: number((previous?.elapsed ?? 0) + delta), stateTime, parameters, outputs, accumulators };
}

export function chooseActiveAction(states: ControllerStateDefinition[], inputs: Record<string, ControllerInputValue>): string | null {
  return chooseActiveControllerState(states, inputs)?.actionId ?? null;
}
