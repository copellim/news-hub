"use client";
import { useEffect, useState } from "react";

export function useInterest(keys: string[], categories: readonly string[], favorites: string, enabled: boolean) {
  const [result, setResult] = useState<{ scope: string; scores: Record<string, number>; error: string | null; running: boolean }>({ scope: "", scores: {}, error: null, running: false });
  const signature = JSON.stringify(keys);
  const selection = JSON.stringify(categories);
  const scope = `${signature}|${selection}|${favorites}`;
  useEffect(() => {
    if (!enabled || !favorites || signature === "[]") return;
    let live = true;
    const controller = new AbortController();
    async function run() {
      await Promise.resolve();
      if (!live) return;
      setResult({ scope, scores: {}, error: null, running: true });
      try {
        const requested = JSON.parse(signature) as string[];
        const scores: Record<string, number> = {};
        for (let i = 0; i < requested.length && live; i += 16) {
          let body;
          for (let attempt = 0; ; attempt++) {
            const response = await fetch("/api/papers/interest", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ keys: requested.slice(i, i + 16), categories: JSON.parse(selection), favorites }),
              signal: controller.signal,
            });
            body = await response.json();
            if (body.retry && attempt < 5) {
              await new Promise((resolve) => setTimeout(resolve, 1500));
              if (!live) return;
              continue;
            }
            if (!response.ok) throw new Error(body.error ?? "Personalizzazione non disponibile.");
            break;
          }
          Object.assign(scores, body.scores);
        }
        if (live) setResult({ scope, scores, error: null, running: false });
      } catch (error) {
        if (live) setResult({ scope, scores: {}, error: error instanceof Error ? error.message : "Personalizzazione non disponibile.", running: false });
      }
    }
    void run();
    return () => { live = false; controller.abort(); };
  }, [signature, selection, favorites, enabled, scope]);
  return enabled && result.scope === scope ? result : { scores: {}, error: null, running: false };
}
