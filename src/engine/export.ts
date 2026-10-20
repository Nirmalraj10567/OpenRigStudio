import { Rig } from './Rig';
import type { Layer } from './Rig';
import { triangleAffine, triangleClipApron, validMesh } from './mesh';
import type { Point } from './mesh';
import type { ImageLayerData, ProjectModel, VectorLayerData, VectorShape } from './model';
import { serializeProject } from './serialization';
import { stageLayerScale, stageLayerTransform, stageRenderLayers } from './stage2d';
import { groupMasks } from './masking';
import type { MaskEntry } from './model';
import { layer3DCameraDepth, projectedLayerTriangles } from './render3d';
import { project3DPoint } from './camera3d';
import { cameraTransitionViews } from './camera';
import { normalizeEnvironmentProject, sampleEnvironment } from './environment';

export type ProjectSource = ProjectModel | Rig;

function projectValue(source: ProjectSource): ProjectModel {
  return source instanceof Rig ? source.toProject() : source;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character);
}

function transformAttribute(transform: { x: number; y: number; rotation: number; scaleX: number; scaleY: number }): string {
  const degrees = transform.rotation * 180 / Math.PI;
  return `translate(${transform.x} ${transform.y}) rotate(${degrees}) scale(${transform.scaleX} ${transform.scaleY})`;
}

function shapeToSvg(shape: VectorShape): string {
  const fill = escapeXml(shape.fill ?? 'none');
  const stroke = escapeXml(shape.stroke ?? 'none');
  const strokeWidth = shape.strokeWidth ?? 1;
  const opacity = shape.opacity ?? 1;
  const lineCap = shape.lineCap ? ` stroke-linecap="${shape.lineCap}"` : '';
  const lineJoin = shape.lineJoin ? ` stroke-linejoin="${shape.lineJoin}"` : '';
  const lineDash = shape.lineDash?.length ? ` stroke-dasharray="${shape.lineDash.join(' ')}"` : '';
  const attrs = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${lineCap}${lineJoin}${lineDash}`;
  switch (shape.kind) {
    case 'ellipse': return `<ellipse cx="${shape.x ?? 0}" cy="${shape.y ?? 0}" rx="${shape.radiusX ?? 1}" ry="${shape.radiusY ?? 1}" ${attrs}/>`;
    case 'path': return `<path d="${escapeXml(shape.d ?? '')}" ${attrs}/>`;
    case 'polygon': return `<polygon points="${(shape.points ?? []).map((point) => `${point.x},${point.y}`).join(' ')}" ${attrs}/>`;
    default: return `<rect x="${shape.x ?? 0}" y="${shape.y ?? 0}" width="${shape.width ?? 0}" height="${shape.height ?? 0}" ${attrs}/>`;
  }
}

function imageContents(layer: ImageLayerData): string {
  return layer.src
    ? `<image href="${escapeXml(layer.src)}" x="${-layer.width / 2}" y="${-layer.height / 2}" width="${layer.width}" height="${layer.height}" preserveAspectRatio="none"/>`
    : `<rect x="${-layer.width / 2}" y="${-layer.height / 2}" width="${layer.width}" height="${layer.height}" rx="8" fill="${escapeXml(layer.color)}"/>`;
}

function imageLayerToSvg(layer: ImageLayerData, transform = layer.local, opacity = layer.opacity): string {
  return `<g transform="${transformAttribute(transform)}" opacity="${opacity}"><title>${escapeXml(layer.name)}</title>${imageContents(layer)}</g>`;
}

function vectorLayerToSvg(layer: VectorLayerData, transform = layer.local, opacity = layer.opacity): string {
  return `<g transform="${transformAttribute(transform)}" opacity="${opacity}"><title>${escapeXml(layer.name)}</title>${layer.shapes.map(shapeToSvg).join('')}</g>`;
}

function environmentMaterialColor(material: string): string {
  return material === 'path' ? '#9b8058'
    : material === 'rock' ? '#66747a'
      : material === 'sand' ? '#c9ae72'
        : material === 'snow' ? '#dbe8e5'
          : material === 'water' ? '#3d8493'
            : material === 'dirt' ? '#765640' : '#476d50';
}

function environmentBackdropSvg(runtime: Rig, definitions: string[]): string {
  if (!runtime.environment) return '';
  const environment = normalizeEnvironmentProject(runtime.environment);
  const sample = sampleEnvironment(environment, runtime.timeline.currentFrame);
  const suffix = `environment-${runtime.id.replace(/[^a-z0-9_-]/gi, '')}`;
  const skyId = `${suffix}-sky`;
  const fogId = `${suffix}-fog`;
  definitions.push(`<linearGradient id="${skyId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${escapeXml(environment.settings.skyColor)}"/><stop offset=".62" stop-color="${escapeXml(environment.settings.horizonColor)}"/><stop offset="1" stop-color="#476d50"/></linearGradient>`);
  definitions.push(`<linearGradient id="${fogId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${escapeXml(sample.tint)}" stop-opacity="0"/><stop offset="1" stop-color="${escapeXml(sample.tint)}" stop-opacity="${Math.min(1, sample.fogOpacity * .7)}"/></linearGradient>`);
  const sunX = runtime.canvas.width * .82;
  const sunY = runtime.canvas.height * .2;
  const sun = `<circle cx="${sunX}" cy="${sunY}" r="${18 + environment.settings.sunIntensity * 8}" fill="${escapeXml(environment.settings.sunColor)}" opacity="${Math.min(1, .35 + environment.settings.sunIntensity * .2)}"/>`;
  const terrainHeight = Math.min(runtime.canvas.height * .42, environment.terrain.gridHeight * environment.terrain.tileSize);
  const terrainTop = runtime.canvas.height - terrainHeight;
  const tiles = environment.terrain.enabled ? environment.terrain.tiles.filter(tile => tile.visible).map(tile => {
    const x = tile.x * environment.terrain.tileSize;
    const y = terrainTop + tile.y * environment.terrain.tileSize - tile.elevation * 2;
    return `<rect x="${x}" y="${y}" width="${environment.terrain.tileSize + 1}" height="${environment.terrain.tileSize + 1}" fill="${environmentMaterialColor(tile.material)}" opacity=".22"/>`;
  }).join('') : '';
  const fog = sample.fogOpacity > 0 ? `<rect x="0" y="${runtime.canvas.height * .35}" width="${runtime.canvas.width}" height="${runtime.canvas.height * .65}" fill="url(#${fogId})"/>` : '';
  return `<rect width="100%" height="100%" fill="url(#${skyId})"/>${sun}${tiles}${fog}`;
}

function groupClipSvg(runtime: Rig, layerId: string, ordinal: number): { defs: string; id?: string } {
  const clips = runtime.getGroupClipLayers(layerId).filter(layer => layer.id !== layerId);
  if (!clips.length) return { defs: '' };
  const id = `group-clip-${ordinal}`;
  const contents = clips.map(clip => {
    const shapes = clip.type === 'vector' ? clip.shapes.map(shapeToSvg).join('') : `<rect x="${-clip.width / 2}" y="${-clip.height / 2}" width="${clip.width}" height="${clip.height}"/>`;
    return `<g transform="${transformAttribute(clip.world)}">${shapes}</g>`;
  }).join('');
  return { id, defs: `<clipPath id="${id}" clipPathUnits="userSpaceOnUse">${contents}</clipPath>` };
}

/** Match the canvas triangle texture mapping; export the evaluated pose, not the rest grid. */
function meshLayerToSvg(rig: Rig, layer: Layer, ordinal: number, opacity = rig.getLayerOpacity(layer.id)): string | null {
  if (!validMesh(layer.mesh)) return null;
  const mesh = layer.mesh;
  const vertices = rig.getMeshVertices(layer.id);
  if (vertices.length !== mesh.vertices.length) return '';
  const sourceId = `mesh-art-${ordinal}`;
  const contents = layer.type === 'image' ? imageContents(layer) : layer.shapes.map(shapeToSvg).join('');
  const definitions = [`<g id="${sourceId}">${contents}</g>`];
  const triangles: string[] = [];
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const ids = mesh.triangles.slice(i, i + 3);
    const source = ids.map(index => ({
      x: mesh.bounds.x + mesh.vertices[index].u * mesh.bounds.width,
      y: mesh.bounds.y + mesh.vertices[index].v * mesh.bounds.height,
    })) as [Point, Point, Point];
    const target = ids.map(index => vertices[index]) as [Point, Point, Point];
    const m = triangleAffine(source, target);
    if (!m) continue;
    const clipId = `mesh-clip-${ordinal}-${i / 3}`;
    const opaque = opacity >= 1 && layer.type === 'vector' && layer.shapes.every(shape => (shape.opacity ?? 1) >= 1);
    const clip = triangleClipApron(target, opaque ? .35 / Math.max(.01, stageLayerScale(layer, rig.getStageView())) : 0);
    definitions.push(`<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><polygon points="${clip.map(p => `${p.x},${p.y}`).join(' ')}"/></clipPath>`);
    triangles.push(`<g clip-path="url(#${clipId})"><use href="#${sourceId}" xlink:href="#${sourceId}" transform="matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})"/></g>`);
  }
  return `<g opacity="${opacity}"><title>${escapeXml(layer.name)}</title><defs>${definitions.join('')}</defs>${triangles.join('')}</g>`;
}

export function projectToSVG(source: ProjectSource, includeBackground = true): string {
  const runtime = source instanceof Rig ? source : new Rig(source);
  const transition = cameraTransitionViews(runtime);
  if (transition) {
    const original = runtime.stageRenderOverride;
    try {
      runtime.stageRenderOverride = transition.from; const from = projectToSVG(runtime, includeBackground);
      runtime.stageRenderOverride = transition.to; const to = projectToSVG(runtime, includeBackground).replace(/id="([^"]+)"/g, 'id="to-$1"').replace(/url\(#([^\)]+)\)/g, 'url(#to-$1)').replace(/href="#([^"]+)"/g, 'href="#to-$1"');
      const a = transition.kind === 'push' ? `transform="translate(${-transition.amount * runtime.canvas.width} 0)"` : '', b = transition.kind === 'push' ? `transform="translate(${(1 - transition.amount) * runtime.canvas.width} 0)"` : `opacity="${transition.amount}"`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${runtime.canvas.width}" height="${runtime.canvas.height}" viewBox="0 0 ${runtime.canvas.width} ${runtime.canvas.height}"><g ${a}>${from}</g><g ${b}>${to}</g></svg>`;
    } finally { runtime.stageRenderOverride = original; }
  }
  runtime.update();
  const canvas = runtime.canvas;
  const stage = runtime.getStageView();
   let ordinal = 0;
   const definitions: string[] = [];
   const background = includeBackground
     ? runtime.environment ? environmentBackdropSvg(runtime, definitions) : `<rect width="100%" height="100%" fill="${escapeXml(canvas.background)}"/>`
     : '';
  const region = `x="${-canvas.width * 4}" y="${-canvas.height * 4}" width="${canvas.width * 9}" height="${canvas.height * 9}"`;
  const full = `<rect ${region} fill="white"/>`;
  const stageWrap = (layer: Layer, contents: string) => {
    if (!stage.enabled) return contents;
    const matrix = stageLayerTransform(layer, stage, { x: canvas.width / 2, y: canvas.height / 2 });
    return `<g data-stage-layer="${escapeXml(layer.id)}" transform="matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})">${contents}</g>`;
  };
  const artwork = (layer: Layer, opacity: number): string => {
    if (stage.camera3d?.enabled) {
      const triangles = projectedLayerTriangles(runtime, layer, stage), artId = `art3d-${++ordinal}`, contents = layer.type === 'image' ? imageContents(layer) : layer.shapes.map(shapeToSvg).join('');
      definitions.push(`<g id="${artId}">${contents}</g>`);
      const blur = triangles.length ? triangles.reduce((sum, triangle) => sum + triangle.blur, 0) / triangles.length : 0, blurId = `dof-${++ordinal}`;
      if (blur > 0) definitions.push(`<filter id="${blurId}" filterUnits="userSpaceOnUse" ${region}><feGaussianBlur stdDeviation="${blur}"/></filter>`);
      const shadows = triangles.filter(triangle => triangle.shadow), shadowId = `shadow3d-${++ordinal}`;
      if (shadows.length) definitions.push(`<filter id="${shadowId}" filterUnits="userSpaceOnUse" ${region}><feGaussianBlur stdDeviation="${stage.camera3d.shadow.softness}"/></filter>`);
      const shadow = shadows.length ? `<path d="${shadows.map(triangle => `M${triangle.shadow![0].x} ${triangle.shadow![0].y} L${triangle.shadow![1].x} ${triangle.shadow![1].y} L${triangle.shadow![2].x} ${triangle.shadow![2].y} Z`).join(' ')}" fill="black" opacity="${stage.camera3d.shadow.opacity}" filter="url(#${shadowId})"/>` : '';
      const projected = triangles.map(triangle => {
        const points = triangle.points.map(point => `${point.x},${point.y}`).join(' ');
        if (triangle.color) return `<polygon points="${points}" fill="${escapeXml(triangle.color)}"/>`;
        if (!triangle.source) return '';
        const affine = triangleAffine(triangle.source, triangle.points); if (!affine) return '';
        const clipId = `clip3d-${++ordinal}`; definitions.push(`<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><polygon points="${points}"/></clipPath>`);
        return `<g clip-path="url(#${clipId})"><use href="#${artId}" transform="matrix(${affine.a} ${affine.b} ${affine.c} ${affine.d} ${affine.e} ${affine.f})"/></g>`;
      }).join('');
      return `<g data-3d-layer="${escapeXml(layer.id)}" opacity="${opacity}"><title>${escapeXml(layer.name)}</title>${shadow}<g${blur > 0 ? ` filter="url(#${blurId})"` : ''}>${projected}</g></g>`;
    }
    return stageWrap(layer, meshLayerToSvg(runtime, layer, ++ordinal, opacity) ?? (layer.type === 'image' ? imageLayerToSvg(layer, layer.world, opacity) : vectorLayerToSvg(layer, layer.world, opacity)));
  };
  const alphaShape = (mask: MaskEntry, black = false, expansion = 0): string => {
    const layer = runtime.getRenderLayer(mask.layerId); if (!layer) return '';
    let source: Layer = layer;
    if (layer.type === 'vector') source = { ...layer, shapes: layer.shapes.map(shape => mask.kind === 'clip'
      ? { ...shape, fill: '#fff', stroke: 'none', opacity: 1 }
      : { ...shape, ...(mask.hideEdge ? { stroke: 'none' } : {}) }) };
    if (layer.type === 'image' && mask.kind === 'clip') source = { ...layer, type: 'vector', shapes: [{ id: 'clip', kind: 'rect', x: -layer.width / 2, y: -layer.height / 2, width: layer.width, height: layer.height, fill: '#fff' }] };
    const filterId = `mask-color-${++ordinal}`;
    const rgb = black ? 0 : 1;
    definitions.push(`<filter id="${filterId}" filterUnits="userSpaceOnUse" ${region}>${expansion ? `<feMorphology operator="dilate" radius="${expansion}"/>` : ''}<feColorMatrix type="matrix" values="0 0 0 0 ${rgb} 0 0 0 0 ${rgb} 0 0 0 0 ${rgb} 0 0 0 1 0"/></filter>`);
    if (mask.kind === 'clip' && !source.mesh) {
      const clipId = `geometric-clip-${++ordinal}`;
      definitions.push(`<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">${artwork(source, 1)}</clipPath>`);
      return `<g clip-path="url(#${clipId})" opacity="${mask.opacity}" filter="url(#${filterId})">${full}</g>`;
    }
    return `<g filter="url(#${filterId})">${artwork(source, mask.opacity * (mask.kind === 'alpha' ? runtime.getMaskSourceOpacity(layer.id) : 1))}</g>`;
  };
  const maskDefinition = (contents: string) => {
    const id = `composite-mask-${++ordinal}`;
    definitions.push(`<mask id="${id}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" ${region} style="mask-type:luminance">${contents}</mask>`); return id;
  };
  const applyGroupMasks = (contents: string, masks: MaskEntry[]) => {
    const active = masks.filter(mask => mask.enabled && runtime.layers.has(mask.layerId)); if (!active.length) return contents;
    let accumulated = active[0].operation === 'add' ? '' : full;
    active.forEach(mask => {
      const source = mask.inverted ? `<g mask="url(#${maskDefinition(full + alphaShape(mask, true))})">${full}</g>` : alphaShape(mask);
      if (mask.operation === 'add') accumulated += source;
      else {
        const shape = mask.operation === 'subtract' ? mask.inverted ? alphaShape(mask) : `${full}${alphaShape(mask, true)}` : source;
        accumulated = `<g mask="url(#${maskDefinition(shape)})">${accumulated}</g>`;
      }
    });
    return `<g mask="url(#${maskDefinition(accumulated)})">${contents}</g>`;
  };
  const patches = runtime.layersInOrder.filter(layer => layer.visible && layer.patch?.enabled);
  const emit = (id: string): string => {
    const group = runtime.getRenderGroup(id);
    if (group) {
      if (!group.visible) return '';
      const children = group.mode === 'switch' ? [group.childIds.includes(group.activeChildId ?? '') ? group.activeChildId! : group.childIds[0]] : group.childIds;
      const contents = applyGroupMasks(children.filter(Boolean).map(emit).join(''), groupMasks(group));
      return `<g data-layer-group="${escapeXml(id)}" opacity="${group.opacity}" style="isolation:isolate;mix-blend-mode:${group.blendMode === 'source-over' ? 'normal' : group.blendMode}">${contents}</g>`;
    }
    const layer = runtime.getRenderLayer(id); if (!layer?.visible) return '';
    const opacity = runtime.getLayerOpacity(id, false);
    const coverPatches = patches.filter(patch => patch.patch!.hideEdges && patch.patch!.targetIds.includes(id));
    const hideStroke = layer.patch?.enabled && layer.patch.hideEdges && !layer.patch.preserveOutline;
    if (layer.type !== 'vector' || !coverPatches.length && !hideStroke) return artwork(layer, opacity);
    const fills = artwork({ ...layer, shapes: layer.shapes.map(shape => ({ ...shape, stroke: 'none' })) }, 1);
    let strokes = '';
    if (!hideStroke) {
      const cover = coverPatches.map(patch => alphaShape({ id: patch.id, layerId: patch.id, kind: 'alpha', operation: 'add', enabled: true, hideEdge: true, hideSource: false, inverted: false, opacity: 1 }, true, patch.patch!.seamWidth)).join('');
      strokes = `<g mask="url(#${maskDefinition(full + cover)})">${artwork({ ...layer, shapes: layer.shapes.map(shape => ({ ...shape, fill: 'none' })) }, 1)}</g>`;
    }
    return `<g opacity="${opacity}">${fills}${strokes}</g>`;
  };
  const roots = runtime.groups.size ? [...runtime.layers.values(), ...runtime.groups.values()].filter(item => !item.parentGroupId).sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id)) : stageRenderLayers(runtime.layersInOrder, stage);
  if (stage.camera3d?.enabled && !runtime.groups.size) roots.sort((a, b) => layer3DCameraDepth(b as Layer, stage, canvas) - layer3DCameraDepth(a as Layer, stage, canvas));
  const layers = roots.map(item => emit(item.id)).join('');
  let particles = (runtime.physicsFrame?.particles ?? []).map(particle => `<circle cx="${particle.x}" cy="${particle.y}" r="${particle.size}" fill="${escapeXml(particle.color)}" opacity="${particle.opacity}"/>`).join('');
  if (stage.camera3d?.enabled) particles = (runtime.physicsFrame?.particles ?? []).map(particle => {
    const point = project3DPoint({ x: particle.x - canvas.width / 2, y: particle.y - canvas.height / 2, z: 0 }, stage.camera3d!, canvas, stage.zoom, { x: stage.cameraX, y: stage.cameraY });
    return point.visible ? `<circle cx="${point.x}" cy="${point.y}" r="${particle.size * point.scale}" fill="${escapeXml(particle.color)}" opacity="${particle.opacity}"/>` : '';
  }).join('');
  else if (particles && stage.enabled) {
    const matrix = stageLayerTransform({ depth: 0, parallax: 1 }, stage, { x: canvas.width / 2, y: canvas.height / 2 });
    particles = `<g transform="matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})">${particles}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><defs>${definitions.join('')}</defs>${background}${layers}<g data-physics-particles="true">${particles}</g></svg>`;
}

export function exportSVG(source: ProjectSource): string {
  return projectToSVG(source);
}

export const exportProjectSVG = exportSVG;

export function downloadSVG(source: ProjectSource, filename = 'character.svg'): void {
  if (typeof document === 'undefined') throw new Error('SVG downloads require a browser environment');
  const blob = new Blob([projectToSVG(source)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface PngExportOptions {
  scale?: number;
  includeBackground?: boolean;
}

/** Rasterizes the SVG export using browser canvas APIs. */
export function exportPNG(source: ProjectSource, options: PngExportOptions = {}): Promise<Blob> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return Promise.reject(new Error('PNG export requires a browser environment'));
  }
  const project = projectValue(source);
  const scale = Math.max(0.01, options.scale ?? 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(project.canvas.width * scale);
  canvas.height = Math.round(project.canvas.height * scale);
  const image = new Image();
  const svgBlob = new Blob([projectToSVG(source, options.includeBackground ?? true)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  return new Promise<Blob>((resolve, reject) => {
    image.onload = () => {
      const context = canvas.getContext('2d');
      if (!context) { URL.revokeObjectURL(url); reject(new Error('Canvas 2D context is unavailable')); return; }
      try {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to encode PNG')), 'image/png');
      } catch (error) { reject(error); }
      finally { URL.revokeObjectURL(url); }
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unable to rasterize SVG')); };
    image.src = url;
  });
}

export const exportProjectPNG = exportPNG;

export async function downloadPNG(source: ProjectSource, filename = 'character.png', options?: PngExportOptions): Promise<void> {
  if (typeof document === 'undefined') throw new Error('PNG downloads require a browser environment');
  const blob = await exportPNG(source, options);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadProjectJSON(source: ProjectSource, filename = 'character-project.json'): void {
  if (typeof document === 'undefined') throw new Error('Project downloads require a browser environment');
  const blob = new Blob([serializeProject(projectValue(source), true)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
