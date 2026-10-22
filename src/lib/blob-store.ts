import "server-only";

import { BlobPreconditionFailedError, get, put } from "@vercel/blob";

/**
 * Accesso ai file di testo su Vercel Blob (store privato). Blob non ha un
 * append: ogni modifica rilegge il file e lo riscrive intero, e la scrittura è
 * condizionata all'ETag letto, così due richieste concorrenti non si
 * cancellano a vicenda.
 *
 * Su Vercel l'autenticazione passa da OIDC (`BLOB_STORE_ID` + token iniettato);
 * in locale servono `BLOB_STORE_ID` e `VERCEL_OIDC_TOKEN` da `vercel env pull`.
 */

/** Oltre questo numero di conflitti di fila qualcosa non va: meglio fallire. */
const MAX_WRITE_ATTEMPTS = 4;

type BlobText = { text: string; etag: string };

export function isBlobConfigured(): boolean {
  return Boolean(
    process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN,
  );
}

/**
 * Lettura dalla CDN: veloce e gratuita quando il file è in cache. Dopo una
 * sovrascrittura può restituire la versione precedente per circa un minuto,
 * quindi va bene solo per mostrare dati, non per riscriverli.
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
 * Riscrive il file con quello che restituisce `transform`, partendo sempre
 * dalla versione più recente. Se nel frattempo qualcun altro ha scritto, il
 * `put` fallisce sull'ETag e si riparte da capo con il contenuto nuovo.
 *
 * Il primo salvataggio, a file ancora assente, non ha un ETag da confrontare:
 * due prime scritture simultanee possono sovrascriversi. Succede una volta per
 * file e il danno è un riassunto o un click da rifare.
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
      // Niente da scrivere: ogni `put` consuma la quota mensile di Blob.
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
 * La lettura dall'origine è quella che precede una scrittura, quindi il suo
 * ETag deve essere quello forte. Se la risposta arriva compressa (brotli, per
 * un JSONL di qualche KB) l'ETag diventa debole, `W/"…"`, e `put` con `ifMatch`
 * lo rifiuta sempre come "ETag mismatch": senza compressione resta forte.
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
