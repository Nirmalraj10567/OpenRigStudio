import { interpolateTransform, lerp, lerpAngle } from './math';
import type {
  AnimatedProperty,
  AnimationClip,
  AnimationTrack,
  Keyframe,
  SerializableValue,
  TimelineState,
} from './model';
import type { Transform2D } from './math';
import { easeCurve, sampleBezierValue } from './animationCurves';

export function frameToTime(frame: number, fps = 24): number {
  return frame / Math.max(0.001, fps);
}

export function timeToFrame(time: number, fps = 24): number {
  return time * Math.max(0.001, fps);
}

export function clampFrame(frame: number, startFrame: number, endFrame: number): number {
  return Math.min(Math.max(frame, Math.min(startFrame, endFrame)), Math.max(startFrame, endFrame));
}

export function wrapFrame(frame: number, startFrame: number, endFrame: number): number {
  const start = Math.min(startFrame, endFrame);
  const end = Math.max(startFrame, endFrame);
  const range = Math.max(1, end - start);
  return start + (((frame - start) % range) + range) % range;
}

export function advanceTimeline(timeline: TimelineState, deltaSeconds: number): TimelineState {
  const fps = Math.max(0.001, timeline.fps);
  const duration = Math.max(0, timeline.endFrame - timeline.startFrame);
  // Frames and seconds are absolute project positions, including nonzero ranges.
  const rawFrame = timeline.currentFrame + (Number.isFinite(deltaSeconds) ? deltaSeconds : 0) * fps;
  let frame = rawFrame;
  if (timeline.loop && duration > 0) {
    frame = wrapFrame(rawFrame, timeline.startFrame, timeline.endFrame);
  } else {
    frame = clampFrame(rawFrame, timeline.startFrame, timeline.endFrame);
  }
  return {
    ...timeline,
    currentFrame: frame,
    currentTime: frameToTime(frame, fps),
    isPlaying: timeline.isPlaying && (timeline.loop || frame < timeline.endFrame),
  };
}

function isTransform(value: unknown): value is Transform2D {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<Transform2D>;
  return [candidate.x, candidate.y, candidate.rotation, candidate.scaleX, candidate.scaleY]
    .every((item) => typeof item === 'number');
}

/** Deep interpolation for JSON-safe values used by keyframes. */
export function interpolateValue(a: SerializableValue, b: SerializableValue, amount: number, property?: string): SerializableValue {
  const t = Number.isFinite(amount) ? amount : 0;
  if (typeof a === 'number' && typeof b === 'number') {
    return property === 'rotation' ? lerpAngle(a, b, t) : lerp(a, b, t);
  }
  if (isTransform(a) && isTransform(b)) return interpolateTransform(a, b, t) as unknown as SerializableValue;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((item, index) => interpolateValue(item, b[index], t, property));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const result: Record<string, SerializableValue> = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    keys.forEach((key) => {
      const left = (a as Record<string, SerializableValue>)[key];
      const right = (b as Record<string, SerializableValue>)[key];
      result[key] = left === undefined ? right : right === undefined ? left : interpolateValue(left, right, t, key);
    });
    return result;
  }
  return t < 1 ? a : b;
}

function sortedKeyframes<T>(track: AnimationTrack<T>): Array<Keyframe<T>> {
  return [...track.keyframes].sort((a, b) => a.frame - b.frame);
}

export function sampleTrack<T extends SerializableValue>(track: AnimationTrack<T>, frame: number): T | undefined {
  const keyframes = sortedKeyframes(track);
  if (keyframes.length === 0) return undefined;
  if (frame <= keyframes[0].frame) return keyframes[0].value;
  const last = keyframes[keyframes.length - 1];
  if (frame >= last.frame) return last.value;
  const nextIndex = keyframes.findIndex((keyframe) => keyframe.frame >= frame);
  const next = keyframes[Math.max(1, nextIndex)];
  const previous = keyframes[Math.max(0, nextIndex - 1)];
  if (frame === next.frame) return next.value;
  if (next.frame === previous.frame) return previous.value;
  const duration = next.frame - previous.frame, elapsed = frame - previous.frame;
  const sample = (a: SerializableValue, b: SerializableValue, path: string, property: string): SerializableValue => {
    if (typeof a === 'number' && typeof b === 'number') {
      const curve = previous.curves?.[path], easing = curve?.easing ?? previous.easing ?? 'linear';
      const end = property === 'rotation' ? a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) : b;
      if (easing === 'bezier') return sampleBezierValue(a, end, duration, elapsed, curve?.outTangent, next.curves?.[path]?.inTangent);
      return a + (end - a) * easeCurve(elapsed / duration, easing);
    }
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.map((value, index) => sample(value, b[index], `${path === '$' ? '' : path + '.'}${index}`, property));
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      const result: Record<string, SerializableValue> = {};
      new Set([...Object.keys(a), ...Object.keys(b)]).forEach(key => {
        const left = a[key], right = b[key];
        result[key] = left === undefined ? right : right === undefined ? left : sample(left, right, path === '$' ? key : `${path}.${key}`, key);
      }); return result;
    }
    return a;
  };
  return sample(previous.value, next.value, '$', track.property) as T;
}

export function sampleAnimation(clip: AnimationClip, frame: number): Map<string, SerializableValue> {
  const values = new Map<string, SerializableValue>();
  clip.tracks.forEach((track) => {
    const value = sampleTrack(track, frame);
    if (value !== undefined) values.set(`${track.targetId}:${track.property}`, value);
  });
  return values;
}

export function findTrack(
  clip: AnimationClip,
  targetId: string,
  property: AnimatedProperty,
): AnimationTrack | undefined {
  return clip.tracks.find((track) => track.targetId === targetId && track.property === property);
}

export function upsertKeyframe<T extends SerializableValue>(
  track: AnimationTrack<T>,
  keyframe: Keyframe<T>,
): AnimationTrack<T> {
  const keyframes = track.keyframes.filter((item) => item.frame !== keyframe.frame);
  keyframes.push({ ...keyframe });
  keyframes.sort((a, b) => a.frame - b.frame);
  return { ...track, keyframes };
}

export function removeKeyframe<T extends SerializableValue>(track: AnimationTrack<T>, frame: number): AnimationTrack<T> {
  return { ...track, keyframes: track.keyframes.filter((keyframe) => keyframe.frame !== frame) };
}
