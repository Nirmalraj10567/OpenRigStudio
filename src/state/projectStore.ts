import { create } from 'zustand';
import {
  advanceTimeline,
  frameToTime,
  removeKeyframe,
  upsertKeyframe,
} from '../engine/animation';
import { createId, Rig } from '../engine/Rig';
import { createEmptyProject } from '../engine/model';
import type {
  ActionLibraryItem,
  ControllerDefinition,
  ControllerEvaluation,
  ControllerInputValue,
  ControllerInstance,
  AnimationClip,
  AnimationTrack,
  Keyframe,
  ProjectInput,
  ProjectModel,
  SerializableValue,
  TimelineState,
  VectorShape,
  MotionPath,
} from '../engine/model';
import {
  clearProjectFromStorage,
  getDefaultStorage,
  loadProjectFromStorage,
  saveProjectToStorage,
  StorageLike,
} from '../engine/persistence';
import { deserializeProject, serializeProject } from '../engine/serialization';
import { deleteKeyframes, moveKeyframes, pasteKeyframes, setKeyframeInterpolation } from '../engine/keyframeEditing';
import type { CopiedKeyframe, KeyframeRef } from '../engine/keyframeEditing';
import { addCamera, removeCamera, setCameraCut, setCameraFollow, updateCameraControls, isCameraTarget } from '../engine/camera';
import type { CameraToolMode } from '../engine/camera';
import type { Stage2DSettings } from '../engine/stage2d';
import { addCharacterViewSet, characterViewAngle, isCharacterViewTarget, removeCharacterViewSet, setCharacterViewAngle } from '../engine/characterViews';
import { isFacialTarget } from '../engine/facialAnimation';
import { isConstraintTarget } from '../engine/constraints';
import { dynamicsSignature, invalidateDynamics } from '../engine/dynamics';
import { bakeMotionPath, simplifyMotionPath } from '../engine/motionPath';
import { alignmentOffset, boundsCenter, canvasBounds, objectBounds, unionBounds } from '../engine/alignment';
import type { AlignmentCommand, AlignmentTarget } from '../engine/alignment';
import { removeLayerGroup } from '../engine/layerGroups';
import { DEFAULT_ONION_SKIN_SETTINGS, normalizeOnionSkinSettings } from '../engine/onionSkin';
import type { OnionSkinSettings } from '../engine/onionSkin';

export type Tool = 'select' | 'bone' | 'bind' | 'ik' | 'hand' | 'mesh' | 'weight' | 'camera' | 'path';

interface SmartEditTransaction {
  actionId: string;
  angle: number;
  before: ProjectModel;
  past: ProjectModel[];
  future: ProjectModel[];
  selectedId: string | null;
  selectedIds: string[];
}

export interface ProjectStore {
  rig: Rig;
  tool: Tool;
  selectedId: string | null;
  /** Scene Objects supports a primary selection plus additional objects for alignment. */
  selectedIds: string[];
  zoom: number;
  version: number;
  /** Invalidates pending local file imports on project/session changes. */
  projectGeneration: number;
  /** Serializable undo/redo snapshots, newest item last. */
  past: ProjectModel[];
  future: ProjectModel[];
  historyLimit: number;
  lastSnapshot: ProjectModel;
  meshVertex: number | null;
  meshInfluence: string | null;
  smartEdit: SmartEditTransaction | null;
  /** Editor preference, not an animation channel or persisted pose. */
  autoKey: boolean;
  setAutoKey: (enabled: boolean) => void;
  /** Editor-only onion skin preference; never included in project history or JSON. */
  onionSkin: OnionSkinSettings;
  setOnionSkin: (patch: Partial<OnionSkinSettings>) => void;
  cameraToolMode: CameraToolMode;
  setCameraToolMode: (mode: CameraToolMode) => void;
  cameraGuides: boolean;
  setCameraGuides: (enabled: boolean) => void;
  addCamera: (name?: string) => string | null;
  removeCamera: (id: string) => void;
  setCameraView: (id: string) => void;
  updateCamera: (patch: Partial<Stage2DSettings>, transient?: boolean) => void;
  keyCamera: () => void;
  setCameraCut: (id: string) => void;
  setCameraFollow: (id: string | null) => void;
  selectedCharacterId: string | null;
  selectCharacter: (id: string) => void;
  addCharacter: (name: string, targetIds: string[]) => string | null;
  removeCharacter: (id: string) => void;
  setCharacterAngle: (id: string, angle: number) => void;
  createMotionPath: (points: Array<{ x: number; y: number }>, targetId?: string | null) => string | null;
  removeMotionPath: (id: string) => void;
  followMotionPath: (id: string, options?: Partial<Pick<MotionPath, 'startFrame' | 'endFrame' | 'orientToPath'>>) => boolean;
  keyCharacterAngle: (id: string) => void;
  selectMeshVertex: (index: number | null) => void;
  setMeshInfluence: (id: string | null) => void;
  beginSmartEdit: (actionId: string, angle: number) => boolean;
  captureSmartEdit: (targetIds: string[]) => boolean;
  cancelSmartEdit: () => void;
  finishGesture: (before: ProjectModel) => void;
  cancelGesture: (before: ProjectModel) => void;

  setTool: (tool: Tool) => void;
  select: (id: string | null) => void;
  toggleSelection: (id: string) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  alignSelection: (command: AlignmentCommand, target?: AlignmentTarget) => boolean;
  setZoom: (zoom: number) => void;
  touch: () => void;
  addBone: () => void;
  addBoneUnder: (parentId: string | null) => void;
  addImage: () => void;
  addImageNamed: (name: string) => void;
  addVectorLayer: (name?: string, shapes?: VectorShape[]) => void;
  bind: (layerId: string, boneId: string) => boolean;
  /** Bind only the explicitly supplied artwork and bone. */
  bindSelected: (layerId: string, boneId: string) => boolean;
  unbind: (layerId?: string) => boolean;
  removeSelected: () => void;
  updateProject: (mutator: (rig: Rig) => void) => void;
  addActionLibraryItem: (item: ActionLibraryItem) => string | null;
  removeActionLibraryItem: (id: string) => boolean;
  addControllerDefinition: (definition: ControllerDefinition) => string | null;
  removeControllerDefinition: (id: string) => boolean;
  addControllerInstance: (definitionOrInstance: string | ControllerInstance, options?: Partial<ControllerInstance>) => string | null;
  removeControllerInstance: (id: string) => boolean;
  setControllerInput: (controllerId: string, inputId: string, value: ControllerInputValue) => boolean;
  resetControllerInputs: (controllerId?: string) => void;
  applyController: (controllerId: string, dt?: number) => ControllerEvaluation | null;
  replaceProject: (project: ProjectInput, addToHistory?: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
  setTimeline: (timeline: Partial<TimelineState>) => void;
  setFrame: (frame: number) => void;
  setPlaybackFrame: (frame: number) => void;
  setCurrentTime: (time: number) => void;
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  tick: (deltaSeconds: number) => void;
  addAnimation: (animation?: Partial<AnimationClip>) => string;
  removeAnimation: (animationId: string) => void;
  upsertTrack: (track: AnimationTrack) => void;
  upsertKeyframe: <T extends SerializableValue>(trackId: string, keyframe: Keyframe<T>) => void;
  /** Record local transforms at the rounded current frame in one undo step. */
  keyPose: (ids: string[]) => void;
  removeKeyframe: (trackId: string, frame: number) => void;
  moveSelectedKeys: (selection: KeyframeRef[], delta: number) => KeyframeRef[];
  pasteKeys: (clipboard: CopiedKeyframe[], frame: number) => KeyframeRef[];
  deleteSelectedKeys: (selection: KeyframeRef[]) => void;
  setSelectedKeyInterpolation: (selection: KeyframeRef[], easing: NonNullable<Keyframe['easing']>) => void;
  getProject: () => ProjectModel;
  serialize: (pretty?: boolean) => string;
  deserialize: (json: string, addToHistory?: boolean) => void;
  saveToStorage: (key?: string, storage?: StorageLike) => boolean;
  loadFromStorage: (key?: string, storage?: StorageLike) => boolean;
  clearStoredProject: (key?: string, storage?: StorageLike) => boolean;
}

const sameProject = (left: ProjectModel, right: ProjectModel): boolean => JSON.stringify(left) === JSON.stringify(right);
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function isRigObject(rig: Rig, id: string): boolean {
  return rig.layers.has(id) || rig.bones.has(id) || rig.groups.has(id);
}

function movableAlignmentIds(rig: Rig, ids: string[]): string[] {
  return [...new Set(ids)].filter((id) => {
    const target = rig.layers.get(id) ?? rig.bones.get(id);
    return Boolean(target && !target.locked && !rig.groups.has(id));
  });
}

function snapshot(rig: Rig): ProjectModel {
  return copy(rig.toProject());
}

/** Capture one pose transaction, including mesh and any existing scalar channels. */
function recordPose(rig: Rig, ids: string[], before: ProjectModel): void {
  const targets = [...new Set(ids)].flatMap(id => {
    const target = rig.bones.get(id) ?? rig.layers.get(id);
    return target && !target.locked && Object.values(target.local).every(Number.isFinite) ? [target] : [];
  });
  if (!targets.length || !Number.isFinite(rig.timeline.currentFrame)) return;
  const frame = Math.round(rig.timeline.currentFrame);
  const setupRig = new Rig(before);
  if (before.timeline.activeAnimationId) setupRig.applyAnimation(before.timeline.activeAnimationId, 0);
  let animation = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  if (!animation) {
    animation = { id: createId('animation'), name: `Animation ${rig.animations.length + 1}`, fps: rig.timeline.fps, startFrame: rig.timeline.startFrame, endFrame: rig.timeline.endFrame, tracks: [] };
    rig.animations.push(animation);
    rig.setTimeline({ activeAnimationId: animation.id });
  }
  animation.startFrame = Math.min(animation.startFrame, frame);
  animation.endFrame = Math.max(animation.endFrame, frame);
  const baselineFrame = Math.min(0, animation.startFrame);
  for (const target of targets) {
    const baseline = setupRig.bones.get(target.id) ?? setupRig.layers.get(target.id);
    const baselineLayer = setupRig.layers.get(target.id);
    animation.setupPose ??= {};
    if (!animation.setupPose[target.id] && baseline) {
      animation.setupPose[target.id] = {
        local: { ...baseline.local },
        ...(baselineLayer ? { opacity: baselineLayer.opacity } : {}),
        ...(baselineLayer?.mesh ? { mesh: baselineLayer.mesh.vertices.map(vertex => ({ x: vertex.x, y: vertex.y })) } : {}),
      };
    }
    if (frame === 0) {
      const layer = rig.layers.get(target.id);
      animation.setupPose[target.id] = {
        local: { ...target.local },
        ...(layer ? { opacity: layer.opacity } : {}),
        ...(layer?.mesh ? { mesh: layer.mesh.vertices.map(vertex => ({ x: vertex.x, y: vertex.y })) } : {}),
      };
    }
    const record = (property: string, value: SerializableValue, initial: SerializableValue | undefined) => {
      let track = animation!.tracks.find(item => item.targetId === target.id && item.property === property);
      if (!track) {
        track = { id: createId('track'), targetId: target.id, property, keyframes: [] };
        animation!.tracks.push(track);
      }
      // The first animated edit keeps a frame-zero setup key. Imported channels
      // already containing a baseline are left intact.
      if (!track.keyframes.length && frame > baselineFrame && initial !== undefined) {
        track.keyframes.push({ id: createId('key'), frame: baselineFrame, value: copy(initial), easing: 'smooth' });
      }
      const existing = track.keyframes.find(key => key.frame === frame);
      Object.assign(track, upsertKeyframe(track, { id: existing?.id ?? createId('key'), frame, value: copy(value), easing: existing?.easing ?? 'smooth' }));
    };
    record('transform', { ...target.local }, baseline ? { ...baseline.local } : undefined);
    const layer = rig.layers.get(target.id);
    if (layer?.mesh) record('mesh', layer.mesh.vertices.map(vertex => ({ x: vertex.x, y: vertex.y })), baselineLayer?.mesh?.vertices.map(vertex => ({ x: vertex.x, y: vertex.y })));
    if (layer && (animation.tracks.some(item => item.targetId === target.id && item.property === 'opacity') || layer.opacity !== baselineLayer?.opacity)) {
      record('opacity', layer.opacity, baselineLayer?.opacity);
    }
    // Existing scalar tracks take precedence over transforms during sampling.
    for (const track of [...animation.tracks]) {
      if (track.targetId === target.id && track.property === 'spin') {
        record('spin', target.local.rotation, baseline?.local.rotation);
        continue;
      }
      if (track.targetId !== target.id || !Object.prototype.hasOwnProperty.call(target.local, track.property)) continue;
      const property = track.property as keyof typeof target.local;
      record(property, target.local[property], baseline?.local[property]);
    }
  }
}

function autoKeyPose(rig: Rig, before: ProjectModel): void {
  if (rig.timeline.currentFrame < 0 || rig.timeline.isPlaying || rig.getStageView().enabled) return;
  const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId);
  if (rig.timeline.currentFrame === 0 && !clip) return;
  const ids = [...before.bones, ...before.layers].flatMap(previous => {
    const target = rig.bones.get(previous.id) ?? rig.layers.get(previous.id);
    if (!target || target.locked) return [];
    const poseChanged = JSON.stringify(previous.local) !== JSON.stringify(target.local);
    const layer = rig.layers.get(previous.id);
    const previousLayer = before.layers.find(item => item.id === previous.id);
    const meshChanged = layer?.mesh && previousLayer?.mesh && JSON.stringify(layer.mesh.vertices.map(v => [v.x, v.y])) !== JSON.stringify(previousLayer.mesh.vertices.map(v => [v.x, v.y]));
    const opacityChanged = layer && previousLayer && layer.opacity !== previousLayer.opacity;
    return (poseChanged || meshChanged || opacityChanged)
      && (rig.timeline.currentFrame > 0 || clip?.tracks.some(track => track.targetId === previous.id) || clip?.setupPose?.[previous.id]) ? [previous.id] : [];
  });
  recordPose(rig, ids, before);
}

export const useProject = create<ProjectStore>((set, get) => {
  const initialRig = new Rig(createEmptyProject());
  const initialSnapshot = snapshot(initialRig);

  const commit = (mutator: (rig: Rig) => void, selectedId = get().selectedId, keyEditedPose = false): void => {
    const state = get();
    const before = snapshot(state.rig);
    const oldCache = state.rig.dynamics.cache;
    const dynamicsInputs = dynamicsSignature(state.rig, true);
    mutator(state.rig);
    if (oldCache === state.rig.dynamics.cache && dynamicsInputs !== dynamicsSignature(state.rig, true)) invalidateDynamics(state.rig);
    state.rig.update();
    if (state.smartEdit) {
      set({ version: state.version + 1 });
      return;
    }
    if (state.autoKey && keyEditedPose && before.timeline.activeAnimationId === state.rig.timeline.activeAnimationId
      && JSON.stringify(before.animations) === JSON.stringify(state.rig.animations)) {
      autoKeyPose(state.rig, before);
      state.rig.update();
    }
    const after = snapshot(state.rig);
    if (sameProject(before, after)) {
      set({ version: state.version + 1 });
      return;
    }
    const past = [...state.past, before].slice(-state.historyLimit);
    set({
      past,
      future: [],
      lastSnapshot: after,
      selectedId,
      version: state.version + 1,
    });
  };

  const restore = (project: ProjectModel, past: ProjectModel[], future: ProjectModel[]): void => {
    const rig = new Rig(project);
    const currentSelection = get().selectedId;
    const selectedId = currentSelection && isRigObject(rig, currentSelection)
      ? currentSelection
      : null;
    rig.setTimeline({ isPlaying: false });
    set({ rig, past, future, lastSnapshot: snapshot(rig), selectedId, selectedIds: selectedId ? [selectedId] : [], meshVertex: null, meshInfluence: null, smartEdit: null, projectGeneration: get().projectGeneration + 1, version: get().version + 1 });
  };

  const applyFrame = (frame: number, transient = false): void => {
    const state = get();
    if (state.smartEdit || !Number.isFinite(frame)) return;
    const timeline = state.rig.timeline;
    state.rig.cameraOverride = null;
    state.rig.characterAngleOverrides.clear();
    state.rig.constraintOverrides.clear();
    const nextFrame = Math.min(Math.max(frame, timeline.startFrame), timeline.endFrame);
    state.rig.setTimeline({ currentFrame: nextFrame, currentTime: frameToTime(nextFrame, timeline.fps) });
    if (timeline.activeAnimationId) state.rig.applyAnimation(timeline.activeAnimationId, nextFrame);
    else state.rig.update();
    // Audio can embed megabytes. Never serialize it sixty times a second.
    set({ ...(transient ? {} : { lastSnapshot: snapshot(state.rig) }), version: state.version + 1 });
  };

  const editKeys = (edit: (clip: AnimationClip, rig: Rig) => void, selection: KeyframeRef[] = []): void => {
    const state = get();
    if (state.smartEdit) return;
    const clip = state.rig.animations.find(item => item.id === state.rig.timeline.activeAnimationId);
    if (!clip) return;
    if (state.rig.getStageView().enabled && selection.some(ref => {
      const id = clip.tracks.find(track => track.id === ref.trackId)?.targetId ?? '';
        return !isCameraTarget(state.rig, id) && !isCharacterViewTarget(state.rig, id) && !isFacialTarget(state.rig, id) && !isConstraintTarget(state.rig, id);
    })) return;
    state.pause();
    commit(rig => {
      const original = JSON.stringify(clip);
      const setupRig = new Rig(rig.toProject());
      setupRig.applyAnimation(clip.id, 0);
      edit(clip, rig);
      if (JSON.stringify(clip) !== original) {
        clip.setupPose ??= {};
        // Legacy/demo/imported clips may have only keys and no saved setup pose.
        // Preserve their frame-zero result before retiming or deleting keys.
        for (const track of clip.tracks) {
          if (clip.setupPose[track.targetId]) continue;
          const layer = setupRig.layers.get(track.targetId);
          const target = setupRig.bones.get(track.targetId) ?? layer;
          if (!target) continue;
          clip.setupPose[track.targetId] = {
            local: { ...target.local },
            ...(layer ? { opacity: layer.opacity } : {}),
            ...(layer?.mesh ? { mesh: layer.mesh.vertices.map(vertex => ({ x: vertex.x, y: vertex.y })) } : {}),
          };
        }
      }
      rig.applyAnimation(clip, rig.timeline.currentFrame);
    });
  };

  return {
    rig: initialRig,
    tool: 'select',
    selectedId: null,
    selectedIds: [],
    zoom: 1,
    version: 0,
    projectGeneration: 0,
    past: [],
    future: [],
    historyLimit: 100,
    lastSnapshot: initialSnapshot,
    meshVertex: null,
    meshInfluence: null,
    smartEdit: null,
   autoKey: true,
    setAutoKey: (autoKey) => set({ autoKey }),
    onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
    setOnionSkin: (patch) => set(state => ({ onionSkin: normalizeOnionSkinSettings({ ...state.onionSkin, ...patch }) })),
    cameraToolMode: 'pan',
    setCameraToolMode: (cameraToolMode) => set({ cameraToolMode }),
    cameraGuides: true,
    setCameraGuides: (cameraGuides) => set({ cameraGuides }),
    addCamera: (name) => {
      if (get().smartEdit) return null;
      let id: string | null = null;
      get().pause(); commit(rig => { id = addCamera(rig, name); }); return id;
    },
    removeCamera: (id) => { if (!get().smartEdit) commit(rig => removeCamera(rig, id)); },
    setCameraView: (id) => {
      if (get().smartEdit || !['preview', 'switch', ...get().rig.cameras.map(camera => camera.id)].includes(id)) return;
      get().pause(); commit(rig => { rig.cameraView = id; rig.cameraOverride = null; });
    },
    updateCamera: (patch, transient = false) => {
      const state = get(); if (state.smartEdit) return;
      if (transient) { updateCameraControls(state.rig, patch, state.autoKey); set({ version: state.version + 1 }); }
      else { state.pause(); commit(rig => updateCameraControls(rig, patch, state.autoKey)); }
    },
    keyCamera: () => { if (!get().smartEdit) commit(rig => updateCameraControls(rig, {}, true, true)); },
    setCameraCut: (id) => { if (!get().smartEdit) { get().pause(); commit(rig => setCameraCut(rig, id)); } },
    setCameraFollow: (id) => { if (!get().smartEdit) { get().pause(); commit(rig => setCameraFollow(rig, id)); } },
    selectedCharacterId: null,
    selectCharacter: (id) => { if (isCharacterViewTarget(get().rig, id)) set({ selectedCharacterId: id }); },
    addCharacter: (name, ids) => {
      if (get().smartEdit) return null;
      get().pause(); let id: string | null = null;
      commit(rig => { id = addCharacterViewSet(rig, name, ids); });
      if (id) set({ selectedCharacterId: id }); return id;
    },
    removeCharacter: (id) => { if (!get().smartEdit) { get().pause(); commit(rig => removeCharacterViewSet(rig, id)); } },
     setCharacterAngle: (id, angle) => { if (!get().smartEdit) { get().pause(); commit(rig => setCharacterViewAngle(rig, id, angle, get().autoKey)); } },
     keyCharacterAngle: (id) => { if (!get().smartEdit) { get().pause(); commit(rig => setCharacterViewAngle(rig, id, characterViewAngle(rig, id), true, true)); } },
     createMotionPath: (points, targetId = get().selectedId) => {
       const state = get();
       if (state.smartEdit || !targetId || !(state.rig.layers.has(targetId) || state.rig.bones.has(targetId))) return null;
       const simplified = simplifyMotionPath(points);
       if (simplified.length < 2) return null;
       const id = createId('path');
       commit(rig => { rig.motionPaths.push({ id, name: `Motion path ${rig.motionPaths.length + 1}`, targetId, points: simplified, startFrame: Math.round(rig.timeline.currentFrame), endFrame: Math.max(Math.round(rig.timeline.currentFrame) + 48, Math.min(rig.timeline.endFrame, Math.round(rig.timeline.currentFrame) + 120)), orientToPath: true, enabled: true }); });
       return id;
     },
     removeMotionPath: (id) => { if (!get().smartEdit) commit(rig => { rig.motionPaths = rig.motionPaths.filter(path => path.id !== id); }); },
     followMotionPath: (id, options = {}) => {
       const state = get();
       if (state.smartEdit || state.rig.getStageView().enabled) return false;
       const path = state.rig.motionPaths.find(item => item.id === id);
       if (!path) return false;
       state.pause();
       let applied = false;
       commit(rig => {
         const current = rig.motionPaths.find(item => item.id === id);
         if (!current) return;
         Object.assign(current, options);
         applied = bakeMotionPath(rig, current);
       });
       return applied;
     },
     selectMeshVertex: (meshVertex) => set({ meshVertex }),
    setMeshInfluence: (meshInfluence) => set({ meshInfluence }),
    beginSmartEdit: (actionId, angle) => {
      const state = get();
      if (state.smartEdit) return false;
      state.pause();
      const before = snapshot(state.rig);
      if (!state.rig.beginSmartEdit(actionId, angle)) return false;
       set({ smartEdit: { actionId, angle, before, past: state.past, future: state.future, selectedId: state.selectedId, selectedIds: [...state.selectedIds] }, projectGeneration: state.projectGeneration + 1, version: state.version + 1 });
      return true;
    },
    captureSmartEdit: (targetIds) => {
      const state = get();
      const edit = state.smartEdit;
      if (!edit || !targetIds.length || !state.rig.captureSmartKey(edit.actionId, edit.angle, targetIds)) return false;
      state.rig.endSmartEdit();
      const after = snapshot(state.rig);
      set({ smartEdit: null, past: [...edit.past, edit.before].slice(-state.historyLimit), future: [], lastSnapshot: after, meshVertex: null, version: state.version + 1 });
      return true;
    },
    cancelSmartEdit: () => {
      const edit = get().smartEdit;
      if (!edit) return;
      get().rig.endSmartEdit();
      restore(edit.before, edit.past, edit.future);
       set({ selectedId: edit.selectedId, selectedIds: [...edit.selectedIds] });
    },
     finishGesture: (before) => {
       const state = get();
       invalidateDynamics(state.rig);
       if (!state.smartEdit && state.autoKey) {
         autoKeyPose(state.rig, before);
         state.rig.update();
       }
       const after = snapshot(state.rig);
      if (state.smartEdit || sameProject(before, after)) { set({ version: state.version + 1 }); return; }
      set({ past: [...state.past, copy(before)].slice(-state.historyLimit), future: [], lastSnapshot: after, version: state.version + 1 });
    },
    cancelGesture: (before) => {
      const state = get();
      if (state.smartEdit) {
        // Keep the engine's edit-session baseline alive while cancelling a drag.
        before.bones.forEach(bone => { const target = state.rig.bones.get(bone.id); if (target) target.local = { ...bone.local }; });
        before.layers.forEach(layer => {
          const target = state.rig.layers.get(layer.id);
          if (target) { target.local = { ...layer.local }; target.mesh = layer.mesh ? copy(layer.mesh) : undefined; target.opacity = layer.opacity; }
        });
        state.rig.update();
      } else state.rig.loadProject(before);
      set({ version: state.version + 1 });
    },

    setTool: (tool) => set({ tool, meshVertex: null }),
     select: (selectedId) => set(state => ({ selectedId, selectedIds: selectedId ? [selectedId] : [], meshVertex: state.selectedId === selectedId ? state.meshVertex : null, meshInfluence: state.selectedId === selectedId ? state.meshInfluence : null })),
     toggleSelection: (id) => set(state => {
       if (!isRigObject(state.rig, id)) return state;
       const selected = state.selectedIds.includes(id);
       const selectedIds = selected ? state.selectedIds.filter(item => item !== id) : [...state.selectedIds, id];
       const selectedId = selected
         ? (state.selectedId === id ? selectedIds[selectedIds.length - 1] ?? null : state.selectedId)
         : id;
       return { selectedIds, selectedId, meshVertex: selectedId === state.selectedId ? state.meshVertex : null, meshInfluence: selectedId === state.selectedId ? state.meshInfluence : null };
     }),
     setSelection: (ids) => set(state => {
       const selectedIds = [...new Set(ids)].filter(id => isRigObject(state.rig, id));
       const selectedId = selectedIds[selectedIds.length - 1] ?? null;
       return { selectedIds, selectedId, meshVertex: null, meshInfluence: null };
     }),
     clearSelection: () => set({ selectedId: null, selectedIds: [], meshVertex: null, meshInfluence: null }),
     alignSelection: (command, target = 'selection') => {
       const state = get();
       if (state.smartEdit || state.rig.getStageView().enabled) return false;
       const ids = movableAlignmentIds(state.rig, state.selectedIds.length ? state.selectedIds : state.selectedId ? [state.selectedId] : []);
       if (!ids.length) return false;
       const targetBounds = target === 'canvas'
         ? canvasBounds(state.rig)
         : target === 'primary'
           ? objectBounds(state.rig, state.selectedId ?? ids[ids.length - 1])
           : unionBounds(state.rig, ids);
       if (!targetBounds) return false;
       const before = snapshot(state.rig);
       state.pause();
       let changed = false;
       commit((rig) => {
         const currentBounds = new Map(ids.map(id => [id, objectBounds(rig, id)] as const));
         if (command === 'distribute-x' || command === 'distribute-y') {
           if (ids.length < 3) return;
           const axis = command === 'distribute-x' ? 'x' : 'y';
           const entries = ids.map(id => ({ id, bounds: currentBounds.get(id) })).filter((entry): entry is { id: string; bounds: NonNullable<ReturnType<typeof objectBounds>> } => Boolean(entry.bounds));
           entries.sort((left, right) => axis === 'x' ? left.bounds.minX - right.bounds.minX : left.bounds.minY - right.bounds.minY);
           if (entries.length < 3) return;
           const firstCenter = boundsCenter(entries[0].bounds)[axis];
           const lastCenter = boundsCenter(entries[entries.length - 1].bounds)[axis];
           const step = (lastCenter - firstCenter) / (entries.length - 1);
           entries.slice(1, -1).forEach((entry, index) => {
             const center = boundsCenter(entry.bounds);
             const next = axis === 'x' ? { x: firstCenter + step * (index + 1), y: center.y } : { x: center.x, y: firstCenter + step * (index + 1) };
             const delta = { x: next.x - center.x, y: next.y - center.y };
             const object = rig.layers.get(entry.id) ?? rig.bones.get(entry.id);
             if (object && (Math.abs(delta.x) > .001 || Math.abs(delta.y) > .001) && rig.moveWorld(entry.id, { x: object.world.x + delta.x, y: object.world.y + delta.y })) changed = true;
           });
           return;
         }
         ids.forEach(id => {
           const bounds = currentBounds.get(id);
           const object = rig.layers.get(id) ?? rig.bones.get(id);
           if (!bounds || !object) return;
           const delta = alignmentOffset(command, bounds, targetBounds);
           if (Math.abs(delta.x) <= .001 && Math.abs(delta.y) <= .001) return;
           if (rig.moveWorld(id, { x: object.world.x + delta.x, y: object.world.y + delta.y })) changed = true;
         });
       }, state.selectedId, true);
       // `commit` owns history; a no-op is harmless, but return the actual delta
       // so the panel can provide precise feedback.
       void before;
       return changed;
     },
    setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.1, zoom)) }),
    touch: () => {
      const state = get();
      invalidateDynamics(state.rig);
      if (state.smartEdit) { set({ version: state.version + 1 }); return; }
      if (state.autoKey) {
        autoKeyPose(state.rig, state.lastSnapshot);
        state.rig.update();
      }
      const current = snapshot(state.rig);
      if (sameProject(current, state.lastSnapshot)) {
        set({ version: state.version + 1 });
        return;
      }
      set({
        past: [...state.past, state.lastSnapshot].slice(-state.historyLimit),
        future: [],
        lastSnapshot: current,
        version: state.version + 1,
      });
    },
    updateProject: (mutator) => commit(mutator, get().selectedId, true),
    addActionLibraryItem: (item) => {
      if (get().smartEdit) return null;
      let id: string | null = null;
      commit(rig => { id = rig.addActionLibraryItem(item); });
      return id;
    },
    removeActionLibraryItem: (id) => {
      if (get().smartEdit) return false;
      let removed = false;
      commit(rig => { removed = rig.removeActionLibraryItem(id); });
      return removed;
    },
    addControllerDefinition: (definition) => {
      if (get().smartEdit) return null;
      let id: string | null = null;
      commit(rig => { id = rig.addControllerDefinition(definition); });
      return id;
    },
    removeControllerDefinition: (id) => {
      if (get().smartEdit) return false;
      let removed = false;
      commit(rig => { removed = rig.removeControllerDefinition(id); });
      return removed;
    },
    addControllerInstance: (definitionOrInstance, options) => {
      if (get().smartEdit) return null;
      let id: string | null = null;
      commit(rig => { id = rig.addControllerInstance(definitionOrInstance, options); });
      return id;
    },
    removeControllerInstance: (id) => {
      if (get().smartEdit) return false;
      let removed = false;
      commit(rig => { removed = rig.removeControllerInstance(id); });
      return removed;
    },
    setControllerInput: (controllerId, inputId, value) => {
      const state = get();
      if (state.smartEdit || !state.rig.setControllerInput(controllerId, inputId, value)) return false;
      set({ version: state.version + 1 });
      return true;
    },
    resetControllerInputs: (controllerId) => {
      const state = get();
      state.rig.resetControllerInputs(controllerId);
      set({ version: state.version + 1 });
    },
    applyController: (controllerId, dt = 0) => {
      const state = get();
      if (state.smartEdit) return null;
      const result = state.rig.applyController(controllerId, dt);
      if (result) set({ version: state.version + 1 });
      return result;
    },
    addBoneUnder: (parentId) => {
      const state = get();
      if (state.smartEdit) return;
      let created = '';
      // `null` is an intentional root request. Do not silently attach it to
      // the current selection or the first root.
      commit((rig) => { created = rig.addBone(parentId, `Bone ${rig.bones.size + 1}`); }, created || state.selectedId);
      if (created) set({ selectedId: created });
    },
    addBone: () => {
      const state = get();
      const parent = state.selectedId && state.rig.bones.has(state.selectedId)
        ? state.selectedId
        : state.rig.getRoots()[0]?.id ?? null;
      get().addBoneUnder(parent);
    },
    addImageNamed: (name) => {
      if (get().smartEdit) return;
      let created = '';
      commit((rig) => { created = rig.addImage(name); }, null);
      if (created) set({ selectedId: created });
    },
    addImage: () => { get().addImageNamed(`Image ${get().rig.images.size + 1}`); },
    addVectorLayer: (name, shapes) => {
      if (get().smartEdit) return;
      let created = '';
      commit((rig) => { created = rig.addVectorLayer(name ?? `Vector ${rig.vectors.size + 1}`, shapes); }, null);
      if (created) set({ selectedId: created });
    },
      bind: (layerId, boneId) => {
        if (get().smartEdit || get().rig.layers.get(layerId)?.mesh) return false;
       let didBind = false;
       commit((rig) => { didBind = rig.bind(layerId, boneId); });
       return didBind;
     },
     bindSelected: (layerId, boneId) => get().bind(layerId, boneId),
      unbind: (layerId) => {
        if (get().smartEdit) return false;
       const id = layerId ?? get().selectedId;
       if (!id || !get().rig.layers.has(id)) return false;
       let didUnbind = false;
       commit((rig) => { didUnbind = rig.unbind(id); });
       return didUnbind;
     },
      removeSelected: () => {
        if (get().smartEdit) return;
        const state = get();
        const ids = [...new Set(state.selectedIds.length ? state.selectedIds : state.selectedId ? [state.selectedId] : [])];
        if (!ids.length) return;
        commit((rig) => { ids.forEach(id => { if (rig.groups.has(id)) removeLayerGroup(rig, id, false); else if (rig.layers.has(id) || rig.bones.has(id)) rig.remove(id); }); }, null);
        set({ selectedId: null, selectedIds: [], meshVertex: null });
      },
    replaceProject: (input, addToHistory = true) => {
      const next = new Rig(input);
      get().cancelSmartEdit();
      const state = get();
      const current = snapshot(state.rig);
      const normalized = snapshot(next);
      if (sameProject(current, normalized)) return;
      restore(normalized, addToHistory ? [...state.past, current].slice(-state.historyLimit) : [], []);
    },
    undo: () => {
      const state = get();
      if (state.smartEdit) return;
      const target = state.past[state.past.length - 1];
      if (!target) return;
      const current = snapshot(state.rig);
      restore(target, state.past.slice(0, -1), [current, ...state.future]);
    },
    redo: () => {
      const state = get();
      if (state.smartEdit) return;
      const target = state.future[0];
      if (!target) return;
      const current = snapshot(state.rig);
      restore(target, [...state.past, current].slice(-state.historyLimit), state.future.slice(1));
    },
    canUndo: () => !get().smartEdit && get().past.length > 0,
    canRedo: () => !get().smartEdit && get().future.length > 0,
    clearHistory: () => set({ past: [], future: [], lastSnapshot: snapshot(get().rig) }),

    setTimeline: (timeline) => {
      const state = get();
      if (state.smartEdit) return;
      if (timeline.fps !== undefined && (!Number.isFinite(timeline.fps) || timeline.fps <= 0)) return;
      if ([timeline.startFrame, timeline.endFrame, timeline.currentFrame].some(value => value !== undefined && !Number.isFinite(value))) return;
      const start = timeline.startFrame ?? state.rig.timeline.startFrame;
      const end = timeline.endFrame ?? state.rig.timeline.endFrame;
      if (start < 0 || end < start) return;
      state.rig.setTimeline(timeline);
      const frame = Math.max(start, Math.min(end, state.rig.timeline.currentFrame));
      state.rig.setTimeline({ currentFrame: frame, currentTime: frame / state.rig.timeline.fps });
      const animationId = state.rig.timeline.activeAnimationId;
      if (animationId) state.rig.applyAnimation(animationId, frame);
      state.rig.update();
      set({ lastSnapshot: snapshot(state.rig), version: state.version + 1 });
    },
    setFrame: applyFrame,
    setPlaybackFrame: (frame) => applyFrame(frame, true),
    setCurrentTime: (time) => applyFrame(time * get().rig.timeline.fps),
    play: () => {
      const state = get();
      if (state.smartEdit) return;
      if (state.rig.timeline.currentFrame >= state.rig.timeline.endFrame) applyFrame(state.rig.timeline.startFrame);
      state.rig.setTimeline({ isPlaying: true });
      set({ version: state.version + 1 });
    },
    pause: () => {
      const state = get();
      const wasPlaying = state.rig.timeline.isPlaying;
      state.rig.setTimeline({ isPlaying: false });
      set({ ...(wasPlaying ? { lastSnapshot: snapshot(state.rig) } : {}), version: state.version + 1 });
    },
    togglePlayback: () => {
      const state = get();
      if (state.smartEdit) return;
      if (state.rig.timeline.isPlaying) state.pause(); else state.play();
    },
    tick: (deltaSeconds) => {
      const state = get();
      if (state.smartEdit || !state.rig.timeline.isPlaying) return;
      const next = advanceTimeline(state.rig.timeline, deltaSeconds);
      state.rig.setTimeline(next);
      if (next.activeAnimationId) state.rig.applyAnimation(next.activeAnimationId, next.currentFrame);
      else state.rig.update();
      set({ lastSnapshot: snapshot(state.rig), version: state.version + 1 });
    },
    addAnimation: (animation = {}) => {
      const id = animation.id ?? `animation-${Date.now().toString(36)}`;
      const clip: AnimationClip = {
        id,
        name: animation.name ?? `Animation ${get().rig.animations.length + 1}`,
        fps: animation.fps ?? get().rig.timeline.fps,
        startFrame: animation.startFrame ?? 0,
        endFrame: animation.endFrame ?? 120,
        tracks: animation.tracks ? copy(animation.tracks) : [],
      };
      commit((rig) => { rig.animations.push(clip); rig.setTimeline({ activeAnimationId: id, fps: clip.fps, startFrame: clip.startFrame, endFrame: clip.endFrame }); });
      return id;
    },
    removeAnimation: (animationId) => commit((rig) => {
      rig.animations = rig.animations.filter((animation) => animation.id !== animationId);
      rig.resetControllerInputs();
      if (rig.timeline.activeAnimationId === animationId) rig.setTimeline({ activeAnimationId: rig.animations[0]?.id ?? null });
    }),
    upsertTrack: (track) => commit((rig) => {
      const animationId = rig.timeline.activeAnimationId;
      const animation = rig.animations.find((item) => item.id === animationId);
      if (!animation) return;
      const index = animation.tracks.findIndex((item) => item.id === track.id);
      if (index < 0) animation.tracks.push(copy(track));
      else animation.tracks[index] = copy(track);
    }),
    upsertKeyframe: (trackId, keyframe) => commit((rig) => {
      const animation = rig.animations.find((item) => item.id === rig.timeline.activeAnimationId);
      const track = animation?.tracks.find((item) => item.id === trackId);
      if (!track) return;
      const updated = upsertKeyframe(track as AnimationTrack<typeof keyframe.value>, keyframe);
      Object.assign(track, updated);
    }),
     removeKeyframe: (trackId, frame) => commit((rig) => {
      const animation = rig.animations.find((item) => item.id === rig.timeline.activeAnimationId);
      const track = animation?.tracks.find((item) => item.id === trackId);
       if (track) Object.assign(track, removeKeyframe(track, frame));
     }),
    moveSelectedKeys: (selection, delta) => {
      let nextSelection: KeyframeRef[] = [];
      if (!Number.isFinite(delta) || !selection.length) return nextSelection;
      editKeys((clip, rig) => {
        const result = moveKeyframes(clip, selection, delta);
        Object.assign(clip, result.clip);
        nextSelection = result.selection;
        rig.setTimeline({ startFrame: Math.min(rig.timeline.startFrame, clip.startFrame), endFrame: Math.max(rig.timeline.endFrame, clip.endFrame) });
      }, selection);
      return nextSelection;
    },
    pasteKeys: (clipboard, frame) => {
      let nextSelection: KeyframeRef[] = [];
      if (!Number.isFinite(frame) || !clipboard.length) return nextSelection;
      editKeys((clip, rig) => {
          const entries = clipboard.filter(entry => (rig.bones.has(entry.targetId) || rig.layers.has(entry.targetId) || isCameraTarget(rig, entry.targetId) || isCharacterViewTarget(rig, entry.targetId) || isFacialTarget(rig, entry.targetId) || isConstraintTarget(rig, entry.targetId)) && (!rig.getStageView().enabled || isCameraTarget(rig, entry.targetId) || isCharacterViewTarget(rig, entry.targetId) || isFacialTarget(rig, entry.targetId) || isConstraintTarget(rig, entry.targetId)));
        const result = pasteKeyframes(clip, entries, frame);
        Object.assign(clip, result.clip);
        nextSelection = result.selection;
        rig.setTimeline({ startFrame: Math.min(rig.timeline.startFrame, clip.startFrame), endFrame: Math.max(rig.timeline.endFrame, clip.endFrame) });
      });
      return nextSelection;
    },
    deleteSelectedKeys: (selection) => {
      if (!selection.length) return;
      editKeys(clip => { Object.assign(clip, deleteKeyframes(clip, selection)); }, selection);
    },
    setSelectedKeyInterpolation: (selection, easing) => {
      if (!selection.length) return;
      editKeys((clip, rig) => {
        Object.assign(clip, setKeyframeInterpolation(clip, selection, easing));
        clip.tracks.filter(track => isCameraTarget(rig, track.targetId) && ['camera', 'follow', 'followOffset', 'projection'].includes(track.property))
          .forEach(track => track.keyframes.forEach(key => { key.easing = 'step'; }));
      }, selection);
    },
    keyPose: (ids) => {
      if (get().smartEdit || get().rig.getStageView().enabled) return;
      const before = get().lastSnapshot;
      commit(rig => { recordPose(rig, ids, before); });
    },
    getProject: () => copy(get().smartEdit?.before ?? snapshot(get().rig)),
    serialize: (pretty = true) => serializeProject(get().smartEdit?.before ?? get().rig, pretty),
    deserialize: (json, addToHistory = true) => {
      const project = deserializeProject(json);
      get().replaceProject(project, addToHistory);
    },
    saveToStorage: (key = 'character-studio-project', storage = getDefaultStorage()) => saveProjectToStorage(get().smartEdit?.before ?? snapshot(get().rig), key, storage),
    loadFromStorage: (key = 'character-studio-project', storage = getDefaultStorage()) => {
      const project = loadProjectFromStorage(key, storage);
      if (!project) return false;
      get().replaceProject(project);
      return true;
    },
    clearStoredProject: (key = 'character-studio-project', storage = getDefaultStorage()) => clearProjectFromStorage(key, storage),
  };
});

export type { AnimationClip, AnimationTrack, Keyframe, ProjectInput, ProjectModel, SerializableValue, TimelineState };
