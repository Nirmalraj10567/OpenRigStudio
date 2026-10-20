import { Camera, Crosshair, Focus, SunMedium } from 'lucide-react';
import type { EnvironmentSettings, EnvironmentTerrain } from './environmentData';

export function CameraPreview({ settings, terrain, cameraLabel, onActivate }: { settings: EnvironmentSettings; terrain: EnvironmentTerrain; cameraLabel: string; onActivate: () => void }) {
  const height = terrain.tiles.find(tile => tile.id === terrain.activeTileId)?.elevation ?? 0;
  return <section className="camera-preview-card" aria-label="Environment camera preview">
    <div className="camera-preview-heading"><span><Camera size={13} /> Camera preview</span><button onClick={onActivate}><Focus size={12} /> Edit camera</button></div>
    <div className={`camera-preview-scene camera-preview-${settings.timeOfDay}`} style={{ '--preview-sky': settings.skyColor, '--preview-horizon': settings.horizonColor, '--preview-sun': settings.sunColor } as React.CSSProperties}>
      <span className="camera-preview-sun"><SunMedium size={17} /></span>
      <span className="camera-preview-cloud cloud-a" />
      <span className="camera-preview-cloud cloud-b" />
      <span className="camera-preview-horizon" />
      <span className="camera-preview-ridge ridge-back" />
      <span className="camera-preview-ridge ridge-front" />
      <span className="camera-preview-tree tree-left" /><span className="camera-preview-tree tree-right" />
      <span className="camera-preview-camera-frame"><Crosshair size={12} /><small>{cameraLabel}</small></span>
      <span className="camera-preview-height">Tile height {height > 0 ? '+' : ''}{height}m</span>
    </div>
    <div className="camera-preview-meta"><span>{settings.biome}</span><strong>{settings.weather}</strong><span>{Math.round(settings.sunIntensity * 100)}% sun</span></div>
  </section>;
}
