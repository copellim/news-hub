import "server-only";

import { cacheLife } from "next/cache";

import { MIN_PAPERS_PER_SOURCE, SOURCE_FETCH_LIMIT } from "@/lib/config";
import type { FeedItem, SourceSnapshot } from "@/lib/feed";
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

async function getHuggingFaceEntries(): Promise<{
  entries: HuggingFaceEntry[];
  fetchedAt: string;
  notice?: string;
}> {
  "use cache";
  // La selezione cambia una volta al giorno, non ha senso ripescarla ogni minuto.
  cacheLife("hours");

  const byKey = new Map<string, DailyPaper>();
  const append = (papers: DailyPaper[]) => {
    if (!Array.isArray(papers)) throw new Error("Risposta HF non valida");
    for (const entry of papers) {
      if (!entry?.paper || !/^\d{4}\.\d{4,5}$/.test(entry.paper.id) || typeof entry.paper.title !== "string") continue;
      if (!byKey.has(entry.paper.id)) byKey.set(entry.paper.id, entry);
    }
  };
  let currentFailed = false;
  try { append(await fetchJson<DailyPaper[]>("huggingface", DAILY_PAPERS_URL)); }
  catch { currentFailed = true; }
  let historical = false;
  const now = new Date();
  for (let daysBack = 1; byKey.size < MIN_PAPERS_PER_SOURCE && daysBack <= 7; daysBack++) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - daysBack);
    try {
      append(await fetchJson<DailyPaper[]>("huggingface", `${DAILY_PAPERS_URL}?date=${date.toISOString().slice(0, 10)}`));
      historical = true;
    } catch { /* Un giorno non disponibile non impedisce di cercare gli altri. */ }
  }
  if (!byKey.size && currentFailed) throw new Error("HF: selezione corrente e giorni precedenti non disponibili");
  const papers = [...byKey.values()];
  return {
    entries: papers.slice(0, SOURCE_FETCH_LIMIT).map((entry) => ({
      item: toFeedItem(entry),
      abstract: entry.paper.summary?.trim() || null,
      aiSummary: entry.paper.ai_summary?.trim() || null,
    })),
    fetchedAt: new Date().toISOString(),
    notice: historical ? "HF: inclusi anche paper dei giorni precedenti per raggiungere almeno 20 candidati distinti." : undefined,
  };
}

export async function getHuggingFaceSnapshot(): Promise<SourceSnapshot> {
  const { entries, fetchedAt, notice } = await getHuggingFaceEntries();
  return { items: entries.map((entry) => entry.item), fetchedAt, notice };
}

export async function getHuggingFaceTexts(): Promise<
  Map<string, HuggingFaceTexts>
> {
  const { entries } = await getHuggingFaceEntries();
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
