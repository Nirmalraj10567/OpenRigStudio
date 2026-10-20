import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('exact reference plate project preserves the supplied screenshot as an image layer', async () => {
  const workspace = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
  const project = JSON.parse(await readFile(`${workspace}/exact-reference-plate.json`, 'utf8'));
  const source = await readFile(`${workspace}/__agent__/animation/Screenshot 2026-10-09 at 5.00.11 PM.png`);
  const image = project.layers.find(layer => layer.id === 'reference-plate');
  assert.equal(project.metadata.exactReferencePlate, true);
  assert.equal(project.timeline.endFrame / project.timeline.fps, 5);
  assert.equal(image.src, `data:image/png;base64,${source.toString('base64')}`);
  assert.equal(project.animations[0].tracks.length, 1);
  assert.equal(project.bones.length, 0);
});
