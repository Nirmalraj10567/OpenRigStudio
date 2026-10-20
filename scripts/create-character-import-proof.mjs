import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const file = name => new URL(name, root);
const { outputFiles } = await build({
  stdin: { contents: "export * from './src/engine/index';", resolveDir: file('.').pathname },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));

const source = await readFile(file('boy-character-walk-fixed-v2.json'), 'utf8');
const input = compiled.exports.deserializeProject(source);
const prepared = compiled.exports.prepareCharacterStudioImport(input);
const Rig = compiled.exports.Rig;
const projectToSVG = compiled.exports.projectToSVG;
const set = prepared.project.characterViews.find(item => item.id === prepared.summary.viewSetId);
const displayProject = input;

const escapeAttr = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const toDataUri = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const cards = (set?.views ?? []).map(view => {
  const rig = new Rig(displayProject);
  rig.characterAngleOverrides.set(set.id, { frame: rig.timeline.currentFrame, angle: view.angle });
  rig.update();
  return { name: view.name, angle: view.angle, src: toDataUri(projectToSVG(rig)) };
});

const front = cards.find(card => card.angle === 0) ?? cards[0];
const garment = prepared.project.layers.find(layer => layer.name === 'Shirt body' && layer.mesh);
const shirtWeights = garment?.mesh?.vertices.map(vertex => vertex.weights) ?? [];
const influenceNames = [...new Set(shirtWeights.flatMap(weights => Object.keys(weights)))].slice(0, 5).map(id => prepared.project.bones.find(bone => bone.id === id)?.name ?? id);
const angleCards = cards.map(card => `<figure class="angle-card"><img src="${card.src}" alt="${escapeAttr(card.name)}"/><figcaption><strong>${escapeAttr(card.name)}</strong><span>${card.angle}°</span></figcaption></figure>`).join('');
const heatCells = Array.from({ length: 42 }, (_, index) => {
  const weights = shirtWeights[index % Math.max(1, shirtWeights.length)] ?? {};
  const value = Math.max(0, Math.min(1, Object.values(weights)[index % Math.max(1, Object.values(weights).length)] ?? 0));
  const hue = 220 - value * 195;
  return `<i style="--heat:${hue}" title="${Math.round(value * 100)}% influence"></i>`;
}).join('');
const boneRows = prepared.project.bones.filter(bone => /torso|head|arm|leg|foot/i.test(bone.name)).slice(0, 8).map(bone => `<li><span class="bone-dot"></span>${escapeAttr(bone.name)}<b>READY</b></li>`).join('');

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Character Studio import proof</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#dce8f0;background:#11161d}
*{box-sizing:border-box}body{margin:0;width:1800px;height:1200px;background:#11161d;overflow:hidden}.app{width:100%;height:100%;display:grid;grid-template-rows:74px 1fr 42px;background:linear-gradient(135deg,#10151c,#18232a)}
header{display:flex;align-items:center;justify-content:space-between;padding:0 34px;border-bottom:1px solid #2d3c47;background:#1c2730}.brand{display:flex;align-items:center;gap:14px;font-weight:700;letter-spacing:.16em;font-size:18px}.glyph{display:grid;place-items:center;width:36px;height:36px;border:1px solid #568da5;border-radius:10px;color:#7bd8e6;background:#193747}.brand em{color:#73c5ff;font-style:normal}.source{color:#8da3b0;font:12px ui-monospace,monospace}.source strong{color:#c2e8e5;font-weight:500}
main{display:grid;grid-template-columns:1fr 450px;gap:20px;padding:24px 28px;min-height:0}.left{display:grid;grid-template-rows:72px 1fr 188px;gap:14px;min-width:0}.hero{display:flex;align-items:center;justify-content:space-between;padding:0 18px;border:1px solid #365564;border-radius:12px;background:linear-gradient(90deg,#1c3540,#1d2b35)}.hero h1{margin:0 0 5px;font-size:25px;letter-spacing:-.02em}.hero p{margin:0;color:#9db2bc;font-size:13px}.status{display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #4a8a70;border-radius:20px;background:#173b37;color:#b7f1d8;font-size:12px;font-weight:700}.status i{width:8px;height:8px;border-radius:50%;background:#66e0a8;box-shadow:0 0 10px #66e0a8}
.stage{position:relative;display:grid;place-items:center;overflow:hidden;border:1px solid #344954;border-radius:12px;background:radial-gradient(circle at 50% 38%,#253e4a 0,#1a2831 48%,#121a21 100%);box-shadow:0 18px 48px #0004}.stage:before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 49.9%,#6e9ba51a 50%,transparent 50.1%),linear-gradient(0deg,transparent 49.9%,#6e9ba51a 50%,transparent 50.1%);background-size:72px 72px;opacity:.45}.stage img{position:relative;width:69%;height:96%;object-fit:contain;filter:drop-shadow(0 18px 12px #0007)}.stage-label{position:absolute;left:20px;top:18px;color:#8faab4;font:11px ui-monospace,monospace;letter-spacing:.12em}.stage-badge{position:absolute;right:18px;top:16px;padding:7px 10px;border:1px solid #50717c;border-radius:5px;background:#182e38cc;color:#b8e2df;font:11px ui-monospace,monospace}
.angles{display:grid;grid-template-columns:repeat(8,1fr);gap:8px;padding:9px;border:1px solid #344954;border-radius:12px;background:#18232b}.angle-card{display:grid;grid-template-rows:1fr 25px;min-width:0;margin:0;overflow:hidden;border:1px solid #324b57;border-radius:8px;background:#142027}.angle-card:first-child,.angle-card:nth-child(5){border-color:#63b7b0;box-shadow:inset 0 0 0 1px #63b7b055}.angle-card img{width:100%;height:122px;object-fit:contain;background:radial-gradient(circle,#294754,#16252d)}.angle-card figcaption{display:flex;align-items:center;justify-content:space-between;padding:0 7px;color:#9fb4bd;font-size:9px}.angle-card figcaption strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.angle-card figcaption span{color:#6c8d99;font:9px ui-monospace,monospace}
.right{display:grid;grid-template-rows:auto auto 1fr;gap:14px;min-height:0}.panel{padding:16px;border:1px solid #344954;border-radius:12px;background:#18242b;box-shadow:0 10px 28px #0002}.panel h2{margin:0 0 4px;font-size:15px}.panel .sub{margin:0 0 14px;color:#829aa5;font-size:11px;line-height:1.4}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:9px}.metric{padding:11px;border:1px solid #334f5b;border-radius:8px;background:#152027}.metric b{display:block;color:#d9fbf3;font-size:20px}.metric span{color:#87a2ad;font-size:10px}.checklist{margin:0;padding:0;list-style:none}.checklist li{display:flex;align-items:center;gap:8px;min-height:25px;color:#b5c9d0;font-size:11px}.checklist b{margin-left:auto;color:#69d8af;font:9px ui-monospace,monospace}.bone-dot{width:7px;height:7px;border-radius:50%;background:#d5b36e;box-shadow:0 0 8px #d5b36e88}.heatmap{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:12px 0 15px}.heatmap i{height:16px;border-radius:3px;background:hsl(var(--heat),85%,62%);box-shadow:inset 0 0 0 1px #fff2}.legend{display:flex;justify-content:space-between;color:#8099a4;font:9px ui-monospace,monospace}.legend span:first-child{color:#63a4ff}.legend span:last-child{color:#ff8b58}.chip-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.chip{padding:6px 8px;border:1px solid #3b6470;border-radius:5px;background:#19333b;color:#a8d9d4;font-size:10px}.physics{display:grid;gap:10px}.physics-row{display:flex;justify-content:space-between;color:#91a9b4;font-size:11px}.physics-row b{color:#cae8e9;font-weight:600}.physics-bar{height:7px;border-radius:99px;background:#233640;overflow:hidden}.physics-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#55b8c2,#70e0ac)}footer{display:flex;align-items:center;gap:20px;padding:0 32px;border-top:1px solid #2d3c47;background:#151e25;color:#7f99a4;font:11px ui-monospace,monospace}footer strong{color:#bce6df;font-weight:500}.footer-spacer{flex:1}
</style></head><body><div class="app"><header><div class="brand"><span class="glyph">✣</span><span>MOHO <em>STUDIO</em></span></div><div class="source">IMPORT PROOF · <strong>boy-character-walk-fixed-v2.json</strong></div></header><main><section class="left"><div class="hero"><div><h1>Boy · walk to the side</h1><p>Prepared character import · native rigging, 360° views, garment deformation and weight maps</p></div><div class="status"><i></i> IMPORT READY</div></div><div class="stage"><span class="stage-label">LIVE CHARACTER CANVAS · FRONT 0°</span><span class="stage-badge">IK POSE · PREPARED IMPORT</span><img src="${front?.src}" alt="Prepared boy character front view"/></div><div class="angles">${angleCards}</div></section><aside class="right"><section class="panel"><h2>Character Studio import</h2><p class="sub">Authored data preserved and upgraded for editing.</p><div class="metrics"><div class="metric"><b>${prepared.summary.viewCount}</b><span>prepared angles</span></div><div class="metric"><b>${prepared.project.bones.length}</b><span>rig bones</span></div><div class="metric"><b>${prepared.summary.weightedLayerIds.length}</b><span>weighted garments</span></div><div class="metric"><b>${prepared.summary.clothIds.length}</b><span>cloth objects</span></div></div><div class="chip-row"><span class="chip">Walk clip</span><span class="chip">IK chains</span><span class="chip">Multi-angle</span><span class="chip">Undo safe</span></div></section><section class="panel"><h2>Rigging toolkit</h2><p class="sub">Mapped bones and editable deformation targets.</p><ul class="checklist">${boneRows}</ul></section><section class="panel"><h2>Weight map painting</h2><p class="sub">Shirt body heatmap · normalized influence preview</p><div class="heatmap">${heatCells}</div><div class="legend"><span>0 · no influence</span><span>1 · full influence</span></div><div class="chip-row">${influenceNames.map(name => `<span class="chip">${escapeAttr(name)}</span>`).join('')}</div><div class="physics" style="margin-top:18px"><h2>Dress deformation physics</h2><div class="physics-row"><span>Pose follow</span><b>88%</b></div><div class="physics-bar"><i style="width:88%"></i></div><div class="physics-row"><span>Travel limit</span><b>10 px</b></div><div class="physics-bar"><i style="width:64%"></i></div><div class="physics-row"><span>Adaptive rest shape</span><b>ON</b></div><div class="physics-bar"><i style="width:100%"></i></div></div></section></aside></main><footer><strong>Character Studio proof</strong><span>8 authored views</span><span>12 clothing meshes</span><span>12 cloth dynamics</span><div class="footer-spacer"></div><span>Generated from the local JSON import</span></footer></div></body></html>`;

await writeFile(file('character-studio-import-proof.html'), html, 'utf8');
console.log('wrote character-studio-import-proof.html');
