import { DEFAULT_CHARACTER_DESIGN, normalizeCharacterDesign } from '../engine/characterStudio';
import type { CharacterDesign } from '../engine/characterStudio';
import { DEFAULT_HOUSE_PROP, DEFAULT_TREE_PROP } from '../engine/propsToolkit';
import type { PropDesign } from '../engine/propsToolkit';

export type AssetCategory = 'characters' | 'clothing' | 'props' | 'backgrounds' | 'animations' | 'templates' | 'favorites' | 'my-assets' | 'outfits' | 'accessories' | 'hair' | 'shoes';
export type AssetApplyMode = 'character' | 'clothing' | 'prop' | 'background' | 'preview';

export interface AssetCatalogItem {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  categories: AssetCategory[];
  tags: string[];
  gender?: 'male' | 'female' | 'unisex';
  ageGroup?: 'adult' | 'teen' | 'kid';
  format: string;
  layers: number;
  rigReady: boolean;
  license: string;
  applyMode: AssetApplyMode;
  slot?: 'full' | 'head' | 'shirt' | 'pants' | 'shoes' | 'neck';
  design?: CharacterDesign;
  propDesign?: PropDesign;
  backgroundColor?: string;
  variationGroup?: string;
  colors: string[];
}

const character = (patch: Partial<CharacterDesign>): CharacterDesign => normalizeCharacterDesign({ ...DEFAULT_CHARACTER_DESIGN, ...patch });

const item = (value: Omit<AssetCatalogItem, 'format' | 'layers' | 'rigReady' | 'license' | 'colors'> & Partial<Pick<AssetCatalogItem, 'format' | 'layers' | 'rigReady' | 'license' | 'colors'>>): AssetCatalogItem => ({
  format: 'SVG, native JSON', layers: 6, rigReady: true, license: 'Free for personal & commercial use', colors: ['#5792cc', '#d95c5c', '#6fbf73'], ...value,
});

export const ASSET_CATALOG: AssetCatalogItem[] = [
  item({ id: 'character-studio-male', title: 'Studio Character · Male', subtitle: 'Full editable character', description: 'Native vector character with head, body, clothing, shoes, skeleton, and prepared rig attachment points.', categories: ['characters', 'templates'], tags: ['male', 'adult', 'modern', 'rig-ready'], gender: 'male', ageGroup: 'adult', applyMode: 'character', slot: 'full', design: character({ gender: 'male', shirt: 'tee', shirtColor: '#5792cc' }), layers: 18, variationGroup: 'studio-character', colors: ['#5792cc', '#d95c5c', '#665da8'] }),
  item({ id: 'character-studio-female', title: 'Studio Character · Female', subtitle: 'Full editable character', description: 'Native vector character with a complete editable body, outfit, shoes, bones, and rig-compatible part layers.', categories: ['characters', 'templates'], tags: ['female', 'adult', 'casual', 'rig-ready'], gender: 'female', ageGroup: 'adult', applyMode: 'character', slot: 'full', design: character({ gender: 'female', shirt: 'blouse', shirtColor: '#e58b4a' }), layers: 18, variationGroup: 'studio-character', colors: ['#e58b4a', '#5792cc', '#d95c5c'] }),
  item({ id: 'outfit-street', title: 'Street Ready Outfit', subtitle: 'Hoodie + joggers + sneakers', description: 'A coordinated outfit that replaces the upper, lower, and shoe slots while keeping the selected character rig intact.', categories: ['outfits', 'clothing', 'templates'], tags: ['unisex', 'casual', 'street', 'modern'], gender: 'unisex', ageGroup: 'adult', applyMode: 'clothing', slot: 'full', design: character({ shirt: 'hoodie', shirtColor: '#d95c5c', pants: 'joggers', pantsColor: '#303c3b', shoes: 'sneakers', shoesColor: '#1e252d' }), layers: 9, variationGroup: 'street-outfit', colors: ['#d95c5c', '#5792cc', '#69b6a5'] }),
  item({ id: 'outfit-formal', title: 'Full Suit', subtitle: 'Jacket + trousers + loafers', description: 'Tailored outfit layers designed for a rigged character and preserved animation channels.', categories: ['outfits', 'clothing', 'templates'], tags: ['unisex', 'formal', 'uniform', 'modern'], gender: 'unisex', ageGroup: 'adult', applyMode: 'clothing', slot: 'full', design: character({ shirt: 'jacket', shirtColor: '#665da8', pants: 'straight', pantsColor: '#26394f', shoes: 'loafers', shoesColor: '#c38a4d' }), layers: 9, variationGroup: 'formal-outfit', colors: ['#665da8', '#26394f', '#303c3b'] }),
  item({ id: 'shirt-casual-jacket-red', title: 'Casual Jacket (Red)', subtitle: 'Layered upper clothing', description: 'Editable jacket shapes with sleeve, collar, and button details. Applies to the shirt slot of an existing character.', categories: ['clothing', 'templates'], tags: ['shirt', 'jacket', 'casual', 'layered', 'male'], gender: 'unisex', ageGroup: 'adult', applyMode: 'clothing', slot: 'shirt', design: character({ shirt: 'jacket', shirtColor: '#d95c5c', shirtDetail: 'buttons' }), layers: 6, variationGroup: 'casual-jacket', colors: ['#d95c5c', '#5792cc', '#6fbf73', '#3b4352'] }),
  item({ id: 'shirt-hoodie-green', title: 'Classic Hoodie (Green)', subtitle: 'Relaxed upper clothing', description: 'Editable hoodie, pocket, sleeve, and drawstring layers ready for bone attachment.', categories: ['clothing', 'templates'], tags: ['shirt', 'hoodie', 'casual', 'modern'], gender: 'unisex', ageGroup: 'adult', applyMode: 'clothing', slot: 'shirt', design: character({ shirt: 'hoodie', shirtColor: '#6fbf73' }), layers: 6, variationGroup: 'hoodie', colors: ['#6fbf73', '#d95c5c', '#5792cc', '#26394f'] }),
  item({ id: 'shirt-white-tee', title: 'Everyday T-Shirt', subtitle: 'Clean basic top', description: 'A simple editable tee for quick outfit blocking and animation tests.', categories: ['clothing', 'templates'], tags: ['shirt', 'tee', 'casual', 'basic'], gender: 'unisex', ageGroup: 'adult', applyMode: 'clothing', slot: 'shirt', design: character({ shirt: 'tee', shirtColor: '#f0eee7' }), layers: 4, variationGroup: 'tee', colors: ['#f0eee7', '#5792cc', '#d95c5c'] }),
  item({ id: 'pants-jeans-blue', title: 'Jeans · Blue', subtitle: 'Straight-leg pants', description: 'Editable lower-body clothing with a stable pants slot and rig-ready weight attachment.', categories: ['clothing', 'templates'], tags: ['pants', 'jeans', 'casual', 'blue'], gender: 'unisex', ageGroup: 'adult', applyMode: 'clothing', slot: 'pants', design: character({ pants: 'straight', pantsColor: '#395878' }), layers: 3, variationGroup: 'jeans', colors: ['#395878', '#26394f', '#515c68'] }),
  item({ id: 'pants-cargo-olive', title: 'Cargo Pants · Olive', subtitle: 'Utility lower clothing', description: 'Modern cargo pants with editable leg silhouettes and attached pocket details.', categories: ['clothing', 'templates'], tags: ['pants', 'cargo', 'casual', 'uniform'], gender: 'unisex', ageGroup: 'adult', applyMode: 'clothing', slot: 'pants', design: character({ pants: 'straight', pantsColor: '#596347', shirt: 'tee' }), layers: 4, variationGroup: 'cargo', colors: ['#596347', '#303c3b', '#515c68'] }),
  item({ id: 'hair-long-brown', title: 'Long Hair · Brown', subtitle: 'Flowing hairstyle', description: 'Back and front hair layers that remain attached to the existing head and animation rig.', categories: ['hair', 'accessories', 'templates'], tags: ['hair', 'long', 'female', 'adult'], gender: 'female', ageGroup: 'adult', applyMode: 'clothing', slot: 'head', design: character({ hair: 'long', hairColor: '#573a2b' }), layers: 2, variationGroup: 'hair', colors: ['#573a2b', '#241c24', '#9c5d34'] }),
  item({ id: 'hair-ponytail', title: 'Ponytail · Auburn', subtitle: 'Pulled-back hairstyle', description: 'Editable ponytail and front hair layers with a clean head attachment.', categories: ['hair', 'accessories', 'templates'], tags: ['hair', 'ponytail', 'female', 'casual'], gender: 'female', ageGroup: 'adult', applyMode: 'clothing', slot: 'head', design: character({ hair: 'ponytail', hairColor: '#9c5d34' }), layers: 2, variationGroup: 'hair', colors: ['#9c5d34', '#241c24', '#d4a15c'] }),
  item({ id: 'shoes-sneakers', title: 'Studio Sneakers', subtitle: 'Everyday footwear', description: 'Editable sneaker shapes for the shoe slot with stable foot attachments.', categories: ['shoes', 'clothing', 'templates'], tags: ['shoes', 'sneakers', 'casual', 'unisex'], gender: 'unisex', ageGroup: 'adult', applyMode: 'clothing', slot: 'shoes', design: character({ shoes: 'sneakers', shoesColor: '#f0eee7' }), layers: 2, variationGroup: 'shoes', colors: ['#f0eee7', '#1e252d', '#b95147'] }),
  item({ id: 'shoes-boots', title: 'Work Boots', subtitle: 'Grounded footwear', description: 'Boot silhouette with editable ankle and sole details for a sturdy character look.', categories: ['shoes', 'clothing', 'templates'], tags: ['shoes', 'boots', 'uniform', 'unisex'], gender: 'unisex', ageGroup: 'adult', applyMode: 'clothing', slot: 'shoes', design: character({ shoes: 'boots', shoesColor: '#c38a4d' }), layers: 2, variationGroup: 'shoes', colors: ['#c38a4d', '#1e252d', '#634336'] }),
  item({ id: 'prop-willow-cottage', title: 'Willow Cottage', subtitle: '8-view environment prop', description: 'Native vector house with prepared angle views, a root bone, and an optional collider.', categories: ['props', 'backgrounds', 'templates'], tags: ['house', 'environment', 'collider', '8 views'], applyMode: 'prop', propDesign: { ...DEFAULT_HOUSE_PROP }, layers: 8, colors: ['#d98f68', '#6c4750', '#f3d7a4'] }),
  item({ id: 'prop-old-oak', title: 'Old Oak Tree', subtitle: '8-view wind-ready prop', description: 'Native tree with separate canopy layers, prepared views, and optional wind dynamics.', categories: ['props', 'backgrounds', 'templates'], tags: ['tree', 'environment', 'wind', '8 views'], applyMode: 'prop', propDesign: { ...DEFAULT_TREE_PROP }, layers: 5, colors: ['#4f9a62', '#81543d', '#d9b86c'] }),
  item({ id: 'background-deep-forest', title: 'Deep Forest Backdrop', subtitle: 'Editable background layer', description: 'A dark green stage backdrop for blocking an environment behind the character.', categories: ['backgrounds', 'templates'], tags: ['background', 'forest', 'environment'], applyMode: 'background', backgroundColor: '#183a3a', layers: 1, rigReady: false, format: 'Native vector layer', colors: ['#183a3a', '#274d43', '#395878'] }),
  item({ id: 'animation-walk-cycle', title: 'Walk Cycle Starter', subtitle: 'Animation reference', description: 'A reusable animation reference card for rigged characters. Apply it through the timeline after selecting a compatible rig.', categories: ['animations', 'templates'], tags: ['animation', 'walk', 'rig-ready'], applyMode: 'preview', layers: 0, colors: ['#5792cc', '#d95c5c'] }),
];

export function catalogMatches(item: AssetCatalogItem, query: string, category: AssetCategory | 'all'): boolean {
  if (category !== 'all' && !item.categories.includes(category)) return false;
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [item.title, item.subtitle, item.description, ...item.categories, ...item.tags].join(' ').toLowerCase().includes(normalized);
}
