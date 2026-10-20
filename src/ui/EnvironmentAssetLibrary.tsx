import { CloudSun, Map, Mountain, Sparkles, TreePine } from 'lucide-react';
import type { EnvironmentAssetDefinition } from './environmentData';
import { ENVIRONMENT_ASSETS } from './environmentData';

const ASSET_ICONS = {
  biome: TreePine,
  terrain: Mountain,
  set: Map,
} as const;

export function EnvironmentAssetLibrary({ onAddAsset, onOpenStore }: { onAddAsset: (asset: EnvironmentAssetDefinition) => void; onOpenStore: () => void }) {
  return <section className="environment-panel environment-asset-library" aria-label="Environment asset library">
    <div className="environment-panel-heading"><span><Sparkles size={14} /> Environment assets</span><small>LOCAL</small></div>
    <p className="environment-panel-lede">Drop in a biome, terrain tile, or set dressing layer. The shared stage stays editable.</p>
    <button className="environment-store-button" onClick={onOpenStore}><CloudSun size={14} /><span>Open Asset Store</span><small>Props + backdrops</small></button>
    <div className="environment-asset-grid">
      {ENVIRONMENT_ASSETS.map(asset => {
        const Icon = ASSET_ICONS[asset.kind];
        return <button
          className="environment-asset-card"
          key={asset.id}
          onClick={() => onAddAsset(asset)}
          style={{ '--environment-asset-accent': asset.accent, '--environment-asset-sky': asset.colors[0], '--environment-asset-ground': asset.colors[1] } as React.CSSProperties}
        >
          <span className="environment-asset-art" aria-hidden="true"><i /><b /><em /></span>
          <span className="environment-asset-card-icon"><Icon size={14} /></span>
          <strong>{asset.name}</strong>
          <small>{asset.subtitle}</small>
          <em>Add to workspace</em>
        </button>;
      })}
    </div>
    <p className="environment-panel-footnote">Environment-specific engine fields are optional. Missing fields use the local blocking defaults shown here.</p>
  </section>;
}
