// ── Appearance: follow the system, or override by hand ───────
// The choice is stored on this device. "System" (the default) lets the
// browser's prefers-color-scheme decide and keeps following it live;
// Light or Dark pins the app to that appearance via data-theme on <html>,
// which the CSS variables in ui/apple.jsx key off.
import { useEffect, useState } from 'react';
import { A, Icon } from './apple.jsx';

export const THEME_KEY = 'hub-dashboard-theme';
const META_COLORS = { dark: '#05060B', light: '#EDF0F7' };

function readPref() {
  try { const v = localStorage.getItem(THEME_KEY); return v === 'light' || v === 'dark' ? v : 'system'; }
  catch { return 'system'; }
}
const systemIsDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function useTheme() {
  const [pref, setPref] = useState(readPref);
  const [sysDark, setSysDark] = useState(systemIsDark);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const h = e => setSysDark(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  // Pick up a change made in another tab or window
  useEffect(() => {
    const h = e => { if (e.key === THEME_KEY) setPref(readPref()); };
    window.addEventListener('storage', h);
    return () => window.removeEventListener('storage', h);
  }, []);

  const resolved = pref === 'system' ? (sysDark ? 'dark' : 'light') : pref;
  useEffect(() => {
    const root = document.documentElement;
    if (pref === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', pref);
    try { if (pref === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, pref); } catch { /* private mode: just don't persist */ }
  }, [pref]);
  useEffect(() => {
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', META_COLORS[resolved]));
  }, [resolved]);

  return { pref, setPref, resolved };
}

const OPTIONS = [
  { id: 'system', icon: 'halfCircle', label: 'Match system appearance' },
  { id: 'light', icon: 'sun', label: 'Light' },
  { id: 'dark', icon: 'moon', label: 'Dark' },
];

// Three-way glass switch: Auto · Light · Dark
export function ThemeToggle({ theme, size = 36 }) {
  const idx = Math.max(0, OPTIONS.findIndex(o => o.id === theme.pref));
  const seg = size - 4;
  return (
    <div role="radiogroup" aria-label="Appearance" className="glass-pill" style={{
      position: 'relative', display: 'inline-grid', gridTemplateColumns: `repeat(3, ${seg}px)`, padding: 2, height: size, borderRadius: 999,
      background: A.fill3, flexShrink: 0,
    }}>
      <span aria-hidden style={{
        position: 'absolute', top: 2, left: 2, width: seg, height: seg, borderRadius: '50%', background: A.thumb,
        transform: `translateX(${idx * seg}px)`, transition: 'transform .28s cubic-bezier(.3,.7,.3,1)',
        boxShadow: 'inset 0 1px 0 var(--glass-rim), 0 2px 6px rgba(0,0,0,0.18)',
      }} />
      {OPTIONS.map(o => {
        const on = theme.pref === o.id;
        const label = o.id === 'system' ? `${o.label} (currently ${theme.resolved})` : o.label;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} aria-label={label} title={label}
            onClick={() => theme.setPref(o.id)} className="ap-btn" style={{
              position: 'relative', zIndex: 1, width: seg, height: seg, border: 'none', background: 'transparent', cursor: 'pointer',
              borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: on ? A.label : A.label2,
            }}>
            <Icon name={o.icon} size={Math.round(seg * 0.5)} weight={2} />
          </button>
        );
      })}
    </div>
  );
}
