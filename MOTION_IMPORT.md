# Import 3D Motion

The **3D Motion** dock follows the Cartoon Animator workflow: load a motion, adjust projection and timing, preview a linked temporary pose, then apply the result to the timeline.

## Supported workflow

1. Build or open a 2D bone rig.
2. Open **Import 3D motion** from the context toolbar or the **3D Motion** dock tab. Choose a motion file, or drag a compatible motion file onto the import panel.
3. Import a local **BVH** file, or the documented JSON motion format.
4. Review FPS, frame count, duration, and unmapped-joint warnings.
5. Adjust projection angle, speed, trim range, Flip Body, Align with previous motion, Root motion, and camera tracking.
6. Use the frame scrubber, previous/next controls, loop toggle, and **Link Activated** preview to inspect the temporary retargeted pose.
7. Click **Apply to Timeline** to save the generated 2D bone animation as an ordinary reusable `AnimationClip`. With **Align with previous motion** enabled, a second imported motion is appended to the active clip and its root motion is offset to the previous endpoint.
8. Optionally save the applied clip as a reusable action reference for Controllers.

Projection reduces source Euler rotations to 2D bone rotations. Matching uses joint names and common human aliases such as hips, spine, head, upper/lower arm, hand, upper/lower leg, and foot.

## Format limitation

Cartoon Animator/Reallusion `.rlMotion` is a proprietary binary format and is not parsed by this browser-only implementation. FBX, GLB, and GLTF are also not parsed yet. Export or convert those motions to BVH before importing. No remote upload or conversion service is used.

The importer does not provide full 3D skeletal rendering, physics, lighting, or guaranteed equivalence with Reallusion's G3 Human retargeting. It creates ordinary 2D timeline tracks, so the result can be edited, reused by controllers, and saved with the project.

The panel includes links to the Reallusion panel guide and content store for the original workflow. 2.5D Stage preview must be disabled before importing or applying motion.
