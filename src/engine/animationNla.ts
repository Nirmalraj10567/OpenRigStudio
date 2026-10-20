import type { AnimationBlendMode, AnimationClip, AnimationLayer, AnimationTransition, CurveEasing } from './model';
import type { Rig } from './Rig';
import { sampleTrack } from './animation';

let sequence = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++sequence}`;
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function normalizeAnimationLayers(value: unknown, clipIds: Set<string>): AnimationLayer[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.slice(0, 128).flatMap((raw): AnimationLayer[] => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>, clipId = typeof item.clipId === 'string' ? item.clipId : '';
    if (!clipIds.has(clipId)) return [];
    const id = typeof item.id === 'string' && item.id ? item.id : uid('nla'); if (ids.has(id)) return []; ids.add(id);
    const startFrame = Math.max(0, finite(item.startFrame, 0)), endFrame = Math.max(startFrame + 1, finite(item.endFrame, startFrame + 1));
    return [{ id, name: typeof item.name === 'string' ? item.name.slice(0, 100) : 'Animation layer', clipId, startFrame, endFrame,
      sourceStartFrame: finite(item.sourceStartFrame, 0), sourceEndFrame: Number.isFinite(item.sourceEndFrame) ? item.sourceEndFrame as number : undefined,
      speed: clamp(finite(item.speed, 1), -100, 100), offset: finite(item.offset, 0), weight: clamp(finite(item.weight, 1), 0, 1),
      blendMode: item.blendMode === 'additive' ? 'additive' : 'override', loopMode: item.loopMode === 'ping-pong' ? 'ping-pong' : item.loopMode === 'cycle' ? 'cycle' : 'once',
      blendIn: Math.max(0, finite(item.blendIn, 0)), blendOut: Math.max(0, finite(item.blendOut, 0)), muted: item.muted === true, solo: item.solo === true }];
  });
}

export function normalizeAnimationTransitions(value: unknown, layerIds: Set<string>): AnimationTransition[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 256).flatMap((raw, index): AnimationTransition[] => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>, fromLayerId = typeof item.fromLayerId === 'string' ? item.fromLayerId : '', toLayerId = typeof item.toLayerId === 'string' ? item.toLayerId : '';
    if (!layerIds.has(fromLayerId) || !layerIds.has(toLayerId) || fromLayerId === toLayerId) return [];
    return [{ id: typeof item.id === 'string' && item.id ? item.id : `transition-${index}`, fromLayerId, toLayerId, duration: Math.max(0, finite(item.duration, 12)), easing: typeof item.easing === 'string' ? item.easing as CurveEasing : 'smooth' }];
  });
}

export function mapAnimationFrame(frame: number, clip: Pick<AnimationClip, 'startFrame' | 'endFrame' | 'loopMode' | 'loopStart' | 'loopEnd' | 'cycleOffset' | 'playbackRate' | 'trimStart' | 'trimEnd'>, mode = clip.loopMode ?? 'once'): number {
  const start = Math.max(0, clip.trimStart ?? clip.loopStart ?? clip.startFrame), end = Math.max(start + 0.001, clip.trimEnd ?? clip.loopEnd ?? clip.endFrame);
  const rate = finite(clip.playbackRate, 1), offset = finite(clip.cycleOffset, 0), position = start + (frame - clip.startFrame) * rate + offset, duration = end - start;
  if (mode === 'cycle') return start + ((((position - start) % duration) + duration) % duration);
  if (mode === 'ping-pong') { const cycle = duration * 2, wrapped = (((position - start) % cycle) + cycle) % cycle; return start + (wrapped <= duration ? wrapped : cycle - wrapped); }
  return clamp(position, start, end);
}

export function layerWeight(layer: AnimationLayer, frame: number): number {
  if (layer.muted || frame < layer.startFrame || frame > layer.endFrame) return 0;
  const amount = Math.min(frame - layer.startFrame, layer.endFrame - frame);
  const fade = Math.max(0.001, Math.min(layer.blendIn || Infinity, layer.blendOut || Infinity));
  return clamp(Math.min(1, layer.weight) * (fade === Infinity ? 1 : Math.min(1, amount / fade)), 0, 1);
}

export function createAnimationLayer(rig: Rig, hostClipId: string, clipId: string): string | null {
  const host = rig.animations.find(clip => clip.id === hostClipId), source = rig.animations.find(clip => clip.id === clipId);
  if (!host || !source || host === source || rig.smartEditingActionId) return null;
  host.nlaLayers ??= [];
  const startFrame = host.nlaLayers.length ? Math.max(...host.nlaLayers.map(layer => layer.endFrame)) : host.startFrame;
  const id = uid('nla'); host.nlaLayers.push({ id, name: source.name, clipId, startFrame, endFrame: startFrame + Math.max(1, source.endFrame - source.startFrame), sourceStartFrame: source.startFrame, sourceEndFrame: source.endFrame, speed: 1, offset: 0, weight: 1, blendMode: 'override', loopMode: source.loopMode ?? 'once', blendIn: 0, blendOut: 0, muted: false, solo: false });
  rig.update(); return id;
}
export function removeAnimationLayer(rig: Rig, hostClipId: string, layerId: string): boolean {
  const host = rig.animations.find(clip => clip.id === hostClipId); if (!host?.nlaLayers?.some(layer => layer.id === layerId)) return false;
  host.nlaLayers = host.nlaLayers.filter(layer => layer.id !== layerId); host.transitions = host.transitions?.filter(transition => transition.fromLayerId !== layerId && transition.toLayerId !== layerId); rig.update(); return true;
}
export function createCycle(rig: Rig, clipId: string, startFrame: number, endFrame: number, pingPong = false): boolean {
  const clip = rig.animations.find(item => item.id === clipId); if (!clip || !Number.isFinite(startFrame + endFrame) || endFrame <= startFrame) return false;
  clip.loopStart = Math.max(0, Math.round(startFrame)); clip.loopEnd = Math.round(endFrame); clip.loopMode = pingPong ? 'ping-pong' : 'cycle'; clip.trimStart = clip.loopStart; clip.trimEnd = clip.loopEnd; rig.update(); return true;
}
export function trimAnimation(clip: AnimationClip, startFrame: number, endFrame: number): AnimationClip {
  if (!Number.isFinite(startFrame + endFrame) || endFrame <= startFrame) return clip;
  const start = Math.max(0, Math.round(startFrame)), end = Math.round(endFrame);
  return { ...clip, trimStart: start, trimEnd: end, startFrame: start, endFrame: end, tracks: clip.tracks.map(track => {
    const inside = track.keyframes.filter(key => key.frame >= start && key.frame <= end), atStart = sampleTrack(track, start), atEnd = sampleTrack(track, end);
    const keyframes = [...inside];
    if (atStart !== undefined && !keyframes.some(key => key.frame === start)) keyframes.push({ id: uid('trim-key'), frame: start, value: atStart, easing: 'linear' });
    if (atEnd !== undefined && !keyframes.some(key => key.frame === end)) keyframes.push({ id: uid('trim-key'), frame: end, value: atEnd, easing: 'linear' });
    return { ...track, keyframes: keyframes.sort((a, b) => a.frame - b.frame) };
  }) };
}
export function stretchAnimation(clip: AnimationClip, factor: number): AnimationClip {
  if (!Number.isFinite(factor) || factor <= 0) return clip;
  const start = clip.startFrame, duration = Math.max(1, clip.endFrame - start);
  return { ...clip, endFrame: start + Math.max(1, Math.round(duration * factor)), playbackRate: (clip.playbackRate ?? 1) / factor, tracks: clip.tracks.map(track => ({ ...track, keyframes: track.keyframes.map(key => ({ ...key, frame: start + Math.round((key.frame - start) * factor) })) })) };
}
export function retimeAnimation(clip: AnimationClip, startFrame: number, endFrame: number): AnimationClip {
  if (endFrame <= startFrame || !Number.isFinite(startFrame + endFrame)) return clip;
  const sourceStart = clip.startFrame, sourceDuration = Math.max(1, clip.endFrame - sourceStart), targetDuration = endFrame - startFrame, factor = targetDuration / sourceDuration;
  return { ...clip, startFrame, endFrame, tracks: clip.tracks.map(track => ({ ...track, keyframes: track.keyframes.map(key => ({ ...key, frame: Math.round(startFrame + (key.frame - sourceStart) * factor) })) })) };
}
export function addAnimationTransition(rig: Rig, hostClipId: string, fromLayerId: string, toLayerId: string, duration: number): boolean {
  const host = rig.animations.find(clip => clip.id === hostClipId); if (fromLayerId === toLayerId || !host?.nlaLayers?.some(layer => layer.id === fromLayerId) || !host.nlaLayers.some(layer => layer.id === toLayerId)) return false;
  host.transitions = [...(host.transitions ?? []).filter(item => !(item.fromLayerId === fromLayerId && item.toLayerId === toLayerId)), { id: uid('transition'), fromLayerId, toLayerId, duration: Math.max(0, duration), easing: 'smooth' }]; rig.update(); return true;
}
