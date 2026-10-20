import type { Rig, Layer } from './Rig';
import { createId } from './Rig';
import type { Transform3D } from './camera3d';
import { defaultCamera3D, normalizeTransform3D } from './camera3d';
import { sampleTrack, upsertKeyframe } from './animation';
import { extrudePolygon, inflatePolygon, latheProfile, parseOBJ, shapeOutline } from './render3d';
import type { SerializableValue, Mesh3D } from './model';

export function evaluatedLayer3D(rig: Rig, layer: Layer): Pick<Layer, 'transform3d' | 'depth'> {
  const clip = rig.animations.find(clip => clip.id === rig.timeline.activeAnimationId);
  const transform = clip?.tracks.find(track => track.targetId === layer.id && track.property === 'transform3d'), depth = clip?.tracks.find(track => track.targetId === layer.id && track.property === 'depth');
  const sampled = transform ? sampleTrack(transform, rig.timeline.currentFrame) : undefined, z = depth ? sampleTrack(depth, rig.timeline.currentFrame) : undefined;
  return { transform3d: sampled ? normalizeTransform3D(sampled) : layer.transform3d, depth: typeof z === 'number' ? z : layer.depth };
}
export function updateLayer3D(rig: Rig, id: string, transform: Transform3D, autoKey = false, explicit = false): boolean {
  const layer = rig.layers.get(id); if (!layer || rig.smartEditingActionId || layer.locked) return false;
  const next = normalizeTransform3D(transform), frame = Math.round(rig.timeline.currentFrame);
  if (explicit || autoKey && frame > 0) {
    let clip = rig.animations.find(clip => clip.id === rig.timeline.activeAnimationId);
    if (!clip) { clip = { id: createId('animation'), name: '3D scene animation', fps: rig.timeline.fps, startFrame: 0, endFrame: Math.max(frame, rig.timeline.endFrame), tracks: [] }; rig.animations.push(clip); rig.timeline.activeAnimationId = clip.id; }
    let track = clip.tracks.find(track => track.targetId === id && track.property === 'transform3d');
    if (!track) { track = { id: createId('track'), targetId: id, property: 'transform3d', keyframes: [] }; clip.tracks.push(track); }
    if (!track.keyframes.length && frame > 0) track.keyframes.push({ id: createId('key'), frame: 0, value: normalizeTransform3D(layer.transform3d) as unknown as SerializableValue, easing: 'smooth' });
    Object.assign(track, upsertKeyframe(track, { id: track.keyframes.find(key => key.frame === frame)?.id ?? createId('key'), frame, value: next as unknown as SerializableValue, easing: 'smooth' }));
    clip.endFrame = Math.max(frame, clip.endFrame);
  } else layer.transform3d = next;
  return true;
}
export function shiftLayerDepth(rig: Rig, id: string, delta: number, autoKey = false): boolean {
  const layer = rig.layers.get(id); if (!layer || !Number.isFinite(delta)) return false;
  const transform = normalizeTransform3D(evaluatedLayer3D(rig, layer).transform3d);
  transform.position.z += delta; return updateLayer3D(rig, id, transform, autoKey);
}
export function importObject3D(rig: Rig, text: string, name = 'Imported OBJ'): string {
  const mesh = parseOBJ(text);
  const id = rig.addVectorLayer(name, []), layer = rig.layers.get(id)!;
  layer.local.x = rig.canvas.width / 2; layer.local.y = rig.canvas.height / 2; layer.mesh3d = mesh; layer.transform3d = normalizeTransform3D(undefined);
  rig.update(); return id;
}
export function generateLayer3D(rig: Rig, id: string, mode: 'extrude' | 'inflate' | 'lathe', amount = 30, segments = 24): boolean {
  const layer = rig.layers.get(id); if (layer?.type !== 'vector' || !layer.shapes.length || layer.locked || rig.smartEditingActionId) return false;
  const shape = layer.shapes.find(shape => shape.fill && shape.fill !== 'none') ?? layer.shapes[0], outline = shapeOutline(shape), color = shape.fill ?? '#9bb8c8';
  const mesh: Mesh3D = mode === 'extrude' ? extrudePolygon(outline, amount, color) : mode === 'inflate' ? inflatePolygon(outline, amount, color) : latheProfile(outline.map(point => ({ x: Math.abs(point.x), y: point.y })), segments, Math.PI * 2, color);
  layer.mesh3d = mesh; layer.transform3d ??= normalizeTransform3D(undefined); return true;
}
export function enable3DPreview(rig: Rig): void { rig.setStage2D({ enabled: true, camera3d: { ...defaultCamera3D(), enabled: true } }); rig.cameraView = 'preview'; }
