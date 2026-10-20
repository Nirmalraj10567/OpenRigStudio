import { readFile, writeFile } from 'node:fs/promises';
import { defineMcpPlugin, jsonToolResult, objectArguments } from '../plugin-api.mjs';

const T = (x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) => ({ x, y, rotation, scaleX, scaleY });

async function load(context, path) {
  try {
    return JSON.parse(await readFile(context.resolvePath(path), 'utf8'));
  } catch {
    return { schemaVersion: 1, id: 'ben10', name: 'Ben 10 Character', canvas: { width: 1280, height: 720, background: '#090d16' }, layers: [], bones: [], bindings: [] };
  }
}

async function save(context, path, project) {
  const output = context.resolvePath(path);
  await writeFile(output, `${JSON.stringify(project, null, 2)}\n`);
  return output;
}

let shapeCounter = 1000;
const R = (x, y, width, height, fill, extra = {}) => ({
  id: `b10-env-${++shapeCounter}`,
  kind: 'rect',
  x, y, width, height, fill, ...extra
});
const E = (x, y, radiusX, radiusY, fill, extra = {}) => ({
  id: `b10-env-${++shapeCounter}`,
  kind: 'ellipse',
  x, y, radiusX, radiusY, fill, ...extra
});
const P = (d, fill = 'none', stroke = 'none', strokeWidth = 2, extra = {}) => ({
  id: `b10-env-${++shapeCounter}`,
  kind: 'path',
  d, fill, stroke, strokeWidth, ...extra
});

const BEN10_SHAPES = {"head": [{"id": "b10-1", "kind": "path", "d": "M -14 0 C -14 18, 14 18, 14 0 Z", "fill": "#fbc38f", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-2", "kind": "path", "d": "M -14 4 C -6 16, 6 16, 14 4 C 10 16, -10 16, -14 4 Z", "fill": "#dcb48d", "stroke": "none", "strokeWidth": 0}, {"id": "b10-3", "kind": "path", "d": "M -28 -28 C -38 -26, -46 -18, -44 -10 C -42 -2, -32 -6, -26 -14 Z", "fill": "#fbc38f", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-4", "kind": "path", "d": "M -32 -22 C -38 -20, -42 -16, -40 -12 C -38 -8, -34 -10, -30 -14 Z", "fill": "#dcb48d", "stroke": "none", "strokeWidth": 0}, {"id": "b10-5", "kind": "path", "d": "M 28 -28 C 38 -26, 46 -18, 44 -10 C 42 -2, 32 -6, 26 -14 Z", "fill": "#fbc38f", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-6", "kind": "path", "d": "M 32 -22 C 38 -20, 42 -16, 40 -12 C 38 -8, 34 -10, 30 -14 Z", "fill": "#dcb48d", "stroke": "none", "strokeWidth": 0}, {"id": "b10-7", "kind": "path", "d": "M -28 -32 C -30 -12, -22 6, 0 16 C 22 6, 30 -12, 28 -32 C 28 -55, -28 -55, -28 -32 Z", "fill": "#fbc38f", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-8", "kind": "path", "d": "M -26 -12 C -20 4, -4 14, 0 16 C 4 14, 20 4, 26 -12 C 22 2, 8 12, 0 13 C -8 12, -22 2, -26 -12 Z", "fill": "#dcb48d", "stroke": "none", "strokeWidth": 0}, {"id": "b10-9", "kind": "path", "d": "M -23 -26 C -18 -32, -8 -30, -5 -23 C -9 -20, -18 -20, -23 -26 Z", "fill": "#f8fafc", "stroke": "#09090b", "strokeWidth": 1.5}, {"id": "b10-10", "kind": "path", "d": "M -17 -26 C -14 -29, -9 -28, -8 -24 C -10 -22, -15 -22, -17 -26 Z", "fill": "#22c55e", "stroke": "none", "strokeWidth": 0}, {"id": "b10-11", "kind": "path", "d": "M -14 -25 C -12 -27, -10 -26, -9 -24 C -10 -23, -13 -23, -14 -25 Z", "fill": "#09090b", "stroke": "none", "strokeWidth": 0}, {"id": "b10-12", "kind": "path", "d": "M -13 -26 A 1 1 0 1 1 -13 -25", "fill": "#ffffff", "stroke": "none", "strokeWidth": 0}, {"id": "b10-13", "kind": "path", "d": "M 23 -26 C 18 -32, 8 -30, 5 -23 C 9 -20, 18 -20, 23 -26 Z", "fill": "#f8fafc", "stroke": "#09090b", "strokeWidth": 1.5}, {"id": "b10-14", "kind": "path", "d": "M 17 -26 C 14 -29, 9 -28, 8 -24 C 10 -22, 15 -22, 17 -26 Z", "fill": "#22c55e", "stroke": "none", "strokeWidth": 0}, {"id": "b10-15", "kind": "path", "d": "M 14 -25 C 12 -27, 10 -26, 9 -24 C 10 -23, 13 -23, 14 -25 Z", "fill": "#09090b", "stroke": "none", "strokeWidth": 0}, {"id": "b10-16", "kind": "path", "d": "M 13 -26 A 1 1 0 1 1 13 -25", "fill": "#ffffff", "stroke": "none", "strokeWidth": 0}, {"id": "b10-17", "kind": "path", "d": "M -24 -32 C -18 -35, -7 -32, -5 -29", "fill": "none", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-18", "kind": "path", "d": "M 24 -32 C 18 -35, 7 -32, 5 -29", "fill": "none", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-19", "kind": "path", "d": "M -1 -17 L 1 -14 L -2 -13", "fill": "none", "stroke": "#09090b", "strokeWidth": 1.5}, {"id": "b10-20", "kind": "path", "d": "M -7 -4 C -2 -3, 2 -3, 7 -4", "fill": "none", "stroke": "#09090b", "strokeWidth": 1.8}, {"id": "b10-21", "kind": "path", "d": "M -32 -32 C -44 -46, -42 -68, -26 -78 C -14 -84, 14 -84, 26 -78 C 42 -68, 44 -46, 32 -32 C 38 -44, 36 -62, 22 -72 C 10 -78, -10 -78, -22 -72 C -36 -62, -38 -44, -32 -32 Z", "fill": "#4a3525", "stroke": "none", "strokeWidth": 0}, {"id": "b10-22", "kind": "path", "d": "M -28 -32 C -34 -44, -40 -58, -32 -72 C -24 -82, -8 -86, 0 -84 C 14 -88, 30 -82, 38 -68 C 44 -56, 36 -40, 32 -32 C 28 -42, 22 -50, 14 -52 C 16 -44, 18 -36, 16 -30 C 8 -42, -2 -48, -10 -46 C -8 -38, -6 -32, -4 -26 C -14 -34, -22 -36, -28 -32 Z", "fill": "#614834", "stroke": "#09090b", "strokeWidth": 2.2}, {"id": "b10-23", "kind": "path", "d": "M -16 -48 C -14 -38, -8 -30, -6 -24 C -2 -34, 4 -40, 10 -44 C 6 -36, 6 -28, 4 -22 C 10 -30, 18 -36, 22 -40 C 18 -32, 14 -24, 12 -18", "fill": "none", "stroke": "#09090b", "strokeWidth": 2}], "torso": [{"id": "b10-1", "kind": "path", "d": "M -16 -75 C -10 -73, 10 -73, 16 -75 L 34 -68 C 36 -30, 34 20, 33 75 C 20 78, -20 78, -33 75 C -34 20, -36 -30, -34 -68 Z", "fill": "#f8fafc", "stroke": "#09090b", "strokeWidth": 2.2}, {"id": "b10-2", "kind": "path", "d": "M -34 -68 C -36 -30, -34 20, -33 75 L -22 75 C -24 20, -25 -30, -22 -66 Z", "fill": "#e2e8f0", "stroke": "none", "strokeWidth": 0}, {"id": "b10-3", "kind": "path", "d": "M -9 -68 L 9 -68 L 9 76 L -9 76 Z", "fill": "#09090b", "stroke": "#09090b", "strokeWidth": 1.5}, {"id": "b10-4", "kind": "path", "d": "M -16 -75 C -8 -66, 8 -66, 16 -75 C 12 -70, -12 -70, -16 -75 Z", "fill": "#09090b", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-5", "kind": "path", "d": "M -28 65 C -18 68, -12 66, -10 65", "fill": "none", "stroke": "#09090b", "strokeWidth": 1.5}, {"id": "b10-6", "kind": "path", "d": "M 10 65 C 14 67, 22 66, 28 64", "fill": "none", "stroke": "#09090b", "strokeWidth": 1.5}], "arm_r": [{"id": "b10-1", "kind": "path", "d": "M -12 0 C -14 -12, 14 -12, 12 0 L 14 46 C 4 48, -12 48, -16 44 Z", "fill": "#f8fafc", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-2", "kind": "path", "d": "M -16 44 C -12 25, -10 10, -8 0 L -14 0 C -14 15, -15 30, -16 44 Z", "fill": "#e2e8f0", "stroke": "none", "strokeWidth": 0}, {"id": "b10-3", "kind": "path", "d": "M -17 42 C -6 46, 6 46, 15 44 L 14 54 C 4 56, -6 56, -17 52 Z", "fill": "#09090b", "stroke": "#09090b", "strokeWidth": 1.5}, {"id": "b10-4", "kind": "path", "d": "M -12 52 C -14 80, -12 115, -9 135 L -14 148 C -16 160, -14 175, -8 185 C -2 190, 4 185, 6 172 C 8 160, 6 142, 4 135 C 6 115, 8 80, 8 52 Z", "fill": "#fbc38f", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-5", "kind": "path", "d": "M -12 52 C -14 80, -12 115, -9 135 L -4 135 C -6 115, -8 80, -6 52 Z", "fill": "#dcb48d", "stroke": "none", "strokeWidth": 0}, {"id": "b10-6", "kind": "path", "d": "M -10 160 C -6 163, -2 163, 2 160", "fill": "none", "stroke": "#09090b", "strokeWidth": 1.5}, {"id": "b10-7", "kind": "path", "d": "M -8 172 C -4 174, 0 174, 3 171", "fill": "none", "stroke": "#09090b", "strokeWidth": 1.5}], "arm_l": [{"id": "b10-1", "kind": "path", "d": "M -12 0 C -14 -12, 14 -12, 12 0 L 16 44 C 12 48, -4 48, -14 46 Z", "fill": "#f8fafc", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-2", "kind": "path", "d": "M 12 0 C 14 15, 15 30, 16 44 L 8 44 C 8 30, 6 15, 4 0 Z", "fill": "#e2e8f0", "stroke": "none", "strokeWidth": 0}, {"id": "b10-3", "kind": "path", "d": "M -15 44 C -6 46, 6 46, 17 42 L 17 52 C 6 56, -4 56, -14 54 Z", "fill": "#09090b", "stroke": "#09090b", "strokeWidth": 1.5}, {"id": "b10-4", "kind": "path", "d": "M -8 52 C -6 75, -4 95, -4 105 L 10 105 C 10 95, 10 75, 8 52 Z", "fill": "#fbc38f", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-5", "kind": "path", "d": "M -14 100 C -16 118, -16 132, -12 144 C 0 148, 16 148, 24 140 C 26 128, 26 114, 22 100 Z", "fill": "#0f172a", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-6", "kind": "path", "d": "M -12 104 L 20 104 L 20 108 L -12 108 Z", "fill": "#94a3b8", "stroke": "none", "strokeWidth": 0}, {"id": "b10-7", "kind": "path", "d": "M -10 136 L 22 136 L 21 140 L -9 140 Z", "fill": "#94a3b8", "stroke": "none", "strokeWidth": 0}, {"id": "b10-8", "kind": "path", "d": "M 0 108 C -8 108, -12 118, -12 124 C -12 130, -8 138, 0 138 C 8 138, 14 130, 14 124 C 14 118, 8 108, 0 108 Z", "fill": "#1e293b", "stroke": "#09090b", "strokeWidth": 1.5}, {"id": "b10-9", "kind": "path", "d": "M 0 112 C -5 112, -8 118, -8 124 C -8 130, -5 135, 0 135 C 5 135, 9 130, 9 124 C 9 118, 5 112, 0 112 Z", "fill": "#22c55e", "stroke": "#15803d", "strokeWidth": 1}, {"id": "b10-10", "kind": "path", "d": "M 0 115 C -3 115, -5 119, -5 124 C -5 129, -3 132, 0 132 C 3 132, 6 129, 6 124 C 6 119, 3 115, 0 115 Z", "fill": "#4ade80", "stroke": "none", "strokeWidth": 0}, {"id": "b10-11", "kind": "path", "d": "M -4 118 L 4 118 L -4 130 L 4 130 Z", "fill": "#09090b", "stroke": "none", "strokeWidth": 0}, {"id": "b10-12", "kind": "path", "d": "M -1 123 L 1 123 L 1 125 L -1 125 Z", "fill": "#ffffff", "stroke": "none", "strokeWidth": 0}, {"id": "b10-13", "kind": "path", "d": "M -8 144 C -12 155, -12 170, -6 182 C 0 186, 6 182, 10 170 C 14 158, 14 148, 12 142 Z", "fill": "#fbc38f", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-14", "kind": "path", "d": "M -4 162 C 0 164, 4 164, 8 160", "fill": "none", "stroke": "#09090b", "strokeWidth": 1.5}, {"id": "b10-15", "kind": "path", "d": "M -2 172 C 2 174, 5 173, 8 169", "fill": "none", "stroke": "#09090b", "strokeWidth": 1.5}], "leg_r": [{"id": "b10-1", "kind": "path", "d": "M -18 -8 C -8 -14, 18 -14, 24 -8 L 26 160 C 16 166, -18 166, -26 160 Z", "fill": "#5e6638", "stroke": "#09090b", "strokeWidth": 2.2}, {"id": "b10-2", "kind": "path", "d": "M -26 30 C -24 80, -26 130, -26 160 L -14 160 C -14 130, -12 80, -14 30 Z", "fill": "#474e27", "stroke": "none", "strokeWidth": 0}, {"id": "b10-3", "kind": "path", "d": "M -28 35 L -10 38 L -12 85 L -29 82 Z", "fill": "#535a32", "stroke": "#09090b", "strokeWidth": 1.8}, {"id": "b10-4", "kind": "path", "d": "M -29 32 L -9 35 L -10 48 L -19 52 L -29 48 Z", "fill": "#6b7440", "stroke": "#09090b", "strokeWidth": 2.0}, {"id": "b10-5", "kind": "path", "d": "M -27 155 C -15 162, 15 162, 27 155 L 26 168 C 14 175, -16 175, -27 168 Z", "fill": "#525a30", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-6", "kind": "path", "d": "M -22 166 C -20 180, -24 195, -24 204 L 20 204 C 22 195, 20 180, 22 166 Z", "fill": "#f8fafc", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-7", "kind": "path", "d": "M -24 195 C -24 204, -20 208, -10 208 L -10 195 Z", "fill": "#09090b", "stroke": "#09090b", "strokeWidth": 1.5}, {"id": "b10-8", "kind": "path", "d": "M -26 204 L 22 204 L 22 215 C 10 217, -15 217, -26 215 Z", "fill": "#09090b", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-9", "kind": "path", "d": "M -8 180 C 2 185, 12 188, 18 188", "fill": "none", "stroke": "#09090b", "strokeWidth": 2}], "leg_l": [{"id": "b10-1", "kind": "path", "d": "M -20 -8 C -10 -14, 15 -14, 22 -8 L 22 158 C 12 164, -15 164, -24 158 Z", "fill": "#525a30", "stroke": "#09090b", "strokeWidth": 2.2}, {"id": "b10-2", "kind": "path", "d": "M 10 15 C 15 65, 18 115, 20 158 L 10 158 C 8 115, 6 65, 4 15 Z", "fill": "#3c4222", "stroke": "none", "strokeWidth": 0}, {"id": "b10-3", "kind": "path", "d": "M -24 152 C -12 160, 12 160, 23 152 L 22 165 C 10 172, -14 172, -24 165 Z", "fill": "#464e28", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-4", "kind": "path", "d": "M -20 163 C -18 178, -22 192, -22 202 L 18 202 C 20 192, 18 178, 20 163 Z", "fill": "#f8fafc", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-5", "kind": "path", "d": "M -22 194 C -22 202, -18 206, -9 206 L -9 194 Z", "fill": "#09090b", "stroke": "#09090b", "strokeWidth": 1.5}, {"id": "b10-6", "kind": "path", "d": "M -24 202 L 20 202 L 20 213 C 8 215, -14 215, -24 213 Z", "fill": "#09090b", "stroke": "#09090b", "strokeWidth": 2}, {"id": "b10-7", "kind": "path", "d": "M -7 178 C 2 183, 10 186, 16 186", "fill": "none", "stroke": "#09090b", "strokeWidth": 2}]};

function generateWalkKeyframes(mode = 'walk_across', totalFrames = 120, fps = 24) {
  const cycle = 1.0; // 1 second per 2 steps = 24 frames per cycle
  const rootKeys = [];
  const torsoKeys = [];
  const headKeys = [];
  const armRKeys = [];
  const armLKeys = [];
  const legRKeys = [];
  const legLKeys = [];
  const shadowKeys = [];
  const flareTKeys = [];
  const flareOKeys = [];

  const startX = mode === 'walk_across' ? 420.0 : 640.0;
  const endX = mode === 'walk_across' ? 860.0 : 640.0;
  const totalDist = endX - startX;

  for (let frame = 0; frame <= totalFrames; frame++) {
    const t = frame / fps;
    const progress = totalFrames > 0 ? frame / totalFrames : 0;
    const phase = (t / cycle) % 1.0;
    const ang = phase * 2.0 * Math.PI;

    // Forward translation
    const baseX = startX + totalDist * progress;
    const surge = (mode === 'walk_across') ? Math.sin(phase * 4.0 * Math.PI) * 2.5 : 0;
    const curX = baseX + surge;

    // Bipedal hip bounce: lowest on contact (phase 0 & 0.5), highest on passing (0.25 & 0.75)
    const hipBounce = Math.cos(phase * 4.0 * Math.PI) * 4.5;
    const curY = 390.0 + hipBounce;

    // Pelvic roll and subtle lateral sway
    const pelvisRoll = Math.sin(ang) * 0.02;

    rootKeys.push({
      id: `k-wr-${frame}`,
      frame,
      value: T(curX, curY, pelvisRoll, 1.0, 1.0),
      easing: 'linear'
    });

    // Torso counter-rotation
    const torsoRot = -Math.sin(ang) * 0.035;
    torsoKeys.push({
      id: `k-wt-${frame}`,
      frame,
      value: T(0, -79.1, torsoRot, 1.0, 1.0),
      easing: 'linear'
    });

    // Head stabilizes gaze with subtle bounce
    const headRot = Math.sin(ang) * 0.02 - Math.cos(phase * 4.0 * Math.PI) * 0.015;
    headKeys.push({
      id: `k-wh-${frame}`,
      frame,
      value: T(-7.8, -80.6, headRot, 1.0, 1.0),
      easing: 'linear'
    });

    // Right Leg (near leg):
    // phase 0..0.5 = stance (planted, moving backward relative to hip)
    // phase 0.5..1.0 = swing (lifting, moving forward)
    let lrX, lrY, lrRot;
    if (phase < 0.5) {
      const sub = phase / 0.5;
      lrX = -18.2 + (20.0 - 40.0 * sub);
      lrY = -1.1;
      lrRot = 0.28 - 0.56 * sub;
    } else {
      const sub = (phase - 0.5) / 0.5;
      lrX = -18.2 + (-20.0 + 40.0 * sub);
      const lift = Math.sin(sub * Math.PI) * 16.0;
      lrY = -1.1 - lift;
      lrRot = -0.28 + 0.56 * sub;
    }
    legRKeys.push({
      id: `k-wlr-${frame}`,
      frame,
      value: T(lrX, lrY, lrRot, 1.0, 1.0),
      easing: 'linear'
    });

    // Left Leg (far leg): 180 degrees opposite
    const oppPhase = (phase + 0.5) % 1.0;
    let llX, llY, llRot;
    if (oppPhase < 0.5) {
      const sub = oppPhase / 0.5;
      llX = 13.0 + (18.0 - 36.0 * sub);
      llY = -1.1;
      llRot = 0.26 - 0.52 * sub;
    } else {
      const sub = (oppPhase - 0.5) / 0.5;
      llX = 13.0 + (-18.0 + 36.0 * sub);
      const lift = Math.sin(sub * Math.PI) * 15.0;
      llY = -1.1 - lift;
      llRot = -0.26 + 0.52 * sub;
    }
    legLKeys.push({
      id: `k-wll-${frame}`,
      frame,
      value: T(llX, llY, llRot, 1.0, 1.0),
      easing: 'linear'
    });

    // Right Arm: swings back when right leg is forward (phase 0)
    const armRRot = -Math.cos(ang) * 0.36;
    armRKeys.push({
      id: `k-war-${frame}`,
      frame,
      value: T(-33.8, -70.2, armRRot, 1.0, 1.0),
      easing: 'linear'
    });

    // Left Arm (with Omnitrix!): swings forward when right leg is forward
    const armLRot = Math.cos(ang) * 0.38;
    armLKeys.push({
      id: `k-wal-${frame}`,
      frame,
      value: T(28.6, -70.2, armLRot, 1.0, 1.0),
      easing: 'linear'
    });

    // Contact shadow follows character across stage
    const shadowScale = 1.0 + Math.cos(phase * 4.0 * Math.PI) * 0.12;
    shadowKeys.push({
      id: `k-ws-${frame}`,
      frame,
      value: T(curX, 628.0, 0.0, shadowScale, 1.0),
      easing: 'linear'
    });

    // Omnitrix Flare follows left wrist
    const flareX = curX + 62.0 + armLRot * 32.0;
    const flareY = 373.0 - Math.abs(armLRot) * 20.0;
    const flareOp = 0.35 + Math.sin(t * 8.0) * 0.2 + Math.max(0, armLRot) * 0.35;
    flareTKeys.push({
      id: `k-wft-${frame}`,
      frame,
      value: T(flareX, flareY, t * 3.0, 0.6, 0.6),
      easing: 'linear'
    });
    flareOKeys.push({
      id: `k-wfo-${frame}`,
      frame,
      value: flareOp,
      easing: 'linear'
    });
  }

  return {
    rootKeys,
    torsoKeys,
    headKeys,
    armRKeys,
    armLKeys,
    legRKeys,
    legLKeys,
    shadowKeys,
    flareTKeys,
    flareOKeys
  };
}

export default defineMcpPlugin({
  id: 'ben10-plugin',
  version: '1.0.0',
  tools: [
    {
      name: 'create_ben10_character',
      description: 'Designs an authentic vector rig of Ben 10 with calibrated walking kinematics across the alien matrix platform, including planted foot contact, natural hip bounce, counter-swinging arms with the Omnitrix, and pulsing alien particles.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          walkMode: { type: 'string', enum: ['walk_across', 'walk_cycle'], default: 'walk_across' },
          fps: { type: 'integer', default: 24 },
          durationSeconds: { type: 'number', default: 5 }
        },
        required: ['path']
      },
      async execute(args, context) {
        const input = objectArguments(args);
        const project = await load(context, input.path);
        const fps = input.fps ?? 24;
        const totalDurationSec = input.durationSeconds ?? 5;
        const totalFrames = Math.round(totalDurationSec * fps);
        const walkMode = input.walkMode ?? 'walk_across';

        project.canvas = { width: 1280, height: 720, background: '#090d16' };
        project.layers = [];
        project.bones = [];
        project.bindings = [];

        // 1. Sci-Fi Hologram Studio Stage
        project.layers.push({
          id: 'env-bg',
          name: 'Omnitrix Alien Grid Background',
          type: 'vector',
          local: T(0, 0),
          zIndex: -100,
          opacity: 1,
          visible: true,
          locked: true,
          boundBoneId: null,
          shapes: [
            R(0, 0, 1280, 720, '#090d16'),
            E(640, 360, 420, 420, 'none', { stroke: '#15803d', strokeWidth: 1.5, opacity: 0.35 }),
            E(640, 360, 560, 560, 'none', { stroke: '#22c55e', strokeWidth: 1, opacity: 0.2 }),
            E(640, 360, 260, 260, 'none', { stroke: '#4ade80', strokeWidth: 2, opacity: 0.4 }),
            // Ground circular runway / pedestal
            E(640, 625, 460, 65, '#0f172a', { stroke: '#22c55e', strokeWidth: 3 }),
            E(640, 625, 410, 52, '#064e3b', { opacity: 0.6 }),
            P('M 200 625 L 1080 625 M 640 565 L 640 685 M 340 585 L 940 665 M 340 665 L 940 585', 'none', '#22c55e', 1.5, { opacity: 0.5 })
          ]
        });

        // 2. Character Contact Shadow
        project.layers.push({
          id: 'ben-layer-shadow',
          name: 'Ben 10 Shadow',
          type: 'vector',
          local: T(640, 628),
          zIndex: -10,
          opacity: 0.75,
          visible: true,
          locked: false,
          boundBoneId: null,
          shapes: [
            E(0, 0, 115, 28, '#020617', { opacity: 0.85 })
          ]
        });

        // 3. Omnitrix Green Energy Flare & Hologram Waves
        project.layers.push({
          id: 'layer-omnitrix-flare',
          name: 'Omnitrix Alien Energy Flare',
          type: 'vector',
          local: T(702, 373),
          zIndex: 60,
          opacity: 0.8,
          visible: true,
          locked: false,
          boundBoneId: null,
          shapes: [
            E(0, 0, 48, 48, 'none', { stroke: '#4ade80', strokeWidth: 3, opacity: 0.9 }),
            E(0, 0, 72, 72, 'none', { stroke: '#22c55e', strokeWidth: 2, opacity: 0.6 }),
            E(0, 0, 24, 24, '#86efac', { opacity: 0.75 }),
            P('M -36 -36 L 36 36 M 36 -36 L -36 36', 'none', '#ffffff', 2.5, { opacity: 0.8 })
          ]
        });

        // 4. BEN 10 RIG BONES
        const initX = (walkMode === 'walk_across') ? 420.0 : 640.0;
        project.bones = [
          { id: 'ben-root', name: 'Ben Root (Hips)', parentId: null, length: 30, local: T(initX, 390) },
          { id: 'ben-torso', name: 'Ben Torso & Chest', parentId: 'ben-root', length: 110, local: T(0, -79.1) },
          { id: 'ben-head', name: 'Ben Head & Face', parentId: 'ben-torso', length: 80, local: T(-7.8, -80.6) },
          { id: 'ben-arm-r', name: 'Right Arm & Hand', parentId: 'ben-torso', length: 90, local: T(-33.8, -70.2) },
          { id: 'ben-arm-l', name: 'Left Arm & Omnitrix', parentId: 'ben-torso', length: 90, local: T(28.6, -70.2) },
          { id: 'ben-leg-r', name: 'Right Cargo Leg & Shoe', parentId: 'ben-root', length: 150, local: T(-18.2, -1.1) },
          { id: 'ben-leg-l', name: 'Left Cargo Leg & Shoe', parentId: 'ben-root', length: 150, local: T(13.0, -1.1) }
        ];

        // 5. VECTOR CHARACTER LAYERS
        project.layers.push({
          id: 'ben-layer-leg-l',
          name: 'Left Leg (Baggy Cargo Pants & Skate Shoe)',
          type: 'vector',
          local: T(0, 0),
          zIndex: 10,
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: 'ben-leg-l',
          shapes: BEN10_SHAPES.leg_l
        });

        project.layers.push({
          id: 'ben-layer-leg-r',
          name: 'Right Leg (Baggy Cargo Pants & Skate Shoe)',
          type: 'vector',
          local: T(0, 0),
          zIndex: 12,
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: 'ben-leg-r',
          shapes: BEN10_SHAPES.leg_r
        });

        project.layers.push({
          id: 'ben-layer-torso',
          name: 'Ben 10 Torso (White/Black Stripe Shirt & Collar)',
          type: 'vector',
          local: T(0, 0),
          zIndex: 20,
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: 'ben-torso',
          shapes: BEN10_SHAPES.torso
        });

        project.layers.push({
          id: 'ben-layer-arm-r',
          name: 'Right Arm & Hand',
          type: 'vector',
          local: T(0, 0),
          zIndex: 22,
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: 'ben-arm-r',
          shapes: BEN10_SHAPES.arm_r
        });

        project.layers.push({
          id: 'ben-layer-arm-l',
          name: 'Left Arm & The Omnitrix',
          type: 'vector',
          local: T(0, 0),
          zIndex: 30,
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: 'ben-arm-l',
          shapes: BEN10_SHAPES.arm_l
        });

        project.layers.push({
          id: 'ben-layer-head',
          name: 'Ben 10 Head, Hair & Expressive Face',
          type: 'vector',
          local: T(0, 0),
          zIndex: 40,
          opacity: 1,
          visible: true,
          locked: false,
          boundBoneId: 'ben-head',
          shapes: BEN10_SHAPES.head
        });

        // 6. BINDINGS
        project.bindings = [
          { layerId: 'ben-layer-torso', imageId: 'ben-layer-torso', boneId: 'ben-torso', bindOffset: T(0, 0) },
          { layerId: 'ben-layer-head', imageId: 'ben-layer-head', boneId: 'ben-head', bindOffset: T(0, 0) },
          { layerId: 'ben-layer-arm-r', imageId: 'ben-layer-arm-r', boneId: 'ben-arm-r', bindOffset: T(0, 0) },
          { layerId: 'ben-layer-arm-l', imageId: 'ben-layer-arm-l', boneId: 'ben-arm-l', bindOffset: T(0, 0) },
          { layerId: 'ben-layer-leg-r', imageId: 'ben-layer-leg-r', boneId: 'ben-leg-r', bindOffset: T(0, 0) },
          { layerId: 'ben-layer-leg-l', imageId: 'ben-layer-leg-l', boneId: 'ben-leg-l', bindOffset: T(0, 0) }
        ];

        // 7. ANIMATIONS
        const walkData = generateWalkKeyframes(walkMode, totalFrames, fps);
        const walkClipId = 'ben10-walking-animation';

        project.animations = [
          {
            id: walkClipId,
            name: 'Ben 10 Walking Animation',
            fps,
            startFrame: 0,
            endFrame: totalFrames,
            loopMode: 'loop',
            tracks: [
              { id: 'track-root', targetId: 'ben-root', property: 'transform', keyframes: walkData.rootKeys },
              { id: 'track-torso', targetId: 'ben-torso', property: 'transform', keyframes: walkData.torsoKeys },
              { id: 'track-head', targetId: 'ben-head', property: 'transform', keyframes: walkData.headKeys },
              { id: 'track-arm-r', targetId: 'ben-arm-r', property: 'transform', keyframes: walkData.armRKeys },
              { id: 'track-arm-l', targetId: 'ben-arm-l', property: 'transform', keyframes: walkData.armLKeys },
              { id: 'track-leg-r', targetId: 'ben-leg-r', property: 'transform', keyframes: walkData.legRKeys },
              { id: 'track-leg-l', targetId: 'ben-leg-l', property: 'transform', keyframes: walkData.legLKeys },
              { id: 'track-shadow', targetId: 'ben-layer-shadow', property: 'transform', keyframes: walkData.shadowKeys },
              { id: 'track-flare-t', targetId: 'layer-omnitrix-flare', property: 'transform', keyframes: walkData.flareTKeys },
              { id: 'track-flare-o', targetId: 'layer-omnitrix-flare', property: 'opacity', keyframes: walkData.flareOKeys }
            ],
            setupPose: {}
          }
        ];

        // 8. Physics Particles (Omnitrix Sparks)
        project.dynamics = {
          enabled: true,
          startFrame: 0,
          endFrame: totalFrames,
          fps,
          substeps: 4,
          gravityX: 0,
          gravityY: -45,
          windX: -25,
          windY: -20,
          windNoise: 25,
          seed: 10,
          bones: [],
          bodies: [],
          meshes: [],
          emitters: [
            {
              id: 'emitter-omnitrix-sparks',
              name: 'Omnitrix Alien Energy Particles',
              enabled: true,
              x: 640,
              y: 380,
              rate: 22,
              lifetime: 1.2,
              speed: 65,
              spread: Math.PI * 2,
              direction: -Math.PI / 2,
              size: 3.5,
              color: '#4ade80'
            }
          ]
        };

        project.timeline = {
          currentFrame: 0,
          currentTime: 0,
          isPlaying: false,
          loop: true,
          fps,
          startFrame: 0,
          endFrame: totalFrames,
          activeAnimationId: walkClipId
        };

        await save(context, input.path, project);
        return jsonToolResult({
          success: true,
          path: input.path,
          walkMode,
          totalFrames,
          durationSeconds: totalDurationSec,
          layers: project.layers.length,
          bones: project.bones.length
        });
      }
    },
    {
      name: 'animate_ben10_walk',
      description: 'Applies or customizes a walking animation on Ben 10 with realistic bipedal strides, ground contact, and arm swinging.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          mode: { type: 'string', enum: ['walk_across', 'walk_cycle'], default: 'walk_across' },
          fps: { type: 'integer', default: 24 },
          durationSeconds: { type: 'number', default: 5 }
        },
        required: ['path']
      },
      async execute(args, context) {
        const input = objectArguments(args);
        const project = await load(context, input.path);
        const fps = input.fps ?? project.timeline?.fps ?? 24;
        const totalDurationSec = input.durationSeconds ?? 5;
        const totalFrames = Math.round(totalDurationSec * fps);
        const mode = input.mode ?? 'walk_across';

        const walkData = generateWalkKeyframes(mode, totalFrames, fps);
        const clipId = 'ben10-walking-animation';

        project.animations = project.animations.filter(c => c.id !== clipId);
        project.animations.push({
          id: clipId,
          name: `Ben 10 Walking (${mode})`,
          fps,
          startFrame: 0,
          endFrame: totalFrames,
          loopMode: 'loop',
          tracks: [
            { id: 'track-root', targetId: 'ben-root', property: 'transform', keyframes: walkData.rootKeys },
            { id: 'track-torso', targetId: 'ben-torso', property: 'transform', keyframes: walkData.torsoKeys },
            { id: 'track-head', targetId: 'ben-head', property: 'transform', keyframes: walkData.headKeys },
            { id: 'track-arm-r', targetId: 'ben-arm-r', property: 'transform', keyframes: walkData.armRKeys },
            { id: 'track-arm-l', targetId: 'ben-arm-l', property: 'transform', keyframes: walkData.armLKeys },
            { id: 'track-leg-r', targetId: 'ben-leg-r', property: 'transform', keyframes: walkData.legRKeys },
            { id: 'track-leg-l', targetId: 'ben-leg-l', property: 'transform', keyframes: walkData.legLKeys },
            { id: 'track-shadow', targetId: 'ben-layer-shadow', property: 'transform', keyframes: walkData.shadowKeys },
            { id: 'track-flare-t', targetId: 'layer-omnitrix-flare', property: 'transform', keyframes: walkData.flareTKeys },
            { id: 'track-flare-o', targetId: 'layer-omnitrix-flare', property: 'opacity', keyframes: walkData.flareOKeys }
          ],
          setupPose: {}
        });

        project.timeline.activeAnimationId = clipId;
        project.timeline.endFrame = totalFrames;
        project.timeline.loop = true;

        await save(context, input.path, project);
        return jsonToolResult({
          success: true,
          path: input.path,
          clipId,
          mode,
          totalFrames
        });
      }
    }
  ]
});
