import "server-only";

import { createHash } from "node:crypto";
import type { FeedItem } from "@/lib/feed";
import { assessPaper } from "./assess";
import { verifyArtifacts } from "./artifacts";
import { getPaperMetadata } from "./metadata";
import { METHOD_VERSION, QUALITY_VERSION, type PaperQuality } from "./model";
import { isFresh, readQualityRecords, saveQualityRecords, type QualityRecord } from "./store";

// Coalesces concurrent requests within this worker; Blob persists across workers/deploys.
const inFlight = new Map<string, Promise<QualityRecord>>();

export async function screenPapers(items: Pick<FeedItem, "key" | "title" | "author">[]): Promise<PaperQuality[]> {
  const stored = await readQualityRecords();
  const records = await Promise.all(items.map(async (item) => {
    const existing = stored.get(item.key);
    if (existing && existing.title === item.title && isFresh(existing)) return existing;
    const pending = inFlight.get(item.key);
    if (pending) return pending;
    const promise = screenOne(item, existing).finally(() => inFlight.delete(item.key));
    inFlight.set(item.key, promise);
    return promise;
  }));
  await saveQualityRecords(records.filter((record) => stored.get(record.quality.key) !== record));
  return records.map((record) => record.quality);
}

async function screenOne(item: Pick<FeedItem, "key" | "title" | "author">, stored?: QualityRecord): Promise<QualityRecord> {
  const { quality, revision, reviewContext } = await getPaperMetadata(item);
  // Cache results must not be mutated: warnings/assessment below belong to this request.
  const result = structuredClone(quality);
  const reviewFingerprint = createHash("sha256").update(reviewContext).digest("hex");
  result.version = QUALITY_VERSION;
  if (result.integrity !== "retracted") {
    const previous = stored?.quality.assessment;
    if (/v\d+$/.test(revision) && stored?.revision === revision && stored.reviewFingerprint === reviewFingerprint && stored.title === item.title && previous?.version === METHOD_VERSION &&
        Date.now() - Date.parse(previous.assessedAt) < 30 * 86_400_000) {
      result.assessment = previous;
    } else if (!process.env.ANTHROPIC_API_KEY) {
      result.warnings.push("Analisi del PDF non disponibile: manca la configurazione AI.");
    } else {
      try { result.assessment = await assessPaper(revision, reviewContext); }
      catch (error) {
        console.error(`Analisi del paper ${item.key} fallita`, error instanceof Error ? error.name : "errore");
        result.warnings.push("Analisi del PDF non riuscita; il paper resta non verificato.");
      }
    }
  }
  if (result.assessment) {
    const artifacts = await verifyArtifacts(result.assessment);
    result.evidence.push(...artifacts.evidence);
    result.warnings.push(...artifacts.warnings);
  }
  return { quality: result, revision, reviewFingerprint, title: item.title };
}
