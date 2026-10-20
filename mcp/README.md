# Character Studio MCP plugin

Character Studio includes a full Model Context Protocol server for AI agents. It supports MCP JSON-RPC over stdio and Streamable HTTP/HTTPS, works with Claude Desktop, Cursor, VS Code, or another MCP-compatible host, and exposes the project, design, animation, scene, physics, and native render tools. The host and authoring tools use Node built-ins. Optional render tools launch the existing Vite application and installed Chrome to run the project's native Canvas/SVG/WebCodecs exports.

## Start it

From this project:

```bash
CHARACTER_STUDIO_WORKSPACE=/absolute/path/to/project npm run mcp
```

The server writes protocol responses to stdout and diagnostics to stderr. Project paths supplied to tools are restricted to `CHARACTER_STUDIO_WORKSPACE`.

## HTTP and HTTPS transport

Start the full server locally:

```bash
CHARACTER_STUDIO_WORKSPACE=/absolute/path/to/project npm run mcp:http
```

It listens on `http://127.0.0.1:8787/mcp` by default. The transport implements MCP Streamable HTTP (`POST /mcp`, `GET /mcp` for an event stream, and `DELETE /mcp` for session cleanup) and retains legacy SSE compatibility at `/sse` and `/message?sessionId=...`.

For a remote or non-loopback endpoint, set a bearer token:

```bash
CHARACTER_STUDIO_MCP_HOST=0.0.0.0 \
CHARACTER_STUDIO_MCP_AUTH_TOKEN='use-a-long-random-secret' \
CHARACTER_STUDIO_WORKSPACE=/absolute/path/to/project \
npm run mcp:http
```

Native HTTPS is enabled by setting both certificate paths. The certificate and private key are read at startup and are never stored in the project:

```bash
CHARACTER_STUDIO_MCP_TLS_CERT=/etc/ssl/fullchain.pem \
CHARACTER_STUDIO_MCP_TLS_KEY=/etc/ssl/private/character-studio.key \
CHARACTER_STUDIO_MCP_AUTH_TOKEN='use-a-long-random-secret' \
CHARACTER_STUDIO_MCP_HOST=0.0.0.0 \
npm run mcp:https
```

The resulting endpoint is `https://<host>:8787/mcp`. Optional browser clients can set `CHARACTER_STUDIO_MCP_CORS_ORIGIN` to a comma-separated allowlist; origins not on that list are rejected. `GET /healthz` returns transport and tool-count readiness metadata.

## MCP client configuration

```json
{
  "mcpServers": {
    "character-studio": {
      "command": "node",
      "args": ["/absolute/path/to/bone/mcp/character-studio-mcp.mjs"],
      "env": {
        "CHARACTER_STUDIO_WORKSPACE": "/absolute/path/to/bone"
      }
    }
  }
}
```

HTTP/HTTPS clients can use the same tool registry:

```json
{
  "mcpServers": {
    "character-studio-remote": {
      "url": "https://studio.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${CHARACTER_STUDIO_MCP_AUTH_TOKEN}"
      }
    }
  }
}
```

The project CLI can exercise a remote endpoint without changing tool calls:

```bash
CHARACTER_STUDIO_MCP_URL=https://studio.example.com/mcp \
CHARACTER_STUDIO_MCP_TOKEN="$CHARACTER_STUDIO_MCP_AUTH_TOKEN" \
node mcp/call.mjs list
```

## Built-in agent tools

- `inspect_project` — summarize layers, bones, timeline, dynamics, and bodies.
- `read_project` — return complete editable project JSON.
- `feature_catalog` — list the complete project, design, animation, scene, physics, and render MCP surface.
- `inspect_project_full` — summarize all persisted feature families, including environment, stage, cameras, controllers, facial profiles, views, constraints, dynamics, audio, meshes, and paths.
- `patch_project` — atomically set, merge, or remove JSON-pointer fields across the full project schema, with native-engine validation before saving.
- `validate_project` — load, normalize, SVG-check, and round-trip a project without modifying its source.
- `create_character_scene` — generate nine vector layers with a six-bone rig and seven artwork bindings; each arm and leg is independently poseable.
- `create_physics_ball_scene` — create a gravity/bounce project with optional gravity, restitution, friction, FPS, and duration overrides.
- `update_physics_settings` — change gravity, timing, mass, restitution, or friction and preserve the JSON project.
- `write_project` — save a complete project JSON supplied by the agent.
- `animate_character` — animate a `create_character_scene` rig with the `garden_to_coffee_shop` story, including backgrounds, building, props, walk, ordering, handoff and drinking.
- `inspect_animation` — list clips, animation targets, channels and keyframe ranges.
- `add_scene_prop` — add editable vector background/prop layers, optionally attached to a bone.
- `set_animation_keyframes` — replace a native transform, scalar, opacity or visibility channel with validated editable keys.
- `preview_project_frame` — export a PNG frame using the native engine.
- `preview_project_timeline` — sample the animation range and export a labeled PNG contact sheet of the scene timeline.
- `render_project_video` — export an MP4/WebM using the existing `renderProjectVideo()` implementation.
- `scene_catalog` — list compact semantic Scene Kit recipes, palettes, characters and camera presets.
- `compose_scene` — build a validated editable vector scene from a recipe instead of hand-authoring coordinates. It creates perspective staging, connected two-segment limbs, IK poses, contact shadows and native keyframes.
- `validate_scene` — run native-engine quality checks across full and half frames: joint continuity, artwork attachments, transforms, depth ordering, camera bounds, SVG output and deterministic seeking.
- `create_tom_jerry_car_race` — create an editable five-second cartoon two-car race with Tom, Jerry, spinning wheels, dust, speed lines, stadium lanes, and a finish flag.
- `recreate_furniture_showroom_animation` — recreate the supplied pastel furniture-showroom reference as an editable five-second vector scene with beds, purple sofa, visitor rig, walk, fall, and camera zoom.
- `animate_exact_reference_plate` — preserve a supplied PNG screenshot pixel-for-pixel and animate it with a native five-second timeline camera move.

The aggregate server also includes the compact design tools. When a name overlaps an existing general tool, the compact version is available with a `design_` prefix, for example `design_inspect_project`; the standalone `mcp/design-mcp.mjs` entry remains available for clients that want only the low-token design registry.

The resulting JSON opens through the editor’s normal **Open** action. The MCP render commands and the Video dialog share the same engine; the MCP tool starts an isolated browser for rendering and leaves the saved source project intact.

## Garden → café → coffee, entirely through MCP

The initial MCP call reported `Unknown MCP tool: animate_character`. The animation plugin adds that missing capability, plus general prop/keyframe operations. The example was then created and rendered using actual `tools/call` requests to the server.

```bash
node mcp/call.mjs list
node mcp/call.mjs animate_character '{"sourcePath":"mcp-character-scene.json","path":"my-cafe-scene.json","story":"garden_to_coffee_shop","fps":24}'
node mcp/call.mjs inspect_animation '{"path":"my-cafe-scene.json"}'
node mcp/call.mjs preview_project_frame '{"path":"my-cafe-scene.json","outputPath":"my-cafe-preview.png","frame":475}'
node mcp/call.mjs preview_project_timeline '{"path":"my-cafe-scene.json","outputPath":"my-cafe-timeline.png","samples":6,"columns":3}'
node mcp/call.mjs render_project_video '{"path":"my-cafe-scene.json","outputPath":"my-cafe-video.mp4"}'
```

Preview/video export requires **Node 22+ and installed Chrome/Chromium**. The tool checks common system Chrome paths, or accepts `CHARACTER_STUDIO_CHROME_PATH` in the MCP server's environment. It uses Chrome's built-in debugging protocol directly. It needs the project's normal npm dependencies installed; no Playwright dependency is used.

`node mcp/examples/garden-cafe.mjs --render` repeats the complete sequence through MCP: animation, adding bird props, keying prop visibility, three PNG previews and the final MP4. This example replaces its own `garden-cafe-*` outputs. Omit `--render` to create just the editable project.

### Delivered scene

- [Editable scene](../garden-cafe-scene.json) — 49 layers, eight bones (including a forearm and cup attachment), 63 tracks.
- [Final MP4](../garden-cafe-story.mp4) — 24 seconds, 1280 × 720, 24 FPS, 576 H.264 frames, silent.
- [Decoded video filmstrip](../garden-cafe-filmstrip.jpg)
- [Garden walk](../garden-cafe-walk.png), [ordering](../garden-cafe-order.png), [drinking](../garden-cafe-drink.png).

| Time | Action |
| --- | --- |
| 0–10 s | Garden, trees, flowers, bench, moving clouds; character walks toward the café, door opens and character enters. |
| 10–18 s | Café interior, menu, barista, espresso machine and counter; character orders and receives a cup. |
| 18–24 s | Garden-view coffee nook; articulated arm raises the attached cup for two sips. |

The source character remains unchanged. The story is native project data with ordinary editable bone/shape/visibility keyframes. The high-level story preset expects the named starter character rig; the prop and keyframe tools can also edit other projects.

Regression coverage checks source preservation, walking/leg motion, scene visibility, cup handoff continuity, cup-to-hand attachment, cup-to-mouth distance, deterministic scrubbing, JSON/SVG round trips, prop addition, and atomic rejection of invalid keyframes. Native preview and video MCP calls were exercised against installed Chrome; `ffprobe` independently decoded all 576 frames.

## Tom and Jerry car race

The MCP has a dedicated `create_tom_jerry_car_race` tool separate from the existing on-foot chase tool:

```bash
node mcp/call.mjs create_tom_jerry_car_race '{"path":"tom-jerry-car-race.json","fps":24,"overwrite":true}'
node mcp/call.mjs render_project_video '{"path":"tom-jerry-car-race.json","outputPath":"tom-jerry-car-race.mp4","format":"mp4","overwrite":true}'
```

The verified output is [tom-jerry-car-race.mp4](../tom-jerry-car-race.mp4): 5 seconds, 1280 × 720, 24 FPS, 120 H.264 frames. The editable source is [tom-jerry-car-race.json](../tom-jerry-car-race.json). The scene contains two animated car roots, four wheel bones, driver artwork, spin tracks, dust, speed lines, lane markings, stadium seating, and a finish flag.

- [Race filmstrip](../tom-jerry-car-race-filmstrip.jpg)
- [MCP timeline preview contact sheet](../tom-jerry-car-race-timeline.png)
- [Start frame](../tom-jerry-race-start.png)
- [Mid-race frame](../tom-jerry-race-mid.png)
- [Finish frame](../tom-jerry-race-finish.png)

For any editable project, `preview_project_timeline` samples the actual active animation clip, renders each selected frame through Character Studio's native SVG/Canvas path, and returns the frame list, columns, output dimensions, and PNG path. Supply exact `frames` when you want storyboard beats rather than evenly spaced samples.

## Supplied furniture-showroom reference

The project MCP also includes `recreate_furniture_showroom_animation` for the supplied screenshot reference. It creates [reference-showroom-scene.json](../reference-showroom-scene.json) with the pastel showroom, perspective display beds, large purple sofa, information stand, tiled floor, suited visitor bone chains, planted walk/gesture/fall keys, and a camera-root close-up zoom.

- [Rendered reference recreation](../reference-showroom-animation.mp4)
- [Timeline preview](../reference-showroom-timeline.png)
- [Wide frame](../reference-showroom-wide.png)
- [Action frame](../reference-showroom-action.png)
- [Close-up frame](../reference-showroom-close.png)
- [Corrected native rig animation](../reference-showroom-rigged-animation.mp4)
- [Corrected native rig timeline](../reference-showroom-rigged-timeline.png)

### Scene Kit: low-token semantic authoring

For a new scene, an agent can discover the compact vocabulary, compose a
complete result, and run the quality check with three short calls:

```bash
node mcp/call.mjs scene_catalog '{}'
node mcp/call.mjs compose_scene '{"path":"scene.json","preset":"showroom_stumble","palette":"pastel","character":"suited","camera":"follow","duration":5,"fps":24}'
node mcp/call.mjs validate_scene '{"path":"scene.json"}'
```

`showroom_stumble` is the reference-quality showroom preset. The Scene Kit
keeps upper/lower limb lengths and artwork pivots in one definition, solves
elbows and knees with fixed-length IK, overlaps joint artwork, plants the feet,
and validates every half-frame before writing the project. The showroom is
staged as depth layers with a perspective floor, display beds, a purple sofa,
information stand, lighting blocks and contact shadows. `showroom_greeting` and
`showroom_idle` reuse the same validated rig and set.

### Exact character appearance

When exact character pixels matter, use the screenshot plate tool:

```bash
node mcp/call.mjs animate_exact_reference_plate \
  '{"referencePath":"__agent__/animation/Screenshot 2026-10-09 at 5.00.11 PM.png","path":"exact-reference-plate.json","fps":24,"zoom":1.18,"overwrite":true}'

node mcp/call.mjs render_project_video \
  '{"path":"exact-reference-plate.json","outputPath":"exact-reference-plate.mp4","format":"mp4","overwrite":true}'
```

This produces [exact-reference-plate.mp4](../exact-reference-plate.mp4) and [exact-reference-timeline.png](../exact-reference-timeline.png). It is the only way to preserve the character 100% from the supplied screenshot. The screenshot does not contain separable character artwork, so this version is an exact image plate with a camera move, not an independently poseable rig. Original transparent artwork or source video is required for exact limb animation.

For animation rather than a copied screenshot, use the native vector/bone output: [reference-showroom-rigged-animation.json](../reference-showroom-rigged-animation.json) and [reference-showroom-rigged-animation.mp4](../reference-showroom-rigged-animation.mp4). It contains no image layer: the visitor, perspective furniture, camera zoom, planted walk, connected arm/leg motion, and fall are all native editable project data.

## Tested character creation

After MCP initialization, call `create_character_scene` with:

```json
{
  "path": "my-character.json",
  "name": "MCP Character",
  "bodyColor": "#4aa3df",
  "accentColor": "#f0b45a"
}
```

The output includes a body, independently bound arms and legs, and head/face layers that share the head bone. Ground and shadow remain stationary. Existing files are preserved unless `overwrite: true` is supplied.

The test run produced [mcp-character-scene.json](../mcp-character-scene.json) through the stdio MCP server, then opened it through the editor's **Open** button. It verified arm/head posing through the Properties fields, Undo for both edits, and PNG export with no browser runtime errors.

- [Character preview](../mcp-character-preview.png)
- [Editor and rig proof](../mcp-character-proof.png)
- [Raised arm and head pose proof](../mcp-character-posed-proof.png)

Run `node --test tests/mcp.test.mjs` from the project root to repeat the MCP creation/read-back, overwrite protection, independent bone motion, scene composition/validation, and posed JSON/SVG round-trip checks. The full `npm test` suite passes all 169 tests; `npm run build` also passes.

## Design MCP server (low-token character authoring)

A second server, `mcp/design-mcp.mjs`, covers character design, rigging,
animation and scene edits with single-copy compact results, paged reads and
surgical patch operations instead of whole-document rewrites. The original
server is unchanged; register either or both.

```bash
CHARACTER_STUDIO_WORKSPACE=/absolute/path/to/project npm run mcp:design
```

```json
{
  "mcpServers": {
    "character-design": {
      "command": "node",
      "args": ["/absolute/path/to/bone/mcp/design-mcp.mjs"],
      "env": {
        "CHARACTER_STUDIO_WORKSPACE": "/absolute/path/to/bone"
      }
    }
  }
}
```

Three short calls replace the old read-everything flow:

```bash
export CHARACTER_STUDIO_MCP_ENTRY=/absolute/path/to/bone/mcp/design-mcp.mjs
node mcp/call.mjs list_design_presets '{}'
node mcp/call.mjs design_character '{"path":"hero.json","archetype":"humanoid","palette":"mint"}'
node mcp/call.mjs validate_rig '{"path":"hero.json"}'
```

- Recipes: `list_design_presets`, `design_character` (humanoid, chibi, mannequin, bust, quadruped; full or starter6 rigs; front or profile facing; proportions, palettes, styles, per-part colors — all server-side, ~10 scalar args in). Artwork follows the frog-scene house style: joint-safe capsule limbs, ink outlines, shading, collars, cuffs, detailed hands, sneakers and expressive faces.
- Reads: `get_rig` (topology only), `query_project` (paged sections), `get_keyframes` (frame windows), `inspect_project` (summary plus dynamics/stage).
- Patches: `edit_rig`, `edit_layers`, `bind_layers`, `edit_keyframes` (delta upserts), `edit_animation`, `edit_scene` — every op runs through the native `Rig` engine, so saved files always open in the editor.
- QA: `validate_rig` (cycles, dangling refs, non-finite poses, joint gaps across sampled frames), `auto_fix_rig` (repairs and lists every fix).
- Render: `preview_project_frame`, `preview_project_timeline`, `render_project_video` (same native pipeline, files on disk, no base64 in replies).

Measured on the same 17-layer character: `get_rig` returns 2,974 chars once vs `read_project` 24,699 chars duplicated (~13x smaller); one keyframe edit is 79 chars in / 247 out vs re-sending the whole channel. `tools/list` is 9,790 chars for all 17 tools vs 16,890 for the original 30. Run `node --test tests/mcpDesign.test.mjs` for the flow, budget, auto-fix and determinism checks.

## Add a plugin tool

Drop an `.mjs` file into `mcp/plugins/` and export a plugin created with `defineMcpPlugin`:

```js
import { defineMcpPlugin, jsonToolResult } from '../plugin-api.mjs';

export default defineMcpPlugin({
  id: 'my-studio-tools',
  version: '1.0.0',
  tools: [{
    name: 'my_tool',
    description: 'A tool visible to the connected AI agent.',
    inputSchema: { type: 'object', properties: {} },
    async execute(args, context) {
      return jsonToolResult({ workspace: context.workspaceRoot });
    },
  }],
});
```

Plugins receive `workspaceRoot`, `resolvePath()`, and `exists()`. Keep tool results JSON-serializable and use paths relative to the configured workspace.
