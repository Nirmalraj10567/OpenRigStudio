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
import { EnvironmentSelectionPanel } from './EnvironmentSelectionPanel';
import { readEnvironment, writeEnvironmentPatch } from './environmentData';
import type { EnvironmentAssetDefinition, EnvironmentLayer, EnvironmentPatch, EnvironmentSnapshot } from './environmentData';
import { TerrainTilePanel } from './TerrainTilePanel';

export interface EnvironmentWorkspaceProps {
  stage: ReactNode;
  onStatus: (message: string) => void;
  onImportProject: () => void;
  onOpenAssetStore: () => void;
  onAddAsset: (asset: EnvironmentAssetDefinition) => string[];
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
  const { rig, selectedId, select, updateProject } = useProject();
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

  useEffect(() => {
    if (selectedId && environment.layers.some(layer => layer.id === selectedId)) setSelectedLayerId(selectedId);
    else if (!selectedId) setSelectedLayerId(null);
    else if (!environment.layers.some(layer => layer.id === selectedId)) setSelectedLayerId(null);
  }, [selectedId, environment.layers]);

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
    updateProject(project => {
      const target = project.layers.get(id);
      if (!target) return;
      if (patch.visible !== undefined) target.visible = patch.visible;
      if (patch.locked !== undefined) target.locked = patch.locked;
      if (patch.opacity !== undefined) target.opacity = patch.opacity;
    });
  };

  const selectEnvironmentLayer = (id: string | null) => {
    setSelectedLayerId(id);
    select(id && rig.layers.has(id) ? id : null);
  };

  const addAsset = (asset: EnvironmentAssetDefinition) => {
    const createdIds = onAddAsset(asset);
    if (!createdIds.length) return;
    const currentRig = useProject.getState().rig;
    const createdLayers: EnvironmentLayer[] = createdIds.flatMap(id => {
      const nativeLayer = currentRig.layers.get(id);
      if (!nativeLayer) return [];
      const kind = asset.id === 'environment-willow-village' && /oak|pine/i.test(nativeLayer.name) ? 'vegetation' : asset.layerKind;
      return [{
        id: nativeLayer.id,
        name: nativeLayer.name.replace(/^Village · /, ''),
        kind,
        visible: nativeLayer.visible,
        locked: nativeLayer.locked,
        opacity: nativeLayer.opacity,
        count: 1,
        accent: asset.accent,
      }];
    });
    if (!createdLayers.length) return;
    const createdLayerIds = new Set(createdLayers.map(layer => layer.id));
    const layers = [...createdLayers, ...environment.layers.filter(item => !createdLayerIds.has(item.id))];
    const assetIds = [...new Set([...environment.assetIds, asset.id])];
    const settings = { biome: asset.biome, ...(environment.settings.name === 'Untitled Environment' || asset.id === 'environment-willow-village' ? { name: asset.name } : {}) };
    setEnvironment(current => ({ ...current, layers, assetIds, settings: { ...current.settings, ...settings }, source: 'runtime', hasRuntimeData: true }));
    updateProject(project => { writeEnvironmentPatch(project, { layers, assetIds, settings }); });
    setSelectedLayerId(createdLayers[Math.min(asset.id === 'environment-willow-village' ? 4 : 0, createdLayers.length - 1)].id);
  };

  return <div className="environment-workspace" aria-label="Environment workspace">
    <aside className="environment-left-column">
      <div className="environment-workspace-title"><div className="environment-workspace-icon"><Globe2 size={18} /></div><div><span className="environment-eyebrow">WORLD BUILDING</span><h1>Environment</h1><p>Block terrain, atmosphere, and camera coverage.</p></div></div>
      <div className="environment-import-card"><div><strong>Import an environment</strong><small>Open a project JSON with optional environment data.</small></div><button onClick={onImportProject} title="Import environment project"><Upload size={14} /></button></div>
      <EnvironmentAssetLibrary onAddAsset={addAsset} onOpenStore={onOpenAssetStore} />
      <EnvironmentLayersPanel layers={environment.layers} selectedId={selectedLayerId} onSelect={selectEnvironmentLayer} onChange={updateLayer} />
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
      <EnvironmentSelectionPanel layers={environment.layers} selectedId={selectedLayerId} onSelect={selectEnvironmentLayer} onChange={updateLayer} onStatus={onStatus} />
    </aside>
  </div>;
}
