import "server-only";

import { cacheLife } from "next/cache";

import { SOURCE_FETCH_LIMIT } from "@/lib/config";
import type { FeedItem, SourceSnapshot } from "@/lib/feed";
import { fetchJson } from "./http";

/**
 * Algolia invece della Firebase API: `front_page` restituisce gli item già
 * idratati in una chiamata, mentre `topstories.json` dà solo 500 id e obbliga a
 * un N+1.
 */
const FRONT_PAGE_URL = `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${SOURCE_FETCH_LIMIT}`;

type AlgoliaStory = {
  objectID: string;
  title: string | null;
  url: string | null;
  author: string | null;
  points: number | null;
  num_comments: number | null;
  created_at: string;
};

export async function getHackerNewsSnapshot(): Promise<SourceSnapshot> {
  "use cache";
  cacheLife("minutes");

  const { hits } = await fetchJson<{ hits: AlgoliaStory[] }>(
    "hackernews",
    FRONT_PAGE_URL,
  );

  return {
    items: hits.filter((hit) => hit.title).map(toFeedItem),
    fetchedAt: new Date().toISOString(),
  };
}

function toFeedItem(hit: AlgoliaStory): FeedItem {
  const discussionUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;
  return {
    key: `hackernews:${hit.objectID}`,
    source: "hackernews",
    title: hit.title as string,
    // Ask HN e le self-post non hanno url esterno: il thread è il contenuto.
    url: hit.url ?? discussionUrl,
    discussionUrl,
    // Algolia a volte omette i campi: `undefined` inquinerebbe i calcoli
    // sul punteggio, `null` significa esplicitamente "senza punteggio".
    score: hit.points ?? null,
    commentCount: hit.num_comments ?? null,
    author: hit.author,
    publishedAt: hit.created_at,
    tags: [],
  };
}
