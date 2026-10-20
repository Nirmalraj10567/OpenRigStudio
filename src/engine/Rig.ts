import { applyAnimationToRig } from './rigAnimation';
import { compose, identity, localToWorldPoint, Transform2D, worldToLocalPoint } from './math';
import { affineIdentity, applyMatrix, inverseMatrix, makeMesh, multiplyMatrix, normalizeWeights, segmentDistanceSquared, transformMatrix, validMesh } from './mesh';
import { normalizeSmartActions, normalizeSmartFolders, orderedSmartActions, sampleSmartAction, sampleSmartActionViewAngles, smartDelta, smartKeyThumbnail, transformChannels } from './smartActions';
import { groupMasks } from './masking';
import { isViseme, MAX_LIP_SYNC_TRACKS, normalizeLipSyncCues, sampleViseme, VISEMES, VISEME_LABELS } from './lipSync';
import { createMouthShapes } from './mouthLibrary';
import { evaluateControllerMapping, normalizeActionLibrary, normalizeControllerDefinitions, normalizeControllerInstances, normalizeControllerInputValue, resolveControllerAction } from './controllers';
import { sampleControllerPose } from './controllerPose';
import type { ControllerPose } from './controllerPose';
import { normalizeLayerDepth, normalizeLayerParallax, normalizeStage2DSettings, setStage2D } from './stage2d';
import type { Stage2DSettings } from './stage2d';
import { resolveCameraView, normalizeCameras, isCameraTarget } from './camera';
import { evaluateCharacterViews, normalizeCharacterViews, isCharacterViewTarget } from './characterViews';
import { createFacialProfile, isFacialTarget, normalizeFacialParameters, sampledFacialValues } from './facialAnimation';
import { boneInfluenceWeight, evaluateConstraints, isConstraintTarget, normalizeConstraints } from './constraints';
import { defaultDynamics, evaluateDynamics } from './dynamics';
import { defaultCameraProduction, normalizeCameraProduction } from './cameraProduction';
import { evaluatedLayer3D } from './scene3d';
import { defaultEnvironmentProject, normalizeEnvironmentProject, updateEnvironmentProject } from './environment';
import type { DynamicsSettings, PhysicsFrame } from './model';
import { evaluatedGroupOpacity, evaluatedGroupTransform, evaluatedGroupVisible, groupActiveChild, groupChildrenInOrder, layerGroupChain } from './layerGroups';
import type { ConstraintDebugRecord } from './constraints';
import type { EvaluatedViewTarget } from './characterViews';
import type { CharacterViewSet } from './model';
import { prepareHandTurns, projectHandPoint, unprojectHandPoint, projectWristSeam, handSurfaceShapes } from './handTurn';
import type { HandTurnState } from './handTurn';
import type { CameraDefinition } from './model';
import type { ActionLibraryItem, ControllerDefinition, ControllerEvaluation, ControllerInputValue, ControllerInstance, ControllerRuntimeState } from './model';
import type { AffineMatrix, BoneConstraint, CameraProductionSettings, FacialParameters, FacialProfile, FacialTargetRole, HeadCreatorProfile, LipSyncCue, LipSyncTrack, ProjectAudio, SmartBoneAction, SmartTargetDelta, SmartTargetState, Viseme } from './model';
import type { EnvironmentProjectData, EnvironmentProjectPatch } from './environment';
import {
  AnimationClip,
  Binding,
  BoneData,
  createEmptyProject,
  ImageLayerData,
  LayerGroupData,
  LayerDataUnion,
  ProjectInput,
  ProjectModel,
  MotionPath,
  VectorLayerData,
  VectorShape,
} from './model';

export type Bone = BoneData & { world: Transform2D; childrenIds: string[] };
export type ImageLayer = ImageLayerData & { world: Transform2D };
export type VectorLayer = VectorLayerData & { world: Transform2D };
export type Layer = ImageLayer | VectorLayer;
export type Group = LayerGroupData & { world: Transform2D; childrenIds: string[] };
type RenderLayer = Layer & { renderOrder?: number; groupOpacity?: number; groupVisible?: boolean; groupBlendMode?: LayerGroupData['blendMode']; groupClipIds?: string[]; groupMaskIds?: string[] };

export { createEmptyProject } from './model';
export type {
  AnimationClip,
  AnimationTrack,
  Binding,
  BoneData,
  CanvasSettings,
  ImageLayerData,
  Keyframe,
  LayerDataUnion,
  LayerGroupData,
  ProjectInput,
  ProjectModel,
  TimelineState,
  VectorLayerData,
  VectorShape,
  MeshData,
  MeshVertex,
  SmartBoneAction,
  SmartTargetState,
  SmartTargetDelta,
  FacialParameters,
  FacialProfile,
  FacialTargetRole,
  HeadCreatorProfile,
  BoneConstraint,
  LipSyncCue,
  LipSyncTrack,
  ProjectAudio,
  Viseme,
  ActionLibraryItem,
  ControllerDefinition,
  ControllerInput,
  ControllerBinding,
  ControllerInstance,
  ControllerEvaluation,
  ControllerInputValue,
  ControllerRuntimeState,
} from './model';
export type { Stage2DSettings } from './stage2d';

let sequence = 0;
export const createId = (prefix = 'item'): string => {
  sequence = (sequence + 1) % 1000000;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function layerToRuntime(layer: LayerDataUnion): Layer {
  const common = {
    ...clone(layer),
    local: { ...layer.local },
    world: identity(),
  };
  if (layer.type === 'image') return common as ImageLayer;
  return { ...common, shapes: layer.shapes.map((shape) => ({ ...shape })) } as VectorLayer;
}

function finiteTransform(value: Transform2D | undefined): boolean {
  return Boolean(value) && [value!.x, value!.y, value!.rotation, value!.scaleX, value!.scaleY].every(Number.isFinite);
}

function finitePoint(value: { x: number; y: number }): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function relativeTransform(parent: Transform2D, world: Transform2D): Transform2D | null {
  if (!finiteTransform(parent) || !finiteTransform(world)) return null;
  const position = worldToLocalPoint(parent, world);
  if (!position) return null;
  const scaleX = world.scaleX / parent.scaleX;
  const scaleY = world.scaleY / parent.scaleY;
  if (![position.x, position.y, scaleX, scaleY, world.rotation - parent.rotation].every(Number.isFinite)) return null;
  return {
    x: position.x,
    y: position.y,
    rotation: world.rotation - parent.rotation,
    scaleX,
    scaleY,
  };
}

/** Runtime rig with derived transforms; `toProject` is the persistence boundary. */
export class Rig {
  readonly bones = new Map<string, Bone>();
  readonly layers = new Map<string, Layer>();
  /** Compatibility map used by the existing canvas and UI. */
  readonly images = new Map<string, ImageLayer>();
  readonly vectors = new Map<string, VectorLayer>();
  readonly groups = new Map<string, Group>();
  isolatedGroupId: string | null = null;
  private groupLayerStates = new Map<string, { world: Transform2D; opacity: number; visible: boolean; blendMode: LayerGroupData['blendMode']; clipIds: string[]; maskIds: string[]; order: number }>();
  readonly bindings = new Map<string, Binding>();
  animations: AnimationClip[] = [];
  smartActions: SmartBoneAction[] = [];
  actionLibrary: ActionLibraryItem[] = [];
  controllers: ControllerDefinition[] = [];
  controllerInstances: ControllerInstance[] = [];
  readonly controllerState = new Map<string, ControllerRuntimeState>();
  private controllerPoses = new Map<string, ControllerPose>();
  audio?: ProjectAudio;
  lipSyncTracks: LipSyncTrack[] = [];
  smartEditingActionId: string | null = null;
  private smartEditSnapshot: Record<string, SmartTargetState> | null = null;
  private smartDeltas = new Map<string, SmartTargetDelta>();
  private handTurnLayers = new Map<string, HandTurnState>();
  private handTurnBones = new Map<string, HandTurnState>();
  private handPoseUnprojected = false;
  smartActionFolders: import('./model').SmartActionFolder[] = [];
  smartActionDiagnostics: string[] = [];
  smartSoloActionId: string | null = null;
  readonly smartPreviewAngles = new Map<string, number>();
  smartAngleGuides = true;
  private smartViewAngleIds = new Set<string>();
  canvas = { width: 800, height: 520, background: '#202020' };
  timeline = {
    currentFrame: 0,
    currentTime: 0,
    isPlaying: false,
    loop: true,
    fps: 24,
    startFrame: 0,
    endFrame: 120,
    activeAnimationId: null as string | null,
  };
  id = createId('project');
  name = 'Untitled Character';
  metadata: Record<string, string> = {};
  /** Optional environment-editor data; character-only projects leave this undefined. */
  environment?: EnvironmentProjectData;
  /** Persisted presentation state; artwork/bindings remain in stage-neutral space. */
  stage2d: Stage2DSettings = normalizeStage2DSettings(undefined);
  cameras: CameraDefinition[] = [];
  cameraView = 'preview';
  /** Transient authored camera edits; cleared on seek/playback/project restore. */
  cameraOverride: { id: string; frame: number; settings: Stage2DSettings } | null = null;
  liveCameraId: string | null = null;
  liveCameraPose: { id: string; settings: Stage2DSettings } | null = null;
  stageRenderOverride: Stage2DSettings | null = null;
  characterViews: CharacterViewSet[] = [];
  motionPaths: MotionPath[] = [];
  facialProfiles: FacialProfile[] = [];
  headCreators: HeadCreatorProfile[] = [];
  constraints: BoneConstraint[] = [];
  /** Runtime-only constraint diagnostics used by the canvas and inspector. */
  constraintDebug: ConstraintDebugRecord[] = [];
  constraintDebugVisible = false;
  readonly constraintOverrides = new Map<string, { frame: number; values: import('./model').SerializableValue }>();
  private constraintDeltas = new Map<string, Transform2D>();
  dynamics: DynamicsSettings = defaultDynamics();
  cameraProduction: CameraProductionSettings = defaultCameraProduction();
  physicsFrame: PhysicsFrame | null = null;
  /** Internal sampling rigs suppress simulation while evaluating authored motion. */
  dynamicsSuppressed = false;
  dynamicsDebugVisible = false;
  private updating = false;
  private facialParameters = new Map<string, FacialParameters>();
  private facialDeltas = new Map<string, SmartTargetDelta>();
  readonly characterAngleOverrides = new Map<string, { frame: number; angle: number }>();
  private viewTargets = new Map<string, EvaluatedViewTarget>();

  getStageView(): Stage2DSettings { return this.stageRenderOverride ?? resolveCameraView(this); }

  /** Explicit preview angles only; Smart Bone angles are resampled from animation. */
  getManualViewAngles(): Array<[string, number]> {
    return [...this.characterAngleOverrides.entries()]
      .filter(([id, value]) => value.frame === this.timeline.currentFrame && !this.smartViewAngleIds.has(id))
      .map(([id, value]) => [id, value.angle]);
  }

  constructor(project?: ProjectInput) {
    if (project) this.loadProject(project);
  }

  get layersInOrder(): RenderLayer[] {
    return [...this.layers.keys()].map(id => this.getRenderLayer(id)!).sort((a, b) => (a.renderOrder ?? a.zIndex) - (b.renderOrder ?? b.zIndex));
  }

  /** View artwork, visibility and ordering are derived; authored layers stay intact. */
  getRenderLayer(id: string): RenderLayer | undefined {
    const layer = this.layers.get(id), view = this.viewTargets.get(id)?.target;
    if (!layer) return layer;
    const smart = this.smartDeltas.get(id), facial = this.facialDeltas.get(id);
    const group = this.groupLayerStates.get(id);
    const hand = this.handTurnLayers.get(id);
    const artwork = view?.artwork ?? layer;
    const finger = hand?.hand.fingers.find(f => f.layerId === id);
    const palmOrder = hand ? this.viewTargets.get(hand.hand.palmLayerId)?.target.zIndex ?? this.layers.get(hand.hand.palmLayerId)!.zIndex : 0;
    const root = finger && hand!.bones.get(finger.boneIds[0]);
    const lateral = root && worldToLocalPoint(hand!.wrist, root)?.y || 0;
    const handOrder = finger && hand && (hand.cosine !== 1 || hand.sine !== 0)
      ? palmOrder + (finger.name === 'Thumb' ? .15 * hand.cosine : .12) + lateral * hand.sine * .008 : undefined;
    return { ...layer, ...evaluatedLayer3D(this, layer), ...(view?.artwork ?? {}), ...(smart?.patch ? { patch: smart.patch } : {}), ...(group ? { renderOrder: group.order, groupOpacity: group.opacity, groupVisible: group.visible, groupBlendMode: group.blendMode, groupClipIds: group.clipIds, groupMaskIds: group.maskIds } : {}),
      ...(hand && artwork.type === 'vector' ? { shapes: handSurfaceShapes(hand, artwork.shapes) } : {}),
      visible: layer.visible && view?.visible !== false && smart?.visible !== false && facial?.visible !== false && group?.visible !== false && !this.animations.some(clip => clip.dynamicsBake?.particleLayerId === id && clip.id !== this.timeline.activeAnimationId),
      zIndex: facial?.zIndex ?? smart?.zIndex ?? handOrder ?? view?.zIndex ?? layer.zIndex } as RenderLayer;
  }

  private viewMeshDelta(id: string, index: number) {
    const view = this.viewTargets.get(id);
    const a = view?.baseline.mesh?.[index], b = view?.target.mesh?.[index];
    return a && b ? { x: b.x - a.x, y: b.y - a.y } : { x: 0, y: 0 };
  }

  getRoots(): Bone[] {
    return [...this.bones.values()].filter((bone) => !bone.parentId || bone.parentId === bone.id || !this.bones.has(bone.parentId));
  }

  getChildren(boneId: string): Bone[] {
    const bone = this.bones.get(boneId);
    return bone ? bone.childrenIds.map((id) => this.bones.get(id)).filter((item): item is Bone => Boolean(item)) : [];
  }

  getGroup(groupId: string): Group | undefined { return this.groups.get(groupId); }

  getRenderGroup(groupId: string): Group | undefined {
    const group = this.groups.get(groupId); if (!group) return undefined;
    const delta = this.smartDeltas.get(groupId);
    return { ...group, masks: delta?.masks ?? groupMasks(group), opacity: Math.max(0, Math.min(1, group.opacity + (delta?.opacity ?? 0))),
      visible: delta?.visible ?? group.visible, zIndex: delta?.zIndex ?? group.zIndex };
  }

  getMaskSourceOpacity(layerId: string): number { return this.getLayerOpacity(layerId, false); }

  getGroupClipLayers(layerId: string): RenderLayer[] {
    const state = this.groupLayerStates.get(layerId);
    if (!state) return [];
    return [...state.clipIds, ...state.maskIds].flatMap(id => { const layer = this.getRenderLayer(id); return layer ? [layer] : []; });
  }

  getLayerBlendMode(layerId: string): LayerGroupData['blendMode'] {
    return this.groupLayerStates.get(layerId)?.blendMode ?? 'source-over';
  }

  /** Returns the world-space tip of a bone, or null for an invalid bone. */
  getBoneEnd(boneId: string): { x: number; y: number } | null {
    const hand = this.handTurnBones.get(boneId), handEnd = hand?.ends.get(boneId);
    if (hand && handEnd && !this.handPoseUnprojected) return projectHandPoint(hand, handEnd, hand.hand.turn!.boneDepths[boneId]);
    const bone = this.bones.get(boneId);
    if (!bone || !finiteTransform(bone.world) || !Number.isFinite(bone.length)) return null;
    const end = localToWorldPoint(bone.world, { x: Math.max(0, this.viewTargets.get(boneId)?.target.length ?? bone.length), y: 0 });
    return finitePoint(end) ? end : null;
  }

  addBone(parentId: string | null, name = 'Bone', length = 80): string {
    const parent = parentId ? this.bones.get(parentId) : undefined;
    if (parent) this.update();
    const parentTip = parent ? this.getBoneEnd(parent.id) : null;
    const parentPosition = parent && parentTip ? worldToLocalPoint(parent.world, parentTip) : null;
    const bone: Bone = {
      id: createId('bone'),
      name,
      length: Math.max(0, length),
      // A child origin belongs at its parent's tip, expressed in the
      // parent's local space. The fallback is safe for a singular parent.
      local: {
        ...identity(),
        x: parent ? (parentPosition?.x ?? Math.max(0, parent.length)) : 200,
        y: parent ? (parentPosition?.y ?? 0) : 180,
      },
      world: identity(),
      parentId: parent ? parent.id : null,
      locked: false,
      childrenIds: [],
    };
    this.bones.set(bone.id, bone);
    if (parent) parent.childrenIds.push(bone.id);
    this.update();
    return bone.id;
  }

  addImage(
    name = 'Character',
    options: Partial<Pick<ImageLayer, 'src' | 'width' | 'height' | 'color' | 'local' | 'depth' | 'parallax'>> = {},
  ): string {
    const palette = ['#f97316', '#38bdf8', '#a78bfa', '#facc15'];
    const image: ImageLayer = {
      id: createId('image'),
      name,
      type: 'image',
      kind: 'image',
      local: { ...identity(), x: 220, y: 180, ...(options.local ?? {}) },
      world: identity(),
      visible: true,
      locked: false,
      zIndex: this.layers.size,
      boundBoneId: null,
      opacity: 1,
      depth: normalizeLayerDepth(options.depth),
      parallax: normalizeLayerParallax(options.parallax),
      src: options.src ?? '',
      width: options.width ?? 110,
      height: options.height ?? 140,
      color: options.color ?? palette[this.images.size % palette.length],
    };
    this.layers.set(image.id, image);
    this.images.set(image.id, image);
    this.update();
    return image.id;
  }

  addVectorLayer(name = 'Vector', shapes: VectorShape[] = []): string {
    const vector: VectorLayer = {
      id: createId('vector'),
      name,
      type: 'vector',
      local: { ...identity(), x: 200, y: 180 },
      world: identity(),
      visible: true,
      locked: false,
      zIndex: this.layers.size,
      boundBoneId: null,
      opacity: 1,
      depth: 0,
      parallax: 1,
      shapes: shapes.map((shape) => ({ ...shape })),
    };
    this.layers.set(vector.id, vector);
    this.vectors.set(vector.id, vector);
    this.update();
    return vector.id;
  }

  getLayer(layerId: string): Layer | undefined {
    return this.layers.get(layerId);
  }

  addActionLibraryItem(item: ActionLibraryItem): string | null {
    const normalized = normalizeActionLibrary([item])[0];
    if (!normalized || this.actionLibrary.some(action => action.id === normalized.id)
      || !resolveControllerAction(normalized.id, [normalized], this.animations)) return null;
    this.actionLibrary.push(normalized);
    return normalized.id;
  }

  removeActionLibraryItem(id: string): boolean {
    if (!this.actionLibrary.some(item => item.id === id)) return false;
    this.actionLibrary = this.actionLibrary.filter(item => item.id !== id);
    this.resetControllerInputs();
    return true;
  }

  addControllerDefinition(definition: ControllerDefinition): string | null {
    const normalized = normalizeControllerDefinitions([definition])[0];
    if (!normalized || this.controllers.some(item => item.id === normalized.id)
      || this.controllerInstances.some(item => item.id === normalized.id)) return null;
    this.controllers.push(normalized);
    return normalized.id;
  }

  removeControllerDefinition(id: string): boolean {
    if (!this.controllers.some(item => item.id === id)) return false;
    this.controllerInstances.filter(item => item.definitionId === id).forEach(item => this.controllerState.delete(item.id));
    this.controllerInstances = this.controllerInstances.filter(item => item.definitionId !== id);
    this.controllers = this.controllers.filter(item => item.id !== id);
    this.controllerState.delete(id);
    this.update();
    return true;
  }

  addControllerInstance(definitionOrInstance: string | ControllerInstance, options: Partial<ControllerInstance> = {}): string | null {
    const input = typeof definitionOrInstance === 'string'
      ? { ...options, id: options.id ?? createId('controller-instance'), definitionId: definitionOrInstance, rigId: options.rigId ?? this.id }
      : definitionOrInstance;
    const instance = normalizeControllerInstances([input], new Set(this.controllers.map(item => item.id)), this.id)[0];
    if (!instance || instance.rigId !== this.id || this.controllerInstances.some(item => item.id === instance.id)
      || this.controllers.some(item => item.id === instance.id)) return null;
    this.controllerInstances.push(instance);
    return instance.id;
  }

  removeControllerInstance(id: string): boolean {
    if (!this.controllerInstances.some(item => item.id === id)) return false;
    this.controllerInstances = this.controllerInstances.filter(item => item.id !== id);
    this.controllerState.delete(id);
    this.update();
    return true;
  }

  private controllerDefinition(controllerId: string): ControllerDefinition | undefined {
    const instance = this.controllerInstances.find(item => item.id === controllerId);
    if (instance && instance.rigId !== this.id) return undefined;
    return this.controllers.find(item => item.id === (instance?.definitionId ?? controllerId));
  }

  /** Definition IDs support headless use; instance IDs keep independent inputs. */
  setControllerInput(controllerId: string, inputId: string, value: ControllerInputValue): boolean {
    const input = this.controllerDefinition(controllerId)?.inputs.find(item => item.id === inputId);
    if (!input) return false;
    const state = this.controllerState.get(controllerId) ?? { inputs: {}, applied: false };
    state.inputs[inputId] = normalizeControllerInputValue(input, value);
    this.controllerState.set(controllerId, state);
    return true;
  }

  /** Also discards playback clocks/integrators and returns the authored pose. */
  resetControllerInputs(controllerId?: string): void {
    if (controllerId === undefined) this.controllerState.clear();
    else this.controllerState.delete(controllerId);
    this.update();
  }

  evaluateController(controllerId: string, dt = 0): ControllerEvaluation | null {
    const definition = this.controllerDefinition(controllerId);
    if (!definition || this.smartEditingActionId) return null;
    const state = this.controllerState.get(controllerId) ?? { inputs: {}, applied: false };
    state.evaluation = evaluateControllerMapping(definition, state.inputs, dt, state.evaluation, this.actionLibrary, this.animations, controllerId);
    this.controllerState.set(controllerId, state);
    return clone(state.evaluation);
  }

  getControllerEvaluation(controllerId: string): ControllerEvaluation | null {
    const evaluation = this.controllerState.get(controllerId)?.evaluation;
    return evaluation ? clone(evaluation) : null;
  }

  applyController(controllerId: string, dt = 0): ControllerEvaluation | null {
    const evaluation = this.evaluateController(controllerId, dt);
    if (!evaluation) return null;
    this.controllerState.get(controllerId)!.applied = true;
    this.update();
    return evaluation;
  }

  /** Create independent artwork, attached without moving its world-space origin. */
  createMouthSet(name: string, boneId: string | null = null, position = { x: 400, y: 260 }): string | null {
    if (typeof name !== 'string' || name.length > 512 || !finitePoint(position) || this.smartEditingActionId
      || this.lipSyncTracks.length >= MAX_LIP_SYNC_TRACKS) return null;
    this.update();
    if (boneId !== null) {
      const bone = this.bones.get(boneId);
      if (!bone || !finiteTransform(bone.world) || !inverseMatrix(transformMatrix(bone.world))) return null;
    }
    const track: LipSyncTrack = { id: createId('lipsync'), name: name.trim() || 'Mouth', enabled: true, mapping: {}, cues: [] };
    const created: string[] = [];
    for (const viseme of VISEMES) {
      const id = this.addVectorLayer(`${track.name} · ${viseme} · ${VISEME_LABELS[viseme]}`,
        createMouthShapes(viseme).map(shape => ({ ...shape, id: createId('shape') })));
      created.push(id);
      this.layers.get(id)!.local = { ...identity(), ...position };
      if (boneId && !this.bind(id, boneId)) {
        created.forEach(layerId => this.remove(layerId));
        return null;
      }
      track.mapping[viseme] = id;
    }
    this.lipSyncTracks.push(track);
    this.update();
    return track.id;
  }

  /** Atomic replacement; invalid or overlapping intervals leave the old cues intact. */
  setLipSyncCues(trackId: string, cues: LipSyncCue[]): boolean {
    const track = this.lipSyncTracks.find(item => item.id === trackId);
    if (!track) return false;
    try { track.cues = normalizeLipSyncCues(cues); } catch { return false; }
    return true;
  }

  setVisemeMapping(trackId: string, viseme: Viseme, layerId: string | null): boolean {
    const track = this.lipSyncTracks.find(item => item.id === trackId);
    if (!track || !isViseme(viseme) || (layerId !== null && (!this.layers.has(layerId)
      || this.lipSyncTracks.some(other => other.id !== trackId && Object.values(other.mapping).includes(layerId))))) return false;
    const previous = track.mapping[viseme];
    if (layerId === null) delete track.mapping[viseme];
    else {
      track.mapping[viseme] = layerId;
      // Reattaching a previously detached (hidden) mouth should work immediately.
      this.layers.get(layerId)!.visible = true;
    }
    // Detached drawings are retained, but must not stack over the managed set.
    if (previous && !Object.values(track.mapping).includes(previous)) {
      const layer = this.layers.get(previous);
      if (layer) layer.visible = false;
    }
    return true;
  }

  /** Keep the art and its bindings, showing only the neutral drawing when detached. */
  removeLipSyncTrack(id: string): boolean {
    const track = this.lipSyncTracks.find(item => item.id === id);
    if (!track) return false;
    new Set(Object.values(track.mapping)).forEach(layerId => {
      const layer = this.layers.get(layerId);
      if (layer) layer.visible = layerId === track.mapping.X;
    });
    this.lipSyncTracks = this.lipSyncTracks.filter(item => item.id !== id);
    return true;
  }

  createMesh(layerId: string, columns = 6, rows = 6): boolean {
    const layer = this.layers.get(layerId);
    if (!layer || layer.mesh) return false;
    const mesh = makeMesh(layer, columns, rows);
    if (!mesh) return false;
    layer.mesh = mesh;
    this.update();
    return true;
  }

  removeMesh(layerId: string): boolean {
    const layer = this.layers.get(layerId);
    if (!layer?.mesh) return false;
    delete layer.mesh;
    this.smartActions.forEach(action => {
      if (action.baseline[layerId]) delete action.baseline[layerId].mesh;
      action.keys.forEach(key => { if (key.targets[layerId]) delete key.targets[layerId].mesh; });
    });
    this.animations.forEach(clip => { clip.tracks = clip.tracks.filter(t => t.targetId !== layerId || t.property !== 'mesh'); });
    this.update();
    return true;
  }

  /** Pose-preserving LBS attachment. Rigid bindings are detached exactly once. */
  bindMesh(layerId: string, boneIds: string[]): boolean {
    this.update();
    const layer = this.layers.get(layerId);
    if (!layer || !validMesh(layer.mesh) || !Array.isArray(boneIds) || !boneIds.length) return false;
    const ids = [...new Set(boneIds)];
    const inverses: Record<string, AffineMatrix> = {};
    for (const id of ids) {
      const bone = this.bones.get(id);
      const inverse = bone && inverseMatrix(transformMatrix(bone.world));
      if (!inverse || !this.getBoneEnd(id)) return false;
      inverses[id] = inverse;
    }
    const worldInverse = inverseMatrix(transformMatrix(layer.world));
    if (!worldInverse) return false;
    const positions = this.getMeshVertices(layerId);
    if (positions.length !== layer.mesh.vertices.length) return false;
    const mesh = layer.mesh;
    const world = { ...layer.world };
    // Detaching keeps Smart and view corrections in their authored definitions.
    if (this.bindingForLayer(layerId)) {
      layer.local = this.authoredLocal(layerId, world);
      this.bindings.forEach((b, key) => { if ((b.layerId ?? b.imageId) === layerId || key === layerId) this.bindings.delete(key); });
      layer.boundBoneId = null;
    }
    mesh.bindBoneInverses = inverses;
    mesh.bindLayerMatrix = transformMatrix(world);
    positions.forEach((p, index) => {
      const vertex = mesh.vertices[index];
      const rest = applyMatrix(worldInverse, p);
      const morph = this.smartDeltas.get(layerId)?.mesh?.[index];
      vertex.x = rest.x - (morph?.x ?? 0) - this.viewMeshDelta(layerId, index).x; vertex.y = rest.y - (morph?.y ?? 0) - this.viewMeshDelta(layerId, index).y;
      const nearest = ids.map(id => ({ id, distance: segmentDistanceSquared(p, this.bones.get(id)!.world, this.getBoneEnd(id)!) }))
        .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id)).slice(0, 4);
      vertex.weights = normalizeWeights(Object.fromEntries(nearest.map(({ id, distance }) => [id, boneInfluenceWeight(distance, this.bones.get(id)?.influence)]))) ?? {};
    });
    this.update();
    return true;
  }

  setVertexWeights(layerId: string, index: number, weights: Record<string, number>): boolean {
    this.update();
    const mesh = this.layers.get(layerId)?.mesh;
    const normalized = normalizeWeights(weights);
    if (!validMesh(mesh) || !Number.isInteger(index) || !mesh.vertices[index] || !normalized) return false;
    const inverses = { ...mesh.bindBoneInverses };
    for (const id of Object.keys(normalized)) {
      const bone = this.bones.get(id);
      if (!bone) return false;
      if (!inverses[id]) {
        const inverse = inverseMatrix(transformMatrix(bone.world));
        if (!inverse) return false;
        inverses[id] = inverse;
      }
    }
    // Rigid-to-skin conversion goes through the same pose-preserving boundary.
    const rigidBinding = this.bindingForLayer(layerId);
    if (Object.keys(normalized).length && rigidBinding) {
      if (!this.bindMesh(layerId, [rigidBinding.boneId])) return false;
      Object.assign(inverses, mesh.bindBoneInverses);
    }
    mesh.bindBoneInverses = inverses;
    mesh.vertices[index].weights = normalized;
    this.update();
    return true;
  }

  /** Paint a normalized influence over the evaluated mesh without changing UVs. */
  paintMeshWeights(layerId: string, worldPoint: { x: number; y: number }, boneId: string, radius = 28, strength = .25, erase = false): boolean {
    if (!finitePoint(worldPoint) || !this.bones.has(boneId) || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(strength) || strength <= 0) return false;
    this.update();
    const layer = this.layers.get(layerId);
    if (!layer || layer.locked || !validMesh(layer.mesh)) return false;
    const bone = this.bones.get(boneId)!;
    if (!layer.mesh.bindBoneInverses?.[boneId]) {
      const inverse = inverseMatrix(transformMatrix(bone.world));
      if (!inverse) return false;
      layer.mesh.bindBoneInverses ??= {};
      layer.mesh.bindBoneInverses[boneId] = inverse;
    }
    const points = this.getMeshVertices(layerId);
    let changed = false;
    points.forEach((point, index) => {
      const distance = Math.hypot(point.x - worldPoint.x, point.y - worldPoint.y);
      if (distance > radius) return;
      const falloff = Math.pow(1 - distance / radius, 2);
      const amount = Math.max(0, Math.min(1, strength * falloff));
      const vertex = layer.mesh!.vertices[index];
      const current = normalizeWeights(vertex.weights) ?? {};
      const previous = current[boneId] ?? 0;
      const target = erase ? previous * (1 - amount) : previous + (1 - previous) * amount;
      const next = { ...current };
      if (target > 1e-6) next[boneId] = target;
      else delete next[boneId];
      const normalized = normalizeWeights(next) ?? {};
      if (JSON.stringify(normalized) !== JSON.stringify(current)) {
        vertex.weights = normalized;
        changed = true;
      }
    });
    if (changed) this.update();
    return changed;
  }

  private vertexMatrix(layer: Layer, index: number): AffineMatrix {
    const mesh = layer.mesh!;
    const weights = normalizeWeights(mesh.vertices[index].weights) ?? {};
    const entries = Object.entries(weights);
    let blend = affineIdentity();
    if (entries.length) {
      blend = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };
      entries.forEach(([id, weight]) => {
        const bone = this.bones.get(id), inverse = mesh.bindBoneInverses?.[id];
        const world = this.handTurnBones.get(id)?.bones.get(id) ?? bone?.world;
        const matrix = world && inverse ? multiplyMatrix(transformMatrix(world), inverse) : affineIdentity();
        (Object.keys(blend) as Array<keyof AffineMatrix>).forEach(c => { blend[c] += matrix[c] * weight; });
      });
    }
    return multiplyMatrix(blend, transformMatrix(layer.world));
  }

  getMeshVertices(layerId: string, refresh = true): Array<{ x: number; y: number }> {
    if (refresh) this.update();
    const simulated = this.physicsFrame?.meshes[layerId];
    if (simulated) return simulated.map(point => ({ ...point }));
    const layer = this.layers.get(layerId);
    if (!layer || !validMesh(layer.mesh)) return [];
    const baked = this.animations.find(clip => clip.id === this.timeline.activeAnimationId)?.dynamicsBake?.meshIds.includes(layerId);
    const morph = baked ? undefined : this.smartDeltas.get(layerId)?.mesh;
    const controllerMesh = baked ? undefined : this.controllerPoses.get(layerId)?.mesh;
    const positions = layer.mesh.vertices.map((v, i) => applyMatrix(this.vertexMatrix(layer, i), {
      x: (controllerMesh?.[i]?.x ?? v.x) + (morph?.[i]?.x ?? 0) + (baked ? 0 : this.viewMeshDelta(layerId, i).x), y: (controllerMesh?.[i]?.y ?? v.y) + (morph?.[i]?.y ?? 0) + (baked ? 0 : this.viewMeshDelta(layerId, i).y),
    }));
    const hand = this.handTurnLayers.get(layerId);
    const projected = hand ? positions.map((point, i) => layerId === hand.hand.turn!.forearmLayerId ? projectWristSeam(hand, point) : projectHandPoint(hand, point, hand.hand.turn!.vertexDepths[layerId][i])) : positions;
    return projected.every(finitePoint) ? projected : [];
  }

  /** Inverse skin mapping used to turn simulated world points into mesh keys. */
  meshPointToLocal(layerId: string, index: number, point: { x: number; y: number }): { x: number; y: number } | null {
    const layer = this.layers.get(layerId);
    if (!layer?.mesh?.vertices[index]) return null;
    const hand = this.handTurnLayers.get(layerId);
    if (hand) {
      const raw = layerId === hand.hand.turn!.forearmLayerId ? projectWristSeam(hand, point, true) : unprojectHandPoint(hand, point, hand.hand.turn!.vertexDepths[layerId][index]);
      if (!raw) return null;
      point = raw;
    }
    const inverse = inverseMatrix(this.vertexMatrix(layer, index));
    return inverse ? applyMatrix(inverse, point) : null;
  }

  setMeshVertex(layerId: string, index: number, worldPoint: { x: number; y: number }): boolean {
    if (!finitePoint(worldPoint) || !Number.isInteger(index)) return false;
    this.update();
    const layer = this.layers.get(layerId);
    if (!layer || !validMesh(layer.mesh) || !layer.mesh.vertices[index]) return false;
    const local = this.meshPointToLocal(layerId, index, worldPoint), morph = this.smartDeltas.get(layerId)?.mesh?.[index];
    if (!local) return false;
    if (!finitePoint(local)) return false;
    layer.mesh.vertices[index].x = local.x - (morph?.x ?? 0) - this.viewMeshDelta(layerId, index).x;
    layer.mesh.vertices[index].y = local.y - (morph?.y ?? 0) - this.viewMeshDelta(layerId, index).y;
    this.update();
    return true;
  }

  private targetState(id: string): SmartTargetState | null {
    const target = this.bones.get(id) ?? this.layers.get(id) ?? this.groups.get(id);
    if (!target || !finiteTransform(target.local)) return null;
    const layer = this.layers.get(id);
    const group = this.groups.get(id);
    return { local: { ...target.local }, ...(layer ? { opacity: layer.opacity, visible: layer.visible, zIndex: layer.zIndex, ...(layer.patch ? { patch: clone(layer.patch) } : {}) } : {}),
      ...(group ? { opacity: group.opacity, visible: group.visible, zIndex: group.zIndex, masks: clone(groupMasks(group)) } : {}),
      ...(layer && validMesh(layer.mesh) ? { mesh: layer.mesh.vertices.map(v => ({ x: v.x, y: v.y })) } : {}) };
  }

  private targetStates(): Record<string, SmartTargetState> {
    const states: Record<string, SmartTargetState> = {};
    [...this.bones.keys(), ...this.layers.keys(), ...this.groups.keys()].forEach(id => {
      const state = this.targetState(id);
      if (state) states[id] = state;
    });
    return states;
  }

  private restoreTarget(id: string, state: SmartTargetState, delta: SmartTargetDelta = {}): void {
    const target = this.bones.get(id) ?? this.layers.get(id) ?? this.groups.get(id);
    if (!target) return;
    target.local = { ...state.local };
    transformChannels.forEach(c => { target.local[c] += delta.transform?.[c] ?? 0; });
    const layer = this.layers.get(id);
    const group = this.groups.get(id);
    if (group) {
      group.opacity = (state.opacity ?? group.opacity) + (delta.opacity ?? 0); group.visible = delta.visible ?? state.visible ?? group.visible;
      group.zIndex = delta.zIndex ?? state.zIndex ?? group.zIndex; group.masks = clone(delta.masks ?? state.masks ?? groupMasks(group));
    }
    if (!layer) return;
    if (delta.patch ?? state.patch) layer.patch = clone((delta.patch ?? state.patch)!);
    if (state.opacity !== undefined) layer.opacity = state.opacity + (delta.opacity ?? 0);
    if (state.visible !== undefined) layer.visible = delta.visible ?? state.visible;
    if (state.zIndex !== undefined) layer.zIndex = delta.zIndex ?? state.zIndex;
    if (state.mesh && validMesh(layer.mesh) && state.mesh.length === layer.mesh.vertices.length) {
      layer.mesh.vertices.forEach((v, i) => {
        v.x = state.mesh![i].x + (delta.mesh?.[i]?.x ?? 0);
        v.y = state.mesh![i].y + (delta.mesh?.[i]?.y ?? 0);
      });
    }
  }

  createSmartAction(name: string, driverBoneId: string, startAngle: number, endAngle: number): string | null {
    if (!this.bones.has(driverBoneId) || ![startAngle, endAngle].every(Number.isFinite) || startAngle === endAngle
      || this.smartEditingActionId) return null;
    const baseline = this.targetStates();
    delete baseline[driverBoneId];
    const id = createId('smart');
    this.smartActions.push({ id, name: name.trim() || 'Smart action', driverBoneId, startAngle, endAngle, enabled: true,
      baseline, keys: [{ angle: startAngle, targets: {} }] });
    this.update();
    return id;
  }

  captureSmartKey(actionId: string, angle: number, targetIds: string[]): boolean {
    const action = this.smartActions.find(a => a.id === actionId);
    if (!action || !Number.isFinite(angle) || !Array.isArray(targetIds) || !targetIds.length
      || targetIds.includes(action.driverBoneId) || (this.smartEditingActionId && this.smartEditingActionId !== actionId)
      || angle < Math.min(action.startAngle, action.endAngle) || angle > Math.max(action.startAngle, action.endAngle)) return false;
    const targets: Record<string, SmartTargetDelta> = { ...action.keys.find(k => k.angle === angle)?.targets };
    for (const id of new Set(targetIds)) {
      const state = this.targetState(id), baseline = action.baseline[id];
      if (!state || !baseline) return false;
      // Meshes can be created after the action; their undeformed UV positions
      // are the neutral reference until the first mesh key is captured.
      if (state.mesh && !baseline.mesh) {
        const mesh = this.layers.get(id)!.mesh!;
        baseline.mesh = mesh.vertices.map(v => ({ x: mesh.bounds.x + v.u * mesh.bounds.width, y: mesh.bounds.y + v.v * mesh.bounds.height }));
      }
      targets[id] = smartDelta(baseline, state);
    }
    const existing = action.keys.find(key => key.angle === angle);
    action.keys = [...action.keys.filter(k => k.angle !== angle), { ...existing, angle, targets, thumbnail: existing?.thumbnail ?? smartKeyThumbnail(angle) }].sort((a, b) => a.angle - b.angle);
    this.update();
    return true;
  }

  removeSmartAction(id: string): boolean {
    if (!this.smartActions.some(a => a.id === id)) return false;
    if (this.smartEditingActionId === id) this.endSmartEdit();
    this.smartActions = this.smartActions.filter(a => a.id !== id);
    this.smartActions.forEach(action => { action.dependencies = action.dependencies?.filter(dependency => dependency !== id); });
    this.smartPreviewAngles.delete(id); if (this.smartSoloActionId === id) this.smartSoloActionId = null;
    this.update();
    return true;
  }

  beginSmartEdit(actionId: string, angle: number): boolean {
    const action = this.smartActions.find(a => a.id === actionId);
    const driver = action && this.bones.get(action.driverBoneId);
    if (!action || !driver || this.smartEditingActionId || !Number.isFinite(angle)
      || angle < Math.min(action.startAngle, action.endAngle) || angle > Math.max(action.startAngle, action.endAngle)) return false;
    this.smartEditSnapshot = this.targetStates();
    this.smartEditingActionId = actionId;
    const sampled = sampleSmartAction(action, angle);
    Object.entries(action.baseline).forEach(([id, state]) => this.restoreTarget(id, state, sampled[id]));
    driver.local.rotation = angle;
    this.update();
    return true;
  }

  endSmartEdit(): void {
    if (!this.smartEditingActionId) return;
    Object.entries(this.smartEditSnapshot ?? {}).forEach(([id, state]) => this.restoreTarget(id, state));
    this.smartEditSnapshot = null;
    this.smartEditingActionId = null;
    this.update();
  }

  getLayerOpacity(layerId: string, includeGroups = true): number {
    const layer = this.layers.get(layerId);
    if (!layer) return 0;
    const pose = this.controllerPoses.get(layerId);
    const view = this.viewTargets.get(layerId);
    const opacity = (pose?.opacity ?? layer.opacity) + (pose?.opacityOffset ?? 0) + (this.smartDeltas.get(layerId)?.opacity ?? 0) + (this.facialDeltas.get(layerId)?.opacity ?? 0) + (view ? (view.target.opacity ?? 1) - (view.baseline.opacity ?? 1) : 0);
    const authored = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) * (includeGroups ? this.groupLayerStates.get(layerId)?.opacity ?? 1 : 1) : 1;
    if (this.smartEditingActionId) return authored;
    for (const track of this.lipSyncTracks) {
      if (!Object.values(track.mapping).includes(layerId)) continue;
      // Muting lip animation leaves a neutral mouth, not nine stacked drawings.
      const viseme = track.enabled ? sampleViseme(track.cues, this.timeline.currentFrame / this.timeline.fps) : 'X';
      // An unmapped symbol falls back to rest; one layer may serve several symbols.
      const active = track.mapping[viseme] ?? track.mapping.X;
      if (active !== layerId) return 0;
    }
    return authored;
  }

  private controllerLocal(id: string, local: Transform2D): Transform2D {
    const pose = this.controllerPoses.get(id);
    const effective = { ...local, ...pose?.transform };
    if (pose) transformChannels.forEach(c => { effective[c] += pose.offset[c] ?? 0; });
    return finiteTransform(effective) ? effective : { ...local };
  }

  private preConstraintLocal(id: string, local: Transform2D): Transform2D {
    const effective = this.controllerLocal(id, local);
    const delta = this.smartDeltas.get(id)?.transform;
    if (delta) transformChannels.forEach(c => { effective[c] += delta[c] ?? 0; });
    const facial = this.facialDeltas.get(id)?.transform;
    if (facial) transformChannels.forEach(c => { effective[c] += facial[c] ?? 0; });
    const view = this.viewTargets.get(id);
    if (view) {
      for (const c of ['x', 'y', 'rotation'] as const) effective[c] += view.target.local[c] - view.baseline.local[c];
      for (const c of ['scaleX', 'scaleY'] as const) effective[c] = view.baseline.local[c] ? effective[c] * view.target.local[c] / view.baseline.local[c] : effective[c] + view.target.local[c];
    }
    return finiteTransform(effective) ? effective : { ...local };
  }

  private effectiveLocal(id: string, local: Transform2D): Transform2D {
    const baked = this.animations.find(clip => clip.id === this.timeline.activeAnimationId)?.dynamicsBake;
    if (baked?.targetIds.includes(id)) return { ...local };
    const effective = this.preConstraintLocal(id, local);
    const constraint = this.constraintDeltas.get(id);
    if (constraint) transformChannels.forEach(c => { effective[c] += constraint[c] ?? 0; });
    effective.rotation += this.physicsFrame?.bones[id] ?? 0;
    effective.x += this.physicsFrame?.boneOffsets?.[id]?.x ?? 0;
    effective.y += this.physicsFrame?.boneOffsets?.[id]?.y ?? 0;
    return finiteTransform(effective) ? effective : { ...local };
  }

  /** Base evaluated local pose before runtime bone constraints are applied. */
  getConstraintBaseLocal(id: string): Transform2D {
    const target = this.bones.get(id) ?? this.layers.get(id);
    return target ? this.preConstraintLocal(id, target.local) : identity();
  }

  getConstraintBoneLength(id: string): number {
    return Math.max(0, this.viewTargets.get(id)?.target.length ?? this.bones.get(id)?.length ?? 0);
  }

  /** Current evaluated local pose, including the transient constraint result. */
  getConstraintLocal(id: string): Transform2D {
    const target = this.bones.get(id) ?? this.layers.get(id);
    return target ? this.effectiveLocal(id, target.local) : identity();
  }

  /** Convert a world-space body pose back through its evaluated attachment. */
  physicsWorldToLocal(id: string, world: Transform2D): Transform2D | null {
    const groupTarget = this.groups.get(id);
    if (groupTarget) return relativeTransform(groupTarget.parentGroupId ? this.groups.get(groupTarget.parentGroupId)?.world ?? identity() : identity(), world);
    const bone = this.bones.get(id);
    if (bone) return relativeTransform(bone.parentId ? this.bones.get(bone.parentId)?.world ?? identity() : identity(), world);
    const layer = this.layers.get(id);
    if (!layer) return null;
    const binding = this.bindingForLayer(id), parentBone = binding ? this.bones.get(binding.boneId) : undefined;
    const skinned = validMesh(layer.mesh) && Object.keys(layer.mesh.bindBoneInverses ?? {}).length > 0;
    const group = this.groupLayerStates.get(id)?.world ?? identity();
    const attachment = parentBone && !skinned ? compose(group, compose(parentBone.world, binding!.bindOffset)) : group;
    return relativeTransform(attachment, world);
  }

  applyPhysicsFrame(frame: PhysicsFrame | null): void {
    this.physicsFrame = frame;
    this.resolveWorldTransforms();
  }

  /** Convert a desired evaluated local pose back into authored channels. */
  private authoredLocal(id: string, effective: Transform2D): Transform2D {
    const authored = { ...effective };
    const view = this.viewTargets.get(id);
    if (view) {
      for (const c of ['x', 'y', 'rotation'] as const) authored[c] -= view.target.local[c] - view.baseline.local[c];
      for (const c of ['scaleX', 'scaleY'] as const) if (view.target.local[c]) authored[c] = view.baseline.local[c] ? authored[c] * view.baseline.local[c] / view.target.local[c] : authored[c] - view.target.local[c];
    }
    const delta = this.smartDeltas.get(id)?.transform;
    if (delta) transformChannels.forEach(c => { authored[c] -= delta[c] ?? 0; });
    const facial = this.facialDeltas.get(id)?.transform;
    if (facial) transformChannels.forEach(c => { authored[c] -= facial[c] ?? 0; });
    return authored;
  }

  createFacialProfile(name = 'Face profile', targets?: Partial<Record<FacialTargetRole, string>>): string | null {
    return createFacialProfile(this, name, targets);
  }

  setFacialParameters(profileId: string, values: Partial<FacialParameters>): void {
    this.facialParameters.set(profileId, normalizeFacialParameters({ ...(this.facialParameters.get(profileId) ?? {}), ...values }));
  }

  setFacialLive(profileId: string, values: Partial<FacialParameters>): void { this.setFacialParameters(profileId, values); this.update(); }
  clearFacialLive(profileId?: string): void { if (profileId) this.facialParameters.delete(profileId); else this.facialParameters.clear(); this.update(); }

  setSmartPreview(actionId: string, angle: number | null): boolean {
    const action = this.smartActions.find(item => item.id === actionId); if (!action) return false;
    if (angle === null) this.smartPreviewAngles.delete(actionId);
    else this.smartPreviewAngles.set(actionId, Number.isFinite(angle) ? angle : action.neutralAngle ?? action.startAngle);
    this.update(); return true;
  }

  resetSmartAction(actionId: string): boolean {
    const action = this.smartActions.find(item => item.id === actionId), driver = action && this.bones.get(action.driverBoneId);
    if (!action || !driver || this.smartEditingActionId) return false;
    this.smartPreviewAngles.delete(actionId); driver.local.rotation = action.neutralAngle ?? action.startAngle; this.update(); return true;
  }

  setSmartSolo(actionId: string | null): boolean {
    if (actionId && !this.smartActions.some(action => action.id === actionId)) return false;
    this.smartSoloActionId = actionId; this.update(); return true;
  }

  private evaluateFacial(): void {
    this.facialDeltas.clear();
    this.facialProfiles.filter(profile => profile.enabled).forEach(profile => {
      const p = this.facialParameters.has(profile.id)
        ? normalizeFacialParameters(this.facialParameters.get(profile.id))
        : sampledFacialValues(this, profile);
      const put = (id: string | undefined, transform: Partial<Transform2D>) => { if (!id) return; const current = this.facialDeltas.get(id) ?? {}; current.transform = { ...(current.transform ?? {}), ...Object.fromEntries(Object.entries(transform).map(([key, value]) => [key, (current.transform?.[key as keyof Transform2D] ?? 0) + value])) as Partial<Transform2D> }; this.facialDeltas.set(id, current); };
      const target = (role: FacialTargetRole) => profile.targets[role];
      const base = (role: FacialTargetRole) => { const id = target(role); return id ? profile.baseline[id] : undefined; };
      const scaleDelta = (role: FacialTargetRole, scaleX: number, scaleY: number) => { const state = base(role); if (state) put(target(role), { scaleX: state.local.scaleX * scaleX - state.local.scaleX, scaleY: state.local.scaleY * scaleY - state.local.scaleY }); };
      const leftEye = target('leftEye'), rightEye = target('rightEye');
      [leftEye, rightEye].forEach(id => { if (id) put(id, { x: p.eyeX * 18, y: p.eyeY * 14 }); });
      scaleDelta('leftEye', 1, Math.max(.05, 1 - p.blinkLeft * .95)); scaleDelta('rightEye', 1, Math.max(.05, 1 - p.blinkRight * .95));
      put(target('leftBrow'), { y: -p.browLeft * 18, rotation: -p.browLeft * .12 }); put(target('rightBrow'), { y: -p.browRight * 18, rotation: p.browRight * .12 });
      put(target('head'), { x: p.headYaw * .35, y: p.headPitch * .35, rotation: p.headRoll * Math.PI / 180 });
      put(target('jaw'), { y: p.mouthOpen * 12, rotation: p.mouthOpen * .08 });
      put(target('mouth'), { y: p.mouthOpen * 8 - p.smile * 4, scaleY: p.mouthOpen * .35, rotation: p.smile * -.05 });
    });
  }

  private evaluateSmartActions(): void {
    this.smartDeltas.clear();
    this.smartViewAngleIds.forEach(id => this.characterAngleOverrides.delete(id));
    this.smartViewAngleIds.clear();
    if (this.smartEditingActionId) return;
    // Drivers read controller-evaluated local rotations, even if another action
    // targets that bone. This removes order dependence and dependency cycles.
    const ordered = orderedSmartActions(this.smartActions);
    this.smartActionDiagnostics = ordered.diagnostics;
    ordered.actions.forEach(action => {
      const driver = this.bones.get(action.driverBoneId);
      if (!action.enabled || !driver || this.smartSoloActionId && action.id !== this.smartSoloActionId && !this.smartActions.find(item => item.id === this.smartSoloActionId)?.dependencies?.includes(action.id)) return;
      const weight = action.weight ?? 1; if (weight <= 0) return;
      let driverAngle = this.smartPreviewAngles.get(action.id) ?? this.controllerLocal(driver.id, driver.local).rotation;
      if (action.limitDriver) driverAngle = Math.max(Math.min(action.startAngle, action.endAngle), Math.min(Math.max(action.startAngle, action.endAngle), driverAngle));
      Object.entries(sampleSmartActionViewAngles(action, driverAngle)).forEach(([id, angle]) => {
        if (this.characterViews.some(set => set.id === id)) {
          const previous = this.characterAngleOverrides.get(id)?.angle ?? this.characterViews.find(set => set.id === id)?.angle ?? 0;
          this.characterAngleOverrides.set(id, { frame: this.timeline.currentFrame, angle: previous + (angle - previous) * weight });
          this.smartViewAngleIds.add(id);
        }
      });
      Object.entries(sampleSmartAction(action, driverAngle)).forEach(([id, delta]) => {
        if (!this.bones.has(id) && !this.layers.has(id) && !this.groups.has(id)) return;
        const sum = this.smartDeltas.get(id) ?? {};
        const mix = (previous: number, next: number) => action.blendMode === 'override' ? previous + (next - previous) * weight : previous + next * weight;
        if (delta.transform) {
          sum.transform ??= {};
          transformChannels.forEach(c => { sum.transform![c] = mix(sum.transform![c] ?? 0, delta.transform![c] ?? 0); });
        }
        if (delta.opacity !== undefined) sum.opacity = mix(sum.opacity ?? 0, delta.opacity);
        if (delta.mesh) {
          const count = this.layers.get(id)?.mesh?.vertices.length;
          if (count === delta.mesh.length) {
            sum.mesh ??= Array.from({ length: count }, () => ({ x: 0, y: 0 }));
            delta.mesh.forEach((p, i) => { sum.mesh![i].x = mix(sum.mesh![i].x, p.x); sum.mesh![i].y = mix(sum.mesh![i].y, p.y); });
          }
        }
        if (weight >= .5) {
          if (delta.visible !== undefined) sum.visible = delta.visible;
          if (delta.zIndex !== undefined) sum.zIndex = delta.zIndex;
          if (delta.masks) sum.masks = clone(delta.masks);
          if (delta.patch) sum.patch = clone(delta.patch);
        }
        this.smartDeltas.set(id, sum);
      });
    });
  }

  remove(id: string): void {
    if (this.smartEditingActionId) this.endSmartEdit();
    const meshPositions = new Map<string, Array<{ x: number; y: number }>>();
    if (this.bones.has(id)) this.layers.forEach(layer => {
      if (validMesh(layer.mesh)) meshPositions.set(layer.id, this.getMeshVertices(layer.id));
    });
    if (this.bones.has(id)) {
      this.update();
      const doomed = new Set<string>();
      const removeBone = (boneId: string) => {
        if (doomed.has(boneId)) return;
        const bone = this.bones.get(boneId);
        if (!bone) return;
        doomed.add(boneId);
        [...bone.childrenIds].forEach(removeBone);
      };
      const bone = this.bones.get(id)!;
      removeBone(id);

      // Preserve the rendered pose when a bound bone (or a removed ancestor)
      // disappears. This intentionally handles both image and vector layers.
      const boundWorld = new Map<string, Transform2D>();
      this.layers.forEach((layer) => {
        const binding = this.bindingForLayer(layer.id);
        if (binding && doomed.has(binding.boneId)) boundWorld.set(layer.id, { ...layer.world });
      });
      this.bindings.forEach((binding, bindingId) => {
        if (doomed.has(binding.boneId)) this.bindings.delete(bindingId);
      });
      doomed.forEach((boneId) => this.bones.delete(boneId));
      this.evaluateSmartActions();
      boundWorld.forEach((world, layerId) => {
        const layer = this.layers.get(layerId);
        if (!layer) return;
        layer.boundBoneId = null;
        layer.local = this.authoredLocal(layerId, world);
      });
    }
    const layer = this.layers.get(id);
    if (layer) {
      this.layers.delete(id);
      this.images.delete(id);
      this.vectors.delete(id);
      this.bindings.delete(id);
      this.bindings.forEach((binding, bindingId) => {
        if (binding.layerId === id || binding.imageId === id) this.bindings.delete(bindingId);
      });
      this.groups.forEach(group => {
        group.childIds = group.childIds.filter(child => child !== id);
        if (group.maskLayerId === id) delete group.maskLayerId;
        if (group.clipLayerId === id) delete group.clipLayerId;
        group.masks = group.masks?.filter(mask => mask.layerId !== id);
      });
    }
    if (this.groups.has(id)) {
      this.groups.forEach(group => { group.childIds = group.childIds.filter(child => child !== id); if (group.parentGroupId === id) group.parentGroupId = null; });
      this.groups.delete(id);
      this.animations.forEach(clip => { clip.tracks = clip.tracks.filter(track => track.targetId !== id); });
      if (this.isolatedGroupId === id) this.isolatedGroupId = null;
    }
    this.smartActions = this.smartActions.filter(a => this.bones.has(a.driverBoneId));
    this.lipSyncTracks.forEach(track => {
      VISEMES.forEach(viseme => {
        const layerId = track.mapping[viseme];
        if (layerId && !this.layers.has(layerId)) delete track.mapping[viseme];
      });
    });
    this.smartActions.forEach(action => {
      Object.keys(action.baseline).forEach(targetId => {
        if (!this.bones.has(targetId) && !this.layers.has(targetId)) delete action.baseline[targetId];
      });
      action.keys.forEach(key => Object.keys(key.targets).forEach(targetId => {
        if (!action.baseline[targetId]) delete key.targets[targetId];
      }));
    });
    this.characterViews = normalizeCharacterViews(this.characterViews, new Set([...this.bones.keys(), ...this.layers.keys()]));
    const removedConstraints = new Set(this.constraints.filter(c => !this.bones.has(c.sourceBoneId)).map(c => c.id));
    this.constraints = this.constraints.filter(c => !removedConstraints.has(c.id));
    this.constraints.forEach(c => { if (c.targetBoneId && !this.bones.has(c.targetBoneId)) { delete c.targetBoneId; c.enabled = false; this.constraintOverrides.delete(c.id); } });
    this.animations.forEach(clip => { clip.tracks = clip.tracks.filter(t => this.bones.has(t.targetId) || this.layers.has(t.targetId) || isCameraTarget(this, t.targetId) || isCharacterViewTarget(this, t.targetId) || isFacialTarget(this, t.targetId) || isConstraintTarget(this, t.targetId)); });
    const changedMeshes: string[] = [];
    this.layers.forEach(layer => {
      if (!validMesh(layer.mesh)) return;
      const mesh = layer.mesh;
      const missing = [...new Set([
        ...Object.keys(mesh.bindBoneInverses ?? {}), ...mesh.vertices.flatMap(v => Object.keys(v.weights)),
      ])].filter(boneId => !this.bones.has(boneId));
      if (!missing.length) return;
      changedMeshes.push(layer.id);
      missing.forEach(boneId => { if (mesh.bindBoneInverses) delete mesh.bindBoneInverses[boneId]; });
      mesh.vertices.forEach(v => {
        missing.forEach(boneId => { delete v.weights[boneId]; });
        v.weights = normalizeWeights(v.weights) ?? {};
      });
    });
    this.update();
    changedMeshes.forEach(layerId => meshPositions.get(layerId)?.forEach((p, index) => this.setMeshVertex(layerId, index, p)));
  }

  bind(layerId: string, boneId: string, bindOffset: Transform2D = identity()): boolean {
    if (!this.layers.has(layerId) || !this.bones.has(boneId)) return false;
    if (this.bones.get(boneId)?.locked) return false;
    if (validMesh(this.layers.get(layerId)?.mesh)) return this.bindMesh(layerId, [boneId]);
    this.update();
    const layer = this.layers.get(layerId);
    const bone = this.bones.get(boneId);
    if (!layer || !bone || !finiteTransform(layer.local) || !finiteTransform(layer.world) || !finiteTransform(bone.world)) return false;
    const local = this.effectiveLocal(layerId, layer.local);

    // `local` remains untouched so existing animation tracks keep their
    // meaning. The offset instead absorbs the current relative pose, making
    // bind and rebind visually lossless even when the caller passes identity.
    const relativeOrigin = worldToLocalPoint(bone.world, layer.world);
    if (!relativeOrigin) return false;
    const offsetRotation = layer.world.rotation - bone.world.rotation - local.rotation;
    const offsetScaleX = bone.world.scaleX === 0 || local.scaleX === 0
      ? 1
      : layer.world.scaleX / (bone.world.scaleX * local.scaleX);
    const offsetScaleY = bone.world.scaleY === 0 || local.scaleY === 0
      ? 1
      : layer.world.scaleY / (bone.world.scaleY * local.scaleY);
    if (![offsetRotation, offsetScaleX, offsetScaleY].every(Number.isFinite)) return false;
    // Calculate against the same combined TRS representation used by
    // `compose`, rather than subtracting an uncomposed child vector. This is
    // important when the bone is rotated and non-uniformly scaled.
    const attachmentBasis = compose(bone.world, {
      x: 0,
      y: 0,
      rotation: offsetRotation,
      scaleX: offsetScaleX,
      scaleY: offsetScaleY,
    });
    const layerContribution = localToWorldPoint({
      x: 0,
      y: 0,
      rotation: attachmentBasis.rotation,
      scaleX: attachmentBasis.scaleX,
      scaleY: attachmentBasis.scaleY,
    }, local);
    const desiredAttachmentOrigin = {
      x: layer.world.x - layerContribution.x,
      y: layer.world.y - layerContribution.y,
    };
    const offsetOrigin = worldToLocalPoint(bone.world, desiredAttachmentOrigin);
    if (!offsetOrigin) return false;
    const resolvedOffset: Transform2D = {
      x: offsetOrigin.x,
      y: offsetOrigin.y,
      rotation: offsetRotation,
      scaleX: offsetScaleX,
      scaleY: offsetScaleY,
    };
    if (!finiteTransform(resolvedOffset)) return false;

    // Keep the parameter in the public API for compatibility. A bind is a
    // pose-preserving operation, so its resolved offset takes precedence over
    // an identity/default hint (and over stale offsets from an old binding).
    void bindOffset;
    const binding: Binding = {
      id: this.bindingForLayer(layerId)?.id ?? createId('binding'),
      layerId,
      imageId: layerId,
      boneId,
      bindOffset: resolvedOffset,
    };
    this.bindings.set(layerId, binding);
    layer.boundBoneId = boneId;
    this.update();
    return true;
  }

  unbind(layerId: string): boolean {
    this.update();
    const layer = this.layers.get(layerId);
    if (layer && validMesh(layer.mesh) && Object.keys(layer.mesh.bindBoneInverses ?? {}).length) {
      const positions = this.getMeshVertices(layerId);
      const inverse = inverseMatrix(transformMatrix(layer.world));
      if (!inverse || positions.length !== layer.mesh.vertices.length) return false;
      layer.mesh.vertices.forEach((v, i) => {
        const p = applyMatrix(inverse, positions[i]), morph = this.smartDeltas.get(layerId)?.mesh?.[i];
        v.x = p.x - (morph?.x ?? 0) - this.viewMeshDelta(layerId, i).x; v.y = p.y - (morph?.y ?? 0) - this.viewMeshDelta(layerId, i).y; v.weights = {};
      });
      delete layer.mesh.bindBoneInverses;
      delete layer.mesh.bindLayerMatrix;
      this.update();
      return true;
    }
    const binding = this.bindingForLayer(layerId);
    const didUnbind = Boolean(binding);
    if (layer && binding) {
      // Once detached, the layer's local transform becomes its world pose.
      // This is also what makes a later rebind start from the visible pose.
      layer.local = this.authoredLocal(layerId, layer.world);
    }
    this.bindings.forEach((item, key) => {
      if (item.layerId === layerId || item.imageId === layerId || key === layerId) this.bindings.delete(key);
    });
    if (layer) layer.boundBoneId = null;
    this.update();
    return didUnbind;
  }

  reparentBone(boneId: string, parentId: string | null, preserveWorld = true): boolean {
    const bone = this.bones.get(boneId);
    if (!bone || parentId === boneId || (parentId && !this.bones.has(parentId))) return false;
    let cursor = parentId ? this.bones.get(parentId) : undefined;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor.id === boneId) return false;
      if (seen.has(cursor.id)) return false;
      seen.add(cursor.id);
      cursor = cursor.parentId ? this.bones.get(cursor.parentId) : undefined;
    }
    this.update();
    const world = { ...bone.world };
    const newParent = parentId ? this.bones.get(parentId) : undefined;
    const nextLocal = preserveWorld
      ? (newParent ? relativeTransform(newParent.world, world) : world)
      : null;
    if (preserveWorld && !nextLocal) return false;
    if (bone.parentId) {
      const oldParent = this.bones.get(bone.parentId);
      if (oldParent) oldParent.childrenIds = oldParent.childrenIds.filter((id) => id !== boneId);
    }
    bone.parentId = parentId;
    if (newParent && !newParent.childrenIds.includes(boneId)) newParent.childrenIds.push(boneId);
    if (nextLocal) bone.local = this.authoredLocal(boneId, nextLocal);
    this.update();
    return true;
  }

  /** Moves a bone or layer origin in world space without changing its other TRS channels. */
  moveWorld(id: string, position: { x: number; y: number }): boolean {
    if (!finitePoint(position)) return false;
    this.update();
    const hand = this.handTurnBones.get(id);
    if (hand && !this.handPoseUnprojected && (hand.cosine !== 1 || hand.sine !== 0)) {
      const raw = unprojectHandPoint(hand, position, hand.hand.turn!.boneDepths[id]);
      return raw ? this.editUnprojectedHand(() => this.moveWorld(id, raw)) : false;
    }
    const bone = this.bones.get(id);
    if (bone) {
      const parent = bone.parentId && bone.parentId !== bone.id ? this.bones.get(bone.parentId) : undefined;
      const ancestors = new Set<string>([bone.id]);
      let cursor = parent;
      while (cursor) {
        if (ancestors.has(cursor.id)) return false;
        ancestors.add(cursor.id);
        cursor = cursor.parentId && cursor.parentId !== cursor.id ? this.bones.get(cursor.parentId) : undefined;
      }
      const localPosition = parent ? worldToLocalPoint(parent.world, position) : position;
      if (!localPosition || !finitePoint(localPosition)) return false;
      const view = this.viewTargets.get(id);
      bone.local.x = localPosition.x - (this.smartDeltas.get(id)?.transform?.x ?? 0) - (view ? view.target.local.x - view.baseline.local.x : 0);
      bone.local.y = localPosition.y - (this.smartDeltas.get(id)?.transform?.y ?? 0) - (view ? view.target.local.y - view.baseline.local.y : 0);
      this.update();
      return true;
    }

    const layer = this.layers.get(id);
    if (!layer) return false;
    const binding = this.bindingForLayer(id);
    const boneForLayer = binding ? this.bones.get(binding.boneId) : undefined;
    const attachment = boneForLayer ? compose(boneForLayer.world, binding!.bindOffset) : null;
    const localPosition = attachment ? worldToLocalPoint(attachment, position) : position;
    if (!localPosition || !finitePoint(localPosition)) return false;
    const view = this.viewTargets.get(id);
    layer.local.x = localPosition.x - (this.smartDeltas.get(id)?.transform?.x ?? 0) - (view ? view.target.local.x - view.baseline.local.x : 0);
    layer.local.y = localPosition.y - (this.smartDeltas.get(id)?.transform?.y ?? 0) - (view ? view.target.local.y - view.baseline.local.y : 0);
    this.update();
    return true;
  }

  /**
   * Effector-first IK/keying chain. The limit counts the selected joint (even
   * when locked); a locked ancestor is excluded and stops traversal. Omit the
   * limit for the full chain. Invalid limits/IDs or cycles return an empty list.
   */
  getPoseBoneIds(boneId: string, chainLength?: number): string[] {
    if (chainLength !== undefined && (!Number.isFinite(chainLength) || chainLength < 1)) return [];
    const limit = chainLength === undefined ? Infinity : Math.floor(chainLength);
    const ids: string[] = [];
    const seen = new Set<string>();
    let current = this.bones.get(boneId);
    while (current && ids.length < limit) {
      if (seen.has(current.id)) return [];
      if (ids.length > 0 && current.locked) break;
      seen.add(current.id);
      ids.push(current.id);
      current = current.parentId ? this.bones.get(current.parentId) : undefined;
    }
    return ids;
  }

  /** Aim the visible tip at a world pointer, preserving the joint origin/TRS. */
  rotateBoneTo(boneId: string, target: { x: number; y: number }): boolean {
    const bone = this.bones.get(boneId);
    if (!bone || bone.locked || !finitePoint(target)) return false;
    this.update();
    const hand = this.handTurnBones.get(boneId);
    if (hand && !this.handPoseUnprojected && (hand.cosine !== 1 || hand.sine !== 0)) {
      const raw = unprojectHandPoint(hand, target, hand.hand.turn!.boneDepths[boneId]);
      return raw ? this.editUnprojectedHand(() => this.rotateBoneTo(boneId, raw)) : this.solveEdgeHandPose(boneId, target, [boneId]);
    }
    const end = this.getBoneEnd(boneId);
    if (!end || !finiteTransform(bone.local)) return false;
    const dx = target.x - bone.world.x;
    const dy = target.y - bone.world.y;
    if (Math.hypot(dx, dy) < 1e-10 || Math.hypot(end.x - bone.world.x, end.y - bone.world.y) < 1e-10) return false;
    // Measuring the actual tip direction handles reflected (negative) scales.
    const delta = Math.atan2(dy, dx) - Math.atan2(end.y - bone.world.y, end.x - bone.world.x);
    const rotation = bone.local.rotation + Math.atan2(Math.sin(delta), Math.cos(delta));
    if (!Number.isFinite(rotation)) return false;
    bone.local.rotation = rotation;
    this.update();
    return true;
  }

  /**
   * Rotation-only IK, bounded by joint count and locked ancestors. Solves pairs
   * using their measured world vectors, then sweeps toward the root. Unlike a
   * bone-length formula this also supports off-axis child origins, reflected
   * scales, and a locked effector's rigid extension. Only local rotations change;
   * unreachable targets retain the best finite pose found, never a worse pose.
   */
  solveIK(boneId: string, target: { x: number; y: number }, chainLength?: number): boolean {
    if (!finitePoint(target)) return false;
    const ids = this.getPoseBoneIds(boneId, chainLength);
    if (!ids.length) return false;
    this.update();
    const hand = this.handTurnBones.get(boneId);
    if (hand && !this.handPoseUnprojected && (hand.cosine !== 1 || hand.sine !== 0)) {
      const raw = unprojectHandPoint(hand, target, hand.hand.turn!.boneDepths[boneId]);
      // Only a digit-local chain has a fixed projection frame. Longer chains
      // move the wrist itself and are solved against their visible endpoints.
      return raw && ids.every(id => hand.bones.has(id))
        ? this.editUnprojectedHand(() => this.solveIK(boneId, raw, chainLength))
        : this.solveEdgeHandPose(boneId, target, ids);
    }
    const chain = ids.map((id) => this.bones.get(id)!);
    if (chain.some((joint) => !finiteTransform(joint.local) || !finiteTransform(joint.world))) return false;
    const movable = chain.filter((joint) => !joint.locked);
    const initialEnd = this.getBoneEnd(boneId);
    if (!initialEnd || !Number.isFinite(Math.hypot(target.x - initialEnd.x, target.y - initialEnd.y))) return false;

    const tolerance = 1e-4;
    const angleDelta = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
    let bestError = Infinity;
    let bestRotations = chain.map(joint => joint.local.rotation);
    const keepBest = () => {
      const end = this.getBoneEnd(boneId);
      const error = end ? Math.hypot(target.x - end.x, target.y - end.y) : Infinity;
      if (error < bestError && chain.every((joint) => finiteTransform(joint.world) && finiteTransform(joint.local))) {
        bestError = error;
        bestRotations = chain.map(joint => joint.local.rotation);
      }
    };
    const restoreBest = () => {
      chain.forEach((joint, index) => { joint.local.rotation = bestRotations[index]; });
      this.update();
    };
    const aim = (joint: Bone) => {
      const end = this.getBoneEnd(boneId);
      if (!end) return;
      const ex = end.x - joint.world.x;
      const ey = end.y - joint.world.y;
      const tx = target.x - joint.world.x;
      const ty = target.y - joint.world.y;
      if (Math.hypot(ex, ey) < 1e-10 || Math.hypot(tx, ty) < 1e-10) return;
      joint.local.rotation += angleDelta(Math.atan2(ty, tx) - Math.atan2(ey, ex));
      this.update();
      keepBest();
    };
    const solvePair = (distal: Bone, proximal: Bone) => {
      const end = this.getBoneEnd(boneId);
      if (!end) return;
      const ax = distal.world.x - proximal.world.x;
      const ay = distal.world.y - proximal.world.y;
      const bx = end.x - distal.world.x;
      const by = end.y - distal.world.y;
      const l1 = Math.hypot(ax, ay);
      const l2 = Math.hypot(bx, by);
      if (!Number.isFinite(l1 + l2)) return;
      if (l1 < 1e-10) { aim(distal); return; }
      if (l2 < 1e-10) { aim(proximal); return; }
      const tx = target.x - proximal.world.x;
      const ty = target.y - proximal.world.y;
      const distance = Math.hypot(tx, ty);
      if (!Number.isFinite(distance)) return;
      const a = Math.atan2(ay, ax);
      const b = Math.atan2(by, bx);
      // Project onto the reachable annulus, including its inner boundary.
      const radius = Math.min(l1 + l2, Math.max(Math.abs(l1 - l2), distance));
      const direction = distance > 1e-10 ? Math.atan2(ty, tx) : a;
      let desiredA = a;
      let desiredB = a + Math.PI;
      if (radius > 1e-10) {
        // Normalize lengths before squaring to avoid overflow for large rigs.
        const scale = Math.max(radius, l1, l2);
        const r = radius / scale;
        const u = l1 / scale;
        const v = l2 / scale;
        const bend = Math.acos(Math.min(1, Math.max(-1, (r * r + u * u - v * v) / (2 * r * u))));
        const plus = direction + bend;
        const minus = direction - bend;
        desiredA = Math.abs(angleDelta(plus - a)) <= Math.abs(angleDelta(minus - a)) ? plus : minus;
        desiredB = Math.atan2(radius * Math.sin(direction) - l1 * Math.sin(desiredA), radius * Math.cos(direction) - l1 * Math.cos(desiredA));
      }
      const proximalDelta = angleDelta(desiredA - a);
      const distalDelta = angleDelta(desiredB - b - proximalDelta);
      if (![proximalDelta, distalDelta].every(Number.isFinite)) return;
      proximal.local.rotation += proximalDelta;
      distal.local.rotation += distalDelta;
      this.update();
      keepBest();
    };
    keepBest();
    if (movable.length === 1) aim(movable[0]);
    for (let iteration = 0; movable.length > 1 && iteration < 128 && bestError > tolerance; iteration += 1) {
      const previousError = bestError;
      for (let index = 0; index < movable.length - 1 && bestError > tolerance; index += 1) {
        solvePair(movable[index], movable[index + 1]);
      }
      if (movable.length === 2 || previousError - bestError < 1e-10) break;
    }
    restoreBest();
    return true;
  }

  private editUnprojectedHand(edit: () => boolean): boolean {
    this.handPoseUnprojected = true;
    try { this.update(); return edit(); }
    finally { this.handPoseUnprojected = false; this.update(); }
  }

  /** Coordinate descent stays well-defined at a side-on projection singularity. */
  private solveEdgeHandPose(boneId: string, target: { x: number; y: number }, ids: string[]): boolean {
    const movable = ids.map(id => this.bones.get(id)!).filter(bone => !bone.locked);
    if (!movable.length) return false;
    const error = () => { const end = this.getBoneEnd(boneId)!; return (end.x - target.x) ** 2 + (end.y - target.y) ** 2; };
    let best = error();
    for (let pass = 0; pass < 12 && best > 1e-8; pass++) {
      const before = best;
      for (const bone of movable) {
        let rotation = bone.local.rotation;
        for (let step = Math.PI / 3; step > .0001; step *= .5) {
          for (const sign of [-1, 1]) {
            bone.local.rotation = rotation + step * sign; this.update();
            const next = error();
            if (Number.isFinite(next) && next < best) { best = next; rotation = bone.local.rotation; }
          }
          bone.local.rotation = rotation; this.update();
        }
      }
      if (before - best < 1e-10) break;
    }
    return true;
  }

  private bindingForLayer(layerId: string): Binding | undefined {
    return this.bindings.get(layerId)
      ?? [...this.bindings.values()].find((binding) => binding.layerId === layerId || binding.imageId === layerId);
  }

  private resolveGroupTransforms(): void {
    const groups = [...this.groups.values()];
    groups.forEach(group => { group.childrenIds = []; });
    groups.forEach(group => {
      const parent = group.parentGroupId ? this.groups.get(group.parentGroupId) : undefined;
      if (parent && !parent.childrenIds.includes(group.id)) parent.childrenIds.push(group.id);
    });
    this.layers.forEach(layer => {
      const parent = layer.parentGroupId ? this.groups.get(layer.parentGroupId) : undefined;
      if (parent && !parent.childrenIds.includes(layer.id)) parent.childrenIds.push(layer.id);
    });
    const visiting = new Set<string>(), done = new Set<string>();
    const visit = (group: Group) => {
      if (done.has(group.id)) return;
      if (visiting.has(group.id)) { group.parentGroupId = null; group.world = evaluatedGroupTransform(this, group); done.add(group.id); return; }
      visiting.add(group.id);
      const parent = group.parentGroupId ? this.groups.get(group.parentGroupId) : undefined;
      if (parent) visit(parent);
      const local = this.effectiveLocal(group.id, evaluatedGroupTransform(this, group));
      group.world = parent && done.has(parent.id) ? compose(parent.world, local) : local;
      visiting.delete(group.id); done.add(group.id);
    };
    groups.forEach(visit);

    const chainFor = (layerId: string) => layerGroupChain(this, layerId);
    const belongsTo = (layerId: string, itemId: string) => layerId === itemId || chainFor(layerId).some(group => group.id === itemId);
    const allowedBySwitch = (layerId: string, chain: LayerGroupData[]) => chain.every(group => {
      if (group.mode !== 'switch') return true;
      const active = groupActiveChild(this, group);
      return !active || belongsTo(layerId, active);
    });
    const isolated = (layerId: string) => !this.isolatedGroupId || belongsTo(layerId, this.isolatedGroupId);
    const stateFor = (layerId: string) => {
      const chain = chainFor(layerId);
      const visible = isolated(layerId) && allowedBySwitch(layerId, chain) && chain.every(group => this.getRenderGroup(group.id)!.visible);
      const opacity = chain.reduce((value, group) => value * this.getRenderGroup(group.id)!.opacity, 1);
      const blendMode = [...chain].reverse().find(group => group.blendMode !== 'source-over')?.blendMode ?? 'source-over';
      const clipIds = chain.flatMap(group => group.clipLayerId && this.layers.has(group.clipLayerId) ? [group.clipLayerId] : []);
      const maskIds = chain.flatMap(group => group.maskLayerId && this.layers.has(group.maskLayerId) ? [group.maskLayerId] : []);
      return { world: chain.length ? this.groups.get(chain[chain.length - 1].id)?.world ?? identity() : identity(), opacity, visible, blendMode, clipIds, maskIds, order: 0 };
    };
    this.groupLayerStates.clear();
    this.layers.forEach(layer => this.groupLayerStates.set(layer.id, stateFor(layer.id)));
    const guideIds = new Set(groups.flatMap(group => groupMasks(this.getRenderGroup(group.id)!).filter(mask => mask.enabled && mask.hideSource).map(mask => mask.layerId)));
    guideIds.forEach(id => { const state = this.groupLayerStates.get(id); if (state) state.visible = false; });
    const renderOrder: string[] = [];
    // Prepared turns can move the near arm in front of the torso. Resolve that
    // order before assigning group renderOrder, which takes precedence at draw.
    const rootItems = [...this.layers.values()].filter(layer => !layer.parentGroupId).map(item => ({ id: item.id, zIndex: this.getRenderLayer(item.id)!.zIndex })).concat(groups.filter(group => !group.parentGroupId).map(group => ({ id: group.id, zIndex: this.getRenderGroup(group.id)!.zIndex })));
    const emit = (itemId: string) => {
      const group = this.groups.get(itemId);
      if (!group) { if (this.layers.has(itemId)) renderOrder.push(itemId); return; }
      const children = group.mode === 'switch' && groupActiveChild(this, group) ? [groupActiveChild(this, group)!] : groupChildrenInOrder(this, group);
      children.forEach(emit);
    };
    rootItems.sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id)).forEach(item => emit(item.id));
    renderOrder.forEach((id, index) => { const state = this.groupLayerStates.get(id); if (state) state.order = index; });
  }

  private resolveWorldTransforms(): void {
    this.handTurnLayers.clear(); this.handTurnBones.clear();
    // `parentId` is authoritative. Rebuilding the denormalized child lists
    // also drops stale IDs before any traversal can follow them.
    this.bones.forEach((bone) => { bone.childrenIds = []; });
    this.bones.forEach((bone) => {
      if (!bone.parentId || bone.parentId === bone.id) return;
      const parent = this.bones.get(bone.parentId);
      if (parent && !parent.childrenIds.includes(bone.id)) parent.childrenIds.push(bone.id);
    });

    // Resolve through parentId with a recursion guard. A malformed cycle is
    // treated as a local root for the cycle edge instead of recursing forever.
    const states = new Map<string, 'visiting' | 'done'>();
    const visit = (bone: Bone): void => {
      const state = states.get(bone.id);
      if (state === 'done') return;
      if (state === 'visiting') {
        bone.world = this.effectiveLocal(bone.id, bone.local);
        return;
      }
      states.set(bone.id, 'visiting');
      const parent = bone.parentId && bone.parentId !== bone.id ? this.bones.get(bone.parentId) : undefined;
      if (parent && states.get(parent.id) !== 'visiting') visit(parent);
      const local = this.effectiveLocal(bone.id, bone.local);
      bone.world = parent && states.get(parent.id) === 'done' ? compose(parent.world, local) : local;
      const body = this.dynamics.bodies.find(item => item.enabled && item.motion === 'dynamic' && item.targetId === bone.id);
      const pose = body && this.physicsFrame?.bodies[body.id];
      if (pose && body) {
        const rotation = pose.rotation - body.rotation;
        const offset = localToWorldPoint({ ...bone.world, x: 0, y: 0, rotation }, body);
        bone.world = { ...bone.world, x: pose.x - offset.x, y: pose.y - offset.y, rotation };
      }
      states.set(bone.id, 'done');
    };
    this.bones.forEach((bone) => visit(bone));
    const handTurns = prepareHandTurns(this);
    for (const hand of handTurns) {
      [hand.hand.turn!.forearmLayerId, hand.hand.palmLayerId, ...hand.hand.fingers.map(f => f.layerId)].forEach(id => this.handTurnLayers.set(id, hand));
      hand.bones.forEach((_, id) => this.handTurnBones.set(id, hand));
    }

    // Remove bindings that can no longer resolve, then derive every layer's
    // world transform from its current binding and unchanged local transform.
    this.bindings.forEach((binding, key) => {
      const layerId = binding.layerId ?? binding.imageId;
      if (!layerId || !this.layers.has(layerId) || !this.bones.has(binding.boneId)) this.bindings.delete(key);
    });
    this.resolveGroupTransforms();
    this.layers.forEach((layer) => {
      const binding = this.bindingForLayer(layer.id);
      const skinned = validMesh(layer.mesh) && Object.keys(layer.mesh.bindBoneInverses ?? {}).length > 0;
      const bone = binding && !skinned ? this.bones.get(binding.boneId) : undefined;
      if (binding && bone) layer.boundBoneId = bone.id;
      else layer.boundBoneId = null;
      const local = this.effectiveLocal(layer.id, layer.local);
      const authoredWorld = bone
        ? compose(compose(bone.world, binding?.bindOffset ?? identity()), local)
        : local;
      const groupState = this.groupLayerStates.get(layer.id);
      layer.world = groupState ? compose(groupState.world, authoredWorld) : authoredWorld;
      const body = this.dynamics.bodies.find(item => item.enabled && item.motion === 'dynamic' && item.targetId === layer.id);
      const pose = body && this.physicsFrame?.bodies[body.id];
      if (pose && body) {
        const rotation = pose.rotation - body.rotation;
        const offset = localToWorldPoint({ ...layer.world, x: 0, y: 0, rotation }, body);
        layer.world = { ...layer.world, x: pose.x - offset.x, y: pose.y - offset.y, rotation };
      }
    });
    // Keep raw worlds for skinning. Project only editor joint locations/tips;
    // authored locals, bind matrices, and upstream arm transforms never change.
    for (const hand of handTurns) for (const [id, world] of hand.bones) {
      if (this.handPoseUnprojected || hand.cosine === 1 && hand.sine === 0) continue;
      const point = projectHandPoint(hand, world, hand.hand.turn!.boneDepths[id]);
      const end = projectHandPoint(hand, hand.ends.get(id)!, hand.hand.turn!.boneDepths[id]);
      this.bones.get(id)!.world = { ...world, ...point, rotation: Math.atan2(end.y - point.y, end.x - point.x), scaleX: Math.hypot(end.x - point.x, end.y - point.y) / Math.max(1e-8, this.getConstraintBoneLength(id)) };
    }
  }

  update(): void {
    if (this.updating) return;
    this.updating = true;
    try {
    this.physicsFrame = null;
    // The editor historically exposed `images` as a public map. Reconcile direct
    // map edits so older importers and UI integrations remain fully functional.
    this.layers.forEach((layer, layerId) => {
      if (layer.type === 'image' && !this.images.has(layerId)) this.layers.delete(layerId);
      if (layer.type === 'vector' && !this.vectors.has(layerId)) this.layers.delete(layerId);
    });
    this.images.forEach((image, layerId) => {
      const normalized = image as ImageLayer & { type?: 'image' };
      normalized.type = 'image';
      normalized.local ??= identity();
      normalized.world ??= identity();
      normalized.src ??= '';
      normalized.width ??= 110;
      normalized.height ??= 140;
      normalized.color ??= '#38bdf8';
      normalized.opacity ??= 1;
      normalized.boundBoneId ??= null;
      normalized.visible ??= true;
      normalized.locked ??= false;
      normalized.zIndex ??= this.layers.size;
      if (!this.layers.has(layerId)) this.layers.set(layerId, normalized);
    });
    this.vectors.forEach((vector, layerId) => {
      if (!this.layers.has(layerId)) this.layers.set(layerId, vector);
    });
    this.layers.forEach((layer) => {
      layer.depth = normalizeLayerDepth(layer.depth);
      layer.parallax = normalizeLayerParallax(layer.parallax);
    });

    this.controllerPoses = this.smartEditingActionId ? new Map() : sampleControllerPose(this,
      [...this.controllerState.entries()].flatMap(([id, state]) => state.applied && state.evaluation && this.controllerDefinition(id) ? [state.evaluation] : []));
    this.evaluateSmartActions();
    this.evaluateFacial();
    this.viewTargets = evaluateCharacterViews(this);

    this.constraintDeltas.clear();
    this.resolveWorldTransforms();
    if (this.constraints.length && !this.smartEditingActionId) {
      const evaluated = evaluateConstraints(this);
      this.constraintDeltas = evaluated.deltas;
      this.constraintDebug = evaluated.debug;
      this.resolveWorldTransforms();
    } else this.constraintDebug = [];
    const simulated = evaluateDynamics(this);
    if (simulated) this.applyPhysicsFrame(simulated);
    } finally { this.updating = false; }
  }

  applyAnimation(animation: AnimationClip | string | null, frame = this.timeline.currentFrame): boolean {
    const clip = typeof animation === 'string' ? this.animations.find((item) => item.id === animation) : animation;
    if (!clip) return false;
    this.cameraOverride = null;
    this.characterAngleOverrides.clear();
    this.smartViewAngleIds.clear();
    this.facialParameters.clear();
    this.constraintOverrides.clear();
    this.smartPreviewAngles.clear();
    applyAnimationToRig(this, clip, frame);
    this.timeline = { ...this.timeline, currentFrame: frame, currentTime: frame / this.timeline.fps };
    this.update();
    return true;
  }

  setTimeline(timeline: Partial<typeof this.timeline>): void {
    const next = { ...this.timeline, ...timeline };
    if (!Number.isFinite(next.fps) || next.fps <= 0) next.fps = this.timeline.fps;
    if (timeline.currentFrame === undefined && timeline.currentTime !== undefined && Number.isFinite(timeline.currentTime)) {
      next.currentFrame = timeline.currentTime * next.fps;
    }
    if (!Number.isFinite(next.currentFrame)) next.currentFrame = this.timeline.currentFrame;
    next.currentTime = next.currentFrame / next.fps;
    this.timeline = next;
  }

  setStage2D(patch: Partial<Stage2DSettings> = {}): Stage2DSettings {
    return setStage2D(this, patch);
  }

  /** Create environment data lazily so ordinary character projects stay compact. */
  ensureEnvironment(name = this.name): EnvironmentProjectData {
    if (!this.environment) this.environment = defaultEnvironmentProject(name);
    return this.environment;
  }

  setEnvironment(patch: EnvironmentProjectPatch): EnvironmentProjectData {
    this.environment = updateEnvironmentProject(this.ensureEnvironment(), patch);
    return this.environment;
  }

  toProject(): ProjectModel {
    this.update();
    const bones: BoneData[] = [...this.bones.values()].map(({ world: _world, ...bone }) => ({
      ...clone(bone),
      local: { ...bone.local },
      childrenIds: [...bone.childrenIds],
    }));
    const layers: LayerDataUnion[] = [...this.layers.values()].map(({ world: _world, ...layer }) => {
      const normalized = clone(layer) as LayerDataUnion;
      normalized.depth = normalizeLayerDepth(normalized.depth);
      normalized.parallax = normalizeLayerParallax(normalized.parallax);
      return normalized;
    });
    const bindings = [...this.bindings.values()].map((binding) => clone(binding));
    this.stage2d = normalizeStage2DSettings(this.stage2d);
    return {
      schemaVersion: 1,
      id: this.id,
      name: this.name,
      canvas: { ...this.canvas },
      bones,
      layers,
      bindings,
      animations: clone(this.animations),
      smartActions: clone(this.smartActions),
      actionLibrary: normalizeActionLibrary(this.actionLibrary),
      controllers: normalizeControllerDefinitions(this.controllers),
      controllerInstances: normalizeControllerInstances(this.controllerInstances, new Set(this.controllers.map(item => item.id)), this.id),
      lipSyncTracks: clone(this.lipSyncTracks),
      stage2d: { ...this.stage2d },
      ...(this.environment ? { environment: clone(this.environment) } : {}),
      cameras: clone(this.cameras),
      characterViews: clone(this.characterViews),
      motionPaths: clone(this.motionPaths),
      facialProfiles: clone(this.facialProfiles),
      headCreators: clone(this.headCreators),
      constraints: clone(this.constraints),
      dynamics: clone(this.dynamics),
      cameraProduction: clone(this.cameraProduction),
      groups: [...this.groups.values()].map(({ world: _world, childrenIds: _childrenIds, ...group }) => clone(group)),
      smartActionFolders: clone(this.smartActionFolders),
      cameraView: this.cameraView,
      ...(this.audio ? { audio: clone(this.audio) } : {}),
      timeline: { ...this.timeline },
      ...(Object.keys(this.metadata).length ? { metadata: { ...this.metadata } } : {}),
    };
  }

  loadProject(input: ProjectInput): void {
    const project = createEmptyProject(input);
    this.bones.clear();
    this.layers.clear();
    this.images.clear();
    this.vectors.clear();
    this.bindings.clear();
    this.id = project.id;
    this.name = project.name;
    this.canvas = { ...project.canvas };
    this.stage2d = normalizeStage2DSettings(project.stage2d);
    this.environment = project.environment ? normalizeEnvironmentProject(project.environment) : undefined;
    this.cameras = normalizeCameras(project.cameras);
    this.cameraView = project.cameraView ?? 'preview';
    this.cameraOverride = null;
    this.characterViews = project.characterViews ?? [];
    this.motionPaths = project.motionPaths ?? [];
    this.liveCameraId = null; this.liveCameraPose = null; this.stageRenderOverride = null;
    this.facialProfiles = project.facialProfiles ?? [];
    this.headCreators = project.headCreators ?? [];
    this.constraints = [];
    this.dynamics = project.dynamics ?? defaultDynamics();
    this.cameraProduction = project.cameraProduction ?? defaultCameraProduction();
    this.physicsFrame = null;
    this.groups.clear();
    this.isolatedGroupId = null;
    this.constraintDebug = [];
    this.constraintDeltas.clear();
    this.constraintOverrides.clear();
    this.facialParameters.clear();
    this.facialDeltas.clear();
    this.characterAngleOverrides.clear();
    this.viewTargets.clear();
    this.setTimeline(project.timeline);
    this.animations = clone(project.animations);
    this.actionLibrary = project.actionLibrary ?? [];
    this.controllers = project.controllers ?? [];
    this.controllerInstances = project.controllerInstances ?? [];
    this.controllerState.clear();
    this.controllerPoses.clear();
    this.audio = project.audio;
    this.lipSyncTracks = project.lipSyncTracks ?? [];
    this.smartEditingActionId = null;
    this.smartEditSnapshot = null;
    this.smartDeltas.clear();
    this.smartActions = normalizeSmartActions(project.smartActions);
    this.smartActionFolders = normalizeSmartFolders(project.smartActionFolders);
    this.smartPreviewAngles.clear(); this.smartSoloActionId = null;
    this.metadata = { ...(project.metadata ?? {}) };
    project.bones.forEach((bone) => {
      this.bones.set(bone.id, {
        ...clone(bone),
        local: { ...bone.local },
        world: identity(),
        childrenIds: [],
      });
    });
    this.bones.forEach((bone) => {
      if (bone.parentId) {
        const parent = this.bones.get(bone.parentId);
        if (parent && !parent.childrenIds.includes(bone.id)) parent.childrenIds.push(bone.id);
      }
    });
    project.layers.forEach((layer) => {
      const runtime = layerToRuntime(layer);
      runtime.depth = normalizeLayerDepth(runtime.depth);
      runtime.parallax = normalizeLayerParallax(runtime.parallax);
      if (runtime.mesh && !validMesh(runtime.mesh)) delete runtime.mesh;
      this.layers.set(runtime.id, runtime);
      if (runtime.type === 'image') this.images.set(runtime.id, runtime);
      else this.vectors.set(runtime.id, runtime);
    });
    project.groups?.forEach(group => {
      this.groups.set(group.id, { ...clone(group), world: identity(), childrenIds: [] });
    });
    this.layers.forEach(layer => {
      if (layer.parentGroupId && !this.groups.has(layer.parentGroupId)) layer.parentGroupId = null;
    });
    this.groups.forEach(group => { group.childIds = group.childIds.filter(child => this.groups.has(child) || this.layers.has(child)); });
    this.constraints = normalizeConstraints(project.constraints, new Set(this.bones.keys()));
    project.bindings.forEach((binding) => {
      const layerId = binding.layerId ?? binding.imageId;
      if (layerId && this.layers.has(layerId) && this.bones.has(binding.boneId)) {
        const normalized = { ...clone(binding), layerId, imageId: binding.imageId ?? layerId };
        this.bindings.set(layerId, normalized);
        const layer = this.layers.get(layerId);
        if (layer) layer.boundBoneId = binding.boneId;
      }
    });
    this.update();
  }

  toJSON(pretty = false): string {
    return JSON.stringify(this.toProject(), null, pretty ? 2 : 0);
  }

  toSerializable(): ProjectModel {
    return this.toProject();
  }

  serialize(pretty = false): string {
    return this.toJSON(pretty);
  }

  static fromProject(project: ProjectInput): Rig {
    return new Rig(project);
  }

  static fromJSON(json: string): Rig {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid character project JSON');
    return new Rig(parsed as ProjectInput);
  }

  static deserialize(json: string): Rig {
    return Rig.fromJSON(json);
  }
}
