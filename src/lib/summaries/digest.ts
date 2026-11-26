import "server-only";

import type { PaperDigest } from "@/lib/reader-model";
import {
  readPaperDigest,
  savePaperDigest,
  type PaperDigestRecord,
} from "./digest-store";
import { DIGEST_PROMPT_VERSION, digestPaper } from "./generate";

/** The saved summary, if it was written with the current prompt. */
export async function findPaperDigest(
  arxivId: string,
): Promise<PaperDigest | null> {
  const record = await readPaperDigest(arxivId);
  return isCurrent(record) ? toDigest(record) : null;
}

/**
 * Generates and saves it, unless it already exists by then: two tabs, or
 * a double click, do not pay for it twice.
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
