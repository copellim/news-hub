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
    /** L'abstract del paper. */
    summary: string | null;
    /** Riassunto di una frase, in inglese, generato da HF. */
    ai_summary: string | null;
  };
  numComments: number | null;
};

/** Testi per i riassunti: restano sul server, la pagina riceve solo l'item. */
export type HuggingFaceTexts = {
  title: string;
  abstract: string | null;
  aiSummary: string | null;
};

type HuggingFaceEntry = Omit<HuggingFaceTexts, "title"> & { item: FeedItem };

async function getHuggingFaceEntries(): Promise<HuggingFaceEntry[]> {
  "use cache";
  // La selezione cambia una volta al giorno, non ha senso ripescarla ogni minuto.
  cacheLife("hours");

  const papers = await fetchJson<DailyPaper[]>(
    "huggingface",
    DAILY_PAPERS_URL,
  );
  return papers.slice(0, SOURCE_FETCH_LIMIT).map((entry) => ({
    item: toFeedItem(entry),
    abstract: entry.paper.summary?.trim() || null,
    aiSummary: entry.paper.ai_summary?.trim() || null,
  }));
}

export async function getHuggingFaceItems(): Promise<FeedItem[]> {
  return (await getHuggingFaceEntries()).map((entry) => entry.item);
}

export async function getHuggingFaceTexts(): Promise<
  Map<string, HuggingFaceTexts>
> {
  const entries = await getHuggingFaceEntries();
  return new Map(
    entries.map(({ item, abstract, aiSummary }) => [
      item.key,
      { title: item.title, abstract, aiSummary },
    ]),
  );
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
