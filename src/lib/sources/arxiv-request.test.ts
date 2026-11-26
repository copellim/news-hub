import { expect, it, vi } from "vitest";
import { fetchText } from "./http";
vi.mock("./http", () => ({ fetchText: vi.fn() }));
it("serialises arXiv requests and keeps 3 seconds between starts even after an error", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-03T00:00:00Z'));
  try {
    const starts: number[] = [];
    vi.mocked(fetchText).mockImplementation(async (_source, url) => { starts.push(Date.now()); if (url.endsWith('1')) throw new Error('HTTP 503'); return 'ok'; });
    const { fetchArxivText } = await import('./arxiv-request');
    const pending = Promise.allSettled([fetchArxivText('https://arxiv.org/1'), fetchArxivText('https://arxiv.org/2'), fetchArxivText('https://arxiv.org/3')]);
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.map((x) => x.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(3000);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(3000);
  } finally { vi.useRealTimers(); }
});
