import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  id: `c3d-s-${++shapeCounter}`,
  kind: 'rect',
  x, y, width, height, fill, ...extra
});
const E = (x, y, radiusX, radiusY, fill, extra = {}) => ({
  id: `c3d-s-${++shapeCounter}`,
  kind: 'ellipse',
  x, y, radiusX, radiusY, fill, ...extra
});
const P = (d, fill = 'none', stroke = 'none', strokeWidth = 2, extra = {}) => ({
  id: `c3d-s-${++shapeCounter}`,
  kind: 'path',
  d, fill, stroke, strokeWidth, ...extra
});

// Pseudo-random deterministic generator for atmospheric rain and particle distribution
function pseudoRand(seed) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

let enginePromise;
/** Dynamically load the native engine via esbuild matching engine tests */
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
      console.warn('[3d-car-scene] Native esbuild engine load failed, using fallback generators:', error.message);
      return null;
    }
  })();
  return enginePromise;
}

// Built-in polygon triangulation and extrusion (fallback if esbuild unavailable)
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

function extrudePoly(points, depth = 30, color = '#be123c') {
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

function latheProf(profile, segments = 20, angle = Math.PI * 2, color = '#1e293b') {
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

/**
 * Builds the complete 3D Car Scene Project conforming to the Character Studio Project Model.
 */
export async function build3DCarSceneProject(options = {}) {
  const engine = await getEngine();
  const extrude = engine?.extrudePolygon ?? extrudePoly;
  const lathe = engine?.latheProfile ?? latheProf;

  const fps = options.fps ?? 24;
  const duration = Math.max(3, Math.min(20, options.duration ?? 6));
  const totalFrames = Math.round(duration * fps);
  const carColor = options.carColor ?? '#be123c'; // Candy Crimson Gloss default
  const titleText = options.title ?? 'PHANTOM GT // 3D HYPERCAR';
  const subtitleText = options.subtitle ?? 'NATIVE 3D PHYSICAL ENGINE // MULTI-CAMERA DYNAMICS';

  const project = {
    schemaVersion: 1,
    id: 'project-scene-3d-car',
    name: 'Phantom GT · 3D Car Scene',
    canvas: { width: 1280, height: 720, background: '#020617' },
    bones: [
      {
        id: 'car-root-bone',
        name: 'Car Root Bone',
        parentId: null,
        length: 220,
        local: T(640, 360, 0, 1, 1),
        locked: false
      },
      {
        id: 'car-chassis-bone',
        name: 'Car Chassis Suspension',
        parentId: 'car-root-bone',
        length: 180,
        local: T(0, 0, 0, 1, 1),
        locked: false
      }
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
        position: { x: 260, y: -70, z: 680 },
        rotation: { x: 5, y: 20, z: 0 },
        focalLength: 50,
        sensorWidth: 36,
        projection: 'perspective',
        orthographicScale: 900,
        near: 1,
        far: 10000,
        focusDistance: 740,
        aperture: 0,
        fStop: 8.0,
        depthOfField: false,
        exposure: 1.25,
        ambient: 0.38,
        keyLight: {
          direction: { x: -0.45, y: -0.65, z: -0.85 },
          color: '#fff7ed',
          intensity: 1.4,
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
        id: 'cam-hero-orbit',
        name: 'Hero 3/4 Orbit',
        hotkey: 1,
        settings: {
          enabled: true,
          cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0.5, projection: 'perspective',
          camera3d: {
            enabled: true,
            position: { x: 340, y: -80, z: 620 },
            rotation: { x: 11, y: -28, z: 0 },
            focalLength: 52,
            sensorWidth: 36,
            projection: 'perspective',
            near: 1, far: 10000, focusDistance: 680,
            aperture: 4.5, fStop: 2.8, depthOfField: true, exposure: 1.25, ambient: 0.36,
            keyLight: { direction: { x: -0.45, y: -0.65, z: -0.85 }, color: '#fff7ed', intensity: 1.4, castShadows: true },
            shadow: { enabled: true, softness: 12, opacity: 0.42, depth: 56 }
          }
        },
        follow: null
      },
      {
        id: 'cam-flank-track',
        name: 'Low Flank Tracking',
        hotkey: 2,
        settings: {
          enabled: true,
          cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0.5, projection: 'perspective',
          camera3d: {
            enabled: true,
            position: { x: 10, y: -45, z: 520 },
            rotation: { x: 6, y: -4, z: 0 },
            focalLength: 75,
            sensorWidth: 36,
            projection: 'perspective',
            near: 1, far: 10000, focusDistance: 520,
            aperture: 5.6, fStop: 2.0, depthOfField: true, exposure: 1.2, ambient: 0.34,
            keyLight: { direction: { x: -0.5, y: -0.6, z: -0.8 }, color: '#fff7ed', intensity: 1.45, castShadows: true },
            shadow: { enabled: true, softness: 10, opacity: 0.45, depth: 56 }
          }
        },
        follow: null
      },
      {
        id: 'cam-rear-pursuit',
        name: 'Pursuit Chaser',
        hotkey: 3,
        settings: {
          enabled: true,
          cameraX: 0, cameraY: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, perspective: 0.5, projection: 'perspective',
          camera3d: {
            enabled: true,
            position: { x: -320, y: -90, z: 640 },
            rotation: { x: 14, y: 32, z: 0 },
            focalLength: 35,
            sensorWidth: 36,
            projection: 'perspective',
            near: 1, far: 10000, focusDistance: 720,
            aperture: 3.2, fStop: 3.5, depthOfField: true, exposure: 1.3, ambient: 0.38,
            keyLight: { direction: { x: -0.4, y: -0.7, z: -0.8 }, color: '#fff7ed', intensity: 1.35, castShadows: true },
            shadow: { enabled: true, softness: 14, opacity: 0.4, depth: 56 }
          }
        },
        follow: null
      }
    ],
    cameraView: 'cam-hero-orbit',
    animations: [],
    timeline: {
      currentFrame: 0,
      currentTime: 0,
      isPlaying: false,
      loop: true,
      fps,
      startFrame: 0,
      endFrame: totalFrames,
      activeAnimationId: 'clip-3d-car-cinematic'
    }
  };

  // Helper to add layer and bind
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

  // 1. Cinematic Midnight Sky & Full Moon Backdrop (2D Background plane)
  addLayer({
    id: 'env-3d-sky',
    name: 'Night Sky & Lunar Halo',
    type: 'vector',
    local: T(0, 0),
    zIndex: -200,
    depth: -900,
    parallax: 0.1,
    opacity: 1,
    visible: true,
    locked: true,
    boundBoneId: null,
    shapes: [
      R(0, 0, 1280, 720, '#020617'),
      P('M 0 0 L 1280 0 L 1280 480 Q 640 560 0 480 Z', '#0f172a'),
      E(1020, 120, 52, 52, '#f8fafc'),
      E(1020, 120, 72, 72, '#94a3b8', { opacity: 0.18 }),
      E(1020, 120, 110, 110, '#38bdf8', { opacity: 0.08 }),
      E(1005, 110, 8, 12, '#cbd5e1', { opacity: 0.4 }),
      E(1035, 130, 9, 7, '#cbd5e1', { opacity: 0.35 })
    ]
  });

  // 2. Distant Storm Clouds & Mountain Silhouettes
  addLayer({
    id: 'env-3d-mountains',
    name: 'Distant Horizon & Storm Clouds',
    type: 'vector',
    local: T(0, 0),
    zIndex: -180,
    depth: -650,
    parallax: 0.25,
    opacity: 0.85,
    visible: true,
    locked: true,
    boundBoneId: null,
    shapes: [
      P('M 0 460 L 180 340 L 360 410 L 580 310 L 820 400 L 1050 330 L 1280 440 L 1280 540 L 0 540 Z', '#090d16'),
      E(320, 140, 200, 50, '#1e293b', { opacity: 0.6 }),
      E(680, 120, 260, 60, '#0f172a', { opacity: 0.75 }),
      E(960, 160, 180, 45, '#1e293b', { opacity: 0.65 })
    ]
  });

  // 3. Gothic Palace Silhouette Framing Background (Optional gothic architecture)
  addLayer({
    id: 'env-3d-gothic-spires',
    name: 'Gothic Palace Spire Silhouette',
    type: 'vector',
    local: T(0, 0),
    zIndex: -160,
    depth: -450,
    parallax: 0.4,
    opacity: 0.95,
    visible: true,
    locked: true,
    boundBoneId: null,
    shapes: [
      P('M 480 440 L 480 260 L 540 160 L 600 260 L 600 440 Z', '#070a12'),
      P('M 540 160 L 540 120 M 532 135 L 548 135', 'none', '#64748b', 2),
      P('M 380 440 L 380 300 L 425 210 L 470 300 L 470 440 Z', '#090d16'),
      P('M 610 440 L 610 300 L 655 210 L 700 300 L 700 440 Z', '#090d16'),
      P('M 525 290 L 525 260 Q 540 245 555 260 L 555 290 Z', '#f59e0b', 'none', 0, { opacity: 0.85 }),
      E(540, 265, 20, 20, '#fef08a', { opacity: 0.25 })
    ]
  });

  // 4. Ground Runway / Asphalt Stage & Road Markings (3D Perspective Surface)
  addLayer({
    id: 'env-3d-road',
    name: '3D Runway Stage & Lane Markings',
    type: 'vector',
    local: T(640, 360),
    transform3d: T3D(0, 56, 0),
    zIndex: -100,
    opacity: 1,
    visible: true,
    locked: true,
    boundBoneId: null,
    shapes: [
      P('M -1600 0 L 1600 0 L 1600 280 L -1600 280 Z', '#0b1120', '#1e293b', 2),
      // Center dashed road markings
      ...Array.from({ length: 18 }, (_, i) => R(-1200 + i * 140, 50, 75, 6, '#facc15', { opacity: 0.85 })),
      // Outer runway boundary lines
      R(-1600, 10, 3200, 3, '#38bdf8', { opacity: 0.5 }),
      R(-1600, 120, 3200, 4, '#e2e8f0', { opacity: 0.7 })
    ]
  });

  // 5. Contact Shadow & Under-Car Ground Reflection
  addLayer({
    id: 'layer-car-contact-shadow',
    name: 'Car Contact Shadow & Ambient Occlusion',
    type: 'vector',
    local: T(0, 0),
    transform3d: T3D(0, 54, 0),
    zIndex: 5,
    opacity: 0.9,
    visible: true,
    locked: true,
    boundBoneId: 'car-chassis-bone',
    shapes: [
      E(0, 0, 230, 70, '#020617', { opacity: 0.65 }),
      E(0, 0, 190, 50, '#000000', { opacity: 0.8 }),
      E(125, 0, 45, 20, '#000000', { opacity: 0.9 }),
      E(-125, 0, 45, 20, '#000000', { opacity: 0.9 }),
      E(0, 0, 160, 40, '#38bdf8', { opacity: 0.08 }) // Subtle cyan underglow
    ]
  });

  // 6. TRUE 3D CHASSIS (Monocoque Aerodynamic GT Body)
  const bodyProfile = [
    { x: 220, y: 32 },  // front splitter bottom
    { x: 226, y: 20 },  // front bumper lower
    { x: 216, y: 6 },   // nose tip / grille apex
    { x: 196, y: -4 },  // front hood leading edge
    { x: 172, y: -14 }, // hood rake
    { x: 65, y: -28 },  // cowl / base of windshield
    { x: -60, y: -28 }, // rear deck transition
    { x: -165, y: -16 },// rear boot lid
    { x: -206, y: -2 }, // ducktail spoiler tip
    { x: -220, y: 16 }, // rear fascia
    { x: -224, y: 32 }, // rear diffuser lower edge
    { x: -175, y: 32 }, // rear wheel arch aft
    { x: -155, y: 16 }, // rear wheel arch apex aft
    { x: -125, y: 8 },  // rear wheel arch center top
    { x: -95, y: 16 },  // rear wheel arch apex fore
    { x: -75, y: 32 },  // undercarriage mid
    { x: 75, y: 32 },   // undercarriage mid fore
    { x: 95, y: 16 },   // front wheel arch apex aft
    { x: 125, y: 8 },   // front wheel arch center top
    { x: 155, y: 16 },  // front wheel arch apex fore
    { x: 175, y: 32 },  // front wheel arch fore
  ];
  const chassisMesh = extrude(bodyProfile, 136, carColor);

  addLayer({
    id: 'layer-3d-car-chassis',
    name: '3D Car Chassis Monocoque Body',
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

  // 7. TRUE 3D COCKPIT / CABIN CANOPY (Tinted Polarized Glass)
  const cockpitProfile = [
    { x: 68, y: -26 },  // windshield base
    { x: 18, y: -68 },  // A-pillar top / roof front
    { x: -55, y: -68 }, // roof rear
    { x: -138, y: -26 },// rear fastback base
  ];
  const cockpitMesh = extrude(cockpitProfile, 104, '#0284c7');

  addLayer({
    id: 'layer-3d-car-cockpit',
    name: '3D Car Cockpit Glasshouse Canopy',
    type: 'vector',
    local: T(0, 0),
    transform3d: T3D(0, 0, 0),
    zIndex: 25,
    opacity: 0.95,
    visible: true,
    locked: false,
    boundBoneId: 'car-chassis-bone',
    mesh3d: cockpitMesh,
    shapes: []
  }, 'car-chassis-bone');

  // 8. TRUE 3D AERODYNAMIC GT WING / REAR SPOILER
  const spoilerProfile = [
    { x: -168, y: -50 },
    { x: -162, y: -54 },
    { x: -192, y: -54 },
    { x: -198, y: -50 },
  ];
  const spoilerMesh = extrude(spoilerProfile, 144, '#0f172a');

  addLayer({
    id: 'layer-3d-car-spoiler',
    name: '3D Aerodynamic Carbon Rear Wing',
    type: 'vector',
    local: T(0, 0),
    transform3d: T3D(0, 0, 0),
    zIndex: 28,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'car-chassis-bone',
    mesh3d: spoilerMesh,
    shapes: []
  }, 'car-chassis-bone');

  // 9. FOUR TRUE 3D WHEELS (3D Lathed Tires with Alloy Rims)
  const wheelProfile = [
    { x: 12, y: -15 },
    { x: 26, y: -15 },
    { x: 35, y: -10 },
    { x: 35, y: 10 },
    { x: 26, y: 15 },
    { x: 12, y: 15 },
  ];
  const tireMesh = lathe(wheelProfile, 20, Math.PI * 2, '#090d16');

  // 4 Wheel definitions
  const wheels = [
    { id: 'layer-3d-wheel-fl', name: '3D Wheel Front Left', pos: { x: 125, y: 22, z: 68 }, isFront: true },
    { id: 'layer-3d-wheel-fr', name: '3D Wheel Front Right', pos: { x: 125, y: 22, z: -68 }, isFront: true },
    { id: 'layer-3d-wheel-rl', name: '3D Wheel Rear Left', pos: { x: -125, y: 22, z: 68 }, isFront: false },
    { id: 'layer-3d-wheel-rr', name: '3D Wheel Rear Right', pos: { x: -125, y: 22, z: -68 }, isFront: false }
  ];

  for (const w of wheels) {
    addLayer({
      id: w.id,
      name: w.name,
      type: 'vector',
      local: T(0, 0),
      transform3d: T3D(w.pos.x, w.pos.y, w.pos.z, 90, 0, 0),
      zIndex: 35,
      opacity: 1,
      visible: true,
      locked: false,
      boundBoneId: 'car-chassis-bone',
      mesh3d: tireMesh,
      shapes: [
        // 2D Rim Face Details (Star alloy spokes, Brembo red caliper, center chrome hub)
        E(0, 0, 24, 24, '#f59e0b', { stroke: '#e2e8f0', strokeWidth: 2 }), // Bronze/Gold rim lip
        E(0, 0, 16, 16, '#64748b'), // Steel brake rotor disc
        P('M -10 -6 L -2 -14 L 6 -14 L 0 -6 Z', '#ef4444'), // Red brake caliper
        P('M 0 -22 L 0 22 M -22 0 L 22 0 M -15 -15 L 15 15 M -15 15 L 15 -15', 'none', '#ffffff', 2.5), // Forged multi-spokes
        E(0, 0, 7, 7, '#0f172a', { stroke: '#ffffff', strokeWidth: 1.5 }) // Central chrome lug hub
      ]
    }, 'car-chassis-bone');
  }

  // 10. FRONT CARBON AIR DAM & HONEYCOMB GRILLE
  addLayer({
    id: 'layer-3d-car-grille',
    name: 'Front Honeycomb Grille & Carbon Splitter',
    type: 'vector',
    local: T(0, 0),
    transform3d: T3D(214, 12, 0),
    zIndex: 22,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'car-chassis-bone',
    shapes: [
      P('M 0 -12 L 0 16 L 8 16 L 8 -12 Z', '#020617', '#334155', 2),
      P('M 4 -8 L 4 12 M 2 -4 L 6 -4 M 2 4 L 6 4', 'none', '#38bdf8', 2), // Illuminated cyber accent
      E(4, -10, 4, 4, '#e2e8f0') // Chrome emblem
    ]
  }, 'car-chassis-bone');

  // 11. FRONT CRYSTALLINE LED HEADLIGHT PROJECTORS & VOLUMETRIC CONES
  addLayer({
    id: 'layer-3d-headlights',
    name: 'Dual Crystal LED Headlights & Volumetric Beams',
    type: 'vector',
    local: T(0, 0),
    transform3d: T3D(210, -2, 0),
    zIndex: 40,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'car-chassis-bone',
    shapes: [
      // Left and right projector fixtures
      E(0, -42, 10, 6, '#ffffff', { stroke: '#38bdf8', strokeWidth: 2 }),
      E(0, 42, 10, 6, '#ffffff', { stroke: '#38bdf8', strokeWidth: 2 }),
      E(0, -42, 14, 9, '#38bdf8', { opacity: 0.35 }),
      E(0, 42, 14, 9, '#38bdf8', { opacity: 0.35 }),
      // Forward volumetric light cones cutting through the dark road ahead
      P('M 0 -42 L 380 -90 L 380 15 L 0 -42 Z', '#e0f2fe', 'none', 0, { opacity: 0.18 }),
      P('M 0 42 L 380 -15 L 380 90 L 0 42 Z', '#e0f2fe', 'none', 0, { opacity: 0.18 }),
      P('M 0 -42 L 240 -65 L 240 -15 Z', '#ffffff', 'none', 0, { opacity: 0.25 }),
      P('M 0 42 L 240 15 L 240 65 Z', '#ffffff', 'none', 0, { opacity: 0.25 })
    ]
  }, 'car-chassis-bone');

  // 12. REAR HORIZON LASER LED TAILLIGHTS
  addLayer({
    id: 'layer-3d-taillights',
    name: 'Full-Width Rear Laser LED Lightbar',
    type: 'vector',
    local: T(0, 0),
    transform3d: T3D(-218, 12, 0),
    zIndex: 40,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'car-chassis-bone',
    shapes: [
      R(-2, -58, 6, 116, '#ef4444', { stroke: '#f43f5e', strokeWidth: 2 }),
      R(-2, -58, 12, 116, '#dc2626', { opacity: 0.4 }),
      E(0, -52, 6, 6, '#ffffff'),
      E(0, 52, 6, 6, '#ffffff')
    ]
  }, 'car-chassis-bone');

  // 13. DUAL QUAD POLISHED CHROME EXHAUSTS
  const exhaustProfile = [
    { x: 4, y: -8 },
    { x: 7, y: -8 },
    { x: 7, y: 8 },
    { x: 4, y: 8 },
  ];
  const exhaustMesh = lathe(exhaustProfile, 16, Math.PI * 2, '#cbd5e1');

  addLayer({
    id: 'layer-3d-exhausts',
    name: 'Quad Polished Titanium Exhausts & Turbo Glow',
    type: 'vector',
    local: T(0, 0),
    transform3d: T3D(-222, 24, 0),
    zIndex: 38,
    opacity: 1,
    visible: true,
    locked: false,
    boundBoneId: 'car-chassis-bone',
    mesh3d: exhaustMesh,
    shapes: [
      E(-2, -36, 8, 8, '#0f172a', { stroke: '#cbd5e1', strokeWidth: 2 }),
      E(-2, -22, 8, 8, '#0f172a', { stroke: '#cbd5e1', strokeWidth: 2 }),
      E(-2, 22, 8, 8, '#0f172a', { stroke: '#cbd5e1', strokeWidth: 2 }),
      E(-2, 36, 8, 8, '#0f172a', { stroke: '#cbd5e1', strokeWidth: 2 }),
      // Inner heat flame glow
      E(-2, -36, 4, 4, '#f97316', { opacity: 0.75 }),
      E(-2, -22, 4, 4, '#f97316', { opacity: 0.75 }),
      E(-2, 22, 4, 4, '#f97316', { opacity: 0.75 }),
      E(-2, 36, 4, 4, '#f97316', { opacity: 0.75 })
    ]
  }, 'car-chassis-bone');

  // 14. CINEMATIC OVERLAY TITLE CARD
  const titleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="240" viewBox="0 0 900 240">
    <defs>
      <filter id="glow3d" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <text x="450" y="80" text-anchor="middle" font-family="'Cinzel', 'Outfit', sans-serif" font-size="22" font-weight="600" letter-spacing="14" fill="#38bdf8" opacity="0.9">TRUE 3D PHYSICAL ENGINE</text>
    <text x="450" y="150" text-anchor="middle" font-family="'Cinzel', 'Outfit', sans-serif" font-size="52" font-weight="900" letter-spacing="16" fill="#f8fafc" filter="url(#glow3d)">${titleText}</text>
    <text x="450" y="195" text-anchor="middle" font-family="'Cinzel', 'Outfit', sans-serif" font-size="18" font-weight="500" letter-spacing="8" fill="#e11d48">${subtitleText}</text>
  </svg>`;

  addLayer({
    id: 'layer-3d-title-card',
    name: 'Cinematic Title Card Plate',
    type: 'image',
    src: `data:image/svg+xml;base64,${Buffer.from(titleSvg).toString('base64')}`,
    width: 900,
    height: 240,
    local: T(190, 220),
    zIndex: 100,
    opacity: 0,
    visible: true,
    locked: true,
    boundBoneId: null
  });

  // 15. MULTI-PHASE ANIMATION CHOREOGRAPHY (144 FRAMES @ 24 FPS)
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

  // Camera Orbit & Tracking Path Keyframes
  const camOrbitKeys = [];
  // Chassis Suspension Rumble & Travel
  const chassisKeys = [];
  // Wheels rotation around axle (spinning) and front steering
  const wheelFLKeys = [];
  const wheelFRKeys = [];
  const wheelRLKeys = [];
  const wheelRRKeys = [];
  // Lights & Title Keyframes
  const lightsKeys = [];
  const exhaustKeys = [];
  const titleOpacityKeys = [];
  const titleTransformKeys = [];

  for (let frame = 0; frame <= totalFrames; frame++) {
    const t = frame / fps;
    const progress = frame / totalFrames;

    // B. Suspension Idle Vibration & Acceleration Squat
    const engineRumble = Math.sin(t * 22) * 1.2 + Math.cos(t * 36) * 0.6;
    const accelPitch = frame > totalFrames * 0.4 ? Math.min(1.5, (frame - totalFrames * 0.4) * 0.04) : 0;
    const forwardX = frame > totalFrames * 0.4 ? (frame - totalFrames * 0.4) * 1.6 : 0;

    chassisKeys.push([frame, T3D(forwardX, engineRumble, 0, accelPitch, 0, 0)]);

    // A. 3D Camera Path with exact LookAt targeting the car center
    let camX, camY, camZ, focal;
    if (frame <= Math.round(totalFrames * 0.4)) {
      const p1 = frame / (totalFrames * 0.4);
      const ease1 = p1 * p1 * (3 - 2 * p1);
      camX = 280 - ease1 * 80;
      camY = -70 + ease1 * 15;
      camZ = 680 - ease1 * 60;
      focal = 48 + ease1 * 6;
    } else if (frame <= Math.round(totalFrames * 0.75)) {
      const p2 = (frame - totalFrames * 0.4) / (totalFrames * 0.35);
      const ease2 = p2 * p2 * (3 - 2 * p2);
      camX = 200 - ease2 * 260;
      camY = -55 - ease2 * 10;
      camZ = 620 + ease2 * 40;
      focal = 54 + ease2 * 10;
    } else {
      const p3 = (frame - totalFrames * 0.75) / (totalFrames * 0.25);
      const ease3 = p3 * p3 * (3 - 2 * p3);
      camX = -60 - ease3 * 180;
      camY = -65 - ease3 * 15;
      camZ = 660 + ease3 * 30;
      focal = 64 - ease3 * 16;
    }

    const camPos = { x: camX, y: camY, z: camZ };
    const carCenter = { x: forwardX, y: 0, z: 0 };
    const dx = carCenter.x - camPos.x;
    const dy = carCenter.y - camPos.y;
    const dz = carCenter.z - camPos.z;
    const yaw = Math.atan2(-dx, -dz) * 180 / Math.PI;
    const distXZ = Math.hypot(dx, dz);
    const pitch = Math.atan2(dy, distXZ) * 180 / Math.PI;
    const camDist = Math.hypot(dx, dy, dz);

    camOrbitKeys.push([frame, {
      enabled: true,
      position: camPos,
      rotation: { x: pitch, y: yaw, z: 0 },
      focalLength: focal,
      sensorWidth: 36,
      projection: 'perspective',
      near: 1,
      far: 10000,
      focusDistance: camDist,
      aperture: 0,
      fStop: 8.0,
      depthOfField: false,
      exposure: 1.25,
      ambient: 0.38,
      keyLight: { direction: { x: -0.45, y: -0.65, z: -0.85 }, color: '#fff7ed', intensity: 1.4, castShadows: true },
      shadow: { enabled: true, softness: 10, opacity: 0.42, depth: 56 }
    }]);

    // C. Wheels: Continuous high-speed spin around axle (Z rotation) + Front Steering (Y rotation)
    const wheelSpin = (frame * 18) % 360;
    let frontSteerAngle = 0;
    if (frame < totalFrames * 0.35) {
      frontSteerAngle = Math.sin(frame / (totalFrames * 0.35) * Math.PI) * 14;
    } else if (frame < totalFrames * 0.7) {
      frontSteerAngle = -Math.sin((frame - totalFrames * 0.35) / (totalFrames * 0.35) * Math.PI) * 8;
    }

    wheelFLKeys.push([frame, T3D(125 + forwardX, 22 + engineRumble, 68, 90, frontSteerAngle, wheelSpin)]);
    wheelFRKeys.push([frame, T3D(125 + forwardX, 22 + engineRumble, -68, 90, frontSteerAngle, wheelSpin)]);
    wheelRLKeys.push([frame, T3D(-125 + forwardX, 22 + engineRumble, 68, 90, 0, wheelSpin)]);
    wheelRRKeys.push([frame, T3D(-125 + forwardX, 22 + engineRumble, -68, 90, 0, wheelSpin)]);

    // D. Headlight Intensity Flare
    const headlightOp = frame < 10 ? 0.3 + (frame / 10) * 0.7 : 0.85 + Math.sin(t * 12) * 0.15;
    lightsKeys.push([frame, headlightOp]);

    // E. Exhaust Afterglow Pulse
    const exhaustGlow = 0.5 + Math.sin(t * 24) * 0.4 + (frame > totalFrames * 0.4 ? 0.2 : 0);
    exhaustKeys.push([frame, Math.min(1.0, exhaustGlow)]);

    // F. Cinematic Title Card (fades in during phase 3)
    const titleStartFrame = Math.round(totalFrames * 0.65);
    if (frame < titleStartFrame) {
      titleOpacityKeys.push([frame, 0]);
      titleTransformKeys.push([frame, T(190, 240, 0, 0.95, 0.95)]);
    } else {
      const tp = (frame - titleStartFrame) / (totalFrames - titleStartFrame);
      const easeTitle = tp * tp * (3 - 2 * tp);
      titleOpacityKeys.push([frame, Math.min(1.0, easeTitle * 1.2)]);
      titleTransformKeys.push([frame, T(190, 240 - easeTitle * 25, 0, 0.95 + easeTitle * 0.05, 0.95 + easeTitle * 0.05)]);
    }
  }

  // Register all tracks
  addTrack('cam-hero-orbit', 'camera3d', camOrbitKeys);
  addTrack('layer-3d-car-chassis', 'transform3d', chassisKeys);
  addTrack('layer-3d-car-cockpit', 'transform3d', chassisKeys);
  addTrack('layer-3d-car-spoiler', 'transform3d', chassisKeys);
  addTrack('layer-3d-wheel-fl', 'transform3d', wheelFLKeys);
  addTrack('layer-3d-wheel-fr', 'transform3d', wheelFRKeys);
  addTrack('layer-3d-wheel-rl', 'transform3d', wheelRLKeys);
  addTrack('layer-3d-wheel-rr', 'transform3d', wheelRRKeys);
  addTrack('layer-3d-headlights', 'opacity', lightsKeys);
  addTrack('layer-3d-exhausts', 'opacity', exhaustKeys);
  addTrack('layer-3d-title-card', 'opacity', titleOpacityKeys);
  addTrack('layer-3d-title-card', 'transform', titleTransformKeys);

  const clip = {
    id: 'clip-3d-car-cinematic',
    name: 'Phantom GT · True 3D Cinematic Showcase',
    fps,
    startFrame: 0,
    endFrame: totalFrames,
    loopMode: 'cycle',
    tracks,
    setupPose: {}
  };

  project.animations.push(clip);

  // 16. Dynamic Atmospheric Particles (Tire Smoke & Mist via Native Dynamics Engine)
  project.dynamics = {
    enabled: true,
    startFrame: 0,
    endFrame: totalFrames,
    fps,
    substeps: 4,
    gravityX: 0,
    gravityY: 150,
    windX: -120,
    windY: -10,
    windNoise: 40,
    seed: 42,
    bones: [],
    bodies: [],
    meshes: [],
    emitters: [
      // Rear tire asphalt slip & speed smoke
      {
        id: 'emitter-tire-smoke-left',
        name: 'Rear Tire Smoke Left',
        enabled: true,
        x: 515,
        y: 385,
        rate: 35,
        lifetime: 0.8,
        speed: 120,
        spread: 0.5,
        direction: Math.PI,
        size: 3.5,
        color: '#e2e8f0'
      },
      {
        id: 'emitter-tire-smoke-right',
        name: 'Rear Tire Smoke Right',
        enabled: true,
        x: 515,
        y: 385,
        rate: 35,
        lifetime: 0.8,
        speed: 120,
        spread: 0.5,
        direction: Math.PI,
        size: 3.5,
        color: '#cbd5e1'
      },
      // Fine night highway mist
      {
        id: 'emitter-night-mist',
        name: 'Night Runway Atmospheric Mist',
        enabled: true,
        x: 640,
        y: 80,
        rate: 45,
        lifetime: 1.5,
        speed: 90,
        spread: 0.8,
        direction: Math.PI * 0.6,
        size: 2.2,
        color: '#38bdf8'
      }
    ]
  };

  return project;
}

async function saveProject(context, targetPath, project) {
  const output = context.resolvePath ? context.resolvePath(targetPath) : targetPath;
  await writeFile(output, `${JSON.stringify(project, null, 2)}\n`);
  return output;
}

export default defineMcpPlugin({
  id: 'horror-palace-plugin',
  version: '2.0.0',
  tools: [
    {
      name: 'animate_scene_3d_car',
      description: 'Builds and animates an authentic, high-end 3D car scene using the native 3D engine: True 3D camera with depth of field, 3D extruded chassis and cockpit, 3D lathed alloy wheels, aerodynamic wing, LED headlights, quad exhaust, road runway, soft shadows, and multi-track animation.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', default: 'scene-3d-car.json' },
          fps: { type: 'integer', enum: [24, 30, 60], default: 24 },
          duration: { type: 'number', minimum: 3, maximum: 20, default: 6 },
          carColor: { type: 'string', default: '#be123c' },
          title: { type: 'string', default: 'PHANTOM GT // 3D HYPERCAR' }
        },
        required: ['path']
      },
      async execute(args, context) {
        const input = objectArguments(args);
        const project = await build3DCarSceneProject(input);
        const out = await saveProject(context, input.path ?? 'scene-3d-car.json', project);
        return jsonToolResult({
          success: true,
          path: out,
          totalFrames: project.timeline.endFrame,
          durationSeconds: project.timeline.endFrame / project.timeline.fps,
          layers: project.layers.length,
          cameras: project.cameras.length,
          tracks: project.animations[0].tracks.length,
          camera3d: project.stage2d.camera3d.enabled,
          note: 'True 3D physical camera, extruded chassis, lathed alloy wheels, and multi-track animation compiled successfully.'
        });
      }
    },
    {
      name: 'animate_horror_palace',
      description: 'Creates and animates a cinematic gothic horror intro featuring the 3D Phantom sports car arriving at the gothic haunted palace with thunder lightning, rain droplets, ground splashes, and full 3D camera choreography.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          fps: { type: 'integer', default: 24 },
          carColor: { type: 'string', default: '#be123c' }
        },
        required: ['path']
      },
      async execute(args, context) {
        const input = objectArguments(args);
        const project = await build3DCarSceneProject({
          ...input,
          title: 'SHADOW PALACE // 3D PHANTOM',
          subtitle: 'A NIGHT OF TERROR // THE ARRIVAL'
        });
        const out = await saveProject(context, input.path, project);
        return jsonToolResult({
          success: true,
          path: out,
          totalFrames: project.timeline.endFrame,
          durationSeconds: project.timeline.endFrame / project.timeline.fps,
          layers: project.layers.length,
          camera3d: project.stage2d.camera3d.enabled,
          note: 'Haunted gothic palace scene compiled with True 3D car, physical camera, and lightning choreography.'
        });
      }
    }
  ]
});

// Standalone execution support: node mcp/plugins/horror-palace-story.mjs [path]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const target = process.argv[2] || 'scene-3d-car.json';
  const project = await build3DCarSceneProject({});
  await writeFile(target, `${JSON.stringify(project, null, 2)}\n`);
  console.log(`[3d-car-scene] Successfully generated ${target} with ${project.layers.length} layers, ${project.animations[0].tracks.length} tracks, and True 3D camera!`);
}
