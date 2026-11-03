"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { loadLane } from "@/app/actions";
import { ArxivCategoryFilter } from "@/components/ArxivCategoryFilter";
import { PaperQualityDetails } from "@/components/PaperQualityDetails";
import { groupScreenedPapers, screeningCounts, screeningOrder } from "@/lib/paper-quality/model";
import { useScreening } from "@/lib/paper-quality/use-screening";
import { FeedList } from "@/components/FeedList";
import { useNow } from "@/lib/now";
import { usePaperSummaries } from "@/lib/paper-summaries";
import {
  useArxivCategories,
  usePaperScreening,
  useSettingsStatus,
  useVisitedItems,
} from "@/lib/settings";
import { selectionKeyOf } from "@/lib/settings-model";
import {
  DEFAULT_ARXIV_CATEGORIES,
  DEFAULT_ITEMS_PER_SOURCE,
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
  balanced: "Equilibrato",
  ranked: "Più votati",
  discussed: "Più discussi",
  recent: "Più recenti",
};

const PERIOD_LABELS: Record<Period, string> = {
  all: "Tutte",
  day: "Ultime 24 ore",
};

/**
 * Il periodo ha senso solo sulle News: i paper di HF e arXiv escono una volta
 * al giorno e "ultime 24 ore" lascerebbe la corsia quasi vuota. Settimana e
 * mese non ci sono perché le fonti danno solo la front page attuale, che non
 * va oltre due o tre giorni.
 */
const LANE_HAS_PERIOD: Record<LaneId, boolean> = {
  news: true,
  papers: false,
};

/**
 * Sui paper i commenti sono pochi e arXiv non ne ha: "Più discussi" darebbe
 * una classifica di zeri.
 */
const LANE_SORT_MODES: Record<LaneId, readonly SortMode[]> = {
  news: ["ranked", "discussed", "recent"],
  papers: ["balanced", "ranked", "recent"],
};

/**
 * Dopo un tentativo che ha restituito ancora dati vecchi (la fonte non
 * risponde, o la cache non ha finito di rigenerarsi) non si riprova a ogni
 * tick: si aspetta qualche minuto.
 */
const FRESHNESS_COOLDOWN_MS = 2 * 60_000;

/**
 * Le cache sono stale-while-revalidate: la prima richiesta dopo una pausa
 * riceve la copia vecchia e fa partire la rigenerazione, una richiesta di
 * pochi secondi dopo trova quella nuova (verificato su Vercel: STALE, poi HIT
 * con age 3). Quindi se la risposta è ancora vecchia si riprova, poche volte.
 */
const STALE_RETRIES = 2;
const STALE_RETRY_DELAY_MS = 4_000;

/**
 * La corsia più lo scarto fra l'orologio del server e quello del client, da
 * sommare all'ora locale quando si misura l'età dei dati.
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
  const [sortMode, setSortMode] = useState<SortMode>(() => laneId === "papers" ? "balanced" : "ranked");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [perSource, setPerSource] = useState<number>(DEFAULT_ITEMS_PER_SOURCE);
  const { categories, toggleCategory } = useArxivCategories();
  const { visitedKeys } = useVisitedItems();
  const settingsStatus = useSettingsStatus();
  const { enabled: screeningEnabled, setEnabled: setScreeningEnabled } = usePaperScreening();

  const [loaded, setLoaded] = useState<Lane | null>(null);
  const [isBusy, startWork] = useTransition();

  // Il filtro compare dove serve davvero: nella corsia che contiene arXiv.
  const hasCategoryFilter = LANE_SOURCES[laneId].includes("arxiv");

  // Il render del server usa sempre le categorie di default: non sa chi è
  // l'utente. Questa è la selezione con cui i dati mostrati sono stati
  // costruiti, e serve a capire quando vanno ricaricati.
  const [loadedSelection, setLoadedSelection] = useState(() =>
    selectionKeyOf(DEFAULT_ARXIV_CATEGORIES),
  );
  const selectionKey = selectionKeyOf(categories);

  // Scarta le risposte arrivate fuori ordine: cliccando più chip di fila, la
  // prima richiesta può tornare dopo l'ultima e rimettere dati vecchi.
  const latestRequest = useRef(0);

  // Una volta caricato dal client comanda quel risultato, non la prop: il
  // render del server non conosce le categorie scelte qui.
  const activeLane = loaded ?? lane;

  // La pagina arriva dalla cache e può essere vecchia di ore: se lo è, si
  // richiede la corsia. `now` resta null fino al montaggio e scatta anche al
  // ritorno sulla scheda. Lo scarto d'orologio è noto dopo la prima risposta
  // del server; prima si assume zero.
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

  // Ordina, poi filtra per letto/non letto, poi taglia: così ogni fonte
  // contribuisce i suoi migliori N *fra quelli che restano visibili*, invece di
  // sprecare le sue N posizioni su articoli che il filtro sta per nascondere.
  // Il periodo viene prima di tutto: "i più votati delle ultime 24 ore" si
  // classificano fra loro, non contro quelli di ieri. L'ora entra nel calcolo
  // solo se serve, così la lista non si ricalcola a ogni minuto per niente.
  const periodNow = period === "day" ? now : null;
  const periodItems = useMemo(
    () =>
      periodNow === null
        ? activeLane.items
        : filterByPeriod(activeLane.items, "day", periodNow),
    [activeLane, periodNow],
  );

  const screening = useScreening(
    laneId === "papers" ? screeningOrder(activeLane.items) : [],
    categories,
    laneId === "papers" && screeningEnabled,
    settingsStatus === "ready",
    JSON.stringify(activeLane.fetchedAt),
  );
  const applyScreening = laneId === "papers" && screeningEnabled && settingsStatus === "ready";
  const candidateItems = useMemo(
    () => filterByRead(sortItems(periodItems, sortMode), readFilter, visitedKeys),
    [periodItems, sortMode, readFilter, visitedKeys],
  );
  const groups = useMemo(() => groupScreenedPapers(candidateItems, screening.papers, sortMode === "balanced"), [candidateItems, screening.papers, sortMode]);
  const counts = useMemo(() => screeningCounts(candidateItems, screening.papers), [candidateItems, screening.papers]);
  const visible = useMemo(() => ({
    ...activeLane,
    items: takePerSource(applyScreening ? [...groups.recommended, ...groups.review] : candidateItems, perSource),
  }), [activeLane, applyScreening, groups, candidateItems, perSource]);
  const visibleGroups = useMemo(() => groupScreenedPapers(visible.items, screening.papers), [visible.items, screening.papers]);

  const rankings = useMemo(
    () => ({
      score: rankWithinSource(periodItems, "score"),
      commentCount: rankWithinSource(periodItems, "commentCount"),
    }),
    [periodItems],
  );

  // Solo i paper visibili: riassumere quelli tagliati dalla pagina costerebbe
  // senza che nessuno li legga. I riassunti sono riservati a chi ha fatto
  // l'accesso, sia per leggerli sia per generarli.
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
          {/* Tab primarie di M3: etichetta e indicatore nel colore primario,
              indicatore di 3 px arrotondato in alto. */}
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
            per fonte
          </label>

          {laneId === "papers" && <UnreadOnlySwitch
            label="Scrematura scientifica"
            isOn={screeningEnabled}
            onChange={setScreeningEnabled}
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

      {laneId === "papers" && sortMode === "balanced" && (
        <p className="px-1 text-sm text-muted sm:px-4">HF e arXiv si alternano dentro ogni fascia, quando disponibili. I voti ordinano solo i paper della stessa fonte; l’assenza di voti non penalizza arXiv.</p>
      )}

      {laneId === "papers" && categories.length > 0 && activeLane.sourceItemCounts?.arxiv === 0 && (
        <p role="status" className="rounded-xl border border-rule bg-surface p-4 text-sm text-muted">arXiv non ha restituito nuovi annunci nelle categorie selezionate. Il feed è vuoto prima della scrematura: i paper non sono stati esclusi dall’analisi AI.</p>
      )}

      {laneId === "papers" && screeningEnabled && (
        <div className="rounded-xl border border-rule bg-surface p-4 text-sm leading-relaxed text-muted" aria-live="polite">
          <p>Consigliati in cima, paper da valutare visibili sotto. Sono esclusi soltanto i lavori ritrattati o con difetti sostanziali documentati dall’analisi AI. Limiti e verifiche incomplete restano espliciti.</p>
          {settingsStatus === "ready" ? <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <caption className="sr-only">Esiti della scrematura per fonte, prima del limite per fonte</caption>
                <thead><tr><th scope="col" className="py-1 pr-2">Fonte</th><th scope="col" className="px-1 py-1">Consigliati</th><th scope="col" className="px-1 py-1">Da valutare</th><th scope="col" className="px-1 py-1">Esclusi</th><th scope="col" className="py-1 pl-1">In attesa</th></tr></thead>
                <tbody>{LANE_SOURCES.papers.map((source) => {
                  const stats = counts.get(source) ?? { recommended: 0, review: 0, excluded: 0, pending: 0 };
                  return <tr key={source} className="border-t border-rule tabular-nums"><th scope="row" className="py-2 pr-2 font-semibold text-ink">{SOURCE_LABELS[source]}</th><td className="px-1">{stats.recommended}</td><td className="px-1">{stats.review}</td><td className="px-1">{stats.excluded}</td><td className="pl-1">{stats.pending}</td></tr>;
                })}</tbody>
              </table>
            </div>
            {screening.running && <p className="mt-2">Analisi in corso, alternando HF e arXiv. I paper in attesa restano visibili tra quelli da valutare; i risultati vengono salvati e riutilizzati.</p>}
            {screening.error && <p className="mt-2">{screening.error} <button type="button" className="font-semibold text-accent underline" onClick={screening.retry}>Riprova la scrematura</button></p>}
          </> : <p className="mt-2">{settingsStatus === "loading" ? "Caricamento dell’account…" : settingsStatus === "error" ? "Impostazioni dell’account non disponibili: per ora è mostrato l’elenco completo." : "Accedi per eseguire la scrematura. Per ora è mostrato l’elenco completo."}</p>}
        </div>
      )}

      {applyScreening ? <>
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
  // Pulsante segmentato di M3: contorno pieno arrotondato, il segmento scelto
  // in secondaryContainer con il segno di spunta davanti all'etichetta.
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
 * Interruttore di M3: binario di 52×32, da spento contornato con la maniglia
 * piccola, da acceso pieno nel colore primario con la maniglia grande.
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
