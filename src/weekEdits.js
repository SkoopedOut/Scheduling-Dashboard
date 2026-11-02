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

// Who is out on a day (and optionally the same people on other days)
//   out: [{ name, reason: 'out' | 'crossed out' }]
export function setOut(week, dayName, out, alsoDays = []) {
  for (const d of [dayName, ...alsoDays]) if (week[d]) week[d].out = JSON.parse(JSON.stringify(out));
  return week;
}

export function setNotes(week, dayName, notes) {
  if (week[dayName]) week[dayName].notes = notes;
  return week;
}

// ── Roster editor model (global roster) ─────────────────────
export function rosterToModel(roster) {
  const k = () => newId();
  return {
    crews: (roster?.crews || []).map(c => ({ key: k(), foreman: c.foreman, qual: c.qual || '', members: (c.members || []).map(m => ({ key: k(), name: m.name, qual: m.qual || '' })) })),
    pools: Object.fromEntries(['laborers', 'drivers', 'extra'].map(p => [p, (roster?.pools?.[p] || []).map(m => ({ key: k(), name: m.name }))])),
    unassigned: (roster?.unassigned || []).map(m => ({ key: k(), name: m.name })),
  };
}

export function modelToRoster(model) {
  const t = s => String(s || '').trim();
  return {
    crews: model.crews.filter(c => t(c.foreman)).map(c => ({ foreman: t(c.foreman), qual: c.qual || null, members: c.members.filter(m => t(m.name)).map(m => ({ name: t(m.name), qual: m.qual || null })) })),
    pools: Object.fromEntries(['laborers', 'drivers', 'extra'].map(p => [p, (model.pools[p] || []).filter(m => t(m.name)).map(m => ({ name: t(m.name) }))])),
    unassigned: model.unassigned.filter(m => t(m.name)).map(m => ({ name: t(m.name) })),
  };
}

// Everyone on the roster, for the "who's out" list
export function rosterPeople(roster) {
  const out = [];
  for (const c of roster?.crews || []) {
    out.push({ name: c.foreman, group: c.foreman, foreman: true });
    for (const m of c.members || []) out.push({ name: m.name, group: c.foreman });
  }
  const titles = { laborers: 'Laborers', drivers: 'Drivers', extra: 'Extra' };
  for (const p of Object.keys(titles)) for (const m of roster?.pools?.[p] || []) out.push({ name: m.name, group: titles[p] });
  for (const m of roster?.unassigned || []) out.push({ name: m.name, group: 'Unassigned' });
  return out;
}
