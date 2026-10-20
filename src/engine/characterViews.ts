import { sampleTrack, upsertKeyframe } from './animation';
import { createId } from './Rig';
import type { Rig } from './Rig';
import { identity, lerpAngle } from './math';
import type { CharacterView, CharacterViewSet, CharacterViewTarget, SerializableValue, ViewArtwork, VectorShape } from './model';

export const REFERENCE_VIEWS = [
  { angle: -180, name: 'Back' }, { angle: -135, name: 'Back Side' },
  { angle: -90, name: 'Side' }, { angle: -45, name: 'Front Side' }, { angle: 0, name: 'Front' },
];
export const FULL_TURN_VIEWS = [...REFERENCE_VIEWS, { angle: 45, name: 'Front Side · right' }, { angle: 90, name: 'Side · right' }, { angle: 135, name: 'Back Side · right' }];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
export const wrapViewAngle = (angle: number) => ((angle + 180) % 360 + 360) % 360 - 180;
export const isCharacterViewTarget = (rig: Pick<Rig, 'characterViews'>, id: string) => rig.characterViews.some(set => set.id === id);

export function normalizeViewArtwork(value: unknown): ViewArtwork | undefined {
  if (!record(value)) return undefined;
  if (value.type === 'image' && typeof value.src === 'string' && (!value.src || /^data:image\//i.test(value.src))) {
    return { type: 'image', src: value.src, width: Math.max(1, Math.min(8192, finite(value.width, 100))), height: Math.max(1, Math.min(8192, finite(value.height, 100))), color: typeof value.color === 'string' ? value.color : '#83cebd' };
  }
  if (value.type === 'vector' && Array.isArray(value.shapes)) {
    const shapes = value.shapes.slice(0, 2000).filter(shape => record(shape) && ['ellipse', 'rect', 'polygon', 'path'].includes(String(shape.kind))
      && ['x', 'y', 'width', 'height', 'radiusX', 'radiusY', 'strokeWidth', 'opacity'].every(key => shape[key] === undefined || typeof shape[key] === 'number' && Number.isFinite(shape[key]))
      && (!shape.points || Array.isArray(shape.points) && shape.points.every(point => record(point) && typeof point.x === 'number' && Number.isFinite(point.x) && typeof point.y === 'number' && Number.isFinite(point.y)))
      && (!shape.d || typeof shape.d === 'string')) as unknown as VectorShape[];
    return { type: 'vector', shapes: clone(shapes) };
  }
  return undefined;
}

function normalizeTarget(value: unknown): CharacterViewTarget | null {
  if (!record(value) || !record(value.local)) return null;
  const local = identity();
  for (const key of Object.keys(local) as Array<keyof typeof local>) {
    if (typeof value.local[key] !== 'number' || !Number.isFinite(value.local[key])) return null;
    local[key] = value.local[key] as number;
  }
  const artwork = normalizeViewArtwork(value.artwork);
  const mesh = Array.isArray(value.mesh) && value.mesh.every(point => record(point) && Number.isFinite(point.x) && Number.isFinite(point.y)) ? clone(value.mesh) as CharacterViewTarget['mesh'] : undefined;
  return { local, ...(typeof value.opacity === 'number' ? { opacity: Math.max(0, Math.min(1, finite(value.opacity, 1))) } : {}),
    ...(typeof value.visible === 'boolean' ? { visible: value.visible } : {}), ...(typeof value.zIndex === 'number' ? { zIndex: finite(value.zIndex, 0) } : {}),
    ...(typeof value.length === 'number' ? { length: Math.max(0, finite(value.length, 0)) } : {}), ...(artwork ? { artwork } : {}), ...(mesh ? { mesh } : {}) };
}

export function normalizeCharacterViews(value: unknown, validIds: Set<string>): CharacterViewSet[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>(), assigned = new Set<string>();
  return value.slice(0, 32).flatMap(raw => {
    if (!record(raw) || typeof raw.id !== 'string' || !raw.id || ids.has(raw.id) || validIds.has(raw.id) || !record(raw.baseline) || !Array.isArray(raw.targetIds) || !Array.isArray(raw.views)) return [];
    const targetIds = [...new Set(raw.targetIds.filter((id): id is string => typeof id === 'string' && validIds.has(id) && !assigned.has(id)))];
    const baseline: Record<string, CharacterViewTarget> = {};
    targetIds.forEach(id => { const target = normalizeTarget((raw.baseline as Record<string, unknown>)[id]); if (target) baseline[id] = target; });
    const targets = targetIds.filter(id => baseline[id]);
    if (!targets.length) return [];
    const angles = new Set<number>(), viewIds = new Set<string>();
    const views = raw.views.slice(0, 32).flatMap(item => {
      if (!record(item) || typeof item.id !== 'string' || !item.id || viewIds.has(item.id) || typeof item.angle !== 'number' || !Number.isFinite(item.angle) || !record(item.targets)) return [];
      const angle = wrapViewAngle(item.angle);
      if (angles.has(angle)) return [];
      angles.add(angle); viewIds.add(item.id);
      const states = Object.fromEntries(targets.map(id => [id, normalizeTarget((item.targets as Record<string, unknown>)[id]) ?? clone(baseline[id])]));
      return [{ id: item.id, name: typeof item.name === 'string' ? item.name.slice(0, 80) : `${angle}°`, angle, targets: states }];
    }).sort((a, b) => a.angle - b.angle);
    if (!views.length) return [];
    ids.add(raw.id); targets.forEach(id => assigned.add(id));
    return [{ id: raw.id, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 80) : 'Character', enabled: raw.enabled !== false,
      angle: Math.max(-3600, Math.min(3600, finite(raw.angle, 0))), wrap: raw.wrap !== false, interpolate: raw.interpolate !== false, targetIds: targets, baseline, views }];
  });
}

export function characterViewAngle(rig: Rig, id: string): number {
  const set = rig.characterViews.find(item => item.id === id);
  if (!set) return 0;
  const override = rig.characterAngleOverrides.get(id);
  if (override?.frame === rig.timeline.currentFrame) return override.angle;
  const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  const track = clip?.tracks.find(item => item.targetId === id && item.property === 'viewAngle');
  const value = track && sampleTrack(track, rig.timeline.currentFrame);
  return typeof value === 'number' && Number.isFinite(value) ? value : set.angle;
}

export function sampleCharacterView(set: CharacterViewSet, input: number) {
  const views = [...set.views].sort((a, b) => a.angle - b.angle);
  if (!views.length) return null;
  let angle = set.wrap ? wrapViewAngle(input) : Math.min(views[views.length - 1].angle, Math.max(views[0].angle, input));
  const exact = views.find(view => Math.abs(view.angle - angle) < 1e-8);
  if (exact || views.length === 1) { const view = exact ?? views[0]; return { angle, left: view, right: view, mix: 0, nearest: view }; }
  let right = views.find(view => view.angle > angle) ?? views[0];
  let left = views[(views.indexOf(right) - 1 + views.length) % views.length];
  let a = left.angle, b = right.angle;
  if (b <= a) { b += 360; if (angle < a) angle += 360; }
  const mix = Math.min(1, Math.max(0, (angle - a) / Math.max(1e-8, b - a)));
  return { angle: set.wrap ? wrapViewAngle(angle) : angle, left, right, mix, nearest: mix <= .5 ? left : right };
}

export interface EvaluatedViewTarget { baseline: CharacterViewTarget; target: CharacterViewTarget }
export function evaluateCharacterViews(rig: Rig): Map<string, EvaluatedViewTarget> {
  const result = new Map<string, EvaluatedViewTarget>();
  if (rig.smartEditingActionId) return result;
  for (const set of rig.characterViews) {
    if (!set.enabled) continue;
    const sample = sampleCharacterView(set, characterViewAngle(rig, set.id));
    if (!sample) continue;
    for (const id of set.targetIds) {
      const baseline = set.baseline[id];
      if (!baseline || result.has(id) || !rig.bones.has(id) && !rig.layers.has(id)) continue;
      const a = sample.left.targets[id] ?? baseline, b = sample.right.targets[id] ?? baseline;
      const nearest = sample.nearest.targets[id] ?? baseline;
      const t = set.interpolate ? sample.mix : sample.nearest === sample.left ? 0 : 1;
      const local = { ...a.local };
      for (const key of Object.keys(local) as Array<keyof typeof local>) local[key] = key === 'rotation' ? lerpAngle(a.local[key], b.local[key], t) : a.local[key] + (b.local[key] - a.local[key]) * t;
      const target: CharacterViewTarget = { ...nearest, local };
      if (a.opacity !== undefined && b.opacity !== undefined) target.opacity = a.opacity + (b.opacity - a.opacity) * t;
      if (a.length !== undefined && b.length !== undefined) target.length = a.length + (b.length - a.length) * t;
      if (a.mesh && b.mesh && a.mesh.length === b.mesh.length) target.mesh = a.mesh.map((p, index) => ({ x: p.x + (b.mesh![index].x - p.x) * t, y: p.y + (b.mesh![index].y - p.y) * t }));
      result.set(id, { baseline, target });
    }
  }
  return result;
}

export function captureCharacterTarget(rig: Rig, id: string): CharacterViewTarget | null {
  const target = rig.bones.get(id) ?? rig.layers.get(id);
  if (!target) return null;
  const layer = rig.layers.get(id);
  return { local: { ...target.local }, ...(rig.bones.has(id) ? { length: rig.bones.get(id)!.length } : {}),
    ...(layer ? { opacity: layer.opacity, visible: layer.visible, zIndex: layer.zIndex,
      artwork: layer.type === 'image' ? { type: 'image', src: layer.src, width: layer.width, height: layer.height, color: layer.color } : { type: 'vector', shapes: clone(layer.shapes) },
      ...(layer.mesh ? { mesh: layer.mesh.vertices.map(vertex => ({ x: vertex.x, y: vertex.y })) } : {}) } : {}) };
}

export function addCharacterViewSet(rig: Rig, name: string, ids: string[]): string | null {
  if (rig.characterViews.length >= 32) return null;
  const assigned = new Set(rig.characterViews.flatMap(set => set.targetIds));
  const targetIds = [...new Set(ids)].filter(id => !assigned.has(id) && (rig.bones.has(id) || rig.layers.has(id)));
  const baseline = Object.fromEntries(targetIds.flatMap(id => { const state = captureCharacterTarget(rig, id); return state ? [[id, state]] : []; }));
  if (!targetIds.length) return null;
  const id = createId('character');
  rig.characterViews.push({ id, name: name.trim() || 'Character', enabled: true, angle: 0, wrap: true, interpolate: true, targetIds, baseline,
    views: [{ id: createId('view'), name: 'Front', angle: 0, targets: clone(baseline) }] });
  rig.update(); return id;
}

export function addCharacterView(rig: Rig, setId: string, angle: number, name: string, sourceId?: string): string | null {
  const set = rig.characterViews.find(item => item.id === setId);
  if (!set || !Number.isFinite(angle) || set.views.length >= 32) return null;
  const normalized = wrapViewAngle(angle);
  if (set.views.some(view => view.angle === normalized)) return null;
  const source = set.views.find(view => view.id === sourceId) ?? sampleCharacterView(set, characterViewAngle(rig, setId))?.nearest;
  const id = createId('view');
  set.views.push({ id, name: name.trim() || `${normalized}°`, angle: normalized, targets: clone(source?.targets ?? set.baseline) });
  set.views.sort((a, b) => a.angle - b.angle); rig.update(); return id;
}

export function removeCharacterViewSet(rig: Rig, id: string): void {
  rig.characterViews = rig.characterViews.filter(set => set.id !== id);
  rig.animations.forEach(clip => { clip.tracks = clip.tracks.filter(track => track.targetId !== id); });
  rig.characterAngleOverrides.delete(id); rig.update();
}

export function addCharacterViewParts(rig: Rig, setId: string, ids: string[]): number {
  const set = rig.characterViews.find(item => item.id === setId);
  if (!set) return 0;
  const assigned = new Set(rig.characterViews.flatMap(item => item.targetIds));
  let added = 0;
  for (const id of new Set(ids)) {
    if (assigned.has(id)) continue;
    const target = captureCharacterTarget(rig, id);
    if (!target) continue;
    set.targetIds.push(id); set.baseline[id] = clone(target);
    set.views.forEach(view => { view.targets[id] = clone(target); });
    assigned.add(id); added++;
  }
  rig.update(); return added;
}

export function removeCharacterViewPart(rig: Rig, setId: string, id: string): boolean {
  const set = rig.characterViews.find(item => item.id === setId);
  if (!set || set.targetIds.length <= 1 || !set.targetIds.includes(id)) return false;
  set.targetIds = set.targetIds.filter(targetId => targetId !== id);
  delete set.baseline[id]; set.views.forEach(view => { delete view.targets[id]; });
  rig.update(); return true;
}

export function updateCharacterViewTarget(rig: Rig, setId: string, viewId: string, targetId: string, patch: Partial<CharacterViewTarget>): boolean {
  const set = rig.characterViews.find(item => item.id === setId), view = set?.views.find(item => item.id === viewId);
  if (!view || !set?.targetIds.includes(targetId)) return false;
  const old = view.targets[targetId] ?? set.baseline[targetId];
  const target = normalizeTarget({ ...old, ...patch, local: { ...old.local, ...patch.local } });
  if (!target) return false;
  view.targets[targetId] = target; rig.update(); return true;
}

export function setCharacterViewAngle(rig: Rig, id: string, angle: number, autoKey: boolean, explicitKey = false): void {
  const set = rig.characterViews.find(item => item.id === id);
  if (!set || !Number.isFinite(angle)) return;
  const value = Math.max(-3600, Math.min(3600, angle)), frame = Math.max(0, Math.round(rig.timeline.currentFrame));
  let clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  let track = clip?.tracks.find(item => item.targetId === id && item.property === 'viewAngle');
  if (explicitKey || autoKey && frame > 0 || frame === 0 && track) {
    if (!clip) {
      clip = { id: createId('animation'), name: 'Character turns', fps: rig.timeline.fps, startFrame: rig.timeline.startFrame, endFrame: rig.timeline.endFrame, tracks: [] };
      rig.animations.push(clip); rig.setTimeline({ activeAnimationId: clip.id });
    }
    if (!track) { track = { id: createId('track'), targetId: id, property: 'viewAngle', keyframes: [] }; clip.tracks.push(track); }
    if (!track.keyframes.length && frame > 0) track.keyframes.push({ id: createId('key'), frame: 0, value: set.angle, easing: 'linear' });
    Object.assign(track, upsertKeyframe(track, { id: track.keyframes.find(key => key.frame === frame)?.id ?? createId('key'), frame, value: value as SerializableValue, easing: track.keyframes.find(key => key.frame === frame)?.easing ?? 'linear' }));
    clip.endFrame = Math.max(clip.endFrame, frame);
  }
  if (frame === 0 || !autoKey && !explicitKey) set.angle = value;
  rig.characterAngleOverrides.set(id, { frame: rig.timeline.currentFrame, angle: value }); rig.update();
}
