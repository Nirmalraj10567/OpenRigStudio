# True 360 Head Creator

The **Head Creator** dock builds a dedicated head workflow on top of the existing prepared-view and facial-animation systems.

## Workflow

1. Open **Character views** and create/import a character, or open an existing full-character view set.
2. Open **Head Creator**.
3. Choose the head root bone and select **Create head-only rig**.
4. If the head already belongs to a full-character view set, the selected branch is split into its own view set and the body set is preserved as the linked body view set.
5. Use the preview wheel to inspect the generated angles without adding keys.
6. Author each drawing slot and replace artwork for the selected view/part.
7. Tune eye spacing, nose depth, mouth width, and ear visibility. These controls update every prepared head slot from its saved baseline.
8. Map facial feature anchors. The linked facial profile remains available in **Facial** for expressions, blinking, audio drafts, and webcam capture.
9. Enable the generated face-mask guide while aligning artwork. The locked ellipse follows the selected head root and can be resized.
10. Set a frame range and choose **Create turn keys** to generate editable view-angle keys across all available head slots.

## Generated data

Each profile stores:

- the head root bone and dedicated character-view set;
- the optional linked body view set;
- prepared slot IDs, angles, names, and baselines;
- eye, pupil, nose, mouth, and ear feature anchors;
- layout controls and mask geometry;
- the linked facial profile and generated mask layer.

The base artwork and bone setup remain intact. Head layout controls modify prepared view targets, while facial controls remain transient until keyed or recorded through the facial system.

## Angle conventions

The default generated slots use the editor's established angles:

- Front: `0°`
- Front Side: `−45°`
- Side: `−90°`
- Back Side: `−135°`
- Back: `−180°`

Existing sets that already contain additional right-side angles retain those slots when the head branch is split.

## Verification

- Engine coverage: `tests/headCreator.test.mjs`
- Browser proof: `headcreator-proof.png`
- Build: `npm run build`
- Regression suite: `npm test`
