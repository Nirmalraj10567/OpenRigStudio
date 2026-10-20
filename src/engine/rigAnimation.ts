import { sampleAnimation, sampleTrack } from './animation';
import type { AnimationClip, SerializableValue } from './model';
import { Rig } from './Rig';
import type { Transform2D } from './math';
import { normalizeMasks, normalizePatch } from './masking';
import { layerWeight, mapAnimationFrame } from './animationNla';
import { getHandRigs, handTurnAvailable } from './handRig';

function isTransform(value: SerializableValue): value is Transform2D {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<Transform2D>;
  return [item.x, item.y, item.rotation, item.scaleX, item.scaleY].every((part) => typeof part === 'number');
}

/** Applies sampled track values to runtime local transforms. */
type PoseValue = { local?: Transform2D; opacity?: number; visible?: boolean; mesh?: Array<{ x: number; y: number }>; masks?: SerializableValue; patch?: SerializableValue };
const numericChannels: Array<keyof Transform2D> = ['x', 'y', 'rotation', 'scaleX', 'scaleY'];

function capturePose(rig: Rig, ids: Set<string>): Map<string, PoseValue> {
  const values = new Map<string, PoseValue>();
  ids.forEach(id => {
    const target = rig.bones.get(id) ?? rig.layers.get(id) ?? rig.groups.get(id); if (!target) return;
    const layer = rig.layers.get(id), group = rig.groups.get(id);
    values.set(id, { local: { ...target.local }, ...(layer ? { opacity: layer.opacity, visible: layer.visible, ...(layer.mesh ? { mesh: layer.mesh.vertices.map(vertex => ({ x: vertex.x, y: vertex.y })) } : {}), ...(layer.patch ? { patch: JSON.parse(JSON.stringify(layer.patch)) } : {}) } : {}), ...(group ? { opacity: group.opacity, visible: group.visible, masks: JSON.parse(JSON.stringify(group.masks ?? [])) } : {}) });
  }); return values;
}

function sourcePose(rig: Rig, source: AnimationClip, frame: number, stack: Set<string>): { values: Map<string, PoseValue>; setup: Map<string, PoseValue> } {
  const temp = new Rig({ ...rig.toProject(), dynamics: { ...rig.dynamics, enabled: false, cache: undefined } });
  const ids = new Set([...Object.keys(source.setupPose ?? {}), ...source.tracks.map(track => track.targetId)]);
  const setup = new Map<string, PoseValue>();
  Object.entries(source.setupPose ?? {}).forEach(([id, state]) => setup.set(id, { local: { ...state.local }, opacity: state.opacity, visible: state.visible, mesh: state.mesh, masks: state.masks as unknown as SerializableValue, patch: state.patch as unknown as SerializableValue }));
  applyAnimationToRig(temp, source, frame, new Set([...stack, source.id]));
  return { values: capturePose(temp, ids), setup };
}

function blendNlaLayer(rig: Rig, host: AnimationClip, layer: import('./model').AnimationLayer, frame: number, stack: Set<string>): void {
  const source = rig.animations.find(item => item.id === layer.clipId); if (!source) return;
  const weight = layerWeight(layer, frame); if (!weight) return;
  const sourceStart = layer.sourceStartFrame ?? source.startFrame, sourceEnd = layer.sourceEndFrame ?? source.endFrame;
  const sourceFrame = mapAnimationFrame(sourceStart + (frame - layer.startFrame) * layer.speed + layer.offset, { ...source, startFrame: sourceStart, endFrame: sourceEnd, trimStart: sourceStart, trimEnd: sourceEnd, loopMode: layer.loopMode }, layer.loopMode);
  const sampled = sourcePose(rig, source, sourceFrame, stack);
  sampled.values.forEach((value, id) => {
    const target = rig.bones.get(id) ?? rig.layers.get(id) ?? rig.groups.get(id), base = sampled.setup.get(id); if (!target || !value.local) return;
    const current = target.local, local = { ...current };
    numericChannels.forEach(channel => {
      const sourceValue = value.local![channel], baseValue = base?.local?.[channel] ?? 0;
      local[channel] = layer.blendMode === 'additive' ? current[channel] + (sourceValue - baseValue) * weight : current[channel] + (sourceValue - current[channel]) * weight;
    }); target.local = local;
    const artwork = rig.layers.get(id), group = rig.groups.get(id);
    if (value.opacity !== undefined) {
      const baseOpacity = base?.opacity ?? value.opacity;
      const next = layer.blendMode === 'additive' ? (artwork?.opacity ?? group?.opacity ?? value.opacity) + (value.opacity - baseOpacity) * weight : (artwork?.opacity ?? group?.opacity ?? value.opacity) + (value.opacity - (artwork?.opacity ?? group?.opacity ?? value.opacity)) * weight;
      if (artwork) artwork.opacity = next; if (group) group.opacity = next;
    }
    if (weight >= .5) {
      if (value.visible !== undefined) { if (artwork) artwork.visible = value.visible; if (group) group.visible = value.visible; }
      if (value.mesh && artwork?.mesh && value.mesh.length === artwork.mesh.vertices.length) artwork.mesh.vertices.forEach((vertex, index) => { vertex.x = value.mesh![index].x; vertex.y = value.mesh![index].y; });
      if (group && value.masks !== undefined) group.masks = normalizeMasks(value.masks, new Set(rig.layers.keys()));
      if (artwork && value.patch !== undefined) artwork.patch = normalizePatch(value.patch, new Set(rig.layers.keys()));
    }
  });
}

function applyNlaAnimationToRig(rig: Rig, clip: AnimationClip, frame: number, stack: Set<string>): void {
  const baseClip = { ...clip, nlaLayers: undefined, transitions: undefined };
  applyAnimationToRig(rig, baseClip, mapAnimationFrame(frame, clip), new Set([...stack, clip.id]));
  const layers = clip.nlaLayers ?? [];
  const solo = layers.filter(layer => layer.solo && !layer.muted);
  (solo.length ? solo : layers).slice().sort((a, b) => a.startFrame - b.startFrame).forEach(layer => blendNlaLayer(rig, clip, layer, frame, stack));
}

export function applyAnimationToRig(rig: Rig, clip: AnimationClip, frame: number, stack = new Set<string>()): void {
  if (clip.nlaLayers?.length && !stack.has(clip.id)) { applyNlaAnimationToRig(rig, clip, frame, stack); return; }
  frame = mapAnimationFrame(frame, clip);
  Object.entries(clip.setupPose ?? {}).forEach(([id, pose]) => {
    const layer = rig.layers.get(id);
    const group = rig.groups.get(id);
    const target = rig.bones.get(id) ?? layer ?? group;
    if (!target || !pose || !isTransform(pose.local as unknown as SerializableValue)) return;
    target.local = { ...pose.local };
    if (layer && typeof pose.opacity === 'number') layer.opacity = pose.opacity;
    if (group) {
      if (pose.opacity !== undefined) group.opacity = pose.opacity;
      if (pose.visible !== undefined) group.visible = pose.visible;
      if (pose.masks) group.masks = normalizeMasks(pose.masks, new Set(rig.layers.keys()));
    }
    if (layer && pose.patch) layer.patch = normalizePatch(pose.patch, new Set(rig.layers.keys()));
    if (layer?.mesh && pose.mesh?.length === layer.mesh.vertices.length) {
      layer.mesh.vertices.forEach((vertex, index) => { vertex.x = pose.mesh![index].x; vertex.y = pose.mesh![index].y; });
    }
  });
  const values = sampleAnimation(clip, frame);
  const handDrivers = new Set(getHandRigs(rig).filter(hand => handTurnAvailable(rig, hand)).map(hand => hand.turn!.driverBoneId));
  // Individual channels must override aggregate transform tracks regardless of
  // import/creation order, including when auto-key adds a transform later.
  [...clip.tracks].sort((a, b) => Number(b.property === 'transform') - Number(a.property === 'transform')).forEach((track) => {
    if (frame === 0 && clip.setupPose?.[track.targetId] && !track.keyframes.some(key => key.frame === 0)) return;
    let value = values.get(`${track.targetId}:${track.property}`);
    if (value === undefined) return;
    if (track.property === 'facial') {
      if (value && typeof value === 'object' && !Array.isArray(value)) rig.setFacialParameters(track.targetId, value as Partial<import('./model').FacialParameters>);
      return;
    }
    const bone = rig.bones.get(track.targetId);
    const layer = rig.layers.get(track.targetId);
    const group = rig.groups.get(track.targetId);
    const target = bone ?? layer ?? group;
    if (!target) return;
    if (track.property === 'shapes' && layer?.type === 'vector' && Array.isArray(value)) {
      layer.shapes = JSON.parse(JSON.stringify(value)) as import('./model').VectorShape[];
      return;
    }
    if (track.property === 'masks' && group) { group.masks = normalizeMasks(value, new Set(rig.layers.keys())); return; }
    if (track.property === 'patch' && layer) { layer.patch = normalizePatch(value, new Set(rig.layers.keys())); return; }
    if (bone && (handDrivers.has(bone.id) || rig.smartActions.some(action => action.driverBoneId === bone.id))
      && (track.property === 'rotation' || track.property === 'transform')) {
      // Smart controls are angle-valued dials. A 0→270° key must traverse 135°
      // at its midpoint, not take the ordinary bone's shortest path through -45°.
      const keyframes = track.keyframes.flatMap(key => {
        const angle = typeof key.value === 'number' ? key.value : isTransform(key.value) ? key.value.rotation : undefined;
        return angle === undefined ? [] : [{ ...key, value: angle }];
      });
      const angle = sampleTrack({ ...track, property: 'smartDriverAngle', keyframes }, frame);
      if (angle !== undefined) value = track.property === 'rotation' ? angle : isTransform(value) ? { ...value, rotation: angle } : value;
    }
    if (track.property === 'mesh' && layer?.mesh && Array.isArray(value) && value.length === layer.mesh.vertices.length) {
      const points = value as Array<{ x: number; y: number }>;
      if (points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) {
        layer.mesh.vertices.forEach((vertex, index) => { vertex.x = points[index].x; vertex.y = points[index].y; });
      }
      return;
    }
    if (track.property === 'transform' && isTransform(value)) {
      target.local = { ...target.local, ...value };
      return;
    }
    if (track.property === 'visible' && typeof value === 'boolean') {
      if (layer) layer.visible = value;
      if (group) group.visible = value;
      return;
    }
    if (track.property === 'switchChild' && group && typeof value === 'string') {
      group.activeChildId = value;
      return;
    }
    if (track.property === 'layerOrder' && group && Array.isArray(value)) {
      const ids = value.filter((item): item is string => typeof item === 'string' && group.childIds.includes(item));
      group.childIds = [...ids, ...group.childIds.filter(id => !ids.includes(id))];
      return;
    }
    if (track.property === 'parentGroupId' && layer && (typeof value === 'string' || value === null)) {
      layer.parentGroupId = value;
      return;
    }
    if (typeof value !== 'number') return;
    switch (track.property) {
      case 'x': target.local.x = value; break;
      case 'y': target.local.y = value; break;
      case 'rotation': target.local.rotation = value; break;
      case 'spin': target.local.rotation = value; break;
      case 'scaleX': target.local.scaleX = value; break;
      case 'scaleY': target.local.scaleY = value; break;
      case 'opacity': if (layer) layer.opacity = value; if (group) group.opacity = value; break;
      case 'zIndex': if (layer || group) (layer ?? group)!.zIndex = value; break;
      case 'parentGroupId': if (layer && (typeof value === 'string' || value === null)) layer.parentGroupId = value; break;
      default: break;
    }
  });
}
