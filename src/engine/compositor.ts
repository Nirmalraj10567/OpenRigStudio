import type { Rig, Layer } from './Rig';
import type { MaskEntry, VectorShape } from './model';
import { drawMeshLayer } from './meshRenderer';
import { applyStage2DTransform, stageRenderLayers } from './stage2d';
import { groupMasks } from './masking';
import { drawPhysicsParticles } from './dynamics';
import { drawProjectedLayer, layer3DCameraDepth } from './render3d';
import { project3DPoint } from './camera3d';
import { cameraTransitionViews } from './camera';
import { renderEnvironmentBackdrop } from './environment';

export interface CompositorRenderOptions {
  /** Restrict the render to one artwork layer while retaining its group path. */
  onlyLayerId?: string | null;
  /** Restrict the render to a set of artwork layers while retaining group paths. */
  onlyLayerIds?: ReadonlySet<string>;
  /** Omit static/background layers from editor-only onion-skin passes. */
  excludeLayerIds?: ReadonlySet<string>;
}

export function shapePath(shape: VectorShape): Path2D {
  const path = shape.kind === 'path' ? new Path2D(shape.d ?? '') : new Path2D();
  if (shape.kind === 'ellipse') path.ellipse(shape.x ?? 0, shape.y ?? 0, Math.abs(shape.radiusX ?? 1), Math.abs(shape.radiusY ?? 1), 0, 0, Math.PI * 2);
  if (shape.kind === 'rect') path.rect(shape.x ?? 0, shape.y ?? 0, shape.width ?? 0, shape.height ?? 0);
  if (shape.kind === 'polygon' && shape.points?.length) {
    path.moveTo(shape.points[0].x, shape.points[0].y); shape.points.slice(1).forEach(point => path.lineTo(point.x, point.y)); path.closePath();
  }
  return path;
}

function drawLayer(ctx: CanvasRenderingContext2D, rig: Rig, layer: Layer, assets: ReadonlyMap<string, HTMLImageElement>, opacity: number, stage = true): void {
  ctx.save();
  const stageView = rig.getStageView();
  if (stage && stageView.camera3d?.enabled) {
    drawProjectedLayer(ctx, rig, layer, assets.get(layer.id), opacity);
    ctx.restore(); return;
  }
  if (stage && rig.getStageView().enabled) applyStage2DTransform(ctx, layer, rig.getStageView(), { x: rig.canvas.width / 2, y: rig.canvas.height / 2 });
  if (!drawMeshLayer(ctx, rig, { ...layer, visible: true }, assets.get(layer.id), opacity)) {
    ctx.translate(layer.world.x, layer.world.y); ctx.rotate(layer.world.rotation); ctx.scale(layer.world.scaleX, layer.world.scaleY);
    ctx.globalAlpha *= opacity;
    if (layer.type === 'vector') layer.shapes.forEach(shape => {
      ctx.save(); ctx.globalAlpha *= shape.opacity ?? 1;
      const path = shapePath(shape);
      if (shape.fill && shape.fill !== 'none') { ctx.fillStyle = shape.fill; ctx.fill(path); }
       if (shape.stroke && shape.stroke !== 'none' && (shape.strokeWidth ?? 1) > 0) { ctx.strokeStyle = shape.stroke; ctx.lineWidth = shape.strokeWidth ?? 1; ctx.lineCap = shape.lineCap ?? 'butt'; ctx.lineJoin = shape.lineJoin ?? 'round'; ctx.setLineDash(shape.lineDash ?? []); ctx.stroke(path); }
      ctx.restore();
    });
    else {
      const image = assets.get(layer.id);
      if (image?.complete && image.naturalWidth > 0) ctx.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
      else { ctx.fillStyle = layer.color; ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height); }
    }
  }
  ctx.restore();
}

/** Isolated surfaces share the destination's physical pixel size and stage matrix. */
function surface(reference: CanvasRenderingContext2D): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas'); canvas.width = reference.canvas.width; canvas.height = reference.canvas.height;
  const ctx = canvas.getContext('2d')!; ctx.setTransform(reference.getTransform()); return ctx;
}
function blit(destination: CanvasRenderingContext2D, source: CanvasRenderingContext2D, operation: GlobalCompositeOperation = 'source-over', opacity = 1): void {
  destination.save(); destination.setTransform(1, 0, 0, 1, 0, 0); destination.globalCompositeOperation = operation;
  destination.globalAlpha = opacity; destination.drawImage(source.canvas, 0, 0); destination.restore();
}
function full(ctx: CanvasRenderingContext2D): void {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
}

function sourceMask(ctx: CanvasRenderingContext2D, rig: Rig, mask: MaskEntry, assets: ReadonlyMap<string, HTMLImageElement>, expansion = 0): void {
  const layer = rig.getRenderLayer(mask.layerId); if (!layer) return;
  let artwork: Layer = { ...layer, visible: true };
  if (layer.type === 'vector') artwork = { ...layer, visible: true, shapes: layer.shapes.map(shape => mask.kind === 'clip'
    ? { ...shape, fill: '#fff', stroke: expansion ? '#fff' : 'none', strokeWidth: expansion * 2, opacity: 1 }
    : { ...shape, ...(mask.hideEdge ? { stroke: expansion ? shape.fill : 'none', strokeWidth: expansion * 2 } : {}) }) };
  if (layer.type === 'image' && mask.kind === 'clip') {
    // Geometric image clipping follows its deformed mesh/rectangle, not transparent texture pixels.
    artwork = { ...layer, type: 'vector', visible: true, shapes: [{ id: 'image-clip', kind: 'rect', x: -layer.width / 2, y: -layer.height / 2, width: layer.width, height: layer.height, fill: '#fff' }] };
  }
  drawLayer(ctx, rig, artwork, assets, mask.opacity * (mask.kind === 'alpha' ? rig.getMaskSourceOpacity(layer.id) : 1));
}

function applyMasks(content: CanvasRenderingContext2D, rig: Rig, masks: MaskEntry[], assets: ReadonlyMap<string, HTMLImageElement>): void {
  const active = masks.filter(mask => mask.enabled && rig.layers.has(mask.layerId)); if (!active.length) return;
  const accumulated = surface(content);
  if (active[0].operation !== 'add') full(accumulated);
  active.forEach(mask => {
    let source = surface(content); sourceMask(source, rig, mask, assets);
    if (mask.inverted) { const inverse = surface(content); full(inverse); blit(inverse, source, 'destination-out'); source = inverse; }
    blit(accumulated, source, mask.operation === 'add' ? 'source-over' : mask.operation === 'subtract' ? 'destination-out' : 'destination-in');
  });
  blit(content, accumulated, 'destination-in');
}

/** Group compositing is shared by live canvas, pixel tests, and authoring previews. */
export function renderCompositedCanvas(
  ctx: CanvasRenderingContext2D,
  rig: Rig,
  assets: ReadonlyMap<string, HTMLImageElement> = new Map(),
  options: CompositorRenderOptions = {},
): void {
  const transition = cameraTransitionViews(rig);
  if (transition) {
    const original = rig.stageRenderOverride;
    try {
      const from = surface(ctx), to = surface(ctx);
      for (const [destination, stage] of [[from, transition.from], [to, transition.to]] as const) { rig.stageRenderOverride = stage; destination.fillStyle = rig.canvas.background; destination.fillRect(0, 0, rig.canvas.width, rig.canvas.height); renderCompositedCanvas(destination, rig, assets, options); }
      if (transition.kind === 'dissolve') { blit(ctx, from); blit(ctx, to, 'source-over', transition.amount); }
      else {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, rig.canvas.width, rig.canvas.height); ctx.clip();
        const m = ctx.getTransform(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(from.canvas, -transition.amount * rig.canvas.width * m.a, -transition.amount * rig.canvas.width * m.b);
        ctx.drawImage(to.canvas, (1 - transition.amount) * rig.canvas.width * m.a, (1 - transition.amount) * rig.canvas.width * m.b); ctx.restore();
      }
    } finally { rig.stageRenderOverride = original; }
    return;
  }
  rig.update();
  if (rig.environment) renderEnvironmentBackdrop(ctx, rig.environment, rig.canvas.width, rig.canvas.height, rig.timeline.currentFrame);
  const patches = rig.layersInOrder.filter(layer => layer.visible && layer.patch?.enabled);
  const containsLayer = (id: string): boolean => {
    if (options.excludeLayerIds?.has(id)) return false;
    const group = rig.groups.get(id);
    if (options.onlyLayerIds && !options.onlyLayerIds.has(id)) return Boolean(group?.childIds.some(child => containsLayer(child)));
    if (!options.onlyLayerId) return true;
    if (id === options.onlyLayerId) return true;
    return Boolean(group?.childIds.some(child => containsLayer(child)));
  };
  const emit = (destination: CanvasRenderingContext2D, id: string) => {
    if (!containsLayer(id)) return;
    const group = rig.getRenderGroup(id);
    if (group) {
      if (!group.visible) return;
      const content = surface(destination);
      const children = group.mode === 'switch' ? [group.childIds.includes(group.activeChildId ?? '') ? group.activeChildId! : group.childIds[0]] : group.childIds;
      children.filter(Boolean).forEach(child => emit(content, child));
      applyMasks(content, rig, groupMasks(group), assets);
      blit(destination, content, group.blendMode, group.opacity); return;
    }
    const layer = rig.getRenderLayer(id); if (!layer?.visible || options.excludeLayerIds?.has(layer.id) || options.onlyLayerIds && !options.onlyLayerIds.has(layer.id) || options.onlyLayerId && layer.id !== options.onlyLayerId) return;
    const opacity = rig.getLayerOpacity(id, false); if (opacity <= 0) return;
    const patchTargets = patches.filter(patch => patch.patch!.hideEdges && patch.patch!.targetIds.includes(id));
    const hideStroke = layer.patch?.enabled && layer.patch.hideEdges && !layer.patch.preserveOutline;
    if (layer.type === 'vector' && (patchTargets.length || hideStroke)) {
      const fillLayer: Layer = { ...layer, shapes: layer.shapes.map(shape => ({ ...shape, stroke: 'none' })) };
      // Composite fill and stroke once to avoid doubling semi-transparent artwork.
      const content = surface(destination); drawLayer(content, rig, fillLayer, assets, 1);
      if (!hideStroke) {
        const strokes = surface(destination);
        drawLayer(strokes, rig, { ...layer, shapes: layer.shapes.map(shape => ({ ...shape, fill: 'none' })) }, assets, 1);
        patchTargets.forEach(patch => {
          const cover = surface(destination);
          sourceMask(cover, rig, { id: 'patch', layerId: patch.id, kind: 'alpha', operation: 'add', opacity: 1, inverted: false, enabled: true, hideSource: false, hideEdge: true }, assets, patch.patch!.seamWidth);
          blit(strokes, cover, 'destination-out');
        });
        blit(content, strokes);
      }
      blit(destination, content, 'source-over', opacity);
    } else drawLayer(destination, rig, layer, assets, opacity);
  };
  if (!rig.groups.size) (rig.getStageView().camera3d?.enabled ? rig.layersInOrder.sort((a, b) => layer3DCameraDepth(b, rig.getStageView(), rig.canvas) - layer3DCameraDepth(a, rig.getStageView(), rig.canvas)) : stageRenderLayers(rig.layersInOrder, rig.getStageView())).forEach(layer => emit(ctx, layer.id));
  else {
    const roots = [...rig.layers.values(), ...rig.groups.values()].filter(item => !item.parentGroupId).sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
    roots.forEach(item => emit(ctx, item.id));
  }
  const stage = rig.getStageView();
  ctx.save();
  if (stage.camera3d?.enabled) for (const particle of rig.physicsFrame?.particles ?? []) {
    const projected = project3DPoint({ x: particle.x - rig.canvas.width / 2, y: particle.y - rig.canvas.height / 2, z: 0 }, stage.camera3d, rig.canvas, stage.zoom, { x: stage.cameraX, y: stage.cameraY });
    if (!projected.visible) continue;
    ctx.save(); ctx.globalAlpha *= particle.opacity; ctx.fillStyle = particle.color; ctx.beginPath(); ctx.arc(projected.x, projected.y, particle.size * projected.scale, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  } else { if (stage.enabled) applyStage2DTransform(ctx, { depth: 0, parallax: 1 }, stage, { x: rig.canvas.width / 2, y: rig.canvas.height / 2 }); drawPhysicsParticles(ctx, rig); }
  ctx.restore();
}
