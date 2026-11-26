"use client";

import { useSyncExternalStore } from "react";

/** Ages ("3 ore fa", 3 hours ago) change by the minute: more often would be just noise. */
const TICK_MS = 60_000;

let now: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick(): void {
  now = Date.now();
  listeners.forEach((notify) => notify());
}

/**
 * On mobile a background tab has its timers frozen: on return the time must be
 * updated immediately, not at the next tick, otherwise for a minute the page
 * shows ages and data from when it was left.
 */
function tickWhenVisible(): void {
  if (document.visibilityState === "visible") {
    tick();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", tickWhenVisible);
    // Returning from the browser's back/forward cache does not always go through
    // `visibilitychange`.
    window.addEventListener("pageshow", tickWhenVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", tickWhenVisible);
      window.removeEventListener("pageshow", tickWhenVisible);
    }
  };
}

function getSnapshot(): number | null {
  return now;
}

function getServerSnapshot(): null {
  return null;
}

/**
 * Current time, `null` until the page is mounted in the browser. The page is
 * prerendered and served from the cache: an age computed on the server would be
 * frozen at generation time, and different from the client's one
 * at hydration.
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
