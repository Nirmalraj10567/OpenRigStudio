import { createId } from './Rig';
import type { Rig } from './Rig';
import type { ControllerBinding, ControllerCondition, ControllerDefinition, ControllerStateDefinition } from './model';
import { resolveControllerAction } from './controllers';

/** Resolve existing assets only. Missing semantic clips leave unassigned states. */
function semanticAction(rig: Rig, names: string[]): string | undefined {
  for (const name of names) {
    const pattern = new RegExp(`(^|[^a-z])${name}([^a-z]|$)`, 'i');
    const library = rig.actionLibrary.find(action => pattern.test(action.name) && resolveControllerAction(action.id, rig.actionLibrary, rig.animations));
    if (library) return library.id;
    const clip = rig.animations.find(item => pattern.test(item.name));
    if (clip) return clip.id;
  }
  return undefined;
}

function binding(inputId: string, parameter: string, scale = 1, targetId?: string, actionId = ''): ControllerBinding {
  return { inputId, actionId, ...(targetId ? { targetId } : {}), parameter, scale, deadzone: .1, invert: false };
}

export function createCustomControllerDefinition(name = 'Custom controller'): ControllerDefinition {
  return { id: createId('controller'), name: name.trim() || 'Custom controller', type: 'custom',
    inputs: [{ id: 'action', name: 'Action', type: 'button' }], bindings: [], states: [], transitions: [] };
}

export function createCarControllerDefinition(rig: Rig): ControllerDefinition {
  const body = rig.getRoots().find(bone => /body|chassis|car/i.test(bone.name)) ?? rig.getRoots()[0];
  const drive = semanticAction(rig, ['drive', 'driving', 'move']);
  const idle = semanticAction(rig, ['idle', 'rest']);
  const definition: ControllerDefinition = {
    id: createId('controller'), name: 'Car controller', type: 'car',
    inputs: [{ id: 'throttle', name: 'Throttle', type: 'axis' }, { id: 'steer', name: 'Steering', type: 'axis' }],
    bindings: [binding('throttle', 'speed', 120, body?.id), binding('steer', 'steer', .45, body?.id)],
    states: [
      { id: 'idle', name: 'Idle', ...(idle ? { actionId: idle } : {}), priority: 0, conditions: [] },
      { id: 'drive', name: 'Drive', ...(drive ? { actionId: drive } : {}), priority: 10,
        conditions: [{ inputId: 'throttle', operator: '>', threshold: .1, absolute: true }] },
    ], transitions: [], initialStateId: 'idle',
  };
  const wheels = [...rig.bones.values()].filter(bone => /wheel|tire|tyre/i.test(bone.name));
  const wheelLayers = [...rig.layers.values()].filter(layer => /wheel|tire|tyre/i.test(layer.name)
    && !wheels.some(wheel => wheel.id === layer.boundBoneId));
  [...wheels, ...wheelLayers].forEach(wheel => {
    definition.bindings.push(binding('throttle', 'wheelRotation', 6, wheel.id));
  });
  return definition;
}

export function createCharacterControllerDefinition(rig: Rig): ControllerDefinition {
  const movement = (operator: ControllerCondition['operator'], threshold: number): ControllerCondition =>
    ({ inputId: 'move', component: 'magnitude', operator, threshold });
  const state = (id: string, priority: number, conditions: ControllerCondition[], names: string[], loop = true): ControllerStateDefinition => {
    const actionId = semanticAction(rig, names);
    return { id, name: id[0].toUpperCase() + id.slice(1), ...(actionId ? { actionId } : {}), priority, conditions, loop };
  };
  const states = [
    state('idle', 0, [], ['idle', 'rest']),
    state('walk', 10, [movement('>', .1)], ['walk', 'walking']),
    state('run', 20, [movement('>=', .7)], ['run', 'running']),
    state('jump', 30, [{ inputId: 'jump', operator: 'pressed' }], ['jump', 'jumping'], false),
    state('attack', 40, [{ inputId: 'attack', operator: 'pressed' }], ['attack', 'punch', 'hit'], false),
  ];
  return {
    id: createId('controller'), name: 'Character controller', type: 'character',
    inputs: [{ id: 'move', name: 'Move', type: 'joystick' }, { id: 'jump', name: 'Jump', type: 'button' }, { id: 'attack', name: 'Attack', type: 'button' }],
    bindings: [{ ...binding('move', 'speed', 100, rig.getRoots()[0]?.id), component: 'x' }],
    states, initialStateId: 'idle',
    transitions: states.map(item => ({ from: '*', to: item.id, priority: item.priority, conditions: item.conditions ?? [] })),
  };
}
