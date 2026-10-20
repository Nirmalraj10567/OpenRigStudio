import { readFile, writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments } from '../plugin-api.mjs';
import { nativeEngine, openRig } from '../design/engine.mjs';

const topLevelFields = new Set([
  'name', 'canvas', 'bones', 'layers', 'bindings', 'animations', 'smartActions', 'actionLibrary',
  'controllers', 'controllerInstances', 'lipSyncTracks', 'stage2d', 'environment', 'cameras',
  'characterViews', 'motionPaths', 'facialProfiles', 'headCreators', 'constraints', 'dynamics',
  'cameraProduction', 'groups', 'smartActionFolders', 'cameraView', 'audio', 'timeline', 'metadata',
]);
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

async function load(context, requestedPath) {
  const path = context.resolvePath(requestedPath);
  let project;
  try { project = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { throw new Error(`Could not read project ${path}: ${error instanceof Error ? error.message : String(error)}`); }
  if (!project || typeof project !== 'object' || Array.isArray(project)) throw new Error('Project file must contain a JSON object');
  return { path, project };
}

async function save(context, requestedPath, project) {
  const path = context.resolvePath(requestedPath);
  await writeFile(path, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
  return path;
}

function pointer(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('Patch paths must be JSON pointers below a top-level project field');
  const parts = path.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (!parts[0] || !topLevelFields.has(parts[0]) || parts.some(part => forbiddenKeys.has(part))) throw new Error(`Patch path is not allowed: ${path}`);
  return parts;
}

function parentAt(root, parts, create = false) {
  let current = root;
  for (const part of parts.slice(0, -1)) {
    if (current == null || (typeof current !== 'object' && !Array.isArray(current))) throw new Error(`Patch parent is not an object: /${parts.join('/')}`);
    if (!(part in current)) {
      if (!create) throw new Error(`Patch path does not exist: /${parts.join('/')}`);
      current[part] = {};
    }
    current = current[part];
  }
  return { parent: current, key: parts.at(-1) };
}

function applyPatch(project, operation) {
  if (!operation || typeof operation !== 'object') throw new Error('Each patch operation must be an object');
  const parts = pointer(operation.path);
  const { parent, key } = parentAt(project, parts, operation.op === 'set' || operation.op === 'merge');
  if (parent == null || typeof parent !== 'object') throw new Error(`Patch parent is not writable: ${operation.path}`);
  if (operation.op === 'set') parent[key] = structuredClone(operation.value);
  else if (operation.op === 'merge') {
    if (!operation.value || typeof operation.value !== 'object' || Array.isArray(operation.value)) throw new Error(`Merge value must be an object: ${operation.path}`);
    const current = parent[key] ?? {};
    if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error(`Merge target must be an object: ${operation.path}`);
    parent[key] = { ...current, ...structuredClone(operation.value) };
  } else if (operation.op === 'remove') {
    if (Array.isArray(parent)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= parent.length) throw new Error(`Array item does not exist: ${operation.path}`);
      parent.splice(index, 1);
    } else if (!(key in parent)) throw new Error(`Patch path does not exist: ${operation.path}`);
    else delete parent[key];
  } else throw new Error(`Unsupported project patch operation: ${operation.op}`);
}

function fullSummary(path, project) {
  const arrays = key => Array.isArray(project[key]) ? project[key] : [];
  return {
    path,
    name: project.name ?? 'Untitled Character',
    schemaVersion: project.schemaVersion ?? null,
    canvas: project.canvas ?? null,
    counts: {
      layers: arrays('layers').length, bones: arrays('bones').length, bindings: arrays('bindings').length,
      groups: arrays('groups').length, animations: arrays('animations').length, cameras: arrays('cameras').length,
      constraints: arrays('constraints').length, characterViews: arrays('characterViews').length,
      facialProfiles: arrays('facialProfiles').length, controllers: arrays('controllers').length,
      controllerInstances: arrays('controllerInstances').length, motionPaths: arrays('motionPaths').length,
      lipSyncTracks: arrays('lipSyncTracks').length,
    },
    features: {
      environment: Boolean(project.environment), stage2d: Boolean(project.stage2d), dynamics: Boolean(project.dynamics?.enabled),
      cameraProduction: Boolean(project.cameraProduction), audio: Boolean(project.audio), smartActions: arrays('smartActions').length > 0,
      meshes: arrays('layers').filter(layer => layer.mesh).length > 0,
    },
    timeline: project.timeline ?? null,
  };
}

const featureCatalog = {
  project: ['inspect_project', 'read_project', 'write_project', 'inspect_project_full', 'patch_project', 'validate_project'],
  design: ['list_design_presets', 'design_character', 'get_rig', 'query_project', 'edit_rig', 'edit_layers', 'bind_layers', 'edit_keyframes', 'edit_animation', 'edit_scene', 'validate_rig', 'auto_fix_rig'],
  animation: ['animate_character', 'inspect_animation', 'set_animation_keyframes', 'rig_and_animate_walk', 'add_scene_prop'],
  scenes: ['scene_catalog', 'compose_scene', 'validate_scene', 'create_tom_jerry_car_race', 'recreate_furniture_showroom_animation', 'animate_exact_reference_plate'],
  physicsAndMedia: ['create_physics_ball_scene', 'update_physics_settings', 'preview_project_frame', 'preview_project_timeline', 'render_project_video'],
};

export default defineMcpPlugin({
  id: 'character-studio-full-project-tools',
  version: '1.0.0',
  tools: [
    {
      name: 'feature_catalog',
      description: 'List the complete MCP feature surface for Character Studio and the tools used for each domain.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      async execute() { return jsonToolResult({ server: 'character-studio-mcp', features: featureCatalog, patchOperations: ['set', 'merge', 'remove'], patchScope: [...topLevelFields] }); },
    },
    {
      name: 'inspect_project_full',
      description: 'Inspect every persisted Character Studio feature family without returning the full project document.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
      async execute(args, context) {
        const { path, project } = await load(context, objectArguments(args).path);
        const rig = await openRig(project);
        return jsonToolResult({ ...fullSummary(path, rig.toProject()), normalized: true });
      },
    },
    {
      name: 'patch_project',
      description: 'Apply atomic set, merge, or remove JSON-pointer patches to any persisted project feature, including environment, camera, constraints, dynamics, controllers, facial, views, meshes, and timeline data. The native rig engine validates before saving.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          operations: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'object', properties: { op: { type: 'string', enum: ['set', 'merge', 'remove'] }, path: { type: 'string' }, value: {} }, required: ['op', 'path'] } },
        },
        required: ['path', 'operations'], additionalProperties: false,
      },
      async execute(args, context) {
        const input = objectArguments(args);
        if (!Array.isArray(input.operations) || !input.operations.length || input.operations.length > 500) throw new Error('Supply 1–500 patch operations');
        const loaded = await load(context, input.path);
        const draft = structuredClone(loaded.project);
        for (const operation of input.operations) applyPatch(draft, operation);
        const rig = await openRig(draft);
        const normalized = rig.toProject();
        const saved = await save(context, input.path, normalized);
        return jsonToolResult({ updated: saved, operations: input.operations.length, summary: fullSummary(saved, normalized) });
      },
    },
    {
      name: 'validate_project',
      description: 'Load a project through the native Character Studio engine and verify normalized feature data, finite SVG output, and stable persistence without changing the source file.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
      async execute(args, context) {
        const { path, project } = await load(context, objectArguments(args).path);
        const rig = await openRig(project);
        const engine = await nativeEngine();
        const svg = engine.projectToSVG(rig);
        if (/NaN|Infinity/.test(svg)) throw new Error('Native SVG output contains a non-finite value');
        const normalized = rig.toProject();
        return jsonToolResult({ ok: true, path, summary: fullSummary(path, normalized), svgBytes: Buffer.byteLength(svg), roundTripStable: JSON.stringify(normalized) === JSON.stringify(engine.Rig.fromJSON(JSON.stringify(normalized)).toProject()) });
      },
    },
  ],
});
