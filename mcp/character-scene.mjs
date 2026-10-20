// Portable project data: the Node MCP host does not need the browser runtime.
const transform = (x = 0, y = 0, rotation = 0) => ({ x, y, rotation, scaleX: 1, scaleY: 1 });
const ellipse = (id, x, y, radiusX, radiusY, fill, extra = {}) => ({ id, kind: 'ellipse', x, y, radiusX, radiusY, fill, ...extra });
const rect = (id, x, y, width, height, fill, extra = {}) => ({ id, kind: 'rect', x, y, width, height, fill, ...extra });

export function createCharacterProject(input) {
  const bodyColor = typeof input.bodyColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.bodyColor) ? input.bodyColor : '#63c7b2';
  const accentColor = typeof input.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.accentColor) ? input.accentColor : '#f1b866';
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 100) : 'AI Character';
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ai-character';
  const edge = { stroke: '#d5fff0', strokeWidth: 4 };
  const rootPose = transform(400, 318, -Math.PI / 2);
  // Joints are defined in stage coordinates and converted into root-local space.
  // Bones extend along +X; downward limbs therefore point at +PI/2 in world space.
  const joints = [
    { id: 'head-bone', name: 'Head', x: 400, y: 224, length: 72, rotation: -Math.PI / 2 },
    { id: 'left-arm-bone', name: 'Left Arm', x: 297, y: 270, length: 120, rotation: Math.PI / 2 },
    { id: 'right-arm-bone', name: 'Right Arm', x: 503, y: 270, length: 120, rotation: Math.PI / 2 },
    { id: 'left-leg-bone', name: 'Left Leg', x: 362, y: 348, length: 77, rotation: Math.PI / 2 },
    { id: 'right-leg-bone', name: 'Right Leg', x: 438, y: 348, length: 77, rotation: Math.PI / 2 },
  ];
  const bones = [
    { id: 'root', name: 'Root', length: 84, parentId: null, local: rootPose },
    ...joints.map(joint => ({
      id: joint.id, name: joint.name, length: joint.length, parentId: 'root',
      local: transform(-(joint.y - rootPose.y), joint.x - rootPose.x, joint.rotation - rootPose.rotation),
    })),
  ];
  const bindings = [], layers = [];
  function layer(id, name, shapes, boneId = null) {
    layers.push({ id, name, type: 'vector', local: transform(), visible: true, locked: !boneId, zIndex: layers.length, boundBoneId: boneId, opacity: 1, shapes });
    if (boneId) {
      const rotation = boneId === 'root' ? rootPose.rotation : joints.find(joint => joint.id === boneId).rotation;
      // Artwork uses joint-local, upright coordinates. Cancel only the rest
      // rotation so later bone motion rotates the part around its actual joint.
      bindings.push({ id: `binding-${id}`, layerId: id, imageId: id, boneId, bindOffset: transform(0, 0, -rotation) });
    }
  }
  layer('character-ground', 'Ground', [rect('ground', 0, 438, 800, 82, '#1d3441'), rect('ground-edge', 0, 438, 800, 4, '#8ae6d0')]);
  layer('character-shadow', 'Character shadow', [ellipse('shadow', 400, 438, 96, 12, '#000000', { opacity: 0.3 })]);
  layer('character-left-leg', 'Left leg', [rect('left-leg', -14, 0, 28, 80, '#426a82'), ellipse('left-shoe', -10, 77, 38, 13, accentColor)], 'left-leg-bone');
  layer('character-right-leg', 'Right leg', [rect('right-leg', -14, 0, 28, 80, '#426a82'), ellipse('right-shoe', 10, 77, 38, 13, accentColor)], 'right-leg-bone');
  layer('character-body', 'Body', [ellipse('torso', 0, 0, 104, 112, bodyColor, edge), ellipse('chest', 0, 12, 52, 40, accentColor, { opacity: 0.9 })], 'root');
  layer('character-left-arm', 'Left arm', [rect('left-arm', -15, 0, 30, 118, bodyColor, edge), ellipse('left-hand', 0, 120, 22, 17, accentColor)], 'left-arm-bone');
  layer('character-right-arm', 'Right arm', [rect('right-arm', -15, 0, 30, 118, bodyColor, edge), ellipse('right-hand', 0, 120, 22, 17, accentColor)], 'right-arm-bone');
  layer('character-head', 'Head', [ellipse('head', 0, -56, 96, 82, bodyColor, edge), ellipse('ear-left', -96, -56, 20, 30, accentColor), ellipse('ear-right', 96, -56, 20, 30, accentColor)], 'head-bone');
  layer('character-face', 'Face', [
    ellipse('left-eye', -35, -66, 16, 22, '#ffffff'), ellipse('right-eye', 35, -66, 16, 22, '#ffffff'),
    ellipse('left-pupil', -32, -62, 7, 11, '#162431'), ellipse('right-pupil', 38, -62, 7, 11, '#162431'),
    { id: 'smile', kind: 'path', d: 'M -35 -19 Q 0 11 35 -19', fill: 'none', stroke: '#162431', strokeWidth: 7 },
  ], 'head-bone');
  return {
    schemaVersion: 1, id: `project-${id}`, name,
    canvas: { width: 800, height: 520, background: '#111d28' },
    layers, bones, bindings, animations: [],
    dynamics: { enabled: false, startFrame: 0, endFrame: 120, fps: 24, substeps: 4, gravityX: 0, gravityY: 420, windX: 0, windY: 0, windNoise: 0, seed: 1, bones: [], bodies: [], meshes: [], emitters: [] },
    stage2d: { enabled: false, cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0, projection: 'perspective' },
    cameraView: 'preview',
    timeline: { currentFrame: 0, currentTime: 0, isPlaying: false, loop: true, fps: 24, startFrame: 0, endFrame: 120, activeAnimationId: null },
    metadata: { createdBy: 'character-studio-mcp', characterType: 'rigid-bound vector character' },
  };
}
