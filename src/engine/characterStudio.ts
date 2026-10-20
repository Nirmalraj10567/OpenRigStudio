import { createId, Rig } from './Rig';
import { identity, worldToLocalPoint } from './math';
import { createLayerGroup } from './layerGroups';
import type { VectorShape } from './model';

export type CharacterDesign = {
  gender: 'female' | 'male';
  skin: string;
  head: 'oval' | 'round' | 'angular';
  hair: 'crop' | 'bob' | 'curls' | 'long' | 'ponytail' | 'fade';
  hairColor: string;
  neck: 'slim' | 'classic' | 'strong';
  shirt: 'tee' | 'hoodie' | 'jacket' | 'blouse';
  shirtColor: string;
  shirtPattern: 'none' | 'stripes' | 'checks' | 'plaid' | 'gradient' | 'camouflage' | 'graphic';
  shirtDetail: 'none' | 'collar' | 'roll-up' | 'sleeves' | 'pocket' | 'buttons';
  pants: 'straight' | 'wide' | 'joggers' | 'shorts';
  pantsColor: string;
  shoes: 'sneakers' | 'boots' | 'loafers';
  shoesColor: string;
  height: number;
  build: number;
};

export const DEFAULT_CHARACTER_DESIGN: CharacterDesign = {
  gender: 'female', skin: '#e6a47e', head: 'oval', hair: 'bob', hairColor: '#241c24',
  neck: 'classic', shirt: 'tee', shirtColor: '#5792cc', shirtPattern: 'none', shirtDetail: 'none', pants: 'straight',
  pantsColor: '#395878', shoes: 'sneakers', shoesColor: '#f0eee7', height: 52, build: 50,
};

/** Browser drafts are optional and may come from an older version of the builder. */
export function normalizeCharacterDesign(value: unknown): CharacterDesign {
  const result = { ...DEFAULT_CHARACTER_DESIGN };
  if (!value || typeof value !== 'object') return result;
  const input = value as Record<string, unknown>;
  const choices = {
    gender: ['female', 'male'], head: ['oval', 'round', 'angular'],
    hair: ['crop', 'bob', 'curls', 'long', 'ponytail', 'fade'], neck: ['slim', 'classic', 'strong'],
    shirt: ['tee', 'hoodie', 'jacket', 'blouse'], pants: ['straight', 'wide', 'joggers', 'shorts'],
    shoes: ['sneakers', 'boots', 'loafers'],
  };
  for (const key of Object.keys(choices) as (keyof typeof choices)[]) {
    const option = input[key];
    if (typeof option === 'string' && choices[key].includes(option)) Object.assign(result, { [key]: option });
  }
  for (const key of ['shirtPattern', 'shirtDetail'] as const) {
    const options = key === 'shirtPattern' ? ['none', 'stripes', 'checks', 'plaid', 'gradient', 'camouflage', 'graphic'] : ['none', 'collar', 'roll-up', 'sleeves', 'pocket', 'buttons'];
    const option = input[key];
    if (typeof option === 'string' && options.includes(option)) result[key] = option as never;
  }
  for (const key of ['skin', 'hairColor', 'shirtColor', 'pantsColor', 'shoesColor'] as const) {
    if (typeof input[key] === 'string' && /^#[\da-f]{6}$/i.test(input[key])) result[key] = input[key];
  }
  for (const key of ['height', 'build'] as const) {
    const number = input[key];
    if (typeof number === 'number' && Number.isFinite(number)) result[key] = Math.max(0, Math.min(100, number));
  }
  return result;
}

type Point = { x: number; y: number };
type Joint = { name: string; parent: string | null; start: Point; end: Point };
type Part = { name: string; joint: string; shapes: VectorShape[] };
export type CharacterAssetSlot = 'full' | 'head' | 'neck' | 'shirt' | 'pants' | 'shoes';

export interface CharacterAssetApplyResult {
  groupId: string;
  slot: CharacterAssetSlot;
  updatedLayerIds: string[];
  addedLayerIds: string[];
  hiddenLayerIds: string[];
}

/** One drawing specification drives both the preview and the editable stage rig. */
export function characterBlueprint(input: CharacterDesign) {
  const design = normalizeCharacterDesign(input);
  const joints: Joint[] = [];
  const parts: Part[] = [];
  let shapeIndex = 0;
  const path = (d: string, fill: string, stroke = 'none', strokeWidth = 1.5): VectorShape => ({
    id: `character-shape-${shapeIndex++}`, kind: 'path', d, fill, stroke, strokeWidth, lineCap: 'round', lineJoin: 'round',
  });
  const ellipse = (x: number, y: number, radiusX: number, radiusY: number, fill: string): VectorShape => ({
    id: `character-shape-${shapeIndex++}`, kind: 'ellipse', x, y, radiusX, radiusY, fill,
  });
  const part = (name: string, joint: string, shapes: VectorShape[]) => parts.push({ name, joint, shapes });
  const joint = (name: string, parent: string | null, x: number, y: number, endX: number, endY: number) => {
    joints.push({ name, parent, start: { x, y }, end: { x: endX, y: endY } });
    return name;
  };
  const line = (x: number, y: number, endX: number, endY: number, color: string, width: number) =>
    path(`M${x} ${y}L${endX} ${endY}`, 'none', color, width);
  const skin = design.skin, hair = design.hairColor, top = design.shirtColor, pants = design.pantsColor;
  const frame = .82 + design.build * .0036;
  const shoulder = (design.gender === 'female' ? 57 : 69) * frame;
  const waist = (design.gender === 'female' ? 43 : 56) * frame;
  const hips = (design.gender === 'female' ? 57 : 54) * frame;
  const neckWidth = design.neck === 'slim' ? 24 : design.neck === 'strong' ? 40 : 32;
  const root = joint('Torso', null, 210, 353, 210, 218);
  const neck = joint('Neck', root, 210, 218, 210, 182);
  const head = joint('Head', neck, 210, 182, 210, 106);

  // Long hair is behind the face and shoulders rather than covering facial features.
  if (['bob', 'long', 'ponytail'].includes(design.hair)) {
    const end = design.hair === 'long' ? 264 : 184;
    part('Hair · back', head, [path(`M150 131C139 73 166 44 210 44S281 73 270 131L278 ${end}Q210 ${end + 27} 142 ${end}Z`, hair)]);
    if (design.hair === 'ponytail') part('Ponytail', head, [path('M260 80Q323 75 294 216Q267 195 266 142Z', hair)]);
  }

  for (const side of [-1, 1]) {
    const label = side === -1 ? 'Left' : 'Right';
    const hipX = 210 + side * hips * .57;
    const kneeX = hipX + side * 5;
    const ankleX = hipX + side * 9;
    const thigh = joint(`${label} upper leg`, root, hipX, 351, kneeX, 449);
    const shin = joint(`${label} lower leg`, thigh, kneeX, 449, ankleX, 548);
    const foot = joint(`${label} foot`, shin, ankleX, 548, ankleX + side * 27, 556);
    const legWidth = (design.pants === 'wide' ? 43 : design.pants === 'joggers' ? 32 : 35) * frame;
    part(`${label} pants · thigh`, thigh, [line(hipX, 353, kneeX, design.pants === 'shorts' ? 435 : 450, pants, legWidth)]);
    if (design.pants === 'shorts') {
      part(`${label} shin`, shin, [line(kneeX, 443, ankleX, 549, skin, 23 * frame)]);
    } else {
      const hem = design.pants === 'wide' ? legWidth * 1.13 : design.pants === 'joggers' ? legWidth * .67 : legWidth * .85;
      part(`${label} pants · shin`, shin, [
        path(`M${kneeX - legWidth / 2} 445H${kneeX + legWidth / 2}L${ankleX + hem / 2} 550H${ankleX - hem / 2}Z`, pants),
        ...(design.pants === 'joggers' ? [line(ankleX - hem / 2, 546, ankleX + hem / 2, 546, '#ffffff', 2)] : []),
      ]);
    }
    const shoeHeight = design.shoes === 'boots' ? 33 : design.shoes === 'loafers' ? 9 : 17;
    const shoeLeft = ankleX - (side < 0 ? 35 : 16), shoeRight = ankleX + (side > 0 ? 35 : 16);
    part(`${label} shoe`, foot, [
      path(`M${ankleX - 15} ${552 - shoeHeight}H${ankleX + 15}V548Q${shoeRight + 2} 551 ${shoeRight} 565H${shoeLeft}Q${shoeLeft - 2} 551 ${ankleX - 15} 548Z`, design.shoesColor),
      line(shoeLeft + 2, 564, shoeRight - 2, 564, '#131e28', 3),
      ...(design.shoes === 'sneakers' ? [line(ankleX - 8, 549, ankleX + 8, 549, '#9aaab0', 2), line(ankleX - 8, 554, ankleX + 8, 554, '#9aaab0', 2)] : []),
    ]);
    const shoulderX = 210 + side * shoulder;
    const elbowX = shoulderX + side * 21, wristX = elbowX + side * 5;
    const upper = joint(`${label} upper arm`, root, shoulderX, 228, elbowX, 292);
    const lower = joint(`${label} lower arm`, upper, elbowX, 292, wristX, 355);
    const hand = joint(`${label} hand`, lower, wristX, 355, wristX + side * 2, 376);
    const longSleeves = design.shirt !== 'tee';
    part(`${label} upper arm`, upper, [
      line(shoulderX, 228, elbowX, 294, skin, 23 * frame),
      line(shoulderX, 230, longSleeves ? elbowX : shoulderX + side * 10, longSleeves ? 294 : 258, top, 30 * frame),
    ]);
    part(`${label} forearm`, lower, [line(elbowX, 292, wristX, 355, longSleeves ? top : skin, (longSleeves ? 26 : 21) * frame)]);
    part(`${label} hand`, hand, [ellipse(wristX + side * 2, 367, 12 * frame, 17, skin)]);
  }

  part('Pants · waistband', root, [path(`M${210 - hips} 338H${210 + hips}V381Q210 365 ${210 - hips} 381Z`, pants)]);
  part('Neck', neck, [line(210, 176, 210, 228, skin, neckWidth)]);
  const shirtBody = `M${210 - shoulder} 220L${210 - neckWidth / 2} 214Q210 239 ${210 + neckWidth / 2} 214L${210 + shoulder} 220Q${210 + shoulder + 1} 264 ${210 + waist} 309L${210 + hips - 2} 356Q210 366 ${210 - hips + 2} 356L${210 - waist} 309Q${210 - shoulder - 1} 264 ${210 - shoulder} 220Z`;
  const shirtShapes: VectorShape[] = [path(shirtBody, top), path(`M${210 - hips + 10} 350Q210 359 ${210 + hips - 10} 350`, 'none', '#ffffff44', 2)];
  if (design.shirtPattern === 'stripes') for (let y = 245; y <= 335; y += 18) shirtShapes.push(line(165, y, 255, y, '#ffffff55', 6));
  if (design.shirtPattern === 'checks' || design.shirtPattern === 'plaid') {
    for (let x = 178; x <= 242; x += design.shirtPattern === 'plaid' ? 22 : 16) shirtShapes.push(line(x, 230, x, 345, '#ffffff44', design.shirtPattern === 'plaid' ? 5 : 2));
    for (let y = 244; y <= 336; y += design.shirtPattern === 'plaid' ? 22 : 16) shirtShapes.push(line(166, y, 254, y, '#ffffff44', design.shirtPattern === 'plaid' ? 5 : 2));
  }
  if (design.shirtPattern === 'camouflage') shirtShapes.push(ellipse(181, 270, 17, 11, '#354e43'), ellipse(236, 310, 20, 13, '#c5a764'), ellipse(208, 342, 13, 8, '#354e43'));
  if (design.shirtPattern === 'graphic') shirtShapes.push(ellipse(210, 300, 26, 26, '#f8f3ec'), path('M197 307L210 284L223 307L210 301Z', top, top, 1));
  if (design.shirtDetail === 'collar') shirtShapes.push(path('M190 218L210 239L230 218L222 248L210 239L198 248Z', '#f8f3ec', '#aab7d1', 1.5));
  if (design.shirtDetail === 'pocket') shirtShapes.push(path('M224 267H246V290H224Z', top, '#ffffff', 1.5));
  if (design.shirtDetail === 'buttons') [267, 290, 313].forEach(y => shirtShapes.push(ellipse(210, y, 3, 3, '#f8f3ec')));
  if (design.shirtDetail === 'roll-up' || design.shirtDetail === 'sleeves') {
    shirtShapes.push(line(210 - shoulder + 10, 262, 210 - shoulder + 28, 267, '#ffffff', design.shirtDetail === 'roll-up' ? 5 : 2));
    shirtShapes.push(line(210 + shoulder - 10, 262, 210 + shoulder - 28, 267, '#ffffff', design.shirtDetail === 'roll-up' ? 5 : 2));
  }
  part('Shirt · body', root, shirtShapes);
  if (design.shirt === 'hoodie') part('Hood & pocket', root, [
    path('M190 214Q173 206 180 231L204 246L210 233L216 246L240 231Q247 206 230 214Q210 241 190 214Z', top, '#ffffff55', 2),
    path('M187 310L177 337H243L233 310', 'none', '#ffffff55', 2),
    line(198, 243, 198, 264, '#eee9de', 2), line(222, 243, 222, 264, '#eee9de', 2),
  ]);
  if (design.shirt === 'jacket') part('Suit · lapels & shirt', root, [
    path('M193 217L210 293L227 217Q210 234 193 217Z', '#eee9de'),
    path('M210 231L205 240L210 278L215 240Z', '#203043'),
    path('M190 215L180 238L193 245L183 252L210 293L237 252L227 245L240 238L230 215', 'none', '#ffffff66', 2),
    line(210, 293, 210, 354, '#17242e', 2), ellipse(217, 313, 2.3, 2.3, '#eee9de'),
  ]);
  if (design.shirt === 'blouse') part('Blouse · collar & buttons', root, [
    path('M193 215L186 235L201 242L210 229L219 242L234 235L227 215Q210 236 193 215Z', '#eee9de'),
    ...[256, 278, 300].map(y => ellipse(210, y, 2, 2, '#eee9de')),
  ]);

  part('Head · face', head, [
    ellipse(153, 134, 9, 15, skin), ellipse(267, 134, 9, 15, skin),
    design.head === 'angular'
      ? path('M155 111Q155 60 210 60Q265 60 265 111L259 166L233 191H187L161 166Z', skin)
      : ellipse(210, 127, design.head === 'round' ? 61 : 55, design.head === 'round' ? 65 : 70, skin),
  ]);
  part('Hair · front', head, [path(
    design.hair === 'fade' ? 'M151 127Q140 48 210 48Q280 48 269 127L255 102Q210 93 165 102Z'
      : design.hair === 'crop' ? 'M151 121Q140 44 210 44Q281 44 269 121L248 94Q199 123 171 105Z'
        : 'M151 129Q137 43 210 43Q283 43 269 129L253 100Q224 91 208 74Q196 103 165 110L161 146Z', hair),
    ...(design.hair === 'curls' ? [0, 1, 2, 3, 4].map(i => ellipse(162 + i * 24, 75 - Math.sin(i / 4 * Math.PI) * 24, 22, 23, hair)) : []),
  ]);
  part('Left eye', head, [ellipse(189, 135, 6, 8, '#fff9ef'), ellipse(190, 136, 3.5, 5, '#24323b'), line(181, 121, 195, 119, hair, 3)]);
  part('Right eye', head, [ellipse(231, 135, 6, 8, '#fff9ef'), ellipse(232, 136, 3.5, 5, '#24323b'), line(225, 119, 239, 121, hair, 3)]);
  part('Nose', head, [path('M210 137L206 151L213 151', 'none', '#734d3b', 1.5)]);
  part('Mouth', head, [path('M198 165Q210 175 222 165', 'none', '#73433f', 2.5)]);

  // Scale from the soles so height changes never lift the feet off the floor.
  const scaleY = .82 + design.height * .0018;
  return { joints, parts, scaleY, offsetY: 565 * (1 - scaleY) };
}

/** Append a complete character in one store transaction; existing scene data is retained. */
export function addStudioCharacter(rig: Rig, input: CharacterDesign) {
  if (rig.smartEditingActionId) return null;
  const design = normalizeCharacterDesign(input);
  const blueprint = characterBlueprint(design);
  const name = `${design.gender === 'female' ? 'Female' : 'Male'} character`;
  const groupId = createLayerGroup(rig, name);
  if (!groupId) return null;
  const scale = .8;
  const world = (point: Point) => ({ x: 400 + (point.x - 210) * scale, y: 36 + (blueprint.offsetY + point.y * blueprint.scaleY) * scale });
  const boneIds = new Map<string, string>();
  for (const item of blueprint.joints) {
    const parentId = item.parent ? boneIds.get(item.parent)! : null;
    const start = world(item.start), end = world(item.end);
    const id = rig.addBone(parentId, item.name, Math.hypot(end.x - start.x, end.y - start.y));
    const parent = parentId ? rig.bones.get(parentId) : undefined;
    rig.bones.get(id)!.local = {
      ...identity(), ...(parent ? worldToLocalPoint(parent.world, start)! : start),
      rotation: Math.atan2(end.y - start.y, end.x - start.x) - (parent?.world.rotation ?? 0),
    };
    boneIds.set(item.name, id);
    rig.update();
  }
  const group = rig.groups.get(groupId)!;
  const zStart = Math.max(0, ...[...rig.layers.values()].map(layer => layer.zIndex)) + 1;
  const layerIds = blueprint.parts.map((item, index) => {
    const id = rig.addVectorLayer(item.name, item.shapes.map(shape => ({ ...shape, id: createId('shape') })));
    const layer = rig.vectors.get(id)!;
    layer.local = { ...identity(), x: 400 - 210 * scale, y: 36 + blueprint.offsetY * scale, scaleX: scale, scaleY: scale * blueprint.scaleY };
    layer.zIndex = zStart + index;
    layer.parentGroupId = groupId;
    group.childIds.unshift(id);
    rig.update();
    rig.bind(id, boneIds.get(item.joint)!);
    return id;
  });
  rig.update();
  recordCharacterDesign(rig, groupId, design);
  return { groupId, rootId: boneIds.get('Torso')!, boneIds: [...boneIds.values()], layerIds };
}

function recordCharacterDesign(rig: Rig, groupId: string, design: CharacterDesign): void {
  const designs: Record<string, CharacterDesign> = {};
  try {
    const parsed: unknown = JSON.parse(rig.metadata.characterDesigns ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) Object.entries(parsed).forEach(([id, value]) => {
      if (id) designs[id] = normalizeCharacterDesign(value);
    });
  } catch {
    // Optional catalog metadata should never prevent a valid character insert.
  }
  designs[groupId] = normalizeCharacterDesign(design);
  rig.metadata.characterDesigns = JSON.stringify(designs);
  rig.metadata[`characterDesign.${groupId}`] = JSON.stringify(design);
}

function partSlot(name: string): CharacterAssetSlot {
  const value = name.toLowerCase();
  if (value.includes('hair') || value.includes('head') || value.includes('eye') || value.includes('mouth') || value.includes('nose')) return 'head';
  if (value.includes('neck')) return 'neck';
  if (value.includes('shirt') || value.includes('upper arm') || value.includes('forearm') || value.includes('hood') || value.includes('blouse') || value.includes('jacket')) return 'shirt';
  if (value.includes('pants') || value.includes('leg') || value.includes('waistband')) return 'pants';
  if (value.includes('shoe') || value.includes('foot')) return 'shoes';
  return 'full';
}

function storedCharacterDesign(rig: Rig, groupId: string): CharacterDesign | null {
  try {
    const parsed: unknown = JSON.parse(rig.metadata.characterDesigns ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const value = (parsed as Record<string, unknown>)[groupId];
      return value ? normalizeCharacterDesign(value) : null;
    }
  } catch {
    // Fall through to the layer-name based compatibility path.
  }
  return null;
}

function boneForPart(rig: Rig, jointName: string): string | null {
  return [...rig.bones.values()].find(bone => bone.name === jointName)?.id ?? null;
}

/** Find the editable Character Studio group represented by a scene selection. */
export function characterGroupForSelection(rig: Rig, selectedId: string | null): string | null {
  if (!selectedId) return null;
  if (rig.groups.has(selectedId)) return selectedId;
  const layer = rig.layers.get(selectedId);
  if (layer?.parentGroupId && rig.groups.has(layer.parentGroupId)) return layer.parentGroupId;
  const selectedBone = rig.bones.get(selectedId);
  if (!selectedBone) return null;
  const boneIds = new Set<string>([selectedId]);
  const visit = (id: string) => rig.getChildren(id).forEach(child => { if (!boneIds.has(child.id)) { boneIds.add(child.id); visit(child.id); } });
  visit(selectedId);
  for (const group of rig.groups.values()) {
    if (group.childIds.some(id => {
      const candidate = rig.layers.get(id);
      return Boolean(candidate?.boundBoneId && boneIds.has(candidate.boundBoneId));
    })) return group.id;
  }
  return null;
}

/**
 * Replace one editable outfit slot in-place. Existing layer IDs, bindings, and
 * animation tracks stay intact; unavailable old variants are hidden instead of
 * deleted so authored keys remain valid.
 */
export function applyCharacterDesignToGroup(
  rig: Rig,
  groupId: string,
  input: CharacterDesign,
  slot: CharacterAssetSlot = 'full',
): CharacterAssetApplyResult | null {
  const group = rig.groups.get(groupId);
  if (!group || rig.smartEditingActionId) return null;
  const design = normalizeCharacterDesign(input);
  const blueprint = characterBlueprint(design);
  const parts = blueprint.parts.filter(part => slot === 'full' || partSlot(part.name) === slot);
  const desiredNames = new Set(parts.map(part => part.name));
  const updatedLayerIds: string[] = [];
  const addedLayerIds: string[] = [];
  const hiddenLayerIds: string[] = [];
  const existing = group.childIds.map(id => rig.vectors.get(id)).filter((layer): layer is NonNullable<typeof layer> => Boolean(layer));
  const targetLayers = existing.filter(layer => slot === 'full' || partSlot(layer.name) === slot);
  targetLayers.forEach(layer => {
    if (!desiredNames.has(layer.name)) { layer.visible = false; hiddenLayerIds.push(layer.id); }
  });
  const template = existing.find(layer => layer.visible) ?? existing[0];
  const zStart = Math.max(0, ...existing.map(layer => layer.zIndex)) + 1;
  parts.forEach((part, index) => {
    let layer = existing.find(candidate => candidate.name === part.name);
    if (layer) {
      layer.visible = true;
      layer.shapes = part.shapes.map(shape => ({ ...shape, id: createId('character-shape') }));
      updatedLayerIds.push(layer.id);
      return;
    }
    const layerId = rig.addVectorLayer(part.name, part.shapes.map(shape => ({ ...shape, id: createId('character-shape') })));
    layer = rig.vectors.get(layerId)!;
    layer.parentGroupId = groupId;
    layer.zIndex = zStart + index;
    layer.local = template ? { ...template.local } : { ...identity(), x: 232, y: 36, scaleX: .8, scaleY: .8 };
    group.childIds.push(layerId);
    const boneId = boneForPart(rig, part.joint);
    if (boneId) rig.bind(layerId, boneId);
    addedLayerIds.push(layerId);
  });
  rig.update();
  recordCharacterDesign(rig, groupId, design);
  return { groupId, slot, updatedLayerIds, addedLayerIds, hiddenLayerIds };
}

export function characterDesignForGroup(rig: Rig, groupId: string): CharacterDesign | null {
  return storedCharacterDesign(rig, groupId);
}
