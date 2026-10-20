import { Aperture, Bookmark, Box, Camera, Focus, KeyRound, Move, Plus, Radio, RotateCcw, Scan, Scissors, Sun, Trash2, Wand2, ZoomIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { activeCameraId, focusCamera, sampledCamera, setCameraFollow as linkCamera, updateCameraControls, CAMERA_PROPERTIES } from '../engine/camera';
import type { CameraToolMode } from '../engine/camera';
import { createCameraDemo } from '../engine/cameraDemo';
import type { Stage2DSettings } from '../engine/stage2d';
import { useProject } from '../state/projectStore';
import { defaultCamera3D } from '../engine/camera3d';
import { applyCameraBookmark, captureCameraBookmark, recordCameraCutPreset, triggerLiveCamera } from '../engine/cameraProduction';
import { startLiveCameraStream, stopLiveCameraStream } from '../engine/liveCameraStream';

const MODES: Array<{ value: CameraToolMode; label: string; icon: React.ReactNode }> = [
  { value: 'pan', label: 'Track', icon: <Move size={14} /> },
  { value: 'zoom', label: 'Zoom', icon: <ZoomIn size={14} /> },
  { value: 'roll', label: 'Roll', icon: <RotateCcw size={14} /> },
  { value: 'orbit', label: 'Pan / tilt', icon: <Scan size={14} /> },
];

export function CameraPanel({ onStatus, onActivate }: { onStatus: (message: string) => void; onActivate: () => void }) {
  const { rig, smartEdit, selectedId, cameraToolMode, setCameraToolMode, cameraGuides, setCameraGuides, addCamera, removeCamera, setCameraView, updateCamera, keyCamera, setCameraCut, setCameraFollow, updateProject, replaceProject, pause } = useProject();
  const [streaming, setStreaming] = useState(false);
  const cameraId = activeCameraId(rig);
  const camera = rig.cameras.find(item => item.id === cameraId);
  const pose = cameraId ? rig.cameraOverride?.id === cameraId && rig.cameraOverride.frame === rig.timeline.currentFrame ? rig.cameraOverride.settings : sampledCamera(rig, cameraId)!.settings : rig.stage2d;
  const camera3d = pose.camera3d ?? defaultCamera3D();
  const follow = cameraId ? sampledCamera(rig, cameraId)?.follow : null;
  const editable = !smartEdit && rig.cameraView !== 'switch';
  const hasPreparedViews = rig.characterViews.some(set => set.enabled && set.views.length > 1);
  const has3DGeometry = [...rig.layers.values()].some(layer => Boolean(layer.mesh3d));
  const apply = (patch: Partial<Stage2DSettings>) => { updateCamera(patch); onStatus(rig.cameraView === 'preview' ? 'Preview camera updated · non-keyable' : `Camera updated at frame ${Math.round(rig.timeline.currentFrame)}`); };
  const apply3d = (patch: Partial<typeof camera3d>) => apply({ camera3d: { ...camera3d, ...patch } });
  const focus = (id: string | null) => {
    const patch = focusCamera(rig, id);
    if (patch) {
      updateProject(project => {
        if (follow) linkCamera(project, null);
        const offset = cameraId ? sampledCamera(project, cameraId)?.followOffset : null;
        updateCameraControls(project, { ...patch, cameraX: patch.cameraX! - (offset?.x ?? 0), cameraY: patch.cameraY! - (offset?.y ?? 0) }, useProject.getState().autoKey);
      });
      onStatus(id ? 'Camera focused on selection' : 'Camera framed all visible artwork');
    }
    else onStatus('Select visible artwork or a bone with attached artwork to focus');
  };
  const openDemo = () => {
    if ((rig.layers.size || rig.bones.size) && !window.confirm('Open the animated camera demo? Undo restores your current project.')) return;
    pause(); replaceProject(createCameraDemo().toProject()); useProject.setState({ zoom: .9 });
    onStatus('Camera demo · Play for tracking, a close-up cut at 72, and a follow shot at 96');
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (smartEdit || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest('input, textarea, select, button, dialog'))) return;
      const shot = rig.cameras.find(item => item.hotkey === Number(event.key));
      if (shot) { event.preventDefault(); setCameraView(shot.id); onStatus(`Camera view: ${shot.name}`); }
      else if (editable && event.key.toLowerCase() === 'f') { event.preventDefault(); focus(selectedId); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });

  const controls: Array<{ key: typeof CAMERA_PROPERTIES[number]; label: string; min: number; max: number; step: number }> = [
    { key: 'cameraX', label: 'Track X', min: -1600, max: 1600, step: 1 },
    { key: 'cameraY', label: 'Track Y', min: -1040, max: 1040, step: 1 },
    { key: 'zoom', label: 'Zoom / lens', min: .1, max: 4, step: .01 },
    { key: 'roll', label: 'Roll', min: -180, max: 180, step: 1 },
    { key: 'yaw', label: 'Pan angle', min: -180, max: 180, step: 1 },
    { key: 'pitch', label: 'Tilt angle', min: -85, max: 85, step: 1 },
    { key: 'perspective', label: 'Depth perspective', min: 0, max: 1, step: .01 },
  ];
  return <div className="camera-panel">
    <section className="camera-hero">
      <div className="section-title"><span><Camera size={15} /> Camera editor</span><span className="stage-badge active">{rig.cameraView === 'preview' ? 'PREVIEW' : rig.cameraView === 'switch' ? 'SWITCH' : 'KEYABLE'}</span></div>
      <p className="stage-lede">Compose shots, animate camera movement, follow a subject, and cut between cameras on the timeline.</p>
      <label className="camera-field">Viewport camera<select aria-label="Viewport camera" value={rig.cameraView} disabled={Boolean(smartEdit)} onChange={event => setCameraView(event.target.value)}><option value="preview">Preview · non-keyable</option><option value="switch">Switch · timeline cuts</option>{rig.cameras.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="camera-shot-actions"><button className="secondary-button" disabled={Boolean(smartEdit) || rig.cameras.length >= 32} onClick={() => { if (addCamera()) { onActivate(); onStatus('Custom camera captured from the current view'); } }}><Plus size={13} /> Capture camera</button><button className="secondary-button" disabled={Boolean(smartEdit)} onClick={openDemo}>Camera demo</button></div>
      {rig.cameraView === 'switch' && <p className="camera-notice">Playing: <strong>{camera?.name ?? 'No camera yet'}</strong>. Select a custom camera to change its controls.</p>}
    </section>
    <section className="camera-section">
      <div className="section-title"><span>Camera tools</span><span className="section-muted">C · camera tool</span></div>
      <div className="camera-tool-modes">{MODES.map(mode => <button key={mode.value} aria-pressed={cameraToolMode === mode.value} disabled={!editable} onClick={() => { setCameraToolMode(mode.value); onActivate(); }}>{mode.icon}{mode.label}</button>)}</div>
       <p className="stage-footnote">Drag the canvas to operate the camera. In Camera tool mode, the full-scene orbit guide rotates Yaw, Pitch, or Roll. Shift snaps to 5°; wheel zooms the camera.</p>
       {!hasPreparedViews && !has3DGeometry && <p className="camera-notice">This scene contains flat 2D artwork only. Camera orbit can move the view, but it cannot reveal a side angle until you add prepared Character Views or 3D geometry.</p>}
      <fieldset className="stage-fields" disabled={!editable}>
        <div className="camera-shot-actions"><button className="secondary-button" disabled={!selectedId} onClick={() => focus(selectedId)}><Focus size={13} /> Focus object</button><button className="secondary-button" onClick={() => focus(null)}><Scan size={13} /> Focus all</button></div>
        <label className="camera-field">Projection<select aria-label="Camera projection" value={pose.projection} onChange={event => apply({ projection: event.target.value as Stage2DSettings['projection'] })}><option value="perspective">Perspective · depth scaling / parallax</option><option value="orthographic">Orthographic · uniform scale / pan</option></select></label>
        {controls.map(control => <label className="camera-range" key={control.key}><span>{control.label}<input aria-label={control.label} type="number" min={control.min} max={control.max} step={control.step} value={Number(Number(pose[control.key]).toFixed(2))} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) apply({ [control.key]: Math.max(control.min, Math.min(control.max, value)) }); }} /></span><input aria-label={`${control.label} slider`} type="range" min={control.min} max={control.max} step={control.step} value={Number(pose[control.key])} onChange={event => apply({ [control.key]: Number(event.target.value) })} /></label>)}
        <button className="secondary-button full-button" onClick={() => apply({ cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0 })}><RotateCcw size={13} /> Reset camera view</button>
      </fieldset>
       <label className="check-label"><input type="checkbox" checked={cameraGuides} onChange={event => setCameraGuides(event.target.checked)} /> Show safe-frame, thirds & orbit guide</label>
    </section>
       <section className="camera-section camera-3d-section">
      <div className="section-title"><span><Box size={15} /> True 3D camera</span><span className="stage-badge active">PHYSICAL LENS</span></div>
      <p className="stage-lede">Perspective depth, physical focal length, focus distance, aperture, lighting, and 3D geometry rendering.</p>
      <fieldset className="stage-fields" disabled={!editable}>
        <label className="check-label"><input aria-label="Enable true 3D camera" type="checkbox" checked={camera3d.enabled} onChange={event => apply3d({ enabled: event.target.checked })} /> Enable true 3D camera</label>
        <label className="camera-field">3D projection<select aria-label="3D camera projection" value={camera3d.projection} onChange={event => apply3d({ projection: event.target.value as typeof camera3d.projection })}><option value="perspective">Perspective lens</option><option value="orthographic">Orthographic</option></select></label>
        <div className="property-grid"><label className="camera-field">Focal length<input aria-label="Focal length" type="number" min="12" max="400" value={camera3d.focalLength} onChange={event => apply3d({ focalLength: Number(event.target.value) })} /></label><label className="camera-field">Sensor width<input aria-label="Sensor width" type="number" min="10" max="100" value={camera3d.sensorWidth} onChange={event => apply3d({ sensorWidth: Number(event.target.value) })} /></label><label className="camera-field">Near clip<input aria-label="Near clip" type="number" min=".01" value={camera3d.near} onChange={event => apply3d({ near: Number(event.target.value) })} /></label><label className="camera-field">Far clip<input aria-label="Far clip" type="number" min="10" value={camera3d.far} onChange={event => apply3d({ far: Number(event.target.value) })} /></label></div>
        <div className="property-subtitle"><Move size={13} /> Camera transform · XYZ Euler</div><div className="property-grid">{(['x', 'y', 'z'] as const).map(axis => <label className="camera-field" key={`pos-${axis}`}>Position {axis.toUpperCase()}<input aria-label={`3D camera position ${axis.toUpperCase()}`} type="number" value={camera3d.position[axis]} onChange={event => apply3d({ position: { ...camera3d.position, [axis]: Number(event.target.value) } })} /></label>)}{(['x', 'y', 'z'] as const).map(axis => <label className="camera-field" key={`rot-${axis}`}>Rotation {axis.toUpperCase()} °<input aria-label={`3D camera rotation ${axis.toUpperCase()}`} type="number" value={camera3d.rotation[axis]} onChange={event => apply3d({ rotation: { ...camera3d.rotation, [axis]: Number(event.target.value) } })} /></label>)}</div>
        <div className="property-subtitle"><Aperture size={13} /> Focus & depth of field</div><label className="check-label"><input aria-label="Enable depth of field" type="checkbox" checked={camera3d.depthOfField} onChange={event => apply3d({ depthOfField: event.target.checked })} /> Enable depth of field</label><div className="property-grid"><label className="camera-field">Focus distance<input aria-label="Focus distance" type="number" min=".01" value={camera3d.focusDistance} onChange={event => apply3d({ focusDistance: Number(event.target.value) })} /></label><label className="camera-field">Aperture<input aria-label="Aperture" type="number" min="0" value={camera3d.aperture} onChange={event => apply3d({ aperture: Number(event.target.value) })} /></label><label className="camera-field">F-stop<input aria-label="F-stop" type="number" min=".1" value={camera3d.fStop} onChange={event => apply3d({ fStop: Number(event.target.value) })} /></label><label className="camera-field">Ortho scale<input aria-label="Orthographic scale" type="number" min="20" value={camera3d.orthographicScale} onChange={event => apply3d({ orthographicScale: Number(event.target.value) })} /></label></div>
        <div className="property-subtitle"><Sun size={13} /> Lighting & shadows</div><div className="property-grid"><label className="camera-field">Ambient<input aria-label="Ambient light" type="number" min="0" max="1" step=".01" value={camera3d.ambient} onChange={event => apply3d({ ambient: Number(event.target.value) })} /></label><label className="camera-field">Key intensity<input aria-label="Key light intensity" type="number" min="0" max="8" step=".1" value={camera3d.keyLight.intensity} onChange={event => apply3d({ keyLight: { ...camera3d.keyLight, intensity: Number(event.target.value) } })} /></label><label className="camera-field">Shadow softness<input aria-label="Shadow softness" type="number" min="0" max="80" value={camera3d.shadow.softness} onChange={event => apply3d({ shadow: { ...camera3d.shadow, softness: Number(event.target.value) } })} /></label><label className="camera-field">Shadow opacity<input aria-label="Shadow opacity" type="number" min="0" max="1" step=".05" value={camera3d.shadow.opacity} onChange={event => apply3d({ shadow: { ...camera3d.shadow, opacity: Number(event.target.value) } })} /></label></div>
      </fieldset>
      <p className="scope-note">Use the 3D layer controls in the Stage section to assign position, rotation, depth shift, extrusion, inflate, or lathe geometry.</p>
    </section>
    <section className="camera-section production-camera-section">
      <div className="section-title"><span><Radio size={15} /> Production camera</span><span className="stage-badge active">LIVE</span></div>
      <div className="property-grid"><label className="check-label"><input aria-label="Puppet Stage mode" type="checkbox" checked={rig.cameraProduction.stageMode} onChange={event => updateProject(project => { project.cameraProduction.stageMode = event.target.checked; })} /> Puppet Stage mode</label><label className="check-label"><input aria-label="Live camera control" type="checkbox" checked={rig.cameraProduction.liveControl.enabled} onChange={event => updateProject(project => { project.cameraProduction.liveControl.enabled = event.target.checked; })} /> Live control</label></div>
      <label className="camera-field">Live input<select aria-label="Live input source" value={rig.cameraProduction.liveControl.source} onChange={event => updateProject(project => { project.cameraProduction.liveControl.source = event.target.value as typeof project.cameraProduction.liveControl.source; })}><option value="pointer">Pointer / tablet</option><option value="device-orientation">Device orientation</option><option value="gamepad">Gamepad</option></select></label>
      <div className="property-grid"><label className="camera-field">Sensitivity<input aria-label="Live sensitivity" type="number" min="0" max="10" step=".1" value={rig.cameraProduction.liveControl.sensitivity} onChange={event => updateProject(project => { project.cameraProduction.liveControl.sensitivity = Number(event.target.value); })} /></label><label className="camera-field">Smoothing<input aria-label="Live smoothing" type="number" min="0" max=".99" step=".05" value={rig.cameraProduction.liveControl.smoothing} onChange={event => updateProject(project => { project.cameraProduction.liveControl.smoothing = Number(event.target.value); })} /></label></div>
      <div className="property-subtitle"><Wand2 size={13} /> Camera shake</div><label className="check-label"><input aria-label="Enable camera shake" type="checkbox" checked={rig.cameraProduction.shake.enabled} onChange={event => updateProject(project => { project.cameraProduction.shake.enabled = event.target.checked; })} /> Enable procedural shake</label><div className="property-grid"><label className="camera-field">Amplitude<input aria-label="Shake amplitude" type="number" min="0" max="200" value={rig.cameraProduction.shake.amplitude} onChange={event => updateProject(project => { project.cameraProduction.shake.amplitude = Number(event.target.value); })} /></label><label className="camera-field">Frequency<input aria-label="Shake frequency" type="number" min="0" max="120" value={rig.cameraProduction.shake.frequency} onChange={event => updateProject(project => { project.cameraProduction.shake.frequency = Number(event.target.value); })} /></label><label className="camera-field">Rotation<input aria-label="Shake rotation" type="number" min="0" max="30" value={rig.cameraProduction.shake.rotation} onChange={event => updateProject(project => { project.cameraProduction.shake.rotation = Number(event.target.value); })} /></label></div>
      <div className="property-subtitle"><Bookmark size={13} /> Bookmarks & live switching</div><div className="camera-shot-actions"><button className="secondary-button" disabled={!cameraId || rig.cameraView === 'switch'} onClick={() => updateProject(project => { if (captureCameraBookmark(project)) onStatus('Camera bookmark captured'); })}><Bookmark size={13} /> Capture bookmark</button><button className="secondary-button" disabled={!cameraId} onClick={() => { keyCamera(); onStatus('Camera path key recorded'); }}><KeyRound size={13} /> Path key</button></div>{rig.cameraProduction.bookmarks.map(bookmark => <div className="camera-shot" key={bookmark.id}><button onClick={() => updateProject(project => { if (applyCameraBookmark(project, bookmark.id)) onStatus(`Bookmark: ${bookmark.name}`); })}><Bookmark size={13} /><span>{bookmark.name}</span><small>F{bookmark.frame}</small></button><button className="mini-button" aria-label={`Delete ${bookmark.name}`} onClick={() => updateProject(project => { project.cameraProduction.bookmarks = project.cameraProduction.bookmarks.filter(item => item.id !== bookmark.id); })}><Trash2 size={13} /></button></div>)}
      <label className="camera-field">Default transition<select aria-label="Default camera transition" value={rig.cameraProduction.defaultTransitionPresetId} onChange={event => updateProject(project => { project.cameraProduction.defaultTransitionPresetId = event.target.value; })}>{rig.cameraProduction.transitionPresets.map(preset => <option key={preset.id} value={preset.id}>{preset.name} · {preset.duration}f</option>)}</select></label>
      <div className="camera-shot-actions">{rig.cameras.map(item => <button key={item.id} className="secondary-button" onClick={() => updateProject(project => { triggerLiveCamera(project, item.id); onStatus(`Live camera switched to ${item.name}`); })}><Radio size={13} /> Live {item.name}</button>)}</div>
      <button className={streaming ? 'danger-button full-button' : 'secondary-button full-button'} onClick={() => { if (streaming) { stopLiveCameraStream(); setStreaming(false); onStatus('Live camera stream stopped'); return; } try { const canvas = document.querySelector<HTMLCanvasElement>('.stage-canvas'); if (!canvas) throw new Error('Stage canvas is unavailable'); startLiveCameraStream(canvas, rig.timeline.fps); setStreaming(true); onStatus('Live camera MediaStream ready · hand it to WebRTC, OBS, or MediaRecorder'); } catch (error) { onStatus(error instanceof Error ? error.message : 'Could not start live camera output'); } }}>{streaming ? <><Radio size={13} /> Stop live output</> : <><Radio size={13} /> Start live stream output</>}</button>
      <p className="scope-note">Number keys switch camera hotkeys. Puppet Stage keeps live control transient; camera bookmarks, cuts, transitions, shake, rigs, and path keys remain project data.</p>
    </section>
    <section className="camera-section">
      <div className="section-title"><span>Named shots</span><small>{rig.cameras.length} cameras</small></div>
      {!rig.cameras.length && <p className="scope-note">Adjust the Preview camera and Capture camera to save a keyable shot.</p>}
      <div className="camera-shot-list">{rig.cameras.map(item => <div className={`camera-shot ${item.id === cameraId ? 'active' : ''}`} key={item.id}><button onClick={() => setCameraView(item.id)} disabled={Boolean(smartEdit)}><span className="camera-hotkey">{item.hotkey ?? '—'}</span><span>{item.name}</span></button><button className="mini-button" title={`Cut to ${item.name} at current frame`} disabled={Boolean(smartEdit)} onClick={() => { setCameraCut(item.id); onStatus(`Cut to ${item.name} at frame ${Math.round(rig.timeline.currentFrame)}`); }}><Scissors size={13} /></button></div>)}</div>
      {camera && rig.cameraView !== 'switch' && <fieldset className="stage-fields" disabled={Boolean(smartEdit)}>
        <label className="camera-field">Shot name<input aria-label="Camera name" value={camera.name} onChange={event => updateProject(project => { project.cameras.find(item => item.id === camera.id)!.name = event.target.value; })} /></label>
        <label className="camera-field">Shot hotkey (1–9)<select aria-label="Camera hotkey" value={camera.hotkey ?? ''} onChange={event => updateProject(project => { const selected = project.cameras.find(item => item.id === camera.id)!; const hotkey = Number(event.target.value); if (hotkey) { project.cameras.forEach(item => { if (item.hotkey === hotkey) delete item.hotkey; }); selected.hotkey = hotkey; } else delete selected.hotkey; })}><option value="">No hotkey</option>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map(number => <option key={number} value={number}>{number}</option>)}</select></label>
        <label className="camera-field">Follow object<select aria-label="Camera follow object" value={follow?.targetId ?? ''} onChange={event => { setCameraFollow(event.target.value || null); onStatus(event.target.value ? 'Follow-camera link recorded' : 'Follow-camera unlink recorded'); }}><option value="">None · static camera</option>{[...rig.bones.values(), ...rig.layersInOrder].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="camera-shot-actions"><button className="secondary-button" onClick={() => { keyCamera(); onStatus(`Camera keys recorded at frame ${Math.round(rig.timeline.currentFrame)}`); }}><KeyRound size={13} /> Key camera</button><button className="danger-button" onClick={() => { removeCamera(camera.id); onStatus('Camera and its timeline references removed · Undo restores it'); }}><Trash2 size={13} /> Delete</button></div>
      </fieldset>}
      <p className="scope-note">Camera channels support the same move/copy/paste/interpolation tools as pose keys. Camera cuts and follow links always hold until the next key.</p>
    </section>
  </div>;
}
