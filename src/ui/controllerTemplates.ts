import { createId } from '../engine/Rig';
import type { ActionLibraryItem, AnimationClip, ControllerDefinition } from '../engine/model';
import type { ControllerKeys } from './ControllerEditor';

/** Templates contain references and rules only. They never copy or create clips. */
export function makeControllerTemplate(type: ControllerDefinition['type'], library: ActionLibraryItem[], clips: AnimationClip[]): { definition: ControllerDefinition; keys: ControllerKeys } {
  const action = (...names: string[]) => {
    const match = (name: string) => names.some(candidate => candidate.toLowerCase() === name.toLowerCase());
    return library.find(item => match(item.name))?.id ?? clips.find(item => match(item.name))?.id ?? names[0];
  };
  const definition: ControllerDefinition = { id: createId('controller'), name: type === 'car' ? 'Car controller' : type === 'character' ? 'Boy controller' : 'Custom controller', type, inputs: [], bindings: [], states: [], transitions: [] };
  if (type === 'car') {
    definition.inputs = [{ id: 'throttle', name: 'Forward / reverse', type: 'axis' }, { id: 'steering', name: 'Turn', type: 'joystick' }, { id: 'brake', name: 'Brake', type: 'button' }];
    definition.states = [
      { id: 'idle', name: 'Idle', actionId: action('Idle', 'Car idle'), priority: 0, conditions: [] },
      { id: 'forward', name: 'Forward', actionId: action('Forward', 'Drive forward', 'Car forward'), priority: 10, conditions: [{ inputId: 'throttle', operator: '>', threshold: .1 }] },
      { id: 'reverse', name: 'Reverse', actionId: action('Reverse', 'Drive reverse', 'Car reverse'), priority: 10, conditions: [{ inputId: 'throttle', operator: '<', threshold: -.1 }] },
      { id: 'left', name: 'Turn left', actionId: action('Turn left', 'Left'), priority: 20, conditions: [{ inputId: 'steering', component: 'x', operator: '<', threshold: -.2 }] },
      { id: 'right', name: 'Turn right', actionId: action('Turn right', 'Right'), priority: 20, conditions: [{ inputId: 'steering', component: 'x', operator: '>', threshold: .2 }] },
      { id: 'brake', name: 'Brake', actionId: action('Brake', 'Braking'), priority: 100, conditions: [{ inputId: 'brake', operator: 'pressed' }] },
    ];
    definition.bindings = [{ inputId: 'throttle', actionId: '', parameter: 'speed', scale: 100, deadzone: .1, invert: false }, { inputId: 'steering', actionId: '', parameter: 'steer', component: 'x', scale: .5, deadzone: .1, invert: false }];
    definition.initialStateId = 'idle';
    return { definition, keys: { throttle: { positive: 'KeyW', negative: 'KeyS' }, steering: { positive: 'KeyD', negative: 'KeyA', up: 'ArrowUp', down: 'ArrowDown' }, brake: { positive: 'Space' } } };
  }
  if (type === 'character') {
    definition.inputs = [{ id: 'move', name: 'Walk forward / backward', type: 'joystick' }, { id: 'jump', name: 'Jump', type: 'button' }, { id: 'sit', name: 'Sit', type: 'button' }];
    definition.states = [
      { id: 'idle', name: 'Idle', actionId: action('Idle', 'Boy idle'), priority: 0, conditions: [] },
      { id: 'walk-forward', name: 'Walk forward', actionId: action('Walk forward', 'Walk', 'Boy walk forward'), priority: 10, conditions: [{ inputId: 'move', component: 'y', operator: '>', threshold: .1 }] },
      { id: 'walk-backward', name: 'Walk backward', actionId: action('Walk backward', 'Walk back', 'Boy walk backward'), priority: 10, conditions: [{ inputId: 'move', component: 'y', operator: '<', threshold: -.1 }] },
      { id: 'sit', name: 'Sit', actionId: action('Sit', 'Boy sit'), priority: 50, conditions: [{ inputId: 'sit', operator: 'pressed' }], loop: false },
      { id: 'jump', name: 'Jump', actionId: action('Jump', 'Boy jump'), priority: 100, conditions: [{ inputId: 'jump', operator: 'pressed' }], loop: false },
    ];
    definition.initialStateId = 'idle';
    return { definition, keys: { move: { positive: 'KeyD', negative: 'KeyA', up: 'KeyW', down: 'KeyS' }, jump: { positive: 'Space' }, sit: { positive: 'KeyC' } } };
  }
  return { definition, keys: {} };
}
