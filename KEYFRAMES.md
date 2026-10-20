# Keyframe handling

The timeline follows the core Moho keyframe workflow described in the published manual:

- [Timeline window — selecting, moving, copying, pasting, and interpolation](https://www.lostmarble.com/moho/manual/timelinewnd.html)
- [Animation — keyframes and the frame-zero setup pose](https://www.lostmarble.com/moho/manual/animation.html)

## Using the timeline

- Frame 0 stores the setup pose; edits after frame 0 are animation keys.
- **Auto-key** is enabled by default. Moving, posing, resizing, changing opacity, or editing mesh vertices at a later frame records a key in one undoable transaction.
- Click a key to select it, **Shift-click** to add/remove keys, or drag across the dope sheet for marquee selection.
- Each animated property has its own channel row. **Channels → Selected object** focuses on the selected bone or artwork; **All objects** displays the whole rig. Choose an existing animation from the timeline dropdown.
- Drag selected keys horizontally to retime them together. Keys snap to whole frames and keep their IDs so the selection remains active.
- **Copy** and **Paste** preserve the selected channels, spacing, values, and interpolation. Paste starts at the current playhead frame.
- **Delete** removes selected keys. The Delete key and Alt+Backspace are supported.
- Use the interpolation menu or right-click a key to set Smooth, Linear, Ease in, Ease out, Ease in/out, or Step interpolation for selected keys. Smooth uses smoothstep easing; Step holds until the next key. Interpolation belongs to the outgoing segment after the selected key.
- **Arrow Left/Right** nudges selected keys one frame; **Shift+Arrow** nudges ten frames. Ctrl/Cmd+A selects all keys in visible channels. Ctrl/Cmd+C/V and Moho-style Alt+C/V copy/paste when the timeline is focused.
- Double-click a key to seek to it. Drag the ruler to scrub. Pointer cancellation or Escape discards an unfinished retiming/box-selection gesture.
- Click **Graph** to open Graph Mode. Numeric channels expose Value, X, Y, Rotation, Scale X, and Scale Y curves with draggable keys and Bezier handles. Tangent locking, velocity editing, automatic ease, bounce/elastic/overshoot presets, curve filtering, and curve copy/paste are available without leaving the active animation.
- Open **Nonlinear animation** below the key tools to create cycle regions, switch to ping-pong playback, trim/stretch/retime a clip, and assemble referenced animation layers with additive/override blending, weights, fades, mute/solo, and crossfade transitions. See [NLA.md](NLA.md).
- In the **Dynamics** dock, **Bake to keys** creates a new clip with sampled transform/mesh keys and vector-shape particle keys. Select the new clip to edit its motion, or its source clip to return to live simulation. See [DYNAMICS.md](DYNAMICS.md).

Key edits create one Undo step. Dropping a key onto an occupied frame replaces that frame’s key in the same channel; group spacing stays intact. Paste extends the timeline when necessary. Auto-key records canvas changes at gesture completion and property changes through the existing editor transactions. A saved setup pose keeps frame 0 recoverable even when keys are removed.

The behavior is implemented in `src/engine/keyframeEditing.ts`, `src/engine/graphEditing.ts`, and `src/engine/animationCurves.ts`, and exposed through the timeline in `src/ui/Timeline.tsx` and `src/ui/GraphEditor.tsx`. Animation clips remain JSON-safe project data and continue to work with playback, controllers, motion import, undo, and redo.

## Camera channels

**Channels → Camera only** displays named-camera properties and the Camera switcher. Camera keys remain editable in a staged camera view, while artwork key edits remain protected. **Add key** in this scope records the selected custom camera; Preview is non-keyable and Switch is controlled by its cut channel.

Numeric camera channels use the same interpolation and key-editing tools as pose channels. Camera cuts, projection changes, follow links, and follow-framing offsets always hold until the next key. See [Animated cameras](CAMERAS.md) for shot capture, following, and timeline cuts.

## Character-view channels

**Channels → Character views** displays independent character, head, or body angle tracks. **Add key** in this scope records the selected view set's angle. The same selection, retiming, clipboard, deletion, easing, and Undo/Redo tools apply. View-angle keys remain editable in a staged camera view. See [Multi-view characters and custom creatures](CHARACTER_VIEWS.md).

## Verification

`tests/keyframes.test.mjs` covers group retiming, collision replacement, nested-value clipboard independence, interpolation, auto-key gesture boundaries, setup-pose recovery, undo/redo, disabled editing, and scalar/aggregate track precedence. `tests/graphEditor.test.mjs` covers Bezier sampling, separate transform channels, tangent locking, velocity, automatic ease, filtering, and curve copy/paste.

The visible workflow was checked in Chromium. `keyframes-proof.png` shows the working channel timeline with edited keys and interpolation controls.
