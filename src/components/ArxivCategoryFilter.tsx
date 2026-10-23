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
    <details className="mx-1 rounded-lg border border-card-line bg-white px-4 py-3 sm:mx-4">
      <summary className="cursor-pointer text-sm text-muted">
        <span className="font-semibold text-ink">Categorie arXiv</span>:{" "}
        {summaryOf(selected)}
      </summary>

      <div className="mt-4 flex flex-col gap-4">
        {archives.map(([archive, categories]) => (
          <fieldset key={archive} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-muted">
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
                    className={`rounded-full border px-2.5 py-1 text-[13px] disabled:opacity-50 ${
                      isSelected
                        ? "border-accent bg-accent text-white"
                        : "border-tag-line text-ink hover:border-faint"
                    }`}
                  >
                    {category.label}{" "}
                    <span className={isSelected ? "text-white/75" : "text-muted"}>
                      {category.id}
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
