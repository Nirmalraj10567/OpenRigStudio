import { useState } from 'react';
import { Bug, KeyRound, Plus, Settings2, Target, Trash2 } from 'lucide-react';
import { useProject } from '../state/projectStore';
import { createConstraint, recordConstraintKey, removeConstraint, updateConstraint } from '../engine/constraints';
import type { BoneConstraint, BoneConstraintType } from '../engine/model';

const TYPES: Array<{ value: BoneConstraintType; label: string }> = [
  { value: 'angle', label: 'Angle limits' }, { value: 'translation', label: 'Translation limits' }, { value: 'scale', label: 'Scale limits' },
  { value: 'distance', label: 'Distance limits' }, { value: 'direction', label: 'Direction' }, { value: 'pin', label: 'Pin bone' },
  { value: 'target', label: 'Target bone' }, { value: 'parent', label: 'Parent / child blend' }, { value: 'squashStretch', label: 'Squash & stretch' },
];

function numberValue(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function NumberField({ label, value, onChange, step = .1 }: { label: string; value?: number; onChange: (value: number | undefined) => void; step?: number }) {
  return <label className="property-field"><span>{label}</span><input aria-label={label} type="number" step={step} value={value ?? ''} placeholder="—" onChange={event => onChange(numberValue(event.target.value))} /></label>;
}

export function ConstraintsPanel({ onStatus }: { onStatus: (message: string) => void }) {
  const { rig, version, updateProject } = useProject();
  const [selectedId, setSelectedId] = useState('');
  const [newType, setNewType] = useState<BoneConstraintType>('angle');
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [influenceBoneId, setInfluenceBoneId] = useState('');
  const bones = [...rig.bones.values()];
  const selected = rig.constraints.find(item => item.id === selectedId) ?? rig.constraints[0];
  const keyed = selected ? rig.animations.find(animation => animation.id === rig.timeline.activeAnimationId)?.tracks.find(track => track.targetId === selected.id && track.property === 'constraint')?.keyframes.length ?? 0 : 0;
  const sourceDefault = newSource || bones[0]?.id || '';
  const influenceBone = rig.bones.get(influenceBoneId || selected?.sourceBoneId || bones[0]?.id || '');
  const influence = influenceBone?.influence ?? { radius: 100, falloff: 2, strength: 1 };
  const patch = (values: Partial<BoneConstraint>) => {
    if (!selected) return;
    updateProject(project => { updateConstraint(project, selected.id, values); });
  };
  const create = () => {
    let id: string | null = null;
    updateProject(project => { id = createConstraint(project, newType, sourceDefault, newTarget || undefined); });
    if (id) { setSelectedId(id); onStatus(`${TYPES.find(item => item.value === newType)?.label ?? 'Constraint'} created`); }
    else onStatus('Choose a valid source bone and optional target bone');
  };
  const key = () => {
    if (!selected) return;
    updateProject(project => { recordConstraintKey(project, selected.id); });
    onStatus(`${selected.name} keyed at frame ${Math.round(rig.timeline.currentFrame)}`);
  };
  const debugEnabled = rig.constraintDebugVisible;
  const setDebug = (enabled: boolean) => { rig.constraintDebugVisible = enabled; useProject.setState({ version: version + 1 }); onStatus(enabled ? 'Constraint guides enabled · inspect the canvas and debug readout' : 'Constraint guides hidden'); };
  const targetRequired = selected && ['distance', 'direction', 'pin', 'target', 'parent', 'squashStretch'].includes(selected.type);
  return <section className="dock-section constraints-section" aria-label="Advanced bone constraints">
    <div className="section-title"><span><Settings2 size={15} /> Advanced constraints</span><span className="stage-badge active">SOLVER</span></div>
    <p className="stage-lede">Limit, aim, pin, blend, and stretch bones without baking the result into authored animation.</p>
    <section className="constraints-create">
      <div className="property-subtitle"><Plus size={13} /> Add constraint</div>
      <label className="select-field"><span>Constraint type</span><select aria-label="New constraint type" value={newType} onChange={event => setNewType(event.target.value as BoneConstraintType)}>{TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <div className="property-grid"><label className="select-field"><span>Source bone</span><select aria-label="New constraint source" value={sourceDefault} onChange={event => setNewSource(event.target.value)}><option value="">Choose source…</option>{bones.map(bone => <option key={bone.id} value={bone.id}>{bone.name}</option>)}</select></label><label className="select-field"><span>Target bone</span><select aria-label="New constraint target" value={newTarget} onChange={event => setNewTarget(event.target.value)}><option value="">None / fixed point</option>{bones.map(bone => <option key={bone.id} value={bone.id}>{bone.name}</option>)}</select></label></div>
      <button className="secondary-button full-button" disabled={!sourceDefault} onClick={create}><Plus size={13} /> Create constraint</button>
    </section>
    {!rig.constraints.length && <p className="scope-note">No constraints yet. Start with an angle limit on a forearm, a target bone for an aim rig, or a pin bone for a foot lock.</p>}
    {rig.constraints.length > 0 && <>
      <section className="constraints-list" aria-label="Constraint list">{rig.constraints.map(item => <button key={item.id} className={`constraint-row ${selected?.id === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}><span><strong>{item.name}</strong><small>{TYPES.find(type => type.value === item.type)?.label} · {item.weight.toFixed(2)} influence</small></span><span className={`constraint-status ${item.enabled ? 'on' : ''}`}>{item.enabled ? 'ON' : 'OFF'}</span></button>)}</section>
      {selected && <section className="constraints-editor">
        <div className="constraint-editor-heading"><div><span className="section-kicker">EDIT CONSTRAINT</span><h3>{selected.name}</h3></div><button className="danger-button" aria-label="Delete constraint" onClick={() => { updateProject(project => removeConstraint(project, selected.id)); setSelectedId(''); onStatus('Constraint removed · Undo restores it'); }}><Trash2 size={13} /></button></div>
        <fieldset className="stage-fields">
          <label className="camera-field">Name<input aria-label="Constraint name" value={selected.name} onChange={event => patch({ name: event.target.value })} /></label>
          <div className="property-grid"><label className="select-field"><span>Source bone</span><select aria-label="Constraint source" value={selected.sourceBoneId} onChange={event => patch({ sourceBoneId: event.target.value })}>{bones.map(bone => <option key={bone.id} value={bone.id}>{bone.name}</option>)}</select></label><label className="select-field"><span>Target bone</span><select aria-label="Constraint target" value={selected.targetBoneId ?? ''} onChange={event => patch({ targetBoneId: event.target.value || undefined })}><option value="">None / fixed point</option>{bones.map(bone => <option key={bone.id} value={bone.id}>{bone.name}</option>)}</select></label></div>
          <label className="check-label"><input aria-label="Constraint enabled" type="checkbox" checked={selected.enabled} onChange={event => patch({ enabled: event.target.checked })} /> Enabled</label>
          <label className="style-range"><span>Influence <output>{Math.round(selected.weight * 100)}%</output></span><input aria-label="Constraint influence" type="range" min={0} max={1} step=".01" value={selected.weight} onChange={event => patch({ weight: Number(event.target.value) })} /></label>
          <div className="property-grid"><NumberField label="Priority" value={selected.priority} step={1} onChange={value => patch({ priority: value })} /><label className="select-field"><span>Blend mode</span><select aria-label="Constraint blend mode" value={selected.mix} onChange={event => patch({ mix: event.target.value as BoneConstraint['mix'] })}><option value="replace">Replace</option><option value="additive">Additive</option></select></label></div>
          <label className="check-label"><input aria-label="Affect child bones" type="checkbox" checked={selected.affectChildren === true} onChange={event => patch({ affectChildren: event.target.checked })} /> Affect child bones with falloff</label>
          {selected.affectChildren && <NumberField label="Influence falloff" value={selected.falloff} step={.05} onChange={value => patch({ falloff: value })} />}
          {selected.type === 'angle' && <div className="property-grid"><NumberField label="Minimum angle °" value={selected.minAngle} step={1} onChange={value => patch({ minAngle: value })} /><NumberField label="Maximum angle °" value={selected.maxAngle} step={1} onChange={value => patch({ maxAngle: value })} /></div>}
          {selected.type === 'translation' && <div className="property-grid"><NumberField label="Minimum X" value={selected.minX} onChange={value => patch({ minX: value })} /><NumberField label="Maximum X" value={selected.maxX} onChange={value => patch({ maxX: value })} /><NumberField label="Minimum Y" value={selected.minY} onChange={value => patch({ minY: value })} /><NumberField label="Maximum Y" value={selected.maxY} onChange={value => patch({ maxY: value })} /></div>}
          {selected.type === 'scale' && <div className="property-grid"><NumberField label="Minimum scale X" value={selected.minScaleX} onChange={value => patch({ minScaleX: value })} /><NumberField label="Maximum scale X" value={selected.maxScaleX} onChange={value => patch({ maxScaleX: value })} /><NumberField label="Minimum scale Y" value={selected.minScaleY} onChange={value => patch({ minScaleY: value })} /><NumberField label="Maximum scale Y" value={selected.maxScaleY} onChange={value => patch({ maxScaleY: value })} /></div>}
          {selected.type === 'distance' && <div className="property-grid"><NumberField label="Minimum distance" value={selected.minDistance} onChange={value => patch({ minDistance: value })} /><NumberField label="Maximum distance" value={selected.maxDistance} onChange={value => patch({ maxDistance: value })} /></div>}
          {(selected.type === 'direction' || selected.type === 'target') && <NumberField label="Fixed direction °" value={selected.directionAngle} step={1} onChange={value => patch({ directionAngle: value })} />}
          {(selected.type === 'pin' || selected.type === 'distance' || selected.type === 'direction') && <div className="property-grid"><NumberField label="Pin X" value={selected.pinX} onChange={value => patch({ pinX: value })} /><NumberField label="Pin Y" value={selected.pinY} onChange={value => patch({ pinY: value })} /></div>}
          {(selected.type === 'parent' || selected.type === 'target') && <div className="property-grid"><NumberField label="Parent blend" value={selected.parentInfluence} step={.01} onChange={value => patch({ parentInfluence: value })} /><label className="select-field"><span>Target behavior</span><select aria-label="Target behavior" value={selected.targetMode ?? 'aim'} onChange={event => patch({ targetMode: event.target.value as BoneConstraint['targetMode'] })}><option value="aim">Aim source</option><option value="ik">Solve IK chain</option></select></label></div>}
          {selected.type === 'parent' && <><label className="check-label"><input aria-label="Maintain parent offset" type="checkbox" checked={selected.maintainOffset !== false} onChange={event => patch({ maintainOffset: event.target.checked })} /> Maintain parent offset</label><label className="select-field"><span>Source anchor</span><select aria-label="Source anchor" value={selected.anchor ?? 'origin'} onChange={event => patch({ anchor: event.target.value as BoneConstraint['anchor'] })}><option value="origin">Bone origin</option><option value="tip">Bone tip</option></select></label></>}
          {selected.type === 'squashStretch' && <><div className="property-grid"><NumberField label="Minimum stretch" value={selected.minStretch} step={.05} onChange={value => patch({ minStretch: value })} /><NumberField label="Maximum stretch" value={selected.maxStretch} step={.05} onChange={value => patch({ maxStretch: value })} /></div><label className="check-label"><input aria-label="Preserve squash stretch area" type="checkbox" checked={selected.preserveArea !== false} onChange={event => patch({ preserveArea: event.target.checked })} /> Preserve volume</label></>}
          {targetRequired && !selected.targetBoneId && selected.pinX === undefined && <p className="scope-note"><Target size={13} /> Choose a target bone or enter a fixed point for this constraint.</p>}
          <div className="panel-buttons"><button className="secondary-button" onClick={key}><KeyRound size={13} /> Key constraint</button><span className="scope-note">{keyed} key{keyed === 1 ? '' : 's'}</span></div>
        </fieldset>
      </section>}
      <section className="constraints-influence"><div className="property-subtitle">Bone influence falloff</div><label className="select-field"><span>Influence bone</span><select aria-label="Influence bone" value={influenceBone?.id ?? ''} onChange={event => setInfluenceBoneId(event.target.value)}>{bones.map(bone => <option key={bone.id} value={bone.id}>{bone.name}</option>)}</select></label><div className="property-grid"><NumberField label="Influence radius" value={influence.radius} step={1} onChange={value => { if (!influenceBone || value === undefined) return; updateProject(project => { const bone = project.bones.get(influenceBone.id); if (bone) bone.influence = { ...influence, radius: Math.max(.001, value) }; }); }} /><NumberField label="Falloff exponent" value={influence.falloff} step={.1} onChange={value => { if (!influenceBone || value === undefined) return; updateProject(project => { const bone = project.bones.get(influenceBone.id); if (bone) bone.influence = { ...influence, falloff: Math.max(.1, value) }; }); }} /></div><div className="panel-buttons"><NumberField label="Influence strength" value={influence.strength} step={.1} onChange={value => { if (!influenceBone || value === undefined) return; updateProject(project => { const bone = project.bones.get(influenceBone.id); if (bone) bone.influence = { ...influence, strength: Math.max(0, value) }; }); }} /><button className="mini-text" onClick={() => { if (!influenceBone) return; updateProject(project => { const bone = project.bones.get(influenceBone.id); if (bone) delete bone.influence; }); onStatus('Bone influence reset to legacy inverse-square weighting'); }}>Reset legacy</button></div><p className="scope-note">These settings are used when creating or rebinding mesh weights. Radius is measured in stage pixels; higher falloff keeps influence tighter around the bone.</p></section>
      </>}
    <section className="constraints-debug"><div className="section-title"><span><Bug size={14} /> Visualization & debug</span><label className="check-label"><input aria-label="Show constraint guides" type="checkbox" checked={debugEnabled} onChange={event => setDebug(event.target.checked)} /> Guides</label></div><p className="scope-note">Dashed guides show target points and the latest solver error. The readout is transient and does not alter project data.</p>{debugEnabled && rig.constraintDebug.map(item => <div className="constraint-debug-row" key={item.constraintId}><span className={item.active ? 'debug-ok' : 'debug-muted'}>{item.active ? '●' : '○'}</span><strong>{rig.constraints.find(constraint => constraint.id === item.constraintId)?.name ?? item.type}</strong><span>{item.message}</span><output>{item.error.toFixed(2)}</output></div>)}</section>
  </section>;
}
