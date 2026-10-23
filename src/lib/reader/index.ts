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

/** Le fonti news, il cui link porta a un sito qualsiasi: l'URL va cercato. */
const NEWS_SNAPSHOTS: Record<string, () => Promise<SourceSnapshot>> = {
  hackernews: getHackerNewsSnapshot,
  lobsters: getLobstersSnapshot,
  reddit: getRedditSnapshot,
};

/**
 * L'articolo di un item, oppure `null` se la chiave non corrisponde a niente
 * che l'app mostri. Il client manda solo la chiave e l'URL si ricava qui: un
 * paper dal suo id, una news dai feed in cache o dai segnalibri dell'utente.
 * Così il server non scarica mai un indirizzo scelto da chi chiama.
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
    // Fuori dalla cache: un sito giù adesso può rispondere alla prossima apertura.
    console.error(`Articolo di ${key} non estratto`, error);
    return unavailableArticle(
      url,
      `Il sito non ha risposto: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** `null` se la fonte non ha commenti leggibili qui; gli errori di rete risalgono. */
export async function getDiscussion(key: string): Promise<Discussion | null> {
  if (!discussionFetcherFor(key)) {
    return null;
  }
  return loadDiscussion(key);
}

/**
 * Un articolo cambia di rado: una voce di cache per URL, per giorni. Gli errori
 * non entrano in cache, i "non leggibile qui" sì, perché una pagina-app resta
 * tale.
 */
async function extractArticle(url: string): Promise<ReaderArticle> {
  "use cache";
  cacheLife("days");

  const parsed = new URL(url);
  return extractorFor(parsed).extract(parsed);
}

/** Come le front page: i commenti arrivano di continuo. */
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

/** Solo lo snapshot della fonte della chiave, non l'intera corsia. */
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
    // Fonte giù: resta la strada dei segnalibri.
    return undefined;
  }
}

/** Un articolo salvato può essere uscito dalla front page da giorni. */
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
