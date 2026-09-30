// ── TV / Kiosk mode ──────────────────────────────────────────
// Same behavior as before (25 s rotation between Today and Week, density
// tiers, hold → glide → hold auto-scroll, tap to pause); Apple styling.
import { useState, useEffect, useRef, Fragment } from 'react';
import { DAY_ORDER, SYS, PM_COLORS, foremanColor, getTodayDayName, isOvertimeStart, isStopLabel, isDriverTag, canonicalName, hasDriverTag, hasTruck } from '../scheduleUtils.js';
import { A, APPLE_CSS, tint } from '../ui/apple.jsx';

const TV_ROTATE_MS = 25000;
function TVClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return <span className="tnum" style={{ fontSize: '4.2vh', fontWeight: 600, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>;
}
const pill = (color, fs) => ({ display: 'inline-block', fontSize: fs, fontWeight: 700, padding: '0.35vh 0.7vw', borderRadius: 999, background: tint(color, 0.2), color, verticalAlign: 'middle' });

export default function TVMode({ data, onExit, fileMeta, error, isRefreshing }) {
  const [view, setView] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { if (paused) return; const t = setInterval(() => setView(v => (v + 1) % 2), TV_ROTATE_MS); return () => clearInterval(t); }, [paused]);
  useEffect(() => { const h = e => { if (e.key === 'Escape') onExit(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onExit]);
  const today = getTodayDayName();
  const d = data[today];
  const jobs = d?.jobs || [];
  const active = jobs.filter(j => !j.cancelled);
  const regular = active.filter(j => !isOvertimeStart(j.onsiteTime));
  const ot = active.filter(j => isOvertimeStart(j.onsiteTime));
  const cancelled = jobs.filter(j => j.cancelled);
  const ordered = [...regular, ...ot, ...cancelled];
  const totalMen = active.reduce((s, j) => s + (j.numMen || 0), 0);
  const foremen = Object.keys(d?.crews || {});
  const n = ordered.length;
  const rowFont = n > 12 ? '1.9vh' : n > 8 ? '2.2vh' : '2.7vh';
  const subFont = n > 12 ? '1.7vh' : n > 8 ? '1.9vh' : '2.2vh';
  const cellPad = n > 12 ? '0.9vh 0.8vw' : '1.5vh 0.8vw';

  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || paused || view !== 0) return;
    let stop = false, raf = 0, tmo = 0;
    const HOLD = 5000;
    const pxPerMs = el.clientHeight / 15000;
    const cycle = () => {
      if (stop) return;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 6) { tmo = setTimeout(cycle, 4000); return; }
      let last = null;
      const down = ts => {
        if (stop) return;
        if (last == null) last = ts;
        el.scrollTop = Math.min(el.scrollTop + (ts - last) * pxPerMs, max);
        last = ts;
        if (el.scrollTop >= max - 1) {
          tmo = setTimeout(() => { if (stop) return; el.scrollTo({ top: 0, behavior: 'smooth' }); tmo = setTimeout(cycle, 1500); }, HOLD);
        } else raf = requestAnimationFrame(down);
      };
      tmo = setTimeout(() => { raf = requestAnimationFrame(down); }, HOLD);
    };
    el.scrollTop = 0;
    cycle();
    return () => { stop = true; cancelAnimationFrame(raf); clearTimeout(tmo); };
  }, [paused, view, n, today]);

  const stat = (v, l, c = A.label) => <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.4vw' }}><b className="tnum" style={{ fontSize: '3.4vh', fontWeight: 600, color: c }}>{v}</b><span style={{ fontSize: '1.9vh', color: A.label2 }}>{l}</span></span>;
  const th = { padding: '1vh 0.8vw', textAlign: 'left', fontSize: '1.7vh', fontWeight: 600, color: A.label2, borderBottom: `1px solid ${A.sep}` };

  return (
    <div style={{ position: 'fixed', inset: 0, background: A.bg, color: A.label, fontFamily: A.font, display: 'flex', flexDirection: 'column', zIndex: 1000, overflow: 'hidden' }}>
      <style>{APPLE_CSS + ' .tv-scroll{scrollbar-width:none} .tv-scroll::-webkit-scrollbar{display:none}'}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2.4vh 3vw 2vh' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.4vw', marginRight: '2vw', flexShrink: 0 }}>
          <span style={{ fontSize: '5.2vh', fontWeight: 700, letterSpacing: '-0.03em' }}>{today}</span>
          <span style={{ fontSize: '2.8vh', color: A.label2, whiteSpace: 'nowrap' }}>{d?.date ? new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : ''}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6vw', fontSize: '2vh', color: error ? SYS.red : SYS.green, fontWeight: 600 }}>
            <span style={{ width: '1.2vh', height: '1.2vh', borderRadius: '50%', background: error ? SYS.red : SYS.green, boxShadow: `0 0 0 0.5vh ${tint(error ? SYS.red : SYS.green, 0.2)}`, opacity: isRefreshing ? 0.5 : 1 }} />
            {error ? 'Offline' : 'Live'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.8vw', whiteSpace: 'nowrap' }}>
          {stat(active.length, 'jobs')}
          {stat(totalMen, 'men')}
          {stat(active.filter(j => hasTruck(j.trucks)).length, 'trucks')}
          {ot.length > 0 && stat(ot.length, 'overtime', SYS.yellow)}
          {cancelled.length > 0 && stat(cancelled.length, 'cancelled', SYS.red)}
          <TVClock />
          <button type="button" onClick={onExit} title="Exit TV mode (Esc)" aria-label="Exit TV mode" className="ap-btn ap-press" style={{ width: '4.4vh', height: '4.4vh', borderRadius: '50%', border: 'none', background: A.fill3, color: A.label, fontSize: '2vh', cursor: 'pointer' }}>✕</button>
        </div>
      </div>
      <div ref={scrollRef} className="tv-scroll" style={{ flex: 1, overflow: 'auto', padding: '0 3vw 2vh' }} onClick={() => setPaused(p => !p)}>
        {view === 0 ? (
          jobs.length === 0
            ? <div style={{ textAlign: 'center', paddingTop: '22vh', fontSize: '4vh', color: A.label2 }}>No jobs scheduled today</div>
            : <div style={{ background: A.cell, borderRadius: '1.6vh', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={{ ...th, paddingLeft: '1.4vw' }}>Time</th><th style={th}>Customer</th><th style={th}>Trucks</th><th style={th}>Location</th><th style={th}>Crew</th><th style={{ ...th, textAlign: 'center' }}>PM</th>
                  </tr></thead>
                  <tbody>
                    {ordered.map((job, i) => {
                      const isC = !!job.cancelled;
                      const isOT = !isC && isOvertimeStart(job.onsiteTime);
                      const firstOT = isOT && job === ot[0] && regular.length > 0;
                      const firstC = isC && job === cancelled[0];
                      const accent = isC ? SYS.red : isOT ? SYS.yellow : PM_COLORS[(job.calledIn || '').toUpperCase()] || A.cell3;
                      const td = { padding: cellPad, borderTop: `1px solid ${A.sep}`, verticalAlign: 'top' };
                      return (
                        <Fragment key={i}>
                          {(firstOT || firstC) && <tr><td colSpan={6} style={{ padding: '2vh 1.4vw 0.8vh', fontSize: '2vh', fontWeight: 700, color: firstOT ? SYS.yellow : SYS.red, borderTop: `1px solid ${A.sep}`, background: A.bg }}>{firstOT ? 'Overtime' : 'Cancelled'}</td></tr>}
                          <tr style={{ opacity: isC ? 0.55 : 1 }}>
                            <td style={{ ...td, paddingLeft: '1.4vw', whiteSpace: 'nowrap' }}>
                              <span style={{ display: 'inline-block', width: '0.45vw', minWidth: 4, height: '3.4vh', borderRadius: 3, background: accent, verticalAlign: 'middle', marginRight: '0.8vw' }} />
                              <span className="tnum" style={{ fontSize: rowFont, fontWeight: 600, color: !job.onsiteTime ? A.label3 : isOT ? SYS.yellow : A.label, verticalAlign: 'middle' }}>{job.onsiteTime || 'TBD'}</span>
                            </td>
                            <td style={{ ...td, fontSize: rowFont, fontWeight: 600, textDecoration: isC ? 'line-through' : 'none' }}>
                              {job.customer}<span className="tnum" style={{ fontSize: subFont, color: A.label3, fontWeight: 400, marginLeft: '0.6vw' }}>#{job.num}</span>
                            </td>
                            <td style={{ ...td, fontSize: subFont, color: hasTruck(job.trucks) ? A.label : A.label3, whiteSpace: 'nowrap' }}>{hasTruck(job.trucks) ? job.trucks : '–'}</td>
                            <td style={{ ...td, fontSize: subFont, color: A.label2 }}>{job.location || '–'}</td>
                            <td style={{ ...td, fontSize: subFont, lineHeight: 1.45 }}>
                              {(job.crew || []).filter(c => !isStopLabel(c) && !isDriverTag(c)).map((c, k, arr) => {
                                const cn = canonicalName(c); const fi = foremen.indexOf(cn);
                                return <Fragment key={k}><span style={{ color: fi >= 0 ? foremanColor(cn, fi) : A.label, fontWeight: fi >= 0 ? 700 : 400 }}>{cn}{hasDriverTag(c) && <span style={{ color: SYS.purple }}> (driving)</span>}</span>{k < arr.length - 1 && <span style={{ color: A.label3 }}>, </span>}</Fragment>;
                              })}
                              {!(job.crew || []).length && <span style={{ color: SYS.orange }}>No crew assigned</span>}
                            </td>
                            <td style={{ ...td, textAlign: 'center' }}>{job.calledIn ? <span style={{ ...pill(PM_COLORS[(job.calledIn || '').toUpperCase()] || SYS.gray, '1.9vh'), background: PM_COLORS[(job.calledIn || '').toUpperCase()] || SYS.gray, color: '#fff' }}>{job.calledIn.toUpperCase()}</span> : <span style={{ color: A.label3 }}>–</span>}</td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '1vw', alignContent: 'start' }}>
            {DAY_ORDER.map(dn => {
              const dd = data[dn]; const act = (dd?.jobs || []).filter(j => !j.cancelled);
              const tm = act.reduce((s, j) => s + (j.numMen || 0), 0);
              const oc = act.filter(j => isOvertimeStart(j.onsiteTime)).length;
              const cc = (dd?.jobs || []).length - act.length;
              const isToday = dn === today;
              return (
                <div key={dn} style={{ borderRadius: '1.6vh', padding: '2.6vh 1vw', background: A.cell, boxShadow: isToday ? `inset 0 0 0 0.35vh ${SYS.red}` : 'none' }}>
                  <div style={{ fontSize: '2.2vh', fontWeight: 600, color: isToday ? SYS.red : A.label2 }}>{dn.slice(0, 3)}</div>
                  <div className="tnum" style={{ fontSize: '3vh', fontWeight: 600, marginTop: '0.3vh' }}>{dd?.date ? Number(dd.date.slice(8)) : '–'}</div>
                  <div className="tnum" style={{ fontSize: '8vh', fontWeight: 600, lineHeight: 1.05, letterSpacing: '-0.03em', marginTop: '2vh' }}>{act.length}</div>
                  <div style={{ fontSize: '1.9vh', color: A.label2 }}>{act.length === 1 ? 'job' : 'jobs'}</div>
                  <div className="tnum" style={{ fontSize: '2.8vh', fontWeight: 600, marginTop: '2vh' }}>{tm} <span style={{ fontSize: '1.9vh', color: A.label2, fontWeight: 400 }}>men</span></div>
                  {oc > 0 && <div style={{ marginTop: '1.2vh' }}><span style={pill(SYS.yellow, '1.8vh')}>{oc} OT</span></div>}
                  {cc > 0 && <div style={{ marginTop: '1vh' }}><span style={pill(SYS.red, '1.8vh')}>{cc} cancelled</span></div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.4vh 3vw', fontSize: '1.8vh', color: A.label2 }}>
        <span>{fileMeta?.lastModified ? `Log book saved ${new Date(fileMeta.lastModified).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}{error ? ` · ${error}` : ''}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw' }}>
          {paused && <span style={{ color: SYS.orange }}>Paused — tap to resume</span>}
          {[0, 1].map(v => <button key={v} type="button" aria-label={v === 0 ? 'Show today' : 'Show week'} onClick={() => { setView(v); setPaused(true); }} style={{ width: '1.3vh', height: '1.3vh', borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, background: view === v ? A.label : A.fill }} />)}
          <span style={{ marginLeft: '0.4vw' }}>{view === 0 ? 'Today' : 'This week'}</span>
        </div>
      </div>
    </div>
  );
}
