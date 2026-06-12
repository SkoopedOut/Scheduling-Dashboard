import { getToken } from './auth.js';
import * as XLSX from 'xlsx';

// ============================================================
// UPDATE THIS — your SharePoint site URL
// ============================================================
const SHAREPOINT_SITE_URL = 'hubofficeinc.sharepoint.com:/sites/SchedulingTeam';

// File path structure: Documents/Schedule/04 April 26/3-28-2026 Log Book.xlsx
const DRIVE_NAME = 'Documents';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const DAY_ORDER = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const FOREMAN_ORDER = ['Jeremy','Phil','Matt','Kritter','Eddie','Craig','Ayotte','Brian'];

// Cache the site ID and drive ID after first lookup (these never change)
let _cachedSiteId = null;
let _cachedDriveId = null;

// ============================================================
// Calculate which file to fetch based on today's date
// Files are named by the Saturday (end of week) date
// ============================================================
function getWeekFileInfo(date = new Date()) {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0=Sun ... 6=Sat
  const daysUntilSat = (6 - dayOfWeek + 7) % 7;
  const saturday = new Date(d);
  saturday.setDate(d.getDate() + (daysUntilSat === 0 && dayOfWeek === 6 ? 0 : daysUntilSat));

  const month = saturday.getMonth() + 1;
  const monthName = saturday.toLocaleString('en-US', { month: 'long' });
  const year = saturday.getFullYear().toString().slice(-2);
  const mm = month.toString().padStart(2, '0');

  const m = saturday.getMonth() + 1;
  const day = saturday.getDate();
  const y = saturday.getFullYear();

  const folderName = `${mm} ${monthName} ${year}`;
  const fileName = `${m}-${day}-${y} Log Book.xlsx`;

  return {
    folderPath: `Schedule/${folderName}`,
    fileName,
    fullPath: `Schedule/${folderName}/${fileName}`,
    saturdayDate: saturday,
  };
}

// ============================================================
// Flexible name matching helpers
// The file SHOULD be named "3-28-2026 Log Book.xlsx" but people
// save it as "3-28-26 Log Book", "3282026_Log_Book_", "logbook 3-28",
// etc. We normalize names (strip everything but letters/digits)
// and look for the Saturday date in any common form. The date in
// each tab's K2 cell is the final source of truth.
// ============================================================
function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dateVariants(saturday) {
  const m = saturday.getMonth() + 1;
  const d = saturday.getDate();
  const y = saturday.getFullYear();
  const yy = String(y).slice(-2);
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  // All collapse to digit-runs after normalizeName(), e.g. "3-28-2026" -> "3282026"
  return [...new Set([
    `${m}${d}${y}`, `${mm}${dd}${y}`, `${m}${dd}${y}`, `${mm}${d}${y}`,
    `${m}${d}${yy}`, `${mm}${dd}${yy}`, `${m}${dd}${yy}`, `${mm}${d}${yy}`,
  ])];
}

function folderVariants(saturday) {
  const m = saturday.getMonth() + 1;
  const mm = String(m).padStart(2, '0');
  const monthName = saturday.toLocaleString('en-US', { month: 'long' }).toLowerCase();
  const monthShort = monthName.slice(0, 3);
  const y = saturday.getFullYear();
  const yy = String(y).slice(-2);
  return [...new Set([
    `${mm}${monthName}${yy}`, `${m}${monthName}${yy}`, `${monthName}${yy}`,
    `${mm}${monthName}${y}`, `${monthName}${y}`,
    `${mm}${monthShort}${yy}`, `${monthShort}${yy}`,
  ])];
}

// Score a file name as a candidate for this week's log book
function scoreCandidate(name, variants) {
  const n = normalizeName(name);
  if (!n.endsWith('xlsx') && !n.endsWith('xlsm')) return -1;
  if (n.startsWith('~')) return -1; // Excel lock files
  let score = 0;
  if (variants.some(v => n.includes(v))) score += 10;  // Saturday date appears in the name
  if (n.includes('logbook') || n.includes('log')) score += 2;
  return score;
}

// Does the parsed workbook actually contain this week?
// (date is read from cell K2 of the day tabs — always present)
// Requires 2+ day tabs inside the window so a neighboring week's
// boundary Saturday can't falsely verify through the ±1 day slack.
function workbookMatchesWeek(parsed, saturday) {
  const sat = new Date(saturday); sat.setHours(12, 0, 0, 0);
  const sun = new Date(sat); sun.setDate(sat.getDate() - 6);
  // ±1 day slack for timezone drift in date parsing
  const lo = new Date(sun); lo.setDate(lo.getDate() - 1);
  const hi = new Date(sat); hi.setDate(hi.getDate() + 1);
  let hits = 0;
  for (const day of DAY_ORDER) {
    const ds = parsed?.[day]?.date;
    if (!ds) continue;
    const dt = new Date(ds + 'T12:00:00');
    if (!isNaN(dt) && dt >= lo && dt <= hi) hits++;
    if (hits >= 2) return true;
  }
  return false;
}

// ============================================================
// Graph helpers (all cache-busted)
// ============================================================
function encodePath(p) {
  return encodeURIComponent(p).replace(/%2F/g, '/');
}

async function graphGet(url, token, extraHeaders = {}) {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Cache-Control': 'no-cache, no-store',
      Pragma: 'no-cache',
      ...extraHeaders,
    },
  });
}

async function getMetaByPath(driveId, path, token, cb) {
  const url = `${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(path)}?select=id,name,lastModifiedDateTime,eTag&${cb}`;
  const res = await graphGet(url, token);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get file info: ${res.status}`);
  return res.json();
}

async function listChildren(driveId, path, token, cb) {
  const url = `${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(path)}:/children?$select=id,name,lastModifiedDateTime,eTag,folder,file&$top=500&${cb}`;
  const res = await graphGet(url, token);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to list folder "${path}": ${res.status}`);
  const data = await res.json();
  return data.value || [];
}

async function downloadById(driveId, itemId, token, cb) {
  const url = `${GRAPH_BASE}/drives/${driveId}/items/${itemId}/content?${cb}`;
  const res = await graphGet(url, token, { 'If-None-Match': '' });
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
  return res.arrayBuffer();
}

// ============================================================
// Locate this week's folder, tolerating naming variations
// ============================================================
async function resolveWeekFolder(driveId, fileInfo, token, cb) {
  // 1. Exact folder name first
  const exact = await listChildren(driveId, fileInfo.folderPath, token, cb);
  if (exact) return { path: fileInfo.folderPath, children: exact };

  // 2. Fall back: list "Schedule" and fuzzy-match the month folder
  const scheduleChildren = await listChildren(driveId, 'Schedule', token, cb);
  if (!scheduleChildren) {
    throw new Error(`"Schedule" folder not found in drive "${DRIVE_NAME}".`);
  }
  const fVariants = folderVariants(fileInfo.saturdayDate);
  const folder = scheduleChildren.find(c => c.folder && fVariants.some(v => normalizeName(c.name).includes(v)));
  if (!folder) {
    const available = scheduleChildren.filter(c => c.folder).map(c => c.name).join(', ') || '(none)';
    throw new Error(`Month folder for ${fileInfo.folderPath.split('/')[1]} not found. Folders in Schedule: ${available}`);
  }
  const path = `Schedule/${folder.name}`;
  const children = await listChildren(driveId, path, token, cb);
  return { path, children: children || [] };
}

// ============================================================
// Fetch the Excel file from SharePoint via Microsoft Graph
// ============================================================
export async function fetchScheduleFromSharePoint(date = new Date()) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const fileInfo = getWeekFileInfo(date);

  // Cache-bust parameter — forces Graph to skip CDN/edge cache
  const cb = `_cb=${Date.now()}`;

  // Step 1: Resolve the SharePoint site ID (cached after first call)
  if (!_cachedSiteId) {
    const siteUrl = `${GRAPH_BASE}/sites/${SHAREPOINT_SITE_URL}?${cb}`;
    const siteResponse = await graphGet(siteUrl, token);
    if (!siteResponse.ok) throw new Error(`Failed to resolve site: ${siteResponse.status}`);
    const siteData = await siteResponse.json();
    _cachedSiteId = siteData.id;
  }

  // Step 2: Find the document library drive (cached after first call)
  if (!_cachedDriveId) {
    const drivesResponse = await graphGet(`${GRAPH_BASE}/sites/${_cachedSiteId}/drives?${cb}`, token);
    if (!drivesResponse.ok) throw new Error(`Failed to list drives: ${drivesResponse.status}`);
    const drivesData = await drivesResponse.json();
    const drive = drivesData.value.find(d => d.name === DRIVE_NAME);
    if (!drive) throw new Error(`Drive "${DRIVE_NAME}" not found. Available: ${drivesData.value.map(d => d.name).join(', ')}`);
    _cachedDriveId = drive.id;
  }

  // Step 3: Try the exact expected path first (fast path)
  let meta = await getMetaByPath(_cachedDriveId, fileInfo.fullPath, token, cb);
  let matchedBy = 'exact name';

  // Step 4: Flexible search — list the month folder and match by date in the
  // file name, then VERIFY by reading the date inside the workbook (cell K2).
  if (!meta) {
    const { path: folderPath, children } = await resolveWeekFolder(_cachedDriveId, fileInfo, token, cb);
    const variants = dateVariants(fileInfo.saturdayDate);

    const candidates = (children || [])
      .filter(c => c.file)
      .map(c => ({ ...c, _score: scoreCandidate(c.name, variants) }))
      .filter(c => c._score > 0)
      .sort((a, b) => b._score - a._score ||
        new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime));

    if (candidates.length === 0) {
      const files = (children || []).filter(c => c.file).map(c => c.name).join(', ') || '(empty folder)';
      throw new Error(`No log book found for week ending ${fileInfo.saturdayDate.toLocaleDateString()} in ${folderPath}. Files there: ${files}`);
    }

    // Download up to 5 candidates; accept the first whose tab dates match the week
    let firstStrong = null;
    for (const cand of candidates.slice(0, 5)) {
      try {
        const buf = await downloadById(_cachedDriveId, cand.id, token, cb);
        const parsed = parseExcelFile(buf);
        if (workbookMatchesWeek(parsed, fileInfo.saturdayDate)) {
          parsed._meta = {
            lastModified: cand.lastModifiedDateTime,
            fileName: cand.name,
            eTag: cand.eTag,
            matchedBy: cand._score >= 10 ? 'date in file name + verified by tab dates' : 'verified by tab dates',
          };
          return parsed;
        }
        // Remember the best name-match in case nothing verifies
        if (!firstStrong && cand._score >= 10) firstStrong = { cand, parsed };
      } catch (e) {
        console.warn(`Candidate "${cand.name}" failed:`, e);
      }
    }

    if (firstStrong) {
      // Name clearly contains the Saturday date; trust it even though
      // the tab dates didn't line up (they may not have been updated).
      const { cand, parsed } = firstStrong;
      parsed._meta = {
        lastModified: cand.lastModifiedDateTime,
        fileName: cand.name,
        eTag: cand.eTag,
        matchedBy: 'date in file name (tab dates differ — check K2 dates in the file)',
      };
      return parsed;
    }

    const tried = candidates.slice(0, 5).map(c => c.name).join(', ');
    throw new Error(`Found possible files (${tried}) but none contain dates for the week ending ${fileInfo.saturdayDate.toLocaleDateString()}.`);
  }

  // Exact path hit — download by item ID (bypasses path-based caching)
  const arrayBuffer = await downloadById(_cachedDriveId, meta.id, token, cb);
  const parsed = parseExcelFile(arrayBuffer);

  // Attach metadata so UI can show last-modified time
  parsed._meta = {
    lastModified: meta.lastModifiedDateTime,
    fileName: meta.name,
    eTag: meta.eTag,
    matchedBy,
  };

  return parsed;
}

// ============================================================
// Parse the Excel workbook into our app's data format
// ============================================================
export function parseExcelFile(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const data = {};

  for (const dayName of DAY_ORDER) {
    if (!workbook.SheetNames.includes(dayName)) {
      data[dayName] = { day: dayName, date: null, jobs: [], crews: {}, pools: {} };
      continue;
    }

    const sheet = workbook.Sheets[dayName];
    data[dayName] = parseDaySheet(sheet, dayName);
  }

  return data;
}

function cellVal(sheet, ref) {
  const cell = sheet[ref];
  if (!cell) return null;
  if (cell.t === 'd') return cell.v;
  return cell.v;
}

function parseDaySheet(sheet, dayName) {
  // Get date from K2
  const dateVal = cellVal(sheet, 'K2');
  let dateStr = null;
  if (dateVal instanceof Date) {
    dateStr = dateVal.toISOString().split('T')[0];
  } else if (typeof dateVal === 'string') {
    dateStr = dateVal;
  }

  // Parse jobs from rows 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30 (job rows at A column with numbers 1-13)
  const jobs = [];
  const jobRows = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];

  for (const row of jobRows) {
    const jobNum = cellVal(sheet, `A${row}`);
    if (jobNum == null || typeof jobNum !== 'number') continue;

    const customer = cellVal(sheet, `B${row}`);
    if (!customer) continue; // Skip empty job slots

    const poJob = cellVal(sheet, `C${row}`);
    const location = cellVal(sheet, `D${row}`);
    const onsiteTime = cellVal(sheet, `E${row}`);
    const trucks = cellVal(sheet, `F${row}`);
    const numMen = cellVal(sheet, `G${row}`);
    const calledIn = cellVal(sheet, `M${row}`);
    const jobFolder = cellVal(sheet, `N${row}`);

    // Collect crew names from columns H through L (main row) and H through L (row+1 for overflow)
    const crew = [];
    for (const r of [row, row + 1]) {
      for (const col of ['H', 'I', 'J', 'K', 'L']) {
        const name = cellVal(sheet, `${col}${r}`);
        if (name && typeof name === 'string' && name.trim()) {
          crew.push(name.trim());
        }
      }
    }

    jobs.push({
      num: jobNum,
      customer: typeof customer === 'string' ? customer.trim() : String(customer),
      poJob: poJob != null ? String(poJob).trim() : null,
      location: typeof location === 'string' ? location.trim().replace(/\n/g, ', ') : null,
      onsiteTime: onsiteTime != null ? String(onsiteTime).trim() : null,
      trucks: trucks != null ? String(trucks).trim() : null,
      numMen: typeof numMen === 'number' ? numMen : null,
      crew,
      calledIn: calledIn != null ? String(calledIn).trim() : null,
      jobFolder: jobFolder != null ? String(jobFolder).trim().toLowerCase() : null,
    });
  }

  // Parse roster from columns Q-X
  const crews = parseRosterCrews(sheet);
  const pools = parseRosterPools(sheet);

  return { day: dayName, date: dateStr, jobs, crews, pools };
}

function parseRosterCrews(sheet) {
  const crews = {};
  const foremanCols = [
    { nameCol: 'Q', qualCol: 'R' },
    { nameCol: 'S', qualCol: 'T' },
    { nameCol: 'U', qualCol: 'V' },
    { nameCol: 'W', qualCol: 'X' },
  ];

  for (const fc of foremanCols) {
    const foremanName = cellVal(sheet, `${fc.nameCol}8`);
    if (!foremanName || !String(foremanName).trim()) continue;

    const fName = String(foremanName).trim();
    const members = [];

    for (let r = 9; r <= 19; r++) {
      const name = cellVal(sheet, `${fc.nameCol}${r}`);
      const qual = cellVal(sheet, `${fc.qualCol}${r}`);
      if (name && typeof name === 'string' && name.trim()) {
        members.push({
          name: name.trim(),
          qual: qual ? String(qual).trim() : null,
        });
      }
    }

    crews[fName] = { members };
  }

  return crews;
}

function parseRosterPools(sheet) {
  const laborers = [];
  const drivers = [];
  const extra = [];

  for (let r = 22; r <= 27; r++) {
    const lab = cellVal(sheet, `Q${r}`);
    if (lab && typeof lab === 'string' && lab.trim()) laborers.push({ name: lab.trim() });

    const drv = cellVal(sheet, `S${r}`);
    if (drv && typeof drv === 'string' && drv.trim()) drivers.push({ name: drv.trim() });

    for (const col of ['U', 'V', 'W', 'X', 'Y']) {
      const ex = cellVal(sheet, `${col}${r}`);
      if (ex && typeof ex === 'string' && ex.trim()) {
        const val = ex.trim();
        if (['T', 'V', 'A'].includes(val)) continue;
        extra.push({ name: val });
      }
    }
  }

  return { laborers, drivers, extra };
}

export { getWeekFileInfo };
