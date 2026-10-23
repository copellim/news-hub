"use client";

import { useState, type ReactNode } from "react";

import { SaveToQueueButton } from "@/components/SaveToQueueButton";
import { useNow } from "@/lib/now";
import { useVisitedItems } from "@/lib/settings";
import {
  hostnameOf,
  LANE_SOURCES,
  SOURCE_LABELS,
  topShareOf,
  type FeedItem,
  type Lane,
  type SourceId,
  type SourceMetric,
  type SourcePlace,
  type SourceRanking,
} from "@/lib/feed";

const SOURCE_COLORS: Record<SourceId, string> = {
  hackernews: "text-src-hackernews",
  lobsters: "text-src-lobsters",
  reddit: "text-src-reddit",
  huggingface: "text-src-huggingface",
  arxiv: "text-src-arxiv",
};

/** Nome breve per le etichette: "Il più votato su HN". */
const SOURCE_SHORT_LABELS: Record<SourceId, string> = {
  hackernews: "HN",
  lobsters: "Lobsters",
  reddit: "r/programming",
  huggingface: "HF",
  arxiv: "arXiv",
};

/**
 * Entro quante ore un item è "Nuovo". Le front page girano in mezza giornata;
 * HF e arXiv pubblicano una volta al giorno, e un paper di ieri è ancora fresco.
 */
const NEW_WITHIN_HOURS: Record<SourceId, number> = {
  hackernews: 12,
  lobsters: 12,
  reddit: 12,
  huggingface: 36,
  arxiv: 36,
};

/** Nel primo 10% della propria fonte l'item è "In cima". */
const TOP_FRACTION = 0.1;

/**
 * Una discussione è accesa quando i commenti arrivano ad almeno il 60% dei
 * punti. Sotto i 20 commenti il rapporto è rumore: 3 commenti su 4 punti non
 * sono un dibattito.
 */
const HEATED_COMMENTS_PER_POINT = 0.6;
const HEATED_MIN_COMMENTS = 20;

/** Oltre questa lunghezza, da `sm` in su, il riassunto parte chiuso a 3 righe. */
const LONG_SUMMARY_CHARS = 320;

const RECENT_BAND_HOURS = 24;

const HOUR_MS = 3_600_000;

const relativeTime = new Intl.RelativeTimeFormat("it", { numeric: "auto" });

const absoluteTime = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

const NO_SUMMARIES: ReadonlyMap<string, string> = new Map();
const NO_PENDING_KEYS: ReadonlySet<string> = new Set();

type ItemGroup = { id: string; label: string | null; items: FeedItem[] };

export function FeedList({
  lane,
  emptyLabel,
  rowAction,
  summaries = NO_SUMMARIES,
  pendingSummaryKeys = NO_PENDING_KEYS,
  rankings,
  barMetric = "score",
  groupByAge = false,
  groupUnscored = false,
}: {
  lane: Pick<Lane, "items" | "failures">;
  emptyLabel: string;
  /** Azione extra accanto al segnalibro, es. "Letto" nella coda. */
  rowAction?: (item: FeedItem) => ReactNode;
  /** Riassunto in italiano per chiave, solo nella corsia Papers. */
  summaries?: ReadonlyMap<string, string>;
  /** Paper il cui riassunto si sta generando adesso. */
  pendingSummaryKeys?: ReadonlySet<string>;
  /**
   * Posizione di ogni item nella propria fonte, calcolata su tutta la corsia e
   * non solo sulle righe visibili: barretta e "In cima a" restano stabili
   * cambiando i filtri. Senza, la riga mostra i numeri e basta.
   */
  rankings?: Record<SourceMetric, SourceRanking>;
  /** Cosa misura la barretta: lo stesso criterio dell'ordinamento scelto. */
  barMetric?: SourceMetric;
  /** Divide in "Ultime 24 ore" e "Prima", mantenendo l'ordine scelto. */
  groupByAge?: boolean;
  /**
   * Stacca in un gruppo con il suo titolo gli item senza voti, che una
   * classifica per voti lascia in fondo nell'ordine del feed.
   */
  groupUnscored?: boolean;
}) {
  // Un solo abbonamento allo store per lista, non uno per riga.
  const { visitedKeys, markVisited } = useVisitedItems();
  const now = useNow();

  let groups: ItemGroup[] = [{ id: "all", label: null, items: lane.items }];
  if (groupByAge && now !== null) {
    groups = groupsByAge(lane.items, now);
  } else if (groupUnscored) {
    groups = groupsByScore(lane.items);
  }

  return (
    <div className="flex flex-col gap-6">
      {lane.failures.map((failure) => (
        <p
          key={failure.source}
          className="rounded-xl border border-warn-line bg-warn px-4 py-3 text-sm"
        >
          <strong>{SOURCE_LABELS[failure.source]}</strong> non risponde:{" "}
          {failure.message}
        </p>
      ))}

      {lane.items.length === 0 ? (
        <p className="py-10 text-center text-muted">{emptyLabel}</p>
      ) : (
        groups
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <section key={group.id} className="flex flex-col gap-2">
              {group.label && (
                <h2 className="px-1 text-sm font-semibold text-muted sm:px-4">
                  {group.label}
                </h2>
              )}
              <ol className="flex flex-col gap-3 sm:gap-0">
                {group.items.map((item) => (
                  <FeedRow
                    key={item.key}
                    item={item}
                    isVisited={visitedKeys.has(item.key)}
                    onVisit={markVisited}
                    action={rowAction?.(item)}
                    summary={summaries.get(item.key) ?? null}
                    isSummaryPending={pendingSummaryKeys.has(item.key)}
                    scorePlace={rankings?.score.get(item.key) ?? null}
                    bar={barOf(item, rankings, barMetric)}
                    now={now}
                  />
                ))}
              </ol>
            </section>
          ))
      )}
    </div>
  );
}

function barOf(
  item: FeedItem,
  rankings: Record<SourceMetric, SourceRanking> | undefined,
  metric: SourceMetric,
): PlaceBarValue | null {
  const place = rankings?.[metric].get(item.key);
  return place ? { metric, place } : null;
}

function groupsByAge(items: FeedItem[], now: number): ItemGroup[] {
  const isRecent = (item: FeedItem) =>
    hoursSince(item.publishedAt, now) < RECENT_BAND_HOURS;
  return [
    { id: "recent", label: "Ultime 24 ore", items: items.filter(isRecent) },
    {
      id: "older",
      label: "Prima",
      items: items.filter((item) => !isRecent(item)),
    },
  ];
}

/**
 * Sui paper gli unici senza voti sono quelli di arXiv, e fra loro non c'è
 * ordine vero: il titolo lo dice, invece di lasciarli sembrare il fondo della
 * classifica.
 */
function groupsByScore(items: FeedItem[]): ItemGroup[] {
  const isScored = (item: FeedItem) => typeof item.score === "number";
  return [
    { id: "scored", label: null, items: items.filter(isScored) },
    {
      id: "unscored",
      label: "arXiv, senza voti, nell'ordine dell'annuncio",
      items: items.filter((item) => !isScored(item)),
    },
  ];
}

function FeedRow({
  item,
  isVisited,
  onVisit,
  action,
  summary,
  isSummaryPending,
  scorePlace,
  bar,
  now,
}: {
  item: FeedItem;
  isVisited: boolean;
  onVisit: (key: string) => void;
  action: ReactNode;
  summary: string | null;
  isSummaryPending: boolean;
  /** Posizione per punti nella fonte; null senza punti o senza classifica. */
  scorePlace: SourcePlace | null;
  /** Barretta del criterio di ordinamento; null dove non c'è classifica. */
  bar: PlaceBarValue | null;
  now: number | null;
}) {
  const signals = signalsOf(item, scorePlace, now);
  const hasLabels = signals.length > 0 || item.tags.length > 0;

  return (
    <li className="feed-row rounded-xl border border-card-line bg-card sm:border-0 sm:bg-transparent sm:p-4 sm:even:bg-stripe">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-4 text-sm text-muted [grid-area:meta] sm:px-0 sm:pt-0">
        <span className={`font-semibold ${SOURCE_COLORS[item.source]}`}>
          {SOURCE_LABELS[item.source]}
        </span>
        <BylineOf item={item} />
        <PublishedAt iso={item.publishedAt} now={now} />
        {isVisited && <span>letto</span>}
      </div>

      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        onClick={() => onVisit(item.key)}
        className={`mt-1.5 px-4 text-lg leading-[1.3] font-semibold tracking-[-0.01em] text-pretty decoration-1 underline-offset-[3px] [grid-area:title] hover:underline sm:px-0 sm:text-[19px] ${
          isVisited ? "text-muted" : "text-ink"
        }`}
      >
        {item.title}
      </a>

      {summary ? (
        <Summary text={summary} />
      ) : (
        isSummaryPending && (
          <p className="mt-2 px-4 font-serif text-[17px] text-muted [grid-area:summary] sm:px-0">
            Il riassunto si sta scrivendo.
          </p>
        )
      )}

      {hasLabels && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 px-4 text-[13px] [grid-area:labels] sm:mt-2.5 sm:px-0">
          {signals.map((signal) => (
            <span
              key={signal}
              className="rounded-lg bg-chip px-2 py-0.5 font-semibold text-chip-ink"
            >
              {signal}
            </span>
          ))}
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-lg border border-tag-line px-2 py-px text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <Stats item={item} bar={bar} onVisit={onVisit} />

      <div className="mt-3 flex items-center justify-end border-t border-rule pr-1 [grid-area:actions] sm:-mt-2.5 sm:-mr-2.5 sm:ml-3 sm:items-start sm:self-start sm:border-0 sm:pr-0">
        <SaveToQueueButton item={item} />
        {action}
      </div>
    </li>
  );
}

/** Per le news il sito d'origine, per i paper chi li ha segnalati o firmati. */
function BylineOf({ item }: { item: FeedItem }) {
  if (LANE_SOURCES.papers.includes(item.source)) {
    return item.author ? <span>{item.author}</span> : null;
  }
  const host = hostnameOf(item.url);
  return host ? <span>{host}</span> : null;
}

function Summary({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isClamped = text.length > LONG_SUMMARY_CHARS && !isExpanded;

  return (
    <div className="mt-2 px-4 [grid-area:summary] sm:px-0">
      {/* Su mobile il riassunto è sempre intero: è il motivo per aprire la
          corsia dal telefono, e il "leggi tutto" costerebbe un tocco in più. */}
      <p
        className={`max-w-[66ch] font-serif text-lg leading-[1.6] text-pretty text-prose ${
          isClamped ? "sm:line-clamp-3" : ""
        }`}
      >
        {text}
      </p>
      {isClamped && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="state-layer mt-1 -ml-3 hidden rounded-full px-3 py-1.5 text-sm font-semibold text-accent sm:inline-flex"
        >
          Leggi tutto il riassunto
        </button>
      )}
    </div>
  );
}

function Stats({
  item,
  bar,
  onVisit,
}: {
  item: FeedItem;
  bar: PlaceBarValue | null;
  onVisit: (key: string) => void;
}) {
  const isHeated = isHeatedDiscussion(item);
  const scoreUnit = LANE_SOURCES.papers.includes(item.source) ? "voti" : "punti";
  // La barretta sta accanto al numero che decide l'ordine.
  const barFor = (metric: SourceMetric) =>
    bar?.metric === metric ? (
      <PlaceBar value={bar} source={item.source} />
    ) : null;

  return (
    <div className="mt-3 flex min-h-11 items-center gap-x-3 border-t border-rule pl-4 text-sm whitespace-nowrap text-muted [grid-area:stats] sm:mt-2.5 sm:mr-3 sm:min-h-6 sm:self-start sm:border-0 sm:pl-0">
      {typeof item.score === "number" ? (
        <span className="inline-flex items-center gap-3">
          {barFor("score")}
          <span>
            <span className="font-bold text-ink tabular-nums">{item.score}</span>{" "}
            {scoreUnit}
          </span>
        </span>
      ) : (
        <span>senza voti</span>
      )}
      {item.discussionUrl && (
        <span className="inline-flex items-center gap-3">
          {barFor("commentCount")}
          <a
            href={item.discussionUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => onVisit(item.key)}
            className={`tabular-nums underline-offset-[3px] hover:underline ${
              isHeated || bar?.metric === "commentCount" ? "font-bold text-ink" : ""
            }`}
          >
            {commentsLabel(item.commentCount ?? 0)}
          </a>
        </span>
      )}
    </div>
  );
}

function commentsLabel(count: number): string {
  return count === 1 ? "1 commento" : `${count} commenti`;
}

type PlaceBarValue = { metric: SourceMetric; place: SourcePlace };

const PLACE_BAR_CRITERION: Record<SourceMetric, string> = {
  score: "per voti",
  commentCount: "per commenti",
};

/**
 * Dove sta l'item nella sua fonte sul criterio scelto: la barretta è piena per
 * il primo, e il "top 4%" dice in chiaro il numero su cui la lista è ordinata.
 * I punti grezzi saltano fra una fonte e l'altra, questo no.
 */
function PlaceBar({ value, source }: { value: PlaceBarValue; source: SourceId }) {
  const { position, outOf } = value.place;
  const topPercent = Math.ceil((position / outOf) * 100);
  const description = `${position}° su ${outOf} di ${SOURCE_LABELS[source]} ${PLACE_BAR_CRITERION[value.metric]}`;
  return (
    <span className="inline-flex items-center gap-2" title={description}>
      <span
        aria-hidden
        className="block h-1 w-12 overflow-hidden rounded-full bg-accent-track"
      >
        <span
          className="block h-full rounded-full bg-accent"
          style={{ width: `${Math.round(topShareOf(value.place) * 100)}%` }}
        />
      </span>
      <span className="tabular-nums">
        <span className="sr-only">{description}, </span>
        <span aria-hidden>top {topPercent}%</span>
      </span>
    </span>
  );
}

function signalsOf(
  item: FeedItem,
  scorePlace: SourcePlace | null,
  now: number | null,
): string[] {
  const signals: string[] = [];
  const sourceName = SOURCE_SHORT_LABELS[item.source];
  if (scorePlace?.position === 1) {
    signals.push(`Il più votato su ${sourceName}`);
  } else if (
    scorePlace &&
    scorePlace.position / scorePlace.outOf <= TOP_FRACTION
  ) {
    signals.push(`In cima a ${sourceName}`);
  }
  if (isHeatedDiscussion(item)) {
    signals.push("Discussione accesa");
  }
  if (
    now !== null &&
    hoursSince(item.publishedAt, now) < NEW_WITHIN_HOURS[item.source]
  ) {
    signals.push("Nuovo");
  }
  return signals;
}

function isHeatedDiscussion(item: FeedItem): boolean {
  const comments = item.commentCount ?? 0;
  return (
    typeof item.score === "number" &&
    comments >= HEATED_MIN_COMMENTS &&
    comments >= item.score * HEATED_COMMENTS_PER_POINT
  );
}

function hoursSince(iso: string, now: number): number {
  return (now - Date.parse(iso)) / HOUR_MS;
}

/**
 * L'età ("16 ore fa") esiste solo dopo il montaggio: prima, e nel render del
 * server, c'è la data assoluta, che non dipende da quando la cache è nata.
 */
function PublishedAt({ iso, now }: { iso: string; now: number | null }) {
  const absolute = absoluteTime.format(new Date(iso));
  return (
    <time dateTime={iso} title={absolute}>
      {now === null ? absolute : ageLabel(iso, now)}
    </time>
  );
}

function ageLabel(iso: string, now: number): string {
  const minutes = Math.max(1, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) {
    return relativeTime.format(-minutes, "minute");
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return relativeTime.format(-hours, "hour");
  }
  // Con `numeric: "auto"` -1 diventa "ieri" e -2 "l'altro ieri".
  return relativeTime.format(-Math.floor(hours / 24), "day");
}
