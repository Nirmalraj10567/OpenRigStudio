import { sampleTrack, upsertKeyframe } from './animation';
import { compose, identity, localToWorldPoint, worldToLocalPoint } from './math';
import type { Point2D, Transform2D } from './math';
import type { BoneConstraint, BoneConstraintType, BoneInfluence, ConstraintKeyframe, SerializableValue } from './model';
import type { Rig } from './Rig';

export const CONSTRAINT_TYPES: readonly BoneConstraintType[] = ['angle', 'translation', 'scale', 'distance', 'direction', 'pin', 'target', 'parent', 'squashStretch'];
const NUMBERS = ['weight', 'priority', 'minAngle', 'maxAngle', 'minX', 'maxX', 'minY', 'maxY', 'minScaleX', 'maxScaleX', 'minScaleY', 'maxScaleY', 'minDistance', 'maxDistance', 'directionAngle', 'pinX', 'pinY', 'minStretch', 'maxStretch', 'parentInfluence', 'positionInfluence', 'rotationInfluence', 'scaleInfluence', 'falloff', 'chainLength'] as const;
const FLAGS = ['enabled', 'preserveArea', 'affectChildren', 'maintainOffset'] as const;
const CHANNELS = ['x', 'y', 'rotation', 'scaleX', 'scaleY'] as const;
const EASINGS = ['linear', 'smooth', 'step', 'ease-in', 'ease-out', 'ease-in-out'];
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
let constraintSequence = 0;
const createId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(++constraintSequence).toString(36)}`;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const angleDelta = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const distance = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);
const isLimit = (c: BoneConstraint) => ['angle', 'translation', 'scale'].includes(c.type);
export const isConstraintTarget = (rig: Pick<Rig, 'constraints'>, id: string) => rig.constraints.some(c => c.id === id);

export interface ConstraintDebugRecord {
  constraintId: string;
  sourceBoneId: string;
  targetBoneId?: string;
  type: BoneConstraintType;
  active: boolean;
  weight: number;
  /** Remaining positional, angular (degrees), or scale error after the solve. */
  error: number;
  unit: 'px' | '°' | 'scale';
  currentPoint?: Point2D;
  targetPoint?: Point2D;
  desiredAngle?: number;
  limitAngles?: { min: number; max: number };
  message: string;
}

export function normalizeBoneInfluence(value: unknown): BoneInfluence | undefined {
  if (!record(value)) return undefined;
  return { radius: clamp(finite(value.radius, 100), .001, 100000), falloff: clamp(finite(value.falloff, 2), .1, 10), strength: clamp(finite(value.strength, 1), 0, 10) };
}

/** No influence metadata retains the legacy inverse-square auto-weight curve. */
export function boneInfluenceWeight(distanceSquared: number, influence?: BoneInfluence): number {
  if (!influence) return 1 / Math.max(1e-6, distanceSquared);
  const t = Math.max(0, 1 - Math.sqrt(Math.max(0, distanceSquared)) / influence.radius);
  return influence.strength * t ** influence.falloff;
}

function normalizeKeys(value: unknown): ConstraintKeyframe[] {
  if (!Array.isArray(value)) return [];
  const frames = new Map<number, ConstraintKeyframe>();
  value.slice(0, 10000).forEach(raw => {
    if (!record(raw) || typeof raw.frame !== 'number' || !Number.isFinite(raw.frame) || raw.frame < 0 || raw.frame > 120000) return;
    const frame = Math.round(raw.frame);
    frames.set(frame, { id: typeof raw.id === 'string' ? raw.id : createId('constraint-key'), frame, weight: clamp(finite(raw.weight, 1), 0, 1),
      ...(typeof raw.enabled === 'boolean' ? { enabled: raw.enabled } : {}), easing: EASINGS.includes(String(raw.easing)) ? raw.easing as ConstraintKeyframe['easing'] : 'linear' });
  });
  return [...frames.values()].sort((a, b) => a.frame - b.frame);
}

export function normalizeConstraints(value: unknown, validBoneIds: Set<string>): BoneConstraint[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.slice(0, 256).flatMap(raw => {
    if (!record(raw) || typeof raw.id !== 'string' || !raw.id || ids.has(raw.id) || validBoneIds.has(raw.id)
      || typeof raw.sourceBoneId !== 'string' || !validBoneIds.has(raw.sourceBoneId) || !CONSTRAINT_TYPES.includes(raw.type as BoneConstraintType)) return [];
    ids.add(raw.id);
    const numbers = Object.fromEntries(NUMBERS.flatMap(key => typeof raw[key] === 'number' && Number.isFinite(raw[key]) ? [[key, raw[key]]] : []));
    const offset = record(raw.offset) && CHANNELS.every(key => typeof (raw.offset as Record<string, unknown>)[key] === 'number' && Number.isFinite((raw.offset as Record<string, unknown>)[key])) ? { ...raw.offset } as Transform2D : identity();
    const target = typeof raw.targetBoneId === 'string' && raw.targetBoneId !== raw.sourceBoneId && validBoneIds.has(raw.targetBoneId) ? raw.targetBoneId : undefined;
    return [{ ...numbers, id: raw.id, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 100) : `${raw.type} constraint`, type: raw.type as BoneConstraintType,
      enabled: raw.enabled !== false, sourceBoneId: raw.sourceBoneId, ...(target ? { targetBoneId: target } : {}),
      weight: clamp(finite(raw.weight, 1), 0, 1), mix: raw.mix === 'additive' ? 'additive' as const : 'replace' as const, priority: clamp(Math.round(finite(raw.priority, 0)), -1000, 1000),
      parentInfluence: clamp(finite(raw.parentInfluence, 1), 0, 1), positionInfluence: clamp(finite(raw.positionInfluence, 1), 0, 1), rotationInfluence: clamp(finite(raw.rotationInfluence, 1), 0, 1), scaleInfluence: clamp(finite(raw.scaleInfluence, 1), 0, 1),
      affectChildren: raw.affectChildren === true, falloff: clamp(finite(raw.falloff, .75), 0, 1), preserveArea: raw.preserveArea !== false, maintainOffset: raw.maintainOffset !== false, offset,
      anchor: raw.anchor === 'tip' ? 'tip' as const : 'origin' as const, targetMode: raw.targetMode === 'ik' ? 'ik' as const : 'aim' as const,
      chainLength: clamp(Math.floor(finite(raw.chainLength, 2)), 1, 64), keyframes: normalizeKeys(raw.keyframes) }];
  });
}

export function defaultConstraint(type: BoneConstraintType, sourceBoneId: string, targetBoneId?: string): BoneConstraint {
  return { id: createId('constraint'), name: `${type} constraint`, type, enabled: true, sourceBoneId, targetBoneId, weight: 1, mix: 'replace', priority: 0,
    parentInfluence: 1, positionInfluence: 1, rotationInfluence: 1, scaleInfluence: 1, maintainOffset: true, offset: identity(), preserveArea: true,
    affectChildren: false, falloff: .75, anchor: 'origin', targetMode: 'aim', chainLength: 2, keyframes: [] };
}

export function captureConstraintOffset(rig: Rig, id: string): boolean {
  const c = rig.constraints.find(item => item.id === id), source = c && rig.bones.get(c.sourceBoneId), target = c?.targetBoneId && rig.bones.get(c.targetBoneId);
  if (!c || !source || !target) return false;
  const position = worldToLocalPoint(target.world, source.world);
  if (!position) return false;
  c.offset = { ...position, rotation: source.world.rotation - target.world.rotation, scaleX: source.world.scaleX / target.world.scaleX, scaleY: source.world.scaleY / target.world.scaleY };
  return true;
}

export function createConstraint(rig: Rig, type: BoneConstraintType, sourceBoneId: string, targetBoneId?: string): string | null {
  if (rig.smartEditingActionId || !CONSTRAINT_TYPES.includes(type) || !rig.bones.has(sourceBoneId) || targetBoneId && (!rig.bones.has(targetBoneId) || sourceBoneId === targetBoneId) || rig.constraints.length >= 256) return null;
  rig.update();
  const c = defaultConstraint(type, sourceBoneId, targetBoneId), source = rig.bones.get(sourceBoneId)!;
  const local = rig.getConstraintBaseLocal(sourceBoneId);
  if (type === 'angle') { c.minAngle = local.rotation * 180 / Math.PI - 90; c.maxAngle = local.rotation * 180 / Math.PI + 90; }
  if (type === 'translation') { c.minX = local.x - 50; c.maxX = local.x + 50; c.minY = local.y - 50; c.maxY = local.y + 50; }
  if (type === 'scale') { c.minScaleX = .25; c.maxScaleX = 3; c.minScaleY = .25; c.maxScaleY = 3; }
  if (type === 'pin' || type === 'distance') { c.pinX = source.world.x; c.pinY = source.world.y; }
  if (type === 'distance') { c.minDistance = 0; c.maxDistance = targetBoneId ? distance(source.world, rig.bones.get(targetBoneId)!.world) : source.length; }
  if (type === 'direction') c.directionAngle = source.world.rotation * 180 / Math.PI;
  if (type === 'squashStretch') { c.minStretch = .5; c.maxStretch = 2; }
  rig.constraints.push(c);
  if (type === 'parent' && targetBoneId) captureConstraintOffset(rig, c.id);
  rig.update(); return c.id;
}

export function updateConstraint(rig: Rig, id: string, patch: Partial<BoneConstraint>): boolean {
  const c = rig.constraints.find(item => item.id === id);
  if (!c || rig.smartEditingActionId || patch.id !== undefined && patch.id !== id) return false;
  const next = { ...c, ...patch };
  if (!rig.bones.has(next.sourceBoneId) || next.targetBoneId && (!rig.bones.has(next.targetBoneId) || next.targetBoneId === next.sourceBoneId)) return false;
  if (NUMBERS.some(key => next[key] !== undefined && !Number.isFinite(next[key]))) return false;
  const normalized = normalizeConstraints([next], new Set(rig.bones.keys()))[0];
  if (!normalized) return false;
  Object.assign(c, normalized);
  if (patch.targetBoneId && c.type === 'parent' && c.maintainOffset) captureConstraintOffset(rig, id);
  rig.constraintOverrides.set(id, { frame: rig.timeline.currentFrame, values: constraintKeyValue(c) });
  rig.update(); return true;
}

export function removeConstraint(rig: Rig, id: string): boolean {
  if (rig.smartEditingActionId || !isConstraintTarget(rig, id)) return false;
  rig.constraints = rig.constraints.filter(c => c.id !== id);
  rig.animations.forEach(clip => { clip.tracks = clip.tracks.filter(t => t.targetId !== id); });
  rig.constraintOverrides.delete(id); rig.update(); return true;
}

/** Ordinary animation channels make settings keys editable by the shared timeline. */
export function constraintKeyValue(c: BoneConstraint): SerializableValue {
  const value: Record<string, SerializableValue> = {};
  NUMBERS.forEach(key => { value[key] = c[key] ?? null; });
  FLAGS.forEach(key => { value[key] = c[key] ?? false; });
  value.offset = { ...(c.offset ?? identity()) };
  return value;
}

export function recordConstraintKey(rig: Rig, id: string, frame = rig.timeline.currentFrame): boolean {
  const c = rig.constraints.find(item => item.id === id);
  if (!c || rig.smartEditingActionId || !Number.isFinite(frame) || frame < 0 || frame > 120000) return false;
  let clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  if (!clip) {
    clip = { id: createId('animation'), name: 'Constraint animation', fps: rig.timeline.fps, startFrame: rig.timeline.startFrame, endFrame: rig.timeline.endFrame, tracks: [] };
    rig.animations.push(clip); rig.setTimeline({ activeAnimationId: clip.id });
  }
  let track = clip.tracks.find(t => t.targetId === id && t.property === 'constraint');
  if (!track) { track = { id: createId('track'), targetId: id, property: 'constraint', keyframes: [] }; clip.tracks.push(track); }
  const rounded = Math.round(frame);
  Object.assign(track, upsertKeyframe(track, { id: track.keyframes.find(k => k.frame === rounded)?.id ?? createId('key'), frame: rounded, value: constraintKeyValue(c), easing: 'linear' }));
  clip.endFrame = Math.max(clip.endFrame, rounded); rig.setTimeline({ endFrame: Math.max(rig.timeline.endFrame, rounded) });
  rig.constraintOverrides.delete(id); rig.update(); return true;
}

export function sampleConstraint(c: BoneConstraint, frame: number, rig?: Rig): BoneConstraint {
  const override = rig?.constraintOverrides.get(c.id);
  const track = rig?.animations.find(clip => clip.id === rig.timeline.activeAnimationId)?.tracks.find(t => t.targetId === c.id && t.property === 'constraint');
  const value = override?.frame === frame ? override.values : track ? sampleTrack(track, frame) : undefined;
  if (record(value)) {
    const next = { ...c };
    NUMBERS.forEach(key => { if (key in value) (next as unknown as Record<string, unknown>)[key] = value[key] === null ? undefined : finite(value[key], c[key] ?? 0); });
    FLAGS.forEach(key => { if (typeof value[key] === 'boolean') next[key] = value[key] as boolean; });
    if (record(value.offset) && CHANNELS.every(k => Number.isFinite((value.offset as Record<string, unknown>)[k]))) next.offset = value.offset as unknown as Transform2D;
    next.weight = clamp(finite(next.weight, 1), 0, 1); return next;
  }
  // Compatibility with the initial settings-only key representation.
  if (c.keyframes.length) {
    const weight = sampleTrack({ id: c.id, targetId: c.id, property: 'weight', keyframes: c.keyframes.map(k => ({ ...k, value: k.weight })) }, frame);
    const held = [...c.keyframes].reverse().find(k => k.frame <= frame) ?? c.keyframes[0];
    return { ...c, weight: weight ?? c.weight, enabled: held.enabled ?? c.enabled };
  }
  return c;
}

function between(v: number, min?: number, max?: number): number {
  const lo = min ?? -Infinity, hi = max ?? Infinity;
  return clamp(v, Math.min(lo, hi), Math.max(lo, hi));
}
function relative(world: Transform2D, parent?: Transform2D): Transform2D | null {
  if (!parent) return { ...world };
  const p = worldToLocalPoint(parent, world);
  return p ? { ...p, rotation: world.rotation - parent.rotation, scaleX: world.scaleX / parent.scaleX, scaleY: world.scaleY / parent.scaleY } : null;
}

/** Dependency-ordered solve from the immutable evaluated pose; no frame-to-frame drift. */
export function evaluateConstraints(rig: Rig): { deltas: Map<string, Transform2D>; debug: ConstraintDebugRecord[] } {
  const base = new Map([...rig.bones.keys()].map(id => [id, rig.getConstraintBaseLocal(id)]));
  const locals = new Map([...base].map(([id, value]) => [id, { ...value }]));
  const groups = new Map<string, BoneConstraint[]>();
  rig.constraints.forEach(c => { const list = groups.get(c.sourceBoneId) ?? []; list.push(sampleConstraint(c, rig.timeline.currentFrame, rig)); groups.set(c.sourceBoneId, list); });
  groups.forEach(list => list.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || Number(isLimit(a)) - Number(isLimit(b)) || a.id.localeCompare(b.id)));
  const debug: ConstraintDebugRecord[] = [];
  const visiting = new Set<string>(), done = new Set<string>();
  const world = (id: string, seen = new Set<string>()): Transform2D => {
    const local = locals.get(id) ?? identity(), parentId = rig.bones.get(id)?.parentId;
    if (!parentId || !locals.has(parentId) || seen.has(id) || seen.has(parentId)) return { ...local };
    seen.add(id); return compose(world(parentId, seen), local);
  };
  const length = (id: string) => rig.getConstraintBoneLength(id);
  const end = (id: string) => localToWorldPoint(world(id), { x: length(id), y: 0 });
  const descendants = (id: string): Array<{ id: string; depth: number }> => {
    const result: Array<{ id: string; depth: number }> = [], seen = new Set([id]);
    const visit = (parent: string, depth: number) => rig.getChildren(parent).forEach(child => { if (!seen.has(child.id)) { seen.add(child.id); result.push({ id: child.id, depth }); visit(child.id, depth + 1); } });
    visit(id, 1); return result;
  };
  const chain = (id: string, count: number): string[] => {
    const result: string[] = [], seen = new Set<string>();
    let cursor: string | null | undefined = id;
    while (cursor && result.length < count && !seen.has(cursor)) {
      const bone = rig.bones.get(cursor); if (!bone || bone.locked) break;
      result.push(cursor); seen.add(cursor); cursor = bone.parentId;
    }
    return result;
  };
  const limitAngle = (id: string, rotation: number) => {
    let result = rotation;
    (groups.get(id) ?? []).filter(c => c.enabled && c.type === 'angle').forEach(c => { const desired = between(result, c.minAngle === undefined ? undefined : c.minAngle * Math.PI / 180, c.maxAngle === undefined ? undefined : c.maxAngle * Math.PI / 180); result += (desired - result) * c.weight; });
    return result;
  };
  const solveIK = (c: BoneConstraint, target: Point2D) => {
    const ids = chain(c.sourceBoneId, c.chainLength ?? 2), initial = ids.map(id => ({ ...locals.get(id)! }));
    let best = initial.map(v => v.rotation), bestError = distance(end(c.sourceBoneId), target);
    // A small bend escapes the straight-chain, collinear CCD singularity.
    if (ids.length > 1 && bestError > .01) locals.get(ids[0])!.rotation = limitAngle(ids[0], locals.get(ids[0])!.rotation + .08);
    for (let pass = 0; pass < 64 && bestError > .01; pass++) {
      ids.forEach(id => {
        const origin = world(id), tip = end(c.sourceBoneId);
        if (distance(origin, target) < 1e-9 || distance(origin, tip) < 1e-9) return;
        const delta = angleDelta(Math.atan2(target.y - origin.y, target.x - origin.x) - Math.atan2(tip.y - origin.y, tip.x - origin.x));
        locals.get(id)!.rotation = limitAngle(id, locals.get(id)!.rotation + delta);
      });
      const error = distance(end(c.sourceBoneId), target);
      if (error < bestError) { bestError = error; best = ids.map(id => locals.get(id)!.rotation); }
    }
    ids.forEach((id, index) => { locals.get(id)!.rotation = limitAngle(id, initial[index].rotation + angleDelta(best[index] - initial[index].rotation) * c.weight); });
    return distance(end(c.sourceBoneId), target);
  };
  const apply = (c: BoneConstraint, blocked?: string) => {
    const source = rig.bones.get(c.sourceBoneId), current = locals.get(c.sourceBoneId);
    if (!source || !current) return;
    const origin = world(source.id), parent = source.parentId ? world(source.parentId) : undefined;
    let target = c.targetBoneId && rig.bones.has(c.targetBoneId) ? world(c.targetBoneId) : c.pinX !== undefined && c.pinY !== undefined ? { ...identity(), x: c.pinX, y: c.pinY } : undefined;
    const unit = ['angle', 'direction', 'target'].includes(c.type) && c.targetMode !== 'ik' ? '°' : c.type === 'scale' ? 'scale' : 'px';
    const report = (active: boolean, message: string, error = 0, desiredAngle?: number) => debug.push({ constraintId: c.id, sourceBoneId: source.id, targetBoneId: c.targetBoneId, type: c.type, active, weight: c.weight, error, unit, currentPoint: c.anchor === 'tip' || c.type === 'target' && c.targetMode === 'ik' ? end(source.id) : world(source.id), targetPoint: target, desiredAngle,
      ...(c.type === 'angle' && c.minAngle !== undefined && c.maxAngle !== undefined ? { limitAngles: { min: c.minAngle * Math.PI / 180, max: c.maxAngle * Math.PI / 180 } } : {}), message });
    if (blocked || !c.enabled || c.weight <= 0 || source.locked) { report(false, blocked ?? (source.locked ? 'Source bone locked' : 'Disabled')); return; }
    if (c.type === 'target' && c.targetMode === 'ik' || c.type === 'pin' && c.anchor === 'tip') {
      if (!target) { report(false, 'Choose a target'); return; }
      const error = solveIK(c, target); report(true, error <= .02 ? 'IK target reached' : 'IK residual / limited reach', error); return;
    }
    let desired: Transform2D | null = { ...current };
    let desiredAngle: number | undefined;
    if (c.type === 'angle') desired.rotation = between(current.rotation, c.minAngle === undefined ? undefined : c.minAngle * Math.PI / 180, c.maxAngle === undefined ? undefined : c.maxAngle * Math.PI / 180);
    if (c.type === 'translation') { desired.x = between(current.x, c.minX, c.maxX); desired.y = between(current.y, c.minY, c.maxY); }
    if (c.type === 'scale') { desired.scaleX = between(current.scaleX, c.minScaleX, c.maxScaleX); desired.scaleY = between(current.scaleY, c.minScaleY, c.maxScaleY); }
    if (c.type === 'distance' || c.type === 'pin') {
      if (!target) { report(false, 'Choose a target or fixed point'); return; }
      let p: Point2D = target;
      if (c.type === 'distance') {
        const r = distance(origin, target), limited = between(r, Math.max(0, c.minDistance ?? 0), c.maxDistance === undefined ? undefined : Math.max(0, c.maxDistance));
        const a = r > 1e-9 ? Math.atan2(origin.y - target.y, origin.x - target.x) : origin.rotation;
        p = { x: target.x + Math.cos(a) * limited, y: target.y + Math.sin(a) * limited };
      }
      const local = parent ? worldToLocalPoint(parent, p) : p; desired = local ? { ...current, ...local } : null;
    }
    if (!desired) { report(false, 'Singular parent'); return; }
    if (c.type === 'direction' || c.type === 'target') {
      if (target && distance(origin, target) < 1e-9) { report(false, 'Target coincides with origin'); return; }
      desiredAngle = target ? Math.atan2(target.y - origin.y, target.x - origin.x) : c.directionAngle === undefined ? undefined : c.directionAngle * Math.PI / 180;
      if (desiredAngle === undefined) { report(false, 'Choose a target or direction'); return; }
      desired.rotation = current.rotation + angleDelta(desiredAngle - origin.rotation - (origin.scaleX < 0 ? Math.PI : 0));
    }
    if (c.type === 'parent') {
      if (!target) { report(false, 'Choose a parent target'); return; }
      target = c.maintainOffset !== false ? compose(target, c.offset ?? identity()) : target;
      desired = relative(target, parent);
      if (desired) {
        const amount = c.parentInfluence ?? 1;
        for (const key of CHANNELS) { const factor = amount * (key === 'rotation' ? c.rotationInfluence ?? 1 : key.startsWith('scale') ? c.scaleInfluence ?? 1 : c.positionInfluence ?? 1); desired[key] = current[key] + (key === 'rotation' ? angleDelta(desired[key] - current[key]) : desired[key] - current[key]) * factor; }
      }
    }
    if (c.type === 'squashStretch') {
      if (!desired) { report(false, 'Singular parent'); return; }
      if (!target || length(source.id) < 1e-9 || Math.abs(parent?.scaleX ?? 1) < 1e-9) { report(false, 'Stretch requires a target and nonsingular bone'); return; }
      const ratio = between(distance(origin, target) / (length(source.id) * Math.abs(parent?.scaleX ?? 1)), Math.max(.001, c.minStretch ?? .5), Math.max(.001, c.maxStretch ?? 2));
      desired.scaleX = (current.scaleX < 0 ? -1 : 1) * ratio;
      desired.scaleY = c.preserveArea !== false ? current.scaleY * Math.abs(base.get(source.id)!.scaleX) / ratio : current.scaleY;
    }
    if (!desired || !CHANNELS.every(key => Number.isFinite(desired![key]))) { report(false, 'Singular parent / invalid pose'); return; }
    const before = { ...current };
    CHANNELS.forEach(key => {
      const reference = c.mix === 'additive' && !isLimit(c) ? base.get(source.id)![key] : current[key];
      const delta = key === 'rotation' && c.type !== 'angle' ? angleDelta(desired![key] - reference) : desired![key] - reference;
      current[key] += delta * c.weight;
    });
    if (c.affectChildren) descendants(source.id).forEach(({ id, depth }) => {
      if (rig.bones.get(id)?.locked) return;
      const child = locals.get(id)!;
      CHANNELS.forEach(key => { child[key] += (current[key] - before[key]) * (c.falloff ?? .75) ** depth; });
    });
    const result = world(source.id);
    const error = c.type === 'direction' || c.type === 'target' ? Math.abs(angleDelta(result.rotation + (result.scaleX < 0 ? Math.PI : 0) - desiredAngle!)) * 180 / Math.PI
      : c.type === 'pin' || c.type === 'distance' || c.type === 'parent' ? distance(result, compose(parent ?? identity(), desired))
      : c.type === 'squashStretch' ? Math.abs(distance(result, target!) - distance(result, end(source.id)))
      : c.type === 'angle' ? Math.abs(current.rotation - desired.rotation) * 180 / Math.PI
      : c.type === 'scale' ? Math.hypot(current.scaleX - desired.scaleX, current.scaleY - desired.scaleY) : Math.hypot(current.x - desired.x, current.y - desired.y);
    report(true, error > .02 ? 'Blended / limited' : 'Solved', error, desiredAngle);
  };
  const dependencyReaches = (from: string, to: string, seen = new Set<string>()): boolean => {
    if (from === to) return true;
    if (seen.has(from)) return false; seen.add(from);
    const parentId = rig.bones.get(from)?.parentId;
    const dependencies = [parentId, ...(groups.get(from) ?? []).filter(c => c.enabled && c.weight > 0).map(c => c.targetBoneId)].filter((id): id is string => Boolean(id));
    return dependencies.some(id => dependencyReaches(id, to, seen));
  };
  const visit = (id: string) => {
    if (done.has(id) || visiting.has(id)) return;
    visiting.add(id);
    const parent = rig.bones.get(id)?.parentId; if (parent && base.has(parent)) visit(parent);
    (groups.get(id) ?? []).forEach(c => {
      const cyclic = c.targetBoneId && dependencyReaches(c.targetBoneId, id);
      if (c.targetBoneId && !cyclic) visit(c.targetBoneId);
      apply(c, cyclic ? 'Cyclic target dependency' : undefined);
    });
    visiting.delete(id); done.add(id);
  };
  [...base.keys()].sort().forEach(visit);
  const deltas = new Map<string, Transform2D>();
  locals.forEach((value, id) => { const initial = base.get(id)!; const delta = Object.fromEntries(CHANNELS.map(k => [k, value[k] - initial[k]])) as Transform2D; if (CHANNELS.some(k => Math.abs(delta[k]) > 1e-12)) deltas.set(id, delta); });
  return { deltas, debug };
}
