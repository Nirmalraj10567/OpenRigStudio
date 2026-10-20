import type { Point2D, Transform2D } from './math';
import type { AffineMatrix, LayerDataUnion, MeshData, VectorShape } from './model';

export type Point = Point2D;
export const MAX_MESH_DIVISIONS = 32;
export const MAX_MESH_VERTICES = (MAX_MESH_DIVISIONS + 1) ** 2;
export const affineIdentity = (): AffineMatrix => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
export function transformMatrix(t: Transform2D): AffineMatrix {
  const c = Math.cos(t.rotation), s = Math.sin(t.rotation);
  return { a: c * t.scaleX, b: s * t.scaleX, c: -s * t.scaleY, d: c * t.scaleY, e: t.x, f: t.y };
}
export function validMatrix(m: AffineMatrix | undefined): m is AffineMatrix {
  return !!m && [m.a, m.b, m.c, m.d, m.e, m.f].every(Number.isFinite);
}
export function multiplyMatrix(a: AffineMatrix, b: AffineMatrix): AffineMatrix {
  return {
    a: a.a * b.a + a.c * b.b, b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d, d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e, f: a.b * b.e + a.d * b.f + a.f,
  };
}
export function inverseMatrix(m: AffineMatrix): AffineMatrix | null {
  if (!validMatrix(m)) return null;
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const result = { a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det, f: (m.b * m.e - m.a * m.f) / det };
  return validMatrix(result) ? result : null;
}
export function applyMatrix(m: AffineMatrix, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}
/** Exact source-to-target mapping, with degenerate/non-finite triangles rejected. */
export function triangleAffine(source: [Point, Point, Point], target: [Point, Point, Point]): AffineMatrix | null {
  const basis = (p: [Point, Point, Point]): AffineMatrix => ({
    a: p[1].x - p[0].x, b: p[1].y - p[0].y, c: p[2].x - p[0].x,
    d: p[2].y - p[0].y, e: p[0].x, f: p[0].y,
  });
  const inverse = inverseMatrix(basis(source));
  const destination = basis(target);
  if (!inverse || !inverseMatrix(destination)) return null;
  const result = multiplyMatrix(destination, inverse);
  return validMatrix(result) ? result : null;
}

/** Expand only the clip by a subpixel apron to avoid antialias cracks between
 * adjacent textured triangles. The texture mapping and authored mesh stay exact. */
export function triangleClipApron(points: [Point, Point, Point], padding = .35): [Point, Point, Point] {
  const area = (points[1].x - points[0].x) * (points[2].y - points[0].y) - (points[1].y - points[0].y) * (points[2].x - points[0].x);
  if (!Number.isFinite(area) || Math.abs(area) < 1e-9 || !Number.isFinite(padding) || padding <= 0) return points.map(p => ({ ...p })) as [Point, Point, Point];
  const sign = Math.sign(area);
  const normals = points.map((p, i) => { const q = points[(i + 1) % 3], length = Math.hypot(q.x - p.x, q.y - p.y); return { x: sign * (q.y - p.y) / length, y: -sign * (q.x - p.x) / length }; });
  return points.map((p, i) => {
    const a = normals[(i + 2) % 3], b = normals[i], x = a.x + b.x, y = a.y + b.y;
    const factor = Math.min(padding / Math.max(1e-6, x * b.x + y * b.y), 4 * padding / Math.max(1e-6, Math.hypot(x, y)));
    return { x: p.x + x * factor, y: p.y + y * factor };
  }) as [Point, Point, Point];
}

/** Returns null instead of silently accepting negative, infinite or unknown values. */
export function normalizeWeights(input: Record<string, number>): Record<string, number> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const entries = Object.entries(input);
  if (entries.some(([, weight]) => !Number.isFinite(weight) || weight < 0)) return null;
  const maximum = Math.max(0, ...entries.map(([, weight]) => weight));
  if (!maximum) return {};
  const total = entries.reduce((sum, [, weight]) => sum + weight / maximum, 0);
  return Object.fromEntries(entries.filter(([, weight]) => weight > 0).map(([id, weight]) => [id, (weight / maximum) / total]));
}

export function validMesh(mesh: MeshData | undefined): mesh is MeshData {
  if (!mesh || !Array.isArray(mesh.vertices) || mesh.vertices.length < 3 || mesh.vertices.length > MAX_MESH_VERTICES
    || !Array.isArray(mesh.triangles) || mesh.triangles.length < 3 || mesh.triangles.length > MAX_MESH_DIVISIONS ** 2 * 6
    || mesh.triangles.length % 3 !== 0) return false;
  const b = mesh.bounds;
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0) return false;
  return mesh.vertices.every(v => v && [v.x, v.y, v.u, v.v].every(Number.isFinite)
    && v.u >= 0 && v.u <= 1 && v.v >= 0 && v.v <= 1 && normalizeWeights(v.weights) !== null)
    && mesh.triangles.every(i => Number.isInteger(i) && i >= 0 && i < mesh.vertices.length)
    && (!mesh.bindLayerMatrix || validMatrix(mesh.bindLayerMatrix))
    && (!mesh.bindBoneInverses || (typeof mesh.bindBoneInverses === 'object' && Object.values(mesh.bindBoneInverses).every(validMatrix)));
}

// A conservative path control hull works in Node as well as in the browser.
// It includes curve controls, relative commands and a padded arc hull.
function pathPoints(d: string): Point[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  const arity: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
  let x = 0, y = 0, sx = 0, sy = 0, i = 0, command = '';
  const points: Point[] = [];
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++];
    const kind = command.toUpperCase(), relative = command !== kind;
    if (kind === 'Z') { x = sx; y = sy; command = ''; continue; }
    const n = arity[kind];
    if (!n || i + n > tokens.length || tokens.slice(i, i + n).some(t => /^[a-z]$/i.test(t))) { i++; continue; }
    const values = tokens.slice(i, i + n).map(Number); i += n;
    const ox = relative ? x : 0, oy = relative ? y : 0;
    if (kind === 'H') x = values[0] + ox;
    else if (kind === 'V') y = values[0] + oy;
    else if (kind === 'A') {
      const radius = Math.abs(values[0]) + Math.abs(values[1]);
      points.push({ x: x - radius, y: y - radius }, { x: x + radius, y: y + radius });
      x = values[5] + ox; y = values[6] + oy;
      points.push({ x: x - radius, y: y - radius }, { x: x + radius, y: y + radius });
    } else {
      for (let j = 0; j < n; j += 2) points.push({ x: values[j] + ox, y: values[j + 1] + oy });
      x = values[n - 2] + ox; y = values[n - 1] + oy;
    }
    points.push({ x, y });
    if (kind === 'M') { sx = x; sy = y; command = relative ? 'l' : 'L'; }
  }
  return points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
}
function shapePoints(s: VectorShape): Point[] {
  const x = s.x ?? 0, y = s.y ?? 0;
  if (s.kind === 'path') return pathPoints(s.d ?? '');
  if (s.kind === 'polygon') return s.points ?? [];
  if (s.kind === 'ellipse') return [
    { x: x - Math.abs(s.radiusX ?? 1), y: y - Math.abs(s.radiusY ?? 1) },
    { x: x + Math.abs(s.radiusX ?? 1), y: y + Math.abs(s.radiusY ?? 1) },
  ];
  return [{ x, y }, { x: x + (s.width ?? 1), y: y + (s.height ?? 1) }];
}
export function meshBounds(layer: LayerDataUnion): MeshData['bounds'] | null {
  if (layer.type === 'image') return Number.isFinite(layer.width + layer.height) && layer.width > 0 && layer.height > 0
    ? { x: -layer.width / 2, y: -layer.height / 2, width: layer.width, height: layer.height } : null;
  const points = layer.shapes.flatMap(shape => {
    const padding = shape.stroke && shape.stroke !== 'none' ? Math.abs(shape.strokeWidth ?? 1) / 2 : 0;
    return shapePoints(shape).flatMap(p => [{ x: p.x - padding, y: p.y - padding }, { x: p.x + padding, y: p.y + padding }]);
  }).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!points.length) return null;
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}
export function makeMesh(layer: LayerDataUnion, columns: number, rows: number): MeshData | null {
  if (![columns, rows].every(Number.isFinite) || columns < 1 || rows < 1) return null;
  columns = Math.min(MAX_MESH_DIVISIONS, Math.floor(columns)); rows = Math.min(MAX_MESH_DIVISIONS, Math.floor(rows));
  const bounds = meshBounds(layer);
  if (!bounds) return null;
  const mesh: MeshData = { bounds, vertices: [], triangles: [] };
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
    const u = x / columns, v = y / rows;
    mesh.vertices.push({ x: bounds.x + bounds.width * u, y: bounds.y + bounds.height * v, u, v, weights: {} });
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const a = y * (columns + 1) + x, b = a + 1, c = a + columns + 1, d = c + 1;
    mesh.triangles.push(a, b, d, a, d, c);
  }
  return mesh;
}

/** Squared distance to the actual bone segment, not just its origin. */
export function segmentDistanceSquared(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length > 1e-12 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}
