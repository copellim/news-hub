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
 * Due chiamate: Algolia dà l'albero intero in una volta, ma con i figli in
 * ordine di id, cioè cronologico; i `kids` di Firebase hanno l'ordine con cui
 * HN mostra il primo livello. Ordinare anche i livelli sotto costerebbe una
 * chiamata per commento: lì resta l'ordine cronologico.
 */
export async function fetchHackerNewsDiscussion(id: string): Promise<Discussion> {
  const [story, ranked] = await Promise.all([
    fetchJson<AlgoliaItem>("hackernews", `https://hn.algolia.com/api/v1/items/${id}`),
    // L'ordine è un di più: se Firebase non risponde resta quello cronologico.
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
    // `sort` è stabile: chi manca da Firebase (morti, appena arrivati) va in
    // fondo nell'ordine di Algolia.
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
