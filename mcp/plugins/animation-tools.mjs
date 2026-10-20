import { readFile, writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments } from '../plugin-api.mjs';
import { createGardenCafeScene } from '../garden-cafe-scene.mjs';

async function load(context, path) {
  const project = JSON.parse(await readFile(context.resolvePath(path), 'utf8'));
  if (!project || !Array.isArray(project.layers) || !Array.isArray(project.bones)) throw new Error('Expected a Character Studio project');
  return project;
}
async function save(context, path, project) {
  const output = context.resolvePath(path);
  await writeFile(output, `${JSON.stringify(project, null, 2)}\n`);
  return output;
}
function summary(project) {
  return { name: project.name, canvas: project.canvas, timeline: project.timeline, layers: project.layers.length, bones: project.bones.length, bindings: project.bindings.length, animations: (project.animations ?? []).map(clip => ({ id: clip.id, name: clip.name, startFrame: clip.startFrame, endFrame: clip.endFrame, tracks: clip.tracks.length, keys: clip.tracks.reduce((count, track) => count + track.keyframes.length, 0) })), storyboard: project.metadata?.storyboard };
}
const pathProperty = { type: 'string', description: 'Project JSON path relative to the configured workspace.' };
const properties = ['transform', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity', 'visible'];
const easings = ['linear', 'smooth', 'step', 'ease-in', 'ease-out', 'ease-in-out'];
const validTransform = value => value && ['x', 'y', 'rotation', 'scaleX', 'scaleY'].every(key => Number.isFinite(value[key]));

export default defineMcpPlugin({
  id: 'character-studio-animation-tools', version: '1.0.0',
  tools: [
    {
      name: 'animate_character',
      description: 'Animate an existing create_character_scene rig with the garden_to_coffee_shop story: garden/background props, café building and entry, walking, ordering from a barista, cup handoff, and drinking. Saves a separate editable 24-second project with native bone/keyframe animation.',
      inputSchema: { type: 'object', properties: { sourcePath: pathProperty, path: pathProperty, story: { type: 'string', enum: ['garden_to_coffee_shop'] }, name: { type: 'string' }, fps: { type: 'integer', minimum: 12, maximum: 60, default: 24 }, overwrite: { type: 'boolean', default: false } }, required: ['sourcePath', 'path', 'story'] },
      async execute(args, context) {
        const input = objectArguments(args);
        if (input.story !== 'garden_to_coffee_shop') throw new Error('Supported story: garden_to_coffee_shop');
        const sourcePath = context.resolvePath(input.sourcePath), output = context.resolvePath(input.path);
        if (sourcePath === output) throw new Error('Choose a different output path to preserve the source character');
        if (await context.exists(output) && input.overwrite !== true) throw new Error('Output already exists; pass overwrite: true to replace it');
        if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim())) throw new Error('name must be a non-empty string');
        const source = await load(context, input.sourcePath);
        const project = createGardenCafeScene(source, { name: input.name, fps: input.fps });
        await save(context, input.path, project);
        return jsonToolResult({ created: output, sourcePath, ...summary(project) });
      },
    },
    {
      name: 'inspect_animation', description: 'List animation clips, targets, channel names and keyframe ranges in a Character Studio project.',
      inputSchema: { type: 'object', properties: { path: pathProperty }, required: ['path'] },
      async execute(args, context) {
        const project = await load(context, objectArguments(args).path);
        return jsonToolResult({ ...summary(project), clips: (project.animations ?? []).map(clip => ({ id: clip.id, tracks: clip.tracks.map(track => ({ targetId: track.targetId, property: track.property, keys: track.keyframes.length, firstFrame: track.keyframes[0]?.frame, lastFrame: track.keyframes.at(-1)?.frame })) })) });
      },
    },
    {
      name: 'set_animation_keyframes', description: 'Replace one native animation channel for a bone or layer. Values use stage pixels and rotation radians. Changes stay editable in the timeline.',
      inputSchema: { type: 'object', properties: { path: pathProperty, clipId: { type: 'string' }, targetId: { type: 'string' }, property: { type: 'string', enum: properties }, keyframes: { type: 'array', minItems: 1, maxItems: 10001, items: { type: 'object', properties: { frame: { type: 'integer', minimum: 0 }, value: {}, easing: { type: 'string', enum: easings } }, required: ['frame', 'value'] } } }, required: ['path', 'clipId', 'targetId', 'property', 'keyframes'] },
      async execute(args, context) {
        const input = objectArguments(args), project = await load(context, input.path);
        const clip = project.animations?.find(item => item.id === input.clipId);
        const target = [...project.bones, ...project.layers].find(item => item.id === input.targetId);
        if (!clip || !target) throw new Error('Animation clip or target not found');
        if (!properties.includes(input.property)) throw new Error('Unsupported animation property');
        if (!Array.isArray(input.keyframes) || !input.keyframes.length || input.keyframes.length > 10001) throw new Error('Supply 1–10001 keyframes');
        if (['visible', 'opacity'].includes(input.property) && !project.layers.some(layer => layer.id === input.targetId)) throw new Error('Visibility and opacity require a layer target');
        const frames = new Set();
        for (const key of input.keyframes) {
          if (!key || !Number.isInteger(key.frame) || key.frame < clip.startFrame || key.frame > clip.endFrame || frames.has(key.frame)) throw new Error('Keyframes must have unique integer frames inside the clip range');
          frames.add(key.frame);
          if (key.easing !== undefined && !easings.includes(key.easing)) throw new Error('Unsupported easing');
          const valid = input.property === 'transform' ? validTransform(key.value) : input.property === 'visible' ? typeof key.value === 'boolean' : Number.isFinite(key.value);
          if (!valid) throw new Error(`Invalid ${input.property} keyframe value`);
          if (input.property === 'opacity' && (key.value < 0 || key.value > 1)) throw new Error('Opacity must be 0–1');
        }
        const id = `mcp-${input.targetId}-${input.property}`;
        clip.tracks = clip.tracks.filter(track => !(track.targetId === input.targetId && track.property === input.property));
        clip.tracks.push({ id, targetId: input.targetId, property: input.property, keyframes: [...input.keyframes].sort((a, b) => a.frame - b.frame).map((key, i) => ({ ...key, id: `${id}-${i}`, easing: key.easing ?? 'linear' })) });
        clip.setupPose ??= {}; clip.setupPose[target.id] ??= { local: structuredClone(target.local), ...(target.type ? { visible: target.visible, opacity: target.opacity } : {}) };
        if (project.dynamics) delete project.dynamics.cache;
        return jsonToolResult({ updated: await save(context, input.path, project), trackId: id, keys: input.keyframes.length });
      },
    },
    {
      name: 'add_scene_prop', description: 'Add an editable vector prop/background layer to a project, optionally bound to a bone. Existing IDs are rejected.',
      inputSchema: { type: 'object', properties: { path: pathProperty, id: { type: 'string' }, name: { type: 'string' }, shapes: { type: 'array', minItems: 1, items: { type: 'object' } }, transform: { type: 'object' }, zIndex: { type: 'number' }, boneId: { type: 'string' } }, required: ['path', 'id', 'name', 'shapes'] },
      async execute(args, context) {
        const input = objectArguments(args), project = await load(context, input.path);
        if (typeof input.id !== 'string' || !input.id || typeof input.name !== 'string' || !input.name) throw new Error('Supply a prop id and name');
        if ([...project.layers, ...project.bones].some(item => item.id === input.id)) throw new Error('Prop ID already exists');
        if (!Array.isArray(input.shapes) || !input.shapes.length || input.shapes.length > 2000 || input.shapes.some(shape => !shape || !['rect', 'ellipse', 'path', 'polygon'].includes(shape.kind))) throw new Error('Supply 1–2000 vector shapes');
        if (input.boneId && !project.bones.some(bone => bone.id === input.boneId)) throw new Error('Attachment bone not found');
        const local = input.transform ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
        if (!validTransform(local) || (input.zIndex !== undefined && !Number.isFinite(input.zIndex))) throw new Error('Invalid prop transform or layer order');
        project.layers.push({ id: input.id, name: input.name, type: 'vector', local, shapes: input.shapes.map((shape, i) => ({ ...shape, id: `${input.id}-shape-${i}` })), zIndex: input.zIndex ?? project.layers.length, opacity: 1, visible: true, locked: false, boundBoneId: input.boneId ?? null });
        if (input.boneId) project.bindings.push({ layerId: input.id, imageId: input.id, boneId: input.boneId, bindOffset: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
        return jsonToolResult({ updated: await save(context, input.path, project), propId: input.id });
      },
    },
    {
      name: 'rig_and_animate_walk',
      description: 'Automatically rigs and animates a walking animation for any bipedal character in Character Studio. Solves alternating foot planting, hip bounce, torso counter-rotation, and arm swings.',
      inputSchema: {
        type: 'object',
        properties: {
          path: pathProperty,
          clipId: { type: 'string', default: 'walk-animation' },
          clipName: { type: 'string', default: 'Walking Animation' },
          mode: { type: 'string', enum: ['in_place', 'travel'], default: 'travel' },
          durationSeconds: { type: 'number', minimum: 1, maximum: 60, default: 5 },
          stepRate: { type: 'number', minimum: 0.5, maximum: 4.0, default: 2.0 },
          strideLength: { type: 'number', default: 35.0 },
          liftHeight: { type: 'number', default: 15.0 },
          rootBoneId: { type: 'string' },
          torsoBoneId: { type: 'string' },
          headBoneId: { type: 'string' },
          armRightBoneId: { type: 'string' },
          armLeftBoneId: { type: 'string' },
          legRightBoneId: { type: 'string' },
          legLeftBoneId: { type: 'string' },
          fps: { type: 'integer', default: 24 }
        },
        required: ['path']
      },
      async execute(args, context) {
        const input = objectArguments(args);
        const project = await load(context, input.path);
        const fps = input.fps ?? project.timeline?.fps ?? 24;
        const duration = input.durationSeconds ?? 5;
        const totalFrames = Math.round(duration * fps);
        const clipId = input.clipId ?? 'walk-animation';
        const clipName = input.clipName ?? 'Walking Animation';
        const mode = input.mode ?? 'travel';
        const stepRate = input.stepRate ?? 2.0; // 2 steps per second = 1 cycle per second
        const stride = input.strideLength ?? 35.0;
        const lift = input.liftHeight ?? 15.0;

        // Auto-detect bones if not supplied
        const findBone = (id, pattern, fallback) => {
          if (id && project.bones.some(b => b.id === id)) return project.bones.find(b => b.id === id);
          const found = project.bones.find(b => pattern.test(b.name.toLowerCase()) || pattern.test(b.id.toLowerCase()));
          return found ?? fallback;
        };

        const rootBone = findBone(input.rootBoneId, /root|hip|pelvis/, project.bones[0]);
        if (!rootBone) throw new Error('Root bone not found in project');

        const torsoBone = findBone(input.torsoBoneId, /torso|chest|body|spine/, project.bones.find(b => b.parentId === rootBone.id));
        const headBone = findBone(input.headBoneId, /head|skull/, project.bones.find(b => b.parentId === torsoBone?.id));
        const armRBone = findBone(input.armRightBoneId, /(arm|shoulder|hand).*(r|right)|(r|right).*(arm|shoulder|hand)/, null);
        const armLBone = findBone(input.armLeftBoneId, /(arm|shoulder|hand).*(l|left)|(l|left).*(arm|shoulder|hand)/, null);
        const legRBone = findBone(input.legRightBoneId, /(leg|foot|thigh).*(r|right)|(r|right).*(leg|foot|thigh)/, null);
        const legLBone = findBone(input.legLeftBoneId, /(leg|foot|thigh).*(l|left)|(l|left).*(leg|foot|thigh)/, null);

        const cycle = 2.0 / stepRate; // seconds per cycle
        const tracks = [];

        const rootInit = structuredClone(rootBone.local);
        const rootKeys = [];
        const torsoKeys = torsoBone ? [] : null;
        const headKeys = headBone ? [] : null;
        const armRKeys = armRBone ? [] : null;
        const armLKeys = armLBone ? [] : null;
        const legRKeys = legRBone ? [] : null;
        const legLKeys = legLBone ? [] : null;

        const totalTravel = mode === 'travel' ? (stride * 2 * (duration / cycle)) : 0;

        for (let frame = 0; frame <= totalFrames; frame++) {
          const t = frame / fps;
          const progress = totalFrames > 0 ? frame / totalFrames : 0;
          const phase = (t / cycle) % 1.0;
          const ang = phase * 2.0 * Math.PI;

          // Root position
          const forward = rootInit.x + totalTravel * progress;
          const bounce = Math.cos(phase * 4.0 * Math.PI) * (lift * 0.3);
          const sway = Math.sin(ang) * 0.02;

          rootKeys.push({
            id: `walk-root-${frame}`,
            frame,
            value: { ...rootInit, x: forward, y: rootInit.y + bounce, rotation: rootInit.rotation + sway },
            easing: 'linear'
          });

          if (torsoBone) {
            const rot = -Math.sin(ang) * 0.035;
            torsoKeys.push({
              id: `walk-torso-${frame}`,
              frame,
              value: { ...torsoBone.local, rotation: torsoBone.local.rotation + rot },
              easing: 'linear'
            });
          }

          if (headBone) {
            const rot = Math.sin(ang) * 0.02 - Math.cos(phase * 4.0 * Math.PI) * 0.015;
            headKeys.push({
              id: `walk-head-${frame}`,
              frame,
              value: { ...headBone.local, rotation: headBone.local.rotation + rot },
              easing: 'linear'
            });
          }

          if (legRBone) {
            let dx, dy, rot;
            if (phase < 0.5) {
              const sub = phase / 0.5;
              dx = stride * (0.5 - sub);
              dy = 0;
              rot = 0.28 - 0.56 * sub;
            } else {
              const sub = (phase - 0.5) / 0.5;
              dx = stride * (-0.5 + sub);
              dy = -Math.sin(sub * Math.PI) * lift;
              rot = -0.28 + 0.56 * sub;
            }
            legRKeys.push({
              id: `walk-legr-${frame}`,
              frame,
              value: { ...legRBone.local, x: legRBone.local.x + dx, y: legRBone.local.y + dy, rotation: legRBone.local.rotation + rot },
              easing: 'linear'
            });
          }

          if (legLBone) {
            const oppPhase = (phase + 0.5) % 1.0;
            let dx, dy, rot;
            if (oppPhase < 0.5) {
              const sub = oppPhase / 0.5;
              dx = stride * (0.5 - sub);
              dy = 0;
              rot = 0.28 - 0.56 * sub;
            } else {
              const sub = (oppPhase - 0.5) / 0.5;
              dx = stride * (-0.5 + sub);
              dy = -Math.sin(sub * Math.PI) * lift;
              rot = -0.28 + 0.56 * sub;
            }
            legLKeys.push({
              id: `walk-legl-${frame}`,
              frame,
              value: { ...legLBone.local, x: legLBone.local.x + dx, y: legLBone.local.y + dy, rotation: legLBone.local.rotation + rot },
              easing: 'linear'
            });
          }

          if (armRBone) {
            const rot = -Math.cos(ang) * 0.35;
            armRKeys.push({
              id: `walk-armr-${frame}`,
              frame,
              value: { ...armRBone.local, rotation: armRBone.local.rotation + rot },
              easing: 'linear'
            });
          }

          if (armLBone) {
            const rot = Math.cos(ang) * 0.35;
            armLKeys.push({
              id: `walk-arml-${frame}`,
              frame,
              value: { ...armLBone.local, rotation: armLBone.local.rotation + rot },
              easing: 'linear'
            });
          }
        }

        tracks.push({ id: `track-${rootBone.id}-transform`, targetId: rootBone.id, property: 'transform', keyframes: rootKeys });
        if (torsoBone && torsoKeys) tracks.push({ id: `track-${torsoBone.id}-transform`, targetId: torsoBone.id, property: 'transform', keyframes: torsoKeys });
        if (headBone && headKeys) tracks.push({ id: `track-${headBone.id}-transform`, targetId: headBone.id, property: 'transform', keyframes: headKeys });
        if (legRBone && legRKeys) tracks.push({ id: `track-${legRBone.id}-transform`, targetId: legRBone.id, property: 'transform', keyframes: legRKeys });
        if (legLBone && legLKeys) tracks.push({ id: `track-${legLBone.id}-transform`, targetId: legLBone.id, property: 'transform', keyframes: legLKeys });
        if (armRBone && armRKeys) tracks.push({ id: `track-${armRBone.id}-transform`, targetId: armRBone.id, property: 'transform', keyframes: armRKeys });
        if (armLBone && armLKeys) tracks.push({ id: `track-${armLBone.id}-transform`, targetId: armLBone.id, property: 'transform', keyframes: armLKeys });

        project.animations = (project.animations ?? []).filter(c => c.id !== clipId);
        project.animations.push({
          id: clipId,
          name: clipName,
          fps,
          startFrame: 0,
          endFrame: totalFrames,
          loopMode: 'loop',
          tracks,
          setupPose: {}
        });

        project.timeline = {
          ...project.timeline,
          fps,
          startFrame: 0,
          endFrame: totalFrames,
          activeAnimationId: clipId,
          loop: true
        };

        const output = await save(context, input.path, project);
        return jsonToolResult({
          updated: output,
          clipId,
          clipName,
          mode,
          duration,
          tracks: tracks.length,
          mappedBones: {
            root: rootBone?.id,
            torso: torsoBone?.id,
            head: headBone?.id,
            legRight: legRBone?.id,
            legLeft: legLBone?.id,
            armRight: armRBone?.id,
            armLeft: armLBone?.id
          }
        });
      }
    }
  ],
});
