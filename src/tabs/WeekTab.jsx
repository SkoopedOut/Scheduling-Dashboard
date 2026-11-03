// ── Week at a glance ─────────────────────────────────────────
// Calendar week-view feel: a column per day with its headline numbers, a
// bar for manpower relative to the busiest day, and the day's first jobs.
import { DAY_ORDER, SYS, PM_COLORS, isOvertimeStart, hasTruck, todayIso } from '../scheduleUtils.js';
import { A, tint, Capsule, Group, SectionFooter, Icon } from '../ui/apple.jsx';

function dayStats(dd) {
  const all = dd?.jobs || [];
  const act = all.filter(j => !j.cancelled);
  const byTime = [...act].sort((a, b) => (isOvertimeStart(a.onsiteTime) - isOvertimeStart(b.onsiteTime)));
  return {
    jobs: act.length, men: act.reduce((s, j) => s + (j.numMen || 0), 0),
    trucks: act.filter(j => hasTruck(j.trucks)).length, ot: act.filter(j => isOvertimeStart(j.onsiteTime)).length,
    cancelled: all.length - act.length, list: byTime,
  };
}

export default function WeekTab({ data, selectedDay, onSelectDay, isMobile }) {
  const today = todayIso();
  const days = DAY_ORDER.map(d => ({ d, date: data?.[d]?.date, ...dayStats(data?.[d]) }));
  const maxMen = Math.max(1, ...days.map(x => x.men));
  const tot = days.reduce((a, x) => ({ jobs: a.jobs + x.jobs, men: a.men + x.men, ot: a.ot + x.ot, trucks: a.trucks + x.trucks }), { jobs: 0, men: 0, ot: 0, trucks: 0 });
  const busiest = days.reduce((b, x) => (x.men > (b?.men ?? -1) ? x : b), null);

  const summary = (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4, minmax(0, 180px))', gap: 12, marginBottom: 22 }}>
      {[['Jobs', tot.jobs, A.label], ['Man-days', tot.men, A.label], ['With a truck', tot.trucks, A.label], ['Overtime', tot.ot, tot.ot ? SYS.yellow : A.label]].map(([l, v, c]) => (
        <Group key={l} style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 13, color: A.label2 }}>{l}</div>
          <div className="tnum" style={{ fontSize: 28, fontWeight: 600, color: c, letterSpacing: '-0.02em', marginTop: 2 }}>{v}</div>
        </Group>
      ))}
    </div>
  );

  if (isMobile) return (
    <div>
      {summary}
      <Group>
        {days.map((x, i) => {
          const isToday = x.date === today;
          return (
            <button key={x.d} type="button" onClick={() => onSelectDay(x.d)} className="ap-btn ap-row ap-tap" style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '0 16px', border: 'none', background: 'transparent', color: 'inherit', textAlign: 'left' }}>
              <div style={{ width: 44, textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isToday ? SYS.red : A.label2 }}>{x.d.slice(0, 3)}</div>
                <div className="tnum" style={{ fontSize: 22, fontWeight: isToday ? 700 : 500, color: isToday ? SYS.red : A.label }}>{x.date ? Number(x.date.slice(8)) : '–'}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: '12px 0', borderTop: i ? `0.5px solid ${A.sep}` : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tnum" style={{ fontSize: 15, fontWeight: 600 }}>{x.jobs} {x.jobs === 1 ? 'job' : 'jobs'} · {x.men} men</div>
                  <div style={{ height: 5, borderRadius: 3, background: A.fill4, marginTop: 6, overflow: 'hidden' }}><div style={{ width: `${(x.men / maxMen) * 100}%`, height: '100%', background: SYS.blue, borderRadius: 3 }} /></div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {x.trucks > 0 && <span className="tnum" style={{ fontSize: 12, color: A.label2 }}>{x.trucks} with a truck</span>}
                    {x.ot > 0 && <Capsule color={SYS.yellow} size={10}>{x.ot} OT</Capsule>}
                    {x.cancelled > 0 && <Capsule color={SYS.red} size={10}>{x.cancelled} cancelled</Capsule>}
                  </div>
                </div>
                <span style={{ color: A.label3 }}><Icon name="chevronRight" size={14} weight={2.4} /></span>
              </div>
            </button>
          );
        })}
      </Group>
    </div>
  );

  return (
    <div>
      {summary}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 10 }}>
        {days.map(x => {
          const isToday = x.date === today;
          const isSel = x.d === selectedDay;
          const shown = x.list.slice(0, 5);
          return (
            <button key={x.d} type="button" onClick={() => onSelectDay(x.d)} className="ap-btn ap-press glass" aria-label={`${x.d}: ${x.jobs} jobs, ${x.men} men — open`}
              style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', border: 'none', padding: 14, cursor: 'pointer', color: 'inherit',
                boxShadow: isSel ? `inset 0 0 0 2px ${SYS.blue}, var(--glass-shadow)` : undefined, minHeight: 330 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: isToday ? SYS.red : A.label2 }}>{x.d.slice(0, 3)}</div>
              <div className="tnum" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, marginLeft: -4, borderRadius: '50%', fontSize: 24, fontWeight: 600,
                background: isToday ? SYS.red : 'transparent', color: isToday ? '#fff' : A.label }}>{x.date ? Number(x.date.slice(8)) : '–'}</div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className="tnum" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em' }}>{x.jobs}</span>
                <span style={{ fontSize: 13, color: A.label2 }}>{x.jobs === 1 ? 'job' : 'jobs'}</span>
              </div>
              <div className="tnum" style={{ fontSize: 13, color: A.label2, marginTop: 2 }}>{x.men} men · {x.trucks} {x.trucks === 1 ? 'truck' : 'trucks'}</div>
              <div title={`${x.men} men${busiest?.d === x.d && x.men ? ' — busiest day' : ''}`} style={{ height: 6, borderRadius: 3, background: A.fill4, margin: '10px 0', overflow: 'hidden' }}>
                <div style={{ width: `${(x.men / maxMen) * 100}%`, height: '100%', borderRadius: 3, background: busiest?.d === x.d && x.men ? SYS.orange : SYS.blue, transition: 'width .3s ease' }} />
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', minHeight: 20 }}>
                {x.ot > 0 && <Capsule color={SYS.yellow} size={10}>{x.ot} OT</Capsule>}
                {x.cancelled > 0 && <Capsule color={SYS.red} size={10}>{x.cancelled} cancelled</Capsule>}
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                {shown.map((j, i) => (
                  <div key={i} style={{ display: 'flex', gap: 7, minWidth: 0 }}>
                    <span style={{ width: 3, borderRadius: 2, flexShrink: 0, background: isOvertimeStart(j.onsiteTime) ? SYS.yellow : PM_COLORS[String(j.calledIn || '').toUpperCase()] || A.cell3 }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.customer}</span>
                      <span className="tnum" style={{ display: 'block', fontSize: 11, color: A.label2 }}>{j.onsiteTime || 'TBD'}{j.numMen != null ? ` · ${j.numMen}` : ''}</span>
                    </span>
                  </div>
                ))}
                {x.list.length > shown.length && <span style={{ fontSize: 12, color: A.label3 }}>{x.list.length - shown.length} more</span>}
              </div>
            </button>
          );
        })}
      </div>
      <SectionFooter style={{ marginTop: 10 }}>Bars compare each day’s men with the busiest day ({busiest?.men ? `${busiest.d}, ${busiest.men} men` : 'none'}). Select a day to open it.</SectionFooter>
    </div>
  );
}
