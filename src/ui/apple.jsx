// ── Apple-style UI kit ───────────────────────────────────────
// Tokens follow Apple's Human Interface Guidelines for the dark
// appearance: system backgrounds, label hierarchy, fills, separators and
// system colors. Components mirror their UIKit / SwiftUI counterparts
// (search field, segmented control, inset grouped list, capsule badges)
// so the Schedule page reads like a native Apple app.
import { useLayoutEffect, useRef, useState } from 'react';
import { SYS, PM_COLORS } from '../scheduleUtils.js';

export const A = {
  ...SYS,
  bg: '#000000',
  cell: '#1C1C1E',          // secondarySystemGroupedBackground
  cell2: '#2C2C2E',         // tertiarySystemGroupedBackground
  cell3: '#3A3A3C',
  label: '#FFFFFF',
  label2: 'rgba(235,235,245,0.6)',
  label3: 'rgba(235,235,245,0.3)',
  label4: 'rgba(235,235,245,0.18)',
  sep: 'rgba(84,84,88,0.65)',
  fill: 'rgba(120,120,128,0.36)',
  fill2: 'rgba(120,120,128,0.32)',
  fill3: 'rgba(118,118,128,0.24)',
  fill4: 'rgba(116,116,128,0.18)',
  tint: SYS.blue,
  font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Inter, system-ui, sans-serif',
  bar: 'rgba(22,22,24,0.78)', // translucent bar material
};

// Hex color + alpha (0–1) → #RRGGBBAA
export function tint(hex, a) {
  const h = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
  return `${hex}${h}`;
}

// Global stylesheet for the Apple look — injected once by the app shell.
export const APPLE_CSS = `
  html, body { background:${A.bg}; }
  body { font-family:${A.font}; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; letter-spacing:-0.01em; }
  .tnum { font-variant-numeric: tabular-nums; }
  .ap-btn { font-family:inherit; -webkit-tap-highlight-color:transparent; }
  .ap-btn:focus-visible, .ap-focus:focus-visible { outline:3px solid ${tint(SYS.blue, 0.55)}; outline-offset:2px; }
  .ap-press:active { opacity:0.55; }
  .ap-row { transition: background-color .12s ease; }
  .ap-row:hover { background-color: rgba(255,255,255,0.045); }
  .ap-row.ap-tap { cursor:pointer; }
  .ap-row.ap-tap:active { background-color: rgba(255,255,255,0.09); }
  .ap-search::placeholder { color:${A.label2}; }
  .ap-search::-webkit-search-cancel-button { display:none; }
  .ap-hscroll { scrollbar-width:none; }
  .ap-hscroll::-webkit-scrollbar { display:none; }
  @keyframes apSpin { to { transform: rotate(360deg); } }
  @keyframes apFade { from { opacity:0; transform: translateY(4px); } to { opacity:1; transform:none; } }
  .ap-fade { animation: apFade .22s ease-out both; }
  @media (prefers-reduced-motion: reduce) {
    .ap-fade { animation:none; }
    * { transition-duration: 0s !important; }
  }
`;

// ── SF Symbols–style icons (hand-drawn SVG, stroke-based) ────
const P = {
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" /></>,
  xmarkCircle: <><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" /><path d="M9 9l6 6M15 9l-6 6" stroke="#1C1C1E" strokeWidth="2" /></>,
  tv: <><rect x="3" y="5" width="18" height="12" rx="2.5" /><path d="M8 20.5h8" /></>,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4.2h-4.2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  listBullet: <><path d="M9 7h11M9 12h11M9 17h11" /><circle cx="4.8" cy="7" r="1" fill="currentColor" /><circle cx="4.8" cy="12" r="1" fill="currentColor" /><circle cx="4.8" cy="17" r="1" fill="currentColor" /></>,
  week: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M9.2 10v10.5M14.8 10v10.5" /></>,
  person2: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="16.5" cy="9" r="2.6" /><path d="M16.2 13.8c2.3.1 3.9 1.7 4.4 4.4" /></>,
  personCard: <><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2.3" /><path d="M5.8 16.2c.5-1.7 1.7-2.6 3.2-2.6s2.7.9 3.2 2.6M14.5 10h4M14.5 13.5h3" /></>,
  paperplane: <><path d="M20.5 3.5L3.5 11l6.6 2.4L12.6 20z" /><path d="M20.5 3.5l-10.4 9.9" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  checkmark: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  truck: <><path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3v3h-7" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  warning: <><path d="M12 4l9 15.5H3z" /><path d="M12 10v4.2" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></>,
  arrowTurn: <><path d="M5 7h9a5 5 0 0 1 0 10H9" /><path d="M11 3.5L14.5 7 11 10.5" transform="translate(0 0)" /></>,
  arrowRight: <path d="M4 12h15M13.5 6.5L19 12l-5.5 5.5" />,
  person: <><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" /></>,
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  xmark: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r=".7" fill="currentColor" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  pencil: <><path d="M14.5 5.5l4 4L8 20H4v-4z" /><path d="M12.5 7.5l4 4" /></>,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>,
  trash: <><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /></>,
  phone: <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z" />,
  envelope: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M4 7l8 6 8-6" /></>,
  doc: <><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 15.5h6" /></>,
  twoArrows: <><path d="M4 8h14M14.5 4.5L18 8l-3.5 3.5M20 16H6M9.5 12.5L6 16l3.5 3.5" /></>,
};
export function Icon({ name, size = 18, color = 'currentColor', weight = 1.9, style, title }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={weight}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}
      style={{ flexShrink: 0, display: 'block', ...style }}>
      {title && <title>{title}</title>}
      {P[name]}
    </svg>
  );
}

// ── Capsule badge (tinted, like iOS status tags) ─────────────
export function Capsule({ color = A.gray, children, title, solid = false, size = 11, style }) {
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
      fontSize: size, fontWeight: 600, lineHeight: 1, padding: '3px 7px', borderRadius: 999,
      background: solid ? color : tint(color, 0.18), color: solid ? '#fff' : color,
      textDecoration: 'none', verticalAlign: 'middle', letterSpacing: 0, ...style,
    }}>{children}</span>
  );
}

export function PMBadge({ initials, size = 'md' }) {
  if (!initials) return <span style={{ color: A.label3 }}>–</span>;
  const k = String(initials).toUpperCase();
  const c = PM_COLORS[k] || A.gray;
  const d = size === 'sm' ? 20 : 24;
  return (
    <span title={`Project manager ${k}`} className="tnum" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: d, height: d, padding: '0 6px', borderRadius: 999, background: c, color: '#fff',
      fontSize: size === 'sm' ? 10.5 : 12, fontWeight: 700, letterSpacing: 0.2,
    }}>{k}</span>
  );
}

export function QualBadge({ code }) {
  if (!code) return null;
  const m = { T: [SYS.blue, 'Truck driver'], V: [SYS.orange, 'Van driver'], A: [SYS.green, 'Apprentice'] };
  const [c, t] = m[code] || [SYS.gray, code];
  return <Capsule color={c} size={10} title={t} style={{ marginLeft: 5, padding: '2px 5px' }}>{code}</Capsule>;
}

// Column N "Job folder": y = folder needed (not yet done), SM = done by
// Stephanie MacFarland, SM Half = partial, n = not needed, blank = unmarked.
export function FolderIcon({ val }) {
  const v = (val || '').toLowerCase();
  if (v === 'sm') return <Capsule color={SYS.green} title="Folder done by Stephanie MacFarland"><Icon name="checkmark" size={10} weight={2.6} />SM</Capsule>;
  if (v === 'sm-half') return <Capsule color={SYS.cyan} title="Folder partly done by Stephanie MacFarland">SM ½</Capsule>;
  if (v === 'y') return <Capsule color={SYS.orange} title="Needs a job folder — not done yet"><Icon name="folder" size={10} weight={2.2} />Needed</Capsule>;
  if (v === 'n') return <span title="No folder needed" style={{ color: A.label3, fontSize: 13 }}>–</span>;
  return <span title="Not marked" style={{ color: A.label4, fontSize: 13 }}>–</span>;
}

// ── Search field (UISearchBar look) ──────────────────────────
export function SearchField({ value, onChange, placeholder, large, inputRef, onKeyDown, ariaLabel }) {
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: A.label2, pointerEvents: 'none' }}>
        <Icon name="search" size={large ? 18 : 16} weight={2.1} />
      </span>
      <input ref={inputRef} type="search" value={value} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
        placeholder={placeholder} aria-label={ariaLabel || placeholder} className="ap-search ap-focus"
        autoComplete="off" autoCorrect="off" spellCheck={false}
        style={{
          width: '100%', height: large ? 40 : 36, borderRadius: 10, border: 'none', outline: 'none',
          background: A.fill3, color: A.label, fontFamily: 'inherit',
          fontSize: large ? 17 : 15, padding: `0 ${value ? 34 : 12}px 0 ${large ? 34 : 31}px`,
        }} />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="ap-btn ap-press"
          style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: A.label3 }}>
          <Icon name="xmarkCircle" size={18} />
        </button>
      )}
    </div>
  );
}

// ── Segmented control (UISegmentedControl, dark) ─────────────
// Equal-width segments with a sliding thumb.
export function Segmented({ options, value, onChange, size = 'md', ariaLabel, fullWidth = true, style }) {
  const idx = Math.max(0, options.findIndex(o => o.id === value));
  const n = options.length;
  const h = size === 'lg' ? 36 : size === 'sm' ? 28 : 32;
  return (
    <div role="tablist" aria-label={ariaLabel} style={{
      position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
      background: A.fill3, borderRadius: 9, padding: 2, height: h, width: fullWidth ? '100%' : 'auto', ...style,
    }}>
      <span aria-hidden style={{
        position: 'absolute', top: 2, bottom: 2, left: 2, width: `calc((100% - 4px) / ${n})`,
        transform: `translateX(${idx * 100}%)`, transition: 'transform .25s cubic-bezier(.3,.7,.3,1)',
        background: '#636366', borderRadius: 7, boxShadow: '0 3px 8px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(0,0,0,0.1)',
      }} />
      {options.map(o => {
        const on = o.id === value;
        return (
          <button key={o.id} role="tab" aria-selected={on} onClick={() => onChange(o.id)} className="ap-btn" style={{
            position: 'relative', zIndex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
            color: A.label, fontSize: size === 'sm' ? 12 : 13, fontWeight: on ? 600 : 500, padding: '0 8px',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            {o.label}
            {o.badge > 0 && <span className="tnum" style={{ minWidth: 17, height: 17, padding: '0 5px', borderRadius: 999, background: SYS.red, color: '#fff', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{o.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Horizontally scrolling token chips — the phone-width fallback for a
// segmented control with too many segments to fit.
export function ChipBar({ options, value, onChange, ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="ap-hscroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
      {options.map(o => {
        const on = o.id === value;
        return (
          <button key={o.id} role="tab" aria-selected={on} onClick={() => onChange(o.id)} className="ap-btn ap-press" style={{
            flexShrink: 0, height: 32, padding: '0 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: on ? A.label : A.fill3, color: on ? '#000' : A.label, fontSize: 14, fontWeight: on ? 600 : 500,
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// ── Buttons ──────────────────────────────────────────────────
export function PlainButton({ children, onClick, color = A.tint, disabled, style, title, ariaLabel }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={ariaLabel} className="ap-btn ap-press" style={{
      background: 'none', border: 'none', padding: '4px 6px', cursor: disabled ? 'default' : 'pointer',
      color: disabled ? A.label3 : color, fontSize: 15, fontWeight: 400, display: 'inline-flex', alignItems: 'center', gap: 4, ...style,
    }}>{children}</button>
  );
}
export function TintedButton({ children, onClick, color = A.tint, style, title, ariaLabel }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={ariaLabel} className="ap-btn ap-press" style={{
      background: tint(color, 0.16), color, border: 'none', borderRadius: 999, padding: '6px 13px', cursor: 'pointer',
      fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', ...style,
    }}>{children}</button>
  );
}
export function CircleButton({ icon, onClick, ariaLabel, title, disabled, size = 32 }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel} title={title || ariaLabel} className="ap-btn ap-press" style={{
      width: size, height: size, borderRadius: '50%', border: 'none', background: A.fill3, color: disabled ? A.label3 : A.label,
      cursor: disabled ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}><Icon name={icon} size={size * 0.52} weight={2.3} /></button>
  );
}

// ── Activity indicator (UIActivityIndicatorView) ─────────────
export function Spinner({ size = 16, color = A.label2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'apSpin 1s steps(8) infinite', flexShrink: 0 }} aria-label="Loading">
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x="11" y="2" width="2.2" height="6" rx="1.1" fill={color}
          opacity={0.25 + (i / 8) * 0.75} transform={`rotate(${i * 45} 12 12)`} />
      ))}
    </svg>
  );
}

// ── Avatar (Contacts-style initials) ─────────────────────────
export function initialsOf(name) {
  const parts = String(name || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
export function Avatar({ name, color, size = 36, text }) {
  const bg = color
    ? `linear-gradient(180deg, ${color}, ${tint(color, 0.72)})`
    : 'linear-gradient(180deg, #A5ABB8, #858994)';
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: '50%', background: bg, color: '#fff', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 600, letterSpacing: 0.3,
    }}>{text || initialsOf(name)}</span>
  );
}

// ── Inset grouped list pieces ────────────────────────────────
export function Group({ children, style }) {
  return <div style={{ background: A.cell, borderRadius: 12, overflow: 'hidden', ...style }}>{children}</div>;
}
export function SectionHeader({ children, right, style, id }) {
  return (
    <div id={id} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '0 4px 7px', ...style }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: A.label, minWidth: 0 }}>{children}</div>
      {right && <div style={{ fontSize: 13, color: A.label2, whiteSpace: 'nowrap' }}>{right}</div>}
    </div>
  );
}
export function SectionFooter({ children, style }) {
  return <div style={{ fontSize: 13, color: A.label2, padding: '7px 4px 0', lineHeight: 1.45, ...style }}>{children}</div>;
}
// Hairline separator inset from the leading edge like a UITableView cell
export function Separator({ inset = 16 }) {
  return <div style={{ height: 0.5, background: A.sep, marginLeft: inset }} />;
}

// Highlight every occurrence of `q` inside `text` (Spotlight-style bolding)
export function Highlight({ text, q }) {
  const s = String(text ?? '');
  const needle = String(q || '').trim().toLowerCase();
  if (!needle || !s) return s;
  const lower = s.toLowerCase();
  const out = []; let i = 0; let k = 0;
  while (i < s.length) {
    const j = lower.indexOf(needle, i);
    if (j < 0) { out.push(s.slice(i)); break; }
    if (j > i) out.push(s.slice(i, j));
    out.push(<mark key={k++} style={{ background: tint(SYS.yellow, 0.28), color: 'inherit', borderRadius: 3, padding: '0 1px' }}>{s.slice(j, j + needle.length)}</mark>);
    i = j + needle.length;
  }
  return <>{out}</>;
}

// Track an element's width (for switching layouts inside a container)
export function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ── Filled button (prominent) ────────────────────────────────
export function FilledButton({ children, onClick, color = A.tint, disabled, style, title, ariaLabel, type = 'button' }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} aria-label={ariaLabel} className="ap-btn ap-press" style={{
      background: disabled ? A.fill3 : color, color: disabled ? A.label3 : '#fff', border: 'none', borderRadius: 10,
      padding: '8px 16px', cursor: disabled ? 'default' : 'pointer', fontSize: 15, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap', ...style,
    }}>{children}</button>
  );
}
// Gray bordered-less button (UIButton .gray)
export function GrayButton({ children, onClick, disabled, style, title, color = A.label, ariaLabel }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={ariaLabel} className="ap-btn ap-press" style={{
      background: A.fill3, color: disabled ? A.label3 : color, border: 'none', borderRadius: 10, padding: '8px 14px',
      cursor: disabled ? 'default' : 'pointer', fontSize: 15, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', ...style,
    }}>{children}</button>
  );
}

// ── iOS switch ───────────────────────────────────────────────
export function Switch({ checked, onChange, ariaLabel, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={ariaLabel} disabled={disabled}
      onClick={() => onChange(!checked)} className="ap-btn" style={{
        width: 51, height: 31, borderRadius: 999, border: 'none', padding: 2, cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
        background: checked ? A.green : A.fill, transition: 'background-color .2s ease', opacity: disabled ? 0.5 : 1, position: 'relative',
      }}>
      <span style={{ display: 'block', width: 27, height: 27, borderRadius: '50%', background: '#fff', boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 3px 1px rgba(0,0,0,0.06)',
        transform: `translateX(${checked ? 20 : 0}px)`, transition: 'transform .22s cubic-bezier(.3,.7,.3,1)' }} />
    </button>
  );
}

// ── Form fields ──────────────────────────────────────────────
export const fieldStyle = {
  width: '100%', height: 38, borderRadius: 9, border: 'none', outline: 'none', background: A.fill4, color: A.label,
  fontFamily: 'inherit', fontSize: 15, padding: '0 11px',
};
export function TextInput({ value, onChange, onBlur, placeholder, readOnly, invalid, style, ariaLabel, type = 'text' }) {
  return <input type={type} value={value ?? ''} onChange={e => onChange?.(e.target.value)} onBlur={onBlur} placeholder={placeholder} readOnly={readOnly}
    aria-label={ariaLabel || placeholder} aria-invalid={invalid || undefined} className="ap-search ap-focus"
    style={{ ...fieldStyle, color: readOnly ? A.label2 : A.label, boxShadow: invalid ? `inset 0 0 0 1.5px ${A.red}` : 'none', ...style }} />;
}
export function SelectField({ value, onChange, children, style, ariaLabel }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={ariaLabel} className="ap-focus"
        style={{ ...fieldStyle, appearance: 'none', WebkitAppearance: 'none', paddingRight: 30, cursor: 'pointer' }}>{children}</select>
      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%) rotate(90deg)', color: A.label2, pointerEvents: 'none' }}>
        <Icon name="chevronRight" size={13} weight={2.4} />
      </span>
    </div>
  );
}
// Settings-style row: label on the left, control on the right
export function FormRow({ label, hint, children, first, stacked }) {
  return (
    <div style={{ padding: '0 16px' }}>
      <div style={{ display: 'flex', flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'stretch' : 'center', gap: stacked ? 6 : 12,
        padding: '10px 0', borderTop: first ? 'none' : `0.5px solid ${A.sep}`, minHeight: 44 }}>
        <div style={{ flex: stacked ? undefined : 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, color: A.label }}>{label}</div>
          {hint && <div style={{ fontSize: 12, color: A.label2, marginTop: 2 }}>{hint}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Sheet (modal card; bottom sheet on phones) ───────────────
export function Sheet({ open, onClose, title, subtitle, children, isMobile, accessory, width = 560 }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!open) return;
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 24 }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={e => e.stopPropagation()} className="ap-fade"
        style={{ outline: 'none', width: '100%', maxWidth: isMobile ? 'none' : width, maxHeight: isMobile ? '88vh' : '84vh', overflow: 'auto',
          background: A.cell, borderRadius: isMobile ? '14px 14px 0 0' : 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          paddingBottom: isMobile ? 'calc(16px + env(safe-area-inset-bottom))' : 16 }}>
        {isMobile && <div style={{ width: 36, height: 5, borderRadius: 3, background: A.fill, margin: '7px auto 0' }} />}
        <div style={{ position: 'sticky', top: 0, zIndex: 1, background: A.cell, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px 12px', borderBottom: `0.5px solid ${A.sep}` }}>
          {accessory}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: A.label2, marginTop: 1 }}>{subtitle}</div>}
          </div>
          <CircleButton icon="xmark" onClick={onClose} ariaLabel="Close" size={30} />
        </div>
        <div style={{ padding: '16px 16px 0' }}>{children}</div>
      </div>
    </div>
  );
}

// ── Progress ring (Activity-style) ───────────────────────────
export function Ring({ value, total, color, size = 34, stroke = 4, children }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tint(color, 0.22)} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} style={{ transition: 'stroke-dasharray .4s ease' }} />
      </svg>
      <span className="tnum" style={{ position: 'relative', fontSize: size * 0.3, fontWeight: 600 }}>{children}</span>
    </span>
  );
}

// Empty-state block
export function EmptyState({ icon = 'info', title, children, action }) {
  return (
    <div style={{ padding: '44px 20px', textAlign: 'center' }}>
      <div style={{ color: A.label3, display: 'flex', justifyContent: 'center', marginBottom: 10 }}><Icon name={icon} size={34} weight={1.5} /></div>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
      {children && <div style={{ fontSize: 14, color: A.label2, marginTop: 4, maxWidth: 440, marginInline: 'auto', lineHeight: 1.45 }}>{children}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
