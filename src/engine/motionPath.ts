import { createId, Rig } from './Rig';
import { upsertKeyframe } from './animation';
import type { MotionPath, SerializableValue } from './model';
import type { Transform2D } from './math';

export function simplifyMotionPath(points: Array<{ x: number; y: number }>, tolerance = 2): Array<{ x: number; y: number }> {
  const result: Array<{ x: number; y: number }> = [];
  points.forEach(point => {
    const previous = result[result.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= tolerance) result.push({ x: point.x, y: point.y });
  });
  return result.length > 1 ? result : points.slice(0, 2).map(point => ({ ...point }));
}

export function motionPathLength(path: Pick<MotionPath, 'points'>): number {
  return path.points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - path.points[index].x, point.y - path.points[index].y), 0);
}

export function sampleMotionPath(path: Pick<MotionPath, 'points'>, amount: number): { point: { x: number; y: number }; tangent: number } {
  const points = path.points;
  if (points.length < 2) return { point: points[0] ?? { x: 0, y: 0 }, tangent: 0 };
  const distance = Math.max(0, Math.min(1, amount)) * motionPathLength(path);
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1], end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (travelled + length >= distance || index === points.length - 1) {
      const t = length ? (distance - travelled) / length : 0;
      return { point: { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }, tangent: Math.atan2(end.y - start.y, end.x - start.x) };
    }
    travelled += length;
  }
  const last = points[points.length - 1], before = points[points.length - 2];
  return { point: { ...last }, tangent: Math.atan2(last.y - before.y, last.x - before.x) };
}

/** Bake a path into one transform track, keeping the operation undoable as one commit. */
export function bakeMotionPath(rig: Rig, path: MotionPath): boolean {
  const target = rig.layers.get(path.targetId) ?? rig.bones.get(path.targetId);
  if (!target || target.locked || path.points.length < 2 || path.endFrame <= path.startFrame) return false;
  let clip = rig.animations.find(animation => animation.id === rig.timeline.activeAnimationId);
  if (!clip) {
    clip = { id: createId('animation'), name: 'Motion path animation', fps: rig.timeline.fps, startFrame: path.startFrame, endFrame: path.endFrame, tracks: [] };
    rig.animations.push(clip);
    rig.timeline.activeAnimationId = clip.id;
  }
  let track = clip.tracks.find(item => item.targetId === path.targetId && item.property === 'transform');
  if (!track) { track = { id: createId('track'), targetId: path.targetId, property: 'transform', keyframes: [] }; clip.tracks.push(track); }
  const source = rig.toProject();
  const steps = Math.max(2, Math.min(240, path.endFrame - path.startFrame + 1));
  for (let index = 0; index < steps; index += 1) {
    const frame = Math.round(path.startFrame + (path.endFrame - path.startFrame) * index / (steps - 1));
    const sample = sampleMotionPath(path, index / (steps - 1));
    const sampleRig = new Rig(source);
    const sampleTarget = sampleRig.layers.get(path.targetId) ?? sampleRig.bones.get(path.targetId);
    if (!sampleTarget || !sampleRig.moveWorld(path.targetId, sample.point)) continue;
    const parentBone = sampleRig.bones.get(path.targetId)?.parentId ? sampleRig.bones.get(sampleRig.bones.get(path.targetId)!.parentId!) : undefined;
    const local: Transform2D = { ...sampleTarget.local };
    if (path.orientToPath) local.rotation = parentBone ? sample.tangent - parentBone.world.rotation : sample.tangent;
    Object.assign(track, upsertKeyframe(track, { id: track.keyframes.find(key => key.frame === frame)?.id ?? createId('key'), frame, value: local as unknown as SerializableValue, easing: 'linear' }));
  }
  clip.startFrame = Math.min(clip.startFrame, path.startFrame);
  clip.endFrame = Math.max(clip.endFrame, path.endFrame);
  rig.setTimeline({ activeAnimationId: clip.id, startFrame: Math.min(rig.timeline.startFrame, path.startFrame), endFrame: Math.max(rig.timeline.endFrame, path.endFrame) });
  rig.update();
  return true;
}
