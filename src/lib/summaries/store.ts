import "server-only";

import {
  readCachedBlobText,
  readLatestBlobText,
  updateBlobText,
} from "@/lib/blob-store";

/**
 * All summaries in a single JSONL on Blob, one line per paper, shared by
 * all users. Blob has no append: every save rewrites the file, which is
 * why it is saved once per batch and not on every paper.
 */
const SUMMARIES_PATH = "summaries.jsonl";
const JSONL_CONTENT_TYPE = "application/x-ndjson";

/**
 * An older paper never comes back into the feeds, so its summary is not
 * needed: pruning keeps the file around 2 MB instead of letting it grow by
 * ~22 MB a year, and the file is downloaded whole on every read.
 */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type SummaryOrigin = "huggingface-translation" | "abstract";

export type SummaryRecord = {
  key: string;
  text: string;
  origin: SummaryOrigin;
  model: string;
  /** Changes when the prompt changes: old lines are regenerated. */
  promptVersion: number;
  createdAt: string;
};

/** For display: from the CDN, at most a minute behind. */
export async function readCachedSummaries(): Promise<
  Map<string, SummaryRecord>
> {
  return indexByKey(parseRecords(await readCachedBlobText(SUMMARIES_PATH)));
}

/** Before generating: from the origin, so a summary just saved is not redone. */
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
 * An unreadable line is discarded on its own instead of making the whole
 * file unusable: that is the advantage of one line per paper.
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
