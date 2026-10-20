import type { Rig } from '../engine/Rig';
import { physicsBodies } from '../engine/dynamics';
import { localToWorldPoint } from '../engine/math';

export function drawDynamicsOverlay(ctx: CanvasRenderingContext2D, rig: Rig, zoom: number): void {
  if (!rig.dynamicsDebugVisible || rig.getStageView().enabled) return;
  ctx.save(); ctx.strokeStyle = '#eab86b'; ctx.fillStyle = '#eab86b'; ctx.lineWidth = 1.5 / zoom; ctx.setLineDash([5 / zoom, 4 / zoom]);
  for (const body of physicsBodies(rig)) {
    ctx.save(); ctx.translate(body.x, body.y); ctx.rotate(body.rotation);
    ctx.beginPath();
    if (body.shape === 'circle') ctx.arc(0, 0, body.radius, 0, Math.PI * 2);
    else ctx.rect(-body.width / 2, -body.height / 2, body.width, body.height);
    ctx.stroke(); ctx.restore();
  }
  ctx.strokeStyle = '#84d6c4'; ctx.fillStyle = '#84d6c4'; ctx.setLineDash([]);
  for (const item of rig.dynamics.bones.filter(item => item.enabled)) {
    const bone = rig.bones.get(item.boneId); if (!bone) continue;
    const tip = localToWorldPoint(bone.world, { x: bone.length, y: 0 });
    ctx.beginPath(); ctx.moveTo(bone.world.x, bone.world.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(tip.x, tip.y, 4 / zoom, 0, Math.PI * 2); ctx.fill();
  }
  for (const item of rig.dynamics.meshes.filter(item => item.enabled)) {
    const points = rig.getMeshVertices(item.layerId);
    for (const index of item.pinned) { const point = points[index]; if (point) { ctx.beginPath(); ctx.rect(point.x - 3 / zoom, point.y - 3 / zoom, 6 / zoom, 6 / zoom); ctx.fill(); } }
  }
  for (const emitter of rig.dynamics.emitters.filter(item => item.enabled)) {
    const target = emitter.targetId ? rig.bones.get(emitter.targetId) ?? rig.layers.get(emitter.targetId) : undefined;
    const point = target ? localToWorldPoint(target.world, emitter) : emitter;
    ctx.beginPath(); ctx.arc(point.x, point.y, 8 / zoom, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
