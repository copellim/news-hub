import { describe, expect, it } from "vitest";
import { parseAssessment, verdictOf, METHOD_VERSION, groupScreenedPapers, screeningCounts, screeningOrder, type MethodAssessment, type PaperQuality } from "./model";
import type { FeedItem } from "@/lib/feed";
import { applyOperations, DEFAULT_SETTINGS, normalizeSettings, parseSettingsOperation } from "@/lib/settings-model";

export function assessment(): MethodAssessment {
  return {
    version: METHOD_VERSION, assessedAt: new Date().toISOString(), kind: "empirical", contribution: "Metodo verificabile",
    checks: ["claims", "validation", "reproducibility", "limitations"].map((criterion) => ({
      criterion: criterion as MethodAssessment["checks"][number]["criterion"], outcome: "supported", reference: "Sezione 4, tabella 2", detail: "Confronto con baseline e intervalli di confidenza.",
    })),
  };
}
export function quality(): PaperQuality {
  return { key: "arxiv:2312.00752", version: 1, checkedAt: new Date().toISOString(), publication: "unverified", venue: null, integrity: "unknown", citations: null, citationPercentile: null, evidence: [], warnings: [], assessment: assessment() };
}

describe("paper selection", () => {
  it("admits preprints with all criteria supported without popularity or citations", () => {
    expect(verdictOf(quality()).verdict).toBe("recommended");
  });
  it("excludes retracted papers even with acceptance and a positive analysis", () => {
    expect(verdictOf({ ...quality(), integrity: "retracted", publication: "verified" }).verdict).toBe("excluded");
  });
  it("keeps notices, missing data, limitations and substantive flaws separate", () => {
    expect(verdictOf({ ...quality(), integrity: "concern" }).verdict).toBe("review");
    expect(verdictOf({ ...quality(), assessment: null, publication: "verified" }).verdict).toBe("review");
    const paper = quality();
    paper.assessment!.checks[1].outcome = "unknown";
    expect(verdictOf(paper).verdict).toBe("review");
    paper.assessment!.checks[1].outcome = "limitation";
    expect(verdictOf(paper).verdict).toBe("review");
    paper.assessment!.checks[1].outcome = "fatal";
    paper.assessment!.checks[1].impact = "Il test è stato usato nel tuning: l'unica misura di generalizzazione non è indipendente.";
    expect(verdictOf(paper).verdict).toBe("excluded");
    expect(verdictOf({ ...paper, publication: "verified" }).verdict).toBe("excluded");
  });
  it("acknowledged limitations do not discard a supported contribution", () => {
    const paper = quality();
    paper.assessment!.checks[3].outcome = "limitation";
    expect(verdictOf(paper).verdict).toBe("recommended");
  });
  it("peer review increases confidence without making publication mandatory", () => {
    const paper = quality();
    paper.assessment!.checks[2].outcome = "limitation";
    expect(verdictOf(paper).verdict).toBe("review");
    expect(verdictOf({ ...paper, publication: "verified" }).verdict).toBe("recommended");
    paper.assessment!.checks[0].outcome = "limitation";
    expect(verdictOf({ ...paper, publication: "verified" }).verdict).toBe("review");
  });
  it("does not use citations or publication to make up for missing information", () => {
    const paper = { ...quality(), citations: 100000, publication: "verified" as const };
    paper.assessment!.checks[0].outcome = "unknown";
    expect(verdictOf(paper).verdict).toBe("review");
  });
  it("does not require peer review if a criterion is genuinely not applicable", () => {
    const paper = quality();
    paper.assessment!.checks[2].outcome = "na";
    expect(verdictOf(paper).verdict).toBe("recommended");
  });
  it("does not reuse old judgements as new verdicts", () => {
    const paper = quality();
    paper.assessment!.version = 1;
    paper.assessment!.checks[1].outcome = "weak";
    expect(verdictOf(paper).verdict).toBe("review");
    paper.assessment!.checks[1].outcome = "supported";
    expect(verdictOf(paper).verdict).toBe("review");
  });
});

describe("validation of the AI reading", () => {
  it("requires four distinct criteria and references for substantive judgements", () => {
    expect(parseAssessment(assessment())).not.toBeNull();
    const duplicate = assessment(); duplicate.checks[1] = duplicate.checks[0];
    expect(parseAssessment(duplicate)).toBeNull();
    const noReference = assessment(); noReference.checks[1].reference = "";
    expect(parseAssessment(noReference)).toBeNull();
    expect(parseAssessment({ ...assessment(), checks: [] })).toBeNull();
    expect(parseAssessment({ ...assessment(), kind: "marketing" })).toBeNull();
  });
  it("does not allow dodging validation and limitations with not applicable", () => {
    const paper = assessment(); paper.checks[1].outcome = "na";
    expect(parseAssessment(paper)).toBeNull();
  });
  it("requires a link to the main conclusion before accepting fatal", () => {
    const paper = assessment(); paper.checks[1].outcome = "fatal";
    expect(parseAssessment(paper)).toBeNull();
    paper.checks[1].impact = "Il risultato centrale deriva dal test usato per scegliere il modello.";
    expect(parseAssessment(paper)).not.toBeNull();
    paper.checks[1].reference = "";
    expect(parseAssessment(paper)).toBeNull();
  });
  it("accepts weak only when explicitly reading an old assessment", () => {
    const paper = assessment(); paper.version = 1; paper.checks[1].outcome = "weak";
    expect(parseAssessment(paper)).toBeNull();
    expect(parseAssessment(paper, 1)?.version).toBe(1);
    expect(parseAssessment(paper, 99)).toBeNull();
  });
});

describe("screening preference and migration", () => {
  it("migrates v1 without losing categories, bookmarks or read items and turns on the filter", () => {
    const old = { version: 1, arxivCategories: ["cs.AI"], bookmarks: [], visited: ["arxiv:2312.00752"] };
    expect(normalizeSettings(old)).toEqual({ ...old, version: 2, paperScreening: true, paperPersonalization: true });
  });
  it("keeps it turned off through normalizations and legacy merges", () => {
    const settings = applyOperations(DEFAULT_SETTINGS, [{ type: "setPaperScreening", enabled: false }]);
    expect(normalizeSettings(settings)?.paperScreening).toBe(false);
    expect(applyOperations(settings, [{ type: "mergeLocal", settings: DEFAULT_SETTINGS }]).paperScreening).toBe(false);
  });
  it("rejects future versions and non-boolean input", () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, version: 3 })).toBeNull();
    expect(parseSettingsOperation({ type: "setPaperScreening", enabled: "false" })).toBeNull();
    expect(parseSettingsOperation({ type: "setPaperScreening", enabled: false })).toEqual({ type: "setPaperScreening", enabled: false });
  });
});

function item(key: string, source: "arxiv" | "huggingface"): FeedItem {
  return { key, source, title: key, url: "https://arxiv.org/abs/2312.00752", discussionUrl: null, score: null, commentCount: null, author: null, publishedAt: "2026-11-02T00:00:00Z", tags: [] };
}
describe("batch fairness and visibility", () => {
  it("alternates sources even when the feed lists all HF papers first", () => {
    const items = [item("h1", "huggingface"), item("h2", "huggingface"), item("h3", "huggingface"), item("a1", "arxiv"), item("a2", "arxiv")];
    expect(screeningOrder(items)).toEqual(["h1", "a1", "h2", "a2", "h3"]);
    expect(screeningOrder([...items, items[0]])).toEqual(["h1", "a1", "h2", "a2", "h3"]);
    expect(screeningOrder([])).toEqual([]);
  });
  it("keeps limitations, errors and pending papers visible, reserving the audit for substantive flaws", () => {
    const items = [item("pending", "arxiv"), item("limit", "arxiv"), item("good", "huggingface"), item("fatal", "huggingface"), item("failed", "arxiv")];
    const limit = quality(); limit.assessment!.checks[1].outcome = "limitation";
    const fatal = quality(); fatal.assessment!.checks[1].outcome = "fatal"; fatal.assessment!.checks[1].impact = "Conclusione non supportata";
    const papers = new Map([["limit", limit], ["good", quality()], ["fatal", fatal], ["failed", { ...quality(), assessment: null }]]);
    const groups = groupScreenedPapers(items, papers);
    expect(groups.recommended.map((x) => x.key)).toEqual(["good"]);
    expect(groups.review.map((x) => x.key)).toEqual(["limit", "failed", "pending"]);
    expect(groups.excluded.map((x) => x.key)).toEqual(["fatal"]);
    expect(screeningCounts(items, papers).get("arxiv")).toEqual({ recommended: 0, review: 2, excluded: 0, pending: 1 });
    expect(screeningCounts(items, papers).get("huggingface")).toEqual({ recommended: 1, review: 0, excluded: 1, pending: 0 });
  });
  it("alternates again within the tiers after verdicts have removed rows in between", () => {
    const items = [item("h1", "huggingface"), item("a1", "arxiv"), item("h2", "huggingface"), item("a2", "arxiv"), item("h3", "huggingface"), item("a3", "arxiv")];
    const limited = quality(); limited.assessment!.checks[1].outcome = "limitation";
    const papers = new Map([["h1", quality()], ["a1", limited], ["h2", quality()], ["a2", limited], ["h3", limited], ["a3", quality()]]);
    const groups = groupScreenedPapers(items, papers, true);
    expect(groups.recommended.map((x) => x.key)).toEqual(["h1", "a3", "h2"]);
    expect(groups.review.map((x) => x.key)).toEqual(["a1", "h3", "a2"]);
    expect(groupScreenedPapers(items, papers).recommended.map((x) => x.key)).toEqual(["h1", "h2", "a3"]);
  });
});

describe("personalization preference", () => {
  it("saves it turned off and keeps it that way through migrations", () => {
    const operation = parseSettingsOperation({ type: "setPaperPersonalization", enabled: false })!;
    const settings = applyOperations(DEFAULT_SETTINGS, [operation]);
    expect(normalizeSettings(settings)?.paperPersonalization).toBe(false);
    expect(applyOperations(settings, [{ type: "mergeLocal", settings: DEFAULT_SETTINGS }]).paperPersonalization).toBe(false);
    expect(parseSettingsOperation({ type: "setPaperPersonalization", enabled: "false" })).toBeNull();
  });
});
