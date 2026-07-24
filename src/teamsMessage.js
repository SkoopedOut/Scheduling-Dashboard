import { personLabel, profileFor, formatPhone, ROLE_LABEL, cleanJobCrewName } from './profiles.js';

// ============================================================
// Build a schedule message for pasting into Teams.
//
// Teams' compose box accepts plain text and a narrow slice of
// markdown (**bold**, bullets). It does NOT render tables, so
// everything here is line-oriented.
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
  // No am/pm: a bare 1–5 on a job sheet means afternoon.
  if (!ap && h >= 1 && h <= 5) h += 12;
  if (h > 23) return null;
  return h * 60 + min;
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Resolve a job-row crew string to the name a human should read.
function crewDisplay(raw, profiles, { useRealNames }) {
  const cleaned = cleanJobCrewName(raw);
  if (!cleaned) return null;
  if (!useRealNames || !profiles) return cleaned;
  return personLabel(profiles, cleaned);
}

// ── Day message ──────────────────────────────────────────────
export function buildDayMessage(dayData, profiles, opts = {}) {
  const {
    useRealNames = true,
    includePhones = false,
    includeLocation = true,
    includeCrew = true,
    includePO = false,
    markOvertime = true,
    includeUnavailable = true,
    skipCancelled = true,
    heading = '',
  } = opts;

  if (!dayData) return '';
  const lines = [];
  const title = heading || `Schedule — ${fmtDate(dayData.date) || dayData.day}`;
  lines.push(`**${title}**`);

  const jobs = (dayData.jobs || []).filter(j => !(skipCancelled && j.cancelled));
  if (jobs.length === 0) {
    lines.push('', 'No jobs scheduled.');
    return lines.join('\n');
  }

  const totalMen = jobs.reduce((sum, j) => sum + (j.numMen || 0), 0);
  lines.push(`${jobs.length} job${jobs.length === 1 ? '' : 's'}${totalMen ? ` · ${totalMen} men` : ''}`);
  lines.push('');

  for (const job of jobs) {
    const ot = markOvertime && isOvertime(job.onsiteTime);
    const bits = [`**${job.num}. ${job.customer}**`];
    const t = String(job.onsiteTime || '').trim();
    const hasTime = t && !/^(na|n\/a|tbd)$/i.test(t);
    if (hasTime) bits.push(`— ${t}${ot ? ' ⚠️ OT' : ''}`);
    lines.push(bits.join(' '));

    if (includeLocation && job.location) lines.push(`   ${job.location}`);
    if (includePO && job.poJob) lines.push(`   PO ${job.poJob}`);

    if (includeCrew) {
      const crew = (job.crew || [])
        .map(c => crewDisplay(c, profiles, { useRealNames }))
        .filter(Boolean);
      // De-duplicate while preserving order (foreman often repeats).
      const seen = new Set();
      const uniq = crew.filter(n => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      if (uniq.length) lines.push(`   Crew: ${uniq.join(', ')}`);

      if (includePhones && profiles) {
        for (const n of uniq) {
          const p = profileFor(profiles, n);
          if (p?.phone) lines.push(`      ${n} — ${formatPhone(p.phone)}`);
        }
      }
    }

    if (job.trucks && job.trucks.toLowerCase() !== 'na') lines.push(`   Trucks: ${job.trucks}`);
    lines.push('');
  }

  if (includeUnavailable && dayData.unavailable?.length) {
    const out = dayData.unavailable
      .map(u => (useRealNames && profiles ? personLabel(profiles, u.name) : u.name))
      .filter(Boolean);
    if (out.length) lines.push(`**Out:** ${[...new Set(out)].join(', ')}`);
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Week message ─────────────────────────────────────────────
export function buildWeekMessage(weekData, profiles, opts = {}) {
  const { weekLabel = '', ...dayOpts } = opts;
  const parts = [];
  parts.push(`**Weekly Schedule${weekLabel ? ` — ${weekLabel}` : ''}**`, '');

  for (const day of DAY_ORDER) {
    const d = weekData?.[day];
    if (!d) continue;
    const jobs = (d.jobs || []).filter(j => !(dayOpts.skipCancelled !== false && j.cancelled));
    if (!jobs.length) continue;
    parts.push(buildDayMessage(d, profiles, { ...dayOpts, heading: fmtDate(d.date) || day }));
    parts.push('---', '');
  }

  if (parts.length <= 2) return `**Weekly Schedule${weekLabel ? ` — ${weekLabel}` : ''}**\n\nNo jobs scheduled.`;
  while (parts[parts.length - 1] === '' || parts[parts.length - 1] === '---') parts.pop();
  return parts.join('\n').trim();
}

// ── Per-crew message ─────────────────────────────────────────
// One foreman's jobs only — for DMing a crew lead.
export function buildCrewMessage(dayData, foreman, profiles, opts = {}) {
  const { useRealNames = true } = opts;
  if (!dayData) return '';
  const jobs = (dayData.jobs || []).filter(j => {
    if (j.cancelled && opts.skipCancelled !== false) return false;
    return (j.crew || []).some(c => {
      const cleaned = cleanJobCrewName(c);
      return cleaned && cleaned.toLowerCase() === String(foreman).toLowerCase();
    });
  });

  const who = useRealNames && profiles ? personLabel(profiles, foreman) : foreman;
  if (!jobs.length) return `**${who} — ${fmtDate(dayData.date) || dayData.day}**\n\nNo jobs assigned.`;

  return buildDayMessage({ ...dayData, jobs }, profiles, {
    ...opts,
    heading: `${who} — ${fmtDate(dayData.date) || dayData.day}`,
    includeUnavailable: false,
  });
}

// ── Coverage report ──────────────────────────────────────────
// Which people on today's jobs still have no profile / no contact info.
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
  } catch { /* fall through to legacy path */ }
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
