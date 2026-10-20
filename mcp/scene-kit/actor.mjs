import { T } from './drawing.mjs';

export const LIMBS = [
  { role: 'far-leg', socket: [-13, 0], upper: 62, lower: 60, radius: 10, z: 410, bend: -1 },
  { role: 'near-leg', socket: [13, 0], upper: 62, lower: 60, radius: 11, z: 430, bend: -1 },
  { role: 'far-arm', socket: [-21, -67], upper: 36, lower: 35, radius: 9, z: 420, bend: -1 },
  { role: 'near-arm', socket: [21, -67], upper: 36, lower: 35, radius: 10, z: 470, bend: 1 },
];

/** All limb geometry shares the lengths/pivots in LIMBS, never freehand offsets. */
export function actor(d, character = 'suited', suit = '#827265') {
  const { path: P, ellipse: E, layer: L, bone: B, capsule } = d;
  const ink = '#403e52', skin = '#efc6a0', shade = '#c88f73', pants = '#30363b';
  const trouserSegment = (length, topRadius, hemRadius, side) => [
    P(`M 0 ${-topRadius} Q ${length*.34} ${-hemRadius} ${length} ${-hemRadius} L ${length} ${hemRadius} Q ${length*.34} ${hemRadius} 0 ${topRadius} Z`, pants, ink, 2.2),
    P(`M ${length*.16} ${-topRadius*.65} Q ${length*.48} ${-hemRadius*.85} ${length*.88} ${-hemRadius*.75}`, 'none', side ? '#687076' : '#4e585d', 1.5),
    P(`M ${length*.22} ${-topRadius*.55} L ${length*.22} ${topRadius*.55}`, 'none', '#20262a', 1.1),
    P(`M ${length*.68} ${-hemRadius*.72} L ${length*.78} ${hemRadius*.72}`, 'none', '#20262a', 1),
  ];
  const cuff = (length, radius) => P(`M ${length-9} ${-radius} L ${length} ${-radius*.82} L ${length} ${radius*.82} L ${length-9} ${radius} Z`, '#f6efe0', ink, 1.5);
  const hand = [
    // The palm starts at the wrist pivot and extends forward; fingers and
    // thumb remain part of the same bound artwork instead of floating dots.
    P('M -4 -8 Q 0 -11 4 -8 L 8 -10 Q 12 -11 13 -8 L 11 -4 Q 16 -7 19 -3 Q 21 1 16 4 L 11 7 Q 9 12 3 12 L -3 9 Q -7 4 -4 -8 Z', skin, ink, 1.8),
    P('M 2 -6 Q 6 -2 10 0 M 7 -5 Q 10 -1 14 1 M -1 2 Q 3 4 7 5', 'none', shade, 1.2),
    P('M 3 11 Q 8 12 11 8', 'none', '#b77f63', 1.2),
  ];
  const shoe = [
    P('M -11 -8 Q -4 -10 6 -7 L 13 -3 Q 18 0 25 1 Q 32 2 34 7 Q 32 12 24 13 L -8 11 Q -14 7 -11 -8 Z', '#252a2c', ink, 2.1),
    P('M -9 7 Q 9 11 29 7', 'none', '#687176', 1.5),
    P('M 4 -6 L 12 -2', 'none', '#4f575a', 1.2),
  ];
  B('actor', 'shot', 0, T(585,518,0,.90));
  B('torso', 'actor', 0);
  B('neck', 'torso', 0, T(0,-82));
  B('head','neck',0);
  const joints = [];
  for (const limb of LIMBS) {
    const leg = limb.role.endsWith('leg'), material = leg ? '#323331' : suit;
    B(`${limb.role}-upper`, leg ? 'actor' : 'torso', limb.upper, T(...limb.socket, Math.PI/2));
    B(`${limb.role}-lower`, `${limb.role}-upper`, limb.lower, T(limb.upper,0));
    B(`${limb.role}-tip`, `${limb.role}-lower`,0,T(limb.lower,0));
    joints.push({ parent: `${limb.role}-upper`, child: `${limb.role}-lower`, length: limb.upper }, { parent: `${limb.role}-lower`, child: `${limb.role}-tip`, length: limb.lower });
    const upperArt = leg ? trouserSegment(limb.upper, limb.radius+2, limb.radius, limb.role === 'near-leg') : [capsule(limb.upper,limb.radius,material,ink)];
    const lowerArt = leg ? [E(0,0,limb.radius,limb.radius*.9,pants,ink,1.5), ...trouserSegment(limb.lower, limb.radius, Math.max(7,limb.radius-2), limb.role === 'near-leg')] : [capsule(limb.lower,limb.radius-.8,material,ink), E(0,0,limb.radius-1,limb.radius-1,material), cuff(limb.lower,limb.radius)];
    L(`${limb.role}-upper-art`,upperArt,limb.z,`${limb.role}-upper`);
    L(`${limb.role}-lower-art`,lowerArt,limb.z+1,`${limb.role}-lower`);
    if (leg) L(`${limb.role}-shoe`,shoe,limb.z+2,`${limb.role}-tip`);
    else L(`${limb.role}-hand`,hand,limb.z+2,`${limb.role}-tip`);
  }
  L('actor-pants-waist',[
    P('M -26 -7 Q 0 -13 26 -7 L 24 25 Q 17 39 0 40 Q -17 39 -24 25 Z',pants,ink,2.4),
    P('M -24 1 Q 0 7 24 1', 'none', '#687277', 2),
    P('M -18 8 L -10 19 M 18 8 L 10 19', 'none', '#20262a', 1.5),
    P('M -4 3 L -4 26 M 4 3 L 4 26', 'none', '#596268', 1.1),
    E(0,2,4,4,'#d4b273',ink,1.2),
  ],440,'actor');
  L('actor-neck', [
    P('M -8 -13 Q 0 -16 8 -13 L 8 7 Q 0 11 -8 7 Z',skin,ink,1.8),
    P('M -6 -8 Q 0 -5 6 -8', 'none', shade, 1.1),
  ],455,'neck');
  L('actor-coat',[
    P('M -14 -78 Q -28 -76 -32 -60 L -32 -8 Q -28 10 -10 16 L 22 12 Q 31 5 29 -12 L 25 -62 Q 23 -76 11 -78 Z',suit,ink,2.4),
    P('M -12 -76 L 1 -62 L 14 -76 L 10 -25 L -7 -23 Z','#fff8e9',ink,1.6),
    P('M -19 -75 L -4 -62 L -10 -47 L -23 -61 Z',suit,ink,1.6),
    P('M 19 -75 L 4 -62 L 10 -47 L 24 -61 Z',suit,ink,1.6),
    ...(character === 'suited' ? [P('M -2 -61 L 5 -63 L 8 -54 L 4 -27 L -3 -33 L 0 -54 Z','#923d35','#61362e',1.1)] : []),
    P('M -19 -75 L -25 -52 L -15 -43 L -22 -32 L -3 7 L -7 -55 Z','#a69680',ink,1.3),
    P('M 17 -76 L 25 -58 L 18 -44 L 23 -34 L 7 -3 L 7 -56 Z','#716559',ink,1.3),
    P('M -4 -23 Q 1 -8 -1 10 M 13 -16 L 24 -17', 'none',ink,1.3),
    E(7,-13,1.8,1.8,'#44382d'),E(7,0,1.8,1.8,'#44382d'),
  ],450,'torso');
  L('actor-head',[
    // Deliberately asymmetric adult cartoon face with a protruding nose, ears,
    // receding side-part, expressive brows, long jaw and small mouth.
    P('M -26 -63 Q -42 -46 -30 -23 Q -36 -14 -24 -5 Q -11 8 13 8 Q 34 5 35 -10 L 33 -37 Q 27 -68 9 -77 Z',skin,ink,2.5),
    P('M -28 -28 Q -43 -43 -47 -29 Q -46 -15 -29 -15 L -21 -13',skin,ink,2),
    P('M -31 -22 Q -39 -31 -41 -26 Q -39 -21 -34 -20','none','#a77a5f',1.5),
    P('M -31 -25 Q -42 -52 -30 -70 Q -14 -88 13 -84 Q 27 -84 31 -71 Q 3 -63 -24 -67 Q -21 -48 -26 -29 Z','#171b1b',ink,2),
    P('M -23 -70 Q 0 -64 22 -71 M -20 -63 Q 2 -59 21 -65','none','#b49274',1.2),
    P('M -16 -50 Q -6 -59 1 -50 M 15 -55 Q 25 -62 31 -53','none','#37261f',5),
    E(-7,-35,10,13,'#fffdf6',ink,1.6),E(20,-38,9,12,'#fffdf6',ink,1.6),
    E(-3,-33,2.7,4.2,'#20211e'),E(24,-36,2.7,4.2,'#20211e'),
    P('M 11 -40 Q 16 -30 22 -22 Q 38 -17 34 -10 Q 30 -6 23 -9 Q 17 -12 11 -11 Q 4 -8 4 -16 Q 3 -21 10 -22',skin,ink,1.7),
    E(32,-3,2,2,'#453126'),
    P('M -8 -1 Q 2 -7 15 -2 Q 8 5 -8 -1 Z','#855244','#583b30',1.2),
    P('M -5 -1 L 10 -1','none','#e9baa0',1.5),
  ],490,'head',T(1,1,0,.82));
  return { joints, limbs: LIMBS, character, headLayer: 'actor-head' };
}
