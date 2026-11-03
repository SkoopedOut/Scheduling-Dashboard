// ── Entry screen ─────────────────────────────────────────────
// What a person sees before they are signed in: what this is, what it
// shows, and the one thing to do next. Nothing on this screen is sample
// data — the schedule only ever comes from the team's SharePoint log books.
import { A, Icon, Spinner, FilledButton } from './ui/apple.jsx';
import { SYS } from './scheduleUtils.js';
import { ThemeToggle } from './ui/theme.jsx';

const POINTS = [
  { icon: 'listBullet', color: SYS.blue, title: 'Every day’s jobs', text: 'Customers, addresses, start times, crews and trucks for any day of the week.' },
  { icon: 'calendar', color: SYS.indigo, title: 'Week and month views', text: 'See the whole month at a glance, search it, and jump to any date.' },
  { icon: 'refresh', color: SYS.green, title: 'Always up to date', text: 'Reads the team’s SharePoint log books and refreshes itself every couple of minutes.' },
  { icon: 'tv', color: SYS.orange, title: 'Made for the office screen', text: 'TV mode turns it into a full-screen display that rotates on its own.' },
];

// Turn the raw sign-in failure into something a person can act on
function friendlyError(msg) {
  const m = String(msg || '');
  if (/popup|window/i.test(m)) return 'The sign-in window was blocked. Allow pop-ups for this page, then try again.';
  if (/cancel|closed|dismiss/i.test(m)) return 'Sign-in was cancelled. Select “Sign in with Microsoft” to try again.';
  return `Couldn’t sign in: ${m}`;
}

export default function SignIn({ checking, configured, busy, error, tvPending, onSignIn, theme, isMobile }) {
  return (
    <div className="ap-ambient" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', color: A.label, fontFamily: A.font,
      padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><ThemeToggle theme={theme} size={34} /></div>
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0 24px' }}>
        <div className="glass-strong ap-fade" style={{ width: '100%', maxWidth: 520, borderRadius: 24, padding: isMobile ? '28px 22px' : '40px 40px 34px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <span aria-hidden className="glass-pill" style={{ width: 56, height: 56, borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              background: `linear-gradient(160deg, ${SYS.blue}, ${SYS.indigo})` }}>
              <Icon name="calendar" size={30} weight={1.8} />
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: A.label2 }}>Hub Office · Scheduling Team</div>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.12 }}>Daily Jobs</h1>
            </div>
          </div>

          <p style={{ margin: '0 0 22px', fontSize: 16, lineHeight: 1.5, color: A.label2 }}>
            Who is working where, today and every day around it — read straight from the scheduling team’s log books.
          </p>

          <ul style={{ listStyle: 'none', margin: '0 0 26px', padding: 0, display: 'grid', gap: 14 }}>
            {POINTS.map(p => (
              <li key={p.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span aria-hidden style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: p.color }}>
                  <Icon name={p.icon} size={17} weight={2.1} />
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{p.title}</span>
                  <span style={{ display: 'block', fontSize: 14, color: A.label2, lineHeight: 1.4, marginTop: 1 }}>{p.text}</span>
                </span>
              </li>
            ))}
          </ul>

          {checking ? (
            <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px 0', color: A.label2, fontSize: 15 }}>
              <Spinner size={18} />Checking your sign-in…
            </div>
          ) : !configured ? (
            <div role="alert" className="glass-pill" style={{ padding: '14px 16px', borderRadius: 14, background: `color-mix(in srgb, ${SYS.orange} 14%, transparent)`, fontSize: 14, lineHeight: 1.45 }}>
              <b style={{ color: SYS.orange }}>This dashboard isn’t connected to Microsoft yet.</b>
              <div style={{ color: A.label2, marginTop: 4 }}>Whoever manages it needs to set the app’s client and tenant IDs in <code>src/auth.js</code> — SETUP.md walks through it.</div>
            </div>
          ) : (
            <>
              <FilledButton onClick={onSignIn} disabled={busy} style={{ width: '100%', height: 48, fontSize: 17, borderRadius: 14 }}>
                {busy ? <><Spinner size={18} color="#fff" />Waiting for Microsoft…</> : <><Icon name="person" size={19} weight={2.1} />Sign in with Microsoft</>}
              </FilledButton>
              <p style={{ margin: '12px 2px 0', fontSize: 13, lineHeight: 1.45, color: A.label2, textAlign: 'center' }}>
                {tvPending
                  ? 'TV mode will start as soon as you’re signed in.'
                  : 'Use your Hub Office account. A sign-in window opens — if nothing appears, allow pop-ups for this page.'}
              </p>
              {error && <div role="alert" style={{ marginTop: 12, textAlign: 'center', fontSize: 14, fontWeight: 500, color: SYS.red }}>{friendlyError(error)}</div>}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
