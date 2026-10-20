# Mouth animation and lip sync

Facial profiles, expression controls, audio drafts, and webcam performance capture are documented in [FACIAL_ANIMATION.md](FACIAL_ANIMATION.md). Use the Facial dock to combine this mouth/viseme workflow with blinks, brows, eye direction, head pose, expressions, and live capture.

## Quick start

Open **Mouth & lip sync** in the right dock. Click **Open mouth demo**, confirm replacement, and press Play. Undo restores your previous project. The demo has five seconds of manually authored mouth cues and a gently moving head; it contains **no speech recording**.

For your character:

1. **Create mouth set** generates nine vector mouth drawings at the stage centre, or at the origin of the optional head/mouth bone. The drawings bind to that bone. For precise placement, create a bone at the mouth location first. Alternatively, choose **Use existing artwork** and map your own image/vector mouth layers.
2. **Import audio** loads a local WAV, MP3 or OGG file supported by your browser (up to 12 MB and five minutes). Audio stays local and is embedded in the project. A waveform, offset, volume and mute controls appear.
3. Add viseme cues manually, import a Rhubarb JSON file, or generate an approximate amplitude draft. Listen and correct the timing.
4. Play, pause, loop or seek using the timeline. The mouth switches with project time; audio supplies the playback clock during its clip. You can extend the timeline or change FPS.
5. **Save** downloads project JSON containing artwork, mappings, cues and embedded audio. Reopen it with **Open**. Large recordings may exceed browser autosave quota; a warning directs you to save a portable JSON copy.

## Mouth shapes

| Symbol | Mouth shape |
| --- | --- |
| X | Rest / neutral |
| A | Closed M / B / P |
| B | Consonants, teeth together |
| C | Wide |
| D | Open |
| E | Rounded |
| F | Pucker |
| G | F / V, teeth touching lower lip |
| H | L, raised tongue |

The mapping dropdowns select existing artwork. One artwork layer can serve several shapes within one track, but cannot belong to multiple tracks. Unmapped cues fall back to X; without an X mapping, the mouth disappears in gaps. Disabling a track shows its rest mouth. Removing a track retains all drawings but hides all except X; Undo restores the track. Remapping detached artwork makes it visible again.

## Editing timing

- Cue starts and durations use **absolute project seconds**, independent of FPS. End times are exclusive; adjacent cues can touch. Overlaps and invalid durations are rejected without replacing the old data.
- Click a cue in the strip/list to select and seek it. Change start, duration or shape, then **Update cue**. **New cue** and **Use current frame** speed up manual insertion. **Delete cue** removes just that cue.
- Gaps and times outside cues use X. Cue edits, mappings, audio replacement and imports support Undo/Redo.
- Audio offset moves **only the audio**. Existing cues retain their project times. New Rhubarb imports and generated drafts add the current audio offset.
- Mouth switching multiplies the artwork's evaluated opacity; it does not overwrite transforms, weights, mesh morphs or Smart expressions. Mouth changes follow bone motion. Lip-sync playback/editing is suspended during Smart Action authoring.

## Rhubarb timing files

**Import Rhubarb JSON** accepts offline-generated `mouthCues` with symbols X or A–H, for example:

```json
{"mouthCues":[{"start":0,"end":0.2,"value":"X"},{"start":0.2,"end":0.4,"value":"A"},{"start":0.4,"end":0.7,"value":"D"}]}
```

Importing replaces cues on the selected mouth track after confirmation; other tracks and artwork are unchanged. Generate that timing file externally with Rhubarb if you need phoneme-informed timing. This editor imports the result; it does not install or run Rhubarb.

## Approximate amplitude drafting

The draft generator measures local RMS loudness and emits X/C/D cues for silence, medium opening and wide opening. It is **not speech recognition, transcription or phoneme detection**. Loudness alone cannot distinguish M from F or a spoken vowel. Use it as a starting point, then correct by listening or replace it with Rhubarb cues. No recording is sent to a speech service.

## Export and verification

SVG/PNG export the visible mouth at the current time as a still image. Project JSON retains the audio and full cue timing. Video export includes the evaluated mouth, facial profile, camera, and project audio through the Video dialog.

- `npm test`: the full 122-test suite, including cue boundaries/validation, mappings, head binding, mesh/Smart composition, facial profiles, facial keys, audio drafts, import/save/load, undo/redo, waveform-draft behaviour, SVG pose output, and simulated audio transport.
- `npm run build`: TypeScript and production bundle pass.
- Chromium verified the Facial dock, profile creation, expression preset/key workflow, Facial timeline channel, and useful webcam-device failure feedback in a headless environment. Actual webcam tracking requires a camera-capable browser context.
