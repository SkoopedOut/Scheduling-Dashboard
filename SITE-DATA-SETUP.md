# 2027 season: the website is the schedule

Starting with the week of **Sunday Dec 27, 2026 – Saturday Jan 2, 2027**, the
Daily Jobs site stops reading Excel log books and becomes the place the
schedule is kept. Weeks ending in 2026 or earlier still read the Excel log
books exactly as before.

## Where the data lives

Everything stays in the SchedulingTeam SharePoint site, **Documents** library:

| What | Path | Who writes it |
|---|---|---|
| Week data (source of truth) | `Schedule/Site Data/2027/2027-01-09.json` | The website, on every save |
| Backup log book | `Schedule/Backup Log Books/2027/01 January 27/1-9-2027 Log Book.xlsx` | The website, on every save |
| Installer profiles | `Schedule/installers.json` | People tab (unchanged) |

The backup log book uses the same layout as the old hand-kept one: day tabs,
two-row job blocks, crew in H–L, folder status in N, roster on the right with
bold foremen. It is a **read-only copy** — edits made in Excel are overwritten
the next time someone saves on the site. If the site were ever unavailable, the
old dashboard code can still read these files.

## How to use it

1. Go to a 2027 week. If it hasn't been set up, press **Set up this week**. The
   roster is copied from the week before (anyone marked out goes back on their
   crew); every day starts with no jobs.
2. **Add job** opens the job form. The right side shows every crew and pool for
   that day with who is free, who is already on another job in the same time
   slot (orange, with the job #), and who is out. Tap names to add them, or
   **Add whole crew**. The truck button on a chosen name marks them as driving.
   **Also copy to** puts the same job on other days in one step.
3. The pencil on any job edits it — every field, including cancelled, folder
   status, called in, trash and driver return. Changing the day moves the job.
4. **Edit roster** changes crews, pools, qualifications, and who is out or
   crossed out. Choose whether it applies to just that day, the rest of the
   week, or the whole week.
5. **Add notes** sets that day's scheduler notes.

Every save writes the JSON and the backup log book. The status next to the
buttons says when it saved and whether the backup was written. If two people
save the same week at once, the second save automatically picks up the first
person's changes and reapplies its own edit.

## IT checklist

**Entra admin center → App registrations → the dashboard app**

- API permissions → add Microsoft Graph **delegated** `Files.ReadWrite.All`,
  then **Grant admin consent**. (`Sites.Read.All`, `Files.Read.All`,
  `Chat.Create`, `ChatMessage.Send`, `User.Read.All` stay as they are.) Without
  admin consent each scheduler gets a one-time consent prompt the first time
  they save.
- Authentication → the GitHub Pages URL stays registered as a
  **Single-page application** redirect URI. Add any new URL if the site moves.

**SharePoint (SchedulingTeam site)**

- Schedulers who edit need **Edit** rights on `Documents/Schedule`. Delegated
  permissions can't go beyond the signed-in person's own access, so a person
  with Read rights can view but every save returns a 403. TV/kiosk accounts only
  need Read.
- Turn on **version history** for the Documents library (Library settings →
  Versioning). Every save is a new version of the week's JSON, so any bad edit
  can be rolled back.
- The `Site Data` and `Backup Log Books` folders are created automatically on
  the first save.

**Teams** — unchanged; see `TEAMS-SETUP.md`.

## Changing the cutover

`STORE_START_SAT` in `src/weekStore.js` is the first Saturday the site owns
(`2027-01-02`). Weeks ending on or after it use site data.
