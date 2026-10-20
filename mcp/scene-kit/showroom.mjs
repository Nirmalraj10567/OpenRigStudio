import { T } from './drawing.mjs';

export const PALETTES = {
  pastel: { wall: '#f2e4e9', floor: '#fcf7f7', tile: '#b1d0dc', tileLine: '#d3e7eb', sofa: '#d0afec', sofaShade: '#a491bd', ink: '#403e52', wood: '#edd1b8' },
  warm: { wall: '#efe4d4', floor: '#fbf7ec', tile: '#b9ccc1', tileLine: '#e4ece1', sofa: '#8aaba0', sofaShade: '#6d8d86', ink: '#3e514c', wood: '#d9b58e' },
};

/** Perspective staging is authored once; callers only choose a named palette. */
export function showroom(d, p) {
  const { path: P, rect: R, ellipse: E, layer: L } = d;
  L('room-shell', [R(-800,-700,2900,1800,p.floor), R(-800,-700,2900,990,p.wall),
    P('M -300 -300 L 360 -300 L 360 300 L -300 600 Z', '#f7edf0'),
    P('M 865 -300 L 1450 -300 L 1450 490 L 865 295 Z', '#eaf3f5'),
    R(335, -300, 23, 593, '#dfd0d8'), R(355,-300,12,596,'#faf0f2'),
    R(864,-200,5,501,'#d2e3e8'),
    ...[455,570,685].map(x => P(`M ${x} 126 L ${x+86} 126 L ${x+86} 222 L ${x} 222 Z`, 'none', '#f8eef1', 2)),
    P('M 0 92 L 189 92 L 189 319 M 18 116 L 157 116 L 157 332', 'none', '#fceff3', 3),
  ], -1000);
  L('display-islands', [
    P('M 0 445 L 513 379 L 416 720 L -100 720 Z', p.tile),
    P('M 752 379 L 1133 366 L 1460 574 L 845 575 Z', p.tile),
    P('M 865 611 L 1400 591 L 1460 770 L 960 770 Z', '#c1dbe4'),
    P('M 345 288 L 625 288 L 653 348 L 369 354 Z', '#d5e3e5'),
    ...[498,551,618,690].map((y,i) => P(`M -80 ${y} L ${483-i*22} ${y-31}`, 'none', p.tileLine, 1.5)),
    ...[65,174,300].map(x => P(`M ${x} 431 L ${x-100} 720`, 'none', p.tileLine, 1.5)),
    ...[434,480,529].map((y,i) => P(`M ${775+i*26} ${y} L ${1190+i*80} ${y-14}`, 'none', p.tileLine, 1.5)),
    ...[837,930,1030].map(x => P(`M ${x} 380 L ${x+172} 574`, 'none', p.tileLine, 1.5)),
  ], -950);
  // Subdued furniture at the vanishing plane, behind the main display.
  L('distant-furniture', [
    P('M 396 278 Q 392 259 414 258 L 526 255 Q 548 257 548 275 L 579 296 L 579 327 L 402 327 Z', '#ddd9df'),
    P('M 401 289 L 548 286 L 574 300 L 425 308 Z', '#e9e4e8'),
    P('M 452 260 L 458 289 M 502 258 L 507 288 M 425 308 L 425 330', 'none', '#f2ebef', 2),
    R(411,325,6,19,'#d6d3dc'),R(564,324,6,17,'#d6d3dc'),
    P('M 740 260 L 790 256 L 794 327 L 758 327 Z', '#c4dce4'),
    P('M 744 263 Q 768 274 787 260 M 746 296 L 790 292', 'none', '#e1edf0', 2),
    R(757,327,4,17,'#c4dce4'),R(788,326,4,16,'#c4dce4'),
  ], -900);
  const bed = (id,x,y,s,color) => {
    const shapes = [
      E(63,139,112,14,'#8daab5'),
      P('M 44 98 L 48 140 Q 54 149 58 141 L 57 103 M 153 96 L 151 143 Q 157 153 162 144 L 165 91',p.wood,p.ink,2),
      P('M -7 85 L -2 119 Q 3 128 7 120 L 8 85 M 87 125 L 87 165 Q 92 172 98 164 L 99 122',p.wood,p.ink,2),
      P('M 17 1 Q 17 -6 25 -6 L 95 -11 Q 102 -12 104 -4 L 107 58 L 24 64 Z',p.wood,p.ink,2.5),
      P('M 25 4 L 94 0 L 96 36 L 29 41 Z','#f6e4d2'),
      E(94,0,2,2,'#8b8b8c'),
      P('M 25 39 Q 28 30 40 31 L 76 27 Q 90 27 91 40 L 99 61 L 42 72 Z','#fffdf8',p.ink,2),
      P('M 30 63 L 104 57 L 178 101 L 70 125 L -18 103 Z','#fff3d9',p.ink,2),
      P('M 31 64 L 104 58 L 178 101 L 70 121 L -16 102 Z',color,p.ink,2.3),
      P('M -16 102 L 70 121 L 178 101 L 177 118 L 70 140 L -16 119 Z',p.wood,p.ink,2),
      P('M -16 101 L 70 120 L 178 101 L 177 110 L 69 131 L -16 110 Z',color,p.ink,1.8),
      P('M 70 121 L 70 131', 'none',p.ink,1.3),
    ];
    L(id,shapes,-820+Math.round(y/10),'shot',T(x,y,0,s));
  };
  bed('bed-rear',302,310,.76,'#cba7e7');
  bed('bed-middle',183,357,1.03,'#b9d4a3');
  bed('bed-front',19,423,1.25,'#eaa7b1');

  const sofa = [
    E(186,194,208,23,'#88aab8'),
    P('M 12 127 L 23 186 Q 25 195 32 192 Q 36 190 32 176 L 30 134 Z','#dbe8e8',p.ink,3),
    P('M 311 136 L 315 201 Q 317 211 325 207 Q 330 204 328 195 L 325 132 Z','#dbe8e8',p.ink,3),
    P('M 189 172 L 194 231 Q 197 242 205 239 Q 211 238 207 225 L 202 170 Z','#e4eff0',p.ink,3),
    P('M 67 73 Q 82 25 122 13 Q 213 16 382 44 Q 395 47 392 71 L 375 126 L 210 158 Z',p.sofa,p.ink,3.5),
    P('M 303 101 Q 309 69 328 36 L 382 44 Q 397 47 390 75 L 374 127 Z',p.sofaShade,p.ink,2.5),
    P('M 65 75 L 123 16 M 139 89 Q 161 49 205 25 M 222 105 Q 247 59 284 33', 'none','#8e739f',2),
    P('M -17 101 Q -25 91 -11 85 L 67 72 L 307 114 L 374 128 Q 383 147 367 155 L 194 183 L -12 128 Q -22 123 -17 101 Z',p.sofaShade,p.ink,3.5),
    P('M -16 94 L 66 77 L 309 116 L 367 130 L 194 164 L -11 117 Q -24 107 -16 94 Z','#dabbf1',p.ink,2.6),
    P('M 72 79 L 144 92 L 45 130 M 226 105 L 123 151 M 307 118 L 195 163 L 194 181', 'none','#977aae',2),
    P('M 47 130 L 47 144 M 124 152 L 124 163', 'none','#877494',1.8),
    E(319,158,8,10,p.sofaShade,p.ink,1.8),
    P('M 318 155 L 285 161 Q 281 165 286 167 L 320 161 Z','#e0ddec',p.ink,2),
  ];
  L('purple-sofa',sofa,-500,'shot',T(800,304,0,1.02));
  L('sofa-information',[
    E(0,128,31,9,'#a5c6d2'),E(0,128,22,6,'#d7e7ed'),
    P('M -4 27 L -5 119 Q 0 133 5 119 L 4 27 Z','#c6dee8','#b5d1dc'),
    P('M -24 -58 L 36 -46 L 24 38 L -38 23 Z','#f8fcfc','#d8e7eb',2),
    P('M -12 -42 L 24 -36 L 13 14 L -24 7 Z','#f0f5f7'),
    P('M -7 -22 L 2 -20 L 5 -34 Q 10 -42 14 -33 L 10 -13 L -9 -16 Z','#b49bcc'),
    P('M -17 -1 L 12 4 M -18 6 L 11 11 M -20 13 L 9 18', 'none','#d5e1e6',1.7),
  ],-400,'shot',T(1208,326));
  L('foreground-lounge',[
    E(24,752,238,43,'#a2bbce'),
    P('M -115 674 Q -99 560 41 570 Q 151 579 201 714 L 213 770 L -115 770 Z','#d3b2e8',p.ink,3),
    P('M -99 645 Q -69 580 21 603 Q 111 620 117 712 Q 101 750 47 757 L -99 744 Z','#dcbeee','#b491cb',2),
    P('M -13 611 Q -38 660 32 672 Q 71 680 68 724 M 123 650 Q 76 659 103 696 M 22 599 Q 52 621 83 622', 'none','#c3a0dc',2),
  ],900);
}
