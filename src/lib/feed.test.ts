import { describe, expect, it } from "vitest";
import { interleaveSources, sortItems, takePerSource, type FeedItem } from "./feed";
function item(key: string, source: "huggingface" | "arxiv", score: number | null = null): FeedItem {
  return { key, source, score, title: key, url: "https://arxiv.org/abs/2610.40728", discussionUrl: null, commentCount: null, author: null, publishedAt: "2026-11-03T00:00:00Z", tags: [] };
}
describe("ordine dei paper senza voti", () => {
  const items = [item("hf-low", "huggingface", 1), item("hf-high", "huggingface", 1000), item("ax-1", "arxiv"), item("ax-2", "arxiv")];
  it("non usa i voti come base della valutazione scientifica", () => {
    expect(sortItems(items, "scientific").map((x) => x.key)).toEqual(["hf-low", "hf-high", "ax-1", "ax-2"]);
    expect(items.map((x) => x.key)).toEqual(["hf-low", "hf-high", "ax-1", "ax-2"]);
  });
  it("Più recenti è cronologico anche se i voti suggeriscono un altro ordine", () => {
    const input = [items[1], { ...items[2], publishedAt: '2026-11-04T00:00:00Z' }];
    expect(sortItems(input, 'recent').map((x) => x.key)).toEqual(['ax-1', 'hf-high']);
  });
  it("mantiene il ranking esplicito delle News", () => {
    expect(sortItems(items, 'ranked').map((x) => x.key)).toEqual(['hf-high', 'hf-low', 'ax-1', 'ax-2']);
  });
  it("l'alternanza interna e i limiti per fonte non scartano un intero canale", () => {
    expect(interleaveSources(items).map((x) => x.key)).toEqual(['hf-low', 'ax-1', 'hf-high', 'ax-2']);
    expect(takePerSource(interleaveSources(items), 1).map((x) => x.key)).toEqual(['hf-low', 'ax-1']);
    expect(interleaveSources([])).toEqual([]);
  });
});
