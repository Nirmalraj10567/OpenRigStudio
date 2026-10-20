import { createId, Rig } from './Rig';
import { identity, localToWorldPoint, worldToLocalPoint } from './math';
import type { Point2D, Transform2D } from './math';
import type { MeshData, VectorShape } from './model';
import { makeMesh, meshBounds } from './mesh';
import { addCharacterViewParts } from './characterViews';
import { GIRL_COLORS as c, p } from './referenceGirlArtwork';
import type { FingerName, HandRig } from './handRig';

type Side = 'Left' | 'Right';
type Digit = { name: FingerName; points: Point2D[]; radii: number[]; spread: number };
const digit = (name: FingerName, points: number[][], radii: number[], spread: number): Digit => ({ name, points: points.map(([x, y]) => ({ x, y })), radii, spread });
const digits: Record<Side, Digit[]> = {
  Left: [
    digit('Little', [[87.4, 306.8], [87.6, 311.9], [89.2, 315.2], [91, 317]], [1.05, 1, .85, .65], .28),
    digit('Ring', [[90.1, 308.3], [90.6, 314.5], [93.1, 319], [94.2, 321]], [1.18, 1.1, .95, .7], .13),
    digit('Middle', [[93.2, 308.8], [94.2, 316], [96.9, 321], [98, 324]], [1.25, 1.2, 1.02, .75], 0),
    digit('Index', [[96.5, 307.8], [99.2, 314.3], [101.7, 319], [101.3, 322.2]], [1.25, 1.15, .98, .72], -.16),
    digit('Thumb', [[97.5, 302.4], [101.9, 307.6], [104.2, 314.8]], [1.65, 1.4, .95], -.7),
  ],
  Right: [
    digit('Little', [[211.3, 138.2], [209, 135.9], [205.6, 135.6], [203, 138]], [1.05, .95, .8, .6], .7),
    digit('Ring', [[210.5, 135.3], [207.1, 132.6], [202.5, 132], [198.5, 134.2]], [1.2, 1.08, .9, .7], .38),
    digit('Middle', [[209.8, 132.6], [205.9, 127.7], [200.1, 128.2], [195.6, 130]], [1.3, 1.2, 1.05, .75], .04),
    digit('Index', [[208.8, 130.4], [205.5, 123.5], [200.1, 121.8], [195.2, 123.3]], [1.35, 1.2, 1.05, .75], -.34),
    digit('Thumb', [[208, 138.8], [205, 134.8], [199.2, 138.4]], [1.55, 1.38, .95], -1.1),
  ],
};
const angle = (a: Point2D, b: Point2D) => Math.atan2(b.y - a.y, b.x - a.x);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const text = (point: Point2D) => `${Number(point.x.toFixed(4))} ${Number(point.y.toFixed(4))}`;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function contour(points: Point2D[], move = true): string {
  let path = move ? `M ${text(points[0])}` : '';
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 2)];
    path += ` C ${text({ x: a.x + (b.x - before.x) / 6, y: a.y + (b.y - before.y) / 6 })} ${text({ x: b.x - (after.x - a.x) / 6, y: b.y - (after.y - a.y) / 6 })} ${text(b)}`;
  }
  return path;
}

interface Ring { center: Point2D; normal: Point2D; tangent: Point2D; radius: number; at: number }
function ribbon(def: Digit) {
  const count = def.points.length - 1;
  const sample = (at: number): Ring => {
    const segment = Math.max(0, Math.min(count - 1, Math.floor(at))), t = at - segment;
    const a = def.points[segment], b = def.points[segment + 1];
    const direction = angle(a, b);
    const tangent = { x: Math.cos(direction), y: Math.sin(direction) };
    // Averaged tangent at a knuckle prevents cracks in the rest ribbon.
    let normalAngle = direction;
    if (t === 0 && segment > 0) normalAngle = angle(def.points[segment - 1], def.points[segment + 1]);
    return { center: { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) }, normal: { x: -Math.sin(normalAngle), y: Math.cos(normalAngle) }, tangent,
      radius: mix(def.radii[segment], def.radii[segment + 1], Math.max(0, Math.min(1, t))), at };
  };
  const endLength = Math.hypot(def.points[count].x - def.points[count - 1].x, def.points[count].y - def.points[count - 1].y);
  const rings = [-.12, ...Array.from({ length: count * 4 + 1 }, (_, i) => i / 4), count + (def.radii[count] + .7) / endLength].map(sample);
  const edge = (ring: Ring, side: number) => ({ x: ring.center.x + ring.normal.x * ring.radius * side, y: ring.center.y + ring.normal.y * ring.radius * side });
  const left = rings.slice(0, -1).map(r => edge(r, 1)), right = rings.slice(0, -1).map(r => edge(r, -1));
  const last = rings[rings.length - 2], cap = { x: last.center.x + last.tangent.x * last.radius, y: last.center.y + last.tangent.y * last.radius };
  const tipLeft = left[left.length - 1], tipRight = right[right.length - 1];
  const roundTip = `Q ${text({ x: tipLeft.x + last.tangent.x * last.radius, y: tipLeft.y + last.tangent.y * last.radius })} ${text(cap)} Q ${text({ x: tipRight.x + last.tangent.x * last.radius, y: tipRight.y + last.tangent.y * last.radius })} ${text(tipRight)}`;
  const fill = `${contour(left)} ${roundTip} ${contour([...right].reverse(), false)} Z`;
  // Outline starts inside the palm, without a closed knuckle cap.
  const outline = `${contour(left.slice(2))} ${roundTip} ${contour(right.slice(2).reverse(), false)}`;
  const shapes: VectorShape[] = [p(fill, c.skin, 'none'), p(outline, 'none', c.ink, .55)];
  for (let i = 1; i < count; i++) {
    const r = sample(i), a = edge({ ...r, radius: r.radius * .45 }, -1), b = edge({ ...r, radius: r.radius * .45 }, 1);
    shapes.push(p(`M ${text(a)} Q ${text({ x: r.center.x + r.tangent.x * .35, y: r.center.y + r.tangent.y * .35 })} ${text(b)}`, 'none', '#ba9888', .32));
  }
  const nail = sample(count - .42), nailA = edge({ ...nail, radius: nail.radius * .65 }, 1), nailB = edge({ ...nail, radius: nail.radius * .65 }, -1);
  shapes.push(p(`M ${text(nailA)} Q ${text({ x: nail.center.x + nail.tangent.x * .7, y: nail.center.y + nail.tangent.y * .7 })} ${text(nailB)}`, 'none', '#b99788', .35));
  return { rings, shapes };
}

export interface HandBuildOptions {
  setId: string;
  wrists: Record<Side, string>;
  palms: Record<Side, string>;
  /** The same camera-independent projection used by the palm artwork. */
  project: (side: Side, angle: number, sourcePoint: Point2D) => Point2D;
}

/** Add five independently skinned digits per hand to an already prepared rig. */
export function addReferenceGirlFingers(rig: Rig, options: HandBuildOptions): HandRig[] {
  const set = rig.characterViews.find(set => set.id === options.setId)!;
  const handRigs: HandRig[] = [];
  const records: Array<{ side: Side; digit: Digit; boneIds: string[]; layerId: string; sourceVertices: Point2D[] }> = [];
  for (const side of ['Left', 'Right'] as const) {
    const wrist = rig.bones.get(options.wrists[side])!, palm = rig.layers.get(options.palms[side])!;
    const hand: HandRig = { id: createId('hand-rig'), name: `${side} hand`, wristBoneId: wrist.id, palmLayerId: palm.id, fingers: [] };
    for (const [order, def] of digits[side].entries()) {
      const boneIds: string[] = [];
      for (let i = 0; i < def.points.length - 1; i++) {
        const a = options.project(side, 0, def.points[i]), b = options.project(side, 0, def.points[i + 1]);
        const parentId = i ? boneIds[i - 1] : wrist.id, parent = rig.bones.get(parentId)!;
        const id = rig.addBone(parentId, `${side} ${def.name.toLowerCase()} · ${i === 0 ? 'knuckle' : i === def.points.length - 2 ? 'tip' : 'middle'}`, Math.hypot(b.x - a.x, b.y - a.y));
        rig.bones.get(id)!.local = { ...identity(), ...worldToLocalPoint(parent.world, a)!, rotation: wrap(angle(a, b) - parent.world.rotation) };
        rig.bones.get(id)!.color = ['#9dbaea', '#76ceb1', '#edc17d', '#c69de2', '#ec9faa'][order];
        boneIds.push(id); rig.update();
      }
      const { rings, shapes } = ribbon(def);
      const origin = options.project(side, 0, def.points[0]);
      // Source artwork uses image coordinates; the front mapping is a uniform
      // scale. Keeping a local 0.75 source preserves the thin reference lines.
      const mappedOrigin = options.project(side, 0, { x: def.points[0].x + 1, y: def.points[0].y });
      const scale = Math.hypot(mappedOrigin.x - origin.x, mappedOrigin.y - origin.y);
      const localShapes = shapes.map(shape => ({ ...shape, d: shape.d!.replace(/[-+]?(?:\d*\.\d+|\d+)\s+[-+]?(?:\d*\.\d+|\d+)/g, pair => { const [x, y] = pair.split(/\s+/).map(Number); return text({ x: x - def.points[0].x, y: y - def.points[0].y }); }) }));
      const layerId = rig.addVectorLayer(`${side} ${def.name.toLowerCase()} · skinned finger`, localShapes), layer = rig.layers.get(layerId)!;
      layer.local = { ...identity(), ...origin, scaleX: scale, scaleY: scale }; layer.zIndex = palm.zIndex + .1 + order * .01;
      const bounds = meshBounds(layer)!;
      // Include the transparent apron that carries each side's anti-aliased edge.
      bounds.x -= 2.2; bounds.y -= 2.2; bounds.width += 4.4; bounds.height += 4.4;
      const mesh: MeshData = { bounds, vertices: [], triangles: [] };
      const sourceVertices: Point2D[] = [];
      rings.forEach(ring => {
        for (const side of [-1, 0, 1]) {
          const q = { x: ring.center.x + ring.normal.x * (ring.radius + .7) * side, y: ring.center.y + ring.normal.y * (ring.radius + .7) * side };
          sourceVertices.push(q);
          const x = q.x - def.points[0].x, y = q.y - def.points[0].y;
          mesh.vertices.push({ x, y, u: Math.max(0, Math.min(1, (x - bounds.x) / bounds.width)), v: Math.max(0, Math.min(1, (y - bounds.y) / bounds.height)), weights: {} });
        }
      });
      for (let row = 0; row < rings.length - 1; row++) for (let col = 0; col < 2; col++) {
        const a = row * 3 + col, b = a + 1, c = a + 3, d = c + 1; mesh.triangles.push(a, b, d, a, d, c);
      }
      layer.mesh = mesh;
      if (!rig.bindMesh(layerId, boneIds)) throw new Error(`Could not skin ${side} ${def.name}`);
      rings.forEach((ring, row) => {
        const last = boneIds.length - 1, segment = Math.max(0, Math.min(last, Math.floor(ring.at)));
        let weights: Record<string, number> = { [boneIds[segment]]: 1 };
        const joint = Math.round(ring.at), distance = ring.at - joint;
        if (joint > 0 && joint <= last && Math.abs(distance) <= .25) {
          const t = (distance + .25) / .5;
          weights = { [boneIds[joint - 1]]: 1 - t, [boneIds[joint]]: t };
        }
        for (let col = 0; col < 3; col++) mesh.vertices[row * 3 + col].weights = { ...weights };
      });
      layer.patch = { enabled: true, hideEdges: true, preserveOutline: true, seamWidth: .08, targetIds: [palm.id] };
      const rootAngle = wrist.world.rotation + def.spread;
      hand.fingers.push({ name: def.name, boneIds, layerId,
        restRotations: boneIds.map(id => rig.bones.get(id)!.local.rotation),
        openRotations: boneIds.map((_, i) => i === 0 ? wrap(rootAngle - wrist.world.rotation) : 0),
        curlAngles: def.name === 'Thumb' ? [.4, -1.05] : [-.12, -1.2, -.85],
      });
      records.push({ side, digit: def, boneIds, layerId, sourceVertices });
    }
    hand.fingers.sort((a, b) => ['Thumb', 'Index', 'Middle', 'Ring', 'Little'].indexOf(a.name) - ['Thumb', 'Index', 'Middle', 'Ring', 'Little'].indexOf(b.name));
    handRigs.push(hand);
  }
  rig.update();
  addCharacterViewParts(rig, set.id, records.flatMap(record => [...record.boneIds, record.layerId]));
  for (const view of set.views) {
    rig.characterAngleOverrides.set(set.id, { frame: 0, angle: view.angle }); rig.update();
    for (const record of records) {
      let parent = { ...rig.bones.get(options.wrists[record.side])!.world };
      record.boneIds.forEach((id, i) => {
        const a = options.project(record.side, view.angle, record.digit.points[i]), b = options.project(record.side, view.angle, record.digit.points[i + 1]);
        const world: Transform2D = { ...identity(), ...a, rotation: angle(a, b) };
        view.targets[id].local = { ...identity(), ...worldToLocalPoint(parent, a)!, rotation: wrap(world.rotation - parent.rotation) };
        view.targets[id].length = Math.hypot(b.x - a.x, b.y - a.y); parent = world;
      });
      view.targets[record.layerId].zIndex = (view.targets[options.palms[record.side]].zIndex ?? 80) + .1 + digits[record.side].indexOf(record.digit) * .01;
    }
    rig.update();
    for (const record of records) view.targets[record.layerId].mesh = record.sourceVertices.map((q, i) => rig.meshPointToLocal(record.layerId, i, options.project(record.side, view.angle, q))!);
  }
  rig.characterAngleOverrides.clear(); rig.update();
  // Dedicated dials aren't body-view targets or parents of the fingers. Their
  // rotations drive a post-skin axial projection, independently of FK and views.
  for (const [index, hand] of handRigs.entries()) {
    const driverBoneId = rig.addBone(null, `${hand.name} · 360° roll dial`, 28);
    rig.bones.get(driverBoneId)!.local = { ...identity(), x: 610, y: 190 + index * 65 };
    rig.bones.get(driverBoneId)!.color = '#64c8c5';
    const wrist = rig.bones.get(hand.wristBoneId)!, palm = rig.layers.get(hand.palmLayerId)!;
    const axis = { ...wrist.world, rotation: rig.bones.get(wrist.parentId!)!.world.rotation };
    const forearmLayerId = palm.patch!.targetIds[0], forearm = rig.layers.get(forearmLayerId)!;
    forearm.mesh = makeMesh(forearm, 6, 16)!;
    palm.mesh = makeMesh(palm, 8, 12)!;
    const depthAt = (point: Point2D) => {
      const q = worldToLocalPoint(axis, point)!;
      const thickness = 1.9 + 1.1 * (1 - Math.max(0, Math.min(1, q.x / 6)));
      return thickness * Math.sqrt(Math.max(0, 1 - (q.y / 6.5) ** 2));
    };
    hand.turn = { driverBoneId, axisBoneId: wrist.parentId!, forearmLayerId, vertexDepths: { [palm.id]: palm.mesh.vertices.map(v => depthAt(localToWorldPoint(palm.world, v))) }, boneDepths: {},
      backShapeIds: [`${index ? 'right' : 'left'}-hand-back-detail`], palmShapeIds: [`${index ? 'right' : 'left'}-hand-palm-detail`] };
    for (const finger of hand.fingers) {
      const layer = rig.layers.get(finger.layerId)!, mesh = layer.mesh!;
      const baseDepth = depthAt(rig.bones.get(finger.boneIds[0])!.world);
      finger.boneIds.forEach(id => { hand.turn!.boneDepths[id] = baseDepth; });
      // The middle column describes the convex finger surface. Even an exact
      // side-on view has thickness; the outer columns meet at the silhouette.
      hand.turn.vertexDepths[layer.id] = mesh.vertices.map((_, i) => baseDepth + (i % 3 === 1 ? .7 : 0));
      if (layer.type === 'vector') hand.turn.backShapeIds.push(layer.shapes[layer.shapes.length - 1].id);
    }
  }
  rig.metadata.handRigs = JSON.stringify(handRigs);
  rig.update();
  return handRigs;
}
