import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLane } from "./index";
import { getArxivSnapshot } from "./arxiv";
import { getHuggingFaceSnapshot } from "./huggingface";
import type { FeedItem } from "@/lib/feed";

vi.mock("./arxiv", () => ({ getArxivSnapshot: vi.fn(), getArxivTexts: vi.fn() }));
vi.mock("./huggingface", () => ({ getHuggingFaceSnapshot: vi.fn(), getHuggingFaceTexts: vi.fn() }));
const paper: FeedItem = { key: "arxiv:2611.00001", source: "arxiv", title: "Paper", url: "https://arxiv.org/abs/2611.00001", discussionUrl: null, score: null, commentCount: null, author: null, publishedAt: "2026-11-03T00:00:00Z", tags: [] };
const fetchedAt = "2026-11-03T05:00:00Z";
beforeEach(() => {
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
});
