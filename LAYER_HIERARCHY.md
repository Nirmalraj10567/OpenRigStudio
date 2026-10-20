# Layer hierarchy, folders and switch containers

Character Studio uses a persisted layer hierarchy for cut-out character artwork. Artwork leaves keep their existing layer IDs and animation channels, while folders are stored as first-class group nodes alongside the legacy flat layer maps. Older project JSON without groups continues to load with every artwork layer at the root.

## Layer tree

The Layers panel shows root artwork and folders in render order. A folder can contain artwork leaves or other folders. **Add layer folder** creates a group beside the current selection; selecting a folder and using the same control creates a nested folder. Select an item, then use the folder's adopt control to reparent it. Reparenting preserves the evaluated pose, including the folder transform and existing rigid bone mapping.

Each group stores:

- `parentGroupId` and ordered `childIds`;
- authored local transform and derived world transform;
- visibility, lock state, opacity, and render order;
- Canvas/SVG blend mode;
- optional child clip and mask layer IDs;
- `group` or `switch` container mode and its active child;
- animation tracks for transform, opacity, visibility, child order, and switch selection.

The runtime rebuilds denormalized child lists from parent IDs, rejects invalid ownership and cycles during project normalization, and evaluates group transforms before artwork world transforms. Group opacity and visibility inherit through every ancestor. The selected group can be isolated for focused editing; hidden switch branches and mask/clip guide layers stay out of normal artwork rendering.

## Folder properties

Select a folder to edit:

- local X/Y, rotation, and scale in **Properties**;
- group opacity;
- blend mode;
- layer order;
- visibility and lock state;
- **Folder / group** or **Switch container** mode;
- active switch child;
- clip and mask source layers;
- isolate or remove the folder.

The existing timeline **Add key** action records a selected folder transform. Group animation tracks also support opacity, visibility, discrete child ordering, and switch-child changes through the group animation API. Discrete hierarchy properties use step interpolation so a layer does not occupy two switch branches or two orders between keys.

## Rendering and export

The Canvas renderer consumes the evaluated flattened leaf order, so existing vector, image, mesh, bone-binding, stage, hit-testing, and selection paths continue to work. Group transforms are applied after authored/bone transforms; group opacity and blend mode are applied at the leaf. Clip and mask layers are evaluated in the same world space as their group and emitted as SVG `clipPath` definitions during SVG export. PNG/video export uses the same evaluated stage and SVG-compatible artwork data.

## JSON compatibility

The persisted project shape adds an optional `groups` array and optional `parentGroupId` on artwork layers. Runtime-only `world`, `childrenIds`, and isolation state are not required in saved files. Normalization reconstructs ordered child IDs from both parent pointers and legacy child arrays, removes stale IDs, bounds group values, and breaks cycles safely.

## Moho-oriented workflow

Use folders to organize torso, head, hair, facial features, clothing, props, and front/behind artwork. Use a switch container for alternate hands, eyes, ears, mouths, or prepared turn drawings. Use group transforms for shared head/body offsets, group opacity for fades, blend modes for compositing, and clip/mask layers for contained artwork. Keep broad prepared drawings in separate switch branches and use Smart Bone or constraint tracks for continuous corrections.

The hierarchy is an editor-native model inspired by professional layer-stack workflows. It does not claim `.moho` file compatibility or complete Moho parity.
