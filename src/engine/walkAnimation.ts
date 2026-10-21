import { createId, type Rig } from './Rig';
import type { AnimationClip, AnimationTrack, Keyframe } from './model';
import type { Transform2D } from './math';

export interface WalkCycleOptions {
  name?: string;
  startFrame?: number;
  duration?: number;
  stride?: number;
  lift?: number;
  makeActive?: boolean;
}

export interface WalkCycleResult {
  clipId: string;
  trackIds: string[];
  targetIds: string[];
  duration: number;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function findBone(rig: Rig, pattern: RegExp): string | null {
  return [...rig.bones.values()].find(bone => pattern.test(bone.name))?.id ?? null;
}

function trackFor(rig: Rig, targetId: string, keys: Array<{ frame: number; value: Transform2D }>): AnimationTrack {
  return { id: createId('track'), targetId, property: 'transform', keyframes: keys.map(key => ({ id: createId('key'), frame: key.frame, value: clone(key.value), easing: 'smooth' })) as Array<Keyframe<Transform2D>> };
}

function keyedPose(base: Transform2D, rotation: number, x = base.x, y = base.y): Transform2D {
  return { ...base, x, y, rotation: base.rotation + rotation };
}

/**
 * Author a deterministic two-segment walk cycle for a humanoid rig.
 * Feet keep their authored origins (planted pivots), while ankle rotation and
 * opposing arm/forearm motion provide a complete editable gait.
 */
export function createWalkCycle(rig: Rig, options: WalkCycleOptions = {}): WalkCycleResult | null {
  if (rig.smartEditingActionId) return null;
  const duration = Math.max(8, Math.round(finite(options.duration, 24)));
  const startFrame = Math.max(0, Math.round(finite(options.startFrame, 0)));
  const stride = Math.max(0, Math.min(80, finite(options.stride, 18)));
  const lift = Math.max(0, Math.min(40, finite(options.lift, 10)));
  const ids = {
    leftThigh: findBone(rig, /left.*(upper\s*leg|thigh)/i), rightThigh: findBone(rig, /right.*(upper\s*leg|thigh)/i),
    leftShin: findBone(rig, /left.*(lower\s*leg|shin)/i), rightShin: findBone(rig, /right.*(lower\s*leg|shin)/i),
    leftFoot: findBone(rig, /left.*(foot|ankle)/i), rightFoot: findBone(rig, /right.*(foot|ankle)/i),
    leftUpperArm: findBone(rig, /left.*(upper\s*arm|arm)/i), rightUpperArm: findBone(rig, /right.*(upper\s*arm|arm)/i),
    leftForearm: findBone(rig, /left.*(lower\s*arm|forearm)/i), rightForearm: findBone(rig, /right.*(lower\s*arm|forearm)/i),
    leftHand: findBone(rig, /left.*hand/i), rightHand: findBone(rig, /right.*hand/i),
  };
  const targetIds = Object.values(ids).filter((id): id is string => Boolean(id));
  if (targetIds.length < 6) return null;
  const frames = [0, Math.round(duration * .25), Math.round(duration * .5), Math.round(duration * .75), duration].map(frame => startFrame + frame);
  const phase = [0, 1, 0, -1, 0];
  const liftPhase = [0, 1, 0, 1, 0];
  const amplitudes: Record<string, number> = {
    leftThigh: .42, rightThigh: .42, leftShin: .3, rightShin: .3, leftFoot: .16, rightFoot: .16,
    leftUpperArm: .28, rightUpperArm: .28, leftForearm: .18, rightForearm: .18, leftHand: .12, rightHand: .12,
  };
  const tracks: AnimationTrack[] = [];
  (Object.entries(ids) as Array<[keyof typeof ids, string | null]>).forEach(([role, id]) => {
    if (!id) return;
    const bone = rig.bones.get(id); if (!bone) return;
    const opposite = role.startsWith('left') ? -1 : 1;
    const isLeg = /Thigh|Shin|Foot/.test(role);
    const isFoot = /Foot/.test(role);
    const isShin = /Shin/.test(role);
    const isArm = /Arm|Hand/.test(role);
    const keys = frames.map((frame, index) => {
      const swing = phase[index] * amplitudes[role] * opposite * (isLeg ? 1 : -1);
      const bend = isShin ? Math.max(0, liftPhase[index] * lift / 100) : 0;
      const ankle = isFoot ? -phase[index] * amplitudes[role] * opposite : 0;
      const rotation = swing + (isShin ? bend : 0) + ankle;
      // Explicitly preserve x/y so foot origins remain planted while the ankle
      // rotates. The optional stride lives in the upper leg's rotation rather
      // than translating the contact point.
      const x = bone.local.x + (isLeg && /Thigh/.test(role) ? phase[index] * stride * .02 : 0);
      const y = bone.local.y;
      return { frame, value: keyedPose(bone.local, rotation, x, y) };
    });
    // Hands receive a small mirrored counter-rotation instead of drifting.
    if (isArm && /Hand/.test(role)) keys.forEach((key, index) => { key.value.rotation = bone.local.rotation + phase[index] * .08 * opposite; });
    tracks.push(trackFor(rig, id, keys));
  });
  const clip: AnimationClip = { id: createId('animation'), name: options.name?.trim() || 'Full two-segment walk', fps: rig.timeline.fps, startFrame, endFrame: startFrame + duration, tracks, loopMode: 'cycle', loopStart: startFrame, loopEnd: startFrame + duration, trimStart: startFrame, trimEnd: startFrame + duration };
  rig.animations.push(clip);
  if (options.makeActive !== false) rig.setTimeline({ activeAnimationId: clip.id, startFrame, endFrame: startFrame + duration, currentFrame: startFrame, currentTime: startFrame / rig.timeline.fps });
  rig.update();
  return { clipId: clip.id, trackIds: tracks.map(track => track.id), targetIds, duration };
}
