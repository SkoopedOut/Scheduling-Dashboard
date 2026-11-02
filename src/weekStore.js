// ============================================================
// Site-owned week data (2027 season onward)
//
// From the week ending Saturday Jan 2, 2027, the website is the source
// of truth. Each week is one JSON file in the SchedulingTeam library:
//
//   Documents/Schedule/Site Data/2027/2027-01-09.json
//
// Every save also writes a backup Excel log book that looks like the
// old hand-kept one (day tabs, two-row job blocks, roster on the right
// with bold foremen), so the week can be read without the website:
//
//   Documents/Schedule/Backup Log Books/2027/01 January 27/1-9-2027 Log Book.xlsx
//
// The roster is one global file every week reads, so a roster change
// applies everywhere; each day only stores who is out that day:
//
//   Documents/Schedule/Site Data/roster.json
//
// Weeks ending in 2026 or earlier keep reading the Excel log books.
// ============================================================
import ExcelJS from 'exceljs';
import { getToken, getTokenForScopes } from './auth.js';
import { getWeekFileInfo } from './sharepoint.js';

export const STORE_START_SAT = '2027-01-02';
export const DATA_FOLDER = 'Schedule/Site Data';
export const BACKUP_FOLDER = 'Schedule/Backup Log Books';
export const STORE_VERSION = 1;
const WRITE_SCOPES = ['Files.ReadWrite.All'];
export const ROSTER_PATH = `${DATA_FOLDER}/roster.json`;

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SHAREPOINT_SITE_URL = 'hubofficeinc.sharepoint.com:/sites/SchedulingTeam';
const DRIVE_NAME = 'Documents';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function isStoreWeek(satKey) { return !!satKey && satKey >= STORE_START_SAT; }

export function dataPath(satKey) { return `${DATA_FOLDER}/${satKey.slice(0, 4)}/${satKey}.json`; }

export function backupPath(satKey) {
  const info = getWeekFileInfo(new Date(satKey + 'T12:00:00'));
  const folder = info.folderPath.replace(/^Schedule\//, '');
  return `${BACKUP_FOLDER}/${satKey.slice(0, 4)}/${folder}/${info.fileName}`;
}

// ── Dates ────────────────────────────────────────────────────
export function weekDates(satKey) {
  const sat = new Date(satKey + 'T12:00:00');
  return DAYS.map((_, i) => {
    const d = new Date(sat);
    d.setDate(sat.getDate() - (6 - i));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

// ── Shape helpers ────────────────────────────────────────────
export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function cleanJob(j) {
  return {
    id: j.id || newId(),
    num: Number.isFinite(+j.num) && +j.num > 0 ? +j.num : null,
    customer: j.customer ?? '',
    poJob: j.poJob ?? null,
    location: j.location ?? null,
    onsiteTime: j.onsiteTime ?? null,
    trucks: j.trucks ?? null,
    numMen: j.numMen ?? null,
    crew: Array.isArray(j.crew) ? j.crew.filter(Boolean) : [],
    calledIn: j.calledIn ?? null,
    jobFolder: j.jobFolder ?? null,
    cancelled: !!j.cancelled,
    trash: j.trash ?? null,
    driverReturn: j.driverReturn ?? null,
    notes: j.notes ?? '',
  };
}

export function emptyRoster() {
  return { crews: [], pools: { laborers: [], drivers: [], extra: [] }, unassigned: [] };
}

const norm = s => String(s || '').trim().toLowerCase();

// What each day stores: its jobs, who's out that day, and notes. The
// roster itself is one global file (roster.json) shared by every week.
function dayRecord(d = {}) {
  const out = Array.isArray(d.out) ? d.out
    : (d.unavailable || []).map(u => ({ name: u.name, reason: u.reason === 'crossed out' ? 'crossed out' : 'out' }));
  return {
    jobs: (d.jobs || []).map(cleanJob).sort((a, b) => (a.num ?? 999) - (b.num ?? 999)),
    out: out.filter(o => o && String(o.name || '').trim()).map(o => ({ name: String(o.name).trim(), reason: o.reason === 'crossed out' ? 'crossed out' : 'out' })),
    notes: d.notes || '',
  };
}

// Global roster + one day's record -> the parser-shaped day the rest of
// the app uses (crews minus anyone out, unavailable list, pools…).
export function composeDay(roster, day, date, d = {}) {
  const rec = dayRecord(d);
  const outBy = new Map(rec.out.map(o => [norm(o.name), o]));
  const used = new Set();
  const unavailable = [];
  const take = (name, extra, outReason) => {
    const o = outBy.get(norm(name));
    if (!o) return false;
    used.add(norm(name));
    unavailable.push({ name, ...extra, reason: o.reason === 'crossed out' ? 'crossed out' : outReason });
    return true;
  };
  const crews = {};
  for (const c of roster?.crews || []) {
    const f = String(c.foreman || '').trim();
    if (!f) continue;
    take(f, { foreman: f, qual: c.qual || null }, 'listed above crew');
    const members = [];
    for (const m of c.members || []) {
      if (!take(m.name, { foreman: f, qual: m.qual || null }, 'listed above crew')) members.push({ name: m.name, qual: m.qual || null });
    }
    crews[f] = { members, qual: c.qual || null };
  }
  const pools = { laborers: [], drivers: [], extra: [] };
  for (const p of Object.keys(pools)) {
    for (const m of roster?.pools?.[p] || []) if (!take(m.name, { foreman: null, pool: p }, 'out')) pools[p].push({ name: m.name });
  }
  const unassigned = [];
  for (const m of roster?.unassigned || []) if (!take(m.name, { foreman: null }, 'out')) unassigned.push({ name: m.name });
  for (const o of rec.out) if (!used.has(norm(o.name))) unavailable.push({ name: o.name, foreman: null, reason: o.reason === 'crossed out' ? 'crossed out' : 'out' });
  return { day, date, ...rec, crews, pools, unavailable, unassigned };
}

export function composeWeek(satKey, roster, days = {}) {
  const dates = weekDates(satKey);
  const out = {};
  DAYS.forEach((d, i) => { out[d] = composeDay(roster, d, dates[i], days[d]); });
  return out;
}

export function emptyDay(day, date) { return composeDay(emptyRoster(), day, date, {}); }

export function cloneWeek(week) {
  const out = {};
  for (const d of DAYS) if (week[d]) out[d] = JSON.parse(JSON.stringify(week[d]));
  return out;
}

// Turn a parsed (Excel) day into a global roster. People out that day go
// back onto their crew or pool — being out is per day, not a roster change.
export function rosterFromDay(day) {
  const roster = emptyRoster();
  if (!day) return roster;
  const crewMap = new Map();
  for (const [foreman, c] of Object.entries(day.crews || {})) {
    const entry = { foreman, qual: c.qual || null, members: (c.members || []).map(m => ({ name: m.name, qual: m.qual || null })) };
    roster.crews.push(entry);
    crewMap.set(foreman, entry);
  }
  for (const p of Object.keys(roster.pools)) roster.pools[p] = (day.pools?.[p] || []).map(m => ({ name: m.name }));
  roster.unassigned = (day.unassigned || []).map(m => ({ name: m.name }));
  for (const u of day.unavailable || []) {
    if (u.foreman && crewMap.has(u.foreman)) { if (norm(u.name) !== norm(u.foreman)) crewMap.get(u.foreman).members.push({ name: u.name, qual: u.qual || null }); }
    else if (u.pool && roster.pools[u.pool]) roster.pools[u.pool].push({ name: u.name });
    else roster.pools.extra.push({ name: u.name });
  }
  return roster;
}

// Latest day in a parsed week that has a roster
export function rosterFromWeek(week) {
  for (const d of [...DAYS].reverse()) {
    if (week?.[d] && Object.keys(week[d].crews || {}).length) return rosterFromDay(week[d]);
  }
  return null;
}

function cleanRoster(r) {
  const out = emptyRoster();
  for (const c of r?.crews || []) {
    const foreman = String(c.foreman || '').trim();
    if (!foreman) continue;
    out.crews.push({ foreman, qual: c.qual || null, members: (c.members || []).filter(m => String(m.name || '').trim()).map(m => ({ name: String(m.name).trim(), qual: m.qual || null })) });
  }
  for (const p of Object.keys(out.pools)) out.pools[p] = (r?.pools?.[p] || []).filter(m => String(m.name || '').trim()).map(m => ({ name: String(m.name).trim() }));
  out.unassigned = (r?.unassigned || []).filter(m => String(m.name || '').trim()).map(m => ({ name: String(m.name).trim() }));
  return out;
}

// ── Graph plumbing ───────────────────────────────────────────
let _driveId = null;
function encodePath(p) { return encodeURIComponent(p).replace(/%2F/g, '/'); }
const noCache = { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' };

async function resolveDrive(token) {
  if (_driveId) return _driveId;
  const cb = `_cb=${Date.now()}`;
  const site = await fetch(`${GRAPH_BASE}/sites/${SHAREPOINT_SITE_URL}?${cb}`, { headers: { Authorization: `Bearer ${token}`, ...noCache } });
  if (!site.ok) throw new Error(`Couldn't reach the SharePoint site (${site.status}).`);
  const siteId = (await site.json()).id;
  const res = await fetch(`${GRAPH_BASE}/sites/${siteId}/drives?${cb}`, { headers: { Authorization: `Bearer ${token}`, ...noCache } });
  if (!res.ok) throw new Error(`Couldn't list document libraries (${res.status}).`);
  const drive = ((await res.json()).value || []).find(d => d.name === DRIVE_NAME);
  if (!drive) throw new Error(`Library "${DRIVE_NAME}" not found.`);
  _driveId = drive.id;
  return _driveId;
}

// Display name of the signed-in person, read from the access token
function nameFromToken(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(decodeURIComponent(escape(atob(part.padEnd(part.length + (4 - part.length % 4) % 4, '=')))));
    return claims.name || claims.upn || claims.unique_name || '';
  } catch { return ''; }
}

async function writeToken() {
  try { return await getTokenForScopes(WRITE_SCOPES); }
  catch (e) { throw new Error(`Couldn't get permission to save (${e.message || e}). IT needs to grant Files.ReadWrite.All — see SITE-DATA-SETUP.md.`); }
}

async function readJson(path) {
  const token = await getToken();
  if (!token) throw new Error('Not signed in.');
  const driveId = await resolveDrive(token);
  const cb = `_cb=${Date.now()}`;
  const metaRes = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(path)}?select=id,name,eTag,lastModifiedDateTime,lastModifiedBy&${cb}`,
    { headers: { Authorization: `Bearer ${token}`, ...noCache } });
  if (metaRes.status === 404) return null;
  if (!metaRes.ok) throw new Error(`Couldn't read ${path.split('/').pop()} (${metaRes.status}).`);
  const meta = await metaRes.json();
  const body = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${meta.id}/content?${cb}`,
    { headers: { Authorization: `Bearer ${token}`, ...noCache, 'If-None-Match': '' } });
  if (!body.ok) throw new Error(`Couldn't download ${meta.name} (${body.status}).`);
  try { return { meta, data: JSON.parse(await body.text()) }; }
  catch { throw new Error(`${meta.name} isn't valid JSON. Restore an earlier version from SharePoint version history.`); }
}

// PUT a file. exists+eTag -> If-Match; !exists -> fail if someone created it first.
async function putFile(token, driveId, path, body, contentType, { eTag = null, exists = false, guard = true } = {}) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': contentType, ...noCache };
  let q = '';
  if (guard && exists && eTag) headers['If-Match'] = eTag;
  else if (guard && !exists) q = '?@microsoft.graph.conflictBehavior=fail';
  const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(path)}:/content${q}`, { method: 'PUT', headers, body });
  if (res.status === 412 || res.status === 409) { const e = new Error('Someone else saved this a moment ago.'); e.conflict = true; throw e; }
  if (res.status === 423) throw new Error('the file is open in Excel — close it and save again');
  if (res.status === 403) throw new Error('SharePoint refused the save (403). You need Edit rights on the Schedule folder.');
  if (!res.ok) throw new Error(`save failed (${res.status})`);
  return res.json();
}

// ── Global roster ────────────────────────────────────────────
export async function loadRoster() {
  const r = await readJson(ROSTER_PATH);
  if (!r) return { roster: null, eTag: null, exists: false };
  return { roster: cleanRoster(r.data), eTag: r.meta.eTag || null, exists: true, savedBy: r.data.savedBy || '', savedAt: r.data.savedAt || null };
}

export async function saveRoster(roster, { eTag = null, exists = false } = {}) {
  const token = await writeToken();
  const driveId = await resolveDrive(token);
  const clean = cleanRoster(roster);
  const payload = { version: STORE_VERSION, savedAt: new Date().toISOString(), savedBy: nameFromToken(token), ...clean };
  const saved = await putFile(token, driveId, ROSTER_PATH, JSON.stringify(payload, null, 2), 'application/json', { eTag, exists });
  return { roster: clean, eTag: saved.eTag || null, exists: true, savedBy: payload.savedBy, savedAt: payload.savedAt };
}

// ── Weeks ────────────────────────────────────────────────────
// Returns the week in parser shape plus _meta. A week with no file yet
// comes back empty (dates + roster) with exists:false — the first save
// creates it.
export async function loadStoreWeek(satKey, roster) {
  const path = dataPath(satKey);
  const r = await readJson(path);
  if (!r) {
    const week = composeWeek(satKey, roster);
    week._meta = { source: 'site', exists: false, path, satKey, fileName: 'Site data · not saved yet' };
    return week;
  }
  const week = composeWeek(satKey, roster, r.data.days || {});
  week._meta = {
    source: 'site', exists: true, path, satKey,
    eTag: r.meta.eTag || null,
    fileName: `Site data · ${r.meta.name}`,
    lastModified: r.meta.lastModifiedDateTime,
    savedBy: r.data.savedBy || r.meta.lastModifiedBy?.user?.displayName || '',
  };
  return week;
}

function weekPayload(satKey, week, savedAt, savedBy) {
  const days = {};
  for (const d of DAYS) days[d] = { date: weekDates(satKey)[DAYS.indexOf(d)], ...dayRecord(week?.[d]) };
  return { version: STORE_VERSION, weekEnding: satKey, savedAt, savedBy, backup: backupPath(satKey), days };
}

async function writeBackup(token, driveId, satKey, composed, savedAt, savedBy) {
  const bPath = backupPath(satKey);
  try {
    const buf = await buildBackupWorkbook(satKey, composed, { savedAt, savedBy });
    await putFile(token, driveId, bPath, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { guard: false });
    return { ok: true, path: bPath };
  } catch (e) {
    return { ok: false, path: bPath, error: e.message || String(e) };
  }
}

// Writes the week's JSON (guarded against overwriting someone else's
// save), then its backup log book. A failed backup does not undo the save.
export async function saveStoreWeek(satKey, week, { eTag = null, exists = false, savedBy = '', roster } = {}) {
  const token = await writeToken();
  const driveId = await resolveDrive(token);
  if (!savedBy) savedBy = nameFromToken(token);
  const savedAt = new Date().toISOString();
  const payload = weekPayload(satKey, week, savedAt, savedBy);
  const saved = await putFile(token, driveId, dataPath(satKey), JSON.stringify(payload, null, 2), 'application/json', { eTag, exists });
  const composed = composeWeek(satKey, roster, payload.days);
  const backup = await writeBackup(token, driveId, satKey, composed, savedAt, savedBy);
  composed._meta = {
    source: 'site', exists: true, path: dataPath(satKey), satKey,
    eTag: saved.eTag || null, fileName: `Site data · ${saved.name || satKey + '.json'}`,
    lastModified: saved.lastModifiedDateTime || savedAt, savedBy,
  };
  return { week: composed, backup };
}

// ── Season (all weeks of a year) ─────────────────────────────
// Saturdays of every week that has a day in `year`: from the first
// Saturday on/after Jan 1 through the first Saturday on/after Dec 31.
export function seasonSaturdays(year) {
  const first = new Date(year, 0, 1, 12);
  first.setDate(first.getDate() + ((6 - first.getDay() + 7) % 7));
  const last = new Date(year, 11, 31, 12);
  last.setDate(last.getDate() + ((6 - last.getDay() + 7) % 7));
  const out = [];
  for (const d = new Date(first); d <= last; d.setDate(d.getDate() + 7)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out.filter(isStoreWeek);
}

// satKeys of week files that already exist in Site Data
export async function listStoreWeeks(years) {
  const token = await getToken();
  if (!token) throw new Error('Not signed in.');
  const driveId = await resolveDrive(token);
  const found = new Set();
  for (const y of years) {
    const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(`${DATA_FOLDER}/${y}`)}:/children?$select=name&$top=500&_cb=${Date.now()}`,
      { headers: { Authorization: `Bearer ${token}`, ...noCache } });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`Couldn't list ${DATA_FOLDER}/${y} (${res.status}).`);
    for (const f of (await res.json()).value || []) {
      const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f.name);
      if (m) found.add(m[1]);
    }
  }
  return found;
}

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

// Create every missing week of a season (JSON + backup log book).
// Weeks that already exist are left alone.
export async function createSeason(year, roster, { onProgress = () => {} } = {}) {
  const sats = seasonSaturdays(year);
  const existing = await listStoreWeeks([...new Set(sats.map(s => s.slice(0, 4)))]);
  const todo = sats.filter(s => !existing.has(s));
  let done = 0, failed = [];
  onProgress({ done, total: todo.length });
  await inBatches(todo, 3, async sat => {
    try { await saveStoreWeek(sat, composeWeek(sat, roster), { exists: false, roster }); }
    catch (e) { if (!e.conflict) failed.push(`${sat}: ${e.message}`); }
    onProgress({ done: ++done, total: todo.length });
  });
  return { created: todo.length - failed.length, skipped: existing.size, failed };
}

// After a roster change: rewrite the backup log books of existing weeks
// (from `fromSat` on) so they show the new roster. Week data is untouched.
export async function rebuildBackups(fromSat, roster, { onProgress = () => {} } = {}) {
  const token = await writeToken();
  const driveId = await resolveDrive(token);
  const years = [fromSat.slice(0, 4), String(+fromSat.slice(0, 4) + 1)];
  const sats = [...await listStoreWeeks(years)].filter(s => s >= fromSat).sort();
  let done = 0; const failed = [];
  onProgress({ done, total: sats.length });
  await inBatches(sats, 3, async sat => {
    try {
      const r = await readJson(dataPath(sat));
      const composed = composeWeek(sat, roster, r?.data?.days || {});
      const b = await writeBackup(token, driveId, sat, composed, r?.data?.savedAt || new Date().toISOString(), r?.data?.savedBy || '');
      if (!b.ok) failed.push(`${sat}: ${b.error}`);
    } catch (e) { failed.push(`${sat}: ${e.message}`); }
    onProgress({ done: ++done, total: sats.length });
  });
  return { total: sats.length, failed };
}

// ============================================================
// Backup Excel log book
// Mirrors the hand-kept layout closely enough that the existing Excel
// parser reads it back the same way (verified in tests):
//   Row 1  title · Row 2 day + date (K2) · Row 4 column headers
//   Jobs   two-row blocks from row 6 (A num, B customer, C PO, D location,
//          E onsite, F trucks, G men, H–L crew, M called in,
//          N folder — y on the job row, SM / SM Half on the row below,
//          O trash, P driver / W-H arrival). Struck through = cancelled.
//   Roster S/U/W/Y name columns with T/V/X/Z qual. Bold = foreman or
//          pool header. Names directly above a foreman = out that day;
//          struck names = crossed out. Loose names in Q = unassigned.
// ============================================================
const BLUE = 'FF0070C0';
const thin = { style: 'thin', color: { argb: 'FF808080' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const NAME_COLS = [19, 21, 23, 25]; // S U W Y
const JOB_SLOTS = 15;
const MAX_CREW_PER_ROW = 5;

function folderCells(v) {
  if (v === 'y') return ['y', null];
  if (v === 'n') return ['n', null];
  if (v === 'sm') return ['y', 'SM'];
  if (v === 'sm-half') return ['y', 'SM Half'];
  return [null, null];
}

export async function buildBackupWorkbook(satKey, week, { savedAt = new Date().toISOString(), savedBy = '' } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Daily Jobs site';
  wb.created = new Date(savedAt);
  for (const dayName of DAYS) writeDaySheet(wb.addWorksheet(dayName), week[dayName] || emptyDay(dayName, null));

  // Job notes, one row per job that has any
  const notesRows = [];
  for (const dayName of DAYS) for (const j of week[dayName]?.jobs || []) if (j.notes) notesRows.push([dayName, week[dayName].date, j.num, j.customer, j.notes]);
  const ns = wb.addWorksheet('Job Notes');
  ns.columns = [{ header: 'Day', width: 12 }, { header: 'Date', width: 12 }, { header: '#', width: 5 }, { header: 'Customer / job', width: 30 }, { header: 'Notes', width: 90 }];
  ns.getRow(1).font = { name: 'Calibri', size: 11, bold: true };
  if (notesRows.length) notesRows.forEach(r => { const row = ns.addRow(r); row.alignment = { wrapText: true, vertical: 'top' }; });
  else ns.addRow(['', '', '', 'No job notes this week', '']);

  const about = wb.addWorksheet('About this file');
  about.getColumn(1).width = 100;
  [
    ['Backup copy of the Daily Jobs schedule', { bold: true, size: 14 }],
    [`Week ending ${new Date(satKey + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, {}],
    [`Written by the website on ${new Date(savedAt).toLocaleString('en-US')}${savedBy ? ` by ${savedBy}` : ''}.`, {}],
    ['The website is the source of truth. Changes made in this file are overwritten on the next save — make edits on the website.', {}],
    [`Website data file: Documents/${dataPath(satKey)}`, { color: { argb: 'FF666666' } }],
  ].forEach(([t, f], i) => { const c = about.getCell(i + 1, 1); c.value = t; c.font = { name: 'Calibri', size: 11, ...f }; });
  return wb.xlsx.writeBuffer();
}

function writeDaySheet(ws, d) {
  const widths = { A: 4.5, B: 24, C: 15.8, D: 26, E: 9, F: 9, G: 7, H: 10, I: 10, J: 10, K: 10, L: 10, M: 10, N: 9, O: 12, P: 16, Q: 10, R: 3, S: 11, T: 4, U: 11, V: 4, W: 11, X: 9, Y: 11, Z: 4 };
  for (const [k, w] of Object.entries(widths)) ws.getColumn(k).width = w;
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
  const base = { name: 'Calibri', size: 11 };
  const set = (ref, value, font = {}, extra = {}) => {
    const c = ws.getCell(ref);
    c.value = value;
    c.font = { ...base, ...font };
    Object.assign(c, extra);
    return c;
  };

  // Header
  ws.getRow(1).height = 24;
  set('E1', 'DAILY JOBS SCHEDULE', { bold: true, size: 20 });
  ws.getRow(2).height = 32;
  set('E2', 'DAY:', { bold: true });
  set('H2', d.day, { bold: true });
  set('I2', 'DATE:', { bold: true });
  if (d.date) {
    const [y, m, dd] = d.date.split('-').map(Number);
    set('K2', new Date(Date.UTC(y, m - 1, dd)), { bold: true }, { numFmt: 'm/d/yyyy', alignment: { horizontal: 'center' } });
  }
  ws.getRow(3).height = 6;
  ws.getRow(4).height = 48;
  const heads = { A: '#', B: 'CUSTOMER / JOB NAME', C: 'CUST. PO# / JOB#', D: 'JOB LOCATION / ADDRESS', E: 'ONSITE TIME', F: 'Trucks', G: '# OF MEN', H: 'CREW', M: 'Called in & Guys know', N: 'Job folder', O: 'How much trash is coming back', P: 'Truck driver emptying truck & est. W/H arrival time' };
  for (const [col, t] of Object.entries(heads)) {
    set(`${col}4`, t, { bold: true, size: 10 }, { alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: { bottom: { style: 'double' } } });
  }
  ws.mergeCells('H4:L4');
  ws.getRow(5).height = 6;

  // Jobs — slots keep their numbers; empty slots stay as blank numbered rows
  const byNum = new Map();
  const extra = [];
  for (const j of d.jobs || []) { if (j.num && !byNum.has(j.num)) byNum.set(j.num, j); else extra.push(j); }
  let maxNum = Math.max(JOB_SLOTS, ...byNum.keys(), 0);
  for (const j of extra) byNum.set(++maxNum, { ...j, num: maxNum });
  // The parser ends the last job after two rows, so a big last crew gets a
  // trailing empty slot to close its block.
  if ((byNum.get(maxNum)?.crew || []).length > MAX_CREW_PER_ROW * 2) maxNum++;
  let row = 6;
  for (let n = 1; n <= maxNum; n++) {
    const j = byNum.get(n);
    const crew = j?.crew || [];
    const height = Math.max(2, Math.ceil(crew.length / MAX_CREW_PER_ROW));
    const end = row + height - 1;
    for (let r = row; r <= end; r++) ws.getRow(r).height = 23.15;
    const strike = !!j?.cancelled;
    const c = set(`A${row}`, n, { bold: true, color: { argb: 'FFFFFFFF' } }, { alignment: { horizontal: 'center', vertical: 'middle' } });
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    if (j) {
      const po = j.poJob && /^\d+$/.test(String(j.poJob)) ? Number(j.poJob) : j.poJob;
      const men = j.numMen != null && /^\d+$/.test(String(j.numMen)) ? Number(j.numMen) : j.numMen;
      const wrapMid = { alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } };
      set(`B${row}`, j.customer || null, { bold: true, size: 10, strike }, wrapMid);
      if (j.notes) ws.getCell(`B${row}`).note = { texts: [{ text: String(j.notes) }] };
      set(`C${row}`, po ?? null, { strike }, wrapMid);
      set(`D${row}`, j.location || null, { bold: true, size: 10, strike }, wrapMid);
      set(`E${row}`, j.onsiteTime || null, { strike }, wrapMid);
      set(`F${row}`, j.trucks || null, { strike }, wrapMid);
      set(`G${row}`, men ?? null, { strike }, wrapMid);
      crew.forEach((name, i) => {
        const r = row + Math.floor(i / MAX_CREW_PER_ROW);
        const col = 8 + (i % MAX_CREW_PER_ROW); // H..L
        const cell = ws.getCell(r, col);
        cell.value = name;
        cell.font = { ...base, strike };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      if (j.calledIn) set(`M${row}`, j.calledIn, {}, { alignment: { horizontal: 'center', vertical: 'middle' } });
      const [top, below] = folderCells(j.jobFolder);
      if (top) set(`N${row}`, top, {}, { alignment: { horizontal: 'center' } });
      if (below) set(`N${row + 1}`, below, { bold: true }, { alignment: { horizontal: 'center' } });
      if (j.trash) set(`O${row}`, j.trash, {}, wrapMid);
      if (j.driverReturn) set(`P${row}`, j.driverReturn, {}, wrapMid);
    }
    for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'O', 'P']) {
      if (end > row) ws.mergeCells(`${col}${row}:${col}${end}`);
      ws.getCell(`${col}${row}`).border = border;
    }
    for (let r = row; r <= end; r++) for (let col = 8; col <= 14; col++) ws.getCell(r, col).border = border;
    row = end + 1;
  }

  // Scheduler notes
  row += 1;
  set(`A${row}`, 'SCHEDULER NOTES:', { bold: true, size: 12 });
  ws.mergeCells(`A${row}:D${row}`);
  if (d.notes) {
    const lines = String(d.notes).split('\n').length;
    set(`A${row + 1}`, d.notes, {}, { alignment: { wrapText: true, vertical: 'top' } });
    ws.mergeCells(`A${row + 1}:N${row + 1}`);
    ws.getRow(row + 1).height = Math.max(30, 15 * lines);
  }

  writeRoster(ws, d, base);
}

function writeRoster(ws, d, base) {
  const put = (col, r, text, font = {}) => {
    if (text == null || text === '') return;
    const c = ws.getCell(r, col);
    c.value = text;
    c.font = { ...base, ...font };
  };
  const crews = Object.entries(d.crews || {});
  const outAbove = {}, crossed = {};
  const poolStruck = [];
  for (const u of d.unavailable || []) {
    if (u.foreman && d.crews?.[u.foreman]) {
      if (u.reason === 'crossed out') (crossed[u.foreman] = crossed[u.foreman] || []).push(u);
      else (outAbove[u.foreman] = outAbove[u.foreman] || []).push(u);
    } else poolStruck.push(u);
  }

  // Foreman bands of four (S, U, W, Y)
  let cursor = 5;
  for (let b = 0; b < crews.length; b += NAME_COLS.length) {
    const band = crews.slice(b, b + NAME_COLS.length);
    const above = Math.max(0, ...band.map(([f]) => (outAbove[f] || []).length));
    const header = cursor + above;
    let lastRow = header;
    band.forEach(([foreman, crew], i) => {
      const col = NAME_COLS[i];
      (outAbove[foreman] || []).forEach((u, k, arr) => put(col, header - arr.length + k, u.name));
      put(col, header, foreman, { bold: true });
      if (crew.qual) put(col + 1, header, crew.qual);
      let r = header + 1;
      for (const m of crew.members || []) { put(col, r, m.name); if (m.qual) put(col + 1, r, m.qual); r++; }
      for (const u of crossed[foreman] || []) { put(col, r, u.name, { strike: true }); if (u.qual) put(col + 1, r, u.qual); r++; }
      lastRow = Math.max(lastRow, r - 1);
    });
    cursor = lastRow + 2; // blank row keeps the next band's "out" names separate
  }

  // Pools
  const poolRow = Math.max(cursor, 21);
  const pools = d.pools || {};
  put(19, poolRow, 'Laborers', { bold: true });
  put(21, poolRow, 'DRIVERS', { bold: true });
  put(23, poolRow, 'EXTRA', { bold: true });
  const struckIn = key => poolStruck.filter(u => u.pool === key);
  const lab = [...(pools.laborers || []).map(p => ({ name: p.name })), ...struckIn('laborers').map(u => ({ name: u.name, strike: true }))];
  const drv = [...(pools.drivers || []).map(p => ({ name: p.name })), ...struckIn('drivers').map(u => ({ name: u.name, strike: true }))];
  const ext = [...(pools.extra || []).map(p => ({ name: p.name })), ...struckIn('extra').map(u => ({ name: u.name, strike: true }))];
  lab.forEach((p, i) => put(19, poolRow + 1 + i, p.name, { strike: !!p.strike }));
  drv.forEach((p, i) => put(21, poolRow + 1 + i, p.name, { strike: !!p.strike }));
  ext.forEach((p, i) => put(23 + (i % 3), poolRow + 1 + Math.floor(i / 3), p.name, { strike: !!p.strike }));

  // Unassigned (and crossed-out people with no crew or pool) — loose in Q
  const loose = [...(d.unassigned || []).map(u => ({ name: u.name })), ...poolStruck.filter(u => !u.pool).map(u => ({ name: u.name, strike: true }))];
  loose.forEach((u, i) => put(17, poolRow + 1 + i, u.name, { strike: !!u.strike }));
}
