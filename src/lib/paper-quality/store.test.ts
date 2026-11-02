import { describe, expect, it } from "vitest";
import { isFresh, parseQualityRecords } from "./store";
const record = {
  revision: "2312.00752v2", title: "Paper", reviewFingerprint: "hash",
  quality: { key: "arxiv:2312.00752", version: 1, checkedAt: new Date().toISOString(), publication: "unverified" as const, venue: null, integrity: "unknown" as const, citations: null, citationPercentile: null, evidence: [], warnings: [] as string[], assessment: null },
};
describe("persistenza delle verifiche", () => {
  it("non promuove analisi corrotte e conserva le altre righe valide", () => {
    const corrupt = { ...record, quality: { ...record.quality, key: "bad", assessment: { checks: [] } } };
    const result = parseQualityRecords(["broken json", JSON.stringify(corrupt), JSON.stringify(record)].join("\n"));
    expect([...result.keys()]).toEqual([record.quality.key]);
  });
  it("riprova i problemi delle fonti prima dei metadati ordinari", () => {
    const now = Date.now();
    const aged = { ...record, quality: { ...record.quality, checkedAt: new Date(now - 3600000).toISOString() } };
    expect(isFresh(aged, now)).toBe(true);
    aged.quality.warnings = ["HTTP 429"];
    expect(isFresh(aged, now)).toBe(false);
    aged.quality.warnings = [];
    expect(isFresh(aged, now + 86400000)).toBe(false);
  });
});
