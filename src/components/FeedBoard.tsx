"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { loadLane } from "@/app/actions";
import { ArxivCategoryFilter } from "@/components/ArxivCategoryFilter";
import { PaperQualityDetails } from "@/components/PaperQualityDetails";
import { groupScreenedPapers, screeningCounts, screeningOrder } from "@/lib/paper-quality/model";
import { candidateLimit, personalizePapers } from "@/lib/paper-interest/model";
import { useInterest } from "@/lib/paper-interest/use-interest";
import { useScreening } from "@/lib/paper-quality/use-screening";
import { FeedList } from "@/components/FeedList";
import { useNow } from "@/lib/now";
import { usePaperSummaries } from "@/lib/paper-summaries";
import {
  useArxivCategories,
  useBookmarks,
  usePaperPersonalization,
  usePaperScreening,
  useSettingsStatus,
  useVisitedItems,
} from "@/lib/settings";
import { selectionKeyOf } from "@/lib/settings-model";
import {
  DEFAULT_ARXIV_CATEGORIES,
  DEFAULT_ITEMS_PER_SOURCE,
  DEFAULT_PAPERS_PER_SOURCE,
  ITEMS_PER_SOURCE_OPTIONS,
} from "@/lib/config";
import {
  filterByPeriod,
  filterByRead,
  isLaneStale,
  LANE_SOURCES,
  rankWithinSource,
  SOURCE_LABELS,
  sortItems,
  takePerSource,
  type Lane,
  type LaneId,
  type Period,
  type ReadFilter,
  type SortMode,
} from "@/lib/feed";

const SORT_LABELS: Record<SortMode, string> = {
  scientific: "Valutazione scientifica",
  ranked: "Più votati",
  discussed: "Più discussi",
  recent: "Più recenti",
};

const PERIOD_LABELS: Record<Period, string> = {
  all: "Tutte",
  day: "Ultime 24 ore",
};

/**
 * The period makes sense only on News: HF and arXiv papers come out once a
 * day and "ultime 24 ore" (last 24 hours) would leave the lane almost empty.
 * Week and month are not there because the sources give only the current
 * front page, which does not go beyond two or three days.
 */
const LANE_HAS_PERIOD: Record<LaneId, boolean> = {
  news: true,
  papers: false,
};

/**
 * On papers comments are few and arXiv has none: "Più discussi" (most
 * discussed) would give a ranking of zeros.
 */
const LANE_SORT_MODES: Record<LaneId, readonly SortMode[]> = {
  news: ["ranked", "discussed", "recent"],
  papers: ["scientific", "recent"],
};

/**
 * After an attempt that still returned old data (the source does not
 * respond, or the cache has not finished regenerating) it does not retry on
 * every tick: it waits a few minutes.
 */
const FRESHNESS_COOLDOWN_MS = 2 * 60_000;

/**
 * The caches are stale-while-revalidate: the first request after a pause
 * receives the old copy and starts the regeneration, a request a few
 * seconds later finds the new one (verified on Vercel: STALE, then HIT
 * with age 3). So if the response is still old it retries, a few times.
 */
const STALE_RETRIES = 2;
const STALE_RETRY_DELAY_MS = 4_000;

/**
 * The lane plus the offset between the server clock and the client one, to
 * add to the local time when measuring the age of the data.
 */
async function loadFreshLane(
  laneId: LaneId,
  categories: readonly string[],
): Promise<{ lane: Lane; clockOffset: number }> {
  let next = await loadLane(laneId, categories);
  for (
    let attempt = 0;
    attempt < STALE_RETRIES && isLaneStale(next.lane, next.serverNow);
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, STALE_RETRY_DELAY_MS));
    next = await loadLane(laneId, categories);
  }
  return { lane: next.lane, clockOffset: next.serverNow - Date.now() };
}

export function FeedBoard({
  lane,
  laneId,
  emptyLabel,
}: {
  lane: Lane;
  laneId: LaneId;
  emptyLabel: string;
}) {
  const [sortMode, setSortMode] = useState<SortMode>(() => laneId === "papers" ? "scientific" : "ranked");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [perSource, setPerSource] = useState<number>(() => laneId === "papers" ? DEFAULT_PAPERS_PER_SOURCE : DEFAULT_ITEMS_PER_SOURCE);
  const { categories, toggleCategory } = useArxivCategories();
  const { visitedKeys } = useVisitedItems();
  const settingsStatus = useSettingsStatus();
  const { enabled: screeningEnabled, setEnabled: setScreeningEnabled } = usePaperScreening();

  const { bookmarks } = useBookmarks();
  const { enabled: personalizationEnabled, setEnabled: setPersonalizationEnabled } = usePaperPersonalization();
  const favoriteSignature = JSON.stringify(bookmarks.filter((item) => item.source === "arxiv" || item.source === "huggingface").slice(0, 12).map(({ key, title, savedAt }) => ({ key, title, savedAt })));

  const [loaded, setLoaded] = useState<Lane | null>(null);
  const [isBusy, startWork] = useTransition();

  // The filter appears where it is really needed: in the lane that contains arXiv.
  const hasCategoryFilter = LANE_SOURCES[laneId].includes("arxiv");

  // The server render always uses the default categories: it does not know
  // who the user is. This is the selection the displayed data was built
  // with, and it serves to tell when they must be reloaded.
  const [loadedSelection, setLoadedSelection] = useState(() =>
    selectionKeyOf(DEFAULT_ARXIV_CATEGORIES),
  );
  const selectionKey = selectionKeyOf(categories);

  // Discards responses that arrive out of order: clicking several chips in a
  // row, the first request can come back after the last and put old data back.
  const latestRequest = useRef(0);

  // Once loaded from the client that result rules, not the prop: the
  // server render does not know the categories chosen here.
  const activeLane = loaded ?? lane;

  // The page comes from the cache and can be hours old: if it is, the lane
  // is requested again. `now` stays null until mount and also ticks on
  // returning to the tab. The clock offset is known after the first server
  // response; before that it is assumed to be zero.
  const now = useNow();
  const [clockOffset, setClockOffset] = useState(0);
  const isStale = now !== null && isLaneStale(activeLane, now + clockOffset);
  const lastFreshnessAttempt = useRef(0);

  useEffect(() => {
    const needsSelection = hasCategoryFilter && selectionKey !== loadedSelection;
    const needsFreshData =
      isStale &&
      now !== null &&
      now - lastFreshnessAttempt.current > FRESHNESS_COOLDOWN_MS;
    if (!needsSelection && !needsFreshData) {
      return;
    }
    if (needsFreshData) {
      lastFreshnessAttempt.current = now;
    }
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;

    startWork(async () => {
      const next = await loadFreshLane(laneId, categories);
      if (latestRequest.current === requestId) {
        setLoaded(next.lane);
        setClockOffset(next.clockOffset);
        setLoadedSelection(selectionKey);
      }
    });
  }, [
    categories,
    hasCategoryFilter,
    isStale,
    laneId,
    loadedSelection,
    now,
    selectionKey,
  ]);

  // Sort, then filter by read/unread, then cut: this way each source
  // contributes its best N *among those that stay visible*, instead of
  // wasting its N positions on articles the filter is about to hide.
  // The period comes before everything: "the most voted of the last 24 hours"
  // are ranked against each other, not against yesterday's. The time enters
  // the computation only when needed, so the list is not recomputed every
  // minute for nothing.
  const periodNow = period === "day" ? now : null;
  const periodItems = useMemo(
    () =>
      periodNow === null
        ? activeLane.items
        : filterByPeriod(activeLane.items, "day", periodNow),
    [activeLane, periodNow],
  );

  // The analysis pool is larger than the page and stays fixed during the verdicts.
  const candidateItems = useMemo(() => {
    const eligible = filterByRead(sortItems(periodItems, sortMode), readFilter, visitedKeys);
    return laneId === "papers" ? takePerSource(eligible, candidateLimit(perSource)) : eligible;
  }, [periodItems, sortMode, readFilter, visitedKeys, laneId, perSource]);
  const interest = useInterest(
    laneId === "papers" ? candidateItems.map((item) => item.key) : [], categories,
    favoriteSignature === "[]" ? "" : favoriteSignature,
    laneId === "papers" && sortMode === "scientific" && personalizationEnabled && settingsStatus === "ready",
  );
  const screening = useScreening(
    laneId === "papers" ? screeningOrder(candidateItems) : [],
    categories,
    laneId === "papers" && screeningEnabled,
    settingsStatus === "ready",
    JSON.stringify(activeLane.fetchedAt),
  );
  const applyScreening = laneId === "papers" && screeningEnabled && settingsStatus === "ready";
  const scientificView = laneId === "papers" && sortMode === "scientific";
  const groups = useMemo(() => {
    const grouped = groupScreenedPapers(candidateItems, screening.papers, sortMode === "scientific");
    if (sortMode === "scientific" && personalizationEnabled) {
      grouped.recommended = personalizePapers(grouped.recommended, interest.scores);
      grouped.review = personalizePapers(grouped.review, interest.scores);
    }
    return grouped;
  }, [candidateItems, screening.papers, sortMode, personalizationEnabled, interest.scores]);
  const counts = useMemo(() => screeningCounts(candidateItems, screening.papers), [candidateItems, screening.papers]);
  const visible = useMemo(() => ({
    ...activeLane,
    items: takePerSource(applyScreening
      ? scientificView ? [...groups.recommended, ...groups.review] : candidateItems.filter((item) => !groups.excluded.includes(item))
      : laneId === "papers" && scientificView && personalizationEnabled ? personalizePapers(candidateItems, interest.scores) : candidateItems, perSource),
  }), [activeLane, applyScreening, scientificView, groups, candidateItems, perSource, laneId, personalizationEnabled, interest.scores]);
  const visibleGroups = useMemo(() => groupScreenedPapers(visible.items, screening.papers), [visible.items, screening.papers]);

  const rankings = useMemo(
    () => ({
      score: rankWithinSource(periodItems, "score"),
      commentCount: rankWithinSource(periodItems, "commentCount"),
    }),
    [periodItems],
  );

  // Only the visible papers: summarising those cut from the page would cost
  // money without anyone reading them. Summaries are reserved for signed-in
  // users, both for reading and for generating them.
  const paperKeys = useMemo(
    () =>
      laneId === "papers" ? visible.items.map((item) => item.key) : [],
    [laneId, visible.items],
  );
  const { summaries, pendingKeys } = usePaperSummaries(
    paperKeys,
    categories,
    settingsStatus === "ready",
  );

  const listProps = {
    summaries, pendingSummaryKeys: pendingKeys, rankings,
    paperQuality: laneId === "papers" ? screening.papers : undefined,
    showPendingQuality: applyScreening,
    barMetric: sortMode === "discussed" ? "commentCount" as const : "score" as const,
    groupByAge: laneId === "news" && sortMode === "recent",
    groupUnscored: !applyScreening && laneId === "papers" && sortMode === "ranked",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-sm text-muted sm:border-b sm:border-rule sm:px-4">
        <div
          role="group"
          aria-label="Ordinamento"
          className="-ml-2.5 flex w-[calc(100%+0.625rem)] gap-1 border-b border-rule sm:w-auto sm:border-0"
        >
          {/* M3 primary tabs: label and indicator in the primary colour,
              3 px indicator rounded at the top. */}
          {LANE_SORT_MODES[laneId].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortMode(mode)}
              aria-pressed={sortMode === mode}
              className={`state-layer rounded-t-lg px-2.5 pt-2 pb-3 ${
                sortMode === mode
                  ? "font-semibold text-accent after:absolute after:inset-x-2.5 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-accent"
                  : "hover:text-ink"
              }`}
            >
              {SORT_LABELS[mode]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto sm:pb-3">
          {LANE_HAS_PERIOD[laneId] && (
            <PeriodPicker period={period} onChange={setPeriod} />
          )}

          <label className="flex items-center gap-1.5">
            <select
              value={perSource}
              onChange={(event) => setPerSource(Number(event.target.value))}
              className="h-8 rounded-lg border border-faint bg-surface px-1.5 text-ink"
            >
              {ITEMS_PER_SOURCE_OPTIONS.map((option: number) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {laneId === "papers" ? "per fonte in pagina" : "per fonte"}
          </label>

          {laneId === "papers" && <UnreadOnlySwitch
            label="Scrematura scientifica"
            isOn={screeningEnabled}
            onChange={setScreeningEnabled}
          />}
          {laneId === "papers" && <UnreadOnlySwitch
            label="Personalizza dai preferiti"
            isOn={personalizationEnabled}
            onChange={setPersonalizationEnabled}
          />}
          <UnreadOnlySwitch
            isOn={readFilter === "unread"}
            onChange={(isOn) => setReadFilter(isOn ? "unread" : "all")}
          />

          {isBusy && <span aria-live="polite">aggiorno…</span>}
        </div>
      </div>

      {hasCategoryFilter && (
        <ArxivCategoryFilter
          selected={categories}
          onToggle={toggleCategory}
          disabled={isBusy}
        />
      )}

      {laneId === "papers" && <p data-paper-candidates className="px-1 text-sm text-muted sm:px-4">
        Pool disponibile: HF {activeLane.items.filter((item) => item.source === "huggingface").length} · arXiv {activeLane.items.filter((item) => item.source === "arxiv").length}.
      </p>}

      {laneId === "papers" && <p role="status" className="px-1 text-sm text-muted sm:px-4">
        Candidati selezionati: {candidateItems.length} (fino a {candidateLimit(perSource)} per fonte).
        {personalizationEnabled && scientificView && (settingsStatus !== "ready" ? " Accedi per personalizzare dai preferiti." : favoriteSignature === "[]" ? " Salva dei paper per personalizzare i suggerimenti." : interest.error ? ` ${interest.error}` : interest.running ? " Confronto con i preferiti in corso…" : " Personalizzazione: 60% affinità, 40% scoperta; senza affinità sufficiente resta l’ordine normale.")}
      </p>}

      {laneId === "papers" && activeLane.notices?.map((notice) => (
        <p key={notice} role="status" className="rounded-xl border border-rule bg-surface p-4 text-sm text-muted">{notice}</p>
      ))}

      {laneId === "papers" && screeningEnabled && (
        <div className="rounded-xl border border-rule bg-surface p-4 text-sm leading-relaxed text-muted" aria-live="polite">
          <p>{scientificView ? "Consigliati in cima, paper da valutare visibili sotto." : "Paper ordinati per data, con valutazioni scientifiche consultabili."} Sono esclusi soltanto i lavori ritrattati o con difetti sostanziali documentati dall’analisi AI. Limiti e verifiche incomplete restano espliciti.</p>
          {settingsStatus === "ready" ? <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <caption className="mb-2 text-left text-sm">Analisi del pool: fino a {candidateLimit(perSource)} candidati per fonte, {perSource} visibili per fonte.</caption>
                <thead><tr><th scope="col" className="py-1 pr-2">Fonte</th><th scope="col" className="px-1 py-1">Consigliati</th><th scope="col" className="px-1 py-1">Da valutare</th><th scope="col" className="px-1 py-1">Esclusi</th><th scope="col" className="py-1 pl-1">In attesa</th></tr></thead>
                <tbody>{LANE_SOURCES.papers.map((source) => {
                  const stats = counts.get(source) ?? { recommended: 0, review: 0, excluded: 0, pending: 0 };
                  return <tr key={source} className="border-t border-rule tabular-nums"><th scope="row" className="py-2 pr-2 font-semibold text-ink">{SOURCE_LABELS[source]}</th><td className="px-1">{stats.recommended}</td><td className="px-1">{stats.review}</td><td className="px-1">{stats.excluded}</td><td className="pl-1">{stats.pending}</td></tr>;
                })}</tbody>
              </table>
            </div>
            {screening.running && <p className="mt-2">Analisi dei soli candidati richiesti in pagina, alternando HF e arXiv. I risultati vengono salvati e riutilizzati; non si analizza il resto del pool.</p>}
            {screening.error && <p className="mt-2">{screening.error} <button type="button" className="font-semibold text-accent underline" onClick={screening.retry}>Riprova la scrematura</button></p>}
          </> : <p className="mt-2">{settingsStatus === "loading" ? "Caricamento dell’account…" : settingsStatus === "error" ? "Impostazioni dell’account non disponibili: per ora è mostrato l’elenco completo." : "Accedi per eseguire la scrematura. Per ora è mostrato l’elenco completo."}</p>}
        </div>
      )}

      {applyScreening && scientificView ? <>
        <section className="flex flex-col gap-3" data-screening-group="recommended" aria-labelledby="recommended-papers">
          <h2 id="recommended-papers" className="px-1 text-lg font-semibold text-ink sm:px-4">Consigliati · {visibleGroups.recommended.length}</h2>
          <FeedList {...listProps} lane={{ ...visible, items: visibleGroups.recommended }} emptyLabel={screening.running ? "Le analisi sono in corso. I paper in attesa sono visibili sotto." : "Nessun consigliato tra i paper mostrati. Puoi consultare quelli da valutare."} />
        </section>
        {visibleGroups.review.length > 0 && <section className="flex flex-col gap-3" data-screening-group="review" aria-labelledby="review-papers">
          <h2 id="review-papers" className="px-1 text-lg font-semibold text-ink sm:px-4">Da valutare · {visibleGroups.review.length}</h2>
          <p className="px-1 text-sm text-muted sm:px-4">Limiti, informazioni mancanti o analisi in attesa: questi paper restano disponibili per la lettura.</p>
          <FeedList {...listProps} lane={{ items: visibleGroups.review, failures: [] }} emptyLabel="Nessun paper da valutare." />
        </section>}
      </> : <FeedList {...listProps} lane={visible} emptyLabel={emptyLabel} />}

      {applyScreening && groups.excluded.length > 0 && <details className="rounded-xl border border-rule p-4">
        <summary className="cursor-pointer text-sm font-semibold text-muted">Esclusi: {groups.excluded.length} paper · motivazioni e fonti</summary>
        <ol className="mt-4 flex flex-col gap-5">
          {groups.excluded.map((item) => <li key={item.key}>
            <a href={item.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-ink hover:underline">{item.title}</a>
            <PaperQualityDetails paper={screening.papers.get(item.key)!} />
          </li>)}
        </ol>
      </details>}
    </div>
  );
}

function PeriodPicker({
  period,
  onChange,
}: {
  period: Period;
  onChange: (period: Period) => void;
}) {
  // M3 segmented button: full rounded outline, the chosen segment in
  // secondaryContainer with the check mark in front of the label.
  return (
    <div
      role="group"
      aria-label="Periodo"
      className="flex h-8 overflow-hidden rounded-full border border-faint"
    >
      {(Object.keys(PERIOD_LABELS) as Period[]).map((option, index) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={period === option}
          className={`state-layer flex items-center gap-1 px-3 ${
            index > 0 ? "border-l border-faint" : ""
          } ${
            period === option
              ? "bg-chip font-semibold text-chip-ink"
              : "text-ink"
          }`}
        >
          {period === option && <CheckIcon />}
          {PERIOD_LABELS[option]}
        </button>
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * M3 switch: 52×32 track, outlined with the small handle when off, filled
 * in the primary colour with the large handle when on.
 */
function UnreadOnlySwitch({
  label = "Solo non letti",
  isOn,
  onChange,
}: {
  label?: string;
  isOn: boolean;
  onChange: (isOn: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      {label}
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={isOn}
        onClick={() => onChange(!isOn)}
        className={`relative h-8 w-13 shrink-0 rounded-full border-2 transition-colors duration-200 motion-reduce:transition-none ${
          isOn ? "border-accent bg-accent" : "border-faint bg-switch-off"
        }`}
      >
        <span
          aria-hidden
          className={`absolute top-1/2 -translate-y-1/2 rounded-full transition-all duration-200 motion-reduce:transition-none ${
            isOn ? "left-5.5 size-6 bg-on-accent" : "left-1.5 size-4 bg-faint"
          }`}
        />
      </button>
    </label>
  );
}
