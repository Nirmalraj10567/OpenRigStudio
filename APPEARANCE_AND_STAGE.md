# Appearance variations and 2.5D stage

## Appearance variations

Open **Style** in the right dock.

- Select a vector layer and an individual shape to change fill, stroke, stroke width, or opacity.
- Toggle a layer and change layer opacity for wardrobe parts.
- Save and apply named appearance presets for the whole rig or selected layer.
- Use **Style demo** for separate clothing layers, color presets, and a jacket/vest visibility example.
- For raster artwork, use **Replace local artwork**. It preserves the layer ID, dimensions, mesh, binding, and transforms.

Flattened images have no editable clothing regions. The editor does not segment pixels, recreate hidden areas, or infer semantic parts. Use separate vector/image layers or replace the complete raster artwork.

## 2.5D stage

Open **Stage** to enable the preview. It keeps the existing 2D artwork and rig but adds:

- Camera X/Y movement
- Camera zoom
- Camera yaw (−180°…180°), pitch (−85°…85°), and roll (−180°…180°)
- Front, Left −45°, Right +45°, Side 90°, Back 180°, and Isometric presets
- Perspective-style depth scaling
- Per-layer depth ordering
- Per-layer parallax strength

**Try it:** open **Stage → Open view-angle demo**, then switch between **Front**, **Right +45°**, and **Isometric**. The mountain background, character, and foreground markers sit on separate depth planes. You can also open your own rig and adjust the sliders. **Reset camera** returns all angles and camera controls to the front view.

Stage settings and layer depth/parallax are saved in project JSON and can be undone. The preview is read-only: disable it before selecting, binding, posing, drawing, importing, or editing meshes. Bones are hidden during preview and authored 2D transforms stay intact. Playback remains available.

The **Camera** editor adds named animated shots, tracking/zoom/roll/pan-tilt tools, subject following, framing guides, and timeline camera cuts. Stage controls edit the non-keyable **Preview** view; choose Preview and disable Stage preview to return to artwork editing. See [Animated cameras](CAMERAS.md) for the camera demo, controls, and researched workflow.

The projection rotates flat artwork planes around the stage center, foreshortening width/height and moving planes according to their depth. Positive depth is toward the front-view camera. Depth-plane ordering reverses when looking from behind. Side view makes artwork edge-on; back view mirrors existing art rather than generating side/back drawings. Perspective is an affine depth-scaling approximation.

For distinct character side/back drawings, use **Character views**. It supports supplied per-angle artwork, bone/part alignment, visibility, ordering, and animated character-angle channels independently of Stage and camera angles. Human and custom-frog demos include a five-angle reference sheet matching Front 0°, Front Side −45°, Side −90°, Back Side −135°, and Back −180°. See [Multi-view characters and custom creatures](CHARACTER_VIEWS.md).

Canvas, vector/image/mesh SVG export, and PNG export use the same angle projection. Legacy projects with no angle fields load at 0° / 0° / 0°.

`tests/stageAngles.test.mjs` verifies projection math, depth separation, legacy defaults, draw order, persistence, Undo/Redo, and canvas/export parity. Chromium verification confirmed changed canvas pixels for yaw/pitch/roll, each layer's canvas projection, JSON persistence, preset Undo/Redo, camera reset, and SVG/PNG output.

Browser screenshots show the visible result:

- [Front — 0° / 0° / 0°](stage-front-proof.png)
- [Angled — yaw 45°](stage-angle-proof.png)
- [Isometric — yaw 45° / pitch 35°](stage-isometric-proof.png)
