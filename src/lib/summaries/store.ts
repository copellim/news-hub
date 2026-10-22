import "server-only";

import {
  readCachedBlobText,
  readLatestBlobText,
  updateBlobText,
} from "@/lib/blob-store";

/**
 * Tutti i riassunti in un solo JSONL su Blob, una riga per paper, comune a
 * tutti gli utenti. Blob non ha un append: ogni salvataggio riscrive il file,
 * per questo si salva una volta per lotto e non a ogni paper.
 */
const SUMMARIES_PATH = "summaries.jsonl";
const JSONL_CONTENT_TYPE = "application/x-ndjson";

/**
 * Un paper più vecchio non torna più nei feed, quindi il suo riassunto non
 * serve: potare tiene il file intorno ai 2 MB invece di farlo crescere di
 * ~22 MB l'anno, e il file si scarica intero a ogni lettura.
 */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type SummaryOrigin = "huggingface-translation" | "abstract";

export type SummaryRecord = {
  key: string;
  text: string;
  origin: SummaryOrigin;
  model: string;
  /** Cambia quando cambia il prompt: le righe vecchie si rigenerano. */
  promptVersion: number;
  createdAt: string;
};

/** Per mostrare: dalla CDN, al massimo un minuto indietro. */
export async function readCachedSummaries(): Promise<
  Map<string, SummaryRecord>
> {
  return indexByKey(parseRecords(await readCachedBlobText(SUMMARIES_PATH)));
}

/** Prima di generare: dall'origine, per non rifare un riassunto appena salvato. */
export async function readLatestSummaries(): Promise<
  Map<string, SummaryRecord>
> {
  return indexByKey(parseRecords(await readLatestBlobText(SUMMARIES_PATH)));
}

export async function saveSummaries(
  records: readonly SummaryRecord[],
): Promise<void> {
  if (records.length === 0) {
    return;
  }
  const replacedKeys = new Set(records.map((record) => record.key));
  const oldestKept = Date.now() - RETENTION_MS;

  await updateBlobText(SUMMARIES_PATH, JSONL_CONTENT_TYPE, (current) =>
    [
      ...parseRecords(current).filter(
        (record) =>
          !replacedKeys.has(record.key) &&
          Date.parse(record.createdAt) >= oldestKept,
      ),
      ...records,
    ]
      .map((record) => JSON.stringify(record))
      .join("\n"),
  );
}

/**
 * Una riga illeggibile si scarta da sola invece di rendere inutilizzabile
 * l'intero file: è il vantaggio di una riga per paper.
 */
function parseRecords(text: string | null): SummaryRecord[] {
  if (!text) {
    return [];
  }
  return text.split("\n").flatMap((line) => {
    if (!line.trim()) {
      return [];
    }
    try {
      const record: unknown = JSON.parse(line);
      return isSummaryRecord(record) ? [record] : [];
    } catch {
      console.warn("Riga non valida in summaries.jsonl, ignorata");
      return [];
    }
  });
}

function indexByKey(
  records: readonly SummaryRecord[],
): Map<string, SummaryRecord> {
  return new Map(records.map((record) => [record.key, record]));
}

function isSummaryRecord(value: unknown): value is SummaryRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<SummaryRecord>;
  return (
    typeof candidate.key === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.model === "string" &&
    typeof candidate.promptVersion === "number" &&
    typeof candidate.createdAt === "string"
  );
}
