# Professional Smart Bone actions

Smart Bone actions are persisted, non-destructive controls driven by a bone’s local rotation. Character Studio supports action organization, reusable authoring, dependencies, priority, blending, preview, and key management while preserving the original authored pose.

## Action management

- **Action folders** organize facial, head-turn, body-turn, and cleanup actions.
- **Duplicate** creates an editable copy with the same baseline and keys.
- **Mirror** reverses driver angles, X/rotation corrections, mesh points, and view angles for left/right reuse.
- **Head turn** and **Body turn** create one-click floating controls with bounded `-180°…180°` drivers and neutral angle metadata.
- **Reset neutral** clears preview state and returns the driver to its neutral angle.
- **Solo** previews one action while retaining declared dependencies.

## Keys and timeline workflow

Captured keys retain an angle, targets, easing, optional view angles, and a small visual thumbnail. The Smart Bone panel supports selecting angles, copying a key, pasting it at another angle, moving a key, and editing a key from its baseline. Target capture includes bones, artwork, groups, masks, patch settings, visibility, and layer ordering.

The ordinary Timeline continues to own project animation tracks. Smart Action key editing is deliberately separate: the action panel shows the angular key strip, thumbnails, edit angle, and Capture/Cancel transaction. This prevents a half-authored action key from leaking into the live timeline.

## Blending and dependencies

Each action has:

- additive or override blending;
- normalized weight;
- priority;
- optional dependencies;
- optional driver limiting;
- neutral angle.

Dependencies evaluate before dependents. Cycles and missing dependencies are reported in the panel and skipped rather than producing feedback loops. Additive actions stack corrections; override actions replace earlier deltas according to their weight. Discrete visibility, masks, patch settings, and layer ordering use the nearest authored key.

Angle guide overlays draw the driver’s start, end, and neutral rays around the control bone. Driver limiting clamps evaluation to the action range without baking the clamp into authored bone rotation.

## Moho-oriented use

Use separate actions for broad head/body turns, shoulder and hip overlap corrections, facial expressions, hair and face-edge cleanup, and local hand/prop controls. Keep a reusable action in a folder, duplicate it for the opposite side, mirror it, then adjust only the targets that differ. Masks and patch layers can be captured by the same action as the transforms that expose the seam.

The implementation is a browser-native Smart Bone system. It does not claim `.moho` file compatibility or complete Moho parity.
