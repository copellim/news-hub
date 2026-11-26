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
 * The user's state in the browser: a copy of what is on Blob, plus the
 * changes not yet saved. Every click updates the page immediately; the
 * changes leave together a few seconds after the last one, because every
 * save rewrites the file and Blob's Hobby plan has 2,000 writes a
 * month, beyond which the store stays blocked for 30 days.
 */

const SETTINGS_ENDPOINT = "/api/settings";

/** Wait after the last change before saving: gathers clicks in a row. */
const FLUSH_DELAY_MS = 3_000;

/** After a failed save it retries calmly, without hammering. */
const RETRY_DELAY_MS = 15_000;

/** The browser's limit for `fetch` with `keepalive`, with some margin. */
const MAX_KEEPALIVE_BYTES = 60_000;

/** Key of the version that kept everything in localStorage. */
const LEGACY_STORAGE_KEY = "news-hub:settings:v1";

export type SettingsStatus = "loading" | "signedOut" | "ready" | "error";

type SettingsSnapshot = {
  status: SettingsStatus;
  settings: Settings;
};

/** The server does not know who the user is: it renders as if the state were arriving. */
const LOADING_SNAPSHOT: SettingsSnapshot = {
  status: "loading",
  settings: DEFAULT_SETTINGS,
};

/**
 * `useSyncExternalStore` compares snapshots by identity: the object is
 * replaced only when something actually changes.
 */
let snapshot: SettingsSnapshot = LOADING_SNAPSHOT;
/** Latest version confirmed by the server. */
let confirmed: Settings = DEFAULT_SETTINGS;
/** Changes already visible on the page but not yet saved. */
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

export function usePaperScreening() {
  const { settings } = useSnapshot();
  const setEnabled = useCallback((enabled: boolean) => {
    enqueue({ type: "setPaperScreening", enabled });
  }, []);
  return { enabled: settings.paperScreening, setEnabled };
}

export function usePaperPersonalization() {
  const { settings } = useSnapshot();
  const setEnabled = useCallback((enabled: boolean) => {
    enqueue({ type: "setPaperPersonalization", enabled });
  }, []);
  return { enabled: settings.paperPersonalization, setEnabled };
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

/** After sign-out the user's state must not stay on the page. */
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
 * Changes made while the state is still arriving are kept aside
 * and reapplied on top of the server's. Without sign-in the categories can
 * still be changed, but only for this visit: there is nowhere to save them.
 */
function enqueue(operation: SettingsOperation): void {
  const { status, settings } = snapshot;
  if (status === "signedOut" || status === "error") {
    if (operation.type === "setCategories" || operation.type === "setPaperScreening" || operation.type === "setPaperPersonalization") {
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
  // Hiding the tab is the last reliable moment to save: after that, the
  // browser can close it without further events.
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
 * One-off recovery of what the previous version kept in
 * localStorage: it is merged into the account and then deleted, so it does not repeat.
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
    // Storage denied or unreadable content: there is nothing to recover.
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
    // Changes that arrived during the save stay on top of the response.
    publish({ status: "ready", settings: applyOperations(confirmed, pending) });
    scheduleFlush(FLUSH_DELAY_MS);
  } catch (error) {
    isFlushing = false;
    if (error instanceof SessionExpiredError) {
      // Retrying would be useless: without a session the server always refuses.
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
    // With `keepalive` the request survives the closing of the tab, but
    // the browser rejects bodies over 64 KB.
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
