import "server-only";

import { DEFAULT_ARXIV_CATEGORIES } from "@/lib/config";
import {
  dedupeByKey,
  LANE_SOURCES,
  type FeedItem,
  type Lane,
  type LaneId,
  type SourceId,
} from "@/lib/feed";
import { getArxivItems } from "./arxiv";
import { getHackerNewsItems } from "./hackernews";
import { getHuggingFaceItems } from "./huggingface";
import { getLobstersItems } from "./lobsters";
import { getRedditItems } from "./reddit";

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
): () => Promise<FeedItem[]> {
  switch (source) {
    case "hackernews":
      return getHackerNewsItems;
    case "lobsters":
      return getLobstersItems;
    case "reddit":
      return getRedditItems;
    case "huggingface":
      return getHuggingFaceItems;
    case "arxiv":
      return () => getArxivItems(options.arxivCategories);
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

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      items.push(...result.value);
      return;
    }
    // Una fonte giù non deve portarsi dietro la corsia.
    failures.push({
      source: sources[index],
      message: messageOf(result.reason),
    });
  });

  return { items: dedupeByKey(items), failures };
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
