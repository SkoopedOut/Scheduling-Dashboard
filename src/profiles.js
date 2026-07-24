import { getToken } from './auth.js';

// ============================================================
// Installer profiles
//
// Stored as a single JSON file in the same document library the
// log books live in:  Documents/Schedule/installers.json
//
// Keying: the EXACT roster string is the primary key. The roster
// is full of nicknames and near-collisions ("Pat" / "Pat C" /
// "Patrick", "Dave" / "Dave O" / "Dave Piz", "Mike D" / "Mike G" /
// "Mike Miele"), so fuzzy matching would silently merge two
// different people. The roster string is the key; the person's
// real name is just another field on the record.
// ============================================================

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SHAREPOINT_SITE_URL = 'hubofficeinc.sharepoint.com:/sites/SchedulingTeam';
const DRIVE_NAME = 'Documents';
const PROFILE_PATH = 'Schedule/installers.json';

export const SCHEMA_VERSION = 1;

export const ROLES = [
  { id: 'laborer',      label: 'Laborer'      },
  { id: 'apprentice-1', label: 'Apprentice 1' },
  { id: 'apprentice-2', label: 'Apprentice 2' },
  { id: 'apprentice-3', label: 'Apprentice 3' },
  { id: 'apprentice-4', label: 'Apprentice 4' },
  { id: 'foreman',      label: 'Foreman'      },
];

export const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.id, r.label]));

let _siteId = null;
let _driveId = null;

function encodePath(p) {
  return encodeURIComponent(p).replace(/%2F/g, '/');
}

async function resolveDrive(token, cb) {
  if (!_siteId) {
    const res = await fetch(`${GRAPH_BASE}/sites/${SHAREPOINT_SITE_URL}?${cb}`, {
      headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache, no-store' },
    });
    if (!res.ok) throw new Error(`Couldn't reach the SharePoint site (${res.status}).`);
    _siteId = (await res.json()).id;
  }
  if (!_driveId) {
    const res = await fetch(`${GRAPH_BASE}/sites/${_siteId}/drives?${cb}`, {
      headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache, no-store' },
    });
    if (!res.ok) throw new Error(`Couldn't list document libraries (${res.status}).`);
    const drives = (await res.json()).value || [];
    const drive = drives.find(d => d.name === DRIVE_NAME);
    if (!drive) throw new Error(`Library "${DRIVE_NAME}" not found. Found: ${drives.map(d => d.name).join(', ')}`);
    _driveId = drive.id;
  }
  return _driveId;
}

// ── Record shape ─────────────────────────────────────────────
export function blankProfile(rosterName) {
  return {
    rosterName,            // exact string as it appears in the log book — the key
    displayName: '',       // real name, when the roster uses a nickname
    aliases: [],           // other spellings seen on job rows, e.g. "Mike-T" -> "Mike D"
    phone: '',
    teamsEmail: '',
    role: '',              // one of ROLES[].id
    notes: '',
    updatedAt: null,
    updatedBy: '',
  };
}

// Normalizes only for lookup convenience (case/whitespace), never for
// merging distinct roster strings — "Pat" and "Pat C" stay separate.
export function rosterKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function profileFor(profiles, rosterName) {
  return profiles?.byKey?.[rosterKey(rosterName)] || null;
}

// The name to show a human: real name if we have one, else the roster string.
export function personLabel(profiles, rosterName) {
  const p = profileFor(profiles, rosterName);
  const real = p?.displayName?.trim();
  return real || String(rosterName || '').trim();
}

// Index by roster name AND by any alias, so job-row spellings resolve.
// The roster name always wins if an alias would collide with one.
function indexProfiles(list) {
  const byKey = {};
  for (const p of list) {
    for (const a of p.aliases || []) {
      const k = rosterKey(a);
      if (k && !byKey[k]) byKey[k] = p;
    }
  }
  for (const p of list) byKey[rosterKey(p.rosterName)] = p;
  return byKey;
}

export function emptyStore() {
  return { version: SCHEMA_VERSION, people: [], byKey: {}, eTag: null, exists: false };
}

// ── Load ─────────────────────────────────────────────────────
export async function loadProfiles() {
  const token = await getToken();
  if (!token) throw new Error('Not signed in.');
  const cb = `_cb=${Date.now()}`;
  const driveId = await resolveDrive(token, cb);

  const metaRes = await fetch(
    `${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(PROFILE_PATH)}?select=id,eTag&${cb}`,
    { headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache, no-store' } }
  );

  // No file yet — first run. Not an error.
  if (metaRes.status === 404) return emptyStore();
  if (!metaRes.ok) throw new Error(`Couldn't read profiles (${metaRes.status}).`);

  const meta = await metaRes.json();
  const contentRes = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${meta.id}/content?${cb}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Cache-Control': 'no-cache, no-store',
      'If-None-Match': '',
    },
  });
  if (!contentRes.ok) throw new Error(`Couldn't download profiles (${contentRes.status}).`);

  let parsed;
  try {
    parsed = JSON.parse(await contentRes.text());
  } catch {
    throw new Error('installers.json is not valid JSON. Fix or delete the file in SharePoint, then reload.');
  }

  const people = Array.isArray(parsed?.people) ? parsed.people : [];
  const clean = people
    .filter(p => p && typeof p.rosterName === 'string' && p.rosterName.trim())
    .map(p => ({ ...blankProfile(p.rosterName.trim()), ...p }));

  return {
    version: parsed?.version || SCHEMA_VERSION,
    people: clean,
    byKey: indexProfiles(clean),
    eTag: meta.eTag || null,
    exists: true,
  };
}

// ── Save ─────────────────────────────────────────────────────
// Uses If-Match so a second scheduler saving from a stale copy gets a
// clear conflict instead of silently overwriting the first one's edits.
export async function saveProfiles(store, { savedBy = '' } = {}) {
  const token = await getToken();
  if (!token) throw new Error('Not signed in.');
  const cb = `_cb=${Date.now()}`;
  const driveId = await resolveDrive(token, cb);

  const payload = {
    version: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    savedBy,
    people: store.people,
  };

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store',
  };
  if (store.exists && store.eTag) headers['If-Match'] = store.eTag;

  const res = await fetch(
    `${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(PROFILE_PATH)}:/content?${cb}`,
    { method: 'PUT', headers, body: JSON.stringify(payload, null, 2) }
  );

  if (res.status === 412) {
    const err = new Error('Someone else saved profiles while you were editing. Reload to get their changes, then reapply yours.');
    err.conflict = true;
    throw err;
  }
  if (!res.ok) throw new Error(`Couldn't save profiles (${res.status}).`);

  const saved = await res.json();
  return { ...store, eTag: saved.eTag || null, exists: true };
}

// ============================================================
// Harvest every roster string the parsed week actually contains,
// so the profile list is driven by the real log book rather than
// a hardcoded name list.
// ============================================================
const DAY_ORDER = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// Tokens that appear in the crew columns but aren't people.
const NON_PERSON_RE = /^(stop\s*\d+|ioi|na|n\/a|tbd|open|off|x)$/i;

// "Pat-T (1)" -> "Pat" | "Mike-t" -> "Mike" | "Stop 2" -> null
export function cleanJobCrewName(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  s = s.replace(/\s*\(\s*\d+\s*\)\s*$/, '');          // trailing "(1)" trip count
  s = s.replace(/\s*[-–]\s*[TVA]\s*$/i, '');          // trailing "-T" / "- V" qualifier
  s = s.trim().replace(/[-–\s]+$/, '').trim();
  if (!s || NON_PERSON_RE.test(s)) return null;
  if (/^\d+$/.test(s)) return null;
  if (s.length < 2 || s.length > 25) return null;
  return s;
}

export function collectRosterNames(weekData, knownProfiles = null) {
  // key -> { name, foreman, seenAsForeman, pools:Set, days:Set, onJobs:number }
  const found = new Map();
  const jobOnly = []; // job-row crew names, resolved against the roster below

  const note = (rawName, patch = {}) => {
    const name = String(rawName || '').trim();
    if (!name) return;
    const key = rosterKey(name);
    if (!key) return;
    const rec = found.get(key) || {
      name, seenAsForeman: false, crews: new Set(), pools: new Set(), days: new Set(), onJobs: 0,
    };
    if (patch.foreman) rec.seenAsForeman = true;
    if (patch.crew) rec.crews.add(patch.crew);
    if (patch.pool) rec.pools.add(patch.pool);
    if (patch.day) rec.days.add(patch.day);
    if (patch.job) rec.onJobs += 1;
    found.set(key, rec);
  };

  for (const day of DAY_ORDER) {
    const d = weekData?.[day];
    if (!d) continue;

    for (const [foreman, crew] of Object.entries(d.crews || {})) {
      note(foreman, { foreman: true, day });
      for (const m of crew?.members || []) note(m.name, { crew: foreman, day });
    }

    for (const [pool, list] of Object.entries(d.pools || {})) {
      for (const m of list || []) note(m.name, { pool, day });
    }

    for (const m of d.unassigned || []) note(m.name, { day });
    for (const m of d.unavailable || []) note(m.name, { day });

    // Crew names written on job rows carry their own decorations:
    // a qualifier suffix ("Mike-T", "Ayotte-V"), a trip-count
    // parenthetical ("Pat-T (1)", "Draper-T (2)"), inconsistent case,
    // and non-person tokens ("Stop 1", "IOI") that must be dropped.
    for (const job of d.jobs || []) {
      for (const raw of job.crew || []) {
        const cleaned = cleanJobCrewName(raw);
        if (cleaned) jobOnly.push({ name: cleaned, day });
      }
    }
  }

  // Job-row names only count job appearances against people who already
  // exist in the roster. A job-row spelling with no roster match ("Mike"
  // when the roster says "Mike D") is NOT turned into its own profile —
  // that would create phantom duplicates. It's reported as unmatched so a
  // scheduler can add an alias deliberately.
  const unmatchedJobNames = new Map();
  for (const { name, day } of jobOnly) {
    let key = rosterKey(name);
    // A saved alias redirects this spelling to its real roster name.
    const aliased = knownProfiles?.byKey?.[key];
    if (aliased) key = rosterKey(aliased.rosterName);
    if (found.has(key)) {
      const rec = found.get(key);
      rec.onJobs += 1;
      rec.days.add(day);
    } else {
      const u = unmatchedJobNames.get(key) || { name, count: 0 };
      u.count += 1;
      unmatchedJobNames.set(key, u);
    }
  }

  const people = [...found.values()]
    .map(r => ({
      name: r.name,
      key: rosterKey(r.name),
      seenAsForeman: r.seenAsForeman,
      crews: [...r.crews],
      pools: [...r.pools],
      days: [...r.days],
      onJobs: r.onJobs,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  people.unmatchedJobNames = [...unmatchedJobNames.values()].sort((a, b) => b.count - a.count);
  return people;
}

// Merge harvested roster names into the store, adding blanks for anyone new.
// Never deletes: someone missing this week may just be on vacation.
export function mergeRosterNames(store, rosterNames) {
  const people = [...store.people];
  const have = new Set(people.map(p => rosterKey(p.rosterName)));
  let added = 0;
  for (const r of rosterNames) {
    if (have.has(r.key)) continue;
    const fresh = blankProfile(r.name);
    if (r.seenAsForeman) fresh.role = 'foreman'; // sensible default, still editable
    people.push(fresh);
    have.add(r.key);
    added++;
  }
  people.sort((a, b) => a.rosterName.localeCompare(b.rosterName));
  return { store: { ...store, people, byKey: indexProfiles(people) }, added };
}

export function upsertProfile(store, profile) {
  const key = rosterKey(profile.rosterName);
  const people = store.people.some(p => rosterKey(p.rosterName) === key)
    ? store.people.map(p => (rosterKey(p.rosterName) === key ? profile : p))
    : [...store.people, profile];
  return { ...store, people, byKey: indexProfiles(people) };
}

export function removeProfile(store, rosterName) {
  const key = rosterKey(rosterName);
  const people = store.people.filter(p => rosterKey(p.rosterName) !== key);
  return { ...store, people, byKey: indexProfiles(people) };
}

// ── Validation ───────────────────────────────────────────────
export function validateProfile(p) {
  const errors = {};
  if (!p.rosterName?.trim()) errors.rosterName = 'Roster name is required.';
  if (p.teamsEmail?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.teamsEmail.trim())) {
    errors.teamsEmail = 'Enter a valid email address.';
  }
  if (p.phone?.trim()) {
    const digits = p.phone.replace(/\D/g, '');
    if (digits.length < 10) errors.phone = 'Enter a 10-digit phone number.';
  }
  return errors;
}

export function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return String(raw || '');
}

export function profileCompleteness(p) {
  const filled = ['displayName', 'phone', 'teamsEmail', 'role'].filter(f => p[f]?.trim()).length;
  return { filled, total: 4, complete: filled === 4 };
}
