import type { AnimationClip, AnimationTrack, ChannelCurve, CurveEasing, CurveTangent, Keyframe, SerializableValue } from './model';
import { keyframeRefId, selectedKeyframes } from './keyframeEditing';
import type { KeyframeRef } from './keyframeEditing';
import { sampleTrack } from './animation';
import { normalizeCurveChannels } from './animationCurves';

export interface GraphChannel { path: string; label: string; color: string }
export const GRAPH_CHANNELS: GraphChannel[] = [
  { path: '$', label: 'Value', color: '#70c8be' }, { path: 'x', label: 'X', color: '#f1a36f' },
  { path: 'y', label: 'Y', color: '#72b7ff' }, { path: 'rotation', label: 'Rotation', color: '#d99bff' },
  { path: 'scaleX', label: 'Scale X', color: '#e8c66e' }, { path: 'scaleY', label: 'Scale Y', color: '#9edb78' },
];
const record = (value: unknown): value is Record<string, SerializableValue> => !!value && typeof value === 'object' && !Array.isArray(value);
const numeric = (value: SerializableValue | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

export function getGraphValue(value: SerializableValue, path: string): number | null {
  if (path === '$') return numeric(value) ? value : null;
  const result = path.split('.').reduce<SerializableValue | undefined>((current, key) => record(current) ? current[key] : undefined, value);
  return numeric(result) ? result : null;
}
export function setGraphValue(value: SerializableValue, path: string, next: number): SerializableValue {
  if (path === '$') return next;
  if (!record(value)) return value;
  const result = JSON.parse(JSON.stringify(value)) as Record<string, SerializableValue>;
  let cursor = result;
  const parts = path.split('.');
  parts.forEach((part, index) => {
    if (index === parts.length - 1) cursor[part] = next;
    else { if (!record(cursor[part])) cursor[part] = {}; cursor = cursor[part] as Record<string, SerializableValue>; }
  });
  return result;
}
export function graphChannels(track: AnimationTrack): GraphChannel[] {
  const paths = new Set<string>(); track.keyframes.forEach(key => {
    const collect = (value: SerializableValue, path: string) => {
      if (numeric(value)) paths.add(path);
      else if (record(value)) Object.entries(value).forEach(([key, child]) => collect(child, path === '$' ? key : `${path}.${key}`));
    }; collect(key.value, '$');
  });
  return GRAPH_CHANNELS.filter(channel => paths.has(channel.path)).concat([...paths].filter(path => !GRAPH_CHANNELS.some(channel => channel.path === path)).map(path => ({ path, label: path, color: '#aebbc1' })));
}
export function keyCurve(track: AnimationTrack, keyframeId: string, path: string): ChannelCurve {
  const key = track.keyframes.find(item => item.id === keyframeId); return key?.curves?.[path] ?? {};
}
export function updateCurve(clip: AnimationClip, selection: KeyframeRef[], path: string, patch: Partial<ChannelCurve>, side?: 'inTangent' | 'outTangent'): AnimationClip {
  const ids = new Set(selection.map(keyframeRefId));
  return {
    ...clip,
    tracks: clip.tracks.map(track => ({
      ...track,
      keyframes: track.keyframes.map(key => {
        if (!ids.has(keyframeRefId({ trackId: track.id, keyframeId: key.id }))) return key;
        const current = key.curves?.[path] ?? {};
        const next = side && patch[side]
          ? { ...current, [side]: { ...(current[side] ?? {}), ...(patch[side] as CurveTangent) } }
          : { ...current, ...patch };
        return { ...key, curves: { ...(key.curves ?? {}), [path]: next } };
      }),
    })),
  };
}
export function setCurvePreset(clip: AnimationClip, selection: KeyframeRef[], path: string, easing: CurveEasing): AnimationClip {
  return updateCurve(clip, selection, path, { easing });
}
export function setTangentLocked(clip: AnimationClip, selection: KeyframeRef[], path: string, locked: boolean): AnimationClip {
  return updateCurve(clip, selection, path, { locked });
}
export function setTangent(clip: AnimationClip, selection: KeyframeRef[], path: string, side: 'inTangent' | 'outTangent', tangent: CurveTangent, locked = false): AnimationClip {
  if (!Number.isFinite(tangent.frame + tangent.value)) return clip;
  const ids = new Set(selection.map(keyframeRefId));
  const result = JSON.parse(JSON.stringify(clip)) as AnimationClip;
  result.tracks.forEach(track => {
    const keys = [...track.keyframes].sort((a, b) => a.frame - b.frame);
    keys.forEach((key, index) => {
      if (!ids.has(keyframeRefId({ trackId: track.id, keyframeId: key.id })) || getGraphValue(key.value, path) === null) return;
      key.curves ??= {}; const curve = key.curves[path] ??= {};
      const dt = side === 'inTangent' ? Math.min(-.001, tangent.frame) : Math.max(.001, tangent.frame);
      curve[side] = { frame: dt, value: tangent.value }; curve.easing = 'bezier'; curve.locked = locked;
      if (locked) {
        const opposite = side === 'inTangent' ? 'outTangent' : 'inTangent';
        const length = curve[opposite]?.frame ?? -dt;
        curve[opposite] = { frame: length, value: tangent.value / dt * length };
      }
      if (index > 0 && (side === 'inTangent' || locked)) {
        const previous = keys[index - 1]; previous.curves ??= {}; previous.curves[path] = { ...previous.curves[path], easing: 'bezier' };
      }
    });
  }); return result;
}
export function graphKeyframes(clip: AnimationClip, selection: KeyframeRef[], path: string): Array<{ track: AnimationTrack; key: Keyframe; value: number }> {
  return selectedKeyframes(clip, selection).flatMap(({ track, keyframe }) => {
    const value = getGraphValue(keyframe.value, path); return value === null ? [] : [{ track, key: keyframe, value }];
  });
}

/** Extract an aggregate pose component without changing track ownership. */
export function graphScalarTrack(track: AnimationTrack, path: string): AnimationTrack<number> {
  const rotation = path === 'rotation' || path === '$' && track.property === 'rotation';
  let previous: number | undefined;
  return { ...track, property: 'graphValue', keyframes: [...track.keyframes].sort((a, b) => a.frame - b.frame).flatMap(key => {
    let value = getGraphValue(key.value, path); if (value === null) return [];
    if (rotation && previous !== undefined) value = previous + Math.atan2(Math.sin(value - previous), Math.cos(value - previous));
    previous = value;
    return [{ ...key, value, curves: key.curves?.[path] ? { $: key.curves[path] } : undefined }];
  }) };
}
export function graphVelocity(track: AnimationTrack, path: string, frame: number, fps: number): number {
  const scalar = graphScalarTrack(track, path), keys = scalar.keyframes;
  if (keys.length < 2 || frame < keys[0].frame || frame > keys[keys.length - 1].frame) return 0;
  const step = .001;
  const before = Math.max(keys[0].frame, frame - step), after = Math.min(keys[keys.length - 1].frame, frame + step);
  return after === before ? 0 : ((sampleTrack(scalar, after) ?? 0) - (sampleTrack(scalar, before) ?? 0)) / (after - before) * fps;
}
export function editGraphKey(clip: AnimationClip, ref: KeyframeRef, path: string, frame: number, value: number): AnimationClip {
  if (!Number.isFinite(frame + value)) return clip;
  return { ...clip, endFrame: Math.max(clip.endFrame, Math.round(frame)), tracks: clip.tracks.map(track => {
    const key = track.keyframes.find(item => item.id === ref.keyframeId); if (track.id !== ref.trackId || !key || getGraphValue(key.value, path) === null) return track;
    const next = { ...key, frame: Math.max(0, Math.round(frame)), value: setGraphValue(key.value, path, value) };
    return { ...track, keyframes: [...track.keyframes.filter(item => item.id !== key.id && item.frame !== next.frame), next].sort((a, b) => a.frame - b.frame) };
  }) };
}

export function automaticTangents(clip: AnimationClip, selection: KeyframeRef[], path: string, mode: 'smooth' | 'flat' | 'linear' | 'auto-ease', strength = 1): AnimationClip {
  const ids = new Set(selection.map(keyframeRefId)), result = JSON.parse(JSON.stringify(clip)) as AnimationClip;
  result.tracks.forEach(track => {
    const scalar = graphScalarTrack(track, path), keys = scalar.keyframes;
    keys.forEach((point, index) => {
      if (!ids.has(keyframeRefId({ trackId: track.id, keyframeId: point.id }))) return;
      const before = keys[index - 1], after = keys[index + 1], key = track.keyframes.find(item => item.id === point.id)!;
      const left = before ? (point.value - before.value) / (point.frame - before.frame) : 0;
      const right = after ? (after.value - point.value) / (after.frame - point.frame) : 0;
      const center = before && after ? (after.value - before.value) / (after.frame - before.frame) : 0;
      // Auto-ease is monotone: flatten extrema and cap slopes against adjacent secants.
      const monotone = left * right <= 0 ? 0 : Math.sign(center) * Math.min(Math.abs(center), 3 * Math.min(Math.abs(left), Math.abs(right)));
      const slope = mode === 'flat' ? 0 : mode === 'auto-ease' ? monotone * (1 - Math.max(0, Math.min(1, strength))) : center;
      const inFrame = -(point.frame - (before?.frame ?? point.frame - 3)) / 3, outFrame = ((after?.frame ?? point.frame + 3) - point.frame) / 3;
      key.curves ??= {}; key.curves[path] = { easing: 'bezier', locked: mode !== 'linear',
        inTangent: { frame: inFrame, value: inFrame * (mode === 'linear' ? left : slope) },
        outTangent: { frame: outFrame, value: outFrame * (mode === 'linear' ? right : slope) } };
      if (before) {
        const previous = track.keyframes.find(item => item.id === before.id)!; previous.curves ??= {};
        previous.curves[path] = { ...previous.curves[path], easing: 'bezier' };
      }
    });
  }); return result;
}
export function setGraphVelocity(clip: AnimationClip, selection: KeyframeRef[], path: string, side: 'inTangent' | 'outTangent', unitsPerSecond: number, fps: number): AnimationClip {
  if (!Number.isFinite(unitsPerSecond) || !Number.isFinite(fps) || fps <= 0) return clip;
  let result = clip;
  selectedKeyframes(clip, selection).forEach(({ track, keyframe }) => {
    const curve = keyframe.curves?.[path];
    const tangent = curve?.[side] ?? { frame: side === 'inTangent' ? -3 : 3, value: 0 };
    result = setTangent(result, [{ trackId: track.id, keyframeId: keyframe.id }], path, side, { ...tangent, value: unitsPerSecond / fps * tangent.frame }, curve?.locked ?? false);
  }); return result;
}

export interface CopiedCurve { sourcePath: string; keys: Array<{ offset: number; value: number; easing?: CurveEasing; curve?: ChannelCurve }> }
export function copyCurve(track: AnimationTrack, path: string): CopiedCurve {
  const keys = graphScalarTrack(track, path).keyframes, origin = keys[0]?.frame ?? 0;
  return { sourcePath: path, keys: keys.map(key => ({ offset: key.frame - origin, value: key.value, easing: key.easing,
    ...(key.curves?.$ ? { curve: JSON.parse(JSON.stringify(key.curves.$)) } : {}) })) };
}
let sequence = 0;
export function pasteCurve(clip: AnimationClip, trackId: string, path: string, clipboard: CopiedCurve, atFrame: number): AnimationClip {
  if (!Number.isFinite(atFrame) || !clipboard.keys.length) return clip;
  const result = JSON.parse(JSON.stringify(clip)) as AnimationClip, track = result.tracks.find(item => item.id === trackId);
  if (!track || !graphChannels(track).some(channel => channel.path === path)) return clip;
  clipboard.keys.forEach(entry => {
    if (!Number.isFinite(entry.offset + entry.value) || entry.offset < 0) return;
    const frame = Math.max(0, Math.round(atFrame + entry.offset)), existing = track.keyframes.find(key => key.frame === frame);
    const base = existing?.value ?? sampleTrack(track, frame) ?? track.keyframes[0]?.value;
    if (base === undefined) return;
    const curve = normalizeCurveChannels({ [path]: { ...entry.curve, easing: entry.curve?.easing ?? entry.easing } });
    const key: Keyframe = { ...(existing ?? {}), id: existing?.id ?? `graph-key-${Date.now().toString(36)}-${++sequence}`, frame,
      value: setGraphValue(base, path, entry.value), curves: { ...existing?.curves, ...curve } };
    track.keyframes = [...track.keyframes.filter(item => item.frame !== frame), key].sort((a, b) => a.frame - b.frame);
    result.endFrame = Math.max(result.endFrame, frame);
  }); return result;
}
export function filterMotionCurve(clip: AnimationClip, trackId: string, path: string, strength = .5): AnimationClip {
  const result = JSON.parse(JSON.stringify(clip)) as AnimationClip, track = result.tracks.find(item => item.id === trackId); if (!track) return clip;
  const keys = graphScalarTrack(track, path).keyframes, amount = Math.max(0, Math.min(1, strength));
  keys.slice(1, -1).forEach((point, i) => {
    const before = keys[i], after = keys[i + 2];
    const average = before.value + (after.value - before.value) * (point.frame - before.frame) / (after.frame - before.frame);
    const key = track.keyframes.find(item => item.id === point.id)!; key.value = setGraphValue(key.value, path, point.value + (average - point.value) * amount);
  }); return result;
}
