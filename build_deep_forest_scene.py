import xml.etree.ElementTree as ET
import json
import re
import math

tree = ET.parse('3516492_20640.svg')
ns = '{http://www.w3.org/2000/svg}'
main_g = [e for e in tree.getroot() if e.tag == f'{ns}g'][0]

def parse_style(style_str, fill_attr, stroke_attr, stroke_w_attr, opacity_attr):
    props = {}
    if style_str:
        for item in style_str.split(';'):
            if ':' in item:
                k, v = item.split(':', 1)
                props[k.strip()] = v.strip()
    fill = props.get('fill', fill_attr or 'none')
    stroke = props.get('stroke', stroke_attr or 'none')
    stroke_w = float(props.get('stroke-width', stroke_w_attr or 0)) if props.get('stroke-width', stroke_w_attr or 0) else 0
    opacity = float(props.get('opacity', opacity_attr or 1.0)) if props.get('opacity', opacity_attr or 1.0) else 1.0
    return fill, stroke, stroke_w, opacity

def translate_path(d, dx, dy):
    tokens = re.split(r'([a-zA-Z])', d)
    result = []
    curr_cmd = None
    
    for token in tokens:
        if not token: continue
        if re.match(r'[a-zA-Z]', token):
            curr_cmd = token
            result.append(token)
        else:
            nums = [float(x) for x in re.findall(r'[-+]?\d*\.?\d+(?:e[-+]?\d+)?', token)]
            if not nums:
                result.append(token)
                continue
            if curr_cmd in ('M', 'L', 'T'):
                out = []
                for i in range(0, len(nums), 2):
                    out.append(f'{nums[i]+dx:.3f}')
                    if i+1 < len(nums): out.append(f'{nums[i+1]+dy:.3f}')
                result.append(' ' + ','.join(out))
            elif curr_cmd in ('C',):
                out = []
                for i in range(0, len(nums), 6):
                    for j in range(0, 6, 2):
                        if i+j < len(nums): out.append(f'{nums[i+j]+dx:.3f}')
                        if i+j+1 < len(nums): out.append(f'{nums[i+j+1]+dy:.3f}')
                result.append(' ' + ','.join(out))
            elif curr_cmd in ('S', 'Q'):
                out = []
                for i in range(0, len(nums), 4):
                    for j in range(0, 4, 2):
                        if i+j < len(nums): out.append(f'{nums[i+j]+dx:.3f}')
                        if i+j+1 < len(nums): out.append(f'{nums[i+j+1]+dy:.3f}')
                result.append(' ' + ','.join(out))
            else:
                result.append(token)
    return ''.join(result)

def extract_shapes(group_element, pivot_x, pivot_y, prefix):
    shapes = []
    idx = 0
    for elem in group_element.iter():
        if elem.tag.endswith('path'):
            d = elem.attrib.get('d', '')
            if not d: continue
            style = elem.attrib.get('style', '')
            fill_a = elem.attrib.get('fill', '')
            stroke_a = elem.attrib.get('stroke', '')
            sw_a = elem.attrib.get('stroke-width', '')
            op_a = elem.attrib.get('opacity', '')
            fill, stroke, stroke_w, opacity = parse_style(style, fill_a, stroke_a, sw_a, op_a)
            
            d_local = translate_path(d, -pivot_x, -pivot_y)
            idx += 1
            shapes.append({
                'id': f'{prefix}-{idx}',
                'kind': 'path',
                'd': d_local,
                'fill': fill,
                'stroke': stroke,
                'strokeWidth': stroke_w,
                'opacity': opacity
            })
    return shapes

# Pivots in SVG coordinates
PIVOT_ROOT = (118.0, 305.0)
PIVOT_TORSO = (118.0, 305.0)
PIVOT_HEAD = (122.0, 195.0)
PIVOT_ARM_R = (78.0, 205.0)
PIVOT_ARM_L = (166.0, 225.0)
PIVOT_LEG_R = (95.0, 305.0)
PIVOT_LEG_L = (138.0, 305.0)

# 1. Head
head_shapes = []
head_shapes += extract_shapes(main_g[2], PIVOT_HEAD[0], PIVOT_HEAD[1], 'neck')
head_shapes += extract_shapes(main_g[1], PIVOT_HEAD[0], PIVOT_HEAD[1], 'face')
head_shapes += extract_shapes(main_g[0], PIVOT_HEAD[0], PIVOT_HEAD[1], 'hair')

# 2. Torso
torso_shapes = extract_shapes(main_g[3], PIVOT_TORSO[0], PIVOT_TORSO[1], 'torso')

# 3. Arms
arm_r_shapes = extract_shapes(main_g[8], PIVOT_ARM_R[0], PIVOT_ARM_R[1], 'arm-r')
arm_l_shapes = extract_shapes(main_g[7], PIVOT_ARM_L[0], PIVOT_ARM_L[1], 'arm-l')

# 4. Legs and Pants
# Anatomically capped leg tops: circular joint envelopes around pivots ensure zero gaps when rotated
d_leg_r_fill = "M112.21,331.38 C112.0,298.0, 108.0,278.0, 95.0,278.0 C82.0,278.0, 68.0,292.0, 60.99,313.12 C60.2,330.0, 63.0,380.0, 65.97,439.71 C70.0,443.0, 78.8,445.1, 78.8,445.1 C85.0,444.0, 95.22,441.55, 95.22,441.55 C97.5,420.0, 99.0,390.0, 101.59,378.77 C103.0,360.0, 108.0,345.0, 112.21,331.38 Z"
d_leg_l_fill = "M162.07,322.26 C162.0,296.0, 152.0,278.0, 138.0,278.0 C124.0,278.0, 116.0,298.0, 112.21,331.38 C118.0,355.0, 123.32,371.41, 123.32,371.41 C128.0,390.0, 133.61,411.12, 133.61,411.12 C135.0,425.0, 135.41,443.55, 135.41,443.55 C142.0,445.0, 151.95,445.96, 151.95,445.96 C160.0,442.0, 166.86,439.3, 166.86,439.3 C168.0,410.0, 165.0,380.0, 164.57,376.35 C163.0,350.0, 162.5,335.0, 162.07,322.26 Z"
d_waist_fill = "M56.0,282.0 C85.0,278.0, 140.0,278.0, 172.0,282.0 L168.0,345.0 C140.0,355.0, 85.0,355.0, 58.0,345.0 Z"

pants_paths = [p for p in main_g[4].iter() if p.tag.endswith('path')]

leg_r_shapes = [
    {
        'id': 'leg-r-base',
        'kind': 'path',
        'd': translate_path(d_leg_r_fill, -PIVOT_LEG_R[0], -PIVOT_LEG_R[1]),
        'fill': '#544032',
        'stroke': '#2D2017',
        'strokeWidth': 1.0,
        'opacity': 1.0
    },
    {
        'id': 'leg-r-highlight',
        'kind': 'path',
        'd': translate_path(pants_paths[6].attrib.get('d', ''), -PIVOT_LEG_R[0], -PIVOT_LEG_R[1]),
        'fill': '#FFFFFF',
        'stroke': 'none',
        'strokeWidth': 0,
        'opacity': 0.3
    },
    {
        'id': 'leg-r-shadow',
        'kind': 'path',
        'd': translate_path(pants_paths[8].attrib.get('d', ''), -PIVOT_LEG_R[0], -PIVOT_LEG_R[1]),
        'fill': '#5D5D5D',
        'stroke': 'none',
        'strokeWidth': 0,
        'opacity': 1.0
    }
]
leg_r_shapes += extract_shapes(main_g[5], PIVOT_LEG_R[0], PIVOT_LEG_R[1], 'shoe-r')

leg_l_shapes = [
    {
        'id': 'leg-l-base',
        'kind': 'path',
        'd': translate_path(d_leg_l_fill, -PIVOT_LEG_L[0], -PIVOT_LEG_L[1]),
        'fill': '#544032',
        'stroke': '#2D2017',
        'strokeWidth': 1.0,
        'opacity': 1.0
    },
    {
        'id': 'leg-l-pocket',
        'kind': 'path',
        'd': translate_path(pants_paths[0].attrib.get('d', ''), -PIVOT_LEG_L[0], -PIVOT_LEG_L[1]),
        'fill': '#3A271B',
        'stroke': 'none',
        'strokeWidth': 0,
        'opacity': 1.0
    },
    {
        'id': 'leg-l-pocket-stroke',
        'kind': 'path',
        'd': translate_path(pants_paths[1].attrib.get('d', ''), -PIVOT_LEG_L[0], -PIVOT_LEG_L[1]),
        'fill': '#2D2017',
        'stroke': 'none',
        'strokeWidth': 0,
        'opacity': 1.0
    },
    {
        'id': 'leg-l-highlight',
        'kind': 'path',
        'd': translate_path(pants_paths[7].attrib.get('d', ''), -PIVOT_LEG_L[0], -PIVOT_LEG_L[1]),
        'fill': '#FFFFFF',
        'stroke': 'none',
        'strokeWidth': 0,
        'opacity': 0.3
    }
]
leg_l_shapes += extract_shapes(main_g[6], PIVOT_LEG_L[0], PIVOT_LEG_L[1], 'shoe-l')

hips_shapes = [
    {
        'id': 'hips-base',
        'kind': 'path',
        'd': translate_path(d_waist_fill, -PIVOT_ROOT[0], -PIVOT_ROOT[1]),
        'fill': '#544032',
        'stroke': '#2D2017',
        'strokeWidth': 1.0,
        'opacity': 1.0
    },
    {
        'id': 'hips-fly',
        'kind': 'path',
        'd': translate_path(pants_paths[4].attrib.get('d', ''), -PIVOT_ROOT[0], -PIVOT_ROOT[1]),
        'fill': '#2D2017',
        'stroke': 'none',
        'strokeWidth': 0,
        'opacity': 1.0
    }
]

# Deep Forest Environment Layers
forest_sky = [
    { 'id': 'sky-bg', 'kind': 'rect', 'x': 0, 'y': 0, 'width': 1280, 'height': 720, 'fill': '#041711' },
    # Soft distant atmospheric misty glow
    { 'id': 'sky-mist', 'kind': 'ellipse', 'x': 640, 'y': 320, 'radiusX': 600, 'radiusY': 240, 'fill': '#0a2e23', 'opacity': 0.7 },
    # Distant mountain ridge / deep canopy silhouette
    { 'id': 'canopy-far-1', 'kind': 'path', 'd': 'M 0 380 Q 200 310, 420 340 T 840 330 T 1280 370 L 1280 720 L 0 720 Z', 'fill': '#06241c' },
    { 'id': 'canopy-far-2', 'kind': 'path', 'd': 'M 0 320 Q 320 260, 680 290 T 1280 300 L 1280 720 L 0 720 Z', 'fill': '#041b14', 'opacity': 0.85 }
]

forest_trees_back = [
    # Distant towering tree trunks
    { 'id': 'tree-dist-1', 'kind': 'path', 'd': 'M 180 120 Q 190 280, 170 540 L 220 540 Q 240 280, 230 120 Z', 'fill': '#082f25' },
    { 'id': 'tree-dist-2', 'kind': 'path', 'd': 'M 360 80 Q 370 280, 350 520 L 400 520 Q 410 280, 410 80 Z', 'fill': '#093328' },
    { 'id': 'tree-dist-3', 'kind': 'path', 'd': 'M 880 90 Q 870 290, 890 530 L 940 530 Q 930 290, 930 90 Z', 'fill': '#082f25' },
    { 'id': 'tree-dist-4', 'kind': 'path', 'd': 'M 1060 110 Q 1070 300, 1050 540 L 1100 540 Q 1120 300, 1110 110 Z', 'fill': '#06261d' },
    # Distant foliage clusters
    { 'id': 'foliage-dist-1', 'kind': 'ellipse', 'x': 200, 'y': 150, 'radiusX': 140, 'radiusY': 90, 'fill': '#0a3a2d', 'opacity': 0.8 },
    { 'id': 'foliage-dist-2', 'kind': 'ellipse', 'x': 380, 'y': 120, 'radiusX': 160, 'radiusY': 100, 'fill': '#0b3f32', 'opacity': 0.85 },
    { 'id': 'foliage-dist-3', 'kind': 'ellipse', 'x': 900, 'y': 130, 'radiusX': 150, 'radiusY': 95, 'fill': '#0a3a2d', 'opacity': 0.8 },
    { 'id': 'foliage-dist-4', 'kind': 'ellipse', 'x': 1080, 'y': 140, 'radiusX': 170, 'radiusY': 110, 'fill': '#083327', 'opacity': 0.85 }
]

forest_godrays = [
    # Angled canopy light shafts streaming down
    { 'id': 'ray-1', 'kind': 'polygon', 'points': [{'x': 320, 'y': 0}, {'x': 450, 'y': 0}, {'x': 620, 'y': 720}, {'x': 420, 'y': 720}], 'fill': '#fef08a', 'opacity': 0.08 },
    { 'id': 'ray-2', 'kind': 'polygon', 'points': [{'x': 540, 'y': 0}, {'x': 700, 'y': 0}, {'x': 920, 'y': 720}, {'x': 700, 'y': 720}], 'fill': '#d9f99d', 'opacity': 0.09 },
    { 'id': 'ray-3', 'kind': 'polygon', 'points': [{'x': 780, 'y': 0}, {'x': 890, 'y': 0}, {'x': 1150, 'y': 720}, {'x': 980, 'y': 720}], 'fill': '#fef08a', 'opacity': 0.06 }
]

forest_trees_mid = [
    # Massive ancient oak trunk on Left
    { 'id': 'tree-trunk-l', 'kind': 'path', 'd': 'M -40 -20 Q 80 250, 40 580 C 60 620, 140 650, 180 660 L -60 680 Z', 'fill': '#143324', 'stroke': '#07180f', 'strokeWidth': 2 },
    # Bark texture and moss on left trunk
    { 'id': 'tree-bark-l1', 'kind': 'path', 'd': 'M 10 40 Q 60 220, 30 520 L 50 530 Q 80 220, 30 40 Z', 'fill': '#1a4330' },
    { 'id': 'tree-moss-l1', 'kind': 'path', 'd': 'M 35 440 C 70 480, 110 520, 150 630 C 120 620, 80 580, 50 560 Z', 'fill': '#22c55e', 'opacity': 0.8 },
    { 'id': 'tree-moss-l2', 'kind': 'path', 'd': 'M 60 510 C 90 530, 120 570, 135 620 C 110 610, 85 580, 65 550 Z', 'fill': '#4ade80', 'opacity': 0.7 },
    # Dangling vine on Left
    { 'id': 'vine-l', 'kind': 'path', 'd': 'M 110 0 Q 140 180, 90 320 Q 130 380, 100 480', 'fill': 'none', 'stroke': '#166534', 'strokeWidth': 4 },
    { 'id': 'vine-leaf-l1', 'kind': 'ellipse', 'x': 120, 'y': 160, 'radiusX': 12, 'radiusY': 7, 'fill': '#22c55e' },
    { 'id': 'vine-leaf-l2', 'kind': 'ellipse', 'x': 95, 'y': 310, 'radiusX': 14, 'radiusY': 8, 'fill': '#4ade80' },
    { 'id': 'vine-leaf-l3', 'kind': 'ellipse', 'x': 105, 'y': 440, 'radiusX': 11, 'radiusY': 6, 'fill': '#15803d' },

    # Massive ancient oak trunk on Right
    { 'id': 'tree-trunk-r', 'kind': 'path', 'd': 'M 1320 -20 Q 1200 240, 1220 560 C 1200 610, 1120 640, 1080 660 L 1340 680 Z', 'fill': '#143324', 'stroke': '#07180f', 'strokeWidth': 2 },
    # Bark texture and moss on right trunk
    { 'id': 'tree-bark-r1', 'kind': 'path', 'd': 'M 1270 40 Q 1220 220, 1240 520 L 1220 530 Q 1200 220, 1250 40 Z', 'fill': '#1a4330' },
    { 'id': 'tree-moss-r1', 'kind': 'path', 'd': 'M 1240 450 C 1200 490, 1160 540, 1110 630 C 1140 620, 1180 580, 1210 550 Z', 'fill': '#22c55e', 'opacity': 0.8 },
    { 'id': 'tree-moss-r2', 'kind': 'path', 'd': 'M 1215 520 C 1180 545, 1150 580, 1130 620 C 1155 605, 1185 575, 1205 550 Z', 'fill': '#4ade80', 'opacity': 0.7 },
    # Dangling vine on Right
    { 'id': 'vine-r', 'kind': 'path', 'd': 'M 1180 0 Q 1150 200, 1190 350 Q 1160 420, 1180 490', 'fill': 'none', 'stroke': '#166534', 'strokeWidth': 4 },
    { 'id': 'vine-leaf-r1', 'kind': 'ellipse', 'x': 1160, 'y': 190, 'radiusX': 12, 'radiusY': 7, 'fill': '#22c55e' },
    { 'id': 'vine-leaf-r2', 'kind': 'ellipse', 'x': 1185, 'y': 330, 'radiusX': 13, 'radiusY': 8, 'fill': '#4ade80' },
    { 'id': 'vine-leaf-r3', 'kind': 'ellipse', 'x': 1175, 'y': 460, 'radiusX': 11, 'radiusY': 6, 'fill': '#15803d' },

    # Overhead dense canopy arch framing the scene
    { 'id': 'canopy-arch-1', 'kind': 'path', 'd': 'M -50 0 C 150 120, 450 140, 640 90 C 850 140, 1150 120, 1330 0 L 1330 -50 L -50 -50 Z', 'fill': '#0a2e23', 'stroke': '#051811', 'strokeWidth': 2 },
    { 'id': 'canopy-arch-2', 'kind': 'path', 'd': 'M -20 0 C 180 80, 480 100, 640 60 C 800 100, 1100 80, 1300 0 L 1300 -40 L -20 -40 Z', 'fill': '#0f4031' }
]

forest_ground = [
    # Base forest ground
    { 'id': 'ground-base', 'kind': 'path', 'd': 'M 0 540 Q 320 520, 640 535 T 1280 540 L 1280 720 L 0 720 Z', 'fill': '#0d281e' },
    # Rich mossy woodland knoll
    { 'id': 'ground-moss-1', 'kind': 'path', 'd': 'M 0 570 C 240 545, 520 550, 780 560 C 1040 570, 1200 550, 1280 560 L 1280 720 L 0 720 Z', 'fill': '#143d2b' },
    # Worn woodland walking trail (earthen path)
    { 'id': 'path-trail', 'kind': 'path', 'd': 'M 220 595 C 440 580, 680 585, 920 590 C 1060 595, 1200 585, 1280 590 L 1280 635 C 1140 630, 880 625, 620 620 C 380 615, 200 625, 0 630 L 0 600 Z', 'fill': '#243a29', 'opacity': 0.85 },
    # Moss highlights along path edges
    { 'id': 'trail-moss-edge', 'kind': 'path', 'd': 'M 180 590 Q 450 575, 750 580 T 1150 585', 'fill': 'none', 'stroke': '#22c55e', 'strokeWidth': 3, 'opacity': 0.75 }
]

forest_flora = [
    # Wild ferns on Left
    { 'id': 'fern-l1', 'kind': 'path', 'd': 'M 180 630 Q 150 570, 120 540 C 140 550, 160 570, 180 630 Z', 'fill': '#15803d' },
    { 'id': 'fern-l2', 'kind': 'path', 'd': 'M 190 635 Q 220 575, 260 550 C 240 565, 215 585, 190 635 Z', 'fill': '#16a34a' },
    { 'id': 'fern-l3', 'kind': 'path', 'd': 'M 185 635 Q 185 560, 195 530 C 190 555, 185 580, 185 635 Z', 'fill': '#22c55e' },
    # Wild ferns on Right
    { 'id': 'fern-r1', 'kind': 'path', 'd': 'M 1060 630 Q 1030 570, 1000 545 C 1020 555, 1040 575, 1060 630 Z', 'fill': '#15803d' },
    { 'id': 'fern-r2', 'kind': 'path', 'd': 'M 1070 635 Q 1100 575, 1140 555 C 1120 570, 1095 590, 1070 635 Z', 'fill': '#16a34a' },
    { 'id': 'fern-r3', 'kind': 'path', 'd': 'M 1065 635 Q 1065 560, 1075 530 C 1070 555, 1065 580, 1065 635 Z', 'fill': '#22c55e' },

    # Bioluminescent Red Forest Mushroom on Left
    { 'id': 'mush-l-stem', 'kind': 'path', 'd': 'M 220 620 Q 223 605, 222 590 L 228 590 Q 227 605, 230 620 Z', 'fill': '#f1f5f9' },
    { 'id': 'mush-l-cap', 'kind': 'path', 'd': 'M 210 592 C 210 575, 240 575, 240 592 Z', 'fill': '#f43f5e', 'stroke': '#9f1239', 'strokeWidth': 1.5 },
    { 'id': 'mush-l-spot1', 'kind': 'ellipse', 'x': 222, 'y': 584, 'radiusX': 2.5, 'radiusY': 2, 'fill': '#ffffff' },
    { 'id': 'mush-l-spot2', 'kind': 'ellipse', 'x': 230, 'y': 586, 'radiusX': 2, 'radiusY': 1.5, 'fill': '#ffffff' },
    { 'id': 'mush-l-spot3', 'kind': 'ellipse', 'x': 216, 'y': 588, 'radiusX': 1.8, 'radiusY': 1.5, 'fill': '#ffffff' },

    # Glowing Cyan Fairy Mushroom on Right
    { 'id': 'mush-r-glow', 'kind': 'ellipse', 'x': 1020, 'y': 595, 'radiusX': 25, 'radiusY': 20, 'fill': '#06b6d4', 'opacity': 0.3 },
    { 'id': 'mush-r-stem', 'kind': 'path', 'd': 'M 1018 615 Q 1020 600, 1019 590 L 1024 590 Q 1023 600, 1025 615 Z', 'fill': '#cffafe' },
    { 'id': 'mush-r-cap', 'kind': 'path', 'd': 'M 1008 592 C 1008 576, 1034 576, 1034 592 Z', 'fill': '#06b6d4', 'stroke': '#0891b2', 'strokeWidth': 1.5 },
    { 'id': 'mush-r-rim', 'kind': 'ellipse', 'x': 1021, 'y': 592, 'radiusX': 13, 'radiusY': 3, 'fill': '#67e8f9' },

    # Golden Amber Small Mushroom Cluster
    { 'id': 'mush-m-stem', 'kind': 'path', 'd': 'M 350 635 L 352 618 L 356 618 L 357 635 Z', 'fill': '#fef3c7' },
    { 'id': 'mush-m-cap', 'kind': 'ellipse', 'x': 354, 'y': 617, 'radiusX': 9, 'radiusY': 6, 'fill': '#f59e0b', 'stroke': '#b45309', 'strokeWidth': 1 }
]

forest_particles = [
    # Floating golden spores and fireflies with soft glow
    { 'id': 'p-glow-1', 'kind': 'ellipse', 'x': 310, 'y': 360, 'radiusX': 9, 'radiusY': 9, 'fill': '#fef08a', 'opacity': 0.35 },
    { 'id': 'p-core-1', 'kind': 'ellipse', 'x': 310, 'y': 360, 'radiusX': 3, 'radiusY': 3, 'fill': '#ffffff' },

    { 'id': 'p-glow-2', 'kind': 'ellipse', 'x': 520, 'y': 240, 'radiusX': 11, 'radiusY': 11, 'fill': '#a7f3d0', 'opacity': 0.4 },
    { 'id': 'p-core-2', 'kind': 'ellipse', 'x': 520, 'y': 240, 'radiusX': 3.5, 'radiusY': 3.5, 'fill': '#ffffff' },

    { 'id': 'p-glow-3', 'kind': 'ellipse', 'x': 740, 'y': 380, 'radiusX': 10, 'radiusY': 10, 'fill': '#fef08a', 'opacity': 0.38 },
    { 'id': 'p-core-3', 'kind': 'ellipse', 'x': 740, 'y': 380, 'radiusX': 3.2, 'radiusY': 3.2, 'fill': '#ffffff' },

    { 'id': 'p-glow-4', 'kind': 'ellipse', 'x': 950, 'y': 290, 'radiusX': 12, 'radiusY': 12, 'fill': '#67e8f9', 'opacity': 0.42 },
    { 'id': 'p-core-4', 'kind': 'ellipse', 'x': 950, 'y': 290, 'radiusX': 3.8, 'radiusY': 3.8, 'fill': '#ffffff' },

    { 'id': 'p-glow-5', 'kind': 'ellipse', 'x': 440, 'y': 480, 'radiusX': 8, 'radiusY': 8, 'fill': '#a7f3d0', 'opacity': 0.35 },
    { 'id': 'p-core-5', 'kind': 'ellipse', 'x': 440, 'y': 480, 'radiusX': 2.5, 'radiusY': 2.5, 'fill': '#ffffff' },

    { 'id': 'p-glow-6', 'kind': 'ellipse', 'x': 860, 'y': 470, 'radiusX': 9, 'radiusY': 9, 'fill': '#fef08a', 'opacity': 0.35 },
    { 'id': 'p-core-6', 'kind': 'ellipse', 'x': 860, 'y': 470, 'radiusX': 2.8, 'radiusY': 2.8, 'fill': '#ffffff' }
]

forest_foreground = [
    # Cinematic depth of field foreground framing leaves
    { 'id': 'fg-leaf-l1', 'kind': 'path', 'd': 'M -60 720 C -20 620, 40 560, 110 520 C 70 560, 20 630, -60 720 Z', 'fill': '#04170f', 'opacity': 0.95 },
    { 'id': 'fg-leaf-l2', 'kind': 'path', 'd': 'M -60 670 C 10 590, 80 540, 160 510 C 100 550, 40 620, -60 670 Z', 'fill': '#062015', 'opacity': 0.9 },
    { 'id': 'fg-leaf-r1', 'kind': 'path', 'd': 'M 1340 720 C 1300 620, 1240 560, 1170 520 C 1210 560, 1260 630, 1340 720 Z', 'fill': '#04170f', 'opacity': 0.95 },
    { 'id': 'fg-leaf-r2', 'kind': 'path', 'd': 'M 1340 670 C 1270 590, 1200 540, 1120 510 C 1180 550, 1240 620, 1340 670 Z', 'fill': '#062015', 'opacity': 0.9 }
]

# Character Contact Shadow
shadow_shapes = [
    { 'id': 'char-shadow-core', 'kind': 'ellipse', 'x': 0, 'y': 0, 'radiusX': 68, 'radiusY': 14, 'fill': '#020e09', 'opacity': 0.65 },
    { 'id': 'char-shadow-penumbra', 'kind': 'ellipse', 'x': 0, 'y': 0, 'radiusX': 85, 'radiusY': 20, 'fill': '#041810', 'opacity': 0.35 }
]

# Define bones
bones = [
    {
        'id': 'boy-root',
        'name': 'Root',
        'parentId': None,
        'local': { 'x': 640.0, 'y': 475.0, 'rotation': 0.0, 'scaleX': 0.85, 'scaleY': 0.85 },
        'length': 20.0
    },
    {
        'id': 'boy-torso',
        'name': 'Torso',
        'parentId': 'boy-root',
        'local': { 'x': 0.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 },
        'length': 110.0
    },
    {
        'id': 'boy-head',
        'name': 'Head',
        'parentId': 'boy-torso',
        'local': { 'x': 4.0, 'y': -110.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 },
        'length': 150.0
    },
    {
        'id': 'boy-arm-r',
        'name': 'Arm R',
        'parentId': 'boy-torso',
        'local': { 'x': -40.0, 'y': -100.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 },
        'length': 80.0
    },
    {
        'id': 'boy-arm-l',
        'name': 'Arm L',
        'parentId': 'boy-torso',
        'local': { 'x': 48.0, 'y': -80.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 },
        'length': 90.0
    },
    {
        'id': 'boy-leg-r',
        'name': 'Leg R',
        'parentId': 'boy-root',
        'local': { 'x': -23.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 },
        'length': 150.0
    },
    {
        'id': 'boy-leg-l',
        'name': 'Leg L',
        'parentId': 'boy-root',
        'local': { 'x': 20.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 },
        'length': 150.0
    }
]

# Define layers
def VLayer(id, name, shapes, zIndex, boundBoneId=None, local=None):
    if local is None:
        local = { 'x': 0.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 }
    return {
        'id': id,
        'name': name,
        'type': 'vector',
        'shapes': shapes,
        'local': local,
        'visible': True,
        'locked': False,
        'zIndex': zIndex,
        'boundBoneId': boundBoneId,
        'opacity': 1.0
    }

layers = [
    # Environment Backdrop
    VLayer('layer-forest-sky', 'Forest Sky & Mist', forest_sky, 1),
    VLayer('layer-forest-trees-back', 'Distant Trees', forest_trees_back, 5),
    VLayer('layer-forest-godrays', 'Canopy Light Rays', forest_godrays, 8),
    VLayer('layer-forest-trees-mid', 'Ancient Tree Trunks', forest_trees_mid, 12),
    VLayer('layer-forest-ground', 'Forest Trail Ground', forest_ground, 15),
    VLayer('layer-forest-flora', 'Ferns & Glowing Mushrooms', forest_flora, 18),
    VLayer('layer-forest-particles', 'Fireflies & Forest Spores', forest_particles, 20),
    
    # Character Contact Shadow (tracks on ground at y ~ 610)
    VLayer('layer-char-shadow', 'Character Contact Shadow', shadow_shapes, 22, local={'x': 640.0, 'y': 612.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0}),

    # Character Rigged Anatomy (back to front)
    VLayer('layer-arm-r', 'Right Arm & Hand', arm_r_shapes, 25, 'boy-arm-r'),
    VLayer('layer-leg-r', 'Right Leg & Shoe', leg_r_shapes, 26, 'boy-leg-r'),
    VLayer('layer-hips', 'Pelvis & Waist', hips_shapes, 28, 'boy-root'),
    VLayer('layer-leg-l', 'Left Leg & Shoe', leg_l_shapes, 30, 'boy-leg-l'),
    VLayer('layer-torso', 'T-Shirt & Torso', torso_shapes, 35, 'boy-torso'),
    VLayer('layer-head', 'Head & Face', head_shapes, 40, 'boy-head'),
    VLayer('layer-arm-l', 'Left Arm & Hand', arm_l_shapes, 45, 'boy-arm-l'),

    # Foreground framing
    VLayer('layer-forest-fg', 'Foreground Foliage Vignette', forest_foreground, 60)
]

# Define bindings
bindings = [
    { 'id': 'bind-arm-r', 'layerId': 'layer-arm-r', 'imageId': 'layer-arm-r', 'boneId': 'boy-arm-r', 'bindOffset': { 'x': 0.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 } },
    { 'id': 'bind-leg-r', 'layerId': 'layer-leg-r', 'imageId': 'layer-leg-r', 'boneId': 'boy-leg-r', 'bindOffset': { 'x': 0.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 } },
    { 'id': 'bind-hips', 'layerId': 'layer-hips', 'imageId': 'layer-hips', 'boneId': 'boy-root', 'bindOffset': { 'x': 0.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 } },
    { 'id': 'bind-leg-l', 'layerId': 'layer-leg-l', 'imageId': 'layer-leg-l', 'boneId': 'boy-leg-l', 'bindOffset': { 'x': 0.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 } },
    { 'id': 'bind-torso', 'layerId': 'layer-torso', 'imageId': 'layer-torso', 'boneId': 'boy-torso', 'bindOffset': { 'x': 0.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 } },
    { 'id': 'bind-head', 'layerId': 'layer-head', 'imageId': 'layer-head', 'boneId': 'boy-head', 'bindOffset': { 'x': 0.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 } },
    { 'id': 'bind-arm-l', 'layerId': 'layer-arm-l', 'imageId': 'layer-arm-l', 'boneId': 'boy-arm-l', 'bindOffset': { 'x': 0.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 } }
]

# Generate Animation: 120 frames (5 seconds @ 24 fps)
# Walking across the deep forest floor from X = 420 to X = 860
totalFrames = 120
fps = 24
cycleFrames = 24 # 1 second per 2 steps

track_root = []
track_torso = []
track_head = []
track_arm_r = []
track_arm_l = []
track_leg_r = []
track_leg_l = []
track_shadow = []
track_particles = []

startX = 420.0
endX = 860.0

for frame in range(totalFrames + 1):
    progress = frame / totalFrames
    t = frame / fps
    phase = (frame % cycleFrames) / cycleFrames
    angle = phase * 2.0 * math.pi

    # Smooth forward traversal with foot push surge
    baseX = startX + (endX - startX) * progress
    surge = math.sin(phase * 4.0 * math.pi) * 2.2
    curX = baseX + surge

    # Bipedal hip vertical bounce (lowest on contact phase 0.0 & 0.5, highest on passing phase 0.25 & 0.75)
    hipBounce = math.cos(phase * 4.0 * math.pi) * 4.5
    curY = 475.0 + hipBounce

    # Subtle pelvic roll / sway
    pelvisRoll = math.sin(angle) * 0.025

    track_root.append({
        'id': f'k-root-{frame}',
        'frame': frame,
        'value': { 'x': curX, 'y': curY, 'rotation': pelvisRoll, 'scaleX': 0.85, 'scaleY': 0.85 },
        'easing': 'linear'
    })

    # Torso counter-rotation
    torsoRot = -math.sin(angle) * 0.045
    track_torso.append({
        'id': f'k-torso-{frame}',
        'frame': frame,
        'value': { 'x': 0.0, 'y': 0.0, 'rotation': torsoRot, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })

    # Head gaze stabilization & slight bounce
    headRot = math.sin(angle) * 0.02
    track_head.append({
        'id': f'k-head-{frame}',
        'frame': frame,
        'value': { 'x': 4.0, 'y': -110.0, 'rotation': headRot, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })

    # Legs walking cycle: alternating forward/back pendulum stride
    # Leg R swings forward when sin(angle) > 0, back when < 0
    strideAmp = 0.38 # ~22 degrees stride swing
    legRRot = math.sin(angle) * strideAmp
    legLRot = -math.sin(angle) * strideAmp

    track_leg_r.append({
        'id': f'k-legr-{frame}',
        'frame': frame,
        'value': { 'x': -23.0, 'y': 0.0, 'rotation': legRRot, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })
    track_leg_l.append({
        'id': f'k-legl-{frame}',
        'frame': frame,
        'value': { 'x': 20.0, 'y': 0.0, 'rotation': legLRot, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })

    # Arms swing in natural cross-body opposition to legs
    # When Leg R is forward (legRRot > 0), Arm L is forward (armLRot > 0) and Arm R is back (armRRot < 0)
    # Left arm swings naturally with stride opposition
    armSwingAmp = 0.34 # ~20 degrees stride swing
    armLRot = math.sin(angle) * armSwingAmp

    # Right arm: cheerful waving motion to the forest viewer!
    waveCycle = math.sin(t * 5.0) * 0.18 # energetic wave
    armRRot = -0.15 + waveCycle

    track_arm_r.append({
        'id': f'k-armr-{frame}',
        'frame': frame,
        'value': { 'x': -40.0, 'y': -100.0, 'rotation': armRRot, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })
    track_arm_l.append({
        'id': f'k-arml-{frame}',
        'frame': frame,
        'value': { 'x': 48.0, 'y': -80.0, 'rotation': armLRot, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })

    # Contact shadow tracks horizontally with the boy
    shadowScale = 1.0 - (hipBounce / 50.0)
    track_shadow.append({
        'id': f'k-shw-{frame}',
        'frame': frame,
        'value': { 'x': curX, 'y': 612.0, 'rotation': 0.0, 'scaleX': shadowScale, 'scaleY': shadowScale },
        'easing': 'linear'
    })

    # Floating firefly particles drift on subtle atmospheric breeze
    particleFloatY = math.sin(t * 2.5) * 6.0
    particleFloatX = math.cos(t * 1.8) * 4.0
    track_particles.append({
        'id': f'k-pt-{frame}',
        'frame': frame,
        'value': { 'x': particleFloatX, 'y': particleFloatY, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })

animation_clip = {
    'id': 'clip-forest-walk',
    'name': 'Deep Forest Walk Cycle',
    'startFrame': 0,
    'endFrame': 120,
    'fps': 24,
    'loop': True,
    'tracks': [
        { 'targetId': 'boy-root', 'property': 'transform', 'keyframes': track_root },
        { 'targetId': 'boy-torso', 'property': 'transform', 'keyframes': track_torso },
        { 'targetId': 'boy-head', 'property': 'transform', 'keyframes': track_head },
        { 'targetId': 'boy-leg-r', 'property': 'transform', 'keyframes': track_leg_r },
        { 'targetId': 'boy-leg-l', 'property': 'transform', 'keyframes': track_leg_l },
        { 'targetId': 'boy-arm-r', 'property': 'transform', 'keyframes': track_arm_r },
        { 'targetId': 'boy-arm-l', 'property': 'transform', 'keyframes': track_arm_l },
        { 'targetId': 'layer-char-shadow', 'property': 'transform', 'keyframes': track_shadow },
        { 'targetId': 'layer-forest-particles', 'property': 'transform', 'keyframes': track_particles }
    ]
}

project = {
    'schemaVersion': 1,
    'id': 'deep-forest-character-walk',
    'name': 'Boy Walking in the Deep Forest',
    'canvas': {
        'width': 1280,
        'height': 720,
        'background': '#041711'
    },
    'timeline': {
        'currentFrame': 24,
        'currentTime': 1.0,
        'isPlaying': False,
        'loop': True,
        'fps': 24,
        'startFrame': 0,
        'endFrame': 120,
        'activeAnimationId': 'clip-forest-walk'
    },
    'bones': bones,
    'layers': layers,
    'bindings': bindings,
    'animations': [animation_clip],
    'metadata': {
        'author': 'Character Studio',
        'character': 'Cartoon Boy from 3516492_20640.svg',
        'setting': 'Deep Enchanted Forest'
    }
}

with open('deep-forest-walk.json', 'w') as f:
    json.dump(project, f, indent=2)

print('Successfully created deep-forest-walk.json!')

