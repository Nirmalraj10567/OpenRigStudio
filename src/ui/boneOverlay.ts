import type { Rig } from '../engine/Rig';

export function poseChainIds(rig: Rig, boneId: string | null, length?: number): string[] {
  // The highlight and keyed joints must exactly match the engine's IK boundary.
  return boneId ? rig.getPoseBoneIds(boneId, length) : [];
}

/** Bone width, joints, labels and hit handles stay the same size on screen. */
export function drawBoneOverlay(ctx: CanvasRenderingContext2D, rig: Rig, options: {
  zoom: number;
  selectedId: string | null;
  mappedId?: string | null;
  names: boolean;
  pose: boolean;
  chainLength?: number;
}) {
  const chain = new Set(options.pose ? poseChainIds(rig, options.selectedId, options.chainLength) : []);
  for (const bone of rig.bones.values()) {
    const tip = rig.getBoneEnd(bone.id);
    if (!tip) continue;
    const dx = tip.x - bone.world.x;
    const dy = tip.y - bone.world.y;
    const length = Math.hypot(dx, dy) * options.zoom;
    const selected = bone.id === options.selectedId;
    const mapped = bone.id === options.mappedId;
    const amber = selected || mapped;
    const color = amber ? '#ffc66c' : '#62d5ca';
    const angle = Math.atan2(dy, dx);
    const shoulder = Math.min(12, length * 0.22);
    const width = Math.min(selected ? 4.5 : 3.5, length * 0.12);
    ctx.save();
    ctx.translate(bone.world.x, bone.world.y);
    ctx.scale(1 / options.zoom, 1 / options.zoom);
    ctx.rotate(angle);
    ctx.globalAlpha = bone.locked ? 0.45 : 1;
    if (chain.has(bone.id) && !selected) {
      ctx.strokeStyle = '#ffc66c80';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(5, -7);
      ctx.lineTo(Math.max(5, length - 5), -7);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(shoulder, -width);
    ctx.lineTo(length, 0);
    ctx.lineTo(shoulder, width);
    ctx.closePath();
    ctx.fillStyle = amber ? 'rgba(245,180,75,.19)' : 'rgba(39,155,150,.18)';
    ctx.fill();
    ctx.lineWidth = selected ? 1.5 : 1.15;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(length, 0);
    ctx.stroke();
    ctx.fillStyle = '#182a2c';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, selected ? 2.8 : 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (options.pose) {
      ctx.beginPath();
      ctx.arc(length, 0, selected ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = selected ? color : '#183231';
      ctx.fill();
      ctx.stroke();
    }
    if (options.names) {
      ctx.rotate(-angle);
      ctx.font = '10px Inter, system-ui, sans-serif';
      const text = `${bone.name}${bone.locked ? ' · locked' : ''}`;
      const x = dx * options.zoom * 0.5 + 8;
      const y = dy * options.zoom * 0.5 - 9;
      ctx.fillStyle = 'rgba(15,22,28,.86)';
      ctx.fillRect(x - 4, y - 10, ctx.measureText(text).width + 8, 15);
      ctx.fillStyle = amber ? '#ffdaa0' : '#b6e7e2';
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  }
}

export function drawSmartActionGuide(ctx: CanvasRenderingContext2D, rig: Rig, actionId: string | null, zoom: number): void {
  if (!rig.smartAngleGuides || !actionId) return;
  const action = rig.smartActions.find(item => item.id === actionId), driver = action && rig.bones.get(action.driverBoneId);
  if (!action || !driver) return;
  const start = Math.min(action.startAngle, action.endAngle), end = Math.max(action.startAngle, action.endAngle);
  const radius = 30 / zoom;
  ctx.save();
  ctx.translate(driver.world.x, driver.world.y);
  ctx.strokeStyle = '#ffc66c'; ctx.fillStyle = 'rgba(255,198,108,.1)'; ctx.lineWidth = 1.5 / zoom;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius, start, end); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#8de8d8'; ctx.setLineDash([4 / zoom, 4 / zoom]);
  [start, end, action.neutralAngle ?? action.startAngle].forEach(angle => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius); ctx.stroke(); });
  ctx.restore();
}
