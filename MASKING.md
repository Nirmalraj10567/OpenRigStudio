# Masking and patch-layer compositing

Character Studio now evaluates masking as an ordered compositing stack instead of treating a mask as a single rectangular clip. The stack belongs to a layer group and survives JSON save/open, animation, Smart Bone edits, SVG export, and mesh deformation.

## Mask stack

Each group mask entry stores:

- source layer;
- `alpha` or geometric `clip` kind;
- `add`, `subtract`, or `intersect` operation;
- opacity and enabled state;
- inverted state;
- source visibility (`hideSource`);
- edge behavior (`hideEdge`).

The stack is evaluated in list order. Add combines coverage, subtract removes coverage, and intersect restricts the accumulated coverage. Inverted sources reverse coverage before the operation. A clipping entry uses its evaluated geometry; an alpha entry uses the evaluated source alpha. A mask source can be a vector, image, or deformed mesh layer.

Use the **Mask stack** controls on a selected group to add alpha/clipping sources, change Boolean operations, invert a source, reorder entries, hide the source artwork, and key the complete stack. Mask guide layers remain hidden from ordinary artwork output while still rendering into the offscreen mask surface.

## Patch layers and seams

A selected artwork layer can be marked as a **Patch layer**. Patch layers may list target layers whose exposed stroke/seam edges they cover. **Hide edges / seams** removes the target stroke around the patch boundary while preserving the target fill. `Seam width` expands the cover region, which is useful for shoulders, hips, hairlines, face edges, torso overlaps, and clothing joins during a turn.

Patch settings are animatable through the same timeline track system as mask stacks. This allows a far shoulder patch, rear hair cover, or torso seam patch to appear only at the relevant Smart Bone angle.

## Render and export behavior

Canvas rendering composites each group into an isolated surface, evaluates child order and switch containers, applies the ordered mask stack, then blends the result back into the parent. Masking therefore applies to vectors, images, rigid layers, and skinned meshes consistently. SVG export emits equivalent `mask` and `clipPath` definitions, preserving Boolean order, inversion, group blend mode, and patch seam behavior.

## Recommended 360° structure

```text
Character
├── Body group
│   ├── Torso fill
│   ├── Far shoulder patch
│   └── Torso seam mask
├── Head group
│   ├── Face fill
│   ├── Hair back
│   ├── Hair edge patch
│   └── Face edge clip
└── Turn switch
    ├── Front drawing
    ├── Side drawing
    └── Back drawing
```

Keep broad silhouette masks in a parent group and local seam patches close to the layers they cover. Use switch containers for alternate drawings and masks/patches for continuous overlap corrections.
