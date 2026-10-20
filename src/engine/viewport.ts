export interface ViewportOffset {
  x: number;
  y: number;
}

export interface EditorViewport {
  pan: ViewportOffset;
  zoom: number;
}

export const MIN_EDITOR_ZOOM = 0.1;
export const MAX_EDITOR_ZOOM = 4;

export function clampEditorZoom(value: number): number {
  return Math.min(MAX_EDITOR_ZOOM, Math.max(MIN_EDITOR_ZOOM, value));
}

/**
 * Zoom while keeping the point beneath the pointer fixed in screen space.
 * `pointer` is relative to the viewport center, matching CanvasStage's
 * translate(center + pan) -> scale(zoom) transform.
 */
export function zoomEditorViewportAtPoint(
  viewport: EditorViewport,
  pointer: ViewportOffset,
  factor: number,
): EditorViewport {
  if (!Number.isFinite(factor) || factor <= 0) return viewport;
  const zoom = clampEditorZoom(viewport.zoom * factor);
  if (zoom === viewport.zoom) return viewport;
  const ratio = zoom / viewport.zoom;
  return {
    zoom,
    pan: {
      x: pointer.x - (pointer.x - viewport.pan.x) * ratio,
      y: pointer.y - (pointer.y - viewport.pan.y) * ratio,
    },
  };
}

/**
 * Return an editor viewport that frames the complete stage inside the canvas.
 * The stage remains unchanged; only the editor's pan/zoom changes.
 */
export function fitEditorViewport(
  viewportWidth: number,
  viewportHeight: number,
  stageWidth: number,
  stageHeight: number,
  padding = 24,
): EditorViewport {
  const availableWidth = Math.max(1, viewportWidth - padding * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);
  const width = Math.max(1, stageWidth);
  const height = Math.max(1, stageHeight);
  return {
    pan: { x: 0, y: 0 },
    zoom: clampEditorZoom(Math.min(availableWidth / width, availableHeight / height)),
  };
}
