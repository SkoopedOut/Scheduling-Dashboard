import { useState, useMemo } from 'react';
import { buildDayMessage, buildWeekMessage, buildCrewMessage, copyToClipboard } from './teamsMessage.js';

const S = {
  panel: { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '16px' },
  input: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '4px',
    color: '#e2e8f0', padding: '6px 8px', fontSize: '12px', fontFamily: 'inherit',
  },
  btn: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px',
    color: '#e2e8f0', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
  },
  btnPrimary: {
    background: 'rgba(74,158,255,0.16)', border: '1px solid rgba(74,158,255,0.45)', borderRadius: '4px',
    color: '#4a9eff', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
  },
  label: { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#4a5568', marginBottom: '4px', display: 'block' },
};

function Toggle({ checked, onChange, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ccc', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ cursor: 'pointer' }} />
      {children}
    </label>
  );
}

export default function TeamsMessagePanel({ weekData, selectedDay, profiles, weekLabel, onClose }) {
  const [scope, setScope] = useState('day');
  const [day, setDay] = useState(selectedDay || 'Monday');
  const [foreman, setForeman] = useState('');
  const [copied, setCopied] = useState(false);
  const [opts, setOpts] = useState({
    useRealNames: true,
    includeLocation: true,
    includePO: true,
    includeStartTime: true,
    includeTrucks: true,
    markOvertime: true,
    skipCancelled: true,
    driversOnly: false,
  });

  const setOpt = (k, v) => { setOpts(o => ({ ...o, [k]: v })); setCopied(false); };

  const dayData = weekData?.[day];
  const foremen = useMemo(() => Object.keys(dayData?.crews || {}).sort(), [dayData]);

  const message = useMemo(() => {
    if (scope === 'week') return buildWeekMessage(weekData, profiles, { ...opts, weekLabel });
    if (scope === 'crew' && foreman) return buildCrewMessage(dayData, foreman, profiles, opts, weekData);
    return buildDayMessage(dayData, profiles, opts, weekData);
  }, [scope, day, foreman, opts, weekData, dayData, profiles, weekLabel]);

  const doCopy = async () => {
    const ok = await copyToClipboard(message);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2500);
  };

  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    .filter(d => weekData?.[d]);

  return (
    <div style={{ padding: '16px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
        <h2 style={{ margin: 0, fontSize: '16px', color: '#e2e8f0' }}>Send schedule to Teams</h2>
        <div style={{ flex: 1 }} />
        {onClose && <button style={S.btn} onClick={onClose}>Close</button>}
      </div>

      <div style={{ ...S.panel, marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '14px' }}>
          <div>
            <label style={S.label}>What to send</label>
            <select style={S.input} value={scope} onChange={e => { setScope(e.target.value); setCopied(false); }}>
              <option value="day">One day</option>
              <option value="week">Whole week</option>
              <option value="crew">One crew</option>
            </select>
          </div>

          {scope !== 'week' && (
            <div>
              <label style={S.label}>Day</label>
              <select style={S.input} value={day} onChange={e => { setDay(e.target.value); setCopied(false); }}>
                {days.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}

          {scope === 'crew' && (
            <div>
              <label style={S.label}>Crew</label>
              <select style={S.input} value={foreman} onChange={e => { setForeman(e.target.value); setCopied(false); }}>
                <option value="">Pick a foreman</option>
                {foremen.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
          <Toggle checked={opts.useRealNames} onChange={v => setOpt('useRealNames', v)}>Use real names</Toggle>
          <Toggle checked={opts.includeLocation} onChange={v => setOpt('includeLocation', v)}>Include address</Toggle>
          <Toggle checked={opts.includePO} onChange={v => setOpt('includePO', v)}>Include job #</Toggle>
          <Toggle checked={opts.includeStartTime} onChange={v => setOpt('includeStartTime', v)}>Include start time</Toggle>
          <Toggle checked={opts.includeTrucks} onChange={v => setOpt('includeTrucks', v)}>Include trucks</Toggle>
          <Toggle checked={opts.markOvertime} onChange={v => setOpt('markOvertime', v)}>Flag overtime</Toggle>
          <Toggle checked={opts.driversOnly} onChange={v => setOpt('driversOnly', v)}>Drivers only (hide crew line)</Toggle>
          <Toggle checked={opts.skipCancelled} onChange={v => setOpt('skipCancelled', v)}>Hide cancelled jobs</Toggle>
        </div>

        {opts.useRealNames && !profiles?.people?.length && (
          <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '10px' }}>
            No profiles saved yet, so the log book's own spellings will be used. Add profiles to show real names.
          </div>
        )}
      </div>

      <div style={{ ...S.panel }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
          <label style={{ ...S.label, marginBottom: 0 }}>Preview</label>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '11px', color: '#666' }}>{message.length} characters</span>
        </div>
        <textarea
          readOnly
          value={message}
          style={{
            width: '100%', minHeight: '340px', background: 'rgba(0,0,0,0.28)', border: '1px solid #2a2a2a',
            borderRadius: '4px', color: '#e2e8f0', padding: '12px', fontSize: '12px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: 1.55, resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px', alignItems: 'center' }}>
          <button style={S.btnPrimary} onClick={doCopy}>Copy message</button>
          {copied && <span style={{ fontSize: '12px', color: '#10b981' }}>Copied — paste it into Teams</span>}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '11px', color: '#666' }}>
            Teams shows **bold** but not tables, so this is plain text.
          </span>
        </div>
      </div>
    </div>
  );
}
