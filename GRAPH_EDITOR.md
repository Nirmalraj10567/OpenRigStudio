# Graph Mode

Timeline **Graph** mode provides value-over-time editing for numeric animation channels. It is designed for precise turn, camera, facial, constraint, and pose cleanup without changing the existing dope-sheet workflow.

## Graph workflow

1. Create or open an animation with numeric keys.
2. Select a key/channel in the Timeline and click **Graph**.
3. Choose **Value**, **X**, **Y**, **Rotation**, **Scale X**, or **Scale Y** from the graph-channel selector.
4. Drag a key to change its frame and value. Drag the incoming/outgoing handles to edit Bezier timing and value tangents.
5. Toggle tangent locking to mirror handle changes around a key.
6. Set a velocity in units per second and apply it to the outgoing handle when exact motion speed matters.

The graph supports smooth, linear, step, ease-in, ease-out, ease-in/out, Bezier, bounce, elastic, and overshoot curves. **Auto ease**, smooth/flat tangent presets, and the motion filter provide fast cleanup for noisy or mechanically imported curves.

## Curve clipboard and filtering

**Copy curve** stores the selected channel’s key spacing, values, easing, and tangent data. **Paste curve** places the curve at the playhead while preserving its channel and editable key structure. The filter selector can show all curves, selected keys, or only channels with custom curve data.

Graph data is stored on each keyframe under `curves`, keyed by channel path. Scalar tracks use `$`; aggregate transforms use `x`, `y`, `rotation`, `scaleX`, and `scaleY`. Existing projects without curve metadata remain compatible and continue to use their legacy easing field.

## Professional animation use

Use separate X/Y curves to remove diagonal drift, rotation curves to control turn acceleration, velocity editing for camera pans and wheel motion, overshoot for expressive facial controls, bounce for contact or squash timing, and filtering for imported motion cleanup. Graph keys retain the same selection, clipboard, interpolation, undo, serialization, and playback behavior as the standard timeline.
