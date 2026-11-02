// ── Day view: the selected day's jobs ────────────────────────
// Apple-style replacement for the old JobsTable / MobileJobCards.
// Same data rules as before (OT split, cancelled at the bottom, ×2 only
// within one time slot, NEW / moved flags vs the comparison day); only the
// presentation changed, plus the search query now comes from the page.
import { useState, useEffect, Fragment } from 'react';
import { FOREMAN_ORDER } from './sampleData.js';
import {
  PM_COLORS, SYS, foremanColor, isOvertimeStart, isNonPerson, isStopLabel, isDriverTag, hasDriverTag,
  canonicalName, getNewJobIds, isNewJob, getMovedCrew, getConflictsForDay, hasTruck, jobMatchesQuery,
} from './scheduleUtils.js';
import { A, tint, Icon, Capsule, PMBadge, FolderIcon, Group, SectionHeader, SectionFooter, Highlight, TintedButton } from './ui/apple.jsx';

// ── Crew chips ───────────────────────────────────────────────
export function CrewChips({ crew, isForeman, colorOf, multiCounts, hlPerson, togglePerson, movedCrew, q, size = 'md' }) {
  const fs = size === 'lg' ? 14 : 13;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
      {(crew || []).map((n, j) => {
        if (isStopLabel(n)) return <span key={j} style={{ fontSize: 11, fontWeight: 600, color: A.label3, padding: '3px 7px', borderRadius: 6, border: `0.5px solid ${A.sep}` }}>{String(n).replace(/\s+/g, ' ')}</span>;
        if (isDriverTag(n)) return null; // bare "-T" with no name
        const cn = canonicalName(n);      // "Rich-t" -> "Rich"
        const isDrv = hasDriverTag(n);
        const isF = isForeman?.(cn); const fc = isF ? colorOf(cn) : null;
        const mc = multiCounts?.get(cn);
        const isHl = hlPerson === cn;
        const moved = movedCrew?.has(cn);
        const qHit = q && cn.toLowerCase().includes(q.toLowerCase());
        const bg = isHl ? tint(SYS.cyan, 0.3) : isF ? tint(fc, 0.2) : moved ? tint(SYS.green, 0.16) : A.fill4;
        const fg = isF ? fc : moved ? SYS.green : A.label;
        const chip = (
          <span title={[isF && 'Foreman', isDrv && 'Driving', moved && 'Moved from a different job the day before', mc && `On ${mc} jobs in the same time slot`].filter(Boolean).join(' · ') || undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, fontSize: fs,
              background: bg, color: fg, fontWeight: isF ? 600 : moved ? 500 : 400, lineHeight: 1.25,
              boxShadow: mc ? `inset 0 0 0 1px ${tint(SYS.cyan, 0.75)}` : qHit ? `inset 0 0 0 1px ${tint(SYS.yellow, 0.7)}` : 'none',
            }}>
            {moved && <Icon name="arrowRight" size={11} weight={2.6} color={SYS.green} />}
            {cn}
            {isDrv && <Icon name="truck" size={13} weight={2} color={SYS.purple} title="Driving" />}
            {mc && <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: SYS.cyan }}>×{mc}</span>}
          </span>
        );
        if (mc && togglePerson) return (
          <button key={j} type="button" onClick={() => togglePerson(cn)} className="ap-btn ap-press"
            aria-pressed={isHl} title={isHl ? 'Clear highlight' : `On ${mc} jobs in the same slot — highlight them`}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>{chip}</button>
        );
        return <Fragment key={j}>{chip}</Fragment>;
      })}
    </div>
  );
}

// Colored rounded-square icon like a Settings row
function RowIcon({ name, color }) {
  return <span style={{ width: 28, height: 28, borderRadius: 7, background: color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={name} size={17} weight={2.2} /></span>;
}

function IssueRow({ icon, color, title, children, last }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '11px 16px 0' }}>
      <RowIcon name={icon} color={color} />
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 11, borderBottom: last ? 'none' : `0.5px solid ${A.sep}` }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: A.label, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13, color: A.label2, lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

// Calendar-style colored bar at the leading edge of a job
function EditButton({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title="Edit job" className="ap-btn ap-press" style={{
      width: 30, height: 30, borderRadius: '50%', border: 'none', background: A.fill3, color: A.tint, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon name="pencil" size={15} weight={2} />
    </button>
  );
}

function AccentBar({ color, height = 34 }) {
  return <span aria-hidden style={{ width: 4, height, borderRadius: 2, background: color, flexShrink: 0 }} />;
}

function jobMeta(job) {
  const bits = [`#${job.num}`];
  if (job.poJob) bits.push(`PO ${job.poJob}`);
  return bits.join('  ·  ');
}

export default function DayJobs({ dayData, flashedJobs, weeksCache, curSatKey, query, isMobile, onSearchMonth, onEditJob }) {
  const [hlPerson, setHlPerson] = useState(null);
  useEffect(() => { setHlPerson(null); }, [dayData?.day, dayData?.date]);

  if (!dayData?.jobs?.length) return (
    <Group style={{ padding: '48px 20px', textAlign: 'center' }}>
      <div style={{ color: A.label3, display: 'flex', justifyContent: 'center', marginBottom: 10 }}><Icon name="calendar" size={34} weight={1.5} /></div>
      <div style={{ fontSize: 17, fontWeight: 600, color: A.label }}>No jobs scheduled</div>
      <div style={{ fontSize: 14, color: A.label2, marginTop: 4 }}>{onEditJob ? 'Use Add job to put one on the schedule.' : 'Nothing is on the log book for this day.'}</div>
    </Group>
  );

  const jobs = dayData.jobs;
  const q = (query || '').trim();
  const newIds = getNewJobIds(dayData.day, weeksCache, curSatKey);
  const movedCrew = getMovedCrew(dayData.day, weeksCache, curSatKey);
  // Foremen come from today's parsed roster (bold names in the sheet), so renames just work
  const foremanKeys = Object.keys(dayData.crews || {});
  const foremanIdx = new Map(foremanKeys.map((f, i) => [f, i]));
  const isForeman = n => foremanIdx.has(n) || FOREMAN_ORDER.includes(n);
  const colorOf = n => foremanColor(n, foremanIdx.has(n) ? foremanIdx.get(n) : FOREMAN_ORDER.indexOf(n));
  const togglePerson = n => setHlPerson(p => (p === n ? null : n));
  const multiJobs = getConflictsForDay(dayData);
  const multiCounts = new Map(multiJobs.map(c => [c.name, c.count]));

  const visibleJobs = jobs.filter(j => jobMatchesQuery(j, q));
  const activeAll = jobs.filter(j => !j.cancelled);
  const regularJobs = visibleJobs.filter(j => !j.cancelled && !isOvertimeStart(j.onsiteTime));
  const otJobs = visibleJobs.filter(j => !j.cancelled && isOvertimeStart(j.onsiteTime));
  const cancelledJobs = visibleJobs.filter(j => j.cancelled);
  const unassigned = activeAll.filter(j => !j.crew?.length);
  const hcMismatches = activeAll.filter(j => {
    if (j.numMen == null) return false;
    const persons = (j.crew || []).filter(n => !isNonPerson(n));
    return persons.length > 0 && j.numMen !== persons.length;
  });
  const hasIssues = !q && (multiJobs.length > 0 || unassigned.length > 0 || hcMismatches.length > 0);

  const totalMen = activeAll.reduce((s, j) => s + (j.numMen || 0), 0);
  const uniqueCrew = new Set(activeAll.flatMap(j => (j.crew || []).filter(n => !isNonPerson(n)).map(canonicalName))).size;
  const totalTrucks = activeAll.filter(j => hasTruck(j.trucks)).length;
  const foldersNeeded = activeAll.filter(j => (j.jobFolder || '') === 'y').length;
  const foldersDone = activeAll.filter(j => { const v = j.jobFolder || ''; return v === 'sm' || v === 'sm-half'; }).length;
  const allOT = activeAll.filter(j => isOvertimeStart(j.onsiteTime)).length;
  const allCancelled = jobs.length - activeAll.length;

  const sections = [
    { key: 'reg', title: 'Scheduled', jobs: regularJobs },
    { key: 'ot', title: 'Overtime', note: 'Starts before 6 AM or at 2 PM and later', jobs: otJobs },
    { key: 'x', title: 'Cancelled', note: 'Struck through in the log book', jobs: cancelledJobs },
  ].filter(s => s.jobs.length);

  const rowProps = { dayData, flashedJobs, newIds, movedCrew, multiCounts, hlPerson, togglePerson, isForeman, colorOf, q, onEditJob };

  return (
    <div>
      {q && visibleJobs.length === 0 && (
        <Group style={{ padding: '36px 20px', textAlign: 'center' }}>
          <div style={{ color: A.label3, display: 'flex', justifyContent: 'center', marginBottom: 10 }}><Icon name="search" size={30} weight={1.6} /></div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>No results for “{q}”</div>
          <div style={{ fontSize: 14, color: A.label2, marginTop: 4 }}>Nothing on {dayData.day} matches. The job may be on another day.</div>
          {onSearchMonth && <div style={{ marginTop: 14 }}><TintedButton onClick={onSearchMonth}><Icon name="calendar" size={15} weight={2.2} />Search the whole month</TintedButton></div>}
        </Group>
      )}

      {hasIssues && (
        <Group style={{ marginBottom: 24, paddingBottom: 0 }}>
          {multiJobs.length > 0 && (
            <IssueRow icon="twoArrows" color={SYS.teal} last={!unassigned.length && !hcMismatches.length}
              title={`${multiJobs.length} ${multiJobs.length === 1 ? 'person is' : 'people are'} on more than one job`}>
              {multiJobs.map((c, i) => (
                <span key={c.name} style={{ whiteSpace: 'nowrap', display: 'inline-block', marginRight: 14 }}>
                  <button type="button" onClick={() => togglePerson(c.name)} aria-pressed={hlPerson === c.name} className="ap-btn ap-press" style={{
                    background: hlPerson === c.name ? tint(SYS.cyan, 0.25) : 'none', border: 'none', borderRadius: 6, padding: '1px 5px', margin: '0 -5px 0 0',
                    color: SYS.cyan, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{c.name}</button>
                  <span style={{ marginLeft: 8 }}>{c.jobs.map(j => j.customer).join(' & ')}</span>
                </span>
              ))}
              {hlPerson && <button type="button" onClick={() => setHlPerson(null)} className="ap-btn ap-press" style={{ background: 'none', border: 'none', color: A.tint, fontSize: 13, cursor: 'pointer', padding: 0 }}>Clear highlight</button>}
            </IssueRow>
          )}
          {unassigned.length > 0 && (
            <IssueRow icon="person" color={SYS.orange} last={!hcMismatches.length}
              title={`${unassigned.length} ${unassigned.length === 1 ? 'job has' : 'jobs have'} no crew`}>
              {unassigned.map(j => <span key={j.num} style={{ marginRight: 14, whiteSpace: 'nowrap' }}><span className="tnum">#{j.num}</span> {j.customer}</span>)}
            </IssueRow>
          )}
          {hcMismatches.length > 0 && (
            <IssueRow icon="warning" color={SYS.orange} last
              title={`Headcount doesn’t match on ${hcMismatches.length} ${hcMismatches.length === 1 ? 'job' : 'jobs'}`}>
              {hcMismatches.map(j => {
                const persons = (j.crew || []).filter(n => !isNonPerson(n));
                return <span key={j.num} style={{ marginRight: 14, whiteSpace: 'nowrap', display: 'inline-block' }}><span className="tnum">#{j.num}</span> {j.customer} <span className="tnum" style={{ color: A.label3 }}>{j.numMen} listed, {persons.length} named</span></span>;
              })}
            </IssueRow>
          )}
        </Group>
      )}

      {sections.map((sec, si) => (
        <section key={sec.key} style={{ marginBottom: 22 }} aria-label={sec.title}>
          <SectionHeader right={sec.note}>
            <span style={{ color: sec.key === 'ot' ? SYS.yellow : sec.key === 'x' ? SYS.red : A.label }}>{sec.title}</span>
            <span className="tnum" style={{ color: A.label3, fontWeight: 400, marginLeft: 8 }}>{sec.jobs.length}</span>
          </SectionHeader>
          {isMobile
            ? <Group>{sec.jobs.map((job, i) => <JobCell key={`${job.num}-${i}`} job={job} first={i === 0} {...rowProps} />)}</Group>
            : <Group><JobTable jobs={sec.jobs} showHead={si === 0} {...rowProps} /></Group>}
        </section>
      ))}

      {visibleJobs.length > 0 && (
        <SectionFooter style={{ paddingTop: 0 }}>
          <span className="tnum">
            {q && <><b style={{ color: A.label }}>{visibleJobs.length}</b> of {jobs.length} jobs match · </>}
            <b style={{ color: A.label }}>{totalMen}</b> men on <b style={{ color: A.label }}>{activeAll.length}</b> jobs
            {' '}(<b style={{ color: A.label }}>{uniqueCrew}</b> different people)
            {allOT > 0 && <> · <b style={{ color: SYS.yellow }}>{allOT}</b> overtime</>}
            {allCancelled > 0 && <> · <b style={{ color: SYS.red }}>{allCancelled}</b> cancelled</>}
            {' '}· <b style={{ color: A.label }}>{totalTrucks}</b> with a truck
            {foldersNeeded > 0 && <> · <b style={{ color: SYS.orange }}>{foldersNeeded}</b> {foldersNeeded === 1 ? 'folder' : 'folders'} needed</>}
            {foldersDone > 0 && <> · <b style={{ color: SYS.green }}>{foldersDone}</b> done</>}
          </span>
        </SectionFooter>
      )}
    </div>
  );
}

// ── Desktop: macOS-style table inside a rounded group ────────
const TH = { padding: '9px 10px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: A.label2, whiteSpace: 'nowrap', borderBottom: `0.5px solid ${A.sep}` };

function JobTable({ jobs, showHead, ...p }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 960, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 104 }} />
          <col style={{ width: '27%' }} />
          <col style={{ width: 92 }} />
          <col style={{ width: 62 }} />
          <col />
          <col style={{ width: 56 }} />
          <col style={{ width: 104 }} />
        </colgroup>
        {showHead && (
          <thead><tr>
            <th style={{ ...TH, paddingLeft: 16 }}>Onsite</th>
            <th style={TH}>Job</th>
            <th style={TH}>Trucks</th>
            <th style={{ ...TH, textAlign: 'center' }}>Men</th>
            <th style={TH}>Crew</th>
            <th style={{ ...TH, textAlign: 'center' }}>PM</th>
            <th style={{ ...TH, paddingRight: 16 }}>Folder</th>
          </tr></thead>
        )}
        <tbody>{jobs.map((job, i) => <JobRow key={`${job.num}-${i}`} job={job} first={i === 0} {...p} />)}</tbody>
      </table>
    </div>
  );
}

function jobState(job, p) {
  const isCancelled = !!job.cancelled;
  const isOT = !isCancelled && isOvertimeStart(job.onsiteTime);
  const persons = (job.crew || []).filter(n => !isNonPerson(n));
  return {
    isCancelled, isOT, persons,
    noCrew: !isCancelled && !job.crew?.length,
    hcFlag: !isCancelled && job.numMen != null && persons.length > 0 && job.numMen !== persons.length,
    isNew: !isCancelled && isNewJob(job, p.newIds),
    onHl: p.hlPerson ? (job.crew || []).some(c => canonicalName(c).toLowerCase() === p.hlPerson.toLowerCase()) : false,
    flashed: p.flashedJobs?.has(`${p.dayData.day}-${job.num}`),
    accent: isCancelled ? SYS.red : isOT ? SYS.yellow : PM_COLORS[(job.calledIn || '').toUpperCase()] || A.cell3,
  };
}

function JobRow({ job, first, ...p }) {
  const s = jobState(job, p);
  const td = { padding: '11px 10px', verticalAlign: 'top', borderTop: first ? 'none' : `0.5px solid ${A.sep}` };
  return (
    <tr className={`ap-row${s.flashed ? ' job-flash' : ''}`} style={{
      background: s.onHl ? tint(SYS.cyan, 0.1) : 'transparent',
      opacity: s.isCancelled ? 0.6 : p.hlPerson && !s.onHl ? 0.32 : 1, transition: 'opacity .15s',
    }}>
      <td style={{ ...td, paddingLeft: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
          <AccentBar color={s.accent} height={38} />
          <div>
            <div className="tnum" style={{ fontSize: 15, fontWeight: 600, color: !job.onsiteTime ? A.label3 : s.isOT ? SYS.yellow : A.label, whiteSpace: 'nowrap' }}>{job.onsiteTime || 'TBD'}</div>
            {s.isOT && <Capsule color={SYS.yellow} size={10} style={{ marginTop: 4 }}>OT</Capsule>}
          </div>
        </div>
      </td>
      <td style={td}>
        <div style={{ fontSize: 15, fontWeight: 600, color: A.label, textDecoration: s.isCancelled ? 'line-through' : 'none', lineHeight: 1.3 }}>
          <Highlight text={job.customer} q={p.q} />
          {s.isNew && <Capsule color={SYS.green} size={10} title="Job # wasn’t on the day before — may need a new Teams chat" style={{ marginLeft: 7 }}>New</Capsule>}
          {s.isCancelled && <Capsule color={SYS.red} size={10} style={{ marginLeft: 7 }}>Cancelled</Capsule>}
        </div>
        <div style={{ fontSize: 13, color: A.label2, marginTop: 2, lineHeight: 1.35 }}>{job.location ? <Highlight text={job.location} q={p.q} /> : <span style={{ color: A.label3 }}>No location</span>}</div>
        <div className="tnum" style={{ fontSize: 12, color: A.label3, marginTop: 3 }}><Highlight text={jobMeta(job)} q={p.q} /></div>
      </td>
      <td style={{ ...td, fontSize: 13, color: hasTruck(job.trucks) ? A.label2 : A.label3 }}>{hasTruck(job.trucks) ? job.trucks : '–'}</td>
      <td style={{ ...td, textAlign: 'center' }}>
        <div className="tnum" style={{ fontSize: 17, fontWeight: 600, color: s.hcFlag ? SYS.orange : A.label }}>{job.numMen ?? '–'}</div>
        {s.hcFlag && <div className="tnum" style={{ fontSize: 11, color: SYS.orange, marginTop: 1 }}>{s.persons.length} named</div>}
      </td>
      <td style={td}>
        {s.noCrew
          ? <span style={{ fontSize: 13, color: SYS.orange }}>No crew assigned</span>
          : <CrewChips crew={job.crew} {...p} />}
      </td>
      <td style={{ ...td, textAlign: 'center' }}><PMBadge initials={job.calledIn} /></td>
      <td style={{ ...td, paddingRight: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <FolderIcon val={job.jobFolder} />
          {p.onEditJob && <EditButton onClick={() => p.onEditJob(job)} label={`Edit #${job.num} ${job.customer}`} />}
        </div>
      </td>
    </tr>
  );
}

// ── Phone: one list cell per job ─────────────────────────────
function JobCell({ job, first, ...p }) {
  const s = jobState(job, p);
  return (
    <div className={s.flashed ? 'job-flash' : ''} style={{
      display: 'flex', gap: 12, padding: '0 16px', background: s.onHl ? tint(SYS.cyan, 0.1) : 'transparent',
      opacity: s.isCancelled ? 0.6 : p.hlPerson && !s.onHl ? 0.35 : 1, transition: 'opacity .15s',
    }}>
      <div style={{ padding: '14px 0 12px', display: 'flex' }}><AccentBar color={s.accent} height="100%" /></div>
      <div style={{ flex: 1, minWidth: 0, padding: '12px 0', borderTop: first ? 'none' : `0.5px solid ${A.sep}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="tnum" style={{ fontSize: 15, fontWeight: 600, color: !job.onsiteTime ? A.label3 : s.isOT ? SYS.yellow : A.label2 }}>{job.onsiteTime || 'TBD'}</span>
          {s.isOT && <Capsule color={SYS.yellow} size={10}>OT</Capsule>}
          {s.isNew && <Capsule color={SYS.green} size={10}>New</Capsule>}
          {s.isCancelled && <Capsule color={SYS.red} size={10}>Cancelled</Capsule>}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {(job.jobFolder || '') !== '' && (job.jobFolder || '') !== 'n' && <FolderIcon val={job.jobFolder} />}
            <PMBadge initials={job.calledIn} size="sm" />
            {p.onEditJob && <EditButton onClick={() => p.onEditJob(job)} label={`Edit #${job.num} ${job.customer}`} />}
          </span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, marginTop: 3, textDecoration: s.isCancelled ? 'line-through' : 'none' }}><Highlight text={job.customer} q={p.q} /></div>
        {job.location && <div style={{ fontSize: 15, color: A.label2, marginTop: 1 }}><Highlight text={job.location} q={p.q} /></div>}
        <div className="tnum" style={{ fontSize: 13, color: A.label3, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span><Highlight text={jobMeta(job)} q={p.q} /></span>
          {hasTruck(job.trucks) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="truck" size={14} weight={1.9} />{job.trucks}</span>}
          {job.numMen != null && <span style={{ color: s.hcFlag ? SYS.orange : A.label2 }}>{job.numMen} {job.numMen === 1 ? 'man' : 'men'}{s.hcFlag ? ` · ${s.persons.length} named` : ''}</span>}
        </div>
        {s.noCrew
          ? <div style={{ fontSize: 13, color: SYS.orange, marginTop: 8 }}>No crew assigned</div>
          : <div style={{ marginTop: 9 }}><CrewChips crew={job.crew} {...p} size="lg" /></div>}
      </div>
    </div>
  );
}
