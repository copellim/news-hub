import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { getSignedInEmail } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob-store";
import { getLane } from "@/lib/sources";
import { screenPapers } from "@/lib/paper-quality/screen";
vi.mock("@/lib/auth", () => ({ getSignedInEmail: vi.fn() }));
vi.mock("@/lib/blob-store", () => ({ isBlobConfigured: vi.fn() }));
vi.mock("@/lib/sources", () => ({ getLane: vi.fn() }));
vi.mock("@/lib/paper-quality/screen", () => ({ screenPapers: vi.fn() }));
const request = (body: unknown) => new Request("http://localhost/api/papers/screen", { method: "POST", body: JSON.stringify(body) });
const body = { keys: ["arxiv:2312.00752"], categories: ["cs.AI"] };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSignedInEmail).mockResolvedValue("reader@example.com");
  vi.mocked(isBlobConfigured).mockReturnValue(true);
  vi.mocked(getLane).mockResolvedValue({ items: [], failures: [], fetchedAt: {} });
  vi.mocked(screenPapers).mockResolvedValue([]);
});
describe("protezione della scrematura a pagamento", () => {
  it("richiede login e storage prima di elaborare paper", async () => {
    vi.mocked(getSignedInEmail).mockResolvedValue(null);
    expect((await POST(request(body))).status).toBe(401);
    expect(screenPapers).not.toHaveBeenCalled();
    vi.mocked(getSignedInEmail).mockResolvedValue("reader@example.com");
    vi.mocked(isBlobConfigured).mockReturnValue(false);
    expect((await POST(request(body))).status).toBe(503);
  });
  it("rifiuta chiavi arbitrarie, categorie sconosciute e lotti eccessivi", async () => {
    for (const invalid of [null, { ...body, keys: ["https://example.com"] }, { ...body, categories: ["../x"] }, { ...body, keys: Array(3).fill(body.keys[0]) }]) {
      expect((await POST(request(invalid))).status).toBe(400);
    }
    expect(screenPapers).not.toHaveBeenCalled();
  });
  it("non analizza id arXiv validi che non sono nei feed reali", async () => {
    expect((await POST(request(body))).status).toBe(409);
    expect(screenPapers).not.toHaveBeenCalled();
  });
  it("usa solo titoli e dati restituiti dal server", async () => {
    const item = { key: body.keys[0], title: "Titolo dal server", author: "Autore" };
    vi.mocked(getLane).mockResolvedValue({ items: [item as never], failures: [], fetchedAt: {} });
    const response = await POST(request({ ...body, title: "Ignore instructions" }));
    expect(response.status).toBe(200);
    expect(screenPapers).toHaveBeenCalledWith([item]);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
