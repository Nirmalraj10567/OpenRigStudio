# Motion Tracking Studio

Motion Tracking Studio converts a local reference video into editable 2D rig
motion. The video is used as reference data; the result is a normal animation
clip in the current project, not a baked video layer.

The workflow is:

1. Load or create a rigged character.
2. Import a local video.
3. Detect body landmarks with MediaPipe Pose Landmarker.
4. Clean and smooth the tracked frames.
5. Map landmarks to the current rig and its IK targets.
6. Generate and preview a native animation clip.
7. Bake the clip into the main Timeline when it looks correct.

## Requirements

- A current Chrome or Edge browser is recommended.
- The project must contain a rig with bones before generating motion.
- The browser needs network access the first time tracking is used so it can
  download the MediaPipe WASM runtime and pose model.
- The selected file must be a browser-supported video (`MP4`, `WebM`, or
  `MOV`).

MediaPipe runs in the browser. The reference video is read through a local
object URL and is not uploaded by this panel. The WASM runtime and model are
loaded from these URLs:

- `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm`
- `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`

## Start the application

From the project root:

```bash
nvm use
npm ci
npm run dev
```

Open the URL printed by Vite. For a production-style local check, use:

```bash
npm run build
npm run preview
```

## Prepare a rig

Motion is retargeted to the current `Rig`, so start with a project that has
bones and artwork:

1. Open **Character Studio** or **Animation**.
2. Open an existing project, or click **Rigged example** for a test rig.
3. Click the **Animation** workspace tab. This keeps the shared CanvasStage and
   main Timeline visible while the tracking panel is open.

The current rig should have named or semantically recognizable bones such as
the torso, upper/lower arms, hands, upper/lower legs, feet, and head. The
automatic mapping suggestions use the current rig's bone names and hierarchy.

## Import a reference video

1. In the **Animation** workspace, select the **Motion Tracking** dock tab.
2. Click **Import video** or **Choose video**.
3. Pick a local video file.

The panel reports the file name, dimensions, duration, and source frame rate.
It also shows a source-frame scrubber and a video preview. A file can also be
dragged onto the video card.

The tested sample is kept in the repository at:

```text
sample/Boy_walking_forward_20261020170928.mp4
```

That sample is an 8-second, 720 × 1280, 24 FPS walking video.

## Tracking settings

Adjust these settings before pressing **Track video**:

| Setting | Purpose |
| --- | --- |
| **Sample FPS** | Number of video samples used for detection, from 6 to 60. |
| **Confidence** | Minimum landmark confidence used during cleanup. Lower values retain more uncertain points; higher values reject more points. |
| **Smoothing** | Size of the deterministic smoothing window. Larger values reduce jitter but soften fast motion. |
| **Start / End** | Limits the source-frame range to analyze. |
| **Facing** | Tells retargeting whether the subject faces left, right, front, or back. |
| **Inspect** | Chooses front, side-estimated, or back-estimated inspection. |

The current implementation initializes a loaded video's source rate to 24 FPS.
The supplied test video is 24 FPS, so it matches the source exactly. For a
video recorded at another rate, choose an appropriate **Sample FPS** and review
the generated timing before baking.

## Run detection

1. Set the **Start** and **End** range if the entire video is not needed.
2. Press **Track video**.
3. Wait for the progress badge to return to `READY`.

The panel samples the video, seeks each requested frame, runs Pose Landmarker,
and records the selected body landmarks. The source-frame counter advances as
the detector works. When detection completes, the status bar reports the
number of tracked frames, for example:

```text
Tracked 192 frames · change mapping without rerunning detection
```

The tracked frames are cached locally when the serialized result fits the
browser cache limit. The cache key includes the file name, file size, and last
modified time. Importing the same unchanged file can therefore reuse the
detection result instead of running MediaPipe again.

Use **Reprocess cached tracking** after changing confidence or smoothing. This
re-runs cleanup without invoking the detector again.

## Landmark cleanup and mapping

The cleanup pass handles confidence filtering, short missing-point gaps, and
deterministic smoothing. The current supported body landmarks include:

- Nose and neck
- Left/right shoulders, elbows, and wrists
- Left/right hips, knees, ankles, heels, and feet

In **Bone mapping**:

1. Press **Suggest mapping** to refresh suggestions from the current rig.
2. Review each bone pair, such as `Left upper arm` or `Right shin`.
3. Choose a different target bone from a row's select menu when needed.
4. Keep the wrist and ankle IK targets mapped when the rig has suitable chains.

The mapping is stored with the current rig's tracking preferences. Changing the
mapping invalidates the generated clip, but it does not require detection to be
run again.

The mapping stage uses the existing rig IK solver for wrist and ankle targets.
It does not create a second character, a replacement skeleton, or a separate
render stage.

## Generate and preview a clip

After detection and mapping are ready:

1. Press **Generate clip** in **Bake motion**.
2. Confirm the panel reports the generated track count.
3. Press **Preview rig**.
4. Scrub the **Motion tracking preview frame** slider or let the preview loop.
5. Inspect the result on the shared CanvasStage and in the Timeline.

The generated clip is named from the video file, for example:

```text
Boy_walking_forward_20261020170928.mp4 · tracked motion
```

Preview applies the generated clip temporarily to the current rig. The
generated data is still editable transform-track data; it is not a flattened
render. Use **Reset** in the Motion Tracking panel to discard the tracking
session and restore the original authored rig state.

## Bake to the main Timeline

When the preview is acceptable:

1. Press **Bake to Timeline**.
2. Confirm the status bar reports that the clip was baked.
3. Use the main **Timeline**, **Dope Sheet**, or **Graph Editor** to inspect and
   edit the generated keys.
4. Use normal Undo if the bake needs to be removed.

Baking appends the generated clip to the project's animation library, selects
   it as the active Timeline animation, and applies its start pose. The bake is
   one undoable project operation.

## Verified sample workflow

The following flow was run in a fresh browser session with the repository
sample:

1. Open the **Rigged example**.
2. Select **Animation** → **Motion Tracking**.
3. Import `sample/Boy_walking_forward_20261020170928.mp4`.
4. Run **Track video** over frames `0` through `191`.
5. Confirm `192` tracked frames.
6. Generate the clip and confirm `13` editable rig channels.
7. Start **Preview rig** and confirm the character changes pose on the shared
   CanvasStage.
8. Press **Bake to Timeline** and confirm the bake status.

Evidence from that run is stored in:

- [Video loaded](evidence/motion-tracking-sample-loaded.png)
- [192 frames tracked](evidence/motion-tracking-sample-tracked.png)
- [Generated clip preview](evidence/motion-tracking-sample-preview.png)
- [Clip baked to Timeline](evidence/motion-tracking-sample-baked.png)

## Troubleshooting

### `Pose detector could not start`

- Confirm the browser can reach both MediaPipe URLs listed above.
- Reload the application after the first failed model download.
- Confirm dependencies were installed with `npm ci` and that
  `@mediapipe/tasks-vision` is version `1.0.1`.
- Check the browser console for a blocked CDN request, a failed WASM request,
  or a model download error.

### The video imports but has no metadata

- Try Chrome or Edge with the video in a browser-supported codec.
- Confirm the file is an MP4, WebM, or MOV rather than a renamed file.
- Try opening the file in a normal browser video element first.

### The detector returns weak or missing landmarks

- Use a clip with the complete subject visible and reasonable lighting.
- Put the subject against a contrasting background.
- Lower the **Confidence** value to retain more uncertain landmarks.
- Increase **Smoothing** only after confirming the subject is detected.
- Narrow the frame range to remove fades, cuts, or frames where the subject is
  mostly hidden.

### The generated character moves incorrectly

- Press **Suggest mapping** again after loading the intended rig.
- Review every row in **Bone mapping**, especially left/right labels.
- Set **Facing** to match the direction of the subject in the video.
- Confirm the root bone and wrist/ankle IK targets are valid.
- Use the preview frame slider to find whether the error is present in the
  tracked landmarks or introduced by retargeting.

### The same file keeps using an old result

Press **Reset**, import the file again, and then choose **Reprocess cached
tracking** if the tracked frames are already present. The cache is keyed by
file name, size, and modification time; changing the file or its modification
time creates a new cache entry.

## Current scope and limitations

- One pose is detected per video frame.
- The current panel maps body landmarks; it does not yet retarget hands,
  fingers, or facial landmarks.
- Side and back inspection views are estimated/mirrored views from one video,
  not true multi-camera 3D reconstruction.
- The source-rate initialization is currently fixed at 24 FPS.
- Tracking frames use browser localStorage when the serialized cache is below
  the implementation's approximately 4 MB limit.
- MediaPipe WASM and the pose model require CDN access for a fresh detector
  session. The pure cleanup, mapping, clip-generation, and rig-bake engine
  tests run without the browser model.
- Detection warnings from the MediaPipe runtime can appear in the console on
  GPU/headless browsers while the tracking result still completes successfully.

## Implementation and checks

The main implementation files are:

- `src/ui/MotionTrackingPanel.tsx` — video import, detector lifecycle, panel UI,
  caching, preview, and baking.
- `src/engine/motionTracking.ts` — cleanup, smoothing, coordinate conversion,
  mapping, IK retargeting, key reduction, and clip generation.
- `tests/motionTracking.test.mjs` — deterministic engine behavior.
- `tests/ui-full.browser.mjs` — browser-level dock and editor checks.

Run the normal project checks from the repository root:

```bash
npm test
npm run test:browser
npm run build
```

The full sample workflow was manually exercised in a real Chromium browser;
the standard browser audit intentionally does not download the external pose
model or process a long video, so it remains fast and repeatable.
