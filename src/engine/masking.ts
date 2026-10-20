import type { Rig } from './Rig';
import type { LayerGroupData, MaskEntry, PatchSettings, SerializableValue } from './model';
import { upsertKeyframe } from './animation';

let sequence = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++sequence}`;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const bounded = (value: unknown, fallback: number, min = 0, max = 1) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function normalizeMasks(value: unknown, layerIds?: Set<string>): MaskEntry[] {
  const seen = new Set<string>();
  return Array.isArray(value) ? value.slice(0, 64).flatMap((item, index): MaskEntry[] => {
    if (!record(item) || typeof item.layerId !== 'string' || layerIds && !layerIds.has(item.layerId)) return [];
    const id = typeof item.id === 'string' && item.id ? item.id : `mask-${index}`;
    if (seen.has(id)) return []; seen.add(id);
    return [{ id, layerId: item.layerId, kind: item.kind === 'clip' ? 'clip' : 'alpha',
      operation: item.operation === 'subtract' || item.operation === 'intersect' ? item.operation : 'add',
      inverted: item.inverted === true, opacity: bounded(item.opacity, 1), enabled: item.enabled !== false,
      hideSource: item.hideSource !== false, hideEdge: item.hideEdge !== false }];
  }) : [];
}

export function normalizePatch(value: unknown, layerIds?: Set<string>): PatchSettings | undefined {
  if (!record(value)) return undefined;
  return { enabled: value.enabled !== false, hideEdges: value.hideEdges !== false, seamWidth: bounded(value.seamWidth, 2, 0, 64), ...(value.preserveOutline === true ? { preserveOutline: true } : {}),
    targetIds: Array.isArray(value.targetIds) ? [...new Set(value.targetIds.filter((id): id is string => typeof id === 'string' && (!layerIds || layerIds.has(id))))].slice(0, 256) : [] };
}

/** Legacy selectors become the same ordered stack used by new projects. */
export function groupMasks(group: LayerGroupData): MaskEntry[] {
  if (group.masks !== undefined) return group.masks;
  return [group.clipLayerId, group.maskLayerId].flatMap((layerId, index): MaskEntry[] => layerId ? [{
    id: `legacy-${group.id}-${index}`, layerId, kind: index === 0 ? 'clip' : group.maskMode ?? 'clip', operation: 'intersect',
    inverted: false, opacity: 1, enabled: true, hideSource: true, hideEdge: true,
  }] : []);
}

export function addGroupMask(rig: Rig, groupId: string, layerId: string, kind: MaskEntry['kind'] = 'alpha'): string | null {
  const group = rig.groups.get(groupId);
  if (!group || !rig.layers.has(layerId) || rig.smartEditingActionId || groupMasks(group).length >= 64) return null;
  const id = uid('mask');
  group.masks = [...groupMasks(group), { id, layerId, kind, operation: groupMasks(group).length ? 'intersect' : 'add', inverted: false, opacity: 1, enabled: true, hideSource: true, hideEdge: true }];
  rig.update(); return id;
}

export function updateGroupMask(rig: Rig, groupId: string, maskId: string, patch: Partial<MaskEntry>): boolean {
  const group = rig.groups.get(groupId); if (!group) return false;
  const masks = groupMasks(group); if (!masks.some(mask => mask.id === maskId)) return false;
  group.masks = normalizeMasks(masks.map(mask => mask.id === maskId ? { ...mask, ...patch, id: maskId } : mask), new Set(rig.layers.keys()));
  rig.update(); return true;
}

export function moveGroupMask(rig: Rig, groupId: string, maskId: string, offset: number): boolean {
  const group = rig.groups.get(groupId); if (!group) return false;
  const masks = [...groupMasks(group)], index = masks.findIndex(mask => mask.id === maskId), next = index + offset;
  if (index < 0 || next < 0 || next >= masks.length) return false;
  [masks[index], masks[next]] = [masks[next], masks[index]]; group.masks = masks; rig.update(); return true;
}

export function removeGroupMask(rig: Rig, groupId: string, maskId: string): boolean {
  const group = rig.groups.get(groupId); if (!group) return false;
  const masks = groupMasks(group); if (!masks.some(mask => mask.id === maskId)) return false;
  group.masks = masks.filter(mask => mask.id !== maskId); rig.update(); return true;
}

export function keyCompositing(rig: Rig, targetId: string, property: 'masks' | 'patch'): boolean {
  const value = property === 'masks' ? rig.groups.get(targetId) && groupMasks(rig.groups.get(targetId)!) : rig.layers.get(targetId)?.patch;
  if (!value || rig.smartEditingActionId) return false;
  let clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  if (!clip) {
    clip = { id: uid('animation'), name: 'Compositing', fps: rig.timeline.fps, startFrame: 0, endFrame: rig.timeline.endFrame, tracks: [] };
    rig.animations.push(clip); rig.setTimeline({ activeAnimationId: clip.id });
  }
  let track = clip.tracks.find(item => item.targetId === targetId && item.property === property);
  if (!track) { track = { id: uid('track'), targetId, property, keyframes: [] }; clip.tracks.push(track); }
  const frame = Math.max(0, Math.round(rig.timeline.currentFrame));
  Object.assign(track, upsertKeyframe(track, { id: uid('key'), frame, value: JSON.parse(JSON.stringify(value)) as SerializableValue, easing: 'linear' }));
  clip.endFrame = Math.max(frame, clip.endFrame); return true;
}

/** Reference alpha algebra, also used to assert ordered mask semantics. */
export function compositeMaskAlpha(destination: number, source: number, operation: MaskEntry['operation']): number {
  return operation === 'add' ? source + destination * (1 - source) : operation === 'subtract' ? destination * (1 - source) : destination * source;
}
