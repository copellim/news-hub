"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  Discussion,
  PaperDigest,
  ReaderArticle,
  ReaderPart,
} from "@/lib/reader-model";

export type ReaderLoad<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; message: string };

/**
 * One request per part and key for the whole visit: reopening the same
 * card does not hit the network again. The promise is kept, so two close openings
 * share the same request. An error leaves the cache and can be retried.
 */
const requests = new Map<string, Promise<unknown>>();

export function useReaderArticle(key: string | null) {
  return useReaderPart<ReaderArticle>("article", key);
}

export function useReaderDiscussion(key: string | null) {
  return useReaderPart<Discussion>("discussion", key);
}

/** `key` null: the part is not needed (a self-post has no article), no network. */
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

export type DigestState =
  | { status: "checking" }
  | { status: "missing" }
  | { status: "generating" }
  | { status: "ready"; digest: PaperDigest }
  | { status: "error"; message: string };

/**
 * The whole-paper summary: on opening it checks whether someone has already
 * generated it; otherwise a button remains, because every generation is paid for.
 */
export function usePaperDigest(key: string) {
  const [state, setState] = useState<DigestState>({ status: "checking" });

  useEffect(() => {
    let isCurrent = true;
    fetchDigest(key, "GET").then(
      (digest) => {
        if (isCurrent) {
          setState(digest ? { status: "ready", digest } : { status: "missing" });
        }
      },
      (error: unknown) => {
        if (isCurrent) {
          // Without knowing whether it exists, the button stays: at worst it rereads the saved one.
          console.error("Riassunto del paper non letto", error);
          setState({ status: "missing" });
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [key]);

  const generate = useCallback(async () => {
    setState({ status: "generating" });
    try {
      const digest = await fetchDigest(key, "POST");
      setState(
        digest
          ? { status: "ready", digest }
          : { status: "error", message: "Nessun testo ricevuto" },
      );
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [key]);

  return { state, generate };
}

async function fetchDigest(
  key: string,
  method: "GET" | "POST",
): Promise<PaperDigest | null> {
  const response = await fetch(
    `/api/reader/digest?key=${encodeURIComponent(key)}`,
    { method },
  );
  if (!response.ok) {
    throw new Error(await errorMessageOf(response));
  }
  return ((await response.json()) as { digest: PaperDigest | null }).digest;
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
