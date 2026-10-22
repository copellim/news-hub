"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { FeedItem } from "@/lib/feed";
import {
  applyOperations,
  DEFAULT_SETTINGS,
  normalizeSettings,
  type Settings,
  type SettingsOperation,
} from "@/lib/settings-model";

/**
 * Stato dell'utente nel browser: una copia di quello che sta su Blob, più le
 * modifiche non ancora salvate. Ogni click aggiorna subito la pagina; le
 * modifiche partono insieme qualche secondo dopo l'ultima, perché ogni
 * salvataggio riscrive il file e il piano Hobby di Blob ha 2.000 scritture al
 * mese, oltre le quali lo store resta bloccato per 30 giorni.
 */

const SETTINGS_ENDPOINT = "/api/settings";

/** Attesa dopo l'ultima modifica prima di salvare: raccoglie i click di fila. */
const FLUSH_DELAY_MS = 3_000;

/** Dopo un salvataggio fallito si riprova con calma, senza martellare. */
const RETRY_DELAY_MS = 15_000;

/** Limite del browser per `fetch` con `keepalive`, con un po' di margine. */
const MAX_KEEPALIVE_BYTES = 60_000;

/** Chiave della versione che teneva tutto nel localStorage. */
const LEGACY_STORAGE_KEY = "news-hub:settings:v1";

export type SettingsStatus = "loading" | "signedOut" | "ready" | "error";

type SettingsSnapshot = {
  status: SettingsStatus;
  settings: Settings;
};

/** Il server non sa chi è l'utente: renderizza come se lo stato stesse arrivando. */
const LOADING_SNAPSHOT: SettingsSnapshot = {
  status: "loading",
  settings: DEFAULT_SETTINGS,
};

/**
 * `useSyncExternalStore` confronta gli snapshot per identità: l'oggetto si
 * sostituisce solo quando qualcosa cambia davvero.
 */
let snapshot: SettingsSnapshot = LOADING_SNAPSHOT;
/** Ultima versione confermata dal server. */
let confirmed: Settings = DEFAULT_SETTINGS;
/** Modifiche già visibili in pagina ma non ancora salvate. */
let pending: SettingsOperation[] = [];
let isFlushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let hasStartedLoading = false;
const listeners = new Set<() => void>();

// --- Hook ------------------------------------------------------------------

export function useSettingsStatus(): SettingsStatus {
  return useSnapshot().status;
}

export function useBookmarks() {
  const { settings } = useSnapshot();
  const bookmarks = settings.bookmarks;

  const bookmarkedKeys = useMemo(
    () => new Set(bookmarks.map((bookmark) => bookmark.key)),
    [bookmarks],
  );

  const toggleBookmark = useCallback((item: FeedItem) => {
    const isSaved = snapshot.settings.bookmarks.some(
      (bookmark) => bookmark.key === item.key,
    );
    enqueue(
      isSaved
        ? { type: "removeBookmark", key: item.key }
        : {
            type: "addBookmark",
            bookmark: { ...item, savedAt: new Date().toISOString() },
          },
    );
  }, []);

  const removeBookmark = useCallback((key: string) => {
    enqueue({ type: "removeBookmark", key });
  }, []);

  return { bookmarks, bookmarkedKeys, toggleBookmark, removeBookmark };
}

export function useVisitedItems() {
  const { settings } = useSnapshot();
  const visited = settings.visited;

  const visitedKeys = useMemo(() => new Set(visited), [visited]);

  const markVisited = useCallback((key: string) => {
    if (!snapshot.settings.visited.includes(key)) {
      enqueue({ type: "markVisited", key });
    }
  }, []);

  return { visitedKeys, markVisited };
}

export function useArxivCategories() {
  const { settings } = useSnapshot();

  const toggleCategory = useCallback((id: string) => {
    const current = snapshot.settings.arxivCategories;
    enqueue({
      type: "setCategories",
      categories: current.includes(id)
        ? current.filter((category) => category !== id)
        : [...current, id],
    });
  }, []);

  return { categories: settings.arxivCategories, toggleCategory };
}

/** Dopo il logout lo stato dell'utente non deve restare in pagina. */
export function clearSettings(): void {
  pending = [];
  confirmed = DEFAULT_SETTINGS;
  publish({ status: "signedOut", settings: DEFAULT_SETTINGS });
}

function useSnapshot(): SettingsSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// --- Store ------------------------------------------------------------------

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  startLoading();
  return () => listeners.delete(onChange);
}

function getSnapshot(): SettingsSnapshot {
  return snapshot;
}

function getServerSnapshot(): SettingsSnapshot {
  return LOADING_SNAPSHOT;
}

function publish(next: SettingsSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/**
 * Le modifiche fatte mentre lo stato sta ancora arrivando si tengono da parte
 * e si riapplicano sopra quello del server. Senza login si possono ancora
 * cambiare le categorie, ma solo per questa visita: non c'è dove salvarle.
 */
function enqueue(operation: SettingsOperation): void {
  const { status, settings } = snapshot;
  if (status === "signedOut" || status === "error") {
    if (operation.type === "setCategories") {
      publish({ status, settings: applyOperations(settings, [operation]) });
    }
    return;
  }
  pending.push(operation);
  publish({ status, settings: applyOperations(settings, [operation]) });
  if (status === "ready") {
    scheduleFlush(FLUSH_DELAY_MS);
  }
}

function startLoading(): void {
  if (hasStartedLoading || typeof window === "undefined") {
    return;
  }
  hasStartedLoading = true;
  // Nascondere la scheda è l'ultimo momento affidabile per salvare: dopo, il
  // browser può chiuderla senza altri eventi.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flush();
    }
  });
  void loadSettings();
}

async function loadSettings(): Promise<void> {
  try {
    const response = await fetch(SETTINGS_ENDPOINT, { cache: "no-store" });
    if (response.status === 401) {
      clearSettings();
      return;
    }
    if (!response.ok) {
      throw new Error(await errorMessageOf(response));
    }
    confirmed = await importLegacyLocalSettings(
      (await response.json()) as Settings,
    );
    publish({
      status: "ready",
      settings: applyOperations(confirmed, pending),
    });
    scheduleFlush(FLUSH_DELAY_MS);
  } catch (error) {
    console.error("Impostazioni non caricate", error);
    pending = [];
    publish({ status: "error", settings: DEFAULT_SETTINGS });
  }
}

/**
 * Recupero una tantum di quello che la versione precedente teneva nel
 * localStorage: si unisce all'account e poi si cancella, così non si ripete.
 */
async function importLegacyLocalSettings(remote: Settings): Promise<Settings> {
  const local = readLegacyLocalSettings();
  if (!local) {
    return remote;
  }
  const merged = await postOperations(
    [{ type: "mergeLocal", settings: local }],
    { keepalive: false },
  );
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  return merged;
}

function readLegacyLocalSettings(): Settings | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw === null ? null : normalizeSettings(JSON.parse(raw));
  } catch {
    // Storage negato o contenuto illeggibile: non c'è niente da recuperare.
    return null;
  }
}

function scheduleFlush(delayMs: number): void {
  if (pending.length === 0) {
    return;
  }
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => void flush(), delayMs);
}

async function flush(): Promise<void> {
  if (isFlushing || pending.length === 0 || snapshot.status !== "ready") {
    return;
  }
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const batch = pending;
  pending = [];
  isFlushing = true;
  try {
    confirmed = await postOperations(batch, { keepalive: true });
    isFlushing = false;
    // Le modifiche arrivate durante il salvataggio restano sopra la risposta.
    publish({ status: "ready", settings: applyOperations(confirmed, pending) });
    scheduleFlush(FLUSH_DELAY_MS);
  } catch (error) {
    isFlushing = false;
    if (error instanceof SessionExpiredError) {
      // Riprovare non servirebbe: senza sessione il server rifiuta sempre.
      clearSettings();
      return;
    }
    console.error("Impostazioni non salvate, riprovo", error);
    pending = [...batch, ...pending];
    scheduleFlush(RETRY_DELAY_MS);
  }
}

async function postOperations(
  operations: SettingsOperation[],
  options: { keepalive: boolean },
): Promise<Settings> {
  const body = JSON.stringify({ operations });
  const response = await fetch(SETTINGS_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    // Con `keepalive` la richiesta sopravvive alla chiusura della scheda, ma
    // il browser rifiuta i corpi oltre 64 KB.
    keepalive: options.keepalive && body.length < MAX_KEEPALIVE_BYTES,
  });
  if (response.status === 401) {
    throw new SessionExpiredError();
  }
  if (!response.ok) {
    throw new Error(await errorMessageOf(response));
  }
  return (await response.json()) as Settings;
}

class SessionExpiredError extends Error {
  constructor() {
    super("Sessione scaduta: serve un nuovo accesso");
    this.name = "SessionExpiredError";
  }
}

async function errorMessageOf(response: Response): Promise<string> {
  try {
    const { error } = (await response.json()) as { error?: string };
    return `HTTP ${response.status}: ${error ?? response.statusText}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
