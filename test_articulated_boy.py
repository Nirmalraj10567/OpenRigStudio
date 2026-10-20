import json
import math

def circle_joint(x, y, r, fill, stroke="none", stroke_w=0):
    return {
        "id": f"cj-{x}-{y}",
        "kind": "ellipse",
        "x": x, "y": y, "radiusX": r, "radiusY": r,
        "fill": fill, "stroke": stroke, "strokeWidth": stroke_w
    }

print("Testing articulated character generator module...")
