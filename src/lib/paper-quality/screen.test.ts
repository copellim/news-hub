import { beforeEach, describe, expect, it, vi } from "vitest";
import { screenPapers } from "./screen";
import { assessPaper } from "./assess";
import { getPaperMetadata } from "./metadata";
import { parseAssessment, type PaperQuality } from "./model";
import { readQualityRecords, saveQualityRecords, type QualityRecord } from "./store";
vi.mock("./assess", () => ({ assessPaper: vi.fn() }));
vi.mock("./metadata", () => ({ getPaperMetadata: vi.fn() }));
vi.mock("./store", async (original) => ({ ...await original<typeof import("./store")>(), readQualityRecords: vi.fn(), saveQualityRecords: vi.fn() }));
const item = { key: "arxiv:2312.00752", title: "Paper", author: "Author" };
let stored: Map<string, QualityRecord>;
let metadata: PaperQuality;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-placeholder");
  stored = new Map();
  metadata = { key: item.key, version: 1, checkedAt: new Date().toISOString(), publication: "unverified", venue: null, integrity: "unknown", citations: null, citationPercentile: null, evidence: [], warnings: [], assessment: null };
  vi.mocked(getPaperMetadata).mockImplementation(async () => ({ quality: metadata, revision: "2312.00752v2", reviewContext: "" }));
  vi.mocked(readQualityRecords).mockImplementation(async () => new Map(stored));
  vi.mocked(saveQualityRecords).mockImplementation(async (records) => { for (const record of records) stored.set(record.quality.key, record); });
  vi.mocked(assessPaper).mockImplementation(async () => parseAssessment({ kind: "theory", contribution: "Nuova dimostrazione", checks: ["claims", "validation", "reproducibility", "limitations"].map((criterion) => ({ criterion, outcome: "supported", reference: "Teorema 1, appendice A", detail: "Ipotesi e dimostrazione consultabili" })) })!);
});
describe("full screening and reuse of analyses", () => {
  it("saves the results and does not pay for the PDF again on later visits", async () => {
    await screenPapers([item]);
    await screenPapers([item]);
    expect(assessPaper).toHaveBeenCalledTimes(1);
    expect(getPaperMetadata).toHaveBeenCalledTimes(1);
  });
  it("refreshes expired metadata without paying again to read the same revision", async () => {
    await screenPapers([item]);
    stored.get(item.key)!.quality.checkedAt = new Date(Date.now() - 2 * 86400000).toISOString();
    metadata = { ...metadata, checkedAt: new Date().toISOString(), publication: "verified", venue: "TMLR" };
    const result = await screenPapers([item]);
    expect(getPaperMetadata).toHaveBeenCalledTimes(2);
    expect(assessPaper).toHaveBeenCalledTimes(1);
    expect(result[0].publication).toBe("verified");
  });
  it("reassesses new revisions or different reviews", async () => {
    await screenPapers([item]);
    stored.get(item.key)!.quality.checkedAt = new Date(Date.now() - 2 * 86400000).toISOString();
    vi.mocked(getPaperMetadata).mockResolvedValue({ quality: metadata, revision: "2312.00752v3", reviewContext: "Nuove review" });
    await screenPapers([item]);
    expect(assessPaper).toHaveBeenCalledTimes(2);
    expect(assessPaper).toHaveBeenLastCalledWith("2312.00752v3", "Nuove review");
  });
  it("does not start AI calls for retracted papers or without configuration", async () => {
    metadata.integrity = "retracted";
    expect((await screenPapers([item]))[0].integrity).toBe("retracted");
    expect(assessPaper).not.toHaveBeenCalled();
    stored.clear(); metadata.integrity = "unknown";
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const result = (await screenPapers([item]))[0];
    expect(result.assessment).toBeNull();
    expect(result.warnings.join(" ")).toContain("configurazione AI");
    expect(assessPaper).not.toHaveBeenCalled();
  });
  it("an AI error stays unverifiable and does not mutate the cached metadata", async () => {
    vi.mocked(assessPaper).mockRejectedValue(new Error("Incomplete response"));
    const result = (await screenPapers([item]))[0];
    expect(result.assessment).toBeNull();
    expect(result.warnings.length).toBe(1);
    expect(metadata.warnings).toEqual([]);
  });
  it("regenerates a legacy judgement even if the metadata is still fresh", async () => {
    await screenPapers([item]);
    stored.get(item.key)!.quality.assessment!.version = 1;
    await screenPapers([item]);
    expect(assessPaper).toHaveBeenCalledTimes(2);
    expect(stored.get(item.key)!.quality.assessment!.version).toBe(2);
  });
});
