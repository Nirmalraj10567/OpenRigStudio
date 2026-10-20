import type { ChannelCurve, CurveEasing, CurveTangent } from './model';

export const CURVE_PRESETS: Array<{ value: CurveEasing; label: string }> = [
  { value: 'linear', label: 'Linear' }, { value: 'smooth', label: 'Smooth' },
  { value: 'bezier', label: 'Bezier' }, { value: 'ease-in', label: 'Ease in' },
  { value: 'ease-out', label: 'Ease out' }, { value: 'ease-in-out', label: 'Ease in/out' },
  { value: 'bounce', label: 'Bounce' }, { value: 'elastic', label: 'Elastic' },
  { value: 'overshoot', label: 'Overshoot' }, { value: 'step', label: 'Step (hold)' },
];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function normalizeCurveChannels(value: unknown): Record<string, ChannelCurve> {
  if (!record(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 128).flatMap(([path, raw]) => {
    if (!path || !record(raw)) return [];
    const tangent = (value: unknown, incoming: boolean): CurveTangent | undefined => {
      if (!record(value) || typeof value.frame !== 'number' || typeof value.value !== 'number' || !Number.isFinite(value.frame + value.value)) return undefined;
      return { frame: Math.max(-1000000, Math.min(1000000, incoming ? Math.min(0, value.frame) : Math.max(0, value.frame))), value: Math.max(-1e12, Math.min(1e12, value.value)) };
    };
    const incoming = tangent(raw.inTangent, true), outgoing = tangent(raw.outTangent, false);
    const curve: ChannelCurve = { locked: raw.locked === true,
      ...(CURVE_PRESETS.some(preset => preset.value === raw.easing) ? { easing: raw.easing as CurveEasing } : {}),
      ...(incoming ? { inTangent: incoming } : {}), ...(outgoing ? { outTangent: outgoing } : {}),
    };
    return [[path, curve]];
  }));
}

export function easeCurve(t: number, easing: CurveEasing = 'linear'): number {
  if (t <= 0) return 0; if (t >= 1) return 1;
  switch (easing) {
    case 'step': return 0;
    case 'smooth': return t * t * (3 - 2 * t);
    case 'ease-in': return t * t;
    case 'ease-out': return 1 - (1 - t) * (1 - t);
    case 'ease-in-out': return t < .5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    case 'overshoot': { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; }
    case 'elastic': return 2 ** (-10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI / 3)) + 1;
    case 'bounce': {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t - 1.5 / d) ** 2 + .75;
      if (t < 2.5 / d) return n * (t - 2.25 / d) ** 2 + .9375;
      return n * (t - 2.625 / d) ** 2 + .984375;
    }
    default: return t;
  }
}

const cubic = (a: number, b: number, c: number, d: number, t: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;

/** Monotone handle time prevents folds, while handle values may freely overshoot. */
export function sampleBezierValue(start: number, end: number, duration: number, frame: number, outgoing?: CurveTangent, incoming?: CurveTangent): number {
  if (duration <= 0 || frame <= 0) return start; if (frame >= duration) return end;
  const safe = (tangent: CurveTangent | undefined) => tangent && Number.isFinite(tangent.frame + tangent.value) ? tangent : undefined;
  outgoing = safe(outgoing); incoming = safe(incoming);
  let x1 = Math.max(0, Math.min(duration, outgoing?.frame ?? duration / 3));
  let x2 = Math.max(0, Math.min(duration, duration + (incoming?.frame ?? -duration / 3)));
  if (x1 > x2) x1 = x2 = (x1 + x2) / 2;
  const y1 = start + (outgoing?.value ?? (end - start) / 3);
  const y2 = end + (incoming?.value ?? (start - end) / 3);
  // Bisection remains stable for flat/vertical handles and coincident x controls.
  let low = 0, high = 1;
  for (let i = 0; i < 38; i++) { const t = (low + high) / 2; if (cubic(0, x1, x2, duration, t) < frame) low = t; else high = t; }
  const value = cubic(start, y1, y2, end, (low + high) / 2);
  return Number.isFinite(value) ? value : start + (end - start) * frame / duration;
}
