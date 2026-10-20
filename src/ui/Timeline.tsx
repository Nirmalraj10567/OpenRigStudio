import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { ChevronDown, ChevronUp, ClipboardPaste, Copy, KeyRound, Layers3, Pause, Play, Plus, RotateCcw, SkipBack, SkipForward, Square, Trash2 } from 'lucide-react';
import { copyKeyframes, keyframeRefId } from '../engine/keyframeEditing';
import type { CopiedKeyframe, KeyframeRef } from '../engine/keyframeEditing';
import type { AnimationTrack, Keyframe } from '../engine/model';
import { useProject } from '../state/projectStore';
import { CueStrip, Waveform } from './LipSyncPanel';
import { CAMERA_SWITCH_TARGET, isCameraTarget } from '../engine/camera';
import { isCharacterViewTarget } from '../engine/characterViews';
import { isFacialTarget, recordFacialKey } from '../engine/facialAnimation';
import { isConstraintTarget, recordConstraintKey } from '../engine/constraints';
import { isGroupTarget, keyGroupProperty } from '../engine/layerGroups';
import { GraphEditor } from './GraphEditor';
import { AnimationLayersPanel } from './AnimationLayersPanel';

const INTERPOLATIONS: Array<{ value: NonNullable<Keyframe['easing']>; label: string }> = [
  { value: 'smooth', label: 'Smooth' }, { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease in' }, { value: 'ease-out', label: 'Ease out' },
  { value: 'ease-in-out', label: 'Ease in/out' }, { value: 'bounce', label: 'Bounce' },
  { value: 'elastic', label: 'Elastic' }, { value: 'overshoot', label: 'Overshoot' },
  { value: 'bezier', label: 'Bezier handles' }, { value: 'step', label: 'Step (hold)' },
];
const CHANNEL_NAMES: Record<string, string> = {
  viewAngle: 'Character angle',
  facial: 'Facial performance',
  spin: 'Continuous wheel rotation',
  followOffset: 'Follow framing offset',
  transform: 'Pose', x: 'Position X', y: 'Position Y', rotation: 'Angle',
  scaleX: 'Scale X', scaleY: 'Scale Y', opacity: 'Opacity', mesh: 'Mesh points',
  cameraX: 'Track X', cameraY: 'Track Y', zoom: 'Lens / zoom', yaw: 'Pan angle', pitch: 'Tilt angle', roll: 'Roll', perspective: 'Depth perspective', projection: 'Projection', camera3d: 'Physical lens', cameraRig: 'Camera rig path', cameraTransition: 'Camera transition', projection3d: '3D projection', follow: 'Follow link',
  constraint: 'Constraint settings',
  switchChild: 'Switch child', layerOrder: 'Layer order', parentGroupId: 'Group membership',
};
const sameRef = (left: KeyframeRef, right: KeyframeRef) => keyframeRefId(left) === keyframeRefId(right);
const TIMELINE_LABEL_WIDTH = 220;

export function Timeline({ disabled = false, minimized = false, onToggleMinimized }: { disabled?: boolean; minimized?: boolean; onToggleMinimized?: () => void }) {
  const { rig, selectedId, selectedCharacterId, projectGeneration, play, pause, setTimeline, smartEdit, autoKey, setAutoKey, onionSkin, setOnionSkin } = useProject();
  const { currentFrame: frame, fps, startFrame: start, endFrame: end, isPlaying: playing } = rig.timeline;
  const blocked = disabled || Boolean(smartEdit);
  const stageReadOnly = rig.getStageView().enabled;
  const editingBlocked = blocked;
  const span = Math.max(1, end - start);
  const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  const minWidth = TIMELINE_LABEL_WIDTH + Math.max(620, Math.min(12000, span * 8));
  const tickCount = Math.min(120, Math.max(2, Math.floor((minWidth - TIMELINE_LABEL_WIDTH) / 65)));
  const ratio = (value: number) => (value - start) / span * 100;
  const [selection, setSelection] = useState<KeyframeRef[]>([]);
  const [clipboard, setClipboard] = useState<CopiedKeyframe[]>([]);
  const [scope, setScope] = useState<'all' | 'selected' | 'camera' | 'views' | 'facial' | 'constraints'>('all');
  const [notice, setNotice] = useState('Shift-click or box-select keys · drag to retime');
  const [dragDelta, setDragDelta] = useState(0);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [timelineView, setTimelineView] = useState<'timeline' | 'dope-sheet' | 'graph'>('timeline');
  const panelRef = useRef<HTMLFieldSetElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number; selection: KeyframeRef[]; delta: number; minFrame: number } | null>(null);
  const boxOrigin = useRef<{ x: number; y: number; cells: HTMLElement; additive: boolean } | null>(null);
  const scrubbing = useRef(false);
  const graphMode = timelineView === 'graph';
  const selectionIds = useMemo(() => new Set(selection.map(keyframeRefId)), [selection]);
  const cameraObjects = rig.cameras.length ? [{ id: CAMERA_SWITCH_TARGET, name: 'Camera switcher' }, ...rig.cameras.map(camera => ({ id: camera.id, name: camera.name }))] : [];
  const activeCharacterId = rig.characterViews.find(set => set.id === selectedCharacterId)?.id ?? rig.characterViews[0]?.id;
  const activeFacialId = rig.facialProfiles[0]?.id;
  const activeConstraintId = rig.constraints[0]?.id;
  const objects: Array<{ id: string; name: string; length?: number }> = [...rig.bones.values(), ...rig.layersInOrder, ...rig.groups.values(), ...cameraObjects, ...rig.characterViews, ...rig.facialProfiles, ...rig.constraints].filter(item => scope === 'all' || scope === 'camera' && isCameraTarget(rig, item.id) || scope === 'views' && isCharacterViewTarget(rig, item.id) || scope === 'facial' && isFacialTarget(rig, item.id) || scope === 'constraints' && isConstraintTarget(rig, item.id) || scope === 'selected' && item.id === selectedId);
  const channels = objects.flatMap<{ object: typeof objects[number]; track: AnimationTrack | undefined }>(object => {
    const animationTracks = clip?.tracks.filter(track => track.targetId === object.id) ?? [];
    return animationTracks.length
      ? animationTracks.map(track => ({ object, track }))
      : [{ object, track: undefined }];
  });
  const groupedChannels = objects.map(object => ({
    object,
    rows: channels.filter(channel => channel.object.id === object.id),
  }));
  const easingValues = new Set(clip?.tracks.flatMap(track => track.keyframes
    .filter(key => selectionIds.has(keyframeRefId({ trackId: track.id, keyframeId: key.id })))
    .map(key => key.easing ?? 'linear')) ?? []);
  const currentEasing = easingValues.size === 1 ? [...easingValues][0] : '';
  const cancelInteraction = () => {
    drag.current = null; boxOrigin.current = null; scrubbing.current = false;
    setDragDelta(0); setMarquee(null); setMenu(null);
  };
  const seek = (value: number) => {
    if (blocked || !Number.isFinite(value)) return;
    pause();
    useProject.getState().setFrame(Math.round(Math.max(start, Math.min(end, value))));
  };
  const frameAt = (x: number, cells: HTMLElement) => {
    const rect = cells.getBoundingClientRect();
    return start + (x - rect.left) / Math.max(1, rect.width) * span;
  };
  const copySelected = () => {
    if (editingBlocked || !clip || !selection.length) return;
    const copied = copyKeyframes(clip, selection);
    setClipboard(copied); setNotice(`${copied.length} keys copied`); setMenu(null);
  };
  const pasteClipboard = () => {
    if (editingBlocked || !clip || !clipboard.length) return;
    const next = useProject.getState().pasteKeys(clipboard, frame);
    setSelection(next); setNotice(`${next.length} keys pasted at frame ${Math.round(frame)}`); setMenu(null);
  };
  const deleteSelected = () => {
    if (editingBlocked || !selection.length) return;
    useProject.getState().deleteSelectedKeys(selection);
    setSelection([]); setNotice('Selected keys deleted'); setMenu(null);
  };
  const setInterpolation = (easing: NonNullable<Keyframe['easing']>) => {
    if (editingBlocked || !selection.length) return;
    useProject.getState().setSelectedKeyInterpolation(selection, easing);
    setNotice(`${INTERPOLATIONS.find(item => item.value === easing)?.label} interpolation applied`); setMenu(null);
  };

  useEffect(() => { setSelection([]); cancelInteraction(); }, [clip?.id, projectGeneration]);
  useEffect(() => { setClipboard([]); }, [rig.id]);
  useEffect(() => { if (editingBlocked) cancelInteraction(); }, [editingBlocked]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (blocked || event.defaultPrevented) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.isContentEditable || target?.closest('input, textarea, select, dialog, [data-controller-test]')) return;
      if (event.code === 'Space' && !target?.closest('button, summary')) {
        event.preventDefault(); useProject.getState().togglePlayback(); return;
      }
      if (editingBlocked || !panelRef.current?.contains(target)) return;
      const command = event.metaKey || event.ctrlKey || event.altKey;
      if (command && event.key.toLowerCase() === 'c' && selection.length) { event.preventDefault(); copySelected(); }
      else if (command && event.key.toLowerCase() === 'v' && clipboard.length) { event.preventDefault(); pasteClipboard(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelection(channels.flatMap(({ track }) => track?.keyframes.map(key => ({ trackId: track.id, keyframeId: key.id })) ?? []));
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selection.length) {
        event.preventDefault(); deleteSelected();
      } else if (event.key === 'Escape') {
        event.preventDefault(); cancelInteraction();
      } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && selection.length) {
        event.preventDefault();
        setSelection(useProject.getState().moveSelectedKeys(selection, (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1)));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const markerDown = (event: PointerEvent<HTMLButtonElement>, ref: KeyframeRef) => {
    const id = clip?.tracks.find(track => track.id === ref.trackId)?.targetId ?? '';
    if (editingBlocked || event.button !== 0 || !clip || stageReadOnly && !isCameraTarget(rig, id) && !isCharacterViewTarget(rig, id)) return;
    event.preventDefault(); event.stopPropagation(); pause(); event.currentTarget.focus(); setMenu(null);
    const active = selectionIds.has(keyframeRefId(ref));
    const next = event.shiftKey
      ? active ? selection.filter(item => !sameRef(item, ref)) : [...selection, ref]
      : active ? selection : [ref];
    setSelection(next);
    if (event.shiftKey && active) return;
    const keys = clip.tracks.flatMap(track => track.keyframes.filter(key => next.some(item => item.trackId === track.id && item.keyframeId === key.id)));
    const minFrame = keys.reduce((min, key) => Math.min(min, key.frame), Infinity);
    drag.current = { x: event.clientX, width: Math.max(1, event.currentTarget.parentElement!.getBoundingClientRect().width), selection: next, delta: 0, minFrame };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const markerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) return;
    const delta = Math.max(-current.minFrame, Math.round((event.clientX - current.x) / current.width * span));
    current.delta = delta; setDragDelta(delta);
  };
  const markerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) return;
    if (current.delta && !editingBlocked) {
      setSelection(useProject.getState().moveSelectedKeys(current.selection, current.delta));
      setNotice(`Moved ${current.selection.length} keys by ${current.delta > 0 ? '+' : ''}${current.delta} frames`);
    }
    drag.current = null; setDragDelta(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const boxDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (editingBlocked || event.button !== 0 || target.closest('button, .timeline-audio, .timeline-mouth')) return;
    const cells = target.closest<HTMLElement>('.track-cells');
    const rect = contentRef.current?.getBoundingClientRect();
    if (!cells || !rect) return;
    event.preventDefault(); pause(); panelRef.current?.focus(); setMenu(null);
    boxOrigin.current = { x: event.clientX - rect.left, y: event.clientY - rect.top, cells, additive: event.shiftKey };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const boxMove = (event: PointerEvent<HTMLDivElement>) => {
    const origin = boxOrigin.current;
    const rect = contentRef.current?.getBoundingClientRect();
    if (!origin || !rect) return;
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    setMarquee({ x: Math.min(origin.x, x), y: Math.min(origin.y, y), width: Math.abs(x - origin.x), height: Math.abs(y - origin.y) });
  };
  const boxUp = (event: PointerEvent<HTMLDivElement>) => {
    const origin = boxOrigin.current, root = contentRef.current;
    if (!origin || !root) return;
    const rect = root.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
    const left = Math.min(origin.x, x), right = Math.max(origin.x, x), top = Math.min(origin.y, y), bottom = Math.max(origin.y, y);
    if (right - left > 4 || bottom - top > 4) {
      const found = [...root.querySelectorAll<HTMLElement>('.key-marker')].flatMap(marker => {
        const bounds = marker.getBoundingClientRect(), cx = bounds.left + bounds.width / 2 - rect.left, cy = bounds.top + bounds.height / 2 - rect.top;
        return cx >= left && cx <= right && cy >= top && cy <= bottom
          ? [{ trackId: marker.dataset.trackId!, keyframeId: marker.dataset.keyId! }] : [];
      });
      setSelection(origin.additive ? [...selection, ...found.filter(ref => !selectionIds.has(keyframeRefId(ref)))] : found);
      setNotice(`${found.length} keys in box selection`);
    } else {
      if (!origin.additive) setSelection([]);
      seek(frameAt(event.clientX, origin.cells));
    }
    boxOrigin.current = null; setMarquee(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const rulerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (blocked || event.button !== 0) return;
    event.stopPropagation(); event.preventDefault(); panelRef.current?.focus();
    scrubbing.current = true; seek(frameAt(event.clientX, event.currentTarget));
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const rulerUp = (event: PointerEvent<HTMLDivElement>) => {
    scrubbing.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <fieldset ref={panelRef} tabIndex={0} className={`timeline-panel ${minimized ? 'timeline-panel-minimized' : ''}`} disabled={blocked} aria-label={blocked ? 'Timeline editing suspended' : 'Timeline'}>
    <div className="timeline-toolbar">
      <div className="timeline-transport">
        <button onClick={() => seek(start)} title="First frame" aria-label="First frame"><SkipBack size={15} /></button>
        <button onClick={() => seek(frame - 1)} title="Previous frame" aria-label="Previous frame"><SkipBack size={12} /></button>
        <button className={playing ? 'active' : ''} onClick={() => playing ? pause() : play()} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
        <button onClick={pause} title="Stop" aria-label="Stop"><Square size={13} fill="currentColor" /></button>
        <button onClick={() => seek(frame + 1)} title="Next frame" aria-label="Next frame"><SkipForward size={12} /></button>
        <button onClick={() => seek(end)} title="Last frame" aria-label="Last frame"><SkipForward size={15} /></button>
      </div>
      <div className="timeline-view-tabs" role="tablist" aria-label="Timeline view">
        <button role="tab" aria-selected={timelineView === 'timeline'} onClick={() => setTimelineView('timeline')}>Timeline</button>
        <button role="tab" aria-selected={timelineView === 'dope-sheet'} onClick={() => setTimelineView('dope-sheet')}>Dope Sheet</button>
        <button role="tab" aria-selected={timelineView === 'graph'} disabled={!clip} onClick={() => setTimelineView('graph')}>Graph Editor</button>
      </div>
      <label className="frame-readout">Frame <input aria-label="Current frame" type="number" min={start} max={end} value={Math.round(frame * 100) / 100} onChange={event => seek(Number(event.target.value))} /></label>
      <label className="frame-readout">Start <input aria-label="Start frame" key={`start-${start}`} type="number" min="0" max={end} defaultValue={start} onBlur={event => { const value = Math.round(Number(event.target.value)); if (event.target.value && Number.isFinite(value) && value >= 0 && value <= end) { pause(); setTimeline({ startFrame: value }); } else event.target.value = String(start); }} /></label>
      <label className="frame-readout">End <input aria-label="End frame" key={`end-${end}`} type="number" min={start} defaultValue={end} onBlur={event => { const value = Math.round(Number(event.target.value)); if (event.target.value && Number.isFinite(value) && value >= start) { pause(); setTimeline({ endFrame: value }); } else event.target.value = String(end); }} /></label>
      <label className="fps-select">FPS <select aria-label="Timeline FPS" value={fps} onChange={event => { pause(); setTimeline({ fps: Number(event.target.value) }); }}>{[...new Set([12, 24, 30, 60, fps])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
       <button className="timeline-tool" aria-pressed={rig.timeline.loop} onClick={() => setTimeline({ loop: !rig.timeline.loop })}><RotateCcw size={14} /> Loop</button>
       <button className="timeline-tool" aria-pressed={autoKey} onClick={() => setAutoKey(!autoKey)} title="Record pose edits after frame zero"><span className="auto-key-dot" /> Auto-key</button>
       <button className="timeline-tool onion-timeline-toggle" aria-pressed={onionSkin.enabled} onClick={() => setOnionSkin({ enabled: !onionSkin.enabled })} title="Show previous and next evaluated poses"><Layers3 size={14} /> Onion Skin</button>
       <span className="timeline-spacer" /><span className="timeline-hint">{(frame / fps).toFixed(2)}s · Space to play</span>{onToggleMinimized && <button type="button" className="timeline-tool timeline-panel-toggle" aria-label={minimized ? 'Restore timeline dock' : 'Minimize timeline dock'} aria-expanded={!minimized} aria-controls="timeline-dock-content" title={minimized ? 'Restore timeline dock' : 'Minimize timeline dock'} onClick={onToggleMinimized}>{minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>}
     </div>
     <div id="timeline-dock-content" className="timeline-dock-content" hidden={minimized}>
       <fieldset className="timeline-key-tools" disabled={editingBlocked} aria-label="Keyframe editing">
        <button className="timeline-tool add-channel-tool" disabled={!selectedId || stageReadOnly} onClick={() => { pause(); if (selectedId) useProject.getState().keyPose([selectedId]); setNotice('Channel added for the selected object'); }}><Plus size={13} /> Add Channel</button>
        <label className="timeline-interpolation">Animation <select aria-label="Active animation" value={clip?.id ?? ''} onChange={event => { const next = rig.animations.find(item => item.id === event.target.value); if (next) { pause(); setTimeline({ activeAnimationId: next.id, fps: next.fps, startFrame: next.startFrame, endFrame: next.endFrame, currentFrame: next.startFrame }); } }}><option value="" disabled>New animation</option>{rig.animations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
       <label className="timeline-interpolation">Channels <select aria-label="Visible channels" value={scope} onChange={event => { setScope(event.target.value as 'all' | 'selected' | 'camera' | 'views' | 'facial' | 'constraints'); setSelection([]); }}><option value="all">All objects</option><option value="selected">Selected object</option><option value="camera">Camera only</option><option value="views">Character views</option><option value="facial">Facial animation</option><option value="constraints">Constraints</option></select></label>
       <button className="timeline-tool" disabled={scope === 'views' ? !activeCharacterId : scope === 'facial' ? !activeFacialId : scope === 'constraints' ? !activeConstraintId : scope === 'camera' ? ['preview', 'switch'].includes(rig.cameraView) : !selectedId || stageReadOnly} onClick={() => { pause(); if (scope === 'views') useProject.getState().keyCharacterAngle(activeCharacterId!); else if (scope === 'facial') { const profile = rig.facialProfiles.find(item => item.id === activeFacialId)!; useProject.getState().updateProject(project => { recordFacialKey(project, profile.id, profile.values); }); } else if (scope === 'constraints') { useProject.getState().updateProject(project => { recordConstraintKey(project, activeConstraintId!); }); } else if (scope === 'camera') useProject.getState().keyCamera(); else if (selectedId && isGroupTarget(rig, selectedId)) useProject.getState().updateProject(project => { keyGroupProperty(project, selectedId, 'transform'); }); else useProject.getState().keyPose([selectedId!]); setNotice(`${scope === 'constraints' ? 'Constraint key' : 'Keys'} recorded at frame ${Math.round(frame)}`); }}><KeyRound size={13} /> Add key</button>
      <button className="timeline-tool" disabled={!selection.length} onClick={copySelected} title="Copy keys (Ctrl/Cmd+C or Alt+C)"><Copy size={13} /> Copy</button>
      <button className="timeline-tool" disabled={!clip || !clipboard.length} onClick={pasteClipboard} title="Paste at the playhead (Ctrl/Cmd+V or Alt+V)"><ClipboardPaste size={13} /> Paste</button>
       <button className="timeline-tool" disabled={!selection.length} onClick={deleteSelected} title="Delete selected keys"><Trash2 size={13} /> Delete</button>
        <label className="timeline-interpolation">Interpolation <select aria-label="Key interpolation" disabled={!selection.length} value={currentEasing} onChange={event => { if (event.target.value) setInterpolation(event.target.value as NonNullable<Keyframe['easing']>); }}><option value="" disabled>{selection.length ? 'Mixed' : 'Select keys'}</option>{INTERPOLATIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
     </fieldset>
     <AnimationLayersPanel />
     {graphMode && clip ? <GraphEditor clip={clip} selection={selection} frame={frame} start={start} end={end} onSelection={setSelection} onNotice={setNotice} /> : <div className="timeline-scroll"><div ref={contentRef} className="timeline-content" style={{ minWidth }} onPointerDown={boxDown} onPointerMove={boxMove} onPointerUp={boxUp} onPointerCancel={cancelInteraction}>
      <div className="timeline-ruler"><div className="track-label ruler-label">Channels</div><div className="ruler-cells" onPointerDown={rulerDown} onPointerMove={event => { if (scrubbing.current) seek(frameAt(event.clientX, event.currentTarget)); }} onPointerUp={rulerUp} onPointerCancel={rulerUp}>{Array.from({ length: tickCount + 1 }, (_, i) => <span className="major" key={i} style={{ left: `${i / tickCount * 100}%` }}>{Math.round(start + i / tickCount * span)}</span>)}</div></div>
      {rig.audio && <div className="timeline-track timeline-audio"><div className="track-label" title={rig.audio.name}>♫ {rig.audio.name}</div><div className="track-cells" onClick={event => seek(frameAt(event.clientX, event.currentTarget))}><div className="timeline-waveform" style={{ left: `${ratio(rig.audio.offsetSeconds * fps)}%`, width: `${rig.audio.duration * fps / span * 100}%` }}><Waveform peaks={rig.audio.peaks} /></div></div></div>}
      {rig.lipSyncTracks.map(track => <div className="timeline-track timeline-mouth" key={track.id}><div className="track-label">Mouth · {track.name}{!track.enabled && ' (off)'}</div><div className="track-cells"><CueStrip cues={track.cues} start={start / fps} end={end / fps} time={frame / fps} onSeek={seconds => seek(seconds * fps)} /></div></div>)}
      {!objects.length && <div className="timeline-empty">{scope === 'selected' ? 'Select artwork or a bone to view its channels.' : 'Add artwork or open the rigged example to animate.'}</div>}
       {groupedChannels.map(({ object, rows }) => {
         const objectKind = isCharacterViewTarget(rig, object.id) ? 'view' : isCameraTarget(rig, object.id) ? 'camera' : isConstraintTarget(rig, object.id) ? 'constraint' : isGroupTarget(rig, object.id) ? 'group' : object.length !== undefined ? 'bone' : 'image';
         const selectObject = () => { if (isCharacterViewTarget(rig, object.id)) useProject.getState().selectCharacter(object.id); else if (isCameraTarget(rig, object.id)) useProject.getState().setCameraView(object.id === CAMERA_SWITCH_TARGET ? 'switch' : object.id); else if (!isConstraintTarget(rig, object.id)) useProject.getState().select(object.id); };
         return <div className="timeline-object-group" key={object.id}>
           <div className={`timeline-track timeline-object-row ${object.id === selectedId ? 'selected' : ''}`}>
             <button className="track-label timeline-object-label" title={object.name} onClick={selectObject}><span className={`track-dot ${objectKind}`} /><span>{object.name}</span><small>{rows.length} channel{rows.length === 1 ? '' : 's'}</small></button><div className="track-cells" />
           </div>
           {rows.map(({ track }) => {
             const keys = track?.keyframes.filter(key => key.frame >= start && key.frame <= end) ?? [];
             const stride = Math.max(1, Math.ceil(keys.length / 600));
             const propertyName = CHANNEL_NAMES[track?.property ?? ''] ?? track?.property ?? 'No keys';
             return <div className={`timeline-track timeline-channel-row ${object.id === selectedId ? 'selected' : ''}`} key={track?.id ?? `${object.id}-empty`}>
               <button className="track-label timeline-channel-label" title={`${object.name} · ${propertyName}`} onClick={selectObject}><span className={`track-dot ${objectKind}`} /><span>{propertyName}{stride > 1 && <small>sampled display</small>}</span></button>
               <div className="track-cells">{keys.filter((key, index) => index % stride === 0 || index === keys.length - 1 || selectionIds.has(keyframeRefId({ trackId: track!.id, keyframeId: key.id }))).map(key => {
                 const ref = { trackId: track!.id, keyframeId: key.id }, active = selectionIds.has(keyframeRefId(ref));
                 return <button key={key.id} data-track-id={track!.id} data-key-id={key.id} className={`key-marker ${active ? 'selected' : ''} interpolation-${key.easing ?? 'linear'}`} style={{ left: `calc(${ratio(key.frame + (active ? dragDelta : 0))}% - 4px)` }}
                   onPointerDown={event => markerDown(event, ref)} onPointerMove={markerMove} onPointerUp={markerUp} onPointerCancel={cancelInteraction} onLostPointerCapture={() => { drag.current = null; setDragDelta(0); }}
                   onClick={event => { event.stopPropagation(); if (event.detail === 0 && !editingBlocked) { setSelection(event.shiftKey ? [...selection.filter(item => !sameRef(item, ref)), ref] : [ref]); } }}
                   onDoubleClick={() => seek(key.frame)} onContextMenu={event => { event.preventDefault(); if (editingBlocked) return; if (!active) setSelection([ref]); setMenu({ x: Math.min(event.clientX, window.innerWidth - 170), y: Math.max(10, Math.min(event.clientY, window.innerHeight - 270)) }); }}
                   title={`${object.name} · ${track!.property} · frame ${key.frame} · ${key.easing ?? 'linear'}`} aria-label={`${object.name} ${track!.property} keyframe at frame ${key.frame}`} aria-pressed={active} />;
               })}</div>
             </div>;
           })}
         </div>;
       })}
       <div className="playhead" style={{ left: `calc(${TIMELINE_LABEL_WIDTH}px + ${ratio(frame)}% - ${ratio(frame) * (TIMELINE_LABEL_WIDTH / 100)}px)` }}><span /></div>
      {marquee && <div className="key-selection-box" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
     </div></div>}
    <div className="timeline-footer"><span role="status">{notice}</span><span className="timeline-spacer" /><span>{selection.length} keys selected · {channels.length} channels</span></div>
     {menu && <div className="key-context-menu" role="group" aria-label="Keyframe actions" style={{ left: menu.x, top: menu.y }}><strong>Key interpolation</strong>{INTERPOLATIONS.map(item => <button key={item.value} onClick={() => setInterpolation(item.value)}>{item.label}</button>)}<button onClick={copySelected}>Copy selected keys</button><button onClick={deleteSelected}>Delete selected keys</button><button onClick={() => setMenu(null)}>Close</button></div>}
     </div>
   </fieldset>;
}
