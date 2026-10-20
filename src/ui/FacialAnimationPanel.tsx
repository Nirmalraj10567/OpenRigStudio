import { useEffect, useRef, useState } from 'react';
import { Camera, CircleStop, Mic2, Play, ScanFace, Square, WandSparkles } from 'lucide-react';
import type { FacialParameters, FacialTargetRole } from '../engine/model';
import { FACIAL_CHANNELS, FACIAL_LABELS, calibrateFacialValues, createAudioFacialClip, createFacialProfile, defaultFacialPresets, mapFacialTarget, normalizeFacialParameters, recordFacialKey, recordFacialTake } from '../engine/facialAnimation';
import { useProject } from '../state/projectStore';

const ROLES: FacialTargetRole[] = ['head', 'leftEye', 'rightEye', 'leftPupil', 'rightPupil', 'leftBrow', 'rightBrow', 'mouth', 'openMouth', 'jaw'];
const blend = (result: any, names: string[]) => {
  const categories = result?.faceBlendshapes?.[0]?.categories ?? [];
  const item = categories.find((entry: any) => names.includes(entry.categoryName));
  return typeof item?.score === 'number' ? item.score : 0;
};
const distance = (a: any, b: any) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
const faceParameters = (result: any): FacialParameters => {
  const points = result?.faceLandmarks?.[0];
  if (!points) return normalizeFacialParameters({});
  const leftEye = points[33], rightEye = points[263], nose = points[1], leftTop = points[159], leftBottom = points[145], rightTop = points[386], rightBottom = points[374];
  const eyeWidth = Math.max(.001, distance(leftEye, rightEye));
  const eyeMidY = ((leftEye?.y ?? 0) + (rightEye?.y ?? 0)) / 2;
  const faceWidth = Math.max(.001, distance(points[234], points[454]));
  const mouthOpen = blend(result, ['jawOpen']) || Math.min(1, distance(points[13], points[14]) / Math.max(.001, distance(points[61], points[291])) * 2.5);
  const leftRatio = distance(leftTop, leftBottom) / Math.max(.001, distance(points[33], points[133]));
  const rightRatio = distance(rightTop, rightBottom) / Math.max(.001, distance(points[362], points[263]));
  return normalizeFacialParameters({
    blinkLeft: blend(result, ['eyeBlinkLeft']) || Math.max(0, Math.min(1, (.23 - leftRatio) * 8)),
    blinkRight: blend(result, ['eyeBlinkRight']) || Math.max(0, Math.min(1, (.23 - rightRatio) * 8)),
    browLeft: blend(result, ['browOuterUpLeft', 'browInnerUp']) - blend(result, ['browDownLeft']),
    browRight: blend(result, ['browOuterUpRight', 'browInnerUp']) - blend(result, ['browDownRight']),
    eyeX: (nose?.x ?? .5) - ((leftEye?.x ?? .5) + (rightEye?.x ?? .5)) / 2,
    eyeY: ((nose?.y ?? .5) - eyeMidY) * 2,
    headYaw: ((nose?.x ?? .5) - ((leftEye?.x ?? .5) + (rightEye?.x ?? .5)) / 2) / faceWidth * 90,
    headPitch: ((nose?.y ?? .5) - eyeMidY) * 100,
    headRoll: Math.atan2((rightEye?.y ?? 0) - (leftEye?.y ?? 0), (rightEye?.x ?? 1) - (leftEye?.x ?? 0)) * 180 / Math.PI,
    smile: blend(result, ['mouthSmileLeft', 'mouthSmileRight']) / 2,
    mouthOpen,
  });
};

export function FacialAnimationPanel({ onStatus }: { onStatus: (message: string) => void }) {
  const { rig, smartEdit, updateProject, version } = useProject();
  const [profileId, setProfileId] = useState('');
  const [live, setLive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [message, setMessage] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const landmarker = useRef<any>(null);
  const frame = useRef<number | null>(null);
  const samples = useRef<Array<{ frame: number; values: FacialParameters }>>([]);
  const captureStart = useRef(0);
  const lastValues = useRef<FacialParameters>(normalizeFacialParameters({}));
  const profile = rig.facialProfiles.find(item => item.id === profileId) ?? rig.facialProfiles[0];
  const report = (value: string) => { setMessage(value); onStatus(value); };

  useEffect(() => { if (profile && profile.id !== profileId) setProfileId(profile.id); }, [profile?.id, profileId]);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); stream.current?.getTracks().forEach(track => track.stop()); landmarker.current?.close(); }, []);

  const setLiveValues = (values: FacialParameters) => {
    if (!profile) return;
    lastValues.current = values;
    const state = useProject.getState(); state.rig.setFacialLive(profile.id, values); useProject.setState({ version: state.version + 1 });
  };
  const detect = async () => {
    if (!video.current || !landmarker.current || !profile) return;
    const result = landmarker.current.detectForVideo(video.current, performance.now());
    const measured = calibrateFacialValues(faceParameters(result), profile.calibration);
    const values = normalizeFacialParameters(Object.fromEntries(FACIAL_CHANNELS.map(channel => [channel, lastValues.current[channel] * .65 + measured[channel] * .35])));
    setLiveValues(values);
    if (recording) samples.current.push({ frame: Math.round((performance.now() - captureStart.current) / 1000 * rig.timeline.fps), values });
    frame.current = requestAnimationFrame(() => void detect());
  };
  const startCamera = async () => {
    if (!profile || live) return;
    setCameraError('');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (!video.current) return;
      video.current.srcObject = stream.current; await video.current.play();
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm');
      landmarker.current = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true });
      setLive(true); report('Face camera live · move, blink, smile, and turn to preview the rig'); void detect();
    } catch (error) {
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
      const text = error instanceof Error ? error.message : 'Camera or face model could not start'; setCameraError(text); report(text);
    }
  };
  const stopCamera = () => { if (frame.current) cancelAnimationFrame(frame.current); frame.current = null; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; landmarker.current?.close(); landmarker.current = null; setLive(false); setRecording(false); rig.clearFacialLive(profile?.id); useProject.setState({ version: useProject.getState().version + 1 }); report('Face camera stopped · authored animation is unchanged'); };
  const applyPreset = (values: FacialParameters) => { if (!profile) return; updateProject(project => { const target = project.facialProfiles.find(item => item.id === profile.id); if (target) target.values = values; project.setFacialLive(profile.id, values); }); report('Expression preset applied · key it or start a capture'); };
  const createProfile = () => { let id: string | null = null; updateProject(project => { id = project.createFacialProfile('Face performance'); }); if (id) { setProfileId(id); report('Face profile created · map targets or start the camera'); } else report('Select a rigged face before creating a profile'); };
  const keyCurrent = () => { if (!profile) return; updateProject(project => { project.facialProfiles.find(item => item.id === profile.id)!.values = lastValues.current; recordFacialKey(project, profile.id, lastValues.current); }); report(`Facial key recorded at frame ${Math.round(rig.timeline.currentFrame)}`); };
  const startRecord = () => { if (!profile || !live) return; samples.current = []; captureStart.current = performance.now(); setRecording(true); report('Recording facial performance…'); };
  const stopRecord = () => { if (!profile || !recording) return; setRecording(false); const take = samples.current; updateProject(project => { recordFacialTake(project, profile.id, take); }); report(`Facial performance recorded · ${take.length} samples · editable timeline keys created`); };
  const audioDraft = () => { if (!profile || !rig.audio) return report('Import project audio first'); const clip = createAudioFacialClip(rig, profile.id); if (!clip) return; updateProject(project => { project.animations.push(clip); project.setTimeline({ activeAnimationId: clip.id, startFrame: clip.startFrame, endFrame: clip.endFrame, currentFrame: clip.startFrame, loop: false }); }); report('Audio facial draft created · mouth opening and blinking are editable'); };
  const calibrate = () => { if (!profile) return; updateProject(project => { const target = project.facialProfiles.find(item => item.id === profile.id)!; target.calibration.neutral = lastValues.current; }); report('Neutral face calibrated'); };
  const map = (role: FacialTargetRole, id: string) => { updateProject(project => { mapFacialTarget(project, profile!.id, role, id || null); }); };
  const allTargets = [...rig.bones.values(), ...rig.layers.values()];
  return <section className="dock-section facial-section" aria-label="Facial animation">
    <div className="section-title"><span><ScanFace size={15} /> Facial animation</span><span className="mode-badge">FACE LAB</span></div>
    <p className="scope-note">Talking head controls, expression presets, audio drafts, and local webcam capture. Face tracking requires camera permission and a model download.</p>
    {smartEdit && <p className="edit-notice">Capture or cancel the Smart Bone edit before using facial animation.</p>}
    {!profile ? <button className="secondary-button full-button" disabled={Boolean(smartEdit)} onClick={createProfile}><ScanFace size={14} /> Create face profile</button> : <>
      <label className="select-field"><span>Face profile</span><select aria-label="Facial profile" value={profile.id} onChange={event => setProfileId(event.target.value)}>{rig.facialProfiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="panel-buttons"><button className="secondary-button" disabled={Boolean(smartEdit) || live} onClick={createProfile}><ScanFace size={13} /> New profile</button><button className="secondary-button" disabled={Boolean(smartEdit)} onClick={() => applyPreset(defaultFacialPresets()[1].values)}><WandSparkles size={13} /> Smile preset</button></div>
      <div className="property-subtitle">Face targets</div>
      <div className="facial-target-grid">{ROLES.map(role => <label key={role} className="select-field"><span>{role}</span><select aria-label={`Face target ${role}`} value={profile.targets[role] ?? ''} disabled={Boolean(smartEdit)} onChange={event => map(role, event.target.value)}><option value="">Unmapped</option>{allTargets.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label>)}</div>
      <div className="property-subtitle">Live controls</div>
      <div className="facial-sliders">{FACIAL_CHANNELS.map(channel => <label key={channel} className="style-range"><span>{FACIAL_LABELS[channel]} <output>{Math.round((profile.values[channel] ?? 0) * 100)}%</output></span><input aria-label={`Facial ${channel}`} type="range" min={channel.startsWith('head') ? -90 : channel === 'headPitch' ? -60 : channel === 'headRoll' ? -45 : -1} max={channel.startsWith('head') && channel !== 'headPitch' && channel !== 'headRoll' ? 90 : channel === 'headPitch' ? 60 : channel === 'headRoll' ? 45 : 1} step=".01" value={profile.values[channel] ?? 0} disabled={Boolean(smartEdit)} onChange={event => { const values = normalizeFacialParameters({ ...profile.values, [channel]: Number(event.target.value) }); applyPreset(values); }} /></label>)}</div>
      <div className="panel-buttons">{profile.presets.map(preset => <button key={preset.id} className="secondary-button" disabled={Boolean(smartEdit)} onClick={() => applyPreset(preset.values)}>{preset.name}</button>)}</div>
      <div className="panel-buttons"><button className="secondary-button" disabled={Boolean(smartEdit)} onClick={keyCurrent}><Square size={13} /> Key face</button><button className="secondary-button" disabled={Boolean(smartEdit) || !rig.audio} onClick={audioDraft}><Mic2 size={13} /> Audio facial draft</button><button className="secondary-button" disabled={Boolean(smartEdit) || !live} onClick={calibrate}>Calibrate neutral</button></div>
      <div className="facial-camera-card"><video ref={video} muted playsInline aria-label="Facial tracking camera preview" />{live ? <button className="danger-button full-button" onClick={stopCamera}><CircleStop size={14} /> Stop face camera</button> : <button className="secondary-button full-button" disabled={Boolean(smartEdit)} onClick={() => void startCamera()}><Camera size={14} /> Start webcam face tracking</button>}{live && <div className="panel-buttons"><button className="secondary-button" disabled={recording} onClick={startRecord}><Play size={13} /> Record performance</button><button className="danger-button" disabled={!recording} onClick={stopRecord}><Square size={13} /> Stop & save take</button></div>}<p className="scope-note">{recording ? 'Recording blink, eyes, brows, head pose, smile, and jaw.' : 'Preview is transient until you record keys.'}</p>{cameraError && <p className="video-render-error" role="alert">{cameraError}</p>}</div>
    </>}
    {message && <p className="lip-status" role="status">{message}</p>}
  </section>;
}
