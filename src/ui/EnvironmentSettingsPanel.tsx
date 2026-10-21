import { CloudSun, SlidersHorizontal, SunMedium } from 'lucide-react';
import type { EnvironmentSettings, EnvironmentTimeOfDay, EnvironmentWeather } from './environmentData';

export function EnvironmentSettingsPanel({ settings, onChange }: { settings: EnvironmentSettings; onChange: (patch: Partial<EnvironmentSettings>) => void }) {
  return <section className="environment-panel environment-settings-panel" aria-label="Environment settings">
    <div className="environment-panel-heading"><span><SlidersHorizontal size={14} /> Environment settings</span><small>WORLD</small></div>
    <label className="environment-field environment-field-wide"><span>Name</span><input value={settings.name} onChange={event => onChange({ name: event.target.value })} /></label>
    <div className="environment-field-grid">
      <label className="environment-field"><span>Biome</span><select value={settings.biome} onChange={event => onChange({ biome: event.target.value })}><option>Temperate forest</option><option>Village valley</option><option>Coastal</option><option>Urban</option><option>Hillside</option><option>Desert</option><option>Snow field</option></select></label>
      <label className="environment-field"><span>Time of day</span><select value={settings.timeOfDay} onChange={event => onChange({ timeOfDay: event.target.value as EnvironmentTimeOfDay })}><option value="dawn">Dawn</option><option value="day">Day</option><option value="golden-hour">Golden hour</option><option value="night">Night</option></select></label>
    </div>
    <label className="environment-field environment-field-wide"><span>Weather</span><span className="environment-segmented">{(['clear', 'cloudy', 'rain', 'mist', 'snow'] as EnvironmentWeather[]).map(weather => <button key={weather} type="button" className={settings.weather === weather ? 'active' : ''} aria-pressed={settings.weather === weather} onClick={() => onChange({ weather })}>{weather}</button>)}</span></label>
    <div className="environment-settings-divider" />
    <div className="environment-subheading"><SunMedium size={13} /> Lighting</div>
    <label className="environment-range"><span>Exposure <output>{settings.exposure > 0 ? '+' : ''}{settings.exposure.toFixed(1)}</output></span><input type="range" min="-4" max="4" step=".1" value={settings.exposure} onChange={event => onChange({ exposure: Number(event.target.value) })} /></label>
    <label className="environment-range"><span>Ambient <output>{Math.round(settings.ambientIntensity * 100)}%</output></span><input type="range" min="0" max="2" step=".01" value={settings.ambientIntensity} onChange={event => onChange({ ambientIntensity: Number(event.target.value) })} /></label>
    <label className="environment-range"><span>Sun intensity <output>{settings.sunIntensity.toFixed(1)}</output></span><input type="range" min="0" max="8" step=".1" value={settings.sunIntensity} onChange={event => onChange({ sunIntensity: Number(event.target.value) })} /></label>
    <div className="environment-color-grid">
      <label className="environment-color-field"><span>Sky</span><input type="color" value={settings.skyColor} onChange={event => onChange({ skyColor: event.target.value })} /></label>
      <label className="environment-color-field"><span>Horizon</span><input type="color" value={settings.horizonColor} onChange={event => onChange({ horizonColor: event.target.value })} /></label>
      <label className="environment-color-field"><span>Sun</span><input type="color" value={settings.sunColor} onChange={event => onChange({ sunColor: event.target.value })} /></label>
    </div>
    <div className="environment-settings-divider" />
    <div className="environment-subheading"><CloudSun size={13} /> Blocking</div>
    <div className="environment-field-grid">
      <label className="environment-field"><span>Grid size</span><div className="environment-input-suffix"><input type="number" min="4" max="256" value={settings.gridSize} onChange={event => onChange({ gridSize: Number(event.target.value) })} /><em>px</em></div></label>
      <label className="environment-check"><input type="checkbox" checked={settings.snapToTerrain} onChange={event => onChange({ snapToTerrain: event.target.checked })} /><span><strong>Snap to terrain</strong><small>Place props on tile height</small></span></label>
    </div>
  </section>;
}
