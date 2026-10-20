import { readFile, writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments } from '../plugin-api.mjs';
import { createCharacterProject } from '../character-scene.mjs';

const number = (value, fallback, min = -Infinity, max = Infinity) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Numeric tool arguments must be finite numbers');
  return Math.max(min, Math.min(max, value));
};

const copy = value => JSON.parse(JSON.stringify(value));

async function loadProject(context, requestedPath) {
  const path = context.resolvePath(requestedPath);
  let project;
  try {
    project = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read project ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!project || typeof project !== 'object' || Array.isArray(project)) throw new Error('Project file must contain a JSON object');
  return { path, project };
}

async function writeProject(context, path, project) {
  const resolved = context.resolvePath(path);
  await writeFile(resolved, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
  return resolved;
}

function projectSummary(path, project) {
  const dynamics = project.dynamics && typeof project.dynamics === 'object' ? project.dynamics : {};
  const bodies = Array.isArray(dynamics.bodies) ? dynamics.bodies : [];
  return {
    path,
    name: project.name ?? 'Untitled Character',
    schemaVersion: project.schemaVersion ?? null,
    canvas: project.canvas ?? null,
    timeline: project.timeline ?? null,
    layers: Array.isArray(project.layers) ? project.layers.map(layer => ({ id: layer.id, name: layer.name, type: layer.type, visible: layer.visible, zIndex: layer.zIndex })) : [],
    bones: Array.isArray(project.bones) ? project.bones.map(bone => ({ id: bone.id, name: bone.name, parentId: bone.parentId, length: bone.length })) : [],
    bindings: Array.isArray(project.bindings) ? project.bindings.map(binding => ({ layerId: binding.layerId ?? binding.imageId, boneId: binding.boneId })) : [],
    dynamics: {
      enabled: dynamics.enabled === true,
      gravityX: dynamics.gravityX ?? 0,
      gravityY: dynamics.gravityY ?? 0,
      fps: dynamics.fps ?? project.timeline?.fps ?? 24,
      startFrame: dynamics.startFrame ?? 0,
      endFrame: dynamics.endFrame ?? project.timeline?.endFrame ?? 0,
      bodies: bodies.map(body => ({ id: body.id, name: body.name, targetId: body.targetId ?? null, shape: body.shape, motion: body.motion, x: body.x, y: body.y, radius: body.radius, width: body.width, height: body.height, mass: body.mass, restitution: body.restitution, friction: body.friction, enabled: body.enabled !== false })),
      meshes: Array.isArray(dynamics.meshes) ? dynamics.meshes.map(mesh => ({ id: mesh.id, layerId: mesh.layerId, mode: mesh.mode, enabled: mesh.enabled !== false })) : [],
      emitters: Array.isArray(dynamics.emitters) ? dynamics.emitters.map(emitter => ({ id: emitter.id, name: emitter.name, rate: emitter.rate, lifetime: emitter.lifetime })) : [],
    },
  };
}

function projectPathSchema(required = true) {
  return { type: 'object', properties: { path: { type: 'string', description: 'Project JSON path relative to CHARACTER_STUDIO_WORKSPACE.' } }, ...(required ? { required: ['path'] } : {}) };
}

export default defineMcpPlugin({
  id: 'character-studio-project-tools',
  name: 'Character Studio project tools',
  version: '1.0.0',
  tools: [
    {
      name: 'create_character_scene',
      description: 'Create a new editable vector character scene with a head, face, body, arms, legs, ground, and a six-bone starter rig.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Output JSON path relative to CHARACTER_STUDIO_WORKSPACE.', default: 'ai-character-scene.json' },
          name: { type: 'string', description: 'Character/project name.', default: 'AI Character' },
          bodyColor: { type: 'string', description: 'Six-digit hex body color.', default: '#63c7b2' },
          accentColor: { type: 'string', description: 'Six-digit hex accent color.', default: '#f1b866' },
          overwrite: { type: 'boolean', description: 'Replace an existing output file.', default: false },
        },
        required: [],
      },
      async execute(args, context) {
        const input = objectArguments(args);
        const path = typeof input.path === 'string' && input.path ? input.path : 'ai-character-scene.json';
        const resolved = context.resolvePath(path);
        if (!input.overwrite && await context.exists(resolved)) throw new Error(`Refusing to overwrite ${resolved}; pass overwrite: true`);
        const project = createCharacterProject(input);
        const savedPath = await writeProject(context, path, project);
        return jsonToolResult({ created: savedPath, summary: projectSummary(savedPath, project) });
      },
    },
    {
      name: 'inspect_project',
      description: 'Inspect a Character Studio project: layers, bones, timeline, dynamics settings, and physics bodies.',
      inputSchema: projectPathSchema(),
      async execute(args, context) {
        const { path, project } = await loadProject(context, objectArguments(args).path);
        return jsonToolResult(projectSummary(path, project));
      },
    },
    {
      name: 'read_project',
      description: 'Read the complete editable Character Studio project JSON for agent-side analysis or transformation.',
      inputSchema: projectPathSchema(),
      async execute(args, context) {
        const { path, project } = await loadProject(context, objectArguments(args).path);
        return jsonToolResult({ path, project });
      },
    },
    {
      name: 'create_physics_ball_scene',
      description: 'Create the editable falling/bouncing physics-ball example from the studio template, with optional gravity, bounce, FPS, and duration overrides.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Output JSON path relative to CHARACTER_STUDIO_WORKSPACE.', default: 'physics-ball-scene.json' },
          gravityY: { type: 'number', description: 'Downward acceleration in stage units per second squared.', default: 700 },
          restitution: { type: 'number', description: 'Bounce coefficient from 0 to 1.', default: 0.68 },
          friction: { type: 'number', description: 'Ground friction from 0 to 1.', default: 0.18 },
          fps: { type: 'number', description: 'Timeline and simulation FPS.', default: 30 },
          durationSeconds: { type: 'number', description: 'Rendered scene duration in seconds.', default: 6 },
          overwrite: { type: 'boolean', description: 'Replace an existing output file.', default: false },
        },
        required: [],
      },
      async execute(args, context) {
        const input = objectArguments(args);
        const path = typeof input.path === 'string' && input.path ? input.path : 'physics-ball-scene.json';
        const resolved = context.resolvePath(path);
        if (!input.overwrite && await context.exists(resolved)) throw new Error(`Refusing to overwrite ${resolved}; pass overwrite: true`);
        const template = await loadProject(context, 'physics-ball-scene.json');
        const project = copy(template.project);
        const gravityY = number(input.gravityY, project.dynamics?.gravityY ?? 700, -10000, 10000);
        const restitution = number(input.restitution, 0.68, 0, 1);
        const friction = number(input.friction, 0.18, 0, 1);
        const fps = number(input.fps, project.timeline?.fps ?? 30, 1, 120);
        const durationSeconds = number(input.durationSeconds, (project.timeline?.endFrame ?? 180) / fps, 0.1, 600);
        const endFrame = Math.max(1, Math.round(durationSeconds * fps));
        project.name = typeof input.name === 'string' && input.name ? input.name.slice(0, 100) : project.name;
        project.timeline = { ...project.timeline, fps, endFrame, currentFrame: 0, currentTime: 0 };
        project.dynamics = { ...project.dynamics, enabled: true, fps, endFrame, gravityY };
        project.dynamics.bodies = (project.dynamics.bodies ?? []).map(body => ({ ...body, restitution, friction }));
        const savedPath = await writeProject(context, path, project);
        return jsonToolResult({ created: savedPath, summary: projectSummary(savedPath, project) });
      },
    },
    {
      name: 'update_physics_settings',
      description: 'Tune gravity, timing, and a named physics body in an editable Character Studio project.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Project JSON path relative to CHARACTER_STUDIO_WORKSPACE.' },
          bodyId: { type: 'string', description: 'Optional physics body ID or name to update.' },
          gravityX: { type: 'number' },
          gravityY: { type: 'number' },
          fps: { type: 'number' },
          endFrame: { type: 'number' },
          restitution: { type: 'number', description: 'Body bounce coefficient from 0 to 1.' },
          friction: { type: 'number', description: 'Body friction from 0 to 1.' },
          mass: { type: 'number', description: 'Body mass.' },
        },
        required: ['path'],
      },
      async execute(args, context) {
        const input = objectArguments(args);
        const { project } = await loadProject(context, input.path);
        const dynamics = project.dynamics ?? (project.dynamics = { enabled: true, startFrame: 0, endFrame: project.timeline?.endFrame ?? 120, fps: project.timeline?.fps ?? 24, substeps: 4, gravityX: 0, gravityY: 420, windX: 0, windY: 0, windNoise: 0, seed: 1, bones: [], bodies: [], meshes: [], emitters: [] });
        if (input.gravityX !== undefined) dynamics.gravityX = number(input.gravityX, dynamics.gravityX ?? 0, -10000, 10000);
        if (input.gravityY !== undefined) dynamics.gravityY = number(input.gravityY, dynamics.gravityY ?? 420, -10000, 10000);
        if (input.fps !== undefined) dynamics.fps = number(input.fps, dynamics.fps ?? 24, 1, 120);
        if (input.endFrame !== undefined) dynamics.endFrame = Math.max(dynamics.startFrame ?? 0, Math.round(number(input.endFrame, dynamics.endFrame ?? 120, 0, 100000)));
        if (dynamics.fps && project.timeline) { project.timeline.fps = dynamics.fps; project.timeline.endFrame = dynamics.endFrame ?? project.timeline.endFrame; }
        const bodies = Array.isArray(dynamics.bodies) ? dynamics.bodies : (dynamics.bodies = []);
        if (input.bodyId !== undefined || input.restitution !== undefined || input.friction !== undefined || input.mass !== undefined) {
          const body = bodies.find(item => !input.bodyId || item.id === input.bodyId || item.name === input.bodyId);
          if (!body) throw new Error(`Physics body ${input.bodyId ?? '(any)'} was not found`);
          if (input.restitution !== undefined) body.restitution = number(input.restitution, body.restitution ?? 0.3, 0, 1);
          if (input.friction !== undefined) body.friction = number(input.friction, body.friction ?? 0.2, 0, 1);
          if (input.mass !== undefined) body.mass = number(input.mass, body.mass ?? 1, 0.001, 10000);
        }
        const savedPath = await writeProject(context, input.path, project);
        return jsonToolResult({ updated: savedPath, summary: projectSummary(savedPath, project) });
      },
    },
    {
      name: 'write_project',
      description: 'Write a complete editable Character Studio project JSON supplied by the agent.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, project: { type: 'object' } }, required: ['path', 'project'] },
      async execute(args, context) {
        const input = objectArguments(args);
        if (!input.project || typeof input.project !== 'object' || Array.isArray(input.project)) throw new Error('project must be a JSON object');
        const savedPath = await writeProject(context, input.path, input.project);
        return jsonToolResult({ written: savedPath, summary: projectSummary(savedPath, input.project) });
      },
    },
  ],
});
