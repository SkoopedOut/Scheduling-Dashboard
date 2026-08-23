import { useState, useEffect, useRef, Fragment, lazy, Suspense } from 'react';
import { initAuth, login, isConfigured } from './auth.js';
import { emptyStore, loadProfiles } from './profiles.js';

// Loaded on demand — these panels are only opened deliberately, so they
// stay out of the initial bundle the TV/kiosk view has to download.
const ProfilesPanel = lazy(() => import('./ProfilesPanel.jsx'));
const TeamsMessagePanel = lazy(() => import('./TeamsMessagePanel.jsx'));

function PanelFallback(){
  return <div style={{padding:"60px",textAlign:"center",color:"#4a5568",fontSize:"13px"}}>Loading…</div>;
}
import { fetchScheduleFromSharePoint, getWeekFileInfo } from './sharepoint.js';
import { SAMPLE_DATA, FOREMAN_ORDER } from './sampleData.js';

const DAY_ORDER = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const FOREMAN_COLORS = {
  Jeremy:"#4a9eff", Phil:"#f59e0b", Matt:"#10b981", Kritter:"#f472b6",
  Eddie:"#a78bfa", Craig:"#06b6d4", Ayotte:"#ef4444", Brian:"#84cc16",
};
const PM_COLORS = {D:"#4a9eff",R:"#f59e0b",G:"#10b981",J:"#a78bfa",JE:"#f472b6"};
// Fallback palette so foremen who are renamed/added still get a stable color
const FOREMAN_PALETTE = ["#4a9eff","#f59e0b","#10b981","#f472b6","#a78bfa","#06b6d4","#ef4444","#84cc16","#fb923c","#22d3ee","#e879f9","#facc15"];
function foremanColor(name, idx){ return FOREMAN_COLORS[name] || FOREMAN_PALETTE[(idx>=0?idx:0)%FOREMAN_PALETTE.length]; }
const REFRESH_MS = 2 * 60 * 1000; // 2 minutes — cache-busting makes this safe now

function getTodayDayName(){ return DAY_ORDER[new Date().getDay()]; }
function formatDate(ds){ if(!ds) return ""; return new Date(ds+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}); }
function getWeekLabel(d){ const dt=DAY_ORDER.map(x=>d[x]?.date).filter(Boolean); if(dt.length<2) return null; const a=new Date(dt[0]+"T12:00:00"),b=new Date(dt[dt.length-1]+"T12:00:00"); return `${a.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${b.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`; }
function getSaturdayKey(date=new Date()){const info=getWeekFileInfo(date);const sat=info.saturdayDate;return `${sat.getFullYear()}-${String(sat.getMonth()+1).padStart(2,'0')}-${String(sat.getDate()).padStart(2,'0')}`;}
function satKeyToLabel(satKey){const sat=new Date(satKey+'T12:00:00');const sun=new Date(sat);sun.setDate(sat.getDate()-6);return `${sun.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${sat.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`;}
const SAMPLE_SAT="2026-03-28";
const INITIAL_SAT=getSaturdayKey();

// ── Responsive hook ──────────────────────────────────────────
function useIsMobile(){
  const [m,setM]=useState(()=>typeof window!=="undefined"&&window.matchMedia("(max-width: 768px)").matches);
  useEffect(()=>{
    const mq=window.matchMedia("(max-width: 768px)");
    const h=e=>setM(e.matches);
    mq.addEventListener("change",h);
    return()=>mq.removeEventListener("change",h);
  },[]);
  return m;
}

// ── Small Components ─────────────────────────────────────────
function QualBadge({code}){
  if(!code) return null;
  const m={T:{bg:"#1e3a5f",fg:"#7eb8f7"},V:{bg:"#3b2d1a",fg:"#e8a948"},A:{bg:"#1a3328",fg:"#5ec490"}};
  const c=m[code]||{bg:"#333",fg:"#aaa"};
  return <span style={{display:"inline-block",fontSize:"8px",fontWeight:800,padding:"1px 4px",borderRadius:"3px",marginLeft:"3px",background:c.bg,color:c.fg,letterSpacing:"0.5px"}}>{code}</span>;
}

function PMBadge({initials}){
  if(!initials) return <span style={{color:"#444"}}>—</span>;
  return <span style={{display:"inline-block",fontSize:"10px",fontWeight:700,padding:"2px 8px",borderRadius:"4px",background:PM_COLORS[initials.toUpperCase()]||"#555",color:"#fff"}}>{initials.toUpperCase()}</span>;
}

// Column N "Job folder": y = folder needed (not yet done), SM = done by
// Stephanie MacFarland, n = not needed, blank = unmarked. Note "y" is an
// OUTSTANDING task, not a completed one — it must read as action-needed.
function FolderIcon({val}){
  const v=(val||"").toLowerCase();
  if(v==="sm") return <span title="Folder done by Stephanie MacFarland" style={{fontSize:"10px",fontWeight:800,color:"#10b981",padding:"1px 5px",borderRadius:"3px",background:"rgba(16,185,129,0.15)",border:"1px solid rgba(16,185,129,0.45)"}}>SM ✓</span>;
  if(v==="sm-half") return <span title="Partially done by Stephanie MacFarland" style={{fontSize:"10px",fontWeight:800,color:"#38bdf8",padding:"1px 5px",borderRadius:"3px",background:"rgba(56,189,248,0.15)",border:"1px solid rgba(56,189,248,0.45)"}}>SM ½</span>;
  if(v==="y") return <span title="Needs a folder — not done yet" style={{fontSize:"9px",fontWeight:800,letterSpacing:"0.3px",color:"#f59e0b",padding:"1px 5px",borderRadius:"3px",background:"rgba(245,158,11,0.15)",border:"1px solid rgba(245,158,11,0.5)"}}>NEEDS</span>;
  if(v==="n") return <span title="No folder needed" style={{color:"#5a6474",fontSize:"12px"}}>—</span>;
  return <span title="Not marked" style={{color:"#3a4254"}}>·</span>;
}

// ── Connection Bar ───────────────────────────────────────────
function ConnectionBar({mode,lastRefresh,nextRefresh,isConnected,onConnect,onRefresh,error,fileMeta,isRefreshing}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  const modifiedStr = fileMeta?.lastModified
    ? `File saved ${new Date(fileMeta.lastModified).toLocaleTimeString()}`
    : '';
  const fileNameStr = fileMeta?.fileName || '';
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 20px",fontSize:"11px",fontFamily:"'JetBrains Mono',monospace",background:error?"rgba(239,68,68,0.06)":isConnected?"rgba(16,185,129,0.06)":"rgba(245,158,11,0.06)",borderBottom:`1px solid ${error?"rgba(239,68,68,0.15)":isConnected?"rgba(16,185,129,0.15)":"rgba(245,158,11,0.15)"}`,color:"#6b7789"}}>
      <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
        <span style={{width:"6px",height:"6px",borderRadius:"50%",background:error?"#ef4444":isConnected?"#10b981":"#f59e0b"}}/>
        <span>{error ? `ERROR: ${error}` : mode==="demo"?"DEMO MODE — Sample data":"LIVE — SharePoint connected"}</span>
        {fileNameStr && !error && <span style={{color:"#4a5568"}} title={fileMeta?.matchedBy?`Matched by: ${fileMeta.matchedBy}`:undefined}>· {fileNameStr}</span>}
        {modifiedStr && <span style={{color:"#4a5568"}}>· {modifiedStr}</span>}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
        {lastRefresh && <span>Fetched {Math.floor((now-lastRefresh)/1000)}s ago</span>}
        {nextRefresh && mode==="live" && <span>Next in {Math.max(0,Math.floor((nextRefresh-now)/1000))}s</span>}
        {mode==="live" && (
          <button onClick={onRefresh} disabled={isRefreshing} style={{
            background:isRefreshing?"rgba(255,255,255,0.03)":"rgba(52,211,153,0.1)",
            border:isRefreshing?"1px solid rgba(255,255,255,0.06)":"1px solid rgba(52,211,153,0.2)",
            color:isRefreshing?"#4a5568":"#34d399",
            padding:"3px 10px",borderRadius:"4px",fontSize:"10px",cursor:isRefreshing?"wait":"pointer",
            fontWeight:700,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.3px",transition:"all 0.15s",
          }}>
            {isRefreshing ? "REFRESHING..." : "↻ REFRESH NOW"}
          </button>
        )}
        {mode==="demo" && (
          <button onClick={onConnect} style={{background:"rgba(74,158,255,0.12)",border:"1px solid rgba(74,158,255,0.25)",color:"#4a9eff",padding:"3px 10px",borderRadius:"4px",fontSize:"10px",cursor:"pointer",fontWeight:700}}>
            {isConfigured() ? "SIGN IN" : "DEMO ONLY"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Operational Helpers ──────────────────────────────────────
function isStopLabel(name){ return /^stop\s*\d+$/i.test(String(name).trim()); }
// Placeholder / code tokens that appear in a crew column but aren't people.
// IOI recurs as the lone "crew" on certain jobs — a job-type marker, not a name.
function isPlaceholderToken(name){ return /^(ioi|tbd|open|n\/?a|xxx+)$/i.test(String(name).trim()); }
// A trailing driving qualifier: "-T", "-t", " -V", "-v" etc. This is a
// qualifier ON a real person's name (e.g. "Rich-t" = Rich, who's driving),
// NOT a marker that the token isn't a person.
const DRIVER_SUFFIX=/\s*-\s*[tvTV]\s*$/;
function hasDriverTag(name){ return DRIVER_SUFFIX.test(String(name).trim()); }
// Strip the driver suffix and any trailing "(1)" trip-count to get the
// name as it appears on the roster. "Rich -T" -> "Rich", "Pat-T (2)" -> "Pat".
function canonicalName(name){
  return String(name).trim()
    .replace(/\s*\(\s*\d+\s*\)\s*$/,"")   // trailing trip count "(2)"
    .replace(DRIVER_SUFFIX,"")             // trailing driver qualifier
    .trim();
}
// True only for tokens that are NOT people at all: stop labels, or a bare
// qualifier with no name in front of it. "Rich-t" is a person and returns false.
function isDriverTag(name){ return /^-\s*[tvTV]$/.test(String(name).trim()); }
function isNonPerson(name){
  const s=String(name).trim();
  if(isStopLabel(s)) return true;
  if(isDriverTag(s)) return true;            // bare "-T"
  if(isPlaceholderToken(s)) return true;     // IOI, TBD, etc.
  if(canonicalName(s)==="") return true;     // nothing left after stripping
  return false;
}

// Parse onsite times like "6am", "6:30am", "2pm", "14:00" into minutes-after-midnight
function parseTimeToMinutes(t){
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
function isOvertimeStart(t){
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
function jobIdentity(job){
  const po=job.poJob?String(job.poJob).trim():"";
  return po?`po:${po.toLowerCase()}`:`cust:${String(job.customer||"").trim().toLowerCase()}`;
}
function prevWeekSatKey(satKey){
  if(!satKey) return null;
  const d=new Date(satKey+'T12:00:00');
  d.setDate(d.getDate()-7);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// Returns the array of jobs to compare "today" against, or null if the
// needed data isn't loaded (so callers can skip rather than false-flag).
function getCompareJobs(dayName,weeksCache,curSatKey){
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
function getNewJobIds(dayName,weeksCache,curSatKey){
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
function isNewJob(job,newIds){ return newIds.has(`${job.num}::${jobIdentity(job)}`); }

// Map: person name -> set of job identities they were on, for a job list.
function personJobMap(jobs){
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
function getMovedCrew(dayName,weeksCache,curSatKey){
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
function jobSlot(job){ return isOvertimeStart(job.onsiteTime)?"ot":"am"; }
function getConflictsForDay(dayData){
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

// ── Jobs Table ───────────────────────────────────────────────
function JobsTable({dayData,flashedJobs,weeksCache,curSatKey}){
  const isMobile=useIsMobile();
  const [hlPerson,setHlPerson]=useState(null);
  const [query,setQuery]=useState("");
  useEffect(()=>{setHlPerson(null);},[dayData?.day]);
  if(!dayData?.jobs?.length) return <div style={{padding:"50px",textAlign:"center",color:"#444",fontStyle:"italic"}}>No jobs scheduled.</div>;
  const jobs=dayData.jobs;
  const newIds=getNewJobIds(dayData.day,weeksCache,curSatKey); // jobs whose # isn't on the compare day
  const movedCrew=getMovedCrew(dayData.day,weeksCache,curSatKey); // people newly on a job vs compare day
  // Foremen come from today's parsed roster (bold names in the sheet), so renames just work
  const foremanKeys=Object.keys(dayData.crews||{});
  const foremanIdx=new Map(foremanKeys.map((f,i)=>[f,i]));
  const isForeman=n=>foremanIdx.has(n)||FOREMAN_ORDER.includes(n);
  const colorOf=n=>foremanColor(n,foremanIdx.has(n)?foremanIdx.get(n):FOREMAN_ORDER.indexOf(n));
  const togglePerson=n=>setHlPerson(p=>p===n?null:n);
  const multiJobs=getConflictsForDay(dayData); // people on more than one job today (informational, not a conflict)
  const multiCounts=new Map(multiJobs.map(c=>[c.name,c.count]));
  // Search filter: matches customer, location, PO, PM, or any crew name
  const q=query.trim().toLowerCase();
  const matchesQuery=j=>!q||[j.customer,j.location,j.poJob,j.calledIn,...(j.crew||[])]
    .some(v=>v&&String(v).toLowerCase().includes(q));
  const visibleJobs=jobs.filter(matchesQuery);
  // Cancelled (struck-through in the sheet) jobs group at the very bottom;
  // active jobs split into regular then overtime, keeping sheet order in each group
  const activeAll=jobs.filter(j=>!j.cancelled);
  const regularJobs=visibleJobs.filter(j=>!j.cancelled&&!isOvertimeStart(j.onsiteTime));
  const otJobs=visibleJobs.filter(j=>!j.cancelled&&isOvertimeStart(j.onsiteTime));
  const cancelledJobs=visibleJobs.filter(j=>j.cancelled);
  const orderedJobs=[...regularJobs,...otJobs,...cancelledJobs];
  const unassigned=activeAll.filter(j=>!j.crew?.length);
  // Headcount: only count real people (exclude stop labels and driver tags)
  const hcMismatches=activeAll.filter(j=>{
    if(j.numMen==null) return false;
    const persons=(j.crew||[]).filter(n=>!isNonPerson(n));
    return persons.length>0&&j.numMen!==persons.length;
  });
  const hasIssues=multiJobs.length>0||unassigned.length>0||hcMismatches.length>0;
  // Day totals — cancelled jobs don't count toward men/trucks/jobs
  const totalMen=activeAll.reduce((s,j)=>s+(j.numMen||0),0);
  const uniqueCrew=new Set(activeAll.flatMap(j=>(j.crew||[]).filter(n=>!isNonPerson(n)))).size;
  const totalTrucks=activeAll.filter(j=>j.trucks&&!/^(na|n\/a)$/i.test(j.trucks.trim())).length;
  // Folder status counts (column N): "y"=needed, "sm"/"sm-half"=done by Stephanie.
  const foldersNeeded=activeAll.filter(j=>(j.jobFolder||"")==="y").length;
  const foldersDone=activeAll.filter(j=>{const v=j.jobFolder||"";return v==="sm"||v==="sm-half";}).length;
  return(
    <div>
      {/* Search / filter */}
      <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"12px"}}>
        <div style={{flex:1,maxWidth:isMobile?"none":"340px",position:"relative"}}>
          <span style={{position:"absolute",left:"11px",top:"50%",transform:"translateY(-50%)",fontSize:"13px",opacity:0.5,pointerEvents:"none"}}>🔍</span>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a name, customer, location…"
            style={{width:"100%",boxSizing:"border-box",padding:isMobile?"11px 34px 11px 34px":"8px 32px 8px 34px",borderRadius:"8px",
              background:"rgba(255,255,255,0.04)",border:q?"1px solid rgba(74,158,255,0.4)":"1px solid rgba(255,255,255,0.08)",
              color:"#e2e8f0",fontSize:isMobile?"16px":"12px",fontFamily:"inherit",outline:"none"}}/>
          {q&&<button onClick={()=>setQuery("")} style={{position:"absolute",right:"6px",top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,0.08)",border:"none",borderRadius:"50%",width:"20px",height:"20px",color:"#9ca3af",cursor:"pointer",fontSize:"11px",lineHeight:1}}>✕</button>}
        </div>
        {q&&<span style={{fontSize:"11px",color:"#7a8599",fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>
          <b style={{color:"#4a9eff"}}>{visibleJobs.length}</b> of {jobs.length}
        </span>}
      </div>
      {q&&visibleJobs.length===0&&<div style={{padding:"30px",textAlign:"center",color:"#4a5568",fontStyle:"italic",fontSize:"13px"}}>Nothing matches "{query}" on {dayData.day}.</div>}
      {hasIssues&&(
        <div style={{display:"flex",flexDirection:"column",gap:"5px",marginBottom:"14px"}}>
          {multiJobs.length>0&&(
            <div style={{padding:"7px 12px",borderRadius:"6px",background:"rgba(56,189,248,0.06)",border:"1px solid rgba(56,189,248,0.18)",fontSize:"11px",lineHeight:1.7}}>
              <span style={{fontWeight:800,color:"#38bdf8",marginRight:"8px",letterSpacing:"0.5px"}}>⇄ ON MULTIPLE JOBS</span>
              {multiJobs.map((c,i)=>(
                <span key={i}>
                  <button onClick={()=>togglePerson(c.name)} style={{background:hlPerson===c.name?"rgba(56,189,248,0.2)":"transparent",border:"none",borderRadius:"3px",padding:"0 4px",color:"#7dd3fc",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:"11px",textDecoration:hlPerson===c.name?"none":"underline",textDecorationStyle:"dotted",textUnderlineOffset:"3px"}}>{c.name}</button>
                  <span style={{color:"#4a5568"}}> on </span>
                  {c.jobs.map((j,ji)=><span key={ji}><span style={{color:"#e2e8f0"}}>{j.customer}</span>{ji<c.jobs.length-1&&<span style={{color:"#4a5568"}}> & </span>}</span>)}
                  {i<multiJobs.length-1&&<span style={{margin:"0 10px",color:"#2d3748"}}>·</span>}
                </span>
              ))}
              {hlPerson&&<button onClick={()=>setHlPerson(null)} style={{marginLeft:"12px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:"3px",padding:"1px 8px",color:"#9ca3af",cursor:"pointer",fontFamily:"inherit",fontSize:"10px",fontWeight:700}}>✕ CLEAR</button>}
            </div>
          )}
          {unassigned.length>0&&(
            <div style={{padding:"7px 12px",borderRadius:"6px",background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.18)",fontSize:"11px",lineHeight:1.7}}>
              <span style={{fontWeight:800,color:"#f59e0b",marginRight:"8px",letterSpacing:"0.5px"}}>⚠ NO CREW ASSIGNED</span>
              {unassigned.map((j,i)=>(
                <span key={i}>
                  <span style={{color:"#e2e8f0",fontWeight:600}}>#{j.num} {j.customer}</span>
                  {i<unassigned.length-1&&<span style={{margin:"0 10px",color:"#2d3748"}}>·</span>}
                </span>
              ))}
            </div>
          )}
          {hcMismatches.length>0&&(
            <div style={{padding:"7px 12px",borderRadius:"6px",background:"rgba(251,146,60,0.07)",border:"1px solid rgba(251,146,60,0.18)",fontSize:"11px",lineHeight:1.7}}>
              <span style={{fontWeight:800,color:"#fb923c",marginRight:"8px",letterSpacing:"0.5px"}}>⚠ HEADCOUNT MISMATCH</span>
              {hcMismatches.map((j,i)=>{
                const persons=(j.crew||[]).filter(n=>!isNonPerson(n));
                return(
                  <span key={i}>
                    <span style={{color:"#e2e8f0",fontWeight:600}}>#{j.num} {j.customer}</span>
                    <span style={{color:"#4a5568",fontFamily:"'JetBrains Mono',monospace"}}> ({j.numMen} listed / {persons.length} named)</span>
                    {i<hcMismatches.length-1&&<span style={{margin:"0 10px",color:"#2d3748"}}>·</span>}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
      {isMobile?(
        <>
          <MobileJobCards orderedJobs={orderedJobs} otJobs={otJobs} regularJobs={regularJobs} cancelledJobs={cancelledJobs} dayData={dayData} multiCounts={multiCounts} hlPerson={hlPerson} togglePerson={togglePerson} isForeman={isForeman} colorOf={colorOf} flashedJobs={flashedJobs} newIds={newIds} movedCrew={movedCrew}/>
          <div style={{marginTop:"10px",padding:"8px 12px",borderRadius:"6px",background:"rgba(255,255,255,0.02)",fontSize:"11px",color:"#7a8599",fontFamily:"'JetBrains Mono',monospace",display:"flex",gap:"12px",flexWrap:"wrap"}}>
            <span><b style={{color:"#e8a948"}}>{totalMen}</b> men</span>
            <span><b style={{color:"#e2e8f0"}}>{uniqueCrew}</b> unique</span>
            <span><b style={{color:"#e2e8f0"}}>{activeAll.length}</b> jobs</span>
            {otJobs.length>0&&<span><b style={{color:"#facc15"}}>{otJobs.length}</b> OT</span>}
            {cancelledJobs.length>0&&<span><b style={{color:"#ef4444"}}>{cancelledJobs.length}</b> cancelled</span>}
            <span><b style={{color:"#10b981"}}>{totalTrucks}</b> w/ truck</span>
            {foldersNeeded>0&&<span><b style={{color:"#f59e0b"}}>{foldersNeeded}</b> folder{foldersNeeded===1?"":"s"} needed</span>}
            {foldersDone>0&&<span><b style={{color:"#10b981"}}>{foldersDone}</b> folder{foldersDone===1?"":"s"} done</span>}
          </div>
        </>
      ):(
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"13px"}}>
          <thead><tr style={{borderBottom:"2px solid #1a2436"}}>
            {["#","Customer","PO / Job#","Location","Onsite","Trucks","Men","Crew","PM","Folder"].map(h=>
              <th key={h} style={{padding:"10px 8px",textAlign:"left",fontSize:"9px",fontWeight:800,letterSpacing:"1.2px",color:"#4a5568",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
            )}
          </tr></thead>
          <tbody>{orderedJobs.map((job,i)=>{
            const isCancelled=!!job.cancelled;
            const noCrewFlag=!isCancelled&&!job.crew?.length;
            const persons=(job.crew||[]).filter(n=>!isNonPerson(n));
            const hcFlag=!isCancelled&&job.numMen!=null&&persons.length>0&&job.numMen!==persons.length;
            const isFlashed=flashedJobs?.has(`${dayData.day}-${job.num}`);
            const pmColor=PM_COLORS[(job.calledIn||'').toUpperCase()];
            const isOT=!isCancelled&&isOvertimeStart(job.onsiteTime);
            const isNew=!isCancelled&&isNewJob(job,newIds);
            const firstOT=isOT&&otJobs.length>0&&job===otJobs[0]&&regularJobs.length>0;
            const firstCancelled=isCancelled&&job===cancelledJobs[0];
            const onHlJob=hlPerson?(job.crew||[]).some(c=>canonicalName(c).toLowerCase()===hlPerson.toLowerCase()):false;
            const rowBg=isCancelled?"rgba(239,68,68,0.06)":onHlJob?"rgba(56,189,248,0.10)":isOT?"rgba(250,204,21,0.09)":noCrewFlag?"rgba(245,158,11,0.05)":i%2?"rgba(255,255,255,0.012)":"transparent";
            const hoverBg=isCancelled?"rgba(239,68,68,0.10)":onHlJob?"rgba(56,189,248,0.16)":isOT?"rgba(250,204,21,0.16)":"rgba(74,158,255,0.04)";
            const rowOpacity=isCancelled?0.75:hlPerson&&!onHlJob?0.3:1;
            return(
              <Fragment key={`${job.num}-${i}`}>
              {firstOT&&(
                <tr><td colSpan={10} style={{padding:"14px 8px 6px",fontSize:"9px",fontWeight:800,letterSpacing:"1.5px",color:"#facc15",borderBottom:"1px solid rgba(250,204,21,0.25)"}}>
                  ⏱ OVERTIME — starts before 6:00 AM or 2:00 PM &amp; later
                </td></tr>
              )}
              {firstCancelled&&(
                <tr><td colSpan={10} style={{padding:"14px 8px 6px",fontSize:"9px",fontWeight:800,letterSpacing:"1.5px",color:"#ef4444",borderBottom:"1px solid rgba(239,68,68,0.25)"}}>
                  ✕ CANCELLED — struck through in the log book
                </td></tr>
              )}
              <tr className={isFlashed?"job-flash":""} style={{borderBottom:"1px solid rgba(255,255,255,0.03)",background:rowBg,transition:"background 0.12s, opacity 0.15s",opacity:rowOpacity,boxShadow:onHlJob?"inset 0 0 0 1px rgba(56,189,248,0.35)":"none"}}
                onMouseEnter={e=>e.currentTarget.style.background=hoverBg}
                onMouseLeave={e=>e.currentTarget.style.background=rowBg}>
                <td style={{padding:"10px 8px",fontWeight:800,color:isCancelled?"#ef4444":isOT?"#facc15":"#4a9eff",fontFamily:"'JetBrains Mono',monospace",borderLeft:`3px solid ${isCancelled?"#ef4444":isOT?"#facc15":pmColor||"transparent"}`}}>{job.num}</td>
                <td style={{padding:"10px 8px",fontWeight:700,color:isCancelled?"#f87171":"#e2e8f0",maxWidth:"150px",textDecoration:isCancelled?"line-through":"none"}}>
                  {job.customer}
                  {isNew&&<span title="Job # not on the previous day — may need a new Teams chat" style={{marginLeft:"6px",fontSize:"8px",fontWeight:800,letterSpacing:"0.5px",padding:"1px 5px",borderRadius:"3px",background:"rgba(16,185,129,0.15)",color:"#10b981",border:"1px solid rgba(16,185,129,0.45)",textDecoration:"none",display:"inline-block",verticalAlign:"middle"}}>NEW</span>}
                  {isCancelled&&<span style={{marginLeft:"6px",fontSize:"8px",fontWeight:800,letterSpacing:"0.5px",padding:"1px 5px",borderRadius:"3px",background:"rgba(239,68,68,0.15)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.4)",textDecoration:"none",display:"inline-block"}}>CANCELLED</span>}
                </td>
                <td style={{padding:"10px 8px",color:"#7a8599",fontFamily:"'JetBrains Mono',monospace",fontSize:"11px"}}>{job.poJob||"—"}</td>
                <td style={{padding:"10px 8px",color:"#7a8599",maxWidth:"190px",fontSize:"12px"}}>{job.location||"—"}</td>
                <td style={{padding:"10px 8px",fontWeight:700,color:isOT?"#facc15":"#e8a948",whiteSpace:"nowrap",fontFamily:"'JetBrains Mono',monospace",fontSize:"12px"}}>
                  {job.onsiteTime||"TBD"}
                  {isOT&&<span style={{marginLeft:"5px",fontSize:"8px",fontWeight:800,letterSpacing:"0.5px",padding:"1px 5px",borderRadius:"3px",background:"rgba(250,204,21,0.18)",color:"#facc15",border:"1px solid rgba(250,204,21,0.35)"}}>OT</span>}
                </td>
                <td style={{padding:"10px 8px",color:"#7a8599",fontSize:"12px"}}>{job.trucks||"—"}</td>
                <td style={{padding:"10px 8px",fontWeight:800,textAlign:"center",fontSize:"15px"}}>
                  <span style={{color:hcFlag?"#fb923c":job.numMen>=5?"#f472b6":"#e2e8f0"}}>{job.numMen||"—"}</span>
                  {hcFlag&&<div style={{fontSize:"8px",color:"#fb923c",fontWeight:700,lineHeight:1.2}}>{persons.length} named</div>}
                </td>
                <td style={{padding:"10px 8px",maxWidth:"300px"}}>
                  {noCrewFlag
                    ?<span style={{color:"#4a5568",fontStyle:"italic",fontSize:"11px"}}>— none assigned —</span>
                    :<div style={{display:"flex",flexWrap:"wrap",gap:"3px",alignItems:"center"}}>
                      {(job.crew||[]).map((n,j)=>{
                        if(isStopLabel(n)) return <span key={j} style={{fontSize:"9px",fontWeight:700,letterSpacing:"0.5px",color:"#2d3748",padding:"1px 5px",borderRadius:"3px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)"}}>{n.toUpperCase()}</span>;
                        if(isDriverTag(n)) return null; // bare "-T" with no name: skip
                        const cn=canonicalName(n);       // "Rich-t" -> "Rich"
                        const isDrv=hasDriverTag(n);     // still show a driver indicator
                        const isF=isForeman(cn); const fc=isF?colorOf(cn):null;
                        const multiCount=multiCounts.get(cn);
                        const isHl=hlPerson===cn;
                        const hasMoved=movedCrew.has(cn);
                        const chip=<span style={{display:"inline-block",padding:"2px 7px",borderRadius:"4px",fontSize:"11px",
                          background:isHl?"rgba(56,189,248,0.2)":hasMoved?"rgba(16,185,129,0.12)":isDrv?"rgba(139,92,246,0.08)":isF?`${fc}18`:"rgba(255,255,255,0.05)",
                          color:isF?fc:hasMoved?"#34d399":isDrv?"#8b5cf6":"#9ca3af",
                          fontWeight:isF?700:hasMoved?600:400,
                          border:isHl?"1px solid rgba(56,189,248,0.7)":hasMoved?"1px solid rgba(16,185,129,0.5)":multiCount?"1px solid rgba(56,189,248,0.45)":isDrv?"1px solid rgba(139,92,246,0.2)":isF?`1px solid ${fc}35`:"1px solid transparent"
                        }} title={isDrv?"Driver":hasMoved?"Moved to a different job vs the day before":undefined}>{hasMoved&&<span style={{marginRight:"3px",fontSize:"9px",color:"#10b981"}}>➜</span>}{cn}{isDrv&&<span style={{marginLeft:"3px",fontSize:"8px",color:"#8b5cf6",fontWeight:700}} title="Driver">D</span>}{multiCount&&<span style={{marginLeft:"4px",fontSize:"9px",fontWeight:800,color:"#38bdf8"}}>×{multiCount}</span>}</span>;
                        if(multiCount) return <button key={j} onClick={()=>togglePerson(cn)} title={isHl?"Click to clear highlight":`On ${multiCount} jobs in the same slot today — click to highlight`} style={{background:"transparent",border:"none",padding:0,cursor:"pointer",fontFamily:"inherit"}}>{chip}</button>;
                        return <Fragment key={j}>{chip}</Fragment>;
                      })}
                    </div>
                  }
                </td>
                <td style={{padding:"10px 8px",textAlign:"center"}}><PMBadge initials={job.calledIn}/></td>
                <td style={{padding:"10px 8px",textAlign:"center"}}><FolderIcon val={job.jobFolder}/></td>
              </tr>
              </Fragment>
            );
          })}</tbody>
          <tfoot>
            <tr style={{borderTop:"2px solid #1a2436",background:"rgba(255,255,255,0.02)"}}>
              <td colSpan={6} style={{padding:"8px 8px",fontSize:"9px",fontWeight:800,letterSpacing:"1.2px",color:"#4a5568",textTransform:"uppercase"}}>Totals</td>
              <td style={{padding:"8px",fontWeight:800,textAlign:"center",fontSize:"16px",color:"#e8a948"}}>{totalMen}</td>
              <td style={{padding:"8px",fontSize:"11px",color:"#7a8599",fontFamily:"'JetBrains Mono',monospace"}}>
                <span style={{color:"#e2e8f0",fontWeight:600}}>{uniqueCrew}</span> unique · <span style={{color:"#e2e8f0",fontWeight:600}}>{activeAll.length}</span> jobs{otJobs.length>0&&<> · <span style={{color:"#facc15",fontWeight:600}}>{otJobs.length}</span> OT</>}{cancelledJobs.length>0&&<> · <span style={{color:"#ef4444",fontWeight:600}}>{cancelledJobs.length}</span> cancelled</>} · <span style={{color:"#10b981",fontWeight:600}}>{totalTrucks}</span> w/ truck{foldersNeeded>0&&<> · <span style={{color:"#f59e0b",fontWeight:600}}>{foldersNeeded}</span> folder{foldersNeeded===1?"":"s"} needed</>}{foldersDone>0&&<> · <span style={{color:"#10b981",fontWeight:600}}>{foldersDone}</span> done</>}
              </td>
              <td colSpan={2}/>
            </tr>
          </tfoot>
        </table>
      </div>
      )}
    </div>
  );
}

// ── Mobile job cards (replaces the wide table on phones) ─────
function MobileJobCards({orderedJobs,otJobs,regularJobs,cancelledJobs,dayData,multiCounts,hlPerson,togglePerson,isForeman,colorOf,flashedJobs,newIds,movedCrew}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
      {orderedJobs.map((job,i)=>{
        const isCancelled=!!job.cancelled;
        const isOT=!isCancelled&&isOvertimeStart(job.onsiteTime);
        const isNew=!isCancelled&&isNewJob(job,newIds);
        const firstOT=isOT&&otJobs.length>0&&job===otJobs[0]&&regularJobs.length>0;
        const firstCancelled=isCancelled&&cancelledJobs?.length>0&&job===cancelledJobs[0];
        const onHlJob=hlPerson?(job.crew||[]).includes(hlPerson):false;
        const isFlashed=flashedJobs?.has(`${dayData.day}-${job.num}`);
        const pmColor=PM_COLORS[(job.calledIn||"").toUpperCase()];
        return(
          <Fragment key={`${job.num}-${i}`}>
            {firstOT&&<div style={{padding:"10px 4px 2px",fontSize:"9px",fontWeight:800,letterSpacing:"1.5px",color:"#facc15"}}>⏱ OVERTIME — before 6:00 AM or 2:00 PM &amp; later</div>}
            {firstCancelled&&<div style={{padding:"10px 4px 2px",fontSize:"9px",fontWeight:800,letterSpacing:"1.5px",color:"#ef4444"}}>✕ CANCELLED — struck through in the log book</div>}
            <div className={isFlashed?"job-flash":""} style={{
              padding:"12px",borderRadius:"10px",
              background:isCancelled?"rgba(239,68,68,0.06)":onHlJob?"rgba(56,189,248,0.10)":isOT?"rgba(250,204,21,0.07)":"rgba(255,255,255,0.025)",
              border:isCancelled?"1px solid rgba(239,68,68,0.3)":onHlJob?"1px solid rgba(56,189,248,0.4)":isOT?"1px solid rgba(250,204,21,0.25)":"1px solid rgba(255,255,255,0.06)",
              borderLeft:`4px solid ${isCancelled?"#ef4444":isOT?"#facc15":pmColor||"rgba(255,255,255,0.1)"}`,
              opacity:isCancelled?0.75:hlPerson&&!onHlJob?0.35:1,transition:"opacity 0.15s"}}>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:"8px",flexWrap:"wrap"}}>
                <div style={{fontSize:"15px",fontWeight:800,color:isCancelled?"#f87171":"#e2e8f0",textDecoration:isCancelled?"line-through":"none"}}>
                  <span style={{color:isCancelled?"#ef4444":isOT?"#facc15":"#4a9eff",fontFamily:"'JetBrains Mono',monospace",marginRight:"7px"}}>#{job.num}</span>
                  {job.customer}
                  {isNew&&<span style={{marginLeft:"6px",fontSize:"8px",fontWeight:800,letterSpacing:"0.5px",padding:"1px 5px",borderRadius:"3px",background:"rgba(16,185,129,0.15)",color:"#10b981",border:"1px solid rgba(16,185,129,0.45)",textDecoration:"none",display:"inline-block",verticalAlign:"middle"}}>NEW</span>}
                  {isCancelled&&<span style={{marginLeft:"6px",fontSize:"8px",fontWeight:800,letterSpacing:"0.5px",padding:"1px 5px",borderRadius:"3px",background:"rgba(239,68,68,0.15)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.4)",textDecoration:"none",display:"inline-block",verticalAlign:"middle"}}>CANCELLED</span>}
                </div>
                <div style={{fontSize:"14px",fontWeight:800,color:isOT?"#facc15":"#e8a948",fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>
                  {job.onsiteTime||"TBD"}
                  {isOT&&<span style={{marginLeft:"5px",fontSize:"8px",fontWeight:800,padding:"1px 5px",borderRadius:"3px",background:"rgba(250,204,21,0.18)",color:"#facc15",border:"1px solid rgba(250,204,21,0.35)",verticalAlign:"middle"}}>OT</span>}
                </div>
              </div>
              {job.location&&<div style={{fontSize:"12px",color:"#7a8599",marginTop:"3px"}}>{job.location}</div>}
              <div style={{display:"flex",gap:"12px",marginTop:"6px",fontSize:"11px",color:"#6b7789",fontFamily:"'JetBrains Mono',monospace",flexWrap:"wrap"}}>
                {job.poJob&&<span>PO {job.poJob}</span>}
                {job.trucks&&<span>🚚 {job.trucks}</span>}
                {job.numMen!=null&&<span style={{color:"#f472b6",fontWeight:700}}>{job.numMen} men</span>}
                {job.jobFolder&&<span style={{display:"inline-flex",alignItems:"center",gap:"4px"}}><span style={{fontSize:"10px",color:"#4a5568"}}>Folder</span><FolderIcon val={job.jobFolder}/></span>}
                <span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:"6px"}}><PMBadge initials={job.calledIn}/>{!job.jobFolder&&<FolderIcon val={job.jobFolder}/>}</span>
              </div>
              {(job.crew||[]).length>0&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:"4px",marginTop:"8px"}}>
                  {(job.crew||[]).map((n,j)=>{
                    if(isStopLabel(n)) return <span key={j} style={{fontSize:"9px",fontWeight:700,color:"#2d3748",padding:"2px 6px",borderRadius:"3px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)"}}>{n.toUpperCase()}</span>;
                    if(isDriverTag(n)) return null; // bare "-T"
                    const cn=canonicalName(n); const isDrv=hasDriverTag(n);
                    const isF=isForeman(cn); const fc=isF?colorOf(cn):null;
                    const mc=multiCounts.get(cn); const isHl=hlPerson===cn;
                    const hasMoved=movedCrew?.has(cn);
                    const chip=<span style={{display:"inline-block",padding:"3px 9px",borderRadius:"5px",fontSize:"12px",
                      background:isHl?"rgba(56,189,248,0.2)":hasMoved?"rgba(16,185,129,0.12)":isDrv?"rgba(139,92,246,0.08)":isF?`${fc}18`:"rgba(255,255,255,0.05)",
                      color:isF?fc:hasMoved?"#34d399":isDrv?"#8b5cf6":"#9ca3af",fontWeight:isF?700:hasMoved?600:400,
                      border:isHl?"1px solid rgba(56,189,248,0.7)":hasMoved?"1px solid rgba(16,185,129,0.5)":mc?"1px solid rgba(56,189,248,0.45)":isDrv?"1px solid rgba(139,92,246,0.2)":isF?`1px solid ${fc}35`:"1px solid transparent"}}>
                      {hasMoved&&<span style={{marginRight:"3px",fontSize:"10px",color:"#10b981"}}>➜</span>}{cn}{isDrv&&<span style={{marginLeft:"3px",fontSize:"9px",color:"#8b5cf6",fontWeight:700}} title="Driver">D</span>}{mc&&<span style={{marginLeft:"4px",fontSize:"10px",fontWeight:800,color:"#38bdf8"}}>×{mc}</span>}</span>;
                    return mc?<button key={j} onClick={()=>togglePerson(cn)} style={{background:"transparent",border:"none",padding:0,cursor:"pointer",fontFamily:"inherit"}}>{chip}</button>:<Fragment key={j}>{chip}</Fragment>;
                  })}
                </div>
              )}
              {!job.crew?.length&&<div style={{marginTop:"8px",fontSize:"11px",fontStyle:"italic",color:"#f59e0b"}}>— no crew assigned —</div>}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

// ── TV / Kiosk Mode ──────────────────────────────────────────
const TV_ROTATE_MS=25000;
function TVClock(){
  const [now,setNow]=useState(new Date());
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t);},[]);
  return <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"4vh",fontWeight:800,color:"#e2e8f0"}}>{now.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</span>;
}
function TVMode({data,onExit,fileMeta,error,isRefreshing}){
  const [view,setView]=useState(0);
  const [paused,setPaused]=useState(false);
  useEffect(()=>{
    if(paused) return;
    const t=setInterval(()=>setView(v=>(v+1)%2),TV_ROTATE_MS);
    return()=>clearInterval(t);
  },[paused]);
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onExit();};
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[onExit]);
  const today=getTodayDayName();
  const d=data[today];
  const jobs=d?.jobs||[];
  const active=jobs.filter(j=>!j.cancelled);
  const regular=active.filter(j=>!isOvertimeStart(j.onsiteTime));
  const ot=active.filter(j=>isOvertimeStart(j.onsiteTime));
  const cancelled=jobs.filter(j=>j.cancelled);
  const ordered=[...regular,...ot,...cancelled];
  const totalMen=active.reduce((s,j)=>s+(j.numMen||0),0);
  // Density tiers: shrink rows as the day fills up so more fits on screen
  const n=ordered.length;
  const dense=n>8;
  const rowFont=n>12?"1.9vh":n>8?"2.1vh":"2.6vh";
  const subFont=n>12?"1.7vh":dense?"1.8vh":"2.1vh";
  const cellPad=n>12?"0.85vh 0.8vw":"1.4vh 0.8vw";

  // Kiosk auto-scroll: when the job list still overflows, hold at the top,
  // glide down slowly, hold at the bottom, then return to the top and repeat.
  // Tapping the screen pauses (same tap that pauses view rotation).
  const scrollRef=useRef(null);
  useEffect(()=>{
    const el=scrollRef.current;
    if(!el||paused||view!==0) return;
    let stop=false,raf=0,tmo=0;
    const HOLD=5000;                       // dwell at top/bottom (ms)
    const pxPerMs=el.clientHeight/15000;   // one screen height per ~15s
    const cycle=()=>{
      if(stop)return;
      const max=el.scrollHeight-el.clientHeight;
      if(max<=6){tmo=setTimeout(cycle,4000);return;} // everything fits — nothing to do
      let last=null;
      const down=ts=>{
        if(stop)return;
        if(last==null)last=ts;
        el.scrollTop=Math.min(el.scrollTop+(ts-last)*pxPerMs,max);
        last=ts;
        if(el.scrollTop>=max-1){
          tmo=setTimeout(()=>{
            if(stop)return;
            el.scrollTo({top:0,behavior:"smooth"});
            tmo=setTimeout(cycle,1500);
          },HOLD);
        } else raf=requestAnimationFrame(down);
      };
      tmo=setTimeout(()=>{raf=requestAnimationFrame(down);},HOLD);
    };
    el.scrollTop=0;
    cycle();
    return()=>{stop=true;cancelAnimationFrame(raf);clearTimeout(tmo);};
  },[paused,view,n,today]);
  return(
    <div style={{position:"fixed",inset:0,background:"#0a0f16",color:"#e2e8f0",fontFamily:"'Inter',-apple-system,sans-serif",display:"flex",flexDirection:"column",zIndex:1000,overflow:"hidden"}}>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} .tv-scroll{scrollbar-width:none;-ms-overflow-style:none} .tv-scroll::-webkit-scrollbar{display:none}`}</style>
      {/* TV header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"2vh 3vw",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:"2vw"}}>
          <span style={{fontSize:"4.5vh",fontWeight:900,letterSpacing:"-1px"}}>{today.toUpperCase()}</span>
          <span style={{fontSize:"2.6vh",color:"#6b7789",fontFamily:"'JetBrains Mono',monospace"}}>{d?.date?formatDate(d.date):""}</span>
          <span style={{fontSize:"2.2vh",color:error?"#ef4444":"#10b981"}}>
            <span style={{display:"inline-block",width:"1.4vh",height:"1.4vh",borderRadius:"50%",background:error?"#ef4444":"#10b981",marginRight:"0.7vw",animation:isRefreshing?"spin 1s linear infinite":"none"}}/>
            {error?"OFFLINE":"LIVE"}
          </span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"2vw"}}>
          <div style={{display:"flex",gap:"1.5vw",fontSize:"2.4vh",fontFamily:"'JetBrains Mono',monospace"}}>
            <span><b style={{color:"#4a9eff"}}>{active.length}</b> <span style={{color:"#4a5568"}}>JOBS</span></span>
            <span><b style={{color:"#e8a948"}}>{totalMen}</b> <span style={{color:"#4a5568"}}>MEN</span></span>
            <span><b style={{color:"#10b981"}}>{active.filter(j=>j.trucks&&!/^(na|n\/a)$/i.test(String(j.trucks).trim())).length}</b> <span style={{color:"#4a5568"}}>TRUCKS</span></span>
            {ot.length>0&&<span><b style={{color:"#facc15"}}>{ot.length}</b> <span style={{color:"#4a5568"}}>OT</span></span>}
            {cancelled.length>0&&<span><b style={{color:"#ef4444"}}>{cancelled.length}</b> <span style={{color:"#4a5568"}}>CANCELLED</span></span>}
          </div>
          <TVClock/>
          <button onClick={onExit} title="Exit TV mode (Esc)" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",color:"#9ca3af",borderRadius:"6px",padding:"0.8vh 1.2vw",fontSize:"1.8vh",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>✕</button>
        </div>
      </div>
      {/* View body */}
      <div ref={scrollRef} className="tv-scroll" style={{flex:1,overflow:"auto",padding:"2vh 3vw"}} onClick={()=>setPaused(p=>!p)}>
        {view===0?(
          jobs.length===0
            ? <div style={{textAlign:"center",paddingTop:"20vh",fontSize:"4vh",color:"#4a5568",fontStyle:"italic"}}>No jobs scheduled today.</div>
            : <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{borderBottom:"2px solid #1a2436"}}>
                  {["#","CUSTOMER","TIME","TRUCKS","LOCATION","CREW","PM"].map(h=>
                    <th key={h} style={{padding:"1vh 0.8vw",textAlign:"left",fontSize:"1.6vh",fontWeight:800,letterSpacing:"2px",color:"#4a5568"}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {ordered.map((job,i)=>{
                    const isCancelled=!!job.cancelled;
                    const isOT=!isCancelled&&isOvertimeStart(job.onsiteTime);
                    const firstOT=isOT&&ot.length>0&&job===ot[0]&&regular.length>0;
                    const firstCancelled=isCancelled&&job===cancelled[0];
                    return(
                      <Fragment key={i}>
                        {firstOT&&<tr><td colSpan={7} style={{padding:"2vh 0.8vw 0.8vh",fontSize:"1.8vh",fontWeight:800,letterSpacing:"2px",color:"#facc15",borderBottom:"2px solid rgba(250,204,21,0.35)"}}>⏱ OVERTIME</td></tr>}
                        {firstCancelled&&<tr><td colSpan={7} style={{padding:"2vh 0.8vw 0.8vh",fontSize:"1.8vh",fontWeight:800,letterSpacing:"2px",color:"#ef4444",borderBottom:"2px solid rgba(239,68,68,0.35)"}}>✕ CANCELLED</td></tr>}
                        <tr style={{borderBottom:"1px solid rgba(255,255,255,0.05)",background:isCancelled?"rgba(239,68,68,0.08)":isOT?"rgba(250,204,21,0.08)":i%2?"rgba(255,255,255,0.015)":"transparent",opacity:isCancelled?0.75:1}}>
                          <td style={{padding:cellPad,fontSize:rowFont,fontWeight:800,color:isCancelled?"#ef4444":isOT?"#facc15":"#4a9eff",fontFamily:"'JetBrains Mono',monospace"}}>{job.num}</td>
                          <td style={{padding:cellPad,fontSize:rowFont,fontWeight:800,color:isCancelled?"#f87171":undefined,textDecoration:isCancelled?"line-through":"none"}}>{job.customer}</td>
                          <td style={{padding:cellPad,fontSize:rowFont,fontWeight:800,color:isOT?"#facc15":"#e8a948",fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{job.onsiteTime||"TBD"}</td>
                          <td style={{padding:cellPad,fontSize:subFont,fontWeight:700,color:job.trucks&&!/^(na|n\/a)$/i.test(String(job.trucks).trim())?"#10b981":"#4a5568",fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{job.trucks||"—"}</td>
                          <td style={{padding:cellPad,fontSize:subFont,color:"#7a8599"}}>{job.location||"—"}</td>
                          <td style={{padding:cellPad,fontSize:subFont}}>
                            <span style={{color:"#cbd5e1"}}>{(job.crew||[]).filter(n=>!isStopLabel(n)).join("  ·  ")||"—"}</span>
                          </td>
                          <td style={{padding:cellPad}}><span style={{fontSize:"1.9vh",fontWeight:800,padding:"0.4vh 0.8vw",borderRadius:"5px",background:PM_COLORS[(job.calledIn||"").toUpperCase()]||"#2d3748",color:"#fff"}}>{(job.calledIn||"—").toUpperCase()}</span></td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"1vw",height:"100%",alignContent:"start"}}>
            {DAY_ORDER.map(dn=>{
              const dd=data[dn]; const act=(dd?.jobs||[]).filter(j=>!j.cancelled);
              const jc=act.length;
              const tm=act.reduce((s,j)=>s+(j.numMen||0),0);
              const oc=act.filter(j=>isOvertimeStart(j.onsiteTime)).length;
              const cc=(dd?.jobs||[]).length-jc;
              const isToday=dn===today;
              return(
                <div key={dn} style={{borderRadius:"12px",padding:"2.5vh 0.5vw",textAlign:"center",
                  background:isToday?"rgba(16,185,129,0.08)":"rgba(255,255,255,0.02)",
                  border:isToday?"2px solid rgba(16,185,129,0.45)":"1px solid rgba(255,255,255,0.06)"}}>
                  <div style={{fontSize:"2vh",fontWeight:800,letterSpacing:"2px",color:isToday?"#10b981":"#4a5568"}}>{dn.slice(0,3).toUpperCase()}</div>
                  <div style={{fontSize:"1.8vh",color:"#6b7789",margin:"0.6vh 0 1.5vh"}}>{formatDate(dd?.date)}</div>
                  <div style={{fontSize:"7vh",fontWeight:900,lineHeight:1}}>{jc}</div>
                  <div style={{fontSize:"1.5vh",color:"#4a5568",letterSpacing:"1px"}}>{jc===1?"JOB":"JOBS"}</div>
                  <div style={{fontSize:"2.6vh",color:"#e8a948",fontWeight:800,marginTop:"1.5vh",fontFamily:"'JetBrains Mono',monospace"}}>{tm}<span style={{fontSize:"1.4vh",color:"#4a5568"}}> MEN</span></div>
                  {oc>0&&<div style={{fontSize:"1.9vh",fontWeight:800,color:"#facc15",marginTop:"1vh"}}>⏱ {oc} OT</div>}
                  {cc>0&&<div style={{fontSize:"1.9vh",fontWeight:800,color:"#ef4444",marginTop:"1vh"}}>✕ {cc} CANC</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Footer: rotation dots + file info */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"1.2vh 3vw",borderTop:"1px solid rgba(255,255,255,0.07)",fontSize:"1.7vh",color:"#4a5568",fontFamily:"'JetBrains Mono',monospace"}}>
        <span>{fileMeta?.lastModified?`File saved ${new Date(fileMeta.lastModified).toLocaleTimeString()}`:""}{error?` · ${error}`:""}</span>
        <div style={{display:"flex",alignItems:"center",gap:"1vw"}}>
          {paused&&<span style={{color:"#f59e0b"}}>⏸ PAUSED — tap to resume</span>}
          {[0,1].map(v=>
            <button key={v} onClick={()=>{setView(v);setPaused(true);}} style={{width:"1.6vh",height:"1.6vh",borderRadius:"50%",border:"none",cursor:"pointer",background:view===v?"#4a9eff":"rgba(255,255,255,0.12)"}}/>
          )}
          <span>{view===0?"TODAY":"WEEK"}</span>
        </div>
      </div>
    </div>
  );
}

// ── Change Log ───────────────────────────────────────────────
const CHANGELOG_KEY="hub-dash-changelog";
function loadChangeLog(){
  try{const v=JSON.parse(localStorage.getItem(CHANGELOG_KEY));return Array.isArray(v)?v:[];}catch{return[];}
}
function saveChangeLog(log){
  try{localStorage.setItem(CHANGELOG_KEY,JSON.stringify(log.slice(0,100)));}catch{/* storage unavailable */}
}
function diffJobFields(oj,nj){
  const parts=[];
  if(!!oj.cancelled!==!!nj.cancelled) parts.push(nj.cancelled?"✕ CANCELLED (struck through)":"reinstated (strike removed)");
  if(oj.customer!==nj.customer) parts.push(`customer "${oj.customer}" → "${nj.customer}"`);
  if(oj.onsiteTime!==nj.onsiteTime) parts.push(`time ${oj.onsiteTime||"—"} → ${nj.onsiteTime||"—"}`);
  if(oj.location!==nj.location) parts.push(`location → ${nj.location||"—"}`);
  if(oj.numMen!==nj.numMen) parts.push(`men ${oj.numMen??"—"} → ${nj.numMen??"—"}`);
  if(oj.trucks!==nj.trucks) parts.push(`trucks ${oj.trucks||"—"} → ${nj.trucks||"—"}`);
  if((oj.calledIn||"")!==(nj.calledIn||"")) parts.push(`PM ${oj.calledIn||"—"} → ${nj.calledIn||"—"}`);
  if((oj.jobFolder||"")!==(nj.jobFolder||"")) parts.push(`folder → ${(nj.jobFolder||"—").toUpperCase()}`);
  if((oj.poJob||"")!==(nj.poJob||"")) parts.push(`PO → ${nj.poJob||"—"}`);
  const oldCrew=new Set(oj.crew||[]),newCrew=new Set(nj.crew||[]);
  const added=[...newCrew].filter(n=>!oldCrew.has(n));
  const removed=[...oldCrew].filter(n=>!newCrew.has(n));
  if(added.length) parts.push(`+ ${added.join(", ")}`);
  if(removed.length) parts.push(`− ${removed.join(", ")}`);
  return parts;
}
const KIND_STYLE={
  added:{label:"ADDED",color:"#10b981",bg:"rgba(16,185,129,0.1)"},
  removed:{label:"REMOVED",color:"#ef4444",bg:"rgba(239,68,68,0.1)"},
  changed:{label:"CHANGED",color:"#e8a948",bg:"rgba(232,169,72,0.1)"},
};
function ChangeLogPanel({changeLog,onClear}){
  if(!changeLog.length) return(
    <div style={{padding:"60px 20px",textAlign:"center",color:"#4a5568",fontStyle:"italic"}}>
      No changes recorded yet.<br/>
      <span style={{fontSize:"11px"}}>When the Excel file changes between refreshes, every edit shows up here — job times, crews, additions, removals.</span>
    </div>
  );
  return(
    <div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:"10px"}}>
        <button onClick={onClear} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"#7a8599",borderRadius:"5px",padding:"4px 12px",fontSize:"10px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.5px"}}>CLEAR HISTORY</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
        {changeLog.map((e,i)=>{
          const ks=KIND_STYLE[e.kind]||KIND_STYLE.changed;
          return(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:"10px",padding:"9px 12px",borderRadius:"7px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",fontSize:"12px",flexWrap:"wrap"}}>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"10px",color:"#4a5568",whiteSpace:"nowrap",paddingTop:"2px"}}>
                {new Date(e.ts).toLocaleDateString([], {month:"short",day:"numeric"})} {new Date(e.ts).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}
              </span>
              <span style={{fontSize:"9px",fontWeight:800,letterSpacing:"0.8px",padding:"2px 7px",borderRadius:"4px",color:ks.color,background:ks.bg,whiteSpace:"nowrap"}}>{ks.label}</span>
              <span style={{fontWeight:700,color:"#9ca3af",whiteSpace:"nowrap"}}>{e.day} · #{e.num}</span>
              <span style={{fontWeight:700,color:"#e2e8f0"}}>{e.customer}</span>
              {e.details?.length>0&&<span style={{color:"#7a8599",flex:1,minWidth:"180px"}}>{e.details.join("  ·  ")}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Month Calendar ───────────────────────────────────────────
function MonthCalendar({weeksCache,monthCursor,setMonthCursor,onPickDay,mode,requestWeek,isMobile}){
  // Index every cached day by its real date
  const idx={};
  for(const wd of Object.values(weeksCache)){
    for(const day of DAY_ORDER){
      const dd=wd?.[day];
      if(!dd?.date) continue;
      const act=(dd.jobs||[]).filter(j=>!j.cancelled);
      idx[dd.date]={
        day,date:dd.date,
        jobs:act.length,
        men:act.reduce((s,j)=>s+(j.numMen||0),0),
        ot:act.filter(j=>isOvertimeStart(j.onsiteTime)).length,
        cancelled:(dd.jobs||[]).length-act.length,
      };
    }
  }
  const y=monthCursor.getFullYear(), m=monthCursor.getMonth();
  const daysInMonth=new Date(y,m+1,0).getDate();
  const startDow=new Date(y,m,1).getDay();
  const todayStr=(()=>{const t=new Date();return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;})();

  // Prefetch every week overlapping this month (live mode only)
  useEffect(()=>{
    if(mode!=="live") return;
    const keys=new Set();
    for(let d=1;d<=daysInMonth;d++) keys.add(getSaturdayKey(new Date(y,m,d)));
    keys.forEach(k=>requestWeek(k,{once:true}));
  },[y,m,mode]); // eslint-disable-line

  const monthMen=Object.keys(idx).filter(ds=>ds.startsWith(`${y}-${String(m+1).padStart(2,"0")}`)).reduce((s,ds)=>s+idx[ds].men,0);
  const monthJobs=Object.keys(idx).filter(ds=>ds.startsWith(`${y}-${String(m+1).padStart(2,"0")}`)).reduce((s,ds)=>s+idx[ds].jobs,0);

  const cells=[];
  for(let i=0;i<startDow;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px",flexWrap:"wrap",gap:"8px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
          <button onClick={()=>setMonthCursor(new Date(y,m-1,1))} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#7a8599",cursor:"pointer",borderRadius:"5px",padding:"3px 12px",fontSize:"16px",fontFamily:"inherit"}}>‹</button>
          <span style={{fontSize:"15px",fontWeight:800,minWidth:"150px",textAlign:"center"}}>{monthCursor.toLocaleDateString("en-US",{month:"long",year:"numeric"})}</span>
          <button onClick={()=>setMonthCursor(new Date(y,m+1,1))} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#7a8599",cursor:"pointer",borderRadius:"5px",padding:"3px 12px",fontSize:"16px",fontFamily:"inherit"}}>›</button>
          <button onClick={()=>setMonthCursor(new Date(new Date().getFullYear(),new Date().getMonth(),1))} style={{background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",color:"#10b981",cursor:"pointer",borderRadius:"5px",padding:"4px 10px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",letterSpacing:"0.5px"}}>THIS MONTH</button>
        </div>
        <div style={{fontSize:"11px",color:"#6b7789",fontFamily:"'JetBrains Mono',monospace"}}>
          Month totals: <span style={{color:"#4a9eff",fontWeight:700}}>{monthJobs}</span> jobs · <span style={{color:"#e8a948",fontWeight:700}}>{monthMen}</span> man-days
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:isMobile?"4px":"8px"}}>
        {DAY_ORDER.map(dn=><div key={dn} style={{textAlign:"center",fontSize:"9px",fontWeight:800,letterSpacing:"1px",color:"#4a5568",padding:"2px 0"}}>{dn.slice(0,3).toUpperCase()}</div>)}
        {cells.map((d,i)=>{
          if(d==null) return <div key={`b${i}`}/>;
          const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          const info=idx[ds];
          const isToday=ds===todayStr;
          const clickable=!!info;
          return(
            <button key={ds} onClick={()=>clickable&&onPickDay(info)} disabled={!clickable} style={{
              minHeight:isMobile?"62px":"86px",borderRadius:"8px",padding:isMobile?"5px":"8px",textAlign:"left",fontFamily:"inherit",
              display:"flex",flexDirection:"column",gap:"2px",
              background:isToday?"rgba(16,185,129,0.07)":info?"rgba(255,255,255,0.025)":"rgba(255,255,255,0.008)",
              border:isToday?"1px solid rgba(16,185,129,0.4)":info?"1px solid rgba(255,255,255,0.07)":"1px solid rgba(255,255,255,0.03)",
              cursor:clickable?"pointer":"default",color:"inherit",transition:"all 0.12s"}}>
              <span style={{fontSize:isMobile?"10px":"11px",fontWeight:800,color:isToday?"#10b981":info?"#9ca3af":"#2d3748",fontFamily:"'JetBrains Mono',monospace"}}>{d}</span>
              {info&&<>
                <span style={{fontSize:isMobile?"14px":"19px",fontWeight:900,lineHeight:1,color:"#e2e8f0"}}>{info.jobs}<span style={{fontSize:isMobile?"7px":"8px",fontWeight:800,color:"#4a5568",marginLeft:"3px"}}>JOBS</span></span>
                <span style={{fontSize:isMobile?"10px":"12px",fontWeight:700,color:"#e8a948",fontFamily:"'JetBrains Mono',monospace"}}>{info.men} <span style={{fontSize:isMobile?"7px":"8px",color:"#4a5568"}}>MEN</span></span>
                {info.ot>0&&<span style={{fontSize:isMobile?"8px":"9px",fontWeight:800,color:"#facc15"}}>⏱ {info.ot} OT</span>}
                {info.cancelled>0&&<span style={{fontSize:isMobile?"8px":"9px",fontWeight:800,color:"#ef4444"}}>✕ {info.cancelled}</span>}
              </>}
            </button>
          );
        })}
      </div>
      {mode!=="live"&&<div style={{marginTop:"12px",fontSize:"11px",color:"#4a5568",fontStyle:"italic"}}>Demo mode shows only the sample week — connect to SharePoint to fill in the month.</div>}
    </div>
  );
}

// ── Mobile bottom navigation ─────────────────────────────────
function BottomNav({activeTab,setActiveTab,todayChangeCount,selectedDay}){
  const items=[
    {id:"schedule",icon:"📋",l:selectedDay.slice(0,3)},
    {id:"week",icon:"🗓️",l:"Week"},
    {id:"month",icon:"📆",l:"Month"},
    {id:"roster",icon:"👷",l:"Roster"},
    {id:"people",icon:"🪪",l:"People"},
    {id:"send",icon:"📤",l:"Send"},
    {id:"changes",icon:"🕑",l:"Changes",badge:todayChangeCount},
  ];
  return(
    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:500,display:"flex",
      background:"rgba(10,15,22,0.97)",backdropFilter:"blur(12px)",borderTop:"1px solid rgba(255,255,255,0.08)",
      paddingBottom:"env(safe-area-inset-bottom)"}}>
      {items.map(t=>{
        const active=activeTab===t.id;
        return(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
            flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"2px",
            padding:"9px 0 7px",background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit",
            color:active?"#4a9eff":"#4a5568",position:"relative"}}>
            <span style={{fontSize:"18px",lineHeight:1,filter:active?"none":"grayscale(1) opacity(0.6)"}}>{t.icon}</span>
            <span style={{fontSize:"9px",fontWeight:active?800:600,letterSpacing:"0.3px"}}>{t.l}</span>
            {t.badge>0&&<span style={{position:"absolute",top:"4px",right:"calc(50% - 18px)",minWidth:"14px",height:"14px",borderRadius:"7px",background:"#e8a948",color:"#0a0f16",fontSize:"9px",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{t.badge}</span>}
            {active&&<span style={{position:"absolute",top:0,left:"20%",right:"20%",height:"2px",borderRadius:"1px",background:"#4a9eff"}}/>}
          </button>
        );
      })}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────
function getForemanList(crews){
  if(!crews||Object.keys(crews).length===0) return FOREMAN_ORDER;
  // Preserve sheet order (parser inserts in reading order: top band then bottom, left to right)
  return Object.keys(crews);
}

function getPersonDays(name,allData){
  const result={};
  for(const day of DAY_ORDER){
    result[day]=(allData?.[day]?.jobs||[]).some(j=>(j.crew||[]).includes(name));
  }
  return result;
}

// ── Day Tracker ──────────────────────────────────────────────
function DayTracker({name,allData}){
  const scheduled=getPersonDays(name,allData);
  return(
    <div style={{display:"flex",gap:"2px"}}>
      {DAY_ORDER.map(d=>{
        const on=scheduled[d];
        return(
          <div key={d} title={d} style={{
            width:"11px",height:"11px",borderRadius:"2px",
            background:on?"rgba(16,185,129,0.35)":"rgba(255,255,255,0.04)",
            border:on?"1px solid rgba(16,185,129,0.6)":"1px solid rgba(255,255,255,0.08)",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:"6px",fontWeight:800,
            color:on?"#10b981":"#2d3748",
          }}>{d[0]}</div>
        );
      })}
    </div>
  );
}

// ── Schedule Panel ───────────────────────────────────────────
function SchedulePanel({label,accentColor,schedule,onClose}){
  return(
    <div style={{marginBottom:"24px",padding:"16px",background:"rgba(255,255,255,0.02)",borderRadius:"8px",border:`1px solid ${accentColor}35`}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
        <div style={{fontSize:"13px",fontWeight:800}}>
          <span style={{color:accentColor}}>{label}</span>
          <span style={{color:"#e2e8f0"}}>'s Week</span>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:"#4a5568",cursor:"pointer",fontSize:"18px",lineHeight:1,fontFamily:"inherit",padding:"0 4px"}}>×</button>
      </div>
      {schedule.length===0
        ? <div style={{color:"#4a5568",fontStyle:"italic",fontSize:"12px"}}>Not scheduled for any jobs this week.</div>
        : <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {schedule.map(({day,date,jobs})=>(
              <div key={day}>
                <div style={{fontSize:"9px",fontWeight:800,letterSpacing:"1.2px",color:accentColor,marginBottom:"4px"}}>
                  {day.toUpperCase()}{date&&<span style={{color:"#4a5568",fontWeight:400,fontFamily:"'JetBrains Mono',monospace"}}> · {formatDate(date)}</span>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                  {jobs.map((job,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"6px 10px",borderRadius:"4px",background:`${accentColor}08`,border:`1px solid ${accentColor}15`,fontSize:"12px",flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,color:"#e2e8f0",minWidth:"130px"}}>{job.customer}</span>
                      {job.location&&<span style={{color:"#7a8599",fontSize:"11px",flex:1}}>{job.location}</span>}
                      {job.onsiteTime&&<span style={{color:"#e8a948",fontSize:"11px",fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{job.onsiteTime}</span>}
                      {job.numMen!=null&&<span style={{color:"#f472b6",fontSize:"11px",fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{job.numMen} men</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ── Crew Roster ──────────────────────────────────────────────
function CrewRoster({crews,pools,unavailable,unassigned,jobs,allData}){
  const [selectedPerson,setSelectedPerson]=useState(null);
  const [selectedPM,setSelectedPM]=useState(null);
  if(!crews) return null;
  const foremanList=getForemanList(crews);
  const outList=unavailable||[];
  const unassignedList=unassigned||[];
  const outByForeman=f=>outList.filter(u=>u.foreman===f);

  // Names that appear on JOB crews but aren't anywhere in the roster.
  // Driver tags are stripped first, so "Rich-t" folds to "Rich" and matches
  // the roster (not flagged), while "Juan E" / "Juan E-t" — not on the
  // roster at all — surface here in their own column.
  const rosterKeySet=new Set();
  const addRoster=n=>{const c=canonicalName(n).toLowerCase();if(c)rosterKeySet.add(c);};
  for(const f of foremanList){ addRoster(f); for(const m of (crews[f]?.members||[])) addRoster(m.name); }
  for(const k of ["laborers","drivers","extra"]) for(const m of (pools?.[k]||[])) addRoster(m.name);
  for(const u of outList) addRoster(u.name);
  for(const u of unassignedList) addRoster(u.name);
  const offRosterMap=new Map(); // canonical -> display name
  for(const job of (jobs||[])){
    if(job.cancelled) continue;
    for(const raw of (job.crew||[])){
      if(isNonPerson(raw)) continue;
      const c=canonicalName(raw); const key=c.toLowerCase();
      if(!key||rosterKeySet.has(key)) continue;
      if(!offRosterMap.has(key)) offRosterMap.set(key,c);
    }
  }
  const offRoster=[...offRosterMap.values()].sort((a,b)=>a.localeCompare(b)).map(name=>({name}));
  const outNoForeman=outList.filter(u=>!u.foreman);

  function handleSelect(name){ setSelectedPM(null); setSelectedPerson(p=>p===name?null:name); }
  function handleSelectPM(pm){ setSelectedPerson(null); setSelectedPM(p=>p===pm?null:pm); }

  const personSchedule=selectedPerson
    ? DAY_ORDER.reduce((acc,day)=>{
        const jobs=(allData?.[day]?.jobs||[]).filter(j=>(j.crew||[]).includes(selectedPerson));
        if(jobs.length) acc.push({day,date:allData[day]?.date,jobs});
        return acc;
      },[])
    : [];

  const pmSchedule=selectedPM
    ? DAY_ORDER.reduce((acc,day)=>{
        const jobs=(allData?.[day]?.jobs||[]).filter(j=>j.calledIn&&j.calledIn.toUpperCase()===selectedPM);
        if(jobs.length) acc.push({day,date:allData[day]?.date,jobs});
        return acc;
      },[])
    : [];

  return(
    <div>
      {outList.length>0&&(
        <div style={{padding:"8px 12px",borderRadius:"6px",background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.2)",fontSize:"11px",lineHeight:1.8,marginBottom:"14px"}}>
          <span style={{fontWeight:800,color:"#ef4444",marginRight:"8px",letterSpacing:"0.5px"}}>🚫 UNAVAILABLE TODAY</span>
          {outList.map((u,i)=>(
            <span key={i}>
              <span style={{color:"#f87171",fontWeight:700}}>{u.name}</span>
              {u.foreman&&<span style={{color:"#4a5568"}}> ({u.foreman}'s crew)</span>}
              <span style={{color:"#4a5568",fontStyle:"italic"}}> · {u.reason==='crossed out'?'crossed out':'vacation / injured'}</span>
              {i<outList.length-1&&<span style={{margin:"0 10px",color:"#2d3748"}}>·</span>}
            </span>
          ))}
        </div>
      )}
      <div style={{fontSize:"10px",fontWeight:800,letterSpacing:"1.5px",color:"#4a5568",marginBottom:"12px"}}>FOREMAN CREWS</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:"10px",marginBottom:"28px"}}>
        {foremanList.map((f,fi)=>{
          const crew=crews[f]; const color=foremanColor(f,fi);
          const crewOut=outByForeman(f);
          const allMembers=[f,...(crew?.members||[]).map(m=>m.name)];
          const working=allMembers.filter(n=>DAY_ORDER.some(day=>(allData?.[day]?.jobs||[]).some(j=>(j.crew||[]).includes(n)))).length;
          const total=allMembers.length;
          const pct=total>0?Math.round((working/total)*100):0;
          const utilColor=pct===100?"#10b981":pct>=60?"#e8a948":"#ef4444";
          return(
            <div key={f} style={{background:"rgba(255,255,255,0.02)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)",padding:"12px",borderTop:`3px solid ${color}`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"3px"}}>
                <div style={{fontSize:"9px",fontWeight:800,letterSpacing:"1px",color}}>{f.toUpperCase()}</div>
                <span style={{fontSize:"9px",fontWeight:700,color:utilColor,fontFamily:"'JetBrains Mono',monospace"}}>{working}/{total}</span>
              </div>
              <div style={{height:"3px",borderRadius:"2px",background:"rgba(255,255,255,0.06)",marginBottom:"7px"}}>
                <div style={{height:"100%",borderRadius:"2px",width:`${pct}%`,background:utilColor,transition:"width 0.3s"}}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                {crewOut.map((u,i)=>(
                  <div key={`out-${i}`} title={u.reason==='crossed out'?'Crossed out in the log book':'Listed above the crew — out on vacation or injured'} style={{
                    display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"4px 8px",borderRadius:"4px",
                    background:"rgba(239,68,68,0.05)",border:"1px dashed rgba(239,68,68,0.3)",
                    fontSize:"12px",color:"#7a8599",opacity:0.8,
                  }}>
                    <span style={{textDecoration:u.reason==='crossed out'?'line-through':'none'}}>{u.name}</span>
                    <span style={{fontSize:"8px",fontWeight:800,letterSpacing:"0.5px",padding:"1px 5px",borderRadius:"3px",background:"rgba(239,68,68,0.12)",color:"#ef4444"}}>OUT</span>
                  </div>
                ))}
                <button onClick={()=>handleSelect(f)} style={{
                  display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"4px 8px",borderRadius:"4px",width:"100%",textAlign:"left",fontFamily:"inherit",
                  background:selectedPerson===f?`${color}18`:"rgba(255,255,255,0.04)",
                  border:selectedPerson===f?`1px solid ${color}40`:"1px solid rgba(255,255,255,0.06)",
                  fontSize:"12px",color:selectedPerson===f?color:color,
                  cursor:"pointer",transition:"all 0.12s",fontWeight:600,
                }}>
                  <span>{f}<QualBadge code={crew?.qual}/></span>
                  <DayTracker name={f} allData={allData}/>
                </button>
                {(crew?.members||[]).map((m,i)=>
                  <button key={i} onClick={()=>handleSelect(m.name)} style={{
                    display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"4px 8px",borderRadius:"4px",width:"100%",textAlign:"left",fontFamily:"inherit",
                    background:selectedPerson===m.name?"rgba(74,158,255,0.08)":"rgba(255,255,255,0.03)",
                    border:selectedPerson===m.name?"1px solid rgba(74,158,255,0.2)":"1px solid rgba(255,255,255,0.04)",
                    fontSize:"12px",color:selectedPerson===m.name?"#e2e8f0":"#b0bac7",
                    cursor:"pointer",transition:"all 0.12s",
                  }}>
                    <div style={{display:"flex",alignItems:"center"}}><span>{m.name}</span><QualBadge code={m.qual}/></div>
                    <DayTracker name={m.name} allData={allData}/>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedPerson&&<SchedulePanel label={selectedPerson} accentColor="#4a9eff" schedule={personSchedule} onClose={()=>setSelectedPerson(null)}/>}

      {/* PM Section */}
      <div style={{fontSize:"10px",fontWeight:800,letterSpacing:"1.5px",color:"#4a5568",marginBottom:"10px"}}>PROJECT MANAGERS</div>
      <div style={{display:"flex",gap:"6px",marginBottom:"20px",flexWrap:"wrap"}}>
        {Object.entries(PM_COLORS).map(([pm,color])=>{
          const isSel=selectedPM===pm;
          const jobCount=DAY_ORDER.reduce((n,day)=>n+(allData?.[day]?.jobs||[]).filter(j=>j.calledIn&&j.calledIn.toUpperCase()===pm).length,0);
          return(
            <button key={pm} onClick={()=>handleSelectPM(pm)} style={{
              display:"flex",alignItems:"center",gap:"8px",padding:"8px 16px",borderRadius:"6px",cursor:"pointer",fontFamily:"inherit",
              background:isSel?`${color}20`:"rgba(255,255,255,0.03)",
              border:isSel?`1px solid ${color}55`:"1px solid rgba(255,255,255,0.07)",
              transition:"all 0.12s",
            }}>
              <span style={{fontSize:"13px",fontWeight:800,color}}>{pm}</span>
              <span style={{fontSize:"10px",color:"#4a5568",fontFamily:"'JetBrains Mono',monospace"}}>{jobCount} job{jobCount!==1?"s":""}</span>
            </button>
          );
        })}
      </div>

      {selectedPM&&<SchedulePanel label={`PM ${selectedPM}`} accentColor={PM_COLORS[selectedPM]} schedule={pmSchedule} onClose={()=>setSelectedPM(null)}/>}

      <div style={{fontSize:"10px",fontWeight:800,letterSpacing:"1.5px",color:"#4a5568",marginBottom:"12px"}}>AVAILABLE POOL</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:"10px"}}>
        {[{title:"LABORERS",data:pools?.laborers||[],accent:"#10b981"},{title:"DRIVERS",data:pools?.drivers||[],accent:"#e8a948"},{title:"EXTRA",data:pools?.extra||[],accent:"#a78bfa"},
          {title:"UNAVAILABLE",data:outList.map(u=>({name:u.name,tag:u.reason==='crossed out'?'crossed out':'vacation / injured',crew:u.foreman})),accent:"#ef4444",hint:"Out today — listed above their crew or crossed out",emptyText:"None today",unavailable:true},
          ...(unassignedList.length?[{title:"UNASSIGNED",data:unassignedList,accent:"#f59e0b",hint:"On the roster but not under any crew or pool"}]:[]),
          ...(offRoster.length?[{title:"NOT ON ROSTER",data:offRoster,accent:"#38bdf8",hint:"On a job today but not found on the roster (e.g. Juan E). Driver tags like Rich-t are matched to the roster and not listed here."}]:[])].map(sec=>
          <div key={sec.title} style={{background:"rgba(255,255,255,0.02)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)",padding:"12px"}}>
            <div style={{fontSize:"10px",fontWeight:800,letterSpacing:"1.5px",color:sec.accent,marginBottom:"8px",borderBottom:`1px solid ${sec.accent}25`,paddingBottom:"6px"}}>
              {sec.title} <span style={{color:"#444",fontWeight:400}}>({sec.data.length})</span>
              {sec.hint&&<div style={{fontSize:"9px",fontWeight:400,letterSpacing:"0",color:"#6b7789",marginTop:"3px",textTransform:"none"}}>{sec.hint}</div>}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
              {sec.data.length===0&&sec.emptyText&&<span style={{fontSize:"11px",color:"#4a5568",fontStyle:"italic",padding:"3px 2px"}}>{sec.emptyText}</span>}
              {sec.data.map((p,i)=>
                sec.unavailable?
                <span key={i} title={p.tag+(p.crew?` — ${p.crew}'s crew`:"")} style={{
                  padding:"3px 8px",borderRadius:"4px",
                  background:"rgba(239,68,68,0.06)",border:"1px dashed rgba(239,68,68,0.35)",
                  fontSize:"11px",color:"#f87171",
                }}>
                  <span style={{textDecoration:p.tag==='crossed out'?'line-through':'none'}}>{p.name}</span>
                  {p.crew&&<span style={{color:"#6b7789",marginLeft:"5px",fontSize:"9px"}}>({p.crew})</span>}
                  <span style={{color:"#8a5560",marginLeft:"5px",fontSize:"9px",fontStyle:"italic"}}>{p.tag}</span>
                </span>
                :
                <button key={i} onClick={()=>handleSelect(p.name)} style={{
                  padding:"3px 8px",borderRadius:"4px",cursor:"pointer",fontFamily:"inherit",
                  background:selectedPerson===p.name?"rgba(74,158,255,0.1)":"rgba(255,255,255,0.04)",
                  border:selectedPerson===p.name?"1px solid rgba(74,158,255,0.25)":"1px solid rgba(255,255,255,0.06)",
                  fontSize:"11px",color:selectedPerson===p.name?"#e2e8f0":"#9ca3af",
                }}>{p.name}</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Week Overview ────────────────────────────────────────────
function WeekOverview({data,selectedDay,onSelectDay}){
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:"8px"}}>
      {DAY_ORDER.map(dn=>{
        const d=data[dn]; const act=(d?.jobs||[]).filter(j=>!j.cancelled);
        const jc=act.length; const tm=act.reduce((s,j)=>s+(j.numMen||0),0);
        const otc=act.filter(j=>isOvertimeStart(j.onsiteTime)).length;
        const tc=act.filter(j=>j.trucks&&!/^(na|n\/a)$/i.test(String(j.trucks).trim())).length;
        const cc=(d?.jobs||[]).length-jc;
        const isToday=dn===getTodayDayName(); const isSel=dn===selectedDay;
        return(
          <button key={dn} onClick={()=>onSelectDay(dn)} style={{
            background:isSel?"rgba(74,158,255,0.1)":isToday?"rgba(16,185,129,0.06)":"rgba(255,255,255,0.015)",
            border:isSel?"1px solid rgba(74,158,255,0.35)":isToday?"1px solid rgba(16,185,129,0.25)":"1px solid rgba(255,255,255,0.05)",
            borderRadius:"10px",padding:"16px 8px",cursor:"pointer",textAlign:"center",transition:"all 0.2s",color:"inherit",fontFamily:"inherit"}}>
            <div style={{fontSize:"10px",fontWeight:800,letterSpacing:"1.2px",color:isSel?"#4a9eff":isToday?"#10b981":"#4a5568"}}>{dn.substring(0,3).toUpperCase()}</div>
            <div style={{fontSize:"11px",color:"#6b7789",margin:"4px 0 8px"}}>{formatDate(d?.date)}</div>
            <div style={{fontSize:"28px",fontWeight:900,color:"#e2e8f0",lineHeight:1}}>{jc}</div>
            <div style={{fontSize:"9px",color:"#4a5568",marginTop:"2px"}}>{jc===1?"JOB":"JOBS"}</div>
            <div style={{display:"flex",gap:"10px",justifyContent:"center",alignItems:"baseline",marginTop:"8px"}}>
              <div style={{fontSize:"12px",color:"#e8a948",fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{tm} <span style={{fontSize:"9px",color:"#444"}}>MEN</span></div>
              {tc>0&&<div style={{fontSize:"12px",color:"#10b981",fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{tc} <span style={{fontSize:"9px",color:"#444"}}>{tc===1?"TRUCK":"TRUCKS"}</span></div>}
            </div>
            {otc>0&&<div style={{fontSize:"9px",fontWeight:800,color:"#facc15",marginTop:"4px",fontFamily:"'JetBrains Mono',monospace"}}>⏱ {otc} OT</div>}
            {cc>0&&<div style={{fontSize:"9px",fontWeight:800,color:"#ef4444",marginTop:"4px",fontFamily:"'JetBrains Mono',monospace"}}>✕ {cc} CANCELLED</div>}
            {isToday&&<div style={{fontSize:"8px",fontWeight:800,letterSpacing:"1.2px",color:"#10b981",marginTop:"6px"}}>TODAY</div>}
          </button>
        );
      })}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────
export default function App(){
  const [weeksCache,setWeeksCache]=useState({[SAMPLE_SAT]:SAMPLE_DATA});
  const [currentWeekSat,setCurrentWeekSat]=useState(SAMPLE_SAT);
  const [loadingWeek,setLoadingWeek]=useState(null);
  const currentWeekSatRef=useRef(SAMPLE_SAT);
  const data=weeksCache[currentWeekSat]||{};
  const [selectedDay,setSelectedDay]=useState(getTodayDayName());
  const [mode,setMode]=useState("demo");
  const [lastRefresh,setLastRefresh]=useState(Date.now());
  const [nextRefresh,setNextRefresh]=useState(Date.now()+REFRESH_MS);
  const [activeTab,setActiveTab]=useState("schedule");
  const [error,setError]=useState(null);
  const [fileMeta,setFileMeta]=useState(null);
  const [isRefreshing,setIsRefreshing]=useState(false);
  const [flashedJobs,setFlashedJobs]=useState(new Set());
  const isMobile=useIsMobile();
  const [legendOpen,setLegendOpen]=useState(false);
  const touchRef=useRef(null);
  const [tvMode,setTvMode]=useState(()=>typeof window!=="undefined"&&window.location.hash==="#tv");
  const [changeLog,setChangeLog]=useState(loadChangeLog);
  const [monthCursor,setMonthCursor]=useState(()=>{const t=new Date();return new Date(t.getFullYear(),t.getMonth(),1);});
  // Installer profiles — shared by the profiles editor and the Teams composer
  // so real names show up in messages without reloading the file each time.
  const [profiles,setProfiles]=useState(emptyStore());
  useEffect(()=>{
    if(mode!=="live") return;
    let alive=true;
    loadProfiles().then(p=>{ if(alive) setProfiles(p); }).catch(()=>{ /* first run: no file yet */ });
    return()=>{alive=false;};
  },[mode]);
  useEffect(()=>{saveChangeLog(changeLog);},[changeLog]);
  // Keep #tv in the URL so a kiosk machine can bookmark TV mode directly
  useEffect(()=>{
    if(tvMode){
      if(window.location.hash!=="#tv") window.history.replaceState(null,"","#tv");
    } else if(window.location.hash==="#tv"){
      window.history.replaceState(null,"",window.location.pathname+window.location.search);
    }
  },[tvMode]);
  function enterTV(){
    setTvMode(true);
    document.documentElement.requestFullscreen?.().catch(()=>{});
  }
  function exitTV(){
    setTvMode(false);
    if(document.fullscreenElement) document.exitFullscreen?.().catch(()=>{});
  }

  // Try auto-login on mount
  useEffect(()=>{
    if(!isConfigured()) return;
    (async()=>{
      try {
        const token = await initAuth();
        if(token){
          setMode("live");
          setCurrentWeekSat(INITIAL_SAT);
          currentWeekSatRef.current=INITIAL_SAT;
          await refreshData();
        }
      } catch(e){ console.log("Auto-login skipped:", e); }
    })();
  },[]);

  // Auto-refresh
  useEffect(()=>{
    if(mode!=="live") return;
    const t=setInterval(()=>refreshData(), REFRESH_MS);
    return()=>clearInterval(t);
  },[mode]);

  // (Removed) The dashboard previously auto-switched the selected day to
  // the real-world "today" every minute. That overrode a scheduler's
  // manual day choice, so it's gone — the selected day now stays put until
  // the user changes it. Initial default is still today (see useState above).

  // Prefetch the prior week so Monday's "new job" / "moved crew" checks can
  // compare against last week's Friday + Saturday. Runs whenever the viewed
  // week changes in live mode; fetchWeek no-ops if it's already cached.
  useEffect(()=>{
    if(mode!=="live") return;
    const prevSat=prevWeekSatKey(currentWeekSat);
    if(prevSat&&!weeksCache[prevSat]) fetchWeek(prevSat,{once:true});
  },[mode,currentWeekSat]);

  async function refreshData(){
    const satKey=currentWeekSatRef.current;
    try {
      setError(null);
      setIsRefreshing(true);
      const newData=await fetchScheduleFromSharePoint(new Date(satKey+'T12:00:00'));
      let meta=null;
      if(newData._meta){meta=newData._meta;delete newData._meta;}
      if(meta) setFileMeta(meta);
      setWeeksCache(prev=>{
        const oldData=prev[satKey]||{};
        const changed=new Set();
        const entries=[];
        const hadAny=DAY_ORDER.some(day=>(oldData[day]?.jobs||[]).length>0);
        for(const day of DAY_ORDER){
          const oldJobs=oldData[day]?.jobs||[];
          const newJobs=newData[day]?.jobs||[];
          for(const nj of newJobs){
            const oj=oldJobs.find(j=>j.num===nj.num);
            if(!oj){
              changed.add(`${day}-${nj.num}`);
              if(hadAny) entries.push({ts:Date.now(),day,num:nj.num,customer:nj.customer,kind:"added",details:[`${nj.onsiteTime||"TBD"}${nj.location?` · ${nj.location}`:""}`]});
            } else if(JSON.stringify(oj)!==JSON.stringify(nj)){
              changed.add(`${day}-${nj.num}`);
              if(hadAny){
                const details=diffJobFields(oj,nj);
                if(details.length) entries.push({ts:Date.now(),day,num:nj.num,customer:nj.customer,kind:"changed",details});
              }
            }
          }
          if(hadAny){
            for(const oj of oldJobs){
              if(!newJobs.find(j=>j.num===oj.num)){
                entries.push({ts:Date.now(),day,num:oj.num,customer:oj.customer,kind:"removed",details:[]});
              }
            }
          }
        }
        if(changed.size>0){setFlashedJobs(changed);setTimeout(()=>setFlashedJobs(new Set()),4000);}
        if(entries.length>0) setChangeLog(log=>[...entries,...log].slice(0,100));
        return{...prev,[satKey]:newData};
      });
      setLastRefresh(Date.now());
      setNextRefresh(Date.now()+REFRESH_MS);
    } catch(e){
      console.error("Refresh failed:",e);
      setError(e.message);
    } finally {
      setIsRefreshing(false);
    }
  }

  const fetchingRef=useRef(new Set());
  const attemptedRef=useRef(new Set());
  async function fetchWeek(satKey,opts={}){
    if(weeksCache[satKey]||fetchingRef.current.has(satKey)) return;
    if(opts.once&&attemptedRef.current.has(satKey)) return;
    attemptedRef.current.add(satKey);
    fetchingRef.current.add(satKey);
    setLoadingWeek(satKey);
    try {
      const newData=await fetchScheduleFromSharePoint(new Date(satKey+'T12:00:00'));
      let meta=null;
      if(newData._meta){meta=newData._meta;delete newData._meta;}
      setWeeksCache(prev=>({...prev,[satKey]:newData}));
      if(satKey===currentWeekSatRef.current&&meta) setFileMeta(meta);
    } catch(e){
      console.error(`Failed to load week ${satKey}:`,e);
      if(satKey===currentWeekSatRef.current&&!opts.once) setError(e.message);
    } finally {
      fetchingRef.current.delete(satKey);
      setLoadingWeek(null);
    }
  }

  function navigateWeek(dir){
    const cur=new Date(currentWeekSat+'T12:00:00');
    cur.setDate(cur.getDate()+dir*7);
    const newSat=getSaturdayKey(cur);
    setCurrentWeekSat(newSat);
    currentWeekSatRef.current=newSat;
    if(mode==='live'&&!weeksCache[newSat]) fetchWeek(newSat);
  }

  function goToCurrentWeek(){
    setCurrentWeekSat(INITIAL_SAT);
    currentWeekSatRef.current=INITIAL_SAT;
    if(mode==='live'&&!weeksCache[INITIAL_SAT]) fetchWeek(INITIAL_SAT);
  }

  async function handleConnect(){
    if(!isConfigured()){
      setError("Update CLIENT_ID and TENANT_ID in src/auth.js first — see SETUP.md");
      return;
    }
    try {
      setError(null);
      await login();
      setMode("live");
      setCurrentWeekSat(INITIAL_SAT);
      currentWeekSatRef.current=INITIAL_SAT;
      await refreshData();
    } catch(e){
      setError(e.message);
    }
  }

  function pickCalendarDay(info){
    const satKey=getSaturdayKey(new Date(info.date+"T12:00:00"));
    setCurrentWeekSat(satKey);
    currentWeekSatRef.current=satKey;
    if(mode==="live"&&!weeksCache[satKey]) fetchWeek(satKey);
    setSelectedDay(info.day);
    setActiveTab("schedule");
  }

  // Changes made today, shown as a badge on the Changes tab
  const todayChangeCount=changeLog.filter(e=>new Date(e.ts).toDateString()===new Date().toDateString()).length;

  // Swipe left/right between days on the mobile schedule view
  function onTouchStart(e){
    touchRef.current={x:e.touches[0].clientX,y:e.touches[0].clientY};
  }
  function onTouchEnd(e){
    if(!touchRef.current) return;
    const dx=e.changedTouches[0].clientX-touchRef.current.x;
    const dy=e.changedTouches[0].clientY-touchRef.current.y;
    touchRef.current=null;
    if(!isMobile||activeTab!=="schedule") return;
    if(Math.abs(dx)<60||Math.abs(dy)>50) return;
    const i=DAY_ORDER.indexOf(selectedDay);
    if(dx<0&&i<DAY_ORDER.length-1) setSelectedDay(DAY_ORDER[i+1]);
    else if(dx>0&&i>0) setSelectedDay(DAY_ORDER[i-1]);
  }

  if(tvMode){
    // TV always shows the current real week
    const tvData=weeksCache[INITIAL_SAT]||data;
    return <TVMode data={tvData} onExit={exitTV} fileMeta={fileMeta} error={error} isRefreshing={isRefreshing}/>;
  }

  const cur=data[selectedDay];
  const curActive=(cur?.jobs||[]).filter(j=>!j.cancelled);
  const totalJobs=curActive.length;
  const totalMen=curActive.reduce((s,j)=>s+(j.numMen||0),0);
  const totalTrucks=curActive.filter(j=>j.trucks&&j.trucks!=="na"&&j.trucks!=="n/a").length;

  return(
    <div style={{minHeight:"100vh",background:"#0a0f16",color:"#e2e8f0",fontFamily:"'Inter',-apple-system,sans-serif",paddingBottom:isMobile?"70px":0}}>
      <style>{`@keyframes jobFlash{0%,65%{background-color:rgba(16,185,129,0.18);}100%{background-color:transparent;}} .job-flash{animation:jobFlash 4s ease-out forwards;} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      <ConnectionBar mode={mode} lastRefresh={lastRefresh} nextRefresh={nextRefresh} isConnected={mode==="live"} onConnect={handleConnect} onRefresh={refreshData} error={error} fileMeta={fileMeta} isRefreshing={isRefreshing}/>

      {/* Header */}
      <div style={{padding:isMobile?"14px 12px 0":"20px 24px 0",display:"flex",alignItems:"flex-end",justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
        <div>
          <div style={{fontSize:"9px",fontWeight:800,letterSpacing:"2.5px",color:"#4a9eff",marginBottom:"3px"}}>SCHEDULING TEAM</div>
          <h1 style={{margin:0,fontSize:isMobile?"20px":"26px",fontWeight:900,letterSpacing:"-0.5px"}}>Daily Jobs Dashboard</h1>
          <div style={{display:"flex",alignItems:"center",gap:"6px",marginTop:"4px"}}>
            <button onClick={()=>navigateWeek(-1)} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#7a8599",cursor:"pointer",borderRadius:"4px",padding:"1px 8px",fontSize:"15px",fontFamily:"inherit",lineHeight:1.4}}>‹</button>
            <span style={{fontSize:"12px",color:"#4a5568",minWidth:"210px",textAlign:"center"}}>{getWeekLabel(data)||satKeyToLabel(currentWeekSat)}</span>
            <button onClick={()=>navigateWeek(1)} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#7a8599",cursor:"pointer",borderRadius:"4px",padding:"1px 8px",fontSize:"15px",fontFamily:"inherit",lineHeight:1.4}}>›</button>
            {currentWeekSat!==INITIAL_SAT&&<button onClick={goToCurrentWeek} style={{background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",color:"#10b981",cursor:"pointer",borderRadius:"4px",padding:"2px 9px",fontSize:"10px",fontFamily:"inherit",fontWeight:700,letterSpacing:"0.5px"}}>TODAY</button>}
            {loadingWeek===currentWeekSat&&<span style={{fontSize:"10px",color:"#4a9eff",fontFamily:"'JetBrains Mono',monospace"}}>⟳ Loading...</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:isMobile?"6px":"10px",alignItems:"stretch"}}>
          {[{v:totalJobs,l:"JOBS",c:"#4a9eff"},{v:totalMen,l:"MEN",c:"#e8a948"},{v:totalTrucks,l:"TRUCKS",c:"#10b981"}].map(s=>
            <div key={s.l} style={{textAlign:"center",padding:isMobile?"6px 12px":"8px 18px",background:"rgba(255,255,255,0.02)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.05)"}}>
              <div style={{fontSize:isMobile?"18px":"24px",fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
              <div style={{fontSize:"8px",fontWeight:800,letterSpacing:"1.2px",color:"#4a5568",marginTop:"2px"}}>{s.l}</div>
            </div>
          )}
          <button onClick={enterTV} title="Full-screen TV / kiosk mode (bookmark with #tv in the URL)" style={{
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"2px",
            padding:isMobile?"6px 12px":"8px 16px",background:"rgba(74,158,255,0.06)",borderRadius:"8px",
            border:"1px solid rgba(74,158,255,0.2)",color:"#4a9eff",cursor:"pointer",fontFamily:"inherit"}}>
            <span style={{fontSize:isMobile?"16px":"20px",lineHeight:1}}>📺</span>
            <span style={{fontSize:"8px",fontWeight:800,letterSpacing:"1.2px"}}>TV MODE</span>
          </button>
        </div>
      </div>

      {/* Tabs (desktop only — mobile uses the bottom navigation bar) */}
      {!isMobile&&<div style={{padding:"18px 24px 0",display:"flex",gap:"2px",overflowX:"auto"}}>
        {[
          {id:"schedule",l:isMobile?selectedDay.slice(0,3):`${selectedDay}'s Schedule`},
          {id:"roster",l:isMobile?"Roster":"Crew Roster"},
          {id:"week",l:isMobile?"Week":"Week at a Glance"},
          {id:"month",l:"Month"},
          {id:"changes",l:"Changes",badge:todayChangeCount},
          {id:"people",l:"People"},
          {id:"send",l:"Send to Teams"},
        ].map(t=>
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
            padding:isMobile?"9px 12px":"10px 20px",borderRadius:"8px 8px 0 0",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",
            background:activeTab===t.id?"rgba(255,255,255,0.03)":"transparent",
            border:activeTab===t.id?"1px solid rgba(255,255,255,0.06)":"1px solid transparent",
            borderBottom:activeTab===t.id?"1px solid #0a0f16":"1px solid transparent",
            color:activeTab===t.id?"#e2e8f0":"#4a5568",fontSize:"12px",fontWeight:activeTab===t.id?700:500,
            position:"relative",bottom:"-1px"}}>
            {t.l}
            {t.badge>0&&<span style={{marginLeft:"6px",fontSize:"9px",fontWeight:800,padding:"1px 6px",borderRadius:"8px",background:"rgba(232,169,72,0.18)",color:"#e8a948",fontFamily:"'JetBrains Mono',monospace"}}>{t.badge}</span>}
          </button>
        )}
      </div>}

      {/* Content */}
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{margin:isMobile?"14px 12px 16px":"0 24px 24px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:isMobile?"10px":"0 8px 8px 8px",padding:isMobile?"12px":"20px",minHeight:"420px"}}>
        {loadingWeek===currentWeekSat&&!weeksCache[currentWeekSat]
          ? <div style={{padding:"80px",textAlign:"center",color:"#4a5568"}}>
              <div style={{fontSize:"28px",marginBottom:"12px",animation:"spin 1s linear infinite"}}>⟳</div>
              <div>Loading {satKeyToLabel(currentWeekSat)}…</div>
            </div>
          : Object.keys(data).length===0&&activeTab!=="month"&&activeTab!=="changes"&&activeTab!=="people"
            ? <div style={{padding:"80px",textAlign:"center",color:"#4a5568",fontStyle:"italic"}}>
                {mode==="live"?"No data found for this week.":"Connect to SharePoint to load this week, or use ‹ › to browse to the sample week (Mar 22–28, 2026)."}
              </div>
            : <>
                {(activeTab==="schedule"||activeTab==="roster")&&
                  <div style={{display:"flex",gap:isMobile?"5px":"3px",marginBottom:"14px",borderBottom:"1px solid rgba(255,255,255,0.04)",paddingBottom:"10px",overflowX:"auto",WebkitOverflowScrolling:"touch",alignItems:"center"}}>
                    {DAY_ORDER.map(d=>{const isToday=d===getTodayDayName(),isSel=d===selectedDay;
                      const djc=data[d]?.jobs?.length||0;
                      return <button key={d} onClick={()=>setSelectedDay(d)} style={{
                        padding:isMobile?"10px 13px":"6px 14px",borderRadius:isMobile?"9px":"6px",cursor:"pointer",fontSize:isMobile?"13px":"11px",fontWeight:isSel?700:500,fontFamily:"inherit",flexShrink:0,
                        background:isSel?"rgba(74,158,255,0.1)":isMobile?"rgba(255,255,255,0.02)":"transparent",border:isSel?"1px solid rgba(74,158,255,0.25)":isMobile?"1px solid rgba(255,255,255,0.05)":"1px solid transparent",
                        color:isSel?"#4a9eff":isToday?"#10b981":djc>0?"#7a8599":"#3a4254"}}>
                        {d.substring(0,3)}{djc>0&&<span style={{marginLeft:"5px",fontSize:"9px",fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color:isSel?"#4a9eff":"#4a5568"}}>{djc}</span>}{isToday&&!isSel&&<span style={{display:"inline-block",width:"4px",height:"4px",borderRadius:"50%",background:"#10b981",marginLeft:"4px",verticalAlign:"middle"}}/>}
                      </button>;
                    })}
                    {isMobile&&activeTab==="schedule"&&<span style={{marginLeft:"auto",paddingLeft:"8px",fontSize:"9px",color:"#3a4254",whiteSpace:"nowrap",flexShrink:0}}>← swipe →</span>}
                    {!isMobile&&cur?.date&&<span style={{marginLeft:"auto",paddingLeft:"12px",fontSize:"13px",fontWeight:700,color:"#7a8599",whiteSpace:"nowrap",flexShrink:0}}>{new Date(cur.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</span>}
                  </div>
                }
                {activeTab==="schedule"&&isMobile&&cur?.date&&<div style={{fontSize:"12px",fontWeight:700,color:"#7a8599",marginBottom:"10px",marginTop:"-4px"}}>{new Date(cur.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</div>}
                {activeTab==="schedule"&&<JobsTable dayData={cur} flashedJobs={flashedJobs} weeksCache={weeksCache} curSatKey={currentWeekSat}/>}
                {activeTab==="roster"&&<CrewRoster crews={cur?.crews} pools={cur?.pools} unavailable={cur?.unavailable} unassigned={cur?.unassigned} jobs={cur?.jobs} allData={data}/>}
                {activeTab==="week"&&<WeekOverview data={data} selectedDay={selectedDay} onSelectDay={d=>{setSelectedDay(d);setActiveTab("schedule");}}/>}
                {activeTab==="month"&&<MonthCalendar weeksCache={weeksCache} monthCursor={monthCursor} setMonthCursor={setMonthCursor} onPickDay={pickCalendarDay} mode={mode} requestWeek={fetchWeek} isMobile={isMobile}/>}
                {activeTab==="changes"&&<ChangeLogPanel changeLog={changeLog} onClear={()=>setChangeLog([])}/>}
                {activeTab==="people"&&<Suspense fallback={<PanelFallback/>}>
                  <ProfilesPanel weekData={data} onStoreChange={setProfiles}/>
                </Suspense>}
                {activeTab==="send"&&<Suspense fallback={<PanelFallback/>}>
                  <TeamsMessagePanel weekData={data} selectedDay={selectedDay} profiles={profiles} weekLabel={getWeekLabel(data)}/>
                </Suspense>}
              </>
        }
      </div>

      {/* Legend (collapsed behind a toggle on mobile) */}
      {isMobile&&(
        <button onClick={()=>setLegendOpen(o=>!o)} style={{margin:"0 12px 10px",padding:"7px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"7px",color:"#6b7789",fontSize:"11px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          {legendOpen?"▾":"▸"} What do the badges &amp; colors mean?
        </button>
      )}
      {(!isMobile||legendOpen)&&<div style={{padding:isMobile?"0 12px 14px":"0 24px 16px",display:"flex",gap:isMobile?"12px":"20px",fontSize:"10px",color:"#4a5568",flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
          <span style={{fontWeight:800,letterSpacing:"1px"}}>PM:</span>
          {["D","R","G","J","JE"].map(k=><PMBadge key={k} initials={k}/>)}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
          <span style={{fontWeight:800,letterSpacing:"1px"}}>QUALS:</span>
          <QualBadge code="T"/><span style={{color:"#6b7789"}}>Truck</span>
          <QualBadge code="V"/><span style={{color:"#6b7789"}}>Van</span>
          <QualBadge code="A"/><span style={{color:"#6b7789"}}>Apprentice</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
          <span style={{fontWeight:800,letterSpacing:"1px"}}>FOLDER:</span>
          <span style={{color:"#10b981"}}>✓</span> Yes <span style={{color:"#ef4444"}}>✗</span> No <span style={{color:"#a78bfa",fontWeight:700}}>SM</span> Site Map
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
          <span style={{display:"inline-block",width:"14px",height:"10px",borderRadius:"2px",background:"rgba(250,204,21,0.25)",border:"1px solid rgba(250,204,21,0.5)"}}/>
          <span style={{color:"#facc15",fontWeight:700}}>OT</span><span style={{color:"#6b7789"}}>= starts before 6 AM or 2 PM &amp; later</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
          <span style={{color:"#38bdf8",fontWeight:800}}>×2</span><span style={{color:"#6b7789"}}>= on multiple jobs that day</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
          <span style={{display:"inline-block",width:"14px",height:"10px",borderRadius:"2px",background:"rgba(239,68,68,0.2)",border:"1px solid rgba(239,68,68,0.5)"}}/>
          <span style={{color:"#ef4444",fontWeight:700,textDecoration:"line-through"}}>Red</span><span style={{color:"#6b7789"}}>= cancelled (struck through in log book)</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
          <span style={{fontSize:"8px",fontWeight:800,padding:"1px 5px",borderRadius:"3px",background:"rgba(239,68,68,0.12)",color:"#ef4444"}}>OUT</span>
          <span style={{color:"#6b7789"}}>= unavailable (vacation / injured / crossed out)</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
          <span style={{color:"#f59e0b",fontWeight:800}}>UNASSIGNED</span><span style={{color:"#6b7789"}}>= on roster but not under any crew</span>
        </div>
      </div>}

      {isMobile&&<BottomNav activeTab={activeTab} setActiveTab={setActiveTab} todayChangeCount={todayChangeCount} selectedDay={selectedDay}/>}
    </div>
  );
}
