import type { Layer, Rig } from './Rig';
import type { Camera3DSettings, Vec3 } from './camera3d';
import { applyEuler, colorWithLight, inverseEuler, normalizeTransform3D, normalizeVec3, project3DPoint, shadeLight } from './camera3d';
import { triangleAffine, meshBounds } from './mesh';
import type { Point } from './mesh';
import { localToWorldPoint } from './math';
import type { Mesh3D, VectorShape } from './model';
import type { Stage2DSettings } from './stage2d';

export interface ProjectedTriangle {
  points: [Point, Point, Point];
  source?: [Point, Point, Point];
  color?: string;
  depth: number;
  blur: number;
  shadow?: [Point, Point, Point];
}
const tuple = <T,>(points: T[]) => points as [T, T, T];
const viewport = (rig: Rig) => ({ width: rig.canvas.width, height: rig.canvas.height });

/** Extra 3D layer transform is local to its evaluated 2D rig/group attachment. */
export function layer3DPoint(layer: Layer, point: Vec3, size: { width: number; height: number }): Vec3 {
  const transform = normalizeTransform3D(layer.transform3d);
  const rotated = applyEuler({ x: point.x * transform.scale.x, y: point.y * transform.scale.y, z: point.z * transform.scale.z }, transform.rotation);
  const xy = localToWorldPoint(layer.world, { x: rotated.x + transform.position.x, y: rotated.y + transform.position.y });
  return { x: xy.x - size.width / 2, y: xy.y - size.height / 2, z: (layer.depth ?? 0) + transform.position.z + rotated.z };
}
function layerPlaneWorld(layer: Layer, point: Point, size: { width: number; height: number }): Vec3 {
  const transform = normalizeTransform3D(layer.transform3d);
  const rotated = applyEuler({ x: (point.x - layer.world.x) * transform.scale.x, y: (point.y - layer.world.y) * transform.scale.y, z: 0 }, transform.rotation);
  return { x: layer.world.x - size.width / 2 + transform.position.x + rotated.x, y: layer.world.y - size.height / 2 + transform.position.y + rotated.y, z: (layer.depth ?? 0) + transform.position.z + rotated.z };
}
export function layer3DCameraDepth(layer: Layer, stage: Stage2DSettings, size: { width: number; height: number }): number {
  if (!stage.camera3d?.enabled) return -(layer.depth ?? 0);
  return project3DPoint(layer3DPoint(layer, { x: 0, y: 0, z: 0 }, size), stage.camera3d, size).depth;
}

interface ClipVertex { world: Vec3; source?: Point }
/** Clip intersecting triangles against both camera depth planes before projection. */
function clipTriangle(vertices: ClipVertex[], camera: Camera3DSettings): ClipVertex[] {
  const depth = (point: Vec3) => -inverseEuler({ x: point.x - camera.position.x, y: point.y - camera.position.y, z: point.z - camera.position.z }, camera.rotation).z;
  let polygon = vertices;
  for (const plane of [camera.near, camera.far]) {
    const near = plane === camera.near, output: ClipVertex[] = [];
    polygon.forEach((vertex, i) => {
      const previous = polygon[(i + polygon.length - 1) % polygon.length], a = depth(previous.world), b = depth(vertex.world), insideA = near ? a >= plane : a <= plane, insideB = near ? b >= plane : b <= plane;
      if (insideA !== insideB) {
        const t = (plane - a) / (b - a), mix = (a: number, b: number) => a + (b - a) * t;
        output.push({ world: { x: mix(previous.world.x, vertex.world.x), y: mix(previous.world.y, vertex.world.y), z: mix(previous.world.z, vertex.world.z) }, ...(previous.source && vertex.source ? { source: { x: mix(previous.source.x, vertex.source.x), y: mix(previous.source.y, vertex.source.y) } } : {}) });
      }
      if (insideB) output.push(vertex);
    }); polygon = output;
    if (!polygon.length) break;
  } return polygon;
}
function normal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  return { x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x };
}
function trianglePrimitives(world: Vec3[], source: Point[] | undefined, color: string | undefined, camera: Camera3DSettings, size: { width: number; height: number }, zoom: number, pan: Point, castShadow: boolean): ProjectedTriangle[] {
  const polygon = clipTriangle(world.map((world, index) => ({ world, source: source?.[index] })), camera), result: ProjectedTriangle[] = [];
  const project = (point: Vec3) => project3DPoint(point, camera, size, zoom, pan);
  for (let i = 1; i < polygon.length - 1; i++) {
    const triangle = [polygon[0], polygon[i], polygon[i + 1]], projected = triangle.map(vertex => project(vertex.world));
    const points = tuple(projected.map(({ x, y }) => ({ x, y })));
    let shadow: ProjectedTriangle['shadow'];
    const direction = normalizeVec3(camera.keyLight.direction);
    if (castShadow && camera.shadow.enabled && camera.keyLight.castShadows && Math.abs(direction.z) > .001) {
      const receiver = triangle.map(vertex => { const distance = (camera.shadow.depth - vertex.world.z) / direction.z; return distance >= 0 ? project({ x: vertex.world.x + direction.x * distance, y: vertex.world.y + direction.y * distance, z: camera.shadow.depth }) : null; });
      if (receiver.every(point => point?.visible)) shadow = tuple(receiver.map(point => ({ x: point!.x, y: point!.y })));
    }
    result.push({ points, ...(source ? { source: tuple(triangle.map(vertex => vertex.source!)) } : {}), color, depth: projected.reduce((sum, p) => sum + p.depth, 0) / 3, blur: projected.reduce((sum, p) => sum + p.blur, 0) / 3, shadow });
  } return result;
}

/** One pure projection result drives editor Canvas, SVG/PNG, and offline video. */
export function projectedLayerTriangles(rig: Rig, layer: Layer, stage = rig.getStageView()): ProjectedTriangle[] {
  const camera = stage.camera3d; if (!camera?.enabled) return [];
  const size = viewport(rig), pan = { x: stage.cameraX, y: stage.cameraY }, triangles: ProjectedTriangle[] = [];
  if (layer.mesh3d) {
    const vertices = layer.mesh3d.vertices.map(point => layer3DPoint(layer, point, size));
    for (const face of layer.mesh3d.triangles) {
      const world = face.indices.map(index => vertices[index]); if (world.some(point => !point)) continue;
      const base = face.color ?? (layer.type === 'image' ? layer.color : layer.shapes[0]?.fill) ?? '#9bb8c8';
      const color = colorWithLight(base, shadeLight(normal(...tuple(world)), camera) * camera.exposure, camera.keyLight.color);
      triangles.push(...trianglePrimitives(world, undefined, color, camera, size, stage.zoom, pan, layer.mesh3d.castShadow !== false));
    }
  } else if (layer.mesh) {
    const mesh = layer.mesh, evaluated = rig.getMeshVertices(layer.id, false), vertices = evaluated.map(point => layerPlaneWorld(layer, point, size));
    for (let i = 0; i < mesh.triangles.length; i += 3) {
      const ids = mesh.triangles.slice(i, i + 3), world = ids.map(index => vertices[index]); if (world.some(point => !point)) continue;
      const source = ids.map(index => ({ x: mesh.bounds.x + mesh.vertices[index].u * mesh.bounds.width, y: mesh.bounds.y + mesh.vertices[index].v * mesh.bounds.height }));
      triangles.push(...trianglePrimitives(world, source, undefined, camera, size, stage.zoom, pan, false));
    }
  } else {
    const bounds = meshBounds(layer);
    if (!bounds) return [];
    // Tessellation bounds the affine approximation of perspective-mapped artwork.
    const divisions = 8;
    for (let row = 0; row < divisions; row++) for (let col = 0; col < divisions; col++) {
      const points = [{ x: bounds.x + col / divisions * bounds.width, y: bounds.y + row / divisions * bounds.height }, { x: bounds.x + (col + 1) / divisions * bounds.width, y: bounds.y + row / divisions * bounds.height }, { x: bounds.x + (col + 1) / divisions * bounds.width, y: bounds.y + (row + 1) / divisions * bounds.height }, { x: bounds.x + col / divisions * bounds.width, y: bounds.y + (row + 1) / divisions * bounds.height }];
      for (const ids of [[0, 1, 2], [0, 2, 3]]) { const source = ids.map(index => points[index]); triangles.push(...trianglePrimitives(source.map(point => layer3DPoint(layer, { ...point, z: 0 }, size)), source, undefined, camera, size, stage.zoom, pan, false)); }
    }
  }
  return triangles.sort((a, b) => b.depth - a.depth);
}

function drawShape(ctx: CanvasRenderingContext2D, shape: VectorShape): void {
  ctx.save(); ctx.globalAlpha *= shape.opacity ?? 1; ctx.fillStyle = shape.fill ?? 'transparent'; ctx.strokeStyle = shape.stroke ?? 'transparent'; ctx.lineWidth = shape.strokeWidth ?? 1; ctx.lineCap = shape.lineCap ?? 'butt'; ctx.lineJoin = shape.lineJoin ?? 'miter'; ctx.setLineDash(shape.lineDash ?? []);
  const path = shape.kind === 'path' ? new Path2D(shape.d ?? '') : new Path2D();
  if (shape.kind === 'rect') path.rect(shape.x ?? 0, shape.y ?? 0, shape.width ?? 0, shape.height ?? 0);
  if (shape.kind === 'ellipse') path.ellipse(shape.x ?? 0, shape.y ?? 0, Math.abs(shape.radiusX ?? 1), Math.abs(shape.radiusY ?? 1), 0, 0, Math.PI * 2);
  if (shape.kind === 'polygon' && shape.points?.length) { path.moveTo(shape.points[0].x, shape.points[0].y); shape.points.slice(1).forEach(point => path.lineTo(point.x, point.y)); path.closePath(); }
  if (shape.fill && shape.fill !== 'none') ctx.fill(path); if (shape.stroke && shape.stroke !== 'none') ctx.stroke(path); ctx.restore();
}
function trianglePath(ctx: CanvasRenderingContext2D, points: [Point, Point, Point]): void { ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); ctx.lineTo(points[1].x, points[1].y); ctx.lineTo(points[2].x, points[2].y); ctx.closePath(); }
export function drawProjectedLayer(ctx: CanvasRenderingContext2D, rig: Rig, layer: Layer, image: HTMLImageElement | undefined, opacity: number): void {
  const triangles = projectedLayerTriangles(rig, layer), camera = rig.getStageView().camera3d!;
  ctx.save(); ctx.globalAlpha *= opacity;
  const shadows = triangles.filter(triangle => triangle.shadow);
  if (shadows.length) { ctx.save(); ctx.globalAlpha *= camera.shadow.opacity; ctx.filter = `blur(${camera.shadow.softness}px)`; ctx.fillStyle = '#000'; ctx.beginPath(); shadows.forEach(triangle => { const p = triangle.shadow!; ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[1].x, p[1].y); ctx.lineTo(p[2].x, p[2].y); ctx.closePath(); }); ctx.fill(); ctx.restore(); }
  const blur = triangles.length ? triangles.reduce((sum, t) => sum + t.blur, 0) / triangles.length : 0;
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  for (const triangle of triangles) {
    ctx.save(); trianglePath(ctx, triangle.points);
    if (triangle.color) { ctx.fillStyle = triangle.color; ctx.fill(); }
    else if (triangle.source) {
      const affine = triangleAffine(triangle.source, triangle.points); if (!affine) { ctx.restore(); continue; }
      ctx.clip(); ctx.transform(affine.a, affine.b, affine.c, affine.d, affine.e, affine.f);
      if (layer.type === 'image') { if (image?.complete && image.naturalWidth > 0) ctx.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height); else { ctx.fillStyle = layer.color; ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height); } }
      else layer.shapes.forEach(shape => drawShape(ctx, shape));
    } ctx.restore();
  } ctx.restore();
}

/** Local OBJ geometry only. Fan triangulation accepts convex n-gons; indices may be negative. */
export function parseOBJ(text: string): Mesh3D {
  if (text.length > 16 * 1024 * 1024) throw new Error('OBJ must be smaller than 16 MB');
  const vertices: Vec3[] = [], triangles: Mesh3D['triangles'] = [];
  for (const line of text.split(/\r?\n/)) {
    const tokens = line.trim().split(/\s+/);
    if (tokens[0] === 'v') { const xyz = tokens.slice(1, 4).map(Number); if (xyz.length !== 3 || !xyz.every(Number.isFinite)) throw new Error('OBJ contains an invalid vertex'); vertices.push({ x: xyz[0], y: xyz[1], z: xyz[2] }); }
    if (tokens[0] === 'f') {
      const ids = tokens.slice(1).map(token => { const index = Number(token.split('/')[0]); return index < 0 ? vertices.length + index : index - 1; });
      if (ids.length < 3 || !ids.every(index => Number.isInteger(index) && index >= 0 && index < vertices.length)) throw new Error('OBJ contains an invalid face');
      for (let i = 1; i < ids.length - 1; i++) triangles.push({ indices: [ids[0], ids[i], ids[i + 1]], color: '#9bb8c8' });
    }
    if (vertices.length > 10000 || triangles.length > 20000) throw new Error('OBJ limit is 10,000 vertices and 20,000 triangles');
  }
  if (!vertices.length || !triangles.length) throw new Error('OBJ has no renderable faces');
  return { vertices, triangles, source: 'obj', castShadow: true };
}

/** Ear clipping supports simple concave outlines; holes/self-intersections are rejected. */
function triangulateOutline(points: Point[]): Array<[number, number, number]> {
  if (points.length < 3 || points.length > 512) throw new Error('Use a simple outline with 3–512 points');
  const area = points.reduce((sum, p, i) => { const next = points[(i + 1) % points.length]; return sum + p.x * next.y - next.x * p.y; }, 0);
  const ids = points.map((_p, i) => i); if (area < 0) ids.reverse();
  const result: Array<[number, number, number]> = [];
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  while (ids.length > 3) {
    let ear = false;
    for (let i = 0; i < ids.length; i++) {
      const a = ids[(i + ids.length - 1) % ids.length], b = ids[i], c = ids[(i + 1) % ids.length];
      if (cross(points[a], points[b], points[c]) <= 1e-8) continue;
      if (ids.some(id => id !== a && id !== b && id !== c && cross(points[a], points[b], points[id]) >= 0 && cross(points[b], points[c], points[id]) >= 0 && cross(points[c], points[a], points[id]) >= 0)) continue;
      result.push([a, b, c]); ids.splice(i, 1); ear = true; break;
    }
    if (!ear) throw new Error('Outline is degenerate or self-intersecting');
  } result.push(tuple(ids)); return result;
}
export function extrudePolygon(points: Point[], depth = 20, color = '#9bb8c8'): Mesh3D {
  if (!Number.isFinite(depth) || depth <= 0) throw new Error('Extrusion depth must be positive');
  const count = points.length, vertices = [...points.map(point => ({ ...point, z: -depth / 2 })), ...points.map(point => ({ ...point, z: depth / 2 }))], triangles: Mesh3D['triangles'] = [];
  for (const [a, b, c] of triangulateOutline(points)) triangles.push({ indices: [c, b, a], color }, { indices: [a + count, b + count, c + count], color });
  for (let i = 0; i < count; i++) { const next = (i + 1) % count; triangles.push({ indices: [i, next, next + count], color }, { indices: [i, next + count, i + count], color }); }
  return { vertices, triangles, source: 'extrude', extrusion: depth, castShadow: true };
}
export function inflatePolygon(points: Point[], amount = 30, color = '#9bb8c8'): Mesh3D {
  const mesh = extrudePolygon(points, Math.max(.01, amount / 8), color), center = { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
  const radius = Math.max(...points.map(point => Math.hypot(point.x - center.x, point.y - center.y)), .01);
  // Subdivide caps and displace their inner vertices into a dome; boundary remains fixed.
  const vertices = [...mesh.vertices], faces: Mesh3D['triangles'] = [];
  mesh.triangles.forEach(face => {
    const p = face.indices.map(index => vertices[index]);
    if (p.every(point => point.z === p[0].z)) {
      const centroid = { x: (p[0].x + p[1].x + p[2].x) / 3, y: (p[0].y + p[1].y + p[2].y) / 3, z: p[0].z }, distance = Math.hypot(centroid.x - center.x, centroid.y - center.y) / radius;
      centroid.z += Math.sign(p[0].z) * amount * Math.sqrt(Math.max(0, 1 - distance * distance)); const id = vertices.push(centroid) - 1;
      for (let i = 0; i < 3; i++) faces.push({ indices: [face.indices[i], face.indices[(i + 1) % 3], id], color });
    } else faces.push(face);
  }); return { vertices, triangles: faces, source: 'inflate', inflate: amount, castShadow: true };
}
export function latheProfile(profile: Point[], segments = 24, angle = Math.PI * 2, color = '#9bb8c8'): Mesh3D {
  if (profile.length < 2 || profile.length > 128 || profile.some(point => point.x < 0 || !Number.isFinite(point.x + point.y))) throw new Error('Lathe requires a radius/Y profile with non-negative radii');
  segments = Math.max(3, Math.min(64, Math.round(segments))); angle = Math.max(.01, Math.min(Math.PI * 2, angle));
  const vertices: Vec3[] = [], triangles: Mesh3D['triangles'] = [];
  for (let segment = 0; segment <= segments; segment++) { const theta = angle * segment / segments; profile.forEach(point => vertices.push({ x: Math.cos(theta) * point.x, y: point.y, z: Math.sin(theta) * point.x })); }
  for (let segment = 0; segment < segments; segment++) for (let row = 0; row < profile.length - 1; row++) { const stride = profile.length, a = segment * stride + row, b = a + 1, c = a + stride, d = c + 1; triangles.push({ indices: [a, c, d], color }, { indices: [a, d, b], color }); }
  return { vertices, triangles, source: 'lathe', lathe: { segments, angle }, castShadow: true };
}
export function shapeOutline(shape: VectorShape): Point[] {
  if (shape.kind === 'polygon' && shape.points) return shape.points;
  if (shape.kind === 'rect') { const x = shape.x ?? 0, y = shape.y ?? 0, width = shape.width ?? 1, height = shape.height ?? 1; return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]; }
  if (shape.kind === 'ellipse') return Array.from({ length: 32 }, (_item, index) => { const t = index / 32 * Math.PI * 2; return { x: (shape.x ?? 0) + Math.cos(t) * (shape.radiusX ?? 1), y: (shape.y ?? 0) + Math.sin(t) * (shape.radiusY ?? 1) }; });
  throw new Error('Generate geometry from a rectangle, ellipse, or simple polygon layer');
}
