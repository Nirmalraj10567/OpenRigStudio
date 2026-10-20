import { sampleTrack, upsertKeyframe } from './animation';
import { createId } from './Rig';
import type { Rig } from './Rig';
import type { AnimationClip, CameraDefinition, CameraFollow, CameraTransitionPreset, SerializableValue } from './model';
import { localToWorldPoint } from './math';
import type { Point2D } from './math';
import { normalizeStage2DSettings, stageLayerTransform } from './stage2d';
import type { Stage2DSettings } from './stage2d';
import { resolveCameraRig } from './cameraProduction';
import { easeCurve } from './animationCurves';

export const CAMERA_SWITCH_TARGET = '$camera-switch';
export const CAMERA_PROPERTIES = ['cameraX', 'cameraY', 'zoom', 'yaw', 'pitch', 'roll', 'perspective', 'projection', 'camera3d'] as const;
export type CameraProperty = typeof CAMERA_PROPERTIES[number];
export type CameraToolMode = 'pan' | 'zoom' | 'roll' | 'orbit';
export const isCameraTarget = (rig: Pick<Rig, 'cameras'>, id: string) => id === CAMERA_SWITCH_TARGET || rig.cameras.some(camera => camera.id === id);

export function normalizeCameras(value: unknown): CameraDefinition[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>(), hotkeys = new Set<number>();
  return value.slice(0, 32).flatMap(raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id || ['preview', 'switch', CAMERA_SWITCH_TARGET].includes(raw.id) || ids.has(raw.id)) return [];
    ids.add(raw.id);
    const hotkey = Number.isInteger(raw.hotkey) && raw.hotkey >= 1 && raw.hotkey <= 9 && !hotkeys.has(raw.hotkey) ? raw.hotkey : undefined;
    if (hotkey) hotkeys.add(hotkey);
    return [{ id: raw.id, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : 'Camera', settings: normalizeStage2DSettings({ ...raw.settings, enabled: true }), follow: normalizeFollow(raw.follow), ...(hotkey ? { hotkey } : {}) }];
  });
}

function normalizeFollow(value: unknown): CameraFollow | null {
  const follow = value as Partial<CameraFollow> | null;
  return follow && typeof follow.targetId === 'string' && typeof follow.anchorX === 'number' && Number.isFinite(follow.anchorX)
    && typeof follow.anchorY === 'number' && Number.isFinite(follow.anchorY)
    ? { targetId: follow.targetId, anchorX: follow.anchorX, anchorY: follow.anchorY } : null;
}

export function activeCameraId(rig: Rig): string | null {
  if (rig.liveCameraId && rig.cameras.some(camera => camera.id === rig.liveCameraId)) return rig.liveCameraId;
  if (rig.cameraView === 'preview') return null;
  if (rig.cameraView !== 'switch') return rig.cameras.find(camera => camera.id === rig.cameraView)?.id ?? null;
  const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  const track = clip?.tracks.find(item => item.targetId === CAMERA_SWITCH_TARGET && item.property === 'camera');
  const id = track ? sampleTrack({ ...track, keyframes: track.keyframes.map(key => ({ ...key, easing: 'step' })) }, rig.timeline.currentFrame) : undefined;
  return rig.cameras.find(camera => camera.id === id)?.id ?? rig.cameras[0]?.id ?? null;
}

export function sampledCamera(rig: Rig, id: string): { settings: Stage2DSettings; follow: CameraFollow | null; followOffset: Point2D } | null {
  const camera = rig.cameras.find(item => item.id === id);
  if (!camera) return null;
  const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  const settings = { ...camera.settings };
  let follow = camera.follow;
  let followOffset: Point2D = { x: 0, y: 0 };
  clip?.tracks.filter(track => track.targetId === id).forEach(track => {
    const value = sampleTrack(['follow', 'followOffset', 'projection'].includes(track.property) ? { ...track, keyframes: track.keyframes.map(key => ({ ...key, easing: 'step' })) } : track, rig.timeline.currentFrame);
    if (track.property === 'follow' && value !== undefined) follow = normalizeFollow(value);
    else if (track.property === 'followOffset' && value && typeof value === 'object' && !Array.isArray(value)
      && typeof value.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y)) followOffset = { x: value.x, y: value.y };
    else if (CAMERA_PROPERTIES.includes(track.property as CameraProperty) && value !== undefined) Object.assign(settings, { [track.property]: value });
  });
  return { settings: normalizeStage2DSettings({ ...settings, enabled: true }), follow, followOffset };
}

export function resolveCameraView(rig: Rig, cameraId?: string, ignoreTransition = false): Stage2DSettings {
  const id = cameraId ?? activeCameraId(rig);
  if (!id) return normalizeStage2DSettings(rig.stage2d);
  const sampled = sampledCamera(rig, id)!;
  let settings = rig.liveCameraPose?.id === id ? { ...rig.liveCameraPose.settings } : rig.cameraOverride?.id === id && rig.cameraOverride.frame === rig.timeline.currentFrame
    ? { ...rig.cameraOverride.settings } : resolveCameraRig(rig, id, { ...sampled.settings });
  const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  const transitionTrack = clip?.tracks.find(track => track.targetId === CAMERA_SWITCH_TARGET && track.property === 'cameraTransition');
  const transitionKey = transitionTrack?.keyframes.filter(key => key.frame <= rig.timeline.currentFrame).sort((a, b) => b.frame - a.frame)[0];
  if (!ignoreTransition && !rig.liveCameraId && rig.cameraView === 'switch' && transitionKey && transitionKey.value && typeof transitionKey.value === 'object' && !Array.isArray(transitionKey.value)) {
    const transition = transitionKey.value as { from?: string; to?: string; duration?: number; easing?: import('./model').CurveEasing; kind?: string }, duration = Math.max(0, Number(transition.duration) || 0), amount = duration ? Math.min(1, Math.max(0, (rig.timeline.currentFrame - transitionKey.frame) / duration)) : 1;
    if (transition.to === id && transition.from && amount < 1) {
      const previous = sampledCamera(rig, transition.from);
      if (previous) {
        const t = easeCurve(amount, transition.easing ?? 'smooth');
        const blend = (a: number, b: number) => a + (b - a) * t;
        if (!['dissolve', 'push'].includes(transition.kind ?? '')) settings = { ...settings, cameraX: blend(previous.settings.cameraX, settings.cameraX), cameraY: blend(previous.settings.cameraY, settings.cameraY), zoom: blend(previous.settings.zoom, settings.zoom), perspective: blend(previous.settings.perspective, settings.perspective), yaw: blend(previous.settings.yaw, settings.yaw), pitch: blend(previous.settings.pitch, settings.pitch), roll: blend(previous.settings.roll, settings.roll), camera3d: previous.settings.camera3d && settings.camera3d ? { ...settings.camera3d, position: { x: blend(previous.settings.camera3d.position.x, settings.camera3d.position.x), y: blend(previous.settings.camera3d.position.y, settings.camera3d.position.y), z: blend(previous.settings.camera3d.position.z, settings.camera3d.position.z) }, rotation: { x: blend(previous.settings.camera3d.rotation.x, settings.camera3d.rotation.x), y: blend(previous.settings.camera3d.rotation.y, settings.camera3d.rotation.y), z: blend(previous.settings.camera3d.rotation.z, settings.camera3d.rotation.z) }, focalLength: blend(previous.settings.camera3d.focalLength, settings.camera3d.focalLength) } : settings.camera3d };
        if (transition.kind === 'whip') settings.cameraX += Math.sin(Math.PI * amount) * rig.canvas.width * .3;
        if (transition.kind === 'zoom') settings.zoom *= 1 + Math.sin(Math.PI * amount) * .5;
      }
    }
  }
  settings.cameraX += sampled.followOffset.x;
  settings.cameraY += sampled.followOffset.y;
  const follow = sampled.follow;
  const target = follow ? rig.bones.get(follow.targetId) ?? rig.layers.get(follow.targetId) : undefined;
  if (target && follow) {
    const layer = rig.layers.get(target.id);
    const matrix = stageLayerTransform(layer ?? {}, settings, { x: rig.canvas.width / 2, y: rig.canvas.height / 2 });
    const parallax = settings.projection === 'orthographic' ? 1 : layer?.parallax ?? 1;
    if (parallax > 0) {
      const dx = target.world.x - follow.anchorX, dy = target.world.y - follow.anchorY;
      settings.cameraX -= (matrix.a * dx + matrix.c * dy) / parallax;
      settings.cameraY -= (matrix.b * dx + matrix.d * dy) / parallax;
    }
  }
  const shake = rig.cameraProduction?.shake;
  if (shake?.enabled && shake.amplitude > 0) {
    const time = rig.timeline.currentFrame / Math.max(.001, rig.timeline.fps), seed = shake.seed * 12.9898;
    settings.cameraX += Math.sin(time * shake.frequency * 6.283 + seed) * shake.amplitude;
    settings.cameraY += Math.cos(time * shake.frequency * 5.317 + seed * 1.7) * shake.amplitude;
    const rotation = Math.sin(time * shake.frequency * 4.271 + seed * .7) * shake.rotation;
    if (settings.camera3d?.enabled) settings.camera3d = { ...settings.camera3d, rotation: { ...settings.camera3d.rotation, z: settings.camera3d.rotation.z + rotation } }; else settings.roll += rotation;
  }
  return settings;
}

function ensureClip(rig: Rig): AnimationClip {
  let clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  if (!clip) {
    clip = { id: createId('animation'), name: 'Scene animation', fps: rig.timeline.fps, startFrame: rig.timeline.startFrame, endFrame: rig.timeline.endFrame, tracks: [] };
    rig.animations.push(clip); rig.setTimeline({ activeAnimationId: clip.id });
  }
  return clip;
}

function record(rig: Rig, targetId: string, property: string, value: SerializableValue, initial: SerializableValue, discrete = false) {
  const clip = ensureClip(rig), frame = Math.max(0, Math.round(rig.timeline.currentFrame));
  let track = clip.tracks.find(item => item.targetId === targetId && item.property === property);
  if (!track) { track = { id: createId('track'), targetId, property, keyframes: [] }; clip.tracks.push(track); }
  if (!track.keyframes.length && frame > 0) track.keyframes.push({ id: createId('key'), frame: 0, value: initial, easing: discrete ? 'step' : 'smooth' });
  const key = track.keyframes.find(item => item.frame === frame);
  Object.assign(track, upsertKeyframe(track, { id: key?.id ?? createId('key'), frame, value, easing: discrete ? 'step' : key?.easing ?? 'smooth' }));
  clip.endFrame = Math.max(clip.endFrame, frame);
}

/** Preview is non-keyable. Camera playback never mutates the base camera pose. */
export function updateCameraControls(rig: Rig, patch: Partial<Stage2DSettings>, autoKey: boolean, explicitKey = false): void {
  if (rig.cameraView === 'switch') return;
  if (rig.cameraView === 'preview') { rig.setStage2D({ ...patch, enabled: true }); return; }
  const camera = rig.cameras.find(item => item.id === rig.cameraView);
  if (!camera) return;
  const current = rig.cameraOverride?.id === camera.id && rig.cameraOverride.frame === rig.timeline.currentFrame
    ? rig.cameraOverride.settings : sampledCamera(rig, camera.id)!.settings;
  const next = normalizeStage2DSettings({ ...current, ...patch, enabled: true });
  const frame = rig.timeline.currentFrame;
  if (explicitKey || autoKey && frame > 0) {
    for (const property of CAMERA_PROPERTIES) {
      if ((explicitKey || Object.prototype.hasOwnProperty.call(patch, property)) && next[property] !== undefined) record(rig, camera.id, property, next[property] as unknown as SerializableValue, (camera.settings[property] ?? next[property]) as unknown as SerializableValue, property === 'projection');
    }
  } else {
    camera.settings = next;
    if (frame === 0) {
      const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
      for (const property of CAMERA_PROPERTIES) if (next[property] !== undefined && clip?.tracks.some(track => track.targetId === camera.id && track.property === property)) record(rig, camera.id, property, next[property] as unknown as SerializableValue, next[property] as unknown as SerializableValue, property === 'projection');
    }
  }
  rig.cameraOverride = { id: camera.id, frame, settings: next };
}

export function addCamera(rig: Rig, name = `Camera ${rig.cameras.length + 1}`): string | null {
  if (rig.cameras.length >= 32) return null;
  const id = createId('camera');
  const settings = normalizeStage2DSettings({ ...rig.getStageView(), enabled: true });
  const hotkey = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(number => !rig.cameras.some(camera => camera.hotkey === number));
  rig.cameras.push({ id, name, settings, follow: null, ...(hotkey ? { hotkey } : {}) });
  rig.cameraView = id; rig.cameraOverride = null;
  return id;
}

export function removeCamera(rig: Rig, id: string): void {
  rig.cameras = rig.cameras.filter(camera => camera.id !== id);
  rig.animations.forEach(clip => {
    clip.tracks = clip.tracks.filter(track => track.targetId !== id);
    clip.tracks.filter(track => track.targetId === CAMERA_SWITCH_TARGET).forEach(track => { track.keyframes = track.keyframes.filter(key => key.value !== id); });
  });
  if (rig.cameraView === id || rig.cameraView === 'switch' && !rig.cameras.length) rig.cameraView = 'preview';
  rig.cameraOverride = null;
  if (rig.liveCameraId === id) rig.liveCameraId = null;
  if (rig.liveCameraPose?.id === id) rig.liveCameraPose = null;
  rig.cameraProduction.bookmarks = rig.cameraProduction.bookmarks.filter(item => item.cameraId !== id);
  rig.cameraProduction.cameraRigs = rig.cameraProduction.cameraRigs.filter(item => item.cameraId !== id);
  rig.animations.forEach(clip => { clip.tracks.filter(track => track.property === 'cameraTransition').forEach(track => { track.keyframes = track.keyframes.filter(key => !key.value || typeof key.value !== 'object' || Array.isArray(key.value) || key.value.from !== id && key.value.to !== id); }); });
}

export function setCameraCut(rig: Rig, id: string): void {
  setCameraCutWithPreset(rig, id, { id: 'cut', name: 'Hard cut', duration: 0, easing: 'step', kind: 'cut' });
}

export function setCameraCutWithPreset(rig: Rig, id: string, preset: CameraTransitionPreset): void {
  if (!rig.cameras.some(camera => camera.id === id)) return;
  const previous = activeCameraId(rig);
  record(rig, CAMERA_SWITCH_TARGET, 'camera', id, rig.cameras[0].id, true);
  if (previous && previous !== id && preset.duration > 0 && preset.kind !== 'cut') record(rig, CAMERA_SWITCH_TARGET, 'cameraTransition', { from: previous, to: id, duration: preset.duration, easing: preset.easing, kind: preset.kind } as unknown as SerializableValue, null, true);
  else if (rig.animations.find(clip => clip.id === rig.timeline.activeAnimationId)?.tracks.some(track => track.property === 'cameraTransition')) record(rig, CAMERA_SWITCH_TARGET, 'cameraTransition', null, null, true);
  rig.cameraView = 'switch'; rig.cameraOverride = null;
}

export function cameraTransitionViews(rig: Rig): { from: Stage2DSettings; to: Stage2DSettings; kind: 'dissolve' | 'push'; amount: number } | null {
  if (rig.stageRenderOverride || rig.liveCameraId || rig.cameraView !== 'switch') return null;
  const clip = rig.animations.find(clip => clip.id === rig.timeline.activeAnimationId), track = clip?.tracks.find(track => track.targetId === CAMERA_SWITCH_TARGET && track.property === 'cameraTransition');
  const key = track?.keyframes.filter(key => key.frame <= rig.timeline.currentFrame).sort((a, b) => b.frame - a.frame)[0];
  const value = key?.value;
  if (!key || !value || typeof value !== 'object' || Array.isArray(value) || !['dissolve', 'push'].includes(String(value.kind)) || typeof value.from !== 'string' || typeof value.to !== 'string' || !rig.cameras.some(camera => camera.id === value.from) || !rig.cameras.some(camera => camera.id === value.to) || activeCameraId(rig) !== value.to) return null;
  const duration = typeof value.duration === 'number' ? value.duration : 0, t = duration ? (rig.timeline.currentFrame - key.frame) / duration : 1;
  if (t < 0 || t >= 1) return null;
  return { from: resolveCameraView(rig, value.from, true), to: resolveCameraView(rig, value.to, true), kind: value.kind as 'dissolve' | 'push', amount: easeCurve(t, value.easing as import('./model').CurveEasing ?? 'smooth') };
}

export function setCameraFollow(rig: Rig, targetId: string | null): void {
  const camera = rig.cameras.find(item => item.id === rig.cameraView);
  if (!camera) return;
  const target = targetId ? rig.bones.get(targetId) ?? rig.layers.get(targetId) : undefined;
  if (targetId && !target) return;
  const current = rig.getStageView();
  const sampled = sampledCamera(rig, camera.id)!;
  const controls = rig.cameraOverride?.id === camera.id && rig.cameraOverride.frame === rig.timeline.currentFrame ? rig.cameraOverride.settings : sampled.settings;
  const offset = { x: current.cameraX - controls.cameraX, y: current.cameraY - controls.cameraY };
  const follow = target ? { targetId: target.id, anchorX: target.world.x, anchorY: target.world.y } : null;
  const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  // Hold a framing correction at the link change, rather than inserting pan
  // curves that would change the already-authored camera motion before it.
  if (offset.x || offset.y || clip?.tracks.some(track => track.targetId === camera.id && track.property === 'followOffset')) {
    record(rig, camera.id, 'followOffset', offset, { x: 0, y: 0 }, true);
  }
  if (rig.timeline.currentFrame > 0) {
    record(rig, camera.id, 'follow', follow as unknown as SerializableValue, camera.follow as unknown as SerializableValue, true);
  } else {
    camera.follow = follow;
    if (clip?.tracks.some(track => track.targetId === camera.id && track.property === 'follow')) {
      record(rig, camera.id, 'follow', follow as unknown as SerializableValue, follow as unknown as SerializableValue, true);
    }
  }
  rig.cameraOverride = null;
}

function layerPoints(rig: Rig, id: string): Point2D[] {
  const layer = rig.getRenderLayer(id);
  if (!layer || !layer.visible || rig.getLayerOpacity(id) <= 0) return [];
  if (layer.mesh) return rig.getMeshVertices(id);
  let points: Point2D[] = [];
  if (layer.type === 'image') points = [{ x: -layer.width / 2, y: -layer.height / 2 }, { x: layer.width / 2, y: layer.height / 2 }];
  else for (const shape of layer.shapes) {
    const x = shape.x ?? 0, y = shape.y ?? 0;
    if (shape.kind === 'polygon') points.push(...shape.points ?? []);
    else if (shape.kind === 'ellipse') points.push({ x: x - Math.abs(shape.radiusX ?? 1), y: y - Math.abs(shape.radiusY ?? 1) }, { x: x + Math.abs(shape.radiusX ?? 1), y: y + Math.abs(shape.radiusY ?? 1) });
    else if (shape.kind === 'rect') points.push({ x, y }, { x: x + (shape.width ?? 1), y: y + (shape.height ?? 1) });
    else {
      const numbers = (shape.d ?? '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
      for (let index = 0; index + 1 < numbers.length; index += 2) points.push({ x: numbers[index], y: numbers[index + 1] });
    }
  }
  if (!points.length) return [];
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }].map(point => localToWorldPoint(layer.world, point));
}

export function focusCamera(rig: Rig, selectedId: string | null): Partial<Stage2DSettings> | null {
  const stage = rig.getStageView(), center = { x: rig.canvas.width / 2, y: rig.canvas.height / 2 };
  const boneIds = new Set<string>();
  if (selectedId && rig.bones.has(selectedId)) {
    const visit = (id: string) => { if (boneIds.has(id)) return; boneIds.add(id); rig.getChildren(id).forEach(child => visit(child.id)); };
    visit(selectedId);
  }
  const layers = rig.layersInOrder.filter(layer => !selectedId || layer.id === selectedId || layer.boundBoneId && boneIds.has(layer.boundBoneId));
  const entries = layers.flatMap(layer => layerPoints(rig, layer.id).map(point => ({ layer, point })));
  if (!entries.length) return null;
  let zoom = 1, cameraX = 0, cameraY = 0;
  for (let iteration = 0; iteration < 6; iteration++) {
    const projected = entries.map(({ layer, point }) => {
      const m = stageLayerTransform(layer, { ...stage, enabled: true, zoom, cameraX, cameraY }, center);
      return { x: m.a * point.x + m.c * point.y + m.e, y: m.b * point.x + m.d * point.y + m.f };
    });
    const minX = Math.min(...projected.map(point => point.x)), maxX = Math.max(...projected.map(point => point.x));
    const minY = Math.min(...projected.map(point => point.y)), maxY = Math.max(...projected.map(point => point.y));
    const factor = Math.min(rig.canvas.width * .82 / Math.max(1, maxX - minX), rig.canvas.height * .82 / Math.max(1, maxY - minY));
    const parallax = stage.projection === 'orthographic' ? 1 : entries.reduce((sum, entry) => sum + (entry.layer.parallax ?? 1), 0) / entries.length;
    cameraX += (center.x - (minX + maxX) / 2) / Math.max(.1, parallax);
    cameraY += (center.y - (minY + maxY) / 2) / Math.max(.1, parallax);
    zoom = Math.max(.1, Math.min(4, zoom * factor));
  }
  return { cameraX, cameraY, zoom, enabled: true };
}
