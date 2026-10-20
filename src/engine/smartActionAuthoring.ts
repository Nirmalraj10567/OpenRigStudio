import type { Rig } from './Rig';
import type { SmartActionKey } from './model';
let sequence = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++sequence}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function createSmartFolder(rig: Rig, name: string, parentId: string | null = null): string | null {
  if (rig.smartEditingActionId || parentId && !rig.smartActionFolders.some(folder => folder.id === parentId)) return null;
  const id = uid('action-folder'); rig.smartActionFolders.push({ id, name: name.trim() || 'Actions', parentId }); return id;
}
export function removeSmartFolder(rig: Rig, id: string): boolean {
  const folder = rig.smartActionFolders.find(item => item.id === id); if (!folder || rig.smartEditingActionId) return false;
  rig.smartActionFolders.forEach(item => { if (item.parentId === id) item.parentId = folder.parentId; });
  rig.smartActions.forEach(action => { if (action.folderId === id) action.folderId = folder.parentId; });
  rig.smartActionFolders = rig.smartActionFolders.filter(item => item.id !== id); return true;
}

export function duplicateSmartAction(rig: Rig, actionId: string, mirror = false, driverId?: string, targetMap: Record<string, string> = {}): string | null {
  const source = rig.smartActions.find(action => action.id === actionId);
  if (!source || rig.smartEditingActionId || rig.smartActions.length >= 256 || driverId && !rig.bones.has(driverId)) return null;
  const action = clone(source); action.id = uid('smart'); action.name += mirror ? ' · mirrored' : ' · copy';
  action.driverBoneId = driverId ?? source.driverBoneId;
  if (mirror) {
    action.startAngle = -source.endAngle; action.endAngle = -source.startAngle; action.neutralAngle = -(source.neutralAngle ?? source.startAngle);
    action.baseline = Object.fromEntries(Object.entries(source.baseline).map(([id, state]) => [targetMap[id] ?? id, clone(state)]));
    action.keys = source.keys.map(key => ({ ...clone(key), angle: -key.angle, thumbnail: undefined,
      viewAngles: key.viewAngles && Object.fromEntries(Object.entries(key.viewAngles).map(([id, angle]) => [id, -angle])),
      targets: Object.fromEntries(Object.entries(key.targets).map(([id, delta]) => [targetMap[id] ?? id, {
        ...clone(delta), ...(delta.transform ? { transform: { ...delta.transform, x: -(delta.transform.x ?? 0), rotation: -(delta.transform.rotation ?? 0) } } : {}),
        ...(delta.mesh ? { mesh: delta.mesh.map(point => ({ x: -point.x, y: point.y })) } : {}),
      }])) })).sort((a, b) => a.angle - b.angle);
  }
  delete action.baseline[action.driverBoneId]; action.keys.forEach(key => delete key.targets[action.driverBoneId]);
  rig.smartActions.push(action); rig.update(); return action.id;
}
export function copySmartKeys(rig: Rig, actionId: string, angles: number[]): SmartActionKey[] {
  const action = rig.smartActions.find(item => item.id === actionId);
  return clone(action?.keys.filter(key => angles.includes(key.angle)) ?? []);
}
export function pasteSmartKeys(rig: Rig, actionId: string, keys: SmartActionKey[], atAngle: number): boolean {
  const action = rig.smartActions.find(item => item.id === actionId);
  if (!action || rig.smartEditingActionId || !keys.length || !Number.isFinite(atAngle) || keys.some(key => !Number.isFinite(key.angle))) return false;
  const offset = atAngle - Math.min(...keys.map(key => key.angle));
  const pasted = clone(keys).map(key => ({ ...key, angle: key.angle + offset,
    targets: Object.fromEntries(Object.entries(key.targets).filter(([id, delta]) => id !== action.driverBoneId && action.baseline[id] && (!delta.mesh || delta.mesh.length === action.baseline[id].mesh?.length))) }));
  if (pasted.some(key => key.angle < Math.min(action.startAngle, action.endAngle) || key.angle > Math.max(action.startAngle, action.endAngle))) return false;
  action.keys = [...action.keys.filter(key => !pasted.some(item => item.angle === key.angle)), ...pasted].sort((a, b) => a.angle - b.angle);
  rig.update(); return true;
}
export function moveSmartKey(rig: Rig, actionId: string, from: number, to: number): boolean {
  const action = rig.smartActions.find(item => item.id === actionId), key = action?.keys.find(item => item.angle === from);
  if (!action || !key || rig.smartEditingActionId || !Number.isFinite(to) || to < Math.min(action.startAngle, action.endAngle) || to > Math.max(action.startAngle, action.endAngle)) return false;
  action.keys = [...action.keys.filter(item => item.angle !== from && item.angle !== to), { ...key, angle: to }].sort((a, b) => a.angle - b.angle); rig.update(); return true;
}

export function createTurnControl(rig: Rig, kind: 'head' | 'body'): string | null {
  if (rig.smartEditingActionId) return null;
  const driverId = rig.addBone(null, kind === 'head' ? 'Head_Turn' : 'Body_Turn', 55), driver = rig.bones.get(driverId)!;
  driver.local.x = rig.canvas.width - 120; driver.local.y = kind === 'head' ? 100 : 200;
  const id = rig.createSmartAction(kind === 'head' ? 'Head turn' : 'Body turn', driverId, -Math.PI, Math.PI)!;
  const action = rig.smartActions.find(item => item.id === id)!;
  action.neutralAngle = 0; action.limitDriver = true;
  const matching = rig.characterViews.filter(set => new RegExp(kind, 'i').test(set.name));
  action.viewSetIds = matching.map(set => set.id);
  const selectedIds = new Set(matching.flatMap(set => set.targetIds));
  if (selectedIds.size) action.baseline = Object.fromEntries(Object.entries(action.baseline).filter(([target]) => selectedIds.has(target)));
  else action.baseline = Object.fromEntries(Object.entries(action.baseline).filter(([target]) => {
    const name = rig.layers.get(target)?.name ?? rig.bones.get(target)?.name ?? rig.groups.get(target)?.name ?? '';
    const head = /head|face|eye|brow|nose|mouth|ear|hair/i.test(name); return kind === 'head' ? head : !head;
  }));
  action.keys = [-Math.PI, 0, Math.PI].map(angle => ({ angle, targets: {}, viewAngles: Object.fromEntries(matching.map(set => [set.id, angle * 180 / Math.PI])) }));
  rig.update(); return id;
}
