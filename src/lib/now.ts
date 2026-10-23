"use client";

import { useSyncExternalStore } from "react";

/** Le età ("3 ore fa") cambiano al minuto: più spesso sarebbe solo rumore. */
const TICK_MS = 60_000;

let now: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick(): void {
  now = Date.now();
  listeners.forEach((notify) => notify());
}

/**
 * Su mobile una scheda in background ha i timer congelati: al ritorno l'ora va
 * aggiornata subito, non al tick successivo, altrimenti per un minuto la pagina
 * mostra età e dati di quando era stata lasciata.
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
    // Il ritorno dalla cache avanti/indietro del browser non sempre passa da
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
 * Ora corrente, `null` finché la pagina non è montata nel browser. La pagina è
 * prerenderizzata e servita dalla cache: un'età calcolata sul server sarebbe
 * congelata al momento della generazione, e diversa da quella del client
 * all'idratazione.
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
