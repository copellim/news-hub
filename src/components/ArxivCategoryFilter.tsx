"use client";

import { ARXIV_CATEGORY_CATALOG } from "@/lib/config";

/**
 * Selezione delle categorie arXiv da leggere. Cinquanta voci sono troppe per
 * stare sempre aperte: il blocco è richiudibile e da chiuso riassume la scelta.
 * Il cambio ricarica la lista da solo, senza passare da "Aggiorna".
 */
export function ArxivCategoryFilter({
  selected,
  onToggle,
  disabled,
}: {
  selected: readonly string[];
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  const archives = groupByArchive();

  return (
    <details className="rounded border border-black/10 px-3 py-2 dark:border-white/10">
      <summary className="cursor-pointer text-xs opacity-70">
        Categorie arXiv — {summaryOf(selected)}
      </summary>

      <div className="mt-3 flex flex-col gap-3">
        {archives.map(([archive, categories]) => (
          <fieldset key={archive} className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-medium opacity-50">
              {archive}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((category) => {
                const isSelected = selected.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggle(category.id)}
                    aria-pressed={isSelected}
                    className={
                      isSelected
                        ? "rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                        : "rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10"
                    }
                  >
                    {category.label}{" "}
                    <span className="font-mono opacity-60">
                      ({category.id})
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </details>
  );
}

function summaryOf(selected: readonly string[]): string {
  if (selected.length === 0) {
    return "nessuna selezionata, arXiv non comparirà";
  }
  return `${selected.length} selezionate: ${selected.join(", ")}`;
}

function groupByArchive(): [string, typeof ARXIV_CATEGORY_CATALOG][] {
  const byArchive = new Map<string, typeof ARXIV_CATEGORY_CATALOG>();
  for (const category of ARXIV_CATEGORY_CATALOG) {
    byArchive.set(category.archive, [
      ...(byArchive.get(category.archive) ?? []),
      category,
    ]);
  }
  return [...byArchive.entries()];
}
