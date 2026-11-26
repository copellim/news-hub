import "server-only";

import { BlobPreconditionFailedError, get, put } from "@vercel/blob";

/**
 * Access to text files on Vercel Blob (private store). Blob has no append:
 * every change rereads the file and rewrites it whole, and the write is
 * conditional on the ETag that was read, so two concurrent requests do not
 * erase each other.
 *
 * On Vercel authentication goes through OIDC (`BLOB_STORE_ID` + injected token);
 * locally `BLOB_STORE_ID` and `VERCEL_OIDC_TOKEN` from `vercel env pull` are needed.
 */

/** Beyond this many conflicts in a row something is wrong: better to fail. */
const MAX_WRITE_ATTEMPTS = 4;

type BlobText = { text: string; etag: string };

export function isBlobConfigured(): boolean {
  return Boolean(
    process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN,
  );
}

/**
 * Read from the CDN: fast and free when the file is cached. After an
 * overwrite it can return the previous version for about a minute,
 * so it is fine only for showing data, not for rewriting it.
 */
export async function readCachedBlobText(
  pathname: string,
): Promise<string | null> {
  return (await readBlob(pathname, { useCache: true }))?.text ?? null;
}

export async function readLatestBlobText(
  pathname: string,
): Promise<string | null> {
  return (await readBlob(pathname, { useCache: false }))?.text ?? null;
}

/**
 * Rewrites the file with what `transform` returns, always starting from the
 * most recent version. If someone else has written in the meantime, the
 * `put` fails on the ETag and it starts over with the new content.
 *
 * The first save, while the file is still missing, has no ETag to compare:
 * two simultaneous first writes can overwrite each other. It happens once per
 * file and the damage is a summary or a click to redo.
 */
export async function updateBlobText(
  pathname: string,
  contentType: string,
  transform: (current: string | null) => string,
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const current = await readBlob(pathname, { useCache: false });
    const next = transform(current?.text ?? null);
    if (current && next === current.text) {
      // Nothing to write: every `put` uses up Blob's monthly quota.
      return next;
    }
    try {
      await put(pathname, next, {
        access: "private",
        contentType,
        allowOverwrite: true,
        ifMatch: current?.etag,
      });
      return next;
    } catch (error) {
      if (
        !(error instanceof BlobPreconditionFailedError) ||
        attempt >= MAX_WRITE_ATTEMPTS
      ) {
        throw error;
      }
    }
  }
}

/**
 * The read from the origin is the one that precedes a write, so its ETag
 * must be the strong one. If the response arrives compressed (brotli, for
 * a JSONL of a few KB) the ETag becomes weak, `W/"…"`, and `put` with `ifMatch`
 * always rejects it as "ETag mismatch": without compression it stays strong.
 */
async function readBlob(
  pathname: string,
  options: { useCache: boolean },
): Promise<BlobText | null> {
  const result = await get(pathname, {
    access: "private",
    useCache: options.useCache,
    headers: options.useCache ? undefined : { "accept-encoding": "identity" },
  });
  if (!result || result.statusCode !== 200) {
    return null;
  }
  return {
    text: await new Response(result.stream).text(),
    etag: result.blob.etag,
  };
}
