import { createDemoRig } from './demoRig';
import { createId } from './Rig';
import type { VectorShape } from './model';

/** Explicitly loaded depth-separated artwork, making camera orbit visible. */
export function createStageDemo() {
  const rig = createDemoRig();
  rig.name = 'Pip · 2.5D view-angle demo';
  const shape = (value: Omit<VectorShape, 'id'>): VectorShape => ({ id: createId('shape'), ...value });
  const backgroundId = rig.addVectorLayer('Background · mountains (−240 depth)', [
    shape({ kind: 'rect', x: -330, y: -210, width: 660, height: 420, fill: '#263c50' }),
    shape({ kind: 'ellipse', x: 190, y: -120, radiusX: 43, radiusY: 43, fill: '#e5b376' }),
    shape({ kind: 'polygon', points: [{ x: -330, y: 120 }, { x: -175, y: -110 }, { x: -20, y: 120 }], fill: '#496879' }),
    shape({ kind: 'polygon', points: [{ x: -85, y: 135 }, { x: 95, y: -60 }, { x: 310, y: 135 }], fill: '#385866' }),
    shape({ kind: 'rect', x: -330, y: 130, width: 660, height: 80, fill: '#294a4b' }),
  ]);
  const background = rig.vectors.get(backgroundId)!;
  background.local.x = 400; background.local.y = 260;
  background.depth = -240; background.parallax = 0.35; background.zIndex = -1;

  const foregroundId = rig.addVectorLayer('Foreground · trail markers (+180 depth)', [
    shape({ kind: 'rect', x: -315, y: 94, width: 19, height: 90, fill: '#d9a365', stroke: '#283b45', strokeWidth: 3 }),
    shape({ kind: 'polygon', points: [{ x: -340, y: 86 }, { x: -263, y: 86 }, { x: -246, y: 106 }, { x: -263, y: 126 }, { x: -340, y: 126 }], fill: '#83cbb8', stroke: '#283b45', strokeWidth: 3 }),
    shape({ kind: 'ellipse', x: 277, y: 178, radiusX: 48, radiusY: 22, fill: '#49746a' }),
    shape({ kind: 'ellipse', x: 290, y: 151, radiusX: 23, radiusY: 39, fill: '#75b3a0', stroke: '#283b45', strokeWidth: 3 }),
    shape({ kind: 'ellipse', x: 255, y: 162, radiusX: 22, radiusY: 31, fill: '#5e9589', stroke: '#283b45', strokeWidth: 3 }),
  ]);
  const foreground = rig.vectors.get(foregroundId)!;
  foreground.local.x = 400; foreground.local.y = 260;
  foreground.depth = 180; foreground.parallax = 1.4;
  rig.setStage2D({ enabled: true, yaw: 0, pitch: 0, roll: 0, perspective: 0.2, zoom: 0.9 });
  rig.metadata.stageDemo = 'Background −240 / character 0 / foreground +180; orbit the camera to see depth-plane separation.';
  rig.update();
  return rig;
}
