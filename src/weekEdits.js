// Pure edits on a week object ({Sunday:{…},…}). Each returns the same
// (mutated) week so a save can be replayed on fresh data after a conflict.
import { newId } from './weekStore.js';
import { DAY_ORDER } from './scheduleUtils.js';

export function nextFreeNum(dayData, exceptId = null) {
  const used = new Set((dayData?.jobs || []).filter(j => j.id !== exceptId).map(j => j.num));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

export function numTakenBy(dayData, num, exceptId = null) {
  return (dayData?.jobs || []).find(j => j.num === num && j.id !== exceptId) || null;
}

function sortJobs(day) { day.jobs.sort((a, b) => (a.num ?? 999) - (b.num ?? 999)); }

function placeJob(day, job) {
  if (!job.num || numTakenBy(day, job.num, job.id)) job.num = nextFreeNum(day, job.id);
  const i = day.jobs.findIndex(j => j.id === job.id);
  if (i >= 0) day.jobs[i] = job; else day.jobs.push(job);
  sortJobs(day);
}

// Save a job on `dayName` (moving it there from `fromDay` if different),
// and copy it onto `alsoDays` as separate jobs.
export function upsertJob(week, dayName, job, { fromDay = null, alsoDays = [] } = {}) {
  const j = { ...job, id: job.id || newId() };
  if (fromDay && fromDay !== dayName && week[fromDay]) {
    week[fromDay].jobs = week[fromDay].jobs.filter(x => x.id !== j.id);
  }
  placeJob(week[dayName], j);
  for (const d of alsoDays) {
    if (d === dayName || !week[d]) continue;
    placeJob(week[d], { ...j, id: newId() });
  }
  return week;
}

export function deleteJob(week, dayName, id) {
  if (week[dayName]) week[dayName].jobs = week[dayName].jobs.filter(j => j.id !== id);
  return week;
}

// applyTo: 'day' | 'rest' (this day through Saturday) | 'week'
export function setRoster(week, dayName, roster, applyTo = 'day') {
  const idx = DAY_ORDER.indexOf(dayName);
  const targets = applyTo === 'week' ? DAY_ORDER : applyTo === 'rest' ? DAY_ORDER.slice(idx) : [dayName];
  for (const d of targets) {
    if (!week[d]) continue;
    const r = JSON.parse(JSON.stringify(roster));
    week[d].crews = r.crews;
    week[d].pools = r.pools;
    week[d].unavailable = r.unavailable;
    week[d].unassigned = r.unassigned;
  }
  return week;
}

export function setNotes(week, dayName, notes) {
  if (week[dayName]) week[dayName].notes = notes;
  return week;
}

// ── Roster editor model ──────────────────────────────────────
// The saved shape keeps out / crossed-out people in `unavailable`; the
// editor shows everyone in place with a status instead.
//   status: 'in' | 'out' (vacation / injured) | 'struck' (crossed out)
export function rosterToEditor(day) {
  const crews = Object.entries(day?.crews || {}).map(([foreman, c]) => ({
    key: newId(), foreman, qual: c.qual || '',
    members: (c.members || []).map(m => ({ key: newId(), name: m.name, qual: m.qual || '', status: 'in' })),
  }));
  const pools = {};
  for (const p of ['laborers', 'drivers', 'extra']) pools[p] = (day?.pools?.[p] || []).map(m => ({ key: newId(), name: m.name, status: 'in' }));
  const unassigned = (day?.unassigned || []).map(m => ({ key: newId(), name: m.name, status: 'in' }));
  for (const u of day?.unavailable || []) {
    const status = u.reason === 'crossed out' ? 'struck' : 'out';
    const crew = u.foreman && crews.find(c => c.foreman === u.foreman);
    const entry = { key: newId(), name: u.name, qual: u.qual || '', status };
    if (crew) crew.members.push(entry);
    else if (u.pool && pools[u.pool]) pools[u.pool].push(entry);
    else unassigned.push(entry);
  }
  return { crews, pools, unassigned };
}

export function editorToRoster(model) {
  const crews = {}, unavailable = [];
  for (const c of model.crews) {
    const f = c.foreman.trim();
    if (!f) continue;
    const members = [];
    for (const m of c.members) {
      const name = m.name.trim();
      if (!name) continue;
      if (m.status === 'in') members.push({ name, qual: m.qual || null });
      else unavailable.push({ name, foreman: f, qual: m.qual || null, reason: m.status === 'struck' ? 'crossed out' : 'listed above crew' });
    }
    crews[f] = { members, qual: c.qual || null };
  }
  const pools = { laborers: [], drivers: [], extra: [] };
  for (const p of Object.keys(pools)) {
    for (const m of model.pools[p] || []) {
      const name = m.name.trim();
      if (!name) continue;
      if (m.status === 'in') pools[p].push({ name });
      else unavailable.push({ name, foreman: null, pool: p, reason: m.status === 'struck' ? 'crossed out' : 'out' });
    }
  }
  const unassigned = [];
  for (const m of model.unassigned) {
    const name = m.name.trim();
    if (!name) continue;
    if (m.status === 'in') unassigned.push({ name });
    else unavailable.push({ name, foreman: null, reason: m.status === 'struck' ? 'crossed out' : 'out' });
  }
  return { crews, pools, unavailable, unassigned };
}
