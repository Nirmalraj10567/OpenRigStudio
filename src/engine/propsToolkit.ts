import { Rig, createId } from './Rig';
import { identity } from './math';
import { addCharacterView, addCharacterViewSet, updateCharacterViewTarget, wrapViewAngle } from './characterViews';
import { createLayerGroup } from './layerGroups';
import { addBoneDynamics, addPhysicsBody, invalidateDynamics } from './dynamics';
import type { VectorShape, ViewArtwork } from './model';

export interface PropDesign {
  kind: 'house' | 'tree';
  style: 'cottage' | 'townhouse' | 'oak' | 'pine';
  name: string;
  primaryColor: string;
  secondaryColor: string;
  detailColor: string;
  size: number;
  angle: number;
  physics: 'none' | 'collider' | 'wind';
  windStrength: number;
  stiffness: number;
  damping: number;
}

export const DEFAULT_HOUSE_PROP: PropDesign = {
  kind: 'house', style: 'cottage', name: 'Willow cottage',
  primaryColor: '#d98f68', secondaryColor: '#6c4750', detailColor: '#f3d7a4',
  size: 1, angle: 0, physics: 'collider', windStrength: 0, stiffness: 34, damping: 8,
};

export const DEFAULT_TREE_PROP: PropDesign = {
  kind: 'tree', style: 'oak', name: 'Old oak tree',
  primaryColor: '#4f9a62', secondaryColor: '#81543d', detailColor: '#d9b86c',
  size: 1, angle: 0, physics: 'wind', windStrength: 80, stiffness: 38, damping: 7,
};

export const PROP_ANGLES: readonly { angle: number; name: string }[] = [
  { angle: -180, name: 'Back' },
  { angle: -135, name: 'Back side · left' },
  { angle: -90, name: 'Side · left' },
  { angle: -45, name: 'Front side · left' },
  { angle: 0, name: 'Front' },
  { angle: 45, name: 'Front side · right' },
  { angle: 90, name: 'Side · right' },
  { angle: 135, name: 'Back side · right' },
];

type PropPart = { name: string; space: 'root' | 'canopy'; shapes: VectorShape[]; visible?: boolean };
type Point = { x: number; y: number };

const HOUSE_STYLES = ['cottage', 'townhouse'] as const;
const TREE_STYLES = ['oak', 'pine'] as const;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hex = (value: unknown, fallback: string) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;

export function normalizePropDesign(input: unknown): PropDesign {
  const source = record(input) ? input : {};
  const kind = source.kind === 'tree' ? 'tree' : source.kind === 'house' ? 'house' : DEFAULT_HOUSE_PROP.kind;
  const defaults = kind === 'tree' ? DEFAULT_TREE_PROP : DEFAULT_HOUSE_PROP;
  const styles = kind === 'tree' ? TREE_STYLES : HOUSE_STYLES;
  const style = typeof source.style === 'string' && (styles as readonly string[]).includes(source.style)
    ? source.style as PropDesign['style'] : defaults.style;
  const name = typeof source.name === 'string' && source.name.trim()
    ? source.name.trim().slice(0, 80) : defaults.name;
  const physicsValue = source.physics === 'none' || source.physics === 'collider' || source.physics === 'wind'
    ? source.physics : defaults.physics;
  // Wind is a canopy effect. A house's invalid wind request becomes the useful
  // native collision proxy rather than silently pretending the roof is dynamic.
  const physics = kind === 'house' && physicsValue === 'wind' ? 'collider' : physicsValue;
  return {
    kind,
    style,
    name,
    primaryColor: hex(source.primaryColor, defaults.primaryColor),
    secondaryColor: hex(source.secondaryColor, defaults.secondaryColor),
    detailColor: hex(source.detailColor, defaults.detailColor),
    size: clamp(finite(source.size, defaults.size), .6, 1.4),
    angle: wrapViewAngle(finite(source.angle, defaults.angle)),
    physics,
    windStrength: clamp(finite(source.windStrength, defaults.windStrength), 0, 200),
    stiffness: clamp(finite(source.stiffness, defaults.stiffness), 5, 120),
    damping: clamp(finite(source.damping, defaults.damping), 1, 20),
  };
}

const shape = (kind: VectorShape['kind'], values: Omit<VectorShape, 'id' | 'kind'>): VectorShape => ({
  id: createId('prop-shape'), kind, ...values,
});
const path = (d: string, fill: string, stroke = 'none', strokeWidth = 1.5): VectorShape =>
  shape('path', { d, fill, stroke, strokeWidth, lineCap: 'round', lineJoin: 'round' });
const polygon = (points: Point[], fill: string, stroke = 'none', strokeWidth = 1.5): VectorShape =>
  shape('polygon', { points, fill, stroke, strokeWidth, lineJoin: 'round' });
const rect = (x: number, y: number, width: number, height: number, fill: string, stroke = 'none', strokeWidth = 1.5): VectorShape =>
  shape('rect', { x, y, width, height, fill, stroke, strokeWidth });
const ellipse = (x: number, y: number, radiusX: number, radiusY: number, fill: string, opacity?: number): VectorShape =>
  shape('ellipse', { x, y, radiusX, radiusY, fill, ...(opacity === undefined ? {} : { opacity }) });
const line = (x: number, y: number, x2: number, y2: number, stroke: string, strokeWidth = 2): VectorShape =>
  path(`M${x} ${y}L${x2} ${y2}`, 'none', stroke, strokeWidth);

const rekeyShapes = (shapes: VectorShape[]): VectorShape[] => shapes.map(item => ({
  ...item,
  id: createId('prop-shape'),
  ...(item.points ? { points: item.points.map(point => ({ ...point })) } : {}),
}));

function houseParts(design: PropDesign, angle: number): PropPart[] {
  const scale = design.size;
  const yaw = angle * Math.PI / 180;
  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
  const width = 226 * scale, half = width / 2, depth = 86 * scale;
  const wallHeight = 148 * scale, roofHeight = (design.style === 'townhouse' ? 58 : 70) * scale;
  const pitch = .22;
  const wall = design.primaryColor, roof = design.secondaryColor, trim = design.detailColor;
  const glass = design.style === 'townhouse' ? '#b9d8d3' : '#b5d9d3';
  const frontVisible = Math.abs(angle) < 90;
  const rearVisible = Math.abs(angle) > 90;
  const sideVisible = Math.abs(angle) > 0 && Math.abs(angle) < 180;
  const side = sinYaw < 0 ? -1 : 1;
  type Corner = { x: number; z: number; v: number };
  const project = ({ x, z, v }: Corner): Point => ({ x: x * cosYaw + z * sinYaw * .72, y: -v - z * cosYaw * pitch });
  const face = (corners: Corner[], fill: string, stroke = '#593f42', strokeWidth = 2) => polygon(corners.map(project), fill, stroke, strokeWidth);
  const edge = (a: Corner, b: Corner, color: string, strokeWidth = 2) => {
    const start = project(a), end = project(b);
    return line(start.x, start.y, end.x, end.y, color, strokeWidth);
  };
  const frontWall = [
    { x: -half, z: 0, v: 0 }, { x: half, z: 0, v: 0 },
    { x: half, z: 0, v: wallHeight }, { x: -half, z: 0, v: wallHeight },
  ];
  const rearWall = [
    { x: half, z: depth, v: 0 }, { x: -half, z: depth, v: 0 },
    { x: -half, z: depth, v: wallHeight }, { x: half, z: depth, v: wallHeight },
  ];
  const sideWall = [
    { x: side * half, z: side === 1 ? 0 : depth, v: 0 }, { x: side * half, z: side === 1 ? depth : 0, v: 0 },
    { x: side * half, z: side === 1 ? depth : 0, v: wallHeight }, { x: side * half, z: side === 1 ? 0 : depth, v: wallHeight },
  ];
  const foundation: VectorShape[] = [
    ellipse(0, 7 * scale, half * 1.06, 12 * scale, '#00000022'),
    face([
      { x: -half - 5 * scale, z: 0, v: 0 }, { x: half + 5 * scale, z: 0, v: 0 },
      { x: half + 5 * scale, z: 0, v: 12 * scale }, { x: -half - 5 * scale, z: 0, v: 12 * scale },
    ], trim, '#6b5350', 2),
    ...(sideVisible ? [face([
      { x: side * half, z: side === 1 ? 0 : depth, v: 0 }, { x: side * half, z: side === 1 ? depth : 0, v: 0 },
      { x: side * half, z: side === 1 ? depth : 0, v: 12 * scale }, { x: side * half, z: side === 1 ? 0 : depth, v: 12 * scale },
    ], '#b38468', '#6b5350', 2)] : []),
    edge({ x: -half, z: 0, v: 7 * scale }, { x: half, z: 0, v: 7 * scale }, '#ffffff66', 2),
  ];
  const walls: VectorShape[] = [];
  if (frontVisible) walls.push(face(frontWall, wall));
  if (rearVisible) walls.push(face(rearWall, design.style === 'townhouse' ? '#bd775c' : '#c78468'));
  if (sideVisible) walls.push(face(sideWall, '#bb8067'));
  const ridge = wallHeight + roofHeight;
  const roofShapes: VectorShape[] = [];
  const frontGable = [{ x: -half - 10 * scale, z: 0, v: wallHeight }, { x: 0, z: 0, v: ridge }, { x: half + 10 * scale, z: 0, v: wallHeight }];
  const rearGable = [{ x: half + 10 * scale, z: depth, v: wallHeight }, { x: 0, z: depth, v: ridge }, { x: -half - 10 * scale, z: depth, v: wallHeight }];
  if (frontVisible) roofShapes.push(face(frontGable, roof, '#4d3940', 3));
  if (rearVisible) roofShapes.push(face(rearGable, '#513b46', '#392e38', 3));
  if (sideVisible) {
    const slopeX = side * (half + 10 * scale);
    const nearZ = side === 1 ? 0 : depth, farZ = side === 1 ? depth : 0;
    roofShapes.push(face([
      { x: 0, z: nearZ, v: ridge }, { x: slopeX, z: nearZ, v: wallHeight },
      { x: slopeX, z: farZ, v: wallHeight }, { x: 0, z: farZ, v: ridge },
    ], '#513b46', '#392e38', 2));
  }
  const chimneyX = -half * .5, chimneyZ = depth * .28, chimneyW = 19 * scale, chimneyD = 18 * scale;
  const chimneyBottom = wallHeight + roofHeight * .28, chimneyTop = wallHeight + roofHeight + 32 * scale;
  const chimney: Corner[] = [
    { x: chimneyX - chimneyW / 2, z: chimneyZ, v: chimneyBottom }, { x: chimneyX + chimneyW / 2, z: chimneyZ, v: chimneyBottom },
    { x: chimneyX + chimneyW / 2, z: chimneyZ, v: chimneyTop }, { x: chimneyX - chimneyW / 2, z: chimneyZ, v: chimneyTop },
  ];
  const chimneyRear: Corner[] = chimney.map(({ x, v }) => ({ x, z: chimneyZ + chimneyD, v }));
  const chimneySideX = chimneyX + side * chimneyW / 2;
  const chimneySide: Corner[] = [
    { x: chimneySideX, z: chimneyZ, v: chimneyBottom }, { x: chimneySideX, z: chimneyZ + chimneyD, v: chimneyBottom },
    { x: chimneySideX, z: chimneyZ + chimneyD, v: chimneyTop }, { x: chimneySideX, z: chimneyZ, v: chimneyTop },
  ];
  if (frontVisible) roofShapes.push(face(chimney, '#855b54', '#4d3940', 2));
  if (rearVisible) roofShapes.push(face(chimneyRear, '#68464b', '#4d3940', 2));
  if (sideVisible) roofShapes.push(face(chimneySide, '#68464b', '#4d3940', 2));
  roofShapes.push(face([
    { x: chimneyX - chimneyW / 2 - 3 * scale, z: chimneyZ - 2 * scale, v: chimneyTop },
    { x: chimneyX + chimneyW / 2 + 3 * scale, z: chimneyZ - 2 * scale, v: chimneyTop },
    { x: chimneyX + chimneyW / 2 + 3 * scale, z: chimneyZ + chimneyD + 2 * scale, v: chimneyTop },
    { x: chimneyX - chimneyW / 2 - 3 * scale, z: chimneyZ + chimneyD + 2 * scale, v: chimneyTop },
  ], '#e5b08a', '#4d3940', 2));
  if (design.style === 'townhouse' && frontVisible) {
    roofShapes.push(face([{ x: -25 * scale, z: 0, v: wallHeight + 8 * scale }, { x: 0, z: 0, v: wallHeight + 30 * scale }, { x: 25 * scale, z: 0, v: wallHeight + 8 * scale }], trim, '#4d3940', 2));
    roofShapes.push(face([{ x: -13 * scale, z: 0, v: wallHeight + 8 * scale }, { x: 13 * scale, z: 0, v: wallHeight + 8 * scale }, { x: 13 * scale, z: 0, v: wallHeight + 23 * scale }, { x: -13 * scale, z: 0, v: wallHeight + 23 * scale }], glass, '#4d3940', 2));
  }
  const frontDoor: VectorShape[] = [];
  const frontWindows: VectorShape[] = [];
  const sideWindows: VectorShape[] = [];
  const rearWindows: VectorShape[] = [];
  const frontPanel = (x: number, halfWidth: number, bottom: number, top: number, fill: string, stroke = trim) => face([
    { x: x - halfWidth, z: 0, v: bottom }, { x: x + halfWidth, z: 0, v: bottom },
    { x: x + halfWidth, z: 0, v: top }, { x: x - halfWidth, z: 0, v: top },
  ], fill, stroke, 2);
  const sidePanel = (z: number, halfDepth: number, bottom: number, top: number, fill: string) => face([
    { x: side * half, z: z - halfDepth, v: bottom }, { x: side * half, z: z + halfDepth, v: bottom },
    { x: side * half, z: z + halfDepth, v: top }, { x: side * half, z: z - halfDepth, v: top },
  ], fill, trim, 2);
  const rearPanel = (x: number, halfWidth: number, bottom: number, top: number, fill: string) => face([
    { x: x + halfWidth, z: depth, v: bottom }, { x: x - halfWidth, z: depth, v: bottom },
    { x: x - halfWidth, z: depth, v: top }, { x: x + halfWidth, z: depth, v: top },
  ], fill, trim, 2);
  if (frontVisible) {
    frontDoor.push(frontPanel(0, 27 * scale, 0, 78 * scale, '#754b43', '#4d3940'));
    frontDoor.push(edge({ x: 0, z: 0, v: 42 * scale }, { x: 0, z: 0, v: 74 * scale }, trim, 1.5));
    const knob = project({ x: 16 * scale, z: 0, v: 39 * scale });
    frontDoor.push(ellipse(knob.x, knob.y, 3 * scale, 3 * scale, '#e5b76e'));
    const windowY = design.style === 'townhouse' ? 104 * scale : 91 * scale;
    for (const x of [-half * .55, half * .55]) {
      frontWindows.push(frontPanel(x, 18 * scale, windowY, windowY + 31 * scale, glass));
      frontWindows.push(frontPanel(x - 22 * scale, 3 * scale, windowY - 2 * scale, windowY + 33 * scale, trim));
      frontWindows.push(frontPanel(x + 22 * scale, 3 * scale, windowY - 2 * scale, windowY + 33 * scale, trim));
      frontWindows.push(edge({ x, z: 0, v: windowY }, { x, z: 0, v: windowY + 31 * scale }, trim, 1.5));
    }
    if (design.style === 'townhouse') {
      frontWindows.push(frontPanel(0, 19 * scale, 104 * scale, 136 * scale, glass));
      frontWindows.push(edge({ x: 0, z: 0, v: 104 * scale }, { x: 0, z: 0, v: 136 * scale }, trim, 1.5));
    }
  }
  if (sideVisible) {
    for (const z of [depth * .3, depth * .68]) {
      sideWindows.push(sidePanel(z, 12 * scale, 64 * scale, 96 * scale, glass));
      sideWindows.push(sidePanel(z - side * 15 * scale, 3 * scale, 61 * scale, 99 * scale, trim));
      sideWindows.push(sidePanel(z + side * 15 * scale, 3 * scale, 61 * scale, 99 * scale, trim));
    }
  }
  if (rearVisible) {
    for (const x of [-half * .48, half * .48]) rearWindows.push(rearPanel(x, 18 * scale, 73 * scale, 105 * scale, glass));
    rearWindows.push(rearPanel(0, 28 * scale, 0, 58 * scale, '#6c4744'));
    rearWindows.push(edge({ x: 0, z: depth, v: 29 * scale }, { x: 0, z: depth, v: 55 * scale }, trim, 1.5));
  }
  const details: VectorShape[] = [];
  if (frontVisible) {
    details.push(edge({ x: -half, z: 0, v: wallHeight }, { x: half, z: 0, v: wallHeight }, trim, 4));
    details.push(edge({ x: -half, z: 0, v: 3 * scale }, { x: half, z: 0, v: 3 * scale }, trim, 3));
  }
  if (sideVisible) details.push(edge({ x: side * half, z: side === 1 ? 0 : depth, v: wallHeight }, { x: side * half, z: side === 1 ? depth : 0, v: wallHeight }, trim, 3));
  if (rearVisible) details.push(edge({ x: -half, z: depth, v: wallHeight }, { x: half, z: depth, v: wallHeight }, trim, 3));
  if (design.style === 'cottage') {
    if (frontVisible) {
      details.push(frontPanel(-half * .72, 14 * scale, 2 * scale, 9 * scale, '#bd765f', 'none'));
      details.push(frontPanel(half * .72, 14 * scale, 2 * scale, 9 * scale, '#bd765f', 'none'));
    }
    if (sideVisible) details.push(sidePanel(depth * .48, depth * .06, 2 * scale, 9 * scale, '#bd765f'));
  } else {
    if (frontVisible) details.push(edge({ x: -half, z: 0, v: wallHeight * .5 }, { x: half, z: 0, v: wallHeight * .5 }, trim, 2));
    if (rearVisible) details.push(edge({ x: -half, z: depth, v: wallHeight * .5 }, { x: half, z: depth, v: wallHeight * .5 }, trim, 2));
  }
  return [
    { name: 'Foundation · shadow and base', space: 'root', shapes: foundation },
    { name: 'Walls · projected front side rear faces', space: 'root', shapes: walls },
    { name: 'Roof · pitched slopes and chimney', space: 'root', shapes: roofShapes },
    { name: 'Openings · Door · front', space: 'root', shapes: frontDoor, visible: frontVisible },
    { name: 'Openings · front windows and shutters', space: 'root', shapes: frontWindows, visible: frontVisible },
    { name: 'Openings · side windows and shutters', space: 'root', shapes: sideWindows, visible: sideVisible },
    { name: 'Openings · rear windows and door', space: 'root', shapes: rearWindows, visible: rearVisible },
    { name: 'Details · trim and accents', space: 'root', shapes: details },
  ];
}

function treeParts(design: PropDesign, angle: number): PropPart[] {
  const scale = design.size;
  const radians = angle * Math.PI / 180;
  const front = Math.cos(radians);
  const lateral = Math.sin(radians);
  const side = lateral < 0 ? -1 : 1;
  const height = 164 * scale;
  const trunkWidth = (design.style === 'pine' ? 20 : 27) * scale;
  const depth = .62 + Math.abs(front) * .38;
  const spread = (design.style === 'pine' ? 92 : 118) * scale * depth;
  const leaf = design.primaryColor;
  const trunk = design.secondaryColor;
  const detail = design.detailColor;
  const shadow: VectorShape[] = [ellipse(side * 5 * scale, 7 * scale, 76 * scale * (.85 + Math.abs(front) * .15), 12 * scale, '#00000022')];
  const trunkShapes: VectorShape[] = [
    path(`M${-trunkWidth / 2} 0Q${-trunkWidth * .72} ${-height * .36} ${-trunkWidth * .28} ${-height}L${trunkWidth * .34} ${-height}Q${trunkWidth * .72} ${-height * .34} ${trunkWidth / 2} 0Z`, trunk, '#513c35', 2),
    path(`M0 -8Q${side * trunkWidth * .7} ${-height * .34} ${side * (10 + Math.abs(lateral) * 12) * scale} ${-height * .78}`, 'none', detail, 3),
    line(-trunkWidth * .2, -height * .28, side * (trunkWidth * 1.4), -height * .45, detail, 2),
  ];
  if (front < -.2) trunkShapes.push(path(`M${-trunkWidth * .25} -${height * .25}Q${side * 34 * scale} -${height * .42} ${side * 24 * scale} -${height * .7}`, 'none', '#5d4035', 4));
  const branches: VectorShape[] = [
    line(0, 24 * scale, -spread * (.55 + Math.abs(lateral) * .12), -22 * scale, trunk, 8 * scale),
    line(0, 30 * scale, spread * (.52 + (side > 0 ? .1 : 0)), -34 * scale, trunk, 8 * scale),
    line(side * 3 * scale, 8 * scale, side * spread * .75, 18 * scale, trunk, 6 * scale),
  ];
  const canopy: VectorShape[] = [];
  if (design.style === 'oak') {
    const skew = lateral * 18 * scale;
    canopy.push(path(
      `M${-spread + skew} 30Q${-spread * 1.1} -12 ${-spread * .68 + skew} -42Q${-spread * .66} -${92 * scale} ${-spread * .18 + skew} -${80 * scale}Q${spread * .18} -${118 * scale} ${spread * .5 + skew} -${72 * scale}Q${spread * 1.06} -${76 * scale} ${spread * .92 + skew} -18Q${spread * 1.08} 18 ${spread * .46 + skew} 40Q0 66 ${-spread + skew} 30Z`, leaf, '#3a6744', 3),
      ellipse(-spread * .48 + skew, -48 * scale, spread * .38, 39 * scale, leaf),
      ellipse(spread * .34 + skew, -58 * scale, spread * .42, 48 * scale, leaf),
    );
    if (front < 0) canopy.push(ellipse(-side * spread * .15, -26 * scale, spread * .28, 22 * scale, '#3d8050'));
  } else {
    const tier = (y: number, half: number, offset: number) => polygon([
      { x: offset - half, y }, { x: offset, y: y - 54 * scale }, { x: offset + half, y },
      { x: offset + half * .72, y: y + 5 * scale }, { x: offset - half * .72, y: y + 5 * scale },
    ], leaf, '#3a6744', 2);
    canopy.push(tier(40 * scale, spread * .82, lateral * 10 * scale));
    canopy.push(tier(5 * scale, spread * .68, -lateral * 8 * scale));
    canopy.push(tier(-31 * scale, spread * .55, lateral * 5 * scale));
    canopy.push(tier(-65 * scale, spread * .4, -lateral * 4 * scale));
  }
  const highlights: VectorShape[] = [
    ellipse(-spread * (.42 - lateral * .08), -62 * scale, 13 * scale * depth, 9 * scale, detail),
    ellipse(spread * (.35 + lateral * .08), -33 * scale, 9 * scale * depth, 7 * scale, detail),
    line(-spread * .66, 17 * scale, spread * .58, 17 * scale, '#ffffff33', 2),
  ];
  if (design.style === 'pine') highlights.push(line(-spread * .5, -30 * scale, spread * .28, -30 * scale, detail, 2));
  return [
    { name: 'Ground · rooted shadow', space: 'root', shapes: shadow },
    { name: 'Trunk · rooted body', space: 'root', shapes: trunkShapes },
    { name: 'Branches · side and rear structure', space: 'canopy', shapes: branches },
    { name: `${design.style === 'oak' ? 'Oak' : 'Pine'} canopy · silhouette`, space: 'canopy', shapes: canopy },
    { name: 'Canopy · highlights and needles', space: 'canopy', shapes: highlights },
  ];
}

function partsFor(design: PropDesign, angle: number): PropPart[] {
  return design.kind === 'house' ? houseParts(design, angle) : treeParts(design, angle);
}

function hasAuthoredDynamics(rig: Rig): boolean {
  const dynamics = rig.dynamics;
  return dynamics.enabled || dynamics.bones.length > 0 || dynamics.bodies.length > 0 || dynamics.meshes.length > 0 || dynamics.emitters.length > 0
    || dynamics.gravityX !== 0 || dynamics.gravityY !== 420 || dynamics.windX !== 0 || dynamics.windY !== 0 || dynamics.windNoise !== 0
    || dynamics.seed !== 1 || dynamics.fps !== 24 || dynamics.substeps !== 4 || dynamics.startFrame !== 0 || dynamics.endFrame !== 120;
}

function preflight(rig: Rig, design: PropDesign, position: Point): void {
  if (!(rig instanceof Rig)) throw new Error('Cannot add prop: expected a native Rig');
  if (rig.smartEditingActionId) throw new Error('Cannot add prop during Smart Bone editing');
  if (rig.groups.size >= 256) throw new Error('Cannot add prop: the project group limit is full');
  if (rig.characterViews.length >= 32) throw new Error('Cannot add prop: the project view-set limit is full');
  if (![position.x, position.y].every(Number.isFinite)) throw new Error('Cannot add prop: position must be finite');
  const needsPhysics = design.physics !== 'none';
  const activeAnimation = rig.animations.find(animation => animation.id === rig.timeline.activeAnimationId);
  if (needsPhysics && activeAnimation?.dynamicsBake) throw new Error('Cannot add prop while the active animation is a baked dynamics animation');
  if (needsPhysics && rig.dynamics.bodies.length >= 256 && design.physics === 'collider') throw new Error('Cannot add prop: the physics body limit is full');
  if (needsPhysics && design.physics === 'wind' && rig.dynamics.bones.length >= 256) throw new Error('Cannot add prop: the bone dynamics limit is full');
  if (needsPhysics && hasAuthoredDynamics(rig) && !rig.dynamics.enabled) {
    throw new Error('Cannot add prop: existing dynamics are disabled; enable that authored physics scene first');
  }
}

function attachLayer(rig: Rig, layerId: string, boneId: string, uprightTreeArt = false): void {
  // The artwork is authored in bone-local coordinates. The native bind call
  // still creates the editable rigid binding, then the new prop's offset is
  // made explicit so its local origin follows the bone without double offsets.
  if (!rig.bind(layerId, boneId)) throw new Error('Cannot add prop: failed to create a rigid binding');
  const binding = rig.bindings.get(layerId);
  if (!binding) throw new Error('Cannot add prop: rigid binding was not retained');
  binding.bindOffset = { ...identity() };
  rig.layers.get(layerId)!.local = { ...identity(), rotation: uprightTreeArt ? Math.PI / 2 : 0 };
  rig.update();
}

export function addDesignedProp(
  rig: Rig,
  input: PropDesign,
  position: Point = { x: 400, y: 430 },
): { groupId: string; rootId: string; viewSetId: string; layerIds: string[]; boneIds: string[]; physicsIds: string[]; warnings: string[] } {
  const design = normalizePropDesign(input);
  const point = { x: position?.x, y: position?.y };
  preflight(rig, design, point);
  const existingDynamics = hasAuthoredDynamics(rig);
  const warnings: string[] = [];
  const frontParts = partsFor(design, 0);
  const groupId = createLayerGroup(rig, design.name, 'group', null);
  if (!groupId) throw new Error('Cannot add prop: unable to create its layer group');
  const group = rig.groups.get(groupId)!;
  group.local = { ...identity() };
  group.zIndex = Math.max(0, ...[...rig.layers.values(), ...rig.groups.values()].map(item => item.zIndex)) + 1;

  const rootLength = design.kind === 'tree' ? 164 * design.size : 1;
  const rootId = rig.addBone(null, `${design.name} · root`, rootLength);
  const root = rig.bones.get(rootId)!;
  root.local = { ...identity(), x: point.x, y: point.y, rotation: design.kind === 'tree' ? -Math.PI / 2 : 0 };
  rig.update();
  const boneIds = [rootId];
  let canopyId: string | undefined;
  if (design.kind === 'tree') {
    canopyId = rig.addBone(rootId, `${design.name} · canopy spring`, 82 * design.size);
    boneIds.push(canopyId);
    rig.bones.get(canopyId)!.local = { ...identity(), x: rootLength, y: 0, rotation: 0 };
    rig.update();
  }

  const layerIds: string[] = [];
  const zStart = group.zIndex + 1;
  frontParts.forEach((part, index) => {
    const layerId = rig.addVectorLayer(`${design.name} · ${part.name}`, part.shapes);
    const layer = rig.layers.get(layerId)!;
    layer.local = { ...identity() };
    layer.parentGroupId = groupId;
    layer.zIndex = zStart + index;
    group.childIds.push(layerId);
    attachLayer(rig, layerId, part.space === 'canopy' ? canopyId! : rootId, design.kind === 'tree');
    layerIds.push(layerId);
  });
  rig.update();

  const viewSetId = addCharacterViewSet(rig, `${design.name} · prepared views`, layerIds);
  if (!viewSetId) throw new Error('Cannot add prop: unable to create its view set');
  const set = rig.characterViews.find(item => item.id === viewSetId)!;
  // addCharacterViewSet captures the editable baseline. Give that capture and
  // every actual view their own shape IDs, so exported artwork never aliases a
  // different authored angle by accident.
  layerIds.forEach(layerId => {
    const baseline = set.baseline[layerId];
    if (baseline?.artwork?.type === 'vector') baseline.artwork = { type: 'vector', shapes: rekeyShapes(baseline.artwork.shapes) };
  });
  const frontView = set.views.find(view => view.angle === 0)!;
  updateCharacterViewTargets(rig, viewSetId, frontView.id, frontParts);
  for (const viewSpec of PROP_ANGLES) {
    const viewId = viewSpec.angle === 0
      ? frontView.id
      : addCharacterView(rig, viewSetId, viewSpec.angle, viewSpec.name, frontView.id);
    if (!viewId) throw new Error(`Cannot add prop: unable to create ${viewSpec.name} view`);
    if (viewSpec.angle !== 0) updateCharacterViewTargets(rig, viewSetId, viewId, partsFor(design, viewSpec.angle));
  }
  set.angle = design.angle;
  set.enabled = true;
  set.wrap = true;
  set.interpolate = true;
  rig.characterAngleOverrides.set(viewSetId, { frame: rig.timeline.currentFrame, angle: design.angle });

  const physicsIds: string[] = [];
  if (design.physics === 'collider') {
    if (!existingDynamics) {
      rig.dynamics.startFrame = rig.timeline.startFrame;
      rig.dynamics.endFrame = rig.timeline.endFrame;
      rig.dynamics.fps = rig.timeline.fps;
    }
    const bodyId = addPhysicsBody(rig, rootId);
    const body = rig.dynamics.bodies.find(item => item.id === bodyId);
    if (!body) throw new Error('Cannot add prop: native collider was not retained');
    const height = design.kind === 'house' ? 148 * design.size : rootLength;
    const width = design.kind === 'house' ? 226 * design.size : (design.style === 'pine' ? 20 : 27) * design.size;
    Object.assign(body, {
      name: `${design.name} · collider`, shape: 'box', motion: 'kinematic',
      x: design.kind === 'house' ? 0 : rootLength / 2,
      y: design.kind === 'house' ? -height / 2 : 0,
      width: design.kind === 'house' ? width : height,
      height: design.kind === 'house' ? height : width,
      radius: Math.max(width, height) / 2, rotation: 0, restitution: 0, friction: .7, enabled: true,
    });
    physicsIds.push(bodyId);
    if (existingDynamics) warnings.push('Existing dynamics forces/settings were reused; the native prop collider was appended.');
    else warnings.push('Native physics was enabled for the prop collider; the fresh scene defaults were retained.');
    invalidateDynamics(rig);
  } else if (design.physics === 'wind') {
    if (!existingDynamics) {
      rig.dynamics.startFrame = rig.timeline.startFrame;
      rig.dynamics.endFrame = rig.timeline.endFrame;
      rig.dynamics.fps = rig.timeline.fps;
      // Keep one stable scene force. The per-prop windScale below is the
      // design control, so zero demand really means no sway.
      rig.dynamics.windX = 80;
      rig.dynamics.windY = 0;
      rig.dynamics.windNoise = 9.6;
      warnings.push('Initialized a fresh deterministic native wind scene for the canopy.');
    } else {
      warnings.push('Existing dynamics forces/settings were reused; the native canopy spring was appended.');
    }
    const dynamicId = addBoneDynamics(rig, canopyId!, 'hair');
    if (!dynamicId) throw new Error('Cannot add prop: native canopy dynamics were not retained');
    const dynamic = rig.dynamics.bones.find(item => item.id === dynamicId)!;
    Object.assign(dynamic, {
      stiffness: design.stiffness, damping: design.damping, mass: 1,
      gravityScale: 0, windScale: design.windStrength / 80, influence: 1, overlap: .2, enabled: true,
    });
    physicsIds.push(dynamicId);
    invalidateDynamics(rig);
  }
  recordPropDesign(rig, groupId, design);
  rig.update();
  return { groupId, rootId, viewSetId, layerIds, boneIds, physicsIds, warnings };
}

function updateCharacterViewTargets(rig: Rig, setId: string, viewId: string, parts: PropPart[]): void {
  const set = rig.characterViews.find(item => item.id === setId);
  if (!set) throw new Error('Cannot add prop: missing view set');
  set.targetIds.forEach((layerId, index) => {
    const artwork: ViewArtwork = { type: 'vector', shapes: rekeyShapes(parts[index]?.shapes ?? []) };
    if (!updateCharacterViewTarget(rig, setId, viewId, layerId, { artwork, visible: parts[index]?.visible !== false })) {
      throw new Error('Cannot add prop: failed to author a prepared view target');
    }
  });
}

function recordPropDesign(rig: Rig, groupId: string, design: PropDesign): void {
  const designs: Record<string, PropDesign> = {};
  try {
    const parsed: unknown = JSON.parse(rig.metadata.propDesigns ?? '{}');
    if (record(parsed)) Object.entries(parsed).forEach(([id, value]) => {
      const normalized = normalizePropDesign(value);
      if (id && value && typeof value === 'object') designs[id] = normalized;
    });
  } catch {
    // A malformed optional metadata entry should not prevent a valid append.
  }
  designs[groupId] = design;
  rig.metadata.propDesigns = JSON.stringify(designs);
  rig.metadata[`propDesign.${groupId}`] = JSON.stringify(design);
}

export function createPropRig(input: PropDesign): Rig {
  const design = normalizePropDesign(input);
  const rig = new Rig();
  rig.name = design.name;
  rig.canvas = { width: 800, height: 520, background: design.kind === 'house' ? '#dce8e5' : '#dfe9dc' };
  rig.setTimeline({ currentFrame: 0, currentTime: 0, isPlaying: false, startFrame: 0, endFrame: 120, fps: 24, activeAnimationId: null });
  addDesignedProp(rig, design);
  rig.metadata = {
    ...rig.metadata,
    exportType: 'prop-studio-project',
    propDesign: JSON.stringify(design),
  };
  rig.update();
  return rig;
}
