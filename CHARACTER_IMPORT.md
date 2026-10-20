# Character Studio JSON import

## Boy walk project

Open `boy-character-walk-fixed-v2.json` from the **Open** button. Character Studio recognizes the humanoid rig and upgrades the import in one undoable project replacement:

- keeps the existing 15-bone rig, 41 vector layers, walk clip, and eight authored angle views;
- opens the **Character views** dock so the eight angles can be previewed, keyed, and authored;
- converts clothing layers into triangle meshes and binds them to nearby bones for multi-bone deformation;
- creates cloth dynamics with pinned top rows, pose follow, travel limits, adaptive rest shape, and deterministic physics;
- exposes **W / Weight paint** and the Mesh & weights heatmap for normalized influence painting.

## Weight painting

1. Select a prepared clothing layer in **Layers & rig**.
2. In **Mesh & weights**, choose a bone in **Heatmap influence**.
3. Click **Paint selected influence** or press **W**.
4. Drag on the mesh to add influence. Hold **Shift** while dragging to erase influence.
5. Adjust brush radius and strength in the Weight map painting controls.

Painting changes normalized vertex influences only. UV coordinates and mesh topology remain unchanged. Each completed stroke is one undo step and survives project JSON save/open.

## Clothing physics

Open **Dynamics & physics** after import. Each prepared garment mesh is listed as a cloth object. Use **Toggle selected pin**, **Follow animated pose**, **Maximum cloth travel**, wind, and gravity to refine the result. **Build cache** creates a deterministic replay; **Bake to keys** creates an editable clip without changing the authored source animation.

The import preparation is intentionally non-destructive to authored angle artwork. Re-open the original file to start over, or use Undo immediately after import to restore the unprepared project.
