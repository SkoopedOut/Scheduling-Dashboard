// ── Changes: what moved in the log book between refreshes ────
import { useState, useMemo } from 'react';
import { SYS } from '../scheduleUtils.js';
import { A, Icon, Group, SectionHeader, SectionFooter, Segmented, PlainButton, EmptyState } from '../ui/apple.jsx';

const KIND = {
  added: { label: 'Added', color: SYS.green, icon: 'plus' },
  removed: { label: 'Removed', color: SYS.red, icon: 'minus' },
  changed: { label: 'Changed', color: SYS.orange, icon: 'pencil' },
};
function dayHeading(ts) {
  const d = new Date(ts); const t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
// Crew edits (+ / −) render as tinted names; everything else as plain text
function Detail({ text }) {
  const m = /^([+−])\s(.*)$/.exec(text);
  if (m) return <span style={{ color: m[1] === '+' ? SYS.green : SYS.red }}>{m[1] === '+' ? 'Added ' : 'Removed '}{m[2]}</span>;
  return <span>{text}</span>;
}

export default function ChangesTab({ changeLog, onClear, isMobile }) {
  const [kind, setKind] = useState('all');
  const list = kind === 'all' ? changeLog : changeLog.filter(e => e.kind === kind);
  const groups = useMemo(() => {
    const out = [];
    for (const e of list) {
      const h = dayHeading(e.ts);
      if (!out.length || out[out.length - 1].h !== h) out.push({ h, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [list]);
  const counts = { added: 0, removed: 0, changed: 0 };
  for (const e of changeLog) counts[e.kind] = (counts[e.kind] || 0) + 1;

  if (!changeLog.length) return (
    <Group><EmptyState icon="clock" title="No changes yet">When the log book is edited between refreshes, every change shows up here: new jobs, times, crews and removals.</EmptyState></Group>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
        <Segmented ariaLabel="Show" value={kind} onChange={setKind} style={{ width: isMobile ? '100%' : 420 }} fullWidth={isMobile}
          options={[{ id: 'all', label: 'All' }, { id: 'added', label: `Added ${counts.added || ''}`.trim() }, { id: 'changed', label: `Changed ${counts.changed || ''}`.trim() }, { id: 'removed', label: `Removed ${counts.removed || ''}`.trim() }]} />
        <PlainButton color={SYS.red} onClick={() => { if (window.confirm('Clear the whole change history on this device?')) onClear(); }} style={{ marginLeft: 'auto' }}>
          <Icon name="trash" size={16} weight={2} />Clear history
        </PlainButton>
      </div>
      {groups.length === 0 && <Group><EmptyState icon="clock" title={`Nothing ${KIND[kind]?.label.toLowerCase()}`}>Try another filter.</EmptyState></Group>}
      {groups.map(g => (
        <section key={g.h} style={{ marginBottom: 22 }}>
          <SectionHeader right={<span className="tnum">{g.items.length} {g.items.length === 1 ? 'change' : 'changes'}</span>}>{g.h}</SectionHeader>
          <Group>
            {g.items.map((e, i) => {
              const k = KIND[e.kind] || KIND.changed;
              return (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '0 16px' }}>
                  <span style={{ marginTop: 12, width: 28, height: 28, borderRadius: '50%', background: k.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={k.icon} size={15} weight={2.6} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0, padding: '11px 0', borderTop: i ? `0.5px solid ${A.sep}` : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0 }}>{e.customer}</span>
                      <span className="tnum" style={{ fontSize: 13, color: A.label2, whiteSpace: 'nowrap' }}>{new Date(e.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                    <div className="tnum" style={{ fontSize: 13, color: A.label2, marginTop: 1 }}>{k.label} · {e.day} · #{e.num}</div>
                    {e.details?.length > 0 && (
                      <div style={{ fontSize: 13, color: A.label, marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {e.details.map((d, j) => <Detail key={j} text={d} />)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </Group>
        </section>
      ))}
      <SectionFooter>History is kept on this device only, up to the latest 100 changes.</SectionFooter>
    </div>
  );
}
