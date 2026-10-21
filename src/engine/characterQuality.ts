import { Rig } from './Rig';
import { localToWorldPoint } from './math';
import type { CharacterMasterModel, CharacterViewSet, CharacterViewTarget, VectorShape } from './model';

export type CharacterVisualIssueKind = 'joint-gap' | 'pivot-gap' | 'seam' | 'layer-order' | 'master-mismatch';
export type CharacterVisualIssueSeverity = 'warning' | 'error';

export interface CharacterVisualIssue {
  kind: CharacterVisualIssueKind;
  severity: CharacterVisualIssueSeverity;
  viewId: string;
  viewName: string;
  targetId?: string;
  message: string;
  amount?: number;
}

export interface CharacterQualityReport {
  setId: string;
  setName: string;
  checkedViews: number;
  master: { present: boolean; height: number; landmarks: number; limbLengths: number; clothingSlots: number };
  issues: CharacterVisualIssue[];
  summary: { errors: number; warnings: number; passed: boolean };
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type Point = { x: number; y: number };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function include(bounds: Bounds, point: Point): void {
  bounds.minX = Math.min(bounds.minX, point.x); bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxX = Math.max(bounds.maxX, point.x); bounds.maxY = Math.max(bounds.maxY, point.y);
}

function shapeBounds(shape: VectorShape): Bounds | null {
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  if (shape.kind === 'rect') {
    include(bounds, { x: shape.x ?? 0, y: shape.y ?? 0 });
    include(bounds, { x: (shape.x ?? 0) + (shape.width ?? 0), y: (shape.y ?? 0) + (shape.height ?? 0) });
  } else if (shape.kind === 'ellipse') {
    const x = shape.x ?? 0, y = shape.y ?? 0, rx = Math.abs(shape.radiusX ?? 0), ry = Math.abs(shape.radiusY ?? 0);
    include(bounds, { x: x - rx, y: y - ry }); include(bounds, { x: x + rx, y: y + ry });
  } else if (shape.kind === 'polygon' && shape.points?.length) {
    shape.points.forEach(point => include(bounds, point));
  } else if (shape.kind === 'path') {
    // Path strings are intentionally treated as a pivot marker when the path
    // has no explicit bounds. Rect/ellipse/polygon checks still catch most
    // authored joint gaps without pretending to parse arbitrary SVG paths.
    include(bounds, { x: 0, y: 0 });
  }
  return Number.isFinite(bounds.minX) ? bounds : null;
}

function artworkBounds(target: CharacterViewTarget | undefined, layer: ReturnType<Rig['getRenderLayer']>): Bounds | null {
  if (!layer || !target) return null;
  const local: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  if (target.artwork?.type === 'image') {
    include(local, { x: -target.artwork.width / 2, y: -target.artwork.height / 2 });
    include(local, { x: target.artwork.width / 2, y: target.artwork.height / 2 });
  } else {
    const shapes = target.artwork?.type === 'vector' ? target.artwork.shapes : layer.type === 'vector' ? layer.shapes : [];
    shapes.forEach(shape => { const bounds = shapeBounds(shape); if (bounds) { include(local, { x: bounds.minX, y: bounds.minY }); include(local, { x: bounds.maxX, y: bounds.maxY }); } });
    if (!Number.isFinite(local.minX) && layer.type === 'image') {
      include(local, { x: -layer.width / 2, y: -layer.height / 2 }); include(local, { x: layer.width / 2, y: layer.height / 2 });
    }
  }
  if (!Number.isFinite(local.minX)) return null;
  const worldCorners = [
    { x: local.minX, y: local.minY }, { x: local.maxX, y: local.minY },
    { x: local.maxX, y: local.maxY }, { x: local.minX, y: local.maxY },
  ].map(point => localToWorldPoint(layer.world, point));
  const world: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  worldCorners.forEach(point => include(world, point));
  return world;
}

function pointToBoundsDistance(point: Point, bounds: Bounds): number {
  return Math.hypot(Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX), Math.max(bounds.minY - point.y, 0, point.y - bounds.maxY));
}

function masterFor(set: CharacterViewSet): CharacterMasterModel | undefined {
  return set.master;
}

function addLayerOrderIssues(rig: Rig, set: CharacterViewSet, view: CharacterViewSet['views'][number], issues: CharacterVisualIssue[]): void {
  const nearSide = Math.sin(view.angle * Math.PI / 180) < 0 ? 'left' : 'right';
  set.targetIds.forEach(id => {
    const layer = rig.layers.get(id), target = view.targets[id];
    if (!layer || !target) return;
    const name = layer.name.toLowerCase();
    const side = /left/.test(name) ? 'left' : /right/.test(name) ? 'right' : null;
    if (!side || !/arm|hand|leg|shoe|foot|forearm|thigh|shin|sleeve|gaiter|glove|boot/.test(name)) return;
    const expectedDelta = side === nearSide ? 24 : -24;
    const baseline = set.baseline[id]?.zIndex ?? layer.zIndex;
    const actual = target.zIndex ?? baseline;
    if (Math.abs(actual - (baseline + expectedDelta)) > 0.001) issues.push({
      kind: 'layer-order', severity: 'warning', viewId: view.id, viewName: view.name, targetId: id,
      message: `${layer.name} is not arranged for the ${side === nearSide ? 'near' : 'far'} side of this view.`, amount: actual - baseline,
    });
  });
}

function addMasterIssues(set: CharacterViewSet, view: CharacterViewSet['views'][number], issues: CharacterVisualIssue[]): void {
  const master = masterFor(set);
  if (!master) return;
  Object.entries(master.limbLengths).forEach(([name, length]) => {
    const targetId = set.targetIds.find(id => id === name);
    if (!targetId) return;
    const target = view.targets[targetId], actual = target?.length;
    if (actual === undefined || length <= 0) return;
    const delta = Math.abs(actual - length) / length;
    if (delta > .15) issues.push({ kind: 'master-mismatch', severity: 'warning', viewId: view.id, viewName: view.name, targetId, message: `Limb length for ${name} differs from the shared master by ${Math.round(delta * 100)}%.`, amount: delta });
  });
  Object.values(master.clothing).forEach(layerName => {
    const id = set.targetIds.find(targetId => set.baseline[targetId]?.artwork && targetId === layerName);
    if (id && !view.targets[id]?.artwork) issues.push({ kind: 'seam', severity: 'warning', viewId: view.id, viewName: view.name, targetId: id, message: `${layerName} has no view-specific artwork; the setup artwork will be used.` });
  });
}

/** Inspect rendered view poses for visual problems, not just bone graph validity. */
export function inspectCharacterViews(source: Rig, setId: string): CharacterQualityReport {
  const set = source.characterViews.find(item => item.id === setId);
  if (!set) return { setId, setName: 'Missing character', checkedViews: 0, master: { present: false, height: 0, landmarks: 0, limbLengths: 0, clothingSlots: 0 }, issues: [{ kind: 'joint-gap', severity: 'error', viewId: '', viewName: '', message: 'Character view set was not found.' }], summary: { errors: 1, warnings: 0, passed: false } };
  const issues: CharacterVisualIssue[] = [];
  set.views.forEach(view => {
    const rig = new Rig(source.toProject());
    rig.characterAngleOverrides.set(set.id, { frame: rig.timeline.currentFrame, angle: view.angle });
    rig.update();
    for (const bone of rig.bones.values()) {
      if (!bone.parentId || !set.targetIds.includes(bone.id) || !set.targetIds.includes(bone.parentId)) continue;
      const parent = rig.bones.get(bone.parentId), tip = parent && rig.getBoneEnd(parent.id);
      if (!tip) continue;
      const gap = distance(tip, { x: bone.world.x, y: bone.world.y });
      if (gap > 0.5) issues.push({ kind: 'joint-gap', severity: gap > 4 ? 'error' : 'warning', viewId: view.id, viewName: view.name, targetId: bone.id, message: `${bone.name} is ${gap.toFixed(1)}px away from its parent joint.`, amount: gap });
    }
    for (const id of set.targetIds) {
      const target = view.targets[id], layer = rig.getRenderLayer(id), bone = rig.bones.get(layer?.boundBoneId ?? '');
      if (!target || !layer || !bone) continue;
      const bounds = artworkBounds(target, layer);
      if (!bounds) continue;
      const pivotGap = pointToBoundsDistance({ x: bone.world.x, y: bone.world.y }, bounds);
      if (pivotGap > 24) issues.push({ kind: 'pivot-gap', severity: pivotGap > 60 ? 'error' : 'warning', viewId: view.id, viewName: view.name, targetId: id, message: `${layer.name} pivot is ${pivotGap.toFixed(1)}px outside its artwork envelope.`, amount: pivotGap });
    }
    addLayerOrderIssues(rig, set, view, issues);
    addMasterIssues(set, view, issues);
  });
  const errors = issues.filter(issue => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  const master = masterFor(set);
  return { setId: set.id, setName: set.name, checkedViews: set.views.length, master: { present: Boolean(master), height: master?.height ?? 0, landmarks: Object.keys(master?.landmarks ?? {}).length, limbLengths: Object.keys(master?.limbLengths ?? {}).length, clothingSlots: Object.keys(master?.clothing ?? {}).length }, issues, summary: { errors, warnings, passed: errors === 0 } };
}
