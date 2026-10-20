export type EnvironmentTimeOfDay = 'dawn' | 'day' | 'golden-hour' | 'night';
export type EnvironmentWeather = 'clear' | 'cloudy' | 'rain' | 'mist' | 'snow';
export type EnvironmentLayerKind = 'sky' | 'terrain' | 'vegetation' | 'props' | 'effects' | 'characters';
export type EnvironmentAssetKind = 'biome' | 'terrain' | 'set';

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
  gridSize: number;
  snapToTerrain: boolean;
}

export interface TerrainTile {
  id: string;
  name: string;
  x: number;
  y: number;
  elevation: number;
  material: string;
  visible: boolean;
  collision?: boolean;
}

export interface EnvironmentTerrain {
  enabled: boolean;
  tileSize: number;
  gridWidth: number;
  gridHeight: number;
  activeTileId: string;
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
  colorGrade: 'neutral' | 'warm' | 'cool' | 'noir';
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

export interface EnvironmentSnapshot {
  settings: EnvironmentSettings;
  terrain: EnvironmentTerrain;
  effects: EnvironmentEffects;
  layers: EnvironmentLayer[];
  assetIds: string[];
  source: 'runtime' | 'local';
  hasRuntimeData: boolean;
}

export interface EnvironmentPatch {
  settings?: Partial<EnvironmentSettings>;
  terrain?: Partial<EnvironmentTerrain>;
  effects?: Partial<EnvironmentEffects>;
  layers?: EnvironmentLayer[];
  assetIds?: string[];
}

export interface EnvironmentAssetDefinition {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  kind: EnvironmentAssetKind;
  layerKind: EnvironmentLayerKind;
  biome: string;
  accent: string;
  colors: [string, string, string];
}

export const ENVIRONMENT_ASSETS: EnvironmentAssetDefinition[] = [
  {
    id: 'environment-forest-clearing',
    name: 'Forest clearing',
    subtitle: 'Temperate biome starter',
    description: 'A layered forest floor with a soft horizon, tree line, and a clear blocking area for characters.',
    kind: 'biome',
    layerKind: 'vegetation',
    biome: 'Temperate forest',
    accent: '#74c5a5',
    colors: ['#173b38', '#2d6b55', '#b7d99a'],
  },
  {
    id: 'environment-coastal-dusk',
    name: 'Coastal dusk',
    subtitle: 'Ocean + evening light',
    description: 'A wide coastal composition for camera blocking, with a low sun and a cool reflective horizon.',
    kind: 'biome',
    layerKind: 'terrain',
    biome: 'Coastal',
    accent: '#7dbad0',
    colors: ['#182b46', '#326b80', '#e6b77b'],
  },
  {
    id: 'environment-urban-block',
    name: 'Urban block',
    subtitle: 'Street set dressing',
    description: 'A compact city block with a street plane, skyline depth, and prop-safe staging zones.',
    kind: 'set',
    layerKind: 'props',
    biome: 'Urban',
    accent: '#d5a86d',
    colors: ['#202837', '#4e6071', '#cf9d67'],
  },
  {
    id: 'environment-hillside-tile',
    name: 'Hillside tile',
    subtitle: 'Terrain tile + elevation',
    description: 'A reusable terrain tile that demonstrates elevation-aware blocking and a small foreground slope.',
    kind: 'terrain',
    layerKind: 'terrain',
    biome: 'Hillside',
    accent: '#b9c676',
    colors: ['#28382f', '#587553', '#c9d68b'],
  },
];

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
};

const DEFAULT_LAYER_DEFINITIONS: Array<Pick<EnvironmentLayer, 'id' | 'name' | 'kind' | 'accent'>> = [
  { id: 'environment-sky', name: 'Sky & atmosphere', kind: 'sky', accent: '#7eb5d3' },
  { id: 'environment-terrain', name: 'Terrain tiles', kind: 'terrain', accent: '#b9c676' },
  { id: 'environment-vegetation', name: 'Vegetation', kind: 'vegetation', accent: '#74c5a5' },
  { id: 'environment-props', name: 'Props & set dressing', kind: 'props', accent: '#d5a86d' },
  { id: 'environment-effects', name: 'Atmosphere effects', kind: 'effects', accent: '#b9a8df' },
  { id: 'environment-characters', name: 'Characters', kind: 'characters', accent: '#e6a5a0' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function colorValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 48) return fallback;
  return value;
}

function numberValue(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function cloneValue<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function collectionSize(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value instanceof Map || value instanceof Set) return value.size;
  const object = record(value);
  return typeof object?.size === 'number' ? object.size : 0;
}

function defaultTiles(): TerrainTile[] {
  return Array.from({ length: 12 }, (_, index) => {
    const x = index % 4;
    const y = Math.floor(index / 4);
    return {
      id: `terrain-${x}-${y}`,
      name: `Tile ${String.fromCharCode(65 + x)}${y + 1}`,
      x,
      y,
      elevation: x === 1 && y === 1 ? 2 : x === 2 && y === 0 ? 1 : 0,
      material: x === 0 && y === 2 ? 'path' : 'grass',
      visible: true,
    };
  });
}

function normalizeTiles(value: unknown): TerrainTile[] {
  if (!Array.isArray(value)) return defaultTiles();
  const tiles = value.flatMap((entry, index) => {
    const source = record(entry);
    if (!source) return [];
    const x = Math.max(0, Math.round(numberValue(source.x, index % 4, 0, 64)));
    const y = Math.max(0, Math.round(numberValue(source.y, Math.floor(index / 4), 0, 64)));
    return [{
      id: stringValue(source.id, `terrain-${x}-${y}`),
      name: stringValue(source.name, `Tile ${String.fromCharCode(65 + x)}${y + 1}`),
      x,
      y,
      elevation: numberValue(source.elevation ?? source.height, 0, -20, 20),
      material: stringValue(source.material ?? source.type, 'grass'),
      visible: booleanValue(source.visible, true),
    }];
  });
  return tiles.length ? tiles : defaultTiles();
}

function normalizeLayer(entry: unknown, index: number): EnvironmentLayer | null {
  const source = record(entry);
  if (!source) return null;
  const kind = enumValue(source.kind ?? source.type, ['sky', 'terrain', 'vegetation', 'props', 'effects', 'characters'] as const, 'props');
  return {
    id: stringValue(source.id, `environment-layer-${index + 1}`),
    name: stringValue(source.name ?? source.label, `Environment layer ${index + 1}`),
    kind,
    visible: booleanValue(source.visible, true),
    locked: booleanValue(source.locked, false),
    opacity: numberValue(source.opacity, 1, 0, 1),
    count: Math.round(numberValue(source.count ?? source.items, 0, 0, 999)),
    accent: colorValue(source.accent ?? source.color, DEFAULT_LAYER_DEFINITIONS[index % DEFAULT_LAYER_DEFINITIONS.length].accent),
  };
}

function defaultLayers(rig: unknown): EnvironmentLayer[] {
  const root = record(rig);
  const sceneCount = collectionSize(root?.layersInOrder) || collectionSize(root?.layers);
  const boneCount = collectionSize(root?.bones);
  return DEFAULT_LAYER_DEFINITIONS.map((definition) => ({
    ...definition,
    visible: true,
    locked: false,
    opacity: 1,
    count: definition.kind === 'characters' ? (sceneCount ? 1 : 0) : definition.kind === 'props' ? Math.max(0, sceneCount - 1) : definition.kind === 'terrain' ? 12 : definition.kind === 'effects' ? 0 : definition.kind === 'vegetation' ? 0 : boneCount ? 1 : 0,
  }));
}

function readSettings(root: Record<string, unknown>, environment: Record<string, unknown> | undefined): EnvironmentSettings {
  const source = record(environment?.settings) ?? record(root.settings) ?? environment ?? {};
  const lighting = record(source.lighting) ?? record(environment?.lighting) ?? {};
  return {
    name: stringValue(source.name ?? source.title ?? environment?.name ?? root.name, DEFAULT_SETTINGS.name),
    biome: stringValue(source.biome ?? source.biomeId ?? environment?.biome, DEFAULT_SETTINGS.biome),
    timeOfDay: enumValue(String(source.timeOfDay ?? source.time ?? '').toLowerCase().replace(/\s+/g, '-'), ['dawn', 'day', 'golden-hour', 'night'] as const, DEFAULT_SETTINGS.timeOfDay),
    weather: enumValue(String(source.weather ?? '').toLowerCase(), ['clear', 'cloudy', 'rain', 'mist', 'snow'] as const, DEFAULT_SETTINGS.weather),
    exposure: numberValue(source.exposure, DEFAULT_SETTINGS.exposure, -4, 4),
    fogDensity: numberValue(source.fogDensity ?? record(source.fog)?.density, DEFAULT_SETTINGS.fogDensity, 0, 1),
    ambientIntensity: numberValue(source.ambientIntensity ?? lighting.ambient, DEFAULT_SETTINGS.ambientIntensity, 0, 2),
    horizonColor: colorValue(source.horizonColor ?? source.horizon, DEFAULT_SETTINGS.horizonColor),
    skyColor: colorValue(source.skyColor ?? source.sky, DEFAULT_SETTINGS.skyColor),
    sunColor: colorValue(source.sunColor ?? lighting.color, DEFAULT_SETTINGS.sunColor),
    sunIntensity: numberValue(source.sunIntensity ?? lighting.intensity, DEFAULT_SETTINGS.sunIntensity, 0, 8),
    gridSize: numberValue(source.gridSize ?? source.tileSize, DEFAULT_SETTINGS.gridSize, 4, 256),
    snapToTerrain: booleanValue(source.snapToTerrain ?? source.snap, DEFAULT_SETTINGS.snapToTerrain),
  };
}

function readTerrain(root: Record<string, unknown>, environment: Record<string, unknown> | undefined): EnvironmentTerrain {
  const source = record(environment?.terrain) ?? record(root.terrain) ?? {};
  const tiles = normalizeTiles(source.tiles ?? source.cells ?? source.chunks);
  const gridWidth = Math.max(1, Math.round(numberValue(source.gridWidth ?? source.width, 4, 1, 64)));
  const gridHeight = Math.max(1, Math.round(numberValue(source.gridHeight ?? source.height, 3, 1, 64)));
  const activeTileId = stringValue(source.activeTileId ?? source.selectedTileId, tiles[0]?.id ?? 'terrain-0-0');
  return {
    enabled: booleanValue(source.enabled, true),
    tileSize: numberValue(source.tileSize, 32, 4, 256),
    gridWidth,
    gridHeight,
    activeTileId: tiles.some(tile => tile.id === activeTileId) ? activeTileId : tiles[0]?.id ?? 'terrain-0-0',
    tiles,
  };
}

function readEffects(root: Record<string, unknown>, environment: Record<string, unknown> | undefined): EnvironmentEffects {
  const source = record(environment?.effects) ?? record(root.effects) ?? {};
  return {
    fog: booleanValue(source.fog ?? source.fogEnabled, DEFAULT_EFFECTS.fog),
    fogDensity: numberValue(source.fogDensity ?? record(source.fog)?.density, DEFAULT_EFFECTS.fogDensity, 0, 1),
    bloom: numberValue(source.bloom ?? source.bloomStrength, DEFAULT_EFFECTS.bloom, 0, 1),
    rain: booleanValue(source.rain ?? source.rainEnabled, DEFAULT_EFFECTS.rain),
    dust: booleanValue(source.dust ?? source.dustEnabled, DEFAULT_EFFECTS.dust),
    wind: numberValue(source.wind ?? source.windStrength, DEFAULT_EFFECTS.wind, 0, 1),
    vignette: numberValue(source.vignette, DEFAULT_EFFECTS.vignette, 0, 1),
    colorGrade: enumValue(source.colorGrade ?? source.grade, ['neutral', 'warm', 'cool', 'noir'] as const, DEFAULT_EFFECTS.colorGrade),
  };
}

export function readEnvironment(rig: unknown): EnvironmentSnapshot {
  const root = record(rig) ?? {};
  const rootSettings = record(root.settings);
  const environment = record(root.environment) ?? record(root.world);
  const rawLayers = environment?.layers ?? environment?.layerStack ?? root.environmentLayers;
  const layers = Array.isArray(rawLayers) ? rawLayers.map(normalizeLayer).filter((layer): layer is EnvironmentLayer => Boolean(layer)) : [];
  const environmentAssets = environment?.assets ?? environment?.assetIds ?? root.environmentAssets;
  const assetIds = Array.isArray(environmentAssets)
    ? environmentAssets.flatMap(value => typeof value === 'string' ? [value] : isRecord(value) && typeof value.id === 'string' ? [value.id] : [])
    : [];
  const hasRuntimeData = Boolean(environment || root.terrain || root.environmentSettings || root.environmentLayers || rootSettings);
  return {
    settings: readSettings(root, environment),
    terrain: readTerrain(root, environment),
    effects: readEffects(root, environment),
    layers: layers.length ? layers : defaultLayers(rig),
    assetIds,
    source: hasRuntimeData ? 'runtime' : 'local',
    hasRuntimeData,
  };
}

export function writeEnvironmentPatch(target: unknown, patch: EnvironmentPatch): boolean {
  const root = record(target);
  if (!root) return false;
  const environmentOwner = root as {
    environment?: unknown;
    ensureEnvironment?: (name?: string) => unknown;
    setEnvironment?: (patch: Record<string, unknown>) => unknown;
  };
  if (environmentOwner.setEnvironment || environmentOwner.ensureEnvironment) {
    const current = environmentOwner.environment && typeof environmentOwner.environment === 'object'
      ? normalizeEnvironmentProject(environmentOwner.environment)
      : defaultEnvironmentProject(typeof root.name === 'string' ? root.name : undefined);
    const next = updateEnvironmentProject(current, patch as never);
    if (environmentOwner.setEnvironment) environmentOwner.setEnvironment(next as unknown as Record<string, unknown>);
    else environmentOwner.environment = next;
    return true;
  }
  const environment = record(root.environment);
  const destination = environment ?? root;
  if (patch.settings) destination.settings = { ...(record(destination.settings) ?? {}), ...patch.settings };
  if (patch.terrain) destination.terrain = { ...(record(destination.terrain) ?? {}), ...patch.terrain };
  if (patch.effects) destination.effects = { ...(record(destination.effects) ?? {}), ...patch.effects };
  if (patch.layers) destination.layers = cloneValue(patch.layers);
  if (patch.assetIds) destination.assetIds = [...patch.assetIds];
  return true;
}

export function attachEnvironmentPayload(target: unknown, payload: unknown): boolean {
  const root = record(target);
  const source = record(payload);
  if (!root || !source) return false;
  const incomingEnvironment = record(source.environment) ?? record(source.world);
  const environmentOwner = root as { setEnvironment?: (patch: Record<string, unknown>) => unknown };
  if (environmentOwner.setEnvironment && (incomingEnvironment || source.environmentSettings || source.environmentTerrain || source.environmentEffects)) {
    const base = incomingEnvironment || {
      settings: source.environmentSettings ?? source.settings,
      terrain: source.environmentTerrain ?? source.terrain,
      effects: source.environmentEffects ?? source.effects,
      layers: source.environmentLayers,
      assetIds: source.environmentAssets,
    };
    environmentOwner.setEnvironment(normalizeEnvironmentProject(base) as unknown as Record<string, unknown>);
    return true;
  }
  const existingEnvironment = record(root.environment);
  const incomingSettings = incomingEnvironment ? record(incomingEnvironment.settings) : undefined;
  const incomingTerrain = incomingEnvironment ? record(incomingEnvironment.terrain) : undefined;
  const incomingEffects = incomingEnvironment ? record(incomingEnvironment.effects) : undefined;
  if (incomingEnvironment) {
    root.environment = {
      ...(existingEnvironment ?? {}),
      ...cloneValue(incomingEnvironment),
      ...(incomingSettings ? { settings: { ...(record(existingEnvironment?.settings) ?? {}), ...cloneValue(incomingSettings) } } : {}),
      ...(incomingTerrain ? { terrain: { ...(record(existingEnvironment?.terrain) ?? {}), ...cloneValue(incomingTerrain) } } : {}),
      ...(incomingEffects ? { effects: { ...(record(existingEnvironment?.effects) ?? {}), ...cloneValue(incomingEffects) } } : {}),
    };
  }
  const settings = source.environmentSettings ?? (!incomingEnvironment ? source.settings : undefined);
  const terrain = source.environmentTerrain ?? (!incomingEnvironment ? source.terrain : undefined);
  if (settings && !record(root.environment)) root.settings = cloneValue(settings);
  if (terrain && !record(root.environment)) root.terrain = cloneValue(terrain);
  return Boolean(incomingEnvironment || settings || terrain);
}

export function isEnvironmentProjectPayload(payload: unknown, filename = ''): boolean {
  const source = record(payload);
  if (!source) return /environment|terrain|world/i.test(filename);
  const metadata = record(source.metadata);
  const settings = record(source.settings);
  const markerValues = [source.projectType, source.kind, source.type, source.workspace, source.environmentType, metadata?.projectType, metadata?.kind, metadata?.workspace, metadata?.environmentType];
  const marked = markerValues.some(value => typeof value === 'string' && /environment|terrain|world/i.test(value));
  const environmentSettings = Boolean(settings?.biome || settings?.biomeId || settings?.timeOfDay || settings?.skyColor || settings?.horizonColor || settings?.weather);
  return marked || environmentSettings || Boolean(source.environment || source.world || source.terrain || source.environmentSettings || source.environmentTerrain || source.environmentLayers)
    || /environment|terrain|world/i.test(filename);
}
import { defaultEnvironmentProject, normalizeEnvironmentProject, updateEnvironmentProject } from '../engine/environment';
