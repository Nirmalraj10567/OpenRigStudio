import { Grid3X3, House, Sparkles, TreePine, UserRound, WandSparkles } from 'lucide-react';
import { DEFAULT_CHARACTER_DESIGN, addStudioCharacter } from '../engine/characterStudio';
import { DEFAULT_HOUSE_PROP, DEFAULT_TREE_PROP, addDesignedProp } from '../engine/propsToolkit';
import { useProject } from '../state/projectStore';

type AssetLibraryPanelProps = { onStatus: (message: string) => void; onOpenStore?: () => void };

const EFFECT_SHAPES = [
  { id: 'effect-glow', kind: 'ellipse' as const, x: 400, y: 250, radiusX: 74, radiusY: 74, fill: '#ffd36b55', stroke: '#fff0a8', strokeWidth: 3, opacity: .8 },
  { id: 'effect-ray-a', kind: 'path' as const, d: 'M 400 250 L 400 145', fill: 'none', stroke: '#fff0a8', strokeWidth: 8, opacity: .8, lineCap: 'round' as const },
  { id: 'effect-ray-b', kind: 'path' as const, d: 'M 400 250 L 500 190', fill: 'none', stroke: '#ffb86b', strokeWidth: 6, opacity: .72, lineCap: 'round' as const },
  { id: 'effect-ray-c', kind: 'path' as const, d: 'M 400 250 L 300 190', fill: 'none', stroke: '#69d6ff', strokeWidth: 6, opacity: .72, lineCap: 'round' as const },
];

export function AssetLibraryPanel({ onStatus, onOpenStore }: AssetLibraryPanelProps) {
  const { pause, updateProject, select } = useProject();

  const addCharacter = () => {
    pause();
    let groupId = '';
    updateProject(project => { groupId = addStudioCharacter(project, { ...DEFAULT_CHARACTER_DESIGN })?.groupId ?? ''; });
    if (groupId) { select(groupId); onStatus('Character template added to the scene · select its artwork or bones to edit'); }
  };

  const addProp = (kind: 'house' | 'tree') => {
    pause();
    let groupId = '';
    updateProject(project => { groupId = addDesignedProp(project, kind === 'house' ? { ...DEFAULT_HOUSE_PROP } : { ...DEFAULT_TREE_PROP }, { x: 400, y: 430 }).groupId; });
    if (groupId) { select(groupId); onStatus(`${kind === 'house' ? 'House' : 'Tree'} prop added to the scene · grouped artwork, rig and prepared views are ready`); }
  };

  const addMeshAsset = () => {
    pause();
    let id = '';
    updateProject(project => {
      id = project.addVectorLayer('Editable cloth prop', [{ id: 'cloth-body', kind: 'rect', x: 280, y: 190, width: 240, height: 130, fill: '#6bb9ad', stroke: '#d8fff4', strokeWidth: 3, opacity: .9 }]);
      project.createMesh(id, 6, 4);
    });
    if (id) { select(id); onStatus('Editable mesh template added · open Mesh & weights, choose bones, then apply auto weights'); }
  };

  const addEffect = () => {
    pause();
    let id = '';
    updateProject(project => { id = project.addVectorLayer('Glow burst effect', EFFECT_SHAPES); });
    if (id) { select(id); onStatus('Effect template added as editable vector artwork · animate its transform or opacity'); }
  };

  return <section className="dock-section asset-library-section" aria-label="Asset library">
    <div className="section-title"><span><Sparkles size={14} /> Asset library</span><span className="section-muted">LOCAL</span></div>
    {onOpenStore && <button className="asset-store-launch-button" onClick={onOpenStore}><Sparkles size={14} /> Open Asset Store <span>Browse, preview, and apply</span></button>}
    <p className="scope-note">Prepared local templates. Add one to the current scene without replacing your character, animation, cameras or undo history.</p>
    <div className="asset-library-grid">
      <button className="asset-card" onClick={addCharacter}><UserRound size={18} /><strong>Character</strong><small>Editable vector parts + skeleton</small><em>Add to scene</em></button>
      <button className="asset-card" onClick={() => addProp('house')}><House size={18} /><strong>House prop</strong><small>8 views + collider</small><em>Add to scene</em></button>
      <button className="asset-card" onClick={() => addProp('tree')}><TreePine size={18} /><strong>Tree prop</strong><small>8 views + wind rig</small><em>Add to scene</em></button>
      <button className="asset-card" onClick={addMeshAsset}><Grid3X3 size={18} /><strong>Mesh object</strong><small>Editable grid for weights</small><em>Add to scene</em></button>
      <button className="asset-card" onClick={addEffect}><WandSparkles size={18} /><strong>Glow effect</strong><small>Vector rays + opacity</small><em>Add to scene</em></button>
    </div>
    <p className="scope-note">For a full external character, use Open for a project JSON. For a reusable local object, use Add to scene above; every insert is undoable.</p>
  </section>;
}
