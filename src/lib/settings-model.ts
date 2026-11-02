/**
 * Forma dello stato utente e regole per modificarlo. Client-safe: lo usa il
 * browser per aggiornare subito la pagina e il server per applicare le stesse
 * modifiche al file su Blob, così le due copie non possono divergere.
 */

import { DEFAULT_ARXIV_CATEGORIES, isKnownArxivCategory } from "@/lib/config";
import type { FeedItem } from "@/lib/feed";

/**
 * Un articolo messo da parte. Si salva l'item intero e non il solo id: resta
 * leggibile anche quando è uscito dalla front page e le fonti non lo danno più.
 */
export type Bookmark = FeedItem & {
  /** ISO. Ordina la lista. */
  savedAt: string;
};

/** Tutto ciò che l'app ricorda di un utente, in un oggetto solo. */
export type Settings = {
  version: 2;
  paperScreening: boolean;
  arxivCategories: string[];
  bookmarks: Bookmark[];
  /** Chiavi degli articoli aperti almeno una volta. */
  visited: string[];
};

/**
 * Tetto ai visitati: la lista cresce a ogni click e il file viene riletto e
 * riscritto per intero a ogni salvataggio. Si scartano i più vecchi.
 */
const MAX_VISITED = 2000;

export const DEFAULT_SETTINGS: Settings = {
  version: 2,
  paperScreening: true,
  arxivCategories: [...DEFAULT_ARXIV_CATEGORIES],
  bookmarks: [],
  visited: [],
};

/**
 * Il client manda modifiche, non l'oggetto intero: se mandasse l'oggetto, una
 * scheda con una copia vecchia cancellerebbe quello che un'altra ha appena
 * salvato. Il server applica le modifiche all'ultima versione del file.
 */
export type SettingsOperation =
  | { type: "addBookmark"; bookmark: Bookmark }
  | { type: "removeBookmark"; key: string }
  | { type: "markVisited"; key: string }
  | { type: "setPaperScreening"; enabled: boolean }
  | { type: "setCategories"; categories: string[] }
  /** Recupero una tantum di quello che il browser teneva nel localStorage. */
  | { type: "mergeLocal"; settings: Settings };

export function applyOperations(
  settings: Settings,
  operations: readonly SettingsOperation[],
): Settings {
  return operations.reduce(applyOperation, settings);
}

function applyOperation(
  settings: Settings,
  operation: SettingsOperation,
): Settings {
  switch (operation.type) {
    case "addBookmark":
      return {
        ...settings,
        bookmarks: [
          operation.bookmark,
          ...withoutBookmark(settings.bookmarks, operation.bookmark.key),
        ],
      };
    case "removeBookmark":
      return {
        ...settings,
        bookmarks: withoutBookmark(settings.bookmarks, operation.key),
      };
    case "markVisited":
      if (settings.visited.includes(operation.key)) {
        return settings;
      }
      return {
        ...settings,
        visited: [operation.key, ...settings.visited].slice(0, MAX_VISITED),
      };
    case "setPaperScreening":
      return { ...settings, paperScreening: operation.enabled };
    case "setCategories":
      return { ...settings, arxivCategories: operation.categories };
    case "mergeLocal":
      return mergeLocalSettings(settings, operation.settings);
  }
}

function withoutBookmark(bookmarks: Bookmark[], key: string): Bookmark[] {
  return bookmarks.filter((bookmark) => bookmark.key !== key);
}

/**
 * Unione e non sostituzione: due browser con dati diversi devono poter
 * confluire nello stesso account senza che il secondo cancelli il primo. Le
 * categorie locali valgono solo se l'account ha ancora quelle di default.
 */
function mergeLocalSettings(remote: Settings, local: Settings): Settings {
  const remoteKeys = new Set(remote.bookmarks.map((bookmark) => bookmark.key));
  const hasDefaultCategories =
    selectionKeyOf(remote.arxivCategories) ===
    selectionKeyOf(DEFAULT_SETTINGS.arxivCategories);

  return {
    version: 2,
    paperScreening: remote.paperScreening,
    arxivCategories: hasDefaultCategories
      ? local.arxivCategories
      : remote.arxivCategories,
    bookmarks: [
      ...remote.bookmarks,
      ...local.bookmarks.filter((bookmark) => !remoteKeys.has(bookmark.key)),
    ].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    visited: [...new Set([...remote.visited, ...local.visited])].slice(
      0,
      MAX_VISITED,
    ),
  };
}

/** Confronto per insieme: l'ordine dei chip non cambia la selezione. */
export function selectionKeyOf(categories: readonly string[]): string {
  return [...categories].sort().join(",");
}

// --- Validazione ----------------------------------------------------------

/**
 * Accetta l'oggetto solo se riconoscibile, e scarta le singole voci non valide
 * invece di rifiutare tutto: un file leggermente sporco non deve azzerare le
 * impostazioni. Le categorie sconosciute cadono perché il catalogo è la
 * whitelist.
 */
export function normalizeSettings(value: unknown): Settings | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Partial<Omit<Settings, "version">> & { version?: number };
  if (candidate.version !== 1 && candidate.version !== 2 && candidate.version !== undefined) return null;
  if (
    !Array.isArray(candidate.bookmarks) &&
    !Array.isArray(candidate.visited) &&
    !Array.isArray(candidate.arxivCategories)
  ) {
    return null;
  }

  return {
    version: 2,
    // Migrazione esplicita v1 → v2: conserva i dati e attiva la scrematura.
    paperScreening: candidate.version === 2 && typeof candidate.paperScreening === "boolean"
      ? candidate.paperScreening : true,
    arxivCategories: asArray(candidate.arxivCategories).filter(isCategory),
    bookmarks: asArray(candidate.bookmarks).filter(isBookmark),
    visited: asArray(candidate.visited)
      .filter((key): key is string => typeof key === "string")
      .slice(0, MAX_VISITED),
  };
}

/**
 * Le operazioni arrivano dal client e finiscono nel file dell'utente: ognuna
 * va controllata come un input esterno. Restituisce la versione ripulita, o
 * `null` se l'operazione non è riconoscibile.
 */
export function parseSettingsOperation(
  value: unknown,
): SettingsOperation | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  switch (candidate.type) {
    case "setPaperScreening":
      return typeof candidate.enabled === "boolean"
        ? { type: "setPaperScreening", enabled: candidate.enabled } : null;
    case "addBookmark":
      return isBookmark(candidate.bookmark)
        ? { type: "addBookmark", bookmark: candidate.bookmark }
        : null;
    case "removeBookmark":
    case "markVisited":
      return typeof candidate.key === "string"
        ? { type: candidate.type, key: candidate.key }
        : null;
    case "setCategories":
      return Array.isArray(candidate.categories)
        ? {
            type: "setCategories",
            categories: candidate.categories.filter(isCategory),
          }
        : null;
    case "mergeLocal": {
      const settings = normalizeSettings(candidate.settings);
      return settings ? { type: "mergeLocal", settings } : null;
    }
    default:
      return null;
  }
}

function isCategory(id: unknown): id is string {
  return typeof id === "string" && isKnownArxivCategory(id);
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
