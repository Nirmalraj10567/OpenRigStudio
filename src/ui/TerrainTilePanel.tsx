import { Grid3X3, Mountain } from 'lucide-react';
import type { EnvironmentTerrain, TerrainTile } from './environmentData';

export function TerrainTilePanel({ terrain, onChange }: { terrain: EnvironmentTerrain; onChange: (patch: Partial<EnvironmentTerrain>) => void }) {
  const activeTile = terrain.tiles.find(tile => tile.id === terrain.activeTileId) ?? terrain.tiles[0];
  const updateTile = (patch: Partial<TerrainTile>) => {
    if (!activeTile) return;
    onChange({ tiles: terrain.tiles.map(tile => tile.id === activeTile.id ? { ...tile, ...patch } : tile) });
  };
  return <section className="environment-panel terrain-tile-panel" aria-label="Terrain tiles">
    <div className="environment-panel-heading"><span><Mountain size={14} /> Terrain tiles</span><small>{terrain.tiles.length} TILES</small></div>
    <div className="terrain-panel-toolbar"><label className="environment-check"><input type="checkbox" checked={terrain.enabled} onChange={event => onChange({ enabled: event.target.checked })} /><span><strong>Terrain enabled</strong><small>Use tile height for blocking</small></span></label><span className="terrain-size-badge"><Grid3X3 size={11} /> {terrain.tileSize}px</span></div>
    <div className="terrain-tile-grid" style={{ '--terrain-columns': Math.max(1, Math.min(8, terrain.gridWidth)) } as React.CSSProperties}>
      {terrain.tiles.map(tile => <button key={tile.id} className={`terrain-tile ${tile.id === terrain.activeTileId ? 'active' : ''} ${tile.elevation > 0 ? 'raised' : ''}`} onClick={() => onChange({ activeTileId: tile.id })} aria-label={`${tile.name}, elevation ${tile.elevation}`} aria-pressed={tile.id === terrain.activeTileId}><span>{tile.name.replace('Tile ', '')}</span>{tile.elevation !== 0 && <small>{tile.elevation > 0 ? '+' : ''}{tile.elevation}</small>}</button>)}
    </div>
    {activeTile && <div className="terrain-active-tile">
      <div className="environment-subheading"><Grid3X3 size={12} /> Selected tile <small>{activeTile.name}</small></div>
      <div className="environment-field-grid">
        <label className="environment-field"><span>Material</span><select value={activeTile.material} onChange={event => updateTile({ material: event.target.value })}><option value="grass">Grass</option><option value="path">Path</option><option value="rock">Rock</option><option value="sand">Sand</option><option value="snow">Snow</option><option value="water">Water</option><option value="dirt">Dirt</option></select></label>
        <label className="environment-field"><span>Elevation</span><div className="environment-input-suffix"><input type="number" min="-20" max="20" value={activeTile.elevation} onChange={event => updateTile({ elevation: Number(event.target.value) })} /><em>m</em></div></label>
      </div>
      <label className="environment-check terrain-collision-toggle"><input type="checkbox" checked={Boolean(activeTile.collision)} onChange={event => updateTile({ collision: event.target.checked })} /><span><strong>Collision surface</strong><small>Characters and props can stand on this tile</small></span></label>
    </div>}
    <p className="environment-panel-footnote">Tile selection, elevation, material, collision, grid and auto-tile changes are persisted with the environment project.</p>
  </section>;
}
