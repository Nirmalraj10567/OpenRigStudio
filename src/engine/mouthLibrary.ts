import type { VectorShape, Viseme } from './model';

/** Original vector drawings sharing a centered, roughly 56px-wide mouth space. */
export function createMouthShapes(viseme: Viseme): VectorShape[] {
  const ink = '#343047', inside = '#552c43', teeth = '#fff7e7', tongue = '#ef8293';
  const path = (id: string, d: string, fill = 'none', stroke = ink, strokeWidth = 3): VectorShape =>
    ({ id, kind: 'path', d, fill, stroke, strokeWidth });
  const ellipse = (id: string, x: number, y: number, radiusX: number, radiusY: number, fill: string, stroke = ink, strokeWidth = 3): VectorShape =>
    ({ id, kind: 'ellipse', x, y, radiusX, radiusY, fill, stroke, strokeWidth });
  switch (viseme) {
    case 'X': return [path('rest', 'M -28 -2 Q 0 10 28 -2')];
    case 'A': return [
      path('closed-lips', 'M -27 0 Q -12 -3 0 0 Q 12 -3 27 0'),
      path('lower-lip', 'M -16 5 Q 0 10 16 5', 'none', '#c66f7b', 2),
    ];
    case 'B': return [
      path('teeth-mouth', 'M -27 -5 Q 0 -10 27 -5 Q 25 9 0 9 Q -25 9 -27 -5 Z', teeth),
      path('teeth-seam', 'M -24 1 Q 0 5 24 1', 'none', '#bc8790', 1.5),
    ];
    case 'C': return [
      path('wide-mouth', 'M -28 -8 Q 0 -14 28 -8 Q 25 16 0 16 Q -25 16 -28 -8 Z', inside),
      path('upper-teeth', 'M -23 -7 Q 0 -11 23 -7 L 20 -1 Q 0 2 -20 -1 Z', teeth, 'none', 0),
      path('tongue', 'M -13 11 Q 0 2 13 11 Q 0 17 -13 11 Z', tongue, 'none', 0),
    ];
    case 'D': return [
      ellipse('open-mouth', 0, 2, 23, 21, inside),
      path('upper-teeth', 'M -16 -12 Q 0 -20 16 -12 L 13 -7 Q 0 -11 -13 -7 Z', teeth, 'none', 0),
      ellipse('tongue', 0, 14, 12, 5, tongue, 'none', 0),
    ];
    case 'E': return [
      ellipse('rounded-mouth', 0, 1, 18, 16, inside),
      path('tongue', 'M -10 11 Q 0 3 10 11 Q 0 16 -10 11 Z', tongue, 'none', 0),
    ];
    case 'F': return [
      ellipse('puckered-lips', 0, 0, 13, 12, '#da8a91'),
      ellipse('pucker-opening', 0, 0, 7, 8, inside, ink, 2),
      path('left-crease', 'M -24 -3 Q -19 0 -21 5', 'none', ink, 2),
      path('right-crease', 'M 24 -3 Q 19 0 21 5', 'none', ink, 2),
    ];
    case 'G': return [
      path('bitten-lip', 'M -25 -7 Q 0 -11 25 -7 Q 20 12 0 10 Q -20 12 -25 -7 Z', '#cf7c8a'),
      path('upper-teeth', 'M -22 -6 Q 0 -9 22 -6 L 18 2 Q 0 7 -18 2 Z', teeth, ink, 2),
    ];
    case 'H': return [
      path('l-mouth', 'M -26 -9 Q 0 -15 26 -9 Q 23 17 0 17 Q -23 17 -26 -9 Z', inside),
      path('raised-tongue', 'M -13 12 L -10 -2 Q 0 -13 10 -2 L 13 12 Q 0 19 -13 12 Z', tongue, '#a95173', 1.5),
      path('upper-teeth', 'M -20 -8 Q 0 -12 20 -8 L 17 -3 Q 0 -6 -17 -3 Z', teeth, 'none', 0),
    ];
  }
}
