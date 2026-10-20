# Brush library

Character Studio's **Brushes** dock is available when the Draw tool is active.
It creates native editable vector layers rather than raster-only canvas marks.

## Included presets

- **Inking:** Studio Ink, Marker, Highlighter, Calligraphy
- **Sketching:** Pencil, Mechanical Pencil, Charcoal
- **Painting:** Watercolor, Oil Paint, Acrylic
- **Texture:** Crayon, Chalk
- **Effects:** Airbrush, Spray Paint, Pixel

Every brush supports size, opacity, color, and optional pen pressure. Stylus
pressure is read from the browser Pointer Events API; mouse drawing uses a
stable fallback pressure so strokes remain predictable without a tablet.
Brushes that need texture are authored as deterministic layered vector paths or
small vector dots, so reopening and exporting a project produces the same art.

## Workflow

1. Select **Draw** (`D`) in the left toolbar.
2. Select a brush in the **Brush library** dock.
3. Adjust size, opacity, color, or Pen pressure.
4. Draw on the stage. Each gesture becomes a separately selectable vector layer.
5. Use the normal Layers, Bind, Mesh, Style, animation, SVG, PNG, and Video
   workflows on the resulting layer.

Brush settings are stored as an editor preference in browser local storage;
the artwork itself is stored in the project JSON under ordinary vector shapes.

## Browser references

The implementation uses standard browser APIs documented by MDN:

- [`PointerEvent.pressure`](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pressure)
- [`CanvasRenderingContext2D.lineCap`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineCap)
- [`CanvasRenderingContext2D.globalCompositeOperation`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)
