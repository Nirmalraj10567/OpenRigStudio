import { useEffect, useMemo, useRef, useState } from 'react';
import { createId, Rig } from '../engine/Rig';
import type { LipSyncCue, Viseme } from '../engine/model';
import { VISEMES, VISEME_LABELS, MAX_LIP_SYNC_TRACKS, MAX_LIP_SYNC_SECONDS, generateEnergyCues, importRhubarbCues, sampleViseme } from '../engine/lipSync';
import { createLipSyncDemo } from '../engine/lipSyncDemo';
import { useProject } from '../state/projectStore';
import { readLocalAudio } from './audioImport';

export const VISEME_COLORS: Record<Viseme, string> = { X: '#647785', A: '#9daaca', B: '#b399d0', C: '#77bcae', D: '#efb46e', E: '#e18c90', F: '#a1c472', G: '#79aeda', H: '#d49eb5' };

export function Waveform({ peaks }: { peaks: number[] }) {
  const path = useMemo(() => {
    const count = Math.min(240, peaks.length);
    const maximum = peaks.reduce((highest, value) => Math.max(highest, value), .02);
    return Array.from({ length: count }, (_, index) => {
      const start = Math.floor(index * peaks.length / count);
      const end = Math.max(start + 1, Math.floor((index + 1) * peaks.length / count));
      let value = 0;
      for (let i = start; i < end; i++) value = Math.max(value, peaks[i]);
      const height = Math.max(.6, value / maximum * 19);
      return `M${index * 1000 / count},${20 - height}v${height * 2}`;
    }).join(' ');
  }, [peaks]);
  return <svg className="audio-waveform" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-label="Audio amplitude waveform" role="img"><path d={path} fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
}

/** Nine paths instead of thousands of cue DOM nodes for long recordings. */
export function CueStrip({ cues, start, end, time, onSeek }: { cues: LipSyncCue[]; start: number; end: number; time: number; onSeek: (time: number) => void }) {
  const span = Math.max(.001, end - start);
  const paths = useMemo(() => VISEMES.map(viseme => ({ viseme, d: cues.filter(cue => cue.viseme === viseme && cue.end > start && cue.start < end).map(cue => {
    const x = (Math.max(start, cue.start) - start) / span * 1000;
    const width = (Math.min(end, cue.end) - Math.max(start, cue.start)) / span * 1000;
    return `M${x},2h${width}v20h${-width}Z`;
  }).join(' ') })), [cues, start, end, span]);
  return <div className="cue-strip" role="slider" tabIndex={0} aria-label="Seek mouth cues" aria-valuemin={start} aria-valuemax={end} aria-valuenow={Math.min(end, Math.max(start, time))}
    onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); onSeek(event.key === 'Home' ? start : event.key === 'End' ? end : Math.min(end, Math.max(start, time + (event.key === 'ArrowRight' ? .1 : -.1)))); } }}
    onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); onSeek(start + (event.clientX - rect.left) / rect.width * span); }}>
    <svg viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden="true">{paths.map(({ viseme, d }) => <path key={viseme} d={d} fill={VISEME_COLORS[viseme]} />)}<path d={`M${(time - start) / span * 1000},0v24`} stroke="#fff" strokeWidth="3" /></svg>
  </div>;
}

export function LipSyncPanel({ onStatus, onDemo }: { onStatus: (message: string) => void; onDemo: () => void }) {
  const { rig, smartEdit, projectGeneration } = useProject();
  const [trackId, setTrackId] = useState('');
  const [name, setName] = useState('Mouth');
  const [boneId, setBoneId] = useState('');
  const [cueId, setCueId] = useState('');
  const [start, setStart] = useState('0');
  const [duration, setDuration] = useState('0.15');
  const [viseme, setViseme] = useState<Viseme>('C');
  const [threshold, setThreshold] = useState(.04);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const generation = useRef(0);
  const audioInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const track = rig.lipSyncTracks.find(item => item.id === trackId) ?? rig.lipSyncTracks[0];
  const time = rig.timeline.currentFrame / rig.timeline.fps;
  const clip = rig.audio;
  const report = (text: string) => { setMessage(text); onStatus(text); };
  useEffect(() => { generation.current++; setBusy(false); setCueId(''); setPage(0); }, [projectGeneration]);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { setCueId(''); setPage(0); }, [track?.id]);
  const edit = (mutator: (project: Rig) => void) => {
    const state = useProject.getState();
    if (state.smartEdit) return;
    state.pause(); state.updateProject(mutator);
  };
  const seek = (seconds: number) => {
    if (useProject.getState().smartEdit) return;
    useProject.getState().pause(); useProject.getState().setCurrentTime(seconds);
  };
  const expand = (project: Rig, seconds: number) => project.setTimeline({ endFrame: Math.max(project.timeline.endFrame, Math.ceil(seconds * project.timeline.fps)) });
  const applyCues = (cues: LipSyncCue[], replacing: boolean) => {
    if (!track || useProject.getState().smartEdit) return false;
    const current = useProject.getState().rig.lipSyncTracks.find(item => item.id === track.id);
    if (!current) return false;
    if (replacing && current.cues.length && !window.confirm(`Replace all ${current.cues.length} cues in “${current.name}”? Undo restores them.`)) return false;
    let success = false;
    edit(project => { success = project.setLipSyncCues(track.id, cues); if (success) expand(project, Math.max(0, ...cues.map(cue => cue.end))); });
    if (!success) report('Cues need finite non-negative times, positive durations, and no overlaps. No cues were changed.');
    return success;
  };
  const selectCue = (cue: LipSyncCue) => { setCueId(cue.id); setStart(String(cue.start)); setDuration(String(cue.end - cue.start)); setViseme(cue.viseme); seek(cue.start); };
  const saveCue = () => {
    if (!track) return;
    const begin = Number(start), length = Number(duration);
    if (!start.trim() || !duration.trim() || !Number.isFinite(begin) || !Number.isFinite(length) || begin < 0 || length <= 0) { report('Enter a start at or after 0 seconds and a positive duration.'); return; }
    const original = track.cues.find(cue => cue.id === cueId);
    const end = original && begin === original.start && length === original.end - original.start ? original.end : Number((begin + length).toFixed(9));
    const cue = { id: cueId || createId('cue'), start: begin, end, viseme };
    if (applyCues([...track.cues.filter(item => item.id !== cueId), cue], false)) { setCueId(cue.id); report(`${viseme} cue saved at ${begin.toFixed(2)}s · Undo available`); }
  };
  const importAudio = async (file: File) => {
    const state = useProject.getState();
    if (state.smartEdit) return;
    if (state.rig.audio && !window.confirm('Replace the audio clip? Existing mouth cues stay at their project times; Undo restores the old audio.')) return;
    state.pause();
    const token = ++generation.current;
    const id = state.rig.id, revision = state.projectGeneration;
    const valid = () => token === generation.current && useProject.getState().rig.id === id && useProject.getState().projectGeneration === revision && !useProject.getState().smartEdit;
    setBusy(true); report('Decoding local audio…');
    try {
      const audio = await readLocalAudio(file);
      if (!valid()) return;
      edit(project => { project.audio = audio; expand(project, audio.duration); });
      report(`Imported ${audio.name} · ${audio.duration.toFixed(2)}s · Stored locally in the project. Save JSON for a portable copy.`);
    } catch (error) { if (valid()) report(error instanceof Error ? error.message : 'Audio import failed.'); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const importJSON = async (file: File) => {
    if (!track || useProject.getState().smartEdit) return;
    if (file.size > 2 * 1024 * 1024) { report('Rhubarb JSON must be 2 MB or smaller.'); return; }
    const token = ++generation.current, id = rig.id, revision = projectGeneration, targetId = track.id, offset = clip?.offsetSeconds ?? 0;
    const valid = () => { const state = useProject.getState(); return token === generation.current && state.rig.id === id && state.projectGeneration === revision && !state.smartEdit && state.rig.lipSyncTracks.some(item => item.id === targetId); };
    setBusy(true);
    try {
      const json = await file.text();
      if (!valid()) return;
      const cues = importRhubarbCues(json, offset);
      if (applyCues(cues, true)) { setCueId(''); report(`Imported ${cues.length} Rhubarb cues at audio offset ${offset}s. All processing stayed local.`); }
    } catch (error) { if (valid()) report(error instanceof Error ? error.message : 'Invalid Rhubarb JSON.'); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const shownPage = Math.min(page, Math.max(0, Math.ceil((track?.cues.length ?? 0) / 30) - 1));
  return <section className="dock-section lip-sync-section" aria-label="Mouth and lip sync">
    <div className="section-title"><button className="lip-panel-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '▾' : '▸'} Mouth & lip sync</button><span className="mode-badge">LOCAL</span></div>
    <div hidden={!expanded}>
    {smartEdit && <p className="edit-notice">Capture or cancel the Smart Action edit to change mouths or play audio.</p>}
    <fieldset className="property-fields lip-fields" disabled={Boolean(smartEdit) || busy}>
      <details className="lip-help"><summary>How to animate a mouth</summary><ol><li>Create nine mouth shapes, or make a track and map your own artwork.</li><li>Import local audio and set its offset.</li><li>Enter timed cues, import offline Rhubarb JSON, or generate an approximate amplitude draft and correct it.</li><li>Play or seek the timeline. Gaps use X (rest).</li></ol></details>
      <div className="panel-buttons"><button className="secondary-button" onClick={() => { if (!window.confirm('Open the mouth demo and replace this project? Undo restores your work.')) return; edit(() => undefined); useProject.getState().replaceProject(createLipSyncDemo().toProject()); onDemo(); report('Mouth demo: manually timed visemes, no speech recording. Press Play.'); }}>Open mouth demo</button></div>
      <details className="action-create" open={!rig.lipSyncTracks.length}><summary>Create a mouth track</summary>
        <label className="lip-field">Mouth set name<input maxLength={512} value={name} onChange={event => setName(event.target.value)} /></label>
        <label className="lip-field">Optional head bone<select value={rig.bones.has(boneId) ? boneId : ''} onChange={event => setBoneId(event.target.value)}><option value="">Standalone (stage center)</option>{[...rig.bones.values()].map(bone => <option key={bone.id} value={bone.id}>{bone.name}</option>)}</select></label>
        <div className="panel-buttons"><button className="secondary-button" disabled={rig.lipSyncTracks.length >= MAX_LIP_SYNC_TRACKS} onClick={() => { let id: string | null = null; edit(project => { const bone = project.bones.get(boneId); id = project.createMouthSet(name.trim() || 'Mouth', bone?.id ?? null, bone ? { x: bone.world.x, y: bone.world.y } : undefined); }); if (id) { setTrackId(id); report('Nine mouth shapes created and mapped. Add timed cues below.'); } else report('Could not create mouth shapes. Check the selected bone.'); }}>Create mouth set</button>
          <button className="secondary-button" disabled={rig.lipSyncTracks.length >= MAX_LIP_SYNC_TRACKS} onClick={() => { const id = createId('lip'); edit(project => { if (project.lipSyncTracks.length < MAX_LIP_SYNC_TRACKS) project.lipSyncTracks.push({ id, name: name.trim() || 'Mouth', enabled: true, mapping: {}, cues: [] }); }); setTrackId(id); report('Manual track created. Map each viseme to existing artwork.'); }}>Use existing artwork</button></div>
      </details>
      <div className="property-subtitle">Local audio</div>
      <input className="hidden-input" ref={audioInput} type="file" accept=".wav,.mp3,.ogg,audio/wav,audio/mpeg,audio/ogg" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importAudio(file); }} />
      <button className="secondary-button full-button" onClick={() => audioInput.current?.click()}>{clip ? 'Replace audio' : 'Import audio'}</button>
      <p className="scope-note">WAV / MP3 / OGG if supported by your browser. Max 12 MB, 5 min. No uploads or speech service.</p>
      {clip && <>
        <div className="audio-clip-name" title={clip.name}>{clip.name} <span>{clip.duration.toFixed(2)}s</span></div>
        <div className="waveform-seek" role="button" tabIndex={0} aria-label="Seek to audio start" onKeyDown={event => { if (event.key === 'Enter') seek(clip.offsetSeconds); }} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); seek(clip.offsetSeconds + (event.clientX - rect.left) / rect.width * clip.duration); }}><Waveform peaks={clip.peaks} /></div>
        <div className="property-grid"><label className="lip-field">Audio offset (seconds)<input type="number" min="0" max={MAX_LIP_SYNC_SECONDS - clip.duration} step="0.1" value={clip.offsetSeconds} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0 && value + clip.duration <= MAX_LIP_SYNC_SECONDS) edit(project => { if (project.audio) { project.audio.offsetSeconds = value; expand(project, value + project.audio.duration); } }); }} /></label>
          <label className="lip-field">Volume ({Math.round(clip.volume * 100)}%)<input type="range" min="0" max="1" step="0.05" value={clip.volume} onChange={event => edit(project => { if (project.audio) project.audio.volume = Number(event.target.value); })} /></label></div>
        <div className="panel-buttons"><label className="check-label"><input type="checkbox" checked={clip.muted} onChange={event => edit(project => { if (project.audio) project.audio.muted = event.target.checked; })} />Mute</label><button className="danger-button" onClick={() => { generation.current++; edit(project => { project.audio = undefined; }); report('Audio removed; timed cues preserved. Undo restores the clip.'); }}>Remove audio</button></div>
        <p className="scope-note">Offset moves audio only; existing cues keep their project times. New imports and drafts include the offset.</p>
      </>}
      {track && <>
        <div className="property-subtitle">Viseme track</div>
        <label className="lip-field">Active mouth track<select value={track.id} onChange={event => setTrackId(event.target.value)}>{rig.lipSyncTracks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="lip-field">Track name<input maxLength={512} key={`${rig.id}-${projectGeneration}-${track.id}`} defaultValue={track.name} onBlur={event => { const value = event.target.value.trim(); if (value && value !== track.name) edit(project => { const target = project.lipSyncTracks.find(item => item.id === track.id); if (target) target.name = value; }); else if (!value) event.target.value = track.name; }} /></label>
        <div className="panel-buttons"><label className="check-label"><input type="checkbox" checked={track.enabled} onChange={event => edit(project => { const target = project.lipSyncTracks.find(item => item.id === track.id); if (target) target.enabled = event.target.checked; })} />Enabled</label><button className="danger-button" onClick={() => { if (window.confirm('Remove this mouth track? Artwork is kept. Undo restores the track.')) edit(project => { project.removeLipSyncTrack(track.id); }); }}>Remove track</button></div>
        <div className="current-viseme">{time.toFixed(2)}s <strong>{track.enabled ? sampleViseme(track.cues, time) : 'OFF'}</strong><span>{track.enabled ? VISEME_LABELS[sampleViseme(track.cues, time)] : 'Disabled · rest mouth'}</span></div>
        <details className="action-create"><summary>Map X / A–H to artwork</summary><p className="scope-note">Only the active shape is shown. Unmapped shapes fall back to X (rest); without X there is no mouth. Use separate artwork per mouth track.</p><div className="viseme-mapping">{VISEMES.map(value => <label key={value}><span title={VISEME_LABELS[value]}>{value}</span><select aria-label={`${value} ${VISEME_LABELS[value]} artwork`} value={track.mapping[value] ?? ''} onChange={event => { let ok = false; edit(project => { ok = project.setVisemeMapping(track.id, value, event.target.value || null); }); if (!ok) report('That artwork cannot be mapped to this viseme.'); }}><option value="">Unmapped · {VISEME_LABELS[value]}</option>{rig.layersInOrder.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>)}</div></details>
        <CueStrip cues={track.cues} start={rig.timeline.startFrame / rig.timeline.fps} end={rig.timeline.endFrame / rig.timeline.fps} time={time} onSeek={value => { const cue = track.cues.find(item => value >= item.start && value < item.end); if (cue) selectCue(cue); else seek(value); }} />
        <p className="scope-note">Click a cue to select and seek. Times are project seconds.</p>
        <div className="property-grid"><label className="lip-field">Cue start (seconds)<input type="number" min="0" step="0.01" value={start} onChange={event => setStart(event.target.value)} /></label><label className="lip-field">Duration (seconds)<input type="number" min="0.001" step="0.01" value={duration} onChange={event => setDuration(event.target.value)} /></label></div>
        <div className="panel-buttons"><button className="secondary-button" onClick={() => setStart(String(time))}>Use current frame</button><button className="secondary-button" onClick={() => { setCueId(''); setStart(String(time)); }}>New cue</button></div>
        <label className="lip-field">Viseme<select value={viseme} onChange={event => setViseme(event.target.value as Viseme)}>{VISEMES.map(value => <option key={value} value={value}>{value} · {VISEME_LABELS[value]}</option>)}</select></label>
        <div className="panel-buttons"><button className="secondary-button" onClick={saveCue}>{cueId ? 'Update cue' : 'Insert cue'}</button><button className="danger-button" disabled={!cueId} onClick={() => { if (applyCues(track.cues.filter(cue => cue.id !== cueId), false)) { setCueId(''); report('Cue deleted.'); } }}>Delete cue</button></div>
        <div className="cue-list">{track.cues.slice(shownPage * 30, shownPage * 30 + 30).map(cue => <button key={cue.id} className={cue.id === cueId ? 'selected' : ''} onClick={() => selectCue(cue)}><b style={{ color: VISEME_COLORS[cue.viseme] }}>{cue.viseme}</b>{cue.start.toFixed(2)}–{cue.end.toFixed(2)}s</button>)}</div>
        {track.cues.length > 30 && <div className="panel-buttons"><button className="secondary-button" disabled={shownPage === 0} onClick={() => setPage(shownPage - 1)}>Previous cues</button><span>{shownPage + 1} / {Math.ceil(track.cues.length / 30)}</span><button className="secondary-button" disabled={(shownPage + 1) * 30 >= track.cues.length} onClick={() => setPage(shownPage + 1)}>Next cues</button></div>}
        <p className="scope-note">{track.cues.length} cues · Overlaps are rejected · Gaps = X</p>
        <input ref={jsonInput} className="hidden-input" type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importJSON(file); }} />
        <button className="secondary-button full-button" onClick={() => jsonInput.current?.click()}>Import Rhubarb JSON</button>
        <p className="scope-note">Import mouthCues generated by Rhubarb offline. This app does not run phoneme detection.</p>
        <details className="amplitude-draft"><summary>Approximate amplitude draft</summary><p className="scope-note"><strong>Not phoneme recognition.</strong> RMS loudness suggests X / C / D only. Correct these editable cues while listening.</p><label className="lip-field">Silence threshold (RMS)<input type="number" min="0" max="1" step="0.01" value={threshold} onChange={event => setThreshold(Math.max(0, Math.min(1, Number(event.target.value))))} /></label><button className="secondary-button full-button" disabled={!clip} onClick={() => { if (!clip) return; try { const cues = generateEnergyCues(clip.peaks, clip.duration, clip.offsetSeconds, threshold); if (applyCues(cues, true)) { setCueId(''); report(`Created ${cues.length} approximate amplitude cues. Not phoneme detection; review and edit while listening.`); } } catch (error) { report(error instanceof Error ? error.message : 'Could not generate draft.'); } }}>Generate editable amplitude draft</button>{!clip && <p className="scope-note">Import audio first.</p>}</details>
      </>}
    </fieldset>
    {(busy || message) && <p className="lip-status" role="status">{message}</p>}
    </div>
  </section>;
}
