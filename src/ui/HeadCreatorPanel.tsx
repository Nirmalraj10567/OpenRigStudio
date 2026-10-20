import { useRef, useState } from 'react';
import { CircleDot, Eye, KeyRound, Plus, RotateCcw, ScanFace, Upload } from 'lucide-react';
import { useProject } from '../state/projectStore';
import { createHeadCreator, createHeadCreatorTurnKeys, HEAD_CREATOR_ROLES, linkHeadCreatorBody, setHeadCreatorFeatureTarget, updateHeadCreatorControls, updateHeadCreatorMask } from '../engine/headCreator';
import { updateCharacterViewTarget } from '../engine/characterViews';

const ROLE_LABELS: Record<typeof HEAD_CREATOR_ROLES[number], string> = {
  leftEye: 'Left eye', rightEye: 'Right eye', leftPupil: 'Left pupil', rightPupil: 'Right pupil', nose: 'Nose', mouth: 'Mouth', leftEar: 'Left ear', rightEar: 'Right ear',
};

export function HeadCreatorPanel({ onStatus }: { onStatus: (message: string) => void }) {
  const { rig, selectedId, version, updateProject, pause, select } = useProject();
  const [creatorId, setCreatorId] = useState('');
  const [name, setName] = useState('Head turn');
  const [headBoneId, setHeadBoneId] = useState('');
  const [slotId, setSlotId] = useState('');
  const [partId, setPartId] = useState('');
  const [startFrame, setStartFrame] = useState(0);
  const [endFrame, setEndFrame] = useState(48);
  const fileInput = useRef<HTMLInputElement>(null);
  const creator = rig.headCreators.find(item => item.id === creatorId) ?? rig.headCreators[0];
  const set = creator ? rig.characterViews.find(item => item.id === creator.viewSetId) : undefined;
  const slots = creator?.slots ?? [];
  const slot = slots.find(item => item.viewId === slotId) ?? slots.find(item => Math.abs(item.angle) < .001) ?? slots[0];
  const part = partId && set?.targetIds.includes(partId) ? partId : set?.targetIds.find(id => rig.layers.has(id));
  const selectedBone = rig.bones.has(selectedId ?? '') ? selectedId ?? '' : rig.getRoots()[0]?.id ?? '';
  const bodySets = rig.characterViews.filter(item => item.id !== creator?.viewSetId);
  const allTargets = set?.targetIds.map(id => ({ id, name: rig.bones.get(id)?.name ?? rig.layers.get(id)?.name ?? 'Missing target' })) ?? [];

  const create = () => {
    let id: string | null = null;
    updateProject(project => { id = createHeadCreator(project, name, headBoneId || selectedBone); });
    if (!id) return onStatus('Select a valid head bone with an unassigned branch');
    setCreatorId(id);
    onStatus('Head Creator rig generated · front, profile, rear, mask, and facial profile are ready');
  };

  const preview = (angle: number) => {
    if (!creator || !set) return;
    pause();
    rig.characterAngleOverrides.set(set.id, { frame: rig.timeline.currentFrame, angle });
    useProject.setState({ version: version + 1 });
    onStatus(`Head preview · ${Math.round(angle)}° · no turn key added`);
  };

  const control = (key: 'eyeSpacing' | 'noseDepth' | 'mouthWidth' | 'earVisibility', value: number) => {
    if (!creator) return;
    updateProject(project => { updateHeadCreatorControls(project, creator.id, { [key]: value }); });
  };

  const maskPatch = (patch: Parameters<typeof updateHeadCreatorMask>[2]) => {
    if (!creator) return;
    updateProject(project => { updateHeadCreatorMask(project, creator.id, patch); });
  };

  const importArtwork = async (file?: File) => {
    if (!file || !creator || !set || !slot || !part || !rig.layers.has(part)) return;
    if (!file.type.startsWith('image/')) return onStatus('Choose a PNG, JPEG, WebP, or SVG image');
    try {
      const src = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      const image = new Image(); image.src = src; await image.decode();
      const layer = rig.layers.get(part)!;
      const width = layer.type === 'image' ? layer.width : 100;
      const height = layer.type === 'image' ? layer.height : 100;
      updateProject(project => updateCharacterViewTarget(project, set.id, slot.viewId, part, { artwork: { type: 'image', src, width: image.naturalWidth || width, height: image.naturalHeight || height, color: layer.type === 'image' ? layer.color : '#83cebd' } }));
      onStatus(`${slot.name} artwork replaced · head alignment remains editable in Character views`);
    } catch { onStatus('Could not decode this artwork file'); }
  };

  return <section className="dock-section head-creator-section" aria-label="True 360 Head Creator">
    <div className="section-title"><span><CircleDot size={15} /> True 360 Head Creator</span><span className="stage-badge active">HEAD RIG</span></div>
    <p className="stage-lede">Build a head-only turn rig with prepared front, profile, rear, and facial feature artwork.</p>
    {creator ? <>
      <fieldset className="stage-fields">
        <label className="select-field"><span>Head Creator profile</span><select aria-label="Head Creator profile" value={creator.id} onChange={event => setCreatorId(event.target.value)}>{rig.headCreators.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="select-field"><span>Head rig root</span><select aria-label="Head rig root" value={creator.headBoneId} onChange={event => updateProject(project => { const item = project.headCreators.find(value => value.id === creator.id); if (item) item.headBoneId = event.target.value; })}>{[...rig.bones.values()].map(bone => <option key={bone.id} value={bone.id}>{bone.name}</option>)}</select></label>
        <label className="select-field"><span>Body view set</span><select aria-label="Body view set" value={creator.bodyViewSetId ?? ''} onChange={event => updateProject(project => { linkHeadCreatorBody(project, creator.id, event.target.value || undefined); })}><option value="">Independent head</option>{bodySets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </fieldset>

      <section className="head-creator-wheel" aria-label="Head turn preview">
        <div className="section-title"><span>Preview wheel</span><output>{Math.round(set ? (rig.characterAngleOverrides.get(set.id)?.angle ?? set.angle) : 0)}°</output></div>
        <input aria-label="Head turn preview wheel" type="range" min={-180} max={180} step={1} value={set ? (rig.characterAngleOverrides.get(set.id)?.angle ?? set.angle) : 0} onChange={event => preview(Number(event.target.value))} />
        <div className="head-slot-buttons">{slots.map(item => <button key={item.viewId} className="secondary-button" aria-pressed={slot?.viewId === item.viewId} onClick={() => { setSlotId(item.viewId); preview(item.angle); }}><strong>{item.name}</strong><span>{item.angle}°</span></button>)}</div>
      </section>

      <section className="views-section"><div className="property-subtitle">Drawing slots</div><label className="select-field"><span>Slot to author</span><select aria-label="Head drawing slot" value={slot?.viewId ?? ''} onChange={event => setSlotId(event.target.value)}>{slots.map(item => <option key={item.viewId} value={item.viewId}>{item.name} · {item.angle}°</option>)}</select></label><label className="select-field"><span>Artwork part</span><select aria-label="Head artwork part" value={part ?? ''} onChange={event => { setPartId(event.target.value); select(event.target.value); }}>{allTargets.filter(item => rig.layers.has(item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="secondary-button full-button" disabled={!slot || !part} onClick={() => fileInput.current?.click()}><Upload size={13} /> Replace slot artwork</button><input ref={fileInput} aria-label="Head slot artwork file" className="hidden-input" type="file" accept="image/*" onChange={event => { void importArtwork(event.target.files?.[0]); event.target.value = ''; }} /><p className="scope-note">Each slot is a prepared drawing or image state. Use Character views for detailed transforms, mesh points, layer order, and visibility.</p></section>

      <section className="views-section"><div className="property-subtitle">Feature layout</div><div className="head-control-grid"><label className="style-range"><span>Eye spacing <output>{Math.round(creator.controls.eyeSpacing * 100)}%</output></span><input aria-label="Head eye spacing" type="range" min={-1} max={1} step=".01" value={creator.controls.eyeSpacing} onChange={event => control('eyeSpacing', Number(event.target.value))} /></label><label className="style-range"><span>Nose depth <output>{Math.round(creator.controls.noseDepth * 100)}%</output></span><input aria-label="Head nose depth" type="range" min={-1} max={1} step=".01" value={creator.controls.noseDepth} onChange={event => control('noseDepth', Number(event.target.value))} /></label><label className="style-range"><span>Mouth width <output>{Math.round(creator.controls.mouthWidth * 100)}%</output></span><input aria-label="Head mouth width" type="range" min={-1} max={1} step=".01" value={creator.controls.mouthWidth} onChange={event => control('mouthWidth', Number(event.target.value))} /></label><label className="style-range"><span>Ear visibility <output>{Math.round(creator.controls.earVisibility * 100)}%</output></span><input aria-label="Head ear visibility" type="range" min={0} max={1} step=".01" value={creator.controls.earVisibility} onChange={event => control('earVisibility', Number(event.target.value))} /></label></div></section>

      <section className="views-section"><div className="property-subtitle">Facial feature anchors</div><div className="facial-target-grid">{HEAD_CREATOR_ROLES.map(role => <label className="select-field" key={role}><span>{ROLE_LABELS[role]}</span><select aria-label={`Head feature ${ROLE_LABELS[role]}`} value={creator.featureTargets[role] ?? ''} onChange={event => updateProject(project => setHeadCreatorFeatureTarget(project, creator.id, role, event.target.value || undefined))}><option value="">Unmapped</option>{allTargets.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label>)}</div><p className="scope-note">Anchors are applied to every generated view. The linked facial profile remains available in the Facial dock for expressions and tracking.</p></section>

      <section className="views-section"><div className="property-subtitle"><ScanFace size={13} /> Face mask</div><label className="check-label"><input aria-label="Enable generated face mask" type="checkbox" checked={creator.mask.enabled} onChange={event => maskPatch({ enabled: event.target.checked })} /> Show generated face mask guide</label><div className="property-grid">{(['radiusX', 'radiusY'] as const).map(key => <label className="property-field" key={key}><span>{key === 'radiusX' ? 'Mask width' : 'Mask height'}</span><input aria-label={`Head mask ${key}`} type="number" min={1} value={creator.mask[key]} onChange={event => maskPatch({ [key]: Number(event.target.value) })} /></label>)}</div><p className="scope-note">The generated ellipse is a locked guide layer attached to the head root; use it to keep face art inside the silhouette.</p></section>

      <section className="views-section"><div className="property-subtitle">Automatic transition keys</div><div className="property-grid"><label className="property-field"><span>Start frame</span><input aria-label="Head turn start frame" type="number" min={0} value={startFrame} onChange={event => setStartFrame(Number(event.target.value))} /></label><label className="property-field"><span>End frame</span><input aria-label="Head turn end frame" type="number" min={1} value={endFrame} onChange={event => setEndFrame(Number(event.target.value))} /></label></div><button className="secondary-button full-button" onClick={() => updateProject(project => { if (createHeadCreatorTurnKeys(project, creator.id, startFrame, endFrame)) onStatus('Automatic front/profile/rear transition keys created'); })}><KeyRound size={13} /> Create turn keys</button><button className="secondary-button full-button" onClick={() => { if (set) preview(0); }}><RotateCcw size={13} /> Reset preview to front</button></section>
    </> : <>
      <section className="views-section"><p className="scope-note">Select the root bone of the head, then generate a dedicated head-only rig. The source body remains intact and the new head view set can be linked back to it.</p><label className="camera-field">Head Creator name<input aria-label="New Head Creator name" value={name} onChange={event => setName(event.target.value)} /></label><label className="select-field"><span>Head root bone</span><select aria-label="Head root bone" value={headBoneId || selectedBone} onChange={event => setHeadBoneId(event.target.value)}><option value="">Choose a bone…</option>{[...rig.bones.values()].map(bone => <option key={bone.id} value={bone.id}>{bone.name}</option>)}</select></label><button className="secondary-button full-button" disabled={!headBoneId && !selectedBone} onClick={create}><Plus size={13} /> Create head-only rig</button></section>
      <p className="scope-note"><Eye size={13} /> Automatic setup adds Front 0°, Front Side −45°, Side −90°, Back Side −135°, and Back −180° slots.</p>
    </>}
  </section>;
}
