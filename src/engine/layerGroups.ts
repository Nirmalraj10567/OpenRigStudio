import { upsertKeyframe } from './animation';
import { compose, identity, worldToLocalPoint } from './math';
import type { Transform2D } from './math';
import type { GroupBlendMode, GroupMode, LayerGroupData, SerializableValue } from './model';
import type { Rig } from './Rig';

let sequence = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
export const GROUP_BLEND_MODES: readonly GroupBlendMode[] = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'];

export function isGroupTarget(rig: Pick<Rig, 'groups'>, targetId: string): boolean { return rig.groups.has(targetId); }

export function descendantsOfGroup(rig: Rig, groupId: string): string[] {
  const result: string[] = [], seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return; seen.add(id);
    const group = rig.groups.get(id);
    if (!group) return;
    group.childIds.forEach(child => { result.push(child); if (rig.groups.has(child)) visit(child); });
  };
  visit(groupId); return result;
}

export function layerGroupChain(rig: Rig, layerId: string): LayerGroupData[] {
  const result: LayerGroupData[] = [], seen = new Set<string>();
  let parent = rig.layers.get(layerId)?.parentGroupId ?? rig.groups.get(layerId)?.parentGroupId;
  while (parent && !seen.has(parent)) {
    seen.add(parent); const group = rig.groups.get(parent); if (!group) break;
    result.unshift(group); parent = group.parentGroupId;
  }
  return result;
}

export function createLayerGroup(rig: Rig, name = 'Group', mode: GroupMode = 'group', parentGroupId: string | null = null): string | null {
  if (rig.smartEditingActionId || rig.groups.size >= 256 || parentGroupId && !rig.groups.has(parentGroupId)) return null;
  const groupId = id('group');
  const group = { id: groupId, name: name.trim() || 'Group', parentGroupId, childIds: [], childrenIds: [], local: identity(), world: identity(), visible: true, locked: false, opacity: 1, zIndex: rig.groups.size + rig.layers.size, mode, blendMode: 'source-over' as const, maskMode: 'clip' as const };
  rig.groups.set(groupId, group);
  if (parentGroupId) rig.groups.get(parentGroupId)!.childIds.push(groupId);
  rig.update(); return groupId;
}

export function updateLayerGroup(rig: Rig, groupId: string, patch: Partial<LayerGroupData>): boolean {
  const group = rig.groups.get(groupId); if (!group || rig.smartEditingActionId) return false;
  if (patch.parentGroupId !== undefined) return reparentLayerItem(rig, groupId, patch.parentGroupId);
  if (patch.maskLayerId && !rig.layers.has(patch.maskLayerId) || patch.clipLayerId && !rig.layers.has(patch.clipLayerId)) return false;
  if (patch.activeChildId && !group.childIds.includes(patch.activeChildId)) return false;
  if (patch.local && !Object.values(patch.local).every(Number.isFinite) || patch.opacity !== undefined && !Number.isFinite(patch.opacity)) return false;
  const { id: _id, childIds: _children, ...safe } = patch;
  Object.assign(group, safe);
  group.opacity = Math.max(0, Math.min(1, group.opacity));
  group.blendMode = GROUP_BLEND_MODES.includes(group.blendMode) ? group.blendMode : 'source-over';
  rig.update(); return true;
}

/** Move a folder or leaf between parents, preserving the visible pose by default. */
export function reparentLayerItem(rig: Rig, itemId: string, parentGroupId: string | null, preserveWorld = true): boolean {
  const item = rig.groups.get(itemId) ?? rig.layers.get(itemId);
  if (!item || rig.smartEditingActionId || parentGroupId && !rig.groups.has(parentGroupId) || itemId === parentGroupId) return false;
  if (rig.groups.has(itemId) && parentGroupId && descendantsOfGroup(rig, itemId).includes(parentGroupId)) return false;
  rig.update();
  const parent = parentGroupId ? rig.groups.get(parentGroupId) : undefined;
  const world = rig.groups.has(itemId) ? rig.groups.get(itemId)!.world : rig.getRenderLayer(itemId)!.world;
  let local: Transform2D | undefined;
  if (preserveWorld) {
    const toLocalTransform = (parentTransform: Transform2D | undefined, worldTransform: Transform2D): Transform2D | null => {
      if (!parentTransform) return { ...worldTransform };
      const point = worldToLocalPoint(parentTransform, worldTransform);
      if (!point) return null;
      return { ...point, rotation: worldTransform.rotation - parentTransform.rotation, scaleX: worldTransform.scaleX / parentTransform.scaleX, scaleY: worldTransform.scaleY / parentTransform.scaleY };
    };
    const desiredWorld = toLocalTransform(parent?.world, world);
    if (!desiredWorld) return false;
    if (rig.layers.has(itemId)) {
      const layer = rig.layers.get(itemId)!;
      const binding = [...rig.bindings.values()].find(candidate => candidate.layerId === itemId || candidate.imageId === itemId);
      const skinned = Boolean(layer.mesh && Object.keys(layer.mesh.bindBoneInverses ?? {}).length > 0);
      const bone = binding && !skinned ? rig.bones.get(binding.boneId) : undefined;
      const authoredParent = bone && binding ? compose(bone.world, binding.bindOffset) : undefined;
      local = toLocalTransform(authoredParent, desiredWorld) ?? undefined;
    } else local = desiredWorld;
  }
  rig.groups.forEach(group => { group.childIds = group.childIds.filter(child => child !== itemId); });
  item.parentGroupId = parentGroupId;
  parent?.childIds.push(itemId);
  if (local) item.local = local;
  rig.update(); return true;
}

export function removeLayerGroup(rig: Rig, groupId: string, deleteChildren = false): boolean {
  const group = rig.groups.get(groupId); if (!group || rig.smartEditingActionId) return false;
  const children = [...group.childIds];
  if (deleteChildren) children.forEach(child => rig.groups.has(child) ? removeLayerGroup(rig, child, true) : rig.remove(child));
  else children.forEach(child => reparentLayerItem(rig, child, group.parentGroupId));
  rig.groups.forEach(parent => { parent.childIds = parent.childIds.filter(child => child !== groupId); });
  rig.groups.delete(groupId); rig.animations.forEach(clip => { clip.tracks = clip.tracks.filter(track => track.targetId !== groupId); });
  if (rig.isolatedGroupId === groupId) rig.isolatedGroupId = null;
  rig.update(); return true;
}

export function setGroupIsolation(rig: Rig, groupId: string | null): boolean {
  if (groupId && !rig.groups.has(groupId)) return false;
  rig.isolatedGroupId = groupId; rig.update(); return true;
}

export function groupActiveChild(rig: Rig, group: LayerGroupData): string | undefined {
  return group.childIds.includes(group.activeChildId ?? '') ? group.activeChildId : group.childIds[0];
}

export function keyGroupProperty(rig: Rig, groupId: string, property: 'opacity' | 'transform' | 'visible' | 'switchChild' | 'layerOrder', value?: SerializableValue): boolean {
  const group = rig.groups.get(groupId); if (!group || rig.smartEditingActionId) return false;
  let clip = rig.animations.find(animation => animation.id === rig.timeline.activeAnimationId);
  if (!clip) { clip = { id: id('animation'), name: 'Layer groups', fps: rig.timeline.fps, startFrame: rig.timeline.startFrame, endFrame: rig.timeline.endFrame, tracks: [] }; rig.animations.push(clip); rig.setTimeline({ activeAnimationId: clip.id }); }
  let track = clip.tracks.find(item => item.targetId === groupId && item.property === property);
  if (!track) { track = { id: id('track'), targetId: groupId, property, keyframes: [] }; clip.tracks.push(track); }
  const authored = value ?? (property === 'transform' ? { ...group.local } : property === 'opacity' ? group.opacity : property === 'visible' ? group.visible : property === 'switchChild' ? group.activeChildId ?? group.childIds[0] ?? '' : [...group.childIds]);
  const frame = Math.max(0, Math.round(rig.timeline.currentFrame));
  Object.assign(track, upsertKeyframe(track, { id: track.keyframes.find(key => key.frame === frame)?.id ?? id('key'), frame, value: authored as SerializableValue, easing: ['visible', 'switchChild', 'layerOrder'].includes(property) ? 'step' : 'linear' }));
  clip.endFrame = Math.max(clip.endFrame, frame); rig.update(); return true;
}

export function reorderGroupChildren(rig: Rig, groupId: string, childIds: string[], key = false): boolean {
  const group = rig.groups.get(groupId); if (!group || new Set(childIds).size !== group.childIds.length || childIds.some(child => !group.childIds.includes(child))) return false;
  group.childIds = [...childIds];
  if (key) keyGroupProperty(rig, groupId, 'layerOrder', childIds);
  rig.update(); return true;
}

export function groupChildrenInOrder(rig: Rig, group: LayerGroupData): string[] {
  return [...group.childIds];
}

export function evaluatedGroupTransform(rig: Rig, group: LayerGroupData): Transform2D {
  return { ...group.local };
}

export function evaluatedGroupOpacity(rig: Rig, group: LayerGroupData): number {
  return Math.max(0, Math.min(1, group.opacity));
}

export function evaluatedGroupVisible(rig: Rig, group: LayerGroupData): boolean {
  return group.visible;
}
