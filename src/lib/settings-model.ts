/**
 * Shape of the user state and rules for changing it. Client-safe: the browser
 * uses it to update the page immediately and the server to apply the same
 * changes to the file on Blob, so the two copies cannot diverge.
 */

import { DEFAULT_ARXIV_CATEGORIES, isKnownArxivCategory } from "@/lib/config";
import type { FeedItem } from "@/lib/feed";

/**
 * An article set aside. The whole item is saved and not just the id: it stays
 * readable even when it has left the front page and the sources no longer return it.
 */
export type Bookmark = FeedItem & {
  /** ISO. Orders the list. */
  savedAt: string;
};

/** Everything the app remembers about a user, in a single object. */
export type Settings = {
  version: 2;
  paperScreening: boolean;
  paperPersonalization: boolean;
  arxivCategories: string[];
  bookmarks: Bookmark[];
  /** Keys of the articles opened at least once. */
  visited: string[];
};

/**
 * Cap on visited items: the list grows at every click and the file is reread and
 * rewritten whole at every save. The oldest are discarded.
 */
const MAX_VISITED = 2000;

export const DEFAULT_SETTINGS: Settings = {
  version: 2,
  paperScreening: true,
  paperPersonalization: true,
  arxivCategories: [...DEFAULT_ARXIV_CATEGORIES],
  bookmarks: [],
  visited: [],
};

/**
 * The client sends changes, not the whole object: if it sent the object, a
 * tab with an old copy would delete what another one has just
 * saved. The server applies the changes to the latest version of the file.
 */
export type SettingsOperation =
  | { type: "addBookmark"; bookmark: Bookmark }
  | { type: "removeBookmark"; key: string }
  | { type: "markVisited"; key: string }
  | { type: "setPaperScreening"; enabled: boolean }
  | { type: "setPaperPersonalization"; enabled: boolean }
  | { type: "setCategories"; categories: string[] }
  /** One-off recovery of what the browser kept in localStorage. */
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
    case "setPaperPersonalization":
      return { ...settings, paperPersonalization: operation.enabled };
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
 * Union and not replacement: two browsers with different data must be able to
 * merge into the same account without the second deleting the first. The
 * local categories apply only if the account still has the default ones.
 */
function mergeLocalSettings(remote: Settings, local: Settings): Settings {
  const remoteKeys = new Set(remote.bookmarks.map((bookmark) => bookmark.key));
  const hasDefaultCategories =
    selectionKeyOf(remote.arxivCategories) ===
    selectionKeyOf(DEFAULT_SETTINGS.arxivCategories);

  return {
    version: 2,
    paperScreening: remote.paperScreening,
    paperPersonalization: remote.paperPersonalization,
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

/** Set comparison: the order of the chips does not change the selection. */
export function selectionKeyOf(categories: readonly string[]): string {
  return [...categories].sort().join(",");
}

// --- Validation ------------------------------------------------------------

/**
 * Accepts the object only if recognisable, and discards the single invalid entries
 * instead of rejecting everything: a slightly dirty file must not reset the
 * settings. Unknown categories are dropped because the catalog is the
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
    // Explicit v1 → v2 migration: keeps the data and turns on the screening.
    paperScreening: candidate.version === 2 && typeof candidate.paperScreening === "boolean"
      ? candidate.paperScreening : true,
    paperPersonalization: typeof candidate.paperPersonalization === "boolean" ? candidate.paperPersonalization : true,
    arxivCategories: asArray(candidate.arxivCategories).filter(isCategory),
    bookmarks: asArray(candidate.bookmarks).filter(isBookmark),
    visited: asArray(candidate.visited)
      .filter((key): key is string => typeof key === "string")
      .slice(0, MAX_VISITED),
  };
}

/**
 * The operations come from the client and end up in the user's file: each one
 * must be checked like external input. Returns the cleaned version, or
 * `null` if the operation is not recognisable.
 */
export function parseSettingsOperation(
  value: unknown,
): SettingsOperation | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  switch (candidate.type) {
    case "setPaperPersonalization":
      return typeof candidate.enabled === "boolean"
        ? { type: "setPaperPersonalization", enabled: candidate.enabled } : null;
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
