// "The Bell Rings at Four" — a square motion-graphics film.
// A girl-teacher's school day, morning to evening, authored as ordinary
// Character Studio project data: layers, bones, native keyframes, one camera.
// Classroom framing throughout; each lesson is a portfolio subject.

// ------------------------------------------------------------- maths -------
const T = (x = 0, y = 0, rotation = 0, scale = 1) => ({ x, y, rotation, scaleX: scale, scaleY: scale });
const mix = (a, b, t) => a + (b - a) * t;
const clamp = x => Math.max(0, Math.min(1, x));
const rng = seed => { let s = (seed >>> 0) || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
const xml = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const hexToRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbToHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const hexMix = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * t)); };

// ----------------------------------------------------------- palette -------
const INK = '#22303a';
const CHALK = '#f4efe0';
const CHALK_SOFT = '#cfd8cc';
const WOOD = '#b07a44';
const WOOD_DK = '#7c5228';
const ROSE = '#c76a76';
const HAIR = '#3a2b2b';
const SKIN = '#f0c8a2';
const TIGHTS = '#4a4550';

const TOD = {
  dawn: { tint: '#f4b25e', alpha: 0.30 },
  morning: { tint: '#ffd98a', alpha: 0.20 },
  noon: { tint: '#fff4d0', alpha: 0.10 },
  afternoon: { tint: '#ffc06a', alpha: 0.20 },
  golden: { tint: '#ff9a4d', alpha: 0.30 },
  dusk: { tint: '#6a4a72', alpha: 0.42 },
};
const SKY = {
  dawn: ['#f7cf94', '#e7b6a0', '#c9b7cf'],
  morning: ['#bfe3f2', '#e6f1f3', '#f6f1e2'],
  noon: ['#a9d9ee', '#d6ecf3', '#eef6f4'],
  dusk: ['#8a6f9e', '#c58a86', '#e7b07e'],
};

// ---------------------------------------------------------- geometry -------
const W = 1080, H = 1080;
const BOARD_F = { x: 252, y: 300, w: 576, h: 404 };
const BOARD_IN = { x: BOARD_F.x + 16, y: BOARD_F.y + 16, w: BOARD_F.w - 32, h: BOARD_F.h - 32 };
const WIN_L = { x: 44, y: 330, w: 168, h: 396 };
const WIN_R = { x: 868, y: 330, w: 168, h: 396 };
const CLOCK = { cx: 540, cy: 180, r: 48 };
const FLOOR_Y = 768;
const TEACH = { x: 150, feet: 820 };

const T0 = {
  hook: [0.0, 1.0], numbers: [1.0, 7.6], drawing: [7.6, 14.2],
  stories: [14.2, 20.8], play: [20.8, 26.4], home: [26.4, 28.6], close: [28.6, 30.0],
};

export function createSchoolDayScene({ name = 'The Bell Rings at Four', fps = 24, duration = 30 } = {}) {
  if (!Number.isInteger(fps) || fps < 12 || fps > 60) throw new Error('fps must be an integer from 12 to 60');
  if (!Number.isFinite(duration) || duration < 10 || duration > 120) throw new Error('duration must be between 10 and 120 seconds');
  const endFrame = Math.round(duration * fps);
  const F = t => Math.max(0, Math.min(endFrame, Math.round(t * fps)));

  const project = {
    schemaVersion: 1, id: 'school-day', name,
    canvas: { width: W, height: H, background: '#171012' },
    bones: [], layers: [], bindings: [], animations: [], groups: [],
    cameras: [{
      id: 'class-cam', name: 'Classroom master', hotkey: 1,
      settings: { enabled: true, cameraX: 0, cameraY: 0, zoom: 1, perspective: 0, yaw: 0, pitch: 0, roll: 0, projection: 'orthographic' },
      follow: null,
    }],
    cameraView: 'switch',
    stage2d: { enabled: false, cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0, projection: 'perspective' },
    cameraProduction: { stageMode: false, liveControl: { enabled: false, source: 'pointer', sensitivity: 1, smoothing: 0.8 }, shake: { enabled: false, amplitude: 0, frequency: 12, rotation: 0, seed: 1 }, bookmarks: [], cameraRigs: [], defaultTransitionPresetId: 'cut' },
    smartActions: [], smartActionFolders: [], actionLibrary: [], controllers: [], controllerInstances: [],
    characterViews: [], facialProfiles: [], headCreators: [], constraints: [], lipSyncTracks: [],
    dynamics: { enabled: false, startFrame: 0, endFrame, fps, substeps: 4, gravityX: 0, gravityY: 0, windX: 0, windY: 0, windNoise: 0, seed: 1, bones: [], bodies: [], meshes: [], emitters: [] },
    timeline: { currentFrame: 0, currentTime: 0, isPlaying: false, loop: false, fps, startFrame: 0, endFrame, activeAnimationId: null },
    metadata: {
      createdBy: 'character-studio-mcp', story: 'school_day', style: 'flat-classroom-motion-graphics',
      durationSeconds: String(duration), beats: 'hook,numbers,drawing,stories,play,home,close',
      audioCues: 'bell@0.05,whoosh@1.0,impact@1.35,whoosh@7.6,whoosh@14.2,train@15.2,whoosh@20.8,riser@20.4,whoosh@26.4,bell@26.5,sting@28.9,loop@29.9',
    },
  };
  const clip = { id: 'school-day-clip', name: 'One school day', fps, startFrame: 0, endFrame, loopMode: 'once', tracks: [] };
  project.animations = [clip];
  project.timeline.activeAnimationId = clip.id;

  // ------------------------------------------------------------ tracks ----
  // Sanitising keyed channel: frames clamped into range, equal frames collapsed
  // (later value wins) and a frame-0 hold inserted so no channel depends on setupPose.
  const track = (targetId, property, values, easing = 'smooth') => {
    const id = `${targetId}-${property}`;
    const raw = values.map(([t, value, mode], i) => ({ id: `${id}-${i}`, frame: F(t), value, easing: mode ?? easing }));
    const keys = [];
    for (const k of raw) { const last = keys[keys.length - 1]; if (last && last.frame === k.frame) keys[keys.length - 1] = k; else keys.push(k); }
    if (keys.length && keys[0].frame > 0) keys.unshift({ id: `${id}-hold`, frame: 0, value: keys[0].value, easing: keys[0].easing });
    clip.tracks.push({ id, targetId, property, keyframes: keys });
    return id;
  };
  const show = (targetId, from, to) => {
    const id = `${targetId}-visible`;
    const keys = [{ id: `${id}-0`, frame: 0, value: from <= 0, easing: 'step' }];
    if (from > 0 && F(from) > 0) keys.push({ id: `${id}-in`, frame: F(from), value: true, easing: 'step' });
    if (to < duration) keys.push({ id: `${id}-out`, frame: F(to), value: false, easing: 'step' });
    clip.tracks.push({ id, targetId, property: 'visible', keyframes: keys });
    return id;
  };
  const fade = (targetId, values) => track(targetId, 'opacity', values, 'smooth');

  // ------------------------------------------------------------ shapes ----
  let n = 0;
  const R = (x, y, width, height, fill, extra = {}) => ({ id: `sd-${++n}`, kind: 'rect', x, y, width, height, fill, ...extra });
  const E = (x, y, radiusX, radiusY, fill, extra = {}) => ({ id: `sd-${++n}`, kind: 'ellipse', x, y, radiusX, radiusY, fill, ...extra });
  const P = (d, fill, stroke = 'none', strokeWidth = 2, extra = {}) => ({ id: `sd-${++n}`, kind: 'path', d, fill, stroke, strokeWidth, ...extra });
  const PO = (points, fill, extra = {}) => ({ id: `sd-${++n}`, kind: 'polygon', points, fill, stroke: 'none', strokeWidth: 1, ...extra });

  const layer = (id, name, shapes, zIndex, local = T()) => {
    project.layers.push({ id, name, type: 'vector', local, shapes, zIndex, visible: true, opacity: 1, locked: false, boundBoneId: null });
    return id;
  };
  const text = (id, words, x, y, size, color, o = {}) => {
    const { width = 760, weight = 800, tracking = 0.6, family = "'Helvetica Neue', Helvetica, Arial, sans-serif", height = Math.round(size * 1.9), z = 890 } = o;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
      + `<text x="${width / 2}" y="${height * 0.72}" text-anchor="middle" font-family="${family}" font-size="${size}" font-weight="${weight}" letter-spacing="${tracking}em" fill="${color}">${xml(words)}</text></svg>`;
    project.layers.push({ id, name: words, type: 'image', src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width, height, color, local: T(x, y), zIndex: z, visible: true, opacity: 1, locked: false, boundBoneId: null });
    return id;
  };
  const vgrad = (x, y, w, h, c1, c2, steps = 24, opacity = 1) => {
    const shapes = [];
    for (let i = 0; i < steps; i++) shapes.push(R(x, y + (h * i) / steps, w, h / steps + 1, hexMix(c1, c2, i / (steps - 1)), { opacity }));
    return shapes;
  };

  // ------------------------------------------------------ the classroom ----
  layer('wall', 'Room · back wall', [R(-200, -200, W + 400, FLOOR_Y + 200, '#e9dcc4'), R(-200, 0, W + 400, 150, '#f2e7d2')], -400);
  layer('wall-skirt', 'Room · rail and skirting', [R(-200, 232, W + 400, 10, WOOD_DK), R(-200, FLOOR_Y - 26, W + 400, 26, '#caa877'), R(-200, FLOOR_Y - 4, W + 400, 6, WOOD_DK)], -390);
  layer('floor', 'Room · floorboards', [R(-200, FLOOR_Y, W + 400, H - FLOOR_Y + 200, '#a86f3f'), ...Array.from({ length: 9 }, (_, i) => R(-200 + i * 150, FLOOR_Y, 6, H - FLOOR_Y + 200, '#8f5c31', { opacity: 0.7 })), R(-200, FLOOR_Y, W + 400, 14, '#7c5228')], -385);

  const smudge = rng(77), smudges = [];
  for (let i = 0; i < 14; i++) smudges.push(E(BOARD_IN.x + smudge() * BOARD_IN.w, BOARD_IN.y + smudge() * BOARD_IN.h, 26 + smudge() * 60, 12 + smudge() * 26, CHALK, { opacity: 0.02 + smudge() * 0.03 }));
  layer('board', 'Board · surface', [...vgrad(BOARD_IN.x, BOARD_IN.y, BOARD_IN.w, BOARD_IN.h, '#33564a', '#253f37', 22), ...smudges], 0);
  layer('board-frame', 'Board · frame', [
    R(BOARD_F.x - 16, BOARD_F.y - 16, BOARD_F.w + 32, 16, WOOD_DK),
    R(BOARD_F.x - 16, BOARD_F.y + BOARD_F.h, BOARD_F.w + 32, 16, WOOD_DK),
    R(BOARD_F.x - 16, BOARD_F.y, 16, BOARD_F.h, WOOD_DK),
    R(BOARD_F.x + BOARD_F.w, BOARD_F.y, 16, BOARD_F.h, WOOD_DK),
    R(BOARD_F.x - 16, BOARD_F.y - 16, BOARD_F.w + 32, 32, WOOD),
    R(BOARD_F.x - 16, BOARD_F.y + BOARD_F.h - 16, BOARD_F.w + 32, 32, WOOD),
    R(BOARD_F.x - 16, BOARD_F.y - 16, 32, BOARD_F.h + 32, WOOD),
    R(BOARD_F.x + BOARD_F.w - 16, BOARD_F.y - 16, 32, BOARD_F.h + 32, WOOD),
    R(BOARD_IN.x, BOARD_IN.y, BOARD_IN.w, BOARD_IN.h, 'none', { stroke: '#1c2e26', strokeWidth: 3 }),
    R(BOARD_F.x - 16, BOARD_F.y + BOARD_F.h + 16, BOARD_F.w + 32, 22, WOOD, { stroke: WOOD_DK, strokeWidth: 2 }),
    E(BOARD_F.x + BOARD_F.w / 2, BOARD_F.y + BOARD_F.h + 42, 52, 10, '#e7dcc4'),
    R(BOARD_F.x + 30, BOARD_F.y + BOARD_F.h + 26, 150, 12, '#f6efe0', { stroke: '#d8c9a8', strokeWidth: 1.5 }),
    R(BOARD_F.x + 200, BOARD_F.y + BOARD_F.h + 26, 90, 10, ROSE),
  ], 60);

  const windowBox = (id, win) => {
    const fr = 12;
    layer(`${id}-recess`, `Window ${id} · recess`, [R(win.x - fr, win.y - fr, win.w + fr * 2, win.h + fr * 2, '#f0e6d0')], -278);
    layer(`${id}-bars`, `Window ${id} · frame`, [
      R(win.x - fr, win.y - fr, win.w + fr * 2, fr, '#f7efdd'), R(win.x - fr, win.y + win.h, win.w + fr * 2, fr, '#f7efdd'),
      R(win.x - fr, win.y - fr, fr, win.h + fr * 2, '#f7efdd'), R(win.x + win.w, win.y - fr, fr, win.h + fr * 2, '#f7efdd'),
      R(win.x - 4, win.y, 8, win.h, '#f7efdd'), R(win.x, win.y + win.h / 2 - 4, win.w, 8, '#f7efdd'),
    ], -258);
    layer(`${id}-sill`, `Window ${id} · sill`, [
      R(win.x - 30, win.y + win.h + fr, win.w + 60, 16, WOOD), R(win.x - 30, win.y + win.h + fr + 16, win.w + 60, 6, WOOD_DK),
      R(win.x + win.w / 2 - 16, win.y + win.h - 6, 32, 24, '#cf9a72'), R(win.x + win.w / 2, win.y + win.h - 22, 4, 20, '#6f9b5e'),
      E(win.x + win.w / 2 - 12, win.y + win.h - 26, 11, 8, '#7fae6a'), E(win.x + win.w / 2 + 12, win.y + win.h - 24, 11, 8, '#8cbb74'),
    ], -256);
  };
  windowBox('L', WIN_L); windowBox('R', WIN_R);

  layer('clock', 'Clock · dial', [
    E(CLOCK.cx, CLOCK.cy + 6, CLOCK.r + 10, CLOCK.r + 10, '#d9c8a4'), E(CLOCK.cx, CLOCK.cy + 6, CLOCK.r + 8, CLOCK.r + 8, '#f6efe0'),
    E(CLOCK.cx, CLOCK.cy, CLOCK.r, CLOCK.r, '#fbf6ea', { stroke: INK, strokeWidth: 4 }), E(CLOCK.cx, CLOCK.cy, CLOCK.r - 8, CLOCK.r - 8, 'none', { stroke: WOOD, strokeWidth: 3 }),
    ...Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2, r1 = CLOCK.r - 14, r2 = CLOCK.r - 7; return P(`M ${CLOCK.cx + Math.sin(a) * r1} ${CLOCK.cy - Math.cos(a) * r1} L ${CLOCK.cx + Math.sin(a) * r2} ${CLOCK.cy - Math.cos(a) * r2}`, i % 3 ? CHALK_SOFT : INK, 'none', i % 3 ? 2 : 4); }),
    E(CLOCK.cx, CLOCK.cy, 5, 5, INK),
  ], -250);
  layer('clock-hour', 'Clock · hour hand', [R(-6, -CLOCK.r * 0.52, 12, CLOCK.r * 0.52, INK, { opacity: 0.9 })], -248, T(CLOCK.cx, CLOCK.cy));
  layer('clock-min', 'Clock · minute hand', [R(-5, -CLOCK.r * 0.78, 10, CLOCK.r * 0.78, '#7a2f3a')], -247, T(CLOCK.cx, CLOCK.cy));

  const desk = (cx, s) => {
    const w = 250 * s;
    return [
      R(cx - w / 2, 892, w, 26, '#8a5a30'), R(cx - w / 2, 892, w, 6, '#a67442'),
      R(cx - w / 2 + 16, 892, 18, 150, '#6f4622'), R(cx + w / 2 - 34, 892, 18, 150, '#6f4622'),
      R(cx - w / 2 + 4, 1024, 26, 26, '#5d3a1c'), R(cx + w / 2 - 30, 1024, 26, 26, '#5d3a1c'),
      P(`M ${cx - w / 2 - 10} 886 L ${cx + w / 2 + 10} 886 L ${cx + w / 2 + 30} 940 L ${cx - w / 2 - 30} 940 Z`, '#3f4a44', INK, 2),
    ];
  };
  layer('desks', 'Class · empty desks', [...desk(250, 1.05), ...desk(560, 1.12), ...desk(880, 1.0)], 620);

  // ---------------------------------------------------------- teacher -------
  // Back-three-quarter figure authored about the feet; a transform-free, scalar
  // sway keeps it alive without a rig.
  const teacher = [];
  teacher.push(R(-34, -132, 30, 132, TIGHTS), R(6, -132, 30, 132, TIGHTS));
  teacher.push(P('M -40 -4 L 40 -4 L 48 24 Q 0 34 -48 24 Z', '#2b2f36'));
  teacher.push(P('M -50 -6 L -28 -6 L -30 24 L -54 22 Z', '#20242a'), P('M 28 -6 L 50 -6 L 54 22 L 30 24 Z', '#20242a'));
  teacher.push(P('M -74 -300 Q 0 -322 74 -300 L 92 -120 Q 0 -96 -92 -120 Z', ROSE, '#8f4a55', 3));
  teacher.push(P('M -60 -300 Q 0 -318 60 -300 L 72 -220 Q 0 -240 -72 -220 Z', '#e8b56a'));
  teacher.push(P('M -74 -300 Q 0 -322 74 -300 L 66 -262 Q 0 -278 -66 -262 Z', '#d98f98'));
  teacher.push(R(-92, -150, 184, 34, '#b45f6b'));
  teacher.push(P('M -14 -318 L 0 -300 L 14 -318 L 0 -310 Z', '#f6efe0'));
  teacher.push(P('M 60 -286 Q 96 -246 108 -196 Q 96 -186 84 -194 Q 74 -236 48 -268 Z', ROSE, '#8f4a55', 3));
  teacher.push(P('M 104 -198 Q 128 -176 150 -150 Q 142 -140 130 -148 Q 112 -168 92 -188 Z', SKIN, '#c99a72', 2.5));
  teacher.push(R(136, -166, 64, 8, '#caa25c'));
  teacher.push(P('M -60 -286 Q -80 -250 -84 -206 Q -70 -202 -64 -210 Q -60 -246 -48 -270 Z', ROSE, '#8f4a55', 3));
  teacher.push(E(-84, -200, 14, 16, SKIN, { stroke: '#c99a72', strokeWidth: 2.5 }));
  teacher.push(P('M -34 -300 Q -40 -360 -18 -382 Q 6 -404 40 -392 Q 66 -380 64 -344 Q 62 -308 34 -298 Q 0 -290 -34 -300 Z', SKIN, '#d8a87e', 2));
  teacher.push(P('M -44 -344 Q -50 -402 -6 -420 Q 44 -436 72 -398 Q 84 -368 70 -348 Q 52 -368 24 -372 Q -14 -374 -30 -350 Q -36 -344 -44 -344 Z', HAIR));
  teacher.push(E(6, -300, 44, 30, HAIR), E(-30, -318, 20, 18, '#2c2020'));
  layer('teacher', 'Miss · at the board', teacher, 300, T(TEACH.x, TEACH.feet));
  layer('teacher-hand', 'Miss · chalk hand', [E(0, 0, 15, 15, SKIN, { stroke: '#c99a72', strokeWidth: 2.5 }), R(-4, -14, 8, 12, CHALK)], 304, T(TEACH.x + 168, TEACH.feet - 176));

  // ------------------------------------------------------ light & time ------
  const tintIds = {};
  for (const key of Object.keys(TOD)) tintIds[key] = layer(`tint-${key}`, `Light · ${key}`, [R(-400, -400, W + 800, H + 800, TOD[key].tint)], 700);
  const skyIds = { L: {}, R: {} };
  for (const [key, cols] of Object.entries(SKY)) {
    for (const side of ['L', 'R']) {
      const win = side === 'L' ? WIN_L : WIN_R;
      skyIds[side][key] = layer(`sky-${side}-${key}`, `Window ${side} · ${key} sky`, vgrad(win.x, win.y, win.w, win.h, cols[0], cols[2], 22), -270);
      skyIds[side][`${key}h`] = layer(`sky-${side}-${key}h`, `Window ${side} · ${key} hills`, [
        PO([{ x: win.x, y: win.y + win.h - 70 }, { x: win.x + win.w * 0.4, y: win.y + win.h - 118 }, { x: win.x + win.w, y: win.y + win.h - 84 }, { x: win.x + win.w, y: win.y + win.h }, { x: win.x, y: win.y + win.h }], hexMix(cols[1], '#3f5a48', 0.55)),
      ], -268);
    }
  }
  layer('sun', 'Window · sun', [E(0, 0, 26, 26, '#ffe9a8'), E(0, 0, 40, 40, '#ffd97a', { opacity: 0.28 })], -266, T(WIN_L.x + 40, WIN_L.y + 90));
  layer('moon', 'Window · moon', [E(0, 0, 20, 20, '#f2f0e6'), E(6, 4, 20, 20, '#8a6f9e')], -266, T(WIN_R.x + 120, WIN_R.y + 300));

  const mr = rng(4242), motes = [];
  for (let i = 0; i < 34; i++) motes.push(E(120 + mr() * 840, 220 + mr() * 620, 2 + mr() * 3, 2 + mr() * 3, '#fff6df', { opacity: 0.18 + mr() * 0.3 }));
  layer('dust', 'Room · dust', motes, 690);
  track('dust', 'y', [[0, 0], [duration, -40]], 'linear');
  track('dust', 'x', [[0, 0], [duration, 26]], 'linear');

  layer('board-rule', 'Board · baseline rule', [R(BOARD_IN.x + 40, BOARD_IN.y + BOARD_IN.h - 58, BOARD_IN.w - 80, 3, CHALK, { opacity: 0.5 })], 12);

  // ------------------------------------------------ P1 · NUMBERS ----------
  layer('num-grid', 'Numbers · axes', [
    R(BOARD_IN.x + 60, BOARD_IN.y + 60, 3, BOARD_IN.h - 150, CHALK_SOFT, { opacity: 0.5 }),
    R(BOARD_IN.x + 60, BOARD_IN.y + BOARD_IN.h - 90, BOARD_IN.w - 130, 3, CHALK_SOFT, { opacity: 0.5 }),
  ], 14);
  const bx0 = BOARD_IN.x + 150, bx1 = BOARD_IN.x + BOARD_IN.w - 150, ballR = 24, ballFloor = BOARD_IN.y + BOARD_IN.h - 90, ballTop = BOARD_IN.y + 60;
  text('num-title', 'g = 9.8', BOARD_IN.x + 150, BOARD_IN.y + 86, 46, CHALK, { z: 20, width: 520 });
  text('num-sub', 'one chalk ball, in one act', BOARD_IN.x + 150, BOARD_IN.y + 132, 22, ROSE, { z: 20, width: 520 });
  text('num-stamp', 'BOUNCE', BOARD_IN.x + BOARD_IN.w - 150, BOARD_IN.y + 130, 34, ROSE, { z: 22, width: 360 });
  // decaying-bounce trail (fixed dots in world coords; the layer only fades)
  const trailDots = [];
  for (let i = 0; i < 15; i++) trailDots.push(E(bx0 + 8 + ((bx1 - bx0) * i) / 14, ballFloor - 210 * Math.pow(0.72, i * 0.75), 3.4, 3.4, CHALK, { opacity: 0.5 }));
  layer('num-trail', 'Numbers · trajectory', trailDots, 15);
  // per-frame bounce
  const ballKeys = [], sqKeys = [];
  {
    const g = 1900, e = 0.62; let y = ballTop, vy = 0, t = T0.numbers[0] + 0.45; const dt = 1 / fps;
    while (t <= T0.numbers[1] - 0.15) {
      vy += g * dt; y += vy * dt; let sq = 1;
      if (y > ballFloor) { y = ballFloor; vy = -vy * e; if (Math.abs(vy) < 55) vy = 0; sq = 1 - Math.min(0.38, Math.abs(vy) / 4400); }
      ballKeys.push([t, y]); sqKeys.push([t, sq]); t += dt;
    }
  }
  layer('num-ball', 'Numbers · the ball', [E(0, 0, ballR * 1.15, ballR, '#f7f1df', { stroke: CHALK, strokeWidth: 3 }), E(0, 0, ballR * 1.15, ballR, 'none', { stroke: INK, strokeWidth: 1.5, opacity: 0.35 })], 16, T(bx0, ballTop));
  track('num-ball', 'y', ballKeys, 'linear');
  track('num-ball', 'scaleY', sqKeys, 'linear');
  track('num-ball', 'scaleX', sqKeys.map(([t, s]) => [t, 2 - s]), 'linear');
  for (const id of ['num-grid', 'num-title', 'num-sub', 'num-ball']) show(id, T0.numbers[0] + 0.02, T0.numbers[1] - 0.05);
  show('num-trail', T0.numbers[0] + 0.2, T0.numbers[1] - 0.1);
  fade('num-trail', [[T0.numbers[0] + 0.3, 0], [T0.numbers[0] + 1.4, 0.55], [T0.numbers[1] - 0.6, 0.5], [T0.numbers[1] - 0.2, 0]]);
  show('num-stamp', T0.numbers[0] + 2.4, T0.numbers[1] - 0.1);
  fade('num-stamp', [[T0.numbers[0] + 2.4, 0], [T0.numbers[0] + 2.65, 1], [T0.numbers[1] - 0.3, 1], [T0.numbers[1] - 0.1, 0]]);

  // ------------------------------------------------ P2 · DRAWING ----------
  const carY = BOARD_IN.y + BOARD_IN.h - 150, carX = BOARD_IN.x + 70;
  text('draw-title-t', 'FROM A SINGLE LINE', BOARD_IN.x + BOARD_IN.w / 2, BOARD_IN.y + 74, 40, CHALK, { z: 20, width: 560 });
  show('draw-title-t', T0.drawing[0] + 0.15, T0.drawing[1] - 0.1);
  fade('draw-title-t', [[T0.drawing[0] + 0.15, 0], [T0.drawing[0] + 0.5, 1], [T0.drawing[1] - 0.4, 1], [T0.drawing[1] - 0.1, 0]]);
  layer('draw-road', 'Drawing · road', [R(carX - 20, carY, 360, 3, CHALK, { opacity: 0.5 })], 14);
  layer('draw-car', 'Drawing · the car', [
    P(`M ${carX} ${carY - 44} L ${carX + 150} ${carY - 44} L ${carX + 178} ${carY - 96} L ${carX + 250} ${carY - 96} L ${carX + 272} ${carY - 44} L ${carX + 330} ${carY - 44} L ${carX + 330} ${carY} L ${carX} ${carY} Z`, 'none', CHALK, 4),
    E(carX + 300, carY - 96, 12, 12, '#7fae6a'),
  ], 15);
  layer('draw-wheel-a', 'Drawing · front wheel', [E(0, 0, 22, 22, 'none', { stroke: CHALK, strokeWidth: 4 }), R(-19, -2.5, 38, 5, CHALK)], 16, T(carX + 82, carY));
  layer('draw-wheel-b', 'Drawing · rear wheel', [E(0, 0, 22, 22, 'none', { stroke: CHALK, strokeWidth: 4 }), R(-19, -2.5, 38, 5, CHALK)], 16, T(carX + 252, carY));
  for (const id of ['draw-road', 'draw-car', 'draw-wheel-a', 'draw-wheel-b']) show(id, T0.drawing[0] + 0.3, T0.drawing[1] - 0.1);
  track('draw-wheel-a', 'rotation', [[T0.drawing[0] + 0.5, 0], [T0.drawing[1] - 0.5, Math.PI * 12]]);
  track('draw-wheel-b', 'rotation', [[T0.drawing[0] + 0.5, 0], [T0.drawing[1] - 0.5, Math.PI * 12]]);
  layer('draw-speed', 'Drawing · speed lines', Array.from({ length: 6 }, (_, i) => R(-120 - i * 26, carY - 44 - i * 6, 90 + i * 10, 4, CHALK, { opacity: 0.4 - i * 0.05 })), 14, T(carX + 60, 0));
  show('draw-speed', T0.drawing[0] + 2.2, T0.drawing[1] - 0.1);
  track('draw-speed', 'x', [[T0.drawing[0] + 2.2, 0], [T0.drawing[1] - 0.5, 150]]);

  // ------------------------------------------------ P3 · STORIES ---------
  text('story-title', 'ONCE, IN A FAR CARRIAGE', BOARD_IN.x + BOARD_IN.w / 2, BOARD_IN.y + 78, 36, CHALK, { z: 20, width: 560 });
  show('story-title', T0.stories[0] + 0.15, T0.stories[1] - 0.1);
  fade('story-title', [[T0.stories[0] + 0.15, 0], [T0.stories[0] + 0.5, 1], [T0.stories[1] - 0.4, 1], [T0.stories[1] - 0.1, 0]]);
  ['morning', 'noon', 'amber', 'snow'].forEach((w, i) => {
    const id = `story-w-${i}`;
    text(id, w, BOARD_IN.x + 150 + (i % 2) * 300, BOARD_IN.y + 176 + i * 66, 34, i % 2 ? ROSE : CHALK, { z: 20, width: 300 });
    show(id, T0.stories[0] + 0.6 + i * 0.7, T0.stories[1] - 0.2);
    fade(id, [[T0.stories[0] + 0.6 + i * 0.7, 0], [T0.stories[0] + 0.85 + i * 0.7, 1], [T0.stories[1] - 0.4, 1], [T0.stories[1] - 0.2, 0]]);
  });
  const trainW = WIN_L.w - 12, trainY = WIN_L.y + WIN_L.h - 96;
  const carriage = (cx, col) => [R(cx, trainY - 48, trainW * 0.27, 48, col, { stroke: INK, strokeWidth: 2 }), R(cx + 5, trainY - 41, trainW * 0.27 - 10, 17, '#f6efe0', { opacity: 0.85 }), E(cx + trainW * 0.06, trainY, 7, 7, INK), E(cx + trainW * 0.2, trainY, 7, 7, INK)];
  layer('train', 'Window · the four seasons express', [
    P(`M ${WIN_L.x - 4} ${trainY - 56} L ${WIN_L.x + 30} ${trainY - 56} L ${WIN_L.x + 24} ${trainY - 18} L ${WIN_L.x - 4} ${trainY - 18} Z`, '#3a4a44', INK, 2),
    R(WIN_L.x + 8, trainY - 74, 10, 20, '#3a4a44'), E(WIN_L.x + 13, trainY - 80, 7, 7, '#e8e2d0', { opacity: 0.6 }),
    ...carriage(WIN_L.x + 34, '#8fb47a'), ...carriage(WIN_L.x + 34 + trainW * 0.28, '#d9a45c'), ...carriage(WIN_L.x + 34 + trainW * 0.56, ROSE),
  ], -264);
  show('train', T0.stories[0] + 1.0, T0.stories[1] - 0.1);
  track('train', 'x', [[T0.stories[0] + 1.0, 200], [T0.stories[0] + 2.2, 0], [T0.stories[1] - 1.0, 0], [T0.stories[1] - 0.1, -200]]);
  layer('story-flakes', 'Window · weather', Array.from({ length: 24 }, (_, i) => E(WIN_R.x + 12 + (i * 6.1) % (WIN_R.w - 24), WIN_R.y + ((i * 37) % (WIN_R.h - 20)), 2.4, 2.4, '#ffffff', { opacity: 0.6 })), -264);
  show('story-flakes', T0.stories[0] + 0.6, T0.stories[1] - 0.1);
  track('story-flakes', 'y', [[T0.stories[0] + 0.6, -30], [T0.stories[1] - 0.1, WIN_R.h + 30]], 'linear');

  // ------------------------------------------------ P4 · PLAY ------------
  text('play-title', 'LAST PERIOD', BOARD_IN.x + BOARD_IN.w / 2, BOARD_IN.y + 72, 40, CHALK, { z: 20, width: 520 });
  text('play-title2', 'PAPER AEROPLANES', BOARD_IN.x + BOARD_IN.w / 2, BOARD_IN.y + 128, 30, ROSE, { z: 20, width: 520 });
  for (const id of ['play-title', 'play-title2']) { show(id, T0.play[0] + 0.15, T0.play[1] - 0.1); fade(id, [[T0.play[0] + 0.15, 0], [T0.play[0] + 0.5, 1], [T0.play[1] - 0.4, 1], [T0.play[1] - 0.1, 0]]); }
  const plane = () => [PO([{ x: 0, y: 0 }, { x: 46, y: 16 }, { x: 0, y: 32 }], '#f6efe0', { stroke: INK, strokeWidth: 2 }), PO([{ x: 0, y: 16 }, { x: 30, y: 16 }, { x: 0, y: 32 }], '#d8d2c0')];
  for (let i = 0; i < 5; i++) {
    const id = layer(`plane-${i}`, `Play · plane ${i + 1}`, plane(), 660, T(-80 - i * 60, 300 + i * 90));
    const t0 = T0.play[0] + 0.5 + i * 0.25, t1 = T0.play[1] - 0.1;
    show(id, t0, t1);
    track(id, 'x', [[t0, -80], [t1, W + 120]], 'linear');
    track(id, 'y', [[t0, 300 + i * 90], [(t0 + t1) / 2, 200 + i * 70 - 60], [t1, 360 + i * 80]], 'linear');
    track(id, 'rotation', [[t0, -0.3], [(t0 + t1) / 2, 0.2], [t1, -0.2]], 'linear');
  }

  // ------------------------------------------------ kinetic type ---------
  const popWord = (id, t0, t1, o = {}) => {
    const baseY = project.layers.find(l => l.id === id).local.y;
    const rise = o.rise ?? 40, from = o.from ?? 1.5;
    show(id, t0, t1);
    fade(id, [[t0, 0], [t0 + 0.22, 1], [t1 - 0.16, 1], [t1, 0]]);
    track(id, 'scaleX', [[t0, from], [t0 + 0.34, 1], [t1 - 0.16, 1], [t1, 0.96]]);
    track(id, 'scaleY', [[t0, from], [t0 + 0.34, 1], [t1 - 0.16, 1], [t1, 0.96]]);
    track(id, 'y', [[t0, baseY + rise], [t0 + 0.34, baseY], [t1, baseY]]);
  };

  layer('bell', 'Hook · the bell', [
    P('M 0 -70 Q -46 -66 -46 -18 Q -46 14 -60 22 L 62 22 Q 46 14 46 -18 Q 46 -66 0 -70 Z', '#d9a441', INK, 3),
    P('M -14 22 L 14 22 Q 8 42 0 42 Q -8 42 -14 22 Z', '#b0824a'), E(0, -70, 10, 10, '#b0824a'), R(-2, -92, 4, 22, WOOD_DK),
    ...Array.from({ length: 3 }, (_, i) => { const a = (-0.7 + i * 0.7); return R(Math.sin(a) * 74 - 3, -40 + (1 - Math.cos(a)) * 20, 6, 6, '#f0d9a0', { opacity: 0.8 }); }),
  ], 660, T(200, 300));
  show('bell', 0, T0.hook[1] + 0.1);
  track('bell', 'rotation', [[0, -1.1], [0.12, 0.7], [0.3, -0.5], [0.46, 0.35], [0.62, -0.2], [0.8, 0.1], [1.0, 0]]);
  text('hook-word', 'RING', 700, 300, 96, '#f7f1df', { z: 892, width: 520 });
  popWord('hook-word', 0.06, 0.98, { from: 1.9, rise: 0 });

  const plate = (key, t0, t1, num, label, sub) => {
    text(`plate-${key}-num`, num, BOARD_IN.x + BOARD_IN.w - 120, BOARD_IN.y + 70, 30, '#e9b06a', { z: 21, width: 240 });
    text(`plate-${key}-label`, label, BOARD_IN.x + 190, BOARD_IN.y + 78, 44, CHALK, { z: 21, width: 460 });
    text(`plate-${key}-sub`, sub, BOARD_IN.x + 190, BOARD_IN.y + 124, 20, CHALK_SOFT, { z: 21, width: 460, weight: 600 });
    for (const id of [`plate-${key}-num`, `plate-${key}-label`, `plate-${key}-sub`]) popWord(id, t0, t1, { from: 1.4, rise: 22 });
  };
  plate('numbers', T0.numbers[0] + 0.35, T0.numbers[1] - 0.1, 'PERIOD I', 'NUMBERS', 'gravity, measured in chalk');
  plate('drawing', T0.drawing[0] + 0.35, T0.drawing[1] - 0.1, 'PERIOD II', 'DRAWING', 'a line finds its wheels');
  plate('stories', T0.stories[0] + 0.35, T0.stories[1] - 0.1, 'PERIOD III', 'STORIES', 'the window does the telling');
  plate('play', T0.play[0] + 0.35, T0.play[1] - 0.1, 'PERIOD IV', 'PLAY', 'aerodynamics, of a sort');

  text('home-title', 'THE BELL RINGS AT FOUR', W / 2, 520, 44, CHALK, { z: 893, width: 820 });
  text('home-sub', 'chairs pushed in · lights down', W / 2, 578, 22, '#e9b06a', { z: 893, width: 720, weight: 600 });
  for (const id of ['home-title', 'home-sub']) popWord(id, T0.home[0] + 0.1, T0.close[0]);
  layer('home-plate', 'Home · closing plate', [R(-430, -70, 860, 236, '#1c2a30', { opacity: 0.55 }), R(-430, -70, 860, 4, '#e9b06a'), R(-430, 162, 860, 4, '#e9b06a')], 892, T(W / 2, 548));
  show('home-plate', T0.home[0] + 0.05, T0.close[0]);
  fade('home-plate', [[T0.home[0] + 0.05, 0], [T0.home[0] + 0.4, 1], [T0.close[0] - 0.2, 1], [T0.close[0], 0]]);

  text('close-title', 'CHARACTER STUDIO', W / 2, 500, 54, '#f7f1df', { z: 895, width: 900, tracking: 4 });
  text('close-sub', 'a school day · motion & sound', W / 2, 566, 22, '#e9b06a', { z: 895, width: 720, weight: 600 });
  text('close-mark', '■', W / 2, 640, 30, ROSE, { z: 895, width: 120 });
  for (const id of ['close-title', 'close-sub', 'close-mark']) popWord(id, T0.close[0] + 0.15, duration - 0.01, { from: 1.35, rise: 24 });

  // ------------------------------------------------------ transitions ----
  const wipes = [T0.drawing[0] - 0.15, T0.stories[0] - 0.15, T0.play[0] - 0.15];
  layer('eraser', 'Transitions · board eraser', [
    E(-70, 0, 120, 46, '#3a4a44'), E(-70, -12, 118, 34, '#2a3a34'),
    R(-150, -60, 130, 96, '#e8d9b8', { stroke: INK, strokeWidth: 3 }), R(-150, -60, 130, 24, '#6f8a9a'),
    E(-70, 60, 90, 16, CHALK, { opacity: 0.5 }), E(-20, 74, 60, 12, CHALK, { opacity: 0.35 }),
  ], 680, T(BOARD_F.x - 160, BOARD_F.y + BOARD_F.h / 2));
  {
    const vis = [{ id: 'eraser-vis-0', frame: 0, value: false, easing: 'step' }];
    wipes.forEach((w) => vis.push({ id: `eraser-vis-in-${w}`, frame: F(w - 0.05), value: true, easing: 'step' }, { id: `eraser-vis-out-${w}`, frame: F(w + 0.55), value: false, easing: 'step' }));
    clip.tracks.push({ id: 'eraser-visible', targetId: 'eraser', property: 'visible', keyframes: vis });
  }
  {
    const wipeKeys = [];
    wipes.forEach((w) => { wipeKeys.push([w - 0.05, 0, 'step'], [w - 0.01, -70, 'smooth'], [w + 0.45, 640, 'smooth'], [w + 0.52, -260, 'step']); });
    track('eraser', 'x', wipeKeys);
  }

  const gr = rng(2026), grain = [];
  for (let i = 0; i < 220; i++) grain.push(E(gr() * W, gr() * H, 1.2, 1.2, i % 3 ? '#ffffff' : '#000000', { opacity: 0.05 + gr() * 0.05 }));
  layer('grain', 'Frame · grain', grain, 930);
  track('grain', 'opacity', Array.from({ length: Math.floor(duration * 12) + 1 }, (_, i) => [i / 12, 0.45 + 0.55 * Math.abs(Math.sin(i * 1.7))]), 'linear');

  layer('vignette', 'Frame · vignette', [
    R(-400, -400, W + 800, 120, INK, { opacity: 0.5 }), R(-400, H - 60, W + 800, 460, INK, { opacity: 0.5 }),
    R(-400, -400, 120, H + 800, INK, { opacity: 0.5 }), R(W - 60, -400, 460, H + 800, INK, { opacity: 0.5 }),
  ], 920);

  // ---------------------------------------------------------- camera -----
  clip.tracks.push({ id: 'camera-switch', targetId: '$camera-switch', property: 'camera', keyframes: [{ id: 'camera-switch-0', frame: 0, value: 'class-cam', easing: 'step' }] });
  const zoomKeys = [[0, 1.12], [0.9, 1]];
  for (const c of [T0.drawing[0], T0.stories[0], T0.play[0], T0.home[0], T0.close[0]]) zoomKeys.push([c - 0.08, 1], [c + 0.1, 1.07], [c + 0.6, 1]);
  zoomKeys.push([duration, 1.05]);
  track('class-cam', 'zoom', zoomKeys);
  const drift = [];
  for (let f = 0; f <= endFrame; f += 3) { const t = f / fps; drift.push([t, 6 * Math.sin(t * 0.9 + 0.4) + 2 * Math.sin(t * 3.1), 5 * Math.sin(t * 1.1 + 1.2) + 2 * Math.sin(t * 4.3), 0.25 * Math.sin(t * 0.8)]); }
  track('class-cam', 'cameraX', drift.map(d => [d[0], d[1]]), 'linear');
  track('class-cam', 'cameraY', drift.map(d => [d[0], d[2]]), 'linear');
  track('class-cam', 'roll', drift.map(d => [d[0], d[3]]), 'linear');

  // --------------------------------------------------- clock progress ----
  track('clock-min', 'rotation', Array.from({ length: Math.floor(duration) + 1 }, (_, i) => [i, -Math.PI * 2 * (i / duration) * 2 - 0.9]), 'linear');
  track('clock-hour', 'rotation', Array.from({ length: Math.floor(duration) + 1 }, (_, i) => [i, -Math.PI * 2 * (i / duration) * 2.5 - 1.1]), 'linear');

  // ------------------------------------------------ time-of-day fades ----
  const todAt = (key, a, b) => fade(tintIds[key], [[a - 0.4, 0], [a, TOD[key].alpha], [b, TOD[key].alpha], [b + 0.4, 0]]);
  todAt('dawn', 0.0, T0.numbers[0] + 0.6);
  todAt('morning', T0.numbers[0] + 0.8, T0.drawing[0] + 1.0);
  todAt('noon', T0.drawing[0] + 1.2, T0.stories[0] + 1.4);
  todAt('afternoon', T0.stories[0] + 1.6, T0.play[0] + 1.6);
  todAt('golden', T0.play[0] + 1.8, T0.home[0] + 0.6);
  todAt('dusk', T0.home[0] + 0.8, duration);
  const skyAt = (side, key, a, b) => { for (const id of [skyIds[side][key], skyIds[side][`${key}h`]]) fade(id, [[a - 0.4, 0], [a, 1], [b, 1], [b + 0.4, 0]]); };
  for (const side of ['L', 'R']) {
    skyAt(side, 'dawn', 0.0, T0.numbers[0] + 0.6);
    skyAt(side, 'morning', T0.numbers[0] + 0.8, T0.drawing[0] + 1.0);
    skyAt(side, 'noon', T0.drawing[0] + 1.2, T0.stories[0] + 1.4);
    skyAt(side, 'dusk', T0.stories[0] + 1.6, duration);
  }
  show('sun', 0, T0.stories[0] + 1.6);
  track('sun', 'x', [[0, 0], [T0.stories[0] + 1.6, 40]]);
  track('sun', 'y', [[0, 0], [T0.drawing[0], -150], [T0.stories[0] + 1.6, -330]]);
  show('moon', T0.home[0] + 0.7, duration);
  track('moon', 'y', [[T0.home[0] + 0.7, 80], [duration, -40]]);

  // ---------------------------------------------------- teacher life ----
  track('teacher', 'x', [[0, TEACH.x], [duration / 2, TEACH.x + 5], [duration, TEACH.x]]);
  track('teacher', 'rotation', [[0, 0], [duration / 2, 0.012], [duration, 0]]);
  track('teacher', 'y', Array.from({ length: Math.floor(duration) + 1 }, (_, i) => [i, TEACH.feet + Math.sin(i * 1.6) * 2.4]), 'linear');
  track('teacher-hand', 'y', Array.from({ length: Math.floor(duration * 2) + 1 }, (_, i) => { const t = i / 2; return [t, TEACH.feet - 176 + Math.sin(t * 2.4) * 6 + (t < 15 ? -6 : 0)]; }), 'linear');
  track('teacher-hand', 'rotation', [[0, 0], [7, 0.05], [15, -0.04], [22, 0.03], [duration, 0]]);

  // ------------------------------------------------------ finalise ------
  clip.setupPose = Object.fromEntries([
    ...project.bones.map(item => [item.id, { local: { x: item.local.x, y: item.local.y, rotation: item.local.rotation, scaleX: 1, scaleY: 1 } }]),
    ...project.layers.map(item => [item.id, { local: structuredClone(item.local), opacity: item.opacity, visible: item.visible }]),
  ]);

  // ---- machine gate: no NaN, keys in range, strictly increasing ----
  const ids = new Set([...project.bones, ...project.layers, ...project.cameras].map(i => i.id));
  for (const tr of clip.tracks) {
    if (tr.targetId !== '$camera-switch' && !ids.has(tr.targetId)) throw new Error(`Track target missing: ${tr.targetId}`);
    let prev = -Infinity;
    for (const k of tr.keyframes) {
      if (!Number.isFinite(k.frame) || k.frame < 0 || k.frame > endFrame) throw new Error(`Bad key frame on ${tr.id}: ${JSON.stringify(k)}`);
      if (k.frame <= prev) throw new Error(`Non-increasing keys on ${tr.id}`);
      prev = k.frame;
      if (typeof k.value === 'number' && !Number.isFinite(k.value)) throw new Error(`Non-finite value on ${tr.id}`);
    }
    if (!tr.keyframes.length) throw new Error(`Empty track ${tr.id}`);
  }
  for (const l of project.layers) {
    if (![l.local.x, l.local.y, l.local.rotation].every(Number.isFinite)) throw new Error(`Bad layer local: ${l.id}`);
    for (const s of l.shapes ?? []) {
      if (s.kind === 'rect' && ![s.x, s.y, s.width, s.height].every(Number.isFinite)) throw new Error(`Bad rect in ${l.id}`);
      if (s.kind === 'ellipse' && ![s.x, s.y, s.radiusX, s.radiusY].every(Number.isFinite)) throw new Error(`Bad ellipse in ${l.id}`);
    }
  }
  return project;
}
