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
import { isStoreWeek, loadStoreWeek, saveStoreWeek, seedWeek, cloneWeek, backupPath } from './weekStore.js';
import { upsertJob, deleteJob, setRoster, setNotes } from './weekEdits.js';
import { EditBar, StoreWeekEmpty, JobEditorSheet, RosterEditorSheet, NotesSheet } from './editing/WeekEditing.jsx';

// 2027 onward the site owns the data (JSON in SharePoint); earlier weeks
// still come from the Excel log books.
function loadWeekData(satKey){
  return isStoreWeek(satKey) ? loadStoreWeek(satKey) : fetchScheduleFromSharePoint(new Date(satKey+'T12:00:00'));
}
import { SAMPLE_DATA, FOREMAN_ORDER } from './sampleData.js';
import {
  DAY_ORDER, PM_COLORS, SYS, foremanColor, REFRESH_MS, getTodayDayName, formatDate, getWeekLabel, getSaturdayKey,
  satKeyToLabel, isStopLabel, isNonPerson, canonicalName, isOvertimeStart, prevWeekSatKey, hasTruck,
} from './scheduleUtils.js';
import { A, APPLE_CSS, Icon, Segmented, Spinner, QualBadge, PMBadge, FolderIcon, Capsule, TintedButton, CircleButton, PlainButton, tint } from './ui/apple.jsx';
import SchedulePage, { WeekStrip } from './SchedulePage.jsx';
import RosterTab from './tabs/RosterTab.jsx';
import WeekTab from './tabs/WeekTab.jsx';
import MonthTab from './tabs/MonthTab.jsx';
import ChangesTab from './tabs/ChangesTab.jsx';
import TVMode from './tabs/TVMode.jsx';
import { loadChangeLog, saveChangeLog, diffJobFields } from './changeLog.js';
import { profileFor, rosterKey } from './profiles.js';

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
        <span style={{color:error?SYS.red:A.label,fontWeight:500}}>{error?`Couldn’t refresh: ${error}`:mode==="demo"?"Demo — sample week":fileMeta?.source==="site"?"Live · site data":"Live from SharePoint"}</span>
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

// ── Main App ─────────────────────────────────────────────────
function readPersonLink(){
  if(typeof window==="undefined") return null;
  const p=new URLSearchParams(window.location.hash.slice(1));
  const pm=(p.get("pm")||"").trim().toUpperCase();
  if(pm) return {key:`pm:${pm}`,view:"pm"};
  const person=(p.get("person")||"").trim();
  if(person) return {key:rosterKey(person),view:"journeyman"};
  return null;
}

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
  // Site-owned weeks: SharePoint eTag + whether the file exists, per week
  const [storeMeta,setStoreMeta]=useState({});
  const [saveState,setSaveState]=useState(null);
  const [editing,setEditing]=useState(null); // {kind:'job'|'roster'|'notes', day, job}
  // Schedule search: query + Day/Month scope + month view (jobs or a role) + open person.
  // Lives here so it survives switching tabs.
  // Deep links: #pm=D or #person=<roster name> open that person's month
  // (PMs can bookmark their own link).
  const [search,setSearch]=useState(()=>{
    const base={query:"",scope:"day",view:"jobs",person:null,fromMonth:false};
    const link=readPersonLink();
    return link?{...base,scope:"month",view:link.view,person:link.key}:base;
  });
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
  // Keep the address bar pointing at the open person/PM month so it can be bookmarked
  useEffect(()=>{
    if(tvMode) return;
    const open=activeTab==="schedule"&&search.scope==="month"&&search.person;
    const want=open?(search.person.startsWith("pm:")?`#pm=${encodeURIComponent(search.person.slice(3))}`:`#person=${encodeURIComponent(search.person)}`):"";
    const curHash=window.location.hash;
    if(want&&curHash!==want) window.history.replaceState(null,"",want);
    else if(!want&&/^#(pm|person)=/.test(curHash)) window.history.replaceState(null,"",window.location.pathname+window.location.search);
  },[tvMode,activeTab,search.scope,search.person]);
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
      const newData=await loadWeekData(satKey);
      let meta=null;
      if(newData._meta){meta=newData._meta;delete newData._meta;}
      if(meta) setFileMeta(meta);
      if(meta?.source==="site") setStoreMeta(st=>({...st,[satKey]:meta}));
      ingestWeek(satKey,newData);
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

  // Put a week into the cache, flashing and logging what changed
  function ingestWeek(satKey,newData){
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
  }

  // ── Editing (site-owned weeks) ─────────────────────────────
  // `mutate` is a pure edit on a copy of the week. If someone else saved
  // first, the latest copy is loaded and the same edit is replayed once.
  async function editWeek(satKey,mutate){
    setSaveState({status:"saving"});
    let base=weeksCache[satKey]||{};
    let meta=storeMeta[satKey]||{};
    for(let attempt=0;attempt<2;attempt++){
      try{
        const next=mutate(cloneWeek(base));
        const {week,backup}=await saveStoreWeek(satKey,next,{eTag:meta.eTag,exists:!!meta.exists});
        const m=week._meta; delete week._meta;
        setStoreMeta(st=>({...st,[satKey]:m}));
        ingestWeek(satKey,week);
        setWeekStatus(st=>({...st,[satKey]:"loaded"}));
        if(satKey===currentWeekSatRef.current) setFileMeta(m);
        setSaveState({status:"saved",backup,at:Date.now()});
        return true;
      }catch(e){
        if(e.conflict&&attempt===0){
          try{
            const fresh=await loadStoreWeek(satKey);
            meta=fresh._meta||{}; delete fresh._meta; base=fresh;
            continue;
          }catch(e2){ setSaveState({status:"error",message:e2.message}); return false; }
        }
        setSaveState({status:"error",message:e.message});
        return false;
      }
    }
    return false;
  }
  async function startWeek(satKey){
    setSaveState({status:"saving"});
    try{
      const prevSat=prevWeekSatKey(satKey);
      let prev=weeksCache[prevSat];
      if(!prev||!Object.keys(prev).length){
        try{ prev=await loadWeekData(prevSat); delete prev._meta; }catch{ prev=null; }
      }
      const seeded=seedWeek(satKey,prev);
      return await editWeek(satKey,()=>seeded);
    }catch(e){ setSaveState({status:"error",message:e.message}); return false; }
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
      const newData=await loadWeekData(satKey);
      let meta=null;
      if(newData._meta){meta=newData._meta;delete newData._meta;}
      if(meta?.source==="site") setStoreMeta(st=>({...st,[satKey]:meta}));
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
  // From the roster: open someone's (or a PM's) whole month
  function openPersonMonth(sel){
    const ds=data[selectedDay]?.date;
    const d=ds?new Date(ds+"T12:00:00"):new Date();
    setMonthCursor(new Date(d.getFullYear(),d.getMonth(),1));
    const key=sel.kind==="pm"?`pm:${sel.code}`:rosterKey(profileFor(profiles,sel.name)?.rosterName||sel.name);
    setSearch(st=>({...st,query:"",scope:"month",view:sel.kind==="pm"?"pm":(sel.role||"journeyman"),person:key,fromMonth:false}));
    setActiveTab("schedule");
    window.scrollTo?.({top:0});
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
  const weekNavTabs=activeTab==="week"||activeTab==="people"||activeTab==="send";
  const noWeekData=Object.keys(data).length===0;
  const stats=[{v:totalJobs,l:"Jobs"},{v:totalMen,l:"Men"},{v:totalTrucks,l:"Trucks"}];
  const storeWeek=isStoreWeek(currentWeekSat);
  const canEdit=mode==="live"&&storeWeek&&!!storeMeta[currentWeekSat]?.exists;
  const editSat=currentWeekSat;
  const editor=canEdit?{
    saveState,
    onAddJob:()=>setEditing({kind:"job",day:selectedDay,job:null}),
    onEditJob:job=>setEditing({kind:"job",day:selectedDay,job}),
    onEditRoster:()=>setEditing({kind:"roster",day:selectedDay}),
    onEditNotes:()=>setEditing({kind:"notes",day:selectedDay}),
  }:null;
  const closeEditor=()=>setEditing(null);

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
          : noWeekData&&storeWeek&&mode==="live"&&storeMeta[currentWeekSat]&&!storeMeta[currentWeekSat].exists&&!["month","changes","people"].includes(activeTab)&&!(activeTab==="schedule"&&search.scope==="month")
            ? <StoreWeekEmpty weekLabel={satKeyToLabel(currentWeekSat)} saveState={saveState} backupPath={backupPath(currentWeekSat)} onStart={()=>startWeek(currentWeekSat)}/>
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
                  monthCursor={monthCursor} setMonthCursor={setMonthCursor} search={search} setSearch={setSearch} onOpenDay={openDayFromMonth} editor={editor}/>}
                {activeTab==="roster"&&<>
                  <WeekStrip data={data} selectedDay={selectedDay} setSelectedDay={setSelectedDay} weekLabel={weekLabel}
                    onPrev={()=>navigateWeek(-1)} onNext={()=>navigateWeek(1)} onToday={goToCurrentWeek} showToday={currentWeekSat!==INITIAL_SAT}
                    loading={loadingWeek===currentWeekSat} isMobile={isMobile}/>
                  {editor&&<EditBar dayName={selectedDay} notes={cur?.notes} saveState={saveState} isMobile={isMobile} showAddJob={false}
                    onEditRoster={editor.onEditRoster} onEditNotes={editor.onEditNotes}/>}
                  <RosterTab crews={cur?.crews} pools={cur?.pools} unavailable={cur?.unavailable} unassigned={cur?.unassigned} jobs={cur?.jobs} allData={data}
                    isMobile={isMobile} monthName={(cur?.date?new Date(cur.date+"T12:00:00"):new Date()).toLocaleDateString("en-US",{month:"long"})} onOpenMonth={openPersonMonth}/>
                </>}
                {activeTab==="week"&&<WeekTab data={data} selectedDay={selectedDay} isMobile={isMobile} onSelectDay={d=>{setSelectedDay(d);setActiveTab("schedule");setSearch(st=>({...st,scope:"day",fromMonth:false}));}}/>}
                {activeTab==="month"&&<MonthTab weeksCache={weeksCache} weekStatus={weekStatus} monthCursor={monthCursor} setMonthCursor={setMonthCursor} onPickDay={pickCalendarDay} mode={mode} requestWeek={fetchWeek} isMobile={isMobile} onSearchMonth={searchMonth}/>}
                {activeTab==="changes"&&<ChangesTab changeLog={changeLog} onClear={()=>setChangeLog([])} isMobile={isMobile}/>}
                {activeTab==="people"&&<Suspense fallback={<PanelFallback/>}>
                  <ProfilesPanel weekData={data} onStoreChange={setProfiles}/>
                </Suspense>}
                {activeTab==="send"&&<Suspense fallback={<PanelFallback/>}>
                  <TeamsMessagePanel weekData={data} selectedDay={selectedDay} profiles={profiles} weekLabel={getWeekLabel(data)}/>
                </Suspense>}
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

      {canEdit&&<>
        <JobEditorSheet open={editing?.kind==="job"} onClose={closeEditor} isMobile={isMobile} week={data} dayName={editing?.day||selectedDay} job={editing?.job||null}
          onSave={(day,job,opts)=>editWeek(editSat,w=>upsertJob(w,day,job,opts))}
          onDelete={(day,id)=>editWeek(editSat,w=>deleteJob(w,day,id))}/>
        <RosterEditorSheet open={editing?.kind==="roster"} onClose={closeEditor} isMobile={isMobile} dayName={editing?.day||selectedDay} dayData={data[editing?.day||selectedDay]}
          onSave={(roster,applyTo)=>editWeek(editSat,w=>setRoster(w,editing.day,roster,applyTo))}/>
        <NotesSheet open={editing?.kind==="notes"} onClose={closeEditor} isMobile={isMobile} dayName={editing?.day||selectedDay} notes={data[editing?.day||selectedDay]?.notes}
          onSave={notes=>editWeek(editSat,w=>setNotes(w,editing.day,notes))}/>
      </>}
      {isMobile&&<BottomNav tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab}/>}
    </div>
  );
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
