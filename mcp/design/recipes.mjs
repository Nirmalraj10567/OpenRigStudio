import { fail } from './results.mjs';

export const ARCHETYPES = ['humanoid', 'chibi', 'mannequin', 'bust', 'quadruped'];
export const RIG_PRESETS = ['full', 'starter6'];
export const STYLES = ['flat', 'toon', 'ink'];
export const OUTLINE = { flat: 0, toon: 4, ink: 3 };

export const PALETTES = {
  mint:   { body: '#63c7b2', accent: '#f1b866', ink: '#162431', background: '#111d28' },
  sunset: { body: '#f97316', accent: '#facc15', ink: '#3b1d0f', background: '#1a1220' },
  ocean:  { body: '#38bdf8', accent: '#a78bfa', ink: '#0b2436', background: '#0d1826' },
  forest: { body: '#3c9068', accent: '#c7e592', ink: '#12281c', background: '#101c15' },
  mono:   { body: '#cbd5e1', accent: '#64748b', ink: '#0f172a', background: '#111827' },
  rose:   { body: '#f472b6', accent: '#fda4af', ink: '#3f1225', background: '#1c1018' },
};

export function listDesignPresets() {
  return {
    archetypes: ARCHETYPES.map((id) => ({ id, bones: { humanoid: 15, chibi: 15, mannequin: 15, bust: 4, quadruped: 13 }[id] })),
    rigPresets: [
      { id: 'full', note: 'Two-segment limbs with hands and feet. Bust and quadruped archetypes always use full.' },
      { id: 'starter6', note: 'Root plus single-segment head, arms and legs. Humanoid family only.' },
    ],
    palettes: Object.entries(PALETTES).map(([id, colors]) => ({ id, ...colors })),
    styles: STYLES.map((id) => ({ id, outline: OUTLINE[id] })),
    proportions: {
      height: 'Total height in stage pixels, 80 to 900. Default 360.',
      headRatio: 'Head length as a fraction of height, 0.12 to 0.45. Default 0.2 (0.32 for chibi).',
      limbLength: 'Arm and leg length multiplier, 0.5 to 1.8. Default 1.',
      shoulderWidth: 'Shoulder and hip width multiplier, 0.5 to 1.8. Default 1.',
    },
  };
}

const T = (x = 0, y = 0, rotation = 0) => ({ x, y, rotation, scaleX: 1, scaleY: 1 });
const CX = 400;
const GROUND = 438;
const HALF_PI = Math.PI / 2;

function localFromWorld(parent, world) {
  const c = Math.cos(parent.rotation);
  const s = Math.sin(parent.rotation);
  const dx = world.x - parent.x;
  const dy = world.y - parent.y;
  return T(dx * c + dy * s, -dx * s + dy * c, world.rotation - parent.rotation);
}

function assemble(name, joints, art, extra) {
  const worldOf = new Map(joints.map((j) => [j.id, T(j.x, j.y, j.rot)]));
  const bones = joints.map((j) => {
    const local = j.parent == null ? T(j.x, j.y, j.rot) : localFromWorld(worldOf.get(j.parent), T(j.x, j.y, j.rot));
    return { id: j.id, name: j.label, length: j.len, parentId: j.parent, local };
  });
  const bonesById = new Map(bones.map((b) => [b.id, b]));
  const layers = [];
  const bindings = [];
  let z = 0;
  const pushLayer = (id, label, shapes, boneId) => {
    const bone = boneId ? bonesById.get(boneId) : null;
    layers.push({
      id, name: label, type: 'vector', local: T(), visible: true, locked: !bone,
      zIndex: z++, boundBoneId: bone ? bone.id : null, opacity: 1, shapes,
    });
    if (bone) {
      const w = worldOf.get(bone.id);
      bindings.push({ id: 'binding-' + id, layerId: id, imageId: id, boneId: bone.id, bindOffset: T(0, 0, -w.rotation) });
    }
  };
  pushLayer(name + '-ground', 'Ground', [
    { id: name + '-g1', kind: 'rect', x: 0, y: GROUND, width: 800, height: 82, fill: '#1d3441' },
    { id: name + '-g2', kind: 'rect', x: 0, y: GROUND, width: 800, height: 4, fill: '#8ae6d0' },
  ], null);
  pushLayer(name + '-shadow', 'Contact shadow', [
    { id: name + '-sh', kind: 'ellipse', x: CX, y: GROUND, radiusX: 96, radiusY: 12, fill: '#000000', opacity: 0.3 },
  ], null);
  for (const [id, label, shapes, boneId] of art) pushLayer(name + '-' + id, label, shapes, boneId);
  return {
    schemaVersion: 1, id: 'project-' + name, name: extra.title,
    canvas: { width: 800, height: 520, background: extra.palette.background },
    layers, bones, bindings, animations: [{
      id: 'main', name: 'Main', fps: 24, startFrame: 0, endFrame: 120, tracks: [],
    }],
    dynamics: { enabled: false, startFrame: 0, endFrame: 120, fps: 24, substeps: 4, gravityX: 0, gravityY: 420, windX: 0, windY: 0, windNoise: 0, seed: 1, bones: [], bodies: [], meshes: [], emitters: [] },
    stage2d: { enabled: false, cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0, projection: 'perspective' },
    cameraView: 'preview',
    timeline: { currentFrame: 0, currentTime: 0, isPlaying: false, loop: true, fps: 24, startFrame: 0, endFrame: 120, activeAnimationId: 'main' },
    metadata: { createdBy: 'design-mcp', characterType: extra.archetype + ' vector character', rigPreset: extra.preset },
  };
}

const ellipse = (id, x, y, rx, ry, fill, extra = {}) => ({ id, kind: 'ellipse', x, y, radiusX: rx, radiusY: ry, fill, ...extra });
const rect = (id, x, y, w, h, fill, extra = {}) => ({ id, kind: 'rect', x, y, width: w, height: h, fill, ...extra });
const edgeOf = (palette, style) => (OUTLINE[style] > 0 ? { stroke: palette.ink, strokeWidth: OUTLINE[style] } : {});

function humanoidJoints(p) {
  const u = p.height;
  const headLen = p.headRatio * u;
  const topUp = u;
  const neckUp = topUp - headLen;
  const neckLen = 0.055 * u;
  const chestUp = neckUp - neckLen;
  const pelvisUp = 0.5 * u;
  const Y = (up) => GROUND - up;
  const lm = p.limbLength;
  const sw = p.shoulderWidth;
  const shoulder = { up: chestUp - 0.01 * u, x: 0.1 * u * sw };
  const upperArm = 0.17 * u * lm;
  const foreArm = 0.16 * u * lm;
  const hand = 0.09 * u * lm;
  const thigh = 0.25 * u * lm;
  const shin = 0.23 * u * lm;
  const foot = 0.1 * u;
  const armOut = 0.09;
  const legOut = 0.06;
  const joints = [
    { id: 'root', label: 'Root', parent: null, x: CX, y: Y(pelvisUp), rot: 0, len: 0 },
    { id: 'spine', label: 'Spine', parent: 'root', x: CX, y: Y(pelvisUp), rot: -HALF_PI, len: chestUp - pelvisUp },
    { id: 'neck', label: 'Neck', parent: 'spine', x: CX, y: Y(chestUp), rot: -HALF_PI, len: neckLen },
    { id: 'head', label: 'Head', parent: 'neck', x: CX, y: Y(neckUp), rot: -HALF_PI, len: headLen },
  ];
  for (const side of ['left', 'right']) {
    const dir = side === 'left' ? 1 : -1;
    const cap = side === 'left' ? 'Left' : 'Right';
    const a0 = HALF_PI + dir * armOut;
    const sx = CX + dir * shoulder.x;
    const sy = Y(shoulder.up);
    const ex = sx + Math.cos(a0) * upperArm;
    const ey = sy + Math.sin(a0) * upperArm;
    const wx = ex + Math.cos(a0) * foreArm;
    const wy = ey + Math.sin(a0) * foreArm;
    joints.push(
      { id: side + '-arm', label: cap + ' arm', parent: 'spine', x: sx, y: sy, rot: a0, len: upperArm },
      { id: side + '-forearm', label: cap + ' forearm', parent: side + '-arm', x: ex, y: ey, rot: a0, len: foreArm },
      { id: side + '-hand', label: cap + ' hand', parent: side + '-forearm', x: wx, y: wy, rot: a0, len: hand },
    );
    const g0 = HALF_PI + dir * legOut;
    const hx = CX + dir * 0.05 * u;
    const hy = Y(pelvisUp);
    const kx = hx + Math.cos(g0) * thigh;
    const ky = hy + Math.sin(g0) * thigh;
    const ax = kx + Math.cos(HALF_PI) * shin;
    const ay = ky + Math.sin(HALF_PI) * shin;
    joints.push(
      { id: side + '-leg', label: cap + ' thigh', parent: 'root', x: hx, y: hy, rot: g0, len: thigh },
      { id: side + '-shin', label: cap + ' shin', parent: side + '-leg', x: kx, y: ky, rot: HALF_PI, len: shin },
      { id: side + '-foot', label: cap + ' foot', parent: side + '-shin', x: ax, y: ay, rot: 0, len: foot },
    );
  }
  return { joints, dims: { u, headLen, neckUp, neckLen, chestUp, pelvisUp, upperArm, foreArm, hand, thigh, shin, foot, shoulderX: shoulder.x } };
}

const r1 = (value) => Math.round(value * 10) / 10;

function shade(hex, factor) {
  const n = parseInt(String(hex).slice(1), 16);
  const channel = (shift) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
  return '#' + ((channel(16) << 16) + (channel(8) << 8) + channel(0)).toString(16).padStart(6, '0');
}

function tint(hex, amount) {
  const n = parseInt(String(hex).slice(1), 16);
  const channel = (shift) => {
    const base = (n >> shift) & 255;
    return Math.max(0, Math.min(255, Math.round(base + (255 - base) * amount)));
  };
  return '#' + ((channel(16) << 16) + (channel(8) << 8) + channel(0)).toString(16).padStart(6, '0');
}

// Rounded capsule along +X with joint caps at both ends, so a bent limb
// never exposes the background through the joint socket.
function capsule(prefix, id, len, w, fill, edge) {
  return [
    ellipse(prefix + id, r1(len / 2), 0, r1(len / 2 + w * 0.4), w, fill, edge),
    ellipse(prefix + id + '-base', 0, 0, w, w, fill, edge),
    ellipse(prefix + id + '-tip', r1(len), 0, r1(w * 0.92), r1(w * 0.92), fill, edge),
  ];
}

function torsoShapes(prefix, palette, style, parts, u, chestLen) {
  const edge = edgeOf(palette, style);
  const rx = r1(0.125 * u);
  return [
    ellipse(prefix + '-torso', 0, r1(-chestLen / 2), rx, r1(chestLen / 2 + 8), parts.shirt, edge),
    ellipse(prefix + '-belly', 0, -12, r1(rx * 0.68), 14, shade(parts.shirt, 0.78), { opacity: 0.6 }),
    { id: prefix + '-collar', kind: 'ellipse', x: 0, y: r1(-chestLen + 5), radiusX: 14, radiusY: 7, fill: shade(parts.shirt, 0.82), stroke: palette.ink, strokeWidth: 2.5 },
    ellipse(prefix + '-shine', r1(-rx * 0.42), r1(-chestLen * 0.62), 11, r1(chestLen * 0.2), tint(parts.shirt, 0.35), { opacity: 0.85 }),
  ];
}

function sneaker(prefix, id, footLen, fill, ink) {
  const fl = r1(footLen);
  return [
    { id: prefix + id, kind: 'path', d: 'M -8 -11 L ' + r1(fl - 16) + ' -11 Q ' + r1(fl + 5) + ' -11 ' + r1(fl + 5) + ' 1 L ' + r1(fl + 5) + ' 3 Q ' + r1(fl - 6) + ' 8 0 7 L -8 5 Z', fill, stroke: ink, strokeWidth: 3, lineJoin: 'round' },
    { id: prefix + id + '-sole', kind: 'path', d: 'M -8 1 L ' + r1(fl + 5) + ' 1 L ' + r1(fl + 5) + ' 3 Q ' + r1(fl - 6) + ' 8 0 7 L -8 5 Z', fill: shade(fill, 0.78), stroke: ink, strokeWidth: 2, lineJoin: 'round' },
    { id: prefix + id + '-lace1', kind: 'path', d: 'M ' + r1(fl * 0.35) + ' -11 L ' + r1(fl * 0.3) + ' -4', fill: 'none', stroke: ink, strokeWidth: 2.5, lineCap: 'round' },
    { id: prefix + id + '-lace2', kind: 'path', d: 'M ' + r1(fl * 0.52) + ' -11 L ' + r1(fl * 0.47) + ' -4', fill: 'none', stroke: ink, strokeWidth: 2.5, lineCap: 'round' },
  ];
}

function handShapes(prefix, side, parts, handLen, edge) {
  const thumbX = side === 'left' ? 8 : -8;
  return [
    ellipse(prefix + '-' + side + '-palm', 0, r1(handLen / 2), 11, r1(handLen / 2 + 3), parts.skin, edge),
    ellipse(prefix + '-' + side + '-thumb', thumbX, r1(handLen * 0.32), 6, 6.5, parts.skin, edge),
  ];
}

function headFaceShapes(prefix, palette, style, parts, headLen) {
  const edge = edgeOf(palette, style);
  const rx = r1(headLen * 0.62);
  const eyeX = r1(rx * 0.36);
  const eyeY = r1(-headLen * 0.58);
  const top = -headLen - 2;
  const head = [
    ellipse(prefix + '-hairback', 0, r1(-headLen / 2 - 8), r1(rx + 5), r1(headLen / 2 + 4), parts.hair, edge),
    ellipse(prefix + '-head', 0, r1(-headLen / 2 - 2), rx, r1(headLen / 2 + 2), parts.skin, edge),
    ellipse(prefix + '-jaw', 0, -12, r1(rx * 0.6), 15, parts.skin, edge),
    ellipse(prefix + '-ear-l', -rx, r1(-headLen * 0.45), 8, 12, parts.skin, edge),
    ellipse(prefix + '-ear-r', rx, r1(-headLen * 0.45), 8, 12, parts.skin, edge),
    { id: prefix + '-fringe', kind: 'path', d: 'M ' + (-rx) + ' ' + r1(top + 16) + ' Q ' + r1(-rx * 0.55) + ' ' + r1(top + 36) + ' ' + r1(-rx * 0.2) + ' ' + r1(top + 18) + ' Q 0 ' + r1(top + 38) + ' ' + r1(rx * 0.2) + ' ' + r1(top + 18) + ' Q ' + r1(rx * 0.55) + ' ' + r1(top + 36) + ' ' + rx + ' ' + r1(top + 16) + ' L ' + rx + ' ' + r1(top - 2) + ' Q 0 ' + r1(top - 14) + ' ' + (-rx) + ' ' + r1(top - 2) + ' Z', fill: parts.hair, stroke: palette.ink, strokeWidth: 3, lineJoin: 'round' },
  ];
  const face = [
    { id: prefix + '-brow-l', kind: 'path', d: 'M ' + r1(-eyeX - 10) + ' ' + r1(eyeY - 14) + ' L ' + r1(-eyeX + 8) + ' ' + r1(eyeY - 16), fill: 'none', stroke: parts.hair, strokeWidth: 4, lineCap: 'round' },
    { id: prefix + '-brow-r', kind: 'path', d: 'M ' + r1(eyeX - 8) + ' ' + r1(eyeY - 16) + ' L ' + r1(eyeX + 10) + ' ' + r1(eyeY - 14), fill: 'none', stroke: parts.hair, strokeWidth: 4, lineCap: 'round' },
    ellipse(prefix + '-eye-l', -eyeX, eyeY, 9.5, 12, '#ffffff'),
    ellipse(prefix + '-eye-r', eyeX, eyeY, 9.5, 12, '#ffffff'),
    ellipse(prefix + '-pupil-l', r1(-eyeX + 2), eyeY + 3, 4.5, 6.5, palette.ink),
    ellipse(prefix + '-pupil-r', r1(eyeX + 2), eyeY + 3, 4.5, 6.5, palette.ink),
    ellipse(prefix + '-glint-l', r1(-eyeX + 0.5), r1(eyeY + 0.5), 2.2, 2.2, '#ffffff'),
    ellipse(prefix + '-glint-r', r1(eyeX + 0.5), r1(eyeY + 0.5), 2.2, 2.2, '#ffffff'),
    ellipse(prefix + '-blush-l', r1(-eyeX - 14), eyeY + 16, 7, 5, '#f0908a', { opacity: 0.55 }),
    ellipse(prefix + '-blush-r', r1(eyeX + 14), eyeY + 16, 7, 5, '#f0908a', { opacity: 0.55 }),
    { id: prefix + '-smile', kind: 'path', d: 'M ' + (-eyeX) + ' ' + r1(eyeY + headLen * 0.26) + ' Q 0 ' + r1(eyeY + headLen * 0.4) + ' ' + eyeX + ' ' + r1(eyeY + headLen * 0.26), fill: 'none', stroke: palette.ink, strokeWidth: Math.max(3, r1(headLen * 0.045)), lineCap: 'round' },
  ];
  return { head, face };
}

function profileHeadFaceShapes(prefix, palette, style, parts, headLen) {
  const edge = edgeOf(palette, style);
  const rx = r1(headLen * 0.58);
  const cy = r1(-headLen / 2 - 2);
  const eyeX = r1(rx * 0.35);
  const eyeY = r1(-headLen * 0.55);
  const top = -headLen - 2;
  const head = [
    ellipse(prefix + '-hairback', -8, r1(cy - 4), r1(rx + 2), r1(headLen / 2 + 6), parts.hair, edge),
    ellipse(prefix + '-head', 4, cy, r1(rx * 0.94), r1(headLen / 2 + 2), parts.skin, edge),
    ellipse(prefix + '-jaw', 8, -12, r1(rx * 0.55), 14, parts.skin, edge),
    ellipse(prefix + '-nose', r1(rx * 0.95), r1(-headLen * 0.42), 7, 9, parts.skin, edge),
    ellipse(prefix + '-ear', -2, r1(-headLen * 0.45), 8, 12, parts.skin, edge),
    ellipse(prefix + '-earin', -2, r1(-headLen * 0.45), 3.5, 6, shade(parts.skin, 0.85), { opacity: 0.8 }),
    { id: prefix + '-fringe', kind: 'path', d: 'M ' + r1(-rx - 4) + ' ' + r1(top + 20) + ' Q ' + r1(-rx * 0.3) + ' ' + r1(top + 44) + ' ' + r1(rx * 0.5) + ' ' + r1(top + 22) + ' L ' + r1(rx + 6) + ' ' + r1(top + 6) + ' L ' + r1(rx - 2) + ' ' + r1(top - 4) + ' Q 0 ' + r1(top - 16) + ' ' + r1(-rx - 6) + ' ' + r1(top - 6) + ' Z', fill: parts.hair, stroke: palette.ink, strokeWidth: 3, lineJoin: 'round' },
    { id: prefix + '-sideburn', kind: 'path', d: 'M ' + r1(-rx * 0.4) + ' ' + r1(top + 30) + ' L ' + r1(-rx * 0.1) + ' ' + r1(top + 30) + ' L ' + r1(-rx * 0.25) + ' ' + r1(top + 52) + ' Z', fill: parts.hair, stroke: palette.ink, strokeWidth: 2.5, lineJoin: 'round' },
  ];
  const face = [
    { id: prefix + '-brow', kind: 'path', d: 'M ' + r1(eyeX - 11) + ' ' + r1(eyeY - 15) + ' L ' + r1(eyeX + 9) + ' ' + r1(eyeY - 17), fill: 'none', stroke: parts.hair, strokeWidth: 4.5, lineCap: 'round' },
    ellipse(prefix + '-eye', eyeX, eyeY, 10, 12.5, '#ffffff'),
    ellipse(prefix + '-pupil', r1(eyeX + 3), eyeY + 3, 5, 7, palette.ink),
    ellipse(prefix + '-glint', r1(eyeX + 1), r1(eyeY), 2.4, 2.4, '#ffffff'),
    ellipse(prefix + '-blush', r1(eyeX - 2), eyeY + 18, 7.5, 5, '#f0908a', { opacity: 0.55 }),
    { id: prefix + '-smile', kind: 'path', d: 'M ' + r1(eyeX - 12) + ' ' + r1(eyeY + 24) + ' Q ' + r1(eyeX + 2) + ' ' + r1(eyeY + 34) + ' ' + r1(eyeX + 14) + ' ' + r1(eyeY + 22), fill: 'none', stroke: palette.ink, strokeWidth: 3.5, lineCap: 'round' },
  ];
  return { head, face };
}

function humanoidArt(prefix, palette, style, info, parts, facing) {
  const { u, headLen, neckLen, upperArm, foreArm, hand, thigh, shin, foot } = info;
  const edge = edgeOf(palette, style);
  const chestLen = chestOf(info);
  const art = [];
  art.push(['torso', 'Torso', torsoShapes(prefix, palette, style, parts, u, chestLen), 'spine']);
  art.push(['neck', 'Neck', [
    { id: prefix + '-trap', kind: 'path', d: 'M -22 10 L -11 ' + r1(-neckLen - 2) + ' L 11 ' + r1(-neckLen - 2) + ' L 22 10 Z', fill: parts.skin, stroke: palette.ink, strokeWidth: 3, lineJoin: 'round' },
    ellipse(prefix + '-neckshade', 0, -3, 9, 5, shade(parts.skin, 0.85), { opacity: 0.6 }),
  ], 'neck']);
  for (const side of ['left', 'right']) {
    const cap = side === 'left' ? 'Left' : 'Right';
    const aw = 0.052 * u;
    const fw = 0.042 * u;
    const tw = 0.06 * u;
    const sw = 0.045 * u;
    art.push([side + '-thigh', cap + ' thigh', [
      ...capsule(prefix, '-' + side + '-th', thigh, tw, parts.pants, edge),
      ellipse(prefix + '-' + side + '-cuff', r1(thigh - 3), 0, r1(tw * 0.98), 9, shade(parts.pants, 0.72), edge),
    ], side + '-leg']);
    art.push([side + '-shin', cap + ' shin', capsule(prefix, '-' + side + '-sh', shin, sw, parts.skin, edge), side + '-shin']);
    art.push([side + '-foot', cap + ' foot', sneaker(prefix, '-' + side + '-shoe', foot, parts.shoes, palette.ink), side + '-foot']);
    art.push([side + '-upperarm', cap + ' upper arm', [
      ...capsule(prefix, '-' + side + '-ua', upperArm, aw, parts.skin, edge),
      ellipse(prefix + '-' + side + '-sleeve', 2, -2, r1(aw + 7), r1(aw + 7), parts.shirt, edge),
    ], side + '-arm']);
    art.push([side + '-forearm', cap + ' forearm', [
      ...capsule(prefix, '-' + side + '-fa', foreArm, fw, parts.skin, edge),
      ellipse(prefix + '-' + side + '-band', r1(foreArm - 6), 0, 7, r1(fw + 2), parts.shirt, edge),
    ], side + '-forearm']);
    art.push([side + '-hand', cap + ' hand', handShapes(prefix, side, parts, hand, edge), side + '-hand']);
  }
  const hf = facing === 'profile'
    ? profileHeadFaceShapes(prefix, palette, style, parts, headLen)
    : headFaceShapes(prefix, palette, style, parts, headLen);
  art.push(['head', 'Head', hf.head, 'head']);
  art.push(['face', 'Face', hf.face, 'head']);
  return art;
}

function chestOf(info) {
  return (info.chestUp - info.pelvisUp);
}

function starter6Joints(p) {
  const full = humanoidJoints(p);
  const keep = new Set(['root', 'spine', 'head']);
  const byId = new Map(full.joints.map((j) => [j.id, j]));
  const joints = full.joints.filter((j) => keep.has(j.id));
  const spine = byId.get('spine');
  const head = byId.get('head');
  const neckLen = head.y - (spine.y - spine.len);
  void neckLen;
  const headBone = { ...head, y: spine.y - spine.len, len: head.len + byId.get('neck').len - 0 };
  const hj = joints.findIndex((j) => j.id === 'head');
  joints[hj] = { ...headBone, parent: 'spine', rot: -HALF_PI };
  for (const side of ['left', 'right']) {
    const arm = byId.get(side + '-arm');
    const wrist = byId.get(side + '-hand');
    const armLen = Math.hypot(wrist.x - arm.x, wrist.y - arm.y);
    joints.push({ id: side + '-arm', label: (side === 'left' ? 'Left' : 'Right') + ' arm', parent: 'spine', x: arm.x, y: arm.y, rot: arm.rot, len: armLen });
    const leg = byId.get(side + '-leg');
    const ankle = byId.get(side + '-foot');
    const legLen = Math.hypot(ankle.x - leg.x, ankle.y - leg.y);
    joints.push({ id: side + '-leg', label: (side === 'left' ? 'Left' : 'Right') + ' leg', parent: 'root', x: leg.x, y: leg.y, rot: leg.rot, len: legLen });
  }
  return { joints, dims: full.dims };
}

function starter6Art(prefix, palette, style, info, parts) {
  const { u, headLen, thigh, upperArm } = info;
  const edge = edgeOf(palette, style);
  const chestLen = chestOf(info);
  const art = [];
  art.push(['torso', 'Torso', torsoShapes(prefix, palette, style, parts, u, chestLen), 'spine']);
  for (const side of ['left', 'right']) {
    const cap = side === 'left' ? 'Left' : 'Right';
    const legLen = thigh + info.shin;
    art.push([side + '-leg', cap + ' leg', [
      ...capsule(prefix, '-' + side + '-lg', legLen, 0.05 * u, parts.pants, edge),
      ellipse(prefix + '-' + side + '-shoe', 4, legLen - 2, 0.07 * u, 13, parts.shoes, edge),
    ], side + '-leg']);
    const armLen = upperArm + info.foreArm + info.hand;
    art.push([side + '-arm', cap + ' arm', [
      ...capsule(prefix, '-' + side + '-ar', armLen, 0.04 * u, parts.skin, edge),
      ellipse(prefix + '-' + side + '-sleeve', 2, -2, 0.04 * u + 7, 0.04 * u + 7, parts.shirt, edge),
      ellipse(prefix + '-' + side + '-hand', 0, armLen, 11, 14, parts.skin, edge),
    ], side + '-arm']);
  }
  const headRx = headLen * 0.62;
  art.push(['head', 'Head', [
    ellipse(prefix + '-head', 0, -headLen / 2 - 4, headRx, headLen / 2, parts.skin, edge),
    ellipse(prefix + '-ear-l', -headRx, -headLen / 2 - 4, headLen * 0.11, headLen * 0.17, parts.skin, edge),
    ellipse(prefix + '-ear-r', headRx, -headLen / 2 - 4, headLen * 0.11, headLen * 0.17, parts.skin, edge),
  ], 'head']);
  const eyeY = -headLen * 0.62;
  const eyeX = headRx * 0.38;
  art.push(['face', 'Face', [
    ellipse(prefix + '-eye-l', -eyeX, eyeY, headLen * 0.09, headLen * 0.12, '#ffffff'),
    ellipse(prefix + '-eye-r', eyeX, eyeY, headLen * 0.09, headLen * 0.12, '#ffffff'),
    ellipse(prefix + '-pupil-l', -eyeX + 2, eyeY + 3, headLen * 0.04, headLen * 0.06, palette.ink),
    ellipse(prefix + '-pupil-r', eyeX + 2, eyeY + 3, headLen * 0.04, headLen * 0.06, palette.ink),
    { id: prefix + '-smile', kind: 'path', d: 'M ' + (-eyeX) + ' ' + (eyeY + headLen * 0.28) + ' Q 0 ' + (eyeY + headLen * 0.42) + ' ' + eyeX + ' ' + (eyeY + headLen * 0.28), fill: 'none', stroke: palette.ink, strokeWidth: Math.max(2, headLen * 0.035) },
  ], 'head']);
  return art;
}

function bustBuild(p, palette, style) {
  const u = p.height;
  const headLen = Math.max(90, p.headRatio * u * 1.6);
  const rootY = GROUND - 60;
  const neckY = rootY - 60;
  const joints = [
    { id: 'root', label: 'Root', parent: null, x: CX, y: rootY, rot: 0, len: 0 },
    { id: 'neck', label: 'Neck', parent: 'root', x: CX, y: rootY, rot: -HALF_PI, len: rootY - neckY },
    { id: 'head', label: 'Head', parent: 'neck', x: CX, y: neckY, rot: -HALF_PI, len: headLen },
  ];
  const edge = edgeOf(palette, style);
  const rx = headLen * 0.52;
  const art = [
    ['shoulders', 'Shoulders', [
      ellipse('bust-sh', 0, 26, 120, 44, palette.body, edge),
      ellipse('bust-collar', 0, 6, 46, 16, palette.accent, { opacity: 0.9 }),
    ], 'root'],
    ['neck', 'Neck', [rect('bust-neck', -20, -(rootY - neckY) - 4, 40, rootY - neckY + 10, palette.body, edge)], 'neck'],
    ['head', 'Head', [
      ellipse('bust-head', 0, -headLen / 2, rx, headLen / 2, palette.body, edge),
      { id: 'bust-hair', kind: 'path', d: 'M ' + (-rx) + ' ' + (-headLen / 2) + ' Q ' + (-rx * 0.4) + ' ' + (-headLen - 6) + ' ' + rx + ' ' + (-headLen / 2), fill: 'none', stroke: palette.ink, strokeWidth: Math.max(4, headLen * 0.06) },
    ], 'head'],
    ['face', 'Face', [
      ellipse('bust-eye-l', -rx * 0.36, -headLen * 0.55, 9, 12, '#ffffff'),
      ellipse('bust-eye-r', rx * 0.36, -headLen * 0.55, 9, 12, '#ffffff'),
      ellipse('bust-pupil-l', -rx * 0.36 + 2, -headLen * 0.55 + 3, 4, 6, palette.ink),
      ellipse('bust-pupil-r', rx * 0.36 + 2, -headLen * 0.55 + 3, 4, 6, palette.ink),
      { id: 'bust-smile', kind: 'path', d: 'M -18 ' + (-headLen * 0.3) + ' Q 0 ' + (-headLen * 0.3 + 12) + ' 18 ' + (-headLen * 0.3), fill: 'none', stroke: palette.ink, strokeWidth: 5 },
    ], 'head'],
  ];
  return { joints, art };
}

function quadrupedBuild(p, palette, style) {
  const u = p.height;
  const s = u / 300;
  const bodyY = GROUND - 120 * s;
  const bodyLen = 150 * s;
  const x0 = CX - bodyLen / 2;
  const x1 = CX + bodyLen / 2;
  const upper = 42 * s * p.limbLength;
  const lower = 46 * s * p.limbLength;
  const joints = [
    { id: 'root', label: 'Root', parent: null, x: CX, y: bodyY, rot: 0, len: 0 },
    { id: 'spine', label: 'Spine', parent: 'root', x: CX, y: bodyY, rot: 0, len: x1 - CX },
    { id: 'neck', label: 'Neck', parent: 'spine', x: x1, y: bodyY, rot: -0.55, len: 52 * s },
    { id: 'head', label: 'Head', parent: 'neck', x: x1 + Math.cos(-0.55) * 52 * s, y: bodyY + Math.sin(-0.55) * 52 * s, rot: -0.15, len: 50 * s },
    { id: 'tail', label: 'Tail', parent: 'root', x: x0 - 20 * s, y: bodyY - 6 * s, rot: Math.PI - 0.5, len: 64 * s },
  ];
  const legs = [
    ['front-left', x1 - 26 * s, 'spine'], ['front-right', x1 - 10 * s, 'spine'],
    ['rear-left', x0 + 10 * s, 'root'], ['rear-right', x0 + 26 * s, 'root'],
  ];
  for (const [id, hx] of legs) {
    joints.push({ id: id + '-upper', label: id + ' upper', parent: id === 'front-left' || id === 'front-right' ? 'spine' : 'root', x: hx, y: bodyY + 8 * s, rot: HALF_PI, len: upper });
    joints.push({ id: id + '-lower', label: id + ' lower', parent: id + '-upper', x: hx, y: bodyY + 8 * s + upper, rot: HALF_PI, len: lower });
  }
  const edge = edgeOf(palette, style);
  const r = 34 * s;
  const art = [
    ['body', 'Body', [
      ellipse('quad-body', (x0 + x1) / 2 - CX, 0, bodyLen / 2, r, palette.body, edge),
      ellipse('quad-belly', (x0 + x1) / 2 - CX, r * 0.45, bodyLen * 0.32, r * 0.5, palette.accent, { opacity: 0.85 }),
    ], 'root'],
    ['neck', 'Neck', [rect('quad-neck', -12 * s, -52 * s, 24 * s, 56 * s, palette.body, edge)], 'neck'],
    ['head', 'Head', [
      ellipse('quad-head', 20 * s, -6 * s, 30 * s, 24 * s, palette.body, edge),
      ellipse('quad-muzzle', 44 * s, 2 * s, 14 * s, 10 * s, palette.accent, edge),
      ellipse('quad-eye', 22 * s, -14 * s, 5 * s, 6 * s, '#ffffff'),
      ellipse('quad-pupil', 23 * s, -13 * s, 2.4 * s, 3 * s, palette.ink),
      ellipse('quad-ear', 2 * s, -28 * s, 8 * s, 12 * s, palette.accent, edge),
    ], 'head'],
    ['tail', 'Tail', [{ id: 'quad-tail', kind: 'path', d: 'M 0 0 Q ' + (-30 * s) + ' ' + (-10 * s) + ' ' + (-58 * s) + ' ' + (-30 * s), fill: 'none', stroke: palette.body, strokeWidth: 14 * s }], 'tail'],
  ];
  for (const [id] of legs) {
    const cap = id;
    art.push([cap + '-upper', cap + ' upper', [rect('quad-' + cap + '-u', -9 * s, 0, 18 * s, upper, palette.body, edge)], cap + '-upper']);
    art.push([cap + '-lower', cap + ' lower', [
      rect('quad-' + cap + '-l', -7 * s, 0, 14 * s, lower, palette.body, edge),
      ellipse('quad-' + cap + '-paw', 2 * s, lower, 12 * s, 7 * s, palette.accent, edge),
    ], cap + '-lower']);
  }
  return { joints, art };
}

export function buildCharacter(input) {
  const archetype = input.archetype || 'humanoid';
  if (!ARCHETYPES.includes(archetype)) throw fail('Unknown archetype: ' + archetype, 'Allowed: ' + ARCHETYPES.join(', '));
  const preset = input.rigPreset || 'full';
  if (!RIG_PRESETS.includes(preset)) throw fail('Unknown rig preset: ' + preset, 'Allowed: ' + RIG_PRESETS.join(', '));
  const style = input.style || 'toon';
  if (!STYLES.includes(style)) throw fail('Unknown style: ' + style, 'Allowed: ' + STYLES.join(', '));
  const base = PALETTES[input.palette] || PALETTES.mint;
  if (input.palette != null && typeof input.palette === 'string' && !PALETTES[input.palette]) {
    throw fail('Unknown palette: ' + input.palette, 'Allowed: ' + Object.keys(PALETTES).join(', ') + ' — or pass paletteColors instead.');
  }
  const colors = input.paletteColors || {};
  const palette = {
    body: colors.body || base.body,
    accent: colors.accent || base.accent,
    ink: colors.ink || base.ink,
    background: colors.background || base.background,
  };
  for (const [key, value] of Object.entries(palette)) {
    if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
      throw fail('paletteColors.' + key + ' must be a six-digit hex color', 'Example: #63c7b2.');
    }
    palette[key] = value.toLowerCase();
  }
  for (const key of ['skin', 'shirt', 'pants', 'shoes', 'hair']) {
    if (colors[key] === undefined) continue;
    if (typeof colors[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(colors[key])) {
      throw fail('paletteColors.' + key + ' must be a six-digit hex color', 'Example: #63c7b2.');
    }
    palette[key] = colors[key].toLowerCase();
  }
  const parts = {
    skin: palette.skin || palette.body,
    shirt: palette.shirt || palette.body,
    pants: palette.pants || palette.body,
    shoes: palette.shoes || palette.accent,
    hair: palette.hair || palette.ink,
  };
  const p = {
    height: input.height != null ? input.height : (archetype === 'chibi' ? 280 : 360),
    headRatio: input.headRatio != null ? input.headRatio : (archetype === 'chibi' ? 0.32 : 0.2),
    limbLength: input.limbLength != null ? input.limbLength : (archetype === 'chibi' ? 0.72 : 1),
    shoulderWidth: input.shoulderWidth != null ? input.shoulderWidth : 1,
  };
  if (!(p.height >= 80 && p.height <= 900)) throw fail('height must be between 80 and 900', 'Received ' + p.height + '.');
  if (!(p.headRatio >= 0.12 && p.headRatio <= 0.45)) throw fail('headRatio must be between 0.12 and 0.45', 'Received ' + p.headRatio + '.');
  if (!(p.limbLength >= 0.5 && p.limbLength <= 1.8)) throw fail('limbLength must be between 0.5 and 1.8', 'Received ' + p.limbLength + '.');
  if (!(p.shoulderWidth >= 0.5 && p.shoulderWidth <= 1.8)) throw fail('shoulderWidth must be between 0.5 and 1.8', 'Received ' + p.shoulderWidth + '.');

  const title = input.name || 'Designed Character';
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'designed-character';
  const prefix = 'dsg';

  if (archetype === 'bust') {
    const { joints, art } = bustBuild(p, palette, style);
    return assemble(slug, joints, art.map(([id, label, shapes, bone]) => [id, label, shapes.map((sh) => ({ ...sh, id: prefix + '-' + sh.id })), bone]), { title, palette, archetype, preset: 'full' });
  }
  if (archetype === 'quadruped') {
    const { joints, art } = quadrupedBuild(p, palette, style);
    return assemble(slug, joints, art.map(([id, label, shapes, bone]) => [id, label, shapes.map((sh) => ({ ...sh, id: prefix + '-' + sh.id })), bone]), { title, palette, archetype, preset: 'full' });
  }
  const useStarter = preset === 'starter6';
  const facing = input.facing === 'profile' ? 'profile' : 'front';
  if (input.facing !== undefined && input.facing !== 'front' && input.facing !== 'profile') {
    throw fail('facing must be front or profile', 'Profile draws the head in side view, facing right.');
  }
  const { joints, dims } = useStarter ? starter6Joints(p) : humanoidJoints(p);
  const art = useStarter ? starter6Art(prefix, palette, style, dims, parts) : humanoidArt(prefix, palette, style, dims, parts, facing);
  return assemble(slug, joints, art, { title, palette, archetype, preset: useStarter ? 'starter6' : 'full' });
}
