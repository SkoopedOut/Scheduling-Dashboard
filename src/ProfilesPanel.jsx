import { useState, useEffect, useMemo } from 'react';
import {
  loadProfiles, saveProfiles, emptyStore, collectRosterNames, mergeRosterNames,
  upsertProfile, removeProfile, blankProfile, validateProfile, formatPhone,
  profileCompleteness, rosterKey, ROLES, ROLE_LABEL,
} from './profiles.js';
import { SYS } from './scheduleUtils.js';
import { A, tint, Icon, Capsule, Avatar, Group, SectionFooter, SearchField, Segmented, ChipBar, TextInput, SelectField, FilledButton, GrayButton, PlainButton, Spinner, Ring, EmptyState } from './ui/apple.jsx';

const ROLE_COLOR = {
  foreman: SYS.orange,
  'apprentice-1': SYS.green, 'apprentice-2': SYS.green, 'apprentice-3': SYS.green, 'apprentice-4': SYS.green,
  laborer: SYS.blue,
};

function RoleTag({ role }) {
  if (!role) return <span style={{ color: A.label3, fontSize: 13 }}>No role</span>;
  return <Capsule color={ROLE_COLOR[role] || SYS.gray}>{ROLE_LABEL[role] || role}</Capsule>;
}

function Field({ label, hint, error, children, wide }) {
  return (
    <label style={{ display: 'block', gridColumn: wide ? '1 / -1' : undefined }}>
      <span style={{ display: 'block', fontSize: 13, color: A.label2, marginBottom: 5 }}>{label}</span>
      {children}
      {error ? <span style={{ display: 'block', fontSize: 12, color: SYS.red, marginTop: 4 }}>{error}</span>
        : hint && <span style={{ display: 'block', fontSize: 12, color: A.label3, marginTop: 4 }}>{hint}</span>}
    </label>
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
    <div className="ap-fade" style={{ background: A.cell2, borderRadius: 12, padding: 16, margin: '0 0 14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        <Field label="Name on the log book" hint="How the schedule spells it. Can’t be changed here."><TextInput value={draft.rosterName} readOnly /></Field>
        <Field label="Real name" hint="Fill in when the log book uses a nickname."><TextInput value={draft.displayName} placeholder={draft.rosterName} onChange={v => set('displayName', v)} /></Field>
        <Field label="Role">
          <SelectField value={draft.role} onChange={v => set('role', v)} ariaLabel="Role">
            <option value="">Not set</option>
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </SelectField>
        </Field>
        <Field label="Phone" error={errors.phone}><TextInput type="tel" value={draft.phone} placeholder="(978) 555-0134" invalid={!!errors.phone} onChange={v => set('phone', v)} onBlur={e => set('phone', formatPhone(e.target.value))} /></Field>
        <Field label="Teams email" error={errors.teamsEmail}><TextInput type="email" value={draft.teamsEmail} placeholder="name@hubofficeinc.com" invalid={!!errors.teamsEmail} onChange={v => set('teamsEmail', v)} /></Field>
        <Field label="Other spellings" hint="Separate with commas — for job-row spellings that don’t match.">
          <TextInput value={(draft.aliases || []).join(', ')} placeholder="Mike, Mikey" onChange={v => set('aliases', v.split(',').map(x => x.trim()).filter(Boolean))} />
        </Field>
        <Field label="Notes" wide><TextInput value={draft.notes} onChange={v => set('notes', v)} /></Field>
      </div>

      {rosterInfo && (
        <div style={{ fontSize: 13, color: A.label2, marginTop: 14 }}>
          On the schedule {rosterInfo.days.length} {rosterInfo.days.length === 1 ? 'day' : 'days'} this week
          {rosterInfo.onJobs ? `, on ${rosterInfo.onJobs} ${rosterInfo.onJobs === 1 ? 'job' : 'jobs'}` : ''}
          {rosterInfo.crews.length ? ` · Crew: ${rosterInfo.crews.join(', ')}` : ''}
          {rosterInfo.pools.length ? ` · Pool: ${rosterInfo.pools.join(', ')}` : ''}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <FilledButton disabled={hasErrors} onClick={() => onSave(draft)}>Save profile</FilledButton>
        <GrayButton onClick={onCancel}>Cancel</GrayButton>
        {touched && <span style={{ fontSize: 13, color: SYS.orange }}>Unsaved changes</span>}
        <div style={{ flex: 1 }} />
        <PlainButton color={SYS.red} onClick={() => { if (window.confirm(`Remove ${draft.rosterName}’s profile?`)) onDelete(draft.rosterName); }}><Icon name="trash" size={16} weight={2} />Remove</PlainButton>
      </div>
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

  const isNarrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  const filters = [{ id: 'all', label: 'Everyone' }, { id: 'incomplete', label: 'Missing details' }, { id: 'noprofile', label: 'No profile' }, { id: 'foremen', label: 'Foremen' }];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <Ring value={stats.complete} total={stats.total || 1} color={SYS.green} size={46} stroke={5}>{stats.total ? Math.round((stats.complete / stats.total) * 100) : 0}%</Ring>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Installer profiles</div>
          <div className="tnum" style={{ fontSize: 13, color: A.label2 }}>{stats.complete} of {stats.total} complete · {stats.withProfile} have a profile</div>
        </div>
        <div style={{ flex: 1 }} />
        {dirty && <span style={{ fontSize: 13, color: SYS.orange }}>Unsaved changes</span>}
        <GrayButton onClick={reload} disabled={status === 'saving'}><Icon name="refresh" size={15} weight={2.2} />Reload</GrayButton>
        <FilledButton disabled={!dirty || status === 'saving'} onClick={persist}>{status === 'saving' ? <><Spinner size={14} color="#fff" />Saving…</> : 'Save to SharePoint'}</FilledButton>
        {onClose && <GrayButton onClick={onClose}>Close</GrayButton>}
      </div>

      {error && (
        <div role="alert" style={{ background: tint(SYS.red, 0.14), color: SYS.red, borderRadius: 12, padding: '11px 14px', fontSize: 14, marginBottom: 14 }}>{error}</div>
      )}

      {status === 'loading' && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: A.label2, fontSize: 14, padding: '20px 0' }}><Spinner size={16} />Loading profiles…</div>}

      {status !== 'loading' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 240px', maxWidth: isNarrow ? 'none' : 340, display: 'flex' }}>
              <SearchField value={filter} onChange={setFilter} placeholder="Search names or emails" />
            </div>
            {isNarrow
              ? <div style={{ width: '100%' }}><ChipBar options={filters} value={showOnly} onChange={setShowOnly} ariaLabel="Show" /></div>
              : <Segmented options={filters} value={showOnly} onChange={setShowOnly} ariaLabel="Show" style={{ width: 460 }} />}
            <PlainButton onClick={addMissing}><Icon name="plus" size={16} weight={2.4} />Add everyone on this week’s schedule</PlainButton>
          </div>

          {unmatched.length > 0 && (
            <div style={{ background: tint(SYS.orange, 0.12), borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 15, color: SYS.orange, fontWeight: 600, marginBottom: 4 }}>
                Job rows use {unmatched.length} {unmatched.length === 1 ? 'spelling' : 'spellings'} that don’t match the crew list
              </div>
              <div style={{ fontSize: 13, color: A.label }}>{unmatched.map(u => `${u.name} (${u.count}×)`).join(', ')}</div>
              <div style={{ fontSize: 13, color: A.label2, marginTop: 4 }}>Add each one under “Other spellings” on the right person so their jobs count correctly.</div>
            </div>
          )}

          <Group>
            {rows.length === 0 && <EmptyState icon="search" title="No one matches">Try a different name or filter.</EmptyState>}
            {rows.map((row, i) => {
              const p = row.profile;
              const isEditing = editing === row.key;
              const comp = p ? profileCompleteness(p) : null;
              return (
                <div key={row.key}>
                  <button type="button" onClick={() => setEditing(isEditing ? null : row.key)} aria-expanded={isEditing} className="ap-btn ap-row ap-tap" style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '0 16px', background: isEditing ? A.fill4 : 'transparent', border: 'none', color: 'inherit', textAlign: 'left' }}>
                    <Avatar name={p?.displayName || row.name} size={36} color={row.roster?.seenAsForeman || p?.role === 'foreman' ? SYS.orange : null} />
                    <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: isNarrow ? '1fr auto' : 'minmax(160px,1.3fr) 130px minmax(120px,1fr) minmax(170px,1.4fr) 40px', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: i ? `0.5px solid ${A.sep}` : 'none' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {row.name}
                          {row.roster?.seenAsForeman && <Capsule color={SYS.orange} size={10}>Foreman</Capsule>}
                          {!row.roster && <Capsule color={SYS.gray} size={10}>Not this week</Capsule>}
                        </div>
                        <div style={{ fontSize: 13, color: p?.displayName ? A.label2 : A.label3 }}>{p?.displayName || 'No real name'}</div>
                      </div>
                      {isNarrow
                        ? <span className="tnum" style={{ fontSize: 13, color: A.label3 }}>{comp ? `${comp.filled}/4` : 'New'}</span>
                        : <>
                            <div><RoleTag role={p?.role} /></div>
                            <div className="tnum" style={{ fontSize: 13, color: p?.phone ? A.label : A.label3 }}>{p?.phone ? formatPhone(p.phone) : 'No phone'}</div>
                            <div style={{ fontSize: 13, color: p?.teamsEmail ? A.label : A.label3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.teamsEmail || 'No Teams email'}</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              {comp ? <Ring value={comp.filled} total={4} color={comp.complete ? SYS.green : SYS.orange} size={28} stroke={3}>{comp.filled}</Ring> : <span style={{ fontSize: 12, color: A.label3 }}>New</span>}
                            </div>
                          </>}
                    </div>
                  </button>
                  {isEditing && (
                    <div style={{ padding: '4px 16px 0' }}>
                      <Editor profile={p || blankProfile(row.name)} rosterInfo={row.roster} onSave={handleSave} onCancel={() => setEditing(null)} onDelete={handleDelete} />
                    </div>
                  )}
                </div>
              );
            })}
          </Group>

          <SectionFooter>Saved to Documents/Schedule/installers.json in SharePoint. Changes aren’t live until you choose Save to SharePoint. The ring shows how many of name, role, phone and Teams email are filled in.</SectionFooter>
        </>
      )}
    </div>
  );
}
