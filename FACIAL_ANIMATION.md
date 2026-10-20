# Facial animation, talking heads, and live face capture

Open the **Facial** dock tab for a profile-based facial workflow inspired by Cartoon Animator talking heads and Moho Smart Bone facial controls.

Browser proof: [Facial dock and keyed timeline](facial-animation-panel-proof.png).

## Create a face profile

1. Open **Rigged example**, **Mouth demo**, or your own rigged character.
2. Select **Facial → Create face profile**.
3. Map the available targets:
   - Head
   - Left/right eyes
   - Left/right pupils
   - Left/right brows
   - Rest and open mouth
   - Jaw/chin
4. Use the sliders or expression presets to preview the face. Evaluation is non-destructive: authored bones, layers, bindings, meshes, and Smart Actions remain unchanged.
5. Press **Key face** to record the current facial values at the timeline frame. Timeline **Channels → Facial animation** exposes the editable facial track.

Target names are inferred when possible, but every mapping is editable. A face profile can use vector layers, image layers, bones, or a mixture of them. Pupil targets use translation; eyes use scale for blinks; brows use translation and rotation; head/jaw/mouth use pose corrections.

## Built-in controls and presets

The face parameter model includes:

- Left/right blink
- Left/right eyebrow raise/lower
- Horizontal and vertical eye direction
- Head yaw, pitch, and roll
- Smile
- Mouth open/jaw open

Presets include Neutral, Smile, Blink, Surprised, and Talking. **Expression presets** are stored with the profile and can be keyed or used as a live starting pose.

Blink automation is enabled per profile. It produces a smooth periodic blink while the face is not being overridden by a live capture or keyed facial track. Adjust the profile data in project JSON for custom interval and duration values.

## Audio-driven facial animation

1. Import audio in **Mouth & lip sync**.
2. Create a face profile.
3. Click **Audio facial draft**.

The editor creates a local, editable facial animation clip from the embedded waveform. Loudness drives mouth opening and a small smile response; the profile blink cycle is included. This is an amplitude performance draft, not phoneme recognition. Combine it with the existing Rhubarb mouth-cue workflow for phoneme-accurate mouth shapes.

## Webcam face tracking and live puppet performance

1. Use Chrome or Edge on `localhost` or HTTPS.
2. Open **Facial**, create/select a profile, and click **Start webcam face tracking**.
3. Grant camera permission. The preview uses MediaPipe Face Landmarker and reads one face locally in the browser.
4. Move, blink, raise brows, look around, smile, open your mouth, and tilt/turn your head. The mapped rig updates as a transient live preview.
5. Click **Calibrate neutral** while holding a relaxed front-facing pose. Calibration removes the current neutral offsets and normalizes head ranges.
6. Click **Record performance**, perform, then click **Stop & save take**. The result becomes an ordinary editable facial animation clip with sampled keys.
7. Stop the camera to clear the transient live override. The recorded keys and authored project remain.

The capture reads face landmarks, blendshape scores, eye openness, brow movement, mouth opening, smile, and head pose. Smoothing and capture sampling are bounded for stable timeline output. Camera frames are not stored in the project; only the recorded facial parameters are saved.

The face model and WASM runtime are loaded from the MediaPipe CDN when tracking starts. Camera permission and network access are therefore required for the live tracker; manual sliders, presets, audio drafts, and previously recorded facial clips work offline.

## Talking-head workflow

For a Cartoon Animator-style talking head:

1. Build a head bone and separate face, eyes, pupils, brows, jaw, and mouth artwork.
2. Create a face profile and map those parts.
3. Add a mouth track through **Mouth & lip sync** and map X/A–H to mouth artwork.
4. Import dialogue audio and either import Rhubarb cues or create the editable amplitude draft.
5. Use the facial sliders or webcam capture for blinks, brows, eye direction, head movement, smile, and jaw performance.
6. Record facial values to the timeline and refine the mouth cues separately.
7. Add Smart Bone Actions for custom expressions, face turns, and mesh corrections. Facial evaluation composes with Smart Actions, regular pose keys, character views, and camera shots.

## Persistence and export

Face profiles, target mappings, calibration, presets, blink settings, and facial animation clips persist in project JSON, autosave, Undo/Redo, SVG/PNG evaluation, and video rendering. Live webcam state is transient and is never saved as a camera stream or external media.

## Current scope

Implemented: reusable facial profiles, target mapping, expression presets, blink automation, eye/brow/head/jaw/mouth controls, audio amplitude facial drafts, MediaPipe landmark/blendshape tracking, neutral calibration, live preview, record-to-timeline capture, editable facial tracks, lip-sync composition, persistence, and video export.

The tracker requires a browser-compatible camera and the MediaPipe model download. It does not claim identity recognition, multi-person tracking, speech-to-phoneme recognition, or a hosted facial-capture service.
