import { Eye, EyeOff, Layers3, SlidersHorizontal } from 'lucide-react';
import { useProject } from '../state/projectStore';

const FRAME_OPTIONS = Array.from({ length: 6 }, (_, index) => index);

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function OnionSkinPanel() {
  const { rig, selectedId, onionSkin, setOnionSkin } = useProject();
  const hasAnimation = Boolean(rig.timeline.activeAnimationId);
  const activeLayer = Boolean(selectedId && rig.layers.has(selectedId));
  const update = <K extends keyof typeof onionSkin>(key: K, value: (typeof onionSkin)[K]) => setOnionSkin({ [key]: value });

  return <div className="onion-skin-panel">
    <section className="onion-skin-hero">
      <div className="section-title"><span><Layers3 size={15} /> Onion Skin</span><span className={`stage-badge ${onionSkin.enabled ? 'active' : ''}`}>{onionSkin.enabled ? 'ON' : 'OFF'}</span></div>
      <p>Compare neighboring evaluated poses without changing the active artwork or keyframes.</p>
      <label className="check-label onion-toggle"><input aria-label="Enable Onion Skin" type="checkbox" checked={onionSkin.enabled} onChange={event => update('enabled', event.target.checked)} /> {onionSkin.enabled ? <Eye size={14} /> : <EyeOff size={14} />} Enable Onion Skin</label>
    </section>

    <section className="onion-skin-section">
      <div className="section-title"><span><SlidersHorizontal size={14} /> Onion Skin Settings</span><small>Frame {Math.round(rig.timeline.currentFrame)}</small></div>
      <div className="onion-skin-grid">
        <label className="onion-field">Previous Frames<select aria-label="Previous Frames" value={onionSkin.previousFrames} onChange={event => update('previousFrames', Number(event.target.value))}>{FRAME_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="onion-field">Next Frames<select aria-label="Next Frames" value={onionSkin.nextFrames} onChange={event => update('nextFrames', Number(event.target.value))}>{FRAME_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <label className="onion-range"><span>Opacity (Previous)<output>{percent(onionSkin.previousOpacity)}</output></span><input aria-label="Previous Opacity" type="range" min="0" max="1" step=".05" value={onionSkin.previousOpacity} onChange={event => update('previousOpacity', Number(event.target.value))} /></label>
      <label className="onion-range"><span>Opacity (Next)<output>{percent(onionSkin.nextOpacity)}</output></span><input aria-label="Next Opacity" type="range" min="0" max="1" step=".05" value={onionSkin.nextOpacity} onChange={event => update('nextOpacity', Number(event.target.value))} /></label>
      <div className="onion-color-grid">
        <label className="onion-color-field">Previous Tint<input aria-label="Previous Tint" type="color" value={onionSkin.previousTint} onChange={event => update('previousTint', event.target.value)} /></label>
        <label className="onion-color-field">Next Tint<input aria-label="Next Tint" type="color" value={onionSkin.nextTint} onChange={event => update('nextTint', event.target.value)} /></label>
      </div>
    </section>

    <section className="onion-skin-section">
      <div className="section-title"><span>Display Options</span><small>{hasAnimation ? 'LIVE' : 'ADD ANIMATION'}</small></div>
      <label className="check-label"><input aria-label="Show Onion Skin While Playing" type="checkbox" checked={onionSkin.showWhilePlaying} onChange={event => update('showWhilePlaying', event.target.checked)} /> Show Onion Skin While Playing</label>
      <label className="check-label"><input aria-label="Active Layer Only" type="checkbox" checked={onionSkin.activeLayerOnly} disabled={!activeLayer} onChange={event => update('activeLayerOnly', event.target.checked)} /> Show Only Active Layer</label>
      {!hasAnimation && <p className="scope-note">Open or create an animation clip, then move the playhead away from its first frame to see previous and next poses.</p>}
      {hasAnimation && !activeLayer && onionSkin.activeLayerOnly && <p className="scope-note">Select an artwork layer to restrict ghosts to that layer.</p>}
      <p className="scope-note">Ghosts are temporary editor overlays rendered behind the current frame. They never export or create keys.</p>
    </section>
  </div>;
}
