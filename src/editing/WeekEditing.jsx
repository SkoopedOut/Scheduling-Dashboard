// ── Editing for site-owned weeks (2027 onward) ───────────────
// Toolbar, week setup, the job editor (with the crew picker that shows
// who's free), the roster editor, and day notes.
import { useState, useMemo, useEffect } from 'react';
import {
  A, tint, Icon, Capsule, Group, SectionHeader, SectionFooter, Sheet, Segmented, TintedButton, PlainButton, FilledButton, GrayButton,
  Switch, TextInput, SelectField, FormRow, Spinner, fieldStyle,
} from '../ui/apple.jsx';
import {
  DAY_ORDER, SYS, PM_COLORS, foremanColor, canonicalName, isNonPerson, isOvertimeStart, hasDriverTag, DRIVER_SUFFIX,
} from '../scheduleUtils.js';
import { nextFreeNum, numTakenBy, rosterToModel, modelToRoster, rosterPeople } from '../weekEdits.js';
import { newId } from '../weekStore.js';

const lc = s => canonicalName(s).toLowerCase();
const short = d => d.slice(0, 3);

// ── Toolbar ──────────────────────────────────────────────────
export function EditBar({ dayName, onAddJob, onEditRoster, onEditOut, onEditNotes, saveState, notes, isMobile, showAddJob = true, outCount = 0 }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {showAddJob && <TintedButton onClick={onAddJob}><Icon name="plus" size={15} weight={2.4} />Add job</TintedButton>}
        <TintedButton onClick={onEditOut} color={SYS.red}><Icon name="person" size={15} weight={2.1} />Who’s out{isMobile ? '' : ` ${dayName}`}{outCount ? ` (${outCount})` : ''}</TintedButton>
        <TintedButton onClick={onEditRoster} color={SYS.indigo}><Icon name="person2" size={15} weight={2.1} />Edit roster</TintedButton>
        <TintedButton onClick={onEditNotes} color={A.gray}><Icon name="doc" size={15} weight={2.1} />{notes ? 'Edit notes' : 'Add notes'}</TintedButton>
        <SaveStatus state={saveState} />
      </div>
      {notes && (
        <div style={{ marginTop: 12, background: A.cell, borderRadius: 12, padding: '10px 14px', fontSize: 14, color: A.label2, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
          <span style={{ color: A.label, fontWeight: 600 }}>Scheduler notes </span>{notes}
        </div>
      )}
    </div>
  );
}

export function SaveStatus({ state }) {
  if (!state) return null;
  const time = state.at ? new Date(state.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  if (state.status === 'rebuilding') return <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: A.label2 }}><Spinner size={13} />Roster saved · updating backup sheets {state.done}/{state.total}…</span>;
  if (state.status === 'rebuilt') return <span role="status" style={{ fontSize: 13, color: state.failed?.length ? SYS.orange : A.label2 }}>Roster saved for every week{state.total ? ` · ${state.total - (state.failed?.length || 0)} backup sheets updated` : ''}{state.failed?.length ? ` · ${state.failed.length} couldn’t be written (${state.failed[0]})` : ''}</span>;
  if (state.status === 'saving') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: A.label2 }}><Spinner size={13} />Saving…</span>;
  if (state.status === 'error') return <span role="alert" style={{ fontSize: 13, color: SYS.red }}>Not saved: {state.message}</span>;
  if (state.backup && !state.backup.ok) return <span role="status" style={{ fontSize: 13, color: SYS.orange }}>Saved {time}. Backup sheet not updated: {state.backup.error}</span>;
  return <span role="status" style={{ fontSize: 13, color: A.label2, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="checkmark" size={13} weight={2.6} color={SYS.green} />Saved {time} · backup sheet updated</span>;
}

// ── Season panel (Month tab): create every week of a year ────
export function SeasonPanel({ year, status, onCreate, onCheck }) {
  useEffect(() => { onCheck?.(); }, [year]);
  const st = status || {};
  const busy = st.state === 'creating';
  const complete = st.total != null && st.existing >= st.total;
  return (
    <div style={{ background: A.cell, borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <Icon name="calendar" size={20} color={SYS.blue} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{year} season</div>
        <div className="tnum" style={{ fontSize: 13, color: A.label2, marginTop: 2 }}>
          {st.state === 'checking' ? 'Checking SharePoint…'
            : busy ? `Creating weeks ${st.done}/${st.todo}…`
            : st.state === 'error' ? <span style={{ color: SYS.red }}>{st.message}</span>
            : st.total != null ? (complete
                ? `All ${st.total} weeks are created, each with a backup log book in SharePoint.`
                : `${st.existing} of ${st.total} weeks saved in SharePoint. Every week can be scheduled now; creating them all writes the backup log books ahead of time.`)
            : 'Every week of the year is open for scheduling.'}
          {st.failed?.length ? <span style={{ color: SYS.orange }}> {st.failed.length} couldn’t be created ({st.failed[0]}).</span> : null}
        </div>
      </div>
      {!complete && st.total != null && (
        <FilledButton onClick={onCreate} disabled={busy}>{busy ? <><Spinner size={14} color="#fff" />Creating…</> : `Create all ${year} weeks`}</FilledButton>
      )}
    </div>
  );
}

// ── Job editor ───────────────────────────────────────────────
const FOLDER_OPTS = [
  { id: '', label: 'None' }, { id: 'y', label: 'Needed' }, { id: 'sm', label: 'Done' }, { id: 'sm-half', label: 'Half' }, { id: 'n', label: 'Not needed' },
];

function blankForm(dayData) {
  return { id: null, num: String(nextFreeNum(dayData)), customer: '', poJob: '', location: '', onsiteTime: '', trucks: '', numMen: '', crew: [], calledIn: '', jobFolder: '', cancelled: false, trash: '', driverReturn: '', notes: '' };
}
function formFromJob(job) {
  const s = v => (v == null ? '' : String(v));
  return { id: job.id, num: s(job.num), customer: s(job.customer), poJob: s(job.poJob), location: s(job.location), onsiteTime: s(job.onsiteTime),
    trucks: s(job.trucks), numMen: s(job.numMen), crew: [...(job.crew || [])], calledIn: s(job.calledIn), jobFolder: s(job.jobFolder),
    cancelled: !!job.cancelled, trash: s(job.trash), driverReturn: s(job.driverReturn), notes: s(job.notes) };
}

export function JobEditorSheet({ open, onClose, week, dayName, job, onSave, onDelete, isMobile, initialTab = 'job' }) {
  const [form, setForm] = useState(() => (job ? formFromJob(job) : blankForm(week?.[dayName])));
  const [targetDay, setTargetDay] = useState(dayName);
  const [alsoDays, setAlsoDays] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState(initialTab);
  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setForm(job ? formFromJob(job) : blankForm(week?.[dayName]));
    setTargetDay(dayName); setAlsoDays([]); setErr(null); setConfirmDelete(false); setBusy(false);
  }, [open, job?.id, dayName, initialTab]);

  const set = patch => setForm(f => ({ ...f, ...patch }));
  const dayData = week?.[targetDay];
  const persons = form.crew.filter(n => !isNonPerson(n)).length;
  const numVal = parseInt(form.num, 10);
  const taken = Number.isFinite(numVal) ? numTakenBy(dayData, numVal, form.id) : null;

  async function save() {
    if (!form.customer.trim()) { setErr('Add a customer or job name.'); return; }
    if (!Number.isFinite(numVal) || numVal < 1) { setErr('Job # must be a number, 1 or higher.'); return; }
    if (taken) { setErr(`#${numVal} on ${targetDay} is already ${taken.customer}. Pick another number.`); return; }
    const t = v => (String(v).trim() || null);
    const out = {
      id: form.id || undefined,
      num: numVal,
      customer: form.customer.trim(),
      poJob: t(form.poJob), location: t(form.location), onsiteTime: t(form.onsiteTime), trucks: t(form.trucks),
      numMen: form.numMen.trim() === '' ? persons : (/^\d+$/.test(form.numMen.trim()) ? parseInt(form.numMen, 10) : form.numMen.trim()),
      crew: form.crew, calledIn: t(form.calledIn), jobFolder: form.jobFolder || null, cancelled: form.cancelled,
      trash: t(form.trash), driverReturn: t(form.driverReturn), notes: form.notes.trim(),
    };
    setBusy(true); setErr(null);
    const ok = await onSave(targetDay, out, { fromDay: job ? dayName : null, alsoDays });
    setBusy(false);
    if (ok) onClose();
  }
  async function remove() {
    setBusy(true);
    const ok = await onDelete(dayName, job.id);
    setBusy(false);
    if (ok) onClose();
  }

  const pmOpts = ['', ...Object.keys(PM_COLORS)];
  if (form.calledIn && !pmOpts.includes(form.calledIn)) pmOpts.push(form.calledIn);
  const dateOf = d => week?.[d]?.date ? new Date(week[d].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '';

  return (
    <Sheet open={open} onClose={onClose} isMobile={isMobile} width={820}
      title={job ? `Edit #${job.num} ${job.customer}` : `New job · ${targetDay}`}
      subtitle={dayData?.date ? new Date(dayData.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : undefined}>
      <Segmented ariaLabel="Job sections" value={tab} onChange={setTab} style={{ marginBottom: 16, maxWidth: 360 }}
        options={[{ id: 'job', label: 'Job & crew' }, { id: 'notes', label: form.notes.trim() ? 'Notes •' : 'Notes' }]} />
      {tab === 'notes' && (
        <div>
          <textarea value={form.notes} onChange={e => set({ notes: e.target.value })} rows={isMobile ? 10 : 14} aria-label="Job notes" autoFocus
            placeholder={'Anything the crew or office should know — site contact and phone, gate or door codes, elevator / loading dock booking, parking, COI, scope details, punch items, what’s left for tomorrow…'}
            className="ap-search ap-focus" style={{ ...fieldStyle, height: 'auto', padding: '12px', lineHeight: 1.5, resize: 'vertical' }} />
          <SectionFooter>Notes show under the job on the schedule and in a Job Notes tab on the backup log book.</SectionFooter>
        </div>
      )}
      <div style={{ display: tab === 'job' ? 'grid' : 'none', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
        <div>
          <SectionHeader>Job</SectionHeader>
          <Group style={{ background: A.cell2 }}>
            <FormRow first label="Job #" hint={taken ? `Taken by ${taken.customer}` : 'Slot number on the log book'}>
              <TextInput value={form.num} onChange={v => set({ num: v.replace(/[^\d]/g, '') })} invalid={!!taken} style={{ width: 80, textAlign: 'center' }} ariaLabel="Job number" />
            </FormRow>
            <FormRow stacked label="Customer / job name"><TextInput value={form.customer} onChange={v => set({ customer: v })} placeholder="Hilton Back Bay" /></FormRow>
            <FormRow stacked label="PO # / job #"><TextInput value={form.poJob} onChange={v => set({ poJob: v })} placeholder="16332" /></FormRow>
            <FormRow stacked label="Location / address"><TextInput value={form.location} onChange={v => set({ location: v })} placeholder="40 Dalton St Boston" /></FormRow>
            <FormRow label="Onsite time" hint={isOvertimeStart(form.onsiteTime) ? 'Overtime start' : undefined}>
              <TextInput value={form.onsiteTime} onChange={v => set({ onsiteTime: v })} placeholder="6:30am" style={{ width: 120 }} ariaLabel="Onsite time" />
            </FormRow>
            <FormRow label="Trucks"><TextInput value={form.trucks} onChange={v => set({ trucks: v })} placeholder="Hub 5 or na" style={{ width: 150 }} ariaLabel="Trucks" /></FormRow>
            <FormRow label="# of men" hint={`Leave blank to use the crew count (${persons})`}>
              <TextInput value={form.numMen} onChange={v => set({ numMen: v })} placeholder={String(persons)} style={{ width: 80, textAlign: 'center' }} ariaLabel="Number of men" />
            </FormRow>
            <FormRow label="Called in by">
              <SelectField value={form.calledIn} onChange={v => set({ calledIn: v })} style={{ width: 110 }} ariaLabel="Called in by">
                {pmOpts.map(p => <option key={p} value={p}>{p || '—'}</option>)}
              </SelectField>
            </FormRow>
            <FormRow stacked label="Job folder">
              <Segmented ariaLabel="Job folder" value={form.jobFolder} onChange={v => set({ jobFolder: v })} options={FOLDER_OPTS} />
            </FormRow>
            <FormRow stacked label="Trash coming back"><TextInput value={form.trash} onChange={v => set({ trash: v })} placeholder="2 carts" /></FormRow>
            <FormRow stacked label="Driver emptying truck & W/H arrival"><TextInput value={form.driverReturn} onChange={v => set({ driverReturn: v })} placeholder="Weeb ~3pm" /></FormRow>
            <FormRow label="Cancelled" hint="Shows struck through"><Switch checked={form.cancelled} onChange={v => set({ cancelled: v })} ariaLabel="Cancelled" /></FormRow>
          </Group>

          <SectionHeader style={{ marginTop: 18 }}>Day</SectionHeader>
          <Group style={{ background: A.cell2, padding: '12px 14px' }}>
            <div style={{ fontSize: 13, color: A.label2, marginBottom: 8 }}>{job ? 'Move this job to' : 'Schedule on'}</div>
            <DayChips value={[targetDay]} onToggle={d => { setTargetDay(d); setAlsoDays(a => a.filter(x => x !== d)); }} dateOf={dateOf} />
            <div style={{ fontSize: 13, color: A.label2, margin: '14px 0 8px' }}>Also copy to</div>
            <DayChips value={alsoDays} disabled={[targetDay]} onToggle={d => setAlsoDays(a => a.includes(d) ? a.filter(x => x !== d) : [...a, d])} dateOf={dateOf} />
            {alsoDays.length > 0 && <div style={{ fontSize: 12, color: A.label3, marginTop: 8 }}>Copies are separate jobs — edit each day on its own after saving.</div>}
          </Group>
        </div>

        <div>
          <CrewPicker dayData={dayData} crew={form.crew} setCrew={crew => set({ crew })} jobId={form.id} onsiteTime={form.onsiteTime} poJob={form.poJob} />
        </div>
      </div>

      {err && <div role="alert" style={{ marginTop: 14, fontSize: 14, color: SYS.red }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18, flexWrap: 'wrap' }}>
        {job && !confirmDelete && <GrayButton onClick={() => setConfirmDelete(true)} color={SYS.red} disabled={busy}><Icon name="trash" size={15} />Delete</GrayButton>}
        {job && confirmDelete && <>
          <span style={{ fontSize: 14, color: A.label2 }}>Delete #{job.num} for good?</span>
          <FilledButton color={SYS.red} onClick={remove} disabled={busy}>Delete job</FilledButton>
          <PlainButton onClick={() => setConfirmDelete(false)}>Keep</PlainButton>
        </>}
        <span style={{ flex: 1 }} />
        <GrayButton onClick={onClose} disabled={busy}>Cancel</GrayButton>
        <FilledButton onClick={save} disabled={busy}>{busy ? <><Spinner size={14} color="#fff" />Saving…</> : job ? 'Save changes' : 'Add job'}</FilledButton>
      </div>
    </Sheet>
  );
}

function DayChips({ value, onToggle, disabled = [], dateOf }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {DAY_ORDER.map(d => {
        const on = value.includes(d);
        const off = disabled.includes(d);
        return (
          <button key={d} type="button" disabled={off} onClick={() => onToggle(d)} aria-pressed={on} className="ap-btn ap-press" style={{
            minWidth: 52, padding: '6px 8px', borderRadius: 9, border: 'none', cursor: off ? 'default' : 'pointer', lineHeight: 1.2,
            background: on ? A.tint : A.fill3, color: on ? '#fff' : off ? A.label3 : A.label, opacity: off ? 0.5 : 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{short(d)}</div>
            <div className="tnum" style={{ fontSize: 11, opacity: 0.75 }}>{dateOf(d)}</div>
          </button>
        );
      })}
    </div>
  );
}

// ── Crew picker: who's free on this day ──────────────────────
function CrewPicker({ dayData, crew, setCrew, jobId, onsiteTime, poJob }) {
  const [filter, setFilter] = useState('');
  const [freeOnly, setFreeOnly] = useState('all');
  const [custom, setCustom] = useState('');
  const slot = isOvertimeStart(onsiteTime) ? 'ot' : 'am';

  // name -> other jobs today that use them
  const usage = useMemo(() => {
    const m = new Map();
    for (const j of dayData?.jobs || []) {
      if (j.cancelled || (jobId && j.id === jobId)) continue;
      const jSlot = isOvertimeStart(j.onsiteTime) ? 'ot' : 'am';
      const samePo = poJob && j.poJob && String(j.poJob).trim() === String(poJob).trim();
      for (const raw of j.crew || []) {
        if (isNonPerson(raw)) continue;
        const k = lc(raw);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push({ num: j.num, customer: j.customer, slot: jSlot, samePo });
      }
    }
    return m;
  }, [dayData, jobId, poJob]);

  const outSet = new Map((dayData?.unavailable || []).map(u => [lc(u.name), u]));
  const chosen = new Set(crew.map(lc));
  const statusOf = name => {
    const k = lc(name);
    if (chosen.has(k)) return 'chosen';
    if (outSet.has(k)) return 'out';
    const uses = usage.get(k) || [];
    if (uses.some(u => u.slot === slot && !u.samePo)) return 'busy';
    if (uses.length) return 'other';
    return 'free';
  };
  const add = name => { if (!chosen.has(lc(name))) setCrew([...crew, name]); };
  const remove = i => setCrew(crew.filter((_, x) => x !== i));
  const toggleDriver = i => setCrew(crew.map((n, x) => x !== i ? n : hasDriverTag(n) ? canonicalName(n) : `${canonicalName(n)}-T`));

  const crews = Object.entries(dayData?.crews || {});
  const groups = [
    ...crews.map(([f, c], i) => ({ key: f, title: f, color: foremanColor(f, i), names: [{ name: f, qual: c.qual, foreman: true }, ...(c.members || [])] })),
    { key: 'laborers', title: 'Laborers', color: A.gray, names: dayData?.pools?.laborers || [] },
    { key: 'drivers', title: 'Drivers', color: SYS.purple, names: dayData?.pools?.drivers || [] },
    { key: 'extra', title: 'Extra', color: A.gray, names: dayData?.pools?.extra || [] },
    { key: 'unassigned', title: 'Unassigned', color: SYS.yellow, names: dayData?.unassigned || [] },
  ].filter(g => g.names.length);

  const allNames = groups.flatMap(g => g.names.map(n => n.name));
  const counts = { free: 0, busy: 0, out: 0 };
  for (const n of new Set(allNames)) { const s = statusOf(n); if (s === 'free' || s === 'other') counts.free++; else if (s === 'busy') counts.busy++; else if (s === 'out') counts.out++; }
  const outList = (dayData?.unavailable || []).filter(u => !allNames.some(n => lc(n) === lc(u.name)));
  const q = filter.trim().toLowerCase();
  const visible = n => (!q || n.toLowerCase().includes(q)) && (freeOnly === 'all' || ['free', 'other', 'chosen'].includes(statusOf(n)));

  return (
    <div>
      <SectionHeader right={`${crew.filter(n => !isNonPerson(n)).length} on this job`}>Crew</SectionHeader>
      <Group style={{ background: A.cell2, padding: '10px 12px' }}>
        {crew.length === 0
          ? <div style={{ fontSize: 14, color: A.label3, padding: '4px 2px' }}>Tap names below to add them.</div>
          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {crew.map((n, i) => (
                <span key={`${n}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: tint(SYS.blue, 0.2), borderRadius: 999, padding: '3px 4px 3px 10px', fontSize: 14 }}>
                  <span style={{ fontWeight: 500 }}>{canonicalName(n) || n}</span>
                  {!isNonPerson(n) && (
                    <button type="button" onClick={() => toggleDriver(i)} aria-pressed={hasDriverTag(n)} title={hasDriverTag(n) ? 'Driving — tap to unset' : 'Mark as driving'} className="ap-btn ap-press"
                      style={{ border: 'none', background: hasDriverTag(n) ? SYS.purple : 'transparent', color: hasDriverTag(n) ? '#fff' : A.label2, borderRadius: 999, padding: '2px 6px', marginLeft: 4, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                      <Icon name="truck" size={13} weight={2} />
                    </button>
                  )}
                  <button type="button" onClick={() => remove(i)} aria-label={`Remove ${n}`} className="ap-btn ap-press"
                    style={{ border: 'none', background: 'transparent', color: A.label2, padding: '2px 5px', cursor: 'pointer', display: 'inline-flex' }}>
                    <Icon name="xmark" size={13} weight={2.4} />
                  </button>
                </span>
              ))}
            </div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <TextInput value={custom} onChange={setCustom} placeholder="Add a name or label (Stop 1, IOI…)" style={{ height: 34, fontSize: 14 }}
            ariaLabel="Add a name not on the roster" />
          <GrayButton onClick={() => { const v = custom.trim(); if (v) { setCrew([...crew, v]); setCustom(''); } }} style={{ padding: '6px 12px', fontSize: 14 }}>Add</GrayButton>
        </div>
      </Group>

      <SectionHeader style={{ marginTop: 18 }} right={<span className="tnum"><span style={{ color: SYS.green }}>{counts.free} free</span> · <span style={{ color: SYS.orange }}>{counts.busy} busy</span> · <span style={{ color: SYS.red }}>{counts.out} out</span></span>}>
        Available {dayData?.day ? `on ${dayData.day}` : ''}
      </SectionHeader>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <TextInput value={filter} onChange={setFilter} placeholder="Find someone" style={{ height: 34, fontSize: 14 }} ariaLabel="Filter roster" />
        <Segmented ariaLabel="Show" value={freeOnly} onChange={setFreeOnly} options={[{ id: 'all', label: 'All' }, { id: 'free', label: 'Free' }]} fullWidth={false} style={{ width: 130, flexShrink: 0 }} />
      </div>
      {groups.length === 0 && <div style={{ fontSize: 14, color: A.label2 }}>No roster for this day yet — use Edit roster to add crews.</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {groups.map(g => {
          const names = g.names.filter(n => visible(n.name));
          if (!names.length) return null;
          const freeNames = g.names.filter(n => ['free', 'other'].includes(statusOf(n.name)));
          return (
            <Group key={g.key} style={{ background: A.cell2, padding: '9px 12px 11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color }} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>{g.title}</span>
                <span className="tnum" style={{ fontSize: 12, color: A.label3 }}>{freeNames.length} free</span>
                {crews.some(([f]) => f === g.key) && freeNames.length > 0 && (
                  <PlainButton onClick={() => setCrew([...crew, ...freeNames.map(n => n.name).filter(n => !chosen.has(lc(n)))])} style={{ marginLeft: 'auto', fontSize: 13, padding: '0 2px' }}>
                    Add {freeNames.length === g.names.length ? 'whole crew' : 'free ones'}
                  </PlainButton>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {names.map(n => <PersonChip key={n.name} name={n.name} qual={n.qual} bold={n.foreman} status={statusOf(n.name)} uses={usage.get(lc(n.name))} out={outSet.get(lc(n.name))} onAdd={() => add(n.name)} />)}
              </div>
            </Group>
          );
        })}
        {outList.length > 0 && !q && freeOnly === 'all' && (
          <Group style={{ background: A.cell2, padding: '9px 12px 11px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: SYS.red }}>Out today</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {outList.map(u => <PersonChip key={u.name} name={u.name} status="out" out={u} onAdd={() => add(u.name)} />)}
            </div>
          </Group>
        )}
      </div>
      <SectionFooter>Busy means already on another job in the same time slot (regular or overtime). Out people can still be added if plans change.</SectionFooter>
    </div>
  );
}

function PersonChip({ name, qual, bold, status, uses, out, onAdd }) {
  const look = {
    chosen: { bg: tint(SYS.blue, 0.22), fg: A.label, border: SYS.blue },
    free: { bg: A.fill3, fg: A.label, border: 'transparent' },
    other: { bg: A.fill3, fg: A.label, border: 'transparent' },
    busy: { bg: tint(SYS.orange, 0.14), fg: A.label, border: 'transparent' },
    out: { bg: 'transparent', fg: A.label3, border: A.sep },
  }[status];
  const tip = status === 'busy' || status === 'other'
    ? (uses || []).map(u => `#${u.num} ${u.customer}${u.slot === 'ot' ? ' (OT)' : ''}`).join(', ')
    : status === 'out' ? (out?.reason === 'crossed out' ? 'Crossed out' : 'Out — vacation / injured') : status === 'chosen' ? 'On this job' : 'Free';
  return (
    <button type="button" onClick={onAdd} disabled={status === 'chosen'} title={tip} className="ap-btn ap-press" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999, cursor: status === 'chosen' ? 'default' : 'pointer',
      background: look.bg, color: look.fg, border: `1px solid ${look.border}`, fontSize: 14, fontWeight: bold ? 600 : 400,
      textDecoration: status === 'out' && out?.reason === 'crossed out' ? 'line-through' : 'none' }}>
      {status === 'chosen' && <Icon name="checkmark" size={12} weight={2.8} color={SYS.blue} />}
      {name}
      {qual && <span style={{ fontSize: 11, color: A.label2, fontWeight: 600 }}>{qual}</span>}
      {(status === 'busy' || status === 'other') && uses?.[0] && (
        <span className="tnum" style={{ fontSize: 11, fontWeight: 600, color: status === 'busy' ? SYS.orange : A.label3 }}>#{uses[0].num}{uses[0].slot === 'ot' ? ' OT' : ''}{uses.length > 1 ? ` +${uses.length - 1}` : ''}</span>
      )}
      {status === 'out' && <span style={{ fontSize: 10, fontWeight: 700, color: SYS.red }}>OUT</span>}
    </button>
  );
}

// ── Roster editor (one roster for every week) ───────────────
const QUALS = ['', 'T', 'V', 'A', 'T/V'];
const POOL_TITLES = { laborers: 'Laborers', drivers: 'Drivers', extra: 'Extra' };

export function RosterEditorSheet({ open, onClose, roster, onSave, isMobile }) {
  const [model, setModel] = useState(() => rosterToModel(roster));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { if (open) { setModel(rosterToModel(roster)); setBusy(false); setErr(null); } }, [open]);

  const update = fn => setModel(m => { const c = JSON.parse(JSON.stringify(m)); fn(c); return c; });
  const listOf = (m, where) => where.kind === 'crew' ? m.crews.find(c => c.key === where.key)?.members : where.kind === 'pool' ? m.pools[where.key] : m.unassigned;
  const targets = [
    ...model.crews.filter(c => c.foreman.trim()).map(c => ({ id: `crew:${c.key}`, label: c.foreman, where: { kind: 'crew', key: c.key } })),
    ...Object.keys(POOL_TITLES).map(p => ({ id: `pool:${p}`, label: POOL_TITLES[p], where: { kind: 'pool', key: p } })),
    { id: 'un', label: 'Unassigned', where: { kind: 'un' } },
  ];
  function move(where, key, targetId) {
    const t = targets.find(x => x.id === targetId);
    if (!t) return;
    update(m => { const src = listOf(m, where); const i = src.findIndex(p => p.key === key); if (i < 0) return; const [p] = src.splice(i, 1); listOf(m, t.where).push(p); });
  }
  async function save() {
    const r = modelToRoster(model);
    const names = [...r.crews.flatMap(c => [c.foreman, ...c.members.map(m => m.name)]), ...Object.values(r.pools).flat().map(m => m.name), ...r.unassigned.map(m => m.name)];
    const seen = new Set(), dup = names.find(n => { const k = n.toLowerCase(); if (seen.has(k)) return true; seen.add(k); return false; });
    if (dup) { setErr(`${dup} is on the roster twice. Each name can only be in one place.`); return; }
    setBusy(true); setErr(null);
    const res = await onSave(r);
    setBusy(false);
    if (res === true) onClose(); else if (typeof res === 'string') setErr(res);
  }

  const section = (title, where, people, color, withQual, header) => (
    <Group key={where.kind + (where.key || '')} style={{ background: A.cell2, padding: '10px 12px', marginBottom: 10 }}>
      {header || <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} /><span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
        <span className="tnum" style={{ fontSize: 12, color: A.label3 }}>{people.length}</span>
      </div>}
      {people.map(p => (
        <div key={p.key} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0' }}>
          <TextInput value={p.name} onChange={v => update(m => { listOf(m, where).find(x => x.key === p.key).name = v; })} ariaLabel="Name" placeholder="Name"
            style={{ height: 32, fontSize: 14, flex: '1 1 auto', minWidth: 0 }} />
          {withQual && <SelectField value={p.qual || ''} onChange={v => update(m => { listOf(m, where).find(x => x.key === p.key).qual = v; })} ariaLabel="Qualification" style={{ width: 68, flexShrink: 0 }}>
            {QUALS.map(q => <option key={q} value={q}>{q || '—'}</option>)}
          </SelectField>}
          <SelectField value="" onChange={v => move(where, p.key, v)} ariaLabel="Move to" style={{ width: isMobile ? 96 : 124, flexShrink: 0 }}>
            <option value="">Move to…</option>
            {targets.filter(t => JSON.stringify(t.where) !== JSON.stringify(where)).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </SelectField>
          <button type="button" onClick={() => update(m => { const l = listOf(m, where); l.splice(l.findIndex(x => x.key === p.key), 1); })} aria-label={`Remove ${p.name}`}
            className="ap-btn ap-press" style={{ border: 'none', background: 'transparent', color: A.label2, cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
            <Icon name="xmark" size={15} weight={2.3} />
          </button>
        </div>
      ))}
      <PlainButton onClick={() => update(m => { listOf(m, where).push({ key: newId(), name: '', qual: '' }); })} style={{ fontSize: 14, paddingLeft: 0, marginTop: 2 }}>
        <Icon name="plus" size={14} weight={2.4} />Add person
      </PlainButton>
    </Group>
  );

  return (
    <Sheet open={open} onClose={onClose} isMobile={isMobile} width={680} title="Roster — every week"
      subtitle="Changes apply to every week on the site. Who’s out is set per day.">
      <SectionHeader right={<PlainButton onClick={() => update(m => { m.crews.push({ key: newId(), foreman: '', qual: '', members: [] }); })} style={{ fontSize: 14 }}><Icon name="plus" size={14} weight={2.4} />Add crew</PlainButton>}>Crews</SectionHeader>
      {model.crews.map((c, i) => section(c.foreman, { kind: 'crew', key: c.key }, c.members, foremanColor(c.foreman, i), true, (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: foremanColor(c.foreman, i), flexShrink: 0 }} />
          <TextInput value={c.foreman} onChange={v => update(m => { m.crews.find(x => x.key === c.key).foreman = v; })} placeholder="Foreman" ariaLabel="Foreman name" style={{ height: 32, fontSize: 15, fontWeight: 600 }} />
          <SelectField value={c.qual || ''} onChange={v => update(m => { m.crews.find(x => x.key === c.key).qual = v; })} ariaLabel="Foreman qualification" style={{ width: 68, flexShrink: 0 }}>
            {QUALS.map(q => <option key={q} value={q}>{q || '—'}</option>)}
          </SelectField>
          <PlainButton color={SYS.red} onClick={() => update(m => { const k = m.crews.findIndex(x => x.key === c.key); const [gone] = m.crews.splice(k, 1); m.unassigned.push(...gone.members); })}
            title="Remove crew — its people move to Unassigned" style={{ fontSize: 13, flexShrink: 0 }}>Remove</PlainButton>
        </div>
      )))}
      <SectionHeader style={{ marginTop: 8 }}>Pools</SectionHeader>
      {Object.keys(POOL_TITLES).map(p => section(POOL_TITLES[p], { kind: 'pool', key: p }, model.pools[p], p === 'drivers' ? SYS.purple : A.gray, false))}
      {section('Unassigned', { kind: 'un' }, model.unassigned, SYS.yellow, false)}
      {err && <div role="alert" style={{ fontSize: 14, color: SYS.red, marginTop: 4 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <GrayButton onClick={onClose} disabled={busy}>Cancel</GrayButton>
        <FilledButton onClick={save} disabled={busy}>{busy ? <><Spinner size={14} color="#fff" />Saving…</> : 'Save for every week'}</FilledButton>
      </div>
    </Sheet>
  );
}

// ── Who's out on a day ───────────────────────────────────────
// Tap a name to cycle: working → out (vacation / injured) → crossed out.
const NEXT = { in: 'out', out: 'crossed out', 'crossed out': 'in' };
export function OutSheet({ open, onClose, roster, week, dayName, onSave, isMobile }) {
  const day = week?.[dayName];
  const init = () => new Map((day?.out || []).map(o => [o.name.toLowerCase(), o]));
  const [out, setOut] = useState(init);
  const [alsoDays, setAlsoDays] = useState([]);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setOut(init()); setAlsoDays([]); setExtra(''); setBusy(false); } }, [open, dayName]);

  const people = rosterPeople(roster);
  const onRoster = new Set(people.map(p => p.name.toLowerCase()));
  const offRoster = [...out.values()].filter(o => !onRoster.has(o.name.toLowerCase()));
  const groups = [];
  for (const p of people) { let g = groups.find(x => x.title === p.group); if (!g) groups.push(g = { title: p.group, people: [] }); g.people.push(p); }
  const statusOf = n => out.get(n.toLowerCase())?.reason || 'in';
  const cycle = n => setOut(m => { const c = new Map(m); const nx = NEXT[statusOf(n)]; if (nx === 'in') c.delete(n.toLowerCase()); else c.set(n.toLowerCase(), { name: n, reason: nx }); return c; });
  const dateOf = d => week?.[d]?.date ? new Date(week[d].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '';
  const counts = { out: [...out.values()].filter(o => o.reason === 'out').length, struck: [...out.values()].filter(o => o.reason === 'crossed out').length };

  const chip = (n, bold) => {
    const st = statusOf(n);
    return (
      <button key={n} type="button" onClick={() => cycle(n)} className="ap-btn ap-press" title={st === 'in' ? 'Working' : st === 'out' ? 'Out — vacation / injured' : 'Crossed out'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: bold ? 600 : 400,
          border: `1px solid ${st === 'in' ? 'transparent' : SYS.red}`, background: st === 'in' ? A.fill3 : tint(SYS.red, 0.16), color: st === 'in' ? A.label : A.label,
          textDecoration: st === 'crossed out' ? 'line-through' : 'none' }}>
        {n}{st === 'out' && <span style={{ fontSize: 10, fontWeight: 700, color: SYS.red }}>OUT</span>}
      </button>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} isMobile={isMobile} width={680} title={`Who’s out ${dayName}`}
      subtitle="Tap a name: working → out (vacation / injured) → crossed out → working">
      <div className="tnum" style={{ fontSize: 13, color: A.label2, marginBottom: 12 }}>{counts.out} out · {counts.struck} crossed out</div>
      {groups.map(g => (
        <Group key={g.title} style={{ background: A.cell2, padding: '9px 12px 11px', marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{g.title}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{g.people.map(p => chip(p.name, p.foreman))}</div>
        </Group>
      ))}
      <Group style={{ background: A.cell2, padding: '9px 12px 11px', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Not on the roster</div>
        {offRoster.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>{offRoster.map(o => chip(o.name))}</div>}
        <div style={{ display: 'flex', gap: 6 }}>
          <TextInput value={extra} onChange={setExtra} placeholder="Name" style={{ height: 34, fontSize: 14 }} ariaLabel="Add someone who is out" />
          <GrayButton onClick={() => { const n = extra.trim(); if (n) { setOut(m => new Map(m).set(n.toLowerCase(), { name: n, reason: 'out' })); setExtra(''); } }} style={{ padding: '6px 12px', fontSize: 14 }}>Mark out</GrayButton>
        </div>
      </Group>
      <SectionHeader style={{ marginTop: 6 }}>Same list on other days this week</SectionHeader>
      <DayChips value={alsoDays} disabled={[dayName]} onToggle={d => setAlsoDays(a => a.includes(d) ? a.filter(x => x !== d) : [...a, d])} dateOf={dateOf} />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
        <GrayButton onClick={onClose} disabled={busy}>Cancel</GrayButton>
        <FilledButton disabled={busy} onClick={async () => { setBusy(true); const ok = await onSave([...out.values()], alsoDays); setBusy(false); if (ok) onClose(); }}>
          {busy ? <><Spinner size={14} color="#fff" />Saving…</> : 'Save'}
        </FilledButton>
      </div>
    </Sheet>
  );
}

// ── Day notes ────────────────────────────────────────────────
export function NotesSheet({ open, onClose, dayName, notes, onSave, isMobile }) {
  const [text, setText] = useState(notes || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setText(notes || ''); setBusy(false); } }, [open, dayName]);
  return (
    <Sheet open={open} onClose={onClose} isMobile={isMobile} title={`${dayName} scheduler notes`} subtitle="Shown above the jobs and on the backup log book">
      <textarea value={text} onChange={e => setText(e.target.value)} rows={7} aria-label="Scheduler notes" className="ap-search ap-focus"
        style={{ ...fieldStyle, height: 'auto', padding: '10px 11px', lineHeight: 1.45, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
        <GrayButton onClick={onClose} disabled={busy}>Cancel</GrayButton>
        <FilledButton disabled={busy} onClick={async () => { setBusy(true); const ok = await onSave(text.trim()); setBusy(false); if (ok) onClose(); }}>
          {busy ? <><Spinner size={14} color="#fff" />Saving…</> : 'Save notes'}
        </FilledButton>
      </div>
    </Sheet>
  );
}
