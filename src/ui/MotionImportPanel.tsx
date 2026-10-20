import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { Box, ExternalLink, FileUp, Pause, Play, RotateCcw, ShoppingBag, SlidersHorizontal, StepBack, StepForward, X } from 'lucide-react';
import {
  appendAnimationClip,
  createMotionImportDefaults,
  parseMotionFile,
  retarget3DMotionToClip,
  validateMotionFileName,
} from '../engine/motionImport';
import type {
  Imported3DMotion,
  MotionImportOptions,
  Retarget3DMotionResult,
  RetargetedAnimationClip,
} from '../engine/motionImport';
import type { AnimationClip, ProjectModel } from '../engine/model';
import { createId, Rig } from '../engine/Rig';
import { useProject } from '../state/projectStore';

type EditableMotionOptions = Omit<MotionImportOptions, 'previousClip'>;

const INITIAL_OPTIONS: EditableMotionOptions = {
  projectionAngle: 0,
  speed: 1,
  trimStart: 0,
  trimEnd: 0,
  flip: false,
  alignWithPrevious: false,
  rootMotion: true,
};

const ANGLE_PRESETS = [-180, -135, -90, -45, 0, 45, 90, 135, 180];

function clipFromResult(result: Retarget3DMotionResult): {
  clip: RetargetedAnimationClip | null;
  error: string;
  warnings: string[];
} {
  if ('tracks' in result) {
    return { clip: result, error: '', warnings: result.warnings ?? [] };
  }
  return {
    clip: result.clip && 'tracks' in result.clip ? result.clip : null,
    error: result.error,
    warnings: result.warnings ?? [],
  };
}

function formatDuration(seconds: number): string {
  return `${seconds.toFixed(2)} s`;
}

function clampFrame(frame: number, clip: Pick<AnimationClip, 'startFrame' | 'endFrame'>): number {
  return Math.max(clip.startFrame, Math.min(clip.endFrame, frame));
}

function MotionImportPanel({ onStatus, onPreviewChange }: { onStatus: (message: string) => void; onPreviewChange: (active: boolean, cameraTracking: boolean) => void }) {
  const {
    rig,
    smartEdit,
    projectGeneration,
    updateProject,
    addActionLibraryItem,
  } = useProject();
  const fileInput = useRef<HTMLInputElement>(null);
  const parseRequest = useRef(0);
  const previewSnapshot = useRef<ProjectModel | null>(null);
  const previewRig = useRef<typeof rig | null>(null);
  const raf = useRef<number | null>(null);
  const lastTick = useRef<number | null>(null);
  const frameRef = useRef(0);
  const appliedRef = useRef(false);
  const sourceGeneration = useRef(projectGeneration);
  const knownProjectGeneration = useRef(projectGeneration);

  const [motion, setMotion] = useState<Imported3DMotion | null>(null);
  const [fileName, setFileName] = useState('');
  const [options, setOptions] = useState<EditableMotionOptions>(INITIAL_OPTIONS);
  const [generatedClip, setGeneratedClip] = useState<RetargetedAnimationClip | null>(null);
  const [retargetError, setRetargetError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [localStatus, setLocalStatus] = useState('Choose a local .bvh file to begin.');
  const [previewing, setPreviewing] = useState(false);
  const [previewFrame, setPreviewFrame] = useState(0);
  const [applied, setApplied] = useState(false);
  const [linkPreview, setLinkPreview] = useState(true);
  const [loopPreview, setLoopPreview] = useState(true);
  const [cameraTracking, setCameraTracking] = useState(false);
  const [appliedClipId, setAppliedClipId] = useState<string | null>(null);
  const [savedActionId, setSavedActionId] = useState<string | null>(null);

  const blockedReason = smartEdit
    ? 'Motion import is unavailable while Smart Edit is active. Capture or cancel the action edit first.'
    : rig.getStageView().enabled
      ? 'Motion import is blocked in a camera or 2.5D view. Select Preview and disable Stage preview to import or apply motion.'
      : '';

  const announce = (message: string) => {
    setLocalStatus(message);
    onStatus(message);
  };

  const stopLoop = () => {
    if (raf.current !== null) window.cancelAnimationFrame(raf.current);
    raf.current = null;
    lastTick.current = null;
  };

  const restorePreview = () => {
    const snapshot = previewSnapshot.current;
    const sourceRig = previewRig.current;
    if (snapshot && sourceRig) {
      const state = useProject.getState();
      if (sourceRig === state.rig && sourceGeneration.current === state.projectGeneration && !state.smartEdit) {
        sourceRig.loadProject(snapshot);
        useProject.setState((state) => ({ version: state.version + 1 }));
      }
    }
    previewSnapshot.current = null;
    previewRig.current = null;
    onPreviewChange(false, cameraTracking);
  };

  const stopAndRestorePreview = () => {
    stopLoop();
    setPreviewing(false);
    restorePreview();
  };

  const capturePreviewSnapshot = () => {
    if (previewSnapshot.current) return;
    useProject.getState().pause();
    previewSnapshot.current = rig.toProject();
    previewRig.current = rig;
    sourceGeneration.current = useProject.getState().projectGeneration;
    onPreviewChange(true, cameraTracking);
  };

  const applyPreviewFrame = (clip: RetargetedAnimationClip, frame: number) => {
    const state = useProject.getState();
    if (state.smartEdit || state.rig.getStageView().enabled || state.rig !== rig || state.projectGeneration !== knownProjectGeneration.current) return;
    capturePreviewSnapshot();
    rig.setTimeline({ fps: clip.fps, startFrame: clip.startFrame, endFrame: clip.endFrame, activeAnimationId: null, isPlaying: false });
    rig.applyAnimation(clip, frame);
    // Preview poses are deliberately outside the store's history transaction.
    // Incrementing the version is enough to repaint CanvasStage and the dock.
    useProject.setState((state) => ({ version: state.version + 1 }));
  };

  const clearImportedMotion = () => {
    parseRequest.current += 1;
    stopAndRestorePreview();
    setMotion(null);
    setFileName('');
    setGeneratedClip(null);
    setRetargetError('');
    setWarnings([]);
    setOptions(INITIAL_OPTIONS);
    setPreviewFrame(0);
    setApplied(false);
    appliedRef.current = false;
    setAppliedClipId(null);
    setSavedActionId(null);
    frameRef.current = 0;
    if (fileInput.current) fileInput.current.value = '';
  };

  const importFile = (file: File) => {
    if (!file) return;
    if (blockedReason) {
      announce(blockedReason);
      return;
    }

    stopAndRestorePreview();
    const request = ++parseRequest.current;
    const importRig = useProject.getState().rig;
    const importGeneration = useProject.getState().projectGeneration;
    const isCurrentRequest = () => {
      const state = useProject.getState();
      return request === parseRequest.current && state.rig === importRig && state.projectGeneration === importGeneration && !state.smartEdit && !state.rig.getStageView().enabled;
    };
    const validation = validateMotionFileName(file.name);
    if (!validation.valid) {
      clearImportedMotion();
      announce(validation.error ?? 'Unsupported motion file type. Use .bvh or .json.');
      return;
    }

    if (file.size > 64 * 1024 * 1024) {
      clearImportedMotion();
      announce('Motion file exceeds the 64 MB browser import limit.');
      return;
    }

    setMotion(null);
    setGeneratedClip(null);
    setFileName('');
    setLocalStatus(`Reading ${file.name}…`);
    const reader = new FileReader();
    reader.onerror = () => {
      if (!isCurrentRequest()) return;
      clearImportedMotion();
      announce(`Could not read ${file.name}.`);
    };
    reader.onload = () => {
      if (!isCurrentRequest()) return;
      const parsed = parseMotionFile(String(reader.result ?? ''), file.name);
      if (!parsed.motion) {
        clearImportedMotion();
        announce(parsed.error ?? `Could not parse ${file.name}.`);
        return;
      }
      const defaults = createMotionImportDefaults(parsed.motion);
      setMotion(parsed.motion);
      setFileName(file.name);
      setOptions(defaults);
      setGeneratedClip(null);
      setRetargetError('');
      setWarnings([]);
      setPreviewFrame(0);
      setApplied(false);
      appliedRef.current = false;
      setAppliedClipId(null);
      setSavedActionId(null);
      frameRef.current = 0;
      announce(`Parsed ${file.name} · ready to preview and retarget.`);
    };
    reader.readAsText(file);
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) importFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) importFile(file);
  };

  const updateOption = <K extends keyof EditableMotionOptions>(key: K, value: EditableMotionOptions[K]) => {
    stopAndRestorePreview();
    setGeneratedClip(null);
    setOptions((current) => {
      const next = { ...current, [key]: value };
      if (key === 'trimStart') next.trimStart = Math.min(Number(value), current.trimEnd);
      if (key === 'trimEnd') next.trimEnd = Math.max(Number(value), current.trimStart);
      return next;
    });
    setApplied(false);
    appliedRef.current = false;
    setAppliedClipId(null);
    setSavedActionId(null);
  };

  // Retargeting is intentionally a pure engine operation. It produces the
  // temporary clip shown by Preview without changing Rig.animations.
  useEffect(() => {
    if (!motion || blockedReason) return;
    const source = previewSnapshot.current ? new Rig(previewSnapshot.current) : rig;
    const activeClip = options.alignWithPrevious
      ? source.animations.find((clip) => clip.id === source.timeline.activeAnimationId)
      : undefined;
    const result = retarget3DMotionToClip(source, motion, { ...options, previousClip: activeClip });
    const resolved = clipFromResult(result);
    setGeneratedClip(resolved.clip);
    setRetargetError(resolved.error);
    setWarnings([...new Set([...(resolved.clip?.warnings ?? []), ...resolved.warnings])]);
    setApplied(false);
    if (resolved.clip) {
      const frame = clampFrame(frameRef.current, resolved.clip);
      setPreviewFrame(frame);
      frameRef.current = frame;
    } else {
      setPreviewFrame(0);
    }
  }, [motion, options, blockedReason, rig]);

  useEffect(() => {
    if (!previewing || !generatedClip || blockedReason) return undefined;
    lastTick.current = null;
    const tick = (now: number) => {
      const state = useProject.getState();
      if (state.rig !== rig || state.projectGeneration !== knownProjectGeneration.current || state.smartEdit || state.rig.getStageView().enabled) return;
      const previous = lastTick.current ?? now;
       const deltaSeconds = Math.min(0.1, Math.max(0, (now - previous) / 1000));
       lastTick.current = now;
       const span = generatedClip.endFrame - generatedClip.startFrame;
       const rawNext = frameRef.current + deltaSeconds * generatedClip.fps;
       const next = loopPreview && span > 0
         ? generatedClip.startFrame + (((rawNext - generatedClip.startFrame) % (span + 1)) + (span + 1)) % (span + 1)
         : Math.min(generatedClip.endFrame, rawNext);
       frameRef.current = next;
       const displayFrame = Math.min(generatedClip.endFrame, next);
       setPreviewFrame(displayFrame);
       applyPreviewFrame(generatedClip, displayFrame);
       if (!loopPreview && displayFrame >= generatedClip.endFrame) {
         setPreviewing(false);
         stopLoop();
         announce('Preview reached the end frame.');
         return;
       }
       raf.current = window.requestAnimationFrame(tick);
    };
    raf.current = window.requestAnimationFrame(tick);
    return stopLoop;
  }, [previewing, generatedClip, blockedReason, linkPreview, loopPreview, rig]);

  useEffect(() => {
    if (knownProjectGeneration.current === projectGeneration) return;
    knownProjectGeneration.current = projectGeneration;
    parseRequest.current += 1;
    stopAndRestorePreview();
    setMotion(null);
    setFileName('');
    setGeneratedClip(null);
    setRetargetError('');
    setWarnings([]);
    setApplied(false);
    appliedRef.current = false;
    setAppliedClipId(null);
    setSavedActionId(null);
    frameRef.current = 0;
    setPreviewFrame(0);
    setLocalStatus('Project changed · motion preview reset.');
  }, [projectGeneration]);

  useEffect(() => {
    if (!blockedReason) return;
    if (previewSnapshot.current || previewing) stopAndRestorePreview();
  }, [blockedReason, previewing]);

  useEffect(() => () => {
    parseRequest.current += 1;
    stopLoop();
    restorePreview();
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!previewSnapshot.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        stopAndRestorePreview();
        announce('Motion preview cancelled · original pose restored.');
      } else if (event.code === 'Space' && !(event.target instanceof HTMLElement && event.target.closest('.motion-panel'))) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setPreviewing((value) => !value);
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  });

  const startOrStopPreview = () => {
    if (blockedReason) {
      announce(blockedReason);
      return;
    }
    if (!generatedClip) return;
    if (previewing) {
      stopLoop();
      setPreviewing(false);
      return;
    }
    const linkedFrame = linkPreview
      ? clampFrame(rig.timeline.currentFrame, generatedClip)
      : clampFrame(frameRef.current, generatedClip);
    useProject.getState().pause();
    setPreviewFrame(linkedFrame);
    applyPreviewFrame(generatedClip, linkedFrame);
    setPreviewing(true);
    announce(`Previewing ${motion?.name ?? '3D motion'} · temporary pose only.`);
  };

  const resetOptions = () => {
    if (!motion) return;
    stopAndRestorePreview();
    setOptions(createMotionImportDefaults(motion));
    setPreviewFrame(0);
    setApplied(false);
    appliedRef.current = false;
    setAppliedClipId(null);
    setSavedActionId(null);
    frameRef.current = 0;
    announce('Motion settings reset.');
  };

  const applyToTimeline = () => {
    if (blockedReason) {
      announce(blockedReason);
      return;
    }
    const state = useProject.getState();
    if (!generatedClip || appliedRef.current || state.rig !== rig || state.smartEdit || state.rig.getStageView().enabled || state.projectGeneration !== knownProjectGeneration.current) return;
    appliedRef.current = true;
    const clip = generatedClip;
    const previousClip = options.alignWithPrevious
      ? state.rig.animations.find((candidate) => candidate.id === state.rig.timeline.activeAnimationId)
      : undefined;
    const appendedClip = previousClip && previousClip.id !== clip.id ? appendAnimationClip(previousClip, clip) : null;
    stopAndRestorePreview();
    const storedClip: AnimationClip = appendedClip ?? {
      id: clip.id,
      name: clip.name,
      fps: clip.fps,
      startFrame: clip.startFrame,
      endFrame: clip.endFrame,
      tracks: clip.tracks,
    };
    updateProject((project) => {
      const existingIndex = project.animations.findIndex((candidate) => candidate.id === storedClip.id);
      if (existingIndex >= 0) project.animations[existingIndex] = storedClip;
      else project.animations.push(storedClip);
      project.setTimeline({
        activeAnimationId: storedClip.id,
        fps: storedClip.fps,
        startFrame: storedClip.startFrame,
        endFrame: storedClip.endFrame,
        currentFrame: storedClip.startFrame,
        isPlaying: false,
      });
      project.applyAnimation(storedClip, storedClip.startFrame);
    });
    setApplied(true);
    setAppliedClipId(storedClip.id);
    setSavedActionId(null);
    announce(appendedClip
      ? `Appended ${clip.name} after ${previousClip?.name ?? 'the previous motion'} · Undo restores the previous timeline.`
      : `Applied ${storedClip.name} to the timeline · Undo restores the previous timeline.`);
  };

  const saveToActionLibrary = () => {
    if (!appliedClipId || savedActionId) return;
    const clip = useProject.getState().rig.animations.find((candidate) => candidate.id === appliedClipId);
    if (!clip) return;
    const id = addActionLibraryItem({ id: createId('action'), name: clip.name, animationId: clip.id, loop: false, speed: 1 });
    if (!id) {
      announce('That motion is already represented in the action library.');
      return;
    }
    setSavedActionId(id);
    announce(`${clip.name} saved as a reusable action reference.`);
  };

  const setPreviewCursor = (frame: number) => {
    if (!generatedClip) return;
    const next = clampFrame(frame, generatedClip);
    frameRef.current = next;
    setPreviewFrame(next);
    if (previewing) applyPreviewFrame(generatedClip, next);
  };

  const toggleCameraTracking = (enabled: boolean) => {
    setCameraTracking(enabled);
    onPreviewChange(Boolean(previewSnapshot.current), enabled);
  };

  const parsedSummary = motion && (
    <div className="motion-summary" aria-label="Parsed motion details">
      <div><span>Name</span><strong title={fileName}>{motion.name}</strong></div>
      <div><span>FPS</span><strong>{motion.fps.toFixed(2)}</strong></div>
      <div><span>Frames</span><strong>{motion.frameCount}</strong></div>
      <div><span>Duration</span><strong>{formatDuration(motion.durationSeconds)}</strong></div>
    </div>
  );

  return (
    <div className="motion-panel">
      <section className="motion-hero" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        <div className="section-title"><span><Box size={15} /> Import 3D Motion</span><span className="motion-format-badge">BVH / JSON</span></div>
        <p className="motion-lede">Retarget local open-format motion onto the current 2D bone rig. Preview is temporary until you apply it.</p>
        <input ref={fileInput} className="hidden-input" type="file" accept=".bvh,.json,.rlMotion,.fbx,.glb,.gltf" onChange={handleFile} />
        <button className="secondary-button full-button motion-choose" disabled={Boolean(blockedReason)} onClick={() => fileInput.current?.click()}><FileUp size={14} /> Choose motion file</button>
        <p className="motion-drop-hint">Or drag a compatible motion file here</p>
        <p className="motion-support">Supported in this browser MVP: <strong>.bvh</strong> and documented <strong>.json</strong>. <strong>.rlMotion</strong>, <strong>.fbx</strong>, <strong>.glb</strong> and <strong>.gltf</strong> are not parsed here.</p>
        <div className="motion-links"><a href="https://manual.reallusion.com/Cartoon-Animator/Content/Resources/4.4/08_Animation/Using-3D-Motions/Introduction-of-Import-3D-Motion-Panel.htm" target="_blank" rel="noreferrer"><ExternalLink size={12} /> Panel guide</a><a href="https://www.reallusion.com/ContentStore/index.html?MenuItem=cta_animation" target="_blank" rel="noreferrer"><ShoppingBag size={12} /> Get 3D motion</a></div>
      </section>

      {blockedReason && <p className="motion-blocked" role="alert">{blockedReason}</p>}
      <div className="motion-status" role="status" aria-live="polite">{localStatus}</div>
      {parsedSummary}
      {motion && <>
        {warnings.length > 0 && <div className="motion-warning" role="status"><strong>Unmapped joints</strong><ul>{warnings.slice(0, 5).map((warning) => <li key={warning}>{warning}</li>)}</ul>{warnings.length > 5 && <small>+ {warnings.length - 5} more warning{warnings.length - 5 === 1 ? '' : 's'}</small>}</div>}
        {retargetError && <p className="motion-error" role="alert">{retargetError}</p>}

        <fieldset className="motion-fields" disabled={Boolean(blockedReason)}>
          <section className="motion-section">
            <div className="section-title"><span>Projection & playback</span><SlidersHorizontal size={14} className="section-muted" /></div>
            <label className="motion-range"><span><span>Camera projection angle</span><output>{Math.round(options.projectionAngle)}°</output></span><input type="range" min={-180} max={180} step={1} value={options.projectionAngle} onChange={(event) => updateOption('projectionAngle', Number(event.target.value))} /></label>
            <div className="motion-presets" aria-label="Projection angle presets">{ANGLE_PRESETS.map((angle) => <button key={angle} type="button" aria-pressed={options.projectionAngle === angle} onClick={() => updateOption('projectionAngle', angle)}>{angle}°</button>)}</div>
            <label className="motion-range"><span><span>Speed</span><output>{options.speed.toFixed(2)}×</output></span><input type="range" min={0.25} max={2} step={0.25} value={options.speed} onChange={(event) => updateOption('speed', Number(event.target.value))} /></label>
          </section>

          <section className="motion-section">
            <div className="section-title"><span>Trim source frames</span><span className="motion-frame-count">0–{motion.frameCount - 1}</span></div>
            <div className="motion-trim-grid">
              <label className="motion-number"><span>Start</span><input type="number" min={0} max={motion.frameCount - 1} step={1} value={options.trimStart} onChange={(event) => updateOption('trimStart', Math.max(0, Math.min(motion.frameCount - 1, Math.floor(Number(event.target.value) || 0))))} /></label>
              <label className="motion-number"><span>End</span><input type="number" min={0} max={motion.frameCount - 1} step={1} value={options.trimEnd} onChange={(event) => updateOption('trimEnd', Math.max(0, Math.min(motion.frameCount - 1, Math.floor(Number(event.target.value) || 0))))} /></label>
            </div>
            <p className="motion-note">Source trim is sampled into {generatedClip ? generatedClip.endFrame - generatedClip.startFrame + 1 : '—'} output frame{generatedClip && generatedClip.endFrame - generatedClip.startFrame === 0 ? '' : 's'}.</p>
          </section>

          <section className="motion-section motion-checks">
            <label className="motion-check"><input type="checkbox" checked={options.flip} onChange={(event) => updateOption('flip', event.target.checked)} /><span><strong>Flip Body</strong><small>Mirror projected horizontal rotation and root travel.</small></span></label>
            <label className="motion-check"><input type="checkbox" checked={options.alignWithPrevious} onChange={(event) => updateOption('alignWithPrevious', event.target.checked)} /><span><strong>Align with previous motion</strong><small>Offset root motion from the active clip’s last keyed position.</small></span></label>
            <label className="motion-check"><input type="checkbox" checked={options.rootMotion} onChange={(event) => updateOption('rootMotion', event.target.checked)} /><span><strong>Root motion</strong><small>Keep source root X/Y travel in the generated clip.</small></span></label>
            <label className="motion-check"><input type="checkbox" checked={linkPreview} onChange={(event) => { stopAndRestorePreview(); setLinkPreview(event.target.checked); }} /><span><strong>Link Activated</strong><small>Start preview from the active timeline frame when enabled.</small></span></label>
            <label className="motion-check"><input type="checkbox" checked={cameraTracking} onChange={(event) => toggleCameraTracking(event.target.checked)} /><span><strong>Camera tracking</strong><small>Keep the animated root centered in the canvas during preview.</small></span></label>
          </section>

          <section className="motion-preview-section">
            <div className="motion-preview-readout"><span>3D view preview</span><strong>{Math.round(previewFrame)} / {generatedClip?.endFrame ?? '—'}</strong></div>
            <div className="motion-preview-scrub"><input aria-label="Preview frame" type="range" min={generatedClip?.startFrame ?? 0} max={generatedClip?.endFrame ?? 0} step={0.01} value={previewFrame} disabled={!generatedClip} onChange={(event) => setPreviewCursor(Number(event.target.value))} /><input className="motion-frame-input" aria-label="Preview frame number" type="number" min={generatedClip?.startFrame ?? 0} max={generatedClip?.endFrame ?? 0} step={1} value={Math.round(previewFrame)} disabled={!generatedClip} onChange={(event) => setPreviewCursor(Number(event.target.value))} /></div>
            <div className="motion-transport" aria-label="Motion preview controls"><button type="button" disabled={!generatedClip} onClick={() => setPreviewCursor(generatedClip?.startFrame ?? 0)} title="Jump to start"><StepBack size={14} /></button><button type="button" disabled={!generatedClip} onClick={() => setPreviewCursor(previewFrame - 1)} title="Previous frame"><StepBack size={12} /></button><button type="button" disabled={!generatedClip} onClick={() => setPreviewCursor(previewFrame + 1)} title="Next frame"><StepForward size={12} /></button><button type="button" disabled={!generatedClip} onClick={() => setPreviewCursor(generatedClip?.endFrame ?? previewFrame)} title="Jump to end"><StepForward size={14} /></button><label className="motion-loop-toggle"><input type="checkbox" checked={loopPreview} onChange={(event) => setLoopPreview(event.target.checked)} /> Loop</label></div>
            <div className="motion-preview-actions"><button className="secondary-button full-button" disabled={!generatedClip || Boolean(retargetError) || applied} onClick={startOrStopPreview}>{previewing ? <Pause size={14} /> : <Play size={14} />} {previewing ? 'Pause preview' : 'Play preview'}</button></div>
            <p className="motion-note">Link Activated previews the motion on the current character. Preview does not add an animation or history entry until you apply it.</p>
          </section>
        </fieldset>

        <section className="motion-actions">
          <button className="secondary-button" onClick={resetOptions} disabled={Boolean(blockedReason)}><RotateCcw size={14} /> Reset</button>
          <button className="secondary-button" onClick={() => { clearImportedMotion(); announce('Motion import cancelled · original pose restored.'); }}><X size={14} /> Cancel</button>
          <button className="motion-apply-button" onClick={applyToTimeline} disabled={Boolean(blockedReason) || !generatedClip || Boolean(retargetError) || applied}>Apply to Timeline</button>
        </section>
        {applied && appliedClipId && <section className="motion-library-row"><div><strong>Motion clip ready</strong><small>Reuse this converted motion from the action library.</small></div><button className="secondary-button" onClick={saveToActionLibrary} disabled={Boolean(savedActionId)}>{savedActionId ? 'Saved to library' : 'Save reusable action'}</button></section>}
      </>}
    </div>
  );
}

export { MotionImportPanel };
export default MotionImportPanel;
