import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({
  stdin: { contents: "export * from './src/engine/index'; export {useProject} from './src/state/projectStore'; export {playbackPosition} from './src/ui/useAudioPlayback';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, identity, VISEMES, sampleViseme, normalizeLipSyncCues, importRhubarbCues, generateEnergyCues,
  normalizeProjectAudio, createLipSyncDemo, advanceTimeline, projectToSVG, useProject, playbackPosition } = compiled.exports;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const cue = (id, start, end, viseme) => ({ id, start, end, viseme });
const audio = () => ({ id: 'voice', name: 'dialogue.wav', src: 'data:audio/wav;base64,AAAA', duration: 2,
  offsetSeconds: .5, volume: .8, muted: false, peaks: [0, .2, .5, 0] });
function mouth() {
  const rig = new Rig(), id = rig.createMouthSet('Dialogue');
  return { rig, id, track: rig.lipSyncTracks.find(t => t.id === id) };
}

test('cue timing is end-exclusive, seconds-based, with rest during gaps', () => {
  const cues = normalizeLipSyncCues([cue('2', .5, 1, 'D'), cue('1', .1, .5, 'A')]);
  assert.equal(sampleViseme(cues, 0), 'X'); assert.equal(sampleViseme(cues, .1), 'A');
  assert.equal(sampleViseme(cues, .499), 'A'); assert.equal(sampleViseme(cues, .5), 'D');
  assert.equal(sampleViseme(cues, 1), 'X'); assert.equal(sampleViseme(cues, NaN), 'X');
});

test('invalid and overlapping cue edits are rejected atomically', () => {
  const { rig, id, track } = mouth(); const valid = [cue('a', 0, 1, 'A')]; rig.setLipSyncCues(id, valid);
  for (const invalid of [
    [cue('a', 0, 1, 'A'), cue('b', .9, 2, 'B')], [cue('a', 0, 0, 'A')],
    [cue('a', -1, 1, 'A')], [cue('a', 0, Infinity, 'A')], [cue('a', 0, 1, 'Z')],
    [cue('a', 0, 1, 'A'), cue('a', 1, 2, 'B')],
  ]) { assert.equal(rig.setLipSyncCues(id, invalid), false); assert.deepEqual(track.cues, valid); }
});

test('nine generated mouths switch non-destructively and disabled track shows only rest', () => {
  const { rig, id, track } = mouth(); assert.equal(Object.keys(track.mapping).length, 9);
  rig.setLipSyncCues(id, VISEMES.map((v, i) => cue(v, i, i + 1, v)));
  const authored = [...rig.layers.values()].map(l => ({ visible: l.visible, opacity: l.opacity }));
  VISEMES.forEach((value, i) => {
    rig.setTimeline({ currentFrame: (i + .5) * 24, fps: 24 });
    for (const v of VISEMES) assert.equal(rig.getLayerOpacity(track.mapping[v]), v === value ? 1 : 0);
  });
  assert.deepEqual([...rig.layers.values()].map(l => ({ visible: l.visible, opacity: l.opacity })), authored);
  track.enabled = false;
  for (const v of VISEMES) assert.equal(rig.getLayerOpacity(track.mapping[v]), v === 'X' ? 1 : 0);
});

test('mouths bind to moving head and deleting head preserves artwork', () => {
  const rig = new Rig(); const head = rig.addBone(null, 'Head');
  const id = rig.createMouthSet('Head mouth', head, { x: 410, y: 260 }); const track = rig.lipSyncTracks.find(t => t.id === id);
  const layer = rig.layers.get(track.mapping.X); near(layer.world.x, 410); near(layer.world.y, 260);
  rig.bones.get(head).local.x += 35; rig.update(); near(layer.world.x, 445);
  rig.remove(head); near(layer.world.x, 445); assert.equal(layer.boundBoneId, null);
});

test('remapping artwork restores detached mouth; shared shapes allowed within one track only', () => {
  const { rig, id, track } = mouth(); const old = track.mapping.D;
  assert.ok(rig.setVisemeMapping(id, 'D', null)); assert.equal(rig.layers.get(old).visible, false);
  assert.ok(rig.setVisemeMapping(id, 'D', old)); assert.equal(rig.layers.get(old).visible, true);
  assert.ok(rig.setVisemeMapping(id, 'C', old));
  const other = rig.createMouthSet('Other'); assert.equal(rig.setVisemeMapping(other, 'D', old), false);
  rig.setLipSyncCues(id, [cue('d', 0, 1, 'D')]); rig.setTimeline({ currentFrame: 12 });
  rig.setVisemeMapping(id, 'D', null); assert.equal(rig.getLayerOpacity(track.mapping.X), 1);
});

test('Smart actions and meshes compose with mouth opacity without modifying base channels', () => {
  const { rig, id, track } = mouth(); const layer = rig.layers.get(track.mapping.D);
  rig.createMesh(layer.id, 2, 2);
  const driver = rig.addBone(null); rig.bones.get(driver).local = identity();
  const action = rig.createSmartAction('Fade mouth', driver, 0, 1);
  rig.beginSmartEdit(action, 1); layer.opacity = .4; rig.captureSmartKey(action, 1, [layer.id]); rig.endSmartEdit();
  rig.bones.get(driver).local.rotation = 1; rig.setLipSyncCues(id, [cue('d', 0, 1, 'D')]);
  rig.setTimeline({ currentFrame: 12 }); rig.update(); near(rig.getLayerOpacity(layer.id), .4); near(layer.opacity, 1);
  assert.ok(rig.getMeshVertices(layer.id).length);
  rig.setTimeline({ currentFrame: 48 }); near(rig.getLayerOpacity(layer.id), 0);
});

test('Rhubarb imports known mouth symbols with offset and rejects malformed input', () => {
  const cues = importRhubarbCues(JSON.stringify({ mouthCues: [{ start: 0, end: .5, value: 'A' }, { start: .5, end: 1, value: 'D' }] }), 2);
  near(cues[0].start, 2); near(cues[1].end, 3); assert.equal(cues[1].viseme, 'D');
  for (const json of ['{', '{}', '{"mouthCues":[{"start":0,"end":1,"value":"Z"}]}', '{"mouthCues":[{"start":1,"end":0,"value":"A"}]}']) assert.throws(() => importRhubarbCues(json));
});

test('amplitude drafting uses only rest/wide/open and silence never opens mouth', () => {
  const silent = generateEnergyCues([0, 0, 0], 1, 2); assert.equal(silent.length, 1); assert.equal(silent[0].viseme, 'X');
  near(silent[0].start, 2); near(silent[0].end, 3);
  const draft = generateEnergyCues([0, .2, .8, 0], .2);
  assert.deepEqual(draft.map(c => c.viseme), ['X', 'C', 'D', 'X']);
  assert.throws(() => generateEnergyCues([NaN], 1));
});

test('audio stays embedded and portable; invalid remote payloads are rejected', () => {
  assert.deepEqual(normalizeProjectAudio(audio()), audio());
  for (const bad of [{ ...audio(), src: 'https://example.com/voice.wav' }, { ...audio(), duration: -1 }, { ...audio(), peaks: [Infinity] }, { ...audio(), volume: 5 }]) assert.throws(() => normalizeProjectAudio(bad));
  const rig = createLipSyncDemo(); rig.audio = audio();
  const loaded = Rig.fromJSON(rig.toJSON()); assert.deepEqual(loaded.audio, rig.audio);
  assert.deepEqual(loaded.lipSyncTracks, rig.lipSyncTracks);
  for (let frame = 0; frame <= 120; frame++) {
    loaded.setTimeline({ currentFrame: frame });
    const visible = [...loaded.layers.values()].filter(l => Object.values(loaded.lipSyncTracks[0].mapping).includes(l.id) && loaded.getLayerOpacity(l.id) > 0);
    assert.equal(visible.length, 1);
  }
});

test('cue edits undo/redo and bad imported project does not replace current work', () => {
  const { rig, id } = mouth(); useProject.getState().replaceProject(rig.toProject(), false);
  useProject.getState().updateProject(r => r.setLipSyncCues(id, [cue('a', 0, 1, 'A')]));
  useProject.getState().undo(); assert.equal(useProject.getState().rig.lipSyncTracks[0].cues.length, 0);
  useProject.getState().redo(); assert.equal(useProject.getState().rig.lipSyncTracks[0].cues.length, 1);
  const before = useProject.getState().serialize(); const invalid = JSON.parse(before); invalid.audio = { ...audio(), src: 'bad' };
  assert.throws(() => useProject.getState().deserialize(JSON.stringify(invalid)));
  assert.equal(useProject.getState().serialize(), before);
});

test('timeline clocks handle nonzero start, looping and FPS consistently', () => {
  const timeline = { fps: 24, startFrame: 48, endFrame: 96, currentFrame: 60, currentTime: 2.5, isPlaying: true, loop: false, activeAnimationId: null };
  const advanced = advanceTimeline(timeline, .5); near(advanced.currentFrame, 72); near(advanced.currentTime, 3);
  assert.deepEqual(playbackPosition(3, timeline), { frame: 72, wrapped: false, stopped: false });
  assert.deepEqual(playbackPosition(4.5, timeline), { frame: 96, wrapped: false, stopped: true });
  assert.deepEqual(playbackPosition(4.5, { ...timeline, loop: true }), { frame: 60, wrapped: true, stopped: false });
});

test('SVG export reflects current mouth cue rather than every mouth at full opacity', () => {
  const { rig, id, track } = mouth(); rig.setLipSyncCues(id, [cue('d', 0, 1, 'D')]); rig.setTimeline({ currentFrame: 12 });
  const svg = projectToSVG(rig, false);
  assert.equal((svg.match(/opacity="1"/g) ?? []).length > 0, true);
  for (const value of VISEMES) assert.equal(rig.getLayerOpacity(track.mapping[value]), value === 'D' ? 1 : 0);
  assert.equal((svg.match(/<g transform="[^"]+" opacity="0">/g) ?? []).length, 8);
  const before = rig.toJSON(); projectToSVG(rig); assert.equal(rig.toJSON(), before);
});
