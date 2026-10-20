import type { VectorShape } from './model';

export type BrushId =
  | 'studio-ink'
  | 'pencil'
  | 'mechanical-pencil'
  | 'marker'
  | 'highlighter'
  | 'watercolor'
  | 'oil-paint'
  | 'acrylic'
  | 'charcoal'
  | 'chalk'
  | 'crayon'
  | 'airbrush'
  | 'spray'
  | 'calligraphy'
  | 'pixel';

export type BrushCategory = 'Inking' | 'Sketching' | 'Painting' | 'Texture' | 'Effects';

export interface BrushPreset {
  id: BrushId;
  name: string;
  category: BrushCategory;
  description: string;
  defaultSize: number;
  defaultOpacity: number;
  pressure: boolean;
}

export interface BrushSettings {
  id: BrushId;
  size: number;
  opacity: number;
  color: string;
  pressure: boolean;
}

export interface BrushPoint {
  x: number;
  y: number;
  pressure: number;
  tiltX?: number;
  tiltY?: number;
}

export const BRUSH_PRESETS: readonly BrushPreset[] = [
  { id: 'studio-ink', name: 'Studio Ink', category: 'Inking', description: 'Clean, rounded vector inking', defaultSize: 4, defaultOpacity: 1, pressure: true },
  { id: 'marker', name: 'Marker', category: 'Inking', description: 'Bold felt marker with soft overlap', defaultSize: 12, defaultOpacity: .62, pressure: true },
  { id: 'highlighter', name: 'Highlighter', category: 'Inking', description: 'Wide transparent highlight', defaultSize: 20, defaultOpacity: .28, pressure: false },
  { id: 'calligraphy', name: 'Calligraphy', category: 'Inking', description: 'Flat-edged lettering stroke', defaultSize: 8, defaultOpacity: .92, pressure: true },
  { id: 'pencil', name: 'Pencil', category: 'Sketching', description: 'Soft graphite with natural grain', defaultSize: 4, defaultOpacity: .62, pressure: true },
  { id: 'mechanical-pencil', name: 'Mechanical Pencil', category: 'Sketching', description: 'Precise technical sketch line', defaultSize: 2, defaultOpacity: .88, pressure: true },
  { id: 'charcoal', name: 'Charcoal', category: 'Sketching', description: 'Broken, expressive dry stroke', defaultSize: 10, defaultOpacity: .48, pressure: true },
  { id: 'watercolor', name: 'Watercolor', category: 'Painting', description: 'Layered translucent pigment', defaultSize: 18, defaultOpacity: .34, pressure: true },
  { id: 'oil-paint', name: 'Oil Paint', category: 'Painting', description: 'Dense painterly bristle stroke', defaultSize: 14, defaultOpacity: .78, pressure: true },
  { id: 'acrylic', name: 'Acrylic', category: 'Painting', description: 'Opaque rounded paint stroke', defaultSize: 13, defaultOpacity: .9, pressure: false },
  { id: 'crayon', name: 'Crayon', category: 'Texture', description: 'Waxy broken colored line', defaultSize: 9, defaultOpacity: .72, pressure: true },
  { id: 'chalk', name: 'Chalk', category: 'Texture', description: 'Dry dashed chalk texture', defaultSize: 12, defaultOpacity: .55, pressure: true },
  { id: 'airbrush', name: 'Airbrush', category: 'Effects', description: 'Soft feathered paint buildup', defaultSize: 28, defaultOpacity: .25, pressure: true },
  { id: 'spray', name: 'Spray Paint', category: 'Effects', description: 'Scattered aerosol droplets', defaultSize: 18, defaultOpacity: .55, pressure: true },
  { id: 'pixel', name: 'Pixel', category: 'Effects', description: 'Hard-edged grid-aligned stroke', defaultSize: 8, defaultOpacity: 1, pressure: false },
];

export const DEFAULT_BRUSH: BrushSettings = {
  id: 'studio-ink', size: 4, opacity: 1, color: '#69b7ff', pressure: true,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const presetFor = (id: BrushId) => BRUSH_PRESETS.find(brush => brush.id === id) ?? BRUSH_PRESETS[0];

function random(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function cleanPoints(points: BrushPoint[]): BrushPoint[] {
  const result: BrushPoint[] = [];
  points.forEach(point => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (!result.length || Math.hypot(point.x - result[result.length - 1].x, point.y - result[result.length - 1].y) > .35) {
      result.push({ ...point, pressure: clamp(Number.isFinite(point.pressure) ? point.pressure : .5, 0, 1) });
    }
  });
  return result;
}

function pressureScale(points: BrushPoint[], enabled: boolean): number {
  if (!enabled || !points.length) return 1;
  const average = points.reduce((sum, point) => sum + point.pressure, 0) / points.length;
  return clamp(.64 + average * .72, .55, 1.36);
}

function pointWithJitter(point: BrushPoint, origin: BrushPoint, jitter: number, seed: number): { x: number; y: number } {
  return {
    x: point.x - origin.x + (random(seed * 2.13) - .5) * jitter,
    y: point.y - origin.y + (random(seed * 3.71) - .5) * jitter,
  };
}

function smoothPath(points: BrushPoint[], origin: BrushPoint, jitter: number, seed: number, grid = 0): string {
  const values = points.map((point, index) => {
    const value = pointWithJitter(point, origin, jitter, seed + index + 1);
    if (!grid) return value;
    return { x: Math.round(value.x / grid) * grid, y: Math.round(value.y / grid) * grid };
  });
  if (!values.length) return '';
  if (values.length === 1) return `M ${values[0].x} ${values[0].y}`;
  let d = `M ${values[0].x} ${values[0].y}`;
  for (let index = 1; index < values.length - 1; index += 1) {
    const current = values[index], next = values[index + 1];
    const mid = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 };
    d += ` Q ${current.x} ${current.y} ${mid.x} ${mid.y}`;
  }
  const last = values[values.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function pathShape(id: string, d: string, brushId: BrushId, stroke: string, strokeWidth: number, opacity: number, options: Partial<VectorShape> = {}): VectorShape {
  return { id, kind: 'path', d, fill: 'none', stroke, strokeWidth: Math.max(.25, strokeWidth), opacity: clamp(opacity, 0, 1), brushId, lineCap: options.lineCap ?? 'round', lineJoin: options.lineJoin ?? 'round', lineDash: options.lineDash, ...options };
}

function dotShape(id: string, brushId: BrushId, point: { x: number; y: number }, radius: number, fill: string, opacity: number): VectorShape {
  return { id, kind: 'ellipse', x: point.x, y: point.y, radiusX: radius, radiusY: radius, fill, stroke: 'none', opacity: clamp(opacity, 0, 1), brushId };
}

function addPath(shapes: VectorShape[], prefix: string, index: number, brushId: BrushId, points: BrushPoint[], origin: BrushPoint, color: string, width: number, opacity: number, jitter: number, options: Partial<VectorShape> = {}): void {
  const d = smoothPath(points, origin, jitter, index + 11);
  if (d) shapes.push(pathShape(`${prefix}-${index}`, d, brushId, color, width, opacity, options));
}

/** Converts pointer samples into deterministic editable vector artwork. */
export function createBrushShapes(points: BrushPoint[], settings: BrushSettings, prefix = 'brush-stroke'): VectorShape[] {
  const clean = cleanPoints(points);
  const preset = presetFor(settings.id);
  if (clean.length < 2) {
    if (!clean.length) return [];
    const scale = pressureScale(clean, settings.pressure && preset.pressure);
    const size = clamp(settings.size, 1, 120) * scale;
    return [dotShape(`${prefix}-dot`, settings.id, { x: 0, y: 0 }, Math.max(1, size / 2), settings.color, clamp(settings.opacity, 0, 1))];
  }
  const origin = clean[0];
  const scale = pressureScale(clean, settings.pressure && preset.pressure);
  const size = clamp(settings.size, 1, 120) * scale;
  const opacity = clamp(settings.opacity, 0, 1);
  const shapes: VectorShape[] = [];
  const add = (index: number, width: number, alpha: number, jitter = 0, options: Partial<VectorShape> = {}) => addPath(shapes, prefix, index, settings.id, clean, origin, settings.color, width, opacity * alpha, jitter, options);

  switch (settings.id) {
    case 'studio-ink': add(0, size, 1); break;
    case 'mechanical-pencil': add(0, size * .55, .74, .15); add(1, size * .25, .32, .5); break;
    case 'pencil': add(0, size * .75, .42, .8); add(1, size * .48, .3, 1.5); add(2, size * .22, .25, 2.4); break;
    case 'marker': add(0, size * 1.25, .58, .35); add(1, size * .84, .25, .8); break;
    case 'highlighter': add(0, size * 1.85, 1, .25, { lineCap: 'square' }); add(1, size * 1.2, .18, .65, { lineCap: 'square' }); break;
    case 'calligraphy': add(0, size * 1.25, 1, 0, { lineCap: 'square', lineJoin: 'miter' }); add(1, size * .28, .32, .25, { lineCap: 'square' }); break;
    case 'watercolor': for (let index = 0; index < 6; index += 1) add(index, size * (1.05 + index * .08), .12, 1.2 + index * .45); break;
    case 'oil-paint': for (let index = 0; index < 5; index += 1) add(index, size * (1.12 - index * .08), .22, .7 + index * .35); break;
    case 'acrylic': add(0, size * 1.15, .85, .2); add(1, size * .55, .25, .55); break;
    case 'charcoal': for (let index = 0; index < 8; index += 1) add(index, size * (.32 + random(index + 3) * .42), .12 + random(index + 9) * .12, 1.1 + random(index + 13) * 2); break;
    case 'chalk': for (let index = 0; index < 6; index += 1) add(index, size * (.35 + index * .04), .16, 1.4 + index * .4, { lineDash: [size * .45, size * (.2 + index * .04)] }); break;
    case 'crayon': for (let index = 0; index < 7; index += 1) add(index, size * (.22 + index * .045), .16, 1 + index * .55, { lineDash: [size * (.5 + index * .08), size * .16] }); break;
    case 'airbrush':
      add(0, size * 1.8, .12, 1.5);
      clean.forEach((point, index) => {
        const local = pointWithJitter(point, origin, size * .8, index + 31);
        shapes.push(dotShape(`${prefix}-mist-${index}`, settings.id, local, size * (.35 + random(index + 44) * .65), settings.color, opacity * (.025 + random(index + 50) * .035)));
      });
      break;
    case 'spray':
      clean.forEach((point, index) => {
        const count = Math.min(10, Math.max(3, Math.round(size / 3)));
        for (let dot = 0; dot < count; dot += 1) {
          const local = pointWithJitter(point, origin, size * 1.35, index * 19 + dot + 61);
          shapes.push(dotShape(`${prefix}-dot-${index}-${dot}`, settings.id, local, .55 + random(index * 23 + dot) * Math.max(1.2, size * .1), settings.color, opacity * (.22 + random(index * 29 + dot) * .35)));
        }
      });
      break;
    case 'pixel': add(0, Math.max(2, Math.round(size / 2) * 2), 1, 0, { lineCap: 'butt', lineJoin: 'miter' }); break;
  }
  return shapes;
}

export function brushById(id: string): BrushPreset {
  return presetFor(id as BrushId);
}
