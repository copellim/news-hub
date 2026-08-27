"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { DEFAULT_ARXIV_CATEGORIES, isKnownArxivCategory } from "@/lib/config";
import type { FeedItem } from "@/lib/feed";

const STORAGE_KEY = "news-hub:settings:v1";

/** `storage` non scatta nella scheda che ha scritto: serve un evento nostro. */
const CHANGED_EVENT = "news-hub:settings-changed";

/** Chiavi della versione precedente, una per dominio. Vedi `migrateLegacyKeys`. */
const LEGACY_KEYS = {
  bookmarks: "news-hub:reading-queue:v1",
  categories: "news-hub:arxiv-categories:v1",
  visited: "news-hub:visited:v1",
} as const;

/**
 * Un articolo messo da parte. Si salva l'item intero e non il solo id: resta
 * leggibile anche quando è uscito dalla front page e le fonti non lo danno più.
 */
export type Bookmark = FeedItem & {
  /** ISO. Ordina la lista e sopravvive all'export. */
  savedAt: string;
};

/** Tutto ciò che l'app tiene nel browser, in un oggetto solo. */
export type Settings = {
  version: 1;
  arxivCategories: string[];
  bookmarks: Bookmark[];
  /** Chiavi degli articoli aperti almeno una volta. */
  visited: string[];
};

/**
 * Tetto ai visitati: la lista cresce a ogni click e senza limite finirebbe per
 * riempire la quota di localStorage. Si scartano i più vecchi.
 */
const MAX_VISITED = 2000;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  arxivCategories: [...DEFAULT_ARXIV_CATEGORIES],
  bookmarks: [],
  visited: [],
};

/**
 * `useSyncExternalStore` confronta gli snapshot per identità: senza questa
 * cache ogni parse creerebbe un oggetto nuovo e React andrebbe in loop.
 */
let cachedRaw: string | null = null;
let cachedSettings: Settings = DEFAULT_SETTINGS;

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, readSettings, readDefaults);

  const update = useCallback((patch: Partial<Settings>) => {
    writeSettings({ ...readSettings(), ...patch });
  }, []);

  const replace = useCallback((next: Settings) => {
    writeSettings(next);
  }, []);

  return { settings, update, replace };
}

export function useBookmarks() {
  const { settings, update } = useSettings();
  const bookmarks = settings.bookmarks;

  const bookmarkedKeys = useMemo(
    () => new Set(bookmarks.map((bookmark) => bookmark.key)),
    [bookmarks],
  );

  const toggleBookmark = useCallback((item: FeedItem) => {
    const current = readSettings().bookmarks;
    const isSaved = current.some((bookmark) => bookmark.key === item.key);
    writeSettings({
      ...readSettings(),
      bookmarks: isSaved
        ? current.filter((bookmark) => bookmark.key !== item.key)
        : [{ ...item, savedAt: new Date().toISOString() }, ...current],
    });
  }, []);

  const removeBookmark = useCallback(
    (key: string) => {
      update({
        bookmarks: readSettings().bookmarks.filter(
          (bookmark) => bookmark.key !== key,
        ),
      });
    },
    [update],
  );

  return { bookmarks, bookmarkedKeys, toggleBookmark, removeBookmark };
}

export function useVisitedItems() {
  const { settings } = useSettings();
  const visited = settings.visited;

  const visitedKeys = useMemo(() => new Set(visited), [visited]);

  const markVisited = useCallback((key: string) => {
    const current = readSettings();
    if (current.visited.includes(key)) {
      return;
    }
    writeSettings({
      ...current,
      visited: [key, ...current.visited].slice(0, MAX_VISITED),
    });
  }, []);

  return { visitedKeys, markVisited };
}

export function useArxivCategories() {
  const { settings, update } = useSettings();

  const toggleCategory = useCallback(
    (id: string) => {
      const current = readSettings().arxivCategories;
      update({
        arxivCategories: current.includes(id)
          ? current.filter((category) => category !== id)
          : [...current, id],
      });
    },
    [update],
  );

  return { categories: settings.arxivCategories, toggleCategory };
}

// --- Import / export ------------------------------------------------------

export function exportSettings(): string {
  return JSON.stringify(readSettings(), null, 2);
}

/** L'import sovrascrive: è un ripristino dell'oggetto intero, non una fusione. */
export function importSettings(text: string): Settings {
  const parsed: unknown = JSON.parse(text);
  const settings = normalizeSettings(parsed);
  if (!settings) {
    throw new Error("Il file non contiene impostazioni valide");
  }
  writeSettings(settings);
  return settings;
}

export function settingsFileName(now: Date): string {
  return `news-hub-settings-${now.toISOString().slice(0, 10)}.json`;
}

// --- Store ----------------------------------------------------------------

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED_EVENT, onChange);
  };
}

function readSettings(): Settings {
  const raw = safeGetItem(STORAGE_KEY);
  if (raw === null) {
    return migrateLegacyKeys() ?? DEFAULT_SETTINGS;
  }
  if (raw === cachedRaw) {
    return cachedSettings;
  }
  cachedRaw = raw;
  cachedSettings = parseSettings(raw) ?? DEFAULT_SETTINGS;
  return cachedSettings;
}

/** Il server non ha localStorage: parte dai default, come il primo avvio. */
function readDefaults(): Settings {
  return DEFAULT_SETTINGS;
}

function writeSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    // Quota piena o storage negato: dirlo, invece di far credere all'utente
    // che il salvataggio sia andato a buon fine.
    console.error("Impostazioni non salvate su localStorage", error);
    return;
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

function parseSettings(raw: string): Settings | null {
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Accetta l'oggetto solo se riconoscibile, e scarta le singole voci non valide
 * invece di rifiutare tutto: un file leggermente sporco non deve azzerare le
 * impostazioni di chi lo importa.
 */
function normalizeSettings(value: unknown): Settings | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Partial<Settings>;
  if (
    !Array.isArray(candidate.bookmarks) &&
    !Array.isArray(candidate.visited) &&
    !Array.isArray(candidate.arxivCategories)
  ) {
    return null;
  }

  return {
    version: 1,
    arxivCategories: asArray(candidate.arxivCategories).filter(
      (id): id is string => typeof id === "string" && isKnownArxivCategory(id),
    ),
    bookmarks: asArray(candidate.bookmarks).filter(isBookmark),
    visited: asArray(candidate.visited)
      .filter((key): key is string => typeof key === "string")
      .slice(0, MAX_VISITED),
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isBookmark(value: unknown): value is Bookmark {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<Bookmark>;
  return (
    typeof candidate.key === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.url === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.savedAt === "string"
  );
}

/**
 * Recupero una tantum dalle tre chiavi separate della versione precedente, per
 * non far sparire segnalibri e letti già salvati. Si può togliere quando non
 * servirà più: da quel momento le chiavi vecchie restano inerti.
 */
function migrateLegacyKeys(): Settings | null {
  const legacy: Settings = {
    ...DEFAULT_SETTINGS,
    arxivCategories: readLegacyArray(LEGACY_KEYS.categories).filter(
      (id): id is string => typeof id === "string" && isKnownArxivCategory(id),
    ),
    bookmarks: readLegacyArray(LEGACY_KEYS.bookmarks).filter(isBookmark),
    visited: readLegacyArray(LEGACY_KEYS.visited).filter(
      (key): key is string => typeof key === "string",
    ),
  };

  const isEmpty =
    legacy.bookmarks.length === 0 &&
    legacy.visited.length === 0 &&
    legacy.arxivCategories.length === 0;
  if (isEmpty) {
    return null;
  }

  if (legacy.arxivCategories.length === 0) {
    legacy.arxivCategories = [...DEFAULT_ARXIV_CATEGORIES];
  }
  writeSettings(legacy);
  return legacy;
}

function readLegacyArray(key: string): unknown[] {
  const raw = safeGetItem(key);
  if (raw === null) {
    return [];
  }
  try {
    return asArray(JSON.parse(raw));
  } catch {
    return [];
  }
}

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
