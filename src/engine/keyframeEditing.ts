import { createId } from './Rig';
import type { AnimationClip, AnimationTrack, Keyframe, SerializableValue } from './model';

/** Stable IDs keep selection intact when keys are retimed. */
export interface KeyframeRef { trackId: string; keyframeId: string }
export interface CopiedKeyframe {
  targetId: string;
  property: string;
  offset: number;
  value: SerializableValue;
  easing?: Keyframe['easing'];
  curves?: Keyframe['curves'];
}
export interface KeyframeEditResult { clip: AnimationClip; selection: KeyframeRef[] }

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const keyframeRefId = (ref: KeyframeRef): string => JSON.stringify([ref.trackId, ref.keyframeId]);

export function selectedKeyframes(clip: AnimationClip, selection: KeyframeRef[]) {
  const ids = new Set(selection.map(keyframeRefId));
  return clip.tracks.flatMap(track => track.keyframes.flatMap(keyframe =>
    ids.has(keyframeRefId({ trackId: track.id, keyframeId: keyframe.id })) ? [{ track, keyframe }] : []));
}

/** Move the whole selection together, snapping to frames and clamping at zero. */
export function moveKeyframes(clip: AnimationClip, selection: KeyframeRef[], delta: number): KeyframeEditResult {
  const keys = selectedKeyframes(clip, selection);
  if (!keys.length || !Number.isFinite(delta)) return { clip, selection: [] };
  const minimum = keys.reduce((min, { keyframe }) => Math.min(min, keyframe.frame), Infinity);
  const offset = Math.max(Math.round(delta), -minimum);
  const refs = keys.map(({ track, keyframe }) => ({ trackId: track.id, keyframeId: keyframe.id }));
  if (!offset) return { clip, selection: refs };
  const ids = new Set(refs.map(keyframeRefId));
  const tracks = clip.tracks.map(track => {
    const moving = track.keyframes.filter(keyframe => ids.has(keyframeRefId({ trackId: track.id, keyframeId: keyframe.id })));
    if (!moving.length) return track;
    const frames = new Set(moving.map(keyframe => keyframe.frame + offset));
    const remaining = track.keyframes.filter(keyframe =>
      !ids.has(keyframeRefId({ trackId: track.id, keyframeId: keyframe.id })) && !frames.has(keyframe.frame));
    return { ...track, keyframes: [...remaining, ...moving.map(keyframe => ({ ...keyframe, frame: keyframe.frame + offset }))].sort((a, b) => a.frame - b.frame) };
  });
  return {
    clip: { ...clip, startFrame: Math.min(clip.startFrame, minimum + offset), endFrame: keys.reduce((max, { keyframe }) => Math.max(max, keyframe.frame + offset), clip.endFrame), tracks },
    selection: refs,
  };
}

export function copyKeyframes(clip: AnimationClip, selection: KeyframeRef[]): CopiedKeyframe[] {
  const keys = selectedKeyframes(clip, selection);
  if (!keys.length) return [];
  const origin = keys.reduce((min, { keyframe }) => Math.min(min, keyframe.frame), Infinity);
  return keys.map(({ track, keyframe }) => ({
    targetId: track.targetId, property: track.property,
    offset: keyframe.frame - origin, value: copy(keyframe.value), easing: keyframe.easing, ...(keyframe.curves ? { curves: copy(keyframe.curves) } : {}),
  }));
}

/** Paste begins at the playhead and preserves channel assignments and spacing. */
export function pasteKeyframes(clip: AnimationClip, clipboard: CopiedKeyframe[], frame: number): KeyframeEditResult {
  if (!Number.isFinite(frame) || !clipboard.length) return { clip, selection: [] };
  const origin = Math.max(0, Math.round(frame));
  const tracks: AnimationTrack[] = clip.tracks.map(track => ({ ...track, keyframes: [...track.keyframes] }));
  const selection: KeyframeRef[] = [];
  let endFrame = clip.endFrame;
  clipboard.forEach(entry => {
    if (!Number.isFinite(entry.offset) || entry.offset < 0) return;
    let track = tracks.find(item => item.targetId === entry.targetId && item.property === entry.property);
    if (!track) {
      track = { id: createId('track'), targetId: entry.targetId, property: entry.property, keyframes: [] };
      tracks.push(track);
    }
    const keyframe = { id: createId('key'), frame: origin + Math.round(entry.offset), value: copy(entry.value), easing: entry.easing, ...(entry.curves ? { curves: copy(entry.curves) } : {}) };
    track.keyframes = [...track.keyframes.filter(key => key.frame !== keyframe.frame), keyframe].sort((a, b) => a.frame - b.frame);
    selection.push({ trackId: track.id, keyframeId: keyframe.id });
    endFrame = Math.max(endFrame, keyframe.frame);
  });
  return { clip: { ...clip, startFrame: Math.min(clip.startFrame, origin), endFrame, tracks }, selection };
}

export function deleteKeyframes(clip: AnimationClip, selection: KeyframeRef[]): AnimationClip {
  const ids = new Set(selection.map(keyframeRefId));
  return { ...clip, tracks: clip.tracks.map(track => ({
    ...track, keyframes: track.keyframes.filter(keyframe => !ids.has(keyframeRefId({ trackId: track.id, keyframeId: keyframe.id }))),
  })) };
}

export function setKeyframeInterpolation(clip: AnimationClip, selection: KeyframeRef[], easing: NonNullable<Keyframe['easing']>): AnimationClip {
  const ids = new Set(selection.map(keyframeRefId));
  return { ...clip, tracks: clip.tracks.map(track => ({
    ...track, keyframes: track.keyframes.map(keyframe => ids.has(keyframeRefId({ trackId: track.id, keyframeId: keyframe.id })) ? { ...keyframe, easing,
      ...(keyframe.curves ? { curves: Object.fromEntries(Object.entries(keyframe.curves).map(([path, curve]) => [path, { ...curve, easing }])) } : {}),
    } : keyframe),
  })) };
}
