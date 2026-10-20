import { Rig } from './Rig';
import { projectToSVG } from './export';
import type { ProjectSource } from './export';
import type { ProjectAudio, ProjectModel } from './model';
import { activeCameraId } from './camera';

export interface VideoExportOptions {
  format?: 'auto' | 'mp4' | 'webm';
  startFrame?: number;
  /** End exclusive, matching the timeline's duration in seconds. */
  endFrame?: number;
  fps?: number;
  scale?: number;
  includeAudio?: boolean;
  cameraView?: string;
  signal?: AbortSignal;
  onProgress?: (progress: VideoRenderProgress) => void;
}
export interface VideoRenderProgress { phase: 'preparing' | 'rendering' | 'finalizing'; frame: number; total: number; progress: number }
export interface VideoRenderPlan { startFrame: number; endFrame: number; sourceFps: number; fps: number; duration: number; frames: number; width: number; height: number }
export interface RenderedVideo { blob: Blob; format: 'mp4' | 'webm'; videoCodec: string; audioCodec: string | null; plan: VideoRenderPlan }

export function videoRenderPlan(project: Pick<ProjectModel, 'timeline' | 'canvas'>, options: VideoExportOptions = {}): VideoRenderPlan {
  const sourceFps = project.timeline.fps, fps = options.fps ?? sourceFps;
  const startFrame = options.startFrame ?? project.timeline.startFrame, endFrame = options.endFrame ?? project.timeline.endFrame;
  const scale = options.scale ?? 1;
  if (![sourceFps, fps, startFrame, endFrame, scale, project.canvas.width, project.canvas.height].every(Number.isFinite)
    || sourceFps <= 0 || fps < 1 || fps > 120 || startFrame < 0 || endFrame <= startFrame || scale <= 0 || scale > 4 || project.canvas.width <= 0 || project.canvas.height <= 0) {
    throw new Error('Choose a valid frame range, 1–120 FPS, and positive output dimensions. End frame must be after start frame.');
  }
  const duration = (endFrame - startFrame) / sourceFps, frames = Math.max(1, Math.ceil(duration * fps - 1e-9));
  const width = Math.max(2, Math.round(project.canvas.width * scale / 2) * 2), height = Math.max(2, Math.round(project.canvas.height * scale / 2) * 2);
  if (frames > 120000 || width > 8192 || height > 8192) throw new Error('Choose a shorter frame range or a smaller video resolution.');
  return { startFrame, endFrame, sourceFps, fps, duration, frames, width, height };
}

export function videoFrameAt(plan: VideoRenderPlan, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= plan.frames) throw new Error('Video frame index is outside the export range');
  const timestamp = index / plan.fps;
  return { frame: plan.startFrame + timestamp * plan.sourceFps, timestamp, duration: Math.min(1 / plan.fps, Math.max(0, plan.duration - timestamp)) };
}

/** Align project audio to a trimmed render, including leading silence and gain. */
export function videoAudioWindow(audio: ProjectAudio | undefined, plan: VideoRenderPlan, decodedDuration = audio?.duration ?? 0) {
  if (!audio || audio.muted || audio.volume <= 0) return null;
  const startSeconds = plan.startFrame / plan.sourceFps;
  const sourceOffset = Math.max(0, startSeconds - audio.offsetSeconds), outputOffset = Math.max(0, audio.offsetSeconds - startSeconds);
  const duration = Math.min(Math.min(audio.duration, decodedDuration) - sourceOffset, plan.duration - outputOffset);
  return duration > 0 ? { sourceOffset, outputOffset, duration, volume: Math.max(0, Math.min(1, audio.volume)) } : null;
}

function checkCancelled(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException('Video rendering cancelled', 'AbortError'); }

async function renderAudio(audio: ProjectAudio, plan: VideoRenderPlan, signal?: AbortSignal): Promise<AudioBuffer | null> {
  checkCancelled(signal);
  const response = await fetch(audio.src, { signal });
  if (!response.ok) throw new Error('Could not load the embedded project audio');
  const decoder = new OfflineAudioContext(2, 1, 48000);
  const decoded = await decoder.decodeAudioData(await response.arrayBuffer());
  checkCancelled(signal);
  const window = videoAudioWindow(audio, plan, decoded.duration);
  if (!window) return null;
  const context = new OfflineAudioContext(Math.min(2, decoded.numberOfChannels), Math.ceil(plan.duration * 48000), 48000);
  const source = context.createBufferSource(), gain = context.createGain(); source.buffer = decoded;
  gain.gain.value = window.volume; source.connect(gain); gain.connect(context.destination);
  source.start(window.outputOffset, window.sourceOffset, window.duration);
  const result = await context.startRendering(); checkCancelled(signal); return result;
}

async function drawFrame(rig: Rig, canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<void> {
  checkCancelled(signal);
  const url = URL.createObjectURL(new Blob([projectToSVG(rig)], { type: 'image/svg+xml' }));
  try {
    const image = new Image(); image.src = url; await image.decode(); checkCancelled(signal);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas rendering is unavailable in this browser');
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  } finally { URL.revokeObjectURL(url); }
}

/** Offline, timestamped frames. Never plays, records, or mutates the editor's rig. */
export async function renderProjectVideo(source: ProjectSource, options: VideoExportOptions = {}): Promise<RenderedVideo> {
  const project = source instanceof Rig ? source.toProject() : source;
  const plan = videoRenderPlan(project, options); checkCancelled(options.signal);
  if (typeof document === 'undefined' || typeof VideoEncoder === 'undefined') throw new Error('Video export needs a browser with WebCodecs encoding, such as Chrome or Edge, on localhost or HTTPS.');
  options.onProgress?.({ phase: 'preparing', frame: 0, total: plan.frames, progress: 0 });
  const rig = new Rig(project); rig.setTimeline({ isPlaying: false, loop: false });
  if (options.cameraView && options.cameraView !== 'current') {
    if (!['preview', 'switch', ...rig.cameras.map(camera => camera.id)].includes(options.cameraView)) throw new Error('The selected render camera no longer exists');
    rig.cameraView = options.cameraView;
  }
  const pcm = options.includeAudio !== false && videoAudioWindow(rig.audio, plan) ? await renderAudio(rig.audio!, plan, options.signal) : null;
  const { Output, BufferTarget, CanvasSource, AudioBufferSource, Mp4OutputFormat, WebMOutputFormat, Quality, getFirstEncodableVideoCodec, getFirstEncodableAudioCodec } = await import('mediabunny');
  checkCancelled(options.signal);
  const videoOptions = { width: plan.width, height: plan.height, frameRate: plan.fps };
  const audioOptions = pcm ? { sampleRate: pcm.sampleRate, numberOfChannels: pcm.numberOfChannels } : {};
  let format: 'mp4' | 'webm' = options.format === 'webm' ? 'webm' : 'mp4';
  let videoCodec = format === 'mp4' ? await getFirstEncodableVideoCodec(['avc'], videoOptions) : await getFirstEncodableVideoCodec(['vp9', 'vp8'], videoOptions);
  let audioCodec = pcm ? await getFirstEncodableAudioCodec(format === 'mp4' ? ['aac'] : ['opus'], audioOptions) : null;
  if ((!videoCodec || pcm && !audioCodec) && (options.format ?? 'auto') === 'auto') {
    format = 'webm'; videoCodec = await getFirstEncodableVideoCodec(['vp9', 'vp8'], videoOptions);
    audioCodec = pcm ? await getFirstEncodableAudioCodec(['opus'], audioOptions) : null;
  }
  if (!videoCodec || pcm && !audioCodec) throw new Error(`${format.toUpperCase()} encoding is unavailable at this resolution in this browser. Choose Auto or another format/resolution.`);
  const canvas = document.createElement('canvas'); canvas.width = plan.width; canvas.height = plan.height;
  const target = new BufferTarget(), output = new Output({ target, format: format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat() });
  const video = new CanvasSource(canvas, { codec: videoCodec, quality: new Quality('high'), latencyMode: 'quality', keyFrameInterval: 1 });
  const exactFrameCount = Math.abs(plan.frames / plan.fps - plan.duration) < 1e-8;
  output.addVideoTrack(video, { name: project.name, ...(exactFrameCount ? { frameRate: plan.fps } : {}), maximumPacketCount: plan.frames });
  const audio = pcm && audioCodec ? new AudioBufferSource({ codec: audioCodec, quality: new Quality({ bitrate: 128000 }) }) : null;
  if (audio) output.addAudioTrack(audio, { name: rig.audio?.name ?? 'Project audio' });
  output.setMetadataTags({ title: project.name, comment: 'Rendered frame-by-frame from Character Studio' });
  try {
    checkCancelled(options.signal); await output.start();
    const encodeFrames = async () => {
      let previousCamera: string | null | undefined;
      for (let index = 0; index < plan.frames; index++) {
        checkCancelled(options.signal); const time = videoFrameAt(plan, index);
        if (rig.timeline.activeAnimationId) rig.applyAnimation(rig.timeline.activeAnimationId, time.frame);
        else { rig.setTimeline({ currentFrame: time.frame }); rig.update(); }
        await drawFrame(rig, canvas, options.signal);
        const camera = activeCameraId(rig), cut = index === 0 || camera !== previousCamera; previousCamera = camera;
        await video.add(time.timestamp, time.duration, cut ? { keyFrame: true } : undefined);
        options.onProgress?.({ phase: 'rendering', frame: index + 1, total: plan.frames, progress: (index + 1) / plan.frames });
        if (index % 6 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      video.close();
    };
    const encodeAudio = async () => { if (audio && pcm) { checkCancelled(options.signal); await audio.add(pcm); audio.close(); } };
    await Promise.all([encodeFrames(), encodeAudio()]); checkCancelled(options.signal);
    options.onProgress?.({ phase: 'finalizing', frame: plan.frames, total: plan.frames, progress: 1 });
    await output.finalize(); checkCancelled(options.signal);
    if (!target.buffer) throw new Error('The video encoder did not produce a file');
    return { blob: new Blob([target.buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' }), format, videoCodec, audioCodec, plan };
  } catch (error) { await output.cancel().catch(() => {}); throw error; }
}

export function downloadRenderedVideo(video: RenderedVideo, basename = 'character-video'): void {
  const url = URL.createObjectURL(video.blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${basename.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'character-video'}.${video.format}`;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
