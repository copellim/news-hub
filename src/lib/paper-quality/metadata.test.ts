import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectMetadata } from "./metadata";
import { fetchPage } from "@/lib/sources/http";

vi.mock("@/lib/sources/http", () => ({ fetchPage: vi.fn() }));
const item = { key: "arxiv:2312.00752", title: "Mamba: Linear-Time Sequence Modeling with Selective State Spaces", author: "Albert Gu" };
const content = (value: unknown) => ({ value });
const imported = { id: "corr", content: { title: content(item.title), authors: content(["Albert Gu"]), pdf: content("http://arxiv.org/pdf/2312.00752v2"), venueid: content("dblp.org/journals/CORR/2023") } };
const accepted = { id: "colm", content: { title: content(item.title), authors: content(["Albert Gu"]), venueid: content("colmweb.org/COLM/2024/Conference") } };
let notes: unknown[];
let replies: unknown[];
let work: Record<string, unknown> | null;
let updates: unknown[];
let oaRetracted: boolean;
let offline: boolean;

beforeEach(() => {
  notes = [imported, accepted];
  replies = [{ id: "decision", invitations: ["colmweb.org/COLM/2024/Conference/Paper1/-/Decision"], content: { decision: content("Accept (Poster)") } }];
  work = null; updates = []; oaRetracted = false; offline = false;
  vi.stubEnv("OPENALEX_API_KEY", "");
  vi.stubEnv("SEMANTIC_SCHOLAR_API_KEY", "");
  vi.mocked(fetchPage).mockResolvedValue({ html: '<meta property="og:url" content="https://arxiv.org/abs/2312.00752v2"><meta name="citation_doi" content="10.1234/example">', finalUrl: "https://arxiv.org/abs/2312.00752", contentType: "text/html" });
  vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
    if (offline) return new Response("", { status: 429 });
    const url = new URL(input);
    if (url.hostname === "api2.openreview.net") return Response.json({ notes: url.pathname.endsWith("search") ? notes : replies });
    if (url.hostname === "api.semanticscholar.org") return new Response("", { status: 404 });
    if (url.hostname === "api.crossref.org") {
      if (url.searchParams.has("filter")) return Response.json({ message: { items: updates } });
      return work ? Response.json({ message: work }) : new Response("", { status: 404 });
    }
    if (url.hostname === "api.openalex.org") return Response.json({ id: "https://openalex.org/W1", is_retracted: oaRetracted, cited_by_count: 0, citation_normalized_percentile: { value: 0 } });
    throw new Error("Unexpected URL");
  }));
});

describe("verifica bibliografica", () => {
  it("preferisce la vera accettazione alla copia CoRR e identifica la revisione arXiv", async () => {
    const { quality, revision } = await collectMetadata(item);
    expect(quality.publication).toBe("verified");
    expect(quality.venue).toBe("colmweb.org/COLM/2024/Conference");
    expect(quality.evidence[0].url).toContain("id=colm");
    expect(revision).toBe("2312.00752v2");
    expect(quality.citations).toBe(0);
  });
  it("non scambia presenza su OpenReview, rifiuto o workshop per accettazione", async () => {
    notes = [imported];
    expect((await collectMetadata(item)).quality.publication).toBe("unverified");
    notes = [{ ...accepted, content: { ...accepted.content, venueid: content("ICLR.cc/2024/Conference/Rejected_Submission") } }];
    expect((await collectMetadata(item)).quality.publication).toBe("unverified");
    notes = [{ ...accepted, content: { ...accepted.content, venueid: content("ICLR.cc/2024/Workshop/Test") } }];
    expect((await collectMetadata(item)).quality.publication).toBe("unverified");
  });
  it("riconosce il venueid ufficiale ma non basta un titolo uguale o una decisione incoerente", async () => {
    replies = [{ invitations: ["colmweb.org/COLM/2024/Conference/Paper1/-/Decision"], content: { decision: content("Reject") } }];
    expect((await collectMetadata(item)).quality.publication).toBe("unverified");
    replies = [{ invitations: ["Fake/-/Decision"], content: { decision: content("Accept") } }];
    notes = [{ ...accepted, content: { ...accepted.content, authors: content(["Someone Else"]) } }];
    expect((await collectMetadata(item)).quality.evidence.some((evidence) => evidence.label === "OpenReview")).toBe(false);
  });
  it("verifica una pubblicazione Crossref riconosciuta ma non un DOI di preprint", async () => {
    notes = [];
    work = { DOI: "10.1234/example", type: "journal-article", "container-title": ["Journal of Machine Learning Research"] };
    expect((await collectMetadata(item)).quality.publication).toBe("verified");
    work.type = "posted-content";
    expect((await collectMetadata(item)).quality.publication).toBe("unverified");
  });
  it("segue gli aggiornamenti verso il DOI originale e distingue ritrattazioni da correzioni", async () => {
    work = { DOI: "10.1234/example", type: "journal-article", "container-title": ["Journal of Machine Learning Research"] };
    updates = [{ DOI: "10.1234/notice", "update-to": [{ DOI: "10.1234/example", type: "correction" }] }];
    expect((await collectMetadata(item)).quality.integrity).toBe("no-notice-found");
    updates = [{ DOI: "10.1234/notice", "update-to": [{ DOI: "10.1234/example", type: "retraction" }] }];
    const { quality } = await collectMetadata(item);
    expect(quality.integrity).toBe("retracted");
    expect(quality.evidence.some((evidence) => evidence.url === "https://doi.org/10.1234/notice")).toBe(true);
  });
  it("non applica al paper un avviso che riguarda un altro DOI", async () => {
    work = { DOI: "10.1234/example", type: "posted-content", "update-to": [{ DOI: "10.1234/other", type: "retraction" }] };
    expect((await collectMetadata(item)).quality.integrity).toBe("no-notice-found");
  });
  it("conserva una ritrattazione OpenAlex anche in presenza di accettazione ufficiale", async () => {
    oaRetracted = true;
    const { quality } = await collectMetadata(item);
    expect(quality.publication).toBe("verified");
    expect(quality.integrity).toBe("retracted");
  });
  it("fallimenti e rate limit restano avvisi, non giudizi negativi", async () => {
    offline = true;
    const { quality } = await collectMetadata(item);
    expect(quality.publication).toBe("unverified");
    expect(quality.integrity).toBe("unknown");
    expect(quality.warnings.length).toBeGreaterThan(0);
    expect(quality.citations).toBeNull();
  });
});
