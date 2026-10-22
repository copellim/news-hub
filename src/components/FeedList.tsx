"use client";

import type { ReactNode } from "react";

import { SaveToQueueButton } from "@/components/SaveToQueueButton";
import { useVisitedItems } from "@/lib/settings";
import {
  hostnameOf,
  SOURCE_LABELS,
  type FeedItem,
  type Lane,
} from "@/lib/feed";

const SOURCE_ACCENTS: Record<FeedItem["source"], string> = {
  hackernews: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  lobsters: "bg-red-500/15 text-red-700 dark:text-red-300",
  reddit: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  huggingface: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  arxiv: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

const NO_SUMMARIES: ReadonlyMap<string, string> = new Map();
const NO_PENDING_KEYS: ReadonlySet<string> = new Set();

export function FeedList({
  lane,
  emptyLabel,
  rowAction,
  summaries = NO_SUMMARIES,
  pendingSummaryKeys = NO_PENDING_KEYS,
}: {
  lane: Lane;
  emptyLabel: string;
  /** Azione extra in fondo alla riga, es. "Letto" nella coda. */
  rowAction?: (item: FeedItem) => ReactNode;
  /** Riassunto in italiano per chiave, solo nella corsia Papers. */
  summaries?: ReadonlyMap<string, string>;
  /** Paper il cui riassunto si sta generando adesso. */
  pendingSummaryKeys?: ReadonlySet<string>;
}) {
  // Un solo abbonamento allo store per lista, non uno per riga.
  const { visitedKeys, markVisited } = useVisitedItems();

  return (
    <div className="flex flex-col gap-4">
      {lane.failures.map((failure) => (
        <p
          key={failure.source}
          className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          <strong>{SOURCE_LABELS[failure.source]}</strong> non risponde:{" "}
          {failure.message}
        </p>
      ))}

      {lane.items.length === 0 ? (
        <p className="py-8 text-center text-sm opacity-60">{emptyLabel}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-black/10 dark:divide-white/10">
          {lane.items.map((item, index) => (
            <FeedRow
              key={item.key}
              item={item}
              position={index + 1}
              isVisited={visitedKeys.has(item.key)}
              onVisit={markVisited}
              action={rowAction?.(item)}
              summary={summaries.get(item.key) ?? null}
              isSummaryPending={pendingSummaryKeys.has(item.key)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function FeedRow({
  item,
  position,
  isVisited,
  onVisit,
  action,
  summary,
  isSummaryPending,
}: {
  item: FeedItem;
  position: number;
  isVisited: boolean;
  onVisit: (key: string) => void;
  action: ReactNode;
  summary: string | null;
  isSummaryPending: boolean;
}) {
  const host = hostnameOf(item.url);
  return (
    <li className="flex gap-3 py-3">
      <span className="w-6 shrink-0 pt-0.5 text-right text-sm tabular-nums opacity-40">
        {position}
      </span>
      <SaveToQueueButton item={item} />
      <div className="flex min-w-0 grow flex-col gap-1">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onClick={() => onVisit(item.key)}
          className={
            isVisited
              ? "text-base leading-snug font-medium opacity-55 hover:underline"
              : "text-base leading-snug font-medium hover:underline"
          }
        >
          {item.title}
        </a>
        {summary ? (
          <p className="text-sm leading-relaxed opacity-80">{summary}</p>
        ) : (
          isSummaryPending && (
            <p className="text-xs opacity-50">riassunto in arrivo…</p>
          )
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs opacity-70">
          <span
            className={`rounded px-1.5 py-0.5 font-medium ${SOURCE_ACCENTS[item.source]}`}
          >
            {SOURCE_LABELS[item.source]}
          </span>
          {host && <span>{host}</span>}
          {typeof item.score === "number" && <span>{item.score} punti</span>}
          {isVisited && (
            <span className="rounded bg-black/10 px-1.5 py-0.5 font-medium dark:bg-white/15">
              letto
            </span>
          )}
          {item.discussionUrl && (
            <a
              href={item.discussionUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => onVisit(item.key)}
              className="hover:underline"
            >
              {item.commentCount ?? 0} commenti
            </a>
          )}
          {item.author && <span>di {item.author}</span>}
          <PublishedAt iso={item.publishedAt} />
          {item.tags.map((tag) => (
            <span key={tag} className="opacity-70">
              #{tag}
            </span>
          ))}
        </div>
      </div>
      {action}
    </li>
  );
}

/**
 * Data assoluta e non "3 ore fa": il relativo calcolato sul server sarebbe
 * congelato al momento della generazione della cache.
 */
function PublishedAt({ iso }: { iso: string }) {
  const date = new Date(iso);
  const label = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  }).format(date);
  return <time dateTime={iso}>{label}</time>;
}
