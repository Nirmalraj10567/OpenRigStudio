# Props Design Toolkit

The Props Design Toolkit creates one editable prop at a time and adds it to the current Animation Studio project. It is intended for scene objects such as houses and trees that need to participate in character-view turns and native physics.

## Open the toolkit

Click **Props toolkit** in the top toolbar.

The toolkit has four prop recipes:

| Recipe | Use |
| --- | --- |
| Willow cottage | Warm house with pitched roof, chimney, door, and windows |
| Townhouse | Taller facade with dormer and regular windows |
| Old oak | Broad leafy canopy with branch structure |
| Mountain pine | Tiered evergreen canopy |

Only one design is active in the toolkit at a time. Adding a prop does not replace the current scene.

## Prop design controls

### Palette

Every prop has three editable vector colors:

- `primaryColor` — walls or canopy.
- `secondaryColor` — roof or trunk.
- `detailColor` — windows, trim, highlights, and branch detail.

Colors are six-digit hex values such as `#d98f68`.

### Scale and angle

- `size` is bounded from `0.6` to `1.4`.
- `angle` is the current prepared view in degrees.
- The toolkit creates eight authored views:

```text
-180° Back
-135° Back side · left
 -90° Side · left
 -45° Front side · left
   0° Front
  45° Front side · right
  90° Side · right
 135° Back side · right
```

The angle strip selects the actual prepared artwork. It is not a fake CSS mirror or a camera-only rotation.

## Physics behavior

### Static

The prop is editable artwork and has no physics object.

### Collider

The prop receives a native kinematic box body attached to its root bone. Houses use a wall-sized box. Trees use a trunk/prop proxy. This is suitable for characters, balls, and other dynamic bodies to collide with the prop.

The collision preview's ball is preview-only. It is not exported as part of the prop.

### Wind

Trees can use native deterministic bone dynamics on the canopy spring:

- `windStrength` controls the per-prop wind scale.
- `stiffness` controls the spring resistance.
- `damping` controls settling.

The trunk/root stays anchored while the canopy reacts to the native physics solver. The preview and the final Animation Studio scene use the same dynamics implementation.

Existing scene dynamics are reused rather than overwritten. If an existing dynamics setup is disabled, enable it in **Dynamics & physics** first before adding a physics-enabled prop. Choose **Static** when you only want artwork.

## Native project export

Click **Export JSON** to download a standalone editable project. It contains:

- Native vector layers.
- A root bone and tree canopy bone where applicable.
- An eight-view `characterViews` entry.
- Rigid layer bindings.
- Native physics bodies or native bone dynamics.
- `metadata.exportType: "prop-studio-project"`.
- `metadata.propDesign`, containing the normalized recipe.

Open the downloaded JSON with **Open** in Animation Studio. It can be added to a larger animation scene after opening, or the prop can be added directly to the current scene with **Add prop to scene**.

## JSON design manifest

The design recipe is stored as a JSON string in `metadata.propDesign` for standalone exports. Appended props are also stored in the current scene under `metadata.propDesigns`, keyed by the generated layer group ID.

### House example

```json
{
  "kind": "house",
  "style": "cottage",
  "name": "Willow cottage",
  "primaryColor": "#d98f68",
  "secondaryColor": "#6c4750",
  "detailColor": "#f3d7a4",
  "size": 1,
  "angle": 0,
  "physics": "collider",
  "windStrength": 0,
  "stiffness": 34,
  "damping": 8
}
```

### Tree example

```json
{
  "kind": "tree",
  "style": "oak",
  "name": "Old oak tree",
  "primaryColor": "#4f9a62",
  "secondaryColor": "#81543d",
  "detailColor": "#d9b86c",
  "size": 1,
  "angle": 45,
  "physics": "wind",
  "windStrength": 80,
  "stiffness": 38,
  "damping": 7
}
```

Supported values:

```text
kind: house | tree
style: cottage | townhouse | oak | pine
physics: none | collider | wind
size: 0.6..1.4
angle: -180..180 degrees
windStrength: 0..200
stiffness: 5..120
damping: 1..20
```

`wind` is normalized to `collider` for houses because wind is a canopy behavior. `wind` is only available for tree props.

## Multi-angle JSON

The prop's view set is stored in the project root under `characterViews[]`. Its `targetIds` reference the prop's vector layers. Each `views[]` entry contains a separate vector artwork variant in `targets[layerId].artwork`.

```json
{
  "id": "character-prop-view-set",
  "name": "Willow cottage · prepared views",
  "enabled": true,
  "angle": 0,
  "wrap": true,
  "interpolate": true,
  "targetIds": ["layer-walls", "layer-roof", "layer-windows"],
  "baseline": {},
  "views": [
    {
      "id": "view-front",
      "name": "Front",
      "angle": 0,
      "targets": {
        "layer-walls": {
          "local": { "x": 0, "y": 0, "rotation": 0, "scaleX": 1, "scaleY": 1 },
          "visible": true,
          "artwork": { "type": "vector", "shapes": [] }
        }
      }
    },
    {
      "id": "view-side",
      "name": "Side · left",
      "angle": -90,
      "targets": {
        "layer-walls": {
          "local": { "x": 0, "y": 0, "rotation": 0, "scaleX": 1, "scaleY": 1 },
          "visible": true,
          "artwork": { "type": "vector", "shapes": [] }
        }
      }
    }
  ]
}
```

The toolkit generates all eight views. Use **Character views** after adding the prop to inspect, preview, key, and retime its `viewAngle` channel.

## Rigging structure

### House

```text
Willow cottage · root
├── Foundation · shadow and base
├── Walls · facade and side/rear
├── Roof · pitched planes
├── Openings · door and windows
└── Details · trim and accents
```

### Tree

```text
Old oak tree · root
├── Ground · rooted shadow
├── Trunk · rooted body
├── Branches · side and rear structure
├── Oak canopy · silhouette
└── Canopy · highlights and needles
```

All artwork remains editable vector layers. The root can be selected and moved as one prop. Tree canopy layers are bound to the canopy spring bone and can respond to wind.

## Validation checklist

- [ ] Select a recipe and confirm the live preview shows one prop.
- [ ] Click the eight angle cards and confirm the artwork changes.
- [ ] Use **Character views** after adding the prop to key its angle.
- [ ] Use **Collider** and test a physics preview for a house or tree.
- [ ] Use **Wind** on a tree and scrub to frame 48 to see canopy movement.
- [ ] Add the prop to a scene that already contains a character; confirm the character remains.
- [ ] Export JSON, reopen it, and confirm the prop, eight views, and physics settings remain.
- [ ] Use **Undo** to remove an appended prop without removing the existing scene.

## Limits

- Collision uses native oriented box proxies, not polygon collision geometry.
- Wind uses native bone dynamics, not a decorative animation loop.
- Props use prepared 2D vector artwork per angle, not a full 3D model.
- Houses do not use wind physics; trees do not have a rigid animated door or window mechanism yet.
