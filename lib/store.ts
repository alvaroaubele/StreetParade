"use client";

import type { SwipeState } from "./types";

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
