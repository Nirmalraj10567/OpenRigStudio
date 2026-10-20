# Animated cameras

Open **Camera** in the right dock, click the camera tool in the left rail, or press **C**.

## Try the camera demo

1. Open **Camera → Camera demo**. Undo restores the previous project.
2. Set timeline **Channels → Camera only** to see the shot and camera channels.
3. Press **Play** or scrub the timeline:
   - Frames 0–71: **Wide · establishing**, with animated tracking, zoom, and roll.
   - Frames 72–95: **Close-up · portrait**.
   - Frame 96 onward: **Follow · courier**, which keeps the travelling root in its established position.
4. Select a named camera in **Viewport camera** to edit that shot. Select **Switch · timeline cuts** to see the edited sequence.

## Preview, named cameras, and Switch

| View | Behavior |
| --- | --- |
| **Preview** | Non-keyable composition view. Changes are saved as the existing Stage settings without adding animation keys. |
| **Named camera** | A saved, keyable shot with its own controls, name, optional hotkey, and follow link. |
| **Switch** | Evaluates the Camera switcher channel at the current frame. Select a named camera to edit its controls. |

Compose a view and click **Capture camera** to save its current framing. Capture works from Preview, another named camera, or the current Switch shot. Projects support up to 32 named cameras. Rename a shot and assign a unique hotkey 1–9 in **Named shots**. With the Camera editor open and the canvas focused, a shot hotkey selects its view; it does not insert a cut.

Delete removes the camera's animation tracks and references from cut tracks. Undo restores the camera and its references. If there are no cut keys, Switch uses the first available camera.

## Camera tools and framing

Choose a tool in the Camera editor, then drag on the canvas:

| Tool | Canvas gesture |
| --- | --- |
| **Track** | Drag to shift camera X/Y framing. Shift constrains the movement to one axis. |
| **Zoom** | Drag upward to zoom in, downward to zoom out. |
| **Roll** | Drag horizontally to rotate the shot. |
| **Pan / tilt** | Drag horizontally for yaw and vertically for pitch. Shift constrains the movement to one axis. |

The wheel zooms the active camera while the Camera tool is selected. Numeric fields and sliders provide precise controls. **Escape** cancels a drag; a completed drag makes one Undo entry.

**H** selects the Hand tool to pan the editor workspace. The bottom-left workspace zoom buttons also affect only the workspace, leaving the saved camera unchanged.

- **Focus object** frames selected artwork or the artwork attached to a selected bone and its descendants. Select the object through the rig's layer/bone list.
- **Focus all** frames all visible artwork with a margin. **F** focuses the selection, or all artwork when nothing is selected.
- Focusing a linked camera unlinks it and records the new framing in one Undo step.
- **Reset camera view** resets tracking, zoom, yaw, pitch, and roll.
- **Show safe-frame and thirds guides** overlays a 90% safe frame and rule-of-thirds lines. Guides are editor-only and are excluded from exports.

## Animate a camera

1. Capture or select a named camera and establish its frame-zero view.
2. With **Auto-key** enabled, choose a later frame and adjust a camera tool, field, or slider.
3. The changed channels receive keys at the chosen frame. Their first animated edit includes a frame-zero baseline.
4. Scrub or play to see interpolation. **Key camera** explicitly records all camera controls, including at frame zero or with Auto-key disabled.
5. Use **Channels → Camera only** to move, copy, paste, delete, or change interpolation with the existing keyframe tools. **Add key** keys the selected camera in this scope.

Frame-zero edits update the saved camera setup and any existing frame-zero control keys. With Auto-key disabled, ordinary edits change the camera's setup settings rather than create new keys; existing animation tracks take over again when seeking or playing.

Camera animation includes tracking X/Y, zoom, roll, yaw, pitch, depth perspective, and projection mode. Numeric channels use the timeline's easing options. Projection changes, cuts, follow links, and follow-framing corrections are always held until the next key.

## Cut between shots

At the desired frame, click the scissors button beside a named shot. This records a **Camera switcher → Camera cuts** key and selects Switch view. A first cut after frame zero establishes the first camera at frame zero.

Cut keys support selection, group retiming, clipboard operations, deletion, and Undo/Redo. Cuts remain held even if a numeric interpolation option is chosen. Editing a named camera while Switch is active requires first selecting that named view.

## Follow a subject

Choose a named camera and select a bone or layer in **Follow object**. The link anchors the target's current world position and compensates subsequent target movement. At frame zero the link becomes the setup; at later frames it creates a held follow key.

Choose **None · static camera** to unlink without a framing jump. A separate held **Follow framing offset** channel preserves the view without rewriting earlier pan curves. Select both follow and framing-offset keys when retiming or copying a link change that has a correction. Links can be changed again at frame zero after later follow keys have been authored.

## Projection, editing, and export

- **Perspective** uses the existing per-layer depth scaling and parallax. **Depth perspective** controls its strength.
- **Orthographic** uses uniform camera zoom and pan rather than depth-dependent scaling/parallax. Yaw, pitch, roll, and depth-plane ordering still apply.
- Camera rendering uses the existing 2.5D flat artwork planes. Pan/tilt foreshortens those planes; Zoom/lens is a framing scale rather than a physical focal-length simulation. Side/back views use the supplied artwork, and arbitrary SVG path bounds for Focus are approximate.
- Camera and enabled Stage views protect artwork from canvas posing/editing while retaining playback and camera-channel editing. To edit/import artwork or motion, choose **Preview** and disable **Stage → Enable 2.5D preview**.
- Camera definitions, selected view, channels, links, and cuts persist in project JSON and autosave. SVG/PNG exports evaluate the active view and frame using the same projection as the canvas, independently of workspace pan/zoom.

Character turning is authored separately in **Character views**, with supplied front/side/back artwork and its own angle channels. See [Multi-view characters and custom creatures](CHARACTER_VIEWS.md) for arbitrary rigs, independent head/body controls, and a custom frog example.

**Video → Render camera → Timeline camera cuts** renders the shot sequence and project audio to MP4/WebM. See [Final video export and the frog car ride](VIDEO_EXPORT.md) for the complete open/play/render workflow and downloadable result.

## Research references

The workflow combines Moho's published animated camera tools with Cartoon Animator's Preview/custom/Switch cameras. Reallusion documents multiple custom cameras, follow links, and camera switching as additions in **CTA 5.3**.

- [Moho: Track, Zoom, Roll, Pan/Tilt tools](https://www.lostmarble.com/moho/manual/camera_tools.html) — publicly available legacy manual.
- [Moho: camera and depth tutorial](https://www.lostmarble.com/moho/manual/tut06/07/index.html).
- [CTA: Camera toolbar and Preview/Switch views](https://manual.reallusion.com/Cartoon-Animator/Content/Resources/ENU/01_User_Interface_Introduction/Camera_Tool_Bar.htm).
- [CTA 5.3: Camera editor and projection modes](https://manual.reallusion.com/Cartoon-Animator/Content/Resources/5.3/08-Animation/Camera-Animation/UI-Intro-for-Camera-Editor.htm).
- [CTA 5.3: Custom cameras](https://manual.reallusion.com/Cartoon-Animator/Content/Resources/5.3/08-Animation/Camera-Animation/Creating-Custom-Cameras.htm).
- [CTA 5.3: Follow cameras](https://manual.reallusion.com/Cartoon-Animator/Content/Resources/5.3/08-Animation/Camera-Animation/Creating-Follow-Camera.htm).
- [CTA 5.3: Camera-switch effects](https://manual.reallusion.com/Cartoon-Animator/Content/Resources/5.3/08-Animation/Camera-Animation/Creating-Camera-Switch-Effect.htm).

## Verification and visual proof

`tests/camera.test.mjs` covers normalization, Preview isolation, capture, interpolation, held cuts, deletion, following/unlinking, earlier-frame preservation, frame-zero follow edits, stale overrides, projection modes, focus, camera-key editing, gesture history, read-only artwork protection, and JSON/SVG round-trips.

Chromium verification exercised the visible tools, camera cuts during playback, follow positioning, key retiming and held interpolation, Preview/Capture, gesture Undo/Redo/cancellation, Shift constraints, projection and guides, shortcuts, workspace-only Hand panning, focus, linking/unlinking, explicit keys, and SVG/PNG export. No browser runtime errors were reported.

- [Wide shot — frame 0](camera-wide-proof.png)
- [Close-up cut — frame 80](camera-closeup-proof.png)
- [Follow shot — frame 110](camera-follow-proof.png)
- [Camera tool manipulation — frame 24](camera-tools-proof.png)
