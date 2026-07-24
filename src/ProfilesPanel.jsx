import { useState, useEffect, useMemo } from 'react';
import {
  loadProfiles, saveProfiles, emptyStore, collectRosterNames, mergeRosterNames,
  upsertProfile, removeProfile, blankProfile, validateProfile, formatPhone,
  profileCompleteness, rosterKey, ROLES, ROLE_LABEL,
} from './profiles.js';

const S = {
  panel: { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '16px' },
  input: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '4px',
    color: '#e2e8f0', padding: '6px 8px', fontSize: '12px', width: '100%', fontFamily: 'inherit',
  },
  label: { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#4a5568', marginBottom: '3px', display: 'block' },
  btn: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px',
    color: '#e2e8f0', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
  },
  btnPrimary: {
    background: 'rgba(74,158,255,0.16)', border: '1px solid rgba(74,158,255,0.45)', borderRadius: '4px',
    color: '#4a9eff', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
  },
};

const ROLE_COLOR = {
  foreman: '#f59e0b',
  'apprentice-1': '#5ec490', 'apprentice-2': '#5ec490',
  'apprentice-3': '#5ec490', 'apprentice-4': '#5ec490',
  laborer: '#7eb8f7',
};

function RoleTag({ role }) {
  if (!role) return <span style={{ color: '#555', fontSize: '11px' }}>— not set —</span>;
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '3px',
      background: (ROLE_COLOR[role] || '#666') + '22',
      color: ROLE_COLOR[role] || '#aaa',
      border: `1px solid ${(ROLE_COLOR[role] || '#666')}55`,
    }}>{ROLE_LABEL[role] || role}</span>
  );
}

function Editor({ profile, rosterInfo, onSave, onCancel, onDelete }) {
  const [draft, setDraft] = useState(profile);
  const [touched, setTouched] = useState(false);
  useEffect(() => { setDraft(profile); setTouched(false); }, [profile]);

  const errors = validateProfile(draft);
  const hasErrors = Object.keys(errors).length > 0;
  const set = (k, v) => { setDraft(d => ({ ...d, [k]: v })); setTouched(true); };

  return (
    <div style={{ ...S.panel, background: 'rgba(255,255,255,0.02)', marginTop: '8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <div>
          <label style={S.label}>Name on the log book</label>
          <input style={{ ...S.input, color: '#888' }} value={draft.rosterName} readOnly />
          <div style={{ fontSize: '10px', color: '#666', marginTop: '3px' }}>
            This is how the schedule spells it. It can't be changed here.
          </div>
        </div>

        <div>
          <label style={S.label}>Real name</label>
          <input
            style={S.input}
            value={draft.displayName}
            placeholder={draft.rosterName}
            onChange={e => set('displayName', e.target.value)}
          />
          <div style={{ fontSize: '10px', color: '#666', marginTop: '3px' }}>
            Fill this in when the log book uses a nickname.
          </div>
        </div>

        <div>
          <label style={S.label}>Role</label>
          <select style={S.input} value={draft.role} onChange={e => set('role', e.target.value)}>
            <option value="">— not set —</option>
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>

        <div>
          <label style={S.label}>Phone</label>
          <input
            style={{ ...S.input, borderColor: errors.phone ? '#ef4444' : '#333' }}
            value={draft.phone}
            placeholder="(978) 555-0134"
            onChange={e => set('phone', e.target.value)}
            onBlur={e => set('phone', formatPhone(e.target.value))}
          />
          {errors.phone && <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '3px' }}>{errors.phone}</div>}
        </div>

        <div>
          <label style={S.label}>Teams email</label>
          <input
            style={{ ...S.input, borderColor: errors.teamsEmail ? '#ef4444' : '#333' }}
            value={draft.teamsEmail}
            placeholder="name@hubofficeinc.com"
            onChange={e => set('teamsEmail', e.target.value)}
          />
          {errors.teamsEmail && <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '3px' }}>{errors.teamsEmail}</div>}
        </div>

        <div>
          <label style={S.label}>Other spellings</label>
          <input
            style={S.input}
            value={(draft.aliases || []).join(', ')}
            placeholder="Mike, Mikey"
            onChange={e => set('aliases', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          />
          <div style={{ fontSize: '10px', color: '#666', marginTop: '3px' }}>
            Separate with commas. Use for job-row spellings that don't match.
          </div>
        </div>
      </div>

      <div style={{ marginTop: '12px' }}>
        <label style={S.label}>Notes</label>
        <input style={S.input} value={draft.notes} onChange={e => set('notes', e.target.value)} />
      </div>

      {rosterInfo && (
        <div style={{ fontSize: '11px', color: '#777', marginTop: '10px' }}>
          On the schedule {rosterInfo.days.length} day{rosterInfo.days.length === 1 ? '' : 's'} this week
          {rosterInfo.onJobs ? `, assigned to ${rosterInfo.onJobs} job${rosterInfo.onJobs === 1 ? '' : 's'}` : ''}
          {rosterInfo.crews.length ? ` · Crew: ${rosterInfo.crews.join(', ')}` : ''}
          {rosterInfo.pools.length ? ` · Pool: ${rosterInfo.pools.join(', ')}` : ''}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '14px', alignItems: 'center' }}>
        <button
          style={{ ...S.btnPrimary, opacity: hasErrors ? 0.5 : 1, cursor: hasErrors ? 'not-allowed' : 'pointer' }}
          disabled={hasErrors}
          onClick={() => onSave(draft)}
        >Save profile</button>
        <button style={S.btn} onClick={onCancel}>Cancel</button>
        <div style={{ flex: 1 }} />
        <button
          style={{ ...S.btn, color: '#ef4444', borderColor: '#5a2020' }}
          onClick={() => onDelete(draft.rosterName)}
        >Remove</button>
      </div>
      {touched && <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '8px' }}>Unsaved changes</div>}
    </div>
  );
}

export default function ProfilesPanel({ weekData, onClose, onStoreChange }) {
  const [store, setStore] = useState(emptyStore());
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('');
  const [showOnly, setShowOnly] = useState('all');

  const rosterNames = useMemo(() => collectRosterNames(weekData, store), [weekData, store]);
  const rosterByKey = useMemo(() => {
    const m = {};
    for (const r of rosterNames) m[r.key] = r;
    return m;
  }, [rosterNames]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const loaded = await loadProfiles();
        if (!alive) return;
        setStore(loaded);
        setStatus('ready');
        onStoreChange?.(loaded);
      } catch (e) {
        if (!alive) return;
        setError(e.message);
        setStatus('error');
      }
    })();
    return () => { alive = false; };
  }, []);

  const addMissing = () => {
    const { store: next, added } = mergeRosterNames(store, rosterNames);
    if (!added) { setError('Everyone on this week\'s schedule already has a profile.'); return; }
    setStore(next); setDirty(true); setError(null);
    onStoreChange?.(next);
  };

  const handleSave = (profile) => {
    const next = upsertProfile(store, { ...profile, updatedAt: new Date().toISOString() });
    setStore(next); setDirty(true); setEditing(null);
    onStoreChange?.(next);
  };

  const handleDelete = (rosterName) => {
    const next = removeProfile(store, rosterName);
    setStore(next); setDirty(true); setEditing(null);
    onStoreChange?.(next);
  };

  const persist = async () => {
    setStatus('saving'); setError(null);
    try {
      const saved = await saveProfiles(store);
      setStore(saved); setDirty(false); setStatus('ready');
      onStoreChange?.(saved);
    } catch (e) {
      setError(e.message);
      setStatus('ready');
    }
  };

  const reload = async () => {
    setStatus('loading'); setError(null);
    try {
      const loaded = await loadProfiles();
      setStore(loaded); setDirty(false); setStatus('ready');
      onStoreChange?.(loaded);
    } catch (e) { setError(e.message); setStatus('error'); }
  };

  // Everyone the schedule knows about, plus anyone with a saved profile.
  const rows = useMemo(() => {
    const byKey = new Map();
    for (const r of rosterNames) {
      byKey.set(r.key, { key: r.key, name: r.name, roster: r, profile: store.byKey[r.key] || null });
    }
    for (const p of store.people) {
      const k = rosterKey(p.rosterName);
      if (byKey.has(k)) byKey.get(k).profile = p;
      else byKey.set(k, { key: k, name: p.rosterName, roster: null, profile: p });
    }
    let list = [...byKey.values()];
    const q = filter.trim().toLowerCase();
    if (q) list = list.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.profile?.displayName || '').toLowerCase().includes(q) ||
      (r.profile?.teamsEmail || '').toLowerCase().includes(q));
    if (showOnly === 'incomplete') list = list.filter(r => !r.profile || !profileCompleteness(r.profile).complete);
    if (showOnly === 'noprofile') list = list.filter(r => !r.profile);
    if (showOnly === 'foremen') list = list.filter(r => r.profile?.role === 'foreman' || r.roster?.seenAsForeman);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [rosterNames, store, filter, showOnly]);

  const stats = useMemo(() => {
    const total = rosterNames.length;
    const withProfile = rosterNames.filter(r => store.byKey[r.key]).length;
    const complete = rosterNames.filter(r => {
      const p = store.byKey[r.key];
      return p && profileCompleteness(p).complete;
    }).length;
    return { total, withProfile, complete };
  }, [rosterNames, store]);

  const unmatched = rosterNames.unmatchedJobNames || [];

  return (
    <div style={{ padding: '16px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '16px', color: '#e2e8f0' }}>Installer profiles</h2>
        <span style={{ fontSize: '11px', color: '#888' }}>
          {stats.complete} of {stats.total} complete · {stats.withProfile} have a profile
        </span>
        <div style={{ flex: 1 }} />
        {dirty && <span style={{ fontSize: '11px', color: '#f59e0b' }}>Unsaved changes</span>}
        <button style={S.btn} onClick={reload} disabled={status === 'saving'}>Reload</button>
        <button
          style={{ ...S.btnPrimary, opacity: dirty && status !== 'saving' ? 1 : 0.5 }}
          disabled={!dirty || status === 'saving'}
          onClick={persist}
        >{status === 'saving' ? 'Saving…' : 'Save to SharePoint'}</button>
        {onClose && <button style={S.btn} onClick={onClose}>Close</button>}
      </div>

      {error && (
        <div style={{ ...S.panel, borderColor: '#5a2020', background: '#1e1414', marginBottom: '12px', color: '#f8b4b4', fontSize: '12px' }}>
          {error}
        </div>
      )}

      {status === 'loading' && <div style={{ color: '#888', fontSize: '13px' }}>Loading profiles…</div>}

      {status !== 'loading' && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              style={{ ...S.input, width: '220px' }}
              placeholder="Search names"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            <select style={{ ...S.input, width: 'auto' }} value={showOnly} onChange={e => setShowOnly(e.target.value)}>
              <option value="all">Everyone</option>
              <option value="incomplete">Missing details</option>
              <option value="noprofile">No profile yet</option>
              <option value="foremen">Foremen</option>
            </select>
            <button style={S.btn} onClick={addMissing}>
              Add everyone on this week's schedule
            </button>
          </div>

          {unmatched.length > 0 && (
            <div style={{ ...S.panel, marginBottom: '12px', borderColor: '#4a3a1a', background: '#1a1610' }}>
              <div style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 600, marginBottom: '6px' }}>
                Job rows use {unmatched.length} spelling{unmatched.length === 1 ? '' : 's'} that don't match the crew list
              </div>
              <div style={{ fontSize: '11px', color: '#aaa' }}>
                {unmatched.map(u => `${u.name} (${u.count}×)`).join(', ')}
              </div>
              <div style={{ fontSize: '11px', color: '#777', marginTop: '6px' }}>
                Add each one under "Other spellings" on the right person so their jobs count correctly.
              </div>
            </div>
          )}

          <div style={{ ...S.panel, padding: 0, overflow: 'hidden' }}>
            {rows.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#777', fontSize: '13px' }}>
                No one matches that search.
              </div>
            )}
            {rows.map(row => {
              const p = row.profile;
              const isEditing = editing === row.key;
              return (
                <div key={row.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(120px,1.2fr) minmax(120px,1.2fr) auto minmax(110px,1fr) minmax(150px,1.4fr) auto',
                      gap: '10px', alignItems: 'center', padding: '10px 12px', cursor: 'pointer',
                      background: isEditing ? 'rgba(74,158,255,0.05)' : 'transparent',
                    }}
                    onClick={() => setEditing(isEditing ? null : row.key)}
                  >
                    <div style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>
                      {row.name}
                      {row.roster?.seenAsForeman && (
                        <span style={{ fontSize: '9px', color: '#f59e0b', marginLeft: '6px' }}>FOREMAN</span>
                      )}
                      {!row.roster && (
                        <span style={{ fontSize: '9px', color: '#666', marginLeft: '6px' }}>NOT THIS WEEK</span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: p?.displayName ? '#bbb' : '#555' }}>
                      {p?.displayName || '—'}
                    </div>
                    <div><RoleTag role={p?.role} /></div>
                    <div style={{ fontSize: '12px', color: p?.phone ? '#bbb' : '#555', fontVariantNumeric: 'tabular-nums' }}>
                      {p?.phone ? formatPhone(p.phone) : '—'}
                    </div>
                    <div style={{ fontSize: '12px', color: p?.teamsEmail ? '#bbb' : '#555', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p?.teamsEmail || '—'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666' }}>
                      {p ? `${profileCompleteness(p).filled}/4` : 'new'}
                    </div>
                  </div>
                  {isEditing && (
                    <div style={{ padding: '0 12px 12px' }}>
                      <Editor
                        profile={p || blankProfile(row.name)}
                        rosterInfo={row.roster}
                        onSave={handleSave}
                        onCancel={() => setEditing(null)}
                        onDelete={handleDelete}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: '11px', color: '#666', marginTop: '10px' }}>
            Saved to Documents/Schedule/installers.json in SharePoint. Changes aren't live until you save.
          </div>
        </>
      )}
    </div>
  );
}
