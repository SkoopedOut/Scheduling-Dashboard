# 2027 season: the website is the schedule

Starting with the week of **Sunday Dec 27, 2026 – Saturday Jan 2, 2027**, the
Daily Jobs site stops reading Excel log books and becomes the place the
schedule is kept. Weeks ending in 2026 or earlier still read the Excel log
books exactly as before.

## Where the data lives

Everything stays in the SchedulingTeam SharePoint site, **Documents** library:

| What | Path | Who writes it |
|---|---|---|
| Roster (one for every week) | `Schedule/Site Data/roster.json` | Edit roster, on save |
| Week data — jobs, job notes, who's out, day notes | `Schedule/Site Data/2027/2027-03-13.json` | The website, on every save |
| Backup log book | `Schedule/Backup Log Books/2027/03 March 27/3-13-2027 Log Book.xlsx` | The website, on every save |
| Installer profiles | `Schedule/installers.json` | People tab (unchanged) |

The backup log book uses the same layout as the old hand-kept one: day tabs,
two-row job blocks, crew in H–L, folder status in N, roster on the right with
bold foremen. Job notes appear as a cell note on the customer and in a
**Job Notes** tab. It is a **read-only copy** — edits made in Excel are
overwritten the next time someone saves on the site.

The first time anyone opens a 2027 week, the roster is started from the newest
Excel log book's roster and saved as `roster.json`.

## How to use it

- **Every 2027 week is open.** Go to any week and schedule — the first save
  creates that week's file. On the **Month** tab, **Create all 2027 weeks** writes
  every week (Jan 2, 2027 through the New Year week ending Jan 1, 2028) and its
  backup log book to SharePoint in one go. Weeks that already exist are left
  alone, so it's safe to run again.
- **Add job** opens the job form. The right side shows every crew and pool for
  that day with who is free, who is already on another job in the same time
  slot (orange, with the job #), and who is out. Tap names to add them, or
  **Add whole crew**. The truck button on a chosen name marks them as driving.
  **Also copy to** puts the same job on other days in one step.
- **Notes tab** on every job holds anything extra — site contact, codes, dock
  booking, scope details. The first lines show under the job on the schedule
  (tap to open), and notes are searchable.
- **Edit roster** changes the one roster every week uses: crews, foremen,
  qualifications, pools. A change shows on every week right away, and the
  backup log books from the current week on are rewritten in the background to
  match. Backups for past weeks keep the roster they were saved with.
- **Who's out** is per day: tap names to cycle working → out (vacation /
  injured) → crossed out, and copy the same list to other days of that week.
- **Add notes** sets that day's scheduler notes.

Every save writes the JSON and the backup log book. The status next to the
buttons says when it saved and whether the backup was written. If two people
save the same week at once, the second save automatically picks up the first
person's changes and reapplies its own edit. If two people change the roster at
once, the second is asked to make their change again on the latest roster.

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
  the first save. Version history on `roster.json` is the way to undo a bad
  roster change.

**Teams** — unchanged; see `TEAMS-SETUP.md`.

## Changing the cutover

`STORE_START_SAT` in `src/weekStore.js` is the first Saturday the site owns
(`2027-01-02`). Weeks ending on or after it use site data.
