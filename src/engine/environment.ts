import type { Point2D } from './math';

export type EnvironmentTimeOfDay = 'dawn' | 'day' | 'golden-hour' | 'night';
export type EnvironmentWeather = 'clear' | 'cloudy' | 'rain' | 'mist' | 'snow';
export type EnvironmentColorGrade = 'neutral' | 'warm' | 'cool' | 'noir';
export type EnvironmentLayerKind = 'sky' | 'terrain' | 'vegetation' | 'props' | 'effects' | 'characters';
export type EnvironmentTerrainMaterial = 'grass' | 'path' | 'rock' | 'sand' | 'snow' | 'water' | 'dirt';

export interface EnvironmentSettings {
  name: string;
  biome: string;
  timeOfDay: EnvironmentTimeOfDay;
  weather: EnvironmentWeather;
  exposure: number;
  fogDensity: number;
  ambientIntensity: number;
  horizonColor: string;
  skyColor: string;
  sunColor: string;
  sunIntensity: number;
  sunDirection: number;
  gridSize: number;
  snapToTerrain: boolean;
}

export interface TerrainTile {
  id: string;
  name: string;
  x: number;
  y: number;
  elevation: number;
  material: EnvironmentTerrainMaterial;
  visible: boolean;
  collision: boolean;
}

export interface EnvironmentTerrain {
  enabled: boolean;
  tileSize: number;
  gridWidth: number;
  gridHeight: number;
  activeTileId: string;
  brushSize: number;
  autoTile: boolean;
  showGrid: boolean;
  showCollision: boolean;
  tiles: TerrainTile[];
}

export interface EnvironmentEffects {
  fog: boolean;
  fogDensity: number;
  bloom: number;
  rain: boolean;
  dust: boolean;
  wind: number;
  vignette: number;
  colorGrade: EnvironmentColorGrade;
  cloudMovement: number;
  volumetricLight: boolean;
  particleDensity: number;
  seed: number;
}

export interface EnvironmentLayer {
  id: string;
  name: string;
  kind: EnvironmentLayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
  count: number;
  accent: string;
}

export interface EnvironmentCameraBounds {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EnvironmentSafeArea {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EnvironmentMiniMapSettings {
  visible: boolean;
  showCameraBounds: boolean;
  showSafeArea: boolean;
}

export interface EnvironmentProjectData {
  version: 1;
  settings: EnvironmentSettings;
  terrain: EnvironmentTerrain;
  effects: EnvironmentEffects;
  layers: EnvironmentLayer[];
  assetIds: string[];
  cameraBounds: EnvironmentCameraBounds;
  safeArea: EnvironmentSafeArea;
  minimap: EnvironmentMiniMapSettings;
}

export interface EnvironmentProjectPatch {
  settings?: Partial<EnvironmentSettings>;
  terrain?: Partial<EnvironmentTerrain>;
  effects?: Partial<EnvironmentEffects>;
  layers?: EnvironmentLayer[];
  assetIds?: string[];
  cameraBounds?: Partial<EnvironmentCameraBounds>;
  safeArea?: Partial<EnvironmentSafeArea>;
  minimap?: Partial<EnvironmentMiniMapSettings>;
}

export interface EnvironmentSample {
  frame: number;
  weather: EnvironmentWeather;
  fogOpacity: number;
  bloomOpacity: number;
  windOffset: number;
  particleCount: number;
  tint: string;
}

const DEFAULT_SETTINGS: EnvironmentSettings = {
  name: 'Untitled Environment',
  biome: 'Temperate forest',
  timeOfDay: 'golden-hour',
  weather: 'clear',
  exposure: 0,
  fogDensity: 0.12,
  ambientIntensity: 0.72,
  horizonColor: '#6f9b9c',
  skyColor: '#1d3447',
  sunColor: '#ffd28a',
  sunIntensity: 1.2,
  sunDirection: 45,
  gridSize: 32,
  snapToTerrain: true,
};

const DEFAULT_EFFECTS: EnvironmentEffects = {
  fog: true,
  fogDensity: 0.12,
  bloom: 0.18,
  rain: false,
  dust: false,
  wind: 0.24,
  vignette: 0.12,
  colorGrade: 'warm',
  cloudMovement: 0.2,
  volumetricLight: false,
  particleDensity: 0.35,
  seed: 1337,
};

const DEFAULT_LAYER_DEFINITIONS: Array<Pick<EnvironmentLayer, 'id' | 'name' | 'kind' | 'accent'>> = [
  { id: 'environment-sky', name: 'Sky & atmosphere', kind: 'sky', accent: '#7eb5d3' },
  { id: 'environment-terrain', name: 'Terrain tiles', kind: 'terrain', accent: '#b9c676' },
  { id: 'environment-vegetation', name: 'Vegetation', kind: 'vegetation', accent: '#74c5a5' },
  { id: 'environment-props', name: 'Props & set dressing', kind: 'props', accent: '#d5a86d' },
  { id: 'environment-effects', name: 'Atmosphere effects', kind: 'effects', accent: '#b9a8df' },
  { id: 'environment-characters', name: 'Characters', kind: 'characters', accent: '#e6a5a0' },
];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finite(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const candidate = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(candidate) ? Math.max(min, Math.min(max, candidate)) : fallback;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function text(value: unknown, fallback: string, max = 120): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() && value.length <= 48 ? value.trim() : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function tileId(x: number, y: number): string {
  return `terrain-${x}-${y}`;
}

function defaultTiles(width = 4, height = 3): TerrainTile[] {
  const tiles: TerrainTile[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles.push({
        id: tileId(x, y),
        name: `Tile ${String.fromCharCode(65 + x)}${y + 1}`,
        x,
        y,
        elevation: x === 1 && y === 1 ? 2 : x === 2 && y === 0 ? 1 : 0,
        material: x === 0 && y === height - 1 ? 'path' : 'grass',
        visible: true,
        collision: y === height - 1,
      });
    }
  }
  return tiles;
}

export const DEFAULT_ENVIRONMENT_SETTINGS: EnvironmentSettings = { ...DEFAULT_SETTINGS };
export const DEFAULT_ENVIRONMENT_EFFECTS: EnvironmentEffects = { ...DEFAULT_EFFECTS };

export function defaultEnvironmentTerrain(width = 4, height = 3): EnvironmentTerrain {
  const gridWidth = Math.max(1, Math.min(64, Math.round(width)));
  const gridHeight = Math.max(1, Math.min(64, Math.round(height)));
  return {
    enabled: true,
    tileSize: 32,
    gridWidth,
    gridHeight,
    activeTileId: tileId(0, 0),
    brushSize: 1,
    autoTile: true,
    showGrid: true,
    showCollision: false,
    tiles: defaultTiles(gridWidth, gridHeight),
  };
}

export function defaultEnvironmentLayers(): EnvironmentLayer[] {
  return DEFAULT_LAYER_DEFINITIONS.map(definition => ({
    ...definition,
    visible: true,
    locked: false,
    opacity: 1,
    count: definition.kind === 'terrain' ? 12 : 0,
  }));
}

export function defaultEnvironmentProject(name = DEFAULT_SETTINGS.name): EnvironmentProjectData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, name: text(name, DEFAULT_SETTINGS.name) },
    terrain: defaultEnvironmentTerrain(),
    effects: { ...DEFAULT_EFFECTS },
    layers: defaultEnvironmentLayers(),
    assetIds: [],
    cameraBounds: { enabled: false, x: 0, y: 0, width: 800, height: 520 },
    safeArea: { enabled: false, x: 40, y: 26, width: 720, height: 468 },
    minimap: { visible: true, showCameraBounds: true, showSafeArea: false },
  };
}

export function normalizeEnvironmentSettings(value: unknown): EnvironmentSettings {
  const source = record(value);
  return {
    name: text(source.name ?? source.title, DEFAULT_SETTINGS.name),
    biome: text(source.biome ?? source.biomeId, DEFAULT_SETTINGS.biome),
    timeOfDay: oneOf(String(source.timeOfDay ?? source.time ?? '').toLowerCase().replace(/\s+/g, '-'), ['dawn', 'day', 'golden-hour', 'night'] as const, DEFAULT_SETTINGS.timeOfDay),
    weather: oneOf(String(source.weather ?? '').toLowerCase(), ['clear', 'cloudy', 'rain', 'mist', 'snow'] as const, DEFAULT_SETTINGS.weather),
    exposure: finite(source.exposure, DEFAULT_SETTINGS.exposure, -4, 4),
    fogDensity: finite(source.fogDensity, DEFAULT_SETTINGS.fogDensity, 0, 1),
    ambientIntensity: finite(source.ambientIntensity, DEFAULT_SETTINGS.ambientIntensity, 0, 2),
    horizonColor: color(source.horizonColor ?? source.horizon, DEFAULT_SETTINGS.horizonColor),
    skyColor: color(source.skyColor ?? source.sky, DEFAULT_SETTINGS.skyColor),
    sunColor: color(source.sunColor, DEFAULT_SETTINGS.sunColor),
    sunIntensity: finite(source.sunIntensity, DEFAULT_SETTINGS.sunIntensity, 0, 8),
    sunDirection: finite(source.sunDirection ?? source.direction, DEFAULT_SETTINGS.sunDirection, -180, 180),
    gridSize: finite(source.gridSize ?? source.tileSize, DEFAULT_SETTINGS.gridSize, 4, 256),
    snapToTerrain: boolean(source.snapToTerrain ?? source.snap, DEFAULT_SETTINGS.snapToTerrain),
  };
}

function normalizeTile(value: unknown, index: number, width: number, height: number): TerrainTile | null {
  const source = record(value);
  if (!Object.keys(source).length) return null;
  const x = Math.round(finite(source.x, index % width, 0, Math.max(0, width - 1)));
  const y = Math.round(finite(source.y, Math.floor(index / width), 0, Math.max(0, height - 1)));
  return {
    id: text(source.id, tileId(x, y), 100),
    name: text(source.name, `Tile ${String.fromCharCode(65 + x)}${y + 1}`),
    x,
    y,
    elevation: finite(source.elevation ?? source.height, 0, -20, 20),
    material: oneOf(source.material ?? source.type, ['grass', 'path', 'rock', 'sand', 'snow', 'water', 'dirt'] as const, 'grass'),
    visible: boolean(source.visible, true),
    collision: boolean(source.collision ?? source.blocking, y >= height - 1),
  };
}

export function normalizeEnvironmentTerrain(value: unknown): EnvironmentTerrain {
  const source = record(value);
  const gridWidth = Math.round(finite(source.gridWidth ?? source.width, 4, 1, 64));
  const gridHeight = Math.round(finite(source.gridHeight ?? source.height, 3, 1, 64));
  const rawTileValue = source.tiles ?? source.cells;
  const rawTiles: unknown[] = Array.isArray(rawTileValue) ? rawTileValue : [];
  const byCell = new Map<string, TerrainTile>();
  rawTiles.forEach((item, index) => {
    const tile = normalizeTile(item, index, gridWidth, gridHeight);
    if (tile) byCell.set(`${tile.x}:${tile.y}`, tile);
  });
  const tiles = byCell.size ? [...byCell.values()] : defaultTiles(gridWidth, gridHeight);
  const requestedActive = text(source.activeTileId ?? source.selectedTileId, tiles[0]?.id ?? tileId(0, 0));
  return {
    enabled: boolean(source.enabled, true),
    tileSize: finite(source.tileSize, 32, 4, 256),
    gridWidth,
    gridHeight,
    activeTileId: tiles.some(tile => tile.id === requestedActive) ? requestedActive : tiles[0]?.id ?? tileId(0, 0),
    brushSize: Math.round(finite(source.brushSize, 1, 1, 16)),
    autoTile: boolean(source.autoTile, true),
    showGrid: boolean(source.showGrid, true),
    showCollision: boolean(source.showCollision, false),
    tiles,
  };
}

export function normalizeEnvironmentEffects(value: unknown): EnvironmentEffects {
  const source = record(value);
  return {
    fog: boolean(source.fog ?? source.fogEnabled, DEFAULT_EFFECTS.fog),
    fogDensity: finite(source.fogDensity, DEFAULT_EFFECTS.fogDensity, 0, 1),
    bloom: finite(source.bloom ?? source.bloomStrength, DEFAULT_EFFECTS.bloom, 0, 1),
    rain: boolean(source.rain ?? source.rainEnabled, DEFAULT_EFFECTS.rain),
    dust: boolean(source.dust ?? source.dustEnabled, DEFAULT_EFFECTS.dust),
    wind: finite(source.wind ?? source.windStrength, DEFAULT_EFFECTS.wind, 0, 1),
    vignette: finite(source.vignette, DEFAULT_EFFECTS.vignette, 0, 1),
    colorGrade: oneOf(source.colorGrade ?? source.grade, ['neutral', 'warm', 'cool', 'noir'] as const, DEFAULT_EFFECTS.colorGrade),
    cloudMovement: finite(source.cloudMovement ?? source.cloudSpeed, DEFAULT_EFFECTS.cloudMovement, 0, 1),
    volumetricLight: boolean(source.volumetricLight ?? source.volumetric, DEFAULT_EFFECTS.volumetricLight),
    particleDensity: finite(source.particleDensity, DEFAULT_EFFECTS.particleDensity, 0, 1),
    seed: Math.round(finite(source.seed, DEFAULT_EFFECTS.seed, 0, 2147483647)),
  };
}

function normalizeLayer(value: unknown, index: number): EnvironmentLayer | null {
  const source = record(value);
  if (!Object.keys(source).length) return null;
  const fallback = DEFAULT_LAYER_DEFINITIONS[index % DEFAULT_LAYER_DEFINITIONS.length];
  return {
    id: text(source.id, `${fallback.id}-${index + 1}`, 100),
    name: text(source.name ?? source.label, fallback.name),
    kind: oneOf(source.kind ?? source.type, ['sky', 'terrain', 'vegetation', 'props', 'effects', 'characters'] as const, fallback.kind),
    visible: boolean(source.visible, true),
    locked: boolean(source.locked, false),
    opacity: finite(source.opacity, 1, 0, 1),
    count: Math.round(finite(source.count ?? source.items, 0, 0, 9999)),
    accent: color(source.accent ?? source.color, fallback.accent),
  };
}

function normalizeRect(value: unknown, fallback: EnvironmentCameraBounds | EnvironmentSafeArea): EnvironmentCameraBounds | EnvironmentSafeArea {
  const source = record(value);
  return {
    enabled: boolean(source.enabled, fallback.enabled),
    x: finite(source.x, fallback.x, -100000, 100000),
    y: finite(source.y, fallback.y, -100000, 100000),
    width: finite(source.width, fallback.width, 1, 100000),
    height: finite(source.height, fallback.height, 1, 100000),
  };
}

export function normalizeEnvironmentProject(value: unknown): EnvironmentProjectData {
  const source = record(value);
  const base = defaultEnvironmentProject(text(record(source.settings).name, 'Untitled Environment'));
  const rawLayers = Array.isArray(source.layers) ? source.layers : [];
  const layers = rawLayers.map(normalizeLayer).filter((layer): layer is EnvironmentLayer => Boolean(layer));
  const rawAssets = Array.isArray(source.assetIds) ? source.assetIds : Array.isArray(source.assets) ? source.assets : [];
  const assetIds = [...new Set(rawAssets.flatMap(asset => typeof asset === 'string' ? [asset.slice(0, 120)] : record(asset).id && typeof record(asset).id === 'string' ? [String(record(asset).id).slice(0, 120)] : []))];
  return {
    version: 1,
    settings: normalizeEnvironmentSettings(source.settings ?? source),
    terrain: normalizeEnvironmentTerrain(source.terrain ?? source.tiles),
    effects: normalizeEnvironmentEffects(source.effects ?? source),
    layers: layers.length ? layers : base.layers,
    assetIds,
    cameraBounds: normalizeRect(source.cameraBounds, base.cameraBounds) as EnvironmentCameraBounds,
    safeArea: normalizeRect(source.safeArea, base.safeArea) as EnvironmentSafeArea,
    minimap: {
      visible: boolean(record(source.minimap).visible, base.minimap.visible),
      showCameraBounds: boolean(record(source.minimap).showCameraBounds, base.minimap.showCameraBounds),
      showSafeArea: boolean(record(source.minimap).showSafeArea, base.minimap.showSafeArea),
    },
  };
}

export function updateEnvironmentProject(
  current: EnvironmentProjectData,
  patch: EnvironmentProjectPatch,
): EnvironmentProjectData {
  return normalizeEnvironmentProject({
    ...current,
    ...patch,
    settings: { ...current.settings, ...(patch.settings ?? {}) },
    terrain: { ...current.terrain, ...(patch.terrain ?? {}) },
    effects: { ...current.effects, ...(patch.effects ?? {}) },
    cameraBounds: { ...current.cameraBounds, ...(patch.cameraBounds ?? {}) },
    safeArea: { ...current.safeArea, ...(patch.safeArea ?? {}) },
    minimap: { ...current.minimap, ...(patch.minimap ?? {}) },
  });
}

export function updateTerrainTile(terrain: EnvironmentTerrain, id: string, patch: Partial<TerrainTile>): EnvironmentTerrain {
  const next = clone(terrain);
  next.tiles = next.tiles.map(tile => tile.id === id ? { ...tile, ...patch } : tile);
  if (!next.tiles.some(tile => tile.id === next.activeTileId)) next.activeTileId = next.tiles[0]?.id ?? tileId(0, 0);
  return normalizeEnvironmentTerrain(next);
}

export function paintTerrainTile(
  terrain: EnvironmentTerrain,
  x: number,
  y: number,
  patch: Partial<TerrainTile> = {},
): EnvironmentTerrain {
  const next = normalizeEnvironmentTerrain(terrain);
  const cellX = Math.max(0, Math.min(next.gridWidth - 1, Math.round(x)));
  const cellY = Math.max(0, Math.min(next.gridHeight - 1, Math.round(y)));
  const id = next.tiles.find(tile => tile.x === cellX && tile.y === cellY)?.id ?? tileId(cellX, cellY);
  if (!next.tiles.some(tile => tile.id === id)) {
    next.tiles.push({
      id,
      name: `Tile ${String.fromCharCode(65 + cellX)}${cellY + 1}`,
      x: cellX,
      y: cellY,
      elevation: 0,
      material: 'grass',
      visible: true,
      collision: cellY >= next.gridHeight - 1,
    });
  }
  return updateTerrainTile({ ...next, activeTileId: id }, id, patch);
}

export function terrainTileAt(terrain: EnvironmentTerrain, x: number, y: number): TerrainTile | undefined {
  const cellX = Math.round(x);
  const cellY = Math.round(y);
  return terrain.tiles.find(tile => tile.x === cellX && tile.y === cellY);
}

export function terrainWorldPoint(terrain: EnvironmentTerrain, tile: Pick<TerrainTile, 'x' | 'y' | 'elevation'>): Point2D {
  return {
    x: (tile.x + 0.5) * terrain.tileSize,
    y: (tile.y + 0.5) * terrain.tileSize - tile.elevation * terrain.tileSize * 0.1,
  };
}

function hash(seed: number): number {
  let value = Math.round(seed) | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

function weatherTint(weather: EnvironmentWeather, grade: EnvironmentColorGrade): string {
  if (grade === 'noir') return '#9ba7ad';
  if (weather === 'rain' || weather === 'mist') return grade === 'warm' ? '#95a6a3' : '#7897aa';
  if (weather === 'snow') return '#dce9ea';
  if (grade === 'cool') return '#8db9c4';
  if (grade === 'warm') return '#d9ae7c';
  return '#a6c1b2';
}

/**
 * Produce a small deterministic sample for preview overlays and offline export.
 * No random state is shared between calls, so seeking to a frame is stable.
 */
export function sampleEnvironment(environment: EnvironmentProjectData, frame: number): EnvironmentSample {
  const normalized = normalizeEnvironmentProject(environment);
  const safeFrame = Number.isFinite(frame) ? frame : 0;
  const phase = safeFrame / 24;
  const rain = normalized.effects.rain || normalized.settings.weather === 'rain';
  const mist = normalized.settings.weather === 'mist';
  const snow = normalized.settings.weather === 'snow';
  const particleMultiplier = normalized.effects.particleDensity * (rain || snow || normalized.effects.dust ? 1 : 0.15);
  const noise = hash(normalized.effects.seed + Math.floor(safeFrame));
  return {
    frame: safeFrame,
    weather: normalized.settings.weather,
    fogOpacity: normalized.effects.fog || mist ? Math.max(normalized.effects.fogDensity, normalized.settings.fogDensity) : 0,
    bloomOpacity: Math.min(1, normalized.effects.bloom + (normalized.effects.volumetricLight ? 0.12 : 0)),
    windOffset: Math.sin(phase * (0.8 + normalized.effects.cloudMovement)) * normalized.effects.wind,
    particleCount: Math.round(160 * particleMultiplier * (0.65 + noise * 0.35)),
    tint: weatherTint(normalized.settings.weather, normalized.effects.colorGrade),
  };
}

function materialColor(material: EnvironmentTerrainMaterial): string {
  switch (material) {
    case 'path': return '#9b8058';
    case 'rock': return '#66747a';
    case 'sand': return '#c9ae72';
    case 'snow': return '#dbe8e5';
    case 'water': return '#3d8493';
    case 'dirt': return '#765640';
    default: return '#476d50';
  }
}

/** Draw the environment-only backdrop and deterministic atmosphere pass. */
export function renderEnvironmentBackdrop(
  ctx: CanvasRenderingContext2D,
  environment: EnvironmentProjectData,
  width: number,
  height: number,
  frame = 0,
): void {
  const normalized = normalizeEnvironmentProject(environment);
  const sample = sampleEnvironment(normalized, frame);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, normalized.settings.skyColor);
  sky.addColorStop(0.62, normalized.settings.horizonColor);
  sky.addColorStop(1, materialColor('grass'));
  ctx.save();
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const sunAngle = (normalized.settings.sunDirection - 90) * Math.PI / 180;
  const sunX = width * 0.5 + Math.cos(sunAngle) * width * 0.38;
  const sunY = height * 0.22 + Math.sin(sunAngle) * height * 0.15;
  const sunRadius = 18 + normalized.settings.sunIntensity * 8;
  const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius * 3);
  sun.addColorStop(0, `${normalized.settings.sunColor}dd`);
  sun.addColorStop(0.25, `${normalized.settings.sunColor}55`);
  sun.addColorStop(1, `${normalized.settings.sunColor}00`);
  ctx.fillStyle = sun;
  ctx.beginPath(); ctx.arc(sunX, sunY, sunRadius * 3, 0, Math.PI * 2); ctx.fill();

  if (normalized.terrain.enabled) {
    const terrainWidth = Math.min(width, normalized.terrain.gridWidth * normalized.terrain.tileSize);
    const terrainHeight = Math.min(height * 0.42, normalized.terrain.gridHeight * normalized.terrain.tileSize);
    const top = height - terrainHeight;
    normalized.terrain.tiles.forEach(tile => {
      if (!tile.visible) return;
      const x = tile.x * normalized.terrain.tileSize;
      const y = top + tile.y * normalized.terrain.tileSize;
      if (x >= terrainWidth || y >= height) return;
      ctx.globalAlpha = 0.18 + Math.min(0.2, Math.max(0, tile.elevation) * 0.02);
      ctx.fillStyle = materialColor(tile.material);
      ctx.fillRect(x, y - tile.elevation * 2, normalized.terrain.tileSize + 1, normalized.terrain.tileSize + 1);
      if (normalized.terrain.showCollision && tile.collision) {
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = '#f1c26d';
        ctx.fillRect(x + 2, y + 2, normalized.terrain.tileSize - 4, 3);
      }
    });
    ctx.globalAlpha = normalized.terrain.showGrid ? 0.12 : 0;
    ctx.strokeStyle = '#d8eee6';
    ctx.lineWidth = 1;
    for (let x = 0; x <= terrainWidth; x += normalized.terrain.tileSize) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = top; y <= height; y += normalized.terrain.tileSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(terrainWidth, y); ctx.stroke(); }
  }

  if (sample.fogOpacity > 0) {
    const fog = ctx.createLinearGradient(0, height * 0.42, 0, height);
    fog.addColorStop(0, `${sample.tint}00`);
    fog.addColorStop(1, `${sample.tint}${Math.round(sample.fogOpacity * 70).toString(16).padStart(2, '0')}`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = fog;
    ctx.fillRect(0, height * 0.35, width, height * 0.65);
  }

  if (sample.particleCount > 0) {
    const count = Math.min(180, sample.particleCount);
    ctx.globalAlpha = normalized.settings.weather === 'snow' ? 0.48 : 0.26;
    ctx.strokeStyle = sample.tint;
    ctx.fillStyle = sample.tint;
    for (let index = 0; index < count; index += 1) {
      const seed = normalized.effects.seed + index * 17 + Math.floor(frame);
      const x = hash(seed) * width;
      const y = hash(seed + 3) * height;
      if (normalized.settings.weather === 'rain' || normalized.effects.rain) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 8); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(x, y, normalized.settings.weather === 'snow' ? 1.6 : 1, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  if (normalized.effects.vignette > 0) {
    const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.72);
    vignette.addColorStop(0, '#00000000');
    vignette.addColorStop(1, `#07131a${Math.round(normalized.effects.vignette * 110).toString(16).padStart(2, '0')}`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}
