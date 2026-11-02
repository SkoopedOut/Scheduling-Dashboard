// Shared scheduling helpers — pure functions with no React, used by the
// app shell, the Schedule page, month search and TV mode. Extracted from
// App.jsx so the new Schedule modules can share them without circular imports.
import { getWeekFileInfo } from './sharepoint.js';

export const DAY_ORDER = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
// Apple system colors (dark appearance) so crews read the same way on
// every screen: the TV, the roster and the Schedule page.
export const SYS = {
  blue:"#0A84FF", green:"#30D158", indigo:"#5E5CE6", orange:"#FF9F0A", pink:"#FF375F",
  purple:"#BF5AF2", red:"#FF453A", teal:"#40C8E0", cyan:"#64D2FF", yellow:"#FFD60A",
  mint:"#66D4CF", brown:"#AC8E68", gray:"#8E8E93",
};
export const FOREMAN_COLORS = {
  Jeremy:SYS.blue, Phil:SYS.orange, Matt:SYS.green, Kritter:SYS.pink,
  Eddie:SYS.purple, Craig:SYS.cyan, Ayotte:SYS.brown, Brian:SYS.mint,
};
export const PM_COLORS = {D:SYS.blue,R:SYS.orange,G:SYS.green,J:SYS.purple,JE:SYS.pink};
// Fallback palette so foremen who are renamed/added still get a stable color
export const FOREMAN_PALETTE = [SYS.blue,SYS.orange,SYS.green,SYS.pink,SYS.purple,SYS.cyan,SYS.brown,SYS.mint,SYS.indigo,SYS.teal,SYS.red,SYS.yellow];
export function foremanColor(name, idx){ return FOREMAN_COLORS[name] || FOREMAN_PALETTE[(idx>=0?idx:0)%FOREMAN_PALETTE.length]; }
export const REFRESH_MS = 2 * 60 * 1000; // 2 minutes — cache-busting makes this safe now

export function getTodayDayName(){ return DAY_ORDER[new Date().getDay()]; }
export function formatDate(ds){ if(!ds) return ""; return new Date(ds+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}); }
export function getWeekLabel(d){ const dt=DAY_ORDER.map(x=>d[x]?.date).filter(Boolean); if(dt.length<2) return null; const a=new Date(dt[0]+"T12:00:00"),b=new Date(dt[dt.length-1]+"T12:00:00"); return `${a.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${b.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`; }
export function getSaturdayKey(date=new Date()){const info=getWeekFileInfo(date);const sat=info.saturdayDate;return `${sat.getFullYear()}-${String(sat.getMonth()+1).padStart(2,'0')}-${String(sat.getDate()).padStart(2,'0')}`;}
export function satKeyToLabel(satKey){const sat=new Date(satKey+'T12:00:00');const sun=new Date(sat);sun.setDate(sat.getDate()-6);return `${sun.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${sat.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`;}

// ── Operational Helpers ──────────────────────────────────────
export function isStopLabel(name){ return /^stop\s*\d+$/i.test(String(name).trim()); }
// Placeholder / code tokens that appear in a crew column but aren't people.
// IOI recurs as the lone "crew" on certain jobs — a job-type marker, not a name.
export function isPlaceholderToken(name){ return /^(ioi|tbd|open|n\/?a|xxx+)$/i.test(String(name).trim()); }
// A trailing driving qualifier: "-T", "-t", " -V", "-v" etc. This is a
// qualifier ON a real person's name (e.g. "Rich-t" = Rich, who's driving),
// NOT a marker that the token isn't a person.
export const DRIVER_SUFFIX=/\s*-\s*[tvTV]\s*$/;
export function hasDriverTag(name){ return DRIVER_SUFFIX.test(String(name).trim()); }
// Strip the driver suffix and any trailing "(1)" trip-count to get the
// name as it appears on the roster. "Rich -T" -> "Rich", "Pat-T (2)" -> "Pat".
export function canonicalName(name){
  return String(name).trim()
    .replace(/\s*\(\s*\d+\s*\)\s*$/,"")   // trailing trip count "(2)"
    .replace(DRIVER_SUFFIX,"")             // trailing driver qualifier
    .trim();
}
// True only for tokens that are NOT people at all: stop labels, or a bare
// qualifier with no name in front of it. "Rich-t" is a person and returns false.
export function isDriverTag(name){ return /^-\s*[tvTV]$/.test(String(name).trim()); }
export function isNonPerson(name){
  const s=String(name).trim();
  if(isStopLabel(s)) return true;
  if(isDriverTag(s)) return true;            // bare "-T"
  if(isPlaceholderToken(s)) return true;     // IOI, TBD, etc.
  if(canonicalName(s)==="") return true;     // nothing left after stripping
  return false;
}

// Parse onsite times like "6am", "6:30am", "2pm", "14:00" into minutes-after-midnight
export function parseTimeToMinutes(t){
  if(t==null) return null;
  const s=String(t).trim().toLowerCase();
  if(!s||/tbd|n\/a|^na$/.test(s)) return null;
  const m=s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if(!m) return null;
  let h=parseInt(m[1],10);
  const min=m[2]?parseInt(m[2],10):0;
  if(h>23||min>59) return null;
  const mer=m[3];
  if(mer==="pm"&&h!==12) h+=12;
  else if(mer==="am"&&h===12) h=0;
  else if(!mer&&h>=1&&h<=5) h+=12; // bare "3" or "4:30" = afternoon (pre-dawn jobs are written with "am")
  return h*60+min;
}
// OT = starts before 6:00 AM, or at/after 2:00 PM
export function isOvertimeStart(t){
  const m=parseTimeToMinutes(t);
  return m!=null&&(m<360||m>=840);
}

// ── New jobs & crew moves (with cross-week Monday logic) ─────
// A job is "new" if its job # didn't appear on the comparison day.
// A person "moved" if they're on a job # they weren't on that day.
//
// The comparison day is normally yesterday. But on MONDAY, yesterday
// is (usually empty) Sunday, and a job may actually have started on the
// prior Saturday, or be an ongoing weekday-only job last seen Friday.
// So on Monday we compare against the PRIOR WEEK's Friday + Saturday
// combined. This needs the previous week loaded in the cache.
export function jobIdentity(job){
  const po=job.poJob?String(job.poJob).trim():"";
  return po?`po:${po.toLowerCase()}`:`cust:${String(job.customer||"").trim().toLowerCase()}`;
}
export function prevWeekSatKey(satKey){
  if(!satKey) return null;
  const d=new Date(satKey+'T12:00:00');
  d.setDate(d.getDate()-7);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// Returns the array of jobs to compare "today" against, or null if the
// needed data isn't loaded (so callers can skip rather than false-flag).
export function getCompareJobs(dayName,weeksCache,curSatKey){
  const cur=weeksCache?.[curSatKey]||{};
  const i=DAY_ORDER.indexOf(dayName);
  if(i<0) return null;
  if(dayName==="Monday"){
    // Prior week's Friday + Saturday combined.
    const prevSat=prevWeekSatKey(curSatKey);
    const pw=weeksCache?.[prevSat];
    if(!pw) return null; // prior week not loaded yet
    const fri=pw.Friday?.jobs||[];
    const sat=pw.Saturday?.jobs||[];
    return [...fri,...sat];
  }
  if(i===0) return null; // Sunday: no in-week prior day
  const prev=cur[DAY_ORDER[i-1]];
  return prev?.jobs||null;
}
export function getNewJobIds(dayName,weeksCache,curSatKey){
  const today=weeksCache?.[curSatKey]?.[dayName];
  if(!today?.jobs?.length) return new Set();
  const compare=getCompareJobs(dayName,weeksCache,curSatKey);
  if(!compare) return new Set(); // can't compare -> mark nothing
  const prevIds=new Set(compare.filter(j=>!j.cancelled).map(jobIdentity));
  const result=new Set();
  for(const job of today.jobs){
    if(job.cancelled) continue;
    if(!prevIds.has(jobIdentity(job))) result.add(`${job.num}::${jobIdentity(job)}`);
  }
  return result;
}
export function isNewJob(job,newIds){ return newIds.has(`${job.num}::${jobIdentity(job)}`); }

// Map: person name -> set of job identities they were on, for a job list.
export function personJobMap(jobs){
  const m={};
  for(const job of (jobs||[])){
    if(job.cancelled) continue;
    const id=jobIdentity(job);
    for(const name of (job.crew||[])){
      if(isNonPerson(name)) continue;
      const cn=canonicalName(name); // fold "Rich-t" into "Rich"
      (m[cn]||=new Set()).add(id);
    }
  }
  return m;
}
// Returns Map: personName -> true if they're on any job today they were
// NOT on during the comparison day (i.e. moved/newly-assigned).
export function getMovedCrew(dayName,weeksCache,curSatKey){
  const today=weeksCache?.[curSatKey]?.[dayName];
  const moved=new Map();
  if(!today?.jobs?.length) return moved;
  const compare=getCompareJobs(dayName,weeksCache,curSatKey);
  if(!compare) return moved; // can't compare -> flag nobody
  const prevMap=personJobMap(compare);
  const todayMap=personJobMap(today.jobs);
  for(const [name,todayIds] of Object.entries(todayMap)){
    const prevIds=prevMap[name]||new Set();
    // Moved if any of today's job #s isn't one they were on the compare day.
    for(const id of todayIds){
      if(!prevIds.has(id)){ moved.set(name,true); break; }
    }
  }
  return moved;
}

// A person counts as "×2" only when assigned to two DIFFERENT jobs in the
// SAME time slot (both AM/regular, or both OT). Doing OT on the same job
// after regular time is NOT ×2, and an AM job plus an unrelated OT job is
// two different slots, so also not ×2 — the person can physically do both.
export function jobSlot(job){ return isOvertimeStart(job.onsiteTime)?"ot":"am"; }
export function getConflictsForDay(dayData){
  const jobs=(dayData?.jobs||[]).filter(j=>!j.cancelled);
  // name -> slot -> Map(jobKey -> job)
  const personMap={};
  for(const job of jobs){
    const slot=jobSlot(job);
    const key=job.poJob?String(job.poJob):`__num_${job.num}`;
    for(const rawName of (job.crew||[])){
      if(isNonPerson(rawName)) continue; // skip stop labels and driver tags
      const name=canonicalName(rawName); // fold "Rich-t" into "Rich"
      if(!personMap[name]) personMap[name]={am:new Map(),ot:new Map()};
      if(!personMap[name][slot].has(key)) personMap[name][slot].set(key,job);
    }
  }
  // Flag if EITHER slot has more than one distinct job. The ×N shown is the
  // largest single-slot job count (two AM jobs = ×2).
  const out=[];
  for(const [name,slots] of Object.entries(personMap)){
    const maxSlot=Math.max(slots.am.size,slots.ot.size);
    if(maxSlot>1){
      const jobsInBusiestSlot=slots.am.size>=slots.ot.size?slots.am:slots.ot;
      out.push({name,count:maxSlot,jobs:Array.from(jobsInBusiestSlot.values())});
    }
  }
  return out;
}


// ── Date keys ───────────────────────────────────────────────
export function isoDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function todayIso(){ return isoDate(new Date()); }
// "Hub 5", "1", "van" count as a truck; "na", "n/a", blank don't.
export function hasTruck(t){ return !!t&&!/^(na|n\/a)$/i.test(String(t).trim()); }

// ── Search ──────────────────────────────────────────────────
// A job matches when the whole query appears in any field (customer,
// location, PO, PM, trucks, job #, crew), or — for multi-word queries —
// when every word appears somewhere ("phil hilton" finds Phil's Hilton job).
export function jobHaystack(job){
  return [job.customer,job.location,job.poJob,job.calledIn,job.trucks,job.num!=null?`#${job.num}`:null,...(job.crew||[]),job.notes]
    .filter(v=>v!=null&&v!=="").map(String).join("  ").toLowerCase();
}
export function jobMatchesQuery(job,q){
  const n=String(q||"").trim().toLowerCase();
  if(!n) return true;
  const h=jobHaystack(job);
  if(h.includes(n)) return true;
  const toks=n.split(/\s+/).filter(Boolean);
  return toks.length>1&&toks.every(t=>h.includes(t));
}
