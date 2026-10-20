import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({
  stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Rig, deserializeProject, prepareCharacterStudioImport } = compiled.exports;

async function importedBoy() {
  const json = await readFile('boy-character-walk-fixed-v2.json', 'utf8');
  return prepareCharacterStudioImport(deserializeProject(json));
}

test('boy walk JSON imports as an editable multi-angle clothing rig', async () => {
  const { project, summary } = await importedBoy();
  assert.equal(summary.viewCount, 8);
  assert.ok(summary.viewSetId);
  assert.ok(summary.meshLayerIds.length >= 8);
  assert.equal(summary.meshLayerIds.length, summary.weightedLayerIds.length);
  assert.ok(summary.clothIds.length >= 8);
  assert.equal(project.dynamics.enabled, true);
  assert.equal(project.characterViews[0].views.length, 8);
  assert.ok(project.layers.filter(layer => layer.mesh).every(layer => layer.mesh.vertices.some(vertex => Object.keys(vertex.weights).length > 0)));
  assert.equal(project.metadata.weightPainting, 'vertex-brush-v1');
  assert.equal(project.metadata.clothingPhysics, 'cloth-mesh-v1');
});

test('imported clothing keeps rig weights and supports normalized brush painting after JSON round trip', async () => {
  const { project } = await importedBoy();
  const rig = new Rig(project);
  const garment = [...rig.layers.values()].find(layer => layer.name === 'Shirt body');
  assert.ok(garment?.mesh);
  const targetBone = [...rig.bones.values()].find(bone => bone.name === 'Head');
  assert.ok(targetBone);
  const before = rig.getMeshVertices(garment.id)[0];
  assert.ok(rig.paintMeshWeights(garment.id, before, targetBone.id, 80, 1));
  const weights = garment.mesh.vertices[0].weights;
  assert.ok((weights[targetBone.id] ?? 0) > 0);
  assert.ok(Math.abs(Object.values(weights).reduce((sum, value) => sum + value, 0) - 1) < 1e-6);
  const restored = Rig.fromJSON(rig.toJSON());
  const restoredGarment = restored.layers.get(garment.id);
  assert.ok(restoredGarment?.mesh);
  assert.deepEqual(restoredGarment.mesh.vertices[0].weights, weights);
  assert.equal(restored.characterViews[0].views.length, 8);
  assert.equal(restored.dynamics.meshes.length, project.dynamics.meshes.length);
});
