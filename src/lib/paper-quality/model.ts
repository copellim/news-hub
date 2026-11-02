import type { FeedItem } from "@/lib/feed";

/** Evidenze bibliografiche e valutazione del testo sono separate intenzionalmente. */
export type Evidence = { label: string; url: string; detail: string };
export type MethodCheck = {
  criterion: "claims" | "validation" | "reproducibility" | "limitations";
  outcome: "supported" | "limitation" | "fatal" | "unknown" | "na" | "weak";
  /** Obbligatorio per un difetto sostanziale: perché compromette il risultato principale. */
  impact?: string;
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
export type Verdict = "recommended" | "review" | "excluded";
export const QUALITY_VERSION = 1;
export const METHOD_VERSION = 2;
export const PAPER_KEY = /^arxiv:(\d{4}\.\d{4,5})(?:v\d+)?$/;

export function verdictOf(paper: PaperQuality): { verdict: Verdict; reason: string } {
  if (paper.integrity === "retracted") return { verdict: "excluded", reason: "Ritrattazione segnalata dalla fonte bibliografica." };
  const assessment = paper.assessment;
  if (!assessment) return { verdict: "review", reason: "Analisi del testo completo non disponibile: non è un giudizio negativo sul paper." };
  if (assessment.version !== METHOD_VERSION) return { verdict: "review", reason: "Valutazione precedente da riesaminare con i criteri aggiornati." };
  const checks = assessment.checks;
  const fatal = checks.find((check) => check.outcome === "fatal");
  if (fatal) return { verdict: "excluded", reason: `L'analisi AI segnala un difetto sostanziale: ${fatal.impact}` };
  if (paper.integrity === "concern") return { verdict: "review", reason: "Segnalazione editoriale da verificare." };
  if (checks.some((check) => check.outcome === "unknown" || check.outcome === "weak")) {
    return { verdict: "review", reason: "Alcuni aspetti restano da verificare; il paper rimane visibile." };
  }
  const coreSupported = ["claims", "validation"].every((criterion) => checks.some((check) => check.criterion === criterion && check.outcome === "supported"));
  const reproduction = checks.find((check) => check.criterion === "reproducibility");
  const reproducible = reproduction?.outcome === "supported" || reproduction?.outcome === "na";
  // Peer review adds confidence to a limited verification path; it cannot rescue invalid core evidence.
  if (coreSupported && (reproducible || (paper.publication === "verified" && reproduction?.outcome === "limitation")) && assessment.kind !== "other") {
    return { verdict: "recommended", reason: paper.publication === "verified"
      ? "Contributo e risultati supportati nel testo, con pubblicazione verificata. Consulta gli eventuali limiti."
      : "Preprint con contributo e risultati supportati e metodo ricostruibile; peer review non verificata." };
  }
  return { verdict: "review", reason: "Contributo da valutare alla luce dei limiti documentati; nessun difetto sostanziale rilevato." };
}

/** Round robin per fonte: i primi due paper di un lotto provengono da HF e arXiv, quando disponibili. */
export function screeningOrder(items: readonly FeedItem[]): string[] {
  const queues = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    const queue = queues.get(item.source) ?? [];
    queue.push(item.key);
    queues.set(item.source, queue);
  }
  const ordered: string[] = [];
  const lists = [...queues.values()];
  for (let index = 0; lists.some((list) => index < list.length); index++) {
    for (const list of lists) if (list[index]) ordered.push(list[index]);
  }
  return ordered;
}

/** Preserva l'ordine scelto dentro ogni fascia e tiene visibili anche analisi mancanti o fallite. */
export function groupScreenedPapers(items: readonly FeedItem[], papers: ReadonlyMap<string, PaperQuality>) {
  const groups: Record<Verdict, FeedItem[]> = { recommended: [], review: [], excluded: [] };
  const pending: FeedItem[] = [];
  for (const item of items) {
    const paper = papers.get(item.key);
    if (!paper) pending.push(item);
    else groups[verdictOf(paper).verdict].push(item);
  }
  groups.review.push(...pending);
  return groups;
}

export function screeningCounts(items: readonly FeedItem[], papers: ReadonlyMap<string, PaperQuality>) {
  const counts = new Map<string, { recommended: number; review: number; excluded: number; pending: number }>();
  for (const item of items) {
    const stats = counts.get(item.source) ?? { recommended: 0, review: 0, excluded: 0, pending: 0 };
    const paper = papers.get(item.key);
    if (paper) stats[verdictOf(paper).verdict]++;
    else stats.pending++;
    counts.set(item.source, stats);
  }
  return counts;
}

export function parseAssessment(value: unknown, version = METHOD_VERSION): MethodAssessment | null {
  if (![1, METHOD_VERSION].includes(version) || !value || typeof value !== "object") return null;
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
        !(version === 1 ? ["supported", "weak", "unknown", "na"] : ["supported", "limitation", "fatal", "unknown", "na"]).includes(check.outcome) ||
        typeof check.detail !== "string" || !check.detail.trim() || check.detail.length > 2000 ||
        typeof check.reference !== "string" || check.reference.length > 400 ||
        (["supported", "weak", "fatal", "limitation"].includes(check.outcome) && !check.reference.trim()) ||
        (check.criterion !== "reproducibility" && check.outcome === "na") ||
        (check.outcome === "fatal" && (typeof check.impact !== "string" || !check.impact.trim() || check.impact.length > 1600))) return null;
  }
  return { ...candidate, version, assessedAt: new Date().toISOString() };
}

export function normalizedTitle(title: string): string {
  return title.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Solo URL web: nessun link restituito dalle fonti o dall'AI diventa codice. */
export function safeEvidenceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; } catch { return null; }
}
