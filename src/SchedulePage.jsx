// ── Schedule page ────────────────────────────────────────────
// Search field with a Day / Month scope (like a UISearchController scope
// bar), a Calendar-style week strip, and either the selected day's jobs or
// the month-wide search and role boards.
import { useEffect, useRef } from 'react';
import { DAY_ORDER, SYS, todayIso } from './scheduleUtils.js';
import { A, Icon, Segmented, SearchField, CircleButton, PlainButton, Spinner } from './ui/apple.jsx';
import DayJobs from './DayJobs.jsx';
import { EditBar } from './editing/WeekEditing.jsx';
import MonthSearch from './MonthSearch.jsx';

// ── Calendar-style week strip (shared with the Roster tab) ───
export function WeekStrip({ data, selectedDay, setSelectedDay, weekLabel, onPrev, onNext, onToday, showToday, loading, isMobile }) {
  const today = todayIso();
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <CircleButton icon="chevronLeft" onClick={onPrev} ariaLabel="Previous week" size={30} />
        <div className="tnum" style={{ fontSize: 15, fontWeight: 600, minWidth: isMobile ? 0 : 170, textAlign: 'center', flex: isMobile ? 1 : undefined }}>{weekLabel}</div>
        <CircleButton icon="chevronRight" onClick={onNext} ariaLabel="Next week" size={30} />
        {showToday && <PlainButton onClick={onToday}>Today</PlainButton>}
        {loading && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: A.label2 }}><Spinner size={14} />Loading…</span>}
      </div>
      <div role="tablist" aria-label="Day" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: isMobile ? 2 : 6, maxWidth: isMobile ? 'none' : 640 }}>
        {DAY_ORDER.map(d => {
          const dd = data?.[d];
          const ds = dd?.date;
          const isToday = ds === today;
          const isSel = d === selectedDay;
          const n = (dd?.jobs || []).filter(j => !j.cancelled).length;
          const num = ds ? Number(ds.slice(8)) : '–';
          const circleBg = isSel ? (isToday ? SYS.red : 'var(--ap-selected)') : 'transparent';
          const numColor = isSel ? (isToday ? '#fff' : 'var(--ap-on-selected)') : isToday ? SYS.red : ds ? A.label : A.label3;
          return (
            <button key={d} role="tab" aria-selected={isSel} onClick={() => setSelectedDay(d)} className="ap-btn ap-press"
              aria-label={`${d}${ds ? `, ${new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}` : ''}, ${n} ${n === 1 ? 'job' : 'jobs'}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: 'inherit' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: isToday ? SYS.red : A.label2, letterSpacing: 0.2 }}>{isMobile ? d[0] : d.slice(0, 3)}</span>
              <span className="tnum" style={{
                width: isMobile ? 36 : 40, height: isMobile ? 36 : 40, borderRadius: '50%', background: circleBg, color: numColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 18 : 20, fontWeight: isSel || isToday ? 600 : 400,
                transition: 'background-color .2s ease',
              }}>{num}</span>
              <span className="tnum" style={{ fontSize: 11, color: n ? A.label2 : A.label4, height: 13 }}>{n ? `${n} ${isMobile ? '' : n === 1 ? 'job' : 'jobs'}`.trim() : '–'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SchedulePage({
  data, weeksCache, currentWeekSat, weekLabel, selectedDay, setSelectedDay, onPrevWeek, onNextWeek, onToday, showToday, focus, onJumpDate,
  loadingWeek, flashedJobs, isMobile, mode, profiles, weekStatus, requestWeek, monthCursor, setMonthCursor,
  search, setSearch, onOpenDay, editor,
}) {
  const inputRef = useRef(null);
  const cur = data?.[selectedDay];
  const scope = search.scope;
  const set = patch => setSearch(s => ({ ...s, ...patch }));

  // "/" or ⌘K / Ctrl+K focuses search; Esc clears it
  useEffect(() => {
    const h = e => {
      const tag = (e.target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  function setScope(next) {
    if (next === 'month') {
      // Month scope opens on the month of the day being viewed
      const ds = cur?.date || data?.[DAY_ORDER.find(d => data?.[d]?.date)]?.date;
      if (ds) { const d = new Date(ds + 'T12:00:00'); setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }
    }
    set({ scope: next, fromMonth: false });
  }

  const monthName = monthCursor.toLocaleDateString('en-US', { month: 'long' });
  const placeholder = scope === 'day'
    ? (isMobile ? `Search ${selectedDay}` : `Search ${selectedDay} — names, customers, locations, PO #`)
    : (isMobile ? `Search all of ${monthName}` : `Search all of ${monthName} — names, customers, locations, PO #`);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <div style={{ flex: 1, minWidth: isMobile ? '100%' : 0, maxWidth: isMobile ? 'none' : 560, display: 'flex' }}>
          <SearchField inputRef={inputRef} value={search.query} onChange={v => set({ query: v })} placeholder={placeholder} large={isMobile}
            onKeyDown={e => { if (e.key === 'Escape') { set({ query: '' }); e.currentTarget.blur(); } }}
            ariaLabel={scope === 'day' ? `Search ${selectedDay}’s jobs` : `Search every job in ${monthName}`} />
        </div>
        <Segmented ariaLabel="Search scope" value={scope} onChange={setScope}
          options={[{ id: 'day', label: 'Day' }, { id: 'month', label: 'Month' }]}
          fullWidth={isMobile} style={{ width: isMobile ? '100%' : 180, flexShrink: 0 }} />
        {!isMobile && <span style={{ fontSize: 12, color: A.label3, whiteSpace: 'nowrap' }}>Press / to search</span>}
      </div>

      {scope === 'day' ? (
        <>
          {search.fromMonth && (
            <PlainButton onClick={() => set({ scope: 'month', fromMonth: false })} style={{ marginLeft: -8, marginBottom: 8, fontSize: 17 }}>
              <Icon name="chevronLeft" size={20} weight={2.4} />Back to {monthName}
            </PlainButton>
          )}
          <WeekStrip data={data} selectedDay={selectedDay} setSelectedDay={setSelectedDay} weekLabel={weekLabel}
            onPrev={onPrevWeek} onNext={onNextWeek} onToday={onToday} showToday={showToday}
            loading={loadingWeek === currentWeekSat} isMobile={isMobile} />
          {cur?.date && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? 24 : 28, fontWeight: 700, letterSpacing: '-0.02em' }}>{selectedDay}</h2>
              <span style={{ fontSize: isMobile ? 15 : 17, color: A.label2 }}>{new Date(cur.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
          )}
          {editor && <EditBar dayName={selectedDay} notes={cur?.notes} saveState={editor.saveState} isMobile={isMobile} outCount={(cur?.out || []).length}
            onAddJob={editor.onAddJob} onEditRoster={editor.onEditRoster} onEditOut={editor.onEditOut} onEditNotes={editor.onEditNotes} />}
          <DayJobs dayData={cur} flashedJobs={flashedJobs} weeksCache={weeksCache} curSatKey={currentWeekSat}
            query={search.query} isMobile={isMobile} onSearchMonth={() => setScope('month')} onEditJob={editor?.onEditJob} />
        </>
      ) : (
        <MonthSearch weeksCache={weeksCache} weekStatus={weekStatus} requestWeek={requestWeek} mode={mode} profiles={profiles}
          monthCursor={monthCursor} setMonthCursor={setMonthCursor} query={search.query} focus={focus} onJumpDate={onJumpDate} onToday={onToday}
          view={search.view} setView={v => set({ view: v })} personKey={search.person} setPersonKey={k => set({ person: k })}
          onOpenDay={onOpenDay} isMobile={isMobile} />
      )}
    </div>
  );
}
