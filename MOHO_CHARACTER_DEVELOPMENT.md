# Moho Pro–referenced full-character development

Advanced bone constraints, target/pin bones, squash/stretch, influence regions, constraint keys, and solver debugging are documented in [ADVANCED_CONSTRAINTS.md](ADVANCED_CONSTRAINTS.md).
The nested layer-stack workflow for folders, switch containers, ordering, inherited transforms, isolation, and group clips/masks is documented in [LAYER_HIERARCHY.md](LAYER_HIERARCHY.md).
Use [MASKING.md](MASKING.md) for shoulder, hip, hair, face-edge, and torso seam compositing, and [SMART_ACTIONS.md](SMART_ACTIONS.md) for reusable head/body turn action management.

This guide translates the standard Moho Pro character-development workflow into Character Studio terminology. Moho’s official feature reference describes Smart Bones as control levers for facial expressions, face rotations, and full body turns; it also highlights FK/IK, constraints, meshes for vectors/images, Vitruvian Bones, layered drawing control, and timeline interpolation. Character Studio provides the corresponding workflow in a browser-friendly data model while keeping authored art and evaluated turn poses separate.

Official reference: [Moho Pro features](https://moho.lostmarble.com/pages/features).

## Proof video

- [Full-character 360 turn proof video](moho-character-turn-proof.mp4)
- [Editable proof project](moho-character-turn-proof.json)
- [Five-stage decoded montage](moho-character-turn-frames.png)
- [Video render dialog proof](moho-turn-video-proof.png)
- [Smart Bone + mesh expression proof video](smart-bone-mesh-proof.mp4) · [decoded expression stages](smart-bone-mesh-frames.png)

The proof project is the editable **Moss · Smart Bone 360° frog** demo. It contains eight prepared views, a `Moss_Turn · Smart Bone 360°` driver, and a Smart Action that drives the prepared view angle from 0° through −360°. The video was rendered through the editor’s **Video** dialog using the current viewport, with the editor overlays excluded.

## The complete production order

### 1. Design the character as animation parts

Prepare a neutral front drawing and separate any element that must cross another element during a turn:

- torso, pelvis, neck, head, ears, hair and facial features;
- upper/lower arms, hands, upper/lower legs and feet;
- clothing panels, patches, props and mouth shapes;
- alternate front, profile, three-quarter and rear drawings where point deformation cannot preserve the design.

Import local PNG/JPEG/WebP/SVG artwork or draw vector layers. A single flattened image can be rigged with a deforming mesh, but cut-out layers are required when limbs, hair, ears, hands, or clothing must pass in front of and behind the torso.

### 2. Build the bone hierarchy

Use **B** to create bones from the root outward. Keep the hierarchy meaningful:

```text
Root
├── Pelvis
│   ├── Torso
│   │   ├── Neck
│   │   │   └── Head
│   │   ├── Upper arm → Forearm → Hand
│   │   └── Upper arm → Forearm → Hand
│   └── Thigh → Shin → Foot
└── Turn controls
    ├── Head_Turn
    ├── Body_Turn_X
    └── Body_Tilt_Y
```

Map separate layers with **L** for rigid parts. Use **I** for IK posing and Alt-drag for single-bone FK. Lock torso/root ancestors when posing a limb. IK/FK is the everyday pose system; Smart Bone Actions are reusable corrections layered on top of it.

### 3. Decide between cut-out, mesh, and alternate views

Use a rigid layer when a drawing should follow one bone. Use a mesh when one image must bend across several bones. Use **Character views** when a turn needs a prepared drawing, alternate visibility, a different layer order, or a different silhouette.

| Need | Character Studio tool | Moho concept |
| --- | --- | --- |
| Separate arm follows forearm | Rigid binding | Bone binding |
| One shirt image bends across torso/arms | Triangle mesh + weights | Smart Warp/mesh deformation |
| Eye, ear, hand or hair swaps at profile | Character view artwork/visibility/order | Switch/Vitruvian/layer alternatives |
| Independent head and body turns | Separate view sets | Independent Smart Bone/Vitruvian controls |
| Small corrective bend or expression | Smart Bone Action | Smart Bone Action |

For a mesh: select artwork, press **M**, create a triangle grid, choose influencing bones, then **Auto weights / rebind rest pose**. Refine vertex weights and drag vertices in Mesh mode. UVs stay fixed, so the same image is rendered through the deformed triangles.

### 4. Create the head-turn control

1. Open **Smart Bone Actions**.
2. Create a floating control bone named `Head_Turn`, or select an existing control bone.
3. Set a bounded action range such as **−180° to 180°** for a full turn, or **−90° to 90°** for a left/right correction.
4. Create the action from the neutral authored pose. Its start angle is the neutral baseline.
5. Check the head, face, hair, ears, eye, nose, mouth and head mesh targets.
6. **Edit key** at the left/profile/three-quarter angle. Select each target and use **Properties** to move facial features, change visibility/layer order, or use **M** to reshape the head mesh. Compress the far eye and change visibility/order for the far ear, nose, hair, mask, or patch layer. **Capture key**.
7. Repeat at front, opposite profile and rear angles. Use intermediate keys wherever the design needs a controlled silhouette rather than a straight interpolation.
8. Preview the driver slider or animate the driver bone’s rotation on the main timeline.

Smart Action transform and mesh corrections are interpolated continuously. Visibility and layer order are discrete and switch at the midpoint between authored keys. This prevents invalid half-visible and half-layered states while preserving the smooth face deformation.

For a production head, keep facial features as separate targets when they need independent masks/order. A single flattened face can still use a mesh, but hidden rear features cannot be recovered from pixels that were never authored.

### 5. Create the body-turn controls

Use separate controls so the body can turn independently from the head:

- `Body_Turn_X`: left/right yaw, torso silhouette, shoulder/hip offsets, clothing and limb order;
- `Body_Tilt_Y`: vertical lean/foreshortening or a second Smart Bone Action for pitch;
- optional `Chest_Twist`, `Arm_Front_Back`, or `Hand_Palm_Switch` controls for localized corrections.

For each action, capture the torso mesh and the relevant cut-out layers. At profile and rear keys, switch the far arm/leg behind the torso, hide patch strokes that should disappear at a seam, and show the alternate hand or clothing drawing. Use a Character view set for broad prepared angles and Smart Bone Actions for local continuous corrections.

Create a **Head** view set from head bones/artwork and a **Body** view set from the remaining targets. Each set has its own angle channel. The shared bone hierarchy still lets the head follow the body while its view angle remains independent.

### 6. Add facial expression and lip sync

Create separate Smart Bone Actions such as `Smile`, `Brow`, `Blink`, and `Mouth_Open`. Mesh targets can receive expression morphs; opacity can fade expression layers. Map mouth drawings through the Lip Sync panel and import Rhubarb cues or draft from audio amplitude. Keep the neutral mouth as the X/rest mapping so disabling lip sync leaves one controlled drawing visible.

Expressions and head/body turns evaluate non-destructively. They add corrections to the authored pose; they do not bake over the base bones, mesh weights, UVs, or view definitions.

### 7. Animate the performance

1. Record frame-zero setup keys for body pose, head/body dials, and essential mesh channels.
2. Use IK/FK and ordinary pose keys for acting and locomotion.
3. Animate the Smart Bone driver rotations instead of editing every affected target.
4. Add Character view angle keys for broad head/body turns. Use **Channels → Character views** to retime or ease them.
5. Use held/step timing for deliberate drawing or layer switches and smooth timing for point/mesh movement.
6. Add camera, audio, lip-sync and secondary motion after the primary pose reads correctly.

### 8. Inspect and export

Scrub front, three-quarter, profile and rear keys. Check that:

- facial features stay inside the intended head silhouette;
- far-side features disappear behind the mask at the correct angle;
- shoulders, hips, hands and clothing do not expose unwanted seams;
- meshes retain valid triangles, weights and UVs;
- head and body controls remain independent;
- Smart Actions do not recursively drive their own controllers;
- alternate artwork and layer order survive JSON, SVG, PNG and video export.

Use **Video → Render final video** for a private, frame-by-frame render. The renderer evaluates Smart Bone Actions, meshes, character views, camera cuts and audio without changing the editor pose or Undo history.

## What is implemented here

- Smart Bone Actions with arbitrary degree ranges, multiple captured keys, transform/opacity/mesh corrections, independent drivers, undoable authoring, and non-recursive evaluation.
- Smart Bone capture of discrete layer visibility and z-order switches for profile/rear patches and front/back limb ordering.
- Triangle meshes for vector and image layers, weighted deformation, vertex editing, UV preservation, morph keys, rigid-to-skin conversion, and SVG/PNG rendering through the deformed triangles.
- Character view sets with arbitrary targets, independent head/body ownership, up to eight prepared frog/human views, custom artwork, alignment, per-view visibility/order, optional mesh corrections, and 0–360° angle keys.
- FK/IK posing, rigid bindings, audio-aware lip sync, cameras, persistence, and video export.
- Advanced angle, translation, scale, distance, direction, pin, target, parent-blend, and squash/stretch constraints with animated settings, spatial influence falloff, visualization, and debug diagnostics.

## Boundaries compared with full Moho Pro

The editor does not claim `.moho` file compatibility or every Moho Pro feature. It does not automatically segment imported art, invent hidden pixels, provide a paint-weight brush, or implement full masking/patch-layer compositing, Vitruvian bone sets, angle-control bones, animated bone-lock solving, dynamics, physics, Curvers, or a full 3D camera. Use separate layers and prepared character views where those workflows require authored alternate artwork.

The result is a Moho-referenced pseudo-3D workflow: Smart Bone dials drive authored 2D transforms and mesh morphs, while character view sets handle prepared silhouettes and discrete drawing changes.
