// ── Month scope for the Schedule page ────────────────────────
// Search every job in a month (customers, locations, PO/job #, PMs, crew
// names), and browse the month by role: foremen, journeymen, apprentices
// and PMs. Picking a person opens their month agenda.
//
// Data comes from the same weeksCache the rest of the app uses; this view
// asks the app to load every week that overlaps the month.
import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import {
  DAY_ORDER, SYS, PM_COLORS, foremanColor, isOvertimeStart, isNonPerson, canonicalName, hasDriverTag,
  getSaturdayKey, isoDate, todayIso, jobMatchesQuery, satKeyToLabel,
} from './scheduleUtils.js';
import { profileFor, rosterKey, ROLE_LABEL } from './profiles.js';
import {
  A, tint, Icon, Capsule, PMBadge, Avatar, Group, SectionHeader, SectionFooter, Segmented, ChipBar,
  Highlight, PlainButton, CircleButton, Spinner, useWidth,
} from './ui/apple.jsx';
import { DateJumpButton, SelectedDayCard, dayNameOf } from './ui/DateJump.jsx';

export const ROLE_VIEWS = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'foreman', label: 'Foremen' },
  { id: 'journeyman', label: 'Journeymen' },
  { id: 'apprentice', label: 'Apprentices' },
  { id: 'pm', label: 'PMs' },
];
const ROLE_SINGULAR = { foreman: 'Foreman', journeyman: 'Journeyman', apprentice: 'Apprentice', pm: 'Project manager' };

// "A", "A & B", "A, B & C"
const andList = xs => xs.length < 3 ? xs.join(' & ') : `${xs.slice(0, -1).join(', ')} & ${xs[xs.length - 1]}`;
const LONG_DAY = ds => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const SHORT_DAY = ds => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

// ── Build the month model ────────────────────────────────────
export function buildMonth(weeksCache, y, m, profiles) {
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}-`;
  const byDate = new Map();
  for (const wd of Object.values(weeksCache || {})) {
    for (const dn of DAY_ORDER) {
      const dd = wd?.[dn];
      if (!dd?.date || !dd.date.startsWith(prefix) || byDate.has(dd.date)) continue;
      byDate.set(dd.date, { date: dd.date, day: dn, data: dd });
    }
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  // People are keyed by exact roster string (aliases in installers.json
  // resolve to their roster name) — no fuzzy matching, same as the rest
  // of the app, because the roster is full of near-duplicate names.
  const people = new Map();
  let order = 0;
  const get = raw => {
    const prof = profileFor(profiles, raw);
    const name = prof?.rosterName || String(raw).trim();
    const key = rosterKey(name);
    if (!key) return null;
    let p = people.get(key);
    if (!p) {
      p = { key, name, realName: prof?.displayName?.trim() || '', profRole: prof?.role || '', order: order++,
        foreman: false, apprentice: false, onRoster: false, color: null, crewOf: null,
        entries: [], dates: new Set(), ot: 0, driving: new Set() };
      people.set(key, p);
    }
    return p;
  };
  const pms = new Map();
  const getPM = code => {
    let p = pms.get(code);
    if (!p) { p = { key: `pm:${code}`, code, name: `PM ${code}`, isPM: true, color: PM_COLORS[code] || SYS.gray, entries: [], dates: new Set(), ot: 0, men: 0 }; pms.set(code, p); }
    return p;
  };
  Object.keys(PM_COLORS).forEach(getPM); // always list the known PMs

  const totals = { jobs: 0, men: 0, ot: 0, cancelled: 0, workDays: 0 };
  // Who is leading each job (foremen on its crew). Kept off the job objects
  // themselves: those live in weeksCache and are diffed on every refresh.
  const leads = new WeakMap();
  for (const d of days) {
    const dd = d.data;
    const fk = Object.keys(dd.crews || {});
    fk.forEach((f, i) => {
      const p = get(f);
      if (p) { p.foreman = true; p.onRoster = true; if (!p.color) p.color = foremanColor(f, i); }
      for (const mbr of dd.crews[f]?.members || []) {
        const q = get(mbr.name);
        if (!q) continue;
        q.onRoster = true;
        if (mbr.qual === 'A') q.apprentice = true;
        if (!q.crewOf) q.crewOf = f;
      }
    });
    for (const k of ['laborers', 'drivers', 'extra']) for (const mbr of dd.pools?.[k] || []) {
      const q = get(mbr.name);
      if (q) { q.onRoster = true; if (mbr.qual === 'A') q.apprentice = true; }
    }
    const foremenToday = new Set(fk.map(f => rosterKey(f)));
    if ((dd.jobs || []).some(j => !j.cancelled)) totals.workDays++;
    for (const job of dd.jobs || []) {
      const ot = isOvertimeStart(job.onsiteTime);
      if (job.cancelled) totals.cancelled++;
      else { totals.jobs++; totals.men += job.numMen || 0; if (ot) totals.ot++; }
      const jobForemen = [];
      const seen = new Set();
      for (const raw of job.crew || []) {
        if (isNonPerson(raw)) continue;
        const p = get(canonicalName(raw));
        if (!p || seen.has(p.key)) continue;
        seen.add(p.key);
        if (foremenToday.has(p.key)) jobForemen.push(p.name);
        const driving = hasDriverTag(raw);
        p.entries.push({ date: d.date, day: d.day, job, driving, cancelled: !!job.cancelled });
        if (!job.cancelled) { p.dates.add(d.date); if (ot) p.ot++; if (driving) p.driving.add(d.date); }
      }
      leads.set(job, jobForemen);
      const pmCode = String(job.calledIn || '').trim().toUpperCase();
      if (pmCode) {
        const pm = getPM(pmCode);
        pm.entries.push({ date: d.date, day: d.day, job, cancelled: !!job.cancelled });
        if (!job.cancelled) { pm.dates.add(d.date); pm.men += job.numMen || 0; if (ot) pm.ot++; }
      }
    }
  }
  const list = [...people.values()];
  for (const p of list) {
    const r = p.profRole || '';
    p.role = r === 'foreman' ? 'foreman' : r.startsWith('apprentice') ? 'apprentice' : r === 'laborer' ? 'journeyman'
      : p.foreman ? 'foreman' : p.apprentice ? 'apprentice' : 'journeyman';
    p.roleLabel = r ? ROLE_LABEL[r] : ROLE_SINGULAR[p.role];
    p.jobCount = p.entries.filter(e => !e.cancelled).length;
  }
  for (const pm of pms.values()) pm.jobCount = pm.entries.filter(e => !e.cancelled).length;
  return { days, people: list, pms: [...pms.values()], totals, leads };
}

function peopleForRole(model, role) {
  if (role === 'pm') return [...model.pms].sort((a, b) => b.jobCount - a.jobCount || a.code.localeCompare(b.code));
  const list = model.people.filter(p => p.role === role && (p.onRoster || p.jobCount > 0));
  if (role === 'foreman') return list.sort((a, b) => (b.jobCount > 0) - (a.jobCount > 0) || a.order - b.order);
  return list.sort((a, b) => (b.jobCount > 0) - (a.jobCount > 0) || a.name.localeCompare(b.name));
}
function matchesPerson(p, q) {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  if (p.isPM) return p.code.toLowerCase() === n || `pm ${p.code}`.toLowerCase() === n;
  return p.name.toLowerCase().includes(n) || (p.realName && p.realName.toLowerCase().includes(n));
}

// ── Mini month (Calendar sidebar style) ──────────────────────
function MiniMonth({ y, m, marks, onPick, loadedDates, compact, selected }) {
  const dim = new Date(y, m + 1, 0).getDate();
  const start = new Date(y, m, 1).getDay();
  const today = todayIso();
  const cells = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: A.label3 }}>{l}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', rowGap: compact ? 2 : 4 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} />;
          const ds = isoDate(new Date(y, m, d));
          const mk = marks.get(ds);
          const isToday = ds === today;
          const isSel = ds === selected;
          const loaded = loadedDates.has(ds);
          const size = compact ? 30 : 34;
          return (
            <button key={ds} type="button" onClick={() => onPick(ds)} className="ap-btn ap-press" aria-pressed={isSel}
              aria-label={`${LONG_DAY(ds)}${mk ? `, ${mk.label}` : loaded ? ', no jobs' : ''}${isToday ? ', today' : ''}`}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span className="tnum" style={{
                width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: mk?.strong || isToday || isSel ? 600 : 400,
                background: mk?.fill ? mk.fill : isSel ? tint(SYS.blue, 0.16) : 'transparent',
                color: mk?.fill ? '#fff' : isToday ? SYS.red : !loaded ? A.label3 : mk ? A.label : A.label2,
                boxShadow: isSel ? `0 0 0 2px ${A.cellSolid}, 0 0 0 3.5px ${SYS.blue}` : isToday && mk?.fill ? `0 0 0 2px ${A.cellSolid}, 0 0 0 3.5px ${SYS.red}` : 'none',
              }}>{d}</span>
              {!compact && <span className="tnum" style={{ fontSize: 10, height: 12, color: mk?.dotColor || A.label3 }}>{mk?.caption ?? ''}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────
export default function MonthSearch({
  weeksCache, weekStatus, requestWeek, mode, profiles, monthCursor, setMonthCursor,
  query, view, setView, personKey, setPersonKey, onOpenDay, isMobile, focus, onJumpDate, onToday,
}) {
  const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
  const dim = new Date(y, m + 1, 0).getDate();
  const q = (query || '').trim();
  const [boxRef, boxW] = useWidth();
  const wide = !isMobile && boxW >= 900;

  // Every week file that overlaps this month
  const needed = useMemo(() => {
    const s = new Set();
    for (let d = 1; d <= dim; d++) s.add(getSaturdayKey(new Date(y, m, d)));
    return [...s];
  }, [y, m, dim]);
  useEffect(() => {
    if (mode !== 'live') return;
    needed.forEach(k => requestWeek(k, { once: true }));
  }, [needed.join('|'), mode]); // eslint-disable-line
  const loadingCount = needed.filter(k => weekStatus?.[k] === 'loading').length;
  const missing = needed.filter(k => !weeksCache[k] && weekStatus?.[k] === 'failed');

  const model = useMemo(() => buildMonth(weeksCache, y, m, profiles), [weeksCache, y, m, profiles]);
  const loadedDates = useMemo(() => new Set(model.days.map(d => d.date)), [model]);
  const monthName = monthCursor.toLocaleDateString('en-US', { month: 'long' });
  const monthTitle = monthCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const [dismissedSeq, setDismissedSeq] = useState(null);
  const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}-`;
  // The picked date, if it falls in the month on screen
  const focusDate = focus?.date && focus.date.startsWith(monthPrefix) && dismissedSeq !== focus.seq ? focus.date : null;
  const focusInfo = useMemo(() => {
    if (!focusDate) return null;
    const day = model.days.find(d => d.date === focusDate);
    const act = (day?.data.jobs || []).filter(j => !j.cancelled);
    return { loaded: !!day, loading: !day && weekStatus?.[getSaturdayKey(new Date(focusDate + 'T12:00:00'))] === 'loading',
      jobs: act.length, men: act.reduce((t, j) => t + (j.numMen || 0), 0) };
  }, [focusDate, model, weekStatus]);

  const person = personKey
    ? (personKey.startsWith('pm:') ? model.pms.find(p => p.key === personKey) : model.people.find(p => p.key === personKey))
    : null;

  const refreshMonth = () => needed.forEach(k => requestWeek(k, { force: true }));
  const shiftMonth = dir => { setMonthCursor(new Date(y, m + dir, 1)); };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      <CircleButton icon="chevronLeft" onClick={() => shiftMonth(-1)} ariaLabel="Previous month" size={30} />
      <div style={{ fontSize: 20, fontWeight: 700, minWidth: isMobile ? 0 : 190, textAlign: 'center', letterSpacing: '-0.01em' }}>{monthTitle}</div>
      <CircleButton icon="chevronRight" onClick={() => shiftMonth(1)} ariaLabel="Next month" size={30} />
      <PlainButton onClick={onToday} title="Jump to today’s date">Today</PlainButton>
      <DateJumpButton onJump={onJumpDate} value={focus?.date} />
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: A.label2 }}>
        {loadingCount > 0
          ? <><Spinner size={15} /><span>Loading {loadingCount} {loadingCount === 1 ? 'week' : 'weeks'}…</span></>
          : mode === 'live' && <PlainButton onClick={refreshMonth} title="Reload every log book in this month" style={{ fontSize: 13 }}><Icon name="refresh" size={15} weight={2.2} />Reload month</PlainButton>}
      </div>
    </div>
  );

  const segs = ROLE_VIEWS.map(v => ({ ...v, label: v.label }));
  const roleSwitch = (
    <div style={{ marginBottom: 18 }}>
      {isMobile
        ? <ChipBar options={segs} value={view} onChange={v => { setView(v); setPersonKey(null); }} ariaLabel="Browse the month by" />
        : <Segmented options={segs} value={view} onChange={v => { setView(v); setPersonKey(null); }} ariaLabel="Browse the month by" style={{ maxWidth: 620 }} />}
    </div>
  );

  let body;
  if (!model.days.length && loadingCount === 0) {
    body = (
      <Group style={{ padding: '44px 20px', textAlign: 'center' }}>
        <div style={{ color: A.label3, display: 'flex', justifyContent: 'center', marginBottom: 10 }}><Icon name="calendar" size={34} weight={1.5} /></div>
        <div style={{ fontSize: 17, fontWeight: 600 }}>No log books for {monthTitle}</div>
        <div style={{ fontSize: 14, color: A.label2, marginTop: 4, maxWidth: 420, marginInline: 'auto' }}>
          None of this month’s weekly log books were found in SharePoint.
        </div>
      </Group>
    );
  } else if (person) {
    body = <PersonAgenda person={person} model={model} y={y} m={m} q={q} wide={wide} loadedDates={loadedDates}
      onBack={() => { setView(person.isPM ? 'pm' : person.role); setPersonKey(null); }}
      backLabel={ROLE_VIEWS.find(v => v.id === (person.isPM ? 'pm' : person.role))?.label || 'Back'} onOpenDay={onOpenDay} isMobile={isMobile}
      focus={focus} onSelectDate={onJumpDate} />;
  } else if (view === 'jobs') {
    body = <JobsResults model={model} y={y} m={m} q={q} wide={wide} loadedDates={loadedDates} onOpenDay={onOpenDay}
      onPickPerson={(p) => { setView(p.isPM ? 'pm' : p.role); setPersonKey(p.key); }} isMobile={isMobile} monthName={monthName}
      focus={focus} onSelectDate={onJumpDate} />;
  } else {
    body = <RoleBoard model={model} role={view} y={y} m={m} dim={dim} q={q} wide={wide} loadedDates={loadedDates}
      onPickPerson={p => setPersonKey(p.key)} onOpenDay={onOpenDay} isMobile={isMobile} />;
  }

  return (
    <div ref={boxRef}>
      {header}
      {focusDate && <SelectedDayCard date={focusDate} info={focusInfo} isToday={focusDate === todayIso()} compact={isMobile}
        onOpen={() => onOpenDay({ date: focusDate, day: dayNameOf(focusDate) })} onDismiss={() => setDismissedSeq(focus.seq)} />}
      {!person && roleSwitch}
      {body}
      {missing.length > 0 && (
        <SectionFooter style={{ marginTop: 14 }}>
          No log book found for {missing.map(satKeyToLabel).join(', ')}{missing.length === 1 ? '.' : ' — those weeks aren’t included.'}
        </SectionFooter>
      )}
    </div>
  );
}

// ── Jobs: every (matching) job in the month, by day ──────────
function crewSummary(job, q, leadsMap) {
  const names = [];
  for (const raw of job.crew || []) { if (isNonPerson(raw)) continue; const c = canonicalName(raw); if (!names.includes(c)) names.push(c); }
  const lead = new Set(leadsMap?.get(job) || []);
  const n = q.toLowerCase();
  names.sort((a, b) => (lead.has(b) - lead.has(a)) || ((n && b.toLowerCase().includes(n)) - (n && a.toLowerCase().includes(n))));
  return { names, lead };
}

function MonthJobRow({ entry, first, q, onOpenDay, showDate, leads }) {
  const { job } = entry;
  const ot = !job.cancelled && isOvertimeStart(job.onsiteTime);
  const accent = job.cancelled ? SYS.red : ot ? SYS.yellow : PM_COLORS[(job.calledIn || '').toUpperCase()] || A.cell3;
  const { names, lead } = crewSummary(job, q, leads);
  const shown = names.slice(0, 7);
  return (
    <button type="button" onClick={() => onOpenDay({ date: entry.date, day: entry.day })} className="ap-btn ap-row ap-tap"
      aria-label={`${job.customer}, ${SHORT_DAY(entry.date)} — open this day`}
      style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 12, padding: '0 16px', background: 'transparent', border: 'none', color: 'inherit', opacity: job.cancelled ? 0.6 : 1 }}>
      <div style={{ display: 'flex', gap: 10, padding: '12px 0', width: showDate ? 118 : 84, flexShrink: 0 }}>
        <span style={{ width: 4, borderRadius: 2, background: accent, flexShrink: 0 }} />
        <div>
          {showDate && <div style={{ fontSize: 13, fontWeight: 600, color: A.label, whiteSpace: 'nowrap' }}>{SHORT_DAY(entry.date)}</div>}
          <div className="tnum" style={{ fontSize: showDate ? 13 : 15, fontWeight: showDate ? 400 : 600, color: !job.onsiteTime ? A.label3 : ot ? SYS.yellow : showDate ? A.label2 : A.label, whiteSpace: 'nowrap' }}>{job.onsiteTime || 'TBD'}</div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '12px 0', borderTop: first ? 'none' : `0.5px solid ${A.sep}`, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, textDecoration: job.cancelled ? 'line-through' : 'none' }}>
            <Highlight text={job.customer} q={q} />
            {ot && <Capsule color={SYS.yellow} size={10} style={{ marginLeft: 7 }}>OT</Capsule>}
            {job.cancelled && <Capsule color={SYS.red} size={10} style={{ marginLeft: 7 }}>Cancelled</Capsule>}
          </div>
          <div style={{ fontSize: 13, color: A.label2, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {job.location ? <Highlight text={job.location} q={q} /> : <span style={{ color: A.label3 }}>No location</span>}
            <span className="tnum" style={{ color: A.label3 }}>{'  ·  '}<Highlight text={`#${job.num}${job.poJob ? `  ·  PO ${job.poJob}` : ''}`} q={q} /></span>
          </div>
          {shown.length > 0 && (
            <div style={{ fontSize: 13, color: A.label2, marginTop: 3, lineHeight: 1.45 }}>
              {shown.map((nm, i) => (
                <Fragment key={nm}>
                  {i > 0 && ', '}
                  <span style={{ color: lead.has(nm) ? A.label : undefined, fontWeight: lead.has(nm) ? 600 : 400 }}><Highlight text={nm} q={q} /></span>
                </Fragment>
              ))}
              {names.length > shown.length && <span style={{ color: A.label3 }}> +{names.length - shown.length}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {job.numMen != null && <span className="tnum" style={{ fontSize: 13, color: A.label2 }}>{job.numMen} {job.numMen === 1 ? 'man' : 'men'}</span>}
          <PMBadge initials={job.calledIn} size="sm" />
          <span style={{ color: A.label3 }}><Icon name="chevronRight" size={14} weight={2.4} /></span>
        </div>
      </div>
    </button>
  );
}

function scrollToDate(prefix, ds) {
  const el = document.getElementById(`${prefix}-${ds}`);
  if (!el) return false;
  el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  return true;
}
// After a jump (Go to date / Today / a tap on the calendar), bring that day's section into view.
// The week may still be loading, so it keeps trying — once per jump — until the section exists.
function useScrollToFocus(prefix, focus, ready) {
  const done = useRef(null);
  useEffect(() => {
    if (!focus?.date || done.current === focus.seq) return;
    if (scrollToDate(prefix, focus.date)) done.current = focus.seq;
  }, [prefix, focus?.seq, focus?.date, ready]);
}

function JobsResults({ model, y, m, q, wide, loadedDates, onOpenDay, onPickPerson, isMobile, monthName, focus, onSelectDate }) {
  const groups = useMemo(() => {
    const out = [];
    for (const d of model.days) {
      const hits = (d.data.jobs || []).filter(j => jobMatchesQuery(j, q))
        .sort((a, b) => (!!a.cancelled - !!b.cancelled) || (isOvertimeStart(a.onsiteTime) - isOvertimeStart(b.onsiteTime)));
      if (hits.length) out.push({ date: d.date, day: d.day, entries: hits.map(job => ({ date: d.date, day: d.day, job })) });
    }
    return out;
  }, [model, q]);
  const hitCount = groups.reduce((s, g) => s + g.entries.filter(e => !e.job.cancelled).length, 0);
  useScrollToFocus('mj', focus, groups.length);
  const topPeople = useMemo(() => {
    if (!q) return [];
    const ppl = model.people.filter(p => p.jobCount > 0 && matchesPerson(p, q));
    const pms = model.pms.filter(p => p.jobCount > 0 && matchesPerson(p, q));
    return [...pms, ...ppl.sort((a, b) => b.jobCount - a.jobCount)].slice(0, 8);
  }, [model, q]);
  const marks = useMemo(() => {
    const mk = new Map();
    for (const g of groups) {
      const n = g.entries.filter(e => !e.job.cancelled).length;
      mk.set(g.date, { label: `${n} ${n === 1 ? 'job' : 'jobs'}`, caption: n || '', fill: q ? tint(SYS.blue, 0.85) : null, strong: true });
    }
    return mk;
  }, [groups, q]);

  const today = todayIso();
  const list = (
    <div>
      {topPeople.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <SectionHeader>People</SectionHeader>
          <div className="ap-hscroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            {topPeople.map(p => (
              <button key={p.key} type="button" onClick={() => onPickPerson(p)} className="ap-btn ap-press glass" style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 8px', borderRadius: 16, border: 'none',
                color: A.label, cursor: 'pointer', flexShrink: 0, textAlign: 'left' }}>
                <Avatar name={p.isPM ? p.code : p.name} text={p.isPM ? p.code : undefined} color={p.color || (p.isPM ? null : undefined)} size={34} />
                <span>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}><Highlight text={p.name} q={q} /></span>
                  <span className="tnum" style={{ display: 'block', fontSize: 12, color: A.label2 }}>{p.isPM ? 'Project manager' : p.roleLabel} · {p.dates.size} {p.dates.size === 1 ? 'day' : 'days'}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {groups.length === 0 && (
        <Group style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ color: A.label3, display: 'flex', justifyContent: 'center', marginBottom: 10 }}><Icon name="search" size={30} weight={1.6} /></div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{q ? `No results for “${q}”` : 'No jobs yet'}</div>
          <div style={{ fontSize: 14, color: A.label2, marginTop: 4 }}>{q ? `Nothing in ${monthName} matches. Check the spelling, or try a PO number or street.` : `Nothing is scheduled in ${monthName} so far.`}</div>
        </Group>
      )}
      {groups.map(g => {
        const n = g.entries.filter(e => !e.job.cancelled).length;
        return (
          <section key={g.date} id={`mj-${g.date}`} style={{ marginBottom: 20, scrollMarginTop: 90 }}>
            <SectionHeader right={<PlainButton onClick={() => onOpenDay({ date: g.date, day: g.day })} style={{ fontSize: 13, padding: 0 }}>Open day</PlainButton>}>
              {LONG_DAY(g.date)}
              {g.date === today && <Capsule color={SYS.red} size={10} style={{ marginLeft: 8 }}>Today</Capsule>}
              <span className="tnum" style={{ color: A.label3, fontWeight: 400, marginLeft: 8 }}>{n} {n === 1 ? 'job' : 'jobs'}</span>
            </SectionHeader>
            <Group>{g.entries.map((e, i) => <MonthJobRow key={`${e.job.num}-${i}`} entry={e} first={i === 0} q={q} onOpenDay={onOpenDay} leads={model.leads} />)}</Group>
          </section>
        );
      })}
    </div>
  );

  const summary = (
    <div className="tnum" style={{ fontSize: 13, color: A.label2, lineHeight: 1.5 }}>
      {q
        ? <><b style={{ color: A.label }}>{hitCount}</b> {hitCount === 1 ? 'job matches' : 'jobs match'} on <b style={{ color: A.label }}>{groups.length}</b> {groups.length === 1 ? 'day' : 'days'}</>
        : <><b style={{ color: A.label }}>{model.totals.jobs}</b> jobs · <b style={{ color: A.label }}>{model.totals.men}</b> man-days · <b style={{ color: SYS.yellow }}>{model.totals.ot}</b> overtime over <b style={{ color: A.label }}>{model.totals.workDays}</b> working days</>}
    </div>
  );

  if (!wide) return (
    <div>
      <div style={{ marginBottom: 16 }}>{summary}</div>
      {list}
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)', gap: 28, alignItems: 'start' }}>
      <aside style={{ position: 'sticky', top: 16 }}>
        <Group style={{ padding: 14 }}>
          <MiniMonth y={y} m={m} marks={marks} loadedDates={loadedDates} onPick={onSelectDate} selected={focus?.date} />
        </Group>
        <SectionFooter>{summary}<div style={{ marginTop: 6 }}>Tap any date to jump to it — even one with no jobs.</div></SectionFooter>
      </aside>
      {list}
    </div>
  );
}

// ── Role board: one row per person, one square per day ───────
function RoleBoard({ model, role, y, m, dim, q, wide, loadedDates, onPickPerson, onOpenDay, isMobile }) {
  const all = useMemo(() => peopleForRole(model, role), [model, role]);
  const list = all.filter(p => matchesPerson(p, q));
  const today = todayIso();
  const dates = Array.from({ length: dim }, (_, i) => isoDate(new Date(y, m, i + 1)));
  const dayMeta = dates.map(ds => ({ ds, dow: new Date(ds + 'T12:00:00').getDay() }));
  const scheduledCount = list.filter(p => p.jobCount > 0).length;
  const title = ROLE_VIEWS.find(v => v.id === role)?.label;
  const hint = {
    foreman: 'Foremen are the bold names on the roster.',
    journeyman: 'Everyone on a crew or in the pools who isn’t a foreman or an apprentice, plus names found only on job rows.',
    apprentice: 'Marked “A” on the roster, or set as an apprentice in People.',
    pm: 'From the “Called in” column.',
  }[role];

  if (!list.length) return (
    <Group style={{ padding: '36px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{q ? `No ${title.toLowerCase()} match “${q}”` : `No ${title.toLowerCase()} this month`}</div>
      <div style={{ fontSize: 14, color: A.label2, marginTop: 4 }}>{hint}</div>
    </Group>
  );

  const nameCol = wide ? 230 : 0;
  const statCol = wide ? 96 : 0;
  return (
    <div>
      <SectionHeader right={<span className="tnum">{scheduledCount} of {list.length} scheduled this month</span>}>{title}</SectionHeader>
      <Group>
        {wide && (
          <div style={{ display: 'grid', gridTemplateColumns: `${nameCol}px repeat(${dim}, minmax(0,1fr)) ${statCol}px`, alignItems: 'end', padding: '10px 16px 8px', borderBottom: `0.5px solid ${A.sep}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: A.label2 }}>Name</span>
            {dayMeta.map(({ ds, dow }) => (
              <span key={ds} className="tnum" style={{ textAlign: 'center', fontSize: 11, lineHeight: 1.25, color: ds === today ? SYS.red : dow === 0 || dow === 6 ? A.label3 : A.label2, fontWeight: ds === today ? 700 : 500 }}>
                <span style={{ display: 'block', fontSize: 9.5 }}>{'SMTWTFS'[dow]}</span>{Number(ds.slice(8))}
              </span>
            ))}
            <span style={{ fontSize: 12, fontWeight: 600, color: A.label2, textAlign: 'right' }}>Days · Jobs</span>
          </div>
        )}
        {list.map((p, i) => {
          const color = p.color || (p.isPM ? PM_COLORS[p.code] : SYS.blue);
          const byDate = new Map();
          for (const e of p.entries) { if (e.cancelled) continue; (byDate.get(e.date) || byDate.set(e.date, []).get(e.date)).push(e); }
          const idle = p.jobCount === 0;
          const sub = p.isPM ? `${p.men} man-days${p.ot ? ` · ${p.ot} overtime` : ''}`
            : [p.realName && p.realName !== p.name ? p.realName : null, p.crewOf && role !== 'foreman' ? `${p.crewOf}’s crew` : null, !p.onRoster ? 'Not on roster' : null].filter(Boolean).join(' · ');
          return (
            <Fragment key={p.key}>
            {!wide && i > 0 && <div style={{ height: 0.5, background: A.sep, marginLeft: 59 }} />}
            <div style={{ display: wide ? 'grid' : 'flex', gridTemplateColumns: wide ? `${nameCol}px repeat(${dim}, minmax(0,1fr)) ${statCol}px` : undefined, alignItems: 'center', gap: wide ? 0 : 12, padding: '0 16px', opacity: idle ? 0.5 : 1 }}>
              <button type="button" onClick={() => onPickPerson(p)} className="ap-btn ap-press" style={{
                display: 'flex', alignItems: 'center', gap: 11, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer',
                textAlign: 'left', padding: '9px 8px 9px 0', minWidth: 0, flex: wide ? undefined : 1 }}>
                <Avatar name={p.isPM ? p.code : p.name} text={p.isPM ? p.code : undefined} color={p.isPM || role === 'foreman' ? color : null} size={32} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><Highlight text={p.name} q={q} /></span>
                  {sub && <span style={{ display: 'block', fontSize: 12, color: A.label2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>}
                </span>
              </button>
              {wide && dayMeta.map(({ ds, dow }) => {
                const es = byDate.get(ds);
                const ot = es?.some(e => isOvertimeStart(e.job.onsiteTime));
                const loaded = loadedDates.has(ds);
                const tip = es ? `${SHORT_DAY(ds)}: ${es.map(e => `${e.job.customer}${e.job.onsiteTime ? ` (${e.job.onsiteTime})` : ''}`).join(', ')}` : `${SHORT_DAY(ds)}: ${loaded ? 'not scheduled' : 'no log book loaded'}`;
                return (
                  <span key={ds} style={{ display: 'flex', justifyContent: 'center', padding: '0 1px' }}>
                    <button type="button" title={tip} aria-label={tip} disabled={!es} onClick={() => es && onOpenDay({ date: ds, day: DAY_ORDER[dow] })} className="ap-btn" style={{
                      width: '100%', maxWidth: 24, height: 22, borderRadius: 5, border: 'none', padding: 0, cursor: es ? 'pointer' : 'default',
                      background: es ? color : !loaded ? 'transparent' : dow === 0 || dow === 6 ? A.fill4 : A.fill3,
                      boxShadow: !loaded ? `inset 0 0 0 1px ${A.fill4}` : ds === today ? `inset 0 0 0 1.5px ${SYS.red}` : 'none',
                      position: 'relative', color: '#000', fontSize: 10, fontWeight: 700 }}>
                      {es && es.length > 1 && <span className="tnum">{es.length}</span>}
                      {ot && <span style={{ position: 'absolute', top: 2, right: 2, width: 5, height: 5, borderRadius: '50%', background: SYS.yellow, boxShadow: '0 0 0 1px rgba(0,0,0,0.5)' }} />}
                    </button>
                  </span>
                );
              })}
              <span className="tnum" style={{ textAlign: 'right', fontSize: 13, color: A.label2, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                {wide
                  ? <span><b style={{ color: A.label, fontWeight: 600 }}>{p.dates.size}</b> · {p.jobCount}</span>
                  : <span><b style={{ color: A.label, fontWeight: 600 }}>{p.dates.size}</b> {p.dates.size === 1 ? 'day' : 'days'} · {p.jobCount} {p.jobCount === 1 ? 'job' : 'jobs'}</span>}
                {!wide && <span style={{ color: A.label3 }}><Icon name="chevronRight" size={14} weight={2.4} /></span>}
              </span>
              {wide && i < list.length - 1 && <span aria-hidden style={{ gridColumn: '1 / -1', height: 0.5, background: A.sep, marginLeft: 43 }} />}
            </div>
            </Fragment>
          );
        })}
      </Group>
      <SectionFooter>
        {wide
          ? <>Each square is a day; the number is how many jobs that day. A yellow dot means overtime. Select a square to open that day, or a name to see their month.</>
          : <>Select a name to see their month.</>}
        {' '}{hint}
      </SectionFooter>
    </div>
  );
}

// ── Person agenda ────────────────────────────────────────────
function PersonAgenda({ person: p, model, y, m, q, wide, loadedDates, onBack, backLabel, onOpenDay, isMobile, focus, onSelectDate }) {
  const color = p.color || (p.isPM ? PM_COLORS[p.code] : SYS.blue);
  const todayStr = todayIso();
  const monthHasToday = todayStr.startsWith(`${y}-${String(m + 1).padStart(2, '0')}-`);
  const [upcoming, setUpcoming] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2200); }
    catch { window.prompt('Copy this link:', window.location.href); }
  };
  const groups = useMemo(() => {
    const byDate = new Map();
    for (const e of p.entries) {
      if (q && !jobMatchesQuery(e.job, q)) continue;
      if (upcoming && monthHasToday && e.date < todayStr) continue;
      (byDate.get(e.date) || byDate.set(e.date, { date: e.date, day: e.day, entries: [] }).get(e.date)).entries.push(e);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [p, q, upcoming, monthHasToday, todayStr]);
  const marks = useMemo(() => {
    const mk = new Map();
    for (const g of groups) {
      const act = g.entries.filter(e => !e.cancelled);
      if (!act.length) continue;
      mk.set(g.date, { label: `${act.length} ${act.length === 1 ? 'job' : 'jobs'}`, fill: color, strong: true, caption: act.some(e => isOvertimeStart(e.job.onsiteTime)) ? 'OT' : '', dotColor: SYS.yellow });
    }
    return mk;
  }, [groups, color]);

  const stats = p.isPM
    ? [['Jobs', p.jobCount], ['Days', p.dates.size], ['Man-days', p.men], ['Overtime', p.ot]]
    : [['Days', p.dates.size], ['Jobs', p.jobCount], ['Overtime', p.ot], ['Driving', p.driving.size]];
  const subtitle = p.isPM ? 'Project manager'
    : [p.roleLabel, p.realName && p.realName !== p.name ? p.realName : null, p.crewOf && p.role !== 'foreman' ? `${p.crewOf}’s crew` : null, !p.onRoster ? 'Not on roster' : null].filter(Boolean).join(' · ');
  const today = todayIso();
  useScrollToFocus('pa', focus, groups.length);

  const card = (
    <div>
      <Group style={{ padding: '20px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name={p.isPM ? p.code : p.name} text={p.isPM ? p.code : undefined} color={color} size={60} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{p.name}</div>
            <div style={{ fontSize: 14, color: A.label2, marginTop: 2 }}>{subtitle}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', marginTop: 18, borderTop: `0.5px solid ${A.sep}`, paddingTop: 14 }}>
          {stats.map(([l, v], i) => (
            <div key={l} style={{ textAlign: 'center', borderLeft: i ? `0.5px solid ${A.sep}` : 'none' }}>
              <div className="tnum" style={{ fontSize: 22, fontWeight: 600, color: l === 'Overtime' && v ? SYS.yellow : A.label }}>{v}</div>
              <div style={{ fontSize: 12, color: A.label2 }}>{l}</div>
            </div>
          ))}
        </div>
      </Group>
      <Group style={{ padding: 14, marginTop: 14 }}>
        <MiniMonth y={y} m={m} marks={marks} loadedDates={loadedDates} onPick={onSelectDate} compact={isMobile} selected={focus?.date} />
      </Group>
      <SectionFooter>Filled dates are days {p.isPM ? 'with jobs called in' : 'scheduled'}. Tap any date to jump to it.</SectionFooter>
    </div>
  );

  const list = (
    <div>
      {groups.length === 0 && (
        <Group style={{ padding: '36px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{q ? `No jobs match “${q}”` : 'Not scheduled this month'}</div>
          <div style={{ fontSize: 14, color: A.label2, marginTop: 4 }}>{q ? 'Clear the search to see all of their jobs.' : `${p.name} isn’t on any job in the loaded log books.`}</div>
        </Group>
      )}
      {groups.map(g => (
        <section key={g.date} id={`pa-${g.date}`} style={{ marginBottom: 18, scrollMarginTop: 90 }}>
          <SectionHeader right={<PlainButton onClick={() => onOpenDay({ date: g.date, day: g.day })} style={{ fontSize: 13, padding: 0 }}>Open day</PlainButton>}>
            {LONG_DAY(g.date)}
            {g.date === today && <Capsule color={SYS.red} size={10} style={{ marginLeft: 8 }}>Today</Capsule>}
          </SectionHeader>
          <Group>
            {g.entries.map((e, i) => {
              const job = e.job;
              const ot = !job.cancelled && isOvertimeStart(job.onsiteTime);
              const jobLeads = model.leads.get(job) || [];
              const leads = jobLeads.filter(f => rosterKey(f) !== p.key);
              const isLead = jobLeads.some(f => rosterKey(f) === p.key);
              const role = p.isPM ? `${job.numMen ?? '–'} ${job.numMen === 1 ? 'man' : 'men'}${jobLeads.length ? ` · led by ${andList(jobLeads)}` : ''}`
                : [isLead ? 'Leading' : leads.length ? `With ${andList(leads)}` : null, e.driving ? 'Driving' : null].filter(Boolean).join(' · ');
              return (
                <button key={`${job.num}-${i}`} type="button" onClick={() => onOpenDay({ date: g.date, day: g.day })} className="ap-btn ap-row ap-tap" style={{
                  display: 'flex', width: '100%', textAlign: 'left', gap: 12, padding: '0 16px', background: 'transparent', border: 'none', color: 'inherit', opacity: job.cancelled ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', gap: 10, padding: '12px 0', width: 84, flexShrink: 0 }}>
                    <span style={{ width: 4, borderRadius: 2, background: job.cancelled ? SYS.red : ot ? SYS.yellow : color, flexShrink: 0 }} />
                    <span className="tnum" style={{ fontSize: 15, fontWeight: 600, color: !job.onsiteTime ? A.label3 : ot ? SYS.yellow : A.label, whiteSpace: 'nowrap' }}>{job.onsiteTime || 'TBD'}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, padding: '12px 0', borderTop: i ? `0.5px solid ${A.sep}` : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, textDecoration: job.cancelled ? 'line-through' : 'none' }}>
                        <Highlight text={job.customer} q={q} />
                        {ot && <Capsule color={SYS.yellow} size={10} style={{ marginLeft: 7 }}>OT</Capsule>}
                        {job.cancelled && <Capsule color={SYS.red} size={10} style={{ marginLeft: 7 }}>Cancelled</Capsule>}
                      </div>
                      <div style={{ fontSize: 13, color: A.label2, marginTop: 2 }}>
                        {job.location ? <Highlight text={job.location} q={q} /> : <span style={{ color: A.label3 }}>No location</span>}
                        <span className="tnum" style={{ color: A.label3 }}>{'  ·  '}#{job.num}{job.poJob ? `  ·  PO ${job.poJob}` : ''}</span>
                      </div>
                      {role && <div style={{ fontSize: 13, color: A.label2, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                        {e.driving && <Icon name="truck" size={14} color={SYS.purple} />}{role}
                      </div>}
                      {p.isPM && (() => {
                        const names = []; for (const c of job.crew || []) { if (isNonPerson(c)) continue; const cn = canonicalName(c); if (!names.includes(cn)) names.push(cn); }
                        return <div style={{ fontSize: 13, color: names.length ? A.label : SYS.orange, marginTop: 3, lineHeight: 1.45 }}>
                          {names.length ? names.map((nm, k) => <Fragment key={nm}>{k > 0 && ', '}<span style={{ fontWeight: jobLeads.includes(nm) ? 600 : 400 }}><Highlight text={nm} q={q} /></span></Fragment>) : 'No crew assigned yet'}
                        </div>;
                      })()}
                    </div>
                    {!p.isPM && <PMBadge initials={job.calledIn} size="sm" />}
                    <span style={{ color: A.label3 }}><Icon name="chevronRight" size={14} weight={2.4} /></span>
                  </div>
                </button>
              );
            })}
          </Group>
        </section>
      ))}
    </div>
  );

  return (
    <div className="ap-fade">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <PlainButton onClick={onBack} style={{ marginLeft: -8, fontSize: 17 }}><Icon name="chevronLeft" size={20} weight={2.4} />{backLabel}</PlainButton>
        <div style={{ flex: 1 }} />
        {monthHasToday && <Segmented size="sm" ariaLabel="Which days" value={upcoming ? 'up' : 'all'} onChange={v => setUpcoming(v === 'up')} fullWidth={false}
          options={[{ id: 'all', label: 'Whole month' }, { id: 'up', label: 'Today on' }]} style={{ width: 200 }} />}
        <PlainButton onClick={copyLink} title="Copy a link that opens this month view — handy to bookmark" style={{ fontSize: 15 }}>
          <Icon name={copied ? 'checkmark' : 'link'} size={16} weight={2.2} />{copied ? 'Link copied' : 'Copy link'}
        </PlainButton>
      </div>
      {wide
        ? <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0,1fr)', gap: 28, alignItems: 'start' }}>
            <aside style={{ position: 'sticky', top: 16 }}>{card}</aside>
            {list}
          </div>
        : <div>{card}<div style={{ height: 22 }} />{list}</div>}
    </div>
  );
}
