import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("@/lib/sources/http", () => ({ fetchPage: vi.fn(async () => ({ html: '<blockquote class="abstract">Research abstract</blockquote>' })) }));
import { rankInterests } from "./jev";
afterEach(() => vi.unstubAllGlobals());
describe("Jev interest evaluation", () => {
  it("sends typed topical questions and reads noul answers", async () => {
    const fetchMock = vi.fn(async () => Response.json({ answers: { p0: { type: "noul", noul: 0.85 } } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await rankInterests([{ key: "arxiv:2611.12345", title: "Candidate" }], [{ key: "arxiv:2611.12346", title: "Favorite" }]);
    expect(result).toEqual({ "arxiv:2611.12345": 0.85 });
    const request = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(request.questions.p0.type).toBe("noul");
    expect(request.state.saved[0].abstract).toBe("Research abstract");
  });
  it("rejects malformed or missing answers so the caller can fall back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ answers: { p0: { type: "noul", noul: 3 } } })));
    await expect(rankInterests([{ key: "arxiv:2611.12345", title: "Candidate" }], [])).rejects.toThrow("Risposta Jev non valida");
  });
});
