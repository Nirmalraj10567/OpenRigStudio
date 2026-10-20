# Dynamics & physics

The **Dynamics** dock adds non-destructive secondary motion to the existing animation pipeline. Project JSON retains simulation settings, optional frame caches, and bake metadata. Legacy projects open with dynamics disabled.

## Bone springs, hair, tails, and follow-through

1. Open **Dynamics**, choose a bone under **Target**, and choose a preset.
2. Click **Bone** for one joint or **Bone chain** for that joint and all descendants. Existing spring assignments are retained.
3. Select the spring in the object list. Tune **Stiffness**, **Damping**, **Mass**, **Gravity scale**, **Wind scale**, **Influence**, and **Overlap**.
4. Animate its parent and scrub or play. World-angle springs lag the moving parent; overlap also responds to anchor movement.

Hair and tail presets use softer springs. Follow-through starts with zero gravity scale and stronger overlap. All presets share the same spring solver and remain editable.

## Cloth and soft bodies

1. In **Rig & animate → Mesh & weights**, create a triangle mesh on image or vector artwork.
2. In **Dynamics**, choose that artwork, select **Cloth** or **Soft body**, and click **Mesh**.
3. The top row starts pinned. **Release pins** removes its anchors; to change one pin, select the vertex with `M`, return to Dynamics, select its mesh object, and click **Toggle selected pin**.
4. Tune stiffness, damping, mass, and force scales. Pinned vertices follow the evaluated animation/skin; free vertices respond to forces and edge-length springs. Soft bodies have stronger rest-shape attraction than cloth.

Simulation produces world-space vertices consumed by the regular triangle renderer, masks, SVG, PNG, and video export. Rest positions, UVs, weights, and bind matrices stay authored data until baking.

## Bodies and collisions

Click **Collision body**, then choose its attachment, circle/box shape, motion, size, offsets, mass, bounce, and friction.

- **World / unattached:** X/Y are stage coordinates.
- **Attached:** X/Y and rotation are local offsets from the bone/artwork.
- **Static:** holds the attachment’s initial pose as a collider.
- **Kinematic:** follows evaluated animation and acts as a collider.
- **Dynamic:** falls under forces and drives the attached bone/artwork without changing its authored local transform. Child bones and bound layers follow the result.

Circle and oriented-box colliders affect spring tips, mesh points, particles, and dynamic bodies. Dynamic-body pairs use mass-weighted separation and normal impulses. Dynamic boxes use circular proxies; this lightweight solver does not implement angular rigid-body impulses, jointed rigid bodies, continuous collision detection, or self-colliding cloth. Bone collision response is an angular tip correction.

## Particles

Click **Particles** and tune attachment, X/Y, emission rate, lifetime, speed, direction, spread, radius, and color. The random seed controls spread; gravity and wind affect velocity. Particles fade over their lifetime and collide with enabled bodies.

Particles render above artwork on the stage’s neutral-depth plane, consistently in Canvas, SVG, PNG, and frame-by-frame video export. They are not members of group mask stacks. The simulation limits live particles to 5,000.

## Deterministic evaluation and caching

- Animation/NLA, controllers, Smart Actions, facial/view corrections, and constraints evaluate first. Dynamics is the final derived-pose stage before rendering.
- **Simulation start/end** define an inclusive frame range. Before the start there is no simulation; beyond the end the final result holds.
- Each project frame advances `1 / Simulation FPS` seconds, split into **Substeps**. Match this FPS to the timeline FPS for aligned time. Transform/mesh results interpolate at fractional frames; particle births/deaths hold at simulation frames.
- Preview samples an isolated rig from the fixed start and memoizes completed frames. Seeking backward, looping, and offline export reuse the same deterministic results.
- **Build cache** saves all simulated frames in project JSON. Cache fingerprints include settings, source animation/key data, rig structure, bindings, modifiers, and controller inputs/state. Stale caches are ignored; authored editor transactions invalidate preview/cache data.
- **Reset cache** clears persisted and transient results and replays preview from the start. Disable dynamics to inspect the authored pose.

Caches and bakes cover up to 10,001 frames. Larger meshes, long ranges, many bodies, and particle-heavy scenes increase calculation time and JSON size. Cache/bake operations currently run synchronously after displaying a busy status.

## Bake to editable keys

**Bake to keys** creates and activates a new clip. The source clip is preserved, and the operation participates in regular Undo/Redo.

- All bone, artwork, and group transforms are sampled into ordinary transform keys, including evaluated constraints and secondary motion.
- Meshes are inverse-mapped through their evaluated skin matrices into ordinary mesh keys.
- Particle frames become step-interpolated vector-shape keys on a new **Baked particles** layer, visible only with its owning clip active.
- Clip bake metadata bypasses transform/mesh modifiers already captured in these keys and suppresses live simulation, preventing a second dynamics pass.
- The bake samples the configured simulation range at integer project frames. It flattens NLA transforms/meshes and removes the new clip’s loop/retime mappings. Other source channels are resampled over the range; controller/NLA-driven material or artwork-switch channels are not fully flattened.

Choose the original clip to resume live dynamics. The new clip’s keys remain editable using the timeline and Graph Mode. Baking fails on singular attachment or skin matrices instead of writing invalid coordinates.

## Guides and verification

**Simulation guides** shows amber collision outlines, teal spring tips, mesh pins, and emitter origins in the normal stage view. Guides are runtime editor preferences and are omitted from exports.

`tests/dynamics.test.mjs` covers deterministic seeking, non-destructive evaluation, moving-parent lag, cache reuse/interpolation/persistence/invalidation, nonzero ranges, rotated collisions, dynamic-body floor response, mesh anchors/forces, seeded particle export, and constrained/mesh/particle baking.

Run `npm test` and `npm run build`. The browser smoke script also exercises the Dynamics tab, chain creation, force controls, guide toggling, cache generation, baking, and Undo. See [dynamics-panel-proof.png](dynamics-panel-proof.png).
