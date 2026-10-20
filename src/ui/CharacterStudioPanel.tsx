import { useRef, useState } from 'react';
import {
  Check,
  CircleDot,
  Download,
  Footprints,
  RotateCcw,
  Save,
  ScanFace,
  Shirt,
  Shuffle,
  Sparkles,
  UserRound,
  Upload,
  X,
} from 'lucide-react';
import { DEFAULT_CHARACTER_DESIGN, normalizeCharacterDesign } from '../engine/characterStudio';
import type { CharacterDesign } from '../engine/characterStudio';

type Gender = 'female' | 'male';
type Part = 'full' | 'head' | 'neck' | 'shirt' | 'pants' | 'shoes';
type HairStyle = 'crop' | 'bob' | 'curls' | 'long' | 'ponytail' | 'fade';
type NeckStyle = 'slim' | 'classic' | 'strong';
type ShirtStyle = 'tee' | 'hoodie' | 'jacket' | 'blouse';
type PantsStyle = 'straight' | 'wide' | 'joggers' | 'shorts';
type ShoesStyle = 'sneakers' | 'boots' | 'loafers';

type Choice = { id: string; label: string; detail?: string; color?: string };

const PARTS: { id: Part; label: string; icon: React.ReactNode }[] = [
  { id: 'full', label: 'Full character', icon: <Sparkles size={15} /> },
  { id: 'head', label: 'Head & hair', icon: <ScanFace size={15} /> },
  { id: 'neck', label: 'Neck', icon: <CircleDot size={15} /> },
  { id: 'shirt', label: 'Shirt / top', icon: <Shirt size={15} /> },
  { id: 'pants', label: 'Pants', icon: <UserRound size={15} /> },
  { id: 'shoes', label: 'Shoes', icon: <Footprints size={15} /> },
];

const SKIN_TONES = ['#f6c7a7', '#e6a47e', '#c98261', '#985b45', '#6f4038'];
const HAIR_COLORS = ['#241c24', '#573a2b', '#9c5d34', '#d4a15c', '#bc5c6b', '#497b83'];
const SHIRT_COLORS = ['#d95c5c', '#e58b4a', '#e8c765', '#69b6a5', '#5792cc', '#665da8', '#d8dce0'];
const PANTS_COLORS = ['#26394f', '#395878', '#515c68', '#382d4f', '#634336', '#303c3b'];
const SHOE_COLORS = ['#1e252d', '#f0eee7', '#b95147', '#4c6d6a', '#c38a4d'];

const HAIR_CHOICES: Choice[] = [
  { id: 'crop', label: 'Crop', detail: 'Clean + short' },
  { id: 'bob', label: 'Bob', detail: 'Soft silhouette' },
  { id: 'curls', label: 'Curls', detail: 'Full volume' },
  { id: 'long', label: 'Long', detail: 'Flowing length' },
  { id: 'ponytail', label: 'Ponytail', detail: 'Pulled back' },
  { id: 'fade', label: 'Fade', detail: 'Sharp sides' },
];

const HEAD_CHOICES: Choice[] = [
  { id: 'oval', label: 'Oval', detail: 'Balanced face' },
  { id: 'round', label: 'Round', detail: 'Friendly shape' },
  { id: 'angular', label: 'Angular', detail: 'Graphic profile' },
];

const NECK_CHOICES: Choice[] = [
  { id: 'slim', label: 'Slim', detail: 'Light frame' },
  { id: 'classic', label: 'Classic', detail: 'Balanced' },
  { id: 'strong', label: 'Strong', detail: 'Broad frame' },
];

const SHIRT_CHOICES: Choice[] = [
  { id: 'tee', label: 'T-shirt', detail: 'Everyday basic' },
  { id: 'hoodie', label: 'Hoodie', detail: 'Relaxed fit' },
  { id: 'jacket', label: 'Jacket', detail: 'Layered look' },
  { id: 'blouse', label: 'Blouse', detail: 'Soft collar' },
];

const SHIRT_PATTERN_CHOICES: Choice[] = [
  { id: 'none', label: 'None', detail: 'Solid color' },
  { id: 'stripes', label: 'Stripes', detail: 'Clean lines' },
  { id: 'checks', label: 'Checks', detail: 'Small grid' },
  { id: 'plaid', label: 'Plaid', detail: 'Layered weave' },
  { id: 'gradient', label: 'Gradient', detail: 'Soft blend' },
  { id: 'camouflage', label: 'Camouflage', detail: 'Outdoor texture' },
  { id: 'graphic', label: 'Graphic', detail: 'Front print' },
];

const SHIRT_DETAIL_CHOICES: Choice[] = [
  { id: 'none', label: 'None', detail: 'Clean finish' },
  { id: 'collar', label: 'Collar', detail: 'Structured neck' },
  { id: 'roll-up', label: 'Roll-up', detail: 'Folded sleeves' },
  { id: 'sleeves', label: 'Sleeves', detail: 'Cuff lines' },
  { id: 'pocket', label: 'Pocket', detail: 'Chest pocket' },
  { id: 'buttons', label: 'Buttons', detail: 'Front buttons' },
];

const PANTS_CHOICES: Choice[] = [
  { id: 'straight', label: 'Straight', detail: 'Classic leg' },
  { id: 'wide', label: 'Wide leg', detail: 'Modern drape' },
  { id: 'joggers', label: 'Joggers', detail: 'Cuffed fit' },
  { id: 'shorts', label: 'Shorts', detail: 'Easy movement' },
];

const SHOE_CHOICES: Choice[] = [
  { id: 'sneakers', label: 'Sneakers', detail: 'Studio casual' },
  { id: 'boots', label: 'Boots', detail: 'Grounded shape' },
  { id: 'loafers', label: 'Loafers', detail: 'Polished finish' },
];

const PRESETS: { id: string; name: string; detail: string; color: string; design: Partial<CharacterDesign> }[] = [
  { id: 'studio', name: 'Studio basic', detail: 'Clean everyday look', color: '#5792cc', design: { shirt: 'tee', shirtColor: '#5792cc', pants: 'straight', pantsColor: '#395878', shoes: 'sneakers', shoesColor: '#f0eee7' } },
  { id: 'street', name: 'Street ready', detail: 'Relaxed + graphic', color: '#d95c5c', design: { shirt: 'hoodie', shirtColor: '#d95c5c', pants: 'joggers', pantsColor: '#303c3b', shoes: 'sneakers', shoesColor: '#1e252d' } },
  { id: 'smart', name: 'Full suit', detail: 'Complete tailored look', color: '#665da8', design: { shirt: 'jacket', shirtColor: '#665da8', pants: 'straight', pantsColor: '#26394f', shoes: 'loafers', shoesColor: '#c38a4d' } },
  { id: 'weekend', name: 'Weekend', detail: 'Light + playful', color: '#e58b4a', design: { shirt: 'blouse', shirtColor: '#e58b4a', pants: 'shorts', pantsColor: '#515c68', shoes: 'sneakers', shoesColor: '#4c6d6a' } },
];

function updateDesign(setDesign: React.Dispatch<React.SetStateAction<CharacterDesign>>, patch: Partial<CharacterDesign>) {
  setDesign(previous => ({ ...previous, ...patch }));
}

function Swatches({ label, colors, value, onChange }: { label: string; colors: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="character-swatch-field">
      <div className="character-control-label"><span>{label}</span><span className="character-color-value">{value.toUpperCase()}</span></div>
      <div className="character-swatches" role="list" aria-label={label}>
        {colors.map(color => <button key={color} type="button" className={`character-swatch ${value === color ? 'active' : ''}`} style={{ background: color }} onClick={() => onChange(color)} aria-label={`Choose ${color}`} aria-pressed={value === color}>{value === color && <Check size={13} />}</button>)}
      </div>
    </div>
  );
}

function ChoiceCards({ choices, value, onChange }: { choices: Choice[]; value: string; onChange: (value: string) => void }) {
  return <div className="character-choice-grid">{choices.map(choice => <button type="button" key={choice.id} className={`character-choice ${value === choice.id ? 'active' : ''}`} onClick={() => onChange(choice.id)} aria-pressed={value === choice.id}><span className="character-choice-mark">{value === choice.id ? <Check size={12} /> : null}</span><span><strong>{choice.label}</strong><small>{choice.detail}</small></span></button>)}</div>;
}

function ShirtPatternCards({ choices, value, onChange, kind }: { choices: Choice[]; value: string; onChange: (value: string) => void; kind: 'pattern' | 'detail' }) {
  return <div className={`shirt-customization-grid ${kind}`}>{choices.map((choice, index) => <button type="button" key={choice.id} className={`shirt-customization-card ${value === choice.id ? 'active' : ''}`} onClick={() => onChange(choice.id)} aria-pressed={value === choice.id}><span className={`shirt-customization-art ${kind}-${choice.id}`}><i /></span><strong>{choice.label}</strong><small>{choice.detail}</small>{value === choice.id && <Check className="shirt-customization-check" size={13} />}</button>)}</div>;
}

function Hair({ design, hairColor }: { design: HairStyle; hairColor: string }) {
  if (design === 'crop') return <path d="M153 124C151 74 175 48 210 48c37 0 61 27 56 76-10-15-20-21-35-24-21 16-48 21-78 24Z" fill={hairColor} />;
  if (design === 'fade') return <><path d="M153 124C151 74 175 48 210 48c37 0 61 27 56 76l-18-25c-24 8-51 8-78 0Z" fill={hairColor} /><path d="M154 111c5-32 24-51 56-54v18c-22 9-37 21-56 36Zm112 0c-5-32-24-51-56-54v18c22 9 37 21 56 36Z" fill="#000" opacity=".13" /></>;
  if (design === 'bob') return <><path d="M151 135C143 81 168 45 210 45c43 0 68 36 59 90l-13 38-17-7-7-35c-15 11-35 16-57 7l-9 35-17 7Z" fill={hairColor} /><path d="M151 116c10-24 27-40 59-43 31 3 49 19 59 43-22-13-39-19-59-19-21 0-38 6-59 19Z" fill={hairColor} opacity=".9" /></>;
  if (design === 'curls') return <><path d="M147 127c-4-50 23-87 63-87s67 37 63 87c-10-10-22-15-33-15-12 0-20 8-30 8-11 0-18-8-31-8-11 0-22 5-32 15Z" fill={hairColor} />{[0, 1, 2, 3, 4, 5].map(index => <circle key={index} cx={153 + index * 23} cy={69 + (index % 2) * 13} r="17" fill={hairColor} />)}</>;
  if (design === 'long') return <><path d="M147 136C139 79 168 43 210 43s71 36 63 93l-1 130c-13 15-26 19-38 8l-9-102c-9 10-20 10-30 0l-9 102c-12 11-25 7-38-8Z" fill={hairColor} /><path d="M151 112c13-37 31-55 59-58 28 3 46 21 59 58-24-17-40-22-59-22-20 0-36 5-59 22Z" fill={hairColor} opacity=".9" /></>;
  return <><path d="M149 132C141 79 168 43 210 43s69 36 61 89l-16 12-11-33c-19 12-40 16-68 9l-12 24Z" fill={hairColor} /><path d="M253 83c35 1 53 17 57 42-12 22-27 27-43 21l-12-63Z" fill={hairColor} /></>;
}

export function CharacterPreview({ design }: { design: CharacterDesign }) {
  const female = design.gender === 'female';
  const bodyScale = 0.82 + design.build / 100 * .36;
  const heightScale = .82 + design.height * .0018;
  const shoulder = (female ? 76 : 92) * bodyScale;
  const waist = (female ? 53 : 66) * bodyScale;
  const hip = (female ? 73 : 76) * bodyScale;
  const neckWidth = design.neck === 'slim' ? 27 : design.neck === 'strong' ? 42 : 34;
  const leftShoulder = 210 - shoulder;
  const rightShoulder = 210 + shoulder;
  const leftWaist = 210 - waist;
  const rightWaist = 210 + waist;
  const leftHip = 210 - hip;
  const rightHip = 210 + hip;
  const shirtColor = design.shirtColor;
  const shirtFill = design.shirtPattern === 'stripes' ? 'url(#characterStudioStripes)' : design.shirtPattern === 'checks' ? 'url(#characterStudioChecks)' : design.shirtPattern === 'plaid' ? 'url(#characterStudioPlaid)' : design.shirtPattern === 'gradient' ? 'url(#characterStudioShirtGradient)' : design.shirtPattern === 'camouflage' ? 'url(#characterStudioCamo)' : shirtColor;
  const pantsColor = design.pantsColor;
  const shoeColor = design.shoesColor;
  const shirtPath = design.shirt === 'blouse'
    ? `M${leftShoulder} 222 Q210 206 ${rightShoulder} 222 L${rightWaist + 12} 382 Q210 400 ${leftWaist - 12} 382Z`
    : design.shirt === 'jacket'
      ? `M${leftShoulder} 221 Q210 205 ${rightShoulder} 221 L${rightWaist + 13} 384 Q210 400 ${leftWaist - 13} 384Z`
      : `M${leftShoulder} 224 Q210 205 ${rightShoulder} 224 L${rightWaist + 8} 386 Q210 398 ${leftWaist - 8} 386Z`;
  const pantsTop = 363;
  const pantsBottom = design.pants === 'shorts' ? 477 : 545;
  const legGap = female ? 13 : 15;
  const leftLeg = `M${leftHip + 4} ${pantsTop} L${210 - legGap} ${pantsTop} L${210 - legGap - 4} ${pantsBottom} L${174 - (bodyScale - 1) * 10} ${pantsBottom} L${leftHip - 8} 406Z`;
  const rightLeg = `M${210 + legGap} ${pantsTop} L${rightHip - 4} ${pantsTop} L${rightHip + 8} 406 L${246 + (bodyScale - 1) * 10} ${pantsBottom} L${210 + legGap + 4} ${pantsBottom}Z`;
  const pantsOpacity = design.pants === 'joggers' ? .94 : 1;
  const shoeY = design.pants === 'shorts' ? 485 : 550;
  const shoeWidth = design.shoes === 'boots' ? 35 : 43;
  const hairColor = design.hairColor;
  return (
    <svg className="character-preview-svg" viewBox="0 0 420 620" role="img" aria-label={`${design.gender} character preview`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="characterStudioBackdrop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e8f1ff" /><stop offset="1" stopColor="#dceaff" /></linearGradient>
        <linearGradient id="characterStudioFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e1edff" /><stop offset="1" stopColor="#d2e1fa" /></linearGradient>
        <linearGradient id="characterStudioShirtGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={shirtColor} /><stop offset="1" stopColor="#ffffff" stopOpacity=".5" /></linearGradient>
        <pattern id="characterStudioStripes" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill={shirtColor} /><path d="M0 0h16" stroke="#ffffff" strokeOpacity=".42" strokeWidth="6" /></pattern>
        <pattern id="characterStudioChecks" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill={shirtColor} /><path d="M0 0h18v18H0z" fill="#ffffff" fillOpacity=".2" /><path d="M9 0v18M0 9h18" stroke="#ffffff" strokeOpacity=".35" strokeWidth="3" /></pattern>
        <pattern id="characterStudioPlaid" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill={shirtColor} /><path d="M4 0v20M14 0v20M0 5h20M0 15h20" stroke="#ffffff" strokeOpacity=".28" strokeWidth="4" /></pattern>
        <pattern id="characterStudioCamo" width="34" height="26" patternUnits="userSpaceOnUse"><rect width="34" height="26" fill={shirtColor} /><path d="M-3 6q10-10 19 0t18 0v11q-10 8-19 0t-18 0Z" fill="#354e43" fillOpacity=".48" /><circle cx="27" cy="20" r="7" fill="#c5a764" fillOpacity=".32" /></pattern>
        <filter id="characterStudioShadow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="8" /></filter>
      </defs>
      <rect width="420" height="620" fill="url(#characterStudioBackdrop)" data-studio-background="true" />
      <path d="M0 462h420v158H0z" fill="url(#characterStudioFloor)" data-studio-background="true" />
      <path d="M0 462h420" stroke="#7798cc" strokeOpacity=".26" />
      <g opacity=".18" stroke="#7292c4" strokeWidth="1" data-studio-background="true"><path d="M30 0v620M90 0v620M150 0v620M210 0v620M270 0v620M330 0v620M390 0v620" /><path d="M0 70h420M0 130h420M0 190h420M0 250h420M0 310h420M0 370h420M0 430h420M0 490h420M0 550h420" /></g>
      <ellipse cx="210" cy="564" rx="108" ry="19" fill="#738ab8" opacity=".25" filter="url(#characterStudioShadow)" />
      <g transform={`translate(0 ${565 * (1 - heightScale)}) scale(1 ${heightScale})`}>
        <path d={`M${leftShoulder + 6} 235C${leftShoulder - 25} 267 ${leftShoulder - 20} 326 ${leftShoulder + 2} 352`} fill="none" stroke={design.skin} strokeWidth="24" strokeLinecap="round" />
        <path d={`M${rightShoulder - 6} 235C${rightShoulder + 25} 267 ${rightShoulder + 20} 326 ${rightShoulder - 2} 352`} fill="none" stroke={design.skin} strokeWidth="24" strokeLinecap="round" />
        <path d={leftLeg} fill={pantsColor} opacity={pantsOpacity} />
        <path d={rightLeg} fill={pantsColor} opacity={pantsOpacity} />
        {design.pants === 'joggers' && <><path d={`M${174 - (bodyScale - 1) * 10} ${pantsBottom - 4}h36v15h-36Z`} fill={pantsColor} /><path d={`M${246 + (bodyScale - 1) * 10} ${pantsBottom - 4}h-36v15h36Z`} fill={pantsColor} /></>}
        <path d={`M${leftShoulder} 221 Q210 204 ${rightShoulder} 221 L${rightWaist + 8} 386 Q210 399 ${leftWaist - 8} 386Z`} fill={shirtFill} opacity=".28" />
        <path d={shirtPath} fill={shirtFill} />
        {design.shirtPattern === 'graphic' && <><circle cx="210" cy="300" r="28" fill="#ffffff" fillOpacity=".8" /><path d="M196 307l14-19 14 19-14-6Z" fill={shirtColor} /></>}
        {design.shirt === 'hoodie' && <><path d="M178 224Q210 180 242 224l-13 17h-38Z" fill={shirtFill} stroke="#ffffff" strokeOpacity=".13" strokeWidth="2" /><path d="M191 292h38" stroke="#ffffff" strokeOpacity=".18" strokeWidth="3" strokeLinecap="round" /><circle cx="198" cy="302" r="3" fill="#ffffff" fillOpacity=".55" /><circle cx="222" cy="302" r="3" fill="#ffffff" fillOpacity=".55" /></>}
        {design.shirt === 'jacket' && <><path d="M210 215v174" stroke="#f3f6f5" strokeOpacity=".65" strokeWidth="3" /><path d="M210 222l-25 29 19 13 6-16 6 16 19-13Z" fill="#f0eee7" fillOpacity=".78" /><circle cx="228" cy="316" r="4" fill="#f0eee7" /></>}
        {design.shirt === 'blouse' && <><path d="M184 221l26 26 26-26" fill="none" stroke="#ffffff" strokeOpacity=".48" strokeWidth="4" /><path d="M200 253h20" stroke="#ffffff" strokeOpacity=".35" strokeWidth="2" /></>}
        {design.shirt === 'tee' && <path d="M193 221q17 19 34 0" fill="none" stroke="#ffffff" strokeOpacity=".22" strokeWidth="3" />}
        {design.shirtDetail === 'collar' && <path d="M190 218L210 239L230 218L222 248L210 239L198 248Z" fill="#f8f3ec" stroke="#aab7d1" strokeWidth="1.5" />}
        {design.shirtDetail === 'roll-up' && <><path d={`M${leftShoulder + 2} 247l23 8`} stroke="#ffffff" strokeOpacity=".75" strokeWidth="5" /><path d={`M${rightShoulder - 2} 247l-23 8`} stroke="#ffffff" strokeOpacity=".75" strokeWidth="5" /></>}
        {design.shirtDetail === 'sleeves' && <><path d={`M${leftShoulder + 2} 262l18 5`} stroke="#ffffff" strokeOpacity=".55" strokeWidth="2" /><path d={`M${rightShoulder - 2} 262l-18 5`} stroke="#ffffff" strokeOpacity=".55" strokeWidth="2" /></>}
        {design.shirtDetail === 'pocket' && <path d="M224 267h22v23h-22Z" fill={shirtColor} stroke="#ffffff" strokeOpacity=".7" strokeWidth="2" />}
        {design.shirtDetail === 'buttons' && <><circle cx="210" cy="267" r="3" fill="#fff" /><circle cx="210" cy="290" r="3" fill="#fff" /><circle cx="210" cy="313" r="3" fill="#fff" /></>}
        <path d={`M${210 - neckWidth / 2} 173h${neckWidth}v55h-${neckWidth}Z`} fill={design.skin} />
        {design.head === 'angular' ? <path d="M151 111Q151 60 210 60Q269 60 269 111L263 166L237 191H183L157 166Z" fill={design.skin} /> : <ellipse cx="210" cy="126" rx={design.head === 'round' ? 61 : 60} ry={design.head === 'round' ? 68 : 73} fill={design.skin} />}
        <path d={`M151 123c0-46 25-79 59-79s59 33 59 79c-14-21-37-34-59-34s-45 13-59 34Z`} fill={hairColor} opacity=".2" />
        <Hair design={design.hair} hairColor={hairColor} />
        <path d="M178 126q9-7 18 0M224 126q9-7 18 0" fill="none" stroke="#3c2a2a" strokeWidth="3" strokeLinecap="round" />
        <circle cx="187" cy="138" r="4" fill="#27343a" /><circle cx="233" cy="138" r="4" fill="#27343a" />
        <path d="M204 154q6 4 12 0" fill="none" stroke="#a65e59" strokeWidth="2.5" strokeLinecap="round" />
        {design.hair === 'ponytail' && <circle cx="273" cy="99" r="20" fill={hairColor} />}
        {design.shoes === 'boots' && <><path d={`M${174 - (bodyScale - 1) * 10} ${shoeY - 8}h38v24h-38Z`} fill={shoeColor} /><path d={`M${246 + (bodyScale - 1) * 10} ${shoeY - 8}h-38v24h38Z`} fill={shoeColor} /></>}
        <path d={`M${210 - legGap - 9 - shoeWidth / 2} ${shoeY}h${shoeWidth}q8 0 19 14h-58q4-14 19-14Z`} fill={shoeColor} />
        <path d={`M${210 + legGap + 9 - shoeWidth / 2} ${shoeY}h${shoeWidth}q8 0 19 14h-58q4-14 19-14Z`} fill={shoeColor} />
        {design.shoes === 'sneakers' && <><path d={`M${177 - shoeWidth / 2} ${shoeY + 11}h51`} stroke="#ffffff" strokeOpacity=".6" strokeWidth="3" /><path d={`M${223 - shoeWidth / 2} ${shoeY + 11}h51`} stroke="#ffffff" strokeOpacity=".6" strokeWidth="3" /></>}
      </g>
    </svg>
  );
}

function ControlSection({ part, design, setDesign }: { part: Part; design: CharacterDesign; setDesign: React.Dispatch<React.SetStateAction<CharacterDesign>> }) {
  if (part === 'head') return <><div className="character-editor-title"><span>Head & hair</span><small>Shape the identity first</small></div><div className="character-control-block"><div className="character-control-label"><span>Head shape</span><span className="character-control-muted">3 options</span></div><ChoiceCards choices={HEAD_CHOICES} value={design.head} onChange={value => updateDesign(setDesign, { head: value as CharacterDesign['head'] })} /></div><div className="character-control-block"><div className="character-control-label"><span>Hair style</span><span className="character-control-muted">6 options</span></div><ChoiceCards choices={HAIR_CHOICES} value={design.hair} onChange={value => updateDesign(setDesign, { hair: value as HairStyle })} /></div><Swatches label="Skin tone" colors={SKIN_TONES} value={design.skin} onChange={skin => updateDesign(setDesign, { skin })} /><Swatches label="Hair color" colors={HAIR_COLORS} value={design.hairColor} onChange={hairColor => updateDesign(setDesign, { hairColor })} /></>;
  if (part === 'neck') return <><div className="character-editor-title"><span>Neck & frame</span><small>Balance the silhouette</small></div><div className="character-control-block"><div className="character-control-label"><span>Neck build</span><span className="character-control-muted">Body connection</span></div><ChoiceCards choices={NECK_CHOICES} value={design.neck} onChange={value => updateDesign(setDesign, { neck: value as NeckStyle })} /></div><div className="character-tip"><CircleDot size={15} /><span>The neck updates the collar connection while keeping the head easy to swap later.</span></div></>;
  if (part === 'shirt') return <ShirtCustomization design={design} setDesign={setDesign} />;
  if (part === 'pants') return <><div className="character-editor-title"><span>Pants</span><small>Set the lower silhouette</small></div><div className="character-control-block"><div className="character-control-label"><span>Pants style</span><span className="character-control-muted">4 options</span></div><ChoiceCards choices={PANTS_CHOICES} value={design.pants} onChange={value => updateDesign(setDesign, { pants: value as PantsStyle })} /></div><Swatches label="Pants color" colors={PANTS_COLORS} value={design.pantsColor} onChange={pantsColor => updateDesign(setDesign, { pantsColor })} /></>;
  if (part === 'shoes') return <><div className="character-editor-title"><span>Shoes</span><small>Finish the character</small></div><div className="character-control-block"><div className="character-control-label"><span>Shoe style</span><span className="character-control-muted">3 options</span></div><ChoiceCards choices={SHOE_CHOICES} value={design.shoes} onChange={value => updateDesign(setDesign, { shoes: value as ShoesStyle })} /></div><Swatches label="Shoe color" colors={SHOE_COLORS} value={design.shoesColor} onChange={shoesColor => updateDesign(setDesign, { shoesColor })} /></>;
  return <><div className="character-editor-title"><span>Full character</span><small>Start from a complete outfit</small></div><div className="character-preset-grid">{PRESETS.map(preset => <button key={preset.id} type="button" className="character-preset-card" onClick={() => updateDesign(setDesign, preset.design)}><span className="character-preset-color" style={{ background: preset.color }} /><strong>{preset.name}</strong><small>{preset.detail}</small><span className="character-preset-apply">Apply <Check size={11} /></span></button>)}</div><div className="character-control-block character-proportion-block"><div className="character-control-label"><span>Height</span><output>{design.height}%</output></div><input type="range" min="0" max="100" value={design.height} onChange={event => updateDesign(setDesign, { height: Number(event.target.value) })} /><div className="character-control-label"><span>Build</span><output>{design.build}%</output></div><input type="range" min="0" max="100" value={design.build} onChange={event => updateDesign(setDesign, { build: Number(event.target.value) })} /></div><div className="character-tip"><Sparkles size={15} /><span>Choose a preset, then refine individual parts from the left rail.</span></div></>;
}

function ShirtCustomization({ design, setDesign }: { design: CharacterDesign; setDesign: React.Dispatch<React.SetStateAction<CharacterDesign>> }) {
  const [tab, setTab] = useState<'color' | 'pattern' | 'design' | 'details'>('color');
  return <>
    <div className="character-editor-title"><span>Shirt customization</span><small>Design the upper clothing layer</small></div>
    <div className="shirt-customization-tabs" role="tablist" aria-label="Shirt customization"><button type="button" role="tab" aria-selected={tab === 'color'} className={tab === 'color' ? 'active' : ''} onClick={() => setTab('color')}>Color</button><button type="button" role="tab" aria-selected={tab === 'pattern'} className={tab === 'pattern' ? 'active' : ''} onClick={() => setTab('pattern')}>Pattern</button><button type="button" role="tab" aria-selected={tab === 'design'} className={tab === 'design' ? 'active' : ''} onClick={() => setTab('design')}>Design</button><button type="button" role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'active' : ''} onClick={() => setTab('details')}>Details</button></div>
    {tab === 'color' && <section className="shirt-customization-section"><div className="shirt-customization-heading"><span>Shirt color</span><small>Pick a base color</small></div><Swatches label="Top color" colors={SHIRT_COLORS} value={design.shirtColor} onChange={shirtColor => updateDesign(setDesign, { shirtColor })} /></section>}
    {tab === 'pattern' && <section className="shirt-customization-section"><div className="shirt-customization-heading"><span>Pattern / texture</span><small>Choose a surface treatment</small></div><ShirtPatternCards choices={SHIRT_PATTERN_CHOICES} value={design.shirtPattern} onChange={shirtPattern => updateDesign(setDesign, { shirtPattern: shirtPattern as CharacterDesign['shirtPattern'] })} kind="pattern" /></section>}
    {tab === 'design' && <section className="shirt-customization-section"><div className="shirt-customization-heading"><span>Shirt type</span><small>Choose the main silhouette</small></div><ShirtPatternCards choices={SHIRT_CHOICES} value={design.shirt} onChange={shirt => updateDesign(setDesign, { shirt: shirt as CharacterDesign['shirt'] })} kind="detail" /></section>}
    {tab === 'details' && <section className="shirt-customization-section"><div className="shirt-customization-heading"><span>Shirt details</span><small>Layer on finishing touches</small></div><ShirtPatternCards choices={SHIRT_DETAIL_CHOICES} value={design.shirtDetail} onChange={shirtDetail => updateDesign(setDesign, { shirtDetail: shirtDetail as CharacterDesign['shirtDetail'] })} kind="detail" /></section>}
    <div className="shirt-customization-summary"><span>Active shirt</span><strong>{SHIRT_CHOICES.find(item => item.id === design.shirt)?.label} · {SHIRT_PATTERN_CHOICES.find(item => item.id === design.shirtPattern)?.label}</strong><small>{SHIRT_DETAIL_CHOICES.find(item => item.id === design.shirtDetail)?.label} detail</small></div>
  </>;
}

function QuickSection({ number, title, accent, children, onSelect }: { number: string; title: string; accent: 'blue' | 'pink'; children: React.ReactNode; onSelect: () => void }) {
  return <section className={`character-quick-section ${accent}`}><div className="character-quick-heading"><span className="character-quick-number">{number}</span><strong>{title}</strong><button type="button" onClick={onSelect}>View all <span>›</span></button></div><div className="character-quick-options">{children}</div></section>;
}

function QuickOption({ label, active, accent, onClick, visual }: { label: string; active?: boolean; accent: 'blue' | 'pink'; onClick?: () => void; visual?: string }) {
  return <button type="button" className={`character-quick-option ${accent} ${active ? 'active' : ''}`} onClick={onClick}><span className={`character-option-art ${visual ?? ''}`}><i /></span><span>{label}</span>{active && <Check size={11} />}</button>;
}

function QuickKitPanel({ design, setDesign, setPart }: { design: CharacterDesign; setDesign: React.Dispatch<React.SetStateAction<CharacterDesign>>; setPart: (part: Part) => void }) {
  const accent = design.gender === 'female' ? 'pink' : 'blue';
  const set = (patch: Partial<CharacterDesign>, part: Part) => { updateDesign(setDesign, patch); setPart(part); };
  return <aside className={`character-quick-panel ${accent}`} aria-label="Quick character builder">
    <div className="character-quick-panel-head"><div><span className="character-eyebrow">QUICK BUILDER</span><h2>{design.gender === 'female' ? 'Female' : 'Male'} details</h2></div><span className="character-quick-ready"><span /> Ready</span></div>
    <QuickSection number="1" title="Head / face" accent={accent} onSelect={() => setPart('head')}>
      {HEAD_CHOICES.map((choice, index) => <QuickOption key={choice.id} label={choice.label} visual={`head-${index + 1}`} active={design.head === choice.id} accent={accent} onClick={() => set({ head: choice.id as CharacterDesign['head'] }, 'head')} />)}
    </QuickSection>
    <QuickSection number="2" title="Hair style" accent={accent} onSelect={() => setPart('head')}>
      {HAIR_CHOICES.slice(0, 5).map((choice, index) => <QuickOption key={choice.id} label={choice.label} visual={`hair-${index + 1}`} active={design.hair === choice.id} accent={accent} onClick={() => set({ hair: choice.id as CharacterDesign['hair'] }, 'head')} />)}
    </QuickSection>
    <QuickSection number="3" title="Upper clothing" accent={accent} onSelect={() => setPart('shirt')}>
      {SHIRT_CHOICES.map((choice, index) => <QuickOption key={choice.id} label={choice.label} visual={`shirt-${index + 1}`} active={design.shirt === choice.id} accent={accent} onClick={() => set({ shirt: choice.id as CharacterDesign['shirt'] }, 'shirt')} />)}
    </QuickSection>
    <QuickSection number="4" title="Lower clothing" accent={accent} onSelect={() => setPart('pants')}>
      {PANTS_CHOICES.map((choice, index) => <QuickOption key={choice.id} label={choice.label} visual={`pants-${index + 1}`} active={design.pants === choice.id} accent={accent} onClick={() => set({ pants: choice.id as CharacterDesign['pants'] }, 'pants')} />)}
    </QuickSection>
    <QuickSection number="5" title="Full outfit" accent={accent} onSelect={() => setPart('full')}>
      {PRESETS.map((preset, index) => <QuickOption key={preset.id} label={preset.name.replace('Studio basic', 'Basic').replace('Street ready', 'Street').replace('Full suit', 'Suit').replace('Weekend', 'Weekend')} visual={`outfit-${index + 1}`} accent={accent} onClick={() => { updateDesign(setDesign, preset.design); setPart('full'); }} />)}
    </QuickSection>
    <QuickSection number="6" title="Shoes" accent={accent} onSelect={() => setPart('shoes')}>
      {SHOE_CHOICES.map((choice, index) => <QuickOption key={choice.id} label={choice.label} visual={`shoe-${index + 1}`} active={design.shoes === choice.id} accent={accent} onClick={() => set({ shoes: choice.id as CharacterDesign['shoes'] }, 'shoes')} />)}
    </QuickSection>
    <div className="character-accessory-strip"><span>Accessories</span><button type="button" onClick={() => setPart('head')}><span>◌</span> Glasses</button><button type="button" onClick={() => setPart('full')}><span>◇</span> Bag</button><button type="button" onClick={() => setPart('neck')}><span>✦</span> Scarf</button></div>
  </aside>;
}

export function CharacterStudioPanel({ onClose, onStatus, onApply, onExport, onImport }: { onClose: () => void; onStatus: (message: string) => void; onApply: (design: CharacterDesign) => void; onExport: (design: CharacterDesign) => void; onImport: (file: File) => void }) {
  const [design, setDesign] = useState<CharacterDesign>(() => {
    try { return normalizeCharacterDesign(JSON.parse(window.localStorage.getItem('character-studio-design:v1') ?? 'null')); } catch { return { ...DEFAULT_CHARACTER_DESIGN }; }
  });
  const [part, setPart] = useState<Part>('full');
  const importInput = useRef<HTMLInputElement>(null);

  const reset = () => { setDesign({ ...DEFAULT_CHARACTER_DESIGN }); setPart('full'); onStatus('Character design reset to the starter look'); };
  const saveToBrowser = () => {
    try { window.localStorage.setItem('character-studio-design:v1', JSON.stringify(design)); onStatus('Character design saved in this browser'); } catch { onStatus('Character design ready · browser storage is unavailable'); }
  };
  const randomize = () => {
    const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
    setDesign(previous => ({
      ...previous,
      gender: pick(['male', 'female'] as const),
      head: pick(['oval', 'round', 'angular'] as const),
      hair: pick(['crop', 'bob', 'curls', 'long', 'ponytail', 'fade'] as const),
      shirt: pick(['tee', 'hoodie', 'jacket', 'blouse'] as const),
      pants: pick(['straight', 'wide', 'joggers', 'shorts'] as const),
      shoes: pick(['sneakers', 'boots', 'loafers'] as const),
      shirtColor: pick(SHIRT_COLORS), pantsColor: pick(PANTS_COLORS), shoesColor: pick(SHOE_COLORS), hairColor: pick(HAIR_COLORS), skin: pick(SKIN_TONES),
    }));
    setPart('full');
    onStatus('Random character design generated');
  };
  const apply = () => onApply(design);

  return <div className="character-studio-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="character-studio-dialog" role="dialog" aria-modal="true" aria-labelledby="character-studio-title">
      <header className="character-studio-header">
        <div className="character-studio-heading"><span className="character-studio-icon"><Sparkles size={26} /></span><div><div className="character-eyebrow">EASY CHARACTER BUILDER</div><h1 id="character-studio-title">Character studio</h1><p>Create and customize characters easily</p></div></div>
        <div className="character-studio-header-center"><div className="character-gender-switch" role="group" aria-label="Character gender"><button type="button" aria-pressed={design.gender === 'male'} className={design.gender === 'male' ? 'active male' : 'male'} onClick={() => updateDesign(setDesign, { gender: 'male' })}><UserRound size={18} /> Male</button><button type="button" aria-pressed={design.gender === 'female'} className={design.gender === 'female' ? 'active female' : 'female'} onClick={() => updateDesign(setDesign, { gender: 'female' })}><UserRound size={18} /> Female</button></div></div>
         <div className="character-studio-header-actions"><button type="button" className="character-header-action import" onClick={() => importInput.current?.click()}><Upload size={15} /> Import JSON</button><input ref={importInput} className="hidden-input" type="file" accept="application/json,.json" aria-label="Import Character Studio JSON" onChange={event => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ''; }} /><button type="button" className="character-header-action" onClick={randomize}><Shuffle size={15} /> Random</button><button type="button" className="character-header-action" onClick={saveToBrowser}><Save size={15} /> Save</button><button type="button" className="character-header-action purple" onClick={() => onExport(design)}><Download size={15} /> Export</button><button type="button" className="character-close-button" onClick={onClose} aria-label="Close character studio"><X size={18} /></button></div>
      </header>
      <div className="character-studio-toolbar"><span><Sparkles size={14} /> Build your character from head to shoes</span><div><span className="character-live-dot" /> Live preview <span className="character-toolbar-divider" /> Changes update the preview</div></div>
      <div className="character-studio-body">
        <nav className="character-part-rail" aria-label="Character parts"><div className="character-rail-label">DESIGN PARTS</div>{PARTS.map(item => <button type="button" key={item.id} className={part === item.id ? 'active' : ''} onClick={() => setPart(item.id)} aria-current={part === item.id ? 'page' : undefined}>{item.icon}<span>{item.label}</span>{part === item.id && <i />}</button>)}<div className="character-rail-note"><strong>Easy workflow</strong><span>Choose a part, pick a style, and watch the full character update.</span></div></nav>
        <section className="character-studio-editor" aria-label={`${part} controls`}><ControlSection part={part} design={design} setDesign={setDesign} /></section>
        <section className="character-preview-panel" aria-label="Character preview"><div className="character-preview-top"><div><span className="character-eyebrow">LIVE CHARACTER CANVAS</span><h2>{design.gender === 'female' ? 'Female' : 'Male'} character</h2></div><span className="character-preview-status"><span className="character-live-dot" /> Ready</span></div><div className="character-preview-canvas character-preview-single"><div className={`character-preview-person ${design.gender}`}><span className="character-person-label">{design.gender.toUpperCase()}</span><CharacterPreview design={design} /></div><div className="character-preview-badge"><span>360° ready</span><small>Front view · live</small></div></div><div className="character-preview-tools"><button type="button" onClick={() => setPart('full')}><Sparkles size={13} /> Pose</button><button type="button" onClick={() => onStatus('Character rotation preview ready')}><RotateCcw size={13} /> Rotate</button><button type="button" onClick={() => setPart('head')}><ScanFace size={13} /> Details</button></div><div className="character-preview-summary"><div><span>Head</span><strong>{HAIR_CHOICES.find(item => item.id === design.hair)?.label}</strong></div><div><span>Top</span><strong>{SHIRT_CHOICES.find(item => item.id === design.shirt)?.label}</strong></div><div><span>Bottom</span><strong>{PANTS_CHOICES.find(item => item.id === design.pants)?.label}</strong></div><div><span>Footwear</span><strong>{SHOE_CHOICES.find(item => item.id === design.shoes)?.label}</strong></div></div></section>
        <QuickKitPanel design={design} setDesign={setDesign} setPart={setPart} />
      </div>
      <footer className="character-studio-footer"><div className="character-footer-note"><span className="character-footer-check"><Check size={12} /></span><span>Design is editable after it is added to your rig</span></div><div className="character-footer-actions"><button type="button" className="character-secondary-action" onClick={reset}><RotateCcw size={13} /> Reset</button><button type="button" className="character-primary-action" onClick={apply}><Sparkles size={15} /> Add character to stage</button></div></footer>
    </section>
  </div>;
}
