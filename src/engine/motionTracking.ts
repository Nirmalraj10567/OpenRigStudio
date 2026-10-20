import { createId, Rig, type Bone } from './Rig';
import type { AnimationClip, AnimationTrack, Keyframe, SerializableValue } from './model';
import type { Transform2D } from './math';

export type TrackedLandmarkName =
  | 'nose' | 'neck' | 'leftShoulder' | 'rightShoulder' | 'leftElbow' | 'rightElbow'
  | 'leftWrist' | 'rightWrist' | 'leftHip' | 'rightHip' | 'leftKnee' | 'rightKnee'
  | 'leftAnkle' | 'rightAnkle' | 'leftHeel' | 'rightHeel' | 'leftFoot' | 'rightFoot';

export type TrackedPoint = {
  x: number;
  y: number;
  z?: number;
  visibility: number;
  confidence: number;
};

export type TrackedFrame = {
  frame: number;
  timeSeconds: number;
  landmarks: Partial<Record<TrackedLandmarkName, TrackedPoint>>;
};

export type TrackingView = 'front' | 'side' | 'back';
export type TrackingFacing = 'left' | 'right' | 'front' | 'back';

export type TrackingMapping = {
  rootLandmark?: TrackedLandmarkName;
  rootBoneId?: string;
  bones: Array<{
    boneId: string;
    start: TrackedLandmarkName;
    end: TrackedLandmarkName;
    enabled?: boolean;
  }>;
  ik: Array<{
    effectorBoneId: string;
    landmark: TrackedLandmarkName;
    chainLength?: number;
    enabled?: boolean;
  }>;
};

export type TrackingProcessOptions = {
  videoWidth: number;
  videoHeight: number;
  stageWidth?: number;
  stageHeight?: number;
  smoothingWindow?: number;
  maxMissingGap?: number;
  confidenceThreshold?: number;
  startFrame?: number;
  fps?: number;
  keyTolerance?: number;
  view?: TrackingView;
  facing?: TrackingFacing;
  rootMotion?: boolean;
};

export type TrackingLandmarkMappingSuggestion = {
  landmark: TrackedLandmarkName;
  boneId: string | null;
  score: number;
  reason: string;
};

export type RecordedTransformSample = {
  frame: number;
  values: Record<string, Transform2D>;
};

const LANDMARKS: readonly TrackedLandmarkName[] = [
  'nose', 'neck', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow',
  'leftWrist', 'rightWrist', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee',
  'leftAnkle', 'rightAnkle', 'leftHeel', 'rightHeel', 'leftFoot', 'rightFoot',
];

const finite = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const clonePoint = (point: TrackedPoint): TrackedPoint => ({ ...point });
const cloneFrame = (frame: TrackedFrame): TrackedFrame => ({ frame: frame.frame, timeSeconds: frame.timeSeconds, landmarks: Object.fromEntries(Object.entries(frame.landmarks).map(([name, point]) => [name, point ? clonePoint(point) : point])) as TrackedFrame['landmarks'] });

export function normalizeTrackedPoint(value: Partial<TrackedPoint> | undefined): TrackedPoint | undefined {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.y))) return undefined;
  return {
    x: clamp(Number(value.x), -2, 2),
    y: clamp(Number(value.y), -2, 2),
    ...(Number.isFinite(Number(value.z)) ? { z: clamp(Number(value.z), -2, 2) } : {}),
    visibility: clamp(finite(value.visibility, 1), 0, 1),
    confidence: clamp(finite(value.confidence, finite(value.visibility, 1)), 0, 1),
  };
}

export function normalizeTrackedFrame(value: Partial<TrackedFrame> | undefined, frame = 0, timeSeconds = 0): TrackedFrame {
  const landmarks = Object.fromEntries(LANDMARKS.flatMap(name => {
    const point = normalizeTrackedPoint(value?.landmarks?.[name]);
    return point ? [[name, point]] : [];
  })) as TrackedFrame['landmarks'];
  return { frame: Math.max(0, Math.round(finite(value?.frame, frame))), timeSeconds: Math.max(0, finite(value?.timeSeconds, timeSeconds)), landmarks };
}

function pointDistance(left: TrackedPoint, right: TrackedPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function blendPoint(left: TrackedPoint, right: TrackedPoint, amount: number): TrackedPoint {
  const t = clamp(amount, 0, 1);
  return {
    x: left.x + (right.x - left.x) * t,
    y: left.y + (right.y - left.y) * t,
    ...(left.z !== undefined || right.z !== undefined ? { z: finite(left.z) + (finite(right.z) - finite(left.z)) * t } : {}),
    visibility: left.visibility + (right.visibility - left.visibility) * t,
    confidence: left.confidence + (right.confidence - left.confidence) * t,
  };
}

/** Fill short gaps without inventing long stretches of hidden motion. */
export function interpolateTrackedFrames(frames: readonly TrackedFrame[], maxGap = 3): TrackedFrame[] {
  const result = frames.map((frame, index) => cloneFrame(normalizeTrackedFrame(frame, index, frame.timeSeconds)));
  const gapLimit = Math.max(0, Math.floor(maxGap));
  LANDMARKS.forEach(name => {
    for (let index = 0; index < result.length; index += 1) {
      if (result[index].landmarks[name]) continue;
      let left = index - 1;
      while (left >= 0 && !result[left].landmarks[name]) left -= 1;
      let right = index + 1;
      while (right < result.length && !result[right].landmarks[name]) right += 1;
      const gap = right - left - 1;
      if (!result[left]?.landmarks[name] || !result[right]?.landmarks[name] || gap > gapLimit) continue;
      const start = result[left].landmarks[name]!, end = result[right].landmarks[name]!;
      result[index].landmarks[name] = blendPoint(start, end, (index - left) / (right - left));
    }
  });
  return result;
}

/** Deterministic moving-average smoothing; the raw cache remains untouched. */
export function smoothTrackedFrames(frames: readonly TrackedFrame[], windowSize = 3): TrackedFrame[] {
  const result = frames.map(frame => cloneFrame(frame));
  const radius = Math.max(0, Math.floor(windowSize - 1) / 2);
  LANDMARKS.forEach(name => {
    result.forEach((frame, index) => {
      const points = frames.slice(Math.max(0, Math.floor(index - radius)), Math.min(frames.length, Math.ceil(index + radius + 1)))
        .map(item => item.landmarks[name]).filter((point): point is TrackedPoint => Boolean(point));
      if (!points.length) return;
      const average = points.reduce<{ x: number; y: number; z: number; visibility: number; confidence: number }>((sum, point) => ({
        x: sum.x + point.x, y: sum.y + point.y, z: sum.z + finite(point.z), visibility: sum.visibility + point.visibility, confidence: sum.confidence + point.confidence,
      }), { x: 0, y: 0, z: 0, visibility: 0, confidence: 0 });
      frame.landmarks[name] = {
        x: average.x / points.length,
        y: average.y / points.length,
        ...(points.some(point => point.z !== undefined) ? { z: average.z / points.length } : {}),
        visibility: average.visibility / points.length,
        confidence: average.confidence / points.length,
      };
    });
  });
  return result;
}

export function filterTrackedConfidence(frames: readonly TrackedFrame[], threshold = .35): TrackedFrame[] {
  const limit = clamp(threshold, 0, 1);
  return frames.map(frame => ({ ...cloneFrame(frame), landmarks: Object.fromEntries(Object.entries(frame.landmarks).flatMap(([name, point]) => point && point.confidence >= limit ? [[name, clonePoint(point)]] : [])) as TrackedFrame['landmarks'] }));
}

export function processTrackedFrames(frames: readonly TrackedFrame[], options: Pick<TrackingProcessOptions, 'confidenceThreshold' | 'maxMissingGap' | 'smoothingWindow'> = {}): TrackedFrame[] {
  const filtered = filterTrackedConfidence(frames, options.confidenceThreshold ?? .35);
  const interpolated = interpolateTrackedFrames(filtered, options.maxMissingGap ?? 3);
  return smoothTrackedFrames(interpolated, options.smoothingWindow ?? 3);
}

export function trackedPointToStage(point: TrackedPoint, options: Pick<TrackingProcessOptions, 'videoWidth' | 'videoHeight' | 'stageWidth' | 'stageHeight' | 'facing'>): { x: number; y: number } {
  const videoWidth = Math.max(1, finite(options.videoWidth, 1));
  const videoHeight = Math.max(1, finite(options.videoHeight, 1));
  const stageWidth = Math.max(1, finite(options.stageWidth, 800));
  const stageHeight = Math.max(1, finite(options.stageHeight, 520));
  const facing = options.facing;
  const normalizedX = facing === 'left' || facing === 'back' ? 1 - point.x : point.x;
  return { x: normalizedX * videoWidth / videoWidth * stageWidth, y: point.y * videoHeight / videoHeight * stageHeight };
}

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/mixamorig|bip001|armature|def|jnt|joint|bone/g, '').replace(/[^a-z0-9]/g, '');
}

function landmarkRole(name: TrackedLandmarkName): { role: string; side?: 'left' | 'right' } {
  if (name === 'nose') return { role: 'head' };
  if (name === 'neck') return { role: 'neck' };
  const side = name.startsWith('left') ? 'left' : name.startsWith('right') ? 'right' : undefined;
  const stripped = name.replace(/^left|^right/, '').toLowerCase();
  if (stripped.includes('shoulder')) return { role: 'shoulder', side };
  if (stripped.includes('elbow')) return { role: 'lowerarm', side };
  if (stripped.includes('wrist')) return { role: 'hand', side };
  if (stripped.includes('hip')) return { role: 'upperleg', side };
  if (stripped.includes('knee')) return { role: 'lowerleg', side };
  if (stripped.includes('ankle') || stripped.includes('heel') || stripped.includes('foot')) return { role: 'foot', side };
  return { role: 'root' };
}

function boneRole(name: string): { role: string; side?: 'left' | 'right' } | undefined {
  const normalized = normalizedName(name);
  const side = normalized.startsWith('left') || normalized.startsWith('l') ? 'left' : normalized.startsWith('right') || normalized.startsWith('r') ? 'right' : undefined;
  if (/head/.test(normalized)) return { role: 'head', side };
  if (/neck/.test(normalized)) return { role: 'neck', side };
  if (/shoulder|clavicle|collar/.test(normalized)) return { role: 'shoulder', side };
  if (/forearm|lowerarm|elbow/.test(normalized)) return { role: 'lowerarm', side };
  if (/upperarm|bicep|arm/.test(normalized)) return { role: 'shoulder', side };
  if (/hand|wrist/.test(normalized)) return { role: 'hand', side };
  if (/upperleg|thigh|upleg/.test(normalized)) return { role: 'upperleg', side };
  if (/lowerleg|shin|calf|knee/.test(normalized)) return { role: 'lowerleg', side };
  if (/foot|ankle|toe/.test(normalized)) return { role: 'foot', side };
  if (/root|hip|pelvis|spine|body|torso/.test(normalized)) return { role: 'root', side };
  return undefined;
}

export function suggestTrackedRigMapping(rig: Pick<Rig, 'bones'>, landmarks: readonly TrackedLandmarkName[] = LANDMARKS): TrackingLandmarkMappingSuggestion[] {
  const bones = [...rig.bones.values()];
  return landmarks.map(landmark => {
    const source = landmarkRole(landmark);
    const candidates = bones.map(bone => {
      const target = boneRole(bone.name);
      if (!target || target.role !== source.role || source.side && target.side && source.side !== target.side) return { bone, score: -1, reason: 'role mismatch' };
      let score = 100;
      if (source.side && target.side === source.side) score += 40;
      if (!source.side && target.side) score -= 10;
      if (normalizedName(bone.name).includes(normalizedName(landmark))) score += 25;
      return { bone, score, reason: `${source.role}${source.side ? ` · ${source.side}` : ''} match` };
    }).filter(candidate => candidate.score >= 0).sort((a, b) => b.score - a.score || a.bone.id.localeCompare(b.bone.id));
    const best = candidates[0];
    return { landmark, boneId: best?.bone.id ?? null, score: best?.score ?? 0, reason: best?.reason ?? 'No matching bone' };
  });
}

function angleBetween(start: { x: number; y: number }, end: { x: number; y: number }): number {
  return Math.atan2(end.y - start.y, end.x - start.x);
}

function stagePoint(frame: TrackedFrame, name: TrackedLandmarkName, options: TrackingProcessOptions): { x: number; y: number } | undefined {
  const point = frame.landmarks[name];
  return point ? trackedPointToStage(point, options) : undefined;
}

function setBoneWorldAngle(rig: Rig, bone: Bone, angle: number): void {
  const parent = bone.parentId ? rig.bones.get(bone.parentId) : undefined;
  bone.local.rotation = angle - (parent?.world.rotation ?? 0);
}

/** Apply one processed video pose to a real Rig. The caller can use a cloned Rig for preview/baking. */
export function applyTrackedPoseToRig(rig: Rig, frame: TrackedFrame, mapping: TrackingMapping, options: TrackingProcessOptions): string[] {
  const touched = new Set<string>();
  rig.update();
  mapping.bones.forEach(binding => {
    if (binding.enabled === false) return;
    const start = stagePoint(frame, binding.start, options), end = stagePoint(frame, binding.end, options), bone = rig.bones.get(binding.boneId);
    if (!start || !end || !bone || bone.locked) return;
    setBoneWorldAngle(rig, bone, angleBetween(start, end));
    touched.add(bone.id);
    rig.update();
  });
  mapping.ik.forEach(binding => {
    if (binding.enabled === false) return;
    const target = stagePoint(frame, binding.landmark, options);
    if (!target || !rig.bones.has(binding.effectorBoneId)) return;
    if (rig.solveIK(binding.effectorBoneId, target, binding.chainLength)) rig.getPoseBoneIds(binding.effectorBoneId, binding.chainLength).forEach(id => touched.add(id));
  });
  const root = mapping.rootLandmark ? stagePoint(frame, mapping.rootLandmark, options) : undefined;
  if (root && options.rootMotion !== false) {
    const rootBone = (mapping.rootBoneId && rig.bones.get(mapping.rootBoneId)) ?? rig.getRoots()[0];
    if (rootBone && !rootBone.locked) { rootBone.local.x = root.x; rootBone.local.y = root.y; touched.add(rootBone.id); rig.update(); }
  }
  return [...touched];
}

function rotationDistance(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

function transformDistance(left: Transform2D, right: Transform2D): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y), rotationDistance(left.rotation, right.rotation), Math.abs(left.scaleX - right.scaleX), Math.abs(left.scaleY - right.scaleY));
}

function interpolateTransform(left: Transform2D, right: Transform2D, amount: number): Transform2D {
  const t = clamp(amount, 0, 1);
  const rotation = left.rotation + Math.atan2(Math.sin(right.rotation - left.rotation), Math.cos(right.rotation - left.rotation)) * t;
  return { x: left.x + (right.x - left.x) * t, y: left.y + (right.y - left.y) * t, rotation, scaleX: left.scaleX + (right.scaleX - left.scaleX) * t, scaleY: left.scaleY + (right.scaleY - left.scaleY) * t };
}

function reduceTransformKeyframes(keyframes: Array<Keyframe<Transform2D>>, tolerance: number): Array<Keyframe<Transform2D>> {
  if (keyframes.length <= 2) return keyframes;
  const keep = new Set<number>([0, keyframes.length - 1]);
  const visit = (start: number, end: number) => {
    if (end - start <= 1) return;
    let worst = tolerance, index = -1;
    const first = keyframes[start], last = keyframes[end];
    for (let cursor = start + 1; cursor < end; cursor += 1) {
      const amount = (keyframes[cursor].frame - first.frame) / Math.max(1, last.frame - first.frame);
      const expected = interpolateTransform(first.value, last.value, amount);
      const error = transformDistance(expected, keyframes[cursor].value);
      if (error > worst) { worst = error; index = cursor; }
    }
    if (index >= 0) { keep.add(index); visit(start, index); visit(index, end); }
  };
  visit(0, keyframes.length - 1);
  return keyframes.filter((_key, index) => keep.has(index));
}

/** Reduce a generated clip without removing its first or last frame. */
export function reduceTrackedClipKeys(clip: AnimationClip, tolerance = 1): AnimationClip {
  const safeTolerance = Math.max(0, finite(tolerance, 1));
  return {
    ...clip,
    tracks: clip.tracks.map(track => {
      if (track.property === 'transform' && track.keyframes.every(key => key.value && typeof key.value === 'object' && !Array.isArray(key.value))) {
        return { ...track, keyframes: reduceTransformKeyframes(track.keyframes as Array<Keyframe<Transform2D>>, safeTolerance) };
      }
      return { ...track, keyframes: track.keyframes.filter((_key, index, keys) => index === 0 || index === keys.length - 1 || index % Math.max(1, Math.ceil(safeTolerance)) === 0) };
    }),
  };
}

export function createTransformClipFromSamples(
  samples: readonly RecordedTransformSample[],
  fps = 24,
  name = 'Recorded motion',
  tolerance = 1,
): AnimationClip | null {
  if (!samples.length) return null;
  const ordered = [...samples].sort((left, right) => left.frame - right.frame);
  const targetIds = [...new Set(ordered.flatMap(sample => Object.keys(sample.values)))];
  const tracks: AnimationTrack[] = targetIds.flatMap(targetId => {
    const keyframes = ordered.flatMap(sample => {
      const value = sample.values[targetId];
      return value ? [{ id: createId('key'), frame: Math.max(0, Math.round(sample.frame)), value: { ...value } as unknown as SerializableValue, easing: 'linear' as const }] : [];
    });
    return keyframes.length ? [{ id: createId('track'), targetId, property: 'transform', keyframes }] : [];
  });
  if (!tracks.length) return null;
  const startFrame = Math.max(0, ordered[0].frame);
  const endFrame = Math.max(startFrame, ordered[ordered.length - 1].frame);
  return reduceTrackedClipKeys({ id: createId('animation'), name: name.trim() || 'Recorded motion', fps: Math.max(.001, finite(fps, 24)), startFrame, endFrame, tracks }, tolerance);
}

/** Generate a native transform clip by solving each tracked frame on an isolated Rig. */
export function retargetTrackedFramesToClip(rig: Rig, frames: readonly TrackedFrame[], mapping: TrackingMapping, options: TrackingProcessOptions & { name?: string }): AnimationClip {
  const fps = Math.max(.001, finite(options.fps, 24));
  const startFrame = Math.max(0, Math.round(finite(options.startFrame, 0)));
  const source = rig.toProject();
  const rootId = mapping.rootBoneId ?? rig.getRoots()[0]?.id;
  const targetIds = [...new Set([...mapping.bones.map(binding => binding.boneId), ...mapping.ik.flatMap(binding => rig.getPoseBoneIds(binding.effectorBoneId, binding.chainLength)), ...(rootId ? [rootId] : [])])];
  const samples = frames.map((frame, index) => {
    const sampleRig = new Rig(source);
    applyTrackedPoseToRig(sampleRig, frame, mapping, options);
    return { frame: startFrame + index, values: Object.fromEntries(targetIds.flatMap(id => { const bone = sampleRig.bones.get(id); return bone ? [[id, { ...bone.local }]] : []; })) as Record<string, Transform2D> };
  });
  const tracks: AnimationTrack[] = targetIds.flatMap(targetId => {
    const keyframes = samples.flatMap(sample => sample.values[targetId] ? [{ id: createId('key'), frame: sample.frame, value: sample.values[targetId] as unknown as SerializableValue, easing: 'linear' as const }] : []);
    return keyframes.length ? [{ id: createId('track'), targetId, property: 'transform', keyframes }] : [];
  });
  const clip: AnimationClip = { id: createId('animation'), name: options.name?.trim() || 'Video motion tracking', fps, startFrame, endFrame: Math.max(startFrame, startFrame + Math.max(0, frames.length - 1)), tracks };
  return reduceTrackedClipKeys(clip, options.keyTolerance ?? 1);
}

export function trackingLandmarkNames(): readonly TrackedLandmarkName[] { return LANDMARKS; }
