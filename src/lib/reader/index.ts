import "server-only";

import { cacheLife } from "next/cache";

import { isBlobConfigured } from "@/lib/blob-store";
import type { FeedItem, SourceSnapshot } from "@/lib/feed";
import type { Discussion, ReaderArticle } from "@/lib/reader-model";
import { getHackerNewsSnapshot } from "@/lib/sources/hackernews";
import { getLobstersSnapshot } from "@/lib/sources/lobsters";
import { getRedditSnapshot } from "@/lib/sources/reddit";
import { readUserSettings } from "@/lib/user-settings";
import { discussionFetcherFor } from "./discussions";
import { unavailableArticle } from "./extractors/extractor";
import { extractorFor } from "./extractors";

const ARXIV_KEY_PATTERN = /^arxiv:(\d{4}\.\d{4,5}(?:v\d+)?)$/;

/** The news sources, whose link leads to any site: the URL has to be looked up. */
const NEWS_SNAPSHOTS: Record<string, () => Promise<SourceSnapshot>> = {
  hackernews: getHackerNewsSnapshot,
  lobsters: getLobstersSnapshot,
  reddit: getRedditSnapshot,
};

/**
 * The article of an item, or `null` if the key matches nothing
 * the app shows. The client sends only the key and the URL is derived here: a
 * paper from its id, a news item from the cached feeds or the user's bookmarks.
 * This way the server never downloads an address chosen by the caller.
 */
export async function getArticle(
  key: string,
  email: string,
): Promise<ReaderArticle | null> {
  const url = await findArticleUrl(key, email);
  if (!url) {
    return null;
  }
  try {
    return await extractArticle(url);
  } catch (error) {
    // Outside the cache: a site down now may answer at the next opening.
    console.error(`Articolo di ${key} non estratto`, error);
    return unavailableArticle(
      url,
      `Il sito non ha risposto: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** `null` if the source has no comments readable here; network errors propagate. */
export async function getDiscussion(key: string): Promise<Discussion | null> {
  if (!discussionFetcherFor(key)) {
    return null;
  }
  return loadDiscussion(key);
}

/**
 * An article rarely changes: one cache entry per URL, for days. Errors do
 * not enter the cache, "not readable here" results do, because an app page
 * stays one.
 */
async function extractArticle(url: string): Promise<ReaderArticle> {
  "use cache";
  cacheLife("days");

  const parsed = new URL(url);
  return extractorFor(parsed).extract(parsed);
}

/** Like the front pages: comments arrive continuously. */
async function loadDiscussion(key: string): Promise<Discussion> {
  "use cache";
  cacheLife("minutes");

  const fetchDiscussion = discussionFetcherFor(key);
  if (!fetchDiscussion) {
    throw new Error(`Nessun adapter di discussione per ${key}`);
  }
  return fetchDiscussion();
}

async function findArticleUrl(key: string, email: string): Promise<string | null> {
  const arxivId = ARXIV_KEY_PATTERN.exec(key)?.[1];
  if (arxivId) {
    return `https://arxiv.org/abs/${arxivId}`;
  }
  const item = (await findInFeed(key)) ?? (await findInBookmarks(key, email));
  return item && isWebUrl(item.url) ? item.url : null;
}

/** Only the snapshot of the key's source, not the whole lane. */
async function findInFeed(key: string): Promise<FeedItem | undefined> {
  const source = key.slice(0, key.indexOf(":"));
  const getSnapshot = NEWS_SNAPSHOTS[source];
  if (!getSnapshot) {
    return undefined;
  }
  try {
    const { items } = await getSnapshot();
    return items.find((item) => item.key === key);
  } catch {
    // Source down: the bookmarks route remains.
    return undefined;
  }
}

/** A saved article may have dropped off the front page days ago. */
async function findInBookmarks(
  key: string,
  email: string,
): Promise<FeedItem | undefined> {
  if (!isBlobConfigured()) {
    return undefined;
  }
  const { bookmarks } = await readUserSettings(email);
  return bookmarks.find((bookmark) => bookmark.key === key);
}

function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
