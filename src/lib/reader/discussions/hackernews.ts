import "server-only";

import type { Comment, Discussion } from "@/lib/reader-model";
import { fetchJson } from "@/lib/sources/http";
import { cleanHtml } from "../sanitize";

const HN_BASE_URL = "https://news.ycombinator.com/";

export type AlgoliaItem = {
  id: number;
  type: string;
  author: string | null;
  text: string | null;
  created_at: string;
  children: AlgoliaItem[];
};

type FirebaseItem = { kids?: number[] } | null;

/**
 * Two calls: Algolia gives the whole tree at once, but with the children in
 * id order, that is chronological; Firebase's `kids` have the order in which
 * HN shows the first level. Ordering the levels below too would cost one
 * call per comment: there the chronological order remains.
 */
export async function fetchHackerNewsDiscussion(id: string): Promise<Discussion> {
  const [story, ranked] = await Promise.all([
    fetchJson<AlgoliaItem>("hackernews", `https://hn.algolia.com/api/v1/items/${id}`),
    // The order is a bonus: if Firebase does not answer the chronological one remains.
    fetchJson<FirebaseItem>(
      "hackernews",
      `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
    ).catch(() => null),
  ]);
  return hackerNewsDiscussion(story, ranked?.kids ?? []);
}

export function hackerNewsDiscussion(
  story: AlgoliaItem,
  rankedKids: readonly number[],
): Discussion {
  const rank = new Map(rankedKids.map((kid, index) => [kid, index]));
  const comments = story.children
    .filter(isComment)
    .map(toComment)
    // `sort` is stable: those missing from Firebase (dead, just arrived) go to
    // the bottom in Algolia's order.
    .sort(
      (a, b) =>
        (rank.get(Number(a.id)) ?? Infinity) - (rank.get(Number(b.id)) ?? Infinity),
    );
  return {
    source: "hackernews",
    url: `${HN_BASE_URL}item?id=${story.id}`,
    postHtml: story.text ? cleanHtml(story.text, HN_BASE_URL) : null,
    comments,
  };
}

function toComment(item: AlgoliaItem): Comment {
  return {
    id: String(item.id),
    author: item.author,
    createdAt: item.created_at,
    html: item.text ? cleanHtml(item.text, HN_BASE_URL) : null,
    score: null,
    replies: item.children.filter(isComment).map(toComment),
  };
}

function isComment(item: AlgoliaItem): boolean {
  return item.type === "comment";
}
