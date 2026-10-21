import { Box, Move, RotateCcw, Scaling } from 'lucide-react';
import { useState } from 'react';
import { defaultCamera3D, normalizeTransform3D } from '../engine/camera3d';
import type { Transform3D } from '../engine/camera3d';
import { updateLayer3D } from '../engine/scene3d';
import { useProject } from '../state/projectStore';
import type { EnvironmentLayer } from './environmentData';

type Axis = 'x' | 'y' | 'z';
type TransformChannel = keyof Transform3D;

function NumberField({ label, value, step = 1, suffix, min, max, onChange, disabled, ariaLabel }: {
  label: string;
  value: number;
  step?: number;
  suffix?: string;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return <label className="environment-transform-field">
    <span>{label}</span>
    <div className="environment-transform-input"><input aria-label={ariaLabel ?? label} type="number" value={Number.isFinite(value) ? value : 0} step={step} min={min} max={max} disabled={disabled} onChange={event => onChange(event.target.value)} />{suffix && <em>{suffix}</em>}</div>
  </label>;
}

function AxisRow({ label, values, step, suffix, min, max, disabled, onChange }: {
  label: string;
  values: { x: number; y: number; z: number };
  step: number;
  suffix: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (axis: Axis, value: string) => void;
}) {
  return <div className="environment-transform-channel">
    <div className="environment-transform-channel-heading"><span>{label}</span><small>{suffix}</small></div>
    <div className="environment-transform-axis-grid">{(['x', 'y', 'z'] as Axis[]).map(axis => <NumberField key={axis} label={axis.toUpperCase()} ariaLabel={`${label} ${axis.toUpperCase()}`} value={values[axis]} step={step} suffix={suffix} min={min} max={max} disabled={disabled} onChange={value => onChange(axis, value)} />)}</div>
  </div>;
}

export function EnvironmentSelectionPanel({ layers, selectedId, onSelect, onChange, onStatus }: {
  layers: EnvironmentLayer[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<EnvironmentLayer>) => void;
  onStatus: (message: string) => void;
}) {
  const { rig, updateProject } = useProject();
  const [linkScale, setLinkScale] = useState(true);
  const selectedMeta = layers.find(layer => layer.id === selectedId);
  const selectedLayer = selectedId ? rig.layers.get(selectedId) : undefined;
  const selectableLayers = layers.filter(layer => rig.layers.has(layer.id));
  const transform = normalizeTransform3D(selectedLayer?.transform3d);
  const xyzEnabled = Boolean(rig.getStageView().camera3d?.enabled);
  const locked = Boolean(selectedLayer?.locked || selectedMeta?.locked);

  const update2D = (key: 'x' | 'y' | 'rotation' | 'scale', rawValue: string) => {
    const value = Number(rawValue);
    if (!selectedLayer || !Number.isFinite(value) || locked) return;
    updateProject(project => {
      const target = project.layers.get(selectedLayer.id);
      if (!target || target.locked) return;
      if (key === 'rotation') target.local.rotation = value * Math.PI / 180;
      else if (key === 'scale') {
        const next = Math.max(.05, Math.min(10, value));
        target.local.scaleX = next;
        if (linkScale) target.local.scaleY = next;
      } else target.local[key] = value;
    });
    onStatus(`${selectedLayer.name} ${key === 'rotation' ? 'rotation' : key === 'scale' ? 'scale' : key.toUpperCase()} updated`);
  };

  const updateXYZ = (channel: TransformChannel, axis: Axis, rawValue: string) => {
    const value = Number(rawValue);
    if (!selectedLayer || !Number.isFinite(value) || locked) return;
    updateProject(project => {
      const target = project.layers.get(selectedLayer.id);
      if (!target || target.locked) return;
      const next = normalizeTransform3D(target.transform3d);
      next[channel][axis] = channel === 'scale' ? Math.max(.01, Math.min(1000, value)) : value;
      if (channel === 'scale' && linkScale) {
        next.scale.x = next.scale.y = next.scale.z = Math.max(.01, Math.min(1000, value));
      }
      updateLayer3D(project, target.id, next, false, false);
    });
    onStatus(`${selectedLayer.name} 3D ${channel} ${axis.toUpperCase()} updated`);
  };

  const toggleXYZPreview = () => {
    updateProject(project => {
      const current = project.getStageView();
      const enabled = Boolean(current.camera3d?.enabled);
      project.setStage2D({
        enabled: !enabled,
        camera3d: { ...defaultCamera3D(), ...(current.camera3d ?? {}), enabled: !enabled },
      });
    });
    onStatus(xyzEnabled ? 'XYZ preview disabled · 2D village editing restored' : 'XYZ preview enabled · use the fields or rotation rings to edit depth');
  };

  const resetTransforms = () => {
    if (!selectedLayer || locked) return;
    updateProject(project => {
      const target = project.layers.get(selectedLayer.id);
      if (!target || target.locked) return;
      target.local.x = 400;
      target.local.y = 420;
      target.local.rotation = 0;
      target.local.scaleX = 1;
      target.local.scaleY = 1;
      target.transform3d = normalizeTransform3D(undefined);
    });
    onStatus(`${selectedLayer.name} transform reset`);
  };

  return <section className="environment-selection-card environment-transform-panel" aria-label="Village prop editor">
    <div className="environment-panel-heading"><span><Move size={13} /> Prop editor</span><small>{selectedLayer ? 'ACTIVE' : 'SELECT'}</small></div>
    <label className="environment-select-field"><span>Select scene prop</span><select aria-label="Select village prop" value={selectedLayer ? selectedLayer.id : ''} onChange={event => onSelect(event.target.value || null)}>
      <option value="">Choose a prop…</option>
      {selectableLayers.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
    </select></label>
    {!selectedMeta && <p>Select a village prop from the list or click an object on the stage.</p>}
    {selectedMeta && <>
      <div className="environment-selection-title"><strong>{selectedLayer?.name ?? selectedMeta.name}</strong><span>{selectedLayer ? 'native editable layer' : `${selectedMeta.kind} summary layer`}</span></div>
      {!selectedLayer && <p>This environment row has no native transform target yet. Add the Willow village kit to edit individual props.</p>}
      {selectedLayer && <>
        <div className="environment-transform-toolbar"><span><Scaling size={12} /> 2D transform</span><button type="button" onClick={resetTransforms} disabled={locked} title="Reset 2D and XYZ transforms"><RotateCcw size={12} /> Reset</button></div>
        <div className="environment-transform-grid">
          <NumberField label="X" value={selectedLayer.local.x} suffix="px" disabled={locked} onChange={value => update2D('x', value)} />
          <NumberField label="Y" value={selectedLayer.local.y} suffix="px" disabled={locked} onChange={value => update2D('y', value)} />
          <NumberField label="Rotation" value={selectedLayer.local.rotation * 180 / Math.PI} step={1} suffix="°" disabled={locked} onChange={value => update2D('rotation', value)} />
          <NumberField label="Scale" value={selectedLayer.local.scaleX} step={.05} min={.05} max={10} suffix="×" disabled={locked} onChange={value => update2D('scale', value)} />
        </div>
        <button type="button" className={`environment-link-scale ${linkScale ? 'active' : ''}`} aria-pressed={linkScale} onClick={() => setLinkScale(value => !value)} disabled={locked}>Link scale while editing XYZ</button>
        <label className="environment-range compact"><span>Opacity <output>{Math.round(selectedLayer.opacity * 100)}%</output></span><input type="range" min="0" max="1" step=".01" value={selectedLayer.opacity} disabled={locked} onChange={event => onChange(selectedLayer.id, { opacity: Number(event.target.value) })} /></label>
        <div className="environment-transform-toolbar environment-xyz-toolbar"><span><Box size={12} /> XYZ transform</span><button type="button" className={xyzEnabled ? 'active' : ''} onClick={toggleXYZPreview}>{xyzEnabled ? 'Disable preview' : 'Enable preview'}</button></div>
        <p className="environment-transform-help">Drag the selected prop on the stage to move it. Use XYZ fields for depth, Euler rotation, and non-destructive 3D scale.</p>
        <AxisRow label="Position" values={transform.position} step={1} suffix="px" disabled={locked} onChange={(axis, value) => updateXYZ('position', axis, value)} />
        <AxisRow label="Rotation" values={transform.rotation} step={1} suffix="°" min={-180} max={180} disabled={locked} onChange={(axis, value) => updateXYZ('rotation', axis, value)} />
        <AxisRow label="Scale" values={transform.scale} step={.05} suffix="×" min={.01} max={1000} disabled={locked} onChange={(axis, value) => updateXYZ('scale', axis, value)} />
      </>}
    </>}
  </section>;
}
