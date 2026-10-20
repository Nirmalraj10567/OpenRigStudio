import { Eye, EyeOff, FolderOpen, Layers3, Lock, Unlock } from 'lucide-react';
import type { EnvironmentLayer, EnvironmentLayerKind } from './environmentData';

const KIND_LABELS: Record<EnvironmentLayerKind, string> = {
  sky: 'Sky', terrain: 'Terrain', vegetation: 'Vegetation', props: 'Props', effects: 'Effects', characters: 'Characters',
};

export function EnvironmentLayersPanel({ layers, selectedId, onSelect, onChange }: { layers: EnvironmentLayer[]; selectedId: string | null; onSelect: (id: string) => void; onChange: (id: string, patch: Partial<EnvironmentLayer>) => void }) {
  return <section className="environment-panel environment-layers-panel" aria-label="Environment layers">
    <div className="environment-panel-heading"><span><Layers3 size={14} /> Environment layers</span><small>{layers.length} LAYERS</small></div>
    <div className="environment-layer-list">
      {layers.map(layer => <div className={`environment-layer-row ${selectedId === layer.id ? 'selected' : ''}`} key={layer.id}>
        <button className="environment-layer-select" onClick={() => onSelect(layer.id)} aria-pressed={selectedId === layer.id}>
          <span className="environment-layer-swatch" style={{ background: layer.accent }} />
          <span className="environment-layer-copy"><strong>{layer.name}</strong><small>{KIND_LABELS[layer.kind]} · {layer.count} item{layer.count === 1 ? '' : 's'}</small></span>
        </button>
        <button className="environment-row-action" onClick={() => onChange(layer.id, { visible: !layer.visible })} aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`} title={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}>{layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
        <button className="environment-row-action" onClick={() => onChange(layer.id, { locked: !layer.locked })} aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`} title={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}>{layer.locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
      </div>)}
    </div>
    <div className="environment-layer-summary"><FolderOpen size={12} /><span>Drag order is owned by the environment API when available.</span></div>
  </section>;
}
