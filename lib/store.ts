"use client";

import type { SwipeState, VoteTally } from "./types";

/** Vote events (like + nope + superlike; skips excluded) — the one counting
 * rule every surface uses. */
export const countVotes = (votes: Record<string, VoteTally>) =>
  Object.values(votes).reduce((n, t) => n + t.l + t.n + (t.sl ?? 0), 0);

const KEY = "parademtach-state-v3";

export function loadState(): SwipeState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SwipeState) : null;
  } catch {
    return null;
  }
}

export function saveState(state: SwipeState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full/blocked — the session just won't persist
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
