# Binding, mesh deformation and Smart Bone actions

Mouth animation and audio-synchronised lip-sync workflows are documented in [LIP_SYNC.md](LIP_SYNC.md).
Facial profiles, expression controls, audio drafts, and webcam performance capture are documented in [FACIAL_ANIMATION.md](FACIAL_ANIMATION.md).
Advanced angle, translation, scale, distance, direction, pin, target, parent blending, squash/stretch, influence falloff, keyframe, and debug workflows are documented in [ADVANCED_CONSTRAINTS.md](ADVANCED_CONSTRAINTS.md).
Layer folders, nested groups, inherited transforms, switch containers, isolated editing, ordering, and group clips/masks are documented in [LAYER_HIERARCHY.md](LAYER_HIERARCHY.md).
Ordered alpha/clipping masks, Boolean mask operations, inversion, patch layers, seam hiding, and masked mesh rendering are documented in [MASKING.md](MASKING.md). Professional Smart Bone authoring is documented in [SMART_ACTIONS.md](SMART_ACTIONS.md).
Precise value graphs, Bezier handles, tangent/velocity editing, curve presets, filtering, and curve clipboard workflows are documented in [GRAPH_EDITOR.md](GRAPH_EDITOR.md).
Cycles, ping-pong playback, clip retiming/trimming/stretching, additive/override pose blending, animation layers, and motion transitions are documented in [NLA.md](NLA.md).
Bone springs, hair/tail chains, cloth/soft-body meshes, forces, particles, collisions, deterministic caches, and bake-to-keyframe workflows are documented in [DYNAMICS.md](DYNAMICS.md).
True 3D layer transforms, physical camera lenses, depth of field, imported/generated geometry, lighting, shadows, production camera rigs, bookmarks, transitions, live control, Puppet Stage mode, and live stream output are documented in [CAMERA_3D.md](CAMERA_3D.md).
For the complete Moho Pro–referenced character pipeline, including independent head/body 360 controls, read [MOHO_CHARACTER_DEVELOPMENT.md](MOHO_CHARACTER_DEVELOPMENT.md).
For the Character Studio JSON format, shirt design manifest, generated bone hierarchy, multi-angle view sets, and angle animation examples, read [CHARACTER_STUDIO_JSON.md](CHARACTER_STUDIO_JSON.md).

## Try the working example

1. Open the studio and click **Rigged example**. If a project is open, confirm replacement; **Undo** restores it. Save/download your project first if you want a separate permanent copy.
2. The example contains 14 separate vector artwork layers, already mapped to named bones. Its torso is locked so moving a limb does not move the whole body.
3. In **IK Pose** (`I`), leave **Chain: 2 · limb** selected. Drag the shaft or tip of a **lower arm** or **lower leg**. Hold **Alt** while starting a drag to rotate only that bone (FK).
4. To animate, choose frame 24, pose a limb, then click **Key pose**. Return to frame 0 and play. Key pose records the affected chain together.

## Rigid binding for separate artwork

1. Import separate transparent images (or draw vector layers) for the body parts: torso, head, upper arm, forearm, and so on.
2. Press `B` and drag from a joint to create its bone. Starting near an existing bone tip makes a child. Check **Parent bone** in Properties and the indented bone list.
3. Press `L`. Choose the artwork in **Source**, then click its bone on the canvas or in the bone list. The mapping appears as `Artwork → Bone`, and the mapped bone is amber. You can also use **Mapped bone** in artwork Properties.
4. Press `I` to test the pose. `V` moves a selection; it is not a posing tool. Use **Unbind source artwork** to detach it without an immediate visual jump.

**Bones**, **Names**, and **Grid** above the canvas control the overlays. Teal tapered outlines show bones; amber marks selection/mapping. Lock/unlock joints in the bone list. A locked ancestor stops an IK chain. Escape cancels a drag; Undo restores a completed gesture.

## Deform a single flattened image with several bones

1. Import the image, draw its bones with `B`, and return to an unposed/rest configuration before setting initial weights.
2. Select the image in Layers and press **M**. In **Mesh & weights**, choose grid columns/rows (2–16) and click **Create triangle mesh**. Vector artwork also supports meshes.
3. Check only the bones that should affect this artwork. Click **Auto weights / rebind rest pose**. This records the current skin rest pose and assigns normalized distance-based weights, using up to four nearby checked bones per vertex. Rebinding replaces existing weights.
4. Press **I** and pose a bone chain. Different regions of the *same image* now move with different bones; the texture is drawn through the deformed triangles.
5. Press **M** to refine the mesh. Click or select a vertex by index; edit its per-bone weights (0–1), assign 100% to a bone, or clear its weights. Choose **Heatmap influence** to see that bone's weights. A lone nonzero influence normalizes to 1. Clearing all weights leaves that vertex unweighted.
6. Drag a vertex to adjust the artwork directly. UVs stay fixed while positions change. Escape cancels; each completed drag has one undo step. Only one vertex is selected at a time.

Mesh mode takes priority over rigid mapping. Use mesh influence controls rather than the rigid Mapped bone dropdown. Removing the mesh removes its morph data and restores ordinary artwork; use Undo if you want it back.

## Create a Smart Bone expression

1. Create all target artwork first. Create meshes first if the expression will deform vertices.
2. In **Smart Bone Actions**, choose a driver bone or click **Create floating control bone**. Set the action name and start/end angles in degrees, then click **Create Smart Bone Action**. The current authored transforms, opacity, visibility, layer order and mesh positions become the baseline; the start angle is initially neutral.
3. Choose the action and check the targets to capture. The driver cannot target itself. Choose an edit angle in range (for example 90°), then click **Edit key**.
4. Click target names to select them. Change their transforms, opacity, visibility or layer order in Properties/Style, or press **M** and reshape target mesh vertices. The timeline, other actions and structural edits are suspended during authoring.
5. Click **Capture key**. The normal authored pose is restored, and this key's deltas are stored as one undo step. Visibility and layer order are discrete switches, selecting the nearest key at the midpoint. **Cancel edit** discards the entire edit and restores its previous pose and history.
6. Move **Preview driver rotation**, or Alt-drag the floating bone with **I**, to drive the expression. Keys interpolate and clamp to the action range. Multiple enabled actions add non-destructively; rename, disable or delete actions in the panel. Editing an existing angle replaces the checked targets at that key.

Targets must exist when the action is created. Driver values are read from authored local rotation, so actions do not recursively trigger other actions through their evaluated output. Use independent floating controls for independent expressions.

## Try the deformation example

Click **Deformation example** (confirm replacement; Undo restores your project). **Ripple** includes:

- One flattened striped image with a triangle mesh and three weighted ribbon bones.
- A separate floating **Smile dial** driving a mouth mesh and eye squint.
- Editable weights, meshes, neutral/expression keys and frame-zero animation keys.

Use **I** on the ribbon bones. Select the smile action in the dock and move its preview slider between 0° and 90°. Use **M** on the mouth to inspect its morph grid.

## Animate, save and export

Record an initial **Add key** at frame 0. At another frame, pose bones, rotate an expression driver or move mesh vertices, then use **Key pose** / **Add key**. Driver transform tracks evaluate Smart expressions during playback; mesh tracks interpolate authored x/y coordinates without changing UVs or weights. Keep mesh topology fixed across animation keys.

Project JSON and autosave retain meshes, bind matrices, weights, actions and animation data. JSON Open round-trips the editable project. SVG exports the evaluated artwork through clipped, transformed triangles; PNG rasterizes that SVG in the browser. Exports omit editing overlays and preserve image pixels rather than converting bitmap textures to vector paths. Save/export and autosave do not write an unfinished Smart edit; Capture or Cancel first.

## Limits

Meshes warp existing pixels; they do not automatically identify body parts, recover hidden pixels behind an arm, remove an image's background, or separate overlapping limbs into independent drawings. Cut-out artwork is still useful when pieces must cross independently. A screenshot can be imported as an image, but is not an editable Moho rig.

This implements grid-based linear-blend skinning, per-vertex weights, a normalized weight-paint brush, mesh morphs, rotation-driven action keys, discrete Smart Bone layer switches, and a non-destructive runtime constraint solver. It does not claim full Moho parity or `.moho` file compatibility. Weight painting changes influences only; UVs and topology remain fixed. Sharp folds can produce overlapping triangles; refine your weights/rest mesh accordingly.

## Verification

- `npm test` — the full suite covering rigging, skinning, advanced constraints, Smart Action evaluation, nested layer groups, ordered masking, patch seams, action authoring, graph editing, nonlinear animation layers, dynamics/caching/baking, layer switches, timelines, lip-sync cues, simulated audio transport, serialization and renderer/export commands.
- `npm run build` — TypeScript and production build.
- Chromium verification covers the Smart Bone frog-turn authoring workflow, character-view authoring, camera tools, scene playback, and final video rendering. Smart Action visibility/order behavior is covered by the deformation-engine regression test.

### Video proof

- [Smart Bone + mesh expression proof video](smart-bone-mesh-proof.mp4) · [decoded stages](smart-bone-mesh-frames.png)
- [Video render dialog proof](smart-bone-video-proof.png)
