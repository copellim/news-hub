/** Evidenze bibliografiche e valutazione del testo sono separate intenzionalmente. */
export type Evidence = { label: string; url: string; detail: string };
export type MethodCheck = {
  criterion: "claims" | "validation" | "reproducibility" | "limitations";
  outcome: "supported" | "weak" | "unknown" | "na";
  reference: string;
  detail: string;
};
export type MethodAssessment = {
  version: number;
  assessedAt: string;
  kind: "empirical" | "theory" | "survey" | "other";
  contribution: string;
  checks: MethodCheck[];
  artifacts?: Array<{ url: string; kind: "code" | "model" | "dataset"; reference: string }>;
};
export type PaperQuality = {
  key: string;
  version: number;
  checkedAt: string;
  publication: "verified" | "unverified";
  venue: string | null;
  integrity: "retracted" | "concern" | "no-notice-found" | "unknown";
  citations: number | null;
  citationPercentile: number | null;
  evidence: Evidence[];
  warnings: string[];
  assessment: MethodAssessment | null;
};
export type Verdict = "selected" | "excluded" | "unverified";
export const QUALITY_VERSION = 1;
export const METHOD_VERSION = 1;
export const PAPER_KEY = /^arxiv:(\d{4}\.\d{4,5})(?:v\d+)?$/;

export function verdictOf(paper: PaperQuality): { verdict: Verdict; reason: string } {
  if (paper.integrity === "retracted") return { verdict: "excluded", reason: "Ritrattazione segnalata dalla fonte bibliografica." };
  if (paper.integrity === "concern") return { verdict: "unverified", reason: "Segnalazione editoriale da verificare." };
  const assessment = paper.assessment;
  if (!assessment) return { verdict: "unverified", reason: "Valutazione del testo completo non disponibile." };
  const checks = assessment.checks;
  if (checks.some((check) => check.outcome === "weak")) {
    return { verdict: "excluded", reason: "La lettura AI segnala debolezze metodologiche: consulta le evidenze." };
  }
  if (checks.some((check) => check.outcome === "unknown")) {
    return { verdict: "unverified", reason: "Il testo non offre evidenze sufficienti per completare la selezione." };
  }
  // Non bastano prestigio, numero di citazioni, voti o presenza di un repository.
  if (paper.publication === "verified") return { verdict: "selected", reason: "Pubblicazione verificata e criteri metodologici supportati nel testo." };
  if (checks.every((check) => check.outcome === "supported")) {
    return { verdict: "selected", reason: "Preprint promettente: criteri supportati nel testo; peer review non verificata." };
  }
  return { verdict: "unverified", reason: "Peer review non verificata e criteri del preprint incompleti." };
}

export function parseAssessment(value: unknown): MethodAssessment | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as MethodAssessment;
  if (!["empirical", "theory", "survey", "other"].includes(candidate.kind) ||
      typeof candidate.contribution !== "string" || !candidate.contribution.trim() || candidate.contribution.length > 1600 ||
      !Array.isArray(candidate.checks) || candidate.checks.length !== 4) return null;
  if (candidate.artifacts !== undefined && (!Array.isArray(candidate.artifacts) || candidate.artifacts.length > 5 ||
      candidate.artifacts.some((artifact) => !artifact || !safeEvidenceUrl(artifact.url) ||
        !["code", "model", "dataset"].includes(artifact.kind) || typeof artifact.reference !== "string" ||
        !artifact.reference.trim() || artifact.reference.length > 400))) return null;
  const criteria = new Set(["claims", "validation", "reproducibility", "limitations"]);
  for (const check of candidate.checks) {
    if (!check || !criteria.delete(check.criterion) ||
        !["supported", "weak", "unknown", "na"].includes(check.outcome) ||
        typeof check.detail !== "string" || !check.detail.trim() || check.detail.length > 2000 ||
        typeof check.reference !== "string" || check.reference.length > 400 ||
        ((check.outcome === "supported" || check.outcome === "weak") && !check.reference.trim()) ||
        (check.criterion !== "reproducibility" && check.outcome === "na")) return null;
  }
  return { ...candidate, version: METHOD_VERSION, assessedAt: new Date().toISOString() };
}

export function normalizedTitle(title: string): string {
  return title.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Solo URL web: nessun link restituito dalle fonti o dall'AI diventa codice. */
export function safeEvidenceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; } catch { return null; }
}
