# Reusable car and character controllers

Open the **Controllers** tab in the right dock. Controllers are reusable mappings, not copies of animation data: they reference existing timeline clips or Action Library entries by ID.

## Prepare animation actions

1. Record clips in the timeline with **Add key** / **Key pose**.
2. Open **Controllers → Action library**.
3. Select an existing clip and click **Save reference**. Rename the reference or adjust loop/speed. Editing the original clip changes every controller that references it.

No saved clips means a template can still be created, but its states show missing-action warnings and do not animate until you map them.

## Character controller

Click **Boy** to create a template. It includes:

- `Move` joystick
- `Jump` button
- `Attack` button
- Idle, Walk, Run, Jump and Attack states
- A root speed binding

Map state actions to your existing clips. Typical reusable clips are **Idle**, **Walk Forward**, **Walk Backward**, **Run**, **Jump**, **Land**, and **Sit**. Add extra states in the definition editor for Sit/Stand or other saved actions. Higher state priority wins when multiple conditions are active.

The test pad maps keyboard defaults:

- `W/S`: joystick up/down
- `A/D`: joystick left/right
- `Space`: jump
- `C`: sit/custom action when mapped

## Car controller

For a ready-to-run scene, click **Car demo** beside the Car/Boy/Custom buttons. Confirm replacement; **Undo** restores the current project. The demo loads an original vector car, chassis, steering pivots, four named wheels, and four saved clips: **Car Idle**, **Car Drive**, **Car Reverse**, and **Car Brake**. It also includes a controller definition and action references, so use **Scene & test → Add selected controller to rig → Start test** immediately.

Click **Car** to create a template. It includes:

- `Throttle` axis: forward/reverse
- `Steering` axis: left/right
- Drive and Idle states when matching saved clips exist
- Speed and steering bindings for the chassis/root
- Wheel rotation bindings for bones/layers whose names include `wheel`, `tire`, or `tyre`

Rename your rig parts accordingly or edit each target in the mapping editor. The test pad uses:

- `W/S`: throttle forward/reverse
- `A/D`: steering
- `Space`: brake input if you add a brake mapping/state

The runtime applies speed, steering, wheel rotation, position, opacity and scale parameter bindings to existing bones/layers. It does not add physics, collision, suspension, or automatic wheel discovery beyond the template’s name matching.

## Custom controllers and scene instances

1. Click **Custom**.
2. Add inputs such as buttons, axes or joysticks.
3. Add mappings to an action reference, bone/layer target and parameter.
4. Add the controller under **Scene & test**. Instances save their controller-widget position, rotation, scale and render visibility.
5. Use the test pad to preview the instance. Runtime input is transient and does not create an undo entry every frame; definition and instance edits are undoable.

Controller instances are saved with the project and point to the current rig. If an instance or mapping references a missing rig, target or clip, the panel shows a warning rather than silently changing the data.

## Reuse and persistence

Project JSON stores:

- Action Library references
- Controller definitions and mappings
- Character/car state rules and transitions
- Controller scene instances

It does not store the live joystick position, integrators or current transient evaluation. Start/reset the test pad to clear runtime values. Autosave stores the definitions; Save JSON is the portable project copy.

Templates do not generate animations. Author the actions once, save them in the project, and reuse them through controllers. The system does not claim physics simulation, game-engine export, or automatic semantic rigging.

## Verification

`npm test` includes controller tests for deadzones, joystick normalization, character state priority, car wheel/drive mappings, clip reference reuse, persistence and transient input undo behaviour. `npm run build` verifies the production bundle.
