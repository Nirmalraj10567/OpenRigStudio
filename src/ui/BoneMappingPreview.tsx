import { useEffect, useRef, useState } from 'react';
import { Eye, Grid3X3 } from 'lucide-react';
import { Rig } from '../engine/Rig';
import { renderCompositedCanvas } from '../engine/compositor';
import { drawBoneOverlay } from './boneOverlay';
import type { Stage2DSettings } from '../engine/stage2d';
import { normalizeStage2DSettings } from '../engine/stage2d';
import { useProject } from '../state/projectStore';

export type BoneMappingPreviewKind = 'side' | 'back';

type Point = { x: number; y: number };

const PREVIEW_SIZE = { width: 800, height: 520 };

function previewStage(kind: BoneMappingPreviewKind): Stage2DSettings {
  return normalizeStage2DSettings({
    enabled: true,
    cameraX: 0,
    cameraY: 0,
    zoom: 1,
    perspective: 0,
    yaw: kind === 'side' ? 90 : 180,
    pitch: 0,
    roll: 0,
    projection: 'orthographic',
  });
}

function drawPreviewGrid(ctx: CanvasRenderingContext2D, scale: number): void {
  ctx.save();
  ctx.strokeStyle = '#1d3440';
  ctx.lineWidth = 1 / scale;
  for (let x = 0; x <= PREVIEW_SIZE.width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, PREVIEW_SIZE.height); ctx.stroke();
  }
  for (let y = 0; y <= PREVIEW_SIZE.height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(PREVIEW_SIZE.width, y); ctx.stroke();
  }
  ctx.restore();
}

function drawMappingGuide(
  ctx: CanvasRenderingContext2D,
  rig: Rig,
  sourceId: string | null,
  targetId: string | null,
  scale: number,
): void {
  if (!sourceId || !targetId) return;
  const source = rig.layers.get(sourceId);
  const target = rig.bones.get(targetId);
  if (!source || !target) return;
  ctx.save();
  ctx.strokeStyle = source.boundBoneId === targetId ? '#ffc66c' : '#55d9ef';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.5 / scale;
  ctx.setLineDash([7 / scale, 5 / scale]);
  ctx.beginPath(); ctx.moveTo(source.world.x, source.world.y); ctx.lineTo(target.world.x, target.world.y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(source.world.x, source.world.y, 6 / scale, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(target.world.x, target.world.y, 7 / scale, 0, Math.PI * 2); ctx.stroke();
  ctx.font = `${Math.max(9, 11 / scale)}px Inter, system-ui, sans-serif`;
  ctx.fillText(source.boundBoneId === targetId ? 'MAPPED' : 'TARGET', target.world.x + 10 / scale, target.world.y - 8 / scale);
  ctx.restore();
}

function drawPreviewLabel(ctx: CanvasRenderingContext2D, label: string, width: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(5, 18, 27, .82)';
  ctx.strokeStyle = '#31596b';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(10, 10, Math.max(72, label.length * 7 + 24), 25, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#a7dce0';
  ctx.font = '700 10px Inter, system-ui, sans-serif';
  ctx.fillText(label, 20, 26);
  ctx.fillStyle = '#6e9ca8';
  ctx.font = '9px DM Mono, monospace';
  ctx.fillText(`${width} × ${PREVIEW_SIZE.height}`, Math.max(92, label.length * 7 + 44), 26);
  ctx.restore();
}

function previewPoint(point: Point, scale: number, offsetX: number, offsetY: number): Point {
  return { x: offsetX + point.x * scale, y: offsetY + point.y * scale };
}

export function BoneMappingPreview({
  kind,
  sourceId,
  targetId,
  selectedId,
  showBones = true,
  showNames = true,
  showGrid = true,
  assets = {},
}: {
  kind: BoneMappingPreviewKind;
  sourceId: string | null;
  targetId: string | null;
  selectedId: string | null;
  showBones?: boolean;
  showNames?: boolean;
  showGrid?: boolean;
  assets?: Record<string, string>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadedAssets = useRef(new Map<string, HTMLImageElement>());
  const [assetVersion, setAssetVersion] = useState(0);
  const { rig, version } = useProject();

  useEffect(() => {
    const sources: Record<string, string> = { ...assets };
    rig.layers.forEach(layer => {
      if (layer.type === 'image' && layer.src) sources[layer.id] = layer.src;
    });
    Object.entries(sources).forEach(([id, source]) => {
      const existing = loadedAssets.current.get(id);
      if (existing?.getAttribute('src') === source) return;
      const image = new Image();
      image.onload = () => setAssetVersion(value => value + 1);
      image.src = source;
      loadedAssets.current.set(id, image);
    });
  }, [assets, rig, version]);

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
      ctx.fillStyle = '#081721';
      ctx.fillRect(0, 0, rect.width, rect.height);

      const scale = Math.min(rect.width / PREVIEW_SIZE.width, rect.height / PREVIEW_SIZE.height);
      const offsetX = (rect.width - PREVIEW_SIZE.width * scale) / 2;
      const offsetY = (rect.height - PREVIEW_SIZE.height * scale) / 2;
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      const previewRig = new Rig(rig.toProject());
      const preparedViews = previewRig.characterViews.filter(set => set.enabled && set.views.length > 1);
      if (preparedViews.length) {
        const angle = kind === 'side' ? -90 : -180;
        preparedViews.forEach(set => previewRig.characterAngleOverrides.set(set.id, { frame: previewRig.timeline.currentFrame, angle }));
        previewRig.setStage2D({ enabled: false, cameraX: 0, cameraY: 0, zoom: 1, perspective: 0, yaw: 0, pitch: 0, roll: 0, projection: 'orthographic' });
      } else {
        previewRig.setStage2D(previewStage(kind));
      }
      previewRig.cameraView = 'preview';
      previewRig.cameraOverride = null;
      previewRig.stageRenderOverride = null;
      previewRig.update();

      ctx.fillStyle = '#0c2029';
      ctx.fillRect(0, 0, PREVIEW_SIZE.width, PREVIEW_SIZE.height);
      if (showGrid) drawPreviewGrid(ctx, scale);
      renderCompositedCanvas(ctx, previewRig, loadedAssets.current);
      if (showBones) {
        drawBoneOverlay(ctx, previewRig, {
          zoom: scale,
          selectedId: previewRig.bones.has(selectedId ?? '') ? selectedId : null,
          mappedId: targetId,
          names: showNames,
          pose: false,
        });
        drawMappingGuide(ctx, previewRig, sourceId, targetId, scale);
      }
      drawPreviewLabel(ctx, kind === 'side' ? 'SIDE VIEW' : 'BACK VIEW', PREVIEW_SIZE.width);
      ctx.restore();

      ctx.strokeStyle = '#31586a';
      ctx.lineWidth = 1;
      ctx.strokeRect(offsetX + .5, offsetY + .5, PREVIEW_SIZE.width * scale - 1, PREVIEW_SIZE.height * scale - 1);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [assetVersion, assets, kind, rig, selectedId, showBones, showGrid, showNames, sourceId, targetId, version]);

  return (
    <div className="mapping-preview-canvas" aria-label={`${kind} bone mapping preview`}>
      <canvas ref={canvasRef} />
      <div className="mapping-preview-caption"><span><Eye size={12} /> {kind === 'side' ? 'Side' : 'Back'}</span><span><Grid3X3 size={11} /> READ ONLY</span></div>
    </div>
  );
}
