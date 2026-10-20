import { useState, type ReactNode } from 'react';
import { Bone, Check, Eye, Grid3X3, Link2, Pause, Play, RotateCcw, Search, ShieldCheck, Sparkles, Unlink, UserRound } from 'lucide-react';
import { useProject } from '../state/projectStore';
import { hasMeshWeights } from './meshOverlay';
import { BoneMappingPreview } from './BoneMappingPreview';
import type { Layer } from '../engine/Rig';
import type { Tool as ProjectTool } from '../state/projectStore';

type StudioTool = ProjectTool | 'draw' | 'hand' | 'path';
type MappingBoardTool = Extract<StudioTool, 'select' | 'bone' | 'bind' | 'ik' | 'mesh' | 'weight'>;

function toolButtonLabel(tool: MappingBoardTool): { label: string; shortcut: string } {
  return {
    select: { label: 'Select', shortcut: 'V' },
    bone: { label: 'Add bone', shortcut: 'B' },
    bind: { label: 'Map layer', shortcut: 'L' },
    ik: { label: 'Pose / IK', shortcut: 'I' },
    mesh: { label: 'Edit mesh', shortcut: 'M' },
    weight: { label: 'Paint weights', shortcut: 'W' },
  }[tool];
}

function MappingToolButton({ tool, active, onClick }: { tool: MappingBoardTool; active: boolean; onClick: () => void }) {
  const info = toolButtonLabel(tool);
  const Icon = tool === 'select' ? UserRound : tool === 'bone' ? Bone : tool === 'bind' ? Link2 : tool === 'ik' ? RotateCcw : tool === 'mesh' ? Grid3X3 : Sparkles;
  return <button type="button" className={`mapping-tool-button ${active ? 'active' : ''}`} aria-pressed={active} onClick={onClick}><Icon size={14} /><span>{info.label}</span><kbd>{info.shortcut}</kbd></button>;
}

function MappingMetric({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'warning' | 'muted' }) {
  return <div className={`mapping-metric ${tone ?? ''}`}><strong>{value}</strong><span>{label}</span></div>;
}

function sourceLabel(layer: Layer): string {
  const suffix = layer.mesh ? (hasMeshWeights(layer) ? ' · weighted mesh' : ' · mesh') : '';
  return `${layer.name}${suffix}`;
}

export function BoneMappingBoard({
  stage,
  activeTool,
  onActivateTool,
  sourceId,
  targetId,
  onSource,
  onTarget,
  onMap,
  onUnbind,
  assets,
  onStatus,
}: {
  stage: ReactNode;
  activeTool: StudioTool;
  onActivateTool: (tool: StudioTool) => void;
  sourceId: string | null;
  targetId: string | null;
  onSource: (id: string | null) => void;
  onTarget: (id: string | null) => void;
  onMap: (id: string) => void;
  onUnbind: () => void;
  assets: Record<string, string>;
  onStatus: (message: string) => void;
}) {
  const { rig, selectedId, setTimeline, togglePlayback, pause } = useProject();
  const [showBones, setShowBones] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const source = sourceId ? rig.layers.get(sourceId) : undefined;
  const mappedBone = source?.boundBoneId ? rig.bones.get(source.boundBoneId) : undefined;
  const target = targetId ? rig.bones.get(targetId) : undefined;
  const layers = [...rig.layersInOrder];
  const bones = [...rig.bones.values()];
  const rigidMapped = layers.filter(layer => !layer.mesh && Boolean(layer.boundBoneId)).length;
  const weighted = layers.filter(layer => hasMeshWeights(layer)).length;
  const unmapped = layers.filter(layer => !layer.mesh && !layer.boundBoneId).length;
  const selectedTool = ['select', 'bone', 'bind', 'ik', 'mesh', 'weight'].includes(activeTool) ? activeTool as MappingBoardTool : 'bind';
  const animation = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);

  const selectSource = (id: string) => {
    onSource(id || null);
    if (id) onStatus(`${rig.layers.get(id)?.name ?? 'Artwork'} selected · choose a target bone`);
  };

  return (
    <div className="bone-mapping-board" aria-label="Bone mapping workspace">
      <header className="mapping-board-header">
        <div className="mapping-board-title">
          <div className="mapping-board-icon"><Bone size={18} /></div>
          <div><span className="mapping-eyebrow">RIGGING WORKSPACE</span><h1>Bone Mapping</h1><p>Map artwork to a clean skeleton, preview every angle, and validate weights before animating.</p></div>
        </div>
        <div className="mapping-board-status"><span className="mapping-live-dot" /> LIVE RIG <small>{rig.bones.size} bones · {layers.length} layers</small></div>
      </header>

      <div className="mapping-board-toolbar">
        <div className="mapping-tool-strip" role="toolbar" aria-label="Bone mapping tools">
          {(['select', 'bone', 'bind', 'ik', 'mesh', 'weight'] as MappingBoardTool[]).map(tool => <MappingToolButton key={tool} tool={tool} active={selectedTool === tool} onClick={() => onActivateTool(tool)} />)}
        </div>
        <div className="mapping-toolbar-hint"><ShieldCheck size={13} /> Front view is editable · side and back are synchronized previews</div>
      </div>

      <section className="mapping-board-content">
        <aside className="mapping-board-left">
          <section className="mapping-card mapping-structure-card">
            <div className="mapping-card-heading"><span className="mapping-number magenta">1</span><div><strong>Structure & bone tools</strong><small>Build the hierarchy before you map artwork.</small></div></div>
            <div className="mapping-mini-actions">
              <button type="button" onClick={() => onActivateTool('bone')}><Bone size={13} /> Add bone</button>
              <button type="button" onClick={() => onActivateTool('bind')}><Link2 size={13} /> Map layer</button>
            </div>
            <div className="mapping-check-list">
              <label><input type="checkbox" checked={showBones} onChange={event => setShowBones(event.target.checked)} /> Show bones</label>
              <label><input type="checkbox" checked={showNames} onChange={event => setShowNames(event.target.checked)} /> Show bone names</label>
              <label><input type="checkbox" checked={showGrid} onChange={event => setShowGrid(event.target.checked)} /> Show preview grid</label>
            </div>
            <div className="mapping-metrics"><MappingMetric label="Mapped layers" value={rigidMapped} tone="good" /><MappingMetric label="Weighted meshes" value={weighted} tone="warning" /><MappingMetric label="Unmapped" value={unmapped} tone={unmapped ? 'warning' : 'muted'} /></div>
          </section>

          <section className="mapping-card mapping-bind-card">
            <div className="mapping-card-heading"><span className="mapping-number cyan">2</span><div><strong>Map artwork to bone</strong><small>Choose a source, then confirm its target.</small></div></div>
            <label className="mapping-select-field"><span>Source artwork</span><div className="mapping-select-wrap"><Search size={12} /><select aria-label="Bone mapping source artwork" value={sourceId ?? ''} onChange={event => selectSource(event.target.value)}><option value="">Choose artwork…</option>{layers.map(layer => <option key={layer.id} value={layer.id}>{sourceLabel(layer)}</option>)}</select></div></label>
            <label className="mapping-select-field"><span>Target bone</span><select aria-label="Bone mapping target bone" value={targetId ?? ''} onChange={event => onTarget(event.target.value || null)}><option value="">Choose bone…</option>{bones.map(bone => <option key={bone.id} value={bone.id}>{bone.name}{bone.locked ? ' · locked' : ''}</option>)}</select></label>
            <div className={`mapping-connection ${mappedBone ? 'mapped' : target ? 'pending' : ''}`}><span className="mapping-connection-dot" />{mappedBone ? <><strong>{source?.name}</strong><span>→ {mappedBone.name}</span></> : target && source ? <><strong>{source.name}</strong><span>ready for {target.name}</span></> : <span>Select source and target</span>}</div>
            {source?.mesh && <p className="mapping-warning"><Sparkles size={12} /> Mesh artwork uses weights. Switch to Paint weights to map multiple bones.</p>}
            <div className="mapping-action-row"><button type="button" className="mapping-primary-button" disabled={!sourceId || !targetId || Boolean(source?.mesh)} onClick={() => { if (targetId) onMap(targetId); }}><Check size={13} /> Confirm map</button><button type="button" className="mapping-secondary-button" disabled={!mappedBone || Boolean(source?.mesh)} onClick={onUnbind}><Unlink size={13} /> Unbind</button></div>
          </section>
        </aside>

        <main className="mapping-board-views">
          <section className="mapping-view-card mapping-front-card">
            <div className="mapping-view-heading"><div><span className="mapping-number green">3</span><strong>Bone Mapping · Front View</strong></div><span className="mapping-view-badge editable">EDITABLE</span></div>
            <div className="mapping-front-stage">{stage}</div>
          </section>
          <div className="mapping-side-grid">
            <section className="mapping-view-card"><div className="mapping-view-heading"><div><span className="mapping-number cyan">4</span><strong>Side View</strong></div><span className="mapping-view-badge">READ ONLY</span></div><BoneMappingPreview kind="side" sourceId={sourceId} targetId={targetId ?? mappedBone?.id ?? null} selectedId={rig.bones.has(selectedId ?? '') ? selectedId : null} showBones={showBones} showNames={showNames} showGrid={showGrid} assets={assets} /></section>
            <section className="mapping-view-card"><div className="mapping-view-heading"><div><span className="mapping-number cyan">5</span><strong>Back View</strong></div><span className="mapping-view-badge">READ ONLY</span></div><BoneMappingPreview kind="back" sourceId={sourceId} targetId={targetId ?? mappedBone?.id ?? null} selectedId={rig.bones.has(selectedId ?? '') ? selectedId : null} showBones={showBones} showNames={showNames} showGrid={showGrid} assets={assets} /></section>
          </div>
          <section className="mapping-preview-strip">
            <div className="mapping-preview-strip-title"><span className="mapping-number purple">6</span><div><strong>Animation preview</strong><small>Check mapped layers before you paint or key a pose.</small></div></div>
            <label className="mapping-animation-select"><span>Clip</span><select aria-label="Bone mapping animation preview" value={rig.timeline.activeAnimationId ?? ''} onChange={event => setTimeline({ activeAnimationId: event.target.value || null })}><option value="">Authored pose</option>{rig.animations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <button type="button" className="mapping-play-button" aria-label={rig.timeline.isPlaying ? 'Pause animation preview' : 'Play animation preview'} onClick={() => togglePlayback()}>{rig.timeline.isPlaying ? <Pause size={13} /> : <Play size={13} />}</button>
            <label className="mapping-frame-field"><span>Frame</span><input aria-label="Bone mapping preview frame" type="number" min={rig.timeline.startFrame} max={rig.timeline.endFrame} value={Math.round(rig.timeline.currentFrame)} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) setTimeline({ currentFrame: value }); }} /></label>
            <div className="mapping-preview-state">{animation ? `${animation.name} · ${Math.round(rig.timeline.currentFrame)} / ${animation.endFrame}` : 'No animation selected'}</div>
            <button type="button" className="mapping-secondary-button" onClick={() => { pause(); setTimeline({ currentFrame: 0 }); onStatus('Animation preview reset to authored pose'); }}><RotateCcw size={12} /> Reset</button>
          </section>
        </main>
      </section>

      <footer className="mapping-board-help"><div><span className="mapping-number amber">7</span><strong>Quick workflow</strong></div><ol><li>Select or import separate artwork layers.</li><li>Create bones or Generate rig.</li><li>Choose source + target, then confirm mapping.</li><li>Use Mesh & weights for clothing and bending parts.</li><li>Play the preview, then key the pose in the timeline.</li></ol><span className="mapping-key-hint"><kbd>L</kbd> map <kbd>B</kbd> bone <kbd>W</kbd> weights <kbd>I</kbd> pose</span></footer>
    </div>
  );
}
