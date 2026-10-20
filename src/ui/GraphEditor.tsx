import { useMemo, useRef, useState } from 'react';
import { Copy, Filter, Lock, Unlock, Waves } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { AnimationClip, AnimationTrack, CurveEasing, Keyframe } from '../engine/model';
import { CURVE_PRESETS, easeCurve } from '../engine/animationCurves';
import { editGraphKey, filterMotionCurve, getGraphValue, graphChannels, graphKeyframes, graphScalarTrack, keyCurve, pasteCurve, setCurvePreset, setGraphVelocity, setTangent, setTangentLocked, automaticTangents, copyCurve } from '../engine/graphEditing';
import type { CopiedCurve } from '../engine/graphEditing';
import type { KeyframeRef } from '../engine/keyframeEditing';
import { keyframeRefId } from '../engine/keyframeEditing';
import { sampleTrack } from '../engine/animation';
import { useProject } from '../state/projectStore';

const WIDTH = 1000;
const HEIGHT = 260;
const PAD = { left: 48, right: 20, top: 20, bottom: 28 };
type DragState = { mode: 'key' | 'inTangent' | 'outTangent'; ref: KeyframeRef; startX: number; startY: number; frame: number; value: number };

function displayValue(value: number): string { return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''); }

export function GraphEditor({ clip, selection, frame, start, end, onSelection, onNotice }: { clip: AnimationClip; selection: KeyframeRef[]; frame: number; start: number; end: number; onSelection: (selection: KeyframeRef[]) => void; onNotice: (notice: string) => void }) {
  const { updateProject, pause } = useProject();
  const selectedTrack = selection.length ? clip.tracks.find(track => track.id === selection[0].trackId) : clip.tracks.find(track => graphChannels(track).length);
  const channels = selectedTrack ? graphChannels(selectedTrack) : [];
  const [path, setPath] = useState(channels[0]?.path ?? '$');
  const [preset, setPreset] = useState<CurveEasing>('bezier');
  const [velocity, setVelocity] = useState(0);
  const [filter, setFilter] = useState<'all' | 'selected' | 'animated'>('all');
  const [motionStrength, setMotionStrength] = useState(.35);
  const [clipboard, setClipboard] = useState<CopiedCurve | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const keyData = selectedTrack ? graphKeyframes(clip, selection.length ? selection : selectedTrack.keyframes.map(key => ({ trackId: selectedTrack.id, keyframeId: key.id })), path) : [];
  const graphTrack = selectedTrack ? graphScalarTrack(selectedTrack, path) : null;
  const visibleKeys = filter === 'selected' && selection.length ? keyData : filter === 'animated' ? keyData.filter(item => item.key.curves?.[path] || item.key.easing && item.key.easing !== 'linear') : keyData;
  const values = keyData.map(item => item.value).concat(keyData.flatMap(item => {
    const curve = keyCurve(item.track, item.key.id, path); return [item.value + (curve.outTangent?.value ?? 0), item.value + (curve.inTangent?.value ?? 0)];
  }));
  const minValue = values.length ? Math.min(...values) : 0, maxValue = values.length ? Math.max(...values) : 1;
  const valueRange = Math.max(1e-5, maxValue - minValue), frameRange = Math.max(1, end - start);
  const xOf = (value: number) => PAD.left + (value - start) / frameRange * (WIDTH - PAD.left - PAD.right);
  const yOf = (value: number) => PAD.top + (maxValue - value) / valueRange * (HEIGHT - PAD.top - PAD.bottom);
  const frameOf = (x: number) => start + (x - PAD.left) / (WIDTH - PAD.left - PAD.right) * frameRange;
  const valueOf = (y: number) => maxValue - (y - PAD.top) / (HEIGHT - PAD.top - PAD.bottom) * valueRange;
  const selectedKey = selection.length && selectedTrack ? selectedTrack.keyframes.find(key => key.id === selection[0].keyframeId) : undefined;
  const selectedCurve = selectedKey && selectedTrack ? keyCurve(selectedTrack, selectedKey.id, path) : {};
  const segmentPath = useMemo(() => {
    if (!graphTrack || graphTrack.keyframes.length < 2) return '';
    const samples: string[] = [];
    for (let current = start; current <= end; current += Math.max(1, frameRange / 120)) {
      const value = sampleTrack(graphTrack, current); if (typeof value === 'number') samples.push(`${xOf(current).toFixed(2)},${yOf(value).toFixed(2)}`);
    }
    return samples.length ? `M ${samples.join(' L ')}` : '';
  }, [graphTrack, start, end, frameRange, minValue, maxValue, path]);
  const commit = (change: (next: AnimationClip) => AnimationClip) => { if (!selectedTrack) return; pause(); updateProject(project => { const next = change(project.animations.find(animation => animation.id === project.timeline.activeAnimationId) ?? clip); const live = project.animations.find(animation => animation.id === next.id); if (live) Object.assign(live, next); }); };
  const handleDown = (event: ReactPointerEvent<SVGCircleElement>, mode: DragState['mode'], ref: KeyframeRef, key: Keyframe, value: number) => {
    event.stopPropagation(); event.preventDefault();
    const next = { mode, ref, startX: event.clientX, startY: event.clientY, frame: key.frame, value };
    dragRef.current = next; setDrag(next); onSelection([ref]);
  };
  const graphMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = dragRef.current; if (!current) return;
    const rect = event.currentTarget.getBoundingClientRect(), scaleX = WIDTH / rect.width, scaleY = HEIGHT / rect.height;
    const dx = (event.clientX - current.startX) * scaleX, dy = (event.clientY - current.startY) * scaleY;
    if (current.mode === 'key') setDrag({ ...current, frame: Math.max(start, Math.min(end, Math.round(frameOf(PAD.left + (xOf(current.frame) - PAD.left) + dx)))), value: valueOf(yOf(current.value) + dy) });
    else {
      const frameDelta = (current.mode === 'outTangent' ? 1 : -1) * (event.clientX - current.startX) * scaleX / (WIDTH - PAD.left - PAD.right) * frameRange;
      const valueDelta = -(event.clientY - current.startY) * scaleY / (HEIGHT - PAD.top - PAD.bottom) * valueRange;
      const baseFrame = current.mode === 'outTangent' ? current.frame : current.frame;
      setDrag({ ...current, frame: Math.max(0.001, Math.abs(frameDelta) || Math.abs(baseFrame - current.frame) || 3), value: valueDelta });
    }
  };
  const graphUp = () => {
    const current = dragRef.current; if (!current || !selectedTrack) return;
    if (current.mode === 'key') commit(next => editGraphKey(next, current.ref, path, current.frame, current.value));
    else commit(next => setTangent(next, [current.ref], path, current.mode === 'inTangent' ? 'inTangent' : 'outTangent', { frame: current.mode === 'inTangent' ? -Math.abs(current.frame) : Math.abs(current.frame), value: current.value }, selectedCurve.locked ?? false));
    dragRef.current = null; setDrag(null);
  };
  const onPreset = (value: CurveEasing) => { setPreset(value); if (selection.length) commit(next => setCurvePreset(next, selection, path, value)); };
  const applyAuto = (mode: 'smooth' | 'flat' | 'linear' | 'auto-ease') => { if (selection.length) commit(next => automaticTangents(next, selection, path, mode, motionStrength)); };
  const selectedRef = selection[0];
  return <div className="graph-editor" aria-label="Graph editor">
    <div className="graph-toolbar">
      <label>Graph channel <select value={path} onChange={event => setPath(event.target.value)}>{channels.map(channel => <option key={channel.path} value={channel.path}>{channel.label}</option>)}</select></label>
      <label>Filter <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">All curves</option><option value="selected">Selected keys</option><option value="animated">Custom curves</option></select></label>
      <label>Preset <select value={preset} onChange={event => onPreset(event.target.value as CurveEasing)}>{CURVE_PRESETS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <button className="timeline-tool" disabled={!selection.length} onClick={() => applyAuto('auto-ease')} title="Automatic ease controls"><Waves size={13} /> Auto ease</button>
      <button className="timeline-tool" disabled={!selectedRef} onClick={() => { if (selectedRef) commit(next => setTangentLocked(next, [selectedRef], path, !(selectedCurve.locked ?? false))); }} title="Lock or unlock tangents">{selectedCurve.locked ? <Lock size={13} /> : <Unlock size={13} />} Tangents</button>
      <button className="timeline-tool" disabled={!selectedTrack} onClick={() => selectedTrack && setClipboard(copyCurve(selectedTrack, path))}><Copy size={13} /> Copy curve</button>
      <button className="timeline-tool" disabled={!clipboard || !selectedTrack} onClick={() => selectedTrack && commit(next => pasteCurve(next, selectedTrack.id, path, clipboard!, frame))}><Copy size={13} /> Paste curve</button>
    </div>
    <div className="graph-subtoolbar"><button className="graph-filter-button" onClick={() => applyAuto('smooth')}>Smooth tangents</button><button className="graph-filter-button" onClick={() => applyAuto('flat')}>Flat tangents</button><label>Motion filter <input type="range" min={0} max={1} step=".05" value={motionStrength} onChange={event => setMotionStrength(Number(event.target.value))} /></label><button className="graph-filter-button" disabled={!selectedTrack} onClick={() => selectedTrack && commit(next => filterMotionCurve(next, selectedTrack.id, path, motionStrength))}><Filter size={12} /> Filter curve</button><label>Velocity <input type="number" value={velocity} onChange={event => setVelocity(Number(event.target.value))} /><button className="graph-filter-button" disabled={!selectedRef} onClick={() => selectedRef && commit(next => setGraphVelocity(next, [selectedRef], path, 'outTangent', velocity, clip.fps))}>Apply</button></label></div>
    <svg className="graph-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" onPointerMove={graphMove} onPointerUp={graphUp} onPointerCancel={graphUp}>
      <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="#10171d" />
      {Array.from({ length: 7 }, (_, index) => { const y = PAD.top + index / 6 * (HEIGHT - PAD.top - PAD.bottom); const value = maxValue - index / 6 * valueRange; return <g key={`y-${index}`}><line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} stroke="#293b43" /><text x={6} y={y + 4} fill="#789098" fontSize="10">{displayValue(value)}</text></g>; })}
      {Array.from({ length: 9 }, (_, index) => { const x = PAD.left + index / 8 * (WIDTH - PAD.left - PAD.right); return <g key={`x-${index}`}><line x1={x} x2={x} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="#23343b" /><text x={x - 8} y={HEIGHT - 8} fill="#789098" fontSize="10">{Math.round(start + index / 8 * frameRange)}</text></g>; })}
      {segmentPath && <path d={segmentPath} fill="none" stroke={channels.find(channel => channel.path === path)?.color ?? '#70c8be'} strokeWidth="3" vectorEffect="non-scaling-stroke" />}
      {visibleKeys.map(({ track, key, value }) => {
        const ref = { trackId: track.id, keyframeId: key.id }, active = selection.some(item => keyframeRefId(item) === keyframeRefId(ref));
        const curve = keyCurve(track, key.id, path), previous = track.keyframes.filter(item => item.frame < key.frame).sort((a, b) => b.frame - a.frame)[0], next = track.keyframes.filter(item => item.frame > key.frame).sort((a, b) => a.frame - b.frame)[0];
        const outFrame = curve.outTangent?.frame ?? (next ? (next.frame - key.frame) / 3 : 3), outValue = curve.outTangent?.value ?? (next ? (getGraphValue(next.value, path) ?? value) - value : 0);
        const inFrame = curve.inTangent?.frame ?? (previous ? -(key.frame - previous.frame) / 3 : -3), inValue = curve.inTangent?.value ?? (previous ? (getGraphValue(previous.value, path) ?? value) - value : 0);
        const pointX = drag?.mode === 'key' && drag.ref.keyframeId === key.id ? xOf(drag.frame) : xOf(key.frame);
        const pointY = drag?.mode === 'key' && drag.ref.keyframeId === key.id ? yOf(drag.value) : yOf(value);
        return <g key={key.id}>
          {active && <><line x1={pointX} y1={pointY} x2={xOf(key.frame + inFrame)} y2={yOf(value + inValue)} stroke="#8cabb0" strokeDasharray="4 3" /><line x1={pointX} y1={pointY} x2={xOf(key.frame + outFrame)} y2={yOf(value + outValue)} stroke="#8cabb0" strokeDasharray="4 3" /><circle className="graph-handle" cx={xOf(key.frame + inFrame)} cy={yOf(value + inValue)} r="5" fill="#9bbcc1" onPointerDown={event => handleDown(event, 'inTangent', ref, key, inValue)} /><circle className="graph-handle" cx={xOf(key.frame + outFrame)} cy={yOf(value + outValue)} r="5" fill="#9bbcc1" onPointerDown={event => handleDown(event, 'outTangent', ref, key, outValue)} /></>}
          <circle className={`graph-key ${active ? 'active' : ''}`} cx={pointX} cy={pointY} r={active ? 7 : 5} fill={channels.find(channel => channel.path === path)?.color ?? '#70c8be'} onPointerDown={event => handleDown(event, 'key', ref, key, value)} onClick={() => onSelection([ref])} />
        </g>;
      })}
      <line x1={xOf(frame)} x2={xOf(frame)} y1={0} y2={HEIGHT} stroke="#f16b75" strokeWidth="1.5" pointerEvents="none" />
    </svg>
    <div className="graph-footer"><span>{selectedTrack?.property ?? 'No numeric track'} · {channels.find(channel => channel.path === path)?.label ?? path}</span><span>{visibleKeys.length} keys · {selectedKey ? `selected value ${displayValue(getGraphValue(selectedKey.value, path) ?? 0)}` : 'Select a key to edit tangents'}</span></div>
  </div>;
}
