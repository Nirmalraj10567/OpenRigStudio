import { createId } from './Rig';
import type { Rig } from './Rig';
import type { FacialCalibration, FacialParameters, FacialPreset, FacialProfile, FacialTargetRole, SmartTargetState, SerializableValue, AnimationClip } from './model';
import { identity } from './math';
import { sampleTrack } from './animation';

export const FACIAL_ROLES: readonly FacialTargetRole[] = ['head', 'leftEye', 'rightEye', 'leftPupil', 'rightPupil', 'leftBrow', 'rightBrow', 'mouth', 'openMouth', 'jaw'];
export const DEFAULT_FACIAL_PARAMETERS: FacialParameters = {
  blinkLeft: 0, blinkRight: 0, browLeft: 0, browRight: 0, eyeX: 0, eyeY: 0,
  headYaw: 0, headPitch: 0, headRoll: 0, smile: 0, mouthOpen: 0,
};
const clamp = (value: unknown, min = -1, max = 1) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const isFacialTarget = (rig: Pick<Rig, 'facialProfiles'>, id: string) => rig.facialProfiles.some(profile => profile.id === id);
export const FACIAL_LABELS: Record<keyof FacialParameters, string> = { blinkLeft: 'Left blink', blinkRight: 'Right blink', browLeft: 'Left eyebrow', browRight: 'Right eyebrow', eyeX: 'Look horizontal', eyeY: 'Look vertical', headYaw: 'Head turn', headPitch: 'Head pitch', headRoll: 'Head tilt', smile: 'Smile', mouthOpen: 'Mouth open' };
export const FACIAL_CHANNELS = Object.keys(DEFAULT_FACIAL_PARAMETERS) as Array<keyof FacialParameters>;

export function normalizeFacialParameters(value: unknown): FacialParameters {
  const source = record(value) ? value : {};
  return {
    blinkLeft: clamp(source.blinkLeft, 0, 1), blinkRight: clamp(source.blinkRight, 0, 1),
    browLeft: clamp(source.browLeft), browRight: clamp(source.browRight),
    eyeX: clamp(source.eyeX), eyeY: clamp(source.eyeY),
    headYaw: clamp(source.headYaw, -90, 90), headPitch: clamp(source.headPitch, -60, 60), headRoll: clamp(source.headRoll, -45, 45),
    smile: clamp(source.smile), mouthOpen: clamp(source.mouthOpen, 0, 1),
  };
}

export function normalizeFacialProfiles(value: unknown, validIds: Set<string>): FacialProfile[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.slice(0, 32).flatMap(raw => {
    if (!record(raw) || typeof raw.id !== 'string' || !raw.id || ids.has(raw.id) || !record(raw.targets) || !record(raw.baseline)) return [];
    const targets: Partial<Record<FacialTargetRole, string>> = {};
    const targetValues = raw.targets as Record<string, unknown>;
    FACIAL_ROLES.forEach(role => { const id = targetValues[role]; if (typeof id === 'string' && validIds.has(id)) targets[role] = id; });
    const baseline: Record<string, SmartTargetState> = {};
    Object.entries(raw.baseline).forEach(([id, state]) => {
      if (!validIds.has(id) || !record(state) || !record(state.local)) return;
      const local = state.local as Record<string, unknown>;
      if (!['x', 'y', 'rotation', 'scaleX', 'scaleY'].every(key => Number.isFinite(local[key]))) return;
      baseline[id] = { local: { ...identity(), ...(state.local as SmartTargetState['local']) },
        ...(Number.isFinite(state.opacity) ? { opacity: state.opacity as number } : {}),
        ...(typeof state.visible === 'boolean' ? { visible: state.visible } : {}),
        ...(Number.isFinite(state.zIndex) ? { zIndex: state.zIndex as number } : {}) };
    });
    const calibration: FacialCalibration = { neutral: normalizeFacialParameters(record(raw.calibration) ? raw.calibration.neutral : undefined),
      yawRange: clamp(record(raw.calibration) ? raw.calibration.yawRange ?? 45 : 45, 1, 180),
      pitchRange: clamp(record(raw.calibration) ? raw.calibration.pitchRange ?? 30 : 30, 1, 90),
      rollRange: clamp(record(raw.calibration) ? raw.calibration.rollRange ?? 20 : 20, 1, 90) };
    const presets: FacialPreset[] = Array.isArray(raw.presets) ? raw.presets.slice(0, 64).flatMap(item => record(item) && typeof item.id === 'string' && typeof item.name === 'string'
      ? [{ id: item.id, name: item.name.slice(0, 100), values: normalizeFacialParameters(item.values) }] : []) : defaultFacialPresets();
    ids.add(raw.id);
    return [{ id: raw.id, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 100) : 'Face profile', enabled: raw.enabled !== false, targets, baseline,
      values: normalizeFacialParameters(raw.values), blink: { enabled: record(raw.blink) && raw.blink.enabled === true,
        interval: record(raw.blink) ? clamp(raw.blink.interval ?? 3.8, .5, 30) : 3.8, duration: record(raw.blink) ? clamp(raw.blink.duration ?? .18, .05, 1) : .18 },
      ...(typeof raw.viewSetId === 'string' ? { viewSetId: raw.viewSetId } : {}), calibration, presets }];
  });
}

export function defaultFacialPresets(): FacialPreset[] {
  return [
    { id: 'neutral', name: 'Neutral', values: normalizeFacialParameters({}) },
    { id: 'smile', name: 'Smile', values: normalizeFacialParameters({ smile: 1, browLeft: .15, browRight: .15 }) },
    { id: 'blink', name: 'Blink', values: normalizeFacialParameters({ blinkLeft: 1, blinkRight: 1 }) },
    { id: 'surprised', name: 'Surprised', values: normalizeFacialParameters({ mouthOpen: .9, browLeft: .8, browRight: .8, eyeY: -.1 }) },
    { id: 'talking', name: 'Talking', values: normalizeFacialParameters({ mouthOpen: .55, smile: .1 }) },
  ];
}

export function inferFacialTargets(rig: Rig): Partial<Record<FacialTargetRole, string>> {
  const all = [...rig.bones.values(), ...rig.layers.values()];
  const find = (patterns: RegExp[]) => all.find(item => patterns.some(pattern => pattern.test(item.name)))?.id;
  return {
    head: find([/head|face|skull/i]), leftEye: find([/left.*eye|eye.*left|eye\s*l/i]), rightEye: find([/right.*eye|eye.*right|eye\s*r/i]),
    leftPupil: find([/left.*pupil|pupil.*left/i]), rightPupil: find([/right.*pupil|pupil.*right/i]),
    leftBrow: find([/left.*brow|brow.*left/i]), rightBrow: find([/right.*brow|brow.*right/i]), mouth: find([/mouth.*rest|smile|lip/i]), openMouth: find([/mouth.*open|open.*mouth/i]), jaw: find([/jaw|chin/i]),
  };
}

function targetState(rig: Rig, id: string): SmartTargetState | null {
  const target = rig.bones.get(id) ?? rig.layers.get(id);
  if (!target) return null;
  const layer = rig.layers.get(id);
  return { local: { ...target.local }, ...(layer ? { opacity: layer.opacity, visible: layer.visible, zIndex: layer.zIndex } : {}) };
}

export function createFacialProfile(rig: Rig, name: string, targets: Partial<Record<FacialTargetRole, string>> = inferFacialTargets(rig)): string | null {
  if (rig.facialProfiles.length >= 32) return null;
  const validTargets: Partial<Record<FacialTargetRole, string>> = {};
  const baseline: Record<string, SmartTargetState> = {};
  FACIAL_ROLES.forEach(role => { const id = targets[role]; const state = id ? targetState(rig, id) : null; if (id && state) { validTargets[role] = id; baseline[id] = state; } });
  if (!Object.keys(validTargets).length) return null;
  const id = createId('face');
  rig.facialProfiles.push({ id, name: name.trim() || 'Face profile', enabled: true, targets: validTargets, baseline,
    values: normalizeFacialParameters({}), blink: { enabled: true, interval: 3.8, duration: .18 },
    calibration: { neutral: normalizeFacialParameters({}), yawRange: 45, pitchRange: 30, rollRange: 20 }, presets: defaultFacialPresets() });
  rig.update(); return id;
}

export function facialValues(value: unknown): FacialParameters { return normalizeFacialParameters(value); }

export function automaticBlink(seconds: number, interval = 3.8, duration = .18): number {
  if (!Number.isFinite(seconds) || seconds < 0 || interval <= 0 || duration <= 0) return 0;
  const phase = seconds % interval;
  return phase < interval - duration ? 0 : Math.sin(Math.PI * (phase - interval + duration) / duration) ** 2;
}

export function sampledFacialValues(rig: Rig, profile: FacialProfile): FacialParameters {
  const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  const track = clip?.tracks.find(item => item.targetId === profile.id && item.property === 'facial');
  const values = normalizeFacialParameters(track ? sampleTrack(track, rig.timeline.currentFrame) ?? profile.values : profile.values);
  if (profile.blink.enabled) {
    const blink = automaticBlink(rig.timeline.currentFrame / rig.timeline.fps, profile.blink.interval, profile.blink.duration);
    values.blinkLeft = Math.max(values.blinkLeft, blink); values.blinkRight = Math.max(values.blinkRight, blink);
  }
  return values;
}

export function calibrateFacialValues(raw: FacialParameters, calibration: FacialCalibration): FacialParameters {
  const values = { ...raw };
  FACIAL_CHANNELS.forEach(key => { values[key] -= calibration.neutral[key]; });
  values.headYaw *= 45 / calibration.yawRange; values.headPitch *= 30 / calibration.pitchRange; values.headRoll *= 20 / calibration.rollRange;
  return normalizeFacialParameters(values);
}

export function mapFacialTarget(rig: Rig, profileId: string, role: FacialTargetRole, targetId: string | null): boolean {
  const profile = rig.facialProfiles.find(item => item.id === profileId);
  if (!profile) return false;
  if (!targetId) { delete profile.targets[role]; return true; }
  const state = targetState(rig, targetId); if (!state) return false;
  profile.targets[role] = targetId; profile.baseline[targetId] = state; return true;
}

export function recordFacialKey(rig: Rig, profileId: string, values: FacialParameters, frame = Math.round(rig.timeline.currentFrame)): boolean {
  const profile = rig.facialProfiles.find(item => item.id === profileId); if (!profile || !Number.isFinite(frame) || frame < 0 || frame > 120000) return false;
  frame = Math.round(frame);
  let clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  if (!clip) { clip = { id: createId('animation'), name: 'Facial performance', fps: rig.timeline.fps, startFrame: rig.timeline.startFrame, endFrame: rig.timeline.endFrame, tracks: [] }; rig.animations.push(clip); rig.timeline.activeAnimationId = clip.id; }
  let track = clip.tracks.find(item => item.targetId === profileId && item.property === 'facial');
  if (!track) { track = { id: createId('track'), targetId: profileId, property: 'facial', keyframes: [] }; clip.tracks.push(track); }
  if (!track.keyframes.length && frame > 0) track.keyframes.push({ id: createId('key'), frame: 0, value: clone(profile.values) as unknown as SerializableValue, easing: 'smooth' });
  track.keyframes = [...track.keyframes.filter(key => key.frame !== frame), { id: createId('key'), frame, value: normalizeFacialParameters(values) as unknown as SerializableValue, easing: 'smooth' as const }].sort((a, b) => a.frame - b.frame);
  clip.endFrame = Math.max(clip.endFrame, frame); rig.timeline.endFrame = Math.max(rig.timeline.endFrame, frame); rig.update(); return true;
}

export interface FacialSample { frame: number; values: FacialParameters }
export function recordFacialTake(rig: Rig, profileId: string, samples: FacialSample[]): boolean {
  if (!isFacialTarget(rig, profileId) || !samples.length || samples.length > 18000 || samples.some(sample => !Number.isFinite(sample.frame) || sample.frame < 0 || sample.frame > 120000)) return false;
  // One portable clip per take; callers commit the whole recording atomically.
  const frames = new Map(samples.map(sample => [Math.round(sample.frame), normalizeFacialParameters(sample.values)]));
  const sorted = [...frames].sort(([a], [b]) => a - b), startFrame = sorted[0][0], endFrame = sorted[sorted.length - 1][0] + 1;
  const clip: AnimationClip = { id: createId('animation'), name: 'Facial capture take', fps: rig.timeline.fps, startFrame, endFrame,
    tracks: [{ id: createId('track'), targetId: profileId, property: 'facial', keyframes: sorted.map(([frame, values]) => ({ id: createId('key'), frame, value: values as unknown as SerializableValue, easing: 'linear' })) }] };
  rig.animations.push(clip); rig.setTimeline({ activeAnimationId: clip.id, currentFrame: startFrame, startFrame, endFrame, isPlaying: false, loop: false });
  rig.update(); return true;
}

export function createAudioFacialClip(rig: Rig, profileId: string): AnimationClip | null {
  const profile = rig.facialProfiles.find(item => item.id === profileId); if (!profile || !rig.audio) return null;
  const fps = rig.timeline.fps, endFrame = Math.max(rig.timeline.endFrame, Math.ceil((rig.audio.offsetSeconds + rig.audio.duration) * fps));
  const keyframes: Array<{ id: string; frame: number; value: SerializableValue; easing: 'linear' }> = Array.from({ length: Math.min(18000, Math.ceil(endFrame / 2) + 1) }, (_unused, index) => {
    const frame = Math.min(endFrame, index * 2), time = frame / fps, position = Math.floor((time - rig.audio!.offsetSeconds) / Math.max(.001, rig.audio!.duration) * rig.audio!.peaks.length);
    const rms = Math.max(0, rig.audio!.peaks[position] ?? 0);
    const blink = automaticBlink(time, profile.blink.interval, profile.blink.duration);
    return { id: createId('key'), frame, value: normalizeFacialParameters({ mouthOpen: Math.min(1, Math.max(0, rms - .02) * 4), smile: Math.min(.35, rms * .4), blinkLeft: blink, blinkRight: blink }) as unknown as SerializableValue, easing: 'linear' as const };
  });
  return { id: createId('animation'), name: `${profile.name} · audio facial draft`, fps, startFrame: 0, endFrame, tracks: [{ id: createId('track'), targetId: profileId, property: 'facial', keyframes }] };
}
