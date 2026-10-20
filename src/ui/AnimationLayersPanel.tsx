import { useState } from 'react';
import { Layers3, Plus, Scissors, StretchHorizontal, Trash2 } from 'lucide-react';
import { useProject } from '../state/projectStore';
import { addAnimationTransition, createAnimationLayer, createCycle, removeAnimationLayer, retimeAnimation, stretchAnimation, trimAnimation } from '../engine/animationNla';
import type { AnimationBlendMode, AnimationClip } from '../engine/model';

export function AnimationLayersPanel() {
  const { rig, updateProject, pause } = useProject();
  const clip = rig.animations.find(animation => animation.id === rig.timeline.activeAnimationId);
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [trimStart, setTrimStart] = useState(clip?.trimStart ?? clip?.startFrame ?? 0);
  const [trimEnd, setTrimEnd] = useState(clip?.trimEnd ?? clip?.endFrame ?? 120);
  const [retimeStart, setRetimeStart] = useState(clip?.startFrame ?? 0);
  const [retimeEnd, setRetimeEnd] = useState(clip?.endFrame ?? 120);
  const [stretch, setStretch] = useState(1);
  if (!clip) return null;
  const mutate = (change: (project: typeof rig) => void) => { pause(); updateProject(change); };
  const updateClip = (change: (current: AnimationClip) => void) => mutate(project => { const current = project.animations.find(animation => animation.id === clip.id); if (current) change(current); });
  return <details className={`nla-panel ${open ? 'open' : ''}`} open={open} onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
    <summary><Layers3 size={14} /> Nonlinear animation <small>{clip.nlaLayers?.length ?? 0} layers · {clip.transitions?.length ?? 0} transitions</small></summary>
    <div className="nla-toolbar">
      <label>Loop <select value={clip.loopMode ?? 'once'} onChange={event => updateClip(current => { current.loopMode = event.target.value as 'once' | 'cycle' | 'ping-pong'; })}><option value="once">Once</option><option value="cycle">Cycle</option><option value="ping-pong">Ping-pong</option></select></label>
      <label>Cycle start <input type="number" value={clip.loopStart ?? clip.startFrame} onChange={event => updateClip(current => { current.loopStart = Number(event.target.value); })} /></label>
      <label>End <input type="number" value={clip.loopEnd ?? clip.endFrame} onChange={event => updateClip(current => { current.loopEnd = Number(event.target.value); })} /></label>
      <label>Offset <input type="number" value={clip.cycleOffset ?? 0} onChange={event => updateClip(current => { current.cycleOffset = Number(event.target.value); })} /></label>
      <label>Rate <input type="number" step=".05" value={clip.playbackRate ?? 1} onChange={event => updateClip(current => { current.playbackRate = Number(event.target.value); })} /></label>
      <button className="timeline-tool" onClick={() => mutate(project => createCycle(project, clip.id, Number(clip.loopStart ?? clip.startFrame), Number(clip.loopEnd ?? clip.endFrame), clip.loopMode === 'ping-pong'))}>Create cycle</button>
    </div>
    <div className="nla-edit-row">
      <label>Trim <input type="number" value={trimStart} onChange={event => setTrimStart(Number(event.target.value))} /><span>–</span><input type="number" value={trimEnd} onChange={event => setTrimEnd(Number(event.target.value))} /></label><button className="timeline-tool" onClick={() => updateClip(current => Object.assign(current, trimAnimation(current, trimStart, trimEnd)))}><Scissors size={12} /> Trim</button>
      <label>Retiming <input type="number" value={retimeStart} onChange={event => setRetimeStart(Number(event.target.value))} /><span>–</span><input type="number" value={retimeEnd} onChange={event => setRetimeEnd(Number(event.target.value))} /></label><button className="timeline-tool" onClick={() => updateClip(current => Object.assign(current, retimeAnimation(current, retimeStart, retimeEnd)))}>Retiming</button>
      <label>Stretch <input type="number" min=".05" step=".05" value={stretch} onChange={event => setStretch(Number(event.target.value))} /></label><button className="timeline-tool" onClick={() => updateClip(current => Object.assign(current, stretchAnimation(current, stretch)))}><StretchHorizontal size={12} /> Stretch</button>
    </div>
    <div className="nla-layers-heading"><span>Animation layers</span><div><select aria-label="NLA source clip" value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">Choose clip…</option>{rig.animations.filter(animation => animation.id !== clip.id).map(animation => <option key={animation.id} value={animation.id}>{animation.name}</option>)}</select><button className="timeline-tool" disabled={!sourceId} onClick={() => { mutate(project => createAnimationLayer(project, clip.id, sourceId)); setSourceId(''); }}><Plus size={12} /> Add layer</button></div></div>
    {(clip.nlaLayers ?? []).map((layer, index) => <div className="nla-layer-row" key={layer.id}>
      <div className="nla-layer-top"><strong>{index + 1}. {layer.name}</strong><select value={layer.clipId} onChange={event => updateClip(current => { const item = current.nlaLayers?.find(candidate => candidate.id === layer.id); if (item) item.clipId = event.target.value; })}>{rig.animations.filter(animation => animation.id !== clip.id).map(animation => <option key={animation.id} value={animation.id}>{animation.name}</option>)}</select><button className="mini-button" aria-label="Remove animation layer" onClick={() => mutate(project => removeAnimationLayer(project, clip.id, layer.id))}><Trash2 size={13} /></button></div>
      <div className="nla-layer-fields"><label>Mode <select value={layer.blendMode} onChange={event => updateClip(current => { const item = current.nlaLayers?.find(candidate => candidate.id === layer.id); if (item) item.blendMode = event.target.value as AnimationBlendMode; })}><option value="override">Override</option><option value="additive">Additive</option></select></label><label>Start <input type="number" value={layer.startFrame} onChange={event => updateClip(current => { const item = current.nlaLayers?.find(candidate => candidate.id === layer.id); if (item) item.startFrame = Number(event.target.value); })} /></label><label>End <input type="number" value={layer.endFrame} onChange={event => updateClip(current => { const item = current.nlaLayers?.find(candidate => candidate.id === layer.id); if (item) item.endFrame = Number(event.target.value); })} /></label><label>Speed <input type="number" step=".05" value={layer.speed} onChange={event => updateClip(current => { const item = current.nlaLayers?.find(candidate => candidate.id === layer.id); if (item) item.speed = Number(event.target.value); })} /></label><label>Weight <input type="range" min={0} max={1} step=".01" value={layer.weight} onChange={event => updateClip(current => { const item = current.nlaLayers?.find(candidate => candidate.id === layer.id); if (item) item.weight = Number(event.target.value); })} /></label><label>Fade in <input type="number" min="0" value={layer.blendIn} onChange={event => updateClip(current => { const item = current.nlaLayers?.find(candidate => candidate.id === layer.id); if (item) item.blendIn = Number(event.target.value); })} /></label><label>Fade out <input type="number" min="0" value={layer.blendOut} onChange={event => updateClip(current => { const item = current.nlaLayers?.find(candidate => candidate.id === layer.id); if (item) item.blendOut = Number(event.target.value); })} /></label><label className="check-label"><input type="checkbox" checked={layer.muted} onChange={event => updateClip(current => { const item = current.nlaLayers?.find(candidate => candidate.id === layer.id); if (item) item.muted = event.target.checked; })} /> Mute</label><label className="check-label"><input type="checkbox" checked={layer.solo} onChange={event => updateClip(current => { const item = current.nlaLayers?.find(candidate => candidate.id === layer.id); if (item) item.solo = event.target.checked; })} /> Solo</label></div>
      {index < (clip.nlaLayers?.length ?? 0) - 1 && <button className="mini-text" onClick={() => mutate(project => addAnimationTransition(project, clip.id, layer.id, clip.nlaLayers![index + 1].id, 12))}>Add {layer.name} → next crossfade</button>}
    </div>)}
  </details>;
}
