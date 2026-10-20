import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleDot, Gamepad2, Keyboard, RotateCcw, Settings2 } from 'lucide-react';
import type { Rig } from '../engine/Rig';
import type { ControllerDefinition, ControllerInstance } from '../engine/model';
import { resolveControllerAction } from '../engine/controllers';
import { createTransformClipFromSamples } from '../engine/motionTracking';
import type { Transform2D } from '../engine/math';
import { createCharacterControllerDefinition } from '../engine/controllerTemplates';
import { useProject } from '../state/projectStore';
import { ControllerTestPad } from './ControllerTestPad';
import type { TestInput } from './ControllerTestPad';

type InputMode = 'virtual' | 'keyboard';
type KeyBinding = Pick<TestInput, 'positive' | 'negative' | 'up' | 'down'>;

type JoystickWorkspaceProps = {
  onStatus: (message: string) => void;
  onOpenControllers?: () => void;
};

const controllerKeySlot = (id: string) => `controller-keys:${id}`;

function readControllerKeys(rig: { metadata: Record<string, string> }, definition: ControllerDefinition | undefined): Record<string, KeyBinding> {
  if (!definition) return {};
  const raw = rig.metadata[controllerKeySlot(definition.id)];
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(definition.inputs.map(input => {
      const value = (parsed as Record<string, unknown>)[input.id];
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [input.id, {}];
      const binding = value as Record<string, unknown>;
      return [input.id, Object.fromEntries((['positive', 'negative', 'up', 'down'] as const).flatMap(key => {
        const code = binding[key];
        return typeof code === 'string' && /^[A-Za-z0-9]{1,40}$/.test(code) ? [[key, code]] : [];
      }))];
    })) as Record<string, KeyBinding>;
  } catch {
    return {};
  }
}

function controllerWarnings(rig: Rig, definition: ControllerDefinition | undefined): string[] {
  if (!definition) return [];
  const targets = new Set([...rig.bones.keys(), ...rig.layers.keys()]);
  const warnings = definition.bindings.flatMap(binding => [
    binding.targetId && !targets.has(binding.targetId) ? `Missing target for ${binding.parameter}: ${binding.targetId}` : '',
    !binding.targetId && binding.parameter !== 'action' ? `${binding.parameter} has no rig target` : '',
  ]).filter(Boolean);
  const references = [...definition.bindings.map(binding => binding.actionId), ...definition.states.map(state => state.actionId)]
    .filter((id): id is string => Boolean(id));
  [...new Set(references)].forEach(id => {
    if (!resolveControllerAction(id, rig.actionLibrary, rig.animations)) warnings.push(`Missing animation reference: ${id}`);
  });
  return [...new Set(warnings)];
}

function instanceName(rig: Rig, instance: ControllerInstance): string {
  const definition = rig.controllers.find(item => item.id === instance.definitionId);
  const siblings = rig.controllerInstances.filter(item => item.definitionId === instance.definitionId && item.rigId === rig.id);
  const index = Math.max(0, siblings.findIndex(item => item.id === instance.id)) + 1;
  return `${definition?.name ?? 'Missing controller'} · instance ${index}`;
}

/**
 * A compact controller surface for the Animation workspace.
 *
 * This component deliberately has no stage renderer of its own. Pointer and
 * keyboard values are written to the selected persisted controller instance;
 * the shared CanvasStage then renders the resulting Rig/controller pose.
 */
export function JoystickControlWorkspace({ onStatus, onOpenControllers }: JoystickWorkspaceProps) {
  const {
    rig,
    projectGeneration,
    smartEdit,
    setControllerInput,
    resetControllerInputs,
    applyController,
    addControllerDefinition,
    addControllerInstance,
    version,
  } = useProject();
  const [selectedInstanceId, setSelectedInstanceId] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('virtual');
  const [liveInput, setLiveInput] = useState(true);
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);
  const recordingStartFrame = useRef(0);
  const recordingClock = useRef(0);
  const recordingFrame = useRef(-1);
  const recordingSamples = useRef<Array<{ frame: number; values: Record<string, Transform2D> }>>([]);

  const instances = useMemo(() => rig.controllerInstances.filter(instance =>
    instance.rigId === rig.id && rig.controllers.some(definition => definition.id === instance.definitionId),
  ), [rig, version]);
  const instanceKey = instances.map(instance => instance.id).join('|');

  useEffect(() => {
    if (instances.some(instance => instance.id === selectedInstanceId)) return;
    setSelectedInstanceId(instances[0]?.id ?? '');
  }, [instanceKey, selectedInstanceId]);

  useEffect(() => () => {
    const state = useProject.getState();
    if (state.rig === rig) state.resetControllerInputs();
  }, [projectGeneration, rig]);

  const selectedInstance = instances.find(instance => instance.id === selectedInstanceId) ?? instances[0];
  const definition = selectedInstance ? rig.controllers.find(item => item.id === selectedInstance.definitionId) : undefined;
  const keys = useMemo(() => readControllerKeys(rig, definition), [rig, definition]);
  const inputs = useMemo<TestInput[]>(() => definition?.inputs.map(input => ({ ...input, ...(keys[input.id] ?? {}) })) ?? [], [definition, keys]);
  const evaluation = selectedInstance ? rig.getControllerEvaluation(selectedInstance.id) : null;
  const warnings = controllerWarnings(rig, definition);
  const stateName = definition?.states.find(state => state.id === evaluation?.stateId)?.name ?? '';
  const actionName = evaluation?.clipId ? rig.animations.find(animation => animation.id === evaluation.clipId)?.name ?? evaluation.clipId : '';
  const resetInputs = () => {
    recordingRef.current = false;
    setRecording(false);
    recordingSamples.current = [];
    resetControllerInputs();
    onStatus('Joystick inputs reset · authored Rig pose restored');
  };

  const attachController = () => {
    if (smartEdit) {
      onStatus('Capture or cancel Smart Edit before attaching a controller');
      return;
    }
    const definitionId = addControllerDefinition(createCharacterControllerDefinition(rig));
    if (!definitionId) {
      onStatus('Could not create a controller for this Rig');
      return;
    }
    const instanceId = addControllerInstance(definitionId, { x: 680, y: 440, scale: 1, rotation: 0, visibleInRender: false });
    if (!instanceId) {
      onStatus('Controller definition was created, but its Rig instance could not be attached');
      onOpenControllers?.();
      return;
    }
    setSelectedInstanceId(instanceId);
    onStatus('Character joystick attached to this Rig · virtual and keyboard input are ready');
  };

  const captureRecordingSample = (state: ReturnType<typeof useProject.getState>, relativeFrame: number) => {
    if (!recordingRef.current) return;
    const rounded = Math.max(0, Math.round(relativeFrame));
    if (rounded === recordingFrame.current) return;
    recordingFrame.current = rounded;
    const values = Object.fromEntries([...state.rig.bones.keys()].map(id => [id, { ...state.rig.getConstraintLocal(id) }])) as Record<string, Transform2D>;
    recordingSamples.current.push({ frame: recordingStartFrame.current + rounded, values });
  };

  const toggleRecording = () => {
    if (recording) {
      recordingRef.current = false;
      setRecording(false);
      const samples = recordingSamples.current;
      recordingSamples.current = [];
      const state = useProject.getState();
      state.resetControllerInputs();
      const clip = createTransformClipFromSamples(samples, state.rig.timeline.fps, `${definition?.name ?? 'Joystick'} recording`, .75);
      if (!clip) {
        onStatus('Recording stopped · move the real rig before stopping to create keys');
        return;
      }
      state.updateProject(project => {
        project.animations.push(clip);
        project.setTimeline({ activeAnimationId: clip.id, fps: clip.fps, startFrame: clip.startFrame, endFrame: clip.endFrame, currentFrame: clip.startFrame, isPlaying: false });
        project.applyAnimation(clip, clip.startFrame);
      });
      onStatus(`Recorded ${clip.name} · ${clip.tracks.reduce((count, track) => count + track.keyframes.length, 0)} editable keys added to Timeline`);
      return;
    }
    const state = useProject.getState();
    if (!selectedInstance || !definition || state.smartEdit) {
      onStatus('Choose a controller instance before recording');
      return;
    }
    state.pause();
    recordingSamples.current = [];
    recordingStartFrame.current = Math.round(state.rig.timeline.currentFrame);
    recordingClock.current = 0;
    recordingFrame.current = -1;
    recordingRef.current = true;
    setRecording(true);
    onStatus('Recording enabled · start the joystick test to capture real Rig poses');
  };

  return <section className="joystick-workspace joystick-control-panel" aria-label="Joystick Control">
    <header className="joystick-control-header">
      <div>
        <span className="joystick-eyebrow">ANIMATION / RIG CONTROLLER</span>
        <h2>Joystick Control</h2>
        <p>Drive a saved controller instance on the current Rig while the shared canvas and timeline stay available.</p>
      </div>
      <div className="joystick-control-actions">
        <label className="live-input-toggle"><span className="online-dot" /> Live input <input aria-label="Live input" type="checkbox" checked={liveInput} onChange={event => setLiveInput(event.target.checked)} /><i /></label>
        <button type="button" className={recording ? 'joystick-recording active' : 'joystick-recording'} onClick={toggleRecording}>{recording ? 'Stop & save recording' : 'Record animation'}</button>
        <button type="button" onClick={resetInputs}><RotateCcw size={13} /> Reset inputs</button>
      </div>
    </header>

    <div className="joystick-control-body">
      <div className="joystick-control-toolbar">
           <label className="joystick-controller-select"><span>Controller instance</span><select aria-label="Joystick controller instance" value={selectedInstance?.id ?? ''} onChange={event => { recordingRef.current = false; setRecording(false); recordingSamples.current = []; setSelectedInstanceId(event.target.value); resetControllerInputs(); }}>
          {!instances.length && <option value="">No controller instance</option>}
          {instances.map(instance => <option key={instance.id} value={instance.id}>{instanceName(rig, instance)}</option>)}
        </select></label>
        <div className="joystick-panel-tabs" role="tablist" aria-label="Joystick input mode">
          <button type="button" role="tab" aria-selected={inputMode === 'virtual'} onClick={() => { setInputMode('virtual'); onStatus('Virtual joystick input selected'); }}><Gamepad2 size={13} /> Virtual Joystick</button>
          <button type="button" role="tab" aria-selected={inputMode === 'keyboard'} onClick={() => { setInputMode('keyboard'); onStatus('Keyboard input selected'); }}><Keyboard size={13} /> Keyboard</button>
        </div>
      </div>

      {!instances.length ? <div className="joystick-control-empty">
        <CircleDot size={22} />
        <strong>No controller instance is attached to this Rig</strong>
         <p>Attach a real character controller to this Rig, or manage saved controller definitions in Controllers. No synthetic characters are created.</p>
         <div className="joystick-empty-actions"><button type="button" className="primary-button" disabled={Boolean(smartEdit)} onClick={attachController}><Gamepad2 size={13} /> Attach controller to this Rig</button><button type="button" className="secondary-button" onClick={onOpenControllers}><Settings2 size={13} /> Open Controllers</button></div>
      </div> : <>
        <div className="joystick-controller-summary">
          <div><span className="online-dot" /><strong>{definition?.name ?? 'Controller'}</strong><small>{definition?.type ?? 'custom'} · {inputs.length} inputs · {rig.animations.length} saved clips</small></div>
          <div className="joystick-engine-state"><span>ENGINE</span><strong>{smartEdit ? 'EDIT BLOCKED' : liveInput ? 'READY' : 'PAUSED'}</strong></div>
        </div>
        {smartEdit && <p className="controller-warning">Capture or cancel the Smart Bone edit before testing a controller.</p>}
        <div className={`joystick-input-surface input-mode-${inputMode}`}>
          {selectedInstance && definition && <ControllerTestPad
            key={`${projectGeneration}:${selectedInstance.id}:${definition.id}`}
            inputs={inputs}
            disabled={Boolean(smartEdit) || !liveInput}
            sessionKey={`${projectGeneration}:${selectedInstance.id}:${definition.id}`}
             stateName={stateName}
             actionNames={actionName ? [actionName] : []}
             warnings={warnings}
             recording={recording}
             adapter={{
               start: () => {
                 const state = useProject.getState();
                 if (state.rig !== rig || state.smartEdit || state.rig.timeline.isPlaying) return false;
                 state.resetControllerInputs(selectedInstance.id);
                 const applied = Boolean(state.applyController(selectedInstance.id, 0));
                 if (applied) captureRecordingSample(state, 0);
                 return applied;
               },
              stop: () => { if (useProject.getState().rig === rig) resetControllerInputs(selectedInstance.id); },
              setInput: (id, value) => { if (useProject.getState().rig === rig) setControllerInput(selectedInstance.id, id, value); },
              tick: seconds => {
                 const state = useProject.getState();
                 if (state.rig !== rig || state.smartEdit || state.rig.timeline.isPlaying) return false;
                 const applied = Boolean(state.applyController(selectedInstance.id, seconds));
                 if (applied && recordingRef.current) {
                   recordingClock.current += seconds;
                   captureRecordingSample(state, recordingClock.current * state.rig.timeline.fps);
                 }
                 return applied;
               },
            }}
          />}
        </div>
      </>}
    </div>
  </section>;
}
