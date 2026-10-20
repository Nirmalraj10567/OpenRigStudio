import json

def P(d, fill='none', stroke='none', stroke_width=0, opacity=1.0):
    shape = {
        'id': f'b10-{len(P.shapes) + 1}',
        'kind': 'path',
        'd': d,
        'fill': fill,
        'stroke': stroke,
        'strokeWidth': stroke_width
    }
    if opacity < 1.0:
        shape['opacity'] = opacity
    P.shapes.append(shape)
    return shape
P.shapes = []

def generate_ben10_shapes():
    # -------------------------------------------------------------------------
    # 1. HEAD (Pivot 0, 0 at neck/chin base)
    # -------------------------------------------------------------------------
    head = []
    P.shapes = []
    
    # Neck
    P("M -14 0 C -14 18, 14 18, 14 0 Z", fill="#fbc38f", stroke="#09090b", stroke_width=2)
    P("M -14 4 C -6 16, 6 16, 14 4 C 10 16, -10 16, -14 4 Z", fill="#dcb48d")
    
    # Ears
    # Right ear (pointed)
    P("M -28 -28 C -38 -26, -46 -18, -44 -10 C -42 -2, -32 -6, -26 -14 Z", fill="#fbc38f", stroke="#09090b", stroke_width=2)
    P("M -32 -22 C -38 -20, -42 -16, -40 -12 C -38 -8, -34 -10, -30 -14 Z", fill="#dcb48d")
    # Left ear (pointed)
    P("M 28 -28 C 38 -26, 46 -18, 44 -10 C 42 -2, 32 -6, 26 -14 Z", fill="#fbc38f", stroke="#09090b", stroke_width=2)
    P("M 32 -22 C 38 -20, 42 -16, 40 -12 C 38 -8, 34 -10, 30 -14 Z", fill="#dcb48d")
    
    # Face base
    P("M -28 -32 C -30 -12, -22 6, 0 16 C 22 6, 30 -12, 28 -32 C 28 -55, -28 -55, -28 -32 Z", fill="#fbc38f", stroke="#09090b", stroke_width=2)
    # Face shadow along jaw
    P("M -26 -12 C -20 4, -4 14, 0 16 C 4 14, 20 4, 26 -12 C 22 2, 8 12, 0 13 C -8 12, -22 2, -26 -12 Z", fill="#dcb48d")
    
    # Right Eye
    P("M -23 -26 C -18 -32, -8 -30, -5 -23 C -9 -20, -18 -20, -23 -26 Z", fill="#f8fafc", stroke="#09090b", stroke_width=1.5)
    P("M -17 -26 C -14 -29, -9 -28, -8 -24 C -10 -22, -15 -22, -17 -26 Z", fill="#22c55e")
    P("M -14 -25 C -12 -27, -10 -26, -9 -24 C -10 -23, -13 -23, -14 -25 Z", fill="#09090b")
    P("M -13 -26 A 1 1 0 1 1 -13 -25", fill="#ffffff") # highlight
    
    # Left Eye
    P("M 23 -26 C 18 -32, 8 -30, 5 -23 C 9 -20, 18 -20, 23 -26 Z", fill="#f8fafc", stroke="#09090b", stroke_width=1.5)
    P("M 17 -26 C 14 -29, 9 -28, 8 -24 C 10 -22, 15 -22, 17 -26 Z", fill="#22c55e")
    P("M 14 -25 C 12 -27, 10 -26, 9 -24 C 10 -23, 13 -23, 14 -25 Z", fill="#09090b")
    P("M 13 -26 A 1 1 0 1 1 13 -25", fill="#ffffff") # highlight
    
    # Eyebrows
    P("M -24 -32 C -18 -35, -7 -32, -5 -29", stroke="#09090b", stroke_width=2)
    P("M 24 -32 C 18 -35, 7 -32, 5 -29", stroke="#09090b", stroke_width=2)
    
    # Nose & Mouth
    P("M -1 -17 L 1 -14 L -2 -13", stroke="#09090b", stroke_width=1.5)
    P("M -7 -4 C -2 -3, 2 -3, 7 -4", stroke="#09090b", stroke_width=1.8)
    
    # Hair Back
    P("M -32 -32 C -44 -46, -42 -68, -26 -78 C -14 -84, 14 -84, 26 -78 C 42 -68, 44 -46, 32 -32 C 38 -44, 36 -62, 22 -72 C 10 -78, -10 -78, -22 -72 C -36 -62, -38 -44, -32 -32 Z", fill="#4a3525")
    # Hair Main (Spiky Chestnut Brown)
    P("M -28 -32 C -34 -44, -40 -58, -32 -72 C -24 -82, -8 -86, 0 -84 C 14 -88, 30 -82, 38 -68 C 44 -56, 36 -40, 32 -32 C 28 -42, 22 -50, 14 -52 C 16 -44, 18 -36, 16 -30 C 8 -42, -2 -48, -10 -46 C -8 -38, -6 -32, -4 -26 C -14 -34, -22 -36, -28 -32 Z", fill="#614834", stroke="#09090b", stroke_width=2.2)
    # Front Bangs
    P("M -16 -48 C -14 -38, -8 -30, -6 -24 C -2 -34, 4 -40, 10 -44 C 6 -36, 6 -28, 4 -22 C 10 -30, 18 -36, 22 -40 C 18 -32, 14 -24, 12 -18", stroke="#09090b", stroke_width=2)
    
    head = list(P.shapes)

    # -------------------------------------------------------------------------
    # 2. TORSO (Pivot 0, 0 at chest center)
    # Spans y from -75 (collar) to +75 (waistband)
    # -------------------------------------------------------------------------
    torso = []
    P.shapes = []
    
    # Solid White T-Shirt Base (Continuous, solid, covers flanks and waist)
    P("M -16 -75 C -10 -73, 10 -73, 16 -75 L 34 -68 C 36 -30, 34 20, 33 75 C 20 78, -20 78, -33 75 C -34 20, -36 -30, -34 -68 Z", 
      fill="#f8fafc", stroke="#09090b", stroke_width=2.2)
    
    # Right flank subtle cel-shade
    P("M -34 -68 C -36 -30, -34 20, -33 75 L -22 75 C -24 20, -25 -30, -22 -66 Z", fill="#e2e8f0")
    
    # Center Black Stripe (Signature Ben 10 design!)
    P("M -9 -68 L 9 -68 L 9 76 L -9 76 Z", fill="#09090b", stroke="#09090b", stroke_width=1.5)
    
    # Black Crew Collar
    P("M -16 -75 C -8 -66, 8 -66, 16 -75 C 12 -70, -12 -70, -16 -75 Z", fill="#09090b", stroke="#09090b", stroke_width=2)
    
    # Hem folds at waistband
    P("M -28 65 C -18 68, -12 66, -10 65", stroke="#09090b", stroke_width=1.5)
    P("M 10 65 C 14 67, 22 66, 28 64", stroke="#09090b", stroke_width=1.5)
    
    torso = list(P.shapes)

    # -------------------------------------------------------------------------
    # 3. RIGHT ARM (Pivot 0, 0 at right shoulder)
    # -------------------------------------------------------------------------
    arm_r = []
    P.shapes = []
    
    # White Sleeve
    P("M -12 0 C -14 -12, 14 -12, 12 0 L 14 46 C 4 48, -12 48, -16 44 Z", fill="#f8fafc", stroke="#09090b", stroke_width=2)
    P("M -16 44 C -12 25, -10 10, -8 0 L -14 0 C -14 15, -15 30, -16 44 Z", fill="#e2e8f0")
    
    # Black Cuff Band
    P("M -17 42 C -6 46, 6 46, 15 44 L 14 54 C 4 56, -6 56, -17 52 Z", fill="#09090b", stroke="#09090b", stroke_width=1.5)
    
    # Forearm & Hand (Pure skin tone, zero pants!)
    P("M -12 52 C -14 80, -12 115, -9 135 L -14 148 C -16 160, -14 175, -8 185 C -2 190, 4 185, 6 172 C 8 160, 6 142, 4 135 C 6 115, 8 80, 8 52 Z", 
      fill="#fbc38f", stroke="#09090b", stroke_width=2)
    # Forearm shadow
    P("M -12 52 C -14 80, -12 115, -9 135 L -4 135 C -6 115, -8 80, -6 52 Z", fill="#dcb48d")
    # Knuckles & Fingers
    P("M -10 160 C -6 163, -2 163, 2 160", stroke="#09090b", stroke_width=1.5)
    P("M -8 172 C -4 174, 0 174, 3 171", stroke="#09090b", stroke_width=1.5)
    
    arm_r = list(P.shapes)

    # -------------------------------------------------------------------------
    # 4. LEFT ARM (Pivot 0, 0 at left shoulder)
    # -------------------------------------------------------------------------
    arm_l = []
    P.shapes = []
    
    # White Sleeve
    P("M -12 0 C -14 -12, 14 -12, 12 0 L 16 44 C 12 48, -4 48, -14 46 Z", fill="#f8fafc", stroke="#09090b", stroke_width=2)
    P("M 12 0 C 14 15, 15 30, 16 44 L 8 44 C 8 30, 6 15, 4 0 Z", fill="#e2e8f0")
    
    # Black Cuff Band
    P("M -15 44 C -6 46, 6 46, 17 42 L 17 52 C 6 56, -4 56, -14 54 Z", fill="#09090b", stroke="#09090b", stroke_width=1.5)
    
    # Forearm Skin
    P("M -8 52 C -6 75, -4 95, -4 105 L 10 105 C 10 95, 10 75, 8 52 Z", fill="#fbc38f", stroke="#09090b", stroke_width=2)
    
    # THE OMNITRIX (Clean vector device!)
    # Outer Gauntlet Body
    P("M -14 100 C -16 118, -16 132, -12 144 C 0 148, 16 148, 24 140 C 26 128, 26 114, 22 100 Z", fill="#0f172a", stroke="#09090b", stroke_width=2)
    # Silver Accents
    P("M -12 104 L 20 104 L 20 108 L -12 108 Z", fill="#94a3b8")
    P("M -10 136 L 22 136 L 21 140 L -9 140 Z", fill="#94a3b8")
    # Omnitrix Bevel & Dial Ring
    P("M 0 108 C -8 108, -12 118, -12 124 C -12 130, -8 138, 0 138 C 8 138, 14 130, 14 124 C 14 118, 8 108, 0 108 Z", fill="#1e293b", stroke="#09090b", stroke_width=1.5)
    # Emerald Alien Green Core
    P("M 0 112 C -5 112, -8 118, -8 124 C -8 130, -5 135, 0 135 C 5 135, 9 130, 9 124 C 9 118, 5 112, 0 112 Z", fill="#22c55e", stroke="#15803d", stroke_width=1)
    # Green Core Flare
    P("M 0 115 C -3 115, -5 119, -5 124 C -5 129, -3 132, 0 132 C 3 132, 6 129, 6 124 C 6 119, 3 115, 0 115 Z", fill="#4ade80")
    # Hourglass Silhouette
    P("M -4 118 L 4 118 L -4 130 L 4 130 Z", fill="#09090b")
    # White Energy Point
    P("M -1 123 L 1 123 L 1 125 L -1 125 Z", fill="#ffffff")
    
    # Left Hand (Clean fingers emerging below Omnitrix)
    P("M -8 144 C -12 155, -12 170, -6 182 C 0 186, 6 182, 10 170 C 14 158, 14 148, 12 142 Z", fill="#fbc38f", stroke="#09090b", stroke_width=2)
    P("M -4 162 C 0 164, 4 164, 8 160", stroke="#09090b", stroke_width=1.5)
    P("M -2 172 C 2 174, 5 173, 8 169", stroke="#09090b", stroke_width=1.5)
    
    arm_l = list(P.shapes)

    # -------------------------------------------------------------------------
    # 5. RIGHT LEG (Pivot 0, 0 at right hip)
    # Spans y from -10 (tucked in hip) to +215 (shoe sole)
    # -------------------------------------------------------------------------
    leg_r = []
    P.shapes = []
    
    # Hip Socket (rounded to tuck seamlessly under waistband)
    P("M -18 -8 C -8 -14, 18 -14, 24 -8 L 26 160 C 16 166, -18 166, -26 160 Z", fill="#5e6638", stroke="#09090b", stroke_width=2.2)
    # Cargo pant shadow folds
    P("M -26 30 C -24 80, -26 130, -26 160 L -14 160 C -14 130, -12 80, -14 30 Z", fill="#474e27")
    
    # Cargo Pocket (Solid olive green, no hand hole!)
    # Pocket Body
    P("M -28 35 L -10 38 L -12 85 L -29 82 Z", fill="#535a32", stroke="#09090b", stroke_width=1.8)
    # Pocket Flap
    P("M -29 32 L -9 35 L -10 48 L -19 52 L -29 48 Z", fill="#6b7440", stroke="#09090b", stroke_width=2.0)
    
    # Lower Rolled Hem Cuff
    P("M -27 155 C -15 162, 15 162, 27 155 L 26 168 C 14 175, -16 175, -27 168 Z", fill="#525a30", stroke="#09090b", stroke_width=2)
    
    # Skate Shoe
    # White leather upper
    P("M -22 166 C -20 180, -24 195, -24 204 L 20 204 C 22 195, 20 180, 22 166 Z", fill="#f8fafc", stroke="#09090b", stroke_width=2)
    # Black toe cap
    P("M -24 195 C -24 204, -20 208, -10 208 L -10 195 Z", fill="#09090b", stroke="#09090b", stroke_width=1.5)
    # Black chunky skate sole & tread
    P("M -26 204 L 22 204 L 22 215 C 10 217, -15 217, -26 215 Z", fill="#09090b", stroke="#09090b", stroke_width=2)
    # Black side stripe
    P("M -8 180 C 2 185, 12 188, 18 188", stroke="#09090b", stroke_width=2)
    
    leg_r = list(P.shapes)

    # -------------------------------------------------------------------------
    # 6. LEFT LEG (Pivot 0, 0 at left hip)
    # -------------------------------------------------------------------------
    leg_l = []
    P.shapes = []
    
    # Hip Socket
    P("M -20 -8 C -10 -14, 15 -14, 22 -8 L 22 158 C 12 164, -15 164, -24 158 Z", fill="#525a30", stroke="#09090b", stroke_width=2.2)
    # Depth shadow for back leg
    P("M 10 15 C 15 65, 18 115, 20 158 L 10 158 C 8 115, 6 65, 4 15 Z", fill="#3c4222")
    
    # Lower Rolled Hem Cuff
    P("M -24 152 C -12 160, 12 160, 23 152 L 22 165 C 10 172, -14 172, -24 165 Z", fill="#464e28", stroke="#09090b", stroke_width=2)
    
    # Skate Shoe
    P("M -20 163 C -18 178, -22 192, -22 202 L 18 202 C 20 192, 18 178, 20 163 Z", fill="#f8fafc", stroke="#09090b", stroke_width=2)
    P("M -22 194 C -22 202, -18 206, -9 206 L -9 194 Z", fill="#09090b", stroke="#09090b", stroke_width=1.5)
    P("M -24 202 L 20 202 L 20 213 C 8 215, -14 215, -24 213 Z", fill="#09090b", stroke="#09090b", stroke_width=2)
    P("M -7 178 C 2 183, 10 186, 16 186", stroke="#09090b", stroke_width=2)
    
    leg_l = list(P.shapes)

    return {
        'head': head,
        'torso': torso,
        'arm_r': arm_r,
        'arm_l': arm_l,
        'leg_r': leg_r,
        'leg_l': leg_l
    }

if __name__ == '__main__':
    shapes = generate_ben10_shapes()
    for k, v in shapes.items():
        print(f'{k}: {len(v)} shapes')
    with open('/Volumes/KANINFOTECH/demo/bone/scratch_perfect_vector_shapes.json', 'w') as f:
        json.dump(shapes, f)
    print('Generated scratch_perfect_vector_shapes.json successfully!')
