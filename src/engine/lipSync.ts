import type { LipSyncCue, LipSyncTrack, ProjectAudio, Viseme } from './model';

export const VISEMES: readonly Viseme[] = ['X', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const VISEME_LABELS: Record<Viseme, string> = {
  X: 'Rest', A: 'M / B / P', B: 'Consonants', C: 'Wide', D: 'Open',
  E: 'Rounded', F: 'Pucker', G: 'F / V', H: 'L',
};

/** Bounds apply before copying imported data. Audio is embedded, never fetched. */
export const MAX_LIP_SYNC_CUES = 20000;
export const MAX_LIP_SYNC_TRACKS = 128;
export const MAX_AUDIO_PEAKS = 100000;
export const MAX_AUDIO_DATA_LENGTH = 24 * 1024 * 1024;
export const MAX_LIP_SYNC_SECONDS = 24 * 60 * 60;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 512;
}

export function isViseme(value: unknown): value is Viseme {
  return typeof value === 'string' && VISEMES.includes(value as Viseme);
}

function seconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_LIP_SYNC_SECONDS;
}

/** Validates, clones and sorts. End is exclusive; touching intervals are allowed. */
export function normalizeLipSyncCues(value: unknown): LipSyncCue[] {
  if (!Array.isArray(value)) throw new Error('Lip sync cues must be an array');
  if (value.length > MAX_LIP_SYNC_CUES) throw new Error(`Lip sync supports at most ${MAX_LIP_SYNC_CUES} cues per track`);
  const ids = new Set<string>();
  const cues = value.map((cue, index): LipSyncCue => {
    if (!record(cue) || !validText(cue.id)) throw new Error(`Cue ${index + 1} must have an ID`);
    if (ids.has(cue.id)) throw new Error(`Duplicate cue ID: ${cue.id}`);
    ids.add(cue.id);
    if (!seconds(cue.start) || !seconds(cue.end) || cue.end <= cue.start) {
      throw new Error(`Cue ${index + 1} needs finite seconds with 0 ≤ start < end ≤ ${MAX_LIP_SYNC_SECONDS}`);
    }
    if (!isViseme(cue.viseme)) throw new Error(`Cue ${index + 1} has an unknown viseme`);
    return { id: cue.id, start: cue.start, end: cue.end, viseme: cue.viseme };
  }).sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  for (let index = 1; index < cues.length; index += 1) {
    if (cues[index].start < cues[index - 1].end) throw new Error(`Overlapping lip sync cues: ${cues[index - 1].id} and ${cues[index].id}`);
  }
  return cues;
}

export function validateLipSyncCues(value: unknown): value is LipSyncCue[] {
  try { normalizeLipSyncCues(value); return true; } catch { return false; }
}

/** Sample normalized, start-sorted cues without quantizing to frames. Gaps rest. */
export function sampleViseme(cues: readonly LipSyncCue[], time: number): Viseme {
  if (!Number.isFinite(time) || time < 0) return 'X';
  let low = 0, high = cues.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const cue = cues[middle];
    if (time < cue.start) high = middle - 1;
    else if (time >= cue.end) low = middle + 1;
    else return cue.viseme;
  }
  return 'X';
}

/** Missing layer references and cross-track ownership conflicts are import errors. */
export function normalizeLipSyncTracks(value: unknown, layerIds?: ReadonlySet<string>): LipSyncTrack[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_LIP_SYNC_TRACKS) throw new Error(`Lip sync tracks must be an array of at most ${MAX_LIP_SYNC_TRACKS} tracks`);
  const ids = new Set<string>(), owners = new Map<string, string>();
  return value.map((track, index) => {
    if (!record(track) || !validText(track.id) || !validText(track.name) || typeof track.enabled !== 'boolean' || !record(track.mapping)) {
      throw new Error(`Lip sync track ${index + 1} needs an ID, name, enabled flag and viseme mapping`);
    }
    if (ids.has(track.id)) throw new Error(`Duplicate lip sync track ID: ${track.id}`);
    ids.add(track.id);
    const mapping: Partial<Record<Viseme, string>> = {};
    for (const [viseme, layerId] of Object.entries(track.mapping)) {
      if (!isViseme(viseme) || !validText(layerId)) throw new Error(`Invalid viseme mapping in track ${track.name}`);
      if (layerIds && !layerIds.has(layerId)) throw new Error(`Mouth layer ${layerId} in track ${track.name} does not exist`);
      const owner = owners.get(layerId);
      if (owner && owner !== track.id) throw new Error(`Mouth layer ${layerId} is mapped by more than one track`);
      owners.set(layerId, track.id);
      mapping[viseme] = layerId;
    }
    return { id: track.id, name: track.name, enabled: track.enabled, mapping, cues: normalizeLipSyncCues(track.cues) };
  });
}

export function normalizeProjectAudio(value: unknown): ProjectAudio | undefined {
  if (value === undefined) return undefined;
  if (!record(value) || !validText(value.id) || !validText(value.name)) throw new Error('Audio needs an ID and name');
  if (typeof value.src !== 'string' || value.src.length > MAX_AUDIO_DATA_LENGTH) throw new Error('Embedded audio is missing or exceeds the 24 MiB data URL limit');
  // Only embedded audio with base64 payloads; never external URLs or executable MIME types.
  const comma = value.src.indexOf(',');
  const header = value.src.slice(0, comma);
  const payload = value.src.slice(comma + 1);
  if (!/^data:audio\/[a-z0-9.+-]+(?:;[a-z0-9-]+=[a-z0-9.+-]+)*;base64$/i.test(header)
    || !payload.length || payload.length % 4 !== 0 || !/^[a-z0-9+/]+={0,2}$/i.test(payload)) {
    throw new Error('Audio must be an embedded base64 data:audio URL');
  }
  if (!seconds(value.duration) || value.duration <= 0 || !seconds(value.offsetSeconds)
    || value.duration + value.offsetSeconds > MAX_LIP_SYNC_SECONDS) throw new Error('Audio duration and offset must be finite, nonnegative seconds, with a positive duration (maximum 24 hours)');
  if (typeof value.volume !== 'number' || !Number.isFinite(value.volume) || value.volume < 0 || value.volume > 1 || typeof value.muted !== 'boolean') {
    throw new Error('Audio volume must be between 0 and 1 and muted must be a boolean');
  }
  if (!Array.isArray(value.peaks) || value.peaks.length > MAX_AUDIO_PEAKS
    || value.peaks.some(p => typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1)) {
    throw new Error(`Audio peaks must contain at most ${MAX_AUDIO_PEAKS} normalized values between 0 and 1`);
  }
  return { id: value.id, name: value.name, src: value.src, duration: value.duration, offsetSeconds: value.offsetSeconds,
    volume: value.volume, muted: value.muted, peaks: [...value.peaks] };
}

export function importRhubarbCues(json: string, offsetSeconds = 0): LipSyncCue[] {
  if (typeof json !== 'string' || json.length > 8 * 1024 * 1024) throw new Error('Rhubarb JSON must be text smaller than 8 MiB');
  if (!seconds(offsetSeconds)) throw new Error('Rhubarb offset must be finite, nonnegative seconds');
  let data: unknown;
  try { data = JSON.parse(json); } catch { throw new Error('The Rhubarb file is not valid JSON'); }
  if (!record(data) || !Array.isArray(data.mouthCues)) throw new Error('Rhubarb JSON must contain a mouthCues array');
  if (data.mouthCues.length > MAX_LIP_SYNC_CUES) throw new Error(`Rhubarb import exceeds ${MAX_LIP_SYNC_CUES} cues`);
  const cues = data.mouthCues.map((cue, index) => {
    if (!record(cue) || !seconds(cue.start) || !seconds(cue.end) || cue.end <= cue.start) throw new Error(`Rhubarb cue ${index + 1} has invalid start/end seconds`);
    if (!isViseme(cue.value)) throw new Error(`Rhubarb cue ${index + 1} has an unknown mouth value (expected X or A–H)`);
    return { id: `rhubarb-${index + 1}`, start: cue.start + offsetSeconds, end: cue.end + offsetSeconds, viseme: cue.value };
  });
  return normalizeLipSyncCues(cues);
}

/** Amplitude-only draft from uniformly spaced normalized RMS windows. NOT phoneme recognition. */
export function generateEnergyCues(peaks: number[], duration: number, offsetSeconds = 0, threshold = 0.04): LipSyncCue[] {
  if (!seconds(duration) || !seconds(offsetSeconds) || duration + offsetSeconds > MAX_LIP_SYNC_SECONDS) throw new Error('Energy draft duration and offset must be finite, nonnegative seconds (maximum 24 hours)');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('Energy threshold must be between 0 and 1');
  if (!Array.isArray(peaks) || peaks.length > MAX_AUDIO_PEAKS || peaks.some(p => !Number.isFinite(p) || p < 0 || p > 1)) {
    throw new Error(`Energy draft requires at most ${MAX_AUDIO_PEAKS} normalized RMS windows between 0 and 1`);
  }
  if (duration === 0) return [];
  if (!peaks.length) return [{ id: 'energy-1', start: offsetSeconds, end: offsetSeconds + duration, viseme: 'X' }];
  // Average adjacent RMS windows in bounded ~50 ms buckets so long files remain editable.
  const count = Math.min(peaks.length, Math.max(1, Math.ceil(duration / 0.05)), MAX_LIP_SYNC_CUES);
  const cues: LipSyncCue[] = [];
  for (let index = 0; index < count; index += 1) {
    const from = Math.floor(index * peaks.length / count), to = Math.floor((index + 1) * peaks.length / count);
    let sum = 0;
    for (let p = from; p < to; p += 1) sum += peaks[p] * peaks[p];
    const rms = Math.sqrt(sum / (to - from));
    const viseme: Viseme = rms <= threshold ? 'X' : rms >= Math.max(0.35, threshold * 2) ? 'D' : 'C';
    const start = offsetSeconds + duration * index / count, end = offsetSeconds + duration * (index + 1) / count;
    const previous = cues[cues.length - 1];
    if (previous?.viseme === viseme) previous.end = end;
    else cues.push({ id: `energy-${cues.length + 1}`, start, end, viseme });
  }
  return normalizeLipSyncCues(cues);
}
