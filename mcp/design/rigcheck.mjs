import { fail } from './results.mjs';
import { nativeEngine, openRig } from './engine.mjs';

const isFiniteTransform = (t) => t && [t.x, t.y, t.rotation, t.scaleX, t.scaleY].every((v) => typeof v === 'number' && Number.isFinite(v));

function collectProblems(project) {
  const errors = [];
  const warnings = [];
  const bones = Array.isArray(project.bones) ? project.bones : [];
  const layers = Array.isArray(project.layers) ? project.layers : [];
  const bindings = Array.isArray(project.bindings) ? project.bindings : [];
  const clips = Array.isArray(project.animations) ? project.animations : [];
  const seen = new Set();
  for (const item of [...bones, ...layers]) {
    if (!item || typeof item.id !== 'string' || !item.id) { errors.push('An entry is missing its id'); continue; }
    if (seen.has(item.id)) errors.push('Duplicate id: ' + item.id);
    seen.add(item.id);
  }
  const boneIds = new Set(bones.map((b) => b.id));
  const layerIds = new Set(layers.map((l) => l.id));
  for (const bone of bones) {
    if (bone.parentId != null && !boneIds.has(bone.parentId)) errors.push('Bone ' + bone.id + ' has a missing parent: ' + bone.parentId);
    if (!isFiniteTransform(bone.local)) errors.push('Bone ' + bone.id + ' has a non-finite local transform');
    if (!(typeof bone.length === 'number' && Number.isFinite(bone.length) && bone.length >= 0)) errors.push('Bone ' + bone.id + ' has an invalid length');
  }
  const chain = (start) => {
    const path = [];
    let cursor = start;
    const visited = new Set();
    while (cursor != null) {
      if (visited.has(cursor)) return { cycle: true, path };
      visited.add(cursor);
      path.push(cursor);
      const bone = bones.find((b) => b.id === cursor);
      cursor = bone ? bone.parentId : null;
    }
    return { cycle: false, path };
  };
  for (const bone of bones) {
    const { cycle, path } = chain(bone.id);
    if (cycle) { errors.push('Parent cycle: ' + path.join(' -> ')); break; }
  }
  for (const layer of layers) {
    if (!isFiniteTransform(layer.local)) errors.push('Layer ' + layer.id + ' has a non-finite local transform');
  }
  for (const binding of bindings) {
    const layerId = binding.layerId || binding.imageId;
    if (!layerId || !layerIds.has(layerId)) errors.push('Binding points at a missing layer: ' + (layerId || '(none)'));
    else if (!boneIds.has(binding.boneId)) errors.push('Binding of layer ' + layerId + ' points at a missing bone: ' + binding.boneId);
    if (binding.bindOffset && !isFiniteTransform(binding.bindOffset)) errors.push('Binding of layer ' + layerId + ' has a non-finite offset');
  }
  for (const layer of layers) {
    if (layer.type === 'vector' && !layer.boundBoneId) warnings.push('Unbound vector layer (renders as a static prop): ' + layer.id);
  }
  for (const clip of clips) {
    if (!Array.isArray(clip.tracks)) { errors.push('Clip ' + clip.id + ' has no tracks array'); continue; }
    for (const track of clip.tracks) {
      if (!boneIds.has(track.targetId) && !layerIds.has(track.targetId)) {
        errors.push('Track ' + track.id + ' targets a missing bone or layer: ' + track.targetId);
        continue;
      }
      const keys = Array.isArray(track.keyframes) ? track.keyframes : [];
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (!Number.isInteger(key.frame) || key.frame < 0) { errors.push('Track ' + track.id + ' has an invalid frame: ' + JSON.stringify(key.frame)); break; }
        if (i > 0 && keys[i - 1].frame >= key.frame) { errors.push('Track ' + track.id + ' keyframes are out of order at frame ' + key.frame); break; }
      }
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

async function sampleMotion(project) {
  const eng = await nativeEngine();
  const rig = await openRig(project);
  const clips = Array.isArray(project.animations) ? project.animations : [];
  const clip = clips.find((c) => c.id === (project.timeline || {}).activeAnimationId) || clips[0] || null;
  const frames = { sampled: 0, maxGap: 0, detached: [], nonFinite: [] };
  if (!clip) return { rig, clip: null, frames };
  const end = Math.max(1, Math.min(clip.endFrame != null ? clip.endFrame : 0, 900));
  const step = Math.max(1, Math.floor(end / 12));
  const gapAt = (bone) => {
    if (!bone.parentId) return 0;
    const parent = rig.bones.get(bone.parentId);
    if (!parent) return 0;
    const tip = rig.getBoneEnd(parent.id);
    if (!tip) return 0;
    return Math.hypot(tip.x - bone.world.x, tip.y - bone.world.y);
  };
  for (let f = 0; f <= end; f += step) {
    rig.applyAnimation(clip.id, f);
    frames.sampled++;
    for (const bone of rig.bones.values()) {
      if (![bone.world.x, bone.world.y, bone.world.rotation].every((v) => Number.isFinite(v))) {
        if (!frames.nonFinite.includes(bone.id)) frames.nonFinite.push(bone.id);
      }
      const gap = gapAt(bone);
      if (Number.isFinite(gap) && gap > frames.maxGap) frames.maxGap = gap;
      if (gap > 0.5 && !frames.detached.some((d) => d.bone === bone.id)) frames.detached.push({ bone: bone.id, gap: Math.round(gap * 100) / 100 });
    }
  }
  frames.maxGap = Math.round(frames.maxGap * 1000) / 1000;
  rig.applyAnimation(clip.id, 0);
  rig.applyAnimation(clip.id, end);
  const svg = eng.projectToSVG(rig);
  frames.svgFinite = !/NaN|Infinity/.test(svg);
  if (!frames.svgFinite) frames.nonFinite.push('(svg export)');
  return { rig, clip: clip.id, frames };
}

export async function validateRig(project, { strict = false } = {}) {
  const { errors, warnings } = collectProblems(project);
  const { frames } = await sampleMotion(project);
  const gaps = frames.detached.map((d) => d.bone + ' (' + d.gap + 'px)');
  if (frames.nonFinite.length) errors.push('Non-finite pose at sampled frames: ' + frames.nonFinite.join(', '));
  if (gaps.length) {
    const message = 'Detached joints at rest or in motion: ' + gaps.join(', ');
    if (strict) errors.push(message);
    else warnings.push(message + ' — offset mounts (shoulders, hips, tails) are normal; pass strict:true to fail on them.');
  }
  const ok = errors.length === 0;
  return {
    ok,
    errors,
    warnings,
    joints: { sampledFrames: frames.sampled, maxGap: frames.maxGap, detached: frames.detached },
    counts: {
      bones: (project.bones || []).length,
      layers: (project.layers || []).length,
      bindings: (project.bindings || []).length,
      clips: (project.animations || []).length,
    },
  };
}

export async function autoFixRig(project) {
  const fixes = [];
  const bones = Array.isArray(project.bones) ? project.bones : [];
  const layers = Array.isArray(project.layers) ? project.layers : [];
  const rename = (used, id) => {
    let next = id;
    let n = 2;
    while (used.has(next)) next = id + '-' + (n++);
    used.add(next);
    return next;
  };
  const used = new Set();
  for (const item of [...bones, ...layers]) {
    if (!item.id || used.has(item.id)) {
      const before = item.id || '(missing)';
      item.id = rename(used, typeof item.id === 'string' && item.id ? item.id : 'item');
      fixes.push('Renamed duplicate id ' + before + ' to ' + item.id);
    } else used.add(item.id);
  }
  const boneIds = new Set(bones.map((b) => b.id));
  const layerIds = new Set(layers.map((l) => l.id));
  for (const bone of bones) {
    if (bone.parentId != null && !boneIds.has(bone.parentId)) {
      fixes.push('Bone ' + bone.id + ' lost its missing parent ' + bone.parentId + '; attached at root level');
      bone.parentId = null;
    }
  }
  const hasCycle = () => {
    for (const bone of bones) {
      const visited = new Set([bone.id]);
      let cursor = bone.parentId;
      while (cursor != null) {
        if (visited.has(cursor)) return bone.id;
        visited.add(cursor);
        const parent = bones.find((b) => b.id === cursor);
        cursor = parent ? parent.parentId : null;
      }
    }
    return null;
  };
  let cyclic = hasCycle();
  while (cyclic) {
    const bone = bones.find((b) => b.id === cyclic);
    fixes.push('Broke parent cycle at ' + bone.id + '; attached at root level');
    bone.parentId = null;
    cyclic = hasCycle();
  }
  const scrub = (t, label) => {
    if (!t || typeof t !== 'object') return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    const out = { ...t };
    let touched = false;
    for (const key of ['x', 'y', 'rotation']) {
      if (typeof out[key] !== 'number' || !Number.isFinite(out[key])) { out[key] = 0; touched = true; }
    }
    for (const key of ['scaleX', 'scaleY']) {
      if (typeof out[key] !== 'number' || !Number.isFinite(out[key]) || out[key] === 0) { out[key] = 1; touched = true; }
    }
    if (touched) fixes.push('Reset non-finite transform on ' + label);
    return out;
  };
  for (const bone of bones) {
    bone.local = scrub(bone.local, 'bone ' + bone.id);
    if (!(typeof bone.length === 'number' && Number.isFinite(bone.length) && bone.length >= 0)) {
      bone.length = 80;
      fixes.push('Reset invalid length on bone ' + bone.id + ' to 80');
    }
  }
  for (const layer of layers) layer.local = scrub(layer.local, 'layer ' + layer.id);
  if (Array.isArray(project.bindings)) {
    const before = project.bindings.length;
    project.bindings = project.bindings.filter((binding) => {
      const layerId = binding.layerId || binding.imageId;
      const ok = layerId && layerIds.has(layerId) && boneIds.has(binding.boneId);
      if (!ok) fixes.push('Dropped dangling binding for ' + (layerId || '(missing layer)'));
      if (ok && binding.bindOffset) binding.bindOffset = scrub(binding.bindOffset, 'binding of ' + layerId);
      return ok;
    });
    void before;
  }
  for (const layer of layers) {
    const binding = (project.bindings || []).find((b) => (b.layerId || b.imageId) === layer.id);
    if (!binding && layer.boundBoneId) {
      fixes.push('Cleared missing binding reference on layer ' + layer.id);
      layer.boundBoneId = null;
    }
    if (binding && layer.boundBoneId !== binding.boneId) {
      layer.boundBoneId = binding.boneId;
      fixes.push('Reconciled boundBoneId on layer ' + layer.id);
    }
  }
  for (const clip of project.animations || []) {
    if (!Array.isArray(clip.tracks)) { clip.tracks = []; fixes.push('Rebuilt missing tracks array on clip ' + clip.id); continue; }
    const kept = [];
    for (const track of clip.tracks) {
      if (!boneIds.has(track.targetId) && !layerIds.has(track.targetId)) {
        fixes.push('Dropped track ' + track.id + ' with missing target ' + track.targetId);
        continue;
      }
      const keys = (Array.isArray(track.keyframes) ? track.keyframes : []).filter((k) => Number.isInteger(k.frame) && k.frame >= 0);
      if (keys.length !== (track.keyframes || []).length) fixes.push('Dropped invalid keyframes on track ' + track.id);
      keys.sort((a, b) => a.frame - b.frame);
      track.keyframes = keys;
      kept.push(track);
    }
    clip.tracks = kept;
  }
  const rig = await openRig(project);
  const clean = rig.toProject();
  return { fixes, project: clean };
}

export async function assertHealthy(project, label) {
  const report = await validateRig(project, { strict: false });
  if (!report.ok) {
    throw fail(
      label + ' produced an invalid rig: ' + report.errors.slice(0, 3).join('; '),
      'Run auto_fix_rig on the file, or get the full report with validate_rig.',
      'auto_fix_rig'
    );
  }
  return report;
}
