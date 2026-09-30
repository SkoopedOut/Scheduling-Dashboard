// ── Month calendar ───────────────────────────────────────────
// Apple Calendar month grid: hairline cells, today in a red circle, and a
// compact summary of jobs / men / overtime in each day.
import { useEffect } from 'react';
import { DAY_ORDER, SYS, isOvertimeStart, getSaturdayKey, isoDate, todayIso } from '../scheduleUtils.js';
import { A, tint, Icon, CircleButton, PlainButton, TintedButton, Spinner, SectionFooter } from '../ui/apple.jsx';

export default function MonthTab({ weeksCache, weekStatus, monthCursor, setMonthCursor, onPickDay, mode, requestWeek, isMobile, onSearchMonth }) {
  const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
  const dim = new Date(y, m + 1, 0).getDate();
  const start = new Date(y, m, 1).getDay();
  const today = todayIso();

  const idx = {};
  for (const wd of Object.values(weeksCache)) for (const day of DAY_ORDER) {
    const dd = wd?.[day]; if (!dd?.date) continue;
    const act = (dd.jobs || []).filter(j => !j.cancelled);
    idx[dd.date] = { day, date: dd.date, jobs: act.length, men: act.reduce((s, j) => s + (j.numMen || 0), 0),
      ot: act.filter(j => isOvertimeStart(j.onsiteTime)).length, cancelled: (dd.jobs || []).length - act.length };
  }
  const needed = [...new Set(Array.from({ length: dim }, (_, i) => getSaturdayKey(new Date(y, m, i + 1))))];
  useEffect(() => { if (mode === 'live') needed.forEach(k => requestWeek(k, { once: true })); }, [y, m, mode]); // eslint-disable-line
  const loading = needed.filter(k => weekStatus?.[k] === 'loading').length;

  const prefix = `${y}-${String(m + 1).padStart(2, '0')}-`;
  const inMonth = Object.values(idx).filter(d => d.date.startsWith(prefix));
  const totals = inMonth.reduce((a, d) => ({ jobs: a.jobs + d.jobs, men: a.men + d.men, ot: a.ot + d.ot }), { jobs: 0, men: 0, ot: 0 });
  const maxMen = Math.max(1, ...inMonth.map(d => d.men));
  const cells = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const now = new Date();
  const isThis = now.getFullYear() === y && now.getMonth() === m;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontSize: isMobile ? 24 : 28, fontWeight: 700, letterSpacing: '-0.02em', marginRight: 8 }}>
          {monthCursor.toLocaleDateString('en-US', { month: 'long' })} <span style={{ color: SYS.red }}>{y}</span>
        </div>
        <CircleButton icon="chevronLeft" onClick={() => setMonthCursor(new Date(y, m - 1, 1))} ariaLabel="Previous month" size={30} />
        <CircleButton icon="chevronRight" onClick={() => setMonthCursor(new Date(y, m + 1, 1))} ariaLabel="Next month" size={30} />
        {!isThis && <PlainButton onClick={() => setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1))}>Today</PlainButton>}
        {loading > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: A.label2 }}><Spinner size={14} />Loading {loading} {loading === 1 ? 'week' : 'weeks'}…</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span className="tnum" style={{ fontSize: 13, color: A.label2 }}>
            <b style={{ color: A.label }}>{totals.jobs}</b> jobs · <b style={{ color: A.label }}>{totals.men}</b> man-days{totals.ot ? <> · <b style={{ color: SYS.yellow }}>{totals.ot}</b> overtime</> : null}
          </span>
          {onSearchMonth && <TintedButton onClick={onSearchMonth} style={{ fontSize: 13 }}><Icon name="search" size={14} weight={2.2} />Search this month</TintedButton>}
        </div>
      </div>

      <div style={{ background: A.cell, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', borderBottom: `0.5px solid ${A.sep}` }}>
          {DAY_ORDER.map((d, i) => <div key={d} style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, color: i === 0 || i === 6 ? A.label3 : A.label2, textAlign: isMobile ? 'center' : 'right' }}>{isMobile ? d[0] : d.slice(0, 3)}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))' }}>
          {cells.map((d, i) => {
            const col = i % 7;
            const border = { borderRight: col < 6 ? `0.5px solid ${A.sep}` : 'none', borderBottom: i < cells.length - 7 ? `0.5px solid ${A.sep}` : 'none' };
            if (!d) return <div key={`b${i}`} style={{ ...border, background: 'rgba(0,0,0,0.25)', minHeight: isMobile ? 58 : 108 }} />;
            const ds = isoDate(new Date(y, m, d));
            const info = idx[ds];
            const isToday = ds === today;
            const weekend = col === 0 || col === 6;
            return (
              <button key={ds} type="button" disabled={!info} onClick={() => info && onPickDay(info)} className={`ap-btn${info ? ' ap-row ap-tap' : ''}`}
                aria-label={`${new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${info ? `: ${info.jobs} jobs, ${info.men} men` : ''}`}
                style={{ ...border, minHeight: isMobile ? 58 : 108, padding: isMobile ? '6px 2px' : '8px 10px', display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'center' : 'stretch',
                  gap: 3, background: weekend ? 'rgba(255,255,255,0.015)' : 'transparent', borderTop: 'none', borderLeft: 'none', color: 'inherit', textAlign: 'left', cursor: info ? 'pointer' : 'default' }}>
                <span style={{ alignSelf: isMobile ? 'center' : 'flex-end' }}>
                  <span className="tnum" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%',
                    fontSize: 14, fontWeight: isToday ? 700 : 500, background: isToday ? SYS.red : 'transparent',
                    color: isToday ? '#fff' : info ? A.label : A.label3 }}>{d}</span>
                </span>
                {info && info.jobs > 0 && (isMobile ? (
                  <>
                    <span className="tnum" style={{ fontSize: 12, fontWeight: 600 }}>{info.jobs}</span>
                    <span style={{ display: 'flex', gap: 3 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: SYS.blue }} />
                      {info.ot > 0 && <span style={{ width: 5, height: 5, borderRadius: '50%', background: SYS.yellow }} />}
                      {info.cancelled > 0 && <span style={{ width: 5, height: 5, borderRadius: '50%', background: SYS.red }} />}
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span className="tnum" style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>{info.jobs}</span>
                      <span style={{ fontSize: 12, color: A.label2 }}>{info.jobs === 1 ? 'job' : 'jobs'}</span>
                    </span>
                    <span className="tnum" style={{ fontSize: 12, color: A.label2 }}>{info.men} men</span>
                    <span style={{ height: 4, borderRadius: 2, background: A.fill4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(info.men / maxMen) * 100}%`, background: tint(SYS.blue, 0.9), borderRadius: 2 }} /></span>
                    <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                      {info.ot > 0 && <span className="tnum" style={{ fontSize: 11, fontWeight: 600, color: SYS.yellow }}>{info.ot} OT</span>}
                      {info.cancelled > 0 && <span className="tnum" style={{ fontSize: 11, fontWeight: 600, color: SYS.red }}>{info.cancelled} cancelled</span>}
                    </span>
                  </>
                ))}
              </button>
            );
          })}
        </div>
      </div>
      <SectionFooter style={{ marginTop: 10 }}>
        {mode === 'live' ? 'Select a day to open it.' : 'Demo mode only has the sample week (March 22–28, 2026). Sign in to fill in the month.'}
        {isMobile && ' Blue dot: jobs · yellow: overtime · red: cancelled.'}
      </SectionFooter>
    </div>
  );
}
