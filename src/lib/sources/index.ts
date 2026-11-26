import "server-only";

import { DEFAULT_ARXIV_CATEGORIES, MIN_PAPERS_PER_SOURCE, SOURCE_FETCH_LIMIT } from "@/lib/config";
import {
  dedupeByKey,
  LANE_SOURCES,
  type FeedItem,
  type Lane,
  type LaneId,
  type SourceId,
  type SourceSnapshot,
  takePerSource,
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
  /** arXiv categories chosen on the page; ignored by the other sources. */
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
 * Deduplicates the candidates and applies the maximum quota per source only after the merge:
 * the arXiv margin prevents HF duplicates from consuming its whole quota.
 * Ordering and visible limit remain client choices with no new requests.
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
  const sourceItemCounts: Lane["sourceItemCounts"] = {};
  const notices: string[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      items.push(...result.value.items);
      fetchedAt[sources[index]] = result.value.fetchedAt;
      sourceItemCounts[sources[index]] = result.value.items.length;
      if (result.value.notice) notices.push(result.value.notice);
      return;
    }
    // A source that is down must not take the lane down with it.
    failures.push({
      source: sources[index],
      message: messageOf(result.reason),
    });
  });

  const unique = takePerSource(dedupeByKey(items), SOURCE_FETCH_LIMIT);
  if (lane === "papers") {
    for (const source of sources) {
      if (source === "arxiv" && !options.arxivCategories.length) continue;
      if (failures.some((failure) => failure.source === source)) continue;
      const count = unique.filter((item) => item.source === source).length;
      if (count < MIN_PAPERS_PER_SOURCE) notices.push(`${source === "arxiv" ? "arXiv" : "HF"}: recuperati ${count} paper distinti; minimo richiesto ${MIN_PAPERS_PER_SOURCE}. Non sono stati sostituiti da paper dell'altra fonte.`);
    }
  }
  return { items: unique, failures, fetchedAt, sourceItemCounts, notices };
}

/** What is needed to summarise a paper. */
export type PaperText = {
  key: string;
  title: string;
  abstract: string | null;
  /** The one-sentence summary that HF already provides, in English. */
  huggingFaceSummary: string | null;
};

/**
 * The texts of the requested papers, taken from the cached feeds and never from the client: it is
 * the summaries' whitelist. A key that does not appear in the feeds produces
 * nothing, so nobody can have an arbitrary text summarised (and paid for).
 * If the same paper is on HF and on arXiv, HF wins, since it also has its own summary.
 */
export async function getPaperTexts(
  keys: readonly string[],
  arxivCategories: readonly string[],
): Promise<PaperText[]> {
  // A source that is down removes only its own summaries: the page already shows the error.
  const huggingFace = await getHuggingFaceTexts().catch(
    () => new Map<string, HuggingFaceTexts>(),
  );
  // A paper already hydrated by HF does not need a second download of the arXiv abstract.
  const arxivKeys = keys.filter((key) => !huggingFace.has(key));
  const arxiv = arxivKeys.length ? await getArxivTexts(arxivCategories, arxivKeys).catch(
    () => new Map<string, { title: string; abstract: string }>(),
  ) : new Map<string, { title: string; abstract: string }>();

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
