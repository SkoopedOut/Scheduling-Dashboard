// Change log persistence + field-level diffs between refreshes.
const CHANGELOG_KEY = "hub-dash-changelog";
export function loadChangeLog() {
  try { const v = JSON.parse(localStorage.getItem(CHANGELOG_KEY)); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveChangeLog(log) {
  try { localStorage.setItem(CHANGELOG_KEY, JSON.stringify(log.slice(0, 100))); } catch { /* storage unavailable */ }
}
export function diffJobFields(oj, nj) {
  const parts = [];
  if (!!oj.cancelled !== !!nj.cancelled) parts.push(nj.cancelled ? "Cancelled (struck through)" : "Reinstated (strike removed)");
  if (oj.customer !== nj.customer) parts.push(`Customer “${oj.customer}” → “${nj.customer}”`);
  if (oj.onsiteTime !== nj.onsiteTime) parts.push(`Time ${oj.onsiteTime || "–"} → ${nj.onsiteTime || "–"}`);
  if (oj.location !== nj.location) parts.push(`Location → ${nj.location || "–"}`);
  if (oj.numMen !== nj.numMen) parts.push(`Men ${oj.numMen ?? "–"} → ${nj.numMen ?? "–"}`);
  if (oj.trucks !== nj.trucks) parts.push(`Trucks ${oj.trucks || "–"} → ${nj.trucks || "–"}`);
  if ((oj.calledIn || "") !== (nj.calledIn || "")) parts.push(`PM ${oj.calledIn || "–"} → ${nj.calledIn || "–"}`);
  if ((oj.jobFolder || "") !== (nj.jobFolder || "")) parts.push(`Folder → ${(nj.jobFolder || "–").toUpperCase()}`);
  if ((oj.poJob || "") !== (nj.poJob || "")) parts.push(`PO → ${nj.poJob || "–"}`);
  const oldCrew = new Set(oj.crew || []), newCrew = new Set(nj.crew || []);
  const added = [...newCrew].filter(n => !oldCrew.has(n));
  const removed = [...oldCrew].filter(n => !newCrew.has(n));
  if (added.length) parts.push(`+ ${added.join(", ")}`);
  if (removed.length) parts.push(`− ${removed.join(", ")}`);
  return parts;
}
