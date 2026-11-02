import "server-only";

import { USER_AGENT } from "@/lib/config";
import type { Evidence, MethodAssessment } from "./model";

/** Only fixed public API hosts. URLs read from a PDF never become arbitrary fetch targets. */
export async function verifyArtifacts(assessment: MethodAssessment): Promise<{ evidence: Evidence[]; warnings: string[] }> {
  const evidence: Evidence[] = [];
  const warnings: string[] = [];
  await Promise.all((assessment.artifacts ?? []).map(async (artifact) => {
    const url = new URL(artifact.url);
    const parts = url.pathname.split("/").filter(Boolean);
    let api: URL | null = null;
    if (url.hostname === "github.com" && parts.length >= 2 && parts.slice(0, 2).every((part) => /^[\w.-]+$/.test(part))) {
      api = new URL(`https://api.github.com/repos/${parts[0]}/${parts[1].replace(/\.git$/, "")}`);
    } else if (url.hostname === "huggingface.co") {
      const dataset = parts[0] === "datasets";
      const repo = dataset ? parts.slice(1, 3) : parts.slice(0, 2);
      if (repo.length === 2 && repo.every((part) => /^[\w.-]+$/.test(part))) {
        api = new URL(`https://huggingface.co/api/${dataset ? "datasets" : "models"}/${repo.join("/")}`);
      }
    } else if (url.hostname === "zenodo.org" && /^records?$/.test(parts[0]) && /^\d+$/.test(parts[1] ?? "")) {
      api = new URL(`https://zenodo.org/api/records/${parts[1]}`);
    }
    if (!api) {
      evidence.push({ label: "Artefatto dichiarato nel PDF", url: artifact.url, detail: `${artifact.kind} · ${artifact.reference}. Disponibilità non verificata automaticamente per questo servizio.` });
      return;
    }
    try {
      const response = await fetch(api, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(8000) });
      if (response.status === 404) {
        evidence.push({ label: "Artefatto non trovato", url: artifact.url, detail: `${artifact.kind} · ${artifact.reference}. La fonte pubblica restituisce 404; il materiale potrebbe essere privato o spostato.` });
        warnings.push("Un artefatto dichiarato nel PDF non è disponibile all'indirizzo indicato.");
      } else if (!response.ok) {
        warnings.push(`Disponibilità di un artefatto non verificabile: HTTP ${response.status}.`);
      } else {
        const data = await response.json() as { size?: number; files?: unknown[]; gated?: boolean | string; private?: boolean };
        const empty = (api.hostname === "api.github.com" && data.size === 0) || (api.hostname === "zenodo.org" && !data.files?.length);
        evidence.push({ label: empty ? "Artefatto senza contenuti" : "Artefatto accessibile", url: artifact.url, detail: `${artifact.kind} · ${artifact.reference}. ${empty ? "Il record pubblico non contiene file utilizzabili." : data.gated || data.private ? "Il record è pubblico ma l'accesso ai file può richiedere autorizzazione." : "Record pubblico disponibile; contenuto e riproduzione dei risultati non sono stati validati."}` });
        if (empty) warnings.push("Un artefatto dichiarato è privo di contenuti verificabili.");
      }
    } catch { warnings.push("Verifica della disponibilità di un artefatto non riuscita."); }
  }));
  return { evidence, warnings };
}
