import type { Bone, Layer, Rig, VectorLayer } from './Rig';
import { localToWorldPoint } from './math';

export type AlignmentCommand =
  | 'left'
  | 'center-x'
  | 'right'
  | 'top'
  | 'center-y'
  | 'bottom'
  | 'distribute-x'
  | 'distribute-y';

export type AlignmentTarget = 'canvas' | 'selection' | 'primary';

export type WorldBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const emptyBounds = (): WorldBounds => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

function includePoint(bounds: WorldBounds, point: { x: number; y: number }) {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
}

function includeBounds(target: WorldBounds, source: WorldBounds | null) {
  if (!source) return;
  includePoint(target, { x: source.minX, y: source.minY });
  includePoint(target, { x: source.maxX, y: source.maxY });
}

function vectorLocalBounds(layer: VectorLayer): WorldBounds {
  const bounds = emptyBounds();
  layer.shapes.forEach((shape) => {
    if (shape.kind === 'ellipse') {
      const x = shape.x ?? 0;
      const y = shape.y ?? 0;
      const radiusX = Math.abs(shape.radiusX ?? 1);
      const radiusY = Math.abs(shape.radiusY ?? 1);
      includePoint(bounds, { x: x - radiusX, y: y - radiusY });
      includePoint(bounds, { x: x + radiusX, y: y + radiusY });
      return;
    }
    if (shape.kind === 'polygon') {
      (shape.points ?? []).forEach((point) => includePoint(bounds, point));
      return;
    }
    if (shape.kind === 'path') {
      // Imported paths may contain mixed SVG commands. Numeric coordinates are
      // a conservative, dependency-free bound for alignment and snapping.
      const numbers = shape.d?.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
      for (let index = 0; index + 1 < numbers.length; index += 2) {
        includePoint(bounds, { x: numbers[index], y: numbers[index + 1] });
      }
      return;
    }
    const x = shape.x ?? 0;
    const y = shape.y ?? 0;
    const width = shape.width ?? 0;
    const height = shape.height ?? 0;
    includePoint(bounds, { x, y });
    includePoint(bounds, { x: x + width, y: y + height });
  });
  if (!Number.isFinite(bounds.minX)) return { minX: -90, minY: -90, maxX: 90, maxY: 90 };
  return bounds;
}

function layerLocalPoints(layer: Layer): Array<{ x: number; y: number }> {
  if (layer.mesh) {
    const vertices = layer.mesh.vertices;
    return vertices.length ? vertices.map((vertex) => ({ x: vertex.x, y: vertex.y })) : [];
  }
  if (layer.type === 'image') {
    return [
      { x: -layer.width / 2, y: -layer.height / 2 },
      { x: layer.width / 2, y: -layer.height / 2 },
      { x: layer.width / 2, y: layer.height / 2 },
      { x: -layer.width / 2, y: layer.height / 2 },
    ];
  }
  const local = vectorLocalBounds(layer);
  return [
    { x: local.minX, y: local.minY },
    { x: local.maxX, y: local.minY },
    { x: local.maxX, y: local.maxY },
    { x: local.minX, y: local.maxY },
  ];
}

function boneBounds(bone: Bone, rig: Rig): WorldBounds {
  const bounds = emptyBounds();
  includePoint(bounds, bone.world);
  const end = rig.getBoneEnd(bone.id);
  if (end) includePoint(bounds, end);
  return bounds;
}

/** Returns a world-space axis-aligned bound for an artwork layer or bone. */
export function objectBounds(rig: Rig, id: string): WorldBounds | null {
  const layer = rig.layers.get(id);
  if (layer) {
    const bounds = emptyBounds();
    if (layer.mesh) {
      rig.getMeshVertices(id).forEach((point) => includePoint(bounds, point));
    } else {
      layerLocalPoints(layer).forEach((point) => includePoint(bounds, localToWorldPoint(layer.world, point)));
    }
    return Number.isFinite(bounds.minX) ? bounds : null;
  }
  const bone = rig.bones.get(id);
  return bone ? boneBounds(bone, rig) : null;
}

export function unionBounds(rig: Rig, ids: string[]): WorldBounds | null {
  const bounds = emptyBounds();
  ids.forEach((id) => includeBounds(bounds, objectBounds(rig, id)));
  return Number.isFinite(bounds.minX) ? bounds : null;
}

export function boundsCenter(bounds: WorldBounds): { x: number; y: number } {
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

export function canvasBounds(rig: Rig): WorldBounds {
  return { minX: 0, minY: 0, maxX: rig.canvas.width, maxY: rig.canvas.height };
}

export function alignmentOffset(command: AlignmentCommand, bounds: WorldBounds, target: WorldBounds): { x: number; y: number } {
  switch (command) {
    case 'left': return { x: target.minX - bounds.minX, y: 0 };
    case 'center-x': return { x: (target.minX + target.maxX - bounds.minX - bounds.maxX) / 2, y: 0 };
    case 'right': return { x: target.maxX - bounds.maxX, y: 0 };
    case 'top': return { x: 0, y: target.minY - bounds.minY };
    case 'center-y': return { x: 0, y: (target.minY + target.maxY - bounds.minY - bounds.maxY) / 2 };
    case 'bottom': return { x: 0, y: target.maxY - bounds.maxY };
    default: return { x: 0, y: 0 };
  }
}
