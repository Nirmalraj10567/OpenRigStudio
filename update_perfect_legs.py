import re

# Update build_deep_forest_scene.py with perfect capped legs and friendly arm wave!
with open('build_deep_forest_scene.py', 'r') as f:
    code = f.read()

# Replace d_leg_r_fill and d_leg_l_fill and d_waist_fill
old_defs = '''d_leg_r_fill = "M72.3,302.71c-4.17,5.14-2.71,10.41-2.94,15.68c-0.83,53.72,4.98,121.32,4.98,121.32s0.59,4.76,12.83,5.39c14.21,0.74,16.42-3.55,16.42-3.55s0.82-7.39,2.94-25.53c2.12-18.14,2.61-26.8,2.12-29.57c-0.49-2.78,3.27-4.58,1.31-7.68c-1.96-3.1-0.16-10.95,2.29-23.36c2.45-12.42,8.33-24.02,8.33-24.02L95.0,305.0Z"
d_leg_l_fill = "M112.21,331.38s8.66,31.04,11.11,40.03c2.45,8.99,8.17,25.16,10.29,39.7c2.12,14.54,2.94,24.59,1.88,25.57c-1.06,0.98-2.7,1.8-0.08,6.86c3.42,4.14,5.38,6.67,19.96,6.55c14.58-0.12,14.91-6.66,14.91-6.66s0.28-2.16,0.41-4.61c0.12-2.45-1.59-5.02-1.59-5.02s2.33-22.06,2.33-31.86c0-9.8-3.8-19.12-3.43-21.44c0.37-2.33,4.29-5.15,2.33-7.48c-1.96-2.33-3.92-3.92-3.92-5.76c0-1.15-0.34-22.9-0.91-40.86c-12.86-2.77-16.24-11.05-16.95-16.87L112.21,331.38Z"
d_waist_fill = "M61.0,302.7c10.0,-2.0,30.0,-4.0,55.0,-2.0c25.0,2.0,46.0,1.5,52.0,21.5c-5.0,15.0,-25.0,22.0,-56.0,18.0c-30.0,-4.0,-46.0,-18.0,-51.0,-37.5Z"'''

new_defs = '''# Anatomically capped leg tops: circular joint envelopes around pivots ensure zero gaps when rotated
d_leg_r_fill = "M112.21,331.38 C112.0,298.0, 108.0,278.0, 95.0,278.0 C82.0,278.0, 68.0,292.0, 60.99,313.12 C60.2,330.0, 63.0,380.0, 65.97,439.71 C70.0,443.0, 78.8,445.1, 78.8,445.1 C85.0,444.0, 95.22,441.55, 95.22,441.55 C97.5,420.0, 99.0,390.0, 101.59,378.77 C103.0,360.0, 108.0,345.0, 112.21,331.38 Z"
d_leg_l_fill = "M162.07,322.26 C162.0,296.0, 152.0,278.0, 138.0,278.0 C124.0,278.0, 116.0,298.0, 112.21,331.38 C118.0,355.0, 123.32,371.41, 123.32,371.41 C128.0,390.0, 133.61,411.12, 133.61,411.12 C135.0,425.0, 135.41,443.55, 135.41,443.55 C142.0,445.0, 151.95,445.96, 151.95,445.96 C160.0,442.0, 166.86,439.3, 166.86,439.3 C168.0,410.0, 165.0,380.0, 164.57,376.35 C163.0,350.0, 162.5,335.0, 162.07,322.26 Z"
d_waist_fill = "M56.0,282.0 C85.0,278.0, 140.0,278.0, 172.0,282.0 L168.0,345.0 C140.0,355.0, 85.0,355.0, 58.0,345.0 Z"'''

assert old_defs in code, "old_defs not found!"
code = code.replace(old_defs, new_defs)

# Update right arm motion: friendly waving motion as he walks!
old_arm_motion = '''    armSwingAmp = 0.32 # ~18 degrees swing
    armRRot = -math.sin(angle) * armSwingAmp
    armLRot = math.sin(angle) * armSwingAmp'''

new_arm_motion = '''    # Left arm swings naturally with stride opposition
    armSwingAmp = 0.34 # ~20 degrees stride swing
    armLRot = math.sin(angle) * armSwingAmp

    # Right arm: cheerful waving motion to the forest viewer!
    waveCycle = math.sin(t * 5.0) * 0.18 # energetic wave
    armRRot = -0.15 + waveCycle'''

assert old_arm_motion in code, "old_arm_motion not found!"
code = code.replace(old_arm_motion, new_arm_motion)

# Also animate fireflies floating
old_fireflies = '''    shadowScale = 1.0 - (hipBounce / 50.0)
    track_shadow.append({
        'id': f'k-shw-{frame}',
        'frame': frame,
        'value': { 'x': curX, 'y': 612.0, 'rotation': 0.0, 'scaleX': shadowScale, 'scaleY': shadowScale },
        'easing': 'linear'
    })'''

new_fireflies = '''    shadowScale = 1.0 - (hipBounce / 50.0)
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
    })'''

code = code.replace('track_shadow = []', 'track_shadow = []\ntrack_particles = []')
code = code.replace(old_fireflies, new_fireflies)
code = code.replace(
    "{ 'targetId': 'layer-char-shadow', 'property': 'transform', 'keyframes': track_shadow }",
    "{ 'targetId': 'layer-char-shadow', 'property': 'transform', 'keyframes': track_shadow },\n        { 'targetId': 'layer-forest-particles', 'property': 'transform', 'keyframes': track_particles }"
)

with open('build_deep_forest_scene.py', 'w') as f:
    f.write(code)

print("Updated build_deep_forest_scene.py successfully!")
