import { useState } from 'react';
import { Activity, Bug, Database, KeyRound, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useProject } from '../state/projectStore';
import { addBoneDynamics, addMeshDynamics, addParticleEmitter, addPhysicsBody, bakeDynamics, buildPhysicsCache, dynamicsSignature, invalidateDynamics, normalizeDynamics } from '../engine/dynamics';
import type { BoneDynamics, DynamicsSettings, MeshDynamics, ParticleEmitter, PhysicsBody } from '../engine/model';
import type { Rig } from '../engine/Rig';

function NumberField({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (value: number) => void; step?: number; min?: number; max?: number }) {
  return <label className="property-field"><span>{label}</span><input aria-label={label} type="number" value={value} min={min} max={max} step={step} onChange={event => { const number = Number(event.target.value); if (Number.isFinite(number)) onChange(number); }} /></label>;
}

export function DynamicsPanel({ onStatus }: { onStatus: (message: string) => void }) {
  const { rig, selectedId, meshVertex, updateProject, pause, smartEdit, version } = useProject();
  const [targetId, setTargetId] = useState('');
  const [mode, setMode] = useState<BoneDynamics['mode']>('spring');
  const [meshMode, setMeshMode] = useState<MeshDynamics['mode']>('cloth');
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const settings = rig.dynamics;
  const targets = [...rig.bones.values(), ...rig.layers.values()];
  const target = targets.find(item => item.id === targetId) ?? targets.find(item => item.id === selectedId) ?? targets[0];
  const selectedBone = settings.bones.find(item => item.id === selected);
  const selectedMesh = settings.meshes.find(item => item.id === selected);
  const selectedBody = settings.bodies.find(item => item.id === selected);
  const selectedEmitter = settings.emitters.find(item => item.id === selected);
  const items = [...settings.bones.map(item => ({ id: item.id, name: rig.bones.get(item.boneId)?.name ?? 'Missing bone', type: item.mode, enabled: item.enabled })), ...settings.meshes.map(item => ({ id: item.id, name: rig.layers.get(item.layerId)?.name ?? 'Missing mesh', type: item.mode, enabled: item.enabled })), ...settings.bodies.map(item => ({ id: item.id, name: item.name, type: `${item.motion} body`, enabled: item.enabled })), ...settings.emitters.map(item => ({ id: item.id, name: item.name, type: 'particles', enabled: item.enabled }))];
  const cacheValid = settings.cache?.signature === dynamicsSignature(rig) && settings.cache?.sourceAnimationId === rig.timeline.activeAnimationId;
  const isBake = Boolean(rig.animations.find(clip => clip.id === rig.timeline.activeAnimationId)?.dynamicsBake);

  const edit = (mutator: (project: Rig) => void) => {
    pause(); setError('');
    updateProject(project => { invalidateDynamics(project); mutator(project); project.dynamics = normalizeDynamics(project.dynamics, new Set(project.bones.keys()), new Set(project.layers.keys())); });
  };
  const patch = (values: Partial<DynamicsSettings>) => edit(project => Object.assign(project.dynamics, values));
  const patchItem = (values: Partial<BoneDynamics> | Partial<MeshDynamics> | Partial<PhysicsBody> | Partial<ParticleEmitter>) => edit(project => {
    const item = [...project.dynamics.bones, ...project.dynamics.meshes, ...project.dynamics.bodies, ...project.dynamics.emitters].find(item => item.id === selected);
    if (item) Object.assign(item, values);
  });
  const add = (kind: 'bone' | 'chain' | 'mesh' | 'body' | 'emitter') => {
    let created: string | null = null;
    edit(project => {
      if (kind === 'bone' && target) created = addBoneDynamics(project, target.id, mode);
      if (kind === 'chain' && target && project.bones.has(target.id)) {
        const visit = (id: string, seen = new Set<string>()) => { if (seen.has(id)) return; seen.add(id); const added = addBoneDynamics(project, id, mode); created ??= added; project.bones.get(id)?.childrenIds.forEach(child => visit(child, seen)); };
        visit(target.id);
      }
      if (kind === 'mesh' && target) created = addMeshDynamics(project, target.id, meshMode);
      if (kind === 'body') created = addPhysicsBody(project, target?.id);
      if (kind === 'emitter') created = addParticleEmitter(project, target?.id);
    });
    if (created) { setSelected(created); onStatus(`${kind === 'chain' ? 'Dynamic chain' : kind === 'mesh' ? meshMode : kind === 'emitter' ? 'Particle emitter' : kind === 'body' ? 'Collision body' : 'Bone spring'} added`); }
    else onStatus('Choose a compatible target that does not already have these dynamics');
  };
  const run = async (operation: 'cache' | 'bake') => {
    pause(); setBusy(operation === 'cache' ? 'Building cache…' : 'Baking keyframes…'); setError('');
    await new Promise(resolve => window.setTimeout(resolve, 30));
    try {
      updateProject(project => { if (operation === 'cache') buildPhysicsCache(project); else bakeDynamics(project); });
      onStatus(operation === 'cache' ? 'Deterministic physics cache ready' : 'Dynamics baked into a new editable clip · source animation preserved');
    } catch (cause) { const message = cause instanceof Error ? cause.message : 'Dynamics operation failed'; setError(message); onStatus(message); }
    finally { setBusy(''); }
  };
  const remove = () => edit(project => {
    project.dynamics.bones = project.dynamics.bones.filter(item => item.id !== selected);
    project.dynamics.meshes = project.dynamics.meshes.filter(item => item.id !== selected);
    project.dynamics.bodies = project.dynamics.bodies.filter(item => item.id !== selected);
    project.dynamics.emitters = project.dynamics.emitters.filter(item => item.id !== selected);
    setSelected('');
  });
  const enabled = selectedBone ?? selectedMesh ?? selectedBody ?? selectedEmitter;
  const spring = selectedBone ?? selectedMesh;
  return <section className="dock-section dynamics-section" aria-label="Dynamics and physics">
    <div className="section-title"><span><Activity size={15} /> Dynamics & physics</span><span className="stage-badge active">FIXED STEP</span></div>
    <p className="stage-lede">Add secondary motion, colliders, deformable meshes, and particles. Scrubbing replays the same seeded simulation.</p>
    {isBake && <p className="scope-note">This clip contains baked keys. Select its source clip to preview or rebuild live dynamics.</p>}
    <fieldset disabled={Boolean(smartEdit) || Boolean(busy)} className="stage-fields dynamics-fields">
      <label className="check-label"><input aria-label="Enable dynamics" type="checkbox" checked={settings.enabled} onChange={event => patch({ enabled: event.target.checked })} /> Enable dynamics</label>
      <details open><summary>Simulation & forces</summary>
        <div className="property-grid"><NumberField label="Simulation start" value={settings.startFrame} min={0} onChange={value => patch({ startFrame: value })} /><NumberField label="Simulation end" value={settings.endFrame} min={settings.startFrame} onChange={value => patch({ endFrame: value })} /><NumberField label="Simulation FPS" value={settings.fps} min={1} max={120} onChange={value => patch({ fps: value })} /><NumberField label="Substeps" value={settings.substeps} min={1} max={32} onChange={value => patch({ substeps: value })} /><NumberField label="Gravity X" value={settings.gravityX} onChange={value => patch({ gravityX: value })} /><NumberField label="Gravity Y" value={settings.gravityY} onChange={value => patch({ gravityY: value })} /><NumberField label="Wind X" value={settings.windX} onChange={value => patch({ windX: value })} /><NumberField label="Wind Y" value={settings.windY} onChange={value => patch({ windY: value })} /><NumberField label="Wind variation" value={settings.windNoise} min={0} onChange={value => patch({ windNoise: value })} /><NumberField label="Random seed" value={settings.seed} onChange={value => patch({ seed: value })} /></div>
        <p className="scope-note">Gravity and wind use stage pixels/s². FPS sets simulation time per project frame; use the timeline FPS to keep motion speed aligned.</p>
      </details>
      <details open><summary>Add secondary motion</summary>
        <label className="select-field"><span>Target</span><select aria-label="Dynamics target" value={target?.id ?? ''} onChange={event => setTargetId(event.target.value)}><option value="">Choose a bone or artwork…</option>{targets.map(item => <option key={item.id} value={item.id}>{rig.bones.has(item.id) ? 'Bone' : 'Artwork'} · {item.name}</option>)}</select></label>
        <div className="property-grid"><label className="select-field"><span>Bone preset</span><select aria-label="Bone dynamics preset" value={mode} onChange={event => setMode(event.target.value as BoneDynamics['mode'])}><option value="spring">Spring</option><option value="jiggle">Jiggle · translation</option><option value="hair">Hair</option><option value="tail">Tail</option><option value="follow-through">Follow-through</option></select></label><label className="select-field"><span>Mesh preset</span><select aria-label="Mesh dynamics preset" value={meshMode} onChange={event => setMeshMode(event.target.value as MeshDynamics['mode'])}><option value="cloth">Cloth</option><option value="soft-body">Soft body</option></select></label></div>
        <div className="dynamics-actions"><button className="secondary-button" disabled={!target || !rig.bones.has(target.id)} onClick={() => add('bone')}><Plus size={13} /> Bone</button><button className="secondary-button" disabled={!target || !rig.bones.has(target.id)} onClick={() => add('chain')}>Bone chain</button><button className="secondary-button" disabled={!target || !rig.layers.get(target.id)?.mesh} onClick={() => add('mesh')}>Mesh</button><button className="secondary-button" onClick={() => add('body')}>Collision body</button><button className="secondary-button" onClick={() => add('emitter')}>Particles</button></div>
        <p className="scope-note">A chain includes the chosen bone and its descendants. Create a mesh in Rig & animate before adding cloth or a soft body.</p>
      </details>
      {items.length > 0 && <section className="constraints-list" aria-label="Dynamics objects">{items.map(item => <button key={item.id} className={`constraint-row ${selected === item.id ? 'active' : ''}`} onClick={() => setSelected(item.id)}><span><strong>{item.name}</strong><small>{item.type}</small></span><span className={`constraint-status ${item.enabled ? 'on' : ''}`}>{item.enabled ? 'ON' : 'OFF'}</span></button>)}</section>}
      {enabled && <section className="dynamics-editor"><div className="constraint-editor-heading"><h3>{items.find(item => item.id === selected)?.name}</h3><button className="danger-button" aria-label="Delete dynamics object" onClick={remove}><Trash2 size={13} /></button></div>
        <label className="check-label"><input aria-label="Dynamics object enabled" type="checkbox" checked={enabled.enabled} onChange={event => patchItem({ enabled: event.target.checked })} /> Object enabled</label>
        {spring && <><div className="property-grid"><NumberField label="Stiffness" value={spring.stiffness} min={0} onChange={value => patchItem({ stiffness: value })} /><NumberField label="Damping" value={spring.damping} min={0} onChange={value => patchItem({ damping: value })} /><NumberField label="Mass" value={spring.mass} min={.001} step={.1} onChange={value => patchItem({ mass: value })} /><NumberField label="Gravity scale" value={spring.gravityScale} step={.1} onChange={value => patchItem({ gravityScale: value })} /><NumberField label="Wind scale" value={spring.windScale} step={.1} onChange={value => patchItem({ windScale: value })} /></div>{selectedBone && <div className="property-grid"><NumberField label="Influence" value={selectedBone.influence} min={0} max={1} step={.05} onChange={value => patchItem({ influence: value })} /><NumberField label="Overlap" value={selectedBone.overlap} min={0} max={2} step={.05} onChange={value => patchItem({ overlap: value })} /></div>}</>}
        {selectedBone?.mode === 'jiggle' && <><NumberField label="Maximum jiggle travel (px)" value={selectedBone.maxDisplacement ?? 8} min={0} max={1000} step={.5} onChange={value => patchItem({ maxDisplacement: value })} /><p className="scope-note">A damped translation spring follows the parent with inertia. Influence controls the result; overlap controls lag. Skin artwork to this bone to deform it.</p></>}
        {selectedMesh && <><div className="property-grid"><NumberField label="Follow animated pose" value={selectedMesh.poseFollow ?? 0} min={0} max={1} step={.05} onChange={value => patchItem({ poseFollow: value })} /><NumberField label="Maximum cloth travel (px)" value={selectedMesh.maxDisplacement ?? 0} min={0} max={10000} step={1} onChange={value => patchItem({ maxDisplacement: value })} /></div><label className="check-label"><input aria-label="Adapt cloth rest shape to pose" type="checkbox" checked={selectedMesh.adaptiveRest ?? false} onChange={event => patchItem({ adaptiveRest: event.target.checked })} /> Adapt rest shape to turns and scaling</label><p className="scope-note">Follow pose carries the fabric with the rig. Travel 0 is unlimited. Pinned vertices: {selectedMesh.pinned.length}. Select a mesh vertex with M to change its anchor.</p><div className="dynamics-actions"><button className="secondary-button" disabled={selectedId !== selectedMesh.layerId || meshVertex === null} onClick={() => { if (meshVertex !== null) patchItem({ pinned: selectedMesh.pinned.includes(meshVertex) ? selectedMesh.pinned.filter(index => index !== meshVertex) : [...selectedMesh.pinned, meshVertex] }); }}>Toggle selected pin</button><button className="secondary-button" onClick={() => patchItem({ pinned: [] })}>Release pins</button></div></>}
        {selectedBody && <>
          <label className="select-field"><span>Attachment</span><select aria-label="Body attachment" value={selectedBody.targetId ?? ''} onChange={event => patchItem({ targetId: event.target.value || undefined })}><option value="">World / unattached</option>{targets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="property-grid"><label className="select-field"><span>Body motion</span><select aria-label="Body motion" value={selectedBody.motion} onChange={event => patchItem({ motion: event.target.value as PhysicsBody['motion'] })}><option value="static">Static</option><option value="kinematic">Kinematic</option><option value="dynamic">Dynamic</option></select></label><label className="select-field"><span>Shape</span><select aria-label="Body shape" value={selectedBody.shape} onChange={event => patchItem({ shape: event.target.value as PhysicsBody['shape'] })}><option value="circle">Circle</option><option value="box">Box</option></select></label><NumberField label="Body X" value={selectedBody.x} onChange={value => patchItem({ x: value })} /><NumberField label="Body Y" value={selectedBody.y} onChange={value => patchItem({ y: value })} /><NumberField label="Body rotation °" value={selectedBody.rotation * 180 / Math.PI} onChange={value => patchItem({ rotation: value * Math.PI / 180 })} />{selectedBody.shape === 'circle' ? <NumberField label="Radius" value={selectedBody.radius} min={.1} onChange={value => patchItem({ radius: value })} /> : <><NumberField label="Width" value={selectedBody.width} min={.1} onChange={value => patchItem({ width: value })} /><NumberField label="Height" value={selectedBody.height} min={.1} onChange={value => patchItem({ height: value })} /></>}<NumberField label="Body mass" value={selectedBody.mass} min={.001} step={.1} onChange={value => patchItem({ mass: value })} /><NumberField label="Bounce" value={selectedBody.restitution} min={0} max={1} step={.05} onChange={value => patchItem({ restitution: value })} /><NumberField label="Friction" value={selectedBody.friction} min={0} max={1} step={.05} onChange={value => patchItem({ friction: value })} /></div>
          <p className="scope-note">Attached X/Y and rotation are offsets. Static bodies hold their start pose; kinematic bodies follow animation. Dynamic boxes use circular collision proxies; angular rigid-body impulses are not simulated.</p>
        </>}
        {selectedEmitter && <><label className="select-field"><span>Emitter attachment</span><select aria-label="Emitter attachment" value={selectedEmitter.targetId ?? ''} onChange={event => patchItem({ targetId: event.target.value || undefined })}><option value="">World / unattached</option>{targets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="property-grid"><NumberField label="Emitter X" value={selectedEmitter.x} onChange={value => patchItem({ x: value })} /><NumberField label="Emitter Y" value={selectedEmitter.y} onChange={value => patchItem({ y: value })} /><NumberField label="Emission rate /s" value={selectedEmitter.rate} min={0} onChange={value => patchItem({ rate: value })} /><NumberField label="Lifetime s" value={selectedEmitter.lifetime} min={.01} step={.1} onChange={value => patchItem({ lifetime: value })} /><NumberField label="Particle speed" value={selectedEmitter.speed} min={0} onChange={value => patchItem({ speed: value })} /><NumberField label="Direction °" value={selectedEmitter.direction * 180 / Math.PI} onChange={value => patchItem({ direction: value * Math.PI / 180 })} /><NumberField label="Spread °" value={selectedEmitter.spread * 180 / Math.PI} min={0} max={360} onChange={value => patchItem({ spread: value * Math.PI / 180 })} /><NumberField label="Particle radius" value={selectedEmitter.size} min={.1} onChange={value => patchItem({ size: value })} /></div><label className="property-field"><span>Particle color</span><input aria-label="Particle color" type="color" value={selectedEmitter.color} onChange={event => patchItem({ color: event.target.value })} /></label><p className="scope-note">Particles render above artwork on the stage’s neutral-depth plane. An attached emitter uses local X/Y offsets.</p></>}
      </section>}
      <details open><summary>Cache & bake</summary><p className="dynamics-cache" role="status">{busy || (cacheValid ? `${settings.cache!.frames.length} cached frames · ready` : settings.cache ? 'Cache stale · rebuild for this source' : 'Live deterministic preview · no saved cache')}</p>
        <div className="dynamics-actions"><button className="secondary-button" disabled={!items.length || isBake} onClick={() => void run('cache')}><Database size={13} /> Build cache</button><button className="secondary-button" disabled={!items.length || isBake} onClick={() => void run('bake')}><KeyRound size={13} /> Bake to keys</button><button className="secondary-button" onClick={() => { edit(invalidateDynamics); onStatus('Dynamics cache cleared · preview replayed from the start'); }}><RotateCcw size={13} /> Reset cache</button></div>
        <p className="scope-note">Baking creates a new clip with final transform and mesh keys, plus a vector-keyed particle layer. Edit and Undo use the regular project history.</p>
      </details>
    </fieldset>
    {error && <p className="dynamics-error" role="alert">{error}</p>}
    <section className="constraints-debug"><div className="section-title"><span><Bug size={14} /> Simulation guides</span><label className="check-label"><input aria-label="Show dynamics guides" type="checkbox" checked={rig.dynamicsDebugVisible} onChange={event => { rig.dynamicsDebugVisible = event.target.checked; useProject.setState({ version: version + 1 }); }} /> Guides</label></div><p className="scope-note">{rig.physicsFrame?.particles.length ?? 0} live particles · {settings.bones.filter(item => item.enabled).length} springs · {settings.meshes.filter(item => item.enabled).length} deformable meshes</p></section>
  </section>;
}
