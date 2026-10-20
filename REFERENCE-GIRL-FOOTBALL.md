# Reference girl football kick

Open `reference-girl-football.json` in Character Studio, or choose
**Character views → Reference girl · football kick**.

## Scene

- `Football kick · wind, dress, hair, chest & ball physics` runs 0–120 at 24 FPS.
- Frames 0–23 hold the football at the right foot. The right thigh, shin and
  heel wind up and strike through frames 8–34. The ball launches at frame 24.
- The football is a native dynamic circle body with editable launch velocity,
  launch frame, restitution, friction, and a kinematic right-foot contact body.
- The grass floor is a native static box collider. The ball visibly rises,
  falls, rebounds, and remains above the field.

## Secondary motion

- The existing coral wrap skirt is simulated as pinned cloth with pose follow,
  adaptive rest lengths, wind, gravity, and a bounded 15 px travel limit.
- The two chest controls remain native jiggle springs with bounded 4.5 px
  travel; the kick's pelvis/spine counterbalance supplies their input motion.
- The swept-back hair layers are converted into editable skinned meshes with
  pinned roots and wind-driven cloth. They use a stronger wind scale than the
  dress so the airflow is visible.
- Global wind is 128 px/s with noise; the football uses `windScale: 0.04` so it
  behaves as a kicked ball rather than drifting like cloth.

## Verification outputs

- `reference-girl-football.webm` — native Chrome/WebCodecs video export.
- `reference-girl-football-timeline.png` — full scene timing sheet.
- `reference-girl-football-close.png` — dress/chest close-up timing sheet.
- `reference-girl-football-frame-24.png` — kick/launch frame.
- `reference-girl-football-physics.json` — sampled ball, dress, hair, and chest
  measurements with verification flags.

Regenerate everything with:

```bash
node tools/review-reference-girl-football.mjs
```

Run the focused scene checks with:

```bash
node --test tests/referenceGirlFootball.test.mjs tests/dynamics.test.mjs
```
