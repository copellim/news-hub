"use client";

import { useRef, useState } from "react";

import { downloadTextFile } from "@/lib/downloadFile";
import {
  exportSettings,
  importSettings,
  settingsFileName,
  type Settings,
} from "@/lib/settings";

const BUTTON_CLASS =
  "rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

/**
 * Import/export dell'unico oggetto che l'app tiene nel browser: categorie,
 * segnalibri e articoli letti. L'import **sovrascrive** tutto: è un ripristino,
 * non una fusione.
 */
export function SettingsBackup() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<string | null>(null);

  async function restore(file: File) {
    try {
      setReport(describe(importSettings(await file.text())));
    } catch (error) {
      setReport(
        `Import fallito: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        title="Scarica categorie, segnalibri e articoli letti in un file JSON"
        onClick={() =>
          downloadTextFile(
            settingsFileName(new Date()),
            exportSettings(),
            "application/json;charset=utf-8",
          )
        }
        className={BUTTON_CLASS}
      >
        Esporta
      </button>

      <button
        type="button"
        title="Ripristina da un file JSON: sovrascrive le impostazioni attuali"
        onClick={() => fileInput.current?.click()}
        className={BUTTON_CLASS}
      >
        Importa
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void restore(file);
          }
          // Permette di reimportare lo stesso file due volte di seguito.
          event.target.value = "";
        }}
      />

      {report && (
        <span className="text-xs opacity-60" role="status">
          {report}
        </span>
      )}
    </div>
  );
}

function describe(settings: Settings): string {
  return [
    plural(settings.bookmarks.length, "segnalibro", "segnalibri"),
    plural(settings.arxivCategories.length, "categoria", "categorie"),
    plural(settings.visited.length, "letto", "letti"),
  ].join(", ");
}

function plural(count: number, singular: string, many: string): string {
  return `${count} ${count === 1 ? singular : many}`;
}
