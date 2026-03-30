import { getToken } from './auth.js';
import * as XLSX from 'xlsx';

// ============================================================
// UPDATE THIS — your SharePoint site URL
// ============================================================
const SHAREPOINT_SITE_URL = 'hubofficeinc.sharepoint.com/sites/SchedulingTeam';

// File path structure: Scheduling Team - Documents/Schedule/04 April 26/3-28-2026_Log_Book_.xlsx
const DRIVE_NAME = 'Documents';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const DAY_ORDER = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const FOREMAN_ORDER = ['Jeremy','Phil','Matt','Kritter','Eddie','Foley','Ayotte','Brian'];

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
// Fetch the Excel file from SharePoint via Microsoft Graph
// ============================================================
export async function fetchScheduleFromSharePoint() {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const fileInfo = getWeekFileInfo();
  const encodedPath = encodeURIComponent(fileInfo.fullPath).replace(/%2F/g, '/');

  // Step 1: Resolve the SharePoint site to get its ID
  // The colon must come after the hostname, before /sites/...
  const siteUrl = `${GRAPH_BASE}/sites/hubofficeinc.sharepoint.com:/sites/SchedulingTeam`;
  const siteResponse = await fetch(siteUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!siteResponse.ok) throw new Error(`Failed to resolve site: ${siteResponse.status}`);
  const siteData = await siteResponse.json();
  const siteId = siteData.id;

  // Step 2: List drives using the resolved site ID
  const drivesResponse = await fetch(`${GRAPH_BASE}/sites/${siteId}/drives`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!drivesResponse.ok) throw new Error(`Failed to list drives: ${drivesResponse.status}`);
  const drivesData = await drivesResponse.json();

  // Step 3: Find the document library drive by name
  const drive = drivesData.value.find(d => d.name === DRIVE_NAME);
  if (!drive) throw new Error(`Drive "${DRIVE_NAME}" not found. Available: ${drivesData.value.map(d => d.name).join(', ')}`);

  // Step 4: Get the file content
  const fileUrl = `${GRAPH_BASE}/drives/${drive.id}/root:/${encodedPath}:/content`;
  const fileResponse = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileResponse.ok) {
    if (fileResponse.status === 404) {
      throw new Error(`File not found: ${fileInfo.fullPath}\nExpected at: ${DRIVE_NAME}/${fileInfo.fullPath}`);
    }
    throw new Error(`Failed to fetch file: ${fileResponse.status}`);
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  return parseExcelFile(arrayBuffer);
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
  // Foremen are in row 8, 10, 12, 14, 16, 18 area in columns Q, S, U, W
  // with their vehicle quals in R, T, V, X
  // Crew members are listed below each foreman
  const crews = {};
  const foremanCols = [
    { nameCol: 'Q', qualCol: 'R' },
    { nameCol: 'S', qualCol: 'T' },
    { nameCol: 'U', qualCol: 'V' },
    { nameCol: 'W', qualCol: 'X' },
  ];

  for (const fc of foremanCols) {
    // Check row 8 for foreman name
    const foremanName = cellVal(sheet, `${fc.nameCol}8`);
    if (!foremanName || !FOREMAN_ORDER.includes(String(foremanName).trim())) continue;

    const fName = String(foremanName).trim();
    const members = [];

    // Read crew members from rows 9-19 (below the foreman)
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
  // Laborers, Drivers, Extra are in rows 21+ in columns Q, S, U/W
  const laborers = [];
  const drivers = [];
  const extra = [];

  for (let r = 22; r <= 27; r++) {
    const lab = cellVal(sheet, `Q${r}`);
    if (lab && typeof lab === 'string' && lab.trim()) laborers.push({ name: lab.trim() });

    const drv = cellVal(sheet, `S${r}`);
    if (drv && typeof drv === 'string' && drv.trim()) drivers.push({ name: drv.trim() });

    // Extra spans columns U-Y
    for (const col of ['U', 'V', 'W', 'X', 'Y']) {
      const ex = cellVal(sheet, `${col}${r}`);
      if (ex && typeof ex === 'string' && ex.trim()) {
        const val = ex.trim();
        // Skip if it's a qualification letter
        if (['T', 'V', 'A'].includes(val)) continue;
        extra.push({ name: val });
      }
    }
  }

  return { laborers, drivers, extra };
}

export { getWeekFileInfo };
