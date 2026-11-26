import { describe, expect, it } from "vitest";
import { METHOD_VERSION } from "./model";
import { isFresh, parseQualityRecords } from "./store";
const record = {
  revision: "2312.00752v2", title: "Paper", reviewFingerprint: "hash",
  quality: { key: "arxiv:2312.00752", version: 1, checkedAt: new Date().toISOString(), publication: "unverified" as const, venue: null, integrity: "unknown" as const, citations: null, citationPercentile: null, evidence: [], warnings: [] as string[], assessment: null },
};
describe("persistence of checks", () => {
  it("does not promote corrupt analyses and keeps the other valid lines", () => {
    const corrupt = { ...record, quality: { ...record.quality, key: "bad", assessment: { checks: [] } } };
    const result = parseQualityRecords(["broken json", JSON.stringify(corrupt), JSON.stringify(record)].join("\n"));
    expect([...result.keys()]).toEqual([record.quality.key]);
  });
  it("retries source problems sooner than ordinary metadata", () => {
    const now = Date.now();
    const aged = { ...record, quality: { ...record.quality, checkedAt: new Date(now - 3600000).toISOString() } };
    expect(isFresh(aged, now)).toBe(true);
    aged.quality.warnings = ["HTTP 429"];
    expect(isFresh(aged, now)).toBe(false);
    aged.quality.warnings = [];
    expect(isFresh(aged, now + 86400000)).toBe(false);
  });
  it("keeps legacy assessments but treats them as needing re-examination", () => {
    const old = { ...record, quality: { ...record.quality, assessment: { version: 1, assessedAt: new Date().toISOString(), kind: "empirical", contribution: "Contributo precedente", checks: ["claims", "validation", "reproducibility", "limitations"].map((criterion) => ({ criterion, outcome: "weak", reference: "Sezione 4", detail: "Giudizio precedente" })) } } };
    const loaded = parseQualityRecords(JSON.stringify(old)).get(record.quality.key)!;
    expect(loaded.quality.assessment?.version).toBe(1);
    expect(isFresh(loaded)).toBe(false);
    expect(METHOD_VERSION).toBe(2);
  });
});
