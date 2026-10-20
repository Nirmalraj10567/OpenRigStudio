import type { Point2D } from './math';

export interface Vec3 { x: number; y: number; z: number }
export interface Euler3 { x: number; y: number; z: number }
export interface Transform3D { position: Vec3; rotation: Euler3; scale: Vec3 }

export interface Camera3DSettings {
  enabled: boolean;
  position: Vec3;
  rotation: Euler3;
  focalLength: number;
  sensorWidth: number;
  projection: 'perspective' | 'orthographic';
  orthographicScale: number;
  near: number;
  far: number;
  focusDistance: number;
  aperture: number;
  fStop: number;
  depthOfField: boolean;
  exposure: number;
  ambient: number;
  keyLight: { direction: Vec3; color: string; intensity: number; castShadows: boolean };
  shadow: { enabled: boolean; softness: number; opacity: number; depth: number };
}

export interface ProjectedPoint extends Point2D {
  depth: number;
  scale: number;
  blur: number;
  visible: boolean;
}

const DEFAULT_CAMERA3D: Camera3DSettings = {
  enabled: false,
  position: { x: 0, y: 0, z: 900 },
  rotation: { x: 0, y: 0, z: 0 },
  focalLength: 50,
  sensorWidth: 36,
  projection: 'perspective',
  orthographicScale: 900,
  near: 1,
  far: 10000,
  focusDistance: 900,
  aperture: 0,
  fStop: 5.6,
  depthOfField: false,
  exposure: 1,
  ambient: .34,
  keyLight: { direction: { x: -.35, y: -.55, z: -1 }, color: '#fff4dc', intensity: 1, castShadows: true },
  shadow: { enabled: true, softness: 8, opacity: .22, depth: 0 },
};

const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const vec = (value: unknown, fallback: Vec3): Vec3 => {
  const source = value && typeof value === 'object' ? value as Partial<Vec3> : {};
  return { x: finite(source.x, fallback.x), y: finite(source.y, fallback.y), z: finite(source.z, fallback.z) };
};
const euler = (value: unknown): Euler3 => {
  const source = value && typeof value === 'object' ? value as Partial<Euler3> : {};
  return { x: clamp(finite(source.x, 0), -180, 180), y: clamp(finite(source.y, 0), -180, 180), z: clamp(finite(source.z, 0), -180, 180) };
};

export function defaultCamera3D(): Camera3DSettings { return JSON.parse(JSON.stringify(DEFAULT_CAMERA3D)) as Camera3DSettings; }

export function normalizeCamera3D(value: unknown): Camera3DSettings {
  const source = value && typeof value === 'object' ? value as Partial<Camera3DSettings> : {};
  const key = source.keyLight && typeof source.keyLight === 'object' ? source.keyLight as Partial<Camera3DSettings['keyLight']> : {} as Partial<Camera3DSettings['keyLight']>;
  const shadow = source.shadow && typeof source.shadow === 'object' ? source.shadow as Partial<Camera3DSettings['shadow']> : {} as Partial<Camera3DSettings['shadow']>;
  return {
    enabled: source.enabled === true,
    position: vec(source.position, DEFAULT_CAMERA3D.position), rotation: euler(source.rotation),
    focalLength: clamp(finite(source.focalLength, 50), 12, 400), sensorWidth: clamp(finite(source.sensorWidth, 36), 10, 100),
    projection: source.projection === 'orthographic' ? 'orthographic' : 'perspective', orthographicScale: clamp(finite(source.orthographicScale, 900), 20, 10000),
    near: clamp(finite(source.near, 1), .01, 10000), far: clamp(finite(source.far, 10000), 10, 100000),
    focusDistance: clamp(finite(source.focusDistance, 900), .01, 100000), aperture: clamp(finite(source.aperture, 0), 0, 1000), fStop: clamp(finite(source.fStop, 5.6), .1, 64), depthOfField: source.depthOfField === true, exposure: clamp(finite(source.exposure, 1), 0, 8), ambient: clamp(finite(source.ambient, .34), 0, 1),
    keyLight: { direction: vec(key.direction, DEFAULT_CAMERA3D.keyLight.direction), color: typeof key.color === 'string' ? key.color : DEFAULT_CAMERA3D.keyLight.color, intensity: clamp(finite(key.intensity, 1), 0, 8), castShadows: key.castShadows !== false },
    shadow: { enabled: shadow.enabled !== false, softness: clamp(finite(shadow.softness, 8), 0, 80), opacity: clamp(finite(shadow.opacity, .22), 0, 1), depth: finite(shadow.depth, 0) },
  };
}

export function normalizeTransform3D(value: unknown): Transform3D {
  const source = value && typeof value === 'object' ? value as Partial<Transform3D> : {};
  return { position: vec(source.position, { x: 0, y: 0, z: 0 }), rotation: euler(source.rotation), scale: { x: clamp(finite(source.scale && typeof source.scale === 'object' ? (source.scale as Vec3).x : undefined, 1), .001, 1000), y: clamp(finite(source.scale && typeof source.scale === 'object' ? (source.scale as Vec3).y : undefined, 1), .001, 1000), z: clamp(finite(source.scale && typeof source.scale === 'object' ? (source.scale as Vec3).z : undefined, 1), .001, 1000) } };
}

function radians(value: number): number { return value * Math.PI / 180; }
function rotate(point: Vec3, rotation: Euler3): Vec3 {
  const rx = radians(rotation.x), ry = radians(rotation.y), rz = radians(rotation.z);
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const x1 = point.x, y1 = point.y * cx - point.z * sx, z1 = point.y * sx + point.z * cx;
  const x2 = x1 * cy + z1 * sy, y2 = y1, z2 = -x1 * sy + z1 * cy;
  return { x: x2 * cz - y2 * sz, y: x2 * sz + y2 * cz, z: z2 };
}
function inverseRotate(point: Vec3, rotation: Euler3): Vec3 {
  // Inverse of Rz * Ry * Rx applies the reversed order Rx^-1 * Ry^-1 * Rz^-1.
  const z = rotate(point, { x: 0, y: 0, z: -rotation.z });
  const y = rotate(z, { x: 0, y: -rotation.y, z: 0 });
  return rotate(y, { x: -rotation.x, y: 0, z: 0 });
}

export function normalizeVec3(value: Vec3): Vec3 {
  const length = Math.hypot(value.x, value.y, value.z) || 1;
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

export function project3DPoint(point: Vec3, camera: Camera3DSettings, viewport: { width: number; height: number }, zoom = 1, cameraPan: Point2D = { x: 0, y: 0 }): ProjectedPoint {
  const settings = normalizeCamera3D(camera), relative = inverseRotate({ x: point.x - settings.position.x, y: point.y - settings.position.y, z: point.z - settings.position.z }, settings.rotation);
  const depth = -relative.z, focal = viewport.width * settings.focalLength / settings.sensorWidth;
  const perspectiveScale = settings.projection === 'orthographic' ? viewport.width / settings.orthographicScale : focal / Math.max(.0001, depth);
  const visible = depth >= settings.near && depth <= settings.far;
  return { x: viewport.width / 2 + relative.x * perspectiveScale * zoom + cameraPan.x, y: viewport.height / 2 + relative.y * perspectiveScale * zoom + cameraPan.y, depth, scale: perspectiveScale * zoom, blur: depthOfFieldBlur(depth, settings, viewport.width), visible };
}

export function transform3DPoint(point: Vec3, transform: Transform3D): Vec3 {
  const result = rotate({ x: point.x * transform.scale.x, y: point.y * transform.scale.y, z: point.z * transform.scale.z }, transform.rotation);
  return { x: transform.position.x + result.x, y: transform.position.y + result.y, z: transform.position.z + result.z };
}

export function applyEuler(point: Vec3, rotation: Euler3): Vec3 { return rotate(point, rotation); }
export function inverseEuler(point: Vec3, rotation: Euler3): Vec3 { return inverseRotate(point, rotation); }

export function depthOfFieldBlur(depth: number, camera: Camera3DSettings, viewportWidth = 800): number {
  const settings = normalizeCamera3D(camera); if (!settings.depthOfField) return 0;
  const diameter = settings.aperture || settings.focalLength / settings.fStop;
  const sensorCircle = diameter * settings.focalLength * Math.abs(depth - settings.focusDistance) / (Math.max(.01, depth) * Math.max(.01, settings.focusDistance - settings.focalLength));
  return clamp(sensorCircle * viewportWidth / settings.sensorWidth / 2, 0, 80);
}

export function shadeLight(normal: Vec3, camera: Camera3DSettings): number {
  const light = normalizeVec3(camera.keyLight.direction), n = normalizeVec3(normal);
  return clamp(normalizeCamera3D(camera).ambient + Math.max(0, n.x * -light.x + n.y * -light.y + n.z * -light.z) * camera.keyLight.intensity, 0, 2);
}

export function colorWithLight(color: string, amount: number, tint = '#ffffff'): string {
  const match = color.match(/^#([0-9a-f]{6})$/i); if (!match) return color;
  const light = tint.match(/^#([0-9a-f]{6})$/i);
  const channels = [0, 2, 4].map(index => clamp(Math.round(parseInt(match[1].slice(index, index + 2), 16) * amount * (light ? parseInt(light[1].slice(index, index + 2), 16) / 255 : 1)), 0, 255));
  return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}
