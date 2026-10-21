import type { Point2D, Transform2D } from './math';
import { normalizeLipSyncTracks, normalizeProjectAudio } from './lipSync';
import { normalizeActionLibrary, normalizeControllerDefinitions, normalizeControllerInstances } from './controllers';
import { normalizeLayerDepth, normalizeLayerParallax, normalizeStage2DSettings } from './stage2d';
import type { Stage2DSettings } from './stage2d';
import { normalizeCameras } from './camera';
import { normalizeCharacterViews } from './characterViews';
import { normalizeFacialProfiles } from './facialAnimation';
import { normalizeBoneInfluence, normalizeConstraints } from './constraints';
import { normalizeMasks, normalizePatch } from './masking';
import { normalizeCurveChannels } from './animationCurves';
import { normalizeAnimationLayers, normalizeAnimationTransitions } from './animationNla';
import { normalizeDynamics, normalizeDynamicsBake, defaultDynamics } from './dynamics';
import { normalizeCameraProduction } from './cameraProduction';
import { normalizeTransform3D } from './camera3d';
import type { Transform3D, Vec3 } from './camera3d';
import { normalizeEnvironmentProject } from './environment';
import type { EnvironmentProjectData } from './environment';

/** Rhubarb mouth symbols. Times are absolute project seconds, end exclusive. */
export type Viseme = 'X' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
export interface LipSyncCue { id: string; start: number; end: number; viseme: Viseme }
export interface LipSyncTrack {
  id: string;
  name: string;
  enabled: boolean;
  mapping: Partial<Record<Viseme, string>>;
  cues: LipSyncCue[];
}
export interface ProjectAudio {
  id: string;
  name: string;
  /** Embedded local audio; decoding and playback belong to the editor. */
  src: string;
  duration: number;
  offsetSeconds: number;
  volume: number;
  muted: boolean;
  peaks: number[];
}

/** Canvas/SVG affine convention: x'=ax+cy+e, y'=bx+dy+f. */
export interface AffineMatrix { a: number; b: number; c: number; d: number; e: number; f: number }
export interface MeshVertex {
  x: number;
  y: number;
  /** Texture coordinates stay fixed when the author moves a vertex. */
  u: number;
  v: number;
  weights: Record<string, number>;
}
export interface MeshData {
  vertices: MeshVertex[];
  triangles: number[];
  bounds: { x: number; y: number; width: number; height: number };
  /** Inverse world matrices at bind time; no derived posed vertices are saved. */
  bindBoneInverses?: Record<string, AffineMatrix>;
  bindLayerMatrix?: AffineMatrix;
}
export interface SmartTargetState {
  local: Transform2D;
  opacity?: number;
  mesh?: Point2D[];
  /** Discrete layer state used by Smart Bone turn and expression actions. */
  visible?: boolean;
  zIndex?: number;
  masks?: MaskEntry[];
  patch?: PatchSettings;
}
export interface SmartTargetDelta {
  transform?: Partial<Transform2D>;
  opacity?: number;
  mesh?: Point2D[];
  /** Visibility and layer order switch at the midpoint between action keys. */
  visible?: boolean;
  zIndex?: number;
  masks?: MaskEntry[];
  patch?: PatchSettings;
}
export interface SmartActionFolder { id: string; name: string; parentId: string | null }
export interface SmartActionKey {
  angle: number;
  targets: Record<string, SmartTargetDelta>;
  viewAngles?: Record<string, number>;
  easing?: 'linear' | 'smooth' | 'step';
  thumbnail?: string;
}
export interface SmartBoneAction {
  id: string;
  name: string;
  driverBoneId: string;
  startAngle: number;
  endAngle: number;
  enabled: boolean;
  /** Optional prepared character-view sets driven by this Smart Bone dial. */
  viewSetIds?: string[];
  baseline: Record<string, SmartTargetState>;
  keys: SmartActionKey[];
  folderId?: string | null;
  blendMode?: 'additive' | 'override';
  weight?: number;
  priority?: number;
  dependencies?: string[];
  neutralAngle?: number;
  limitDriver?: boolean;
}

/** A value that can safely be written to a project JSON file. */
export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | SerializableValue[]
  | { [key: string]: SerializableValue };

export type LayerType = 'image' | 'vector';
export type GroupMode = 'group' | 'switch';
export type GroupBlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion';
export interface MaskEntry {
  id: string;
  layerId: string;
  kind: 'alpha' | 'clip';
  operation: 'add' | 'subtract' | 'intersect';
  inverted: boolean;
  opacity: number;
  enabled: boolean;
  hideSource: boolean;
  hideEdge: boolean;
}
export interface PatchSettings {
  enabled: boolean;
  targetIds: string[];
  hideEdges: boolean;
  seamWidth: number;
  /** Keep this patch's own contours while masking strokes on its target layers. */
  preserveOutline?: boolean;
}

export interface BoneData {
  id: string;
  name: string;
  length: number;
  parentId: string | null;
  local: Transform2D;
  /** Denormalized convenience data; parentId remains the source of truth. */
  childrenIds?: string[];
  locked?: boolean;
  /** Optional editor metadata; world transforms are derived at runtime. */
  color?: string;
  /** Optional spatial influence used when generating mesh skin weights. */
  influence?: BoneInfluence;
}

export interface BoneInfluence { radius: number; falloff: number; strength: number }

export interface DynamicsSettings {
  enabled: boolean;
  startFrame: number;
  endFrame: number;
  fps: number;
  substeps: number;
  gravityX: number;
  gravityY: number;
  windX: number;
  windY: number;
  windNoise: number;
  seed: number;
  bones: BoneDynamics[];
  bodies: PhysicsBody[];
  meshes: MeshDynamics[];
  emitters: ParticleEmitter[];
  cache?: PhysicsCache;
}
export interface BoneDynamics {
  id: string;
  boneId: string;
  enabled: boolean;
  mode: 'spring' | 'hair' | 'tail' | 'follow-through' | 'jiggle';
  stiffness: number;
  damping: number;
  mass: number;
  gravityScale: number;
  windScale: number;
  influence: number;
  overlap: number;
  /** Maximum world-space travel for translational jiggle, in stage pixels. */
  maxDisplacement?: number;
}
export interface PhysicsBody {
  id: string;
  targetId?: string;
  name: string;
  shape: 'circle' | 'box';
  motion: 'static' | 'kinematic' | 'dynamic';
  x: number;
  y: number;
  radius: number;
  width: number;
  height: number;
  rotation: number;
  mass: number;
  restitution: number;
  friction: number;
  /** Multiplier for global wind acceleration; set to zero for a heavy ball. */
  windScale?: number;
  /** Optional one-shot velocity applied when the simulation reaches launchFrame. */
  initialVelocity?: { x: number; y: number };
  /** Frame at which initialVelocity is applied; defaults to the simulation start. */
  launchFrame?: number;
  enabled: boolean;
}
export interface MeshDynamics {
  id: string;
  layerId: string;
  enabled: boolean;
  mode: 'cloth' | 'soft-body';
  stiffness: number;
  damping: number;
  mass: number;
  gravityScale: number;
  windScale: number;
  pinned: number[];
  /** Advect the cloth with its animated/skinned pose (0 = inertial, 1 = follows). */
  poseFollow?: number;
  /** Limit free-vertex travel from the skinned pose; zero leaves it unbounded. */
  maxDisplacement?: number;
  /** Recompute rest lengths from the current pose during turns and scaling. */
  adaptiveRest?: boolean;
}
export interface ParticleEmitter {
  id: string;
  name: string;
  targetId?: string;
  enabled: boolean;
  x: number;
  y: number;
  rate: number;
  lifetime: number;
  speed: number;
  spread: number;
  direction: number;
  size: number;
  color: string;
}
export interface PhysicsFrame {
  frame: number;
  bones: Record<string, number>;
  /** Translational secondary motion in each bone's parent-local coordinates. */
  boneOffsets?: Record<string, Point2D>;
  bodies: Record<string, { x: number; y: number; rotation: number }>;
  meshes: Record<string, Point2D[]>;
  particles: Array<{ x: number; y: number; size: number; color: string; opacity: number }>;
}
export interface PhysicsCache {
  startFrame: number;
  endFrame: number;
  fps: number;
  sourceAnimationId: string | null;
  signature: string;
  frames: PhysicsFrame[];
}
export interface DynamicsBake {
  sourceAnimationId: string | null;
  startFrame: number;
  endFrame: number;
  fps: number;
  /** These ordinary transform/mesh keys contain the final evaluated pose. */
  targetIds: string[];
  meshIds: string[];
  particleLayerId?: string;
}

export interface LayerData {
  id: string;
  name: string;
  type: LayerType;
  local: Transform2D;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  boundBoneId: string | null;
  opacity: number;
  /** Optional staging metadata; omitted by legacy JSON files. */
  depth?: number;
  /** Optional staging metadata; omitted by legacy JSON files. */
  parallax?: number;
  mesh?: MeshData;
  /** Optional parent folder/group. Legacy projects omit this and remain root layers. */
  parentGroupId?: string | null;
  patch?: PatchSettings;
  /** Optional true 3D transform; legacy layers remain flat 2D planes. */
  transform3d?: Transform3D;
  /** Optional imported/generated 3D geometry rendered by the stage camera. */
  mesh3d?: Mesh3D;
}

export interface Mesh3D {
  vertices: Vec3[];
  triangles: Array<{ indices: [number, number, number]; color?: string; material?: string }>;
  source?: 'obj' | 'extrude' | 'inflate' | 'lathe' | 'manual';
  extrusion?: number;
  inflate?: number;
  lathe?: { segments: number; angle: number };
  castShadow?: boolean;
}

export interface ImageLayerData extends LayerData {
  type: 'image';
  /** A data URL, URL, or other image source understood by an Image element. */
  src: string;
  width: number;
  height: number;
  color: string;
  /** Kept for consumers that prefer a layer-specific name over type. */
  kind?: 'image';
}

export type VectorShapeKind = 'rect' | 'ellipse' | 'path' | 'polygon';

export interface VectorShape {
  id: string;
  kind: VectorShapeKind;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radiusX?: number;
  radiusY?: number;
  points?: Array<{ x: number; y: number }>;
  d?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  /** Optional authored brush metadata and stroke rendering controls. */
  brushId?: string;
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'bevel' | 'round' | 'miter';
  lineDash?: number[];
}

export interface VectorLayerData extends LayerData {
  type: 'vector';
  shapes: VectorShape[];
}

export type LayerDataUnion = ImageLayerData | VectorLayerData;

export interface LayerGroupData {
  id: string;
  name: string;
  parentGroupId: string | null;
  childIds: string[];
  local: Transform2D;
  visible: boolean;
  locked: boolean;
  opacity: number;
  zIndex: number;
  mode: GroupMode;
  activeChildId?: string;
  blendMode: GroupBlendMode;
  maskLayerId?: string;
  clipLayerId?: string;
  maskMode?: 'clip' | 'alpha';
  isolated?: boolean;
  /** Ordered Boolean/alpha operations, evaluated on the group's composited children. */
  masks?: MaskEntry[];
}

export interface Binding {
  id?: string;
  /** `layerId` is canonical when present; imageId is retained for legacy files. */
  layerId?: string;
  imageId: string;
  boneId: string;
  bindOffset: Transform2D;
  weight?: number;
}

export type AnimatedProperty =
  | 'transform'
  | 'x'
  | 'y'
  | 'rotation'
  | 'scaleX'
  | 'scaleY'
  | 'opacity'
  | 'mesh'
  | string;

export type CurveEasing = 'linear' | 'smooth' | 'step' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bezier' | 'bounce' | 'elastic' | 'overshoot';
/** Handle offsets use frames horizontally and native channel units vertically. */
export interface CurveTangent { frame: number; value: number }
export interface ChannelCurve {
  easing?: CurveEasing;
  inTangent?: CurveTangent;
  outTangent?: CurveTangent;
  locked?: boolean;
}
export interface Keyframe<T = SerializableValue> {
  id: string;
  frame: number;
  value: T;
  /** Interpolation from this key to the next. Linear remains the legacy default. */
  easing?: CurveEasing;
  /** '$' denotes scalar values; object paths (x/y/rotation etc.) remain independent. */
  curves?: Record<string, ChannelCurve>;
}

export interface AnimationTrack<T = SerializableValue> {
  id: string;
  targetId: string;
  property: AnimatedProperty;
  keyframes: Array<Keyframe<T>>;
}

export interface AnimationClip {
  dynamicsBake?: DynamicsBake;
  id: string;
  name: string;
  fps: number;
  startFrame: number;
  endFrame: number;
  tracks: AnimationTrack[];
  /** Setup pose for newly keyed targets; restores them even after all keys are removed. */
  setupPose?: Record<string, SmartTargetState>;
  loopMode?: 'once' | 'cycle' | 'ping-pong';
  loopStart?: number;
  loopEnd?: number;
  cycleOffset?: number;
  playbackRate?: number;
  trimStart?: number;
  trimEnd?: number;
  nlaLayers?: AnimationLayer[];
  transitions?: AnimationTransition[];
}

export type AnimationBlendMode = 'override' | 'additive';
export interface AnimationLayer {
  id: string;
  name: string;
  clipId: string;
  startFrame: number;
  endFrame: number;
  sourceStartFrame?: number;
  sourceEndFrame?: number;
  speed: number;
  offset: number;
  weight: number;
  blendMode: AnimationBlendMode;
  loopMode: 'once' | 'cycle' | 'ping-pong';
  blendIn: number;
  blendOut: number;
  muted: boolean;
  solo: boolean;
}
export interface AnimationTransition {
  id: string;
  fromLayerId: string;
  toLayerId: string;
  duration: number;
  easing: CurveEasing;
}

/** References existing clips; an action never owns a second copy of tracks. */
export interface ActionLibraryItem {
  id: string;
  name: string;
  animationId?: string;
  clipId?: string;
  actionName?: string;
  loop?: boolean;
  speed?: number;
}

export type ControllerInputValue = number | boolean | { x: number; y: number };
export interface ControllerInput {
  id: string;
  name: string;
  type: 'button' | 'axis' | 'joystick';
  defaultValue?: ControllerInputValue;
}
export interface ControllerBinding {
  inputId: string;
  /** Library ID, existing clip ID/name, or empty for a parameter-only binding. */
  actionId: string;
  targetId?: string;
  parameter: string;
  scale: number;
  deadzone: number;
  invert: boolean;
  component?: 'x' | 'y' | 'magnitude';
  priority?: number;
}
export interface ControllerCondition {
  inputId: string;
  operator?: '>' | '>=' | '<' | '<=' | '==' | '!=' | 'pressed' | 'released';
  threshold?: number;
  component?: 'x' | 'y' | 'magnitude';
  absolute?: boolean;
}
export interface ControllerStateDefinition {
  id: string;
  name: string;
  actionId?: string;
  priority?: number;
  conditions?: ControllerCondition[];
  loop?: boolean;
}
export interface ControllerTransition {
  from: string;
  to: string;
  conditions: ControllerCondition[];
  priority?: number;
}
export interface ControllerDefinition {
  id: string;
  name: string;
  type: 'car' | 'character' | 'custom';
  inputs: ControllerInput[];
  bindings: ControllerBinding[];
  states: ControllerStateDefinition[];
  transitions: ControllerTransition[];
  initialStateId?: string;
}
export interface ControllerInstance {
  id: string;
  definitionId: string;
  rigId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  visibleInRender: boolean;
}
/** Transient result, never included in ProjectModel. dt and elapsed use seconds. */
export interface ControllerEvaluation {
  controllerId: string;
  definitionId: string;
  inputs: Record<string, ControllerInputValue>;
  stateId: string | null;
  actionId: string | null;
  clipId: string | null;
  frame: number;
  elapsed: number;
  stateTime: number;
  parameters: Record<string, number>;
  outputs: Array<{ targetId: string; parameter: string; value: number }>;
  accumulators: Record<string, number>;
}
export interface ControllerRuntimeState {
  inputs: Record<string, ControllerInputValue>;
  evaluation?: ControllerEvaluation;
  applied: boolean;
}

export type FacialTargetRole = 'head' | 'leftEye' | 'rightEye' | 'leftPupil' | 'rightPupil' | 'leftBrow' | 'rightBrow' | 'mouth' | 'openMouth' | 'jaw';
export interface FacialParameters {
  blinkLeft: number;
  blinkRight: number;
  browLeft: number;
  browRight: number;
  eyeX: number;
  eyeY: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
  smile: number;
  mouthOpen: number;
}
export interface FacialPreset { id: string; name: string; values: FacialParameters }
export interface FacialCalibration {
  neutral: FacialParameters;
  yawRange: number;
  pitchRange: number;
  rollRange: number;
}
export interface FacialProfile {
  id: string;
  name: string;
  enabled: boolean;
  targets: Partial<Record<FacialTargetRole, string>>;
  baseline: Record<string, SmartTargetState>;
  values: FacialParameters;
  blink: { enabled: boolean; interval: number; duration: number };
  /** Optional prepared head-view set for horizontal head turning. */
  viewSetId?: string;
  calibration: FacialCalibration;
  presets: FacialPreset[];
}
export interface HeadCreatorControls { eyeSpacing: number; noseDepth: number; mouthWidth: number; earVisibility: number }
export interface HeadCreatorMask { enabled: boolean; x: number; y: number; radiusX: number; radiusY: number }
export interface HeadCreatorSlot { viewId: string; name: string; angle: number; baseline: Record<string, CharacterViewTarget> }
export interface HeadCreatorProfile {
  id: string;
  name: string;
  enabled: boolean;
  headBoneId: string;
  viewSetId: string;
  facialProfileId?: string;
  bodyViewSetId?: string;
  featureTargets: Partial<Record<'leftEye' | 'rightEye' | 'leftPupil' | 'rightPupil' | 'nose' | 'mouth' | 'leftEar' | 'rightEar', string>>;
  controls: HeadCreatorControls;
  mask: HeadCreatorMask;
  slots: HeadCreatorSlot[];
  maskLayerId?: string;
}

export type BoneConstraintType = 'angle' | 'translation' | 'scale' | 'distance' | 'direction' | 'pin' | 'target' | 'parent' | 'squashStretch';
export type BoneConstraintMix = 'replace' | 'additive';
export interface ConstraintKeyframe {
  id: string;
  frame: number;
  weight: number;
  enabled?: boolean;
  easing?: Keyframe['easing'];
}
export interface BoneConstraint {
  id: string;
  name: string;
  type: BoneConstraintType;
  enabled: boolean;
  sourceBoneId: string;
  targetBoneId?: string;
  priority?: number;
  weight: number;
  mix: BoneConstraintMix;
  minAngle?: number;
  maxAngle?: number;
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  minScaleX?: number;
  maxScaleX?: number;
  minScaleY?: number;
  maxScaleY?: number;
  minDistance?: number;
  maxDistance?: number;
  directionAngle?: number;
  pinX?: number;
  pinY?: number;
  minStretch?: number;
  maxStretch?: number;
  preserveArea?: boolean;
  parentInfluence?: number;
  positionInfluence?: number;
  rotationInfluence?: number;
  scaleInfluence?: number;
  maintainOffset?: boolean;
  offset?: Transform2D;
  anchor?: 'origin' | 'tip';
  targetMode?: 'aim' | 'ik';
  chainLength?: number;
  affectChildren?: boolean;
  falloff?: number;
  keyframes: ConstraintKeyframe[];
}

export interface TimelineState {
  currentFrame: number;
  currentTime: number;
  isPlaying: boolean;
  loop: boolean;
  fps: number;
  startFrame: number;
  endFrame: number;
  activeAnimationId: string | null;
}

export interface CanvasSettings {
  width: number;
  height: number;
  background: string;
}

export interface CameraFollow { targetId: string; anchorX: number; anchorY: number }
export interface CameraDefinition {
  id: string;
  name: string;
  hotkey?: number;
  settings: Stage2DSettings;
  follow: CameraFollow | null;
}

export interface CameraBookmark {
  id: string;
  name: string;
  frame: number;
  cameraId: string;
  settings: Stage2DSettings;
}
export interface CameraTransitionPreset {
  id: string;
  name: string;
  duration: number;
  easing: CurveEasing;
  kind: 'cut' | 'dissolve' | 'push' | 'whip' | 'zoom';
}
export interface CameraRigDefinition {
  id: string;
  name: string;
  cameraId: string;
  targetId?: string;
  enabled: boolean;
  orbit: { yaw: number; pitch: number; distance: number };
  damping: number;
}
export interface CameraProductionSettings {
  stageMode: boolean;
  liveControl: { enabled: boolean; source: 'pointer' | 'device-orientation' | 'gamepad'; sensitivity: number; smoothing: number };
  shake: { enabled: boolean; amplitude: number; frequency: number; rotation: number; seed: number };
  bookmarks: CameraBookmark[];
  transitionPresets: CameraTransitionPreset[];
  cameraRigs: CameraRigDefinition[];
  defaultTransitionPresetId: string;
}

export type ViewArtwork =
  | { type: 'image'; src: string; width: number; height: number; color: string }
  | { type: 'vector'; shapes: VectorShape[] };
export interface CharacterMasterModel {
  /** Shared authored height in stage pixels, measured from the setup pose. */
  height: number;
  /** Named setup landmarks shared by every prepared angle. */
  landmarks: Record<string, Point2D>;
  /** Bone lengths are invariant across front, profile and back artwork. */
  limbLengths: Record<string, number>;
  /** Clothing slots keep outfit ownership stable while artwork changes per view. */
  clothing: Record<string, string>;
  /** Common shoe envelope used by the view checker and walk preview. */
  shoeDimensions: { width: number; height: number };
  sourceAngle: number;
}
export interface CharacterViewTarget extends SmartTargetState {
  visible?: boolean;
  zIndex?: number;
  length?: number;
  artwork?: ViewArtwork;
}
export interface CharacterView {
  id: string;
  name: string;
  /** Degrees: front 0, front side -45, side -90, back side -135, back -180. */
  angle: number;
  targets: Record<string, CharacterViewTarget>;
}
export interface CharacterViewSet {
  id: string;
  name: string;
  enabled: boolean;
  angle: number;
  wrap: boolean;
  interpolate: boolean;
  targetIds: string[];
  baseline: Record<string, CharacterViewTarget>;
  views: CharacterView[];
  /** Optional shared model metadata; legacy view sets remain valid without it. */
  master?: CharacterMasterModel;
}

/** A drawable world-space path that can drive one scene object through time. */
export interface MotionPath {
  id: string;
  name: string;
  targetId: string;
  points: Point2D[];
  startFrame: number;
  endFrame: number;
  orientToPath: boolean;
  enabled: boolean;
}

/** The persisted, JSON-safe representation of a character studio project. */
export interface ProjectModel {
  schemaVersion: 1;
  id: string;
  name: string;
  canvas: CanvasSettings;
  bones: BoneData[];
  layers: LayerDataUnion[];
  bindings: Binding[];
  animations: AnimationClip[];
  smartActions?: SmartBoneAction[];
  smartActionFolders?: SmartActionFolder[];
  actionLibrary?: ActionLibraryItem[];
  controllers?: ControllerDefinition[];
  controllerInstances?: ControllerInstance[];
  audio?: ProjectAudio;
  lipSyncTracks?: LipSyncTrack[];
  stage2d: Stage2DSettings;
  /** Optional environment-editor data. Legacy character projects omit it. */
  environment?: EnvironmentProjectData;
  cameras?: CameraDefinition[];
  characterViews?: CharacterViewSet[];
  motionPaths?: MotionPath[];
  facialProfiles?: FacialProfile[];
  headCreators?: HeadCreatorProfile[];
  constraints?: BoneConstraint[];
  groups?: LayerGroupData[];
    dynamics?: DynamicsSettings;
    cameraProduction?: CameraProductionSettings;
  cameraView?: string;
  timeline: TimelineState;
  metadata?: Record<string, string>;
}

export type ProjectInput = Partial<ProjectModel> & {
  schemaVersion?: number;
  /** Legacy files used `images` instead of the unified `layers` collection. */
  images?: ImageLayerData[];
};

function normalizeMotionPaths(value: unknown, validIds: Set<string>): MotionPath[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 128).flatMap(raw => {
    if (!recordModel(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.targetId !== 'string' || !validIds.has(raw.targetId) || !Array.isArray(raw.points)) return [];
    const points = raw.points.slice(0, 2048).flatMap(point => recordModel(point) && Number.isFinite(point.x) && Number.isFinite(point.y) ? [{ x: point.x, y: point.y }] : []);
    if (points.length < 2) return [];
    const startFrame = Math.max(0, Math.round(finiteModel(raw.startFrame, 0)));
    const endFrame = Math.max(startFrame + 1, Math.round(finiteModel(raw.endFrame, 120)));
    return [{ id: raw.id, name: raw.name.slice(0, 100) || 'Motion path', targetId: raw.targetId, points, startFrame, endFrame, orientToPath: raw.orientToPath !== false, enabled: raw.enabled !== false }];
  });
}

function finiteModel(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function recordModel(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeMesh3D(value: unknown): Mesh3D {
  if (!recordModel(value)) return { vertices: [], triangles: [], source: 'manual', castShadow: true };
  const vertices = Array.isArray(value.vertices) ? value.vertices.slice(0, 10000).flatMap(item => recordModel(item) && [item.x, item.y, item.z].every(Number.isFinite) ? [{ x: item.x, y: item.y, z: item.z }] : []) : [];
  const triangles = Array.isArray(value.triangles) ? value.triangles.slice(0, 20000).flatMap(item => {
    const indices = Array.isArray(item?.indices) ? item.indices : Array.isArray(item) ? item : [];
    if (indices.length !== 3 || !indices.every((index: unknown) => Number.isInteger(index) && Number(index) >= 0 && Number(index) < vertices.length)) return [];
    return [{ indices: [Number(indices[0]), Number(indices[1]), Number(indices[2])] as [number, number, number], ...(typeof item?.color === 'string' ? { color: item.color.slice(0, 30) } : {}), ...(typeof item?.material === 'string' ? { material: item.material.slice(0, 80) } : {}) }];
  }) : [];
  return { vertices, triangles, source: ['obj', 'extrude', 'inflate', 'lathe', 'manual'].includes(String(value.source)) ? value.source : 'manual', ...(Number.isFinite(value.extrusion) ? { extrusion: value.extrusion } : {}), ...(Number.isFinite(value.inflate) ? { inflate: value.inflate } : {}), ...(recordModel(value.lathe) ? { lathe: { segments: Math.max(3, Math.min(256, Math.round(finiteModel(value.lathe.segments, 24)))), angle: finiteModel(value.lathe.angle, Math.PI * 2) } } : {}), castShadow: value.castShadow !== false };
}

/** Keep Head Creator metadata safe when loading older or hand-edited JSON. */
export function normalizeHeadCreators(value: unknown, validIds: Set<string>, characterViews: CharacterViewSet[], facialProfiles: FacialProfile[]): HeadCreatorProfile[] {
  if (!Array.isArray(value)) return [];
  const creators = new Set<string>();
  return value.slice(0, 32).flatMap(raw => {
    if (!recordModel(raw) || typeof raw.id !== 'string' || !raw.id || creators.has(raw.id) || typeof raw.name !== 'string' || typeof raw.headBoneId !== 'string' || !validIds.has(raw.headBoneId) || typeof raw.viewSetId !== 'string') return [];
    const set = characterViews.find(item => item.id === raw.viewSetId);
    if (!set) return [];
    const targetIds = new Set(set.targetIds);
    const featureTargets: HeadCreatorProfile['featureTargets'] = {};
    if (recordModel(raw.featureTargets)) Object.entries(raw.featureTargets).forEach(([role, id]) => {
      if (typeof id === 'string' && targetIds.has(id) && ['leftEye', 'rightEye', 'leftPupil', 'rightPupil', 'nose', 'mouth', 'leftEar', 'rightEar'].includes(role)) featureTargets[role as keyof HeadCreatorProfile['featureTargets']] = id;
    });
    const controls = recordModel(raw.controls) ? {
      eyeSpacing: Math.max(-1, Math.min(1, finiteModel(raw.controls.eyeSpacing, 0))),
      noseDepth: Math.max(-1, Math.min(1, finiteModel(raw.controls.noseDepth, 0))),
      mouthWidth: Math.max(-1, Math.min(1, finiteModel(raw.controls.mouthWidth, 0))),
      earVisibility: Math.max(0, Math.min(1, finiteModel(raw.controls.earVisibility, 1))),
    } : { eyeSpacing: 0, noseDepth: 0, mouthWidth: 0, earVisibility: 1 };
    const mask = recordModel(raw.mask) ? {
      enabled: raw.mask.enabled === true,
      x: finiteModel(raw.mask.x, 0), y: finiteModel(raw.mask.y, 0),
      radiusX: Math.max(1, finiteModel(raw.mask.radiusX, 92)), radiusY: Math.max(1, finiteModel(raw.mask.radiusY, 122)),
    } : { enabled: false, x: 0, y: 0, radiusX: 92, radiusY: 122 };
    const slots: HeadCreatorSlot[] = Array.isArray(raw.slots) ? raw.slots.flatMap(item => {
      if (!recordModel(item) || typeof item.viewId !== 'string') return [];
      const view = set.views.find(candidate => candidate.id === item.viewId);
      if (!view) return [];
      return [{ viewId: view.id, name: typeof item.name === 'string' ? item.name : view.name, angle: finiteModel(item.angle, view.angle), baseline: recordModel(item.baseline) ? JSON.parse(JSON.stringify(item.baseline)) : JSON.parse(JSON.stringify(view.targets)) }];
    }) : set.views.map(view => ({ viewId: view.id, name: view.name, angle: view.angle, baseline: JSON.parse(JSON.stringify(view.targets)) }));
    if (!slots.length) return [];
    creators.add(raw.id);
    return [{ id: raw.id, name: raw.name.trim().slice(0, 100) || 'Head Creator', enabled: raw.enabled !== false, headBoneId: raw.headBoneId, viewSetId: set.id,
      ...(typeof raw.facialProfileId === 'string' && facialProfiles.some(profile => profile.id === raw.facialProfileId) ? { facialProfileId: raw.facialProfileId } : {}),
      ...(typeof raw.bodyViewSetId === 'string' && characterViews.some(item => item.id === raw.bodyViewSetId) ? { bodyViewSetId: raw.bodyViewSetId } : {}), featureTargets, controls, mask, slots,
      ...(typeof raw.maskLayerId === 'string' && validIds.has(raw.maskLayerId) ? { maskLayerId: raw.maskLayerId } : {}) }];
  });
}

export function normalizeLayerGroups(value: unknown, layerIds: Set<string>): LayerGroupData[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const rawGroups = value.slice(0, 256).filter(recordModel);
  rawGroups.forEach(raw => { if (typeof raw.id === 'string' && raw.id) ids.add(raw.id); });
  const validGroups = new Set<string>();
  const groups: LayerGroupData[] = rawGroups.flatMap(raw => {
    if (typeof raw.id !== 'string' || !raw.id || validGroups.has(raw.id)) return [];
    const parentGroupId = typeof raw.parentGroupId === 'string' && raw.parentGroupId !== raw.id && ids.has(raw.parentGroupId) ? raw.parentGroupId : null;
    const local = recordModel(raw.local) && ['x', 'y', 'rotation', 'scaleX', 'scaleY'].every(key => Number.isFinite(raw.local[key]))
      ? { x: raw.local.x, y: raw.local.y, rotation: raw.local.rotation, scaleX: raw.local.scaleX, scaleY: raw.local.scaleY } : { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    validGroups.add(raw.id);
    return [{ id: raw.id, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 100) : 'Group', parentGroupId, childIds: [], local,
      visible: raw.visible !== false, locked: raw.locked === true, opacity: Math.max(0, Math.min(1, finiteModel(raw.opacity, 1))), zIndex: finiteModel(raw.zIndex, 0),
      mode: raw.mode === 'switch' ? 'switch' as const : 'group' as const, ...(typeof raw.activeChildId === 'string' ? { activeChildId: raw.activeChildId } : {}),
      blendMode: ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'].includes(String(raw.blendMode)) ? raw.blendMode as GroupBlendMode : 'source-over' as const,
      ...(typeof raw.maskLayerId === 'string' && layerIds.has(raw.maskLayerId) ? { maskLayerId: raw.maskLayerId } : {}),
      ...(typeof raw.clipLayerId === 'string' && layerIds.has(raw.clipLayerId) ? { clipLayerId: raw.clipLayerId } : {}),
      maskMode: raw.maskMode === 'alpha' ? 'alpha' as const : 'clip' as const, isolated: raw.isolated === true,
      ...(Array.isArray(raw.masks) ? { masks: normalizeMasks(raw.masks, layerIds) } : {}) }];
  });
  const byId = new Map(groups.map(group => [group.id, group]));
  const reaches = (from: string, target: string, seen = new Set<string>()): boolean => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    const parent = byId.get(from)?.parentGroupId;
    return Boolean(parent && reaches(parent, target, seen));
  };
  groups.forEach(group => {
    if (group.parentGroupId && reaches(group.parentGroupId, group.id)) group.parentGroupId = null;
  });
  const ownership = new Set<string>();
  rawGroups.forEach(raw => {
    const group = byId.get(String(raw.id));
    if (!group) return;
    const requested = Array.isArray(raw.childIds) ? raw.childIds.filter((id): id is string => typeof id === 'string') : [];
    requested.forEach(childId => {
      if (ownership.has(childId) || !(layerIds.has(childId) || byId.has(childId)) || childId === group.id) return;
      const childGroup = byId.get(childId);
      if (childGroup && reaches(group.id, childId)) return;
      if (childGroup) childGroup.parentGroupId = group.id;
      ownership.add(childId); group.childIds.push(childId);
    });
  });
  layerIds.forEach(layerId => {
    if (ownership.has(layerId)) return;
    const raw = rawGroups.find(group => Array.isArray(group.childIds) && group.childIds.includes(layerId));
    if (!raw) return;
    const group = byId.get(String(raw.id));
    if (group && !group.childIds.includes(layerId)) group.childIds.push(layerId);
  });
  return groups;
}

export const DEFAULT_CANVAS: CanvasSettings = {
  width: 800,
  height: 520,
  background: '#202020',
};

export const DEFAULT_TIMELINE: TimelineState = {
  currentFrame: 0,
  currentTime: 0,
  isPlaying: false,
  loop: true,
  fps: 24,
  startFrame: 0,
  endFrame: 120,
  activeAnimationId: null,
};

export function cloneProject(project: ProjectModel): ProjectModel {
  return JSON.parse(JSON.stringify(project)) as ProjectModel;
}

export function createEmptyProject(overrides: Partial<ProjectModel> = {}): ProjectModel {
  const legacy = overrides as ProjectInput;
  const raw = overrides as ProjectInput & Record<string, unknown>;
  const id = overrides.id ?? `project-${Date.now().toString(36)}`;
  const legacyImages = legacy.images?.map((image) => ({ ...image, type: 'image' as const }));
  const inputLayers = overrides.layers ?? legacyImages ?? [];
  const audio = normalizeProjectAudio(overrides.audio);
  const lipSyncTracks = normalizeLipSyncTracks(overrides.lipSyncTracks, new Set(inputLayers.map(layer => layer.id)));
  const controllers = normalizeControllerDefinitions(overrides.controllers);
  const stage2d = normalizeStage2DSettings(overrides.stage2d);
  const rawEnvironment = raw.environment ?? raw.world;
  const rawSettings = raw.environmentSettings ?? raw.settings;
  const environmentSource = rawEnvironment ?? (
    rawSettings || raw.environmentTerrain || raw.environmentEffects || raw.environmentLayers
      ? {
        settings: rawSettings,
        terrain: raw.environmentTerrain ?? raw.terrain,
        effects: raw.environmentEffects ?? raw.effects,
        layers: raw.environmentLayers,
        assetIds: raw.environmentAssets,
        cameraBounds: raw.cameraBounds,
        safeArea: raw.safeArea,
        minimap: raw.minimap,
      }
      : undefined
  );
  const environmentMarker = Object.values(overrides.metadata ?? {}).some(value => /environment|terrain|world/i.test(value));
  const environment = environmentSource ? normalizeEnvironmentProject(environmentSource) : environmentMarker ? normalizeEnvironmentProject({ name: overrides.name }) : undefined;
  const cameras = normalizeCameras(overrides.cameras);
  const validIds = new Set([...(overrides.bones ?? []).map(bone => bone.id), ...inputLayers.map(layer => layer.id)]);
  const characterViews = normalizeCharacterViews(overrides.characterViews, validIds);
  const facialProfiles = normalizeFacialProfiles(overrides.facialProfiles, validIds);
  const headCreators = normalizeHeadCreators(overrides.headCreators, validIds, characterViews, facialProfiles);
  const groups = normalizeLayerGroups(overrides.groups, new Set(inputLayers.map(layer => layer.id)));
  const motionPaths = normalizeMotionPaths(overrides.motionPaths, new Set([...validIds, ...groups.map(group => group.id)]));
  const groupMap = new Map(groups.map(group => [group.id, group]));
  const claimed = new Set(groups.flatMap(group => group.childIds));
  inputLayers.forEach(layer => {
    const parent = typeof layer.parentGroupId === 'string' ? groupMap.get(layer.parentGroupId) : undefined;
    if (parent && !claimed.has(layer.id)) { parent.childIds.push(layer.id); claimed.add(layer.id); }
  });
  groups.forEach(group => group.childIds.forEach(childId => {
    const childLayer = inputLayers.find(layer => layer.id === childId);
    if (childLayer && !childLayer.parentGroupId) childLayer.parentGroupId = group.id;
  }));
  return {
    schemaVersion: 1,
    id,
    name: overrides.name ?? 'Untitled Character',
    canvas: { ...DEFAULT_CANVAS, ...(overrides.canvas ?? {}) },
    stage2d,
    ...(environment ? { environment } : {}),
    cameras,
    characterViews,
    motionPaths,
    facialProfiles,
    headCreators,
    constraints: normalizeConstraints(overrides.constraints, new Set((overrides.bones ?? []).map(bone => bone.id))),
    groups,
    dynamics: overrides.dynamics ? normalizeDynamics(overrides.dynamics, new Set((overrides.bones ?? []).map(bone => bone.id)), new Set(inputLayers.map(layer => layer.id))) : defaultDynamics(),
    cameraProduction: normalizeCameraProduction(overrides.cameraProduction, new Set(cameras.map(camera => camera.id)), new Set([...validIds, ...groups.map(group => group.id)])),
    cameraView: overrides.cameraView === 'switch' || cameras.some(camera => camera.id === overrides.cameraView) ? overrides.cameraView : 'preview',
    bones: (overrides.bones ?? []).map((bone) => ({ ...bone, local: { ...bone.local }, ...(bone.influence ? { influence: normalizeBoneInfluence(bone.influence) } : {}) })),
    layers: inputLayers.map((layer, index) => {
      const type = layer.type ?? 'image';
      const common = {
        ...layer,
        type,
        local: { ...layer.local },
        visible: layer.visible ?? true,
        locked: layer.locked ?? false,
        zIndex: layer.zIndex ?? index,
        boundBoneId: layer.boundBoneId ?? null,
        opacity: layer.opacity ?? 1,
        depth: normalizeLayerDepth(layer.depth),
        parallax: normalizeLayerParallax(layer.parallax),
        ...(layer.patch ? { patch: normalizePatch(layer.patch, new Set(inputLayers.map(item => item.id))) } : {}),
        ...(layer.parentGroupId && groupMap.has(layer.parentGroupId) ? { parentGroupId: layer.parentGroupId } : {}),
         ...(layer.mesh ? { mesh: JSON.parse(JSON.stringify(layer.mesh)) as MeshData } : {}),
         ...(layer.transform3d ? { transform3d: normalizeTransform3D(layer.transform3d) } : {}),
         ...(layer.mesh3d && typeof layer.mesh3d === 'object' ? { mesh3d: normalizeMesh3D(layer.mesh3d) } : {}),
      };
      if (type === 'vector') {
        const vector = layer as Partial<VectorLayerData>;
        return { ...common, type: 'vector' as const, shapes: vector.shapes?.map((shape) => ({ ...shape })) ?? [] };
      }
      const image = layer as Partial<ImageLayerData>;
      return {
        ...common,
        type: 'image' as const,
        src: image.src ?? '',
        width: image.width ?? 110,
        height: image.height ?? 140,
        color: image.color ?? '#38bdf8',
      };
    }) as LayerDataUnion[],
    bindings: (overrides.bindings ?? []).map((binding) => ({
      ...binding,
      layerId: binding.layerId ?? binding.imageId ?? '',
      bindOffset: { ...binding.bindOffset },
    })),
    animations: (overrides.animations ?? []).map((animation) => ({
      ...animation,
      dynamicsBake: normalizeDynamicsBake(animation.dynamicsBake, new Set([...validIds, ...groups.map(group => group.id)]), new Set(inputLayers.map(layer => layer.id))),
      ...(animation.nlaLayers ? { nlaLayers: normalizeAnimationLayers(animation.nlaLayers, new Set((overrides.animations ?? []).map(item => item.id))) } : {}),
      ...(animation.transitions ? { transitions: normalizeAnimationTransitions(animation.transitions, new Set((animation.nlaLayers ?? []).map(layer => layer.id))) } : {}),
      ...(animation.setupPose ? { setupPose: JSON.parse(JSON.stringify(animation.setupPose)) as Record<string, SmartTargetState> } : {}),
      tracks: animation.tracks.map((track) => ({
        ...track,
        keyframes: track.keyframes.map((keyframe) => ({ ...keyframe,
          ...(keyframe.curves ? { curves: normalizeCurveChannels(keyframe.curves) } : {}),
        })),
      })),
    })),
    timeline: { ...DEFAULT_TIMELINE, ...(overrides.timeline ?? {}) },
    ...(Array.isArray(overrides.smartActions) ? { smartActions: JSON.parse(JSON.stringify(overrides.smartActions)) as SmartBoneAction[] } : {}),
    ...(Array.isArray(overrides.smartActionFolders) ? { smartActionFolders: JSON.parse(JSON.stringify(overrides.smartActionFolders)) as SmartActionFolder[] } : {}),
    ...(overrides.actionLibrary !== undefined ? { actionLibrary: normalizeActionLibrary(overrides.actionLibrary) } : {}),
    ...(overrides.controllers !== undefined ? { controllers } : {}),
    ...(overrides.controllerInstances !== undefined ? { controllerInstances: normalizeControllerInstances(overrides.controllerInstances, new Set(controllers.map(item => item.id)), id) } : {}),
    ...(audio ? { audio } : {}),
    ...(overrides.lipSyncTracks !== undefined ? { lipSyncTracks } : {}),
    ...(overrides.metadata ? { metadata: { ...overrides.metadata } } : {}),
  };
}
