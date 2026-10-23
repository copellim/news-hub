import "server-only";

import type { PaperDigest } from "@/lib/reader-model";
import {
  readPaperDigest,
  savePaperDigest,
  type PaperDigestRecord,
} from "./digest-store";
import { DIGEST_PROMPT_VERSION, digestPaper } from "./generate";

/** Il riassunto salvato, se è stato scritto con il prompt attuale. */
export async function findPaperDigest(
  arxivId: string,
): Promise<PaperDigest | null> {
  const record = await readPaperDigest(arxivId);
  return isCurrent(record) ? toDigest(record) : null;
}

/**
 * Lo genera e lo salva, a meno che nel frattempo non ci sia già: due schede, o
 * un doppio click, non lo pagano due volte.
 */
export async function createPaperDigest(arxivId: string): Promise<PaperDigest> {
  const stored = await findPaperDigest(arxivId);
  if (stored) {
    return stored;
  }
  const record = await digestPaper(arxivId);
  await savePaperDigest(arxivId, record);
  return toDigest(record);
}

function isCurrent(
  record: PaperDigestRecord | null,
): record is PaperDigestRecord {
  return record?.promptVersion === DIGEST_PROMPT_VERSION;
}

function toDigest(record: PaperDigestRecord): PaperDigest {
  return { text: record.text, model: record.model, createdAt: record.createdAt };
}
