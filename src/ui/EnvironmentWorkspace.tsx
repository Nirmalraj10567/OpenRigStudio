import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, Camera, CheckCircle2, FolderOpen, Globe2, Upload } from 'lucide-react';
import { useProject } from '../state/projectStore';
import { CameraPreview } from './CameraPreview';
import { EnvironmentAssetLibrary } from './EnvironmentAssetLibrary';
import { EnvironmentEffectsPanel } from './EnvironmentEffectsPanel';
import { EnvironmentLayersPanel } from './EnvironmentLayersPanel';
import { EnvironmentMiniMap } from './EnvironmentMiniMap';
import { EnvironmentSettingsPanel } from './EnvironmentSettingsPanel';
import { readEnvironment, writeEnvironmentPatch } from './environmentData';
import type { EnvironmentAssetDefinition, EnvironmentLayer, EnvironmentPatch, EnvironmentSnapshot } from './environmentData';
import { TerrainTilePanel } from './TerrainTilePanel';

export interface EnvironmentWorkspaceProps {
  stage: ReactNode;
  onStatus: (message: string) => void;
  onImportProject: () => void;
  onOpenAssetStore: () => void;
  onAddAsset: (asset: EnvironmentAssetDefinition) => void;
  onActivateCamera: () => void;
}

function mergeEnvironment(current: EnvironmentSnapshot, patch: EnvironmentPatch): EnvironmentSnapshot {
  return {
    ...current,
    settings: { ...current.settings, ...(patch.settings ?? {}) },
    terrain: { ...current.terrain, ...(patch.terrain ?? {}) },
    effects: { ...current.effects, ...(patch.effects ?? {}) },
    layers: patch.layers ?? current.layers,
    assetIds: patch.assetIds ?? current.assetIds,
  };
}

export function EnvironmentWorkspace({ stage, onStatus, onImportProject, onOpenAssetStore, onAddAsset, onActivateCamera }: EnvironmentWorkspaceProps) {
  const { rig, updateProject } = useProject();
  const [environment, setEnvironment] = useState<EnvironmentSnapshot>(() => readEnvironment(rig));
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(() => readEnvironment(rig).layers[0]?.id ?? null);
  const previousRig = useRef(rig);
  const cameraLabel = rig.cameraView === 'preview' ? 'Preview camera' : rig.cameraView === 'switch' ? 'Camera switcher' : rig.cameras.find(camera => camera.id === rig.cameraView)?.name ?? 'Custom camera';

  useEffect(() => {
    if (previousRig.current === rig) return;
    previousRig.current = rig;
    const next = readEnvironment(rig);
    setEnvironment(next);
    setSelectedLayerId(next.layers[0]?.id ?? null);
  }, [rig]);

  const applyPatch = (patch: EnvironmentPatch, status?: string) => {
    setEnvironment(current => mergeEnvironment(current, patch));
    // Environment edits are real project edits: they participate in undo/redo,
    // autosave, and JSON export instead of living only in this panel's state.
    updateProject(project => { writeEnvironmentPatch(project, patch); });
    if (status) onStatus(status);
  };

  const updateLayer = (id: string, patch: Partial<EnvironmentLayer>) => {
    const layers = environment.layers.map(layer => layer.id === id ? { ...layer, ...patch } : layer);
    applyPatch({ layers }, `${layers.find(layer => layer.id === id)?.name ?? 'Environment layer'} updated`);
  };

  const addAsset = (asset: EnvironmentAssetDefinition) => {
    const layer: EnvironmentLayer = {
      id: `environment-asset-${asset.id}`,
      name: asset.name,
      kind: asset.layerKind,
      visible: true,
      locked: false,
      opacity: 1,
      count: 1,
      accent: asset.accent,
    };
    const existing = environment.layers.find(item => item.id === layer.id);
    const layers = existing ? environment.layers : [layer, ...environment.layers];
    const assetIds = [...new Set([...environment.assetIds, asset.id])];
    setEnvironment(current => ({ ...current, layers, assetIds, settings: { ...current.settings, biome: asset.biome, name: current.settings.name === 'Untitled Environment' ? asset.name : current.settings.name } }));
    updateProject(project => { writeEnvironmentPatch(project, { layers, assetIds, settings: { biome: asset.biome } }); });
    setSelectedLayerId(layer.id);
    onAddAsset(asset);
  };

  const selectedLayer = environment.layers.find(layer => layer.id === selectedLayerId);
  return <div className="environment-workspace" aria-label="Environment workspace">
    <aside className="environment-left-column">
      <div className="environment-workspace-title"><div className="environment-workspace-icon"><Globe2 size={18} /></div><div><span className="environment-eyebrow">WORLD BUILDING</span><h1>Environment</h1><p>Block terrain, atmosphere, and camera coverage.</p></div></div>
      <div className="environment-import-card"><div><strong>Import an environment</strong><small>Open a project JSON with optional environment data.</small></div><button onClick={onImportProject} title="Import environment project"><Upload size={14} /></button></div>
      <EnvironmentAssetLibrary onAddAsset={addAsset} onOpenStore={onOpenAssetStore} />
      <EnvironmentLayersPanel layers={environment.layers} selectedId={selectedLayerId} onSelect={setSelectedLayerId} onChange={updateLayer} />
    </aside>
    <main className="environment-center-column">
      <header className="environment-stage-header"><div><span className="environment-eyebrow">ACTIVE WORLD</span><h2>{environment.settings.name}</h2><p>{environment.settings.biome} · {environment.settings.weather} · {environment.source === 'runtime' ? 'Environment API connected' : 'Local workspace defaults'}</p></div><div className="environment-stage-actions"><span className={`environment-runtime-badge ${environment.hasRuntimeData ? 'connected' : 'fallback'}`}>{environment.hasRuntimeData ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}{environment.hasRuntimeData ? 'Runtime data' : 'Fallback data'}</span><button className="environment-camera-button" onClick={onActivateCamera}><Camera size={13} /> Camera controls</button></div></header>
      <div className="environment-stage-area"><div className="environment-stage-render">{stage}</div><div className="environment-stage-overlay"><span><FolderOpen size={12} /> Shared character stage</span><small>Environment UI reuses the current renderer</small></div></div>
      <div className="environment-preview-row"><CameraPreview settings={environment.settings} terrain={environment.terrain} cameraLabel={cameraLabel} onActivate={onActivateCamera} /><EnvironmentMiniMap terrain={environment.terrain} onSelectTile={id => applyPatch({ terrain: { activeTileId: id } }, `Focused ${environment.terrain.tiles.find(tile => tile.id === id)?.name ?? 'terrain tile'}`)} /></div>
    </main>
    <aside className="environment-right-column">
      <EnvironmentSettingsPanel settings={environment.settings} onChange={patch => applyPatch({ settings: patch }, 'Environment settings updated')} />
      <TerrainTilePanel terrain={environment.terrain} onChange={patch => applyPatch({ terrain: patch }, 'Terrain settings updated')} />
      <EnvironmentEffectsPanel effects={environment.effects} onChange={patch => applyPatch({ effects: patch }, 'Environment effects updated')} />
      <section className="environment-selection-card"><div className="environment-panel-heading"><span><Globe2 size={13} /> Selection</span><small>{selectedLayer ? 'ACTIVE' : 'NONE'}</small></div>{selectedLayer ? <><strong>{selectedLayer.name}</strong><small>{selectedLayer.kind} layer · {selectedLayer.count} item{selectedLayer.count === 1 ? '' : 's'}</small><label className="environment-range compact"><span>Opacity <output>{Math.round(selectedLayer.opacity * 100)}%</output></span><input type="range" min="0" max="1" step=".01" value={selectedLayer.opacity} onChange={event => updateLayer(selectedLayer.id, { opacity: Number(event.target.value) })} /></label></> : <p>Select an environment layer to inspect it.</p>}</section>
    </aside>
  </div>;
}
