# Cycles, animation blending, and nonlinear animation

Character Studio supports reusable animation clips and a non-linear animation stack inside an active host clip. NLA layers reference existing clips rather than duplicating their tracks.

## Cycles and playback

Each clip can define:

- loop mode: Once, Cycle, or Ping-pong;
- loop start/end region;
- cycle offset;
- playback rate;
- trim start/end.

**Create cycle** stores the selected loop region. Ping-pong traverses the region forward and backward without duplicating keys. Cycle offsets are evaluated before wrapping, so a walk or turn can begin from any source pose.

## Clip editing

- **Trim** preserves the sampled values at the new boundaries and removes keys outside the range.
- **Retiming** maps the original key range into a new frame range.
- **Stretch** changes duration while preserving the relative spacing of keys and adjusts playback rate.
- Animation clips remain editable JSON data; trimming and retiming are reversible through the normal project history.

## Animation layers

An active host clip can contain multiple NLA layers referencing other clips. Each layer has:

- source clip;
- timeline start/end;
- source range and speed;
- cycle mode and offset;
- weight;
- additive or override blending;
- blend-in and blend-out fades;
- mute and solo state.

Layers are evaluated in stack order. Override layers blend toward the referenced pose. Additive layers add the difference between the source clip’s setup pose and its sampled pose. Overlapping layers therefore support pose blending and reusable motion cleanup without baking source clips together.

Adjacent layers can receive a crossfade transition. A transition retains the source references and uses the layer fade ranges to produce a smooth motion-clip handoff.

## Recommended workflow

1. Create short reusable clips such as idle, walk, turn, reach, recoil, and facial cleanup.
2. Add them as NLA layers to a host performance clip.
3. Set timeline ranges, cycle/ping-pong modes, speed, and blend weights.
4. Use additive layers for breathing, head turns, facial offsets, or secondary overlap corrections.
5. Use override layers for the primary body pose and crossfade between adjacent motion clips.
6. Trim, stretch, or retime the host arrangement after the performance timing is established.

The system is browser-native and does not claim `.moho` file compatibility or complete Moho NLA parity.
