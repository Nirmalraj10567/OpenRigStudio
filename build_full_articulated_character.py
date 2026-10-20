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

# Anatomical Pivots in SVG coordinates
PIVOT_ROOT = (118.0, 305.0)
PIVOT_TORSO = (118.0, 305.0)
PIVOT_NECK = (122.0, 195.0)
PIVOT_HEAD = (122.0, 185.0)

# Right Arm (viewer's left): Shoulder (78, 205) -> Elbow (56, 225) -> Wrist (38, 205)
PIVOT_R_SHOULDER = (78.0, 205.0)
PIVOT_R_ELBOW = (56.0, 222.0)
PIVOT_R_WRIST = (38.0, 205.0)

# Left Arm (viewer's right): Shoulder (166, 225) -> Elbow (178, 275) -> Wrist (182, 315)
PIVOT_L_SHOULDER = (166.0, 225.0)
PIVOT_L_ELBOW = (178.0, 275.0)
PIVOT_L_WRIST = (184.0, 315.0)

# Right Leg (viewer's left): Hip (95, 305) -> Knee (86, 375) -> Ankle (65, 445)
PIVOT_R_HIP = (95.0, 305.0)
PIVOT_R_KNEE = (86.0, 375.0)
PIVOT_R_ANKLE = (65.0, 445.0)

# Left Leg (viewer's right): Hip (138, 305) -> Knee (144, 375) -> Ankle (145, 445)
PIVOT_L_HIP = (138.0, 305.0)
PIVOT_L_KNEE = (144.0, 375.0)
PIVOT_L_ANKLE = (145.0, 445.0)

# 1. Head (Hair + Face)
head_shapes = []
head_shapes += extract_shapes(main_g[1], PIVOT_HEAD[0], PIVOT_HEAD[1], 'face')
head_shapes += extract_shapes(main_g[0], PIVOT_HEAD[0], PIVOT_HEAD[1], 'hair')

# 2. Neck
neck_shapes = extract_shapes(main_g[2], PIVOT_NECK[0], PIVOT_NECK[1], 'neck')

# 3. Torso (Shirt)
torso_shapes = extract_shapes(main_g[3], PIVOT_TORSO[0], PIVOT_TORSO[1], 'torso')

# 4. Pelvis / Hips waistband
d_waist_fill = "M56.0,282.0 C85.0,278.0, 140.0,278.0, 172.0,282.0 L168.0,345.0 C140.0,355.0, 85.0,355.0, 58.0,345.0 Z"
pants_paths = [p for p in main_g[4].iter() if p.tag.endswith('path')]
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

# 5. Articulated Legs: Thigh -> Shin -> Foot
# Right Thigh: from Hip (0, 0) to Knee (length ~ 70)
# Capsule geometry with rounded joints
def make_limb_capsule(length, r_top, r_bot, fill, stroke='#2D2017', stroke_w=1.0):
    return [
        {
            'id': 'capsule-body',
            'kind': 'path',
            'd': f'M {-r_top} 0 C {-r_top} {-r_top}, {r_top} {-r_top}, {r_top} 0 L {r_bot} {length} C {r_bot} {length+r_bot}, {-r_bot} {length+r_bot}, {-r_bot} {length} Z',
            'fill': fill,
            'stroke': stroke,
            'strokeWidth': stroke_w,
            'opacity': 1.0
        }
    ]

# Right Thigh
thigh_r_shapes = make_limb_capsule(70.0, 18.0, 15.0, '#544032')
# Add shadow and seam
thigh_r_shapes.append({
    'id': 'thigh-r-seam',
    'kind': 'path',
    'd': 'M -2 10 L -3 65',
    'fill': 'none',
    'stroke': '#2D2017',
    'strokeWidth': 1.5,
    'opacity': 0.8
})

# Right Shin: from Knee (0, 0) to Ankle (length ~ 70)
shin_r_shapes = make_limb_capsule(68.0, 15.0, 13.0, '#544032')
shin_r_shapes.append({
    'id': 'shin-r-highlight',
    'kind': 'path',
    'd': 'M 4 12 L 3 55',
    'fill': 'none',
    'stroke': '#ffffff',
    'strokeWidth': 2.0,
    'opacity': 0.25
})
# Trouser cuff
shin_r_shapes.append({
    'id': 'shin-r-cuff',
    'kind': 'rect',
    'x': -14, 'y': 62, 'width': 28, 'height': 8,
    'fill': '#47362a', 'stroke': '#2D2017', 'strokeWidth': 1.0
})

# Right Foot (group 5)
foot_r_shapes = extract_shapes(main_g[5], PIVOT_R_ANKLE[0], PIVOT_R_ANKLE[1], 'foot-r')

# Left Thigh
thigh_l_shapes = make_limb_capsule(70.0, 18.0, 15.0, '#544032')
thigh_l_shapes.append({
    'id': 'thigh-l-pocket',
    'kind': 'path',
    'd': 'M 6 15 L 14 18 L 12 40 L 4 36 Z',
    'fill': '#3A271B',
    'stroke': '#2D2017',
    'strokeWidth': 1.0,
    'opacity': 1.0
})

# Left Shin
shin_l_shapes = make_limb_capsule(68.0, 15.0, 13.0, '#544032')
shin_l_shapes.append({
    'id': 'shin-l-highlight',
    'kind': 'path',
    'd': 'M 3 12 L 2 55',
    'fill': 'none',
    'stroke': '#ffffff',
    'strokeWidth': 2.0,
    'opacity': 0.25
})
shin_l_shapes.append({
    'id': 'shin-l-cuff',
    'kind': 'rect',
    'x': -14, 'y': 62, 'width': 28, 'height': 8,
    'fill': '#47362a', 'stroke': '#2D2017', 'strokeWidth': 1.0
})

# Left Foot (group 6)
foot_l_shapes = extract_shapes(main_g[6], PIVOT_L_ANKLE[0], PIVOT_L_ANKLE[1], 'foot-l')

# 6. Articulated Arms: Upper Arm -> Forearm -> Hand
# Left Upper Arm: Red sleeve cap + skin
upper_arm_l_shapes = [
    {
        'id': 'upper-arm-l-sleeve',
        'kind': 'path',
        'd': 'M -14 0 C -14 -12, 14 -12, 14 0 L 15 28 C 5 32, -5 32, -15 28 Z',
        'fill': '#C42017',
        'stroke': '#861811',
        'strokeWidth': 1.5,
        'opacity': 1.0
    },
    {
        'id': 'upper-arm-l-trim',
        'kind': 'path',
        'd': 'M -15 26 C -5 30, 5 30, 15 26 L 14 31 C 5 35, -5 35, -14 31 Z',
        'fill': '#C7CCD3',
        'stroke': 'none',
        'strokeWidth': 0,
        'opacity': 1.0
    },
    {
        'id': 'upper-arm-l-skin',
        'kind': 'path',
        'd': 'M -11 31 L 11 31 L 9 52 C 4 56, -4 56, -9 52 Z',
        'fill': '#FCD5B8',
        'stroke': '#B7723D',
        'strokeWidth': 1.0,
        'opacity': 1.0
    }
]

# Left Forearm: Skin + wrist cuff
forearm_l_shapes = [
    {
        'id': 'forearm-l-skin',
        'kind': 'path',
        'd': 'M -9 0 C -9 -8, 9 -8, 9 0 L 8 42 C 4 45, -4 45, -8 42 Z',
        'fill': '#FCD5B8',
        'stroke': '#B7723D',
        'strokeWidth': 1.0,
        'opacity': 1.0
    },
    {
        'id': 'forearm-l-cuff',
        'kind': 'rect',
        'x': -9, 'y': 36, 'width': 18, 'height': 8, 'rx': 2,
        'fill': '#9193A3',
        'stroke': '#5D5D5D',
        'strokeWidth': 1.0,
        'opacity': 1.0
    }
]

# Left Hand (from group 7)
hand_l_shapes = extract_shapes(main_g[7], PIVOT_L_WRIST[0], PIVOT_L_WRIST[1], 'hand-l')

# Right Upper Arm: Red sleeve cap + skin
upper_arm_r_shapes = [
    {
        'id': 'upper-arm-r-sleeve',
        'kind': 'path',
        'd': 'M -14 0 C -14 -12, 14 -12, 14 0 L 15 28 C 5 32, -5 32, -15 28 Z',
        'fill': '#C42017',
        'stroke': '#861811',
        'strokeWidth': 1.5,
        'opacity': 1.0
    },
    {
        'id': 'upper-arm-r-trim',
        'kind': 'path',
        'd': 'M -15 26 C -5 30, 5 30, 15 26 L 14 31 C 5 35, -5 35, -14 31 Z',
        'fill': '#C7CCD3',
        'stroke': 'none',
        'strokeWidth': 0,
        'opacity': 1.0
    },
    {
        'id': 'upper-arm-r-skin',
        'kind': 'path',
        'd': 'M -11 31 L 11 31 L 9 52 C 4 56, -4 56, -9 52 Z',
        'fill': '#FCD5B8',
        'stroke': '#B7723D',
        'strokeWidth': 1.0,
        'opacity': 1.0
    }
]

# Right Forearm: Skin
forearm_r_shapes = [
    {
        'id': 'forearm-r-skin',
        'kind': 'path',
        'd': 'M -9 0 C -9 -8, 9 -8, 9 0 L 8 42 C 4 45, -4 45, -8 42 Z',
        'fill': '#FCD5B8',
        'stroke': '#B7723D',
        'strokeWidth': 1.0,
        'opacity': 1.0
    }
]

# Right Hand (from group 8)
hand_r_shapes = extract_shapes(main_g[8], PIVOT_R_WRIST[0], PIVOT_R_WRIST[1], 'hand-r')

# 7. Environment & Shadow (from earlier master setup)
with open('deep-forest-walk.json', 'r') as f:
    prev_proj = json.load(f)

forest_layers = [l for l in prev_proj['layers'] if l['id'].startswith('layer-forest-') or l['id'] == 'layer-char-shadow']

# 8. Hierarchical Bone Skeleton (16 Bones)
bones = [
    # Root (Pelvis)
    { 'id': 'boy-root', 'name': 'Root · Pelvis', 'parentId': None, 'local': { 'x': 640.0, 'y': 475.0, 'rotation': 0.0, 'scaleX': 0.85, 'scaleY': 0.85 }, 'length': 20.0 },
    
    # Spine & Head
    { 'id': 'boy-torso', 'name': 'Torso · Chest', 'parentId': 'boy-root', 'local': { 'x': 0.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 110.0 },
    { 'id': 'boy-neck', 'name': 'Neck', 'parentId': 'boy-torso', 'local': { 'x': 4.0, 'y': -110.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 20.0 },
    { 'id': 'boy-head', 'name': 'Head', 'parentId': 'boy-neck', 'local': { 'x': 0.0, 'y': -10.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 130.0 },

    # Right Arm (viewer's left)
    { 'id': 'boy-upper-arm-r', 'name': 'Right Upper Arm', 'parentId': 'boy-torso', 'local': { 'x': -40.0, 'y': -100.0, 'rotation': 0.1, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 52.0 },
    { 'id': 'boy-forearm-r', 'name': 'Right Forearm', 'parentId': 'boy-upper-arm-r', 'local': { 'x': 0.0, 'y': 52.0, 'rotation': 0.15, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 44.0 },
    { 'id': 'boy-hand-r', 'name': 'Right Hand', 'parentId': 'boy-forearm-r', 'local': { 'x': 0.0, 'y': 44.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 25.0 },

    # Left Arm (viewer's right)
    { 'id': 'boy-upper-arm-l', 'name': 'Left Upper Arm', 'parentId': 'boy-torso', 'local': { 'x': 48.0, 'y': -80.0, 'rotation': -0.1, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 52.0 },
    { 'id': 'boy-forearm-l', 'name': 'Left Forearm', 'parentId': 'boy-upper-arm-l', 'local': { 'x': 0.0, 'y': 52.0, 'rotation': 0.2, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 44.0 },
    { 'id': 'boy-hand-l', 'name': 'Left Hand', 'parentId': 'boy-forearm-l', 'local': { 'x': 0.0, 'y': 44.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 25.0 },

    # Right Leg (viewer's left)
    { 'id': 'boy-thigh-r', 'name': 'Right Thigh', 'parentId': 'boy-root', 'local': { 'x': -23.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 70.0 },
    { 'id': 'boy-shin-r', 'name': 'Right Shin', 'parentId': 'boy-thigh-r', 'local': { 'x': 0.0, 'y': 70.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 68.0 },
    { 'id': 'boy-foot-r', 'name': 'Right Foot', 'parentId': 'boy-shin-r', 'local': { 'x': 0.0, 'y': 68.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 28.0 },

    # Left Leg (viewer's right)
    { 'id': 'boy-thigh-l', 'name': 'Left Thigh', 'parentId': 'boy-root', 'local': { 'x': 20.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 70.0 },
    { 'id': 'boy-shin-l', 'name': 'Left Shin', 'parentId': 'boy-thigh-l', 'local': { 'x': 0.0, 'y': 70.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 68.0 },
    { 'id': 'boy-foot-l', 'name': 'Left Foot', 'parentId': 'boy-shin-l', 'local': { 'x': 0.0, 'y': 68.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 }, 'length': 28.0 }
]

def VLayer(id, name, shapes, zIndex, boundBoneId=None):
    return {
        'id': id,
        'name': name,
        'type': 'vector',
        'shapes': shapes,
        'local': { 'x': 0.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 },
        'visible': True,
        'locked': False,
        'zIndex': zIndex,
        'boundBoneId': boundBoneId,
        'opacity': 1.0
    }

character_layers = [
    # Behind Torso: Right Arm Chain
    VLayer('layer-upper-arm-r', 'Right Upper Arm', upper_arm_r_shapes, 23, 'boy-upper-arm-r'),
    VLayer('layer-forearm-r', 'Right Forearm', forearm_r_shapes, 24, 'boy-forearm-r'),
    VLayer('layer-hand-r', 'Right Hand', hand_r_shapes, 25, 'boy-hand-r'),

    # Behind Pelvis: Right Leg Chain
    VLayer('layer-thigh-r', 'Right Thigh', thigh_r_shapes, 26, 'boy-thigh-r'),
    VLayer('layer-shin-r', 'Right Shin', shin_r_shapes, 27, 'boy-shin-r'),
    VLayer('layer-foot-r', 'Right Shoe', foot_r_shapes, 28, 'boy-foot-r'),

    # Pelvis & Waistband
    VLayer('layer-hips', 'Pelvis & Waistband', hips_shapes, 29, 'boy-root'),

    # Front Leg: Left Leg Chain
    VLayer('layer-thigh-l', 'Left Thigh', thigh_l_shapes, 31, 'boy-thigh-l'),
    VLayer('layer-shin-l', 'Left Shin', shin_l_shapes, 32, 'boy-shin-l'),
    VLayer('layer-foot-l', 'Left Shoe', foot_l_shapes, 33, 'boy-foot-l'),

    # Torso, Neck & Head
    VLayer('layer-torso', 'T-Shirt & Torso', torso_shapes, 35, 'boy-torso'),
    VLayer('layer-neck', 'Neck', neck_shapes, 38, 'boy-neck'),
    VLayer('layer-head', 'Head & Face', head_shapes, 40, 'boy-head'),

    # Front Arm: Left Arm Chain
    VLayer('layer-upper-arm-l', 'Left Upper Arm', upper_arm_l_shapes, 43, 'boy-upper-arm-l'),
    VLayer('layer-forearm-l', 'Left Forearm', forearm_l_shapes, 44, 'boy-forearm-l'),
    VLayer('layer-hand-l', 'Left Hand', hand_l_shapes, 45, 'boy-hand-l')
]

all_layers = forest_layers + character_layers

# Bindings
bindings = [
    { 'id': f'b-{l["id"]}', 'layerId': l['id'], 'imageId': l['id'], 'boneId': l['boundBoneId'], 'bindOffset': { 'x': 0.0, 'y': 0.0, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 } }
    for l in character_layers if l['boundBoneId']
]

# Walk Animation with 2-joint IK/FK dynamics
totalFrames = 120
fps = 24
cycleFrames = 24

tracks = {
    'boy-root': [],
    'boy-torso': [],
    'boy-neck': [],
    'boy-head': [],
    'boy-thigh-r': [],
    'boy-shin-r': [],
    'boy-foot-r': [],
    'boy-thigh-l': [],
    'boy-shin-l': [],
    'boy-foot-l': [],
    'boy-upper-arm-r': [],
    'boy-forearm-r': [],
    'boy-hand-r': [],
    'boy-upper-arm-l': [],
    'boy-forearm-l': [],
    'boy-hand-l': [],
    'layer-char-shadow': [],
    'layer-forest-particles': []
}

startX = 420.0
endX = 860.0

for frame in range(totalFrames + 1):
    progress = frame / totalFrames
    t = frame / fps
    phase = (frame % cycleFrames) / cycleFrames
    angle = phase * 2.0 * math.pi

    # Forward horizontal progression with push surge
    baseX = startX + (endX - startX) * progress
    surge = math.sin(phase * 4.0 * math.pi) * 2.5
    curX = baseX + surge

    # Bipedal hip vertical bounce (lowest on contact, highest on passing)
    hipBounce = math.cos(phase * 4.0 * math.pi) * 4.5
    curY = 475.0 + hipBounce

    # Pelvic roll sway
    pelvisRoll = math.sin(angle) * 0.03

    tracks['boy-root'].append({
        'id': f'k-root-{frame}', 'frame': frame,
        'value': { 'x': curX, 'y': curY, 'rotation': pelvisRoll, 'scaleX': 0.85, 'scaleY': 0.85 },
        'easing': 'linear'
    })

    # Torso counter-rotation
    torsoRot = -math.sin(angle) * 0.04
    tracks['boy-torso'].append({
        'id': f'k-torso-{frame}', 'frame': frame,
        'value': { 'x': 0.0, 'y': 0.0, 'rotation': torsoRot, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })

    # Neck & Head gaze stabilization
    headRot = math.sin(angle) * 0.02
    tracks['boy-neck'].append({
        'id': f'k-neck-{frame}', 'frame': frame,
        'value': { 'x': 4.0, 'y': -110.0, 'rotation': headRot * 0.5, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })
    tracks['boy-head'].append({
        'id': f'k-head-{frame}', 'frame': frame,
        'value': { 'x': 0.0, 'y': -10.0, 'rotation': headRot, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })

    # Biomechanical Leg Cycle (2-joint Kinematics)
    # Right Leg
    # Hip angle (thigh swing)
    thighRAng = math.sin(angle) * 0.36
    # Knee angle (shin flex): flexes back during recovery when thigh swings forward
    shinRFlex = max(0.0, math.sin(angle + math.pi*0.25)) * 0.55
    # Foot ankle roll: toe off on push, heel on contact
    footRAng = -math.sin(angle) * 0.18

    tracks['boy-thigh-r'].append({
        'id': f'k-tr-{frame}', 'frame': frame,
        'value': { 'x': -23.0, 'y': 0.0, 'rotation': thighRAng, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })
    tracks['boy-shin-r'].append({
        'id': f'k-sr-{frame}', 'frame': frame,
        'value': { 'x': 0.0, 'y': 70.0, 'rotation': shinRFlex, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })
    tracks['boy-foot-r'].append({
        'id': f'k-fr-{frame}', 'frame': frame,
        'value': { 'x': 0.0, 'y': 68.0, 'rotation': footRAng, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })

    # Left Leg (opposite phase)
    thighLAng = -math.sin(angle) * 0.36
    shinLFlex = max(0.0, -math.sin(angle + math.pi*0.25)) * 0.55
    footLAng = math.sin(angle) * 0.18

    tracks['boy-thigh-l'].append({
        'id': f'k-tl-{frame}', 'frame': frame,
        'value': { 'x': 20.0, 'y': 0.0, 'rotation': thighLAng, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })
    tracks['boy-shin-l'].append({
        'id': f'k-sl-{frame}', 'frame': frame,
        'value': { 'x': 0.0, 'y': 70.0, 'rotation': shinLFlex, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })
    tracks['boy-foot-l'].append({
        'id': f'k-fl-{frame}', 'frame': frame,
        'value': { 'x': 0.0, 'y': 68.0, 'rotation': footLAng, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })

    # Arm Kinematics
    # Left Arm: Natural walking swing opposite to right leg
    armLAng = math.sin(angle) * 0.32
    elbowLAng = 0.2 + max(0.0, math.sin(angle)) * 0.25
    tracks['boy-upper-arm-l'].append({
        'id': f'k-ual-{frame}', 'frame': frame,
        'value': { 'x': 48.0, 'y': -80.0, 'rotation': armLAng, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })
    tracks['boy-forearm-l'].append({
        'id': f'k-fal-{frame}', 'frame': frame,
        'value': { 'x': 0.0, 'y': 52.0, 'rotation': elbowLAng, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })
    tracks['boy-hand-l'].append({
        'id': f'k-hl-{frame}', 'frame': frame,
        'value': { 'x': 0.0, 'y': 44.0, 'rotation': 0.05, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })

    # Right Arm: Cheerful, friendly wave to forest creatures/viewer
    waveCycle = math.sin(t * 6.0) * 0.22
    tracks['boy-upper-arm-r'].append({
        'id': f'k-uar-{frame}', 'frame': frame,
        'value': { 'x': -40.0, 'y': -100.0, 'rotation': -0.15 + waveCycle * 0.5, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })
    tracks['boy-forearm-r'].append({
        'id': f'k-far-{frame}', 'frame': frame,
        'value': { 'x': 0.0, 'y': 52.0, 'rotation': 0.2 + waveCycle, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })
    tracks['boy-hand-r'].append({
        'id': f'k-hr-{frame}', 'frame': frame,
        'value': { 'x': 0.0, 'y': 44.0, 'rotation': waveCycle * 0.4, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })

    # Contact shadow tracking
    shadowScale = 1.0 - (hipBounce / 50.0)
    tracks['layer-char-shadow'].append({
        'id': f'k-shw-{frame}', 'frame': frame,
        'value': { 'x': curX, 'y': 612.0, 'rotation': 0.0, 'scaleX': shadowScale, 'scaleY': shadowScale },
        'easing': 'linear'
    })

    # Firefly particles drifting
    pFloatY = math.sin(t * 2.5) * 6.0
    pFloatX = math.cos(t * 1.8) * 4.0
    tracks['layer-forest-particles'].append({
        'id': f'k-pt-{frame}', 'frame': frame,
        'value': { 'x': pFloatX, 'y': pFloatY, 'rotation': 0.0, 'scaleX': 1.0, 'scaleY': 1.0 },
        'easing': 'linear'
    })

clip = {
    'id': 'clip-forest-walk',
    'name': 'Deep Forest Walk Cycle (Articulated Rig)',
    'startFrame': 0,
    'endFrame': 120,
    'fps': 24,
    'loop': True,
    'tracks': [
        { 'targetId': targetId, 'property': 'transform', 'keyframes': keyframes }
        for targetId, keyframes in tracks.items()
    ]
}

project = {
    'schemaVersion': 1,
    'id': 'deep-forest-character-walk',
    'name': 'Articulated Boy Walking in the Deep Forest',
    'canvas': { 'width': 1280, 'height': 720, 'background': '#041711' },
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
    'layers': all_layers,
    'bindings': bindings,
    'animations': [clip],
    'metadata': {
        'author': 'Character Studio',
        'character': 'Full Articulated Cartoon Boy (16-Bone Biped Rig)',
        'reference': 'Moho Pro Full Character Development Standard'
    }
}

with open('deep-forest-walk.json', 'w') as f:
    json.dump(project, f, indent=2)

print(f'Successfully built fully articulated character project! Bones: {len(bones)}, Layers: {len(all_layers)}, Bindings: {len(bindings)}')

