import type { Point2D } from './math';
import type { AffineMatrix, LayerData } from './model';
import type { Camera3DSettings } from './camera3d';
import { defaultCamera3D, normalizeCamera3D } from './camera3d';

/** Persisted stage controls for the optional 2.5D presentation pass. */
export interface Stage2DSettings {
  enabled: boolean;
  cameraX: number;
  cameraY: number;
  zoom: number;
  perspective: number;
  /** Camera orbit angles in degrees; artwork remains on depth-separated planes. */
  yaw: number;
  pitch: number;
  roll: number;
  projection: 'perspective' | 'orthographic';
  /** Optional true 3D camera; absent keeps the legacy 2.5D renderer. */
  camera3d?: Camera3DSettings;
}

export const DEFAULT_STAGE2D_SETTINGS: Stage2DSettings = {
  enabled: false,
  cameraX: 0,
  cameraY: 0,
  zoom: 1,
  perspective: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
    projection: 'perspective',
};

export const STAGE_VIEW_PRESETS = [
  { name: 'Front', yaw: 0, pitch: 0, roll: 0 },
  { name: 'Left −45°', yaw: -45, pitch: 0, roll: 0 },
  { name: 'Right +45°', yaw: 45, pitch: 0, roll: 0 },
  { name: 'Side 90°', yaw: 90, pitch: 0, roll: 0 },
  { name: 'Back 180°', yaw: 180, pitch: 0, roll: 0 },
  { name: 'Isometric', yaw: 45, pitch: 35, roll: 0 },
] as const;

const MIN_STAGE_SCALE = 0.1;
const MAX_STAGE_SCALE = 4;
const MAX_PERSPECTIVE = 0.8;
const MIN_LAYER_DEPTH = -1000;
const MAX_LAYER_DEPTH = 1000;
const MIN_LAYER_PARALLAX = 0;
const MAX_LAYER_PARALLAX = 4;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Normalize a layer depth while retaining the safe legacy default. */
export function normalizeLayerDepth(value: unknown): number {
  return clamp(finiteNumber(value, 0), MIN_LAYER_DEPTH, MAX_LAYER_DEPTH);
}

/** Normalize a layer parallax factor while retaining the safe legacy default. */
export function normalizeLayerParallax(value: unknown): number {
  return clamp(finiteNumber(value, 1), MIN_LAYER_PARALLAX, MAX_LAYER_PARALLAX);
}

/**
 * Normalize persisted stage data. Unknown, missing, and non-finite values are
 * ignored so projects written before stage2d was introduced remain valid.
 */
export function normalizeStage2DSettings(value: unknown): Stage2DSettings {
  const source = value && typeof value === 'object' ? value as Partial<Stage2DSettings> : {};
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_STAGE2D_SETTINGS.enabled,
    cameraX: finiteNumber(source.cameraX, DEFAULT_STAGE2D_SETTINGS.cameraX),
    cameraY: finiteNumber(source.cameraY, DEFAULT_STAGE2D_SETTINGS.cameraY),
    // A non-positive zoom cannot produce a useful stage. Keeping it in the
    // same range as the final scale also prevents malformed data from making
    // a subsequent camera operation non-finite.
    zoom: clamp(finiteNumber(source.zoom, DEFAULT_STAGE2D_SETTINGS.zoom), MIN_STAGE_SCALE, MAX_STAGE_SCALE),
    perspective: clamp(finiteNumber(source.perspective, DEFAULT_STAGE2D_SETTINGS.perspective), 0, MAX_PERSPECTIVE),
    yaw: clamp(finiteNumber(source.yaw, 0), -180, 180),
    pitch: clamp(finiteNumber(source.pitch, 0), -85, 85),
    roll: clamp(finiteNumber(source.roll, 0), -180, 180),
    projection: source.projection === 'orthographic' ? 'orthographic' : 'perspective',
    ...(source.camera3d && typeof source.camera3d === 'object' ? { camera3d: normalizeCamera3D(source.camera3d) } : {}),
  };
}

function layerDepth(layer: Pick<LayerData, 'depth'> | null | undefined): number {
  return normalizeLayerDepth(layer?.depth);
}

function layerParallax(layer: Pick<LayerData, 'parallax'> | null | undefined): number {
  return normalizeLayerParallax(layer?.parallax);
}

/** Rotate around Y, then X, then screen Z. Positive depth points toward the viewer. */
function viewBasis(settings: Stage2DSettings) {
  const yaw = settings.yaw * Math.PI / 180;
  const pitch = settings.pitch * Math.PI / 180;
  const roll = settings.roll * Math.PI / 180;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  return {
    a: cr * cy - sr * sp * sy,
    b: sr * cy + cr * sp * sy,
    c: -sr * cp,
    d: cr * cp,
    depthX: cr * sy + sr * sp * cy,
    depthY: sr * sy - cr * sp * cy,
    depthZ: cy * cp,
  };
}

/** Depth-plane distance along the view direction; used for scale and draw order. */
export function stageLayerCameraDepth(layer: Pick<LayerData, 'depth'>, stage: Stage2DSettings): number {
  const settings = normalizeStage2DSettings(stage);
  return settings.enabled ? layerDepth(layer) * viewBasis(settings).depthZ : layerDepth(layer);
}

/** Return the effective uniform scale for one staged layer. */
export function stageLayerScale(
  layer: Pick<LayerData, 'depth'> | null | undefined,
  stage: Stage2DSettings,
): number {
  const settings = normalizeStage2DSettings(stage);
  if (!settings.enabled) return 1;
  const depth = layerDepth(layer) * viewBasis(settings).depthZ;
  const scale = settings.zoom * (1 + (settings.projection === 'perspective' ? settings.perspective : 0) * depth / 1000);
  return Number.isFinite(scale) ? clamp(scale, MIN_STAGE_SCALE, MAX_STAGE_SCALE) : 1;
}

/**
 * Render-space offset includes pan/parallax and the depth-plane displacement
 * produced by yaw/pitch. At zero angles this is the original pan-only behavior.
 */
export function stageLayerOffset(
  layer: Pick<LayerData, 'depth' | 'parallax'> | null | undefined,
  stage: Stage2DSettings,
): Point2D {
  const settings = normalizeStage2DSettings(stage);
  if (!settings.enabled) return { x: 0, y: 0 };
  const parallax = settings.projection === 'orthographic' ? 1 : layerParallax(layer);
  const basis = viewBasis(settings);
  const scale = stageLayerScale(layer, settings);
  const depth = layerDepth(layer);
  const x = settings.cameraX * parallax + scale * basis.depthX * depth;
  const y = settings.cameraY * parallax + scale * basis.depthY * depth;
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

/** Minimal canvas surface needed by applyStage2DTransform (easy to use in tests). */
export interface Stage2DTransformContext {
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
}

/** Shared affine projection for canvas, skinned meshes, SVG and PNG export. */
export function stageLayerTransform(
  layer: Pick<LayerData, 'depth' | 'parallax'>,
  stage: Stage2DSettings,
  canvasCenter: Point2D,
): AffineMatrix {
  const settings = normalizeStage2DSettings(stage);
  if (!settings.enabled) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const basis = viewBasis(settings);
  const scale = stageLayerScale(layer, settings);
  const offset = stageLayerOffset(layer, settings);
  const centerX = finiteNumber(canvasCenter?.x, 0), centerY = finiteNumber(canvasCenter?.y, 0);
  const a = basis.a * scale, b = basis.b * scale, c = basis.c * scale, d = basis.d * scale;
  return { a, b, c, d, e: centerX + offset.x - a * centerX - c * centerY, f: centerY + offset.y - b * centerX - d * centerY };
}

/** Painter ordering for flat planes, with authored zIndex breaking depth ties. */
export function stageRenderLayers<T extends Pick<LayerData, 'depth' | 'zIndex'> & { renderOrder?: number }>(layers: T[], stage: Stage2DSettings): T[] {
  const settings = normalizeStage2DSettings(stage);
  return layers.map((layer, index) => ({ layer, index, depth: stageLayerCameraDepth(layer, settings) }))
     .sort((a, b) => (settings.enabled ? a.depth - b.depth : 0) || (a.layer.renderOrder ?? a.layer.zIndex) - (b.layer.renderOrder ?? b.layer.zIndex) || a.index - b.index)
    .map(item => item.layer);
}

/**
 * Apply the stage pass around a canvas-space center. Call this before a
 * layer's existing world transform; it does not mutate the layer or its mesh.
 */
export function applyStage2DTransform(
  ctx: Stage2DTransformContext,
  layer: Pick<LayerData, 'depth' | 'parallax'>,
  stage: Stage2DSettings,
  canvasCenter: Point2D,
): void {
  const settings = normalizeStage2DSettings(stage);
  if (!settings.enabled) return;
  const matrix = stageLayerTransform(layer, settings, canvasCenter);
  ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
}

/** Update a rig's stage settings without exposing an unnormalized patch. */
export function setStage2D(
  rig: { stage2d?: Stage2DSettings },
  patch: Partial<Stage2DSettings> = {},
): Stage2DSettings {
  const next = normalizeStage2DSettings({ ...normalizeStage2DSettings(rig.stage2d), ...patch });
  rig.stage2d = next;
  return { ...next };
}
