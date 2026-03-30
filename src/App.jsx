import { useState, useEffect } from 'react';
import { initAuth, login, isConfigured } from './auth.js';
import { fetchScheduleFromSharePoint } from './sharepoint.js';
import { SAMPLE_DATA, FOREMAN_ORDER } from './sampleData.js';

const DAY_ORDER = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const FOREMAN_COLORS = {
  Jeremy:"#4a9eff", Phil:"#f59e0b", Matt:"#10b981", Kritter:"#f472b6",
  Eddie:"#a78bfa", Foley:"#06b6d4", Ayotte:"#ef4444", Brian:"#84cc16",
};
const REFRESH_MS = 5 * 1000;

function getTodayDayName(){ return DAY_ORDER[new Date().getDay()]; }
function formatDate(ds){ if(!ds) return ""; return new Date(ds+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}); }
function getWeekLabel(d){ const dt=DAY_ORDER.map(x=>d[x]?.date).filter(Boolean); if(dt.length<2) return "This Week"; const a=new Date(dt[0]+"T12:00:00"),b=new Date(dt[dt.length-1]+"T12:00:00"); return `${a.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${b.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`; }

// ── Small Components ─────────────────────────────────────────
function QualBadge({code}){
  if(!code) return null;
  const m={T:{bg:"#1e3a5f",fg:"#7eb8f7"},V:{bg:"#3b2d1a",fg:"#e8a948"},A:{bg:"#1a3328",fg:"#5ec490"}};
  const c=m[code]||{bg:"#333",fg:"#aaa"};
  return <span style={{display:"inline-block",fontSize:"8px",fontWeight:800,padding:"1px 4px",borderRadius:"3px",marginLeft:"3px",background:c.bg,color:c.fg,letterSpacing:"0.5px"}}>{code}</span>;
}

function PMBadge({initials}){
  if(!initials) return <span style={{color:"#444"}}>—</span>;
  const p={D:"#4a9eff",R:"#f59e0b",G:"#10b981",J:"#a78bfa",JE:"#f472b6"};
  return <span style={{display:"inline-block",fontSize:"10px",fontWeight:700,padding:"2px 8px",borderRadius:"4px",background:p[initials.toUpperCase()]||"#555",color:"#fff"}}>{initials.toUpperCase()}</span>;
}

function FolderIcon({val}){
  if(val==="sm") return <span style={{fontSize:"10px",fontWeight:700,color:"#a78bfa"}}>SM</span>;
  if(val==="y") return <span style={{color:"#10b981",fontSize:"14px"}}>✓</span>;
  if(val==="n") return <span style={{color:"#ef4444",fontSize:"14px"}}>✗</span>;
  return <span style={{color:"#444"}}>—</span>;
}

// ── Connection Bar ───────────────────────────────────────────
function ConnectionBar({mode,lastRefresh,nextRefresh,isConnected,onConnect,error}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 20px",fontSize:"11px",fontFamily:"'JetBrains Mono',monospace",background:error?"rgba(239,68,68,0.06)":isConnected?"rgba(16,185,129,0.06)":"rgba(245,158,11,0.06)",borderBottom:`1px solid ${error?"rgba(239,68,68,0.15)":isConnected?"rgba(16,185,129,0.15)":"rgba(245,158,11,0.15)"}`,color:"#6b7789"}}>
      <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
        <span style={{width:"6px",height:"6px",borderRadius:"50%",background:error?"#ef4444":isConnected?"#10b981":"#f59e0b"}}/>
        <span>{error ? `ERROR: ${error}` : mode==="demo"?"DEMO MODE — Sample data":"LIVE — SharePoint connected"}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
        {lastRefresh && <span>Refreshed {Math.floor((now-lastRefresh)/1000)}s ago</span>}
        {nextRefresh && <span>Next in {Math.max(0,Math.floor((nextRefresh-now)/1000))}s</span>}
        {mode==="demo" && (
          <button onClick={onConnect} style={{background:"rgba(74,158,255,0.12)",border:"1px solid rgba(74,158,255,0.25)",color:"#4a9eff",padding:"3px 10px",borderRadius:"4px",fontSize:"10px",cursor:"pointer",fontWeight:700}}>
            {isConfigured() ? "SIGN IN" : "DEMO ONLY"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Jobs Table ───────────────────────────────────────────────
function JobsTable({dayData}){
  if(!dayData?.jobs?.length) return <div style={{padding:"50px",textAlign:"center",color:"#444",fontStyle:"italic"}}>No jobs scheduled.</div>;
  return(
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:"13px"}}>
        <thead><tr style={{borderBottom:"2px solid #1a2436"}}>
          {["#","Customer","PO / Job#","Location","Onsite","Trucks","Men","Crew","PM","Folder"].map(h=>
            <th key={h} style={{padding:"10px 8px",textAlign:"left",fontSize:"9px",fontWeight:800,letterSpacing:"1.2px",color:"#4a5568",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
          )}
        </tr></thead>
        <tbody>{dayData.jobs.map((job,i)=>
          <tr key={i} style={{borderBottom:"1px solid rgba(255,255,255,0.03)",background:i%2?"rgba(255,255,255,0.012)":"transparent",transition:"background 0.12s"}}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(74,158,255,0.04)"}
            onMouseLeave={e=>e.currentTarget.style.background=i%2?"rgba(255,255,255,0.012)":"transparent"}>
            <td style={{padding:"10px 8px",fontWeight:800,color:"#4a9eff",fontFamily:"'JetBrains Mono',monospace"}}>{job.num}</td>
            <td style={{padding:"10px 8px",fontWeight:700,color:"#e2e8f0",maxWidth:"150px"}}>{job.customer}</td>
            <td style={{padding:"10px 8px",color:"#7a8599",fontFamily:"'JetBrains Mono',monospace",fontSize:"11px"}}>{job.poJob||"—"}</td>
            <td style={{padding:"10px 8px",color:"#7a8599",maxWidth:"190px",fontSize:"12px"}}>{job.location||"—"}</td>
            <td style={{padding:"10px 8px",fontWeight:700,color:"#e8a948",whiteSpace:"nowrap",fontFamily:"'JetBrains Mono',monospace",fontSize:"12px"}}>{job.onsiteTime||"TBD"}</td>
            <td style={{padding:"10px 8px",color:"#7a8599",fontSize:"12px"}}>{job.trucks||"—"}</td>
            <td style={{padding:"10px 8px",fontWeight:800,textAlign:"center",color:job.numMen>=5?"#f472b6":"#e2e8f0",fontSize:"15px"}}>{job.numMen||"—"}</td>
            <td style={{padding:"10px 8px",maxWidth:"300px"}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {(job.crew||[]).map((n,j)=>{
                  const isF=FOREMAN_ORDER.includes(n); const fc=FOREMAN_COLORS[n];
                  return <span key={j} style={{display:"inline-block",padding:"2px 7px",borderRadius:"4px",fontSize:"11px",
                    background:isF?`${fc}18`:"rgba(255,255,255,0.05)",color:isF?fc:"#9ca3af",
                    fontWeight:isF?700:400,border:isF?`1px solid ${fc}35`:"1px solid transparent"}}>{n}</span>;
                })}
              </div>
            </td>
            <td style={{padding:"10px 8px",textAlign:"center"}}><PMBadge initials={job.calledIn}/></td>
            <td style={{padding:"10px 8px",textAlign:"center"}}><FolderIcon val={job.jobFolder}/></td>
          </tr>
        )}</tbody>
      </table>
    </div>
  );
}

// ── Crew Roster ──────────────────────────────────────────────
function CrewRoster({crews,pools}){
  if(!crews) return null;
  return(
    <div>
      <div style={{fontSize:"10px",fontWeight:800,letterSpacing:"1.5px",color:"#4a5568",marginBottom:"12px"}}>FOREMAN CREWS</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px",marginBottom:"28px"}}>
        {FOREMAN_ORDER.map(f=>{
          const crew=crews[f]; const color=FOREMAN_COLORS[f];
          return(
            <div key={f} style={{background:"rgba(255,255,255,0.02)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)",padding:"12px",borderTop:`3px solid ${color}`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"8px"}}>
                <span style={{fontSize:"13px",fontWeight:800,color}}>{f}</span>
                <span style={{fontSize:"8px",fontWeight:700,letterSpacing:"1px",padding:"2px 6px",borderRadius:"3px",background:`${color}15`,color,border:`1px solid ${color}30`}}>FOREMAN</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                {(crew?.members||[]).map((m,i)=>
                  <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 8px",borderRadius:"4px",background:"rgba(255,255,255,0.03)",fontSize:"12px",color:"#b0bac7"}}>
                    <span>{m.name}</span><QualBadge code={m.qual}/>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{fontSize:"10px",fontWeight:800,letterSpacing:"1.5px",color:"#4a5568",marginBottom:"12px"}}>AVAILABLE POOL</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px"}}>
        {[{title:"LABORERS",data:pools?.laborers||[],accent:"#10b981"},{title:"DRIVERS",data:pools?.drivers||[],accent:"#e8a948"},{title:"EXTRA",data:pools?.extra||[],accent:"#a78bfa"}].map(sec=>
          <div key={sec.title} style={{background:"rgba(255,255,255,0.02)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)",padding:"12px"}}>
            <div style={{fontSize:"10px",fontWeight:800,letterSpacing:"1.5px",color:sec.accent,marginBottom:"8px",borderBottom:`1px solid ${sec.accent}25`,paddingBottom:"6px"}}>
              {sec.title} <span style={{color:"#444",fontWeight:400}}>({sec.data.length})</span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
              {sec.data.map((p,i)=><span key={i} style={{padding:"3px 8px",borderRadius:"4px",background:"rgba(255,255,255,0.04)",fontSize:"11px",color:"#9ca3af"}}>{p.name}</span>)}
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
            {isToday&&<div style={{fontSize:"8px",fontWeight:800,letterSpacing:"1.2px",color:"#10b981",marginTop:"6px"}}>TODAY</div>}
          </button>
        );
      })}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────
export default function App(){
  const [data,setData]=useState(SAMPLE_DATA);
  const [selectedDay,setSelectedDay]=useState(getTodayDayName());
  const [mode,setMode]=useState("demo");
  const [lastRefresh,setLastRefresh]=useState(Date.now());
  const [nextRefresh,setNextRefresh]=useState(Date.now()+REFRESH_MS);
  const [activeTab,setActiveTab]=useState("schedule");
  const [error,setError]=useState(null);

  // Try auto-login on mount
  useEffect(()=>{
    if(!isConfigured()) return;
    (async()=>{
      try {
        const token = await initAuth();
        if(token){
          setMode("live");
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
    try {
      setError(null);
      const newData = await fetchScheduleFromSharePoint();
      setData(newData);
      setLastRefresh(Date.now());
      setNextRefresh(Date.now()+REFRESH_MS);
    } catch(e){
      console.error("Refresh failed:", e);
      setError(e.message);
    }
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
      <ConnectionBar mode={mode} lastRefresh={lastRefresh} nextRefresh={nextRefresh} isConnected={mode==="live"} onConnect={handleConnect} error={error}/>

      {/* Header */}
      <div style={{padding:"20px 24px 0",display:"flex",alignItems:"flex-end",justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
        <div>
          <div style={{fontSize:"9px",fontWeight:800,letterSpacing:"2.5px",color:"#4a9eff",marginBottom:"3px"}}>SCHEDULING TEAM</div>
          <h1 style={{margin:0,fontSize:"26px",fontWeight:900,letterSpacing:"-0.5px"}}>Daily Jobs Dashboard</h1>
          <div style={{fontSize:"12px",color:"#4a5568",marginTop:"3px"}}>{getWeekLabel(data)}</div>
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
        {(activeTab==="schedule"||activeTab==="roster")&&
          <div style={{display:"flex",gap:"3px",marginBottom:"14px",borderBottom:"1px solid rgba(255,255,255,0.04)",paddingBottom:"10px"}}>
            {DAY_ORDER.map(d=>{const isToday=d===getTodayDayName(),isSel=d===selectedDay;
              return <button key={d} onClick={()=>setSelectedDay(d)} style={{
                padding:"6px 14px",borderRadius:"6px",cursor:"pointer",fontSize:"11px",fontWeight:isSel?700:500,fontFamily:"inherit",
                background:isSel?"rgba(74,158,255,0.1)":"transparent",border:isSel?"1px solid rgba(74,158,255,0.25)":"1px solid transparent",
                color:isSel?"#4a9eff":isToday?"#10b981":"#4a5568"}}>
                {d.substring(0,3)}{isToday&&!isSel&&<span style={{display:"inline-block",width:"4px",height:"4px",borderRadius:"50%",background:"#10b981",marginLeft:"4px",verticalAlign:"middle"}}/>}
              </button>;
            })}
          </div>
        }
        {activeTab==="schedule"&&<JobsTable dayData={cur}/>}
        {activeTab==="roster"&&<CrewRoster crews={cur?.crews} pools={cur?.pools}/>}
        {activeTab==="week"&&<WeekOverview data={data} selectedDay={selectedDay} onSelectDay={d=>{setSelectedDay(d);setActiveTab("schedule");}}/>}
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
      </div>
    </div>
  );
}
