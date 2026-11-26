import { describe, expect, it } from "vitest";
import { interleaveSources, sortItems, takePerSource, type FeedItem } from "./feed";
function item(key: string, source: "huggingface" | "arxiv", score: number | null = null): FeedItem {
  return { key, source, score, title: key, url: "https://arxiv.org/abs/2610.40728", discussionUrl: null, commentCount: null, author: null, publishedAt: "2026-11-03T00:00:00Z", tags: [] };
}
describe("paper ordering without votes", () => {
  const items = [item("hf-low", "huggingface", 1), item("hf-high", "huggingface", 1000), item("ax-1", "arxiv"), item("ax-2", "arxiv")];
  it("does not use votes as the basis of the scientific assessment", () => {
    expect(sortItems(items, "scientific").map((x) => x.key)).toEqual(["hf-low", "hf-high", "ax-1", "ax-2"]);
    expect(items.map((x) => x.key)).toEqual(["hf-low", "hf-high", "ax-1", "ax-2"]);
  });
  it("Più recenti (most recent) is chronological even if votes suggest another order", () => {
    const input = [items[1], { ...items[2], publishedAt: '2026-11-04T00:00:00Z' }];
    expect(sortItems(input, 'recent').map((x) => x.key)).toEqual(['ax-1', 'hf-high']);
  });
  it("keeps the explicit ranking of News", () => {
    expect(sortItems(items, 'ranked').map((x) => x.key)).toEqual(['hf-high', 'hf-low', 'ax-1', 'ax-2']);
  });
  it("internal alternation and per-source limits do not discard a whole channel", () => {
    expect(interleaveSources(items).map((x) => x.key)).toEqual(['hf-low', 'ax-1', 'hf-high', 'ax-2']);
    expect(takePerSource(interleaveSources(items), 1).map((x) => x.key)).toEqual(['hf-low', 'ax-1']);
    expect(interleaveSources([])).toEqual([]);
  });
});
