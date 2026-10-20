# True 3D camera and production camera

The Camera and Stage docks now support two compatible staging paths:

- **2.5D legacy stage:** existing depth/parallax/yaw/pitch/roll behavior remains the safe default for old files.
- **True 3D stage:** enables real layer-space Z positions, Euler rotation, perspective projection, physical focal length, sensor size, clipping, focus distance, aperture/f-stop depth of field, key lighting, soft shadows, and camera-facing flat artwork projection.

## Physical camera

In **Camera → True 3D camera**:

1. Enable **true 3D camera** and choose Perspective lens or Orthographic.
2. Set camera position and rotation. Position Z is the camera distance in stage pixels.
3. Tune focal length and sensor width. Perspective scale uses the physical relationship `focal length / sensor width`, then maps through the project viewport.
4. Set near/far clipping. Points outside the range are clipped before projection.
5. Enable depth of field, then set focus distance, aperture, and f-stop. The shared Canvas and SVG paths calculate a deterministic circle-of-confusion approximation and apply blur.
6. Set ambient/key-light intensity and shadow softness/opacity. 3D geometry receives flat per-face lighting and casts a projected soft shadow.

Camera 3D values are regular `camera3d` animation channel values. They can be keyed, scrubbed, copied, pasted, interpolated, and exported with the normal camera workflow. Flat cameras and old projects do not acquire a 3D camera until enabled.

## 3D layer transforms and geometry

Select artwork in **Stage & 3D layers**:

- **X/Y/Z** add true 3D position. Z is independent of the existing legacy `depth` field.
- **Rotate X/Y/Z** applies Euler layer rotation before perspective projection.
- **Extrude** turns a rectangle, ellipse, or simple polygon into capped and side-faced geometry.
- **Inflate** creates a low-poly dome-like deformation over the generated caps.
- **Lathe** revolves a non-negative-radius profile around the Y axis.
- **Import OBJ object** accepts local OBJ vertices/faces, triangulates polygon faces, and creates a vector layer with `mesh3d` data.

Generated/imported meshes are bounded to 10,000 vertices and 20,000 triangles. Simple polygon outlines are ear-clipped; self-intersecting or degenerate outlines are rejected. Geometry uses project JSON only and does not require a WebGL runtime.

The Canvas, SVG/PNG, and video paths share `projectedLayerTriangles()`. Flat artwork is tessellated into an 8×8 grid so perspective and DOF remain visible across a plane rather than applying one affine transform to the entire layer. Meshes are painter-sorted by projected depth and faces by face depth.

## Production camera

The production section adds:

- **Camera hotkeys:** existing 1–9 shot assignments switch cameras.
- **Bookmarks:** capture and recall a camera state at a frame, including physical lens settings.
- **Path keys:** camera channels use the existing editable timeline. Camera rig definitions can key orbit yaw, pitch, and distance.
- **Camera rigs:** attach an orbit rig to a target bone/artwork layer and record its path.
- **Transition presets:** hard cut, dissolve, push, whip, and zoom. Preset cuts write a switch key plus transition metadata. Timeline playback and SVG/video rendering use the same transition metadata.
- **Camera shake:** deterministic frame/time-based position and roll noise controlled by amplitude, frequency, rotation, and seed.
- **Live control:** pointer/tablet, device-orientation, or gamepad source selection and smoothing settings. The runtime accepts live input through `updateLiveCamera()` without writing animation keys.
- **Puppet Stage mode:** persisted production preference for transient live performance.
- **Live stream output:** the Camera dock can expose the stage canvas as a standards-based `MediaStream` using `canvas.captureStream()`. `startLiveCameraStream()` and `recordLiveCameraStream()` provide the browser-side output/recording primitives; WebRTC signaling or OBS routing remains the host application’s responsibility.

Camera transition composition is available in Canvas and SVG. Dissolves blend two fully rendered camera views; push transitions translate the previous and next view. Whip and zoom presets add deterministic overshoot during the active transition window.

## Persistence and compatibility

`camera3d`, `transform3d`, `mesh3d`, and `cameraProduction` are optional JSON fields. Missing fields normalize to legacy 2D/2.5D behavior. Camera bookmarks and production definitions are capped and malformed references are discarded. OBJ geometry is copied into the project; the original file is not required after import.

## Verification

`tests/camera3d.test.mjs` covers physical camera normalization, perspective/orthographic projection, DOF, OBJ parsing, extrusion, inflate, lathe, true 3D SVG round trips, bookmarks, physical-lens camera data, transition presets, path keys, camera rigs, live camera state, and persistence. Existing camera, dynamics, export, and video suites continue to exercise the shared rendering paths.

Current scope uses deterministic CPU projection and flat face lighting. It does not claim a general-purpose WebGL renderer, texture-coordinate-aware arbitrary OBJ materials, skeletal 3D animation, volumetric lights, shadow maps, or remote streaming service/signaling.
