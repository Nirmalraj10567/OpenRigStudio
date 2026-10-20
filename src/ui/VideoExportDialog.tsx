import { useEffect, useMemo, useRef, useState } from 'react';
import { Car, Download, Film, Play, X } from 'lucide-react';
import { useProject } from '../state/projectStore';
import { projectToSVG } from '../engine/export';
import { createFrogCarScene } from '../engine/frogCarScene';
import { downloadRenderedVideo, renderProjectVideo, videoRenderPlan } from '../engine/videoExport';
import type { RenderedVideo, VideoExportOptions, VideoRenderPlan, VideoRenderProgress } from '../engine/videoExport';

export function VideoExportDialog({ onClose, onStatus, onSceneOpened }: { onClose: () => void; onStatus: (message: string) => void; onSceneOpened: () => void }) {
  const { rig, version } = useProject();
  const dialog = useRef<HTMLDialogElement>(null), abort = useRef<AbortController | null>(null), mounted = useRef(true);
  const [start, setStart] = useState(rig.timeline.startFrame), [end, setEnd] = useState(rig.timeline.endFrame);
  const [fps, setFps] = useState(rig.timeline.fps), [scale, setScale] = useState(1);
  const [format, setFormat] = useState<NonNullable<VideoExportOptions['format']>>('auto');
  const [camera, setCamera] = useState(rig.cameras.length ? 'switch' : 'current');
  const [includeAudio, setIncludeAudio] = useState(true), [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState<VideoRenderProgress | null>(null), [result, setResult] = useState<RenderedVideo | null>(null);
  const [error, setError] = useState(''), [url, setUrl] = useState('');
  useEffect(() => { mounted.current = true; dialog.current?.showModal(); return () => { mounted.current = false; abort.current?.abort(); }; }, []);
  useEffect(() => {
    if (!result) { setUrl(''); return; }
    const next = URL.createObjectURL(result.blob); setUrl(next); return () => URL.revokeObjectURL(next);
  }, [result]);
  const poster = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(projectToSVG(rig))}`, [rig, version]);
  const options: VideoExportOptions = { startFrame: start, endFrame: end, fps, scale, format, cameraView: camera, includeAudio };
  let plan: VideoRenderPlan | undefined; let validation = '';
  try { plan = videoRenderPlan(rig, options); } catch (issue) { validation = issue instanceof Error ? issue.message : 'Invalid export settings'; }

  const render = async () => {
    if (rendering || !plan) return;
    useProject.getState().pause(); const controller = new AbortController(); abort.current = controller;
    setRendering(true); setError(''); setResult(null); setProgress({ phase: 'preparing', frame: 0, total: plan.frames, progress: 0 });
    onStatus('Rendering video from the saved scene · editor pose remains intact');
    try {
      const rendered = await renderProjectVideo(useProject.getState().getProject(), { ...options, signal: controller.signal, onProgress: value => { if (mounted.current) setProgress(value); } });
      if (mounted.current) { setResult(rendered); onStatus(`Video ready · ${rendered.format.toUpperCase()} · ${rendered.plan.frames} frames · ${rendered.plan.duration.toFixed(2)}s`); }
    } catch (issue) {
      if (mounted.current) {
        const message = issue instanceof DOMException && issue.name === 'AbortError' ? 'Render cancelled · your scene and pose are unchanged.' : issue instanceof Error ? issue.message : 'Video rendering failed';
        setError(message); onStatus(message);
      }
    } finally { if (mounted.current) { setRendering(false); abort.current = null; } }
  };
  const close = () => { if (rendering) abort.current?.abort(); else onClose(); };
  const openScene = () => {
    const state = useProject.getState();
    if ((state.rig.layers.size || state.rig.bones.size) && !window.confirm('Open the complete frog car ride scene? Undo restores your current project.')) return;
    state.pause(); state.replaceProject(createFrogCarScene().toProject()); useProject.setState({ zoom: .9 });
    onStatus('Frog car ride opened · Play boarding, door movement, driving, and arrival · 10 seconds'); onSceneOpened();
  };
  const phase = progress?.phase === 'preparing' ? 'Preparing artwork, audio, and encoders…' : progress?.phase === 'finalizing' ? 'Finalizing the video file…' : `Rendering frame ${progress?.frame ?? 0} of ${progress?.total ?? plan?.frames ?? 0}`;

  return <dialog ref={dialog} className="video-export-dialog" aria-labelledby="video-export-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><span className="section-muted">FINAL VIDEO RENDER</span><h2 id="video-export-title"><Film size={20} /> Render your scene</h2><p>Frame-by-frame output with character views, camera shots, and project audio.</p></div><button aria-label={rendering ? 'Cancel video render' : 'Close video export'} onClick={close}><X size={18} /></button></header>
    <div className="video-export-content">
      <section className="video-export-settings">
        <fieldset className="stage-fields" disabled={rendering}>
          <div className="property-grid"><label className="camera-field">Start frame<input aria-label="Video start frame" type="number" min={0} step={1} value={start} onChange={event => setStart(Number(event.target.value))} /></label><label className="camera-field">End frame · exclusive<input aria-label="Video end frame" type="number" min={start + 1} step={1} value={end} onChange={event => setEnd(Number(event.target.value))} /></label></div>
          <label className="camera-field">Output FPS<select aria-label="Video FPS" value={fps} onChange={event => setFps(Number(event.target.value))}>{[...new Set([12, 24, 30, 60, rig.timeline.fps])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{value} FPS</option>)}</select></label>
          <label className="camera-field">Resolution<select aria-label="Video resolution" value={scale} onChange={event => setScale(Number(event.target.value))}>{[.5, 1, 2].map(value => <option key={value} value={value}>{Math.round(rig.canvas.width * value)} × {Math.round(rig.canvas.height * value)}{value === 1 ? ' · project size' : ` · ${value}×`}</option>)}</select></label>
          <label className="camera-field">File format<select aria-label="Video format" value={format} onChange={event => setFormat(event.target.value as typeof format)}><option value="auto">Auto · MP4 preferred</option><option value="mp4">MP4 · H.264 / AAC</option><option value="webm">WebM · VP9 or VP8 / Opus</option></select></label>
          <label className="camera-field">Render camera<select aria-label="Video camera" value={camera} onChange={event => setCamera(event.target.value)}><option value="current">Current viewport</option><option value="switch">Timeline camera cuts</option><option value="preview">Preview camera</option>{rig.cameras.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="check-label"><input aria-label="Include project audio" type="checkbox" checked={includeAudio} disabled={!rig.audio} onChange={event => setIncludeAudio(event.target.checked)} /> Include project audio</label>
          <p className="scope-note">{rig.audio ? `${rig.audio.name}${rig.audio.muted ? ' · muted' : ''} · volume ${Math.round(rig.audio.volume * 100)}%` : 'No audio in this project. Add audio through Rig & animate to include it.'}</p>
        </fieldset>
        {plan && <div className="video-plan-summary"><strong>{plan.duration.toFixed(2)} seconds</strong><span>{plan.frames} frames · {plan.width} × {plan.height} · {plan.fps} FPS</span></div>}
        <div className="video-scene-example"><strong><Car size={14} /> Complete workflow example</strong><p>Open an editable scene: frog boards, car door closes, wheels spin, road moves, camera follows, and original sound plays.</p><button className="secondary-button full-button" disabled={rendering} onClick={openScene}>Open frog car scene</button></div>
      </section>
      <section className="video-export-preview" aria-label="Video render preview">
        {result && url ? <video className="rendered-video" aria-label="Rendered video preview" src={url} controls playsInline /> : <img src={poster} alt="Current scene preview before video rendering" />}
        {rendering && <div className="video-render-progress" role="status"><span>{phase}</span><progress aria-label="Video render progress" max={1} value={progress?.progress ?? 0} /><small>{Math.round((progress?.progress ?? 0) * 100)}%</small></div>}
        {result && <div className="video-result" role="status"><strong>Render complete · {result.format.toUpperCase()}</strong><span>{result.plan.frames} frames · {result.plan.duration.toFixed(2)}s · {result.videoCodec === 'avc' ? 'H.264' : result.videoCodec.toUpperCase()}{result.audioCodec ? ` + ${result.audioCodec.toUpperCase()} audio` : ' · silent'}</span><span>{(result.blob.size / 1024 / 1024).toFixed(2)} MB · preview and download your final video</span></div>}
        {(error || validation) && <p className="video-render-error" role="alert">{error || validation}</p>}
        <p className="scope-note">Output uses the scene frame, excluding editor bones, grid, framing guides, and controller widgets. Rendering uses a private copy and can be cancelled.</p>
      </section>
    </div>
    <footer><span>{rig.name}</span><div>{rendering ? <button className="secondary-button" onClick={() => abort.current?.abort()}>Cancel rendering</button> : <button className="secondary-button" disabled={!plan || !rig.layers.size} onClick={() => void render()}><Play size={14} /> {result ? 'Render again' : 'Render final video'}</button>}{result && <button className="primary-button" onClick={() => downloadRenderedVideo(result, rig.name)}><Download size={14} /> Download {result.format.toUpperCase()}</button>}</div></footer>
  </dialog>;
}
