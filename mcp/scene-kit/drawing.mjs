export const T = (x = 0, y = 0, rotation = 0, scale = 1) => ({ x, y, rotation, scaleX: scale, scaleY: scale });
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t*t*(3-2*t); };

/** One source of truth for shape IDs, bindings, pivots and native animation data. */
export function drawing(project) {
  let next = 0;
  const shape = (kind, values) => ({ id: `kit-shape-${++next}`, kind, ...values });
  const path = (d, fill, stroke = 'none', strokeWidth = 1.8) => shape('path', { d, fill, stroke, strokeWidth });
  const rect = (x, y, width, height, fill) => shape('rect', { x, y, width, height, fill });
  const ellipse = (x, y, radiusX, radiusY, fill, stroke = 'none', strokeWidth = 1.8) => shape('ellipse', { x, y, radiusX, radiusY, fill, stroke, strokeWidth });
  const layer = (id, shapes, zIndex, boneId = 'shot', local = T()) => {
    const item = { id, name: id.replaceAll('-', ' '), type: 'vector', local, shapes, zIndex, opacity: 1, visible: true, locked: false, boundBoneId: boneId };
    project.layers.push(item);
    if (boneId) project.bindings.push({ layerId: id, imageId: id, boneId, bindOffset: T() });
    return item;
  };
  const bone = (id, parentId, length, local = T()) => {
    const item = { id, name: id.replaceAll('-', ' '), parentId, length, local };
    project.bones.push(item); return item;
  };
  // Capsule artwork extends around BOTH pivots. Rotating either bone cannot
  // expose the background through the shared elbow/knee socket.
  const capsule = (length, radius, fill, ink) => path(`M 0 ${-radius} L ${length} ${-radius} C ${length+radius*1.33} ${-radius} ${length+radius*1.33} ${radius} ${length} ${radius} L 0 ${radius} C ${-radius*1.33} ${radius} ${-radius*1.33} ${-radius} 0 ${-radius} Z`, fill, ink, 2);
  return { path, rect, ellipse, layer, bone, capsule };
}

/** Elbow/knee IK in parent-local space; fixed lengths never stretch or detach. */
export function limbIK(x, y, upper, lower, bend = 1) {
  const requested = Math.hypot(x, y);
  const distance = Math.min(upper + lower - .001, Math.max(Math.abs(upper-lower) + .001, requested));
  const direction = Math.atan2(y, x);
  const lowerAngle = bend * Math.acos(Math.max(-1, Math.min(1, (distance*distance-upper*upper-lower*lower)/(2*upper*lower))));
  const upperAngle = direction - Math.atan2(lower*Math.sin(lowerAngle), upper+lower*Math.cos(lowerAngle));
  return { upper: upperAngle, lower: lowerAngle, clamped: Math.abs(requested-distance) > .01 };
}
