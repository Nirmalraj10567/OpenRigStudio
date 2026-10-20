import { addCharacterViewParts, addCharacterViewSet, addCharacterView as addView, REFERENCE_VIEWS, setCharacterViewAngle, updateCharacterViewTarget } from './characterViews';
import { createFacialProfile } from './facialAnimation';
import { createId } from './Rig';
import type { Rig } from './Rig';
import type { CharacterViewTarget, HeadCreatorControls, HeadCreatorMask, HeadCreatorProfile, HeadCreatorSlot } from './model';
import { identity } from './math';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const HEAD_ROLES = ['leftEye', 'rightEye', 'leftPupil', 'rightPupil', 'nose', 'mouth', 'leftEar', 'rightEar'] as const;

export const DEFAULT_HEAD_CONTROLS: HeadCreatorControls = {
  eyeSpacing: 0,
  noseDepth: 0,
  mouthWidth: 0,
  earVisibility: 1,
};

export const DEFAULT_HEAD_MASK: HeadCreatorMask = {
  enabled: false,
  x: 0,
  y: 0,
  radiusX: 92,
  radiusY: 122,
};

function targetName(rig: Rig, id: string): string {
  return (rig.bones.get(id)?.name ?? rig.layers.get(id)?.name ?? '').toLowerCase();
}

export function inferHeadFeatureTargets(rig: Rig, ids: string[]): HeadCreatorProfile['featureTargets'] {
  const left = /left|l\b|_l\b|\.l\b/;
  const right = /right|r\b|_r\b|\.r\b/;
  const named = (patterns: RegExp[]) => ids.find(id => patterns.every(pattern => pattern.test(targetName(rig, id))));
  return {
    leftEye: named([left, /eye/]) ?? named([/eye/]),
    rightEye: named([right, /eye/]) ?? named([/eye/]),
    leftPupil: named([left, /pupil|iris/]),
    rightPupil: named([right, /pupil|iris/]),
    nose: named([/nose/]),
    mouth: named([/mouth|lip/]),
    leftEar: named([left, /ear/]),
    rightEar: named([right, /ear/]),
  };
}

function branchIds(rig: Rig, rootId: string): string[] {
  const ids = new Set<string>();
  const visit = (id: string) => {
    if (ids.has(id)) return;
    ids.add(id);
    rig.getChildren(id).forEach(child => visit(child.id));
  };
  visit(rootId);
  rig.layers.forEach(layer => {
    if ((layer.boundBoneId && ids.has(layer.boundBoneId)) || layer.mesh?.vertices.some(vertex => Object.keys(vertex.weights).some(id => ids.has(id)))) ids.add(layer.id);
  });
  return [...ids];
}

function captureSlots(rig: Rig, viewSetId: string): HeadCreatorSlot[] {
  const set = rig.characterViews.find(item => item.id === viewSetId);
  if (!set) return [];
  return set.views.map(view => ({ viewId: view.id, name: view.name, angle: view.angle, baseline: clone(view.targets) }));
}

function createOrSplitHeadViewSet(rig: Rig, name: string, ids: string[], headBoneId: string): { viewSetId: string; bodyViewSetId?: string } | null {
  const owner = rig.characterViews.find(set => set.targetIds.includes(headBoneId));
  if (!owner) {
    const viewSetId = addCharacterViewSet(rig, `${name.trim() || 'Head'} · views`, ids);
    return viewSetId ? { viewSetId } : null;
  }
  const ownedIds = ids.filter(id => owner.targetIds.includes(id));
  if (!ownedIds.length) return null;
  if (ownedIds.length === owner.targetIds.length) return { viewSetId: owner.id };
  const owned = new Set(ownedIds);
  const viewSetId = createId('character');
  const headSet = {
    id: viewSetId,
    name: `${name.trim() || 'Head'} · views`,
    enabled: true,
    angle: owner.angle,
    wrap: owner.wrap,
    interpolate: owner.interpolate,
    targetIds: [...ownedIds],
    baseline: Object.fromEntries(ownedIds.flatMap(id => owner.baseline[id] ? [[id, clone(owner.baseline[id])] as const] : [])),
    views: owner.views.map(view => ({ ...view, targets: Object.fromEntries(ownedIds.flatMap(id => view.targets[id] ? [[id, clone(view.targets[id])] as const] : [])) })),
  };
  owner.targetIds = owner.targetIds.filter(id => !owned.has(id));
  ownedIds.forEach(id => delete owner.baseline[id]);
  owner.views.forEach(view => ownedIds.forEach(id => delete view.targets[id]));
  rig.characterViews.push(headSet);
  rig.update();
  return { viewSetId, bodyViewSetId: owner.id };
}

function featureId(profile: HeadCreatorProfile, role: typeof HEAD_ROLES[number]): string | undefined {
  return profile.featureTargets[role];
}

function applySlotControls(rig: Rig, profile: HeadCreatorProfile, slot: HeadCreatorSlot): void {
  const set = rig.characterViews.find(item => item.id === profile.viewSetId);
  const view = set?.views.find(item => item.id === slot.viewId);
  if (!set || !view) return;
  const controls = profile.controls;
  const assign = (role: typeof HEAD_ROLES[number], patch: Partial<CharacterViewTarget>) => {
    const id = featureId(profile, role);
    const baseline = id ? slot.baseline[id] : undefined;
    if (!id || !baseline) return;
    updateCharacterViewTarget(rig, set.id, view.id, id, { ...patch, local: { ...baseline.local, ...(patch.local ?? {}) } });
  };
  const shiftX = (role: typeof HEAD_ROLES[number], delta: number) => {
    const id = featureId(profile, role);
    const baseline = id ? slot.baseline[id] : undefined;
    if (baseline) assign(role, { local: { ...baseline.local, x: baseline.local.x + delta } });
  };
  const spacing = controls.eyeSpacing * 24;
  shiftX('leftEye', spacing); shiftX('rightEye', -spacing); shiftX('leftPupil', spacing); shiftX('rightPupil', -spacing);
  const side = Math.sin(slot.angle * Math.PI / 180);
  const nose = featureId(profile, 'nose');
  if (nose && slot.baseline[nose]) assign('nose', { local: { x: slot.baseline[nose].local.x + controls.noseDepth * 18 * side } as CharacterViewTarget['local'] });
  const mouth = featureId(profile, 'mouth');
  if (mouth && slot.baseline[mouth]) assign('mouth', { local: { scaleX: slot.baseline[mouth].local.scaleX * (1 + controls.mouthWidth * .45) } as CharacterViewTarget['local'] });
  const earVisible = controls.earVisibility > .01;
  ['leftEar', 'rightEar'].forEach(role => {
    const id = featureId(profile, role as typeof HEAD_ROLES[number]);
    if (!id || !slot.baseline[id]) return;
    const sideFactor = Math.abs(slot.angle) < 35 ? 1 : Math.abs(slot.angle) < 120 ? .75 : .35;
    assign(role as typeof HEAD_ROLES[number], { visible: earVisible, opacity: (slot.baseline[id].opacity ?? 1) * controls.earVisibility * sideFactor });
  });
}

export function normalizeHeadCreatorControls(value: Partial<HeadCreatorControls> | undefined): HeadCreatorControls {
  return {
    eyeSpacing: Math.max(-1, Math.min(1, finite(value?.eyeSpacing, 0))),
    noseDepth: Math.max(-1, Math.min(1, finite(value?.noseDepth, 0))),
    mouthWidth: Math.max(-1, Math.min(1, finite(value?.mouthWidth, 0))),
    earVisibility: Math.max(0, Math.min(1, finite(value?.earVisibility, 1))),
  };
}

export function normalizeHeadCreatorMask(value: Partial<HeadCreatorMask> | undefined): HeadCreatorMask {
  return {
    enabled: value?.enabled === true,
    x: finite(value?.x, 0),
    y: finite(value?.y, 0),
    radiusX: Math.max(1, finite(value?.radiusX, DEFAULT_HEAD_MASK.radiusX)),
    radiusY: Math.max(1, finite(value?.radiusY, DEFAULT_HEAD_MASK.radiusY)),
  };
}

export function getHeadCreator(rig: Rig, id?: string): HeadCreatorProfile | undefined {
  return (id ? rig.headCreators.find(item => item.id === id) : rig.headCreators[0]);
}

export function createHeadCreator(rig: Rig, name: string, headBoneId: string): string | null {
  if (rig.headCreators.length >= 32 || !rig.bones.has(headBoneId)) return null;
  const ids = branchIds(rig, headBoneId);
  const split = createOrSplitHeadViewSet(rig, name, ids, headBoneId);
  if (!split) return null;
  const viewSetId = split.viewSetId;
  const sourceSet = rig.characterViews.find(item => item.id === viewSetId);
  if (!sourceSet) return null;
  if (sourceSet.views.length === 1) REFERENCE_VIEWS.forEach(view => { if (view.angle !== 0) addView(rig, viewSetId, view.angle, view.name); });
  const viewSet = rig.characterViews.find(item => item.id === viewSetId);
  if (!viewSet) return null;
  const facialProfileId = createFacialProfile(rig, `${name.trim() || 'Head'} · face`, {
    head: ids.find(id => /head|face|skull/i.test(targetName(rig, id))),
    leftEye: ids.find(id => /left|l\b|_l\b/.test(targetName(rig, id)) && /eye/i.test(targetName(rig, id))),
    rightEye: ids.find(id => /right|r\b|_r\b/.test(targetName(rig, id)) && /eye/i.test(targetName(rig, id))),
    mouth: ids.find(id => /mouth|lip/i.test(targetName(rig, id))),
    jaw: ids.find(id => /jaw|chin/i.test(targetName(rig, id))),
  });
  if (facialProfileId) {
    const facial = rig.facialProfiles.find(item => item.id === facialProfileId);
    if (facial) facial.viewSetId = viewSetId;
  }
  const maskLayerId = rig.addVectorLayer(`${name.trim() || 'Head'} · face mask`, [{ id: createId('shape'), kind: 'ellipse', x: DEFAULT_HEAD_MASK.x, y: DEFAULT_HEAD_MASK.y, radiusX: DEFAULT_HEAD_MASK.radiusX, radiusY: DEFAULT_HEAD_MASK.radiusY, fill: 'none', stroke: '#72e4c4', strokeWidth: 2, opacity: .8 }]);
  const maskLayer = rig.layers.get(maskLayerId);
  if (maskLayer) {
    maskLayer.visible = false;
    maskLayer.locked = true;
    rig.update();
    const head = rig.bones.get(headBoneId);
    if (head) maskLayer.local = { ...identity(), x: head.world.x, y: head.world.y };
    rig.bind(maskLayerId, headBoneId);
    addCharacterViewParts(rig, viewSetId, [maskLayerId]);
  }
  const creator: HeadCreatorProfile = {
    id: createId('headCreator'),
    name: name.trim() || 'Head Creator',
    enabled: true,
    headBoneId,
    viewSetId,
    bodyViewSetId: split.bodyViewSetId,
    facialProfileId: facialProfileId ?? undefined,
    featureTargets: inferHeadFeatureTargets(rig, ids),
    controls: { ...DEFAULT_HEAD_CONTROLS },
    mask: { ...DEFAULT_HEAD_MASK },
    slots: captureSlots(rig, viewSetId),
    maskLayerId,
  };
  rig.headCreators.push(creator);
  rig.update();
  return creator.id;
}

export function updateHeadCreatorControls(rig: Rig, id: string, patch: Partial<HeadCreatorControls>): boolean {
  const profile = getHeadCreator(rig, id);
  if (!profile) return false;
  profile.controls = normalizeHeadCreatorControls({ ...profile.controls, ...patch });
  profile.slots.forEach(slot => applySlotControls(rig, profile, slot));
  rig.update();
  return true;
}

export function updateHeadCreatorMask(rig: Rig, id: string, patch: Partial<HeadCreatorMask>): boolean {
  const profile = getHeadCreator(rig, id);
  if (!profile) return false;
  profile.mask = normalizeHeadCreatorMask({ ...profile.mask, ...patch });
  const layer = profile.maskLayerId ? rig.layers.get(profile.maskLayerId) : undefined;
  if (layer?.type === 'vector') {
    const ellipse = layer.shapes.find(shape => shape.kind === 'ellipse');
    if (ellipse) Object.assign(ellipse, { x: profile.mask.x, y: profile.mask.y, radiusX: profile.mask.radiusX, radiusY: profile.mask.radiusY });
    layer.visible = profile.mask.enabled;
    const set = rig.characterViews.find(item => item.id === profile.viewSetId);
    set?.views.forEach(view => { const target = view.targets[layer.id]; if (target) target.visible = profile.mask.enabled; });
  }
  rig.update();
  return true;
}

export function setHeadCreatorFeatureTarget(rig: Rig, id: string, role: typeof HEAD_ROLES[number], targetId: string | undefined): boolean {
  const profile = getHeadCreator(rig, id);
  if (!profile) return false;
  if (targetId && !rig.characterViews.find(item => item.id === profile.viewSetId)?.targetIds.includes(targetId)) return false;
  if (targetId) profile.featureTargets[role] = targetId;
  else delete profile.featureTargets[role];
  profile.slots.forEach(slot => applySlotControls(rig, profile, slot));
  rig.update();
  return true;
}

export function linkHeadCreatorBody(rig: Rig, id: string, bodyViewSetId?: string): boolean {
  const profile = getHeadCreator(rig, id);
  if (!profile) return false;
  profile.bodyViewSetId = bodyViewSetId || undefined;
  rig.update();
  return true;
}

export function createHeadCreatorTurnKeys(rig: Rig, id: string, startFrame = 0, endFrame = 48): boolean {
  const profile = getHeadCreator(rig, id);
  const set = profile && rig.characterViews.find(item => item.id === profile.viewSetId);
  if (!profile || !set || !profile.slots.length || !Number.isFinite(startFrame) || !Number.isFinite(endFrame) || endFrame <= startFrame) return false;
  const before = rig.timeline.currentFrame;
  const slots = [...profile.slots].sort((a, b) => a.angle - b.angle);
  slots.forEach((slot, index) => {
    const frame = Math.round(startFrame + (endFrame - startFrame) * (index / Math.max(1, slots.length - 1)));
    rig.setTimeline({ currentFrame: frame, currentTime: frame / rig.timeline.fps });
    setCharacterViewAngle(rig, set.id, slot.angle, true, true);
  });
  rig.setTimeline({ currentFrame: before, currentTime: before / rig.timeline.fps });
  rig.update();
  return true;
}

export function headCreatorSlots(rig: Rig, id: string): HeadCreatorSlot[] {
  return getHeadCreator(rig, id)?.slots ?? [];
}

export const HEAD_CREATOR_ROLES = HEAD_ROLES;
