import { createId } from './Rig';
import type { Rig } from './Rig';
import type { VectorShape } from './model';

export type VillagePropKind = 'path' | 'tree' | 'house' | 'well' | 'fence' | 'sign';

export interface VillageSceneItem {
  id: string;
  name: string;
  kind: VillagePropKind;
  layerKind: 'props' | 'vegetation';
  accent: string;
  x: number;
  y: number;
  scale: number;
  depth: number;
}

export interface VillageSceneResult {
  items: VillageSceneItem[];
}

type Point = { x: number; y: number };
type Palette = { primary: string; secondary: string; detail: string };

const shapeId = () => createId('village-shape');
const rect = (x: number, y: number, width: number, height: number, fill: string, stroke = 'none', strokeWidth = 1.5): VectorShape => ({ id: shapeId(), kind: 'rect', x, y, width, height, fill, stroke, strokeWidth });
const ellipse = (x: number, y: number, radiusX: number, radiusY: number, fill: string, stroke = 'none', strokeWidth = 1.5): VectorShape => ({ id: shapeId(), kind: 'ellipse', x, y, radiusX, radiusY, fill, stroke, strokeWidth });
const polygon = (points: Point[], fill: string, stroke = 'none', strokeWidth = 1.5): VectorShape => ({ id: shapeId(), kind: 'polygon', points, fill, stroke, strokeWidth, lineJoin: 'round' });
const path = (d: string, fill = 'none', stroke = 'none', strokeWidth = 1.5): VectorShape => ({ id: shapeId(), kind: 'path', d, fill, stroke, strokeWidth, lineCap: 'round', lineJoin: 'round' });

function houseShapes(palette: Palette, townhouse = false): VectorShape[] {
  const wallTop = townhouse ? -92 : -82;
  const roofPeak = townhouse ? -150 : -137;
  const windowFill = townhouse ? '#a9d7d0' : '#b9ddd0';
  return [
    ellipse(0, 6, 78, 12, '#102a2a33'),
    rect(-64, wallTop, 128, 82, palette.primary, '#503d42', 2),
    rect(-68, -8, 136, 12, palette.detail, '#644c47', 2),
    polygon([{ x: -78, y: wallTop + 2 }, { x: 0, y: roofPeak }, { x: 78, y: wallTop + 2 }], palette.secondary, '#3b303b', 3),
    path(`M-68 ${wallTop + 3}L0 ${roofPeak + 12}L68 ${wallTop + 3}`, 'none', '#e8bc88', 2),
    rect(35, roofPeak + 8, 16, 39, '#7b554e', '#45363c', 2),
    rect(31, roofPeak + 4, 24, 7, '#e3ac7f', '#45363c', 2),
    rect(-14, -57, 28, 53, '#744b48', '#4c373c', 2),
    path('M0 -55V-7', 'none', palette.detail, 1.5),
    ellipse(8, -31, 3, 3, '#f1c77e'),
    rect(-49, -61, 29, 25, windowFill, palette.detail, 2),
    rect(20, -61, 29, 25, windowFill, palette.detail, 2),
    path('M-34 -61V-36M-49 -48H-20M35 -61V-36M20 -48H49', 'none', palette.detail, 1.5),
    rect(-53, -29, 37, 7, palette.detail, '#79544e', 1),
    rect(16, -29, 37, 7, palette.detail, '#79544e', 1),
    ...(townhouse ? [
      rect(-16, -113, 32, 22, windowFill, palette.detail, 2),
      path('M0 -113V-91M-16 -102H16', 'none', palette.detail, 1.5),
    ] : []),
  ];
}

function treeShapes(palette: Palette, pine = false): VectorShape[] {
  if (pine) {
    return [
      ellipse(0, 5, 55, 10, '#102b2b33'),
      rect(-8, -73, 16, 76, palette.secondary, '#4c3831', 2),
      polygon([{ x: 0, y: -164 }, { x: -47, y: -78 }, { x: 47, y: -78 }], palette.primary, '#315d4a', 2),
      polygon([{ x: 0, y: -130 }, { x: -58, y: -38 }, { x: 58, y: -38 }], palette.primary, '#315d4a', 2),
      polygon([{ x: 0, y: -96 }, { x: -68, y: -5 }, { x: 68, y: -5 }], palette.primary, '#315d4a', 2),
      path('M-23 -72L-4 -84M16 -48L42 -58M-33 -22L-8 -36', 'none', palette.detail, 3),
      ellipse(-17, -95, 8, 5, palette.detail),
    ];
  }
  return [
    ellipse(3, 6, 58, 11, '#102b2b33'),
    path('M-10 3Q-18 -56 -5 -112L12 -112Q20 -54 10 3Z', palette.secondary, '#4d3930', 2),
    path('M0 -57Q-30 -85 -53 -94M5 -48Q30 -80 54 -87', 'none', palette.secondary, 8),
    ellipse(-35, -101, 40, 37, palette.primary, '#315d4a', 2),
    ellipse(26, -104, 45, 41, palette.primary, '#315d4a', 2),
    ellipse(0, -132, 45, 40, palette.primary, '#315d4a', 2),
    ellipse(-18, -139, 11, 8, palette.detail),
    ellipse(35, -99, 9, 7, palette.detail),
    path('M-52 -80Q-4 -58 48 -77', 'none', '#b8e09d66', 2),
  ];
}

function wellShapes(palette: Palette): VectorShape[] {
  return [
    ellipse(0, 5, 43, 10, '#102a2a33'),
    rect(-36, -42, 72, 43, palette.secondary, '#4b3731', 2),
    ellipse(0, -42, 36, 11, '#5f5044', '#3d3130', 2),
    ellipse(0, -42, 25, 6, '#162d32', '#c99765', 2),
    rect(-42, -82, 8, 42, palette.secondary, '#4b3731', 2),
    rect(34, -82, 8, 42, palette.secondary, '#4b3731', 2),
    polygon([{ x: -50, y: -80 }, { x: 0, y: -114 }, { x: 50, y: -80 }], palette.primary, '#48363a', 2),
    path('M-25 -80H25M0 -110V-47', 'none', palette.detail, 2),
    ellipse(0, -50, 5, 5, '#e9c479'),
  ];
}

function fenceShapes(palette: Palette): VectorShape[] {
  const shapes: VectorShape[] = [
    rect(-96, -38, 192, 6, palette.secondary, '#4f3930', 1.5),
    rect(-96, -18, 192, 6, palette.secondary, '#4f3930', 1.5),
  ];
  [-88, -44, 0, 44, 88].forEach(x => shapes.push(rect(x - 5, -55, 10, 58, palette.detail, '#5a4135', 1.5), polygon([{ x: x - 5, y: -55 }, { x, y: -67 }, { x: x + 5, y: -55 }], palette.detail, '#5a4135', 1.5)));
  return shapes;
}

function signShapes(palette: Palette): VectorShape[] {
  return [
    ellipse(0, 4, 28, 7, '#102a2a33'),
    rect(-5, -60, 10, 61, palette.secondary, '#49372f', 1.5),
    polygon([{ x: -38, y: -76 }, { x: 38, y: -76 }, { x: 31, y: -39 }, { x: -31, y: -39 }], palette.primary, '#4c3835', 2),
    path('M-22 -58H22M-17 -49H17', 'none', palette.detail, 2),
  ];
}

function pathShapes(): VectorShape[] {
  return [
    polygon([{ x: -54, y: 8 }, { x: 58, y: 8 }, { x: 118, y: -270 }, { x: -18, y: -270 }], '#c4976a', '#e2c18d', 2),
    path('M-6 -16L15 -16M-12 -64L25 -64M-17 -115L35 -115M-13 -168L46 -168M-7 -220L56 -220', 'none', '#efd6a477', 3),
  ];
}

type VillageDefinition = Omit<VillageSceneItem, 'id'> & { shapes: VectorShape[] };

const VILLAGE_DEFINITIONS: VillageDefinition[] = [
  {
    name: 'Village road', kind: 'path', layerKind: 'props', accent: '#c4976a',
    x: 400, y: 518, scale: 1, depth: -140, shapes: pathShapes(),
  },
  {
    name: 'North oak', kind: 'tree', layerKind: 'vegetation', accent: '#62ad6b',
    x: 118, y: 395, scale: .78, depth: -40, shapes: treeShapes({ primary: '#4b9560', secondary: '#76503a', detail: '#d4b66e' }),
  },
  {
    name: 'East pine', kind: 'tree', layerKind: 'vegetation', accent: '#4b9b78',
    x: 685, y: 408, scale: .7, depth: -28, shapes: treeShapes({ primary: '#357f6e', secondary: '#604536', detail: '#a8cf91' }, true),
  },
  {
    name: 'Willow cottage', kind: 'house', layerKind: 'props', accent: '#d98f68',
    x: 238, y: 390, scale: .82, depth: 18, shapes: houseShapes({ primary: '#d98f68', secondary: '#6c4750', detail: '#f3d7a4' }),
  },
  {
    name: 'Village hall', kind: 'house', layerKind: 'props', accent: '#b8c9c4',
    x: 423, y: 376, scale: 1.08, depth: 30, shapes: houseShapes({ primary: '#a9c4c7', secondary: '#38566b', detail: '#e6d6a9' }, true),
  },
  {
    name: 'Meadow cottage', kind: 'house', layerKind: 'props', accent: '#d4a778',
    x: 594, y: 402, scale: .78, depth: 22, shapes: houseShapes({ primary: '#d0a276', secondary: '#78504d', detail: '#f0d39c' }),
  },
  {
    name: 'Village well', kind: 'well', layerKind: 'props', accent: '#c9a274',
    x: 296, y: 462, scale: .68, depth: 48, shapes: wellShapes({ primary: '#8f6c73', secondary: '#765644', detail: '#efc27c' }),
  },
  {
    name: 'Garden fence', kind: 'fence', layerKind: 'props', accent: '#c99b68',
    x: 166, y: 472, scale: .72, depth: 38, shapes: fenceShapes({ primary: '#d8ae78', secondary: '#8c6047', detail: '#edcc91' }),
  },
  {
    name: 'South oak', kind: 'tree', layerKind: 'vegetation', accent: '#6bb16d',
    x: 748, y: 492, scale: .48, depth: 52, shapes: treeShapes({ primary: '#579c61', secondary: '#76503a', detail: '#e0c17a' }),
  },
  {
    name: 'Welcome sign', kind: 'sign', layerKind: 'props', accent: '#d9b36f',
    x: 650, y: 472, scale: .72, depth: 44, shapes: signShapes({ primary: '#6b9a72', secondary: '#6e4d3b', detail: '#f3d28c' }),
  },
];

/** Create a fully editable village made from independent native vector layers. */
export function addVillageScene(rig: Rig): VillageSceneResult {
  const items: VillageSceneItem[] = [];
  VILLAGE_DEFINITIONS.forEach((definition, index) => {
    const id = rig.addVectorLayer(`Village · ${definition.name}`, definition.shapes);
    const layer = rig.layers.get(id);
    if (!layer) return;
    layer.local.x = definition.x;
    layer.local.y = definition.y;
    layer.local.scaleX = definition.scale;
    layer.local.scaleY = definition.scale;
    layer.depth = definition.depth;
    layer.parallax = definition.kind === 'path' ? .75 : 1;
    layer.zIndex = definition.kind === 'path' ? -20 : 20 + index;
    // Keep a native XYZ transform ready for the environment inspector. It is
    // deliberately zeroed so the 2D authored placement remains the source of
    // truth until the user enables the true 3D stage.
    layer.transform3d = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };
    items.push({
      id,
      name: definition.name,
      kind: definition.kind,
      layerKind: definition.layerKind,
      accent: definition.accent,
      x: definition.x,
      y: definition.y,
      scale: definition.scale,
      depth: definition.depth,
    });
  });
  rig.update();
  return { items };
}
