import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, Heart, Layers3, Search, Shirt, Sparkles, UserRound, X } from 'lucide-react';
import { addStudioCharacter, applyCharacterDesignToGroup, characterGroupForSelection } from '../engine/characterStudio';
import { addDesignedProp, createPropRig } from '../engine/propsToolkit';
import { Rig } from '../engine/Rig';
import { projectToSVG } from '../engine/export';
import { useProject } from '../state/projectStore';
import { CharacterPreview } from './CharacterStudioPanel';
import { ASSET_CATALOG, catalogMatches } from './assetCatalog';
import type { AssetCatalogItem, AssetCategory } from './assetCatalog';

type StoreCategory = AssetCategory | 'all';

const NAV_ITEMS: Array<{ id: StoreCategory; label: string; icon: string }> = [
  { id: 'all', label: 'Home', icon: '⌂' },
  { id: 'characters', label: 'Characters', icon: '●' },
  { id: 'clothing', label: 'Clothing', icon: '◈' },
  { id: 'props', label: 'Props', icon: '◆' },
  { id: 'backgrounds', label: 'Backgrounds', icon: '▧' },
  { id: 'animations', label: 'Animations', icon: '▶' },
  { id: 'templates', label: 'Templates', icon: '▦' },
  { id: 'favorites', label: 'Favorites', icon: '♥' },
  { id: 'my-assets', label: 'My Assets', icon: '♙' },
];

const CATEGORY_CHIPS: Array<{ id: StoreCategory; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'characters', label: 'Characters' }, { id: 'clothing', label: 'Clothing' },
  { id: 'outfits', label: 'Outfits' }, { id: 'props', label: 'Props' }, { id: 'shoes', label: 'Shoes' }, { id: 'accessories', label: 'Accessories' },
];

function nativePropPreview(item: AssetCatalogItem): string | null {
  if (!item.propDesign) return null;
  try {
    const rig = createPropRig({ ...item.propDesign, physics: 'none' });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(projectToSVG(rig, false).replace('viewBox="0 0 800 520"', 'viewBox="100 0 600 510"'))}`;
  } catch {
    return null;
  }
}

function AssetThumb({ item, large = false }: { item: AssetCatalogItem; large?: boolean }) {
  const propSrc = useMemo(() => nativePropPreview(item), [item]);
  if (item.propDesign && propSrc) return <img className="asset-store-native-thumb" src={propSrc} alt="" />;
  if (item.design) return <div className={`asset-store-character-thumb ${large ? 'large' : ''}`}><CharacterPreview design={item.design} /></div>;
  return <div className="asset-store-background-thumb" style={{ background: item.backgroundColor ?? '#263b50' }}><Layers3 size={large ? 35 : 22} /></div>;
}

function readFavorites(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem('asset-store-favorites:v1') ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : [];
  } catch { return []; }
}

export function AssetStorePanel({ onClose, onStatus, onEnvironmentAssetAdded }: { onClose: () => void; onStatus: (message: string) => void; onEnvironmentAssetAdded?: (asset: AssetCatalogItem) => void }) {
  const { rig, selectedId: sceneSelectedId, pause, updateProject, select } = useProject();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<StoreCategory>('all');
  const [selectedAssetId, setSelectedAssetId] = useState(ASSET_CATALOG[4]?.id ?? ASSET_CATALOG[0].id);
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  const [applyMode, setApplyMode] = useState<'replace' | 'add'>('replace');
  const selectedAsset = ASSET_CATALOG.find(item => item.id === selectedAssetId) ?? ASSET_CATALOG[0];
  const targetGroup = characterGroupForSelection(rig, sceneSelectedId);
  const filtered = useMemo(() => ASSET_CATALOG.filter(item => {
    if (category === 'favorites' && !favorites.includes(item.id)) return false;
    if (category === 'my-assets' && !item.categories.includes('templates')) return false;
    return catalogMatches(item, query, category === 'favorites' || category === 'my-assets' ? 'all' : category);
  }), [category, favorites, query]);
  const variations = selectedAsset.variationGroup ? ASSET_CATALOG.filter(item => item.variationGroup === selectedAsset.variationGroup) : [];

  const toggleFavorite = (id: string) => {
    setFavorites(previous => {
      const next = previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id];
      try { window.localStorage.setItem('asset-store-favorites:v1', JSON.stringify(next)); } catch { /* optional preference */ }
      return next;
    });
  };

  const downloadSelectedAsset = () => {
    let payload: string;
    if (selectedAsset.propDesign) {
      payload = createPropRig({ ...selectedAsset.propDesign, physics: 'none' }).toJSON(true);
    } else if (selectedAsset.design) {
      const rig = new Rig();
      rig.name = selectedAsset.title;
      addStudioCharacter(rig, selectedAsset.design);
      payload = rig.toJSON(true);
    } else {
      payload = JSON.stringify({ assetId: selectedAsset.id, title: selectedAsset.title, description: selectedAsset.description, tags: selectedAsset.tags }, null, 2);
    }
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${selectedAsset.id}.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    onStatus(`${selectedAsset.title} downloaded as an editable asset JSON`);
  };

  const applySelected = () => {
    if (selectedAsset.applyMode === 'preview') {
      onStatus(`${selectedAsset.title} is a compatible reference asset · choose a target rig to apply animation data`);
      return;
    }
    pause();
    let result = '';
    let nextSelection: string | null = null;
    try {
      updateProject(project => {
        const groupId = characterGroupForSelection(project, sceneSelectedId);
        if ((selectedAsset.applyMode === 'character' || selectedAsset.applyMode === 'clothing') && selectedAsset.design) {
          if (groupId && applyMode === 'replace') {
            const applied = applyCharacterDesignToGroup(project, groupId, selectedAsset.design, selectedAsset.slot ?? 'full');
            result = applied ? `${selectedAsset.title} applied to the selected character · existing bones and animation preserved` : 'The selected character could not accept this asset';
          } else {
            const added = addStudioCharacter(project, selectedAsset.design);
            if (added) { result = `${selectedAsset.title} added as a new editable character`; nextSelection = added.groupId; }
          }
        } else if (selectedAsset.applyMode === 'prop' && selectedAsset.propDesign) {
          const added = addDesignedProp(project, selectedAsset.propDesign, { x: 590, y: 420 });
          result = `${selectedAsset.title} added with ${added.layerIds.length} editable layers and prepared views`;
          nextSelection = added.groupId;
        } else if (selectedAsset.applyMode === 'background') {
          const id = project.addVectorLayer(selectedAsset.title, [{ id: `background-${selectedAsset.id}`, kind: 'rect', x: 0, y: 0, width: 800, height: 520, fill: selectedAsset.backgroundColor ?? '#203a3a', stroke: 'none', opacity: 1 }]);
          const layer = project.layers.get(id);
          if (layer) layer.zIndex = Math.min(-100, ...[...project.layers.values()].map(candidate => candidate.zIndex));
          result = `${selectedAsset.title} added as an editable background layer`;
          nextSelection = id;
        }
      });
    } catch (error) {
      onStatus(error instanceof Error ? error.message : `${selectedAsset.title} could not be applied`);
      return;
    }
    if (nextSelection) select(nextSelection);
    if (selectedAsset.applyMode === 'prop' || selectedAsset.applyMode === 'background') onEnvironmentAssetAdded?.(selectedAsset);
    onStatus(result || `${selectedAsset.title} is ready to preview`);
  };

  const countFor = (id: StoreCategory) => id === 'all' ? ASSET_CATALOG.length : id === 'favorites' ? favorites.length : ASSET_CATALOG.filter(item => item.categories.includes(id as AssetCategory)).length;

  return <div className="asset-store-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="asset-store-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-store-title">
      <header className="asset-store-header">
        <div className="asset-store-brand"><span className="asset-store-brand-icon"><Sparkles size={20} /></span><div><span className="asset-store-eyebrow">CONTENT MANAGER / LOCAL ASSETS</span><h1 id="asset-store-title">Asset Store</h1><p>Browse reusable artwork that stays editable on your rig.</p></div></div>
        <div className="asset-store-header-actions"><span className="asset-store-local-badge"><span /> Local catalog</span><button aria-label="Close Asset Store" onClick={onClose}><X size={18} /></button></div>
      </header>
      <div className="asset-store-body">
        <aside className="asset-store-nav" aria-label="Asset Store categories">
          <label className="asset-store-search"><Search size={15} /><input aria-label="Search assets" placeholder="Search assets..." value={query} onChange={event => setQuery(event.target.value)} /></label>
          <nav>{NAV_ITEMS.map(item => <button key={item.id} className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)}><span className="asset-store-nav-icon">{item.icon}</span><span>{item.label}</span><small>{countFor(item.id)}</small></button>)}</nav>
          <div className="asset-store-nav-heading">CATEGORIES</div>
          {['male', 'female', 'kid', 'casual', 'formal', 'uniform', 'modern', 'traditional'].map(tag => <button key={tag} className="asset-store-tag" onClick={() => setQuery(tag)}><span>{tag === 'male' ? '♟' : tag === 'female' ? '♙' : tag === 'kid' ? '♣' : '◆'}</span>{tag[0].toUpperCase() + tag.slice(1)}</button>)}
          <div className="asset-store-nav-footer"><span><Download size={14} /> Imported assets</span><small>Use Open or Import for project files.</small></div>
        </aside>
        <main className="asset-store-main">
          <div className="asset-store-main-toolbar"><div><span className="asset-store-eyebrow">BROWSE ASSETS</span><h2>{category === 'all' ? 'All assets' : NAV_ITEMS.find(item => item.id === category)?.label ?? category}</h2></div><span className="asset-store-result-count">{filtered.length} assets</span></div>
          <div className="asset-store-chips" role="tablist" aria-label="Asset types">{CATEGORY_CHIPS.map(chip => <button key={chip.id} role="tab" aria-selected={category === chip.id} onClick={() => setCategory(chip.id)}>{chip.label}</button>)}</div>
          <div className="asset-store-grid" aria-label="Asset thumbnails">{filtered.map(item => <button key={item.id} className={`asset-store-card ${selectedAsset.id === item.id ? 'selected' : ''}`} onClick={() => setSelectedAssetId(item.id)}><div className="asset-store-card-thumb"><AssetThumb item={item} />{favorites.includes(item.id) && <span className="asset-store-favorite-mark">♥</span>}</div><strong>{item.title}</strong><small>{item.subtitle}</small><span className="asset-store-card-meta">{item.rigReady ? 'Rig ready' : 'Editable layer'} · {item.layers || '—'} layers</span></button>)}</div>
          {!filtered.length && <div className="asset-store-empty"><Search size={24} /><strong>No assets found</strong><p>Try another search or browse the local templates.</p><button onClick={() => { setQuery(''); setCategory('all'); }}>Clear filters</button></div>}
        </main>
        <aside className="asset-store-detail" aria-label="Asset details">
          <div className="asset-store-preview-heading"><span className="asset-store-eyebrow">PREVIEW IN VIEWPORT</span><div><h2>{selectedAsset.title}</h2><button aria-label="Favorite selected asset" className={favorites.includes(selectedAsset.id) ? 'favorite active' : 'favorite'} onClick={() => toggleFavorite(selectedAsset.id)}><Heart size={16} fill={favorites.includes(selectedAsset.id) ? 'currentColor' : 'none'} /></button></div></div>
          <div className="asset-store-preview"><AssetThumb item={selectedAsset} large /></div>
          <div className="asset-store-detail-scroll"><p className="asset-store-description">{selectedAsset.description}</p><div className="asset-store-tags">{selectedAsset.tags.slice(0, 6).map(tag => <span key={tag}>{tag}</span>)}</div><dl className="asset-store-specs"><div><dt>Files</dt><dd>{selectedAsset.format}</dd></div><div><dt>Layers</dt><dd>{selectedAsset.layers ? `${selectedAsset.layers} layers (editable)` : 'Timeline data'}</dd></div><div><dt>Rig Ready</dt><dd>{selectedAsset.rigReady ? 'Yes' : 'Layer only'}</dd></div><div><dt>License</dt><dd>{selectedAsset.license}</dd></div></dl><button className="asset-store-download-button" onClick={downloadSelectedAsset}><Download size={14} /> Download editable JSON</button><section className="asset-store-variations"><div className="asset-store-detail-heading"><strong>Color Variations</strong><small>Choose a color or style</small></div><div className="asset-store-color-row">{selectedAsset.colors.map(color => <span key={color} style={{ background: color }} />)}</div>{variations.length > 1 && <div className="asset-store-alternatives"><button aria-label="Previous variation" onClick={() => { const index = variations.findIndex(item => item.id === selectedAsset.id); setSelectedAssetId(variations[(index - 1 + variations.length) % variations.length].id); }}><ChevronLeft size={15} /></button>{variations.map(item => <button key={item.id} className={item.id === selectedAsset.id ? 'active' : ''} onClick={() => setSelectedAssetId(item.id)}><AssetThumb item={item} /></button>)}<button aria-label="Next variation" onClick={() => { const index = variations.findIndex(item => item.id === selectedAsset.id); setSelectedAssetId(variations[(index + 1) % variations.length].id); }}><ChevronRight size={15} /></button></div>}</section></div>
          <div className="asset-store-apply"><div className="asset-store-detail-heading"><strong>Apply to Character</strong><small>{targetGroup ? 'Selected character detected' : 'No character group selected'}</small></div>{(selectedAsset.applyMode === 'character' || selectedAsset.applyMode === 'clothing') && <div className="asset-store-apply-mode"><button aria-pressed={applyMode === 'replace'} onClick={() => setApplyMode('replace')}>Replace slot</button><button aria-pressed={applyMode === 'add'} onClick={() => setApplyMode('add')}>Add new</button></div>}<button className="asset-store-apply-button" onClick={applySelected}><Shirt size={16} /> {selectedAsset.applyMode === 'prop' ? 'Add to Scene' : selectedAsset.applyMode === 'background' ? 'Add Background' : selectedAsset.applyMode === 'preview' ? 'Preview Compatibility' : 'Apply to Character'}</button><p>Preserves existing bones, animation channels, and unrelated outfit layers.</p></div>
        </aside>
      </div>
      <footer className="asset-store-footer"><span><Check size={14} /> Native editable assets · no flattened downloads</span><span>Selected: <strong>{selectedAsset.title}</strong></span></footer>
    </section>
  </div>;
}
