import type { BoneDynamics, DynamicsBake, DynamicsSettings, MeshDynamics, ParticleEmitter, PhysicsBody, PhysicsCache, PhysicsFrame } from './model';
import { Rig } from './Rig';
import type { AnimationClip, VectorShape } from './model';
import { identity, localToWorldPoint, worldToLocalPoint } from './math';
import { sampleTrack } from './animation';
import { mapAnimationFrame } from './animationNla';
import type { Point2D } from './math';

let sequence = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++sequence}`;
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function defaultDynamics(): DynamicsSettings {
  return { enabled: false, startFrame: 0, endFrame: 120, fps: 24, substeps: 4, gravityX: 0, gravityY: 420, windX: 0, windY: 0, windNoise: 0, seed: 1, bones: [], bodies: [], meshes: [], emitters: [] };
}
export function normalizeDynamicsBake(value: unknown, validIds: Set<string>, layerIds: Set<string>): DynamicsBake | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Partial<DynamicsBake>;
  if (!Array.isArray(raw.targetIds) || !Array.isArray(raw.meshIds)) return undefined;
  return { sourceAnimationId: typeof raw.sourceAnimationId === 'string' ? raw.sourceAnimationId : null, startFrame: Math.max(0, finite(raw.startFrame, 0)), endFrame: Math.max(0, finite(raw.endFrame, 120)), fps: clamp(finite(raw.fps, 24), 1, 120), targetIds: [...new Set(raw.targetIds.filter(id => validIds.has(id)))], meshIds: [...new Set(raw.meshIds.filter(id => layerIds.has(id)))], ...(raw.particleLayerId && layerIds.has(raw.particleLayerId) ? { particleLayerId: raw.particleLayerId } : {}) };
}
export function normalizeDynamics(value: unknown, boneIds: Set<string>, layerIds: Set<string>): DynamicsSettings {
  const base = defaultDynamics(); if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  const raw = value as Partial<DynamicsSettings>, ids = new Set<string>(), dynamicBones = new Set<string>(), dynamicMeshes = new Set<string>(), dynamicTargets = new Set<string>();
  const safeId = (value: unknown, prefix: string) => { const id = typeof value === 'string' && value ? value : uid(prefix); if (ids.has(id)) return null; ids.add(id); return id; };
  const bodies = Array.isArray(raw.bodies) ? raw.bodies.slice(0, 256).flatMap((body): PhysicsBody[] => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return []; const id = safeId(body.id, 'body'); if (!id) return [];
    const targetId = body.targetId && (boneIds.has(body.targetId) || layerIds.has(body.targetId)) ? body.targetId : undefined;
    if (body.motion === 'dynamic' && targetId && body.enabled !== false) { if (dynamicTargets.has(targetId)) return []; dynamicTargets.add(targetId); }
    const initialVelocity = body.initialVelocity && Number.isFinite(body.initialVelocity.x) && Number.isFinite(body.initialVelocity.y)
      ? { x: clamp(body.initialVelocity.x, -100000, 100000), y: clamp(body.initialVelocity.y, -100000, 100000) }
      : undefined;
    const launchFrame = Number.isFinite(body.launchFrame) ? Math.round(clamp(body.launchFrame!, 0, 100000)) : undefined;
    return [{ id, name: typeof body.name === 'string' ? body.name : 'Physics body', targetId, shape: body.shape === 'box' ? 'box' : 'circle', motion: body.motion === 'dynamic' || body.motion === 'kinematic' ? body.motion : 'static', x: finite(body.x, 400), y: finite(body.y, 260), radius: clamp(finite(body.radius, 30), .1, 10000), width: clamp(finite(body.width, 100), .1, 10000), height: clamp(finite(body.height, 30), .1, 10000), rotation: finite(body.rotation, 0), mass: clamp(finite(body.mass, 1), .001, 10000), restitution: clamp(finite(body.restitution, .3), 0, 1), friction: clamp(finite(body.friction, .2), 0, 1), ...(Number.isFinite(body.windScale) ? { windScale: clamp(body.windScale!, -10, 10) } : {}), ...(initialVelocity ? { initialVelocity } : {}), ...(launchFrame !== undefined ? { launchFrame } : {}), enabled: body.enabled !== false }];
  }) : [];
  const bones = Array.isArray(raw.bones) ? raw.bones.slice(0, 256).flatMap((bone): BoneDynamics[] => {
    if (!bone || !boneIds.has(bone.boneId) || dynamicBones.has(bone.boneId)) return []; const id = safeId(bone.id, 'dynamic'); if (!id) return []; dynamicBones.add(bone.boneId);
    return [{ id, boneId: bone.boneId, enabled: bone.enabled !== false, mode: ['hair', 'tail', 'follow-through', 'jiggle'].includes(bone.mode) ? bone.mode : 'spring', stiffness: clamp(finite(bone.stiffness, 35), 0, 1000), damping: clamp(finite(bone.damping, 7), 0, 1000), mass: clamp(finite(bone.mass, 1), .001, 10000), gravityScale: clamp(finite(bone.gravityScale, .2), -10, 10), windScale: clamp(finite(bone.windScale, 1), -10, 10), influence: clamp(finite(bone.influence, 1), 0, 1), overlap: clamp(finite(bone.overlap, .2), 0, 2), ...(bone.mode === 'jiggle' || bone.maxDisplacement !== undefined ? { maxDisplacement: clamp(finite(bone.maxDisplacement, 8), 0, 1000) } : {}) }];
  }) : [];
  const meshes = Array.isArray(raw.meshes) ? raw.meshes.slice(0, 64).flatMap((mesh): MeshDynamics[] => {
    if (!mesh || !layerIds.has(mesh.layerId) || dynamicMeshes.has(mesh.layerId)) return []; const id = safeId(mesh.id, 'cloth'); if (!id) return []; dynamicMeshes.add(mesh.layerId);
    return [{ id, layerId: mesh.layerId, enabled: mesh.enabled !== false, mode: mesh.mode === 'soft-body' ? 'soft-body' : 'cloth', stiffness: clamp(finite(mesh.stiffness, 20), 0, 1000), damping: clamp(finite(mesh.damping, 5), 0, 1000), mass: clamp(finite(mesh.mass, 1), .001, 10000), gravityScale: clamp(finite(mesh.gravityScale, 1), -10, 10), windScale: clamp(finite(mesh.windScale, 1), -10, 10), pinned: Array.isArray(mesh.pinned) ? [...new Set(mesh.pinned.filter(index => Number.isInteger(index) && index >= 0))].slice(0, 1089) : [], ...(mesh.poseFollow !== undefined ? { poseFollow: clamp(finite(mesh.poseFollow, 0), 0, 1) } : {}), ...(mesh.maxDisplacement !== undefined ? { maxDisplacement: clamp(finite(mesh.maxDisplacement, 0), 0, 10000) } : {}), ...(mesh.adaptiveRest === true ? { adaptiveRest: true } : {}) }];
  }) : [];
  const emitters = Array.isArray(raw.emitters) ? raw.emitters.slice(0, 64).flatMap((emitter): ParticleEmitter[] => {
    if (!emitter || typeof emitter !== 'object' || Array.isArray(emitter)) return []; const id = safeId(emitter.id, 'emitter'); if (!id) return [];
    return [{ id, name: typeof emitter.name === 'string' ? emitter.name : 'Particles', targetId: emitter.targetId && (boneIds.has(emitter.targetId) || layerIds.has(emitter.targetId)) ? emitter.targetId : undefined, enabled: emitter.enabled !== false, x: finite(emitter.x, 400), y: finite(emitter.y, 200), rate: clamp(finite(emitter.rate, 12), 0, 1000), lifetime: clamp(finite(emitter.lifetime, 2), .01, 60), speed: clamp(finite(emitter.speed, 80), 0, 10000), spread: clamp(finite(emitter.spread, .6), 0, Math.PI * 2), direction: finite(emitter.direction, -Math.PI / 2), size: clamp(finite(emitter.size, 4), .1, 100), color: typeof emitter.color === 'string' ? emitter.color : '#84d6c4' }];
  }) : [];
  const startFrame = Math.round(clamp(finite(raw.startFrame, 0), 0, 100000));
  const endFrame = Math.round(clamp(finite(raw.endFrame, 120), startFrame, startFrame + 10000));
  const settings: DynamicsSettings = { ...base, enabled: raw.enabled === true, startFrame, endFrame, fps: clamp(finite(raw.fps, 24), 1, 120), substeps: Math.round(clamp(finite(raw.substeps, 4), 1, 32)), gravityX: clamp(finite(raw.gravityX, 0), -10000, 10000), gravityY: clamp(finite(raw.gravityY, 420), -10000, 10000), windX: clamp(finite(raw.windX, 0), -10000, 10000), windY: clamp(finite(raw.windY, 0), -10000, 10000), windNoise: clamp(finite(raw.windNoise, 0), 0, 1000), seed: Math.round(finite(raw.seed, 1)), bones, bodies, meshes, emitters };
  const cache = raw.cache;
  if (cache && typeof cache.signature === 'string' && cache.startFrame === startFrame && cache.endFrame === endFrame && cache.fps === settings.fps && Array.isArray(cache.frames) && cache.frames.length === endFrame - startFrame + 1 && cache.frames.every((frame, index) => validPhysicsFrame(frame) && frame.frame === startFrame + index)) settings.cache = JSON.parse(JSON.stringify(cache));
  return settings;
}

export function addBoneDynamics(rig: Rig, boneId: string, mode: BoneDynamics['mode'] = 'spring'): string | null {
  if (!rig.bones.has(boneId) || rig.smartEditingActionId || rig.dynamics.bones.some(item => item.boneId === boneId)) return null;
  const id = uid('dynamic'); rig.dynamics.bones.push({ id, boneId, enabled: true, mode, stiffness: mode === 'jiggle' ? 90 : mode === 'hair' ? 18 : mode === 'tail' ? 28 : 35, damping: mode === 'hair' ? 4 : 7, mass: 1, gravityScale: mode === 'follow-through' || mode === 'jiggle' ? 0 : .2, windScale: mode === 'jiggle' ? 0 : 1, influence: 1, overlap: mode === 'jiggle' ? 1 : mode === 'follow-through' ? .6 : .2, ...(mode === 'jiggle' ? { maxDisplacement: 8 } : {}) }); rig.dynamics.enabled = true; invalidateDynamics(rig); return id;
}
export function addMeshDynamics(rig: Rig, layerId: string, mode: MeshDynamics['mode'] = 'cloth'): string | null {
  const layer = rig.layers.get(layerId); if (!layer?.mesh || rig.smartEditingActionId || rig.dynamics.meshes.some(item => item.layerId === layerId)) return null;
  const top = Math.min(...layer.mesh.vertices.map(vertex => vertex.y)), pinned = layer.mesh.vertices.flatMap((vertex, index) => Math.abs(vertex.y - top) < .01 ? [index] : []);
  const id = uid('cloth'); rig.dynamics.meshes.push({ id, layerId, enabled: true, mode, stiffness: mode === 'cloth' ? 20 : 35, damping: 5, mass: 1, gravityScale: 1, windScale: 1, pinned }); rig.dynamics.enabled = true; invalidateDynamics(rig); return id;
}
export function addPhysicsBody(rig: Rig, targetId?: string): string {
  const target = targetId ? rig.bones.get(targetId) ?? rig.layers.get(targetId) : undefined, id = uid('body');
  rig.dynamics.bodies.push({ id, targetId: target?.id, name: target?.name ?? 'Collision body', shape: 'circle', motion: target ? 'kinematic' : 'static', x: target ? 0 : 400, y: target ? 0 : 450, radius: 30, width: 100, height: 30, rotation: 0, mass: 1, restitution: .3, friction: .2, enabled: true }); rig.dynamics.enabled = true; invalidateDynamics(rig); return id;
}
export function addParticleEmitter(rig: Rig, targetId?: string): string {
  const id = uid('emitter'), attached = targetId && (rig.bones.has(targetId) || rig.layers.has(targetId)); rig.dynamics.emitters.push({ id, targetId: attached ? targetId : undefined, name: 'Particles', enabled: true, x: attached ? 0 : 400, y: attached ? 0 : 200, rate: 12, lifetime: 2, speed: 80, spread: .6, direction: -Math.PI / 2, size: 4, color: '#84d6c4' }); rig.dynamics.enabled = true; invalidateDynamics(rig); return id;
}

/** Push a point out of circle/oriented-box collision bodies. */
export function collidePhysicsPoint(point: Point2D, body: PhysicsBody, padding = 0): Point2D {
  if (!body.enabled) return point;
  if (body.shape === 'circle') { const dx = point.x - body.x, dy = point.y - body.y, length = Math.hypot(dx, dy), radius = body.radius + padding; if (length < radius) return { x: body.x + (length ? dx / length : 1) * radius, y: body.y + (length ? dy / length : 0) * radius }; return point; }
  const c = Math.cos(body.rotation), s = Math.sin(body.rotation), wx = point.x - body.x, wy = point.y - body.y;
  const halfX = body.width / 2 + padding, halfY = body.height / 2 + padding, dx = wx * c + wy * s, dy = -wx * s + wy * c;
  if (Math.abs(dx) >= halfX || Math.abs(dy) >= halfY) return point;
  const local = halfX - Math.abs(dx) < halfY - Math.abs(dy) ? { x: Math.sign(dx || 1) * halfX, y: dy } : { x: dx, y: Math.sign(dy || -1) * halfY };
  return { x: body.x + local.x * c - local.y * s, y: body.y + local.x * s + local.y * c };
}

function validPhysicsFrame(value: unknown): value is PhysicsFrame {
  if (!value || typeof value !== 'object') return false;
  const frame = value as PhysicsFrame;
  const record = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const point = (value: any) => record(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
  return Number.isInteger(frame.frame) && record(frame.bones) && Object.values(frame.bones).every(Number.isFinite)
    && (frame.boneOffsets === undefined || record(frame.boneOffsets) && Object.values(frame.boneOffsets).every(point))
    && record(frame.bodies) && Object.values(frame.bodies).every(body => point(body) && Number.isFinite(body.rotation))
    && record(frame.meshes) && Object.values(frame.meshes).every(points => Array.isArray(points) && points.length <= 1089 && points.every(point))
    && Array.isArray(frame.particles) && frame.particles.length <= 5000 && frame.particles.every(p => point(p) && Number.isFinite(p.size) && p.size > 0 && typeof p.color === 'string' && Number.isFinite(p.opacity) && p.opacity >= 0 && p.opacity <= 1);
}

const sessions = new WeakMap<Rig, Simulation>();
const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** Fingerprints stable inputs, excluding current sampled animation channels. */
export function dynamicsSignature(rig: Rig, includeSampledPose = false): string {
  const { cache: _cache, enabled: _enabled, ...settings } = rig.dynamics;
  const animated = new Set(rig.animations.flatMap(clip => [...clip.tracks.map(track => track.targetId), ...Object.keys(clip.setupPose ?? {})]));
  const strip = ({ world: _world, ...target }: any) => {
    const item = { ...target };
    if (!includeSampledPose && rig.timeline.activeAnimationId && animated.has(item.id)) { delete item.local; delete item.opacity; delete item.visible; delete item.zIndex; if (item.mesh) item.mesh = { ...item.mesh, vertices: item.mesh.vertices.map(({ x: _x, y: _y, ...vertex }: any) => vertex) }; }
    return item;
  };
  const viewOverrides = rig.getManualViewAngles();
  const source = JSON.stringify({ settings, animationId: rig.timeline.activeAnimationId, animations: rig.animations, bones: [...rig.bones.values()].map(strip), layers: [...rig.layers.values()].map(strip), groups: [...rig.groups.values()].map(strip), bindings: [...rig.bindings.values()], constraints: rig.constraints, smart: rig.smartActions, facial: rig.facialProfiles, views: rig.characterViews, viewOverrides, controllers: rig.controllers, inputs: [...rig.controllerState.entries()] });
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `physics-v3-${(hash >>> 0).toString(16)}-${source.length}`;
}

export function invalidateDynamics(rig: Rig): void { sessions.delete(rig); delete rig.dynamics.cache; rig.physicsFrame = null; }

interface MovingPoint extends Point2D { vx: number; vy: number }
interface SimParticle extends MovingPoint { age: number; lifetime: number; size: number; color: string }
interface AngularState { rotation: number; velocity: number; anchor: Point2D; point: MovingPoint }
interface SimMesh { points: MovingPoint[]; base: Point2D[]; pinned: Set<number>; edges: Array<{ a: number; b: number; length: number }> }
interface Simulation {
  rig: Rig;
  settings: DynamicsSettings;
  signature: string;
  frames: PhysicsFrame[];
  bones: Map<string, AngularState>;
  bodies: Map<string, MovingPoint & { rotation: number; angularVelocity: number }>;
  meshes: Map<string, SimMesh>;
  particles: SimParticle[];
  fractions: Map<string, number>;
  launchedBodies: Set<string>;
  random: () => number;
  viewOverrides: Array<[string, number]>;
}

function emptyFrame(frame: number): PhysicsFrame { return { frame, bones: {}, boneOffsets: {}, bodies: {}, meshes: {}, particles: [] }; }
function bodyWorld(rig: Rig, body: PhysicsBody): PhysicsBody {
  const target = body.targetId ? rig.bones.get(body.targetId) ?? rig.layers.get(body.targetId) : undefined;
  if (!target) return { ...body };
  const origin = localToWorldPoint(target.world, body);
  return { ...body, ...origin, rotation: target.world.rotation + body.rotation };
}
export function physicsBodies(rig: Rig): PhysicsBody[] {
  return rig.dynamics.bodies.filter(body => body.enabled).map(body => ({ ...bodyWorld(rig, body), ...rig.physicsFrame?.bodies[body.id] }));
}
function sampleBase(sim: Simulation, frame: number): void {
  const rig = sim.rig;
  if (rig.timeline.activeAnimationId) rig.applyAnimation(rig.timeline.activeAnimationId, frame);
  else { rig.setTimeline({ currentFrame: frame }); rig.update(); }
  if (sim.viewOverrides.length) {
    sim.viewOverrides.forEach(([id, angle]) => rig.characterAngleOverrides.set(id, { frame, angle }));
    rig.update();
  }
}
function createSimulation(source: Rig, signature: string): Simulation {
  const project = source.toProject();
  project.dynamics = { ...copy(source.dynamics), enabled: false, cache: undefined };
  project.timeline.isPlaying = false;
  const rig = new Rig(project); rig.dynamicsSuppressed = true;
  source.controllerState.forEach((state, id) => rig.controllerState.set(id, copy(state)));
  let seed = source.dynamics.seed >>> 0;
  const sim: Simulation = { rig, settings: copy(source.dynamics), signature, frames: [], bones: new Map(), bodies: new Map(), meshes: new Map(), particles: [], fractions: new Map(), launchedBodies: new Set(), viewOverrides: source.getManualViewAngles(), random: () => { seed += 0x6D2B79F5; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | seed); return ((t ^ t >>> 14) >>> 0) / 4294967296; } };
  delete sim.settings.cache;
  sampleBase(sim, sim.settings.startFrame);
  sim.settings.bones.filter(item => item.enabled).forEach(item => {
    const bone = rig.bones.get(item.boneId); if (bone) sim.bones.set(item.boneId, { rotation: bone.world.rotation, velocity: 0, anchor: { x: bone.world.x, y: bone.world.y }, point: { x: bone.world.x, y: bone.world.y, vx: 0, vy: 0 } });
  });
  sim.settings.bodies.filter(item => item.enabled).forEach(item => { const body = bodyWorld(rig, item); sim.bodies.set(item.id, { x: body.x, y: body.y, rotation: body.rotation, vx: 0, vy: 0, angularVelocity: 0 }); });
  sim.settings.meshes.filter(item => item.enabled).forEach(item => {
    const layer = rig.layers.get(item.layerId), points = rig.getMeshVertices(item.layerId, false); if (!layer?.mesh || !points.length) return;
    const edgeIds = new Set<string>(), edges: SimMesh['edges'] = [];
    for (let i = 0; i < layer.mesh.triangles.length; i += 3) {
      const triangle = layer.mesh.triangles.slice(i, i + 3);
      triangle.forEach((a, j) => { const b = triangle[(j + 1) % 3], key = `${Math.min(a, b)}:${Math.max(a, b)}`; if (edgeIds.has(key)) return; edgeIds.add(key); edges.push({ a, b, length: Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) }); });
    }
    sim.meshes.set(item.layerId, { points: points.map(point => ({ ...point, vx: 0, vy: 0 })), base: points.map(point => ({ ...point })), pinned: new Set(item.pinned), edges });
  });
  const initial = emptyFrame(sim.settings.startFrame);
  sim.bones.forEach((_state, id) => initial.bones[id] = 0);
  sim.settings.bones.filter(item => item.enabled && item.mode === 'jiggle').forEach(item => { initial.boneOffsets![item.boneId] = { x: 0, y: 0 }; });
  sim.bodies.forEach((state, id) => initial.bodies[id] = { x: state.x, y: state.y, rotation: state.rotation });
  sim.meshes.forEach((mesh, id) => initial.meshes[id] = mesh.points.map(({ x, y }) => ({ x, y })));
  sim.frames.push(initial);
  return sim;
}

/** Contact response from a projection normal: restitution on normal, friction on tangent. */
function contact(point: MovingPoint, body: PhysicsBody, padding = 0, velocity = { x: 0, y: 0 }): void {
  const corrected = collidePhysicsPoint(point, body, padding);
  const dx = corrected.x - point.x, dy = corrected.y - point.y, distance = Math.hypot(dx, dy);
  if (distance < 1e-9) return;
  const nx = dx / distance, ny = dy / distance, normal = (point.vx - velocity.x) * nx + (point.vy - velocity.y) * ny;
  point.x = corrected.x; point.y = corrected.y;
  if (normal < 0) { point.vx -= (1 + body.restitution) * normal * nx; point.vy -= (1 + body.restitution) * normal * ny; }
  const tangent = (point.vx - velocity.x) * -ny + (point.vy - velocity.y) * nx;
  point.vx += tangent * ny * body.friction; point.vy -= tangent * nx * body.friction;
}

function limitTravel(point: MovingPoint, anchor: Point2D, maximum: number): void {
  const dx = point.x - anchor.x, dy = point.y - anchor.y, distance = Math.hypot(dx, dy);
  if (distance <= maximum || distance < 1e-9) return;
  const nx = dx / distance, ny = dy / distance;
  point.x = anchor.x + nx * maximum; point.y = anchor.y + ny * maximum;
  const outward = point.vx * nx + point.vy * ny;
  if (outward > 0) { point.vx -= outward * nx; point.vy -= outward * ny; }
}
function advanceSimulation(sim: Simulation): void {
  const settings = sim.settings, rig = sim.rig, frame = settings.startFrame + sim.frames.length;
  const dt = 1 / settings.fps / settings.substeps;
  let result = emptyFrame(frame);
  for (let sub = 1; sub <= settings.substeps; sub++) {
    const timeFrame = frame - 1 + sub / settings.substeps;
    sampleBase(sim, timeFrame);
    result = emptyFrame(frame);
    const noise = settings.windNoise * Math.sin((timeFrame - settings.startFrame) / settings.fps * 3.17 + settings.seed);
    const windX = settings.windX + noise, windY = settings.windY + noise * .35;
    // World-angle springs naturally lag a moving parent. Resolve root-to-tip each substep.
    const depth = (id: string) => { let bone = rig.bones.get(id), d = 0; const seen = new Set<string>(); while (bone?.parentId && !seen.has(bone.id)) { seen.add(bone.id); bone = rig.bones.get(bone.parentId); d++; } return d; };
    const boneSettings = settings.bones.filter(item => item.enabled && sim.bones.has(item.boneId)).sort((a, b) => depth(a.boneId) - depth(b.boneId));
    const bases = new Map(boneSettings.map(item => { const bone = rig.bones.get(item.boneId)!; return [item.boneId, { world: { ...bone.world }, local: rig.getConstraintLocal(item.boneId) }] as const; }));
    for (const item of boneSettings) {
      const state = sim.bones.get(item.boneId)!, bone = rig.bones.get(item.boneId)!, base = bases.get(item.boneId)!;
      if (item.mode === 'jiggle') {
        // A bounded translational spring responds to vertical as well as lateral
        // motion, unlike a pendulum that can only rotate around its anchor.
        const target = { x: bone.world.x, y: bone.world.y }, point = state.point;
        const follow = 1 - clamp(item.overlap, 0, 1);
        point.x += (target.x - state.anchor.x) * follow; point.y += (target.y - state.anchor.y) * follow;
        const stiffness = item.stiffness / item.mass, denominator = 1 + item.damping * dt / item.mass + stiffness * dt * dt;
        point.vx = (point.vx + (stiffness * (target.x - point.x) + settings.gravityX * item.gravityScale + windX * item.windScale / item.mass) * dt) / denominator;
        point.vy = (point.vy + (stiffness * (target.y - point.y) + settings.gravityY * item.gravityScale + windY * item.windScale / item.mass) * dt) / denominator;
        point.x += point.vx * dt; point.y += point.vy * dt;
        limitTravel(point, target, item.maxDisplacement ?? 8);
        const parent = bone.parentId ? rig.bones.get(bone.parentId)?.world ?? identity() : identity();
        const a = worldToLocalPoint(parent, target), b = worldToLocalPoint(parent, point);
        result.boneOffsets![bone.id] = a && b ? { x: (b.x - a.x) * item.influence, y: (b.y - a.y) * item.influence } : { x: 0, y: 0 };
        state.anchor = target;
        rig.applyPhysicsFrame(result);
        continue;
      }
      const length = Math.max(1, Math.abs(bone.length * bone.world.scaleX));
      const fx = settings.gravityX * item.gravityScale + windX * item.windScale, fy = settings.gravityY * item.gravityScale + windY * item.windScale;
      const anchorVX = (bone.world.x - state.anchor.x) / dt, anchorVY = (bone.world.y - state.anchor.y) / dt;
      const torque = (Math.cos(state.rotation) * (fy - anchorVY * item.overlap) - Math.sin(state.rotation) * (fx - anchorVX * item.overlap)) / length;
      const stiffness = item.stiffness / item.mass, damping = item.damping / item.mass;
      state.velocity = (state.velocity + dt * (stiffness * angle(base.world.rotation - state.rotation) + torque)) / (1 + damping * dt + stiffness * dt * dt);
      state.rotation += state.velocity * dt;
      state.anchor = { x: bone.world.x, y: bone.world.y };
      const parent = bone.parentId ? rig.bones.get(bone.parentId)?.world.rotation ?? 0 : 0;
      result.bones[bone.id] = angle(state.rotation - parent - base.local.rotation) * item.influence;
      rig.applyPhysicsFrame(result);
      // Project the tip out of colliders, then retain the resulting angular response.
      let tip = localToWorldPoint(bone.world, { x: bone.length, y: 0 });
      for (const collider of settings.bodies.filter(body => body.enabled && body.targetId !== bone.id)) tip = collidePhysicsPoint(tip, { ...bodyWorld(rig, collider), ...sim.bodies.get(collider.id) });
      const wanted = Math.atan2(tip.y - bone.world.y, tip.x - bone.world.x) - (bone.world.scaleX < 0 ? Math.PI : 0);
      const correction = angle(wanted - bone.world.rotation);
      if (Math.abs(correction) > 1e-8) { result.bones[bone.id] += correction * item.influence; state.rotation += correction; state.velocity *= .5; rig.applyPhysicsFrame(result); }
    }
    const colliders = settings.bodies.filter(body => body.enabled).map(body => {
      const state = sim.bodies.get(body.id)!;
      if (body.motion === 'kinematic') {
        const pose = bodyWorld(rig, body);
        Object.assign(state, { vx: (pose.x - state.x) / dt, vy: (pose.y - state.y) / dt, angularVelocity: angle(pose.rotation - state.rotation) / dt, x: pose.x, y: pose.y, rotation: pose.rotation });
      } else if (body.motion === 'dynamic') {
        const launchFrame = body.launchFrame ?? settings.startFrame;
        const waitingForLaunch = body.initialVelocity && frame < launchFrame;
        if (!sim.launchedBodies.has(body.id) && frame >= launchFrame) {
          if (body.initialVelocity) {
            state.vx = body.initialVelocity.x;
            state.vy = body.initialVelocity.y;
          }
          sim.launchedBodies.add(body.id);
        }
        if (!waitingForLaunch) {
          const windScale = body.windScale ?? 1;
          state.vx += (settings.gravityX + windX * windScale / body.mass) * dt; state.vy += (settings.gravityY + windY * windScale / body.mass) * dt;
          state.x += state.vx * dt; state.y += state.vy * dt;
        } else {
          state.vx = 0; state.vy = 0;
        }
      }
      return { ...body, x: state.x, y: state.y, rotation: state.rotation };
    });
    // Dynamic bodies use a circular proxy; static/kinematic boxes retain orientation.
    for (let iteration = 0; iteration < 3; iteration++) for (const body of colliders.filter(item => item.motion === 'dynamic')) {
      if (body.initialVelocity && body.launchFrame !== undefined && frame < body.launchFrame) continue;
      const state = sim.bodies.get(body.id)!, radius = body.shape === 'circle' ? body.radius : Math.hypot(body.width, body.height) / 2;
      for (const other of colliders) {
        if (body.id === other.id) continue;
        if (other.motion !== 'dynamic') {
          const obstacle = sim.bodies.get(other.id)!;
          const surface = { x: obstacle.vx - obstacle.angularVelocity * (state.y - other.y), y: obstacle.vy + obstacle.angularVelocity * (state.x - other.x) };
          contact(state, other, radius, surface);
        }
        else if (body.id < other.id) {
          const next = sim.bodies.get(other.id)!, r = other.shape === 'circle' ? other.radius : Math.hypot(other.width, other.height) / 2;
          const dx = next.x - state.x, dy = next.y - state.y, dist = Math.hypot(dx, dy), penetration = radius + r - dist;
          if (penetration <= 0) continue;
          const nx = dist ? dx / dist : 1, ny = dist ? dy / dist : 0, share = other.mass / (body.mass + other.mass);
          state.x -= nx * penetration * share; state.y -= ny * penetration * share; next.x += nx * penetration * (1 - share); next.y += ny * penetration * (1 - share);
          const speed = (next.vx - state.vx) * nx + (next.vy - state.vy) * ny;
          if (speed < 0) { const impulse = -(1 + Math.min(body.restitution, other.restitution)) * speed / (1 / body.mass + 1 / other.mass); state.vx -= impulse * nx / body.mass; state.vy -= impulse * ny / body.mass; next.vx += impulse * nx / other.mass; next.vy += impulse * ny / other.mass; }
          Object.assign(other, { x: next.x, y: next.y });
        }
      }
      Object.assign(body, { x: state.x, y: state.y });
    }
    colliders.forEach(body => { const state = sim.bodies.get(body.id)!; result.bodies[body.id] = { x: state.x, y: state.y, rotation: state.rotation }; });
    rig.applyPhysicsFrame(result);
    for (const item of settings.meshes.filter(item => item.enabled)) {
      const mesh = sim.meshes.get(item.layerId); if (!mesh) continue;
      const base = rig.getMeshVertices(item.layerId, false);
      if (base.length !== mesh.points.length) continue;
      mesh.points.forEach((point, i) => {
        point.x += (base[i].x - mesh.base[i].x) * (item.poseFollow ?? 0);
        point.y += (base[i].y - mesh.base[i].y) * (item.poseFollow ?? 0);
      });
      const before = mesh.points.map(point => ({ x: point.x, y: point.y }));
      const stiffness = item.stiffness / item.mass * (item.mode === 'cloth' ? .08 : 1);
      mesh.points.forEach((point, i) => {
        if (mesh.pinned.has(i)) { Object.assign(point, base[i], { vx: 0, vy: 0 }); return; }
        const denominator = 1 + item.damping * dt / item.mass + stiffness * dt * dt;
        point.vx = (point.vx + (settings.gravityX * item.gravityScale + windX * item.windScale / item.mass + stiffness * (base[i].x - point.x)) * dt) / denominator;
        point.vy = (point.vy + (settings.gravityY * item.gravityScale + windY * item.windScale / item.mass + stiffness * (base[i].y - point.y)) * dt) / denominator;
        point.x += point.vx * dt; point.y += point.vy * dt;
      });
      const strength = 1 - Math.exp(-item.stiffness * dt / item.mass);
      for (let iteration = 0; iteration < 5; iteration++) {
        for (const edge of mesh.edges) {
          const a = mesh.points[edge.a], b = mesh.points[edge.b], dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
          if (distance < 1e-9) continue;
          const wa = mesh.pinned.has(edge.a) ? 0 : 1, wb = mesh.pinned.has(edge.b) ? 0 : 1; if (!wa && !wb) continue;
          const restLength = item.adaptiveRest ? Math.hypot(base[edge.a].x - base[edge.b].x, base[edge.a].y - base[edge.b].y) : edge.length;
          const error = (distance - restLength) / distance * strength / (wa + wb);
          a.x += dx * error * wa; a.y += dy * error * wa; b.x -= dx * error * wb; b.y -= dy * error * wb;
        }
        mesh.points.forEach((point, i) => { if (!mesh.pinned.has(i)) colliders.forEach(body => { const projected = collidePhysicsPoint(point, body, 1); point.x = projected.x; point.y = projected.y; }); });
      }
      mesh.points.forEach((point, i) => { if (!mesh.pinned.has(i)) {
        point.vx = (point.x - before[i].x) / dt; point.vy = (point.y - before[i].y) / dt;
        colliders.forEach(body => contact(point, body, 1.01));
        // A collision correction must not silently override the authored travel
        // bound (e.g. a foot passing a transparent cloth-mesh corner).
        if ((item.maxDisplacement ?? 0) > 0) limitTravel(point, base[i], item.maxDisplacement!);
      } });
      mesh.base = base.map(point => ({ ...point }));
      result.meshes[item.layerId] = mesh.points.map(({ x, y }) => ({ x, y }));
    }
    for (const emitter of settings.emitters.filter(item => item.enabled)) {
      const fraction = (sim.fractions.get(emitter.id) ?? 0) + emitter.rate * dt, count = Math.floor(fraction);
      sim.fractions.set(emitter.id, fraction - count);
      const target = emitter.targetId ? rig.bones.get(emitter.targetId) ?? rig.layers.get(emitter.targetId) : undefined;
      const origin = target ? localToWorldPoint(target.world, emitter) : emitter;
      for (let i = 0; i < count && sim.particles.length < 5000; i++) {
        const direction = emitter.direction + (target?.world.rotation ?? 0) + (sim.random() - .5) * emitter.spread;
        sim.particles.push({ x: origin.x, y: origin.y, vx: Math.cos(direction) * emitter.speed, vy: Math.sin(direction) * emitter.speed, age: 0, lifetime: emitter.lifetime, size: emitter.size, color: emitter.color });
      }
    }
    sim.particles.forEach(particle => { particle.age += dt; particle.vx += (settings.gravityX + windX) * dt; particle.vy += (settings.gravityY + windY) * dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; colliders.forEach(body => contact(particle, body, particle.size)); });
    sim.particles = sim.particles.filter(particle => particle.age < particle.lifetime);
    result.particles = sim.particles.map(particle => ({ x: particle.x, y: particle.y, size: particle.size, color: particle.color, opacity: 1 - particle.age / particle.lifetime }));
  }
  sim.frames.push(result);
}

function interpolateFrames(frames: PhysicsFrame[], start: number, frame: number): PhysicsFrame {
  const offset = clamp(frame - start, 0, frames.length - 1), index = Math.floor(offset), t = offset - index, a = frames[index], b = frames[Math.min(index + 1, frames.length - 1)];
  if (!t) return a;
  const result = emptyFrame(frame), mix = (a: number, b: number) => a + (b - a) * t;
  Object.entries(a.bones).forEach(([id, rotation]) => result.bones[id] = rotation + angle((b.bones[id] ?? rotation) - rotation) * t);
  Object.entries(a.boneOffsets ?? {}).forEach(([id, point]) => {
    const next = b.boneOffsets?.[id] ?? point;
    result.boneOffsets![id] = { x: mix(point.x, next.x), y: mix(point.y, next.y) };
  });
  Object.entries(a.bodies).forEach(([id, body]) => { const next = b.bodies[id] ?? body; result.bodies[id] = { x: mix(body.x, next.x), y: mix(body.y, next.y), rotation: body.rotation + angle(next.rotation - body.rotation) * t }; });
  Object.entries(a.meshes).forEach(([id, points]) => result.meshes[id] = points.map((point, i) => ({ x: mix(point.x, b.meshes[id]?.[i]?.x ?? point.x), y: mix(point.y, b.meshes[id]?.[i]?.y ?? point.y) })));
  // Particle birth/death is intentionally discrete at the simulation frame rate.
  result.particles = a.particles;
  return result;
}

export function cachedPhysicsFrame(rig: Rig, frame = rig.timeline.currentFrame): PhysicsFrame | null {
  const cache = rig.dynamics.cache;
  if (!rig.dynamics.enabled || !cache?.frames.length || frame < cache.startFrame || cache.sourceAnimationId !== rig.timeline.activeAnimationId || cache.signature !== dynamicsSignature(rig)) return null;
  return interpolateFrames(cache.frames, cache.startFrame, Math.min(frame, cache.endFrame));
}

export function evaluateDynamics(rig: Rig): PhysicsFrame | null {
  if (rig.dynamicsSuppressed || rig.smartEditingActionId || !rig.dynamics.enabled || rig.timeline.currentFrame < rig.dynamics.startFrame || rig.animations.find(clip => clip.id === rig.timeline.activeAnimationId)?.dynamicsBake) return null;
  const cached = cachedPhysicsFrame(rig); if (cached) return cached;
  if (!rig.dynamics.bones.some(item => item.enabled) && !rig.dynamics.bodies.some(item => item.enabled) && !rig.dynamics.meshes.some(item => item.enabled) && !rig.dynamics.emitters.some(item => item.enabled)) return null;
  const signature = dynamicsSignature(rig);
  let sim = sessions.get(rig);
  if (!sim || sim.signature !== signature) { sim = createSimulation(rig, signature); sessions.set(rig, sim); }
  const frame = clamp(rig.timeline.currentFrame, sim.settings.startFrame, sim.settings.endFrame);
  while (sim.settings.startFrame + sim.frames.length - 1 < Math.ceil(frame)) advanceSimulation(sim);
  return interpolateFrames(sim.frames, sim.settings.startFrame, frame);
}

/** Persist a reusable deterministic cache without changing the authored pose. */
export function buildPhysicsCache(rig: Rig): PhysicsCache {
  if (rig.smartEditingActionId) throw new Error('Finish Smart Bone editing before caching dynamics');
  const settings = normalizeDynamics(rig.dynamics, new Set(rig.bones.keys()), new Set(rig.layers.keys()));
  rig.dynamics = settings;
  const signature = dynamicsSignature(rig), sim = createSimulation(rig, signature);
  while (settings.startFrame + sim.frames.length - 1 < settings.endFrame) advanceSimulation(sim);
  const cache: PhysicsCache = { startFrame: settings.startFrame, endFrame: settings.endFrame, fps: settings.fps, sourceAnimationId: rig.timeline.activeAnimationId, signature, frames: copy(sim.frames) };
  rig.dynamics.cache = cache; sessions.set(rig, sim); return cache;
}

/** Bake into a new editable clip, preserving the source clip and simulation settings. */
export function bakeDynamics(rig: Rig): string {
  const cache = buildPhysicsCache(rig), source = rig.animations.find(clip => clip.id === cache.sourceAnimationId), project = rig.toProject();
  const sample = new Rig({ ...project, dynamics: { ...rig.dynamics, enabled: false, cache: undefined } }); sample.dynamicsSuppressed = true;
  const targetIds = [...rig.bones.keys(), ...rig.layers.keys(), ...rig.groups.keys()];
  const meshIds = [...rig.layers.values()].filter(layer => layer.mesh).map(layer => layer.id);
  const clip: AnimationClip = source ? { ...copy(source), id: uid('animation'), name: `${source.name} · Dynamics bake` } : { id: uid('animation'), name: 'Dynamics bake', fps: cache.fps, startFrame: cache.startFrame, endFrame: cache.endFrame, tracks: [] };
  clip.startFrame = cache.startFrame; clip.endFrame = cache.endFrame;
  delete clip.loopMode; delete clip.loopStart; delete clip.loopEnd; delete clip.trimStart; delete clip.trimEnd; delete clip.playbackRate; delete clip.cycleOffset;
  // Capture final evaluated channels to preserve constraints, Smart Actions, and NLA.
  const allTargets = new Set(targetIds);
  delete clip.nlaLayers; delete clip.transitions;
  const transformIds = [...allTargets];
  const scalar = new Set(['transform', 'x', 'y', 'rotation', 'spin', 'scaleX', 'scaleY']);
  clip.tracks = clip.tracks.filter(track => !(allTargets.has(track.targetId) && scalar.has(track.property)) && !(meshIds.includes(track.targetId) && track.property === 'mesh'));
  if (source) clip.tracks = clip.tracks.map(track => ({ ...track, keyframes: cache.frames.flatMap(frame => { const value = sampleTrack(track, mapAnimationFrame(frame.frame, source)); return value === undefined ? [] : [{ id: uid('key'), frame: frame.frame, value: copy(value), easing: 'step' as const }]; }) }));
  const transformTracks = transformIds.map(targetId => ({ id: uid('track'), targetId, property: 'transform', keyframes: [] as AnimationClip['tracks'][number]['keyframes'] }));
  const meshTracks = meshIds.map(targetId => ({ id: uid('track'), targetId, property: 'mesh', keyframes: [] as AnimationClip['tracks'][number]['keyframes'] }));
  const particleLayerId = cache.frames.some(frame => frame.particles.length) ? uid('particles') : undefined;
  const particleTrack = { id: uid('track'), targetId: particleLayerId ?? '', property: 'shapes', keyframes: [] as AnimationClip['tracks'][number]['keyframes'] };
  for (const frame of cache.frames) {
    if (source) sample.applyAnimation(source.id, frame.frame); else { sample.setTimeline({ currentFrame: frame.frame }); sample.update(); }
    sample.applyPhysicsFrame(frame);
    for (const track of transformTracks) {
      const target = sample.bones.get(track.targetId) ?? sample.layers.get(track.targetId) ?? sample.groups.get(track.targetId); if (!target) continue;
      const local = sample.physicsWorldToLocal(target.id, target.world); if (!local) throw new Error(`Cannot bake singular transform on ${target.name}`);
      track.keyframes.push({ id: uid('key'), frame: frame.frame, value: { ...local }, easing: 'linear' });
    }
    for (const track of meshTracks) {
      const points = frame.meshes[track.targetId] ?? sample.getMeshVertices(track.targetId, false); if (!points.length) continue;
      const local = points.map((point, index) => sample.meshPointToLocal(track.targetId, index, point));
      if (local.some(point => !point)) throw new Error('Cannot bake a singular mesh skin transform');
      track.keyframes.push({ id: uid('key'), frame: frame.frame, value: local as Point2D[], easing: 'linear' });
    }
    if (particleLayerId) particleTrack.keyframes.push({ id: uid('key'), frame: frame.frame, easing: 'step', value: frame.particles.map((particle, index) => ({ id: `particle-${index}`, kind: 'ellipse', x: particle.x, y: particle.y, radiusX: particle.size, radiusY: particle.size, fill: particle.color, opacity: particle.opacity })) });
  }
  clip.tracks.push(...transformTracks, ...meshTracks);
  if (particleLayerId) {
    const layer = { id: particleLayerId, type: 'vector' as const, name: 'Baked particles', local: identity(), world: identity(), shapes: [] as VectorShape[], visible: true, locked: false, opacity: 1, boundBoneId: null, zIndex: Math.max(0, ...[...rig.layers.values(), ...rig.groups.values()].map(item => item.zIndex)) + 1 };
    rig.layers.set(layer.id, layer); rig.vectors.set(layer.id, layer); clip.tracks.push(particleTrack);
  }
  clip.dynamicsBake = { sourceAnimationId: cache.sourceAnimationId, startFrame: cache.startFrame, endFrame: cache.endFrame, fps: cache.fps, targetIds: transformIds, meshIds, particleLayerId };
  rig.animations.push(clip);
  rig.setTimeline({ activeAnimationId: clip.id, startFrame: clip.startFrame, endFrame: clip.endFrame, isPlaying: false });
  rig.applyAnimation(clip.id, rig.timeline.currentFrame);
  return clip.id;
}

/** Shared foreground particle pass used by the editor and video renderer. */
export function drawPhysicsParticles(ctx: CanvasRenderingContext2D, rig: Rig): void {
  for (const particle of rig.physicsFrame?.particles ?? []) {
    ctx.save(); ctx.globalAlpha *= particle.opacity; ctx.fillStyle = particle.color; ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}
