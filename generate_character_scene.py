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
PIVOT_TORSO = (118.0, 305.0)
PIVOT_HEAD = (122.0, 195.0)
PIVOT_ARM_R = (78.0, 205.0)
PIVOT_ARM_L = (166.0, 225.0)
PIVOT_LEG_R = (95.0, 305.0)
PIVOT_LEG_L = (138.0, 305.0)

# Build parts
head_shapes = []
head_shapes += extract_shapes(main_g[2], PIVOT_HEAD[0], PIVOT_HEAD[1], 'neck')
head_shapes += extract_shapes(main_g[1], PIVOT_HEAD[0], PIVOT_HEAD[1], 'face')
head_shapes += extract_shapes(main_g[0], PIVOT_HEAD[0], PIVOT_HEAD[1], 'hair')

torso_shapes = extract_shapes(main_g[3], PIVOT_TORSO[0], PIVOT_TORSO[1], 'torso')
arm_r_shapes = extract_shapes(main_g[8], PIVOT_ARM_R[0], PIVOT_ARM_R[1], 'arm-r')
arm_l_shapes = extract_shapes(main_g[7], PIVOT_ARM_L[0], PIVOT_ARM_L[1], 'arm-l')

# Split pants:
# Right leg path:
# M 72.3 302.7 C 68.13 307.85 ... down to cuff 65.97, 439.71 ... across cuff to 95.22, 441.55 ... up inner to crotch 112.21, 331.38 Z
d_leg_r_fill = "M72.3,302.71c-4.17,5.14-2.71,10.41-2.94,15.68c-0.83,53.72,4.98,121.32,4.98,121.32s0.59,4.76,12.83,5.39c14.21,0.74,16.42-3.55,16.42-3.55s0.82-7.39,2.94-25.53c2.12-18.14,2.61-26.8,2.12-29.57c-0.49-2.78,3.27-4.58,1.31-7.68c-1.96-3.1-0.16-10.95,2.29-23.36c2.45-12.42,8.33-24.02,8.33-24.02L95.0,305.0Z"

# Left leg path:
d_leg_l_fill = "M112.21,331.38s8.66,31.04,11.11,40.03c2.45,8.99,8.17,25.16,10.29,39.7c2.12,14.54,2.94,24.59,1.88,25.57c-1.06,0.98-2.7,1.8-0.08,6.86c3.42,4.14,5.38,6.67,19.96,6.55c14.58-0.12,14.91-6.66,14.91-6.66s0.28-2.16,0.41-4.61c0.12-2.45-1.59-5.02-1.59-5.02s2.33-22.06,2.33-31.86c0-9.8-3.8-19.12-3.43-21.44c0.37-2.33,4.29-5.15,2.33-7.48c-1.96-2.33-3.92-3.92-3.92-5.76c0-1.15-0.34-22.9-0.91-40.86c-12.86-2.77-16.24-11.05-16.95-16.87L112.21,331.38Z"

# Pelvis / waistband path:
d_waist_fill = "M61.0,302.7c10.0,-2.0,30.0,-4.0,55.0,-2.0c25.0,2.0,46.0,1.5,52.0,21.5c-5.0,15.0,-25.0,22.0,-56.0,18.0c-30.0,-4.0,-46.0,-18.0,-51.0,-37.5Z"

leg_r_shapes = [
    {
        'id': 'leg-r-base',
        'kind': 'path',
        'd': translate_path(d_leg_r_fill, -PIVOT_LEG_R[0], -PIVOT_LEG_R[1]),
        'fill': '#544032',
        'stroke': '#2D2017',
        'strokeWidth': 1.0,
        'opacity': 1.0
    }
]
# Right leg extra details (paths 14, 17)
pants_paths = [p for p in main_g[4].iter() if p.tag.endswith('path')]
leg_r_shapes.append({
    'id': 'leg-r-highlight',
    'kind': 'path',
    'd': translate_path(pants_paths[6].attrib.get('d', ''), -PIVOT_LEG_R[0], -PIVOT_LEG_R[1]),
    'fill': '#FFFFFF',
    'stroke': 'none',
    'strokeWidth': 0,
    'opacity': 0.3
})
leg_r_shapes.append({
    'id': 'leg-r-shadow',
    'kind': 'path',
    'd': translate_path(pants_paths[8].attrib.get('d', ''), -PIVOT_LEG_R[0], -PIVOT_LEG_R[1]),
    'fill': '#5D5D5D',
    'stroke': 'none',
    'strokeWidth': 0,
    'opacity': 1.0
})
# Right shoe (group 5)
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
    }
]
# Left leg extra details (paths 2, 4, 15)
leg_l_shapes.append({
    'id': 'leg-l-pocket',
    'kind': 'path',
    'd': translate_path(pants_paths[0].attrib.get('d', ''), -PIVOT_LEG_L[0], -PIVOT_LEG_L[1]),
    'fill': '#3A271B',
    'stroke': 'none',
    'strokeWidth': 0,
    'opacity': 1.0
})
leg_l_shapes.append({
    'id': 'leg-l-pocket-stroke',
    'kind': 'path',
    'd': translate_path(pants_paths[1].attrib.get('d', ''), -PIVOT_LEG_L[0], -PIVOT_LEG_L[1]),
    'fill': '#2D2017',
    'stroke': 'none',
    'strokeWidth': 0,
    'opacity': 1.0
})
leg_l_shapes.append({
    'id': 'leg-l-highlight',
    'kind': 'path',
    'd': translate_path(pants_paths[7].attrib.get('d', ''), -PIVOT_LEG_L[0], -PIVOT_LEG_L[1]),
    'fill': '#FFFFFF',
    'stroke': 'none',
    'strokeWidth': 0,
    'opacity': 0.3
})
# Left shoe (group 6)
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

print(f'Total parts: head={len(head_shapes)}, torso={len(torso_shapes)}, arm_r={len(arm_r_shapes)}, arm_l={len(arm_l_shapes)}, leg_r={len(leg_r_shapes)}, leg_l={len(leg_l_shapes)}, hips={len(hips_shapes)}')

