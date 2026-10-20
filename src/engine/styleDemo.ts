import { createDemoRig } from './demoRig';
import { createId, Rig } from './Rig';
import type { VectorShape } from './model';
import {
  applyStylePreset,
  saveStylePreset,
  setShapeStyle,
} from './styles';

const SUNSET_COLORS: Record<string, string> = {
  '#263747': '#3b2748',
  '#33978f': '#b75365',
  '#64cfbf': '#f08a7e',
  '#a7f3df': '#ffd6bd',
  '#d08453': '#a85747',
  '#8f643f': '#8e4e57',
  '#b87845': '#c16b50',
  '#bd5e54': '#a64b5a',
  '#d59b62': '#e28b6f',
  '#e5a164': '#db7f5a',
  '#f37b72': '#d95f65',
  '#ffbd71': '#ffae73',
  '#ffedd0': '#ffe1b5',
};

const OCEAN_COLORS: Record<string, string> = {
  '#263747': '#17324d',
  '#33978f': '#167a8c',
  '#64cfbf': '#55c9d7',
  '#a7f3df': '#a8f0f2',
  '#d08453': '#4f8f9f',
  '#8f643f': '#2d7180',
  '#b87845': '#4f9baa',
  '#bd5e54': '#387eab',
  '#d59b62': '#6ab6c3',
  '#e5a164': '#6eb4c3',
  '#f37b72': '#4e9bc2',
  '#ffbd71': '#82c8d3',
  '#ffedd0': '#d7f4f0',
};

function copyShapeForAlternate(shape: VectorShape): VectorShape {
  const originalFill = typeof shape.fill === 'string' ? shape.fill.toLowerCase() : '';
  const vestFill: Record<string, string> = {
    '#64cfbf': '#d59b62',
    '#33978f': '#8f643f',
    '#e5a164': '#b87845',
    '#f37b72': '#bd5e54',
  };
  const fill = vestFill[originalFill] ?? shape.fill;
  return {
    ...shape,
    id: createId('shape'),
    ...(shape.points ? { points: shape.points.map(point => ({ ...point })) } : {}),
    ...(fill !== undefined ? { fill } : {}),
  };
}

function themedColor(value: string | undefined, palette: Record<string, string>): string | undefined {
  if (value === undefined) return undefined;
  return palette[value.toLowerCase()] ?? value;
}

function recolorLayers(rig: Rig, layerIds: string[], palette: Record<string, string>): void {
  for (const layerId of layerIds) {
    const layer = rig.vectors.get(layerId);
    if (!layer) continue;
    for (const shape of layer.shapes) {
      const fill = themedColor(shape.fill, palette);
      const stroke = themedColor(shape.stroke, palette);
      const patch: { fill?: string; stroke?: string } = {};
      if (fill !== undefined && fill !== shape.fill) patch.fill = fill;
      if (stroke !== undefined && stroke !== shape.stroke) patch.stroke = stroke;
      if (Object.keys(patch).length) setShapeStyle(rig, layerId, shape.id, patch);
    }
  }
}

function findClothingLayerIds(rig: Rig, alternateId?: string): string[] {
  const clothingWords = ['jacket', 'trouser', 'gaiter', 'boot', 'sleeve', 'forearm', 'glove'];
  const ids = rig.layersInOrder
    .filter(layer => layer.type === 'vector' && clothingWords.some(word => layer.name.toLowerCase().includes(word)))
    .map(layer => layer.id);
  if (alternateId && !ids.includes(alternateId)) ids.push(alternateId);
  return ids;
}

function addAlternateJacket(rig: Rig): { layerId: string; jacketId: string } | null {
  const jacket = [...rig.vectors.values()].find(layer => layer.name === 'Jacket · chest and satchel');
  if (!jacket) return null;
  const binding = [...rig.bindings.values()].find(item => (item.layerId ?? item.imageId) === jacket.id);
  if (!binding || !rig.bones.has(binding.boneId)) return null;

  const alternateId = rig.addVectorLayer('Vest · alternate jacket', jacket.shapes.map(copyShapeForAlternate));
  const alternate = rig.vectors.get(alternateId);
  if (!alternate) return null;
  // Seed the new layer at the jacket's current world pose. `bind` then computes a
  // pose-preserving offset through the public Rig API; no binding object is copied.
  alternate.local = { ...jacket.world };
  alternate.zIndex = jacket.zIndex;
  alternate.visible = false;
  rig.update();
  if (!rig.bind(alternateId, binding.boneId)) {
    rig.remove(alternateId);
    return null;
  }
  return { layerId: alternateId, jacketId: jacket.id };
}

/**
 * Build the articulated demo with appearance presets. The three named presets are
 * color-only clothing themes; the optional Jacket/Vest presets additionally toggle
 * the real alternate vector layer by visibility.
 */
export function createStyleDemo(): Rig {
  const rig = createDemoRig();
  const alternate = addAlternateJacket(rig);
  const clothingIds = findClothingLayerIds(rig, alternate?.layerId);
  const originalId = saveStylePreset(rig, 'Original', clothingIds);

  recolorLayers(rig, clothingIds, SUNSET_COLORS);
  saveStylePreset(rig, 'Sunset', clothingIds);
  if (originalId) applyStylePreset(rig, originalId);
  recolorLayers(rig, clothingIds, OCEAN_COLORS);
  saveStylePreset(rig, 'Ocean', clothingIds);

  if (alternate && originalId) {
    // Wardrobe presets reuse the same appearance records and differ only in layer
    // visibility. This does not alter the shared bone, geometry, or mesh binding.
    applyStylePreset(rig, originalId);
    const jacket = rig.layers.get(alternate.jacketId);
    const vest = rig.layers.get(alternate.layerId);
    if (jacket && vest) {
      jacket.visible = true;
      vest.visible = false;
      rig.update();
      saveStylePreset(rig, 'Jacket', clothingIds);
      jacket.visible = false;
      vest.visible = true;
      rig.update();
      saveStylePreset(rig, 'Vest', clothingIds);
    }
  }

  if (originalId) applyStylePreset(rig, originalId);
  rig.metadata.styleDemoMode = alternate ? 'color-and-wardrobe' : 'color-only';
  rig.metadata.styleDemoNotes = alternate
    ? 'Original, Sunset, and Ocean recolor clothing only; Jacket and Vest presets toggle the alternate bound vector layer. Skin and eyes are excluded.'
    : 'Original, Sunset, and Ocean are color-only clothing presets. Skin and eyes are excluded.';
  rig.update();
  return rig;
}
