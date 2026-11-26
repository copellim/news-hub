import "server-only";

import { USER_AGENT } from "@/lib/config";

/** Each source fails on its own: the error says who and why, without bubbling up to the page. */
export class SourceError extends Error {
  constructor(source: string, detail: string) {
    super(`${source}: ${detail}`);
    this.name = "SourceError";
  }
}

const SOURCE_TIMEOUT_MS = 15_000;

/** An article page that does not arrive within 10 s is not worth the wait in the card. */
const PAGE_TIMEOUT_MS = 10_000;

/** Beyond this size it is not an article: it is a dump, an app or an error. */
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

/** Any web page, with the address it ended up at after the redirects. */
export type FetchedPage = {
  /** Base for making relative links absolute. */
  finalUrl: string;
  contentType: string;
  /** `null` when the response is not HTML: a PDF, an image, a video. */
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
  const bytes = await readLimitedBytes(source, response, MAX_PAGE_BYTES);
  return { ...page, html: new TextDecoder().decode(bytes) };
}

/** A binary file, e.g. a paper's PDF, with a cap on the size. */
export async function fetchBytes(
  source: string,
  url: string,
  maxBytes: number,
): Promise<Buffer> {
  const response = await fetchWithUserAgent(source, url, {}, SOURCE_TIMEOUT_MS);
  return readLimitedBytes(source, response, maxBytes);
}

/** Reads the body in chunks and stops at the cap, instead of downloading everything and then discarding it. */
async function readLimitedBytes(
  source: string,
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  if (!response.body) {
    return Buffer.alloc(0);
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
    if (size > maxBytes) {
      await reader.cancel();
      throw new SourceError(source, `file oltre ${maxBytes} byte su ${response.url}`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
