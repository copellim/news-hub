import { describe, expect, it, vi } from "vitest";
import { verifyArtifacts } from "./artifacts";
import type { MethodAssessment } from "./model";
const assessment = (url: string): MethodAssessment => ({ version: 1, assessedAt: "2026-11-02T00:00:00Z", kind: "empirical", contribution: "Code", checks: [], artifacts: [{ url, kind: "code", reference: "Sezione 5" }] });
describe("artifact availability", () => {
  it("does not fetch arbitrary or internal URLs found in the PDF", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const result = await verifyArtifacts(assessment("https://127.0.0.1/private"));
    expect(fetch).not.toHaveBeenCalled();
    expect(result.evidence[0].detail).toContain("non verificata");
  });
  it("queries the repository API, without certifying that the code runs", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ size: 120 })); vi.stubGlobal("fetch", fetch);
    const result = await verifyArtifacts(assessment("https://github.com/owner/repo/tree/main"));
    expect(fetch.mock.calls[0][0].href).toBe("https://api.github.com/repos/owner/repo");
    expect(result.evidence[0].label).toBe("Artefatto accessibile");
    expect(result.evidence[0].detail).toContain("non sono stati validati");
  });
  it("distinguishes empty repositories, not found and rate limit", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ size: 0 })); vi.stubGlobal("fetch", fetch);
    expect((await verifyArtifacts(assessment("https://github.com/owner/repo"))).evidence[0].label).toBe("Artefatto senza contenuti");
    fetch.mockResolvedValue(new Response("", { status: 404 }));
    expect((await verifyArtifacts(assessment("https://github.com/owner/repo"))).evidence[0].label).toBe("Artefatto non trovato");
    fetch.mockResolvedValue(new Response("", { status: 429 }));
    const limited = await verifyArtifacts(assessment("https://github.com/owner/repo"));
    expect(limited.evidence).toEqual([]);
    expect(limited.warnings[0]).toContain("429");
  });
});
