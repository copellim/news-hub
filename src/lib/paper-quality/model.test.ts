import { describe, expect, it } from "vitest";
import { parseAssessment, verdictOf, type MethodAssessment, type PaperQuality } from "./model";
import { applyOperations, DEFAULT_SETTINGS, normalizeSettings, parseSettingsOperation } from "@/lib/settings-model";

export function assessment(): MethodAssessment {
  return {
    version: 1, assessedAt: new Date().toISOString(), kind: "empirical", contribution: "Metodo verificabile",
    checks: ["claims", "validation", "reproducibility", "limitations"].map((criterion) => ({
      criterion: criterion as MethodAssessment["checks"][number]["criterion"], outcome: "supported", reference: "Sezione 4, tabella 2", detail: "Confronto con baseline e intervalli di confidenza.",
    })),
  };
}
export function quality(): PaperQuality {
  return { key: "arxiv:2312.00752", version: 1, checkedAt: new Date().toISOString(), publication: "unverified", venue: null, integrity: "unknown", citations: null, citationPercentile: null, evidence: [], warnings: [], assessment: assessment() };
}

describe("selezione dei paper", () => {
  it("ammette preprint con tutti i criteri supportati senza popolarità o citazioni", () => {
    expect(verdictOf(quality()).verdict).toBe("selected");
  });
  it("esclude i ritrattati anche con accettazione e analisi positiva", () => {
    expect(verdictOf({ ...quality(), integrity: "retracted", publication: "verified" }).verdict).toBe("excluded");
  });
  it("tiene separati avvisi, dati mancanti e difetti metodologici", () => {
    expect(verdictOf({ ...quality(), integrity: "concern" }).verdict).toBe("unverified");
    expect(verdictOf({ ...quality(), assessment: null, publication: "verified" }).verdict).toBe("unverified");
    const paper = quality();
    paper.assessment!.checks[1].outcome = "unknown";
    expect(verdictOf(paper).verdict).toBe("unverified");
    paper.assessment!.checks[1].outcome = "weak";
    expect(verdictOf(paper).verdict).toBe("excluded");
  });
  it("non usa citazioni per riscattare evidenze insufficienti", () => {
    const paper = { ...quality(), citations: 100000, publication: "verified" as const };
    paper.assessment!.checks[0].outcome = "unknown";
    expect(verdictOf(paper).verdict).toBe("unverified");
  });
  it("ammette non pertinenza della riproducibilità solo con pubblicazione verificata", () => {
    const paper = quality();
    paper.assessment!.checks[2].outcome = "na";
    expect(verdictOf(paper).verdict).toBe("unverified");
    expect(verdictOf({ ...paper, publication: "verified" }).verdict).toBe("selected");
  });
});

describe("validazione della lettura AI", () => {
  it("richiede quattro criteri distinti e riferimenti per giudizi sostanziali", () => {
    expect(parseAssessment(assessment())).not.toBeNull();
    const duplicate = assessment(); duplicate.checks[1] = duplicate.checks[0];
    expect(parseAssessment(duplicate)).toBeNull();
    const noReference = assessment(); noReference.checks[1].reference = "";
    expect(parseAssessment(noReference)).toBeNull();
    expect(parseAssessment({ ...assessment(), checks: [] })).toBeNull();
    expect(parseAssessment({ ...assessment(), kind: "marketing" })).toBeNull();
  });
  it("non permette di eludere validazione e limiti con non pertinente", () => {
    const paper = assessment(); paper.checks[1].outcome = "na";
    expect(parseAssessment(paper)).toBeNull();
  });
});

describe("preferenza di scrematura e migrazione", () => {
  it("migra v1 senza perdere categorie, segnalibri o letti e attiva il filtro", () => {
    const old = { version: 1, arxivCategories: ["cs.AI"], bookmarks: [], visited: ["arxiv:2312.00752"] };
    expect(normalizeSettings(old)).toEqual({ ...old, version: 2, paperScreening: true });
  });
  it("mantiene la disattivazione nelle normalizzazioni e nei merge legacy", () => {
    const settings = applyOperations(DEFAULT_SETTINGS, [{ type: "setPaperScreening", enabled: false }]);
    expect(normalizeSettings(settings)?.paperScreening).toBe(false);
    expect(applyOperations(settings, [{ type: "mergeLocal", settings: DEFAULT_SETTINGS }]).paperScreening).toBe(false);
  });
  it("rifiuta versioni future e input non booleani", () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, version: 3 })).toBeNull();
    expect(parseSettingsOperation({ type: "setPaperScreening", enabled: "false" })).toBeNull();
    expect(parseSettingsOperation({ type: "setPaperScreening", enabled: false })).toEqual({ type: "setPaperScreening", enabled: false });
  });
});
