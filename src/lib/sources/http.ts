import "server-only";

import { USER_AGENT } from "@/lib/config";

/** Ogni fonte fallisce da sola: l'errore dice chi e perché, senza risalire alla pagina. */
export class SourceError extends Error {
  constructor(source: string, detail: string) {
    super(`${source}: ${detail}`);
    this.name = "SourceError";
  }
}

async function fetchWithUserAgent(
  source: string,
  url: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, ...headers },
    signal: AbortSignal.timeout(15_000),
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
