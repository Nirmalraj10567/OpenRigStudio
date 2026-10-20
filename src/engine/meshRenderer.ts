import type { Layer, Rig } from './Rig';
import type { VectorShape } from './model';
import { triangleAffine, triangleClipApron, validMesh } from './mesh';
import type { Point } from './mesh';

function drawShape(ctx: CanvasRenderingContext2D, shape: VectorShape): void {
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, shape.opacity ?? 1));
  ctx.fillStyle = shape.fill ?? 'transparent';
  ctx.strokeStyle = shape.stroke ?? 'transparent';
  ctx.lineWidth = Math.max(0, shape.strokeWidth ?? 1);
  ctx.lineCap = shape.lineCap ?? 'butt';
  ctx.lineJoin = shape.lineJoin ?? 'round';
  ctx.setLineDash(shape.lineDash ?? []);
  let path: Path2D;
  try {
    path = shape.kind === 'path' ? new Path2D(shape.d ?? '') : new Path2D();
    if (shape.kind === 'rect') path.rect(shape.x ?? 0, shape.y ?? 0, shape.width ?? 1, shape.height ?? 1);
    if (shape.kind === 'ellipse') path.ellipse(shape.x ?? 0, shape.y ?? 0,
      Math.abs(shape.radiusX ?? 1), Math.abs(shape.radiusY ?? 1), 0, 0, Math.PI * 2);
    if (shape.kind === 'polygon' && shape.points?.length) {
      path.moveTo(shape.points[0].x, shape.points[0].y);
      shape.points.slice(1).forEach(p => path.lineTo(p.x, p.y));
      path.closePath();
    }
    if (shape.fill && shape.fill !== 'none') ctx.fill(path);
    if (shape.stroke && shape.stroke !== 'none' && ctx.lineWidth > 0) ctx.stroke(path);
  } finally {
    ctx.restore();
  }
}

/** Caller supplies the stage/world canvas transform, not the layer transform. */
export function drawMeshLayer(ctx: CanvasRenderingContext2D, rig: Rig, layer: Layer, image?: HTMLImageElement, opacity = rig.getLayerOpacity(layer.id)): boolean {
  if (!validMesh(layer.mesh)) return false;
  const mesh = layer.mesh, vertices = rig.getMeshVertices(layer.id);
  if (!layer.visible || vertices.length !== mesh.vertices.length) return true;
  ctx.save();
   ctx.globalAlpha *= opacity;
  try {
    for (let i = 0; i < mesh.triangles.length; i += 3) {
      const ids = mesh.triangles.slice(i, i + 3);
      const source = ids.map(index => ({
        x: mesh.bounds.x + mesh.vertices[index].u * mesh.bounds.width,
        y: mesh.bounds.y + mesh.vertices[index].v * mesh.bounds.height,
      })) as [Point, Point, Point];
      const target = ids.map(index => vertices[index]) as [Point, Point, Point];
      const affine = triangleAffine(source, target);
      if (!affine) continue;
      ctx.save();
      try {
       ctx.beginPath();
        const matrix = ctx.getTransform?.();
        const scale = matrix ? Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d), .01) : 1;
        const opaque = ctx.globalAlpha >= 1 && layer.type === 'vector' && layer.shapes.every(shape => (shape.opacity ?? 1) >= 1);
        const clip = triangleClipApron(target, opaque ? .35 / scale : 0);
        ctx.moveTo(clip[0].x, clip[0].y);
        ctx.lineTo(clip[1].x, clip[1].y);
        ctx.lineTo(clip[2].x, clip[2].y);
        ctx.closePath();
        ctx.clip();
        ctx.transform(affine.a, affine.b, affine.c, affine.d, affine.e, affine.f);
        if (layer.type === 'image') {
          if (image?.complete && image.naturalWidth > 0) ctx.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
          else { ctx.fillStyle = layer.color; ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height); }
        } else layer.shapes.forEach(shape => drawShape(ctx, shape));
      } finally { ctx.restore(); }
    }
  } finally { ctx.restore(); }
  return true;
}
