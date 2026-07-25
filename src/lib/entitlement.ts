// Client-side free-tier counter for anonymous visitors.
// Signed-in users are enforced server-side via consume_free_enhancement().
// This local counter is UX only — a determined user can reset it by clearing
// storage, but the server-side path is the security boundary for signed-in
// accounts. FREE_CAP mirrors the server default (5) so limits stay aligned.

export const FREE_CAP = 5;
const KEY = "ppp:free-used-v1";

export function getLocalUsed(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(KEY);
  const n = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function incrementLocalUsed(): number {
  if (typeof window === "undefined") return 0;
  const next = getLocalUsed() + 1;
  window.localStorage.setItem(KEY, String(next));
  return next;
}

export function resetLocalUsed(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
