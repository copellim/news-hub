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

export type SortMode = "ranked" | "recent";

export type ReadFilter = "all" | "unread" | "read";

export function filterByRead(
  items: FeedItem[],
  filter: ReadFilter,
  visitedKeys: ReadonlySet<string>,
): FeedItem[] {
  if (filter === "all") {
    return items;
  }
  const wantVisited = filter === "read";
  return items.filter((item) => visitedKeys.has(item.key) === wantVisited);
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
  return mode === "recent" ? sortByPublishedAtDesc(items) : sortByRank(items);
}

function sortByPublishedAtDesc(items: FeedItem[]): FeedItem[] {
  return [...items].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
}

/**
 * Gli score grezzi non sono confrontabili tra fonti (1297 punti HN contro 47 di
 * Lobsters), ma il rapporto con il massimo della propria fonte sì: normalizza a
 * [0,1] e ordina su quello. A parità vince il più recente.
 *
 * Non si può usare la posizione nativa della fonte come classifica: l'ordine di
 * `huggingface.co/api/daily_papers` non è per upvote, quindi darebbe un ranking
 * finto. Le fonti senza punteggio (arXiv) finiscono in fondo, ordinate per data.
 */
function sortByRank(items: FeedItem[]): FeedItem[] {
  const maxBySource = maxScorePerSource(items);

  return [...items].sort(
    (a, b) =>
      normalizedScore(b, maxBySource) - normalizedScore(a, maxBySource) ||
      Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
}

function maxScorePerSource(items: FeedItem[]): Map<SourceId, number> {
  const maxBySource = new Map<SourceId, number>();
  for (const item of items) {
    // `typeof` e non `!== null`: un solo score `undefined` renderebbe NaN il
    // massimo della fonte, e con NaN l'intera fonte scivolerebbe in fondo.
    if (typeof item.score !== "number") {
      continue;
    }
    maxBySource.set(
      item.source,
      Math.max(maxBySource.get(item.source) ?? 0, item.score),
    );
  }
  return maxBySource;
}

/** -1 = fonte senza punteggio: sotto qualunque item che un punteggio ce l'ha. */
function normalizedScore(
  item: FeedItem,
  maxBySource: Map<SourceId, number>,
): number {
  const max = maxBySource.get(item.source);
  if (typeof item.score !== "number" || !max) {
    return -1;
  }
  return item.score / max;
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
