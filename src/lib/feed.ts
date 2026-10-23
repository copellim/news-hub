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

/** Gli item di una fonte e il momento in cui sono stati scaricati davvero. */
export type SourceSnapshot = {
  items: FeedItem[];
  fetchedAt: string;
};

export type Lane = {
  items: FeedItem[];
  failures: SourceFailure[];
  /** Quando ogni fonte riuscita è stata scaricata, non quando è stata servita. */
  fetchedAt: Partial<Record<SourceId, string>>;
};

/**
 * Oltre questa età i dati di una fonte vanno richiesti di nuovo. Le cache sono
 * stale-while-revalidate: con una o due persone quasi ogni visita è la prima
 * dopo una pausa, e riceve la copia vecchia mentre quella nuova si prepara.
 * Le soglie stanno poco sopra il `revalidate` del `cacheLife` di ogni fonte.
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

/** "Ultime 24 ore" o tutto quello che le fonti restituiscono. */
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
    case "recent":
      return sortByPublishedAtDesc(items);
    case "discussed":
      return sortByPlaceInSource(items, "commentCount");
    case "ranked":
      return sortByPlaceInSource(items, "score");
  }
}

function sortByPublishedAtDesc(items: FeedItem[]): FeedItem[] {
  return [...items].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
}

/** Le due grandezze che si confrontano fra fonti, sempre dentro la fonte. */
export type SourceMetric = "score" | "commentCount";

/** Posizione nella classifica della propria fonte: 1 è il primo. */
export type SourcePlace = { position: number; outOf: number };

/** Posizione di ogni item, per chiave, sul criterio dato. */
export type SourceRanking = ReadonlyMap<string, SourcePlace>;

/**
 * Gli score grezzi non sono confrontabili tra fonti (1297 punti HN contro 47 di
 * Lobsters), la posizione nella propria fonte sì: "terzo su 50 di HN" vale come
 * "secondo su 25 di Lobsters". Si ordina su quella quota, a parità vince il più
 * recente. Lo stesso vale per i commenti.
 *
 * Posizione e non rapporto con il massimo: con il massimo un solo post virale
 * da 3000 punti schiaccerebbe sotto il 30% tutti gli altri della sua fonte. E
 * non rapporto con il totale: premierebbe le fonti che restituiscono meno item.
 *
 * Non si può usare la posizione nativa della fonte come classifica: l'ordine di
 * `huggingface.co/api/daily_papers` non è per upvote, quindi darebbe un ranking
 * finto. Le fonti senza punteggio (arXiv) finiscono in fondo. Lì la data non
 * decide niente, perché arXiv data l'annuncio e non il paper: tutti gli item di
 * un giorno sono pari, e l'ordinamento stabile lascia quello del feed.
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
 * Classifica ogni fonte per conto suo. A pari valore pari posizione (1, 2, 2,
 * 4): due item con gli stessi punti non devono finire uno sopra l'altro per
 * caso. Gli item senza valore non entrano in classifica.
 */
export function rankWithinSource(
  items: FeedItem[],
  metric: SourceMetric,
): SourceRanking {
  const valuesBySource = new Map<SourceId, number[]>();
  for (const item of items) {
    const value = item[metric];
    // `typeof` e non `!== null`: un solo score `undefined` produrrebbe NaN, e
    // con NaN il confronto dell'intera fonte smetterebbe di funzionare.
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
 * Quota della fonte che l'item ha sotto di sé, sé compreso: 1 per il primo,
 * vicino a 0 per l'ultimo. -1 fuori classifica, sotto chiunque ci sia.
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
