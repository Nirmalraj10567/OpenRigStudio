# Final video export and the frog car ride

The editor can open an editable project, play its animation and audio, and render a downloadable video with its character views and camera cuts.

## Ready-to-open project and rendered video

- [Final frog car ride — MP4 with audio](frog-car-ride.mp4)
- [Editable frog car scene — project JSON](frog-car-scene.json)
- [Decoded video frames — opening, boarding, driving, arrival](frog-car-video-frames.png)
- [Video render dialog and playable result](frog-car-video-proof.png)
- [Trimmed two-second example — silent WebM](frog-car-trim.webm)
- [Moho-style full-character 360 turn proof](moho-character-turn-proof.mp4)
- [Smart Bone + mesh expression proof](smart-bone-mesh-proof.mp4)
- [Physics ball gravity drop — MP4](physics-ball-gravity.mp4)
- [Editable physics ball project](physics-ball-scene.json)
- [Physics ball render proof](physics-ball-video-proof.png)
- [MCP garden-to-café story — MP4](garden-cafe-story.mp4)
- [Editable MCP garden-to-café scene](garden-cafe-scene.json)
- [Garden-to-café decoded filmstrip](garden-cafe-filmstrip.jpg)
- [Tom and Jerry car race — MP4](tom-jerry-car-race.mp4)
- [Editable Tom and Jerry car race](tom-jerry-car-race.json)
- [Tom and Jerry race filmstrip](tom-jerry-car-race-filmstrip.jpg)
- [Furniture showroom reference recreation — MP4](reference-showroom-animation.mp4)
- [Furniture showroom editable project](reference-showroom-scene.json)
- [Furniture showroom timeline](reference-showroom-timeline.png)
- [Exact supplied character plate — MP4](exact-reference-plate.mp4)
- [Exact supplied character timeline](exact-reference-timeline.png)
- [Corrected native showroom animation — MP4](reference-showroom-rigged-animation.mp4)
- [Corrected native showroom project](reference-showroom-rigged-animation.json)
- [Corrected native showroom timeline](reference-showroom-rigged-timeline.png)
- [Scene Kit quality contact sheet](reference-showroom-rigged-timeline.png)

The project contains vector artwork, a rigged eight-view frog, an articulated car, keyed animation, three cameras, and an embedded original soundtrack. It opens through the editor's **Open** button without additional artwork or audio files.

## Physics ball render

`physics-ball-scene.json` is a compact dynamics example: a circle body starts above a static ground box, falls under `gravityY: 700`, and bounces with `restitution: 0.68`. Open it through **Open**, then use **Video → Render final video** with frames `0–180`, `30 FPS`, and project resolution for the six-second result. The verified output is [physics-ball-gravity.mp4](physics-ball-gravity.mp4), rendered at 800 × 520 with 180 H.264 frames and no audio.

## MCP-authored coffee story

[garden-cafe-scene.json](garden-cafe-scene.json) was created through the project's `animate_character`, `add_scene_prop`, and `set_animation_keyframes` MCP tools. The character walks from a garden into Bloom Coffee, orders from the barista, receives an attached cup, and drinks in the garden-facing coffee nook. The source character, scenery, eight-bone rig, and animation tracks remain editable.

The `render_project_video` MCP tool invoked this editor's native video exporter to produce [garden-cafe-story.mp4](garden-cafe-story.mp4): **24 seconds, 1280 × 720, 24 FPS, 576 decoded H.264 frames**, without audio. See [MCP setup and reproducible commands](mcp/README.md#garden--caf%C3%A9--coffee-entirely-through-mcp).

## Open and play the scene

1. Run `npm run dev` and open the local URL in Chrome or Edge.
2. Click **Open** and choose `frog-car-scene.json`. Alternatively, click **Video → Open frog car scene** to create a fresh copy of the same example. Undo restores the previous project after loading the example.
3. Set the current frame to **0**, then press **Play**. The ten-second sequence includes:

   | Source frames | Time | Action and camera |
   | --- | --- | --- |
   | 0–71 | 0–3 seconds | Wide shot: door opens and the frog jumps into the seat. |
   | 72–215 | 3–9 seconds | Follow shot: door is closed, frog steers, wheels spin, road and trees scroll. |
   | 216–239 | 9–10 seconds | Arrival shot: car slows and the frog turns and waves. |

4. Choose **Channels → Camera only** to inspect the shot cuts or **Character views** to inspect the frog's turning keys. Other channels contain the door, boarding, steering, scenery, and continuous wheel rotation.
5. Use **Save** to download the current editable project as JSON.

For artwork/pose editing, choose **Camera → Viewport camera → Preview** and disable **Stage → Enable 2.5D preview**. Return to **Switch · timeline cuts** to review the finished shots. See [Animated cameras](CAMERAS.md), [Multi-view characters](CHARACTER_VIEWS.md), and [Keyframe editing](KEYFRAMES.md).

## Render the final movie

1. Click **Video** in the top toolbar.
2. For this scene, use:

   | Setting | Value |
   | --- | --- |
   | Start frame | 0 |
   | End frame · exclusive | 240 |
   | Output FPS | 24 FPS |
   | Resolution | 800 × 520 · project size |
   | File format | Auto · MP4 preferred |
   | Render camera | Timeline camera cuts |
   | Include project audio | Enabled |

3. Click **Render final video**. Progress reports preparing, frame rendering, and file finalization.
4. Play the result inside the dialog, then click **Download MP4** or **Download WEBM**, according to the chosen/available format.

The end frame is exclusive: `[0, 240)` at a source rate of 24 FPS produces 240 frames and a ten-second video track. Changing output FPS resamples the animation without changing its speed. A range of `[48, 96)` is two seconds; at 30 output FPS it produces 60 frames.

Audio export respects the project audio's offset, volume, mute state, and selected render range. Uncheck **Include project audio** for silent output. The embedded soundtrack includes original synthesized bells, door/jump sounds, engine hum, and a horn.

## Rendering behavior

- **Auto** prefers MP4 with H.264 video and AAC audio; it selects WebM with VP9/VP8 video and Opus audio when the required MP4 encoders are unavailable. Explicit unsupported settings report an error.
- Encoding uses browser WebCodecs on localhost or HTTPS. Codec availability depends on the browser and platform.
- Rendering evaluates a private project copy frame by frame. It preserves the editor's project, current pose/frame, and Undo history. Rendering pauses editor playback; **Cancel rendering** stops the export.
- Output includes evaluated artwork, meshes, character views, camera framing/cuts, and audio. Bones, grid, framing guides, controller widgets, and editor panels are excluded.
- Choose **Timeline camera cuts** for the shot sequence, a named camera for one shot throughout, or **Current viewport** for the project's selected camera mode. Workspace pan/zoom does not affect the output frame.
- The scene remains editable 2D/2.5D artwork with prepared angle views, using the same rig and projection as the canvas and SVG/PNG exports.

## Verified output

The complete Chromium workflow opened the example through the UI, saved and reopened its JSON through **Open**, played the scene, cancelled a render, rendered a movie, decoded and played the result, and downloaded the file. Project SHA-256, current frame, and Undo history were unchanged by rendering and cancellation. No browser runtime errors were reported.

Independent `ffprobe` inspection of the downloaded files confirmed:

| File | Video | Audio | Duration |
| --- | --- | --- | --- |
| `frog-car-ride.mp4` | H.264, 800 × 520, 24 FPS, 240 decoded frames | AAC, 48 kHz mono | Video track: 10.000 s; container: 10.069 s including AAC encoder padding. |
| `frog-car-trim.webm` | VP9, 400 × 260, 30 FPS, 60 decoded frames | None | 2.000 s. |

Decoded frames were visually inspected. The MP4 audio was decoded and measured as non-silent, with a peak of −17.1 dB.

`npm run build` and all **118 tests** passed. The nine video/scene regressions in `tests/videoExport.test.mjs` cover render timing/FPS conversion, partial frames, invalid settings, audio offsets/trimming/gain/mute, project portability, boarding/steering geometry, continuous wheel rotation, persistence/export parity, and non-destructive cancellation.

### Additional visual proof

- [Opening shot](frog-car-opening-proof.png)
- [Boarding and open door](frog-car-boarding-proof.png)
- [Seated driver and follow camera](frog-car-driving-proof.png)
