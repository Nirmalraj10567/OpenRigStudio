export type Transform2D={x:number;y:number;rotation:number;scaleX:number;scaleY:number};
export type Point2D={x:number;y:number};
export const identity=():Transform2D=>({x:0,y:0,rotation:0,scaleX:1,scaleY:1});
export function compose(a:Transform2D,b:Transform2D):Transform2D{const c=Math.cos(a.rotation),s=Math.sin(a.rotation);return{x:a.x+(b.x*a.scaleX*c-b.y*a.scaleY*s),y:a.y+(b.x*a.scaleX*s+b.y*a.scaleY*c),rotation:a.rotation+b.rotation,scaleX:a.scaleX*b.scaleX,scaleY:a.scaleY*b.scaleY};}

/** Applies the current TRS convention to a point, including non-uniform scale. */
export function localToWorldPoint(transform: Transform2D, point: Point2D): Point2D {
  const c = Math.cos(transform.rotation);
  const s = Math.sin(transform.rotation);
  return {
    x: transform.x + point.x * transform.scaleX * c - point.y * transform.scaleY * s,
    y: transform.y + point.x * transform.scaleX * s + point.y * transform.scaleY * c,
  };
}

/**
 * Converts a world point into a transform's local space exactly. The helper
 * deliberately returns null for singular (or non-finite) transforms instead
 * of manufacturing a usable-looking inverse.
 */
export function worldToLocalPoint(transform: Transform2D, point: Point2D): Point2D | null {
  if (![transform.x, transform.y, transform.rotation, transform.scaleX, transform.scaleY, point.x, point.y]
    .every(Number.isFinite) || transform.scaleX === 0 || transform.scaleY === 0) return null;
  const dx = point.x - transform.x;
  const dy = point.y - transform.y;
  const c = Math.cos(transform.rotation);
  const s = Math.sin(transform.rotation);
  const local = {
    x: (dx * c + dy * s) / transform.scaleX,
    y: (-dx * s + dy * c) / transform.scaleY,
  };
  return Number.isFinite(local.x) && Number.isFinite(local.y) ? local : null;
}

export function cloneTransform(transform: Transform2D): Transform2D {
  return { ...transform };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolates the shortest rotation path while preserving radians. */
export function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

export function interpolateTransform(a: Transform2D, b: Transform2D, t: number): Transform2D {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    rotation: lerpAngle(a.rotation, b.rotation, t),
    scaleX: lerp(a.scaleX, b.scaleX, t),
    scaleY: lerp(a.scaleY, b.scaleY, t),
  };
}

export function invert(transform: Transform2D): Transform2D {
  const scaleX = transform.scaleX || 1;
  const scaleY = transform.scaleY || 1;
  const rotation = -transform.rotation;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const x = -transform.x;
  const y = -transform.y;
  return {
    x: (x * c - y * s) / scaleX,
    y: (x * s + y * c) / scaleY,
    rotation,
    scaleX: 1 / scaleX,
    scaleY: 1 / scaleY,
  };
}
