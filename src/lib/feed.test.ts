import { describe, expect, it } from "vitest";
import { interleaveSources, sortItems, takePerSource, type FeedItem } from "./feed";

function item(key: string, source: "huggingface" | "arxiv", score: number | null = null): FeedItem {
  return { key, source, score, title: key, url: "https://arxiv.org/abs/2610.40728", discussionUrl: null, commentCount: null, author: null, publishedAt: "2026-11-03T00:00:00Z", tags: [] };
}

describe("ordine equilibrato dei paper", () => {
  const items = [item("hf-low", "huggingface", 1), item("hf-high", "huggingface", 1000), item("hf-mid", "huggingface", 20), item("ax-1", "arxiv"), item("ax-2", "arxiv")];
  it("non posiziona tutti i paper senza voti dopo quelli di HF", () => {
    expect(sortItems(items, "balanced").map((x) => x.key)).toEqual(["hf-high", "ax-1", "hf-mid", "ax-2", "hf-low"]);
  });
  it("non inventa punteggi o cambia l'ordine arXiv a parità di data", () => {
    const result = sortItems(items, "balanced");
    expect(result.filter((x) => x.source === "arxiv").map((x) => [x.key, x.score])).toEqual([["ax-1", null], ["ax-2", null]]);
    expect(items.map((x) => x.key)).toEqual(["hf-low", "hf-high", "hf-mid", "ax-1", "ax-2"]);
  });
  it("conserva Più votati come ordinamento esplicito", () => {
    expect(sortItems(items, "ranked").map((x) => x.key)).toEqual(["hf-high", "hf-mid", "hf-low", "ax-1", "ax-2"]);
  });
  it("mantiene il limite per fonte e prosegue quando una delle fonti finisce", () => {
    expect(takePerSource(sortItems(items, "balanced"), 2).map((x) => x.key)).toEqual(["hf-high", "ax-1", "hf-mid", "ax-2"]);
    expect(interleaveSources([])).toEqual([]);
    expect(interleaveSources(items.slice(0, 3)).map((x) => x.key)).toEqual(["hf-low", "hf-high", "hf-mid"]);
  });
});
