import { useState } from 'react';
import { Hand } from 'lucide-react';
import { useProject } from '../state/projectStore';
import { applyHandPose, fingerCurl, getHandRigs, setFingerCurl, handTurnAvailable, handTurnAngle, setHandTurn } from '../engine/handRig';
import type { FingerName, HandPose } from '../engine/handRig';

export function HandRigPanel({ onStatus }: { onStatus: (message: string) => void }) {
  const { rig, selectedId, updateProject, pause, select, smartEdit } = useProject();
  const [handId, setHandId] = useState('');
  const [digit, setDigit] = useState<FingerName>('Index');
  const hands = getHandRigs(rig);
  const hand = hands.find(hand => hand.id === handId) ?? hands.find(hand => hand.wristBoneId === selectedId || hand.fingers.some(f => f.boneIds.includes(selectedId ?? ''))) ?? hands[0];
  if (!hand) return null;
  const finger = hand.fingers.find(finger => finger.name === digit)!;
  const hasTurn = handTurnAvailable(rig, hand), turn = handTurnAngle(rig, hand);
  const turnHand = (degrees: number) => { pause(); updateProject(project => { setHandTurn(project, hand.id, degrees); }); };
  const pose = (value: HandPose) => { pause(); updateProject(project => { applyHandPose(project, hand.id, value); }); onStatus(`${hand.name} · ${value} pose · individual finger bones remain editable`); };
  return <section className="dock-section" aria-label="Hands and fingers">
    <div className="section-title"><span><Hand size={14} /> Hands & fingers</span><span className="stage-badge active">{hasTurn ? '360° + DIGITS' : 'ARTICULATED'}</span></div>
    <fieldset className="stage-fields" disabled={Boolean(smartEdit) || rig.getStageView().enabled}>
      <label className="select-field"><span>Hand</span><select aria-label="Hand rig" value={hand.id} onChange={event => setHandId(event.target.value)}>{hands.map(hand => <option key={hand.id} value={hand.id}>{hand.name} · 5 digits</option>)}</select></label>
      {hasTurn && <>
        <label className="camera-range"><span>Wrist turn · {Math.round(turn)}°</span><input aria-label="Wrist turn" type="range" min={0} max={360} step={1} value={turn >= 0 && turn <= 360 ? turn : ((turn % 360) + 360) % 360} onChange={event => turnHand(Number(event.target.value))} /></label>
        <label className="property-field"><span>Turn ° · unwrapped</span><input aria-label="Wrist turn degrees" type="number" step={5} value={Number(turn.toFixed(1))} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) turnHand(value); }} /></label>
        <div className="camera-shot-actions">{[[0, 'Back'], [90, 'Edge'], [180, 'Palm'], [270, 'Edge'], [360, 'Back']] .map(([degrees, label]) => <button key={degrees} className="secondary-button" aria-label={`${label} at ${degrees} degrees`} onClick={() => turnHand(Number(degrees))}>{label} {degrees}°</button>)}</div>
        <p className="scope-note">Roll this wrist independently of the body and finger pose. Auto-key preserves full revolutions; enter negative angles or values above 360° for additional turns.</p>
      </>}
      <div className="camera-shot-actions">{(['reference', 'open', 'grip', 'point'] as HandPose[]).map(value => <button key={value} className="secondary-button" onClick={() => pose(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      <label className="select-field"><span>Finger / thumb</span><select aria-label="Finger" value={digit} onChange={event => { const name = event.target.value as FingerName; setDigit(name); select(hand.fingers.find(f => f.name === name)!.boneIds[0]); }}>{hand.fingers.map(finger => <option key={finger.name} value={finger.name}>{finger.name} · {finger.boneIds.length} joints</option>)}</select></label>
      <label className="camera-range"><span>Curl · {Math.round(fingerCurl(rig, finger) * 100)}%</span><input aria-label="Finger curl" type="range" min={0} max={1} step={.01} value={fingerCurl(rig, finger)} onChange={event => { pause(); updateProject(project => { setFingerCurl(project, hand.id, finger.name, Number(event.target.value)); }); }} /></label>
      <div className="property-grid">{finger.boneIds.map((id, index) => {
        const bone = rig.bones.get(id)!, label = index === 0 ? 'Knuckle' : index === finger.boneIds.length - 1 ? 'Tip' : 'Middle';
        return <label className="property-field" key={id}><span>{label} °</span><input aria-label={`${finger.name} ${label} angle`} type="number" step={1} value={Number(((bone.local.rotation - finger.openRotations[index]) * 180 / Math.PI).toFixed(1))} onFocus={() => select(id)} onChange={event => { const degrees = Number(event.target.value); if (Number.isFinite(degrees)) { pause(); updateProject(project => { project.bones.get(id)!.local.rotation = finger.openRotations[index] + degrees * Math.PI / 180; }); } }} /></label>;
      })}</div>
      <p className="scope-note">Curl changes only this digit. Auto-key records the joints at the current frame; Undo restores the pose. I + Alt-drag rotates a joint directly. For fingertip IK use a 3-bone chain, or 2 for the thumb.</p>
    </fieldset>
  </section>;
}
