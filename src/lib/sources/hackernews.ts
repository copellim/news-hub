import "server-only";

import { cacheLife } from "next/cache";

import { SOURCE_FETCH_LIMIT } from "@/lib/config";
import type { FeedItem, SourceSnapshot } from "@/lib/feed";
import { fetchJson } from "./http";

/**
 * Algolia instead of the Firebase API: `front_page` returns the items already
 * hydrated in one call, while `topstories.json` gives only 500 ids and forces
 * an N+1.
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
    // Ask HN and self-posts have no external url: the thread is the content.
    url: hit.url ?? discussionUrl,
    discussionUrl,
    // Algolia sometimes omits fields: `undefined` would pollute the score
    // calculations, `null` explicitly means "no score".
    score: hit.points ?? null,
    commentCount: hit.num_comments ?? null,
    author: hit.author,
    publishedAt: hit.created_at,
    tags: [],
  };
}
