# Character Studio JSON design and multi-angle rigging

This guide explains how to design one male or female character in **Character Studio**, export it as a native Animation Studio project, and author a rigged multi-angle turn.

The recommended workflow is:

1. Design one character in Character Studio.
2. Add it to the current stage or export a native `.json` project.
3. Open the project in Animation Studio.
4. Build or inspect the bone rig.
5. Create a Character View Set for the front, profile, back, and additional angles.
6. Author angle-specific artwork and animate the view angle.

## 1. Start a character

Open the app and click **Character studio** in the top toolbar.

### Choose one base

The Male/Female switch controls the active character. The studio previews and exports one character at a time.

### Build the character

Use the left design rail:

| Studio section | What it controls |
| --- | --- |
| Full character | Complete outfit presets, height, and build |
| Head & hair | Head shape, hair style, skin tone, and hair color |
| Neck | Neck width and body connection |
| Shirt / top | Shirt type, color, pattern, and details |
| Pants | Lower clothing style and color |
| Shoes | Footwear style and color |

The **Shirt / top** editor includes four tabs:

- **Color** — base shirt color.
- **Pattern** — none, stripes, checks, plaid, gradient, camouflage, or graphic.
- **Design** — T-shirt, hoodie, jacket, or blouse.
- **Details** — collar, roll-up sleeves, sleeve cuffs, pocket, or buttons.

## 2. Add or export the character

### Add to the current animation project

Click **Add character to stage**. The app creates an editable group containing separate vector layers and bones for:

- Torso
- Neck
- Head
- Upper/lower arms and hands
- Upper/lower legs and feet
- Shirt body and shirt details
- Pants and shoes
- Face features and hair

This is the quickest option when the current Animation Studio project already contains a scene or timeline.

### Export a standalone project

Click **Export**. The file is a native Animation Studio project JSON, not a screenshot and not a private design-only file.

Example filename:

```text
male-character-studio.json
```

Open it later with **Open** in Animation Studio. The JSON contains the bones, vector layers, bindings, groups, timeline data, and character design metadata.

The exported design manifest is stored in:

```json
project.metadata.characterDesign
```

`characterDesign` is a JSON string so older project readers can safely ignore it. The actual visible design is stored in the vector layers and bones.

## 3. Project JSON structure

The root project has this shape:

```json
{
  "schemaVersion": 1,
  "id": "project-unique-id",
  "name": "Male character",
  "canvas": {
    "width": 800,
    "height": 520,
    "background": "#20242d"
  },
  "bones": [],
  "layers": [],
  "bindings": [],
  "groups": [],
  "animations": [],
  "characterViews": [],
  "metadata": {}
}
```

Important rules:

- Keep `schemaVersion` equal to `1`.
- Every bone, layer, group, view, and keyframe needs a unique `id`.
- `parentId` connects a child bone to its parent.
- `childrenIds` must match the child bones' `parentId` values.
- A bound artwork layer is connected to a bone through `bindings`.
- Do not delete a referenced ID from one section while leaving it in another section.
- After manual edits, open the JSON in the app and check the layer list, bone list, and canvas before animating.

## 4. Editing the exported design manifest

The Character Studio design values look like this:

```json
{
  "gender": "male",
  "skin": "#e6a47e",
  "head": "angular",
  "hair": "crop",
  "hairColor": "#241c24",
  "neck": "classic",
  "shirt": "jacket",
  "shirtColor": "#665da8",
  "shirtPattern": "plaid",
  "shirtDetail": "pocket",
  "pants": "straight",
  "pantsColor": "#26394f",
  "shoes": "loafers",
  "shoesColor": "#c38a4d",
  "height": 52,
  "build": 50
}
```

Supported values:

| Field | Values |
| --- | --- |
| `gender` | `male`, `female` |
| `head` | `oval`, `round`, `angular` |
| `hair` | `crop`, `bob`, `curls`, `long`, `ponytail`, `fade` |
| `neck` | `slim`, `classic`, `strong` |
| `shirt` | `tee`, `hoodie`, `jacket`, `blouse` |
| `shirtPattern` | `none`, `stripes`, `checks`, `plaid`, `gradient`, `camouflage`, `graphic` |
| `shirtDetail` | `none`, `collar`, `roll-up`, `sleeves`, `pocket`, `buttons` |
| `pants` | `straight`, `wide`, `joggers`, `shorts` |
| `shoes` | `sneakers`, `boots`, `loafers` |
| `height` | number from `0` to `100` |
| `build` | number from `0` to `100` |

Colors must be six-digit hex colors, for example `#5792cc`.

### Important manual-edit note

Changing `metadata.characterDesign` alone does **not** redraw an already exported project. It is a portable design manifest. To apply a manual change to the visible character, either:

1. Change it in Character Studio and export again; or
2. Edit the matching vector layer shape `fill` values and detail shapes in `layers`.

The first option is safer because it keeps the bones, bindings, layers, and generated proportions synchronized.

## 5. Exact native rigging field names

These are the field names used by Animation Studio. They are case-sensitive.

| Purpose | Exact JSON field | Location |
| --- | --- | --- |
| Skinned mesh | `mesh` | One artwork object inside `layers[]` |
| Mesh vertices | `mesh.vertices[]` | Inside a layer's `mesh` |
| Vertex weights | `mesh.vertices[].weights` | Record of `boneId` → weight |
| Triangle topology | `mesh.triangles` | Flat integer index array |
| Mesh bounds | `mesh.bounds` | `{ x, y, width, height }` |
| Bone inverse matrices | `mesh.bindBoneInverses` | Record of `boneId` → affine matrix |
| Layer bind matrix | `mesh.bindLayerMatrix` | One affine matrix |
| Rigid binding | `bindings[]` | Root project array |
| Binding offset | `bindings[].bindOffset` | Transform relative to the bone |
| Smart Bone actions | `smartActions[]` | Root project array |
| Smart action baseline | `smartActions[].baseline` | Target ID → authored state |
| Smart action keys | `smartActions[].keys[]` | Angle → target deltas |
| Ordinary mesh animation | `animations[].tracks[]` | Track with `property: "mesh"` |

There is **no** generic `bindMatrix` field in the native schema. Use:

```text
mesh.bindBoneInverses
mesh.bindLayerMatrix
bindings[].bindOffset
```

Do not put mesh data on `characterViews[].baseline` unless the mesh is also part of a prepared multi-angle view. A normal skinned artwork mesh belongs on its layer.

## 5.1 Exact mesh and weighted-limb JSON

Meshes live on an artwork layer. The layer can be an image or vector layer. The following is a compact valid shape for a 2-column × 1-row triangle mesh:

```json
{
  "layers": [
    {
      "id": "layer-left-forearm",
      "name": "Left forearm",
      "type": "image",
      "local": { "x": 100, "y": 100, "rotation": 0, "scaleX": 1, "scaleY": 1 },
      "visible": true,
      "locked": false,
      "zIndex": 20,
      "boundBoneId": null,
      "opacity": 1,
      "src": "data:image/png;base64,...",
      "width": 200,
      "height": 100,
      "color": "#5792cc",
      "mesh": {
        "bounds": { "x": -100, "y": -50, "width": 200, "height": 100 },
        "vertices": [
          { "x": -100, "y": -50, "u": 0, "v": 0, "weights": { "bone-left-upper-arm": 1 } },
          { "x": 0, "y": -50, "u": 0.5, "v": 0, "weights": { "bone-left-upper-arm": 0.5, "bone-left-lower-arm": 0.5 } },
          { "x": 100, "y": -50, "u": 1, "v": 0, "weights": { "bone-left-lower-arm": 1 } },
          { "x": -100, "y": 50, "u": 0, "v": 1, "weights": { "bone-left-upper-arm": 1 } },
          { "x": 0, "y": 50, "u": 0.5, "v": 1, "weights": { "bone-left-upper-arm": 0.5, "bone-left-lower-arm": 0.5 } },
          { "x": 100, "y": 50, "u": 1, "v": 1, "weights": { "bone-left-lower-arm": 1 } }
        ],
        "triangles": [0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4],
        "bindBoneInverses": {
          "bone-left-upper-arm": { "a": 1, "b": 0, "c": 0, "d": 1, "e": -100, "f": -200 },
          "bone-left-lower-arm": { "a": 1, "b": 0, "c": 0, "d": 1, "e": -190, "f": -200 }
        },
        "bindLayerMatrix": { "a": 1, "b": 0, "c": 0, "d": 1, "e": 100, "f": 100 }
      }
    }
  ]
}
```

### Mesh rules

- `vertices[].x` and `vertices[].y` are authored mesh positions in layer space.
- `vertices[].u` and `vertices[].v` are normalized texture coordinates from `0` to `1`.
- `vertices[].weights` uses **bone IDs**, not bone names.
- Weights must be non-negative and are normalized by the engine.
- A vertex can use up to four nearby influences when generated by **Auto weights**.
- `triangles` is a flat array of vertex indices; every three numbers form one triangle.
- Triangle indices must be valid and cannot reference a missing vertex.
- `bindBoneInverses` stores one affine inverse per influencing bone.
- `bindLayerMatrix` stores the layer world matrix at bind time.
- Keep the mesh topology and UVs the same when creating view-specific mesh corrections.

For a real project, let the app create these fields with **Mesh & weights → Create triangle mesh → Auto weights / rebind rest pose**. Hand-written identity matrices are only safe when the layer and bones are actually in those identity positions.

## 5.2 Exact rigid binding JSON

Rigid artwork uses a root-level `bindings` entry and does not need a `mesh`:

```json
{
  "bindings": [
    {
      "id": "binding-shirt-body",
      "layerId": "layer-shirt-body",
      "imageId": "layer-shirt-body",
      "boneId": "bone-torso",
      "bindOffset": {
        "x": 0,
        "y": 0,
        "rotation": 0,
        "scaleX": 1,
        "scaleY": 1
      }
    }
  ]
}
```

Use `layerId` as the canonical layer reference. `imageId` is retained for legacy compatibility and should match the layer ID for newly authored files. A rigid layer follows one bone. An artwork layer that bends across multiple bones should use `mesh` and weighted vertices instead.

## 5.3 Exact Smart Bone action JSON

Smart Bone actions use `smartActions[]` at the root. The driver is a bone, and target changes are stored as **deltas from `baseline`**, not as a second absolute project pose.

### Smile dial: 0° to 90°

The UI displays degrees, but JSON bone rotations and Smart Bone action angles are radians. Therefore:

```text
0°  = 0
90° = 1.5707963267948966
```

```json
{
  "smartActions": [
    {
      "id": "smart-smile",
      "name": "Smile",
      "driverBoneId": "bone-smile-dial",
      "startAngle": 0,
      "endAngle": 1.5707963267948966,
      "enabled": true,
      "blendMode": "additive",
      "weight": 1,
      "priority": 0,
      "neutralAngle": 0,
      "limitDriver": true,
      "baseline": {
        "layer-mouth": {
          "local": { "x": 0, "y": 0, "rotation": 0, "scaleX": 1, "scaleY": 1 },
          "opacity": 1,
          "visible": true,
          "zIndex": 40
        }
      },
      "keys": [
        { "angle": 0, "targets": {}, "easing": "linear" },
        {
          "angle": 1.5707963267948966,
          "targets": {
            "layer-mouth": {
              "transform": { "y": -5, "rotation": 0.12, "scaleX": 1.12, "scaleY": 1 },
              "opacity": 0
            },
            "layer-mouth-smile": {
              "transform": { "y": 0, "rotation": 0, "scaleX": 1, "scaleY": 1 },
              "opacity": 1,
              "visible": true,
              "zIndex": 41
            }
          },
          "easing": "smooth"
        }
      ]
    }
  ]
}
```

The `layer-mouth-smile` target must also exist in `layers[]` and in the action `baseline`. If the smile is made with a mesh instead of a replacement mouth layer, the key uses a `mesh` delta with exactly the same number of points as `baseline.layer-mouth.mesh`.

### Blink action

A blink can scale two eye layers vertically. Since Smart Bone keys store deltas, a baseline `scaleY` of `1` and a closed value of `0.15` uses a delta of `-0.85`:

```json
{
  "id": "smart-blink",
  "name": "Blink",
  "driverBoneId": "bone-blink-dial",
  "startAngle": 0,
  "endAngle": 1.5707963267948966,
  "enabled": true,
  "baseline": {
    "layer-left-eye": {
      "local": { "x": 0, "y": 0, "rotation": 0, "scaleX": 1, "scaleY": 1 },
      "opacity": 1,
      "visible": true,
      "zIndex": 30
    },
    "layer-right-eye": {
      "local": { "x": 0, "y": 0, "rotation": 0, "scaleX": 1, "scaleY": 1 },
      "opacity": 1,
      "visible": true,
      "zIndex": 31
    }
  },
  "keys": [
    { "angle": 0, "targets": {}, "easing": "linear" },
    {
      "angle": 1.5707963267948966,
      "targets": {
        "layer-left-eye": { "transform": { "scaleY": -0.85 } },
        "layer-right-eye": { "transform": { "scaleY": -0.85 } }
      },
      "easing": "smooth"
    }
  ]
}
```

Do not put the driver bone itself in `baseline` or in a key's `targets`. The engine rejects driver feedback during action authoring.

### Smart action field rules

- `driverBoneId`, `targetIds`, and `viewSetIds` use IDs, never display names.
- `startAngle`, `endAngle`, `angle`, and `neutralAngle` are numeric radians for bone/action channels.
- `keys[].targets[id].transform` is a partial transform delta with any of `x`, `y`, `rotation`, `scaleX`, or `scaleY`.
- `keys[].targets[id].opacity` is an opacity delta, not an absolute opacity.
- `visible` and `zIndex` are discrete values and switch to the nearest key.
- `keys[].targets[id].mesh` is a point delta array with the same length as the baseline mesh.
- The first key at `startAngle` is normally `{ "targets": {} }`.
- All action target IDs must appear in `baseline`.

## 5.4 Exact ordinary mesh animation track

If a mesh is animated directly on the timeline rather than through a Smart Bone action, add a normal animation track:

```json
{
  "animations": [
    {
      "id": "animation-main",
      "name": "Character animation",
      "fps": 24,
      "startFrame": 0,
      "endFrame": 48,
      "tracks": [
        {
          "id": "track-shirt-mesh",
          "targetId": "layer-shirt-body",
          "property": "mesh",
          "keyframes": [
            {
              "id": "mesh-key-0",
              "frame": 0,
              "value": [
                { "x": -100, "y": -50 },
                { "x": 0, "y": -50 },
                { "x": 100, "y": -50 }
              ],
              "easing": "linear"
            },
            {
              "id": "mesh-key-24",
              "frame": 24,
              "value": [
                { "x": -96, "y": -50 },
                { "x": 4, "y": -46 },
                { "x": 96, "y": -50 }
              ],
              "easing": "smooth"
            }
          ]
        }
      ]
    }
  ]
}
```

For a mesh track, `keyframes[].value` is an array of `{ x, y }` points. It must have the same length and vertex order as `layers[].mesh.vertices`. UVs and weights stay on the mesh definition; the animation key only stores the authored vertex positions.



## 6. Rigging the generated character

The generated character is a cut-out vector rig. Use the following hierarchy as the normal rest pose:

```text
Torso
├── Neck
│   └── Head
├── Left upper arm
│   └── Left lower arm
│       └── Left hand
├── Right upper arm
│   └── Right lower arm
│       └── Right hand
├── Left upper leg
│   └── Left lower leg
│       └── Left foot
└── Right upper leg
    └── Right lower leg
        └── Right foot
```

### Rest pose checklist

Before creating multi-angle views:

1. Put the character in a neutral front pose.
2. Keep the torso at the character's center of mass.
3. Keep the head bone starting at the top of the neck.
4. Keep upper and lower limb bones connected at the visible joints.
5. Keep foot bones pointing toward the toes.
6. Lock the torso only if it should remain an animation anchor.
7. Confirm that each artwork layer follows the intended bone in **Layers & rig**.
8. Save the project before authoring angles.

For simple rigid artwork, use **Bind** (`L`). For artwork that bends across more than one joint, use **Mesh & weights** (`M`) and create a triangle mesh before assigning influences.

## 7. Multi-angle view sets

Open **Character views** from the context toolbar or the right dock. A view set owns a collection of bones and artwork targets and evaluates them as one turning character.

The standard five-angle set is:

| View name | Angle |
| --- | ---: |
| Front | `0` |
| Front Side | `-45` |
| Side | `-90` |
| Back Side | `-135` |
| Back | `-180` |

For a smoother full turn, use eight angles:

```text
0, -45, -90, -135, -180, 45, 90, 135
```

You can also use custom angles such as `-30`, `30`, `60`, or `180`. Keep the angles in degrees.

### Create a multi-angle rig in the UI

1. Select the generated torso, head branch, or complete character.
2. Open **Character views**.
3. Choose **Create a character / head / body view set**.
4. Select the bones and artwork that should turn together.
5. Create the set. The current front setup becomes the baseline and Front `0°`.
6. Add **reference angles** or **full 8 angles**.
7. Select an angle and click **Preview this view · no angle key**.
8. Adjust each part for that view:
   - Local X/Y position
   - Rotation
   - X/Y scale
   - Bone length
   - Visibility and opacity
   - Layer order
   - View-specific artwork
   - View-specific vector colors
9. Repeat for every angle.
10. Use **Reference sheet** to compare all drawings before animating.

### Which artwork should change at each angle?

At minimum, author these parts:

| Character part | Front | Side | Back |
| --- | --- | --- | --- |
| Head / face | Both eyes, nose, mouth | One eye, smaller nose/mouth | Rear hair or head shape |
| Hair | Front fringe | Side silhouette | Back volume / ponytail |
| Shirt | Both sleeves, front collar, buttons | Narrow torso, one sleeve | Back collar, seams, back print |
| Pants | Two legs and waistband | One visible leg or overlap | Back pockets and waistband |
| Shoes | Both shoes | One shoe or overlapped shoes | Back heels |

Do not move the bone hierarchy to fake a view. Keep the skeleton stable and store the drawing correction in the view target. This makes the character remain poseable while turning.

## 8. Multi-angle JSON structure

After creating a view set and saving the project, the root JSON contains `characterViews`:

```json
{
  "characterViews": [
    {
      "id": "character-view-set-1",
      "name": "Main character 360",
      "enabled": true,
      "angle": 0,
      "wrap": true,
      "interpolate": true,
      "targetIds": [
        "bone-torso-id",
        "bone-head-id",
        "layer-shirt-id",
        "layer-pants-id"
      ],
      "baseline": {
        "layer-shirt-id": {
          "local": { "x": 0, "y": 0, "rotation": 0, "scaleX": 1, "scaleY": 1 },
          "visible": true,
          "opacity": 1,
          "zIndex": 12
        }
      },
      "views": [
        {
          "id": "view-front-0",
          "name": "Front",
          "angle": 0,
          "targets": {}
        },
        {
          "id": "view-side-90",
          "name": "Side",
          "angle": -90,
          "targets": {
            "layer-shirt-id": {
              "local": { "x": 4, "y": 0, "rotation": 0, "scaleX": 0.42, "scaleY": 1 },
              "visible": true,
              "opacity": 1,
              "zIndex": 12
            }
          }
        },
        {
          "id": "view-back-180",
          "name": "Back",
          "angle": -180,
          "targets": {}
        }
      ]
    }
  ]
}
```

### View set fields

| Field | Meaning |
| --- | --- |
| `targetIds` | Bones and artwork layers owned by this view set |
| `baseline` | Frame-zero setup state for every target |
| `views` | Prepared angle configurations |
| `views[].angle` | Angle in degrees |
| `views[].targets` | Only the corrections for that angle |
| `wrap` | Joins the last view back to the first view |
| `interpolate` | Blends compatible transforms between nearby views |

Each target correction uses a `local` transform:

```json
{
  "local": {
    "x": 4,
    "y": 0,
    "rotation": 0.08,
    "scaleX": 0.42,
    "scaleY": 1
  },
  "visible": true,
  "opacity": 1,
  "zIndex": 12
}
```

`rotation` is in radians inside transforms. View `angle` is in degrees. Do not put degrees into `local.rotation`.

## 9. View-specific artwork

When a side or rear drawing needs different artwork, use the view target's `artwork` field:

```json
{
  "layer-shirt-id": {
    "local": { "x": 0, "y": 0, "rotation": 0, "scaleX": 1, "scaleY": 1 },
    "visible": true,
    "opacity": 1,
    "zIndex": 12,
    "artwork": {
      "type": "vector",
      "shapes": [
        {
          "id": "back-shirt-shape",
          "kind": "path",
          "d": "M -45 -80 ...",
          "fill": "#665da8",
          "stroke": "none",
          "strokeWidth": 1
        }
      ]
    }
  }
}
```

For a local raster drawing, use:

```json
{
  "artwork": {
    "type": "image",
    "src": "data:image/png;base64,...",
    "width": 240,
    "height": 320,
    "color": "#665da8"
  }
}
```

Use the UI's **Replace artwork for this view** when possible. It keeps the image local, preserves the existing target bounds, and avoids broken remote URLs.

## 10. Animate the character turn

Character angle is an animation channel separate from camera yaw, pitch, and roll.

### UI workflow

1. Set the view set to Front at frame `0`.
2. Enable **Auto-key**, or use **Key angle** manually.
3. Move to a later frame such as `24`.
4. Set the character angle to `-90` for Side.
5. Move to frame `48` and set `-180` for Back.
6. Play the timeline and inspect the transition.
7. Use **Channels → Character views** to retime or edit angle keys.

Example timing:

```text
Frame 0   → 0°
Frame 12  → -45°
Frame 24  → -90°
Frame 36  → -135°
Frame 48  → -180°
```

### JSON angle track

The generated animation clip stores the view-set angle as a track. The exact IDs are generated by the app, but the structure is similar to:

```json
{
  "id": "track-character-angle",
  "targetId": "character-view-set-1",
  "property": "viewAngle",
  "keyframes": [
    { "id": "key-0", "frame": 0, "value": 0, "easing": "linear" },
    { "id": "key-12", "frame": 12, "value": -45, "easing": "linear" },
    { "id": "key-24", "frame": 24, "value": -90, "easing": "linear" },
    { "id": "key-48", "frame": 48, "value": -180, "easing": "linear" }
  ]
}
```

Use `step` easing when a turn should switch immediately between prepared drawings. Use `linear` or an ease preset when alignment should move smoothly between compatible view targets.

### Full 360 turn

For a clockwise turn:

```text
0° → 45° → 90° → 135° → 180° → 225° → 270° → 315° → 360°
```

For a reverse turn, use negative values:

```text
0° → -45° → -90° → -135° → -180° → -225° → -270° → -315° → -360°
```

If `wrap` is enabled, the final angle connects back to the first angle across the rear seam. Keep the sign direction consistent across the angle keys and prepared views.

## 11. Head and body as separate controls

For a professional character, split the head from the body:

1. Create the complete body view set first.
2. Create a **Head Creator** from the head bone and facial branch.
3. Link the head view set to the body view set.
4. Author separate front, profile, rear, and facial feature corrections.
5. Animate the head angle independently while the body keeps its own angle.

This is useful for a talking character looking left while the torso remains front-facing. The shared bone hierarchy keeps the head attached to the neck, while separate view channels keep the artwork deterministic.

## 12. Validation checklist

Before saving a production character JSON:

- [ ] The file opens without an error in Animation Studio.
- [ ] `schemaVersion` is `1`.
- [ ] Every `targetId` in `bindings` exists in `layers` or `bones`.
- [ ] Every `characterViews[].targetIds` entry exists.
- [ ] Every view has a numeric angle in degrees.
- [ ] Every view target uses a complete finite `local` transform.
- [ ] Front is aligned at frame `0`.
- [ ] The side view does not move the torso or bone hierarchy unexpectedly.
- [ ] Back artwork is not accidentally visible in Front.
- [ ] Shirt patterns and details are visible at Front, Side, and Back where intended.
- [ ] The turn plays correctly with **Channels → Character views** selected.
- [ ] Save and reopen the JSON before adding final animation.

## 13. Common problems

### The exported file will not open

Use **Export** from Character Studio rather than saving a screenshot or copying only `metadata.characterDesign`. The native export must contain `schemaVersion`, `bones`, `layers`, `bindings`, `animations`, and `stage2d`.

### The character turns but artwork stays in the wrong place

Edit the target's view-specific `local.x`, `local.y`, `rotation`, `scaleX`, and `scaleY`. Do not change the base layer transform for only one angle.

### The side view is too wide

Reduce that view's `scaleX`, usually to a value between `0.35` and `0.7`, and keep `scaleY` near `1`. This creates a profile without changing the character's authored height.

### The back view shows the face

Use a view-specific artwork replacement or set front-only face targets to `visible: false` in the back view. Add rear hair/head artwork to the Back view instead.

### Layer order is wrong during a turn

Set `zIndex` in the view target. Front arm, hair, shirt collar, and hand layers often need a different order in profile and back views.

### Mesh artwork tears between angles

Keep the same mesh topology and UVs across the view set. Correct vertex positions per view rather than creating unrelated meshes with different vertex counts.

## 14. Related docs

- [CHARACTER_VIEWS.md](CHARACTER_VIEWS.md) — full multi-view authoring and view animation reference.
- [RIGGING.md](RIGGING.md) — rigid binding, mesh weights, Smart Bones, and animation.
- [MOHO_CHARACTER_DEVELOPMENT.md](MOHO_CHARACTER_DEVELOPMENT.md) — complete independent head/body character pipeline.
- [HEAD_CREATOR.md](TRUE_360_HEAD_CREATOR.md) — head-only multi-angle and facial feature workflow.
