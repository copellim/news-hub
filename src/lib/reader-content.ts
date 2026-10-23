"use client";

import { useCallback, useEffect, useState } from "react";

import type { Discussion, ReaderArticle, ReaderPart } from "@/lib/reader-model";

export type ReaderLoad<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; message: string };

/**
 * Una richiesta per parte e chiave per tutta la visita: riaprire la stessa
 * card non rifà la rete. Si conserva la promessa, così due aperture ravvicinate
 * condividono la stessa richiesta. Un errore esce dalla cache e si può riprovare.
 */
const requests = new Map<string, Promise<unknown>>();

export function useReaderArticle(key: string | null) {
  return useReaderPart<ReaderArticle>("article", key);
}

export function useReaderDiscussion(key: string | null) {
  return useReaderPart<Discussion>("discussion", key);
}

/** `key` null: la parte non serve (una self-post non ha articolo), niente rete. */
function useReaderPart<T>(part: ReaderPart, key: string | null) {
  const requestKey = key === null ? null : `${part}:${key}`;
  const [results, setResults] = useState<ReadonlyMap<string, ReaderLoad<T>>>(
    () => new Map(),
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (requestKey === null || key === null) {
      return;
    }
    let isCurrent = true;
    const remember = (load: ReaderLoad<T>) => {
      if (isCurrent) {
        setResults((current) => new Map(current).set(requestKey, load));
      }
    };
    requestOnce<T>(part, key, requestKey).then(
      (value) => remember({ status: "ready", value }),
      (error: unknown) =>
        remember({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
    );
    return () => {
      isCurrent = false;
    };
  }, [part, key, requestKey, attempt]);

  const retry = useCallback(() => {
    if (requestKey === null) {
      return;
    }
    requests.delete(requestKey);
    setResults((current) => {
      const next = new Map(current);
      next.delete(requestKey);
      return next;
    });
    setAttempt((count) => count + 1);
  }, [requestKey]);

  const load: ReaderLoad<T> | null =
    requestKey === null
      ? null
      : (results.get(requestKey) ?? { status: "loading" });
  return { load, retry };
}

function requestOnce<T>(
  part: ReaderPart,
  key: string,
  requestKey: string,
): Promise<T> {
  let request = requests.get(requestKey) as Promise<T> | undefined;
  if (!request) {
    request = fetchPart<T>(part, key);
    requests.set(requestKey, request);
    request.catch(() => requests.delete(requestKey));
  }
  return request;
}

async function fetchPart<T>(part: ReaderPart, key: string): Promise<T> {
  const response = await fetch(
    `/api/reader/${part}?key=${encodeURIComponent(key)}`,
  );
  if (!response.ok) {
    throw new Error(await errorMessageOf(response));
  }
  return (await response.json()) as T;
}

async function errorMessageOf(response: Response): Promise<string> {
  try {
    const { error } = (await response.json()) as { error?: string };
    return error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
