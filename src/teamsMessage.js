import { personLabel, profileFor, formatPhone, ROLE_LABEL, cleanJobCrewName } from './profiles.js';

// ============================================================
// Build a schedule message for pasting into Teams.
//
// Teams' compose box accepts plain text and a narrow slice of
// markdown. It does NOT render tables, so everything is line-based.
//
// Output format (per job):
//   Saturday 7/25
//   Job: BNY Mellon
//   #: 16888
//   Address: 201 Washington St Fl 5 Boston
//   Start Time: 6am
//   Foreman: Phil
//   Drivers:
//   Mike, Weeb and Juan E
//   Trucks:
//       Hub 3, Hub 6, xxx079
// ============================================================

const DAY_ORDER = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// Matches the dashboard's rule: before 6:00 AM or at/after 2:00 PM.
export function isOvertime(onsiteTime) {
  const mins = parseTimeToMinutes(onsiteTime);
  if (mins == null) return false;
  return mins < 6 * 60 || mins >= 14 * 60;
}

export function parseTimeToMinutes(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === 'na' || s === 'n/a') return null;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (isNaN(h)) return null;
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (!ap && h >= 1 && h <= 5) h += 12; // bare 1–5 on a job sheet = afternoon
  if (h > 23) return null;
  return h * 60 + min;
}

// Short header date: "Saturday 7/25"
function shortDate(dateStr, dayName) {
  if (!dateStr) return dayName || '';
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d)) return dayName || '';
  const wd = d.toLocaleDateString('en-US', { weekday: 'long' });
  return `${wd} ${d.getMonth() + 1}/${d.getDate()}`;
}

// "Mike, Weeb and Juan E" — Oxford-less "and" join to match the example.
function humanJoin(names) {
  const a = names.filter(Boolean);
  if (a.length === 0) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}

const label = (raw, profiles, useRealNames) =>
  useRealNames && profiles ? personLabel(profiles, raw) : raw;

// ── Foreman / driver classification ──────────────────────────
// Foreman: the crew-header name(s) assigned to this job.
// Driver: anyone tagged -T/-V on the job row, OR carrying a T/V qual
//         in the week's roster, OR whose saved profile role implies it.
function buildQualIndex(weekData) {
  const drivers = new Set(); // lowercased roster names with a T/V qualification
  for (const d of Object.values(weekData || {})) {
    for (const c of Object.values(d.crews || {})) {
      for (const m of c.members || []) {
        if (m.qual && /[TV]/i.test(m.qual)) drivers.add(m.name.trim().toLowerCase());
      }
    }
  }
  return drivers;
}

// Does the raw job-row token carry an explicit -T / -V driver suffix?
function hasDriverSuffix(raw) {
  return /[-–]\s*[TV]\b/i.test(String(raw || ''));
}

function classifyCrew(job, dayData, weekData, driverIndex, profiles, useRealNames) {
  const headerNames = new Set(Object.keys(dayData?.crews || {}).map(h => h.toLowerCase()));
  const foremen = [];
  const drivers = [];
  const others = [];
  const seen = new Set();

  for (const raw of job.crew || []) {
    const clean = cleanJobCrewName(raw);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const shown = label(clean, profiles, useRealNames);
    const isForeman = headerNames.has(key);
    const prof = profileFor(profiles, clean);
    const isDriver =
      hasDriverSuffix(raw) ||
      driverIndex.has(key) ||
      false;

    if (isForeman) foremen.push(shown);
    else if (isDriver) drivers.push(shown);
    else others.push(shown);
  }
  return { foremen, drivers, others };
}

// AM if the job starts before noon, PM if at/after noon. Blank if no time.
function amPm(onsiteTime) {
  const mins = parseTimeToMinutes(onsiteTime);
  if (mins == null) return '';
  return mins < 12 * 60 ? 'AM' : 'PM';
}

// ── Single job block ─────────────────────────────────────────
function jobBlock(job, dayData, weekData, driverIndex, profiles, opts) {
  const { useRealNames, includeLocation, includePO, markOvertime, includeTrucks, includeStartTime, dayLabel } = opts;
  const lines = [];

  const ap = amPm(job.onsiteTime);
  lines.push(`${dayLabel}${ap ? ` (${ap})` : ''}`);
  lines.push(`Job: ${job.customer}`);
  if (includePO && job.poJob) lines.push(`#: ${job.poJob}`);
  if (includeLocation) {
    const addr = (job.location || '').replace(/[\r\n]+/g, ' ').replace(/\s*,\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
    lines.push(`Address: ${addr}`);
  }

  if (includeStartTime) {
    const t = String(job.onsiteTime || '').trim();
    const hasTime = t && !/^(na|n\/a|tbd)$/i.test(t);
    const ot = markOvertime && hasTime && isOvertime(t);
    lines.push(`Start Time: ${hasTime ? t : 'TBD'}${ot ? ' (OT)' : ''}`);
  }

  const { foremen, drivers, others } = classifyCrew(job, dayData, weekData, driverIndex, profiles, useRealNames);

  // Foreman line always prints, blank when none is assigned.
  lines.push(`Foreman: ${humanJoin(foremen)}`);

  // Drivers: people with a T/V qual (or -T/-V on the job row). Names inline.
  lines.push(`Drivers: ${humanJoin(drivers)}`);

  // Crew: everyone else on the job (non-foreman, non-driver). Names inline.
  if (!opts.driversOnly) {
    lines.push(`Crew: ${humanJoin(others)}`);
  }

  if (includeTrucks) {
    const tr = String(job.trucks || '').trim();
    const hasTrucks = tr && !/^(na|n\/a|0)$/i.test(tr);
    lines.push(`Trucks: ${hasTrucks ? tr.replace(/[\r\n]+/g, ', ') : ''}`);
  }

  // Blank line then a Scope of Work label for the scheduler to fill in.
  lines.push('');
  lines.push('Scope of Work:');

  return lines.join('\n');
}

// ── Day message ──────────────────────────────────────────────
export function buildDayMessage(dayData, profiles, opts = {}, weekData = null) {
  const o = {
    useRealNames: true,
    includeLocation: true,
    includePO: true,
    includeStartTime: true,
    includeTrucks: true,
    markOvertime: true,
    skipCancelled: true,
    driversOnly: false,
    ...opts,
  };
  if (!dayData) return '';

  const driverIndex = buildQualIndex(weekData || { [dayData.day]: dayData });
  const jobs = (dayData.jobs || []).filter(j => !(o.skipCancelled && j.cancelled));
  const dayLabel = o.heading || shortDate(dayData.date, dayData.day);

  if (jobs.length === 0) return `${dayLabel}\n\nNo jobs scheduled.`;

  const blocks = jobs.map(j => jobBlock(j, dayData, weekData, driverIndex, profiles, { ...o, dayLabel }));
  // Each job block carries its own dated header; separate blocks by a blank line.
  return blocks.join('\n\n').replace(/\n{4,}/g, '\n\n\n').trimEnd();
}

// ── Week message ─────────────────────────────────────────────
export function buildWeekMessage(weekData, profiles, opts = {}) {
  const { weekLabel = '', ...dayOpts } = opts;
  const parts = [];
  for (const day of DAY_ORDER) {
    const d = weekData?.[day];
    if (!d) continue;
    const jobs = (d.jobs || []).filter(j => !(dayOpts.skipCancelled !== false && j.cancelled));
    if (!jobs.length) continue;
    parts.push(buildDayMessage(d, profiles, dayOpts, weekData));
  }
  if (parts.length === 0) return `No jobs scheduled${weekLabel ? ` for ${weekLabel}` : ''}.`;
  return parts.join('\n\n────────\n\n').trim();
}

// ── Per-crew message ─────────────────────────────────────────
export function buildCrewMessage(dayData, foreman, profiles, opts = {}, weekData = null) {
  if (!dayData) return '';
  const jobs = (dayData.jobs || []).filter(j => {
    if (j.cancelled && opts.skipCancelled !== false) return false;
    return (j.crew || []).some(c => {
      const cleaned = cleanJobCrewName(c);
      return cleaned && cleaned.toLowerCase() === String(foreman).toLowerCase();
    });
  });
  const header = `${shortDate(dayData.date, dayData.day)} — ${label(foreman, profiles, opts.useRealNames !== false)}`;
  if (!jobs.length) return `${header}\n\nNo jobs assigned.`;
  return buildDayMessage({ ...dayData, jobs }, profiles, { ...opts, heading: header }, weekData);
}

// ── Coverage report ──────────────────────────────────────────
export function missingContactReport(dayData, profiles) {
  const missing = [];
  const seen = new Set();
  for (const job of dayData?.jobs || []) {
    for (const raw of job.crew || []) {
      const name = cleanJobCrewName(raw);
      if (!name) continue;
      const k = name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const p = profileFor(profiles, name);
      if (!p) missing.push({ name, reason: 'no profile' });
      else if (!p.teamsEmail?.trim() && !p.phone?.trim()) missing.push({ name, reason: 'no phone or email' });
    }
  }
  return missing;
}

// ── Clipboard ────────────────────────────────────────────────
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
