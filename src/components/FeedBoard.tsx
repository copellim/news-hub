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
  maxPerSource,
  sortItems,
  takePerSource,
  type Lane,
  type LaneId,
  type ReadFilter,
  type SortMode,
} from "@/lib/feed";

const SORT_LABELS: Record<SortMode, string> = {
  ranked: "Più votati",
  discussed: "Più discussi",
  recent: "Più recenti",
};

/**
 * Sui paper i commenti sono pochi e arXiv non ne ha: "Più discussi" darebbe
 * una classifica di zeri.
 */
const LANE_SORT_MODES: Record<LaneId, readonly SortMode[]> = {
  news: ["ranked", "discussed", "recent"],
  papers: ["ranked", "recent"],
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

  const scoreMaxBySource = useMemo(
    () => maxPerSource(activeLane.items, "score"),
    [activeLane],
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
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-sm text-muted sm:border-b sm:border-rule sm:px-4">
        <div
          role="group"
          aria-label="Ordinamento"
          className="flex w-full gap-5 border-b border-rule sm:w-auto sm:border-0"
        >
          {LANE_SORT_MODES[laneId].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortMode(mode)}
              aria-pressed={sortMode === mode}
              className={`pt-1 pb-3 ${
                sortMode === mode
                  ? "font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-accent)]"
                  : "hover:text-ink"
              }`}
            >
              {SORT_LABELS[mode]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 sm:ml-auto sm:pb-3">
          <label className="flex items-center gap-1.5">
            <select
              value={perSource}
              onChange={(event) => setPerSource(Number(event.target.value))}
              className="rounded-md border border-tag-line bg-surface px-1.5 py-1 text-ink"
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

          {isBusy && <span aria-live="polite">carico…</span>}
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
        scoreMaxBySource={scoreMaxBySource}
        groupByAge={laneId === "news"}
      />
    </div>
  );
}

function UnreadOnlySwitch({
  isOn,
  onChange,
}: {
  isOn: boolean;
  onChange: (isOn: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      Solo non letti
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        onClick={() => onChange(!isOn)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          isOn ? "bg-accent" : "bg-switch-off"
        }`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 size-4 rounded-full bg-white transition-[left] motion-reduce:transition-none ${
            isOn ? "left-4.5" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}
