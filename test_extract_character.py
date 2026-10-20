import xml.etree.ElementTree as ET
import json
import re

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
PIVOT_TORSO = (118.0, 305.0) # Relative to root: (0, 0)
PIVOT_HEAD = (122.0, 195.0)  # Relative to torso: (4, -110)
PIVOT_ARM_R = (78.0, 205.0)  # Relative to torso: (-40, -100)
PIVOT_ARM_L = (166.0, 225.0) # Relative to torso: (48, -80)
PIVOT_LEG_R = (95.0, 305.0)  # Relative to root: (-23, 0)
PIVOT_LEG_L = (138.0, 305.0) # Relative to root: (20, 0)

# Head = Child 0 (Hair) + Child 1 (Face) + Child 2 (Neck)
head_shapes = []
head_shapes += extract_shapes(main_g[2], PIVOT_HEAD[0], PIVOT_HEAD[1], 'neck')
head_shapes += extract_shapes(main_g[1], PIVOT_HEAD[0], PIVOT_HEAD[1], 'face')
head_shapes += extract_shapes(main_g[0], PIVOT_HEAD[0], PIVOT_HEAD[1], 'hair')
print(f'Head shapes extracted: {len(head_shapes)}')

# Torso = Child 3
torso_shapes = extract_shapes(main_g[3], PIVOT_TORSO[0], PIVOT_TORSO[1], 'torso')
print(f'Torso shapes extracted: {len(torso_shapes)}')

# Right Arm = Child 8
arm_r_shapes = extract_shapes(main_g[8], PIVOT_ARM_R[0], PIVOT_ARM_R[1], 'arm-r')
print(f'Right arm shapes extracted: {len(arm_r_shapes)}')

# Left Arm = Child 7
arm_l_shapes = extract_shapes(main_g[7], PIVOT_ARM_L[0], PIVOT_ARM_L[1], 'arm-l')
print(f'Left arm shapes extracted: {len(arm_l_shapes)}')

