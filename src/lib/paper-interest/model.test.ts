import { describe, expect, it } from "vitest";
import { candidateLimit, personalizePapers } from "./model";
import type { FeedItem } from "@/lib/feed";
const items = Array.from({ length: 20 }, (_, i) => ({ key: String(i), source: "arxiv" } as FeedItem));

describe("paper interest mixing", () => {
  it("expands the screening pool independently of the page size", () => {
    expect(candidateLimit(10)).toBe(30);
    expect(candidateLimit(50)).toBe(50);
  });
  it("reserves baseline discovery picks before affinity can consume them", () => {
    const scores = Object.fromEntries(items.map((item, i) => [item.key, i / 20]));
    const result = personalizePapers(items, scores);
    expect(result.slice(0, 5).map((item) => item.key)).toEqual(["19", "18", "17", "0", "1"]);
    expect(result.slice(5, 10).map((item) => item.key)).toEqual(["16", "15", "14", "2", "3"]);
    expect(new Set(result.map((item) => item.key)).size).toBe(20);
    expect(items[0].key).toBe("0");
  });
  it("keeps baseline order without strong affinity and handles missing scores", () => {
    expect(personalizePapers(items, {})).toEqual(items);
    expect(personalizePapers(items, { "19": 0.5 })).toEqual(items);
  });
  it("preserves source balance and never adds outside candidates", () => {
    const mixed = items.map((item, i) => ({ ...item, source: i % 2 ? "arxiv" : "huggingface" } as FeedItem));
    const result = personalizePapers(mixed, { "18": 0.99, "19": 0.98, outside: 1 });
    expect(result.map((item) => item.source)).toEqual(mixed.map((item) => item.source));
    expect(new Set(result.map((item) => item.key))).toEqual(new Set(mixed.map((item) => item.key)));
  });
});
