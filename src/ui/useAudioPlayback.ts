import { useEffect, useRef } from 'react';
import type { TimelineState } from '../engine/model';
import { useProject } from '../state/projectStore';

/** Project seconds are absolute (including a nonzero timeline start). */
export function playbackPosition(seconds: number, timeline: Pick<TimelineState, 'fps' | 'startFrame' | 'endFrame' | 'loop'>) {
  const raw = seconds * timeline.fps;
  const span = timeline.endFrame - timeline.startFrame;
  const ended = raw >= timeline.endFrame;
  const frame = ended && timeline.loop && span > 0
    ? timeline.startFrame + ((raw - timeline.startFrame) % span + span) % span
    : Math.max(timeline.startFrame, Math.min(timeline.endFrame, raw));
  return { frame, wrapped: ended && timeline.loop && span > 0, stopped: ended && (!timeline.loop || span <= 0) };
}

/** One transport for the entire editor. A store tick never recreates the audio. */
export function useAudioPlayback(onStatus: (message: string) => void) {
  const report = useRef(onStatus);
  report.current = onStatus;
  useEffect(() => {
    let audio: HTMLAudioElement | null = null;
    let rig = useProject.getState().rig;
    let source = '';
    let audioId = '';
    let seconds = rig.timeline.currentFrame / rig.timeline.fps;
    let lastFrame = rig.timeline.currentFrame;
    let lastFps = rig.timeline.fps;
    let lastOffset = rig.audio?.offsetSeconds ?? 0;
    let lastNow = performance.now();
    let running = false;
    let audioRequested = false;
    let pendingSeek: number | null = null;
    let epoch = 0;
    let publishing = false;
    let raf = 0;
    let disposed = false;

    const stopAudio = () => {
      epoch++;
      audioRequested = false;
      audio?.pause();
    };
    const fail = (message: string) => {
      running = false;
      pendingSeek = null;
      stopAudio();
      useProject.getState().pause();
      report.current(message);
    };
    const disposeAudio = () => {
      stopAudio();
      pendingSeek = null;
      if (audio) {
        audio.onerror = null;
        audio.onloadedmetadata = null;
        audio.removeAttribute('src');
        audio.load();
        audio = null;
      }
    };
    const alignAudio = (seek: boolean) => {
      const clip = rig.audio;
      if (!clip || !audio) return;
      audio.volume = Math.max(0, Math.min(1, clip.volume));
      audio.muted = clip.muted;
      const relative = seconds - clip.offsetSeconds;
      const inside = relative >= 0 && relative < clip.duration;
      if (seek || (inside && running && !audioRequested)) {
        pendingSeek = Math.max(0, Math.min(clip.duration, relative));
      }
      if (pendingSeek !== null && audio.readyState > 0) {
        try { audio.currentTime = pendingSeek; pendingSeek = null; }
        catch { fail('This browser could not seek the audio clip. Try importing PCM WAV or MP3.'); return; }
      }
      if (!running || !inside) {
        if (audioRequested || !audio.paused) stopAudio();
        return;
      }
      if (!audioRequested) {
        audioRequested = true;
        const token = ++epoch;
        const element = audio;
        try {
          void element.play().catch(() => {
            if (!disposed && epoch === token && running) fail('Audio playback was blocked or unsupported. Press Play to retry, or import a browser-supported WAV/MP3/OGG file.');
          });
        } catch {
          fail('This browser could not start audio playback. Press Play to retry.');
        }
      }
    };
    const synchronize = () => {
      if (publishing || disposed) return;
      const state = useProject.getState();
      const next = state.rig;
      const changed = next !== rig || (next.audio?.src ?? '') !== source || (next.audio?.id ?? '') !== audioId;
      const wasRunning = running;
      rig = next;
      if (changed) {
        disposeAudio();
        source = rig.audio?.src ?? '';
        audioId = rig.audio?.id ?? '';
        if (source) {
          audio = new Audio();
          audio.preload = 'auto';
          audio.onerror = () => fail('Could not decode this audio for playback. Try a WAV/MP3/OGG file supported by your browser.');
          audio.onloadedmetadata = () => alignAudio(true);
          audio.src = source;
        }
      }
      running = rig.timeline.isPlaying && !state.smartEdit;
      const seek = changed || rig.timeline.currentFrame !== lastFrame || rig.timeline.fps !== lastFps || (rig.audio?.offsetSeconds ?? 0) !== lastOffset || running !== wasRunning;
      if (seek) {
        seconds = rig.timeline.currentFrame / rig.timeline.fps;
        lastNow = performance.now();
      }
      lastFrame = rig.timeline.currentFrame;
      lastFps = rig.timeline.fps;
      lastOffset = rig.audio?.offsetSeconds ?? 0;
      alignAudio(seek);
    };
    const step = (now: number) => {
      if (disposed) return;
      const delta = Math.max(0, (now - lastNow) / 1000);
      lastNow = now;
      if (running) {
        const clip = rig.audio;
        const inside = clip && seconds >= clip.offsetSeconds && seconds < clip.offsetSeconds + clip.duration;
        if (inside && audio && audioRequested) {
          // Freeze while loading/buffering; use the audible clock, not a second timer.
          if (pendingSeek === null && audio.readyState > 0) seconds = clip.offsetSeconds + (audio.ended ? clip.duration : audio.currentTime);
        } else seconds += delta;
        const next = playbackPosition(seconds, rig.timeline);
        if (next.wrapped) {
          seconds = next.frame / rig.timeline.fps;
          stopAudio();
        }
        publishing = true;
        lastFrame = next.frame;
        useProject.getState().setPlaybackFrame(next.frame);
        publishing = false;
        if (next.stopped) useProject.getState().pause();
        else alignAudio(next.wrapped);
      }
      raf = requestAnimationFrame(step);
    };
    const unsubscribe = useProject.subscribe(synchronize);
    synchronize();
    raf = requestAnimationFrame(step);
    return () => { disposed = true; unsubscribe(); cancelAnimationFrame(raf); disposeAudio(); };
  }, []);
}
