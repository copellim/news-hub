import "server-only";

import { readLatestBlobText, updateBlobText } from "@/lib/blob-store";

/**
 * The whole-paper summary lives in one file per paper, shared by all users,
 * and not in the list's `summaries.jsonl`: that file is downloaded whole
 * every time Papers is opened, and a few hundred words per paper would
 * bloat it with texts read only by opening the card. Here only the open
 * paper is read, and it is written once per paper, on request.
 */
const DIGEST_CONTENT_TYPE = "application/json";

export type PaperDigestRecord = {
  key: string;
  text: string;
  model: string;
  /** Changes when the prompt changes: an old summary can be regenerated. */
  promptVersion: number;
  createdAt: string;
};

/**
 * From the origin and not the CDN: a summary just saved must appear at the
 * next opening, not a minute later. It is read once per card.
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
