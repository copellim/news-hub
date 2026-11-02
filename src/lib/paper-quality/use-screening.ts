"use client";

import { useCallback, useEffect, useState } from "react";
import type { PaperQuality } from "./model";

const EMPTY: ReadonlyMap<string, PaperQuality> = new Map();

export function useScreening(keys: string[], categories: readonly string[], enabled: boolean, signedIn: boolean, freshness: string) {
  const [papers, setPapers] = useState<ReadonlyMap<string, PaperQuality>>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const signature = keys.join(",");
  const selection = categories.join(",");

  useEffect(() => {
    if (!enabled || !signedIn || !signature) return;
    const controller = new AbortController();
    let live = true;
    async function run() {
      await Promise.resolve();
      if (!live) return;
      setRunning(true);
      setError(null);
      const requested = signature.split(",");
      // Two PDFs at a time: bounded costs/concurrency, incremental results, no long server action queue.
      for (let index = 0; index < requested.length && live; index += 2) {
        try {
          const response = await fetch("/api/papers/screen", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ keys: requested.slice(index, index + 2), categories: selection ? selection.split(",") : [] }),
            signal: controller.signal,
          });
          const body = await response.json() as { papers?: PaperQuality[]; error?: string };
          if (!response.ok || !Array.isArray(body.papers)) throw new Error(body.error ?? "Scrematura non disponibile.");
          if (!live) return;
          setPapers((current) => new Map([...current, ...body.papers!.map((paper) => [paper.key, paper] as const)]));
        } catch (error) {
          if (live) setError(error instanceof Error ? error.message : "Scrematura non disponibile.");
          break;
        }
      }
      if (live) setRunning(false);
    }
    void run();
    return () => { live = false; controller.abort(); };
  }, [signature, selection, enabled, signedIn, freshness, attempt]);

  return { papers, error, running: enabled && signedIn && running, retry };
}
