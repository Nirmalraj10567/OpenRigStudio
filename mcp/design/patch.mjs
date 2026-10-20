import { BUDGET, fail, within } from './results.mjs';

function finiteDeep(value, field) {
  const bad = JSON.stringify(value) === undefined ? true : /NaN|Infinity/.test(JSON.stringify(value));
  void bad;
  const scan = (v) => {
    if (typeof v === 'number' && !Number.isFinite(v)) throw fail(field + ' must contain only finite numbers', 'Check every x, y, rotation and scale value.');
    if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === 'object') Object.values(v).forEach(scan);
  };
  scan(value);
  return value;
}

export function resolveBone(rig, ref) {
  if (ref == null || ref === '') throw fail('A bone id or name is required', 'Get them from get_rig.', 'get_rig');
  if (rig.bones.has(ref)) return rig.bones.get(ref);
  const named = [...rig.bones.values()].filter((b) => b.name === ref);
  if (named.length === 1) return named[0];
  if (named.length > 1) throw fail('Bone name ' + ref + ' matches ' + named.length + ' bones', 'Use the bone id instead. Ids: ' + named.map((b) => b.id).join(', '), 'get_rig');
  throw fail('Bone not found: ' + ref, 'Available: ' + [...rig.bones.keys()].join(', '), 'get_rig');
}

export function resolveLayer(rig, ref) {
  if (ref == null || ref === '') throw fail('A layer id or name is required', 'Get them from get_rig.', 'get_rig');
  if (rig.layers.has(ref)) return rig.layers.get(ref);
  const named = [...rig.layers.values()].filter((l) => l.name === ref);
  if (named.length === 1) return named[0];
  if (named.length > 1) throw fail('Layer name ' + ref + ' matches ' + named.length + ' layers', 'Use the layer id instead. Ids: ' + named.map((l) => l.id).join(', '), 'get_rig');
  throw fail('Layer not found: ' + ref, 'Available: ' + [...rig.layers.keys()].join(', '), 'get_rig');
}

function coerceTransform(input, field) {
  if (!input || typeof input !== 'object') throw fail(field + ' must be an object like {x, y, rotation}', 'Only the fields you pass are changed.');
  const out = {};
  for (const key of ['x', 'y', 'rotation', 'scaleX', 'scaleY']) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key])) throw fail(field + '.' + key + ' must be a finite number', 'Rotation is in radians.');
    out[key] = input[key];
  }
  if (Object.keys(out).length === 0) throw fail(field + ' changed nothing', 'Pass at least one of x, y, rotation, scaleX, scaleY.');
  return out;
}

/* ------------------------------- edit_rig ------------------------------ */

const RIG_OPS = ['addBone', 'removeBone', 'renameBone', 'reparentBone', 'setLength', 'setTransform'];

export function applyRigOps(rig, ops) {
  within(ops, 'ops', BUDGET.ops);
  const changed = [];
  for (const raw of ops) {
    const op = raw && typeof raw === 'object' ? raw : null;
    if (!op || !RIG_OPS.includes(op.op)) throw fail('Unknown rig op: ' + JSON.stringify(raw), 'Allowed ops: ' + RIG_OPS.join(', '));
    if (op.op === 'addBone') {
      const parent = op.parent == null || op.parent === '' ? null : resolveBone(rig, op.parent).id;
      const name = typeof op.name === 'string' && op.name.trim() ? op.name.trim().slice(0, 80) : 'Bone';
      const length = op.length === undefined ? 80 : op.length;
      if (typeof length !== 'number' || !Number.isFinite(length) || length < 0 || length > 5000) {
        throw fail('addBone.length must be a finite number from 0 to 5000', 'Received ' + JSON.stringify(length) + '.');
      }
      const id = rig.addBone(parent, name, length);
      if (op.at) {
        const bone = rig.bones.get(id);
        Object.assign(bone.local, coerceTransform(op.at, 'addBone.at'));
        rig.update();
      }
      if (typeof op.id === 'string' && op.id) {
        if (rig.bones.has(op.id)) throw fail('Bone id already exists: ' + op.id, 'Omit id and use the returned one.');
        const bone = rig.bones.get(id);
        rig.bones.delete(id);
        bone.id = op.id;
        rig.bones.set(bone.id, bone);
        if (bone.parentId) rig.bones.get(bone.parentId).childrenIds = rig.bones.get(bone.parentId).childrenIds.map((c) => (c === id ? bone.id : c));
        rig.update();
      }
      changed.push({ op: 'addBone', id: rig.bones.has(id) ? id : op.id });
      continue;
    }
    const bone = resolveBone(rig, op.bone);
    if (op.op === 'removeBone') {
      const doomed = new Set();
      const walk = (bid) => { doomed.add(bid); for (const c of rig.bones.get(bid)?.childrenIds || []) walk(c); };
      walk(bone.id);
      rig.remove(bone.id);
      changed.push({ op: 'removeBone', id: bone.id, removedBones: doomed.size });
      continue;
    }
    if (op.op === 'renameBone') {
      if (typeof op.name !== 'string' || !op.name.trim()) throw fail('renameBone.name must be a non-empty string');
      bone.name = op.name.trim().slice(0, 80);
      rig.update();
      changed.push({ op: 'renameBone', id: bone.id, name: bone.name });
      continue;
    }
    if (op.op === 'reparentBone') {
      const parent = op.parent == null || op.parent === '' ? null : resolveBone(rig, op.parent).id;
      const keep = op.keepPose !== false;
      if (!rig.reparentBone(bone.id, parent, keep)) {
        throw fail('Cannot parent ' + bone.id + ' under ' + (parent || 'root'), 'This would create a cycle, or the parent is missing.', 'get_rig');
      }
      changed.push({ op: 'reparentBone', id: bone.id, parent });
      continue;
    }
    if (op.op === 'setLength') {
      if (typeof op.length !== 'number' || !Number.isFinite(op.length) || op.length < 0 || op.length > 5000) {
        throw fail('setLength.length must be a finite number from 0 to 5000', 'Received ' + JSON.stringify(op.length) + '.');
      }
      bone.length = Math.max(0, op.length);
      rig.update();
      changed.push({ op: 'setLength', id: bone.id, length: bone.length });
      continue;
    }
    if (op.op === 'setTransform') {
      Object.assign(bone.local, coerceTransform(op.to || op.transform || op.local, 'setTransform.to'));
      rig.update();
      changed.push({ op: 'setTransform', id: bone.id });
      continue;
    }
  }
  return changed;
}

/* ------------------------------ edit_layers ---------------------------- */

const SHAPE_KINDS = ['rect', 'ellipse', 'path', 'polygon'];
const LAYER_OPS = ['addLayer', 'addShapes', 'updateShape', 'removeShape', 'removeLayer', 'setTransform', 'setVisible', 'renameLayer', 'reorder'];

function coerceShape(raw, createId) {
  if (!raw || typeof raw !== 'object') throw fail('Shapes must be objects with a kind', 'Allowed kinds: ' + SHAPE_KINDS.join(', '));
  if (!SHAPE_KINDS.includes(raw.kind)) throw fail('Unknown shape kind: ' + JSON.stringify(raw.kind), 'Allowed kinds: ' + SHAPE_KINDS.join(', '));
  const shape = { ...finiteDeep(raw, 'shape'), id: typeof raw.id === 'string' && raw.id ? raw.id : createId('shape') };
  return shape;
}

export async function applyLayerOps(rig, ops, engine) {
  within(ops, 'ops', BUDGET.ops);
  const changed = [];
  for (const raw of ops) {
    const op = raw && typeof raw === 'object' ? raw : null;
    if (!op || !LAYER_OPS.includes(op.op)) throw fail('Unknown layer op: ' + JSON.stringify(raw), 'Allowed ops: ' + LAYER_OPS.join(', '));
    if (op.op === 'addLayer') {
      const name = typeof op.name === 'string' && op.name.trim() ? op.name.trim().slice(0, 80) : 'Vector';
      const shapes = (op.shapes || []).map((s) => coerceShape(s, engine.createId));
      within(shapes, 'addLayer.shapes', BUDGET.shapes);
      const id = rig.addVectorLayer(name, shapes);
      const fresh = rig.layers.get(id);
      if (op.at) Object.assign(fresh.local, coerceTransform(op.at, 'addLayer.at'));
      else { fresh.local.x = 0; fresh.local.y = 0; }
      rig.update();
      if (op.id) {
        if (rig.layers.has(op.id)) throw fail('Layer id already exists: ' + op.id, 'Omit id and use the returned one.');
        const layer = rig.layers.get(id);
        rig.layers.delete(id); rig.vectors.delete(id);
        layer.id = op.id; layer.name = op.name || layer.name;
        rig.layers.set(layer.id, layer); rig.vectors.set(layer.id, layer);
        rig.update();
      }
      const finalId = rig.layers.has(id) ? id : op.id;
      if (op.bone) {
        const bone = resolveBone(rig, op.bone);
        if (!rig.bind(finalId, bone.id)) throw fail('Could not bind ' + finalId + ' to ' + bone.id, 'The engine rejected the bind; check both ids.', 'bind_layers');
      }
      changed.push({ op: 'addLayer', id: finalId, shapes: shapes.length });
      continue;
    }
    const layer = resolveLayer(rig, op.layer);
    if (layer.type !== 'vector' && ['addShapes', 'updateShape', 'removeShape'].includes(op.op)) {
      throw fail('Shape ops need a vector layer; ' + layer.id + ' is ' + layer.type, 'Use addLayer to create vector artwork.');
    }
    if (op.op === 'removeLayer') {
      rig.remove(layer.id);
      changed.push({ op: 'removeLayer', id: layer.id });
      continue;
    }
    if (op.op === 'addShapes') {
      const shapes = (op.shapes || []).map((s) => coerceShape(s, engine.createId));
      within(shapes, 'addShapes.shapes', BUDGET.shapes);
      const seen = new Set(layer.shapes.map((s) => s.id));
      for (const s of shapes) {
        if (seen.has(s.id) || rig.layers.size === -1) throw fail('Shape id already exists on layer: ' + s.id, 'Omit shape ids or make them unique.');
        layer.shapes.push(s);
      }
      rig.update();
      changed.push({ op: 'addShapes', id: layer.id, added: shapes.length, total: layer.shapes.length });
      continue;
    }
    if (op.op === 'updateShape') {
      const shape = layer.shapes.find((s) => s.id === op.shape);
      if (!shape) throw fail('Shape not found on layer ' + layer.id + ': ' + op.shape, 'Pass an existing shape id.');
      Object.assign(shape, finiteDeep(op.patch || {}, 'updateShape.patch'));
      rig.update();
      changed.push({ op: 'updateShape', id: layer.id, shape: shape.id });
      continue;
    }
    if (op.op === 'removeShape') {
      const before = layer.shapes.length;
      layer.shapes = layer.shapes.filter((s) => s.id !== op.shape);
      if (layer.shapes.length === before) throw fail('Shape not found on layer ' + layer.id + ': ' + op.shape, 'Pass an existing shape id.');
      rig.update();
      changed.push({ op: 'removeShape', id: layer.id, shape: op.shape });
      continue;
    }
    if (op.op === 'setTransform') {
      Object.assign(layer.local, coerceTransform(op.to || op.transform || op.local, 'setTransform.to'));
      rig.update();
      changed.push({ op: 'setTransform', id: layer.id });
      continue;
    }
    if (op.op === 'setVisible') {
      layer.visible = op.visible !== false;
      rig.update();
      changed.push({ op: 'setVisible', id: layer.id, visible: layer.visible });
      continue;
    }
    if (op.op === 'renameLayer') {
      if (typeof op.name !== 'string' || !op.name.trim()) throw fail('renameLayer.name must be a non-empty string');
      layer.name = op.name.trim().slice(0, 80);
      rig.update();
      changed.push({ op: 'renameLayer', id: layer.id, name: layer.name });
      continue;
    }
    if (op.op === 'reorder') {
      if (typeof op.z !== 'number' || !Number.isFinite(op.z)) throw fail('reorder.z must be a finite number', 'Lower z renders behind higher z.');
      layer.zIndex = op.z;
      rig.update();
      changed.push({ op: 'reorder', id: layer.id, z: layer.zIndex });
      continue;
    }
  }
  return changed;
}

/* ------------------------------ bind_layers ---------------------------- */

const BIND_OPS = ['bind', 'unbind', 'setOffset', 'setZ'];

export function applyBindOps(rig, ops) {
  within(ops, 'ops', BUDGET.ops);
  const changed = [];
  for (const raw of ops) {
    const op = raw && typeof raw === 'object' ? raw : null;
    if (!op || !BIND_OPS.includes(op.op)) throw fail('Unknown bind op: ' + JSON.stringify(raw), 'Allowed ops: ' + BIND_OPS.join(', '));
    const layer = resolveLayer(rig, op.layer);
    if (op.op === 'bind') {
      const bone = resolveBone(rig, op.bone);
      if (!rig.bind(layer.id, bone.id)) throw fail('Bind failed for ' + layer.id + ' to ' + bone.id, 'The engine rejected it; both ids exist but the pose may be singular.', 'get_rig');
      changed.push({ op: 'bind', layer: layer.id, bone: bone.id });
      continue;
    }
    if (op.op === 'unbind') {
      const had = rig.unbind(layer.id);
      changed.push({ op: 'unbind', layer: layer.id, wasBound: had });
      continue;
    }
    if (op.op === 'setOffset') {
      const binding = [...rig.bindings.values()].find((b) => (b.layerId || b.imageId) === layer.id);
      if (!binding) throw fail('Layer is not bound: ' + layer.id, 'Use op bind first.');
      Object.assign(binding.bindOffset, coerceTransform(op.to || op.offset, 'setOffset.to'));
      rig.update();
      changed.push({ op: 'setOffset', layer: layer.id });
      continue;
    }
    if (op.op === 'setZ') {
      if (typeof op.z !== 'number' || !Number.isFinite(op.z)) throw fail('setZ.z must be a finite number');
      layer.zIndex = op.z;
      rig.update();
      changed.push({ op: 'setZ', layer: layer.id, z: layer.zIndex });
      continue;
    }
  }
  return changed;
}

/* ---------------------------- edit_keyframes --------------------------- */

const KEY_OPS = ['upsert', 'remove', 'clearTrack', 'removeTrack', 'shift'];

function resolveClip(rig, ref) {
  const clips = rig.animations || [];
  if (ref == null || ref === '') {
    const active = clips.find((c) => c.id === rig.timeline.activeAnimationId) || clips[0];
    if (!active) throw fail('The project has no animation clips', 'Create one with edit_animation first.', 'edit_animation');
    return active;
  }
  const clip = clips.find((c) => c.id === ref || c.name === ref);
  if (!clip) throw fail('Clip not found: ' + ref, 'Available: ' + clips.map((c) => c.id).join(', '));
  return clip;
}

function resolveTrack(clip, rig, ref) {
  if (!ref || typeof ref !== 'object') throw fail('track must be an object: {id} or {target, property}', 'Example: {target: "left-arm", property: "rotation"}.');
  if (ref.id) {
    const track = clip.tracks.find((t) => t.id === ref.id);
    if (!track) throw fail('Track not found in clip ' + clip.id + ': ' + ref.id, 'List tracks with get_keyframes.', 'get_keyframes');
    return track;
  }
  if (ref.target && ref.property) {
    if (!rig.bones.has(ref.target) && !rig.layers.has(ref.target)) {
      throw fail('Track target not found: ' + ref.target, 'Use a bone or layer id from get_rig.', 'get_rig');
    }
    let track = clip.tracks.find((t) => t.targetId === ref.target && t.property === ref.property);
    if (!track) {
      track = { id: 'track-' + ref.target + '-' + ref.property + '-' + clip.tracks.length, targetId: ref.target, property: ref.property, keyframes: [] };
      clip.tracks.push(track);
    }
    return track;
  }
  throw fail('track needs {id} or {target, property}', 'Example: {target: "root", property: "x"}.');
}

export async function applyKeyframeOps(rig, ops, engine) {
  within(ops, 'ops', BUDGET.ops);
  const changed = [];
  for (const raw of ops) {
    const op = raw && typeof raw === 'object' ? raw : null;
    if (!op || !KEY_OPS.includes(op.op)) throw fail('Unknown keyframe op: ' + JSON.stringify(raw), 'Allowed ops: ' + KEY_OPS.join(', '));
    const clip = resolveClip(rig, op.clip);
    if (op.op === 'removeTrack') {
      const track = resolveTrack(clip, rig, op.track);
      clip.tracks = clip.tracks.filter((t) => t !== track);
      rig.update();
      changed.push({ op: 'removeTrack', clip: clip.id, track: track.id });
      continue;
    }
    const track = resolveTrack(clip, rig, op.track);
    if (op.op === 'upsert') {
      const keys = Array.isArray(op.keys) ? op.keys : (op.key !== undefined || op.frame !== undefined ? [op] : []);
      within(keys, 'upsert.keys', BUDGET.keyframes);
      if (!keys.length) throw fail('upsert needs keys: [{frame, value}] or a single {frame, value}', 'Example: {op: "upsert", track: {target: "root", property: "x"}, frame: 12, value: 400}.');
      let n = 0;
      for (const k of keys) {
        const frame = k.frame;
        if (!Number.isInteger(frame) || frame < 0 || frame > 100000) throw fail('Keyframe frame must be an integer from 0 to 100000', 'Received ' + JSON.stringify(frame) + '.');
        if (k.value === undefined) throw fail('Keyframe value is required', 'Numbers, {x, y} objects and transform objects are accepted.');
        finiteDeep(k.value, 'keyframe value');
        const key = {
          id: typeof k.id === 'string' && k.id ? k.id : engine.createId('key'),
          frame,
          value: JSON.parse(JSON.stringify(k.value)),
          easing: k.easing || 'linear',
        };
        Object.assign(track, engine.upsertKeyframe(track, key));
        n++;
      }
      if (clip.endFrame != null) {
        const last = Math.max(clip.endFrame, ...track.keyframes.map((k) => k.frame));
        void last;
      }
      rig.update();
      changed.push({ op: 'upsert', clip: clip.id, track: track.id, keys: n, total: track.keyframes.length });
      continue;
    }
    if (op.op === 'remove') {
      const frames = Array.isArray(op.frames) ? op.frames : [op.frame];
      for (const f of frames) {
        if (!Number.isInteger(f)) throw fail('remove.frame must be an integer frame number', 'Received ' + JSON.stringify(f) + '.');
        Object.assign(track, engine.removeKeyframe(track, f));
      }
      rig.update();
      changed.push({ op: 'remove', clip: clip.id, track: track.id, remaining: track.keyframes.length });
      continue;
    }
    if (op.op === 'clearTrack') {
      track.keyframes = [];
      rig.update();
      changed.push({ op: 'clearTrack', clip: clip.id, track: track.id });
      continue;
    }
    if (op.op === 'shift') {
      const by = op.by;
      if (typeof by !== 'number' || !Number.isFinite(by)) throw fail('shift.by must be a finite number of frames', 'Positive moves later, negative moves earlier.');
      const from = op.from != null ? op.from : 0;
      const to = op.to != null ? op.to : 100000;
      let n = 0;
      for (const k of track.keyframes) {
        if (k.frame >= from && k.frame <= to) { k.frame = Math.max(0, Math.round(k.frame + by)); n++; }
      }
      track.keyframes.sort((a, b) => a.frame - b.frame);
      rig.update();
      changed.push({ op: 'shift', clip: clip.id, track: track.id, moved: n });
      continue;
    }
  }
  return changed;
}

/* ---------------------------- edit_animation --------------------------- */

const CLIP_OPS = ['createClip', 'renameClip', 'removeClip', 'retime', 'setActive'];

export function applyClipOps(rig, ops, engine) {
  within(ops, 'ops', BUDGET.ops);
  const changed = [];
  const clips = () => rig.animations || (rig.animations = []);
  for (const raw of ops) {
    const op = raw && typeof raw === 'object' ? raw : null;
    if (!op || !CLIP_OPS.includes(op.op)) throw fail('Unknown clip op: ' + JSON.stringify(raw), 'Allowed ops: ' + CLIP_OPS.join(', '));
    if (op.op === 'createClip') {
      const name = typeof op.name === 'string' && op.name.trim() ? op.name.trim().slice(0, 80) : 'Clip';
      const fps = op.fps != null ? op.fps : 24;
      const endFrame = op.endFrame != null ? op.endFrame : 120;
      if (!(fps >= 1 && fps <= 120)) throw fail('createClip.fps must be between 1 and 120', 'Received ' + JSON.stringify(fps) + '.');
      if (!Number.isInteger(endFrame) || endFrame < 1 || endFrame > 100000) throw fail('createClip.endFrame must be an integer from 1 to 100000');
      const clip = { id: typeof op.id === 'string' && op.id ? op.id : engine.createId('clip'), name, fps, startFrame: 0, endFrame, tracks: [] };
      if (clips().some((c) => c.id === clip.id)) throw fail('Clip id already exists: ' + clip.id, 'Omit id and use the returned one.');
      clips().push(clip);
      if (op.makeActive !== false) rig.timeline.activeAnimationId = clip.id;
      rig.update();
      changed.push({ op: 'createClip', clip: clip.id, fps, endFrame });
      continue;
    }
    const clip = resolveClip(rig, op.clip);
    if (op.op === 'renameClip') {
      if (typeof op.name !== 'string' || !op.name.trim()) throw fail('renameClip.name must be a non-empty string');
      clip.name = op.name.trim().slice(0, 80);
      rig.update();
      changed.push({ op: 'renameClip', clip: clip.id, name: clip.name });
      continue;
    }
    if (op.op === 'removeClip') {
      rig.animations = clips().filter((c) => c !== clip);
      if (rig.timeline.activeAnimationId === clip.id) rig.timeline.activeAnimationId = (rig.animations[0] || {}).id || null;
      rig.update();
      changed.push({ op: 'removeClip', clip: clip.id });
      continue;
    }
    if (op.op === 'retime') {
      if (op.fps != null) {
        if (!(op.fps >= 1 && op.fps <= 120)) throw fail('retime.fps must be between 1 and 120');
        clip.fps = op.fps;
      }
      if (op.endFrame != null) {
        if (!Number.isInteger(op.endFrame) || op.endFrame < 1 || op.endFrame > 100000) throw fail('retime.endFrame must be an integer from 1 to 100000');
        clip.endFrame = op.endFrame;
      }
      rig.update();
      changed.push({ op: 'retime', clip: clip.id, fps: clip.fps, endFrame: clip.endFrame });
      continue;
    }
    if (op.op === 'setActive') {
      rig.timeline.activeAnimationId = clip.id;
      rig.update();
      changed.push({ op: 'setActive', clip: clip.id });
      continue;
    }
  }
  return changed;
}
