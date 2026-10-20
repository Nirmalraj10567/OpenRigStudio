# Reference girl v5 — independent 360° hands

Open **reference-girl-v5-hand-turns.json** in Character Studio, or choose
**Character Views → Reference girl · 360° hands v5**.

## Rig

- Five separate digits on **each** hand: thumb, index, middle, ring, little.
- Three connected bones per finger: **knuckle → middle → tip**.
- Two connected bones per thumb: **knuckle → tip**.
- **28 digit bones** and **two independent roll dials**, bringing the character to **50 bones**.
- Ten separately skinned vector digit layers, with tapered contours, subtle
  joint creases and nail details. Neighboring fingers have no shared skin weights.
- Finger roots follow their wrist; each chain follows all eight prepared views.
- A Moho-style angle dial for each hand drives a continuous 2.5D wrist roll:
  back → edge → palm → edge → back. Convex surface depth retains thickness at
  exact edge views. Palm creases and back-of-hand/nail details change with the roll.
- The roll is evaluated after body views and finger skinning. Authored finger
  rotations, the wrist pivot, and upstream arm bones stay independent of the dial.
- A short mesh taper at each wrist joins the forearm artwork to the turned palm.
- Wrist/elbow seam masks, chest springs, and skirt cloth remain active.

## Controls

In **Rig & animate → Hands & fingers**:

1. Choose **Left hand** or **Right hand**.
2. Drag **Wrist turn**, enter **Turn ° · unwrapped**, or use the angle buttons:
   **Back 0°**, **Edge 90°**, **Palm 180°**, **Edge 270°**, **Back 360°**.
3. Use **Reference**, **Open**, **Grip**, or **Point** to pose the fingers at any roll.
4. Choose one digit and adjust **Curl**, or edit its individual joint angles.
5. With Auto-key enabled, edits create ordinary transform keys on that frame.
   Undo/Redo and project save/open preserve both the roll and digit poses.

The numeric turn field accepts negative angles and multiple revolutions. A key
from **0° to 360°** makes a full turn rather than taking a shortest-angle shortcut.
The two root bones named `Left hand · 360° roll dial` and
`Right hand · 360° roll dial` are also directly editable/keyable.

For direct posing, select a digit bone in the hierarchy and use **I + Alt-drag**
for one joint. For fingertip IK select the tip bone and use **Chain 3** for a finger
or **Chain 2** for a thumb. These chain lengths keep the wrist and arm anchored.

The **Hand turns · independent 360° wrist rolls** animation turns the hands in
opposite directions over frames **0–96** at 24 FPS, with the fingers open.
Quarter-turns occur at frames 24, 48, and 72; frame 96 returns to the opening view.

The **Finger articulation · open / grip / point** animation provides a ready
demonstration: reference at frame 0, open at 18, grip at 42, point at 66, and
reference again at 90. The existing secondary-motion and angle-review clips are
also included.

## Checks

- `node --test tests/handRig.test.mjs` checks isolated skin weights, finger posing
  across all eight views, wrist rolls, continuous wraparound, seam locality,
  inverse mesh editing, chain-limited fingertip IK at edge views, unwrapped
  animation, auto-key, undo, deterministic seeking, and JSON/SVG round trips.
- `node tests/referenceGirl.browser.mjs reference-girl-v5-hand-turns.json` opens
  the saved project in native Chrome and exercises both hands' editor controls,
  full-turn auto-keying, rendered Canvas/SVG changes, and the physics controls.
- `node tools/review-reference-girl-v5.mjs` regenerates the editable project and
  native-rendered proof sheets (Node 22+ and Chrome required).

Previews: `reference-girl-v5-left-turns.png`, `reference-girl-v5-right-turns.png`.
The corresponding `*-rig.png` sheets show the actual bone chains over the artwork.

Older v4 projects continue to expose their finger controls. The optional turn
metadata and authored depth meshes are included in the new v5 project.
