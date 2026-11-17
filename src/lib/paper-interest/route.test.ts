import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getSignedInEmail: vi.fn() }));
vi.mock("@/lib/blob-store", () => ({ isBlobConfigured: () => true }));
vi.mock("@/lib/sources", () => ({ getLane: vi.fn() }));
vi.mock("@/lib/user-settings", () => ({ readUserSettings: vi.fn() }));
vi.mock("./jev", () => ({ rankInterests: vi.fn() }));
import { POST } from "@/app/api/papers/interest/route";
import { getSignedInEmail } from "@/lib/auth";
import { getLane } from "@/lib/sources";
import { readUserSettings } from "@/lib/user-settings";
import { rankInterests } from "./jev";
import { DEFAULT_SETTINGS } from "@/lib/settings-model";
const request = (keys = ["arxiv:2611.12345"]) => new Request("https://example.test/api/papers/interest", { method: "POST", body: JSON.stringify({ keys, categories: ["cs.AI"] }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  vi.mocked(getSignedInEmail).mockResolvedValue("reader@example.test");
  vi.mocked(readUserSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, bookmarks: [{ key: "arxiv:2611.12346", title: "Saved", source: "arxiv", savedAt: "2026-11-17" } as never] });
});
afterEach(() => vi.unstubAllEnvs());
describe("interest endpoint", () => {
  it("requires authentication before invoking paid work", async () => {
    vi.mocked(getSignedInEmail).mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(rankInterests).not.toHaveBeenCalled();
  });
  it("rejects candidates outside actual feeds", async () => {
    vi.mocked(getLane).mockResolvedValue({ items: [], failures: [], fetchedAt: {} });
    expect((await POST(request())).status).toBe(409);
    expect(rankInterests).not.toHaveBeenCalled();
  });
  it("uses server bookmarks and returns private results", async () => {
    vi.mocked(getLane).mockResolvedValue({ items: [{ key: "arxiv:2611.12345", title: "Candidate" } as never], failures: [], fetchedAt: {} });
    vi.mocked(rankInterests).mockResolvedValue({ "arxiv:2611.12345": 0.9 });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(rankInterests).toHaveBeenCalledWith([{ key: "arxiv:2611.12345", title: "Candidate" }], [{ key: "arxiv:2611.12346", title: "Saved" }]);
  });
  it("falls back without paid calls when there are no saved papers", async () => {
    vi.mocked(readUserSettings).mockResolvedValue(DEFAULT_SETTINGS);
    expect(await (await POST(request())).json()).toEqual({ scores: {} });
    expect(rankInterests).not.toHaveBeenCalled();
  });
  it("waits for optimistic bookmark writes before scoring the new profile", async () => {
    const response = await POST(new Request("https://example.test/api/papers/interest", {
      method: "POST", body: JSON.stringify({ keys: ["arxiv:2611.12345"], categories: ["cs.AI"], favorites: "new profile" }),
    }));
    expect(response.status).toBe(409);
    expect((await response.json()).retry).toBe(true);
    expect(rankInterests).not.toHaveBeenCalled();
  });
  it("rejects oversized batches and invalid categories", async () => {
    expect((await POST(request(Array(17).fill("paper")))).status).toBe(400);
    expect(rankInterests).not.toHaveBeenCalled();
  });
});
