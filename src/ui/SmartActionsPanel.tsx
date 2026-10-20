import { useEffect, useState } from 'react';
import { Copy, GitBranch, KeyRound, Play, RotateCcw, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import { useProject } from '../state/projectStore';
import { copySmartKeys, createSmartFolder, createTurnControl, duplicateSmartAction, moveSmartKey, pasteSmartKeys, removeSmartFolder } from '../engine/smartActionAuthoring';
import type { SmartActionKey } from '../engine/model';

const radians = (degrees: number) => degrees * Math.PI / 180;
const degrees = (angle: number) => Math.round(angle * 1800 / Math.PI) / 10;

export function SmartActionsPanel({ onStatus, onEdit }: { onStatus: (message: string) => void; onEdit: () => void }) {
  const { rig, selectedId, smartEdit, updateProject, beginSmartEdit, captureSmartEdit, cancelSmartEdit, select, pause } = useProject();
  const [actionId, setActionId] = useState('');
  const [folderId, setFolderId] = useState('');
  const [name, setName] = useState('Expression');
  const [folderName, setFolderName] = useState('Action folder');
  const [driverId, setDriverId] = useState('');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(90);
  const [angle, setAngle] = useState(90);
  const [selectedKeyAngle, setSelectedKeyAngle] = useState<number | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<SmartActionKey[]>([]);
  const action = rig.smartActions.find(item => item.id === actionId);
  const driver = action ? rig.bones.get(action.driverBoneId) : undefined;
  const minAngle = action ? Math.min(action.startAngle, action.endAngle) : 0;
  const maxAngle = action ? Math.max(action.startAngle, action.endAngle) : 0;
  const editAngle = action?.keys.find(key => degrees(key.angle) === angle)?.angle
    ?? (angle === degrees(action?.endAngle ?? 0) ? action?.endAngle ?? 0 : Math.min(maxAngle, Math.max(minAngle, radians(angle))));
  const availableTargets = [...rig.layersInOrder, ...rig.groups.values(), ...rig.bones.values()].filter(target => target.id !== action?.driverBoneId && Boolean(action?.baseline[target.id]));
  const validTargets = targets.filter(id => availableTargets.some(target => target.id === id));
  const actionFolder = action?.folderId ? rig.smartActionFolders.find(folder => folder.id === action.folderId) : undefined;
  useEffect(() => {
    if (actionId && !rig.smartActions.some(item => item.id === actionId)) { setActionId(''); setTargets([]); }
    if (driverId && !rig.bones.has(driverId)) setDriverId('');
  }, [rig, actionId, driverId]);
  const chooseAction = (id: string) => {
    setActionId(id);
    const chosen = rig.smartActions.find(item => item.id === id);
    if (chosen) { setAngle(degrees(chosen.endAngle)); setSelectedKeyAngle(chosen.keys[chosen.keys.length - 1]?.angle ?? chosen.endAngle); setFolderId(chosen.folderId ?? ''); setTargets(selectedId && selectedId !== chosen.driverBoneId && chosen.baseline[selectedId] ? [selectedId] : []); }
    else { setTargets([]); setFolderId(''); }
  };
  const mutate = (change: () => void) => { pause(); updateProject(change); };
  const createQuickAction = (kind: 'head' | 'body') => {
    let id: string | null = null;
    mutate(() => { id = createTurnControl(rig, kind); });
    if (id) { chooseAction(id); onStatus(`${kind === 'head' ? 'Head' : 'Body'} turn control created`); }
  };

  return <section className={`dock-section actions-section ${smartEdit ? 'editing' : ''}`} aria-label="Smart Bone Actions">
    <div className="section-title"><span>Smart Bone Actions</span><span className="mode-badge">{smartEdit ? 'EDIT KEY' : 'LIVE'}</span></div>
    <p className="scope-note">Author layered turn corrections, facial controls, mesh changes, visibility, masks, and patch seams from one driver angle.</p>
    <fieldset className="property-fields" disabled={Boolean(smartEdit)}>
      <label className="select-field"><span>Action folder</span><select value={folderId} onChange={event => setFolderId(event.target.value)}><option value="">All actions</option>{rig.smartActionFolders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
      <div className="panel-buttons"><input className="compact-input" aria-label="New action folder" value={folderName} onChange={event => setFolderName(event.target.value)} /><button className="mini-button" title="Create action folder" onClick={() => { mutate(() => createSmartFolder(rig, folderName)); onStatus('Smart Action folder created'); }}><GitBranch size={14} /></button><button className="mini-button" title="Delete selected action folder" disabled={!folderId} onClick={() => { mutate(() => removeSmartFolder(rig, folderId)); setFolderId(''); onStatus('Smart Action folder removed'); }}><Trash2 size={14} /></button></div>
      <label className="select-field"><span>Action</span><select value={action?.id ?? ''} onChange={event => chooseAction(event.target.value)}><option value="">Choose an action…</option>{rig.smartActions.filter(item => !folderId || item.folderId === folderId).map(item => <option key={item.id} value={item.id}>{item.name}{item.enabled ? '' : ' (disabled)'}</option>)}</select></label>
      <div className="panel-buttons"><button className="secondary-button" onClick={() => createQuickAction('head')}><WandSparkles size={13} /> Head turn</button><button className="secondary-button" onClick={() => createQuickAction('body')}><WandSparkles size={13} /> Body turn</button></div>
      <details className="action-create" open={!rig.smartActions.length}><summary>Create action</summary>
        <label className="name-field"><span>New action name</span><div className="name-input"><input value={name} onChange={event => setName(event.target.value)} /></div></label>
        <label className="select-field"><span>Driver bone</span><select value={driverId} onChange={event => setDriverId(event.target.value)}><option value="">Choose driver…</option>{[...rig.bones.values()].map(bone => <option key={bone.id} value={bone.id}>{bone.name}</option>)}</select></label>
        <button className="mini-text" onClick={() => { let id = ''; mutate(() => { id = rig.addBone(null, 'Expression control', 55); const bone = rig.bones.get(id)!; bone.local.x = 650; bone.local.y = 120; }); setDriverId(id); select(id); onStatus('Floating root control created · Use the preview angle'); }}>+ Create floating control bone</button>
        <div className="property-grid"><label className="property-field"><span>Start angle °</span><input type="number" value={start} onChange={event => setStart(Number(event.target.value))} /></label><label className="property-field"><span>End angle °</span><input type="number" value={end} onChange={event => setEnd(Number(event.target.value))} /></label></div>
        <button className="secondary-button full-button" disabled={!driverId || !name.trim() || !Number.isFinite(start + end) || start === end} onClick={() => { let id: string | null = null; mutate(() => { id = rig.createSmartAction(name.trim(), driverId, radians(start), radians(end)); }); if (id) { chooseAction(id); onStatus('Action created from current baseline'); } else onStatus('Could not create action'); }}>Create Smart Bone Action</button>
      </details>
    </fieldset>
    {action && <>
      <fieldset className="property-fields" disabled={Boolean(smartEdit)}>
        <label className="name-field"><span>Action name</span><div className="name-input"><input value={action.name} onChange={event => mutate(() => { action.name = event.target.value; })} /></div></label>
        <label className="select-field"><span>Folder</span><select value={action.folderId ?? ''} onChange={event => mutate(() => { action.folderId = event.target.value || null; })}><option value="">No folder</option>{rig.smartActionFolders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
        <div className="property-grid"><label className="select-field"><span>Blend</span><select value={action.blendMode ?? 'additive'} onChange={event => mutate(() => { action.blendMode = event.target.value as 'additive' | 'override'; })}><option value="additive">Additive</option><option value="override">Override</option></select></label><label className="property-field"><span>Priority</span><input type="number" value={action.priority ?? 0} onChange={event => mutate(() => { action.priority = Number(event.target.value); })} /></label></div>
        <label className="style-range"><span>Action weight <output>{Math.round((action.weight ?? 1) * 100)}%</output></span><input type="range" min={0} max={1} step=".01" value={action.weight ?? 1} onChange={event => mutate(() => { action.weight = Number(event.target.value); })} /></label>
        <div className="property-grid"><label className="property-field"><span>Neutral °</span><input type="number" value={degrees(action.neutralAngle ?? action.startAngle)} onChange={event => mutate(() => { action.neutralAngle = radians(Number(event.target.value)); })} /></label><label className="check-label"><input type="checkbox" checked={action.limitDriver === true} onChange={event => mutate(() => { action.limitDriver = event.target.checked; })} /> Limit driver</label></div>
        <label className="check-label"><input type="checkbox" checked={action.enabled} onChange={event => mutate(() => { action.enabled = event.target.checked; })} /> Enabled</label>
        <div className="panel-buttons"><button className="secondary-button" onClick={() => mutate(() => duplicateSmartAction(rig, action.id))}><Copy size={13} /> Duplicate</button><button className="secondary-button" onClick={() => mutate(() => duplicateSmartAction(rig, action.id, true))}>Mirror</button><button className="secondary-button" onClick={() => mutate(() => { rig.setSmartSolo(rig.smartSoloActionId === action.id ? null : action.id); })}>{rig.smartSoloActionId === action.id ? 'Exit solo' : 'Solo'}</button><button className="danger-button" onClick={() => { mutate(() => rig.removeSmartAction(action.id)); setActionId(''); setTargets([]); onStatus('Action deleted · Undo restores it'); }}><Trash2 size={13} /></button></div>
        <p className="scope-note">Driver: {driver?.name ?? 'Missing bone'} · {degrees(action.startAngle)}° to {degrees(action.endAngle)}° · {actionFolder?.name ?? 'Unfiled'}</p>
        <div className="property-subtitle">Dependencies</div><div className="checklist action-targets">{rig.smartActions.filter(item => item.id !== action.id).map(item => <label key={item.id}><input type="checkbox" checked={action.dependencies?.includes(item.id) ?? false} onChange={event => mutate(() => { action.dependencies = event.target.checked ? [...new Set([...(action.dependencies ?? []), item.id])] : (action.dependencies ?? []).filter(id => id !== item.id); })} /><span>{item.name}</span></label>)}</div>
        <label className="property-field"><span>Preview driver rotation · {degrees(rig.smartPreviewAngles.get(action.id) ?? driver?.local.rotation ?? 0)}°</span><input aria-label="Preview driver rotation" type="range" min={degrees(minAngle)} max={degrees(maxAngle)} step={.5} value={degrees(rig.smartPreviewAngles.get(action.id) ?? driver?.local.rotation ?? 0)} disabled={!driver} onChange={event => mutate(() => { rig.setSmartPreview(action.id, radians(Number(event.target.value))); })} /></label>
        <div className="panel-buttons"><button className="secondary-button" onClick={() => mutate(() => { rig.resetSmartAction(action.id); })}><RotateCcw size={13} /> Reset neutral</button><label className="check-label"><input type="checkbox" checked={rig.smartAngleGuides} onChange={event => { rig.smartAngleGuides = event.target.checked; rig.update(); }} /> Angle guide</label></div>
        <p className="scope-note">{rig.smartActionDiagnostics.length ? rig.smartActionDiagnostics.join(' · ') : 'Dependencies evaluate before this action. Override replaces earlier deltas; additive stacks corrections.'}</p>
        <div className="property-subtitle">Captured keys · click to choose angle</div>
        <div className="key-buttons smart-key-buttons">{action.keys.map((key, index) => <button key={index} className="smart-key-button" aria-pressed={selectedKeyAngle === key.angle} onClick={() => { setSelectedKeyAngle(key.angle); setAngle(degrees(key.angle)); }}><img src={key.thumbnail} alt="" /><span>{degrees(key.angle)}°</span></button>)}</div>
        <div className="panel-buttons"><button className="secondary-button" disabled={selectedKeyAngle === null} onClick={() => setClipboard(copySmartKeys(rig, action.id, [selectedKeyAngle!]))}><Copy size={13} /> Copy key</button><button className="secondary-button" disabled={!clipboard.length} onClick={() => mutate(() => pasteSmartKeys(rig, action.id, clipboard, radians(angle)))}>Paste key</button><button className="secondary-button" disabled={selectedKeyAngle === null} onClick={() => mutate(() => moveSmartKey(rig, action.id, selectedKeyAngle!, radians(angle)))}><KeyRound size={13} /> Move key</button></div>
        <label className="property-field"><span>Edit angle °</span><input type="number" min={degrees(minAngle)} max={degrees(maxAngle)} value={angle} onChange={event => setAngle(Number(event.target.value))} /></label>
      </fieldset>
      <div className="property-subtitle">Targets to capture · {validTargets.length} selected</div>
      <div className="checklist action-targets">{availableTargets.map(target => <label key={target.id}><input type="checkbox" checked={targets.includes(target.id)} onChange={event => setTargets(ids => event.target.checked ? [...ids, target.id] : ids.filter(id => id !== target.id))} /><button className="target-select" onClick={() => select(target.id)} title="Select target for editing">{target.name}</button></label>)}</div>
      <p className="scope-note">Targets can include groups, meshes, artwork, and bones. Visibility, masks, patch seams, and layer order are stored as discrete action changes.</p>
      {smartEdit ? <><p className="edit-notice" role="status">Editing {degrees(smartEdit.angle)}° from this action’s baseline. Live actions and timeline are suspended.</p><div className="panel-buttons"><button className="secondary-button" disabled={!validTargets.length} onClick={() => { if (captureSmartEdit(validTargets)) onStatus('Smart key captured'); else onStatus('Could not capture key'); }}>Capture key</button><button className="danger-button" onClick={() => { cancelSmartEdit(); onStatus('Action edit cancelled'); }}>Cancel edit</button></div></> : <button className="secondary-button full-button" disabled={!driver || !validTargets.length || !Number.isFinite(angle) || angle < degrees(minAngle) || angle > degrees(maxAngle)} onClick={() => { if (beginSmartEdit(action.id, editAngle)) { select(validTargets[0]); onEdit(); onStatus('Editing Smart key · Capture or Cancel'); } else onStatus('Could not begin action edit'); }}><KeyRound size={13} /> Edit key at {angle}°</button>}
    </>}
  </section>;
}
