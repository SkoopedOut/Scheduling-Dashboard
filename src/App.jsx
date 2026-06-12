import { useState, useEffect, useRef, Fragment } from 'react';
import { initAuth, login, isConfigured } from './auth.js';
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

function FolderIcon({val}){
  if(val==="sm") return <span style={{fontSize:"10px",fontWeight:700,color:"#a78bfa"}}>SM</span>;
  if(val==="y") return <span style={{color:"#10b981",fontSize:"14px"}}>✓</span>;
  if(val==="n") return <span style={{color:"#ef4444",fontSize:"14px"}}>✗</span>;
  return <span style={{color:"#444"}}>—</span>;
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
function isDriverTag(name){ return /-[tvTV]$/.test(String(name).trim()); }
function isNonPerson(name){ return isStopLabel(name)||isDriverTag(name); }

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

function getConflictsForDay(dayData){
  const jobs=dayData?.jobs||[];
  const personMap={};
  for(const job of jobs){
    for(const name of (job.crew||[])){
      if(isNonPerson(name)) continue; // skip stop labels and driver tags
      if(!personMap[name]) personMap[name]=new Map();
      // Same poJob = same job (regular + OT), don't count as conflict
      const key=job.poJob?String(job.poJob):`__num_${job.num}`;
      if(!personMap[name].has(key)) personMap[name].set(key,job);
    }
  }
  return Object.entries(personMap)
    .filter(([,map])=>map.size>1)
    .map(([name,map])=>({name,jobs:Array.from(map.values())}));
}

// ── Jobs Table ───────────────────────────────────────────────
function JobsTable({dayData,flashedJobs}){
  const [hlPerson,setHlPerson]=useState(null);
  useEffect(()=>{setHlPerson(null);},[dayData?.day]);
  if(!dayData?.jobs?.length) return <div style={{padding:"50px",textAlign:"center",color:"#444",fontStyle:"italic"}}>No jobs scheduled.</div>;
  const jobs=dayData.jobs;
  // Foremen come from today's parsed roster (bold names in the sheet), so renames just work
  const foremanKeys=Object.keys(dayData.crews||{});
  const foremanIdx=new Map(foremanKeys.map((f,i)=>[f,i]));
  const isForeman=n=>foremanIdx.has(n)||FOREMAN_ORDER.includes(n);
  const colorOf=n=>foremanColor(n,foremanIdx.has(n)?foremanIdx.get(n):FOREMAN_ORDER.indexOf(n));
  const togglePerson=n=>setHlPerson(p=>p===n?null:n);
  const multiJobs=getConflictsForDay(dayData); // people on more than one job today (informational, not a conflict)
  const multiCounts=new Map(multiJobs.map(c=>[c.name,c.jobs.length]));
  // Group overtime jobs together at the bottom, keeping sheet order within each group
  const regularJobs=jobs.filter(j=>!isOvertimeStart(j.onsiteTime));
  const otJobs=jobs.filter(j=>isOvertimeStart(j.onsiteTime));
  const orderedJobs=[...regularJobs,...otJobs];
  const unassigned=jobs.filter(j=>!j.crew?.length);
  // Headcount: only count real people (exclude stop labels and driver tags)
  const hcMismatches=jobs.filter(j=>{
    if(j.numMen==null) return false;
    const persons=(j.crew||[]).filter(n=>!isNonPerson(n));
    return persons.length>0&&j.numMen!==persons.length;
  });
  const hasIssues=multiJobs.length>0||unassigned.length>0||hcMismatches.length>0;
  // Day totals
  const totalMen=jobs.reduce((s,j)=>s+(j.numMen||0),0);
  const uniqueCrew=new Set(jobs.flatMap(j=>(j.crew||[]).filter(n=>!isNonPerson(n)))).size;
  const totalTrucks=jobs.filter(j=>j.trucks&&!/^(na|n\/a)$/i.test(j.trucks.trim())).length;
  return(
    <div>
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
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"13px"}}>
          <thead><tr style={{borderBottom:"2px solid #1a2436"}}>
            {["#","Customer","PO / Job#","Location","Onsite","Trucks","Men","Crew","PM","Folder"].map(h=>
              <th key={h} style={{padding:"10px 8px",textAlign:"left",fontSize:"9px",fontWeight:800,letterSpacing:"1.2px",color:"#4a5568",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
            )}
          </tr></thead>
          <tbody>{orderedJobs.map((job,i)=>{
            const noCrewFlag=!job.crew?.length;
            const persons=(job.crew||[]).filter(n=>!isNonPerson(n));
            const hcFlag=job.numMen!=null&&persons.length>0&&job.numMen!==persons.length;
            const isFlashed=flashedJobs?.has(`${dayData.day}-${job.num}`);
            const pmColor=PM_COLORS[(job.calledIn||'').toUpperCase()];
            const isOT=isOvertimeStart(job.onsiteTime);
            const firstOT=isOT&&otJobs.length>0&&job===otJobs[0]&&regularJobs.length>0;
            const onHlJob=hlPerson?(job.crew||[]).includes(hlPerson):false;
            const rowBg=onHlJob?"rgba(56,189,248,0.10)":isOT?"rgba(250,204,21,0.09)":noCrewFlag?"rgba(245,158,11,0.05)":i%2?"rgba(255,255,255,0.012)":"transparent";
            const hoverBg=onHlJob?"rgba(56,189,248,0.16)":isOT?"rgba(250,204,21,0.16)":"rgba(74,158,255,0.04)";
            const rowOpacity=hlPerson&&!onHlJob?0.3:1;
            return(
              <Fragment key={`${job.num}-${i}`}>
              {firstOT&&(
                <tr><td colSpan={10} style={{padding:"14px 8px 6px",fontSize:"9px",fontWeight:800,letterSpacing:"1.5px",color:"#facc15",borderBottom:"1px solid rgba(250,204,21,0.25)"}}>
                  ⏱ OVERTIME — starts before 6:00 AM or 2:00 PM &amp; later
                </td></tr>
              )}
              <tr className={isFlashed?"job-flash":""} style={{borderBottom:"1px solid rgba(255,255,255,0.03)",background:rowBg,transition:"background 0.12s, opacity 0.15s",opacity:rowOpacity,boxShadow:onHlJob?"inset 0 0 0 1px rgba(56,189,248,0.35)":"none"}}
                onMouseEnter={e=>e.currentTarget.style.background=hoverBg}
                onMouseLeave={e=>e.currentTarget.style.background=rowBg}>
                <td style={{padding:"10px 8px",fontWeight:800,color:isOT?"#facc15":"#4a9eff",fontFamily:"'JetBrains Mono',monospace",borderLeft:`3px solid ${isOT?"#facc15":pmColor||"transparent"}`}}>{job.num}</td>
                <td style={{padding:"10px 8px",fontWeight:700,color:"#e2e8f0",maxWidth:"150px"}}>{job.customer}</td>
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
                        const isF=isForeman(n); const fc=isF?colorOf(n):null;
                        const multiCount=multiCounts.get(n);
                        const isHl=hlPerson===n;
                        const isStop=isStopLabel(n);
                        const isDrv=isDriverTag(n);
                        if(isStop) return <span key={j} style={{fontSize:"9px",fontWeight:700,letterSpacing:"0.5px",color:"#2d3748",padding:"1px 5px",borderRadius:"3px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)"}}>{n.toUpperCase()}</span>;
                        if(isDrv) return <span key={j} style={{display:"inline-block",padding:"2px 7px",borderRadius:"4px",fontSize:"11px",background:"rgba(139,92,246,0.08)",color:"#8b5cf6",fontWeight:500,border:"1px solid rgba(139,92,246,0.2)"}} title="Driver">{n}</span>;
                        const chip=<span style={{display:"inline-block",padding:"2px 7px",borderRadius:"4px",fontSize:"11px",
                          background:isHl?"rgba(56,189,248,0.2)":isF?`${fc}18`:"rgba(255,255,255,0.05)",
                          color:isF?fc:"#9ca3af",
                          fontWeight:isF?700:400,
                          border:isHl?"1px solid rgba(56,189,248,0.7)":multiCount?"1px solid rgba(56,189,248,0.45)":isF?`1px solid ${fc}35`:"1px solid transparent"
                        }}>{n}{multiCount&&<span style={{marginLeft:"4px",fontSize:"9px",fontWeight:800,color:"#38bdf8"}}>×{multiCount}</span>}</span>;
                        if(multiCount) return <button key={j} onClick={()=>togglePerson(n)} title={isHl?"Click to clear highlight":`On ${multiCount} jobs today — click to highlight them`} style={{background:"transparent",border:"none",padding:0,cursor:"pointer",fontFamily:"inherit"}}>{chip}</button>;
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
                <span style={{color:"#e2e8f0",fontWeight:600}}>{uniqueCrew}</span> unique · <span style={{color:"#e2e8f0",fontWeight:600}}>{jobs.length}</span> jobs{otJobs.length>0&&<> · <span style={{color:"#facc15",fontWeight:600}}>{otJobs.length}</span> OT</>} · <span style={{color:"#10b981",fontWeight:600}}>{totalTrucks}</span> w/ truck
              </td>
              <td colSpan={2}/>
            </tr>
          </tfoot>
        </table>
      </div>
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
function CrewRoster({crews,pools,allData}){
  const [selectedPerson,setSelectedPerson]=useState(null);
  const [selectedPM,setSelectedPM]=useState(null);
  if(!crews) return null;
  const foremanList=getForemanList(crews);

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
      <div style={{fontSize:"10px",fontWeight:800,letterSpacing:"1.5px",color:"#4a5568",marginBottom:"12px"}}>FOREMAN CREWS</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px",marginBottom:"28px"}}>
        {foremanList.map((f,fi)=>{
          const crew=crews[f]; const color=foremanColor(f,fi);
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
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px"}}>
        {[{title:"LABORERS",data:pools?.laborers||[],accent:"#10b981"},{title:"DRIVERS",data:pools?.drivers||[],accent:"#e8a948"},{title:"EXTRA",data:pools?.extra||[],accent:"#a78bfa"}].map(sec=>
          <div key={sec.title} style={{background:"rgba(255,255,255,0.02)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)",padding:"12px"}}>
            <div style={{fontSize:"10px",fontWeight:800,letterSpacing:"1.5px",color:sec.accent,marginBottom:"8px",borderBottom:`1px solid ${sec.accent}25`,paddingBottom:"6px"}}>
              {sec.title} <span style={{color:"#444",fontWeight:400}}>({sec.data.length})</span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
              {sec.data.map((p,i)=>
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
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"8px"}}>
      {DAY_ORDER.map(dn=>{
        const d=data[dn]; const jc=d?.jobs?.length||0; const tm=d?.jobs?.reduce((s,j)=>s+(j.numMen||0),0)||0;
        const otc=(d?.jobs||[]).filter(j=>isOvertimeStart(j.onsiteTime)).length;
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
            <div style={{fontSize:"12px",color:"#e8a948",fontWeight:700,marginTop:"8px",fontFamily:"'JetBrains Mono',monospace"}}>{tm} <span style={{fontSize:"9px",color:"#444"}}>MEN</span></div>
            {otc>0&&<div style={{fontSize:"9px",fontWeight:800,color:"#facc15",marginTop:"4px",fontFamily:"'JetBrains Mono',monospace"}}>⏱ {otc} OT</div>}
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

  // Auto-advance day at midnight
  useEffect(()=>{
    const t=setInterval(()=>{
      const today=getTodayDayName();
      if(selectedDay!==today&&activeTab==="schedule") setSelectedDay(today);
    },60000);
    return()=>clearInterval(t);
  },[selectedDay,activeTab]);

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
        for(const day of DAY_ORDER){
          const oldJobs=oldData[day]?.jobs||[];
          for(const nj of (newData[day]?.jobs||[])){
            const oj=oldJobs.find(j=>j.num===nj.num);
            if(!oj||JSON.stringify(oj)!==JSON.stringify(nj)) changed.add(`${day}-${nj.num}`);
          }
        }
        if(changed.size>0){setFlashedJobs(changed);setTimeout(()=>setFlashedJobs(new Set()),4000);}
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
  async function fetchWeek(satKey){
    if(weeksCache[satKey]||fetchingRef.current.has(satKey)) return;
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
      if(satKey===currentWeekSatRef.current) setError(e.message);
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

  const cur=data[selectedDay];
  const totalJobs=cur?.jobs?.length||0;
  const totalMen=cur?.jobs?.reduce((s,j)=>s+(j.numMen||0),0)||0;
  const totalTrucks=cur?.jobs?.filter(j=>j.trucks&&j.trucks!=="na"&&j.trucks!=="n/a").length||0;

  return(
    <div style={{minHeight:"100vh",background:"#0a0f16",color:"#e2e8f0",fontFamily:"'Inter',-apple-system,sans-serif"}}>
      <style>{`@keyframes jobFlash{0%,65%{background-color:rgba(16,185,129,0.18);}100%{background-color:transparent;}} .job-flash{animation:jobFlash 4s ease-out forwards;}`}</style>
      <ConnectionBar mode={mode} lastRefresh={lastRefresh} nextRefresh={nextRefresh} isConnected={mode==="live"} onConnect={handleConnect} onRefresh={refreshData} error={error} fileMeta={fileMeta} isRefreshing={isRefreshing}/>

      {/* Header */}
      <div style={{padding:"20px 24px 0",display:"flex",alignItems:"flex-end",justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
        <div>
          <div style={{fontSize:"9px",fontWeight:800,letterSpacing:"2.5px",color:"#4a9eff",marginBottom:"3px"}}>SCHEDULING TEAM</div>
          <h1 style={{margin:0,fontSize:"26px",fontWeight:900,letterSpacing:"-0.5px"}}>Daily Jobs Dashboard</h1>
          <div style={{display:"flex",alignItems:"center",gap:"6px",marginTop:"4px"}}>
            <button onClick={()=>navigateWeek(-1)} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#7a8599",cursor:"pointer",borderRadius:"4px",padding:"1px 8px",fontSize:"15px",fontFamily:"inherit",lineHeight:1.4}}>‹</button>
            <span style={{fontSize:"12px",color:"#4a5568",minWidth:"210px",textAlign:"center"}}>{getWeekLabel(data)||satKeyToLabel(currentWeekSat)}</span>
            <button onClick={()=>navigateWeek(1)} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#7a8599",cursor:"pointer",borderRadius:"4px",padding:"1px 8px",fontSize:"15px",fontFamily:"inherit",lineHeight:1.4}}>›</button>
            {currentWeekSat!==INITIAL_SAT&&<button onClick={goToCurrentWeek} style={{background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",color:"#10b981",cursor:"pointer",borderRadius:"4px",padding:"2px 9px",fontSize:"10px",fontFamily:"inherit",fontWeight:700,letterSpacing:"0.5px"}}>TODAY</button>}
            {loadingWeek===currentWeekSat&&<span style={{fontSize:"10px",color:"#4a9eff",fontFamily:"'JetBrains Mono',monospace"}}>⟳ Loading...</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:"10px"}}>
          {[{v:totalJobs,l:"JOBS",c:"#4a9eff"},{v:totalMen,l:"MEN",c:"#e8a948"},{v:totalTrucks,l:"TRUCKS",c:"#10b981"}].map(s=>
            <div key={s.l} style={{textAlign:"center",padding:"8px 18px",background:"rgba(255,255,255,0.02)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.05)"}}>
              <div style={{fontSize:"24px",fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
              <div style={{fontSize:"8px",fontWeight:800,letterSpacing:"1.2px",color:"#4a5568",marginTop:"2px"}}>{s.l}</div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{padding:"18px 24px 0",display:"flex",gap:"2px"}}>
        {[{id:"schedule",l:`${selectedDay}'s Schedule`},{id:"roster",l:"Crew Roster"},{id:"week",l:"Week at a Glance"}].map(t=>
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
            padding:"10px 20px",borderRadius:"8px 8px 0 0",cursor:"pointer",fontFamily:"inherit",
            background:activeTab===t.id?"rgba(255,255,255,0.03)":"transparent",
            border:activeTab===t.id?"1px solid rgba(255,255,255,0.06)":"1px solid transparent",
            borderBottom:activeTab===t.id?"1px solid #0a0f16":"1px solid transparent",
            color:activeTab===t.id?"#e2e8f0":"#4a5568",fontSize:"12px",fontWeight:activeTab===t.id?700:500,
            position:"relative",bottom:"-1px"}}>{t.l}</button>
        )}
      </div>

      {/* Content */}
      <div style={{margin:"0 24px 24px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:"0 8px 8px 8px",padding:"20px",minHeight:"420px"}}>
        {loadingWeek===currentWeekSat&&!weeksCache[currentWeekSat]
          ? <div style={{padding:"80px",textAlign:"center",color:"#4a5568"}}>
              <div style={{fontSize:"28px",marginBottom:"12px",animation:"spin 1s linear infinite"}}>⟳</div>
              <div>Loading {satKeyToLabel(currentWeekSat)}…</div>
            </div>
          : Object.keys(data).length===0
            ? <div style={{padding:"80px",textAlign:"center",color:"#4a5568",fontStyle:"italic"}}>
                {mode==="live"?"No data found for this week.":"Connect to SharePoint to load this week, or use ‹ › to browse to the sample week (Mar 22–28, 2026)."}
              </div>
            : <>
                {(activeTab==="schedule"||activeTab==="roster")&&
                  <div style={{display:"flex",gap:"3px",marginBottom:"14px",borderBottom:"1px solid rgba(255,255,255,0.04)",paddingBottom:"10px"}}>
                    {DAY_ORDER.map(d=>{const isToday=d===getTodayDayName(),isSel=d===selectedDay;
                      const djc=data[d]?.jobs?.length||0;
                      return <button key={d} onClick={()=>setSelectedDay(d)} style={{
                        padding:"6px 14px",borderRadius:"6px",cursor:"pointer",fontSize:"11px",fontWeight:isSel?700:500,fontFamily:"inherit",
                        background:isSel?"rgba(74,158,255,0.1)":"transparent",border:isSel?"1px solid rgba(74,158,255,0.25)":"1px solid transparent",
                        color:isSel?"#4a9eff":isToday?"#10b981":djc>0?"#7a8599":"#3a4254"}}>
                        {d.substring(0,3)}{djc>0&&<span style={{marginLeft:"5px",fontSize:"9px",fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color:isSel?"#4a9eff":"#4a5568"}}>{djc}</span>}{isToday&&!isSel&&<span style={{display:"inline-block",width:"4px",height:"4px",borderRadius:"50%",background:"#10b981",marginLeft:"4px",verticalAlign:"middle"}}/>}
                      </button>;
                    })}
                  </div>
                }
                {activeTab==="schedule"&&<JobsTable dayData={cur} flashedJobs={flashedJobs}/>}
                {activeTab==="roster"&&<CrewRoster crews={cur?.crews} pools={cur?.pools} allData={data}/>}
                {activeTab==="week"&&<WeekOverview data={data} selectedDay={selectedDay} onSelectDay={d=>{setSelectedDay(d);setActiveTab("schedule");}}/>}
              </>
        }
      </div>

      {/* Legend */}
      <div style={{padding:"0 24px 16px",display:"flex",gap:"20px",fontSize:"10px",color:"#4a5568",flexWrap:"wrap"}}>
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
      </div>
    </div>
  );
}
