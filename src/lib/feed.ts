/** Modello comune a tutte le fonti. Client-safe: nessuna dipendenza `node:*`. */

export type SourceId =
  | "hackernews"
  | "lobsters"
  | "reddit"
  | "huggingface"
  | "arxiv";

export type LaneId = "news" | "papers";

export type FeedItem = {
  /** Chiave di dedup: arXiv id quando disponibile, altrimenti `${source}:${id nativo}`. */
  key: string;
  source: SourceId;
  title: string;
  /** Link all'articolo/paper vero, non alla pagina di discussione. */
  url: string;
  /** Pagina di discussione della fonte, quando esiste ed è diversa da `url`. */
  discussionUrl: string | null;
  /** Punteggio nativo della fonte: non confrontabile tra fonti diverse. */
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

/** Una fonte che ha fallito: la corsia resta viva, l'errore è visibile in UI. */
export type SourceFailure = {
  source: SourceId;
  message: string;
};

export type Lane = {
  items: FeedItem[];
  failures: SourceFailure[];
};

export type SortMode = "ranked" | "discussed" | "recent";

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
 * Tiene i primi `perSource` item di ogni fonte **preservando l'ordine ricevuto**.
 * Va quindi applicato dopo `sortItems`, così ogni fonte contribuisce i suoi
 * migliori N secondo il criterio scelto e non i primi N che ha restituito.
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

export function sortItems(items: FeedItem[], mode: SortMode): FeedItem[] {
  switch (mode) {
    case "recent":
      return sortByPublishedAtDesc(items);
    case "discussed":
      return sortByShareOfSourceMax(items, "commentCount");
    case "ranked":
      return sortByShareOfSourceMax(items, "score");
  }
}

function sortByPublishedAtDesc(items: FeedItem[]): FeedItem[] {
  return [...items].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
}

/** Le due grandezze che si confrontano fra fonti, sempre in rapporto al massimo. */
export type SourceMetric = "score" | "commentCount";

/**
 * Gli score grezzi non sono confrontabili tra fonti (1297 punti HN contro 47 di
 * Lobsters), ma il rapporto con il massimo della propria fonte sì: normalizza a
 * [0,1] e ordina su quello. A parità vince il più recente. Lo stesso vale per i
 * commenti: 600 su HN sono tanti quanto 60 su Lobsters.
 *
 * Non si può usare la posizione nativa della fonte come classifica: l'ordine di
 * `huggingface.co/api/daily_papers` non è per upvote, quindi darebbe un ranking
 * finto. Le fonti senza punteggio (arXiv) finiscono in fondo, ordinate per data.
 */
function sortByShareOfSourceMax(
  items: FeedItem[],
  metric: SourceMetric,
): FeedItem[] {
  const maxBySource = maxPerSource(items, metric);

  return [...items].sort(
    (a, b) =>
      shareOfSourceMax(b, metric, maxBySource) -
        shareOfSourceMax(a, metric, maxBySource) ||
      Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
}

export function maxPerSource(
  items: FeedItem[],
  metric: SourceMetric,
): Map<SourceId, number> {
  const maxBySource = new Map<SourceId, number>();
  for (const item of items) {
    const value = item[metric];
    // `typeof` e non `!== null`: un solo score `undefined` renderebbe NaN il
    // massimo della fonte, e con NaN l'intera fonte scivolerebbe in fondo.
    if (typeof value !== "number") {
      continue;
    }
    maxBySource.set(
      item.source,
      Math.max(maxBySource.get(item.source) ?? 0, value),
    );
  }
  return maxBySource;
}

/** -1 = valore assente: sotto qualunque item che il valore ce l'ha. */
export function shareOfSourceMax(
  item: FeedItem,
  metric: SourceMetric,
  maxBySource: ReadonlyMap<SourceId, number>,
): number {
  const value = item[metric];
  const max = maxBySource.get(item.source);
  if (typeof value !== "number" || !max) {
    return -1;
  }
  return value / max;
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
