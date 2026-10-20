// Native editable-project export and Chrome-rendered hand-turn review sheets.
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { nativeRender } from '../mcp/native-renderer.mjs';
const root = fileURLToPath(new URL('..', import.meta.url)), require = createRequire(import.meta.url);
const { build } = require('esbuild');
const result = await build({ stdin: { contents: "export {createReferenceGirlDemo} from './src/engine/referenceGirlDemo'; export * from './src/engine/handRig'; export {Rig} from './src/engine/Rig';", resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = { exports: {} }; new Function('module', 'exports', 'require', result.outputFiles[0].text)(compiled, compiled.exports, require);
const { createReferenceGirlDemo, getHandRigs, Rig } = compiled.exports;
const rig = createReferenceGirlDemo(), project = rig.toProject(), hands = getHandRigs(rig);
await writeFile(`${root}/reference-girl-v5-hand-turns.json`, JSON.stringify(project, null, 2));
console.log({ bones: rig.bones.size, layers: rig.layers.size, hands: hands.map(h => ({ name: h.name, rollDial: h.turn.driverBoneId, digits: h.fingers.length })) });
const save = async (name, source, options) => { const result = await nativeRender(source, options); await writeFile(`${root}/${name}.png`, Buffer.from(result.data, 'base64')); console.log(name); };
const frames = [0, 12, 24, 36, 48, 60, 72, 84, 96];
for (const [index, center] of [[0, { x: 352, y: 258 }], [1, { x: 433, y: 122 }]]) {
  const preview = structuredClone(project); preview.dynamics.enabled = false;
  preview.timeline.activeAnimationId = preview.animations.find(clip => clip.name.startsWith('Hand turns')).id;
  preview.canvas = { width: 160, height: 160, background: '#f3f0e8' };
  preview.stage2d = { ...preview.stage2d, enabled: true, zoom: 4, cameraX: (80 - center.x) * 4, cameraY: (80 - center.y) * 4, projection: 'orthographic' };
  const side = index ? 'right' : 'left';
  await save(`reference-girl-v5-${side}-turns`, preview, { kind: 'timeline', frames, columns: 5, cellWidth: 320 });
  const sample = new Rig(preview), id = 'hand-turn-bone-proof';
  preview.layers.push({ id, name: 'Hand joints · preview only', type: 'vector', local: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, visible: true, locked: true, opacity: 1, zIndex: 1000, boundBoneId: null, shapes: [] });
  const track = { id: 'hand-turn-bone-proof-keys', targetId: id, property: 'shapes', keyframes: [] };
  for (const frame of frames) {
    sample.applyAnimation(sample.timeline.activeAnimationId, frame);
    track.keyframes.push({ id: `overlay-${frame}`, frame, easing: 'step', value: hands[index].fingers.flatMap(f => f.boneIds.flatMap(id => {
      const bone = sample.bones.get(id), tip = sample.getBoneEnd(id);
      return [{ id: `${id}-line`, kind: 'path', d: `M ${bone.world.x} ${bone.world.y} L ${tip.x} ${tip.y}`, stroke: '#138e9a', strokeWidth: .27, fill: 'none' }, { id: `${id}-joint`, kind: 'ellipse', x: bone.world.x, y: bone.world.y, radiusX: .38, radiusY: .38, fill: '#fff', stroke: '#138e9a', strokeWidth: .16 }];
    })) });
  }
  preview.animations.find(clip => clip.id === preview.timeline.activeAnimationId).tracks.push(track);
  await save(`reference-girl-v5-${side}-rig`, preview, { kind: 'timeline', frames: [0, 24, 48, 72, 96], columns: 5, cellWidth: 320 });
}
await save('reference-girl-v5-front', project, { kind: 'frame', frame: 0 });
