import "server-only";

import { readLatestBlobText, updateBlobText } from "@/lib/blob-store";
import { METHOD_VERSION, QUALITY_VERSION, parseAssessment, safeEvidenceUrl, type PaperQuality } from "./model";

const PATH = "paper-quality.jsonl";
const DAY = 86_400_000;
export type QualityRecord = { quality: PaperQuality; revision: string; reviewFingerprint: string; title: string };

export function parseQualityRecords(text: string | null): Map<string, QualityRecord> {
  const records = new Map<string, QualityRecord>();
  for (const line of text?.split("\n") ?? []) {
    try {
      const record = JSON.parse(line) as QualityRecord;
      if (typeof record.revision === "string" && typeof record.reviewFingerprint === "string" && typeof record.title === "string" &&
          typeof record.quality?.key === "string" && record.quality.version === QUALITY_VERSION &&
          Number.isFinite(Date.parse(record.quality.checkedAt)) &&
          ["verified", "unverified"].includes(record.quality.publication) &&
          ["retracted", "concern", "no-notice-found", "unknown"].includes(record.quality.integrity) &&
          Array.isArray(record.quality.warnings) && record.quality.warnings.every((warning) => typeof warning === "string") &&
          Array.isArray(record.quality.evidence) && record.quality.evidence.every((evidence) => evidence &&
            typeof evidence.label === "string" && typeof evidence.detail === "string" && safeEvidenceUrl(evidence.url)) &&
          (record.quality.assessment === null || (record.quality.assessment &&
            Number.isFinite(Date.parse(record.quality.assessment.assessedAt)) && parseAssessment(record.quality.assessment, record.quality.assessment.version)))) {
        records.set(record.quality.key, record);
      }
    } catch { /* A damaged line does not wipe out the other results. */ }
  }
  return records;
}

export async function readQualityRecords() {
  return parseQualityRecords(await readLatestBlobText(PATH));
}

export function isFresh(record: QualityRecord, now = Date.now()): boolean {
  // Temporary errors are retried; no negative judgement is inferred from an error.
  const ttl = record.quality.warnings.length ? 15 * 60_000 : DAY;
  return now - Date.parse(record.quality.checkedAt) < ttl &&
    (!record.quality.assessment || record.quality.assessment.version === METHOD_VERSION);
}

export async function saveQualityRecords(records: QualityRecord[]) {
  if (!records.length) return;
  await updateBlobText(PATH, "application/x-ndjson", (current) => {
    const merged = parseQualityRecords(current);
    for (const record of records) merged.set(record.quality.key, record);
    return [...merged.values()].filter((record) => Date.now() - Date.parse(record.quality.checkedAt) < 30 * DAY)
      .map((record) => JSON.stringify(record)).join("\n");
  });
}
