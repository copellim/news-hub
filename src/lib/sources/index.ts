import "server-only";

import { DEFAULT_ARXIV_CATEGORIES } from "@/lib/config";
import {
  dedupeByKey,
  LANE_SOURCES,
  type FeedItem,
  type Lane,
  type LaneId,
  type SourceId,
  type SourceSnapshot,
} from "@/lib/feed";
import { getArxivSnapshot, getArxivTexts } from "./arxiv";
import { getHackerNewsSnapshot } from "./hackernews";
import {
  getHuggingFaceSnapshot,
  getHuggingFaceTexts,
  type HuggingFaceTexts,
} from "./huggingface";
import { getLobstersSnapshot } from "./lobsters";
import { getRedditSnapshot } from "./reddit";

export type LaneOptions = {
  /** Categorie arXiv scelte in pagina; ignorate dalle altre fonti. */
  arxivCategories: readonly string[];
};

const DEFAULT_OPTIONS: LaneOptions = {
  arxivCategories: DEFAULT_ARXIV_CATEGORIES,
};

function fetcherFor(
  source: SourceId,
  options: LaneOptions,
): () => Promise<SourceSnapshot> {
  switch (source) {
    case "hackernews":
      return getHackerNewsSnapshot;
    case "lobsters":
      return getLobstersSnapshot;
    case "reddit":
      return getRedditSnapshot;
    case "huggingface":
      return getHuggingFaceSnapshot;
    case "arxiv":
      return () => getArxivSnapshot(options.arxivCategories);
  }
}

/**
 * Restituisce gli item nell'ordine nativo di ogni fonte, senza tagliarli:
 * ordinamento e numero per fonte sono scelte di visualizzazione, le fa la
 * pagina. Così cambiare i controlli non tocca la rete né la cache.
 */
export async function getLane(
  lane: LaneId,
  options: LaneOptions = DEFAULT_OPTIONS,
): Promise<Lane> {
  const sources = LANE_SOURCES[lane];
  const results = await Promise.allSettled(
    sources.map((source) => fetcherFor(source, options)()),
  );

  const items: FeedItem[] = [];
  const failures: Lane["failures"] = [];
  const fetchedAt: Lane["fetchedAt"] = {};

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      items.push(...result.value.items);
      fetchedAt[sources[index]] = result.value.fetchedAt;
      return;
    }
    // Una fonte giù non deve portarsi dietro la corsia.
    failures.push({
      source: sources[index],
      message: messageOf(result.reason),
    });
  });

  return { items: dedupeByKey(items), failures, fetchedAt };
}

/** Quello che serve per riassumere un paper. */
export type PaperText = {
  key: string;
  title: string;
  abstract: string | null;
  /** Il riassunto di una frase che HF fornisce già, in inglese. */
  huggingFaceSummary: string | null;
};

/**
 * I testi dei paper richiesti, presi dai feed in cache e mai dal client: è la
 * whitelist dei riassunti. Una chiave che non compare nei feed non produce
 * nulla, quindi nessuno può far riassumere (e pagare) un testo arbitrario.
 * Se lo stesso paper è su HF e su arXiv vince HF, che ha anche il suo riassunto.
 */
export async function getPaperTexts(
  keys: readonly string[],
  arxivCategories: readonly string[],
): Promise<PaperText[]> {
  // Una fonte giù toglie solo i suoi riassunti: l'errore la pagina lo mostra già.
  const [huggingFace, arxiv] = await Promise.all([
    getHuggingFaceTexts().catch(
      () => new Map<string, HuggingFaceTexts>(),
    ),
    getArxivTexts(arxivCategories).catch(
      () => new Map<string, { title: string; abstract: string }>(),
    ),
  ]);

  return keys.flatMap((key) => {
    const fromHuggingFace = huggingFace.get(key);
    if (fromHuggingFace) {
      return [
        {
          key,
          title: fromHuggingFace.title,
          abstract: fromHuggingFace.abstract,
          huggingFaceSummary: fromHuggingFace.aiSummary,
        },
      ];
    }
    const fromArxiv = arxiv.get(key);
    return fromArxiv
      ? [{ key, ...fromArxiv, huggingFaceSummary: null }]
      : [];
  });
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
