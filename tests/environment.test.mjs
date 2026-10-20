import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({
  stdin: { contents: "export * from './src/engine/index';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const {
  Rig,
  defaultEnvironmentProject,
  normalizeEnvironmentProject,
  normalizeEnvironmentSettings,
  paintTerrainTile,
  projectToSVG,
  sampleEnvironment,
} = compiled.exports;

test('environment defaults are bounded and legacy rigs remain character-only', () => {
  const rig = new Rig();
  assert.equal(rig.toProject().environment, undefined);
  const project = defaultEnvironmentProject('Forest Village');
  assert.equal(project.settings.name, 'Forest Village');
  assert.equal(project.terrain.tiles.length, 12);
  assert.equal(project.terrain.tiles.filter(tile => tile.collision).length, 4);
});

test('malformed environment data normalizes without invalid colors, ranges, or duplicate cells', () => {
  const normalized = normalizeEnvironmentProject({
    settings: { weather: 'hail', exposure: 99, gridSize: 1 },
    terrain: {
      gridWidth: 2,
      gridHeight: 2,
      tiles: [
        { id: 'a', x: 0, y: 0, elevation: 999, material: 'unknown' },
        { id: 'b', x: 0, y: 0, elevation: 2, material: 'rock' },
      ],
    },
    effects: { fogDensity: -2, particleDensity: 4 },
  });
  assert.equal(normalized.settings.weather, 'clear');
  assert.equal(normalized.settings.exposure, 4);
  assert.equal(normalized.settings.gridSize, 4);
  assert.equal(normalized.terrain.tiles.length, 1);
  assert.equal(normalized.terrain.tiles[0].material, 'rock');
  assert.equal(normalized.terrain.tiles[0].elevation, 2);
  assert.equal(normalized.effects.fogDensity, 0);
  assert.equal(normalized.effects.particleDensity, 1);
  assert.deepEqual(normalizeEnvironmentSettings({}), normalizeEnvironmentProject({}).settings);
});

test('terrain painting selects and updates a bounded cell', () => {
  const project = defaultEnvironmentProject();
  const next = paintTerrainTile(project.terrain, 99, 1, { material: 'water', collision: false, elevation: 5 });
  const tile = next.tiles.find(item => item.x === next.gridWidth - 1 && item.y === 1);
  assert.ok(tile);
  assert.equal(tile.material, 'water');
  assert.equal(tile.collision, false);
  assert.equal(tile.elevation, 5);
  assert.equal(next.activeTileId, tile.id);
});

test('environment data survives native JSON round-trip and samples deterministically', () => {
  const source = new Rig({ name: 'Environment scene', environment: defaultEnvironmentProject('River valley') });
  source.setEnvironment({ effects: { rain: true, seed: 42 }, settings: { weather: 'rain' } });
  const reopened = Rig.fromJSON(source.toJSON());
  assert.equal(reopened.environment.settings.name, 'River valley');
  assert.equal(reopened.environment.effects.seed, 42);
  assert.deepEqual(sampleEnvironment(reopened.environment, 24), sampleEnvironment(reopened.environment, 24));
  assert.notDeepEqual(sampleEnvironment(reopened.environment, 24), sampleEnvironment(reopened.environment, 25));
  const svg = projectToSVG(reopened);
  assert.match(svg, /environment-.*-sky/);
  assert.match(svg, /linearGradient/);
});
