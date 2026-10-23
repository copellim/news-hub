import "server-only";

import { USER_AGENT } from "@/lib/config";

/** Ogni fonte fallisce da sola: l'errore dice chi e perché, senza risalire alla pagina. */
export class SourceError extends Error {
  constructor(source: string, detail: string) {
    super(`${source}: ${detail}`);
    this.name = "SourceError";
  }
}

const SOURCE_TIMEOUT_MS = 15_000;

/** Una pagina d'articolo che non arriva in 10 s non vale l'attesa nella card. */
const PAGE_TIMEOUT_MS = 10_000;

/** Oltre questa dimensione non è un articolo: è un dump, un'app o un errore. */
const MAX_PAGE_BYTES = 5_000_000;

async function fetchWithUserAgent(
  source: string,
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = SOURCE_TIMEOUT_MS,
): Promise<Response> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new SourceError(source, `HTTP ${response.status} su ${url}`);
  }
  return response;
}

export async function fetchJson<T>(
  source: string,
  url: string,
  headers?: Record<string, string>,
): Promise<T> {
  const response = await fetchWithUserAgent(source, url, {
    accept: "application/json",
    ...headers,
  });
  return (await response.json()) as T;
}

export async function fetchText(
  source: string,
  url: string,
  headers?: Record<string, string>,
): Promise<string> {
  const response = await fetchWithUserAgent(source, url, headers);
  return await response.text();
}

/** Una pagina web qualsiasi, con l'indirizzo a cui è arrivata dopo i redirect. */
export type FetchedPage = {
  /** Base per rendere assoluti i link relativi. */
  finalUrl: string;
  contentType: string;
  /** `null` quando la risposta non è HTML: un PDF, un'immagine, un video. */
  html: string | null;
};

export async function fetchPage(
  source: string,
  url: string,
): Promise<FetchedPage> {
  const response = await fetchWithUserAgent(
    source,
    url,
    { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
    PAGE_TIMEOUT_MS,
  );
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const page = { finalUrl: response.url || url, contentType };
  if (!contentType.includes("html")) {
    await response.body?.cancel();
    return { ...page, html: null };
  }
  return { ...page, html: await readLimitedText(source, response) };
}

/** Legge il corpo a pezzi e si ferma al tetto, invece di scaricare tutto e poi scartarlo. */
async function readLimitedText(
  source: string,
  response: Response,
): Promise<string> {
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > MAX_PAGE_BYTES) {
      await reader.cancel();
      throw new SourceError(source, `pagina oltre ${MAX_PAGE_BYTES} byte su ${response.url}`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
