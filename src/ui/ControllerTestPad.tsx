import { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Square } from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ControllerHoldButton, ControllerJoystick } from './ControllerControls';
import type { PadPoint } from './ControllerControls';

export type TestValue = number | PadPoint;
export interface TestInput {
  id: string;
  name: string;
  type: 'button' | 'axis' | 'joystick';
  positive?: string;
  negative?: string;
  up?: string;
  down?: string;
}
export interface TestAdapter {
  start: () => boolean;
  stop: () => void;
  setInput: (id: string, value: TestValue) => void;
  /** False means the store stopped or the selected instance was replaced. */
  tick: (seconds: number) => boolean;
}
const zero = (input: TestInput): TestValue => input.type === 'joystick' ? { x: 0, y: 0 } : 0;
const keyName = (code?: string) => code?.replace(/^Key|^Digit/, '').replace('Arrow', '').replace('Space', 'Space') ?? '';

/** Owns only transient control state. The adapter must never call updateProject/touch. */
export function ControllerTestPad({ inputs, adapter, disabled, sessionKey, stateName, actionNames, warnings, recording = false }: {
  inputs: TestInput[];
  adapter: TestAdapter;
  disabled: boolean;
  sessionKey: string;
  stateName: string;
  actionNames: string[];
  warnings: string[];
  recording?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [values, setValues] = useState<Record<string, TestValue>>({});
  const held = useRef(new Set<string>());
  const active = useRef(false);
  const latest = useRef({ adapter, inputs });
  latest.current = { adapter, inputs };
  const root = useRef<HTMLDivElement>(null);
  const setValue = (id: string, value: TestValue) => {
    if (!active.current) return;
    latest.current.adapter.setInput(id, value);
    setValues(previous => ({ ...previous, [id]: value }));
  };
  const neutral = () => {
    held.current.clear();
    if (active.current) latest.current.inputs.forEach(input => latest.current.adapter.setInput(input.id, zero(input)));
    setValues({});
  };
  const stop = () => {
    neutral(); active.current = false; setRunning(false); latest.current.adapter.stop();
  };
  useEffect(() => {
    active.current = false; held.current.clear(); setRunning(false); setValues({});
    const currentAdapter = latest.current.adapter;
    return () => { active.current = false; held.current.clear(); currentAdapter.stop(); };
  }, [sessionKey]);
  useEffect(() => { if (disabled && active.current) stop(); }, [disabled]);
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (!active.current) return;
      const dt = Math.min(.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!latest.current.adapter.tick(dt)) { stop(); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const blur = () => stop();
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); };
  }, [running, sessionKey]);
  const keys = (event: ReactKeyboardEvent<HTMLDivElement>, down: boolean) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stop(); return; }
    if (!active.current || event.metaKey || event.ctrlKey || event.altKey) return;
    // Focused pads and buttons supply their own arrow/Space/Enter behavior.
    if (event.defaultPrevented) return;
    const matching = inputs.filter(input => [input.positive, input.negative, input.up, input.down].includes(event.code));
    if (!matching.length) return;
    event.preventDefault(); event.stopPropagation();
    if (down) held.current.add(event.code); else held.current.delete(event.code);
    const pressed = (code?: string) => code && held.current.has(code) ? 1 : 0;
    matching.forEach(input => {
      const x = pressed(input.positive) - pressed(input.negative);
      if (input.type !== 'joystick') setValue(input.id, input.type === 'button' ? pressed(input.positive) : x);
      else {
        const y = pressed(input.up) - pressed(input.down);
        const length = Math.max(1, Math.hypot(x, y));
        setValue(input.id, { x: x / length, y: y / length });
      }
    });
  };
  return <div ref={root} className="controller-test" data-controller-test tabIndex={0} aria-label="Controller test pad"
    onKeyDown={event => keys(event, true)} onKeyUp={event => keys(event, false)}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) neutral(); }}>
    <h3>Live test pad</h3>
    <div className="controller-toolbar">
      <button className="secondary-button" disabled={disabled} onClick={() => {
        if (running) stop();
        else if (adapter.start()) { held.current.clear(); setValues({}); active.current = true; setRunning(true); root.current?.focus(); }
      }}>{running ? <Square size={12} /> : <Play size={12} />}{running ? 'Stop test' : 'Start test'}</button>
      <button className="secondary-button" onClick={stop} disabled={!running}><RotateCcw size={12} /> Reset</button>
    </div>
    <p className="scope-note">{running ? 'Testing · focus this pad for keys. Release to return to neutral; Escape stops.' : 'Start, then hold buttons, drag the joystick, or use the mapped keys.'} {recording ? 'Recording evaluated rig poses into a new timeline clip.' : 'Live input is temporary and does not write keys.'}</p>
    {inputs.map(input => {
      const current = values[input.id] ?? zero(input);
      const scalar = typeof current === 'number' ? current : 0;
      const hint = input.type === 'button' ? keyName(input.positive) : [input.negative, input.positive, input.up, input.down].filter(Boolean).map(keyName).join(' / ');
      return <div className="controller-pad-input" key={input.id}>
        {input.type === 'joystick' ? <><ControllerJoystick name={input.name} disabled={!running} value={typeof current === 'number' ? { x: 0, y: 0 } : current} onChange={value => setValue(input.id, value)} /><p className="scope-note">Keys: {hint || 'focus joystick and use arrows'}</p></>
          : input.type === 'button' ? <ControllerHoldButton name={input.name} hint={hint} value={scalar} disabled={!running} onChange={value => setValue(input.id, value)} />
            : <label className="controller-field">{input.name} · {scalar.toFixed(2)}<input aria-label={`${input.name} test axis`} type="range" min={-1} max={1} step={.01} value={scalar} disabled={!running} onChange={event => setValue(input.id, Number(event.target.value))} onPointerUp={() => setValue(input.id, 0)} onPointerCancel={() => setValue(input.id, 0)} onBlur={() => setValue(input.id, 0)} onKeyUp={() => setValue(input.id, 0)} /><span>Keys: {hint || 'focus slider and use arrows'}</span></label>}
      </div>;
    })}
    <div className="controller-readout"><div>Status: <strong>{running ? 'RUNNING' : 'STOPPED'}</strong></div><div>State: <strong>{running ? stateName || '—' : '—'}</strong></div><div>Actions: {running ? actionNames.join(', ') || 'None active' : '—'}</div></div>
    {warnings.length > 0 && <div className="controller-warning" role="status"><strong>Check references</strong><ul>{warnings.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
  </div>;
}

/** Physical KeyboardEvent.code is saved, avoiding keyboard-layout ambiguity. */
export function ControllerKeyField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string | undefined) => void }) {
  return <label className="controller-field">{label}<input className="controller-key-field" readOnly value={value ?? ''} placeholder="Press a key…" aria-label={label} title="Focus and press a key. Backspace clears."
    onKeyDown={event => {
      if (event.key === 'Tab') return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') { event.currentTarget.blur(); return; }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      onChange(event.key === 'Backspace' || event.key === 'Delete' ? undefined : event.code);
    }} /></label>;
}
