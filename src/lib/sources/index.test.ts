import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLane, getPaperTexts } from "./index";
import { getArxivSnapshot, getArxivTexts } from "./arxiv";
import { getHuggingFaceSnapshot, getHuggingFaceTexts } from "./huggingface";
import type { FeedItem } from "@/lib/feed";

vi.mock("./arxiv", () => ({ getArxivSnapshot: vi.fn(), getArxivTexts: vi.fn() }));
vi.mock("./huggingface", () => ({ getHuggingFaceSnapshot: vi.fn(), getHuggingFaceTexts: vi.fn() }));
const paper: FeedItem = { key: "arxiv:2611.00001", source: "arxiv", title: "Paper", url: "https://arxiv.org/abs/2611.00001", discussionUrl: null, score: null, commentCount: null, author: null, publishedAt: "2026-11-03T00:00:00Z", tags: [] };
const fetchedAt = "2026-11-03T05:00:00Z";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getHuggingFaceTexts).mockResolvedValue(new Map());
  vi.mocked(getArxivTexts).mockResolvedValue(new Map());
  vi.mocked(getArxivSnapshot).mockResolvedValue({ items: [paper], fetchedAt });
  vi.mocked(getHuggingFaceSnapshot).mockResolvedValue({ items: [{ ...paper, source: "huggingface", score: 10 }], fetchedAt });
});
describe("conteggio del feed originale", () => {
  it("distingue duplicati assegnati a HF da un feed arXiv vuoto", async () => {
    const lane = await getLane("papers");
    expect(lane.items).toHaveLength(1);
    expect(lane.items[0].source).toBe("huggingface");
    expect(lane.sourceItemCounts).toEqual({ huggingface: 1, arxiv: 1 });
  });
  it("segnala zero annunci soltanto quando la fonte ha risposto vuota", async () => {
    vi.mocked(getArxivSnapshot).mockResolvedValue({ items: [], fetchedAt });
    const lane = await getLane("papers");
    expect(lane.sourceItemCounts?.arxiv).toBe(0);
    expect(lane.failures).toEqual([]);
  });
  it("non confonde una fonte guasta con zero annunci", async () => {
    vi.mocked(getArxivSnapshot).mockRejectedValue(new Error("HTTP 503"));
    const lane = await getLane("papers");
    expect(lane.sourceItemCounts?.arxiv).toBeUndefined();
    expect(lane.failures[0].source).toBe("arxiv");
  });
  it("conserva almeno 20 per canale anche con 50 duplicati HF/arXiv", async () => {
    const candidates = Array.from({ length: 100 }, (_, i) => ({ ...paper, key: `arxiv:2611.${String(i + 1).padStart(5, "0")}` }));
    vi.mocked(getArxivSnapshot).mockResolvedValue({ items: candidates, fetchedAt });
    vi.mocked(getHuggingFaceSnapshot).mockResolvedValue({ items: candidates.slice(0, 50).map((item) => ({ ...item, source: "huggingface", score: 10 })), fetchedAt });
    const lane = await getLane("papers");
    expect(lane.items.filter((item) => item.source === "huggingface")).toHaveLength(50);
    expect(lane.items.filter((item) => item.source === "arxiv")).toHaveLength(50);
    expect(new Set(lane.items.map((item) => item.key)).size).toBe(100);
    expect(lane.notices).toEqual([]);
  });
  it("non riscarica abstract arXiv per paper già disponibili da HF", async () => {
    vi.mocked(getHuggingFaceTexts).mockResolvedValue(new Map([[paper.key, { title: paper.title, abstract: "Abstract HF", aiSummary: "Summary" }]]));
    expect((await getPaperTexts([paper.key], ["cs.AI"]))[0].abstract).toBe("Abstract HF");
    expect(getArxivTexts).not.toHaveBeenCalled();
  });
  it("idrata da arXiv soltanto le chiavi mancanti da HF", async () => {
    vi.mocked(getHuggingFaceTexts).mockResolvedValue(new Map([[paper.key, { title: paper.title, abstract: "HF", aiSummary: null }]]));
    const other = "arxiv:2611.00002";
    vi.mocked(getArxivTexts).mockResolvedValue(new Map([[other, { title: "Other", abstract: "arXiv" }]]));
    expect(await getPaperTexts([paper.key, other], ["cs.AI"])).toHaveLength(2);
    expect(getArxivTexts).toHaveBeenCalledWith(["cs.AI"], [other]);
  });
});
