# Scheduling Dashboard — Setup Guide

## What This Is

A live scheduling dashboard that pulls your weekly log book Excel files from SharePoint and displays them on a self-refreshing web page. Every team member can open it in their browser and see today's jobs, crew assignments, and the full week — updated automatically every 5 minutes.

---

## Quick Start (Demo Mode)

The dashboard works immediately with sample data so you can see it before connecting SharePoint.

---

## Full Setup: Step by Step

### STEP 1: Create a GitHub Account (free)

1. Go to **https://github.com** and sign up (free)
2. Verify your email

### STEP 2: Create the Repository

1. Click the **+** button (top right) → **New repository**
2. Name it: `scheduling-dashboard`
3. Set it to **Public** (required for free GitHub Pages)
4. Check **"Add a README file"**
5. Click **Create repository**

### STEP 3: Upload the Code

1. In your new repository, click **"Add file"** → **"Upload files"**
2. Drag and drop ALL the files and folders from this project:
   ```
   scheduling-dashboard/
   ├── .github/workflows/deploy.yml
   ├── public/
   ├── src/
   │   ├── main.jsx
   │   ├── App.jsx
   │   ├── auth.js          ← You'll edit this
   │   ├── sharepoint.js    ← You'll edit this
   │   └── sampleData.js
   ├── index.html
   ├── package.json         ← Edit the "homepage" field
   ├── vite.config.js
   └── SETUP.md
   ```
3. Click **"Commit changes"**

> **Important:** Make sure the `.github` folder (with the workflow file) is included. GitHub needs this to auto-deploy.

### STEP 4: Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages** (left sidebar)
2. Under "Build and deployment" → Source: select **"GitHub Actions"**
3. The workflow will auto-run on your next push

### STEP 5: Update package.json

Edit `package.json` and change the `homepage` line:
```json
"homepage": "https://YOUR_GITHUB_USERNAME.github.io/scheduling-dashboard"
```
Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

### STEP 6: Visit Your Dashboard

After the workflow runs (1-2 minutes), your dashboard will be live at:
```
https://YOUR_GITHUB_USERNAME.github.io/scheduling-dashboard/
```

At this point it shows **demo data**. Next, we connect SharePoint.

---

## Connecting SharePoint (Free with your M365 license)

### STEP 7: Register an App in Microsoft Entra

> **This is free.** You're not signing up for Azure billing. Every Microsoft 365 subscription includes access to the Entra admin portal for app registrations.

1. Go to **https://entra.microsoft.com**
2. Sign in with your **work Microsoft 365 account**
3. In the left sidebar: **Applications** → **App registrations**
4. Click **"+ New registration"**
5. Fill in:
   - **Name:** `Scheduling Dashboard`
   - **Supported account types:** "Accounts in this organizational directory only"
   - **Redirect URI:**
     - Platform: **Single-page application (SPA)**
     - URL: `https://YOUR_GITHUB_USERNAME.github.io/scheduling-dashboard/`
6. Click **Register**

### STEP 8: Copy Your IDs

On the app's **Overview** page, copy these two values:
- **Application (client) ID** — looks like `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- **Directory (tenant) ID** — same format

### STEP 9: Grant API Permissions

1. In your app registration → **API permissions** (left sidebar)
2. Click **"+ Add a permission"**
3. Choose **Microsoft Graph** → **Delegated permissions**
4. Search and check:
   - `Sites.Read.All`
   - `Files.Read.All`
5. Click **"Add permissions"**
6. Click **"Grant admin consent for [your org]"** (you may need an admin to do this)

### STEP 10: Update the Code

Edit **`src/auth.js`** — replace the placeholder values:
```javascript
const CLIENT_ID = 'paste-your-client-id-here';
const TENANT_ID = 'paste-your-tenant-id-here';
```

Edit **`src/sharepoint.js`** — update your SharePoint site:
```javascript
const SHAREPOINT_SITE_URL = 'yourcompany.sharepoint.com:/sites/YourSiteName';
```

To find your site URL:
1. Go to your SharePoint site in a browser
2. The URL looks like: `https://yourcompany.sharepoint.com/sites/SchedulingTeam`
3. Use: `yourcompany.sharepoint.com:/sites/SchedulingTeam`

### STEP 11: Commit and Deploy

1. Commit the changes to GitHub
2. The workflow auto-deploys in ~1 minute
3. Open the dashboard URL
4. Click **"SIGN IN"** in the top bar
5. A Microsoft login popup appears — sign in with your work account
6. The dashboard loads live data from SharePoint!

---

## How It Works

### File Path Logic
The dashboard automatically calculates which file to fetch based on today's date:

```
Scheduling Team - Documents/
  Schedule/
    04 April 26/
      3-28-2026_Log_Book_.xlsx    ← Saturday date of the week
    05 May 26/
      5-2-2026_Log_Book_.xlsx
```

- Files are named by the **Saturday date** (end of week)
- Folders are named `MM Month YY` (e.g., `04 April 26`)
- The app calculates the correct Saturday and folder for any given day

### Auto-Refresh
- Data refreshes every **5 minutes** automatically
- The day auto-advances at **midnight**
- The connection bar shows countdown to next refresh

### What Gets Parsed
From each day's tab in the Excel file:
- **Jobs:** Customer, PO#, location, onsite time, trucks, crew size, crew names
- **PM Initials:** Who confirmed the job (D, R, G, J, JE)
- **Job Folder:** Status (✓ Yes, ✗ No, SM = Site Map)
- **Foreman Crews:** 8 foreman groups with their members
- **Available Pool:** Laborers, Drivers, Extra

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "DEMO ONLY" button instead of "SIGN IN" | Update CLIENT_ID and TENANT_ID in `src/auth.js` |
| Login popup blocked | Allow popups for github.io in your browser |
| "Sites.Read.All" permission denied | Ask your Microsoft 365 admin to grant admin consent |
| File not found error | Check that the folder name matches `MM Month YY` format |
| Blank data for a day | Make sure the Excel tab is named exactly (e.g., "Monday" not "monday") |
| GitHub Pages 404 | Check Settings → Pages → Source is set to "GitHub Actions" |
| Build fails | Check the Actions tab for error details |

---

## File Structure

```
src/
  auth.js         → Microsoft SSO login (MSAL)
  sharepoint.js   → Fetches & parses Excel from SharePoint via Graph API
  sampleData.js   → Demo data (used when not connected)
  App.jsx         → Main dashboard UI
  main.jsx        → React entry point
```

---

## Updating Foreman Crews

If your foreman list changes, update `FOREMAN_ORDER` in `src/sampleData.js` and `src/sharepoint.js`. The dashboard uses this list to identify foremen in the roster columns and highlight them in the schedule view.

---

## Questions?

The dashboard is designed to work with your exact file structure. If your naming convention changes, the `getWeekFileInfo()` function in `src/sharepoint.js` is where the path logic lives.
