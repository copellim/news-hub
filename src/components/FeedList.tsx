"use client";

import { useState, type MouseEvent, type ReactNode } from "react";

import { PaperQualityDetails } from "@/components/PaperQualityDetails";
import type { PaperQuality } from "@/lib/paper-quality/model";

import { PublishedAt } from "@/components/PublishedAt";
import { ReaderSheet, type ReaderTab } from "@/components/ReaderSheet";
import { SaveToQueueButton } from "@/components/SaveToQueueButton";
import { useNow } from "@/lib/now";
import { hasReadableDiscussion, isSelfPost } from "@/lib/reader-model";
import { useSettingsStatus, useVisitedItems } from "@/lib/settings";
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

/** Short name for the labels: "Il più votato su HN" (the most voted on HN). */
const SOURCE_SHORT_LABELS: Record<SourceId, string> = {
  hackernews: "HN",
  lobsters: "Lobsters",
  reddit: "r/programming",
  huggingface: "HF",
  arxiv: "arXiv",
};

/**
 * Within how many hours an item is "Nuovo" (new). Front pages turn over in half
 * a day; HF and arXiv publish once a day, and a paper from yesterday is still fresh.
 */
const NEW_WITHIN_HOURS: Record<SourceId, number> = {
  hackernews: 12,
  lobsters: 12,
  reddit: 12,
  huggingface: 36,
  arxiv: 36,
};

/** In the top 10% of its own source the item is "In cima" (at the top). */
const TOP_FRACTION = 0.1;

/**
 * A discussion is heated when the comments reach at least 60% of the
 * points. Below 20 comments the ratio is noise: 3 comments on 4 points are
 * not a debate.
 */
const HEATED_COMMENTS_PER_POINT = 0.6;
const HEATED_MIN_COMMENTS = 20;

/** Beyond this length, from `sm` up, the summary starts collapsed to 3 lines. */
const LONG_SUMMARY_CHARS = 320;

const RECENT_BAND_HOURS = 24;

const HOUR_MS = 3_600_000;

const NO_SUMMARIES: ReadonlyMap<string, string> = new Map();
const NO_PENDING_KEYS: ReadonlySet<string> = new Set();

type ItemGroup = { id: string; label: string | null; items: FeedItem[] };

export function FeedList({
  lane,
  emptyLabel,
  rowAction,
  paperQuality,
  showPendingQuality = false,
  summaries = NO_SUMMARIES,
  pendingSummaryKeys = NO_PENDING_KEYS,
  rankings,
  barMetric = "score",
  groupByAge = false,
  groupUnscored = false,
}: {
  lane: Pick<Lane, "items" | "failures">;
  emptyLabel: string;
  /** Extra action next to the bookmark, e.g. "Letto" (read) in the queue. */
  rowAction?: (item: FeedItem) => ReactNode;
  paperQuality?: ReadonlyMap<string, PaperQuality>;
  showPendingQuality?: boolean;
  /** Summary in Italian by key, only in the Papers lane. */
  summaries?: ReadonlyMap<string, string>;
  /** Papers whose summary is being generated right now. */
  pendingSummaryKeys?: ReadonlySet<string>;
  /**
   * Position of each item within its own source, computed on the whole lane and
   * not only on the visible rows: bar and "In cima a" (at the top of) stay stable
   * when the filters change. Without it, the row shows just the numbers.
   */
  rankings?: Record<SourceMetric, SourceRanking>;
  /** What the bar measures: the same criterion as the chosen ordering. */
  barMetric?: SourceMetric;
  /** Splits into "Ultime 24 ore" (last 24 hours) and "Prima" (earlier), keeping the chosen order. */
  groupByAge?: boolean;
  /**
   * Moves into a group with its own title the items without votes, which a
   * ranking by votes leaves at the bottom in feed order.
   */
  groupUnscored?: boolean;
}) {
  // A single store subscription per list, not one per row.
  const { visitedKeys, markVisited } = useVisitedItems();
  const now = useNow();
  const settingsStatus = useSettingsStatus();
  const [reading, setReading] = useState<{ item: FeedItem; tab: ReaderTab } | null>(
    null,
  );

  // The card is for signed-in users ("error" means signed in but settings
  // not loaded). For the others, and during loading, the link stays a
  // link.
  const canReadHere = settingsStatus === "ready" || settingsStatus === "error";
  const openLink = (
    item: FeedItem,
    tab: ReaderTab,
    event: MouseEvent<HTMLAnchorElement>,
  ) => {
    markVisited(item.key);
    if (!canReadHere || !isPlainClick(event)) {
      return;
    }
    if (tab === "comments" && !hasReadableDiscussion(item)) {
      return;
    }
    event.preventDefault();
    setReading({ item, tab });
  };

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
                    onOpenLink={openLink}
                    action={rowAction?.(item)}
                    quality={paperQuality?.get(item.key)}
                    isQualityPending={showPendingQuality && !paperQuality?.has(item.key)}
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

      {reading && (
        <ReaderSheet
          // A new card for each item: tab and scroll do not carry over from one to the next.
          key={reading.item.key}
          item={reading.item}
          initialTab={reading.tab}
          onClose={() => setReading(null)}
        />
      )}
    </div>
  );
}

/**
 * Ctrl/Cmd, Shift, Alt and the middle button want the new tab or the browser
 * menu: only a plain left click opens the card.
 */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/** The title of a self-post leads to the discussion: the card opens the comments. */
function titleTabOf(item: FeedItem): ReaderTab {
  return isSelfPost(item) ? "comments" : "article";
}

type OpenLink = (
  item: FeedItem,
  tab: ReaderTab,
  event: MouseEvent<HTMLAnchorElement>,
) => void;

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
 * Among papers the only ones without votes are arXiv's, and among them there
 * is no real order: the title says so, instead of letting them look like the
 * bottom of the ranking.
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
  quality,
  isQualityPending,
  onOpenLink,
  action,
  summary,
  isSummaryPending,
  scorePlace,
  bar,
  now,
}: {
  item: FeedItem;
  isVisited: boolean;
  quality?: PaperQuality;
  isQualityPending: boolean;
  /** Marks as read and, when possible, opens the card instead of the site. */
  onOpenLink: OpenLink;
  action: ReactNode;
  summary: string | null;
  isSummaryPending: boolean;
  /** Position by points within the source; null without points or without a ranking. */
  scorePlace: SourcePlace | null;
  /** Bar of the ordering criterion; null where there is no ranking. */
  bar: PlaceBarValue | null;
  now: number | null;
}) {
  const signals = signalsOf(item, scorePlace, now);
  const hasLabels = signals.length > 0 || item.tags.length > 0 || Boolean(quality) || isQualityPending;

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
        onClick={(event) => onOpenLink(item, titleTabOf(item), event)}
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
          {quality && <PaperQualityDetails paper={quality} />}
          {isQualityPending && <span className="w-full py-1 text-sm text-muted">Da valutare · analisi in attesa</span>}
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

      <Stats item={item} bar={bar} onOpenLink={onOpenLink} />

      <div className="mt-3 flex items-center justify-end border-t border-rule pr-1 [grid-area:actions] sm:-mt-2.5 sm:-mr-2.5 sm:ml-3 sm:items-start sm:self-start sm:border-0 sm:pr-0">
        <SaveToQueueButton item={item} />
        {action}
      </div>
    </li>
  );
}

/** For news the originating site, for papers whoever submitted or authored them. */
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
      {/* On mobile the summary is always whole: it is the reason to open the
          lane from the phone, and "leggi tutto" (read all) would cost one more tap. */}
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
  onOpenLink,
}: {
  item: FeedItem;
  bar: PlaceBarValue | null;
  onOpenLink: OpenLink;
}) {
  const showScore = !LANE_SOURCES.papers.includes(item.source);
  if (!showScore && !item.discussionUrl) return null;
  const isHeated = showScore && isHeatedDiscussion(item);
  const scoreUnit = LANE_SOURCES.papers.includes(item.source) ? "voti" : "punti";
  // The bar sits next to the number that decides the order.
  const barFor = (metric: SourceMetric) =>
    bar?.metric === metric ? (
      <PlaceBar value={bar} source={item.source} />
    ) : null;

  return (
    <div className="mt-3 flex min-h-11 items-center gap-x-3 border-t border-rule pl-4 text-sm whitespace-nowrap text-muted [grid-area:stats] sm:mt-2.5 sm:mr-3 sm:min-h-6 sm:self-start sm:border-0 sm:pl-0">
      {showScore && (typeof item.score === "number" ? (
        <span className="inline-flex items-center gap-3">
          {barFor("score")}
          <span>
            <span className="font-bold text-ink tabular-nums">{item.score}</span>{" "}
            {scoreUnit}
          </span>
        </span>
      ) : (
        <span>senza voti</span>
      ))}
      {item.discussionUrl && (
        <span className="inline-flex items-center gap-3">
          {barFor("commentCount")}
          <a
            href={item.discussionUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => onOpenLink(item, "comments", event)}
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
 * Where the item sits within its source on the chosen criterion: the bar is full
 * for the first, and the "top 4%" states plainly the number the list is ordered on.
 * Raw points jump from one source to another, this does not.
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
  const showPopularity = !LANE_SOURCES.papers.includes(item.source);
  if (showPopularity && scorePlace?.position === 1) {
    signals.push(`Il più votato su ${sourceName}`);
  } else if (
    showPopularity && scorePlace &&
    scorePlace.position / scorePlace.outOf <= TOP_FRACTION
  ) {
    signals.push(`In cima a ${sourceName}`);
  }
  if (showPopularity && isHeatedDiscussion(item)) {
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
