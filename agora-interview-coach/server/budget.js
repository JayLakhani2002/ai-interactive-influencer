import fs from "node:fs";

export const BUDGET_CAP_SECONDS = 1380; // 23:00 — plan §2 reserve threshold
export const MODE_DURATIONS = { dev: 75, full: 330 };

export function computeUsedSeconds(sessions) {
  return sessions.reduce((sum, s) => sum + s.reservedSeconds, 0);
}

export function checkGuard(sessions, force) {
  const usedSeconds = computeUsedSeconds(sessions);
  const allowed = force || usedSeconds < BUDGET_CAP_SECONDS;
  return { allowed, usedSeconds };
}

export function loadLedger(path) {
  if (!fs.existsSync(path)) return [];
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

export function appendSession(path, entry) {
  const sessions = loadLedger(path);
  sessions.push(entry);
  fs.writeFileSync(path, JSON.stringify(sessions, null, 2));
  return sessions;
}
