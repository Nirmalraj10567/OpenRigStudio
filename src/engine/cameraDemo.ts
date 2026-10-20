import { createStageDemo } from './stageDemo';
import { addCamera, setCameraCut, updateCameraControls } from './camera';

export function createCameraDemo() {
  const rig = createStageDemo();
  rig.name = 'Pip · animated camera shots';
  const wide = addCamera(rig, 'Wide · establishing')!;
  rig.setTimeline({ currentFrame: 0 });
  updateCameraControls(rig, { cameraX: -55, zoom: .9 }, true, true);
  rig.setTimeline({ currentFrame: 48 });
  updateCameraControls(rig, { cameraX: 35, zoom: 1.05, roll: -3 }, true);
  rig.setTimeline({ currentFrame: 0 });
  rig.cameraOverride = null;
  rig.cameraView = 'preview';
  rig.setStage2D({ cameraX: 0, cameraY: 150, zoom: 1.7 });
  const close = addCamera(rig, 'Close-up · portrait')!;
  rig.cameraView = 'preview';
  rig.setStage2D({ cameraX: 0, cameraY: 0, zoom: .9 });
  const follow = addCamera(rig, 'Follow · courier')!;
  const root = rig.getRoots()[0];
  rig.cameras.find(camera => camera.id === follow)!.follow = { targetId: root.id, anchorX: root.world.x, anchorY: root.world.y };
  const clip = rig.animations.find(item => item.id === rig.timeline.activeAnimationId)!;
  const track = clip.tracks.find(item => item.targetId === root.id && item.property === 'transform')!;
  track.keyframes.push({ id: 'demo-camera-subject-travel', frame: 120, value: { ...root.local, x: root.local.x + 90 }, easing: 'smooth' });
  rig.setTimeline({ currentFrame: 0 }); setCameraCut(rig, wide);
  rig.setTimeline({ currentFrame: 72 }); setCameraCut(rig, close);
  rig.setTimeline({ currentFrame: 96 }); setCameraCut(rig, follow);
  rig.applyAnimation(clip, 0);
  rig.cameraView = 'switch';
  rig.metadata.cameraDemo = 'Wide tracking shot → close-up cut at 72 → follow shot at 96. Camera channels can be retimed in the timeline.';
  return rig;
}
