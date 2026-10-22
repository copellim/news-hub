"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { loadLane } from "@/app/actions";
import { ArxivCategoryFilter } from "@/components/ArxivCategoryFilter";
import { FeedList } from "@/components/FeedList";
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
  filterByRead,
  LANE_SOURCES,
  sortItems,
  takePerSource,
  type Lane,
  type LaneId,
  type ReadFilter,
  type SortMode,
} from "@/lib/feed";

const SORT_LABELS: Record<SortMode, string> = {
  ranked: "Punti",
  recent: "Data",
};

const READ_FILTER_LABELS: Record<ReadFilter, string> = {
  all: "Tutti",
  unread: "Non letti",
  read: "Letti",
};

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

  useEffect(() => {
    if (!hasCategoryFilter || selectionKey === loadedSelection) {
      return;
    }
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;

    startWork(async () => {
      const next = await loadLane(laneId, categories);
      if (latestRequest.current === requestId) {
        setLoaded(next);
        setLoadedSelection(selectionKey);
      }
    });
  }, [categories, hasCategoryFilter, laneId, loadedSelection, selectionKey]);

  // Una volta caricato dal client comanda quel risultato, non la prop: il
  // render del server non conosce le categorie scelte qui.
  const activeLane = loaded ?? lane;

  // Ordina, poi filtra per letto/non letto, poi taglia: così ogni fonte
  // contribuisce i suoi migliori N *fra quelli che restano visibili*, invece di
  // sprecare le sue N posizioni su articoli che il filtro sta per nascondere.
  const visible = useMemo(
    () => ({
      ...activeLane,
      items: takePerSource(
        filterByRead(
          sortItems(activeLane.items, sortMode),
          readFilter,
          visitedKeys,
        ),
        perSource,
      ),
    }),
    [activeLane, perSource, readFilter, sortMode, visitedKeys],
  );

  // Solo i paper visibili: riassumere quelli tagliati dalla pagina costerebbe
  // senza che nessuno li legga. Generare è riservato a chi ha fatto l'accesso.
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
      {hasCategoryFilter && (
        <ArxivCategoryFilter
          selected={categories}
          onToggle={toggleCategory}
          disabled={isBusy}
        />
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">Ordinamento</legend>
          <span className="opacity-60">Ordina per</span>
          {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortMode(mode)}
              aria-pressed={sortMode === mode}
              className={
                sortMode === mode
                  ? "rounded bg-foreground px-2 py-1 font-medium text-background"
                  : "rounded border border-black/15 px-2 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              }
            >
              {SORT_LABELS[mode]}
            </button>
          ))}
        </fieldset>

        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">Filtro lettura</legend>
          <span className="opacity-60">Mostra</span>
          {(Object.keys(READ_FILTER_LABELS) as ReadFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setReadFilter(filter)}
              aria-pressed={readFilter === filter}
              className={
                readFilter === filter
                  ? "rounded bg-foreground px-2 py-1 font-medium text-background"
                  : "rounded border border-black/15 px-2 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              }
            >
              {READ_FILTER_LABELS[filter]}
            </button>
          ))}
        </fieldset>

        <label className="flex items-center gap-1">
          <span className="opacity-60">Per fonte</span>
          <select
            value={perSource}
            onChange={(event) => setPerSource(Number(event.target.value))}
            className="rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
          >
            {ITEMS_PER_SOURCE_OPTIONS.map((option: number) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <span className="opacity-60">
          {isBusy ? "carico…" : `${visible.items.length} di ${activeLane.items.length}`}
        </span>
      </div>

      <FeedList
        lane={visible}
        emptyLabel={emptyLabel}
        summaries={summaries}
        pendingSummaryKeys={pendingKeys}
      />
    </div>
  );
}
