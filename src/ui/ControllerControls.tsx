import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/** Commit one authored edit on blur, rather than one undo entry per keystroke. */
export function ControllerText({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="controller-field">{label}<input key={value} maxLength={160} defaultValue={value}
    onBlur={event => { const next = event.target.value.trim(); if (next && next !== value) onChange(next); else event.target.value = value; }}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}

export function ControllerNumber({ label, value, onChange, step = .1, min, max }: { label: string; value: number; onChange: (value: number) => void; step?: number; min?: number; max?: number }) {
  return <label className="controller-field">{label}<input key={value} type="number" defaultValue={Number(value.toFixed(5))} step={step} min={min} max={max}
    onBlur={event => {
      const next = Number(event.target.value);
      if (event.target.value.trim() && Number.isFinite(next) && (min === undefined || next >= min) && (max === undefined || next <= max)) { if (next !== value) onChange(next); }
      else event.target.value = String(value);
    }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}

export type PadPoint = { x: number; y: number };

/** Pointer capture supports mouse, pen and touch; all release paths return to neutral. */
export function ControllerJoystick({ name, value, onChange, disabled }: { name: string; value: PadPoint; onChange: (value: PadPoint) => void; disabled: boolean }) {
  const pointer = useRef<number | null>(null);
  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2 - 18;
    const x = (event.clientX - rect.left - rect.width / 2) / radius;
    const y = -(event.clientY - rect.top - rect.height / 2) / radius;
    const length = Math.max(1, Math.hypot(x, y));
    onChange({ x: x / length, y: y / length });
  };
  const reset = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    onChange({ x: 0, y: 0 });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className="controller-joystick-wrap">
    <div className="controller-joystick" role="group" tabIndex={disabled ? -1 : 0} aria-label={`${name} joystick, use arrow keys or drag`} aria-disabled={disabled}
      onPointerDown={event => { if (disabled || event.button !== 0 || pointer.current !== null) return; event.preventDefault(); event.currentTarget.focus(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); update(event); }}
      onPointerMove={event => { if (!disabled && pointer.current === event.pointerId) update(event); }}
      onPointerUp={reset} onPointerCancel={reset} onLostPointerCapture={reset}
      onKeyDown={event => {
        if (disabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        onChange({ x: event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : value.x, y: event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : value.y });
      }}
      onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); onChange({ x: 0, y: 0 }); } }}
      onBlur={() => onChange({ x: 0, y: 0 })}>
      <span className="controller-crosshair" aria-hidden="true" />
      <span className="controller-stick" aria-hidden="true" style={{ transform: `translate(calc(-50% + ${value.x * 38}px), calc(-50% - ${value.y * 38}px))` }} />
      <span className="controller-pad-label" aria-hidden="true">↑</span>
    </div>
    <span>{name}</span><output aria-label={`${name} position`}>x {value.x.toFixed(2)} · y {value.y.toFixed(2)}</output>
  </div>;
}

export function ControllerHoldButton({ name, hint, value, onChange, disabled }: { name: string; hint?: string; value: number; onChange: (value: number) => void; disabled: boolean }) {
  const pointer = useRef<number | null>(null);
  const release = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null; onChange(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <button className="controller-hold" disabled={disabled} aria-pressed={value > 0} title={`Hold ${name}${hint ? ` (${hint})` : ''}`}
    onPointerDown={event => { if (event.button !== 0 || pointer.current !== null) return; event.preventDefault(); event.currentTarget.focus(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); onChange(1); }}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
    onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); onChange(1); } }}
    onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); onChange(0); } }}
    onBlur={() => onChange(0)}>{name}{hint && <kbd>{hint}</kbd>}</button>;
}
