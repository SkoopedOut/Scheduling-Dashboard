// ── Jump to a date ───────────────────────────────────────────
// Shared by the Schedule tab's month view and the Month tab:
//   • DateJumpButton — "Go to date": opens the system date picker; any date
//     works, whether or not a job is scheduled on it.
//   • SelectedDayCard — shows the date that was jumped to (or tapped) with a
//     plain-language summary and an "Open day" action.
import { DAY_ORDER } from '../scheduleUtils.js';
import { A, Icon, Capsule, TintedButton, CircleButton, tint } from './apple.jsx';
import { SYS } from '../scheduleUtils.js';

export const longDate = ds => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export const dayNameOf = ds => DAY_ORDER[new Date(ds + 'T12:00:00').getDay()];
const validIso = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v + 'T12:00:00').getTime());

export function DateJumpButton({ onJump, value, style }) {
  // The native date input sits invisibly on top of the pill, so a real tap/click lands on it:
  // that opens the system date picker everywhere (iOS and Android included), and the input stays
  // keyboard-focusable. showPicker() covers desktop browsers that only open it from the icon.
  return (
    <span className="ap-datejump" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 999,
      background: tint(SYS.blue, 0.16), color: SYS.blue, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', ...style }}>
      <Icon name="calendarGoto" size={15} weight={2.1} />Go to date
      <input type="date" value={value || ''} min="2000-01-01" max="2100-12-31" aria-label="Go to a date" title="Pick any date to jump to it"
        onClick={e => { try { e.currentTarget.showPicker?.(); } catch { /* the browser opens it natively */ } }}
        onChange={e => { if (validIso(e.target.value)) onJump(e.target.value); }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 0, padding: 0, margin: 0, font: 'inherit' }} />
    </span>
  );
}

// info: { jobs, men, loaded } — loaded=false means no log book has been read for that date's week yet
export function SelectedDayCard({ date, info, isToday, onOpen, onDismiss, compact }) {
  if (!date) return null;
  let summary;
  if (info?.loading) summary = 'Loading this week…';
  else if (!info?.loaded) summary = 'No log book found for this date’s week.';
  else if (!info.jobs) summary = 'No jobs scheduled.';
  else summary = `${info.jobs} ${info.jobs === 1 ? 'job' : 'jobs'} · ${info.men} ${info.men === 1 ? 'man' : 'men'}`;
  return (
    <div className="glass ap-fade" role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: compact ? '10px 12px' : '12px 16px', marginBottom: 14, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          {longDate(date)}
          {isToday && <Capsule color={SYS.red} size={10} style={{ marginLeft: 8 }}>Today</Capsule>}
        </div>
        <div className="tnum" style={{ fontSize: 13, color: A.label2, marginTop: 2 }}>{summary}</div>
      </div>
      <TintedButton onClick={onOpen} style={{ fontSize: 13 }}>Open day<Icon name="chevronRight" size={13} weight={2.6} /></TintedButton>
      {onDismiss && <CircleButton icon="xmark" onClick={onDismiss} ariaLabel="Dismiss" size={26} />}
    </div>
  );
}
