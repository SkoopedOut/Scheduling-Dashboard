// ── Crew Roster tab ──────────────────────────────────────────
// Foreman crews as grouped cards with a week-at-a-glance row of dots per
// person, PMs, the unassigned pools, and a sheet with anyone's week that
// links through to their whole month.
import { useState, Fragment } from 'react';
import { DAY_ORDER, SYS, PM_COLORS, foremanColor, canonicalName, isNonPerson, isOvertimeStart, todayIso, hasDriverTag } from '../scheduleUtils.js';
import { A, tint, Icon, Capsule, QualBadge, PMBadge, Avatar, Group, SectionHeader, SectionFooter, Sheet, Ring, FilledButton, EmptyState } from '../ui/apple.jsx';

export function getForemanList(crews) {
  return Object.keys(crews || {}); // sheet order — only foremen actually on the roster
}
const same = (a, b) => canonicalName(a).toLowerCase() === String(b).toLowerCase();
function jobsFor(name, dayData) { return (dayData?.jobs || []).filter(j => !j.cancelled && (j.crew || []).some(c => !isNonPerson(c) && same(c, name))); }
function pmJobs(code, dayData) { return (dayData?.jobs || []).filter(j => !j.cancelled && String(j.calledIn || '').trim().toUpperCase() === code); }

// Seven dots, Sunday → Saturday
function WeekDots({ name, allData, color, pm }) {
  const today = todayIso();
  return (
    <span style={{ display: 'inline-flex', gap: 4 }} aria-label={`${name}: ${DAY_ORDER.filter(d => (pm ? pmJobs(pm, allData?.[d]) : jobsFor(name, allData?.[d])).length).join(', ') || 'no days'} this week`}>
      {DAY_ORDER.map(d => {
        const on = (pm ? pmJobs(pm, allData?.[d]) : jobsFor(name, allData?.[d])).length > 0;
        const isToday = allData?.[d]?.date === today;
        return <span key={d} title={`${d}${on ? ' — scheduled' : ''}`} style={{
          width: 9, height: 9, borderRadius: '50%', background: on ? color : A.fill3,
          boxShadow: isToday ? `0 0 0 1.5px ${A.cellSolid}, 0 0 0 3px ${SYS.red}` : 'none' }} />;
      })}
    </span>
  );
}

function PersonRow({ name, qual, color, allData, onPick, first, out, bold }) {
  return (
    <button type="button" onClick={onPick} className="ap-btn ap-row ap-tap" style={{
      display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '0 14px', background: 'transparent', border: 'none', color: 'inherit', textAlign: 'left' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: first ? 'none' : `0.5px solid ${A.sep}` }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: bold ? 600 : 400, color: out ? A.label2 : A.label }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: out === 'crossed out' ? 'line-through' : 'none' }}>{name}</span>
          <QualBadge code={qual} />
        </span>
        {out
          ? <Capsule color={SYS.red} size={10} title={out === 'crossed out' ? 'Crossed out in the log book' : 'Listed above the crew — vacation or injured'}>{out === 'crossed out' ? 'Crossed out' : 'Out'}</Capsule>
          : <WeekDots name={name} allData={allData} color={color} />}
      </div>
    </button>
  );
}

export default function RosterTab({ crews, pools, unavailable, unassigned, jobs, allData, isMobile, monthName, onOpenMonth }) {
  const [sel, setSel] = useState(null); // {kind:'person'|'pm', name, color, role}
  if (!crews) return <Group><EmptyState icon="person2" title="No roster for this day">The crew list couldn’t be read from this day’s sheet.</EmptyState></Group>;

  const foremanList = getForemanList(crews);
  const outList = unavailable || [];
  const unassignedList = unassigned || [];
  const outBy = f => outList.filter(u => u.foreman === f);
  const worksThisWeek = n => DAY_ORDER.some(d => jobsFor(n, allData?.[d]).length);

  // Names on today's job rows that aren't anywhere on the roster
  const rosterKeys = new Set();
  const addR = n => { const c = canonicalName(n).toLowerCase(); if (c) rosterKeys.add(c); };
  for (const f of foremanList) { addR(f); for (const m of crews[f]?.members || []) addR(m.name); }
  for (const k of ['laborers', 'drivers', 'extra']) for (const m of pools?.[k] || []) addR(m.name);
  for (const u of outList) addR(u.name);
  for (const u of unassignedList) addR(u.name);
  const offMap = new Map();
  for (const j of jobs || []) { if (j.cancelled) continue; for (const raw of j.crew || []) { if (isNonPerson(raw)) continue; const c = canonicalName(raw); const k = c.toLowerCase(); if (k && !rosterKeys.has(k) && !offMap.has(k)) offMap.set(k, c); } }
  const offRoster = [...offMap.values()].sort((a, b) => a.localeCompare(b));

  const working = foremanList.reduce((s, f) => s + [f, ...(crews[f]?.members || []).map(m => m.name)].filter(worksThisWeek).length, 0);
  const everyone = foremanList.reduce((s, f) => s + 1 + (crews[f]?.members || []).length, 0);
  const pick = (name, color, role) => setSel({ kind: 'person', name, color, role });

  // PMs seen this week plus the known ones
  const pmCodes = [...new Set([...Object.keys(PM_COLORS), ...DAY_ORDER.flatMap(d => (allData?.[d]?.jobs || []).map(j => String(j.calledIn || '').trim().toUpperCase()).filter(Boolean))])];

  return (
    <div>
      {outList.length > 0 && (
        <Group style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', gap: 12, padding: '12px 16px' }}>
            <span style={{ width: 28, height: 28, borderRadius: 7, background: SYS.red, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="person" size={17} weight={2.2} /></span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{outList.length} {outList.length === 1 ? 'person is' : 'people are'} unavailable today</div>
              <div style={{ fontSize: 13, color: A.label2, marginTop: 3, lineHeight: 1.6 }}>
                {outList.map((u, i) => (
                  <span key={i} style={{ marginRight: 14, whiteSpace: 'nowrap', display: 'inline-block' }}>
                    <span style={{ color: A.label, textDecoration: u.reason === 'crossed out' ? 'line-through' : 'none' }}>{u.name}</span>
                    {u.foreman && <span> · {u.foreman}’s crew</span>}
                    <span style={{ color: A.label3 }}> · {u.reason === 'crossed out' ? 'crossed out' : 'vacation / injured'}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Group>
      )}

      <SectionHeader right={<span className="tnum">{working} of {everyone} working this week</span>}>Foreman crews</SectionHeader>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14, marginBottom: 28 }}>
        {foremanList.map((f, fi) => {
          const crew = crews[f]; const color = foremanColor(f, fi);
          const members = crew?.members || [];
          const all = [f, ...members.map(m => m.name)];
          const w = all.filter(worksThisWeek).length;
          return (
            <Group key={f}>
              <button type="button" onClick={() => pick(f, color, 'foreman')} className="ap-btn ap-row ap-tap" style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 14px 12px', background: 'transparent', border: 'none', color: 'inherit', textAlign: 'left', borderBottom: `0.5px solid ${A.sep}` }}>
                <Avatar name={f} color={color} size={40} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', fontSize: 17, fontWeight: 600 }}>{f}<QualBadge code={crew?.qual} /></span>
                  <span style={{ display: 'block', fontSize: 13, color: A.label2 }}>{members.length} on the crew</span>
                </span>
                <Ring value={w} total={all.length} color={w === all.length ? SYS.green : w / all.length >= 0.6 ? SYS.orange : SYS.red} size={38}>{w}/{all.length}</Ring>
              </button>
              <div style={{ padding: '2px 0 4px' }}>
                {outBy(f).map((u, i) => <PersonRow key={`o${i}`} name={u.name} out={u.reason} allData={allData} color={color} first={i === 0} onPick={() => pick(u.name, color)} />)}
                <PersonRow name={f} qual={null} color={color} allData={allData} bold first={outBy(f).length === 0} onPick={() => pick(f, color, 'foreman')} />
                {members.map((m, i) => <PersonRow key={i} name={m.name} qual={m.qual} color={color} allData={allData} onPick={() => pick(m.name, color, m.qual === 'A' ? 'apprentice' : 'journeyman')} />)}
              </div>
            </Group>
          );
        })}
      </div>

      <SectionHeader right="Tap a PM to see their jobs">Project managers</SectionHeader>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
        {pmCodes.map(pm => {
          const color = PM_COLORS[pm] || SYS.gray;
          const count = DAY_ORDER.reduce((n, d) => n + pmJobs(pm, allData?.[d]).length, 0);
          return (
            <button key={pm} type="button" onClick={() => setSel({ kind: 'pm', name: `PM ${pm}`, code: pm, color })} className="ap-btn ap-press glass" style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
              <Avatar text={pm} color={color} size={38} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>PM {pm}</span>
                <span className="tnum" style={{ display: 'block', fontSize: 12, color: A.label2 }}>{count} {count === 1 ? 'job' : 'jobs'} this week</span>
                {!isMobile && <span style={{ display: 'block', marginTop: 5 }}><WeekDots name={`PM ${pm}`} pm={pm} allData={allData} color={color} /></span>}
              </span>
            </button>
          );
        })}
      </div>

      <SectionHeader>Available pool</SectionHeader>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {[
          { title: 'Laborers', data: pools?.laborers || [], color: SYS.green },
          { title: 'Drivers', data: pools?.drivers || [], color: SYS.orange },
          { title: 'Extra', data: pools?.extra || [], color: SYS.purple },
          ...(unassignedList.length ? [{ title: 'Unassigned', data: unassignedList, color: SYS.yellow, hint: 'On the roster but not under any crew or pool' }] : []),
          ...(offRoster.length ? [{ title: 'Not on the roster', data: offRoster.map(name => ({ name })), color: SYS.cyan, hint: 'On a job today but missing from the roster. Driver tags like Rich-t already match.' }] : []),
        ].map(sec => (
          <Group key={sec.title} style={{ padding: '12px 14px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: sec.hint ? 2 : 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: sec.color, alignSelf: 'center' }} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>{sec.title}</span>
              <span className="tnum" style={{ fontSize: 13, color: A.label3 }}>{sec.data.length}</span>
            </div>
            {sec.hint && <div style={{ fontSize: 12, color: A.label2, marginBottom: 10 }}>{sec.hint}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sec.data.length === 0 && <span style={{ fontSize: 13, color: A.label3 }}>No one</span>}
              {sec.data.map((p, i) => {
                const on = worksThisWeek(p.name);
                return (
                  <button key={i} type="button" onClick={() => pick(p.name, sec.color)} className="ap-btn ap-press" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: on ? tint(sec.color, 0.18) : A.fill4, color: on ? sec.color : A.label, fontSize: 13, fontWeight: on ? 600 : 400 }}
                    title={on ? 'Working this week' : 'Not on a job this week'}>
                    {p.name}<QualBadge code={p.qual} />
                  </button>
                );
              })}
            </div>
          </Group>
        ))}
      </div>
      <SectionFooter style={{ marginTop: 10 }}>Dots show Sunday through Saturday; a filled dot means they’re on a job that day. Tinted names in the pools are working this week.</SectionFooter>

      <WeekSheet sel={sel} onClose={() => setSel(null)} allData={allData} isMobile={isMobile} monthName={monthName} onOpenMonth={onOpenMonth} crews={crews} />
    </div>
  );
}

// ── Sheet: someone's week, with a link to their month ────────
function WeekSheet({ sel, onClose, allData, isMobile, monthName, onOpenMonth, crews }) {
  if (!sel) return null;
  const isPM = sel.kind === 'pm';
  const days = DAY_ORDER.map(d => ({ d, date: allData?.[d]?.date, jobs: isPM ? pmJobs(sel.code, allData?.[d]) : jobsFor(sel.name, allData?.[d]) })).filter(x => x.jobs.length);
  const jobCount = days.reduce((s, x) => s + x.jobs.length, 0);
  const foremen = new Set(Object.keys(crews || {}));
  return (
    <Sheet open onClose={onClose} isMobile={isMobile} title={sel.name}
      subtitle={`${days.length} ${days.length === 1 ? 'day' : 'days'} · ${jobCount} ${jobCount === 1 ? 'job' : 'jobs'} this week`}
      accessory={<Avatar name={sel.name} text={isPM ? sel.code : undefined} color={sel.color} size={38} />}>
      {days.length === 0 && <EmptyState icon="calendar" title="Nothing this week">{isPM ? 'No jobs called in by this PM this week.' : `${sel.name} isn’t on any job this week.`}</EmptyState>}
      {days.map(({ d, date, jobs }) => (
        <div key={d} style={{ marginBottom: 16 }}>
          <SectionHeader>{d}{date && <span style={{ color: A.label2, fontWeight: 400, marginLeft: 8 }}>{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}</SectionHeader>
          <div style={{ background: A.cell2, borderRadius: 12, overflow: 'hidden' }}>
            {jobs.map((j, i) => {
              const ot = isOvertimeStart(j.onsiteTime);
              const leads = (j.crew || []).map(canonicalName).filter(n => foremen.has(n) && n !== sel.name);
              const driving = !isPM && (j.crew || []).some(c => same(c, sel.name) && hasDriverTag(c));
              return (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '0 14px' }}>
                  <div style={{ display: 'flex', gap: 9, padding: '11px 0', width: 82, flexShrink: 0 }}>
                    <span style={{ width: 4, borderRadius: 2, background: ot ? SYS.yellow : PM_COLORS[String(j.calledIn || '').toUpperCase()] || sel.color }} />
                    <span className="tnum" style={{ fontSize: 15, fontWeight: 600, color: !j.onsiteTime ? A.label3 : ot ? SYS.yellow : A.label }}>{j.onsiteTime || 'TBD'}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, padding: '11px 0', borderTop: i ? `0.5px solid ${A.sep}` : 'none' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>{j.customer}{!isPM && <PMBadge initials={j.calledIn} size="sm" />}</div>
                    <div style={{ fontSize: 13, color: A.label2, marginTop: 1 }}>{j.location || 'No location'}<span className="tnum" style={{ color: A.label3 }}>{'  ·  '}#{j.num}{j.poJob ? `  ·  PO ${j.poJob}` : ''}</span></div>
                    <div style={{ fontSize: 13, color: A.label2, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                      {driving && <Icon name="truck" size={14} color={SYS.purple} />}
                      {isPM
                        ? `${j.numMen ?? '–'} ${j.numMen === 1 ? 'man' : 'men'}: ${(j.crew || []).filter(c => !isNonPerson(c)).map(canonicalName).join(', ') || 'no crew yet'}`
                        : [driving ? 'Driving' : null, leads.length ? `With ${leads.join(' & ')}` : foremen.has(sel.name) ? 'Leading' : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 2px' }}>
        <FilledButton onClick={() => { onClose(); onOpenMonth(sel); }} style={{ width: isMobile ? '100%' : 'auto' }}>
          <Icon name="calendar" size={16} weight={2.2} />See all of {monthName}
        </FilledButton>
      </div>
    </Sheet>
  );
}
