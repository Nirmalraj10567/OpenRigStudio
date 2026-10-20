# Reference girl — v3

Open `reference-girl-v3-physics.json` in the updated Character Studio.
The project opens at the reference pose with physics **enabled**.

## Playback and posing

- Press **Play** on **Secondary motion · chest & cloth**. A gentle body weight
  shift drives the physics; the chest control bones have only setup keys.
- Choose **Reference girl · angle review** in the timeline to review eight views.
- **IK Pose (I)** poses arms/legs; **Alt-drag** rotates one joint.
- Chest skin and jacket have shared mesh weights to the two **Chest** control
  bones. Collar, neck, and waist remain anchored to the body.
- Skirt drape and lower-hem bones still support authored posing. Cloth adds a
  secondary deformation to that pose, with its waistband vertices pinned.

## Hands and seam masking

Hands have separate fill silhouettes, open wrist contours, and fine finger lines.
Each hand masks the forearm's covered strokes; each forearm masks the upper arm's
elbow join. Select these layers to inspect their **Patch** settings.

**Keep this artwork’s outlines and finger details** lets a patch suppress another
layer's seams while retaining its own contours. Existing fill-only patches keep
their previous behavior. Both the live Canvas renderer and SVG/PNG export support
this setting. No circular joint cover is added to the hands.

## Dynamics & physics controls

Select **Chest · left/right jiggle control** in the Dynamics list:

- **Stiffness / damping / mass** control response and settling.
- **Influence** controls how much secondary motion reaches the artwork.
- **Overlap** controls how much the spring lags the parent.
- **Maximum jiggle travel** bounds displacement in stage pixels (4 px here).

The new **Jiggle · translation** preset works on any bone. It responds to vertical
and lateral movement, unlike angular springs. Attach or skin artwork to that bone.

Select the **Coral floral wrap skirt** cloth object:

- Pinned waistband vertices follow the skinned pose exactly.
- **Follow animated pose** carries the cloth with the rig while allowing inertia.
- **Adapt rest shape** updates edge lengths for turns and scaling.
- **Maximum cloth travel** bounds deformation from the skinned pose (12 px here).
- **Wind X / wind variation** and gravity affect the free hem.
- Use **M**, select a vertex, then **Toggle selected pin** to edit attachments.

Simulation is deterministic when seeking or reopening the JSON. **Build cache**
saves a replay cache; **Bake to keys** creates an editable clip. Changing a preview
angle invalidates an incompatible physics cache. Bone translation offsets are
included in caches and baked transforms.

## Verification

`npm test` covers spring bounds/settling, cache and bake round trips, cloth pose
following, manual/Smart Bone angle changes, and the character's skin weights.
`node tests/referenceGirl.browser.mjs` opens the saved JSON in native Chrome,
checks both renderers' joint-mask pixels, checks for mesh cracks, and verifies the
new Dynamics controls in the actual editor.

The supplied eight-angle artwork is a 2D multi-view rig; side/back designs are
inferred from the single front reference. Cloth is a 2D constrained mesh, not a
volumetric garment simulation.
