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

describe("selezione dei paper", () => {
  it("ammette preprint con tutti i criteri supportati senza popolarità o citazioni", () => {
    expect(verdictOf(quality()).verdict).toBe("recommended");
  });
  it("esclude i ritrattati anche con accettazione e analisi positiva", () => {
    expect(verdictOf({ ...quality(), integrity: "retracted", publication: "verified" }).verdict).toBe("excluded");
  });
  it("tiene separati avvisi, dati mancanti, limiti e difetti sostanziali", () => {
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
  it("i limiti riconosciuti non fanno scartare un contributo supportato", () => {
    const paper = quality();
    paper.assessment!.checks[3].outcome = "limitation";
    expect(verdictOf(paper).verdict).toBe("recommended");
  });
  it("la peer review aumenta la fiducia senza rendere obbligatoria la pubblicazione", () => {
    const paper = quality();
    paper.assessment!.checks[2].outcome = "limitation";
    expect(verdictOf(paper).verdict).toBe("review");
    expect(verdictOf({ ...paper, publication: "verified" }).verdict).toBe("recommended");
    paper.assessment!.checks[0].outcome = "limitation";
    expect(verdictOf({ ...paper, publication: "verified" }).verdict).toBe("review");
  });
  it("non usa citazioni o pubblicazione per riscattare informazioni mancanti", () => {
    const paper = { ...quality(), citations: 100000, publication: "verified" as const };
    paper.assessment!.checks[0].outcome = "unknown";
    expect(verdictOf(paper).verdict).toBe("review");
  });
  it("non richiede peer review se un criterio è realmente non pertinente", () => {
    const paper = quality();
    paper.assessment!.checks[2].outcome = "na";
    expect(verdictOf(paper).verdict).toBe("recommended");
  });
  it("non riutilizza i vecchi giudizi come nuovi verdetti", () => {
    const paper = quality();
    paper.assessment!.version = 1;
    paper.assessment!.checks[1].outcome = "weak";
    expect(verdictOf(paper).verdict).toBe("review");
    paper.assessment!.checks[1].outcome = "supported";
    expect(verdictOf(paper).verdict).toBe("review");
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
  it("richiede un nesso con la conclusione principale prima di accettare fatal", () => {
    const paper = assessment(); paper.checks[1].outcome = "fatal";
    expect(parseAssessment(paper)).toBeNull();
    paper.checks[1].impact = "Il risultato centrale deriva dal test usato per scegliere il modello.";
    expect(parseAssessment(paper)).not.toBeNull();
    paper.checks[1].reference = "";
    expect(parseAssessment(paper)).toBeNull();
  });
  it("accetta weak soltanto leggendo esplicitamente una vecchia valutazione", () => {
    const paper = assessment(); paper.version = 1; paper.checks[1].outcome = "weak";
    expect(parseAssessment(paper)).toBeNull();
    expect(parseAssessment(paper, 1)?.version).toBe(1);
    expect(parseAssessment(paper, 99)).toBeNull();
  });
});

describe("preferenza di scrematura e migrazione", () => {
  it("migra v1 senza perdere categorie, segnalibri o letti e attiva il filtro", () => {
    const old = { version: 1, arxivCategories: ["cs.AI"], bookmarks: [], visited: ["arxiv:2312.00752"] };
    expect(normalizeSettings(old)).toEqual({ ...old, version: 2, paperScreening: true, paperPersonalization: true });
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

function item(key: string, source: "arxiv" | "huggingface"): FeedItem {
  return { key, source, title: key, url: "https://arxiv.org/abs/2312.00752", discussionUrl: null, score: null, commentCount: null, author: null, publishedAt: "2026-11-02T00:00:00Z", tags: [] };
}
describe("equità dei lotti e visibilità", () => {
  it("alterna le fonti anche quando il feed contiene prima tutti i paper HF", () => {
    const items = [item("h1", "huggingface"), item("h2", "huggingface"), item("h3", "huggingface"), item("a1", "arxiv"), item("a2", "arxiv")];
    expect(screeningOrder(items)).toEqual(["h1", "a1", "h2", "a2", "h3"]);
    expect(screeningOrder([...items, items[0]])).toEqual(["h1", "a1", "h2", "a2", "h3"]);
    expect(screeningOrder([])).toEqual([]);
  });
  it("mantiene visibili limiti, errori e attese, riservando l'audit ai difetti sostanziali", () => {
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
  it("alterna nuovamente dentro le fasce dopo che i verdetti hanno tolto righe intermedie", () => {
    const items = [item("h1", "huggingface"), item("a1", "arxiv"), item("h2", "huggingface"), item("a2", "arxiv"), item("h3", "huggingface"), item("a3", "arxiv")];
    const limited = quality(); limited.assessment!.checks[1].outcome = "limitation";
    const papers = new Map([["h1", quality()], ["a1", limited], ["h2", quality()], ["a2", limited], ["h3", limited], ["a3", quality()]]);
    const groups = groupScreenedPapers(items, papers, true);
    expect(groups.recommended.map((x) => x.key)).toEqual(["h1", "a3", "h2"]);
    expect(groups.review.map((x) => x.key)).toEqual(["a1", "h3", "a2"]);
    expect(groupScreenedPapers(items, papers).recommended.map((x) => x.key)).toEqual(["h1", "h2", "a3"]);
  });
});

describe("preferenza personalizzazione", () => {
  it("salva la disattivazione e la mantiene durante le migrazioni", () => {
    const operation = parseSettingsOperation({ type: "setPaperPersonalization", enabled: false })!;
    const settings = applyOperations(DEFAULT_SETTINGS, [operation]);
    expect(normalizeSettings(settings)?.paperPersonalization).toBe(false);
    expect(applyOperations(settings, [{ type: "mergeLocal", settings: DEFAULT_SETTINGS }]).paperPersonalization).toBe(false);
    expect(parseSettingsOperation({ type: "setPaperPersonalization", enabled: "false" })).toBeNull();
  });
});
