import type { Rig } from './Rig';

export type FingerName = 'Thumb' | 'Index' | 'Middle' | 'Ring' | 'Little';
export type HandPose = 'reference' | 'open' | 'grip' | 'point';
export interface FingerRig {
  name: FingerName;
  boneIds: string[];
  layerId: string;
  restRotations: number[];
  openRotations: number[];
  curlAngles: number[];
}
export interface HandRig {
  id: string;
  name: string;
  wristBoneId: string;
  palmLayerId: string;
  fingers: FingerRig[];
  /** Optional in older projects. The dial is keyed as an ordinary bone rotation. */
  turn?: HandTurnRig;
}
export interface HandTurnRig {
  driverBoneId: string;
  /** Twist about the forearm's axis through the wrist, not the splayed fingers. */
  axisBoneId: string;
  forearmLayerId: string;
  vertexDepths: Record<string, number[]>;
  boneDepths: Record<string, number>;
  backShapeIds: string[];
  palmShapeIds: string[];
}
const names: FingerName[] = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];

/** Optional JSON-safe rig metadata; broken/imported references never edit a fallback bone. */
export function getHandRigs(rig: Rig): HandRig[] {
  try {
    const value: unknown = JSON.parse(rig.metadata.handRigs ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((hand): hand is HandRig => {
      if (!hand || typeof hand.id !== 'string' || typeof hand.name !== 'string' || !rig.bones.has(hand.wristBoneId) || !rig.layers.has(hand.palmLayerId) || !Array.isArray(hand.fingers) || hand.fingers.length !== 5) return false;
      const seen = new Set<string>();
      return hand.fingers.every((finger: FingerRig) => {
        if (!finger || !names.includes(finger.name) || seen.has(finger.name) || !rig.layers.has(finger.layerId) || !Array.isArray(finger.boneIds) || finger.boneIds.length !== (finger.name === 'Thumb' ? 2 : 3)) return false;
        seen.add(finger.name);
        if (![finger.restRotations, finger.openRotations, finger.curlAngles].every(values => Array.isArray(values) && values.length === finger.boneIds.length && values.every(Number.isFinite))) return false;
        return finger.boneIds.every((id, index) => rig.bones.get(id)?.parentId === (index === 0 ? hand.wristBoneId : finger.boneIds[index - 1]));
      });
    });
  } catch { return []; }
}

export function setFingerCurl(rig: Rig, handId: string, name: FingerName, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const finger = getHandRigs(rig).find(hand => hand.id === handId)?.fingers.find(finger => finger.name === name);
  if (!finger || finger.boneIds.some(id => rig.bones.get(id)!.locked)) return false;
  const amount = Math.max(0, Math.min(1, value));
  finger.boneIds.forEach((id, index) => { rig.bones.get(id)!.local.rotation = finger.openRotations[index] + finger.curlAngles[index] * amount; });
  rig.update(); return true;
}

export function fingerCurl(rig: Rig, finger: FingerRig): number {
  const index = finger.boneIds.length - 1, bone = rig.bones.get(finger.boneIds[index]);
  return bone ? Math.max(0, Math.min(1, (bone.local.rotation - finger.openRotations[index]) / finger.curlAngles[index])) : 0;
}

export function handTurnAvailable(rig: Rig, hand: HandRig): boolean {
  const turn = hand.turn;
  if (!turn || !rig.bones.has(turn.driverBoneId) || !rig.bones.has(turn.axisBoneId) || !rig.layers.get(turn.forearmLayerId)?.mesh || !turn.vertexDepths || !turn.boneDepths || !Array.isArray(turn.backShapeIds) || !Array.isArray(turn.palmShapeIds)) return false;
  return [hand.palmLayerId, ...hand.fingers.map(f => f.layerId)].every(id => {
    const depths = turn.vertexDepths[id];
    return Array.isArray(depths) && depths.length === rig.layers.get(id)?.mesh?.vertices.length && depths.every(Number.isFinite);
  }) && hand.fingers.every(f => f.boneIds.every(id => Number.isFinite(turn.boneDepths[id])));
}

/** Unwrapped degrees: 0 and 360 render identically but remain distinct keys. */
export function handTurnAngle(rig: Rig, hand: HandRig): number {
  return handTurnAvailable(rig, hand) ? rig.bones.get(hand.turn!.driverBoneId)!.local.rotation * 180 / Math.PI : 0;
}

export function setHandTurn(rig: Rig, handId: string, degrees: number): boolean {
  const hand = getHandRigs(rig).find(h => h.id === handId);
  if (!Number.isFinite(degrees) || !hand || !handTurnAvailable(rig, hand) || rig.smartEditingActionId) return false;
  const driver = rig.bones.get(hand.turn!.driverBoneId)!;
  if (driver.locked) return false;
  driver.local.rotation = degrees * Math.PI / 180;
  rig.update(); return true;
}

/** Changes only digit locals. The store records these as ordinary transform keys. */
export function applyHandPose(rig: Rig, handId: string, pose: HandPose): boolean {
  const hand = getHandRigs(rig).find(hand => hand.id === handId);
  if (!hand || !['reference', 'open', 'grip', 'point'].includes(pose) || hand.fingers.some(f => f.boneIds.some(id => rig.bones.get(id)!.locked))) return false;
  for (const finger of hand.fingers) {
    const curl = pose === 'open' || pose === 'point' && finger.name === 'Index' ? 0 : pose === 'point' && finger.name === 'Thumb' ? .35 : 1;
    finger.boneIds.forEach((id, index) => { rig.bones.get(id)!.local.rotation = pose === 'reference' ? finger.restRotations[index] : finger.openRotations[index] + finger.curlAngles[index] * curl; });
  }
  rig.update(); return true;
}
