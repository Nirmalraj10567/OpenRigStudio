import { identity } from './math';
import type { LipSyncCue, VectorShape, Viseme } from './model';
import { createId, Rig } from './Rig';

/** Original face and hand-authored mouth timing. This example contains no recording. */
export function createLipSyncDemo(): Rig {
  const rig = new Rig();
  rig.name = 'Milo · mouth animation study';
  rig.canvas = { width: 800, height: 520, background: '#202020' };
  rig.metadata = {
    example: 'Milo — an original nine-shape vector mouth study',
    description: 'Five seconds of hand-authored viseme cues, with a gently moving head. No speech recording or automatic phoneme recognition. Scrub the timeline or play to preview; import your own audio and Rhubarb cues for actual dialogue.',
  };
  const ellipse = (x: number, y: number, radiusX: number, radiusY: number, fill: string, stroke = 'none', strokeWidth = 3): VectorShape =>
    ({ id: createId('shape'), kind: 'ellipse', x, y, radiusX, radiusY, fill, stroke, strokeWidth });
  const path = (d: string, fill: string, stroke = 'none', strokeWidth = 3): VectorShape =>
    ({ id: createId('shape'), kind: 'path', d, fill, stroke, strokeWidth });
  const body = rig.addVectorLayer('Milo · jacket', [
    path('M -84 62 Q -80 -6 -31 -14 L 31 -14 Q 80 -6 84 62 Z', '#60bdb1', '#343047'),
    path('M -29 -12 L 0 16 L 29 -12 L 18 -28 L -18 -28 Z', '#ffd2a3', '#343047'),
    path('M 0 18 L 0 60', 'none', '#368d88', 2),
    ellipse(9, 29, 3, 3, '#f7e8c0'), ellipse(9, 46, 3, 3, '#f7e8c0'),
  ]);
  rig.layers.get(body)!.local = { ...identity(), x: 400, y: 354 };
  const head = rig.addBone(null, 'Milo · head', 70);
  rig.bones.get(head)!.local = { ...identity(), x: 400, y: 307 };
  rig.bones.get(head)!.color = '#f2bc82';
  rig.update();
  const addHeadLayer = (name: string, shapes: VectorShape[], x: number, y: number) => {
    const id = rig.addVectorLayer(name, shapes);
    rig.layers.get(id)!.local = { ...identity(), x, y };
    rig.bind(id, head);
    return id;
  };
  addHeadLayer('Milo · face and ears', [
    ellipse(-76, 9, 15, 23, '#f1b888', '#343047'), ellipse(76, 9, 15, 23, '#f1b888', '#343047'),
    ellipse(0, 0, 77, 89, '#ffd2a3', '#343047'),
    ellipse(-49, 31, 15, 9, '#ee9a91'), ellipse(49, 31, 15, 9, '#ee9a91'),
    path('M -76 -25 Q -91 -78 -40 -85 Q -7 -111 30 -85 Q 75 -89 78 -23 Q 53 -60 19 -58 Q -26 -30 -48 -55 Q -56 -30 -76 -25 Z', '#55526b', '#343047'),
  ], 400, 232);
  addHeadLayer('Milo · eyes and brows', [
    ellipse(-27, 0, 8, 12, '#343047'), ellipse(27, 0, 8, 12, '#343047'),
    ellipse(-29, -4, 2.5, 3, '#fff7e7'), ellipse(25, -4, 2.5, 3, '#fff7e7'),
    path('M -40 -23 Q -27 -31 -14 -23 M 14 -23 Q 27 -31 40 -23', 'none', '#343047', 4),
    path('M 0 6 L -5 18 Q 0 23 5 18', 'none', '#cb8c78', 2),
  ], 400, 232);
  const mouth = rig.createMouthSet('Milo · mouth', head, { x: 400, y: 282 })!;
  const timing: Array<[number, number, Viseme]> = [
    [0, 0.30, 'X'], [0.30, 0.55, 'A'], [0.55, 0.85, 'C'], [0.85, 1.10, 'B'],
    [1.10, 1.40, 'D'], [1.40, 1.70, 'E'], [1.70, 2.05, 'F'], [2.05, 2.40, 'X'],
    [2.40, 2.65, 'G'], [2.65, 2.95, 'C'], [2.95, 3.25, 'H'], [3.25, 3.55, 'D'],
    [3.55, 3.80, 'B'], [3.80, 4.10, 'E'], [4.10, 4.40, 'A'], [4.40, 5, 'X'],
  ];
  const cues: LipSyncCue[] = timing.map(([start, end, viseme]) => ({ id: createId('cue'), start, end, viseme }));
  rig.setLipSyncCues(mouth, cues);
  const animationId = createId('animation');
  rig.animations = [{
    id: animationId, name: 'Milo · five-second mouth study', fps: 24, startFrame: 0, endFrame: 120,
    tracks: [{ id: createId('track'), targetId: head, property: 'rotation', keyframes:
      [[0, 0], [30, -0.055], [60, 0.045], [90, -0.025], [120, 0]].map(([frame, value]) =>
        ({ id: createId('key'), frame, value, easing: 'ease-in-out' as const })),
    }],
  }];
  rig.setTimeline({ activeAnimationId: animationId, currentFrame: 0, startFrame: 0, endFrame: 120, fps: 24 });
  rig.update();
  return rig;
}
