"use client";

import { ARXIV_CATEGORY_CATALOG } from "@/lib/config";

/**
 * Selection of the arXiv categories to read. Fifty entries are too many to
 * stay always open: the block is collapsible and when closed summarises the
 * choice. A change reloads the list by itself, without going through
 * "Aggiorna" (refresh).
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
    <details className="mx-1 rounded-xl border border-card-line bg-card px-4 py-3 sm:mx-4">
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
                    // M3 filter chip: outlined when off, in
                    // secondaryContainer with the check mark when on.
                    className={`state-layer flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] disabled:opacity-50 ${
                      isSelected
                        ? "border-transparent bg-chip font-semibold text-chip-ink"
                        : "border-faint text-ink"
                    }`}
                  >
                    {isSelected && <CheckIcon />}
                    {category.label}
                    <span className={isSelected ? "font-normal" : "text-muted"}>
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
