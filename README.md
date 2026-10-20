# Moho Studio

Moho Studio is a browser-based 2D character and environment animation editor. It supports editable vector and image layers, bones, meshes, cameras, timeline keyframes, prepared character views, physics, and a dedicated **Environment** workspace based on the annotated environment-editor plan.

## Requirements

- Node.js `22.14.0` (the version is pinned in `.nvmrc`)
- npm 10+

## Setup

```bash
nvm use
npm ci
```

The project uses the checked-in `package-lock.json`. Dependencies are installed locally in the project; no global packages or system-wide installs are required.

## Bone Mapping workflow

Open the **Rigging** workspace to use the dedicated Bone Mapping board. The front view is the editable mapping surface; side and back views are synchronized read-only previews. Choose a source artwork layer and target bone in the mapping card, then confirm the map. Mesh artwork is routed to **Mesh & weights** for multi-bone influences instead of rigid binding.

The **Auto rig** panel generates a semantic skeleton, optionally binds named artwork, and reports created, mapped, and unmapped items. Auto-rigging is undoable. Use the animation strip on the board to validate a mapped pose before adding timeline keys.

## Docked tool panels

In Character Studio, the Inspector contains every editing panel, including Rig & animate, Assets, Brushes, Facial, Head Creator, Constraints, Dynamics, Controllers, Style, Stage, 3D Motion, Camera, Onion Skin, and Character views. Use the **DOCK** controls in the Inspector header to move the tool dock to the right or below the stage, collapse or reopen it, and reset the layout. Use the **Scene Objects** header's minimize/restore control to reclaim inspector space without hiding the whole dock. Drag a panel tab to reorder it, or drag the dock resize handle to change its size. The placement, size, collapsed state, and tab order are saved in the browser under `character-studio-dock-layout:v1`.

## Joystick Control and Motion Tracking

The **Animation** workspace keeps the normal CanvasStage and main Timeline visible. Open the **Joystick** dock to drive a saved controller instance on the real rig through the existing controller engine. Live input is transient by default; enable **Record animation** to capture evaluated rig transforms into a new native animation clip. Reset returns inputs to neutral without removing saved keys.

The **Motion Tracking** dock accepts a local video reference, overlays cached body landmarks, processes confidence and smoothing, suggests mappings to the current rig, previews the real character with the existing IK solver, and bakes the result into an editable Timeline clip. Video detection uses the browser MediaPipe Pose Landmarker adapter; tracking frames are cached locally when the browser permits it, while the generated animation remains ordinary project data. A single video provides observed front motion and estimated side/back inspection views; it does not claim hidden 3D reconstruction.

See [MOTION_TRACKING.md](MOTION_TRACKING.md) for the complete import, detection, mapping, preview, bake, troubleshooting, sample-video, and verification workflow.

## Run locally

```bash
npm run dev
```

Open the URL printed by Vite. The application opens in the Environment workspace. The workspace includes environment asset presets, scene blocking, terrain tiles, weather and lighting controls, effects, camera preview, layer controls, a minimap, and the shared animation stage. Character Studio, Rigging, Deformation, and Animation remain available from the workspace bar.

## Environment projects

Open a JSON project from the **Open** button or the Environment workspace import card. Files containing an `environment`, `world`, `terrain`, `environmentSettings`, or an environment workspace marker automatically switch to the Environment workspace after import.

Environment data is stored in the project JSON and includes:

- Scene, biome, time-of-day, weather, lighting, fog, and color grade settings
- Terrain grid, tile material, elevation, collision, auto-tile, and grid settings
- Camera bounds, safe area, and minimap preferences
- Environment layer metadata and asset IDs

Legacy character project JSON remains valid and opens in the appropriate character workspace.

## Test

Run the complete offline test suite after dependencies are installed:

```bash
npm test
```

Run the real-browser UI audit (requires the local Google Chrome executable or `CHARACTER_STUDIO_CHROME_PATH`):

```bash
npm run test:browser
```

The Playwright audit exercises workspace tabs, inspector tabs, docking placement/reordering/resizing/persistence, the main-editor Joystick and Motion Tracking docks, mapping controls, tool rails, viewport controls, timeline transport, dialogs, downloads, file choosers, and the Joystick workspace. It writes screenshots and a machine-readable report under `evidence/`.

The focused environment test can be run with:

```bash
node --test tests/environment.test.mjs
```

## MCP over HTTP/HTTPS

The full Character Studio MCP server is available over stdio and Streamable HTTP. The HTTP transport exposes the same project, design, animation, scene, physics, asset, and native-render tools, including the compact design tools under `design_*` aliases where names overlap.

Start a local HTTP endpoint:

```bash
CHARACTER_STUDIO_WORKSPACE=. npm run mcp:http
```

The endpoint is `http://127.0.0.1:8787/mcp`. Set `CHARACTER_STUDIO_MCP_AUTH_TOKEN` when the endpoint must be accessed by another process or host. Non-loopback binds require a bearer token unless `CHARACTER_STUDIO_MCP_ALLOW_ANONYMOUS=true` is explicitly set.

Enable native HTTPS with a certificate and private key kept outside Git:

```bash
CHARACTER_STUDIO_MCP_HOST=0.0.0.0 \
CHARACTER_STUDIO_MCP_AUTH_TOKEN='replace-me' \
CHARACTER_STUDIO_MCP_TLS_CERT=/path/to/fullchain.pem \
CHARACTER_STUDIO_MCP_TLS_KEY=/path/to/private-key.pem \
npm run mcp:https
```

Remote MCP clients should connect to `https://<host>:8787/mcp` and send `Authorization: Bearer <token>`. `/healthz` is a lightweight readiness endpoint. The legacy `/sse` and `/message?sessionId=...` compatibility endpoints are also available for clients that have not migrated to Streamable HTTP. See [`mcp/README.md`](mcp/README.md) for tool discovery, client configuration, TLS, CORS, and curl examples.

## Build

```bash
npm run build
```

The production bundle is written to `dist/`.

## Preview a production build

```bash
npm run preview
```

## Docker deployment

Build the static production image:

```bash
docker build -t moho-studio .
```

Run it locally:

```bash
docker run --rm -p 8080:80 moho-studio
```

Open <http://localhost:8080>.

The Docker build installs the pinned lockfile dependencies in a Node 22 build stage and serves the generated static bundle with nginx. No application secrets are required.
