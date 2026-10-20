import { useEffect, useState } from 'react';
import { useProject } from '../state/projectStore';
import type { Rig } from '../engine/Rig';
import { hasMeshWeights } from './meshOverlay';

export function MeshPanel({ onStatus, onActivate, onActivateWeight, weightRadius, weightStrength, onWeightRadius, onWeightStrength }: { onStatus: (message: string) => void; onActivate: () => void; onActivateWeight: () => void; weightRadius: number; weightStrength: number; onWeightRadius: (value: number) => void; onWeightStrength: (value: number) => void }) {
  const { rig, selectedId, meshVertex, meshInfluence, selectMeshVertex, setMeshInfluence, smartEdit, updateProject, pause } = useProject();
  const layer = selectedId ? rig.layers.get(selectedId) : undefined;
  const [columns, setColumns] = useState(6);
  const [rows, setRows] = useState(6);
  const [influences, setInfluences] = useState<string[]>([]);
  useEffect(() => {
    setInfluences([...new Set(layer?.mesh?.vertices.flatMap(vertex => Object.keys(vertex.weights).filter(id => vertex.weights[id] > 0)) ?? [])]);
  }, [rig, selectedId]);
  const mesh = layer?.mesh;
  const vertex = meshVertex === null ? undefined : mesh?.vertices[meshVertex];
  const bones = [...rig.bones.values()];
  const perform = (edit: (project: Rig) => boolean, success: string) => {
    pause();
    let ok = false;
    updateProject(project => { ok = edit(project); });
    onStatus(ok ? success : 'Could not update mesh. Check the layer, bones and current pose.');
    return ok;
  };
  const setWeight = (boneId: string, value: number) => {
    if (!layer || !vertex || meshVertex === null || !Number.isFinite(value)) return;
    const amount = Math.min(1, Math.max(0, value));
    const weights = { ...vertex.weights };
    const otherTotal = Object.entries(weights).reduce((sum, [id, weight]) => sum + (id === boneId ? 0 : weight), 0);
    Object.keys(weights).forEach(id => { if (id !== boneId) weights[id] = otherTotal > 0 ? weights[id] / otherTotal * (1 - amount) : 0; });
    weights[boneId] = amount;
    perform(project => project.setVertexWeights(layer.id, meshVertex, weights), 'Vertex weights normalized · Undo restores previous weights');
  };
  return <section className="dock-section mesh-section" aria-label="Mesh and weights">
    <div className="section-title"><span>Mesh & weights</span><button className="mini-text" onClick={onActivate}>M · Edit points</button></div>
    {!layer ? <p className="scope-note">Select artwork in the layer list or use M to select artwork through bones.</p> : <>
      <p className="scope-note">{layer.name} · {mesh ? `${mesh.vertices.length} vertices / ${mesh.triangles.length / 3} triangles` : 'Convert artwork into an editable triangle grid.'}</p>
      <fieldset className="property-fields" disabled={layer.locked}>
        <fieldset className="property-fields" disabled={Boolean(smartEdit)}>
          {!mesh && <div className="property-grid">
            <label className="property-field"><span>Columns (2–16)</span><input type="number" min={2} max={16} value={columns} onChange={event => setColumns(Math.min(16, Math.max(2, Math.round(Number(event.target.value) || 2))))} /></label>
            <label className="property-field"><span>Rows (2–16)</span><input type="number" min={2} max={16} value={rows} onChange={event => setRows(Math.min(16, Math.max(2, Math.round(Number(event.target.value) || 2))))} /></label>
          </div>}
          <div className="panel-buttons">
            {!mesh ? <button className="secondary-button full-button" onClick={() => { if (perform(project => project.createMesh(layer.id, columns, rows), 'Mesh created · Drag dots with M. Choose bones below to bind.')) { selectMeshVertex(null); onActivate(); } }}>Create triangle mesh</button>
              : <button className="danger-button" onClick={() => { if (perform(project => project.removeMesh(layer.id), 'Mesh removed')) selectMeshVertex(null); }}>Remove mesh</button>}
          </div>
        </fieldset>
        {mesh && <>
          <p className="scope-note">M: drag a vertex to reshape artwork. Escape cancels a drag. Each drag is one undo step. Unweighted points can be edited directly.</p>
          <label className="select-field"><span>Selected vertex</span><select value={vertex ? meshVertex! : ''} onChange={event => selectMeshVertex(event.target.value === '' ? null : Number(event.target.value))}><option value="">No vertex selected</option>{mesh.vertices.map((_, index) => <option key={index} value={index}>Vertex {index}</option>)}</select></label>
          <button className="mini-text" disabled={!vertex} onClick={() => selectMeshVertex(null)}>Clear vertex selection</button>
          <fieldset className="property-fields" disabled={Boolean(smartEdit)}>
            <div className="property-subtitle">Bones for auto weights</div>
            <div className="checklist">{bones.map(bone => <label key={bone.id}><input type="checkbox" checked={influences.includes(bone.id)} onChange={event => setInfluences(ids => event.target.checked ? [...ids, bone.id] : ids.filter(id => id !== bone.id))} />{bone.name}</label>)}{!bones.length && <p className="scope-note">Draw bones with B first.</p>}</div>
            <button className="secondary-button full-button" disabled={!influences.some(id => rig.bones.has(id))} onClick={() => perform(project => project.bindMesh(layer.id, influences.filter(id => rig.bones.has(id))), 'Auto weights applied · Current pose captured as skin rest pose')}>Auto weights / rebind rest pose</button>
            <p className="scope-note">Only checked bones are used. Rebinding replaces weights and records the current rest pose. {hasMeshWeights(layer) ? 'Mesh skinning is active; rigid bone mapping is disabled.' : 'No weighted bones yet.'}</p>
          </fieldset>
           <label className="select-field"><span>Heatmap influence (blue 0 → orange 1)</span><select value={meshInfluence ?? ''} onChange={event => setMeshInfluence(event.target.value || null)}><option value="">Wireframe only</option>{bones.map(bone => <option key={bone.id} value={bone.id}>{bone.name}</option>)}</select></label>
           <div className="weight-paint-box">
             <div className="property-subtitle">Weight map painting</div>
             <p className="scope-note">Choose a heatmap influence, then paint directly on the mesh. Hold Shift to erase. UVs and mesh topology stay unchanged.</p>
             <div className="panel-buttons"><button className="secondary-button full-button" disabled={!meshInfluence || layer.locked} onClick={onActivateWeight}> <span>W</span> Paint selected influence</button></div>
             <label className="camera-range"><span>Brush radius <output>{Math.round(weightRadius)} px</output></span><input aria-label="Weight paint brush radius" type="range" min={4} max={120} step={1} value={weightRadius} onChange={event => onWeightRadius(Number(event.target.value))} /></label>
             <label className="camera-range"><span>Brush strength <output>{Math.round(weightStrength * 100)}%</output></span><input aria-label="Weight paint brush strength" type="range" min={.02} max={1} step={.01} value={weightStrength} onChange={event => onWeightStrength(Number(event.target.value))} /></label>
           </div>
           {vertex && <fieldset className="property-fields" disabled={Boolean(smartEdit)}>
            <div className="property-subtitle">Vertex {meshVertex} · normalized weights</div>
            <p className="scope-note">Values 0–1. Other influences scale to keep a total of 1. A lone nonzero influence becomes 1; Clear leaves the point unweighted.</p>
            <div className="weight-list">{bones.map(bone => <div className="weight-row" key={bone.id}>
              <button className="weight-label" title="Show influence heatmap" onClick={() => setMeshInfluence(bone.id)}>{bone.name}</button>
              <input type="number" aria-label={`${bone.name} vertex weight`} min={0} max={1} step={.05} value={Math.round((vertex.weights[bone.id] ?? 0) * 1000) / 1000} onChange={event => setWeight(bone.id, Number(event.target.value))} />
              <button className="mini-text" aria-label={`Assign 100% to ${bone.name}`} onClick={() => perform(project => project.setVertexWeights(layer.id, meshVertex!, { [bone.id]: 1 }), `Vertex assigned to ${bone.name}`)}>100%</button>
              <button className="mini-text" aria-label={`Clear ${bone.name} weight`} onClick={() => setWeight(bone.id, 0)}>×</button>
            </div>)}</div>
            <button className="mini-text" onClick={() => perform(project => project.setVertexWeights(layer.id, meshVertex!, {}), 'Vertex weights cleared')}>Clear all vertex weights</button>
          </fieldset>}
          {smartEdit && <p className="scope-note">Action edit: mesh points are editable; topology and skin weights are held fixed.</p>}
        </>}
      </fieldset>
    </>}
  </section>;
}
