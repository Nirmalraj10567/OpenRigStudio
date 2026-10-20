import { Paintbrush, RotateCcw, Sparkles } from 'lucide-react';
import { BRUSH_PRESETS, DEFAULT_BRUSH, type BrushCategory, type BrushId, type BrushSettings } from '../engine/brushes';

export type DrawMode = 'brush' | 'rectangle' | 'ellipse';

const CATEGORIES: BrushCategory[] = ['Inking', 'Sketching', 'Painting', 'Texture', 'Effects'];

export function BrushPanel({ settings, onChange, onStatus, drawMode = 'brush', onDrawMode, fillEnabled = true, onFillEnabled, fillColor = '#69b7ff', onFillColor }: { settings: BrushSettings; onChange: (next: BrushSettings) => void; onStatus: (message: string) => void; drawMode?: DrawMode; onDrawMode?: (mode: DrawMode) => void; fillEnabled?: boolean; onFillEnabled?: (enabled: boolean) => void; fillColor?: string; onFillColor?: (color: string) => void }) {
  const preset = BRUSH_PRESETS.find(item => item.id === settings.id) ?? BRUSH_PRESETS[0];
  const selectBrush = (id: BrushId) => {
    const next = BRUSH_PRESETS.find(item => item.id === id) ?? BRUSH_PRESETS[0];
    onChange({ ...settings, id, size: next.defaultSize, opacity: next.defaultOpacity, pressure: next.pressure });
    onStatus(`${next.name} brush selected`);
  };
  const reset = () => { onChange({ ...DEFAULT_BRUSH }); onStatus('Brush settings reset'); };
  return (
    <div className="brush-panel">
      <section className="brush-hero">
        <div className="section-title"><span><Paintbrush size={14} /> Brush library</span><button className="mini-button" onClick={reset} title="Reset brush settings"><RotateCcw size={13} /></button></div>
        <p>Editable vector brushes with pressure, texture and opacity variation. Select Draw to paint on a new layer.</p>
      </section>
      <section className="brush-section">
        <div className="brush-active"><span className="brush-active-dot" style={{ background: settings.color }} /><div><strong>{preset.name}</strong><small>{preset.description}</small></div></div>
        {CATEGORIES.map(category => <div className="brush-category" key={category}><div className="property-subtitle">{category}</div><div className="brush-grid">{BRUSH_PRESETS.filter(item => item.category === category).map(item => <button key={item.id} className={`brush-card ${item.id === settings.id ? 'active' : ''}`} onClick={() => selectBrush(item.id)} title={item.description}><span className={`brush-swatch brush-${item.id}`} style={{ '--brush-color': settings.color, '--brush-size': `${Math.min(28, item.defaultSize)}px` } as React.CSSProperties}><i /></span><span>{item.name}</span></button>)}</div></div>)}
      </section>
      <section className="brush-section brush-settings">
        <div className="property-subtitle"><Sparkles size={12} /> Brush settings</div>
        {onDrawMode && <label className="select-field"><span>Draw tool</span><select aria-label="Draw tool" value={drawMode} onChange={event => { const mode = event.target.value as DrawMode; onDrawMode(mode); onStatus(`${mode === 'brush' ? 'Freehand' : mode === 'rectangle' ? 'Rectangle' : 'Ellipse'} drawing selected`); }}><option value="brush">Freehand brush</option><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option></select></label>}
        <label className="brush-range"><span>Size <output>{Math.round(settings.size)} px</output></span><input type="range" min="1" max="80" step="1" value={settings.size} onChange={event => onChange({ ...settings, size: Number(event.target.value) })} /></label>
        <label className="brush-range"><span>Opacity <output>{Math.round(settings.opacity * 100)}%</output></span><input type="range" min=".05" max="1" step=".01" value={settings.opacity} onChange={event => onChange({ ...settings, opacity: Number(event.target.value) })} /></label>
        <label className="brush-color"><span>Color</span><input type="color" value={settings.color} onChange={event => onChange({ ...settings, color: event.target.value })} /></label>
        {onFillEnabled && <><label className="check-label"><input type="checkbox" checked={fillEnabled} onChange={event => onFillEnabled(event.target.checked)} /> Fill new shapes</label>{fillEnabled && onFillColor && <label className="brush-color"><span>Fill color</span><input type="color" value={fillColor} onChange={event => onFillColor(event.target.value)} /></label>}</>}
        <label className="brush-pressure"><input type="checkbox" checked={settings.pressure} onChange={event => onChange({ ...settings, pressure: event.target.checked })} /><span><strong>Pen pressure</strong><small>Uses PointerEvent pressure when a stylus is connected.</small></span></label>
      </section>
    </div>
  );
}
