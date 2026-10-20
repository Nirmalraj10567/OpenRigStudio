import { createId } from './Rig';
import type { VectorShape } from './model';
import type { Point2D } from './math';

// Authored in image.png's 320 × 625 coordinate space, with its actual landmarks.
// All paths use absolute paired coordinates so view projections remain editable.
export const GIRL_COLORS = {
  ink: '#494047', skin: '#f5ded0', shade: '#dec0b4', hair: '#1c2026',
  hairLight: '#343741', blue: '#293965', blueDark: '#202d55', blueLight: '#475680',
  skirt: '#df8e84', skirtShade: '#c5746c', skirtLight: '#eaa499',
  leaf: '#b0bc84', flower: '#c99b5e', purple: '#aa90b0', shoe: '#a43e55',
};
const c = GIRL_COLORS;
export const p = (d: string, fill = 'none', stroke = c.ink, strokeWidth = .85): VectorShape =>
  ({ id: createId('shape'), kind: 'path', d, fill, stroke, strokeWidth, lineCap: 'round', lineJoin: 'round' });
export const e = (x: number, y: number, radiusX: number, radiusY: number, fill: string, stroke = 'none', strokeWidth = .7): VectorShape =>
  ({ id: createId('shape'), kind: 'ellipse', x, y, radiusX, radiusY, fill, stroke, strokeWidth });
const openSkin = (fillPath: string, outline: string): VectorShape[] => [
  p(fillPath, c.skin, 'none'), p(outline, 'none', c.ink, .72),
];

/** Transform absolute SVG coordinates, including Bezier controls (no raster plate). */
export function mapGirlShapes(shapes: VectorShape[], map: (point: Point2D) => Point2D): VectorShape[] {
  return shapes.map(shape => {
    if (shape.kind === 'path') {
      return { ...shape, d: shape.d!.replace(/[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?\s+[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi, pair => {
        const [x, y] = pair.split(/\s+/).map(Number), q = map({ x, y });
        return `${Number(q.x.toFixed(4))} ${Number(q.y.toFixed(4))}`;
      }) };
    }
    const center = map({ x: shape.x ?? 0, y: shape.y ?? 0 });
    const rx = map({ x: (shape.x ?? 0) + (shape.radiusX ?? 0), y: shape.y ?? 0 });
    const ry = map({ x: shape.x ?? 0, y: (shape.y ?? 0) + (shape.radiusY ?? 0) });
    return { ...shape, x: center.x, y: center.y, radiusX: Math.hypot(rx.x - center.x, rx.y - center.y), radiusY: Math.hypot(ry.x - center.x, ry.y - center.y) };
  });
}

function flower(x: number, y: number, scale = 1): VectorShape[] {
  return mapGirlShapes([
    p('M 0 0 C -10 -18 -12 -38 -5 -43 C 1 -48 2 -27 0 0 Z', c.flower),
    p('M 0 0 C -9 -7 -28 -2 -30 6 C -29 13 -7 7 0 0 Z', c.flower),
    p('M 0 0 C 8 -7 19 -10 20 -2 C 20 3 7 7 0 0 Z', c.flower),
    p('M 0 0 C -7 7 -14 22 -9 24 C -2 27 3 9 0 0 Z', c.flower),
    e(0, 0, 3, 4, '#8b6648', c.ink),
  ], q => {
    const py = y + q.y * scale;
    // The print wraps beyond the right edge in the reference; keep its visible
    // petals inside the cloth silhouette instead of protruding like accessories.
    const edge = py < 335 ? 214 - (py - 270) * .08 : 208.8 - (py - 335) * .13;
    return { x: Math.min(x + q.x * scale, edge), y: py };
  });
}

export function referenceFrontArtwork() {
  return {
    hairBack: [
      p('M 133 81 C 124 62 120 36 129 18 C 134 7 148 3 161 4 C 178 2 188 13 191 31 C 194 53 186 70 187 86 L 199 106 L 179 113 L 132 101 Z', c.hair),
      p('M 129 43 C 129 65 134 77 138 83 M 187 43 C 188 62 181 77 181 94', 'none', c.hairLight, 1.8),
    ],
    bag: [
      p('M 191 94 Q 199 89 204 95 L 210 120 L 205 153 L 191 155 L 185 110 Z', c.purple),
      p('M 197 94 L 201 112 L 196 149 M 200 97 L 205 120 L 200 149', 'none', '#695c81', 1.4),
      p('M 190 110 L 194 148 L 188 179 L 185 147 Z', '#c6afc7'),
      p('M 190 97 L 196 96 L 204 120 L 201 122 Z', '#c9b5c6', c.ink, .8),
    ],
    thighL: [p('M 132 247 C 134 292 135 359 141 410 L 160 410 C 161 363 167 290 160 249 Z', c.skin)],
    thighR: [p('M 167 248 C 164 298 166 359 168 407 L 189 405 C 194 353 199 283 195 252 Z', c.skin)],
    shinL: [p('M 141 402 C 137 443 145 489 138 547 L 150 552 C 158 503 163 451 160 402 Z', c.skin)],
    shinR: [p('M 168 398 C 168 446 164 510 161 549 L 174 559 C 182 513 190 452 189 398 Z', c.skin)],
    shoeL: [
      p('M 139 542 L 153 544 C 153 561 149 587 145 600 Q 142 616 133 621 Q 126 621 127 612 C 129 599 134 578 135 562 Z', c.skin),
      p('M 127 604 Q 133 616 143 606 L 148 600 Q 149 611 146 625 L 125 625 Q 121 619 125 611 Z', c.shoe),
      p('M 126 621 Q 138 626 147 620', 'none', '#733449'),
    ],
    shoeR: [
      p('M 164 540 L 177 540 C 178 558 184 570 190 580 L 199 591 Q 199 597 189 596 C 176 584 165 571 158 555 Z', c.skin),
      p('M 168 563 Q 174 580 188 585 L 188 578 L 200 591 Q 207 600 199 604 Q 187 608 177 593 L 160 569 L 160 580 L 155 578 L 155 559 L 160 554 Z', c.shoe),
      p('M 177 593 Q 188 608 201 602', 'none', '#733449'),
    ],
    upperArmL: [
      p('M 103 145 L 120 147 C 119 171 113 199 108 227 L 96 229 C 98 201 101 171 103 145 Z', c.skin),
      p('M 115 158 C 113 184 106 213 104 224', 'none', c.shade, 1.8),
    ],
    forearmL: [
      ...openSkin('M 97 217 Q 104 216 109 222 C 105 247 99 275 100 301 L 87 302 C 88 280 93 246 97 217 Z', 'M 97 217 C 93 246 88 280 87 302 M 109 222 C 105 247 99 275 100 301'),
      p('M 107 229 C 101 253 95 276 96 294', 'none', c.shade, 1),
    ],
    upperArmR: [
      p('M 194 144 L 208 143 Q 213 172 217 195 Q 217 209 209 214 Q 200 213 198 200 L 191 163 Z', c.skin),
      p('M 197 154 L 205 191 Q 210 200 208 206', 'none', c.shade, 1.5),
    ],
    forearmR: [
      ...openSkin('M 201 201 C 200 179 203 162 204 146 L 215 143 C 219 163 219 184 216 202 Q 211 219 203 208 Z', 'M 201 201 C 200 179 203 162 204 146 M 215 143 C 219 163 219 184 216 202 Q 211 219 203 208'),
      p('M 204 155 Q 204 182 202 195', 'none', c.shade),
    ],
    neck: [
      p('M 145 75 L 177 76 C 175 90 180 101 190 111 L 185 120 L 134 120 L 129 111 C 143 103 147 91 145 75 Z', c.skin, 'none'),
      p('M 146 79 Q 159 93 176 79 L 176 87 Q 160 96 145 86 Z', c.shade, 'none'),
      p('M 140 112 Q 145 110 152 115 M 172 114 Q 179 108 184 111', 'none', '#9f8680', .8),
    ],
    chest: [
      p('M 136 108 Q 157 117 185 108 L 187 139 Q 180 162 165 173 Q 142 161 136 136 Z', c.skin, 'none'),
      p('M 164 139 Q 166 155 165 167', 'none', '#9f8985', .65),
    ],
    midriff: [
      p('M 144 203 Q 165 208 188 203 C 191 219 202 234 210 247 Q 194 266 164 256 Q 137 250 121 238 C 132 226 140 215 144 203 Z', c.skin),
      p('M 144 207 Q 163 215 189 207 L 192 215 Q 167 223 140 215 Z', c.shade, 'none'),
      p('M 171 227 Q 168 228 170 232 M 199 243 L 197 251', 'none', '#a7867e', .8),
    ],
    jacket: [
      p('M 136 83 L 114 94 L 121 106 L 113 116 Q 121 149 128 170 L 143 194 L 140 207 L 157 214 L 166 207 L 174 213 L 193 205 L 191 183 Q 201 162 203 143 L 195 117 L 187 104 L 195 88 L 180 83 Q 181 111 184 125 Q 185 151 167 170 Q 147 163 138 136 Q 131 112 136 83 Z', c.blue),
      p('M 136 84 L 119 96 L 130 103 L 135 127 Q 130 109 136 84 Z', c.blueDark),
      p('M 181 84 L 190 91 L 181 103 L 189 116 L 183 131', 'none', '#7a87a3', 1.7),
      p('M 121 119 C 116 140 125 163 145 177 L 151 198 L 143 199 L 133 176 C 117 166 115 153 114 135 Z', c.blueDark, 'none'),
      p('M 141 168 Q 154 176 164 176 L 163 202 L 158 209 L 145 203 L 146 191 Z', '#344a7b', 'none'),
      p('M 172 175 Q 185 173 195 161 L 187 188 L 189 201 L 176 207 L 171 202 Z', '#344777', 'none'),
      p('M 134 108 C 135 137 143 161 165 173 C 183 159 187 137 185 111', 'none', '#b5bcc5', 1.1),
      p('M 164 173 L 166 205 M 169 176 L 168 204', 'none', '#abb1ba', .65),
      p('M 145 193 Q 153 196 162 194 M 173 194 L 188 192 M 144 204 L 157 209 M 174 208 L 189 203', 'none', '#68759a', .8),
      e(167, 178, 1.3, 2.7, '#d4c7a6', c.ink, .5),
    ],
    sleeveL: [
      p('M 122 108 Q 107 112 102 124 Q 98 135 103 151 Q 111 156 120 152 L 119 142 Q 123 136 119 128 L 126 117 Z', c.blue),
      p('M 105 122 L 102 136 L 108 146 L 105 151 L 115 153 L 117 145 L 112 135 L 114 117 Z', c.blueDark, 'none'),
      p('M 102 150 Q 110 155 119 151 M 119 130 L 117 140', 'none', '#727994', .8),
    ],
    sleeveR: [
      p('M 189 111 Q 201 109 208 121 L 210 143 Q 201 151 193 149 L 188 132 Z', c.blue),
      p('M 199 119 L 205 132 L 201 146 M 194 149 L 207 144', 'none', '#617299', 1),
    ],
    skirt: [
      p('M 122 236 C 145 250 187 265 210 247 Q 220 255 214 274 C 208 305 209 337 203 368 C 197 398 194 426 199 459 L 205 514 L 199 534 L 179 545 L 152 550 L 121 536 L 114 522 C 120 493 128 462 131 433 C 127 394 125 354 118 313 C 114 282 110 253 122 236 Z', c.skirt),
      p('M 120 243 C 143 261 180 277 211 254 C 200 273 184 286 177 291 C 153 279 132 263 120 243 Z', c.skirtShade, 'none'),
      p('M 120 247 Q 147 269 179 280 Q 200 270 212 257 M 121 250 Q 135 286 163 305 M 125 267 Q 139 296 166 317 M 137 297 Q 155 320 167 327', 'none', '#925b59', 1),
      p('M 137 426 C 136 460 129 493 128 519 L 135 532 L 145 535 C 146 493 151 472 153 446 C 146 479 139 501 137 515 Z', c.skirtShade, 'none'),
      p('M 178 431 C 171 461 175 502 172 538 L 186 534 C 182 499 176 470 182 439 Z', c.skirtShade, 'none'),
      p('M 198 464 L 201 516 L 192 527 C 193 501 190 493 191 477 Z', c.skirtShade, 'none'),
      p('M 130 456 L 122 501 L 122 521 M 137 461 L 132 525 M 154 447 C 150 478 154 514 151 537 M 168 451 L 170 534 M 189 454 L 188 530 M 199 488 L 201 515', 'none', '#845650', .8),
      // Large sage-green leaves are a defining feature of the reference skirt.
      p('M 213 263 Q 205 263 193 287 Q 184 311 171 327 Q 179 333 190 320 Q 202 303 209 283 Z', c.leaf),
      p('M 208 326 Q 194 327 188 348 Q 183 370 172 391 Q 180 397 188 381 Q 197 358 208 344 Z', c.leaf),
      p('M 201 369 Q 189 378 181 399 Q 176 417 170 429 Q 179 434 186 418 Q 195 402 202 389 Z', c.leaf),
      p('M 196 410 Q 187 422 179 446 Q 176 455 182 453 Q 192 445 197 426 Z', c.leaf),
      ...flower(208, 314, .83), ...flower(202, 369, .68), ...flower(197, 412, .53),
      p('M 207 301 Q 202 310 185 318 M 207 343 Q 195 363 180 382', 'none', '#697852', .7),
      // Uneven woven fringe rather than a scalloped cartoon hem.
      p('M 119 506 L 125 521 L 134 523 L 140 526 L 149 525 L 158 522 L 169 523 L 178 518 L 189 519 L 201 511 L 197 538 L 190 536 L 186 549 L 180 543 L 175 552 L 168 549 L 162 556 L 155 551 L 151 556 L 145 550 L 140 553 L 136 546 L 129 547 L 127 539 L 121 538 L 122 526 L 116 528 Z', '#dda394'),
      p('M 119 515 L 118 522 M 123 517 L 123 533 M 127 522 L 130 542 M 133 524 L 136 544 M 138 526 L 141 549 M 145 526 L 146 549 M 151 525 L 152 552 M 158 524 L 159 551 M 165 524 L 165 551 M 172 523 L 173 548 M 179 520 L 181 542 M 186 520 L 188 538 M 193 518 L 195 534 M 199 515 L 198 529', 'none', '#875c59', .7),
    ],
    knot: [
      p('M 121 224 Q 110 220 106 235 L 111 244 L 123 236 L 130 230 Z', c.skirt),
      p('M 111 239 Q 98 250 81 265 L 94 263 L 101 251 L 108 257 L 117 239 Z', c.skirtShade),
      p('M 121 228 Q 117 226 116 235 L 121 247 L 126 237 L 124 230 Z', c.skirt),
      p('M 112 231 L 108 239 M 118 235 L 115 247', 'none', '#875850', .8),
    ],
    handL: [
      // Palm only. Each digit is separate skinned artwork in referenceGirlHands.
      ...openSkin('M 88 291 L 99 292 L 100 301 Q 102 304 100 308 L 97 311 L 92 312 L 87 310 L 85 306 Q 84 303 87 299 Z', 'M 87 299 Q 84 303 85 306 L 87 309 M 99.8 299 L 100 301'),
      { ...p('M 95 299 Q 98 302 97 306 M 89 303 Q 91 304 91 307', 'none', '#b09286', .45), id: 'left-hand-back-detail' },
      { ...p('M 88 307 Q 92 304 97 307 M 89 302 Q 92 299 96 301 Q 98 303 96 306 M 89 309 Q 93 307 96 309', 'none', '#b09286', .45), id: 'left-hand-palm-detail', opacity: 0 },
    ],
    handR: [
      ...openSkin('M 204 154 L 215 153 L 214 139 Q 214 134 211 131 L 208 129 L 204 133 L 204 139 L 205 143 Z', 'M 204.6 147 L 205 143 L 204 139 M 211 131 Q 214 134 214 139 L 214.6 147'),
      { ...p('M 208 139 Q 210 142 211 146', 'none', '#b09286', .45), id: 'right-hand-back-detail' },
      { ...p('M 206 135 Q 209 138 212 137 M 206 139 Q 209 138 212 141 M 207 140 Q 205 144 209 148', 'none', '#b09286', .45), id: 'right-hand-palm-detail', opacity: 0 },
    ],
    face: [
      p('M 135 50 Q 130 46 130 56 Q 130 65 137 69 M 181 50 Q 189 45 188 56 Q 189 66 181 70', c.skin),
      p('M 135 37 Q 157 25 181 36 L 184 55 C 181 69 173 80 159 85 C 147 82 139 76 136 66 Z', c.skin),
      p('M 136 49 L 139 65 Q 145 77 159 81 Q 170 78 180 65 C 176 77 165 84 159 85 Q 141 79 136 66 Z', c.shade, 'none'),
      p('M 133 52 Q 130 54 134 60 L 136 62 M 184 53 Q 187 52 185 59 L 183 62', 'none', '#a38b83', .65),
    ],
    eyes: [
      p('M 140 52 Q 146 47 152 53 Q 148 58 141 55 Z', '#fbf7ee', c.ink, .7),
      p('M 166 53 Q 173 47 178 51 L 178 55 Q 170 59 166 53 Z', '#fbf7ee', c.ink, .7),
      e(146.5, 53, 2.4, 3.1, '#63928e', c.ink, .5), e(172.1, 53, 2.6, 3.3, '#63928e', c.ink, .5),
      e(146.5, 52.7, 1.2, 2.6, '#293135'), e(172.2, 52.7, 1.3, 2.7, '#293135'),
      e(147.3, 51.5, .65, .75, '#fff'), e(173, 51.5, .65, .75, '#fff'),
      p('M 139 50 Q 146 48 152 52 M 166 52 Q 173 48 179 49 M 139 51 L 137 49 M 178 50 L 180 48', 'none', '#303039', 1.2),
      p('M 141 58 L 149 58 M 169 58 L 176 57', 'none', '#b3928c', .5),
    ],
    brows: [p('M 139 46 Q 146 45 153 48 M 166 48 Q 173 44 179 45', 'none', '#403b3e', 1.15)],
    noseMouth: [
      p('M 160 49 L 158 62 L 161 64 M 154 65 L 157 65', 'none', '#a48982', .65),
      p('M 148 72 Q 157 75 169 71 M 155 78 Q 161 79 165 76', 'none', '#977b79', .65),
    ],
    hairFront: [
      p('M 133 48 C 127 34 128 17 140 10 Q 157 -1 177 10 Q 190 16 188 38 L 181 62 L 181 42 L 177 27 Q 171 31 164 27 L 158 24 Q 150 31 139 30 L 139 41 L 136 62 Z', c.hair),
      p('M 140 28 Q 137 39 138 47 L 141 62 L 137 69 Q 132 54 133 40 Z', c.hair),
      p('M 182 33 L 185 48 L 180 73 L 179 70 L 182 50 Z', '#3b3b45', 'none'),
      p('M 140 16 Q 134 25 135 35 M 175 14 Q 183 20 184 33', 'none', c.hairLight, .8),
    ],
    glasses: [
      p('M 136 27 Q 143 20 153 24 L 155 32 Q 149 41 140 36 Q 135 33 136 27 Z', '#834926', '#cbb7a2', 1.4),
      p('M 163 26 Q 172 21 179 25 L 180 32 Q 172 41 164 34 Z', '#834926', '#cbb7a2', 1.4),
      p('M 138 28 Q 145 24 151 26 L 152 30 Q 146 35 139 32 Z', '#b86830', 'none'),
      p('M 165 27 Q 172 24 177 26 L 177 30 L 166 32 Z', '#b86830', 'none'),
      p('M 154 27 Q 158 24 163 27 M 135 28 L 131 38 M 180 28 L 184 37', 'none', '#cbb7a2', 1.4),
      p('M 139 28 L 144 25 M 166 27 L 171 25', 'none', '#fff0da', 1.5),
    ],
  };
}
export type GirlPart = keyof ReturnType<typeof referenceFrontArtwork>;

/** Profile features are redrawn, not flattened front eyes/nose. Faces point left. */
export function referenceProfileHead(): Partial<Record<GirlPart, VectorShape[]>> {
  return {
    hairBack: [p('M 140 16 C 154 -2 182 4 190 22 Q 198 42 186 67 L 182 94 L 164 104 L 146 86 L 140 67 Z', c.hair), p('M 187 26 Q 192 50 182 78', 'none', c.hairLight, 1.2)],
    face: [
      p('M 142 28 Q 161 22 176 37 L 181 58 Q 174 66 170 78 L 157 83 Q 147 85 142 78 L 140 72 L 136 69 L 139 64 L 129 62 Q 126 61 132 55 L 138 46 Z', c.skin),
      p('M 163 51 Q 173 44 176 51 Q 177 61 167 66 L 165 60 Q 171 54 168 53 L 165 57', c.skin),
      p('M 146 78 Q 158 82 171 71 L 168 79 Q 158 87 146 82 Z', c.shade, 'none'),
    ],
    eyes: [
      p('M 136 51 Q 143 46 149 50 Q 144 56 137 55 Z', '#fffaf3'),
      e(139.4, 52, 1.8, 2.7, '#63928e', c.ink, .5), e(139, 51.9, .8, 2.2, c.hair),
      p('M 136 50 Q 143 47 149 50 M 136 51 L 134 49', 'none', c.ink, 1.1),
    ],
    brows: [p('M 137 45 Q 142 43 149 46', 'none', c.ink, 1)],
    noseMouth: [p('M 131 62 L 136 62 M 137 69 Q 143 70 147 68 M 144 77 L 151 77', 'none', '#9c7d77', .7)],
    hairFront: [p('M 136 32 Q 133 13 152 7 Q 178 -1 189 20 L 183 52 L 176 61 L 175 43 L 163 31 Q 147 38 136 32 Z', c.hair), p('M 151 15 Q 144 21 143 29', 'none', c.hairLight, 1)],
    glasses: [
      p('M 135 26 Q 142 22 148 26 L 148 33 Q 140 38 135 33 Z', '#a75c2d', '#cbb7a2', 1.2),
      p('M 148 28 L 165 31 L 175 43', 'none', '#cbb7a2', 1.4),
      p('M 137 28 L 141 25', 'none', '#fff0da', 1.3),
    ],
  };
}

export function referenceBackArtwork(): Partial<Record<GirlPart, VectorShape[]>> {
  return {
    hairBack: [p('M 126 34 Q 124 5 157 4 Q 190 1 194 32 L 190 80 L 182 96 L 137 96 L 129 79 Z', c.hair)],
    hairFront: [p('M 139 15 Q 129 38 140 82 M 149 12 Q 139 44 147 91 M 178 16 Q 189 44 178 86', 'none', c.hairLight, 1.1)],
    face: [], eyes: [], brows: [], noseMouth: [], glasses: [], chest: [],
    neck: [p('M 145 77 L 177 77 L 181 109 L 135 109 Z', c.skin), p('M 151 94 L 150 104 M 169 94 L 171 104', 'none', c.shade)],
    jacket: [
      p('M 139 84 L 117 94 L 123 109 L 112 124 L 124 164 L 144 193 L 140 207 Q 163 219 193 205 L 190 184 L 201 152 L 207 119 L 187 107 L 193 91 L 177 84 L 177 101 L 144 101 Z', c.blue),
      p('M 120 96 Q 152 118 190 93 L 181 109 Q 151 125 127 107 Z', c.blueLight),
      p('M 124 134 Q 140 156 146 192 L 143 205 L 150 208 L 154 188 L 139 151 Z', c.blueDark, 'none'),
      p('M 158 119 L 165 202 M 139 185 Q 162 195 190 184 M 143 203 Q 167 213 190 201', 'none', '#64718f', .9),
    ],
    midriff: [p('M 144 204 Q 167 215 188 204 C 191 218 200 234 210 246 L 209 263 Q 171 269 122 260 L 121 238 Q 138 217 144 204 Z', c.skin), p('M 165 218 Q 164 232 168 243', 'none', '#b7998f', .7)],
  };
}

export function referenceProfileBody(): Partial<Record<GirlPart, VectorShape[]>> {
  return {
    chest: [p('M 153 109 L 145 122 Q 136 139 145 155 L 151 163 L 159 150 L 167 123 Z', c.skin, 'none')],
    jacket: [
      p('M 153 86 L 175 87 L 172 104 Q 189 118 187 138 L 179 163 L 175 182 L 180 207 L 155 211 L 150 190 Q 151 175 143 167 Q 128 155 130 136 L 142 113 Z', c.blue),
      p('M 153 87 L 145 112 L 137 132 Q 134 148 144 161 L 140 143 L 147 123 L 158 106 Z', c.skin),
      p('M 174 108 Q 181 128 173 153 L 167 177 L 176 204 L 163 208 L 157 183 L 160 157 Z', c.blueDark, 'none'),
      p('M 153 87 L 151 105 L 143 121 M 143 166 L 150 190 L 155 206 M 160 196 L 174 195', 'none', '#7b87a4', 1),
    ],
    midriff: [p('M 155 207 L 179 206 Q 177 225 193 243 L 191 263 L 143 265 L 143 251 Q 148 239 150 228 Z', c.skin), p('M 155 210 L 153 226 Q 151 240 150 243', 'none', c.shade, 1)],
  };
}
