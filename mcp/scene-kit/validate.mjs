import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { LIMBS } from './actor.mjs';

let enginePromise;
/** Load the actual native evaluator, lazily, with no temporary bundle on disk. */
export function nativeEngine() {
  enginePromise ??= (async () => {
    const { build } = await import('esbuild');
    const { outputFiles } = await build({ stdin: {
      contents: "export { Rig } from './src/engine/Rig'; export { projectToSVG } from './src/engine/export'; export { localToWorldPoint } from './src/engine/math';",
      resolveDir: fileURLToPath(new URL('../..', import.meta.url)),
    }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
    const compiled = { exports: {} };
    new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
    return compiled.exports;
  })();
  return enginePromise;
}

export async function validateScene(project) {
  if (project.metadata?.sceneKitVersion !== '1') throw new Error('validate_scene requires a Scene Kit project (compose_scene or recreate_furniture_showroom_animation)');
  const errors = new Set();
  const fail = text => { if (errors.size < 20) errors.add(text); };
  const targets = [...project.bones, ...project.layers];
  const ids = new Set(targets.map(item => item.id));
  if (ids.size !== targets.length) fail('Duplicate bone/layer IDs');
  if (project.layers.some(layer => layer.type !== 'vector')) fail('Scene Kit artwork must be native vector layers');
  const bones = new Map(project.bones.map(item => [item.id,item]));
  for (const bone of project.bones) {
    const visited = new Set([bone.id]);
    let parentId = bone.parentId;
    while (parentId) {
      if (visited.has(parentId)) { fail(`Bone hierarchy cycle at ${bone.id}`); break; }
      visited.add(parentId);
      if (!bones.has(parentId)) { fail(`Missing parent ${parentId}`); break; }
      parentId = bones.get(parentId).parentId;
    }
  }
  for (const layer of project.layers) {
    const binding = project.bindings.find(item => item.layerId === layer.id);
    if (!binding || binding.boneId !== layer.boundBoneId || !bones.has(binding.boneId)) fail(`Invalid binding: ${layer.id}`);
  }
  const clip = project.animations.find(item => item.id === project.timeline.activeAnimationId);
  if (!clip) fail('Missing active animation');
  else {
    if (clip.endFrame !== project.timeline.endFrame || clip.fps !== project.timeline.fps) fail('Clip/timeline timing mismatch');
    for (const track of clip.tracks) {
      if (!ids.has(track.targetId)) fail(`Missing animation target ${track.targetId}`);
      if (track.keyframes.some((key,i,keys) => !Number.isFinite(key.frame) || key.frame < 0 || key.frame > clip.endFrame || (i>0 && keys[i-1].frame >= key.frame))) fail(`Invalid key times: ${track.id}`);
    }
  }
  const z = id => project.layers.find(layer => layer.id === id)?.zIndex;
  for (const id of ['actor-pants-waist', 'far-arm-hand', 'near-arm-hand', 'far-leg-shoe', 'near-leg-shoe']) {
    if (!project.layers.some(layer => layer.id === id)) fail(`Missing character artwork: ${id}`);
  }
  const depth = ['room-shell','display-islands','distant-furniture','bed-rear','bed-middle','bed-front','purple-sofa','actor-contact-shadow','actor-coat','foreground-lounge'];
  if (depth.some((id,i) => !Number.isFinite(z(id)) || i>0 && z(depth[i-1]) >= z(id))) fail('Incorrect background/character depth ordering');
  if (errors.size) return { ok: false, errors: [...errors], sampledFrames: 0 };
  const { Rig, projectToSVG, localToWorldPoint } = await nativeEngine();
  const rig = new Rig(project);
  const end = project.timeline.endFrame;
  if (!Number.isInteger(end) || end < 1 || end > 900) return { ok: false, errors: ['Timeline must have 1–900 frames'], sampledFrames: 0 };
  let maxJointGap = 0, samples = 0;
  const compare = (a,b,label) => {
    const gap = Math.hypot(a.x-b.x,a.y-b.y);
    if (!Number.isFinite(gap) || gap > .001) fail(`${label} disconnected`);
    maxJointGap = Math.max(maxJointGap,gap);
  };
  const actorPoints = [];
  // Include half-frames: key poses alone can conceal interpolation defects.
  for (let frame=0;frame<=end;frame+=.5) {
    rig.applyAnimation(clip.id,frame); samples++;
    for (const item of [...rig.bones.values(),...rig.layers.values()]) {
      if (!Object.values(item.world).every(Number.isFinite)) fail(`Non-finite world transform: ${item.id}`);
    }
    for (const limb of LIMBS) {
      for (const [parentSuffix,childSuffix,length] of [['upper','lower',limb.upper],['lower','tip',limb.lower]]) {
        const parent = rig.bones.get(`${limb.role}-${parentSuffix}`), child = rig.bones.get(`${limb.role}-${childSuffix}`);
        if (!parent || !child) { fail(`Missing ${limb.role} joint`); continue; }
        if (child.parentId !== parent.id || parent.length !== length) fail(`Invalid ${limb.role} chain`);
        compare(rig.getBoneEnd(parent.id),child.world,`${limb.role} ${childSuffix}`);
        const art = rig.layers.get(`${limb.role}-${parentSuffix}-art`);
        if (!art) { fail(`Missing ${limb.role} artwork`); continue; }
        compare(localToWorldPoint(art.world,{x:0,y:0}),parent.world,`${art.id} origin`);
        compare(localToWorldPoint(art.world,{x:length,y:0}),child.world,`${art.id} endpoint`);
      }
      const tip = rig.bones.get(`${limb.role}-tip`);
      const art = rig.layers.get(`${limb.role}-${limb.role.endsWith('leg')?'shoe':'hand'}`);
      if (!tip || !art) fail(`Missing ${limb.role} hand/foot`);
      else compare(art.world,tip.world,`${art.id} attachment`);
    }
    const head = rig.layers.get('actor-head');
    if (!head) fail('Missing head artwork');
    else for (const point of [{x:-48,y:-88},{x:40,y:10}]) actorPoints.push(localToWorldPoint(head.world,point));
    for (const limb of LIMBS) {
      const tip = rig.bones.get(`${limb.role}-tip`);
      if (tip) actorPoints.push(localToWorldPoint(tip.world,{x:28,y:14}));
    }
    if (frame % Math.max(1,Math.floor(end/6)) === 0 || frame === end) {
      if (/NaN|Infinity/.test(projectToSVG(rig))) fail(`Non-finite SVG at frame ${frame}`);
    }
  }
  if (actorPoints.some(p => p.x < 8 || p.x > project.canvas.width-8 || p.y < 8 || p.y > project.canvas.height-8)) fail('Character exceeds camera safe bounds');
  const last = projectToSVG(rig);
  rig.applyAnimation(clip.id,0); rig.applyAnimation(clip.id,end);
  if (projectToSVG(rig) !== last) fail('Animation seek is not deterministic');
  return { ok: errors.size === 0, errors: [...errors], sampledFrames: samples, maxJointGap: Number(maxJointGap.toFixed(6)), vectorLayers: project.layers.length, bones: project.bones.length };
}
