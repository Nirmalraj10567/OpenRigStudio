import { defineMcpPlugin } from '../plugin-api.mjs';
import { ARCHETYPES, RIG_PRESETS, STYLES, buildCharacter, listDesignPresets } from '../design/recipes.mjs';
import { loadProjectJson, openRig, rigOutline, saveProjectJson, withRig } from '../design/engine.mjs';
import { assertHealthy, autoFixRig, validateRig } from '../design/rigcheck.mjs';
import { applyBindOps, applyClipOps, applyKeyframeOps, applyLayerOps, applyRigOps } from '../design/patch.mjs';
import { BUDGET, asArray, asBool, asColor, asEnum, asNumber, asObject, asString, errorResult, fail, leanResult, roundDeep } from '../design/results.mjs';

const pathProp = (def) => ({ type: 'string', description: 'Project path.', ...(def ? { default: def } : {}) });
const detailProp = { type: 'string', enum: ['summary', 'full'], default: 'summary', description: 'summary is compact; full is the complete document.' };

async function run(fn) {
  try {
    return await fn();
  } catch (error) {
    return errorResult(error);
  }
}

const needPath = (input) => asString(input.path, 'path');

const SELECTS = ['counts', 'bones', 'layers', 'bindings', 'clips', 'tracks', 'timeline', 'canvas', 'dynamics'];

function projectRows(project, select, fields, clipRef) {
  const pick = (row) => {
    if (!fields || !fields.length) return row;
    const out = {};
    for (const f of fields) if (row[f] !== undefined) out[f] = row[f];
    return out;
  };
  switch (select) {
    case 'counts':
      return [{ bones: (project.bones || []).length, layers: (project.layers || []).length, bindings: (project.bindings || []).length, clips: (project.animations || []).length }];
    case 'bones':
      return (project.bones || []).map((b) => pick({ id: b.id, name: b.name, parent: b.parentId != null ? b.parentId : null, length: b.length, local: roundDeep(b.local) }));
    case 'layers':
      return (project.layers || []).map((l) => pick({ id: l.id, name: l.name, type: l.type, bone: l.boundBoneId != null ? l.boundBoneId : null, z: l.zIndex, visible: l.visible, opacity: l.opacity, shapes: Array.isArray(l.shapes) ? l.shapes.length : 0 }));
    case 'bindings':
      return (project.bindings || []).map((b) => pick({ layer: b.layerId || b.imageId, bone: b.boneId, offset: roundDeep(b.bindOffset) }));
    case 'clips':
      return (project.animations || []).map((c) => pick({ id: c.id, name: c.name, fps: c.fps, frames: [c.startFrame != null ? c.startFrame : 0, c.endFrame != null ? c.endFrame : 0], tracks: (c.tracks || []).length }));
    case 'tracks': {
      const clips = project.animations || [];
      const clip = clipRef ? clips.find((c) => c.id === clipRef || c.name === clipRef) : clips.find((c) => c.id === (project.timeline || {}).activeAnimationId) || clips[0];
      if (!clip) throw fail('The project has no animation clips', 'Create one with edit_animation.', 'edit_animation');
      return (clip.tracks || []).map((t) => pick({
        id: t.id, target: t.targetId, property: t.property, keys: (t.keyframes || []).length,
        first: (t.keyframes || [])[0] ? t.keyframes[0].frame : null,
        last: (t.keyframes || []).length ? t.keyframes[t.keyframes.length - 1].frame : null,
      }));
    }
    case 'timeline':
      return [project.timeline || {}];
    case 'canvas':
      return [project.canvas || {}];
    case 'dynamics': {
      const d = project.dynamics || {};
      return [{ enabled: d.enabled === true, gravity: [d.gravityX || 0, d.gravityY || 0], fps: d.fps, bodies: (d.bodies || []).length, meshes: (d.meshes || []).length, emitters: (d.emitters || []).length }];
    }
    default:
      throw fail('Unknown select: ' + select, 'Allowed: ' + SELECTS.join(', '));
  }
}

export default defineMcpPlugin({
  id: 'design-character-tools',
  name: 'Design MCP character tools',
  version: '1.0.0',
  tools: [
    {
      name: 'list_design_presets',
      description: 'Archetypes, rigs, palettes, styles. Start here.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => run(async () => leanResult(listDesignPresets())),
    },
    {
      name: 'design_character',
      description: 'Generate a fully rigged vector character from scalar options: archetype, proportions, palette and style. Returns bone ids and bindings.',
      inputSchema: {
        type: 'object',
        properties: {
          path: pathProp('designed-character.json'),
          name: { type: 'string', description: 'Character name.' },
          archetype: { type: 'string', enum: ARCHETYPES, default: 'humanoid' },
          facing: { type: 'string', enum: ['front', 'profile'], default: 'front', description: 'front or side-view head.' },
          rigPreset: { type: 'string', enum: RIG_PRESETS, default: 'full', description: 'full or starter6 limbs. Bust and quadruped ignore it.' },
          height: { type: 'number', description: 'Height in px, 80-900.' },
          headRatio: { type: 'number', description: 'Head fraction of height, 0.12-0.45.' },
          limbLength: { type: 'number', description: 'Limb multiplier, 0.5-1.8.' },
          shoulderWidth: { type: 'number', description: 'Width multiplier, 0.5-1.8.' },
          palette: { type: 'string', description: 'Named palette; see list_design_presets.' },
          bodyColor: { type: 'string', description: 'Hex body override.' },
          accentColor: { type: 'string', description: 'Hex accent override.' },
          skinColor: { type: 'string', description: 'Hex skin override.' },
          shirtColor: { type: 'string', description: 'Hex shirt override.' },
          pantsColor: { type: 'string', description: 'Hex pants override.' },
          shoesColor: { type: 'string', description: 'Hex shoes override.' },
          hairColor: { type: 'string', description: 'Hex hair override.' },
          style: { type: 'string', enum: STYLES, default: 'toon' },
          overwrite: { type: 'boolean', default: false },
        },
        required: [],
      },
      execute: (args, context) => run(async () => {
        const input = asObject(args);
        const path = asString(input.path, 'path', { def: 'designed-character.json' });
        const resolved = context.resolvePath(path);
        if (!input.overwrite && await context.exists(resolved)) {
          throw fail('Refusing to overwrite ' + resolved, 'Pass overwrite:true to replace it, or choose another path.');
        }
        const colors = {};
        if (input.bodyColor !== undefined) colors.body = asColor(input.bodyColor, 'bodyColor');
        if (input.accentColor !== undefined) colors.accent = asColor(input.accentColor, 'accentColor');
        if (input.skinColor !== undefined) colors.skin = asColor(input.skinColor, 'skinColor');
        if (input.shirtColor !== undefined) colors.shirt = asColor(input.shirtColor, 'shirtColor');
        if (input.pantsColor !== undefined) colors.pants = asColor(input.pantsColor, 'pantsColor');
        if (input.shoesColor !== undefined) colors.shoes = asColor(input.shoesColor, 'shoesColor');
        if (input.hairColor !== undefined) colors.hair = asColor(input.hairColor, 'hairColor');
        const project = buildCharacter({
          name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 100) : undefined,
          archetype: input.archetype,
          facing: input.facing,
          rigPreset: input.rigPreset,
          height: input.height,
          headRatio: input.headRatio,
          limbLength: input.limbLength,
          shoulderWidth: input.shoulderWidth,
          palette: input.palette,
          paletteColors: colors,
          style: input.style,
        });
        await assertHealthy(project, 'design_character');
        const saved = await saveProjectJson(context, path, project);
        return leanResult({ created: saved, outline: rigOutline(project) });
      }),
    },
    {
      name: 'get_rig',
      description: 'Bone tree, bindings and clips. No artwork or keyframes.',
      inputSchema: { type: 'object', properties: { path: pathProp(), detail: detailProp }, required: ['path'] },
      execute: (args, context) => run(async () => {
        const input = asObject(args);
        const { project } = await loadProjectJson(context, needPath(input));
        const detail = asEnum(input.detail, ['summary', 'full'], 'detail', { def: 'summary' });
        if (detail === 'full') return leanResult(rigOutline(project), { pretty: true });
        return leanResult(rigOutline(project));
      }),
    },
    {
      name: 'query_project',
      description: 'Read one section of a project with paging and column projection. Never returns the whole document.',
      inputSchema: {
        type: 'object',
        properties: {
          path: pathProp(),
          select: { type: 'string', enum: SELECTS, description: 'Section to read: ' + SELECTS.join(', ') + '.' },
          clip: { type: 'string', description: 'Clip id for tracks.' },
          fields: { type: 'array', items: { type: 'string' }, description: 'Columns to keep.', maxItems: 40 },
          limit: { type: 'number', description: 'Rows per page.', default: 50 },
          cursor: { type: 'number', description: 'Start row.', default: 0 },
        },
        required: ['path', 'select'],
      },
      execute: (args, context) => run(async () => {
        const input = asObject(args);
        const { project } = await loadProjectJson(context, needPath(input));
        const select = asEnum(input.select, SELECTS, 'select');
        const fields = input.fields === undefined ? null : asArray(input.fields, 'fields', { maxLength: 40 });
        const rows = projectRows(project, select, fields, input.clip);
        const limit = Math.min(200, Math.max(1, Math.round(asNumber(input.limit, 'limit', { def: 50 }))));
        const cursor = Math.max(0, Math.round(asNumber(input.cursor, 'cursor', { def: 0 })));
        const page = rows.slice(cursor, cursor + limit);
        return leanResult({
          select, total: rows.length, cursor, next: cursor + page.length < rows.length ? cursor + page.length : null, rows: page,
        });
      }),
    },
    {
      name: 'get_keyframes',
      description: 'Read keyframes of one track inside a frame window. Values are rounded; use edit_keyframes to change them.',
      inputSchema: {
        type: 'object',
        properties: {
          path: pathProp(),
          clip: { type: 'string', description: 'Clip id; defaults to the active clip.' },
          track: { type: 'object', description: '{id} or {target, property}.' },
          from: { type: 'number', description: 'First frame.' },
          to: { type: 'number', description: 'Last frame.' },
        },
        required: ['path', 'track'],
      },
      execute: (args, context) => run(async () => {
        const input = asObject(args);
        const { path, project } = await loadProjectJson(context, needPath(input));
        const clips = project.animations || [];
        const clip = input.clip
          ? clips.find((c) => c.id === input.clip || c.name === input.clip)
          : clips.find((c) => c.id === (project.timeline || {}).activeAnimationId) || clips[0];
        if (!clip) throw fail('Clip not found', 'List clips with query_project select=clips.', 'query_project');
        const ref = asObject(input.track);
        const track = ref.id
          ? (clip.tracks || []).find((t) => t.id === ref.id)
          : (clip.tracks || []).find((t) => t.targetId === ref.target && t.property === ref.property);
        if (!track) throw fail('Track not found in clip ' + clip.id, 'List tracks with query_project select=tracks.', 'query_project');
        const from = input.from != null ? asNumber(input.from, 'from') : 0;
        const to = input.to != null ? asNumber(input.to, 'to') : (clip.endFrame != null ? clip.endFrame : 100000);
        const keys = (track.keyframes || [])
          .filter((k) => k.frame >= from && k.frame <= to)
          .map((k) => ({ frame: k.frame, value: roundDeep(k.value), ...(k.easing && k.easing !== 'linear' ? { easing: k.easing } : {}) }));
        return leanResult({
          path, clip: clip.id, track: { id: track.id, target: track.targetId, property: track.property },
          from, to, total: (track.keyframes || []).length, keys,
        });
      }),
    },
    {
      name: 'inspect_project',
      description: 'Rig outline plus dynamics, stage and canvas.',
      inputSchema: { type: 'object', properties: { path: pathProp(), detail: detailProp }, required: ['path'] },
      execute: (args, context) => run(async () => {
        const input = asObject(args);
        const { path, project } = await loadProjectJson(context, needPath(input));
        const outline = rigOutline(project);
        const dynamics = project.dynamics || {};
        const stage = project.stage2d || {};
        const summary = {
          ...outline,
          dynamics: { enabled: dynamics.enabled === true, gravity: [dynamics.gravityX || 0, dynamics.gravityY || 0], bodies: (dynamics.bodies || []).length },
          stage2d: { enabled: stage.enabled === true, zoom: stage.zoom != null ? stage.zoom : 1 },
        };
        const detail = asEnum(input.detail, ['summary', 'full'], 'detail', { def: 'summary' });
        if (detail === 'full') {
          summary.bindings = (project.bindings || []).map((b) => ({ layer: b.layerId || b.imageId, bone: b.boneId, offset: roundDeep(b.bindOffset) }));
          return leanResult(summary, { pretty: true });
        }
        return leanResult(summary);
      }),
    },
    {
      name: 'edit_rig',
      description: 'Surgical bone edits: add, remove, rename, reparent, resize or move bones. The engine keeps the rig valid.',
      inputSchema: {
        type: 'object',
        properties: {
          path: pathProp(),
          ops: { type: 'array', description: 'Max 50 ops: addBone{parent,name,length,at,id}, removeBone{bone}, renameBone{bone,name}, reparentBone{bone,parent,keepPose}, setLength{bone,length}, setTransform{bone,to}. Bones resolve by id or name.', maxItems: 50 },
        },
        required: ['path', 'ops'],
      },
      execute: (args, context) => run(async () => {
        const input = asObject(args);
        const ops = asArray(input.ops, 'ops', { maxLength: BUDGET.ops, minLength: 1 });
        const saved = await withRig(context, needPath(input), async (rig) => applyRigOps(rig, ops));
        return leanResult({ updated: saved.path, changed: saved.outcome, counts: rigOutline(saved.project).counts });
      }),
    },
    {
      name: 'edit_layers',
      description: 'Surgical layer edits: add layers or shapes, tweak shapes, move, hide, rename or reorder. Max 200 shapes per call.',
      inputSchema: {
        type: 'object',
        properties: {
          path: pathProp(),
          ops: { type: 'array', description: 'Max 50 ops: addLayer{name,shapes,bone,id,at}, addShapes{layer,shapes}, updateShape{layer,shape,patch}, removeShape{layer,shape}, removeLayer{layer}, setTransform{layer,to}, setVisible{layer,visible}, renameLayer{layer,name}, reorder{layer,z}. New layers start at x0 y0, so absolute shape coordinates land where drawn.', maxItems: 50 },
        },
        required: ['path', 'ops'],
      },
      execute: (args, context) => run(async () => {
        const input = asObject(args);
        const ops = asArray(input.ops, 'ops', { maxLength: BUDGET.ops, minLength: 1 });
        const { nativeEngine } = await import('../design/engine.mjs');
        const engine = await nativeEngine();
        const saved = await withRig(context, needPath(input), async (rig) => applyLayerOps(rig, ops, engine));
        return leanResult({ updated: saved.path, changed: saved.outcome, counts: rigOutline(saved.project).counts });
      }),
    },
    {
      name: 'bind_layers',
      description: 'Fix artwork-to-bone attachments: bind, unbind, adjust offsets or depth order. Binds preserve the visible pose.',
      inputSchema: {
        type: 'object',
        properties: {
          path: pathProp(),
          ops: { type: 'array', description: 'Max 50 ops: bind{layer,bone}, unbind{layer}, setOffset{layer,to}, setZ{layer,z}.', maxItems: 50 },
        },
        required: ['path', 'ops'],
      },
      execute: (args, context) => run(async () => {
        const input = asObject(args);
        const ops = asArray(input.ops, 'ops', { maxLength: BUDGET.ops, minLength: 1 });
        const saved = await withRig(context, needPath(input), async (rig) => applyBindOps(rig, ops));
        return leanResult({ updated: saved.path, changed: saved.outcome, counts: rigOutline(saved.project).counts });
      }),
    },
    {
      name: 'edit_keyframes',
      description: 'Delta keyframe edits: upsert or remove individual keys, clear or shift tracks. Sends only changed keys, never whole channels.',
      inputSchema: {
        type: 'object',
        properties: {
          path: pathProp(),
          ops: { type: 'array', description: 'Max 50 ops: upsert{clip,track,frame,value,easing,keys[]}, remove{clip,track,frame,frames[]}, clearTrack{clip,track}, removeTrack{clip,track}, shift{clip,track,by,from,to}. track is {id} or {target,property}; clip defaults to active. Max 500 keys per call.', maxItems: 50 },
        },
        required: ['path', 'ops'],
      },
      execute: (args, context) => run(async () => {
        const input = asObject(args);
        const ops = asArray(input.ops, 'ops', { maxLength: BUDGET.ops, minLength: 1 });
        const { nativeEngine } = await import('../design/engine.mjs');
        const engine = await nativeEngine();
        const saved = await withRig(context, needPath(input), async (rig) => applyKeyframeOps(rig, ops, engine));
        return leanResult({ updated: saved.path, changed: saved.outcome, counts: rigOutline(saved.project).counts });
      }),
    },
    {
      name: 'edit_animation',
      description: 'Clip management: create, rename, remove, retime or activate animation clips.',
      inputSchema: {
        type: 'object',
        properties: {
          path: pathProp(),
          ops: { type: 'array', description: 'Max 50 ops: createClip{name,fps,endFrame,id,makeActive}, renameClip{clip,name}, removeClip{clip}, retime{clip,fps,endFrame}, setActive{clip}.', maxItems: 50 },
        },
        required: ['path', 'ops'],
      },
      execute: (args, context) => run(async () => {
        const input = asObject(args);
        const ops = asArray(input.ops, 'ops', { maxLength: BUDGET.ops, minLength: 1 });
        const { nativeEngine } = await import('../design/engine.mjs');
        const engine = await nativeEngine();
        const saved = await withRig(context, needPath(input), async (rig) => applyClipOps(rig, ops, engine));
        return leanResult({ updated: saved.path, changed: saved.outcome, counts: rigOutline(saved.project).counts });
      }),
    },
    {
      name: 'edit_scene',
      description: 'Scalar scene edits: name, canvas size and background, timeline range, camera view, stage2d and gravity.',
      inputSchema: {
        type: 'object',
        properties: {
          path: pathProp(),
          name: { type: 'string', description: 'Project name.' },
          background: { type: 'string', description: 'Canvas background hex.' },
          canvas: { type: 'object', description: '{width, height, background}.' },
          timeline: { type: 'object', description: '{fps, startFrame, endFrame}. fps syncs to every clip.' },
          cameraView: { type: 'string', description: 'preview, switch or camera id.' },
          stage2d: { type: 'object', description: '{enabled, cameraX, cameraY, zoom, yaw, pitch, roll}.' },
          dynamics: { type: 'object', description: '{enabled, gravityX, gravityY}.' },
        },
        required: ['path'],
      },
      execute: (args, context) => run(async () => {
        const input = asObject(args);
        const { project } = await loadProjectJson(context, needPath(input));
        const touched = [];
        if (input.name !== undefined) {
          project.name = asString(input.name, 'name', { maxLength: 100 });
          touched.push('name');
        }
        const hex = (v, f) => asColor(v, f);
        if (input.background !== undefined) {
          project.canvas = project.canvas || {};
          project.canvas.background = hex(input.background, 'background');
          touched.push('background');
        }
        if (input.canvas !== undefined) {
          const canvas = asObject(input.canvas);
          project.canvas = project.canvas || { width: 800, height: 520, background: '#111d28' };
          if (canvas.width !== undefined) project.canvas.width = Math.round(asNumber(canvas.width, 'canvas.width', { min: 320, max: 4096 }));
          if (canvas.height !== undefined) project.canvas.height = Math.round(asNumber(canvas.height, 'canvas.height', { min: 240, max: 4096 }));
          if (canvas.background !== undefined) project.canvas.background = hex(canvas.background, 'canvas.background');
          touched.push('canvas');
        }
        if (input.timeline !== undefined) {
          const timeline = asObject(input.timeline);
          project.timeline = project.timeline || {};
          if (timeline.fps !== undefined) {
            const fps = asNumber(timeline.fps, 'timeline.fps', { min: 1, max: 120 });
            project.timeline.fps = fps;
            for (const clip of project.animations || []) clip.fps = fps;
          }
          if (timeline.startFrame !== undefined) {
            const start = Math.max(0, Math.round(asNumber(timeline.startFrame, 'timeline.startFrame', { min: 0, max: 100000 })));
            project.timeline.startFrame = start;
          }
          if (timeline.endFrame !== undefined) {
            const end = Math.round(asNumber(timeline.endFrame, 'timeline.endFrame', { min: 1, max: 100000 }));
            if (end <= (project.timeline.startFrame || 0)) throw fail('timeline.endFrame must be after startFrame', 'Received ' + end + '.');
            project.timeline.endFrame = end;
          }
          touched.push('timeline');
        }
        if (input.cameraView !== undefined) {
          const view = asString(input.cameraView, 'cameraView');
          const cameras = Array.isArray(project.cameras) ? project.cameras.map((c) => c.id) : [];
          if (!['preview', 'switch', ...cameras].includes(view)) throw fail('Unknown cameraView: ' + view, 'Use preview, switch, or one of: ' + cameras.join(', '));
          project.cameraView = view;
          touched.push('cameraView');
        }
        if (input.stage2d !== undefined) {
          const stage = asObject(input.stage2d);
          project.stage2d = project.stage2d || {};
          if (stage.enabled !== undefined) project.stage2d.enabled = asBool(stage.enabled, 'stage2d.enabled');
          for (const key of ['cameraX', 'cameraY', 'zoom', 'yaw', 'pitch', 'roll']) {
            if (stage[key] !== undefined) project.stage2d[key] = asNumber(stage[key], 'stage2d.' + key, { min: -100000, max: 100000 });
          }
          touched.push('stage2d');
        }
        if (input.dynamics !== undefined) {
          const dynamics = asObject(input.dynamics);
          project.dynamics = project.dynamics || {};
          if (dynamics.enabled !== undefined) project.dynamics.enabled = asBool(dynamics.enabled, 'dynamics.enabled');
          if (dynamics.gravityX !== undefined) project.dynamics.gravityX = asNumber(dynamics.gravityX, 'dynamics.gravityX', { min: -10000, max: 10000 });
          if (dynamics.gravityY !== undefined) project.dynamics.gravityY = asNumber(dynamics.gravityY, 'dynamics.gravityY', { min: -10000, max: 10000 });
          touched.push('dynamics');
        }
        if (!touched.length) throw fail('edit_scene changed nothing', 'Pass at least one of name, background, canvas, timeline, cameraView, stage2d, dynamics.');
        const rig = await openRig(project);
        const saved = await saveProjectJson(context, needPath(input), rig.toProject());
        return leanResult({ updated: saved, touched });
      }),
    },
    {
      name: 'validate_rig',
      description: 'Native-engine rig check: cycles, dangling refs, poses, joint gaps.',
      inputSchema: {
        type: 'object',
        properties: { path: pathProp(), strict: { type: 'boolean', default: false, description: 'Fail on detached joints.' } },
        required: ['path'],
      },
      execute: (args, context) => run(async () => {
        const input = asObject(args);
        const { path, project } = await loadProjectJson(context, needPath(input));
        const report = await validateRig(project, { strict: asBool(input.strict, 'strict') });
        return leanResult({ path, ...report });
      }),
    },
    {
      name: 'auto_fix_rig',
      description: 'Repair duplicate ids, bad parents, cycles, dangling refs. Lists every fix.',
      inputSchema: { type: 'object', properties: { path: pathProp() }, required: ['path'] },
      execute: (args, context) => run(async () => {
        const input = asObject(args);
        const { project } = await loadProjectJson(context, needPath(input));
        const { fixes, project: clean } = await autoFixRig(project);
        const saved = await saveProjectJson(context, needPath(input), clean);
        const recheck = await validateRig(clean, { strict: false });
        return leanResult({ updated: saved, fixes, ok: recheck.ok, remainingErrors: recheck.errors });
      }),
    },
  ],
});
