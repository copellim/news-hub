"use client";

import { useState, type ReactNode } from "react";

import { SaveToQueueButton } from "@/components/SaveToQueueButton";
import { useNow } from "@/lib/now";
import { useVisitedItems } from "@/lib/settings";
import {
  hostnameOf,
  LANE_SOURCES,
  shareOfSourceMax,
  SOURCE_LABELS,
  type FeedItem,
  type Lane,
  type SourceId,
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

/** Da questa quota del massimo della fonte in su l'item è "In cima". */
const TOP_SHARE = 0.7;

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

type ItemGroup = { label: string | null; items: FeedItem[] };

export function FeedList({
  lane,
  emptyLabel,
  rowAction,
  summaries = NO_SUMMARIES,
  pendingSummaryKeys = NO_PENDING_KEYS,
  scoreMaxBySource,
  groupByAge = false,
}: {
  lane: Lane;
  emptyLabel: string;
  /** Azione extra accanto al segnalibro, es. "Letto" nella coda. */
  rowAction?: (item: FeedItem) => ReactNode;
  /** Riassunto in italiano per chiave, solo nella corsia Papers. */
  summaries?: ReadonlyMap<string, string>;
  /** Paper il cui riassunto si sta generando adesso. */
  pendingSummaryKeys?: ReadonlySet<string>;
  /**
   * Massimo dei punti per fonte nell'intera corsia, non solo fra le righe
   * visibili: la barretta e "In cima a" restano stabili cambiando filtri.
   * Senza, la riga mostra i punti e basta.
   */
  scoreMaxBySource?: ReadonlyMap<SourceId, number>;
  /** Divide in "Ultime 24 ore" e "Prima", mantenendo l'ordine scelto. */
  groupByAge?: boolean;
}) {
  // Un solo abbonamento allo store per lista, non uno per riga.
  const { visitedKeys, markVisited } = useVisitedItems();
  const now = useNow();

  const groups: ItemGroup[] =
    groupByAge && now !== null
      ? groupsByAge(lane.items, now)
      : [{ label: null, items: lane.items }];

  return (
    <div className="flex flex-col gap-6">
      {lane.failures.map((failure) => (
        <p
          key={failure.source}
          className="rounded-lg border border-warn-line bg-warn px-4 py-3 text-sm"
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
            <section key={group.label ?? "all"} className="flex flex-col gap-2">
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
                    scoreShare={
                      scoreMaxBySource
                        ? shareOfSourceMax(item, "score", scoreMaxBySource)
                        : null
                    }
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

function groupsByAge(items: FeedItem[], now: number): ItemGroup[] {
  const isRecent = (item: FeedItem) =>
    hoursSince(item.publishedAt, now) < RECENT_BAND_HOURS;
  return [
    { label: "Ultime 24 ore", items: items.filter(isRecent) },
    { label: "Prima", items: items.filter((item) => !isRecent(item)) },
  ];
}

function FeedRow({
  item,
  isVisited,
  onVisit,
  action,
  summary,
  isSummaryPending,
  scoreShare,
  now,
}: {
  item: FeedItem;
  isVisited: boolean;
  onVisit: (key: string) => void;
  action: ReactNode;
  summary: string | null;
  isSummaryPending: boolean;
  /** Quota del massimo della fonte in [0,1], -1 senza punti, null se ignota. */
  scoreShare: number | null;
  now: number | null;
}) {
  const signals = signalsOf(item, scoreShare, now);
  const hasLabels = signals.length > 0 || item.tags.length > 0;

  return (
    <li className="feed-row rounded-xl border border-card-line bg-surface sm:rounded-lg sm:border-0 sm:p-4 sm:even:bg-stripe">
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
              className="rounded-full bg-chip px-2 py-0.5 font-semibold text-chip-ink"
            >
              {signal}
            </span>
          ))}
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-tag-line px-2 py-px text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <Stats item={item} scoreShare={scoreShare} onVisit={onVisit} />

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
          className="mt-1 hidden text-sm font-semibold text-accent hover:underline sm:inline"
        >
          Leggi tutto il riassunto
        </button>
      )}
    </div>
  );
}

function Stats({
  item,
  scoreShare,
  onVisit,
}: {
  item: FeedItem;
  scoreShare: number | null;
  onVisit: (key: string) => void;
}) {
  const isHeated = isHeatedDiscussion(item);
  const scoreUnit = LANE_SOURCES.papers.includes(item.source) ? "voti" : "punti";

  return (
    <div className="mt-3 flex min-h-11 items-center gap-x-3 border-t border-rule pl-4 text-sm whitespace-nowrap text-muted [grid-area:stats] sm:mt-2.5 sm:mr-3 sm:min-h-6 sm:self-start sm:border-0 sm:pl-0">
      {typeof item.score === "number" ? (
        <span className="inline-flex items-center gap-2">
          {scoreShare !== null && scoreShare >= 0 && (
            <HeatBar share={scoreShare} source={item.source} />
          )}
          <span>
            <span className="font-bold text-ink tabular-nums">{item.score}</span>{" "}
            {scoreUnit}
          </span>
        </span>
      ) : (
        <span>senza voti</span>
      )}
      {item.discussionUrl && (
        <a
          href={item.discussionUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => onVisit(item.key)}
          className={`tabular-nums underline-offset-[3px] hover:underline ${
            isHeated ? "font-bold text-ink" : ""
          }`}
        >
          {commentsLabel(item.commentCount ?? 0)}
        </a>
      )}
    </div>
  );
}

function commentsLabel(count: number): string {
  return count === 1 ? "1 commento" : `${count} commenti`;
}

/** Quanto l'item si avvicina al più votato della sua fonte. */
function HeatBar({ share, source }: { share: number; source: SourceId }) {
  const percent = Math.round(share * 100);
  return (
    <span
      role="img"
      aria-label={`${percent}% del più votato di ${SOURCE_LABELS[source]}`}
      title={`${percent}% del più votato di ${SOURCE_LABELS[source]}`}
      className="block h-1 w-12 overflow-hidden rounded-full bg-accent-track"
    >
      <span
        className="block h-full rounded-full bg-accent"
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

function signalsOf(
  item: FeedItem,
  scoreShare: number | null,
  now: number | null,
): string[] {
  const signals: string[] = [];
  const sourceName = SOURCE_SHORT_LABELS[item.source];
  if (scoreShare === 1) {
    signals.push(`Il più votato su ${sourceName}`);
  } else if (scoreShare !== null && scoreShare >= TOP_SHARE) {
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
