export interface OnionSkinSettings {
  enabled: boolean;
  previousFrames: number;
  nextFrames: number;
  previousOpacity: number;
  nextOpacity: number;
  previousTint: string;
  nextTint: string;
  showWhilePlaying: boolean;
  activeLayerOnly: boolean;
}

export const DEFAULT_ONION_SKIN_SETTINGS: OnionSkinSettings = {
  enabled: false,
  previousFrames: 5,
  nextFrames: 5,
  previousOpacity: .3,
  nextOpacity: .3,
  previousTint: '#3f8ee8',
  nextTint: '#f06b85',
  showWhilePlaying: true,
  activeLayerOnly: false,
};

// Keep the editor pass bounded: every ghost evaluates the full rig and compositor.
// Five frames per side matches the studio default and stays responsive during playback.
const MAX_ONION_FRAMES = 5;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function count(value: unknown, fallback: number): number {
  return Math.round(clamp(finite(value, fallback), 0, MAX_ONION_FRAMES));
}

function opacity(value: unknown, fallback: number): number {
  return clamp(finite(value, fallback), 0, 1);
}

function tint(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function normalizeOnionSkinSettings(value: unknown): OnionSkinSettings {
  const source = value && typeof value === 'object' ? value as Partial<OnionSkinSettings> : {};
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_ONION_SKIN_SETTINGS.enabled,
    previousFrames: count(source.previousFrames, DEFAULT_ONION_SKIN_SETTINGS.previousFrames),
    nextFrames: count(source.nextFrames, DEFAULT_ONION_SKIN_SETTINGS.nextFrames),
    previousOpacity: opacity(source.previousOpacity, DEFAULT_ONION_SKIN_SETTINGS.previousOpacity),
    nextOpacity: opacity(source.nextOpacity, DEFAULT_ONION_SKIN_SETTINGS.nextOpacity),
    previousTint: tint(source.previousTint, DEFAULT_ONION_SKIN_SETTINGS.previousTint),
    nextTint: tint(source.nextTint, DEFAULT_ONION_SKIN_SETTINGS.nextTint),
    showWhilePlaying: typeof source.showWhilePlaying === 'boolean' ? source.showWhilePlaying : DEFAULT_ONION_SKIN_SETTINGS.showWhilePlaying,
    activeLayerOnly: typeof source.activeLayerOnly === 'boolean' ? source.activeLayerOnly : DEFAULT_ONION_SKIN_SETTINGS.activeLayerOnly,
  };
}

export type OnionSkinDirection = 'previous' | 'next';

export interface OnionSkinFrame {
  frame: number;
  direction: OnionSkinDirection;
  distance: number;
  opacity: number;
  tint: string;
}

function frameOpacity(base: number, distance: number, count: number): number {
  if (!count) return 0;
  const falloff = 1 - ((distance - 1) / Math.max(1, count)) * .65;
  return Number((base * falloff).toFixed(4));
}

/** Return neighboring integer frames, ordered farthest-first for compositing. */
export function onionSkinFrames(
  currentFrame: number,
  startFrame: number,
  endFrame: number,
  settings: OnionSkinSettings,
): OnionSkinFrame[] {
  const normalized = normalizeOnionSkinSettings(settings);
  const current = Math.round(clamp(finite(currentFrame, startFrame), startFrame, endFrame));
  const previous: OnionSkinFrame[] = [];
  const next: OnionSkinFrame[] = [];
  for (let distance = 1; distance <= normalized.previousFrames; distance += 1) {
    const frame = current - distance;
    if (frame >= startFrame) previous.push({ frame, direction: 'previous', distance, opacity: frameOpacity(normalized.previousOpacity, distance, normalized.previousFrames), tint: normalized.previousTint });
  }
  for (let distance = 1; distance <= normalized.nextFrames; distance += 1) {
    const frame = current + distance;
    if (frame <= endFrame) next.push({ frame, direction: 'next', distance, opacity: frameOpacity(normalized.nextOpacity, distance, normalized.nextFrames), tint: normalized.nextTint });
  }
  return [...previous, ...next].sort((left, right) => {
    const distance = right.distance - left.distance;
    return distance || (left.direction === 'previous' ? -1 : 1);
  });
}
