import { Rig } from '../engine/Rig';
import { renderCompositedCanvas } from '../engine/compositor';
import { onionSkinFrames, normalizeOnionSkinSettings } from '../engine/onionSkin';
import type { OnionSkinSettings } from '../engine/onionSkin';
import { drawBoneOverlay } from './boneOverlay';
import type { AnimationClip } from '../engine/model';

export interface OnionSkinRenderOptions {
  settings: OnionSkinSettings;
  frame: number;
  startFrame: number;
  endFrame: number;
  playing: boolean;
  selectedId: string | null;
  showBones: boolean;
  stageWidth: number;
  stageHeight: number;
}

function cloneAtBaseline(rig: Rig): { project: ReturnType<Rig['toProject']>; clipId: string } | null {
  const source = rig.toProject();
  const baseline = new Rig(source);
  const clipId = baseline.timeline.activeAnimationId;
  const clip = clipId ? baseline.animations.find(item => item.id === clipId) : undefined;
  if (!clipId || !clip) return null;
  baseline.setTimeline({ currentFrame: clip.startFrame, isPlaying: false });
  baseline.applyAnimation(clip, clip.startFrame);
  return { project: baseline.toProject(), clipId };
}

function animatedLayerIds(rig: Rig, clip: AnimationClip | undefined): Set<string> | undefined {
  if (!clip) return undefined;
  const animatedTargets = new Set(clip.tracks.map(track => track.targetId));
  rig.characterViews.filter(set => animatedTargets.has(set.id)).flatMap(set => set.targetIds).forEach(id => animatedTargets.add(id));
  const animatedGroups = new Set([...rig.groups.keys()].filter(id => animatedTargets.has(id)));
  const groupContainsAnimated = (groupId: string, visited = new Set<string>()): boolean => {
    if (visited.has(groupId)) return false;
    visited.add(groupId);
    const group = rig.groups.get(groupId);
    if (!group) return false;
    return group.childIds.some(child => rig.layers.has(child)
      ? animatedTargets.has(child) || Boolean(rig.layers.get(child)?.boundBoneId && animatedTargets.has(rig.layers.get(child)!.boundBoneId!))
      : animatedGroups.has(child) || groupContainsAnimated(child, visited));
  };
  const included = new Set<string>();
  rig.layers.forEach(layer => {
    const boundBoneAnimated = Boolean(layer.boundBoneId && animatedTargets.has(layer.boundBoneId));
    let parentAnimated = false;
    let parent = layer.parentGroupId;
    while (parent) {
      if (animatedGroups.has(parent) || groupContainsAnimated(parent)) { parentAnimated = true; break; }
      parent = rig.groups.get(parent)?.parentGroupId ?? null;
    }
    if (animatedTargets.has(layer.id) || boundBoneAnimated || parentAnimated) included.add(layer.id);
  });
  return included.size ? new Set([...rig.layers.keys()].filter(id => !included.has(id))) : undefined;
}

/** Render editor-only neighboring frames without touching the live rig. */
export function renderOnionSkin(
  destination: CanvasRenderingContext2D,
  rig: Rig,
  assets: ReadonlyMap<string, HTMLImageElement>,
  options: OnionSkinRenderOptions,
): ReadonlySet<string> | undefined {
  const settings = normalizeOnionSkinSettings(options.settings);
  if (!settings.enabled || options.playing && !settings.showWhilePlaying) return undefined;
  const frames = onionSkinFrames(options.frame, options.startFrame, options.endFrame, settings);
  if (!frames.length) return undefined;
  const baseline = cloneAtBaseline(rig);
  if (!baseline) return undefined;

  const onlyLayerId = settings.activeLayerOnly && options.selectedId && rig.layers.has(options.selectedId)
    ? options.selectedId
    : undefined;
  const ghost = new Rig(baseline.project);
  const clip = ghost.animations.find(item => item.id === baseline.clipId);
  if (!clip) return undefined;
  const excludeLayerIds = animatedLayerIds(ghost, clip);
  if (excludeLayerIds?.size) renderCompositedCanvas(destination, rig, assets, { onlyLayerIds: excludeLayerIds });
  const surface = document.createElement('canvas');
  surface.width = options.stageWidth;
  surface.height = options.stageHeight;
  const ghostContext = surface.getContext('2d');
  if (!ghostContext) return;
  for (const ghostFrame of frames) {
    ghost.setTimeline({ currentFrame: ghostFrame.frame, isPlaying: false });
    ghost.applyAnimation(clip, ghostFrame.frame);
    ghostContext.setTransform(1, 0, 0, 1, 0, 0);
    ghostContext.clearRect(0, 0, surface.width, surface.height);
    ghostContext.save();
    renderCompositedCanvas(ghostContext, ghost, assets, { onlyLayerId, excludeLayerIds });
    if (options.showBones && !ghost.getStageView().enabled && !onlyLayerId) {
      drawBoneOverlay(ghostContext, ghost, { zoom: 1, selectedId: null, names: false, pose: false });
    }
    ghostContext.restore();

    ghostContext.setTransform(1, 0, 0, 1, 0, 0);
    ghostContext.globalCompositeOperation = 'source-in';
    ghostContext.fillStyle = ghostFrame.tint;
    ghostContext.fillRect(0, 0, surface.width, surface.height);
    ghostContext.globalCompositeOperation = 'source-over';

    destination.save();
    destination.globalAlpha = ghostFrame.opacity;
    destination.drawImage(surface, 0, 0);
    destination.restore();
  }
  return excludeLayerIds;
}
