import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { defineMcpPlugin, jsonToolResult, objectArguments } from '../plugin-api.mjs';

const T = (x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) => ({ x, y, rotation, scaleX, scaleY });
const T3D = (px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => ({
  position: { x: px, y: py, z: pz },
  rotation: { x: rx, y: ry, z: rz },
  scale: { x: sx, y: sy, z: sz }
});

let shapeCounter = 0;
const R = (x, y, width, height, fill, extra = {}) => ({
  id: `cp-s-${++shapeCounter}`,
  kind: 'rect',
  x, y, width, height, fill, ...extra
});
const E = (x, y, radiusX, radiusY, fill, extra = {}) => ({
  id: `cp-s-${++shapeCounter}`,
  kind: 'ellipse',
  x, y, radiusX, radiusY, fill, ...extra
});
const P = (d, fill = 'none', stroke = 'none', strokeWidth = 2, extra = {}) => ({
  id: `cp-s-${++shapeCounter}`,
  kind: 'path',
  d, fill, stroke, strokeWidth, ...extra
});

let enginePromise;
export async function getEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    try {
      const here = dirname(fileURLToPath(import.meta.url));
      const root = resolve(here, '../..');
      const { build } = await import('esbuild');
      const { outputFiles } = await build({
        stdin: {
          contents: "export * from './src/engine/index';",
          resolveDir: root,
        },
        bundle: true,
        write: false,
        platform: 'node',
        format: 'cjs',
        packages: 'external',
      });
      const compiled = { exports: {} };
      new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
      return compiled.exports;
    } catch (error) {
      console.warn('[city-pickup] Engine dynamic import fallback:', error.message);
      return null;
    }
  })();
  return enginePromise;
}

// Built-in ear-clipping triangulation for extrusion
function triangulateOutline(points) {
  if (points.length < 3) return [];
  const area = points.reduce((sum, p, i) => { const next = points[(i + 1) % points.length]; return sum + p.x * next.y - next.x * p.y; }, 0);
  const ids = points.map((_, i) => i);
  if (area < 0) ids.reverse();
  const result = [];
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  while (ids.length > 3) {
    let ear = false;
    for (let i = 0; i < ids.length; i++) {
      const a = ids[(i + ids.length - 1) % ids.length], b = ids[i], c = ids[(i + 1) % ids.length];
      if (cross(points[a], points[b], points[c]) <= 1e-8) continue;
      if (ids.some(id => id !== a && id !== b && id !== c && cross(points[a], points[b], points[id]) >= 0 && cross(points[b], points[c], points[id]) >= 0 && cross(points[c], points[a], points[id]) >= 0)) continue;
      result.push([a, b, c]);
      ids.splice(i, 1);
      ear = true;
      break;
    }
    if (!ear) break;
  }
  if (ids.length === 3) result.push([ids[0], ids[1], ids[2]]);
  return result;
}

function extrudePoly(points, depth = 30, color = '#1e1b4b') {
  const count = points.length;
  const vertices = [
    ...points.map(p => ({ x: p.x, y: p.y, z: -depth / 2 })),
    ...points.map(p => ({ x: p.x, y: p.y, z: depth / 2 }))
  ];
  const triangles = [];
  for (const [a, b, c] of triangulateOutline(points)) {
    triangles.push({ indices: [c, b, a], color }, { indices: [a + count, b + count, c + count], color });
  }
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    triangles.push(
      { indices: [i, next, next + count], color },
      { indices: [i, next + count, i + count], color }
    );
  }
  return { vertices, triangles, source: 'extrude', extrusion: depth, castShadow: true };
}

function latheProf(profile, segments = 20, angle = Math.PI * 2, color = '#18181b') {
  const vertices = [];
  const triangles = [];
  for (let s = 0; s <= segments; s++) {
    const theta = angle * s / segments;
    profile.forEach(p => {
      vertices.push({ x: Math.cos(theta) * p.x, y: p.y, z: Math.sin(theta) * p.x });
    });
  }
  for (let s = 0; s < segments; s++) {
    for (let r = 0; r < profile.length - 1; r++) {
      const stride = profile.length;
      const a = s * stride + r;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      triangles.push({ indices: [a, c, d], color }, { indices: [a, d, b], color });
    }
  }
  return { vertices, triangles, source: 'lathe', lathe: { segments, angle }, castShadow: true };
}

export async function buildCityPickupScene(options = {}) {
  const engine = await getEngine();
  const extrude = engine?.extrudePolygon ?? extrudePoly;
  const lathe = engine?.latheProfile ?? latheProf;

  const fps = options.fps ?? 24;
  const duration = Math.max(4, Math.min(20, options.duration ?? 8));
  const totalFrames = Math.round(duration * fps);
  const carColor = options.carColor ?? '#1e1b4b'; // Midnight Sapphire Metallic

  const project = {
    schemaVersion: 1,
    id: 'project-city-car-pickup',
    name: 'City Lights · 3D Car Pickup',
    canvas: { width: 1280, height: 720, background: '#020617' },
    bones: [
      { id: 'world-anchor', name: 'World Anchor', parentId: null, length: 0, local: T(0, 0), locked: true },
      // 3D Car Root
      { id: 'car-root', name: '3D Luxury Car Root', parentId: null, length: 220, local: T(480, 410), locked: false },
      { id: 'car-chassis-bone', name: 'Car Chassis', parentId: 'car-root', length: 180, local: T(0, 0), locked: false },
      { id: 'car-door-hinge', name: 'Passenger Door Hinge', parentId: 'car-chassis-bone', length: 60, local: T(20, -10), locked: false },
      // Handsome Driver (Luke) in Cockpit
      { id: 'driver-root', name: 'Luke Root', parentId: 'car-chassis-bone', length: 70, local: T(-45, -20), locked: false },
      { id: 'driver-head', name: 'Luke Head', parentId: 'driver-root', length: 45, local: T(0, -35), locked: false },
      // Pretty Girl (Elena) in One-Shoulder Dress
      { id: 'girl-root', name: 'Elena Root', parentId: null, length: 90, local: T(760, 370), locked: false },
      { id: 'girl-torso', name: 'Elena Torso', parentId: 'girl-root', length: 65, local: T(0, -60), locked: false },
      { id: 'girl-neck', name: 'Elena Neck', parentId: 'girl-torso', length: 20, local: T(0, -45), locked: false },
      { id: 'girl-head', name: 'Elena Head', parentId: 'girl-neck', length: 50, local: T(0, -22), locked: false },
      { id: 'girl-arm-left', name: 'Elena Left Arm (One-Shoulder Strap)', parentId: 'girl-torso', length: 55, local: T(-22, -35), locked: false },
      { id: 'girl-arm-right', name: 'Elena Right Arm (Bare Clavicle)', parentId: 'girl-torso', length: 55, local: T(22, -35), locked: false },
      { id: 'girl-skirt', name: 'Elena Skirt', parentId: 'girl-root', length: 75, local: T(0, 0), locked: false },
      { id: 'girl-legs', name: 'Elena Legs & Heels', parentId: 'girl-root', length: 85, local: T(0, 20), locked: false }
    ],
    layers: [],
    bindings: [],
    stage2d: {
      enabled: true,
      cameraX: 0,
      cameraY: 0,
      zoom: 1,
      yaw: 0,
      pitch: 0,
      roll: 0,
      perspective: 0.5,
      projection: 'perspective',
      camera3d: {
        enabled: true,
        position: { x: 20, y: -45, z: 620 },
        rotation: { x: 4, y: 12, z: 0 },
        focalLength: 50,
        sensorWidth: 36,
        projection: 'perspective',
        orthographicScale: 900,
        near: 1,
        far: 15000,
        focusDistance: 640,
        aperture: 0,
        fStop: 8.0,
        depthOfField: false,
        exposure: 1.25,
        ambient: 0.42,
        keyLight: {
          direction: { x: -0.45, y: -0.65, z: -0.85 },
          color: '#fff7ed',
          intensity: 1.45,
          castShadows: true
        },
        shadow: {
          enabled: true,
          softness: 10,
          opacity: 0.42,
          depth: 56
        }
      }
    },
    cameras: [
      {
        id: 'cam-arrival-wide',
        name: 'City Arrival Wide Tracking',
        hotkey: 1,
        settings: {
          enabled: true,
          cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0.5, projection: 'perspective',
          camera3d: {
            enabled: true,
            position: { x: 20, y: -45, z: 620 },
            rotation: { x: 4, y: 12, z: 0 },
            focalLength: 50, sensorWidth: 36, projection: 'perspective', near: 1, far: 15000, focusDistance: 640,
            aperture: 0, fStop: 8.0, depthOfField: false, exposure: 1.25, ambient: 0.42,
            keyLight: { direction: { x: -0.45, y: -0.65, z: -0.85 }, color: '#fff7ed', intensity: 1.45, castShadows: true },
            shadow: { enabled: true, softness: 10, opacity: 0.42, depth: 56 }
          }
        },
        follow: null
      },
      {
        id: 'cam-cockpit-twoshot',
        name: 'Cockpit Intimate Two-Shot',
        hotkey: 2,
        settings: {
          enabled: true,
          cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0.5, projection: 'perspective',
          camera3d: {
            enabled: true,
            position: { x: -160, y: -25, z: 360 },
            rotation: { x: 2, y: 0, z: 0 },
            focalLength: 65, sensorWidth: 36, projection: 'perspective', near: 1, far: 15000, focusDistance: 360,
            aperture: 0, fStop: 8.0, depthOfField: false, exposure: 1.3, ambient: 0.44,
            keyLight: { direction: { x: -0.35, y: -0.6, z: -0.9 }, color: '#fed7aa', intensity: 1.5, castShadows: true },
            shadow: { enabled: true, softness: 8, opacity: 0.38, depth: 56 }
          }
        },
        follow: null
      },
      {
        id: 'cam-departure-chase',
        name: 'Night Departure Chase Tracking',
        hotkey: 3,
        settings: {
          enabled: true,
          cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0.5, projection: 'perspective',
          camera3d: {
            enabled: true,
            position: { x: -150, y: -65, z: 560 },
            rotation: { x: 6, y: -20, z: 0 },
            focalLength: 50, sensorWidth: 36, projection: 'perspective', near: 1, far: 15000, focusDistance: 580,
            aperture: 0, fStop: 8.0, depthOfField: false, exposure: 1.25, ambient: 0.42,
            keyLight: { direction: { x: -0.45, y: -0.65, z: -0.85 }, color: '#fff7ed', intensity: 1.45, castShadows: true },
            shadow: { enabled: true, softness: 10, opacity: 0.42, depth: 56 }
          }
        },
        follow: null
      }
    ],
    cameraView: 'cam-arrival-wide',
    animations: [],
    timeline: {
      currentFrame: 0,
      currentTime: 0,
      isPlaying: false,
      loop: false,
      fps,
      startFrame: 0,
      endFrame: totalFrames,
      activeAnimationId: 'clip-city-pickup'
    },
    groups: [
      {
        id: 'group-env',
        name: 'Environment Backdrop',
        parentGroupId: null,
        childIds: ['env-city-sky', 'env-city-skyscrapers', 'env-city-street'],
        opacity: 1,
        visible: true,
        zIndex: -100,
        mode: 'composite',
        blendMode: 'source-over'
      }
    ]
  };

  const addLayer = (layerData, boneId = null) => {
    project.layers.push(layerData);
    if (boneId) {
      project.bindings.push({
        id: `bind-${layerData.id}`,
        layerId: layerData.id,
        imageId: layerData.id,
        boneId,
        bindOffset: T()
      });
    }
  };

  // 1. PANORAMIC MIDNIGHT TWILIGHT SKY (-2000 to +3000)
  addLayer({
    id: 'env-city-sky',
    name: 'Midnight Metropolis Twilight Sky',
    type: 'vector',
    local: T(0, 0),
    parentGroupId: 'group-env',
    zIndex: -220,
    depth: -950,
    parallax: 0.08,
    opacity: 1,
    visible: true,
    locked: true,
    boundBoneId: null,
    shapes: [
      R(-2000, -1000, 5000, 2000, '#030712'),
      P('M -2000 -1000 L 3000 -1000 L 3000 520 Q 640 580 -2000 520 Z', '#0f172a'),
      E(1080, 80, 52, 52, '#f8fafc'), // Radiant Moon
      E(1080, 80, 80, 80, '#38bdf8', { opacity: 0.15 }),
      // Stars across the panorama
      ...[-1400, -900, -450, 80, 320, 680, 950, 1350, 1800, 2400].map((x, i) =>
        E(x, 30 + (i % 5) * 25, 2, 2, '#ffffff', { opacity: 0.75 })
      )
    ]
  });

  // 2. PANORAMIC ILLUMINATED CITY SKYSCRAPERS
  const windowBoxes = [];
  // Towers across the horizon: [-1200, -800, -350, 100, 500, 950, 1400, 1900, 2400]
  const towerPositions = [-1200, -850, -420, 80, 480, 880, 1300, 1750, 2200];
  towerPositions.forEach((tx, idx) => {
    const cols = 5;
    const rows = 12;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const wx = tx + 20 + c * 20;
        const wy = 120 + r * 22;
        const lit = (c * 7 + r * 11 + idx * 3) % 3 !== 0;
        windowBoxes.push(R(wx, wy, 11, 12, lit ? (idx % 2 ? '#fef08a' : '#38bdf8') : '#1e293b', { opacity: lit ? 0.75 : 0.3 }));
      }
    }
  });

  addLayer({
    id: 'env-city-skyscrapers',
    name: 'Illuminated City Skyline & High-Rise Towers',
    type: 'vector',
    local: T(0, 0),
    parentGroupId: 'group-env',
    zIndex: -180,
    depth: -680,
    parallax: 0.22,
    opacity: 1,
    visible: true,
    locked: true,
    boundBoneId: null,
    shapes: [
      ...towerPositions.map((tx, idx) => {
        const tw = 140 + (idx % 3) * 30;
        const th = 380 + (idx % 4) * 40;
        const topY = 480 - th;
        return R(tx, topY, tw, th, idx % 2 ? '#0b192c' : '#0f172a', { stroke: '#1e293b', strokeWidth: 2 });
      }),
      // Neon Rooftop Signs
      R(520, 60, 160, 36, '#0f172a', { stroke: '#ec4899', strokeWidth: 3 }), // "GRAND LUMINA"
      R(1340, 70, 140, 32, '#0f172a', { stroke: '#06b6d4', strokeWidth: 3 }), // "METROPOLIS"
      ...windowBoxes
    ]
  });

  // 3. PANORAMIC SIDEWALK, KERB & MULTI-LANE ASPHALT AVENUE
  addLayer({
    id: 'env-city-street',
    name: 'Boulevard Sidewalk & Streetlamp Light Pools',
    type: 'vector',
    local: T(0, 0),
    parentGroupId: 'group-env',
    zIndex: -90,
    depth: -500,
    parallax: 0.5,
    opacity: 1,
    visible: true,
    locked: true,
    boundBoneId: null,
    shapes: [
      // Sidewalk concrete pavement
      R(-2000, 360, 5000, 100, '#334155'),
      R(-2000, 455, 5000, 8, '#64748b'), // Kerbstone
      // Sidewalk paving tile joints
      ...Array.from({ length: 45 }, (_, i) => P(`M ${-1800 + i * 110} 360 L ${-1840 + i * 110} 455`, 'none', '#1e293b', 1.8)),
      // Asphalt Road Surface
      R(-2000, 460, 5000, 320, '#0f172a'),
      // Center dashed yellow lane dividers
      ...Array.from({ length: 35 }, (_, i) => R(-1800 + i * 130, 560, 75, 7, '#facc15')),
      // Street Lamp Posts
      ...[-400, 180, 780, 1380, 1980].flatMap(lx => [
        P(`M ${lx} 455 L ${lx} 180 Q ${lx} 140 ${lx + 35} 140`, 'none', '#1e293b', 7),
        E(lx + 35, 140, 12, 12, '#fef08a'),
        E(lx + 35, 140, 30, 30, '#fef08a', { opacity: 0.28 }),
        E(lx + 35, 455, 160, 40, '#fef08a', { opacity: 0.22 }) // Warm amber ground puddle
      ])
    ]
  });

  // 4. PRETTY GIRL (ELENA) - FASHIONABLE ONE-SHOULDER DESIGNER DRESS
  const skin = '#fcd7c3';
  const dressEmerald = '#059669';
  const dressDark = '#047857';
  const gold = '#f59e0b';
  const hair = '#3d1a08';

  // A. Elena Cascading Hair (Back Layer, behind shoulders)
  addLayer({
    id: 'layer-girl-hair-back',
    name: 'Elena Cascading Chestnut Hair (Back)',
    type: 'vector',
    local: T(0, 0),
    zIndex: 48,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'girl-head',
    shapes: [
      P('M -20 -15 Q -28 5 -22 25 Q 0 30 22 25 Q 28 5 20 -15 Z', hair),
      P('M -16 5 Q -20 18 -16 26', 'none', '#5b2308', 2),
      P('M 16 5 Q 20 18 16 26', 'none', '#5b2308', 2)
    ]
  }, 'girl-head');

  // B. Elena Pretty Face & Expressive Features
  addLayer({
    id: 'layer-girl-head',
    name: 'Elena Pretty Face & Features',
    type: 'vector',
    local: T(0, 0),
    zIndex: 60,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'girl-head',
    shapes: [
      // Feminine sculpted jawline & soft chin
      P('M -18 -8 Q -20 16 0 24 Q 20 16 18 -8 Q 18 -32 0 -32 Q -18 -32 -18 -8 Z', skin),
      // Soft rosy cheek blush
      E(-10, 8, 7, 3.5, '#fb7185', { opacity: 0.45 }),
      E(10, 8, 7, 3.5, '#fb7185', { opacity: 0.45 }),
      // Fine arched eyebrows
      P('M -14 -12 Q -8 -15 -2 -11', 'none', '#1f0d04', 1.8),
      P('M 2 -11 Q 8 -15 14 -12', 'none', '#1f0d04', 1.8),
      // Almond eyes with eyeliner & lashes
      E(-8, -4, 4.5, 3.2, '#1e293b'),
      E(8, -4, 4.5, 3.2, '#1e293b'),
      E(-7, -4.5, 1.3, 1.3, '#ffffff'),
      E(9, -4.5, 1.3, 1.3, '#ffffff'),
      P('M -13 -7 Q -8 -10 -3 -7', 'none', '#090d16', 2.2), // Eyelash left
      P('M 3 -7 Q 8 -10 13 -7', 'none', '#090d16', 2.2),  // Eyelash right
      // Delicate nose bridge & tip
      P('M 0 -3 L -1 6 L 2 6', 'none', '#d97706', 1.5),
      // Pretty pink-red lips with subtle smile
      P('M -7 13 Q 0 19 7 13 Q 0 14 -7 13 Z', '#e11d48'),
      E(0, 15, 2, 1, '#fda4af'), // Lip gloss highlight
      // Voluminous chestnut hair crown covering forehead top and scalp
      P('M -22 -12 Q -24 -38 0 -40 Q 24 -38 22 -12 Q 18 -18 0 -22 Q -18 -18 -22 -12 Z', hair),
      // Soft side bangs framing the temples
      P('M -20 -14 Q -12 -24 -6 -18 Q -10 -12 -18 -10 Z', hair),
      P('M 20 -14 Q 12 -24 6 -18 Q 10 -12 18 -10 Z', hair),
      // Side hair lock cascading down right side of jaw
      P('M 18 -10 Q 24 10 20 40 Q 16 20 14 -8 Z', hair)
    ]
  }, 'girl-head');

  // B. Elena Torso: CHIC ONE-SHOULDER DRESS (Asymmetrical cut)
  // Left shoulder is draped in emerald silk, right shoulder is completely bare!
  addLayer({
    id: 'layer-girl-torso',
    name: 'Elena One-Shoulder Designer Bodice',
    type: 'vector',
    local: T(0, 0),
    zIndex: 55,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'girl-torso',
    shapes: [
      // Bare upper chest & right collarbone
      P('M -20 -38 L 20 -38 L 16 18 L -16 18 Z', skin),
      // Clavicle contour
      P('M -14 -32 Q -5 -29 0 -32 Q 5 -29 14 -32', 'none', '#d97706', 1.2),
      // Beautiful one-shoulder draped fabric: covers left shoulder, slopes diagonally leaving right shoulder bare!
      P('M -22 -38 L 2 -36 L 16 18 L -16 18 Z', dressEmerald),
      P('M -22 -38 Q -16 -8 16 18', 'none', dressDark, 2),
      P('M -10 -36 Q -5 -6 4 18', 'none', '#34d399', 1.5),
      // Fitted waist & gold accent belt
      R(-16, 16, 32, 6, gold),
      E(0, 19, 4, 4, '#fef08a')
    ]
  }, 'girl-torso');

  // C. Elena Arms (Left: draped sleeve strap; Right: bare arm with gold bangle)
  addLayer({
    id: 'layer-girl-arm-left',
    name: 'Elena Left Arm & Gold Clutch',
    type: 'vector',
    local: T(0, 0),
    zIndex: 56,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'girl-arm-left',
    shapes: [
      P('M -6 0 L 6 0 L 5 16 L -5 16 Z', dressEmerald), // Shoulder strap top
      P('M -5 14 L 5 14 L 4 58 L -4 58 Z', skin),       // Slender arm
      E(0, 60, 5, 5, skin),                            // Hand
      R(-8, 62, 16, 12, '#f59e0b', { stroke: '#fef08a', strokeWidth: 1.5 }) // Gold clutch bag
    ]
  }, 'girl-arm-left');

  addLayer({
    id: 'layer-girl-arm-right',
    name: 'Elena Bare Right Arm & Gold Bangle',
    type: 'vector',
    local: T(0, 0),
    zIndex: 56,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'girl-arm-right',
    shapes: [
      E(0, 2, 6, 6, skin),                       // Bare shoulder cap
      P('M -5 2 L 5 2 L 4 58 L -4 58 Z', skin),   // Bare arm
      R(-5, 50, 10, 3, gold),                    // Gold bangle bracelet
      E(0, 60, 5, 5, skin)                       // Hand
    ]
  }, 'girl-arm-right');

  // D. Elena High-Waist Slit Skirt
  addLayer({
    id: 'layer-girl-skirt',
    name: 'Elena High-Waist Emerald Slit Skirt',
    type: 'vector',
    local: T(0, 0),
    zIndex: 52,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'girl-skirt',
    shapes: [
      P('M -16 -40 L 16 -40 L 18 25 L 4 30 L -14 25 Z', dressEmerald),
      P('M -16 -40 Q -2 -5 4 30', 'none', dressDark, 1.8)
    ]
  }, 'girl-skirt');

  // E. Elena Slender Legs & Stilettos
  addLayer({
    id: 'layer-girl-legs',
    name: 'Elena Slender Legs & Stilettos',
    type: 'vector',
    local: T(0, 0),
    zIndex: 50,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'girl-legs',
    shapes: [
      // Left leg
      P('M -11 10 L -3 10 L -4 80 L -9 80 Z', skin),
      P('M -10 80 L -3 80 L 4 92 L -10 92 Z', '#0f172a'), // Stiletto pump
      P('M -9 90 L -9 98', 'none', gold, 2),              // Gold heel pin
      // Right leg (peeking through slit)
      P('M 2 10 L 10 10 L 9 80 L 3 80 Z', skin),
      P('M 3 80 L 10 80 L 16 92 L 3 92 Z', '#0f172a'),
      P('M 4 90 L 4 98', 'none', gold, 2)
    ]
  }, 'girl-legs');

  // 5. THE 3D LUXURY SPORTS CAR
  // Extruded aerodynamic monocoque chassis
  const bodyProfile = [
    { x: -175, y: 28 }, // rear diffuser
    { x: -175, y: -8 }, // rear spoiler deck
    { x: -140, y: -22 }, // rear haunch
    { x: -80, y: -52 }, // rear window fastback slope
    { x: 30, y: -54 },  // sleek roofline
    { x: 95, y: -20 },  // windshield base
    { x: 155, y: -10 }, // low-slung aerodynamic hood
    { x: 180, y: 8 },   // front carbon splitter
    { x: 175, y: 28 },  // front chin
    { x: 150, y: 14 },  // front wheel arch fore
    { x: 125, y: 6 },   // front wheel arch apex
    { x: 100, y: 14 },  // front wheel arch aft
    { x: -100, y: 14 }, // rear wheel arch fore
    { x: -125, y: 6 },  // rear wheel arch apex
    { x: -150, y: 14 }  // rear wheel arch aft
  ];
  const chassisMesh = extrude(bodyProfile, 138, carColor);

  addLayer({
    id: 'layer-3d-car-body',
    name: '3D Luxury GT Car Monocoque Body',
    type: 'vector',
    local: T(0, 0),
    transform3d: T3D(0, 0, 0),
    zIndex: 20,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'car-chassis-bone',
    mesh3d: chassisMesh,
    shapes: []
  }, 'car-chassis-bone');

  // Cockpit Seats & Steering Wheel
  addLayer({
    id: 'layer-car-interior',
    name: 'Car Interior Cockpit & Sports Seats',
    type: 'vector',
    local: T(0, 0),
    zIndex: 22,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'car-chassis-bone',
    shapes: [
      // Driver Bucket Seat (Charcoal Leather with Red Stitching)
      P('M -65 -45 L -35 -45 L -30 20 L -70 20 Z', '#18181b', '#ef4444', 1.5),
      // Passenger Bucket Seat (Elena's seat)
      P('M 5 -45 L 35 -45 L 40 20 L 0 20 Z', '#18181b', '#ef4444', 1.5),
      // Sports Steering Wheel
      E(35, -28, 11, 11, 'none', { stroke: '#e2e8f0', strokeWidth: 2.8 }),
      E(35, -28, 4, 4, '#ef4444')
    ]
  }, 'car-chassis-bone');

  // 6. HANDSOME DRIVER (LUKE)
  addLayer({
    id: 'layer-driver-luke',
    name: 'Luke Handsome Driver in Cockpit',
    type: 'vector',
    local: T(0, 0),
    zIndex: 24,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'driver-root',
    shapes: [
      // Tailored charcoal blazer & crisp open white shirt collar
      P('M -22 -10 L 22 -10 L 18 25 L -18 25 Z', '#090d16'),
      P('M -18 -10 L -4 15 L 4 15 L 18 -10 Z', '#1e293b'), // Lapels
      P('M -8 -10 L 0 -1 L 8 -10', 'none', '#f8fafc', 2.5), // Crisp white open collar
      P('M -6 -10 L 0 -2 L 6 -10 Z', '#f3bc9d'),            // V-neck skin
      // Sharp masculine jawline & warm skin
      P('M -14 -35 L 14 -35 L 11 -12 L 0 -5 L -11 -12 Z', '#f3bc9d'),
      // Confident eyes & defined dark brows
      E(-5, -22, 3, 2, '#18181b'),
      E(5, -22, 3, 2, '#18181b'),
      P('M -9 -27 L -2 -27', 'none', '#090d16', 2.2),
      P('M 2 -27 L 9 -27', 'none', '#090d16', 2.2),
      // Straight nose & charming smile
      P('M 0 -22 L -1 -16 L 2 -16', 'none', '#b45309', 1.5),
      P('M -5 -11 Q 0 -7 5 -11', 'none', '#991b1b', 2),
      // Stylish modern pompadour fade dark hair
      P('M -16 -35 Q 0 -52 18 -38 Q 15 -26 16 -20 L 12 -24 Q 0 -44 -14 -30 Z', '#18181b'),
      // Hands on steering wheel
      P('M 12 8 L 35 -10 L 38 -15', 'none', '#090d16', 6),
      E(38, -17, 5, 5, '#f3bc9d') // Hand gripping wheel
    ]
  }, 'driver-root');

  // 7. ARTICULATED PASSENGER DOOR (Opens for Elena, then shuts!)
  addLayer({
    id: 'layer-car-passenger-door',
    name: 'Car Passenger Door with Chrome Handle',
    type: 'vector',
    local: T(0, 0),
    transform3d: T3D(20, -5, 68),
    zIndex: 26,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'car-door-hinge',
    shapes: [
      P('M 0 0 L 75 0 L 70 30 L -5 30 Z', carColor, '#38bdf8', 1.5),
      R(52, 6, 15, 4, '#e2e8f0', { stroke: '#0f172a', strokeWidth: 1 }) // Chrome handle
    ]
  }, 'car-door-hinge');

  // 8. FOUR 3D LATHED WHEELS & GOLD ALLOY RIMS
  const wheelProfile = [
    { x: 0, y: 14 },
    { x: 12, y: 13 },
    { x: 20, y: 11 },
    { x: 26, y: 9 },
    { x: 30, y: 6 },
    { x: 32, y: 0 },
    { x: 30, y: -6 },
    { x: 26, y: -9 },
    { x: 20, y: -11 },
    { x: 12, y: -13 },
    { x: 0, y: -14 }
  ];
  const wheelMesh = lathe(wheelProfile, 22, Math.PI * 2, '#18181b');

  const wheels = [
    { id: 'layer-wheel-fl', name: '3D Wheel Front-Left', pos: [125, 22, 68] },
    { id: 'layer-wheel-fr', name: '3D Wheel Front-Right', pos: [125, 22, -68] },
    { id: 'layer-wheel-rl', name: '3D Wheel Rear-Left', pos: [-125, 22, 68] },
    { id: 'layer-wheel-rr', name: '3D Wheel Rear-Right', pos: [-125, 22, -68] }
  ];

  for (const w of wheels) {
    addLayer({
      id: w.id,
      name: w.name,
      type: 'vector',
      local: T(0, 0),
      transform3d: T3D(w.pos[0], w.pos[1], w.pos[2], 90, 0, 0),
      zIndex: w.pos[2] > 0 ? 30 : 15,
      opacity: 1,
      visible: true,
      locked: false,
      boundBoneId: 'car-chassis-bone',
      mesh3d: wheelMesh,
      shapes: [
        E(0, 0, 16, 16, '#f59e0b', { stroke: '#fef08a', strokeWidth: 2 }), // Gold alloy rim
        E(0, 0, 6, 6, '#0f172a')
      ]
    }, 'car-chassis-bone');
  }

  // 9. HEADLIGHTS VOLUMETRIC CONES & REAR LED TAILLIGHTS
  addLayer({
    id: 'layer-car-lights',
    name: 'Twin Projector Headlights & Ground Beam',
    type: 'vector',
    local: T(0, 0),
    zIndex: 32,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'car-chassis-bone',
    shapes: [
      // Xenon projectors
      E(170, 0, 5, 8, '#e0f2fe'),
      E(170, 0, 9, 14, '#38bdf8', { opacity: 0.4 }),
      // Volumetric road illumination beam
      P('M 172 0 L 460 -35 L 480 80 L 172 15 Z', '#e0f2fe', 'none', 0, { opacity: 0.28 }),
      // Rear LED taillights
      E(-172, -6, 4, 8, '#ef4444'),
      E(-172, -6, 8, 14, '#ef4444', { opacity: 0.35 })
    ]
  }, 'car-chassis-bone');

  // 10. CINEMATIC DIALOGUE SUBTITLES
  const subtitleSvgLuke = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="120" viewBox="0 0 1000 120">
    <rect x="20" y="10" width="960" height="100" rx="18" fill="#0f172a" fill-opacity="0.88" stroke="#38bdf8" stroke-width="2"/>
    <text x="50" y="45" font-family="'Outfit', sans-serif" font-size="20" font-weight="700" fill="#38bdf8">LUKE</text>
    <text x="50" y="80" font-family="'Outfit', sans-serif" font-size="22" font-weight="500" fill="#f8fafc">"Right on time. You look stunning tonight, Elena."</text>
  </svg>`;

  const subtitleSvgElena = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="120" viewBox="0 0 1000 120">
    <rect x="20" y="10" width="960" height="100" rx="18" fill="#0f172a" fill-opacity="0.88" stroke="#10b981" stroke-width="2"/>
    <text x="50" y="45" font-family="'Outfit', sans-serif" font-size="20" font-weight="700" fill="#10b981">ELENA</text>
    <text x="50" y="80" font-family="'Outfit', sans-serif" font-size="22" font-weight="500" fill="#f8fafc">"Thanks, Luke. Let's see what the city has for us tonight."</text>
  </svg>`;

  addLayer({
    id: 'layer-subtitle-luke',
    name: 'Dialogue Subtitle · Luke',
    type: 'image',
    src: `data:image/svg+xml;base64,${Buffer.from(subtitleSvgLuke).toString('base64')}`,
    width: 1000,
    height: 120,
    local: T(140, 580),
    zIndex: 110,
    opacity: 0,
    visible: true,
    locked: true,
    boundBoneId: null
  });

  addLayer({
    id: 'layer-subtitle-elena',
    name: 'Dialogue Subtitle · Elena',
    type: 'image',
    src: `data:image/svg+xml;base64,${Buffer.from(subtitleSvgElena).toString('base64')}`,
    width: 1000,
    height: 120,
    local: T(140, 580),
    zIndex: 110,
    opacity: 0,
    visible: true,
    locked: true,
    boundBoneId: null
  });

  // 11. MULTI-PHASE 4-ACT STORY ANIMATION (192 FRAMES @ 24 FPS = 8.0 SECONDS)
  const tracks = [];
  const addTrack = (targetId, property, keyframes) => {
    tracks.push({
      id: `track-${targetId}-${property}`,
      targetId,
      property,
      keyframes: keyframes.map(([frame, value, easing = 'smooth'], index) => ({
        id: `key-${targetId}-${property}-${index}`,
        frame,
        value,
        easing
      }))
    });
  };

  const carRootKeys = [];
  const carDoorKeys = [];
  const camOrbitKeys = [];
  const wheelFLKeys = [];
  const wheelFRKeys = [];
  const wheelRLKeys = [];
  const wheelRRKeys = [];
  const girlRootKeys = [];
  const girlHeadKeys = [];
  const girlArmLKeys = [];
  const driverRootKeys = [];
  const driverHeadKeys = [];
  const girlLegsOpacityKeys = [];
  const girlSkirtOpacityKeys = [];
  const subLukeKeys = [];
  const subElenaKeys = [];

  // Key timing frames:
  // F 0 - 55 (0 - 2.3s): Car drives up and decelerates at curb (x: 480)
  // F 55 - 95 (2.3 - 4.0s): Car stops, passenger door swings open, Elena walks to car
  // F 95 - 110 (4.0 - 4.6s): Elena steps inside, sits in passenger seat, door closes
  // F 110 - 150 (4.6 - 6.25s): Interior talk with handsome driver (subtitles & dialogue)
  // F 150 - 192 (6.25 - 8.0s): Car accelerates off down the avenue into the night
  for (let frame = 0; frame <= totalFrames; frame++) {
    const t = frame / fps;

    // A. CAR WORLD POSITION
    let carX;
    if (frame <= 55) {
      // Arriving smoothly from left to curbside x = 480
      const p = frame / 55;
      const ease = p * p * (3 - 2 * p);
      carX = -300 + ease * 780; // -300 -> 480
    } else if (frame <= 150) {
      // Stopped at the curbside
      carX = 480;
    } else {
      // Driving off into the distance
      const p = (frame - 150) / (totalFrames - 150);
      const ease = p * p;
      carX = 480 + ease * 720; // 480 -> 1200
    }

    const engineRumble = Math.sin(t * 24) * 0.8;
    carRootKeys.push([frame, T(carX, 410 + engineRumble, 0, 1, 1)]);

    // B. CAR PASSENGER DOOR (Opens for Elena, shuts once seated)
    let doorRot = 0;
    if (frame >= 55 && frame <= 75) {
      // Door swings open
      const p = (frame - 55) / 20;
      doorRot = -p * 45;
    } else if (frame > 75 && frame <= 98) {
      // Held open
      doorRot = -45;
    } else if (frame > 98 && frame <= 110) {
      // Shuts
      const p = (frame - 98) / 12;
      doorRot = -45 + p * 45;
    }
    carDoorKeys.push([frame, T(20, -10, doorRot * Math.PI / 180, 1, 1)]);

    // C. 3D WHEELS ROTATION
    let wheelSpin = 0;
    if (frame <= 55) {
      wheelSpin = (frame * 24) % 360;
    } else if (frame > 150) {
      wheelSpin = ((frame - 150) * 32) % 360;
    }
    wheelFLKeys.push([frame, T3D(125, 22, 68, 90, 0, wheelSpin)]);
    wheelFRKeys.push([frame, T3D(125, 22, -68, 90, 0, wheelSpin)]);
    wheelRLKeys.push([frame, T3D(-125, 22, 68, 90, 0, wheelSpin)]);
    wheelRRKeys.push([frame, T3D(-125, 22, -68, 90, 0, wheelSpin)]);

    // D. PRETTY GIRL (ELENA) MOTION (Wait -> Walk -> Enter car -> Sit & talk)
    let gx, gy, gRot, gArmRot, gHeadRot;
    if (frame <= 55) {
      // Waiting on sidewalk under streetlamp
      gx = 760;
      gy = 370;
      gRot = 0;
      gArmRot = Math.sin(t * 3) * 0.05;
      gHeadRot = Math.sin(t * 2) * 0.04;
    } else if (frame <= 95) {
      // Walking gracefully toward the passenger door
      const p = (frame - 55) / 40;
      gx = 760 - p * 245; // 760 -> 515
      gy = 370 - Math.abs(Math.sin(p * Math.PI * 4)) * 6; // Step bobbing
      gRot = -0.04;
      gArmRot = 0.25 + Math.sin(p * Math.PI * 4) * 0.15; // Arm reach
      gHeadRot = 0.06;
    } else if (frame <= 110) {
      // Stepping inside passenger door and sitting down
      const p = (frame - 95) / 15;
      gx = 515 - p * 13; // Aligning with passenger seat (carX + 22 = 502)
      gy = 370 + p * 122; // Sitting down into the car seat (370 -> 492)
      gRot = 0.04;
      gArmRot = 0.1;
      gHeadRot = 0.08;
    } else if (frame <= 150) {
      // Seated in the car, talking to driver Luke
      gx = carX + 22;
      gy = 492 + engineRumble;
      gRot = 0.04;
      gHeadRot = -0.18 + Math.sin(t * 8) * 0.06; // Nodding / talking to Luke
      gArmRot = 0.2 + Math.sin(t * 6) * 0.12;    // Expressive talking gesture
    } else {
      // Driving off with the car
      gx = carX + 22;
      gy = 492 + engineRumble;
      gRot = 0.02;
      gHeadRot = 0;
      gArmRot = 0;
    }
    girlRootKeys.push([frame, T(gx, gy, gRot, 1, 1)]);
    girlHeadKeys.push([frame, T(0, -22, gHeadRot, 1, 1)]);
    girlArmLKeys.push([frame, T(-22, -35, gArmRot, 1, 1)]);

    // Lower body opacity (fades into footwell under opaque door when seated)
    if (frame <= 95) {
      girlLegsOpacityKeys.push([frame, 1]);
      girlSkirtOpacityKeys.push([frame, 1]);
    } else if (frame <= 110) {
      const p = (frame - 95) / 15;
      girlLegsOpacityKeys.push([frame, Math.max(0, 1 - p * 1.5)]);
      girlSkirtOpacityKeys.push([frame, Math.max(0.1, 1 - p * 0.8)]);
    } else {
      girlLegsOpacityKeys.push([frame, 0]);
      girlSkirtOpacityKeys.push([frame, 0.1]);
    }

    // E. HANDSOME DRIVER (LUKE) (Driving -> Welcoming smile -> Talking)
    let driverHeadRot = 0;
    if (frame >= 55 && frame <= 150) {
      // Turned toward Elena with warm welcoming smile
      driverHeadRot = 0.22 + Math.sin(t * 5) * 0.05;
    } else {
      driverHeadRot = 0; // Focused on road ahead
    }
    driverRootKeys.push([frame, T(-45, -20, 0, 1, 1)]);
    driverHeadKeys.push([frame, T(0, -35, driverHeadRot, 1, 1)]);

    // F. TRUE 3D CAMERA PATH WITH EXACT LOOKAT (Arrival -> Boarding -> Cockpit Two-Shot -> Departure Chase)
    // Remember: in render3d.ts, 3D space is centered at canvas center (640, 360):
    // 3D X = canvasX - 640; 3D Y = canvasY - 360;
    const car3dX = carX - 640;
    const car3dY = (410 + engineRumble) - 360;

    let camPos, targetX, targetY, targetZ, focalLength;
    if (frame <= 55) {
      // Wide street shot tracking car arrival
      const p = frame / 55;
      camPos = { x: -60 + p * 80, y: -45, z: 640 };
      targetX = car3dX * 0.5 + 40;
      targetY = -10;
      targetZ = 0;
      focalLength = 50;
    } else if (frame <= 95) {
      // Dolly in on curbside boarding
      const p = (frame - 55) / 40;
      camPos = { x: 20 - p * 60, y: -45 + p * 10, z: 640 - p * 120 };
      targetX = -60;
      targetY = -15;
      targetZ = 0;
      focalLength = 55;
    } else if (frame <= 150) {
      // Intimate Cockpit Two-Shot of Luke & Elena talking
      camPos = { x: -172, y: -20, z: 350 };
      targetX = -172;
      targetY = -15;
      targetZ = 0;
      focalLength = 65;
    } else {
      // Pursuit chase tracking as car accelerates into the night
      const p = (frame - 150) / (totalFrames - 150);
      camPos = { x: car3dX - 250 - p * 120, y: -50 - p * 15, z: 520 + p * 140 };
      targetX = car3dX + 50;
      targetY = -15;
      targetZ = 0;
      focalLength = 50;
    }

    const dx = targetX - camPos.x;
    const dy = targetY - camPos.y;
    const dz = targetZ - camPos.z;
    const yaw = Math.atan2(-dx, -dz) * 180 / Math.PI;
    const distXZ = Math.hypot(dx, dz);
    const pitch = Math.atan2(dy, distXZ) * 180 / Math.PI;
    const camDist = Math.hypot(dx, dy, dz);

    camOrbitKeys.push([frame, {
      enabled: true,
      position: camPos,
      rotation: { x: pitch, y: yaw, z: 0 },
      focalLength,
      sensorWidth: 36,
      projection: 'perspective',
      near: 1,
      far: 15000,
      focusDistance: camDist,
      aperture: 0,
      fStop: 8.0,
      depthOfField: false,
      exposure: 1.25,
      ambient: 0.42,
      keyLight: { direction: { x: -0.45, y: -0.65, z: -0.85 }, color: '#fff7ed', intensity: 1.45, castShadows: true },
      shadow: { enabled: true, softness: 10, opacity: 0.42, depth: 56 }
    }]);

    // G. DIALOGUE SUBTITLES
    // Luke: Frames 105 - 128
    subLukeKeys.push([frame, frame >= 105 && frame <= 128 ? 1 : 0, 'step']);
    // Elena: Frames 130 - 150
    subElenaKeys.push([frame, frame >= 130 && frame <= 150 ? 1 : 0, 'step']);
  }

  // Register all tracks
  addTrack('car-root', 'transform', carRootKeys);
  addTrack('car-door-hinge', 'transform', carDoorKeys);
  addTrack('cam-arrival-wide', 'camera3d', camOrbitKeys);
  addTrack('layer-wheel-fl', 'transform3d', wheelFLKeys);
  addTrack('layer-wheel-fr', 'transform3d', wheelFRKeys);
  addTrack('layer-wheel-rl', 'transform3d', wheelRLKeys);
  addTrack('layer-wheel-rr', 'transform3d', wheelRRKeys);
  addTrack('girl-root', 'transform', girlRootKeys);
  addTrack('girl-head', 'transform', girlHeadKeys);
  addTrack('girl-arm-left', 'transform', girlArmLKeys);
  addTrack('layer-girl-legs', 'opacity', girlLegsOpacityKeys);
  addTrack('layer-girl-skirt', 'opacity', girlSkirtOpacityKeys);
  addTrack('driver-root', 'transform', driverRootKeys);
  addTrack('driver-head', 'transform', driverHeadKeys);
  addTrack('layer-subtitle-luke', 'opacity', subLukeKeys);
  addTrack('layer-subtitle-elena', 'opacity', subElenaKeys);

  const clip = {
    id: 'clip-city-pickup',
    name: 'City Lights · 3D Car & Girl Pickup Scene',
    fps,
    startFrame: 0,
    endFrame: totalFrames,
    loopMode: 'once',
    tracks,
    setupPose: {}
  };

  project.animations.push(clip);

  return project;
}

async function saveProject(context, targetPath, project) {
  const output = context.resolvePath ? context.resolvePath(targetPath) : targetPath;
  await writeFile(output, `${JSON.stringify(project, null, 2)}\n`);
  return output;
}

export default defineMcpPlugin({
  id: 'city-pickup-plugin',
  version: '1.0.0',
  tools: [
    {
      name: 'animate_city_car_pickup',
      description: 'Generate an animated 3D sports car night scene with curbside pickup of a pretty girl in a one-shoulder dress talking to a handsome driver.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Destination project JSON file path (e.g. city-car-pickup.json)' },
          duration: { type: 'number', description: 'Duration in seconds (default: 8)' },
          fps: { type: 'number', description: 'Frames per second (default: 24)' },
          carColor: { type: 'string', description: 'Car body hex color (default: #1e1b4b)' }
        }
      },
      execute: async (args, context) => {
        const parsed = objectArguments(args);
        const targetPath = parsed.path ?? 'city-car-pickup.json';
        const project = await buildCityPickupScene(parsed);
        const saved = await saveProject(context, targetPath, project);
        return jsonToolResult({
          output: saved,
          layers: project.layers.length,
          tracks: project.animations[0].tracks.length,
          cameras: project.cameras.length,
          characters: ['Elena (Pretty Girl, One-Shoulder Dress)', 'Luke (Handsome Driver, Blazer)']
        });
      }
    }
  ]
});

// Standalone CLI execution
if (process.argv[1] && process.argv[1].endsWith('city-pickup-story.mjs')) {
  const target = process.argv[2] ?? 'city-car-pickup.json';
  buildCityPickupScene().then(async project => {
    await writeFile(target, `${JSON.stringify(project, null, 2)}\n`);
    console.log(`[city-pickup] Successfully generated ${target} with ${project.layers.length} layers, ${project.animations[0].tracks.length} tracks, and True 3D camera!`);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
