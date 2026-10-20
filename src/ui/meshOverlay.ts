import type { Layer, Rig } from '../engine/Rig';

type Point = { x: number; y: number };

export function hasMeshWeights(layer: Layer): boolean {
  return Boolean(layer.mesh?.vertices.some(vertex => Object.values(vertex.weights).some(weight => weight > 0)));
}

export function hitMesh(rig: Rig, layer: Layer, point: Point): boolean {
  if (!layer.mesh) return false;
  const vertices = rig.getMeshVertices(layer.id);
  const cross = (a: Point, b: Point, p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  for (let i = 0; i < layer.mesh.triangles.length; i += 3) {
    const [a, b, c] = layer.mesh.triangles.slice(i, i + 3).map(index => vertices[index]);
    if (!a || !b || !c || Math.abs(cross(a, b, c)) < 1e-8) continue;
    const signs = [cross(a, b, point), cross(b, c, point), cross(c, a, point)];
    if (signs.every(value => value >= 0) || signs.every(value => value <= 0)) return true;
  }
  return false;
}

export function drawMeshOverlay(ctx: CanvasRenderingContext2D, rig: Rig, layer: Layer, zoom: number, selected: number | null, influence: string | null) {
  if (!layer.mesh) return;
  const vertices = rig.getMeshVertices(layer.id);
  const color = (weight: number, alpha = 1) => `hsla(${220 - Math.min(1, weight) * 195}, 90%, 65%, ${alpha})`;
  const weight = (index: number) => influence ? layer.mesh!.vertices[index]?.weights[influence] ?? 0 : 0;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1 / zoom;
  for (let i = 0; i < layer.mesh.triangles.length; i += 3) {
    const indices = layer.mesh.triangles.slice(i, i + 3);
    const points = indices.map(index => vertices[index]);
    if (points.some(point => !point)) continue;
    const average = indices.reduce((sum, index) => sum + weight(index), 0) / 3;
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    if (influence) { ctx.fillStyle = color(average, .22); ctx.fill(); }
    ctx.strokeStyle = influence ? color(average, .7) : '#77dccc99';
    ctx.stroke();
  }
  vertices.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, (index === selected ? 5 : 3) / zoom, 0, Math.PI * 2);
    ctx.fillStyle = index === selected ? '#fff3c4' : influence ? color(weight(index)) : '#89dfd0';
    ctx.fill();
    ctx.strokeStyle = '#16242e';
    ctx.stroke();
  });
  ctx.restore();
}
