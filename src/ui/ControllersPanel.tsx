import { useEffect, useState } from 'react';
import { Car, Gamepad2, Plus, UserRound } from 'lucide-react';
import { createId } from '../engine/Rig';
import type { Rig } from '../engine/Rig';
import { createCarDemo } from '../engine/carDemo';
import type { ControllerDefinition, ControllerInstance } from '../engine/model';
import { resolveControllerAction } from '../engine/controllers';
import { useProject } from '../state/projectStore';
import { ControllerEditor } from './ControllerEditor';
import type { ControllerKeys } from './ControllerEditor';
import { ControllerNumber, ControllerText } from './ControllerControls';
import { ControllerTestPad } from './ControllerTestPad';
import { makeControllerTemplate } from './controllerTemplates';

const keySlot = (id: string) => `controller-keys:${id}`;
function defaultCarKeys(definition: ControllerDefinition | undefined): ControllerKeys {
  if (!definition || definition.type !== 'car') return {};
  return Object.fromEntries(definition.inputs.flatMap(input => {
    const semanticName = `${input.id} ${input.name}`.toLowerCase();
    if (/throttle|accelerat|forward|reverse|speed/.test(semanticName)) {
      return [[input.id, { positive: 'KeyW', negative: 'KeyS' }]];
    }
    if (/steer|turn|horizontal/.test(semanticName)) {
      return [[input.id, {
        positive: 'KeyD', negative: 'KeyA',
        ...(input.type === 'joystick' ? { up: 'ArrowUp', down: 'ArrowDown' } : {}),
      }]];
    }
    if (/brake/.test(semanticName)) return [[input.id, { positive: 'Space' }]];
    return [];
  })) as ControllerKeys;
}

function readKeys(rig: Rig, definition: ControllerDefinition | undefined): ControllerKeys {
  if (!definition) return {};
  const raw = rig.metadata[keySlot(definition.id)];
  // Car demos can provide a ready controller without a separate keyboard
  // metadata record. Keep authored metadata authoritative when it exists.
  if (raw === undefined) return defaultCarKeys(definition);
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(definition.inputs.map(input => {
      const item = (value as Record<string, unknown>)[input.id];
      if (!item || typeof item !== 'object') return [input.id, {}];
      return [input.id, Object.fromEntries(['positive', 'negative', 'up', 'down'].flatMap(key => {
        const code = (item as Record<string, unknown>)[key];
        return typeof code === 'string' && /^[A-Za-z0-9]{1,40}$/.test(code) ? [[key, code]] : [];
      }))];
    }));
  } catch { return {}; }
}

export function ControllersPanel({ onStatus }: { onStatus: (message: string) => void }) {
  const { rig, projectGeneration, smartEdit, addControllerDefinition, removeControllerDefinition, addControllerInstance, removeControllerInstance, addActionLibraryItem, removeActionLibraryItem, setControllerInput, resetControllerInputs, applyController, replaceProject, select, pause } = useProject();
  const [selected, setSelected] = useState('');
  const [selectedInstance, setSelectedInstance] = useState('');
  const [page, setPage] = useState<'edit' | 'test'>('edit');
  const [clipId, setClipId] = useState('');
  const [editRevision, setEditRevision] = useState(0);
  const definition = rig.controllers.find(item => item.id === selected) ?? rig.controllers[0];
  const instances = rig.controllerInstances.filter(item => item.definitionId === definition?.id);
  const instance = instances.find(item => item.id === selectedInstance) ?? instances[0];
  const keys = readKeys(rig, definition);
  const targets = [...rig.bones.values()].map(bone => ({ id: bone.id, name: bone.name, kind: 'Bone' })).concat(rig.layersInOrder.map(layer => ({ id: layer.id, name: layer.name, kind: 'Layer' })));
  const evaluation = instance ? rig.getControllerEvaluation(instance.id) : null;
  useEffect(() => {
    if (projectGeneration === 0 || !rig.name.toLowerCase().includes('car') || !rig.controllers.length) return;
    setSelected(rig.controllers[0].id);
    setPage('test');
    setSelectedInstance('');
  }, [projectGeneration, rig.id]);
  const warnings: string[] = [];
  if (definition) {
    const references = [...definition.bindings.map(binding => binding.actionId), ...definition.states.map(state => state.actionId)].filter((id): id is string => Boolean(id));
    [...new Set(references)].forEach(id => { if (!resolveControllerAction(id, rig.actionLibrary, rig.animations)) warnings.push(`Missing action / animation: ${id}. Choose an existing clip in States or Mappings.`); });
    definition.bindings.forEach(binding => {
      if (binding.targetId && !targets.some(target => target.id === binding.targetId)) warnings.push(`Missing target: ${binding.targetId}. Remap the ${binding.parameter} binding.`);
      if (!binding.targetId && binding.parameter !== 'action') warnings.push(`${binding.parameter}: choose a bone or layer target to affect the rig.`);
    });
    const referencedClips = [...new Set(references.map(id => resolveControllerAction(id, rig.actionLibrary, rig.animations)?.id).filter(Boolean))];
    referencedClips.forEach(id => rig.animations.find(clip => clip.id === id)?.tracks.forEach(track => {
      if (!targets.some(target => target.id === track.targetId)) warnings.push(`Clip target missing: ${track.targetId}. The controller cannot resolve that track.`);
    }));
  }
  if (instance && instance.rigId !== rig.id) warnings.push(`Instance references missing rig: ${instance.rigId}. Remove it and add this controller to the current rig.`);
  const uniqueWarnings = [...new Set(warnings)];
  const mutate = (change: (project: Rig) => void) => {
    const state = useProject.getState();
    if (state.smartEdit) return;
    resetControllerInputs();
    state.pause(); state.updateProject(change); setEditRevision(value => value + 1);
  };
  const edit = (change: (draft: ControllerDefinition) => void) => {
    if (!definition) return;
    mutate(project => { const current = project.controllers.find(item => item.id === definition.id); if (current) change(current); });
  };
  const updateInstance = (patch: Partial<ControllerInstance>) => {
    if (instance) mutate(project => { const current = project.controllerInstances.find(item => item.id === instance.id); if (current) Object.assign(current, patch); });
  };
  const create = (type: ControllerDefinition['type']) => {
    const template = makeControllerTemplate(type, rig.actionLibrary, rig.animations);
    let id: string | null = null;
    id = addControllerDefinition(template.definition);
    if (id) mutate(project => { project.metadata[keySlot(id!)] = JSON.stringify(template.keys); });
    if (id) { setSelected(id); setPage('edit'); onStatus(`${template.definition.name} saved · Map its states to existing clips, then add a scene instance to test.`); }
  };
  const loadCarDemo = () => {
    if (smartEdit) { onStatus('Capture or cancel the action edit before loading a demo'); return; }
    if (!window.confirm('Load the Car demo and replace the current project? Undo restores your work.')) return;
    const demo = createCarDemo();
    const selectedId = demo.layersInOrder.find(layer => /chassis|body|car/i.test(layer.name))?.id
      ?? demo.layersInOrder.find(layer => /wheel|tire|tyre/i.test(layer.name))?.id
      ?? demo.getRoots().find(bone => /chassis|body|car/i.test(bone.name))?.id
      ?? demo.getRoots().find(bone => /wheel|tire|tyre/i.test(bone.name))?.id
      ?? demo.layersInOrder[0]?.id ?? demo.getRoots()[0]?.id ?? null;
    pause();
    resetControllerInputs();
    replaceProject(demo.toProject());
    select(selectedId);
    setSelected(demo.controllers[0]?.id ?? '');
    setSelectedInstance('');
    setPage('edit');
    setClipId('');
    setEditRevision(value => value + 1);
    onStatus('Car demo loaded: W/S throttle, A/D steering, Space brake');
  };
  const activeClipId = rig.animations.some(clip => clip.id === clipId) ? clipId : rig.animations[0]?.id ?? '';
  return <section className="dock-section controllers-section" aria-label="Controllers">
    <div className="section-title"><span><Gamepad2 size={15} /> Controllers</span><span className="mode-badge">REUSABLE</span></div>
    <p className="scope-note">Save controls once; reuse them on this rig. Controllers reference saved animations—clips are never duplicated.</p>
    {definition && <div className="active-controller-card"><div><strong>Active controller</strong><span>{definition.name}</span></div><button className="secondary-button" onClick={() => setPage('test')}><Gamepad2 size={13} /> Open car controls</button><small>Use Scene & test to add the controller and drive the rig.</small></div>}
    {smartEdit && <p className="edit-notice">Capture or cancel the Smart Bone edit before editing or testing controllers.</p>}
    <fieldset className="property-fields" disabled={Boolean(smartEdit)}>
      <div className="controller-templates"><button className="secondary-button" onClick={() => create('car')}><Car size={13} /> Car</button><button className="secondary-button" onClick={() => create('character')}><UserRound size={13} /> Boy</button><button className="secondary-button" onClick={() => create('custom')}><Plus size={13} /> Custom</button><button className="secondary-button controller-demo-button" onClick={loadCarDemo}><Car size={13} /> Car demo</button></div>
      <label className="controller-field">Saved controllers ({rig.controllers.length})<select value={definition?.id ?? ''} onChange={event => { resetControllerInputs(); setSelected(event.target.value); setSelectedInstance(''); }}>{!rig.controllers.length && <option value="">Create a template above…</option>}{rig.controllers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.type}</option>)}</select></label>
      <details className="controller-help"><summary>Controller workflow & template keys</summary><ol><li>Record clips in the timeline. Name and reference them in the action library below.</li><li>Create Car, Boy or Custom, then map states and inputs to those clips. Missing names stay visible until mapped.</li><li>Add a scene instance. Set its control-widget position, rotation, scale and render visibility.</li><li>Start the test pad. Car: W/S forward/reverse, A/D turn, Space brake. Boy: W/S walk forward/backward, A/D horizontal stick, Space jump, C sit.</li></ol><p>Higher priorities win: brake beats steering; jump beats sit and walking. Templates do not generate animation or physics. Parameter bindings act independently of state selection. Saved project JSON includes definitions, instances and keyboard mappings.</p></details>
      <details className="controller-card"><summary>Action library · {rig.actionLibrary.length} references</summary>
        <p className="scope-note">Each entry points to an existing clip ID. Editing the original clip updates every controller using it. Smart Bone Actions remain driven by bone rotation—map a controller to the driver’s rotation.</p>
        {!rig.animations.length ? <p className="controller-warning">No animation clips saved yet. Pose the rig, then Add key in the Rig & animate tab to record your first clip.</p> : <>
          <label className="controller-field">Existing animation<select value={activeClipId} onChange={event => setClipId(event.target.value)}>{rig.animations.map(clip => <option key={clip.id} value={clip.id}>{clip.name}</option>)}</select></label>
          {(() => { const clip = rig.animations.find(item => item.id === activeClipId); return clip ? <ControllerText label="Original clip name" value={clip.name} onChange={name => mutate(project => { const original = project.animations.find(item => item.id === clip.id); if (original) original.name = name; })} /> : null; })()}
          <div className="controller-toolbar"><button className="secondary-button" disabled={rig.actionLibrary.some(action => action.animationId === activeClipId || action.clipId === activeClipId)} onClick={() => {
            const clip = rig.animations.find(item => item.id === activeClipId); if (!clip) return;
            addActionLibraryItem({ id: createId('action'), name: clip.name, animationId: clip.id, loop: true, speed: 1 }); onStatus('Action reference saved · Original animation tracks are shared.');
          }}>Save reference</button><button className="secondary-button" onClick={() => { const clip = rig.animations.find(item => item.id === activeClipId); if (!clip) return; resetControllerInputs(); useProject.getState().pause(); useProject.getState().setTimeline({ activeAnimationId: clip.id, fps: clip.fps, startFrame: clip.startFrame, endFrame: clip.endFrame, currentFrame: clip.startFrame }); onStatus(`Timeline editing ${clip.name}`); }}>Edit in timeline</button></div>
        </>}
        {rig.actionLibrary.map(action => <details className="controller-card" key={action.id}><summary>{action.name}<small>→ {resolveControllerAction(action.id, rig.actionLibrary, rig.animations)?.name ?? 'Missing animation'}</small></summary>
          <ControllerText label="Action reference name" value={action.name} onChange={name => mutate(project => { project.actionLibrary.find(item => item.id === action.id)!.name = name; })} />
          <label className="controller-field">Referenced clip<select value={action.animationId ?? action.clipId ?? ''} onChange={event => mutate(project => { const current = project.actionLibrary.find(item => item.id === action.id)!; current.animationId = event.target.value; delete current.clipId; delete current.actionName; })}><option value="">Choose existing clip…</option>{rig.animations.map(clip => <option key={clip.id} value={clip.id}>{clip.name}</option>)}</select></label>
          <ControllerNumber label="Playback speed" min={0} max={100} value={action.speed ?? 1} onChange={speed => mutate(project => { project.actionLibrary.find(item => item.id === action.id)!.speed = speed; })} />
          <label className="check-label"><input type="checkbox" checked={action.loop ?? true} onChange={event => mutate(project => { project.actionLibrary.find(item => item.id === action.id)!.loop = event.target.checked; })} />Loop</label>
          <button className="danger-button full-button" onClick={() => { removeActionLibraryItem(action.id); onStatus('Reference removed; original animation preserved. Remap any controllers that used it.'); }}>Remove reference</button>
        </details>)}
      </details>
      {definition && <>
        <div className="controller-tabs" role="tablist" aria-label="Controller workspace"><button role="tab" aria-selected={page === 'edit'} onClick={() => setPage('edit')}>Definition</button><button role="tab" aria-selected={page === 'test'} onClick={() => setPage('test')}>Scene & test</button></div>
        {page === 'edit' ? <>
          <ControllerText label="Controller name" value={definition.name} onChange={name => edit(draft => { draft.name = name; })} />
          <label className="controller-field">Controller type<select value={definition.type} onChange={event => edit(draft => { draft.type = event.target.value as ControllerDefinition['type']; })}><option value="car">Car</option><option value="character">Character</option><option value="custom">Custom</option></select></label>
          <p className="scope-note">Type is a label. Create a template above to add its inputs and state rules. Changes save automatically.</p>
          <ControllerEditor definition={definition} edit={edit} library={rig.actionLibrary} clips={rig.animations} targets={targets} keys={keys} onKeysChange={(id, value) => mutate(project => { project.metadata[keySlot(definition.id)] = JSON.stringify({ ...keys, [id]: value }); })} />
          <div className="controller-toolbar"><button className="danger-button" onClick={() => { const id = definition.id; removeControllerDefinition(id); useProject.getState().updateProject(project => { delete project.metadata[keySlot(id)]; }); setSelected(''); onStatus('Controller and its scene instances removed · Undo restores them.'); }}>Delete controller</button></div>
        </> : <>
          <button className="secondary-button full-button" onClick={() => { const id = addControllerInstance(definition.id, { x: 680, y: 440, scale: 1, rotation: 0, visibleInRender: false }); if (id) { setSelectedInstance(id); onStatus('Controller added to the current rig · Start its test pad below.'); } else onStatus('Could not add controller instance · Check the saved definition and current rig.'); }}><Plus size={13} /> Add selected controller to rig</button>
          <label className="controller-field">Scene instance<select value={instance?.id ?? ''} onChange={event => { resetControllerInputs(); setSelectedInstance(event.target.value); }}>{!instances.length && <option value="">Add an instance to test…</option>}{instances.map((item, index) => <option key={item.id} value={item.id}>{definition.name} · instance {index + 1}</option>)}</select></label>
          {instance && <>
            <details className="controller-card"><summary>Control-widget transform & visibility</summary><p className="scope-note">Places the controller widget, not the artwork. Mappings choose which bones or layers respond.</p>
              <div className="controller-grid"><ControllerNumber label="Position X" value={instance.x} step={1} onChange={x => updateInstance({ x })} /><ControllerNumber label="Position Y" value={instance.y} step={1} onChange={y => updateInstance({ y })} /><ControllerNumber label="Rotation °" value={instance.rotation * 180 / Math.PI} step={1} onChange={rotation => updateInstance({ rotation: rotation * Math.PI / 180 })} /><ControllerNumber label="Scale" value={instance.scale} min={.01} max={100} onChange={scale => updateInstance({ scale })} /></div>
              <label className="check-label"><input type="checkbox" checked={instance.visibleInRender} onChange={event => updateInstance({ visibleInRender: event.target.checked })} />Visible in render</label>
              <button className="danger-button full-button" onClick={() => { removeControllerInstance(instance.id); setSelectedInstance(''); onStatus('Scene instance removed; saved controller is available for reuse.'); }}>Remove instance</button>
            </details>
            <ControllerTestPad key={`${projectGeneration}:${instance.id}`} sessionKey={`${projectGeneration}:${instance.id}:${editRevision}`} disabled={Boolean(smartEdit) || instance.rigId !== rig.id}
              inputs={definition.inputs.map(input => ({ ...input, ...keys[input.id] }))}
              stateName={definition.states.find(state => state.id === evaluation?.stateId)?.name ?? ''}
              actionNames={evaluation?.clipId ? [rig.animations.find(clip => clip.id === evaluation.clipId)?.name ?? evaluation.clipId] : []} warnings={uniqueWarnings}
              adapter={{
                start: () => { const state = useProject.getState(); if (state.rig !== rig || state.smartEdit) return false; state.pause(); resetControllerInputs(instance.id); return Boolean(applyController(instance.id, 0)); },
                stop: () => { if (useProject.getState().rig === rig) resetControllerInputs(instance.id); },
                setInput: (id, value) => { if (useProject.getState().rig === rig) setControllerInput(instance.id, id, value); },
                tick: seconds => { const state = useProject.getState(); if (state.rig !== rig || state.smartEdit || state.rig.timeline.isPlaying) return false; return Boolean(applyController(instance.id, seconds)); },
              }} />
          </>}
        </>}
        {page === 'edit' && uniqueWarnings.length > 0 && <details className="controller-warning"><summary>{uniqueWarnings.length} unresolved references / mappings</summary><ul>{uniqueWarnings.map(text => <li key={text}>{text}</li>)}</ul></details>}
      </>}
    </fieldset>
  </section>;
}
