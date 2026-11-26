import { beforeEach, expect, it, vi } from "vitest";
import { getHuggingFaceSnapshot } from "./huggingface";
import { fetchJson } from "./http";
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("./http", () => ({ fetchJson: vi.fn() }));
function papers(start: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({ publishedAt: '2026-11-03T00:00:00Z', paper: { id: `2611.${String(start + i).padStart(5, '0')}`, title: `Paper ${i}`, upvotes: 0, authors: [], githubRepo: null, ai_keywords: [], summary: '', ai_summary: '' }, numComments: 0 }));
}
beforeEach(() => vi.mocked(fetchJson).mockReset());
it("tops up from previous days until there are at least 20 distinct papers", async () => {
  vi.mocked(fetchJson).mockResolvedValueOnce(papers(1, 10)).mockResolvedValueOnce(papers(1, 10)).mockResolvedValueOnce(papers(11, 15));
  const snapshot = await getHuggingFaceSnapshot();
  expect(snapshot.items).toHaveLength(25);
  expect(snapshot.notice).toContain('giorni precedenti');
  expect(fetchJson).toHaveBeenCalledTimes(3);
});
it("makes no historical requests if the current day already has at least 20 candidates", async () => {
  vi.mocked(fetchJson).mockResolvedValueOnce(papers(1, 50));
  expect((await getHuggingFaceSnapshot()).items).toHaveLength(50);
  expect(fetchJson).toHaveBeenCalledTimes(1);
});

it("uses the previous days even if the current selection does not respond", async () => {
  vi.mocked(fetchJson).mockRejectedValueOnce(new Error('HTTP 503')).mockResolvedValueOnce(papers(1, 20));
  expect((await getHuggingFaceSnapshot()).items).toHaveLength(20);
  expect(fetchJson).toHaveBeenCalledTimes(2);
});
