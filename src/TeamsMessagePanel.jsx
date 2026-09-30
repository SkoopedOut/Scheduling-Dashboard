import { useState, useMemo } from 'react';
import { buildDayMessage, buildWeekMessage, buildCrewMessage, copyToClipboard } from './teamsMessage.js';
import { sendJobChat, jobRecipients } from './graphTeams.js';
import { isConfigured } from './auth.js';
import { SYS } from './scheduleUtils.js';
import { A, tint, Icon, Group, SectionHeader, SectionFooter, Segmented, SelectField, Switch, FilledButton, GrayButton, Spinner } from './ui/apple.jsx';

function Toggle({ checked, onChange, children, first }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', minHeight: 44, borderTop: first ? 'none' : `0.5px solid ${A.sep}` }}>
        <span style={{ fontSize: 15 }}>{children}</span>
        <Switch checked={checked} onChange={onChange} ariaLabel={typeof children === 'string' ? children : undefined} />
      </div>
    </div>
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

  // Per-job Teams send state: jobKey -> { status, note }
  const [sendState, setSendState] = useState({});
  const jobKey = (j) => `${day}:${j.num}:${j.customer}`;

  const sendOneJob = async (job) => {
    const key = jobKey(job);
    setSendState(s => ({ ...s, [key]: { status: 'sending' } }));
    try {
      const msg = buildDayMessage({ ...dayData, jobs: [job] }, profiles, opts, weekData);
      const res = await sendJobChat(job, msg, profiles, { topic: `${job.customer} (${day})` });
      const noteParts = [`Sent to ${res.memberCount} ${res.memberCount === 1 ? 'person' : 'people'}`];
      if (res.unresolved?.length) noteParts.push(`couldn't reach: ${res.unresolved.map(u => u.name).join(', ')}`);
      if (res.missing?.length) noteParts.push(`no email: ${res.missing.map(m => m.name).join(', ')}`);
      setSendState(s => ({ ...s, [key]: { status: 'sent', note: noteParts.join(' · '), url: res.webUrl } }));
    } catch (e) {
      setSendState(s => ({ ...s, [key]: { status: 'error', note: e.message } }));
    }
  };

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

  const isNarrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  const toggles = [
    ['useRealNames', 'Use real names'], ['includeLocation', 'Include address'], ['includePO', 'Include job #'],
    ['includeStartTime', 'Include start time'], ['includeTrucks', 'Include trucks'], ['markOvertime', 'Flag overtime'],
    ['driversOnly', 'Drivers only (hide crew line)'], ['skipCancelled', 'Hide cancelled jobs'],
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: '#5B5FC7', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="paperplane" size={22} weight={2} /></span>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Send to Teams</div>
          <div style={{ fontSize: 13, color: A.label2 }}>Copy a formatted schedule, or start a group chat for each job.</div>
        </div>
        <div style={{ flex: 1 }} />
        {onClose && <GrayButton onClick={onClose}>Close</GrayButton>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '360px minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
        <div>
          <SectionHeader>What to send</SectionHeader>
          <Segmented ariaLabel="What to send" value={scope} onChange={v => { setScope(v); setCopied(false); }}
            options={[{ id: 'day', label: 'One day' }, { id: 'week', label: 'Whole week' }, { id: 'crew', label: 'One crew' }]} style={{ marginBottom: 14 }} />
          {scope !== 'week' && (
            <Group style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', minHeight: 44 }}>
                <span style={{ flex: 1, fontSize: 15 }}>Day</span>
                <SelectField value={day} onChange={v => { setDay(v); setCopied(false); }} ariaLabel="Day" style={{ width: 170 }}>
                  {days.map(d => <option key={d} value={d}>{d}</option>)}
                </SelectField>
              </div>
              {scope === 'crew' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', minHeight: 44, borderTop: `0.5px solid ${A.sep}`, marginLeft: 16, paddingLeft: 0 }}>
                  <span style={{ flex: 1, fontSize: 15 }}>Crew</span>
                  <SelectField value={foreman} onChange={v => { setForeman(v); setCopied(false); }} ariaLabel="Crew" style={{ width: 170 }}>
                    <option value="">Pick a foreman</option>
                    {foremen.map(f => <option key={f} value={f}>{f}</option>)}
                  </SelectField>
                </div>
              )}
            </Group>
          )}
          <SectionHeader>Options</SectionHeader>
          <Group>
            {toggles.map(([k, l], i) => <Toggle key={k} first={i === 0} checked={opts[k]} onChange={v => setOpt(k, v)}>{l}</Toggle>)}
          </Group>
          {opts.useRealNames && !profiles?.people?.length && (
            <SectionFooter style={{ color: SYS.orange }}>No profiles are saved yet, so the log book’s own spellings will be used. Add profiles in People to show real names.</SectionFooter>
          )}
        </div>

        <div>
          <SectionHeader right={<span className="tnum">{message.length} characters</span>}>Preview</SectionHeader>
          <Group>
            <textarea readOnly value={message} aria-label="Message preview" style={{
              display: 'block', width: '100%', minHeight: 380, background: 'transparent', border: 'none', outline: 'none', color: A.label,
              padding: 16, fontSize: 13, fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace', lineHeight: 1.6, resize: 'vertical' }} />
          </Group>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <FilledButton onClick={doCopy}>{copied ? <><Icon name="checkmark" size={16} weight={2.6} />Copied</> : 'Copy message'}</FilledButton>
            {copied && <span style={{ fontSize: 13, color: SYS.green }}>Paste it into Teams.</span>}
            <span style={{ fontSize: 12, color: A.label3, marginLeft: 'auto' }}>Teams keeps bold and line breaks; tables aren’t supported.</span>
          </div>

          {scope === 'day' && dayData && (
            <div style={{ marginTop: 26 }}>
              <SectionHeader right="Posts as you, to crew profile emails">Group chat per job</SectionHeader>
              {!isConfigured() && <SectionFooter style={{ color: SYS.orange, paddingTop: 0, paddingBottom: 8 }}>Sign-in isn’t configured, so sending is unavailable. Copying still works.</SectionFooter>}
              <Group>
                {(dayData.jobs || []).filter(j => !(opts.skipCancelled && j.cancelled)).map((job, i) => {
                  const { recipients, missing } = jobRecipients(job, profiles);
                  const key = jobKey(job);
                  const st = sendState[key] || {};
                  const canSend = isConfigured() && recipients.length > 0;
                  return (
                    <div key={key} style={{ padding: '0 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? `0.5px solid ${A.sep}` : 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}><span className="tnum" style={{ color: A.label3, fontWeight: 400 }}>#{job.num}</span> {job.customer}</div>
                          <div style={{ fontSize: 13, color: recipients.length ? A.label2 : A.label3, marginTop: 2 }}>
                            {recipients.length ? `To ${recipients.map(r => r.name).join(', ')}` : 'No one on this crew has a Teams email saved.'}
                          </div>
                          {missing.length > 0 && <div style={{ fontSize: 13, color: SYS.orange, marginTop: 2 }}>No email for {missing.map(m => m.name).join(', ')}</div>}
                          {st.note && (
                            <div style={{ fontSize: 13, color: st.status === 'error' ? SYS.red : SYS.green, marginTop: 3 }}>
                              {st.note}{st.url && <> · <a href={st.url} target="_blank" rel="noreferrer" style={{ color: A.tint }}>Open chat</a></>}
                            </div>
                          )}
                        </div>
                        <GrayButton disabled={!canSend || st.status === 'sending'} onClick={() => sendOneJob(job)} color={A.tint} style={{ fontSize: 14 }}>
                          {st.status === 'sending' ? <><Spinner size={13} />Sending…</> : st.status === 'sent' ? 'Send again' : 'Send'}
                        </GrayButton>
                      </div>
                    </div>
                  );
                })}
              </Group>
              <SectionFooter>The first send asks you to approve Teams messaging permissions. Each send starts a new group chat.</SectionFooter>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
