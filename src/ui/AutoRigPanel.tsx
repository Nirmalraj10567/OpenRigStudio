import { useState } from 'react';
import { AlertCircle, Bone, CheckCircle2, Sparkles } from 'lucide-react';
import { autoRig } from '../engine/autoRig';
import type { AutoRigMode, AutoRigOptions, AutoRigReport } from '../engine/autoRig';
import { useProject } from '../state/projectStore';

const MIN_SPINE_COUNT = 1;
const MAX_SPINE_COUNT = 16;

const PRESETS: ReadonlyArray<{ mode: AutoRigMode; label: string; description: string }> = [
  { mode: 'full', label: 'Human', description: 'Full body skeleton' },
  { mode: 'upper', label: 'Upper', description: 'Spine, head and arms' },
  { mode: 'lower', label: 'Lower', description: 'Hips and legs' },
  { mode: 'head', label: 'Head', description: 'Head only' },
];

const MODE_LABELS: Record<AutoRigMode, string> = {
  full: 'Human',
  upper: 'Upper',
  lower: 'Lower',
  head: 'Head',
};

function clampSpineCount(value: number): number {
  return Math.min(MAX_SPINE_COUNT, Math.max(MIN_SPINE_COUNT, Math.floor(value)));
}

function uniqueWarnings(report: AutoRigReport, layerNames: string[]): string[] {
  const warnings = [...new Set((report.warnings ?? []).filter((warning): warning is string => Boolean(warning)))];
  if (warnings.length || !layerNames.length) return warnings;
  return [`${layerNames.length} artwork layer${layerNames.length === 1 ? '' : 's'} remain unmapped.`];
}

export function AutoRigPanel({ onStatus }: { onStatus: (message: string) => void }) {
  const { rig, smartEdit, updateProject, pause } = useProject();
  const [mode, setMode] = useState<AutoRigMode>('full');
  const [spineCount, setSpineCount] = useState(3);
  const [createHeadControls, setCreateHeadControls] = useState(false);
  const [bindArtwork, setBindArtwork] = useState(true);
  const [gearUp, setGearUp] = useState(true);
  const [report, setReport] = useState<AutoRigReport | null>(null);

  const editActive = Boolean(smartEdit || rig.smartEditingActionId);
  const hasArtwork = rig.layers.size > 0;
  const isEmpty = rig.layers.size === 0 && rig.bones.size === 0;
  const reportLayerNames = report?.unmappedLayerIds.flatMap(id => {
    const layer = rig.layers.get(id);
    return layer ? [layer.name] : [];
  }) ?? [];
  const warnings = report ? uniqueWarnings(report, reportLayerNames) : [];

  const generate = () => {
    const current = useProject.getState();
    if (current.smartEdit || current.rig.smartEditingActionId) {
      onStatus('Finish or cancel the Smart Bone edit before generating a rig');
      return;
    }

    const options: AutoRigOptions = {
      mode,
      spineCount,
      createHeadControls,
      bindArtwork,
      gearUp,
    };
    const result: { report: AutoRigReport | null } = { report: null };
    try {
      pause();
      updateProject(project => {
        result.report = autoRig(project, options);
      });
    } catch (error: unknown) {
      setReport(null);
      const message = error instanceof Error && error.message ? error.message : 'Unknown error';
      onStatus(`Auto-rig failed · ${message}`);
      return;
    }

    const nextReport = result.report;
    if (!nextReport) {
      setReport(null);
      onStatus('Auto-rig did not produce a report');
      return;
    }

    setReport(nextReport);
    onStatus(`${MODE_LABELS[nextReport.mode]} rig generated · ${nextReport.createdBoneIds.length} created · ${nextReport.boundLayerIds.length} mapped · ${nextReport.unmappedLayerIds.length} unmapped`);
  };

  return (
    <section className="dock-section auto-rig-section" aria-label="Auto rig">
      <div className="section-title">
        <span><Bone size={15} /> Auto rig</span>
        <span className={`stage-badge ${editActive ? '' : 'active'}`}>{editActive ? 'LOCKED' : 'READY'}</span>
      </div>
      <p className="scope-note">Generate a semantic skeleton, map named artwork, and keep the result editable in Bone Mapping.</p>
      {isEmpty && <p className="scope-note">Empty rig · Human creates a canvas-sized skeleton. Add artwork first if you want automatic layer mapping.</p>}
      {!isEmpty && !hasArtwork && <p className="scope-note">No artwork layers yet · the selected preset will create bones without layer mappings.</p>}
      {editActive && <p className="edit-notice">Finish or cancel the current Smart Bone edit before changing the rig.</p>}

      <fieldset className="stage-fields" disabled={editActive}>
        <div className="property-subtitle">Preset</div>
        <div className="key-buttons" role="radiogroup" aria-label="Auto-rig preset">
          {PRESETS.map(preset => (
            <button
              key={preset.mode}
              type="button"
              className="secondary-button"
              aria-label={`${preset.label}: ${preset.description}`}
              aria-pressed={mode === preset.mode}
              title={preset.description}
              onClick={() => setMode(preset.mode)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <label className="property-field">
          <span>Spine count (1–16)</span>
          <input
            aria-label="Spine count"
            type="number"
            min={MIN_SPINE_COUNT}
            max={MAX_SPINE_COUNT}
            step={1}
            value={spineCount}
            onChange={event => {
              const value = event.currentTarget.valueAsNumber;
              if (Number.isFinite(value)) setSpineCount(clampSpineCount(value));
            }}
          />
        </label>

        <div className="property-subtitle">Options</div>
        <label className="check-label"><input aria-label="Create head controls" type="checkbox" checked={createHeadControls} onChange={event => setCreateHeadControls(event.target.checked)} /> Create head controls</label>
        <label className="check-label"><input aria-label="Auto bind artwork" type="checkbox" checked={bindArtwork} onChange={event => setBindArtwork(event.target.checked)} /> Auto bind artwork</label>
        <label className="check-label"><input aria-label="Gear up artwork" type="checkbox" checked={gearUp} onChange={event => setGearUp(event.target.checked)} /> Gear up artwork</label>

        <button className="primary-button full-button" type="button" onClick={generate}>
          <Sparkles size={14} /> Generate rig
        </button>
      </fieldset>

      {report && (
        <section className="controller-card" aria-label="Auto-rig report">
          <div className="property-subtitle">Last pass · {MODE_LABELS[report.mode]} · {report.spineCount} spine</div>
          <div className="motion-summary" aria-label="Auto-rig counts">
            <div><span>Created</span><strong>{report.createdBoneIds.length}</strong></div>
            <div><span>Mapped</span><strong>{report.boundLayerIds.length}</strong></div>
            <div><span>Unmapped</span><strong>{report.unmappedLayerIds.length}</strong></div>
            <div><span>Total bones</span><strong>{report.boneCount}</strong></div>
          </div>
          {warnings.length > 0 ? (
            <div className="controller-warning" role="status">
              <strong><AlertCircle size={13} /> {warnings.length} warning{warnings.length === 1 ? '' : 's'}</strong>
              <ul>{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>
            </div>
          ) : (
            <p className="scope-note"><CheckCircle2 size={13} /> No mapping warnings.</p>
          )}
        </section>
      )}
    </section>
  );
}
