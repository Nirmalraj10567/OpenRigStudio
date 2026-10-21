import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  Bone as BoneIcon,
  Box,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  Film,
  FolderOpen,
  FolderPlus,
  Gamepad2,
  Grid3X3,
  Globe2,
  Hand,
  Layers3,
  KeyRound,
  Link2,
  Lock,
  Maximize2,
  Minus,
  MousePointer2,
  Move,
  Pencil,
  Paintbrush,
  Palette,
  Sparkles,
  Plus,
  Redo2,
  Route,
  Save,
  Scan,
  Search,
  ScanFace,
  ScanLine,
  SlidersHorizontal,
  Settings2,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Bone, Group, Layer, VectorLayer } from '../engine/Rig';
import { Rig } from '../engine/Rig';
import { createDemoRig } from '../engine/demoRig';
import { createDeformationDemo } from '../engine/deformationDemo';
import { createStageDemo } from '../engine/stageDemo';
import { activeCameraId, sampledCamera } from '../engine/camera';
import { updateLiveCamera } from '../engine/cameraProduction';
import { applyEuler, defaultCamera3D, normalizeTransform3D } from '../engine/camera3d';
import { project3DPoint } from '../engine/camera3d';
import type { Transform3D } from '../engine/camera3d';
import { drawMeshLayer } from '../engine/meshRenderer';
import type { VectorShape } from '../engine/model';
import { BRUSH_PRESETS, DEFAULT_BRUSH, createBrushShapes } from '../engine/brushes';
import type { BrushPoint, BrushSettings } from '../engine/brushes';
import { importObject3D, generateLayer3D, updateLayer3D } from '../engine/scene3d';
import { worldToLocalPoint } from '../engine/math';
import { createLayerGroup, descendantsOfGroup, groupChildrenInOrder, keyGroupProperty, removeLayerGroup, reparentLayerItem, setGroupIsolation, updateLayerGroup } from '../engine/layerGroups';
import type { GroupBlendMode } from '../engine/model';
import { renderCompositedCanvas } from '../engine/compositor';
import { layer3DPoint } from '../engine/render3d';
import { addGroupMask, groupMasks, moveGroupMask, removeGroupMask, updateGroupMask, keyCompositing } from '../engine/masking';
import { projectToSVG, downloadPNG } from '../engine/export';
import { deserializeProject } from '../engine/serialization';
import { applyStage2DTransform, stageRenderLayers, STAGE_VIEW_PRESETS } from '../engine/stage2d';
import type { Stage2DSettings } from '../engine/stage2d';
import { fitEditorViewport, zoomEditorViewportAtPoint } from '../engine/viewport';
import { useProject } from '../state/projectStore';
import { drawBoneOverlay, drawSmartActionGuide, poseChainIds } from './boneOverlay';
import { drawMeshOverlay, hasMeshWeights, hitMesh } from './meshOverlay';
import { drawDynamicsOverlay } from './dynamicsOverlay';
import { MeshPanel } from './MeshPanel';
import { SmartActionsPanel } from './SmartActionsPanel';
import { LipSyncPanel } from './LipSyncPanel';
import { ControllersPanel } from './ControllersPanel';
import { BrushPanel, type DrawMode } from './BrushPanel';
import { AssetLibraryPanel } from './AssetLibraryPanel';
import { HandRigPanel } from './HandRigPanel';
import { StylePanel } from './StylePanel';
import { MotionImportPanel } from './MotionImportPanel';
import { Timeline } from './Timeline';
import { renderOnionSkin } from './onionSkinRenderer';
import { OnionSkinPanel } from './OnionSkinPanel';
import { AssetStorePanel } from './AssetStorePanel';
import { useAudioPlayback } from './useAudioPlayback';
import { CharacterStudioPanel } from './CharacterStudioPanel';
import { addStudioCharacter } from '../engine/characterStudio';
import type { CharacterDesign } from '../engine/characterStudio';
import { prepareCharacterStudioImport } from '../engine/characterImport';
import { addDesignedProp, createPropRig } from '../engine/propsToolkit';
import type { PropDesign } from '../engine/propsToolkit';
import { addVillageScene } from '../engine/villageScene';
import type { AlignmentCommand, AlignmentTarget } from '../engine/alignment';
import { JoystickControlWorkspace } from './JoystickControlWorkspace';
import { MotionTrackingPanel } from './MotionTrackingPanel';
import { EnvironmentWorkspace } from './EnvironmentWorkspace';
import { attachEnvironmentPayload, isEnvironmentProjectPayload } from './environmentData';
import type { EnvironmentAssetDefinition } from './environmentData';
import { AutoRigPanel } from './AutoRigPanel';
import { BoneMappingBoard } from './BoneMappingBoard';
import { createCharacterControllerDefinition } from '../engine/controllerTemplates';
import { DockTabs, DockResizeHandle, DockingToolbar, defaultDockLayout, readDockLayout, writeDockLayout } from './DockingSystem';
import type { DockLayoutState, DockTabDefinition } from './DockingSystem';

type StudioTool = 'select' | 'bone' | 'bind' | 'ik' | 'draw' | 'hand' | 'mesh' | 'weight' | 'camera' | 'path';
type WorkspaceMode = 'environment' | 'character' | 'rigging' | 'deformation' | 'animation';
type DockTabId = 'rig' | 'assets' | 'brushes' | 'facial' | 'head' | 'constraints' | 'dynamics' | 'controllers' | 'joystick' | 'tracking' | 'style' | 'stage' | 'motion' | 'camera' | 'views' | 'onion';
const DOCK_TAB_IDS: readonly DockTabId[] = ['rig', 'assets', 'brushes', 'facial', 'head', 'constraints', 'controllers', 'joystick', 'tracking', 'dynamics', 'style', 'stage', 'motion', 'camera', 'onion', 'views'];
type Point = { x: number; y: number };
const STAGE_WIDTH = 800;
const STAGE_HEIGHT = 520;
function dockTabDefinitions(): DockTabDefinition<DockTabId>[] {
  return [
    { id: 'rig', label: 'Rig & animate', icon: <BoneIcon size={14} /> },
    { id: 'assets', label: 'Assets', icon: <Sparkles size={14} /> },
    { id: 'brushes', label: 'Brushes', icon: <Pencil size={14} /> },
    { id: 'facial', label: 'Facial', icon: <ScanFace size={14} /> },
    { id: 'head', label: 'Head Creator', icon: <CircleDot size={14} /> },
    { id: 'constraints', label: 'Constraints', icon: <Settings2 size={14} /> },
    { id: 'controllers', label: 'Controllers', icon: <Gamepad2 size={14} /> },
    { id: 'joystick', label: 'Joystick', icon: <Gamepad2 size={14} /> },
    { id: 'tracking', label: 'Motion Tracking', icon: <ScanLine size={14} /> },
    { id: 'dynamics', label: 'Dynamics', icon: <Settings2 size={14} /> },
    { id: 'style', label: 'Style', icon: <Palette size={14} /> },
    { id: 'stage', label: 'Stage', icon: <Move size={14} /> },
    { id: 'motion', label: '3D Motion', icon: <Box size={14} /> },
    { id: 'camera', label: 'Camera', icon: <Camera size={14} /> },
    { id: 'onion', label: 'Onion Skin', icon: <Layers3 size={14} /> },
    { id: 'views', label: 'Character views', icon: <CircleDot size={14} /> },
  ];
}
const CharacterViewsPanel = lazy(() => import('./CharacterViewsPanel').then(module => ({ default: module.CharacterViewsPanel })));
const CameraPanel = lazy(() => import('./CameraPanel').then(module => ({ default: module.CameraPanel })));
const VideoExportDialog = lazy(() => import('./VideoExportDialog').then(module => ({ default: module.VideoExportDialog })));
const FacialAnimationPanel = lazy(() => import('./FacialAnimationPanel').then(module => ({ default: module.FacialAnimationPanel })));
const HeadCreatorPanel = lazy(() => import('./HeadCreatorPanel').then(module => ({ default: module.HeadCreatorPanel })));
const ConstraintsPanel = lazy(() => import('./ConstraintsPanel').then(module => ({ default: module.ConstraintsPanel })));
const DynamicsPanel = lazy(() => import('./DynamicsPanel').then(module => ({ default: module.DynamicsPanel })));
const PropsToolkit = lazy(() => import('./PropsToolkit').then(module => ({ default: module.PropsToolkit })));


function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawVectorShape(ctx: CanvasRenderingContext2D, shape: VectorShape) {
  ctx.save();
  ctx.globalAlpha *= shape.opacity ?? 1;
  ctx.fillStyle = shape.fill ?? 'transparent';
  ctx.strokeStyle = shape.stroke ?? '#69b7ff';
  ctx.lineWidth = shape.strokeWidth ?? 1;
  ctx.lineCap = shape.lineCap ?? 'butt';
  ctx.lineJoin = shape.lineJoin ?? 'miter';
  ctx.setLineDash(shape.lineDash ?? []);
  if (shape.kind === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(shape.x ?? 0, shape.y ?? 0, shape.radiusX ?? 1, shape.radiusY ?? 1, 0, 0, Math.PI * 2);
    if (shape.fill && shape.fill !== 'none') ctx.fill();
    if (shape.stroke && shape.stroke !== 'none') ctx.stroke();
  } else if (shape.kind === 'path') {
    const path = new Path2D(shape.d ?? '');
    if (shape.fill && shape.fill !== 'none') ctx.fill(path);
    if (shape.stroke && shape.stroke !== 'none') ctx.stroke(path);
  } else if (shape.kind === 'polygon') {
    ctx.beginPath();
    (shape.points ?? []).forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.closePath();
    if (shape.fill && shape.fill !== 'none') ctx.fill();
    if (shape.stroke && shape.stroke !== 'none') ctx.stroke();
  } else {
    const x = shape.x ?? 0;
    const y = shape.y ?? 0;
    const width = shape.width ?? 0;
    const height = shape.height ?? 0;
    if (shape.fill && shape.fill !== 'none') ctx.fillRect(x, y, width, height);
    if (shape.stroke && shape.stroke !== 'none') ctx.strokeRect(x, y, width, height);
  }
  ctx.restore();
}

function clipVectorShape(ctx: CanvasRenderingContext2D, shape: VectorShape) {
  if (shape.kind === 'ellipse') {
    ctx.ellipse(shape.x ?? 0, shape.y ?? 0, Math.abs(shape.radiusX ?? 1), Math.abs(shape.radiusY ?? 1), 0, 0, Math.PI * 2);
  } else if (shape.kind === 'polygon') {
    (shape.points ?? []).forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.closePath();
  } else if (shape.kind === 'path') {
    // Keep clipping portable across browsers; vector path artwork still renders
    // normally, while its rectangular layer bounds provide the clip fallback.
    ctx.rect(shape.x ?? -1000, shape.y ?? -1000, shape.width ?? 2000, shape.height ?? 2000);
  } else {
    ctx.rect(shape.x ?? 0, shape.y ?? 0, shape.width ?? 0, shape.height ?? 0);
  }
}

function drawGroupClip(ctx: CanvasRenderingContext2D, rig: Rig, layerId: string) {
  const clips = rig.getGroupClipLayers(layerId).filter(clip => clip.id !== layerId);
  if (!clips.length) return;
  ctx.beginPath();
  clips.forEach(clip => {
    ctx.save();
    ctx.translate(clip.world.x, clip.world.y); ctx.rotate(clip.world.rotation); ctx.scale(clip.world.scaleX, clip.world.scaleY);
    if (clip.type === 'vector') clip.shapes.forEach(shape => clipVectorShape(ctx, shape));
    else ctx.rect(-clip.width / 2, -clip.height / 2, clip.width, clip.height);
    ctx.restore();
  });
  ctx.clip();
}

function drawConstraintOverlay(ctx: CanvasRenderingContext2D, rig: Rig, zoom: number) {
  if (!rig.constraintDebugVisible) return;
  rig.constraintDebug.forEach((debug) => {
    const source = debug.currentPoint ?? rig.bones.get(debug.sourceBoneId)?.world;
    if (!source) return;
    const target = debug.targetPoint;
    ctx.save();
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeStyle = debug.active ? '#f3a85f' : 'rgba(148,163,184,.55)';
    ctx.fillStyle = debug.active ? '#f3a85f' : '#94a3b8';
    if (target) {
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      ctx.beginPath(); ctx.moveTo(source.x, source.y); ctx.lineTo(target.x, target.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(target.x, target.y, 5 / zoom, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(target.x, target.y, 2 / zoom, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(source.x, source.y, 4 / zoom, 0, Math.PI * 2); ctx.stroke();
    if (debug.desiredAngle !== undefined) {
      ctx.beginPath(); ctx.moveTo(source.x, source.y); ctx.lineTo(source.x + Math.cos(debug.desiredAngle) * 28, source.y + Math.sin(debug.desiredAngle) * 28); ctx.stroke();
    }
    if (debug.limitAngles) {
      const length = 34;
      ctx.strokeStyle = '#f3bd76';
      ctx.beginPath(); ctx.moveTo(source.x, source.y); ctx.lineTo(source.x + Math.cos(debug.limitAngles.min) * length, source.y + Math.sin(debug.limitAngles.min) * length); ctx.stroke();
      ctx.strokeStyle = '#6be0be';
      ctx.beginPath(); ctx.moveTo(source.x, source.y); ctx.lineTo(source.x + Math.cos(debug.limitAngles.max) * length, source.y + Math.sin(debug.limitAngles.max) * length); ctx.stroke();
      ctx.strokeStyle = 'rgba(243,189,118,.35)';
      ctx.beginPath(); ctx.arc(source.x, source.y, length * .72, debug.limitAngles.min, debug.limitAngles.max); ctx.stroke();
    }
    ctx.restore();
  });
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function vectorBounds(layer: VectorLayer) {
  const points: Point[] = [];
  layer.shapes.forEach((shape) => {
    if (shape.kind === 'ellipse') {
      const x = shape.x ?? 0;
      const y = shape.y ?? 0;
      const rx = Math.abs(shape.radiusX ?? 1);
      const ry = Math.abs(shape.radiusY ?? 1);
      points.push({ x: x - rx, y: y - ry }, { x: x + rx, y: y + ry });
    } else if (shape.kind === 'polygon') {
      points.push(...(shape.points ?? []));
    } else if (shape.kind === 'path') {
      // The editor's paths use SVG coordinates. A numeric bounding box is a
      // useful hit region even for imported paths whose command set is mixed.
      const numbers = (shape.d ?? '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
      for (let index = 0; index + 1 < numbers.length; index += 2) points.push({ x: numbers[index], y: numbers[index + 1] });
    } else {
      const x = shape.x ?? 0;
      const y = shape.y ?? 0;
      const width = shape.width ?? 0;
      const height = shape.height ?? 0;
      points.push({ x, y }, { x: x + width, y: y + height });
    }
  });
  if (!points.length) return { minX: -90, minY: -90, maxX: 90, maxY: 90 };
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function drawBindingGuide(ctx: CanvasRenderingContext2D, source: Layer | undefined, bone: Bone | undefined, zoom: number, mapped: boolean) {
  if (!source || !bone) return;
  ctx.save();
  ctx.strokeStyle = mapped ? '#ffc66c' : '#69d6ff';
  ctx.fillStyle = mapped ? '#ffc66c' : '#69d6ff';
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([7 / zoom, 5 / zoom]);
  ctx.beginPath(); ctx.moveTo(source.world.x, source.world.y); ctx.lineTo(bone.world.x, bone.world.y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(source.world.x, source.world.y, 6 / zoom, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(bone.world.x, bone.world.y, 7 / zoom, 0, Math.PI * 2); ctx.stroke();
  ctx.font = `${Math.max(9, 11 / zoom)}px Inter, system-ui, sans-serif`;
  ctx.fillText(mapped ? 'MAPPED' : 'TARGET BONE', bone.world.x + 10 / zoom, bone.world.y - 8 / zoom);
  ctx.restore();
}

type RotationAxis = 'x' | 'y' | 'z';
type RotationGizmoGeometry = {
  center: Point;
  axes: Record<RotationAxis, Point>;
  rings: Record<RotationAxis, number>;
};

type CameraGuideAxis = 'yaw' | 'pitch' | 'roll';
type CameraGuideGeometry = {
  center: Point;
  rings: Record<CameraGuideAxis, number>;
};

type CameraOrientationGeometry = {
  center: Point;
  axes: Record<RotationAxis, Point>;
};

function cameraGuideGeometry(zoom: number): CameraGuideGeometry {
  return {
    center: { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 },
    rings: {
      yaw: 84 / Math.max(.01, zoom),
      pitch: 62 / Math.max(.01, zoom),
      roll: 40 / Math.max(.01, zoom),
    },
  };
}

function cameraGuideHit(point: Point, geometry: CameraGuideGeometry): CameraGuideAxis | null {
  const distance = Math.hypot(point.x - geometry.center.x, point.y - geometry.center.y);
  const candidates = (Object.keys(geometry.rings) as CameraGuideAxis[])
    .map(axis => ({ axis, distance: Math.abs(distance - geometry.rings[axis]) }))
    .sort((left, right) => left.distance - right.distance);
  return candidates[0] && candidates[0].distance <= 10 ? candidates[0].axis : null;
}

function cameraOrientationGeometry(stage: Stage2DSettings, zoom: number): CameraOrientationGeometry {
  const center = { x: STAGE_WIDTH - 66 / Math.max(.01, zoom), y: 66 / Math.max(.01, zoom) };
  const rotation = stage.camera3d?.rotation ?? { x: 0, y: 0, z: 0 };
  const length = 27 / Math.max(.01, zoom);
  const projectAxis = (axis: RotationAxis): Point => {
    const vector = applyEuler(axis === 'x' ? { x: 1, y: 0, z: 0 } : axis === 'y' ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 }, rotation);
    return { x: center.x + vector.x * length, y: center.y - vector.y * length };
  };
  return { center, axes: { x: projectAxis('x'), y: projectAxis('y'), z: projectAxis('z') } };
}

function cameraOrientationHit(point: Point, geometry: CameraOrientationGeometry): RotationAxis | null {
  const candidates = (Object.keys(geometry.axes) as RotationAxis[])
    .map(axis => ({ axis, distance: Math.hypot(point.x - geometry.axes[axis].x, point.y - geometry.axes[axis].y) }))
    .sort((left, right) => left.distance - right.distance);
  return candidates[0] && candidates[0].distance <= 12 ? candidates[0].axis : null;
}

function drawCameraRotationGuide(ctx: CanvasRenderingContext2D, geometry: CameraGuideGeometry, zoom: number, stage: Stage2DSettings, hasPreparedViews: boolean) {
  const colors: Record<CameraGuideAxis, string> = { yaw: '#69d6a1', pitch: '#ec777d', roll: '#6faeff' };
  const labels: Record<CameraGuideAxis, string> = { yaw: 'Y · YAW', pitch: 'X · PITCH', roll: 'Z · ROLL' };
  ctx.save();
  ctx.lineWidth = 1.5 / zoom;
  (Object.keys(geometry.rings) as CameraGuideAxis[]).forEach(axis => {
    ctx.strokeStyle = colors[axis];
    ctx.globalAlpha = axis === 'roll' ? .95 : .7;
    ctx.setLineDash(axis === 'roll' ? [] : [7 / zoom, 4 / zoom]);
    ctx.beginPath();
    ctx.arc(geometry.center.x, geometry.center.y, geometry.rings[axis], 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.globalAlpha = .92;
  ctx.strokeStyle = '#c9e8e1';
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  ctx.moveTo(geometry.center.x - 13 / zoom, geometry.center.y);
  ctx.lineTo(geometry.center.x + 13 / zoom, geometry.center.y);
  ctx.moveTo(geometry.center.x, geometry.center.y - 13 / zoom);
  ctx.lineTo(geometry.center.x, geometry.center.y + 13 / zoom);
  ctx.stroke();
  ctx.fillStyle = '#d9f6ed';
  ctx.beginPath(); ctx.arc(geometry.center.x, geometry.center.y, 3.5 / zoom, 0, Math.PI * 2); ctx.fill();
  ctx.font = `700 ${9 / zoom}px DM Mono, monospace`;
  (Object.keys(geometry.rings) as CameraGuideAxis[]).forEach(axis => {
    const ring = geometry.rings[axis];
    ctx.fillStyle = colors[axis];
    const position = axis === 'yaw'
      ? { x: geometry.center.x + ring + 7 / zoom, y: geometry.center.y - 4 / zoom }
      : axis === 'pitch'
        ? { x: geometry.center.x - ring - 64 / zoom, y: geometry.center.y - 4 / zoom }
        : { x: geometry.center.x - 28 / zoom, y: geometry.center.y - ring - 8 / zoom };
    ctx.fillText(labels[axis], position.x, position.y);
  });
  ctx.fillStyle = '#b7d4d1';
  ctx.font = `700 ${9 / zoom}px Inter, sans-serif`;
  ctx.fillText('FULL SCENE · CAMERA ORBIT', geometry.center.x - 73 / zoom, geometry.center.y + geometry.rings.yaw + 19 / zoom);
  ctx.fillStyle = '#6e8b91';
  ctx.font = `${8 / zoom}px Inter, sans-serif`;
  ctx.fillText(stage.camera3d?.enabled ? 'TRUE 3D · XYZ EULER' : hasPreparedViews ? '2.5D · MULTI-ANGLE' : 'FLAT 2D · ADD VIEW SET', geometry.center.x - 48 / zoom, geometry.center.y + geometry.rings.yaw + 31 / zoom);
  ctx.restore();
}

function drawCameraOrientationGizmo(ctx: CanvasRenderingContext2D, geometry: CameraOrientationGeometry, zoom: number, true3d: boolean) {
  const colors: Record<RotationAxis, string> = { x: '#ec777d', y: '#69d6a1', z: '#6faeff' };
  ctx.save();
  ctx.globalAlpha = .96;
  ctx.fillStyle = 'rgba(15, 21, 26, .82)';
  ctx.strokeStyle = '#4a6068';
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath(); ctx.arc(geometry.center.x, geometry.center.y, 34 / zoom, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  (Object.keys(geometry.axes) as RotationAxis[]).forEach(axis => {
    const end = geometry.axes[axis];
    const dx = end.x - geometry.center.x;
    const dy = end.y - geometry.center.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    ctx.strokeStyle = colors[axis];
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath(); ctx.moveTo(geometry.center.x, geometry.center.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    ctx.fillStyle = colors[axis];
    ctx.beginPath(); ctx.arc(end.x, end.y, 4 / zoom, 0, Math.PI * 2); ctx.fill();
    ctx.font = `700 ${9 / zoom}px DM Mono, monospace`;
    ctx.fillText(axis.toUpperCase(), end.x + ux * 7 / zoom - 3 / zoom, end.y + uy * 7 / zoom + 3 / zoom);
  });
  ctx.fillStyle = '#e2f5f0';
  ctx.beginPath(); ctx.arc(geometry.center.x, geometry.center.y, 3 / zoom, 0, Math.PI * 2); ctx.fill();
  ctx.font = `700 ${8 / zoom}px Inter, sans-serif`;
  ctx.fillStyle = '#aec8c8';
  ctx.fillText(true3d ? 'CAMERA XYZ' : 'CAMERA', geometry.center.x - 27 / zoom, geometry.center.y + 48 / zoom);
  ctx.restore();
}

function drivePreparedViewsFromCamera(rig: Rig, stage: Stage2DSettings): number | null {
  const sets = rig.characterViews.filter(set => set.enabled && set.views.length > 1);
  if (!sets.length) return null;
  const angle = stage.camera3d?.enabled ? stage.camera3d.rotation.y : stage.yaw;
  sets.forEach(set => rig.characterAngleOverrides.set(set.id, { frame: rig.timeline.currentFrame, angle }));
  rig.update();
  return angle;
}

function drawMotionPathGuide(ctx: CanvasRenderingContext2D, points: Point[], zoom: number, active = false, draft = false) {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = draft ? '#ffd27a' : active ? '#f2b65f' : '#75bfc0';
  ctx.fillStyle = draft ? '#ffe2a5' : active ? '#ffd58a' : '#a1e0d7';
  ctx.lineWidth = (active || draft ? 2.5 : 1.5) / zoom;
  ctx.setLineDash(draft ? [7 / zoom, 5 / zoom] : [5 / zoom, 4 / zoom]);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
  ctx.stroke();
  ctx.setLineDash([]);
  points.forEach((point, index) => {
    if (index !== 0 && index !== points.length - 1 && index % 4 !== 0) return;
    ctx.beginPath(); ctx.arc(point.x, point.y, (index === 0 || index === points.length - 1 ? 4 : 2.5) / zoom, 0, Math.PI * 2); ctx.fill();
  });
  ctx.font = `700 ${9 / zoom}px DM Mono, monospace`;
  ctx.fillText('START', points[0].x + 7 / zoom, points[0].y - 7 / zoom);
  ctx.fillText('END', points[points.length - 1].x + 7 / zoom, points[points.length - 1].y - 7 / zoom);
  ctx.restore();
}

function rotationGizmoGeometry(layer: Layer, stage: Stage2DSettings, zoom: number): RotationGizmoGeometry | null {
  const camera = stage.camera3d;
  if (!camera?.enabled) return null;
  const size = { width: STAGE_WIDTH, height: STAGE_HEIGHT };
  const project = (point: { x: number; y: number; z: number }): Point => {
    const world = layer3DPoint(layer, point, size);
    const projected = project3DPoint(world, camera, size, stage.zoom, { x: stage.cameraX, y: stage.cameraY });
    return { x: projected.x, y: projected.y };
  };
  const center = project({ x: 0, y: 0, z: 0 });
  const axisLength = 56 / Math.max(.01, zoom);
  return {
    center,
    axes: {
      x: project({ x: axisLength, y: 0, z: 0 }),
      y: project({ x: 0, y: axisLength, z: 0 }),
      z: project({ x: 0, y: 0, z: axisLength }),
    },
    rings: { x: 58 / Math.max(.01, zoom), y: 45 / Math.max(.01, zoom), z: 32 / Math.max(.01, zoom) },
  };
}

function rotationGizmoHit(point: Point, geometry: RotationGizmoGeometry | null): RotationAxis | null {
  if (!geometry) return null;
  const distance = Math.hypot(point.x - geometry.center.x, point.y - geometry.center.y);
  const candidates = (Object.keys(geometry.rings) as RotationAxis[])
    .map(axis => ({ axis, distance: Math.abs(distance - geometry.rings[axis]) }))
    .sort((left, right) => left.distance - right.distance);
  return candidates[0] && candidates[0].distance <= 9 ? candidates[0].axis : null;
}

function drawRotationGizmo(ctx: CanvasRenderingContext2D, geometry: RotationGizmoGeometry, zoom: number) {
  const colors: Record<RotationAxis, string> = { x: '#ec777d', y: '#69d6a1', z: '#6faeff' };
  ctx.save();
  ctx.lineWidth = 2 / zoom;
  ctx.setLineDash([]);
  (Object.keys(geometry.rings) as RotationAxis[]).forEach(axis => {
    ctx.strokeStyle = colors[axis];
    ctx.globalAlpha = .9;
    ctx.beginPath();
    ctx.arc(geometry.center.x, geometry.center.y, geometry.rings[axis], 0, Math.PI * 2);
    ctx.stroke();
  });
  (Object.keys(geometry.axes) as RotationAxis[]).forEach(axis => {
    const end = geometry.axes[axis];
    const dx = end.x - geometry.center.x;
    const dy = end.y - geometry.center.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const arrow = 7 / zoom;
    ctx.strokeStyle = colors[axis];
    ctx.lineWidth = 2.5 / zoom;
    ctx.beginPath(); ctx.moveTo(geometry.center.x, geometry.center.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    ctx.fillStyle = colors[axis];
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - ux * arrow - uy * arrow * .65, end.y - uy * arrow + ux * arrow * .65);
    ctx.lineTo(end.x - ux * arrow + uy * arrow * .65, end.y - uy * arrow - ux * arrow * .65);
    ctx.closePath(); ctx.fill();
    ctx.font = `700 ${10 / zoom}px DM Mono, monospace`;
    ctx.fillText(axis.toUpperCase(), end.x + 5 / zoom, end.y + 4 / zoom);
  });
  ctx.fillStyle = '#e8f8f4';
  ctx.beginPath(); ctx.arc(geometry.center.x, geometry.center.y, 4 / zoom, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function downloadFile(name: string, type: string, contents: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importArtworkFile(file: File, onStatus: (message: string) => void) {
  if (useProject.getState().smartEdit) { onStatus('Capture or cancel the action edit before importing artwork'); return; }
  if (!file.type.startsWith('image/')) { onStatus('Choose an image file'); return; }
  const reader = new FileReader();
  reader.onerror = () => onStatus('Could not read the image');
  reader.onload = () => {
    const src = reader.result;
    if (typeof src !== 'string') return;
    const image = new Image();
    image.onerror = () => onStatus('Could not load the image');
    image.onload = () => {
      const state = useProject.getState();
      if (state.smartEdit) { onStatus('Capture or cancel the action edit before importing artwork'); return; }
      state.pause();
      const scale = Math.min(1, 240 / image.naturalWidth, 320 / image.naturalHeight);
      let id = '';
      state.updateProject(project => {
        id = project.addImage(file.name.replace(/\.[^/.]+$/, '') || 'Imported image', {
          src, width: image.naturalWidth * scale, height: image.naturalHeight * scale,
        });
      });
      state.select(id);
      onStatus(`Imported ${file.name} · Bind maps the entire layer`);
    };
    image.src = src;
  };
  reader.readAsDataURL(file);
}

function ToolButton({ icon, label, description, active, onClick, shortcut }: { icon: React.ReactNode; label: string; description?: string; active: boolean; onClick: () => void; shortcut: string }) {
  return (
    <button className={`tool-button ${active ? 'active' : ''}`} onClick={onClick} title={`${label} (${shortcut})`} aria-label={label}>
      <span className="tool-icon">{icon}</span>
      <span className="tool-copy"><strong>{label}</strong>{description && <small>{description}</small>}</span>
      <kbd>{shortcut}</kbd>
    </button>
  );
}

function CanvasStage({
  activeTool,
  onActivateTool,
  assets,
  onStatus,
  chainLength,
  bindSourceId,
  bindTargetId,
  onBindSource,
  onMapBone,
  motionPreviewActive,
  motionCameraTracking,
  brush,
  weightRadius,
  weightStrength,
  drawMode,
  drawFillEnabled,
  drawFillColor,
  onPathCreated,
  activeMotionPathId,
}: {
  activeTool: StudioTool;
  onActivateTool: (tool: StudioTool) => void;
  assets: Record<string, string>;
  onStatus: (message: string) => void;
  chainLength?: number;
  bindSourceId: string | null;
  bindTargetId: string | null;
  onBindSource: (id: string) => void;
  onMapBone: (id: string) => void;
  motionPreviewActive: boolean;
  motionCameraTracking: boolean;
  brush: BrushSettings;
  weightRadius: number;
  weightStrength: number;
  drawMode: DrawMode;
  drawFillEnabled: boolean;
  drawFillColor: string;
  onPathCreated: (points: Point[]) => void;
  activeMotionPathId: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadedAssets = useRef(new Map<string, HTMLImageElement>());
  const [assetVersion, setAssetVersion] = useState(0);
  const [showBones, setShowBones] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showNames, setShowNames] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [viewportMode, setViewportMode] = useState<'front' | 'side' | 'three-quarter' | 'back' | 'top'>('front');
  const [viewportNavigation, setViewportNavigation] = useState<'orbit' | null>(null);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const spaceHeld = useRef(false);
  const fitViewportRef = useRef<() => void>(() => undefined);
  const [draftEnd, setDraftEnd] = useState<Point | null>(null);
  const [pathDraft, setPathDraft] = useState<Point[] | null>(null);
  const [weightCursor, setWeightCursor] = useState<Point | null>(null);
  const drag = useRef<
    | { kind: 'pan'; pointer: Point; origin: Point }
      | { kind: 'camera'; pointer: Point; pose: Stage2DSettings; initialProject: ReturnType<Rig['toProject']>; moved: boolean }
      | { kind: 'viewport-orbit'; pointer: Point; pose: Stage2DSettings; initialProject: ReturnType<Rig['toProject']>; moved: boolean }
     | { kind: 'camera-rotate'; axis: CameraGuideAxis; center: Point; startAngle: number; startRotation: number; true3d: boolean; initialProject: ReturnType<Rig['toProject']>; moved: boolean }
     | { kind: 'path'; points: Point[] }
      | { kind: 'bone'; start: Point }
      | { kind: 'move'; id: string; ids: string[]; start: Point; worldOrigins: Record<string, Point>; initialProject: ReturnType<Rig['toProject']>; moved: boolean }
     | { kind: 'rotate3d'; id: string; axis: RotationAxis; center: Point; startAngle: number; startRotation: number; initialProject: ReturnType<Rig['toProject']>; moved: boolean }
     | { kind: 'ik'; id: string; offset: Point; start: Point; fk: boolean; initialProject: ReturnType<Rig['toProject']>; moved: boolean }
      | { kind: 'draw'; points: BrushPoint[] }
      | { kind: 'draw-shape'; start: Point; end: Point }
     | { kind: 'mesh'; id: string; index: number; start: Point; worldOrigin: Point; initialProject: ReturnType<Rig['toProject']>; moved: boolean }
     | { kind: 'weight'; id: string; boneId: string; initialProject: ReturnType<Rig['toProject']>; moved: boolean }
    | null
  >(null);
  const { rig, selectedId, selectedIds, select, toggleSelection, version, zoom, pause, meshVertex, meshInfluence, selectMeshVertex, smartEdit, cameraToolMode, cameraGuides, updateProject, onionSkin } = useProject();
  const stage2d = rig.getStageView();
  const viewedCamera = rig.cameras.find(camera => camera.id === activeCameraId(rig));
  useEffect(() => { drag.current = null; setDraftEnd(null); setPathDraft(null); setWeightCursor(null); }, [rig]);

  const importImageFile = (file: File) => {
    importArtworkFile(file, onStatus);
  };

  useEffect(() => {
    const sources = { ...assets };
    rig.layersInOrder.forEach((layer) => { if (layer.type === 'image' && layer.src) sources[layer.id] = layer.src; });
    Object.entries(sources).forEach(([id, source]) => {
      if (loadedAssets.current.get(id)?.getAttribute('src') === source) return;
      const image = new Image();
      image.onload = () => setAssetVersion((value) => value + 1);
      image.src = source;
      loadedAssets.current.set(id, image);
    });
  }, [assets, rig, version]);

  const screenToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - rect.width / 2 - pan.x) / zoom + STAGE_WIDTH / 2,
      y: (clientY - rect.top - rect.height / 2 - pan.y) / zoom + STAGE_HEIGHT / 2,
    };
  };

  const applyEditorViewport = (next: { pan: Point; zoom: number }) => {
    setPan(next.pan);
    useProject.setState({ zoom: next.zoom });
  };

  const zoomEditor = (factor: number, clientX?: number, clientY?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = {
      x: (clientX ?? rect.left + rect.width / 2) - (rect.left + rect.width / 2),
      y: (clientY ?? rect.top + rect.height / 2) - (rect.top + rect.height / 2),
    };
    applyEditorViewport(zoomEditorViewportAtPoint({ pan, zoom }, pointer, factor));
  };

  const fitViewport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const next = fitEditorViewport(rect.width, rect.height, STAGE_WIDTH, STAGE_HEIGHT);
    applyEditorViewport(next);
    onStatus(`Viewport fitted to full scene · ${Math.round(next.zoom * 100)}%`);
  };
  fitViewportRef.current = fitViewport;

  useEffect(() => {
    const isTextEntry = (target: EventTarget | null) => target instanceof HTMLElement
      && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    const keyDown = (event: KeyboardEvent) => {
      if (isTextEntry(event.target)) return;
      if (event.code === 'Space') {
        spaceHeld.current = true;
        event.preventDefault();
        return;
      }
      if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        fitViewportRef.current();
      }
    };
    const keyUp = (event: KeyboardEvent) => { if (event.code === 'Space') spaceHeld.current = false; };
    const blur = () => { spaceHeld.current = false; };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const pointerToBrushPoint = (event: ReactPointerEvent<HTMLCanvasElement>): BrushPoint => {
    const point = screenToWorld(event.clientX, event.clientY);
    // Browsers expose mouse pressure as .5 while active. Keep mouse drawing
    // near the selected size and reserve the full range for a stylus.
    const pressure = event.pointerType === 'pen' ? (event.pressure || .5) : .75;
    return { x: point.x, y: point.y, pressure, tiltX: event.tiltX, tiltY: event.tiltY };
  };

  const hitTest = (point: Point) => {
    // Bones are drawn above artwork, and reverse iteration makes the last
    // painted item the first hit. The old forEach implementation overwrote a
    // topmost hit with every lower item.
    const boneThreshold = 8 / zoom;
    for (const bone of showBones && activeTool !== 'mesh' ? [...rig.bones.values()].reverse() : []) {
      const end = rig.getBoneEnd(bone.id);
      if (end && distanceToSegment(point, { x: bone.world.x, y: bone.world.y }, end) < boneThreshold) return bone.id;
    }
    for (const layer of [...rig.layersInOrder].sort((left, right) => right.zIndex - left.zIndex)) {
      if (!layer.visible || rig.getLayerOpacity(layer.id) <= 0) continue;
      if (layer.mesh) { if (hitMesh(rig, layer, point)) return layer.id; continue; }
      const local = worldToLocalPoint(layer.world, point);
      if (!local) continue;
      if (layer.type === 'image') {
        if (Math.abs(local.x) <= Math.abs(layer.width) / 2 && Math.abs(local.y) <= Math.abs(layer.height) / 2) return layer.id;
      } else {
        const bounds = vectorBounds(layer);
        const padding = Math.max(...layer.shapes.map((shape) => shape.strokeWidth ?? 0), 2);
        if (local.x >= bounds.minX - padding && local.x <= bounds.maxX + padding && local.y >= bounds.minY - padding && local.y <= bounds.maxY + padding) return layer.id;
      }
    }
    return null;
  };

  const hitBoneTip = (point: Point) => {
    if (!showBones) return null;
    const threshold = 9 / zoom;
    let nearest: { id: string; distance: number } | null = null;
    for (const bone of [...rig.bones.values()].reverse()) {
      const end = rig.getBoneEnd(bone.id);
      if (!end) continue;
      const distance = Math.hypot(point.x - end.x, point.y - end.y);
      if (distance <= threshold && (!nearest || distance < nearest.distance)) nearest = { id: bone.id, distance };
    }
    return nearest ? nearest.id : null;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#111318';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.save();
       ctx.translate(rect.width / 2 + pan.x, rect.height / 2 + pan.y);
       ctx.scale(zoom, zoom);
       ctx.translate(-STAGE_WIDTH / 2, -STAGE_HEIGHT / 2);

      ctx.shadowColor = 'rgba(0, 0, 0, .4)';
      ctx.shadowBlur = 28;
      ctx.fillStyle = '#20242d';
      ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#2a303a';
      ctx.lineWidth = 0.7 / zoom;
      if (showGrid) {
      for (let x = 0; x <= STAGE_WIDTH; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, STAGE_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y <= STAGE_HEIGHT; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(STAGE_WIDTH, y);
        ctx.stroke();
      }
      }
      ctx.strokeStyle = '#647084';
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
      ctx.setLineDash([]);
      ctx.strokeStyle = '#4a5364';
      ctx.beginPath();
      ctx.moveTo(STAGE_WIDTH / 2 - 10, STAGE_HEIGHT / 2);
      ctx.lineTo(STAGE_WIDTH / 2 + 10, STAGE_HEIGHT / 2);
      ctx.moveTo(STAGE_WIDTH / 2, STAGE_HEIGHT / 2 - 10);
      ctx.lineTo(STAGE_WIDTH / 2, STAGE_HEIGHT / 2 + 10);
      ctx.stroke();

        if (motionPreviewActive && motionCameraTracking) {
         const root = rig.getRoots()[0];
         if (root) ctx.translate(STAGE_WIDTH / 2 - root.world.x, STAGE_HEIGHT / 2 - root.world.y);
        }

        const onionExcludedLayers = renderOnionSkin(ctx, rig, loadedAssets.current, {
          settings: onionSkin,
          frame: rig.timeline.currentFrame,
          startFrame: rig.timeline.startFrame,
          endFrame: rig.timeline.endFrame,
          playing: rig.timeline.isPlaying,
          selectedId,
          showBones,
          stageWidth: STAGE_WIDTH,
          stageHeight: STAGE_HEIGHT,
        });

          const renderLayers = stageRenderLayers(rig.layersInOrder, stage2d);
       ctx.save();
       if (rig.cameraView !== 'preview' || activeTool === 'camera') {
         ctx.beginPath(); ctx.rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT); ctx.clip();
       }
         renderCompositedCanvas(ctx, rig, loadedAssets.current, { excludeLayerIds: onionExcludedLayers });
        const selectedLayers = renderLayers.filter(layer => selectedIds.includes(layer.id) && layer.visible);
         if (selectedLayers.length && !stage2d.enabled) {
          selectedLayers.forEach((selectedLayer) => {
            if (selectedLayer.mesh && selectedLayer.id === selectedId && activeTool !== 'mesh') drawMeshOverlay(ctx, rig, selectedLayer, zoom, null, null);
            else if (!selectedLayer.mesh) {
              ctx.save(); ctx.translate(selectedLayer.world.x, selectedLayer.world.y); ctx.rotate(selectedLayer.world.rotation); ctx.scale(selectedLayer.world.scaleX, selectedLayer.world.scaleY);
              const bounds = selectedLayer.type === 'image' ? { minX: -selectedLayer.width / 2, minY: -selectedLayer.height / 2, maxX: selectedLayer.width / 2, maxY: selectedLayer.height / 2 } : vectorBounds(selectedLayer);
              ctx.strokeStyle = selectedLayer.id === selectedId ? '#4c9fff' : '#67c9b7'; ctx.lineWidth = (selectedLayer.id === selectedId ? 2 : 1.25) / zoom; ctx.setLineDash(selectedLayer.id === selectedId ? [6, 4] : [3, 4]); ctx.strokeRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY); ctx.restore();
            }
           });
         }
         rig.motionPaths.filter(path => path.enabled && (!activeMotionPathId || path.id === activeMotionPathId)).forEach(path => drawMotionPathGuide(ctx, path.points, zoom, path.id === activeMotionPathId));
          if (pathDraft) drawMotionPathGuide(ctx, pathDraft, zoom, true, true);
         const gizmoLayer = selectedId ? renderLayers.find(layer => layer.id === selectedId && layer.visible) : undefined;
        if (gizmoLayer && activeTool === 'select' && stage2d.camera3d?.enabled) {
          const geometry = rotationGizmoGeometry(gizmoLayer, stage2d, zoom);
          if (geometry) drawRotationGizmo(ctx, geometry, zoom);
        }
        if (activeTool === 'camera' && cameraGuides && stage2d.enabled && rig.cameraView !== 'switch') {
          drawCameraRotationGuide(ctx, cameraGuideGeometry(zoom), zoom, stage2d, rig.characterViews.some(set => set.enabled && set.views.length > 1));
          drawCameraOrientationGizmo(ctx, cameraOrientationGeometry(stage2d, zoom), zoom, Boolean(stage2d.camera3d?.enabled));
        }
       ctx.restore();

       if (cameraGuides && (rig.cameraView !== 'preview' || activeTool === 'camera')) {
         ctx.save();
         ctx.strokeStyle = 'rgba(175,216,208,.5)'; ctx.lineWidth = 1 / zoom;
         ctx.strokeRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
         ctx.setLineDash([5 / zoom, 5 / zoom]);
         ctx.strokeRect(STAGE_WIDTH * .05, STAGE_HEIGHT * .05, STAGE_WIDTH * .9, STAGE_HEIGHT * .9);
         for (const portion of [1 / 3, 2 / 3]) {
           ctx.beginPath(); ctx.moveTo(STAGE_WIDTH * portion, 0); ctx.lineTo(STAGE_WIDTH * portion, STAGE_HEIGHT); ctx.stroke();
           ctx.beginPath(); ctx.moveTo(0, STAGE_HEIGHT * portion); ctx.lineTo(STAGE_WIDTH, STAGE_HEIGHT * portion); ctx.stroke();
         }
         ctx.restore();
        }
         drawConstraintOverlay(ctx, rig, zoom);
         drawDynamicsOverlay(ctx, rig, zoom);

       const mappedLayer = rig.layers.get(activeTool === 'bind' ? bindSourceId ?? '' : selectedId ?? '');
        if (showBones && !stage2d.enabled) drawBoneOverlay(ctx, rig, {
          zoom, selectedId, mappedId: bindTargetId ?? mappedLayer?.boundBoneId, names: showNames,
         pose: activeTool === 'ik', chainLength,
        });
         if (activeTool === 'bind' && bindSourceId) {
           const source = rig.layers.get(bindSourceId);
           const targetBone = source?.boundBoneId ? rig.bones.get(source.boundBoneId) : bindTargetId ? rig.bones.get(bindTargetId) : selectedId && rig.bones.has(selectedId) ? rig.bones.get(selectedId) : undefined;
           drawBindingGuide(ctx, source, targetBone, zoom, Boolean(source?.boundBoneId));
         }
         if (activeTool === 'weight' && weightCursor) {
           ctx.save();
           ctx.strokeStyle = meshInfluence ? '#ffd36b' : '#69d6ff';
           ctx.fillStyle = 'rgba(255,211,107,.08)';
           ctx.lineWidth = 1.5 / zoom;
           ctx.beginPath(); ctx.arc(weightCursor.x, weightCursor.y, weightRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
           ctx.beginPath(); ctx.moveTo(weightCursor.x - 5 / zoom, weightCursor.y); ctx.lineTo(weightCursor.x + 5 / zoom, weightCursor.y); ctx.moveTo(weightCursor.x, weightCursor.y - 5 / zoom); ctx.lineTo(weightCursor.x, weightCursor.y + 5 / zoom); ctx.stroke();
           ctx.font = `${Math.max(9, 11 / zoom)}px Inter, system-ui, sans-serif`;
           ctx.fillText(meshInfluence ? `Paint: ${rig.bones.get(meshInfluence)?.name ?? 'bone'}` : 'Choose an influence in Mesh & weights', weightCursor.x + weightRadius + 8 / zoom, weightCursor.y - 8 / zoom);
           ctx.restore();
         }
       if (showBones && !stage2d.enabled && selectedId && rig.smartActions.some(action => action.driverBoneId === selectedId)) drawSmartActionGuide(ctx, rig, rig.smartActions.find(action => action.driverBoneId === selectedId)?.id ?? null, zoom);
       const meshLayer = selectedId ? rig.layers.get(selectedId) : undefined;
        if (!stage2d.enabled && (activeTool === 'mesh' || activeTool === 'weight') && meshLayer?.visible && rig.getLayerOpacity(meshLayer.id) > 0) drawMeshOverlay(ctx, rig, meshLayer, zoom, meshVertex, meshInfluence);

       if (draftEnd && drag.current?.kind === 'bone') {
        const start = drag.current.start;
        ctx.strokeStyle = '#6eaefc';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(draftEnd.x, draftEnd.y);
        ctx.stroke();
         ctx.setLineDash([]);
       }
       if (draftEnd && drag.current?.kind === 'draw-shape') {
         const start = drag.current.start;
         const left = Math.min(start.x, draftEnd.x), top = Math.min(start.y, draftEnd.y);
         const width = Math.abs(draftEnd.x - start.x), height = Math.abs(draftEnd.y - start.y);
         drawVectorShape(ctx, drag.current.kind === 'draw-shape' && drawMode === 'ellipse'
           ? { id: 'draw-preview', kind: 'ellipse', x: (start.x + draftEnd.x) / 2, y: (start.y + draftEnd.y) / 2, radiusX: Math.max(1, width / 2), radiusY: Math.max(1, height / 2), fill: drawFillEnabled ? drawFillColor : 'none', stroke: brush.color, strokeWidth: Math.max(1, brush.size / 2), opacity: brush.opacity }
           : { id: 'draw-preview', kind: 'rect', x: left, y: top, width: Math.max(1, width), height: Math.max(1, height), fill: drawFillEnabled ? drawFillColor : 'none', stroke: brush.color, strokeWidth: Math.max(1, brush.size / 2), opacity: brush.opacity });
       }
      ctx.restore();
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
       }, [assets, assetVersion, bindTargetId, brush, drawFillColor, drawFillEnabled, drawMode, draftEnd, onionSkin, pan, pathDraft, rig, selectedId, selectedIds, version, zoom, showGrid, showBones, showNames, activeTool, chainLength, bindSourceId, meshVertex, meshInfluence, stage2d, motionPreviewActive, motionCameraTracking, cameraGuides, activeMotionPathId, weightCursor, weightRadius]);

  const finishBone = (point: Point) => {
    const current = drag.current;
    if (!current || current.kind !== 'bone') return;
    const distance = Math.hypot(point.x - current.start.x, point.y - current.start.y);
    if (distance > 15) {
      const width = rig.canvas.width || STAGE_WIDTH;
      const height = rig.canvas.height || STAGE_HEIGHT;
      const inside = (value: Point) => value.x >= 0 && value.y >= 0 && value.x <= width && value.y <= height;
      if (!inside(current.start) || !inside(point)) {
        onStatus('Keep both bone joints inside the stage border · select the character joint, then drag to its tip');
        return;
      }
      let id = '';
      useProject.getState().updateProject(project => {
        id = project.addBone(null, `Bone ${project.bones.size + 1}`, distance);
        const bone = project.bones.get(id)!;
        bone.local.x = current.start.x;
        bone.local.y = current.start.y;
        bone.local.rotation = Math.atan2(point.y - current.start.y, point.x - current.start.x);
        project.update();
        const parent = [...project.bones.values()]
          .filter(candidate => candidate.id !== id)
          .map(candidate => ({ candidate, end: project.getBoneEnd(candidate.id) }))
          .filter((item): item is { candidate: Bone; end: Point } => Boolean(item.end))
          .sort((left, right) => Math.hypot(left.end.x - current.start.x, left.end.y - current.start.y) - Math.hypot(right.end.x - current.start.x, right.end.y - current.start.y))[0];
        if (parent && Math.hypot(parent.end.x - current.start.x, parent.end.y - current.start.y) * zoom < 12) project.reparentBone(id, parent.candidate.id, true);
      });
      select(id);
      onStatus(`Created ${rig.bones.get(id)?.name}`);
    }
  };

  const beginViewportOrbit = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (motionPreviewActive) { onStatus('3D motion preview · Apply or Cancel before orbiting the viewport'); return; }
    if (smartEdit || rig.cameraView === 'switch') { onStatus('Select Preview or a custom camera to orbit the viewport'); return; }
    pause();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind: 'viewport-orbit', pointer: { x: event.clientX, y: event.clientY }, pose: { ...stage2d }, initialProject: rig.toProject(), moved: false };
    onStatus('Orbit view · drag to rotate the scene without changing artwork');
  };

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drag.current) return;
    const middleMousePan = event.button === 1 || event.button === 0 && spaceHeld.current;
    const orbitGesture = event.button === 2 || event.button === 0 && viewportNavigation === 'orbit';
    if (middleMousePan) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { kind: 'pan', pointer: { x: event.clientX, y: event.clientY }, origin: { ...pan } };
      onStatus('Pan view · artwork and bones stay in place');
      return;
    }
    if (orbitGesture) {
      beginViewportOrbit(event);
      return;
    }
    if (event.button !== 0) return;
    if (motionPreviewActive) { onStatus('3D motion preview · Apply or Cancel in the motion panel to edit the rig'); return; }
    if (activeTool === 'path') {
      if (smartEdit || stage2d.enabled) { onStatus('Disable Smart Edit and Stage preview before drawing a motion path'); return; }
      if (!selectedId) { onStatus('Select the character, bone, or artwork that should follow the path'); return; }
      pause();
      event.currentTarget.setPointerCapture(event.pointerId);
      const first = screenToWorld(event.clientX, event.clientY);
      drag.current = { kind: 'path', points: [first] };
      setPathDraft([first]);
      onStatus('Drawing motion path · release to save the guide');
      return;
    }
    if (activeTool === 'camera') {
      if (smartEdit || rig.cameraView === 'switch') { onStatus('Select Preview or a custom camera to operate camera tools'); return; }
      const cameraPoint = screenToWorld(event.clientX, event.clientY);
      pause();
      const pose = rig.cameraView === 'preview' ? stage2d : rig.cameraOverride?.id === rig.cameraView && rig.cameraOverride.frame === rig.timeline.currentFrame ? rig.cameraOverride.settings : sampledCamera(rig, rig.cameraView)?.settings ?? stage2d;
      if (cameraGuides && pose.enabled) {
        const geometry = cameraGuideGeometry(zoom);
        const axis = cameraGuideHit(cameraPoint, geometry);
        if (axis) {
          const true3d = Boolean(pose.camera3d?.enabled);
          const rotation = true3d ? pose.camera3d?.rotation[axis === 'yaw' ? 'y' : axis === 'pitch' ? 'x' : 'z'] ?? 0 : pose[axis];
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { kind: 'camera-rotate', axis, center: geometry.center, startAngle: Math.atan2(cameraPoint.y - geometry.center.y, cameraPoint.x - geometry.center.x), startRotation: rotation, true3d, initialProject: rig.toProject(), moved: false };
          onStatus(`Rotate full scene · ${axis.toUpperCase()} guide · drag around the camera orbit ring`);
          return;
        }
      }
      drag.current = { kind: 'camera', pointer: { x: event.clientX, y: event.clientY }, pose: { ...pose }, initialProject: rig.toProject(), moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
     if (activeTool === 'hand') {
       event.preventDefault();
       event.currentTarget.setPointerCapture(event.pointerId);
       drag.current = { kind: 'pan', pointer: { x: event.clientX, y: event.clientY }, origin: { ...pan } };
       onStatus('Pan view · artwork and bones stay in place');
       return;
     }
    const point = screenToWorld(event.clientX, event.clientY);
    if (activeTool === 'select' && stage2d.camera3d?.enabled && selectedId) {
      const layer = rig.layers.get(selectedId);
      const axis = layer ? rotationGizmoHit(point, rotationGizmoGeometry(layer, stage2d, zoom)) : null;
      if (layer && axis) {
        pause();
        const geometry = rotationGizmoGeometry(layer, stage2d, zoom);
        const center = geometry?.center ?? point;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { kind: 'rotate3d', id: layer.id, axis, center, startAngle: Math.atan2(point.y - center.y, point.x - center.x), startRotation: normalizeTransform3D(layer.transform3d).rotation[axis], initialProject: rig.toProject(), moved: false };
        onStatus(`Rotate ${axis.toUpperCase()} axis · drag around the guide`);
        return;
      }
    }
    if (stage2d.enabled) {
      onStatus('Camera / 2.5D view is read-only for artwork · select Preview and disable Stage preview to edit');
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (smartEdit && ['bone', 'bind', 'draw', 'ik', 'weight'].includes(activeTool)) { onStatus('Action edit: use Select, Mesh or Properties, then Capture or Cancel'); return; }
    if (activeTool === 'mesh') {
      const layer = selectedId ? rig.layers.get(selectedId) : undefined;
      const vertices = layer?.visible && rig.getLayerOpacity(layer.id) > 0 ? rig.getMeshVertices(layer.id) : [];
      const nearest = vertices.map((vertex, index) => ({ index, vertex, distance: Math.hypot(point.x - vertex.x, point.y - vertex.y) })).filter(item => item.distance * zoom <= 9).sort((a, b) => a.distance - b.distance)[0];
      if (layer && nearest) {
        selectMeshVertex(nearest.index);
        if (layer.locked) { onStatus('Unlock this artwork to edit its mesh'); return; }
        pause();
        drag.current = { kind: 'mesh', id: layer.id, index: nearest.index, start: point, worldOrigin: nearest.vertex, initialProject: rig.toProject(), moved: false };
        onStatus(`Vertex ${nearest.index} selected · Drag to reshape, or edit weights in the dock`);
      } else {
        const hit = hitTest(point);
        select(hit);
        selectMeshVertex(null);
        onStatus(hit ? 'Artwork selected · Create a mesh or click a vertex dot' : 'Mesh selection cleared');
      }
      return;
    }
    if (activeTool === 'weight') {
      setWeightCursor(point);
      const layer = selectedId ? rig.layers.get(selectedId) : undefined;
      const boneId = meshInfluence && rig.bones.has(meshInfluence) ? meshInfluence : null;
      if (!layer?.mesh) { onStatus('Create a mesh for the selected clothing layer before painting weights'); return; }
      if (!boneId) { onStatus('Choose a bone influence in Mesh & weights, then paint on the mesh'); return; }
      if (layer.locked) { onStatus('Unlock this artwork to paint its weights'); return; }
      pause();
      const initialProject = rig.toProject();
      const changed = rig.paintMeshWeights(layer.id, point, boneId, weightRadius, weightStrength, event.shiftKey);
      drag.current = { kind: 'weight', id: layer.id, boneId, initialProject, moved: changed };
      selectMeshVertex(null);
      useProject.setState(state => ({ version: state.version + 1 }));
      onStatus(`${event.shiftKey ? 'Erasing' : 'Painting'} ${rig.bones.get(boneId)?.name ?? 'bone'} weights · drag across the mesh`);
      return;
    }
    if (activeTool === 'bone') {
      pause();
      drag.current = { kind: 'bone', start: point };
      setDraftEnd(point);
      return;
    }
    if (activeTool === 'ik') {
      const hit = hitBoneTip(point) ?? hitTest(point);
      const boneId = hit && rig.bones.has(hit) ? hit : null;
      if (!boneId || rig.bones.get(boneId)?.locked) {
        onStatus(boneId ? 'Bone is locked — unlock it in the bone list' : 'Drag a bone shaft or tip to pose · Alt-drag rotates one bone');
        return;
      }
      pause();
      select(boneId);
      const tip = rig.getBoneEnd(boneId)!;
      drag.current = { kind: 'ik', id: boneId, start: point, offset: { x: tip.x - point.x, y: tip.y - point.y }, fk: event.altKey, initialProject: rig.toProject(), moved: false };
      return;
    }
    const hit = hitTest(point);
    if (activeTool === 'bind') {
      if (hit && rig.bones.has(hit)) {
        onMapBone(hit);
      } else if (hit && rig.layers.has(hit)) {
        onBindSource(hit);
        select(hit);
        onStatus(`Artwork selected: ${rig.layers.get(hit)?.name ?? 'layer'}; click a bone to bind`);
      } else if (!hit) {
        onStatus('Select artwork, then click a bone to bind');
      }
      return;
    }
    if (activeTool === 'draw') {
      pause();
      const start = screenToWorld(event.clientX, event.clientY);
      if (drawMode === 'brush') drag.current = { kind: 'draw', points: [pointerToBrushPoint(event)] };
      else { drag.current = { kind: 'draw-shape', start, end: start }; setDraftEnd(start); }
      return;
    }
    const modified = event.metaKey || event.ctrlKey || event.shiftKey;
    if (modified) {
      if (hit) toggleSelection(hit);
      else onStatus('Click an artwork layer or bone to add it to the selection');
      return;
    }
    const activeSelection = hit && selectedIds.includes(hit) ? selectedIds : hit ? [hit] : [];
    if (hit && !selectedIds.includes(hit)) select(hit);
    else if (!hit) select(null);
    const object = hit ? rig.layers.get(hit) ?? rig.bones.get(hit) : undefined;
    if (smartEdit && rig.smartActions.find(action => action.id === smartEdit.actionId)?.driverBoneId === hit) { onStatus('Driver angle is fixed while editing an action key'); return; }
    const movable = activeSelection.filter(id => {
      const item = rig.layers.get(id) ?? rig.bones.get(id);
      return Boolean(item && (!('locked' in item) || !item.locked));
    });
    if (hit && object && movable.length && (!('locked' in object) || !object.locked)) {
      pause();
      const worldOrigins = Object.fromEntries(movable.map(id => { const item = rig.layers.get(id) ?? rig.bones.get(id); return [id, { x: item!.world.x, y: item!.world.y }]; }));
      drag.current = {
        kind: 'move',
        id: hit,
        ids: movable,
        start: point,
        worldOrigins,
        initialProject: rig.toProject(),
        moved: false,
      };
    }
  };

  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activeTool === 'weight') setWeightCursor(screenToWorld(event.clientX, event.clientY));
    const current = drag.current;
    if (!current) return;
    if (current.kind === 'pan') {
      setPan({ x: current.origin.x + event.clientX - current.pointer.x, y: current.origin.y + event.clientY - current.pointer.y });
      return;
    }
    if (current.kind === 'viewport-orbit') {
      let dx = (event.clientX - current.pointer.x) * .3;
      let dy = (event.clientY - current.pointer.y) * .3;
      if (event.shiftKey) {
        dx = Math.round(dx / 5) * 5;
        dy = Math.round(dy / 5) * 5;
      }
      if (!current.moved && Math.hypot(dx, dy) < .5) return;
      const currentRotation = current.pose.camera3d?.rotation ?? defaultCamera3D().rotation;
      const nextYaw = current.pose.camera3d?.enabled ? currentRotation.y + dx : current.pose.yaw + dx;
      const nextPitch = current.pose.camera3d?.enabled ? currentRotation.x - dy : current.pose.pitch - dy;
      const patch: Partial<Stage2DSettings> = current.pose.camera3d?.enabled
        ? {
          camera3d: {
            ...(current.pose.camera3d ?? defaultCamera3D()),
            rotation: {
              ...(current.pose.camera3d ?? defaultCamera3D()).rotation,
              y: nextYaw,
              x: nextPitch,
            },
          },
        }
        : { yaw: nextYaw, pitch: nextPitch };
      useProject.getState().updateCamera(patch, true);
      drivePreparedViewsFromCamera(rig, rig.getStageView());
      current.moved = true;
      return;
    }
    if (current.kind === 'camera-rotate') {
      const angle = Math.atan2(screenToWorld(event.clientX, event.clientY).y - current.center.y, screenToWorld(event.clientX, event.clientY).x - current.center.x);
      let delta = (angle - current.startAngle) * 180 / Math.PI;
      if (event.shiftKey) delta = Math.round(delta / 5) * 5;
      if (!current.moved && Math.abs(delta) < .5) return;
      const patch: Partial<Stage2DSettings> = current.true3d
        ? { camera3d: { ...(rig.getStageView().camera3d ?? defaultCamera3D()), rotation: { ...(rig.getStageView().camera3d ?? defaultCamera3D()).rotation, ...(current.axis === 'yaw' ? { y: current.startRotation + delta } : current.axis === 'pitch' ? { x: current.startRotation + delta } : { z: current.startRotation + delta }) } } }
        : { [current.axis]: current.startRotation + delta } as Partial<Stage2DSettings>;
      useProject.getState().updateCamera(patch, true);
      if (current.axis === 'yaw') drivePreparedViewsFromCamera(rig, rig.getStageView());
      current.moved = true;
      return;
    }
    if (current.kind === 'camera') {
      let dx = (event.clientX - current.pointer.x) / zoom, dy = (event.clientY - current.pointer.y) / zoom;
      if (Math.hypot(dx, dy) < 2 && !current.moved) return;
      if (event.shiftKey && cameraToolMode !== 'zoom' && cameraToolMode !== 'roll') { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const patch: Partial<Stage2DSettings> = cameraToolMode === 'pan' ? { cameraX: current.pose.cameraX + dx, cameraY: current.pose.cameraY + dy }
        : cameraToolMode === 'zoom' ? { zoom: current.pose.zoom * Math.exp(-dy / 200) }
        : cameraToolMode === 'roll' ? { roll: current.pose.roll + dx * .3 }
        : { yaw: current.pose.yaw + dx * .3, pitch: current.pose.pitch - dy * .3 };
      useProject.getState().updateCamera(patch, true);
      if (rig.cameraProduction.liveControl.enabled || rig.cameraProduction.stageMode) updateLiveCamera(rig, { x: dx, y: dy });
      if (cameraToolMode === 'orbit') drivePreparedViewsFromCamera(rig, rig.getStageView());
      current.moved = true;
      return;
    }
    if (current.kind === 'path') {
      const next = screenToWorld(event.clientX, event.clientY);
      const last = current.points[current.points.length - 1];
      if (!last || Math.hypot(next.x - last.x, next.y - last.y) > 3 / zoom) {
        current.points.push(next);
        setPathDraft([...current.points]);
      }
      return;
    }
    const point = screenToWorld(event.clientX, event.clientY);
    if (current.kind === 'rotate3d') {
      const layer = rig.layers.get(current.id);
      if (!layer) return;
      const angle = Math.atan2(point.y - current.center.y, point.x - current.center.x);
      let delta = (angle - current.startAngle) * 180 / Math.PI;
      if (event.shiftKey) delta = Math.round(delta / 5) * 5;
      if (!current.moved && Math.abs(delta) < .5) return;
      const next = normalizeTransform3D(layer.transform3d);
      next.rotation[current.axis] = current.startRotation + delta;
      updateLayer3D(rig, layer.id, next, false, false);
      rig.update();
      current.moved = true;
      useProject.setState(state => ({ version: state.version + 1 }));
      return;
    }
    if (current.kind === 'mesh') {
      if (!current.moved && Math.hypot(point.x - current.start.x, point.y - current.start.y) * zoom < 2) return;
      if (rig.setMeshVertex(current.id, current.index, { x: current.worldOrigin.x + point.x - current.start.x, y: current.worldOrigin.y + point.y - current.start.y })) {
        current.moved = true;
        useProject.setState(state => ({ version: state.version + 1 }));
      }
      return;
    }
    if (current.kind === 'weight') {
      const changed = rig.paintMeshWeights(current.id, point, current.boneId, weightRadius, weightStrength, event.shiftKey);
      current.moved ||= changed;
      if (changed) useProject.setState(state => ({ version: state.version + 1 }));
      return;
    }
    if (current.kind === 'bone') {
      setDraftEnd(point);
      return;
    }
    if (current.kind === 'ik') {
      if (!current.moved && Math.hypot(point.x - current.start.x, point.y - current.start.y) * zoom < 2) return;
      const target = { x: point.x + current.offset.x, y: point.y + current.offset.y };
      if (current.fk ? rig.rotateBoneTo(current.id, target) : rig.solveIK(current.id, target, chainLength)) {
        current.moved = true;
        // IK updates are intentionally transient. One history entry is made
        // when the pointer is released.
        useProject.setState((state) => ({ version: state.version + 1 }));
      }
      return;
    }
    if (current.kind === 'draw') {
      const next = pointerToBrushPoint(event), last = current.points[current.points.length - 1];
      if (!last || Math.hypot(next.x - last.x, next.y - last.y) > 2) current.points.push(next);
      return;
    }
    if (current.kind === 'draw-shape') {
      current.end = point;
      setDraftEnd(point);
      return;
    }
    const object = rig.layers.get(current.id) ?? rig.bones.get(current.id);
    if (!current.moved && Math.hypot(point.x - current.start.x, point.y - current.start.y) * zoom < 2) return;
    if (object && (!('locked' in object) || !object.locked)) {
      let moved = false;
      current.ids.forEach(id => {
        const origin = current.worldOrigins[id];
        if (!origin) return;
        moved = rig.moveWorld(id, { x: origin.x + point.x - current.start.x, y: origin.y + point.y - current.start.y }) || moved;
      });
      if (moved) {
        current.moved = true;
        // Do not create one undo entry per pointermove.
        useProject.setState((state) => ({ version: state.version + 1 }));
      }
    }
  };

  const pointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = screenToWorld(event.clientX, event.clientY);
    if (drag.current?.kind === 'bone') finishBone(point);
    const current = drag.current;
    if (current?.kind === 'camera' && current.moved) {
      useProject.getState().finishGesture(current.initialProject);
      onStatus(rig.cameraView === 'preview' ? 'Preview camera adjusted · non-keyable' : `Camera gesture recorded at frame ${Math.round(rig.timeline.currentFrame)}`);
    }
    if (current?.kind === 'camera-rotate' && current.moved) {
      useProject.getState().finishGesture(current.initialProject);
      const hasPreparedViews = rig.characterViews.some(set => set.enabled && set.views.length > 1);
      onStatus(hasPreparedViews
        ? (rig.cameraView === 'preview' ? `Full-scene ${current.axis} orbit adjusted · multi-angle view driven by camera` : `Full-scene ${current.axis} orbit recorded at frame ${Math.round(rig.timeline.currentFrame)}`)
        : `Full-scene ${current.axis} orbit adjusted · add prepared Character Views or 3D geometry to see a side view`);
    }
    if (current?.kind === 'viewport-orbit' && current.moved) {
      useProject.getState().finishGesture(current.initialProject);
      onStatus(rig.cameraView === 'preview' ? 'Viewport orbit adjusted · artwork remains unchanged' : `Viewport orbit recorded at frame ${Math.round(rig.timeline.currentFrame)}`);
    }
    if (current?.kind === 'path') {
      if (current.points.length > 1) onPathCreated(current.points);
      else onStatus('Motion path needs at least two points');
      setPathDraft(null);
    }
    if ((current?.kind === 'move' || current?.kind === 'ik' || current?.kind === 'mesh' || current?.kind === 'weight') && current.moved) {
      useProject.getState().finishGesture(current.initialProject);
      const keyed = useProject.getState().autoKey && rig.timeline.currentFrame > 0;
       const action = current.kind === 'mesh' ? 'Mesh vertex moved' : current.kind === 'weight' ? 'Weight map painted · static rig data' : current.kind === 'ik' ? `Posed ${rig.bones.get(current.id)?.name ?? 'bone'}` : current.kind === 'move' && current.ids.length > 1 ? `Moved ${current.ids.length} selected objects` : 'Moved selection';
      onStatus(`${action} · ${keyed ? `Auto-key recorded at frame ${Math.round(rig.timeline.currentFrame)}` : 'Add key to save this pose in the timeline'}`);
    }
    if (current?.kind === 'rotate3d' && current.moved) {
      const layer = rig.layers.get(current.id);
      if (layer && useProject.getState().autoKey && rig.timeline.currentFrame > 0) updateLayer3D(rig, layer.id, normalizeTransform3D(layer.transform3d), true, true);
      rig.update();
      useProject.getState().finishGesture(current.initialProject);
      onStatus(`Rotated ${current.axis.toUpperCase()} axis · ${useProject.getState().autoKey && rig.timeline.currentFrame > 0 ? `Auto-key recorded at frame ${Math.round(rig.timeline.currentFrame)}` : 'Add key to save this 3D pose'}`);
    }
    if (drag.current?.kind === 'draw') {
      const points = [...drag.current.points, pointerToBrushPoint(event)];
       if (points.length === 2 || points.some(item => Math.hypot(item.x - points[0].x, item.y - points[0].y) * zoom > 2)) {
        const first = points[0];
        const shapes = createBrushShapes(points, brush, `brush-${Date.now().toString(36)}`);
        let id = '';
        useProject.getState().updateProject(project => {
           const name = BRUSH_PRESETS.find(item => item.id === brush.id)?.name ?? 'Brush';
           id = project.addVectorLayer(`${name} ${project.vectors.size + 1}`, shapes);
           const vector = project.vectors.get(id)!;
           vector.local.x = first.x;
           vector.local.y = first.y;
         });
         select(id);
         onStatus(`Created ${BRUSH_PRESETS.find(item => item.id === brush.id)?.name ?? 'brush'} vector layer`);
      }
    }
    if (current?.kind === 'draw-shape') {
      const start = current.start, end = current.end;
      const width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y);
      if (Math.max(width, height) > 3) {
        const shape: VectorShape = drawMode === 'ellipse'
          ? { id: `shape-${Date.now().toString(36)}`, kind: 'ellipse', x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, radiusX: Math.max(1, width / 2), radiusY: Math.max(1, height / 2), fill: drawFillEnabled ? drawFillColor : 'none', stroke: brush.color, strokeWidth: Math.max(1, brush.size / 2), opacity: brush.opacity }
          : { id: `shape-${Date.now().toString(36)}`, kind: 'rect', x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.max(1, width), height: Math.max(1, height), fill: drawFillEnabled ? drawFillColor : 'none', stroke: brush.color, strokeWidth: Math.max(1, brush.size / 2), opacity: brush.opacity };
        let id = '';
        useProject.getState().updateProject(project => { id = project.addVectorLayer(`${drawMode === 'ellipse' ? 'Ellipse' : 'Rectangle'} ${project.vectors.size + 1}`, [shape]); });
        if (id) { select(id); onStatus(`${drawMode === 'ellipse' ? 'Ellipse' : 'Rectangle'} created · use Select or Add key to animate it`); }
      } else onStatus('Shape needs a larger drag · choose Freehand for a brush dot');
    }
     drag.current = null;
     setDraftEnd(null);
     setPathDraft(null);
     setWeightCursor(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const pointerCancel = () => {
    const current = drag.current;
    if (current?.kind === 'move' || current?.kind === 'ik' || current?.kind === 'mesh' || current?.kind === 'weight' || current?.kind === 'rotate3d' || current?.kind === 'camera' || current?.kind === 'camera-rotate' || current?.kind === 'viewport-orbit') {
      // Cancelling a transient drag must not discard earlier undo/redo history.
      useProject.getState().cancelGesture(current.initialProject);
      onStatus('Drag cancelled');
    }
     drag.current = null;
     setDraftEnd(null);
     setPathDraft(null);
     setWeightCursor(null);
  };

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') pointerCancel(); };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  });

  const wheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (activeTool === 'camera' && viewportNavigation !== 'orbit' && !motionPreviewActive && !smartEdit && rig.cameraView !== 'switch') {
      useProject.getState().updateCamera({ zoom: stage2d.zoom * Math.exp(-event.deltaY * .001) });
      return;
    }
    zoomEditor(Math.exp(-event.deltaY * .001), event.clientX, event.clientY);
  };

  const setViewport = (mode: typeof viewportMode) => {
    if (smartEdit) { onStatus('Capture or cancel the action edit before changing the viewport'); return; }
    const preset = {
      front: { enabled: false, yaw: 0, pitch: 0, roll: 0 },
      side: { enabled: true, yaw: 90, pitch: 0, roll: 0 },
      'three-quarter': { enabled: true, yaw: 45, pitch: 0, roll: 0 },
      back: { enabled: true, yaw: 180, pitch: 0, roll: 0 },
      top: { enabled: true, yaw: 0, pitch: -75, roll: 0 },
    }[mode];
    setViewportMode(mode);
    setViewportNavigation(null);
    updateProject(project => {
      project.cameraView = 'preview';
      project.cameraOverride = null;
      project.setStage2D(preset);
    });
    onStatus(`${mode === 'three-quarter' ? 'Three-quarter' : mode[0].toUpperCase() + mode.slice(1)} viewport active`);
  };

  return (
    <div className="canvas-wrap">
      <div className="canvas-view-controls" aria-label="View controls">
        <select aria-label="Viewport view" value={viewportMode} onChange={event => setViewport(event.target.value as typeof viewportMode)}>
          <option value="front">Front View</option><option value="side">Side View</option><option value="three-quarter">3/4 View</option><option value="back">Back View</option><option value="top">Top View</option>
        </select>
        <button aria-pressed={showBones} onClick={() => setShowBones(!showBones)}><BoneIcon size={13} /> Bones</button>
        <button aria-pressed={showGrid} onClick={() => setShowGrid(!showGrid)}><Grid3X3 size={13} /> Grid</button>
        <button aria-pressed={snapEnabled} onClick={() => { setSnapEnabled(value => !value); onStatus(`${snapEnabled ? 'Snap disabled' : 'Snap enabled'} · grid increments are shown on the stage`); }}><CircleDot size={13} /> Snap</button>
        {activeTool === 'ik' && <span className="pose-legend"><i /> tip = pose</span>}
      </div>
      <div className="viewport-navigation" aria-label="Viewport navigation">
        <button aria-label="Pan viewport" aria-pressed={activeTool === 'hand' && viewportNavigation !== 'orbit'} onClick={() => { setViewportNavigation(null); onActivateTool('hand'); onStatus('Pan viewport active · drag the canvas or use middle mouse'); }}><Hand size={14} /></button>
        <button aria-label="Zoom in viewport" onClick={() => zoomEditor(1.1)}><ZoomIn size={14} /></button>
        <button aria-label="Fit viewport" onClick={fitViewport}><Maximize2 size={14} /></button>
        <button aria-label="Orbit viewport" aria-pressed={viewportNavigation === 'orbit'} onClick={() => { setViewportNavigation(value => value === 'orbit' ? null : 'orbit'); onStatus(viewportNavigation === 'orbit' ? 'Orbit viewport disabled' : 'Orbit viewport active · drag to rotate the scene'); }}><Scan size={14} /></button>
      </div>
      <div className="canvas-ruler ruler-top"><span>0</span><span>200</span><span>400</span><span>600</span><span>800</span></div>
      <div className="canvas-ruler ruler-left"><span>0</span><span>130</span><span>260</span><span>390</span><span>520</span></div>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="Character stage"
        className={`stage-canvas tool-${activeTool}${viewportNavigation === 'orbit' ? ' viewport-orbit' : ''}`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerCancel}
        onLostPointerCapture={pointerCancel}
        onDragOver={(event) => event.preventDefault()}
         onDrop={(event) => { event.preventDefault(); if (motionPreviewActive) { onStatus('Apply or cancel motion preview before importing artwork'); return; } if (stage2d.enabled) { onStatus('2.5D preview is read-only · disable Stage preview to import artwork'); return; } const file = event.dataTransfer.files[0]; if (file) importImageFile(file); }}
        onContextMenu={(event) => event.preventDefault()}
        onWheel={wheel}
      />
         <div className="canvas-hud"><Grid3X3 size={13} /> 800 × 520 <span className="hud-divider" /> {Math.round(zoom * 100)}% {viewedCamera && <><span className="hud-divider" /><Camera size={12} /><strong className="stage-preview-hud">{viewedCamera.name}</strong></>} {motionPreviewActive && <><span className="hud-divider" /><strong className="stage-preview-hud">3D MOTION PREVIEW · TEMPORARY</strong>{motionCameraTracking && <><span className="hud-divider" /><strong className="stage-preview-hud">CAMERA TRACKING</strong></>}</>} {stage2d.enabled && <><span className="hud-divider" /><strong className="stage-preview-hud">{stage2d.camera3d?.enabled ? `TRUE 3D · X ${stage2d.camera3d.rotation.x}° / Y ${stage2d.camera3d.rotation.y}° / Z ${stage2d.camera3d.rotation.z}°` : `2.5D · Y ${stage2d.yaw}° / P ${stage2d.pitch}° / R ${stage2d.roll}°`}</strong></>}</div>
      <div className="canvas-zoom-controls">
        <button onClick={() => zoomEditor(1 / 1.1)} aria-label="Zoom out"><ZoomOut size={15} /></button>
        <button onClick={() => zoomEditor(1.1)} aria-label="Zoom in"><ZoomIn size={15} /></button>
        <button onClick={fitViewport} aria-label="Fit viewport"><Maximize2 size={15} /></button>
      </div>
    </div>
  );
}

function LayerRow({
  id,
  label,
  kind,
  selected,
  visible,
  locked,
  color,
   onSelect,
  onVisibility,
  onLock,
  detail,
  depth = 0,
  mapped = false,
  isolated = false,
  onIsolate,
  onAdopt,
  expanded = false,
  onToggleExpand,
}: {
  id: string;
  label: string;
  kind: 'image' | 'vector' | 'bone' | 'group';
  selected: boolean;
  visible: boolean;
  locked: boolean;
  color?: string;
   onSelect: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onVisibility?: () => void;
  onLock: () => void;
  detail?: string;
  depth?: number;
  mapped?: boolean;
  isolated?: boolean;
  onIsolate?: () => void;
  onAdopt?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const editing = useProject(state => Boolean(state.smartEdit));
  return (
    <div data-layer-id={id} className={`layer-row ${kind} ${selected ? 'selected' : ''} ${mapped ? 'mapped' : ''}`} style={{ paddingLeft: 9 + Math.min(depth, 6) * 11 }}>
       {kind === 'group' && onToggleExpand && <button className="layer-expand" onClick={(event) => { event.stopPropagation(); onToggleExpand(); }} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`} title={`${expanded ? 'Collapse' : 'Expand'} ${label}`}>{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>}
       <button className="layer-select" onClick={onSelect} title={detail ? `${label} · ${detail}` : label}>
      <span className={`layer-icon ${kind}`}>{kind === 'bone' ? <BoneIcon size={14} /> : kind === 'group' ? <FolderOpen size={14} /> : kind === 'vector' ? <Pencil size={14} /> : <span style={{ background: color }} />}</span>
      <span className="layer-name">{label}{detail && <small>{detail}</small>}</span>
      </button>
      {onVisibility && <button disabled={editing} className="row-action" onClick={onVisibility} aria-label={`${visible ? 'Hide' : 'Show'} ${label}`}>{visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>}
      {onIsolate && <button disabled={editing} className={`row-action ${isolated ? 'active' : ''}`} onClick={(event) => { event.stopPropagation(); onIsolate(); }} aria-label={`${isolated ? 'Stop isolating' : 'Isolate'} ${label}`}><Eye size={13} /></button>}
      {onAdopt && <button disabled={editing} className="row-action" onClick={(event) => { event.stopPropagation(); onAdopt(); }} aria-label={`Move selected into ${label}`}><FolderPlus size={13} /></button>}
      <button disabled={editing} className="row-action" onClick={(event) => { event.stopPropagation(); onLock(); }} aria-label={`${locked ? 'Unlock' : 'Lock'} ${label}`}>{locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
    </div>
  );
}

function LayersPanel({ activeTool, bindSourceId, onBindSource, onMapBone, sceneObjectsMinimized, onToggleSceneObjects }: {
  activeTool: StudioTool; bindSourceId: string | null;
  onBindSource: (id: string) => void; onMapBone: (id: string) => void;
  sceneObjectsMinimized: boolean; onToggleSceneObjects: () => void;
}) {
  const { rig, selectedId, selectedIds, select, toggleSelection, addImage, addBone, touch, pause, updateProject } = useProject();
  const [imagesOpen, setImagesOpen] = useState(true);
  const [bonesOpen, setBonesOpen] = useState(true);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'artwork' | 'rig'>('all');
  useEffect(() => { setOpenGroups(new Set([...rig.groups.keys()])); }, [rig.id]);
  const normalizedQuery = query.trim().toLowerCase();
  const bones: { bone: Bone; depth: number }[] = [];
  const visited = new Set<string>();
  const visit = (bone: Bone, depth: number) => {
    if (visited.has(bone.id)) return;
    visited.add(bone.id);
    bones.push({ bone, depth });
    rig.getChildren(bone.id).forEach(child => visit(child, depth + 1));
  };
  rig.getRoots().forEach(root => visit(root, 0));
  rig.bones.forEach(bone => visit(bone, 0));
  const matchesText = (label: string) => !normalizedQuery || label.toLowerCase().includes(normalizedQuery);
  const matchesLayer = (layer: Layer) => (filter !== 'rig' && matchesText(layer.name));
  const matchesBone = (bone: Bone) => (filter !== 'artwork' && matchesText(bone.name));
  const matchesGroup = (group: Group) => filter !== 'artwork' && (matchesText(group.name) || descendantsOfGroup(rig, group.id).some(id => {
    const layer = rig.layers.get(id);
    return layer ? matchesLayer(layer) : false;
  }));
  const selectRow = (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) toggleSelection(id);
    else select(id);
  };
  const toggleImage = (id: string, property: 'visible' | 'locked') => {
    if (useProject.getState().smartEdit) return;
    const layer = rig.layers.get(id);
    if (!layer) return;
    pause();
    layer[property] = !layer[property];
    if (property === 'visible' && !layer.visible && id === selectedId) useProject.getState().selectMeshVertex(null);
    rig.update();
    touch();
  };
  const toggleGroup = (id: string, property: 'visible' | 'locked') => {
    if (useProject.getState().smartEdit) return;
    const group = rig.groups.get(id); if (!group) return;
    pause(); group[property] = !group[property]; rig.update(); touch();
  };
  const createGroup = () => {
    const parent = selectedId && rig.groups.has(selectedId) ? selectedId : selectedId ? rig.layers.get(selectedId)?.parentGroupId ?? null : null;
    let id = '';
    updateProject(project => { id = createLayerGroup(project, 'Layer group', 'group', parent) ?? ''; });
    if (id) { setOpenGroups(previous => new Set(previous).add(id)); select(id); }
  };
  const renderItems = (parentGroupId: string | null, depth: number): React.ReactNode[] => {
    const childIds = parentGroupId ? groupChildrenInOrder(rig, rig.groups.get(parentGroupId)!) : [...rig.groups.values()].filter(group => !group.parentGroupId).map(group => ({ id: group.id, zIndex: group.zIndex })).concat([...rig.layers.values()].filter(layer => !layer.parentGroupId).map(layer => ({ id: layer.id, zIndex: layer.zIndex }))).sort((a, b) => b.zIndex - a.zIndex).map(item => item.id);
     return childIds.flatMap(id => {
       const group = rig.groups.get(id);
        if (group && matchesGroup(group)) return [<div key={group.id}><LayerRow id={group.id} label={group.name} kind="group" depth={depth} selected={selectedIds.includes(group.id)} visible={group.visible} locked={group.locked} expanded={openGroups.has(group.id)} onToggleExpand={() => setOpenGroups(previous => { const next = new Set(previous); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })} isolated={rig.isolatedGroupId === group.id} detail={`${group.mode === 'switch' ? 'Switch' : 'Folder'} · ${group.childIds.length} items · ${openGroups.has(group.id) ? 'open' : 'closed'}`} onSelect={(event) => selectRow(group.id, event)} onVisibility={() => toggleGroup(group.id, 'visible')} onLock={() => toggleGroup(group.id, 'locked')} onIsolate={() => { updateProject(project => setGroupIsolation(project, project.isolatedGroupId === group.id ? null : group.id)); }} onAdopt={selectedId && (rig.layers.has(selectedId) || rig.groups.has(selectedId)) && selectedId !== group.id && !descendantsOfGroup(rig, selectedId).includes(group.id) ? () => { updateProject(project => reparentLayerItem(project, selectedId, group.id)); setOpenGroups(previous => new Set(previous).add(group.id)); } : undefined} />{openGroups.has(group.id) && <div className="group-children">{renderItems(group.id, depth + 1)}</div>}</div>];
       const layer = rig.layers.get(id);
       if (!layer) return [];
       if (!matchesLayer(layer)) return [];
       return [<LayerRow key={layer.id} id={layer.id} label={layer.name} kind={layer.type} depth={depth} selected={selectedIds.includes(layer.id)} visible={layer.visible} locked={layer.locked} color={layer.type === 'image' ? layer.color : undefined} detail={layer.boundBoneId ? `→ ${rig.bones.get(layer.boundBoneId)?.name ?? 'Missing bone'}` : 'Unbound'} mapped={activeTool === 'bind' && bindSourceId === layer.id} onSelect={(event) => { selectRow(layer.id, event); onBindSource(layer.id); }} onVisibility={() => toggleImage(layer.id, 'visible')} onLock={() => toggleImage(layer.id, 'locked')} />];
     });
   };
  return (
     <section className={`dock-section layers-section scene-objects-section ${sceneObjectsMinimized ? 'scene-objects-section-minimized' : ''}`} aria-label="Scene Objects panel">
       <div className="section-title"><span><Layers3 size={14} /> Scene Objects <small className="selection-count">{selectedIds.length ? `${selectedIds.length} selected` : 'none selected'}</small></span><div className="section-actions">{!sceneObjectsMinimized && <><button type="button" className="mini-button" onClick={() => { pause(); addImage(); }} title="Add image layer"><Plus size={14} /></button><button type="button" className="mini-button" onClick={createGroup} title="Add layer folder"><FolderPlus size={14} /></button><button type="button" className="mini-button" onClick={() => { pause(); addBone(); }} title="Add bone"><BoneIcon size={14} /></button></>}<button type="button" className="mini-button scene-objects-toggle" aria-label={sceneObjectsMinimized ? 'Restore Scene Objects panel' : 'Minimize Scene Objects panel'} aria-expanded={!sceneObjectsMinimized} aria-controls="scene-objects-content" onClick={onToggleSceneObjects} title={sceneObjectsMinimized ? 'Restore Scene Objects panel' : 'Minimize Scene Objects panel'}>{sceneObjectsMinimized ? <Maximize2 size={14} /> : <Minus size={14} />}</button></div></div>
       <div id="scene-objects-content" hidden={sceneObjectsMinimized}>
         <label className="scene-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search scene objects" aria-label="Search scene objects" /></label>
          <div className="scene-filters" role="tablist" aria-label="Scene object filter"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All ({rig.layers.size + rig.groups.size + rig.bones.size})</button><button className={filter === 'artwork' ? 'active' : ''} onClick={() => setFilter('artwork')}>Artwork ({rig.layers.size + rig.groups.size})</button><button className={filter === 'rig' ? 'active' : ''} onClick={() => setFilter('rig')}>Rig ({rig.bones.size})</button></div>
          <div className="tree-group">
             <button className="tree-heading project-tree-heading" onClick={() => setImagesOpen((open) => !open)}>{imagesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} <span>{rig.name || 'Project scene'}</span><small>{rig.layers.size + rig.groups.size} objects</small></button>
             {imagesOpen && rig.groups.size > 0 && <p className="tree-help">Artwork folders and scene parts · use the arrow on a folder to see its children.</p>}
           {imagesOpen && <div className="tree-rows">{renderItems(null, 0)}</div>}
         </div>
         <div className="tree-group">
           <button className="tree-heading" onClick={() => setBonesOpen((open) => !open)}>{bonesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} <span>Bone rig</span><small>{bones.length}</small></button>
           {bonesOpen && <div className="tree-rows">{bones.filter(({ bone }) => matchesBone(bone)).map(({ bone, depth }) => <LayerRow key={bone.id} id={bone.id} label={bone.name} kind="bone" depth={depth} detail={bone.parentId ? `in ${rig.bones.get(bone.parentId)?.name ?? 'rig'}` : 'Root'} selected={selectedIds.includes(bone.id)} mapped={rig.layers.get(activeTool === 'bind' ? bindSourceId ?? '' : selectedId ?? '')?.boundBoneId === bone.id} visible={true} locked={Boolean(bone.locked)} onSelect={(event) => activeTool === 'bind' ? onMapBone(bone.id) : selectRow(bone.id, event)} onLock={() => { pause(); bone.locked = !bone.locked; touch(); }} />)}</div>}
         </div>
         {rig.layers.size === 0 && rig.groups.size === 0 && bones.length === 0 && <div className="empty-state">Import separate artwork for each limb, or open the rigged example.</div>}
       </div>
     </section>
  );
}

function PropertyField({ label, value, onChange, suffix, step = 1 }: { label: string; value: string | number; onChange: (value: string) => void; suffix?: string; step?: number }) {
  return <label className="property-field"><span>{label}</span><div className="input-with-suffix"><input type="number" step={step} value={value} onChange={(event) => onChange(event.target.value)} />{suffix && <em>{suffix}</em>}</div></label>;
}

function CompositingPanel({ group, layer }: { group?: Group; layer?: Layer }) {
  const { rig, updateProject } = useProject();
  const masks = group ? groupMasks(group) : [];
  const descendants = group ? descendantsOfGroup(rig, group.id).filter(id => rig.layers.has(id)) : [];
  const patchTargets = layer?.patch?.targetIds ?? [];
  const togglePatchTarget = (id: string, checked: boolean) => updateProject(project => {
    const target = project.layers.get(layer!.id); if (!target) return;
    target.patch ??= { enabled: true, targetIds: [], hideEdges: true, seamWidth: 2 };
    target.patch.targetIds = checked ? [...new Set([...target.patch.targetIds, id])] : target.patch.targetIds.filter(targetId => targetId !== id);
  });
  if (!group && !layer) return null;
  return <div className="compositing-panel">
    {group && <>
      <div className="property-subtitle">Mask stack · {masks.length}</div>
      {masks.map((mask, index) => <div className="mask-row" key={mask.id}>
        <div className="mask-row-title"><span>{index + 1}. {rig.layers.get(mask.layerId)?.name ?? 'Missing layer'}</span><div><button className="mini-button" aria-label="Move mask up" disabled={index === 0} onClick={() => updateProject(project => moveGroupMask(project, group.id, mask.id, -1))}>↑</button><button className="mini-button" aria-label="Move mask down" disabled={index === masks.length - 1} onClick={() => updateProject(project => moveGroupMask(project, group.id, mask.id, 1))}>↓</button><button className="mini-button" aria-label="Remove mask" onClick={() => updateProject(project => removeGroupMask(project, group.id, mask.id))}>×</button></div></div>
        <div className="property-grid"><select aria-label="Mask kind" value={mask.kind} onChange={event => updateProject(project => updateGroupMask(project, group.id, mask.id, { kind: event.target.value as 'alpha' | 'clip' }))}><option value="alpha">Alpha</option><option value="clip">Clipping</option></select><select aria-label="Mask operation" value={mask.operation} onChange={event => updateProject(project => updateGroupMask(project, group.id, mask.id, { operation: event.target.value as 'add' | 'subtract' | 'intersect' }))}><option value="add">Add</option><option value="subtract">Subtract</option><option value="intersect">Intersect</option></select></div>
        <div className="property-grid"><label className="check-label"><input type="checkbox" checked={mask.inverted} onChange={event => updateProject(project => updateGroupMask(project, group.id, mask.id, { inverted: event.target.checked }))} /> Invert</label><label className="check-label"><input type="checkbox" checked={mask.hideSource} onChange={event => updateProject(project => updateGroupMask(project, group.id, mask.id, { hideSource: event.target.checked }))} /> Hide source</label><label className="check-label"><input type="checkbox" checked={mask.hideEdge} onChange={event => updateProject(project => updateGroupMask(project, group.id, mask.id, { hideEdge: event.target.checked }))} /> Hide edge</label></div>
        <label className="style-range"><span>Mask opacity <output>{Math.round(mask.opacity * 100)}%</output></span><input type="range" min={0} max={1} step=".01" value={mask.opacity} onChange={event => updateProject(project => updateGroupMask(project, group.id, mask.id, { opacity: Number(event.target.value) }))} /></label>
      </div>)}
      <div className="panel-buttons"><select aria-label="Mask source layer" id={`mask-source-${group.id}`}><option value="">Choose source…</option>{descendants.map(id => <option key={id} value={id}>{rig.layers.get(id)?.name}</option>)}</select><button className="secondary-button" onClick={() => { const select = document.getElementById(`mask-source-${group.id}`) as HTMLSelectElement | null; if (select?.value) updateProject(project => addGroupMask(project, group.id, select.value, 'alpha')); }}>Add mask</button><button className="secondary-button" onClick={() => { const select = document.getElementById(`mask-source-${group.id}`) as HTMLSelectElement | null; if (select?.value) updateProject(project => addGroupMask(project, group.id, select.value, 'clip')); }}>Add clip</button></div>
      <button className="mini-text" onClick={() => updateProject(project => keyCompositing(project, group.id, 'masks'))}><KeyRound size={12} /> Key mask stack</button>
    </>}
    {layer && <>
      <div className="property-subtitle">Patch layer / seam hiding</div>
      <label className="check-label"><input type="checkbox" checked={layer.patch?.enabled ?? false} onChange={event => updateProject(project => { const target = project.layers.get(layer.id); if (target) target.patch = { ...target.patch, enabled: event.target.checked, targetIds: target.patch?.targetIds ?? [], hideEdges: target.patch?.hideEdges ?? true, seamWidth: target.patch?.seamWidth ?? 2 }; })} /> Use as patch layer</label>
      {layer.patch?.enabled && <label className="check-label"><input aria-label="Preserve patch outline" type="checkbox" checked={layer.patch.preserveOutline ?? false} onChange={event => updateProject(project => { const target = project.layers.get(layer.id); if (target?.patch) target.patch.preserveOutline = event.target.checked; })} /> Keep this artwork’s outlines and finger details</label>}
      {layer.patch?.enabled && <><label className="check-label"><input type="checkbox" checked={layer.patch.hideEdges} onChange={event => updateProject(project => { const target = project.layers.get(layer.id); if (target?.patch) target.patch.hideEdges = event.target.checked; })} /> Hide edges / seams</label><PropertyField label="Seam width" value={layer.patch.seamWidth} step={.5} suffix="px" onChange={value => updateProject(project => { const target = project.layers.get(layer.id); if (target?.patch) target.patch.seamWidth = Math.max(0, Math.min(64, Number(value))); })} /><div className="checklist action-targets">{[...rig.layers.values()].filter(target => target.id !== layer.id).map(target => <label key={target.id}><input type="checkbox" checked={patchTargets.includes(target.id)} onChange={event => togglePatchTarget(target.id, event.target.checked)} /><span>Hide seam on {target.name}</span></label>)}</div><button className="mini-text" onClick={() => updateProject(project => keyCompositing(project, layer.id, 'patch'))}><KeyRound size={12} /> Key patch</button></>}
    </>}
  </div>;
}

function Transform3DPanel({ layer, onStatus }: { layer: Layer; onStatus: (message: string) => void }) {
  const { rig, pause, updateProject } = useProject();
  const [linkScale, setLinkScale] = useState(false);
  const transform = normalizeTransform3D(layer.transform3d);
  const true3dEnabled = Boolean(rig.getStageView().camera3d?.enabled);
  type Axis = 'x' | 'y' | 'z';
  type Channel = keyof Transform3D;
  const updateValue = (channel: Channel, axis: Axis, rawValue: string) => {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    pause();
    updateProject((project) => {
      const target = project.layers.get(layer.id);
      if (!target) return;
      const next = normalizeTransform3D(target.transform3d);
      next[channel][axis] = value;
      if (channel === 'scale' && linkScale) {
        next.scale.x = value;
        next.scale.y = value;
        next.scale.z = value;
      }
      updateLayer3D(project, layer.id, next, false, false);
    });
    onStatus(`3D ${channel} ${axis.toUpperCase()} updated · enable True 3D stage to preview`);
  };
  const channelLabels: Array<{ key: Channel; label: string; step: number; suffix: string }> = [
    { key: 'position', label: 'Location', step: 1, suffix: 'px' },
    { key: 'rotation', label: 'Rotation', step: 1, suffix: '°' },
    { key: 'scale', label: 'Scale', step: .01, suffix: '×' },
  ];
  return (
    <section className="transform-3d-panel">
      <div className="property-subtitle transform-3d-title"><span><Box size={13} /> 3D transform</span><span className="transform-3d-badge">XYZ</span></div>
      <p className="scope-note">Object-space position, rotation and scale. Rotation uses Blender-style X / Y / Z Euler axes.</p>
      <button className={`secondary-button full-button transform-3d-guide-button ${true3dEnabled ? 'active' : ''}`} onClick={() => { if (true3dEnabled) { onStatus('3D rotation guide active · drag the X, Y, or Z ring on the stage'); return; } updateProject(project => project.setStage2D({ enabled: true, camera3d: { ...defaultCamera3D(), ...(project.stage2d.camera3d ?? {}), enabled: true } })); onStatus('True 3D stage enabled · drag the XYZ rotation guide on the canvas'); }}>{true3dEnabled ? 'XYZ rotation guide active' : 'Enable XYZ rotation guide'}</button>
      {channelLabels.map(({ key, label, step, suffix }) => (
        <div className="transform-3d-channel" key={key}>
          <div className="transform-3d-channel-heading"><span>{label}</span>{key === 'scale' && <button type="button" className={`axis-link-button ${linkScale ? 'active' : ''}`} aria-pressed={linkScale} onClick={() => setLinkScale(value => !value)} title="Link X, Y and Z scale">{linkScale ? 'Linked' : 'Link scale'}</button>}</div>
          <div className="transform-3d-axis-grid">
            {(['x', 'y', 'z'] as Axis[]).map(axis => <label className={`axis-field axis-${axis}`} key={axis}><span>{axis.toUpperCase()}</span><div className="axis-input"><input aria-label={`${label} ${axis.toUpperCase()}`} type="number" step={step} value={transform[key][axis]} onChange={event => updateValue(key, axis, event.target.value)} /><em>{suffix}</em></div></label>)}
          </div>
        </div>
      ))}
    </section>
  );
}

function PropertiesPanel({ onAddKeyframe, onStatus }: { onAddKeyframe: () => void; onStatus: (message: string) => void }) {
  const { rig, selectedId, removeSelected, bindSelected, unbind, touch, pause, smartEdit, updateProject } = useProject();
  const selectedImage = selectedId ? rig.images.get(selectedId) : undefined;
  const selectedVector = selectedId ? rig.vectors.get(selectedId) : undefined;
  const selectedBone = selectedId ? rig.bones.get(selectedId) : undefined;
  const selectedGroup = selectedId ? rig.groups.get(selectedId) : undefined;
  const selected = selectedImage ?? selectedVector ?? selectedBone ?? selectedGroup;
  const editingDriver = Boolean(smartEdit && rig.smartActions.find(action => action.id === smartEdit.actionId)?.driverBoneId === selectedId);
  const updateTransform = (key: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY', value: string) => {
    if (!selected || selected.locked) return;
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    pause();
    if (key === 'rotation') selected.local.rotation = number * Math.PI / 180;
    else selected.local[key] = number;
    if (key === 'scaleX') selected.local.scaleY = number;
    rig.update();
    touch();
  };
  return (
    <section className="dock-section properties-section">
      <div className="section-title"><span>Properties</span><Settings2 size={15} className="section-muted" /></div>
      {!selected && <div className="empty-properties"><CircleDot size={22} /><span>Select a layer or bone<br />to edit its properties.</span></div>}
      {selected && <>
        {selected.locked && <p className="scope-note">Locked. Unlock in the layer list to edit or pose.</p>}
        {editingDriver && <p className="scope-note">Driver rotation is fixed for this action key. Select a target to edit.</p>}
        <fieldset className="property-fields" disabled={Boolean(selected.locked) || editingDriver}>
        <label className="name-field"><span>Name</span><div className="name-input"><Pencil size={13} /><input disabled={Boolean(smartEdit)} value={selected.name} onChange={(event) => { pause(); selected.name = event.target.value; touch(); }} /></div></label>
        <div className="property-subtitle">{smartEdit ? 'Action key local transform' : 'Authored local transform'}</div>
        <p className="scope-note">{smartEdit ? 'Adjust this key, then Capture in Smart Bone Actions.' : 'Canvas shows evaluated actions; these fields show the authored pose.'}</p>
         <div className="property-grid">
           <PropertyField label="X" value={Math.round(selected.local.x * 10) / 10} onChange={(value) => updateTransform('x', value)} suffix="px" />
           <PropertyField label="Y" value={Math.round(selected.local.y * 10) / 10} onChange={(value) => updateTransform('y', value)} suffix="px" />
           <PropertyField label="Rotation" value={Math.round(selected.local.rotation * 1800 / Math.PI) / 10} onChange={(value) => updateTransform('rotation', value)} suffix="°" />
           <PropertyField label="Scale" value={Math.round(selected.local.scaleX * 100) / 100} onChange={(value) => updateTransform('scaleX', value)} step={0.05} suffix="x" />
         </div>
          {(selectedImage || selectedVector) && <Transform3DPanel layer={selectedImage ?? selectedVector!} onStatus={onStatus} />}
           {selectedBone && <fieldset className="property-fields" disabled={Boolean(smartEdit)}><div className="property-subtitle">Bone</div><PropertyField label="Length" value={Math.round(selectedBone.length)} onChange={(value) => { const number = Number(value); if (Number.isFinite(number) && number >= 0) { pause(); selectedBone.length = number; rig.update(); touch(); } }} suffix="px" />
           <label className="select-field"><span>Parent bone</span><select value={selectedBone.parentId ?? ''} onChange={(event) => {
             const parentId = event.target.value || null;
             pause();
             const didReparent = rig.reparentBone(selectedBone.id, parentId, true);
             if (!didReparent) {
               onStatus('Cannot use that parent: it would create a bone cycle');
               return;
             }
             touch();
             onStatus(parentId ? `Parent set to ${rig.bones.get(parentId)?.name ?? 'bone'}` : 'Bone made a root');
           }}>
             <option value="">Root (no parent)</option>
             {[...rig.bones.values()].filter((bone) => bone.id !== selectedBone.id).map((bone) => <option key={bone.id} value={bone.id}>{bone.name}</option>)}
           </select></label>
          </fieldset>}
          {selectedGroup && <fieldset className="property-fields" disabled={Boolean(smartEdit)}><div className="property-subtitle">Layer folder</div><label className="style-range"><span>Group opacity <output>{Math.round(selectedGroup.opacity * 100)}%</output></span><input aria-label="Group opacity" type="range" min={0} max={1} step=".01" value={selectedGroup.opacity} onChange={event => { selectedGroup.opacity = Number(event.target.value); rig.update(); touch(); }} /></label><div className="property-grid"><label className="select-field"><span>Blend mode</span><select aria-label="Group blend mode" value={selectedGroup.blendMode} onChange={event => { selectedGroup.blendMode = event.target.value as GroupBlendMode; rig.update(); touch(); }}>{['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'].map(mode => <option key={mode} value={mode}>{mode}</option>)}</select></label><PropertyField label="Layer order" value={Math.round(selectedGroup.zIndex)} onChange={value => { const number = Number(value); if (Number.isFinite(number)) { selectedGroup.zIndex = number; rig.update(); touch(); } }} /></div><label className="check-label"><input aria-label="Group visible" type="checkbox" checked={selectedGroup.visible} onChange={event => { selectedGroup.visible = event.target.checked; rig.update(); touch(); }} /> Visible</label><label className="select-field"><span>Container mode</span><select aria-label="Group container mode" value={selectedGroup.mode} onChange={event => { selectedGroup.mode = event.target.value as 'group' | 'switch'; rig.update(); touch(); }}><option value="group">Folder / group</option><option value="switch">Switch container</option></select></label>{selectedGroup.mode === 'switch' && <label className="select-field"><span>Active child</span><select aria-label="Active group child" value={selectedGroup.activeChildId ?? ''} onChange={event => { selectedGroup.activeChildId = event.target.value || undefined; rig.update(); touch(); }}>{selectedGroup.childIds.map(id => <option key={id} value={id}>{rig.groups.get(id)?.name ?? rig.layers.get(id)?.name ?? 'Missing item'}</option>)}</select></label>}<div className="property-grid"><label className="select-field"><span>Clip layer</span><select aria-label="Group clip layer" value={selectedGroup.clipLayerId ?? ''} onChange={event => { selectedGroup.clipLayerId = event.target.value || undefined; rig.update(); touch(); }}><option value="">No clip</option>{selectedGroup.childIds.filter(id => rig.layers.has(id)).map(id => <option key={id} value={id}>{rig.layers.get(id)?.name}</option>)}</select></label><label className="select-field"><span>Mask layer</span><select aria-label="Group mask layer" value={selectedGroup.maskLayerId ?? ''} onChange={event => { selectedGroup.maskLayerId = event.target.value || undefined; rig.update(); touch(); }}><option value="">No mask</option>{selectedGroup.childIds.filter(id => rig.layers.has(id)).map(id => <option key={id} value={id}>{rig.layers.get(id)?.name}</option>)}</select></label></div><div className="panel-buttons"><button className="secondary-button" onClick={() => { const isolated = rig.isolatedGroupId === selectedGroup.id; updateProject(project => setGroupIsolation(project, isolated ? null : selectedGroup.id)); }}> <Eye size={13} /> {rig.isolatedGroupId === selectedGroup.id ? 'Exit isolation' : 'Isolate group'}</button><button className="danger-button" onClick={() => { updateProject(project => removeLayerGroup(project, selectedGroup.id, false)); onStatus('Group removed · children returned to its parent'); }}>Delete group</button></div></fieldset>}
          {selectedGroup && <CompositingPanel group={selectedGroup} />}
          {(selectedImage || selectedVector) && <CompositingPanel layer={selectedImage ?? selectedVector} />}
          {selectedImage && <>
           <div className="property-subtitle">Appearance</div>
           <label className="color-field"><span>Color</span><input disabled={Boolean(smartEdit)} type="color" value={selectedImage.color} onChange={(event) => { pause(); selectedImage.color = event.target.value; touch(); }} /></label>
         </>}
         {(selectedImage || selectedVector) && (() => {
           const artwork = selectedImage ?? selectedVector;
            if (!artwork) return null;
            const mappedBone = artwork.boundBoneId ? rig.bones.get(artwork.boundBoneId) : undefined;
             const meshActive = Boolean(artwork.mesh);
            return <>
               <PropertyField label="Opacity (0–1)" value={Math.round(artwork.opacity * 100) / 100} step={.05} onChange={value => {
                 const opacity = Number(value);
                 if (!Number.isFinite(opacity)) return;
                 pause(); artwork.opacity = Math.max(0, Math.min(1, opacity)); rig.update(); touch();
               }} />
               <div className="property-grid">
                 <label className="check-label"><input type="checkbox" checked={artwork.visible} onChange={event => { pause(); artwork.visible = event.target.checked; rig.update(); touch(); }} /> Visible in Smart action</label>
                 <PropertyField label="Layer order" value={Math.round(artwork.zIndex)} onChange={value => {
                   const zIndex = Number(value);
                   if (!Number.isFinite(zIndex)) return;
                   pause(); artwork.zIndex = zIndex; rig.update(); touch();
                 }} />
               </div>
               <div className="property-subtitle">Bone mapping</div>
              {meshActive && <p className="scope-note">Mesh active. Choose and edit influences in Mesh & weights; rigid mapping is disabled.</p>}
             <div className="binding-line"><Link2 size={13} /><span>{mappedBone ? `${artwork.name} → ${mappedBone.name}` : `${artwork.name} is unbound`}</span></div>
              <label className="select-field"><span>Mapped bone</span><select disabled={meshActive || Boolean(smartEdit)} value={artwork.boundBoneId ?? ''} onChange={(event) => {
               const boneId = event.target.value;
               pause();
               if (!boneId) {
                 const didUnbind = unbind(artwork.id);
                 onStatus(didUnbind ? `Unbound ${artwork.name}` : `${artwork.name} was already unbound`);
                 return;
               }
               const didBind = bindSelected(artwork.id, boneId);
               onStatus(didBind
                 ? `Mapped ${artwork.name} to ${rig.bones.get(boneId)?.name ?? 'bone'}`
                 : `Could not map ${artwork.name} to that bone`);
             }}>
               <option value="">Unbound</option>
               {[...rig.bones.values()].map((bone) => <option key={bone.id} value={bone.id}>{bone.name}</option>)}
             </select></label>
           </>;
         })()}
          {selectedVector && <>
            <div className="property-subtitle">Vector artwork</div>
            <div className="binding-line"><Pencil size={13} /><span>{selectedVector.shapes.length} shape{selectedVector.shapes.length === 1 ? '' : 's'} · editable path layer</span></div>
            {selectedVector.shapes[0] && <div className="vector-quick-style"><div className="property-subtitle">Quick fill & stroke · first shape</div><div className="property-grid"><label className="color-field"><span>Fill</span><input type="color" value={selectedVector.shapes[0].fill && selectedVector.shapes[0].fill !== 'none' && /^#[0-9a-f]{6}$/i.test(selectedVector.shapes[0].fill) ? selectedVector.shapes[0].fill : '#69b7ff'} onChange={event => { pause(); updateProject(project => { const shape = project.vectors.get(selectedVector.id)?.shapes.find(item => item.id === selectedVector.shapes[0].id); if (shape) shape.fill = event.target.value; }); onStatus('Vector fill updated · use Style for individual shapes'); }} /></label><label className="color-field"><span>Stroke</span><input type="color" value={selectedVector.shapes[0].stroke && selectedVector.shapes[0].stroke !== 'none' && /^#[0-9a-f]{6}$/i.test(selectedVector.shapes[0].stroke) ? selectedVector.shapes[0].stroke : '#173c4a'} onChange={event => { pause(); updateProject(project => { const shape = project.vectors.get(selectedVector.id)?.shapes.find(item => item.id === selectedVector.shapes[0].id); if (shape) shape.stroke = event.target.value; }); onStatus('Vector stroke updated · use Style for individual shapes'); }} /></label></div><label className="style-range"><span>Stroke width <output>{Math.round((selectedVector.shapes[0].strokeWidth ?? 0) * 10) / 10}px</output></span><input type="range" min="0" max="40" step=".5" value={selectedVector.shapes[0].strokeWidth ?? 0} onChange={event => { pause(); updateProject(project => { const shape = project.vectors.get(selectedVector.id)?.shapes.find(item => item.id === selectedVector.shapes[0].id); if (shape) shape.strokeWidth = Number(event.target.value); }); }} /></label></div>}
          </>}
        <div className="property-actions"><button disabled={Boolean(smartEdit)} className="secondary-button" onClick={onAddKeyframe}><KeyRound size={14} /> Add key</button><button disabled={Boolean(smartEdit)} className="danger-button" onClick={() => { pause(); removeSelected(); }}><Trash2 size={14} /> Delete</button></div>
        </fieldset>
      </>}
    </section>
  );
}

function AlignmentPanel({ onStatus }: { onStatus: (message: string) => void }) {
  const { rig, selectedId, selectedIds, smartEdit, alignSelection } = useProject();
  const [target, setTarget] = useState<AlignmentTarget>('selection');
  const selection = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
  const movable = selection.filter(id => (rig.layers.get(id) ?? rig.bones.get(id)) && !rig.groups.has(id));
  const hasLocked = selection.some(id => (rig.layers.get(id) ?? rig.bones.get(id))?.locked);
  const stagePreview = rig.getStageView().enabled;
  const disabled = Boolean(smartEdit || stagePreview || hasLocked || movable.length < 1);
  const distributeDisabled = disabled || movable.length < 3;
  const reason = smartEdit
    ? 'Finish the current action edit first.'
    : stagePreview
      ? 'Disable Stage preview to align authored artwork.'
      : hasLocked
        ? 'Unlock the selected objects before aligning.'
        : movable.length < 1
          ? 'Select artwork or bones in Scene Objects.'
          : movable.length < 2
            ? 'Select another object to align to the selection.'
            : '';
  const run = (command: AlignmentCommand) => {
    const changed = alignSelection(command, target);
    onStatus(changed ? `Aligned ${movable.length} objects` : 'Nothing moved · check the target and selection');
  };
  const alignButtons: Array<{ command: AlignmentCommand; label: string; hint: string }> = [
    { command: 'left', label: 'Left', hint: 'Align left edges' },
    { command: 'center-x', label: 'Center X', hint: 'Align horizontal centers' },
    { command: 'right', label: 'Right', hint: 'Align right edges' },
    { command: 'top', label: 'Top', hint: 'Align top edges' },
    { command: 'center-y', label: 'Center Y', hint: 'Align vertical centers' },
    { command: 'bottom', label: 'Bottom', hint: 'Align bottom edges' },
  ];
  return (
    <section className="dock-section alignment-section">
      <div className="section-title"><span><SlidersHorizontal size={14} /> Align & distribute</span><span className="section-muted">{movable.length} objects</span></div>
      <label className="alignment-target"><span>Align to</span><select value={target} onChange={(event) => setTarget(event.target.value as AlignmentTarget)}><option value="selection">Selection bounds</option><option value="primary">Primary object</option><option value="canvas">Canvas</option></select></label>
      <div className="alignment-grid" aria-label="Alignment controls">{alignButtons.map(button => <button key={button.command} disabled={disabled} title={button.hint} onClick={() => run(button.command)}><span className={`alignment-glyph ${button.command}`} aria-hidden="true" />{button.label}</button>)}</div>
      <div className="alignment-distribute"><span>Distribute</span><button disabled={distributeDisabled} title="Distribute horizontal centers" onClick={() => run('distribute-x')}><i className="distribution-glyph horizontal" />Horizontal</button><button disabled={distributeDisabled} title="Distribute vertical centers" onClick={() => run('distribute-y')}><i className="distribution-glyph vertical" />Vertical</button></div>
      <p className={`alignment-hint ${reason ? 'warning' : ''}`}>{reason || 'Shift-click or Cmd/Ctrl-click objects in the scene tree to multi-select.'}</p>
    </section>
  );
}

function MotionPathPanel({ activePathId, onSelectPath, onActivate, onStatus }: { activePathId: string | null; onSelectPath: (id: string | null) => void; onActivate: () => void; onStatus: (message: string) => void }) {
  const { rig, selectedId, smartEdit, updateProject, removeMotionPath, followMotionPath } = useProject();
  const path = activePathId ? rig.motionPaths.find(item => item.id === activePathId) : rig.motionPaths.find(item => item.targetId === selectedId);
  const target = path ? rig.layers.get(path.targetId)?.name ?? rig.bones.get(path.targetId)?.name ?? 'Object' : selectedId ? rig.layers.get(selectedId)?.name ?? rig.bones.get(selectedId)?.name ?? 'Selected object' : 'Nothing selected';
  const blocked = Boolean(smartEdit || rig.getStageView().enabled || !path);
  const patchPath = (patch: Partial<NonNullable<typeof path>>) => { if (!path) return; updateProject(project => { const targetPath = project.motionPaths?.find(item => item.id === path.id); if (targetPath) Object.assign(targetPath, patch); }); };
  const bake = () => { if (!path) return; const ok = followMotionPath(path.id, { startFrame: path.startFrame, endFrame: path.endFrame, orientToPath: path.orientToPath }); onStatus(ok ? `${path.name} baked to ${target} · play the timeline to follow the path` : 'Could not bake this motion path'); };
  return <section className="dock-section motion-path-section">
    <div className="section-title"><span><Route size={14} /> Motion path</span><span className="section-muted">{rig.motionPaths.length} guides</span></div>
    <p className="scope-note">Draw a world-space path, then bake it into transform keys so a character, bone, or artwork walks along the guide.</p>
    <button className="secondary-button full-button motion-path-draw" disabled={Boolean(smartEdit) || rig.getStageView().enabled || !selectedId} onClick={onActivate}><Route size={14} /> Draw path for {target}</button>
    {rig.motionPaths.length > 0 && <label className="select-field motion-path-select"><span>Path guide</span><select value={path?.id ?? ''} onChange={event => onSelectPath(event.target.value || null)}><option value="">Choose path…</option>{rig.motionPaths.map(item => <option key={item.id} value={item.id}>{item.name} · {rig.layers.get(item.targetId)?.name ?? rig.bones.get(item.targetId)?.name ?? 'object'}</option>)}</select></label>}
    {path && <>
      <label className="name-field motion-path-name"><span>Name</span><div className="name-input"><Route size={13} /><input value={path.name} onChange={event => patchPath({ name: event.target.value })} /></div></label>
      <div className="property-grid motion-path-frames"><PropertyField label="Start frame" value={path.startFrame} onChange={value => patchPath({ startFrame: Math.max(0, Math.round(Number(value))) })} /><PropertyField label="End frame" value={path.endFrame} onChange={value => patchPath({ endFrame: Math.max(path.startFrame + 1, Math.round(Number(value))) })} /></div>
      <label className="check-label"><input type="checkbox" checked={path.orientToPath} onChange={event => patchPath({ orientToPath: event.target.checked })} /> Rotate to path direction</label>
      <div className="motion-path-actions"><button className="secondary-button" disabled={blocked} onClick={bake}>Bake follow path</button><button className="danger-button" onClick={() => { removeMotionPath(path.id); onSelectPath(null); onStatus('Motion path deleted'); }}>Delete</button></div>
      {rig.getStageView().enabled && <p className="alignment-hint warning">Disable Stage preview before baking authored motion.</p>}
    </>}
    {!path && <p className="empty-state">Select an object, press P or click Draw path, then drag on the stage.</p>}
  </section>;
}

function BindWorkspace({ sourceId, targetId, onSource, onTarget, onMap, onUnbind, onStatus }: { sourceId: string | null; targetId: string | null; onSource: (id: string | null) => void; onTarget: (id: string | null) => void; onMap: (id: string) => void; onUnbind: () => void; onStatus: (message: string) => void }) {
  const { rig } = useProject();
  const source = sourceId ? rig.layers.get(sourceId) : undefined;
  const mappedBone = source?.boundBoneId ? rig.bones.get(source.boundBoneId) : undefined;
  const target = targetId ? rig.bones.get(targetId) : undefined;
  return <section className="dock-section bind-workspace" aria-label="Bind artwork to bone">
    <div className="section-title"><span><Link2 size={14} /> Bind artwork to bone</span><span className="section-muted">COMPOSER</span></div>
    <p className="scope-note">CTA-style setup: choose the layer, choose the bone, then confirm the mapping. The stage and Bone rig list stay available while you work.</p>
    <div className="bind-workflow-grid">
      <label className="select-field"><span>1 · Source artwork</span><select aria-label="Bind source artwork" value={sourceId ?? ''} onChange={event => onSource(event.target.value || null)}><option value="">Choose artwork…</option>{rig.layersInOrder.map(layer => <option key={layer.id} value={layer.id}>{layer.name}{layer.mesh ? ' · mesh' : ''}</option>)}</select></label>
      <label className="select-field"><span>2 · Target bone</span><select aria-label="Bind target bone" value={targetId ?? ''} onChange={event => onTarget(event.target.value || null)}><option value="">Choose bone…</option>{[...rig.bones.values()].map(bone => <option key={bone.id} value={bone.id}>{bone.name}{bone.locked ? ' · locked' : ''}</option>)}</select></label>
    </div>
    <div className={`bind-result ${mappedBone ? 'mapped' : ''}`}><span className="bind-result-dot" />{mappedBone ? <><strong>{source?.name}</strong><span>→ {mappedBone.name}</span></> : source && target ? <><strong>{source.name}</strong><span>ready to map to {target.name}</span></> : <span>Choose source and target to enable Map</span>}</div>
    <div className="bind-workspace-actions"><button className="primary-button" disabled={!sourceId || !targetId} onClick={() => { if (targetId) onMap(targetId); }}>Map artwork to bone</button><button className="secondary-button" disabled={!mappedBone} onClick={() => { onUnbind(); onStatus('Artwork unbound · choose a new target bone'); }}>Unbind</button></div>
    <p className="bind-hint">You can also click artwork, then click a highlighted bone on the stage or a bone row below. Mesh artwork uses Mesh & weights instead.</p>
  </section>;
}

function StageRange({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (number) => String(number),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <label className="stage-range">
      <span><span>{label}</span><output>{format(value)}</output></span>
      <input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function StagePanel({ onStatus }: { onStatus: (message: string) => void }) {
  const { rig, selectedId, select, pause, updateProject, replaceProject, smartEdit } = useProject();
  const stage = rig.stage2d;
  const selectedLayer = selectedId ? rig.layers.get(selectedId) : undefined;
  const artwork = [...rig.layersInOrder];
  const objectInput = useRef<HTMLInputElement>(null);

  const updateStage = (patch: Partial<Stage2DSettings>, message: string) => {
    if (smartEdit) return;
    pause();
    updateProject((project) => { project.cameraView = 'preview'; project.cameraOverride = null; project.setStage2D(patch); });
    onStatus(message);
  };

  const updateLayer = (key: 'depth' | 'parallax', value: number) => {
    if (!selectedLayer || smartEdit || !Number.isFinite(value)) return;
    pause();
    updateProject((project) => {
      const layer = project.layers.get(selectedLayer.id);
      if (layer) layer[key] = value;
    });
    onStatus(`${selectedLayer.name} ${key} set to ${key === 'depth' ? Math.round(value) : value.toFixed(2)}`);
  };
  const update3D = (patch: Partial<NonNullable<typeof selectedLayer>['transform3d']>) => {
    if (!selectedLayer || smartEdit) return;
    pause();
    updateProject(project => { const layer = project.layers.get(selectedLayer.id); if (!layer) return; const current = layer.transform3d ?? { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }; updateLayer3D(project, layer.id, { ...current, ...patch }, false, false); });
    onStatus(`${selectedLayer.name} 3D transform updated`);
  };
  const importOBJ = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    file.text().then(text => { try { let id = ''; updateProject(project => { id = importObject3D(project, text, file.name.replace(/\.obj$/i, '') || 'Imported OBJ'); }); select(id); updateStage({ enabled: true, camera3d: { ...defaultCamera3D(), ...(stage.camera3d ?? {}), enabled: true } }, 'OBJ imported · true 3D camera enabled'); } catch (error) { onStatus(error instanceof Error ? error.message : 'Could not import OBJ'); } }); event.target.value = '';
  };

  const openAngleDemo = () => {
    if (smartEdit) return;
    if ((rig.layers.size || rig.bones.size) && !window.confirm('Open the 2.5D view-angle demo? Undo restores your current project.')) return;
    pause();
    const demo = createStageDemo();
    replaceProject(demo.toProject());
    select([...demo.layers.values()].find(layer => (layer.depth ?? 0) < 0)?.id ?? null);
    useProject.setState({ zoom: 0.9 });
    onStatus('2.5D demo · switch Front / Right +45° / Isometric to see depth-separated artwork');
  };

  return (
    <div className="stage-panel">
      <section className="stage-hero">
        <div className="section-title"><span>Stage & 3D layers</span><span className={`stage-badge ${stage.camera3d?.enabled ? 'active' : stage.enabled ? 'active' : ''}`}>{stage.camera3d?.enabled ? 'TRUE 3D' : stage.enabled ? '2.5D' : 'OFF'}</span></div>
        <p className="stage-lede">Use legacy 2.5D staging or enable a physical 3D camera for depth-aware artwork, imported geometry, lights, shadows, and focus.</p>
        <fieldset disabled={Boolean(smartEdit)} className="stage-fields">
           <label className="stage-toggle"><input aria-label="Enable 2.5D preview" type="checkbox" checked={stage.enabled} onChange={(event) => updateStage({ enabled: event.target.checked }, event.target.checked ? '2.5D preview enabled · editing is read-only' : '2.5D preview disabled · editing restored')} /><span><strong>Enable 2.5D preview</strong><small>{stage.enabled ? 'Artwork is staged around the canvas center.' : 'Artwork renders in the standard 2D view.'}</small></span></label>
           <label className="stage-toggle"><input aria-label="Enable true 3D stage" type="checkbox" checked={Boolean(stage.camera3d?.enabled)} onChange={(event) => updateStage({ enabled: true, camera3d: { ...defaultCamera3D(), ...(stage.camera3d ?? {}), enabled: event.target.checked } }, event.target.checked ? 'True 3D stage enabled' : 'True 3D stage disabled')} /><span><strong>Enable true 3D stage</strong><small>{stage.camera3d?.enabled ? 'Physical camera projection is active.' : 'Use the Camera dock to configure a physical lens.'}</small></span></label>
        </fieldset>
        <button className="secondary-button full-button stage-demo-button" disabled={Boolean(smartEdit)} onClick={openAngleDemo}><Box size={14} /> Open view-angle demo</button>
        <input ref={objectInput} className="hidden-input" type="file" accept=".obj,text/plain" onChange={importOBJ} />
        <button className="secondary-button full-button" disabled={Boolean(smartEdit)} onClick={() => objectInput.current?.click()}><Upload size={14} /> Import OBJ object</button>
      </section>

      <section className="stage-section stage-angle-section">
        <div className="section-title"><span>View angle</span><span className="stage-angle-badge">Y / P / R</span></div>
        <fieldset disabled={Boolean(smartEdit)} className="stage-fields">
          <StageRange label="Yaw (left / right)" value={stage.yaw} min={-180} max={180} step={1} onChange={value => updateStage({ yaw: value }, `2.5D yaw ${value}°`)} format={value => `${value}°`} />
          <StageRange label="Pitch (up / down)" value={stage.pitch} min={-85} max={85} step={1} onChange={value => updateStage({ pitch: value }, `2.5D pitch ${value}°`)} format={value => `${value}°`} />
          <StageRange label="Roll (camera tilt)" value={stage.roll} min={-180} max={180} step={1} onChange={value => updateStage({ roll: value }, `2.5D roll ${value}°`)} format={value => `${value}°`} />
          <div className="stage-angle-presets" aria-label="2.5D view presets">{STAGE_VIEW_PRESETS.map(preset => <button key={preset.name} type="button" aria-pressed={stage.yaw === preset.yaw && stage.pitch === preset.pitch && stage.roll === preset.roll} onClick={() => updateStage({ yaw: preset.yaw, pitch: preset.pitch, roll: preset.roll }, `2.5D view: ${preset.name}`)}>{preset.name}</button>)}</div>
        </fieldset>
        <p className="stage-footnote">Flat artwork foreshortens when viewed from the side. Set different layer depths to see orbit separation.</p>
      </section>

      <section className="stage-section">
        <div className="section-title"><span>Camera</span><Move size={14} className="section-muted" /></div>
        <fieldset disabled={Boolean(smartEdit)} className="stage-fields">
          <StageRange label="Camera X" value={stage.cameraX} min={-400} max={400} step={1} onChange={(value) => updateStage({ cameraX: value }, `Stage camera X ${Math.round(value)}`)} format={(value) => `${Math.round(value)} px`} />
          <StageRange label="Camera Y" value={stage.cameraY} min={-260} max={260} step={1} onChange={(value) => updateStage({ cameraY: value }, `Stage camera Y ${Math.round(value)}`)} format={(value) => `${Math.round(value)} px`} />
          <StageRange label="Zoom" value={stage.zoom} min={0.5} max={2.5} step={0.01} onChange={(value) => updateStage({ zoom: value }, `Stage zoom ${Math.round(value * 100)}%`)} format={(value) => `${Math.round(value * 100)}%`} />
          <StageRange label="Perspective" value={stage.perspective} min={0} max={0.8} step={0.01} onChange={(value) => updateStage({ perspective: value }, `Stage perspective ${Math.round(value * 100)}%`)} format={(value) => `${Math.round(value * 100)}%`} />
        </fieldset>
        <button className="secondary-button full-button stage-reset" disabled={Boolean(smartEdit)} onClick={() => updateStage({ cameraX: 0, cameraY: 0, zoom: 1, perspective: 0, yaw: 0, pitch: 0, roll: 0 }, 'Stage camera reset to front view')}>Reset camera</button>
      </section>

      <section className="stage-section stage-layer-section">
        <div className="section-title"><span>Selected artwork depth</span><Grid3X3 size={14} className="section-muted" /></div>
        <label className="style-layer-select stage-layer-select"><span>Artwork layer</span><select value={selectedLayer?.id ?? ''} onChange={(event) => select(event.target.value || null)}><option value="">Select artwork…</option>{artwork.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>
        {!selectedLayer && <p className="scope-note">Select an image or vector layer to tune its depth and parallax.</p>}
        {selectedLayer && <fieldset disabled={Boolean(smartEdit)} className="stage-fields">
          <StageRange label="Depth" value={selectedLayer.depth ?? 0} min={-1000} max={1000} step={10} onChange={(value) => updateLayer('depth', value)} format={(value) => `${Math.round(value)}`} />
          <StageRange label="Parallax" value={selectedLayer.parallax ?? 1} min={0} max={4} step={0.05} onChange={(value) => updateLayer('parallax', value)} format={(value) => `${value.toFixed(2)}×`} />
        </fieldset>}
        {selectedLayer && <fieldset disabled={Boolean(smartEdit)} className="stage-fields stage-3d-layer-fields"><div className="property-subtitle"><Box size={13} /> 3D layer transform</div><div className="property-grid"><label className="camera-field">X<input aria-label="3D layer X" type="number" value={selectedLayer.transform3d?.position.x ?? 0} onChange={event => update3D({ position: { ...(selectedLayer.transform3d?.position ?? { x: 0, y: 0, z: 0 }), x: Number(event.target.value) } })} /></label><label className="camera-field">Y<input aria-label="3D layer Y" type="number" value={selectedLayer.transform3d?.position.y ?? 0} onChange={event => update3D({ position: { ...(selectedLayer.transform3d?.position ?? { x: 0, y: 0, z: 0 }), y: Number(event.target.value) } })} /></label><label className="camera-field">Z / depth shift<input aria-label="3D layer Z" type="number" value={selectedLayer.transform3d?.position.z ?? 0} onChange={event => update3D({ position: { ...(selectedLayer.transform3d?.position ?? { x: 0, y: 0, z: 0 }), z: Number(event.target.value) } })} /></label>{(['x', 'y', 'z'] as const).map(axis => <label className="camera-field" key={axis}>Rotate {axis.toUpperCase()}<input aria-label={`3D layer rotation ${axis.toUpperCase()}`} type="number" value={selectedLayer.transform3d?.rotation[axis] ?? 0} onChange={event => update3D({ rotation: { ...(selectedLayer.transform3d?.rotation ?? { x: 0, y: 0, z: 0 }), [axis]: Number(event.target.value) } })} /></label>)}</div><div className="property-grid"><button className="secondary-button" disabled={selectedLayer.type !== 'vector'} onClick={() => updateProject(project => { if (generateLayer3D(project, selectedLayer.id, 'extrude', 30)) onStatus('Vector extruded into 3D geometry'); })}>Extrude</button><button className="secondary-button" disabled={selectedLayer.type !== 'vector'} onClick={() => updateProject(project => { if (generateLayer3D(project, selectedLayer.id, 'inflate', 30)) onStatus('Vector inflated into 3D geometry'); })}>Inflate</button><button className="secondary-button" disabled={selectedLayer.type !== 'vector'} onClick={() => updateProject(project => { if (generateLayer3D(project, selectedLayer.id, 'lathe', 30, 24)) onStatus('Vector lathed into 3D geometry'); })}>Lathe</button></div><p className="scope-note">Z shifts the layer through the camera. Rotation and scale are true 3D transforms. Generated geometry supports flat key lighting, soft shadows, perspective, and depth of field.</p></fieldset>}
        <p className="stage-footnote">Positive depth brings a plane toward the front-view camera; negative depth pushes it back. Parallax controls how strongly it follows camera pan.</p>
      </section>

      <section className="stage-help"><strong>2.5D artwork planes</strong><p>View angles transform your existing artwork. Side view makes planes edge-on; back view mirrors them. Bones are hidden in this read-only view. Disable the preview to edit the rig.</p></section>
    </div>
  );
}

function App() {
  const { rig, tool, setTool, select, selectedId, selectedIds, deserialize, serialize, updateProject, replaceProject, pause, undo, redo, canUndo, canRedo, keyPose, smartEdit, onionSkin, setOnionSkin } = useProject();
  const [activeTool, setActiveTool] = useState<StudioTool>(tool);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('environment');
  const [projectName, setProjectName] = useState('Untitled Character');
  const [status, setStatus] = useState('Ready');
  const [dockTab, setDockTab] = useState<DockTabId>('rig');
  const [dockLayout, setDockLayout] = useState<DockLayoutState<DockTabId>>(() => readDockLayout(DOCK_TAB_IDS));
  const [sceneObjectsMinimized, setSceneObjectsMinimized] = useState(false);
  const [timelineMinimized, setTimelineMinimized] = useState(false);
  const [motionPreviewActive, setMotionPreviewActive] = useState(false);
  const [motionCameraTracking, setMotionCameraTracking] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [characterStudioOpen, setCharacterStudioOpen] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [assetDrawerOpen, setAssetDrawerOpen] = useState(false);
  const [assetStoreOpen, setAssetStoreOpen] = useState(false);
  const [activeMotionPathId, setActiveMotionPathId] = useState<string | null>(null);
  useAudioPlayback(setStatus);
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [brush, setBrush] = useState<BrushSettings>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('character-studio-brush:v1') ?? 'null') as Partial<BrushSettings> | null;
      if (saved && typeof saved.id === 'string' && BRUSH_PRESETS.some(item => item.id === saved.id)) return { ...DEFAULT_BRUSH, ...saved } as BrushSettings;
    } catch { /* use defaults when storage is unavailable */ }
    return { ...DEFAULT_BRUSH };
  });
  const [drawMode, setDrawMode] = useState<DrawMode>('brush');
  const [drawFillEnabled, setDrawFillEnabled] = useState(true);
  const [drawFillColor, setDrawFillColor] = useState('#69b7ff');
  const [weightRadius, setWeightRadius] = useState(28);
  const [weightStrength, setWeightStrength] = useState(.25);
  const [chain, setChain] = useState('2');
  const chainLength = chain === 'full' ? undefined : Number(chain);
  const [bindSourceId, setBindSourceId] = useState<string | null>(null);
  const [bindTargetId, setBindTargetId] = useState<string | null>(null);
  const bindSource = bindSourceId ? rig.layers.get(bindSourceId) : undefined;
  const projectInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const seeded = useRef(false);
  const dockDefinitions = dockTabDefinitions();

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const restored = useProject.getState().loadFromStorage();
    if (restored) {
      const loaded = useProject.getState().rig;
      select([...loaded.layers.keys()][0] ?? [...loaded.bones.keys()][0] ?? null);
      setProjectName(loaded.name || 'Untitled Character');
      setStatus('Restored autosaved project');
    }
  }, [rig, select]);

  useEffect(() => { setProjectName(rig.name || 'Untitled Character'); }, [rig]);
   useEffect(() => { if (bindSourceId && !rig.layers.has(bindSourceId)) { setBindSourceId(null); setBindTargetId(null); } if (bindTargetId && !rig.bones.has(bindTargetId)) setBindTargetId(null); }, [rig, bindSourceId, bindTargetId]);
  useEffect(() => { try { window.localStorage.setItem('character-studio-brush:v1', JSON.stringify(brush)); } catch { /* preferences are optional */ } }, [brush]);
  useEffect(() => { writeDockLayout(dockLayout); }, [dockLayout]);

  const { version } = useProject();
  useEffect(() => {
    // A binding changed outside the bind tool (Properties, Auto Rig, Undo, or
    // Redo) must update the target highlight and the mapping board. A pending
    // target is only local UI state and is not persisted until Map is pressed.
    setBindTargetId(bindSourceId ? rig.layers.get(bindSourceId)?.boundBoneId ?? null : null);
  }, [bindSourceId, rig, version]);
  const autosaveWarning = useRef(false);
  useEffect(() => {
    // Temporary motion poses must never replace the persisted authored project.
    if (motionPreviewActive) return;
    const timer = window.setTimeout(() => {
      const state = useProject.getState();
      const saved = state.saveToStorage();
      if (!saved && state.rig.audio && !autosaveWarning.current) {
        setStatus('Browser autosave could not store this audio project. Use Save to download the full project JSON.');
        autosaveWarning.current = true;
      } else if (saved) autosaveWarning.current = false;
    }, 250);
    return () => window.clearTimeout(timer);
  }, [version, motionPreviewActive]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (videoOpen || propsOpen) return;
      if (event.defaultPrevented || (event.target instanceof HTMLElement && event.target.closest('[data-controller-test]'))) return;
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (motionPreviewActive) {
        if ((event.metaKey || event.ctrlKey) && ['s', 'z'].includes(event.key.toLowerCase())) {
          event.preventDefault();
          setStatus('Apply or cancel the temporary motion preview before saving or using Undo');
        }
        return;
      }
      if (event.key === 'F4') {
        event.preventDefault();
        setAssetStoreOpen(open => !open);
        setStatus(assetStoreOpen ? 'Asset Store closed' : 'Asset Store opened');
        return;
      }
       const shortcuts: Record<string, StudioTool> = { v: 'select', b: 'bone', l: 'bind', i: 'ik', d: 'draw', h: 'hand', m: 'mesh', w: 'weight', c: 'camera', p: 'path' };
      const next = shortcuts[event.key.toLowerCase()];
      if (next && !event.metaKey && !event.ctrlKey && !event.altKey) activateTool(next);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault(); pause();
        if (event.shiftKey) redo(); else undo();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveProject();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function handleBindSource(id: string | null) {
    setBindSourceId(id);
    setBindTargetId(id ? rig.layers.get(id)?.boundBoneId ?? null : null);
    if (id) select(id);
  }

  function activateTool(next: StudioTool) {
    if (motionPreviewActive) { setStatus('3D motion preview · Apply or Cancel before changing tools'); return; }
    if (useProject.getState().smartEdit && ['bone', 'bind', 'ik', 'draw', 'weight', 'path'].includes(next)) { setStatus('Capture or cancel the action edit first · Select and Mesh remain available'); return; }
    if (next === 'bind' && !bindSource && selectedId && rig.layers.has(selectedId)) handleBindSource(selectedId);
    setActiveTool(next);
    if (next === 'camera') setDockTab('camera');
    if (next === 'mesh' || next === 'weight' || next === 'bind') setDockTab('rig');
    if (next === 'draw') { setDockTab('brushes'); return; }
    setTool(next);
  }

  function openJoystickWorkspace() {
    setWorkspaceMode('animation');
    setDockTab('joystick');
    setDockLayout(previous => ({ ...previous, collapsed: false }));
    setActiveTool('select');
    setStatus('Joystick Control workspace · each input stream is scoped to its character');
  }

  function selectDockTab(next: DockTabId) {
    if (next === 'joystick') {
      setWorkspaceMode('animation');
      setActiveTool('select');
      setTool('select');
      setDockLayout(previous => ({ ...previous, collapsed: false }));
      setStatus('Animation workspace · Joystick Control is connected to the current Rig');
    }
    setDockTab(next);
  }

  function activateWorkspace(next: WorkspaceMode) {
    setWorkspaceMode(next);
    if (next === 'environment') { setDockTab('camera'); activateTool('select'); setStatus('Environment workspace · terrain, atmosphere, assets and camera blocking'); return; }
    if (next === 'character') { setDockTab('views'); activateTool('select'); setStatus('Character Studio workspace'); return; }
    if (next === 'rigging') { setDockTab('rig'); activateTool('bind'); setStatus('Rigging workspace · map artwork across front, side and back views'); return; }
    if (next === 'deformation') { setDockTab('rig'); activateTool('mesh'); setStatus('Deformation workspace · mesh points and weights'); return; }
    openJoystickWorkspace();
  }

  function setDockPlacement(placement: DockLayoutState<DockTabId>['placement']) {
    setDockLayout(previous => ({ ...previous, placement, collapsed: false }));
    setStatus(placement === 'bottom' ? 'Tool dock moved below the stage · drag the top edge to resize' : 'Tool dock moved to the right · drag the left edge to resize');
  }

  function reorderDockTabs(from: DockTabId, to: DockTabId) {
    setDockLayout(previous => {
      const order = [...previous.tabOrder];
      const fromIndex = order.indexOf(from), toIndex = order.indexOf(to);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return previous;
      order.splice(fromIndex, 1);
      order.splice(toIndex, 0, from);
      return { ...previous, tabOrder: order };
    });
    setStatus('Dock tabs reordered · layout saved automatically');
  }

  function resetDockLayout() {
    setDockLayout(defaultDockLayout(DOCK_TAB_IDS));
    setDockTab('rig');
    setStatus('Dock layout reset · all tools restored to the right dock');
  }

  function handlePathCreated(points: Point[]) {
    const id = useProject.getState().createMotionPath(points, selectedId);
    if (id) { setActiveMotionPathId(id); setStatus('Motion path saved · set the frame range and bake Follow path in the Inspector'); }
    else setStatus('Could not create a motion path · select an unlocked object first');
  }

  function resetProject() {
    if ((rig.layers.size || rig.bones.size) && !window.confirm('Create a new project? Your current project can be restored with Undo.')) return;
    pause();
    replaceProject(new Rig().toProject());
    select(null);
    setBindSourceId(null);
    setBindTargetId(null);
    setAssetDrawerOpen(false);
    setAssets({});
    setProjectName('Untitled Character');
    setStatus('New project created');
  }

  function openExample() {
    if ((rig.layers.size || rig.bones.size) && !window.confirm('Replace the current project with the rigged example? Undo restores your work.')) return;
    pause();
    const demo = createDemoRig();
    replaceProject(demo.toProject());
    select([...demo.bones.values()].find(bone => /lower arm|forearm/i.test(bone.name))?.id ?? demo.getRoots()[0]?.id ?? null);
    useProject.setState({ zoom: 0.9 });
    setProjectName(demo.name);
    setBindSourceId(null);
    setBindTargetId(null);
    setAssetDrawerOpen(false);
    setAssets({});
    setChain('2');
    setWorkspaceMode('rigging');
    activateTool('ik');
    setStatus('Rigged example ready · Drag a forearm or shin · Alt-drag for FK');
  }

  function openDeformationExample() {
    if (!window.confirm('Replace the current project with the deformation example? Undo restores your work.')) return;
    pause();
    const demo = createDeformationDemo();
    replaceProject(demo.toProject());
    select([...demo.layers.values()].find(layer => layer.mesh)?.id ?? null);
    useProject.setState({ zoom: 0.9 });
    setAssets({}); setBindSourceId(null); setProjectName(demo.name);
    setBindTargetId(null); setAssetDrawerOpen(false);
    setWorkspaceMode('deformation');
    activateTool('mesh');
    setStatus('Deformation example · Drag mesh points with M; choose an action and preview its driver in the dock');
  }

  function mapBone(boneId: string) {
    if (smartEdit) { setStatus('Capture or cancel the action edit first'); return; }
    if (!bindSource) { setStatus('Choose source artwork first, then click a bone'); return; }
    if (bindSource.locked) { setStatus('Unlock the source artwork before binding'); return; }
    if (bindSource.mesh) { setStatus('Mesh artwork: choose influences in Mesh & weights instead of rigid binding'); return; }
    const bone = rig.bones.get(boneId);
    if (!bone) { setStatus('Choose a valid bone from the stage or Bone rig list'); return; }
    if (bone.locked) { setStatus(`${bone.name} is locked · unlock it in Bone rig before mapping`); return; }
    pause();
    const didBind = useProject.getState().bind(bindSource.id, boneId);
    if (didBind) setBindTargetId(boneId);
    setStatus(didBind ? `${bindSource.name} → ${bone.name} · mapped · dotted guide shows the connection` : 'Could not bind to that bone');
  }

  function saveProject() {
    if (smartEdit) { setStatus('Capture or cancel the action edit before saving'); return; }
    pause();
    updateProject((projectRig) => { projectRig.name = projectName; });
    downloadFile(`${projectName.replace(/\s+/g, '-').toLowerCase() || 'character'}.json`, 'application/json', serialize(true));
    setStatus('Project saved to Downloads');
  }

  function exportSvg() {
    const svg = projectToSVG(rig);
    downloadFile(`${projectName.replace(/\s+/g, '-').toLowerCase() || 'character'}.svg`, 'image/svg+xml', svg);
    setStatus('SVG exported to Downloads');
  }

  async function exportPng() {
    try {
      await downloadPNG(rig, `${projectName.replace(/\s+/g, '-').toLowerCase() || 'character'}.png`);
      setStatus('PNG exported to Downloads');
    } catch {
      setStatus('PNG export failed in this browser');
    }
  }

  function addKeyframeForSelection() {
    if (smartEdit) { setStatus('Use Capture key in Smart Bone Actions to save this edit'); return; }
    if (!selectedId) return;
    pause();
    if (rig.groups.has(selectedId)) {
      updateProject(project => { keyGroupProperty(project, selectedId, 'transform'); });
      setStatus(`Group transform keyframe added at frame ${useProject.getState().rig.timeline.currentFrame}`);
      return;
    }
    const ids = activeTool === 'ik' && rig.bones.has(selectedId) ? poseChainIds(rig, selectedId, chainLength) : selectedIds.length > 1 ? selectedIds : [selectedId];
    keyPose(ids);
    setStatus(`${activeTool === 'ik' ? 'Chain keyframes' : ids.length > 1 ? `${ids.length} object keyframes` : 'Keyframe'} added at frame ${useProject.getState().rig.timeline.currentFrame}`);
  }

  function importProjectFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        pause();
        const raw = String(reader.result);
        let payload: unknown = null;
        try { payload = JSON.parse(raw); } catch { /* deserializeProject reports the user-facing parse error */ }
        const environmentProject = isEnvironmentProjectPayload(payload, file.name);
        const normalized = deserializeProject(raw);
        const prepared = prepareCharacterStudioImport(normalized);
        replaceProject(prepared.project);
        const openedRig = useProject.getState().rig;
        if (environmentProject) attachEnvironmentPayload(openedRig, payload);
        setProjectName(openedRig.name || file.name.replace(/\.json$/i, ''));
        if (prepared.summary.viewSetId) useProject.getState().selectCharacter(prepared.summary.viewSetId);
        select(prepared.summary.rootId ?? [...openedRig.layers.keys()][0] ?? [...openedRig.bones.keys()][0] ?? null);
         setAssets({});
         setBindSourceId(null);
         setBindTargetId(null);
         setAssetDrawerOpen(false);
         if (prepared.summary.viewSetId) setDockTab('views');
         if (prepared.summary.rootId && !environmentProject) activateTool('ik');
         if (environmentProject) activateWorkspace('environment');
         else if (workspaceMode === 'environment') activateWorkspace(prepared.summary.rootId ? 'rigging' : 'animation');
         const details = prepared.summary.prepared
           ? ` · rigging toolkit ready · ${prepared.summary.viewCount} angles · ${prepared.summary.weightedLayerIds.length} clothing maps · ${prepared.summary.clothIds.length} cloth physics objects · Weight paint ready`
           : '';
         const environmentDetails = environmentProject ? ' · Environment workspace ready' : '';
         setCharacterStudioOpen(false);
         setStatus(`Opened ${file.name}${details}${environmentDetails}`);
      } catch {
        setStatus('Could not open that project file');
      }
    };
    reader.readAsText(file);
  }

  function openProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    importProjectFile(file);
    event.target.value = '';
  }

  function importImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (rig.getStageView().enabled) {
      setStatus('Select Preview and disable Stage preview to import artwork');
      event.target.value = '';
      return;
    }
    importArtworkFile(file, setStatus);
    event.target.value = '';
  }

  function environmentFallbackShapes(asset: EnvironmentAssetDefinition): VectorShape[] {
    const [sky, ground, accent] = asset.colors;
    const base: VectorShape[] = [
      { id: `${asset.id}-sky`, kind: 'rect', x: 0, y: 0, width: 800, height: 320, fill: sky, stroke: 'none', opacity: .96 },
      { id: `${asset.id}-ground`, kind: 'rect', x: 0, y: 320, width: 800, height: 200, fill: ground, stroke: 'none', opacity: .96 },
      { id: `${asset.id}-ridge`, kind: 'polygon', points: [{ x: 0, y: 350 }, { x: 130, y: 275 }, { x: 250, y: 344 }, { x: 390, y: 245 }, { x: 535, y: 336 }, { x: 670, y: 270 }, { x: 800, y: 350 }, { x: 800, y: 520 }, { x: 0, y: 520 }], fill: accent, stroke: 'none', opacity: .78 },
    ];
    if (asset.id === 'environment-coastal-dusk') {
      base.push({ id: `${asset.id}-water`, kind: 'rect', x: 0, y: 360, width: 800, height: 160, fill: ground, stroke: '#b8d9d8', strokeWidth: 1, opacity: .76 });
      base.push({ id: `${asset.id}-sun`, kind: 'ellipse', x: 570, y: 154, radiusX: 48, radiusY: 48, fill: '#ffd78d', stroke: '#fff0b3', strokeWidth: 2, opacity: .9 });
    } else if (asset.id === 'environment-urban-block') {
      [80, 225, 405, 600].forEach((x, index) => base.push({ id: `${asset.id}-building-${index}`, kind: 'rect', x, y: 190 - index * 18, width: 92 + index * 10, height: 180 + index * 18, fill: index % 2 ? accent : ground, stroke: '#b2c4c1', strokeWidth: 2, opacity: .86 }));
    } else {
      [105, 270, 710].forEach((x, index) => {
        base.push({ id: `${asset.id}-tree-${index}`, kind: 'rect', x, y: 267 - index * 8, width: 9, height: 92 + index * 10, fill: '#4b3830', stroke: 'none', opacity: .9 });
        base.push({ id: `${asset.id}-canopy-${index}`, kind: 'ellipse', x: x + 4, y: 240 - index * 8, radiusX: 42 + index * 6, radiusY: 51 + index * 4, fill: accent, stroke: '#b6d59d', strokeWidth: 2, opacity: .88 });
      });
    }
    return base;
  }

  function addEnvironmentAsset(asset: EnvironmentAssetDefinition): string[] {
    if (smartEdit || motionPreviewActive) { setStatus('Finish the current edit before adding an environment asset'); return []; }
    const currentRig = useProject.getState().rig;
    if (asset.id === 'environment-willow-village' && currentRig.environment?.assetIds.includes(asset.id)) {
      const existingIds = currentRig.environment.layers.filter(layer => currentRig.layers.has(layer.id)).map(layer => layer.id);
      if (existingIds.length) {
        select(existingIds[Math.min(4, existingIds.length - 1)]);
        activateWorkspace('environment');
        setStatus('Willow village is already in the scene · select any prop to keep editing');
      }
      return existingIds;
    }
    pause();
    let ids: string[] = [];
    updateProject(project => {
      if (asset.id === 'environment-willow-village') {
        ids = addVillageScene(project).items.map(item => item.id);
        return;
      }
      const id = project.addVectorLayer(`${asset.name} backdrop`, environmentFallbackShapes(asset));
      ids = [id];
      const layer = project.layers.get(id);
      if (layer) layer.zIndex = Math.min(-100, ...[...project.layers.values()].map(candidate => candidate.id === id ? -100 : candidate.zIndex));
    });
    if (ids.length) select(asset.id === 'environment-willow-village' ? ids[Math.min(4, ids.length - 1)] : ids[0]);
    activateWorkspace('environment');
    setStatus(ids.length ? asset.id === 'environment-willow-village' ? 'Willow village added · 10 editable props are ready to select, move, and rescale' : `${asset.name} added · shared stage backdrop is editable` : `Could not add ${asset.name}`);
    return ids;
  }

  function applyCharacterDesign(design: CharacterDesign) {
    let groupId = '';
    let rootId = '';
    updateProject(project => {
      const result = addStudioCharacter(project, design);
      if (result) { groupId = result.groupId; rootId = result.rootId; }
    });
    select(groupId || rootId || null);
    activateTool('select');
    setCharacterStudioOpen(false);
    setStatus(groupId ? 'Character added as editable head, neck, shirt, pants, and shoe rig parts' : 'Could not add the character while the current action is being edited');
  }

  function exportCharacterProject(design: CharacterDesign) {
    const exportRig = new Rig();
    exportRig.name = `${design.gender === 'female' ? 'Female' : 'Male'} character`;
    exportRig.canvas = { width: 800, height: 520, background: '#20242d' };
    const result = addStudioCharacter(exportRig, design);
    if (!result) { setStatus('Could not export the character while the current action is being edited'); return; }
    const project = exportRig.toProject();
    project.metadata = { ...(project.metadata ?? {}), exportType: 'character-studio-project', exportHint: 'Open this JSON in Animation Studio', characterDesign: JSON.stringify(design) };
    downloadFile(`${design.gender}-character-studio.json`, 'application/json', JSON.stringify(project, null, 2));
    setStatus('Native character project exported · use Open in Animation Studio to load it');
  }

  function applyPropDesign(design: PropDesign) {
    const state = useProject.getState();
    if (state.smartEdit || motionPreviewActive) throw new Error('Finish the current edit or motion preview before adding a prop.');
    // Preflight and construct off-store, so a failed operation cannot leave a partial prop.
    const next = new Rig(state.rig.toProject());
    const result = addDesignedProp(next, design);
    next.cameraView = 'preview';
    next.stage2d.enabled = false;
    next.timeline.isPlaying = false;
    state.pause();
    state.replaceProject(next.toProject());
    state.select(result.rootId);
    state.selectCharacter(result.viewSetId);
    setBindSourceId(null);
    setPropsOpen(false);
    setDockTab('views');
    activateTool('select');
    setStatus(`${design.name} added · eight views · ${result.warnings.join(' ') || 'editable vector prop'} · Undo removes it`);
  }

  function exportPropDesign(design: PropDesign) {
    const standalone = createPropRig(design);
    downloadFile(`${standalone.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'prop'}-prop.json`, 'application/json', standalone.toJSON(true));
    setStatus('Prop project exported · Open the JSON to restore artwork, eight views, and physics');
  }

    const selectedLabel = selectedId ? rig.images.get(selectedId)?.name ?? rig.vectors.get(selectedId)?.name ?? rig.bones.get(selectedId)?.name ?? rig.groups.get(selectedId)?.name ?? 'Unknown' : 'Nothing selected';
    const sharedCanvasStage = <CanvasStage key={rig.id} activeTool={activeTool} onActivateTool={activateTool} assets={assets} onStatus={setStatus} chainLength={chainLength} bindSourceId={bindSource?.id ?? null} bindTargetId={bindTargetId} onBindSource={handleBindSource} onMapBone={mapBone} motionPreviewActive={motionPreviewActive} motionCameraTracking={motionCameraTracking} brush={brush} weightRadius={weightRadius} weightStrength={weightStrength} drawMode={drawMode} drawFillEnabled={drawFillEnabled} drawFillColor={drawFillColor} onPathCreated={handlePathCreated} activeMotionPathId={activeMotionPathId} />;
  return (
     <div className={`studio-app ${timelineMinimized ? 'timeline-minimized' : ''}`}>
       <header className="topbar">
        <div className="brand-mark"><span className="brand-glyph"><BoneIcon size={17} /></span><span>MOHO <strong>STUDIO</strong></span></div>
        <div className="project-selector" title="Project selector"><FolderOpen size={14} /><input disabled={Boolean(smartEdit) || motionPreviewActive} value={projectName} onChange={(event) => setProjectName(event.target.value)} aria-label="Project name" /><ChevronDown size={14} /></div>
        <button className="props-toolkit-launch" disabled={Boolean(smartEdit) || motionPreviewActive || characterStudioOpen} onClick={() => { pause(); setPropsOpen(true); }}><Box size={15} /> Props toolkit</button>
        <div className="topbar-spacer" />
          <fieldset disabled={Boolean(smartEdit) || motionPreviewActive} className="top-actions"><button className="character-studio-launch" onClick={() => setCharacterStudioOpen(true)}><Sparkles size={15} /><span>Character studio</span></button><button className="example-button" onClick={openExample}><BoneIcon size={15} /><span>Rigged example</span></button><button className="example-button" onClick={openDeformationExample}><Grid3X3 size={15} /><span>Deformation example</span></button><button onClick={resetProject} title="New project"><FilePlus2 size={15} /><span>New</span></button><button onClick={() => projectInput.current?.click()} title="Open project"><FolderOpen size={15} /><span>Open</span></button><button onClick={saveProject} title="Save project"><Save size={15} /><span>Save</span></button><button onClick={exportSvg} title="Export SVG"><Download size={15} /><span>SVG</span></button><button onClick={exportPng} title="Export PNG"><Download size={15} /><span>PNG</span></button><button title="App settings" onClick={() => setStatus('Settings are saved automatically in this browser')}><Settings2 size={15} /><span>Settings</span></button><button className="video-export-button" title="Export video" onClick={() => { pause(); setVideoOpen(true); }}><Film size={15} /><span>Video</span></button></fieldset>
        <span className="window-controls" aria-hidden="true"><Minus size={13} /><span>□</span><span>×</span></span>
        <input ref={projectInput} className="hidden-input" type="file" accept="application/json,.json" onChange={openProject} /><input ref={imageInput} className="hidden-input" type="file" accept="image/*" onChange={importImage} />
      </header>
       <div className="workspacebar">
          <div className="workspace-modes" role="tablist" aria-label="Workspace modes">
            <button role="tab" aria-selected={workspaceMode === 'environment'} onClick={() => activateWorkspace('environment')}><Globe2 size={14} /> Environment</button>
            <button role="tab" aria-selected={workspaceMode === 'character'} onClick={() => activateWorkspace('character')}><Sparkles size={14} /> Character Studio</button>
            <button role="tab" aria-selected={workspaceMode === 'rigging'} onClick={() => activateWorkspace('rigging')}><BoneIcon size={14} /> Rigging</button>
            <button role="tab" aria-selected={workspaceMode === 'deformation'} onClick={() => activateWorkspace('deformation')}><Grid3X3 size={14} /> Deformation</button>
            <button role="tab" aria-selected={workspaceMode === 'animation'} onClick={() => activateWorkspace('animation')}><Film size={14} /> Animation</button>
          </div>
           <div className="workspace-context"><span className="context-label">WORKSPACE</span><strong>{workspaceMode.toUpperCase()}</strong><span className="context-description">{workspaceMode === 'environment' ? 'Block terrain, lighting, effects and camera coverage' : workspaceMode === 'animation' ? 'Drive saved Rig controllers on the shared stage' : activeTool === 'camera' ? 'Camera and viewport composition' : activeTool === 'mesh' ? 'Mesh deformation and editable weights' : activeTool === 'ik' ? 'Pose bones and animate selected chains' : 'Edit and animate your character'}</span>{activeTool === 'ik' && <label className="tool-option">Chain <select aria-label="IK chain length" value={chain} onChange={event => setChain(event.target.value)}><option value="1">1 bone</option><option value="2">2 · limb</option><option value="3">3 bones</option><option value="full">Full chain</option></select></label>}{activeTool === 'bind' && <label className="tool-option">Source <select aria-label="Bind source artwork" value={bindSource?.id ?? ''} onChange={event => handleBindSource(event.target.value || null)}><option value="">Choose artwork…</option>{rig.layersInOrder.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>}</div>
       </div>
        <div className="contextbar tool-tabs-bar">
          <div className="main-tool-tabs" role="tablist" aria-label="Main tool tabs">
            <button aria-selected={activeTool === 'ik' && workspaceMode === 'character'} onClick={() => activateTool('ik')}><Move size={14} /> Pose</button><button aria-selected={activeTool === 'bone'} onClick={() => activateTool('bone')}><BoneIcon size={14} /> Bones</button><button aria-selected={activeTool === 'select'} onClick={() => activateTool('select')}><MousePointer2 size={14} /> Select</button><button aria-selected={false} onClick={() => { activateTool('select'); setStatus('Transform tool · select an object to move, rotate or scale'); }}><Maximize2 size={14} /> Transform</button><button aria-selected={activeTool === 'ik' && workspaceMode !== 'character' && chain !== 'full'} onClick={() => activateTool('ik')}><Move size={14} /> IK</button><button aria-selected={activeTool === 'ik' && chain === 'full'} onClick={() => { setChain('full'); activateTool('ik'); }}><Route size={14} /> Chain</button><button aria-selected={dockTab === 'constraints'} onClick={() => { setDockTab('constraints'); setWorkspaceMode('rigging'); }}><Settings2 size={14} /> Constraint</button><button aria-selected={activeTool === 'weight'} onClick={() => activateTool('weight')}><Paintbrush size={14} /> Weight Paint</button><button aria-selected={activeTool === 'path'} onClick={() => activateTool('path')}><Route size={14} /> Motion Path</button><button aria-selected={activeTool === 'draw'} onClick={() => activateTool('draw')}><Pencil size={14} /> Draw</button><button aria-selected={false} onClick={() => { activateTool('draw'); setStatus('Eraser tool · use Draw mode controls to remove or redraw vector strokes'); }}><Trash2 size={14} /> Eraser</button>
             <button className="joystick-control-tab" aria-selected={workspaceMode === 'animation' && dockTab === 'joystick'} onClick={openJoystickWorkspace}><Gamepad2 size={14} /> Joystick Control</button>
          </div>
            <fieldset disabled={Boolean(smartEdit) || motionPreviewActive} className="context-actions"><button onClick={() => imageInput.current?.click()}><Upload size={14} /> Import</button><button aria-pressed={assetStoreOpen} onClick={() => setAssetStoreOpen(true)}><Sparkles size={14} /> Assets</button><button onClick={() => setDockTab('motion')}><Box size={14} /> Motion</button><button onClick={() => activateTool('camera')}><Camera size={14} /> Camera</button><button aria-pressed={onionSkin.enabled} onClick={() => { setOnionSkin({ enabled: !onionSkin.enabled }); setDockTab('onion'); setStatus(onionSkin.enabled ? 'Onion Skin disabled' : 'Onion Skin enabled · previous and next poses are visible'); }}><Layers3 size={14} /> Onion Skin</button><button onClick={() => setDockTab('views')}><CircleDot size={14} /> Views</button><button onClick={() => activateTool('draw')}><Pencil size={14} /> Draw</button><button onClick={() => activateTool('path')}><Route size={14} /> Path</button><button onClick={() => activateTool('weight')}><Paintbrush size={14} /> Weights</button>{activeTool === 'ik' && <button disabled={!selectedId} onClick={addKeyframeForSelection}><KeyRound size={14} /> Key pose</button>}<span className="context-divider" /><button title="Undo" disabled={!canUndo()} onClick={() => { pause(); undo(); }}><Undo2 size={15} /></button><button title="Redo" disabled={!canRedo()} onClick={() => { pause(); redo(); }}><Redo2 size={15} /></button></fieldset>
        </div>
          {workspaceMode === 'environment' ? <EnvironmentWorkspace stage={sharedCanvasStage} onStatus={setStatus} onImportProject={() => projectInput.current?.click()} onOpenAssetStore={() => setAssetStoreOpen(true)} onAddAsset={addEnvironmentAsset} onActivateCamera={() => activateTool('camera')} /> : <div className={`studio-body ${dockLayout.placement === 'bottom' ? 'dock-bottom' : ''} ${dockLayout.collapsed ? 'dock-collapsed' : ''}`} style={{ '--dock-width': `${dockLayout.width}px`, '--dock-height': `${dockLayout.height}px` } as React.CSSProperties}>
         <aside className="tool-rail">
              <div className="rail-group"><div className="rail-caption">TOOL PANEL</div><ToolButton icon={<MousePointer2 size={18} />} label="Select Tool" description="Select and move objects" shortcut="V" active={activeTool === 'select'} onClick={() => activateTool('select')} /><ToolButton icon={<BoneIcon size={18} />} label="Bone Tool" description="Create and edit bones" shortcut="B" active={activeTool === 'bone'} onClick={() => activateTool('bone')} /><ToolButton icon={<Pencil size={18} />} label="Draw Tool" description="Draw shapes and artwork" shortcut="D" active={activeTool === 'draw'} onClick={() => activateTool('draw')} /><ToolButton icon={<Grid3X3 size={18} />} label="Fill Tool" description="Fill colors" shortcut="F" active={false} onClick={() => setStatus('Fill tool · choose a vector shape or artwork color in the inspector')} /><ToolButton icon={<Maximize2 size={18} />} label="Transform Tool" description="Move, rotate, scale objects" shortcut="T" active={false} onClick={() => { activateTool('select'); setStatus('Transform tool · select an object to move, rotate or scale'); }} /><ToolButton icon={<FolderOpen size={18} />} label="Layer Tool" description="Manage layers and hierarchy" shortcut="L" active={activeTool === 'bind'} onClick={() => activateTool('bind')} /><ToolButton icon={<Paintbrush size={18} />} label="Weight Paint" description="Edit bone influences" shortcut="W" active={activeTool === 'weight'} onClick={() => activateTool('weight')} /><ToolButton icon={<Move size={18} />} label="IK / Pose" description="Pose and animate chains" shortcut="I" active={activeTool === 'ik'} onClick={() => activateTool('ik')} /><ToolButton icon={<Route size={18} />} label="Motion Path" description="Animate along a path" shortcut="P" active={activeTool === 'path'} onClick={() => activateTool('path')} /><ToolButton icon={<Camera size={18} />} label="Camera Tool" description="Set and animate camera" shortcut="C" active={activeTool === 'camera'} onClick={() => activateTool('camera')} /><ToolButton icon={<Hand size={18} />} label="Pan / More Tools" description="Additional viewport utilities" shortcut="H" active={activeTool === 'hand'} onClick={() => activateTool('hand')} /></div>
        </aside>
              <main className={`canvas-workspace ${workspaceMode === 'rigging' ? 'bone-mapping-canvas-workspace' : ''}`}>
              {workspaceMode === 'rigging' ? <BoneMappingBoard
                stage={sharedCanvasStage}
                activeTool={activeTool}
                onActivateTool={activateTool}
                sourceId={bindSourceId}
                targetId={bindTargetId}
                onSource={handleBindSource}
                onTarget={setBindTargetId}
                onMap={mapBone}
                onUnbind={() => {
                  if (!bindSource) return;
                  pause();
                  const didUnbind = useProject.getState().unbind(bindSource.id);
                  setBindTargetId(null);
                  setStatus(didUnbind ? `Unbound ${bindSource.name} · choose another bone to map it again` : `${bindSource.name} was already unbound`);
                }}
                assets={assets}
                onStatus={setStatus}
              /> : sharedCanvasStage}
             {assetDrawerOpen && <aside className="asset-library-drawer" aria-label="Main panel asset library"><div className="asset-library-drawer-heading"><span><Sparkles size={14} /> Content Manager · local templates</span><button aria-label="Close asset library" onClick={() => setAssetDrawerOpen(false)}>×</button></div><div className="asset-library-drawer-scroll"><AssetLibraryPanel onStatus={setStatus} onOpenStore={() => setAssetStoreOpen(true)} /></div></aside>}
             {rig.bones.size === 0 && rig.layers.size === 0 && <div className="canvas-welcome"><BoneIcon size={27} /><h1>Bring your character to life</h1><p>Build a rig from separate artwork layers,<br />or start posing an articulated character.</p><button className="secondary-button" onClick={openExample}>Open rigged example <ChevronRight size={14} /></button></div>}
             {dockLayout.collapsed && <button className="dock-reopen-button" type="button" onClick={() => setDockLayout(previous => ({ ...previous, collapsed: false }))}><Settings2 size={13} /> Open tool dock</button>}
            <details className="rig-help"><summary>Quick guide <ChevronDown size={12} /></summary><div className="help-content"><h3>Artwork → Mesh → Expressions</h3><ol><li><strong>Import a character.</strong> Open a Character Studio JSON such as <code>boy-character-walk-fixed-v2.json</code>. Humanoid files with prepared angles are upgraded with an editable rig, clothing meshes, normalized weights, and cloth physics while the authored views stay intact.</li><li><strong>Build & bind.</strong> Import or draw artwork. B creates bones; L rigidly maps a whole layer to one bone.</li><li><strong>Draw with brushes.</strong> Press D, choose Brushes, and select an ink, pencil, paint, texture, or effects preset. Each stroke stays an editable vector layer.</li><li><strong>Deform artwork.</strong> M selects artwork through bones. Create a triangle grid in Mesh & weights. Drag dots, choose bones for auto weights, then adjust a vertex’s normalized influences.</li><li><strong>Paint weights.</strong> Select a bone in the heatmap influence field, press W or Paint selected influence, then drag across the mesh. Hold Shift to erase. UVs and topology remain fixed.</li><li><strong>Cloth physics.</strong> Imported clothing appears as weighted mesh objects in Dynamics & physics. Tune pins, pose follow, travel, wind, then build a deterministic cache or bake to keys.</li><li><strong>Create expressions.</strong> In Smart Bone Actions choose a driver, range and targets. Edit key, adjust target transforms/opacity or mesh points, then Capture. Preview with the driver slider.</li><li><strong>Pose & animate.</strong> I poses chains; Alt-drag rotates one bone. Choose a frame and Add key to record transforms and mesh points.</li></ol><p>V moves a selection. Escape cancels a drag. Cancel edit restores your pose and history.</p><p className="scope-note">Meshes warp existing pixels; there is no automatic semantic image segmentation or generation of hidden pixels. Moho file compatibility is not claimed. Try the Deformation example; Undo restores your project.</p></div></details>
             </main>
              <aside className={`right-dock dock-${dockTab} dock-position-${dockLayout.placement} ${sceneObjectsMinimized ? 'scene-objects-minimized' : ''}`}>
               <DockResizeHandle placement={dockLayout.placement} size={dockLayout.placement === 'right' ? dockLayout.width : dockLayout.height} onResize={size => setDockLayout(previous => previous.placement === 'right' ? { ...previous, width: size } : { ...previous, height: size })} />
               <div className="scene-objects-dock">
                {activeTool === 'bind' && <BindWorkspace sourceId={bindSourceId} targetId={bindTargetId} onSource={handleBindSource} onTarget={setBindTargetId} onMap={mapBone} onUnbind={() => { if (bindSource) { pause(); useProject.getState().unbind(bindSource.id); setBindTargetId(null); } }} onStatus={setStatus} />}
                 <LayersPanel activeTool={activeTool} bindSourceId={bindSource?.id ?? null} onBindSource={handleBindSource} onMapBone={mapBone} sceneObjectsMinimized={sceneObjectsMinimized} onToggleSceneObjects={() => setSceneObjectsMinimized(previous => !previous)} />
             </div>
              <div className="dock-inspector">
              <div className="dock-inspector-heading"><span><Settings2 size={13} /> Inspector</span><div className="dock-inspector-heading-actions"><small>{selectedIds.length ? `${selectedIds.length} selected` : 'Select an object to edit'}</small><DockingToolbar placement={dockLayout.placement} collapsed={dockLayout.collapsed} onPlacement={setDockPlacement} onToggleCollapsed={() => setDockLayout(previous => ({ ...previous, collapsed: !previous.collapsed }))} onReset={resetDockLayout} /></div></div>
               <DockTabs definitions={dockDefinitions} order={dockLayout.tabOrder} activeId={dockTab} onSelect={selectDockTab} onReorder={reorderDockTabs} />
              <div className="dock-panel-scroll">
               {dockTab === 'rig' && <><AlignmentPanel onStatus={setStatus} /><MotionPathPanel activePathId={activeMotionPathId} onSelectPath={setActiveMotionPathId} onActivate={() => activateTool('path')} onStatus={setStatus} /></>}
               {dockTab === 'assets' && <div id="assets-dock" role="tabpanel" aria-labelledby="assets-tab"><AssetLibraryPanel onStatus={setStatus} onOpenStore={() => setAssetStoreOpen(true)} /></div>}
              {dockTab === 'brushes' && <div id="brushes-dock" role="tabpanel" aria-labelledby="brushes-tab"><BrushPanel settings={brush} onChange={setBrush} onStatus={setStatus} drawMode={drawMode} onDrawMode={setDrawMode} fillEnabled={drawFillEnabled} onFillEnabled={setDrawFillEnabled} fillColor={drawFillColor} onFillColor={setDrawFillColor} /></div>}
             {dockTab === 'facial' && <div id="facial-dock" role="tabpanel" aria-labelledby="facial-tab"><Suspense fallback={<p className="scope-note" role="status">Loading facial animation…</p>}><FacialAnimationPanel onStatus={setStatus} /></Suspense></div>}
             {dockTab === 'head' && <div id="head-dock" role="tabpanel" aria-labelledby="head-tab"><Suspense fallback={<p className="scope-note" role="status">Loading Head Creator…</p>}><HeadCreatorPanel onStatus={setStatus} /></Suspense></div>}
              {dockTab === 'constraints' && <div id="constraints-dock" role="tabpanel" aria-labelledby="constraints-tab"><Suspense fallback={<p className="scope-note" role="status">Loading constraints…</p>}><ConstraintsPanel onStatus={setStatus} /></Suspense></div>}
              {dockTab === 'dynamics' && <div id="dynamics-dock" role="tabpanel" aria-labelledby="dynamics-tab"><fieldset className="motion-rig-lock" disabled={motionPreviewActive}><Suspense fallback={<p className="scope-note" role="status">Loading dynamics…</p>}><DynamicsPanel onStatus={setStatus} /></Suspense></fieldset></div>}
            {dockTab === 'controllers' && <div id="controllers-dock" role="tabpanel" aria-labelledby="controllers-tab"><ControllersPanel onStatus={setStatus} /></div>}
             {dockTab === 'joystick' && <div id="joystick-dock" role="tabpanel" aria-labelledby="joystick-tab"><JoystickControlWorkspace onStatus={setStatus} onOpenControllers={() => setDockTab('controllers')} /></div>}
             {dockTab === 'tracking' && <div id="tracking-dock" role="tabpanel" aria-labelledby="tracking-tab"><MotionTrackingPanel onStatus={setStatus} /></div>}
                {dockTab === 'style' && <div id="style-dock" role="tabpanel" aria-labelledby="style-tab"><StylePanel onStatus={setStatus} /></div>}
                {dockTab === 'stage' && <div id="stage-dock" role="tabpanel" aria-labelledby="stage-tab"><StagePanel onStatus={setStatus} /></div>}
                 {dockTab === 'camera' && <div id="camera-dock" role="tabpanel" aria-labelledby="camera-tab"><Suspense fallback={<p className="scope-note" role="status">Loading cameras…</p>}><CameraPanel onStatus={setStatus} onActivate={() => activateTool('camera')} /></Suspense></div>}
                 {dockTab === 'onion' && <div id="onion-dock" role="tabpanel" aria-labelledby="onion-tab"><OnionSkinPanel /></div>}
                 {dockTab === 'views' && <div id="views-dock" role="tabpanel" aria-labelledby="views-tab"><Suspense fallback={<p className="scope-note" role="status">Loading character views…</p>}><CharacterViewsPanel onStatus={setStatus} /></Suspense></div>}
                {dockTab === 'motion' && <div id="motion-dock" role="tabpanel" aria-labelledby="motion-tab"><MotionImportPanel onStatus={setStatus} onPreviewChange={(active, tracking) => { setMotionPreviewActive(active); setMotionCameraTracking(Boolean(active && tracking)); }} /></div>}
               <div id="rig-dock" role="tabpanel" aria-labelledby="rig-tab" hidden={dockTab !== 'rig'}>
               <fieldset className="motion-rig-lock" disabled={motionPreviewActive}>
               {workspaceMode === 'rigging' && <AutoRigPanel onStatus={setStatus} />}
               <HandRigPanel onStatus={setStatus} />
             <LipSyncPanel onStatus={setStatus} onDemo={() => { setAssets({}); setBindSourceId(null); activateTool('select'); }} />
                 {activeTool === 'bind' && <section className="dock-section bind-context"><div className="section-title"><span><Link2 size={13} /> Rigid layer binding</span><span className="section-muted">{bindSource?.boundBoneId ? 'MAPPED' : 'STEP 2 / 2'}</span></div><ol className="binding-steps"><li className={bindSource ? 'done' : ''}>Choose artwork in the Source menu or Scene Objects.</li><li className={bindSource?.boundBoneId ? 'done' : ''}>Click a bone on the stage or in the Bone rig list.</li></ol><p className="binding-summary">{bindSource ? <><strong>{bindSource.name}</strong><span>{hasMeshWeights(bindSource) ? 'Weighted mesh · use Mesh & weights' : bindSource.boundBoneId ? <>↗ {rig.bones.get(bindSource.boundBoneId)?.name ?? 'Missing bone'}</> : 'Waiting for a target bone'}</span></> : 'Choose source artwork above or in the layer list.'}</p><p className="scope-note">One entire layer follows one bone. A dotted guide appears between the artwork and target bone. For bending clothing, create a mesh and paint multiple bone influences instead.</p><button className="secondary-button full-button" disabled={!bindSource?.boundBoneId || bindSource.locked || hasMeshWeights(bindSource)} onClick={() => { if (bindSource) { pause(); useProject.getState().unbind(bindSource.id); setBindTargetId(null); setStatus(`Unbound ${bindSource.name} · choose another bone to map it again`); } }}>Unbind source artwork</button></section>}
              <MeshPanel onStatus={setStatus} onActivate={() => activateTool('mesh')} onActivateWeight={() => activateTool('weight')} weightRadius={weightRadius} weightStrength={weightStrength} onWeightRadius={setWeightRadius} onWeightStrength={setWeightStrength} /><SmartActionsPanel onStatus={setStatus} onEdit={() => activateTool('select')} /><PropertiesPanel onAddKeyframe={addKeyframeForSelection} onStatus={setStatus} />
              </fieldset>
              </div>
              </div>
              </div>
           </aside>
         </div>}
          <fieldset className="motion-timeline-lock" disabled={motionPreviewActive} onClickCapture={(event) => { if (motionPreviewActive) { event.preventDefault(); event.stopPropagation(); } }} aria-label={motionPreviewActive ? 'Timeline suspended during motion preview' : 'Animation timeline'}><Timeline disabled={motionPreviewActive} minimized={timelineMinimized} onToggleMinimized={() => setTimelineMinimized(value => !value)} /></fieldset>
      <footer className="statusbar"><div><span className="status-live" /> {status}</div><div className="status-selection"><span>Selected</span> <strong>{selectedLabel}</strong><span className="status-divider" /><span>Tool</span> <strong>{activeTool}</strong></div><div className="status-spacer" /><div><span className="status-shortcut">V</span> Select <span className="status-shortcut">Space</span> Play <span className="status-divider" /> {Math.round(useProject.getState().zoom * 100)}%</div></footer>
       {videoOpen && <Suspense fallback={<div className="video-loading" role="status">Loading video renderer…</div>}><VideoExportDialog onClose={() => setVideoOpen(false)} onStatus={setStatus} onSceneOpened={() => { setVideoOpen(false); setAssets({}); setBindSourceId(null); setDockTab('camera'); activateTool('select'); }} /></Suspense>}
         {characterStudioOpen && <CharacterStudioPanel onClose={() => setCharacterStudioOpen(false)} onStatus={setStatus} onApply={applyCharacterDesign} onExport={exportCharacterProject} onImport={importProjectFile} />}
          {propsOpen && <Suspense fallback={<div className="video-loading" role="status">Loading props toolkit…</div>}><PropsToolkit onClose={() => setPropsOpen(false)} onApply={applyPropDesign} onExport={exportPropDesign} sceneNotice={rig.dynamics.enabled ? `Your scene already has physics. Its gravity and wind (${rig.dynamics.windX}, ${rig.dynamics.windY}) are kept when adding a prop. The preview uses a fresh scene.` : 'Physics-enabled props turn on simulation in a fresh scene. Existing disabled physics must be enabled in Dynamics first; choose Static to add artwork only.'} /></Suspense>}
            {assetStoreOpen && <AssetStorePanel onClose={() => setAssetStoreOpen(false)} onStatus={setStatus} onEnvironmentAssetAdded={asset => {
              updateProject(project => {
                const environment = project.ensureEnvironment(project.name || asset.title);
                project.setEnvironment({
                  assetIds: [...new Set([...environment.assetIds, asset.id])],
                  settings: asset.backgroundColor ? { biome: asset.title } : {},
                });
              });
              activateWorkspace('environment');
            }} />}
    </div>
  );
}

export default App;
