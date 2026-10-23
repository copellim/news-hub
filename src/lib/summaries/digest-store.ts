import "server-only";

import { readLatestBlobText, updateBlobText } from "@/lib/blob-store";

/**
 * Il riassunto del paper intero sta in un file per paper, comune a tutti gli
 * utenti, e non nel `summaries.jsonl` della lista: quel file si scarica intero
 * a ogni apertura di Papers, e qualche centinaio di parole per paper lo
 * gonfierebbe per testi che si leggono solo aprendo la card. Qui si legge solo
 * il paper aperto, e si scrive una volta per paper, a richiesta.
 */
const DIGEST_CONTENT_TYPE = "application/json";

export type PaperDigestRecord = {
  key: string;
  text: string;
  model: string;
  /** Cambia quando cambia il prompt: un riassunto vecchio si può rigenerare. */
  promptVersion: number;
  createdAt: string;
};

/**
 * Dall'origine e non dalla CDN: un riassunto appena salvato deve comparire
 * alla prossima apertura, non un minuto dopo. Si legge una volta per card.
 */
export async function readPaperDigest(
  arxivId: string,
): Promise<PaperDigestRecord | null> {
  const text = await readLatestBlobText(digestPathOf(arxivId));
  if (text === null) {
    return null;
  }
  const record: unknown = JSON.parse(text);
  return isPaperDigestRecord(record) ? record : null;
}

export async function savePaperDigest(
  arxivId: string,
  record: PaperDigestRecord,
): Promise<void> {
  const json = JSON.stringify(record);
  await updateBlobText(digestPathOf(arxivId), DIGEST_CONTENT_TYPE, () => json);
}

function digestPathOf(arxivId: string): string {
  return `paper-digests/${arxivId}.json`;
}

function isPaperDigestRecord(value: unknown): value is PaperDigestRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<PaperDigestRecord>;
  return (
    typeof candidate.key === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.model === "string" &&
    typeof candidate.promptVersion === "number" &&
    typeof candidate.createdAt === "string"
  );
}
