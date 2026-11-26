/** Model shared by all sources. Client-safe: no `node:*` dependency. */

export type SourceId =
  | "hackernews"
  | "lobsters"
  | "reddit"
  | "huggingface"
  | "arxiv";

export type LaneId = "news" | "papers";

export type FeedItem = {
  /** Dedup key: arXiv id when available, otherwise `${source}:${native id}`. */
  key: string;
  source: SourceId;
  title: string;
  /** Link to the actual article/paper, not to the discussion page. */
  url: string;
  /** The source's discussion page, when it exists and differs from `url`. */
  discussionUrl: string | null;
  /** The source's native score: not comparable across different sources. */
  score: number | null;
  commentCount: number | null;
  author: string | null;
  publishedAt: string;
  tags: string[];
};

export const SOURCE_LABELS: Record<SourceId, string> = {
  hackernews: "Hacker News",
  lobsters: "Lobsters",
  reddit: "r/programming",
  huggingface: "HF Daily",
  arxiv: "arXiv",
};

/** A source that failed: the lane stays alive, the error is visible in the UI. */
export type SourceFailure = {
  source: SourceId;
  message: string;
};

/** A source's items and the moment they were actually downloaded. */
export type SourceSnapshot = {
  items: FeedItem[];
  fetchedAt: string;
  notice?: string;
};

export type Lane = {
  items: FeedItem[];
  failures: SourceFailure[];
  notices?: string[];
  /** Original counts before deduplication, to tell empty feeds from duplicates. */
  sourceItemCounts?: Partial<Record<SourceId, number>>;
  /** When each successful source was downloaded, not when it was served. */
  fetchedAt: Partial<Record<SourceId, string>>;
};

/**
 * Beyond this age a source's data must be requested again. The caches are
 * stale-while-revalidate: with one or two people almost every visit is the first
 * after a pause, and it receives the old copy while the new one is prepared.
 * The thresholds sit just above the `revalidate` of each source's `cacheLife`.
 */
const REFRESH_AFTER_MS: Record<SourceId, number> = {
  hackernews: 5 * 60_000,
  lobsters: 5 * 60_000,
  reddit: 5 * 60_000,
  huggingface: 70 * 60_000,
  arxiv: 70 * 60_000,
};

export function isLaneStale(lane: Lane, now: number): boolean {
  return Object.entries(lane.fetchedAt).some(
    ([source, fetchedAt]) =>
      now - Date.parse(fetchedAt) > REFRESH_AFTER_MS[source as SourceId],
  );
}

export type SortMode = "scientific" | "ranked" | "discussed" | "recent";

export type ReadFilter = "all" | "unread";

export function filterByRead(
  items: FeedItem[],
  filter: ReadFilter,
  visitedKeys: ReadonlySet<string>,
): FeedItem[] {
  if (filter === "all") {
    return items;
  }
  return items.filter((item) => !visitedKeys.has(item.key));
}

export const LANE_SOURCES: Record<LaneId, readonly SourceId[]> = {
  news: ["hackernews", "lobsters", "reddit"],
  papers: ["huggingface", "arxiv"],
};

/**
 * Keeps the first `perSource` items of each source **preserving the received order**.
 * It must therefore be applied after `sortItems`, so each source contributes its
 * best N by the chosen criterion and not the first N it returned.
 */
export function takePerSource(
  items: FeedItem[],
  perSource: number,
): FeedItem[] {
  const takenBySource = new Map<SourceId, number>();
  return items.filter((item) => {
    const taken = takenBySource.get(item.source) ?? 0;
    if (taken >= perSource) {
      return false;
    }
    takenBySource.set(item.source, taken + 1);
    return true;
  });
}

/** "Ultime 24 ore" (last 24 hours) or everything the sources return. */
export type Period = "all" | "day";

const DAY_MS = 24 * 3_600_000;

export function filterByPeriod(
  items: FeedItem[],
  period: Period,
  now: number,
): FeedItem[] {
  if (period === "all") {
    return items;
  }
  return items.filter((item) => now - Date.parse(item.publishedAt) < DAY_MS);
}

export function sortItems(items: FeedItem[], mode: SortMode): FeedItem[] {
  switch (mode) {
    case "scientific":
      // Scientific priority is applied by the verdicts, never by the votes.
      return sortByPublishedAtDesc(items);
    case "recent":
      return sortByPublishedAtDesc(items);
    case "discussed":
      return sortByPlaceInSource(items, "commentCount");
    case "ranked":
      return sortByPlaceInSource(items, "score");
  }
}

/** Alternates the available sources preserving their internal order, without artificial quality quotas. */
export function interleaveSources(items: readonly FeedItem[]): FeedItem[] {
  const bySource = new Map<SourceId, FeedItem[]>();
  for (const item of items) {
    const queue = bySource.get(item.source) ?? [];
    queue.push(item);
    bySource.set(item.source, queue);
  }
  const queues = [...bySource.values()];
  const result: FeedItem[] = [];
  for (let index = 0; queues.some((queue) => index < queue.length); index++) {
    for (const queue of queues) if (queue[index]) result.push(queue[index]);
  }
  return result;
}

function sortByPublishedAtDesc(items: FeedItem[]): FeedItem[] {
  return [...items].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
}

/** The two quantities compared across sources, always within the source. */
export type SourceMetric = "score" | "commentCount";

/** Position in the ranking of its own source: 1 is the first. */
export type SourcePlace = { position: number; outOf: number };

/** Position of each item, by key, on the given criterion. */
export type SourceRanking = ReadonlyMap<string, SourcePlace>;

/**
 * Raw scores are not comparable across sources (1297 HN points against 47 on
 * Lobsters), the position within one's own source is: "third out of 50 on HN" is
 * worth "second out of 25 on Lobsters". Items are ordered on that share, on a tie
 * the most recent wins. The same applies to comments.
 *
 * Position and not ratio to the maximum: with the maximum a single viral post
 * of 3000 points would crush all the others of its source below 30%. And
 * not ratio to the total: it would reward the sources that return fewer items.
 *
 * The source's native position cannot be used as a ranking: the order of
 * `huggingface.co/api/daily_papers` is not by upvotes, so it would give a fake
 * ranking. Sources without a score (arXiv) end up at the bottom. There the date
 * decides nothing, because arXiv dates the announcement and not the paper: all
 * items of one day are equal, and the stable sort keeps the feed's order.
 */
function sortByPlaceInSource(
  items: FeedItem[],
  metric: SourceMetric,
): FeedItem[] {
  const ranking = rankWithinSource(items, metric);

  return [...items].sort(
    (a, b) =>
      topShareOf(ranking.get(b.key)) - topShareOf(ranking.get(a.key)) ||
      Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
}

/**
 * Ranks each source on its own. Equal value, equal position (1, 2, 2,
 * 4): two items with the same points must not end up one above the other by
 * chance. Items without a value do not enter the ranking.
 */
export function rankWithinSource(
  items: FeedItem[],
  metric: SourceMetric,
): SourceRanking {
  const valuesBySource = new Map<SourceId, number[]>();
  for (const item of items) {
    const value = item[metric];
    // `typeof` and not `!== null`: a single `undefined` score would produce NaN, and
    // with NaN the comparison of the whole source would stop working.
    if (typeof value === "number") {
      const values = valuesBySource.get(item.source) ?? [];
      values.push(value);
      valuesBySource.set(item.source, values);
    }
  }
  for (const values of valuesBySource.values()) {
    values.sort((a, b) => b - a);
  }

  const ranking = new Map<string, SourcePlace>();
  for (const item of items) {
    const value = item[metric];
    const values = valuesBySource.get(item.source);
    if (typeof value === "number" && values) {
      ranking.set(item.key, {
        position: values.indexOf(value) + 1,
        outOf: values.length,
      });
    }
  }
  return ranking;
}

/**
 * Share of the source that the item has below it, itself included: 1 for the first,
 * close to 0 for the last. -1 when unranked, below anyone who is ranked.
 */
export function topShareOf(place: SourcePlace | undefined): number {
  if (!place) {
    return -1;
  }
  return (place.outOf - place.position + 1) / place.outOf;
}

export function dedupeByKey(items: FeedItem[]): FeedItem[] {
  const byKey = new Map<string, FeedItem>();
  for (const item of items) {
    const existing = byKey.get(item.key);
    if (!existing || contextScore(item) > contextScore(existing)) {
      byKey.set(item.key, item);
    }
  }
  return [...byKey.values()];
}

function contextScore(item: FeedItem): number {
  return (item.score ?? 0) + (item.commentCount ?? 0);
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
