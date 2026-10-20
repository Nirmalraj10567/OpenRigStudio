import { createId, Rig } from './Rig';
import type { Layer, VectorShape } from './Rig';

/** The metadata slot is deliberately versioned because it is part of the file format. */
export const STYLE_PRESETS_METADATA_KEY = 'style-presets:v1';

const MAX_METADATA_LENGTH = 2_000_000;
const MAX_PRESETS = 128;
const MAX_LAYERS_PER_PRESET = 512;
const MAX_SHAPES_PER_LAYER = 1_024;
const MAX_ID_LENGTH = 256;
const MAX_NAME_LENGTH = 160;
const MAX_SOURCE_LENGTH = 512_000;
const MAX_ARTWORK_SOURCE_LENGTH = 8_000_000;
const MAX_STROKE_WIDTH = 10_000;

/** Appearance of one vector shape. Geometry is intentionally not represented here. */
export interface StyleShapeStyle {
  shapeId: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

/** Image-only appearance data. Dimensions, meshes, and bindings are not captured. */
export interface StyleImageAppearance {
  src?: string;
  color?: string;
}

/** The appearance data captured for one existing layer. */
export interface StylePresetLayer {
  layerId: string;
  visible: boolean;
  opacity: number;
  shapes: StyleShapeStyle[];
  image?: StyleImageAppearance;
}

/** A named, JSON-persisted appearance preset. */
export interface StylePreset {
  id: string;
  name: string;
  layers: StylePresetLayer[];
}

type UnknownRecord = Record<string, unknown>;

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function safeIdentifier(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID_LENGTH) return null;
  // Do not allow names which are hazardous when a caller later uses an ID as a property key.
  if (value === '__proto__' || value === 'prototype' || value === 'constructor') return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

function safeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name || name.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

function safeSource(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_SOURCE_LENGTH) return null;
  // Sources are never interpreted as markup by this module. Still reject control characters
  // so malformed metadata cannot smuggle line breaks into downstream URL/file handling.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

/** Accept only CSS colours that are inert, portable hex values or the SVG `none` keyword. */
function safeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const color = value.trim();
  if (color.toLowerCase() === 'none') return 'none';
  return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : null;
}

function clampedFinite(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedOpacity(value: unknown, fallback = 1): number {
  return clampedFinite(value, 0, 1) ?? fallback;
}

function normalizedStrokeWidth(value: unknown): number | null {
  return clampedFinite(value, 0, MAX_STROKE_WIDTH);
}

function normalizeShape(value: unknown): StyleShapeStyle | null {
  const source = record(value);
  if (!source) return null;
  // `id` is accepted when reading older hand-authored metadata, while new metadata
  // always uses the unambiguous `shapeId` field.
  const shapeId = safeIdentifier(source.shapeId ?? source.id);
  if (!shapeId) return null;

  const shape: StyleShapeStyle = { shapeId };
  if (hasOwn(source, 'fill')) {
    const fill = safeColor(source.fill);
    if (fill !== null) shape.fill = fill;
  }
  if (hasOwn(source, 'stroke')) {
    const stroke = safeColor(source.stroke);
    if (stroke !== null) shape.stroke = stroke;
  }
  if (hasOwn(source, 'strokeWidth')) {
    const strokeWidth = normalizedStrokeWidth(source.strokeWidth);
    if (strokeWidth !== null) shape.strokeWidth = strokeWidth;
  }
  if (hasOwn(source, 'opacity')) {
    const opacity = clampedFinite(source.opacity, 0, 1);
    if (opacity !== null) shape.opacity = opacity;
  }
  return shape;
}

function normalizeImage(value: unknown): StyleImageAppearance | undefined {
  const source = record(value);
  if (!source) return undefined;
  const image: StyleImageAppearance = {};
  if (hasOwn(source, 'src')) {
    const src = safeSource(source.src);
    if (src !== null) image.src = src;
  }
  if (hasOwn(source, 'color')) {
    const color = safeColor(source.color);
    if (color !== null) image.color = color;
  }
  return Object.keys(image).length ? image : undefined;
}

function normalizeLayer(value: unknown): StylePresetLayer | null {
  const source = record(value);
  if (!source) return null;
  // `id` is a compatibility read path only; it is never emitted by this module.
  const layerId = safeIdentifier(source.layerId ?? source.id);
  if (!layerId) return null;

  const shapes: StyleShapeStyle[] = [];
  if (Array.isArray(source.shapes)) {
    const seen = new Set<string>();
    for (const candidate of source.shapes.slice(0, MAX_SHAPES_PER_LAYER)) {
      const shape = normalizeShape(candidate);
      if (shape && !seen.has(shape.shapeId)) {
        seen.add(shape.shapeId);
        shapes.push(shape);
      }
    }
  }

  const layer: StylePresetLayer = {
    layerId,
    visible: typeof source.visible === 'boolean' ? source.visible : true,
    opacity: normalizedOpacity(source.opacity),
    shapes,
  };
  const image = normalizeImage(source.image);
  if (image) layer.image = image;
  return layer;
}

function normalizePreset(value: unknown): StylePreset | null {
  const source = record(value);
  if (!source) return null;
  const id = safeIdentifier(source.id);
  const name = safeName(source.name);
  if (!id || !name || !Array.isArray(source.layers)) return null;

  const layers: StylePresetLayer[] = [];
  const seen = new Set<string>();
  for (const candidate of source.layers.slice(0, MAX_LAYERS_PER_PRESET)) {
    const layer = normalizeLayer(candidate);
    if (layer && !seen.has(layer.layerId)) {
      seen.add(layer.layerId);
      layers.push(layer);
    }
  }
  return { id, name, layers };
}

function parsePresets(rig: Rig): StylePreset[] {
  const raw = rig.metadata?.[STYLE_PRESETS_METADATA_KEY];
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_METADATA_LENGTH) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const result: StylePreset[] = [];
  const seen = new Set<string>();
  for (const candidate of parsed.slice(0, MAX_PRESETS)) {
    const preset = normalizePreset(candidate);
    if (preset && !seen.has(preset.id)) {
      seen.add(preset.id);
      result.push(preset);
    }
  }
  return result;
}

function captureShape(shape: VectorShape): StyleShapeStyle {
  const captured: StyleShapeStyle = { shapeId: shape.id };
  const fill = safeColor(shape.fill);
  const stroke = safeColor(shape.stroke);
  const strokeWidth = normalizedStrokeWidth(shape.strokeWidth);
  const opacity = clampedFinite(shape.opacity, 0, 1);
  if (fill !== null) captured.fill = fill;
  if (stroke !== null) captured.stroke = stroke;
  if (strokeWidth !== null) captured.strokeWidth = strokeWidth;
  if (opacity !== null) captured.opacity = opacity;
  return captured;
}

function captureLayer(layer: Layer): StylePresetLayer {
  const captured: StylePresetLayer = {
    layerId: layer.id,
    visible: typeof layer.visible === 'boolean' ? layer.visible : true,
    opacity: normalizedOpacity(layer.opacity),
    shapes: layer.type === 'vector'
      ? layer.shapes.slice(0, MAX_SHAPES_PER_LAYER).map(captureShape)
      : [],
  };
  if (layer.type === 'image') {
    const image: StyleImageAppearance = {};
    const src = safeSource(layer.src);
    const color = safeColor(layer.color);
    if (src !== null) image.src = src;
    if (color !== null) image.color = color;
    if (Object.keys(image).length) captured.image = image;
  }
  return captured;
}

function compactForMetadata(presets: StylePreset[]): StylePreset[] {
  const normalized = presets
    .map(normalizePreset)
    .filter((preset): preset is StylePreset => Boolean(preset));
  let text = JSON.stringify(normalized);
  if (text.length <= MAX_METADATA_LENGTH) return normalized;

  // Image data can dominate a metadata slot. Keep colour/visibility presets useful by
  // dropping only oversized artwork sources before dropping otherwise valid presets.
  const withoutSources = normalized.map(preset => ({
    ...preset,
    layers: preset.layers.map(layer => layer.image
      ? { ...layer, image: layer.image.color !== undefined ? { color: layer.image.color } : undefined }
      : layer),
  }));
  text = JSON.stringify(withoutSources);
  if (text.length <= MAX_METADATA_LENGTH) return withoutSources;

  // Keep the most recently saved bounded set. The resulting JSON is still normalized,
  // and the final guard guarantees an oversized value is never written.
  let bounded = withoutSources.slice(-MAX_PRESETS);
  while (bounded.length > 0 && JSON.stringify(bounded).length > MAX_METADATA_LENGTH) bounded = bounded.slice(1);
  return bounded;
}

function persistPresets(rig: Rig, presets: StylePreset[]): void {
  const bounded = compactForMetadata(presets);
  const text = JSON.stringify(bounded);
  rig.metadata[STYLE_PRESETS_METADATA_KEY] = text.length <= MAX_METADATA_LENGTH ? text : '[]';
}

function patchShape(shape: VectorShape, style: StyleShapeStyle): void {
  if (style.fill !== undefined) shape.fill = style.fill;
  if (style.stroke !== undefined) shape.stroke = style.stroke;
  if (style.strokeWidth !== undefined) shape.strokeWidth = style.strokeWidth;
  if (style.opacity !== undefined) shape.opacity = style.opacity;
}

/** Return safe, detached preset data. Malformed or oversized metadata returns an empty list. */
export function listStylePresets(rig: Rig): StylePreset[] {
  return parsePresets(rig);
}

/** Save appearance for all layers, or for the explicitly supplied existing layer IDs. */
export function saveStylePreset(rig: Rig, name: string, layerIds?: string[]): string | null {
  const safePresetName = safeName(name);
  if (!safePresetName || (layerIds !== undefined && !Array.isArray(layerIds))) return null;

  const selectedIds = layerIds === undefined
    ? rig.layersInOrder.map(layer => layer.id)
    : [...new Set(layerIds.filter((id): id is string => typeof id === 'string'))];
  const layers: StylePresetLayer[] = [];
  for (const layerId of selectedIds.slice(0, MAX_LAYERS_PER_PRESET)) {
    const layer = rig.layers.get(layerId);
    if (layer) layers.push(captureLayer(layer));
  }

  const current = parsePresets(rig);
  const used = new Set(current.map(preset => preset.id));
  let id = createId('style');
  while (used.has(id)) id = createId('style');
  const preset: StylePreset = { id, name: safePresetName, layers };
  persistPresets(rig, [...current.slice(-(MAX_PRESETS - 1)), preset]);
  return id;
}

/** Apply only appearance to existing, unlocked layers. Missing layers/shapes are skipped. */
export function applyStylePreset(rig: Rig, id: string): number {
  const safeId = safeIdentifier(id);
  if (!safeId) return 0;
  const preset = parsePresets(rig).find(candidate => candidate.id === safeId);
  if (!preset) return 0;

  let applied = 0;
  for (const savedLayer of preset.layers) {
    const layer = rig.layers.get(savedLayer.layerId);
    if (!layer || layer.locked) continue;
    layer.visible = savedLayer.visible;
    layer.opacity = savedLayer.opacity;
    if (layer.type === 'image' && savedLayer.image) {
      if (savedLayer.image.src !== undefined) layer.src = savedLayer.image.src;
      if (savedLayer.image.color !== undefined) layer.color = savedLayer.image.color;
    }
    if (layer.type === 'vector') {
      const shapes = new Map(layer.shapes.map(shape => [shape.id, shape]));
      savedLayer.shapes.forEach(style => {
        const shape = shapes.get(style.shapeId);
        if (shape) patchShape(shape, style);
      });
    }
    applied += 1;
  }
  if (applied) rig.update();
  return applied;
}

/** Remove one persisted preset. Returns false for malformed/missing IDs. */
export function removeStylePreset(rig: Rig, id: string): boolean {
  const safeId = safeIdentifier(id);
  if (!safeId) return false;
  const current = parsePresets(rig);
  const index = current.findIndex(preset => preset.id === safeId);
  if (index < 0) return false;
  current.splice(index, 1);
  persistPresets(rig, current);
  return true;
}

/** Change only an existing vector shape's appearance; geometry and layer transforms remain untouched. */
export function setShapeStyle(
  rig: Rig,
  layerId: string,
  shapeId: string,
  patch: { fill?: string; stroke?: string; strokeWidth?: number; opacity?: number },
): boolean {
  const layer = rig.layers.get(layerId);
  if (!layer || layer.type !== 'vector' || layer.locked || !patch || typeof patch !== 'object') return false;
  const shape = layer.shapes.find(candidate => candidate.id === shapeId);
  if (!shape) return false;

  const next: StyleShapeStyle = { shapeId };
  let hasChange = false;
  const source = patch as unknown as UnknownRecord;
  if (hasOwn(source, 'fill')) {
    const fill = safeColor(source.fill);
    if (fill === null) return false;
    next.fill = fill;
    hasChange = true;
  }
  if (hasOwn(source, 'stroke')) {
    const stroke = safeColor(source.stroke);
    if (stroke === null) return false;
    next.stroke = stroke;
    hasChange = true;
  }
  if (hasOwn(source, 'strokeWidth')) {
    const strokeWidth = normalizedStrokeWidth(source.strokeWidth);
    if (strokeWidth === null) return false;
    next.strokeWidth = strokeWidth;
    hasChange = true;
  }
  if (hasOwn(source, 'opacity')) {
    const opacity = clampedFinite(source.opacity, 0, 1);
    if (opacity === null) return false;
    next.opacity = opacity;
    hasChange = true;
  }
  if (!hasChange) return false;
  patchShape(shape, next);
  rig.update();
  return true;
}

function isLocalRasterDataUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ARTWORK_SOURCE_LENGTH) return false;
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!match) return false;
  const payload = match[2];
  if (payload.length === 0 || payload.length % 4 === 1) return false;
  const padding = payload.length - payload.replace(/=+$/, '').length;
  // Unpadded base64 is accepted, but a padded value must be in a complete quartet.
  return padding === 0 || payload.length % 4 === 0;
}

/** Replace only a local PNG/JPEG/WebP/GIF data URL, preserving all layer identity and geometry. */
export function replaceImageArtwork(rig: Rig, layerId: string, src: string): boolean {
  const layer = rig.layers.get(layerId);
  if (!layer || layer.type !== 'image' || layer.locked || !isLocalRasterDataUrl(src)) return false;
  layer.src = src;
  // Deliberately do not touch width, height, local, mesh, bindings, or IDs.
  rig.update();
  return true;
}
