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
  };
}

export function emptyDay(day, date) {
  return { day, date, jobs: [], crews: {}, pools: { laborers: [], drivers: [], extra: [] }, unavailable: [], unassigned: [], notes: '' };
}

function normalizeDay(day, date, d = {}) {
  return {
    day, date,
    jobs: (d.jobs || []).map(cleanJob).sort((a, b) => (a.num ?? 999) - (b.num ?? 999)),
    crews: d.crews || {},
    pools: { laborers: d.pools?.laborers || [], drivers: d.pools?.drivers || [], extra: d.pools?.extra || [] },
    unavailable: d.unavailable || [],
    unassigned: d.unassigned || [],
    notes: d.notes || '',
  };
}

// Week object in the same shape the Excel parser returns ({Sunday:{…},…}).
export function normalizeWeek(satKey, days = {}) {
  const dates = weekDates(satKey);
  const out = {};
  DAYS.forEach((d, i) => { out[d] = normalizeDay(d, dates[i], days[d]); });
  return out;
}

export function cloneWeek(week) {
  const out = {};
  for (const d of DAYS) if (week[d]) out[d] = JSON.parse(JSON.stringify(week[d]));
  return out;
}

// Start a new week from the previous week's roster (last day that has one).
// People who were out or crossed out go back onto their crew/pool — being
// out is a per-day thing, not a roster change.
export function seedWeek(satKey, prevWeek) {
  let src = null;
  for (const d of [...DAYS].reverse()) {
    if (prevWeek?.[d] && Object.keys(prevWeek[d].crews || {}).length) { src = prevWeek[d]; break; }
  }
  const roster = src ? restoreRoster(src) : null;
  const week = normalizeWeek(satKey);
  if (roster) for (const d of DAYS) Object.assign(week[d], JSON.parse(JSON.stringify(roster)));
  return week;
}

function restoreRoster(day) {
  const crews = JSON.parse(JSON.stringify(day.crews || {}));
  const pools = JSON.parse(JSON.stringify({ laborers: [], drivers: [], extra: [], ...(day.pools || {}) }));
  const unassigned = JSON.parse(JSON.stringify(day.unassigned || []));
  for (const u of day.unavailable || []) {
    if (u.foreman && crews[u.foreman]) crews[u.foreman].members.push({ name: u.name, qual: u.qual || null });
    else if (u.pool && pools[u.pool]) pools[u.pool].push({ name: u.name });
    else pools.extra.push({ name: u.name });
  }
  return { crews, pools, unavailable: [], unassigned };
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

// ── Load ─────────────────────────────────────────────────────
// Returns the week in parser shape plus _meta. A week that hasn't been
// set up yet returns only { _meta: { exists:false } }.
export async function loadStoreWeek(satKey) {
  const token = await getToken();
  if (!token) throw new Error('Not signed in.');
  const driveId = await resolveDrive(token);
  const path = dataPath(satKey);
  const cb = `_cb=${Date.now()}`;
  const metaRes = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(path)}?select=id,name,eTag,lastModifiedDateTime,lastModifiedBy&${cb}`,
    { headers: { Authorization: `Bearer ${token}`, ...noCache } });
  if (metaRes.status === 404) return { _meta: { source: 'site', exists: false, path, satKey } };
  if (!metaRes.ok) throw new Error(`Couldn't read week data (${metaRes.status}).`);
  const meta = await metaRes.json();
  const body = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${meta.id}/content?${cb}`,
    { headers: { Authorization: `Bearer ${token}`, ...noCache, 'If-None-Match': '' } });
  if (!body.ok) throw new Error(`Couldn't download week data (${body.status}).`);
  let parsed;
  try { parsed = JSON.parse(await body.text()); }
  catch { throw new Error(`${meta.name} isn't valid JSON. Restore an earlier version from SharePoint version history.`); }
  const week = normalizeWeek(satKey, parsed.days || {});
  week._meta = {
    source: 'site', exists: true, path, satKey,
    eTag: meta.eTag || null,
    fileName: `Site data · ${meta.name}`,
    lastModified: meta.lastModifiedDateTime,
    savedBy: parsed.savedBy || meta.lastModifiedBy?.user?.displayName || '',
    backup: parsed.backup || null,
  };
  return week;
}

// ── Save ─────────────────────────────────────────────────────
// Writes the JSON (If-Match guards against overwriting someone else's
// save), then the backup log book. A failed backup does not undo the save.
export async function saveStoreWeek(satKey, week, { eTag = null, exists = false, savedBy = '' } = {}) {
  const token = await writeToken();
  const driveId = await resolveDrive(token);
  if (!savedBy) savedBy = nameFromToken(token);
  const days = {};
  const clean = normalizeWeek(satKey, week);
  for (const d of DAYS) { const { day, ...rest } = clean[d]; days[d] = rest; }
  const savedAt = new Date().toISOString();
  const bPath = backupPath(satKey);
  const payload = { version: STORE_VERSION, weekEnding: satKey, savedAt, savedBy, backup: bPath, days };

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...noCache };
  if (exists && eTag) headers['If-Match'] = eTag;
  const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(dataPath(satKey))}:/content`,
    { method: 'PUT', headers, body: JSON.stringify(payload, null, 2) });
  if (res.status === 412 || res.status === 409) {
    const err = new Error('Someone else saved this week a moment ago.');
    err.conflict = true;
    throw err;
  }
  if (!res.ok) throw new Error(res.status === 403
    ? 'SharePoint refused the save (403). You need Edit rights on the Schedule folder.'
    : `Couldn't save the week (${res.status}).`);
  const saved = await res.json();

  let backup = { ok: true, path: bPath };
  try {
    const buf = await buildBackupWorkbook(satKey, clean, { savedAt, savedBy });
    const up = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(bPath)}:/content`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      body: buf,
    });
    if (up.status === 423) throw new Error('the backup file is open in Excel — close it and save again');
    if (!up.ok) throw new Error(`upload failed (${up.status})`);
  } catch (e) {
    backup = { ok: false, path: bPath, error: e.message || String(e) };
  }

  const out = normalizeWeek(satKey, days);
  out._meta = {
    source: 'site', exists: true, path: dataPath(satKey), satKey,
    eTag: saved.eTag || null, fileName: `Site data · ${saved.name || satKey + '.json'}`,
    lastModified: saved.lastModifiedDateTime || savedAt, savedBy, backup: bPath,
  };
  return { week: out, backup };
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
