// "Four Seasons · Carriage No. 4" — Grand Budapest style vector short.
// Scene authoring produces ordinary Character Studio project data and keys.
// Playback, hierarchy, drawing and export remain owned by the existing engine.

// ---------------------------------------------------------------- maths ----
const T = (x = 0, y = 0, rotation = 0, scale = 1) => ({ x, y, rotation, scaleX: scale, scaleY: scale });
const mix = (a, b, t) => a + (b - a) * t;
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const rotate = (x, y, angle) => ({ x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) });
/** Inverse rotation: turn a world-space offset into a bone's local space. */
const unrotate = (x, y, angle) => rotate(x, y, -angle);
const xml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
/** Deterministic LCG so every run of the tool produces identical scenery. */
const rng = seed => { let s = (seed >>> 0) || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };

// -------------------------------------------------------------- palette ----
// Wes Anderson / Grand Budapest: chalky pastels separated by a plum ink line.
const INK = '#33253a';
const GOLD = '#d9a441';
const SEASONS = [
  {
    id: 'spring', numeral: 'I', label: 'SPRING', line: 'the blossom line',
    sky: '#d7e7e3', skyLow: '#e8f1ea', cloud: '#f5f2e6',
    ridge: '#aec8b6', ridgeLow: '#95b79c', hill: '#c0d4b6',
    canopy: '#9ec7a8', canopyAlt: '#b6d4b5', trunk: '#8a6851',
    house: ['#e9cfc9', '#d8b6b0', '#c6dcc8', '#efdfc0'], roof: '#a95b54',
    hedge: '#8fb489', grass: '#a6c79a',
    particle: 'petal', particleColor: ['#f7d5da', '#fbe3e6', '#f0c3cd'],
    window: '#e9f2ec',
  },
  {
    id: 'summer', numeral: 'II', label: 'SUMMER', line: 'the high-sun run',
    sky: '#bedbe7', skyLow: '#e0eef0', cloud: '#fbf7e8',
    ridge: '#8fb79a', ridgeLow: '#78a486', hill: '#84b189',
    canopy: '#5fa173', canopyAlt: '#7cba85', trunk: '#6e5340',
    house: ['#ecdab6', '#dae3c3', '#f0cab5', '#d7c8df'], roof: '#b2603f',
    hedge: '#5e9a6c', grass: '#7cb073',
    particle: 'mote', particleColor: ['#fbf1c9', '#f6e3a6', '#fffdf0'],
    window: '#e2eff0',
  },
  {
    id: 'autumn', numeral: 'III', label: 'AUTUMN', line: 'the amber line',
    sky: '#efdcc0', skyLow: '#f7e9d2', cloud: '#fbf0dd',
    ridge: '#c89a6e', ridgeLow: '#b5875d', hill: '#d9a867',
    canopy: '#d08a45', canopyAlt: '#c2702f', trunk: '#6b4b33',
    house: ['#e8c89d', '#daaf87', '#e4cca9', '#caaa8b'], roof: '#8e4b3c',
    hedge: '#b57b3c', grass: '#c08a46',
    particle: 'leaf', particleColor: ['#e0a150', '#c4702f', '#d9b45c'],
    window: '#f3e6cf',
  },
  {
    id: 'winter', numeral: 'IV', label: 'WINTER', line: 'the white line',
    sky: '#d5dfea', skyLow: '#e9eff5', cloud: '#f7fafc',
    ridge: '#c6d2de', ridgeLow: '#b3c2d1', hill: '#dce5ed',
    canopy: '#aec0cf', canopyAlt: '#c5d2dc', trunk: '#5e4a3e',
    house: ['#eee7db', '#dfe5eb', '#e9e0d3', '#d7dfe8'], roof: '#7e5b55',
    hedge: '#a8b8c6', grass: '#eef3f7',
    particle: 'flake', particleColor: ['#ffffff', '#f3f8fc', '#e6eef6'],
    window: '#e8eff6',
  },
];

// ------------------------------------------------------------- geometry ----
const W = 1280, H = 720, CX = 640;
const WIN = { x: 370, y: 118, width: 540, height: 380 };
const HORIZON = 438;                             // where the near ground begins
const TABLE_Y = 596;
const CUP_X = CX, CUP_Y = TABLE_Y - 4;          // where the cup base rests
const HAND_X = 696, HAND_Y = 552;                // the fist that holds the handle

// ---------------------------------------------------------------- scene ----
export function createFourSeasonsTrainScene({ name = 'Four Seasons · Carriage No. 4', fps = 24, duration = 24 } = {}) {
  if (!Number.isInteger(fps) || fps < 12 || fps > 60) throw new Error('fps must be an integer from 12 to 60');
  if (!Number.isFinite(duration) || duration < 8 || duration > 120) throw new Error('duration must be between 8 and 120 seconds');
  const endFrame = Math.round(duration * fps);
  const frame = t => Math.round(t * fps);

  const project = {
    schemaVersion: 1,
    id: 'four-seasons-train',
    name,
    canvas: { width: W, height: H, background: '#241a29' },
    bones: [], layers: [], bindings: [], animations: [], groups: [],
    cameras: [{
      id: 'carriage-camera',
      name: 'Carriage master · dead centre',
      hotkey: 1,
      settings: { enabled: true, cameraX: 0, cameraY: 0, zoom: 1, perspective: 0, yaw: 0, pitch: 0, roll: 0, projection: 'orthographic' },
      follow: null,
    }],
    cameraView: 'switch',
    stage2d: { enabled: false, cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0, projection: 'perspective' },
    cameraProduction: {
      stageMode: false, liveControl: { enabled: false, source: 'pointer', sensitivity: 1, smoothing: 0.8 },
      shake: { enabled: false, amplitude: 0, frequency: 12, rotation: 0, seed: 1 },
      bookmarks: [], cameraRigs: [], defaultTransitionPresetId: 'cut',
    },
    smartActions: [], smartActionFolders: [], actionLibrary: [], controllers: [], controllerInstances: [],
    characterViews: [], facialProfiles: [], headCreators: [], constraints: [], lipSyncTracks: [],
    dynamics: { enabled: false, startFrame: 0, endFrame: endFrame, fps, substeps: 4, gravityX: 0, gravityY: 0, windX: 0, windY: 0, windNoise: 0, seed: 1, bones: [], bodies: [], meshes: [], emitters: [] },
    timeline: { currentFrame: 0, currentTime: 0, isPlaying: false, loop: false, fps, startFrame: 0, endFrame: endFrame, activeAnimationId: null },
    metadata: { createdBy: 'character-studio-mcp', story: 'four_seasons_train', style: 'grand-budapest-pastel', durationSeconds: String(duration) },
  };
  const clip = { id: 'four-seasons-clip', name: 'Four chapters of weather', fps, startFrame: 0, endFrame: endFrame, loopMode: 'once', tracks: [] };
  project.animations = [clip];
  project.timeline.activeAnimationId = clip.id;

  // ------------------------------------------------------------ tracks ----
  /** Generic keyed channel. A frame-0 hold is inserted so no track depends on setupPose. */
  const track = (targetId, property, values, easing = 'linear') => {
    const id = `${targetId}-${property}`;
    const keys = values.map(([t, value, mode], index) => ({ id: `${id}-${index}`, frame: frame(t), value, easing: mode ?? easing }));
    if (keys.length && keys[0].frame > 0) keys.unshift({ id: `${id}-hold`, frame: 0, value: keys[0].value, easing: keys[0].easing });
    clip.tracks.push({ id, targetId, property, keyframes: keys });
    return id;
  };
  /** Step visibility window that is genuinely hidden before `from` and after `to`. */
  const show = (targetId, from, to) => {
    const id = `${targetId}-visible`;
    const keys = [{ id: `${id}-0`, frame: 0, value: from <= 0, easing: 'step' }];
    if (from > 0) keys.push({ id: `${id}-in`, frame: frame(from), value: true, easing: 'step' });
    if (to < duration) keys.push({ id: `${id}-out`, frame: frame(to), value: false, easing: 'step' });
    clip.tracks.push({ id, targetId, property: 'visible', keyframes: keys });
    return id;
  };

  // ------------------------------------------------------------ shapes ----
  let n = 0;
  const R = (x, y, width, height, fill, extra = {}) => ({ id: `fs-shape-${++n}`, kind: 'rect', x, y, width, height, fill, ...extra });
  const E = (x, y, radiusX, radiusY, fill, extra = {}) => ({ id: `fs-shape-${++n}`, kind: 'ellipse', x, y, radiusX, radiusY, fill, ...extra });
  const P = (d, fill, stroke = 'none', strokeWidth = 2, extra = {}) => ({ id: `fs-shape-${++n}`, kind: 'path', d, fill, stroke, strokeWidth, ...extra });
  const PO = (points, fill, extra = {}) => ({ id: `fs-shape-${++n}`, kind: 'polygon', points, fill, stroke: 'none', strokeWidth: 1, ...extra });

  const layer = (id, name, shapes, zIndex, local = T(), boneId = null) => {
    project.layers.push({ id, name, type: 'vector', local, shapes, zIndex, visible: true, opacity: 1, locked: false, boundBoneId: boneId });
    if (boneId) project.bindings.push({ id: `binding-${id}`, layerId: id, imageId: id, boneId, bindOffset: T() });
    return id;
  };
  /** Type as a centred SVG plate; the engine draws image layers about their pivot. */
  const text = (id, words, x, y, size, color, options = {}) => {
    const { width = 720, weight = 700, tracking = size * 0.18, family = "Georgia, 'Times New Roman', serif", height = Math.round(size * 2.2) } = options;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
      + `<text x="${width / 2}" y="${height * 0.66}" text-anchor="middle" font-family="${family}" font-size="${size}" font-weight="${weight}" letter-spacing="${tracking.toFixed(2)}" fill="${color}">${xml(words)}</text></svg>`;
    project.layers.push({
      id, name: words, type: 'image',
      src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      width, height, color, local: T(x, y), zIndex: options.z ?? 900,
      visible: true, opacity: 1, locked: false, boundBoneId: null,
    });
    return id;
  };

  // --------------------------------------------------- outside scenery ----
  // Each depth band is authored wider than the window and then slides left, so
  // every frame of the film finds the glass filled with passing country.
  const SPEED = { far: 42, mid: 112, near: 236 };
  const band = speed => ({ from: WIN.x - 140, to: WIN.x + WIN.width + speed * duration + 160 });

  const ridge = (x0, x1, baseY, topY, amp, seed, fill) => {
    const rand = rng(seed), points = [{ x: x0, y: baseY }];
    for (let x = x0; x <= x1; x += 96) points.push({ x, y: topY + Math.sin(x * 0.0052 + seed) * amp + (rand() - 0.5) * amp });
    points.push({ x: x1, y: baseY });
    return PO(points, fill);
  };
  const tree = (x, y, scale, p, seed) => {
    const rand = rng(seed), tint = rand() > 0.5 ? p.canopy : p.canopyAlt;
    const shapes = [
      R(x - 6 * scale, y - 74 * scale, 12 * scale, 76 * scale, p.trunk),
      E(x, y - 118 * scale, 46 * scale, 42 * scale, tint),
      E(x - 32 * scale, y - 96 * scale, 32 * scale, 29 * scale, p.canopyAlt),
      E(x + 31 * scale, y - 100 * scale, 33 * scale, 30 * scale, tint),
    ];
    if (p.id === 'winter') shapes.push(E(x, y - 150 * scale, 24 * scale, 12 * scale, '#ffffff'));
    if (p.id === 'spring') shapes.push(E(x + 15 * scale, y - 128 * scale, 15 * scale, 13 * scale, '#f4c3cc'), E(x - 25 * scale, y - 104 * scale, 12 * scale, 11 * scale, '#f9d9de'));
    return shapes;
  };
  const house = (x, y, scale, p, seed) => {
    const rand = rng(seed), body = p.house[Math.floor(rand() * p.house.length)];
    const w = 96 * scale, h = 74 * scale;
    const shapes = [
      R(x - w / 2, y - h, w, h, body, { stroke: INK, strokeWidth: 1.6 }),
      PO([{ x: x - w / 2 - 9 * scale, y: y - h }, { x: x + w / 2 + 9 * scale, y: y - h }, { x, y: y - h - 34 * scale }], p.roof),
      R(x - 9 * scale, y - 40 * scale, 18 * scale, 40 * scale, p.roof),
    ];
    for (const side of [-1, 1]) shapes.push(R(x + side * 30 * scale - 12 * scale, y - 60 * scale, 24 * scale, 24 * scale, p.id === 'winter' ? '#f6dfa2' : p.window, { stroke: INK, strokeWidth: 1.2 }));
    if (p.id === 'winter') shapes.push(R(x - w / 2 - 9 * scale, y - h - 3 * scale, w + 18 * scale, 6 * scale, '#ffffff'));
    if (p.id === 'autumn') shapes.push(E(x + 6 * scale, y - h - 8 * scale, 12 * scale, 9 * scale, '#b5793a'));
    return shapes;
  };
  const midModules = (p, seed) => {
    const rand = rng(seed), { from, to } = band(SPEED.mid), shapes = [];
    let x = from;
    while (x < to) {
      const roll = rand();
      if (roll < 0.46) shapes.push(...tree(x, HORIZON + (rand() - 0.5) * 10, 0.74 + rand() * 0.42, p, Math.floor(x)));
      else if (roll < 0.74) shapes.push(...house(x, HORIZON + 4 + (rand() - 0.5) * 8, 0.72 + rand() * 0.4, p, Math.floor(x)));
      else shapes.push(...tree(x, HORIZON - 8, 0.5 + rand() * 0.22, p, Math.floor(x) + 7));
      x += 96 + rand() * 92;
    }
    return shapes;
  };
  const nearModules = (p, seed) => {
    const rand = rng(seed), { from, to } = band(SPEED.near), shapes = [];
    let x = from;
    while (x < to) {
      const roll = rand();
      if (roll < 0.3) {
        // Telegraph pole and crossarm — the metronome of a moving train.
        shapes.push(R(x - 5, 236, 10, 340, '#6b5340'), R(x - 46, 274, 92, 9, '#6b5340'),
          R(x - 34, 262, 8, 12, '#8d7a63'), R(x + 26, 262, 8, 12, '#8d7a63'), R(x - 1, 256, 2, 18, '#6b5340'));
      } else if (roll < 0.56) {
        shapes.push(R(x - 4, HORIZON - 4, 8, 84, '#7c6146'), R(x - 4, HORIZON + 14, 96, 8, '#8a6d50'), R(x - 4, HORIZON + 42, 96, 8, '#8a6d50'));
      } else if (roll < 0.78) {
        const w = 150 + rand() * 110;
        shapes.push(R(x, HORIZON + 12, w, 66, p.hedge));
        for (let k = 0; k <= 6; k++) shapes.push(E(x + (w * k) / 6, HORIZON + 14, w / 12 + 6, 28, p.hedge));
        if (p.id === 'winter') shapes.push(R(x - 6, HORIZON + 4, w + 12, 12, '#ffffff'));
      } else {
        shapes.push(...tree(x, HORIZON + 62, 1.15 + rand() * 0.4, p, Math.floor(x) + 31));
      }
      x += 110 + rand() * 124;
    }
    return shapes;
  };
  const weather = (p, seed, count) => {
    const rand = rng(seed), shapes = [];
    for (let i = 0; i < count; i++) {
      const x = 340 + rand() * 1220, y = -620 + rand() * 1240;
      const color = p.particleColor[i % p.particleColor.length];
      const size = 2.6 + rand() * 3.4;
      if (p.particle === 'leaf') shapes.push(E(x, y, size * 1.5, size * 0.85, color, { opacity: 0.62 + rand() * 0.38 }));
      else shapes.push(E(x, y, size, size, color, { opacity: p.particle === 'mote' ? 0.32 + rand() * 0.5 : 0.55 + rand() * 0.45 }));
    }
    return shapes;
  };

  // Spring already runs behind the opening title; each later chapter cuts in.
  // The final chapter's scenery outlives its card so the closing title still has
  // moving country behind it instead of an empty window.
  const chapters = SEASONS.map((season, index) => ({
    ...season,
    from: index === 0 ? 0 : 2.4 + index * 5,
    to: 2.4 + (index + 1) * 5,
    sceneryTo: index === SEASONS.length - 1 ? duration : 2.4 + (index + 1) * 5,
  }));
  const TITLE = [0.12, 2.3], CLOSING = [22.55, 23.94];

  chapters.forEach((season, index) => {
    const seed = 9100 + index * 733;
    const sky = layer(`outside-sky-${season.id}`, `${season.label} · sky`, [
      R(-400, 0, 7000, WIN.height + 40, season.sky),
      R(-400, WIN.y + WIN.height - 130, 7000, 130, season.skyLow),
    ], -330);
    const cloudRand = rng(seed + 11), cloudShapes = [];
    for (let i = 0; i < 16; i++) cloudShapes.push(E(cloudRand() * 6400, 40 + cloudRand() * 110, 52 + cloudRand() * 44, 15 + cloudRand() * 10, season.cloud, { opacity: 0.5 + cloudRand() * 0.4 }));
    const clouds = layer(`outside-clouds-${season.id}`, `${season.label} · clouds`, cloudShapes, -325);
    const far = layer(`outside-far-${season.id}`, `${season.label} · far ridge`, [
      ridge(-300, 6200, HORIZON - 66, HORIZON - 132, 22, seed + 3, season.ridge),
      ridge(-300, 6200, HORIZON - 54, HORIZON - 98, 15, seed + 9, season.ridgeLow),
    ], -320);
    const mid = layer(`outside-mid-${season.id}`, `${season.label} · village`, midModules(season, seed + 17), -315);
    const ground = [R(-400, HORIZON, 7000, WIN.height, season.hill), R(-400, HORIZON + 28, 7000, WIN.height, season.grass)];
    const near = layer(`outside-near-${season.id}`, `${season.label} · trackside`, [...ground, ...nearModules(season, seed + 41)], -310);
    // Weather enters above the glass and leaves below it, so it never restarts.
    const falls = layer(`outside-weather-${season.id}`, `${season.label} · falling weather`, weather(season, seed + 59, 52), -305);

    for (const id of [sky, clouds, far, mid, near, falls]) show(id, season.from, season.sceneryTo);
    track(sky, 'x', [[0, 0], [duration, -SPEED.far * 0.25]]);
    track(clouds, 'x', [[0, 0], [duration, -SPEED.far * duration]]);
    track(far, 'x', [[0, 0], [duration, -SPEED.far * duration]]);
    track(mid, 'x', [[0, 0], [duration, -SPEED.mid * duration]]);
    track(near, 'x', [[0, 0], [duration, -SPEED.near * duration]]);
    track(falls, 'y', [[0, 0], [duration, 760]]);
    track(falls, 'x', [[0, 0], [duration, -540]]);
  });

  // -------------------------------------------------------- the window ----
  layer('window-glass', 'Window · glass tint and reflection', [
    R(WIN.x, WIN.y, WIN.width, WIN.height, SEASONS[0].window, { opacity: 0.1 }),
    PO([{ x: WIN.x + 40, y: WIN.y }, { x: WIN.x + 190, y: WIN.y }, { x: WIN.x + 96, y: WIN.y + WIN.height }, { x: WIN.x + 8, y: WIN.y + WIN.height }], '#ffffff', { opacity: 0.09 }),
    PO([{ x: WIN.x + 232, y: WIN.y }, { x: WIN.x + 292, y: WIN.y }, { x: WIN.x + 208, y: WIN.y + WIN.height }, { x: WIN.x + 168, y: WIN.y + WIN.height }], '#ffffff', { opacity: 0.07 }),
  ], -300);

  layer('window-frame', 'Window · carriage frame', [
    R(WIN.x - 26, WIN.y - 26, WIN.width + 52, 22, '#7c2d3e'),
    R(WIN.x - 26, WIN.y + WIN.height + 4, WIN.width + 52, 22, '#7c2d3e'),
    R(WIN.x - 26, WIN.y - 26, 22, WIN.height + 52, '#7c2d3e'),
    R(WIN.x + WIN.width + 4, WIN.y - 26, 22, WIN.height + 52, '#7c2d3e'),
    R(WIN.x, WIN.y, WIN.width, WIN.height, 'none', { stroke: INK, strokeWidth: 3 }),
    R(WIN.x + 6, WIN.y + 6, WIN.width - 12, WIN.height - 12, 'none', { stroke: GOLD, strokeWidth: 2 }),
    R(CX - 5, WIN.y, 10, WIN.height, '#7c2d3e', { stroke: INK, strokeWidth: 1.4 }),
    R(WIN.x, WIN.y + WIN.height / 2 - 5, WIN.width, 10, '#7c2d3e', { stroke: INK, strokeWidth: 1.4 }),
    R(WIN.x - 40, WIN.y + WIN.height + 26, WIN.width + 80, 20, '#8a6a45', { stroke: INK, strokeWidth: 1.6 }),
    R(WIN.x - 40, WIN.y + WIN.height + 46, WIN.width + 80, 6, GOLD),
  ], -290);

  layer('window-sill-flower', 'Window · sill posy', [
    R(620, 512, 40, 22, '#cfe0c6', { stroke: INK, strokeWidth: 1.6 }),
    P('M 640 512 L 640 462', 'none', '#6d8a63', 5),
    E(640, 452, 16, 14, '#e7b7bf'), E(640, 452, 6, 6, GOLD),
    E(620, 470, 12, 7, '#8fae82'), E(660, 468, 12, 7, '#8fae82'),
  ], -285);

  // ------------------------------------------------ carriage interior ----
  const wallTop = WIN.y - 26, wallBottom = WIN.y + WIN.height + 52;
  layer('carriage-wall', 'Carriage · panelled shell', [
    R(0, 0, W, wallTop, '#ecdfc9'),
    R(0, wallBottom, W, H - wallBottom, '#e2d2ba'),
    R(0, wallTop, WIN.x - 26, wallBottom - wallTop, '#ecdfc9'),
    R(WIN.x + WIN.width + 26, wallTop, W - (WIN.x + WIN.width + 26), wallBottom - wallTop, '#ecdfc9'),
  ], -280);

  const panelShapes = [R(0, 0, W, 8, INK), R(0, wallTop - 12, W, 8, INK)];
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 44 : WIN.x + WIN.width + 62;
    for (let i = 0; i < 2; i++) {
      const x = x0 + i * 152;
      panelShapes.push(R(x, 150, 132, 168, '#e4d3ba', { stroke: INK, strokeWidth: 1.6 }));
      panelShapes.push(R(x + 10, 160, 112, 148, '#eddfc9', { stroke: GOLD, strokeWidth: 1.4 }));
      panelShapes.push(E(x + 66, 172, 11, 11, GOLD));
    }
  }
  layer('carriage-panels', 'Carriage · wall panels and cornice', panelShapes, -270);

  const sconce = cx => [
    R(cx - 5, 214, 10, 46, GOLD), E(cx, 208, 22, 9, GOLD),
    P(`M ${cx - 26} 206 L ${cx - 20} 156 L ${cx + 20} 156 L ${cx + 26} 206 Z`, '#f6e7b4', INK, 2),
    E(cx, 152, 22, 8, GOLD), E(cx, 206, 34, 42, '#ffeeb8', { opacity: 0.16 }),
  ];
  layer('carriage-sconces', 'Carriage · brass sconces', [...sconce(150), ...sconce(W - 150)], -260);
  track('carriage-sconces', 'opacity', Array.from({ length: Math.floor(duration * 2) + 1 }, (_, i) => {
    const t = i / 2;
    return [t, 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(t * 5.1) * Math.sin(t * 2.3))];
  }));

  layer('carriage-ceiling', 'Carriage · ceiling', [
    R(0, 0, W, 54, '#dcc9ad'), R(0, 40, W, 14, INK),
    R(CX - 5, 0, 10, 40, GOLD), E(CX, 44, 46, 12, GOLD), E(CX, 40, 30, 9, '#f6e7b4'),
  ], -265);

  layer('carriage-bench', 'Carriage · bench seat', [
    R(0, 500, W, 20, INK), R(0, 520, W, 44, '#7c2d3e', { stroke: INK, strokeWidth: 2 }),
    ...Array.from({ length: 15 }, (_, i) => R(30 + i * 88, 528, 6, 28, '#5e2030')),
    R(0, 564, W, 12, '#5e2030'),
  ], -250);

  // -------------------------------------------------------------- table ----
  layer('carriage-table', 'Table · cloth and edge', [
    R(0, TABLE_Y + 26, W, H - TABLE_Y - 26, '#a3774a'),
    R(0, TABLE_Y + 26, W, 8, INK),
    R(0, TABLE_Y + 34, W, 5, '#8f683f'),
    ...[300, 980].map(x => R(x - 6, TABLE_Y + 38, 12, 96, '#8f683f')),
    E(CX, TABLE_Y - 10, 470, 30, '#b08250'),
    E(CX, TABLE_Y - 14, 470, 30, '#c69761'),
    E(CX, TABLE_Y - 18, 444, 24, '#d8bb8c'),
    R(CX - 232, TABLE_Y - 26, 464, 26, '#efe2c6'),
    R(CX - 232, TABLE_Y - 23, 464, 2, '#d6c4a0'),
    R(CX - 232, TABLE_Y - 4, 464, 3, GOLD),
  ], 100);

  // The saucer stays on the table; only the cup travels with the hand.
  layer('coffee-saucer', 'Coffee · saucer on the table', [
    E(CUP_X, TABLE_Y - 6, 92, 24, INK, { opacity: 0.16 }),
    E(CUP_X, TABLE_Y - 10, 84, 22, '#f7f0e2', { stroke: INK, strokeWidth: 1.8 }),
    E(CUP_X, TABLE_Y - 10, 72, 17, 'none', { stroke: GOLD, strokeWidth: 1.6 }),
  ], 110);

  // ------------------------------------------------------- POV arm rig ----
  // Bones are authored from world joint positions; bind offsets are derived by
  // inverting the rest pose so artwork stands upright until the bone moves.
  project.bones.push({ id: 'pov-root', name: 'Traveller · seat', length: 0, parentId: null, local: T(0, 0, 0), worldX: 0, worldY: 0, worldRotation: 0 });
  const joint = (id, name, parentId, x, y, targetX, targetY) => {
    const parent = project.bones.find(item => item.id === parentId);
    const length = Math.hypot(targetX - x, targetY - y);
    const rotation = Math.atan2(targetY - y, targetX - x);
    if (!Number.isFinite(length) || length < 1) throw new Error(`Bone ${id} collapsed: joint (${x}, ${y}) coincides with its target`);
    const parentX = parent ? parent.worldX : 0, parentY = parent ? parent.worldY : 0;
    const parentRotation = parent ? parent.worldRotation : 0;
    const offset = parent ? unrotate(x - parentX, y - parentY, parentRotation) : { x, y };
    project.bones.push({
      id, name, parentId, length,
      local: T(offset.x, offset.y, rotation - parentRotation),
      worldX: x, worldY: y, worldRotation: rotation,
    });
    return id;
  };
  joint('pov-left-upper', 'Traveller · left upper arm', 'pov-root', 148, 812, 312, 700);
  joint('pov-left-fore', 'Traveller · left forearm', 'pov-left-upper', 312, 700, 478, 618);
  joint('pov-right-upper', 'Traveller · right upper arm', 'pov-root', 1186, 812, 900, 668);
  joint('pov-right-fore', 'Traveller · right forearm', 'pov-right-upper', 900, 668, HAND_X, HAND_Y);

  /** Bind with no offset: art is authored in bone space, where +X runs along the bone. */
  const bindAlong = layerId => { project.bindings.find(item => item.layerId === layerId).bindOffset = T(); };
  /** Bind upright at the bone's far tip — a hand, not a sleeve. */
  const bindAtTip = layerId => {
    const boneId = project.bindings.find(item => item.layerId === layerId).boneId;
    const bone = project.bones.find(item => item.id === boneId);
    project.bindings.find(item => item.layerId === layerId).bindOffset = T(bone.length, 0, -bone.worldRotation);
  };
  /** Bind upright so the layer origin lands on an exact world point at rest. */
  const bindAtWorld = (layerId, worldX, worldY) => {
    const boneId = project.bindings.find(item => item.layerId === layerId).boneId;
    const bone = project.bones.find(item => item.id === boneId);
    const offset = unrotate(worldX - bone.worldX, worldY - bone.worldY, bone.worldRotation);
    project.bindings.find(item => item.layerId === layerId).bindOffset = T(offset.x, offset.y, -bone.worldRotation);
  };

  // Sleeves are drawn along the bone itself (+X), so they follow the limb exactly.
  const sleeve = (id, name, boneId, width, inset, zIndex, cuff) => {
    const bone = project.bones.find(item => item.id === boneId);
    const length = bone.length - inset;
    layer(id, name, [
      R(0, -width / 2, length, width, cuff ? '#5c4159' : '#4a3346', { stroke: INK, strokeWidth: 2 }),
      R(0, -width / 2, 14, width, cuff ? '#6b4c66' : '#5c4159'),
      ...(cuff ? [R(length - 16, -width / 2 - 2, 16, width + 4, '#f0e6d2', { stroke: INK, strokeWidth: 1.4 })] : []),
    ], zIndex, T(), boneId);
    bindAlong(id);
  };
  sleeve('traveller-left-upper-sleeve', 'Traveller · left upper sleeve', 'pov-left-upper', 66, 10, 198, false);
  sleeve('traveller-right-upper-sleeve', 'Traveller · right upper sleeve', 'pov-right-upper', 68, 10, 198, false);
  sleeve('traveller-left-fore-sleeve', 'Traveller · left forearm sleeve', 'pov-left-fore', 58, 30, 206, true);
  sleeve('traveller-right-fore-sleeve', 'Traveller · right forearm sleeve', 'pov-right-fore', 56, 30, 206, true);

  layer('traveller-left-hand', 'Traveller · left hand', [
    E(0, 0, 34, 22, '#e6c6a4', { stroke: INK, strokeWidth: 1.8 }),
    R(-48, -15, 62, 9, '#dcbb98'), R(-42, -3, 56, 9, '#dcbb98'), R(-34, 9, 48, 9, '#dcbb98'),
  ], 210, T(), 'pov-left-fore');
  bindAtTip('traveller-left-hand');

  layer('traveller-right-hand', 'Traveller · right hand', [
    E(0, 0, 33, 22, '#e6c6a4', { stroke: INK, strokeWidth: 1.8 }),
    R(-16, -17, 10, 42, '#dcbb98'), R(-3, -17, 10, 42, '#dcbb98'),
  ], 212, T(), 'pov-right-fore');
  bindAtTip('traveller-right-hand');

  // The cup hangs from the right fist: art is authored about the cup's base and
  // the bind offset carries that base to dead centre when the arm is at rest.
  layer('coffee-cup', 'Coffee · cup in hand', [
    P('M -32 -58 L 32 -58 L 26 0 Q 0 8 -26 0 Z', '#f7f0e2', INK, 2),
    P('M -30 -40 L 30 -40 L 28 -22 L -28 -22 Z', '#7c2d3e'),
    P('M 30 -48 C 58 -52 56 -18 30 -24', 'none', '#f7f0e2', 9),
    E(0, -58, 33, 9, '#f7f0e2', { stroke: INK, strokeWidth: 2 }),
    E(0, -58, 31, 8, '#6b4526'),
    E(0, -58, 24, 5, '#b8834f'),
    E(0, -58, 12, 3, '#e0c48c'),
  ], 220, T(), 'pov-right-fore');
  bindAtWorld('coffee-cup', CUP_X, CUP_Y);

  layer('coffee-steam', 'Coffee · steam', [
    P('M -12 -74 Q -28 -100 -6 -126', 'none', '#ffffff', 4),
    P('M 6 -76 Q 22 -106 0 -134', 'none', '#ffffff', 4),
    P('M 22 -72 Q 34 -94 16 -112', 'none', '#ffffff', 3),
  ], 224, T(), 'pov-right-fore');
  bindAtWorld('coffee-steam', CUP_X, CUP_Y);
  track('coffee-steam', 'opacity', Array.from({ length: Math.floor(duration * 3) + 1 }, (_, i) => {
    const t = i / 3;
    return [t, 0.5 + 0.26 * Math.sin(t * 6.2) + 0.1 * Math.sin(t * 2.7)];
  }));
  track('coffee-steam', 'y', Array.from({ length: Math.floor(duration * 1.5) + 1 }, (_, i) => [i / 1.5, Math.sin(i / 1.5 * 3.4) * 5]));

  // Winter is the only sip: the forearm lifts, the cup tilts off its saucer,
  // and it settles back on the table before the closing card.
  const sipStart = chapters[3].from + 1.35, sipHold = sipStart + 1.15, sipEnd = sipStart + 2.6;
  const upperRest = project.bones.find(item => item.id === 'pov-right-upper').local.rotation;
  const foreRest = project.bones.find(item => item.id === 'pov-right-fore').local.rotation;
  const sipKeys = [];
  for (let i = 0; i <= 40; i++) {
    const t = sipStart + (sipEnd - sipStart) * (i / 40);
    const lift = smooth((t - sipStart) / 0.85) * (1 - smooth((t - sipHold) / (sipEnd - sipHold)));
    sipKeys.push([t, mix(foreRest, foreRest + 0.38, lift)]);
  }
  track('pov-right-upper', 'rotation', sipKeys.map(([t, v]) => [t, upperRest + (v - foreRest) * 0.18]), 'smooth');
  track('pov-right-fore', 'rotation', sipKeys, 'smooth');

  // -------------------------------------------------------- typography ----
  /** Cartouche art is drawn about its own origin so a scale pop stays centred. */
  const cartouche = (id, width, height, cx, cy) => layer(id, 'Card · cartouche', [
    R(-width / 2 - 16, -height / 2 - 16, width + 32, height + 32, INK, { opacity: 0.28 }),
    R(-width / 2, -height / 2, width, height, '#f4ecd9', { stroke: INK, strokeWidth: 3 }),
    R(-width / 2 + 10, -height / 2 + 10, width - 20, height - 20, 'none', { stroke: GOLD, strokeWidth: 2 }),
    PO([{ x: -width / 2, y: 0 }, { x: -width / 2 + 15, y: 0 }, { x: -width / 2 + 7, y: -7 }, { x: -width / 2, y: -15 }], GOLD),
    PO([{ x: width / 2, y: 0 }, { x: width / 2 - 15, y: 0 }, { x: width / 2 - 7, y: -7 }, { x: width / 2, y: -15 }], GOLD),
    PO([{ x: -width / 2, y: 0 }, { x: -width / 2 + 15, y: 0 }, { x: -width / 2 + 7, y: 7 }, { x: -width / 2, y: 15 }], GOLD),
    PO([{ x: width / 2, y: 0 }, { x: width / 2 - 15, y: 0 }, { x: width / 2 - 7, y: 7 }, { x: width / 2, y: 15 }], GOLD),
  ], 890, T(cx, cy));

  const openingCard = cartouche('card-opening', 800, 190, CX, 300);
  const closingCard = cartouche('card-closing', 760, 150, CX, 300);
  text('title-main', 'FOUR SEASONS', CX, 274, 62, '#7c2d3e', { width: 840, z: 895, tracking: 11 });
  text('title-sub', 'A JOURNEY IN CARRIAGE NO. 4', CX, 346, 19, '#5a4a52', { width: 760, z: 895, weight: 400, tracking: 7 });

  const titleParts = [openingCard, 'title-main', 'title-sub'];
  for (const id of titleParts) show(id, TITLE[0], TITLE[1]);
  for (const id of titleParts) {
    track(id, 'opacity', [[0, 0], [TITLE[0] + 0.12, 1], [TITLE[1] - 0.22, 1], [TITLE[1], 0]], 'smooth');
    track(id, 'scaleX', [[0, 1.07], [TITLE[0] + 0.32, 1], [TITLE[1], 0.97]], 'smooth');
    track(id, 'scaleY', [[0, 1.07], [TITLE[0] + 0.32, 1], [TITLE[1], 0.97]], 'smooth');
  }

  text('closing-main', 'THE TRAIN WENT ON', CX, 288, 44, '#7c2d3e', { width: 820, z: 895, tracking: 9 });
  text('closing-sub', 'FOUR CHAPTERS · ONE WARM CUP', CX, 344, 17, '#5a4a52', { width: 700, z: 895, weight: 400, tracking: 6 });
  const closingParts = [closingCard, 'closing-main', 'closing-sub'];
  for (const id of closingParts) show(id, CLOSING[0], CLOSING[1]);
  for (const id of closingParts) {
    track(id, 'opacity', [[0, 0], [CLOSING[0] + 0.14, 1], [CLOSING[1] - 0.18, 1], [CLOSING[1], 0]], 'smooth');
    track(id, 'scaleX', [[0, 1.05], [CLOSING[0] + 0.34, 1], [CLOSING[1], 1]], 'smooth');
    track(id, 'scaleY', [[0, 1.05], [CLOSING[0] + 0.34, 1], [CLOSING[1], 1]], 'smooth');
  }

  chapters.forEach(season => {
    const cardFrom = Math.max(season.from, 2.4);   // spring waits for the title to clear
    const plate = cartouche(`card-${season.id}`, 430, 78, CX, 117);
    const rule = layer(`plate-rule-${season.id}`, 'Card · chapter rule', [R(-205, 29, 410, 3, GOLD)], 889, T(CX, 117));
    const numeral = text(`numeral-${season.id}`, season.numeral, CX - 152, 118, 34, '#8a6a45', { width: 110, z: 891, tracking: 2 });
    const label = text(`label-${season.id}`, season.label, CX + 22, 116, 32, '#7c2d3e', { width: 320, z: 891, tracking: 8 });
    const line = text(`line-${season.id}`, season.line.toUpperCase(), CX + 22, 148, 12, '#6b5a62', { width: 320, z: 891, weight: 400, tracking: 4 });
    const parts = [plate, rule, numeral, label, line];
    for (const id of parts) {
      show(id, cardFrom + 0.14, season.to - 0.2);
      track(id, 'opacity', [[0, 0], [cardFrom + 0.2, 1], [season.to - 0.26, 1], [season.to - 0.2, 0]], 'smooth');
      track(id, 'scaleX', [[0, 1.18], [cardFrom + 0.34, 1], [season.to - 0.2, 1]], 'smooth');
      track(id, 'scaleY', [[0, 1.18], [cardFrom + 0.34, 1], [season.to - 0.2, 1]], 'smooth');
    }
  });

  // --------------------------------------------------- framing device ----
  layer('film-matte', 'Frame · plum matte and gold rule', [
    R(0, 0, W, 20, INK), R(0, H - 20, W, 20, INK), R(0, 0, 20, H, INK), R(W - 20, 0, 20, H, INK),
    R(30, 30, W - 60, 2, GOLD, { opacity: 0.75 }), R(30, H - 32, W - 60, 2, GOLD, { opacity: 0.75 }),
    R(30, 30, 2, H - 60, GOLD, { opacity: 0.75 }), R(W - 32, 30, 2, H - 60, GOLD, { opacity: 0.75 }),
    ...[[30, 30], [W - 30, 30], [30, H - 30], [W - 30, H - 30]].map(([x, y]) => PO([
      { x, y: y - 12 }, { x: x + 12, y }, { x, y: y + 12 }, { x: x - 12, y },
    ], GOLD)),
  ], 940);

  // --------------------------------------------------------- the camera ----
  // One locked-off master camera: a slow push out of the title, a snap zoom on
  // every chapter cut, and a continuous carriage sway under both.
  clip.tracks.push({ id: 'camera-switch', targetId: '$camera-switch', property: 'camera', keyframes: [{ id: 'camera-switch-0', frame: 0, value: 'carriage-camera', easing: 'step' }] });
  const zoomKeys = [[0, 0.93], [1.08, 1], [chapters[1].from - 0.2, 1]];
  for (const season of chapters.slice(1)) {
    zoomKeys.push([season.from - 0.08, 1], [season.from + 0.1, 1.085], [season.from + 0.62, 1]);
  }
  zoomKeys.push([CLOSING[0], 1], [duration - 0.06, 1], [duration, 0.93]);
  track('carriage-camera', 'zoom', zoomKeys, 'smooth');

  const sway = [];
  for (let f = 0; f <= endFrame; f += 3) {
    const t = f / fps;
    sway.push([
      t,
      -1.6 * Math.sin(t * 2.64) - 0.7 * Math.sin(t * 10.7 + 1.1),
      -1.1 * Math.sin(t * 3.45 + 0.7) - 0.4 * Math.sin(t * 13.2),
      0.22 * Math.sin(t * 2.39 + 0.4),
    ]);
  }
  track('carriage-camera', 'cameraX', sway.map(([t, x]) => [t, x]), 'linear');
  track('carriage-camera', 'cameraY', sway.map(([t, , y]) => [t, y]), 'linear');
  track('carriage-camera', 'roll', sway.map(([t, , , roll]) => [t, roll]), 'linear');

  // setupPose is belt-and-braces: every track above already carries a frame-0 key.
  clip.setupPose = Object.fromEntries([
    ...project.bones.map(item => [item.id, { local: { x: item.local.x, y: item.local.y, rotation: item.local.rotation, scaleX: 1, scaleY: 1 } }]),
    ...project.layers.map(item => [item.id, { local: structuredClone(item.local), opacity: item.opacity, visible: item.visible }]),
  ]);
  // Strip the world-space bookkeeping used while authoring.
  for (const bone of project.bones) { delete bone.worldX; delete bone.worldY; delete bone.worldRotation; }
  return project;
}
