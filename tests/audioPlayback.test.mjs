import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({
  stdin: { contents: "export {useAudioPlayback} from './src/ui/useAudioPlayback'; export {useProject} from './src/state/projectStore';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
});
const require = createRequire(import.meta.url);
function harness(t, rejectPlay = false) {
  let now = 0, nextId = 1, cleanup;
  const frames = new Map(), instances = [], messages = [];
  const originals = new Map();
  const install = (key, value) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  class AudioMock {
    currentTime = 0; readyState = 1; paused = true; ended = false; plays = 0;
    src = ''; volume = 1; muted = false;
    constructor() { instances.push(this); }
    play() { this.plays++; if (rejectPlay) return Promise.reject(new Error('NotAllowedError')); this.paused = false; this.ended = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    load() {}
    removeAttribute(key) { if (key === 'src') this.src = ''; }
  }
  install('Audio', AudioMock);
  install('performance', { now: () => now });
  install('requestAnimationFrame', fn => { const id = nextId++; frames.set(id, fn); return id; });
  install('cancelAnimationFrame', id => frames.delete(id));
  const compiled = { exports: {} };
  new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, id => id === 'react'
    ? { useRef: current => ({ current }), useEffect: callback => { cleanup = callback(); } }
    : require(id));
  const { useProject, useAudioPlayback } = compiled.exports;
  const step = ms => { now += ms; const scheduled = [...frames.values()]; frames.clear(); scheduled.forEach(fn => fn(now)); };
  t.after(() => {
    cleanup?.();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const start = () => useAudioPlayback(message => messages.push(message));
  return { state: () => useProject.getState(), step, instances, messages, start };
}
function clip() {
  return { id: 'clip', name: 'voice.wav', src: 'data:audio/wav;base64,AAAA', duration: 2,
    offsetSeconds: 2, volume: .75, muted: false, peaks: [.2, .3] };
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('audio-aware transport uses one media element, audible clock, offset and trailing timeline', t => {
  const h = harness(t); h.state().updateProject(r => { r.audio = clip(); });
  h.state().setTimeline({ startFrame: 24, endFrame: 120, fps: 24, loop: false }); h.state().setFrame(24);
  h.start(); h.state().play(); const audio = h.instances[0];
  h.step(500); close(h.state().rig.timeline.currentFrame, 36); assert.equal(audio.plays, 0);
  h.step(500); close(h.state().rig.timeline.currentFrame, 48); assert.equal(audio.plays, 1);
  audio.currentTime = .25; h.step(500); close(h.state().rig.timeline.currentFrame, 54);
  h.step(500); close(h.state().rig.timeline.currentFrame, 54); // stalled media freezes animation
  h.state().updateProject(r => { r.name = 'Still the same project'; });
  assert.equal(h.instances.length, 1); assert.equal(audio.plays, 1);
  h.state().pause(); assert.equal(audio.paused, true);
  h.step(500); close(h.state().rig.timeline.currentFrame, 54);
  h.state().setFrame(72); close(audio.currentTime, 1);
  h.state().play(); assert.equal(audio.plays, 2);
  audio.ended = true; audio.currentTime = 2; h.step(16); close(h.state().rig.timeline.currentFrame, 96);
  h.step(250); close(h.state().rig.timeline.currentFrame, 102);
  h.step(1000); close(h.state().rig.timeline.currentFrame, 120); assert.equal(h.state().rig.timeline.isPlaying, false);
});

test('looping resynchronizes media to nonzero start rather than double counting offset', t => {
  const h = harness(t); h.state().updateProject(r => { r.audio = clip(); });
  h.state().setTimeline({ startFrame: 48, endFrame: 96, fps: 24, loop: true }); h.state().setFrame(95);
  h.start(); h.state().play(); const audio = h.instances[0]; close(audio.currentTime, 95 / 24 - 2);
  audio.currentTime = 2; audio.ended = true; h.step(100);
  close(h.state().rig.timeline.currentFrame, 48); close(audio.currentTime, 0);
  assert.equal(audio.plays, 2); assert.equal(h.state().rig.timeline.isPlaying, true);
});

test('audio loading freezes until metadata is ready; blocked playback pauses with a useful message', async t => {
  const h = harness(t, true); h.state().updateProject(r => { r.audio = clip(); });
  h.state().setTimeline({ startFrame: 48, endFrame: 120, fps: 24, loop: false });
  h.start(); h.instances[0].readyState = 0;
  h.state().play(); h.step(2000); close(h.state().rig.timeline.currentFrame, 48);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.state().rig.timeline.isPlaying, false);
  assert.ok(h.messages.some(message => message.includes('blocked or unsupported')));
});

test('replacing a project stops old audio and no-audio playback advances exactly once', t => {
  const h = harness(t); h.state().updateProject(r => { r.audio = clip(); }); h.start();
  h.state().setFrame(48); h.state().play(); const old = h.instances[0];
  const project = h.state().getProject(); delete project.audio; project.id = 'replacement';
  h.state().replaceProject(project); assert.equal(old.paused, true); assert.equal(old.src, '');
  h.state().setTimeline({ startFrame: 0, endFrame: 240, fps: 30, loop: false }); h.state().setFrame(0);
  h.state().play(); h.step(1000); close(h.state().rig.timeline.currentFrame, 30);
  assert.equal(h.instances.length, 1);
});
