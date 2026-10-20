import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Check, Download, House, Layers, Pause, Play, Plus, RotateCcw, Save, Shield, Trees, Wind, X } from 'lucide-react';
import { createPropRig, DEFAULT_HOUSE_PROP, DEFAULT_TREE_PROP, normalizePropDesign, PROP_ANGLES } from '../engine/propsToolkit';
import type { PropDesign } from '../engine/propsToolkit';
import type { Rig } from '../engine/Rig';
import { addPhysicsBody, physicsBodies } from '../engine/dynamics';
import { projectToSVG } from '../engine/export';
import './PropsToolkit.css';

const DRAFT_KEY = 'props-toolkit-design:v1';
const STYLES = [
  { id: 'cottage', title: 'Willow cottage', caption: 'Pitched roof · chimney', design: DEFAULT_HOUSE_PROP },
  { id: 'townhouse', title: 'Townhouse', caption: 'Tall windows · dormer', design: { ...DEFAULT_HOUSE_PROP, name: 'Townhouse', style: 'townhouse', primaryColor: '#a9c4c7', secondaryColor: '#38566b' } as PropDesign },
  { id: 'oak', title: 'Old oak', caption: 'Broad crown · branches', design: DEFAULT_TREE_PROP },
  { id: 'pine', title: 'Mountain pine', caption: 'Tiered evergreen canopy', design: { ...DEFAULT_TREE_PROP, name: 'Mountain pine', style: 'pine', primaryColor: '#357f70', detailColor: '#96c6a0' } as PropDesign },
];

function svgSource(rig: Rig, guides = false) {
  let svg = projectToSVG(rig, false).replace('viewBox="0 0 800 520"', 'viewBox="100 0 600 510"');
  if (guides) {
    const overlay = physicsBodies(rig).map(body => body.shape === 'box'
      ? `<rect x="${-body.width / 2}" y="${-body.height / 2}" width="${body.width}" height="${body.height}" transform="translate(${body.x} ${body.y}) rotate(${body.rotation * 180 / Math.PI})" fill="#6375e518" stroke="#5865d4" stroke-width="2" stroke-dasharray="6 4"/>`
      : `<circle cx="${body.x}" cy="${body.y}" r="${body.radius}" fill="none" stroke="#5865d4" stroke-width="2"/>`).join('');
    const end = svg.lastIndexOf('</svg>');
    svg = `${svg.slice(0, end)}${overlay}${svg.slice(end)}`;
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function Range({ label, value, min, max, step = 1, suffix = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void;
}) {
  return <label className="prop-range"><span>{label}<output>{Number(value.toFixed(2))}{suffix}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} /></label>;
}

export function PropsToolkit({ onClose, onApply, onExport, sceneNotice }: {
  onClose: () => void; onApply: (design: PropDesign) => void; onExport: (design: PropDesign) => void; sceneNotice: string;
}) {
  const [design, setDesign] = useState<PropDesign>(() => {
    try { return normalizePropDesign(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')); } catch { return { ...DEFAULT_HOUSE_PROP }; }
  });
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [probe, setProbe] = useState(false);
  const [guides, setGuides] = useState(false);
  const [message, setMessage] = useState('Choose a prop, make it yours, then add it to your scene.');
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const modal = dialog.current!;
    if (!modal.open) modal.showModal();
    return () => { modal.close(); previous?.focus(); };
  }, []);

  const patch = (values: Partial<PropDesign>) => {
    setPlaying(false); setFrame(0); setProbe(false); setError('');
    setDesign(current => ({ ...normalizePropDesign({ ...current, ...values }), name: values.name !== undefined ? values.name.trim().slice(0, 80) || current.name : current.name }));
  };
  const preset = (value: PropDesign) => {
    setPlaying(false); setFrame(0); setProbe(false); setError(''); setDesign({ ...value });
    setMessage(`${value.name} selected. Eight prepared views are included.`);
  };

  // Preview and export use exactly the same native rig, not a second illustration.
  const preview = useMemo(() => {
    const rig = createPropRig(design);
    if (probe && design.physics === 'collider') {
      const ball = rig.addVectorLayer('Preview-only collision probe', [{ id: 'probe-art', kind: 'ellipse', radiusX: 11, radiusY: 11, fill: '#6475e5', stroke: '#fff', strokeWidth: 3 }]);
      Object.assign(rig.layers.get(ball)!.local, { x: 400, y: 38 });
      rig.update();
      const id = addPhysicsBody(rig, ball);
      Object.assign(rig.dynamics.bodies.find(body => body.id === id)!, { motion: 'dynamic', radius: 11, restitution: .6, friction: .1 });
    }
    return rig;
  }, [design, probe]);

  const thumbnails = useMemo(() => STYLES.map(style => ({ ...style, src: svgSource(createPropRig({ ...style.design, physics: 'none', angle: -45 })) })), []);
  const viewSheet = useMemo(() => {
    const rig = createPropRig({ ...design, physics: 'none' });
    const set = rig.characterViews[0];
    rig.characterAngleOverrides.clear();
    return PROP_ANGLES.map(view => {
      set.angle = view.angle;
      return { ...view, src: svgSource(rig) };
    });
  }, [design]);
  const previewSrc = useMemo(() => {
    preview.setTimeline({ currentFrame: frame, currentTime: frame / 24 });
    return svgSource(preview, guides);
  }, [preview, frame, guides]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setFrame(current => {
      if (current >= 120) { setPlaying(false); return 120; }
      return current + 1;
    }), 1000 / 24);
    return () => window.clearInterval(timer);
  }, [playing]);

  const run = (action: () => void, success?: string) => {
    setError('');
    try { action(); if (success) setMessage(success); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The prop could not be created.'); }
  };
  const save = () => run(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(design)), 'Design saved in this browser. It will reopen here next time.');
  const simulate = () => {
    if (playing) { setPlaying(false); return; }
    setFrame(0); setProbe(design.physics === 'collider'); setGuides(design.physics === 'collider'); setPlaying(true);
    setMessage(design.physics === 'wind' ? 'Playing native wind physics. The trunk stays rooted.' : 'Dropping a preview-only ball onto the collider. The ball is not exported.');
  };

  return <dialog ref={dialog} className="props-dialog" aria-labelledby="props-title" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <header className="props-header">
      <div className="props-brand"><span><Box size={24} /></span><div><small>SCENE BUILDING / PROPS</small><h1 id="props-title">Props design toolkit</h1><p>Build a world around your character.</p></div></div>
      <div className="props-header-actions"><button onClick={save}><Save size={16} /> Save design</button><button title="Download an editable native project. Open the JSON in Animation Studio." onClick={() => run(() => onExport(design), 'Native project exported. Use Open in Animation Studio to load it.')}><Download size={16} /> Export JSON</button><button className="props-close" aria-label="Close props toolkit" onClick={onClose}><X size={20} /></button></div>
    </header>
    <div className="props-body">
      <aside className="props-library" aria-label="Prop library">
        <div className="props-section-heading"><span>01</span><h2>Start with a prop</h2></div>
        <p className="props-muted">One prop at a time. Every piece stays editable.</p>
        <div className="props-library-grid">{thumbnails.map(item => <button className={`prop-preset ${design.style === item.id ? 'selected' : ''}`} aria-pressed={design.style === item.id} key={item.id} onClick={() => preset(item.design)}>
          <img src={item.src} alt="" /><strong>{item.title}</strong><small>{item.caption}</small>{design.style === item.id && <Check size={15} className="prop-selected-check" />}
        </button>)}</div>
        <div className="props-library-note"><Layers size={18} /><strong>Made for your timeline</strong><p>Separate vector layers, rig controls, eight angle drawings, and native physics settings—not a flattened image.</p></div>
      </aside>

      <main className="props-preview">
        <div className="props-preview-heading"><div><span className="props-eyebrow">LIVE NATIVE PREVIEW</span><h2>{design.name}</h2></div><span className="props-badge">{design.kind === 'house' ? <House size={14} /> : <Trees size={14} />} {design.kind} · 8 views</span></div>
        <div className="props-stage">
          <span className="props-angle-label">{design.angle}° <span>/ {PROP_ANGLES.find(view => view.angle === design.angle)?.name ?? 'Blended alignment'}</span></span>
          <img className="props-preview-image" src={previewSrc} alt={`${design.name}, ${design.angle} degree view at frame ${frame}`} />
          <div className="props-stage-info"><span>{design.physics === 'wind' ? 'Wind spring' : design.physics === 'collider' ? 'Collision body' : 'Physics off'}</span><span>FRAME {String(frame).padStart(3, '0')} / 120</span></div>
        </div>
        <div className="props-view-strip" role="group" aria-label="Prepared prop angles">{viewSheet.map(view => <button key={view.angle} aria-label={`${view.name} ${view.angle} degrees`} aria-pressed={design.angle === view.angle} onClick={() => patch({ angle: view.angle })}><img src={view.src} alt="" /><strong>{view.angle}°</strong></button>)}</div>
        <div className="props-playback">
          <button disabled={design.physics === 'none'} onClick={simulate}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Pause preview' : design.physics === 'collider' ? 'Test collision' : 'Test wind'}</button>
          <button aria-label="Reset physics preview" onClick={() => { setPlaying(false); setFrame(0); setProbe(false); }}><RotateCcw size={15} /></button>
          <label>Frame<input aria-label="Physics preview frame" type="range" min={0} max={120} value={frame} onChange={event => { setPlaying(false); setFrame(Number(event.target.value)); }} /></label>
          <label className="props-guides"><input type="checkbox" checked={guides} onChange={event => setGuides(event.target.checked)} /> Colliders</label>
        </div>
        <p className="props-preview-help">Prepared 2D angle drawings, not a 3D mesh. Physics previews use the same solver as your animation stage.</p>
      </main>

      <aside className="props-inspector" aria-label="Prop settings">
        <div className="props-section-heading"><span>02</span><h2>Make it yours</h2></div>
        <label className="props-name-field"><span>Prop name</span><input value={design.name} onChange={event => patch({ name: event.target.value })} /></label>
        <div className="props-control-group"><div className="props-control-heading"><strong>Type</strong><small>one active prop</small></div><div className="props-segmented"><button className={design.kind === 'house' ? 'active' : ''} onClick={() => preset(DEFAULT_HOUSE_PROP)}><House size={15} /> House</button><button className={design.kind === 'tree' ? 'active' : ''} onClick={() => preset(DEFAULT_TREE_PROP)}><Trees size={15} /> Tree</button></div></div>
        <div className="props-control-group"><div className="props-control-heading"><strong>Palette</strong><small>vector fills</small></div><div className="props-color-row"><label>Primary<input type="color" value={design.primaryColor} onChange={event => patch({ primaryColor: event.target.value })} /></label><label>Secondary<input type="color" value={design.secondaryColor} onChange={event => patch({ secondaryColor: event.target.value })} /></label><label>Detail<input type="color" value={design.detailColor} onChange={event => patch({ detailColor: event.target.value })} /></label></div></div>
        <div className="props-control-group"><div className="props-control-heading"><strong>Scale & angle</strong><small>prop transform</small></div><Range label="Size" value={design.size} min={.6} max={1.4} step={.01} suffix="×" onChange={size => patch({ size })} /><Range label="View angle" value={design.angle} min={-180} max={180} suffix="°" onChange={angle => patch({ angle })} /></div>
        <div className="props-control-group props-physics-group"><div className="props-control-heading"><strong><Wind size={15} /> Physics behavior</strong><small>native deterministic solver</small></div><div className="props-physics-options"><button aria-pressed={design.physics === 'none'} className={design.physics === 'none' ? 'active' : ''} onClick={() => patch({ physics: 'none' })}><span>Static</span><small>no simulation</small></button><button aria-pressed={design.physics === 'collider'} className={design.physics === 'collider' ? 'active' : ''} onClick={() => patch({ physics: 'collider' })}><Shield size={15} /><span>Collider</span><small>solid obstacle</small></button>{design.kind === 'tree' && <button aria-pressed={design.physics === 'wind'} className={design.physics === 'wind' ? 'active' : ''} onClick={() => patch({ physics: 'wind' })}><Wind size={15} /><span>Wind</span><small>canopy spring</small></button>}</div>{design.physics === 'wind' && <><Range label="Wind strength" value={design.windStrength} min={0} max={200} onChange={windStrength => patch({ windStrength })} /><Range label="Stiffness" value={design.stiffness} min={5} max={120} onChange={stiffness => patch({ stiffness })} /><Range label="Damping" value={design.damping} min={1} max={20} onChange={damping => patch({ damping })} /></>}</div>
        {sceneNotice && <div className="props-scene-notice"><Check size={14} /> {sceneNotice}</div>}
        {message && <div className="props-message"><span />{message}</div>}
        {error && <div className="props-error" role="alert">{error}</div>}
        <div className="props-inspector-footer"><span><Layers size={14} /> Eight angle views included</span><span><Box size={14} /> Editable in Rig & animate</span></div>
      </aside>
    </div>
    <footer className="props-footer"><div><span className="props-footer-dot" /> {design.physics === 'wind' ? 'Native wind ready' : design.physics === 'collider' ? 'Native collider ready' : 'Ready to add'}</div><div className="props-footer-actions"><button className="props-secondary" onClick={() => preset(DEFAULT_HOUSE_PROP)}>Reset</button><button className="props-primary" onClick={() => run(() => onApply(design), `${design.name} added to the scene with eight prepared angles.`)}><Plus size={16} /> Add prop to scene</button></div></footer>
  </dialog>;
}
