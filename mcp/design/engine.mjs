import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { fail, roundDeep } from './results.mjs';

let enginePromise;

export function nativeEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const { build } = await import('esbuild');
    const entry = [
      'export { Rig, createId } from ' + "'./src/engine/Rig';",
      'export { identity, compose, localToWorldPoint, worldToLocalPoint } from ' + "'./src/engine/math';",
      'export { upsertKeyframe, removeKeyframe, findTrack, sampleTrack } from ' + "'./src/engine/animation';",
      'export { projectToSVG } from ' + "'./src/engine/export';",
      'export { serializeProject } from ' + "'./src/engine/serialization';",
    ].join('\n');
    const { outputFiles } = await build({
      stdin: { contents: entry, resolveDir: fileURLToPath(new URL('../..', import.meta.url)) },
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      packages: 'external',
    });
    const compiled = { exports: {} };
    const factory = new Function('module', 'exports', 'require', outputFiles[0].text);
    factory(compiled, compiled.exports, createRequire(import.meta.url));
    return compiled.exports;
  })();
  return enginePromise;
}

export async function loadProjectJson(context, requestedPath) {
  const path = context.resolvePath(requestedPath);
  let project;
  try {
    project = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw fail(
      'Could not read project ' + path + ': ' + detail,
      'The project file must exist inside CHARACTER_STUDIO_WORKSPACE.',
      'Call design_character to create it, or list_design_presets for the available recipes.'
    );
  }
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw fail('Project file must contain a JSON object', 'The file is not a Character Studio project.');
  }
  return { path, project };
}

export async function saveProjectJson(context, requestedPath, project) {
  const path = context.resolvePath(requestedPath);
  await writeFile(path, JSON.stringify(project, null, 2) + '\n', 'utf8');
  return path;
}

export async function openRig(project) {
  const { Rig } = await nativeEngine();
  try {
    return new Rig(project);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw fail('Project could not be loaded by the rig engine: ' + detail, 'The project JSON is structurally invalid.');
  }
}

export async function withRig(context, requestedPath, mutate) {
  const loaded = await loadProjectJson(context, requestedPath);
  const rig = await openRig(loaded.project);
  const outcome = await mutate(rig, loaded.project);
  const next = rig.toProject();
  const saved = await saveProjectJson(context, requestedPath, next);
  return { path: saved, project: next, outcome };
}

const ROOT_KEY = '##root##';

export function rigOutline(project) {
  const bones = Array.isArray(project.bones) ? project.bones : [];
  const layers = Array.isArray(project.layers) ? project.layers : [];
  const bindings = Array.isArray(project.bindings) ? project.bindings : [];
  const animations = Array.isArray(project.animations) ? project.animations : [];
  const boneById = new Map(bones.map((bone) => [bone.id, bone]));
  const childrenOf = new Map();
  for (const bone of bones) {
    const key = bone.parentId == null ? ROOT_KEY : bone.parentId;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(bone.id);
  }
  const tree = [];
  const walk = (id, depth) => {
    const bone = boneById.get(id);
    if (!bone) return;
    tree.push({ id: bone.id, name: bone.name, parent: bone.parentId != null ? bone.parentId : null, length: roundDeep(bone.length), depth });
    for (const child of childrenOf.get(bone.id) || []) walk(child, depth + 1);
  };
  for (const root of childrenOf.get(ROOT_KEY) || []) walk(root, 0);
  const timeline = project.timeline || {};
  return {
    name: project.name || 'Untitled',
    canvas: project.canvas != null ? project.canvas : null,
    timeline: timeline.fps
      ? { fps: timeline.fps, startFrame: timeline.startFrame != null ? timeline.startFrame : 0, endFrame: timeline.endFrame != null ? timeline.endFrame : 0, active: timeline.activeAnimationId != null ? timeline.activeAnimationId : null }
      : null,
    counts: {
      bones: bones.length,
      layers: layers.length,
      bindings: bindings.length,
      unboundLayers: layers.filter((layer) => !layer.boundBoneId).length,
      clips: animations.length,
    },
    boneTree: tree,
    layers: layers.map((layer) => ({ id: layer.id, name: layer.name, type: layer.type, bone: layer.boundBoneId != null ? layer.boundBoneId : null, z: layer.zIndex })),
    clips: animations.map((clip) => ({
      id: clip.id,
      name: clip.name,
      fps: clip.fps,
      frames: [clip.startFrame != null ? clip.startFrame : 0, clip.endFrame != null ? clip.endFrame : 0],
      tracks: Array.isArray(clip.tracks) ? clip.tracks.length : 0,
    })),
  };
}
