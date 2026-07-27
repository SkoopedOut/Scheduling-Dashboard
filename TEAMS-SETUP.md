# Teams Messaging — IT Setup

This adds the ability for schedulers to send a job's schedule as a Teams
**group chat** to the assigned crew, straight from the dashboard. Messages
post **as the signed-in scheduler** — they show up in Teams exactly as if that
person typed them, not as a bot or shared account.

The whole thing needs **three delegated Microsoft Graph permissions** added to
the app registration you already created for the dashboard. No new app, no
service account, no Azure billing.

---

## Why these permissions, and why "delegated"

Microsoft does not allow an app/bot identity to post Teams messages — the only
supported way to send a chat or channel message through Graph is **on behalf of
a signed-in user** (delegated). So the dashboard signs the scheduler in and
sends as them. This is a Microsoft platform rule, not a design choice on our
side.

Because it's delegated, every message is attributable to a real person, and a
scheduler can only message people and chats they'd normally be able to in Teams.

---

## What to add

In the **same app registration** the dashboard already uses
(Entra admin center → App registrations → the dashboard app):

### STEP 1 — Add the permissions

1. Open the app → **API permissions** (left sidebar)
2. Click **"+ Add a permission"**
3. Choose **Microsoft Graph** → **Delegated permissions**
4. Search for and check each of these three:

   | Permission | Why it's needed |
   |---|---|
   | `Chat.Create` | Create the group chat for a job |
   | `ChatMessage.Send` | Post the schedule message into that chat |
   | `User.Read.All` | Look up each crew member's Teams account by their email |

5. Click **"Add permissions"**

After this the app should list five delegated Graph permissions total — the
two the dashboard already had (`Sites.Read.All`, `Files.Read.All`) plus these
three.

### STEP 2 — Grant admin consent

1. Still on the **API permissions** page, click
   **"Grant admin consent for [your organization]"**
2. Confirm. The Status column should show a green check for all five.

`User.Read.All` requires an administrator to consent — a regular user can't
approve it themselves. The other two can be consented by the user at first use,
but granting admin consent for all three up front means schedulers won't see a
consent prompt at all.

> If you'd rather not grant `User.Read.All` tenant-wide: it's only used to turn
> a crew member's email address into the ID Teams needs to add them to a chat.
> There isn't a narrower delegated permission that does this lookup, so it's
> required for the "build a chat from profile emails" feature. If this is a
> concern, tell us and we can discuss alternatives (e.g. storing Entra user IDs
> on profiles directly), but it's more manual.

### STEP 3 — Confirm the redirect URI (probably already done)

Sending uses the same sign-in the dashboard already uses, so if login works
today, nothing to change. For reference, under **Authentication** the app
should have the dashboard's URL as a **Single-page application** redirect URI:

```
https://<your-github-username>.github.io/Scheduling-Dashboard/
```

---

## What the scheduler sees

1. They fill in each installer's **Teams email** on the **People** tab (this is
   the address of the person's Microsoft/Teams account — usually their work
   email).
2. On the **Send to Teams** tab, with "One day" selected, each job shows the
   crew it would message and a **Send group chat** button.
3. The first time they send, Teams pops a one-time permission approval (unless
   admin consent was granted in Step 2). After that it's one click.
4. Each send creates a **new** group chat named after the job and posts the
   schedule into it.

Anyone on the job without a Teams email saved is listed as "Missing email" and
simply left out of the chat — the send still goes to everyone who has one.

---

## Security notes

- **No secrets are stored.** The dashboard is a public single-page app; it uses
  the same interactive sign-in (MSAL) as before. There is no client secret and
  no token saved anywhere server-side.
- **Least privilege.** These are the minimum Graph permissions that let a user
  create a chat, add members by email, and post one message. No mail, no files
  beyond what the dashboard already reads, no directory write access.
- **Attributable.** Because everything is delegated, every message is sent by
  and traceable to the individual scheduler.
- **Revocable.** Removing the three permissions (or revoking admin consent) in
  Entra immediately disables sending; the rest of the dashboard keeps working.

---

## Quick test after setup

1. Have a scheduler open the dashboard and sign in.
2. On the **People** tab, put a real Teams email on one installer (their own,
   for testing).
3. On **Send to Teams** → **One day**, pick a day with a job that installer is
   on, and click **Send group chat**.
4. Approve the permission prompt if it appears.
5. Check Teams — a new group chat should appear with the schedule message.

If it fails, the button shows the Graph error message inline (e.g. a 403 means
consent is still missing; a 404 on a name means that email doesn't match a
Teams account).
