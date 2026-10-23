"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { loadLane } from "@/app/actions";
import { ArxivCategoryFilter } from "@/components/ArxivCategoryFilter";
import { FeedList } from "@/components/FeedList";
import { useNow } from "@/lib/now";
import { usePaperSummaries } from "@/lib/paper-summaries";
import {
  useArxivCategories,
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
  sortItems,
  takePerSource,
  type Lane,
  type LaneId,
  type Period,
  type ReadFilter,
  type SortMode,
} from "@/lib/feed";

const SORT_LABELS: Record<SortMode, string> = {
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
  papers: ["ranked", "recent"],
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
  const [sortMode, setSortMode] = useState<SortMode>("ranked");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [perSource, setPerSource] = useState<number>(DEFAULT_ITEMS_PER_SOURCE);
  const { categories, toggleCategory } = useArxivCategories();
  const { visitedKeys } = useVisitedItems();
  const settingsStatus = useSettingsStatus();

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

  const visible = useMemo(
    () => ({
      ...activeLane,
      items: takePerSource(
        filterByRead(sortItems(periodItems, sortMode), readFilter, visitedKeys),
        perSource,
      ),
    }),
    [activeLane, periodItems, perSource, readFilter, sortMode, visitedKeys],
  );

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

      <FeedList
        lane={visible}
        emptyLabel={emptyLabel}
        summaries={summaries}
        pendingSummaryKeys={pendingKeys}
        rankings={rankings}
        barMetric={sortMode === "discussed" ? "commentCount" : "score"}
        // Solo per data: con una classifica le fasce la spezzerebbero, e
        // "Prima" ripartirebbe dal 100% dopo che "Ultime 24 ore" era scesa.
        groupByAge={laneId === "news" && sortMode === "recent"}
        groupUnscored={laneId === "papers" && sortMode === "ranked"}
      />
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
  isOn,
  onChange,
}: {
  isOn: boolean;
  onChange: (isOn: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      Solo non letti
      <button
        type="button"
        role="switch"
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
