import "server-only";

import { parseHTML } from "linkedom";
import { cacheLife } from "next/cache";
import { USER_AGENT } from "@/lib/config";
import type { FeedItem } from "@/lib/feed";
import { fetchPage } from "@/lib/sources/http";
import { normalizedTitle, safeEvidenceUrl, type PaperQuality, QUALITY_VERSION } from "./model";

type CrossrefWork = {
  DOI: string; type: string; title?: string[]; "container-title"?: string[];
  "update-to"?: Array<{ type: string; DOI: string }>;
  relation?: Record<string, Array<{ id: string; "id-type": string }>>;
};
type OpenAlexWork = {
  id: string; title: string; doi?: string; is_retracted?: boolean;
  cited_by_count?: number; citation_normalized_percentile?: { value: number };
  locations?: Array<{ landing_page_url?: string }>;
};
type Note = {
  id: string; forum?: string; invitations?: string[];
  content: Record<string, { value: unknown }>;
};

// List of editorial processes we explicitly recognize, not a venue quality score.
const TRUSTED_VENUE = /^(?:Journal of Machine Learning Research|Transactions on Machine Learning Research|Transactions of the Association for Computational Linguistics|Nature Machine Intelligence|Nature Methods|Nature|Science|Proceedings of (?:the )?(?:\d+(?:st|nd|rd|th) )?(?:International Conference on Machine Learning|International Conference on Learning Representations)|Advances in Neural Information Processing Systems|.*\b(?:ACL|EMNLP|NAACL|CVPR|ICCV|ECCV|ICSE|FSE|OSDI|SOSP|PLDI|POPL|SIGMOD|VLDB)\b.*)$/i;
const TRUSTED_OPENREVIEW = /^(?:ICLR\.cc\/\d{4}\/Conference|NeurIPS\.cc\/\d{4}\/Conference|ICML\.cc\/\d{4}\/Conference|colmweb\.org\/COLM\/\d{4}\/Conference|TMLR)$/;

/** Errors never include credential-bearing URLs. A 404 is absence, not an outage. */
async function json<T>(url: URL, headers: Record<string, string> = {}): Promise<T | null> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...headers },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export type PaperMetadata = { quality: PaperQuality; revision: string; reviewContext: string };

export async function getPaperMetadata(item: Pick<FeedItem, "key" | "title" | "author">): Promise<PaperMetadata> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  return collectMetadata(item);
}

export async function collectMetadata(item: Pick<FeedItem, "key" | "title" | "author">): Promise<PaperMetadata> {
  const id = item.key.slice(6).replace(/v\d+$/, "");
  const quality: PaperQuality = {
    key: item.key, version: QUALITY_VERSION, checkedAt: new Date().toISOString(),
    publication: "unverified", venue: null, integrity: "unknown",
    citations: null, citationPercentile: null, evidence: [], warnings: [], assessment: null,
  };
  let revision = id;
  let doi: string | null = null;
  let reviewContext = "";
  const warn = (source: string, error: unknown) => {
    quality.warnings.push(`${source}: ${error instanceof Error ? error.message : "fonte non disponibile"}`);
  };
  // Exact arXiv identity from Semantic Scholar; never infer identity from title alone.
  const [arxiv, semantic, review] = await Promise.allSettled([
    fetchPage("arxiv", `https://arxiv.org/abs/${id}`),
    json<{ externalIds?: { DOI?: string }; title: string }>(
      new URL(`https://api.semanticscholar.org/graph/v1/paper/ARXIV:${id}?fields=title,externalIds`),
      process.env.SEMANTIC_SCHOLAR_API_KEY ? { "x-api-key": process.env.SEMANTIC_SCHOLAR_API_KEY } : {},
    ),
    findOpenReview(id, item.title, item.author),
  ]);
  if (arxiv.status === "fulfilled" && arxiv.value.html) {
    const { document } = parseHTML(arxiv.value.html);
    doi = document.querySelector('meta[name="citation_doi"]')?.getAttribute("content") ?? null;
    const pdf = document.querySelector('meta[name="citation_pdf_url"]')?.getAttribute("content");
    const canonical = document.querySelector('meta[property="og:url"]')?.getAttribute("content");
    revision = canonical?.match(/\d{4}\.\d{4,5}v\d+/)?.[0] ?? pdf?.match(/\d{4}\.\d{4,5}v\d+/)?.[0] ?? id;
    // A withdrawal is not automatically misconduct or a journal retraction.
    if (/this (?:paper|submission|article) has been withdrawn/i.test(document.querySelector(".comments")?.textContent ?? "")) {
      quality.integrity = "concern";
      quality.evidence.push({ label: "arXiv", url: `https://arxiv.org/abs/${id}`, detail: "Gli autori segnalano il ritiro del preprint." });
    }
  } else if (arxiv.status === "rejected") warn("arXiv", arxiv.reason);
  if (semantic.status === "fulfilled") doi ??= semantic.value?.externalIds?.DOI ?? null;
  else warn("Semantic Scholar", semantic.reason);
  if (review.status === "fulfilled" && review.value) {
    reviewContext = review.value.context;
    quality.warnings.push(...review.value.warnings);
    quality.evidence.push(...review.value.evidence);
    if (review.value.accepted) {
      quality.publication = "verified";
      quality.venue = review.value.venue;
    }
  } else if (review.status === "rejected") warn("OpenReview", review.reason);

  // DOI host is fixed; external identifiers can never choose the request destination.
  doi = doi?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "") ?? null;
  const validDoi = doi && /^10\.\d{4,9}\/\S+$/i.test(doi) ? doi : null;
  const bibliographic = await Promise.allSettled([
    validDoi ? crossref(validDoi) : Promise.resolve(null),
    openAlex(id, validDoi, item.title),
  ]);
  const cr = bibliographic[0];
  if (cr.status === "rejected") warn("Crossref", cr.reason);
  else if (cr.value) {
    let work = cr.value;
    // Follow only an explicit registered preprint relation, never a fuzzy title match.
    const publishedDoi = work.relation?.["is-preprint-of"]?.find((relation) => relation["id-type"] === "doi")?.id;
    if (publishedDoi && /^10\.\d{4,9}\/\S+$/i.test(publishedDoi)) {
      try { work = await crossref(publishedDoi) ?? work; } catch (error) { warn("Crossref versione pubblicata", error); }
    }
    const venue = work["container-title"]?.[0] ?? "";
    const url = safeEvidenceUrl(`https://doi.org/${work.DOI}`);
    if (url) quality.evidence.push({ label: "Crossref", url, detail: `${work.type}${venue ? ` · ${venue}` : ""}` });
    if (["journal-article", "proceedings-article"].includes(work.type) && TRUSTED_VENUE.test(venue) && !/workshop|abstract|editorial|preface/i.test(venue)) {
      quality.publication = "verified";
      quality.venue ??= venue;
    }
    try {
      const updatesUrl = new URL("https://api.crossref.org/works");
      updatesUrl.searchParams.set("filter", `updates:${work.DOI}`);
      updatesUrl.searchParams.set("rows", "100");
      const updates = await json<{ message: { items: CrossrefWork[] } }>(updatesUrl);
      const notices = [work, ...(updates?.message.items ?? [])];
      if (quality.integrity === "unknown") quality.integrity = "no-notice-found";
      for (const notice of notices) {
        for (const update of notice["update-to"] ?? []) {
          if (update.DOI?.toLowerCase() !== work.DOI.toLowerCase()) continue;
          const retracted = /^(?:retraction|partial_retraction|withdrawal|removal)$/.test(update.type);
          const concern = /expression.of.concern/.test(update.type);
          if (!retracted && !concern) continue;
          if (retracted) quality.integrity = "retracted";
          else if (quality.integrity !== "retracted") quality.integrity = "concern";
          quality.evidence.push({ label: "Avviso editoriale Crossref", url: `https://doi.org/${notice.DOI}`, detail: update.type });
        }
      }
    } catch (error) { warn("Crossref avvisi editoriali", error); }
  }
  const oa = bibliographic[1];
  if (oa.status === "rejected") warn("OpenAlex", oa.reason);
  else if (oa.value) {
    const work = oa.value;
    if (work.is_retracted === true) quality.integrity = "retracted";
    else if (work.is_retracted === false && quality.integrity === "unknown") quality.integrity = "no-notice-found";
    quality.citations = typeof work.cited_by_count === "number" ? work.cited_by_count : null;
    quality.citationPercentile = typeof work.citation_normalized_percentile?.value === "number" ? work.citation_normalized_percentile.value : null;
    const url = safeEvidenceUrl(work.id);
    if (url) quality.evidence.push({ label: "OpenAlex", url, detail: work.is_retracted ? "Ritrattazione registrata" : "Dati bibliografici e citazionali; assenza di segnalazioni non certifica l'integrità." });
  }
  return { quality, revision, reviewContext };
}

async function crossref(doi: string): Promise<CrossrefWork | null> {
  const result = await json<{ message: CrossrefWork }>(new URL(`https://api.crossref.org/works/${encodeURIComponent(doi)}`));
  return result?.message ?? null;
}

async function openAlex(id: string, doi: string | null, title: string): Promise<OpenAlexWork | null> {
  const url = new URL(doi ? `https://api.openalex.org/works/https://doi.org/${doi}` : "https://api.openalex.org/works");
  if (process.env.OPENALEX_API_KEY) url.searchParams.set("api_key", process.env.OPENALEX_API_KEY);
  if (doi) return json<OpenAlexWork>(url);
  url.searchParams.set("search", title);
  url.searchParams.set("per_page", "5");
  const result = await json<{ results: OpenAlexWork[] }>(url);
  return result?.results.find((work) => normalizedTitle(work.title ?? "") === normalizedTitle(title) &&
    work.locations?.some((location) => location.landing_page_url?.match(/arxiv\.org\/abs\/([^?#]+)/)?.[1]?.replace(/v\d+$/, "") === id)) ?? null;
}

async function findOpenReview(id: string, title: string, author: string | null) {
  const url = new URL("https://api2.openreview.net/notes/search");
  url.searchParams.set("term", title);
  url.searchParams.set("limit", "10");
  const result = await json<{ notes: Note[] }>(url);
  const matches = result?.notes.filter((note) => {
    const content = note.content;
    const links = [content.arxiv_id?.value, content.arxiv?.value, content.preprint?.value, content.pdf?.value];
    const exactId = links.some((value) => typeof value === "string" && new RegExp(`(?:^|/|:)${id.replace(".", "\\.")}(?:v\\d+)?(?:$|[?#])`).test(value));
    const authors = content.authors?.value;
    const exactAuthor = author && Array.isArray(authors) && authors.some((name) => typeof name === "string" && normalizedTitle(name) === normalizedTitle(author));
    return normalizedTitle(String(content.title?.value ?? "")) === normalizedTitle(title) && (exactId || exactAuthor);
  }) ?? [];
  // Search returns imported DBLP/CoRR entries alongside actual submissions.
  // Prefer a recognized accepted venue, then an actual submission over a bibliographic copy.
  const paper = matches.sort((a, b) => {
    const priority = (note: Note) => TRUSTED_OPENREVIEW.test(String(note.content.venueid?.value ?? "")) ? 2 : /^(?:dblp\.org|DBLP\.org)/i.test(String(note.content.venueid?.value ?? "")) ? 0 : 1;
    return priority(b) - priority(a);
  })[0];
  if (!paper) return null;
  const forum = new URL("https://api2.openreview.net/notes");
  forum.searchParams.set("forum", paper.forum ?? paper.id);
  forum.searchParams.set("limit", "1000");
  const venue = String(paper.content.venueid?.value ?? "");
  const baseVenue = venue.replace(/\/(?:Rejected_Submission|Withdrawn_Submission|Submission)$/, "");
  const warnings: string[] = [];
  let replies: { notes: Note[] } | null = null;
  try { replies = await json<{ notes: Note[] }>(forum); }
  catch (error) { warnings.push(`OpenReview: recensioni non disponibili (${error instanceof Error ? error.message : "errore"}).`); }
  const decisions = replies?.notes.filter((note) => note.invitations?.some((invitation) => invitation.startsWith(`${baseVenue}/`) && invitation.endsWith("/-/Decision"))) ?? [];
  // OpenReview documents the exact original venueid as the accepted state.
  // It remains authoritative when the replies endpoint requires an interactive challenge.
  const accepted = TRUSTED_OPENREVIEW.test(venue) && !decisions.some((note) => /reject|withdraw/i.test(String(note.content.decision?.value ?? "")));
  const reviews = replies?.notes.filter((note) => note.invitations?.some((invitation) => invitation.startsWith(`${baseVenue}/`) && /\/-\/(Official_Review|Meta_Review)$/.test(invitation))) ?? [];
  const context = reviews.map((note) => Object.entries(note.content)
    .filter(([key]) => /summary|strength|weakness|review|justification|recommendation/i.test(key))
    .map(([key, field]) => `${key}: ${String(field.value).slice(0, 5000)}`).join("\n")).join("\n\n").slice(0, 24000);
  return { accepted, venue, context, warnings, evidence: [{ label: "OpenReview", url: `https://openreview.net/forum?id=${encodeURIComponent(paper.forum ?? paper.id)}`, detail: `${accepted ? "Accettazione verificata dal venueid ufficiale" : "Accettazione non verificata"}; ${replies ? `${reviews.length} review/meta-review pubbliche recuperate` : "recensioni non disponibili"}. ${decisions.map((note) => String(note.content.decision?.value ?? "")).join("; ")}` }] };
}
