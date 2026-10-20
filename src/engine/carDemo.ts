import { identity } from './math';
import type { Transform2D } from './math';
import { createId, Rig } from './Rig';
import type {
  ActionLibraryItem,
  AnimationClip,
  ControllerBinding,
  ControllerDefinition,
  ControllerStateDefinition,
  ControllerTransition,
  VectorShape,
} from './model';

/**
 * Build the self-contained vector car used by the controller examples.
 *
 * This is deliberately authored as ordinary project data rather than as a
 * renderer-specific object.  That keeps it useful to the canvas, serializer,
 * headless controller tests, and any future export format alike.
 */
export function createCarDemo(): Rig {
  const rig = new Rig();
  rig.name = 'Original vector car · controller demo';
  rig.canvas = { width: 800, height: 520, background: '#dbe7ee' };
  rig.metadata = {
    example: 'Original vector car controller demo',
    description: 'A centered, hand-authored vector car with throttle, steering, reverse, and brake actions.',
    rigType: 'car',
    art: 'original vector shapes only',
  };

  const ink = '#17283a';
  const tire = '#152331';
  const tireHighlight = '#344b5b';
  const bodyBlue = '#3478b9';
  const bodyBlueDark = '#245681';
  const glass = '#bfe8f3';
  const cream = '#fff1ce';
  const amber = '#f4b84a';
  const red = '#e8615a';

  const shape = (kind: VectorShape['kind'], values: Omit<VectorShape, 'id' | 'kind'>): VectorShape => ({
    id: createId('shape'),
    kind,
    ...values,
  });
  const path = (d: string, fill: string, stroke = ink, strokeWidth = 3): VectorShape =>
    shape('path', { d, fill, stroke, strokeWidth });
  const ellipse = (x: number, y: number, radiusX: number, radiusY: number, fill: string, stroke = 'none', strokeWidth = 0): VectorShape =>
    shape('ellipse', { x, y, radiusX, radiusY, fill, stroke, strokeWidth });

  // The root is at the visual centre of the 800×520 canvas.  Its local +X
  // direction points toward the front of the car.
  const chassisId = rig.addBone(null, 'Chassis', 310);
  const chassis = rig.bones.get(chassisId)!;
  chassis.local = { ...identity(), x: 400, y: 252 };

  const addChildBone = (parentId: string, name: string, x: number, y: number, length: number): string => {
    const id = rig.addBone(parentId, name, length);
    const bone = rig.bones.get(id)!;
    bone.local = { ...identity(), x, y };
    return id;
  };

  // Separate steering pivots make the front wheels visibly steerable while
  // preserving independent Wheel FL/FR rotation targets.
  const steeringFLId = addChildBone(chassisId, 'Steering FL', 132, 55, 24);
  const steeringFRId = addChildBone(chassisId, 'Steering FR', 132, 78, 24);
  const steeringRLId = addChildBone(chassisId, 'Steering RL', -132, 55, 24);
  const steeringRRId = addChildBone(chassisId, 'Steering RR', -132, 78, 24);
  const wheelFLId = addChildBone(steeringFLId, 'Wheel FL', 0, 0, 62);
  const wheelFRId = addChildBone(steeringFRId, 'Wheel FR', 0, 0, 62);
  const wheelRLId = addChildBone(steeringRLId, 'Wheel RL', 0, 0, 62);
  const wheelRRId = addChildBone(steeringRRId, 'Wheel RR', 0, 0, 62);

  rig.update();

  const attach = (boneId: string, name: string, shapes: VectorShape[]): string => {
    const layerId = rig.addVectorLayer(name, shapes);
    const layer = rig.vectors.get(layerId)!;
    // Factory art is authored in bone-local coordinates.  Avoid Rig.bind's
    // editor-time pose-preserving offset because identity is the intended
    // serialization for this authored asset.
    layer.local = identity();
    layer.boundBoneId = boneId;
    rig.bindings.set(layerId, {
      id: createId('binding'),
      layerId,
      imageId: layerId,
      boneId,
      bindOffset: identity(),
    });
    return layerId;
  };

  const wheelArt = (accent: string): VectorShape[] => [
    ellipse(0, 0, 35, 35, tire, ink, 3),
    ellipse(0, 0, 26, 26, tireHighlight, ink, 2),
    ellipse(0, 0, 16, 16, accent, ink, 2),
    ellipse(0, 0, 6, 6, ink),
    path('M -20 -10 L 20 10 M -20 10 L 20 -10', 'none', '#91adbb', 2),
  ];

  // Four independent vector layers are intentionally retained even though
  // the rear/front pair shares the same silhouette from this view.
  attach(wheelFLId, 'Wheel FL', wheelArt(amber));
  attach(wheelFRId, 'Wheel FR', wheelArt('#e79d3f'));
  attach(wheelRLId, 'Wheel RL', wheelArt(amber));
  attach(wheelRRId, 'Wheel RR', wheelArt('#e79d3f'));

  const undercarriageId = attach(chassisId, 'Chassis undercarriage', [
    path('M -185 18 Q -160 47 -119 54 L 126 54 Q 164 48 188 16 L 177 4 L -174 4 Z', bodyBlueDark),
    path('M -172 28 L 174 28', 'none', ink, 4),
    ellipse(-168, 24, 8, 5, red, ink, 2),
    ellipse(170, 24, 8, 5, red, ink, 2),
  ]);
  const bodyId = attach(chassisId, 'Car body', [
    path('M -198 7 Q -191 -35 -154 -49 L -84 -63 Q -40 -70 6 -69 L 101 -62 Q 151 -56 180 -20 L 201 7 Q 204 26 188 35 L -186 35 Q -204 27 -198 7 Z', bodyBlue, ink, 4),
    path('M -83 -57 Q -46 -104 6 -106 L 71 -100 Q 105 -95 131 -61 L 98 -59 L 70 -86 L 8 -91 L -43 -85 L -64 -56 Z', bodyBlueDark, ink, 3),
    path('M -56 -59 L -37 -82 L 3 -88 L 3 -60 Z', glass, ink, 3),
    path('M 10 -60 L 10 -88 L 65 -82 L 91 -60 Z', glass, ink, 3),
    path('M -142 -25 L -91 -31 M 105 -31 L 157 -25', 'none', '#76b9db', 5),
    path('M -171 14 L 163 14', 'none', bodyBlueDark, 4),
    ellipse(160, -5, 10, 7, cream, ink, 2),
    ellipse(-171, -5, 10, 7, red, ink, 2),
  ]);
  const trimId = attach(chassisId, 'Car trim and grille', [
    path('M -194 31 Q 0 46 194 31', 'none', ink, 3),
    path('M 178 -1 L 198 4 L 198 22 L 177 18 Z', cream, ink, 2),
    path('M -194 4 L -180 -2 L -180 18 L -198 22 Z', red, ink, 2),
    path('M 171 12 L 191 12 M 174 17 L 191 17', 'none', ink, 2),
    ellipse(0, 18, 10, 6, amber, ink, 2),
  ]);
  void undercarriageId;
  void bodyId;
  void trimId;

  rig.update();

  const transformTrack = (targetId: string, start: Transform2D, end: Transform2D) => ({
    id: createId('track'),
    targetId,
    property: 'transform' as const,
    keyframes: [
      { id: createId('key'), frame: 0, value: { ...start }, easing: 'ease-in-out' as const },
      { id: createId('key'), frame: 24, value: { ...end }, easing: 'ease-in-out' as const },
    ],
  });

  const allBones = [...rig.bones.values()];
  const makeClip = (name: string, edit: (bone: typeof allBones[number], start: Transform2D, end: Transform2D) => void): AnimationClip => ({
    id: createId('animation'),
    name,
    fps: 24,
    startFrame: 0,
    endFrame: 24,
    tracks: allBones.map((bone) => {
      const start = { ...bone.local };
      const end = { ...bone.local };
      edit(bone, start, end);
      return transformTrack(bone.id, start, end);
    }),
  });

  const wheelNames = new Set(['Wheel FL', 'Wheel FR', 'Wheel RL', 'Wheel RR']);
  const steeringNames = new Set(['Steering FL', 'Steering FR', 'Steering RL', 'Steering RR']);
  const setWheelSpin = (bone: typeof allBones[number], start: Transform2D, end: Transform2D, amount: number): void => {
    if (wheelNames.has(bone.name)) {
      start.rotation = 0;
      end.rotation = amount;
    } else if (steeringNames.has(bone.name)) {
      start.rotation = 0;
      end.rotation = 0;
    }
  };

  const idle = makeClip('Car Idle', (bone, start, end) => {
    if (bone.name === 'Chassis') end.y -= 1.5;
    setWheelSpin(bone, start, end, 0);
  });
  const drive = makeClip('Car Drive', (bone, start, end) => {
    if (bone.name === 'Chassis') { end.x += 3; end.y -= 1; }
    setWheelSpin(bone, start, end, Math.PI * 0.8);
  });
  const reverse = makeClip('Car Reverse', (bone, start, end) => {
    if (bone.name === 'Chassis') { end.x -= 2; end.y += 1; }
    setWheelSpin(bone, start, end, -Math.PI * 0.65);
  });
  const brake = makeClip('Car Brake', (bone, start, end) => {
    if (bone.name === 'Chassis') { start.y -= 1; end.y += 2; }
    setWheelSpin(bone, start, end, 0);
  });
  rig.animations = [idle, drive, reverse, brake];

  const actions: Array<{ clip: AnimationClip; loop: boolean }> = [
    { clip: idle, loop: true },
    { clip: drive, loop: true },
    { clip: reverse, loop: true },
    { clip: brake, loop: false },
  ];
  const actionLibrary: ActionLibraryItem[] = actions.map(({ clip, loop }) => ({
    id: createId('action'),
    name: clip.name,
    clipId: clip.id,
    loop,
    speed: 1,
  }));
  rig.actionLibrary = actionLibrary;

  const actionId = (name: string): string => actionLibrary.find(action => action.name === name)!.id;
  const binding = (
    inputId: string,
    parameter: string,
    targetId: string | undefined,
    scale: number,
    options: Partial<Pick<ControllerBinding, 'deadzone' | 'invert' | 'priority' | 'component'>> = {},
  ): ControllerBinding => ({
    inputId,
    actionId: '',
    ...(targetId ? { targetId } : {}),
    parameter,
    scale,
    deadzone: options.deadzone ?? 0.08,
    invert: options.invert ?? false,
    ...(options.priority === undefined ? {} : { priority: options.priority }),
    ...(options.component === undefined ? {} : { component: options.component }),
  });

  const states: ControllerStateDefinition[] = [
    { id: 'idle', name: 'Idle', actionId: actionId('Car Idle'), priority: 0, conditions: [], loop: true },
    { id: 'reverse', name: 'Reverse', actionId: actionId('Car Reverse'), priority: 20,
      conditions: [{ inputId: 'throttle', operator: '<', threshold: -0.08 }], loop: true },
    { id: 'drive', name: 'Drive', actionId: actionId('Car Drive'), priority: 20,
      conditions: [{ inputId: 'throttle', operator: '>', threshold: 0.08 }], loop: true },
    { id: 'brake', name: 'Brake', actionId: actionId('Car Brake'), priority: 40,
      conditions: [{ inputId: 'brake', operator: 'pressed' }], loop: false },
  ];
  const transitions: ControllerTransition[] = [];
  const controller: ControllerDefinition = {
    id: createId('controller'),
    name: 'Car controller · throttle and steering',
    type: 'car',
    inputs: [
      { id: 'throttle', name: 'Throttle', type: 'axis', defaultValue: 0 },
      { id: 'steer', name: 'Steering', type: 'axis', defaultValue: 0 },
      { id: 'brake', name: 'Brake', type: 'button', defaultValue: false },
    ],
    bindings: [
      // Speed accumulates into a small world-space translation, so a held
      // throttle is visible even while the selected clip loops in place.
      binding('throttle', 'speed', chassisId, 115),
      binding('steer', 'steer', chassisId, 0.34, { deadzone: 0.05 }),
      binding('steer', 'steer', steeringFLId, 0.55, { deadzone: 0.05 }),
      binding('steer', 'steer', steeringFRId, 0.55, { deadzone: 0.05 }),
      binding('throttle', 'wheelRotation', wheelFLId, 6, { deadzone: 0 }),
      binding('throttle', 'wheelRotation', wheelFRId, 6, { deadzone: 0 }),
      binding('throttle', 'wheelRotation', wheelRLId, 6, { deadzone: 0 }),
      binding('throttle', 'wheelRotation', wheelRRId, 6, { deadzone: 0 }),
    ],
    states,
    transitions,
    initialStateId: 'idle',
  };
  rig.controllers = [controller];

  rig.setTimeline({
    currentFrame: 0,
    currentTime: 0,
    isPlaying: false,
    loop: true,
    fps: 24,
    startFrame: 0,
    endFrame: 24,
    activeAnimationId: idle.id,
  });
  rig.update();
  return rig;
}
