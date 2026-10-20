import { MapPinned, MousePointer2 } from 'lucide-react';
import type { EnvironmentTerrain } from './environmentData';

export function EnvironmentMiniMap({ terrain, onSelectTile }: { terrain: EnvironmentTerrain; onSelectTile: (id: string) => void }) {
  return <section className="environment-minimap-card" aria-label="Environment mini map">
    <div className="environment-minimap-heading"><span><MapPinned size={13} /> World map</span><small>{terrain.gridWidth} × {terrain.gridHeight}</small></div>
    <div className="environment-minimap" style={{ '--minimap-columns': Math.max(1, Math.min(8, terrain.gridWidth)) } as React.CSSProperties}>
      {terrain.tiles.map(tile => <button key={tile.id} className={`minimap-tile ${tile.id === terrain.activeTileId ? 'active' : ''} ${tile.elevation > 0 ? 'raised' : ''}`} onClick={() => onSelectTile(tile.id)} aria-label={`Focus ${tile.name}`} aria-pressed={tile.id === terrain.activeTileId}><span /></button>)}
      <span className="minimap-camera-marker"><MousePointer2 size={10} /></span>
    </div>
    <div className="environment-minimap-footer"><span><i className="minimap-legend-active" /> Active tile</span><span><i className="minimap-legend-height" /> Raised</span></div>
  </section>;
}
