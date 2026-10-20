import type { Rig } from './Rig';
import type { Point2D, Transform2D } from './math';
import { localToWorldPoint, worldToLocalPoint } from './math';
import { getHandRigs, handTurnAvailable } from './handRig';
import type { HandRig } from './handRig';
import type { VectorShape } from './model';

export interface HandTurnState {
  hand: HandRig;
  wrist: Transform2D;
  cosine: number;
  sine: number;
  bones: Map<string, Transform2D>;
  ends: Map<string, Point2D>;
}

/** Prepared after body views/FK/constraints, before any hand is projected. */
export function prepareHandTurns(rig: Rig): HandTurnState[] {
  return getHandRigs(rig).filter(hand => handTurnAvailable(rig, hand)).map(hand => {
    const angle = rig.getConstraintLocal(hand.turn!.driverBoneId).rotation;
    // Reduce before trig: a saved full revolution is exactly the rest projection.
    const wrapped = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const bones = new Map(hand.fingers.flatMap(f => f.boneIds).map(id => [id, { ...rig.bones.get(id)!.world }]));
    const ends = new Map([...bones].map(([id, world]) => [id, localToWorldPoint(world, { x: rig.getConstraintBoneLength(id), y: 0 })]));
    return { hand, wrist: { ...rig.bones.get(hand.wristBoneId)!.world, rotation: rig.bones.get(hand.turn!.axisBoneId)!.world.rotation }, cosine: Math.cos(wrapped), sine: Math.sin(wrapped), bones, ends };
  });
}

/** Orthographic axial roll with authored surface depth and a fixed wrist axis.
 * Applied AFTER skinning so every curl is retained and body views aren't applied twice.
 */
export function projectHandPoint(state: HandTurnState, point: Point2D, depth = 0): Point2D {
  if (state.cosine === 1 && state.sine === 0) return { ...point };
  const local = worldToLocalPoint(state.wrist, point);
  if (!local) return { ...point };
  return localToWorldPoint(state.wrist, { x: local.x, y: local.y * state.cosine + depth * state.sine });
}

export function unprojectHandPoint(state: HandTurnState, point: Point2D, depth = 0): Point2D | null {
  const local = worldToLocalPoint(state.wrist, point);
  if (!local) return null;
  // An edge projection has no unique inverse. Pose it in screen space instead.
  if (Math.abs(state.cosine) < 1e-4) return null;
  return localToWorldPoint(state.wrist, { x: local.x, y: (local.y - depth * state.sine) / state.cosine });
}

/** A short, invertible seam taper on the forearm artwork. Its bone and elbow
 * remain fixed; the last 12px meet the hand's elliptical edge-on cross-section.
 */
export function projectWristSeam(state: HandTurnState, point: Point2D, inverse = false): Point2D {
  if (state.cosine === 1 && state.sine === 0) return { ...point };
  const local = worldToLocalPoint(state.wrist, point);
  if (!local) return { ...point };
  const t = Math.max(0, Math.min(1, (local.x + 12) / 12)), blend = t * t * (3 - 2 * t);
  const scale = 1 + (Math.hypot(state.cosine, state.sine * .32) - 1) * blend;
  const offset = 1.5 * state.sine * blend;
  return localToWorldPoint(state.wrist, { x: local.x, y: inverse ? (local.y - offset) / scale : local.y * scale + offset });
}

/** Surface details fade out before crossing the edge, hiding the texture seam. */
export function handSurfaceShapes(state: HandTurnState, shapes: VectorShape[]): VectorShape[] {
  const turn = state.hand.turn!;
  const skin = shapes.find(shape => /^#[\da-f]{6}$/i.test(shape.fill ?? ''))?.fill;
  return shapes.flatMap(shape => {
    const visibility = turn.backShapeIds.includes(shape.id) ? Math.max(0, state.cosine)
      : turn.palmShapeIds.includes(shape.id) ? Math.max(0, -state.cosine) : 1;
    if (visibility < 1e-6) return [];
    // Details sit on an opaque skin fill. Fade their ink toward that color,
    // retaining an opaque texture so triangle antialias aprons remain enabled.
    if (visibility < 1 && skin && /^#[\da-f]{6}$/i.test(shape.stroke ?? '') && (!shape.fill || shape.fill === 'none')) {
      const stroke = '#' + [1, 3, 5].map(at => Math.round(parseInt(skin.slice(at, at + 2), 16) * (1 - visibility) + parseInt(shape.stroke!.slice(at, at + 2), 16) * visibility).toString(16).padStart(2, '0')).join('');
      return { ...shape, stroke, opacity: 1 };
    }
    if (turn.palmShapeIds.includes(shape.id)) return { ...shape, opacity: visibility };
    return visibility === 1 ? shape : { ...shape, opacity: (shape.opacity ?? 1) * visibility };
  });
}
