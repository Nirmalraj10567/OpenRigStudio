import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Check, CircleStop, FileVideo, Gauge, Play, RotateCcw, ScanLine, Square, Target, Upload, WandSparkles } from 'lucide-react';
import type { AnimationClip } from '../engine/model';
import { useProject } from '../state/projectStore';
import {
  processTrackedFrames,
  retargetTrackedFramesToClip,
  suggestTrackedRigMapping,
  trackingLandmarkNames,
  type TrackedFrame,
  type TrackedLandmarkName,
  type TrackingFacing,
  type TrackingMapping,
  type TrackingView,
} from '../engine/motionTracking';
import { Rig } from '../engine/Rig';

type MotionTrackingPanelProps = { onStatus: (message: string) => void };
type VideoInfo = { name: string; duration: number; width: number; height: number; fps: number; size: number; lastModified: number };

const LANDMARK_INDEX: Partial<Record<TrackedLandmarkName, number>> = {
  nose: 0, leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16, leftHip: 23, rightHip: 24, leftKnee: 25,
  rightKnee: 26, leftAnkle: 27, rightAnkle: 28, leftHeel: 29, rightHeel: 30,
  leftFoot: 31, rightFoot: 32,
};

const pairDefinitions: Array<{ start: TrackedLandmarkName; end: TrackedLandmarkName; label: string }> = [
  { start: 'leftShoulder', end: 'leftElbow', label: 'Left upper arm' },
  { start: 'leftElbow', end: 'leftWrist', label: 'Left forearm' },
  { start: 'rightShoulder', end: 'rightElbow', label: 'Right upper arm' },
  { start: 'rightElbow', end: 'rightWrist', label: 'Right forearm' },
  { start: 'leftHip', end: 'leftKnee', label: 'Left thigh' },
  { start: 'leftKnee', end: 'leftAnkle', label: 'Left shin' },
  { start: 'rightHip', end: 'rightKnee', label: 'Right thigh' },
  { start: 'rightKnee', end: 'rightAnkle', label: 'Right shin' },
];

const cacheKey = (info: VideoInfo) => `character-studio-motion-track:v1:${info.name}:${info.size}:${info.lastModified}`;
const TRACKING_PREFS_KEY = 'motion-tracking-settings:v1';

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) return Promise.resolve();
  return new Promise(resolve => { video.addEventListener('seeked', () => resolve(), { once: true }); video.currentTime = time; });
}

function detectFrameLandmarks(result: any, frame: number, timeSeconds: number): TrackedFrame {
  const source = result?.landmarks?.[0] ?? [];
  const landmarks = Object.fromEntries(Object.entries(LANDMARK_INDEX).flatMap(([name, index]) => {
    const point = source[index as number] as { x?: number; y?: number; z?: number; visibility?: number } | undefined;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
    return [[name, { x: point.x!, y: point.y!, z: point.z, visibility: point.visibility ?? 1, confidence: point.visibility ?? 1 }]];
  })) as TrackedFrame['landmarks'];
  const leftShoulder = landmarks.leftShoulder, rightShoulder = landmarks.rightShoulder;
  if (leftShoulder && rightShoulder) {
    landmarks.neck = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2, visibility: Math.min(leftShoulder.visibility, rightShoulder.visibility), confidence: Math.min(leftShoulder.confidence, rightShoulder.confidence) };
  }
  return { frame, timeSeconds, landmarks };
}

function defaultMapping(rig: Rig): TrackingMapping {
  const suggestions = suggestTrackedRigMapping(rig, trackingLandmarkNames());
  const pick = (landmark: TrackedLandmarkName) => suggestions.find(item => item.landmark === landmark)?.boneId ?? null;
  return {
    rootLandmark: 'leftHip',
    rootBoneId: rig.getRoots()[0]?.id,
    bones: pairDefinitions.flatMap(pair => {
      const boneId = pick(pair.start);
      return boneId ? [{ boneId, start: pair.start, end: pair.end, enabled: true }] : [];
    }),
    ik: (['leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle'] as TrackedLandmarkName[]).flatMap(landmark => {
      const boneId = pick(landmark);
      return boneId ? [{ effectorBoneId: boneId, landmark, chainLength: 2, enabled: true }] : [];
    }),
  };
}

function updateBoneMapping(mapping: TrackingMapping, start: TrackedLandmarkName, end: TrackedLandmarkName, boneId: string): TrackingMapping {
  const existing = mapping.bones.findIndex(item => item.start === start && item.end === end);
  if (existing < 0) return { ...mapping, bones: [...mapping.bones, { boneId, start, end, enabled: true }] };
  return { ...mapping, bones: mapping.bones.map((item, index) => index === existing ? { ...item, boneId } : item) };
}

function drawSkeleton(canvas: HTMLCanvasElement, video: HTMLVideoElement, frame: TrackedFrame | undefined, view: TrackingView): void {
  const width = video.videoWidth || 640, height = video.videoHeight || 360;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  if (!frame) return;
  const point = (name: TrackedLandmarkName) => {
    const item = frame.landmarks[name];
    if (!item) return null;
    return { x: (view === 'back' ? 1 - item.x : item.x) * width, y: item.y * height, confidence: item.confidence };
  };
  const links: Array<[TrackedLandmarkName, TrackedLandmarkName]> = [
    ['leftShoulder', 'rightShoulder'], ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'],
    ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'], ['leftShoulder', 'leftHip'],
    ['rightShoulder', 'rightHip'], ['leftHip', 'rightHip'], ['leftHip', 'leftKnee'], ['leftKnee', 'leftAnkle'],
    ['rightHip', 'rightKnee'], ['rightKnee', 'rightAnkle'], ['neck', 'nose'],
  ];
  context.lineWidth = Math.max(2, width / 320); context.strokeStyle = '#55e6c1';
  links.forEach(([startName, endName]) => { const start = point(startName), end = point(endName); if (!start || !end) return; context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke(); });
  Object.keys(frame.landmarks).forEach(name => { const item = point(name as TrackedLandmarkName); if (!item) return; context.beginPath(); context.fillStyle = item.confidence < .35 ? '#ff7f88' : '#f7d66a'; context.arc(item.x, item.y, Math.max(3, width / 110), 0, Math.PI * 2); context.fill(); });
}

export function MotionTrackingPanel({ onStatus }: MotionTrackingPanelProps) {
  const { rig, projectGeneration, smartEdit, updateProject, pause } = useProject();
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const landmarker = useRef<any>(null);
  const objectUrl = useRef<string | null>(null);
  const fileMeta = useRef<{ name: string; size: number; lastModified: number } | null>(null);
  const cancelTracking = useRef(false);
  const previewSnapshot = useRef<ReturnType<Rig['toProject']> | null>(null);
  const previewRaf = useRef<number | null>(null);
  const previewClock = useRef<number | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [sourceFrame, setSourceFrame] = useState(0);
  const [sampleFps, setSampleFps] = useState(24);
  const [trackStart, setTrackStart] = useState(0);
  const [trackEnd, setTrackEnd] = useState(0);
  const [trackingFrames, setTrackingFrames] = useState<TrackedFrame[]>([]);
  const [processedFrames, setProcessedFrames] = useState<TrackedFrame[]>([]);
  const [tracking, setTracking] = useState(false);
  const [trackingProgress, setTrackingProgress] = useState(0);
  const [detectorError, setDetectorError] = useState('');
  const [view, setView] = useState<TrackingView>('front');
  const [facing, setFacing] = useState<TrackingFacing>('right');
  const [confidence, setConfidence] = useState(.35);
  const [smoothing, setSmoothing] = useState(3);
  const [mapping, setMapping] = useState<TrackingMapping>(() => defaultMapping(rig));
  const [generatedClip, setGeneratedClip] = useState<AnimationClip | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewFrame, setPreviewFrame] = useState(0);

  const currentFrame = trackingFrames.find(frame => frame.frame === sourceFrame) ?? trackingFrames[trackingFrames.length - 1];
  const suggestions = useMemo(() => suggestTrackedRigMapping(rig, trackingLandmarkNames()), [rig]);
  const mappedCount = mapping.bones.filter(item => item.enabled !== false && rig.bones.has(item.boneId)).length + mapping.ik.filter(item => item.enabled !== false && rig.bones.has(item.effectorBoneId)).length;

  useEffect(() => () => {
    cancelTracking.current = true;
    if (previewRaf.current !== null) cancelAnimationFrame(previewRaf.current);
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    landmarker.current?.close?.();
  }, []);

  useEffect(() => {
    if (overlay.current && video.current) drawSkeleton(overlay.current, video.current, currentFrame, view);
  }, [currentFrame, view]);

  useEffect(() => {
    if (projectGeneration === 0) return;
    setTrackingFrames([]); setProcessedFrames([]); setGeneratedClip(null); setPreviewFrame(0); setPreviewing(false);
    try {
      const raw = rig.metadata[TRACKING_PREFS_KEY];
      if (raw) {
        const saved = JSON.parse(raw) as Partial<{ sampleFps: number; confidence: number; smoothing: number; view: TrackingView; facing: TrackingFacing; mapping: TrackingMapping }>;
        if (Number.isFinite(saved.sampleFps)) setSampleFps(Math.max(6, Math.min(60, Number(saved.sampleFps))));
        if (Number.isFinite(saved.confidence)) setConfidence(Math.max(0, Math.min(.9, Number(saved.confidence))));
        if (Number.isFinite(saved.smoothing)) setSmoothing(Math.max(1, Math.min(9, Number(saved.smoothing))));
        if (saved.view === 'front' || saved.view === 'side' || saved.view === 'back') setView(saved.view);
        if (saved.facing === 'left' || saved.facing === 'right' || saved.facing === 'front' || saved.facing === 'back') setFacing(saved.facing);
        if (saved.mapping && Array.isArray(saved.mapping.bones) && Array.isArray(saved.mapping.ik)) setMapping(saved.mapping);
      }
    } catch { /* malformed preferences fall back to safe defaults */ }
  }, [projectGeneration]);

  const persistPreferences = (patch: Partial<{ sampleFps: number; confidence: number; smoothing: number; view: TrackingView; facing: TrackingFacing; mapping: TrackingMapping }>) => {
    const state = useProject.getState();
    try {
      const current = state.rig.metadata[TRACKING_PREFS_KEY] ? JSON.parse(state.rig.metadata[TRACKING_PREFS_KEY]) : {};
      state.rig.metadata[TRACKING_PREFS_KEY] = JSON.stringify({ ...current, ...patch });
      state.rig.update();
      useProject.setState({ version: state.version + 1 });
    } catch { /* preference persistence is optional */ }
  };

  const announce = (message: string) => onStatus(message);

  const importVideo = (file: File) => {
    if (!file.type.startsWith('video/')) { announce('Choose a video file such as MP4, WebM, or MOV'); return; }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    fileMeta.current = { name: file.name, size: file.size, lastModified: file.lastModified };
    setVideoUrl(url); setTrackingFrames([]); setProcessedFrames([]); setGeneratedClip(null); setDetectorError(''); setSourceFrame(0);
    announce(`Loaded ${file.name} · waiting for video metadata`);
  };

  const onVideoMetadata = () => {
    const element = video.current;
    if (!element) return;
    const fps = 24;
    const totalFrames = Math.max(1, Math.ceil(element.duration * fps));
    const info: VideoInfo = { name: fileMeta.current?.name ?? element.src.split('/').pop() ?? 'Reference video', duration: Number.isFinite(element.duration) ? element.duration : 0, width: element.videoWidth, height: element.videoHeight, fps, size: fileMeta.current?.size ?? 0, lastModified: fileMeta.current?.lastModified ?? 0 };
    setVideoInfo(info); setSampleFps(fps); setTrackStart(0); setTrackEnd(totalFrames - 1); setSourceFrame(0);
    try {
      const cached = JSON.parse(window.localStorage.getItem(cacheKey(info) ?? '') ?? 'null') as { frames?: TrackedFrame[]; sampleFps?: number } | null;
      if (cached?.frames?.length) { setTrackingFrames(cached.frames); setProcessedFrames(processTrackedFrames(cached.frames, { confidenceThreshold: confidence, maxMissingGap: 4, smoothingWindow: smoothing })); setSampleFps(cached.sampleFps ?? fps); announce(`${info.name} ready · reused ${cached.frames.length} cached tracking frames`); return; }
    } catch { /* a missing or full cache is not fatal */ }
    announce(`${info.name} ready · ${info.width} × ${info.height} · ${info.duration.toFixed(2)}s`);
  };

  const loadDetector = async () => {
    if (landmarker.current) return landmarker.current;
    const vision = await import('@mediapipe/tasks-vision');
    const resolver = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
    landmarker.current = await vision.PoseLandmarker.createFromOptions(resolver, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'GPU' },
      runningMode: 'VIDEO', numPoses: 1,
    });
    return landmarker.current;
  };

  const runTracking = async () => {
    if (!video.current || !videoInfo || smartEdit || tracking) return;
    cancelTracking.current = false; setDetectorError(''); setTracking(true); setTrackingProgress(0); pause();
    try {
      const detector = await loadDetector();
      const sourceFps = Math.max(.001, videoInfo.fps);
      const start = Math.max(0, Math.min(trackStart, trackEnd));
      const end = Math.max(start, trackEnd);
      const step = sourceFps / Math.max(1, sampleFps);
      const positions: number[] = [];
      for (let position = start; position <= end + .001; position += step) positions.push(position);
      const found: TrackedFrame[] = [];
      for (let index = 0; index < positions.length; index += 1) {
        if (cancelTracking.current) break;
        const position = positions[index];
        const seconds = position / sourceFps;
        await seekVideo(video.current, Math.min(videoInfo.duration, seconds));
        const result = detector.detectForVideo(video.current, seconds * 1000);
        found.push(detectFrameLandmarks(result, index, seconds));
        setSourceFrame(index); setTrackingProgress((index + 1) / positions.length);
      }
      if (!cancelTracking.current && found.length) {
        const cleaned = processTrackedFrames(found, { confidenceThreshold: confidence, maxMissingGap: 4, smoothingWindow: smoothing });
        setTrackingFrames(found); setProcessedFrames(cleaned); setSourceFrame(0);
        try {
          const serialized = JSON.stringify({ frames: found, sampleFps });
          if (serialized.length < 4_000_000) window.localStorage.setItem(cacheKey(videoInfo), serialized);
        } catch { /* local cache is optional */ }
        announce(`Tracked ${found.length} frames · change mapping without rerunning detection`);
      } else if (cancelTracking.current) announce('Tracking cancelled · cached frames remain available');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pose detector could not start';
      setDetectorError(message); announce(message);
    } finally { setTracking(false); }
  };

  const regenerateProcessedFrames = () => {
    if (!trackingFrames.length) return;
    const cleaned = processTrackedFrames(trackingFrames, { confidenceThreshold: confidence, maxMissingGap: 4, smoothingWindow: smoothing });
    setProcessedFrames(cleaned); setGeneratedClip(null); announce('Tracking cleanup updated · detection cache was reused');
  };

  const generateClip = () => {
    if (!videoInfo || !processedFrames.length) { announce('Track a video before generating animation'); return; }
    const clip = retargetTrackedFramesToClip(rig, processedFrames, mapping, { videoWidth: videoInfo.width, videoHeight: videoInfo.height, stageWidth: rig.canvas.width, stageHeight: rig.canvas.height, fps: sampleFps, startFrame: Math.round(rig.timeline.currentFrame), keyTolerance: 1, facing, view, rootMotion: true, name: `${videoInfo.name} · tracked motion` });
    setGeneratedClip(clip); setPreviewFrame(clip.startFrame); announce(`Generated ${clip.name} · ${clip.tracks.length} editable rig channels`);
  };

  const restorePreview = () => {
    if (!previewSnapshot.current) return;
    const state = useProject.getState();
    if (state.rig === rig && !state.smartEdit) { rig.loadProject(previewSnapshot.current); useProject.setState({ version: state.version + 1 }); }
    previewSnapshot.current = null; setPreviewing(false); previewClock.current = null;
  };

  const applyPreviewFrame = (frame: number) => {
    if (!generatedClip) return;
    const state = useProject.getState();
    if (state.rig !== rig || state.smartEdit) return;
    if (!previewSnapshot.current) previewSnapshot.current = rig.toProject();
    rig.applyAnimation(generatedClip, frame); useProject.setState({ version: state.version + 1 }); setPreviewFrame(frame);
  };

  const togglePreview = () => {
    if (!generatedClip) return;
    if (previewing) { setPreviewing(false); if (previewRaf.current !== null) cancelAnimationFrame(previewRaf.current); previewRaf.current = null; return; }
    pause(); if (!previewSnapshot.current) previewSnapshot.current = rig.toProject(); applyPreviewFrame(generatedClip.startFrame); setPreviewing(true);
  };

  useEffect(() => {
    if (!previewing || !generatedClip) return undefined;
    previewClock.current = null;
    const tick = (now: number) => {
      const previous = previewClock.current ?? now; previewClock.current = now;
      const next = previewFrame + Math.min(.05, Math.max(0, (now - previous) / 1000)) * generatedClip.fps;
      const frame = next > generatedClip.endFrame ? generatedClip.startFrame : next;
      applyPreviewFrame(frame); previewRaf.current = requestAnimationFrame(tick);
    };
    previewRaf.current = requestAnimationFrame(tick);
    return () => { if (previewRaf.current !== null) cancelAnimationFrame(previewRaf.current); previewRaf.current = null; previewClock.current = null; };
  }, [previewing, generatedClip, previewFrame]);

  const bakeClip = () => {
    if (!generatedClip) return;
    restorePreview();
    updateProject(project => { project.animations.push(generatedClip); project.setTimeline({ activeAnimationId: generatedClip.id, fps: generatedClip.fps, startFrame: generatedClip.startFrame, endFrame: generatedClip.endFrame, currentFrame: generatedClip.startFrame, isPlaying: false }); project.applyAnimation(generatedClip, generatedClip.startFrame); });
    announce(`Baked ${generatedClip.name} into the main Timeline · Undo restores the previous project`);
  };

  const resetTracking = () => { cancelTracking.current = true; restorePreview(); setTrackingFrames([]); setProcessedFrames([]); setGeneratedClip(null); setTrackingProgress(0); setSourceFrame(0); announce('Motion tracking reset · original rig animation preserved'); };

  const autoMap = () => { const next = defaultMapping(rig); setMapping(next); persistPreferences({ mapping: next }); setGeneratedClip(null); announce('Suggested landmark mapping refreshed from the current Rig'); };

  return <section className="motion-tracking-panel" aria-label="Motion Tracking Studio">
    <header className="motion-tracking-header">
      <div><span className="motion-tracking-eyebrow">VIDEO → 2D RIG</span><h2><ScanLine size={17} /> Motion Tracking Studio</h2><p>Track a reference video, preview the real character rig with IK, then bake editable keys into the existing Timeline.</p></div>
      <div className="motion-tracking-header-actions"><input ref={fileInput} className="hidden-input" type="file" accept="video/*" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) importVideo(file); }} /><button type="button" className="secondary-button" disabled={Boolean(smartEdit)} onClick={() => fileInput.current?.click()}><FileVideo size={13} /> Import video</button><button type="button" className="secondary-button" onClick={resetTracking}><RotateCcw size={13} /> Reset</button></div>
    </header>

    {smartEdit && <p className="motion-tracking-blocked" role="alert">Capture or cancel Smart Edit before tracking or baking motion.</p>}
    <div className="motion-tracking-body">
      <section className="motion-tracking-video-card" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) importVideo(file); }}>
        {!videoUrl ? <div className="motion-tracking-empty"><FileVideo size={28} /><strong>Import a reference video</strong><span>Drop a local MP4, WebM, or MOV here. The source stays separate from your editable project.</span><button type="button" className="primary-button" disabled={Boolean(smartEdit)} onClick={() => fileInput.current?.click()}><Upload size={14} /> Choose video</button></div> : <>
          <div className="motion-tracking-video-stage"><video ref={video} src={videoUrl} muted playsInline onLoadedMetadata={onVideoMetadata} onTimeUpdate={event => setSourceFrame(Math.round(event.currentTarget.currentTime * (videoInfo?.fps ?? 24)))} aria-label="Motion tracking source video" /><canvas ref={overlay} className="motion-tracking-overlay" aria-label="Tracked skeleton overlay" /></div>
          <div className="motion-tracking-scrub"><label><span>Source frame</span><output>{sourceFrame} / {Math.max(0, trackEnd)}</output></label><input aria-label="Motion tracking source frame" type="range" min={0} max={Math.max(0, trackEnd)} value={sourceFrame} onChange={event => { const next = Number(event.target.value); setSourceFrame(next); if (video.current && videoInfo) void seekVideo(video.current, next / videoInfo.fps); }} /></div>
          {videoInfo && <div className="motion-tracking-video-meta"><span><strong>{videoInfo.name}</strong><small>{videoInfo.width} × {videoInfo.height}</small></span><span><strong>{videoInfo.duration.toFixed(2)}s</strong><small>{videoInfo.fps} FPS source</small></span><span><strong>{trackingFrames.length || '—'}</strong><small>tracked frames</small></span></div>}
        </>}
      </section>

      <aside className="motion-tracking-settings">
        <section className="motion-tracking-section"><div className="motion-tracking-section-title"><span><Gauge size={14} /> Tracking settings</span><span className="motion-tracking-badge">{tracking ? `${Math.round(trackingProgress * 100)}%` : 'READY'}</span></div>
          <label className="motion-tracking-field"><span>Sample FPS <output>{sampleFps}</output></span><input type="range" min={6} max={60} step={1} value={sampleFps} onChange={event => { const value = Number(event.target.value); setSampleFps(value); persistPreferences({ sampleFps: value }); }} /></label>
          <label className="motion-tracking-field"><span>Confidence <output>{Math.round(confidence * 100)}%</output></span><input type="range" min={0} max={.9} step={.05} value={confidence} onChange={event => { const value = Number(event.target.value); setConfidence(value); persistPreferences({ confidence: value }); setGeneratedClip(null); }} /></label>
          <label className="motion-tracking-field"><span>Smoothing <output>{smoothing} frames</output></span><input type="range" min={1} max={9} step={2} value={smoothing} onChange={event => { const value = Number(event.target.value); setSmoothing(value); persistPreferences({ smoothing: value }); setGeneratedClip(null); }} /></label>
          <div className="motion-tracking-inline-fields"><label>Start<input type="number" min={0} value={trackStart} onChange={event => setTrackStart(Math.max(0, Number(event.target.value) || 0))} /></label><label>End<input type="number" min={trackStart} value={trackEnd} onChange={event => setTrackEnd(Math.max(trackStart, Number(event.target.value) || 0))} /></label></div>
          <div className="motion-tracking-choice-row"><span>Facing</span>{(['left', 'right', 'front', 'back'] as TrackingFacing[]).map(option => <button type="button" key={option} aria-pressed={facing === option} onClick={() => { setFacing(option); persistPreferences({ facing: option }); setGeneratedClip(null); }}>{option}</button>)}</div>
          <div className="motion-tracking-choice-row"><span>Inspect</span>{(['front', 'side', 'back'] as TrackingView[]).map(option => <button type="button" key={option} aria-pressed={view === option} onClick={() => { setView(option); persistPreferences({ view: option }); }}>{option}{option !== 'front' && <small> est.</small>}</button>)}</div>
          <div className="motion-tracking-action-row"><button type="button" className="secondary-button" disabled={!videoInfo || tracking || Boolean(smartEdit)} onClick={() => void runTracking()}>{tracking ? <><CircleStop size={13} /> Tracking…</> : <><Activity size={13} /> Track video</>}</button>{tracking && <button type="button" className="danger-button" onClick={() => { cancelTracking.current = true; }}>Cancel</button>}</div>
          {trackingFrames.length > 0 && <button type="button" className="secondary-button full-button" onClick={regenerateProcessedFrames}><WandSparkles size={13} /> Reprocess cached tracking</button>}
          {detectorError && <p className="motion-tracking-error" role="alert">{detectorError}</p>}
        </section>

        <section className="motion-tracking-section"><div className="motion-tracking-section-title"><span><Target size={14} /> Bone mapping</span><span className="motion-tracking-badge">{mappedCount} mapped</span></div><p className="motion-tracking-note">Landmarks drive the current Rig. Wrist and ankle targets use the existing IK solver.</p><button type="button" className="secondary-button full-button" onClick={autoMap}><WandSparkles size={13} /> Suggest mapping</button><div className="motion-tracking-mapping-list">{pairDefinitions.map(pair => { const binding = mapping.bones.find(item => item.start === pair.start && item.end === pair.end); const candidates = suggestions.filter(item => item.landmark === pair.start && item.boneId); return <label key={`${pair.start}-${pair.end}`} className="motion-tracking-map-row"><span>{pair.label}<small>{pair.start} → {pair.end}</small></span><select aria-label={`${pair.label} target bone`} value={binding?.boneId ?? ''} onChange={event => { const next = updateBoneMapping(mapping, pair.start, pair.end, event.target.value); setMapping(next); persistPreferences({ mapping: next }); setGeneratedClip(null); }}><option value="">Unmapped</option>{candidates.map(item => <option key={item.boneId} value={item.boneId!}>{rig.bones.get(item.boneId!)?.name}</option>)}{[...rig.bones.values()].filter(bone => !candidates.some(item => item.boneId === bone.id)).map(bone => <option key={bone.id} value={bone.id}>{bone.name}</option>)}</select></label>; })}</div></section>

        <section className="motion-tracking-section"><div className="motion-tracking-section-title"><span><Check size={14} /> Bake motion</span><span className="motion-tracking-badge">{generatedClip ? `${generatedClip.tracks.length} tracks` : 'NO CLIP'}</span></div><p className="motion-tracking-note">Preview stays temporary until you bake. Bake creates a native editable clip and one undo step.</p><div className="motion-tracking-action-row"><button type="button" className="secondary-button" disabled={!processedFrames.length || Boolean(smartEdit)} onClick={generateClip}><WandSparkles size={13} /> Generate clip</button><button type="button" className="primary-button" disabled={!generatedClip || Boolean(smartEdit)} onClick={bakeClip}>Bake to Timeline</button></div>{generatedClip && <><div className="motion-tracking-preview-controls"><button type="button" onClick={togglePreview}>{previewing ? <Square size={13} /> : <Play size={13} />} {previewing ? 'Stop preview' : 'Preview rig'}</button><input aria-label="Motion tracking preview frame" type="range" min={generatedClip.startFrame} max={generatedClip.endFrame} value={previewFrame} onChange={event => applyPreviewFrame(Number(event.target.value))} /></div><p className="motion-tracking-note">Frame {Math.round(previewFrame)} · edit the generated keys in the main Timeline, Dope Sheet, or Graph Editor.</p></>}</section>
      </aside>
    </div>
  </section>;
}
