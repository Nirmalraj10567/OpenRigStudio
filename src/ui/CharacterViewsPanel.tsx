import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bone, CheckCircle2, ChevronRight, Footprints, Image as ImageIcon, KeyRound, Play, Plus, RotateCcw, ScanLine, Trash2, Upload, X } from 'lucide-react';
import { useProject } from '../state/projectStore';
import { addCharacterView, addCharacterViewParts, arrangeCharacterViewLayerOrder, captureCharacterMasterModel, characterViewAngle, FULL_TURN_VIEWS, REFERENCE_VIEWS, removeCharacterViewPart, sampleCharacterView, updateCharacterViewTarget, wrapViewAngle } from '../engine/characterViews';
import { inspectCharacterViews } from '../engine/characterQuality';
import { createWalkCycle } from '../engine/walkAnimation';
import { createFrogSmartTurnDemo, createFrogViewDemo, createHumanViewDemo } from '../engine/characterViewDemo';
import { createReferenceGirlDemo } from '../engine/referenceGirlDemo';
import { createReferenceGirlFootballScene } from '../engine/referenceGirlFootballScene';
import { Rig } from '../engine/Rig';
import { projectToSVG } from '../engine/export';
import { meshBounds } from '../engine/mesh';
import { focusCamera } from '../engine/camera';
import { stageLayerTransform } from '../engine/stage2d';
import type { CharacterViewTarget } from '../engine/model';

type Sheet = { name: string; views: Array<{ name: string; angle: number; artwork: string; rigged: string }> };
function ViewSheet({ sheet, onClose }: { sheet: Sheet; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [bones, setBones] = useState(true);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="view-sheet-dialog" aria-labelledby="view-sheet-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><span className="section-muted">MULTI-VIEW CHARACTER REFERENCE</span><h2 id="view-sheet-title">{sheet.name}</h2><p>Prepared artwork and joint alignment · camera-independent turning</p></div><button aria-label="Close view sheet" onClick={onClose}><X size={18} /></button></header>
    <div className="view-sheet-grid">{sheet.views.map(view => <figure key={view.angle}><img src={bones ? view.rigged : view.artwork} alt={`${view.name} at ${view.angle} degrees`} /><figcaption><strong>{view.name}</strong><span>{view.angle}°</span></figcaption></figure>)}</div>
    <footer><label className="check-label"><input type="checkbox" checked={bones} onChange={event => setBones(event.target.checked)} /> Show rig alignment</label><span>Front 0° · Front Side −45° · Side −90° · Back Side −135° · Back −180°</span></footer>
  </dialog>;
}

export function CharacterViewsPanel({ onStatus }: { onStatus: (message: string) => void }) {
  const { rig, version, selectedId, selectedCharacterId, smartEdit, addCharacter, removeCharacter, selectCharacter, setCharacterAngle, keyCharacterAngle, updateProject, replaceProject, pause, select } = useProject();
  const [viewId, setViewId] = useState('');
  const [partId, setPartId] = useState('');
  const [name, setName] = useState('My character');
  const [targets, setTargets] = useState<string[]>([]);
  const [newAngle, setNewAngle] = useState(-45);
  const [newName, setNewName] = useState('Front Side');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [quality, setQuality] = useState<ReturnType<typeof inspectCharacterViews> | null>(null);
  const [previewFrame, setPreviewFrame] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const set = rig.characterViews.find(item => item.id === selectedCharacterId) ?? rig.characterViews[0];
  const angle = set ? characterViewAngle(rig, set.id) : 0;
  const sample = set ? sampleCharacterView(set, angle) : null;
  const view = set?.views.find(item => item.id === viewId) ?? sample?.nearest ?? set?.views[0];
  const part = set?.targetIds.find(id => id === partId) ?? set?.targetIds.find(id => rig.layers.has(id)) ?? set?.targetIds[0];
  const target = part && view ? view.targets[part] : undefined;
  const layer = part ? rig.layers.get(part) : undefined;
  const assigned = new Set(rig.characterViews.flatMap(item => item.targetIds));
  const available = [...rig.bones.values(), ...rig.layers.values()].filter(item => !assigned.has(item.id));
  const validTargets = targets.filter(id => available.some(item => item.id === id));
  const blocked = Boolean(smartEdit);
  useEffect(() => { setViewId(''); setPartId(''); }, [set?.id]);
  useEffect(() => { setQuality(null); setPreviewFrame(rig.timeline.currentFrame); }, [set?.id, rig.timeline.currentFrame]);

  const livePreview = useMemo(() => {
    if (!set) return [];
    const project = rig.toProject();
    const angles = [0, -45, -90, -180];
    return angles.map(angleValue => {
      const previewRig = new Rig(project);
      previewRig.setTimeline({ currentFrame: Math.max(0, Math.min(previewFrame, previewRig.timeline.endFrame)) });
      if (previewRig.timeline.activeAnimationId) previewRig.applyAnimation(previewRig.timeline.activeAnimationId, previewRig.timeline.currentFrame);
      previewRig.characterAngleOverrides.set(set.id, { frame: previewRig.timeline.currentFrame, angle: angleValue });
      previewRig.update();
      const view = set.views.find(item => item.angle === angleValue) ?? sampleCharacterView(set, angleValue)?.nearest;
      return { angle: angleValue, name: view?.name ?? `${angleValue}°`, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(projectToSVG(previewRig))}` };
    });
  }, [rig, set, previewFrame, version]);

  const chooseView = (id: string) => { setViewId(id); };
  const preview = () => {
    if (!set || !view || blocked) return;
    pause(); rig.characterAngleOverrides.set(set.id, { frame: rig.timeline.currentFrame, angle: view.angle });
    useProject.setState({ version: version + 1 }); onStatus(`Previewing ${set.name} · ${view.name} ${view.angle}° · no angle key added`);
  };
  const patchTarget = (patch: Partial<CharacterViewTarget>) => {
    if (!set || !view || !part || blocked) return;
    pause(); updateProject(project => { updateCharacterViewTarget(project, set.id, view.id, part, patch); });
    onStatus(`${view.name} artwork/alignment updated · authored setup pose preserved`);
  };
  const fromRoot = () => {
    if (!selectedId) return;
    const ids = new Set<string>();
    const visit = (id: string) => { if (ids.has(id)) return; ids.add(id); rig.getChildren(id).forEach(child => visit(child.id)); };
    if (rig.bones.has(selectedId)) {
      visit(selectedId); rig.layers.forEach(layer => { if (layer.boundBoneId && ids.has(layer.boundBoneId) || layer.mesh?.vertices.some(vertex => Object.keys(vertex.weights).some(id => ids.has(id)))) ids.add(layer.id); });
    } else ids.add(selectedId);
    setTargets(available.filter(item => ids.has(item.id)).map(item => item.id));
  };
  const demo = (kind: 'human' | 'frog' | 'smart-frog' | 'reference-girl' | 'reference-girl-football') => {
    if ((rig.layers.size || rig.bones.size) && !window.confirm(`Open the ${kind} multi-view demo? Undo restores your current project.`)) return;
    pause(); const example = kind === 'frog' ? createFrogViewDemo() : kind === 'smart-frog' ? createFrogSmartTurnDemo() : kind === 'reference-girl-football' ? createReferenceGirlFootballScene() : kind === 'reference-girl' ? createReferenceGirlDemo() : createHumanViewDemo(); replaceProject(example.toProject());
    useProject.setState({ zoom: .9, selectedCharacterId: example.characterViews[0].id });
    setViewId(''); setPartId(''); onStatus(kind === 'reference-girl' ? 'Reference girl v5 · Hands & fingers: independent 360° wrist turns and ten articulated digits; physics is enabled' : kind === 'reference-girl-football' ? 'Football kick · ball launch, dress cloth, airflow hair, chest jiggle, and ground physics enabled' : `${kind === 'smart-frog' ? 'Smart Bone 360° frog' : kind === 'frog' ? 'Custom frog' : 'Human'} · Play the turn or open Reference sheet`);
  };
  const openSheet = () => {
    if (!set) return;
    const project = rig.toProject();
    const reference = REFERENCE_VIEWS.flatMap(ref => set.views.filter(view => view.angle === ref.angle));
    const views = (reference.length >= 2 ? reference : set.views).map(view => {
      const previewRig = new Rig(project); previewRig.cameraView = 'preview'; previewRig.setStage2D({ enabled: false, cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0, projection: 'orthographic' });
      previewRig.layers.forEach(layer => { layer.visible = layer.visible && set.targetIds.includes(layer.id); });
      previewRig.characterAngleOverrides.set(set.id, { frame: previewRig.timeline.currentFrame, angle: view.angle }); previewRig.update();
      const framing = focusCamera(previewRig, null); if (framing) previewRig.setStage2D({ ...framing, enabled: true });
      const svg = projectToSVG(previewRig);
      const matrix = stageLayerTransform({}, previewRig.getStageView(), { x: previewRig.canvas.width / 2, y: previewRig.canvas.height / 2 });
      const projectPoint = (point: { x: number; y: number }) => ({ x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f });
      const bones = set.targetIds.flatMap(id => { const bone = previewRig.bones.get(id), end = bone && previewRig.getBoneEnd(id); if (!bone || !end) return []; const a = projectPoint(bone.world), b = projectPoint(end); return [`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#f37b72" stroke-width="2"/><circle cx="${a.x}" cy="${a.y}" r="3" fill="#fff" stroke="#f37b72"/>`]; }).join('');
      return { name: view.name, angle: view.angle, artwork: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, rigged: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('</svg>', `${bones}</svg>`))}` };
    });
    setSheet({ name: set.name, views });
  };
  const captureMaster = () => {
    if (!set || blocked) return;
    updateProject(project => {
      const current = project.characterViews.find(item => item.id === set.id);
      if (current) current.master = captureCharacterMasterModel(project, current.targetIds, 0);
    });
    onStatus('Shared master captured · height, landmarks, limb lengths, clothing and shoes now anchor every view');
  };
  const arrangeLayers = () => {
    if (!set || blocked) return;
    let changed = 0;
    updateProject(project => set.views.forEach(viewItem => { changed += arrangeCharacterViewLayerOrder(project, set.id, viewItem.id); }));
    onStatus(changed ? `Automatic near/far layer order updated for ${changed} view targets` : 'View layer order already matches the near/far arrangement');
  };
  const checkViews = () => {
    if (!set) return;
    const report = inspectCharacterViews(rig, set.id);
    setQuality(report);
    onStatus(report.summary.passed ? `Visual joint check passed · ${report.checkedViews} views checked` : `Visual joint check found ${report.summary.errors} errors and ${report.summary.warnings} warnings`);
  };
  const addWalk = () => {
    const holder: { value: ReturnType<typeof createWalkCycle> } = { value: null };
    updateProject(project => { holder.value = createWalkCycle(project, { name: `${set?.name ?? 'Character'} · full walk`, makeActive: true }); });
    const result = holder.value;
    onStatus(result ? `Full walk cycle created · ${result.targetIds.length} limb tracks with planted feet and ankle rotation` : 'Walk cycle needs a full two-segment humanoid rig');
  };
  const importArtwork = async (file?: File) => {
    if (!file || !set || !view || !part || !layer || blocked) return;
    if (!file.type.startsWith('image/')) { onStatus('Choose a PNG, JPEG, WebP, or SVG image for this view'); return; }
    if (file.size > 8_000_000) { onStatus('View artwork must be smaller than 8 MB'); return; }
    const state = useProject.getState(), generation = state.projectGeneration, knownRig = rig;
    const context = { setId: set.id, viewId: view.id, partId: part };
    try {
      const src = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      const image = new Image(); image.src = src; await image.decode();
      const current = useProject.getState();
      if (current.rig !== knownRig || current.projectGeneration !== generation || current.smartEdit) return;
      const entry = knownRig.characterViews.find(item => item.id === context.setId)?.views.find(item => item.id === context.viewId)?.targets[context.partId];
      if (!entry || !knownRig.layers.has(context.partId)) return;
      const bounds = meshBounds(layer), width = entry.artwork?.type === 'image' ? entry.artwork.width : bounds?.width ?? image.naturalWidth;
      const height = entry.artwork?.type === 'image' ? entry.artwork.height : bounds?.height ?? image.naturalHeight;
      const scale = Math.min(width / Math.max(1, image.naturalWidth), height / Math.max(1, image.naturalHeight));
      current.pause(); current.updateProject(project => { updateCharacterViewTarget(project, context.setId, context.viewId, context.partId, { artwork: { type: 'image', src, width: Math.max(1, image.naturalWidth * scale), height: Math.max(1, image.naturalHeight * scale), color: '#77c983' } }); });
      onStatus(`Custom artwork embedded for ${view.name} · adjust the view alignment below`);
    } catch { onStatus('Could not decode this image · choose another local image'); }
  };

  return <section className="character-views-panel" aria-label="Multi-view characters">
      <header className="views-hero"><div className="section-title"><span><RotateCcw size={15} /> Character views</span><span className="stage-badge active">MULTI-VIEW</span></div><p className="stage-lede">One rig, prepared angle views. Works with people, frogs, animals, and custom artwork. Use IK Pose (I); Alt-drag rotates one bone.</p><div className="camera-shot-actions"><button className="secondary-button" disabled={blocked} onClick={() => demo('reference-girl')}>Reference girl · 360° hands v5</button><button className="secondary-button" disabled={blocked} onClick={() => demo('reference-girl-football')}>Reference girl · football kick</button><button className="secondary-button" disabled={blocked} onClick={() => demo('human')}>Human turn demo</button><button className="secondary-button" disabled={blocked} onClick={() => demo('frog')}>Frog turn demo</button><button className="secondary-button" disabled={blocked} onClick={() => demo('smart-frog')}>Frog Smart Bone 360°</button></div></header>
    {set && <section className="views-section">
      <fieldset className="stage-fields" disabled={blocked}>
        <label className="camera-field">Character / view set<select aria-label="Character view set" value={set.id} onChange={event => selectCharacter(event.target.value)}>{rig.characterViews.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="view-current"><div><strong>{sample?.nearest.name}</strong><span>{Number(angle.toFixed(1))}° character angle</span></div><button className="secondary-button" onClick={openSheet}><ImageIcon size={13} /> Reference sheet</button></div>
        <label className="camera-range"><span>Character angle<input aria-label="Character angle" type="number" min={-3600} max={3600} step={1} value={Number(angle.toFixed(2))} onChange={event => { if (Number.isFinite(Number(event.target.value))) setCharacterAngle(set.id, Number(event.target.value)); }} /></span><input aria-label="Character angle slider" type="range" min={-180} max={180} step={1} value={wrapViewAngle(angle)} onChange={event => setCharacterAngle(set.id, Number(event.target.value))} /></label>
        <div className="view-angle-presets">{[...set.views].sort((a, b) => a.angle <= 0 && b.angle <= 0 ? b.angle - a.angle : a.angle > 0 && b.angle > 0 ? a.angle - b.angle : a.angle <= 0 ? -1 : 1).map(item => <button key={item.id} aria-pressed={Math.abs(wrapViewAngle(angle - item.angle)) < .001} onClick={() => { setCharacterAngle(set.id, item.angle); setViewId(item.id); }}><span>{item.name}</span><strong>{item.angle}°</strong></button>)}</div>
        <div className="camera-shot-actions"><button className="secondary-button" onClick={() => keyCharacterAngle(set.id)}><KeyRound size={13} /> Key angle</button><button className="secondary-button" onClick={() => setCharacterAngle(set.id, 0)}><RotateCcw size={13} /> Front 0°</button></div>
        <div className="view-options"><label className="check-label"><input type="checkbox" checked={set.interpolate} onChange={event => updateProject(project => { project.characterViews.find(item => item.id === set.id)!.interpolate = event.target.checked; })} /> Blend alignment</label><label className="check-label"><input type="checkbox" checked={set.wrap} onChange={event => updateProject(project => { project.characterViews.find(item => item.id === set.id)!.wrap = event.target.checked; })} /> Wrap 360°</label></div>
     </fieldset>
      <p className="scope-note">Angle is independent of the camera. Auto-key records turns after frame zero; artwork switches to the nearest prepared view while compatible alignments blend.</p>
     </section>}
     {set && <section className="views-section character-quality-section" aria-label="Character consistency tools">
       <div className="section-title"><span><ScanLine size={14} /> Shared model & visual checks</span><span className={`stage-badge ${set.master ? 'active' : ''}`}>{set.master ? 'MASTER READY' : 'SETUP ONLY'}</span></div>
       <p className="scope-note">Keep height, facial landmarks, limb lengths, clothing, shoes, joints and near/far ordering consistent across every angle.</p>
       <div className="camera-shot-actions">
         <button className="secondary-button" disabled={blocked} onClick={captureMaster}><ScanLine size={13} /> {set.master ? 'Recapture master' : 'Capture shared master'}</button>
         <button className="secondary-button" disabled={blocked} onClick={arrangeLayers}><Footprints size={13} /> Auto layer order</button>
         <button className="secondary-button" onClick={checkViews}><ScanLine size={13} /> Run visual joint check</button>
         <button className="secondary-button" disabled={blocked} onClick={addWalk}><Play size={13} /> Create full walk</button>
       </div>
       {set.master && <div className="master-model-metrics"><span><strong>{Math.round(set.master.height)}px</strong><small>shared height</small></span><span><strong>{Object.keys(set.master.landmarks).length}</strong><small>landmarks</small></span><span><strong>{Object.keys(set.master.limbLengths).length}</strong><small>limb lengths</small></span><span><strong>{Object.keys(set.master.clothing).length}</strong><small>clothing slots</small></span></div>}
       {quality && <div className={`character-quality-report ${quality.summary.passed ? 'passed' : 'needs-review'}`} role="status"><div><span>{quality.summary.passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {quality.summary.passed ? 'Visual checks passed' : 'Visual review needed'}</span><small>{quality.checkedViews} views · {quality.summary.errors} errors · {quality.summary.warnings} warnings</small></div>{quality.issues.length > 0 && <ul>{quality.issues.slice(0, 4).map((issue, index) => <li key={`${issue.viewId}-${issue.targetId ?? index}`}>{issue.viewName}: {issue.message}</li>)}</ul>}</div>}
     </section>}
     {set && <section className="views-section live-character-preview" aria-label="Live character preview">
       <div className="section-title"><span><Play size={14} /> Live side-by-side preview</span><span className="stage-badge active">FRAME {Math.round(previewFrame)}</span></div>
       <div className="live-preview-grid">{livePreview.map(card => <figure key={card.angle}><img src={card.src} alt={`${card.name} live preview at frame ${Math.round(previewFrame)}`} /><figcaption><strong>{card.name}</strong><span>{card.angle}°</span></figcaption></figure>)}</div>
       <label className="camera-range live-preview-scrubber"><span>Timeline scrubber <output>{Math.round(previewFrame)} / {rig.timeline.endFrame}</output></span><input aria-label="Live preview timeline" type="range" min={rig.timeline.startFrame} max={rig.timeline.endFrame} step={1} value={previewFrame} onChange={event => setPreviewFrame(Number(event.target.value))} /></label>
     </section>}
     {set && view && <section className="views-section view-authoring">
      <details open={!set.views.length || set.views.length === 1}><summary>Author angle artwork <ChevronRight size={13} /></summary>
        <fieldset className="stage-fields" disabled={blocked}>
          <label className="camera-field">View to edit<select aria-label="View to edit" value={view.id} onChange={event => chooseView(event.target.value)}>{set.views.map(item => <option key={item.id} value={item.id}>{item.name} · {item.angle}°</option>)}</select></label>
          <button className="secondary-button full-button" onClick={preview}>Preview this view · no angle key</button>
          <label className="camera-field">View name<input aria-label="View name" value={view.name} onChange={event => updateProject(project => { project.characterViews.find(item => item.id === set.id)!.views.find(item => item.id === view.id)!.name = event.target.value; })} /></label>
          <label className="camera-field">Part / bone<select aria-label="View part" value={part ?? ''} onChange={event => { setPartId(event.target.value); select(event.target.value); }}>{set.targetIds.map(id => <option key={id} value={id}>{rig.bones.get(id)?.name ?? rig.layers.get(id)?.name ?? 'Missing part'}{rig.bones.has(id) ? ' · bone' : ' · artwork'}</option>)}</select></label>
          {target && <>
            <div className="property-grid">{(['x', 'y', 'rotation', 'scaleX', 'scaleY'] as const).map(key => <label className="property-field" key={key}><span>{key === 'rotation' ? 'Rotation °' : key === 'scaleX' ? 'Scale X' : key === 'scaleY' ? 'Scale Y' : `Local ${key.toUpperCase()}`}</span><input aria-label={`View part ${key}`} type="number" step={key.startsWith('scale') ? .05 : 1} value={Number((key === 'rotation' ? target.local[key] * 180 / Math.PI : target.local[key]).toFixed(3))} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) patchTarget({ local: { ...target.local, [key]: key === 'rotation' ? value * Math.PI / 180 : value } }); }} /></label>)}</div>
            {layer ? <>
              <div className="view-options"><label className="check-label"><input aria-label="View part visible" type="checkbox" checked={target.visible !== false} onChange={event => patchTarget({ visible: event.target.checked })} /> Visible in view</label><label className="property-field"><span>Layer order</span><input aria-label="View layer order" type="number" value={target.zIndex ?? layer.zIndex} onChange={event => { const zIndex = Number(event.target.value); if (Number.isFinite(zIndex)) patchTarget({ zIndex }); }} /></label></div>
              <label className="camera-range"><span>Part opacity<input aria-label="View part opacity" type="number" min={0} max={1} step={.05} value={target.opacity ?? 1} onChange={event => patchTarget({ opacity: Number(event.target.value) })} /></span></label>
              <button className="secondary-button full-button" onClick={() => fileInput.current?.click()}><Upload size={13} /> Replace artwork for this view</button>
              <input ref={fileInput} aria-label="View artwork file" className="hidden-input" type="file" accept="image/*" onChange={event => { void importArtwork(event.target.files?.[0]); event.target.value = ''; }} />
              {target.artwork?.type === 'image' && <><img className="view-artwork-preview" alt={`${view.name} artwork for ${layer.name}`} src={target.artwork.src || undefined} /><div className="property-grid">{(['width', 'height'] as const).map(key => <label className="property-field" key={key}><span>Artwork {key}</span><input aria-label={`View artwork ${key}`} type="number" min={1} value={target.artwork?.type === 'image' ? Number(target.artwork[key].toFixed(2)) : 100} onChange={event => { if (target.artwork?.type === 'image') patchTarget({ artwork: { ...target.artwork, [key]: Number(event.target.value) } }); }} /></label>)}</div></>}
              {target.artwork?.type === 'vector' && <details className="view-vector-editor"><summary>View-specific vector colors</summary>{target.artwork.shapes.map((shape, index) => <label className="camera-field" key={`${shape.id}-${index}`}>Shape {index + 1} · {shape.kind}<input aria-label={`View shape ${index + 1} fill`} value={shape.fill ?? 'none'} onChange={event => { if (target.artwork?.type === 'vector') patchTarget({ artwork: { type: 'vector', shapes: target.artwork.shapes.map((item, i) => i === index ? { ...item, fill: event.target.value } : item) } }); }} /></label>)}</details>}
            </> : <label className="property-field"><span>Bone length</span><input aria-label="View bone length" type="number" min={0} value={Number((target.length ?? 0).toFixed(2))} onChange={event => patchTarget({ length: Number(event.target.value) })} /></label>}
            <button className="mini-text" onClick={() => patchTarget(JSON.parse(JSON.stringify(set.baseline[part!])))}>Restore part from setup</button>
          </>}
          <p className="scope-note">View settings preserve the base artwork, bones and bindings. Changing the camera does not select another character view.</p>
          <div className="property-subtitle">Add or duplicate an angle</div><div className="property-grid"><label className="property-field"><span>Angle °</span><input aria-label="New view angle" type="number" min={-180} max={180} value={newAngle} onChange={event => setNewAngle(Number(event.target.value))} /></label><label className="property-field"><span>Name</span><input aria-label="New view name" value={newName} onChange={event => setNewName(event.target.value)} /></label></div>
          <button className="secondary-button full-button" disabled={set.views.length >= 32 || !Number.isFinite(newAngle) || set.views.some(item => item.angle === wrapViewAngle(newAngle))} onClick={() => { let id: string | null = null; updateProject(project => { id = addCharacterView(project, set.id, newAngle, newName, view.id); }); if (id) { setViewId(id); onStatus('Angle duplicated · supply its artwork and alignment'); } }}><Plus size={13} /> Duplicate into new angle</button>
          <div className="camera-shot-actions"><button className="secondary-button" onClick={() => updateProject(project => { REFERENCE_VIEWS.forEach(item => addCharacterView(project, set.id, item.angle, item.name)); })}>Add reference angles</button><button className="secondary-button" onClick={() => updateProject(project => { FULL_TURN_VIEWS.forEach(item => addCharacterView(project, set.id, item.angle, item.name)); })}>Add full 8 angles</button></div>
          <button className="danger-button full-button" disabled={set.views.length <= 1} onClick={() => { updateProject(project => { const character = project.characterViews.find(item => item.id === set.id)!; character.views = character.views.filter(item => item.id !== view.id); }); setViewId(''); onStatus('Angle removed · Undo restores it'); }}><Trash2 size={13} /> Delete this angle</button>
        </fieldset>
      </details>
    </section>}
    <section className="views-section"><details open={!rig.characterViews.length}><summary><Plus size={13} /> Create a character / head / body view set</summary><fieldset className="stage-fields" disabled={blocked || rig.characterViews.length >= 32}>
      <label className="camera-field">New character name<input aria-label="New character name" value={name} onChange={event => setName(event.target.value)} /></label>
      <div className="camera-shot-actions"><button className="secondary-button" onClick={() => setTargets(available.map(item => item.id))}>All unassigned parts</button><button className="secondary-button" disabled={!selectedId} onClick={fromRoot}><Bone size={13} /> Selected branch</button></div>
      <div className="checklist view-target-list" aria-label="Character parts">{available.map(item => <label key={item.id}><input type="checkbox" checked={targets.includes(item.id)} onChange={event => setTargets(ids => event.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} /><span>{item.name}</span></label>)}</div>
      <button className="secondary-button full-button" disabled={!validTargets.length || !name.trim()} onClick={() => { const id = addCharacter(name, validTargets); if (id) { setTargets([]); onStatus('Front view captured · add angles and supply artwork for each view'); } }}>Create from {validTargets.length} parts</button>
      <p className="scope-note">Use any skeleton or flat artwork. Choose separate parts for independent head/body controls or multiple characters. Each part belongs to one view set.</p>
    </fieldset></details></section>
    {set && <section className="views-section view-membership"><details><summary>View set parts · {set.targetIds.length}</summary><fieldset className="stage-fields" disabled={blocked}><div className="checklist view-target-list">{[...rig.bones.values(), ...rig.layers.values()].filter(item => set.targetIds.includes(item.id) || !assigned.has(item.id)).map(item => <label key={item.id}><input type="checkbox" checked={set.targetIds.includes(item.id)} disabled={set.targetIds.length === 1 && set.targetIds.includes(item.id)} onChange={event => { const checked = event.target.checked; updateProject(project => { if (checked) addCharacterViewParts(project, set.id, [item.id]); else removeCharacterViewPart(project, set.id, item.id); }); onStatus(checked ? 'Part added to every angle from its setup artwork' : 'Part released from this view set · base artwork preserved'); }} /><span>{item.name}</span></label>)}</div><p className="scope-note">Add newly imported parts, or release head/body parts to create an independent view set. Adding a part starts with its setup in every angle.</p></fieldset></details></section>}
    {set && <section className="views-section"><fieldset className="stage-fields" disabled={blocked}><label className="camera-field">Character name<input aria-label="Character name" value={set.name} onChange={event => updateProject(project => { project.characterViews.find(item => item.id === set.id)!.name = event.target.value; })} /></label><div className="camera-shot-actions"><label className="check-label"><input type="checkbox" checked={set.enabled} onChange={event => updateProject(project => { project.characterViews.find(item => item.id === set.id)!.enabled = event.target.checked; })} /> Enable views</label><button className="danger-button" onClick={() => { removeCharacter(set.id); onStatus('View set and angle tracks removed · artwork remains available'); }}><Trash2 size={13} /> Delete set</button></div></fieldset></section>}
    {sheet && <ViewSheet sheet={sheet} onClose={() => setSheet(null)} />}
  </section>;
}
