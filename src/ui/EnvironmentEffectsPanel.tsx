import { CloudFog, Droplets, Sparkles, Wind } from 'lucide-react';
import type { EnvironmentEffects } from './environmentData';

export function EnvironmentEffectsPanel({ effects, onChange }: { effects: EnvironmentEffects; onChange: (patch: Partial<EnvironmentEffects>) => void }) {
  return <section className="environment-panel environment-effects-panel" aria-label="Environment effects">
    <div className="environment-panel-heading"><span><Sparkles size={14} /> Environment effects</span><small>LOOK DEV</small></div>
    <label className="environment-check"><input type="checkbox" checked={effects.fog} onChange={event => onChange({ fog: event.target.checked })} /><span><strong><CloudFog size={12} /> Fog volume</strong><small>Softens the far horizon</small></span></label>
    <label className="environment-range"><span>Fog density <output>{Math.round(effects.fogDensity * 100)}%</output></span><input type="range" min="0" max="1" step=".01" value={effects.fogDensity} onChange={event => onChange({ fogDensity: Number(event.target.value) })} /></label>
    <label className="environment-range"><span>Bloom <output>{Math.round(effects.bloom * 100)}%</output></span><input type="range" min="0" max="1" step=".01" value={effects.bloom} onChange={event => onChange({ bloom: Number(event.target.value) })} /></label>
    <div className="environment-effect-toggles">
      <label className="environment-check"><input type="checkbox" checked={effects.rain} onChange={event => onChange({ rain: event.target.checked })} /><span><strong><Droplets size={12} /> Rain</strong><small>Weather pass</small></span></label>
      <label className="environment-check"><input type="checkbox" checked={effects.dust} onChange={event => onChange({ dust: event.target.checked })} /><span><Sparkles size={12} /> <strong>Dust</strong><small>Ground motes</small></span></label>
    </div>
    <label className="environment-range"><span><Wind size={12} /> Wind <output>{Math.round(effects.wind * 100)}%</output></span><input type="range" min="0" max="1" step=".01" value={effects.wind} onChange={event => onChange({ wind: Number(event.target.value) })} /></label>
    <div className="environment-field-grid">
      <label className="environment-field"><span>Color grade</span><select value={effects.colorGrade} onChange={event => onChange({ colorGrade: event.target.value as EnvironmentEffects['colorGrade'] })}><option value="neutral">Neutral</option><option value="warm">Warm</option><option value="cool">Cool</option><option value="noir">Noir</option></select></label>
      <label className="environment-range compact"><span>Vignette <output>{Math.round(effects.vignette * 100)}%</output></span><input type="range" min="0" max="1" step=".01" value={effects.vignette} onChange={event => onChange({ vignette: Number(event.target.value) })} /></label>
    </div>
  </section>;
}
