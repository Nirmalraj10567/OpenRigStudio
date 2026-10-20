import { drawing, T } from './drawing.mjs';
import { actor } from './actor.mjs';
import { showroom, PALETTES } from './showroom.mjs';
import { animateActor } from './motion.mjs';

export const RECIPES = {
  showroom_stumble: ['walk', 'inspect', 'stumble'],
  showroom_greeting: ['walk', 'wave'],
  showroom_idle: ['idle'],
};
export const recipeProperties = {
  preset: { type: 'string', enum: Object.keys(RECIPES), default: 'showroom_stumble' },
  palette: { type: 'string', enum: Object.keys(PALETTES), default: 'pastel' },
  character: { type: 'string', enum: ['suited', 'casual'], default: 'suited' },
  camera: { type: 'string', enum: ['follow', 'wide'], default: 'follow' },
  duration: { type: 'number', minimum: 3, maximum: 15, default: 5 },
  fps: { type: 'integer', enum: [24, 30, 60], default: 24 },
  name: { type: 'string', maxLength: 120 },
};

export function normalizeRecipe(input = {}) {
  const recipe = { preset: 'showroom_stumble', palette: 'pastel', character: 'suited', camera: 'follow', duration: 5, fps: 24 };
  for (const [key, spec] of Object.entries(recipeProperties)) {
    if (input[key] === undefined) continue;
    const value = input[key];
    if (spec.enum && !spec.enum.includes(value)) throw new Error(`${key} must be one of: ${spec.enum.join(', ')}`);
    if (key === 'duration' && (!Number.isFinite(value) || value < 3 || value > 15)) throw new Error('duration must be between 3 and 15 seconds');
    if (key === 'name' && (typeof value !== 'string' || !value.trim() || value.length > 120)) throw new Error('name must contain 1–120 characters');
    recipe[key] = key === 'name' ? value.trim() : value;
  }
  if (Math.abs(recipe.duration*recipe.fps-Math.round(recipe.duration*recipe.fps)) > 1e-8) throw new Error('duration × fps must be a whole number of frames');
  recipe.name ??= recipe.preset.replaceAll('_', ' ');
  return recipe;
}

export function compileScene(input = {}) {
  const recipe = normalizeRecipe(input);
  const endFrame = Math.round(recipe.duration*recipe.fps);
  const project = {
    schemaVersion: 1, id: `scene-kit-${recipe.preset}`, name: recipe.name,
    canvas: { width: 1280, height: 720, background: PALETTES[recipe.palette].floor },
    bones: [], layers: [], bindings: [], animations: [],
    dynamics: { enabled: false, startFrame: 0, endFrame, fps: recipe.fps, substeps: 4, gravityX: 0, gravityY: 420, windX: 0, windY: 0, windNoise: 0, seed: 1, bones: [], bodies: [], meshes: [], emitters: [] },
    stage2d: { enabled: false, cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0, projection: 'perspective' }, cameraView: 'preview',
    metadata: { createdBy: 'character-studio-mcp', sceneKitVersion: '1', sceneRecipe: JSON.stringify(recipe), reference: 'user-supplied furniture showroom screenshot' },
  };
  const d = drawing(project);
  d.bone('shot', null, 0);
  showroom(d, PALETTES[recipe.palette]);
  d.layer('actor-contact-shadow', [d.ellipse(0,0,44,7,'#d3cdd0'),d.ellipse(0,0,27,4,'#beb8bc')], 400, 'shot', T());
  const rig = actor(d, recipe.character, recipe.character === 'casual' ? '#69888a' : '#827265');
  d.layer('landing-dust', [d.ellipse(-18,0,20,8,'#ede3e5'), d.ellipse(18,3,23,6,'#ede3e5')], 495);
  const motion = animateActor(project, { ...recipe, actions: RECIPES[recipe.preset] });
  project.metadata.sceneJoints = JSON.stringify(rig.joints);
  project.metadata.reachClamps = String(motion.reachClamps);
  return project;
}
