# Advanced bone constraints

The editor now includes a persisted, post-FK/IK constraint solver exposed through the **Constraints** dock.

This workflow is based on the Moho Pro rigging model described by Lost Marble: local angle limits, target and pin bones, automatic squash/stretch, bone-strength regions, and animation-time constraint behavior. References:

- [Moho Pro feature overview](https://moho.lostmarble.com/pages/features)
- [Moho 14 User Manual](https://manual.lostmarble.com)
- [Moho 14 Tutorial Guide](https://tutorial.lostmarble.com)
- [Legacy constraint tutorial: Bone constraints](https://www.lostmarble.com/moho/manual/tut03/02/index.html)

## Constraint types

- **Angle limits** — clamps local-to-parent rotation in degrees. The debug overlay shows the two allowed limit rays and the active arc.
- **Translation limits** — clamps local X/Y position.
- **Scale limits** — clamps local X/Y scale.
- **Distance limits** — keeps a bone origin inside a distance range from a target or fixed point.
- **Direction** — aims a bone at a fixed direction or target point.
- **Pin bone** — holds a bone origin or tip to a target point.
- **Target bone** — aims the source bone or solves a bounded IK chain toward a target bone.
- **Parent / child blend** — follows another bone with position, rotation, scale, influence, and offset preservation.
- **Squash & stretch** — scales a bone toward a target with optional volume preservation.

## Runtime behavior

Constraints are evaluated after controller, Smart Bone, facial, and character-view evaluation, but before world transforms and rendering. The authored local transforms and ordinary animation channels stay unchanged. A dependency-aware pass solves target bones before dependent sources and reports cyclic target dependencies instead of recursing forever.

Each constraint supports:

- influence weight;
- replace or additive mixing;
- priority ordering;
- parent/child influence and distance falloff;
- optional target offsets and origin/tip anchors;
- constraint settings keyframes.

Constraint keys are stored as ordinary animation tracks with property `constraint`, so they appear in the timeline's **Constraints** channel and support the existing retime, interpolation, copy, paste, delete, undo, and redo tools.

## Mesh influence falloff

Each bone can optionally store `influence` metadata:

- radius in stage pixels;
- falloff exponent;
- strength.

Mesh auto-weight generation uses these values when present and retains the legacy inverse-square curve for bones without metadata. This mirrors Moho's Bone Strength / region-binding concept: points inside a bone's region receive influence, and the falloff exponent controls how quickly influence drops toward the region boundary. The controls are available in the Constraints dock and apply when a mesh is created or rebound.

## Visualization and debugging

Enable **Guides** in the Constraints dock to show:

- source points;
- fixed or target points;
- aim vectors;
- source-to-target guide lines;
- solver residuals and status messages.

Angle constraints additionally display their minimum and maximum rays, matching the limit visualization described in the Moho constraint tutorial.

The debug readout is transient and is not serialized into the project.

## Verification

- Engine coverage: `tests/constraints.test.mjs`
- Browser proof: `constraints-panel-proof.png`
- Build: `npm run build`
- Regression suite: `npm test`

## Scope compared with Moho Pro

The project implements the requested constraint family in its browser-native data model. Moho Pro also includes additional rigging features such as angle-control bones, animated bone-lock solving, dynamics/delays, Vitruvian bones, and region editing tools. Those remain separate follow-up features; this implementation does not claim `.moho` file compatibility.
