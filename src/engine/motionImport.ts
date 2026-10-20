import { createId, type Bone, type Rig } from './Rig';
import type { AnimationClip } from './model';

/** A finite point from the source 3D skeleton. BVH values use the source file's units. */
export interface Imported3DOffset {
  x: number;
  y: number;
  z: number;
}

export interface Imported3DSkeletonNode {
  name: string;
  /** Parent node name, or null for a root node. */
  parent: string | null;
  /** Channel names are canonicalized to BVH spelling where possible. */
  channels: string[];
  offset: Imported3DOffset;
}

/** Numeric channel values for one skeleton node in one frame. */
export type Imported3DNodeFrame = Record<string, number>;

/** Nodes are in skeleton order, matching Imported3DMotion.skeleton. */
export type Imported3DMotionFrame = Imported3DNodeFrame[];

export interface Imported3DMotion {
  name: string;
  fps: number;
  frameCount: number;
  frameTime: number;
  skeleton: Imported3DSkeletonNode[];
  frames: Imported3DMotionFrame[];
  /** Seconds between the first and last available sample. */
  durationSeconds: number;
}

export interface MotionImportOptions {
  /** Camera yaw used when reducing 3D Euler rotation to a screen rotation. */
  projectionAngle: number;
  /** Source samples consumed per output frame. Values above one play faster. */
  speed: number;
  trimStart: number;
  trimEnd: number;
  flip: boolean;
  alignWithPrevious: boolean;
  rootMotion: boolean;
  /** Optional preceding clip used to align root motion at its last keyframe. */
  previousClip?: AnimationClip;
}

export type RetargetedAnimationClip = AnimationClip & {
  /** Non-fatal source joints that could not be matched to a rig bone. */
  warnings?: string[];
};

export interface MotionImportFailure {
  /** Present when an otherwise useful clip was produced alongside a warning/error. */
  clip?: AnimationClip;
  error: string;
  warnings?: string[];
}

export type Retarget3DMotionResult = RetargetedAnimationClip | MotionImportFailure;

/**
 * Append a converted motion to an existing timeline clip.
 *
 * Imported clips are generated from frame zero so they can be previewed in
 * isolation. When a second motion is applied with alignment enabled, its
 * frames are shifted to the first free frame after the previous clip and
 * tracks with the same target/property are merged. Keeping one clip preserves
 * the normal timeline and controller workflow while still allowing motions to
 * be authored one after another.
 */
export function appendAnimationClip(previous: AnimationClip, next: AnimationClip): AnimationClip {
  const nextDuration = Math.max(0, next.endFrame - next.startFrame);
  const offset = previous.endFrame - next.startFrame + 1;
  const tracks = previous.tracks.map((track) => ({
    ...track,
    keyframes: track.keyframes.map((keyframe) => ({ ...keyframe })),
  }));

  next.tracks.forEach((track) => {
    const shifted = track.keyframes.map((keyframe) => ({
      ...keyframe,
      frame: keyframe.frame + offset,
    }));
    const existing = tracks.find((candidate) => candidate.targetId === track.targetId && candidate.property === track.property);
    if (existing) {
      existing.keyframes = [...existing.keyframes, ...shifted].sort((a, b) => a.frame - b.frame);
      return;
    }
    tracks.push({
      ...track,
      keyframes: shifted,
    });
  });

  const name = previous.name.trim() === next.name.trim()
    ? previous.name
    : `${previous.name} + ${next.name}`;
  return {
    ...previous,
    name,
    endFrame: previous.endFrame + nextDuration + 1,
    tracks,
  };
}

export interface MotionFileNameValidation {
  valid: boolean;
  extension: string;
  format?: 'bvh' | 'json';
  unsupported?: boolean;
  error?: string;
}

const MAX_SKELETON_NODES = 512;
const MAX_FRAMES = 20_000;
const MAX_CHANNELS_PER_NODE = 32;
const MAX_SOURCE_TEXT_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_FRAMES = 20_000;

const CHANNEL_NAMES: Record<string, string> = {
  xposition: 'Xposition',
  yposition: 'Yposition',
  zposition: 'Zposition',
  xrotation: 'Xrotation',
  yrotation: 'Yrotation',
  zrotation: 'Zrotation',
};

function fail(error: string): { error: string } {
  return { error };
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteTextNumber(token: string): number | undefined {
  if (!token || !/^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:e[+-]?\d+)?$/i.test(token)) return undefined;
  const value = Number(token);
  return Number.isFinite(value) ? value : undefined;
}

function canonicalChannel(channel: string): string {
  const key = channel.replace(/[^a-z]/gi, '').toLowerCase();
  return CHANNEL_NAMES[key] ?? channel;
}

function channelKey(channel: string): string {
  return channel.replace(/[^a-z]/gi, '').toLowerCase();
}

function sourceChannel(record: Imported3DNodeFrame, name: string): number | undefined {
  const wanted = channelKey(name);
  const key = Object.keys(record).find((candidate) => channelKey(candidate) === wanted);
  const value = key === undefined ? undefined : record[key];
  return finite(value) ? value : undefined;
}

function hasChannel(node: Imported3DSkeletonNode, name: string): boolean {
  const wanted = channelKey(name);
  return node.channels.some((channel) => channelKey(channel) === wanted);
}

function tokensForBVH(text: string): string[] {
  // Colons are separators in the MOTION header (both `Frames: 2` and
  // `Frames : 2` occur in exporters), while braces are hierarchy tokens.
  return text.match(/[{}:]|[^\s{}:]+/g) ?? [];
}

/**
 * Parse the open BVH hierarchy/motion format.
 *
 * End Site entries are intentionally not added to the exported skeleton because
 * they do not have animation channels. Frame records are arrays aligned to the
 * exported skeleton, with canonical channel names as keys.
 */
export function parseBVH(text: string, name = 'Imported BVH motion'): { motion?: Imported3DMotion; error?: string } {
  if (typeof text !== 'string' || text.length === 0) return fail('BVH text is empty.');
  if (text.length > MAX_SOURCE_TEXT_BYTES) return fail(`BVH text exceeds the ${MAX_SOURCE_TEXT_BYTES} byte safety limit.`);

  const tokens = tokensForBVH(text);
  let cursor = 0;
  const next = (): string | undefined => tokens[cursor++];
  const peek = (): string | undefined => tokens[cursor];
  const is = (value: string | undefined, expected: string): boolean => value?.toLowerCase() === expected.toLowerCase();
  const expect = (expected: string): string | undefined => {
    const value = next();
    return is(value, expected) ? value : undefined;
  };
  const readNumber = (description: string): number | string => {
    const token = next();
    const value = token === undefined ? undefined : finiteTextNumber(token);
    return value === undefined ? `Invalid or non-finite ${description} "${token ?? '<end of file>'}".` : value;
  };

  if (!is(next(), 'hierarchy')) return fail('BVH must start with HIERARCHY.');
  if (!is(peek(), 'root')) return fail('BVH hierarchy is missing a ROOT node.');

  const skeleton: Imported3DSkeletonNode[] = [];
  // Insert each node before descending so frames stay in hierarchy/source order.
  const parseHierarchyNode = (kind: 'ROOT' | 'JOINT', parent: string | null): string | undefined => {
    if (skeleton.length >= MAX_SKELETON_NODES) return `BVH exceeds the ${MAX_SKELETON_NODES}-joint safety limit.`;
    next();
    const nodeName = next();
    if (!nodeName || nodeName === '{' || nodeName === '}') return `BVH ${kind} is missing a name.`;
    if (skeleton.some((node) => node.name === nodeName)) return `BVH contains duplicate joint name "${nodeName}".`;
    if (!expect('{')) return `BVH joint "${nodeName}" is missing an opening brace.`;
    let offset: Imported3DOffset | undefined;
    let channels: string[] | undefined;
    const nodeIndex = skeleton.length;
    skeleton.push({ name: nodeName, parent, channels: [], offset: { x: 0, y: 0, z: 0 } });
    while (cursor < tokens.length && !is(peek(), '}')) {
      const token = next();
      if (is(token, 'offset')) {
        const x = readNumber(`OFFSET x for "${nodeName}"`);
        const y = readNumber(`OFFSET y for "${nodeName}"`);
        const z = readNumber(`OFFSET z for "${nodeName}"`);
        if (typeof x !== 'number') return x;
        if (typeof y !== 'number') return y;
        if (typeof z !== 'number') return z;
        offset = { x, y, z };
      } else if (is(token, 'channels')) {
        const count = readNumber(`CHANNELS count for "${nodeName}"`);
        if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_CHANNELS_PER_NODE) {
          return `Invalid CHANNELS count for "${nodeName}" (maximum ${MAX_CHANNELS_PER_NODE}).`;
        }
        const parsed: string[] = [];
        for (let index = 0; index < count; index += 1) {
          const channel = next();
          if (!channel || channel === '{' || channel === '}') return `Joint "${nodeName}" has an incomplete CHANNELS declaration.`;
          parsed.push(canonicalChannel(channel));
        }
        channels = parsed;
      } else if (is(token, 'joint')) {
        // The node parser consumes its ROOT/JOINT keyword itself.
        cursor -= 1;
        const error = parseHierarchyNode('JOINT', nodeName);
        if (error) return error;
      } else if (is(token, 'end')) {
        if (!expect('site') || !expect('{')) return `End Site for "${nodeName}" is malformed.`;
        while (cursor < tokens.length && !is(peek(), '}')) {
          if (!is(next(), 'offset')) return `End Site for "${nodeName}" contains an unexpected token.`;
          const x = readNumber(`End Site x for "${nodeName}"`);
          const y = readNumber(`End Site y for "${nodeName}"`);
          const z = readNumber(`End Site z for "${nodeName}"`);
          if (typeof x !== 'number') return x;
          if (typeof y !== 'number') return y;
          if (typeof z !== 'number') return z;
        }
        if (!expect('}')) return `End Site for "${nodeName}" is missing a closing brace.`;
      } else {
        return `Unexpected token "${token}" in joint "${nodeName}".`;
      }
    }
    if (!expect('}')) return `Joint "${nodeName}" is missing a closing brace.`;
    if (!offset) return `Joint "${nodeName}" is missing OFFSET.`;
    if (!channels) return `Joint "${nodeName}" is missing CHANNELS.`;
    skeleton[nodeIndex] = { name: nodeName, parent, channels: [...channels], offset: { ...offset } };
    return undefined;
  };

  const hierarchyError = parseHierarchyNode('ROOT', null);
  if (hierarchyError) return fail(hierarchyError);
  if (skeleton.length === 0) return fail('BVH contains no joints.');
  if (!is(next(), 'motion')) return fail('BVH hierarchy must be followed by MOTION.');
  if (!is(next(), 'frames')) return fail('BVH MOTION section is missing Frames count.');
  if (is(peek(), ':')) next();
  const frameCountValue = readNumber('Frames count');
  if (typeof frameCountValue !== 'number' || !Number.isInteger(frameCountValue) || frameCountValue < 1 || frameCountValue > MAX_FRAMES) {
    return fail(`Invalid Frames count (must be an integer from 1 to ${MAX_FRAMES}).`);
  }
  if (!is(next(), 'frame')) return fail('BVH MOTION section is missing Frame Time.');
  if (!is(next(), 'time')) return fail('BVH MOTION section is missing Frame Time.');
  if (is(peek(), ':')) next();
  const frameTimeValue = readNumber('Frame Time');
  if (typeof frameTimeValue !== 'number' || frameTimeValue <= 0) return fail('Frame Time must be a finite number greater than zero.');
  const frameCount = frameCountValue;
  const channelCount = skeleton.reduce((total, node) => total + node.channels.length, 0);
  if (channelCount < 1) return fail('BVH skeleton has no animation channels.');
  const frames: Imported3DMotionFrame[] = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const frame: Imported3DMotionFrame = [];
    for (const node of skeleton) {
      const record: Imported3DNodeFrame = {};
      for (const channel of node.channels) {
        const token = next();
        const value = token === undefined ? undefined : finiteTextNumber(token);
        if (value === undefined) return fail(`Frame ${frameIndex} is missing a finite value for ${node.name}.${channel}.`);
        record[channel] = value;
      }
      frame.push(record);
    }
    frames.push(frame);
  }
  if (cursor < tokens.length) return fail(`BVH has ${tokens.length - cursor} unexpected token(s) after its motion frames.`);
  const frameTime = frameTimeValue;
  const fps = 1 / frameTime;
  if (!Number.isFinite(fps) || fps <= 0) return fail('Frame Time produces an invalid FPS value.');
  return {
    motion: {
      name: typeof name === 'string' && name.trim() ? name.trim() : 'Imported BVH motion',
      fps,
      frameCount,
      frameTime,
      skeleton: skeleton.map((node) => ({ ...node, channels: [...node.channels], offset: { ...node.offset } })),
      frames: frames.map((frame) => frame.map((record) => ({ ...record }))),
      durationSeconds: Math.max(0, (frameCount - 1) * frameTime),
    },
  };
}

function jsonOffset(value: unknown): Imported3DOffset | undefined {
  if (Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(finite)) {
    return { x: value[0] as number, y: value[1] as number, z: value[2] as number };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const object = value as Record<string, unknown>;
  return finite(object.x) && finite(object.y) && finite(object.z)
    ? { x: object.x, y: object.y, z: object.z }
    : undefined;
}

/**
 * Parse the documented JSON motion format. The format mirrors Imported3DMotion:
 * `{name?, fps?, frameTime?, skeleton: [{name,parent,channels,offset}],
 * frames: [[{Xrotation: 0}, ...]]}`. Channel angles are degrees, as in BVH.
 */
export function parseJSONMotion(text: string, name = 'Imported JSON motion'): { motion?: Imported3DMotion; error?: string } {
  if (typeof text !== 'string' || !text.trim()) return fail('JSON motion text is empty.');
  if (text.length > MAX_SOURCE_TEXT_BYTES) return fail(`JSON motion exceeds the ${MAX_SOURCE_TEXT_BYTES} byte safety limit.`);
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    return fail(`Invalid JSON motion: ${error instanceof Error ? error.message : 'JSON parse failed.'}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('JSON motion must be an object.');
  const object = value as Record<string, unknown>;
  if (!Array.isArray(object.skeleton) || object.skeleton.length === 0 || object.skeleton.length > MAX_SKELETON_NODES) {
    return fail(`JSON motion skeleton must contain 1-${MAX_SKELETON_NODES} nodes.`);
  }
  const skeleton: Imported3DSkeletonNode[] = [];
  for (let index = 0; index < object.skeleton.length; index += 1) {
    const raw = object.skeleton[index];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(`JSON skeleton node ${index} is invalid.`);
    const node = raw as Record<string, unknown>;
    if (typeof node.name !== 'string' || !node.name.trim()) return fail(`JSON skeleton node ${index} is missing name.`);
    if (!Array.isArray(node.channels) || node.channels.length < 1 || node.channels.length > MAX_CHANNELS_PER_NODE
      || !node.channels.every((channel) => typeof channel === 'string' && Boolean(channel.trim()))) {
      return fail(`JSON skeleton node "${node.name}" has invalid channels.`);
    }
    const offset = jsonOffset(node.offset);
    if (!offset) return fail(`JSON skeleton node "${node.name}" has an invalid offset.`);
    let parent: string | null = null;
    if (node.parent !== null && node.parent !== undefined) {
      if (typeof node.parent === 'number' && Number.isInteger(node.parent) && node.parent >= 0 && node.parent < index) {
        parent = String((object.skeleton[node.parent] as Record<string, unknown>).name);
      } else if (typeof node.parent === 'string' && node.parent.trim()) {
        parent = node.parent;
      } else {
        return fail(`JSON skeleton node "${node.name}" has an invalid parent.`);
      }
    }
    if (skeleton.some((candidate) => candidate.name === node.name)) return fail(`JSON contains duplicate joint name "${node.name}".`);
    skeleton.push({ name: node.name, parent, channels: node.channels.map((channel) => canonicalChannel(channel)), offset });
  }
  for (const node of skeleton) {
    if (node.parent !== null && !skeleton.some((candidate) => candidate.name === node.parent)) {
      return fail(`JSON skeleton node "${node.name}" references missing parent "${node.parent}".`);
    }
  }
  if (!Array.isArray(object.frames) || object.frames.length < 1 || object.frames.length > MAX_FRAMES) {
    return fail(`JSON motion frames must contain 1-${MAX_FRAMES} frames.`);
  }
  const frames: Imported3DMotionFrame[] = [];
  for (let frameIndex = 0; frameIndex < object.frames.length; frameIndex += 1) {
    const rawFrame = object.frames[frameIndex];
    if (!Array.isArray(rawFrame) || rawFrame.length !== skeleton.length) return fail(`JSON frame ${frameIndex} must contain one record per skeleton node.`);
    const frame: Imported3DMotionFrame = [];
    for (let nodeIndex = 0; nodeIndex < skeleton.length; nodeIndex += 1) {
      const rawRecord = rawFrame[nodeIndex];
      if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) return fail(`JSON frame ${frameIndex}, node ${nodeIndex} is invalid.`);
      const record: Imported3DNodeFrame = {};
      for (const [channel, rawNumber] of Object.entries(rawRecord as Record<string, unknown>)) {
        if (!finite(rawNumber)) return fail(`JSON frame ${frameIndex}, node ${nodeIndex} has a non-finite channel value.`);
        record[canonicalChannel(channel)] = rawNumber;
      }
      for (const channel of skeleton[nodeIndex].channels) {
        if (!finite(record[channel])) return fail(`JSON frame ${frameIndex} is missing ${skeleton[nodeIndex].name}.${channel}.`);
      }
      frame.push(record);
    }
    frames.push(frame);
  }
  const fpsValue = object.fps;
  const frameTimeValue = object.frameTime;
  const fps = finite(fpsValue) && fpsValue > 0 ? fpsValue : undefined;
  const frameTime = finite(frameTimeValue) && frameTimeValue > 0 ? frameTimeValue : fps ? 1 / fps : undefined;
  if (!frameTime || !fps && !finite(frameTimeValue)) return fail('JSON motion needs a finite positive fps or frameTime.');
  const actualFps = fps ?? 1 / frameTime;
  if (!Number.isFinite(actualFps) || actualFps <= 0) return fail('JSON motion has an invalid FPS value.');
  return {
    motion: {
      name: typeof object.name === 'string' && object.name.trim() ? object.name.trim() : (name.trim() || 'Imported JSON motion'),
      fps: actualFps,
      frameCount: frames.length,
      frameTime,
      skeleton: skeleton.map((node) => ({ ...node, channels: [...node.channels], offset: { ...node.offset } })),
      frames: frames.map((frame) => frame.map((record) => ({ ...record }))),
      durationSeconds: Math.max(0, (frames.length - 1) * frameTime),
    },
  };
}

export function createMotionImportDefaults(motion: Imported3DMotion): MotionImportOptions {
  const frameCount = Math.max(1, Math.floor(finite(motion.frameCount) ? motion.frameCount : 1));
  return {
    projectionAngle: 0,
    speed: 1,
    trimStart: 0,
    trimEnd: frameCount - 1,
    flip: false,
    alignWithPrevious: false,
    rootMotion: true,
  };
}

function normalizeForMatching(name: string): string {
  return name.toLowerCase().replace(/mixamorig|bip001|armature|def|jnt|joint|bone/g, '').replace(/[^a-z0-9]/g, '');
}

function sideOf(name: string): 'left' | 'right' | undefined {
  const lower = name.toLowerCase();
  const camelLeft = /^l[A-Z]/.test(name) || /[A-Z]l$/.test(name);
  const camelRight = /^r[A-Z]/.test(name) || /[A-Z]r$/.test(name);
  if (lower.startsWith('left') || /(?:^|[^a-z])left(?:[^a-z]|$)/.test(lower) || /left$/.test(lower)
    || /(?:^|[^a-z])l(?:[^a-z]|$)/.test(lower) || camelLeft) return 'left';
  if (lower.startsWith('right') || /(?:^|[^a-z])right(?:[^a-z]|$)/.test(lower) || /right$/.test(lower)
    || /(?:^|[^a-z])r(?:[^a-z]|$)/.test(lower) || camelRight) return 'right';
  return undefined;
}

interface MatchRole { role: string; side?: 'left' | 'right'; level?: number }

function roleOf(name: string): MatchRole | undefined {
  const normalized = normalizeForMatching(name);
  const side = sideOf(name);
  const stripped = normalized.replace(/^(left|right|l|r)/, '').replace(/(left|right|l|r)$/, '');
  if (/(?:root|hips?|pelvis|center|centre)/.test(stripped)) return { role: 'hips', side };
  if (/head/.test(stripped)) return { role: 'head', side };
  if (/neck/.test(stripped)) return { role: 'neck', side };
  const spine = stripped.match(/spine(?:base)?([0-9]*)/) || stripped.match(/(?:chest|torso)([0-9]*)/);
  if (spine) return { role: 'spine', side, level: spine[1] ? Number(spine[1]) : undefined };
  if (/(?:clavicle|collar|shoulder)/.test(stripped)) return { role: 'shoulder', side };
  if (/(?:forearm|lowerarm|armlower|elbow)/.test(stripped)) return { role: 'lowerArm', side };
  if (/(?:upperarm|bicep|armupper|arm)/.test(stripped)) return { role: 'upperArm', side };
  if (/(?:hand|wrist)/.test(stripped)) return { role: 'hand', side };
  if (/(?:upperleg|upleg|thigh|legupper)/.test(stripped)) return { role: 'upperLeg', side };
  if (/(?:lowerleg|leg|shin|calf|knee|leglower)/.test(stripped)) return { role: 'lowerLeg', side };
  if (/(?:foot|ankle)/.test(stripped)) return { role: 'foot', side };
  if (/toe/.test(stripped)) return { role: 'toe', side };
  return undefined;
}

function matchScore(source: Imported3DSkeletonNode, target: Bone, mappedParent: string | undefined): number {
  const sourceName = normalizeForMatching(source.name);
  const targetName = normalizeForMatching(target.name);
  if (sourceName && sourceName === targetName) return 2_000;
  const sourceRole = roleOf(source.name);
  const targetRole = roleOf(target.name);
  if (!sourceRole || !targetRole || sourceRole.role !== targetRole.role) return -1;
  let score = 500;
  if (sourceRole.side && targetRole.side === sourceRole.side) score += 180;
  else if (sourceRole.side && targetRole.side && sourceRole.side !== targetRole.side) return -1;
  else if (sourceRole.side || targetRole.side) score -= 100;
  if (sourceRole.level !== undefined && targetRole.level !== undefined) score += sourceRole.level === targetRole.level ? 90 : -50;
  if (mappedParent && target.parentId === mappedParent) score += 120;
  return score;
}

function mapSkeletonToRig(rig: Pick<Rig, 'bones'>, motion: Imported3DMotion): Map<number, Bone> {
  const bones = [...rig.bones.values()];
  const used = new Set<string>();
  const mapped = new Map<number, Bone>();
  for (let index = 0; index < motion.skeleton.length; index += 1) {
    const source = motion.skeleton[index];
    const sourceParentIndex = source.parent === null ? undefined : motion.skeleton.findIndex((node) => node.name === source.parent);
    const mappedParent = sourceParentIndex === undefined || sourceParentIndex < 0 ? undefined : mapped.get(sourceParentIndex)?.id;
    const candidates = bones
      .filter((bone) => !used.has(bone.id))
      .map((bone) => ({ bone, score: matchScore(source, bone, mappedParent) }))
      .filter((candidate) => candidate.score >= 0)
      .sort((a, b) => b.score - a.score || a.bone.id.localeCompare(b.bone.id));
    const selected = candidates[0]?.bone;
    if (selected) {
      mapped.set(index, selected);
      used.add(selected.id);
    }
  }
  return mapped;
}

function sampleRecord(motion: Imported3DMotion, nodeIndex: number, channel: string, sourceFrame: number): number {
  const clamped = Math.min(motion.frameCount - 1, Math.max(0, sourceFrame));
  const leftIndex = Math.floor(clamped);
  const rightIndex = Math.min(motion.frameCount - 1, leftIndex + 1);
  const amount = clamped - leftIndex;
  const left = sourceChannel(motion.frames[leftIndex]?.[nodeIndex] ?? {}, channel) ?? 0;
  const right = sourceChannel(motion.frames[rightIndex]?.[nodeIndex] ?? {}, channel) ?? left;
  return left + (right - left) * amount;
}

function previousEndpoint(clip: AnimationClip | undefined, targetId: string, property: 'x' | 'y'): number | undefined {
  const track = clip?.tracks.find((candidate) => candidate.targetId === targetId && candidate.property === property);
  if (!track || track.keyframes.length === 0) return undefined;
  const last = [...track.keyframes].sort((a, b) => b.frame - a.frame)[0];
  return finite(last.value) ? last.value : undefined;
}

function priorRootValue(
  rig: Pick<Rig, 'bones' | 'animations'>,
  targetId: string,
  property: 'x' | 'y',
  explicit?: AnimationClip,
): number | undefined {
  const fromExplicit = previousEndpoint(explicit, targetId, property);
  if (fromExplicit !== undefined) return fromExplicit;
  for (let index = rig.animations.length - 1; index >= 0; index -= 1) {
    const value = previousEndpoint(rig.animations[index], targetId, property);
    if (value !== undefined) return value;
  }
  const poseValue = rig.bones.get(targetId)?.local[property];
  return finite(poseValue) ? poseValue : undefined;
}

function asFailure(error: string, warnings: string[] = []): MotionImportFailure {
  return warnings.length ? { error, warnings: [...warnings] } : { error };
}

/**
 * Retarget a BVH/JSON motion to 2D bone rotation and optional root-motion tracks.
 *
 * Rotation projection is deterministic: screenRotation = Z + cos(yaw) * X +
 * sin(yaw) * Y (all source Euler channels are degrees). Horizontal root motion
 * uses the equivalent X/Z camera-yaw projection; vertical motion uses Y.
 */
export function retarget3DMotionToClip(
  rig: Pick<Rig, 'bones' | 'animations'>,
  motion: Imported3DMotion,
  options: Partial<MotionImportOptions> = {},
): Retarget3DMotionResult {
  if (!motion || !Array.isArray(motion.skeleton) || !Array.isArray(motion.frames) || motion.frameCount < 1) {
    return asFailure('Motion has no usable skeleton or frames.');
  }
  const defaults = createMotionImportDefaults(motion);
  const projectionAngle = finite(options.projectionAngle) ? options.projectionAngle : defaults.projectionAngle;
  const speed = finite(options.speed) ? options.speed : defaults.speed;
  if (speed <= 0) return asFailure('Motion import speed must be greater than zero.');
  const sourceStart = Math.max(0, Math.min(motion.frameCount - 1, Math.floor(finite(options.trimStart) ? options.trimStart : defaults.trimStart)));
  const sourceEnd = Math.max(0, Math.min(motion.frameCount - 1, Math.floor(finite(options.trimEnd) ? options.trimEnd : defaults.trimEnd)));
  if (sourceStart > sourceEnd) return asFailure('Motion trimStart must be less than or equal to trimEnd.');
  const outputPositions: number[] = [sourceStart];
  for (let position = sourceStart + speed; position < sourceEnd - 1e-8; position += speed) outputPositions.push(position);
  if (sourceEnd !== sourceStart && outputPositions[outputPositions.length - 1] !== sourceEnd) outputPositions.push(sourceEnd);
  if (outputPositions.length > MAX_OUTPUT_FRAMES) return asFailure(`Motion speed/trim settings would create more than ${MAX_OUTPUT_FRAMES} output frames.`);

  const mapped = mapSkeletonToRig(rig, motion);
  const warnings = motion.skeleton.flatMap((node, index) => mapped.has(index) ? [] : [`Unmapped BVH joint "${node.name}".`]);
  if (mapped.size === 0) return asFailure('No BVH joints could be mapped to bones in the current rig.', warnings);
  const rootIndex = motion.skeleton.findIndex((node) => node.parent === null);
  const rootBone = rootIndex >= 0 ? mapped.get(rootIndex) : undefined;
  const yaw = projectionAngle * Math.PI / 180;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const flip = options.flip === true;
  const rootMotion = options.rootMotion !== false;
  let rootOffsetX = 0;
  let rootOffsetY = 0;
  const rootNode = rootIndex >= 0 ? motion.skeleton[rootIndex] : undefined;
  if (rootMotion && rootBone && rootNode && options.alignWithPrevious === true) {
    const firstX = hasChannel(rootNode, 'Xposition') || hasChannel(rootNode, 'Zposition')
      ? (sampleRecord(motion, rootIndex, 'Xposition', sourceStart) * cosYaw + sampleRecord(motion, rootIndex, 'Zposition', sourceStart) * sinYaw) * (flip ? -1 : 1)
      : undefined;
    const firstY = hasChannel(rootNode, 'Yposition') ? sampleRecord(motion, rootIndex, 'Yposition', sourceStart) : undefined;
    if (firstX !== undefined) {
      const target = priorRootValue(rig, rootBone.id, 'x', options.previousClip);
      if (target !== undefined) rootOffsetX = target - firstX;
    }
    if (firstY !== undefined) {
      const target = priorRootValue(rig, rootBone.id, 'y', options.previousClip);
      if (target !== undefined) rootOffsetY = target - firstY;
    }
  }

  const tracks: RetargetedAnimationClip['tracks'] = [];
  for (let nodeIndex = 0; nodeIndex < motion.skeleton.length; nodeIndex += 1) {
    const bone = mapped.get(nodeIndex);
    const node = motion.skeleton[nodeIndex];
    if (!bone) continue;
    const hasRotation = hasChannel(node, 'Xrotation') || hasChannel(node, 'Yrotation') || hasChannel(node, 'Zrotation');
    if (hasRotation) {
      tracks.push({
        id: createId('track'),
        targetId: bone.id,
        property: 'rotation',
        keyframes: outputPositions.map((sourceFrame, frame) => {
          const x = sampleRecord(motion, nodeIndex, 'Xrotation', sourceFrame);
          const y = sampleRecord(motion, nodeIndex, 'Yrotation', sourceFrame);
          const z = sampleRecord(motion, nodeIndex, 'Zrotation', sourceFrame);
          const projected = (z + cosYaw * x + sinYaw * y) * Math.PI / 180;
          return { id: createId('key'), frame, value: flip ? -projected : projected, easing: 'linear' as const };
        }),
      });
    }
  }
  if (rootMotion && rootBone && rootNode) {
    if (hasChannel(rootNode, 'Xposition') || hasChannel(rootNode, 'Zposition')) {
      tracks.push({
        id: createId('track'),
        targetId: rootBone.id,
        property: 'x',
        keyframes: outputPositions.map((sourceFrame, frame) => {
          const x = sampleRecord(motion, rootIndex, 'Xposition', sourceFrame);
          const z = sampleRecord(motion, rootIndex, 'Zposition', sourceFrame);
          const value = (x * cosYaw + z * sinYaw) * (flip ? -1 : 1) + rootOffsetX;
          return { id: createId('key'), frame, value, easing: 'linear' as const };
        }),
      });
    }
    if (hasChannel(rootNode, 'Yposition')) {
      tracks.push({
        id: createId('track'),
        targetId: rootBone.id,
        property: 'y',
        keyframes: outputPositions.map((sourceFrame, frame) => ({
          id: createId('key'),
          frame,
          value: sampleRecord(motion, rootIndex, 'Yposition', sourceFrame) + rootOffsetY,
          easing: 'linear' as const,
        })),
      });
    }
  }
  if (tracks.length === 0) return asFailure('Mapped motion has no supported rotation or root-position channels.', warnings);
  const clip: RetargetedAnimationClip = {
    id: createId('animation'),
    name: motion.name.trim() || 'Imported 3D motion',
    fps: motion.fps,
    startFrame: 0,
    endFrame: outputPositions.length - 1,
    tracks,
  };
  if (warnings.length) clip.warnings = [...warnings];
  return clip;
}

export function validateMotionFileName(name: string): MotionFileNameValidation {
  const raw = typeof name === 'string' ? name.trim().split(/[?#]/, 1)[0] : '';
  const extension = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1).toLowerCase() : '';
  if (extension === 'bvh' || extension === 'json') return { valid: true, extension, format: extension };
  const proprietary = new Set(['rlmotion', 'fbx', 'glb', 'gltf']);
  if (proprietary.has(extension)) {
    return { valid: false, extension, unsupported: true, error: `.${extension} is unsupported in this browser MVP; use .bvh or the documented .json motion format.` };
  }
  return { valid: false, extension, error: 'Unsupported motion file type; use .bvh or the documented .json motion format.' };
}

/** Dispatch a local text file through the supported open-format parsers. */
export function parseMotionFile(text: string, fileName: string): { motion?: Imported3DMotion; error?: string } {
  const validation = validateMotionFileName(fileName);
  if (!validation.valid) return { error: validation.error };
  return validation.format === 'json' ? parseJSONMotion(text, fileName) : parseBVH(text, fileName);
}
