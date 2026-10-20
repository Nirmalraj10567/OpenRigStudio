import xml.etree.ElementTree as ET
import re

tree = ET.parse('3516492_20640.svg')
ns = '{http://www.w3.org/2000/svg}'
main_g = [e for e in tree.getroot() if e.tag == f'{ns}g'][0]
pants_g = main_g[4]

def parse_svg_path_points(d):
    tokens = re.findall(r'([a-zA-Z])|([-+]?\d*\.?\d+(?:e[-+]?\d+)?)', d)
    curr_x, curr_y = 0.0, 0.0
    start_x, start_y = 0.0, 0.0
    cmd = ''
    points = []
    idx = 0
    raw = []
    for c, n in tokens:
        if c: raw.append(c)
        else: raw.append(float(n))
    while idx < len(raw):
        token = raw[idx]
        if isinstance(token, str):
            cmd = token
            idx += 1
        if cmd == 'M':
            curr_x, curr_y = raw[idx], raw[idx+1]
            start_x, start_y = curr_x, curr_y
            points.append((curr_x, curr_y))
            idx += 2
            cmd = 'L'
        elif cmd == 'C':
            curr_x, curr_y = raw[idx+4], raw[idx+5]
            points.append((curr_x, curr_y))
            idx += 6
        elif cmd == 'c':
            curr_x += raw[idx+4]
            curr_y += raw[idx+5]
            points.append((curr_x, curr_y))
            idx += 6
        elif cmd == 'S' or cmd == 's':
            if cmd == 'S': curr_x, curr_y = raw[idx+2], raw[idx+3]
            else: curr_x += raw[idx+2]; curr_y += raw[idx+3]
            points.append((curr_x, curr_y))
            idx += 4
        elif cmd in ('z', 'Z'):
            curr_x, curr_y = start_x, start_y
            points.append((curr_x, curr_y))
        else:
            idx += 1
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)

for i, p in enumerate(pants_g.iter()):
    if p.tag.endswith('path'):
        d = p.attrib.get('d', '')
        style = p.attrib.get('style', '')
        if d:
            x0, y0, x1, y1 = parse_svg_path_points(d)
            print(f'Pants path {i}: X: {x0:.1f}..{x1:.1f}, Y: {y0:.1f}..{y1:.1f}, midX: {(x0+x1)/2:.1f}, style: {style}')
