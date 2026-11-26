"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PaperQuality } from "./model";

const EMPTY: ReadonlyMap<string, PaperQuality> = new Map();

export function useScreening(keys: string[], categories: readonly string[], enabled: boolean, signedIn: boolean, freshness: string) {
  const [papers, setPapers] = useState<ReadonlyMap<string, PaperQuality>>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const completed = useRef(new Map<string, string>());
  const inFlight = useRef<{ scope: string; promise: Promise<void> } | null>(null);
  const signature = keys.join(",");
  const selection = categories.join(",");

  useEffect(() => {
    if (!enabled || !signedIn || !signature) return;
    let live = true;
    async function run() {
      await Promise.resolve();
      if (!live) return;
      setRunning(true);
      setError(null);
      const scope = `${selection}|${freshness}`;
      const requested = signature.split(",");
      // Only the batch the page asked for. Raising the limit also reuses the
      // request already started, instead of aborting it and resending the same PDFs.
      try {
        if (inFlight.current?.scope === scope) await inFlight.current.promise;
        for (let index = 0; index < requested.length && live; index += 2) {
          const batch = requested.slice(index, index + 2).filter((key) => completed.current.get(key) !== scope);
          if (!batch.length) continue;
          const promise = (async () => {
            const response = await fetch("/api/papers/screen", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ keys: batch, categories: selection ? selection.split(",") : [] }),
              signal: AbortSignal.timeout(185_000),
            });
            const body = await response.json() as { papers?: PaperQuality[]; error?: string };
            if (!response.ok || !Array.isArray(body.papers)) throw new Error(body.error ?? "Scrematura non disponibile.");
            for (const paper of body.papers) completed.current.set(paper.key, scope);
            // A batch already received from the server may finish even with screening off.
            // Keep its results without starting other PDFs outside the page.
            setPapers((current) => {
              const next = new Map(current);
              for (const paper of body.papers!) {
                const existing = next.get(paper.key);
                if (!existing || Date.parse(paper.checkedAt) >= Date.parse(existing.checkedAt)) next.set(paper.key, paper);
              }
              return next;
            });
          })();
          inFlight.current = { scope, promise };
          try { await promise; }
          finally { if (inFlight.current?.promise === promise) inFlight.current = null; }
        }
      } catch (error) {
        if (live) setError(error instanceof Error ? error.message : "Scrematura non disponibile.");
      }
      if (live) setRunning(false);
    }
    void run();
    return () => { live = false; };
  }, [signature, selection, enabled, signedIn, freshness, attempt]);

  return { papers, error, running: enabled && signedIn && Boolean(signature) && running, retry };
}
