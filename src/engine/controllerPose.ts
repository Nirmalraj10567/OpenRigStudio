import { sampleTrack } from './animation';
import type { Transform2D, Point2D } from './math';
import type { ControllerEvaluation } from './model';
import type { Rig } from './Rig';

export interface ControllerPose {
  transform: Partial<Transform2D>;
  offset: Partial<Transform2D>;
  opacity?: number;
  opacityOffset: number;
  mesh?: Point2D[];
}
const channels: Array<keyof Transform2D> = ['x', 'y', 'rotation', 'scaleX', 'scaleY'];

/** Sample into an overlay, never use the authored-data animation mutator. */
export function sampleControllerPose(rig: Rig, evaluations: ControllerEvaluation[]): Map<string, ControllerPose> {
  const poses = new Map<string, ControllerPose>();
  const poseFor = (id: string) => {
    let pose = poses.get(id);
    if (!pose) { pose = { transform: {}, offset: {}, opacityOffset: 0 }; poses.set(id, pose); }
    return pose;
  };
  // Multiple instances compose deterministically: clip channels last-ID-wins,
  // parameter offsets add. Each instance retains its own playback/input clock.
  [...evaluations].sort((a, b) => a.controllerId < b.controllerId ? -1 : a.controllerId > b.controllerId ? 1 : 0).forEach(evaluation => {
    const clip = rig.animations.find(item => item.id === evaluation.clipId);
    Object.entries(clip?.setupPose ?? {}).forEach(([id, setup]) => {
      if (!rig.bones.has(id) && !rig.layers.has(id)) return;
      const pose = poseFor(id);
      pose.transform = { ...pose.transform, ...setup.local };
      if (setup.opacity !== undefined) pose.opacity = setup.opacity;
      if (setup.mesh) pose.mesh = setup.mesh.map(point => ({ ...point }));
    });
    clip?.tracks.slice().sort((a, b) => Number(b.property === 'transform') - Number(a.property === 'transform')).forEach(track => {
      if (evaluation.frame === 0 && clip.setupPose?.[track.targetId] && !track.keyframes.some(key => key.frame === 0)) return;
      const target = rig.bones.get(track.targetId) ?? rig.layers.get(track.targetId);
      if (!target) return;
      const pose = poseFor(track.targetId);
      let value = sampleTrack(track, evaluation.frame);
      if (rig.smartActions.some(action => action.driverBoneId === track.targetId)
        && (track.property === 'rotation' || track.property === 'transform')) {
        const keyframes = track.keyframes.flatMap(key => {
          const angle = typeof key.value === 'number' ? key.value : key.value && typeof key.value === 'object' && !Array.isArray(key.value) ? key.value.rotation : undefined;
          return typeof angle === 'number' && Number.isFinite(angle) ? [{ ...key, value: angle }] : [];
        });
        const angle = sampleTrack({ ...track, property: 'smartDriverAngle', keyframes }, evaluation.frame);
        if (angle !== undefined) value = track.property === 'rotation' ? angle : value && typeof value === 'object' && !Array.isArray(value) ? { ...value, rotation: angle } : value;
      }
      if (track.property === 'transform' && value && typeof value === 'object' && !Array.isArray(value)) {
        const transform = value;
        channels.forEach(channel => { const part = transform[channel]; if (typeof part === 'number' && Number.isFinite(part)) pose.transform[channel] = part; });
      } else if (track.property === 'mesh' && Array.isArray(value)) {
        const mesh = rig.layers.get(track.targetId)?.mesh;
        if (mesh && mesh.vertices.length === value.length && value.every(point => point && typeof point === 'object' && !Array.isArray(point)
          && typeof point.x === 'number' && Number.isFinite(point.x) && typeof point.y === 'number' && Number.isFinite(point.y))) {
          pose.mesh = (value as Point2D[]).map(point => ({ x: point.x, y: point.y }));
        }
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        if (channels.includes(track.property as keyof Transform2D)) pose.transform[track.property as keyof Transform2D] = value;
        else if (track.property === 'opacity') pose.opacity = value;
      }
    });
    evaluation.outputs.forEach(output => {
      if (!rig.bones.has(output.targetId) && !rig.layers.has(output.targetId)) return;
      const pose = poseFor(output.targetId);
      if (output.parameter === 'opacity') pose.opacityOffset += output.value;
      else if (channels.includes(output.parameter as keyof Transform2D)) {
        const channel = output.parameter as keyof Transform2D;
        pose.offset[channel] = (pose.offset[channel] ?? 0) + output.value;
      }
    });
  });
  return poses;
}
