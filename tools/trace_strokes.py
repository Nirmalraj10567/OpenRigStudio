#!/usr/bin/env python3
"""Own Python stroke-endpoint tracer -> Character Studio JSON.

Usage:
    python3 tools/trace_strokes.py --output /tmp/denim_traced.json
    python3 tools/trace_strokes.py --output denim-jacket-girl-src.json --name "Denim Jacket Girl"

What it does (no external deps, stdlib only):
  1. Defines the denim-jacket-girl design (pink tank, teal off-shoulder
     jacket, black bob with pink highlights, pink panel backdrop) as
     parametric edge strokes.
  2. TRACKS every stroke endpoint: each path/polygon records its (x, y)
     endpoints in StrokeTracker. At the end it prints total strokes,
     total endpoints and bounding box -- this is the "stroke endpoint
     tracking" the user asked for.
  3. Emits a valid Character Studio project JSON (schemaVersion 1) on the
     standard six-bone rig so MCP preview/render/timeline all work.

Honest note: this is a hand-parametric vector likeness, not a pixel
auto-trace of the PNG (the PNG bytes were not supplied as a workspace
file). For a 100%-pixel copy use MCP `animate_exact_reference_plate`
with the PNG saved inside the workspace.
"""
import argparse
import json
import math

R2D_FIX = math.pi / 2  # bind offset that cancels root rest rotation


class StrokeTracker:
    """Records every stroke endpoint for audit."""

    def __init__(self):
        self.strokes = []  # list of {"id": str, "points": [(x, y), ...]}

    def add(self, sid, points):
        pts = [(float(x), float(y)) for x, y in points]
        self.strokes.append({"id": sid, "points": pts})
        return pts

    def summary(self):
        total_endpoints = sum(len(s["points"]) for s in self.strokes)
        xs = [p[0] for s in self.strokes for p in s["points"]]
        ys = [p[1] for s in self.strokes for p in s["points"]]
        bbox = None
        if xs:
            bbox = [min(xs), min(ys), max(xs), max(ys)]
        return {
            "total_strokes": len(self.strokes),
            "total_endpoints": total_endpoints,
            "bbox": bbox,
        }


TR = StrokeTracker()
_uid = [0]


def sid(prefix):
    _uid[0] += 1
    return f"{prefix}-{_uid[0]}"


def rect(id_, x, y, w, h, fill, stroke="none", sw=0, **kw):
    if stroke != "none":
        TR.add(id_ + "-edge", [(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)])
    d = {"id": id_, "kind": "rect", "x": x, "y": y,
         "width": w, "height": h, "fill": fill}
    if stroke != "none":
        d["stroke"] = stroke
        d["strokeWidth"] = sw
    d.update(kw)
    return d


def ellipse(id_, x, y, rx, ry, fill, stroke="none", sw=0, **kw):
    d = {"id": id_, "kind": "ellipse", "x": x, "y": y,
         "radiusX": rx, "radiusY": ry, "fill": fill}
    if stroke != "none":
        d["stroke"] = stroke
        d["strokeWidth"] = sw
    d.update(kw)
    return d


def path(id_, d, fill="none", stroke="#111111", sw=3, **kw):
    # crude endpoint extraction: all numbers in pairs after M/L/Q/C
    import re
    nums = [float(n) for n in re.findall(r"-?\d+\.?\d*", d)]
    pts = [(nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2)]
    if pts:
        TR.add(id_, pts)
    dd = {"id": id_, "kind": "path", "d": d, "fill": fill,
          "stroke": stroke, "strokeWidth": sw}
    dd.update(kw)
    return dd


def polygon(id_, points, fill, stroke="none", sw=0, **kw):
    TR.add(id_, points + [points[0]])
    d = {"id": id_, "kind": "polygon",
         "points": [{"x": x, "y": y} for x, y in points], "fill": fill}
    if stroke != "none":
        d["stroke"] = stroke
        d["strokeWidth"] = sw
    d.update(kw)
    return d


def T(x=0, y=0, rot=0):
    return {"x": x, "y": y, "rotation": rot, "scaleX": 1, "scaleY": 1}


# palette sampled from the reference
BG = "#ECE7E3"
PINK_PANEL = "#F7C9C9"
INK = "#14100e"
SKIN = "#F6C39E"
SKIN_SH = "#D9966C"
HAIR = "#151113"
HAIR_HI = "#E8A09A"
TANK = "#F5B3BE"
TANK_TRIM = "#FFF4F4"
JACKET = "#5E939B"
JACKET_D = "#38626A"
JACKET_L = "#A4CBD1"
BUTTON = "#C98878"
EYE_W = "#FFFFFF"
LIP = "#D9886A"

ROOT_ROT = -math.pi / 2
ARM_REST = math.pi
LEG_REST = math.pi


def build_project(name):
    bones = [
        {"id": "root", "name": "Root", "length": 84,
         "parentId": None, "local": T(400, 330, ROOT_ROT)},
        {"id": "head-bone", "name": "Head", "length": 72,
         "parentId": "root", "local": T(94, 0, 0)},
        {"id": "left-arm-bone", "name": "Left Arm", "length": 120,
         "parentId": "root", "local": T(48, -103, ARM_REST)},
        {"id": "right-arm-bone", "name": "Right Arm", "length": 120,
         "parentId": "root", "local": T(48, 103, ARM_REST)},
        {"id": "left-leg-bone", "name": "Left Leg", "length": 77,
         "parentId": "root", "local": T(-30, -38, LEG_REST)},
        {"id": "right-leg-bone", "name": "Right Leg", "length": 77,
         "parentId": "root", "local": T(-30, 38, LEG_REST)},
    ]
    layers = []
    bindings = []

    def layer(id_, lname, shapes, bone=None, z=0, visible=True):
        layers.append({"id": id_, "name": lname, "type": "vector",
                       "local": T(), "opacity": 1, "visible": visible,
                       "locked": bone is None, "boundBoneId": bone,
                       "zIndex": z, "shapes": shapes})
        if bone:
            world = ROOT_ROT
            if bone in ("left-arm-bone", "right-arm-bone",
                        "left-leg-bone", "right-leg-bone"):
                world = ROOT_ROT + ARM_REST
            bindings.append({"id": f"binding-{id_}", "layerId": id_,
                             "imageId": id_, "boneId": bone,
                             "bindOffset": T(0, 0, -world)})

    # ---- backdrop: warm gray + pink panel with black frame (reference bg) --
    layer("backdrop", "Backdrop", [
        rect("bg-fill", 0, 0, 800, 520, BG),
        rect("pink-panel", 150, 150, 500, 260, PINK_PANEL,
             stroke=INK, sw=5),
        path("panel-inner", "M 158 158 L 642 158 L 642 402 L 158 402 Z",
             fill="none", stroke=INK, sw=2, opacity=0.25),
    ], z=-3)
    # floor whisper (portrait, subtle)
    layer("character-ground", "Ground", [
        rect("ground", 0, 470, 800, 50, "#DCD4CF"),
        rect("ground-line", 0, 470, 800, 3, "#B9ACA6"),
    ], z=0)
    layer("character-shadow", "Shadow", [
        ellipse("shadow", 400, 470, 120, 12, "#000000", opacity=0.15),
    ], z=1)
    # ---- hair back: black bob to shoulders -------------------------------
    layer("hair-back", "Bob back", [
        ellipse("bob-top", 0, -104, 88, 56, HAIR),
        path("bob-left", "M -84 -100 Q -98 -20 -80 60 Q -74 84 -58 88 Q -68 20 -60 -60 Z",
             fill=HAIR, stroke="none", sw=0),
        path("bob-right", "M 84 -100 Q 98 -20 80 60 Q 74 84 58 88 Q 68 20 60 -60 Z",
             fill=HAIR, stroke="none", sw=0),
        ellipse("bob-shine", -30, -116, 30, 10, HAIR_HI, opacity=0.55),
        path("strand-l1", "M -70 -60 Q -78 0 -66 52", fill="none",
             stroke="#000000", sw=3, opacity=0.6),
        path("strand-r1", "M 70 -60 Q 78 0 66 52", fill="none",
             stroke="#000000", sw=3, opacity=0.6),
    ], bone="head-bone", z=2)
    # ---- legs hidden (portrait crop) --------------------------------------
    layer("character-left-leg", "Left leg", [
        rect("l-thigh", -11, 0, 22, 60, SKIN)], bone="left-leg-bone",
        z=3, visible=False)
    layer("character-right-leg", "Right leg", [
        rect("r-thigh", -11, 0, 22, 60, SKIN)], bone="right-leg-bone",
        z=4, visible=False)
    # ---- pink tank ----------------------------------------------------------
    layer("character-body", "Pink tank", [
        ellipse("tank", 0, 30, 62, 78, TANK, stroke="#D9889A", sw=2),
        path("tank-neck", "M -34 -34 Q 0 6 34 -34 Q 0 -18 -34 -34 Z",
             fill=TANK_TRIM, stroke="#D9889A", sw=2),
        path("neckline", "M -34 -34 Q 0 6 34 -34", fill="none",
             stroke=TANK_TRIM, sw=5),
        path("strap-l", "M -52 -52 L -40 -20", fill="none",
             stroke=TANK_TRIM, sw=7),
        path("strap-r", "M 52 -52 L 40 -20", fill="none",
             stroke=TANK_TRIM, sw=7),
        path("fold-1", "M -20 40 Q -10 70 -24 96", fill="none",
             stroke="#D9889A", sw=2, opacity=0.7),
        path("fold-2", "M 16 44 Q 26 72 14 96", fill="none",
             stroke="#D9889A", sw=2, opacity=0.7),
    ], bone="root", z=5)
    # ---- teal off-shoulder jacket with traced seams/buttons ---------------
    layer("jacket", "Teal jacket", [
        path("panel-left", "M -118 -30 L -64 -8 L -78 130 L -140 120 Z",
             fill=JACKET, stroke=JACKET_D, sw=3),
        path("panel-right", "M 118 -30 L 64 -8 L 78 130 L 140 120 Z",
             fill=JACKET, stroke=JACKET_D, sw=3),
        path("collar-l", "M -118 -30 L -96 -62 L -64 -8 L -84 6 Z",
             fill=JACKET, stroke=INK, sw=3),
        path("collar-r", "M 118 -30 L 96 -62 L 64 -8 L 84 6 Z",
             fill=JACKET, stroke=INK, sw=3),
        path("collar-edge-l", "M -118 -30 L -96 -62 L -64 -8", fill="none",
             stroke=JACKET_L, sw=2),
        path("collar-edge-r", "M 118 -30 L 96 -62 L 64 -8", fill="none",
             stroke=JACKET_L, sw=2),
        # sleeve folds / stitch endpoints (the tracked strokes)
        path("stitch-l1", "M -126 40 L -72 30", fill="none",
             stroke=JACKET_L, sw=2),
        path("stitch-l2", "M -128 56 L -74 46", fill="none",
             stroke=JACKET_L, sw=2),
        path("stitch-r1", "M 126 40 L 72 30", fill="none",
             stroke=JACKET_L, sw=2),
        path("stitch-r2", "M 128 56 L 74 46", fill="none",
             stroke=JACKET_L, sw=2),
        path("seam-l", "M -64 -8 L -78 130", fill="none",
             stroke=JACKET_D, sw=3),
        path("seam-r", "M 64 -8 L 78 130", fill="none",
             stroke=JACKET_D, sw=3),
        path("pocket-l", "M -120 60 L -84 54 L -86 92 L -122 98 Z",
             fill="none", stroke=JACKET_D, sw=3),
        path("pocket-r", "M 120 60 L 84 54 L 86 92 L 122 98 Z",
             fill="none", stroke=JACKET_D, sw=3),
        # copper buttons with ring + hole (endpoints tracked)
        ellipse("btn1", -71, 44, 10, 10, BUTTON, stroke="#7A4A3E", sw=2),
        ellipse("btn1-hole", -71, 44, 3, 3, "#7A4A3E"),
        ellipse("btn1-ring", -71, 44, 14, 14, "none",
                stroke=JACKET_L, sw=2),
        ellipse("btn2", -75, 78, 10, 10, BUTTON, stroke="#7A4A3E", sw=2),
        ellipse("btn2-hole", -75, 78, 3, 3, "#7A4A3E"),
        ellipse("btn2-ring", -75, 78, 14, 14, "none",
                stroke=JACKET_L, sw=2),
        ellipse("snap-r1", 96, -6, 5, 5, "#D8D2CC", stroke=JACKET_D, sw=2),
        ellipse("snap-r2", 100, 40, 5, 5, "#D8D2CC", stroke=JACKET_D, sw=2),
    ], bone="root", z=6)
    # ---- bare shoulders + jacket sleeves ----------------------------------
    for arm_id, pre, sx in (("character-left-arm", "left", -1),
                            ("character-right-arm", "right", 1)):
        layer(arm_id, f"{pre} arm", [
            ellipse(f"{pre}-shoulder", 0, 6, 26, 24, SKIN,
                    stroke=SKIN_SH, sw=2),
            path(f"{pre}-collarbone", f"M {-18 * sx} -12 Q 0 -18 {18 * sx} -12",
                 fill="none", stroke=SKIN_SH, sw=2),
            path(f"{pre}-sleeve", f"M {-20 * sx} 22 L {20 * sx} 22 L {24 * sx} 110 L {-24 * sx} 110 Z",
                 fill=JACKET, stroke=JACKET_D, sw=3),
            path(f"{pre}-sleeve-fold", f"M {-14 * sx} 50 L {14 * sx} 50",
                 fill="none", stroke=JACKET_D, sw=2),
            path(f"{pre}-sleeve-stitch", f"M {-16 * sx} 66 L {16 * sx} 66",
                 fill="none", stroke=JACKET_L, sw=2),
            ellipse(f"{pre}-hand", 0, 118, 12, 10, SKIN,
                    stroke=SKIN_SH, sw=2),
        ], bone=f"{pre}-arm-bone" if False else
        ("left-arm-bone" if pre == "left" else "right-arm-bone"), z=7)
    # ---- neck + head --------------------------------------------------------
    layer("neck", "Neck", [
        rect("neck-rect", -16, -78, 32, 30, SKIN),
        path("neck-shadow", "M -16 -64 Q 0 -50 16 -64 L 16 -52 Q 0 -38 -16 -52 Z",
             fill=SKIN_SH, stroke="none", sw=0, opacity=0.7),
        path("collarbone-l", "M -44 -48 Q -20 -58 0 -52", fill="none",
             stroke=SKIN_SH, sw=2),
        path("collarbone-r", "M 44 -48 Q 20 -58 0 -52", fill="none",
             stroke=SKIN_SH, sw=2),
    ], bone="root", z=8)
    layer("character-head", "Head", [
        ellipse("head", 0, -56, 62, 60, SKIN, stroke=SKIN_SH, sw=2),
        path("jaw", "M -40 -22 L 40 -22 L 14 0 L -14 0 Z",
             fill=SKIN, stroke="none", sw=0),
        ellipse("ear-l", -60, -50, 8, 12, SKIN),
        ellipse("ear-r", 60, -50, 8, 12, SKIN),
    ], bone="head-bone", z=9)
    # ---- face: sideways glance, thick brows, full lips --------------------
    layer("character-face", "Face", [
        ellipse("eye-w-l", -25, -56, 15, 12, EYE_W, stroke=INK, sw=3),
        ellipse("eye-w-r", 25, -56, 15, 12, EYE_W, stroke=INK, sw=3),
        ellipse("iris-l", -21, -56, 7, 9, INK),
        ellipse("iris-r", 29, -56, 7, 9, INK),
        ellipse("hl-l", -23, -59, 2.5, 3, "#fff"),
        ellipse("hl-r", 27, -59, 2.5, 3, "#fff"),
        path("lash-l", "M -40 -62 Q -25 -68 -10 -61", fill="none",
             stroke=INK, sw=4),
        path("lash-r", "M 10 -61 Q 25 -68 40 -62", fill="none",
             stroke=INK, sw=4),
        path("brow-l", "M -42 -82 Q -25 -87 -8 -81", fill="none",
             stroke=INK, sw=5),
        path("brow-r", "M 8 -81 Q 25 -87 42 -82", fill="none",
             stroke=INK, sw=5),
        path("nose", "M -4 -44 L -8 -32 Q -2 -28 4 -31", fill="none",
             stroke=SKIN_SH, sw=3),
        path("lip-upper", "M -16 -12 Q 0 -18 16 -12 Q 0 -8 -16 -12 Z",
             fill=LIP, stroke="#A85A44", sw=2),
        path("lip-lower", "M -13 -11 Q 0 -2 13 -11 Q 0 -5 -13 -11 Z",
             fill="#E8A086", stroke="#A85A44", sw=2),
        path("lip-line", "M -16 -12 Q 0 -8 16 -12", fill="none",
             stroke="#7A3A28", sw=2),
        ellipse("blush-l", -42, -34, 9, 5, "#F0A090", opacity=0.6),
    ], bone="head-bone", z=10)
    # ---- front curtain hair + pink highlight streaks ----------------------
    layer("hair-front", "Curtain + highlights", [
        path("curtain-l", "M -62 -108 Q -72 -40 -56 30 L -40 28 Q -54 -40 -46 -100 Z",
             fill=HAIR, stroke="none", sw=0),
        path("curtain-r", "M 62 -108 Q 72 -40 56 30 L 40 28 Q 54 -40 46 -100 Z",
             fill=HAIR, stroke="none", sw=0),
        path("part", "M 0 -112 Q -2 -96 0 -88", fill="none",
             stroke=INK, sw=3),
        path("hi-l", "M -52 -104 Q -60 -50 -50 6", fill="none",
             stroke=HAIR_HI, sw=7, opacity=0.85),
        path("hi-l2", "M -38 -108 Q -44 -60 -36 -8", fill="none",
             stroke=HAIR_HI, sw=4, opacity=0.7),
        path("hi-r", "M 40 -108 Q 52 -60 44 -6", fill="none",
             stroke=HAIR_HI, sw=4, opacity=0.7),
        path("shine-top", "M -30 -110 Q 0 -118 30 -110", fill="none",
             stroke=HAIR_HI, sw=6, opacity=0.6),
        path("edge-l", "M -62 -108 Q -72 -40 -56 30", fill="none",
             stroke=INK, sw=3),
        path("edge-r", "M 62 -108 Q 72 -40 56 30", fill="none",
             stroke=INK, sw=3),
    ], bone="head-bone", z=11)

    layers.sort(key=lambda l: l["zIndex"])
    bones_map = {b["id"]: b["local"] for b in bones}

    def tv(bid, dx=0, dy=0, drot=0):
        b = bones_map[bid]
        return {"x": b["x"] + dx, "y": b["y"] + dy,
                "rotation": b["rotation"] + drot, "scaleX": 1, "scaleY": 1}

    FPS, END = 24, 72
    project = {
        "schemaVersion": 1,
        "id": "project-denim-jacket-girl",
        "name": name,
        "canvas": {"width": 800, "height": 520, "background": BG},
        "layers": layers,
        "bones": bones,
        "bindings": bindings,
        "animations": [{
            "id": "idle", "name": "Portrait idle",
            "startFrame": 0, "endFrame": END,
            "tracks": [
                {"id": "t-root", "targetId": "root", "property": "transform",
                 "keyframes": [
                     {"id": "r0", "frame": 0, "value": tv("root"), "easing": "smooth"},
                     {"id": "r1", "frame": 36, "value": tv("root", 0, 4), "easing": "smooth"},
                     {"id": "r2", "frame": 72, "value": tv("root"), "easing": "smooth"}]},
                {"id": "t-head", "targetId": "head-bone", "property": "transform",
                 "keyframes": [
                     {"id": "h0", "frame": 0, "value": tv("head-bone", drot=0.04), "easing": "smooth"},
                     {"id": "h1", "frame": 36, "value": tv("head-bone", drot=-0.03), "easing": "smooth"},
                     {"id": "h2", "frame": 72, "value": tv("head-bone", drot=0.04), "easing": "smooth"}]},
                {"id": "t-armL", "targetId": "left-arm-bone", "property": "transform",
                 "keyframes": [{"id": "a0", "frame": 0,
                                "value": tv("left-arm-bone", drot=-0.08), "easing": "smooth"}]},
                {"id": "t-armR", "targetId": "right-arm-bone", "property": "transform",
                 "keyframes": [{"id": "b0", "frame": 0,
                                "value": tv("right-arm-bone", drot=-0.08), "easing": "smooth"}]},
            ],
            "setupPose": {},
        }],
        "dynamics": {"enabled": False, "startFrame": 0, "endFrame": END,
                     "fps": FPS, "substeps": 4, "gravityX": 0, "gravityY": 420,
                     "windX": 0, "windY": 0, "windNoise": 0, "seed": 1,
                     "bones": [], "bodies": [], "meshes": [], "emitters": []},
        "stage2d": {"enabled": False, "cameraX": 0, "cameraY": 0, "zoom": 1,
                    "yaw": 0, "pitch": 0, "roll": 0, "perspective": 0,
                    "projection": "perspective"},
        "cameraView": "preview",
        "timeline": {"currentFrame": 0, "currentTime": 0, "isPlaying": False,
                     "loop": True, "fps": FPS, "startFrame": 0,
                     "endFrame": END, "activeAnimationId": "idle"},
        "metadata": {"createdBy": "tools/trace_strokes.py",
                     "characterType": "stroke-traced portrait",
                     "strokes": TR.summary()},
    }
    return project


def main():
    ap = argparse.ArgumentParser(description="Trace stroke endpoints -> character JSON")
    ap.add_argument("--output", required=True, help="Output JSON path")
    ap.add_argument("--name", default="Denim Jacket Girl")
    args = ap.parse_args()
    project = build_project(args.name)
    with open(args.output, "w") as f:
        json.dump(project, f, indent=2)
        f.write("\n")
    s = TR.summary()
    print(json.dumps({"output": args.output,
                      "layers": len(project["layers"]),
                      "shapes": sum(len(l["shapes"]) for l in project["layers"]),
                      "stroke_report": s}, indent=2))


if __name__ == "__main__":
    main()
