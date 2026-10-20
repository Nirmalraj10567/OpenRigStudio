import { createId } from './Rig';
import type { CameraProductionSettings, CameraRigDefinition, CameraTransitionPreset, CurveEasing, SerializableValue } from './model';
import type { Rig } from './Rig';
import { normalizeStage2DSettings } from './stage2d';
import { activeCameraId, sampledCamera, setCameraCutWithPreset, updateCameraControls } from './camera';
import { defaultCamera3D, normalizeCamera3D } from './camera3d';
import { sampleTrack } from './animation';
import { layer3DPoint } from './render3d';
import type { Stage2DSettings } from './stage2d';

const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const EASINGS: CurveEasing[] = ['step', 'linear', 'smooth', 'ease-in', 'ease-out', 'ease-in-out', 'bezier', 'bounce', 'elastic', 'overshoot'];
const KINDS = ['cut', 'dissolve', 'push', 'whip', 'zoom'] as const;

export function defaultCameraProduction(): CameraProductionSettings {
  return { stageMode: false, liveControl: { enabled: false, source: 'pointer', sensitivity: 1, smoothing: .8 }, shake: { enabled: false, amplitude: 0, frequency: 12, rotation: 0, seed: 1 }, bookmarks: [], transitionPresets: [{ id: 'cut', name: 'Hard cut', duration: 0, easing: 'step', kind: 'cut' }, { id: 'dissolve', name: 'Dissolve 12f', duration: 12, easing: 'smooth', kind: 'dissolve' }, { id: 'push', name: 'Push 18f', duration: 18, easing: 'ease-in-out', kind: 'push' }, { id: 'whip', name: 'Whip 8f', duration: 8, easing: 'overshoot', kind: 'whip' }, { id: 'zoom', name: 'Zoom 12f', duration: 12, easing: 'ease-in-out', kind: 'zoom' }], cameraRigs: [], defaultTransitionPresetId: 'cut' };
}

export function normalizeCameraProduction(value: unknown, cameraIds: Set<string>, targetIds: Set<string>): CameraProductionSettings {
  const base = defaultCameraProduction(); if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  const raw = value as Partial<CameraProductionSettings>, ids = new Set<string>();
  const id = (candidate: unknown, prefix: string) => { const result = typeof candidate === 'string' && candidate ? candidate : createId(prefix); if (ids.has(result)) return null; ids.add(result); return result; };
  const bookmarks = Array.isArray(raw.bookmarks) ? raw.bookmarks.slice(0, 128).flatMap(item => {
    if (!item || typeof item !== 'object' || !cameraIds.has(item.cameraId)) return [];
    const itemId = id(item.id, 'bookmark'); if (!itemId) return [];
    return [{ id: itemId, name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 80) : 'Bookmark', frame: Math.max(0, Math.round(finite(item.frame, 0))), cameraId: item.cameraId, settings: normalizeStage2DSettings({ ...item.settings, enabled: true }) }];
  }) : [];
  const presets = Array.isArray(raw.transitionPresets) ? raw.transitionPresets.slice(0, 32).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const itemId = id(item.id, 'transition'); if (!itemId) return [];
    return [{ id: itemId, name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 80) : 'Transition', duration: Math.round(clamp(finite(item.duration, 0), 0, 240)), easing: EASINGS.includes(item.easing as CurveEasing) ? item.easing as CurveEasing : 'smooth', kind: KINDS.includes(item.kind as typeof KINDS[number]) ? item.kind as typeof KINDS[number] : 'dissolve' }];
  }) : base.transitionPresets;
  const cameraRigs = Array.isArray(raw.cameraRigs) ? raw.cameraRigs.slice(0, 32).flatMap(item => {
    if (!item || typeof item !== 'object' || !cameraIds.has(item.cameraId)) return [];
    const itemId = id(item.id, 'camera-rig'); if (!itemId) return [];
    return [{ id: itemId, name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 80) : 'Camera rig', cameraId: item.cameraId, ...(typeof item.targetId === 'string' && targetIds.has(item.targetId) ? { targetId: item.targetId } : {}), enabled: item.enabled !== false, orbit: { yaw: finite(item.orbit?.yaw, 0), pitch: clamp(finite(item.orbit?.pitch, 0), -85, 85), distance: clamp(finite(item.orbit?.distance, 900), 10, 100000) }, damping: clamp(finite(item.damping, .85), 0, 1) }];
  }) : [];
  const live: Partial<CameraProductionSettings['liveControl']> = raw.liveControl && typeof raw.liveControl === 'object' ? raw.liveControl : {};
  const shake: Partial<CameraProductionSettings['shake']> = raw.shake && typeof raw.shake === 'object' ? raw.shake : {};
  const selectedPreset = typeof raw.defaultTransitionPresetId === 'string' && presets.some(item => item.id === raw.defaultTransitionPresetId) ? raw.defaultTransitionPresetId : presets[0]?.id ?? 'cut';
  return { stageMode: raw.stageMode === true, liveControl: { enabled: live.enabled === true, source: live.source === 'device-orientation' || live.source === 'gamepad' ? live.source : 'pointer', sensitivity: clamp(finite(live.sensitivity, 1), 0, 10), smoothing: clamp(finite(live.smoothing, .8), 0, .99) }, shake: { enabled: shake.enabled === true, amplitude: clamp(finite(shake.amplitude, 0), 0, 200), frequency: clamp(finite(shake.frequency, 12), 0, 120), rotation: clamp(finite(shake.rotation, 0), 0, 30), seed: Math.round(finite(shake.seed, 1)) }, bookmarks, transitionPresets: presets, cameraRigs, defaultTransitionPresetId: selectedPreset };
}

function recordProductionTrack(rig: Rig, targetId: string, property: string, value: SerializableValue, easing: NonNullable<import('./model').Keyframe['easing']> = 'step') {
  const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId); if (!clip) return;
  const existing = clip.tracks.find(track => track.targetId === targetId && track.property === property);
  if (existing) { const key = existing.keyframes.find(item => item.frame === Math.round(rig.timeline.currentFrame)); if (key) key.value = value; else existing.keyframes.push({ id: createId('key'), frame: Math.round(rig.timeline.currentFrame), value, easing }); existing.keyframes.sort((a, b) => a.frame - b.frame); }
  else clip.tracks.push({ id: createId('track'), targetId, property, keyframes: [{ id: createId('key'), frame: Math.round(rig.timeline.currentFrame), value, easing }] });
}

export function captureCameraBookmark(rig: Rig, name = `Bookmark ${rig.cameraProduction.bookmarks.length + 1}`): string | null {
  const cameraId = activeCameraId(rig);
  if (!cameraId) return null;
  const id = createId('bookmark'); rig.cameraProduction.bookmarks.push({ id, name, frame: Math.round(rig.timeline.currentFrame), cameraId, settings: JSON.parse(JSON.stringify(sampledCamera(rig, cameraId)!.settings)) }); return id;
}

export function applyCameraBookmark(rig: Rig, bookmarkId: string, key = false): boolean {
  const bookmark = rig.cameraProduction.bookmarks.find(item => item.id === bookmarkId); if (!bookmark || !rig.cameras.some(camera => camera.id === bookmark.cameraId)) return false;
  rig.cameraView = bookmark.cameraId; updateCameraControls(rig, bookmark.settings, key, key); return true;
}

export function removeCameraBookmark(rig: Rig, bookmarkId: string): boolean { const before = rig.cameraProduction.bookmarks.length; rig.cameraProduction.bookmarks = rig.cameraProduction.bookmarks.filter(item => item.id !== bookmarkId); return rig.cameraProduction.bookmarks.length !== before; }
export function addCameraTransitionPreset(rig: Rig, values: Partial<CameraTransitionPreset> = {}): string { const id = createId('transition'); rig.cameraProduction.transitionPresets.push({ id, name: values.name ?? 'Custom transition', duration: Math.round(clamp(values.duration ?? 12, 0, 240)), easing: values.easing ?? 'smooth', kind: values.kind ?? 'dissolve' }); return id; }
export function setDefaultCameraTransition(rig: Rig, presetId: string): boolean { if (!rig.cameraProduction.transitionPresets.some(item => item.id === presetId)) return false; rig.cameraProduction.defaultTransitionPresetId = presetId; return true; }
export function recordCameraCutPreset(rig: Rig, cameraId: string, presetId = rig.cameraProduction.defaultTransitionPresetId): boolean { const preset = rig.cameraProduction.transitionPresets.find(item => item.id === presetId); if (!preset) return false; setCameraCutWithPreset(rig, cameraId, preset); return true; }

export function addCameraRig(rig: Rig, cameraId: string, targetId?: string): string | null {
  if (!rig.cameras.some(camera => camera.id === cameraId)) return null;
  const id = createId('camera-rig');
  rig.cameraProduction.cameraRigs.push({ id, cameraId, targetId, name: 'Orbit rig', enabled: true, orbit: { yaw: 0, pitch: 0, distance: 900 }, damping: .85 }); return id;
}
export function recordCameraRig(rig: Rig, id: string): boolean {
  const item = rig.cameraProduction.cameraRigs.find(item => item.id === id); if (!item) return false;
  if (!rig.animations.some(clip => clip.id === rig.timeline.activeAnimationId)) { const clipId = createId('animation'); rig.animations.push({ id: clipId, name: 'Camera rig motion', startFrame: 0, endFrame: rig.timeline.endFrame, fps: rig.timeline.fps, tracks: [] }); rig.timeline.activeAnimationId = clipId; }
  recordProductionTrack(rig, item.cameraId, 'cameraRig', { ...item.orbit }, 'smooth'); return true;
}
export function resolveCameraRig(rig: Rig, cameraId: string, settings: Stage2DSettings): Stage2DSettings {
  const definition = rig.cameraProduction.cameraRigs.find(item => item.enabled && item.cameraId === cameraId); if (!definition) return settings;
  const track = rig.animations.find(clip => clip.id === rig.timeline.activeAnimationId)?.tracks.find(track => track.targetId === cameraId && track.property === 'cameraRig');
  const sample = track ? sampleTrack(track, rig.timeline.currentFrame) : null;
  const orbit = sample && typeof sample === 'object' && !Array.isArray(sample) ? { yaw: finite(sample.yaw, definition.orbit.yaw), pitch: finite(sample.pitch, definition.orbit.pitch), distance: finite(sample.distance, definition.orbit.distance) } : definition.orbit;
  const target = definition.targetId ? rig.layers.get(definition.targetId) ?? rig.bones.get(definition.targetId) : undefined;
  const center = target ? rig.layers.has(target.id) ? layer3DPoint(rig.layers.get(target.id)!, { x: 0, y: 0, z: 0 }, rig.canvas) : { x: target.world.x - rig.canvas.width / 2, y: target.world.y - rig.canvas.height / 2, z: 0 } : { x: 0, y: 0, z: 0 };
  const yaw = orbit.yaw * Math.PI / 180, pitch = orbit.pitch * Math.PI / 180;
  const camera = normalizeCamera3D(settings.camera3d ?? defaultCamera3D());
  return { ...settings, enabled: true, camera3d: { ...camera, enabled: true, position: { x: center.x + Math.sin(yaw) * Math.cos(pitch) * orbit.distance, y: center.y - Math.sin(pitch) * orbit.distance, z: center.z + Math.cos(yaw) * Math.cos(pitch) * orbit.distance }, rotation: { x: orbit.pitch, y: orbit.yaw, z: camera.rotation.z }, focusDistance: orbit.distance } };
}

/** Bookmarks become editable ordinary camera path keys, including the physical lens. */
export function createCameraPath(rig: Rig, cameraId: string, duration = 48): boolean {
  const bookmarks = rig.cameraProduction.bookmarks.filter(bookmark => bookmark.cameraId === cameraId); if (bookmarks.length < 2) return false;
  const frame = rig.timeline.currentFrame, view = rig.cameraView;
  try {
    rig.cameraView = cameraId;
    bookmarks.forEach((bookmark, index) => { rig.setTimeline({ currentFrame: frame + index * Math.max(1, duration) }); updateCameraControls(rig, bookmark.settings, true, true); });
    rig.timeline.endFrame = Math.max(rig.timeline.endFrame, frame + (bookmarks.length - 1) * duration);
  } finally { rig.setTimeline({ currentFrame: frame }); rig.cameraView = view; rig.cameraOverride = null; }
  return true;
}

export function triggerLiveCamera(rig: Rig, cameraId: string, record = false): boolean {
  if (!rig.cameras.some(camera => camera.id === cameraId)) return false;
  if (record) { recordCameraCutPreset(rig, cameraId); rig.liveCameraId = null; }
  else rig.liveCameraId = cameraId;
  rig.liveCameraPose = null; return true;
}

export function updateLiveCamera(rig: Rig, input: { x: number; y: number; zoom?: number }, dt = 1 / rig.timeline.fps): void {
  const live = rig.cameraProduction.liveControl, cameraId = activeCameraId(rig); if (!live.enabled || !cameraId) return;
  const current = rig.liveCameraPose?.id === cameraId ? rig.liveCameraPose.settings : rig.getStageView();
  const amount = 1 - Math.pow(live.smoothing, Math.max(0, dt) * 60), scale = live.sensitivity * amount;
  const camera3d = current.camera3d?.enabled ? { ...current.camera3d, position: { ...current.camera3d.position, x: current.camera3d.position.x - input.x * scale, y: current.camera3d.position.y - input.y * scale }, focalLength: clamp(current.camera3d.focalLength * Math.exp((input.zoom ?? 0) * scale), 12, 400) } : current.camera3d;
  rig.liveCameraPose = { id: cameraId, settings: normalizeStage2DSettings({ ...current, camera3d, ...(camera3d?.enabled ? {} : { cameraX: current.cameraX + input.x * scale, cameraY: current.cameraY + input.y * scale, zoom: clamp(current.zoom * Math.exp((input.zoom ?? 0) * scale), .1, 4) }) }) };
}
