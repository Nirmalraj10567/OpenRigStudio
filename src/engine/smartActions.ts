import type { Transform2D } from './math';
import type { SmartActionFolder, SmartBoneAction, SmartTargetDelta, SmartTargetState } from './model';
import { MAX_MESH_VERTICES } from './mesh';
import { normalizeMasks, normalizePatch } from './masking';

export const transformChannels: Array<keyof Transform2D> = ['x', 'y', 'rotation', 'scaleX', 'scaleY'];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const points = (value: unknown): value is Array<{ x: number; y: number }> => Array.isArray(value)
  && value.length <= MAX_MESH_VERTICES && value.every(p => record(p) && Number.isFinite(p.x) && Number.isFinite(p.y));

export function smartKeyThumbnail(angle: number, color = '#ffc66c'): string {
  const x = 32 + Math.cos(angle) * 20, y = 32 + Math.sin(angle) * 20;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#18212b"/><circle cx="32" cy="32" r="22" fill="none" stroke="#466171"/><path d="M32 32L${x.toFixed(2)} ${y.toFixed(2)}" stroke="${color}" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="32" r="4" fill="${color}"/></svg>`)}`;
}

/** Invalid imported action data is ignored; old projects need no migration. */
export function normalizeSmartActions(value: unknown): SmartBoneAction[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 256).flatMap((item): SmartBoneAction[] => {
    if (!record(item) || typeof item.id !== 'string' || seen.has(item.id) || typeof item.driverBoneId !== 'string'
      || !Number.isFinite(item.startAngle) || !Number.isFinite(item.endAngle)
      || item.startAngle === item.endAngle || !Array.isArray(item.keys)) return [];
    seen.add(item.id);
    const baseline: Record<string, SmartTargetState> = {};
    if (record(item.baseline)) Object.entries(item.baseline).forEach(([id, state]) => {
      if (id === item.driverBoneId || !record(state) || !record(state.local)
        || !transformChannels.every(c => Number.isFinite((state.local as Record<string, unknown>)[c]))) return;
      baseline[id] = {
        local: { ...(state.local as Transform2D) },
        ...(Number.isFinite(state.opacity) ? { opacity: state.opacity as number } : {}),
        ...(points(state.mesh) ? { mesh: state.mesh.map(p => ({ x: p.x, y: p.y })) } : {}),
        ...(typeof state.visible === 'boolean' ? { visible: state.visible } : {}),
        ...(Number.isFinite(state.zIndex) ? { zIndex: state.zIndex as number } : {}),
        ...(Array.isArray(state.masks) ? { masks: normalizeMasks(state.masks) } : {}),
        ...(state.patch ? { patch: normalizePatch(state.patch) } : {}),
      };
    });
    const viewSetIds = Array.isArray(item.viewSetIds) ? [...new Set(item.viewSetIds.filter((id): id is string => typeof id === 'string'))].slice(0, 32) : [];
    const keys = new Map<number, SmartBoneAction['keys'][number]>();
    item.keys.slice(0, 1024).forEach(key => {
      if (!record(key) || !Number.isFinite(key.angle) || !record(key.targets)) return;
      const targets: Record<string, SmartTargetDelta> = {};
      Object.entries(key.targets).forEach(([id, delta]) => {
        if (id === item.driverBoneId || !baseline[id] || !record(delta)) return;
        const transform: Partial<Transform2D> = {};
        if (record(delta.transform)) transformChannels.forEach(c => {
          if (Number.isFinite((delta.transform as Record<string, unknown>)[c])) transform[c] = (delta.transform as Transform2D)[c];
        });
        targets[id] = {
          ...(Object.keys(transform).length ? { transform } : {}),
          ...(Number.isFinite(delta.opacity) ? { opacity: delta.opacity as number } : {}),
          ...(points(delta.mesh) && delta.mesh.length === baseline[id].mesh?.length
            ? { mesh: delta.mesh.map(p => ({ x: p.x, y: p.y })) } : {}),
          ...(typeof delta.visible === 'boolean' ? { visible: delta.visible } : {}),
          ...(Number.isFinite(delta.zIndex) ? { zIndex: delta.zIndex as number } : {}),
          ...(Array.isArray(delta.masks) ? { masks: normalizeMasks(delta.masks) } : {}),
          ...(delta.patch ? { patch: normalizePatch(delta.patch) } : {}),
        };
      });
      const viewAngles: Record<string, number> = {};
      if (record(key.viewAngles)) Object.entries(key.viewAngles).forEach(([id, value]) => {
        if (viewSetIds.includes(id) && Number.isFinite(value)) viewAngles[id] = value as number;
      });
      keys.set(key.angle as number, { angle: key.angle as number, targets, ...(Object.keys(viewAngles).length ? { viewAngles } : {}),
        easing: key.easing === 'smooth' || key.easing === 'step' ? key.easing : 'linear',
        ...(typeof key.thumbnail === 'string' && key.thumbnail.startsWith('data:image/') && key.thumbnail.length < 200000 ? { thumbnail: key.thumbnail } : {}) });
    });
    return [{ id: item.id, name: typeof item.name === 'string' ? item.name : 'Smart action', driverBoneId: item.driverBoneId,
      startAngle: item.startAngle as number, endAngle: item.endAngle as number, enabled: item.enabled !== false,
      ...(viewSetIds.length ? { viewSetIds } : {}),
      folderId: typeof item.folderId === 'string' ? item.folderId : null,
      blendMode: item.blendMode === 'override' ? 'override' : 'additive',
      weight: Number.isFinite(item.weight) ? Math.max(0, Math.min(1, item.weight as number)) : 1,
      priority: Number.isFinite(item.priority) ? Math.max(-1000, Math.min(1000, item.priority as number)) : 0,
      dependencies: Array.isArray(item.dependencies) ? [...new Set(item.dependencies.filter((id): id is string => typeof id === 'string'))].slice(0, 256) : [],
      neutralAngle: Number.isFinite(item.neutralAngle) ? item.neutralAngle as number : item.startAngle as number,
      limitDriver: item.limitDriver === true,
      baseline, keys: [...keys.values()].sort((a, b) => a.angle - b.angle) }];
  });
}

/** Delta interpolation deliberately does not wrap angles: a dial can span a full turn. */
export function sampleSmartAction(action: SmartBoneAction, driverAngle: number): Record<string, SmartTargetDelta> {
  const keys = [...action.keys].filter(k => Number.isFinite(k.angle)).sort((a, b) => a.angle - b.angle);
  if (!keys.length || !Number.isFinite(driverAngle)) return {};
  const angle = Math.max(Math.min(action.startAngle, action.endAngle), Math.min(Math.max(action.startAngle, action.endAngle), driverAngle));
  let left = keys[0], right = keys[keys.length - 1];
  if (angle <= left.angle) right = left;
  else if (angle >= right.angle) left = right;
  else {
    const i = keys.findIndex(k => k.angle >= angle);
    left = keys[i - 1]; right = keys[i];
  }
  const raw = right.angle === left.angle ? 0 : (angle - left.angle) / (right.angle - left.angle);
  const t = left.easing === 'step' ? 0 : left.easing === 'smooth' ? raw * raw * (3 - 2 * raw) : raw;
  const mix = (a = 0, b = 0) => a + (b - a) * t;
  const result: Record<string, SmartTargetDelta> = {};
  const ids = new Set([...Object.keys(left.targets), ...Object.keys(right.targets)]);
  ids.forEach(id => {
    if (id === action.driverBoneId) return;
    const a = left.targets[id] ?? {}, b = right.targets[id] ?? {};
    const delta: SmartTargetDelta = {};
    if (a.transform || b.transform) {
      delta.transform = {};
      transformChannels.forEach(c => { delta.transform![c] = mix(a.transform?.[c], b.transform?.[c]); });
    }
    if (a.opacity !== undefined || b.opacity !== undefined) delta.opacity = mix(a.opacity, b.opacity);
    const length = action.baseline[id]?.mesh?.length ?? 0;
    if (length && (a.mesh || b.mesh)) delta.mesh = Array.from({ length }, (_, i) => ({
      x: mix(a.mesh?.[i]?.x, b.mesh?.[i]?.x), y: mix(a.mesh?.[i]?.y, b.mesh?.[i]?.y),
    }));
    // Visibility and z-order are discrete layer switches. Use the nearest
    // authored key rather than interpolating invalid intermediate states.
    const nearest = t < .5 ? a : b;
    if (nearest.visible !== undefined) delta.visible = nearest.visible;
    if (nearest.zIndex !== undefined) delta.zIndex = nearest.zIndex;
    if (nearest.masks) delta.masks = JSON.parse(JSON.stringify(nearest.masks));
    if (nearest.patch) delta.patch = JSON.parse(JSON.stringify(nearest.patch));
    result[id] = delta;
  });
  return result;
}

/** Sample prepared character-view angles from the same Smart Bone dial. */
export function sampleSmartActionViewAngles(action: SmartBoneAction, driverAngle: number): Record<string, number> {
  const ids = action.viewSetIds ?? [];
  const keys = [...action.keys].filter(key => Number.isFinite(key.angle) && key.viewAngles).sort((a, b) => a.angle - b.angle);
  if (!ids.length || !keys.length || !Number.isFinite(driverAngle)) return {};
  const angle = Math.max(Math.min(action.startAngle, action.endAngle), Math.min(Math.max(action.startAngle, action.endAngle), driverAngle));
  let left = keys[0], right = keys[keys.length - 1];
  if (angle <= left.angle) right = left;
  else if (angle >= right.angle) left = right;
  else {
    const index = keys.findIndex(key => key.angle >= angle);
    left = keys[index - 1]; right = keys[index];
  }
  const t = right.angle === left.angle ? 0 : (angle - left.angle) / (right.angle - left.angle);
  const result: Record<string, number> = {};
  ids.forEach(id => {
    const a = left.viewAngles?.[id], b = right.viewAngles?.[id];
    if (a !== undefined || b !== undefined) result[id] = (a ?? b ?? 0) + ((b ?? a ?? 0) - (a ?? b ?? 0)) * t;
  });
  return result;
}

export function smartDelta(base: SmartTargetState, current: SmartTargetState): SmartTargetDelta {
  const transform: Partial<Transform2D> = {};
  transformChannels.forEach(c => { transform[c] = current.local[c] - base.local[c]; });
  return {
    transform,
    ...(base.opacity !== undefined && current.opacity !== undefined ? { opacity: current.opacity - base.opacity } : {}),
    ...(base.mesh && current.mesh?.length === base.mesh.length ? {
      mesh: current.mesh.map((p, i) => ({ x: p.x - base.mesh![i].x, y: p.y - base.mesh![i].y })),
    } : {}),
    ...(base.visible !== undefined && current.visible !== base.visible ? { visible: current.visible } : {}),
    ...(base.zIndex !== undefined && current.zIndex !== base.zIndex ? { zIndex: current.zIndex } : {}),
    ...(current.masks ? { masks: JSON.parse(JSON.stringify(current.masks)) } : {}),
    ...(current.patch ? { patch: JSON.parse(JSON.stringify(current.patch)) } : {}),
  };
}

export function normalizeSmartFolders(value: unknown): SmartActionFolder[] {
  const seen = new Set<string>();
  const folders: SmartActionFolder[] = Array.isArray(value) ? value.slice(0, 256).flatMap(item => {
    if (!record(item) || typeof item.id !== 'string' || !item.id || seen.has(item.id)) return [];
    seen.add(item.id); return [{ id: item.id, name: typeof item.name === 'string' ? item.name.slice(0, 100) : 'Actions', parentId: typeof item.parentId === 'string' ? item.parentId : null }];
  }) : [];
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  folders.forEach(folder => {
    const visited = new Set([folder.id]); let parent = folder.parentId;
    while (parent) {
      if (visited.has(parent) || !byId.has(parent)) { folder.parentId = null; break; }
      visited.add(parent); parent = byId.get(parent)!.parentId;
    }
  });
  return folders;
}

/** Explicit dependencies order actions, without allowing driver feedback. Cycles are diagnosed and skipped. */
export function orderedSmartActions(actions: SmartBoneAction[]): { actions: SmartBoneAction[]; diagnostics: string[] } {
  const byId = new Map(actions.map(action => [action.id, action])), done = new Set<string>(), visiting = new Set<string>();
  const result: SmartBoneAction[] = [], diagnostics: string[] = [], invalid = new Set<string>();
  const visit = (action: SmartBoneAction): boolean => {
    if (done.has(action.id)) return !invalid.has(action.id);
    if (visiting.has(action.id)) { diagnostics.push(`Cyclic action dependency: ${action.name}`); return false; }
    visiting.add(action.id);
    const valid = (action.dependencies ?? []).every(id => {
      const dependency = byId.get(id);
      if (!dependency) { diagnostics.push(`Missing dependency for ${action.name}: ${id}`); return false; }
      return dependency.enabled && visit(dependency);
    });
    visiting.delete(action.id); done.add(action.id);
    if (valid) result.push(action); else invalid.add(action.id);
    return valid;
  };
  [...actions].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.id.localeCompare(b.id)).forEach(visit);
  return { actions: result, diagnostics };
}
