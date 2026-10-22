"use client";

import { useEffect, useRef, useState } from "react";

import { generatePaperSummaries, readPaperSummaries } from "@/app/actions";

/** Deve restare allineato a `MAX_KEYS_PER_GENERATION` della Server Action. */
const GENERATION_BATCH_SIZE = 8;

/**
 * Riassunti dei paper visibili. Prima legge quelli già pronti, poi, se
 * `canGenerate`, chiede quelli mancanti a lotti, uno dopo l'altro: così i
 * primi compaiono subito e un solo lotto alla volta riscrive il file su Blob.
 *
 * Ogni chiave si chiede una volta sola per visita, anche se la lista cambia
 * per un filtro: tornare indietro non ripete le chiamate.
 */
export function usePaperSummaries(
  keys: readonly string[],
  categories: readonly string[],
  canGenerate: boolean,
) {
  const [summaries, setSummaries] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const knownSummaries = useRef(new Map<string, string>());
  const readKeys = useRef(new Set<string>());
  const generationKeys = useRef(new Set<string>());

  // Le dipendenze sono stringhe: gli array cambiano identità a ogni render.
  const keysSignature = keys.join("|");
  const categoriesSignature = categories.join(",");

  useEffect(() => {
    const visibleKeys = keysSignature ? keysSignature.split("|") : [];
    const selectedCategories = categoriesSignature
      ? categoriesSignature.split(",")
      : [];

    function remember(found: Record<string, string>) {
      if (Object.keys(found).length === 0) {
        return;
      }
      for (const [key, text] of Object.entries(found)) {
        knownSummaries.current.set(key, text);
      }
      setSummaries(new Map(knownSummaries.current));
    }

    function setPending(batch: readonly string[], isPending: boolean) {
      if (batch.length === 0) {
        return;
      }
      setPendingKeys((current) => {
        const next = new Set(current);
        batch.forEach((key) =>
          isPending ? next.add(key) : next.delete(key),
        );
        return next;
      });
    }

    async function generateMissing() {
      const missing = visibleKeys.filter(
        (key) =>
          !knownSummaries.current.has(key) && !generationKeys.current.has(key),
      );
      missing.forEach((key) => generationKeys.current.add(key));
      // Tutti in attesa da subito, non solo il lotto in corso: le Server Action
      // girano una alla volta, e gli ultimi lotti partono dopo parecchi secondi.
      setPending(missing, true);

      for (let start = 0; start < missing.length; start += GENERATION_BATCH_SIZE) {
        const batch = missing.slice(start, start + GENERATION_BATCH_SIZE);
        try {
          remember(await generatePaperSummaries(batch, selectedCategories));
        } catch (error) {
          console.error("Riassunti non generati", error);
        } finally {
          setPending(batch, false);
        }
      }
    }

    async function load() {
      const unread = visibleKeys.filter((key) => !readKeys.current.has(key));
      unread.forEach((key) => readKeys.current.add(key));
      if (unread.length > 0) {
        try {
          remember(await readPaperSummaries(unread));
        } catch (error) {
          console.error("Riassunti non letti", error);
        }
      }
      if (canGenerate) {
        await generateMissing();
      }
    }

    void load();
  }, [keysSignature, categoriesSignature, canGenerate]);

  return { summaries, pendingKeys };
}
