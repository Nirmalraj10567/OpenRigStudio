import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createId } from '../engine/Rig';
import type { ActionLibraryItem, AnimationClip, ControllerBinding, ControllerCondition, ControllerDefinition, ControllerInput } from '../engine/model';
import { resolveControllerAction } from '../engine/controllers';
import { ControllerNumber, ControllerText } from './ControllerControls';
import { ControllerKeyField } from './ControllerTestPad';
import type { TestInput } from './ControllerTestPad';

type Target = { id: string; name: string; kind: string };
export type ControllerKeys = Record<string, Pick<TestInput, 'positive' | 'negative' | 'up' | 'down'>>;
type Edit = (change: (definition: ControllerDefinition) => void) => void;
type LibraryProps = { library: ActionLibraryItem[]; clips: AnimationClip[] };

export function ControllerActionSelect({ value, onChange, library, clips, label = 'Saved action / animation' }: LibraryProps & { value?: string; onChange: (id: string) => void; label?: string }) {
  const known = library.some(action => action.id === value) || clips.some(clip => clip.id === value);
  const resolved = resolveControllerAction(value, library, clips);
  return <label className="controller-field">{label}<select value={value ?? ''} onChange={event => onChange(event.target.value)}>
    <option value="">No action · parameters only</option>
    {value && !known && <option value={value}>{resolved ? `Named action: ${value}` : `Missing action: ${value}`}</option>}
    {library.length > 0 && <optgroup label="Action library references">{library.map(action => <option key={action.id} value={action.id}>{action.name}{resolveControllerAction(action.id, library, clips) ? '' : ' (missing clip)'}</option>)}</optgroup>}
    {clips.length > 0 && <optgroup label="Existing animation clips">{clips.map(clip => <option key={clip.id} value={clip.id}>{clip.name}</option>)}</optgroup>}
  </select></label>;
}

function ConditionsEditor({ value, inputs, onChange }: { value: ControllerCondition[]; inputs: ControllerInput[]; onChange: (conditions: ControllerCondition[]) => void }) {
  const update = (index: number, patch: Partial<ControllerCondition>) => onChange(value.map((condition, i) => i === index ? { ...condition, ...patch } : condition));
  return <div>
    {value.map((condition, index) => <div className="controller-card" key={index}>
      <label className="controller-field">Condition input<select value={condition.inputId} onChange={event => update(index, { inputId: event.target.value })}>
        {!inputs.some(input => input.id === condition.inputId) && <option value={condition.inputId}>Missing input</option>}
        {inputs.map(input => <option key={input.id} value={input.id}>{input.name}</option>)}
      </select></label>
      <div className="controller-grid"><label className="controller-field">Comparison<select value={condition.operator ?? '>='} onChange={event => update(index, { operator: event.target.value as ControllerCondition['operator'] })}>{['>', '>=', '<', '<=', '==', '!=', 'pressed', 'released'].map(operator => <option key={operator}>{operator}</option>)}</select></label>
        <ControllerNumber label="Threshold" value={condition.threshold ?? .5} onChange={threshold => update(index, { threshold })} />
      </div>
      {inputs.find(input => input.id === condition.inputId)?.type === 'joystick' && <label className="controller-field">Joystick component<select value={condition.component ?? 'x'} onChange={event => update(index, { component: event.target.value as ControllerCondition['component'] })}><option value="x">X · horizontal</option><option value="y">Y · vertical</option><option value="magnitude">Magnitude</option></select></label>}
      <label className="check-label"><input type="checkbox" checked={condition.absolute ?? false} onChange={event => update(index, { absolute: event.target.checked })} />Use absolute value</label>
      <button className="mini-text" onClick={() => onChange(value.filter((_, i) => i !== index))}>Remove condition {index + 1}</button>
    </div>)}
    <button className="mini-text" disabled={!inputs.length} onClick={() => onChange([...value, { inputId: inputs[0].id, operator: '>', threshold: .1 }])}>+ Add condition</button>
    <p className="scope-note">{value.length ? 'All conditions must match.' : 'No conditions: always eligible.'}</p>
  </div>;
}

const PARAMETERS = ['action', 'speed', 'velocityX', 'velocityY', 'steer', 'wheelRotation', 'wheelPosition', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'];

export function ControllerEditor({ definition, edit, library, clips, targets, keys, onKeysChange }: LibraryProps & {
  definition: ControllerDefinition; edit: Edit; targets: Target[]; keys: ControllerKeys;
  onKeysChange: (inputId: string, keys: ControllerKeys[string]) => void;
}) {
  const [tab, setTab] = useState<'inputs' | 'states'>('inputs');
  const updateInput = (id: string, patch: Partial<ControllerInput>) => edit(draft => { const input = draft.inputs.find(item => item.id === id); if (input) Object.assign(input, patch); });
  const updateBinding = (index: number, patch: Partial<ControllerBinding>) => edit(draft => { if (draft.bindings[index]) Object.assign(draft.bindings[index], patch); });
  return <>
    <div className="controller-tabs" role="tablist" aria-label="Controller editor">
      <button role="tab" aria-selected={tab === 'inputs'} onClick={() => setTab('inputs')}>Inputs & mappings</button>
      <button role="tab" aria-selected={tab === 'states'} onClick={() => setTab('states')}>States & transitions</button>
    </div>
    {tab === 'inputs' ? <>
      <p className="scope-note">Inputs reference saved animations. Choose a bone/layer for parameter offsets; rotations are radians, speeds are units/second.</p>
      {definition.inputs.map(input => <details className="controller-card" key={input.id}>
        <summary>{input.name}<small>{input.type} · {definition.bindings.filter(binding => binding.inputId === input.id).length} mappings</small></summary>
        <ControllerText label="Input name" value={input.name} onChange={name => updateInput(input.id, { name })} />
        <label className="controller-field">Input type<select value={input.type} onChange={event => updateInput(input.id, { type: event.target.value as ControllerInput['type'], defaultValue: 0 })}><option value="button">Button</option><option value="axis">Axis</option><option value="joystick">Joystick</option></select></label>
        <div className="controller-grid">
          <ControllerKeyField label={input.type === 'button' ? 'Button key' : 'Positive / right key'} value={keys[input.id]?.positive} onChange={positive => onKeysChange(input.id, { ...keys[input.id], positive })} />
          {input.type !== 'button' && <ControllerKeyField label="Negative / left key" value={keys[input.id]?.negative} onChange={negative => onKeysChange(input.id, { ...keys[input.id], negative })} />}
          {input.type === 'joystick' && <><ControllerKeyField label="Up key" value={keys[input.id]?.up} onChange={up => onKeysChange(input.id, { ...keys[input.id], up })} /><ControllerKeyField label="Down key" value={keys[input.id]?.down} onChange={down => onKeysChange(input.id, { ...keys[input.id], down })} /></>}
        </div>
        <p className="scope-note">Focus a key field, press a key to map it. Backspace clears.</p>
        <button className="danger-button full-button" onClick={() => edit(draft => {
          draft.inputs = draft.inputs.filter(item => item.id !== input.id);
          draft.bindings = draft.bindings.filter(binding => binding.inputId !== input.id);
          draft.states = draft.states.filter(state => !state.conditions?.some(condition => condition.inputId === input.id));
          const ids = new Set(draft.states.map(state => state.id));
          draft.transitions = draft.transitions.filter(transition => !transition.conditions.some(condition => condition.inputId === input.id) && (transition.from === '*' || ids.has(transition.from)) && ids.has(transition.to));
          if (!ids.has(draft.initialStateId ?? '')) draft.initialStateId = draft.states[0]?.id;
        })}><Trash2 size={12} /> Remove input & dependent rules</button>
      </details>)}
      <div className="controller-toolbar">{(['button', 'axis', 'joystick'] as const).map(type => <button className="secondary-button" key={type} onClick={() => edit(draft => draft.inputs.push({ id: createId('input'), name: `${type[0].toUpperCase()}${type.slice(1)} ${draft.inputs.length + 1}`, type }))}><Plus size={11} />{type}</button>)}</div>
      <div className="property-subtitle">Mappings</div>
      {definition.bindings.map((binding, index) => {
        const input = definition.inputs.find(item => item.id === binding.inputId);
        return <details className="controller-card" key={index}>
          <summary>{input?.name ?? 'Missing input'} → {binding.parameter}<small>{binding.targetId ? targets.find(target => target.id === binding.targetId)?.name ?? 'Missing target' : binding.actionId ? resolveControllerAction(binding.actionId, library, clips)?.name ?? `Missing: ${binding.actionId}` : 'Choose action or target'}</small></summary>
          <label className="controller-field">Input<select value={binding.inputId} onChange={event => updateBinding(index, { inputId: event.target.value })}>{!input && <option value={binding.inputId}>Missing input</option>}{definition.inputs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <ControllerActionSelect value={binding.actionId} onChange={actionId => updateBinding(index, { actionId })} library={library} clips={clips} />
          <label className="controller-field">Target bone / layer<select value={binding.targetId ?? ''} onChange={event => updateBinding(index, { targetId: event.target.value || undefined })}><option value="">No target · action only</option>{binding.targetId && !targets.some(target => target.id === binding.targetId) && <option value={binding.targetId}>Missing target: {binding.targetId}</option>}{targets.map(target => <option key={target.id} value={target.id}>{target.kind} · {target.name}</option>)}</select></label>
          <label className="controller-field">Parameter<select value={binding.parameter} onChange={event => updateBinding(index, { parameter: event.target.value })}>{[...new Set([...PARAMETERS, binding.parameter])].map(parameter => <option key={parameter}>{parameter}</option>)}</select></label>
          {input?.type === 'joystick' && <label className="controller-field">Joystick component<select value={binding.component ?? 'x'} onChange={event => updateBinding(index, { component: event.target.value as ControllerBinding['component'] })}><option value="x">X · horizontal</option><option value="y">Y · vertical</option><option value="magnitude">Magnitude</option></select></label>}
          <div className="controller-grid"><ControllerNumber label="Scale" value={binding.scale} onChange={scale => updateBinding(index, { scale })} /><ControllerNumber label="Deadzone" value={binding.deadzone} min={0} max={1} step={.01} onChange={deadzone => updateBinding(index, { deadzone })} /><ControllerNumber label="Action priority" value={binding.priority ?? 0} step={1} onChange={priority => updateBinding(index, { priority })} /></div>
          <label className="check-label"><input type="checkbox" checked={binding.invert} onChange={event => updateBinding(index, { invert: event.target.checked })} />Invert direction</label>
          <p className="scope-note">“action” plays the chosen clip while active. Other parameters offset the chosen target. State actions take priority over input actions.</p>
          <button className="danger-button full-button" onClick={() => edit(draft => { draft.bindings.splice(index, 1); })}>Remove mapping</button>
        </details>;
      })}
      <button className="secondary-button full-button" disabled={!definition.inputs.length} onClick={() => edit(draft => draft.bindings.push({ inputId: draft.inputs[0].id, actionId: '', parameter: 'action', scale: 1, deadzone: .1, invert: false }))}><Plus size={12} /> Add mapping</button>
    </> : <>
      <p className="scope-note">Without transitions, the highest-priority eligible state wins. With transitions, rules run from the current state. Choose saved clips for the template’s named states.</p>
      <label className="controller-field">Initial state<select value={definition.initialStateId ?? ''} onChange={event => edit(draft => { draft.initialStateId = event.target.value || undefined; })}><option value="">Automatic</option>{definition.states.map(state => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>
      {definition.states.map(state => <details className="controller-card" key={state.id}>
        <summary>{state.name}<small>{state.actionId ? resolveControllerAction(state.actionId, library, clips)?.name ?? `Missing: ${state.actionId}` : 'No clip selected'} · priority {state.priority ?? 0}</small></summary>
        <ControllerText label="State name" value={state.name} onChange={name => edit(draft => { draft.states.find(item => item.id === state.id)!.name = name; })} />
        <ControllerActionSelect value={state.actionId} onChange={actionId => edit(draft => { draft.states.find(item => item.id === state.id)!.actionId = actionId || undefined; })} library={library} clips={clips} />
        <ControllerNumber label="State priority" value={state.priority ?? 0} step={1} onChange={priority => edit(draft => { draft.states.find(item => item.id === state.id)!.priority = priority; })} />
        <label className="check-label"><input type="checkbox" checked={state.loop ?? true} onChange={event => edit(draft => { draft.states.find(item => item.id === state.id)!.loop = event.target.checked; })} />Loop animation</label>
        <ConditionsEditor value={state.conditions ?? []} inputs={definition.inputs} onChange={conditions => edit(draft => { draft.states.find(item => item.id === state.id)!.conditions = conditions; })} />
        <button className="danger-button full-button" onClick={() => edit(draft => { draft.states = draft.states.filter(item => item.id !== state.id); draft.transitions = draft.transitions.filter(transition => transition.from !== state.id && transition.to !== state.id); if (draft.initialStateId === state.id) draft.initialStateId = draft.states[0]?.id; })}>Remove state</button>
      </details>)}
      <button className="secondary-button full-button" onClick={() => edit(draft => draft.states.push({ id: createId('state'), name: `State ${draft.states.length + 1}`, priority: 0, conditions: [], loop: true }))}><Plus size={12} /> Add state</button>
      <div className="property-subtitle">Transitions</div>
      {definition.transitions.map((transition, index) => <details className="controller-card" key={index}>
        <summary>{transition.from === '*' ? 'Any state' : definition.states.find(state => state.id === transition.from)?.name ?? 'Missing state'} → {definition.states.find(state => state.id === transition.to)?.name ?? 'Missing state'}</summary>
        <div className="controller-grid"><label className="controller-field">From<select value={transition.from} onChange={event => edit(draft => { draft.transitions[index].from = event.target.value; })}><option value="*">Any state</option>{definition.states.map(state => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>
          <label className="controller-field">To<select value={transition.to} onChange={event => edit(draft => { draft.transitions[index].to = event.target.value; })}>{definition.states.map(state => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label></div>
        <ControllerNumber label="Transition priority" value={transition.priority ?? 0} step={1} onChange={priority => edit(draft => { draft.transitions[index].priority = priority; })} />
        <ConditionsEditor value={transition.conditions} inputs={definition.inputs} onChange={conditions => edit(draft => { draft.transitions[index].conditions = conditions; })} />
        <button className="danger-button full-button" onClick={() => edit(draft => { draft.transitions.splice(index, 1); })}>Remove transition</button>
      </details>)}
      <button className="secondary-button full-button" disabled={!definition.states.length} onClick={() => edit(draft => draft.transitions.push({ from: '*', to: draft.states[0].id, conditions: [], priority: 0 }))}><Plus size={12} /> Add transition</button>
    </>}
  </>;
}
