import { getTokenForScopes } from './auth.js';
import { profileFor, cleanJobCrewName, personLabel } from './profiles.js';

// ============================================================
// Send schedule messages to Teams as the signed-in scheduler.
//
// Flow per job:
//   1. resolve each crew member's Teams email -> Entra user id
//   2. POST /chats            create a group chat (topic = job name)
//   3. POST /chats/{id}/messages   post the schedule text
//
// All delegated — the message appears as the scheduler, not a bot.
// Channel/chat posting has no application-permission path in Graph,
// so this is the only supported model. See TEAMS-SETUP.md.
// ============================================================

const GRAPH = 'https://graph.microsoft.com/v1.0';

// Teams renders plain text literally (asterisks show, newlines collapse).
// Convert our line-based message to safe HTML: escape, <br> for newlines,
// bold the "Label:" prefixes, and keep the tab indent on Trucks visible.
export function messageToHtml(text) {
  const esc = s => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = String(text || '').split('\n').map(line => {
    const tabbed = line.startsWith('\t');
    let s = esc(line.replace(/^\t/, ''));
    // Bold a leading "Label:" (word/# prefix).
    s = s.replace(/^([A-Za-z#][\w #/]*?:)/, '<b>$1</b>');
    if (tabbed) s = '&nbsp;&nbsp;&nbsp;&nbsp;' + s;
    return s;
  });
  return lines.join('<br>');
}

// Delegated scopes needed for group-chat messaging. Requested incrementally
// the first time a scheduler sends; consent is theirs, grant is IT's.
export const TEAMS_SCOPES = ['Chat.Create', 'ChatMessage.Send', 'User.Read.All'];

async function graph(method, path, token, body) {
  const res = await fetch(`${GRAPH}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    const err = new Error(`Graph ${method} ${path} failed (${res.status})${detail ? `: ${detail}` : ''}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

// Resolve a Teams email to an Entra user id. Returns null if not found.
async function resolveUserId(email, token, cache) {
  const key = email.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);
  try {
    // userPrincipalName or mail both work as the key for /users/{id|upn}.
    const user = await graph('GET', `/users/${encodeURIComponent(key)}?$select=id,displayName`, token);
    cache.set(key, user.id);
    return user.id;
  } catch (e) {
    if (e.status === 404) { cache.set(key, null); return null; }
    throw e;
  }
}

// From a job, gather { email, name } for each crew member that has a profile
// with a Teams email. Returns { recipients, missing } where missing lists
// names we couldn't resolve (no profile, or profile without an email).
export function jobRecipients(job, profiles) {
  const recipients = [];
  const missing = [];
  const seen = new Set();
  for (const raw of job.crew || []) {
    const name = cleanJobCrewName(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const p = profileFor(profiles, name);
    const email = p?.teamsEmail?.trim();
    if (email) recipients.push({ email, name: personLabel(profiles, name) });
    else missing.push({ name, reason: p ? 'no Teams email on profile' : 'no profile' });
  }
  return { recipients, missing };
}

// Create a group chat with the given member emails (plus the sender, who
// Graph adds implicitly as the caller — but we include resolvable members),
// then post the message. Returns { chatId, webUrl }.
//
// opts.topic      - chat title (e.g. the job/customer name)
// opts.dryRun     - resolve + validate but don't create/post
export async function sendJobChat(job, message, profiles, opts = {}) {
  const { topic } = opts;
  const token = await getTokenForScopes(TEAMS_SCOPES);
  const cache = new Map();

  const { recipients, missing } = jobRecipients(job, profiles);
  if (recipients.length === 0) {
    throw new Error('No crew member on this job has a Teams email saved. Add emails in the People tab first.');
  }

  // Resolve emails -> ids, dropping any that don't exist in the tenant.
  const members = [];
  const unresolved = [];
  for (const r of recipients) {
    const id = await resolveUserId(r.email, token, cache);
    if (id) {
      members.push({
        '@odata.type': '#microsoft.graph.aadUserConversationMember',
        roles: ['owner'],
        'user@odata.bind': `${GRAPH}/users('${id}')`,
      });
    } else {
      unresolved.push(r);
    }
  }

  if (members.length === 0) {
    throw new Error(`None of the crew emails matched a Teams account: ${recipients.map(r => r.email).join(', ')}`);
  }

  if (opts.dryRun) {
    return { dryRun: true, memberCount: members.length, unresolved, missing };
  }

  // Group chats require at least 2 non-caller members? No — a group chat can
  // be created with the members supplied; the caller is added automatically.
  const chat = await graph('POST', '/chats', token, {
    chatType: 'group',
    topic: topic || job.customer || 'Job schedule',
    members,
  });

  await graph('POST', `/chats/${chat.id}/messages`, token, {
    body: { contentType: 'html', content: messageToHtml(message) },
  });

  return { chatId: chat.id, webUrl: chat.webUrl || null, unresolved, missing, memberCount: members.length };
}

// Post to an existing chat by id (e.g. re-send to a chat the scheduler picked).
export async function postToChat(chatId, message) {
  const token = await getTokenForScopes(TEAMS_SCOPES);
  await graph('POST', `/chats/${encodeURIComponent(chatId)}/messages`, token, {
    body: { contentType: 'html', content: messageToHtml(message) },
  });
  return true;
}
