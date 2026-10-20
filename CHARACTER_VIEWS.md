# Multi-view characters and custom creatures

Open **Character views** in the right dock or context toolbar. This system accepts arbitrary bones and artwork layers, including people, frogs, other animals, and unrigged images. Bone names and a human skeleton are not required.

For a complete Character Studio JSON example with generated rig hierarchy, shirt design fields, multi-angle JSON, and turn keyframes, see [CHARACTER_STUDIO_JSON.md](CHARACTER_STUDIO_JSON.md).

## The supplied angle reference

| View | Character angle |
| --- | --- |
| Front | 0° |
| Front Side | −45° |
| Side | −90° |
| Back Side | −135° |
| Back | −180° |

**Add reference angles** creates these five slots. **Add full 8 angles** also adds +45°, +90°, and +135° for the opposite side. Custom angle values and names are supported. A project can contain up to 32 independent view sets, each with up to 32 views.

Adding or duplicating an angle copies the existing view configuration. Supply the corresponding artwork and alignment to create a distinct drawing for that angle.

## Try the demos

Choose **Human turn demo** or **Frog turn demo**, then set timeline **Channels → Character views** and press **Play**. **Frog Smart Bone 360°** loads the same existing frog art with one Smart Bone driver; set timeline **Channels → All objects** and press **Play** to watch the dial drive the turn.

- Frame 0: Front.
- Frame 24: Front Side.
- Frame 48: Side.
- Frame 72: Back Side.
- Frame 96: Back.
- Frame 120: completes the full turn through the opposite-side views.

Both examples have eight prepared views. The human changes face/profile/rear-helmet and front/rear jacket artwork. The frog has its own creature skeleton, webbed feet, front and side facial artwork, rear dorsal markings, per-view eye/mouth visibility, and limb ordering.

**Reference sheet** displays the five reference angles side by side, with optional bone overlays. It frames the selected set in a neutral camera for comparison, without changing the project, camera, or timeline keys. Undo restores your project after loading a demo.

## Set up your own character or frog

1. Import or draw the character's parts and build/bind its rig as usual. A single flat image also works as a view-set target.
2. Open **Create a character / head / body view set** and enter a name.
3. Select the required bones and artwork. **Selected branch** selects a chosen bone, descendants, and attached/weighted artwork; **All unassigned parts** selects all available targets.
4. Click **Create from … parts**. The current setup becomes the baseline and Front view.
5. Expand **Author angle artwork**, then add the five reference angles, all eight angles, or a custom angle.
6. Select **View to edit** and click **Preview this view · no angle key**. This previews the drawing without recording a turn; seeking or playing clears the temporary preview.
7. Select a **Part / bone** and configure that view:
   - Local X/Y, rotation, and X/Y scale for artwork and bone alignment.
   - Bone length for joint-tip placement.
   - Visibility, opacity, and layer order for artwork.
   - **Replace artwork for this view** to embed a local PNG, JPEG, WebP, or SVG image.
   - Artwork width/height and local alignment for imported drawings.
   - **View-specific vector colors** for vector variants.
8. Repeat for each prepared angle and inspect the Reference sheet.

View alignment uses the rig's existing local-coordinate and binding conventions. Align each joint and part to its view artwork. Canvas FK/IK and mesh tools remain available for posing the animated character. New artwork imports are fitted to the part's existing bounds; local alignment controls position the drawing at its intended pivot.

Use consistent texture coordinates/bounds when replacing artwork on a meshed part; the mesh topology and UVs remain shared. Compatible per-view mesh points can also be stored through the engine API.

**Restore part from setup** copies the captured setup into the selected view. **Delete this angle** removes an angle while retaining the other views. **Delete set** removes its definition and angle tracks while preserving the rig and artwork.

## Multiple characters and independent head/body turning

Each view set has its own targets, angle, and timeline channel. To create independent controls:

- Create a head set from the head's bones and artwork, then a body set from the remaining parts.
- Create separate sets for different characters in a scene.
- Use **View set parts** to add newly imported parts to an existing set. New members start with their setup in every angle.
- Uncheck a member to release it for another set. This preserves the base part and removes its overrides from the old set.

A part belongs to one view set, making independent controls deterministic. Bones still inherit the shared hierarchy, so a head can follow its body's movement while using a separate head-view angle.

## Animate a turn

1. Choose the character/view set and establish its frame-zero angle.
2. Enable **Auto-key**, choose a later frame, and change **Character angle**, its slider, or a view preset.
3. The first animated change records a frame-zero baseline and the later angle key. **Key angle** explicitly records the current angle, including with Auto-key disabled.
4. Choose **Channels → Character views** to retime, copy/paste, delete, or ease turn keys. **Add key** in this scope keys the selected view set.

Angle keys are numeric degree-valued channels. Use 0° → 360° for one full turn or 0° → −360° for the reverse direction. Intermediate keys control the timing through particular views; Step interpolation makes discrete angle changes.

**Blend alignment** interpolates compatible local transforms, lengths, opacity, and mesh points between adjacent views. Artwork, visibility, and layer order use the nearest prepared view, switching at the angular midpoint rather than blending unrelated drawings. Disable Blend alignment to hold the complete nearest-view configuration.

**Wrap 360°** joins the last and first views across the rear seam. With it disabled, evaluation clamps to the prepared view range. Frame-zero edits update the setup and existing frame-zero keys. Ordinary edits with Auto-key disabled change the setup; existing animation takes over again when seeking or playing.

## Camera, persistence, and export

Character angle is separate from camera yaw/pitch/roll. Turning changes prepared character configurations; the camera controls composition and staging. Character-angle keys remain editable in staged camera views alongside camera keys.

Evaluation keeps authored transforms, artwork, mesh UVs, and bindings intact. Prepared view corrections compose with regular animation and Smart actions. View-specific sprites can be used on mouth/eye layers while the existing lip-sync system continues to select the active mouth layer. Smart Edit suspends view evaluation during its edit session.

Definitions, membership, view artwork, and angle tracks persist in project JSON, autosave, and Undo/Redo. SVG and PNG export use the evaluated view artwork, visibility, order, transforms, and mesh at the current frame. Legacy projects load with no view sets.

**Video** renders animated character views together with camera cuts and project audio. See [Final video export and the frog car ride](VIDEO_EXPORT.md) for a complete editable scene and its rendered MP4.

## Implementation and verification

- `src/engine/characterViews.ts`: normalization, sampling, membership, artwork overrides, and turn keying.
- `src/engine/Rig.ts`: non-destructive view/pose/mesh composition and resolved rendering layers.
- `src/ui/CharacterViewsPanel.tsx`: custom setup, angle authoring, artwork import, and reference sheets.
- `src/engine/characterViewDemo.ts`: original human and frog eight-view examples.
- `tests/characterViews.test.mjs`: 12 regressions for arbitrary targets, independent controls, wrapping, sprite/visibility/order changes, animation composition, membership, mesh editing/binding, history, cleanup, and persistence/export.

Chromium verified actual canvas changes, all five reference angles, playback, reference-sheet bone overlays, key retiming, custom SVG replacement, per-view alignment/visibility, Undo/Redo, JSON/SVG parity, PNG export, and custom-set creation/membership. No browser runtime errors were reported. Existing camera, stage-angle, and keyframe browser checks also passed.

### Visual proof

- [Custom frog — five-angle reference sheet](frog-view-sheet-proof.png)
- [Human — five-angle reference sheet](human-view-sheet-proof.png)
- [Frog front](frog-front-proof.png) · [Side](frog-side-proof.png) · [Back](frog-back-proof.png)
- [Custom frog SVG artwork replacement](frog-custom-artwork-proof.png)
- [Full-character 360 turn proof video](moho-character-turn-proof.mp4) · [decoded five-stage montage](moho-character-turn-frames.png)
