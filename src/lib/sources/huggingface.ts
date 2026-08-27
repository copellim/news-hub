import "server-only";

import { cacheLife } from "next/cache";

import { SOURCE_FETCH_LIMIT } from "@/lib/config";
import type { FeedItem } from "@/lib/feed";
import { fetchJson } from "./http";

/**
 * L'unica fonte paper che si comporta come Hacker News: selezione umana
 * quotidiana (~25 item, contro i ~350 di una singola categoria arXiv) più
 * upvote e link al codice. Nessuna auth.
 */
const DAILY_PAPERS_URL = "https://huggingface.co/api/daily_papers";

type DailyPaper = {
  publishedAt: string;
  paper: {
    id: string;
    title: string;
    upvotes: number | null;
    authors: Array<{ name: string }> | null;
    githubRepo: string | null;
    ai_keywords: string[] | null;
  };
  numComments: number | null;
};

export async function getHuggingFaceItems(): Promise<FeedItem[]> {
  "use cache";
  // La selezione cambia una volta al giorno, non ha senso ripescarla ogni minuto.
  cacheLife("hours");

  const papers = await fetchJson<DailyPaper[]>(
    "huggingface",
    DAILY_PAPERS_URL,
  );
  return papers.slice(0, SOURCE_FETCH_LIMIT).map(toFeedItem);
}

function toFeedItem(entry: DailyPaper): FeedItem {
  const { paper } = entry;
  return {
    // `paper.id` è l'id arXiv: chiave esatta per il dedup con la corsia arXiv.
    key: `arxiv:${paper.id}`,
    source: "huggingface",
    title: paper.title,
    url: `https://arxiv.org/abs/${paper.id}`,
    discussionUrl: `https://huggingface.co/papers/${paper.id}`,
    score: paper.upvotes ?? null,
    commentCount: entry.numComments ?? null,
    author: paper.authors?.[0]?.name ?? null,
    publishedAt: entry.publishedAt,
    tags: (paper.ai_keywords ?? []).slice(0, 4),
  };
}
