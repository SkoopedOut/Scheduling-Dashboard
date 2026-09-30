import { useState, useEffect, useRef, Fragment, lazy, Suspense } from 'react';
import { initAuth, login, isConfigured } from './auth.js';
import { emptyStore, loadProfiles } from './profiles.js';

// Loaded on demand — these panels are only opened deliberately, so they
// stay out of the initial bundle the TV/kiosk view has to download.
const ProfilesPanel = lazy(() => import('./ProfilesPanel.jsx'));
const TeamsMessagePanel = lazy(() => import('./TeamsMessagePanel.jsx'));

function PanelFallback(){
  return <div style={{padding:"60px",display:"flex",justifyContent:"center"}}><Spinner size={22}/></div>;
}
import { fetchScheduleFromSharePoint } from './sharepoint.js';
import { SAMPLE_DATA, FOREMAN_ORDER } from './sampleData.js';
import {
  DAY_ORDER, PM_COLORS, SYS, foremanColor, REFRESH_MS, getTodayDayName, formatDate, getWeekLabel, getSaturdayKey,
  satKeyToLabel, isStopLabel, isNonPerson, canonicalName, isOvertimeStart, prevWeekSatKey, hasTruck,
} from './scheduleUtils.js';
import { A, APPLE_CSS, Icon, Segmented, Spinner, QualBadge, PMBadge, FolderIcon, Capsule, TintedButton, CircleButton, PlainButton, tint } from './ui/apple.jsx';
import SchedulePage, { WeekStrip } from './SchedulePage.jsx';

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

// ── Connection status (thin toolbar line) ────────────────────
function ConnectionBar({mode,lastRefresh,nextRefresh,isConnected,onConnect,onRefresh,error,fileMeta,isRefreshing,isMobile}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  const dot=error?SYS.red:isConnected?SYS.green:SYS.orange;
  const ago=lastRefresh?Math.floor((now-lastRefresh)/1000):null;
  const agoStr=ago==null?"":ago<60?`${ago}s ago`:`${Math.floor(ago/60)} min ago`;
  const next=nextRefresh?Math.max(0,Math.floor((nextRefresh-now)/1000)):null;
  return(
    <div role="status" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:isMobile?"8px 16px":"8px 28px",fontSize:12,
      color:A.label2,background:error?tint(SYS.red,0.12):"transparent",borderBottom:`0.5px solid ${A.sep}`,minHeight:36}}>
      <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,overflow:"hidden",whiteSpace:"nowrap"}}>
        <span style={{width:7,height:7,borderRadius:"50%",background:dot,flexShrink:0,boxShadow:`0 0 0 3px ${tint(dot,0.2)}`}}/>
        <span style={{color:error?SYS.red:A.label,fontWeight:500}}>{error?`Couldn’t refresh: ${error}`:mode==="demo"?"Demo — sample week":"Live from SharePoint"}</span>
        {!isMobile&&fileMeta?.fileName&&!error&&<span title={fileMeta?.matchedBy?`Matched by: ${fileMeta.matchedBy}`:undefined} style={{overflow:"hidden",textOverflow:"ellipsis"}}>{fileMeta.fileName}</span>}
        {!isMobile&&fileMeta?.lastModified&&<span>Saved {new Date(fileMeta.lastModified).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</span>}
      </div>
      <div className="tnum" style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        {mode==="live"&&!isMobile&&agoStr&&<span>Updated {agoStr}{next!=null&&` · next in ${Math.floor(next/60)}:${String(next%60).padStart(2,"0")}`}</span>}
        {mode==="live"&&(
          <button type="button" onClick={onRefresh} disabled={isRefreshing} className="ap-btn ap-press" aria-label="Refresh now" title="Refresh now" style={{
            display:"inline-flex",alignItems:"center",gap:5,background:"none",border:"none",color:isRefreshing?A.label3:A.tint,cursor:isRefreshing?"default":"pointer",fontSize:12,padding:"2px 4px"}}>
            {isRefreshing?<Spinner size={13}/>:<Icon name="refresh" size={14} weight={2.2}/>}{!isMobile&&(isRefreshing?"Refreshing…":"Refresh")}
          </button>
        )}
        {mode==="demo"&&<TintedButton onClick={onConnect} style={{fontSize:12,padding:"4px 11px"}}>{isConfigured()?"Sign in":"Demo only"}</TintedButton>}
      </div>
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
function MonthCalendar({weeksCache,monthCursor,setMonthCursor,onPickDay,mode,requestWeek,isMobile,onSearchMonth}){
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
        {onSearchMonth&&<TintedButton onClick={onSearchMonth} style={{fontSize:13}}><Icon name="search" size={14} weight={2.2}/>Search this month</TintedButton>}
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

// ── Mobile tab bar (UITabBar) ────────────────────────────────
function BottomNav({tabs,activeTab,setActiveTab}){
  return(
    <nav aria-label="Sections" style={{position:"fixed",bottom:0,left:0,right:0,zIndex:500,display:"flex",
      background:A.bar,backdropFilter:"saturate(180%) blur(20px)",WebkitBackdropFilter:"saturate(180%) blur(20px)",
      borderTop:`0.5px solid ${A.sep}`,paddingBottom:"env(safe-area-inset-bottom)"}}>
      {tabs.map(t=>{
        const active=activeTab===t.id;
        return(
          <button key={t.id} type="button" onClick={()=>setActiveTab(t.id)} aria-current={active?"page":undefined} className="ap-btn" style={{
            flex:1,minWidth:0,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"7px 0 5px",background:"transparent",
            border:"none",cursor:"pointer",color:active?A.tint:"#8E8E93",position:"relative"}}>
            <Icon name={t.icon} size={24} weight={active?2.1:1.7}/>
            <span style={{fontSize:10,fontWeight:500,letterSpacing:0.1}}>{t.l}</span>
            {t.badge>0&&<span className="tnum" style={{position:"absolute",top:3,left:"calc(50% + 6px)",minWidth:17,height:17,borderRadius:999,background:SYS.red,color:"#fff",fontSize:11,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 5px"}}>{t.badge}</span>}
          </button>
        );
      })}
    </nav>
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
  // Load state per week file: 'loading' | 'loaded' | 'failed' (drives month search progress)
  const [weekStatus,setWeekStatus]=useState({});
  // Schedule search: query + Day/Month scope + month view (jobs or a role) + open person.
  // Lives here so it survives switching tabs.
  const [search,setSearch]=useState({query:"",scope:"day",view:"jobs",person:null,fromMonth:false});
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
      setWeekStatus(st=>({...st,[satKey]:"loaded"}));
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
    // opts.once: try a week at most once per session (background prefetch)
    // opts.force: re-download even if cached (month search "Reload month")
    if(fetchingRef.current.has(satKey)) return;
    if(!opts.force&&weeksCache[satKey]) return;
    if(!opts.force&&opts.once&&attemptedRef.current.has(satKey)) return;
    attemptedRef.current.add(satKey);
    fetchingRef.current.add(satKey);
    setLoadingWeek(satKey);
    setWeekStatus(st=>({...st,[satKey]:"loading"}));
    try {
      const newData=await fetchScheduleFromSharePoint(new Date(satKey+'T12:00:00'));
      let meta=null;
      if(newData._meta){meta=newData._meta;delete newData._meta;}
      setWeeksCache(prev=>({...prev,[satKey]:newData}));
      setWeekStatus(st=>({...st,[satKey]:"loaded"}));
      if(satKey===currentWeekSatRef.current&&meta) setFileMeta(meta);
    } catch(e){
      console.error(`Failed to load week ${satKey}:`,e);
      setWeekStatus(st=>({...st,[satKey]:"failed"}));
      if(satKey===currentWeekSatRef.current&&!opts.once&&!opts.force) setError(e.message);
    } finally {
      fetchingRef.current.delete(satKey);
      setLoadingWeek(l=>l===satKey?null:l);
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
    setSearch(st=>({...st,scope:"day",fromMonth:false}));
  }
  // Opening a day from month search keeps a way back to the results
  function openDayFromMonth(info){
    pickCalendarDay(info);
    setSearch(st=>({...st,scope:"day",fromMonth:true}));
    window.scrollTo?.({top:0,behavior:"smooth"});
  }
  function searchMonth(){
    setActiveTab("schedule");
    setSearch(st=>({...st,scope:"month",fromMonth:false}));
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
    if(!isMobile||activeTab!=="schedule"||search.scope!=="day") return;
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
  const totalTrucks=curActive.filter(j=>hasTruck(j.trucks)).length;
  const weekLabel=getWeekLabel(data)||satKeyToLabel(currentWeekSat);
  const pad=isMobile?16:28;
  const TABS=[
    {id:"schedule",l:"Schedule",icon:"listBullet"},
    {id:"roster",l:"Roster",icon:"person2"},
    {id:"week",l:"Week",icon:"week"},
    {id:"month",l:"Month",icon:"calendar"},
    {id:"changes",l:"Changes",icon:"clock",badge:todayChangeCount},
    {id:"people",l:"People",icon:"personCard"},
    {id:"send",l:"Send",icon:"paperplane"},
  ];
  const weekNavTabs=activeTab==="week"||activeTab==="people"||activeTab==="send"||activeTab==="changes";
  const noWeekData=Object.keys(data).length===0;
  const stats=[{v:totalJobs,l:"Jobs"},{v:totalMen,l:"Men"},{v:totalTrucks,l:"Trucks"}];

  return(
    <div style={{minHeight:"100vh",background:A.bg,color:A.label,fontFamily:A.font,paddingBottom:isMobile?"calc(84px + env(safe-area-inset-bottom))":0}}>
      <style>{APPLE_CSS+`@keyframes jobFlash{0%,65%{background-color:${tint(SYS.green,0.22)};}100%{background-color:transparent;}} .job-flash{animation:jobFlash 4s ease-out forwards;} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      <ConnectionBar mode={mode} lastRefresh={lastRefresh} nextRefresh={nextRefresh} isConnected={mode==="live"} onConnect={handleConnect} onRefresh={refreshData} error={error} fileMeta={fileMeta} isRefreshing={isRefreshing} isMobile={isMobile}/>

      {/* Large title header */}
      <header style={{padding:`${isMobile?14:24}px ${pad}px 0`,maxWidth:1600,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:13,fontWeight:500,color:A.label2,marginBottom:2}}>Hub Office · Scheduling Team</div>
            <h1 style={{margin:0,fontSize:34,fontWeight:700,letterSpacing:"-0.025em",lineHeight:1.12}}>Daily Jobs</h1>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:isMobile?14:22}}>
            {!(activeTab==="schedule"&&search.scope==="month")&&<div style={{display:"flex",gap:isMobile?16:22}} aria-label={`${selectedDay}: ${totalJobs} jobs, ${totalMen} men, ${totalTrucks} trucks`}>
              {stats.map(s=>(
                <div key={s.l} style={{textAlign:"right"}}>
                  <div className="tnum" style={{fontSize:isMobile?22:28,fontWeight:600,lineHeight:1,letterSpacing:"-0.02em"}}>{s.v}</div>
                  <div style={{fontSize:12,color:A.label2,marginTop:3}}>{s.l}</div>
                </div>
              ))}
            </div>}
            <button type="button" onClick={enterTV} title="Full-screen TV / kiosk mode (bookmark with #tv in the URL)" className="ap-btn ap-press" style={{
              display:"inline-flex",alignItems:"center",gap:7,height:36,padding:isMobile?"0 10px":"0 14px",borderRadius:999,border:"none",cursor:"pointer",
              background:A.fill3,color:A.label,fontSize:14,fontWeight:500}}>
              <Icon name="tv" size={17}/>{!isMobile&&"TV mode"}
            </button>
          </div>
        </div>
        {!isMobile&&(
          <div style={{marginTop:20,maxWidth:760}}>
            <Segmented size="lg" ariaLabel="Sections" value={activeTab} onChange={setActiveTab} options={TABS.map(t=>({id:t.id,label:t.l,badge:t.badge}))}/>
          </div>
        )}
      </header>

      {/* Content */}
      <main onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{padding:`${isMobile?18:24}px ${pad}px ${isMobile?20:28}px`,maxWidth:1600,margin:"0 auto"}}>
        {weekNavTabs&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <CircleButton icon="chevronLeft" onClick={()=>navigateWeek(-1)} ariaLabel="Previous week" size={30}/>
            <div className="tnum" style={{fontSize:15,fontWeight:600,minWidth:170,textAlign:"center"}}>{weekLabel}</div>
            <CircleButton icon="chevronRight" onClick={()=>navigateWeek(1)} ariaLabel="Next week" size={30}/>
            {currentWeekSat!==INITIAL_SAT&&<PlainButton onClick={goToCurrentWeek}>Today</PlainButton>}
            {loadingWeek===currentWeekSat&&<Spinner size={14}/>}
          </div>
        )}
        {loadingWeek===currentWeekSat&&!weeksCache[currentWeekSat]&&activeTab!=="month"&&!(activeTab==="schedule"&&search.scope==="month")
          ? <div style={{padding:"80px 20px",textAlign:"center",color:A.label2}}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:14}}><Spinner size={28}/></div>
              <div style={{fontSize:15}}>Loading {satKeyToLabel(currentWeekSat)}…</div>
            </div>
          : noWeekData&&!["month","changes","people"].includes(activeTab)&&!(activeTab==="schedule"&&search.scope==="month")
            ? <div style={{padding:"72px 20px",textAlign:"center"}}>
                <div style={{fontSize:17,fontWeight:600}}>{mode==="live"?"No log book for this week":"Sign in to load this week"}</div>
                <div style={{fontSize:14,color:A.label2,marginTop:6,maxWidth:440,marginInline:"auto"}}>{mode==="live"?`Nothing was found in SharePoint for ${satKeyToLabel(currentWeekSat)}.`:"Demo mode only has the sample week, March 22–28, 2026."}</div>
                <div style={{marginTop:16,display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                  {currentWeekSat!==INITIAL_SAT&&<TintedButton onClick={goToCurrentWeek}>Go to this week</TintedButton>}
                  {mode!=="live"&&<TintedButton onClick={()=>{setCurrentWeekSat(SAMPLE_SAT);currentWeekSatRef.current=SAMPLE_SAT;}}>Show the sample week</TintedButton>}
                  {activeTab==="schedule"&&<TintedButton onClick={searchMonth} color={SYS.indigo}><Icon name="search" size={15} weight={2.2}/>Search a month</TintedButton>}
                </div>
              </div>
            : <>
                {activeTab==="schedule"&&<SchedulePage data={data} weeksCache={weeksCache} currentWeekSat={currentWeekSat} weekLabel={weekLabel}
                  selectedDay={selectedDay} setSelectedDay={setSelectedDay} onPrevWeek={()=>navigateWeek(-1)} onNextWeek={()=>navigateWeek(1)}
                  onToday={goToCurrentWeek} isCurrentWeek={currentWeekSat===INITIAL_SAT} loadingWeek={loadingWeek} flashedJobs={flashedJobs}
                  isMobile={isMobile} mode={mode} profiles={profiles} weekStatus={weekStatus} requestWeek={fetchWeek}
                  monthCursor={monthCursor} setMonthCursor={setMonthCursor} search={search} setSearch={setSearch} onOpenDay={openDayFromMonth}/>}
                {activeTab==="roster"&&<>
                  <WeekStrip data={data} selectedDay={selectedDay} setSelectedDay={setSelectedDay} weekLabel={weekLabel}
                    onPrev={()=>navigateWeek(-1)} onNext={()=>navigateWeek(1)} onToday={goToCurrentWeek} showToday={currentWeekSat!==INITIAL_SAT}
                    loading={loadingWeek===currentWeekSat} isMobile={isMobile}/>
                  <Panel><CrewRoster crews={cur?.crews} pools={cur?.pools} unavailable={cur?.unavailable} unassigned={cur?.unassigned} jobs={cur?.jobs} allData={data}/></Panel>
                </>}
                {activeTab==="week"&&<Panel><WeekOverview data={data} selectedDay={selectedDay} onSelectDay={d=>{setSelectedDay(d);setActiveTab("schedule");setSearch(st=>({...st,scope:"day"}));}}/></Panel>}
                {activeTab==="month"&&<Panel><MonthCalendar weeksCache={weeksCache} monthCursor={monthCursor} setMonthCursor={setMonthCursor} onPickDay={pickCalendarDay} mode={mode} requestWeek={fetchWeek} isMobile={isMobile} onSearchMonth={searchMonth}/></Panel>}
                {activeTab==="changes"&&<Panel><ChangeLogPanel changeLog={changeLog} onClear={()=>setChangeLog([])}/></Panel>}
                {activeTab==="people"&&<Panel><Suspense fallback={<PanelFallback/>}>
                  <ProfilesPanel weekData={data} onStoreChange={setProfiles}/>
                </Suspense></Panel>}
                {activeTab==="send"&&<Panel><Suspense fallback={<PanelFallback/>}>
                  <TeamsMessagePanel weekData={data} selectedDay={selectedDay} profiles={profiles} weekLabel={getWeekLabel(data)}/>
                </Suspense></Panel>}
              </>
        }
      </main>

      {/* Legend */}
      <footer style={{padding:`0 ${pad}px 24px`,maxWidth:1600,margin:"0 auto"}}>
        <button type="button" onClick={()=>setLegendOpen(o=>!o)} aria-expanded={legendOpen} className="ap-btn ap-press" style={{
          display:"inline-flex",alignItems:"center",gap:6,background:"none",border:"none",padding:"4px 0",color:A.label2,fontSize:13,cursor:"pointer"}}>
          <Icon name="chevronRight" size={13} weight={2.4} style={{transform:legendOpen?"rotate(90deg)":"none",transition:"transform .2s"}}/>
          What the colors and badges mean
        </button>
        {legendOpen&&<Legend/>}
      </footer>

      {isMobile&&<BottomNav tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab}/>}
    </div>
  );
}

// Rounded container for the tabs that haven't been redesigned yet
function Panel({children}){
  return <div style={{background:A.cell,borderRadius:12,padding:"18px"}}>{children}</div>;
}

function Legend(){
  const item=(k,v)=><div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:A.label2}}>{k}<span>{v}</span></div>;
  return(
    <div className="ap-fade" style={{marginTop:10,background:A.cell,borderRadius:12,padding:"14px 16px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:"10px 24px"}}>
      {item(<span style={{display:"flex",gap:4}}>{["D","R","G","J","JE"].map(k=><PMBadge key={k} initials={k} size="sm"/>)}</span>,"Project manager who called it in")}
      {item(<span style={{display:"flex"}}><QualBadge code="T"/><QualBadge code="V"/><QualBadge code="A"/></span>,"Truck driver, van driver, apprentice")}
      {item(<FolderIcon val="y"/>,"Job folder still needed")}
      {item(<span style={{display:"flex",gap:4}}><FolderIcon val="sm"/><FolderIcon val="sm-half"/></span>,"Folder done / partly done by Stephanie")}
      {item(<Capsule color={SYS.yellow}>OT</Capsule>,"Starts before 6 AM, or at 2 PM and later")}
      {item(<Capsule color={SYS.red}>Cancelled</Capsule>,"Struck through in the log book")}
      {item(<Capsule color={SYS.green}>New</Capsule>,"Job # wasn’t on the day before")}
      {item(<span style={{color:SYS.green,display:"flex",alignItems:"center",gap:3,fontSize:13}}><Icon name="arrowRight" size={12} weight={2.6}/>Name</span>,"Moved from a different job")}
      {item(<span style={{color:SYS.cyan,fontWeight:700,fontSize:13}}>×2</span>,"On two jobs in the same time slot")}
      {item(<Icon name="truck" size={15} color={SYS.purple}/>,"Driving (“-T” after the name)")}
      {item(<Capsule color={SYS.red}>OUT</Capsule>,"Unavailable — vacation, injured or crossed out")}
      {item(<span style={{color:SYS.orange,fontWeight:600,fontSize:13}}>Unassigned</span>,"On the roster but not under any crew")}
    </div>
  );
}
