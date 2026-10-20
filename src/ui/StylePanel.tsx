import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Image as ImageIcon, LockKeyhole, Palette, Paintbrush, Sparkles } from 'lucide-react';
import type { Rig } from '../engine/Rig';
import {
  applyStylePreset,
  listStylePresets,
  removeStylePreset,
  replaceImageArtwork,
  saveStylePreset,
  setShapeStyle,
} from '../engine/styles';
import { createStyleDemo } from '../engine/styleDemo';
import { useProject } from '../state/projectStore';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function colorValue(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function StylePanel({ onStatus }: { onStatus: (message: string) => void }) {
  const {
    rig,
    selectedId,
    select,
    version,
    projectGeneration,
    smartEdit,
    updateProject,
    replaceProject,
    pause,
  } = useProject();
  const [styleLayerId, setStyleLayerId] = useState('');
  const [shapeId, setShapeId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [presetScope, setPresetScope] = useState<'rig' | 'layer'>('rig');
  const importInput = useRef<HTMLInputElement>(null);
  const importToken = useRef(0);

  // Selecting through the Style dock follows canvas selection when it is an
  // artwork layer, while still allowing a bone to remain selected for posing.
   useEffect(() => {
     setStyleLayerId((current) => {
       if (selectedId && rig.layers.has(selectedId)) return selectedId;
       if (current && rig.layers.has(current)) return current;
       return rig.layersInOrder[0]?.id ?? '';
     });
  }, [rig, selectedId, version]);

  const layer = styleLayerId ? rig.layers.get(styleLayerId) : undefined;
  const vector = layer?.type === 'vector' ? layer : undefined;
  const shape = vector?.shapes.find(item => item.id === shapeId) ?? vector?.shapes[0];

  useEffect(() => {
    setShapeId((current) => vector?.shapes.some(item => item.id === current) ? current : vector?.shapes[0]?.id ?? '');
  }, [vector, version]);

  const editingBlocked = Boolean(smartEdit || layer?.locked);
  const presets = listStylePresets(rig);

  const selectStyleLayer = (id: string) => {
    setStyleLayerId(id);
    setShapeId('');
    select(id);
  };

  const mutateLayer = (change: (project: Rig, targetId: string) => boolean, success: string) => {
    const state = useProject.getState();
    const targetId = styleLayerId;
    if (state.smartEdit) {
      onStatus('Capture or cancel the Smart Bone edit before changing styles');
      return false;
    }
    if (!targetId || state.rig.layers.get(targetId)?.locked) {
      onStatus('Unlock this layer before changing its appearance');
      return false;
    }
    state.pause();
    let changed = false;
    state.updateProject(project => { changed = change(project, targetId); });
    onStatus(changed ? success : 'The selected layer could not be styled');
    return changed;
  };

  const mutateRig = (change: (project: Rig) => boolean, success: string) => {
    const state = useProject.getState();
    if (state.smartEdit) {
      onStatus('Capture or cancel the Smart Bone edit before changing styles');
      return false;
    }
    state.pause();
    let changed = false;
    state.updateProject(project => { changed = change(project); });
    onStatus(changed ? success : 'No style change was made');
    return changed;
  };

  const updateShape = (patch: Parameters<typeof setShapeStyle>[3]) => {
    if (!shape || !vector) return;
    mutateLayer((project, targetId) => setShapeStyle(project, targetId, shape.id, patch), 'Shape style updated · Undo restores it');
  };

  const updateLayer = (patch: { visible?: boolean; opacity?: number }) => {
    mutateLayer((project, targetId) => {
      const target = project.layers.get(targetId);
      if (!target) return false;
      if (patch.visible !== undefined) target.visible = patch.visible;
      if (patch.opacity !== undefined) target.opacity = clamp(patch.opacity, 0, 1);
      return true;
    }, 'Layer appearance updated · Undo restores it');
  };

  const replaceArtwork = (file: File) => {
    const targetId = styleLayerId;
    const state = useProject.getState();
    const generation = state.projectGeneration;
    const rigId = state.rig.id;
    if (!targetId || state.rig.images.get(targetId) === undefined) {
      onStatus('Select an image layer before replacing artwork');
      return;
    }
    if (state.smartEdit) {
      onStatus('Capture or cancel the Smart Bone edit before replacing artwork');
      return;
    }
    if (state.rig.images.get(targetId)?.locked) {
      onStatus('Unlock this image layer before replacing artwork');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      onStatus('Artwork must be 8 MB or smaller');
      return;
    }
    const extension = file.name.toLowerCase().match(/\.(png|jpe?g|webp|gif)$/)?.[1];
    const jpegMimeAlias = file.type === 'image/jpg';
    if ((Boolean(file.type) && !IMAGE_TYPES.has(file.type) && !jpegMimeAlias) || (!file.type && !extension)) {
      onStatus('Choose a local PNG, JPEG, WebP, or GIF');
      return;
    }
    const sourceType = IMAGE_TYPES.has(file.type) || jpegMimeAlias
      ? jpegMimeAlias ? 'image/jpeg' : file.type
      : extension ? (extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`) : 'image/png';

    const token = ++importToken.current;
    const reader = new FileReader();
    reader.onerror = () => { if (token === importToken.current) onStatus('Could not read the image'); };
    reader.onload = () => {
      if (token !== importToken.current) return;
      const src = reader.result;
      if (typeof src !== 'string') { onStatus('Could not read the image'); return; }
      // FileReader normally preserves the browser MIME, but normalize empty or
      // non-standard file MIME values to the engine's local-data URL contract.
      const localSrc = src.replace(/^data:[^;]+;base64,/i, `data:${sourceType};base64,`);
      const image = new Image();
      image.onerror = () => { if (token === importToken.current) onStatus('Could not decode that image'); };
      image.onload = () => {
        if (token !== importToken.current) return;
        if (!image.naturalWidth || !image.naturalHeight) { onStatus('Could not decode that image'); return; }
        const current = useProject.getState();
        // A file can finish after a project, selection, or Smart Bone session
        // changed. Never apply an import to a different target in that case.
        if (current.rig.id !== rigId || current.projectGeneration !== generation
          || current.selectedId !== targetId || current.smartEdit || !current.rig.images.has(targetId)
          || current.rig.images.get(targetId)?.locked) {
          onStatus('Artwork import cancelled because the selected target changed');
          return;
        }
        current.pause();
        let replaced = false;
        current.updateProject(project => { replaced = replaceImageArtwork(project, targetId, localSrc); });
        onStatus(replaced ? `${file.name} replaced the selected image · dimensions, rig and mesh preserved` : 'Could not replace the selected image');
      };
      image.src = localSrc;
    };
    reader.readAsDataURL(file);
  };

  const openStyleDemo = () => {
    if (smartEdit) {
      onStatus('Capture or cancel the Smart Bone edit before opening the Style demo');
      return;
    }
    if (!window.confirm('Replace the current project with the Style demo? Undo restores your work.')) return;
    pause();
    const demo = createStyleDemo();
    const clothing = demo.layersInOrder.find(item => /clothing|shirt|jacket|outfit|wardrobe/i.test(item.name))
      ?? demo.layersInOrder.find(item => item.type === 'vector')
      ?? demo.layersInOrder[0];
    replaceProject(demo.toProject());
    select(clothing?.id ?? null);
    setStyleLayerId(clothing?.id ?? '');
    setShapeId('');
    onStatus('Style demo loaded · separate clothing layers and presets ready · Undo restores your project');
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) { onStatus('Name the appearance preset first'); return; }
    const ids = presetScope === 'layer' && styleLayerId ? [styleLayerId] : undefined;
    let id: string | null = null;
    if (mutateRig(project => { id = saveStylePreset(project, name, ids); return Boolean(id); }, `Saved appearance preset “${name}”`)) setPresetName('');
  };

  const applyPreset = (id: string) => {
    const preset = presets.find(item => item.id === id);
    const presetLayers = (preset?.layers ?? []) as unknown[];
    const lockedTarget = presetLayers.length === 0
      ? rig.layersInOrder.some(item => item.locked)
      : presetLayers.some(item => {
        const layerId = typeof item === 'string'
          ? item
          : item && typeof item === 'object' && 'id' in item && typeof item.id === 'string' ? item.id
            : item && typeof item === 'object' && 'layerId' in item && typeof item.layerId === 'string' ? item.layerId : null;
      return Boolean(layerId && rig.layers.get(layerId)?.locked);
      });
    if (lockedTarget) {
      onStatus('Unlock the layers in this preset before applying it');
      return;
    }
    mutateRig(project => applyStylePreset(project, id) > 0, 'Appearance preset applied · Undo restores it');
  };

  const deletePreset = (id: string, name: string) => {
    if (!window.confirm(`Delete appearance preset “${name}”?`)) return;
    mutateRig(project => removeStylePreset(project, id), 'Appearance preset deleted · Undo restores it');
  };

  const layers = [...rig.layersInOrder].reverse();
  const fileLayer = layer?.type === 'image' ? layer : undefined;
  const fillMode = shape?.fill && shape.fill !== 'none' ? 'color' : 'none';
  const strokeMode = shape?.stroke && shape.stroke !== 'none' ? 'color' : 'none';

  return <section className="style-panel" aria-label="Style">
    <div className="style-hero">
      <div className="section-title"><span><Palette size={15} /> Style</span><span className="mode-badge">APPEARANCE</span></div>
      <p className="style-lede">Choose a layer below, then edit its colors, visibility, and opacity while the canvas stays available.</p>
      <label className="style-layer-select"><span>Style target</span><select value={styleLayerId} onChange={event => selectStyleLayer(event.target.value)}>
        {!layers.length && <option value="">No artwork layers</option>}
        {layers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.type}</option>)}
      </select></label>
      <div className="style-layer-list" aria-label="Artwork layers">
        {layers.map(item => <button key={item.id} className={`style-layer-option ${item.id === styleLayerId ? 'selected' : ''}`} aria-pressed={item.id === styleLayerId} onClick={() => selectStyleLayer(item.id)}>
          <span className={`style-layer-kind ${item.type}`}>{item.type === 'vector' ? <Paintbrush size={13} /> : <ImageIcon size={13} />}</span>
          <span className="style-layer-name">{item.name}<small>{item.type === 'vector' ? `${item.shapes.length} shapes` : 'flat image'}{item.locked ? ' · locked' : ''}</small></span>
          <span className="style-layer-state">{item.visible ? <Eye size={13} /> : <EyeOff size={13} />}</span>
        </button>)}
        {!layers.length && <p className="scope-note">Add or import artwork to start styling.</p>}
      </div>
    </div>

    {layer && <section className="style-section">
      <div className="section-title"><span>{layer.name}</span>{layer.locked && <LockKeyhole size={14} className="section-muted" />}</div>
      {smartEdit && <p className="edit-notice">Capture or cancel the Smart Bone edit before changing appearance.</p>}
      {layer.locked && <p className="scope-note">This layer is locked. Unlock it in Rig & animate to edit appearance.</p>}
      <fieldset className="property-fields" disabled={editingBlocked}>
        <div className="style-two-column">
          <label className="check-label"><input type="checkbox" checked={layer.visible} onChange={event => updateLayer({ visible: event.target.checked })} /> Visible</label>
          <label className="style-range"><span>Layer opacity <output>{Math.round(layer.opacity * 100)}%</output></span><input type="range" min="0" max="1" step=".01" value={layer.opacity} onChange={event => updateLayer({ opacity: Number(event.target.value) })} /></label>
        </div>
      </fieldset>
    </section>}

    {vector && <section className="style-section vector-style-section">
      <div className="property-subtitle">Vector shapes</div>
      <label className="select-field"><span>Individual shape</span><select value={shape?.id ?? ''} onChange={event => setShapeId(event.target.value)}>
        {!vector.shapes.length && <option value="">No shapes</option>}
        {vector.shapes.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.kind}</option>)}
      </select></label>
      {shape && <fieldset className="property-fields" disabled={editingBlocked}>
        <div className="style-choice-row"><label><span>Fill</span><select value={fillMode} onChange={event => updateShape({ fill: event.target.value === 'none' ? 'none' : colorValue(shape.fill, '#70cabc') })}><option value="color">Color</option><option value="none">None</option></select></label>{fillMode === 'color' && <label className="style-color"><span>Fill color</span><input type="color" value={colorValue(shape.fill, '#70cabc')} onChange={event => updateShape({ fill: event.target.value })} /></label>}</div>
        <div className="style-choice-row"><label><span>Stroke</span><select value={strokeMode} onChange={event => updateShape({ stroke: event.target.value === 'none' ? 'none' : colorValue(shape.stroke, '#173c4a') })}><option value="color">Color</option><option value="none">None</option></select></label>{strokeMode === 'color' && <label className="style-color"><span>Stroke color</span><input type="color" value={colorValue(shape.stroke, '#173c4a')} onChange={event => updateShape({ stroke: event.target.value })} /></label>}</div>
        <label className="style-range"><span>Stroke width <output>{Math.round((shape.strokeWidth ?? 0) * 10) / 10}px</output></span><input type="range" min="0" max="40" step=".5" value={shape.strokeWidth ?? 0} onChange={event => updateShape({ strokeWidth: Number(event.target.value) })} /></label>
        <label className="style-range"><span>Shape opacity <output>{Math.round((shape.opacity ?? 1) * 100)}%</output></span><input type="range" min="0" max="1" step=".01" value={shape.opacity ?? 1} onChange={event => updateShape({ opacity: Number(event.target.value) })} /></label>
      </fieldset>}
    </section>}

    {fileLayer && <section className="style-section image-style-section">
      <div className="section-title"><span><ImageIcon size={14} /> Raster artwork</span></div>
      <p className="scope-note">Flat images do not contain separate clothing regions. Use separate vector/image layers, or replace this complete artwork.</p>
      <fieldset className="property-fields" disabled={editingBlocked || Boolean(smartEdit)}>
        <button className="secondary-button full-button" onClick={() => importInput.current?.click()}>Replace local artwork</button>
        <input ref={importInput} className="hidden-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { const file = event.target.files?.[0]; if (file) replaceArtwork(file); event.currentTarget.value = ''; }} />
      </fieldset>
      <p className="style-footnote">PNG, JPEG, WebP, or GIF · max 8 MB · dimensions, rig mapping, and mesh stay intact. No remote upload.</p>
    </section>}

    <section className="style-section presets-section">
      <div className="section-title"><span><Sparkles size={14} /> Appearance presets</span></div>
      <p className="scope-note">Save a whole rig look or only the selected layer. Applying a preset is one undoable change.</p>
      <div className="preset-save-row"><input value={presetName} maxLength={80} placeholder="Preset name" onChange={event => setPresetName(event.target.value)} /><select value={presetScope} onChange={event => setPresetScope(event.target.value as 'rig' | 'layer')}><option value="rig">Whole rig</option><option value="layer" disabled={!styleLayerId}>Selected layer</option></select></div>
      <button className="secondary-button full-button" disabled={Boolean(smartEdit) || !presetName.trim() || (presetScope === 'layer' && !styleLayerId)} onClick={savePreset}>Save appearance preset</button>
      <div className="preset-list">{presets.map(preset => <div className="preset-row" key={preset.id}><div><strong>{preset.name}</strong><small>{preset.layers?.length ? `${preset.layers.length} layer${preset.layers.length === 1 ? '' : 's'}` : 'Whole rig'}</small></div><button className="mini-text" disabled={Boolean(smartEdit)} onClick={() => applyPreset(preset.id)}>Apply</button><button className="mini-text preset-delete" disabled={Boolean(smartEdit)} onClick={() => deletePreset(preset.id, preset.name)} aria-label={`Delete ${preset.name}`}>×</button></div>)}{!presets.length && <p className="scope-note">No saved appearance presets yet.</p>}</div>
    </section>

    <section className="style-section style-help">
      <div className="section-title"><span>Style help</span><button className="mini-text style-demo-button" disabled={Boolean(smartEdit)} onClick={openStyleDemo}><Sparkles size={12} /> Style demo</button></div>
      <p className="scope-note">Clothing changes work best as separate layers with visibility toggles, or by replacing a complete raster layer. The editor does not segment flattened images, invent hidden pixels, or provide full 3D clothing changes.</p>
    </section>
  </section>;
}
